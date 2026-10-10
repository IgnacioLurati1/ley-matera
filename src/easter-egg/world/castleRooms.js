import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { MAP_W, MAP_H, WALL_H, ZONES, zoneRects, WALL_BUYS, PERK_SPOTS, BOX_SPOTS, POWER, PAP, PROPS, ACT } from '../config/map';
import { mesh, boxGeo, cylGeo, compactGroup } from './props';
import { canvasTex } from './penalProps';
import { flame, emberMat } from './castleFire';
import { guarda, glyph } from './castleDecor';
import { lean } from './castleLean';

// El castillo por dentro, para que las salas no se vean peladas:
//  · el entramado de madera en las paredes revocadas de la caballeriza y de
//    la cocina: postes, la solera arriba de las puertas y las diagonales;
//  · la biblioteca de dos pisos: estanterías llenas de libros hasta el
//    techo y una galería de tablas con baranda alrededor, colgada de
//    ménsulas;
//  · utilería nueva (ROOMS): las cuadras con los caballos congelados, los
//    arreos, la escalera de la biblioteca, el globo, la mesa del mapa, el
//    horno de barro, la alacena, las repisas, las ristras, los candiles y lo
//    de las termas (el quincho, los faroles, los baldes, el tendedero con
//    ponchos y los bancos).
// Lo de las paredes se junta en pocas mallas (GeoBuilder, una por material).

const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const WINDOW = 4;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// las salas con entramado (paredes revocadas y techo de 6 m)
const TIMBER = ['B', 'E'];
// la solera: arriba de las puertas (2.7) y de las ventanas (2.35)
const RAIL = 2.95;
// la utilería que cuelga de las paredes: ahí no van postes ni diagonales
const ON_WALL = new Set(['antorcha', 'estandarte', 'tapiz', 'pendon', 'vitral', 'arreos', 'alacena', 'repisa', 'ristras', 'candil', 'chimenea', 'herramientas']);
const TALL = new Set(['estandarte', 'tapiz', 'pendon', 'vitral', 'arreos', 'alacena', 'chimenea']);

const ceilOf = (k) => ZONES[k].roof ?? (ZONES[k].y || 0) + WALL_H;

// ---------------- ayudas de geometría ----------------
// Quad con la vuelta que corresponde a su normal (así no importa el orden).
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

// Una viga de p a q (Vector3) de `hw` de media anchura, que sale `dep` hacia n.
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

// Una cara de pared: corre a lo largo de `axis` ('x' o 'z'), está en `at`
// (la coordenada de la cara) y `n` (+1 o -1) apunta hacia adentro de la sala.
const faceN = (F) => (F.axis === 'x' ? new THREE.Vector3(0, 0, F.n) : new THREE.Vector3(F.n, 0, 0));
const faceP = (F, a, y, d = 0) => (F.axis === 'x' ? new THREE.Vector3(a, y, F.at + F.n * d) : new THREE.Vector3(F.at + F.n * d, y, a));
// Caja pegada a la pared: a lo largo de [a0, a1], de d0 a d1 hacia adentro, de y0 a y1.
function wbox(gb, key, F, a0, a1, d0, d1, y0, y1) {
  const p = F.at + F.n * d0;
  const q = F.at + F.n * d1;
  if (F.axis === 'x') gb.box(key, a0, y0, Math.min(p, q), a1, y1, Math.max(p, q), 1);
  else gb.box(key, Math.min(p, q), y0, a0, Math.max(p, q), y1, a1, 1);
}

// Las celdas de pared ocupadas por paredes compradas, perks, la caja, la luz.
function busyWalls(w) {
  const wall = new Set();
  const front = new Set();
  for (const s of [...(WALL_BUYS || []), ...(PERK_SPOTS || []), ...(BOX_SPOTS || []), POWER].filter(Boolean)) {
    if (!s.cell) continue;
    const [x, z] = s.cell;
    const [fx, fz] = s.face || [0, 0];
    wall.add(w.idx(x, z));
    if (w.inside(x + fx, z + fz)) front.add(w.idx(x + fx, z + fz));
    // la caja misteriosa ocupa dos celdas de pared
    if (BOX_SPOTS?.includes(s)) {
      const ax = fx ? x : x + 1;
      const az = fx ? z + 1 : z;
      if (w.inside(ax, az)) wall.add(w.idx(ax, az));
      if (w.inside(ax + fx, az + fz)) front.add(w.idx(ax + fx, az + fz));
    }
  }
  return { wall, front };
}

// Lo colgado de una cara: { a: celda a lo largo, tall }
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

// Lo que no se puede tapar en las caras de las paredes (para las pilastras y
// los contrafuertes de castleTrim): las perks, las paredes compradas, la caja,
// la luz, el Pack-a-Pava y lo colgado. { axis, at, a0, a1 }, como las caras.
const HANG_W = { chimenea: 4.2, alacena: 2.1, arreos: 2.1, tapiz: 2.4, estandarte: 1.1, pendon: 1.1, vitral: 1.4 };
export function wallSpans() {
  const out = [];
  const acts = [...(ACT?.jars || []), ...(ACT?.traps || []).map((t) => t.lever)];
  for (const s of [...(WALL_BUYS || []), ...(PERK_SPOTS || []), ...(BOX_SPOTS || []), POWER, PAP, ...acts].filter(Boolean)) {
    if (!s.cell || !s.face) continue;
    const [x, z] = s.cell;
    const [fx, fz] = s.face;
    const n = s.width || (BOX_SPOTS?.includes(s) ? 2 : 1);
    if (fz) out.push({ axis: 'x', at: fz > 0 ? z + 1 : z, a0: x - 0.1, a1: x + n + 0.1 });
    else out.push({ axis: 'z', at: fx > 0 ? x + 1 : x, a0: z - 0.1, a1: z + n + 0.1 });
  }
  for (const p of PROPS || []) {
    if (!ON_WALL.has(p.type)) continue;
    const [x, z] = p.pos;
    const half = (p.w || HANG_W[p.type] || 0.8) / 2;
    // de frente a z (sin girar o dado vuelta): cuelga de una cara a lo largo de x
    if (Math.abs(Math.sin(p.rot || 0)) < 0.5) out.push({ axis: 'x', at: Math.round(z), a0: x - half, a1: x + half });
    else out.push({ axis: 'z', at: Math.round(x), a0: z - half, a1: z + half });
  }
  return out;
}

