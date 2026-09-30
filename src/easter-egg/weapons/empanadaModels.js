import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMPANADA } from '../config/empanadas';

// Las empanadas en 3D (el horno de barro, la mano que come y la pulpería).
// Escala real, en metros: 13 a 15 cm de largo, el eje largo en x, la base
// plana en y = 0 y el repulgue para arriba (+y).
//
// Cada una es una sola malla con colores por vértice (el dorado, lo quemado,
// el azúcar...) y un material por cocción, compartido. La masa es una cáscara
// cerrada que sale de la silueta (outline) y de dos alturas: la tapa (top) y
// la base (bot). El repulgue son pliegues (elipsoides) a lo largo de la
// costura. Los mordiscos (setBite) aplastan la cáscara contra el borde del
// bocado y ponen una pared con el color del relleno.

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpC = new THREE.Color();

// ---------------- ruido ----------------
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// ---------------- siluetas ----------------
// Redondea las esquinas de un polígono cerrado (Chaikin).
function chaikin(pts, n = 3) {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// La silueta: el polígono, el centro desde donde se ve entera y el radio
// hacia cada ángulo (tabla), para armar anillos y para ubicar cualquier punto.
class Outline {
  constructor(pts, c) {
    this.pts = pts;
    this.c = c;
    this.N = 720;
    this.r = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      const a = (i / this.N) * Math.PI * 2;
      this.r[i] = this.cast(Math.cos(a), Math.sin(a));
    }
  }

  cast(dx, dz) {
    const [cx, cz] = this.c;
    let best = 0;
    const p = this.pts;
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[(i + 1) % p.length];
      const ex = bx - ax;
      const ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((ax - cx) * ez - (az - cz) * ex) / den;
      const u = ((ax - cx) * dz - (az - cz) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
    }
    return best;
  }

  radius(a) {
    const f = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * this.N;
    const i = Math.floor(f);
    const k = f - i;
    return this.r[i % this.N] * (1 - k) + this.r[(i + 1) % this.N] * k;
  }

  // 0 en el borde, 1 en el centro (en la dirección de ese punto).
  rho(x, z) {
    const dx = x - this.c[0];
    const dz = z - this.c[1];
    return Math.hypot(dx, dz) / (this.radius(Math.atan2(dz, dx)) || 1);
  }

  // Distancia al borde (adentro).
  dist(x, z) {
    let d = Infinity;
    const p = this.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      d = Math.min(d, distSeg(x, z, a[0], a[1], b[0], b[1]));
    }
    return d;
  }

  // Punto del borde hacia el ángulo a (y la normal hacia afuera).
  edge(a, out) {
    const r = this.radius(a);
    const x = this.c[0] + Math.cos(a) * r;
    const z = this.c[1] + Math.sin(a) * r;
    const e = 0.002;
    const r1 = this.radius(a - e);
    const r2 = this.radius(a + e);
    const x1 = this.c[0] + Math.cos(a - e) * r1;
    const z1 = this.c[1] + Math.sin(a - e) * r1;
    const x2 = this.c[0] + Math.cos(a + e) * r2;
    const z2 = this.c[1] + Math.sin(a + e) * r2;
    const tx = x2 - x1;
    const tz = z2 - z1;
    const l = Math.hypot(tx, tz) || 1;
    // (a crece en sentido antihorario visto desde arriba en x/z: la normal de afuera es (tz, -tx))
    out.nx = tz / l;
    out.nz = -tx / l;
    out.x = x;
    out.z = z;
    return out;
  }
}

// ---------------- formas ----------------
// Cada forma: outline, top(x,z) y bot(x,z) (alto de la tapa y de la base,
// sobre y bajo el plano del borde), edge(x,z) (medio espesor del borde),
// seams: los pliegues [{x, z, tx, tz, ...}], y dónde se muerde.

// Pliegues a lo largo de un camino (puntos en x/z), n de ellos.
function along(path, n, from = 0, to = 1) {
  const L = [0];
  for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (from + ((to - from) * (k + 0.5)) / n) * total;
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const f = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
    const a = path[i - 1];
    const b = path[i];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    out.push({ x: a[0] + tx * f, z: a[1] + tz * f, tx: tx / l, tz: tz / l, step: (total * (to - from)) / n });
  }
  return out;
}

