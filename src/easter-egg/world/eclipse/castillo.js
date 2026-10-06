import * as THREE from 'three';
import GeoBuilder from '../GeoBuilder';
import { ZONES, PROPS, RAMPS, WALL_H, zoneRects, WALL_BUYS, PERK_SPOTS, BOX_SPOTS, POWER } from '../../config/map';
import { quadUV, rampY } from '../Levels';
import { quad } from '../monumentoKit';
import { weathering, indoorGrid } from '../castleWeathering';
import { sparkle } from '../castleSnow';
import { flameMaterial } from '../castleFire';
import { wallSpans } from '../castleRooms';
import { canvasTex } from '../penalProps';
import { bake, hash, rng } from './desgarro';
import { fragment, orbiters, grime, wallCrack, portalOrbs, keepOut, tpShift } from './centro';

// El Castillo de Eclipse Matero (layout v4). El Patio de Armas, la Caballeriza,
// el Gran Salón, la Cocina y la Barbacana vienen TRANSPLANTADOS iguales de Der
// Mateendrache (con su utilería y sus luces: el config). Acá va lo que allá arma
// world/Castle.js y compañía a mano y que no se deja correr en otro mapa (leen
// las zonas por su letra del mapa del castillo): COPIADO de ese código, con las
// claves de acá (las del transplante, `tp.key` → zona de Eclipse) y el mismo
// lugar relativo:
//  · los techos de pizarra con nieve, sus hastiales y cumbreras con pináculos
//    (Castle.buildRoofs), la barbacana con sus almenas (buildGatehouse) y sus
//    dos torres redondas (buildTowers);
//  · el zócalo, las molduras y las vigas con ménsulas, las pilastras del salón,
//    los contrafuertes del patio, la nieve amontonada y los carámbanos
//    (castleTrim.buildTrim);
//  · el entramado de madera de la caballeriza y la cocina, las ventanas del
//    patio y los tirajes de las chimeneas (castleRooms);
//  · las cerchas del Gran Salón (castleHalls);
//  · la piedra gastada con nieve en las repisas (castleWeathering, las mismas
//    funciones) y el brillo de la nieve (castleSnow).
// Y lo propio de Eclipse: las paredes de afuera de granito (las que salían del
// travertino del Monumento), almenas arriba de la muralla baja del patio, las
// barandas de piedra de las escaleras, las grietas de la disformidad, el
// torreón suelto (Q9) y las piedras que rondan los portales. Oclusión,
// humedad y musgo con el ayudante de las islas (centro.grime).
// __mduNoEclipseCastleArt: solo los bloques y lo transplantado.

const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const WINDOW = 4;
const OUT = 0;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// las zonas del castillo original → las de acá
function keysOf(isl) {
  const K = {};
  for (const k of isl.zones) if (ZONES[k]?.tp?.src === 'castillo') K[ZONES[k].tp.key] = k;
  return K;
}
const ceilOf = (k) => ZONES[k].roof ?? (ZONES[k].y || 0) + WALL_H;

let LIVE = null;

export function build(w, g, isl) {
  if (globalThis.__mduNoEclipseCastleArt === true) return;
  const M = w.M;
  const K = keysOf(isl);
  const mine = isl.zones.filter((k) => !ZONES[k].frag);
  const ids = new Set(mine.map((k) => w.zoneKeys.indexOf(k)));
  const isMine = (i) => w.grid[i] === FLOOR && ids.has(w.zone[i]);
  const r = rng(5507);
  // ---- la piedra gastada, la nieve en lo que mira para arriba (solo afuera) y el
  // brillo de la nieve: las mismas del castillo (estos materiales solo los usa esta isla)
  indoorGrid(w);
  weathering(M.castleStone);
  weathering(M.castleStoneDark, { grime: 0.45, snow: 0.8 });
  weathering(M.castleStoneFrost, { grime: 0.25 });
  weathering(M.castlePlaster, { tone: 0.5, grime: 0.15, snow: 0, frost: 0 });
  sparkle(M.snow);
  sparkle(M.snowCap, 0.6);
  const fm = flameMaterial();
  fm.userData.noShadow = true;

  const gb = new GeoBuilder();
  const extra = [];
  w.eaves = w.eaves || [];
  buildRoofs(w, gb, K);
  buildGatehouse(w, gb, K);
  buildTowers(w, gb, K);
  const icicles = buildTrim(w, gb, K, mine);
  const busy = busyWalls(w);
  for (const k of [K.B, K.E]) if (k) timber(w, gb, k, busy);
  facades(w, gb, [K.A].filter(Boolean));
  chimneys(w, gb, isl);
  if (K.D) halls(w, gb, K.D);
  cladOutside(w, gb, mine, isMine);
  battlements(w, gb, K.A, isMine);
  stairRails(w, gb, mine);

  const win = windowMats();
  const mats = { ...M, winLit: win.lit, winDark: win.dark };
  bake(w, gb, mats, extra, { noShadow: ['winLit', 'winDark'], isla: 'castillo' });
  // los carámbanos: una malla de instancias (los de las paredes y los de los aleros)
  for (const [ax, az, bx, bz, y] of w.eaves.filter((e) => inBox(isl, e[0], e[1]))) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len * 2.2);
    for (let s = 0; s < n; s++) {
      if (hash(ax + s * 1.7, az + s * 0.3) > 0.6) continue;
      const u = (s + hash(s, ax) * 0.8) / n;
      icicles.push([ax + (bx - ax) * u, y - 0.03, az + (bz - az) * u, 0.3 + hash(s * 2.1, az) * 0.9]);
    }
  }
  if (icicles.length) w.root.add(icicleMesh(icicles));

  // ---- lo retorcido: grietas de luz violeta en las paredes de afuera, el
  // torreón suelto, piedras que rondan los portales
  const root = new THREE.Group();
  root.name = 'eclipse:castillo:disformidad';
  cracks(w, root, mine, isMine, r);
  const orbs = [];
  torreonSuelto(w, orbs);
  portalOrbs('castillo', orbs);
  const orb = orbiters(w, orbs, { seed: 57 });
  w.root.add(root);
  // ---- oclusión al pie de las paredes, humedad y musgo afuera (con la nieve, sin charcos)
  grime(w, 'castillo', { seed: 5601, damp: 0.12, moss: 0.06, rust: 0.04, drip: 0.18, mud: 0.0, puddles: 0, out: keepOut() });
  LIVE = { w, orb, fm };
}

// Las llamas bailan con el reloj del juego (en el castillo lo hace Castle.js).
export function update(dt, t) {
  if (!LIVE) return;
  LIVE.fm.uniforms.uTime.value = t;
  LIVE.orb?.update(t);
}

const inBox = (isl, x, z) => x >= isl.box[0] - 6 && x <= isl.box[2] + 7 && z >= isl.box[1] - 6 && z <= isl.box[3] + 7;