// ---------------- el entramado ----------------
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
      // la solera, de punta a punta del tramo
      wbox(gb, 'beam', F, s0, s1 + 1, 0, 0.06, yR, yR + 0.18);
      const free = (a) => cells.get(a)?.nt === WALL && !cells.get(a).busy;
      const posts = [];
      if (free(s0)) posts.push(s0 + 0.1);
      if (free(s1)) posts.push(s1 + 0.9);
      for (let a = s0; a <= s1; a++) {
        const t = cells.get(a).nt;
        if (t === DOOR || t === WINDOW) {
          // los pies derechos que enmarcan la abertura
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
      // las diagonales de arriba: una por paño, alternadas (/ \ / \)
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

// ---------------- la biblioteca ----------------
// Libros pintados: cuatro estantes distintos (0.5 m cada uno) en una textura
// que se repite (2 m de ancho por 2 m de alto).
let BOOKS = null;
function booksMat() {
  if (BOOKS) return BOOKS;
  const tex = canvasTex('castleBooks', 1024, 512, (ctx, W, H) => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const COLS = ['#5a1a14', '#6e2a18', '#1e3a2a', '#23304a', '#4a3420', '#2a1c12', '#6a5020', '#3a1830', '#16120f', '#7a6a4a', '#2c4a3a', '#5a3a1a'];
    const ROW = H / 4;
    ctx.fillStyle = '#0c0806';
    ctx.fillRect(0, 0, W, H);
    for (let row = 0; row < 4; row++) {
      const base = (row + 1) * ROW - 6;
      let x = 0;
      while (x < W - 4) {
        const k = rnd();
        if (k < 0.035) {
          x += 12 + rnd() * 30;
          continue;
        }
        if (k < 0.07) {
          // una pila acostada
          const n = 3 + Math.floor(rnd() * 3);
          let y = base;
          const wd = 40 + rnd() * 30;
          for (let s = 0; s < n; s++) {
            const h = 8 + rnd() * 6;
            ctx.fillStyle = COLS[Math.floor(rnd() * COLS.length)];
            ctx.fillRect(x + rnd() * 5, y - h, wd, h - 1);
            ctx.fillStyle = 'rgba(214,178,90,0.6)';
            ctx.fillRect(x + 4, y - h / 2 - 1, wd - 8, 1);
            y -= h;
          }
          x += wd + 8;
          continue;
        }
        const bw = 9 + Math.floor(rnd() * 13);
        const bh = ROW * (0.6 + rnd() * 0.3);
        const col = COLS[Math.floor(rnd() * COLS.length)];
        ctx.save();
        // alguno inclinado contra el de al lado
        if (k > 0.965) {
          ctx.translate(x, base);
          ctx.rotate(-0.25);
          ctx.translate(-x, -base);
        }
        ctx.fillStyle = col;
        ctx.fillRect(x, base - bh, bw - 1, bh);
        ctx.fillStyle = 'rgba(255,240,210,0.09)';
        ctx.fillRect(x, base - bh, 2, bh);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(x + bw - 3, base - bh, 2, bh);
        ctx.fillStyle = 'rgba(214,178,90,0.7)';
        const nb = 1 + Math.floor(rnd() * 3);
        for (let b = 0; b < nb; b++) ctx.fillRect(x + 1, base - bh + 6 + b * 5, bw - 3, 2);
        ctx.fillRect(x + 1, base - 10, bw - 3, 2);
        if (rnd() < 0.45) {
          ctx.fillStyle = 'rgba(18,12,8,0.55)';
          ctx.fillRect(x + 2, base - bh * 0.62, bw - 5, 11);
        }
        ctx.restore();
        x += bw;
      }
      // la sombra del estante de arriba
      const sh = ctx.createLinearGradient(0, row * ROW, 0, row * ROW + 46);
      sh.addColorStop(0, 'rgba(0,0,0,0.8)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(0, row * ROW, W, 46);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  BOOKS = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
  return BOOKS;
}

// Estanterías a lo largo de una cara, en los tramos [a0, a1], de y0 a y1.
function shelves(gb, F, spans, y0, y1, plinth) {
  const DEP = 0.36;
  const bot = y0 + (plinth ? 0.12 : 0.02);
  for (const [a0, a1] of spans) {
    const len = a1 - a0;
    // el fondo con los libros (la textura va de 2 m en 2 m)
    const p0 = faceP(F, a0, bot, 0.04);
    const p1 = faceP(F, a1, bot, 0.04);
    const p2 = faceP(F, a1, y1 - 0.12, 0.04);
    const p3 = faceP(F, a0, y1 - 0.12, 0.04);
    quadN(gb, 'books', p0, p1, p2, p3, faceN(F), len / 2, (y1 - 0.12 - bot) / 2);
    // los parantes cada metro y pico
    const n = Math.max(1, Math.round(len / 1.1));
    for (let s = 0; s <= n; s++) {
      const a = a0 + (len * s) / n;
      wbox(gb, 'woodDark', F, Math.max(a0, a - 0.035), Math.min(a1, a + 0.035), 0.02, DEP, y0, y1);
    }
    // los estantes cada medio metro
    for (let y = bot; y < y1 - 0.35; y += 0.5) wbox(gb, 'woodDark', F, a0, a1, 0.03, DEP - 0.02, y - 0.014, y + 0.022);
    if (plinth) wbox(gb, 'woodDark', F, a0, a1, 0.02, DEP + 0.02, y0, y0 + 0.12);
    wbox(gb, 'beam', F, a0 - 0.03, a1 + 0.03, 0.02, DEP + 0.06, y1 - 0.12, y1);
  }
}

// Celdas seguidas -> tramos [a0, a1] sin lo que tapan las pilastras.
function spansOf(cells, cuts) {
  const out = [];
  let cur = null;
  for (const a of cells) {
    if (cur && a === cur[1]) cur[1] = a + 1;
    else {
      cur = [a, a + 1];
      out.push(cur);
    }
  }
  let res = out;
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a0, a1] of res) {
      if (c1 <= a0 || c0 >= a1) next.push([a0, a1]);
      else {
        if (c0 - a0 > 0.5) next.push([a0, c0]);
        if (a1 - c1 > 0.5) next.push([c1, a1]);
      }
    }
    res = next;
  }
  return res.filter(([a0, a1]) => a1 - a0 >= 0.6);
}

// Las pilastras (y cualquier caja alta pegada a la cara): dónde cortar.
function cutsOf(w, F, a0, a1, fy) {
  const cuts = [];
  const seen = new Set();
  for (let a = a0; a < a1; a++) {
    const fx = F.axis === 'x' ? a : F.n > 0 ? F.at : F.at - 1;
    const fz = F.axis === 'x' ? (F.n > 0 ? F.at : F.at - 1) : a;
    if (!w.inside(fx, fz)) continue;
    for (const b of w.cellBoxes[w.idx(fx, fz)]) {
      if (b.kind !== 'prop' || seen.has(b) || b.y1 - b.y0 < 3 || b.y0 > fy + 1) continue;
      const near = F.axis === 'x' ? (F.n > 0 ? b.z0 - F.at : F.at - b.z1) : F.n > 0 ? b.x0 - F.at : F.at - b.x1;
      if (near > 0.05) continue;
      seen.add(b);
      cuts.push(F.axis === 'x' ? [b.x0 - 0.02, b.x1 + 0.02] : [b.z0 - 0.02, b.z1 + 0.02]);
    }
  }
  return cuts;
}

function library(w, gb, busy, boxes) {
  if (!ZONES.O) return;
  const [x0, z0, x1, z1] = zoneRects('O')[0];
  const X0 = x0;
  const X1 = x1 + 1;
  const Z0 = z0;
  const Z1 = z1 + 1;
  const fy = w.fy[w.idx(x0 + 3, z0 + 3)];
  const G = fy + 4.6;
  const D = 1.1;
  const TOP = fy + 8.4;
  const faces = [
    { axis: 'x', at: Z0, n: 1, a0: X0, a1: X1, wall: (a) => [a, Z0 - 1], front: (a) => [a, Z0] },
    { axis: 'x', at: Z1, n: -1, a0: X0, a1: X1, wall: (a) => [a, Z1], front: (a) => [a, Z1 - 1] },
    { axis: 'z', at: X0, n: 1, a0: Z0, a1: Z1, wall: (a) => [X0 - 1, a], front: (a) => [X0, a] },
    { axis: 'z', at: X1, n: -1, a0: Z0, a1: Z1, wall: (a) => [X1, a], front: (a) => [X1 - 1, a] },
  ];
  for (const F of faces) {
    const lower = [];
    const upper = [];
    // (las máquinas de las perks son más anchas que la celda: con el corte
    // justo, las estanterías de los costados se le metían adentro)
    const room = [];
    for (let a = F.a0; a < F.a1; a++) {
      const [wx, wz] = F.wall(a);
      const [fx, fz] = F.front(a);
      const t = w.grid[w.idx(wx, wz)];
      const fi = w.idx(fx, fz);
      if (t === WALL || t === DOOR || t === WINDOW) upper.push(a);
      const taken = busy.front.has(fi) || busy.wall.has(w.idx(wx, wz));
      if (t === WALL && w.rampAt[fi] < 0 && !taken) lower.push(a);
      if (taken) room.push([a - 0.3, a + 1.3]);
    }
    const cuts = cutsOf(w, F, F.a0, F.a1, fy);
    const low = spansOf(lower, [...cuts, ...room]);
    shelves(gb, F, low, fy, fy + 4.3, true);
    shelves(gb, F, spansOf(upper, cuts), G + 0.02, TOP, false);
    // las de abajo son sólidas (poco hondas, para no tapar el paso de nadie)
    for (const [a0, a1] of low) {
      const p = F.at;
      const q = F.at + F.n * 0.29;
      if (F.axis === 'x') boxes.push([a0, fy, Math.min(p, q), a1, fy + 4.3, Math.max(p, q)]);
      else boxes.push([Math.min(p, q), fy, a0, Math.max(p, q), fy + 4.3, a1]);
    }
    // las ménsulas de la galería, cada metro y medio
    const along = F.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    for (let a = F.a0 + 0.75; a < F.a1 - 0.4; a += 1.5) {
      // solo donde hay pared (no en la boca de la escalera)
      const [wx, wz] = F.wall(Math.floor(a));
      if (![WALL, DOOR, WINDOW].includes(w.grid[w.idx(wx, wz)])) continue;
      const A = faceP(F, a, G - 1.35, 0).addScaledVector(along, -0.05);
      const Bq = faceP(F, a, G - 0.17, D - 0.12).addScaledVector(along, -0.05);
      strut(gb, 'beam', A, Bq, 0.06, 0.1, along);
      wbox(gb, 'beam', F, a - 0.06, a + 0.06, 0, 0.12, G - 1.55, G - 0.17);
    }
  }
  // el piso de la galería (tablas) todo alrededor
  const IX0 = X0 + D;
  const IX1 = X1 - D;
  const IZ0 = Z0 + D;
  const IZ1 = Z1 - D;
  for (const [a, b, c, d] of [
    [X0, Z0, X1, IZ0],
    [X0, IZ1, X1, Z1],
    [X0, IZ0, IX0, IZ1],
    [IX1, IZ0, X1, IZ1],
  ]) {
    gb.box('wood', a, G - 0.14, b, c, G, d, 1);
    gb.box('beam', a, G - 0.3, b, c, G - 0.14, d, 1);
  }
  // el frente (una faja) y la baranda con balaustres
  const edges = [
    [IX0, IZ0, IX1, IZ0],
    [IX1, IZ0, IX1, IZ1],
    [IX1, IZ1, IX0, IZ1],
    [IX0, IZ1, IX0, IZ0],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const lx = Math.min(ax, bx) - 0.05;
    const hx = Math.max(ax, bx) + 0.05;
    const lz = Math.min(az, bz) - 0.05;
    const hz = Math.max(az, bz) + 0.05;
    gb.box('beam', lx, G - 0.42, lz, hx, G + 0.04, hz, 1);
    gb.box('beam', lx, G + 0.94, lz, hx, G + 1.02, hz, 1);
    gb.box('woodDark', lx + 0.02, G + 0.06, lz + 0.02, hx - 0.02, G + 0.12, hz - 0.02, 1);
    const len = Math.hypot(bx - ax, bz - az);
    const nb = Math.floor(len / 0.2);
    for (let s = 1; s < nb; s++) {
      const u = s / nb;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      gb.box('woodDark', x - 0.022, G + 0.12, z - 0.022, x + 0.022, G + 0.94, z + 0.022, 1);
    }
  }
  // los cuatro postes de las esquinas de la baranda
  for (const [x, z] of [
    [IX0, IZ0],
    [IX1, IZ0],
    [IX1, IZ1],
    [IX0, IZ1],
  ]) {
    gb.box('beam', x - 0.08, G - 0.5, z - 0.08, x + 0.08, G + 1.12, z + 0.08, 1);
    gb.box('woodDark', x - 0.1, G + 1.12, z - 0.1, x + 0.1, G + 1.18, z + 0.1, 1);
  }
}

// ---------------- los haces de luz ----------------
// La luna entra por las ventanas de las salas (y por los vitrales y el
// rosetón de la capilla, del color de cada vidrio y con la sombra de sus
// parteluces). Acá solo se juntan las aberturas en `w.shaftItems`; los haces
// (un volumen de verdad, fx/Shafts) los arma fx/Ambience, que además les pasa
// las tablas de las ventanas de los zombies para que dejen su sombra.
const SILL = 0.95;
const HEAD = 2.35;
const VITRAL = { fuego: 0xff8a4a, viento: 0x8affc0, rayo: 0xffe070, hielo: 0x9adcff };

// el rayo: hacia adentro por n, bajando `drop` por metro
const ray = (n, drop) => new THREE.Vector3(n.x, -drop, n.z).normalize();

function buildShafts(w) {
  const items = [];
  // las ventanas de las salas techadas (de afuera hacia adentro)
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const j = w.idx(x, z);
      if (w.grid[j] !== WINDOW || w.edge[j] !== 0) continue;
      for (const [dx, dz] of DIRS) {
        const ix = x + dx;
        const iz = z + dz;
        const ox = x - dx;
        const oz = z - dz;
        if (!w.inside(ix, iz) || !w.inside(ox, oz)) continue;
        const i = w.idx(ix, iz);
        // (ni las que dan a una escalera: el haz no sigue los escalones, los
        // atravesaba y quedaba cortado en el aire)
        if (w.grid[i] !== FLOOR || w.zone[i] < 0 || w.rampAt[i] >= 0) continue;
        const Z = ZONES[w.zoneKeys[w.zone[i]]];
        if (!Z || Z.outdoor || Z.under) continue;
        // del otro lado, afuera (el vacío o un patio)
        const o = w.idx(ox, oz);
        const other = w.zone[o] >= 0 ? ZONES[w.zoneKeys[w.zone[o]]] : null;
        if (w.grid[o] === FLOOR && !other?.outdoor) continue;
        if (w.grid[o] === WALL || w.grid[o] === DOOR) continue;
        const fy = w.fy[i];
        const n = new THREE.Vector3(dx, 0, dz);
        const c = new THREE.Vector3(x + 0.5 + dx * 0.5, fy + (SILL + HEAD) / 2, z + 0.5 + dz * 0.5);
        items.push({ c, n, w: 0.8, h: HEAD - SILL, dir: ray(n, 0.42), fy, cell: [x, z] });
      }
    }
  }
  // los vitrales (con el parteluz y el travesaño) y el rosetón (con sus rayos)
  for (const p of PROPS || []) {
    if (p.type !== 'vitral' && p.type !== 'roseton') continue;
    const rot = p.rot || 0;
    const n = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
    const [x, z] = p.pos;
    const fy = w.floorAt(x + n.x, z + n.z);
    if (p.type === 'vitral') {
      const h = (p.h || 3.4) * 0.8;
      const c = new THREE.Vector3(x, fy + (p.y0 ?? 1.6) + (p.h || 3.4) * 0.45, z).addScaledVector(n, 0.06);
      const tint = new THREE.Color(VITRAL[p.kind] || 0xffffff);
      items.push({ c, n, w: (p.w || 1.4) * 0.85, h, dir: ray(n, 0.55), fy, tint, k: 1.2, bars: [{ y: 0, roll: Math.PI / 2 }, { y: h * 0.18, roll: 0 }] });
    } else {
      const R = (p.r || 1.5) * 1.6;
      const c = new THREE.Vector3(x, fy + (p.y0 ?? 7), z).addScaledVector(n, 0.08);
      const bars = [0, 1, 2, 3].map((i) => ({ y: 0, roll: (i * Math.PI) / 4 }));
      // (más parado: con 0,62 la punta de arriba cruzaba la pared del fondo y,
      // con la cámara adentro del haz, la niebla se veía por encima de la pared)
      items.push({ c, n, w: R, h: R, dir: ray(n, 0.8), fy, tint: new THREE.Color(0xc8b8ff), round: true, bars });
    }
  }
  w.shaftItems = items;
}

// ---------------- las fachadas de los patios ----------------
// Las paredes altas que dan a los patios: una cornisa de piedra con nieve
// arriba de las puertas y, más arriba, ventanas: con luz tibia adentro o con
// los postigos cerrados si del otro lado hay una sala, y aspilleras (troneras
// angostas) si es muralla. Así el patio de noche parece habitado.
const FACADES = ['A', 'S'];
function windowMats() {
  const lit = mat('winLit', () => {
    const tex = canvasTex('castleWinLit', 64, 96, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#ffd890');
      g.addColorStop(1, '#c8641e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // una sombra adentro (alguien pasó) y los parteluces
      ctx.fillStyle = 'rgba(90,40,10,0.35)';
      ctx.fillRect(W * 0.55, H * 0.3, W * 0.3, H * 0.7);
      ctx.fillStyle = '#1a100a';
      ctx.fillRect(W / 2 - 2, 0, 4, H);
      ctx.fillRect(0, H * 0.45, W, 4);
      ctx.strokeStyle = '#1a100a';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, W, H);
    });
    return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.3, roughness: 0.4 });
  });
  const dark = std('winDark', { color: 0x0a0c12, roughness: 0.2, metalness: 0.3 });
  return { lit, dark };
}