// La medialuna: el disco doblado. La recta (z = 0) es el doblez, gordo y
// redondo; el arco es la costura, con un labio chato donde va el repulgue.
function halfMoon(o) {
  const R = o.R;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    pts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  for (let i = 1; i < 12; i++) pts.push([-R + (2 * R * i) / 12, 0]);
  const out = new Outline(chaikin(pts, 3), [0, R * 0.4]);
  const Ht = o.H;
  const tf = Ht * 0.3;
  const LW = o.lip;
  // cuánto de doblez tiene un punto (el medio de la recta; las puntas son finas)
  const fold = (x, z) => smooth(1 - z / (R * 0.3)) * smooth((R * 0.82 - Math.abs(x)) / (R * 0.35));
  const arcness = (x, z) => smooth(z / (R * 0.14)) * clamp01((R * 0.97 - Math.abs(x)) / (R * 0.2) + 0.2);
  const edge = (x, z) => o.t + (tf - o.t) * fold(x, z);
  const inner = (x, z) => {
    const d = out.dist(x, z);
    const lip = LW * arcness(x, z);
    return clamp01((d - lip) / (R * 0.5));
  };
  // (del lado del doblez la tapa arranca acostada, así sigue la curva del borde sin quiebre)
  const top = (x, z) => {
    const e = edge(x, z);
    return e + (Ht - e) * Math.pow(inner(x, z), 0.55 + 0.5 * fold(x, z));
  };
  const bot = (x, z) => {
    const e = edge(x, z);
    return -(e + (o.Hb - e) * Math.pow(inner(x, z), 0.32));
  };
  // la costura: el arco, un poco adentro del borde
  const seam = [];
  const r0 = R - LW * 0.42;
  for (let i = 0; i <= 60; i++) {
    const a = 0.1 + (i / 60) * (Math.PI - 0.2);
    seam.push([Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  return { out, top, bot, edge, seam, R, lipW: (x, z) => LW * arcness(x, z) };
}

// Parada (la humita): un bote alto con la costura arriba, a lo largo.
function standing(o) {
  const a = o.R;
  const b = o.R * 0.5;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    pts.push([Math.cos(t) * a, Math.sin(t) * b]);
  }
  const out = new Outline(pts, [0, 0]);
  const e0 = 0.011;
  const edge = () => e0;
  const top = (x, z) => {
    const q = Math.hypot(x / a, z / b);
    const inner = clamp01(1 - q);
    const cross = 1 - 0.4 * Math.abs(z) / b;
    const ridge = 0.004 * Math.exp(-((z / 0.0035) ** 2)) * smooth((1 - Math.abs(x) / a) / 0.2);
    return e0 + (o.H - e0) * Math.pow(inner, 0.5) * cross + ridge;
  };
  const bot = (x, z) => -(e0 + (o.Hb - e0) * Math.pow(clamp01(1 - Math.hypot(x / a, z / b)), 0.3));
  const seam = [];
  for (let i = 0; i <= 30; i++) seam.push([-a * 0.82 + (1.64 * a * i) / 30, 0]);
  return { out, top, bot, edge, seam, R: a, upright: true };
}

// Triangular (la árabe): tres costuras del centro a las puntas.
function triangle(o) {
  const R = o.R;
  const corners = [0, 1, 2].map((k) => [Math.cos((k * 2 * Math.PI) / 3) * R, Math.sin((k * 2 * Math.PI) / 3) * R]);
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const A = corners[k];
    const B = corners[(k + 1) % 3];
    for (let i = 0; i < 12; i++) pts.push([A[0] + ((B[0] - A[0]) * i) / 12, A[1] + ((B[1] - A[1]) * i) / 12]);
  }
  const out = new Outline(chaikin(pts, 3), [0, 0]);
  const e0 = 0.007;
  const inR = R * 0.5;
  const segD = (x, z) => Math.min(...corners.map((c) => distSeg(x, z, 0, 0, c[0] * 0.8, c[1] * 0.8)));
  const top = (x, z) => {
    const inner = clamp01(out.dist(x, z) / (inR * 0.9));
    const ridge = 0.005 * Math.exp(-((segD(x, z) / 0.004) ** 2)) * (0.4 + 0.6 * inner);
    return e0 + (o.H - e0) * Math.pow(inner, 0.5) + ridge;
  };
  const bot = (x, z) => -(e0 + (o.Hb - e0) * Math.pow(clamp01(out.dist(x, z) / (inR * 0.6)), 0.3));
  const seams = corners.map((c) => [
    [c[0] * 0.08, c[1] * 0.08],
    [c[0] * 0.78, c[1] * 0.78],
  ]);
  return { out, top, bot, edge: () => e0, seams, R, upright: true };
}

// Bolsita: redonda, fruncida y atada arriba.
function pouch(o) {
  const R = o.R;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    pts.push([Math.cos(t) * R, Math.sin(t) * R]);
  }
  const out = new Outline(pts, [0, 0]);
  const e0 = 0.01;
  const top = (x, z) => {
    const q = Math.hypot(x, z) / R;
    const inner = clamp01(1 - q);
    const a = Math.atan2(z, x);
    const wr = Math.sin(a * 9) * 0.004 * smooth(inner / 0.5) * (1 - inner);
    return e0 + (o.H - e0) * Math.pow(inner, 0.62) + wr;
  };
  const bot = (x, z) => -(e0 + (o.Hb - e0) * Math.pow(clamp01(1 - Math.hypot(x, z) / R), 0.3));
  return { out, top, bot, edge: () => e0, R, knot: true };
}

