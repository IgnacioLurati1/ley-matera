import * as THREE from 'three';
import { slStaticLook } from './sanlorenzoLook';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ECLIPSE_DIR } from '../eclipseSky';
import { MAP_W, MAP_H } from '../../config/maps/eclipse';

// El campo de San Lorenzo, 3 de febrero de 1813 (Eclipse Matero: la pelea
// final, entities/eclipse/SanLorenzo.js), arrancado del mundo por el eclipse:
// una isla grande de roca que flota en el vacío. De oeste a este: la pampa con
// sus lomas, el Convento de San Carlos (la iglesia con su campanario, el
// claustro con su patio y sus galerías, las celdas y la huerta con su muro),
// el llano de la pelea (ombúes, talas, el pozo, carretas, los cañones de los
// realistas con sus cestones, fuegos y banderas), la barranca colorada de 19 m
// con sus dos bajadas, la playa y el Paraná con la escuadra fondeada, y la
// otra orilla con las islas del delta. El río se cae por los dos extremos de la
// isla en cascadas al vacío; abajo cuelga la roca arrancada y alrededor flotan
// pedazos sueltos. Lo que se mueve (fuego, humo, banderas, agua, botes):
// world/eclipse/sanlorenzoVivo.js.
//
// Marco propio: u va hacia el río, que mira para el lado del eclipse del cielo
// (world/eclipseSky ECLIPSE_DIR: el sol asoma sobre el agua), y v de costado
// (+v, el norte del campo). toWorld / toLocal pasan de uno a otro.
//
// Barato: todo lo quieto es UNA malla fundida (colores por vértice, caras
// planas como el resto del juego) más una de brillos (ventanas, faroles); el
// piso aparte (con la textura de pasto); el pasto y los cardos, instanciados;
// el agua, una. El piso (hLoc), los choques (clampLocal) y los tiros contra el
// piso, los edificios y lo que hay en el campo (rayCampo) son cuentas.
// (2026-10-06, sanlorenzo2: "San Lorenzo de cero"; el campo de antes en el
// scratchpad, sanlorenzo2/bak_sanlorenzoCampo.js.)

// dónde está (el medio del campo, a la altura del piso): 200 m al este de la
// grilla de las islas (el layout cambia de tamaño: se lee del config)
export const SL0 = { x: (MAP_W || 275) + 200, y: 14, z: (MAP_H || 312) * 0.5 };
const Y0 = SL0.y;
// el Paraná, la playa, el lecho y la otra orilla
export const WATER_Y = -6;
const BEACH_Y = -4.9;
const BED_Y = -11;
const BANK_Y = -4.3;
// la rampa de las bajadas: de 9 m adentro del borde hasta la playa
const RAMP_U0 = 9;
const RAMP_K = (Y0 - BEACH_Y) / (RAMP_U0 + 13);
const RIV = new THREE.Vector2(ECLIPSE_DIR.x, ECLIPSE_DIR.z).normalize();
// el giro del marco (como rotation.y de un grupo: +u del campo → RIV del mundo)
export const YAW = Math.atan2(-RIV.y, RIV.x);
const CY = Math.cos(YAW);
const SY = Math.sin(YAW);

// Lo que hay en el campo (en u, v).
export const F = {
  // el muro de la huerta (de -WALL_V a WALL_V) y sus dos portones
  wallU: -44,
  wallV: 32,
  gates: [
    [-11.5, -7.5],
    [7.5, 11.5],
  ],
  // la iglesia, el campanario y las celdas: [u0, u1, v0, v1]
  church: [-64, -53, -16, 8],
  tower: [-61.5, -55.5, 8, 14],
  cloister: [-70, -53, -36, -16],
  // el claustro (afuera y el patio)
  quad: [-96, -66, -20, 14],
  patio: [-89, -73, -13, 7],
  // las dos bajadas de la barranca (su v) y su medio ancho
  bajadas: [-22, 20],
  bajW: 3.2,
  // lo que se puede caminar
  u0: -52.2,
  vMax: 44,
  // los ombúes: [u, v, radio del tronco]
  ombues: [
    [-26, 31, 1.15],
    [9, -33, 1.25],
    [-14, -27, 1.0],
    [27, 33, 1.1],
  ],
  // las talas (más chicas): [u, v, radio del tronco]
  talas: [
    [-36, 40, 0.35],
    [-4, 41.5, 0.32],
    [33, -40, 0.34],
    [-38, -39, 0.3],
    [17, -16, 0.3],
  ],
  // las lomadas: [u, v, radio, alto]
  lomas: [
    [4, 13, 9.5, 1.35],
    [19, -12, 8.5, 1.1],
    [-24, 4, 7, 0.55],
  ],
  // las carretas: [u, v, giro, estado] (0 parada, 1 volcada, 2 ardiendo)
  carts: [
    [-21, 24, 0.5, 0],
    [8, -38.5, -0.3, 2],
    [4, 33, 1.9, 1],
  ],
  // los cañones de los realistas (subieron dos por las bajadas): [u, v, giro]
  cannons: [
    [31.5, -8.5, Math.PI * 0.96],
    [31.5, 9.5, Math.PI * 1.04],
  ],
  // el pozo de balde del campo
  pozo: [-30, -15],
  // los fuegos del pasto y lo que arde: [u, v, tamaño]
  fires: [
    [8, -38.5, 1.25],
    [-20, 8.5, 0.75],
    [-2, -9, 0.7],
    [-33, -18, 0.6],
    [-31, 14.5, 0.55],
  ],
  // las banderas de los realistas (la Cruz de Borgoña) y las nuestras: [u, v, alto]
  flagsR: [
    [36.5, -29.6, 3.6],
    [36, 27.6, 3.6],
    [33.2, -5.4, 2.6],
    [33.2, 12.6, 2.6],
  ],
  flagsP: [
    [-44, -11.5, 3.4],
    [-44, 11.5, 3.4],
  ],
  // los bergantines de la escuadra: [u, v, giro, eslora]
  ships: [
    [118, -52, 0.3, 24],
    [140, 8, -0.15, 26],
    [122, 52, 0.5, 22],
    [168, -22, 0.1, 30],
  ],
};

