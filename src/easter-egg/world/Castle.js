import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { buildTrim } from './castleTrim';
import { buildRooms } from './castleRooms';
import { buildCaves } from './castleCaves';
import { buildHalls } from './castleHalls';
import { buildCastleAO } from './castleAO';
import { sparkle, buildTracks } from './castleSnow';
import { indoorGrid, weathering } from './castleWeathering';
import { MAP_W, MAP_H, ZONES, PROPS, RAMPS, zoneRects } from '../config/map';
import { castleTerrain, macroY } from './Mountain';
import { quadUV, rampY } from './Levels';
import { flameMaterial } from './castleFire';
import { NATURE } from './castleNature';

// Arquitectura propia del castillo del Mateendrache, encima de la de
// world/Levels.js (que arma paredes, pisos, techos y escaleras):
//  · ganchos para Levels: las almenas en vez de barandas de hierro, un
//    parapeto de piedra en los desniveles, los puentes sin pared hasta el
//    fondo del barranco y el terreno de la montaña (Mountain.js);
//  · lo que se ve de afuera: los techos de pizarra a dos aguas con nieve, el
//    lomo de los puentes con sus arcos y la torre de la barbacana.

const RAIL_H = 1.05;
const MERLON = 0.72;
const OUT = 0;
const FLOOR = 1;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Estilo del borde de una zona a cielo abierto: 'almena' (murallas, miradores,
// cumbre), 'puente', 'roca' (las termas) o 'cerca' (el palenque).
function railStyle(k) {
  return ZONES[k]?.rail || 'almena';
}

// La zona a cielo abierto que toca una celda de borde (la de más arriba).
function railZone(w, x, z) {
  let best = null;
  let by = -Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx;
      const cz = z + dz;
      if (!w.inside(cx, cz)) continue;
      const i = w.idx(cx, cz);
      if (w.grid[i] !== FLOOR) continue;
      if (w.fy[i] > by) {
        by = w.fy[i];
        best = w.zoneKeys[w.zone[i]];
      }
    }
  }
  return best;
}

// ¿Esta celda es parte de un puente? (el rectángulo lleva un 1 en el lugar 6)
function bridgeRect(k, x, z) {
  for (const r of zoneRects(k)) if (r[6] && x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return r;
  return null;
}

// ¿La celda de borde está al costado del tramo del puente levadizo? (un 2 en el lugar 6)
function besideDrawbridge(w, x, z) {
  for (const [dx, dz] of DIRS) {
    const cx = x + dx;
    const cz = z + dz;
    if (!w.inside(cx, cz)) continue;
    const i = w.idx(cx, cz);
    if (w.grid[i] !== FLOOR) continue;
    const r = bridgeRect(w.zoneKeys[w.zone[i]], cx, cz);
    if (r && r[6] === 2) return true;
  }
  return false;
}

// Celda de borde pegada a un puente (del costado, no en las puntas).
function bridgeSide(w, x, z) {
  for (const [dx, dz] of DIRS) {
    const cx = x + dx;
    const cz = z + dz;
    if (!w.inside(cx, cz)) continue;
    const i = w.idx(cx, cz);
    if (w.grid[i] !== FLOOR) continue;
    const k = w.zoneKeys[w.zone[i]];
    if (bridgeRect(k, cx, cz)) return true;
  }
  return false;
}

// Los ganchos que usa Levels (se ponen antes de armar la grilla).
export function installCastleHooks(w) {
  w.terrain = castleTerrain;
  w.openEdges = castleEdges;
  w.dropEdge = dropParapet;
  // al costado de un puente la cara de piedra baja solo el espesor del tablero
  w.curbBase = (x, z, base, top) => (bridgeSide(w, x, z) ? Math.max(base, top - 1.5) : base);
  w.noBars = true;
}

// ---------------- almenas, barandas y cercas ----------------
function castleEdges(w, gb) {
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      if (t === OUT || t === FLOOR || w.edge[i] !== 3) continue;
      // ventanas y puertas del borde: sin parapeto (ahí pasan las tablas o la reja)
      if (t !== 2) continue;
      const k = railZone(w, x, z);
      if (!k) continue;
      const style = railStyle(k);
      const fy = w.fy[i];
      if (style === 'cerca') {
        // el palenque: postes de algarrobo y dos travesaños
        gb.box('woodDark', x + 0.4, fy, z + 0.4, x + 0.6, fy + 1.25, z + 0.6);
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const j = w.inside(x + dx, z + dz) ? w.idx(x + dx, z + dz) : -1;
          if (j < 0 || w.grid[j] === OUT || w.grid[j] === FLOOR || w.edge[j] !== 3) continue;
          for (const y of [0.45, 1.0]) {
            if (dx) gb.box('wood', x + 0.5, fy + y, z + 0.46, x + 1.5, fy + y + 0.1, z + 0.54);
            else gb.box('wood', x + 0.46, fy + y, z + 0.5, x + 0.54, fy + y + 0.1, z + 1.5);
          }
        }
        continue;
      }
      if (style === 'roca') {
        // las termas: piedras sueltas con nieve (las arma buildCastle, de a
        // muchas juntas); al costado del puente levadizo no (ahí es el vacío)
        if (!besideDrawbridge(w, x, z)) (w.edgeRocks ||= []).push([x + 0.5, fy, z + 0.5]);
        continue;
      }
      almena(w, gb, x, z, i, style);
    }
  }
  // los parapetos de los desniveles (los anotó dropParapet mientras Levels armaba)
  buildDropRails(w, gb);
}

// El piso en la esquina (cx, cz) de la grilla: el más alto de las celdas
// caminables que la tocan (en una escalera, la altura de la rampa ahí).
function cornerFloor(w, cx, cz) {
  let best = -Infinity;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const x = cx + dx;
    const z = cz + dz;
    if (!w.inside(x, z)) continue;
    const i = w.idx(x, z);
    if (w.grid[i] !== FLOOR) continue;
    const r = w.rampAt[i];
    best = Math.max(best, r >= 0 ? rampY(RAMPS[r], cx, cz) : w.fy[i]);
  }
  return best;
}