// Sobre: las cuatro puntas dobladas al medio (costuras en cruz).
function envelope(o) {
  const R = o.R;
  const corners = [0, 1, 2, 3].map((k) => [Math.cos((k * Math.PI) / 2) * R, Math.sin((k * Math.PI) / 2) * R]);
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const A = corners[k];
    const B = corners[(k + 1) % 4];
    for (let i = 0; i < 10; i++) pts.push([A[0] + ((B[0] - A[0]) * i) / 10, A[1] + ((B[1] - A[1]) * i) / 10]);
  }
  const out = new Outline(chaikin(pts, 3), [0, 0]);
  const e0 = 0.007;
  const segD = (x, z) => Math.min(...corners.map((c) => distSeg(x, z, 0, 0, c[0] * 0.75, c[1] * 0.75)));
  // (un rombo redondeado: la norma 1,3 da el domo sin las aristas de una pirámide)
  const q = (x, z) => Math.pow(Math.abs(x) ** 1.3 + Math.abs(z) ** 1.3, 1 / 1.3) / (R * 0.93);
  const top = (x, z) => {
    const inner = clamp01(1 - q(x, z));
    const ridge = 0.0045 * Math.exp(-((segD(x, z) / 0.0035) ** 2)) * (0.3 + 0.7 * inner);
    return e0 + (o.H - e0) * Math.pow(inner, 0.45) + ridge;
  };
  const bot = (x, z) => -(e0 + (o.Hb - e0) * Math.pow(clamp01(1 - q(x, z)), 0.3));
  const seams = corners.map((c) => [
    [c[0] * 0.06, c[1] * 0.06],
    [c[0] * 0.74, c[1] * 0.74],
  ]);
  return { out, top, bot, edge: () => e0, seams, R, upright: true };
}

// Redonda: dos tapas, cerrada con el tenedor todo alrededor.
function round(o) {
  const R = o.R;
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    pts.push([Math.cos(t) * R, Math.sin(t) * R]);
  }
  const out = new Outline(pts, [0, 0]);
  const inner = (x, z) => clamp01((R - Math.hypot(x, z) - o.lip) / (R * 0.55));
  const top = (x, z) => o.t + (o.H - o.t) * Math.pow(inner(x, z), 0.55);
  const bot = (x, z) => -(o.t + (o.Hb - o.t) * Math.pow(inner(x, z), 0.32));
  return { out, top, bot, edge: () => o.t, R, lipAll: o.lip };
}

const SHAPES = {
  trenza: () => halfMoon({ R: 0.068, H: 0.03, Hb: 0.014, t: 0.0032, lip: 0.011 }),
  fino: () => halfMoon({ R: 0.062, H: 0.032, Hb: 0.015, t: 0.003, lip: 0.009 }),
  tenedor: () => halfMoon({ R: 0.066, H: 0.024, Hb: 0.012, t: 0.003, lip: 0.012 }),
  pico: () => halfMoon({ R: 0.067, H: 0.028, Hb: 0.013, t: 0.0035, lip: 0.007 }),
  parada: () => standing({ R: 0.066, H: 0.042, Hb: 0.012 }),
  triangulo: () => triangle({ R: 0.07, H: 0.03, Hb: 0.012 }),
  bolsita: () => pouch({ R: 0.05, H: 0.046, Hb: 0.012 }),
  sobre: () => envelope({ R: 0.066, H: 0.03, Hb: 0.012 }),
  redonda: () => round({ R: 0.056, H: 0.026, Hb: 0.012, t: 0.003, lip: 0.009 }),
};

// ---------------- colores y materiales ----------------
const COOK = {
  horno: { base: 0xe6b36c, brown: 0xa8601f, rough: 0.4, dark: 0x6a3814 },
  frita: { base: 0xe4a14a, brown: 0xa45a1c, rough: 0.34, dark: 0x6a3410 },
  barro: { base: 0xdcaa6a, brown: 0x94541e, rough: 0.62, dark: 0x2e1c10 },
  palida: { base: 0xeed29e, brown: 0xd09a58, rough: 0.55, dark: 0x9a6a38 },
};
const MATS = new Map();
function doughMat(cook) {
  if (!MATS.has(cook)) MATS.set(cook, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: COOK[cook].rough, metalness: 0, name: `empanada-${cook}` }));
  return MATS.get(cook);
}
export const empanadaMaterials = () => Object.keys(COOK).map(doughMat);

// ---------------- armado ----------------
// Anillos de la cáscara: de la base (centro) al borde y de ahí a la tapa.
const TH = 128;
const RINGS_B = 10;
const RINGS_T = 14;