export function toWorld(u, v, y = null, out = new THREE.Vector3()) {
  return out.set(SL0.x + CY * u + SY * v, y ?? hLoc(u, v), SL0.z - SY * u + CY * v);
}
export function toLocal(x, z, out = {}) {
  const dx = x - SL0.x;
  const dz = z - SL0.z;
  out.u = CY * dx - SY * dz;
  out.v = SY * dx + CY * dz;
  return out;
}
// el yaw del mundo (atan2(x, z), como los muertos y los caballos) de una dirección del campo
export function yawOf(du, dv) {
  return Math.atan2(CY * du + SY * dv, -SY * du + CY * dv);
}
// una dirección del campo en el mundo
export function dirWorld(du, dv, out = new THREE.Vector3()) {
  return out.set(CY * du + SY * dv, 0, -SY * du + CY * dv);
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// ---------------- la isla ----------------
// El borde: un óvalo con lóbulos alrededor de IC (en u, v). rimR(a): hasta
// dónde llega la isla en el ángulo a (desde IC).
export const IC = { u: 72, v: 0 };
const AU = 232;
const AV = 165;
const RN = [
  [2, 0.05, 1.3],
  [3, 0.06, 0.2],
  [4, 0.035, 2.2],
  [5, 0.04, 4.1],
  [7, 0.025, 0.7],
  [9, 0.02, 3.3],
  [13, 0.012, 1.9],
  [21, 0.006, 0.4],
];
export function rimR(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let k = 1;
  for (const [n, amp, ph] of RN) k += amp * Math.sin(n * a + ph);
  return k / Math.hypot(c / AU, s / AV);
}
// (1 en el borde, menos adentro)
export function rimK(u, v) {
  const du = u - IC.u;
  const dv = v - IC.v;
  return Math.hypot(du, dv) / rimR(Math.atan2(dv, du));
}

// el borde de la barranca (irregular; más allá del campo, más ondulado)
export function edgeU(v) {
  const a = Math.abs(v);
  return 45 + 1.3 * Math.sin(v * 0.19 + 0.6) + 0.8 * Math.sin(v * 0.071 + 2.1) + (a > 40 ? 4.5 * Math.sin(v * 0.021 + 0.9) * smooth(40, 90, a) : 0);
}
// la otra orilla del Paraná
export function farBank(v) {
  return 200 + 16 * Math.sin(v * 0.018 + 1.1) + 9 * Math.sin(v * 0.047 + 0.3);
}
// cuánto de bajada hay en v (1 en el medio de una, 0 lejos)
export function bajK(v) {
  let k = 0;
  for (const b of F.bajadas) k = Math.max(k, 1 - smooth(F.bajW, F.bajW + 2.8, Math.abs(v - b)));
  return k;
}
// la cara de la barranca: del borde (0) a la playa (1), pared arriba y talud abajo, con escalones
function prof(s) {
  return 1 - Math.pow(1 - s, 1.7) + 0.05 * Math.sin(s * 15.7) * s * (1 - s) * 4;
}

// La altura del piso en (u, v) del campo.
export function hLoc(u, v) {
  const e = edgeU(v);
  // la pampa: apenas ondulada; lejos, lomas (no del lado del río)
  let top = Y0 + 0.16 * Math.sin(u * 0.13 + 1.3) * Math.cos(v * 0.11) * smooth(-46, -36, u);
  const r = Math.hypot(u + 5, v);
  if (r > 68) {
    const far = smooth(68, 135, r) * (1 - smooth(e - 34, e - 12, u));
    if (far > 0) top += far * (3.4 + 2.2 * Math.sin(Math.atan2(v, u) * 5 + 1.1) + 1.4 * Math.sin(r * 0.06) + 1.2 * Math.sin(u * 0.05 - v * 0.04));
    // (antes del vacío la tierra se cae un poco)
    const k = rimK(u, v);
    if (k > 0.88) top -= smooth(0.88, 1.0, k) * 4;
  }
  for (const [lu, lv, lr, lh] of F.lomas) {
    const d = Math.hypot(u - lu, v - lv);
    if (d < lr) {
      const k = 1 - d / lr;
      top += lh * k * k * (3 - 2 * k);
    }
  }
  if (u < e - RAMP_U0 - 0.5) return top;
  // la barranca: el borde se cae a pique a la playa, la playa entra al agua
  const t = (u - (e - 0.5)) / 9;
  let low;
  if (t <= 0) low = top;
  else if (t < 1) {
    // (las cárcavas de la cara)
    const gul = Math.max(0, Math.sin(v * 0.83 + 0.4 * Math.sin(v * 0.21)));
    low = Y0 - (Y0 - BEACH_Y) * prof(t) - 1.1 * gul * gul * t * (1 - t) * 4;
  } else {
    const b = u - (e + 8.5);
    low = b < 5.5 ? BEACH_Y - b * 0.27 : Math.max(BED_Y, BEACH_Y - 1.5 - (b - 5.5) * 0.55);
  }
  // la otra orilla: las islas del delta, bajas
  const fb = farBank(v);
  if (u > fb - 16) {
    // (la orilla sube de golpe: así la línea del agua queda limpia)
    let bank = BED_Y + (BANK_Y - BED_Y) * smooth(fb - 7, fb, u);
    if (u > fb) bank += 0.6 * Math.sin(u * 0.11 + v * 0.07) * smooth(fb, fb + 8, u) + 2.2 * smooth(fb + 25, fb + 70, u) * (0.6 + 0.4 * Math.sin(v * 0.05));
    if (u > fb - 2) {
      const k = rimK(u, v);
      if (k > 0.9) bank -= smooth(0.9, 1.0, k) * 2.5;
    }
    low = Math.max(low, bank);
  }
  let y = Math.min(top, low);
  // las bajadas: una rampa de tierra que baja del campo a la playa
  const k = bajK(v);
  if (k > 0) {
    const ramp = clamp(Y0 - (u - (e - RAMP_U0)) * RAMP_K, BEACH_Y, Y0);
    const yr = u > e + 13 ? low : Math.min(top, ramp);
    y = y + (yr - y) * k;
  }
  return y;
}

// ---------------- lo que se camina ----------------
// Empuja (u, v) adentro de lo caminable, fuera del muro, los edificios, los
// troncos y lo que hay en el campo. o.u / o.v se corrigen; r: el radio del cuerpo.
const WALLS = [];
// cilindros que frenan (choques y tiros): [u, v, radio, alto]
const CYL = [];
{
  const [g0, g1] = F.gates;
  const W = F.wallU;
  // el muro, en tres tramos (los portones abiertos)
  WALLS.push([W - 0.32, W + 0.32, -F.wallV, g0[0]], [W - 0.32, W + 0.32, g0[1], g1[0]], [W - 0.32, W + 0.32, g1[1], F.wallV]);
  // los pilares de los portones (un poco más anchos)
  for (const gg of F.gates) for (const vv of gg) WALLS.push([W - 0.45, W + 0.45, vv - 0.45, vv + 0.45]);
  // el pozo de la huerta
  WALLS.push([-49.3, -48.1, 3.4, 4.6]);
  for (const [u, v, r] of F.ombues) CYL.push([u, v, r, 4.2]);
  for (const [u, v, r] of F.talas) CYL.push([u, v, r + 0.05, 2.6]);
  CYL.push([F.pozo[0], F.pozo[1], 1.0, 1.0]);
  // las carretas: dos círculos a lo largo (la volcada, más bajos)
  for (const [u, v, ry, st] of F.carts) {
    const du = Math.cos(ry);
    const dv = -Math.sin(ry);
    for (const s of [-1.1, 1.1]) CYL.push([u + du * s, v + dv * s, 1.25, st === 1 ? 1.4 : 2.3]);
  }
  // los cañones y sus cestones
  for (const [u, v, ry] of F.cannons) {
    CYL.push([u, v, 1.0, 1.4]);
    const fu = Math.cos(ry);
    const fv = -Math.sin(ry);
    for (const s of [-1.3, 1.3]) CYL.push([u + fu * 1.9 - fv * s, v + fv * 1.9 + fu * s, 0.55, 1.1]);
  }
}
// Los troncos, las carretas, los cañones y el pozo: [u, v, radio, alto] (para
// esquivarlos de antes; entities/eclipse/slAliados).
export function propCyls() {
  return CYL;
}

// Lo que esquiva lo que se mueve con guion (la caballería): saca (u, v) de los
// troncos, las carretas, los cañones y el pozo. Devuelve true si lo movió.
export function avoidProps(o, r = 1) {
  let moved = false;
  for (const [cu, cv, cr] of CYL) {
    const du = o.u - cu;
    const dv = o.v - cv;
    const m = cr + r;
    if (Math.abs(du) > m || Math.abs(dv) > m) continue;
    const d = Math.hypot(du, dv);
    if (d < m && d > 1e-6) {
      o.u = cu + (du / d) * m;
      o.v = cv + (dv / d) * m;
      moved = true;
    }
  }
  return moved;
}

// el palenque de los costados: v = ±FENCE_V (de punta a punta del campo)
const FENCE_V = 46;
export function clampLocal(o, r = 0.4) {
  const u0 = o.u;
  // el frente del convento
  if (o.u < F.u0 + r) o.u = F.u0 + r;
  if (o.v > F.vMax - r) o.v = F.vMax - r;
  if (o.v < -F.vMax + r) o.v = -F.vMax + r;
  // la barranca: hasta el borde, salvo por las bajadas (hasta la playa)
  const e = edgeU(o.v);
  let inBaj = null;
  for (const b of F.bajadas) if (Math.abs(o.v - b) < F.bajW + 3) inBaj = b;
  if (inBaj == null || o.u < e - RAMP_U0 + 3) {
    if (inBaj == null && o.u > e - 0.7 - r) o.u = e - 0.7 - r;
  } else {
    if (o.u > e + 11.5) o.u = e + 11.5;
    // la zanja de la bajada: adentro no se sale por los costados y de afuera
    // no se baja por la pared (al lado que esté más cerca)
    const dv = o.v - inBaj;
    const a = Math.abs(dv);
    const lim = F.bajW - r * 0.5;
    if (a > lim && a < F.bajW + 2.8) {
      if (a - lim < F.bajW + 2.8 - a) o.v = inBaj + Math.sign(dv) * lim;
      else o.v = inBaj + Math.sign(dv) * (F.bajW + 2.8);
    }
    if (o.u > e - 0.7 - r && Math.abs(o.v - inBaj) > F.bajW) o.u = e - 0.7 - r;
  }
  for (const [a0, a1, b0, b1] of WALLS) {
    if (o.u < a0 - r || o.u > a1 + r || o.v < b0 - r || o.v > b1 + r) continue;
    const nu = clamp(o.u, a0, a1);
    const nv = clamp(o.v, b0, b1);
    const du = o.u - nu;
    const dv = o.v - nv;
    const d2 = du * du + dv * dv;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      o.u += (du / d) * (r - d);
      o.v += (dv / d) * (r - d);
    } else {
      const pen = [o.u - a0, a1 - o.u, o.v - b0, b1 - o.v];
      const m = Math.min(...pen);
      if (m === pen[0]) o.u = a0 - r;
      else if (m === pen[1]) o.u = a1 + r;
      else if (m === pen[2]) o.v = b0 - r;
      else o.v = b1 + r;
    }
  }
  for (const [cu, cv, cr] of CYL) {
    const du = o.u - cu;
    const dv = o.v - cv;
    const m = cr + r;
    if (Math.abs(du) > m || Math.abs(dv) > m) continue;
    const d = Math.hypot(du, dv);
    if (d < m && d > 1e-6) {
      o.u = cu + (du / d) * m;
      o.v = cv + (dv / d) * m;
    }
  }
  return o.u !== u0;
}

