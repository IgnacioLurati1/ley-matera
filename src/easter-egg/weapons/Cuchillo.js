import * as THREE from 'three';

// El cuchillo de carnicero de Anacleto (el penal): el "tomahawk" del mapa.
// Ocupa el lugar de la pava (se tira con la T) y vuelve solo a la mano. Sale
// buscando muertos: le pega al primero y salta a los más cercanos (tres; la
// Cuchilla del Matarife, la mejorada, seis y con mucho más daño). Los
// potenciadores que toca en el camino los agarra al toque. Tirado adentro del
// Pack-a-Pava lo recibe el easter egg (PenalEgg.knifeIntoPap). En línea cada
// uno tira el suyo; los demás ven una copia que no lastima.

// cd: cuánto tarda en poder tirarse de nuevo después de volver a la mano
const STATS = [
  { name: 'Cuchillo de Carnicero', hits: 3, dmg: 2600, speed: 30, seek: 7, glow: 0xffb070, cd: 4 },
  { name: 'Cuchilla del Matarife', hits: 6, dmg: 9000, speed: 36, seek: 9.5, glow: 0xff3a2a, cd: 3 },
];
const RANGE = 24;
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const HAND = new THREE.Vector3(0.25, -0.3, -0.4);

export function knifeName(up) {
  return STATS[up ? 1 : 0].name;
}

// La cuchilla: hoja ancha y cuadrada con el agujero para colgarla, mango de
// madera con dos remaches. La hoja va para arriba (+y) y el filo adelante (+z).
export function buildCleaver(up = 0) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: up ? 0x9a3024 : 0xb8bcc0, metalness: 0.9, roughness: 0.32, emissive: up ? 0x6a0c04 : 0x000000, emissiveIntensity: up ? 0.9 : 0 });
  const edge = new THREE.MeshStandardMaterial({ color: up ? 0xffc0a0 : 0xeef2f6, metalness: 1, roughness: 0.12, emissive: up ? 0x5a1a08 : 0x000000 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.35 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.012, 0.2, 0.11), steel, 0, 0.1, 0.02);
  add(new THREE.BoxGeometry(0.008, 0.2, 0.018), edge, 0, 0.1, 0.082);
  add(new THREE.TorusGeometry(0.012, 0.004, 5, 10), brass, 0, 0.17, -0.015, 0, Math.PI / 2, 0);
  add(new THREE.BoxGeometry(0.03, 0.13, 0.034), wood, 0, -0.065, -0.012);
  for (const y of [-0.035, -0.095]) add(new THREE.CylinderGeometry(0.006, 0.006, 0.034, 6), brass, 0, y, -0.012, 0, 0, Math.PI / 2);
  return g;
}

export default class Cuchillo {
  constructor(game) {
    this.g = game;
    // el de la mano (lo usa la animación de tirar de Weapons): uno por mejora
    this.vmRoot = new THREE.Group();
    this.vms = [buildCleaver(0), buildCleaver(1)];
    for (const v of this.vms) {
      v.scale.setScalar(0.62);
      this.vmRoot.add(v);
    }
    this.vmRoot.visible = false;
    game.weapons.vmRoot.add(this.vmRoot);
    this.fly = null;
    this.ghosts = [];
    // enfriamiento: cuando vuelve a la mano no se puede tirar enseguida
    this.cdT = 0;
    // (up) => true si la máquina se lo quedó; lo pone el easter egg
    this.onPap = null;
    // (pos, dir, len) cada tramo de ida: lo que el easter egg quiera que toque
    // (las calaveras del gaucho life, entities/PenalGhosts.js)
    this.onFly = null;
  }

  // El que va en la mano, según la mejora que tenga.
  get vm() {
    const up = this.g.weapons.tactical?.up ? 1 : 0;
    this.vms[0].visible = !up;
    this.vms[1].visible = !!up;
    return this.vmRoot;
  }

  hideVm() {
    this.vmRoot.visible = false;
  }

  makeMesh(up) {
    const m = buildCleaver(up);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: STATS[up].glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
    s.scale.setScalar(0.7);
    s.position.y = 0.08;
    m.add(s);
    m.scale.setScalar(1.35);
    this.g.scene.add(m);
    return m;
  }

  // Lo llama Weapons.throwItem: sale de la mano hacia donde mira la cámara.
  throw(pos) {
    const g = this.g;
    const up = g.weapons.tactical?.up ? 1 : 0;
    const S = STATS[up];
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
    const mesh = this.makeMesh(up);
    mesh.position.copy(pos);
    mesh.lookAt(tmpV.copy(pos).add(dir));
    this.fly = { pos: pos.clone(), vel: dir.clone().multiplyScalar(S.speed), phase: 'out', t: 0, seekT: 0, dist: 0, hit: new Set(), left: S.hits, target: null, up, S, mesh };
    // si hay un muerto adelante (en un cono chico), sale derecho a buscarlo
    const aim = this.coneTarget(pos, dir, 18);
    if (aim) {
      this.fly.phase = 'seek';
      this.fly.target = aim;
    }
    g.audio.swish?.(!!up, 1.3);
    this.share(pos, dir, up);
  }

