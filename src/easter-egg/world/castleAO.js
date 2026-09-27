import * as THREE from 'three';
import { MAP_W, MAP_H, ZONES } from '../config/map';
import { heightAt, ceilAt } from './Levels';

// La sombra de contacto del castillo, horneada: donde dos superficies se juntan
// la luz llega menos. La oclusión de pantalla (fx/Epic) en salones tan grandes
// casi no alcanza, y esto se ve en todas las calidades. castleRooms ya oscurece
// el piso junto a las paredes; acá va el resto:
//  · la base de las paredes (sobre el zócalo o el friso, si hay);
//  · los rincones: una franja vertical a cada lado de cada esquina de adentro;
//  · el techo junto a las paredes, pasando la moldura;
//  · las escaleras: la franja de la pared sigue la rampa;
//  · debajo de la utilería: una mancha suave alrededor de lo que toca el piso.
// Todo es negro con la transparencia en cada vértice: una sola malla.

const FLOOR = 1;
const WALL = 2;
const WINDOW = 4;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// alto de la franja de la base de las paredes y lo oscura que es abajo
const BASE_H = 0.8;
const BASE_IN = 0.5;
const BASE_OUT = 0.2;
// ancho de las franjas de los rincones y lo oscuras que son en la esquina
const CORNER_W = 0.55;
const CORNER_IN = 0.36;
const CORNER_OUT = 0.14;
// ancho de la franja del techo (pasando la moldura) y lo oscura que es
const CEIL_W = 0.7;
const CEIL_A = 0.34;
// separación de las superficies (además del polygonOffset)
const LIFT = 0.004;
// cómo cae la sombra a lo ancho de una franja: [lugar de 0 a 1, cuánto queda]
const FALL = [
  [0, 1],
  [0.35, 0.38],
  [1, 0],
];