// Un parapeto de borde (una celda): el cuerpo con la tapa inclinada si al
// lado sube una escalera (los puentes de la cumbre), la albardilla que vuela
// un poco, y en las almenas, una sí y una no, el merlón con su tronera y el
// gorro de nieve. Del lado de afuera, si abajo hay un buen vacío, ménsulas
// (el matacán) y una moldura.
function almena(w, gb, x, z, i, style) {
  const fy = w.fy[i];
  // las cuatro esquinas: 00, 10, 11, 01 (las que no tocan piso copian a la vecina)
  const C = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
  const h = C.map(([cx, cz]) => cornerFloor(w, cx, cz));
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < 4; k++) {
      if (Number.isFinite(h[k])) continue;
      const a = h[(k + 1) % 4];
      const b = h[(k + 3) % 4];
      if (Number.isFinite(a) && Number.isFinite(b)) h[k] = (a + b) / 2;
      else if (Number.isFinite(a)) h[k] = a;
      else if (Number.isFinite(b)) h[k] = b;
    }
  }
  for (let k = 0; k < 4; k++) if (!Number.isFinite(h[k])) h[k] = fy;
  const H = style === 'puente' ? 0.95 : RAIL_H;
  const low = Math.min(...h) - 0.12;
  const P = (k, y) => [C[k][0], y, C[k][1]];
  const walk = (dx, dz) => {
    const nx = x + dx;
    const nz = z + dz;
    return w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR;
  };
  // los cuatro lados: [esquina a, esquina b, hacia dónde mira]
  const SIDES = [[0, 1, [0, -1]], [1, 2, [1, 0]], [2, 3, [0, 1]], [3, 0, [-1, 0]]];
  const inset = (k, d) => {
    // la esquina k corrida d hacia adentro de la celda
    const [cx, cz] = C[k];
    return [cx + (cx === x ? d : -d), cz + (cz === z ? d : -d)];
  };
  // un prisma de la celda (inset d) de y0 (plano) o sobre la tapa, hasta la tapa + t
  const prism = (key, d, b0, b1, topKey, flatBottom) => {
    const Q = [0, 1, 2, 3].map((k) => inset(k, d));
    const y0 = (k) => (flatBottom ? low : h[k] + b0);
    const y1 = (k) => h[k] + b1;
    for (const [a, b, n] of SIDES) {
      const pts = [[Q[a][0], y0(a), Q[a][1]], [Q[b][0], y0(b), Q[b][1]], [Q[b][0], y1(b), Q[b][1]], [Q[a][0], y1(a), Q[a][1]]];
      const along = n[0] ? 2 : 0;
      quadUV(gb, key, pts, pts.map((p) => [p[along] / 2, p[1] / 3.6]), [n[0], 0, n[1]]);
    }
    const top = Q.map((q, k) => [q[0], y1(k), q[1]]);
    quadUV(gb, topKey, top, top.map((p) => [p[0] / 2, p[2] / 2]), [0, 1, 0]);
    if (!flatBottom) {
      const bot = Q.map((q, k) => [q[0], y0(k), q[1]]);
      quadUV(gb, key, bot, bot.map((p) => [p[0] / 2, p[2] / 2]), [0, -1, 0]);
    }
  };
  // el cuerpo y la albardilla (vuela 5 cm) con nieve
  prism('castleStone', 0, 0, H - 0.1, 'castleStone', true);
  prism('stoneStep', -0.05, H - 0.1, H, 'snowCap', false);
  // matacán: donde afuera hay un vacío de verdad, ménsulas bajo el borde y una moldura
  for (const [a, b, n] of SIDES) {
    const nx = x + n[0];
    const nz = z + n[1];
    if (!w.inside(nx, nz)) continue;
    const j = w.idx(nx, nz);
    if (w.grid[j] !== OUT || w.ty[j] > fy - 3.5) continue;
    const [ax, az] = C[a];
    const [bx, bz] = C[b];
    const ox = n[0] * 0.001;
    const oz = n[1] * 0.001;
    for (const u of [0.25, 0.75]) {
      const px = ax + (bx - ax) * u + ox;
      const pz = az + (bz - az) * u + oz;
      const y = Math.min(h[a], h[b]);
      const lx = n[0] ? 0 : 0.11;
      const lz = n[0] ? 0.11 : 0;
      gb.box('castleStone', Math.min(px - lx, px + n[0] * 0.26), y - 0.62, Math.min(pz - lz, pz + n[1] * 0.26), Math.max(px + lx, px + n[0] * 0.26), y - 0.14, Math.max(pz + lz, pz + n[1] * 0.26), 1);
    }
    const y = Math.min(h[a], h[b]) - 0.14;
    const x0 = Math.min(ax, bx) - (n[0] ? 0 : 0.01);
    const x1 = Math.max(ax, bx) + (n[0] ? 0 : 0.01);
    const z0 = Math.min(az, bz) - (n[1] ? 0 : 0.01);
    const z1 = Math.max(az, bz) + (n[1] ? 0 : 0.01);
    gb.box('stoneStep', Math.min(x0, x0 + n[0] * 0.3), y, Math.min(z0, z0 + n[1] * 0.3), Math.max(x1, x1 + n[0] * 0.3), y + 0.14, Math.max(z1, z1 + n[1] * 0.3), 1);
  }
  if (style !== 'almena' || (x + z) % 2) return;
  // el merlón (con su gorro de nieve) y la tronera hacia afuera
  const m0 = H;
  const m1 = H + MERLON;
  prism('castleStone', 0.07, m0, m1 - 0.06, 'castleStone', false);
  prism('stoneStep', 0.03, m1 - 0.06, m1, 'snowCap', false);
  for (const [a, b, n] of SIDES) {
    if (walk(n[0], n[1])) continue;
    const [ax, az] = inset(a, 0.07);
    const [bx, bz] = inset(b, 0.07);
    const mx = (ax + bx) / 2 + n[0] * 0.004;
    const mz = (az + bz) / 2 + n[1] * 0.004;
    const y = (h[a] + h[b]) / 2 + m0 + 0.12;
    const hx = n[0] ? 0.004 : 0.045;
    const hz = n[0] ? 0.045 : 0.004;
    gb.box('black', mx - hx, y, mz - hz, mx + hx, y + 0.42, mz + hz, 1);
  }
  w.addBox([x, Math.min(...h) + m0, z, x + 1, Math.max(...h) + m1, z + 1], { kind: 'wall' });
}

// Parapeto en un desnivel adentro de una zona (el borde del adarve sobre el
// patio, los costados de las escaleras). Levels avisa cada borde de celda con
// sus dos puntas a y b y hacia dónde queda lo bajo (dx, dz); acá se anotan y
// castleEdges los junta en tramos derechos (buildDropRails): así cada tramo
// es un muro macizo con su albardilla, una balaustrada o una baranda de palo,
// con pilares en las puntas sueltas. Devuelve true (Levels no pone su baranda).
function dropParapet(w, gb, i, ax, az, ya, bx, bz, yb, dx, dz) {
  const k = w.zoneKeys[w.zone[i]];
  const r = w.rampAt[i];
  const style = (r >= 0 && RAMPS[r].rail) || (ZONES[k]?.outdoor ? 'muroNieve' : 'muro');
  const alongZ = dx !== 0;
  let t0 = alongZ ? az : ax;
  let t1 = alongZ ? bz : bx;
  let y0 = ya;
  let y1 = yb;
  if (t1 < t0) {
    [t0, t1] = [t1, t0];
    [y0, y1] = [y1, y0];
  }
  (w.dropSegs ||= []).push({ line: alongZ ? ax : az, alongZ, dx, dz, t0, t1, y0, y1, style });
  return true;
}

// Cada estilo: alto y espesor (el espesor va del lado de arriba del borde).
const RAIL = {
  muro: { h: 0.95, th: 0.3, key: 'stoneStep', cap: 'stoneStep' },
  muroNieve: { h: 1.05, th: 0.34, key: 'castleStone', cap: 'snowCap' },
  balaustrada: { h: 1.0, th: 0.34, key: 'stoneStep', cap: 'stoneStep' },
  madera: { h: 1.0, th: 0.12, key: 'woodDark', cap: 'wood' },
};

