import * as THREE from 'three';
import { PART_COUNT, makePose, solvePose } from '../entities/skeleton';
import { gaitPose, idlePose, attackPose } from '../entities/zombieGaits';

// Los muertos de una cinemática: títeres con el mismo cuerpo, la misma ropa
// del mapa y el mismo andar que los zombies de verdad, pero aparte (sus
// propias mallas instanciadas, con las geometrías y los materiales de
// g.zombies: no se compila nada). No son de la partida: ni el anfitrión los
// manda ni al invitado le llegan (cada compu arma los suyos con la escena) y
// no chocan, no pegan ni cuentan. Los mueve quien los usa (ui/LuisonArrival):
//  · lurk: quietos entre la paja (agachados o parados), con los ojos prendidos;
//  · run: corren hasta `to` y ahí pegan (attack);
//  · die: caen (para atrás, para adelante o volando, con el empujón `vel`);
//  · melt: se derriten (el Liquidificador); zap: el rayo los sacude y caen;
//  · dead: quedan tirados.

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const MELT_T = 1.5;
const MELT_COL = new THREE.Color(0x283214);
const HEAD = (1 << 2) | (1 << 13) | (1 << 14) | (1 << 15);
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export default class CineHorde {
  constructor(g, n = 40) {
    this.g = g;
    const Z = g.zombies;
    this.Z = Z;
    this.root = new THREE.Group();
    this.meshes = Z.meshes.map((M) => {
      const im = new THREE.InstancedMesh(M.im.geometry, M.im.material, n * M.parts.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (M.color) for (let i = 0; i < im.count; i++) im.setColorAt(i, tmpC.set(0xffffff));
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
      im.castShadow = false;
      im.frustumCulled = false;
      this.root.add(im);
      return { key: M.key, parts: M.parts, color: M.color, need: M.need, im };
    });
    // la manchita de sombra de cada uno (la de los zombies)
    this.blobs = new THREE.InstancedMesh(Z.blobs.geometry, Z.blobs.material, n);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    for (let i = 0; i < n; i++) this.blobs.setMatrixAt(i, ZERO);
    this.root.add(this.blobs);
    this.list = [];
    for (let i = 0; i < n; i++) {
      this.list.push({
        slot: i,
        active: false,
        P: makePose(),
        mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        to: new THREE.Vector3(),
        colors: {},
        hidden: 0,
      });
    }
    this.idc = 7000;
    g.scene.add(this.root);
  }

  get alive() {
    return this.list.filter((p) => p.active && !p.dead);
  }

  // Uno nuevo en (x, z), mirando a yaw. o: { state, crouch, speedType }.
  spawn(x, z, yaw, o = {}) {
    const p = this.list.find((q) => !q.active) || this.list.find((q) => q.dead && q.state === 'dead');
    if (!p) return null;
    const w = this.g.world;
    p.active = true;
    p.dead = false;
    p.id = ++this.idc;
    p.hidden = 0;
    p.P.melt = 0;
    p.P.rootPitch = 0;
    p.P.rootRoll = 0;
    p.P.rootY = 0;
    p.P.yawOff = 0;
    p.P.rootFwd = 0;
    // la ropa, el tamaño y el andar: como un zombie de verdad con ese id
    this.Z.lookOf(p);
    p.speedType = o.speedType || 'run';
    p.phase = Math.random() * 10;
    p.attackT = 0;
    p.pos.set(x, w.floorAt(x, z), z);
    p.baseY = p.pos.y;
    p.yaw = yaw;
    p.vel.set(0, 0, 0);
    p.crouch = o.crouch ?? 0;
    p.hp = o.hp ?? 1;
    p.from = null;
    p.blendK = 1;
    p.settled = false;
    p.meltC = 0;
    p.flinch = 0;
    p.landed = false;
    p.sink = 0;
    p.face = null;
    p.state = null;
    p.blend = null;
    this.set(p, o.state || 'lurk');
    this.paint(p);
    return p;
  }

  paint(p, c = null) {
    for (const M of this.meshes) {
      if (!M.color) continue;
      tmpC.set(p.colors[M.color]);
      if (c) tmpC.lerp(MELT_COL, c);
      for (let k = 0; k < M.parts.length; k++) M.im.setColorAt(p.slot * M.parts.length + k, tmpC);
      M.im.instanceColor.needsUpdate = true;
    }
  }

  set(p, s) {
    if (p.state === s) return;
    // lo que venía haciendo se mezcla con lo nuevo (salvo al caer: eso lo hace cada caída)
    if (p.state && s !== 'dead') {
      p.blend = { ...p.P };
      p.blendK = 0;
    }
    p.state = s;
    p.st = 0;
  }

  // Corre hasta `to` (x, z) y pega ahí (stop: ahí se queda quieto, mirando).
  run(p, x, z, speed = 4, stop = false) {
    p.to.set(x, 0, z);
    p.speed = speed;
    p.stop = stop;
    p.speedType = speed < 1.5 ? 'walk' : speed > 4.2 ? 'sprint' : 'run';
    this.set(p, 'run');
  }

  // Un golpe que no mata: se sacude para atrás.
  hurt(p, dir) {
    p.flinch = 1;
    p.flinchDir = Math.atan2(dir.x, dir.z) - p.yaw;
  }

  // Cae. how: 'back' (el golpe lo tira para atrás), 'front', 'fly' (volando,
  // la escopeta) o 'head' (sin cabeza). dir: de dónde vino el golpe.
  kill(p, dir, how = 'back', push = 1.5) {
    if (!p.active || p.dead) return;
    const g = this.g;
    p.dead = true;
    p.how = how;
    p.from = { ...p.P };
    p.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(push);
    p.vy = how === 'fly' ? 3.2 : 0;
    p.lift = 0;
    p.landed = false;
    // (de espaldas si el golpe viene de adelante)
    const face = Math.sin(p.yaw) * dir.x + Math.cos(p.yaw) * dir.z;
    p.back = how === 'front' ? false : face < 0.2;
    const chest = tmpV.set(p.pos.x, p.baseY + 1.25 * p.scale, p.pos.z);
    g.fx.blood?.(chest, { x: dir.x, y: 0.25, z: dir.z }, how === 'fly' ? 22 : 12, how === 'fly' ? 1.4 : 1);
    if (how === 'head') {
      p.hidden |= HEAD;
      const head = tmpV.set(p.pos.x, p.baseY + 1.7 * p.scale, p.pos.z);
      g.fx.gib?.(head, { x: dir.x * 3, y: 4, z: dir.z * 3 });
      g.fx.blood?.(head, { x: 0, y: 1, z: 0 }, 16, 1.2);
    }
    this.set(p, 'die');
  }

  melt(p) {
    if (!p.active || p.dead) return;
    p.dead = true;
    p.from = { ...p.P };
    this.set(p, 'melt');
  }

  zap(p, dir) {
    if (!p.active || p.dead) return;
    p.dead = true;
    p.zapDir = dir.clone();
    this.set(p, 'zap');
  }

  free(p) {
    p.active = false;
    p.dead = false;
    for (const M of this.meshes) for (let k = 0; k < M.parts.length; k++) M.im.setMatrixAt(p.slot * M.parts.length + k, ZERO);
    this.blobs.setMatrixAt(p.slot, ZERO);
  }

  clear() {
    for (const p of this.list) if (p.active) this.free(p);
    this.flush();
  }

  // ---------------- cada cuadro ----------------
  update(dt, t) {
    const w = this.g.world;
    for (const p of this.list) {
      if (!p.active) continue;
      p.st += dt;
      const P = p.P;
      switch (p.state) {
        case 'lurk': {
          idlePose(p, t);
          // agachado entre la paja, mirando: se va parando de a poco (crouch 1 a 0)
          const c = p.crouch || 0;
          if (c > 0) {
            P.torsoP += 0.5 * c;
            P.headP -= 0.55 * c;
            P.hipLp -= 1.1 * c;
            P.hipRp -= 0.9 * c;
            P.knL += 1.9 * c;
            P.knR += 1.7 * c;
            P.hipY -= 0.42 * c;
          }
          if (p.face != null) p.yaw = angLerp(p.yaw, p.face, Math.min(1, dt * 2));
          break;
        }
        case 'run': {
          const dx = p.to.x - p.pos.x;
          const dz = p.to.z - p.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.25) {
            this.set(p, p.stop ? 'lurk' : 'attack');
            p.attackT = 0;
            break;
          }
          // arranca de a poco (salen de la paja de un salto) y frena al llegar
          const v = p.speed * Math.min(1, 0.35 + p.st * 2.5) * Math.min(1, 0.3 + d / 1.2);
          const step = Math.min(d, v * dt);
          p.pos.x += (dx / d) * step;
          p.pos.z += (dz / d) * step;
          p.yaw = angLerp(p.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
          gaitPose(p, dt, v, t);
          break;
        }
        case 'attack': {
          p.attackT += dt;
          if (p.attackT > 0.95) p.attackT = 0;
          attackPose(p, t);
          if (p.face != null) p.yaw = angLerp(p.yaw, p.face, Math.min(1, dt * 8));
          break;
        }
        case 'die':
          this.fall(p, dt);
          break;
        case 'melt':
          this.meltStep(p, dt);
          break;
        case 'zap': {
          // sacudido por el rayo, con chispas; después cae
          const j = () => (Math.random() - 0.5) * 0.6;
          P.torsoP = -0.3 + j();
          P.torsoR = j();
          P.headP = -0.5 + j();
          P.headR = j();
          P.shLp = -1.8 + j();
          P.shRp = -1.7 + j();
          P.shLr = 1.1 + j();
          P.shRr = -1.1 + j();
          P.elL = j();
          P.elR = j();
          P.knL = 0.25 + Math.abs(j());
          P.knR = 0.25 + Math.abs(j());
          if (Math.random() < 0.5) this.g.fx.electric(tmpV.set(p.pos.x, p.baseY + 0.4 + Math.random() * 1.3, p.pos.z), 2);
          if (p.st > 0.55) {
            p.dead = false;
            this.kill(p, p.zapDir, 'back', 0.8);
            this.paint(p, 0.55);
          }
          break;
        }
        case 'dead':
          // el estero se los traga de a poco (si no, tapaban todo lo de abajo)
          if (this.sinkAfter != null && p.st > this.sinkAfter) {
            const k = (p.st - this.sinkAfter) / 2.5;
            p.sink = k * 0.5 * (p.scale || 1);
            p.settled = false;
            if (k >= 1) {
              this.free(p);
              p.state = 'gone';
            }
          }
          break;
      }
      // el golpe que no lo tira: la cabeza y el torso para atrás un momento
      if (p.flinch > 0 && !p.dead) {
        p.flinch = Math.max(0, p.flinch - dt * 5);
        const k = Math.sin(p.flinch * Math.PI);
        P.torsoP -= 0.45 * k;
        P.headP -= 0.5 * k;
        P.torsoY += Math.sin(p.flinchDir || 0) * 0.3 * k;
      }
      // de un estado al otro, en 0,2 s
      if (p.blendK < 1 && p.blend) {
        p.blendK = Math.min(1, p.blendK + dt / 0.2);
        const e = ease(p.blendK);
        for (const k in P) {
          const f = p.blend[k];
          if (typeof f === 'number' && typeof P[k] === 'number') P[k] = f + (P[k] - f) * e;
        }
      }
      if (p.state !== 'dead' && p.state !== 'die' && p.state !== 'melt') p.baseY = w.floorAt(p.pos.x, p.pos.z, p.baseY + 0.5);
    }
    this.separate(dt);
    this.render();
  }

  // Que no se encimen los que corren.
  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.active || a.dead || a.state === 'lurk') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.active || b.dead || b.state === 'lurk') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.62 || d < 1e-4) continue;
        const push = ((0.62 - d) / d) * 0.5 * Math.min(1, dt * 12);
        a.pos.x -= dx * push;
        a.pos.z -= dz * push;
        b.pos.x += dx * push;
        b.pos.z += dz * push;
      }
    }
  }

  // La caída: el golpe lo empuja (y a la escopeta la levanta), el cuerpo gira
  // hasta quedar acostado y resbala un poco en el barro.
  fall(p, dt) {
    const g = this.g;
    const P = p.P;
    const f = p.from;
    const dur = p.how === 'fly' ? 0.75 : 0.62;
    const k = clamp01(p.st / dur);
    const e = k * k;
    const back = p.back ? -1 : 1;
    const L = (a, b) => (a ?? b) + (b - (a ?? b)) * e;
    // lo empuja y lo frena el barro
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    const drag = Math.max(0, 1 - dt * (p.how === 'fly' ? 1.8 : 5));
    p.vel.x *= drag;
    p.vel.z *= drag;
    if (p.how === 'fly') {
      p.vy -= 12 * dt;
      p.lift = Math.max(0, p.lift + p.vy * dt);
      if (p.lift <= 0 && p.vy < 0 && !p.landed && p.st > 0.1) {
        p.landed = true;
        g.fx.dust?.(tmpV.set(p.pos.x, p.baseY + 0.05, p.pos.z), { x: 0, y: 1, z: 0 }, [0.2, 0.19, 0.15], 6);
      }
    }
    P.rootPitch = L(f.rootPitch, (Math.PI / 2) * back);
    P.rootY = L(f.rootY, 0.14) + (p.lift || 0);
    P.rootRoll = L(f.rootRoll, (p.slot % 3 - 1) * 0.25);
    P.hipY = L(f.hipY, 0.8);
    P.knL = L(f.knL, back > 0 ? 0.4 : 0.1);
    P.knR = L(f.knR, 0.2);
    P.torsoP = L(f.torsoP, 0.1 * back);
    P.torsoY = L(f.torsoY, 0);
    P.torsoR = L(f.torsoR, 0.1);
    P.shLp = L(f.shLp, back > 0 ? -2.8 : -0.4);
    P.shRp = L(f.shRp, back > 0 ? -2.5 : -0.7);
    P.shLr = L(f.shLr, 0.9);
    P.shRr = L(f.shRr, -0.7);
    P.elL = L(f.elL, -0.3);
    P.elR = L(f.elR, -0.9);
    P.headP = L(f.headP, -0.2 * back);
    P.headR = L(f.headR, 0.6);
    P.hipLp = L(f.hipLp, 0.1);
    P.hipRp = L(f.hipRp, -0.2);
    P.hipLr = L(f.hipLr, 0);
    P.hipRr = L(f.hipRr, 0);
    if (k >= 1 && (p.how !== 'fly' || p.landed) && Math.hypot(p.vel.x, p.vel.z) < 0.05) {
      this.set(p, 'dead');
      // la sangre en el barro, donde quedó
      const fx = back > 0 ? 0.7 : -0.7;
      g.fx.decal?.(1, { x: p.pos.x + Math.sin(p.yaw) * fx, y: p.baseY + 0.02, z: p.pos.z + Math.cos(p.yaw) * fx }, { x: 0, y: 1, z: 0 }, 1.1);
    }
  }

  // Derretido (como Zombies.meltStep): se agarra la cara, se le aflojan las
  // rodillas y se escurre en el charco, del color del barro.
  meltStep(p, dt) {
    const g = this.g;
    const P = p.P;
    const k = clamp01(p.st / MELT_T);
    const f = p.from;
    const grab = ease(k / 0.22);
    const kneel = ease((k - 0.18) / 0.42);
    const ooze = ease((k - 0.3) / 0.62);
    const jit = (1 - ooze) * (0.06 + grab * 0.1);
    const j = () => (Math.random() - 0.5) * jit;
    const T = {
      rootPitch: 0.3 * kneel,
      rootRoll: 0,
      hipY: 0.92 - 0.38 * kneel,
      hipLp: -1.1 * kneel,
      hipRp: -0.9 * kneel,
      hipLr: 0.15 * kneel,
      hipRr: -0.15 * kneel,
      knL: 1.9 * kneel,
      knR: 1.75 * kneel,
      torsoP: -0.18 * grab * (1 - kneel) + 0.75 * kneel + j(),
      torsoR: j(),
      headP: -0.55 * grab * (1 - kneel) + 0.5 * kneel + j(),
      headR: j() * 2,
      shLp: -1.55 * grab * (1 - ooze) - 0.5 * ooze + j(),
      shRp: -1.5 * grab * (1 - ooze) - 0.6 * ooze + j(),
      shLr: -0.18 * grab * (1 - ooze) + 1.1 * ooze,
      shRr: 0.18 * grab * (1 - ooze) - 1.1 * ooze,
      elL: -2.3 * grab * (1 - ooze) - 0.2 * ooze,
      elR: -2.2 * grab * (1 - ooze) - 0.25 * ooze,
    };
    const e = ease(p.st / 0.16);
    for (const key in T) P[key] = (f[key] ?? T[key]) + (T[key] - (f[key] ?? T[key])) * e;
    P.melt = ooze * 0.72;
    P.rootY = -ease((k - 0.4) / 0.6) * 0.8 * (p.scale || 1);
    const c = ease(k / 0.4);
    if (Math.abs(c - p.meltC) > 0.04) {
      p.meltC = c;
      this.paint(p, c);
    }
    if (k < 0.9 && Math.random() < 0.6) {
      const part = [1, 2, 5, 6, 3, 4][Math.floor(Math.random() * 6)];
      tmpV.setFromMatrixPosition(p.mats[part]);
      g.fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4, { color: [0.13, 0.17, 0.08], size: 0.05 + Math.random() * 0.04, size1: 0.02, life: 0.55, alpha: 0.85, gravity: 9 });
    }
    if (Math.random() < 0.2) g.fx.steam(tmpV.set(p.pos.x, p.baseY + 0.3 + (1 - ooze) * 1.1, p.pos.z), 1, 0.5);
    if (k >= 1) {
      this.free(p);
      p.state = 'gone';
    }
  }

  // ---------------- el dibujo ----------------
  render() {
    for (const p of this.list) {
      if (!p.active) continue;
      if (!p.settled) {
        const R = p.P;
        const by = p.baseY || 0;
        const sk = p.state === 'dead' ? p.sink || 0 : 0;
        R.rootY += by - sk;
        const yw = p.yaw + (R.yawOff || 0);
        const fw = R.rootFwd || 0;
        solvePose(p.mats, p.pos.x + Math.sin(yw) * fw, p.pos.z + Math.cos(yw) * fw, yw, p.scale, R);
        R.rootY -= by - sk;
        // (tirado y quieto: ya no hace falta volver a armarlo)
        if (p.state === 'dead') p.settled = true;
      }
      for (const M of this.meshes) {
        const off = M.need && !p.flags?.[M.need];
        for (let k = 0; k < M.parts.length; k++) {
          const part = M.parts[k];
          M.im.setMatrixAt(p.slot * M.parts.length + k, off || p.hidden & (1 << part) ? ZERO : p.mats[part]);
        }
      }
      if (p.dead || (p.state === 'lurk' && p.crouch > 0.5)) this.blobs.setMatrixAt(p.slot, ZERO);
      else this.blobs.setMatrixAt(p.slot, tmpM.makeScale(0.9, 1, 0.9).setPosition(p.pos.x, (p.baseY || 0) + 0.015, p.pos.z));
    }
    this.flush();
  }

  flush() {
    for (const M of this.meshes) M.im.instanceMatrix.needsUpdate = true;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.root.removeFromParent();
    for (const M of this.meshes) M.im.dispose();
    this.blobs.dispose();
  }
}