function buildShell(S, look, seed) {
  const out = S.out;
  const [cx, cz] = out.c;
  const rows = [];
  for (let i = 1; i <= RINGS_B; i++) rows.push({ side: -1, rho: Math.sin((i / RINGS_B) * Math.PI * 0.5) });
  // el borde redondeado (medio espesor e): abajo, afuera y arriba
  for (const [k, ang] of [
    [0.55, -0.9],
    [0.92, -0.45],
    [1, 0],
    [0.92, 0.45],
    [0.55, 0.9],
  ])
    rows.push({ side: 0, k, ang });
  for (let i = RINGS_T; i >= 1; i--) rows.push({ side: 1, rho: Math.sin((i / RINGS_T) * Math.PI * 0.5) });
  const nv = 2 + rows.length * TH;
  const pos = new Float32Array(nv * 3);
  const side = new Int8Array(nv);
  // v0: polo de abajo, último: polo de arriba
  pos.set([cx, S.bot(cx, cz), cz], 0);
  side[0] = -1;
  const E = {};
  let v = 1;
  for (const r of rows) {
    for (let j = 0; j < TH; j++) {
      const a = (j / TH) * Math.PI * 2;
      out.edge(a, E);
      let x;
      let y;
      let z;
      if (r.side) {
        const rr = out.radius(a) * r.rho;
        x = cx + Math.cos(a) * rr;
        z = cz + Math.sin(a) * rr;
        y = r.side > 0 ? S.top(x, z) : S.bot(x, z);
      } else {
        const e = S.edge(E.x, E.z);
        const off = e * Math.cos(r.ang) * 0.9;
        x = E.x + E.nx * off;
        z = E.z + E.nz * off;
        y = e * Math.sin(r.ang);
      }
      pos.set([x, y, z], v * 3);
      side[v] = r.side || (r.ang > 0 ? 2 : r.ang < 0 ? -2 : 0);
      v++;
    }
  }
  pos.set([cx, S.top(cx, cz), cz], v * 3);
  side[v] = 1;
  const idx = [];
  const ring = (r, j) => 1 + r * TH + (j % TH);
  for (let j = 0; j < TH; j++) idx.push(0, ring(0, j), ring(0, j + 1));
  for (let r = 0; r < rows.length - 1; r++) {
    for (let j = 0; j < TH; j++) {
      const a = ring(r, j);
      const b = ring(r, j + 1);
      const c = ring(r + 1, j);
      const d = ring(r + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const last = rows.length - 1;
  for (let j = 0; j < TH; j++) idx.push(nv - 1, ring(last, j + 1), ring(last, j));
  return { pos, side, idx, nv };
}

// Marcas del tenedor y hoyitos de los dedos: se hunden en la tapa del labio.
function pressLip(S, look, pos, side) {
  const shape = look.shape;
  if (shape !== 'tenedor' && shape !== 'pico' && shape !== 'redonda') return;
  for (let v = 0; v < side.length; v++) {
    if (side[v] !== 1 && side[v] !== 2) continue;
    const x = pos[v * 3];
    const z = pos[v * 3 + 2];
    const d = S.out.dist(x, z);
    const lip = S.lipAll ?? S.lipW?.(x, z) ?? 0;
    if (!lip || d > lip * 1.05) continue;
    // a lo largo del borde (el ángulo desde el centro de la silueta)
    const a = Math.atan2(z - S.out.c[1], x - S.out.c[0]);
    const s = a * S.R;
    let dip;
    if (shape === 'pico') dip = 0.0009 * Math.pow(Math.abs(Math.sin((s / 0.011) * Math.PI)), 3);
    else {
      // de a cuatro dientes por apretada
      const tine = ((s / 0.0042) % 1 + 1) % 1;
      dip = 0.0011 * Math.pow(Math.sin(tine * Math.PI), 6) * smooth((lip - d) / (lip * 0.25));
    }
    pos[v * 3 + 1] -= dip;
  }
}

// Burbujitas de la fritura.
function blister(pos, side, seed) {
  for (let v = 0; v < side.length; v++) {
    if (Math.abs(side[v]) !== 1) continue;
    const x = pos[v * 3];
    const z = pos[v * 3 + 2];
    const n = noise3(x * 260, z * 260, 0, seed);
    const b = smooth((n - 0.62) / 0.2);
    pos[v * 3 + 1] += side[v] * b * 0.0012;
  }
}

function colorShell(S, look, pos, side, seed) {
  const C = COOK[look.cook] || COOK.horno;
  const base = new THREE.Color(C.base);
  if (look.tint) base.lerp(new THREE.Color(look.tint), 0.3);
  const brown = new THREE.Color(C.brown);
  const dark = new THREE.Color(C.dark);
  const col = new Float32Array(side.length * 3);
  const Ht = S.top(S.out.c[0], S.out.c[1]);
  for (let v = 0; v < side.length; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const n = noise3(x * 90, y * 90, z * 90, seed);
    const n2 = noise3(x * 300, y * 300, z * 300, seed + 7);
    let b;
    if (side[v] === -1) b = 0.3 + n * 0.25;
    else if (Math.abs(side[v]) === 2 || side[v] === 0) b = 0.62 + n * 0.25;
    else b = 0.18 + 0.5 * clamp01(y / (Ht || 1)) + n * 0.28 + n2 * 0.1;
    tmpC.copy(base).lerp(brown, clamp01(b));
    if (look.cook === 'barro' && n2 > 0.8 && side[v] !== -1) tmpC.lerp(dark, smooth((n2 - 0.8) / 0.12) * 0.85);
    if (look.cook === 'frita' && side[v] === 1) tmpC.lerp(brown, smooth((noise3(x * 260, z * 260, 0, seed) - 0.6) / 0.25) * 0.5);
    col.set([tmpC.r, tmpC.g, tmpC.b], v * 3);
  }
  return col;
}

// La normal de la tapa en (x, z), por diferencias.
function topNormal(S, x, z, out) {
  const h = 0.0015;
  const dx = S.top(x + h, z) - S.top(x - h, z);
  const dz = S.top(x, z + h) - S.top(x, z - h);
  return out.set(-dx / (2 * h), 1, -dz / (2 * h)).normalize();
}

// Un elipsoide coloreado (pliegue, marca) como geometría suelta.
function blob(sx, sy, sz, color, at, q, seg = [10, 6]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  g.scale(sx, sy, sz);
  if (q) g.applyQuaternion(q);
  g.translate(at.x, at.y, at.z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    // un poco más tostado en lo más alto
    const k = typeof color === 'function' ? color(p.getY(i) - at.y, i) : color;
    c.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

// Los pliegues del repulgue.
function pleats(S, look, seed) {
  const C = COOK[look.cook] || COOK.horno;
  const base = new THREE.Color(C.base).lerp(new THREE.Color(C.brown), 0.55);
  const tip = new THREE.Color(C.brown).lerp(new THREE.Color(C.dark), look.cook === 'barro' ? 0.45 : 0.18);
  const list = [];
  const shade = (h, sy) => tmpC.copy(base).lerp(tip, clamp01(0.3 + h / (sy * 1.2))).clone();
  const add = (p, sx, sy, sz, twist, roll, lift = 0) => {
    const y = S.top(p.x, p.z) + sy * 0.25 + lift;
    // el largo del pliegue va cruzado a la costura (twist) y se acuesta hacia afuera (roll)
    const fwd = tmpV.set(p.tx, 0, p.tz);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), fwd);
    q.multiply(tmpQ.setFromAxisAngle(UP, twist));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
    list.push({ x: p.x, z: p.z, geo: () => blob(sx, sy, sz, (h) => shade(h, sy), { x: p.x, y, z: p.z }, q, [9, 6]) });
  };
  const sh = look.shape;
  if (sh === 'trenza') {
    for (const p of along(S.seam, look.pleats || 24)) add(p, p.step * 1.55, 0.0028, 0.0042, -0.95, -0.45);
  } else if (sh === 'fino') {
    const n = look.pleats || 19;
    for (const p of along(S.seam, n)) add(p, p.step * (n < 16 ? 1.25 : 1.2), 0.0046, 0.0028, -0.7, -1.0, 0.001);
  } else if (sh === 'pico') {
    // el piquito del medio: tres pellizcos parados
    const ps = along(S.seam, 3, 0.44, 0.56);
    ps.forEach((p, i) => add(p, 0.0065, 0.0095 - Math.abs(i - 1) * 0.0025, 0.003, 0, 0, 0.0025));
  } else if (sh === 'parada') {
    for (const p of along(S.seam, 20)) add(p, p.step * 1.5, 0.0058, 0.0022, 0.8, 0);
  } else if (sh === 'triangulo' || sh === 'sobre') {
    for (const seam of S.seams) for (const p of along(seam, sh === 'sobre' ? 4 : 5)) add(p, p.step * 0.9, 0.004, 0.0026, 0.5, 0);
  }
  if (S.knot) {
    // la bolsita: pétalos fruncidos que suben y un nudito
    const top = S.top(0, 0);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + seed * 0.1;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize());
      const at = { x: Math.cos(a) * 0.004, y: top + 0.004, z: Math.sin(a) * 0.004 };
      list.push({ x: at.x, z: at.z, geo: () => blob(0.0045, 0.0085, 0.0022, (h) => shade(h + 0.004, 0.006), at, q, [8, 6]) });
    }
    const at = { x: 0, y: top + 0.009, z: 0 };
    list.push({ x: 0, z: 0, geo: () => blob(0.0042, 0.0036, 0.0042, tip.clone(), at, null, [8, 6]) });
  }
  return list;
}

// Lo de arriba: ají, azúcar, aceituna, queso, tajitos, sésamo, verdeo, tomate.
function marks(S, look, seed) {
  const list = [];
  const [cx, cz] = S.out.c;
  const top = (x, z) => S.top(x, z);
  const rnd = (i) => hash3(i, 3, 5, seed);
  const peak = { x: cx + (S.knot ? 0.02 : 0), z: cz + (look.shape === 'parada' ? 0.012 : 0) };
  const onTop = (x, z, lift = 0) => ({ x, y: top(x, z) + lift, z });
  const lay = (x, z) => new THREE.Quaternion().setFromUnitVectors(UP, topNormal(S, x, z, new THREE.Vector3()));
  const m = look.mark;
  const col = (hex) => new THREE.Color(hex);
  if (m === 'aji') {
    const at = onTop(peak.x, peak.z, 0.0003);
    list.push({ ...at, geo: () => blob(0.0042, 0.0012, 0.0042, col(0xb8231a), at, lay(at.x, at.z), [10, 5]) });
  } else if (m === 'aceituna') {
    const at = onTop(peak.x, peak.z, 0.0006);
    list.push({ ...at, geo: () => blob(0.0055, 0.0016, 0.0045, col(0x2a2418), at, lay(at.x, at.z), [12, 5]) });
    const at2 = onTop(peak.x, peak.z, 0.0019);
    list.push({ ...at2, geo: () => blob(0.0022, 0.0006, 0.0018, col(0x8a2a20), at2, lay(at.x, at.z), [8, 4]) });
  } else if (m === 'tomate') {
    const at = onTop(peak.x, peak.z, 0.0006);
    list.push({ ...at, geo: () => blob(0.0085, 0.0014, 0.0085, (h, i) => (i % 5 === 0 ? col(0xf0d8a0) : col(0xc8281c)), at, lay(at.x, at.z), [12, 5]) });
    const at2 = onTop(peak.x + 0.009, peak.z - 0.003, 0.0012);
    list.push({ ...at2, geo: () => blob(0.004, 0.0008, 0.0022, col(0x2e7a2a), at2, lay(at2.x, at2.z), [8, 4]) });
  } else if (m === 'queso') {
    for (let i = 0; i < 6; i++) {
      const a = rnd(i) * Math.PI * 2;
      const r = rnd(i + 20) * 0.009;
      const at = onTop(peak.x + Math.cos(a) * r, peak.z + Math.sin(a) * r, 0.0004);
      const k = col(0xf2d890).lerp(col(0xb87a2a), rnd(i + 40) * 0.8);
      list.push({ ...at, geo: () => blob(0.0055 + rnd(i + 9) * 0.003, 0.0014, 0.005, k, at, lay(at.x, at.z), [10, 5]) });
    }
  } else if (m === 'cortes') {
    for (let i = 0; i < 3; i++) {
      const at = onTop(peak.x + (i - 1) * 0.011, peak.z, -0.0004);
      const q = lay(at.x, at.z).multiply(tmpQ.setFromAxisAngle(UP, Math.PI / 2 + 0.3));
      list.push({ ...at, geo: () => blob(0.0065, 0.0009, 0.0011, col(0x3a2010), at, q, [8, 4]) });
    }
  } else if (m === 'azucar' || m === 'sesamo' || m === 'verdeo') {
    const n = m === 'azucar' ? 140 : m === 'sesamo' ? 46 : 10;
    const spread = m === 'verdeo' ? 0.014 : S.R * 0.7;
    for (let i = 0; i < n; i++) {
      const a = rnd(i) * Math.PI * 2;
      const r = Math.sqrt(rnd(i + 500)) * spread;
      const x = peak.x + Math.cos(a) * r;
      const z = peak.z + Math.sin(a) * r * 0.8;
      if (S.out.rho(x, z) > 0.86) continue;
      const at = onTop(x, z, 0.0003);
      const q = lay(x, z).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rnd(i + 900) * 6.28));
      if (m === 'azucar') list.push({ ...at, geo: () => blob(0.0008, 0.0005, 0.0008, col(0xfbf6ea), at, q, [4, 3]) });
      else if (m === 'sesamo') list.push({ ...at, geo: () => blob(0.0017, 0.0006, 0.001, col(0xf0e0b8), at, q, [6, 3]) });
      else list.push({ ...at, geo: () => blob(0.0024, 0.0005, 0.0012, col(rnd(i + 50) > 0.5 ? 0x3a8a2a : 0x6ab04a), at, q, [6, 3]) });
    }
  }
  return list;
}