  // A la altura del pecho (los perros, más abajo).
  chest(z, out) {
    return out.set(z.pos.x, (z.pos.y || 0) + (z.dog ? 0.55 : 1.15 * (z.scale || 1)), z.pos.z);
  }

  sees(from, to) {
    const d = tmpD.copy(to).sub(from);
    const len = d.length();
    if (len < 0.01) return true;
    return this.g.world.raycast(from, d.divideScalar(len), len) >= len - 0.35;
  }

  coneTarget(pos, dir, range) {
    let best = null;
    let bestK = Infinity;
    for (const { z } of this.g.zombies.inRadius(pos, range)) {
      const c = this.chest(z, tmpA);
      const to = tmpV.copy(c).sub(pos);
      const len = to.length();
      const along = to.dot(dir);
      if (along < 1 || along / len < 0.95) continue;
      const k = len * (2 - along / len);
      if (k >= bestK || !this.sees(pos, c)) continue;
      bestK = k;
      best = z;
    }
    return best;
  }

  // El más cercano al punto que todavía no probó el filo.
  nextTarget(from, F) {
    let best = null;
    let bestD = Infinity;
    for (const { z } of this.g.zombies.inRadius(from, F.S.seek)) {
      if (F.hit.has(z)) continue;
      const c = this.chest(z, tmpA);
      const d = c.distanceTo(from);
      if (d >= bestD || !this.sees(from, c)) continue;
      bestD = d;
      best = z;
    }
    return best;
  }

  strike(F, z) {
    const g = this.g;
    F.hit.add(z);
    F.left--;
    const point = this.chest(z, new THREE.Vector3());
    const dir = F.vel.clone().normalize();
    g.zombies.damage(z, F.S.dmg, { type: 'knife', zone: 'torso', point, dir, decap: Math.random() < (F.up ? 0.5 : 0.25), weapon: 'cuchillo' });
    g.audio.knife(true);
    g.fx.addShake(0.03);
    F.target = F.left > 0 ? this.nextTarget(point, F) : null;
    F.phase = F.target ? 'seek' : 'back';
    F.seekT = F.t;
    F.backT = 0;
  }

  handPos(out) {
    return out.copy(HAND).applyQuaternion(this.g.camera.quaternion).add(this.g.camera.position);
  }

