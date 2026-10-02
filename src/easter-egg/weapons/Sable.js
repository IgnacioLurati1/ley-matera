import * as THREE from 'three';
import { WEAPONS } from '../config/weapons';
import { zombieHealth, bossHealth } from '../config/rules';
import { VM, registerMate } from './viewmodels';
import { buildSable, setSableEnv } from './sableModels';
import SableFx from './sableFx';
import Carga from './sableCarga';

// El Sable Corvo de San Martín: la maravilla del Monumento al Mate (no sale
// de la caja: se arma con la hoja, la empuñadura y la vaina en la Llama
// Votiva; el mapa llama a weapons.sable.give()). Con el Pack-a-Pava es el
// Sable de San Lorenzo.
//  · Izquierdo (mantenido sigue): tres tajos en combo, a la izquierda, a la
//    derecha y uno fuerte de arriba en diagonal. Cada uno corta a varios del
//    arco, con su golpe que frena la mano un instante (hit-stop), sangre,
//    chispas y estela. De un tajo hasta la ronda `oneHit`; después, de a dos
//    y tres. El de San Lorenzo además larga una medialuna celeste y blanca
//    (~12 m) que corta a todos los de la línea.
//  · Derecho: lo tira. Vuela girando en una vuelta de boomerang, corta a todo
//    lo que cruza y vuelve a la mano (contra una pared, rebota y vuelve).
//    Mientras está en el aire la mano queda vacía (el izquierdo: la faka).
//  · El de San Lorenzo llena la carga con las bajas (~25). Llena, el derecho
//    mantenido: ¡la Carga de San Lorenzo! (weapons/sableCarga.js).
//  · Inspeccionar (E): el saludo militar con el sable. Al sacarlo, desenvaina.
// Weapons le pasa el gatillo (input), cada cuadro (update), la pose de la mano
// (pose) y el final (clear). El daño va por zombies.damage (el invitado se lo
// pasa al anfitrión); los demás ven los tajos, el tiro y la carga por 'sable'.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const _he = new THREE.Euler();
const _hq = new THREE.Quaternion();
const near = [];
const hitTmp = {};
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
// a qué altura se le pega a cada uno (los yacarés van al ras)
const aimY = (z) => (z.dog ? (z.yacY ?? z.pos.y) + 0.35 : z.pos.y + 1.15 * (z.scale || 1));
const big = (z) => !!(z.boss || z.pombero || z.crow);
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/// ---------------- en la mano ----------------
// el sable de verdad, achicado como todo lo de la mano (en el muñeco de un
// compañero se agranda de nuevo: AVATAR_K)
const VMS = 0.55;
const AVATAR_K = 1.7;
// dónde está el codo (en el espacio de la mano: abajo, a la derecha y atrás);
// el antebrazo va siempre de la muñeca hacia ahí, doble como doble la muñeca
const ELBOW = new THREE.Vector3(0.32, -0.44, 0.24);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// La muñeca para que la hoja vaya hacia d con el filo hacia e (en el espacio
// de la mano): la hoja es +y del puño y el filo, -z.
const _bx = new THREE.Vector3();
const _bd = new THREE.Vector3();
const _be = new THREE.Vector3();
const _bm = new THREE.Matrix4();
function bladeQuat(dx, dy, dz, ex, ey, ez, out) {
  _bd.set(dx, dy, dz).normalize();
  _be.set(ex, ey, ez);
  _be.addScaledVector(_bd, -_be.dot(_bd));
  if (_be.lengthSq() < 1e-6) _be.set(0, 0, -1).addScaledVector(_bd, -_bd.z);
  _be.normalize().negate();
  _bx.crossVectors(_bd, _be);
  return out.setFromRotationMatrix(_bm.makeBasis(_bx, _bd, _be));
}

registerMate('sable', (up, T) => {
  const M = VM.mats(T);
  const s = buildSable(up);
  const sab = s.group;
  sab.scale.setScalar(VMS);
  // de filo hacia adelante (-z del puño)
  sab.rotation.y = Math.PI / 2;
  const wrist = new THREE.Group();
  wrist.add(sab);
  const R = 0.0088;
  const hand = VM.wrapHand(M, { radius: R, y0: -0.069, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 });
  // (la manga y el puño de lana salen de la mano: van aparte, hacia el codo)
  for (const o of [...hand.children]) if (o.material === M.sleeve || o.material === M.cuff) o.removeFromParent();
  wrist.add(hand);
  wrist.position.set(-0.01, 0.02, 0);
  // el antebrazo: el puño de lana y la manga, a lo largo de +y desde la muñeca
  const arm = new THREE.Group();
  arm.userData.hand = true;
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.01, 8, 18), M.cuff);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = 0.012;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.046, 0.55, 16, 1, true), M.sleeve);
  sleeve.position.y = 0.012 + 0.275;
  arm.add(cuff, sleeve);
  const root = new THREE.Group();
  root.add(wrist, arm);
  const m = { wrist, arm, armAt: new THREE.Vector3(0.002, -0.069 + 0.004, R + 0.0135), sab, tip: s.tip, mid: s.mid, dragona: s.dragona, up: !!up };
  setPose(m, REST_P, 0);
  root.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  s.tip.getWorldPosition(tip);
  return { root, muzzle: s.tip, anim: { spin: [], glow: [], wobble: null }, upgraded: !!up, tip, mouth: null, mate: wrist, bombGroup: null, yerba: null, sable: m };
});

// Pone la mano en la pose P (9 números: posición extra de la muñeca, hacia
// dónde va la hoja, hacia dónde mira el filo) con un giro extra sobre la hoja.
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _w = new THREE.Vector3();
function setPose(m, P, spin = 0) {
  bladeQuat(P[3], P[4], P[5], P[6], P[7], P[8], _q);
  if (spin) {
    _w.set(P[3], P[4], P[5]).normalize();
    _q.premultiply(_q2.setFromAxisAngle(_w, spin));
  }
  m.wrist.quaternion.copy(_q);
  // el antebrazo: de la muñeca al codo
  _w.copy(m.armAt).applyQuaternion(_q).add(m.wrist.position);
  m.arm.position.copy(_w);
  _w.subVectors(ELBOW, _w).normalize();
  m.arm.quaternion.setFromUnitVectors(Y_AXIS, _w);
}