// ---------------- los tiros ----------------
// Las cajas que frenan tiros: [u0, u1, y0, y1, v0, v1] (el muro, los edificios)
const SOLID = [];
// Rayo (en el mundo) contra el piso, los edificios, el muro, los troncos y lo
// del campo. Devuelve la distancia (o Infinity) y completa hit como World.raycast.
const ro = {};
export function rayCampo(o, d, maxT, hit) {
  toLocal(o.x, o.z, ro);
  const du = CY * d.x - SY * d.z;
  const dv = SY * d.x + CY * d.z;
  let best = Math.min(maxT, 300);
  let n = null;
  // el piso: a pasos (cortos cerca, largos lejos) y después a la mitad
  let tPrev = 0;
  const above = o.y - hLoc(ro.u, ro.v);
  if (above > -0.05) {
    let t = 0;
    while (t < best) {
      const step = t < 20 ? 0.6 : t < 60 ? 1.4 : 3;
      t = Math.min(best, t + step);
      const y = o.y + d.y * t;
      const h = hLoc(ro.u + du * t, ro.v + dv * t);
      if (y < h) {
        let a = tPrev;
        let b = t;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m < hLoc(ro.u + du * m, ro.v + dv * m)) b = m;
          else a = m;
        }
        best = b;
        n = 'floor';
        break;
      }
      tPrev = t;
      if (y > Y0 + 60 && d.y >= 0) break;
    }
  }
  // las cajas
  let nb = null;
  for (const S of SOLID) {
    const t = slab(ro.u, o.y, ro.v, du, d.y, dv, S);
    if (t >= 0 && t < best) {
      best = t;
      n = 'box';
      nb = S;
    }
  }
  // los cilindros (troncos, carretas, cañones, el pozo)
  for (const [cu, cv, cr, ch] of CYL) {
    const fu = ro.u - cu;
    const fv = ro.v - cv;
    const a = du * du + dv * dv;
    if (a < 1e-9) continue;
    const b = fu * du + fv * dv;
    const c = fu * fu + fv * fv - cr * cr;
    const disc = b * b - a * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t >= best) continue;
    const y = o.y + d.y * t;
    const gy = hLoc(cu, cv);
    if (y < gy - 0.5 || y > gy + ch) continue;
    best = t;
    n = 'trunk';
    nb = [cu, cv];
  }
  if (!n || best >= maxT) return Infinity;
  hit.t = best;
  hit.box = n === 'floor' ? 'floor' : 'prop';
  hit.point = hit.point || new THREE.Vector3();
  hit.point.set(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
  hit.normal = hit.normal || new THREE.Vector3();
  if (n === 'floor') {
    // la normal del piso, de las diferencias
    const p = toLocal(hit.point.x, hit.point.z, {});
    const e = 0.4;
    const gu = (hLoc(p.u + e, p.v) - hLoc(p.u - e, p.v)) / (2 * e);
    const gv = (hLoc(p.u, p.v + e) - hLoc(p.u, p.v - e)) / (2 * e);
    // (en el campo: -gu, 1, -gv; al mundo)
    hit.normal.set(CY * -gu + SY * -gv, 1, -SY * -gu + CY * -gv).normalize();
  } else if (n === 'trunk') {
    const pu = ro.u + du * best - nb[0];
    const pv = ro.v + dv * best - nb[1];
    dirWorld(pu, pv, hit.normal).normalize();
  } else {
    const fu = ro.u + du * best;
    const fv = ro.v + dv * best;
    const S = nb;
    const dd = [Math.abs(fu - S[0]), Math.abs(fu - S[1]), Math.abs(o.y + d.y * best - S[2]), Math.abs(o.y + d.y * best - S[3]), Math.abs(fv - S[4]), Math.abs(fv - S[5])];
    const i = dd.indexOf(Math.min(...dd));
    if (i < 2) dirWorld(i === 0 ? -1 : 1, 0, hit.normal);
    else if (i < 4) hit.normal.set(0, i === 2 ? -1 : 1, 0);
    else dirWorld(0, i === 4 ? -1 : 1, hit.normal);
  }
  return best;
}
function slab(ou, oy, ov, du, dy, dv, S) {
  let t0 = -Infinity;
  let t1 = Infinity;
  const O = [ou, oy, ov];
  const D = [du, dy, dv];
  for (let k = 0; k < 3; k++) {
    const lo = S[k * 2];
    const hi = S[k * 2 + 1];
    if (Math.abs(D[k]) < 1e-9) {
      if (O[k] < lo || O[k] > hi) return -1;
      continue;
    }
    let a = (lo - O[k]) / D[k];
    let b = (hi - O[k]) / D[k];
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t1 < 0 ? -1 : Math.max(0, t0);
}

// ---------------- las mallas ----------------
const tmpC = new THREE.Color();
// Una geometría de un color, sin índices, solo posición y color (las normales
// van al final, planas).
function paint(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  tmpC.set(hex);
  for (let i = 0; i < n; i += 3) {
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    for (let k = 0; k < 3; k++) a.set([tmpC.r * j, tmpC.g * j, tmpC.b * j], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// una caja de u0 a u1, y0 a y1, v0 a v1
const box = (u0, u1, y0, y1, v0, v1, hex, j = 0.06) => paint(new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0).translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2), hex, j);
// un techo de dos aguas con la cumbrera a lo largo de v (o de u si alongU)
function gable(u0, u1, v0, v1, y0, yr, hex, alongU = false, over = 0.5) {
  const P = [];
  if (!alongU) {
    const um = (u0 + u1) / 2;
    const a0 = u0 - over;
    const a1 = u1 + over;
    const b0 = v0 - over;
    const b1 = v1 + over;
    P.push(a0, y0, b0, um, yr, b0, um, yr, b1, a0, y0, b0, um, yr, b1, a0, y0, b1);
    P.push(a1, y0, b0, a1, y0, b1, um, yr, b1, a1, y0, b0, um, yr, b1, um, yr, b0);
    P.push(u0, y0, v0, u1, y0, v0, um, yr, v0);
    P.push(u0, y0, v1, um, yr, v1, u1, y0, v1);
  } else {
    const vm = (v0 + v1) / 2;
    const a0 = u0 - over;
    const a1 = u1 + over;
    const b0 = v0 - over;
    const b1 = v1 + over;
    P.push(a0, y0, b0, a1, y0, b0, a1, yr, vm, a0, y0, b0, a1, yr, vm, a0, yr, vm);
    P.push(a0, y0, b1, a0, yr, vm, a1, yr, vm, a0, y0, b1, a1, yr, vm, a1, y0, b1);
    P.push(u0, y0, v0, u0, yr, vm, u0, y0, v1);
    P.push(u1, y0, v0, u1, y0, v1, u1, yr, vm);
  }
  // (las caras miran para afuera: cada triángulo dado vuelta; antes los
  // techos se veían de abajo nomás y de arriba el convento quedaba sin tejas)
  for (let i = 0; i < P.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = P[i + 3 + k];
      P[i + 3 + k] = P[i + 6 + k];
      P[i + 6 + k] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return paint(g, hex, 0.08);
}
// algo puesto en (u, y, v) con un giro
const at = (geo, u, y, v, ry = 0, rx = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(u, y, v));
// una pieza armada en su propio marco (M) y llevada al campo
const put = (geo, M) => geo.applyMatrix4(M);
const frame = (u, y, v, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(u, y, v);

// colores (sRGB)
const COL = {
  cal: 0xd8ceb6,
  calSombra: 0xb8ac90,
  zocalo: 0xa88a5c,
  teja: 0xa2462a,
  tejaOsc: 0x7e3420,
  madera: 0x4a3020,
  maderaClara: 0x7a5636,
  hierro: 0x2a2826,
  bronce: 0x9a7432,
  ladrillo: 0xb06a44,
  adobe: 0x9c7a56,
  pasto: 0x6e8434,
  pastoSeco: 0x948a44,
  pastoOsc: 0x56682a,
  quemado: 0x2c2620,
  tierra: 0x7a5636,
  arcilla: 0xb0582e,
  arcillaOsc: 0x823e22,
  arena: 0xc0aa80,
  barro: 0x4a3a2a,
  hoja: 0x3e6a2a,
  hojaOsc: 0x2c5020,
  sauce: 0x5a7a34,
  tronco: 0x5a4632,
  casco: 0x3a2a1e,
  cascoOsc: 0x241a12,
  amarillo: 0xc09030,
  vela: 0xd8d0bc,
  velaSucia: 0xb8ae98,
  cuero: 0x8a6a46,
  mimbre: 0x7a6236,
  roca: 0x5a4a40,
  rocaOsc: 0x2e2630,
  hondo: 0x160e1c,
};
const RIFT = new THREE.Color(0x7a2cc8);

// ---------------- el piso ----------------
// Una grilla (fina en el campo, gruesa lejos) recortada por el borde de la
// isla: los vértices de afuera se llevan al borde (así el piso termina justo
// donde empieza la roca). Color por altura y pendiente; sin el lecho del río.
function buildGround() {
  const us = [];
  for (let u = -170; u < -110; u += 10) us.push(u);
  for (let u = -110; u < -75; u += 4) us.push(u);
  for (let u = -75; u < 72; u += 1.25) us.push(u);
  for (let u = 72; u < 120; u += 4) us.push(u);
  for (let u = 120; u <= 320; u += 10) us.push(u);
  const vs = [];
  for (let v = -180; v < -100; v += 10) vs.push(v);
  for (let v = -100; v < -64; v += 4) vs.push(v);
  for (let v = -64; v < 64; v += 1.5) vs.push(v);
  for (let v = 64; v < 100; v += 4) vs.push(v);
  for (let v = 100; v <= 180; v += 10) vs.push(v);
  const nu = us.length;
  const nv = vs.length;
  // cada vértice: adentro (o llevado al borde) y su altura
  const PU = new Float32Array(nu * nv);
  const PV = new Float32Array(nu * nv);
  const H = new Float32Array(nu * nv);
  const IN = new Uint8Array(nu * nv);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      let u = us[i];
      let v = vs[j];
      const du = u - IC.u;
      const dv = v - IC.v;
      const a = Math.atan2(dv, du);
      const R = rimR(a);
      const d = Math.hypot(du, dv);
      IN[k] = d <= R ? 1 : 0;
      if (d > R) {
        u = IC.u + (du / d) * R;
        v = IC.v + (dv / d) * R;
      }
      PU[k] = u;
      PV[k] = v;
      H[k] = hLoc(u, v);
    }
  }
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const cA = new THREE.Color();
  const pick = (u, v, y, slope) => {
    const e = edgeU(v);
    const k = bajK(v);
    // el pasto: seco y verde en manchas
    const n1 = Math.sin(u * 0.21 + v * 0.13) * Math.sin(u * 0.07 - v * 0.19 + 2) + 0.5 * Math.sin(u * 0.53 + 1) * Math.sin(v * 0.47);
    const fine = 1 - smooth(70, 110, Math.max(Math.abs(u + 5), Math.abs(v)));
    c.set(COL.pasto).lerp(cA.set(n1 > 0.25 ? COL.pastoSeco : COL.pastoOsc), Math.min(1, Math.abs(n1) * 0.6) * (0.25 + 0.75 * fine));
    // los caminos de tierra: de cada portón al este, y el de la huerta
    for (const gg of F.gates) {
      const gv = (gg[0] + gg[1]) / 2;
      const w = 1.6 + 0.3 * Math.sin(u * 0.3);
      const dv = Math.abs(v - (gv + 3 * Math.sin(u * 0.05 + gv)));
      if (u > F.wallU - 1 && u < 30 && dv < w) c.lerp(cA.set(COL.tierra), 0.8 * (1 - dv / w));
    }
    // el camino del convento a la pampa (al oeste, por el norte del claustro)
    {
      const dv = Math.abs(v - (22 + 6 * Math.sin(u * 0.03)));
      if (u < -60 && dv < 2.2) c.lerp(cA.set(COL.tierra), 0.7 * (1 - dv / 2.2));
    }
    // la huerta: tierra arada
    if (u < F.wallU && u > F.u0 - 1 && Math.abs(v) < F.wallV) c.lerp(cA.set(COL.tierra), 0.55 + 0.25 * Math.sin(v * 2.2));
    // el patio del claustro: tierra apisonada
    const [pu0, pu1, pv0, pv1] = F.patio;
    if (u > pu0 && u < pu1 && v > pv0 && v < pv1) c.lerp(cA.set(COL.tierra), 0.5);
    // lo quemado alrededor de los fuegos y los pozos de las balas
    for (const [fu, fv, fs] of F.fires) {
      const d = Math.hypot(u - fu, v - fv);
      if (d < 4.5 * fs + 1) c.lerp(cA.set(COL.quemado), 0.8 * (1 - smooth(1.5 * fs, 4.5 * fs + 1, d)));
    }
    for (let i = 0; i < 9; i++) {
      const cu = -20 + ((i * 41) % 58);
      const cv = -38 + ((i * 29) % 74);
      const d = Math.hypot(u - cu, v - cv);
      if (d < 2.4) c.lerp(cA.set(d < 1.2 ? COL.quemado : COL.tierra), 0.7);
    }
    // la barranca colorada, la playa y el barro del río
    if (slope > 0.9) c.lerp(cA.set(slope > 2 ? COL.arcillaOsc : COL.arcilla), Math.min(1, (slope - 0.9) * 1.5));
    if (k > 0.3 && u > e - RAMP_U0 - 1 && u < e + 15) c.lerp(cA.set(COL.tierra), (k - 0.3) * 1.2);
    if (u > e && y < BEACH_Y + 1.5) c.lerp(cA.set(COL.arena), smooth(BEACH_Y + 1.5, BEACH_Y, y));
    if (y < WATER_Y + 0.4) c.lerp(cA.set(COL.barro), smooth(WATER_Y + 0.4, WATER_Y - 0.8, y));
    // la otra orilla: pasto de bañado, más oscuro
    if (u > farBank(v) - 4 && y > WATER_Y + 0.3) c.lerp(cA.set(COL.sauce), 0.45);
    // cerca del vacío: la tierra se oscurece y se tiñe de violeta
    if (Math.abs(u - 60) > 90 || Math.abs(v) > 90) {
      const kr = rimK(u, v);
      if (kr > 0.9) c.lerp(cA.set(0x3a2448), smooth(0.9, 1.0, kr) * 0.55);
    }
    return c;
  };
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const ia = j * nu + i;
      const ib = ia + 1;
      const id = ia + nu;
      const ic = id + 1;
      // (afuera del todo: no va)
      if (!IN[ia] && !IN[ib] && !IN[ic] && !IN[id]) continue;
      // todo lo que queda bajo el agua no se arma (el agua es opaca)
      if (Math.max(H[ia], H[ib], H[ic], H[id]) < WATER_Y - 1.0) continue;
      const a = [PU[ia], H[ia], PV[ia]];
      const b = [PU[ib], H[ib], PV[ib]];
      const cc = [PU[ic], H[ic], PV[ic]];
      const d = [PU[id], H[id], PV[id]];
      for (const tri of [
        [a, d, cc],
        [a, cc, b],
      ]) {
        const [p, q, r] = tri;
        const ux = q[0] - p[0];
        const uy = q[1] - p[1];
        const uz = q[2] - p[2];
        const vx = r[0] - p[0];
        const vy = r[1] - p[1];
        const vz = r[2] - p[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        // (los llevados al borde quedan en una raya: sin cara)
        if (Math.abs(ny) < 1e-5 && Math.hypot(nx, nz) < 1e-5) continue;
        const slope = Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny));
        const mu = (p[0] + q[0] + r[0]) / 3;
        const mv = (p[2] + q[2] + r[2]) / 3;
        const my = (p[1] + q[1] + r[1]) / 3;
        const cl = pick(mu, mv, my, slope);
        const j2 = 1 + (hash(mu, mv) - 0.5) * (Math.abs(mu) < 80 && Math.abs(mv) < 70 ? 0.1 : 0.04);
        for (const P of tri) {
          pos.push(P[0], P[1], P[2]);
          col.push(cl.r * j2, cl.g * j2, cl.b * j2);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------------- la roca de abajo ----------------
// El borde de la isla: puntos del contorno con su alto; abajo cuelga la roca
// arrancada, en punta hacia el medio, con el violeta del desgarro en las puntas.
export const RIM_N = 300;
export function rimPoints() {
  const pts = [];
  for (let i = 0; i < RIM_N; i++) {
    const a = (i / RIM_N) * Math.PI * 2;
    const R = rimR(a);
    const u = IC.u + Math.cos(a) * R;
    const v = IC.v + Math.sin(a) * R;
    const y = hLoc(u, v);
    pts.push({ a, R, u, v, y, river: y < WATER_Y - 0.2 });
  }
  return pts;
}
function buildRock(P, G) {
  const pts = rimPoints();
  const N = pts.length;
  // los anillos: [cuánto sale/entra (× radio), cuánto baja (m), cuánto se va al medio]
  const RINGS = [
    [-0.012, 0.6, 0],
    [0.0, 0.25, 0],
    [0.016, 3.2, 0],
    [0.01, 11, 0.05],
    [-0.01, 26, 0.13],
    [-0.02, 46, 0.27],
    [-0.03, 72, 0.45],
    [-0.04, 100, 0.66],
  ];
  const ring = [];
  const BOT = -140;
  for (let r = 0; r < RINGS.length; r++) {
    const [out, down, pull] = RINGS[r];
    const row = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const top = p.river ? Math.min(p.y, WATER_Y - 1) : p.y;
      const n = hash(i * 0.37 + r * 3.1, r * 1.7);
      const jag = r < 2 ? 0 : (n - 0.5) * (2 + r * 1.3);
      const R = p.R * (1 + out) * (1 - pull) + jag;
      // (el lecho del río: la roca sale de abajo del agua)
      const y = top - down - (r > 2 ? (hash(i, r * 7.3) - 0.5) * r * 2.2 : 0) - (r > 4 ? Math.max(0, Math.sin(p.a * 7 + 1.3)) * r * 4 : 0);
      row.push([IC.u + Math.cos(p.a) * R, y, IC.v + Math.sin(p.a) * R, r]);
    }
    ring.push(row);
  }
  const pos = [];
  const col = [];
  const cA = new THREE.Color(0x7a4a30);
  const cB = new THREE.Color(COL.roca);
  const cC = new THREE.Color(COL.hondo);
  const colAt = (q) => {
    const r = q[3];
    const k = r / (RINGS.length - 1);
    if (r <= 1) tmpC.set(0x5a4a34);
    else tmpC.copy(cA).lerp(cB, Math.min(1, k * 2.2)).lerp(cC, Math.max(0, k * 1.6 - 0.55));
    tmpC.multiplyScalar(0.82 + 0.3 * hash(q[0], q[2]));
    if (k > 0.8) tmpC.lerp(RIFT, (k - 0.8) * 2.2);
    return tmpC;
  };
  const tri = (a, b, c) => {
    for (const q of [a, b, c]) {
      pos.push(q[0], q[1], q[2]);
      const cc = colAt(q);
      col.push(cc.r, cc.g, cc.b);
    }
  };
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a = ring[r][i];
      const b = ring[r][(i + 1) % N];
      const c = ring[r + 1][i];
      const d = ring[r + 1][(i + 1) % N];
      // (de afuera: el orden de modo que la cara mire hacia afuera)
      tri(a, b, c);
      tri(b, d, c);
    }
  }
  // la punta de abajo
  const last = ring[RINGS.length - 1];
  const tip = [IC.u - 20, BOT, IC.v + 10, RINGS.length - 1];
  for (let i = 0; i < N; i++) tri(last[i], last[(i + 1) % N], tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  P.push(g);
  // las vetas del desgarro en la cara del borde: grietas violetas que brillan
  // (de lejos dibujan el contorno de la isla contra el vacío)
  if (G) {
    const gp = [];
    for (let i = 0; i < N; i++) {
      if (hash(i, 4.4) < 0.35) continue;
      const p = pts[i];
      const top = (p.river ? WATER_Y - 1 : p.y) - 1.2 - hash(i, 1.7) * 1.5;
      const len = 4 + hash(i, 2.3) * 9;
      let x = IC.u + Math.cos(p.a) * p.R * 1.018;
      let z = IC.v + Math.sin(p.a) * p.R * 1.018;
      let y = top;
      const tx = -Math.sin(p.a);
      const tz = Math.cos(p.a);
      const w = 0.12 + hash(i, 6.1) * 0.18;
      for (let s2 = 0; s2 < 4; s2++) {
        const dy = len / 4;
        const off = (hash(i * 3 + s2, 8.8) - 0.5) * 1.6;
        const x2 = x + tx * off + Math.cos(p.a) * dy * 0.04;
        const z2 = z + tz * off + Math.sin(p.a) * dy * 0.04;
        const y2 = y - dy;
        gp.push(x - tx * w, y, z - tz * w, x2 - tx * w, y2, z2 - tz * w, x + tx * w, y, z + tz * w);
        gp.push(x + tx * w, y, z + tz * w, x2 - tx * w, y2, z2 - tz * w, x2 + tx * w, y2, z2 + tz * w);
        x = x2;
        z = z2;
        y = y2;
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    const n = gp.length / 3;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) ca.set([0.62, 0.26, 1.0], i * 3);
    gg.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    G.push(gg);
  }
  // colmillos que cuelgan de la panza
  for (let k = 0; k < 26; k++) {
    const a = hash(k, 3.3) * Math.PI * 2;
    const R = rimR(a) * (0.35 + 0.45 * hash(k, 7.1));
    const u = IC.u + Math.cos(a) * R;
    const v = IC.v + Math.sin(a) * R;
    const len = 50 + 40 * hash(k, 1.9);
    const y0 = -25;
    const geo = paint(new THREE.ConeGeometry(4 + 6 * hash(k, 5.5), len, 5).rotateX(Math.PI), COL.rocaOsc, 0.2);
    // (la punta, con el violeta)
    const cl = geo.attributes.color;
    const ps = geo.attributes.position;
    for (let i = 0; i < ps.count; i++) if (ps.getY(i) < -len * 0.3) cl.setXYZ(i, RIFT.r * 0.8, RIFT.g * 0.8, RIFT.b * 0.8);
    P.push(at(geo, u, y0 - len / 2, v, hash(k, 2.2) * 6));
  }
  return pts;
}

// Pedazos sueltos que flotan alrededor (arrancados con la isla): roca con
// pasto arriba, alguno con un poste o un pedazo de pared.
function buildDebris(P) {
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + hash(k, 1.1) * 0.25;
    const R = rimR(a) * (1.06 + 0.22 * hash(k, 2.7));
    const u = IC.u + Math.cos(a) * R;
    const v = IC.v + Math.sin(a) * R;
    const s = 2 + 7 * hash(k, 4.4) * hash(k, 9.9);
    const y = -28 + 46 * hash(k, 6.6);
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const ps = rock.attributes.position;
    for (let i = 0; i < ps.count; i++) {
      const yy = ps.getY(i);
      const j = 0.75 + 0.5 * hash(ps.getX(i) * 9 + k, ps.getZ(i) * 7);
      // (arriba chato, abajo en punta)
      ps.setXYZ(i, ps.getX(i) * j, yy > 0 ? yy * 0.25 : yy * (1.4 + hash(k, i) * 0.8), ps.getZ(i) * j);
    }
    const g = paint(rock, COL.roca, 0.25);
    const cl = g.attributes.color;
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i += 3) {
      const my = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3;
      const cc = my > 0.15 ? tmpC.set(COL.pastoOsc) : my < -0.9 ? tmpC.set(COL.hondo).lerp(RIFT, 0.3) : tmpC.set(COL.roca);
      for (let q = 0; q < 3; q++) cl.setXYZ(i + q, cc.r, cc.g, cc.b);
    }
    P.push(at(g.scale(s, s, s), u, y, v, hash(k, 8.8) * 6));
    if (k % 7 === 2) P.push(at(paint(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5), COL.tronco), u + s * 0.2, y + s * 0.25 + 0.7, v));
    if (k % 9 === 4) P.push(at(box(-1.2, 1.2, 0, 2.0, -0.2, 0.2, COL.cal, 0.08), u, y + s * 0.25, v, a));
  }
}

