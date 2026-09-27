// El suelo del estero (Mate no Numa): una sola superficie suave para todo el
// mapa (islas, barrancas, lagunas y riachos) que usan el dibujo, los pies de
// los jugadores y los muertos. No usa three: lo lee también la vista de
// arriba de las pruebas.
//
// G (config/maps/esteros.js, GROUND): `base` es la altura de la tierra firme,
// `rough` cuánto sube y baja, `level` el agua y `water` los espejos de agua,
// cada uno un polígono con su hondura (`depth`) y lo que cae hacia adentro
// por metro (`slope`). `bank` es la pendiente de la barranca de afuera.

// Distancia con signo al polígono P (positiva adentro).
export function signedDist(P, x, z) {
  let best = Infinity;
  let inside = false;
  for (let k = 0, j = P.length - 1; k < P.length; j = k++) {
    const [ax, az] = P[j];
    const [bx, bz] = P[k];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

// Ruido suave y fijo (sumas de senos: el mismo en todas las máquinas).
function wobble(x, z) {
  return (Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.13 - z * 0.29 + 1.7) * 0.35 + Math.sin(x * 0.57 + z * 0.49 + 0.4) * 0.15) * 0.7;
}

// El borde desparejo de las islas y las lagunas (de -1 a 1).
function edgeNoise(x, z, s) {
  return Math.sin(x * 0.41 + z * 0.23 + s * 1.3) * 0.45 + Math.sin(x * 0.17 - z * 0.37 + s * 2.1) * 0.35 + Math.sin(x * 0.83 + z * 0.71 + s * 0.7) * 0.2;
}

function segDist(x, z, ax, az, bx, bz) {
  const ex = bx - ax;
  const ez = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}

// Una forma de barro o de agua, positiva adentro (en metros, más o menos):
// manchones redondos `blobs` [x, z, r] que se juntan, con el borde
// desparejo (`jit` metros), y sendas `trails` (polilíneas de ancho `w`).
// O un polígono (`poly`).
export function shapeField(S, x, z) {
  if (S.poly) return signedDist(S.poly, x, z);
  let f = -Infinity;
  for (const [bx, bz, r] of S.blobs || []) f = Math.max(f, r - Math.hypot(x - bx, z - bz));
  if (f > -Infinity) f += edgeNoise(x, z, S.seed ?? 0) * (S.jit ?? 1.2);
  for (const T of S.trails || []) {
    const L = T.line;
    for (let k = 0; k + 1 < L.length; k++) f = Math.max(f, T.w / 2 - segDist(x, z, L[k][0], L[k][1], L[k + 1][0], L[k + 1][1]) + edgeNoise(x, z, (S.seed ?? 0) + 5) * (T.jit ?? 0.2));
  }
  return f;
}

// Las celdas de una forma (su centro adentro), en tiras de una fila, sin
// las de `carve` (el hueco de una casa y su pared).
export function shapeRuns(S, W, H, carve = []) {
  const out = [];
  for (let z = 0; z < H; z++) {
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const inC = x < W && shapeField(S, x + 0.5, z + 0.5) > 0 && !carve.some((c) => x >= c[0] && x <= c[2] && z >= c[1] && z <= c[3]);
      if (inC && a < 0) a = x;
      if (!inC && a >= 0) {
        out.push([a, z, x - 1, z]);
        a = -1;
      }
    }
  }
  return out;
}

// Altura del suelo en (x, z) antes de suavizar.
function raw(G, x, z) {
  const level = G.level ?? 0;
  const bank = G.bank ?? 0.3;
  let h = level + G.base + wobble(x, z) * (G.rough ?? 0.1);
  for (const W of G.water) {
    const d = shapeField(W, x, z);
    // adentro baja hasta su hondura; afuera la barranca sube hasta la tierra
    const s = d >= 0 ? -Math.min(W.depth, 0.1 + d * (W.slope ?? 0.45)) : Math.min(G.base + 0.4, -0.1 - d * bank);
    // (el fondo con arena ondulada)
    const bed = d >= 0 ? wobble(z * 1.7, x * 1.7) * 0.06 : 0;
    h = Math.min(h, level + s + bed);
  }
  // lomas: la isla del embalsado, el vado del riacho (arriba `top`, y cae
  // `drop` metros hasta el borde)
  for (const m of G.mounds || []) {
    const r = Math.hypot(x - m.x, z - m.z) / m.r;
    if (r < 1.5) h = Math.max(h, level + m.top - r * r * (m.drop ?? 2.5));
  }
  return h;
}

// La grilla de esquinas (W+1 por H+1) y `at(x, z)`, bilineal entre esquinas:
// el dibujo usa las mismas esquinas, así el pie queda justo sobre el barro.
// `pad` metros de más alrededor para el terreno de afuera de la grilla.
export function makeGround(W, H, G, pad = 0) {
  const N = W + 1 + pad * 2;
  const M = H + 1 + pad * 2;
  const cy = new Float32Array(N * M);
  for (let z = 0; z < M; z++) for (let x = 0; x < N; x++) cy[z * N + x] = raw(G, x - pad, z - pad);
  const corner = (x, z) => {
    const cx = Math.max(0, Math.min(N - 1, x + pad));
    const cz = Math.max(0, Math.min(M - 1, z + pad));
    return cy[cz * N + cx];
  };
  const at = (x, z) => {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const a = corner(x0, z0);
    const b = corner(x0 + 1, z0);
    const c = corner(x0, z0 + 1);
    const d = corner(x0 + 1, z0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  return { cy, N, M, pad, corner, at };
}

// Donde dos zonas de afuera se tocan, el pajonal las separa: la celda de la
// que va después en ZONES queda afuera y se vuelve pared (una sola fila entre
// las dos: ahí van las puertas). `join` junta dos zonas sin pajonal (el
// puente con la Casona). Las celdas de las puertas tampoco son de ninguna
// zona. Devuelve las celdas a sacar.
export function seamCells(W, H, zone, floor, keys, ZONES, DOORS = []) {
  const out = [];
  for (const d of DOORS) {
    for (const [x, z] of d.cells) {
      const i = z * W + x;
      if (floor[i]) {
        floor[i] = 0;
        out.push(i);
      }
    }
  }
  const open = (a, b) => {
    const A = ZONES[keys[a]];
    const B = ZONES[keys[b]];
    return !A.outdoor || !B.outdoor || A.join?.includes(keys[b]) || B.join?.includes(keys[a]);
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (!floor[i]) continue;
      const zi = zone[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const j = nz * W + nx;
        if (!floor[j] || zone[j] === zi || zone[j] > zi || open(zi, zone[j])) continue;
        out.push(i);
        break;
      }
    }
  }
  return out;
}