// ---------------- las poses ----------------
// Cada pose: [x, y, z] (se suma a la cadera), [dx, dy, dz] hacia dónde va la
// hoja y [ex, ey, ez] hacia dónde mira el filo (en la cámara: x derecha, y
// arriba, z hacia atrás). Claves [k, pose, curva] ('io' suave, 'i' arranca
// lento, 'o' sale rápido y frena). Quieto: la hoja cruza hacia arriba, adelante
// y al medio, con la cara de la hoja a la vista.
const REST_P = [0, 0, 0, -0.42, 0.72, -0.55, -1, -0.1, -0.35];
// cut: el silbido y el arco en el mundo; hit: cuándo corta; trail: la estela;
// kick: el tirón de la vista; stop: el freno al pegar; len: cuánto dura; k: fuerza
const MOVES = {
  // a la izquierda: cargado arriba a la derecha, barre de derecha a izquierda bajando
  izq: {
    len: 1,
    cut: 0.27,
    hit: 0.4,
    trail: [0.26, 0.62],
    kick: [0.012, -0.03],
    stop: 0.055,
    k: 1,
    keys: [
      [0, REST_P],
      [0.25, [0.05, 0.12, 0.04, 0.45, 0.85, 0.05, 0.2, 0.2, -1], 'io'],
      [0.37, [-0.05, 0.1, -0.05, -0.35, 0.15, -0.92, -1, -0.1, 0.2], 'i'],
      [0.48, [-0.3, 0.07, -0.06, -0.9, -0.2, -0.38, -0.4, -0.3, 0.8], 'o'],
      [0.62, [-0.35, 0.04, -0.04, -0.8, -0.45, -0.1, 0, -0.5, 0.8], 'o'],
      [1, REST_P, 'io'],
    ],
  },
  // a la derecha: el revés, de abajo a la izquierda sube barriendo a la derecha
  der: {
    len: 1,
    cut: 0.27,
    hit: 0.4,
    trail: [0.26, 0.62],
    kick: [0.01, 0.032],
    stop: 0.055,
    k: 1,
    keys: [
      [0, REST_P],
      [0.25, [-0.32, 0.0, 0.0, -0.8, -0.25, -0.3, 0, 0.1, -1], 'io'],
      [0.37, [-0.12, 0.06, -0.06, 0.2, 0.25, -0.95, 1, 0.2, 0.1], 'i'],
      [0.48, [0.08, 0.1, -0.04, 0.85, 0.45, -0.25, 0.1, 0.4, 1], 'o'],
      [0.62, [0.11, 0.12, -0.02, 0.75, 0.6, 0.1, -0.1, 0.5, 1], 'o'],
      [1, REST_P, 'io'],
    ],
  },
  // el de arriba: lo levanta por arriba del hombro y lo baja de golpe en diagonal
  arriba: {
    len: 1.3,
    cut: 0.33,
    hit: 0.46,
    trail: [0.32, 0.66],
    kick: [-0.04, 0.012],
    stop: 0.085,
    k: 1.3,
    keys: [
      [0, REST_P],
      [0.3, [0.0, 0.2, 0.05, 0.25, 0.7, 0.65, 0, 1, -0.3], 'io'],
      [0.41, [-0.07, 0.22, -0.07, 0.0, 0.95, -0.3, 0, 0.3, -1], 'i'],
      [0.52, [-0.15, 0.12, -0.1, -0.25, -0.22, -0.95, 0, -1, 0.2], 'o'],
      [0.66, [-0.22, 0.06, -0.08, -0.45, -0.7, -0.55, 0, -0.4, 1], 'o'],
      [1, REST_P, 'io'],
    ],
  },
};
const COMBO = ['izq', 'der', 'arriba'];
// el tiro: lo lleva atrás por arriba del hombro y lo larga hacia adelante
const WIND = 0.2;
const WIND_KEYS = [
  [0, REST_P],
  [0.6, [0.06, 0.14, 0.1, 0.3, 0.6, 0.75, 0, 1, -0.2], 'io'],
  [1, [-0.04, 0.1, -0.2, -0.1, 0.25, -1, -1, 0, 0], 'i'],
];
// desenvainar: sale de la cadera izquierda (la hoja todavía para atrás),
// sube cruzando a la derecha, floreo y se para
const DRAW = 0.55;
const DRAW_KEYS = [
  [0, [-0.25, -0.2, 0.06, -0.4, -0.3, 0.85, 0, -1, 0]],
  [0.3, [-0.14, 0.0, 0.0, -0.8, 0.5, 0.35, 0, 1, 0], 'i'],
  [0.6, [0.02, 0.12, -0.04, 0.1, 1, -0.15, -1, 0, -0.3], 'o'],
  [1, REST_P, 'io'],
];
// agarrarlo de vuelta: entra desde abajo a la derecha girando sobre la hoja
const CATCH = 0.32;
const CATCH_KEYS = [
  [0, [0.12, -0.24, 0.05, 0.5, 0.8, 0.2, -1, 0, 0]],
  [0.6, [-0.01, 0.01, -0.02, -0.45, 0.75, -0.55, -1, -0.1, -0.35], 'o'],
  [1, REST_P, 'io'],
];
// el saludo (inspeccionar): la hoja parada delante de la cara, el filo a la
// izquierda; después baja adelante a la derecha, y vuelve
const SALUTE_KEYS = [
  [0, REST_P],
  [0.12, [-0.17, 0.02, 0.08, 0, 1, 0.05, -1, 0, 0], 'io'],
  [0.45, [-0.17, 0.025, 0.08, 0, 1, 0.05, -1, 0, 0], 'io'],
  [0.6, [-0.03, 0.02, -0.04, -0.62, -0.5, -0.6, 0, -0.3, -1], 'io'],
  [0.85, [-0.03, 0.02, -0.04, -0.62, -0.5, -0.6, 0, -0.3, -1], 'io'],
  [1, REST_P, 'io'],
];
const SALUTE = 3.4;
// la carga: el sable en alto (cargando) y apuntando adelante (¡a la carga!)
const RAISE = [0.0, 0.18, 0.0, -0.15, 1, -0.45, -1, 0, -0.3];
const POINT = [-0.08, 0.1, -0.15, -0.25, 0.3, -0.92, -1, 0, 0.2];

// (para afinar las poses desde las pruebas)
export const SABLE_POSES = { MOVES, WIND_KEYS, DRAW_KEYS, CATCH_KEYS, SALUTE_KEYS, RAISE, POINT, REST_P, ELBOW };

function sample(keys, k, out) {
  let i = 1;
  while (i < keys.length - 1 && k > keys[i][0]) i++;
  const [k0, a] = keys[i - 1];
  const [k1, b, ease] = keys[i];
  let u = clamp01((k - k0) / (k1 - k0 || 1));
  u = ease === 'i' ? u * u * u : ease === 'o' ? 1 - (1 - u) ** 3 : smooth(u);
  for (let j = 0; j < 9; j++) out[j] = a[j] + (b[j] - a[j]) * u;
  return out;
}
const mix = (a, b, k, out) => {
  for (let j = 0; j < 9; j++) out[j] = a[j] + (b[j] - a[j]) * k;
  return out;
};