// ---------------- el convento ----------------
// La iglesia (nave, contrafuertes, fachada con frontón, portón y óculo), el
// campanario, el claustro (cuatro alas con galerías alrededor del patio, el
// aljibe y los naranjos), las celdas, la huerta con su muro y la tapia del
// convento. G: los brillos (ventanas con luz).
function buildConvento(P, G) {
  const [cu0, cu1, cv0, cv1] = F.church;
  const y = Y0;
  const cm = (cu0 + cu1) / 2;
  P.push(box(cu0, cu1, y - 0.5, y + 0.7, cv0, cv1, COL.zocalo));
  P.push(box(cu0 + 0.15, cu1 - 0.15, y + 0.7, y + 8.4, cv0 + 0.15, cv1 - 0.15, COL.cal, 0.03));
  for (let v = cv0 + 2; v < cv1 - 1; v += 4.4) {
    P.push(box(cu1 - 0.15, cu1 + 0.55, y - 0.3, y + 6.8, v - 0.5, v + 0.5, COL.calSombra));
    P.push(box(cu0 - 0.55, cu0 + 0.15, y - 0.3, y + 6.8, v - 0.5, v + 0.5, COL.calSombra));
    P.push(box(cu1 - 0.05, cu1 + 0.08, y + 4.2, y + 6.4, v + 1.3, v + 2.4, COL.madera, 0.02));
    // (de las ventanas de atrás sale la luz de las velas)
    G.push(box(cu0 - 0.1, cu0 + 0.02, y + 4.3, y + 6.3, v + 1.4, v + 2.3, 0xffa23a, 0));
  }
  P.push(gable(cu0, cu1, cv0, cv1, y + 8.4, y + 12.6, COL.teja, false, 0.55));
  // la fachada (al norte): cornisa, el frontón triangular, el portón y el óculo
  P.push(box(cu0 - 0.2, cu1 + 0.2, y + 8.3, y + 9.0, cv1 - 0.05, cv1 + 0.35, COL.calSombra));
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([cu0 - 0.2, y + 9, cv1 + 0.3, cu1 + 0.2, y + 9, cv1 + 0.3, cm, y + 13.6, cv1 + 0.3, cu0 - 0.2, y + 9, cv1 - 0.05, cm, y + 13.6, cv1 - 0.05, cu1 + 0.2, y + 9, cv1 - 0.05], 3));
    P.push(paint(g, COL.cal, 0.03));
    // (los costados del frontón: una moldura a lo largo de cada lado)
    const dx = cm - (cu0 - 0.2);
    const len = Math.hypot(dx, 4.6);
    const rz = Math.atan2(dx, 4.6);
    P.push(at(box(-0.16, 0.16, -len / 2, len / 2, -0.22, 0.22, COL.calSombra), (cu0 - 0.2 + cm) / 2, y + 11.3, cv1 + 0.12, 0, 0, -rz));
    P.push(at(box(-0.16, 0.16, -len / 2, len / 2, -0.22, 0.22, COL.calSombra), (cu1 + 0.2 + cm) / 2, y + 11.3, cv1 + 0.12, 0, 0, rz));
  }
  // pilastras de la fachada
  for (const pu of [cu0 + 0.3, cm - 2.4, cm + 2.4, cu1 - 0.3]) P.push(box(pu - 0.35, pu + 0.35, y, y + 8.3, cv1 - 0.05, cv1 + 0.32, COL.calSombra));
  P.push(box(cm - 1.3, cm + 1.3, y, y + 4.2, cv1 - 0.05, cv1 + 0.12, COL.madera, 0.02));
  P.push(at(paint(new THREE.CylinderGeometry(1.3, 1.3, 0.24, 14, 1, false, Math.PI / 2, Math.PI), COL.zocalo), cm, y + 4.2, cv1 + 0.06, 0, Math.PI / 2));
  P.push(at(paint(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 12), COL.madera), cm, y + 6.6, cv1 + 0.06, 0, Math.PI / 2));
  G.push(at(paint(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 12), 0xffb04a), cm, y + 6.6, cv1 + 0.1, 0, Math.PI / 2));
  P.push(box(cm - 0.09, cm + 0.09, y + 13.6, y + 15.2, cv1 - 0.1, cv1 + 0.08, COL.hierro));
  P.push(box(cm - 0.5, cm + 0.5, y + 14.5, y + 14.7, cv1 - 0.1, cv1 + 0.08, COL.hierro));
  SOLID.push([cu0 - 0.6, cu1 + 0.6, y - 1, y + 13.6, cv0, cv1 + 0.4]);

  // el campanario
  const [tu0, tu1, tv0, tv1] = F.tower;
  const tm = (tu0 + tu1) / 2;
  const tvm = (tv0 + tv1) / 2;
  P.push(box(tu0 - 0.2, tu1 + 0.2, y - 0.5, y + 0.9, tv0 - 0.2, tv1 + 0.2, COL.zocalo));
  P.push(box(tu0, tu1, y + 0.9, y + 15, tv0, tv1, COL.cal, 0.03));
  // (las ventanitas de la escalera)
  for (const hy of [5, 9.5]) P.push(box(tu1 - 0.02, tu1 + 0.06, y + hy, y + hy + 1.0, tvm - 0.3, tvm + 0.3, COL.madera, 0.02));
  P.push(box(tu0 - 0.25, tu1 + 0.25, y + 15, y + 15.6, tv0 - 0.25, tv1 + 0.25, COL.calSombra));
  const pw = 0.9;
  for (const [a, b] of [
    [tu0, tv0],
    [tu1 - pw, tv0],
    [tu0, tv1 - pw],
    [tu1 - pw, tv1 - pw],
  ])
    P.push(box(a, a + pw, y + 15.6, y + 19.4, b, b + pw, COL.cal, 0.03));
  P.push(box(tu0 - 0.3, tu1 + 0.3, y + 19.4, y + 20.1, tv0 - 0.3, tv1 + 0.3, COL.calSombra));
  P.push(at(paint(new THREE.CylinderGeometry(0.42, 0.85, 1.2, 9), COL.bronce, 0.1), tm, y + 17.2, tvm));
  P.push(box(tm - 0.08, tm + 0.08, y + 17.8, y + 19.4, tvm - 0.08, tvm + 0.08, COL.hierro));
  P.push(at(paint(new THREE.ConeGeometry(4.6, 4.2, 4, 1), COL.teja, 0.08), tm, y + 22.2, tvm, Math.PI / 4));
  P.push(box(tm - 0.08, tm + 0.08, y + 24.2, y + 26.2, tvm - 0.08, tvm + 0.08, COL.hierro));
  P.push(box(tm - 0.55, tm + 0.55, y + 25.3, y + 25.5, tvm - 0.08, tvm + 0.08, COL.hierro));
  SOLID.push([tu0 - 0.3, tu1 + 0.3, y - 1, y + 20.1, tv0 - 0.3, tv1 + 0.3]);

  // las celdas: una tira con techo a dos aguas y la galería a la huerta
  const [ku0, ku1, kv0, kv1] = F.cloister;
  P.push(box(ku0, ku1 - 3, y - 0.4, y + 4.6, kv0, kv1, COL.cal, 0.04));
  P.push(gable(ku0, ku1 - 3, kv0, kv1, y + 4.6, y + 6.6, COL.teja, false, 0.4));
  P.push(box(ku1 - 3.2, ku1 + 0.4, y + 3.5, y + 3.8, kv0, kv1, COL.tejaOsc));
  for (let v = kv0 + 0.6; v < kv1; v += 2.6) P.push(box(ku1 - 0.2, ku1 + 0.2, y, y + 3.5, v - 0.2, v + 0.2, COL.cal, 0.04));
  for (let v = kv0 + 1.6; v < kv1 - 1; v += 3.2) P.push(box(ku1 - 3.06, ku1 - 2.94, y, y + 2.2, v - 0.55, v + 0.55, COL.madera, 0.02));
  SOLID.push([ku0, ku1 - 3, y - 1, y + 6.6, kv0, kv1]);

  // el claustro: cuatro alas de 5 m alrededor del patio, con galería de pilares adentro
  const [qu0, qu1, qv0, qv1] = F.quad;
  const D = 5;
  const wing = (u0, u1, v0, v1, alongU) => {
    P.push(box(u0, u1, y - 0.4, y + 4.4, v0, v1, COL.cal, 0.04));
    P.push(gable(u0, u1, v0, v1, y + 4.4, y + 6.4, COL.teja, alongU, 0.4));
  };
  wing(qu0, qu1, qv1 - D, qv1, true);
  wing(qu0, qu1, qv0, qv0 + D, true);
  wing(qu0, qu0 + D, qv0 + D, qv1 - D, false);
  wing(qu1 - D, qu1, qv0 + D, qv1 - D, false);
  // la galería: un alero bajo y pilares, en los cuatro lados del patio
  const [pu0, pu1, pv0, pv1] = F.patio;
  P.push(box(pu0 - 0.3, pu1 + 0.3, y + 3.2, y + 3.45, pv1 - 0.3, qv1 - D, COL.tejaOsc));
  P.push(box(pu0 - 0.3, pu1 + 0.3, y + 3.2, y + 3.45, qv0 + D, pv0 + 0.3, COL.tejaOsc));
  P.push(box(qu0 + D, pu0 + 0.3, y + 3.2, y + 3.45, pv0, pv1, COL.tejaOsc));
  P.push(box(pu1 - 0.3, qu1 - D, y + 3.2, y + 3.45, pv0, pv1, COL.tejaOsc));
  for (let u = pu0; u <= pu1 + 0.01; u += 2.66) {
    P.push(box(u - 0.2, u + 0.2, y, y + 3.2, pv0 - 0.2, pv0 + 0.2, COL.cal, 0.04), box(u - 0.2, u + 0.2, y, y + 3.2, pv1 - 0.2, pv1 + 0.2, COL.cal, 0.04));
  }
  for (let v = pv0 + 2.5; v < pv1 - 1; v += 2.5) {
    P.push(box(pu0 - 0.2, pu0 + 0.2, y, y + 3.2, v - 0.2, v + 0.2, COL.cal, 0.04), box(pu1 - 0.2, pu1 + 0.2, y, y + 3.2, v - 0.2, v + 0.2, COL.cal, 0.04));
  }
  // el aljibe del patio y los naranjos de las esquinas
  const am = [(pu0 + pu1) / 2, (pv0 + pv1) / 2];
  P.push(at(paint(new THREE.CylinderGeometry(0.9, 1.0, 0.95, 12), COL.cal, 0.06), am[0], y + 0.47, am[1]));
  P.push(box(am[0] - 0.95, am[0] - 0.8, y, y + 2.6, am[1] - 0.08, am[1] + 0.08, COL.hierro), box(am[0] + 0.8, am[0] + 0.95, y, y + 2.6, am[1] - 0.08, am[1] + 0.08, COL.hierro));
  P.push(at(paint(new THREE.TorusGeometry(0.9, 0.06, 4, 12, Math.PI), COL.hierro), am[0], y + 2.6, am[1]));
  for (const [u, v] of [
    [pu0 + 2.2, pv0 + 2.2],
    [pu1 - 2.2, pv0 + 2.2],
    [pu0 + 2.2, pv1 - 2.2],
    [pu1 - 2.2, pv1 - 2.2],
  ]) naranjo(P, u, v, y);
  // ventanas con luz en las alas (desde el campo se ven sobre el muro)
  for (let u = qu0 + 3; u < qu1 - 2; u += 5) G.push(box(u - 0.4, u + 0.4, y + 1.6, y + 2.8, qv1 + 0.0, qv1 + 0.06, 0xffa848, 0));
  // la tapia del convento (adobe) alrededor de todo, con su portón al camino
  const T = (u0, u1, v0, v1) => {
    P.push(box(u0, u1, y - 0.3, y + 2.3, v0, v1, COL.adobe, 0.08));
    P.push(box(u0 - 0.1, u1 + 0.1, y + 2.3, y + 2.5, v0 - 0.1, v1 + 0.1, COL.tejaOsc));
  };
  // (la del sur, 3 m más afuera: entre ella y el claustro pasa la caballería; ver abajo)
  const OT = globalThis.__mduOldSlTapia === true;
  T(-104, -103.4, OT ? -42 : -45, 17);
  T(-104, -103.4, 27, 30);
  if (OT) T(-104, -70, -42.6, -42);
  else T(-104, -70, -45.6, -45);
  T(-104, -66, 30, 30.6);
  T(-60, -53, 30, 30.6);
  // (2026-10-07, el usuario: "los granaderos salen de atrás de la pared del
  // convento y se quedan trabados corriendo contra la pared": la caballería
  // del sur sale de adentro de la tapia y la cruzaba por este tramo. Ahora es
  // el portón: dos pilares y abierto. __mduOldSlTapia: la pared de antes)
  if (OT) T(-70.6, -70, -42, -36);
  else {
    for (const vv of [-45.2, -36.0]) {
      P.push(box(-70.75, -69.85, y - 0.4, y + 2.9, vv - 0.45, vv + 0.45, COL.adobe, 0.06));
      P.push(at(paint(new THREE.ConeGeometry(0.62, 0.5, 4), COL.tejaOsc), -70.3, y + 3.15, vv, Math.PI / 4));
    }
  }
  // la huerta: el muro de ladrillo revocado con su caballete y los pilares de los portones
  const W = F.wallU;
  const [g0, g1] = F.gates;
  const seg = (v0, v1) => {
    P.push(box(W - 0.3, W + 0.3, y - 0.4, y + 2.25, v0, v1, COL.cal, 0.05));
    P.push(box(W - 0.38, W + 0.38, y + 2.25, y + 2.45, v0, v1, COL.tejaOsc));
    for (let v = v0 + 2.3; v < v1 - 1; v += 5.7) P.push(box(W + 0.29, W + 0.33, y + 0.5 + (v % 1.3), y + 1.4 + (v % 0.9), v, v + 1.1, COL.ladrillo, 0.1));
    SOLID.push([W - 0.32, W + 0.32, y - 1, y + 2.45, v0, v1]);
  };
  seg(-F.wallV, g0[0]);
  seg(g0[1], g1[0]);
  seg(g1[1], F.wallV);
  for (const gg of F.gates) {
    for (const vv of gg) {
      P.push(box(W - 0.45, W + 0.45, y - 0.4, y + 2.9, vv - 0.45, vv + 0.45, COL.calSombra, 0.04));
      P.push(at(paint(new THREE.ConeGeometry(0.5, 0.5, 4), COL.tejaOsc), W, y + 3.15, vv, Math.PI / 4));
    }
  }
  // el pozo de la huerta y los naranjos
  P.push(at(paint(new THREE.CylinderGeometry(0.62, 0.68, 0.9, 10), COL.ladrillo, 0.1), -48.7, y + 0.45, 4));
  P.push(box(-49.35, -49.2, y, y + 2.1, 3.9, 4.1, COL.madera), box(-48.2, -48.05, y, y + 2.1, 3.9, 4.1, COL.madera), box(-49.4, -48.0, y + 2.05, y + 2.2, 3.85, 4.15, COL.madera));
  for (const [u, v] of [
    [-50.5, -22],
    [-47.5, -16],
    [-50.8, 18],
    [-47.2, 25],
    [-51.2, -9.5],
  ])
    naranjo(P, u, v, y);
  for (let v = -29; v < 29; v += 1.6) {
    if (Math.abs(v - 4) < 2 || Math.abs(v + 4) < 1.2) continue;
    P.push(box(-51.6, -45.4, y - 0.1, y + 0.12, v - 0.3, v + 0.3, COL.tierra, 0.12));
  }
}
function naranjo(P, u, v, y) {
  P.push(at(paint(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 5), COL.tronco), u, y + 0.7, v));
  P.push(at(paint(new THREE.IcosahedronGeometry(1.0, 0), COL.hoja, 0.15), u, y + 1.9, v, u));
  for (let k = 0; k < 4; k++) P.push(at(paint(new THREE.OctahedronGeometry(0.1, 0), 0xe08a1a), u + Math.cos(k * 1.7 + u) * 0.8, y + 1.7 + (k % 2) * 0.4, v + Math.sin(k * 1.7 + u) * 0.8));
}

