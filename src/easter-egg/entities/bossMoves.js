import * as THREE from 'three';
import { submerged } from './swim';

// Lo nuevo de los jefes (el pedido de "jefes más difíciles", 2026-09-27):
//  · A quién va: en co-op no persigue siempre al más cercano. Cada 6 a 8 s va
//    por el que más le pegó (si nadie, el más cercano); y si alguien se le
//    planta al lado mientras el elegido anda lejos, va por ese. No avisa.
//  · El Alcaide tira la cadena en vez del rebenque: más larga, y al que agarra
//    lo trae de un tirón.
//  · El Sargento apunta la tercerola de lejos (se ve el láser) y tira adonde
//    apuntó al final: moverse de costado lo esquiva.
//  · Los cuatro Caballeros Negros de la vanguardia traen cada uno su plaga:
//    la Sequía deja el pasto ardiendo, la Helada entumece al que se le
//    acerca, el Granizo marca círculos que revientan y la Langosta larga una
//    manga que persigue a uno y le tapa la vista.
//  · Gil (el cerro) encadena a uno a una estaca que le queda a la espalda. En
//    solo, el encadenado la rompe a tiros; en co-op no puede tirar y lo suelta
//    un compañero. A los 8 s se suelta sola.
//  · El Espantapájaros (el prado) se mete bajo tierra, un cuervo marca a uno
//    y sale de abajo donde estaba parado.
// Lo decide el anfitrión y avisa con el evento 'bfx'; lo que le pega a cada
// jugador lo cuenta su compu (como las bolas de fuego de la arena).

export const STAKE_ID = 0xfffc;
const PLAGUE_EYE = [0xff7a1a, 0x8ad8ff, 0xf4f8ff, 0x9aff3a];
const PLAGUE_LINE = [
  'El Caballero de la Sequía deja el pasto ardiendo por donde pisa: no lo sigan de cerca.',
  'El Caballero de la Helada entumece al que se le acerca: péguenle de lejos.',
  'El Caballero del Granizo marca círculos en el piso: cuando revientan, afuera.',
  'El Caballero de la Langosta larga una manga que persigue a uno: corré, que te tapa la vista.',
];
const CHAIN_RANGE = 14;
const CHAIN_DMG = 30;
const RIFLE_DMG = 45;
const RIFLE_LOCK = 0.75;
const RIFLE_FIRE = 1.15;
const HAIL_DMG = 35;
const BIND_SECS = 8;
const BIND_MARK = 1.4;
const BIND_SNAP = 1.85;
const SINK = 1.2;
const HIDE = 2.2;
const LOCK = 0.8;
const DEEP = 7;
const EMERGE_DMG = 70;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
// (los de la cadena: placeChain los usa mientras recibe tmpV/tmpW de afuera)
const chA = new THREE.Vector3();
const chD = new THREE.Vector3();
const chS = new THREE.Vector3();
const chO = new THREE.Vector3();
const chY = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const hitTmp = {};
const arr = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];

function sphereHit(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  if (t < 0 || t > maxT) return null;
  return t;
}

export default class BossMoves {
  constructor(game, zombies) {
    this.g = game;
    this.Z = zombies;
    this.rings = [];
    this.patches = [];
    this.swarms = [];
    this.pullT = 0;
    this.pullTo = new THREE.Vector3();
    this.throwT = -1;
    this.throwA = new THREE.Vector3();
    this.throwB = new THREE.Vector3();
    // (invitado) el Sargento apuntando: a quién, y adónde quedó el tiro
    this.aim = null;
    // (invitado) la plaga del caballero que anda
    this.plagueG = null;
    this.bound = null;
    this.bindPend = null;
    this.mark = null;
    this.burnT = 0;
    this.stingT = 0;
    // la estaca de Gil, para las armas (como el Cuervo: un "zombie" más)
    this.stakeZ = { stake: true, active: false, dead: false, boss: false, dog: false, id: STAKE_ID, pos: new THREE.Vector3(), yaw: 0, scale: 1, hp: 1, maxHp: 1, hidden: 0 };
    this.build();
  }

