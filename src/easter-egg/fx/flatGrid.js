// Rayos hacia abajo baratos contra una malla quieta (lo que tapa el piso: las
// tablas de un muelle, una tarima, la utilería juntada por material). Cada
// malla arma una vez su rejilla en planta (celdas de 1 m) con los triángulos
// que miran para arriba, en el mundo; después cada pregunta prueba solo los
// triángulos de su celda. Antes era Raycaster.intersectObject contra la malla
// entera: con la utilería juntada costaba 1,4-11 ms por mancha de sangre, en
// cada muerte y en todos los mapas (fx/Effects.js floorTop; medido el
// 2026-10-07; ahora ~0,05 ms con la misma altura). La rejilla se arma de a
// pedazos (las grandes tardaban hasta 40 ms enteras): en segundo plano al
// empezar la partida (warmGrids, un ratito por cuadro) o, si hace falta ya,
// entera. Si la malla se movió (una puerta), se rehace.
// globalThis.__mduNoFlatGrid: el rayo de antes, para comparar.

const CELL = 1;
// cuántos triángulos por pedazo
const CHUNK = 2500;
// más celdas que esto: va a la lista de los grandes
const BIG = 48;
const grids = new WeakMap();

function sameMatrix(a, b) {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
}

// La rejilla de la malla (empezada o terminada), o una nueva si no tenía o se movió.
function gridOf(o) {
  let G = grids.get(o);
  if (G && sameMatrix(G.m, o.matrixWorld.elements)) return G;
  o.updateMatrixWorld(true);
  const geo = o.geometry;
  const pos = geo?.attributes?.position;
  const idx = geo?.index;
  // (sin posiciones, o de puntos o líneas: no tapa nada)
  const n = !pos || !o.isMesh ? 0 : Math.floor((idx ? idx.count : pos.count) / 3);
  // big: los triángulos que cubren muchas celdas (el terreno, un piso entero),
  // aparte: se prueban siempre (si no, uno solo llenaba miles de celdas)
  G = { m: Float64Array.from(o.matrixWorld.elements), n, t: 0, k: 0, tris: new Float32Array(n * 9), cells: new Map(), big: [], both: o.material?.side === 2 };
  grids.set(o, G);
  return G;
}

// ¿Ya está terminada (y vale) la rejilla de esta malla?
export function hasGrid(o) {
  const G = grids.get(o);
  return !!G && G.t >= G.n && sameMatrix(G.m, o.matrixWorld.elements);
}

const v = new Float64Array(9);
// Sigue armando la rejilla: hasta `max` triángulos. true si quedó terminada.
function step(o, G, max) {
  const geo = o.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const e = G.m;
  const T = G.tris;
  const end = Math.min(G.n, G.t + max);
  for (let t = G.t; t < end; t++) {
    for (let j = 0; j < 3; j++) {
      const i = idx ? idx.getX(t * 3 + j) : t * 3 + j;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      v[j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      v[j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      v[j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    // la normal (y): para arriba (o casi plana, con las dos caras)
    const ax = v[3] - v[0];
    const ay = v[4] - v[1];
    const az = v[5] - v[2];
    const bx = v[6] - v[0];
    const by = v[7] - v[1];
    const bz = v[8] - v[2];
    const ny = az * bx - ax * bz;
    const len = Math.hypot(ay * bz - az * by, ny, ax * by - ay * bx) || 1;
    const up = ny / len;
    if (G.both ? Math.abs(up) < 0.05 : up < 0.05) continue;
    const k = G.k++;
    const b = k * 9;
    for (let j = 0; j < 9; j++) T[b + j] = v[j];
    const x0 = Math.floor(Math.min(v[0], v[3], v[6]) / CELL);
    const x1 = Math.floor(Math.max(v[0], v[3], v[6]) / CELL);
    const z0 = Math.floor(Math.min(v[2], v[5], v[8]) / CELL);
    const z1 = Math.floor(Math.max(v[2], v[5], v[8]) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > BIG) {
      G.big.push(k);
      continue;
    }
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cx * 65536 + cz;
        let L = G.cells.get(key);
        if (!L) G.cells.set(key, (L = []));
        L.push(k);
      }
    }
  }
  G.t = end;
  return G.t >= G.n;
}

// La arma entera (lo que falte).
export function buildGrid(o) {
  const G = gridOf(o);
  step(o, G, Infinity);
  return G;
}

// En segundo plano: sigue armando las de `list` ({ o } como Effects.lowFlats)
// durante `ms` milisegundos. Devuelve por dónde va (para la próxima).
export function warmGrids(list, at = 0, ms = 1) {
  const t0 = performance.now();
  let i = at;
  while (i < list.length) {
    const o = list[i].o;
    const G = gridOf(o);
    if (G.t < G.n) step(o, G, CHUNK);
    if (G.t >= G.n) i++;
    if (performance.now() - t0 > ms) break;
  }
  return i;
}

// La altura más alta de la malla en (x, z) entre yBot y yTop (null si nada).
export function downHit(o, x, z, yTop, yBot) {
  const G = buildGrid(o);
  const L = G.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
  if (!L && !G.big.length) return null;
  const T = G.tris;
  let best = null;
  for (const k of L ? (G.big.length ? L.concat(G.big) : L) : G.big) {
    const b = k * 9;
    const x0 = T[b];
    const z0 = T[b + 2];
    const x1 = T[b + 3];
    const z1 = T[b + 5];
    const x2 = T[b + 6];
    const z2 = T[b + 8];
    // ¿(x, z) cae adentro del triángulo en planta? (baricéntricas)
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(d) < 1e-12) continue;
    const w0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d;
    if (w0 < -1e-6) continue;
    const w1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    if (w1 < -1e-6) continue;
    const w2 = 1 - w0 - w1;
    if (w2 < -1e-6) continue;
    const y = w0 * T[b + 1] + w1 * T[b + 4] + w2 * T[b + 7];
    if (y > yTop || y < yBot) continue;
    if (best === null || y > best) best = y;
  }
  return best;
}