// Un ombú: el tronco ancho con raíces al aire y la copa enorme.
function ombu(P, u, v, r) {
  const y = hLoc(u, v);
  P.push(at(paint(new THREE.CylinderGeometry(r * 0.75, r * 1.25, 3.6, 8), COL.tronco, 0.1), u, y + 1.6, v));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + u;
    P.push(at(paint(new THREE.ConeGeometry(r * 0.45, 2.2, 5), COL.tronco, 0.1), u + Math.cos(a) * r * 1.1, y + 0.25, v + Math.sin(a) * r * 1.1, 0, Math.cos(a) * 1.2, -Math.sin(a) * 1.2));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + v;
    P.push(at(paint(new THREE.CylinderGeometry(0.28, 0.42, 4.2, 6), COL.tronco, 0.1), u + Math.cos(a) * 1.4, y + 4.4, v + Math.sin(a) * 1.4, 0, Math.sin(a) * 0.7, -Math.cos(a) * 0.7));
  }
  const cr = 4.2 + r * 1.6;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + u * 0.3;
    const d = k === 0 ? 0 : cr * 0.62;
    const s = k === 0 ? cr * 0.8 : cr * (0.48 + 0.1 * Math.sin(k * 2.3));
    P.push(at(paint(new THREE.IcosahedronGeometry(s, 1), k % 3 ? COL.hoja : COL.hojaOsc, 0.14), u + Math.cos(a) * d, y + 6.8 + Math.sin(k * 1.9) * 0.9, v + Math.sin(a) * d, a));
  }
}
// Un árbol chico (tala, sauce o uno quemado): tronco torcido y copa de bochas.
function arbol(P, u, v, s = 1, hex = COL.hoja, burnt = false) {
  const y = hLoc(u, v);
  const lean = (hash(u, v) - 0.5) * 0.3;
  P.push(at(paint(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 3.2 * s, 6), burnt ? COL.quemado : COL.tronco, 0.12), u, y + 1.5 * s, v, 0, lean, lean * 0.5));
  if (burnt) {
    for (let k = 0; k < 3; k++) P.push(at(paint(new THREE.CylinderGeometry(0.05 * s, 0.1 * s, 1.8 * s, 4), COL.quemado), u + Math.cos(k * 2.1) * 0.5 * s, y + 3.4 * s, v + Math.sin(k * 2.1) * 0.5 * s, 0, Math.cos(k * 2.1) * 0.8, Math.sin(k * 2.1) * 0.8));
    return;
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + u;
    const d = k ? 1.1 * s : 0;
    P.push(at(paint(new THREE.IcosahedronGeometry((k ? 1.2 : 1.6) * s, 0), hex, 0.16), u + Math.cos(a) * d, y + (3.4 + (k ? 0 : 0.6)) * s, v + Math.sin(a) * d, a));
  }
}

