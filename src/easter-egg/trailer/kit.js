import * as THREE from 'three';

// Herramientas del trailer: la grilla de la canción, curvas de aceleración,
// ruido suave (cámara en mano) y el rig de cámara de cada toma.

// ---------------- la canción ----------------
// 106,68 pulsos por minuto; el primer pulso cae a los 10 ms. Del pulso 72 en
// adelante el trailer saltea 32 pulsos de la canción (un bloque de 8 compases),
// así que en el trailer los pulsos siguen de corrido.
export const BPM = 106.68;
export const BEAT = 60 / BPM;
export const B0 = 0.01;
export const beatT = (b) => B0 + b * BEAT;
export const FPS = 60;
// cuadro (del trailer) en que cae un pulso
export const beatF = (b) => Math.round(beatT(b) * FPS);

// ---------------- curvas ----------------
export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => u * u * (3 - 2 * u);
export const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
export const E = {
  lin: (u) => u,
  in2: (u) => u * u,
  out2: (u) => 1 - (1 - u) * (1 - u),
  in3: (u) => u * u * u,
  out3: (u) => 1 - (1 - u) ** 3,
  io2: (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  outExpo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  inExpo: (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10)),
  ioExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  outBack: (u) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2,
  smooth,
  smoother,
};
export const ease = (e) => (typeof e === 'function' ? e : E[e] || E.io2);

// Tramo: 0 antes de a, 1 después de b, curva en el medio.
export const span = (t, a, b, e = 'smooth') => ease(e)(clamp01((t - a) / Math.max(1e-6, b - a)));

// ---------------- ruido ----------------
// Ruido 1D suave (valor con interpolación quíntica), de -1 a 1.
const PERM = new Float32Array(512);
{
  let s = 1234567;
  for (let i = 0; i < 512; i++) {
    s = (s * 16807) % 2147483647;
    PERM[i] = (s / 2147483647) * 2 - 1;
  }
}
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = PERM[i & 511];
  const b = PERM[(i + 1) & 511];
  return a + (b - a) * smoother(f);
}
// Fractal: tres octavas (el pulso del camarógrafo: lento y amplio, más un temblor fino).
export function fbm(x, seed = 0) {
  return noise1(x + seed * 17.3) * 0.62 + noise1(x * 2.13 + seed * 31.1 + 5.2) * 0.26 + noise1(x * 4.71 + seed * 7.7 + 9.4) * 0.12;
}

// ---------------- recorridos ----------------
// Curva suave por puntos (centrípeta, sin rulos); un punto solo: fijo.
export function curve(pts) {
  const v = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  if (v.length === 1) return (u, out) => out.copy(v[0]);
  if (v.length === 2) return (u, out) => out.lerpVectors(v[0], v[1], u);
  const c = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  // a velocidad pareja (por largo de arco), no por punto
  return (u, out) => c.getPointAt(clamp01(u), out);
}

// Valor por llaves: [[u, v], ...] con curva entre llaves (u de 0 a 1).
export function keys(list, e = 'io2') {
  const f = ease(e);
  return (u) => {
    if (u <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (u <= list[i][0]) {
        const [a, va] = list[i - 1];
        const [b, vb] = list[i];
        return lerp(va, vb, f((u - a) / Math.max(1e-6, b - a)));
      }
    }
    return list[list.length - 1][1];
  };
}

// ---------------- la cámara ----------------
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);