function facades(w, gb) {
  for (const k of FACADES) {
    if (!ZONES[k]) continue;
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
            // una pared de verdad, o el paredón de un piso mucho más alto
            let top;
            if (nt === WALL && w.edge[j] === 0) top = w.top[j];
            else if (nt === FLOOR && w.rampAt[j] < 0 && w.fy[j] - fy > 5) top = w.fy[j];
            else return;
            const h = top - fy;
            if (h < 6) return;
            const F = { axis: dx ? 'z' : 'x', at: dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, n: dx ? -dx : -dz };
            const a = dx ? z : x;
            const hung = wallProps(F).filter((p) => p.a1 > a - 0.6 && p.a0 < a + 1.6);
            // la cornisa (con su nieve), menos donde cuelga algo
            if (!hung.length) {
              wbox(gb, 'castleStoneDark', F, a, a + 1, 0, 0.13, fy + 3.9, fy + 4.12);
              wbox(gb, 'snowCap', F, a, a + 1, 0, 0.14, fy + 4.12, fy + 4.17);
            }
            if (a % 3 !== 1 || hung.length) return;
            // que las de al lado también sean pared lisa
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
            // ni detrás de un contrafuerte (los de castleTrim, contra esta cara)
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
            // ¿del otro lado hay una sala?
            const bx = nx + dx;
            const bz = nz + dz;
            const bi = w.inside(bx, bz) ? w.idx(bx, bz) : -1;
            const room = nt === WALL && bi >= 0 && w.grid[bi] === FLOOR && w.zone[bi] >= 0 && !ZONES[w.zoneKeys[w.zone[bi]]].outdoor;
            const c = a + 0.5;
            const rows = h > 11.5 ? [4.7, 8.7] : [4.7];
            rows.forEach((y0, row) => {
              const Y = fy + y0;
              if (!room) {
                // aspillera: la ranura oscura y el marco
                wbox(gb, 'black', F, c - 0.07, c + 0.07, 0, 0.015, Y, Y + 1.1);
                wbox(gb, 'castleStoneDark', F, c - 0.2, c - 0.07, 0, 0.08, Y - 0.08, Y + 1.18);
                wbox(gb, 'castleStoneDark', F, c + 0.07, c + 0.2, 0, 0.08, Y - 0.08, Y + 1.18);
                wbox(gb, 'castleStoneDark', F, c - 0.2, c + 0.2, 0, 0.1, Y - 0.14, Y);
                wbox(gb, 'snowCap', F, c - 0.2, c + 0.2, 0, 0.11, Y, Y + 0.04);
                return;
              }
              // ventana con marco de piedra, alféizar con nieve y postigos
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
                // los postigos abiertos contra la pared
                wbox(gb, 'woodDark', F, c - W2 - 0.62, c - W2 - 0.14, 0, 0.05, Y, Y + H2);
                wbox(gb, 'woodDark', F, c + W2 + 0.14, c + W2 + 0.62, 0, 0.05, Y, Y + H2);
              } else {
                // cerrados
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

// ---------------- el Pack-a-Pava de las termas ----------------
// En el castillo la pava gigante se calienta en una poza de las termas: sin el
// gabinete de metal, la pava queda metida en un brocal de piedra con agua que
// humea, y el cartel va en una tabla con dos postes adelante. Devuelve de dónde
// sale el vapor.
export function skinPap(g) {
  const pap = g.interact?.pap;
  const M = g.world.M;
  if (!pap?.group) return null;
  const hide = new Set([M.metalGreen, M.brass, M.black, M.copper]);
  for (const c of pap.group.children) if (hide.has(c.material)) c.visible = false;
  const G = new THREE.Group();
  const st = M.castleStone || M.stone;
  const R = 0.82;
  G.add(mesh(new THREE.CylinderGeometry(R, R + 0.08, 1.25, 18, 1, true), st, 0, 0.62, 0));
  G.add(mesh(new THREE.TorusGeometry(R + 0.02, 0.1, 6, 22), M.castleStoneDark || st, 0, 1.25, 0, Math.PI / 2, 0, 0));
  const water = mesh(new THREE.CircleGeometry(R, 20), std('papWater', { color: 0x3a8a8a, roughness: 0.15, metalness: 0.1, emissive: 0x0c3a36, emissiveIntensity: 0.9 }), 0, 1.22, 0, -Math.PI / 2, 0, 0);
  G.add(water);
  // piedras sueltas al pie, con la costra de minerales
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.3;
    const s = 0.16 + (k % 3) * 0.06;
    const rock = mesh(new THREE.DodecahedronGeometry(s, 0), k % 4 ? M.castleStoneDark || st : std('ocreR', { color: 0x7a4a2a, roughness: 0.95 }), Math.cos(a) * (R + 0.18), s * 0.4, Math.sin(a) * (R + 0.18), k, k * 2, 0);
    rock.scale.set(1, 0.6, 1);
    G.add(rock);
  }
  // el cartel en una tabla, adelante
  const front = 1.05;
  G.add(mesh(boxGeo(1.95, 0.42, 0.06), M.woodDark || M.wood, 0, 0.55, front));
  for (const s of [-1, 1]) G.add(mesh(boxGeo(0.08, 0.9, 0.08), M.woodDark || M.wood, s * 0.92, 0.45, front - 0.02));
  G.add(mesh(boxGeo(1.95, 0.05, 0.1), M.snowCap || M.wood, 0, 0.785, front));
  // (las piedras y las tablas: una malla por material)
  if (lean()) compactGroup(G);
  pap.group.add(G);
  const label = pap.group.children.find((c) => c.material?.map && c.geometry?.parameters?.width === 1.7);
  if (label) label.position.set(0, 0.55, front + 0.035);
  if (pap.glow) pap.glow.position.set(0, 0.3, front + 0.02);
  pap.group.updateMatrixWorld(true);
  return pap.group.localToWorld(new THREE.Vector3(0, 1.3, 0));
}

// ---------------- las chimeneas ----------------
// Arriba de cada hogar (las chimeneas de la herrería, el gran salón y la
// cocina) asoma el tiraje de piedra sobre la pared, con su sombrerete y
// nieve; Castle.js le hace salir humo (w.castleSmoke).
function chimneys(w, gb) {
  w.castleSmoke = [];
  for (const p of PROPS || []) {
    if (p.type !== 'chimenea') continue;
    const rot = p.rot || 0;
    const bx = p.pos[0] - Math.sin(rot) * 0.6;
    const bz = p.pos[1] - Math.cos(rot) * 0.6;
    const cx = Math.floor(bx);
    const cz = Math.floor(bz);
    if (!w.inside(cx, cz) || w.grid[w.idx(cx, cz)] !== WALL) continue;
    const top = w.top[w.idx(cx, cz)];
    const x = p.pos[0];
    const z = cz + 0.5;
    const y0 = top - 0.4;
    const y1 = top + 2.4;
    gb.box('castleStone', x - 0.55, y0, z - 0.45, x + 0.55, y1, z + 0.45, 1);
    gb.box('castleStoneDark', x - 0.65, y1, z - 0.55, x + 0.65, y1 + 0.14, z + 0.55, 1);
    gb.box('black', x - 0.38, y1 + 0.14, z - 0.28, x + 0.38, y1 + 0.16, z + 0.28, 1);
    // el sombrerete sobre cuatro patitas, con nieve
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box('castleStoneDark', x + sx * 0.5 - 0.06, y1 + 0.14, z + sz * 0.4 - 0.06, x + sx * 0.5 + 0.06, y1 + 0.5, z + sz * 0.4 + 0.06, 1);
    gb.box('castleStoneDark', x - 0.7, y1 + 0.5, z - 0.6, x + 0.7, y1 + 0.62, z + 0.6, 1);
    gb.box('snowCap', x - 0.68, y1 + 0.62, z - 0.58, x + 0.68, y1 + 0.72, z + 0.58, 1);
    w.castleSmoke.push({ x, y: y1 + 0.3, z });
  }
}

// ---------------- la sombra de contacto ----------------
// Adentro, donde el piso se junta con la pared, una franja que oscurece de a
// poco (la sombra que la luz no llega a hacer): las salas no "flotan".
let AO = null;
function aoMat() {
  if (AO) return AO;
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 64;
  const x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(0.3, 'rgba(0,0,0,0.2)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 4, 64);
  AO = new THREE.MeshBasicMaterial({ color: 0x000000, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return AO;
}

function contactShade(w, gb) {
  const D = 0.75;
  const up = new THREE.Vector3(0, 1, 0);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || w.zone[i] < 0) continue;
      if (ZONES[w.zoneKeys[w.zone[i]]]?.outdoor) continue;
      const y = w.fy[i] + 0.006;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz)) continue;
        const j = w.idx(nx, nz);
        const nt = w.grid[j];
        // la pared, o el paredón de un piso más alto
        const step = nt === FLOOR && w.rampAt[j] < 0 && w.fy[j] - w.fy[i] > 1.5;
        if ((nt !== WALL && nt !== WINDOW && !step) || w.edge[j] !== 0) continue;
        const F = { axis: dx ? 'z' : 'x', at: dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, n: dx ? -dx : -dz };
        const a = dx ? z : x;
        quadN(gb, 'ao', faceP(F, a, y, 0), faceP(F, a + 1, y, 0), faceP(F, a + 1, y, D), faceP(F, a, y, D), up);
      }
    }
  }
}

export function buildRooms(w) {
  const gb = new GeoBuilder();
  const busy = busyWalls(w);
  const boxes = [];
  for (const k of TIMBER) if (ZONES[k]) timber(w, gb, k, busy);
  library(w, gb, busy, boxes);
  facades(w, gb);
  chimneys(w, gb);
  contactShade(w, gb);
  const win = windowMats();
  const mesh = gb.build({ ...w.M, books: booksMat(), winLit: win.lit, winDark: win.dark, ao: aoMat() });
  for (const m of mesh.children) if (m.material === AO) m.castShadow = m.receiveShadow = false;
  w.root.add(mesh);
  for (const b of boxes) w.addBox(b, { kind: 'prop' });
  buildShafts(w);
  return mesh;
}

// ================= utilería =================
const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const S = (g, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, ws = 10, hs = 8) => {
  const m = mesh(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z);
  m.scale.set(sx, sy, sz);
  g.add(m);
  return m;
};
const UP = new THREE.Vector3(0, 1, 0);
// Un palo (cilindro) de a hasta b.
function pole(g, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(cylGeo(r, r, d.length(), seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  g.add(m);
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const cache = {};
function mat(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}
const std = (key, o) => mat(key, () => new THREE.MeshStandardMaterial(o));
const clay = () => std('clay', { color: 0x8a6448, roughness: 0.97 });
const clayDark = () => std('clayDark', { color: 0x54382a, roughness: 0.95 });
const ceramic = () => std('ceramic', { color: 0xe8e0cc, roughness: 0.35 });
const blueRim = () => std('blueRim', { color: 0x2a4a8a, roughness: 0.4 });
const terracota = () => std('terracota', { color: 0xa0522d, roughness: 0.8 });
const garlic = () => std('garlic', { color: 0xe8dcc4, roughness: 0.7 });
const chili = () => std('chili', { color: 0x9a1a0e, roughness: 0.45 });
const ham = () => std('ham', { color: 0x6a2a18, roughness: 0.55 });
const herb = () => std('herb', { color: 0x4a5a2a, roughness: 0.9 });
const bread = () => std('bread', { color: 0xb07a3a, roughness: 0.8 });
const brass = () => std('brassR', { color: 0xb08a3a, roughness: 0.35, metalness: 0.9 });
const copper = () => std('copperR', { color: 0xb0643a, roughness: 0.35, metalness: 0.9 });
const lamp = () => std('lampGlass', { color: 0x3a2a10, emissive: 0xffb050, emissiveIntensity: 1.8 });
const ice = () => mat('iceBlock', () => new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.06, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.3, transparent: true, opacity: 0.42, depthWrite: false }));
const frost = () => std('frost', { color: 0xdcecf8, roughness: 0.6, emissive: 0x16304a, emissiveIntensity: 0.25 });
const glow = () => mat('candleGlowR', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2.2), toneMapped: false }));
const wax = () => std('waxR', { color: 0xf0e6cc, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.4 });

