import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, addBuilders } from './props';
import { leafCrownGeometry } from './esterosGrass';
import { SKY, MAP_W, MAP_H } from '../config/map';

// Utilería del estero (Mate no Numa): el campamento de Gil, el obraje, el
// monte, las cruces con cintas coloradas y la reducción en ruinas. Cada
// constructor devuelve { obj, boxes } como los de world/props.js (las cajas
// en coordenadas del prop). Los materiales propios salen de
// esterosMaterials (world/Esteros.js): thatch, piedraRoja, quebracho, palm,
// pelego.

const shared = new Map();
const keep = (key, make) => {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
};

// cilindro con rotación (x, y, z el centro)
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

// Un palo de A a B (cilindro orientado).
function stick(g, mat, a, b, r0, r1 = r0, seg = 7) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(cylGeo(r1, r0, len, seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.add(m);
  return m;
}

// Piedra: un dodecaedro aplastado.
const rock = (g, mat, x, y, z, s, r) => {
  const m = mesh(keep('rockGeo', () => new THREE.DodecahedronGeometry(1, 0)), mat, x, y, z, r() * 3, r() * 3, r() * 3);
  m.scale.set(s * (0.8 + r() * 0.5), s * (0.5 + r() * 0.3), s * (0.8 + r() * 0.5));
  g.add(m);
  return m;
};

const BUILDERS = {
  // El fogón del campamento: ronda de piedras, leños cruzados, brasas y la
  // pava colgada de un trípode de hierro.
  fogonCampo(M, o, r) {
    const g = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rock(g, M.stone, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 0.17, r);
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r() * 0.4;
      stick(g, M.bark, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [Math.cos(a) * 0.05, 0.28, Math.sin(a) * 0.05], 0.06, 0.045);
    }
    const coal = mesh(keep('coalGeo', () => new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M.fireGlow, 0, 0, 0);
    coal.scale.set(1, 0.35, 1);
    g.add(coal);
    // trípode y pava
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      stick(g, M.iron, [Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75], [0, 1.25, 0], 0.018);
    }
    stick(g, M.iron, [0, 1.25, 0], [0, 0.78, 0], 0.006);
    const pava = new THREE.Group();
    pava.position.set(0, 0.55, 0);
    C(pava, 0.11, 0.14, 0.2, M.iron, 0, 0, 0, 0, 0, 0, 12);
    C(pava, 0.03, 0.14, 0.06, M.iron, 0, 0.13, 0, 0, 0, 0, 12);
    stick(pava, M.iron, [0.1, -0.02, 0], [0.2, 0.1, 0], 0.018, 0.01);
    pava.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 5, 12, Math.PI), M.iron, 0, 0.16, 0));
    g.add(pava);
    // (firm: el Luisón pasa por arriba de lo chico del piso, pero no del fogón)
    return { obj: g, boxes: [[-0.8, 0, -0.8, 0.8, 0.35, 0.8]], firm: true };
  },

  // Enramada: cuatro horcones, dos vigas y un techo de paja; abajo los recados.
  enramada(M, o, r) {
    const g = new THREE.Group();
    const w = o.w || 4;
    const d = o.d || 3;
    const h = o.h || 2.3;
    const boxes = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = (sx * w) / 2;
        const z = (sz * d) / 2;
        stick(g, M.bark, [x, 0, z], [x + (r() - 0.5) * 0.08, h, z], 0.09, 0.07);
        // la horqueta arriba
        stick(g, M.bark, [x, h - 0.15, z], [x + sx * 0.15, h + 0.12, z], 0.04);
        boxes.push([x - 0.12, 0, z - 0.12, x + 0.12, h, z + 0.12]);
      }
    }
    for (const sz of [-1, 1]) stick(g, M.bark, [-w / 2 - 0.3, h, (sz * d) / 2], [w / 2 + 0.3, h, (sz * d) / 2], 0.07);
    for (let k = 0; k <= 4; k++) {
      const x = -w / 2 + (k / 4) * w;
      stick(g, M.bark, [x, h + 0.05, -d / 2 - 0.4], [x, h + 0.05, d / 2 + 0.4], 0.035);
    }
    // el techo: la paja gruesa, un poco caída hacia atrás
    const roof = mesh(boxGeo(w + 1, 0.28, d + 1), M.thatch, 0, h + 0.22, 0, 0.08, 0, 0);
    g.add(roof);
    const fringe = keep('fringeGeo', () => new THREE.PlaneGeometry(1, 0.5));
    for (const sz of [-1, 1]) {
      const f = mesh(fringe, M.thatchFringe, 0, h + 0.02 - sz * 0.04, (sz * (d + 1)) / 2, 0, 0, 0);
      f.scale.x = w + 1;
      g.add(f);
    }
    return { obj: g, boxes };
  },

  // Recados: cueros de oveja, jergas y las monturas apiladas en el suelo.
  recados(M, o, r) {
    const g = new THREE.Group();
    for (let k = 0; k < (o.n || 3); k++) {
      const x = (k - 1) * 0.75 + (r() - 0.5) * 0.2;
      const s = new THREE.Group();
      s.position.set(x, 0, (r() - 0.5) * 0.3);
      s.rotation.y = (r() - 0.5) * 0.6;
      s.add(mesh(boxGeo(0.55, 0.08, 0.7), k % 2 ? M.redCloth : M.leather, 0, 0.04, 0));
      const pel = mesh(boxGeo(0.5, 0.12, 0.62), M.pelego, 0, 0.13, 0);
      pel.rotation.z = (r() - 0.5) * 0.1;
      s.add(pel);
      s.add(mesh(boxGeo(0.34, 0.14, 0.5), M.leather, 0, 0.26, 0));
      C(s, 0.05, 0.05, 0.36, M.leather, 0, 0.33, 0.2, 0, 0, Math.PI / 2, 8);
      g.add(s);
    }
    return { obj: g, boxes: [] };
  },

  // La caldera de vapor del obraje (la luz del mapa): la locomóvil, con su
  // chimenea, el hogar, el volante y las ruedas de hierro.
  locomovil(M, o, r) {
    const g = new THREE.Group();
    C(g, 0.55, 0.55, 3, M.iron, 0, 1.25, 0, 0, 0, Math.PI / 2, 16);
    for (const x of [-1.3, -0.4, 0.5, 1.3]) C(g, 0.58, 0.58, 0.06, M.brass, x, 1.25, 0, 0, 0, Math.PI / 2, 16);
    // el hogar (atrás) y la chimenea (adelante)
    g.add(mesh(boxGeo(0.9, 1.3, 1.1), M.iron, -1.7, 1.15, 0));
    g.add(mesh(boxGeo(0.5, 0.35, 0.02), M.fireGlow, -2.16, 0.9, 0, 0, Math.PI / 2, 0));
    C(g, 0.18, 0.22, 2.2, M.iron, 1.2, 2.8, 0, 0, 0, 0, 10);
    C(g, 0.3, 0.18, 0.35, M.iron, 1.2, 4, 0, 0, 0, 0, 10);
    // el volante y la biela
    const fly = mesh(new THREE.TorusGeometry(0.7, 0.07, 6, 24), M.iron, 0.2, 1.3, 0.75);
    g.add(fly);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      g.add(mesh(boxGeo(1.4, 0.05, 0.05), M.iron, 0.2, 1.3, 0.75, 0, 0, a));
    }
    stick(g, M.brass, [0.2, 1.3, 0.8], [-0.9, 1.7, 0.6], 0.035);
    // manómetro y silbato
    C(g, 0.1, 0.1, 0.05, M.brass, -0.6, 1.85, 0.25, Math.PI / 2, 0, 0, 12);
    C(g, 0.03, 0.05, 0.3, M.brass, -0.2, 1.95, 0, 0, 0, 0, 8);
    // ruedas grandes
    for (const [x, rad] of [[-1.3, 0.75], [1, 0.6]]) {
      for (const sz of [-1, 1]) {
        const w = mesh(new THREE.TorusGeometry(rad, 0.05, 5, 20), M.iron, x, rad, sz * 0.75);
        g.add(w);
        for (let k = 0; k < 8; k++) g.add(mesh(boxGeo(rad * 2, 0.04, 0.04), M.iron, x, rad, sz * 0.75, 0, 0, (k / 8) * Math.PI));
      }
    }
    return { obj: g, boxes: [[-2.2, 0, -0.9, 1.9, 2.1, 0.9], [0.95, 2, -0.25, 1.45, 4.2, 0.25]] };
  },

  // Rollizos de quebracho apilados (y a veces un hacha clavada).
  troncos(M, o, r) {
    const g = new THREE.Group();
    const len = o.len || 3.2;
    const rows = [5, 4, 3, 2];
    let y = 0.2;
    rows.slice(0, o.rows || 3).forEach((n, row) => {
      for (let k = 0; k < n; k++) {
        const rad = 0.18 + r() * 0.05;
        const z = (k - (n - 1) / 2) * 0.4;
        C(g, rad, rad, len + (r() - 0.5) * 0.4, M.quebracho, (r() - 0.5) * 0.2, y + row * 0.3, z, 0, 0, Math.PI / 2, 9);
      }
      y += 0.05;
    });
    const top = 0.2 + (Math.min(o.rows || 3, 4) - 1) * 0.35;
    if (o.hacha) {
      stick(g, M.woodDark, [len * 0.3, top + 0.15, 0], [len * 0.3 + 0.3, top + 0.95, 0.2], 0.022);
      g.add(mesh(boxGeo(0.04, 0.18, 0.16), M.iron, len * 0.3, top + 0.2, 0.02));
    }
    const hw = (Math.max(...rows.slice(0, o.rows || 3)) * 0.4) / 2;
    return { obj: g, boxes: [[-len / 2, 0, -hw, len / 2, top + 0.2, hw]] };
  },

  // La carreta de bueyes: caja de tablas y dos ruedas enormes.
  carreta(M, o, r) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(1.6, 0.1, 3), M.wood, 0, 1.3, 0));
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.06, 0.8, 3), M.woodDark, sx * 0.8, 1.7, 0));
      for (let k = -1; k <= 1; k++) g.add(mesh(boxGeo(0.08, 1.1, 0.08), M.woodDark, sx * 0.8, 1.75, k * 1.3));
    }
    // el techo de cuero curvado
    const roof = mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.1, 12, 1, true, -Math.PI / 2, Math.PI), M.leather, 0, 2.2, 0, Math.PI / 2, 0, 0);
    g.add(roof);
    for (const sx of [-1, 1]) {
      const w = mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 22), M.woodDark, sx * 1.0, 1.15, 0.3, 0, Math.PI / 2, 0);
      g.add(w);
      for (let k = 0; k < 7; k++) g.add(mesh(boxGeo(0.06, 2.3, 0.06), M.woodDark, sx * 1.0, 1.15, 0.3, (k / 7) * Math.PI, 0, 0));
    }
    C(g, 0.13, 0.13, 0.3, M.woodDark, 0, 1.15, 0.3, 0, 0, Math.PI / 2, 8);
    // el pértigo apoyado en el suelo
    stick(g, M.woodDark, [0, 1.25, 1.5], [0, 0.05, 4.2], 0.07);
    return { obj: g, boxes: [[-1.2, 0, -1.6, 1.2, 2.6, 1.8]] };
  },

  // Palmera yatay: tronco un poco curvo con las marcas de las hojas y un
  // penacho de hojas arqueadas.
  palmera(M, o, r) {
    const g = new THREE.Group();
    const h = o.h || 6 + r() * 3;
    const lean = (r() - 0.5) * 0.5;
    const segs = 6;
    let px = 0;
    let py = 0;
    for (let k = 0; k < segs; k++) {
      const nx = px + lean * (h / segs) * 0.25 * (k / segs);
      const ny = py + h / segs;
      stick(g, M.palmTrunk, [px, py, 0], [nx, ny, 0], 0.24 - k * 0.012, 0.23 - k * 0.012, 8);
      px = nx;
      py = ny;
    }
    const leaf = keep('palmLeafGeo', () => {
      // una hoja: una tira que se arquea hacia abajo, más angosta en la punta
      const pos = [];
      const idx = [];
      const n = 7;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = t * 2.6;
        const y = Math.sin(t * Math.PI * 0.8) * 0.9 - t * t * 1.4;
        const w = 0.35 * (1 - t * 0.85);
        pos.push(x, y, -w, x, y - 0.05, w);
        if (k < n) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    });
    for (let k = 0; k < 14; k++) {
      const m = mesh(leaf, M.palm, px, py, 0, (r() - 0.5) * 0.3, (k / 14) * Math.PI * 2 + r() * 0.3, (r() - 0.3) * 0.4);
      g.add(m);
    }
    g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), M.palmTrunk, px, py, 0));
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 3, 0.3]] };
  },

  // El algarrobo de los colgados: tronco grueso y retorcido, ramas que se
  // abren, poco follaje y sogas colgando de la rama más larga.
  algarrobo(M, o, r) {
    const g = new THREE.Group();
    const s = o.s || 1;
    stick(g, M.bark, [0, 0, 0], [0.3 * s, 2.2 * s, 0.1 * s], 0.75 * s, 0.55 * s, 9);
    // raíces
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r() * 0.5;
      stick(g, M.bark, [Math.cos(a) * 0.4 * s, 0.35 * s, Math.sin(a) * 0.4 * s], [Math.cos(a) * 1.6 * s, -0.1, Math.sin(a) * 1.6 * s], 0.28 * s, 0.08 * s, 6);
    }
    const tips = [];
    // (de dónde sale cada punta: las sogas cuelgan de ese último tramo)
    const froms = [];
    const branch = (from, dir, len, rad, depth) => {
      const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
      stick(g, M.bark, from, to, rad, rad * 0.65, 6);
      if (depth <= 0) {
        tips.push(to);
        froms.push(from);
        return;
      }
      for (let k = 0; k < 2; k++) {
        const d = [dir[0] + (r() - 0.5) * 0.9, dir[1] * 0.6 + (r() - 0.2) * 0.4, dir[2] + (r() - 0.5) * 0.9];
        const l = Math.hypot(...d);
        branch(to, d.map((v) => v / l), len * 0.72, rad * 0.62, depth - 1);
      }
    };
    const top = [0.3 * s, 2.2 * s, 0.1 * s];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      // (o.alza[k]: cuánto más empinada sale cada rama; el mismo largo)
      const up = 0.5 + (o.alza?.[k] || 0);
      const n = Math.hypot(0.85, up) / Math.hypot(0.85, 0.5);
      const d = [(Math.cos(a) * 0.85) / n, up / n, (Math.sin(a) * 0.85) / n];
      branch(top, d, (k === 0 ? 4.2 : 3) * s, 0.36 * s, 2);
    }
    const crown = leafCrownGeometry();
    for (const t of tips) {
      if (r() < 0.45) continue;
      const m = mesh(crown, M.leafDark || M.leaf, t[0], t[1] + 0.2, t[2]);
      m.scale.set(1.3 * s, 0.45 * s, 1.1 * s);
      g.add(m);
    }
    // las sogas: de la rama más larga (la primera)
    const long = tips.slice(0, 4);
    long.forEach((t, k) => {
      if (k % 2) return;
      const len = 1.6 + r() * 0.8;
      // atada a la rama: un punto del último tramo (antes quedaba en el aire,
      // en una cuenta que no caía sobre ninguna rama)
      const f = froms[k];
      const p = [f[0] + (t[0] - f[0]) * 0.55, f[1] + (t[1] - f[1]) * 0.55, f[2] + (t[2] - f[2]) * 0.55];
      stick(g, M.rope, p, [p[0], p[1] - len, p[2]], 0.02);
      g.add(mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 10), M.rope, p[0], p[1] - len - 0.12, p[2], 0, r() * 3, Math.PI / 2));
    });
    return { obj: g, boxes: [[-0.8 * s, 0, -0.8 * s, 0.8 * s, 3 * s, 0.8 * s]] };
  },

  // Árbol del monte (timbó, lapacho): tronco alto y copa ancha.
  arbolMonte(M, o, r) {
    const g = new THREE.Group();
    const h = o.h || 5 + r() * 3;
    stick(g, M.bark, [0, 0, 0], [(r() - 0.5) * 0.4, h, (r() - 0.5) * 0.4], 0.35, 0.22, 8);
    const crown = leafCrownGeometry();
    for (let k = 0; k < 6; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * 1.8;
      const m = mesh(crown, o.flores ? M.lapacho : M.leafDark || M.leaf, Math.cos(a) * d, h + (r() - 0.3) * 1.2, Math.sin(a) * d);
      m.scale.set(1.6 + r(), 0.9 + r() * 0.4, 1.6 + r());
      g.add(m);
    }
    return { obj: g, boxes: [[-0.35, 0, -0.35, 0.35, h * 0.6, 0.35]] };
  },

  // Cruz de palo con cintas coloradas atadas y una vela (las cruces de los
  // caminos del Litoral).
  cruzCinta(M, o, r) {
    const g = new THREE.Group();
    const h = o.h || 1.3;
    g.add(mesh(boxGeo(0.08, h, 0.06), M.woodDark, 0, h / 2, 0, 0, 0, (r() - 0.5) * 0.12));
    g.add(mesh(boxGeo(0.6, 0.07, 0.06), M.woodDark, 0, h * 0.72, 0));
    for (let k = 0; k < 4; k++) {
      const x = (r() - 0.5) * 0.5;
      const len = 0.25 + r() * 0.35;
      g.add(mesh(boxGeo(0.04, len, 0.005), M.redCloth, x, h * 0.72 - len / 2 - 0.03, 0.04, 0, 0, (r() - 0.5) * 0.3));
    }
    if (o.vela !== false) {
      C(g, 0.02, 0.02, 0.12, M.candle, 0.18, 0.06, 0.15, 0, 0, 0, 6);
      g.add(mesh(new THREE.SphereGeometry(0.012, 5, 4), M.flame, 0.18, 0.13, 0.15));
    }
    // (finita: no traba el paso de nadie)
    return { obj: g, boxes: [] };
  },

  // Farol colgado de un poste con brazo.
  farolPoste(M, o, r) {
    const g = new THREE.Group();
    const h = o.h || 2.6;
    stick(g, M.bark, [0, 0, 0], [0, h, 0], 0.07, 0.06);
    stick(g, M.bark, [0, h - 0.2, 0], [0.55, h - 0.05, 0], 0.035);
    stick(g, M.iron, [0.5, h - 0.05, 0], [0.5, h - 0.35, 0], 0.005);
    g.add(mesh(boxGeo(0.16, 0.22, 0.16), M.glassLamp, 0.5, h - 0.47, 0));
    g.add(mesh(new THREE.ConeGeometry(0.14, 0.1, 4), M.iron, 0.5, h - 0.31, 0, 0, Math.PI / 4, 0));
    return { obj: g, boxes: [[-0.1, 0, -0.1, 0.1, h, 0.1]] };
  },

  // Mesa tosca de tablas con dos bancos.
  mesaTosca(M, o, r) {
    const g = new THREE.Group();
    const len = o.len || 1.8;
    g.add(mesh(boxGeo(len, 0.06, 0.7), M.wood, 0, 0.78, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(boxGeo(0.07, 0.76, 0.07), M.woodDark, (sx * (len - 0.2)) / 2, 0.38, sz * 0.28));
    for (const sz of [-1, 1]) {
      g.add(mesh(boxGeo(len, 0.05, 0.25), M.woodDark, 0, 0.45, sz * 0.62));
      for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.06, 0.45, 0.06), M.woodDark, (sx * (len - 0.3)) / 2, 0.22, sz * 0.62));
    }
    return { obj: g, boxes: [[-len / 2, 0, -0.75, len / 2, 0.8, 0.75]] };
  },

  // Cruz de piedra roja de la reducción, alta, con el pie escalonado.
  cruzMision(M, o, r) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(1.4, 0.35, 1.4), M.piedraRoja, 0, 0.17, 0));
    g.add(mesh(boxGeo(1, 0.35, 1), M.piedraRoja, 0, 0.52, 0));
    g.add(mesh(boxGeo(0.3, 3.2, 0.3), M.piedraRoja, 0, 2.3, 0, 0, 0, 0.04));
    g.add(mesh(boxGeo(1.5, 0.28, 0.28), M.piedraRoja, 0.08, 3.1, 0, 0, 0, 0.04));
    return { obj: g, boxes: [[-0.7, 0, -0.7, 0.7, 0.7, 0.7], [-0.2, 0.7, -0.2, 0.2, 3.9, 0.2]] };
  },

  // La loma del Luisón: un lomo de pasto que asoma por arriba del pajonal,
  // entre el algarrobo y la reducción, del lado de la luna. Ahí aparece en la
  // llegada (ui/LuisonArrival): recortado contra la luna llena, parado en las
  // piedras de la cresta. Sin cajas: queda afuera de lo que se camina.
  loma(M, o, r) {
    const g = new THREE.Group();
    const rx = o.rx || 3.5;
    const rz = o.rz || 2.5;
    // (con la cuesta larga de atrás, la malla llega hasta donde termina)
    const b = lomaBack(o);
    const R = b ? o.ramp : 1;
    const x0 = -rx - 1.2 + (b && b[0] < 0 ? b[0] * rx * (R - 1) : 0);
    const x1 = rx + 1.2 + (b && b[0] > 0 ? b[0] * rx * (R - 1) : 0);
    const z0 = -rz - 1.2 + (b && b[1] < 0 ? b[1] * rz * (R - 1) : 0);
    const z1 = rz + 1.2 + (b && b[1] > 0 ? b[1] * rz * (R - 1) : 0);
    const NX = Math.round(44 * Math.sqrt((x1 - x0) / (2 * rx + 2.4)));
    const NZ = Math.round(44 * Math.sqrt((z1 - z0) / (2 * rz + 2.4)));
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, NX, NZ).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = lomaY(o, x, z);
      p.setY(i, y);
      uv.setXY(i, x / 3, z / 3);
      // pasto abajo (como el suelo del estero) y tierra pelada arriba
      const n = Math.sin(x * 0.7 + z * 0.3) * 0.5 + Math.sin(x * 0.21 - z * 0.63) * 0.5;
      const top = Math.max(0, Math.min(1, (y / (o.h || 5) - 0.45) * 2.2));
      col[i * 3] = 0.55 + n * 0.08 + (0.32 - 0.55) * top;
      col[i * 3 + 1] = 0.6 + n * 0.1 + (0.27 - 0.6) * top;
      col[i * 3 + 2] = 0.4 + (0.2 - 0.4) * top;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.ground));
    // la losa de la cresta (ahí se para: su altura es la de lomaTop) y
    // piedras sueltas alrededor
    const slab = mesh(keep('rockGeo', () => new THREE.DodecahedronGeometry(1, 0)), M.stone, 0, lomaY(o, 0, 0) - 0.05, 0, 0, r() * 3, 0);
    slab.scale.set(1.15, SLAB_H, 0.95);
    g.add(slab);
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      const d = 1.0 + r() * 0.8;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d * 0.7;
      rock(g, M.stone, x, lomaY(o, x, z) - 0.05, z, 0.3 + r() * 0.3, r);
    }
    return { obj: g, boxes: [] };
  },

  // Piedras caídas de la reducción: bloques de arenisca roja sueltos.
  escombroRojo(M, o, r) {
    const g = new THREE.Group();
    for (let k = 0; k < (o.n || 6); k++) {
      const b = mesh(boxGeo(0.5 + r() * 0.4, 0.3 + r() * 0.2, 0.35 + r() * 0.2), M.piedraRoja, (r() - 0.5) * 1.6, 0.15, (r() - 0.5) * 1.2, r() * 0.4, r() * 3, r() * 0.4);
      g.add(b);
    }
    return { obj: g, boxes: [] };
  },

  // Redes tendidas a secar entre dos palos.
  redesPalo(M, o, r) {
    const g = new THREE.Group();
    const len = o.len || 2.4;
    for (const sx of [-1, 1]) stick(g, M.bark, [(sx * len) / 2, 0, 0], [(sx * len) / 2, 1.9, 0], 0.05);
    const net = keep('netMat', () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.strokeStyle = 'rgba(160,150,120,0.95)';
      x.lineWidth = 2;
      for (let k = 0; k <= 128; k += 12) {
        x.beginPath();
        x.moveTo(k, 0);
        x.lineTo(k - 60, 128);
        x.stroke();
        x.beginPath();
        x.moveTo(k, 0);
        x.lineTo(k + 60, 128);
        x.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    });
    const sheet = mesh(new THREE.PlaneGeometry(len, 1.5, 6, 3), net, 0, 1.05, 0);
    const p = sheet.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin((p.getX(k) / len) * Math.PI + 1.6) * 0.12 - (0.75 - Math.abs(p.getY(k))) * 0.1);
    sheet.geometry.computeVertexNormals();
    g.add(sheet);
    return { obj: g, boxes: [[-len / 2, 0, -0.1, len / 2, 1.9, 0.1]] };
  },
};

