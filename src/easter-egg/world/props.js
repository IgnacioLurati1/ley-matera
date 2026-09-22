import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../core/noise';

// Utilería del mapa. Cada constructor devuelve { obj, boxes } donde boxes son
// cajas de colisión locales [x0, y0, z0, x1, y1, z1] (antes de rotar).
// Lo que se anima se marca con userData.dynamic para no fusionarlo.

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function boxGeo(w, h, d) {
  return cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
}
export function rboxGeo(w, h, d, r = 0.05) {
  return cached(`r${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
}
export function cylGeo(rt, rb, h, seg = 12, open = false) {
  return cached(`c${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const B = (g, w, h, d, mat, x, y, z, rx, ry, rz) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const R = (g, w, h, d, mat, x, y, z, r, ry = 0) => {
  const m = mesh(rboxGeo(w, h, d, r), mat, x, y, z, 0, ry, 0);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

function chair(g, M, x, z, ry) {
  const c = new THREE.Group();
  B(c, 0.45, 0.05, 0.45, M.wood, 0, 0.46, 0);
  for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) B(c, 0.05, 0.46, 0.05, M.wood, a, 0.23, b);
  B(c, 0.45, 0.5, 0.04, M.wood, 0, 0.72, -0.2);
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  g.add(c);
}

// Mate + termo para decorar mesas.
function mateSet(g, M, x, y, z) {
  C(g, 0.045, 0.035, 0.09, M.gourd, x, y + 0.045, z, 0, 0, 0, 10);
  C(g, 0.047, 0.047, 0.012, M.silver, x, y + 0.09, z, 0, 0, 0, 10);
  C(g, 0.004, 0.004, 0.16, M.silver, x + 0.02, y + 0.13, z, 0, 0, 0.3, 5);
  C(g, 0.05, 0.05, 0.3, M.termo, x + 0.16, y + 0.15, z + 0.04, 0, 0, 0, 12);
  C(g, 0.035, 0.05, 0.05, M.metal, x + 0.16, y + 0.32, z + 0.04, 0, 0, 0, 12);
}

const BUILDERS = {
  table(M) {
    const g = new THREE.Group();
    B(g, 1.8, 0.07, 0.9, M.wood, 0, 0.78, 0);
    for (const [a, b] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) B(g, 0.08, 0.78, 0.08, M.wood, a, 0.39, b);
    chair(g, M, -0.5, 0.75, Math.PI);
    chair(g, M, 0.55, -0.8, 0.2);
    mateSet(g, M, -0.3, 0.815, 0.1);
    // botella y vasos
    C(g, 0.035, 0.035, 0.28, M.glass, 0.5, 0.955, -0.1);
    return { obj: g, boxes: [[-0.95, 0, -0.5, 0.95, 0.85, 0.5]] };
  },
  crates(M, o, r) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(r() * 3);
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const s = 0.7 + r() * 0.25;
      const x = (i % 2) * 0.85 - 0.4;
      const z = Math.floor(i / 2) * 0.1;
      const y = i >= 2 ? 0.8 : 0;
      B(g, s, s, s, M.crate, x, y + s / 2, z, 0, (r() - 0.5) * 0.4, 0);
      boxes.push([x - s / 2, 0, z - s / 2, x + s / 2, y + s, z + s / 2]);
    }
    return { obj: g, boxes };
  },
  barrel(M, o, r) {
    const g = new THREE.Group();
    const mat = r() < 0.5 ? M.drum : M.drumRed;
    C(g, 0.3, 0.3, 0.9, mat, 0, 0.45, 0, 0, 0, 0, 16);
    for (const y of [0.15, 0.45, 0.75]) C(g, 0.31, 0.31, 0.03, M.metal, 0, y, 0, 0, 0, 0, 16);
    return { obj: g, boxes: [[-0.32, 0, -0.32, 0.32, 0.9, 0.32]] };
  },
  hay(M) {
    const g = new THREE.Group();
    R(g, 1.2, 0.5, 0.55, M.hay, 0, 0.25, 0, 0.06);
    R(g, 1.2, 0.5, 0.55, M.hay, 0.1, 0.75, 0.02, 0.06, 0.1);
    R(g, 1.2, 0.5, 0.55, M.hay, 0, 0.25, 0.58, 0.06);
    return { obj: g, boxes: [[-0.62, 0, -0.3, 0.7, 1, 0.88]] };
  },
  sacks(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const x = (i % 3) * 0.62 - 0.62;
      const y = i >= 3 ? 0.36 : 0;
      R(g, 0.58, 0.36, 0.42, i % 2 ? M.sack : M.sackYerba, x + (i >= 3 ? 0.3 : 0), y + 0.18, (r() - 0.5) * 0.08, 0.12, (r() - 0.5) * 0.3);
    }
    return { obj: g, boxes: [[-0.95, 0, -0.25, 0.95, 0.72, 0.25]] };
  },
  // Secadero: bastidor de palos con ramas de yerba secándose.
  rack(M) {
    const g = new THREE.Group();
    const L = 4.5;
    for (const x of [-L / 2, 0, L / 2]) {
      for (const z of [-0.6, 0.6]) C(g, 0.06, 0.07, 2.2, M.log, x, 1.1, z, 0, 0, 0, 6);
    }
    for (const y of [1.2, 1.9]) {
      for (const z of [-0.6, 0.6]) C(g, 0.04, 0.04, L + 0.3, M.log, 0, y, z, 0, 0, Math.PI / 2, 6);
      B(g, L, 0.12, 1.3, M.yerbaBranch, 0, y + 0.1, 0);
    }
    B(g, L + 0.8, 0.05, 1.8, M.roofTin, 0, 2.3, 0, 0.08, 0, 0);
    return { obj: g, boxes: [[-L / 2 - 0.1, 0, -0.7, L / 2 + 0.1, 2.3, 0.7]] };
  },
  // Aljibe con arco de hierro, roldana y balde.
  well(M) {
    const g = new THREE.Group();
    const ring = mesh(cylGeo(0.85, 0.9, 0.9, 20, true), M.brickRound, 0, 0.45, 0);
    g.add(ring);
    const inner = mesh(cylGeo(0.7, 0.7, 0.9, 20, true), M.stoneDark, 0, 0.45, 0);
    g.add(inner);
    const cap = mesh(new THREE.RingGeometry(0.68, 0.92, 24), M.stone, 0, 0.9, 0, -Math.PI / 2);
    g.add(cap);
    const water = mesh(new THREE.CircleGeometry(0.7, 20), M.water, 0, 0.35, 0, -Math.PI / 2);
    g.add(water);
    for (const x of [-0.8, 0.8]) C(g, 0.03, 0.03, 1.4, M.iron, x, 1.6, 0, 0, 0, 0, 6);
    const arch = mesh(new THREE.TorusGeometry(0.8, 0.025, 6, 20, Math.PI), M.iron, 0, 2.3, 0);
    g.add(arch);
    const scroll = mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 14), M.iron, 0, 2.75, 0);
    g.add(scroll);
    C(g, 0.08, 0.08, 0.04, M.iron, 0, 2.2, 0, Math.PI / 2, 0, 0, 12);
    C(g, 0.006, 0.006, 1.1, M.rope, 0, 1.6, 0.06, 0, 0, 0, 4);
    const bucket = C(g, 0.13, 0.1, 0.22, M.metal, 0, 1.05, 0.06, 0, 0, 0, 12);
    bucket.name = 'bucket';
    return { obj: g, boxes: [[-0.95, 0, -0.95, 0.95, 1, 0.95]] };
  },
  tree(M, o, r) {
    const g = new THREE.Group();
    const h = 3.5 + r() * 1.5;
    C(g, 0.13, 0.22, h, M.bark, 0, h / 2, 0, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1, 8);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      C(g, 0.05, 0.08, 1.6, M.bark, Math.cos(a) * 0.4, h * 0.7 + i * 0.3, Math.sin(a) * 0.4, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7, 6);
    }
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.4 + r() * 1.1;
      const s = 0.8 + r() * 0.7;
      const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.leaf, Math.cos(a) * d, h + (r() - 0.3) * 1.2, Math.sin(a) * d);
      m.scale.set(s, s * 0.7, s);
      g.add(m);
    }
    return { obj: g, boxes: [[-0.25, 0, -0.25, 0.25, 3, 0.25]] };
  },
  cart(M) {
    const g = new THREE.Group();
    B(g, 2.2, 0.1, 1.3, M.wood, 0, 0.75, 0);
    for (const z of [-0.62, 0.62]) B(g, 2.2, 0.45, 0.06, M.wood, 0, 1.02, z);
    B(g, 0.06, 0.45, 1.3, M.wood, -1.08, 1.02, 0);
    for (const z of [-0.78, 0.78]) {
      const w = mesh(cached('wheel', () => new THREE.TorusGeometry(0.62, 0.05, 6, 20)), M.woodDark, 0.1, 0.65, z);
      g.add(w);
      for (let s = 0; s < 6; s++) B(g, 0.04, 1.2, 0.04, M.woodDark, 0.1, 0.65, z, 0, 0, (s * Math.PI) / 6);
      C(g, 0.08, 0.08, 0.14, M.woodDark, 0.1, 0.65, z, Math.PI / 2);
    }
    B(g, 2.2, 0.08, 0.08, M.wood, 2.1, 0.55, 0, 0, 0, -0.35);
    for (let i = 0; i < 3; i++) R(g, 0.55, 0.35, 0.4, M.sackYerba, -0.5 + i * 0.5, 1.0, (i - 1) * 0.2, 0.1, i);
    return { obj: g, boxes: [[-1.1, 0, -0.9, 1.3, 1.3, 0.9]] };
  },
  lamppost(M) {
    const g = new THREE.Group();
    C(g, 0.05, 0.08, 3.2, M.iron, 0, 1.6, 0, 0, 0, 0, 8);
    B(g, 0.05, 0.05, 0.6, M.iron, 0, 3.15, -0.25);
    const lamp = new THREE.Group();
    lamp.userData.dynamic = true;
    lamp.position.set(0, 3.3, -0.55);
    lamp.add(mesh(cylGeo(0.12, 0.18, 0.3, 6), M.glassLamp, 0, -0.1, 0));
    lamp.add(mesh(cylGeo(0.02, 0.2, 0.12, 6), M.iron, 0, 0.1, 0));
    g.add(lamp);
    return { obj: g, boxes: [[-0.12, 0, -0.12, 0.12, 3, 0.12]] };
  },
  // Estantería de almacén llena de paquetes de yerba.
  shelf(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 5;
    for (const x of [-L / 2, -L / 6, L / 6, L / 2]) {
      for (const z of [-0.3, 0.3]) B(g, 0.06, 2.3, 0.06, M.woodDark, x, 1.15, z);
    }
    const packMats = [M.packRed, M.packYellow, M.packGreen, M.packBlue, M.packWhite];
    for (const y of [0.15, 0.75, 1.35, 1.95]) {
      B(g, L + 0.1, 0.04, 0.66, M.woodDark, 0, y, 0);
      if (y > 1.9) continue;
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.1; x += 0.2) {
        if (r() < 0.12) continue;
        for (const z of [-0.15, 0.15]) {
          const m = packMats[Math.floor(r() * packMats.length)];
          B(g, 0.14, 0.25, 0.1, m, x + (r() - 0.5) * 0.03, y + 0.145, z, 0, (r() - 0.5) * 0.3, r() < 0.05 ? 0.4 : 0);
        }
      }
    }
    return { obj: g, boxes: [[-L / 2 - 0.05, 0, -0.35, L / 2 + 0.05, 2.3, 0.35]] };
  },
  shelfWall(M, o, r) {
    const res = BUILDERS.shelf(M, o, r);
    return res;
  },
  counter(M) {
    const g = new THREE.Group();
    B(g, 3.2, 1, 0.7, M.woodDark, 0, 0.5, 0);
    B(g, 3.3, 0.06, 0.8, M.wood, 0, 1.03, 0);
    // caja registradora
    B(g, 0.45, 0.25, 0.4, M.brass, -0.9, 1.19, 0);
    B(g, 0.4, 0.2, 0.1, M.brass, -0.9, 1.4, -0.12, -0.4);
    // balanza
    C(g, 0.12, 0.15, 0.08, M.redPaint, 0.6, 1.1, 0);
    C(g, 0.02, 0.02, 0.35, M.metal, 0.6, 1.3, 0);
    C(g, 0.16, 0.16, 0.02, M.metal, 0.6, 1.48, 0);
    // frascos
    for (let i = 0; i < 4; i++) C(g, 0.08, 0.08, 0.22, M.glass, 1.0 + i * 0.18, 1.17, 0.1);
    return { obj: g, boxes: [[-1.65, 0, -0.4, 1.65, 1.1, 0.4]] };
  },
  // Barbacuá: horno de ladrillo con fuego y parrilla de secado encima.
  kiln(M) {
    const g = new THREE.Group();
    const W = 5;
    const D = 3.2;
    B(g, W, 1.3, D, M.brickSoot, 0, 0.65, 0);
    B(g, W + 0.2, 0.15, D + 0.2, M.stone, 0, 1.35, 0);
    // boca del horno (frente, +z)
    B(g, 1.3, 0.9, 0.05, M.black, 0, 0.55, D / 2 + 0.01);
    const glow = mesh(boxGeo(1.1, 0.7, 0.02), M.fireGlow, 0, 0.5, D / 2 + 0.03);
    glow.userData.dynamic = true;
    glow.name = 'kilnGlow';
    g.add(glow);
    // arco
    const arch = mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 12, Math.PI), M.brickSoot, 0, 1.0, D / 2 + 0.05);
    g.add(arch);
    // parrilla de secado con yerba
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) C(g, 0.06, 0.06, 1.3, M.log, x, 2.05, z, 0, 0, 0, 6);
    B(g, W - 0.2, 0.18, D - 0.2, M.yerbaBranch, 0, 2.7, 0);
    for (let i = 0; i < 9; i++) C(g, 0.04, 0.04, D, M.log, -W / 2 + 0.4 + i * 0.52, 2.6, 0, Math.PI / 2, 0, 0, 5);
    // chimenea
    B(g, 0.7, 2.4, 0.7, M.brickSoot, W / 2 - 0.5, 2.5, -D / 2 + 0.5);
    return { obj: g, boxes: [[-W / 2, 0, -D / 2, W / 2, 3, D / 2 + 0.1]] };
  },
  firewood(M, o, r) {
    const g = new THREE.Group();
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5 - row; i++) {
        C(g, 0.11, 0.11, 1.1, M.log, (i - (4 - row) / 2) * 0.23, 0.11 + row * 0.2, 0, Math.PI / 2, (r() - 0.5) * 0.15, 0, 7);
      }
    }
    return { obj: g, boxes: [[-0.62, 0, -0.55, 0.62, 0.65, 0.55]] };
  },
  altar(M) {
    const g = new THREE.Group();
    B(g, 2, 1, 0.8, M.stone, 0, 0.5, 0);
    B(g, 2.1, 0.03, 0.9, M.clothWhite, 0, 1.015, 0);
    B(g, 0.1, 1.1, 0.06, M.brass, 0, 1.6, -0.25);
    B(g, 0.6, 0.1, 0.06, M.brass, 0, 1.85, -0.25);
    const flames = new THREE.Group();
    flames.userData.dynamic = true;
    flames.name = 'candles';
    for (const x of [-0.8, -0.55, 0.55, 0.8]) {
      C(g, 0.03, 0.03, 0.3, M.candle, x, 1.18, 0.1, 0, 0, 0, 8);
      const f = mesh(cached('flame', () => new THREE.ConeGeometry(0.02, 0.06, 6)), M.flame, x, 1.37, 0.1);
      flames.add(f);
    }
    g.add(flames);
    return { obj: g, boxes: [[-1, 0, -0.4, 1, 1.1, 0.4]] };
  },
  pew(M) {
    const g = new THREE.Group();
    B(g, 2.6, 0.06, 0.45, M.woodDark, 0, 0.45, 0);
    B(g, 2.6, 0.55, 0.05, M.woodDark, 0, 0.78, -0.22);
    for (const x of [-1.25, 1.25]) B(g, 0.06, 0.95, 0.5, M.woodDark, x, 0.47, -0.02);
    return { obj: g, boxes: [[-1.3, 0, -0.27, 1.3, 1, 0.25]] };
  },
  generator(M) {
    const g = new THREE.Group();
    B(g, 3, 0.25, 1.6, M.metal, 0, 0.125, 0);
    R(g, 2, 1.3, 1.2, M.metalGreen, -0.3, 0.9, 0, 0.08);
    C(g, 0.5, 0.5, 1.4, M.metalGreen, -0.3, 1.6, 0, 0, 0, Math.PI / 2, 16);
    const wheel = new THREE.Group();
    wheel.userData.dynamic = true;
    wheel.name = 'flywheel';
    wheel.position.set(1.1, 0.95, 0);
    wheel.add(mesh(cached('fly', () => new THREE.TorusGeometry(0.55, 0.08, 8, 20)), M.iron, 0, 0, 0, 0, Math.PI / 2));
    for (let s = 0; s < 4; s++) wheel.add(mesh(boxGeo(0.05, 1.1, 0.05), M.iron, 0, 0, 0, (s * Math.PI) / 4));
    g.add(wheel);
    C(g, 0.08, 0.08, 1.2, M.copper, -0.3, 2.3, 0.4, 0, 0, 0, 8);
    B(g, 0.3, 0.4, 0.1, M.brass, -1.1, 1.2, 0.62);
    return { obj: g, boxes: [[-1.5, 0, -0.8, 1.7, 2.2, 0.8]] };
  },
  pipes(M) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) C(g, 0.08, 0.08, 20, i === 1 ? M.copper : M.metal, 0, 2.6 + i * 0.25, -0.1 - i * 0.1, 0, 0, Math.PI / 2, 8);
    for (let i = -3; i <= 3; i++) {
      C(g, 0.1, 0.1, 0.2, M.redPaint, i * 3, 2.85, -0.2, Math.PI / 2, 0, 0, 8);
    }
    return { obj: g, boxes: [] };
  },
  bigsacks(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const x = (i % 2) * 1.05 - 0.5;
      const z = (Math.floor(i / 2) % 2) * 1.05 - 0.5;
      const y = i >= 4 ? 0.9 : 0;
      R(g, 1, 0.9, 1, i % 3 ? M.sackYerba : M.sack, x, y + 0.45, z, 0.18, (r() - 0.5) * 0.2);
    }
    R(g, 1, 0.9, 1, M.sackYerba, 0, 2.25, 0, 0.18, 0.4);
    return { obj: g, boxes: [[-1.05, 0, -1.05, 1.05, 2.7, 1.05]] };
  },
  pallets(M) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const y = k * 0.16;
      for (let i = 0; i < 5; i++) B(g, 1.2, 0.025, 0.16, M.wood, 0, y + 0.14, -0.5 + i * 0.25);
      for (const x of [-0.5, 0, 0.5]) B(g, 0.1, 0.1, 1.2, M.woodDark, x, y + 0.07, 0);
    }
    return { obj: g, boxes: [[-0.62, 0, -0.62, 0.62, 0.7, 0.62]] };
  },
  // Camioncito viejo de reparto cargado de bolsas.
  truck(M) {
    const g = new THREE.Group();
    B(g, 5.2, 0.25, 1.9, M.iron, 0, 0.6, 0);
    R(g, 1.7, 1.2, 1.9, M.truckPaint, 1.8, 1.35, 0, 0.12);
    R(g, 1.2, 0.8, 1.7, M.truckPaint, 2.95, 1.0, 0, 0.15);
    B(g, 0.05, 0.55, 1.6, M.glassDark, 1.2 + 0.02, 1.75, 0);
    B(g, 1.1, 0.5, 0.04, M.glassDark, 1.85, 1.7, 0.96);
    B(g, 3.2, 0.1, 1.9, M.wood, -1, 0.78, 0);
    for (const z of [-0.93, 0.93]) B(g, 3.2, 0.5, 0.06, M.wood, -1, 1.05, z);
    for (const [x, z] of [[2.6, 0.95], [2.6, -0.95], [-1.6, 0.95], [-1.6, -0.95]]) {
      C(g, 0.42, 0.42, 0.28, M.tire, x, 0.42, z, Math.PI / 2, 0, 0, 14);
      C(g, 0.22, 0.22, 0.3, M.metal, x, 0.42, z, Math.PI / 2, 0, 0, 10);
    }
    for (const z of [-0.6, 0.6]) C(g, 0.12, 0.12, 0.06, M.glassLampOff, 3.56, 1.1, z, 0, 0, Math.PI / 2, 10);
    for (let i = 0; i < 6; i++) R(g, 0.9, 0.45, 0.7, M.sackYerba, -2.1 + (i % 3) * 0.9, 1.07 + Math.floor(i / 3) * 0.45, (i % 2 ? 0.4 : -0.4), 0.1, i * 0.2);
    return { obj: g, boxes: [[-2.7, 0, -1.05, 3.6, 2, 1.05]] };
  },
  desk(M) {
    const g = new THREE.Group();
    B(g, 1.8, 0.06, 0.9, M.woodDark, 0, 0.78, 0);
    for (const x of [-0.7, 0.7]) B(g, 0.4, 0.75, 0.85, M.woodDark, x, 0.375, 0);
    B(g, 0.35, 0.25, 0.3, M.black, -0.4, 0.93, -0.1);
    for (let i = 0; i < 5; i++) B(g, 0.25, 0.01, 0.34, M.paper, 0.3 + (i % 2) * 0.05, 0.815 + i * 0.012, 0.05, 0, i * 0.2);
    mateSet(g, M, 0.65, 0.81, -0.2);
    chair(g, M, 0, -0.75, 0);
    return { obj: g, boxes: [[-0.92, 0, -0.47, 0.92, 0.9, 0.47]] };
  },
  cabinet(M) {
    const g = new THREE.Group();
    B(g, 0.6, 1.4, 0.6, M.metalGreen, 0, 0.7, 0);
    for (let i = 0; i < 4; i++) B(g, 0.2, 0.03, 0.03, M.brass, 0, 0.3 + i * 0.33, 0.31);
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 1.4, 0.3]] };
  },
  armchair(M) {
    const g = new THREE.Group();
    R(g, 0.9, 0.45, 0.85, M.leather, 0, 0.3, 0, 0.08);
    R(g, 0.9, 0.7, 0.2, M.leather, 0, 0.75, -0.35, 0.08);
    for (const x of [-0.4, 0.4]) R(g, 0.15, 0.3, 0.85, M.leather, x, 0.6, 0, 0.06);
    return { obj: g, boxes: [[-0.5, 0, -0.47, 0.5, 1.1, 0.45]] };
  },
  bookshelf(M, o, r) {
    const g = new THREE.Group();
    B(g, 1.8, 2.2, 0.35, M.woodDark, 0, 1.1, 0);
    const cols = [M.packRed, M.packGreen, M.packBlue, M.leather, M.paper];
    for (let s = 0; s < 4; s++) {
      for (let x = -0.8; x < 0.8; x += 0.07) {
        const h = 0.3 + r() * 0.12;
        B(g, 0.06, h, 0.25, cols[Math.floor(r() * cols.length)], x, 0.2 + s * 0.52 + h / 2, 0.06);
      }
    }
    return { obj: g, boxes: [[-0.9, 0, -0.2, 0.9, 2.2, 0.2]] };
  },
};

// Construye un prop y devuelve el objeto posicionado más sus cajas en mundo.
export function buildProp(def, M, seed) {
  const make = BUILDERS[def.type];
  if (!make) return null;
  const r = rng(seed);
  const { obj, boxes } = make(M, def, r);
  const [x, z] = def.pos;
  const rot = def.rot || 0;
  obj.position.set(x, 0, z);
  obj.rotation.y = rot;
  obj.updateMatrixWorld(true);
  const world = boxes.map((b) => rotateBox(b, x, z, rot));
  return { obj, boxes: world };
}

// Caja local -> caja alineada a ejes en mundo (conservadora si hay rotación).
export function rotateBox([x0, y0, z0, x1, y1, z1], px, pz, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const wx = px + x * c + z * s;
    const wz = pz - x * s + z * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return [minX, y0, minZ, maxX, y1, maxZ];
}