function candle(g, x, y, z, h = 0.18, r = 0.025) {
  C(g, r, r * 1.1, h, wax(), x, y + h / 2, z, 0, 0, 0, 7);
  const f = mesh(new THREE.SphereGeometry(0.018, 6, 5), glow(), x, y + h + 0.03, z);
  f.scale.set(1, 1.8, 1);
  f.castShadow = false;
  g.add(f);
}

// Tela a rayas con la guarda (ponchos, mantas).
function ponchoMat(key, base, stripe) {
  return mat(`poncho${key}`, () => {
    const tex = canvasTex(`castlePoncho_${key}`, 128, 128, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, y, w, 1);
      }
      for (const y of [14, h - 26]) {
        ctx.fillStyle = '#0e0b0a';
        ctx.fillRect(0, y, w, 12);
        ctx.fillStyle = stripe;
        for (let x = 0; x < w; x += 16) {
          ctx.fillRect(x + 4, y + 3, 8, 6);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 1; x < w; x += 5) ctx.fillRect(x, h - 8, 2, 8);
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
  });
}
const PONCHOS = [
  ['rojo', '#8e1d16', '#e8e0cc'],
  ['verde', '#1d5a34', '#d8c890'],
  ['azul', '#183e74', '#e8e0cc'],
  ['ocre', '#8a6a10', '#1a1410'],
  ['vicuna', '#a8865a', '#3a2418'],
];

// Tela que cuelga doblada sobre una barra (plano con ondas).
function draped(w, h, material, waves = 2.5, depth = 0.04) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = (h / 2 - y) / h;
    pos.setZ(i, Math.sin((x / w) * Math.PI * waves) * depth * (0.4 + k));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// El nombre del caballo, pintado en una tablita.
function namePlate(name) {
  return mat(`plate_${name}`, () => {
    const tex = canvasTex(`castleHorseName_${name}`, 256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#3a2618';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, y, w, 1);
      }
      ctx.strokeStyle = '#1a100a';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#e8d8b0';
      ctx.font = 'bold 34px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, w / 2, h / 2 + 2);
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  });
}

// Un caballo criollo parado, con una mano levantada (quedó congelado así).
// Mira hacia +x; los cascos en y = 0.
function horseFigure(coat, dark) {
  const g = new THREE.Group();
  S(g, 0.36, coat, 0, 1.3, 0, 1.75, 1, 0.8, 14, 10);
  S(g, 0.4, coat, 0.52, 1.32, 0, 1, 1.05, 0.82, 12, 10);
  S(g, 0.41, coat, -0.55, 1.36, 0, 1.05, 1, 0.88, 12, 10);
  // el cogote y la cabeza (alta, mirando al frente)
  pole(g, V(0.62, 1.45, 0), V(0.98, 2.05, 0), 0.2, coat, 10);
  S(g, 0.2, coat, 0.64, 1.47, 0, 1.1, 1.2, 0.9);
  const head = mesh(cylGeo(0.09, 0.15, 0.62, 10), coat, 1.2, 1.92, 0, 0, 0, 1.15);
  g.add(head);
  S(g, 0.15, coat, 1.02, 2.08, 0, 1.1, 1, 0.9);
  S(g, 0.1, coat, 1.44, 1.8, 0, 1.2, 0.9, 0.95);
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.ConeGeometry(0.035, 0.16, 5), coat, 0.98, 2.26, s * 0.07, s * 0.15, 0, 0.3));
    g.add(mesh(new THREE.SphereGeometry(0.025, 6, 5), dark, 1.12, 2.05, s * 0.1));
  }
  // la crin y la cola, oscuras
  pole(g, V(0.6, 1.72, 0), V(1.0, 2.2, 0), 0.05, dark);
  pole(g, V(-0.95, 1.5, 0), V(-1.15, 0.75, 0), 0.07, dark);
  S(g, 0.1, dark, -1.12, 0.78, 0, 0.8, 2, 0.8);
  // las patas: una mano levantada
  const leg = (x, z, lift) => {
    const hip = V(x, 1.12, z);
    const knee = lift ? V(x + 0.28, 0.72, z) : V(x + (x < 0 ? -0.06 : 0.02), 0.62, z);
    const foot = lift ? V(x + 0.12, 0.45, z) : V(x, 0.08, z);
    pole(g, hip, knee, 0.085, coat, 8);
    pole(g, knee, foot, 0.055, coat, 7);
    const hoof = mesh(cylGeo(0.06, 0.075, 0.1, 8), dark, foot.x, foot.y - 0.02, foot.z);
    g.add(hoof);
  };
  leg(0.55, 0.16, true);
  leg(0.55, -0.16, false);
  leg(-0.6, 0.17, false);
  leg(-0.6, -0.17, false);
  return g;
}

// El fresco de la capilla: la Primera Gran Guerra. Los cuatro caballeros de
// la luz levantan los mates contra el Chiquitijuein gigante, el Mateendrache
// vuela arriba; pintura vieja, con manchas y grietas, y la guarda de marco.
function frescoTex() {
  return canvasTex('castleFresco', 1024, 512, (ctx, W, H) => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4a4468');
    sky.addColorStop(0.45, '#8a6078');
    sky.addColorStop(0.78, '#c07a50');
    sky.addColorStop(1, '#5a3a28');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // la cordillera con nieve en las puntas
    const peaks = [];
    for (let x = -32; x <= W + 32; x += 64) peaks.push([x, 230 + Math.abs(Math.sin(x * 0.011)) * 80 + rnd() * 30]);
    ctx.fillStyle = '#5a5272';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const [x, y] of peaks) {
      ctx.lineTo(x - 32, y + 50);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,226,236,0.8)';
    for (const [x, y] of peaks) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 12, y + 18);
      ctx.lineTo(x + 12, y + 18);
      ctx.fill();
    }
    ctx.fillStyle = '#4a3222';
    ctx.fillRect(0, 410, W, 102);
    // el Chiquitijuein colosal: sombrero, poncho y los ojos colorados
    const cx = 770;
    ctx.fillStyle = '#0c0a0c';
    ctx.beginPath();
    ctx.ellipse(cx, 126, 150, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 66, 46, 132, 84);
    ctx.beginPath();
    ctx.moveTo(cx - 88, 150);
    ctx.lineTo(cx + 88, 150);
    ctx.lineTo(cx + 196, 440);
    ctx.lineTo(cx - 196, 440);
    ctx.closePath();
    ctx.fill();
    guarda(ctx, cx - 170, 392, 340, 26, '#0c0a0c', '#6a1410', '#c01810');
    ctx.fillStyle = '#ff2a10';
    ctx.shadowColor = '#ff2a10';
    ctx.shadowBlur = 22;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * 26, 144, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // los cuatro caballeros con los mates en alto, y la luz de cada mate
    const K = [
      ['fire', '#ff7a2a', 120],
      ['wind', '#8affb8', 220],
      ['bolt', '#ffe45a', 320],
      ['ice', '#9adcff', 420],
    ];
    for (const [kind, col, x] of K) {
      const g = ctx.createLinearGradient(x + 40, 262, cx - 40, 180);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x + 40, 262);
      ctx.lineTo(cx - 60, 190 + (x - 270) * 0.25);
      ctx.stroke();
      ctx.fillStyle = '#0e0a08';
      ctx.beginPath();
      ctx.ellipse(x, 300, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 12, 283, 24, 18);
      ctx.beginPath();
      ctx.moveTo(x - 13, 312);
      ctx.lineTo(x + 13, 312);
      ctx.lineTo(x + 36, 384);
      ctx.lineTo(x - 36, 384);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 17, 384, 12, 40);
      ctx.fillRect(x + 5, 384, 12, 40);
      ctx.save();
      ctx.translate(x + 14, 322);
      ctx.rotate(-0.9);
      ctx.fillRect(0, -5, 46, 10);
      ctx.restore();
      ctx.fillStyle = col;
      ctx.fillRect(x - 32, 370, 64, 6);
      glyph(ctx, kind, x + 40, 256, 34, col);
    }
    // el Mateendrache volando arriba, hacia el gigante
    ctx.strokeStyle = '#1e3020';
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(250, 120);
    ctx.bezierCurveTo(320, 60, 400, 150, 470, 92);
    ctx.bezierCurveTo(510, 60, 540, 70, 560, 84);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(250, 120);
    ctx.bezierCurveTo(210, 150, 190, 130, 170, 150);
    ctx.stroke();
    ctx.fillStyle = '#1e3020';
    ctx.beginPath();
    ctx.ellipse(572, 86, 22, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    for (const x0 of [360, 420]) {
      ctx.beginPath();
      ctx.moveTo(x0, 100);
      ctx.lineTo(x0 - 40, 30);
      ctx.quadraticCurveTo(x0 - 10, 60, x0 + 10, 36);
      ctx.quadraticCurveTo(x0 + 20, 70, x0 + 50, 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffb040';
    ctx.shadowColor = '#ff8020';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(592, 88);
    ctx.lineTo(660, 70);
    ctx.lineTo(650, 104);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // el desgaste: manchas claras, grietas y el borde comido
    for (let k = 0; k < 1100; k++) {
      ctx.fillStyle = 'rgba(230,220,200,' + (rnd() * 0.09).toFixed(3) + ')';
      ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 12, 2 + rnd() * 6);
    }
    ctx.strokeStyle = 'rgba(30,22,18,0.4)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 16; k++) {
      let x = rnd() * W;
      let y = rnd() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += (rnd() - 0.5) * 40;
        y += rnd() * 24;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    guarda(ctx, 0, 0, W, 30, '#1a1410', '#d8c89a', '#8e1d16');
    guarda(ctx, 0, H - 30, W, 30, '#1a1410', '#d8c89a', '#183e74');
    ctx.fillStyle = '#e8dcc0';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('LA PRIMERA GRAN GUERRA', W / 2, 66);
  });
}

// La bóveda pintada: azul de noche con estrellas doradas (se repite cada 3 m).
function vaultMat() {
  return mat('boveda', () => {
    const tex = canvasTex('castleVault', 256, 256, (ctx, W, H) => {
      let seed = 9;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      ctx.fillStyle = '#141a3c';
      ctx.fillRect(0, 0, W, H);
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = 'rgba(40,50,100,' + (rnd() * 0.3).toFixed(3) + ')';
        ctx.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 40, 10 + rnd() * 30);
      }
      ctx.fillStyle = '#e0b860';
      const star = (x, y, r) => {
        ctx.beginPath();
        for (let s = 0; s < 16; s++) {
          const a = (s / 16) * Math.PI * 2;
          const rr = s % 2 ? r * 0.35 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      };
      for (let k = 0; k < 26; k++) star(rnd() * W, rnd() * H, 2 + rnd() * 3);
      for (let k = 0; k < 3; k++) star(rnd() * W, rnd() * H, 8 + rnd() * 4);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, roughness: 0.9 });
  });
}

