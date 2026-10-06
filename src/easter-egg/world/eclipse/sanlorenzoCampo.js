import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ECLIPSE_DIR } from '../eclipseSky';
import { MAP_W, MAP_H } from '../../config/maps/eclipse';

// El campo de San Lorenzo, 3 de febrero de 1813 (Eclipse Matero: la pelea
// final, entities/eclipse/SanLorenzo.js). De oeste a este: el Convento de San
// Carlos (la iglesia con su campanario, el claustro y la huerta con su muro),
// el campo (pasto corto, dos lomadas, ombúes y cardos), la barranca colorada
// con sus dos bajadas (por ahí suben los realistas) y el Paraná con la
// escuadra fondeada. Atrás de todo, la pampa con lomas bajas y las islas del
// río en la niebla.
//
// Está lejos de las islas (afuera de la grilla del mapa) y tiene su propio
// marco: u va hacia el río, que mira para el lado del eclipse del cielo
// (world/eclipseSky ECLIPSE_DIR: el sol asoma sobre el agua), y v de costado
// (+v, el norte del campo). toWorld / toLocal pasan de uno a otro.
//
// Barato: todo lo quieto es UNA malla fundida (colores por vértice, caras
// planas como el resto del juego); el pasto y los cardos, dos instanciadas;
// el agua, una. El piso (hLoc), los choques (collide) y los tiros contra el
// piso y los edificios (raycast) son cuentas, no mallas.