// Una carreta de bueyes: las dos ruedas enormes, la caja, el toldo de cuero y
// el pértigo. state: 0 parada, 1 volcada de costado, 2 ardiendo (quemada).
function carreta(P, u, v, ry, state) {
  const y = hLoc(u, v);
  const parts = [];
  const wood = state === 2 ? COL.quemado : COL.maderaClara;
  for (const s of [-1, 1]) {
    parts.push(at(paint(new THREE.TorusGeometry(1.15, 0.09, 4, 14), wood, 0.1), 0, 1.15, s * 0.95, 0, 0, 0));
    parts.push(at(paint(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 8), COL.madera), 0, 1.15, s * 0.95, 0, Math.PI / 2));
    for (let k = 0; k < 6; k++) parts.push(at(box(-0.04, 0.04, -1.1, 1.1, -0.04, 0.04, wood, 0.05), 0, 1.15, s * 0.95, 0, 0, (k / 6) * Math.PI));
  }
  // (la caja va a lo largo de x del carro; las ruedas a los costados en z)
  parts.push(at(paint(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), COL.madera), 0, 1.15, 0, 0, Math.PI / 2));
  parts.push(box(-1.9, 1.9, 1.3, 1.75, -0.8, 0.8, wood, 0.08));
  for (const s of [-1, 1]) parts.push(box(-1.9, 1.9, 1.75, 2.25, s * 0.78 - 0.04, s * 0.78 + 0.04, wood, 0.08));
  if (state !== 2) {
    // el toldo: medio cilindro de cuero
    parts.push(at(paint(new THREE.CylinderGeometry(0.85, 0.85, 3.4, 9, 1, true, -Math.PI / 2, Math.PI), COL.cuero, 0.12), 0, 2.05, 0, 0, 0, Math.PI / 2));
  } else {
    // (quemada: los arcos del toldo pelados)
    for (let k = -1; k <= 1; k++) parts.push(at(paint(new THREE.TorusGeometry(0.85, 0.05, 3, 8, Math.PI), COL.quemado), k * 1.2, 2.05, 0, Math.PI / 2));
  }
  parts.push(at(paint(new THREE.CylinderGeometry(0.06, 0.09, 4.2, 5), COL.madera), 3.6, 0.9, 0, 0, 0, Math.PI / 2 - 0.22));
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const M = state === 1 ? frame(u, y + 0.85, v, ry, 0, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.12)).multiply(new THREE.Matrix4().makeTranslation(0, -1.15, 0)) : frame(u, y, v, ry);
  P.push(put(geo, M));
}