export const ROOMS = {
  // El fresco de la capilla (w x h, desde y0, contra la pared).
  fresco(M, o) {
    const g = new THREE.Group();
    const w = o.w || 8;
    const h = o.h || 4;
    const y = o.y0 ?? 4;
    const m = mat('fresco', () => {
      const tex = frescoTex();
      return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2, roughness: 0.95 });
    });
    g.add(mesh(new THREE.PlaneGeometry(w, h), m, 0, y + h / 2, 0.015));
    return { obj: g, boxes: [] };
  },

  // La bóveda pintada de un salón: un plano de w x d a la altura h, mirando abajo.
  cielo(M, o) {
    const g = new THREE.Group();
    const w = o.w || 10;
    const d = o.d || 10;
    const geo = new THREE.PlaneGeometry(w, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 3, (uv.getY(i) * d) / 3);
    const m = mesh(geo, vaultMat(), 0, o.h || 10, 0, Math.PI / 2, 0, 0);
    m.castShadow = false;
    g.add(m);
    return { obj: g, boxes: [] };
  },

  // Las cuadras de la caballeriza: `n` boxes de `sw` de ancho contra la pared
  // (las divisiones de tablas con reja arriba, el pesebre, el nombre del
  // caballo y la cama de paja). En los boxes de `horses` hay un caballo
  // congelado adentro de un bloque de hielo, mirando para afuera.
  cuadra(M, o, r) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const n = o.n || 2;
    const sw = o.sw || 2.1;
    const D = 2.5;
    const W = n * sw;
    const names = o.names || ['MALACARA', 'TOSTADO', 'PICAZO', 'ZAINO'];
    const horses = o.horses || [];
    for (let k = 0; k <= n; k++) {
      const x = -W / 2 + k * sw;
      // la división: tablas abajo y reja arriba, con la barra de hierro de la
      // pared hasta el poste del frente (cortada antes quedaba colgando en el aire;
      // las puntas no siempre dan contra una pared, así que van todas con reja)
      B(g, 0.07, 1.3, D, wood, x, 0.65, D / 2);
      B(g, 0.1, 0.08, D, M.beam || wood, x, 1.34, D / 2);
      for (let b = 0; b < 9; b++) C(g, 0.012, 0.012, 0.7, M.iron, x, 1.72, 0.2 + (b * (D - 0.45)) / 8, 0, 0, 0, 5);
      B(g, 0.08, 0.06, D - 0.07, M.iron, x, 2.07, (D - 0.07) / 2);
      // el poste del frente
      B(g, 0.15, 2.45, 0.15, M.beam || wood, x, 1.22, D);
    }
    // el dintel de adelante
    B(g, W + 0.2, 0.18, 0.2, M.beam || wood, 0, 2.45, D);
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + (k + 0.5) * sw;
      // el pesebre contra la pared y el pasto de la rejilla
      B(g, sw - 0.3, 0.35, 0.45, wood, x, 0.95, 0.25);
      B(g, sw - 0.36, 0.06, 0.4, M.hay || M.sack, x, 1.1, 0.25);
      for (let b = 0; b < 7; b++) C(g, 0.012, 0.012, 0.75, M.iron, x - sw / 2 + 0.3 + b * ((sw - 0.6) / 6), 1.6, 0.18, -0.45, 0, 0, 5);
      // la cama de paja
      const bed = mesh(new THREE.SphereGeometry(0.8, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.hay || M.sack, x + (r() - 0.5) * 0.3, 0, D * 0.55, 0, r() * 3, 0);
      bed.scale.set(sw * 0.55, 0.14, 1.3);
      g.add(bed);
      // el nombre arriba, en el dintel
      g.add(mesh(new THREE.PlaneGeometry(0.62, 0.16), namePlate(names[k % names.length]), x, 2.45, D + 0.105));
      if (horses.includes(k)) {
        const coat = std(`coat${k}`, { color: [0x4a2a18, 0x2a2420, 0x6e6a66, 0x5a3a22][k % 4], roughness: 0.55 });
        const h = horseFigure(coat, std('crinR', { color: 0x120c08, roughness: 0.9 }));
        h.position.set(x, 0, 1.1);
        h.rotation.y = -Math.PI / 2 + (r() - 0.5) * 0.2;
        h.scale.setScalar(0.9);
        g.add(h);
        // el bloque de hielo, con escarcha al pie
        const blk = mesh(boxGeo(1.2, 2.4, 2.6), ice(), x, 1.2, 1.3, 0, (r() - 0.5) * 0.08, 0);
        blk.castShadow = false;
        g.add(blk);
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2;
          const c = mesh(new THREE.DodecahedronGeometry(0.16 + r() * 0.14, 0), frost(), x + Math.cos(a) * 0.62, 0.06, D * 0.52 + Math.sin(a) * 1.15, r(), r(), r());
          c.scale.set(1, 0.5, 1);
          g.add(c);
        }
      } else if (r() < 0.6) {
        // un balde
        const bx = x + sw * 0.25;
        C(g, 0.17, 0.14, 0.28, M.wood, bx, 0.14, D * 0.3, 0, 0, 0, 10);
        g.add(mesh(new THREE.TorusGeometry(0.165, 0.01, 4, 14), M.iron, bx, 0.22, D * 0.3, Math.PI / 2, 0, 0));
      }
    }
    return { obj: g, boxes: [[-W / 2 - 0.1, 0, 0, W / 2 + 0.1, 1.5, D + 0.1]] };
  },

  // Los arreos colgados de un tablero: el lazo, la cabezada, las boleadoras,
  // el rebenque, un pelero sobre la barra y herraduras clavadas arriba.
  arreos(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const leather = M.leather || wood;
    B(g, 2, 1.1, 0.05, wood, 0, 1.75, 0.025);
    B(g, 2.1, 0.08, 0.08, M.beam || wood, 0, 2.33, 0.05);
    for (let k = 0; k < 5; k++) C(g, 0.022, 0.022, 0.16, wood, -0.8 + k * 0.4, 2.05, 0.12, Math.PI / 2, 0, 0, 6);
    // el lazo enrollado
    for (let s = 0; s < 4; s++) g.add(mesh(new THREE.TorusGeometry(0.2 - s * 0.012, 0.012, 5, 22), leather, -0.8 + s * 0.008, 1.82 - s * 0.01, 0.1 + s * 0.012));
    // la cabezada: la argolla y dos tiras
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 5, 16), leather, -0.4, 1.88, 0.1));
    for (const s of [-1, 1]) B(g, 0.03, 0.42, 0.008, leather, -0.4 + s * 0.07, 1.72, 0.1, 0, 0, s * 0.1);
    g.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 12), M.iron, -0.4, 1.5, 0.1));
    // las boleadoras: tres piedras forradas colgando de sus tientos
    for (const [dx, len] of [[-0.05, 0.45], [0.02, 0.6], [0.08, 0.36]]) {
      pole(g, V(0, 2.03, 0.14), V(dx, 2.03 - len, 0.14), 0.006, leather, 4);
      S(g, 0.055, leather, dx, 2.0 - len, 0.14);
    }
    // el rebenque
    C(g, 0.022, 0.018, 0.34, M.beam || wood, 0.4, 1.86, 0.12, 0, 0, 0, 6);
    g.add(mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 10), M.silver || M.iron, 0.4, 2.03, 0.12));
    B(g, 0.05, 0.34, 0.006, leather, 0.41, 1.54, 0.12);
    // el pelero sobre la barra
    C(g, 0.02, 0.02, 0.7, wood, 0.72, 1.62, 0.14, 0, 0, Math.PI / 2, 6);
    const blanket = draped(0.62, 0.55, ponchoMat(PONCHOS[4][0], PONCHOS[4][1], PONCHOS[4][2]), 2, 0.03);
    blanket.position.set(0.72, 1.36, 0.16);
    g.add(blanket);
    // las herraduras arriba
    for (let k = 0; k < 5; k++) g.add(mesh(new THREE.TorusGeometry(0.06, 0.013, 4, 10, Math.PI * 1.35), M.iron, -0.6 + k * 0.3, 2.2, 0.06, 0, 0, Math.PI * 1.32));
    return { obj: g, boxes: [] };
  },

  // La escalera de la biblioteca, apoyada contra la galería: el pie queda a
  // `lean` de la pared y la punta a la altura `h`.
  escalera(M, o) {
    const g = new THREE.Group();
    const h = o.h || 5.6;
    const lean = o.lean || 1.2;
    const wood = M.wood || M.woodDark;
    for (const s of [-1, 1]) pole(g, V(s * 0.24, 0, lean), V(s * 0.24, h, 0), 0.035, wood, 6);
    const n = Math.floor(h / 0.32);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      pole(g, V(-0.24, h * t, lean * (1 - t)), V(0.24, h * t, lean * (1 - t)), 0.02, wood, 5);
    }
    return { obj: g, boxes: [[-0.3, 0, lean - 0.2, 0.3, 1, lean + 0.1]] };
  },

  // El globo terráqueo viejo, en su pie de madera, con el meridiano de bronce.
  globo(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      pole(g, V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), V(Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12), 0.03, wood, 6);
    }
    C(g, 0.16, 0.16, 0.05, wood, 0, 0.64, 0, 0, 0, 0, 12);
    const map = mat('globeMat', () => {
      const tex = canvasTex('castleGlobe', 256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#b89a62';
        ctx.fillRect(0, 0, w, h);
        let seed = 5;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        ctx.fillStyle = '#6a5a2a';
        for (let k = 0; k < 7; k++) {
          const cx = rnd() * w;
          const cy = 20 + rnd() * (h - 40);
          ctx.beginPath();
          for (let s = 0; s <= 12; s++) {
            const a = (s / 12) * Math.PI * 2;
            const rr = 10 + rnd() * 18;
            ctx.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
          }
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(60,40,20,0.35)';
        for (let x = 0; x < w; x += 21) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 16) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      });
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    });
    const ball = mesh(new THREE.SphereGeometry(0.3, 20, 14), map, 0, 1.0, 0, 0, 0, 0.41);
    g.add(ball);
    g.add(mesh(new THREE.TorusGeometry(0.34, 0.014, 5, 28), brass(), 0, 1.0, 0, 0, 0, 0.41));
    C(g, 0.02, 0.02, 0.3, brass(), 0, 0.75, 0, 0, 0, 0, 6);
    return { obj: g, boxes: [[-0.36, 0, -0.36, 0.36, 1.35, 0.36]] };
  },

  // La mesa de los mapas: el plano de la cordillera con el castillo, las
  // marcas de los cuatro elementos, velas, el tintero y una daga clavada.
  mesaMapa(M, o) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const L = o.len || 2;
    B(g, L, 0.08, 1.1, wood, 0, 0.86, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) C(g, 0.06, 0.07, 0.84, wood, x * (L / 2 - 0.12), 0.42, z * 0.42, 0, 0, 0, 8);
    B(g, L - 0.3, 0.06, 0.06, wood, 0, 0.25, 0);
    const map = mat('mapaGuerra', () => {
      const tex = canvasTex('castleMapa', 512, 288, (ctx, w, h) => {
        ctx.fillStyle = '#d8c69a';
        ctx.fillRect(0, 0, w, h);
        const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(90,60,20,0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // la cordillera
        ctx.strokeStyle = '#4a3418';
        ctx.lineWidth = 2;
        for (let k = 0; k < 16; k++) {
          const x = 30 + k * 30;
          const y = 70 + Math.sin(k * 1.7) * 18;
          ctx.beginPath();
          ctx.moveTo(x - 16, y + 18);
          ctx.lineTo(x, y - 14);
          ctx.lineTo(x + 16, y + 18);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y - 14);
          ctx.lineTo(x + 5, y + 2);
          ctx.stroke();
        }
        // el castillo
        ctx.fillStyle = '#3a2410';
        ctx.fillRect(236, 136, 40, 26);
        for (let k = 0; k < 5; k++) ctx.fillRect(236 + k * 9, 130, 5, 7);
        ctx.fillRect(250, 112, 12, 26);
        // el río y los caminos
        ctx.strokeStyle = '#3a5a7a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 230);
        ctx.bezierCurveTo(150, 200, 320, 260, 512, 214);
        ctx.stroke();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = '#6a2a12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(256, 162);
        ctx.lineTo(210, 240);
        ctx.lineTo(120, 270);
        ctx.stroke();
        ctx.setLineDash([]);
        // las cuatro marcas
        const mk = [['#c83a12', 120, 120], ['#1d7a44', 400, 110], ['#b8900a', 380, 200], ['#2a5aa8', 150, 200]];
        for (const [c, x, y] of mk) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#2a1a0a';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = '#3a2410';
        ctx.font = 'bold 22px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('LA GRAN GUERRA', w / 2, 30);
        ctx.font = 'italic 13px Georgia, serif';
        ctx.fillText('Cordillera de los Andes — tierra de los cuatro caballeros', w / 2, 272);
        ctx.strokeStyle = '#4a3418';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, w - 12, h - 12);
      });
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    });
    const paper = mesh(new THREE.PlaneGeometry(1.5, 0.84), map, 0, 0.905, 0, -Math.PI / 2, 0, 0.06);
    g.add(paper);
    // una daga clavada en el mapa, las velas y el tintero con la pluma
    C(g, 0.012, 0.004, 0.2, M.iron, 0.12, 1.0, 0.05, 0.25, 0, 0, 5);
    B(g, 0.12, 0.02, 0.03, brass(), 0.12, 1.1, 0.03, 0.25, 0, 0);
    C(g, 0.016, 0.016, 0.1, M.leather || wood, 0.12, 1.16, 0.02, 0.25, 0, 0, 6);
    candle(g, -L / 2 + 0.2, 0.9, -0.35, 0.12, 0.035);
    candle(g, L / 2 - 0.18, 0.9, 0.34, 0.2, 0.03);
    C(g, 0.045, 0.05, 0.06, M.black || wood, L / 2 - 0.35, 0.93, -0.34, 0, 0, 0, 10);
    const quill = mesh(new THREE.PlaneGeometry(0.05, 0.3), std('pluma', { color: 0xe8e4dc, roughness: 0.8, side: THREE.DoubleSide }), L / 2 - 0.33, 1.07, -0.34, 0, 0.4, 0.35);
    g.add(quill);
    // rollos de papel
    for (let k = 0; k < 3; k++) C(g, 0.04, 0.04, 0.5, M.paper || std('papel', { color: 0xe0d4b0, roughness: 0.9 }), -L / 2 + 0.4 + k * 0.1, 0.94 + (k === 2 ? 0.07 : 0), 0.3 - (k === 2 ? 0.04 : 0), 0, 0.2 * k, Math.PI / 2, 8);
    return { obj: g, boxes: [[-L / 2, 0, -0.55, L / 2, 1.0, 0.55]] };
  },

  // El horno de barro criollo: la cúpula sobre la base de ladrillo, la boca
  // con brasas, la pala apoyada y unos panes arriba de la base.
  hornoBarro(M) {
    const g = new THREE.Group();
    B(g, 1.9, 0.75, 1.9, M.castleStone || clayDark(), 0, 0.375, 0);
    B(g, 2.0, 0.06, 2.0, M.castleStone || clayDark(), 0, 0.78, 0);
    const dome = mesh(new THREE.SphereGeometry(0.82, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), clay(), 0, 0.8, 0);
    dome.scale.set(1, 0.85, 1);
    g.add(dome);
    // la boca en arco, con el marco más oscuro
    const arch = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 14, 1, false, -Math.PI / 2, Math.PI), clayDark(), 0, 0.8, 0.7, Math.PI / 2, 0, 0);
    g.add(arch);
    const mouth = mesh(new THREE.CircleGeometry(0.24, 12, 0, Math.PI), std('bocaHorno', { color: 0x0a0604, emissive: 0x6a1a04, emissiveIntensity: 0.9 }), 0, 0.81, 0.835);
    g.add(mouth);
    for (let k = 0; k < 5; k++) g.add(mesh(new THREE.DodecahedronGeometry(0.05, 0), emberMat(), -0.12 + k * 0.06, 0.83, 0.62 - (k % 2) * 0.08, k, k, 0));
    flame(g, 0, 0.8, 0.55, 0.3, 0.3);
    // el agujerito de arriba (el tiraje)
    C(g, 0.07, 0.09, 0.12, clayDark(), 0.1, 1.5, 0.3, 0.2, 0, 0, 10);
    // la pala apoyada
    pole(g, V(0.75, 0.02, 0.95), V(0.95, 1.9, 0.72), 0.025, M.wood, 6);
    B(g, 0.3, 0.02, 0.36, M.wood, 0.73, 0.2, 1.02, 1.3, 0.1, 0);
    // panes
    for (let k = 0; k < 4; k++) S(g, 0.1, bread(), -0.62 + k * 0.14, 0.86, 0.8, 1.3, 0.6, 0.9);
    return { obj: g, boxes: [[-0.98, 0, -0.98, 0.98, 1.55, 0.98]] };
  },

  // La alacena de la cocina: el mueble con puertas abajo y estantes arriba
  // con platos enlozados, jarras de barro y ollas de cobre.
  alacena(M, o, r) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const W = o.w || 1.8;
    B(g, W, 0.9, 0.5, wood, 0, 0.45, 0.25);
    for (const s of [-1, 1]) {
      B(g, W / 2 - 0.12, 0.7, 0.03, M.wood || wood, (s * W) / 4, 0.47, 0.51);
      S(g, 0.025, M.iron, s * 0.08, 0.55, 0.54);
    }
    B(g, W + 0.08, 0.05, 0.56, M.beam || wood, 0, 0.93, 0.27);
    B(g, W, 1.35, 0.04, wood, 0, 1.63, 0.02);
    for (const s of [-1, 1]) B(g, 0.05, 1.35, 0.32, wood, (s * (W - 0.05)) / 2, 1.63, 0.16);
    B(g, W + 0.1, 0.09, 0.36, M.beam || wood, 0, 2.33, 0.17);
    for (const y of [1.38, 1.86]) {
      B(g, W - 0.08, 0.035, 0.3, wood, 0, y, 0.16);
      // la varilla que sostiene los platos
      C(g, 0.008, 0.008, W - 0.1, M.iron, 0, y + 0.1, 0.24, 0, 0, Math.PI / 2, 4);
      const n = Math.floor((W - 0.2) / 0.26);
      for (let k = 0; k < n; k++) {
        const x = -W / 2 + 0.2 + k * 0.26;
        if (r() < 0.3) {
          // una jarra o un tarro
          if (r() < 0.5) C(g, 0.07, 0.08, 0.22, terracota(), x, y + 0.13, 0.14, 0, 0, 0, 10);
          else C(g, 0.08, 0.08, 0.16, copper(), x, y + 0.1, 0.14, 0, 0, 0, 12);
          continue;
        }
        const plate = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.018, 18), ceramic(), x, y + 0.14, 0.1, Math.PI / 2 - 0.25, 0, 0);
        g.add(plate);
        g.add(mesh(new THREE.TorusGeometry(0.115, 0.007, 4, 20), blueRim(), x, y + 0.14, 0.11, -0.25, 0, 0));
      }
    }
    return { obj: g, boxes: [[-W / 2 - 0.05, 0, 0, W / 2 + 0.05, 2.4, 0.56]] };
  },

  // Repisa de pared (y0: su altura) con tarros, y ollas de cobre colgando abajo.
  repisa(M, o, r) {
    const g = new THREE.Group();
    const y = o.y0 || 1.7;
    const W = o.w || 1.5;
    const wood = M.woodDark || M.wood;
    B(g, W, 0.04, 0.3, wood, 0, y, 0.15);
    for (const s of [-1, 1]) B(g, 0.04, 0.22, 0.2, M.iron, s * (W / 2 - 0.15), y - 0.12, 0.1);
    for (let x = -W / 2 + 0.15; x < W / 2 - 0.1; x += 0.2 + r() * 0.1) {
      const k = r();
      if (k < 0.4) C(g, 0.06, 0.07, 0.18, terracota(), x, y + 0.11, 0.15, 0, 0, 0, 10);
      else if (k < 0.7) S(g, 0.08, ceramic(), x, y + 0.1, 0.15, 1, 1.1, 1);
      else C(g, 0.04, 0.05, 0.24, std('botella', { color: 0x1a3a1a, roughness: 0.15, metalness: 0.2 }), x, y + 0.14, 0.15, 0, 0, 0, 8);
    }
    // las ollas colgadas de sus ganchos
    for (let k = 0; k < 3; k++) {
      const x = -W / 2 + 0.3 + k * ((W - 0.6) / 2);
      const s = 0.1 + k * 0.03;
      C(g, 0.006, 0.006, 0.14, M.iron, x, y - 0.1, 0.18, 0, 0, 0, 4);
      C(g, s, s * 0.9, 0.06, copper(), x, y - 0.24 - s, 0.18, Math.PI / 2, 0, 0, 14);
      B(g, 0.03, 0.2, 0.01, copper(), x, y - 0.13 - s * 0.3, 0.18);
    }
    return { obj: g, boxes: [] };
  },

  // Ristras colgando de un travesaño: ajos, ajíes, un jamón, charque y yuyos.
  ristras(M, o, r) {
    const g = new THREE.Group();
    const y = o.y0 || 2.3;
    const W = o.w || 1.4;
    const wood = M.woodDark || M.wood;
    B(g, W, 0.08, 0.08, M.beam || wood, 0, y, 0.12);
    for (const s of [-1, 1]) B(g, 0.06, 0.2, 0.14, M.iron, s * (W / 2 - 0.1), y - 0.06, 0.06);
    const n = o.n || 5;
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + 0.2 + (k * (W - 0.4)) / Math.max(1, n - 1);
      const kind = k % 4;
      C(g, 0.006, 0.006, 0.12, M.rope || wood, x, y - 0.1, 0.14, 0, 0, 0, 4);
      if (kind === 0 || kind === 2) {
        // la trenza de ajos
        for (let s = 0; s < 8; s++) S(g, 0.045 + r() * 0.012, kind ? chili() : garlic(), x + (s % 2 ? 0.035 : -0.035), y - 0.2 - s * 0.075, 0.14 + (r() - 0.5) * 0.03, 1, kind ? 1.8 : 0.9, 1);
      } else if (kind === 1) {
        // el jamón
        const leg = mesh(new THREE.SphereGeometry(0.13, 12, 10), ham(), x, y - 0.42, 0.15);
        leg.scale.set(0.9, 1.7, 0.8);
        g.add(leg);
        C(g, 0.03, 0.03, 0.14, ceramic(), x, y - 0.17, 0.15, 0, 0, 0, 6);
      } else {
        // un atado de yuyos (para el mate)
        for (let s = 0; s < 6; s++) g.add(mesh(new THREE.ConeGeometry(0.035, 0.34, 5), herb(), x + (r() - 0.5) * 0.08, y - 0.32, 0.14 + (r() - 0.5) * 0.06, Math.PI + (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
      }
    }
    return { obj: g, boxes: [] };
  },

  // Candil de pared: la chapa, el brazo y la vela gorda con su llamita.
  candil(M, o) {
    const g = new THREE.Group();
    const y = o.y0 || 2.2;
    B(g, 0.12, 0.3, 0.02, M.iron, 0, y, 0.01);
    C(g, 0.012, 0.012, 0.26, M.iron, 0, y - 0.05, 0.14, Math.PI / 2, 0, 0, 5);
    C(g, 0.07, 0.04, 0.04, M.iron, 0, y - 0.05, 0.27, 0, 0, 0, 10);
    candle(g, 0, y - 0.03, 0.27, 0.16, 0.035);
    return { obj: g, boxes: [] };
  },

  // El quincho de las termas: cuatro postes de tronco y el techo de paja a dos
  // aguas con nieve, un banco adentro y ponchos colgados de la viga.
  quincho(M, o) {
    const g = new THREE.Group();
    const W = o.w || 3.4;
    const D = o.d || 2.6;
    const H = 2.5;
    const log = M.log || M.wood;
    const straw = M.straw || M.hay || M.sack;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) C(g, 0.1, 0.12, H, log, (sx * W) / 2, H / 2, (sz * D) / 2, 0, 0, 0, 8);
    for (const sz of [-1, 1]) C(g, 0.08, 0.08, W + 0.3, log, 0, H, (sz * D) / 2, 0, 0, Math.PI / 2, 8);
    C(g, 0.08, 0.08, W + 0.5, log, 0, H + 0.9, 0, 0, 0, Math.PI / 2, 8);
    for (const sx of [-1, 1]) pole(g, V((sx * W) / 2, H, -D / 2), V((sx * W) / 2, H + 0.9, 0), 0.06, log);
    for (const sx of [-1, 1]) pole(g, V((sx * W) / 2, H, D / 2), V((sx * W) / 2, H + 0.9, 0), 0.06, log);
    // las dos aguas de paja, con nieve arriba
    const slope = Math.hypot(D / 2 + 0.5, 1.05);
    const tilt = Math.atan2(1.05, D / 2 + 0.5);
    for (const sz of [-1, 1]) {
      const roof = B(g, W + 0.8, 0.2, slope, straw, 0, H + 0.42, sz * (D / 4 + 0.22), sz * tilt, 0, 0);
      roof.castShadow = true;
      B(g, W + 0.7, 0.06, slope - 0.1, M.snowCap || straw, 0, H + 0.55, sz * (D / 4 + 0.2), sz * tilt, 0, 0);
    }
    // el banco del fondo
    B(g, W - 0.4, 0.07, 0.4, M.wood, 0, 0.45, -D / 2 + 0.35);
    for (const sx of [-1, 1]) B(g, 0.07, 0.42, 0.36, M.woodDark || M.wood, sx * (W / 2 - 0.4), 0.21, -D / 2 + 0.35);
    // ponchos colgados de la viga de atrás
    for (let k = 0; k < 2; k++) {
      const P = PONCHOS[k * 2];
      const cloth = draped(0.8, 1.1, ponchoMat(P[0], P[1], P[2]), 2, 0.04);
      cloth.position.set(-0.7 + k * 1.4, H - 0.56, -D / 2 + 0.05);
      g.add(cloth);
    }
    const p = 0.14;
    return {
      obj: g,
      boxes: [
        [-W / 2 - p, 0, -D / 2 - p, -W / 2 + p, H, -D / 2 + p],
        [W / 2 - p, 0, -D / 2 - p, W / 2 + p, H, -D / 2 + p],
        [-W / 2 - p, 0, D / 2 - p, -W / 2 + p, H, D / 2 + p],
        [W / 2 - p, 0, D / 2 - p, W / 2 + p, H, D / 2 + p],
        [-W / 2 + 0.2, 0, -D / 2 + 0.1, W / 2 - 0.2, 0.5, -D / 2 + 0.6],
      ],
    };
  },

  // Farol en un poste: el brazo y la linterna que cuelga, con nieve arriba.
  farolito(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    B(g, 0.1, 2.1, 0.1, wood, 0, 1.05, 0);
    B(g, 0.08, 0.08, 0.55, wood, 0, 2.0, 0.24);
    pole(g, V(0, 1.7, 0.03), V(0, 1.98, 0.35), 0.02, wood);
    C(g, 0.006, 0.006, 0.12, M.iron, 0, 1.9, 0.44, 0, 0, 0, 4);
    B(g, 0.16, 0.22, 0.16, lamp(), 0, 1.72, 0.44);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.015, 0.24, 0.015, M.iron, x * 0.085, 1.72, 0.44 + z * 0.085);
    g.add(mesh(new THREE.ConeGeometry(0.14, 0.12, 4), M.iron, 0, 1.89, 0.44, 0, Math.PI / 4, 0));
    B(g, 0.12, 0.05, 0.12, M.snowCap || wood, 0, 2.13, 0);
    B(g, 0.1, 0.04, 0.5, M.snowCap || wood, 0, 2.06, 0.26);
    return { obj: g, boxes: [[-0.08, 0, -0.08, 0.08, 2.1, 0.08]] };
  },

  // Balde de madera con zunchos (con agua o vacío) y un cucharón.
  balde(M, o, r) {
    const g = new THREE.Group();
    C(g, 0.21, 0.17, 0.32, M.wood, 0, 0.16, 0, 0, 0, 0, 12);
    for (const y of [0.06, 0.26]) g.add(mesh(new THREE.TorusGeometry(0.2 - (0.26 - y) * 0.12, 0.01, 4, 16), M.iron, 0, y, 0, Math.PI / 2, 0, 0));
    g.add(mesh(new THREE.CircleGeometry(0.19, 14), std('aguaBalde', { color: 0x1a3a3a, roughness: 0.1, metalness: 0.2 }), 0, 0.27, 0, -Math.PI / 2, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.008, 4, 14, Math.PI), M.iron, 0, 0.32, 0, 0, r() * 3, 0));
    pole(g, V(0.05, 0.2, 0), V(0.22, 0.48, 0.05), 0.012, M.woodDark || M.wood, 5);
    return { obj: g, boxes: [[-0.22, 0, -0.22, 0.22, 0.34, 0.22]] };
  },

  // El tendedero: dos postes con una soga y ponchos secándose.
  tendedero(M, o) {
    const g = new THREE.Group();
    const L = o.len || 3;
    const wood = M.woodDark || M.wood;
    for (const s of [-1, 1]) {
      B(g, 0.09, 1.9, 0.09, wood, (s * L) / 2, 0.95, 0);
      B(g, 0.1, 0.05, 0.1, M.snowCap || wood, (s * L) / 2, 1.92, 0);
    }
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(V(-L / 2 + L * t, 1.8 - Math.sin(t * Math.PI) * 0.18, 0));
    }
    for (let k = 0; k < 8; k++) pole(g, pts[k], pts[k + 1], 0.008, M.rope || wood, 4);
    const n = o.n || 3;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const P = PONCHOS[(k + (o.seed || 0)) % PONCHOS.length];
      const cloth = draped((L / n) * 0.8, 1.0, ponchoMat(P[0], P[1], P[2]), 2, 0.05);
      cloth.position.set(-L / 2 + L * t, 1.8 - Math.sin(t * Math.PI) * 0.18 - 0.5, 0);
      g.add(cloth);
    }
    return { obj: g, boxes: [[-L / 2 - 0.06, 0, -0.06, -L / 2 + 0.06, 1.9, 0.06], [L / 2 - 0.06, 0, -0.06, L / 2 + 0.06, 1.9, 0.06]] };
  },

  // Banco de tablón (len de largo).
  banco(M, o) {
    const g = new THREE.Group();
    const L = o.len || 1.6;
    B(g, L, 0.07, 0.36, M.wood, 0, 0.45, 0);
    for (const s of [-1, 1]) B(g, 0.07, 0.42, 0.32, M.woodDark || M.wood, s * (L / 2 - 0.18), 0.21, 0);
    if (o.snow) B(g, L - 0.05, 0.05, 0.3, M.snowCap || M.wood, 0, 0.51, 0);
    return { obj: g, boxes: [[-L / 2, 0, -0.2, L / 2, 0.5, 0.2]] };
  },
  // El tesoro del Mateendrache: un montón de monedas de oro, mates de todos
  // los colores, bombillas de plata, paquetes de yerba y alguna gema que brilla.
  tesoro(M, o, r) {
    const g = new THREE.Group();
    const R = o.r || 1.6;
    const gold = std('oroTesoro', { color: 0xd8a83a, roughness: 0.3, metalness: 0.95, emissive: 0x3a2400, emissiveIntensity: 0.4 });
    const mound = mesh(new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 0, 0);
    mound.scale.set(1, 0.35, 0.85);
    g.add(mound);
    const coin = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10);
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * R * 1.15;
      const h = Math.max(0, (1 - (d / R) ** 2)) * R * 0.35;
      g.add(mesh(coin, gold, Math.cos(a) * d, h + 0.01, Math.sin(a) * d * 0.85, (r() - 0.5) * 1.2, r() * 3, (r() - 0.5) * 1.2));
    }
    const gourds = [0x7a4a22, 0x3a2418, 0x8e1d16, 0x1d5a34, 0x183e74, 0xb08a3a];
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2;
      const d = (0.3 + r() * 0.6) * R;
      const h = Math.max(0, 1 - (d / R) ** 2) * R * 0.35;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d * 0.85;
      S(g, 0.13, std(`mateT${k % 6}`, { color: gourds[k % 6], roughness: 0.45, metalness: k % 6 === 5 ? 0.8 : 0.1 }), x, h + 0.1, z, 1, 1.15, 1);
      pole(g, V(x, h + 0.2, z), V(x + (r() - 0.5) * 0.12, h + 0.46, z + (r() - 0.5) * 0.12), 0.008, M.silver || gold, 5);
    }
    const packs = [M.packRed, M.packYellow, M.packGreen, M.packBlue].filter(Boolean);
    for (let k = 0; k < 5 && packs.length; k++) {
      const a = r() * Math.PI * 2;
      const d = (0.8 + r() * 0.35) * R;
      B(g, 0.2, 0.32, 0.12, packs[k % packs.length], Math.cos(a) * d, 0.12, Math.sin(a) * d * 0.85, (r() - 0.5) * 0.8, r() * 3, 1.2);
    }
    const gems = [0xff5a2a, 0x5aff9a, 0xffe45a, 0x7ad0ff];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r();
      const d = r() * R * 0.6;
      const h = Math.max(0, 1 - (d / R) ** 2) * R * 0.35;
      g.add(mesh(new THREE.OctahedronGeometry(0.09, 0), std(`gemaT${k}`, { color: gems[k], emissive: gems[k], emissiveIntensity: 1.4, roughness: 0.1 }), Math.cos(a) * d, h + 0.08, Math.sin(a) * d * 0.85, r(), r(), r()));
    }
    return { obj: g, boxes: [[-R * 0.8, 0, -R * 0.65, R * 0.8, R * 0.3, R * 0.65]] };
  },

  // Cristales de la cueva: prismas que brillan solos (color, cuántos, altura).
  cristales(M, o, r) {
    const g = new THREE.Group();
    const col = o.color ?? 0x6ad8ff;
    const m = std(`cristal${col}`, { color: col, emissive: col, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
    const n = o.n || 7;
    for (let k = 0; k < n; k++) {
      const h = (0.5 + r() * 1.3) * (o.h || 1);
      const c = mesh(new THREE.CylinderGeometry(0, 0.1 + r() * 0.08, h, 6), m, (r() - 0.5) * 0.8, h / 2 - 0.05, (r() - 0.5) * 0.8, (r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
      c.castShadow = false;
      g.add(c);
    }
    const base = mesh(new THREE.DodecahedronGeometry(0.35, 0), M.caveRock || M.rock || M.stone, 0, 0.05, 0, r(), r(), r());
    base.scale.set(1.3, 0.5, 1.1);
    g.add(base);
    return { obj: g, boxes: [[-0.4, 0, -0.4, 0.4, 0.8, 0.4]] };
  },

  // Estalactitas de piedra colgando del techo de la cueva (top: alto del techo).
  estalactitas(M, o, r) {
    const g = new THREE.Group();
    const top = o.top || 10;
    const rock = M.caveRock || M.rock || M.stone;
    const n = o.n || 8;
    for (let k = 0; k < n; k++) {
      const h = 1 + r() * (o.h || 3.5);
      const c = mesh(new THREE.ConeGeometry(0.2 + r() * 0.35, h, 6), rock, (r() - 0.5) * (o.w || 4), top - h / 2, (r() - 0.5) * (o.d || 4), Math.PI, r() * 3, 0);
      c.castShadow = false;
      g.add(c);
    }
    return { obj: g, boxes: [] };
  },

  // Las grietas con brasas en el piso donde duerme el dragón (el calor de su pecho).
  brasasSuelo(M, o) {
    const g = new THREE.Group();
    const R = o.r || 6;
    const m = mat('grietasBrasa', () => {
      const tex = canvasTex('castleEmberCracks', 512, 512, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        let seed = 17;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        ctx.lineCap = 'round';
        for (let k = 0; k < 26; k++) {
          let x = W / 2 + (rnd() - 0.5) * 120;
          let y = H / 2 + (rnd() - 0.5) * 120;
          const a0 = rnd() * Math.PI * 2;
          const pts = [[x, y]];
          for (let s = 0; s < 9; s++) {
            const a = a0 + (rnd() - 0.5) * 1.2;
            x += Math.cos(a) * 22;
            y += Math.sin(a) * 22;
            pts.push([x, y]);
          }
          for (const [lw, col] of [[9, 'rgba(255,90,20,0.25)'], [4, 'rgba(255,140,40,0.8)'], [1.6, 'rgba(255,230,160,1)']]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.beginPath();
            pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
            ctx.stroke();
          }
        }
        // se apaga hacia el borde
        ctx.globalCompositeOperation = 'destination-in';
        const fade = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W / 2);
        fade.addColorStop(0, 'rgba(0,0,0,1)');
        fade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, H);
      });
      return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    });
    const d = mesh(new THREE.PlaneGeometry(R * 2, R * 2), m, 0, 0.02, 0, -Math.PI / 2, 0, 0);
    d.castShadow = false;
    d.receiveShadow = false;
    d.renderOrder = 3;
    g.add(d);
    return { obj: g, boxes: [] };
  },

  // El botellero de la bodega: casilleros de madera con las botellas acostadas
  // (el culo de cada una asoma) y un cartel de Malbec.
  botellero(M, o, r) {
    const g = new THREE.Group();
    const W = o.w || 2;
    const H = o.h || 2.2;
    const wood = M.woodDark || M.wood;
    B(g, W, H, 0.06, wood, 0, H / 2, 0.03);
    for (const s of [-1, 1]) B(g, 0.06, H, 0.4, wood, (s * (W - 0.06)) / 2, H / 2, 0.2);
    B(g, W + 0.06, 0.06, 0.42, M.beam || wood, 0, H, 0.21);
    const cols = Math.floor(W / 0.2);
    const rows = Math.floor((H - 0.2) / 0.2);
    const glass = std('botellaVino', { color: 0x14240f, roughness: 0.12, metalness: 0.3 });
    const cork = std('corcho', { color: 0x8a6a42, roughness: 0.9 });
    for (let i = 0; i < rows; i++) {
      B(g, W - 0.1, 0.02, 0.38, wood, 0, 0.12 + i * 0.2, 0.2);
      for (let j = 0; j < cols; j++) {
        if (r() < 0.14) continue;
        const x = -W / 2 + 0.1 + j * ((W - 0.2) / (cols - 1));
        const y = 0.22 + i * 0.2;
        g.add(mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.3, 8), glass, x, y, 0.2, Math.PI / 2, 0, 0));
        if (r() < 0.4) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), cork, x, y, 0.36, Math.PI / 2, 0, 0));
      }
    }
    const sign = mat('malbecSign', () => {
      const tex = canvasTex('castleMalbec', 256, 64, (ctx, w, h) => {
        ctx.fillStyle = '#3a1a14';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e8d0a0';
        ctx.font = 'bold 30px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MALBEC · 1ª GUERRA', w / 2, h / 2 + 2);
      });
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    });
    g.add(mesh(new THREE.PlaneGeometry(1.1, 0.28), sign, 0, H + 0.22, 0.05));
    return { obj: g, boxes: [[-W / 2, 0, 0, W / 2, H, 0.42]] };
  },

  // La mesa de cata: un tonel parado con una vela, una botella, dos copas y un queso.
  mesaVino(M) {
    const g = new THREE.Group();
    C(g, 0.42, 0.46, 1.0, M.wood, 0, 0.5, 0, 0, 0, 0, 14);
    for (const y of [0.15, 0.85]) g.add(mesh(new THREE.TorusGeometry(0.45, 0.014, 4, 18), M.iron, 0, y, 0, Math.PI / 2, 0, 0));
    C(g, 0.44, 0.44, 0.04, M.woodDark || M.wood, 0, 1.02, 0, 0, 0, 0, 14);
    candle(g, -0.2, 1.04, -0.1, 0.14, 0.03);
    C(g, 0.04, 0.045, 0.26, std('botellaVino', { color: 0x14240f, roughness: 0.12, metalness: 0.3 }), 0.12, 1.17, 0.08, 0, 0, 0, 8);
    const cup = std('copa', { color: 0xdde8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
    for (const [x, z] of [[0.05, -0.2], [0.25, -0.05]]) {
      C(g, 0.035, 0.012, 0.07, cup, x, 1.12, z, 0, 0, 0, 8);
      C(g, 0.004, 0.004, 0.06, cup, x, 1.06, z, 0, 0, 0, 4);
      C(g, 0.03, 0.03, 0.02, std('vinoTinto', { color: 0x4a0a14, roughness: 0.2 }), x, 1.11, z, 0, 0, 0, 8);
    }
    const cheese = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12, 1, false, 0, Math.PI * 1.6), std('queso', { color: 0xe0b050, roughness: 0.7 }), -0.12, 1.08, 0.18);
    g.add(cheese);
    return { obj: g, boxes: [[-0.46, 0, -0.46, 0.46, 1.05, 0.46]] };
  },

  // Barrica de roble panzona con sus aros de hierro (la del castillo: nada de
  // tambores de chapa), la tapa un poco hundida y el tapón de costado.
  barrica(M, o, r) {
    const g = new THREE.Group();
    const staves = mat('duelas', () => {
      const tex = canvasTex('castleDuelas', 256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#7a5030';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) {
          const x = (i * w) / 16;
          ctx.fillStyle = `rgba(${90 + ((i * 37) % 40)}, ${56 + ((i * 23) % 24)}, 30, 0.55)`;
          ctx.fillRect(x + 1, 0, w / 16 - 2, h);
          ctx.fillStyle = 'rgba(30, 16, 8, 0.8)';
          ctx.fillRect(x, 0, 1.5, h);
          // la veta de cada duela
          ctx.strokeStyle = 'rgba(50, 28, 14, 0.35)';
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(x + 3 + k * 4, 0);
            ctx.bezierCurveTo(x + 5 + k * 4, h * 0.3, x + 1 + k * 4, h * 0.7, x + 4 + k * 4, h);
            ctx.stroke();
          }
        }
      });
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
    });
    const prof = [[0.25, 0], [0.285, 0.14], [0.31, 0.32], [0.318, 0.45], [0.31, 0.58], [0.285, 0.76], [0.25, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(mesh(new THREE.LatheGeometry(prof, 16), staves, 0, 0, 0, 0, r() * 6, 0));
    const iron = M.iron || M.metal;
    for (const [y, rad] of [[0.07, 0.262], [0.2, 0.296], [0.7, 0.296], [0.83, 0.262]]) g.add(mesh(new THREE.TorusGeometry(rad, 0.013, 4, 20), iron, 0, y, 0, Math.PI / 2, 0, 0));
    // la tapa: un disco apenas hundido adentro del canto
    C(g, 0.245, 0.245, 0.02, std('tapaBarrica', { color: 0x5a3a20, roughness: 0.85 }), 0, 0.88, 0, 0, 0, 0, 16);
    C(g, 0.03, 0.035, 0.05, std('corcho', { color: 0x8a6a42, roughness: 0.9 }), 0, 0.45, 0.318, Math.PI / 2, 0, 0, 8);
    return { obj: g, boxes: [[-0.32, 0, -0.32, 0.32, 0.9, 0.32]] };
  },

  // El escritorio del cronista: la mesa pesada con cajón, el libro abierto,
  // el tintero con la pluma, una vela, pergaminos enrollados y la silla.
  escritorio(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const paper = M.paper || std('papel', { color: 0xe0d4b0, roughness: 0.9 });
    B(g, 1.6, 0.07, 0.8, wood, 0, 0.78, 0);
    for (const [x, z] of [[-0.72, -0.33], [0.72, -0.33], [-0.72, 0.33], [0.72, 0.33]]) C(g, 0.05, 0.04, 0.75, wood, x, 0.375, z, 0, 0, 0, 8);
    B(g, 1.4, 0.14, 0.02, wood, 0, 0.66, 0.39);
    C(g, 0.02, 0.02, 0.04, M.brass || M.iron, 0, 0.66, 0.41, Math.PI / 2, 0, 0, 6);
    // el libro abierto sobre la tapa de cuero
    B(g, 0.52, 0.02, 0.35, M.leather || wood, 0, 0.825, 0.02);
    for (const s of [-1, 1]) B(g, 0.24, 0.025, 0.31, paper, s * 0.125, 0.845, 0.02, 0, 0, -s * 0.07);
    // el tintero y la pluma
    C(g, 0.035, 0.042, 0.06, M.black, 0.5, 0.845, -0.2, 0, 0, 0, 8);
    g.add(mesh(new THREE.ConeGeometry(0.014, 0.3, 4), M.clothWhite || paper, 0.53, 0.95, -0.2, 0.25, 0, -0.35));
    candle(g, -0.6, 0.815, -0.25, 0.14, 0.024);
    // pergaminos enrollados
    for (let k = 0; k < 3; k++) C(g, 0.03, 0.03, 0.34, paper, -0.35 + k * 0.07, 0.845 + (k === 2 ? 0.05 : 0), 0.24 - (k === 2 ? 0.03 : 0), 0, 0.25 * k, Math.PI / 2, 8);
    // la silla de madera, del lado de atrás
    B(g, 0.46, 0.05, 0.44, wood, 0, 0.47, -0.72);
    for (const [x, z] of [[-0.2, -0.52], [0.2, -0.52], [-0.2, -0.92], [0.2, -0.92]]) C(g, 0.025, 0.025, 0.47, wood, x, 0.235, z, 0, 0, 0, 6);
    for (const x of [-0.2, 0.2]) C(g, 0.028, 0.028, 0.6, wood, x, 0.78, -0.93, 0, 0, 0, 6);
    for (const y of [0.78, 1.02]) B(g, 0.42, 0.07, 0.03, wood, 0, y, -0.93);
    return { obj: g, boxes: [[-0.82, 0, -0.42, 0.82, 0.9, 0.42]] };
  },

  // Las herramientas de la herrería: una tabla en la pared con herraduras,
  // tenazas y martillos colgados de clavos.
  herramientas(M, o) {
    const g = new THREE.Group();
    const w = o.w || 1.6;
    const y0 = o.y0 ?? 1.2;
    const wood = M.woodDark || M.wood;
    const iron = M.iron || M.metal;
    // la tabla clara, para que se vea el hierro
    B(g, w, 0.8, 0.04, M.wood || wood, 0, y0 + 0.4, 0.02);
    const n = Math.max(3, Math.round(w / 0.27));
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + (k + 0.5) * (w / n);
      const top = y0 + 0.68;
      C(g, 0.008, 0.008, 0.07, iron, x, top, 0.07, Math.PI / 2, 0, 0, 4);
      if (k % 3 === 0) {
        // la herradura, con la abertura para abajo
        const hs = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.013, 5, 12, Math.PI * 1.3), iron);
        hs.position.set(x, top - 0.065, 0.06);
        hs.rotation.z = -0.15 * Math.PI;
        g.add(hs);
      } else if (k % 3 === 1) {
        // las tenazas: dos brazos largos que se cruzan en el perno
        for (const s of [-1, 1]) g.add(mesh(boxGeo(0.018, 0.5, 0.012), iron, x + s * 0.02, top - 0.3, 0.06, 0, 0, s * 0.06));
        g.add(mesh(boxGeo(0.05, 0.07, 0.02), iron, x, top - 0.04, 0.06));
      } else {
        // el martillo: el cabo de madera y la cabeza de hierro
        g.add(mesh(cylGeo(0.014, 0.016, 0.42, 6), wood, x, top - 0.23, 0.065));
        g.add(mesh(boxGeo(0.13, 0.05, 0.05), iron, x, top - 0.45, 0.065));
      }
    }
    return { obj: g, boxes: [] };
  },

  // Un gaucho que se quedó para siempre en la mazmorra: el esqueleto sentado
  // contra la pared, con el sombrero caído y el mate vacío al lado.
  esqueleto(M) {
    const g = new THREE.Group();
    const bone = std('hueso', { color: 0xd8cfb4, roughness: 0.7 });
    S(g, 0.11, bone, 0, 0.78, 0.14, 1, 1.1, 1.05);
    B(g, 0.1, 0.05, 0.08, bone, 0, 0.68, 0.2);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.025, 6, 5), std('ojera', { color: 0x0a0806, roughness: 1 }), s * 0.04, 0.8, 0.24));
    // la columna y las costillas
    pole(g, V(0, 0.64, 0.1), V(0, 0.2, 0.08), 0.02, bone, 5);
    for (let k = 0; k < 5; k++) g.add(mesh(new THREE.TorusGeometry(0.09 - k * 0.006, 0.009, 4, 12, Math.PI * 1.4), bone, 0, 0.56 - k * 0.06, 0.12, Math.PI / 2, 0, -Math.PI * 0.2));
    B(g, 0.26, 0.06, 0.12, bone, 0, 0.18, 0.1);
    // las piernas estiradas y los brazos caídos
    for (const s of [-1, 1]) {
      pole(g, V(s * 0.09, 0.14, 0.12), V(s * 0.11, 0.1, 0.5), 0.022, bone, 5);
      pole(g, V(s * 0.11, 0.1, 0.5), V(s * 0.12, 0.05, 0.86), 0.018, bone, 5);
      pole(g, V(s * 0.14, 0.6, 0.1), V(s * 0.2, 0.36, 0.18), 0.016, bone, 5);
      pole(g, V(s * 0.2, 0.36, 0.18), V(s * 0.22, 0.12, 0.34), 0.014, bone, 5);
    }
    // el sombrero en el piso y el mate
    const hat = new THREE.Group();
    hat.position.set(0.42, 0.02, 0.5);
    hat.rotation.set(0.1, 0.6, 0.15);
    hat.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 16), M.black || bone, 0, 0.01, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), M.black || bone, 0, 0.08, 0));
    g.add(hat);
    S(g, 0.07, std('mateVacio', { color: 0x5a3a1a, roughness: 0.6 }), -0.36, 0.08, 0.45, 1, 1.15, 1);
    pole(g, V(-0.36, 0.14, 0.45), V(-0.33, 0.3, 0.47), 0.006, M.silver || bone, 4);
    return { obj: g, boxes: [[-0.3, 0, 0, 0.3, 0.6, 0.9]] };
  },
};

// (Eclipse Matero, world/eclipse/v5.js: arma la biblioteca y las fachadas en sus secciones iguales)
export { library, busyWalls, booksMat, facades, windowMats };