// dónde está (el medio del campo, a la altura del piso): 200 m al este de la
// grilla de las islas (el layout cambia de tamaño: se lee del config)
export const SL0 = { x: (MAP_W || 275) + 200, y: 14, z: (MAP_H || 312) * 0.5 };
const Y0 = SL0.y;
export const WATER_Y = 1.0;
// la playa al pie de la barranca
const BEACH_Y = 1.45;
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
  // la iglesia, el campanario y el claustro: [u0, u1, v0, v1]
  church: [-64, -53, -16, 8],
  tower: [-61.5, -55.5, 8, 14],
  cloister: [-68, -52.5, -36, -16],
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
  // las lomadas: [u, v, radio, alto]
  lomas: [
    [4, 13, 9.5, 1.35],
    [19, -12, 8.5, 1.1],
    [-24, 4, 7, 0.55],
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

// el borde de la barranca (irregular)
export function edgeU(v) {
  return 45 + 1.3 * Math.sin(v * 0.19 + 0.6) + 0.8 * Math.sin(v * 0.071 + 2.1);
}
// cuánto de bajada hay en v (1 en el medio de una, 0 lejos)
export function bajK(v) {
  let k = 0;
  for (const b of F.bajadas) k = Math.max(k, 1 - smooth(F.bajW, F.bajW + 2.8, Math.abs(v - b)));
  return k;
}

// La altura del piso en (u, v) del campo.
export function hLoc(u, v) {
  const e = edgeU(v);
  // la pampa: apenas ondulada; lejos, lomas bajas (no del lado del río)
  const r = Math.hypot(u, v);
  let top = Y0 + 0.16 * Math.sin(u * 0.13 + 1.3) * Math.cos(v * 0.11) * smooth(-46, -36, u);
  const far = smooth(95, 230, r) * (1 - smooth(e - 40, e - 15, u));
  if (far > 0) top += far * (5.5 + 3 * Math.sin(Math.atan2(v, u) * 7 + 1.1) + 1.5 * Math.sin(r * 0.05));
  for (const [lu, lv, lr, lh] of F.lomas) {
    const d = Math.hypot(u - lu, v - lv);
    if (d < lr) {
      const k = 1 - d / lr;
      top += lh * k * k * (3 - 2 * k);
    }
  }
  // la barranca: el borde se cae a pique a la playa y la playa entra al agua
  let low = Y0 - (Y0 - BEACH_Y) * smooth(e - 0.6, e + 5.6, u);
  // (la cara de la barranca, con escalones de tierra)
  low += 0.5 * Math.sin(v * 0.9 + u * 0.4) * smooth(e - 0.6, e + 1.5, u) * (1 - smooth(e + 3.5, e + 5.6, u));
  if (u > e + 10.5) low = Math.max(-2.6, BEACH_Y - (u - e - 10.5) * 0.42);
  let y = Math.min(top, low);
  // las bajadas: una rampa de tierra que baja del campo a la playa
  const k = bajK(v);
  if (k > 0) {
    const ramp = clamp(Y0 - (u - (e - 8)) * 0.62, BEACH_Y, Y0);
    const yr = u > e + 10.5 ? low : Math.min(top, ramp);
    y = y + (yr - y) * k;
  }
  return y;
}

// ---------------- lo que se camina ----------------
// Empuja (u, v) adentro de lo caminable, fuera del muro, los edificios y los
// troncos. o.u / o.v se corrigen; r: el radio del cuerpo.
const WALLS = [];
{
  const [g0, g1] = F.gates;
  const W = F.wallU;
  // el muro, en tres tramos (los portones abiertos)
  WALLS.push([W - 0.32, W + 0.32, -F.wallV, g0[0]], [W - 0.32, W + 0.32, g0[1], g1[0]], [W - 0.32, W + 0.32, g1[1], F.wallV]);
  // los pilares de los portones (un poco más anchos)
  for (const gg of F.gates) for (const vv of gg) WALLS.push([W - 0.45, W + 0.45, vv - 0.45, vv + 0.45]);
  // el pozo de la huerta
  WALLS.push([-49.3, -48.1, 3.4, 4.6]);
}
export function clampLocal(o, r = 0.4) {
  const u0 = o.u;
  // el frente del convento
  if (o.u < F.u0 + r) o.u = F.u0 + r;
  if (o.v > F.vMax - r) o.v = F.vMax - r;
  if (o.v < -F.vMax + r) o.v = -F.vMax + r;
  // la barranca: hasta el borde, salvo por las bajadas (hasta la playa)
  const e = edgeU(o.v);
  let inBaj = null;
  for (const b of F.bajadas) if (Math.abs(o.v - b) < F.bajW + 1.2) inBaj = b;
  if (inBaj == null) {
    if (o.u > e - 0.7 - r) o.u = e - 0.7 - r;
  } else {
    if (o.u > e + 11.5) o.u = e + 11.5;
    // adentro de la rampa (pasado el borde) no se sale por los costados
    if (o.u > e - 1.5) {
      const lim = F.bajW - r * 0.5;
      if (o.v > inBaj + lim) o.v = inBaj + lim;
      if (o.v < inBaj - lim) o.v = inBaj - lim;
    }
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
  for (const [cu, cv, cr] of F.ombues) {
    const du = o.u - cu;
    const dv = o.v - cv;
    const d = Math.hypot(du, dv);
    const m = cr + r;
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
// Rayo (en el mundo) contra el piso, los edificios, el muro y los troncos.
// Devuelve la distancia (o Infinity) y completa hit como World.raycast.
const ro = {};
const rd = {};
export function rayCampo(o, d, maxT, hit) {
  toLocal(o.x, o.z, ro);
  const du = CY * d.x - SY * d.z;
  const dv = SY * d.x + CY * d.z;
  rd.u = du;
  rd.v = dv;
  let best = Math.min(maxT, 260);
  let n = null;
  // el piso: a pasos (cortos cerca, largos lejos) y después a la mitad
  let tPrev = 0;
  let above = o.y - hLoc(ro.u, ro.v);
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
  // los troncos de los ombúes (cilindros)
  for (const [cu, cv, cr] of F.ombues) {
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
    if (y < hLoc(cu, cv) - 0.5 || y > hLoc(cu, cv) + 4.2) continue;
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
    // las dos aguas
    P.push(a0, y0, b0, um, yr, b0, um, yr, b1, a0, y0, b0, um, yr, b1, a0, y0, b1);
    P.push(a1, y0, b0, a1, y0, b1, um, yr, b1, a1, y0, b0, um, yr, b1, um, yr, b0);
    // los dos hastiales
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return paint(g, hex, 0.08);
}
// algo puesto en (u, y, v) con un giro
const at = (geo, u, y, v, ry = 0, rx = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(u, y, v));

// colores (sRGB)
const COL = {
  cal: 0xcfc4ac,
  calSombra: 0xb4a88c,
  zocalo: 0xa88a5c,
  teja: 0xa2462a,
  tejaOsc: 0x7e3420,
  madera: 0x4a3020,
  hierro: 0x2a2826,
  bronce: 0x8a6a32,
  ladrillo: 0xb06a44,
  pasto: 0x667a30,
  pastoSeco: 0x8a8040,
  pastoOsc: 0x506228,
  tierra: 0x7a5636,
  arcilla: 0xa8522e,
  arcillaOsc: 0x7e3a22,
  arena: 0xb8a27a,
  barro: 0x4a3a2a,
  hoja: 0x3e6a2a,
  hojaOsc: 0x2c5020,
  tronco: 0x5a4632,
  casco: 0x3a2a1e,
  cascoOsc: 0x241a12,
  vela: 0xd8d0bc,
  isla: 0x26341e,
};

// El piso: una grilla (fina en el medio, gruesa lejos) con color por altura y pendiente.
function buildGround() {
  const us = [];
  for (let u = -300; u < -80; u += 12) us.push(u);
  for (let u = -80; u < 72; u += 1.25) us.push(u);
  for (let u = 72; u <= 104; u += 4) us.push(u);
  const vs = [];
  for (let v = -260; v < -64; v += 12) vs.push(v);
  for (let v = -64; v < 64; v += 1.5) vs.push(v);
  for (let v = 64; v <= 260; v += 12) vs.push(v);
  const nu = us.length;
  const nv = vs.length;
  const H = new Float32Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) H[j * nu + i] = hLoc(us[i], vs[j]);
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const cA = new THREE.Color();
  const pick = (u, v, y, slope) => {
    const e = edgeU(v);
    const k = bajK(v);
    // el pasto: seco y verde en manchas
    const n1 = Math.sin(u * 0.21 + v * 0.13) * Math.sin(u * 0.07 - v * 0.19 + 2) + 0.5 * Math.sin(u * 0.53 + 1) * Math.sin(v * 0.47);
    // (lejos, donde los triángulos son grandes, más parejo: si no, quedaba a cuadros)
    const fine = 1 - smooth(70, 110, Math.max(Math.abs(u + 5), Math.abs(v)));
    c.set(COL.pasto).lerp(cA.set(n1 > 0.25 ? COL.pastoSeco : COL.pastoOsc), Math.min(1, Math.abs(n1) * 0.6) * (0.25 + 0.75 * fine));
    // los caminos de tierra: de cada portón al este, y el de la huerta
    for (const gg of F.gates) {
      const gv = (gg[0] + gg[1]) / 2;
      const w = 1.6 + 0.3 * Math.sin(u * 0.3);
      const dv = Math.abs(v - (gv + 3 * Math.sin(u * 0.05 + gv)));
      if (u > F.wallU - 1 && u < 30 && dv < w) c.lerp(cA.set(COL.tierra), 0.8 * (1 - dv / w));
    }
    // la huerta: tierra arada
    if (u < F.wallU && u > F.u0 - 1 && Math.abs(v) < F.wallV) c.lerp(cA.set(COL.tierra), 0.55 + 0.25 * Math.sin(v * 2.2));
    // la barranca colorada, la playa y el barro del río
    if (slope > 0.9) c.lerp(cA.set(slope > 2 ? COL.arcillaOsc : COL.arcilla), Math.min(1, (slope - 0.9) * 1.5));
    if (k > 0.3 && u > e - 9) c.lerp(cA.set(COL.tierra), (k - 0.3) * 1.2);
    if (y < 2.4) c.lerp(cA.set(COL.arena), smooth(2.4, 1.6, y));
    if (y < WATER_Y + 0.15) c.lerp(cA.set(COL.barro), smooth(WATER_Y + 0.15, WATER_Y - 0.6, y));
    // lejos, más apagado (la niebla ayuda)
    return c;
  };
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = [us[i], H[j * nu + i], vs[j]];
      const b = [us[i + 1], H[j * nu + i + 1], vs[j]];
      const cc = [us[i + 1], H[(j + 1) * nu + i + 1], vs[j + 1]];
      const d = [us[i], H[(j + 1) * nu + i], vs[j + 1]];
      // todo lo que queda bajo el agua y lejos no se arma
      const ymax = Math.max(a[1], b[1], cc[1], d[1]);
      if (ymax < -1.5 && a[0] > 80) continue;
      for (const tri of [
        [a, d, cc],
        [a, cc, b],
      ]) {
        const [p, q, r] = tri;
        const mu = (p[0] + q[0] + r[0]) / 3;
        const mv = (p[2] + q[2] + r[2]) / 3;
        const my = (p[1] + q[1] + r[1]) / 3;
        // la pendiente: lo que sube por metro en el triángulo
        const ux = q[0] - p[0];
        const uy = q[1] - p[1];
        const uz = q[2] - p[2];
        const vx = r[0] - p[0];
        const vy = r[1] - p[1];
        const vz = r[2] - p[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const slope = Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny));
        const cl = pick(mu, mv, my, slope);
        const j2 = 1 + ((Math.sin(mu * 12.9898 + mv * 78.233) * 43758.5453) % 1) * (Math.abs(mu) < 80 && Math.abs(mv) < 70 ? 0.06 : 0.015);
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

// El convento de San Carlos: la iglesia (nave, fachada con portón), el
// campanario con la campana, el claustro con su galería, la huerta con su
// muro, el pozo y los naranjos.
function buildConvento(P) {
  const [cu0, cu1, cv0, cv1] = F.church;
  const y = Y0;
  // la nave: zócalo, paredes de cal, contrafuertes, ventanas altas y el techo de tejas
  P.push(box(cu0, cu1, y - 0.5, y + 0.7, cv0, cv1, COL.zocalo));
  P.push(box(cu0 + 0.15, cu1 - 0.15, y + 0.7, y + 8.4, cv0 + 0.15, cv1 - 0.15, COL.cal, 0.03));
  for (let v = cv0 + 2; v < cv1 - 1; v += 4.4) {
    P.push(box(cu1 - 0.15, cu1 + 0.55, y - 0.3, y + 6.8, v - 0.5, v + 0.5, COL.calSombra));
    P.push(box(cu0 - 0.55, cu0 + 0.15, y - 0.3, y + 6.8, v - 0.5, v + 0.5, COL.calSombra));
    // las ventanas altas (oscuras, con su marco)
    P.push(box(cu1 - 0.05, cu1 + 0.08, y + 4.2, y + 6.4, v + 1.3, v + 2.4, COL.madera, 0.02));
    P.push(box(cu0 - 0.08, cu0 + 0.05, y + 4.2, y + 6.4, v + 1.3, v + 2.4, COL.madera, 0.02));
  }
  P.push(gable(cu0, cu1, cv0, cv1, y + 8.4, y + 12.6, COL.teja, false, 0.55));
  // la fachada (al norte): frontón, el portón y el óculo
  P.push(box(cu0 - 0.2, cu1 + 0.2, y + 8.3, y + 9.0, cv1 - 0.05, cv1 + 0.35, COL.calSombra));
  P.push(box((cu0 + cu1) / 2 - 1.3, (cu0 + cu1) / 2 + 1.3, y, y + 4.2, cv1 - 0.05, cv1 + 0.12, COL.madera, 0.02));
  P.push(box((cu0 + cu1) / 2 - 1.7, (cu0 + cu1) / 2 + 1.7, y + 4.2, y + 4.7, cv1 - 0.05, cv1 + 0.3, COL.zocalo));
  P.push(at(paint(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 10), COL.madera), (cu0 + cu1) / 2, y + 6.6, cv1 + 0.06, 0, Math.PI / 2));
  // la cruz arriba del frontón
  P.push(box((cu0 + cu1) / 2 - 0.09, (cu0 + cu1) / 2 + 0.09, y + 12.6, y + 14.2, cv1 - 0.1, cv1 + 0.08, COL.hierro));
  P.push(box((cu0 + cu1) / 2 - 0.5, (cu0 + cu1) / 2 + 0.5, y + 13.5, y + 13.7, cv1 - 0.1, cv1 + 0.08, COL.hierro));
  SOLID.push([cu0 - 0.6, cu1 + 0.6, y - 1, y + 12.6, cv0, cv1 + 0.3]);

  // el campanario: la torre, el cuerpo de las campanas (cuatro pilares con
  // arcos) y el remate con la cruz
  const [tu0, tu1, tv0, tv1] = F.tower;
  P.push(box(tu0 - 0.2, tu1 + 0.2, y - 0.5, y + 0.9, tv0 - 0.2, tv1 + 0.2, COL.zocalo));
  P.push(box(tu0, tu1, y + 0.9, y + 15, tv0, tv1, COL.cal, 0.03));
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
  // la campana colgada adentro
  P.push(at(paint(new THREE.CylinderGeometry(0.42, 0.85, 1.2, 9), COL.bronce, 0.1), (tu0 + tu1) / 2, y + 17.2, (tv0 + tv1) / 2));
  P.push(box((tu0 + tu1) / 2 - 0.08, (tu0 + tu1) / 2 + 0.08, y + 17.8, y + 19.4, (tv0 + tv1) / 2 - 0.08, (tv0 + tv1) / 2 + 0.08, COL.hierro));
  // el remate: una pirámide de tejas y la cruz de hierro
  P.push(at(paint(new THREE.ConeGeometry(4.6, 4.2, 4, 1), COL.teja, 0.08), (tu0 + tu1) / 2, y + 22.2, (tv0 + tv1) / 2, Math.PI / 4));
  P.push(box((tu0 + tu1) / 2 - 0.08, (tu0 + tu1) / 2 + 0.08, y + 24.2, y + 26.2, (tv0 + tv1) / 2 - 0.08, (tv0 + tv1) / 2 + 0.08, COL.hierro));
  P.push(box((tu0 + tu1) / 2 - 0.55, (tu0 + tu1) / 2 + 0.55, y + 25.3, y + 25.5, (tv0 + tv1) / 2 - 0.08, (tv0 + tv1) / 2 + 0.08, COL.hierro));
  SOLID.push([tu0 - 0.3, tu1 + 0.3, y - 1, y + 20.1, tv0 - 0.3, tv1 + 0.3]);

  // el claustro: una tira de celdas con techo a dos aguas y la galería de pilares a la huerta
  const [ku0, ku1, kv0, kv1] = F.cloister;
  P.push(box(ku0, ku1 - 3, y - 0.4, y + 4.6, kv0, kv1, COL.cal, 0.04));
  P.push(gable(ku0, ku1 - 3, kv0, kv1, y + 4.6, y + 6.6, COL.teja, false, 0.4));
  // el alero de la galería y sus pilares
  P.push(box(ku1 - 3.2, ku1 + 0.4, y + 3.5, y + 3.8, kv0, kv1, COL.tejaOsc));
  for (let v = kv0 + 0.6; v < kv1; v += 2.6) P.push(box(ku1 - 0.2, ku1 + 0.2, y, y + 3.5, v - 0.2, v + 0.2, COL.cal, 0.04));
  // las puertas de las celdas
  for (let v = kv0 + 1.6; v < kv1 - 1; v += 3.2) P.push(box(ku1 - 3.06, ku1 - 2.94, y, y + 2.2, v - 0.55, v + 0.55, COL.madera, 0.02));
  SOLID.push([ku0, ku1 - 3, y - 1, y + 6.6, kv0, kv1]);

  // el muro de la huerta: ladrillo revocado, con su caballete y los pilares de los portones
  const W = F.wallU;
  const [g0, g1] = F.gates;
  const seg = (v0, v1) => {
    P.push(box(W - 0.3, W + 0.3, y - 0.4, y + 2.25, v0, v1, COL.cal, 0.05));
    P.push(box(W - 0.38, W + 0.38, y + 2.25, y + 2.45, v0, v1, COL.tejaOsc));
    // (a trechos, el revoque caído deja ver el ladrillo)
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
  ]) {
    P.push(at(paint(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 5), COL.tronco), u, y + 0.7, v));
    P.push(at(paint(new THREE.IcosahedronGeometry(1.0, 0), COL.hoja, 0.15), u, y + 1.9, v, u));
    // (las naranjas: puntitos)
    for (let k = 0; k < 4; k++) P.push(at(paint(new THREE.OctahedronGeometry(0.1, 0), 0xe08a1a), u + Math.cos(k * 1.7 + u) * 0.8, y + 1.7 + (k % 2) * 0.4, v + Math.sin(k * 1.7 + u) * 0.8));
  }
  // los surcos de la huerta (canteros bajos)
  for (let v = -29; v < 29; v += 1.6) {
    if (Math.abs(v - 4) < 2 || Math.abs(v + 4) < 1.2) continue;
    P.push(box(-51.6, -45.4, y - 0.1, y + 0.12, v - 0.3, v + 0.3, COL.tierra, 0.12));
  }
}

// Un ombú: el tronco ancho con raíces al aire y la copa enorme.
function ombu(P, u, v, r) {
  const y = hLoc(u, v);
  P.push(at(paint(new THREE.CylinderGeometry(r * 0.75, r * 1.25, 3.6, 8), COL.tronco, 0.1), u, y + 1.6, v));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + u;
    P.push(at(paint(new THREE.ConeGeometry(r * 0.45, 2.2, 5), COL.tronco, 0.1), u + Math.cos(a) * r * 1.1, y + 0.25, v + Math.sin(a) * r * 1.1, 0, Math.cos(a) * 1.2, -Math.sin(a) * 1.2));
  }
  // las ramas gruesas
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + v;
    P.push(at(paint(new THREE.CylinderGeometry(0.28, 0.42, 4.2, 6), COL.tronco, 0.1), u + Math.cos(a) * 1.4, y + 4.4, v + Math.sin(a) * 1.4, 0, Math.sin(a) * 0.7, -Math.cos(a) * 0.7));
  }
  // la copa: bochas de hojas
  const cr = 4.2 + r * 1.6;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + u * 0.3;
    const d = k === 0 ? 0 : cr * 0.62;
    const s = k === 0 ? cr * 0.8 : cr * (0.48 + 0.1 * Math.sin(k * 2.3));
    P.push(at(paint(new THREE.IcosahedronGeometry(s, 1), k % 3 ? COL.hoja : COL.hojaOsc, 0.14), u + Math.cos(a) * d, y + 6.8 + Math.sin(k * 1.9) * 0.9, v + Math.sin(a) * d, a).scale(1, 1, 1));
  }
}

