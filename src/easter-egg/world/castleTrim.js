import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { MAP_W, MAP_H, WALL_H, ZONES, RAMPS, zoneRects } from '../config/map';
import { wallSpans } from './castleRooms';

// Lo que le faltaba a la arquitectura del castillo (la grilla arma paredes
// lisas, pisos y techos):
//  · adentro: el zócalo de piedra oscura, la moldura de madera contra el
//    techo y, en los salones, vigas con ménsulas y pilastras de piedra;
//  · afuera: contrafuertes en las paredes del patio y del palenque, nieve
//    amontonada contra las paredes y los parapetos, y carámbanos colgando de
//    los aleros de los techos y de los bordes de las paredes.
// Todo se junta en pocas mallas (una por material) y los carámbanos van en
// una sola malla de instancias.

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
// los salones altos: vigas, ménsulas y pilastras
const HALLS = ['D', 'K', 'F', 'O'];
// las piezas con techo de madera (vigas nomás)
const ROOMS = ['B', 'C', 'E'];
// patios con contrafuertes
const YARDS = ['A', 'S'];

// Ruido chico y repetible para el alto de la nieve.
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function snowH(x, z) {
  return 0.3 + (hash(Math.floor(x * 0.7), Math.floor(z * 0.7)) * 0.6 + hash(x * 3.1, z * 2.3) * 0.4) * 0.4;
}

