import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, RAMPS, WINDOWS } from '../config/map';
import { rampY } from './Levels';

// Herramientas de geometría del Monumento (world/Monumento*.js), encima de
// GeoBuilder: todo con UV en metros/2 (las texturas repiten cada 2 m y siguen
// de una pieza a la otra) y con los cantos biselados, así de lejos se lee el
// volumen (nada de cantos de un pixel): cajas con chaflán, perfiles barridos
// (cornisas, zócalos, narices de escalón), escaleras de verdad y torneados.

// UV de un punto según la cara: las verticales llevan el largo horizontal en
// u y la altura en v; las horizontales, x y z.
function uvFor(p, n) {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] / 2, p[2] / 2];
  if (ax >= az) return [p[2] / 2, p[1] / 2];
  return [p[0] / 2, p[1] / 2];
}

// Quad con UV del mundo; la normal sale de los puntos (Newell) y se da vuelta
// si mira para el otro lado de `hint`.
export function quad(gb, key, P, hint) {
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
  if (l < 1e-7) return;
  let n = [nx / l, ny / l, nz / l];
  let Q = P;
  if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
    Q = [P[3], P[2], P[1], P[0]];
    n = [-n[0], -n[1], -n[2]];
  }
  gb.quad(key, Q[0], Q[1], Q[2], Q[3], n, uvFor(Q[0], n), uvFor(Q[1], n), uvFor(Q[2], n), uvFor(Q[3], n));
}

// Caja con el borde de arriba biselado (b m a 45°) y, si `corners`, también
// las cuatro aristas verticales. `skip`: caras que no se dibujan
// ('bottom', 'top', '+x', '-x', '+z', '-z').
export function bbox(gb, key, x0, y0, z0, x1, y1, z1, { b = 0.03, corners = false, skip = [], top = key } = {}) {
  const s = new Set(skip);
  const bb = Math.min(b, (x1 - x0) / 2.2, (z1 - z0) / 2.2, (y1 - y0) / 2.2);
  const c = corners ? bb : 0;
  // (sin tapa, los costados llegan hasta arriba: lo que va encima no deja ranura)
  const yt = s.has('top') ? y1 : y1 - bb;
  // arriba (la tapa achicada) y los cuatro chaflanes
  if (!s.has('top')) {
    quad(gb, top, [[x0 + bb, y1, z1 - bb], [x1 - bb, y1, z1 - bb], [x1 - bb, y1, z0 + bb], [x0 + bb, y1, z0 + bb]], [0, 1, 0]);
    quad(gb, top, [[x0 + c, yt, z1], [x1 - c, yt, z1], [x1 - bb, y1, z1 - bb], [x0 + bb, y1, z1 - bb]], [0, 1, 1]);
    quad(gb, top, [[x1 - c, yt, z0], [x0 + c, yt, z0], [x0 + bb, y1, z0 + bb], [x1 - bb, y1, z0 + bb]], [0, 1, -1]);
    quad(gb, top, [[x1, yt, z1 - c], [x1, yt, z0 + c], [x1 - bb, y1, z0 + bb], [x1 - bb, y1, z1 - bb]], [1, 1, 0]);
    quad(gb, top, [[x0, yt, z0 + c], [x0, yt, z1 - c], [x0 + bb, y1, z1 - bb], [x0 + bb, y1, z0 + bb]], [-1, 1, 0]);
    if (c) {
      // las esquinas de la tapa (triángulos como quads degenerados)
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const X = sx > 0 ? x1 : x0;
        const Z = sz > 0 ? z1 : z0;
        quad(gb, top, [[X - sx * c, yt, Z], [X, yt, Z - sz * c], [X - sx * bb, y1, Z - sz * bb], [X - sx * bb, y1, Z - sz * bb]], [sx, 1, sz]);
      }
    }
  }
  // los costados
  if (!s.has('+z')) quad(gb, key, [[x0 + c, y0, z1], [x1 - c, y0, z1], [x1 - c, yt, z1], [x0 + c, yt, z1]], [0, 0, 1]);
  if (!s.has('-z')) quad(gb, key, [[x1 - c, y0, z0], [x0 + c, y0, z0], [x0 + c, yt, z0], [x1 - c, yt, z0]], [0, 0, -1]);
  if (!s.has('+x')) quad(gb, key, [[x1, y0, z1 - c], [x1, y0, z0 + c], [x1, yt, z0 + c], [x1, yt, z1 - c]], [1, 0, 0]);
  if (!s.has('-x')) quad(gb, key, [[x0, y0, z0 + c], [x0, y0, z1 - c], [x0, yt, z1 - c], [x0, yt, z0 + c]], [-1, 0, 0]);
  if (c) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const X = sx > 0 ? x1 : x0;
      const Z = sz > 0 ? z1 : z0;
      quad(gb, key, [[X - sx * c, y0, Z], [X, y0, Z - sz * c], [X, yt, Z - sz * c], [X - sx * c, yt, Z]], [sx, 0, sz]);
    }
  }
  if (!s.has('bottom')) quad(gb, key, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
}

