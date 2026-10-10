import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import Water from '../fx/Water';
import { rng } from '../core/noise';
import { MAP_W, MAP_H, WALL_H, ZONES, RAMPS, WINDOWS, RIVER, FEATURES } from '../config/map';
import { windy } from '../fx/grassPush';

// Mapas con pisos a distintas alturas (el penal): cada zona (o cada
// rectángulo de una zona) tiene su altura, las rampas y escaleras van de una
// a otra y el terreno de afuera baja hasta el río. Nada se superpone: en cada
// celda hay un solo piso. Acá están las cuentas de alturas, las colisiones
// del terreno, las barandas que aparecen solas donde hay desnivel y todo lo
// que se ve (paredes que suben hasta el techo de cada zona, pisos, escalones,
// barrancos y el agua).

const OUT = 0;
const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const WINDOW = 4;
export const EDGE_RAIL = 3;
export const EDGE_BARS = 4;
// los de la granja (world/World.js): alambrado y maíz
const EDGE_FENCE = 1;
const EDGE_CORN = 2;
const FENCE_H = 1.25;
const CORN_H = 2.6;
const SILL = 0.95;
const HEAD = 2.35;
const DOOR_H = 2.7;
// hasta este escalón se sube caminando; más alto es un desnivel
const STEP = 0.45;
// dos celdas se conectan si sus bordes están a menos que esto
const JOIN = 0.3;
const RAIL_H = 1.05;
const BARS_H = 3.4;
const WATER_Y = -0.55;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Altura de una rampa en (x, z): sube de y0 a y1 en la dirección `dir`.
export function rampY(r, x, z) {
  const [x0, z0, x1, z1] = r.rect;
  let t;
  if (r.dir === '+x') t = (x - x0) / (x1 + 1 - x0);
  else if (r.dir === '-x') t = (x1 + 1 - x) / (x1 + 1 - x0);
  else if (r.dir === '+z') t = (z - z0) / (z1 + 1 - z0);
  else t = (z1 + 1 - z) / (z1 + 1 - z0);
  t = Math.max(0, Math.min(1, t));
  return r.y0 + (r.y1 - r.y0) * t;
}

const walkable = (t) => t === FLOOR || t === DOOR || t === WINDOW;

// Altura del borde de la celda i hacia `d` (índice de DIRS), en su punto medio.
function edgeY(w, x, z, d) {
  const i = w.idx(x, z);
  const r = w.rampAt[i];
  if (r < 0) return w.fy[i];
  const [dx, dz] = DIRS[d];
  return rampY(RAMPS[r], x + 0.5 + dx * 0.5, z + 0.5 + dz * 0.5);
}

// Las dos puntas de ese borde (para caras inclinadas al costado de una rampa).
function edgeEnds(w, x, z, d) {
  const i = w.idx(x, z);
  const [dx, dz] = DIRS[d];
  const mx = x + 0.5 + dx * 0.5;
  const mz = z + 0.5 + dz * 0.5;
  const ax = mx - dz * 0.5;
  const az = mz + dx * 0.5;
  const bx = mx + dz * 0.5;
  const bz = mz - dx * 0.5;
  const r = w.rampAt[i];
  const ya = r < 0 ? w.fy[i] : rampY(RAMPS[r], ax, az);
  const yb = r < 0 ? w.fy[i] : rampY(RAMPS[r], bx, bz);
  return [ax, az, ya, bx, bz, yb];
}

// ¿El borde de la celda i hacia (dx, dz) es un costado de escalera (no una
// de sus puntas)?
function stairSide(w, i, dx, dz) {
  const r = w.rampAt[i];
  if (r < 0 || !RAMPS[r].steps) return false;
  return RAMPS[r].dir[1] === 'x' ? dz !== 0 : dx !== 0;
}

// Quad que mira hacia `hint`: acomoda el orden de los vértices (si no, la
// cara se descarta) y calcula su normal. u sigue a `run`, v sube.
function quadFacing(gb, key, a, b, c, d, hint, run, lat) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const uv = (p) => [(p[0] * run[0] + p[2] * run[1]) / 1.2, (p[1] + p[0] * lat[0] + p[2] * lat[1]) / 1.2];
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) gb.quad(key, a, b, c, d, [nx, ny, nz], uv(a), uv(b), uv(c), uv(d));
  else gb.quad(key, d, c, b, a, [-nx, -ny, -nz], uv(d), uv(c), uv(b), uv(a));
}

// Quad con sus uvs que mira hacia `hint`: la normal sale de los cuatro
// puntos (Newell: sirve aunque dos coincidan, como en un triángulo) y si mira
// para el otro lado se da vuelta el orden.
export function quadUV(gb, key, P, U, hint) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let k = 0; k < 4; k++) {
    const a = P[k];
    const b = P[(k + 1) % 4];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-6) return;
  const n = [nx / l, ny / l, nz / l];
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] >= 0) gb.quad(key, P[0], P[1], P[2], P[3], n, U[0], U[1], U[2], U[3]);
  else gb.quad(key, P[3], P[2], P[1], P[0], [-n[0], -n[1], -n[2]], U[3], U[2], U[1], U[0]);
}

// Barra inclinada entre los centros a y b: 2·hw de ancho (hacia `lat`,
// horizontal) y 2·hh de alto, con las caras de los costados verticales.
function slantBar(gb, key, a, b, lat, hw, hh) {
  const P = (p, s, t) => [p[0] + lat[0] * s * hw, p[1] + t * hh, p[2] + lat[1] * s * hw];
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const run = [(b[0] - a[0]) / L, (b[2] - a[2]) / L];
  const along = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const faces = [
    [P(a, -1, 1), P(a, 1, 1), P(b, 1, 1), P(b, -1, 1), [0, 1, 0]],
    [P(a, -1, -1), P(a, 1, -1), P(b, 1, -1), P(b, -1, -1), [0, -1, 0]],
    [P(a, 1, -1), P(b, 1, -1), P(b, 1, 1), P(a, 1, 1), [lat[0], 0, lat[1]]],
    [P(a, -1, -1), P(b, -1, -1), P(b, -1, 1), P(a, -1, 1), [-lat[0], 0, -lat[1]]],
    [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1), along.map((v) => -v)],
    [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1), along],
  ];
  for (const [p0, p1, p2, p3, hint] of faces) quadFacing(gb, key, p0, p1, p2, p3, hint, run, lat);
}

// La granja: los costados de una escalera (los escalones ya tapan el
// costado). Una zanca de palo por afuera, siguiendo las narices de los
// escalones, y donde el piso de al lado queda abajo, una baranda inclinada
// con sus postes (la que va celda por celda quedaba en escalones sueltos).
function farmStairSides(w, gb, R) {
  const [x0, z0, x1, z1] = R.rect;
  const alongX = R.dir[1] === 'x';
  const len = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
  const rise = Math.abs(R.y1 - R.y0);
  const stepH = rise / Math.max(2, Math.round(rise / 0.22));
  const c0 = alongX ? x0 : z0;
  const lineY = (c) => (alongX ? rampY(R, c, z0) : rampY(R, x0, c));
  const key = 'woodDark';
  const rt = 0.045;
  for (const sg of [-1, 1]) {
    const lat = alongX ? [0, sg] : [sg, 0];
    const d = alongX ? (sg > 0 ? 2 : 3) : sg > 0 ? 0 : 1;
    const row = sg > 0 ? (alongX ? z1 : x1) : alongX ? z0 : x0;
    // el borde de ese costado
    const e = sg > 0 ? row + 1 : row;
    const at = (c, off, y) => (alongX ? [c, y, e + sg * off] : [e + sg * off, y, c]);
    let open = false;
    let first = -1;
    let last = -1;
    for (let k = 0; k < len; k++) {
      const x = alongX ? x0 + k : row;
      const z = alongX ? row : z0 + k;
      const nx = x + lat[0];
      const nz = z + lat[1];
      if (!w.inside(nx, nz) || !walkable(w.grid[w.idx(nx, nz)])) continue;
      open = true;
      const i = w.idx(x, z);
      if ((w.pass[i] >> d) & 1) continue;
      const [, , ya, , , yb] = edgeEnds(w, x, z, d);
      const [, , la, , , lb] = edgeEnds(w, nx, nz, d ^ 1);
      if (Math.max(ya, yb) <= Math.max(la, lb) + 0.01) continue;
      if (first < 0) first = k;
      last = k;
    }
    if (!open) continue;
    // la zanca: el borde de arriba pasa justo por las narices
    const hh = 0.15;
    const top = stepH + 0.04 - hh;
    slantBar(gb, key, at(c0, 0.035, lineY(c0) + top), at(c0 + len, 0.035, lineY(c0 + len) + top), lat, 0.03, hh);
    if (first < 0) continue;
    // la baranda: a la altura de las de los pisos, medida desde la línea de la rampa
    const cA = c0 + first;
    const cB = c0 + last + 1;
    for (const hy of [0.55, RAIL_H]) slantBar(gb, key, at(cA, -0.05, lineY(cA) + hy), at(cB, -0.05, lineY(cB) + hy), lat, rt, 0.03);
    const n = Math.max(1, Math.ceil((cB - cA) / 1.5));
    for (let j = 0; j <= n; j++) {
      const c = cA + ((cB - cA) * j) / n;
      const [px, , pz] = at(c, -0.05, 0);
      const y = lineY(c);
      gb.box(key, px - rt - 0.01, y - 0.05, pz - rt - 0.01, px + rt + 0.01, y + RAIL_H + 0.03, pz + rt + 0.01, 1);
    }
  }
}