  update(dt) {
    if (this.cdT > 0) {
      this.cdT -= dt;
      const t = this.g.weapons.tactical;
      if (this.cdT <= 0 && !this.fly && t?.id === 'cuchillo' && t.count === 0) {
        t.count = 1;
        this.g.weapons.updateHud();
        this.g.audio.knife(false);
      }
    }
    if (this.fly) this.step(this.fly, dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (this.stepGhost(this.ghosts[i], dt)) this.ghosts.splice(i, 1);
  }

  step(F, dt) {
    const g = this.g;
    F.t += dt;
    if (F.phase === 'seek') {
      const z = F.target;
      if (!z || !z.active || z.dead || F.t - F.seekT > 1.4) {
        F.target = z && z.active && !z.dead ? null : this.nextTarget(F.pos, F);
        F.seekT = F.t;
        if (!F.target) F.phase = 'back';
      } else {
        const c = this.chest(z, tmpA);
        if (c.distanceTo(F.pos) < 0.8) {
          this.strike(F, z);
          return;
        }
        F.vel.copy(c).sub(F.pos).normalize().multiplyScalar(F.S.speed * 0.85);
      }
    }
    if (F.phase === 'back') {
      // vuelve a la mano atravesando lo que haya (como el de Alcatraz)
      F.backT = (F.backT || 0) + dt;
      const hand = this.handPos(tmpA);
      const d = hand.distanceTo(F.pos);
      if (d < 0.9 || F.t > 8 || !g.player.alive) {
        this.caught(F);
        return;
      }
      F.vel.copy(hand).sub(F.pos).normalize().multiplyScalar(Math.min(42, F.S.speed * 0.8 + F.backT * 22));
    }
    const len = F.vel.length() * dt;
    const dir = tmpD.copy(F.vel).normalize();
    if (F.phase !== 'back') this.onFly?.(F.pos, dir, len);
    // el Pack-a-Pava antes que la pared (la máquina es una caja sólida)
    if (F.phase !== 'back' && this.checkPap(F, dir, len)) return;
    if (F.phase !== 'back') {
      // de ida: el primer muerto en la línea, o la pared (rebota y vuelve)
      const hits = g.zombies.raycast(F.pos, dir, len + 0.25);
      const h = hits.find((x) => x.z && !F.hit.has(x.z));
      if (h) {
        F.pos.addScaledVector(dir, Math.max(0, h.t - 0.2));
        F.mesh.position.copy(F.pos);
        this.strike(F, h.z);
        return;
      }
      const wall = g.world.raycast(F.pos, dir.clone(), len + 0.1);
      if (wall < len + 0.1) {
        F.pos.addScaledVector(dir, Math.max(0, wall - 0.15));
        g.fx.sparks(F.pos, 0.6, { x: -dir.x, y: 0.3, z: -dir.z });
        g.audio.knife(false);
        F.phase = 'back';
        F.backT = 0;
        F.mesh.position.copy(F.pos);
        return;
      }
    }
    F.pos.addScaledVector(dir, len);
    F.dist += len;
    if (F.phase === 'out' && F.dist > RANGE) {
      F.phase = 'back';
      F.backT = 0;
    }
    F.mesh.position.copy(F.pos);
    F.mesh.rotation.x -= dt * 26;
    if (F.up && Math.random() < 0.5) g.fx.sparkle(F.pos, [1, 0.3, 0.15], 1, 0.12);
    this.grabPowerups(F.pos);
  }

  // Volvió a la mano: se puede tirar de nuevo cuando pasa el enfriamiento.
  caught(F) {
    const g = this.g;
    F.mesh.removeFromParent();
    this.fly = null;
    this.cdT = F.S.cd;
    g.audio.knife(false);
  }

  // El Pack-a-Pava: si el tramo de este cuadro pasa por la máquina y ella se
  // lo queda, el vuelo termina ahí (true); si no lo quiere, rebota y vuelve.
  checkPap(F, dir, len) {
    const pap = this.g.interact?.pap;
    if (!pap || !this.onPap) return false;
    const c = tmpV.copy(pap.group.position);
    c.y += 1.3;
    const along = Math.max(0, Math.min(len, tmpA.copy(c).sub(F.pos).dot(dir)));
    if (tmpA.copy(F.pos).addScaledVector(dir, along).distanceTo(c) > 1.45) return false;
    if (this.onPap(F.up)) {
      F.mesh.removeFromParent();
      this.fly = null;
      return true;
    }
    F.phase = 'back';
    F.backT = 0;
    return true;
  }

  // Los potenciadores que toca: se agarran como si pasara el jugador.
  grabPowerups(pos) {
    const g = this.g;
    const P = g.powerups;
    if (!P?.items?.length) return;
    for (let i = P.items.length - 1; i >= 0; i--) {
      const it = P.items[i];
      if (it.mesh.position.distanceToSquared(pos) > 1.8) continue;
      if (g.net?.guest) g.net.net.send({ t: 'pupget', id: it.id });
      else P.apply(it.type, it.id);
      P.remove(i);
    }
  }

  // Para que los demás vean el cuchillo de uno volando.
  share(pos, dir, up) {
    const g = this.g;
    if (!g.net) return;
    const kt = [...pos.toArray().map((v) => +v.toFixed(2)), ...dir.toArray().map((v) => +v.toFixed(3)), up];
    if (g.net.guest) g.net.net.send({ t: 'pee', a: 'kt', kt });
    else g.net.event('pee', { kt, by: g.net.id });
  }

  // La copia de un compañero: sale derecho un rato y vuelve a su mano.
  ghost(kt, by) {
    if (!Array.isArray(kt) || kt.length !== 7 || !kt.every(Number.isFinite)) return;
    const up = kt[6] ? 1 : 0;
    const pos = new THREE.Vector3(kt[0], kt[1], kt[2]);
    const vel = new THREE.Vector3(kt[3], kt[4], kt[5]).normalize().multiplyScalar(STATS[up].speed);
    const mesh = this.makeMesh(up);
    mesh.position.copy(pos);
    this.ghosts.push({ pos, vel, by, t: 0, mesh });
    this.g.audio.swish?.(!!up, 1.3);
  }

  stepGhost(G, dt) {
    const g = this.g;
    G.t += dt;
    if (G.t > 0.55) {
      const r = g.net?.remote.get(G.by);
      if (!r || G.t > 4) {
        G.mesh.removeFromParent();
        return true;
      }
      tmpA.set(r.pos.x, (r.pos.y || 0) + 1.3, r.pos.z);
      if (tmpA.distanceTo(G.pos) < 0.9) {
        G.mesh.removeFromParent();
        return true;
      }
      G.vel.copy(tmpA).sub(G.pos).normalize().multiplyScalar(30);
    }
    G.pos.addScaledVector(G.vel, dt);
    G.mesh.position.copy(G.pos);
    G.mesh.rotation.x -= dt * 26;
    return false;
  }

  dispose() {
    this.fly?.mesh.removeFromParent();
    this.fly = null;
    for (const G of this.ghosts) G.mesh.removeFromParent();
    this.ghosts.length = 0;
    this.vmRoot.removeFromParent();
  }
}