// ---------------- mordiscos ----------------
// El bocado: círculos (dientes) desde la punta de +x hacia adentro.
function biteCircles(S, n) {
  let best = null;
  for (let j = 0; j < 360; j++) {
    const a = (j / 360) * Math.PI * 2;
    const E = S.out.edge(a, {});
    if (!best || E.x > best.x) best = E;
  }
  const out = [];
  const rb = 0.022;
  for (let k = 0; k < n; k++) {
    const depth = 0.017 + k * 0.021;
    for (const s of [-1, 0, 1]) out.push({ x: best.x + rb - depth - (s ? 0.004 : 0), z: best.z * 0.6 + S.out.c[1] * 0.4 + s * 0.014, r: rb });
  }
  return out;
}

const inside = (cs, x, z, m = 0) => cs.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + m) ** 2);

// El punto del borde del bocado más cercano (afuera de los otros dientes).
function project(S, cs, x, z) {
  let best = null;
  let bd = Infinity;
  const ok = (px, pz) => !inside(cs, px, pz, -1e-5) && S.out.rho(px, pz) < 0.99;
  for (const c of cs) {
    const dx = x - c.x;
    const dz = z - c.z;
    const l = Math.hypot(dx, dz) || 1e-6;
    const px = c.x + (dx / l) * c.r;
    const pz = c.z + (dz / l) * c.r;
    if (!ok(px, pz)) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d < bd) {
      bd = d;
      best = [px, pz];
    }
  }
  if (best) return best;
  // (si el más cercano cae afuera de la empanada: el más cercano que quede adentro, tanteando)
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    for (const c of cs) {
      const px = c.x + Math.cos(a) * c.r;
      const pz = c.z + Math.sin(a) * c.r;
      if (!ok(px, pz)) continue;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = [px, pz];
      }
    }
  }
  return best || [x, z];
}