// Techo de la zona de la celda i (absoluto).
function roofOf(w, i) {
  if (w.roofC[i] > 0) return w.roofC[i];
  const Z = ZONES[w.zoneKeys[w.zone[i]]];
  if (Z.outdoor) return w.fy[i] + (Z.h ?? WALL_H);
  return Z.roof ?? (Z.y ?? 0) + (Z.h ?? WALL_H);
}

// Techo en el punto (px, pz) de la celda i. Una escalera con `ceil` (el
// castillo) lleva su techo propio a `head` de los escalones: 'slope' lo sigue
// siempre (el pasillo cubierto no es un tajo altísimo) y 'shaft' es el de la
// zona salvo donde la escalera sube más: ahí abre un hueco hacia arriba (la
// cabeza no atraviesa el techo del salón).
function ceilY(w, i, px, pz) {
  const roof = roofOf(w, i);
  const r = w.rampAt[i];
  const R = r >= 0 ? RAMPS[r] : null;
  if (!R?.ceil) return roof;
  const v = rampY(R, px, pz) + (R.head ?? 3.4);
  return R.ceil === 'shaft' ? Math.max(roof, v) : v;
}

// El techo más alto de la celda (hasta ahí suben las paredes de al lado).
export function ceilMax(w, i) {
  const r = w.rampAt[i];
  if (r < 0 || !RAMPS[r].ceil) return roofOf(w, i);
  const x = i % MAP_W;
  const z = (i - x) / MAP_W;
  return Math.max(ceilY(w, i, x, z), ceilY(w, i, x + 1, z), ceilY(w, i, x, z + 1), ceilY(w, i, x + 1, z + 1));
}

// Después de armar la grilla: alturas de pisos, puertas, ventanas, paredes y
// terreno, y por dónde se puede pasar de una celda a la de al lado.
export function computeHeights(w) {
  const n = MAP_W * MAP_H;
  // el estero: las zonas de afuera pisan su suelo suave (world/Esteros.js)
  if (w.prepGround) {
    w.prepGround(w);
    for (let i = 0; i < n; i++) {
      if (w.grid[i] !== FLOOR || !w.groundCell[i]) continue;
      const x = i % MAP_W;
      w.fy[i] = w.groundAt(x + 0.5, (i - x) / MAP_W + 0.5);
    }
  }
  RAMPS.forEach((r, ri) => {
    const [x0, z0, x1, z1] = r.rect;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] !== FLOOR) continue;
        w.rampAt[i] = ri;
        w.fy[i] = rampY(r, x + 0.5, z + 0.5);
      }
    }
  });
  // puertas: a la altura del piso de los costados (el más alto, por las dudas)
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== DOOR) continue;
      if (w.groundCell?.[i]) {
        w.fy[i] = w.groundAt(x + 0.5, z + 0.5);
        continue;
      }
      let h = -Infinity;
      DIRS.forEach(([dx, dz], d) => {
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz) || w.grid[w.idx(nx, nz)] !== FLOOR) return;
        h = Math.max(h, edgeY(w, nx, nz, d ^ 1));
      });
      w.fy[i] = Number.isFinite(h) ? h : 0;
    }
  }
  for (const def of WINDOWS) {
    const [x, z] = def.cell;
    const ix = x - def.out[0];
    const iz = z - def.out[1];
    w.fy[w.idx(x, z)] = w.inside(ix, iz) ? w.fy[w.idx(ix, iz)] : 0;
  }
  // alto de las paredes: el techo más alto de las zonas que tocan
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      if (t === OUT || t === FLOOR) continue;
      let top = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!w.inside(x + dx, z + dz)) continue;
          const j = w.idx(x + dx, z + dz);
          if (w.grid[j] === FLOOR) top = Math.max(top, ceilMax(w, j));
        }
      }
      w.top[i] = top || WALL_H;
    }
  }
  // terreno de afuera: la altura del piso más cercano, que después baja en pendiente
  const dist = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (walkable(w.grid[i])) {
      dist[i] = 0;
      w.ty[i] = w.fy[i];
      q[tail++] = i;
    }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!w.inside(nx, nz)) continue;
      const j = w.idx(nx, nz);
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      w.ty[j] = w.ty[i];
      q[tail++] = j;
    }
  }
  // el castillo arma su montaña (world/Mountain.js)
  if (w.terrain) w.terrain(w);
  for (let i = 0; i < n && !w.terrain; i++) {
    if (w.grid[i] !== OUT) continue;
    // la granja: afuera es el maizal, todo al nivel del suelo
    if (FEATURES.farm) {
      w.ty[i] = 0;
      continue;
    }
    w.ty[i] = Math.max(0, w.ty[i] - Math.max(0, dist[i] - 2) * 0.8);
    // la costa: cerca del borde de la grilla el terreno se hunde en el río con
    // una orilla despareja (si no, la isla es un cuadrado)
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    const e = Math.min(x, z, MAP_W - 1 - x, MAP_H - 1 - z);
    const coast = e * 0.4 - 2.4 + Math.sin(x * 0.19 + z * 0.07) * 1.6 + Math.sin(x * 0.07 - z * 0.17) * 1.8 + Math.sin(x * 0.43 + z * 0.37) * 0.4;
    if (dist[i] > 2) w.ty[i] = Math.min(w.ty[i], Math.max(-1.8, coast));
  }
  // el río: el fondo queda bajo el agua (los muertos salen de ahí con el agua a la cintura)
  for (const [x0, z0, x1, z1] of RIVER) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!w.inside(x, z)) continue;
        const i = w.idx(x, z);
        if (w.grid[i] === OUT) w.ty[i] = -1.1;
      }
    }
  }
  for (let i = 0; i < n; i++) if (w.grid[i] === WALL) w.fy[i] = w.ty[i];
  // bordes abiertos (rejas, barandas): son un cordón de piedra a la altura del
  // piso de al lado, así no queda una ranura entre el piso y la reja
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== WALL || w.edge[i] === 0) continue;
      let h = -Infinity;
      DIRS.forEach(([dx, dz], d) => {
        const nx = x + dx;
        const nz = z + dz;
        if (w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR) h = Math.max(h, edgeY(w, nx, nz, d ^ 1));
      });
      if (!Number.isFinite(h)) {
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR) h = Math.max(h, w.fy[w.idx(nx, nz)]);
        }
      }
      if (Number.isFinite(h)) w.fy[i] = h;
    }
  }
  // pasos entre celdas: bit d = se puede pasar hacia DIRS[d]
  w.pass = new Uint8Array(n);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (!walkable(w.grid[i])) continue;
      let bits = 0;
      DIRS.forEach(([dx, dz], d) => {
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz) || !walkable(w.grid[w.idx(nx, nz)])) {
          bits |= 1 << d;
          return;
        }
        // (en el suelo del estero se sube y se baja caminando la barranca)
        const join = w.groundCell?.[i] && w.groundCell[w.idx(nx, nz)] ? 0.75 : JOIN;
        if (Math.abs(edgeY(w, x, z, d) - edgeY(w, nx, nz, d ^ 1)) < join) bits |= 1 << d;
        // (el estero: de las tablas bajas al agua honda uno se tira, y nadando trepa)
        else if (w.passExtra?.(i, w.idx(nx, nz))) bits |= 1 << d;
      });
      w.pass[i] = bits;
    }
  }
}

// Altura del piso en (x, z) (en el penal nada se superpone).
export function heightAt(w, x, z) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  // (afuera de la grilla: el mapa puede decir qué hay, w.outY; el Monumento: la plaza, las calles y el río)
  if (!w.inside(cx, cz)) return w.outY ? w.outY(x, z) : FEATURES.farm ? 0 : WATER_Y;
  const i = w.idx(cx, cz);
  if (w.groundCell?.[i]) return w.groundAt(x, z);
  const r = w.rampAt[i];
  if (r >= 0) return rampY(RAMPS[r], x, z);
  return w.grid[i] === OUT ? w.ty[i] : w.fy[i];
}