export function buildCastleAO(w) {
  const pos = [];
  const col = [];
  const idx = [];
  const _ab = new THREE.Vector3();
  const _ac = new THREE.Vector3();
  const _n = new THREE.Vector3();
  // un cuadrilátero a b c d (en orden) que mire hacia n, con su transparencia por vértice
  const quad = (a, b, c, d, aa, ab, ac, ad, n) => {
    const base = pos.length / 3;
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    col.push(0, 0, 0, aa, 0, 0, 0, ab, 0, 0, 0, ac, 0, 0, 0, ad);
    _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (_ab.cross(_ac).dot(_n.set(n[0], n[1], n[2])) >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  // Una franja de p0 a p1 (el borde oscuro) que se aleja por `side` (vector
  // unitario) hasta `width`, con la caída FALL: tantos cuadriláteros como tramos.
  const band = (p0, p1, side, width, A, n) => {
    for (let s = 0; s < FALL.length - 1; s++) {
      const [t0, k0] = FALL[s];
      const [t1, k1] = FALL[s + 1];
      const o0 = side.map((v) => v * width * t0);
      const o1 = side.map((v) => v * width * t1);
      const a = [p0[0] + o0[0], p0[1] + o0[1], p0[2] + o0[2]];
      const b = [p1[0] + o0[0], p1[1] + o0[1], p1[2] + o0[2]];
      const c = [p1[0] + o1[0], p1[1] + o1[1], p1[2] + o1[2]];
      const d = [p0[0] + o1[0], p0[1] + o1[1], p0[2] + o1[2]];
      quad(a, b, c, d, A * k0, A * k0, A * k1, A * k1, n);
    }
  };
  const keyOf = (i) => (w.zone[i] >= 0 ? w.zoneKeys[w.zone[i]] : null);
  const wallish = (t) => t === WALL || t === WINDOW;
  // la cara de pared de la celda (x, z) hacia (dx, dz): [punta 0, punta 1] a lo largo
  const edge = (x, z, dx, dz, d) => {
    if (dx === 1) return [[x + 1 - d, z], [x + 1 - d, z + 1]];
    if (dx === -1) return [[x + d, z + 1], [x + d, z]];
    if (dz === 1) return [[x + 1, z + 1 - d], [x, z + 1 - d]];
    return [[x, z + d], [x + 1, z + d]];
  };

  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR) continue;
      const k = keyOf(i);
      const Z = k && ZONES[k];
      if (!Z) continue;
      const outdoor = !!Z.outdoor;
      // (las grutas son de roca despareja: ahí no hay paredes lisas)
      if (k === 'I' || k === 'Q') continue;
      const ramp = w.rampAt[i] >= 0;
      const fy = w.fy[i];
      const walls = [];
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz)) continue;
        const j = w.idx(nx, nz);
        const nt = w.grid[j];
        const step = nt === FLOOR && w.rampAt[j] < 0 && !ramp && w.fy[j] - fy > 1.5;
        if ((!wallish(nt) && !step) || w.edge[j] !== 0) continue;
        walls.push([dx, dz]);
        const n = [-dx, 0, -dz];
        // ---- la base de la pared ----
        // el zócalo de piedra o el friso de madera (castleTrim) salen de la pared
        let sd = 0;
        let sh = 0;
        if (!outdoor && !ramp && !step) {
          if (Z.wall === 'castlePlaster') {
            sd = 0.05;
            sh = 0.95;
          } else {
            sd = 0.07;
            sh = 0.28;
          }
        }
        const A = outdoor ? BASE_OUT : BASE_IN;
        const H = step ? Math.min(BASE_H, w.fy[w.idx(nx, nz)] - fy) : BASE_H;
        const [e0, e1] = edge(x, z, dx, dz, sd + LIFT);
        if (ramp) {
          // la rampa sube a lo largo de la pared: el borde oscuro la sigue
          const [q0, q1] = edge(x, z, dx, dz, 0.06);
          const y0 = heightAt(w, q0[0], q0[1]);
          const y1 = heightAt(w, q1[0], q1[1]);
          const [r0, r1] = edge(x, z, dx, dz, LIFT);
          band([r0[0], y0, r0[1]], [r1[0], y1, r1[1]], [0, 1, 0], H, A, n);
        } else if (sh >= H) {
          band([e0[0], fy, e0[1]], [e1[0], fy, e1[1]], [0, 1, 0], H, A, n);
        } else if (sh > 0) {
          // sobre el frente del zócalo y, más arriba, sobre la pared (la misma caída)
          const k0 = fall(sh / H);
          quad([e0[0], fy, e0[1]], [e1[0], fy, e1[1]], [e1[0], fy + sh, e1[1]], [e0[0], fy + sh, e0[1]], A, A, A * k0, A * k0, n);
          const [f0, f1] = edge(x, z, dx, dz, LIFT);
          const ym = fy + sh + (H - sh) * 0.4;
          const km = fall((ym - fy) / H);
          quad([f0[0], fy + sh, f0[1]], [f1[0], fy + sh, f1[1]], [f1[0], ym, f1[1]], [f0[0], ym, f0[1]], A * k0, A * k0, A * km, A * km, n);
          quad([f0[0], ym, f0[1]], [f1[0], ym, f1[1]], [f1[0], fy + H, f1[1]], [f0[0], fy + H, f0[1]], A * km, A * km, 0, 0, n);
        } else {
          band([e0[0], fy, e0[1]], [e1[0], fy, e1[1]], [0, 1, 0], H, A, n);
        }
        // ---- el techo junto a la pared (pasando la moldura) ----
        if (!outdoor && !ramp && !step) {
          const c = ceilAt(w, x, z);
          const roof = Z.roof;
          if (Number.isFinite(c) && roof != null && Math.abs(c - roof) < 0.05) {
            const m = Z.under ? 0 : 0.2;
            const [c0, c1] = edge(x, z, dx, dz, m);
            band([c0[0], c - LIFT, c0[1]], [c1[0], c - LIFT, c1[1]], [-dx, 0, -dz], CEIL_W, CEIL_A, [0, -1, 0]);
          }
        }
      }
      // ---- los rincones: dos paredes en ángulo ----
      if (ramp || walls.length < 2) continue;
      for (const [ax, az] of walls) {
        if (!ax) continue;
        for (const [bx, bz] of walls) {
          if (!bz) continue;
          // la esquina (x, z) de la celda donde se juntan la pared en x y la pared en z
          const cx = ax > 0 ? x + 1 : x;
          const cz = bz > 0 ? z + 1 : z;
          const c = outdoor ? Infinity : ceilAt(w, x, z);
          const top = Number.isFinite(c) ? c : fy + 4;
          const A = outdoor ? CORNER_OUT : CORNER_IN;
          // sobre la pared en x (mira a -ax): se aleja de la esquina en z
          const px = cx - ax * LIFT;
          band([px, fy, cz], [px, top, cz], [0, 0, -bz], CORNER_W, A, [-ax, 0, 0]);
          // sobre la pared en z (mira a -bz): se aleja en x
          const pz = cz - bz * LIFT;
          band([cx, fy, pz], [cx, top, pz], [-ax, 0, 0], CORNER_W, A, [0, 0, -bz]);
        }
      }
    }
  }

  // ---- debajo de la utilería ----
  for (const b of w.boxes) {
    if (b.kind !== 'prop' || !b.active) continue;
    const h = b.y1 - b.y0;
    const sx = b.x1 - b.x0;
    const sz = b.z1 - b.z0;
    if (h < 0.12 || sx > 6 || sz > 6) continue;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const cxi = Math.floor(cx);
    const czi = Math.floor(cz);
    if (!w.inside(cxi, czi)) continue;
    const ci = w.idx(cxi, czi);
    if (w.grid[ci] !== FLOOR || w.rampAt[ci] >= 0) continue;
    const fy = heightAt(w, cx, cz);
    // lo que no está apoyado en el piso (colgado, en un estante) no
    if (Math.abs(b.y0 - fy) > 0.35) continue;
    const Z = ZONES[keyOf(ci)];
    const m = Math.min(0.45, 0.18 + h * 0.12);
    const A = Math.min(0.55, 0.3 + h * 0.12) * (Z?.outdoor ? 0.6 : 1);
    blob(quad, b.x0, b.z0, b.x1, b.z1, fy + 0.008, m, A);
  }

  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'castleAO';
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  w.root.add(mesh);
  return mesh;
}

