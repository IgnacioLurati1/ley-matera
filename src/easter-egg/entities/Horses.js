import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import HorseSkin from './horseSkin';

// Caballos del infierno: la ronda especial de la granja (el lugar de los
// carpinchos del molino). Por dentro son los mismos "perros" (Zombies los
// trata igual); acá solo se dibujan: cuerpo, cogote con la cabeza, crines,
// cola, cuatro patas largas con vasos y los ojos que brillan. Galopan,
// se paran de manos para pegar y caen de costado.

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

const LEGS = [
  [0.19, 0.5],
  [-0.19, 0.5],
  [0.19, -0.5],
  [-0.19, -0.5],
];
const HIP_Y = 1.05;
const UPPER = 0.5;
const LOWER = 0.52;

export default class HorseRig {
  // mixed: en la torre solo dibuja los especiales marcados como caballo
  constructor(game, max, eyeMat, mixed = false) {
    this.g = game;
    this.max = max;
    this.mixed = mixed;
    this.flag = mixed ? 'horseShown' : 'dogShown';
    const coat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
    const mane = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.9 });
    const hoof = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.6 });
    const body = mergeGeometries([
      new THREE.CapsuleGeometry(0.33, 0.95, 4, 12).rotateX(Math.PI / 2),
      new THREE.SphereGeometry(0.36, 12, 9).scale(1, 1, 0.9).translate(0, 0.02, -0.52),
      new THREE.SphereGeometry(0.34, 12, 9).translate(0, 0.04, 0.45),
    ]);
    // cogote y cabeza (el pivote es la cruz, arriba de las manos)
    const head = mergeGeometries([
      new THREE.CylinderGeometry(0.13, 0.2, 0.78, 10).translate(0, 0.39, 0).rotateX(0.62),
      new THREE.BoxGeometry(0.22, 0.24, 0.52).translate(0, 0.62, 0.62).rotateX(0.18),
      new THREE.BoxGeometry(0.2, 0.18, 0.2).translate(0, 0.52, 0.86).rotateX(0.18),
      new THREE.ConeGeometry(0.04, 0.14, 5).translate(0.07, 0.86, 0.46),
      new THREE.ConeGeometry(0.04, 0.14, 5).translate(-0.07, 0.86, 0.46),
    ]);
    const maneGeo = new THREE.BoxGeometry(0.05, 0.14, 0.72).translate(0, 0.08, 0).rotateX(-0.95).translate(0, 0.42, 0.18);
    const jaw = new THREE.BoxGeometry(0.16, 0.05, 0.2).translate(0, -0.02, 0.08);
    const upper = new THREE.CapsuleGeometry(0.075, UPPER - 0.1, 3, 8).translate(0, -UPPER / 2, 0);
    const lower = new THREE.CapsuleGeometry(0.05, LOWER - 0.1, 3, 6).translate(0, -LOWER / 2, 0);
    const hoofGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.1, 8).translate(0, -LOWER + 0.02, 0.01);
    const tail = mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.02, 0.8, 6).translate(0, -0.4, 0),
      new THREE.CylinderGeometry(0.1, 0.03, 0.55, 6).translate(0, -0.55, 0.02),
    ]);
    const eye = new THREE.SphereGeometry(0.03, 6, 5);
    const mk = (geo, mat, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      game.scene.add(im);
      return im;
    };
    this.body = mk(body, coat, max);
    this.head = mk(head, coat, max);
    this.mane = mk(maneGeo, mane, max);
    this.jaw = mk(jaw, coat, max);
    this.upper = mk(upper, coat, max * 4);
    this.lower = mk(lower, coat, max * 4);
    this.hoof = mk(hoofGeo, hoof, max * 4);
    this.tail = mk(tail, mane, max);
    this.eyes = mk(eye, eyeMat, max * 2);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      // pelajes: moro, zaino, tordillo ceniza y un overo quemado
      c.setHex([0x1c1a1a, 0x4a2a18, 0x6e6a66, 0x5a3a22][i % 4]);
      for (const im of [this.body, this.head, this.jaw]) im.setColorAt(i, c);
      for (let k = 0; k < 4; k++) {
        this.upper.setColorAt(i * 4 + k, c);
        this.lower.setColorAt(i * 4 + k, c);
      }
    }
    this.all = [this.body, this.head, this.mane, this.jaw, this.upper, this.lower, this.hoof, this.tail, this.eyes];
    this.last = game.time;
    // el cuerpo de verdad (entities/horseSkin.js): mientras baja, las piezas
    this.skin = new HorseSkin(game, eyeMat);
    this.skinM = new THREE.Matrix4();
  }

  hide(slot) {
    this.hidePieces(slot);
    this.skin?.hide(slot);
  }

  hidePieces(slot) {
    for (const im of [this.body, this.head, this.mane, this.jaw, this.tail]) im.setMatrixAt(slot, ZERO);
    for (let k = 0; k < 4; k++) {
      this.upper.setMatrixAt(slot * 4 + k, ZERO);
      this.lower.setMatrixAt(slot * 4 + k, ZERO);
      this.hoof.setMatrixAt(slot * 4 + k, ZERO);
    }
    this.eyes.setMatrixAt(slot * 2, ZERO);
    this.eyes.setMatrixAt(slot * 2 + 1, ZERO);
  }

  update(pool) {
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, g.time - this.last));
    this.last = g.time;
    const mine = (z) => z.dog && (!this.mixed || z.horse);
    const any = pool.some((z) => mine(z) && z.active);
    if (!any && !this.on) return;
    this.on = any;
    // las piezas se dibujan solo si alguno las usa (con el modelo quedan vacías)
    let pieces = false;
    const flag = this.flag;
    for (const z of pool) {
      if (!mine(z) || !z.active || z.state === 'dogspawn') {
        if (z[flag]) {
          this.hide(z.slot);
          z[flag] = false;
        }
        continue;
      }
      z[flag] = true;
      const vx = z.pos.x - (z.lastX ?? z.pos.x);
      const vz = z.pos.z - (z.lastZ ?? z.pos.z);
      z.lastX = z.pos.x;
      z.lastZ = z.pos.z;
      const sp = dt > 0 ? Math.min(12, Math.hypot(vx, vz) / dt) : 0;
      z.dogSpeed = (z.dogSpeed || 0) + (sp - (z.dogSpeed || 0)) * Math.min(1, dt * 8);
      const run = Math.min(1, z.dogSpeed / 5.5);
      z.gait = (z.gait || 0) + dt * (3 + z.dogSpeed * 1.5);
      const ph = z.gait;
      let pitch = Math.sin(ph * 2) * 0.05 * run;
      let roll = 0;
      let y = Math.abs(Math.sin(ph)) * 0.1 * run;
      let headP = -0.1 + Math.sin(ph * 2) * 0.12 * run;
      let jawA = 0.05;
      const legs = [0, 0, 0, 0];
      let bend = 0.25;
      let tailA = 0.3 + run * 0.5;
      if (z.dead) {
        const k = Math.min(1, z.stateT / 0.5);
        roll = k * 1.45;
        y = -k * 0.62;
        headP = 0.4 * k;
        jawA = 0.4;
        bend = 0.1;
        tailA = 0.2;
      } else if (z.state === 'attack') {
        // se para de manos y baja pegando con los vasos
        const k = Math.min(1, (z.attackT || 0) / 0.45);
        const s = Math.sin(k * Math.PI);
        pitch = -s * 0.75;
        y = s * 0.2;
        headP = -0.4 * s - 0.1;
        jawA = 0.1 + s * 0.5;
        legs[0] = -s * 1.3 + Math.sin(g.time * 22) * 0.3 * s;
        legs[1] = -s * 1.1 - Math.sin(g.time * 22) * 0.3 * s;
      } else {
        // galope: las de atrás juntas y las de adelante juntas, desfasadas
        const a = 0.8 * run + 0.06;
        legs[0] = Math.sin(ph) * a;
        legs[1] = Math.sin(ph + 0.5) * a;
        legs[2] = Math.sin(ph + Math.PI) * a;
        legs[3] = Math.sin(ph + Math.PI + 0.5) * a;
        jawA = 0.08 + run * 0.15;
        // chispas de fuego en los vasos cuando galopan
        if (run > 0.6 && Math.random() < dt * 6) g.fx.fire(tmpV.set(z.pos.x, 0.15, z.pos.z), 0.5, 1);
      }
      tmpE.set(pitch, z.yaw, roll, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpV.set(z.pos.x, (z.baseY || 0) + y, z.pos.z);
      const s = z.scale || 1;
      tmpM.compose(tmpV, tmpQ, tmpS.set(s, s, s));
      // con el cuerpo de verdad: los mismos números a sus huesos, sin las piezas
      const legP = LEGS.map(([, lz], k) => ({ sw: legs[k], bend: bend + Math.max(0, lz > 0 ? -legs[k] : legs[k]) * 0.7 }));
      if (this.skin?.pose(z.slot, { M: this.skinM.copy(tmpM), s, headP, jawA, tailR: -tailA + Math.sin(ph * 2) * 0.1 * run, legs: legP })) {
        this.hidePieces(z.slot);
        continue;
      }
      pieces = true;
      this.body.setMatrixAt(z.slot, local(tmpM, 0, HIP_Y + 0.22, 0, 0, 0, 0));
      const H = local(tmpM, 0, HIP_Y + 0.35, 0.55, headP, 0, 0);
      this.head.setMatrixAt(z.slot, H);
      this.mane.setMatrixAt(z.slot, H);
      tmpR.copy(H).multiply(tmpL.makeRotationX(0.18 + jawA * 0.4).setPosition(0, 0.44, 0.8));
      this.jaw.setMatrixAt(z.slot, tmpR);
      for (const sx of [-1, 1]) {
        tmpR.copy(H).multiply(tmpL.makeTranslation(sx * 0.115, 0.7, 0.58));
        this.eyes.setMatrixAt(z.slot * 2 + (sx < 0 ? 0 : 1), tmpR);
      }
      this.tail.setMatrixAt(z.slot, local(tmpM, 0, HIP_Y + 0.32, -0.95, -tailA + Math.sin(ph * 2) * 0.1 * run, 0, 0));
      LEGS.forEach(([lx, lz], k) => {
        const front = lz > 0;
        const sw = legs[k];
        const hip = local(tmpM, lx, HIP_Y, lz, sw, 0, 0);
        this.upper.setMatrixAt(z.slot * 4 + k, hip);
        const knee = tmpR.copy(hip).multiply(tmpL.makeRotationX((front ? -1 : 1) * (bend + Math.max(0, front ? -sw : sw) * 0.7)).setPosition(0, -UPPER, 0));
        this.lower.setMatrixAt(z.slot * 4 + k, knee);
        this.hoof.setMatrixAt(z.slot * 4 + k, knee);
      });
    }
    for (const im of this.all) {
      im.visible = pieces;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // Rayo contra el caballo: la cabeza y tres esferas a lo largo del cuerpo.
  static raycast(z, o, d, maxT) {
    const s = z.scale || 1;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const by = z.baseY || 0;
    const head = { x: z.pos.x + fx * 1.15 * s, y: by + 2.0 * s, z: z.pos.z + fz * 1.15 * s, r: 0.24 * s };
    const th = sphereHit(o, d, head, maxT);
    let best = th === null ? null : { t: th, zone: 'head' };
    for (const k of [-0.5, 0, 0.5, 0.8]) {
      const c = { x: z.pos.x + fx * k * s, y: by + (k > 0.7 ? 1.6 : 1.27) * s, z: z.pos.z + fz * k * s, r: 0.4 * s };
      const t = sphereHit(o, d, c, maxT);
      if (t !== null && (!best || t < best.t)) best = { t, zone: 'torso' };
    }
    // las patas también frenan tiros (los que se tiran agachados)
    const legs = { x: z.pos.x, y: by + 0.6 * s, z: z.pos.z, r: 0.45 * s };
    const tl = sphereHit(o, d, legs, maxT);
    if (tl !== null && (!best || tl < best.t)) best = { t: tl, zone: 'torso' };
    return best;
  }
}

const _loc = new THREE.Matrix4();
const _out = new THREE.Matrix4();
function local(base, x, y, z, rx, ry, rz) {
  tmpE.set(rx, ry, rz, 'YXZ');
  _loc.makeRotationFromEuler(tmpE).setPosition(x, y, z);
  return _out.multiplyMatrices(base, _loc);
}

function sphereHit(o, d, c, maxT) {
  const ox = c.x - o.x;
  const oy = c.y - o.y;
  const oz = c.z - o.z;
  const t = ox * d.x + oy * d.y + oz * d.z;
  if (t < 0 || t > maxT) return null;
  const px = ox - d.x * t;
  const py = oy - d.y * t;
  const pz = oz - d.z * t;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > c.r * c.r) return null;
  return t - Math.sqrt(c.r * c.r - d2);
}