// Techo sobre la celda (Infinity si es al aire libre).
export function ceilAt(w, cx, cz) {
  if (!w.inside(cx, cz)) return Infinity;
  const i = w.idx(cx, cz);
  if (w.grid[i] !== FLOOR) return Infinity;
  const Z = ZONES[w.zoneKeys[w.zone[i]]];
  return Z.outdoor ? Infinity : ceilY(w, i, cx + 0.5, cz + 0.5);
}

// ¿Se puede pasar de la celda (x, z) a la vecina (dx, dz)? (sin desnivel)
export function canStep(w, x, z, dx, dz) {
  const p = w.pass;
  const bit = (xx, zz, ddx, ddz) => {
    const d = ddx > 0 ? 0 : ddx < 0 ? 1 : ddz > 0 ? 2 : 3;
    return (p[w.idx(xx, zz)] >> d) & 1;
  };
  if (!dx || !dz) return !!bit(x, z, dx, dz);
  return !!(bit(x, z, dx, 0) && bit(x + dx, z, 0, dz) && bit(x, z, 0, dz) && bit(x, z + dz, dx, 0));
}

// ¿Se puede ir caminando derecho de a a b sin cruzar un desnivel?
// (y: la altura del que camina; la usa la torre, que tiene pisos apilados)
export function walkLine(w, ax, az, bx, bz, y) {
  if (w.tower) return w.tower.walkLine(ax, az, bx, bz, y);
  let cx = Math.floor(ax);
  let cz = Math.floor(az);
  const tx = Math.floor(bx);
  const tz = Math.floor(bz);
  const dx = bx - ax;
  const dz = bz - az;
  const sx = dx > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-9));
  const tdz = Math.abs(1 / (dz || 1e-9));
  let tmx = dx > 0 ? (cx + 1 - ax) * tdx : (ax - cx) * tdx;
  let tmz = dz > 0 ? (cz + 1 - az) * tdz : (az - cz) * tdz;
  for (let k = 0; k < 64 && (cx !== tx || cz !== tz); k++) {
    if (!w.inside(cx, cz) || !w.pass) return true;
    if (tmx < tmz) {
      if (!canStep(w, cx, cz, sx, 0)) return false;
      tmx += tdx;
      cx += sx;
    } else {
      if (!canStep(w, cx, cz, 0, sz)) return false;
      tmz += tdz;
      cz += sz;
    }
  }
  return true;
}

// La granja: si el techo de la celda de al lado (más baja) queda a la altura
// de este piso, el borde es una pared (el ático del pajar), no una baranda.
function lowCeil(w, x, z, y) {
  if (!FEATURES.farm) return false;
  const j = w.idx(x, z);
  if (w.grid[j] !== FLOOR || ZONES[w.zoneKeys[w.zone[j]]].outdoor) return false;
  return roofOf(w, j) <= y + 0.05;
}

// Cajas de colisión de la arquitectura con alturas (reemplaza el armado plano).
export function addLevelBoxes(w, DOORS) {
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      const e = w.edge[i];
      const fy = w.fy[i];
      // (el Monumento tiene pisos abajo de 0 —la Costanera a -4,4—: una caja de
      // -1 hasta la baranda quedaba dada vuelta y no frenaba a nadie, y la
      // gente se iba al río por la baranda de la costanera y por las puntas)
      const lo = FEATURES.monumento ? Math.min(-1, fy - 3) : -1;
      const top = FEATURES.monumento ? Math.max(w.top[i], fy + 3.4) : w.top[i];
      if (t === WALL) {
        if (e === EDGE_RAIL) w.addBox([x, lo, z, x + 1, fy + RAIL_H, z + 1], { kind: 'fence', shoot: false });
        else if (e === EDGE_BARS) w.addBox([x, lo, z, x + 1, fy + BARS_H, z + 1], { kind: 'fence', shoot: false });
        // alambrado: frena al que camina pero los tiros y la vista pasan por arriba
        else if (e === EDGE_FENCE) w.addBox([x, lo, z, x + 1, fy + FENCE_H, z + 1], { kind: 'fence', shoot: false });
        else if (e === EDGE_CORN) w.addBox([x, lo, z, x + 1, fy + CORN_H, z + 1], { kind: 'corn' });
        else w.addBox([x, lo, z, x + 1, top, z + 1], { kind: 'wall' });
      } else if (t === WINDOW) {
        const win = w.windowAt[i];
        if (e !== 0) {
          w.addBox([x, lo, z, x + 1, fy, z + 1], { kind: 'wall' });
          w.addBox([x, fy, z, x + 1, fy + WALL_H, z + 1], { kind: 'window', shoot: false, window: win });
        } else {
          w.addBox([x, lo, z, x + 1, fy + SILL, z + 1], { kind: 'wall' });
          w.addBox([x, fy + HEAD, z, x + 1, top, z + 1], { kind: 'wall' });
          w.addBox([x, fy, z, x + 1, fy + WALL_H, z + 1], { kind: 'window', shoot: false, window: win });
        }
      } else if (t === DOOR) {
        const door = w.doorAt[i];
        if (e === 0) w.addBox([x, fy + DOOR_H, z, x + 1, top, z + 1], { kind: 'wall' });
        const h = e === 0 ? DOOR_H : e === EDGE_BARS ? BARS_H : e === EDGE_CORN ? CORN_H : 1.6;
        const b = w.addBox([x, fy, z, x + 1, fy + h, z + 1], { kind: 'door', door, shoot: e === 0 || e === EDGE_CORN });
        (DOORS[door].boxes ||= []).push(b);
      }
      // el suelo de las celdas altas: frena al que viene de abajo (los tiros los ve el rayo)
      if (walkable(t) && fy > 0.2) {
        let low = fy;
        if (w.rampAt[i] >= 0) for (let d = 0; d < 4; d++) low = Math.min(low, edgeY(w, x, z, d));
        if (low - STEP > -0.9) w.addBox([x, -1, z, x + 1, low - STEP, z + 1], { kind: 'ground', shoot: false });
      }
      // barandas donde el piso de al lado está más abajo
      if (walkable(t) && w.pass) {
        DIRS.forEach(([dx, dz], d) => {
          if ((w.pass[i] >> d) & 1) return;
          const nx = x + dx;
          const nz = z + dz;
          if (!w.inside(nx, nz) || !walkable(w.grid[w.idx(nx, nz)])) return;
          const hi = edgeY(w, x, z, d);
          if (hi < edgeY(w, nx, nz, d ^ 1)) return;
          // (el Monumento: donde no hay baranda dibujada uno se tira para
          // abajo: el costado de las escaleras de la Cripta)
          if (w.dropOk?.(i, w.idx(nx, nz))) return;
          // (Eclipse Matero, 2026-10-07, el usuario: "escaleras sin barandillas
          // que si querés saltar no te deja porque hay una pared invisible". Al
          // costado de las escaleras la baranda no se dibuja (ver más abajo,
          // __mduNoEclStairRail) pero su choque había quedado: sin baranda, uno
          // se tira para abajo. globalThis.__mduOldEclStairWall: como antes)
          if (FEATURES.eclipse && globalThis.__mduNoEclStairRail !== true && globalThis.__mduOldEclStairWall !== true && stairSide(w, i, dx, dz)) return;
          const ex = x + 0.5 + dx * 0.5;
          const ez = z + 0.5 + dz * 0.5;
          const th = 0.06;
          const wall = lowCeil(w, nx, nz, hi);
          const top = hi + (wall ? 3 : RAIL_H);
          const box = dx ? [ex - th - dx * th, hi, z, ex + th - dx * th, top, z + 1] : [x, hi, ez - th - dz * th, x + 1, top, ez + th - dz * th];
          w.addBox(box, wall ? { kind: 'wall' } : { kind: 'rail', shoot: false });
        });
      }
    }
  }
}