// la estela de la mano (en la escena de la mano)
const TRAIL_MAX = 14;
const TRAIL_LIFE = 0.11;

export default class Sable {
  constructor(w) {
    this.w = w;
    this.g = w.g;
    setSableEnv(w.envMap);
    this.fx = new SableFx(this);
    this.carga = new Carga(this);
    this.mode = 'none';
    this.t = 0;
    this.dt = 1 / 60;
    this.combo = 0;
    this.lastEnd = -9;
    this.cd = 0;
    this.kills = 0;
    this.stopT = 0;
    this.rHold = -1;
    this.queued = false;
    this.fly = null;
    this.P = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.O = [0, 0, 0, 0, 0, 0, 0, 0];
    this.dragV = 0;
    this.dragA = 0;
    this.lastRz = 0;
    this.prevState = '';
    this.warmed = false;
    this.warmT = 0;
    this.counted = new WeakMap();
    // la estela del tajo: una cinta que sigue a la hoja de verdad
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    const nv = TRAIL_MAX * 3;
    for (let i = 0; i < nv - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 10;
    w.vmRoot.add(this.trail);
    this.trailPts = [];
    this.trailFree = [];
    this.trailOn = false;
    this.trailFrame = -1;
    // (las muestras de la estela se toman al dibujar la mano: ahí la pose del
    // cuadro ya está puesta; antes de eso iba un cuadro atrás de la hoja)
    const vs = w.vmScene;
    const prev = vs.onBeforeRender;
    vs.onBeforeRender = (...a) => {
      prev?.apply(vs, a);
      this.trailTick();
    };
  }

  // ---------------- lo que usa el mapa ----------------
  // Da el sable (up: 1 el de San Lorenzo). Si ya lo tiene, lo saca.
  give(up = 0) {
    return this.w.give('sable', up);
  }

  get st() {
    const s = this.w.slot;
    return s?.id === 'sable' ? this.w.stats : null;
  }

  get up() {
    return !!this.w.model?.sable?.up && this.w.slot?.id === 'sable';
  }

  // ---------------- el gatillo ----------------
  input(input, st, p) {
    const w = this.w;
    if (p.downed) return;
    // sin el sable en la mano: el izquierdo es la faka
    if (this.mode === 'away' || this.mode === 'wait') {
      if (input.mouse.leftPressed && w.state === 'idle') w.startKnife();
      return;
    }
    if (w.state !== 'idle' && w.state !== 'sable') return;
    const C = st.carga;
    // la carga llena: el derecho mantenido la larga; soltado enseguida, tira el sable
    if (this.rHold >= 0) {
      if (input.mouse.right && C) {
        this.rHold += this.dt;
        if (this.rHold > 0.12 && this.mode === 'idle') {
          this.mode = 'charge';
          this.t = 0;
          w.state = 'sable';
          w.stateT = 0;
          this.sndCharge();
        }
        if (this.rHold >= C.hold) {
          this.rHold = -1;
          this.fireCarga(st);
        }
        return;
      }
      const h = this.rHold;
      this.rHold = -1;
      if (this.mode === 'charge') this.toIdle();
      if (h < 0.3 && this.cd <= 0) this.startThrow(st);
      return;
    }
    if (input.mouse.rightPressed && this.mode === 'idle') {
      if (C && this.kills >= C.kills) {
        this.rHold = 0;
        return;
      }
      if (this.cd <= 0) this.startThrow(st);
      return;
    }
    if (this.mode === 'slash') {
      if (input.mouse.leftPressed && this.t > this.dur * 0.4) this.queued = true;
      return;
    }
    if (this.mode !== 'idle') return;
    if (input.mouse.left || this.queued) {
      this.queued = false;
      this.startSlash(st);
    }
  }

  toIdle() {
    this.mode = 'idle';
    this.t = 0;
    if (this.w.state === 'sable') this.w.state = 'idle';
  }

  // ---------------- los tajos ----------------
  startSlash(st) {
    const g = this.g;
    const w = this.w;
    const chain = g.time - this.lastEnd < 0.32;
    this.combo = chain ? (this.combo + 1) % COMBO.length : 0;
    this.move = COMBO[this.combo];
    const mv = MOVES[this.move];
    const rate = g.player.perks.has('doubletap') ? 1.2 : 1;
    this.dur = (60 / st.rpm / rate) * mv.len;
    this.mode = 'slash';
    this.t = 0;
    this.cut = false;
    this.hit = false;
    w.state = 'sable';
    w.stateT = 0;
    g.net?.act?.('stab', this.dur);
  }

  // El tajo arranca a cortar: silbido, el arco en el mundo y (el de San
  // Lorenzo) la medialuna.
  onCut(st, mv) {
    const g = this.g;
    const up = this.up;
    this.fx.sndSwish(null, mv.k, up);
    g.player.addRecoil(mv.kick[0], mv.kick[1]);
    if (this.move === 'arriba') g.fx.addShake(0.05);
    const fwd = this.aim(tmpF);
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const P = g.player.pos;
    const eye = this.eye(tmpV2);
    const center = tmpV.set(P.x, eye.y - 0.45, P.z);
    // (el arco en el mundo es para los demás: acá ya está la estela de la hoja)
    const msg = { k: 's', id: g.net?.id ?? 0, p: r2(center), y: +yaw.toFixed(2), m: COMBO.indexOf(this.move), u: up ? 1 : 0 };
    if (up && st.wave) {
      // la medialuna: sale del pecho hacia la mira (apenas inclinada)
      const dir = new THREE.Vector3().copy(fwd);
      dir.y = Math.max(-0.3, Math.min(0.3, dir.y));
      dir.normalize();
      const o = tmpV3.copy(this.eye(tmpV3)).addScaledVector(dir, 1.1);
      o.y -= 0.42;
      const roll = { izq: 0.3, der: -0.3, arriba: Math.PI / 2 - 0.45 }[this.move];
      this.fx.wave(o, dir, roll, st.wave, true);
      msg.o = r2(o);
      msg.d = r2(dir);
    }
    g.net?.share('sable', msg);
  }

  doSlash(st, mv) {
    const g = this.g;
    const S = st.slash;
    const P = g.player.pos;
    const fwd = this.aim(tmpF, true);
    const eye = this.eye(new THREE.Vector3());
    const list = [];
    for (const { z, d } of g.zombies.inRadius(P, S.range + 0.7, near)) {
      const dx = z.pos.x - P.x;
      const dz = z.pos.z - P.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len > 0.9 && (dx / len) * fwd.x + (dz / len) * fwd.z < S.cos) continue;
      if (Math.abs(z.pos.y - P.y) > 2.5 && !z.crow) continue;
      // no corta a través de las paredes
      if (len > 1.2 && !g.world.clear(eye, tmpV2.set(z.pos.x, aimY(z), z.pos.z))) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    const n = S.targets + (this.move === 'arriba' ? 2 : 0);
    let hit = 0;
    const up = this.up;
    for (const { z } of list.slice(0, n)) {
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      this.hitZ(z, this.dmg(z, S, S), { type: 'scythe', zone: 'torso', point, dir: fwd.clone(), decap: Math.random() < (this.move === 'arriba' ? 0.75 : 0.5), melee: true }, true);
      // el acero que agarra la luz (y el celeste del de San Lorenzo)
      g.fx.sparks(point, 0.3, tmpV2.set(fwd.x, 0.5, fwd.z), up ? [0.6, 0.88, 1] : [1, 0.9, 0.72]);
      if (up) g.fx.sparkle(point, [0.55, 0.85, 1], 5, 0.5);
      hit++;
    }
    if (hit) {
      this.stopT = mv.stop + Math.min(0.03, hit * 0.006);
      g.hud.hitmarker(false);
      this.fx.sndHit(null, Math.min(1.4, 0.8 + hit * 0.12));
      g.fx.addShake(0.08 + Math.min(0.22, hit * 0.035) + (this.move === 'arriba' ? 0.08 : 0));
      g.player.addRecoil(mv.kick[0] * 0.6, mv.kick[1] * 0.4);
    }
    g.stats.shots++;
    // (el Yasy que uno tiene en la cara, afuera; La Tapera)
    g.yasy?.onMelee?.();
    // (el easter egg del Monumento: las telas de la bandera se cortan con el sable)
    g.ee?.onSableCut?.(eye, fwd, S.range + 0.8);
  }

  // Cuánto le pega a uno: de un tajo hasta la ronda oneHit; después de a dos
  // (12 rondas más) y de a tres. A los jefes, una parte de su vida.
  dmg(z, S, B) {
    const g = this.g;
    if (big(z)) return Math.max(B.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * B.boss);
    const r = g.rounds?.round || 1;
    if (r <= S.oneHit) return 1e9;
    return zombieHealth(r) / (r <= S.oneHit + 12 ? 1.9 : 2.8);
  }

  // El golpe (y la cuenta de la carga del de San Lorenzo).
  hitZ(z, amount, info, count) {
    const g = this.g;
    const was = !!z.dead;
    g.zombies.damage(z, amount, info);
    if (!count || !this.up || big(z)) return;
    const C = this.st?.carga;
    if (!C) return;
    // (de invitado lo mata el anfitrión: alcanza con que el golpe lo mate)
    const killed = g.net?.guest ? amount >= zombieHealth(g.rounds?.round || 1) * 0.95 : !was && z.dead;
    // (de invitado el muerto sigue en pie hasta que avisa el anfitrión: la
    // medialuna lo volvía a contar)
    if (killed && (this.counted.get(z) ?? -9) < g.time - 2) {
      this.counted.set(z, g.time);
      this.addKill(C);
    }
  }

  addKill(C) {
    if (this.kills >= C.kills) return;
    this.kills++;
    if (this.kills >= C.kills) this.sndReady();
  }

  // La medialuna de San Lorenzo: corta a todos los de la línea (una vez cada uno).
  waveHits(wv) {
    const g = this.g;
    const st = this.st;
    if (!st) return;
    const W = wv.W;
    const half = W.half * wv.k;
    const c = tmpV.copy(wv.o).addScaledVector(wv.dir, (wv.prev + wv.d) / 2);
    const rx = -wv.dir.z;
    const rz = wv.dir.x;
    const rl = Math.hypot(rx, rz) || 1;
    for (const { z } of g.zombies.inRadius(c, half + (wv.d - wv.prev) + 2, near)) {
      if (wv.hits.has(z)) continue;
      const dx = z.pos.x - wv.o.x;
      const dz = z.pos.z - wv.o.z;
      const along = dx * wv.dir.x + dz * wv.dir.z;
      if (along < wv.prev - 0.8 || along > wv.d + 0.5) continue;
      const lat = (dx * rx + dz * rz) / rl;
      if (Math.abs(lat) > half * 1.05) continue;
      if (Math.abs(aimY(z) - (wv.o.y + wv.dir.y * along)) > 2.2 && !z.crow) continue;
      wv.hits.add(z);
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const S = st.slash;
      this.hitZ(z, big(z) ? Math.max(1200, (z.maxHp || bossHealth(g.rounds?.round || 1)) * W.boss) : this.dmg(z, S, S), { type: 'scythe', zone: 'torso', point, dir: wv.dir.clone(), decap: Math.random() < 0.6 }, true);
      g.fx.sparkle(point, [0.6, 0.9, 1], 6, 0.6);
      g.hud.hitmarker(false);
    }
  }

  // ---------------- el tiro ----------------
  startThrow(st) {
    const g = this.g;
    this.mode = 'wind';
    this.t = 0;
    this.w.state = 'sable';
    this.w.stateT = 0;
    this.throwSt = st;
    g.net?.act?.('throw', 0.5);
  }

  // dónde está la mano en el mundo (para que salga y vuelva ahí)
  // Hacia dónde mira el jugador y dónde tiene los ojos (de él, no de la
  // cámara: las cinemáticas y las pruebas la mueven). flat: sin la altura.
  aim(out, flat = false) {
    const p = this.g.player;
    const cp = flat ? 1 : Math.cos(p.pitch);
    return out.set(-Math.sin(p.yaw) * cp, flat ? 0 : Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  eye(out) {
    const p = this.g.player;
    return out.set(p.pos.x, p.pos.y + (p.eye || 1.6), p.pos.z);
  }

  // (del jugador, no de la cámara: las cinemáticas y las pruebas la mueven)
  handWorld(out) {
    const p = this.g.player;
    _he.set(p.pitch, p.yaw, 0, 'YXZ');
    _hq.setFromEuler(_he);
    return out.set(0.26, -0.24, -0.4).applyQuaternion(_hq).add(tmpV3.set(p.pos.x, p.pos.y + (p.eye || 1.6), p.pos.z));
  }

  launch(st) {
    const g = this.g;
    const T = st.throw;
    const f = this.aim(new THREE.Vector3());
    f.y = Math.max(-0.4, Math.min(0.4, f.y));
    f.normalize();
    // sale derecho a la mira y vuelve abriéndose por la derecha
    const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
    // (sale un poco adelante de la mano)
    const o = this.handWorld(new THREE.Vector3()).addScaledVector(f, 0.55);
    const up = this.up;
    const fl = this.fx.throwStart({ id: g.net?.id ?? 0, own: true, up, o, f, r, R: T.reach, A: T.side, T: T.time, st, home: (out) => this.handWorld(out) });
    this.fly = fl;
    this.mode = 'away';
    this.t = 0;
    this.w.state = 'idle';
    this.cd = T.cd;
    this.fx.sndThrow(null, up);
    g.player.addRecoil(0.02, -0.01);
    g.stats.shots++;
    g.net?.share('sable', { k: 't', id: g.net.id, p: r2(o), f: r2(f), r: r2(r), R: T.reach, A: T.side, T: T.time, u: up ? 1 : 0 });
  }

  // El sable en el aire corta a lo que cruza (una vez a cada uno).
  flyHits(fl) {
    const g = this.g;
    const st = fl.st;
    const T = st.throw;
    const a = fl.prev;
    const b = fl.pos;
    // (el sable tirado también corta las telas del easter egg del Monumento)
    g.ee?.onSableFly?.(a, b, T.radius + 0.5);
    const ab = tmpV.subVectors(b, a);
    const len = ab.length();
    const dir = len > 1e-4 ? ab.clone().divideScalar(len) : fl.f.clone();
    for (const { z } of g.zombies.inRadius(b, T.radius + len + 1.6, near)) {
      if (fl.hits.has(z)) continue;
      const c = tmpV2.set(z.pos.x, aimY(z), z.pos.z);
      // distancia del muerto al tramo que hizo el sable este cuadro
      const k = len > 1e-4 ? clamp01(tmpV3.subVectors(c, a).dot(dir) / len) : 0;
      const q = tmpV3.copy(a).addScaledVector(dir, k * len);
      const reach = T.radius + (big(z) ? 0.9 : 0.35);
      if (Math.hypot(q.x - c.x, q.z - c.z) > reach || Math.abs(q.y - c.y) > 1.6) continue;
      fl.hits.add(z);
      const point = c.clone();
      this.hitZ(z, this.dmg(z, st.slash, T), { type: 'scythe', zone: 'torso', point, dir: dir.clone(), decap: Math.random() < 0.65 }, true);
      g.fx.sparks(point, 0.4, tmpV3.set(dir.x, 0.4, dir.z), fl.up ? [0.6, 0.88, 1] : [1, 0.9, 0.7]);
      this.fx.sndHit(point, 0.85);
      g.hud.hitmarker(false);
    }
  }

  onBounce(fl) {
    const g = this.g;
    g.net?.share('sable', { k: 'tb', id: g.net.id, p: r2(fl.pos) });
  }

  // Volvió a la mano.
  onCatch(fl) {
    const g = this.g;
    if (fl !== this.fly) return;
    this.fly = null;
    g.net?.share('sable', { k: 'tc', id: g.net.id });
    if (this.mode !== 'away') return;
    this.mode = 'wait';
    this.tryCatch();
  }

  tryCatch() {
    const w = this.w;
    if (this.mode !== 'wait') return;
    // con el sable en la mano y la mano libre: lo agarra con su golpe
    if (w.slot?.id === 'sable' && w.model?.sable && (w.state === 'idle' || w.state === 'sable')) {
      this.mode = 'catch';
      this.t = 0;
      w.state = 'sable';
      w.stateT = 0;
      w.model.sable.sab.visible = true;
      this.fx.sndCatch();
      this.g.fx.addShake(0.05);
      this.g.player.addRecoil(-0.012, 0);
    } else if (w.slot?.id !== 'sable') {
      // (con otro mate en la mano: vuelve a la vaina)
      this.mode = 'none';
      this.fx.sndCatch();
    }
  }

  // ---------------- la Carga de San Lorenzo ----------------
  fireCarga(st) {
    const g = this.g;
    const w = this.w;
    const C = st.carga;
    this.kills = 0;
    const fwd = this.aim(new THREE.Vector3(), true);
    const o = g.player.pos.clone();
    const reach = this.cargaReach(o, fwd, C.len);
    this.carga.start({ o, fwd, reach, C, own: true, id: g.net?.id ?? 0 });
    g.net?.share('sable', { k: 'c', id: g.net.id, p: r2(o), f: [+fwd.x.toFixed(3), +fwd.z.toFixed(3)], r: +reach.toFixed(1) });
    this.mode = 'carga';
    this.t = 0;
    w.state = 'sable';
    w.stateT = 0;
    g.post?.flash?.(0.08);
    g.fx.addShake(0.3);
    g.stats.shots++;
  }

  // Hasta dónde llegan: por el pasillo, hasta las paredes (un poco adentro).
  cargaReach(o, fwd, len) {
    const g = this.g;
    const right = tmpV3.set(-fwd.z, 0, fwd.x);
    const d = [0, -2.4, 2.4].map((l) => {
      const from = tmpV.copy(o).addScaledVector(right, l);
      from.y += 1.3;
      return Math.min(len, g.world.raycast(from, fwd, len, hitTmp));
    });
    return Math.max(6, Math.min(len, Math.max(d[0] + 2, (d[1] + d[2]) / 2 + 1)));
  }

  // Los muertos del pasillo entre from y to (a lo largo) caen todos; los
  // jefes se llevan un buen golpe (una vez).
  cargaHits(ch, from, to) {
    const g = this.g;
    const C = ch.C;
    const mid = (from + to) / 2;
    const c = tmpV.copy(ch.o).addScaledVector(ch.fwd, mid);
    c.y += 1;
    let n = 0;
    for (const { z } of g.zombies.inRadius(c, (to - from) / 2 + C.half + 2.5, near)) {
      if (ch.hits.has(z)) continue;
      const dx = z.pos.x - ch.o.x;
      const dz = z.pos.z - ch.o.z;
      const along = dx * ch.fwd.x + dz * ch.fwd.z;
      if (along < from || along > to + 0.4) continue;
      const lat = dx * ch.right.x + dz * ch.right.z;
      if (Math.abs(lat) > C.half + 0.5) continue;
      if (Math.abs(z.pos.y - ch.o.y) > 3 && !z.crow) continue;
      ch.hits.add(z);
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const amount = big(z) ? Math.max(C.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * C.boss) : 1e9;
      this.hitZ(z, amount, { type: 'scythe', zone: 'torso', point, dir: ch.fwd.clone(), decap: Math.random() < 0.55 }, false);
      g.fx.sparkle(point, [0.55, 0.85, 1], 8, 0.8);
      g.fx.sparks(point, 0.5, tmpV2.set(ch.fwd.x, 0.6, ch.fwd.z), [0.7, 0.9, 1]);
      if (big(z)) {
        g.fx.flash(point, 0x9ad4ff, 30, 0.25, 10);
        this.fx.sndClang(point);
      }
      n++;
    }
    if (n) {
      g.hud.hitmarker(false);
      g.fx.addShake(Math.min(0.12, n * 0.02));
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const w = this.w;
    this.dt = dt;
    this.cd -= dt;
    this.stopT = Math.max(0, this.stopT - dt);
    const m = w.model?.sable || null;
    // sacarlo (cambiar de mate, terminar de tomar, salir del Pack-a-Pava): desenvaina
    if (w.state === 'raise' && this.prevState !== 'raise' && m && w.slot?.id === 'sable') {
      if (this.mode === 'away' || this.mode === 'wait') m.sab.visible = false;
      else {
        this.mode = 'draw';
        this.t = 0;
        this.rHold = -1;
        m.sab.visible = true;
        this.fx.sndDraw();
      }
    }
    if (!m || w.slot?.id !== 'sable') {
      if (!['away', 'wait'].includes(this.mode)) this.mode = 'none';
      this.rHold = -1;
    } else if (this.mode === 'none') this.mode = 'idle';
    // algo cortó el golpe (la faka, una granada, tomar, inspeccionar)
    if (['slash', 'wind', 'catch', 'charge', 'carga'].includes(this.mode) && w.state !== 'sable') {
      if (this.mode === 'wind') m && (m.sab.visible = true);
      if (this.mode === 'catch' && m) m.sab.visible = true;
      this.mode = m ? 'idle' : 'none';
      this.rHold = -1;
    }
    if (this.mode === 'draw' && !['raise', 'idle', 'sable'].includes(w.state)) this.mode = 'idle';
    // (sin el sable en las manos, la carga se vacía: el de San Lorenzo arranca de cero)
    if (this.kills && !w.slots.some((s) => s.id === 'sable')) this.kills = 0;
    this.prevState = w.state;
    // el tiempo del golpe (frena un instante al pegar)
    this.t += dt * (this.stopT > 0 ? 0.08 : 1);
    const st = this.st;
    switch (this.mode) {
      case 'draw':
        if (this.t >= DRAW) this.mode = 'idle';
        break;
      case 'slash': {
        const mv = MOVES[this.move];
        const k = this.t / this.dur;
        if (!this.cut && k >= mv.cut && st) {
          this.cut = true;
          this.onCut(st, mv);
        }
        if (!this.hit && k >= mv.hit && st) {
          this.hit = true;
          this.doSlash(st, mv);
        }
        if (k >= 1) {
          this.toIdle();
          this.lastEnd = g.time;
        }
        break;
      }
      case 'wind':
        if (this.t >= WIND && st) this.launch(this.throwSt || st);
        break;
      case 'wait':
        this.tryCatch();
        break;
      case 'catch':
        if (this.t >= CATCH) this.toIdle();
        break;
      case 'carga':
        if (this.t >= 1.1) this.toIdle();
        break;
      default:
        break;
    }
    // mientras vuela, la mano está vacía
    if (m) m.sab.visible = !(this.mode === 'away' || this.mode === 'wait');
    this.fx.update(dt);
    this.carga.update(dt);
    this.updateHud();
    this.updateRemote(dt);
  }

  // La pose de la mano para Weapons.animate: [x, y, z, rx, ry, rz, lower
  // (-1: la de siempre), snap (1: sin suavizar)]. La muñeca (hacia dónde va
  // la hoja y el filo) y el antebrazo los pone acá.
  pose(dt) {
    const O = this.O;
    O.fill(0);
    O[6] = -1;
    const w = this.w;
    const m = w.model?.sable;
    if (!m) return O;
    const P = this.P;
    // (la faka, una granada o tomar: la mano es de ellos)
    if (['knife', 'throw', 'drink', 'empty'].includes(w.state)) {
      setPose(m, REST_P, 0);
      this.trailOn = false;
      return O;
    }
    let trail = false;
    let lower = -1;
    let snap = 0;
    let spin = 0;
    const g = this.g;
    for (let j = 0; j < 9; j++) P[j] = REST_P[j];
    if (w.state === 'inspect') {
      // el saludo: una vez, y vuelve solo
      const k = Math.min(1, w.stateT / SALUTE);
      sample(SALUTE_KEYS, k, P);
      lower = 0;
      if (k >= 1) w.state = 'idle';
    } else
      switch (this.mode) {
        case 'draw':
          sample(DRAW_KEYS, Math.min(1, this.t / DRAW), P);
          lower = 0;
          snap = 1;
          // (sin estela: la hoja pasa pegada a la cámara y la cinta tapaba media pantalla)
          break;
        case 'slash': {
          const mv = MOVES[this.move];
          const k = Math.min(1, this.t / this.dur);
          sample(mv.keys, k, P);
          snap = 1;
          trail = k >= mv.trail[0] && k <= mv.trail[1];
          break;
        }
        case 'wind': {
          const k = Math.min(1, this.t / WIND);
          sample(WIND_KEYS, k, P);
          snap = 1;
          trail = k > 0.6;
          break;
        }
        case 'away':
        case 'wait':
          lower = ['knife', 'throw', 'drink'].includes(w.state) ? -1 : 1.3;
          break;
        case 'catch': {
          // entra desde abajo a la derecha dando una vuelta sobre la hoja
          const k = Math.min(1, this.t / CATCH);
          sample(CATCH_KEYS, k, P);
          spin = (1 - smooth(Math.min(1, k / 0.6))) * Math.PI * 2;
          lower = 0;
          snap = 1;
          break;
        }
        case 'charge': {
          const k = smooth(clamp01(this.t / 0.25));
          mix(REST_P, RAISE, k, P);
          // tiembla de la fuerza
          P[0] += Math.sin(g.time * 53) * 0.002 * k;
          P[1] += Math.sin(g.time * 41 + 1) * 0.002 * k;
          break;
        }
        case 'carga': {
          const k = this.t;
          const into = smooth(clamp01(k / 0.12));
          const out = smooth(clamp01((k - 0.85) / 0.25));
          mix(RAISE, POINT, into, P);
          mix(P, REST_P, out, P);
          snap = k < 0.15 ? 1 : 0;
          break;
        }
        default: {
          // quieto: respira y la punta se mece apenas
          P[3] += Math.sin(g.time * 0.9) * 0.012;
          P[4] += Math.sin(g.time * 1.3) * 0.01;
          break;
        }
      }
    O[0] = P[0];
    O[1] = P[1];
    O[2] = P[2];
    O[6] = lower;
    O[7] = snap;
    setPose(m, P, spin);
    // la dragona se hamaca con los golpes
    if (m.dragona) {
      const sw = P[3];
      const vel = (sw - this.lastRz) / Math.max(1e-3, dt);
      this.lastRz = sw;
      this.dragV += (vel * 0.08 - this.dragA * 30 - this.dragV * 4) * dt;
      this.dragA = Math.max(-0.9, Math.min(0.9, this.dragA + this.dragV * dt));
      m.dragona.rotation.z = this.dragA + Math.sin(g.time * 1.7) * 0.05;
      m.dragona.rotation.x = Math.sin(g.time * 1.3 + 1) * 0.06;
    }
    // el de San Lorenzo late celeste (más con la carga llena o cargando)
    if (m.up) {
      const C = this.st?.carga;
      const full = C && this.kills >= C.kills;
      const k = this.mode === 'charge' || this.mode === 'carga' ? 1 : full ? 0.6 : 0;
      this.glow(k);
    }
    this.trailOn = trail && m.sab.visible;
    return O;
  }

  glow(k) {
    const M = this.w.model?.sable;
    if (!M) return;
    const g = this.g;
    const mats = this.glowMats || (this.glowMats = this.findGlowMats(M.sab));
    if (!mats) return;
    const pulse = 0.5 + 0.5 * Math.sin(g.time * (k > 0.8 ? 18 : 5));
    mats.steel.emissiveIntensity = 0.55 + k * (0.6 + pulse * 0.6);
    mats.edge.color.setRGB(0.42, 0.77, 1).multiplyScalar(1.9 + k * (0.8 + pulse));
  }

  findGlowMats(sab) {
    let steel = null;
    let edge = null;
    sab.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.emissiveMap && !steel) steel = o.material;
      if (o.material.isMeshBasicMaterial && o.material.polygonOffsetFactor === -2) edge = o.material;
    });
    return steel && edge ? { steel, edge } : null;
  }

  // La estela: se toma al dibujar la escena de la mano (onBeforeRender), con
  // la pose del cuadro ya puesta.
  trailTick() {
    const g = this.g;
    const now = g.time;
    if (this.trailFrame === now) return;
    const dt = this.trailFrame < 0 ? 0 : Math.max(0, Math.min(0.1, now - this.trailFrame));
    this.trailFrame = now;
    const pts = this.trailPts;
    for (const s of pts) s.age += dt;
    while (pts.length && pts[pts.length - 1].age > TRAIL_LIFE) this.trailFree.push(pts.pop());
    const m = this.w.model?.sable;
    if (this.trailOn && m && this.w.holder.visible) {
      const s = this.trailFree.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      m.tip.getWorldPosition(s.a);
      m.mid.getWorldPosition(s.b);
      s.age = 0;
      pts.unshift(s);
      if (pts.length > TRAIL_MAX) this.trailFree.push(pts.pop());
    }
    const tg = this.trail.geometry;
    if (pts.length < 2) {
      tg.setDrawRange(0, 0);
      return;
    }
    // (Catmull-Rom: tres pasos entre muestra y muestra)
    const P = tg.attributes.position.array;
    const Cc = tg.attributes.color.array;
    const up = !!m?.up;
    const col = up ? [0.16, 0.42, 0.95] : [0.26, 0.28, 0.34];
    const n = pts.length;
    let v = 0;
    const cr = (p0, p1, p2, p3, t, c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(n - 1, i + 2)];
      const steps = 3 + (i === n - 2 ? 1 : 0);
      for (let j = 0; j < steps && v < TRAIL_MAX * 3; j++) {
        const u = j / 3;
        const age = p1.age + (p2.age - p1.age) * u;
        const f = Math.max(0, 1 - age / TRAIL_LIFE) ** 1.5;
        P[v * 6] = cr(p0.a, p1.a, p2.a, p3.a, u, 'x');
        P[v * 6 + 1] = cr(p0.a, p1.a, p2.a, p3.a, u, 'y');
        P[v * 6 + 2] = cr(p0.a, p1.a, p2.a, p3.a, u, 'z');
        P[v * 6 + 3] = cr(p0.b, p1.b, p2.b, p3.b, u, 'x');
        P[v * 6 + 4] = cr(p0.b, p1.b, p2.b, p3.b, u, 'y');
        P[v * 6 + 5] = cr(p0.b, p1.b, p2.b, p3.b, u, 'z');
        Cc[v * 6] = col[0] * f;
        Cc[v * 6 + 1] = col[1] * f;
        Cc[v * 6 + 2] = col[2] * f;
        Cc[v * 6 + 3] = col[0] * f * 0.08;
        Cc[v * 6 + 4] = col[1] * f * 0.08;
        Cc[v * 6 + 5] = col[2] * f * 0.08;
        v++;
      }
    }
    tg.setDrawRange(0, Math.max(0, v - 1) * 6);
    tg.attributes.position.needsUpdate = true;
    tg.attributes.color.needsUpdate = true;
  }