// Lo alto de la losa de la cresta (sobre el piso): donde apoya los pies.
const SLAB_H = 0.3;
let dodeTop = 0;
export function lomaTop(o) {
  if (!dodeTop) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    geo.computeBoundingBox();
    dodeTop = geo.boundingBox.max.y;
    geo.dispose();
  }
  return lomaY(o, 0, 0) - 0.05 + dodeTop * SLAB_H;
}

// La cuesta larga de atrás (o.ramp: cuántas veces más larga que adelante),
// del lado de la luna: por ahí sube caminando el Luisón en la llegada, y
// desde el claro no se ve (la tapa la cresta).
function lomaBack(o) {
  if (!o.ramp) return null;
  if (!o.back) {
    const d = SKY?.moon?.dir || [0.6, 0.31, 0.74];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const cx = SKY?.center?.[0] ?? MAP_W / 2;
    const cz = SKY?.center?.[1] ?? MAP_H / 2;
    const mx = cx + (d[0] / dl) * 260 - o.pos[0];
    const mz = cz + (d[2] / dl) * 260 - o.pos[1];
    const l = Math.hypot(mx, mz) || 1;
    o.back = [mx / l, mz / l];
  }
  return o.back;
}

// La altura de la loma (sobre el piso) en (x, z) locales. Afuera, un poco
// abajo del piso (el borde queda tapado).
export function lomaY(o, x, z) {
  const b = lomaBack(o);
  if (b) {
    // (lo de atrás, apretado hacia la cresta: de a poco, sin quiebre arriba)
    const a = x * b[0] + z * b[1];
    if (a > 0) {
      const w = 1.2;
      const a2 = (a * (w * w + a * a)) / (w * w + o.ramp * a * a);
      x += b[0] * (a2 - a);
      z += b[1] * (a2 - a);
    }
  }
  const u = Math.hypot(x / (o.rx || 3.5), z / (o.rz || 2.5));
  if (u >= 1) return -0.4;
  const n = Math.sin(x * 1.7 + z * 0.9) * 0.5 + Math.sin(x * 0.6 - z * 2.1) * 0.5;
  return (o.h || 5) * Math.pow(1 - u * u, 1.5) + n * 0.18 * (1 - u);
}

let registered = false;
export function registerEsterosProps() {
  if (registered) return;
  registered = true;
  addBuilders(BUILDERS);
}