// Arquitectura con alturas: paredes, pisos, techos, escalones, barandas y desniveles.
export function buildLevelArchitecture(w, DOORS) {
  const gb = new GeoBuilder();
  const M = w.M;
  const isWallish = (t) => t === WALL || t === DOOR || t === WINDOW;
  const open = (x, z) => w.inside(x, z) && w.grid[w.idx(x, z)] !== FLOOR && w.edge[w.idx(x, z)] !== 0;
  const face = (key, cx, cz, n, y0, y1) => {
    if (y1 - y0 < 0.005) return;
    const right = [n[1], -n[0]];
    const mx = cx + 0.5 + n[0] * 0.5;
    const mz = cz + 0.5 + n[1] * 0.5;
    const lx = mx - right[0] * 0.5;
    const lz = mz - right[1] * 0.5;
    const rx = mx + right[0] * 0.5;
    const rz = mz + right[1] * 0.5;
    const uOff = lx * right[0] + lz * right[1];
    gb.wall(key, lx, lz, rx, rz, y0, y1, [n[0], 0, n[1]], WALL_H, uOff);
  };
  // cara con el borde de abajo inclinado (pared al costado de una rampa)
  const slopeFace = (key, ax, az, ya, bx, bz, yb, y1, n) => {
    const u0 = (ax * -n[1] + az * n[0]) / 2;
    const u1 = (bx * -n[1] + bz * n[0]) / 2;
    gb.quad(key, [ax, ya, az], [bx, yb, bz], [bx, y1, bz], [ax, y1, az], [n[0], 0, n[1]], [u0, ya / WALL_H], [u1, yb / WALL_H], [u1, y1 / WALL_H], [u0, y1 / WALL_H]);
  };
  const zoneOf = (i) => ZONES[w.zoneKeys[w.zone[i]]];
  // el castillo: el tramo del puente levadizo (el rectángulo lleva un 2 en el
  // lugar 6) no tiene tablero de piedra: el puente es de madera y es la puerta
  // (world/Interactables.js); tampoco lleva cordón a los costados
  const drawCell = (i) => {
    if (!FEATURES.castle || w.grid[i] !== FLOOR) return false;
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    return (zoneOf(i).rects || []).some((r) => r[6] === 2 && x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
  };
  const besideDraw = (x, z) =>
    FEATURES.castle &&
    DIRS.some(([dx, dz]) => w.inside(x + dx, z + dz) && drawCell(w.idx(x + dx, z + dz)));
  const wallMatFor = (nx, nz, x, z) => {
    if (w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR) {
      const k = zoneOf(w.idx(nx, nz)).wall;
      if (k) return k;
    }
    const o = w.inside(x, z) ? w.owner[w.idx(x, z)] : -1;
    return (o >= 0 && ZONES[w.zoneKeys[o]].ext) || 'exterior';
  };
  // cordón de los bordes abiertos: la tapa y los costados, que bajan hasta el
  // terreno de afuera o hasta el piso más bajo de al lado (la escalera)
  let curbTop = M.stoneStep ? 'stoneStep' : 'wallTop';
  let curbSide = M.stoneWall ? 'stoneWall' : 'exterior';
  // la granja: el alambrado lo arma world/Farm.js; el cordón va solo donde el
  // borde está en alto (el barbacuá), con el material del desnivel de al lado
  const farmCurb = (x, z) => {
    let key = null;
    DIRS.forEach(([dx, dz]) => {
      const nx = x + dx;
      const nz = z + dz;
      if (!key && w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === FLOOR) key = zoneOf(w.idx(nx, nz)).cliff || null;
    });
    return key || 'exterior';
  };
  const buildCurbSides = (x, z, i, top) => {
    DIRS.forEach((n, d) => {
      const nx = x + n[0];
      const nz = z + n[1];
      if (!w.inside(nx, nz)) {
        face(curbSide, x, z, n, WATER_Y - 1, top);
        return;
      }
      const j = w.idx(nx, nz);
      const nt = w.grid[j];
      if (nt === OUT) {
        // (al costado de un puente del castillo baja solo el espesor del tablero)
        const base = w.curbBase ? w.curbBase(x, z, w.ty[j] - 0.6, top) : w.ty[j] - 0.6;
        if (base < top) face(curbSide, x, z, n, base, top);
      } else if (nt === FLOOR) {
        const [ax, az, ya, bx, bz, yb] = edgeEnds(w, nx, nz, d ^ 1);
        if (Math.min(ya, yb) < top - 0.01) slopeFace(curbSide, bx, bz, Math.min(yb, top), ax, az, Math.min(ya, top), top, n);
      } else if (w.edge[j] !== 0 && w.fy[j] < top - 0.01) face(curbSide, x, z, n, w.fy[j], top);
      // (el castillo: contra una pared común más baja quedaba el hueco entre
      // las dos; al este del adarve, sobre la bodega enterrada, desde el vuelo
      // del dragón se veía el cielo por ahí)
      else if (FEATURES.castle && w.edge[j] === 0 && isWallish(nt) && w.top[j] < top - 0.01) face(curbSide, x, z, n, w.top[j], top);
    });
  };
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      if (!isWallish(t)) continue;
      const fy = w.fy[i];
      const top = w.top[i];
      if (w.edge[i] !== 0) {
        // (el estero arma sus bordes: pajonal y barandas de palo)
        if (besideDraw(x, z) || w.ownEdges) continue;
        if (FEATURES.farm) {
          if (fy < 0.2) {
            if (t === DOOR) gb.flat(ZONES[DOORS[w.doorAt[i]].zones[0]].floor, x, z, x + 1, z + 1, 0.001, true);
            continue;
          }
          curbTop = curbSide = farmCurb(x, z);
        }
        if (t === DOOR) {
          const d = DOORS[w.doorAt[i]];
          gb.flat(ZONES[d.zones[0]].floor, x, z, x + 1, z + 1, fy + 0.001, true);
        } else gb.flat(curbTop, x, z, x + 1, z + 1, fy + 0.001, true);
        buildCurbSides(x, z, i, fy);
        continue;
      }
      DIRS.forEach((n, d) => {
        const nx = x + n[0];
        const nz = z + n[1];
        let nt = w.inside(nx, nz) ? w.grid[w.idx(nx, nz)] : OUT;
        if (open(nx, nz)) nt = OUT;
        const j = w.inside(nx, nz) ? w.idx(nx, nz) : -1;
        const mat = wallMatFor(nx, nz, x, z);
        // desde el piso (o el terreno) del otro lado
        let base = WATER_Y - 0.5;
        if (nt === FLOOR) {
          const [ax, az, ya, bx, bz, yb] = edgeEnds(w, nx, nz, d ^ 1);
          if (Math.abs(ya - yb) > 0.01) {
            // rampa pegada a la pared
            const R = RAMPS[w.rampAt[j]];
            if (t === WALL && FEATURES.castle && R?.ceil && !zoneOf(j).under) {
              // (el pasillo cubierto: el revoque hasta su techo inclinado y, arriba,
              // la piedra de afuera; entera en revoque asomaba por encima del techo)
              const ca = Math.min(top, ceilY(w, j, ax, az));
              const cb = Math.min(top, ceilY(w, j, bx, bz));
              const u0 = (bx * -n[1] + bz * n[0]) / 2;
              const u1 = (ax * -n[1] + az * n[0]) / 2;
              const N = [n[0], 0, n[1]];
              gb.quad(mat, [bx, yb, bz], [ax, ya, az], [ax, ca, az], [bx, cb, bz], N, [u0, yb / WALL_H], [u1, ya / WALL_H], [u1, ca / WALL_H], [u0, cb / WALL_H]);
              if (top > Math.min(ca, cb) + 0.01) gb.quad(zoneOf(j).ext || 'exterior', [bx, cb, bz], [ax, ca, az], [ax, top, az], [bx, top, bz], N, [u0, cb / WALL_H], [u1, ca / WALL_H], [u1, top / WALL_H], [u0, top / WALL_H]);
            } else if (t === WALL) slopeFace(mat, bx, bz, yb, ax, az, ya, top, n);
            else if (t === WINDOW) {
              slopeFace(mat, bx, bz, yb, ax, az, ya, fy + SILL, n);
              face(mat, x, z, n, fy + HEAD, top);
            } else if (t === DOOR) face(mat, x, z, n, fy + DOOR_H, top);
            return;
          }
          base = Math.min(ya, yb);
        } else if (nt === OUT) base = j >= 0 ? w.ty[j] - 0.6 : WATER_Y - 0.5;
        else if (nt === WALL || nt === DOOR || nt === WINDOW) {
          // pared de al lado más baja: se ve el costado de esta
          const other = w.top[j];
          if (other < top - 0.01 && w.edge[j] === 0) face(mat, x, z, n, other, top);
          else if (w.edge[j] !== 0) face(mat, x, z, n, w.fy[j], top);
          if (t === WALL && nt === DOOR && w.edge[j] === 0) face('trim', x, z, n, w.fy[j], w.fy[j] + DOOR_H);
          if (t === WALL && nt === WINDOW && w.edge[j] === 0) face('trim', x, z, n, w.fy[j] + SILL, w.fy[j] + HEAD);
          // (ventana pegada a una puerta: las puntas del antepecho y del dintel
          // quedan a la vista en el vano de la puerta; sin cara, por la rendija
          // se veía afuera: la barraca del estero)
          if (t === WINDOW && nt === DOOR && w.edge[j] === 0) {
            face('trim', x, z, n, fy, fy + SILL);
            face('trim', x, z, n, fy + HEAD, w.fy[j] + DOOR_H);
          }
          return;
        }
        // el castillo: lo que asoma arriba del techo de ese salón es la cara de afuera
        const roofN = FEATURES.castle && nt === FLOOR && !zoneOf(j).outdoor ? ceilMax(w, j) : Infinity;
        const upper = (y0, y1) => {
          if (roofN < y1 - 0.01 && roofN > y0 + 0.01) {
            face(mat, x, z, n, y0, roofN);
            face(zoneOf(j).ext || 'exterior', x, z, n, roofN, y1);
          } else if (roofN <= y0 + 0.01) face(zoneOf(j).ext || 'exterior', x, z, n, y0, y1);
          else face(mat, x, z, n, y0, y1);
        };
        if (t === WALL) upper(base, top);
        else if (t === WINDOW) {
          face(mat, x, z, n, base, fy + SILL);
          upper(fy + HEAD, top);
        } else if (t === DOOR) {
          // (si el techo de ese lado queda más bajo que el dintel, la pared
          // sigue desde el techo: no queda una ranura arriba del techo)
          upper(roofN > fy + 0.01 && roofN < fy + DOOR_H ? roofN : fy + DOOR_H, top);
          // (y del lado de adentro del vano: desde la puerta, arriba del techo
          // bajo se veía el vacío como una ranura negra)
          if (roofN > fy + 0.01 && roofN < fy + DOOR_H - 0.01) face(mat, nx, nz, [-n[0], -n[1]], roofN, fy + DOOR_H);
          if (base < fy - 0.01) face(mat, x, z, n, base, fy);
        }
      });
      gb.flat('wallTop', x, z, x + 1, z + 1, top, true);
      if (t === WINDOW) {
        gb.flat('trim', x, z, x + 1, z + 1, fy + SILL, true, 1);
        gb.flat('trim', x, z, x + 1, z + 1, fy + HEAD, false, 1);
      }
      if (t === DOOR) {
        const d = DOORS[w.doorAt[i]];
        gb.flat(ZONES[d.zones[0]].floor, x, z, x + 1, z + 1, fy + 0.001, true);
        gb.flat('trim', x, z, x + 1, z + 1, fy + DOOR_H, false, 1);
      }
    }
  }
  // pisos (las rampas inclinadas; las escaleras se arman aparte) y techos
  const stairCells = new Set();
  RAMPS.forEach((r) => {
    if (!r.steps) return;
    const [x0, z0, x1, z1] = r.rect;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) stairCells.add(w.idx(x, z));
  });
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR) continue;
      const Z = zoneOf(i);
      const r = w.rampAt[i];
      if (r >= 0) {
        if (!stairCells.has(i)) {
          const R = RAMPS[r];
          const h = (px, pz) => rampY(R, px, pz) + 0.002;
          const n = new THREE.Vector3();
          const a = new THREE.Vector3(x, h(x, z + 1), z + 1);
          const b = new THREE.Vector3(x + 1, h(x + 1, z + 1), z + 1);
          const c = new THREE.Vector3(x + 1, h(x + 1, z), z);
          n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
          const uv = (px, pz) => [px / 2, pz / 2];
          gb.quad(R.mat || Z.floor, a.toArray(), b.toArray(), c.toArray(), [x, h(x, z), z], n.toArray(), uv(x, z + 1), uv(x + 1, z + 1), uv(x + 1, z), uv(x, z));
        }
      } else if (!drawCell(i) && !w.groundCell?.[i]) gb.flat(Z.floor, x, z, x + 1, z + 1, w.fy[i] + 0.001, true);
      if (!Z.outdoor && Z.ceil) {
        const roof = roofOf(w, i);
        const slanted = r >= 0 && !!RAMPS[r].ceil;
        if (slanted) {
          // el techo propio de la escalera (inclinado) y, arriba, la pizarra
          const P = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([px, pz]) => [px, ceilY(w, i, px, pz), pz]);
          const U = P.map((p) => [p[0] / 2, p[2] / 2]);
          quadUV(gb, Z.ceil, P, U, [0, -1, 0]);
          // (la zona con `lid` se tapa por arriba: la cripta del estero asoma
          // del suelo y desde afuera el techo, de una sola cara, no se veía)
          if (Z.lid && !FEATURES.castle) quadUV(gb, Z.lid, P.map((p) => [p[0], p[1] + 0.02, p[2]]), U, [0, 1, 0]);
          if (FEATURES.castle && !Z.under) {
            // el pasillo cubierto lleva una losa de verdad (de lejos era una
            // hoja de un pixel): la pizarra 25 cm arriba y, donde queda a la
            // vista (la boca de arriba, arriba de las paredes), el canto de piedra
            const T = RAMPS[r].ceil === 'slope' ? 0.25 : 0.02;
            quadUV(gb, 'roofTop', P.map((p) => [p[0], p[1] + T, p[2]]), U, [0, 1, 0]);
            if (T > 0.1) {
              DIRS.forEach(([dx, dz]) => {
                const nx = x + dx;
                const nz = z + dz;
                if (!w.inside(nx, nz)) return;
                const j = w.idx(nx, nz);
                if (w.rampAt[j] === r) return;
                const mx = x + 0.5 + dx * 0.5;
                const mz = z + 0.5 + dz * 0.5;
                const ax = mx - dz * 0.5;
                const az = mz + dx * 0.5;
                const bx = mx + dz * 0.5;
                const bz = mz - dx * 0.5;
                const hA = ceilY(w, i, ax, az);
                const hB = ceilY(w, i, bx, bz);
                const shown = w.grid[j] === FLOOR ? !!zoneOf(j).outdoor : w.top[j] < Math.max(hA, hB) + T - 0.01;
                if (!shown) return;
                quadUV(gb, Z.ext || 'exterior', [[ax, hA, az], [bx, hB, bz], [bx, hB + T, bz], [ax, hA + T, az]], [[0, 0], [0.5, 0], [0.5, T / 2], [0, T / 2]], [dx, 0, dz]);
              });
            }
          }
        } else {
          gb.flat(Z.ceil, x, z, x + 1, z + 1, roof, false);
          // la granja: el techo de chapa por arriba (desde el barbacuá se ven los techos)
          if (FEATURES.farm) gb.flat('roofTin', x, z, x + 1, z + 1, roof + 0.02, true);
          // el castillo: una losa de pizarra (desde el adarve y la cumbre se ven los techos)
          else if (FEATURES.castle && !Z.under) gb.flat('roofTop', x, z, x + 1, z + 1, roof + 0.02, true);
          // el penal: chapa por arriba (desde la telesilla se veían solo las vigas)
          else if (FEATURES.penal) gb.flat(Z.lid || 'roofTin', x, z, x + 1, z + 1, roof + 0.02, true);
          else if (Z.lid) gb.flat(Z.lid, x, z, x + 1, z + 1, roof + 0.02, true);
        }
        // escalón del techo: donde la celda de al lado tiene el techo más bajo
        // (la escalera de los calabozos) se cierra la cara que queda entre los dos
        DIRS.forEach(([dx, dz]) => {
          const nx = x + dx;
          const nz = z + dz;
          if (!w.inside(nx, nz)) return;
          const j = w.idx(nx, nz);
          if (w.grid[j] !== FLOOR || zoneOf(j).outdoor) return;
          if (!slanted && !(w.rampAt[j] >= 0 && RAMPS[w.rampAt[j]].ceil)) {
            const low = roofOf(w, j);
            if (low < roof - 0.01) face(Z.wall || 'stoneWall', nx, nz, [-dx, -dz], low, roof);
            return;
          }
          // con un techo inclinado de por medio la franja puede ser un trapecio;
          // del lado de afuera (arriba del techo más bajo) va la piedra de afuera
          const mx = x + 0.5 + dx * 0.5;
          const mz = z + 0.5 + dz * 0.5;
          const ax = mx - dz * 0.5;
          const az = mz + dx * 0.5;
          const bx = mx + dz * 0.5;
          const bz = mz - dx * 0.5;
          const hA = ceilY(w, i, ax, az);
          const hB = ceilY(w, i, bx, bz);
          const lA = Math.min(hA, ceilY(w, j, ax, az));
          const lB = Math.min(hB, ceilY(w, j, bx, bz));
          if (hA - lA < 0.01 && hB - lB < 0.01) return;
          const P = [[ax, lA, az], [bx, lB, bz], [bx, hB, bz], [ax, hA, az]];
          const u0 = (ax * dz - az * dx) / 2;
          const u1 = (bx * dz - bz * dx) / 2;
          const U = [[u0, lA / WALL_H], [u1, lB / WALL_H], [u1, hB / WALL_H], [u0, hA / WALL_H]];
          quadUV(gb, Z.wall || 'stoneWall', P, U, [-dx, 0, -dz]);
          if (FEATURES.castle && !Z.under) quadUV(gb, Z.ext || 'exterior', P, U, [dx, 0, dz]);
        });
      }
    }
  }
  // escaleras: escalones de verdad sobre la rampa
  RAMPS.forEach((R) => {
    if (!R.steps) return;
    const [x0, z0, x1, z1] = R.rect;
    const alongX = R.dir === '+x' || R.dir === '-x';
    const len = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
    const rise = R.y1 - R.y0;
    const count = Math.max(2, Math.round(Math.abs(rise) / 0.22));
    const run = len / count;
    const key = R.mat || 'stoneStep';
    const low = Math.min(R.y0, R.y1) - 0.05;
    // (Eclipse Matero: los costados de los escalones quedaban en el mismo plano
    // que las paredes copiadas de cada mapa y titilaban según el ángulo: 3 cm
    // adentro. globalThis.__mduNoEclStairInset: como antes)
    const ins = FEATURES.eclipse && globalThis.__mduNoEclStairInset !== true ? 0.03 : 0;
    for (let k = 0; k < count; k++) {
      // el escalón k (desde la punta baja)
      const hTop = Math.min(R.y0, R.y1) + (Math.abs(rise) * (k + 1)) / count;
      const up = rise >= 0 ? R.dir[0] === '+' : R.dir[0] === '-';
      const s0 = up ? k * run : len - (k + 1) * run;
      const s1 = s0 + run;
      if (alongX) gb.box(key, x0 + s0, low, z0 + ins, x0 + s1, hTop, z1 + 1 - ins);
      else gb.box(key, x0 + ins, low, z0 + s0, x1 + 1 - ins, hTop, z0 + s1);
    }
    if (FEATURES.farm) farmStairSides(w, gb, R);
  });
  // vigas del techo de cada zona techada
  for (const k of w.zoneKeys) {
    const Z = ZONES[k];
    if (Z.outdoor || !Z.ceil || Z.circle || Z.noBeams) continue;
    for (const [x0, z0, x1, z1, , rr] of Z.rects || [Z.rect]) {
      const H = rr || (Z.roof ?? (Z.y ?? 0) + (Z.h ?? WALL_H));
      const alongX = x1 - x0 < z1 - z0;
      const metal = Z.ceil === 'corrugated';
      const key = metal ? 'truss' : 'beam';
      // (Eclipse, mundo it. 4: la viga que pasa sobre una escalera con techo propio
      // -inclinado o hueco- o sin lugar para la cabeza quedaba cruzada a la altura del
      // pecho: la de la cripta del estero. Esa viga no va.)
      const overStair = (cells) => FEATURES.eclipse && globalThis.__mduNoBeamStairs !== true && cells.some(([cx, cz]) => {
        if (!w.inside(cx, cz)) return false;
        const r = w.rampAt[w.idx(cx, cz)];
        if (r < 0) return false;
        const R = RAMPS[r];
        return !!R.ceil || Math.max(rampY(R, cx, cz), rampY(R, cx + 1, cz + 1), rampY(R, cx + 1, cz), rampY(R, cx, cz + 1)) + 2.2 > H - 0.26;
      });
      const row = (fz) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, Math.floor(fz)]);
      const col = (fx) => Array.from({ length: z1 - z0 + 1 }, (_, i) => [Math.floor(fx), z0 + i]);
      if (alongX) for (let zz = z0 + 1.5; zz < z1; zz += 2.4) { if (!overStair(row(zz))) gb.box(key, x0, H - 0.26, zz - 0.09, x1 + 1, H, zz + 0.09); }
      else for (let xx = x0 + 1.5; xx < x1; xx += 2.4) { if (!overStair(col(xx))) gb.box(key, xx - 0.09, H - 0.26, z0, xx + 0.09, H, z1 + 1); }
    }
  }
  // (el estero: la puerta de una casa sobre pilotes queda apenas más alta que el
  // suelo de afuera y se pasa caminando, así que no lleva barranco; sin la cara
  // de ese escalón se veía por la rendija el hueco de abajo de la casa)
  const doorStep = (i, x, z, dx, dz, d) => {
    const nx = x + dx;
    const nz = z + dz;
    if (!w.inside(nx, nz) || !w.groundCell[w.idx(nx, nz)]) return;
    const [ax, az, ya, bx, bz, yb] = edgeEnds(w, x, z, d);
    const lo = Math.min(w.groundAt(ax, az), w.groundAt(bx, bz));
    if (Math.max(ya, yb) <= lo + 0.005) return;
    const Z = (w.inside(x - dx, z - dz) && w.grid[w.idx(x - dx, z - dz)] === FLOOR ? zoneOf(w.idx(x - dx, z - dz)) : null) || zoneOf(i);
    const key = Z?.ext || Z?.cliff || 'stoneWall';
    const y0 = lo - 0.3;
    const ua = (ax * -dz + az * dx) / 2;
    const ub = (bx * -dz + bz * dx) / 2;
    gb.quad(key, [ax, y0, az], [bx, y0, bz], [bx, yb, bz], [ax, ya, az], [dx, 0, dz], [ua, y0 / 2], [ub, y0 / 2], [ub, yb / 2], [ua, ya / 2]);
  };
  // desniveles adentro de las zonas: la cara del barranco y la baranda arriba
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (!walkable(w.grid[i])) continue;
      DIRS.forEach(([dx, dz], d) => {
        if ((w.pass[i] >> d) & 1) {
          if (w.grid[i] === DOOR && w.groundCell && !w.groundCell[i]) doorStep(i, x, z, dx, dz, d);
          return;
        }
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz) || !walkable(w.grid[w.idx(nx, nz)])) return;
        // (el estero: entre suelo y suelo nada; bajo las tablas, sin cara)
        const skip = w.skipCliff?.(i, w.idx(nx, nz));
        if (skip === 'all') return;
        const [ax, az, ya, bx, bz, yb] = edgeEnds(w, x, z, d);
        const [, , la, , , lb] = edgeEnds(w, nx, nz, d ^ 1);
        const lo = Math.min(la, lb);
        if (Math.max(ya, yb) <= Math.max(la, lb) + 0.01) return;
        // la granja: al costado de una escalera no va barranco (se pisaba con
        // el costado de los escalones) ni baranda suelta: los arma farmStairSides
        if (FEATURES.farm && stairSide(w, i, dx, dz)) return;
        const key = zoneOf(i)?.cliff || 'stoneWall';
        // mirando hacia la celda de abajo: con el orden de vértices que mira para
        // ese lado (al revés la cara se descarta y se ve a través: en el penal
        // se veía el cielo por abajo del borde de la pasarela del pabellón)
        const ua = (ax * -dz + az * dx) / 2;
        const ub = (bx * -dz + bz * dx) / 2;
        // (al costado de una escalera la cara ya la ponen los escalones: si no, se pisan y titilan)
        if (!stairSide(w, i, dx, dz) && skip !== 'face') gb.quad(key, [ax, lo - 0.02, az], [bx, lo - 0.02, bz], [bx, yb, bz], [ax, ya, az], [dx, 0, dz], [ua, lo / 2], [ub, lo / 2], [ub, yb / 2], [ua, ya / 2]);
        // (Eclipse Matero: al costado de una escalera no va la baranda suelta
        // celda por celda —quedaban caños escalonados cruzando los escalones en
        // las secciones copiadas—. globalThis.__mduNoEclStairRail: como antes)
        if (FEATURES.eclipse && globalThis.__mduNoEclStairRail !== true && stairSide(w, i, dx, dz)) return;
        // el castillo pone su parapeto de piedra (world/Castle.js)
        if (w.dropEdge?.(w, gb, i, ax, az, ya, bx, bz, yb, dx, dz)) return;
        // del otro lado de la pared del ático no va baranda
        if (lowCeil(w, nx, nz, Math.max(ya, yb))) return;
        // baranda de hierro (en la granja, de palo): dos caños y un parante por metro
        const rk = FEATURES.farm || FEATURES.esteros ? 'woodDark' : 'iron';
        const rt = FEATURES.farm || FEATURES.esteros ? 0.045 : 0.025;
        const ins = 0.05;
        const px = -dx * ins;
        const pz = -dz * ins;
        const my = (ya + yb) / 2;
        for (const hy of [0.55, RAIL_H]) {
          if (dx) gb.box(rk, ax + px - rt, my + hy - 0.03, Math.min(az, bz), ax + px + rt, my + hy + 0.03, Math.max(az, bz), 1);
          else gb.box(rk, Math.min(ax, bx), my + hy - 0.03, az + pz - rt, Math.max(ax, bx), my + hy + 0.03, az + pz + rt, 1);
        }
        const cx = (ax + bx) / 2 + px;
        const cz = (az + bz) / 2 + pz;
        gb.box(rk, cx - rt - 0.01, my, cz - rt - 0.01, cx + rt + 0.01, my + RAIL_H, cz + rt + 0.01, 1);
        // borde de piedra del desnivel (apenas salido de la cara, para que no se pisen)
        const out = 0.012;
        if (dx) gb.box('trim', ax - (dx > 0 ? 0.08 : out), my - 0.06, Math.min(az, bz), ax + (dx < 0 ? 0.08 : out), my + 0.01, Math.max(az, bz), 1);
        else gb.box('trim', Math.min(ax, bx), my - 0.06, az - (dz > 0 ? 0.08 : out), Math.max(ax, bx), my + 0.01, az + (dz < 0 ? 0.08 : out), 1);
      });
    }
  }
  // marcos de ventana
  for (const def of WINDOWS) {
    const [x, z] = def.cell;
    if (w.edge[w.idx(x, z)] !== 0) continue;
    const fy = w.fy[w.idx(x, z)];
    const [ox, oz] = def.out;
    const ix = x + 0.5 - ox * 0.45;
    const iz = z + 0.5 - oz * 0.45;
    const px = oz !== 0 ? 0.5 : 0.04;
    const pz = ox !== 0 ? 0.5 : 0.04;
    gb.box('trim', ix - px, fy + SILL - 0.06, iz - pz, ix + px, fy + SILL + 0.02, iz + pz, 1);
    gb.box('trim', ix - px, fy + HEAD - 0.02, iz - pz, ix + px, fy + HEAD + 0.06, iz + pz, 1);
    // rejas de la ventana (es una cárcel; la granja no). En el penal no van:
    // son ventanas de los muertos, que entran por el hueco y las atravesaban
    // (el usuario, 2026-10-05)
    const noReja = FEATURES.penal && !globalThis.__mduNoRejaVentana;
    for (let k = -2; k <= 2 && !FEATURES.farm && !w.noBars && !noReja; k++) {
      const off = k * 0.18;
      const bx = ix + (oz !== 0 ? off : 0) + ox * 0.35;
      const bz = iz + (ox !== 0 ? off : 0) + oz * 0.35;
      gb.box('iron', bx - 0.015, fy + SILL, bz - 0.015, bx + 0.015, fy + HEAD, bz + 0.015, 1);
    }
  }
  buildOpenEdges(w, gb);
  w.root.add(gb.build(M));
}