// Un cañón de campaña de los realistas, con sus cestones, barriles y balas.
function canon(P, u, v, ry) {
  const y = hLoc(u, v);
  const M = frame(u, y, v, ry);
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(-1.1, 0.7, 0.35, 0.95, s * 0.28 - 0.07, s * 0.28 + 0.07, 0x5a6a4a, 0.08));
    parts.push(at(paint(new THREE.TorusGeometry(0.62, 0.07, 4, 12), COL.maderaClara, 0.1), 0.2, 0.62, s * 0.52));
    for (let k = 0; k < 4; k++) parts.push(at(box(-0.03, 0.03, -0.58, 0.58, -0.03, 0.03, COL.maderaClara), 0.2, 0.62, s * 0.52, 0, 0, (k / 4) * Math.PI));
  }
  parts.push(at(paint(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), COL.hierro), 0.2, 0.62, 0, 0, Math.PI / 2));
  parts.push(box(-2.0, -0.9, 0.2, 0.38, -0.1, 0.1, 0x5a6a4a));
  // el caño, apuntando a +x (al convento), un poco levantado
  parts.push(at(paint(new THREE.CylinderGeometry(0.11, 0.17, 1.9, 10), COL.bronce, 0.06), 0.85, 1.02, 0, 0, 0, -Math.PI / 2 + 0.08));
  parts.push(at(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), COL.bronce), 1.8, 1.09, 0, 0, 0, -Math.PI / 2 + 0.08));
  // los cestones (adelante, en arco) y los barriles de pólvora
  for (const s of [-1.3, -0.45, 0.45, 1.3]) parts.push(at(paint(new THREE.CylinderGeometry(0.5, 0.48, 1.1, 8), COL.mimbre, 0.15), 1.9 + Math.abs(s) * -0.25, 0.55, s));
  for (const [bx, bz] of [
    [-1.6, 0.9],
    [-1.3, 1.5],
  ])
    parts.push(at(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8), COL.madera, 0.08), bx, 0.35, bz));
  for (let k = 0; k < 6; k++) parts.push(at(paint(new THREE.IcosahedronGeometry(0.1, 0), COL.hierro), -1.5 + (k % 3) * 0.2, 0.1 + Math.floor(k / 3) * 0.16, -1.0 + (k % 2) * 0.1));
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  P.push(put(geo, M));
}

// El pozo de balde del campo: brocal de ladrillo, dos postes y el travesaño con la roldana.
function pozo(P) {
  const [u, v] = F.pozo;
  const y = hLoc(u, v);
  P.push(at(paint(new THREE.CylinderGeometry(0.85, 0.92, 0.9, 12), COL.ladrillo, 0.12), u, y + 0.45, v));
  P.push(box(u - 0.95, u - 0.8, y, y + 2.4, v - 0.08, v + 0.08, COL.madera), box(u + 0.8, u + 0.95, y, y + 2.4, v - 0.08, v + 0.08, COL.madera));
  P.push(box(u - 1.0, u + 1.0, y + 2.35, y + 2.5, v - 0.09, v + 0.09, COL.madera));
  P.push(at(paint(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), COL.hierro), u, y + 2.2, v, 0, Math.PI / 2));
  P.push(at(paint(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 8), COL.madera), u + 0.5, y + 1.0, v + 0.7));
}

// Un bergantín de la escuadra realista, fondeado: casco con la franja y las
// portas con sus cañones, dos palos con las velas (bajas y gavias desplegadas,
// juanetes aferrados), los obenques, el bauprés con el foque y el farol de
// popa (en los brillos). Devuelve dónde van sus banderas.
function barco(P, G, u, v, ry, L = 22) {
  const wy = WATER_Y;
  const M = frame(u, wy, v, ry);
  const parts = [];
  const glow = [];
  const hull = new THREE.BoxGeometry(5.4, 3.6, L, 2, 2, 8);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / (L / 2);
    const yy = p.getY(i);
    const k = z > 0 ? 1 - z * z * 0.85 : 1 - z * z * 0.25;
    p.setX(i, p.getX(i) * k * (yy < 0 ? 0.62 : 1));
    if (yy > 0) p.setY(i, yy + Math.abs(z) * 0.6);
  }
  parts.push(at(paint(hull, COL.casco, 0.1), 0, 0.9, 0));
  // la franja ocre con las portas
  parts.push(box(-2.75, 2.75, 1.85, 2.35, -L / 2 + 2, L / 2 - 4, COL.amarillo, 0.06));
  for (let z = -L / 2 + 3.5; z < L / 2 - 4.5; z += 2.6) {
    for (const s of [-1, 1]) {
      parts.push(box(s * 2.72 - 0.06, s * 2.72 + 0.06, 1.9, 2.3, z - 0.3, z + 0.3, COL.cascoOsc, 0.02));
      parts.push(at(paint(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), COL.hierro), s * 3.0, 2.1, z, 0, 0, Math.PI / 2));
    }
  }
  // la cubierta y el castillo de popa
  parts.push(box(-2.4, 2.4, 2.5, 2.7, -L / 2 + 1, L / 2 - 3, 0x6a5038, 0.05));
  parts.push(box(-2.4, 2.4, 2.4, 3.9, -L / 2 + 0.6, -L / 2 + 5, COL.cascoOsc));
  parts.push(box(-2.5, 2.5, 3.9, 4.15, -L / 2 + 0.4, -L / 2 + 5.2, COL.amarillo));
  // (el farol de popa y las ventanas de la cámara del capitán)
  glow.push(box(-0.25, 0.25, 4.3, 4.9, -L / 2 + 0.2, -L / 2 + 0.7, 0xffb050, 0));
  for (const s of [-1.4, -0.45, 0.45, 1.4]) glow.push(box(s - 0.25, s + 0.25, 2.9, 3.5, -L / 2 + 0.55, -L / 2 + 0.6, 0xff9a40, 0));
  const flags = [];
  // los palos, las vergas y las velas
  for (const [z, h, k] of [
    [L * 0.18, 18, 0],
    [-L * 0.12, 20, 1],
  ]) {
    parts.push(at(paint(new THREE.CylinderGeometry(0.16, 0.28, h, 6), COL.madera), 0, 2 + h / 2, z));
    // la cofa
    parts.push(box(-1.1, 1.1, 2 + h * 0.55, 2 + h * 0.55 + 0.2, z - 0.8, z + 0.8, COL.madera));
    const yards = [
      [0.36, 8.2, 'set'],
      [0.62, 6.6, 'set'],
      [0.86, 4.6, 'furl'],
    ];
    let below = 2.7;
    for (const [hy, w, how] of yards) {
      const ym = 2 + h * hy;
      parts.push(at(paint(new THREE.CylinderGeometry(0.09, 0.09, w, 5), COL.madera), 0, ym, z, 0, 0, Math.PI / 2));
      if (how === 'set') {
        // la vela desplegada: cuelga de la verga hasta la de abajo, inflada hacia proa
        const sh = Math.min(ym - below - 0.2, w * 0.75);
        const sail = new THREE.PlaneGeometry(w * 0.94, sh, 4, 4);
        const sp = sail.attributes.position;
        for (let i = 0; i < sp.count; i++) {
          const x = sp.getX(i) / (w * 0.47);
          const yy = sp.getY(i) / (sh / 2);
          sp.setZ(i, (1 - x * x) * (1 - 0.6 * yy * yy) * 0.9 + 0.1);
          // (abajo más angosta)
          sp.setX(i, sp.getX(i) * (1 - 0.08 * (1 - yy)));
        }
        const sc = paint(sail, (k + hy * 10) % 2 > 1 ? COL.velaSucia : COL.vela, 0.06);
        parts.push(at(sc, 0, ym - sh / 2 - 0.15, z + 0.2));
        // (y del otro lado: la vela se ve de los dos)
        const back = sc.clone();
        const bp = back.attributes.position;
        for (let i = 0; i < bp.count; i += 3) {
          const ax = bp.getX(i);
          const ay = bp.getY(i);
          const az = bp.getZ(i);
          bp.setXYZ(i, bp.getX(i + 1), bp.getY(i + 1), bp.getZ(i + 1));
          bp.setXYZ(i + 1, ax, ay, az);
        }
        parts.push(back);
      } else {
        parts.push(at(paint(new THREE.CylinderGeometry(0.26, 0.26, w * 0.9, 6), COL.vela, 0.08), 0, ym - 0.3, z, 0, 0, Math.PI / 2));
      }
      below = ym;
    }
    // los obenques: de la cofa a la borda, tres por lado
    const top = new THREE.Vector3(0, 2 + h * 0.55, z);
    for (const s of [-1, 1]) {
      for (const dz of [-1.2, 0, 1.2]) {
        const bot = new THREE.Vector3(s * 2.6, 2.4, z + dz - 0.8);
        const len = top.distanceTo(bot);
        const line = new THREE.CylinderGeometry(0.025, 0.025, len, 3);
        const mid = top.clone().add(bot).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
        parts.push(paint(line, 0x2a221a).applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))));
      }
    }
    flags.push([0, 2 + h + 0.2, z]);
  }
  // el bauprés y el foque
  parts.push(at(paint(new THREE.CylinderGeometry(0.12, 0.18, 8, 5), COL.madera), 0, 3.6, L / 2 + 2.2, 0, -1.2));
  {
    const g = new THREE.BufferGeometry();
    const fz = L * 0.18;
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 2 + 18 * 0.62, fz, 0, 4.6, L / 2 + 5.4, 0, 3.0, fz + 1.2, 0, 2 + 18 * 0.62, fz, 0, 3.0, fz + 1.2, 0, 4.6, L / 2 + 5.4], 3));
    parts.push(paint(g, COL.vela, 0.05));
  }
  // la bandera de popa (en el mástil de la popa)
  parts.push(at(paint(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 4), COL.madera), 0, 5.2, -L / 2 + 0.6, 0, 0.35));
  flags.push([0, 6.7, -L / 2 - 0.1]);
  const geo = mergeGeometries(parts);
  for (const q of parts) q.dispose();
  P.push(put(geo, M));
  if (glow.length) {
    const gg = mergeGeometries(glow);
    for (const q of glow) q.dispose();
    G.push(put(gg, M));
  }
  return flags.map((f) => new THREE.Vector3(...f).applyMatrix4(M));
}

// La otra orilla: sauces y ceibos en matas, y un rancho que arde.
function orilla(P) {
  for (let k = 0; k < 70; k++) {
    const v = -150 + (k / 70) * 300 + (hash(k, 1.3) - 0.5) * 6;
    const u = farBank(v) + 4 + hash(k, 2.9) * 55;
    if (rimK(u, v) > 0.94) continue;
    arbol(P, u, v, 0.9 + hash(k, 3.7) * 0.9, k % 3 ? COL.sauce : COL.hojaOsc);
  }
  // el rancho: paredes de barro y techo de paja (arde: el fuego va en sanlorenzoVivo)
  const ru = farBank(38) + 14;
  const ry = hLoc(ru, 38);
  P.push(box(ru - 3, ru + 3, ry, ry + 2.4, 34, 42, COL.adobe, 0.1));
  P.push(gable(ru - 3, ru + 3, 34, 42, ry + 2.4, ry + 4.4, 0x6a5430, false, 0.5));
}