// La tapa y la base en un punto que puede estar fuera de la silueta (lo trae adentro).
function heights(S, x, z) {
  const rho = S.out.rho(x, z);
  if (rho > 0.995) {
    const [cx, cz] = S.out.c;
    const k = 0.995 / rho;
    x = cx + (x - cx) * k;
    z = cz + (z - cz) * k;
  }
  return [S.top(x, z), S.bot(x, z)];
}

function bitePositions(S, base, side, cs) {
  const pos = base.slice();
  for (let v = 0; v < side.length; v++) {
    const x = pos[v * 3];
    const z = pos[v * 3 + 2];
    if (!inside(cs, x, z)) continue;
    const [px, pz] = project(S, cs, x, z);
    const [t, b] = heights(S, px, pz);
    pos[v * 3] = px;
    pos[v * 3 + 2] = pz;
    pos[v * 3 + 1] = side[v] > 0 ? t : side[v] < 0 ? b : (t + b) * 0.5;
  }
  return pos;
}

// La pared del bocado: el relleno a la vista, con la masa arriba y abajo.
function biteWall(S, look, cs, seed) {
  const fill = new THREE.Color(look.fill || '#6a3a22');
  const C = COOK[look.cook] || COOK.horno;
  const crust = new THREE.Color(C.base).lerp(new THREE.Color(C.brown), 0.35);
  const inner = new THREE.Color(0xf4e2c0);
  const geos = [];
  const ROWS = 6;
  for (const c of cs) {
    // los puntos del arco que quedan en la empanada (adentro de la silueta, afuera de los otros dientes)
    const arcs = [];
    let cur = null;
    const N = 72;
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r;
      const z = c.z + Math.sin(a) * c.r;
      const ok = !cs.some((o) => o !== c && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r - 1e-9) && S.out.rho(x, z) < 0.985;
      if (ok) {
        if (!cur) arcs.push((cur = []));
        cur.push([x, z, a]);
      } else cur = null;
    }
    for (const arc of arcs) {
      if (arc.length < 2) continue;
      const pos = [];
      const col = [];
      for (const [x, z] of arc) {
        const [t, b] = heights(S, x, z);
        const toC = [c.x - x, c.z - z];
        const l = Math.hypot(toC[0], toC[1]) || 1;
        for (let r = 0; r <= ROWS; r++) {
          const f = r / ROWS;
          const y = b + (t - b) * f;
          // el relleno se asoma un poquito (y la masa de adentro, clarita)
          const bulge = Math.sin(f * Math.PI) * 0.0012 * (0.6 + noise3(x * 400, y * 400, z * 400, seed) * 0.8);
          pos.push(x + (toC[0] / l) * bulge, y, z + (toC[1] / l) * bulge);
          const edgeK = Math.min(f, 1 - f) * ROWS;
          const n = noise3(x * 500, y * 500, z * 500, seed + 3);
          if (edgeK < 0.5) tmpC.copy(crust);
          else if (edgeK < 1.2) tmpC.copy(inner);
          else tmpC.copy(fill).multiplyScalar(0.75 + n * 0.5);
          col.push(tmpC.r, tmpC.g, tmpC.b);
        }
      }
      const idx = [];
      const W = ROWS + 1;
      for (let i = 0; i < arc.length - 1; i++) {
        for (let r = 0; r < ROWS; r++) {
          const a = i * W + r;
          const b = (i + 1) * W + r;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      // que mire hacia el bocado (afuera de lo que queda)
      const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, W);
      const p0 = arc[1];
      if (n0.x * (c.x - p0[0]) + n0.z * (c.z - p0[1]) < 0) {
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        g.setIndex(idx);
        g.computeVertexNormals();
      }
      geos.push(g);
    }
  }
  return geos;
}