// Barandas bajas (el muelle, el cerro) y rejas altas (los patios) en los bordes abiertos.
function buildOpenEdges(w, gb) {
  // el castillo: almenas, cercas y muritos (world/Castle.js)
  if (w.openEdges) {
    w.openEdges(w, gb);
    return;
  }
  const kind = (x, z) => {
    if (!w.inside(x, z)) return null;
    const i = w.idx(x, z);
    const t = w.grid[i];
    if (t === OUT || t === FLOOR || (w.edge[i] !== EDGE_RAIL && w.edge[i] !== EDGE_BARS)) return null;
    return t === WINDOW || t === DOOR ? 'gap' : 'post';
  };
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (kind(x, z) !== 'post') continue;
      const i = w.idx(x, z);
      const bars = w.edge[i] === EDGE_BARS;
      const fy = w.fy[i];
      const cx = x + 0.5;
      const cz = z + 0.5;
      const H = bars ? BARS_H : RAIL_H;
      // base de piedra que llega hasta el terreno de abajo
      gb.box('stoneWall', cx - 0.14, fy - 3, cz - 0.14, cx + 0.14, fy + (bars ? 0.35 : 0.2), cz + 0.14, 1);
      gb.box('iron', cx - 0.05, fy, cz - 0.05, cx + 0.05, fy + H + 0.08, cz + 0.05, 1);
      for (const [dx, dz] of DIRS) {
        const k = kind(x + dx, z + dz);
        if (!k || (k === 'post' && (dx < 0 || dz < 0))) continue;
        const len = k === 'post' ? 1 : 0.5;
        const bx = cx + dx * len;
        const bz = cz + dz * len;
        const x0 = Math.min(cx, bx);
        const x1 = Math.max(cx, bx);
        const z0 = Math.min(cz, bz);
        const z1 = Math.max(cz, bz);
        const th = 0.025;
        const band = (y, t) => (dx ? gb.box('iron', x0, fy + y - t, cz - th, x1, fy + y + t, cz + th, 1) : gb.box('iron', cx - th, fy + y - t, z0, cx + th, fy + y + t, z1, 1));
        band(H, 0.035);
        band(bars ? 0.3 : 0.5, 0.025);
        if (bars) band(H * 0.55, 0.02);
        gb.box('stoneWall', Math.min(x0, cx - 0.12), fy - 3, Math.min(z0, cz - 0.12), Math.max(x1, cx + 0.12), fy + (bars ? 0.3 : 0.15), Math.max(z1, cz + 0.12), 1);
        if (bars) {
          const nb = Math.round(len / 0.14);
          for (let b = 1; b < nb; b++) {
            const f = b / nb;
            const px = cx + (bx - cx) * f;
            const pz = cz + (bz - cz) * f;
            gb.box('iron', px - 0.013, fy + 0.3, pz - 0.013, px + 0.013, fy + H, pz + 0.013, 1);
            // puntas arriba
            gb.box('iron', px - 0.02, fy + H, pz - 0.02, px + 0.02, fy + H + 0.12, pz + 0.02, 1);
          }
        }
      }
    }
  }
}