// Lo que queda de la sombra a una fracción t del ancho de la franja.
function fall(t) {
  for (let s = 0; s < FALL.length - 1; s++) {
    const [t0, k0] = FALL[s];
    const [t1, k1] = FALL[s + 1];
    if (t <= t1) return k0 + ((k1 - k0) * (t - t0)) / (t1 - t0);
  }
  return 0;
}

// Una mancha: el rectángulo del apoyo oscuro y un marco que se aclara hasta m
// de distancia (con un anillo al medio para que la caída no sea recta).
function blob(quad, x0, z0, x1, z1, y, m, A) {
  const up = [0, 1, 0];
  const rings = [
    [0, A],
    [m * 0.4, A * 0.45],
    [m, 0],
  ];
  quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], A, A, A, A, up);
  for (let r = 0; r < rings.length - 1; r++) {
    const [d0, a0] = rings[r];
    const [d1, a1] = rings[r + 1];
    const i0 = [x0 - d0, z0 - d0, x1 + d0, z1 + d0];
    const o = [x0 - d1, z0 - d1, x1 + d1, z1 + d1];
    // los cuatro lados del marco (cada uno de adentro hacia afuera)
    quad([i0[0], y, i0[1]], [i0[2], y, i0[1]], [o[2], y, o[1]], [o[0], y, o[1]], a0, a0, a1, a1, up);
    quad([i0[2], y, i0[1]], [i0[2], y, i0[3]], [o[2], y, o[3]], [o[2], y, o[1]], a0, a0, a1, a1, up);
    quad([i0[2], y, i0[3]], [i0[0], y, i0[3]], [o[0], y, o[3]], [o[2], y, o[3]], a0, a0, a1, a1, up);
    quad([i0[0], y, i0[3]], [i0[0], y, i0[1]], [o[0], y, o[1]], [o[0], y, o[3]], a0, a0, a1, a1, up);
  }
}