// La pampa del oeste y los costados: talas sueltos, un corral, ranchos lejanos.
function pampa(P) {
  for (let k = 0; k < 46; k++) {
    const a = hash(k, 5.1) * Math.PI * 2;
    const R = 70 + hash(k, 6.2) * 90;
    const u = -5 + Math.cos(a) * R;
    const v = Math.sin(a) * R;
    if (u > edgeU(v) - 8 || rimK(u, v) > 0.9) continue;
    // (no en el convento ni en la huerta)
    if (u > -110 && u < -40 && Math.abs(v) < 48) continue;
    arbol(P, u, v, 0.8 + hash(k, 7.7) * 0.7, k % 4 ? COL.hoja : COL.hojaOsc);
  }
  // el palenque de los costados del campo (de punta a punta): postes y dos travesaños
  for (const s of [-1, 1]) {
    const v = s * FENCE_V;
    let prev = null;
    for (let u = -43; u < edgeU(v) - 1.5; u += 3.4) {
      const y = hLoc(u, v);
      P.push(at(paint(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 5), COL.tronco), u, y + 0.65, v));
      if (prev) {
        const len = Math.hypot(u - prev[0], y - prev[1]);
        const pitch = Math.atan2(y - prev[1], u - prev[0]);
        for (const hy of [0.55, 1.15]) P.push(at(box(-len / 2, len / 2, -0.04, 0.04, -0.04, 0.04, COL.tronco, 0.1), (u + prev[0]) / 2, (y + prev[1]) / 2 + hy, v, 0, 0, pitch));
      }
      prev = [u, y];
    }
  }
  // un corral de palo a pique al norte del convento
  const cu = -80;
  const cv = 60;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const u = cu + Math.cos(a) * 9;
    const v = cv + Math.sin(a) * 7;
    P.push(at(paint(new THREE.CylinderGeometry(0.1, 0.12, 1.7, 5), COL.tronco, 0.15), u, hLoc(u, v) + 0.8, v, 0, (hash(k, 1) - 0.5) * 0.2));
  }
}

// El pasto: matas de hojas finas, instanciadas sobre el campo.
function buildGrass(N = 9000) {
  const blade = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + (k % 2) * 0.3;
    const g = new THREE.BufferGeometry();
    const w = 0.03 + (k % 3) * 0.008;
    const h = 0.22 + (k % 4) * 0.08;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.0, h, 0.0, w, 0, 0, -w, 0, 0, 0.0, h, 0.0], 3));
    const tip = k % 2 ? [0.3, 0.4, 0.11] : [0.22, 0.32, 0.08];
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.09, 0.15, 0.035, 0.09, 0.15, 0.035, ...tip, 0.09, 0.15, 0.035, 0.09, 0.15, 0.035, ...tip], 3));
    g.rotateX(0.25 + (k % 3) * 0.12);
    g.rotateY(a);
    blade.push(g);
  }
  const geo = mergeGeometries(blade);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; n < N && i < N * 4; i++) {
    // (en el campo apretado; afuera, cada vez más ralo hasta 80 m)
    const far = i % 3 === 0;
    const u = far ? -70 + Math.random() * 120 : -42 + Math.random() * 86;
    const v = far ? -80 + Math.random() * 160 : -45 + Math.random() * 90;
    if (u > edgeU(v) - 1.5) continue;
    if (far && (Math.abs(v) < 45 && u > -44 ? true : Math.random() > 1 - smooth(45, 80, Math.max(Math.abs(v), -u - 20)) ? true : false)) continue;
    if (u < -44 && u > -106 && Math.abs(v) < 44) continue;
    let path = false;
    for (const gg of F.gates) if (u < 30 && Math.abs(v - ((gg[0] + gg[1]) / 2 + 3 * Math.sin(u * 0.05 + (gg[0] + gg[1]) / 2))) < 1.6) path = true;
    if (path) continue;
    // (no en lo quemado)
    if (F.fires.some(([fu, fv, fs]) => Math.hypot(u - fu, v - fv) < 3 * fs + 0.8)) continue;
    if (bajK(v) > 0.2 && u > edgeU(v) - RAMP_U0 - 1) continue;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.3);
    const k = 0.6 + Math.random() * 1.1;
    s.set(k, k * (0.7 + Math.random() * 0.9), k);
    p.set(u, hLoc(u, v) - 0.02, v);
    im.setMatrixAt(n++, m.compose(p, q, s));
  }
  im.count = n;
  im.receiveShadow = true;
  im.name = 'slPasto';
  return im;
}

// Los cardos: la roseta de hojas con espinas, el tallo y la flor violeta.
function buildCardos() {
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push(at(paint(new THREE.ConeGeometry(0.09, 0.55, 3), 0x8a9a5a), Math.cos(k) * 0.22, 0.08, Math.sin(k) * 0.22, -k, Math.PI / 2 - 0.3, 0));
  parts.push(at(paint(new THREE.CylinderGeometry(0.025, 0.035, 0.75, 4), 0x6a7a42), 0, 0.37, 0));
  parts.push(at(paint(new THREE.OctahedronGeometry(0.11, 0), 0x6a7a3a), 0, 0.78, 0));
  parts.push(at(paint(new THREE.ConeGeometry(0.1, 0.16, 7), 0x8a3aa8), 0, 0.92, 0, 0, Math.PI));
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const N = 170;
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; n < N && i < N * 6; i++) {
    const c = Math.floor(Math.random() * 9);
    const cu = -30 + ((c * 37) % 70);
    const cv = -36 + ((c * 53) % 72);
    const u = cu + (Math.random() - 0.5) * 9;
    const v = cv + (Math.random() - 0.5) * 9;
    if (u < -42 || u > edgeU(v) - 2) continue;
    if (CYL.some(([a, b, r]) => Math.hypot(u - a, v - b) < r + 0.4)) continue;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.3);
    const k = 0.8 + Math.random() * 0.7;
    s.set(k, k, k);
    p.set(u, hLoc(u, v) - 0.03, v);
    im.setMatrixAt(n++, m.compose(p, q, s));
  }
  im.count = n;
  im.castShadow = true;
  im.receiveShadow = true;
  im.name = 'slCardos';
  return im;
}

// El agua del Paraná: una grilla gruesa sobre el río, recortada por el borde.
// Corre hacia el sur (-v) con ondas en el sombreador (sin texturas).
function buildWater() {
  const pos = [];
  const step = 8;
  for (let u = 36; u < 320; u += step) {
    for (let v = -184; v < 184; v += step) {
      const q = [
        [u, v],
        [u + step, v],
        [u + step, v + step],
        [u, v + step],
      ].map(([a, b]) => {
        const du = a - IC.u;
        const dv = b - IC.v;
        const d = Math.hypot(du, dv);
        const R = rimR(Math.atan2(dv, du));
        return d > R ? [IC.u + (du / d) * R, IC.v + (dv / d) * R, 0] : [a, b, 1];
      });
      if (!q.some((x) => x[2])) continue;
      // (solo donde hay río: el piso de algún rincón abajo del agua)
      if (!q.some(([a, b]) => hLoc(a, b) < WATER_Y + 0.4)) continue;
      const [a, b, c, d] = q;
      pos.push(a[0], WATER_Y, a[1], d[0], WATER_Y, d[1], c[0], WATER_Y, c[1], a[0], WATER_Y, a[1], c[0], WATER_Y, c[1], b[0], WATER_Y, b[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Arma todo el campo. Devuelve { root, stat, glow, ground, water, rim, flagSpots, update(dt, t), dispose() }.
export function buildCampo({ grass: nGrass = 9000 } = {}) {
  SOLID.length = 0;
  const root = new THREE.Group();
  root.name = 'sanLorenzo';
  root.position.set(SL0.x, 0, SL0.z);
  root.rotation.y = YAW;
  // (el suelo va aparte: lleva la textura de pasto de la granja encima del color)
  const gg = buildGround();
  const uv = [];
  const pa = gg.attributes.position;
  for (let i = 0; i < pa.count; i++) uv.push(pa.getX(i) * 0.22, pa.getZ(i) * 0.22);
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
  ground.name = 'slSuelo';
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false;
  root.add(ground);
  const P = [];
  const G = [];
  buildConvento(P, G);
  for (const [u, v, r] of F.ombues) ombu(P, u, v, r);
  for (const [u, v] of F.talas) arbol(P, u, v, 0.75, COL.hoja);
  arbol(P, 12.5, -42, 0.85, 0, true);
  for (const [u, v, ry, st] of F.carts) carreta(P, u, v, ry, st);
  for (const [u, v, ry] of F.cannons) canon(P, u, v, ry);
  pozo(P);
  const flagSpots = { ship: [], R: [], P: [] };
  for (const [u, v, ry, L] of F.ships) flagSpots.ship.push(...barco(P, G, u, v, ry, L));
  // los mástiles de las banderas del campo (el paño va en sanlorenzoVivo)
  for (const [list, key] of [
    [F.flagsR, 'R'],
    [F.flagsP, 'P'],
  ]) {
    for (const [u, v, h] of list) {
      const y = u === F.wallU ? Y0 + 2.9 : hLoc(u, v);
      P.push(at(paint(new THREE.CylinderGeometry(0.035, 0.045, h, 5), COL.madera), u, y + h / 2, v));
      flagSpots[key].push(new THREE.Vector3(u, y + h - 0.1, v));
    }
  }
  // la del campanario
  {
    const [tu0, tu1, tv0, tv1] = F.tower;
    flagSpots.P.push(new THREE.Vector3((tu0 + tu1) / 2 + 0.4, Y0 + 25.6, (tv0 + tv1) / 2));
  }
  orilla(P);
  pampa(P);
  const rim = buildRock(P, G);
  buildDebris(P);
  for (const g of P) if (!g.attributes.color) paint(g, 0xff00ff);
  const geo = mergeGeometries(P);
  for (const g of P) g.dispose();
  geo.computeVertexNormals();
  const mat = slStaticLook(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, flatShading: true }), Y0);
  const stat = new THREE.Mesh(geo, mat);
  stat.name = 'slEstatico';
  stat.castShadow = true;
  stat.receiveShadow = true;
  stat.matrixAutoUpdate = false;
  root.add(stat);
  // los brillos (ventanas con velas, faroles de los barcos)
  const ggeo = mergeGeometries(G);
  for (const g of G) g.dispose();
  const gmat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  gmat.color.setScalar(1.6);
  const glow = new THREE.Mesh(ggeo, gmat);
  glow.name = 'slBrillos';
  glow.matrixAutoUpdate = false;
  root.add(glow);
  // el agua del Paraná
  const wg = buildWater();
  const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x1f2a32, roughness: 0.72, metalness: 0.05 }));
  water.name = 'slAgua';
  water.receiveShadow = true;
  water.matrixAutoUpdate = false;
  root.add(water);
  const grass = buildGrass(nGrass);
  const cardos = buildCardos();
  root.add(grass, cardos);
  root.updateMatrixWorld(true);
  for (const o of [stat, glow, water, grass, cardos, ground]) o.updateMatrix();
  return {
    root,
    stat,
    glow,
    ground,
    water,
    grass,
    cardos,
    rim,
    flagSpots,
    tris: geo.attributes.position.count / 3,
    update() {},
    dispose() {
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
      ggeo.dispose();
      gmat.dispose();
      water.geometry.dispose();
      water.material.dispose();
      grass.geometry.dispose();
      grass.material.dispose();
      cardos.geometry.dispose();
      cardos.material.dispose();
      gg.dispose();
      ground.material.dispose();
    },
  };
}