// El terreno de la isla (lo de afuera de la grilla jugable), el río y la costa lejana.
export function buildTerrain(w) {
  const M = w.M;
  const W = MAP_W;
  const H = MAP_H;
  // altura de cada esquina: el promedio del terreno de las celdas de alrededor
  const cy = new Float32Array((W + 1) * (H + 1));
  for (let z = 0; z <= H; z++) {
    for (let x = 0; x <= W; x++) {
      let s = 0;
      let c = 0;
      let hi = -Infinity;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        if (!w.inside(x + dx, z + dz)) continue;
        const i = w.idx(x + dx, z + dz);
        const t = w.grid[i];
        if (t === FLOOR || t === DOOR) {
          hi = Math.max(hi, w.fy[i]);
          continue;
        }
        s += w.ty[i];
        c++;
      }
      cy[z * (W + 1) + x] = c ? Math.max(s / c, Number.isFinite(hi) ? hi - 0.4 : -Infinity) : hi;
    }
  }
  const gb = new GeoBuilder();
  const r = rng(303);
  const rocks = [];
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== OUT) continue;
      const a = cy[z * (W + 1) + x];
      const b = cy[z * (W + 1) + x + 1];
      const c = cy[(z + 1) * (W + 1) + x + 1];
      const d = cy[(z + 1) * (W + 1) + x];
      const steep = Math.max(a, b, c, d) - Math.min(a, b, c, d) > 0.9;
      const P = [
        [x, d, z + 1],
        [x + 1, c, z + 1],
        [x + 1, b, z],
        [x, a, z],
      ];
      const n = new THREE.Vector3(a + d - b - c, 2, a + b - c - d).normalize().toArray();
      const uv = (p) => [p[0] / 2, p[2] / 2];
      gb.quad(steep ? 'rock' : 'grass', P[0], P[1], P[2], P[3], n, uv(P[0]), uv(P[1]), uv(P[2]), uv(P[3]));
      if (steep && r() < 0.25) rocks.push([x + r(), (a + b + c + d) / 4, z + r(), 0.3 + r() * 0.6]);
    }
  }
  // más allá de la grilla la isla sigue: baja de a poco, con la costa despareja,
  // hasta perderse bajo el río (así no termina en un corte derecho)
  const EXT = 36;
  const edgeH = (x, z) => {
    const cx = Math.max(0, Math.min(W, x));
    const cz = Math.max(0, Math.min(H, z));
    const d = Math.hypot(x - cx, z - cz);
    const hb = cy[cz * (W + 1) + cx];
    if (d === 0) return hb;
    const wob = Math.sin(x * 0.23 + z * 0.11) * 0.7 + Math.sin(x * 0.07 - z * 0.13) * 1.1 + Math.sin((x + z) * 0.41) * 0.25;
    return Math.max(WATER_Y - 3.5, hb - d * 0.32 + wob * Math.min(1, d / 5));
  };
  const reeds = [];
  for (let z = -EXT; z < H + EXT; z++) {
    for (let x = -EXT; x < W + EXT; x++) {
      if (x >= 0 && z >= 0 && x < W && z < H) continue;
      const a = edgeH(x, z);
      const b = edgeH(x + 1, z);
      const c = edgeH(x + 1, z + 1);
      const d = edgeH(x, z + 1);
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      if (hi < WATER_Y - 2.5) continue;
      const key = hi - lo > 0.9 ? 'rock' : hi < WATER_Y + 0.35 ? 'dirt' : 'grass';
      const P = [
        [x, d, z + 1],
        [x + 1, c, z + 1],
        [x + 1, b, z],
        [x, a, z],
      ];
      const n = new THREE.Vector3(a + d - b - c, 2, a + b - c - d).normalize().toArray();
      const uv = (p) => [p[0] / 2, p[2] / 2];
      gb.quad(key, P[0], P[1], P[2], P[3], n, uv(P[0]), uv(P[1]), uv(P[2]), uv(P[3]));
      const m = (a + b + c + d) / 4;
      // juncos en la orilla
      if (m > WATER_Y - 0.45 && m < WATER_Y + 0.35 && r() < 0.45) reeds.push([x + r(), m, z + r()]);
      else if (key === 'rock' && r() < 0.12) rocks.push([x + r(), m, z + r(), 0.4 + r() * 0.8]);
    }
  }
  // también en la orilla de adentro de la grilla (el río del muelle)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== OUT) continue;
      const m = cy[z * (W + 1) + x];
      if (m > WATER_Y - 0.45 && m < WATER_Y + 0.35 && r() < 0.35) reeds.push([x + r(), m, z + r()]);
    }
  }
  const terrain = gb.build(M, { castShadow: false });
  w.root.add(terrain);
  // piedras sueltas en las laderas
  if (rocks.length) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(geo, M.rock, rocks.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    rocks.forEach(([x, y, z, s], k) => {
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.6, s));
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    w.root.add(im);
  }
  // juncos: matas de cañitas finas en la orilla
  if (reeds.length) {
    const blade = new THREE.ConeGeometry(0.025, 1, 3).translate(0, 0.5, 0);
    const mat = windy(new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 1 }));
    const per = 7;
    const im = new THREE.InstancedMesh(blade, mat, reeds.length * per);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let k = 0;
    for (const [x, y, z] of reeds) {
      for (let j = 0; j < per; j++) {
        e.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5);
        q.setFromEuler(e);
        const h = 0.9 + r() * 1.1;
        m4.compose(new THREE.Vector3(x + (r() - 0.5) * 0.5, Math.min(y, WATER_Y + 0.1) - 0.1, z + (r() - 0.5) * 0.5), q, new THREE.Vector3(1, h, 1));
        im.setMatrixAt(k++, m4);
      }
    }
    im.castShadow = false;
    w.root.add(im);
  }
  // camalotes: islitas de plantas que flotan en el río, cerca de la costa
  {
    const pads = [];
    for (let t = 0; t < 900 && pads.length < 70; t++) {
      const x = -EXT + r() * (W + EXT * 2);
      const z = -EXT + r() * (H + EXT * 2);
      const inGrid = x >= 0 && z >= 0 && x < W && z < H;
      const g = inGrid ? (w.grid[w.idx(Math.floor(x), Math.floor(z))] === OUT ? w.ty[w.idx(Math.floor(x), Math.floor(z))] : 0) : edgeH(Math.floor(x), Math.floor(z));
      if (g > WATER_Y - 0.5 || g < WATER_Y - 3) continue;
      pads.push([x, z, 0.6 + r() * 1.4]);
    }
    if (pads.length) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2e4a22, roughness: 0.9, flatShading: true });
      const flower = new THREE.MeshStandardMaterial({ color: 0x9a7ad8, roughness: 0.8 });
      const im = new THREE.InstancedMesh(geo, mat, pads.length);
      const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 5, 4), flower, pads.length * 3);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let f = 0;
      pads.forEach(([x, z, s], k) => {
        q.setFromEuler(new THREE.Euler(0, r() * 3, 0));
        m4.compose(new THREE.Vector3(x, WATER_Y + 0.02, z), q, new THREE.Vector3(s, 0.12, s * (0.6 + r() * 0.5)));
        im.setMatrixAt(k, m4);
        for (let j = 0; j < 3; j++) {
          m4.makeTranslation(x + (r() - 0.5) * s, WATER_Y + 0.14, z + (r() - 0.5) * s * 0.6);
          fl.setMatrixAt(f++, m4);
        }
      });
      w.root.add(im, fl);
    }
  }
  // el río alrededor de la isla (fx/Water: reflejos, ondas, oleaje con la tormenta).
  // El fondo en (x, z): el terreno de la grilla, la costa de afuera o, en lo
  // construido, el piso (el muelle deja ver el agua de abajo).
  const groundAt = (x, z) => {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const inGrid = fx >= 0 && fz >= 0 && fx < W && fz < H;
    if (inGrid && w.grid[w.idx(fx, fz)] !== OUT) return Math.min(heightAt(w, x, z), w.ty[w.idx(fx, fz)]);
    const at = inGrid ? (cx, cz) => cy[cz * (W + 1) + cx] : edgeH;
    const u = x - fx;
    const v = z - fz;
    return (at(fx, fz) * (1 - u) + at(fx + 1, fz) * u) * (1 - v) + (at(fx, fz + 1) * (1 - u) + at(fx + 1, fz + 1) * u) * v;
  };
  w.waterDepth = (x, z) => Math.max(0, WATER_Y - groundAt(x, z));
  w.water = new Water(w.g, {
    level: WATER_Y,
    groundAt,
    roofAt: (x, z) => w.inside(Math.floor(x), Math.floor(z)) && Number.isFinite(ceilAt(w, Math.floor(x), Math.floor(z))),
    bounds: [-EXT, -EXT, W + EXT, H + EXT],
    body: 0x0e1c22,
    clear: 1.6,
  });
  w.root.add(w.water.mesh);
  // la costa de enfrente: barrancas bajas con monte
  const shore = new THREE.Mesh(new THREE.RingGeometry(150, 330, 48, 1).rotateX(-Math.PI / 2), M.grass);
  shore.position.set(W / 2, WATER_Y + 0.6, H / 2);
  w.root.add(shore);
  const count = 160;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.3, 1, 6), M.bark, count);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.leaf, count * 3);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let k = 0;
  for (let t = 0; t < count; t++) {
    const a = r() * Math.PI * 2;
    const d = 158 + r() * 60;
    const x = W / 2 + Math.cos(a) * d;
    const z = H / 2 + Math.sin(a) * d;
    const h = 7 + r() * 9;
    p.set(x, WATER_Y + 0.6 + h / 2, z);
    s.set(1 + r(), h, 1 + r());
    m4.compose(p, q, s);
    trunk.setMatrixAt(t, m4);
    for (let j = 0; j < 3; j++) {
      const c = 2.5 + r() * 3;
      p.set(x + (r() - 0.5) * 3, WATER_Y + 0.6 + h + (r() - 0.2) * 2, z + (r() - 0.5) * 3);
      s.set(c, c * 0.75, c);
      m4.compose(p, q, s);
      crown.setMatrixAt(k++, m4);
    }
  }
  w.root.add(trunk, crown);
}