function shellGeo(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Una empanada: { group, mesh, setBite(n) (0 entera, 1 y 2 mordida), dispose() }.
// La base queda en y = 0.
export function buildEmpanada(id) {
  const E = EMPANADA[id] || EMPANADA.carne;
  const look = E.look;
  const seed = [...E.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0xffff;
  const S = (SHAPES[look.shape] || SHAPES.trenza)();
  const shell = buildShell(S, look, seed);
  pressLip(S, look, shell.pos, shell.side);
  if (look.cook === 'frita') blister(shell.pos, shell.side, seed);
  const col = colorShell(S, look, shell.pos, shell.side, seed);
  const extras = [...pleats(S, look, seed), ...marks(S, look, seed)];
  const lift = -Math.min(...Array.from({ length: shell.nv }, (_, v) => shell.pos[v * 3 + 1]));
  const scale = look.small ? 0.8 : look.big ? 1.1 : 1;
  const versions = [];
  const make = (n) => {
    const cs = n ? biteCircles(S, n) : [];
    const pos = n ? bitePositions(S, shell.pos, shell.side, cs) : shell.pos;
    const parts = [shellGeo(pos, col, shell.idx)];
    for (const x of extras) if (!n || !inside(cs, x.x, x.z, 0.002)) parts.push(x.geo());
    if (n) parts.push(...biteWall(S, look, cs, seed));
    for (const p of parts) for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k);
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.translate(0, lift, 0);
    g.scale(scale, scale, scale);
    g.computeBoundingSphere();
    return g;
  };
  versions[0] = make(0);
  const mesh = new THREE.Mesh(versions[0], doughMat(look.cook));
  mesh.castShadow = true;
  mesh.name = `empanada-${E.id}`;
  const group = new THREE.Group();
  group.add(mesh);
  let bite = 0;
  return {
    group,
    mesh,
    id: E.id,
    // los mordidos se arman la primera vez que hacen falta
    setBite(n) {
      n = Math.max(0, Math.min(2, n | 0));
      if (n === bite) return;
      bite = n;
      versions[n] ||= make(n);
      mesh.geometry = versions[n];
    },
    prepareBites() {
      versions[1] ||= make(1);
      versions[2] ||= make(2);
    },
    dispose() {
      for (const g of versions) g?.dispose();
    },
  };
}

// ---------------- la mano que come ----------------
// Mano derecha que agarra la empanada de abajo: la palma y los dedos por
// debajo y el pulgar arriba, apretando el repulgue. En el marco de la mano,
// la empanada va con el largo en x, la punta mordible hacia +x.
export function buildEatHand(VM, T) {
  const M = VM.mats(T);
  const g = new THREE.Group();
  const { limb } = VM;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.skin);
  palm.scale.set(0.042, 0.016, 0.036);
  palm.position.set(-0.03, -0.012, 0.012);
  g.add(palm);
  // cuatro dedos por abajo, curvándose hacia arriba del lado de -z (el de afuera)
  const F = [
    { x: -0.004, len: [0.024, 0.016, 0.012], r: 0.0082 },
    { x: -0.02, len: [0.026, 0.017, 0.013], r: 0.0086 },
    { x: -0.036, len: [0.024, 0.016, 0.012], r: 0.0082 },
    { x: -0.05, len: [0.019, 0.013, 0.01], r: 0.0072 },
  ];
  for (const f of F) {
    const p0 = V(f.x, -0.014, 0.01);
    const p1 = V(f.x + 0.002, -0.012, 0.01 - f.len[0]);
    const p2 = V(f.x + 0.003, -0.002, 0.01 - f.len[0] - f.len[1] * 0.75);
    const p3 = V(f.x + 0.003, 0.008, 0.01 - f.len[0] - f.len[1] * 0.75 + f.len[2] * 0.35);
    g.add(limb(p0, p1, f.r, M.skin), limb(p1, p2, f.r * 0.94, M.skin), limb(p2, p3, f.r * 0.86, M.skin));
    const nail = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.75, 8, 6), M.nail);
    nail.scale.set(1, 0.35, 1.2);
    nail.position.copy(p3).add(V(0, 0.001, -f.r * 0.5));
    g.add(nail);
  }
  // el pulgar arriba, apoyado sobre la empanada
  const t0 = V(-0.012, -0.004, 0.034);
  const t1 = V(0.0, 0.016, 0.03);
  const t2 = V(0.008, 0.03, 0.022);
  const t3 = V(0.012, 0.036, 0.012);
  g.add(limb(t0, t1, 0.011, M.skin), limb(t1, t2, 0.0102, M.skin), limb(t2, t3, 0.0094, M.skin));
  const tn = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), M.nail);
  tn.scale.set(1, 0.35, 1.25);
  tn.position.copy(t3).add(V(0, 0.005, 0.001));
  g.add(tn);
  // muñeca, puño y manga hacia abajo y hacia la cámara
  const w0 = V(-0.06, -0.018, 0.03);
  const dir = V(-0.55, -0.55, 0.62).normalize();
  const w1 = w0.clone().addScaledVector(dir, 0.03);
  g.add(limb(w0, w1, 0.021, M.skin));
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.011, 8, 18), M.cuff);
  roll.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  roll.position.copy(w1);
  roll.name = 'cuff';
  g.add(roll);
  // (la manga: arriba, la muñeca; quien anima la mano la saca y la tiende de
  // la muñeca al hombro, que queda abajo a la derecha fuera de la pantalla)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.052, 0.55, 16, 1, true), M.sleeve);
  sleeve.quaternion.copy(q);
  sleeve.position.copy(w1).addScaledVector(dir, 0.275);
  sleeve.name = 'sleeve';
  g.add(sleeve);
  g.userData.wrist = w1.clone();
  return g;
}