function buildDropRails(w, gb) {
  const groups = new Map();
  for (const s of w.dropSegs || []) {
    const key = `${s.alongZ ? 'x' : 'z'}${s.line.toFixed(2)}|${s.dx}|${s.dz}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const bal = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.t0 - b.t0);
    let run = [];
    for (const s of list) {
      const prev = run[run.length - 1];
      if (prev && (Math.abs(prev.t1 - s.t0) > 0.01 || Math.abs(prev.y1 - s.y0) > 0.05 || prev.style !== s.style)) {
        railRun(w, gb, run, bal);
        run = [];
      }
      run.push(s);
    }
    if (run.length) railRun(w, gb, run, bal);
  }
  w.dropSegs = null;
  if (!bal.length) return;
  // los balaustres (torneados), todos en una sola malla por material
  const pts = [[0.075, 0], [0.075, 0.07], [0.05, 0.11], [0.058, 0.2], [0.092, 0.38], [0.098, 0.47], [0.07, 0.62], [0.044, 0.76], [0.058, 0.85], [0.078, 0.92], [0.078, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 8);
  for (const key of ['stoneStep', 'castleStone']) {
    const list = bal.filter((b) => b.key === key);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, w.M[key], list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((b, k) => {
      m4.makeScale(1, b.len, 1).setPosition(b.x, b.y, b.z);
      im.setMatrixAt(k, m4);
    });
    im.castShadow = im.receiveShadow = true;
    w.root.add(im);
  }
}

// La celda en el punto t del tramo, corrida `off` de costado (negativo: del lado de arriba).
function cellAt(w, s, t, off) {
  const x = s.alongZ ? s.line + s.dx * off : t;
  const z = s.alongZ ? t : s.line + s.dz * off;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  return w.inside(cx, cz) ? w.idx(cx, cz) : -1;
}

// Un tramo derecho: sus segmentos van seguidos a lo largo de t (z si el borde
// corre en z, x si no). off > 0 es hacia lo bajo; el parapeto va de -th a 0.
function railRun(w, gb, run, bal) {
  const { line, alongZ, dx, dz, style } = run[0];
  const S = RAIL[style] || RAIL.muro;
  const outside = run.some((s) => {
    const c = cellAt(w, s, (s.t0 + s.t1) / 2, -0.5);
    return c >= 0 && !!ZONES[w.zoneKeys[w.zone[c]]]?.outdoor;
  });
  const key = style === 'balaustrada' && outside ? 'castleStone' : S.key;
  const cap = style === 'balaustrada' && outside ? 'snowCap' : S.cap;
  const at = (t, off, y) => (alongZ ? [line + dx * off, y, t] : [t, y, line + dz * off]);
  const tv = alongZ ? [0, 0, 1] : [1, 0, 0];
  const lo = [dx, 0, dz];
  const hi = [-dx, 0, -dz];
  const ta = run[0].t0;
  const tb = run[run.length - 1].t1;
  const baseAt = (t) => {
    for (const s of run) if (t <= s.t1 + 1e-6) return s.y0 + ((s.y1 - s.y0) * (t - s.t0)) / Math.max(1e-6, s.t1 - s.t0);
    return run[run.length - 1].y1;
  };
  const th = S.th;
  // un prisma a lo largo del tramo: de o0 a o1 de costado, de b0 a b1 sobre la línea del borde
  const prism = (k, o0, o1, b0, b1, { top = true, bottom = false, caps = false, topKey = k, uvS = 2 } = {}) => {
    const u = (p) => (alongZ ? p[2] : p[0]) / uvS;
    const flatUV = (P) => P.map((p) => [p[0] / uvS, p[2] / uvS]);
    for (const s of run) {
      const A0 = at(s.t0, o0, s.y0 + b0);
      const B0 = at(s.t1, o0, s.y1 + b0);
      const A1 = at(s.t0, o1, s.y0 + b0);
      const B1 = at(s.t1, o1, s.y1 + b0);
      const C0 = at(s.t0, o0, s.y0 + b1);
      const D0 = at(s.t1, o0, s.y1 + b1);
      const C1 = at(s.t0, o1, s.y0 + b1);
      const D1 = at(s.t1, o1, s.y1 + b1);
      quadUV(gb, k, [A1, B1, D1, C1], [A1, B1, D1, C1].map((p) => [u(p), p[1] / 3.6]), lo);
      quadUV(gb, k, [A0, B0, D0, C0], [A0, B0, D0, C0].map((p) => [u(p), p[1] / 3.6]), hi);
      if (top) quadUV(gb, topKey, [C0, D0, D1, C1], flatUV([C0, D0, D1, C1]), [0, 1, 0]);
      if (bottom) quadUV(gb, k, [A0, B0, B1, A1], flatUV([A0, B0, B1, A1]), [0, -1, 0]);
    }
    if (!caps) return;
    const endCap = (t, y, hint) => {
      const P = [at(t, o0, y + b0), at(t, o1, y + b0), at(t, o1, y + b1), at(t, o0, y + b1)];
      quadUV(gb, k, P, P.map((p) => [(alongZ ? p[0] : p[2]) / uvS, p[1] / 3.6]), hint);
    };
    endCap(ta, run[0].y0, tv.map((v) => -v));
    endCap(tb, run[run.length - 1].y1, tv);
  };
  // ¿la punta está suelta (del lado de arriba sigue el piso) o pegada a una pared?
  const free = (t, dir) => {
    const c = cellAt(w, run[0], t + dir * 0.5, -0.5);
    return c >= 0 && w.grid[c] === FLOOR;
  };
  const freeA = free(ta, -1);
  const freeB = free(tb, 1);
  // un pilar cuadrado con su sombrerete y una punta de pirámide
  const post = (t, half, extra) => {
    const [cx, , cz] = at(t, -th / 2, 0);
    const y0 = baseAt(t) - 0.4;
    const yTop = baseAt(t) + S.h + extra;
    gb.box(key, cx - half, y0, cz - half, cx + half, yTop, cz + half, 1);
    gb.box(cap, cx - half - 0.05, yTop, cz - half - 0.05, cx + half + 0.05, yTop + 0.08, cz + half + 0.05, 1);
    const p = [cx, yTop + 0.3, cz];
    const q = [[cx - half, cz - half], [cx + half, cz - half], [cx + half, cz + half], [cx - half, cz + half]].map(([x, z]) => [x, yTop + 0.08, z]);
    for (let n = 0; n < 4; n++) {
      const a = q[n];
      const b = q[(n + 1) % 4];
      quadUV(gb, cap, [a, b, p, p], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], [(a[0] + b[0]) / 2 - cx, 0.3, (a[2] + b[2]) / 2 - cz]);
    }
  };
  if (style === 'madera') {
    // la zanca (tabla del costado), la baranda y un parante cada metro y pico
    prism('woodDark', -0.07, 0.015, -0.3, 0.12, { caps: true });
    prism('wood', -0.1, 0.01, S.h - 0.07, S.h, { bottom: true, caps: true });
    prism('woodDark', -0.075, -0.025, 0.5, 0.55, { bottom: true });
    const n = Math.max(1, Math.round((tb - ta) / 1.2));
    for (let j = 0; j <= n; j++) {
      const t = ta + 0.06 + ((tb - ta - 0.12) * j) / n;
      const [cx, , cz] = at(t, -0.05, 0);
      const y = baseAt(t);
      gb.box('woodDark', cx - 0.045, y - 0.3, cz - 0.045, cx + 0.045, y + S.h + (j === 0 || j === n ? 0.14 : 0), cz + 0.045, 1);
    }
  } else if (style === 'balaustrada') {
    // el zócalo, los balaustres torneados y el pasamanos
    prism(key, -th + 0.02, 0.015, -0.4, 0.2, { caps: true });
    prism(key, -th - 0.03, 0.05, S.h - 0.13, S.h, { bottom: true, caps: true, topKey: cap });
    const posts = [];
    if (freeA) posts.push(ta + 0.22);
    if (freeB) posts.push(tb - 0.22);
    const L = tb - ta;
    const mids = Math.floor(L / 2.6);
    for (let j = 1; j <= mids; j++) posts.push(ta + (L * j) / (mids + 1));
    for (const t of posts) post(t, 0.21, 0.22);
    for (let t = ta + 0.2; t < tb - 0.12; t += 0.27) {
      if (posts.some((p) => Math.abs(p - t) < 0.3)) continue;
      const [cx, , cz] = at(t, -th / 2 + 0.005, 0);
      bal.push({ key, x: cx, y: baseAt(t) + 0.2, z: cz, len: S.h - 0.13 - 0.2 });
    }
  } else {
    // muro macizo: el cuerpo, una moldura hacia lo bajo y la albardilla que vuela
    prism(key, -th, 0.012, -0.4, S.h, { top: false, caps: true });
    prism(key, 0.012, 0.055, -0.16, -0.02, { bottom: true, caps: true });
    prism(key, -th - 0.05, 0.06, S.h, S.h + 0.1, { bottom: true, caps: true, uvS: 1.2, topKey: cap });
    if (freeA) post(ta + 0.24, 0.24, 0.3);
    if (freeB) post(tb - 0.24, 0.24, 0.3);
  }
  // choque: el ancho del parapeto (los tiros pasan por la baranda de palo y los balaustres)
  for (const s of run) {
    const a = at(s.t0, -th, 0);
    const b = at(s.t1, 0, 0);
    w.addBox([Math.min(a[0], b[0]), Math.min(s.y0, s.y1) - 0.3, Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(s.y0, s.y1) + S.h, Math.max(a[2], b[2])], { kind: 'rail', shoot: style === 'muro' || style === 'muroNieve' });
  }
}

// ---------------- lo que se ve de afuera ----------------
// Los senderos de pisadas en la nieve (el patio y el palenque).
const TRACKS = [
  [[52.3, 61.6], [54.2, 59.4], [55, 56.4], [54, 53.6], [52.6, 52]],
  [[42.3, 48.2], [44.6, 48.6], [47.8, 50], [49.4, 52.3], [55, 52.9], [59.8, 51.6], [61.8, 48.1]],
  [[44.2, 58.6], [46.2, 56.5], [47.6, 54.6]],
  [[20.6, 57.8], [21.6, 60.8], [24.5, 63], [27.2, 63.6]],
];

export function buildCastle(w) {
  const gb = new GeoBuilder();
  buildBridges(w, gb);
  w.eaves = [];
  // (más luz de relleno que en los otros mapas: salones altos y noche de nieve)
  w.hemiBase = 1.35;
  buildRoofs(w, gb);
  // zócalos, molduras, vigas, pilastras, contrafuertes, nieve y carámbanos
  buildTrim(w);
  // la sala del trono y el gran salón: columnas, artesonado, dosel, escudos y cerchas
  buildHalls(w);
  // el entramado de la caballeriza y la cocina, la biblioteca de dos pisos
  buildRooms(w);
  // las dos cuevas (la gruta del glaciar y la del Mateendrache), de roca y hielo de verdad
  buildCaves(w);
  // la nieve de cerca: destellos y pisadas
  sparkle(w.M.snow);
  // la piedra gastada: tono de sillar en sillar, chorreados, nieve en las
  // repisas y escarcha del lado del viento (la nieve solo afuera)
  indoorGrid(w);
  weathering(w.M.castleStone);
  weathering(w.M.castleStoneDark, { grime: 0.45, snow: 0.8 });
  weathering(w.M.castleStoneFrost, { grime: 0.25 });
  weathering(w.M.stoneStep, { grime: 0.2, snow: 0.85 });
  weathering(w.M.castlePlaster, { tone: 0.5, grime: 0.15, snow: 0, frost: 0 });
  sparkle(w.M.snowCap, 0.6);
  buildTracks(w, TRACKS);
  buildGatehouse(w, gb);
  buildKeep(w, gb);
  buildTowers(w, gb);
  buildEdgeRocks(w);
  const mesh = gb.build(w.M);
  w.root.add(mesh);
  w.castleMesh = mesh;
  buildCristo(w);
  // la sombra de contacto horneada (rincones, bases, techos, bajo la utilería)
  buildCastleAO(w);
  // las pozas de las termas echan vapor; las veletas siguen al viento
  const steam = PROPS.filter((p) => p.type === 'terma').map((p) => ({ x: p.pos[0], z: p.pos[1], y: w.floorAt(p.pos[0], p.pos[1]), r: p.r || 1.8 }));
  // (las pozas heladas del paso previo del Pack-a-Pava no humean: papTermas.js)
  w.castleSteam = steam;
  const vanes = w.dynamic.lamps.filter((o) => o.name === 'veleta');
  w.castleVanes = vanes;
  w.castleBells = w.dynamic.lamps.filter((o) => o.name === 'campana');
  // las llamas: bailan con el reloj del juego y no tiran sombra
  const fm = flameMaterial();
  fm.userData.noShadow = true;
  w.extraUpdate = (dt, t) => {
    fm.uniforms.uTime.value = t;
    const g = w.g;
    const cam = g.camera?.position;
    if (cam && g.fx?.alpha) {
      for (const p of steam) {
        if (p.frozen || Math.random() > dt * 5 * p.r || Math.abs(cam.x - p.x) + Math.abs(cam.z - p.z) > 70) continue;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * p.r * 0.8;
        g.fx.alpha.spawn(p.x + Math.cos(a) * d, p.y + 0.2, p.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, { color: [0.86, 0.9, 0.94], size: 0.5, size1: 2.4, life: 3 + Math.random() * 2, alpha: 0.14, drag: 0.3 });
      }
      // el humo de las chimeneas, que se lleva el viento
      const wd = g.weather?.windDir;
      for (const p of w.castleSmoke || []) {
        if (Math.random() > dt * 3 || Math.abs(cam.x - p.x) + Math.abs(cam.z - p.z) > 110) continue;
        g.fx.alpha.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.4, (wd?.x || 0) * 1.2 + (Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.5, (wd?.y || 0) * 1.2 + (Math.random() - 0.5) * 0.3, { color: [0.5, 0.52, 0.58], size: 0.7, size1: 3.6, life: 4.5 + Math.random() * 2, alpha: 0.22, drag: 0.15 });
      }
    }
    // (si nadie las maneja, las veletas apuntan de a poco para donde sopla)
    const wd = g.weather?.windDir;
    if (wd && !w.vanesHeld) {
      const want = Math.atan2(wd.x, wd.y);
      for (const v of vanes) v.rotation.y += Math.atan2(Math.sin(want - v.rotation.y), Math.cos(want - v.rotation.y)) * Math.min(1, dt * 0.6) + Math.sin(t * 1.3 + v.position.x) * dt * 0.08;
    }
  };
}

// La torre del homenaje: sale del techo de la sala del trono y es lo más alto
// del castillo (con un techo de pizarra en punta y el dragón de oro arriba).
function buildKeep(w, gb) {
  const K = ZONES.K;
  if (!K) return;
  const [x0, z0, x1, z1] = zoneRects('K')[0];
  const cx = (x0 + x1 + 1) / 2;
  const cz = z0 + 5.8;
  const hw = 2.2;
  const base = (K.roof ?? K.y + 3.6) + 0.05;
  const top = base + 12.5;
  // el cuerpo hasta el matacán
  gb.box('castleStone', cx - hw, base, cz - hw, cx + hw, top - 1.2, cz + hw, 1);
  // dos impostas (molduras que dan la vuelta)
  for (const y of [base + 4.3, base + 8.4]) gb.box('stoneStep', cx - hw - 0.09, y, cz - hw - 0.09, cx + hw + 0.09, y + 0.2, cz + hw + 0.09, 1);
  // las esquinas: sillares más claros, uno largo y uno corto, que sobresalen
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = cx + sx * hw;
      const pz = cz + sz * hw;
      for (let k = 0, y = base + 0.02; y < top - 1.8; k++, y += 0.62) {
        const lx = k % 2 ? 0.34 : 0.62;
        const lz = k % 2 ? 0.62 : 0.34;
        gb.box('stoneStep', Math.min(px - sx * lx, px + sx * 0.04), y, Math.min(pz - sz * lz, pz + sz * 0.04), Math.max(px - sx * lx, px + sx * 0.04), y + 0.56, Math.max(pz - sz * lz, pz + sz * 0.04), 1);
      }
    }
  }
  // ventanas: abajo una con arco en cada cara (marco claro, alféizar y
  // dovelas) y arriba un par de troneras
  for (const [dx, dz] of DIRS) {
    const along = dx ? [0, 1] : [1, 0];
    const nx = dx;
    const nz = dz;
    const face = (u, y0, y1, hu, out, key) => {
      // una caja pegada a la cara: u a lo largo, de y0 a y1, `out` hacia afuera
      const fx = cx + nx * hw;
      const fz = cz + nz * hw;
      const ax = fx + along[0] * u;
      const az = fz + along[1] * u;
      const bx0 = ax - along[0] * hu + Math.min(0, nx * out);
      const bx1 = ax + along[0] * hu + Math.max(0, nx * out);
      const bz0 = az - along[1] * hu + Math.min(0, nz * out);
      const bz1 = az + along[1] * hu + Math.max(0, nz * out);
      gb.box(key, bx0 - (nx ? 0.001 : 0), y0, bz0 - (nz ? 0.001 : 0), bx1, y1, bz1, 1);
    };
    const y = base + 5.1;
    face(0, y - 0.12, y, 0.55, 0.14, 'stoneStep');
    face(-0.43, y, y + 1.5, 0.1, 0.06, 'stoneStep');
    face(0.43, y, y + 1.5, 0.1, 0.06, 'stoneStep');
    face(0, y, y + 1.5, 0.33, 0.02, 'black');
    for (let k = 0; k < 5; k++) {
      const a = (k / 4) * Math.PI;
      const u = Math.cos(a) * 0.43;
      const yy = y + 1.5 + Math.sin(a) * 0.43;
      face(u, yy - 0.1, yy + 0.12, 0.11, 0.07, 'stoneStep');
      if (k > 0 && k < 4) face(u * 0.7, y + 1.5, yy - 0.08, 0.13, 0.02, 'black');
    }
    for (const u of [-0.6, 0.6]) face(u, base + 9.4, base + 10.4, 0.07, 0.02, 'black');
  }
  // el matacán: ménsulas en cada cara y el parapeto que vuela
  const ov = 0.36;
  for (const [dx, dz] of DIRS) {
    for (let k = -2; k <= 2; k++) {
      const u = k * 0.95;
      const px = cx + (dx ? dx * hw : u);
      const pz = cz + (dz ? dz * hw : u);
      const ex = dx * ov;
      const ez = dz * ov;
      gb.box('castleStone', Math.min(px, px + ex) - (dx ? 0 : 0.14), top - 1.2, Math.min(pz, pz + ez) - (dz ? 0 : 0.14), Math.max(px, px + ex) + (dx ? 0 : 0.14), top - 0.5, Math.max(pz, pz + ez) + (dz ? 0 : 0.14), 1);
      // el hueco negro entre ménsulas (por donde tiraban piedras)
      if (k < 2) {
        const qx = cx + (dx ? dx * (hw + ov * 0.5) : u + 0.475);
        const qz = cz + (dz ? dz * (hw + ov * 0.5) : u + 0.475);
        gb.box('black', qx - (dx ? ov * 0.45 : 0.28), top - 0.52, qz - (dz ? ov * 0.45 : 0.28), qx + (dx ? ov * 0.45 : 0.28), top - 0.5, qz + (dz ? ov * 0.45 : 0.28), 1);
      }
    }
  }
  gb.box('castleStone', cx - hw - ov, top - 0.5, cz - hw - ov, cx + hw + ov, top + 0.6, cz + hw + ov, 1);
  gb.box('stoneStep', cx - hw - ov - 0.06, top + 0.5, cz - hw - ov - 0.06, cx + hw + ov + 0.06, top + 0.64, cz + hw + ov + 0.06, 1);
  // las almenas del borde (cinco por lado) con su gorro de nieve
  const e = hw + ov - 0.22;
  for (let i = -2; i <= 2; i++) {
    for (const s2 of [-1, 1]) {
      // [x, z, medio ancho en x, medio ancho en z]: en los lados norte/sur y este/oeste
      const m = [[cx + i * 0.98, cz + s2 * e, 0.27, 0.22], [cx + s2 * e, cz + i * 0.98, 0.22, 0.27]];
      for (const [mx, mz, hx, hz] of m) {
        gb.box('castleStone', mx - hx, top + 0.64, mz - hz, mx + hx, top + 1.45, mz + hz, 1);
        gb.flat('snowCap', mx - hx, mz - hz, mx + hx, mz + hz, top + 1.462, true);
      }
    }
  }
  // un pendón grande hacia el patio (la cara del sur)
  const bz = cz + hw + 0.03;
  gb.box('iron', cx - 0.95, top - 1.75, bz, cx + 0.95, top - 1.65, bz + 0.12, 1);
  gb.box('redCloth', cx - 0.8, top - 5.6, bz + 0.04, cx + 0.8, top - 1.7, bz + 0.07, 1);
  gb.box('brass', cx - 0.8, top - 5.6, bz + 0.075, cx + 0.8, top - 5.45, bz + 0.09, 1);
  gb.box('brass', cx - 0.12, top - 4.2, bz + 0.075, cx + 0.12, top - 2.6, bz + 0.09, 1);
  gb.box('brass', cx - 0.45, top - 3.5, bz + 0.075, cx + 0.45, top - 3.3, bz + 0.09, 1);
  // el techo en punta (pirámide de pizarra) y la nieve encima
  const peak = [cx, top + 7.5, cz];
  const c = [
    [cx - hw + 0.3, top + 0.6, cz - hw + 0.3],
    [cx + hw - 0.3, top + 0.6, cz - hw + 0.3],
    [cx + hw - 0.3, top + 0.6, cz + hw - 0.3],
    [cx - hw + 0.3, top + 0.6, cz + hw - 0.3],
  ];
  for (let k = 0; k < 4; k++) {
    const a = c[k];
    const b = c[(k + 1) % 4];
    slope(gb, 'slate', b, a, peak, peak);
    const lift = (p) => [p[0] + (p[0] - cx) * 0.02, p[1] + 0.05, p[2] + (p[2] - cz) * 0.02];
    slope(gb, 'snowCap', lift(b), lift(a), [peak[0], peak[1] - 3.5, peak[2]], [peak[0], peak[1] - 3.5, peak[2]]);
  }
  // el dragón de oro de la veleta: un mástil con la silueta arriba
  gb.box('brass', cx - 0.05, peak[1], cz - 0.05, cx + 0.05, peak[1] + 2.2, cz + 0.05);
  gb.box('brass', cx - 0.9, peak[1] + 1.7, cz - 0.04, cx + 0.9, peak[1] + 1.95, cz + 0.04);
  gb.box('brass', cx + 0.6, peak[1] + 1.95, cz - 0.04, cx + 1.0, peak[1] + 2.3, cz + 0.04);
  gb.box('brass', cx - 1.2, peak[1] + 1.55, cz - 0.04, cx - 0.8, peak[1] + 1.8, cz + 0.04);
}

// Las torres redondas de las esquinas de las murallas (el adarve y la
// cumbre): fuste de piedra con troneras, un anillo de ménsulas (el matacán),
// el techo cónico de pizarra con nieve abajo y un pendón arriba. Van afuera
// de lo caminable: son para la silueta (el patio, las termas, la intro).
// [x, z, radio, alto sobre el piso de al lado, piso de al lado]
const TOWERS = [
  [34.9, 70.1, 1.55, 7.2, 32],
  [68.1, 70.1, 1.55, 7.2, 32],
  // las del portón de la barbacana, sobre el borde del precipicio
  [48.0, 70.5, 1.3, 10.4, 24],
  [55.0, 70.5, 1.3, 10.4, 24],
  [40.9, 6.9, 1.8, 7.6, 40],
  [62.1, 6.9, 1.8, 7.6, 40],
];

function ring(gb, key, cx, cz, r0, r1, y0, y1, n, uvW = 2, a0 = 0) {
  // un anillo (o un cono si r1 = 0): de radio r0 en y0 a r1 en y1, mirando afuera
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
    quadUV(gb, key, P, [[ua, y0 / 3.6], [ub, y0 / 3.6], [ub, y1 / 3.6], [ua, y1 / 3.6]], [Math.cos(m), (r0 - r1) / Math.max(0.01, y1 - y0) * 0.5, Math.sin(m)]);
  }
}

function buildTowers(w, gb) {
  for (const [cx, cz, R, tall, floor] of TOWERS) {
    // la base: lo más bajo del terreno debajo (en el borde del precipicio baja hasta el fondo)
    let base = Infinity;
    for (let k = 0; k < 8; k++) base = Math.min(base, macroY(cx + Math.cos(k) * R, cz + Math.sin(k) * R));
    base = Math.min(base, floor - 4) - 1.5;
    const top = floor + tall;
    const n = 20;
    // el talud de abajo (un poco más ancho) y el fuste
    ring(gb, 'castleStone', cx, cz, R + 0.35, R, base, floor - 2, n);
    ring(gb, 'castleStone', cx, cz, R, R, floor - 2, top - 0.9, n);
    // la moldura y el matacán: ménsulas y un anillo más ancho arriba
    ring(gb, 'stoneStep', cx, cz, R + 0.08, R + 0.08, floor + 1.6, floor + 1.78, n);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const px = cx + Math.cos(a) * (R + 0.12);
      const pz = cz + Math.sin(a) * (R + 0.12);
      gb.box('castleStone', px - 0.13, top - 1.5, pz - 0.13, px + 0.13, top - 0.9, pz + 0.13, 1);
    }
    ring(gb, 'castleStone', cx, cz, R + 0.3, R + 0.3, top - 0.9, top, n);
    // la tapa del anillo que vuela (por abajo)
    ring(gb, 'castleStone', cx, cz, R, R + 0.3, top - 0.9, top - 0.9, n);
    // troneras en dos alturas
    for (const [yy, off] of [[floor - 0.2, 0.3], [floor + 3.2, 1.1]]) {
      for (let k = 0; k < 4; k++) {
        const a = off + (k / 4) * Math.PI * 2;
        const px = cx + Math.cos(a) * (R + 0.01);
        const pz = cz + Math.sin(a) * (R + 0.01);
        gb.box('black', px - 0.07, yy, pz - 0.07, px + 0.07, yy + 0.8, pz + 0.07, 1);
      }
    }
    // el techo cónico: pizarra, con la nieve en el faldón de abajo, y el alero
    const rr = R + 0.55;
    const peak = top + R * 2.6 + 1.2;
    ring(gb, 'slate', cx, cz, rr, 0.001, top - 0.15, peak, n);
    ring(gb, 'snowCap', cx, cz, rr + 0.03, (rr + 0.03) * 0.55, top - 0.12, top - 0.12 + (peak - top) * 0.45, n);
    ring(gb, 'slate', cx, cz, rr, rr, top - 0.3, top - 0.15, n);
    // el mástil y un pendón (quieto) arriba
    gb.box('iron', cx - 0.04, peak - 0.2, cz - 0.04, cx + 0.04, peak + 1.6, cz + 0.04, 1);
    gb.box('brass', cx - 0.09, peak + 1.55, cz - 0.09, cx + 0.09, peak + 1.73, cz + 0.09, 1);
    gb.box('redCloth', cx + 0.04, peak + 0.9, cz - 0.015, cx + 0.95, peak + 1.45, cz + 0.015, 1);
  }
}

// El Cristo de los Andes en la punta más alta que se ve al noroeste.
function buildCristo(w) {
  let best = null;
  for (let x = -70; x <= 0; x += 5) {
    for (let z = -60; z <= -15; z += 5) {
      const y = macroY(x, z);
      if (!best || y > best[1]) best = [x, y, z];
    }
  }
  const res = NATURE.cristo(w.M);
  res.obj.position.set(best[0], best[1] - 1, best[2]);
  res.obj.scale.setScalar(1.6);
  res.obj.rotation.y = Math.atan2(52 - best[0], 50 - best[2]);
  w.root.add(res.obj);
}

// El lomo de los puentes: el tablero de piedra y, abajo, arcos sobre pilares
// que bajan hasta el fondo.
function buildBridges(w, gb) {
  for (const [k, Z] of Object.entries(ZONES)) {
    for (const r of zoneRects(k)) {
      // (el tramo del puente levadizo es de madera: lo arma la puerta)
      if (!r[6] || r[6] === 2) continue;
      const [x0, z0, x1, z1] = r;
      const alongX = x1 - x0 > z1 - z0;
      // de borde a borde (las celdas de la baranda de cada lado también)
      const bx0 = alongX ? x0 : x0 - 1;
      const bx1 = alongX ? x1 + 1 : x1 + 2;
      const bz0 = alongX ? z0 - 1 : z0;
      const bz1 = alongX ? z1 + 2 : z1 + 1;
      const len = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
      const deck = (s) => {
        // altura del tablero en ese punto (los de la cumbre suben)
        const px = alongX ? x0 + s : (x0 + x1 + 1) / 2;
        const pz = alongX ? (z0 + z1 + 1) / 2 : z0 + s;
        return w.floorAt(Math.min(x1 + 0.99, Math.max(x0, px)), Math.min(z1 + 0.99, Math.max(z0, pz)));
      };
      const T = 1.4;
      const step = 1;
      // donde el puente de piedra da al tramo levadizo: la cara de la punta y
      // un estribo que baja hasta el fondo (ahí apoya el puente de madera)
      for (const [end, dir] of alongX ? [[x0, -1], [x1 + 1, 1]] : [[z0, -1], [z1 + 1, 1]]) {
        const nx = alongX ? end + (dir > 0 ? 0 : -1) : x0;
        const nz = alongX ? z0 : end + (dir > 0 ? 0 : -1);
        const nr = w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR ? bridgeRect(w.zoneKeys[w.zone[w.idx(nx, nz)]], nx, nz) : null;
        if (!nr || nr[6] !== 2) continue;
        const y = deck(dir > 0 ? len - 0.01 : 0.01);
        const bottom = Math.min(macroY(alongX ? end : (x0 + x1 + 1) / 2, alongX ? (z0 + z1 + 1) / 2 : end), y - 4) - 1;
        if (alongX) gb.box('castleStone', end - (dir > 0 ? 0.9 : 0), bottom, bz0, end + (dir > 0 ? 0 : 0.9), y - 0.02, bz1, 1);
        else gb.box('castleStone', bx0, bottom, end - (dir > 0 ? 0.9 : 0), bx1, y - 0.02, end + (dir > 0 ? 0 : 0.9), 1);
      }
      for (let s = 0; s < len; s += step) {
        const ya = deck(s + 0.01) - T;
        const yb = deck(s + step - 0.01) - T;
        // el fondo del tablero, mirando para abajo
        if (alongX) gb.quad('castleStoneDark', [x0 + s, ya, bz0], [x0 + s + step, yb, bz0], [x0 + s + step, yb, bz1], [x0 + s, ya, bz1], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
        else gb.quad('castleStoneDark', [bx1, ya, z0 + s], [bx1, yb, z0 + s + step], [bx0, yb, z0 + s + step], [bx0, ya, z0 + s], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      // pilares cada tanto, hasta el terreno
      const span = alongX ? 4 : 5;
      for (let s = span; s < len - 1; s += span) {
        const cx = alongX ? x0 + s : (x0 + x1 + 1) / 2;
        const cz = alongX ? (z0 + z1 + 1) / 2 : z0 + s;
        const top = deck(s) - T;
        const bottom = Math.min(macroY(cx, cz), top - 1) - 1;
        const hw = alongX ? 0.55 : (bx1 - bx0) / 2;
        const hd = alongX ? (bz1 - bz0) / 2 : 0.55;
        gb.box('castleStone', cx - hw, bottom, cz - hd, cx + hw, top, cz + hd, 1);
        // el arranque del arco: dos cuñas a cada lado del pilar
        for (const sg of [-1, 1]) {
          const ex = alongX ? cx + sg * 0.55 : cx;
          const ez = alongX ? cz : cz + sg * 0.55;
          if (alongX) gb.box('castleStone', Math.min(ex, ex + sg * 0.9), top - 0.9, cz - hd, Math.max(ex, ex + sg * 0.9), top, cz + hd, 1);
          else gb.box('castleStone', cx - hw, top - 0.9, Math.min(ez, ez + sg * 0.9), cx + hw, top, Math.max(ez, ez + sg * 0.9), 1);
        }
      }
    }
  }
}

// Techos de pizarra a dos aguas sobre los salones (se ven desde el adarve,
// los miradores y la cumbre). La cumbrera va a lo largo del lado más largo.
// (X1: el techo de la sala del trono termina donde sube la escalera cubierta
// a la cumbre, que asoma con su propio techo)
const ROOFS = {
  D: { pitch: 0.55 },
  O: { pitch: 0.6 },
  F: { pitch: 0.7 },
  K: { pitch: 0.5, X1: 58 },
  B: { pitch: 0.45 },
  C: { pitch: 0.45 },
  E: { pitch: 0.45 },
};
// La cumbrera de un techo (el medio, arriba): ahí va la veleta de la vuelta del viento.
export function roofRidge(k) {
  const R = ROOFS[k];
  const Z = ZONES[k];
  if (!R || !Z) return null;
  const [x0, z0, x1, z1] = zoneRects(k)[0];
  const X0 = x0 - 1.25;
  const X1 = R.X1 ?? x1 + 2.25;
  const Z0 = z0 - 1.25;
  const Z1 = z1 + 2.25;
  const base = (Z.roof ?? Z.y + 3.6) + 0.25;
  const alongX = X1 - X0 >= Z1 - Z0;
  const half = (alongX ? Z1 - Z0 : X1 - X0) / 2;
  return { x: (X0 + X1) / 2, z: (Z0 + Z1) / 2, y: base + half * R.pitch, alongX };
}

function buildRoofs(w, gb) {
  for (const [k, R] of Object.entries(ROOFS)) {
    const Z = ZONES[k];
    if (!Z) continue;
    const [x0, z0, x1, z1] = zoneRects(k)[0];
    // alero: hasta afuera de las paredes
    const X0 = x0 - 1.25;
    const X1 = R.X1 ?? x1 + 2.25;
    const Z0 = z0 - 1.25;
    const Z1 = z1 + 2.25;
    const base = (Z.roof ?? Z.y + 3.6) + 0.25;
    const alongX = X1 - X0 >= Z1 - Z0;
    const half = (alongX ? Z1 - Z0 : X1 - X0) / 2;
    const ridge = base + half * R.pitch;
    const snow = 'snowCap';
    // la nieve arranca 20 cm adentro del alero, a la altura que tiene ahí la
    // pizarra: a la altura del alero quedaba por debajo, las dos se cruzaban y
    // de lejos (la cinemática) el borde de la nieve salía en serrucho
    const sb = base + 0.2 * R.pitch + 0.07;
    // los aleros (de ahí cuelgan los carámbanos)
    if (alongX) w.eaves.push([X0, Z0, X1, Z0, base], [X0, Z1, X1, Z1, base]);
    else w.eaves.push([X0, Z0, X0, Z1, base], [X1, Z0, X1, Z1, base]);
    if (alongX) {
      const zm = (Z0 + Z1) / 2;
      for (const [za, zb, s] of [[Z0, zm, 1], [Z1, zm, -1]]) {
        const n = new THREE.Vector3(0, half, s * -(ridge - base)).normalize().toArray().map((v, i) => (i === 2 ? -v : v));
        slope(gb, 'slate', [X0, base, za], [X1, base, za], [X1, ridge, zb], [X0, ridge, zb], n);
        slope(gb, snow, [X0, sb, za + s * 0.2], [X1, sb, za + s * 0.2], [X1, ridge + 0.07, zb], [X0, ridge + 0.07, zb], n, true);
      }
      // los hastiales (triángulos de piedra en las puntas)
      for (const x of [X0 + 0.05, X1 - 0.05]) gable(gb, x, Z0, Z1, base, ridge, true);
      ridgeCap(gb, [X0, ridge, zm], [X1, ridge, zm], true);
    } else {
      const xm = (X0 + X1) / 2;
      for (const [xa, xb, s] of [[X0, xm, 1], [X1, xm, -1]]) {
        const n = new THREE.Vector3(-s * (ridge - base) * -1, half, 0).normalize().toArray();
        slope(gb, 'slate', [xa, base, Z1], [xa, base, Z0], [xb, ridge, Z0], [xb, ridge, Z1], n);
        slope(gb, snow, [xa + s * 0.2, sb, Z1], [xa + s * 0.2, sb, Z0], [xb, ridge + 0.07, Z0], [xb, ridge + 0.07, Z1], n, true);
      }
      for (const z of [Z0 + 0.05, Z1 - 0.05]) gable(gb, z, X0, X1, base, ridge, false);
      ridgeCap(gb, [xm, ridge, Z0], [xm, ridge, Z1], false);
    }
  }
}

// La cumbrera: las tejas de arriba (con su lomo de nieve) y, en cada punta,
// un pináculo de piedra con su aguja.
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
    gb.box('stoneStep', x - 0.22, y + 0.55, z - 0.22, x + 0.22, y + 0.65, z + 0.22, 1);
    const q = [[x - 0.16, z - 0.16], [x + 0.16, z - 0.16], [x + 0.16, z + 0.16], [x - 0.16, z + 0.16]].map(([qx, qz]) => [qx, y + 0.65, qz]);
    const tip = [x, y + 1.35, z];
    for (let k = 0; k < 4; k++) {
      const c = q[k];
      const d = q[(k + 1) % 4];
      quadUV(gb, 'stoneStep', [c, d, tip, tip], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], [(c[0] + d[0]) / 2 - x, 0.2, (c[2] + d[2]) / 2 - z]);
    }
  }
}

// Un faldón del techo. Acomoda el orden de los vértices para que mire para arriba.
function slope(gb, key, a, b, c, d, n, patchy = false) {
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
  // las tejas: u a lo largo de la cumbrera, v de la canaleta a la cumbrera
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

// El triángulo de piedra que cierra el techo en una punta.
function gable(gb, at, s0, s1, base, ridge, alongX) {
  const m = (s0 + s1) / 2;
  const pts = alongX
    ? [[at, base, s0], [at, base, s1], [at, ridge, m]]
    : [[s0, base, at], [s1, base, at], [m, ridge, at]];
  // (de los dos lados: el orden de las puntas define para dónde mira cada uno)
  for (const sg of [1, -1]) {
    const n = alongX ? [sg, 0, 0] : [0, 0, sg];
    const flip = alongX ? sg > 0 : sg < 0;
    const [a, b, c] = flip ? [pts[1], pts[0], pts[2]] : pts;
    gb.quad('castleStone', a, b, c, c, n, [0, 0], [1, 0], [0.5, 1], [0.5, 1]);
  }
}

// Las piedras del borde de las termas: dos o tres por celda, de roca con un
// gorro de nieve encima.
function buildEdgeRocks(w) {
  const list = w.edgeRocks || [];
  if (!list.length) return;
  let seed = 9;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const n = list.length * 2;
  const rock = new THREE.InstancedMesh(geo, w.M.castleStoneDark, n);
  const snow = new THREE.InstancedMesh(geo, w.M.snowCap, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let k = 0;
  for (const [x, y, z] of list) {
    for (let j = 0; j < 2; j++) {
      const s = 0.38 + r() * 0.3;
      const px = x + (r() - 0.5) * 0.5;
      const pz = z + (r() - 0.5) * 0.5;
      e.set(r() * 3, r() * 3, r() * 3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(px, y + s * 0.35, pz), q, new THREE.Vector3(s, s * (0.7 + r() * 0.4), s));
      rock.setMatrixAt(k, m4);
      q.identity();
      m4.compose(new THREE.Vector3(px, y + s * 0.62, pz), q, new THREE.Vector3(s * 0.82, s * 0.32, s * 0.82));
      snow.setMatrixAt(k, m4);
      k++;
    }
  }
  rock.castShadow = rock.receiveShadow = true;
  snow.receiveShadow = true;
  w.root.add(rock, snow);
}

// La barbacana: el techo del paso del rastrillo con sus almenas y dos
// torrecitas que asoman sobre el adarve.
function buildGatehouse(w, gb) {
  const L = ZONES.L;
  if (!L) return;
  const [x0, z0, x1, z1] = zoneRects('L')[0];
  const roof = (L.roof ?? L.y + 3.6) + 0.02;
  // (las dos torres que flanquean el portón van del lado del precipicio, en
  // TOWERS: sobre el adarve quedaban encima de lo caminable y se las atravesaba)
  // el techo del paso: almenas sobre el frente y la parte de atrás
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    if ((x + z0) % 2) continue;
    gb.box('castleStone', x + 0.05, roof + 0.9, z0 - 0.95, x + 0.95, roof + 1.6, z0 - 0.05, 1);
  }
  gb.box('castleStone', x0 - 1, roof, z0 - 1, x1 + 2, roof + 0.9, z0, 1);
  gb.flat('snowCap', x0, z0, x1 + 1, z1 + 1, roof + 0.02, true);
}