// Rayo contra el terreno y los pisos altos, celda por celda (lo usa World.raycast).
// Devuelve t o Infinity y deja la normal en out.
export function rayTerrain(w, o, d, cx, cz, tEnter, tExit, axis, stepX, stepZ, out) {
  if (!w.inside(cx, cz)) return Infinity;
  const i = w.idx(cx, cz);
  const t = w.grid[i];
  let h;
  if (t === OUT) h = w.ty[i];
  else if (walkable(t)) {
    if (w.rampAt[i] >= 0) {
      const tm = (tEnter + tExit) / 2;
      h = rampY(RAMPS[w.rampAt[i]], o.x + d.x * tm, o.z + d.z * tm);
    } else h = w.fy[i];
  } else return Infinity;
  // (el piso a ras de 0 lo frena el plano de World.raycast. El Monumento no
  // tiene ese plano y tiene pisos abajo de 0 —la Proa, la Cripta, el Parque,
  // la Costanera—: ahí se mira acá, que si no las bombas de yerba, la pava, el
  // sable tirado y las balas atravesaban el piso; globalThis.__mduNoPisoBajo: como antes)
  if (h <= 0.01 && t !== OUT && !(FEATURES.monumento && globalThis.__mduNoPisoBajo !== true)) return Infinity;
  const yIn = o.y + d.y * tEnter;
  if (tEnter > 1e-6 && yIn < h - 1e-3) {
    // entra por el costado del desnivel
    out.nx = axis === 0 ? -stepX : 0;
    out.ny = 0;
    out.nz = axis === 1 ? -stepZ : 0;
    return tEnter;
  }
  if (d.y >= 0) return Infinity;
  const th = (h - o.y) / d.y;
  if (th >= tEnter && th <= tExit) {
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    return th;
  }
  return Infinity;
}
