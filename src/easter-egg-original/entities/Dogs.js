import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Carpinchos endemoniados de las rondas especiales (el lugar de los perros
// del original). Por dentro son "zombies" del mismo grupo (así las armas, los
// puntos, las rondas y el online los tratan igual); acá solo se dibujan: un
// carpincho barrigón de patas cortas y cabezota cuadrada, con ojos que
// brillan, animado a mano (trote, embestida y caída).

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

// dónde van las patas (x, z) respecto del cuerpo
const LEGS = [
  [0.14, 0.26, 0],
  [-0.14, 0.26, Math.PI],
  [0.14, -0.26, Math.PI],
  [-0.14, -0.26, 0],
];
const HIP_Y = 0.36;
const UPPER = 0.16;
const LOWER = 0.17;

export default class DogRig {
  constructor(game, max, eyeMat) {
    this.g = game;
    this.max = max;
    const T = game.textures;
    const fur = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.burlap || null, roughness: 1 });
    // barril peludo, más alto atrás que adelante
    const body = mergeGeometries([
      new THREE.CapsuleGeometry(0.21, 0.42, 4, 12).rotateX(Math.PI / 2).scale(0.95, 0.95, 1),
      new THREE.SphereGeometry(0.22, 12, 9).scale(1, 1.02, 0.9).translate(0, 0.03, -0.2),
    ]);
    // cabezota cuadrada con el hocico chato, orejitas redondas arriba
    const head = mergeGeometries([
      new THREE.BoxGeometry(0.19, 0.19, 0.24).translate(0, 0, 0.02),
      new THREE.SphereGeometry(0.105, 10, 8).scale(0.95, 0.95, 1.1).translate(0, 0.01, -0.06),
      new THREE.BoxGeometry(0.17, 0.15, 0.1).translate(0, -0.02, 0.17),
      new THREE.SphereGeometry(0.03, 7, 5).scale(1, 1, 0.6).translate(0.075, 0.1, -0.06),
      new THREE.SphereGeometry(0.03, 7, 5).scale(1, 1, 0.6).translate(-0.075, 0.1, -0.06),
      // cogote gordo hasta el cuerpo
      new THREE.CylinderGeometry(0.11, 0.15, 0.16, 10).rotateX(-1.2).translate(0, -0.03, -0.16),
    ]);
    const jaw = new THREE.BoxGeometry(0.13, 0.035, 0.1).translate(0, -0.015, 0.05);
    // las patas cuelgan de su pivote (arriba)
    const upper = new THREE.CapsuleGeometry(0.06, UPPER - 0.06, 3, 8).translate(0, -UPPER / 2, 0);
    const lower = mergeGeometries([
      new THREE.CapsuleGeometry(0.042, LOWER - 0.06, 3, 6).translate(0, -LOWER / 2, 0),
      new THREE.BoxGeometry(0.08, 0.03, 0.1).translate(0, -LOWER + 0.01, 0.03),
    ]);
    // el carpincho casi no tiene cola: un muñón
    const tail = new THREE.SphereGeometry(0.035, 6, 5).translate(0, 0.02, 0);
    const eye = new THREE.SphereGeometry(0.018, 6, 5);
    const mk = (geo, mat, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      game.scene.add(im);
      return im;
    };
    this.body = mk(body, fur, max);
    this.head = mk(head, fur, max);
    this.jaw = mk(jaw, fur, max);
    this.upper = mk(upper, fur, max * 4);
    this.lower = mk(lower, fur, max * 4);
    this.tail = mk(tail, fur, max);
    this.eyes = mk(eye, eyeMat, max * 2);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      // pelajes de carpincho: marrón rojizo, canela, tierra y uno medio quemado
      c.setHex([0x8a5a36, 0x9a6a40, 0x6e4a2e, 0x4e3624][i % 4]);
      this.body.setColorAt(i, c);
      this.head.setColorAt(i, c);
      this.jaw.setColorAt(i, c);
      this.tail.setColorAt(i, c);
      for (let k = 0; k < 4; k++) {
        this.upper.setColorAt(i * 4 + k, c);
        this.lower.setColorAt(i * 4 + k, c);
      }
    }
    this.all = [this.body, this.head, this.jaw, this.upper, this.lower, this.tail, this.eyes];
    this.last = game.time;
  }

  hide(slot) {
    this.body.setMatrixAt(slot, ZERO);
    this.head.setMatrixAt(slot, ZERO);
    this.jaw.setMatrixAt(slot, ZERO);
    this.tail.setMatrixAt(slot, ZERO);
    for (let k = 0; k < 4; k++) {
      this.upper.setMatrixAt(slot * 4 + k, ZERO);
      this.lower.setMatrixAt(slot * 4 + k, ZERO);
    }
    this.eyes.setMatrixAt(slot * 2, ZERO);
    this.eyes.setMatrixAt(slot * 2 + 1, ZERO);
  }

  // Pone cada perro en su pose del momento.
  update(pool) {
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, g.time - this.last));
    this.last = g.time;
    // sin carpinchos en juego no se dibuja nada (ahorra llamadas y triángulos)
    const any = pool.some((z) => z.dog && z.active);
    if (!any && !this.on) return;
    this.on = any;
    for (const im of this.all) im.visible = any;
    for (const z of pool) {
      if (!z.dog || !z.active || z.state === 'dogspawn') {
        if (z.dogShown) {
          this.hide(z.slot);
          z.dogShown = false;
        }
        continue;
      }
      z.dogShown = true;
      // velocidad real (sirve igual para los perros que maneja otra compu)
      const vx = z.pos.x - (z.lastX ?? z.pos.x);
      const vz = z.pos.z - (z.lastZ ?? z.pos.z);
      z.lastX = z.pos.x;
      z.lastZ = z.pos.z;
      const sp = dt > 0 ? Math.min(9, Math.hypot(vx, vz) / dt) : 0;
      z.dogSpeed = (z.dogSpeed || 0) + (sp - (z.dogSpeed || 0)) * Math.min(1, dt * 8);
      const run = Math.min(1, z.dogSpeed / 5);
      z.gait = (z.gait || 0) + dt * (4 + z.dogSpeed * 2.2);
      const ph = z.gait;
      let pitch = 0;
      let roll = 0;
      let y = Math.abs(Math.sin(ph * 2)) * 0.04 * run;
      let headP = Math.sin(ph * 2) * 0.06 * run + 0.05;
      let jawA = 0.1;
      const legs = [0, 0, 0, 0];
      let bend = 0.35;
      if (z.dead) {
        // se cae de costado y queda duro
        const k = Math.min(1, z.stateT / 0.4);
        roll = k * 1.5;
        y = -k * 0.18;
        headP = 0.3 * k;
        jawA = 0.4;
        bend = 0.1;
      } else if (z.state === 'attack') {
        // mordisco: se para en las patas de atrás y tira el tarascón
        const k = Math.min(1, (z.attackT || 0) / 0.45);
        const s = Math.sin(k * Math.PI);
        pitch = -s * 0.5;
        y = s * 0.12;
        headP = -s * 0.3;
        jawA = 0.1 + s * 0.6;
        legs[0] = legs[1] = -s * 0.9;
      } else {
        // trote: diagonales juntas
        const a = 0.75 * run + 0.05;
        legs[0] = Math.sin(ph) * a;
        legs[3] = Math.sin(ph) * a;
        legs[1] = Math.sin(ph + Math.PI) * a;
        legs[2] = Math.sin(ph + Math.PI) * a;
        pitch = Math.sin(ph * 2) * 0.03 * run;
        jawA = 0.15 + run * 0.25;
      }
      tmpE.set(pitch, z.yaw, roll, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpV.set(z.pos.x, z.baseY || 0, z.pos.z);
      const s = z.scale || 1;
      tmpM.compose(tmpV, tmpQ, tmpS(s));
      // cuerpo
      this.body.setMatrixAt(z.slot, local(tmpM, 0, HIP_Y + 0.1 + y, 0, -0.06, 0, 0));
      // cabeza y mandíbula
      // la cabezota va adelante, apenas más alta que el lomo
      const H = local(tmpM, 0, HIP_Y + 0.24 + y, 0.5, headP, 0, 0);
      this.head.setMatrixAt(z.slot, H);
      tmpR.copy(H).multiply(tmpL.makeRotationX(jawA * 0.5).setPosition(0, -0.09, 0.14));
      this.jaw.setMatrixAt(z.slot, tmpR);
      for (const sx of [-1, 1]) {
        // ojos arriba y a los costados de la cabeza, como los carpinchos
        tmpR.copy(H).multiply(tmpL.makeTranslation(sx * 0.098, 0.055, 0.02));
        this.eyes.setMatrixAt(z.slot * 2 + (sx < 0 ? 0 : 1), tmpR);
      }
      // cola: se mueve con el trote
      this.tail.setMatrixAt(z.slot, local(tmpM, 0, HIP_Y + 0.14 + y, -0.44, 0, 0, 0));
      // patas: muslo y caña con la rodilla doblada
      LEGS.forEach(([lx, lz], k) => {
        const front = lz > 0;
        const sw = legs[k];
        const hip = local(tmpM, lx, HIP_Y + y, lz, sw, 0, 0);
        this.upper.setMatrixAt(z.slot * 4 + k, hip);
        const knee = tmpR.copy(hip).multiply(tmpL.makeRotationX((front ? -1 : 1) * (bend + Math.max(0, -sw) * 0.6)).setPosition(0, -UPPER, 0));
        this.lower.setMatrixAt(z.slot * 4 + k, knee);
      });
    }
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
  }

  // Rayo contra el perro (una cápsula para el cuerpo y una esfera para la cabeza).
  static raycast(z, o, d, maxT) {
    const s = z.scale || 1;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const by = z.baseY || 0;
    const head = { x: z.pos.x + fx * 0.56 * s, y: by + (HIP_Y + 0.24) * s, z: z.pos.z + fz * 0.56 * s, r: 0.15 * s };
    const th = sphereHit(o, d, head, maxT);
    let best = th === null ? null : { t: th, zone: 'head' };
    // cuerpo: tres esferas a lo largo
    for (const k of [-0.25, 0, 0.25]) {
      const c = { x: z.pos.x + fx * k * s, y: by + (HIP_Y + 0.1) * s, z: z.pos.z + fz * k * s, r: 0.26 * s };
      const t = sphereHit(o, d, c, maxT);
      if (t !== null && (!best || t < best.t)) best = { t, zone: 'torso' };
    }
    return best;
  }
}

const _s = new THREE.Vector3();
function tmpS(s) {
  return s === 1 ? ONE : _s.set(s, s, s);
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