export function buildTrim(w) {
  const gb = new GeoBuilder();
  const W = MAP_W;
  const H = MAP_H;
  const keyOf = (i) => (w.zone[i] >= 0 ? w.zoneKeys[w.zone[i]] : null);
  const ceilOf = (k) => ZONES[k].roof ?? (ZONES[k].y || 0) + WALL_H;
  const propAt = (x, z) => w.inside(x, z) && w.cellBoxes[w.idx(x, z)].some((b) => b.kind === 'prop' && b.active);
  const icicles = [];
  const boxes = [];
  // lo que las pilastras y los contrafuertes no pueden tapar (perks, paredes
  // compradas, la caja, tapices, estandartes, vitrales...)
  const spans = wallSpans();
  const covers = (axis, at, a0, a1) => spans.some((s) => s.axis === axis && Math.abs(s.at - at) < 0.4 && s.a0 < a1 && s.a1 > a0);
  // el borde de la celda (x, z) hacia (dx, dz): una tira de `d` de profundidad
  const strip = (x, z, dx, dz, d) => {
    if (dx === 1) return [x + 1 - d, z, x + 1, z + 1];
    if (dx === -1) return [x, z, x + d, z + 1];
    if (dz === 1) return [x, z + 1 - d, x + 1, z + 1];
    return [x, z, x + 1, z + d];
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR) continue;
      const k = keyOf(i);
      if (!k) continue;
      const Z = ZONES[k];
      const ramp = w.rampAt[i] >= 0;
      const fy = w.fy[i];
      const outdoor = !!Z.outdoor;
      const cave = k === 'I' || k === 'Q';
      // (el tramo del puente levadizo: es de madera y abajo está el vacío)
      if (zoneRects(k).some((r) => r[6] === 2 && x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3])) continue;
      DIRS.forEach(([dx, dz]) => {
        const nx = x + dx;
        const nz = z + dz;
        if (!w.inside(nx, nz)) return;
        const j = w.idx(nx, nz);
        const nt = w.grid[j];
        if (nt !== WALL && nt !== DOOR && nt !== WINDOW) return;
        const parapet = w.edge[j] !== 0;
        if (!outdoor) {
          if (cave || parapet) return;
          // el zócalo (no en las puertas ni al lado de las rampas); en los
          // salones revocados, un friso de madera hasta la cintura
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
          // la moldura contra el techo (no en los sótanos de piedra, ni en los
          // pasillos de escalera con techo propio: iba a la altura del salón y
          // asomaba por arriba del techo inclinado como una viga suelta)
          if (!Z.under && !(ramp && RAMPS[w.rampAt[i]].ceil)) {
            const c = ceilOf(k);
            const [a0, b0, a1, b1] = strip(x, z, dx, dz, 0.12);
            gb.box('beam', a0, c - 0.32, b0, a1, c - 0.12, b1, 1);
            const [e0, f0, e1, f1] = strip(x, z, dx, dz, 0.2);
            gb.box('beam', e0, c - 0.12, f0, e1, c - 0.01, f1, 1);
          }
          return;
        }
        // afuera: nieve amontonada contra la pared o el parapeto
        if (ramp || nt === DOOR) return;
        const t = parapet ? 0.6 : 1;
        drift(gb, x, z, dx, dz, fy, t);
        // carámbanos del borde de arriba (las paredes, no los parapetos bajos)
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
  // los salones: vigas de lado a lado (a lo corto), con ménsulas y pilastras
  for (const k of [...HALLS, ...ROOMS]) {
    const Z = ZONES[k];
    // (la sala del trono lleva su artesonado con columnas: world/castleHalls.js)
    if (!Z || k === 'K') continue;
    const [x0, z0, x1, z1] = zoneRects(k)[0];
    const c = ceilOf(k);
    const alongX = x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
    const step = HALLS.includes(k) ? 3 : 2.4;
    const n = Math.max(1, Math.floor(len / step));
    const off = (len - (n - 1) * step) / 2;
    // una punta de viga no puede caer sobre una puerta más alta que la ménsula
    // (la de arriba de una escalera: desde el otro lado se veían la punta de
    // la viga y la ménsula en el vano); esa viga no va, queda el hueco de la escalera
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
    for (let s = 0; s < n; s++) {
      const p = (alongX ? x0 : z0) + off + s * step;
      if (tall(p)) continue;
      // la viga
      if (alongX) gb.box('beam', p - 0.16, c - 0.5, z0, p + 0.16, c - 0.01, z1 + 1, 1);
      else gb.box('beam', x0, c - 0.5, p - 0.16, x1 + 1, c - 0.01, p + 0.16, 1);
      // las ménsulas en las dos puntas
      for (const side of [0, 1]) {
        if (alongX) {
          const zz = side ? z1 + 1 - 0.38 : z0;
          gb.box('castleStone', p - 0.22, c - 0.95, zz, p + 0.22, c - 0.5, zz + 0.38, 1);
        } else {
          const xx = side ? x1 + 1 - 0.38 : x0;
          gb.box('castleStone', xx, c - 0.95, p - 0.22, xx + 0.38, c - 0.5, p + 0.22, 1);
        }
      }
      // las pilastras (solo en los salones altos, donde hay pared lisa)
      if (!HALLS.includes(k)) continue;
      for (const side of [0, 1]) {
        const cx = alongX ? Math.floor(p) : side ? x1 : x0;
        const cz = alongX ? (side ? z1 : z0) : Math.floor(p);
        const wx = alongX ? cx : side ? x1 + 1 : x0 - 1;
        const wz = alongX ? (side ? z1 + 1 : z0 - 1) : cz;
        if (!w.inside(wx, wz) || w.grid[w.idx(wx, wz)] !== WALL) continue;
        const fi = w.idx(cx, cz);
        if (w.grid[fi] !== FLOOR || w.rampAt[fi] >= 0 || propAt(cx, cz)) continue;
        // nada de puertas ni ventanas justo al lado
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
        let bx0;
        let bz0;
        let bx1;
        let bz1;
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
        // la base y el capitel, un poco más anchos
        const grow = (a0, a1, g) => [a0 - g, a1 + g];
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
  // contrafuertes en los patios: cada tanto, contra las paredes altas
  for (const k of YARDS) {
    const Z = ZONES[k];
    if (!Z) continue;
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
            // que no tape una puerta o una ventana de al lado
            for (const d of [-1, 1]) {
              const ax = dx ? nx : nx + d;
              const az = dx ? nz + d : nz;
              if (w.inside(ax, az) && [DOOR, WINDOW].includes(w.grid[w.idx(ax, az)])) return;
            }
            // ni lo que va contra la pared
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
            // nieve arriba de cada escalón del contrafuerte
            const cap = (b) => gb.box('snowCap', b[0] - 0.02, b[4], b[2] - 0.02, b[3] + 0.02, b[4] + 0.07, b[5] + 0.02, 1);
            cap(low);
            cap(high);
            boxes.push(low);
          });
        }
      }
    }
  }
  // los carámbanos de los aleros de los techos
  for (const [ax, az, bx, bz, y] of w.eaves || []) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len * 2.2);
    for (let s = 0; s < n; s++) {
      if (hash(ax + s * 1.7, az + s * 0.3) > 0.6) continue;
      const u = (s + hash(s, ax) * 0.8) / n;
      icicles.push([ax + (bx - ax) * u, y - 0.03, az + (bz - az) * u, 0.3 + hash(s * 2.1, az) * 0.9]);
    }
  }
  const mesh = gb.build(w.M);
  w.root.add(mesh);
  for (const b of boxes) w.addBox(b, { kind: 'prop' });
  // los carámbanos: una malla de instancias
  if (icicles.length) {
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
      // el cono apunta para arriba al revés: la base contra el borde y la punta abajo
      p.set(x, y - l, z);
      m4.compose(p, q, sc);
      inst.setMatrixAt(k, m4);
    });
    inst.castShadow = false;
    inst.receiveShadow = false;
    w.root.add(inst);
  }
  return mesh;
}

// La nieve amontonada contra una pared: una cuña que baja de `h` a cero en
// 0.85 m, con el alto que cambia de a poco a lo largo de la pared.
function drift(gb, x, z, dx, dz, fy, t) {
  // las dos puntas del borde (a y b) y hacia adentro (n)
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
  // la parte de arriba (empinada) y la de abajo (tendida)
  const uvs = (s) => [[0, 0], [s, 0], [s, 0.5], [0, 0.5]];
  gb.quad('snow', P(a, 0, ha), P(b, 0, hb), P(b, mid, hb * 0.55), P(a, mid, ha * 0.55), up((ha + hb) * 0.45), ...uvs(0.5));
  gb.quad('snow', P(a, mid, ha * 0.55), P(b, mid, hb * 0.55), P(b, D, 0.005), P(a, D, 0.005), up((ha + hb) * 0.2), ...uvs(0.5));
}