// Un bergantín de la escuadra realista, fondeado: casco, dos palos, vergas con
// las velas aferradas y la bandera.
function barco(P, u, v, ry, L = 22) {
  const wy = WATER_Y;
  const hull = new THREE.BoxGeometry(5.2, 3.4, L, 1, 1, 6);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / (L / 2);
    const yy = p.getY(i);
    // la proa en punta, la popa más ancha; abajo, más angosto
    const k = z > 0 ? 1 - z * z * 0.85 : 1 - z * z * 0.25;
    p.setX(i, p.getX(i) * k * (yy < 0 ? 0.62 : 1));
    // la borda sube en la proa y en la popa
    if (yy > 0) p.setY(i, yy + Math.abs(z) * 0.6);
  }
  P.push(at(paint(hull, COL.casco, 0.1), u, wy + 0.9, v, ry));
  // la franja de la borda y el castillo de popa
  P.push(at(box(-2.7, 2.7, 0, 0.35, -L / 2 + 1.5, L / 2 - 4, 0xb08a3a), u, wy + 2.25, v, ry));
  P.push(at(box(-2.4, 2.4, 0, 1.4, -L / 2 + 0.6, -L / 2 + 5, COL.cascoOsc), u, wy + 2.4, v, ry));
  // los palos y las vergas
  for (const [z, h] of [
    [L * 0.18, 17],
    [-L * 0.14, 15],
  ]) {
    // (el palo parado en el casco, a z del medio)
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(u, wy + 2 + h / 2, v);
    P.push(paint(new THREE.CylinderGeometry(0.16, 0.26, h, 6), COL.madera).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, z).premultiply(m)));
    for (const [hy, w] of [
      [0.42, 7.5],
      [0.7, 6],
      [0.92, 4.2],
    ]) {
      const ym = -h / 2 + h * hy;
      P.push(paint(new THREE.CylinderGeometry(0.09, 0.09, w, 5).rotateZ(Math.PI / 2), COL.madera).applyMatrix4(new THREE.Matrix4().makeTranslation(0, ym, z).premultiply(m)));
      // la vela aferrada: un rollo blanco a lo largo de la verga
      P.push(paint(new THREE.CylinderGeometry(0.28, 0.28, w * 0.9, 6).rotateZ(Math.PI / 2), COL.vela, 0.08).applyMatrix4(new THREE.Matrix4().makeTranslation(0, ym - 0.3, z).premultiply(m)));
    }
    // la bandera (roja y amarilla) arriba
    P.push(paint(new THREE.BoxGeometry(0.05, 0.5, 1.5), 0xb02a1a).applyMatrix4(new THREE.Matrix4().makeTranslation(0, h / 2 - 0.4, z - 0.8).premultiply(m)));
    P.push(paint(new THREE.BoxGeometry(0.06, 0.24, 1.5), 0xe0b22a).applyMatrix4(new THREE.Matrix4().makeTranslation(0, h / 2 - 0.4, z - 0.8).premultiply(m)));
  }
  // el bauprés
  P.push(paint(new THREE.CylinderGeometry(0.12, 0.18, 7, 5).rotateX(-1.2), COL.madera).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 3.2, L / 2 + 1.5).premultiply(new THREE.Matrix4().makeRotationY(ry).setPosition(u, wy, v))));
}