  // ---------------- la carga en la pantalla ----------------
  // Un arquito celeste y blanco abajo de la mira que se llena con las bajas;
  // llena, el sol del medio se prende.
  updateHud() {
    const g = this.g;
    const st = this.st;
    const C = st?.carga;
    const on = !!C && this.up && g.player?.alive && !g.player.downed;
    if (!this.hudEl) {
      if (!on || !g.hud?.root) return;
      const el = document.createElement('div');
      el.className = 'mdu-sable-carga';
      el.style.cssText = 'position:absolute;left:50%;top:50%;width:72px;height:24px;margin-left:-36px;margin-top:20px;pointer-events:none;opacity:0;transition:opacity .25s;z-index:3';
      el.innerHTML = `<svg viewBox="0 0 72 24" width="72" height="24" style="overflow:visible">
<defs><linearGradient id="mduSlG" x1="0" x2="1"><stop offset="0" stop-color="#74c4ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#74c4ff"/></linearGradient></defs>
<path d="M6 5 Q36 22 66 5" pathLength="100" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="3" stroke-linecap="round"/>
<path class="f" d="M6 5 Q36 22 66 5" pathLength="100" fill="none" stroke="url(#mduSlG)" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 100"/>
<circle class="s" cx="36" cy="13.5" r="3.2" fill="#ffd25a" opacity="0"/></svg>`;
      g.hud.root.appendChild(el);
      this.hudEl = el;
      this.hudF = el.querySelector('.f');
      this.hudS = el.querySelector('.s');
      this.hudK = -1;
    }
    if (this.hudEl.parentNode !== g.hud?.root && g.hud?.root) g.hud.root.appendChild(this.hudEl);
    const vis = on ? '1' : '0';
    if (this.hudVis !== vis) {
      this.hudVis = vis;
      this.hudEl.style.opacity = vis;
    }
    if (!on) return;
    const k = Math.min(1, this.kills / C.kills);
    const q = Math.round(k * 100);
    if (q !== this.hudK) {
      this.hudK = q;
      this.hudF.setAttribute('stroke-dasharray', `${q} 100`);
    }
    // llena: el sol late
    const sun = k >= 1 ? (0.65 + 0.35 * Math.sin(g.time * 6)).toFixed(2) : '0';
    if (sun !== this.hudSun) {
      this.hudSun = sun;
      this.hudS.setAttribute('opacity', sun);
      this.hudS.style.filter = k >= 1 ? 'drop-shadow(0 0 4px #ffcf4a)' : '';
    }
  }