// ================= los techos (Castle.buildRoofs) =================
const ROOFS = { D: { pitch: 0.55 }, B: { pitch: 0.45 }, E: { pitch: 0.45 } };
function buildRoofs(w, gb, K) {
  for (const [ok, R] of Object.entries(ROOFS)) {
    const k = K[ok];
    const Z = k && ZONES[k];
    if (!Z) continue;
    const [x0, z0, x1, z1] = zoneRects(k)[0];
    // alero: hasta afuera de las paredes
    const X0 = x0 - 1.25;
    const X1 = x1 + 2.25;
    const Z0 = z0 - 1.25;
    const Z1 = z1 + 2.25;
    const base = (Z.roof ?? Z.y + 3.6) + 0.25;
    const alongX = X1 - X0 >= Z1 - Z0;
    const half = (alongX ? Z1 - Z0 : X1 - X0) / 2;
    const ridge = base + half * R.pitch;
    const sb = base + 0.2 * R.pitch + 0.07;
    if (alongX) w.eaves.push([X0, Z0, X1, Z0, base], [X0, Z1, X1, Z1, base]);
    else w.eaves.push([X0, Z0, X0, Z1, base], [X1, Z0, X1, Z1, base]);
    if (alongX) {
      const zm = (Z0 + Z1) / 2;
      for (const [za, zb, s] of [[Z0, zm, 1], [Z1, zm, -1]]) {
        const n = new THREE.Vector3(0, half, s * -(ridge - base)).normalize().toArray().map((v, i) => (i === 2 ? -v : v));
        slope(gb, 'slate', [X0, base, za], [X1, base, za], [X1, ridge, zb], [X0, ridge, zb], n);
        slope(gb, 'snowCap', [X0, sb, za + s * 0.2], [X1, sb, za + s * 0.2], [X1, ridge + 0.07, zb], [X0, ridge + 0.07, zb], n);
      }
      for (const x of [X0 + 0.05, X1 - 0.05]) gable(gb, x, Z0, Z1, base, ridge, true);
      ridgeCap(gb, [X0, ridge, zm], [X1, ridge, zm], true);
    } else {
      const xm = (X0 + X1) / 2;
      for (const [xa, xb, s] of [[X0, xm, 1], [X1, xm, -1]]) {
        const n = new THREE.Vector3(-s * (ridge - base) * -1, half, 0).normalize().toArray();
        slope(gb, 'slate', [xa, base, Z1], [xa, base, Z0], [xb, ridge, Z0], [xb, ridge, Z1], n);
        slope(gb, 'snowCap', [xa + s * 0.2, sb, Z1], [xa + s * 0.2, sb, Z0], [xb, ridge + 0.07, Z0], [xb, ridge + 0.07, Z1], n);
      }
      for (const z of [Z0 + 0.05, Z1 - 0.05]) gable(gb, z, X0, X1, base, ridge, false);
      ridgeCap(gb, [xm, ridge, Z0], [xm, ridge, Z1], false);
    }
  }
}
// La cumbrera: las tejas de arriba (con su lomo de nieve) y, en cada punta, un
// pináculo de piedra con su aguja. (Allá el remate era 'stoneStep', que acá es
// el travertino del Monumento: va la piedra oscura del castillo.)
function ridgeCap(gb, a, b, alongX) {
  const w = 0.13;
  if (alongX) {
    gb.box('slate', a[0], a[1] - 0.02, a[2] - w, b[0], a[1] + 0.13, a[2] + w, 1);
    gb.box('snowCap', a[0] + 0.1, a[1] + 0.13, a[2] - w + 0.03, b[0] - 0.1, a[1] + 0.2, a[2] + w - 0.03, 1);
  } else {
    gb.box('slate', a[0] - w, a[1] - 0.02, a[2], a[0] + w, a[1] + 0.13, b[2], 1);
    gb.box('snowCap', a[0] - w + 0.03, a[1] + 0.13, a[2] + 0.1, a[0] + w - 0.03, a[1] + 0.2, b[2] - 0.1, 1);
  }
  for (const p of [a, b]) {
    const x = alongX ? p[0] + (p === a ? 0.2 : -0.2) : p[0];
    const z = alongX ? p[2] : p[2] + (p === a ? 0.2 : -0.2);
    const y = p[1];
    gb.box('castleStone', x - 0.17, y - 0.3, z - 0.17, x + 0.17, y + 0.55, z + 0.17, 1);
    gb.box('castleStoneDark', x - 0.22, y + 0.55, z - 0.22, x + 0.22, y + 0.65, z + 0.22, 1);
    const q = [[x - 0.16, z - 0.16], [x + 0.16, z - 0.16], [x + 0.16, z + 0.16], [x - 0.16, z + 0.16]].map(([qx, qz]) => [qx, y + 0.65, qz]);
    const tip = [x, y + 1.35, z];
    for (let k = 0; k < 4; k++) {
      const c = q[k];
      const d = q[(k + 1) % 4];
      quadUV(gb, 'castleStoneDark', [c, d, tip, tip], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], [(c[0] + d[0]) / 2 - x, 0.2, (c[2] + d[2]) / 2 - z]);
    }
  }
}
function slope(gb, key, a, b, c, d) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = d[0] - a[0];
  const vy = d[1] - a[1];
  const vz = d[2] - a[2];
  const ny = uz * vx - ux * vz;
  const nx = uy * vz - uz * vy;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  const lu = Math.hypot(ux, uy, uz) / 1.6;
  const lv = Math.hypot(vx, vy, vz) / 1.6;
  const tri = c === d;
  const ua = [0, 0];
  const ub = [lu, 0];
  const uc = [tri ? lu / 2 : lu, lv];
  const ud = [tri ? lu / 2 : 0, lv];
  const N = [nx / l, ny / l, nz / l];
  if (N[1] >= 0) gb.quad(key, a, b, c, d, N, ua, ub, uc, ud);
  else gb.quad(key, d, c, b, a, [-N[0], -N[1], -N[2]], ud, uc, ub, ua);
}
function gable(gb, at, s0, s1, base, ridge, alongX) {
  const m = (s0 + s1) / 2;
  const pts = alongX ? [[at, base, s0], [at, base, s1], [at, ridge, m]] : [[s0, base, at], [s1, base, at], [m, ridge, at]];
  for (const sg of [1, -1]) {
    const n = alongX ? [sg, 0, 0] : [0, 0, sg];
    const flip = alongX ? sg > 0 : sg < 0;
    const [a, b, c] = flip ? [pts[1], pts[0], pts[2]] : pts;
    gb.quad('castleStone', a, b, c, c, n, [0, 0], [1, 0], [0.5, 1], [0.5, 1]);
  }
}

// ================= la barbacana (Castle.buildGatehouse y sus dos torres) =================
function buildGatehouse(w, gb, K) {
  const k = K.L;
  if (!k) return;
  const L = ZONES[k];
  const [x0, z0, x1, z1] = zoneRects(k)[0];
  const roof = (L.roof ?? L.y + 3.6) + 0.02;
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    if ((x + z0) % 2) continue;
    gb.box('castleStone', x + 0.05, roof + 0.9, z0 - 0.95, x + 0.95, roof + 1.6, z0 - 0.05, 1);
  }
  gb.box('castleStone', x0 - 1, roof, z0 - 1, x1 + 2, roof + 0.9, z0, 1);
  gb.flat('snowCap', x0, z0, x1 + 1, z1 + 1, roof + 0.02, true);
  // (y del lado del precipicio, el frente del portón con sus almenas: acá no hay
  // patio adelante, la barbacana termina en el borde)
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    if ((x + z1) % 2) continue;
    gb.box('castleStone', x + 0.05, roof + 0.9, z1 + 1.05, x + 0.95, roof + 1.6, z1 + 1.95, 1);
  }
  gb.box('castleStone', x0 - 1, roof, z1 + 1, x1 + 2, roof + 0.9, z1 + 2, 1);
}
// las dos torres del portón de la barbacana (Castle TOWERS, las del borde del
// precipicio), corridas como el transplante; acá abajo está el vacío: el pie
// baja hasta la roca de la isla
const GATE_TOWERS = [
  [48.0, 70.5, 1.3, 10.4, 24],
  [55.0, 70.5, 1.3, 10.4, 24],
];
function ring(gb, key, cx, cz, r0, r1, y0, y1, n, uvW = 2, a0 = 0) {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    const b = a0 + ((k + 1) / n) * Math.PI * 2;
    const P = [
      [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0],
      [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0],
      [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1],
      [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1],
    ];
    const ua = (a * Math.max(r0, 0.5)) / uvW;
    const ub = (b * Math.max(r0, 0.5)) / uvW;
    const m = (a + b) / 2;
    quadUV(gb, key, P, [[ua, y0 / 3.6], [ub, y0 / 3.6], [ub, y1 / 3.6], [ua, y1 / 3.6]], [Math.cos(m), ((r0 - r1) / Math.max(0.01, y1 - y0)) * 0.5, Math.sin(m)]);
  }
}
function buildTowers(w, gb, K) {
  const S = K.L && tpShift(K.L);
  if (!S) return;
  for (const [ox, oz, R, tall, ofloor] of GATE_TOWERS) {
    const cx = ox + S.dx;
    const cz = oz + S.dz;
    const floor = ofloor + S.dy;
    const base = floor - 5.5;
    const top = floor + tall;
    const n = 20;
    ring(gb, 'castleStone', cx, cz, R + 0.35, R, base, floor - 2, n);
    ring(gb, 'castleStone', cx, cz, R, R, floor - 2, top - 0.9, n);
    // (el pie: un cono de piedra que se mete en la roca)
    ring(gb, 'castleStoneDark', cx, cz, 0.001, R + 0.35, base - 3.2, base, n);
    ring(gb, 'castleStoneDark', cx, cz, R + 0.08, R + 0.08, floor + 1.6, floor + 1.78, n);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const px = cx + Math.cos(a) * (R + 0.12);
      const pz = cz + Math.sin(a) * (R + 0.12);
      gb.box('castleStone', px - 0.13, top - 1.5, pz - 0.13, px + 0.13, top - 0.9, pz + 0.13, 1);
    }
    ring(gb, 'castleStone', cx, cz, R + 0.3, R + 0.3, top - 0.9, top, n);
    ring(gb, 'castleStone', cx, cz, R, R + 0.3, top - 0.9, top - 0.9, n);
    for (const [yy, off] of [[floor - 0.2, 0.3], [floor + 3.2, 1.1]]) {
      for (let k = 0; k < 4; k++) {
        const a = off + (k / 4) * Math.PI * 2;
        const px = cx + Math.cos(a) * (R + 0.01);
        const pz = cz + Math.sin(a) * (R + 0.01);
        gb.box('winLit', px - 0.07, yy, pz - 0.07, px + 0.07, yy + 0.8, pz + 0.07, 1);
      }
    }
    const rr = R + 0.55;
    const peak = top + R * 2.6 + 1.2;
    ring(gb, 'slate', cx, cz, rr, 0.001, top - 0.15, peak, n);
    ring(gb, 'snowCap', cx, cz, rr + 0.03, (rr + 0.03) * 0.55, top - 0.12, top - 0.12 + (peak - top) * 0.45, n);
    ring(gb, 'slate', cx, cz, rr, rr, top - 0.3, top - 0.15, n);
    gb.box('iron', cx - 0.04, peak - 0.2, cz - 0.04, cx + 0.04, peak + 1.6, cz + 0.04, 1);
    gb.box('brass', cx - 0.09, peak + 1.55, cz - 0.09, cx + 0.09, peak + 1.73, cz + 0.09, 1);
    gb.box('redCloth', cx + 0.04, peak + 0.9, cz - 0.015, cx + 0.95, peak + 1.45, cz + 0.015, 1);
  }
}