// Las islas del Paraná, lejos: tiras bajas de monte en la niebla.
function islas(P) {
  for (let k = 0; k < 9; k++) {
    const v = -190 + k * 48 + Math.sin(k * 3.1) * 15;
    const u = 215 + Math.sin(k * 1.7) * 30;
    P.push(at(paint(new THREE.IcosahedronGeometry(1, 1), COL.isla, 0.2).scale(14 + (k % 3) * 6, 3.5 + (k % 2) * 2, 30 + (k % 4) * 9), u, WATER_Y + 0.5, v, k));
  }
}

// El pasto: matas de tres hojas, instanciadas sobre el campo.
function buildGrass() {
  const blade = [];
  // (hojas finas, inclinadas y con la punta apenas más clara: en conos pálidos
  // el campo se veía chato y de plástico, 2026-10-06)
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
  const N = 5200;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; n < N && i < N * 4; i++) {
    const u = -42 + Math.random() * 85;
    const v = -43 + Math.random() * 86;
    if (u > edgeU(v) - 1.5) continue;
    // (no en los caminos)
    let path = false;
    for (const gg of F.gates) if (u < 30 && Math.abs(v - ((gg[0] + gg[1]) / 2 + 3 * Math.sin(u * 0.05 + (gg[0] + gg[1]) / 2))) < 1.6) path = true;
    if (path) continue;
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
    // (en manchones)
    const c = Math.floor(Math.random() * 9);
    const cu = -30 + ((c * 37) % 70);
    const cv = -36 + ((c * 53) % 72);
    const u = cu + (Math.random() - 0.5) * 9;
    const v = cv + (Math.random() - 0.5) * 9;
    if (u < -42 || u > edgeU(v) - 2) continue;
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

// Arma todo el campo. Devuelve { root, update(dt, t), dispose() }.
export function buildCampo() {
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
  buildConvento(P);
  for (const [u, v, r] of F.ombues) ombu(P, u, v, r);
  barco(P, 128, -34, 0.35);
  barco(P, 150, 12, -0.2, 24);
  barco(P, 118, 44, 0.6, 20);
  islas(P);
  // los postes de un alambrado viejo al sur del campo (sin alambre: 1813)
  for (let u = -40; u < 30; u += 3.2) P.push(at(paint(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5), COL.tronco), u, hLoc(u, -46) + 0.6, -46));
  for (const g of P) if (!g.attributes.color) paint(g, 0xff00ff);
  const geo = mergeGeometries(P);
  for (const g of P) g.dispose();
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, flatShading: true });
  const stat = new THREE.Mesh(geo, mat);
  stat.name = 'slEstatico';
  stat.castShadow = true;
  stat.receiveShadow = true;
  stat.matrixAutoUpdate = false;
  root.add(stat);
  // el agua del Paraná: una sola tapa, apenas brillante
  const wg = new THREE.PlaneGeometry(720, 900, 1, 1).rotateX(-Math.PI / 2).translate(360 + 38, WATER_Y, 0);
  const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x27323a, roughness: 0.42, metalness: 0.12 }));
  water.name = 'slAgua';
  water.receiveShadow = true;
  water.matrixAutoUpdate = false;
  root.add(water);
  const grass = buildGrass();
  const cardos = buildCardos();
  root.add(grass, cardos);
  root.updateMatrixWorld(true);
  for (const o of [stat, water, grass, cardos, ground]) o.updateMatrix();
  return {
    root,
    stat,
    ground,
    water,
    tris: geo.attributes.position.count / 3,
    update() {},
    dispose() {
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
      water.geometry.dispose();
      water.material.dispose();
      grass.geometry.dispose();
      grass.material.dispose();
      cardos.geometry.dispose();
      cardos.material.dispose();
    },
  };
}