  // ---------------- en línea ----------------
  // Lo de otro jugador: lo mismo que se ve acá, sin daño.
  ghost(m) {
    const g = this.g;
    if (m.id != null && m.id === g.net?.id) return;
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const ok = (a, n = 3) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
    switch (m.k) {
      case 's': {
        if (!ok(m.p)) return;
        const move = COMBO[m.m] || 'izq';
        const at = V(m.p);
        const range = (m.u ? WEAPONS.sable.pap.slash : WEAPONS.sable.slash).range;
        this.fx.slashArc(at, +m.y || 0, move, range, !!m.u);
        this.fx.sndSwish(at, MOVES[move].k, !!m.u);
        if (m.u && ok(m.o) && ok(m.d)) {
          const roll = { izq: 0.3, der: -0.3, arriba: Math.PI / 2 - 0.45 }[move];
          this.fx.wave(V(m.o), V(m.d).normalize(), roll, WEAPONS.sable.pap.wave, false);
        }
        break;
      }
      case 't': {
        if (!ok(m.p) || !ok(m.f) || !ok(m.r)) return;
        const id = m.id;
        const fl = this.fx.throwStart({
          id,
          own: false,
          up: !!m.u,
          o: V(m.p),
          f: V(m.f).normalize(),
          r: V(m.r).normalize(),
          R: Math.min(30, +m.R || 13),
          A: Math.min(10, +m.A || 3.6),
          T: Math.max(0.5, Math.min(3, +m.T || 1.35)),
          home: (out) => {
            const r = g.net?.remote?.get(id);
            return r?.pos ? out.set(r.pos.x, (r.pos.y || 0) + 1.3, r.pos.z) : out.copy(fl.o);
          },
          onEnd: () => this.avatarSable(id, true),
        });
        this.fx.sndThrow(fl.o, !!m.u);
        this.avatarSable(id, false);
        break;
      }
      case 'tb': {
        const fl = this.fx.flyers.find((x) => x.on && !x.own && x.id === m.id);
        if (fl && fl.mode === 'arc') {
          if (ok(m.p)) fl.pos.copy(V(m.p));
          this.fx.bounce(fl, null);
        }
        break;
      }
      case 'tc': {
        const fl = this.fx.flyers.find((x) => x.on && !x.own && x.id === m.id);
        if (fl) this.fx.endFlyer(fl);
        this.avatarSable(m.id, true);
        break;
      }
      case 'c': {
        if (!ok(m.p) || !ok(m.f, 2)) return;
        const fwd = new THREE.Vector3(m.f[0], 0, m.f[1]);
        if (fwd.lengthSq() < 1e-4) return;
        fwd.normalize();
        const C = WEAPONS.sable.pap.carga;
        this.carga.start({ o: V(m.p), fwd, reach: Math.max(4, Math.min(C.len, +m.r || C.len)), C, own: false, id: m.id });
        break;
      }
      default:
        break;
    }
  }

