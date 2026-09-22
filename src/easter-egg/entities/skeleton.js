import * as THREE from 'three';

// Esqueleto procedural compartido por zombies y el Capataz. Calcula la matriz
// de mundo de cada parte a partir de unos pocos ángulos (pose).
// El cuerpo mira hacia +z. Pitch positivo en el torso = inclinarse adelante;
// pitch negativo en hombro/cadera = llevar el brazo/pierna hacia adelante;
// codo negativo = flexionar; rodilla positiva = flexionar.

export const PART = {
  pelvis: 0,
  torso: 1,
  head: 2,
  uarmL: 3,
  uarmR: 4,
  farmL: 5,
  farmR: 6,
  thighL: 7,
  thighR: 8,
  shinL: 9,
  shinR: 10,
  footL: 11,
  footR: 12,
  hat: 13,
  eyeL: 14,
  eyeR: 15,
  extra1: 16,
  extra2: 17,
};
export const PART_COUNT = 18;

// Medias medidas locales (para impactos) y zona de daño de cada parte.
export const HITBOX = [
  { part: 0, h: [0.17, 0.11, 0.1], zone: 'limb' },
  { part: 1, h: [0.21, 0.28, 0.125], zone: 'torso' },
  { part: 2, h: [0.115, 0.135, 0.125], zone: 'head' },
  { part: 3, h: [0.06, 0.15, 0.06], zone: 'limb', arm: 0 },
  { part: 4, h: [0.06, 0.15, 0.06], zone: 'limb', arm: 1 },
  { part: 5, h: [0.055, 0.17, 0.055], zone: 'limb', arm: 0 },
  { part: 6, h: [0.055, 0.17, 0.055], zone: 'limb', arm: 1 },
  { part: 7, h: [0.08, 0.22, 0.08], zone: 'limb', leg: 0 },
  { part: 8, h: [0.08, 0.22, 0.08], zone: 'limb', leg: 1 },
  { part: 9, h: [0.07, 0.22, 0.07], zone: 'limb', leg: 0 },
  { part: 10, h: [0.07, 0.22, 0.07], zone: 'limb', leg: 1 },
];

export function makePose() {
  return {
    rootY: 0,
    rootPitch: 0,
    rootRoll: 0,
    hipY: 0.93,
    torsoP: 0,
    torsoY: 0,
    torsoR: 0,
    headP: 0,
    headY: 0,
    headR: 0,
    shLp: 0,
    shLr: 0.1,
    shRp: 0,
    shRr: -0.1,
    elL: 0,
    elR: 0,
    hipLp: 0,
    hipLr: 0,
    hipRp: 0,
    hipRr: 0,
    knL: 0,
    knR: 0,
  };
}

export function copyPose(a, b) {
  for (const k in b) a[k] = b[k];
  return a;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const L = new THREE.Matrix4();
const root = new THREE.Matrix4();
const hip = new THREE.Matrix4();
const spine = new THREE.Matrix4();
const neck = new THREE.Matrix4();
const sh = new THREE.Matrix4();
const el = new THREE.Matrix4();
const hj = new THREE.Matrix4();
const kn = new THREE.Matrix4();

function local(x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'XYZ');
  L.makeRotationFromEuler(_e);
  L.setPosition(x, y, z);
  return L;
}

// Escribe en mats (array de Matrix4) la matriz de mundo de cada parte.
export function solvePose(mats, x, z, yaw, scale, P) {
  _e.set(P.rootPitch, yaw, P.rootRoll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, P.rootY, z);
  _s.set(scale, scale, scale);
  root.compose(_p, _q, _s);

  hip.multiplyMatrices(root, local(0, P.hipY, 0));
  mats[0].multiplyMatrices(hip, local(0, 0, 0));
  spine.multiplyMatrices(hip, local(0, 0.08, 0, P.torsoP, P.torsoY, P.torsoR));
  mats[1].multiplyMatrices(spine, local(0, 0.28, 0));
  neck.multiplyMatrices(spine, local(0, 0.56, 0.02, P.headP, P.headY, P.headR));
  mats[2].multiplyMatrices(neck, local(0, 0.14, 0.01));
  mats[13].multiplyMatrices(mats[2], local(0, 0.14, -0.01, -0.12, 0, 0));
  mats[14].multiplyMatrices(mats[2], local(-0.048, 0.03, 0.122));
  mats[15].multiplyMatrices(mats[2], local(0.048, 0.03, 0.122));

  for (let s = 0; s < 2; s++) {
    const sx = s === 0 ? -0.27 : 0.27;
    const p = s === 0 ? P.shLp : P.shRp;
    const r = s === 0 ? P.shLr : P.shRr;
    sh.multiplyMatrices(spine, local(sx, 0.5, 0, p, 0, r));
    mats[3 + s].multiplyMatrices(sh, local(0, -0.15, 0));
    el.multiplyMatrices(sh, local(0, -0.29, 0, s === 0 ? P.elL : P.elR));
    mats[5 + s].multiplyMatrices(el, local(0, -0.16, 0));
  }
  for (let s = 0; s < 2; s++) {
    const sx = s === 0 ? -0.1 : 0.1;
    const p = s === 0 ? P.hipLp : P.hipRp;
    const r = s === 0 ? P.hipLr : P.hipRr;
    hj.multiplyMatrices(hip, local(sx, -0.03, 0, p, 0, r));
    mats[7 + s].multiplyMatrices(hj, local(0, -0.21, 0));
    kn.multiplyMatrices(hj, local(0, -0.43, 0, s === 0 ? P.knL : P.knR));
    mats[9 + s].multiplyMatrices(kn, local(0, -0.21, 0));
    mats[11 + s].multiplyMatrices(kn, local(0, -0.45, 0.04, -(s === 0 ? P.knL : P.knR) * 0.3));
  }
}

// Extras (poncho y pala del Capataz), relativos al torso y al antebrazo derecho.
export function solveExtras(mats) {
  mats[16].multiplyMatrices(mats[1], local(0, -0.05, 0, 0.05, 0, 0));
  mats[17].multiplyMatrices(mats[6], local(0, -0.18, 0.05, Math.PI / 2 + 0.3, 0, 0));
}

const _inv = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

// Rayo contra las cajas de las partes. Devuelve { t, part, zone } o null.
// La dirección se lleva al espacio local sin normalizar, así t sigue en metros.
export function hitParts(mats, o, d, maxT, hidden = 0) {
  let best = null;
  for (const hb of HITBOX) {
    if (hidden & (1 << hb.part)) continue;
    _inv.copy(mats[hb.part]).invert();
    _o.copy(o).applyMatrix4(_inv);
    _d.copy(d).applyMatrix3(_m3.setFromMatrix4(_inv));
    const t = slab(_o, _d, hb.h);
    if (t !== null && t <= maxT && (!best || t < best.t)) {
      let zone = hb.zone;
      if (zone === 'torso' && _o.y + _d.y * t > 0.2) zone = 'neck';
      best = { t, part: hb.part, zone, arm: hb.arm, leg: hb.leg };
    }
  }
  return best;
}

function slab(o, d, h) {
  let tmin = -Infinity;
  let tmax = Infinity;
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < -h[i] || oo[i] > h[i]) return null;
      continue;
    }
    let t1 = (-h[i] - oo[i]) / dd[i];
    let t2 = (h[i] - oo[i]) / dd[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}