// ================= el zócalo, las vigas, los contrafuertes y la nieve (castleTrim.buildTrim) =================
function snowH(x, z) {
  return 0.3 + (hash(Math.floor(x * 0.7), Math.floor(z * 0.7)) * 0.6 + hash(x * 3.1, z * 2.3) * 0.4) * 0.4;
}
function buildTrim(w, gb, K, mine) {
  const HALLS = [K.D].filter(Boolean);
  const ROOMS = [K.B, K.E].filter(Boolean);
  const YARDS = [K.A].filter(Boolean);
  const keyOf = (i) => (w.zone[i] >= 0 ? w.zoneKeys[w.zone[i]] : null);
  const propAt = (x, z) => w.inside(x, z) && w.cellBoxes[w.idx(x, z)].some((b) => b.kind === 'prop' && b.active);
  const icicles = [];
  const boxes = [];
  const spans = wallSpans();
  const covers = (axis, at, a0, a1) => spans.some((s) => s.axis === axis && Math.abs(s.at - at) < 0.4 && s.a0 < a1 && s.a1 > a0);
  const strip = (x, z, dx, dz, d) => {
    if (dx === 1) return [x + 1 - d, z, x + 1, z + 1];
    if (dx === -1) return [x, z, x + d, z + 1];
    if (dz === 1) return [x, z + 1 - d, x + 1, z + 1];
    return [x, z, x + 1, z + d];
  };
  for (const k of mine) {
    const Z = ZONES[k];
    for (const [rx0, rz0, rx1, rz1] of zoneRects(k)) {
      for (let z = rz0; z <= rz1; z++) {
        for (let x = rx0; x <= rx1; x++) {
          const i = w.idx(x, z);
          if (w.grid[i] !== FLOOR || keyOf(i) !== k) continue;
          const ramp = w.rampAt[i] >= 0;
          const fy = w.fy[i];
          const outdoor = !!Z.outdoor;
          DIRS.forEach(([dx, dz]) => {
            const nx = x + dx;
            const nz = z + dz;
            if (!w.inside(nx, nz)) return;
            const j = w.idx(nx, nz);
            const nt = w.grid[j];
            if (nt !== WALL && nt !== DOOR && nt !== WINDOW) return;
            const parapet = w.edge[j] !== 0;
            if (!outdoor) {
              if (parapet) return;
              if (!ramp && nt !== DOOR) {
                if (Z.wall === 'castlePlaster') {
                  const [x0, z0, x1, z1] = strip(x, z, dx, dz, 0.05);
                  gb.box('woodDark', x0, fy, z0, x1, fy + 0.95, z1, 1);
                  const [r0, s0, r1, s1] = strip(x, z, dx, dz, 0.09);
                  gb.box('beam', r0, fy + 0.93, s0, r1, fy + 1.02, s1, 1);
                } else {
                  const [x0, z0, x1, z1] = strip(x, z, dx, dz, 0.07);
                  gb.box('castleStoneDark', x0, fy, z0, x1, fy + 0.28, z1, 1);
                }
              }
              if (!(ramp && RAMPS[w.rampAt[i]].ceil)) {
                const c = ceilOf(k);
                const [a0, b0, a1, b1] = strip(x, z, dx, dz, 0.12);
                gb.box('beam', a0, c - 0.32, b0, a1, c - 0.12, b1, 1);
                const [e0, f0, e1, f1] = strip(x, z, dx, dz, 0.2);
                gb.box('beam', e0, c - 0.12, f0, e1, c - 0.01, f1, 1);
              }
              return;
            }
            if (ramp || nt === DOOR) return;
            const t = parapet ? 0.6 : 1;
            drift(gb, x, z, dx, dz, fy, t);
            if (!parapet && nt === WALL) {
              const top = w.top[j];
              if (top - fy > 2.5) {
                for (let s = 0; s < 3; s++) {
                  if (hash(x * 3 + s, z * 7 + dx + dz * 2) > 0.55) continue;
                  const u = (s + 0.3 + hash(x + s, z) * 0.4) / 3;
                  const px = dx === 1 ? x + 0.98 : dx === -1 ? x + 0.02 : x + u;
                  const pz = dz === 1 ? z + 0.98 : dz === -1 ? z + 0.02 : z + u;
                  icicles.push([px, top - 0.02, pz, 0.25 + hash(px * 5, pz * 3) * 0.7]);
                }
              }
            }
          });
        }
      }
    }
  }
  // los salones: vigas de lado a lado (a lo corto), con ménsulas y pilastras
  for (const k of [...HALLS, ...ROOMS]) {
    const [x0, z0, x1, z1] = zoneRects(k)[0];
    const c = ceilOf(k);
    const alongX = x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
    const step = HALLS.includes(k) ? 3 : 2.4;
    const n = Math.max(1, Math.floor(len / step));
    const off = (len - (n - 1) * step) / 2;
    const tall = (a) => {
      for (const e of [alongX ? z0 - 1 : x0 - 1, alongX ? z1 + 1 : x1 + 1]) {
        for (const q of [Math.floor(a - 0.25), Math.floor(a + 0.25)]) {
          const [cx, cz] = alongX ? [q, e] : [e, q];
          if (!w.inside(cx, cz)) continue;
          const d = w.idx(cx, cz);
          if (w.grid[d] === DOOR && w.fy[d] + 2.7 > c - 0.95) return true;
        }
      }
      return false;
    };
    // (el Gran Salón lleva cerchas: ahí van solo las pilastras)
    const trusses = HALLS.includes(k);
    for (let s = 0; s < n; s++) {
      const p = (alongX ? x0 : z0) + off + s * step;
      if (tall(p)) continue;
      if (!trusses) {
        if (alongX) gb.box('beam', p - 0.16, c - 0.5, z0, p + 0.16, c - 0.01, z1 + 1, 1);
        else gb.box('beam', x0, c - 0.5, p - 0.16, x1 + 1, c - 0.01, p + 0.16, 1);
        for (const side of [0, 1]) {
          if (alongX) {
            const zz = side ? z1 + 1 - 0.38 : z0;
            gb.box('castleStone', p - 0.22, c - 0.95, zz, p + 0.22, c - 0.5, zz + 0.38, 1);
          } else {
            const xx = side ? x1 + 1 - 0.38 : x0;
            gb.box('castleStone', xx, c - 0.95, p - 0.22, xx + 0.38, c - 0.5, p + 0.22, 1);
          }
        }
      }
      if (!HALLS.includes(k)) continue;
      for (const side of [0, 1]) {
        const cx = alongX ? Math.floor(p) : side ? x1 : x0;
        const cz = alongX ? (side ? z1 : z0) : Math.floor(p);
        const wx = alongX ? cx : side ? x1 + 1 : x0 - 1;
        const wz = alongX ? (side ? z1 + 1 : z0 - 1) : cz;
        if (!w.inside(wx, wz) || w.grid[w.idx(wx, wz)] !== WALL) continue;
        const fi = w.idx(cx, cz);
        if (w.grid[fi] !== FLOOR || w.rampAt[fi] >= 0 || propAt(cx, cz)) continue;
        let clear = true;
        for (const d of [-1, 1]) {
          const ax = alongX ? wx + d : wx;
          const az = alongX ? wz : wz + d;
          if (w.inside(ax, az) && [DOOR, WINDOW].includes(w.grid[w.idx(ax, az)])) clear = false;
        }
        if (!clear) continue;
        if (covers(alongX ? 'x' : 'z', alongX ? (side ? z1 + 1 : z0) : side ? x1 + 1 : x0, p - 0.4, p + 0.4)) continue;
        const fy = w.fy[fi];
        const dep = 0.3;
        let bx0, bz0, bx1, bz1;
        if (alongX) {
          bx0 = p - 0.3;
          bx1 = p + 0.3;
          bz0 = side ? z1 + 1 - dep : z0;
          bz1 = side ? z1 + 1 : z0 + dep;
        } else {
          bz0 = p - 0.3;
          bz1 = p + 0.3;
          bx0 = side ? x1 + 1 - dep : x0;
          bx1 = side ? x1 + 1 : x0 + dep;
        }
        gb.box('castleStone', bx0, fy, bz0, bx1, c - 0.95, bz1, 1);
        const grow = (a0, a1, gg) => [a0 - gg, a1 + gg];
        const [gx0, gx1] = alongX ? grow(bx0, bx1, 0.08) : [bx0, bx1];
        const [gz0, gz1] = alongX ? [bz0, bz1] : grow(bz0, bz1, 0.08);
        const out = 0.08;
        const ex0 = alongX ? gx0 : side ? gx0 - out : gx0;
        const ex1 = alongX ? gx1 : side ? gx1 : gx1 + out;
        const ez0 = alongX ? (side ? gz0 - out : gz0) : gz0;
        const ez1 = alongX ? (side ? gz1 : gz1 + out) : gz1;
        gb.box('castleStoneDark', ex0, fy, ez0, ex1, fy + 0.4, ez1, 1);
        gb.box('castleStoneDark', ex0, c - 1.15, ez0, ex1, c - 0.95, ez1, 1);
        boxes.push([Math.min(ex0, bx0), fy, Math.min(ez0, bz0), Math.max(ex1, bx1), c - 0.95, Math.max(ez1, bz1)]);
      }
    }
  }
  // contrafuertes en el patio: cada tanto, contra las paredes altas
  for (const k of YARDS) {
    for (const [x0, z0, x1, z1] of zoneRects(k)) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = w.idx(x, z);
          if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || propAt(x, z)) continue;
          DIRS.forEach(([dx, dz]) => {
            const along = dx ? z : x;
            if ((along + (dx ? 1 : 3)) % 5 !== 0) return;
            const nx = x + dx;
            const nz = z + dz;
            if (!w.inside(nx, nz)) return;
            const j = w.idx(nx, nz);
            if (w.grid[j] !== WALL || w.edge[j] !== 0) return;
            const fy = w.fy[i];
            const top = w.top[j];
            if (top - fy < 4) return;
            for (const d of [-1, 1]) {
              const ax = dx ? nx : nx + d;
              const az = dx ? nz + d : nz;
              if (w.inside(ax, az) && [DOOR, WINDOW].includes(w.grid[w.idx(ax, az)])) return;
            }
            const c0 = along + 0.5;
            if (covers(dx ? 'z' : 'x', dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, c0 - 0.45, c0 + 0.45)) return;
            const h1 = fy + (top - fy) * 0.55;
            const h2 = top - 0.35;
            const seg = (dep, y0, y1, half) => {
              const c = 0.5;
              if (dx === 1) return [x + 1 - dep, y0, z + c - half, x + 1, y1, z + c + half];
              if (dx === -1) return [x, y0, z + c - half, x + dep, y1, z + c + half];
              if (dz === 1) return [x + c - half, y0, z + 1 - dep, x + c + half, y1, z + 1];
              return [x + c - half, y0, z, x + c + half, y1, z + dep];
            };
            const low = seg(0.95, fy, h1, 0.42);
            const high = seg(0.55, h1, h2, 0.36);
            gb.box('castleStone', ...low, 1);
            gb.box('castleStone', ...high, 1);
            const cap = (b) => gb.box('snowCap', b[0] - 0.02, b[4], b[2] - 0.02, b[3] + 0.02, b[4] + 0.07, b[5] + 0.02, 1);
            cap(low);
            cap(high);
            boxes.push(low);
          });
        }
      }
    }
  }
  for (const b of boxes) w.addBox(b, { kind: 'prop' });
  return icicles;
}
function drift(gb, x, z, dx, dz, fy, t) {
  let a;
  let b;
  if (dx === 1) {
    a = [x + 1, z + 1];
    b = [x + 1, z];
  } else if (dx === -1) {
    a = [x, z];
    b = [x, z + 1];
  } else if (dz === 1) {
    a = [x, z + 1];
    b = [x + 1, z + 1];
  } else {
    a = [x + 1, z];
    b = [x, z];
  }
  const n = [-dx, -dz];
  const ha = snowH(a[0], a[1]) * t;
  const hb = snowH(b[0], b[1]) * t;
  const D = 1.15 * (0.7 + t * 0.3);
  const mid = D * 0.45;
  const P = (p, d, y) => [p[0] + n[0] * d, fy + y, p[1] + n[1] * d];
  const up = (h) => {
    const l = Math.hypot(h, mid);
    return [n[0] * (h / l), mid / l, n[1] * (h / l)];
  };
  const uvs = (s) => [[0, 0], [s, 0], [s, 0.5], [0, 0.5]];
  gb.quad('snow', P(a, 0, ha), P(b, 0, hb), P(b, mid, hb * 0.55), P(a, mid, ha * 0.55), up((ha + hb) * 0.45), ...uvs(0.5));
  gb.quad('snow', P(a, mid, ha * 0.55), P(b, mid, hb * 0.55), P(b, D, 0.005), P(a, D, 0.005), up((ha + hb) * 0.2), ...uvs(0.5));
}
function icicleMesh(icicles) {
  const geo = new THREE.ConeGeometry(0.045, 1, 5).translate(0, -0.5, 0).rotateX(Math.PI);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdff2ff, roughness: 0.05, metalness: 0.1, emissive: 0x16466a, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
  const inst = new THREE.InstancedMesh(geo, mat, icicles.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  icicles.forEach(([x, y, z, l], k) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k);
    sc.set(0.7 + hash(k, 1) * 0.8, l, 0.7 + hash(k, 2) * 0.8);
    p.set(x, y - l, z);
    m4.compose(p, q, sc);
    inst.setMatrixAt(k, m4);
  });
  inst.computeBoundingSphere();
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.name = 'eclipse:castillo:caramb';
  return inst;
}