  // El sable en la mano del muñeco de un compañero (se esconde mientras vuela).
  avatarSable(id, on) {
    const a = this.g.net?.avatars?.list?.get(id);
    const gun = a?.gun?.children?.[0];
    if (gun && a.wkey?.startsWith('sable|')) gun.visible = on;
  }

  // Lo de los compañeros: la carga se compila apenas alguien tiene el de San
  // Lorenzo (para que la primera no trabe).
  updateRemote(dt) {
    const g = this.g;
    // el sable en la mano del muñeco de un compañero: de tamaño de verdad (el
    // de la mano está achicado como todo lo de primera persona)
    for (const a of g.net?.avatars?.list?.values() || []) {
      const c = a.gun?.children?.[0];
      if (c && !c.userData.sableBig && a.wkey?.startsWith('sable|')) {
        c.scale.setScalar(AVATAR_K);
        c.userData.sableBig = true;
      }
    }
    this.warmT -= dt;
    if (this.warmed || this.warmT > 0) return;
    this.warmT = 1;
    const remote = g.net?.wpn ? [...g.net.wpn.values()].some((x) => x.w === 'sable' && x.u >= 1) : false;
    if (this.up || remote) {
      this.carga.ensure();
      this.carga.hideAll();
      this.warmed = true;
    }
  }