// Barrido de un perfil a lo largo de un tramo recto de a a b (horizontal).
// prof: puntos [afuera, arriba] (m) del perfil, de abajo hacia arriba; `out`
// es el lado hacia donde sale (vector [x, z] normal al tramo). Para
// cornisas, zócalos, cordones y la nariz de los escalones. caps: tapa las puntas.
export function sweep(gb, key, a, b, out, prof, { caps = true, y = 0 } = {}) {
  const [ax, az] = a;
  const [bx, bz] = b;
  const P = (q, e, u) => [q[0] + out[0] * e, y + u, q[1] + out[1] * e];
  for (let i = 0; i < prof.length - 1; i++) {
    const [e0, u0] = prof[i];
    const [e1, u1] = prof[i + 1];
    // la normal del tramo del perfil (hacia afuera y arriba)
    const ne = u1 - u0;
    const nu = -(e1 - e0);
    const hint = [out[0] * ne, nu, out[1] * ne];
    quad(gb, key, [P([ax, az], e0, u0), P([bx, bz], e0, u0), P([bx, bz], e1, u1), P([ax, az], e1, u1)], hint);
  }
  if (!caps) return;
  const dir = [bx - ax, bz - az];
  const L = Math.hypot(dir[0], dir[1]) || 1;
  const d = [dir[0] / L, dir[1] / L];
  // las tapas: el perfil cerrado contra la pared (e = 0), en tiras
  for (const [q, s] of [[[ax, az], -1], [[bx, bz], 1]]) {
    for (let i = 0; i < prof.length - 1; i++) {
      const [e0, u0] = prof[i];
      const [e1, u1] = prof[i + 1];
      quad(gb, key, [P(q, 0, u0), P(q, e0, u0), P(q, e1, u1), P(q, 0, u1)], [d[0] * s, 0, d[1] * s]);
    }
  }
}

// Perfiles de molduras (afuera, arriba), en metros.
export const PROFILE = {
  // cornisa: filete, gola y vuelo
  cornisa: (k = 1) => [[0, 0], [0.04 * k, 0], [0.06 * k, 0.05 * k], [0.14 * k, 0.12 * k], [0.24 * k, 0.16 * k], [0.26 * k, 0.24 * k], [0.26 * k, 0.32 * k], [0, 0.32 * k]],
  // zócalo: plinto con un toro arriba
  zocalo: (k = 1) => [[0, 0], [0.08 * k, 0], [0.08 * k, 0.2 * k], [0.05 * k, 0.24 * k], [0.03 * k, 0.28 * k], [0, 0.3 * k]],
  // listel simple (cordón)
  listel: (k = 1) => [[0, 0], [0.05 * k, 0.01 * k], [0.06 * k, 0.05 * k], [0.05 * k, 0.09 * k], [0, 0.1 * k]],
};