// ================= el entramado, las ventanas y los tirajes (castleRooms) =================
const RAIL = 2.95;
const ON_WALL = new Set(['antorcha', 'estandarte', 'tapiz', 'pendon', 'vitral', 'arreos', 'alacena', 'repisa', 'ristras', 'candil', 'chimenea', 'herramientas']);
const TALL = new Set(['estandarte', 'tapiz', 'pendon', 'vitral', 'arreos', 'alacena', 'chimenea']);
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
function quadN(gb, key, a, b, c, d, n, su = 1, sv = 1) {
  _ab.subVectors(b, a);
  _ac.subVectors(c, a);
  const A = [a.x, a.y, a.z];
  const B = [b.x, b.y, b.z];
  const C = [c.x, c.y, c.z];
  const D = [d.x, d.y, d.z];
  const nn = [n.x, n.y, n.z];
  if (_ab.cross(_ac).dot(n) >= 0) gb.quad(key, A, B, C, D, nn, [0, 0], [su, 0], [su, sv], [0, sv]);
  else gb.quad(key, A, D, C, B, nn, [0, 0], [0, sv], [su, sv], [su, 0]);
}
function strut(gb, key, p, q, hw, dep, n) {
  const u = new THREE.Vector3().subVectors(q, p);
  const len = u.length();
  u.normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const V = v.clone().multiplyScalar(hw);
  const d = n.clone().multiplyScalar(dep);
  const b0 = p.clone().sub(V);
  const b1 = q.clone().sub(V);
  const b2 = q.clone().add(V);
  const b3 = p.clone().add(V);
  const [f0, f1, f2, f3] = [b0, b1, b2, b3].map((b) => b.clone().add(d));
  quadN(gb, key, f0, f1, f2, f3, n, len, hw * 2);
  quadN(gb, key, b0, b1, f1, f0, v.clone().negate(), len, dep);
  quadN(gb, key, b3, b2, f2, f3, v, len, dep);
  quadN(gb, key, b0, b3, f3, f0, u.clone().negate(), hw * 2, dep);
  quadN(gb, key, b1, b2, f2, f1, u, hw * 2, dep);
}
const faceN = (F) => (F.axis === 'x' ? new THREE.Vector3(0, 0, F.n) : new THREE.Vector3(F.n, 0, 0));
const faceP = (F, a, y, d = 0) => (F.axis === 'x' ? new THREE.Vector3(a, y, F.at + F.n * d) : new THREE.Vector3(F.at + F.n * d, y, a));
function wbox(gb, key, F, a0, a1, d0, d1, y0, y1) {
  const p = F.at + F.n * d0;
  const q = F.at + F.n * d1;
  if (F.axis === 'x') gb.box(key, a0, y0, Math.min(p, q), a1, y1, Math.max(p, q), 1);
  else gb.box(key, Math.min(p, q), y0, a0, Math.max(p, q), y1, a1, 1);
}
function busyWalls(w) {
  const wall = new Set();
  const front = new Set();
  for (const s of [...(WALL_BUYS || []), ...(PERK_SPOTS || []), ...(BOX_SPOTS || []), POWER].filter(Boolean)) {
    if (!s.cell) continue;
    const [x, z] = s.cell;
    const [fx, fz] = s.face || [0, 0];
    wall.add(w.idx(x, z));
    if (w.inside(x + fx, z + fz)) front.add(w.idx(x + fx, z + fz));
    if (BOX_SPOTS?.includes(s)) {
      const ax = fx ? x : x + 1;
      const az = fx ? z + 1 : z;
      if (w.inside(ax, az)) wall.add(w.idx(ax, az));
      if (w.inside(ax + fx, az + fz)) front.add(w.idx(ax + fx, az + fz));
    }
  }
  return { wall, front };
}
function wallProps(F) {
  const out = [];
  for (const p of PROPS || []) {
    if (!ON_WALL.has(p.type)) continue;
    const [x, z] = p.pos;
    const perp = F.axis === 'x' ? z : x;
    const along = F.axis === 'x' ? x : z;
    if (Math.abs(perp - F.at) > 0.4) continue;
    const half = p.type === 'chimenea' ? 2.1 : p.type === 'alacena' || p.type === 'arreos' ? 1.05 : p.type === 'tapiz' ? 1.2 : 0.5;
    out.push({ a0: along - half, a1: along + half, tall: TALL.has(p.type) });
  }
  return out;
}
function timber(w, gb, k, busy) {
  const c = ceilOf(k);
  const runs = new Map();
  for (const [x0, z0, x1, z1] of zoneRects(k)) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || w.zone[i] < 0 || w.zoneKeys[w.zone[i]] !== k) continue;
        DIRS.forEach(([dx, dz]) => {
          const nx = x + dx;
          const nz = z + dz;
          if (!w.inside(nx, nz)) return;
          const j = w.idx(nx, nz);
          const nt = w.grid[j];
          if ((nt !== WALL && nt !== DOOR && nt !== WINDOW) || w.edge[j] !== 0) return;
          const F = { axis: dx ? 'z' : 'x', at: dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, n: dx ? -dx : -dz };
          const key = `${F.axis}${F.at}${F.n}`;
          if (!runs.has(key)) runs.set(key, { F, cells: new Map(), fy: w.fy[i] });
          runs.get(key).cells.set(dx ? z : x, { nt, busy: busy.wall.has(j) || busy.front.has(i) });
        });
      }
    }
  }
  for (const { F, cells, fy } of runs.values()) {
    const n = faceN(F);
    const hung = wallProps(F);
    const hangAt = (a0, a1, tallOnly) => hung.some((h) => h.a1 > a0 && h.a0 < a1 && (!tallOnly || h.tall));
    const keys = [...cells.keys()].sort((a, b) => a - b);
    const segs = [];
    for (const a of keys) {
      const last = segs[segs.length - 1];
      if (last && a === last[1] + 1) last[1] = a;
      else segs.push([a, a]);
    }
    const yB = fy + 1.02;
    const yR = fy + RAIL;
    const yT = c - 0.32;
    for (const [s0, s1] of segs) {
      wbox(gb, 'beam', F, s0, s1 + 1, 0, 0.06, yR, yR + 0.18);
      const free = (a) => cells.get(a)?.nt === WALL && !cells.get(a).busy;
      const posts = [];
      if (free(s0)) posts.push(s0 + 0.1);
      if (free(s1)) posts.push(s1 + 0.9);
      for (let a = s0; a <= s1; a++) {
        const t = cells.get(a).nt;
        if (t === DOOR || t === WINDOW) {
          if (free(a - 1)) posts.push(a - 0.1);
          if (free(a + 1)) posts.push(a + 1.1);
        } else if (a % 2 === 0 && free(a)) posts.push(a + 0.5);
      }
      posts.sort((p, q) => p - q);
      const P = [];
      for (const p of posts) {
        if (hangAt(p - 0.12, p + 0.12, false)) continue;
        if (!P.length || p - P[P.length - 1] > 0.45) P.push(p);
      }
      for (const p of P) wbox(gb, 'beam', F, p - 0.1, p + 0.1, 0, 0.07, yB, yT);
      for (let q = 0; q + 1 < P.length; q++) {
        const a0 = P[q] + 0.1;
        const a1 = P[q + 1] - 0.1;
        if (a1 - a0 < 0.8 || a1 - a0 > 2.8 || hangAt(a0, a1, true)) continue;
        const flip = Math.floor(P[q]) % 4 < 2;
        const lo = yR + 0.2;
        const hi = yT - 0.02;
        const A = faceP(F, flip ? a1 - 0.06 : a0 + 0.06, lo, 0);
        const Bq = faceP(F, flip ? a0 + 0.06 : a1 - 0.06, hi, 0);
        strut(gb, 'beam', A, Bq, 0.075, 0.05, n);
      }
    }
  }
}
let WM = null;
function windowMats() {
  if (WM) return WM;
  const tex = canvasTex('eclCastleWinLit', 64, 96, (ctx, W, H) => {
    const gg = ctx.createLinearGradient(0, 0, 0, H);
    gg.addColorStop(0, '#ffd890');
    gg.addColorStop(1, '#c8641e');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(90,40,10,0.35)';
    ctx.fillRect(W * 0.55, H * 0.3, W * 0.3, H * 0.7);
    ctx.fillStyle = '#1a100a';
    ctx.fillRect(W / 2 - 2, 0, 4, H);
    ctx.fillRect(0, H * 0.45, W, 4);
    ctx.strokeStyle = '#1a100a';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, W, H);
  });
  WM = {
    lit: new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.3, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.2, metalness: 0.3 }),
  };
  return WM;
}
function facades(w, gb, keys) {
  for (const k of keys) {
    for (const [x0, z0, x1, z1] of zoneRects(k)) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = w.idx(x, z);
          if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || w.zone[i] < 0 || w.zoneKeys[w.zone[i]] !== k) continue;
          const fy = w.fy[i];
          DIRS.forEach(([dx, dz]) => {
            const nx = x + dx;
            const nz = z + dz;
            if (!w.inside(nx, nz)) return;
            const j = w.idx(nx, nz);
            const nt = w.grid[j];
            let top;
            if (nt === WALL && w.edge[j] === 0) top = w.top[j];
            else if (nt === FLOOR && w.rampAt[j] < 0 && w.fy[j] - fy > 5) top = w.fy[j];
            else return;
            const h = top - fy;
            if (h < 6) return;
            const F = { axis: dx ? 'z' : 'x', at: dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, n: dx ? -dx : -dz };
            const a = dx ? z : x;
            const hung = wallProps(F).filter((p) => p.a1 > a - 0.6 && p.a0 < a + 1.6);
            if (!hung.length) {
              wbox(gb, 'castleStoneDark', F, a, a + 1, 0, 0.13, fy + 3.9, fy + 4.12);
              wbox(gb, 'snowCap', F, a, a + 1, 0, 0.14, fy + 4.12, fy + 4.17);
            }
            if (a % 3 !== 1 || hung.length) return;
            for (const d of [-1, 1]) {
              const sx = dx ? x : x + d;
              const sz = dx ? z + d : z;
              const tx = dx ? nx : nx + d;
              const tz = dx ? nz + d : nz;
              if (!w.inside(sx, sz) || !w.inside(tx, tz)) return;
              if (w.grid[w.idx(sx, sz)] !== FLOOR || w.rampAt[w.idx(sx, sz)] >= 0) return;
              const tt = w.grid[w.idx(tx, tz)];
              if (tt === DOOR || tt === WINDOW) return;
            }
            for (let d = -1; d <= 1; d++) {
              const sx = dx ? x : x + d;
              const sz = dx ? z + d : z;
              if (!w.inside(sx, sz)) continue;
              for (const b of w.cellBoxes[w.idx(sx, sz)]) {
                if (b.kind !== 'prop' || !b.active) continue;
                const touch = F.axis === 'x' ? Math.min(Math.abs(b.z0 - F.at), Math.abs(b.z1 - F.at)) : Math.min(Math.abs(b.x0 - F.at), Math.abs(b.x1 - F.at));
                const b0 = F.axis === 'x' ? b.x0 : b.z0;
                const b1 = F.axis === 'x' ? b.x1 : b.z1;
                if (touch < 0.05 && b0 < a + 1.6 && b1 > a - 0.6) return;
              }
            }
            const bx = nx + dx;
            const bz = nz + dz;
            const bi = w.inside(bx, bz) ? w.idx(bx, bz) : -1;
            const room = nt === WALL && bi >= 0 && w.grid[bi] === FLOOR && w.zone[bi] >= 0 && !ZONES[w.zoneKeys[w.zone[bi]]].outdoor;
            const c = a + 0.5;
            const rows = h > 11.5 ? [4.7, 8.7] : [4.7];
            rows.forEach((y0, row) => {
              const Y = fy + y0;
              if (!room) {
                wbox(gb, 'black', F, c - 0.07, c + 0.07, 0, 0.015, Y, Y + 1.1);
                wbox(gb, 'castleStoneDark', F, c - 0.2, c - 0.07, 0, 0.08, Y - 0.08, Y + 1.18);
                wbox(gb, 'castleStoneDark', F, c + 0.07, c + 0.2, 0, 0.08, Y - 0.08, Y + 1.18);
                wbox(gb, 'castleStoneDark', F, c - 0.2, c + 0.2, 0, 0.1, Y - 0.14, Y);
                wbox(gb, 'snowCap', F, c - 0.2, c + 0.2, 0, 0.11, Y, Y + 0.04);
                return;
              }
              const lit = (Math.floor(a / 3) + row + (dx + dz > 0 ? 1 : 0)) % 3 !== 2;
              const W2 = 0.42;
              const H2 = 1.35;
              const p0 = faceP(F, c - W2, Y, 0.015);
              const p1 = faceP(F, c + W2, Y, 0.015);
              const p2 = faceP(F, c + W2, Y + H2, 0.015);
              const p3 = faceP(F, c - W2, Y + H2, 0.015);
              quadN(gb, lit ? 'winLit' : 'winDark', p0, p1, p2, p3, faceN(F));
              wbox(gb, 'castleStoneDark', F, c - W2 - 0.12, c - W2, 0, 0.1, Y - 0.05, Y + H2 + 0.05);
              wbox(gb, 'castleStoneDark', F, c + W2, c + W2 + 0.12, 0, 0.1, Y - 0.05, Y + H2 + 0.05);
              wbox(gb, 'castleStoneDark', F, c - W2 - 0.18, c + W2 + 0.18, 0, 0.14, Y + H2, Y + H2 + 0.2);
              wbox(gb, 'castleStoneDark', F, c - W2 - 0.16, c + W2 + 0.16, 0, 0.18, Y - 0.12, Y);
              wbox(gb, 'snowCap', F, c - W2 - 0.14, c + W2 + 0.14, 0, 0.19, Y, Y + 0.05);
              wbox(gb, 'snowCap', F, c - W2 - 0.16, c + W2 + 0.16, 0, 0.15, Y + H2 + 0.2, Y + H2 + 0.26);
              if (lit) {
                wbox(gb, 'woodDark', F, c - W2 - 0.62, c - W2 - 0.14, 0, 0.05, Y, Y + H2);
                wbox(gb, 'woodDark', F, c + W2 + 0.14, c + W2 + 0.62, 0, 0.05, Y, Y + H2);
              } else {
                wbox(gb, 'woodDark', F, c - W2, c - 0.01, 0.02, 0.07, Y, Y + H2);
                wbox(gb, 'woodDark', F, c + 0.01, c + W2, 0.02, 0.07, Y, Y + H2);
                wbox(gb, 'iron', F, c - W2 + 0.04, c + W2 - 0.04, 0.07, 0.09, Y + H2 * 0.3, Y + H2 * 0.3 + 0.05);
                wbox(gb, 'iron', F, c - W2 + 0.04, c + W2 - 0.04, 0.07, 0.09, Y + H2 * 0.7, Y + H2 * 0.7 + 0.05);
              }
            });
          });
        }
      }
    }
  }
}
function chimneys(w, gb, isl) {
  for (const p of PROPS || []) {
    if (p.type !== 'chimenea' || !inBox(isl, p.pos[0], p.pos[1])) continue;
    const rot = p.rot || 0;
    const bx = p.pos[0] - Math.sin(rot) * 0.6;
    const bz = p.pos[1] - Math.cos(rot) * 0.6;
    const cx = Math.floor(bx);
    const cz = Math.floor(bz);
    if (!w.inside(cx, cz) || w.grid[w.idx(cx, cz)] !== WALL) continue;
    const top = w.top[w.idx(cx, cz)];
    // (a lo largo de la pared: si la chimenea mira a z, la pared corre en x)
    const alongX = Math.abs(Math.cos(rot)) > 0.5;
    const x = alongX ? p.pos[0] : cx + 0.5;
    const z = alongX ? cz + 0.5 : p.pos[1];
    const hx = alongX ? 0.55 : 0.45;
    const hz = alongX ? 0.45 : 0.55;
    const y0 = top - 0.4;
    const y1 = top + 2.4;
    gb.box('castleStone', x - hx, y0, z - hz, x + hx, y1, z + hz, 1);
    gb.box('castleStoneDark', x - hx - 0.1, y1, z - hz - 0.1, x + hx + 0.1, y1 + 0.14, z + hz + 0.1, 1);
    gb.box('black', x - hx + 0.17, y1 + 0.14, z - hz + 0.17, x + hx - 0.17, y1 + 0.16, z + hz - 0.17, 1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box('castleStoneDark', x + sx * (hx - 0.05) - 0.06, y1 + 0.14, z + sz * (hz - 0.05) - 0.06, x + sx * (hx - 0.05) + 0.06, y1 + 0.5, z + sz * (hz - 0.05) + 0.06, 1);
    gb.box('castleStoneDark', x - hx - 0.15, y1 + 0.5, z - hz - 0.15, x + hx + 0.15, y1 + 0.62, z + hz + 0.15, 1);
    gb.box('snowCap', x - hx - 0.13, y1 + 0.62, z - hz - 0.13, x + hx + 0.13, y1 + 0.72, z + hz + 0.13, 1);
  }
}

// ================= las cerchas del Gran Salón (castleHalls) =================
function bar(gb, key, x, a, b, h) {
  const [za, ya] = a;
  const [zb, yb] = b;
  const L = Math.hypot(zb - za, yb - ya) || 1;
  const nz = -(yb - ya) / L;
  const ny = (zb - za) / L;
  const P = (z, y, sx, sn) => [x + sx * h, y + ny * sn * h, z + nz * sn * h];
  const faces = [
    [P(za, ya, -1, 1), P(zb, yb, -1, 1), P(zb, yb, 1, 1), P(za, ya, 1, 1), [0, ny, nz]],
    [P(za, ya, -1, -1), P(zb, yb, -1, -1), P(zb, yb, 1, -1), P(za, ya, 1, -1), [0, -ny, -nz]],
    [P(za, ya, 1, -1), P(zb, yb, 1, -1), P(zb, yb, 1, 1), P(za, ya, 1, 1), [1, 0, 0]],
    [P(za, ya, -1, -1), P(zb, yb, -1, -1), P(zb, yb, -1, 1), P(za, ya, -1, 1), [-1, 0, 0]],
  ];
  for (const [p0, p1, p2, p3, hint] of faces) quadUV(gb, key, [p0, p1, p2, p3], [[0, 0], [L / 1.5, 0], [L / 1.5, 0.3], [0, 0.3]], hint);
}
function halls(w, gb, k) {
  const Z = ZONES[k];
  const S = tpShift(k);
  if (!S) return;
  const [, z0, , z1] = zoneRects(k)[0];
  const D = { fy: Z.y, ceil: Z.roof, z0, z1: z1 + 1, trusses: [49, 54, 58].map((x) => x + S.dx) };
  const tie = D.fy + 6.2;
  const mid = (D.z0 + D.z1) / 2;
  const apex = D.ceil - 0.55;
  for (const x of D.trusses) {
    gb.box('beam', x - 0.15, tie, D.z0, x + 0.15, tie + 0.36, D.z1, 1);
    for (const z of [D.z0, D.z1 - 0.55]) {
      gb.box('castleStone', x - 0.24, tie - 0.6, z, x + 0.24, tie, z + 0.55, 1);
      gb.box('castleStoneDark', x - 0.28, tie - 0.72, z - (z === D.z0 ? 0 : 0.03), x + 0.28, tie - 0.6, z + 0.58, 1);
    }
    gb.box('beam', x - 0.13, tie + 0.36, mid - 0.13, x + 0.13, apex + 0.3, mid + 0.13, 1);
    bar(gb, 'beam', x, [D.z0 + 0.3, tie + 0.36], [mid, apex], 0.12);
    bar(gb, 'beam', x, [D.z1 - 0.3, tie + 0.36], [mid, apex], 0.12);
    const q = (za) => [za + (mid - za) * 0.5, tie + 0.36 + (apex - tie - 0.36) * 0.5];
    bar(gb, 'beam', x, [mid - 0.1, tie + 0.6], q(D.z0 + 0.3), 0.08);
    bar(gb, 'beam', x, [mid + 0.1, tie + 0.6], q(D.z1 - 0.3), 0.08);
    gb.box('iron', x - 0.16, tie + 0.3, mid - 0.2, x + 0.16, tie + 0.62, mid + 0.2, 1);
  }
}

// ================= lo de Eclipse =================
// Las paredes de la isla: la cara de afuera que da al vacío (o a un piso de
// otra isla) y la tapa de arriba, que Levels arma con 'exterior' y 'wallTop'
// (en Eclipse, el travertino del Monumento), forradas de granito 4 cm afuera,
// con su nieve arriba. (Las caras que dan al patio salen del LOOK de castillo.py.)
function cladOutside(w, gb, mine, isMine) {
  const O = 0.04;
  const own = (i) => {
    for (const [dx, dz] of [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (isMine(i + dx + dz * w.W)) return true;
    return false;
  };
  for (const k of mine) {
    const [x0, z0, x1, z1] = bounds(k);
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!w.inside(x, z)) continue;
        const i = w.idx(x, z);
        if (w.grid[i] !== WALL || w.edge[i] !== 0 || !own(i) || w.__eclClad?.has(i)) continue;
        (w.__eclClad ||= new Set()).add(i);
        const top = w.top[i];
        // la tapa (piedra) con la nieve
        gb.box('castleStoneDark', x - 0.005, top + 0.004, z - 0.005, x + 1.005, top + 0.1, z + 1.005, 1);
        gb.box('snowCap', x + 0.04, top + 0.1, z + 0.04, x + 0.96, top + 0.16, z + 0.96, 1);
        for (const [dx, dz] of DIRS) {
          const nx = x + dx;
          const nz = z + dz;
          const j = w.inside(nx, nz) ? w.idx(nx, nz) : -1;
          if (j >= 0 && w.grid[j] !== OUT) continue;
          const lo = w.fy[i] - 2.4;
          const mx = x + 0.5 + dx * (0.5 + O);
          const mz = z + 0.5 + dz * (0.5 + O);
          const ax = mx - dz * (0.5 + O);
          const az = mz + dx * (0.5 + O);
          const bx = mx + dz * (0.5 + O);
          const bz = mz - dx * (0.5 + O);
          gb.wall('castleStone', ax, az, bx, bz, lo, top + 0.004, [dx, 0, dz], 2, ax * -dz + az * dx);
        }
      }
    }
  }
}
const bounds = (k) => {
  const R = zoneRects(k);
  return [Math.min(...R.map((r) => r[0])), Math.min(...R.map((r) => r[1])), Math.max(...R.map((r) => r[2])), Math.max(...R.map((r) => r[3]))];
};
// Almenas arriba de las paredes bajas del patio que dan al vacío (la muralla
// del sur, de 3,6 m): un merlón cada dos celdas, con nieve.
function battlements(w, gb, k, isMine) {
  if (!k) return;
  const [x0, z0, x1, z1] = bounds(k);
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] !== WALL || w.edge[i] !== 0) continue;
      let toPatio = false;
      let toVoid = false;
      for (const [dx, dz] of DIRS) {
        const j = w.idx(x + dx, z + dz);
        if (isMine(j) && w.zoneKeys[w.zone[j]] === k) toPatio = true;
        if (w.grid[j] === OUT) toVoid = true;
      }
      const top = w.top[i];
      if (!toPatio || !toVoid || top - w.fy[i] > 5) continue;
      if ((x + z) % 2) continue;
      gb.box('castleStone', x + 0.06, top + 0.1, z + 0.06, x + 0.94, top + 0.95, z + 0.94, 1);
      gb.box('snowCap', x + 0.04, top + 0.95, z + 0.04, x + 0.96, top + 1.02, z + 0.96, 1);
    }
  }
}
// Las barandas de piedra de las escaleras (en el castillo, w.dropEdge las
// hacía de piedra; acá Levels pone caños de hierro, una tira derecha por celda
// a la altura del medio de la celda): un murete escalonado, un tramo por celda
// a la altura de la punta alta (así tapa los caños entero), con su tapa y nieve.
function stairRails(w, gb, mine) {
  for (const R of RAMPS) {
    const [x0, z0, x1, z1] = R.rect;
    const k = w.zone[w.idx(x0, z0)] >= 0 ? w.zoneKeys[w.zone[w.idx(x0, z0)]] : null;
    if (!mine.includes(k)) continue;
    const alongX = R.dir[1] === 'x';
    const len = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
    for (const side of [0, 1]) {
      const s = alongX ? (side ? z1 + 1 : z0) : side ? x1 + 1 : x0;
      const probe = alongX ? w.idx(Math.floor((x0 + x1) / 2), side ? z1 + 1 : z0 - 1) : w.idx(side ? x1 + 1 : x0 - 1, Math.floor((z0 + z1) / 2));
      if (w.grid[probe] !== FLOOR) continue;
      const hw = 0.17;
      const lo = w.fy[probe] - 0.05;
      const out = !!ZONES[k].outdoor;
      const yAt = (a) => (alongX ? rampY(R, x0 + a, z0 + 0.5) : rampY(R, x0 + 0.5, z0 + a));
      if (!out) {
        // adentro (la caballeriza, la cocina): el costado de la escalera de
        // piedra (2 cm afuera de la cara de Levels) y una baranda de madera
        // abierta: pasamanos, zócalo y balaustres cada 30 cm
        const dir = side ? 1 : -1;
        const f = s + dir * 0.02;
        for (let c = 0; c < len; c++) {
          const ya = yAt(c + 0.001);
          const yb = yAt(c + 0.999);
          const P = (a, yy, d = 0) => (alongX ? [x0 + a, yy, f + dir * d] : [f + dir * d, yy, z0 + a]);
          const n = alongX ? [0, 0, dir] : [dir, 0, 0];
          quad(gb, 'castleStone', [P(c, lo), P(c + 1, lo), P(c + 1, yb), P(c, ya)], n);
        }
        const rail = (y0, h, w2, key) => {
          const ya = yAt(0.001);
          const yb = yAt(len - 0.001);
          const L = len;
          const P = (a, yy, d) => (alongX ? [x0 + a, yy, s + d] : [s + d, yy, z0 + a]);
          for (const [d0, n] of [[-w2, -1], [w2, 1]]) quad(gb, key, [P(0, ya + y0, d0), P(L, yb + y0, d0), P(L, yb + y0 + h, d0), P(0, ya + y0 + h, d0)], alongX ? [0, 0, n] : [n, 0, 0]);
          quad(gb, key, [P(0, ya + y0 + h, -w2), P(L, yb + y0 + h, -w2), P(L, yb + y0 + h, w2), P(0, ya + y0 + h, w2)], [0, 1, 0]);
        };
        rail(1.08, 0.1, 0.06, 'woodDark');
        rail(0.02, 0.14, 0.05, 'woodDark');
        for (let a = 0.15; a < len; a += 0.3) {
          const yy = yAt(a);
          const [bx, bz] = alongX ? [x0 + a, s] : [s, z0 + a];
          gb.box('woodDark', bx - 0.025, yy + 0.1, bz - 0.025, bx + 0.025, yy + 1.08, bz + 0.025, 1);
        }
        continue;
      }
      for (let c = 0; c < len; c++) {
        const top = Math.max(yAt(c + 0.001), yAt(c + 0.999)) + 1.15;
        const A = c;
        const Bq = c + 1;
        if (alongX) {
          gb.box('castleStone', x0 + A, lo, s - hw, x0 + Bq, top, s + hw, 1);
          gb.box('castleStoneDark', x0 + A - 0.01, top, s - hw - 0.03, x0 + Bq + 0.01, top + 0.07, s + hw + 0.03, 1);
          gb.box('snowCap', x0 + A + 0.02, top + 0.07, s - hw + 0.01, x0 + Bq - 0.02, top + 0.12, s + hw - 0.01, 1);
        } else {
          gb.box('castleStone', s - hw, lo, z0 + A, s + hw, top, z0 + Bq, 1);
          gb.box('castleStoneDark', s - hw - 0.03, top, z0 + A - 0.01, s + hw + 0.03, top + 0.07, z0 + Bq + 0.01, 1);
          gb.box('snowCap', s - hw + 0.01, top + 0.07, z0 + A + 0.02, s + hw - 0.01, top + 0.12, z0 + Bq - 0.02, 1);
        }
      }
    }
  }
}
// Grietas de la disformidad en las paredes de afuera: rajas con la luz violeta.
function cracks(w, root, mine, isMine, r) {
  let n = 0;
  for (const k of mine) {
    const [x0, z0, x1, z1] = bounds(k);
    for (let z = z0 - 1; z <= z1 + 1 && n < 14; z++) {
      for (let x = x0 - 1; x <= x1 + 1 && n < 14; x++) {
        if (!w.inside(x, z) || r() > 0.08) continue;
        const i = w.idx(x, z);
        if (w.grid[i] !== WALL || w.edge[i] !== 0) continue;
        for (const [dx, dz] of DIRS) {
          const j = w.idx(x + dx, z + dz);
          if (w.grid[j] !== OUT) continue;
          const top = w.top[i];
          const fy = w.fy[i];
          if (top - fy < 3) continue;
          wallCrack(root, x + 0.5 + dx * 0.55, z + 0.5 + dz * 0.55, [dx, dz], fy + 0.6 + r() * 0.8, top - 0.4 - r() * 1.2, 0.45 + r() * 0.3);
          n++;
          break;
        }
      }
    }
  }
}
// El torreón suelto (Q9): un pedazo de la muralla arrancado con un torreón
// redondo partido arriba, inclinado; el techo en punta flotando más arriba.
function torreonSuelto(w, orbs) {
  if (!ZONES.Q9) return;
  const F = fragment(w, 'Q9', { tilt: [0.09, 0.5, -0.12], top: 'snowPave', thick: 4.4, seed: 17 });
  const gb = new GeoBuilder();
  const R = 1.55;
  const cx = 0.2;
  const cz = -0.3;
  const top = 6.8;
  const n = 18;
  ring(gb, 'castleStone', cx, cz, R + 0.3, R, -0.6, 0.8, n);
  ring(gb, 'castleStone', cx, cz, R, R, 0.8, top, n);
  // la punta partida: almenas de alturas distintas, como mordidas
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const h = 0.4 + hash(k, 3) * 1.4;
    if (hash(k, 9) < 0.3) continue;
    const px = cx + Math.cos(a) * (R - 0.1);
    const pz = cz + Math.sin(a) * (R - 0.1);
    gb.box('castleStone', px - 0.32, top, pz - 0.32, px + 0.32, top + h, pz + 0.32, 1);
  }
  ring(gb, 'castleStoneDark', cx, cz, R + 0.08, R + 0.08, 2.4, 2.58, n);
  for (const yy of [1.6, 4.4]) gb.box('winLit', cx + R - 0.02, yy, cz - 0.07, cx + R + 0.03, yy + 0.8, cz + 0.07, 1);
  // un tramo de muralla con almenas al lado, cortado
  gb.box('castleStone', cx - 3.6, -0.6, cz + 0.8, cx - 0.9, 3.1, cz + 1.7, 1);
  for (let k = 0; k < 3; k++) gb.box('castleStone', cx - 3.5 + k * 0.95, 3.1, cz + 0.85, cx - 3.0 + k * 0.95, 3.8, cz + 1.65, 1);
  F.g.add(gb.build({ ...w.M, winLit: windowMats().lit }));
  // el techo en punta, arrancado, flotando arriba e inclinado
  const roofG = new GeoBuilder();
  const rr = R + 0.55;
  const peak = R * 2.6 + 1.2;
  ring(roofG, 'slate', 0, 0, rr, 0.001, 0, peak, n);
  ring(roofG, 'snowCap', 0, 0, rr + 0.03, (rr + 0.03) * 0.55, 0.03, peak * 0.45, n);
  const roof = roofG.build(w.M);
  roof.position.set(cx + 0.6, top + 3.2, cz - 0.4);
  roof.rotation.set(0.35, 0, -0.28);
  F.g.add(roof);
  F.g.updateMatrixWorld(true);
  F.finish();
  const Z = ZONES.Q9;
  orbs.push({ c: [F.g.position.x, Z.y + 3, F.g.position.z], r: [3.6, 5.8], h: 4, n: 9, s: [0.14, 0.36], sp: 0.25 });
}