  clear() {
    this.fx.clear();
    this.carga.clear();
    this.fly = null;
    if (this.mode === 'away' || this.mode === 'wait') this.mode = 'idle';
    const m = this.w.model?.sable;
    if (m) m.sab.visible = true;
    this.rHold = -1;
    this.trailPts.length = 0;
    this.trail.geometry.setDrawRange(0, 0);
    this.warmed = false;
  }

  // Al llamar a reset (partida nueva): la carga vacía.
  reset() {
    this.kills = 0;
    this.cd = 0;
    this.clear();
    this.mode = 'none';
  }

  // ---------------- lo que se escucha ----------------
  // La carga llena: un acorde de clarín corto, celeste.
  sndReady() {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ gain: 0.5, reverb: 0.5 });
    [784, 988, 1175, 1568].forEach((f, i) => a.tone(o, { t: t + i * 0.06, dur: 0.6, type: 'triangle', freq: f, gain: 0.07, attack: 0.01 }));
    a.tone(o, { t, dur: 0.9, type: 'sine', freq: 3136, gain: 0.02, attack: 0.05 });
  }

  // Cargando la carga: el acero que zumba y sube.
  sndCharge() {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ gain: 0.5, reverb: 0.3 });
    a.tone(o, { t, dur: 0.45, type: 'sawtooth', freq: 180, freqEnd: 520, gain: 0.05, attack: 0.05 });
    a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 900, freqEnd: 3600, q: 3, gain: 0.25, attack: 0.1 });
  }
}
