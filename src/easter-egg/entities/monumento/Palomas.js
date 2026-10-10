import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Las palomas del Monumento: la ronda especial del mapa (el lugar de los
// carpinchos). Por dentro son "perros" del grupo de los zombies (corren por el
// piso con el mismo campo de flujo, muerden igual, dan los mismos puntos); acá
// se dibujan volando a la altura de la cabeza, en bandada: el aleteo, el
// planeo, el picotazo en picada y la caída en un remolino de plumas.
// Gordas, gris pizarra, el cogote tornasolado y los ojos que brillan.

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV2 = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const mE = new THREE.Matrix4();
const mA = new THREE.Matrix4();
const mF = new THREE.Matrix4();
const mWA = new THREE.Matrix4();
const mB = new THREE.Matrix4();
const mOut = new THREE.Matrix4();
// a qué altura vuelan (sobre el piso) y cuánto suben al llegar
const FLY_Y = 1.45;
const ARRIVE = 9;
const S = 1.15;

export default class PalomaRig {
  constructor(game, max, eyeMat) {
    this.g = game;
    this.max = max;
    this.small = true;
    // (no sangran: plumas. entities/Zombies.js dry)
    this.noBlood = true;
    const feather = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true });
    const neckM = new THREE.MeshStandardMaterial({ color: 0x5a7a6a, roughness: 0.3, metalness: 0.5, emissive: 0x10241c, flatShading: true });
    const beakM = new THREE.MeshStandardMaterial({ color: 0x3a3230, roughness: 0.6 });
    const footM = new THREE.MeshStandardMaterial({ color: 0xb04a4a, roughness: 0.7 });
    // el cuerpo: buche gordo adelante, la cola en abanico atrás
    const body = mergeGeometries([
      new THREE.SphereGeometry(0.12, 10, 7).scale(0.9, 0.85, 1.35).translate(0, 0, 0.0),
      new THREE.SphereGeometry(0.1, 9, 6).scale(1, 1, 1).translate(0, 0.02, 0.07),
      new THREE.ConeGeometry(0.07, 0.2, 6).rotateX(-Math.PI / 2).scale(1.4, 0.35, 1).translate(0, 0.0, -0.22),
    ]);
    const neck = new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1.1, 1).translate(0, 0.07, 0.12);
    const head = mergeGeometries([
      new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0, 0),
      new THREE.ConeGeometry(0.012, 0.05, 5).rotateX(Math.PI / 2).translate(0, -0.008, 0.06),
    ]);
    // el ala: una hoja de plumas (dos tramos: el brazo y la mano)
    const wingA = new THREE.BoxGeometry(0.17, 0.012, 0.13).translate(0.085, 0, 0);
    const wingB = mergeGeometries([
      new THREE.BoxGeometry(0.16, 0.01, 0.11).translate(0.08, 0, -0.01),
      new THREE.BoxGeometry(0.06, 0.008, 0.08).translate(0.17, 0, -0.03),
    ]);
    const eye = new THREE.SphereGeometry(0.012, 6, 4);
    const foot = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4).translate(0, -0.03, 0);
    const mk = (geo, mat, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      game.scene.add(im);
      return im;
    };
    this.body = mk(body, feather, max);
    this.neck = mk(neck, neckM, max);
    this.head = mk(head, feather, max);
    this.wingA = mk(wingA, feather, max * 2);
    this.wingB = mk(wingB, feather, max * 2);
    this.eyes = mk(eye, eyeMat, max * 2);
    this.feet = mk(foot, footM, max * 2);
    this.beak = beakM;
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      // gris pizarra, la clara, la overa y la oscura
      c.setHex([0x7a8088, 0x9aa0a8, 0x6a6e74, 0x4a4e56, 0xd8d8d4][i % 5]);
      this.body.setColorAt(i, c);
      this.head.setColorAt(i, c);
      for (let k = 0; k < 2; k++) {
        this.wingA.setColorAt(i * 2 + k, c);
        // las puntas de las alas, más oscuras (las dos barras de la paloma)
        this.wingB.setColorAt(i * 2 + k, c.clone().multiplyScalar(0.62));
      }
    }
    this.all = [this.body, this.neck, this.head, this.wingA, this.wingB, this.eyes, this.feet];
    this.last = game.time;
  }

  hide(slot) {
    for (const im of [this.body, this.neck, this.head]) im.setMatrixAt(slot, ZERO);
    for (const im of [this.wingA, this.wingB, this.eyes, this.feet]) {
      im.setMatrixAt(slot * 2, ZERO);
      im.setMatrixAt(slot * 2 + 1, ZERO);
    }
  }

  // Llegan volando desde arriba (sin el rayo de los carpinchos).
  spawnFx(z) {
    z.flyIn = 1;
    z.flapT = Math.random() * 10;
    this.voice(z, 'cry');
  }

  // El arrullo, el aleteo y el chillido (sintetizados).
  voice(z, kind) {
    const a = this.g.audio;
    if (!a?.out) return true;
    const pos = tmpV2.set(z.pos.x, (z.baseY || 0) + FLY_Y, z.pos.z).clone();
    const o = a.out({ pos, reverb: 0.3, gain: 0.45 });
    const t = a.now;
    if (kind === 'die') {
      a.noise(o, { t, dur: 0.25, type: 'bandpass', freq: 2200, q: 0.8, gain: 0.5 });
      a.tone(o, { t, dur: 0.18, type: 'triangle', freq: 900, freqEnd: 300, gain: 0.12 });
      return true;
    }
    // el aleteo (golpecitos de aire) y un arrullo grave y feo
    for (let k = 0; k < 5; k++) a.noise(o, { t: t + k * 0.07, dur: 0.05, type: 'bandpass', freq: 900 + Math.random() * 400, q: 1.2, gain: 0.35 });
    const f = 300 + Math.random() * 60;
    a.tone(o, { t: t + 0.1, dur: 0.35, type: 'sine', freq: f, freqEnd: f * 0.8, gain: 0.16, attack: 0.06 });
    a.tone(o, { t: t + 0.5, dur: 0.3, type: 'sine', freq: f * 1.1, freqEnd: f * 0.75, gain: 0.12, attack: 0.05 });
    return true;
  }

  update(pool) {
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, g.time - this.last));
    this.last = g.time;
    const mine = (z) => z.dog;
    const any = pool.some((z) => mine(z) && z.active);
    if (!any && !this.on) return;
    this.on = any;
    for (const im of this.all) im.visible = any;
    for (const z of pool) {
      if (!mine(z) || !z.active || z.state === 'dogspawn') {
        if (z.dogShown) {
          this.hide(z.slot);
          z.dogShown = false;
        }
        continue;
      }
      z.dogShown = true;
      const vx = z.pos.x - (z.lastX ?? z.pos.x);
      const vz = z.pos.z - (z.lastZ ?? z.pos.z);
      z.lastX = z.pos.x;
      z.lastZ = z.pos.z;
      const sp = dt > 0 ? Math.min(12, Math.hypot(vx, vz) / dt) : 0;
      z.dogSpeed = (z.dogSpeed || 0) + (sp - (z.dogSpeed || 0)) * Math.min(1, dt * 8);
      z.flapT = (z.flapT || 0) + dt * (14 + z.dogSpeed * 1.2);
      // llegando desde arriba
      if (z.flyIn > 0) z.flyIn = Math.max(0, z.flyIn - dt * 1.1);
      const ph = z.flapT;
      let y = FLY_Y + Math.sin(ph * 0.35 + z.slot) * 0.18 + (z.flyIn || 0) ** 2 * ARRIVE;
      let pitch = -0.08;
      let roll = Math.sin(ph * 0.2 + z.slot * 1.7) * 0.25;
      let flap = Math.sin(ph);
      let spread = 1;
      if (z.dead) {
        // cae en remolino, con las alas abiertas y quietas
        const k = Math.min(1, z.stateT / 0.7);
        y = FLY_Y * (1 - k * k) + 0.05;
        roll = k * 2.6;
        pitch = 0.6 * k;
        flap = 0.3;
        if (!z.puffed) {
          z.puffed = true;
          g.fx.dust(tmpV.set(z.pos.x, (z.baseY || 0) + FLY_Y, z.pos.z), { x: 0, y: 0.6, z: 0 }, [0.85, 0.85, 0.82], 14);
        }
      } else if (z.state === 'attack') {
        // la picada: baja a la cara, aletea fuerte y picotea
        const k = Math.min(1, (z.attackT || 0) / 0.45);
        const s = Math.sin(k * Math.PI);
        y = FLY_Y - 0.15 - s * 0.2;
        pitch = 0.6 * s;
        flap = Math.sin(ph * 2);
      } else if (z.dogSpeed > 7) {
        // a toda velocidad: planea con las alas medio cerradas
        spread = 0.7;
        flap = Math.sin(ph) * 0.4;
      }
      tmpE.set(pitch, z.yaw, roll, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpV.set(z.pos.x, (z.baseY || 0) + y, z.pos.z);
      const s = (z.scale || 1) * S;
      tmpM.compose(tmpV, tmpQ, tmpS.set(s, s, s));
      this.body.setMatrixAt(z.slot, tmpM);
      this.neck.setMatrixAt(z.slot, tmpM);
      // la cabeza: cabecea como paloma (adelante y atrás)
      const nod = Math.sin(ph * 0.5) * 0.02;
      const H = tmpR.copy(tmpM).multiply(tmpL.makeTranslation(0, 0.13, 0.19 + nod));
      this.head.setMatrixAt(z.slot, H);
      for (const sx of [-1, 1]) {
        mOut.copy(H).multiply(mE.makeTranslation(sx * 0.038, 0.012, 0.022));
        this.eyes.setMatrixAt(z.slot * 2 + (sx < 0 ? 0 : 1), mOut);
      }
      // las alas: el brazo sube y baja, la mano lo sigue con retraso
      for (const sx of [-1, 1]) {
        const k = sx < 0 ? 0 : 1;
        tmpE.set(0, 0, sx * (flap * 0.9 * spread + 0.1), 'XYZ');
        mA.makeRotationFromEuler(tmpE).setPosition(sx * 0.07, 0.05, 0.02);
        if (sx < 0) mA.multiply(mF.makeScale(-1, 1, 1));
        mWA.multiplyMatrices(tmpM, mA);
        this.wingA.setMatrixAt(z.slot * 2 + k, mWA);
        tmpE.set(0, 0, Math.sin(ph - 0.6) * 0.5 * spread, 'XYZ');
        mB.makeRotationFromEuler(tmpE).setPosition(0.17, 0, 0);
        this.wingB.setMatrixAt(z.slot * 2 + k, mOut.multiplyMatrices(mWA, mB));
        // las patitas coloradas, encogidas
        this.feet.setMatrixAt(z.slot * 2 + k, mOut.multiplyMatrices(tmpM, mF.makeRotationX(-1.2).setPosition(sx * 0.04, -0.08, -0.02)));
      }
    }
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
  }

  // Rayo contra la paloma: el cuerpo y la cabeza, a la altura en que vuela.
  static raycast(z, o, d, maxT) {
    const s = (z.scale || 1) * S;
    const y = (z.baseY || 0) + FLY_Y + (z.flyIn || 0) ** 2 * ARRIVE;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const hit = (cx, cy, cz, r) => {
      const ox = cx - o.x;
      const oy = cy - o.y;
      const oz = cz - o.z;
      const t = ox * d.x + oy * d.y + oz * d.z;
      if (t < 0 || t > maxT) return null;
      const px = ox - d.x * t;
      const py = oy - d.y * t;
      const pz = oz - d.z * t;
      const d2 = px * px + py * py + pz * pz;
      if (d2 > r * r) return null;
      return t - Math.sqrt(r * r - d2);
    };
    const th = hit(z.pos.x + fx * 0.19 * s, y + 0.13 * s, z.pos.z + fz * 0.19 * s, 0.09 * s);
    const tb = hit(z.pos.x, y, z.pos.z, 0.2 * s);
    if (th !== null && (tb === null || th < tb)) return { t: th, zone: 'head' };
    if (tb !== null) return { t: tb, zone: 'torso' };
    return null;
  }
}