// Escalera de verdad sobre una rampa de Levels (rect, dir, y0 → y1): cada
// escalón con su pedada, su contrahuella y la nariz redondeada (un bisel de
// 3 cm que sobresale 2 cm), del ancho entero de la rampa. La pedada va a la
// altura de la rampa en su medio (lo que pisa la colisión queda a ±media
// contrahuella). `rise`: contrahuella buscada; `base`: hasta dónde baja el
// bloque de cada escalón. Devuelve las alturas de cada escalón.
export function stairs(gb, R, { tread = 'travStep', riser = 'travertino', rise = 0.17, base = null, count = null, nose = true } = {}) {
  const [x0, z0, x1, z1] = R.rect;
  const alongX = R.dir[1] === 'x';
  // el sentido en que sube la altura del rect: de y0 (el lado "de entrada" de dir) a y1
  const L = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
  const n = count ?? Math.max(2, Math.round(Math.abs(R.y1 - R.y0) / rise));
  const run = L / n;
  const out = [];
  // a dónde va y0: con dir '+x' está en x0; con '-x', en x1+1 (rampY de Levels)
  const fromStart = R.dir[0] === '+';
  const lo = Math.min(R.y0, R.y1);
  const bottom = base ?? lo - 0.4;
  for (let i = 0; i < n; i++) {
    // el escalón i va de s0 a s1 medido desde el borde de y0
    const s0 = i * run;
    const s1 = (i + 1) * run;
    const y = R.y0 + ((R.y1 - R.y0) * (i + 0.5)) / n;
    out.push(y);
    const a = fromStart ? s0 : L - s1;
    const b = fromStart ? s1 : L - s0;
    let X0;
    let X1;
    let Z0;
    let Z1;
    if (alongX) {
      X0 = x0 + a;
      X1 = x0 + b;
      Z0 = z0;
      Z1 = z1 + 1;
    } else {
      X0 = x0;
      X1 = x1 + 1;
      Z0 = z0 + a;
      Z1 = z0 + b;
    }
    // el bloque del escalón (la tapa la hace la nariz); la cara de arriba de la
    // escalera queda adentro del escalón de al lado (o bajo el descanso): no va,
    // así no hay dos caras encimadas
    const lowS = (R.y1 > R.y0) === fromStart ? -1 : 1;
    const skip = ['bottom', alongX ? (lowS > 0 ? '-x' : '+x') : lowS > 0 ? '-z' : '+z'];
    bbox(gb, riser, X0, bottom, Z0, X1, y, Z1, { b: 0.015, skip, top: tread });
    // la nariz: un bocel que sobresale del lado que baja
    if (nose) {
      const goingUp = R.y1 > R.y0;
      // ¿hacia dónde baja este escalón? hacia el de abajo (s menor si sube)
      const lowSide = goingUp === fromStart ? -1 : 1;
      if (alongX) {
        const xe = lowSide > 0 ? X1 : X0;
        sweep(gb, tread, [xe, Z1 - 0.001], [xe, Z0 + 0.001], [lowSide, 0], [[0, -0.05], [0.015, -0.045], [0.022, -0.03], [0.022, -0.012], [0.012, 0], [0, 0]], { y, caps: false });
      } else {
        const ze = lowSide > 0 ? Z1 : Z0;
        sweep(gb, tread, [X0 + 0.001, ze], [X1 - 0.001, ze], [0, lowSide], [[0, -0.05], [0.015, -0.045], [0.022, -0.03], [0.022, -0.012], [0.012, 0], [0, 0]], { y, caps: false });
      }
    }
  }
  // el canto del descanso de arriba: el escalón más alto queda media
  // contrahuella abajo del piso del descanso, así que ahí va la contrahuella
  // que falta (si no, entre los dos queda una ranura por donde se ve el vacío)
  // con su nariz, como los demás.
  const highAtY1 = R.y1 > R.y0;
  const yHigh = Math.max(R.y0, R.y1);
  const topStep = out[highAtY1 ? n - 1 : 0];
  const aHigh = highAtY1 === fromStart ? L : 0;
  const toStair = aHigh === 0 ? 1 : -1;
  const NOSE = [[0, -0.05], [0.015, -0.045], [0.022, -0.03], [0.022, -0.012], [0.012, 0], [0, 0]];
  if (alongX) {
    const xe = x0 + aHigh;
    quad(gb, riser, [[xe, topStep - 0.03, z0], [xe, topStep - 0.03, z1 + 1], [xe, yHigh + 0.002, z1 + 1], [xe, yHigh + 0.002, z0]], [toStair, 0, 0]);
    if (nose) sweep(gb, tread, [xe, z1 + 1 - 0.001], [xe, z0 + 0.001], [toStair, 0], NOSE, { y: yHigh + 0.002, caps: false });
  } else {
    const ze = z0 + aHigh;
    quad(gb, riser, [[x0, topStep - 0.03, ze], [x1 + 1, topStep - 0.03, ze], [x1 + 1, yHigh + 0.002, ze], [x0, yHigh + 0.002, ze]], [0, 0, toStair]);
    if (nose) sweep(gb, tread, [x0 + 0.001, ze], [x1 + 1 - 0.001, ze], [0, toStair], NOSE, { y: yHigh + 0.002, caps: false });
  }
  return out;
}