// Todas las formas y cocciones, para compilar los shaders en la carga.
export const EMPANADA_SHAPES = Object.keys(SHAPES);

// ---------------- ícono ----------------
// La empanada vista de arriba y de costado, en una imagen (el HUD y la
// pulpería). Se dibuja una vez por empanada con la placa del juego.
const ICONS = new Map();
let iconRig = null;
export function empanadaIcon(renderer, id, size = 96) {
  const key = `${id}|${size}`;
  if (ICONS.has(key)) return ICONS.get(key);
  if (!iconRig) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff2dc, 0x3a2a1a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(0.5, 1.2, 0.9);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
    iconRig = { scene, cam };
  }
  const { scene, cam } = iconRig;
  const e = buildEmpanada(id);
  e.mesh.castShadow = false;
  e.group.rotation.y = -0.5;
  scene.add(e.group);
  const box = new THREE.Box3().setFromObject(e.group);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() * 0.5;
  const dist = r / Math.sin((cam.fov * Math.PI) / 360) * 0.92;
  cam.position.set(c.x, c.y + dist * 0.62, c.z + dist * 0.78);
  cam.lookAt(c);
  const S = size * 2;
  const rt = new THREE.WebGLRenderTarget(S, S);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(S * S * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.shadowMap.autoUpdate = prevShadow;
  scene.remove(e.group);
  e.dispose();
  rt.dispose();
  // (la placa lee de abajo para arriba)
  const big = document.createElement('canvas');
  big.width = big.height = S;
  const bx = big.getContext('2d');
  const img = bx.createImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  bx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ox = out.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(big, 0, 0, size, size);
  const url = out.toDataURL('image/png');
  ICONS.set(key, url);
  return url;
}
