import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import PumaSkin from './pumaSkin';

// Pumas de la cordillera: la ronda especial del castillo (el lugar de los
// carpinchos del molino). Por dentro son los mismos "perros" (Zombies los
// trata igual); acá se dibujan: el cuerpo largo y bajo, la cabeza chica con
// las orejas redondas, la cola larga con la punta oscura y las patas. Bajan
// de un salto desde lo alto de las paredes, corren a los saltos (la espalda
// se estira y se encoge), se tiran encima con las manos adelante y caen de
// costado. También tienen su voz: el grito del puma, el bufido y el gemido.

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

const LEGS = [
  [0.12, 0.36],
  [-0.12, 0.36],
  [0.12, -0.36],
  [-0.12, -0.36],
];
const HIP_Y = 0.5;
const UPPER = 0.3;
const LOWER = 0.28;
// el salto de entrada: de dónde viene (alto y atrás) y cuánto dura
const LEAP_H = 3.2;
const LEAP_BACK = 2.6;
const LEAP_T = 0.6;

export default class PumaRig {
  constructor(game, max, eyeMat) {
    this.g = game;
    this.max = max;
    this.flag = 'dogShown';
    // el pelaje va pintado en los vértices (el color de cada puma lo matiza apenas)
    const coat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true, map: furTex() });
    const dark = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 });
    // el cuerpo: largo y angosto de costado, el pecho hondo, la cintura fina y
    // las ancas redondas, con los omóplatos marcados arriba
    const prof = [[0, -0.6], [0.09, -0.58], [0.15, -0.5], [0.19, -0.38], [0.175, -0.22], [0.15, -0.05], [0.16, 0.12], [0.195, 0.28], [0.185, 0.42], [0.13, 0.54], [0, 0.6]];
    const body = mergeGeometries([
      paint(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2).scale(0.82, 1.08, 1), coatFn),
      paint(new THREE.SphereGeometry(0.16, 12, 9).scale(0.8, 1, 1.1).translate(0, -0.1, 0.3), coatFn),
      paint(new THREE.SphereGeometry(0.17, 12, 9).scale(0.85, 1, 1).translate(0, 0.02, -0.36), coatFn),
      ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.09, 8, 6).scale(1, 0.7, 1.4).translate(s * 0.07, 0.14, 0.3), coatFn)),
    ]);
    // la cabeza (el pivote es el cogote): el cuello, el cráneo redondo, el
    // hocico corto con los bigotes oscuros y las orejas chicas, negras por detrás
    const head = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.09, 0.13, 0.26, 10).rotateX(1.1).translate(0, 0.08, 0.1), coatFn),
      paint(new THREE.SphereGeometry(0.12, 14, 11).scale(1, 0.9, 1.08).translate(0, 0.17, 0.25), (p, n, c) => {
        coatFn(p, n, c);
        if (p.z > 0.3 && p.y < 0.16) c.lerp(CREAM, 0.7);
      }),
      paint(new THREE.SphereGeometry(0.075, 12, 9).scale(1.05, 0.75, 0.95).translate(0, 0.12, 0.34), (p, n, c) => {
        c.copy(CREAM);
        if (n.y > 0.5) c.lerp(TAWNY, 0.6);
        if (Math.abs(p.x) > 0.04 && p.y > 0.11 && p.z > 0.33) c.lerp(DARK, 0.55);
      }),
      ...[-1, 1].map((s) =>
        paint(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 1.2, 0.45).rotateZ(-s * 0.35).translate(s * 0.08, 0.28, 0.2), (p, n, c) => {
          c.copy(n.z < -0.2 ? DARK : n.z > 0.3 ? CREAM : TAWNY);
        }),
      ),
    ]);
    const nose = new THREE.SphereGeometry(0.028, 8, 6).scale(1.2, 0.7, 0.8).translate(0, 0.145, 0.41);
    const jaw = paint(new THREE.BoxGeometry(0.1, 0.03, 0.1).translate(0, -0.01, 0.05), (p, n, c) => c.copy(CREAM));
    // las patas: el muslo grueso que se afina, la caña flaca y la mano grande
    const upper = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.07, 0.05, UPPER, 8).translate(0, -UPPER / 2, 0), coatFn),
      paint(new THREE.SphereGeometry(0.075, 8, 6), coatFn),
    ]);
    const lower = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.045, 0.036, LOWER, 7).translate(0, -LOWER / 2, 0), (p, n, c) => c.copy(TAWNY)),
      paint(new THREE.SphereGeometry(0.05, 7, 5), (p, n, c) => c.copy(TAWNY)),
    ]);
    const paw = paint(new THREE.SphereGeometry(0.065, 9, 7).scale(1.1, 0.55, 1.35).translate(0, -LOWER + 0.02, 0.035), (p, n, c) => c.copy(TAWNY).lerp(CREAM, 0.25));
    // la cola: larga, en dos tramos, la punta más gruesa y oscura
    const tail1 = paint(new THREE.CylinderGeometry(0.035, 0.05, 0.45, 8).translate(0, -0.225, 0), coatFn);
    const tail2 = new THREE.CylinderGeometry(0.05, 0.034, 0.36, 7).translate(0, -0.18, 0);
    const eye = new THREE.SphereGeometry(0.022, 6, 5);
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
    this.nose = mk(nose, dark, max);
    this.jaw = mk(jaw, coat, max);
    this.upper = mk(upper, coat, max * 4);
    this.lower = mk(lower, coat, max * 4);
    this.paw = mk(paw, coat, max * 4);
    this.tail1 = mk(tail1, coat, max);
    this.tail2 = mk(tail2, dark, max);
    this.eyes = mk(eye, eyeMat, max * 2);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      // cada uno con su matiz: leonado, más colorado, más gris y más claro
      c.setHex([0xffffff, 0xf4e2d0, 0xd6d2cc, 0xfff2e2][i % 4]);
      for (const im of [this.body, this.head, this.jaw, this.tail1]) im.setColorAt(i, c);
      for (let k = 0; k < 4; k++) {
        this.upper.setColorAt(i * 4 + k, c);
        this.lower.setColorAt(i * 4 + k, c);
        this.paw.setColorAt(i * 4 + k, c);
      }
    }
    this.all = [this.body, this.head, this.nose, this.jaw, this.upper, this.lower, this.paw, this.tail1, this.tail2, this.eyes];
    this.last = game.time;
    // con cuerpo de verdad (entities/pumaSkin.js): mientras baja, las piezas
    this.skin = new PumaSkin(game, eyeMat);
  }

  hide(slot) {
    this.zero(slot);
    this.skin.hide(slot);
  }

  // Las piezas de uno, escondidas.
  zero(slot) {
    for (const im of [this.body, this.head, this.nose, this.jaw, this.tail1, this.tail2]) im.setMatrixAt(slot, ZERO);
    for (let k = 0; k < 4; k++) {
      this.upper.setMatrixAt(slot * 4 + k, ZERO);
      this.lower.setMatrixAt(slot * 4 + k, ZERO);
      this.paw.setMatrixAt(slot * 4 + k, ZERO);
    }
    this.eyes.setMatrixAt(slot * 2, ZERO);
    this.eyes.setMatrixAt(slot * 2 + 1, ZERO);
  }

  // Aparece: nada de rayo, baja de un salto desde lo alto (una nube de nieve al caer).
  spawnFx(z) {
    const g = this.g;
    g.later(LEAP_T * 0.9, () => {
      if (!z.active) return;
      g.fx.dirt?.(z.pos, 8);
      g.fx.steam?.(tmpV.set(z.pos.x, (z.baseY || 0) + 0.2, z.pos.z), 6, 0.6);
    });
    this.voice(z, 'cry');
  }

  update(pool) {
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, g.time - this.last));
    this.last = g.time;
    const any = pool.some((z) => z.dog && z.active);
    if (!any && !this.on) return;
    this.on = any;
    for (const im of this.all) im.visible = any;
    for (const z of pool) {
      if (!z.dog || !z.active) {
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
      const run = Math.min(1, z.dogSpeed / 5.5);
      z.gait = (z.gait || 0) + dt * (4 + z.dogSpeed * 1.6);
      const ph = z.gait;
      // a los saltos: la espalda sube y baja, y la cabeza queda firme
      let pitch = Math.sin(ph) * 0.14 * run;
      let roll = 0;
      let y = Math.max(0, Math.sin(ph)) * 0.08 * run;
      let fwd = 0;
      let headP = -pitch * 0.9 + 0.05;
      let jawA = 0.04;
      const legs = [0, 0, 0, 0];
      let tailA = 0.9 - run * 0.5;
      let tailB = 0.4;
      // corriendo (no saltando, caído ni en el zarpazo): el de cuerpo de verdad dobla las patas en el aire
      let gallop = false;
      if (z.state === 'dogspawn') {
        // el salto desde lo alto de la pared: una parábola que cae adelante
        const k = Math.min(1, z.stateT / LEAP_T);
        y = LEAP_H * (1 - k) * (1 - k) + Math.sin(k * Math.PI) * 0.4;
        fwd = -LEAP_BACK * (1 - k);
        pitch = 0.35 * (1 - k) - 0.2;
        headP = 0.2;
        legs[0] = legs[1] = -1.1;
        legs[2] = legs[3] = 0.9;
        tailA = 1.3;
        jawA = 0.35;
      } else if (z.dead) {
        const k = Math.min(1, z.stateT / 0.45);
        roll = k * 1.5;
        // (gira sobre las patas, en el piso: el cuerpo queda de costado a ras;
        // sube apenas lo que mide de ancho, si no se hunde entero)
        y = k * 0.13;
        headP = 0.3 * k;
        jawA = 0.3;
        tailA = 1.5;
        tailB = 0.1;
      } else if (z.state === 'attack') {
        // se tira encima: se estira adelante con las manos por delante
        const k = Math.min(1, (z.attackT || 0) / 0.45);
        const s = Math.sin(k * Math.PI);
        pitch = -s * 0.45;
        y = s * 0.35;
        fwd = s * 0.35;
        headP = -0.15 * s;
        jawA = 0.1 + s * 0.55;
        legs[0] = -s * 1.5 + Math.sin(g.time * 24) * 0.2 * s;
        legs[1] = -s * 1.35 - Math.sin(g.time * 24) * 0.2 * s;
        legs[2] = s * 0.6;
        legs[3] = s * 0.5;
      } else {
        gallop = true;
        // las de adelante casi juntas y las de atrás juntas, desfasadas
        const a = 0.7 * run + 0.06;
        legs[0] = Math.sin(ph) * a;
        legs[1] = Math.sin(ph + 0.35) * a;
        legs[2] = Math.sin(ph + Math.PI) * a;
        legs[3] = Math.sin(ph + Math.PI + 0.35) * a;
        jawA = 0.05 + run * 0.1;
        tailB = 0.35 + Math.sin(ph * 0.5) * 0.25;
      }
      tmpE.set(pitch, z.yaw, roll, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      const fx = Math.sin(z.yaw);
      const fz = Math.cos(z.yaw);
      tmpV.set(z.pos.x + fx * fwd, (z.baseY || 0) + y, z.pos.z + fz * fwd);
      const s = (z.scale || 1) * 1.05;
      tmpM.compose(tmpV, tmpQ, tmpS.set(s, s, s));
      // con cuerpo de verdad: los mismos números en sus huesos (las piezas, escondidas)
      if (this.skin.pose(z.slot, { M: tmpM, s, headP, jawA, tailA, tailB, sway: Math.sin(ph * 0.7) * 0.15 * run, legs, ph, run, gallop })) {
        if (!z.dogSkin) this.zero(z.slot);
        z.dogSkin = true;
        continue;
      }
      if (z.dogSkin) this.skin.hide(z.slot);
      z.dogSkin = false;
      this.body.setMatrixAt(z.slot, local(tmpM, 0, HIP_Y + 0.12, 0, 0, 0, 0));
      const H = local(tmpM, 0, HIP_Y + 0.2, 0.46, headP, 0, 0);
      this.head.setMatrixAt(z.slot, H);
      this.nose.setMatrixAt(z.slot, H);
      tmpR.copy(H).multiply(tmpL.makeRotationX(jawA).setPosition(0, 0.08, 0.3));
      this.jaw.setMatrixAt(z.slot, tmpR);
      for (const sx of [-1, 1]) {
        tmpR.copy(H).multiply(tmpL.makeTranslation(sx * 0.06, 0.2, 0.34));
        this.eyes.setMatrixAt(z.slot * 2 + (sx < 0 ? 0 : 1), tmpR);
      }
      // la cola: el primer tramo sale para atrás y abajo, el segundo se levanta
      const T1 = local(tmpM, 0, HIP_Y + 0.16, -0.52, -tailA, 0, Math.sin(ph * 0.7) * 0.15 * run);
      this.tail1.setMatrixAt(z.slot, T1);
      tmpR.copy(T1).multiply(tmpL.makeRotationX(-tailB).setPosition(0, -0.43, 0));
      this.tail2.setMatrixAt(z.slot, tmpR);
      LEGS.forEach(([lx, lz], k) => {
        const front = lz > 0;
        const sw = legs[k];
        const hip = local(tmpM, lx, HIP_Y, lz, sw, 0, 0);
        this.upper.setMatrixAt(z.slot * 4 + k, hip);
        const bend = front ? -0.35 - Math.max(0, -sw) * 0.5 : 0.55 + Math.max(0, sw) * 0.4;
        const knee = tmpR.copy(hip).multiply(tmpL.makeRotationX(bend).setPosition(0, -UPPER, 0));
        this.lower.setMatrixAt(z.slot * 4 + k, knee);
        this.paw.setMatrixAt(z.slot * 4 + k, knee);
      });
    }
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
  }

  // La voz del puma: 'cry' (el grito), 'growl' (bufido), 'attack', 'die'.
  voice(z, kind) {
    const a = this.g.audio;
    if (!a?.out) return true;
    const pos = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 0.6, z.pos.z);
    // el grito y el ataque, grabados (core/sfxPack.js); si no bajaron, sintetizados
    if ((kind === 'cry' || kind === 'attack') && a.pack?.animal('puma', kind, pos)) return true;
    const t = a.now;
    if (kind === 'cry') {
      // el grito: parece una persona gritando, áspero, sube y baja
      const o = a.out({ pos, reverb: 0.75, gain: 0.5 });
      const f = 650 + Math.random() * 150;
      const d = 0.9 + Math.random() * 0.4;
      for (let i = 0; i < 6; i++) {
        const k0 = i / 6;
        const k1 = (i + 1) / 6;
        const bend = (k) => f * (1 + Math.sin(k * Math.PI) * 0.55 - k * 0.25);
        a.tone(o, { t: t + k0 * d, dur: d / 6 + 0.03, type: 'sawtooth', freq: bend(k0), freqEnd: bend(k1), gain: 0.12 * (1 - k0 * 0.4), attack: 0.01 });
      }
      a.noise(o, { t, dur: d, type: 'bandpass', freq: 2200, q: 1.2, gain: 0.2, attack: 0.05 });
      a.tone(o, { t, dur: d * 0.8, type: 'triangle', freq: 180, freqEnd: 140, gain: 0.06, attack: 0.05 });
    } else if (kind === 'growl') {
      // bufido: aire entre los dientes y un gruñido grave que tiembla
      const o = a.out({ pos, reverb: 0.25, gain: 0.45 });
      a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 3200, freqEnd: 2000, q: 1.5, gain: 0.35, attack: 0.02 });
      for (let i = 0; i < 6; i++) a.tone(o, { t: t + i * 0.06, dur: 0.06, type: 'sawtooth', freq: 95 + Math.random() * 20, gain: 0.08 });
    } else if (kind === 'attack') {
      const o = a.out({ pos, reverb: 0.3, gain: 0.5 });
      a.tone(o, { t, dur: 0.28, type: 'sawtooth', freq: 420, freqEnd: 220, gain: 0.16, attack: 0.01 });
      a.noise(o, { t, dur: 0.25, type: 'bandpass', freq: 2600, q: 1, gain: 0.3 });
    } else {
      // al caer: un gemido que se corta
      const o = a.out({ pos, reverb: 0.5, gain: 0.45 });
      a.tone(o, { t, dur: 0.5, type: 'sawtooth', freq: 520, freqEnd: 180, gain: 0.13, attack: 0.01 });
      a.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 1500, q: 1.2, gain: 0.15 });
    }
    return true;
  }

  // Rayo contra el puma: la cabeza y dos esferas a lo largo del cuerpo.
  static raycast(z, o, d, maxT) {
    if (z.state === 'dogspawn') return null;
    const s = (z.scale || 1) * 1.05;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const by = z.baseY || 0;
    // (el de cuerpo de verdad lleva la cabeza más baja, gruñendo, y el lomo apenas más bajo)
    const hy = z.dogSkin ? 0.58 : 0.95;
    const ty = z.dogSkin ? 0.56 : 0.72;
    const head = { x: z.pos.x + fx * 0.74 * s, y: by + hy * s, z: z.pos.z + fz * 0.74 * s, r: 0.19 * s };
    const th = sphereHit(o, d, head, maxT);
    let best = th === null ? null : { t: th, zone: 'head' };
    for (const k of [-0.35, 0.05, 0.4]) {
      const c = { x: z.pos.x + fx * k * s, y: by + ty * s, z: z.pos.z + fz * k * s, r: 0.3 * s };
      const t = sphereHit(o, d, c, maxT);
      if (t !== null && (!best || t < best.t)) best = { t, zone: 'torso' };
    }
    const legs = { x: z.pos.x, y: by + 0.3 * s, z: z.pos.z, r: 0.35 * s };
    const tl = sphereHit(o, d, legs, maxT);
    if (tl !== null && (!best || tl < best.t)) best = { t: tl, zone: 'torso' };
    return best;
  }
}

// El pelaje: leonado, más oscuro en el lomo y crema en la panza, el pecho,
// el hocico y la pera; las orejas por detrás, oscuras.
const TAWNY = new THREE.Color(0xa8743f);
const BACK = new THREE.Color(0x7e5230);
const CREAM = new THREE.Color(0xeadbc0);
const DARK = new THREE.Color(0x2b1e15);
const tmpC = new THREE.Color();
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function coatFn(p, n, c) {
  c.copy(TAWNY).lerp(BACK, sstep(0.4, 0.95, n.y) * 0.8).lerp(CREAM, sstep(-0.15, -0.7, n.y));
}

// Pinta cada vértice con fn(posición, normal, color).
function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, tmpC);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// El pelo: rayitas cortas en una textura gris clara que se repite.
function furTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#e6e6e6';
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 420; i++) {
    const v = 185 + Math.floor(Math.random() * 70);
    x.strokeStyle = `rgb(${v},${v},${v})`;
    x.lineWidth = 1;
    const px = Math.random() * 64;
    const py = Math.random() * 64;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (Math.random() - 0.5) * 2, py + 3 + Math.random() * 4);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