// Junta piezas sueltas (Mesh) por material en una malla por material.
export function mergeMeshes(meshes, { castShadow = true, receiveShadow = true } = {}) {
  const byMat = new Map();
  for (const o of meshes) {
    o.updateMatrixWorld(true);
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const nm of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) g.deleteAttribute(nm);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  }
  const group = new THREE.Group();
  for (const [mat, list] of byMat) {
    const g = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    if (!g) continue;
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = castShadow && !mat.userData?.noShadow;
    m.receiveShadow = receiveShadow;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  return group;
}

// Torneado: un perfil [radio, altura] girado (urnas, farolas, balaustres).
export function lathe(prof, seg = 20) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// Un mesh puesto en (x, y, z) con giro en y.
export function place(geo, mat, x, y, z, ry = 0, s = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (s !== 1) m.scale.setScalar(s);
  return m;
}

// El cascarón de una sala bajo techo (la Cripta, la Sala de las Banderas):
// las caras de pared en cada borde de celda que da afuera de la sala, el
// techo (plano a ZONES[k].roof, o inclinado sobre una escalera con `ceil`),
// arriba de cada puerta la pared hasta el techo, y un zócalo al pie.
// `keys`: las zonas que forman la sala. `skip(x, z, dx, dz)`: bordes que no
// llevan pared (los arma otro: el nicho, el ascensor).
const DOOR_H = 2.7;
export function roomShell(w, gb, keys, { wall, ceil, base = 'travertinoDark', skip = null, trim = true } = {}) {
  const FLOOR = 1;
  const DOOR = 3;
  const inRoom = (x, z) => w.inside(x, z) && w.grid[w.idx(x, z)] === FLOOR && keys.includes(w.zoneKeys[w.zone[w.idx(x, z)]]);
  const ramp = (x, z) => {
    const r = w.rampAt[w.idx(x, z)];
    return r >= 0 ? RAMPS[r] : null;
  };
  const floorAt = (x, z, px, pz) => {
    const R = ramp(x, z);
    return R ? rampY(R, px, pz) : w.fy[w.idx(x, z)];
  };
  const ceilAt = (x, z, px, pz) => {
    const R = ramp(x, z);
    if (R?.ceil) return rampY(R, px, pz) + (R.head ?? 3.2);
    const rc = w.roofC[w.idx(x, z)];
    if (rc > 0) return rc;
    const Z = ZONES[w.zoneKeys[w.zone[w.idx(x, z)]]];
    return Z.roof ?? (Z.y ?? 0) + 3.4;
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let z = 0; z < w.H; z++) {
    for (let x = 0; x < w.W; x++) {
      if (!inRoom(x, z)) continue;
      // el techo de la celda
      const P = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([px, pz]) => [px, ceilAt(x, z, px, pz), pz]);
      quad(gb, ceil, P, [0, -1, 0]);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        // el borde: de a a b (las dos puntas), mirando hacia adentro (-dx, -dz)
        const mx = x + 0.5 + dx * 0.5;
        const mz = z + 0.5 + dz * 0.5;
        const ax = mx - dz * 0.5;
        const az = mz + dx * 0.5;
        const bx = mx + dz * 0.5;
        const bz = mz - dx * 0.5;
        if (inRoom(nx, nz)) {
          // dos celdas de la sala con techos distintos (la escalera de techo
          // inclinado contra la nave de techo plano): el escalón del techo, la
          // cara que mira a la celda de techo más alto (si no, desde ahí se ve
          // por encima del techo de al lado, que es de una sola cara).
          const da = ceilAt(x, z, ax, az) - ceilAt(nx, nz, ax, az);
          const db = ceilAt(x, z, bx, bz) - ceilAt(nx, nz, bx, bz);
          if (da <= 0.002 && db <= 0.002) continue;
          const lo = (px, pz) => ceilAt(nx, nz, px, pz);
          const hi = (px, pz) => ceilAt(x, z, px, pz);
          const n = [-dx, 0, -dz];
          if (da >= -0.002 && db >= -0.002) {
            quad(gb, wall, [[ax, lo(ax, az), az], [bx, lo(bx, bz), bz], [bx, hi(bx, bz), bz], [ax, hi(ax, az), az]], n);
          } else {
            // se cruzan a mitad del borde: solo el triángulo donde este techo va más alto
            const t = da / (da - db);
            const m = [ax + (bx - ax) * t, lo(ax, az) + (lo(bx, bz) - lo(ax, az)) * t, az + (bz - az) * t];
            if (da > 0) quad(gb, wall, [[ax, lo(ax, az), az], m, m, [ax, hi(ax, az), az]], n);
            else quad(gb, wall, [m, [bx, lo(bx, bz), bz], [bx, hi(bx, bz), bz], m], n);
          }
          continue;
        }
        if (skip?.(x, z, dx, dz)) continue;
        const fa = floorAt(x, z, ax, az);
        const fb = floorAt(x, z, bx, bz);
        const ca = ceilAt(x, z, ax, az);
        const cb = ceilAt(x, z, bx, bz);
        const isDoor = w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === DOOR;
        // (solo las ventanas de esta sala: la grilla es de un nivel y una
        // ventana del Mirador puede caer pegada a la Cripta, 46 m más abajo)
        const isWin = w.inside(nx, nz) && w.grid[w.idx(nx, nz)] === 4 && (WINDOWS || []).some((wi) => wi.cell[0] === nx && wi.cell[1] === nz && keys.includes(wi.zone));
        const n = [-dx, 0, -dz];
        if (isWin) {
          // la rejilla: pared abajo del antepecho y arriba del dintel, y atrás
          // un conducto oscuro de un metro (por ahí se arrastran)
          const fy = Math.min(fa, fb);
          quad(gb, wall, [[ax, fy - 0.4, az], [bx, fy - 0.4, bz], [bx, fy + 0.95, bz], [ax, fy + 0.95, az]], n);
          quad(gb, wall, [[ax, fy + 2.35, az], [bx, fy + 2.35, bz], [bx, cb, bz], [ax, ca, az]], n);
          const ox = dx;
          const oz = dz;
          quad(gb, 'ducto', [[ax + ox, fy + 0.95, az + oz], [bx + ox, fy + 0.95, bz + oz], [bx + ox, fy + 2.35, bz + oz], [ax + ox, fy + 2.35, az + oz]], n);
          quad(gb, 'ducto', [[ax, fy + 0.95, az], [bx, fy + 0.95, bz], [bx + ox, fy + 0.95, bz + oz], [ax + ox, fy + 0.95, az + oz]], [0, 1, 0]);
          quad(gb, 'ducto', [[ax, fy + 2.35, az], [bx, fy + 2.35, bz], [bx + ox, fy + 2.35, bz + oz], [ax + ox, fy + 2.35, az + oz]], [0, -1, 0]);
          for (const [px, pz] of [[ax, az], [bx, bz]]) {
            const sx = px === ax && pz === az ? bx - ax : ax - bx;
            const sz = px === ax && pz === az ? bz - az : az - bz;
            quad(gb, 'ducto', [[px, fy + 0.95, pz], [px + ox, fy + 0.95, pz + oz], [px + ox, fy + 2.35, pz + oz], [px, fy + 2.35, pz]], [sx, 0, sz]);
          }
          continue;
        }
        if (isDoor) {
          // arriba de la puerta, la pared hasta el techo (y el dintel)
          const dy = w.fy[w.idx(nx, nz)] + DOOR_H;
          if (Math.min(ca, cb) > dy) quad(gb, wall, [[ax, dy, az], [bx, dy, bz], [bx, cb, bz], [ax, ca, az]], n);
          continue;
        }
        // (una celda de la misma sala del otro lado de una escalera: la rampa
        // de al lado sigue siendo sala, no hay pared)
        quad(gb, wall, [[ax, Math.min(fa, fb) - 0.4, az], [bx, Math.min(fa, fb) - 0.4, bz], [bx, cb, bz], [ax, ca, az]], n);
        if (trim) {
          // el zócalo: una faja de 22 cm, 2 cm afuera de la pared
          const ox = -dx * 0.02;
          const oz = -dz * 0.02;
          quad(gb, base, [[ax + ox, fa - 0.02, az + oz], [bx + ox, fb - 0.02, bz + oz], [bx + ox, fb + 0.22, bz + oz], [ax + ox, fa + 0.22, az + oz]], n);
          quad(gb, base, [[ax + ox, fa + 0.22, az + oz], [bx + ox, fb + 0.22, bz + oz], [bx, fb + 0.22, bz], [ax, fa + 0.22, az]], [0, 1, 0]);
        }
      }
    }
  }
}