// Rig de una toma. opts:
//  pos / look: puntos (curva) o función (u, t, out) => out
//  u: función t→u (la rampa: cuánto del recorrido va en cada momento), o ease
//  fov: número, [a, b] o función u→fov
//  roll: número, [a, b] o función u→roll (radianes)
//  hand: temblor de cámara en mano { amp (rad), pos (m), freq } o número (amp)
//  lag: la mirada sigue al objetivo con retraso (segundos; 0 = directo)
export class CamRig {
  constructor(dur, o) {
    this.dur = dur;
    this.o = o;
    this.posF = typeof o.pos === 'function' ? o.pos : curve(o.pos);
    this.lookF = o.look ? (typeof o.look === 'function' ? o.look : curve(o.look)) : null;
    this.uF = typeof o.u === 'function' ? o.u : ((e) => (t) => e(clamp01(t / dur)))(ease(o.u || 'lin'));
    const fv = o.fov ?? 50;
    this.fovF = typeof fv === 'function' ? fv : Array.isArray(fv) ? (u) => lerp(fv[0], fv[1], ease(o.fovEase || 'io2')(u)) : () => fv;
    const r = o.roll ?? 0;
    this.rollF = typeof r === 'function' ? r : Array.isArray(r) ? (u) => lerp(r[0], r[1], u) : () => r;
    const h = typeof o.hand === 'number' ? { amp: o.hand } : o.hand || { amp: 0 };
    this.hand = { amp: h.amp || 0, pos: h.pos ?? (h.amp || 0) * 0.6, freq: h.freq || 0.55, seed: h.seed ?? 3 };
    this.lookCur = null;
    this.shake = 0;
    this.shakeSeed = 0;
  }

  // Un golpe de cámara (explosión, rugido): decae solo.
  kick(k) {
    this.shake = Math.max(this.shake, k);
  }

  apply(cam, t, dt) {
    const u = this.uF(t);
    this.posF(u, tmpA, t);
    cam.position.copy(tmpA);
    if (this.lookF) {
      this.lookF(u, tmpB, t);
      if (this.o.lag && this.lookCur) this.lookCur.lerp(tmpB, 1 - Math.exp(-dt / this.o.lag));
      else this.lookCur = (this.lookCur || new THREE.Vector3()).copy(tmpB);
      tmpM.lookAt(tmpA, this.lookCur, UP);
      cam.quaternion.setFromRotationMatrix(tmpM);
    }
    const H = this.hand;
    const f = t * H.freq;
    const sk = this.shake;
    const s = H.seed;
    // en mano: cabeceo y giro lentos, con un temblor chiquito encima
    const pitch = fbm(f, s) * H.amp + fbm(t * 19, s + 3) * sk * 0.03;
    const yaw = fbm(f, s + 11) * H.amp * 1.25 + fbm(t * 23, s + 5) * sk * 0.035;
    const roll = this.rollF(u) + fbm(f * 0.8, s + 23) * H.amp * 0.5 + fbm(t * 17, s + 9) * sk * 0.02;
    cam.quaternion.multiply(tmpQ.setFromEuler(tmpE.set(pitch, yaw, roll, 'YXZ')));
    if (H.pos) {
      cam.position.x += fbm(f * 0.7, s + 41) * H.pos * 0.05;
      cam.position.y += fbm(f * 0.9, s + 43) * H.pos * 0.04;
      cam.position.z += fbm(f * 0.7, s + 47) * H.pos * 0.05;
    }
    if (sk > 0.001) this.shake *= Math.exp(-dt * 6);
    const fov = this.fovF(u, t);
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    return u;
  }
}

// Punto alrededor de un centro (órbita): ángulo a (radianes, desde +z), radio r, altura y.
export function orbitAt(c, a, r, y, out) {
  return out.set(c.x + Math.sin(a) * r, y, c.z + Math.cos(a) * r);
}

// Dirección (yaw) desde a hacia b en el piso, como la usan los muñecos (frente +z).
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

// Diferencia de ángulos en (-π, π].
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Resorte críticamente amortiguado (sin rebote de más): v es el estado {x, v}.
export function spring(s, target, freq, dt, damp = 1) {
  const w = Math.PI * 2 * freq;
  const k = w * w;
  const c = 2 * damp * w;
  // (subpasos: estable con frecuencias altas)
  const n = Math.max(1, Math.ceil(dt * w * 0.5));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = k * (target - s.x) - c * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
  return s.x;
}