  // Todo existe desde que se arma el mapa y con materiales que ya están en la
  // escena (los avisos del jefe, el hierro, la madera): no se compila nada en
  // medio de la pelea.
  build() {
    const g = this.g;
    const M = g.world.M;
    const ring = this.Z.tele.ring;
    this.ringPool = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(ring.geometry, ring.material.clone());
      m.visible = false;
      m.renderOrder = 2;
      g.scene.add(m);
      this.ringPool.push(m);
    }
    const linkGeo = new THREE.TorusGeometry(0.075, 0.02, 5, 10);
    const rodGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5);
    const chain = () => {
      const links = [];
      for (let i = 0; i < 28; i++) {
        const l = new THREE.Mesh(linkGeo, M.iron);
        l.visible = false;
        g.scene.add(l);
        links.push(l);
      }
      const rod = new THREE.Mesh(rodGeo, M.iron);
      rod.visible = false;
      g.scene.add(rod);
      return { links, rod };
    };
    this.throwChain = chain();
    this.bindChain = chain();
    // la estaca: un palo clavado con travesaño y el trapo colorado del Gauchito
    const stake = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), M.woodDark);
    post.position.y = 0.85;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), M.woodDark);
    bar.position.y = 1.38;
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.02), M.redPaint);
    rag.position.set(0, 1.08, 0.09);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), M.woodDark);
    tip.position.y = 1.82;
    stake.add(post, bar, rag, tip);
    stake.visible = false;
    g.scene.add(stake);
    this.stake = stake;
  }

  // ---------------- ayudas ----------------
  me() {
    return this.g.net ? this.g.net.id : 0;
  }

  byId(id) {
    const g = this.g;
    if (!g.net || id === g.net.id) return g.player;
    return g.net.remote.get(id) || null;
  }

  idOf(p) {
    return p === this.g.player ? this.me() : p.id;
  }

  up(p) {
    if (!p) return false;
    return p === this.g.player ? p.canBeHit() : !p.dead && !p.downed && !p.ghost;
  }

  // (el sumergido no cuenta: abajo del agua no lo buscan)
  standing() {
    const g = this.g;
    const list = g.player.canBeHit() && !submerged(g.player) ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && !submerged(r)) list.push(r);
    return list;
  }

  host() {
    return !this.g.net?.guest;
  }

  send(m) {
    this.g.net?.event('bfx', m);
  }

  // A un jugador solo (el local, o uno de la red por su id).
  tell(p, text, d = 2.5) {
    const g = this.g;
    if (p === g.player) g.hud.subtitle(text, d, 'boss');
    else if (p?.id != null) g.net?.net.to(p.id, { t: 'ev', e: 'sub', x: text, d, k: 'boss' });
  }

  shout(text, d = 3) {
    const g = this.g;
    g.hud.subtitle(text, d, 'boss');
    g.net?.event('sub', { x: text, d, k: 'boss' });
  }

  // ---------------- a quién va ----------------
  // (anfitrión) El jugador que persigue el jefe (null: nadie en pie).
  target(z, dt) {
    const g = this.g;
    const near = g.nearestPlayer(z.pos.x, z.pos.z, z.baseY);
    if (!g.net || !near) return near;
    const by = z.baseY || 0;
    const list = this.standing().filter((p) => !g.world.levels || Math.abs((p.pos.y || 0) - by) < 2);
    if (list.length < 2) return near;
    z.aggro ||= new Map();
    let cur = z.tgtId != null ? this.byId(z.tgtId) : null;
    if (cur && !list.includes(cur)) cur = null;
    z.tgtT = (z.tgtT ?? 0) - dt;
    const d2 = (p) => (p.pos.x - z.pos.x) ** 2 + (p.pos.z - z.pos.z) ** 2;
    let pick = null;
    // alguien se le planta al lado mientras el elegido anda lejos: va por ese
    if (cur && near !== cur && list.includes(near) && d2(near) < 9 && d2(cur) > 64) pick = near;
    else if (!cur || z.tgtT <= 0) {
      let bd = 0;
      for (const p of list) {
        const a = z.aggro.get(this.idOf(p)) || 0;
        if (a > bd) {
          bd = a;
          pick = p;
        }
      }
      pick ||= list.includes(near) ? near : list[0];
    }
    if (!pick) return cur;
    z.aggro.clear();
    z.tgtT = 6 + Math.random() * 2;
    // (sin aviso: el usuario quiere que se enteren a las malas)
    z.tgtId = this.idOf(pick);
    return pick;
  }

  // (anfitrión) Cada golpe suma para ver a quién va después.
  onHit(z, dmg, info) {
    if (!this.g.net || !(dmg > 0)) return;
    z.aggro ||= new Map();
    const id = info.by ?? this.me();
    z.aggro.set(id, (z.aggro.get(id) || 0) + dmg);
  }

  // Bajo tierra (el Espantapájaros) no le entra nada.
  immune(z) {
    return z.state === 'burrow' || (z.state === 'emerge' && z.stateT < 0.25);
  }

  // ---------------- las marcas del piso ----------------
  // { x, z, y, r, dur, color, follow (id), lockAt, kind }
  ring(o) {
    const m = this.ringPool.find((q) => !q.visible);
    if (!m) return null;
    const R = { t: 0, ...o, m };
    m.visible = true;
    m.material.color.set(o.color);
    m.material.opacity = 0;
    m.position.set(o.x, (o.y || 0) + 0.05, o.z);
    m.scale.setScalar(o.r);
    this.rings.push(R);
    return R;
  }

  dropRing(R) {
    if (!R) return;
    R.m.visible = false;
    const i = this.rings.indexOf(R);
    if (i >= 0) this.rings.splice(i, 1);
  }

  updateRings(dt) {
    const g = this.g;
    const pulse = 0.7 + Math.sin(g.time * 18) * 0.3;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i];
      R.t += dt;
      if (R.follow != null && (R.lockAt == null || R.t < R.lockAt)) {
        const p = this.byId(R.follow);
        if (p) {
          R.x = p.pos.x;
          R.z = p.pos.z;
          R.y = p.pos.y || 0;
        }
      }
      R.m.position.set(R.x, (R.y || 0) + 0.05, R.z);
      const k = Math.min(1, R.t / (R.lockAt ?? R.dur));
      const locked = R.lockAt != null && R.t >= R.lockAt;
      R.m.material.opacity = R.kind === 'patch' ? 0.35 * Math.min(1, (R.dur - R.t) * 2) : (0.3 + k * 0.5) * (locked ? 1.3 : pulse);
      if (R.kind === 'hail') R.m.scale.setScalar(R.r * (0.55 + k * 0.45));
      if (R.t < R.dur) continue;
      if (R.kind === 'hail') this.hailHit(R);
      R.m.visible = false;
      this.rings.splice(i, 1);
    }
  }

  // ---------------- la cadena del Alcaide ----------------
  // (anfitrión) Sale de la mano y al primero que agarra en la franja lo trae.
  chainThrow(z) {
    const g = this.g;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const by = z.baseY || 0;
    const hand = new THREE.Vector3(z.pos.x + fx * 0.6, by + 2.1 * (z.scale / 1.4), z.pos.z + fz * 0.6);
    const rh = this.Z.bossRig.parts[6];
    if (rh) hand.setFromMatrixPosition(rh.matrixWorld);
    let best = null;
    let bestAlong = CHAIN_RANGE;
    for (const p of this.Z.bossTargets()) {
      const dx = p.pos.x - z.pos.x;
      const dz = p.pos.z - z.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along < 0.5 || along > bestAlong || side > 1.0) continue;
      if (!g.world.clear(hand, tmpV.set(p.pos.x, (p.pos.y || 0) + 1.2, p.pos.z))) continue;
      best = p;
      bestAlong = along;
    }
    let end;
    if (best) end = new THREE.Vector3(best.pos.x, (best.pos.y || 0) + 1.1, best.pos.z);
    else {
      end = new THREE.Vector3(z.pos.x + fx * CHAIN_RANGE, by + 0.4, z.pos.z + fz * CHAIN_RANGE);
      // (la cadena no atraviesa las paredes)
      tmpD.subVectors(end, hand);
      const len = tmpD.length();
      tmpD.divideScalar(len);
      const wt = g.world.raycast(hand, tmpD, len, hitTmp);
      if (Number.isFinite(wt) && wt < len) end.copy(hand).addScaledVector(tmpD, Math.max(0.5, wt - 0.1));
    }
    this.showThrow(hand, end);
    this.send({ k: 'chain', a: arr(hand), b: arr(end) });
    if (!best) return;
    g.damagePlayer(best, CHAIN_DMG, z.pos);
    if (best === g.player) this.pull(z.pos.x, z.pos.z, 0.7);
    else g.net?.net.to(best.id, { t: 'ev', e: 'bfx', k: 'pull', x: +z.pos.x.toFixed(2), z: +z.pos.z.toFixed(2), s: 0.7 });
  }

  showThrow(a, b) {
    this.throwA.copy(a);
    this.throwB.copy(b);
    this.throwT = 0;
    this.g.audio.chain(b);
  }

  // Al que agarró la cadena: un tirón hacia el Alcaide (hasta quedarle cerca).
  pull(x, z, secs) {
    this.pullT = secs;
    this.pullTo.set(x, 0, z);
    this.g.fx.addShake(0.35);
  }

  updatePull(dt) {
    if (!(this.pullT > 0)) return;
    const g = this.g;
    const P = g.player;
    this.pullT -= dt;
    if (!P.canBeHit()) {
      this.pullT = 0;
      return;
    }
    const dx = this.pullTo.x - P.pos.x;
    const dz = this.pullTo.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.4) {
      this.pullT = 0;
      return;
    }
    const step = Math.min(d - 2.4, 11 * dt);
    P.pos.x += (dx / d) * step;
    P.pos.z += (dz / d) * step;
    g.world.collide(P.pos, 0.36, P.pos.y + 0.1, P.pos.y + 1.7);
    P.vel.x = 0;
    P.vel.z = 0;
  }

  // Eslabones de a (la mano o la estaca) hasta b; k: cuánto salió.
  placeChain(C, a, b, k) {
    const A = chA.copy(a);
    const D = chD.subVectors(b, a);
    const len = D.length() * k;
    if (len < 0.05) {
      this.hideChain(C);
      return;
    }
    D.normalize();
    const side = Math.abs(D.y) > 0.95 ? chS.set(1, 0, 0) : chS.crossVectors(D, UP).normalize();
    const other = chO.crossVectors(D, side);
    const gap = Math.max(0.13, len / (C.links.length - 1));
    for (let i = 0; i < C.links.length; i++) {
      const L = C.links[i];
      const u = i * gap;
      if (u > len) {
        L.visible = false;
        continue;
      }
      L.visible = true;
      L.position.copy(A).addScaledVector(D, u);
      // un eslabón acostado y el que sigue parado
      const n = i % 2 ? side : other;
      tmpM.makeBasis(D, chY.crossVectors(n, D), n);
      L.quaternion.setFromRotationMatrix(tmpM);
      L.scale.set(1.45, 1, 1);
    }
    // la cadena larga del Alcaide: una varilla atrás para que no se vea cortada
    C.rod.visible = gap > 0.2;
    if (C.rod.visible) {
      C.rod.position.copy(A).addScaledVector(D, len / 2);
      C.rod.quaternion.setFromUnitVectors(UP, D);
      C.rod.scale.set(1, len, 1);
    }
  }

  hideChain(C) {
    for (const L of C.links) L.visible = false;
    C.rod.visible = false;
  }

  updateThrow(dt) {
    if (this.throwT < 0) return;
    this.throwT += dt;
    const t = this.throwT;
    // sale (0,15 s), queda tirante mientras trae (0,55 s) y vuelve (0,3 s)
    const k = t < 0.15 ? t / 0.15 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    if (k <= 0) {
      this.throwT = -1;
      this.hideChain(this.throwChain);
      return;
    }
    // el que viene arrastrado: la punta lo sigue
    if (this.pullT > 0 && t > 0.15) this.throwB.set(this.g.player.pos.x, this.g.player.pos.y + 1.1, this.g.player.pos.z);
    this.placeChain(this.throwChain, this.throwA, this.throwB, k);
  }

  // ---------------- la tercerola del Sargento ----------------
  // (anfitrión, en 'chase') ¿Le apunta desde lejos?
  rifleReady(z, dt, distP, player) {
    const g = this.g;
    z.rifleCd = (z.rifleCd ?? 4) - dt;
    if (z.rifleCd > 0 || distP < 7 || distP > 30) return false;
    if (player.canBeHit?.() === false) return false;
    const by = z.baseY || 0;
    if (!g.world.clear(tmpV.set(z.pos.x, by + 2, z.pos.z), tmpW.set(player.pos.x, (player.pos.y || 0) + 1.3, player.pos.z))) return false;
    z.rifleCd = (z.enraged ? 5.5 : 7.5) + Math.random() * 2;
    z.aimId = this.idOf(player);
    z.aimLock = null;
    z.shots = z.enraged ? 2 : 1;
    this.send({ k: 'aim', id: z.aimId });
    this.aim = null;
    return true;
  }

  muzzle(z, v) {
    const rh = this.Z.bossRig.parts[6];
    if (rh) return v.setFromMatrixPosition(rh.matrixWorld);
    const by = z.baseY || 0;
    return v.set(z.pos.x + Math.sin(z.yaw) * 0.9, by + 1.9 * (z.scale / 1.4), z.pos.z + Math.cos(z.yaw) * 0.9);
  }

  // (anfitrión) Tira adonde quedó apuntando.
  fireRifle(z) {
    const g = this.g;
    const from = this.muzzle(z, new THREE.Vector3());
    const to = z.aimLock || tmpV.set(z.pos.x + Math.sin(z.yaw) * 20, from.y, z.pos.z + Math.cos(z.yaw) * 20);
    tmpD.subVectors(to, from).normalize();
    const wt = g.world.raycast(from, tmpD, 40, hitTmp);
    const len = Number.isFinite(wt) ? Math.min(40, wt) : 40;
    const end = from.clone().addScaledVector(tmpD, len);
    for (const p of this.Z.bossTargets()) {
      tmpW.set(p.pos.x, (p.pos.y || 0) + 1.2, p.pos.z).sub(from);
      const along = tmpW.dot(tmpD);
      if (along < 0 || along > len) continue;
      if (tmpW.addScaledVector(tmpD, -along).length() < 0.75) g.damagePlayer(p, RIFLE_DMG, z.pos);
    }
    this.shotFx(from, end);
    this.send({ k: 'shot', a: arr(from), b: arr(end) });
  }

  shotFx(a, b) {
    const g = this.g;
    g.fx.tracer(a, b, 0xffd890);
    g.fx.flash(a, 0xffc070, 18, 0.06, 8);
    g.fx.sparks(b, 0.6, { x: 0, y: 1, z: 0 });
    g.fx.dust(b, { x: 0, y: 1, z: 0 }, [0.45, 0.4, 0.35], 6);
    g.audio.shot('rifle', a);
  }

  // El láser de la tercerola (todos lo ven): de la mano adonde apunta.
  updateAim(z) {
    const g = this.g;
    if (!z || z.dead || z.kind !== 'sargento' || z.state !== 'aim') return;
    const from = this.muzzle(z, tmpV);
    let to = null;
    if (this.host()) to = z.aimLock || this.chest(this.byId(z.aimId));
    else if (this.aim) to = this.aim.lock || this.chest(this.byId(this.aim.id));
    if (!to) return;
    g.fx.beam(from, to, { color: 0xff2a1a, width: 0.012, life: 0.03 });
  }

  chest(p) {
    return p ? tmpW.set(p.pos.x, (p.pos.y || 0) + 1.2, p.pos.z) : null;
  }

  // ---------------- los estados nuevos ----------------
  // (anfitrión) 'aim', 'shoot', 'burrow', 'emerge'.
  think(z, dt, t) {
    const g = this.g;
    const Z = this.Z;
    switch (z.state) {
      case 'aim': {
        const tp = this.byId(z.aimId);
        if (!z.aimLock) {
          if (tp) Z.turn(z, Math.atan2(tp.pos.x - z.pos.x, tp.pos.z - z.pos.z), 5, dt);
          if (z.stateT > RIFLE_LOCK) {
            // queda clavado ahí: el que se mueve ahora, zafa
            z.aimLock = this.chest(tp)?.clone() || null;
            if (z.aimLock) this.send({ k: 'lock', p: arr(z.aimLock) });
          }
        }
        if (z.stateT > RIFLE_FIRE) {
          this.fireRifle(z);
          Z.setState(z, 'shoot');
        }
        break;
      }
      case 'shoot':
        if (z.stateT > 0.5) {
          z.shots = (z.shots || 1) - 1;
          // enfurecido tira dos veces (la segunda, más rápida)
          if (z.shots > 0 && this.up(this.byId(z.aimId))) {
            Z.setState(z, 'aim');
            z.stateT = 0.35;
            z.aimLock = null;
            this.send({ k: 'aim', id: z.aimId });
          } else Z.setState(z, 'chase');
        }
        break;
      case 'burrow':
        this.thinkBurrow(z, dt);
        break;
      case 'emerge':
        if (z.stateT > 1.1) Z.setState(z, 'chase');
        break;
      default:
        break;
    }
    this.pose(z, t);
  }

  // Las poses (anfitrión e invitado).
  pose(z, t) {
    const Z = this.Z;
    const P = z.P;
    switch (z.state) {
      case 'aim':
      case 'shoot': {
        Z.poseIdle(z, t);
        // la tercerola al hombro: los dos brazos adelante
        P.torsoP = 0.05;
        P.shRp = -1.55;
        P.elR = 0;
        P.shLp = -1.35;
        P.elL = -0.5;
        if (z.state === 'shoot' && z.stateT < 0.15) {
          const k = 1 - z.stateT / 0.15;
          P.shRp += 0.35 * k;
          P.torsoP -= 0.08 * k;
        }
        break;
      }
      case 'burrow': {
        Z.poseRoar(z, t);
        const k = Math.min(1, z.stateT / SINK);
        P.rootY = -DEEP * k * k;
        break;
      }
      case 'emerge':
        Z.poseRoar(z, t);
        P.rootY = -DEEP * (1 - Math.min(1, z.stateT / 0.3));
        break;
      default:
        break;
    }
  }

  // ---------------- el Espantapájaros bajo tierra ----------------
  // (anfitrión) Se mete bajo tierra y el cuervo marca a uno.
  startBurrow(z, id) {
    const g = this.g;
    const Z = this.Z;
    Z.setState(z, 'burrow');
    z.markId = id;
    z.digLock = null;
    this.markRing(id);
    this.send({ k: 'smark', id });
    g.fx.dirt(tmpV.set(z.pos.x, (z.baseY || 0) + 0.2, z.pos.z), 40);
    g.audio.caw(tmpV.set(z.pos.x, (z.baseY || 0) + 3, z.pos.z), 3);
  }

  markRing(id) {
    this.dropRing(this.mark);
    this.mark = this.ring({ x: 0, z: 0, y: 0, r: 2.4, dur: SINK + HIDE + LOCK, lockAt: SINK + HIDE, follow: id, color: 0xb05aff, kind: 'mark' });
  }

  // Dónde está la marca (para el cuervo que da vueltas arriba: world/Prado.js).
  markAt(v) {
    const R = this.mark;
    if (!R || !R.m.visible || R.kind !== 'mark') return null;
    return v.set(R.x, R.y || 0, R.z);
  }

  thinkBurrow(z) {
    const g = this.g;
    const T = z.stateT;
    if (T < SINK && Math.random() < 0.5) g.fx.dirt(tmpV.set(z.pos.x + (Math.random() - 0.5) * 1.5, (z.baseY || 0) + 0.1, z.pos.z + (Math.random() - 0.5) * 1.5), 3);
    if (!z.digLock && T > SINK + HIDE) {
      const p = this.byId(z.markId);
      const at = p && this.up(p) ? p.pos : this.mark ? tmpV.set(this.mark.x, this.mark.y, this.mark.z) : z.pos;
      z.digLock = new THREE.Vector3(at.x, at.y || 0, at.z);
      if (this.mark) {
        this.mark.follow = null;
        this.mark.x = at.x;
        this.mark.z = at.z;
      }
      this.send({ k: 'slock', x: +at.x.toFixed(2), z: +at.z.toFixed(2) });
    }
    if (T > SINK + HIDE + LOCK) {
      const L = z.digLock || z.pos;
      z.pos.x = L.x;
      z.pos.z = L.z;
      z.baseY = g.world.levels ? g.world.floorAt(L.x, L.z, (L.y || 0) + 1) : 0;
      z.pos.y = z.baseY;
      this.Z.setState(z, 'emerge');
      this.emergeFx(L.x, z.baseY, L.z);
      this.send({ k: 'emerge', x: +L.x.toFixed(2), y: +z.baseY.toFixed(2), z: +L.z.toFixed(2) });
      for (const p of this.Z.bossTargets()) {
        if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < 2.6) g.damagePlayer(p, EMERGE_DMG, z.pos);
      }
    }
  }

  emergeFx(x, y, z) {
    const g = this.g;
    const at = tmpV.set(x, y + 0.3, z);
    g.fx.dirt(at, 60);
    g.fx.explosion(at, 2.6, [0.75, 0.6, 0.3]);
    g.fx.addShake(0.6);
    g.audio.bossSlam(at);
    g.audio.caw(at.clone().setY(y + 3), 2);
    this.dropRing(this.mark);
    this.mark = null;
    // al de arriba lo tira para atrás
    const P = g.player;
    const dx = P.pos.x - x;
    const dz = P.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 2.6 && P.canBeHit()) {
      P.vel.y = 6;
      P.vel.x += (dx / (d || 1)) * 5;
      P.vel.z += (dz / (d || 1)) * 5;
      P.onGround = false;
    }
  }

  // ---------------- los Caballeros de las plagas ----------------
  // (anfitrión) Salió uno: se le prenden los ojos del color de su plaga.
  onPlague(z) {
    this.shout(PLAGUE_LINE[z.plague] || '', 4.5);
    this.send({ k: 'plague', p: z.plague });
    z.plagueT = 0;
  }

  plagueOf(b) {
    if (!b || b.kind !== 'caballero') return null;
    return this.host() ? b.plague ?? null : this.plagueG;
  }

  updatePlague(dt) {
    const g = this.g;
    const b = this.Z.boss;
    const p = this.plagueOf(b);
    if (p == null || b.dead) return;
    // los ojos del color de la plaga (el vestido los vuelve a poner rojos)
    if (this.eyeFor !== b || this.eyeP !== p) {
      this.eyeFor = b;
      this.eyeP = p;
      this.Z.bossRig.eyeMat.color.set(PLAGUE_EYE[p]).multiplyScalar(3);
    }
    const by = b.baseY || 0;
    const s = (b.scale || 1.4) / 1.4;
    const rx = () => b.pos.x + (Math.random() - 0.5) * 1.4 * s;
    const rz = () => b.pos.z + (Math.random() - 0.5) * 1.4 * s;
    if (p === 0 && Math.random() < dt * 10) g.fx.fire(tmpV.set(rx(), by + 0.2, rz()), 0.3, 1);
    if (p === 1) {
      if (Math.random() < dt * 8) g.fx.frost(tmpV.set(rx(), by + 0.4 + Math.random() * 2 * s, rz()), 1);
      // la Helada entumece: cerca de él se anda a menos de la mitad
      const P = g.player;
      if (P.canBeHit() && Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z) < 6 && Math.abs((P.pos.y || 0) - by) < 2.5) {
        P.slowT = Math.max(P.slowT || 0, 0.3);
      }
    }
    if (p === 2 && Math.random() < dt * 6) g.fx.sparkle(tmpV.set(rx(), by + 1 + Math.random() * 1.6 * s, rz()), [0.9, 0.95, 1], 1, 0.3);
    if (p === 3 && Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      g.fx.alpha.spawn(b.pos.x + Math.cos(a) * 1.2 * s, by + (0.8 + Math.random() * 1.4) * s, b.pos.z + Math.sin(a) * 1.2 * s, Math.sin(a) * 2, (Math.random() - 0.5) * 0.6, -Math.cos(a) * 2, { color: [0.06, 0.07, 0.02], size: 0.03, size1: 0.025, life: 0.6, drag: 1 });
    }
    if (this.host()) this.hostPlague(b, p, dt);
  }

  // (anfitrión) Lo que larga cada plaga.
  hostPlague(b, p, dt) {
    const g = this.g;
    b.plagueT = (b.plagueT || 0) - dt;
    // cada tanto se repite cuál es (el que entra tarde también la ve)
    if (b.plagueT <= 0) {
      b.plagueT = 4;
      this.send({ k: 'plague', p });
    }
    const by = b.baseY || 0;
    if (p === 0 && ['chase', 'charge', 'toLock'].includes(b.state)) {
      b.patchT = (b.patchT ?? 0.8) - dt;
      if (b.patchT <= 0) {
        b.patchT = 0.8;
        this.spawnPatch(b.pos.x, by, b.pos.z);
        this.send({ k: 'patch', x: +b.pos.x.toFixed(2), y: +by.toFixed(2), z: +b.pos.z.toFixed(2) });
      }
    }
    if (p === 2) {
      b.hailT = (b.hailT ?? 4) - dt;
      if (b.hailT <= 0) {
        b.hailT = 6.5;
        const pts = [];
        for (const q of this.Z.bossTargets()) pts.push(q.pos.x + (Math.random() - 0.5) * 1.2, q.pos.z + (Math.random() - 0.5) * 1.2, q.pos.y || 0);
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 2 + Math.random() * 7;
          const x = b.pos.x + Math.cos(a) * d;
          const z = b.pos.z + Math.sin(a) * d;
          pts.push(x, z, g.world.levels ? g.world.floorAt(x, z, by + 1) : by);
        }
        const flat = pts.map((v) => +v.toFixed(2));
        this.spawnHail(flat);
        this.send({ k: 'hail', p: flat });
      }
    }
    if (p === 3) {
      b.swarmT = (b.swarmT ?? 5) - dt;
      if (b.swarmT <= 0) {
        b.swarmT = 9;
        const list = this.Z.bossTargets();
        if (list.length) {
          const id = this.idOf(list[Math.floor(Math.random() * list.length)]);
          this.spawnSwarm(id);
          this.send({ k: 'swarm', id });
        }
      }
    }
  }

  spawnPatch(x, y, z) {
    this.patches.push({ x, y, z, t: 0 });
    this.ring({ x, z, y, r: 1.3, dur: 6, color: 0xff6a1a, kind: 'patch' });
    if (this.patches.length > 10) this.patches.shift();
  }

  spawnHail(flat) {
    for (let i = 0; i < flat.length; i += 3) this.ring({ x: flat[i], z: flat[i + 1], y: flat[i + 2], r: 1.6, dur: 1.3, color: 0xcfeaff, kind: 'hail' });
  }

  hailHit(R) {
    const g = this.g;
    const at = tmpV.set(R.x, (R.y || 0) + 0.3, R.z);
    g.fx.frost(at, 16);
    g.fx.sparks(at, 1, { x: 0, y: 1, z: 0 }, [0.85, 0.92, 1]);
    g.audio.iceShot?.(at);
    const P = g.player;
    if (P.canBeHit() && Math.hypot(P.pos.x - R.x, P.pos.z - R.z) < R.r && Math.abs((P.pos.y || 0) - (R.y || 0)) < 2) P.damage(HAIL_DMG, at);
  }

  spawnSwarm(id) {
    this.swarms.push({ id, t: 0, dur: 4.5 });
  }

  updateGround(dt) {
    const g = this.g;
    const P = g.player;
    // el pasto ardiendo de la Sequía
    let burning = false;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const q = this.patches[i];
      q.t += dt;
      if (q.t > 6) {
        this.patches.splice(i, 1);
        continue;
      }
      if (Math.random() < dt * 5) g.fx.fire(tmpV.set(q.x + (Math.random() - 0.5) * 1.6, q.y + 0.1, q.z + (Math.random() - 0.5) * 1.6), 0.4, 1);
      if (Math.hypot(P.pos.x - q.x, P.pos.z - q.z) < 1.3 && Math.abs((P.pos.y || 0) - q.y) < 1.5) burning = true;
    }
    this.burnT -= dt;
    if (burning && P.canBeHit() && this.burnT <= 0) {
      this.burnT = 0.5;
      P.damage(10, tmpV.set(P.pos.x, P.pos.y, P.pos.z));
    }
    // la manga de langostas
    this.stingT -= dt;
    for (let i = this.swarms.length - 1; i >= 0; i--) {
      const S = this.swarms[i];
      S.t += dt;
      if (S.t > S.dur) {
        this.swarms.splice(i, 1);
        continue;
      }
      const mine = S.id === this.me();
      if (mine) {
        const cam = g.camera;
        const n = Math.random() < dt * 60 ? 2 : 0;
        for (let k = 0; k < n; k++) {
          tmpD.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1, -0.5 - Math.random() * 1.4).applyQuaternion(cam.quaternion);
          g.fx.alpha.spawn(cam.position.x + tmpD.x, cam.position.y + tmpD.y, cam.position.z + tmpD.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2, { color: [0.07, 0.08, 0.03], size: 0.03, size1: 0.02, life: 0.5, drag: 1 });
        }
        if (P.canBeHit() && this.stingT <= 0) {
          this.stingT = 0.5;
          P.damage(5, tmpV.set(P.pos.x, P.pos.y, P.pos.z));
        }
      } else {
        const r = this.byId(S.id);
        if (r && Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          g.fx.alpha.spawn(r.pos.x + Math.cos(a) * 0.9, (r.pos.y || 0) + 1 + Math.random() * 1.2, r.pos.z + Math.sin(a) * 0.9, Math.sin(a) * 2.5, (Math.random() - 0.5), -Math.cos(a) * 2.5, { color: [0.07, 0.08, 0.03], size: 0.03, size1: 0.02, life: 0.5, drag: 1 });
        }
      }
    }
  }

  // ---------------- la cadena de Gil ----------------
  // (anfitrión, desde world/Cerro.js) Marca a uno: si no sale del círculo, queda encadenado.
  bindMark(id) {
    const p = this.byId(id);
    if (!p || this.bound || this.bindPend) return false;
    this.bindPend = { id, t: 0, lock: null, ring: this.ring({ x: p.pos.x, z: p.pos.z, y: p.pos.y || 0, r: 1.3, dur: BIND_SNAP, lockAt: BIND_MARK, follow: id, color: 0xff1a10, kind: 'mark' }) };
    this.send({ k: 'bmark', id });
    return true;
  }

  updateBindHost(dt) {
    const B = this.bindPend;
    if (B) {
      B.t += dt;
      const p = this.byId(B.id);
      if (!B.lock && B.t > BIND_MARK) {
        B.lock = p ? new THREE.Vector3(p.pos.x, p.pos.y || 0, p.pos.z) : new THREE.Vector3();
        this.send({ k: 'block', x: +B.lock.x.toFixed(2), z: +B.lock.z.toFixed(2) });
      }
      if (B.t > BIND_SNAP) {
        this.bindPend = null;
        if (p && this.up(p) && B.lock && Math.hypot(p.pos.x - B.lock.x, p.pos.z - B.lock.z) < 1.3) this.bind(B.id, p);
      }
    }
    const b = this.bound;
    if (!b) return;
    b.t += dt;
    const p = this.byId(b.id);
    if (b.t > BIND_SECS) this.unbind('time');
    else if (!this.up(p)) this.unbind('down');
  }

  // (anfitrión) Queda clavado; la estaca, a su espalda (del lado contrario a Gil).
  bind(id, p) {
    const g = this.g;
    const boss = this.Z.boss;
    let dx = p.pos.x - (boss ? boss.pos.x : p.pos.x + 1);
    let dz = p.pos.z - (boss ? boss.pos.z : p.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    let sx = p.pos.x + dx * 2.6;
    let sz = p.pos.z + dz * 2.6;
    // adentro de la arena (el cerro es chico)
    const A = g.arena?.active ? g.arena.A : null;
    if (A) {
      const ax = sx - A.x;
      const az = sz - A.z;
      const ad = Math.hypot(ax, az);
      if (ad > A.r - 1) {
        sx = A.x + (ax / ad) * (A.r - 1);
        sz = A.z + (az / ad) * (A.r - 1);
      }
    }
    const py = p.pos.y || 0;
    const sy = g.world.levels ? g.world.floorAt(sx, sz, py + 1) : py;
    const players = g.rounds?.players || 1;
    const hp = Math.round(1500 * (1 + 0.5 * (players - 1)));
    const m = { k: 'bind', id, ax: +p.pos.x.toFixed(2), az: +p.pos.z.toFixed(2), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2) };
    this.startBind(m, hp);
    this.send(m);
  }

  // (todos) Empieza el encadenado.
  startBind(m, hp = 1) {
    const g = this.g;
    this.bound = { id: m.id, ax: m.ax, az: m.az, sx: m.sx, sy: m.sy, sz: m.sz, t: 0, hp };
    // (activa ya: los tiros que manda el invitado llegan sin que el anfitrión la haya apuntado)
    this.stakeZ.active = true;
    this.stakeZ.pos.set(m.sx, m.sy, m.sz);
    this.stake.position.set(m.sx, m.sy, m.sz);
    this.stake.rotation.y = Math.atan2(m.ax - m.sx, m.az - m.sz);
    this.stake.visible = true;
    const at = tmpV.set(m.sx, m.sy + 0.5, m.sz);
    g.fx.dirt(at, 20);
    g.fx.lightning(new THREE.Vector3(m.sx, m.sy + 14, m.sz), new THREE.Vector3(m.sx, m.sy + 1.8, m.sz), 0xff3a2a, 0.3);
    g.audio.chain(at);
    const mine = m.id === this.me();
    const coop = this.standing().some((p) => p !== g.player);
    if (mine) g.hud.subtitle(coop ? '¡Te encadenó! No podés tirar: que un compañero rompa la estaca que tenés atrás.' : '¡Te encadenó! Date vuelta y rompé a tiros la estaca que tenés atrás.', 3.5, 'boss');
    else g.hud.subtitle(`¡Gil encadenó a ${g.net?.nameOf(m.id) || 'un compañero'}! Rompan a tiros la estaca que tiene atrás.`, 3.5, 'boss');
  }

  // (anfitrión) Se suelta: rota la estaca, o pasó el rato, o cayó.
  unbind(why) {
    if (!this.bound) return;
    this.endBind(why);
    this.send({ k: 'unbind', w: why });
  }

  endBind(why) {
    const g = this.g;
    const b = this.bound;
    if (!b) return;
    this.bound = null;
    this.stake.visible = false;
    this.stakeZ.active = false;
    this.hideChain(this.bindChain);
    const at = tmpV.set(b.sx, b.sy + 1, b.sz);
    if (why === 'broken') {
      g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.4, 0.28, 0.18], 24);
      g.fx.sparks(at, 1.2, { x: 0, y: 1, z: 0 });
      g.audio.chain(at);
    }
  }

  // Cada cuadro, en todas las compus.
  updateBind() {
    const g = this.g;
    const b = this.bound;
    if (!b) return;
    const p = this.byId(b.id);
    if (!p) return;
    const mine = p === g.player;
    if (mine) {
      // clavado en el lugar (mirar y saltar, sí)
      p.pos.x = b.ax;
      p.pos.z = b.az;
      p.vel.x = 0;
      p.vel.z = 0;
      // en co-op no puede tirar: lo sueltan los otros
      if (this.standing().some((q) => q !== g.player)) g.weapons.fireCd = Math.max(g.weapons.fireCd || 0, 0.12);
    }
    const top = tmpV.set(b.sx, b.sy + 1.15, b.sz);
    this.placeChain(this.bindChain, top, tmpW.set(p.pos.x, (p.pos.y || 0) + 0.35, p.pos.z), 1);
    this.stake.rotation.z = Math.sin(g.time * 30) * 0.02 * (b.hit > g.time ? 1 : 0);
  }

  // La estaca para las armas (Zombies.raycast).
  hitTest(o, d, maxT) {
    const b = this.bound;
    if (!b) return null;
    const z = this.stakeZ;
    z.active = true;
    z.pos.set(b.sx, b.sy, b.sz);
    const t1 = sphereHit(o, d, b.sx, b.sy + 0.5, b.sz, 0.3, maxT);
    const t2 = sphereHit(o, d, b.sx, b.sy + 1.2, b.sz, 0.45, maxT);
    const t = t1 == null ? t2 : t2 == null ? t1 : Math.min(t1, t2);
    return t == null ? null : { z, t, zone: 'torso' };
  }

  // La estaca recibe (Zombies.damage la manda acá). En el invitado se le
  // avisa al anfitrión, que es el que la rompe.
  hitStake(z, amount, info = {}) {
    const g = this.g;
    const b = this.bound;
    this.Z.lastPoints = 0;
    if (!b) return false;
    if (info.point) g.fx.dust(info.point, { x: 0, y: 1, z: 0 }, [0.45, 0.32, 0.2], 4);
    b.hit = g.time + 0.12;
    if (g.net?.guest) {
      g.net.reportHit(z, amount, info);
      return true;
    }
    b.hp -= amount;
    if (b.hp <= 0) this.unbind('broken');
    return true;
  }

  // ---------------- red ----------------
  // (invitado) Lo que avisa el anfitrión.
  onNet(m) {
    const g = this.g;
    switch (m.k) {
      case 'pull':
        this.pull(m.x, m.z, m.s);
        break;
      case 'chain':
        this.showThrow(tmpV.fromArray(m.a), tmpW.fromArray(m.b));
        break;
      case 'aim':
        this.aim = { id: m.id, lock: null };
        break;
      case 'lock':
        if (this.aim) this.aim.lock = new THREE.Vector3().fromArray(m.p);
        break;
      case 'shot':
        this.shotFx(new THREE.Vector3().fromArray(m.a), new THREE.Vector3().fromArray(m.b));
        this.aim = null;
        break;
      case 'plague':
        this.plagueG = m.p;
        break;
      case 'patch':
        this.spawnPatch(m.x, m.y, m.z);
        break;
      case 'hail':
        this.spawnHail(m.p);
        break;
      case 'swarm':
        this.spawnSwarm(m.id);
        break;
      case 'smark':
        this.markRing(m.id);
        break;
      case 'slock':
        if (this.mark) {
          this.mark.follow = null;
          this.mark.x = m.x;
          this.mark.z = m.z;
          this.mark.t = Math.max(this.mark.t, SINK + HIDE);
        }
        break;
      case 'emerge':
        this.emergeFx(m.x, m.y, m.z);
        break;
      case 'bmark': {
        const p = this.byId(m.id);
        this.dropRing(this.bindRingG);
        this.bindRingG = p ? this.ring({ x: p.pos.x, z: p.pos.z, y: p.pos.y || 0, r: 1.3, dur: BIND_SNAP, lockAt: BIND_MARK, follow: m.id, color: 0xff1a10, kind: 'mark' }) : null;
        break;
      }
      case 'block':
        if (this.bindRingG) {
          this.bindRingG.follow = null;
          this.bindRingG.x = m.x;
          this.bindRingG.z = m.z;
        }
        break;
      case 'bind':
        this.startBind(m);
        break;
      case 'unbind':
        this.endBind(m.w);
        break;
      default:
        // lo de cada arena (las columnas de fuego del Mandinga)
        g.arena?.onBfx?.(m);
        break;
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const b = this.Z.boss;
    this.updateRings(dt);
    this.updatePull(dt);
    this.updateThrow(dt);
    this.updateGround(dt);
    this.updatePlague(dt);
    this.updateAim(b);
    if (this.host()) this.updateBindHost(dt);
    this.updateBind();
    // se fue el jefe (o cayó): no queda nada colgado
    if ((!b || b.dead) && (this.bound || this.bindPend)) {
      this.bindPend = null;
      if (this.host()) this.unbind('down');
    }
    if ((!b || b.dead) && this.mark) {
      this.dropRing(this.mark);
      this.mark = null;
    }
  }

  // Al volver al menú o cambiar de mapa.
  reset() {
    for (const R of this.rings) R.m.visible = false;
    this.rings.length = 0;
    this.patches.length = 0;
    this.swarms.length = 0;
    this.pullT = 0;
    this.throwT = -1;
    this.hideChain(this.throwChain);
    this.bound = null;
    this.bindPend = null;
    this.stake.visible = false;
    this.stakeZ.active = false;
    this.hideChain(this.bindChain);
    this.mark = null;
    this.aim = null;
    this.plagueG = null;
  }
}
