import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, boxGeo, cylGeo } from './props';
import { yacare, upgradeShield } from './shieldUpModels';
import { ejercito } from './monumentoShield';
import { caballeros } from './eclipseShield';

// El escudo armable de cada mapa, hecho con las tres piezas que se juntan
// (config/maps/*: ACT.parts y ACT.shield). Mide unos 0,7 m; la cara mira a +z,
// el centro queda en el origen y las correas para colgarlo van atrás (-z).
// userData.back: cuánto sobresale para atrás (para apoyarlo en la mesa o en la
// espalda sin que se meta adentro). Usa los materiales del mundo (M).

// geometrías propias, una sola vez por sesión (como las de props)
const GEO = new Map();
const geo = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};

// un círculo con el borde desparejo (un cuero crudo, una mancha)
function ragged(key, r, n, amp, seed) {
  return geo(key, () => {
    const s = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = r * (1 + amp * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed * 1.7));
      if (i === 0) s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
      else s.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    }
    return new THREE.ShapeGeometry(s);
  });
}

// una cúpula que mira a +z (el umbo, la tapa)
const dome = (key, r) => geo(key, () => new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));

// las dos correas de atrás, para colgarlo
function straps(g, M, z) {
  for (const x of [-0.11, 0.11]) g.add(mesh(boxGeo(0.045, 0.34, 0.014), M.leather, x, 0.02, z - 0.008));
}

// molino: la tapa de hierro de una olla con un cuero crudo encima, cosido con
// tientos, sobre dos listones de tranquera
function tranquera(M) {
  const g = new THREE.Group();
  for (const x of [-0.13, 0.13]) g.add(mesh(boxGeo(0.11, 0.74, 0.03), M.woodDark, x, 0, -0.03, 0, 0, x * 0.2));
  g.add(mesh(boxGeo(0.66, 0.09, 0.028), M.woodDark, 0, -0.18, -0.045, 0, 0, 0.05));
  g.add(mesh(cylGeo(0.3, 0.3, 0.022, 28), M.iron, 0, 0, 0, Math.PI / 2, 0, 0));
  g.add(mesh(geo('trqRim', () => new THREE.TorusGeometry(0.3, 0.012, 6, 32)), M.iron, 0, 0, 0.011));
  const hide = mesh(ragged('trqHide', 0.26, 22, 0.07, 1.3), M.leather, 0, 0, 0.013);
  hide.castShadow = false;
  g.add(hide);
  // los tientos: puntadas alrededor del borde
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(mesh(boxGeo(0.014, 0.06, 0.008), M.leather, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.016, 0, 0, a - Math.PI / 2));
  }
  // la manija de la tapa, envuelta en tiento
  g.add(mesh(geo('trqHandle', () => new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI)), M.iron, 0, -0.02, 0.012, Math.PI / 2, 0, 0));
  g.add(mesh(cylGeo(0.016, 0.016, 0.07, 8), M.leather, 0, -0.02, 0.062, 0, 0, Math.PI / 2));
  straps(g, M, -0.045);
  g.userData.back = 0.07;
  return g;
}

// granja: atados de paja parados, la arpillera adelante y el alambre que los ata
function paja(M) {
  const g = new THREE.Group();
  const hay = M.hay || M.sack;
  for (let i = 0; i < 6; i++) {
    const x = -0.25 + i * 0.1;
    const h = 0.66 + ((i * 37) % 5) * 0.015;
    g.add(mesh(cylGeo(0.055, 0.05, h, 8), hay, x, ((i * 13) % 3) * 0.01, 0, 0, 0, (i - 2.5) * 0.015));
  }
  g.add(mesh(boxGeo(0.5, 0.44, 0.012), M.sack, 0.01, 0.02, 0.058, 0, 0, 0.04));
  // el alambre, dando la vuelta a todos los atados
  for (const y of [-0.24, 0.22]) {
    g.add(mesh(boxGeo(0.64, 0.01, 0.136), M.metal, 0, y, 0));
    g.add(mesh(geo('pajaKnot', () => new THREE.TorusGeometry(0.018, 0.005, 5, 10)), M.metal, 0.2, y, 0.07));
  }
  straps(g, M, -0.06);
  g.userData.back = 0.08;
  return g;
}

// penal: la chapa de un catre con tres barrotes soldados y un grillete colgando
function barrotes(M) {
  const g = new THREE.Group();
  const bars = M.bars || M.iron;
  g.add(mesh(boxGeo(0.5, 0.64, 0.012), M.rust || M.metal, 0, 0, 0));
  for (const [x, y] of [[-0.22, -0.29], [0.22, -0.29], [-0.22, 0.29], [0.22, 0.29], [-0.22, 0], [0.22, 0]]) g.add(mesh(cylGeo(0.012, 0.012, 0.012, 6), M.iron, x, y, 0.008, Math.PI / 2, 0, 0));
  for (const x of [-0.15, 0, 0.15]) g.add(mesh(cylGeo(0.018, 0.018, 0.74, 8), bars, x, 0, 0.026));
  for (const y of [-0.2, 0.2]) g.add(mesh(boxGeo(0.54, 0.035, 0.012), bars, 0, y, 0.05));
  // el grillete (de manija) y dos eslabones
  const ring = geo('barRing', () => new THREE.TorusGeometry(0.055, 0.012, 6, 14));
  const link = geo('barLink', () => new THREE.TorusGeometry(0.022, 0.007, 5, 10));
  g.add(mesh(ring, M.iron, 0.2, -0.36, 0.05, 0, 0.3, 0));
  g.add(mesh(link, M.iron, 0.17, -0.27, 0.05, 0, Math.PI / 2, 0));
  g.add(mesh(link, M.iron, 0.16, -0.23, 0.05));
  straps(g, M, -0.006);
  g.userData.back = 0.03;
  return g;
}

// torre: un cuero de potro overo en redondo, la tapa de la pava de umbo y la
// correa del rebenque de borde (y cruzada)
function tapaPava(M) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.32, 0.32, 0.03, 28), M.leather, 0, 0, 0, Math.PI / 2, 0, 0));
  // las manchas blancas del overo
  for (const [x, y, r, s] of [[-0.12, 0.13, 0.11, 0.4], [0.15, -0.12, 0.08, 2.1], [-0.08, -0.19, 0.06, 3.3]]) {
    const m = mesh(ragged(`pavaSpot${s}`, r, 16, 0.18, s), M.clothWhite || M.paper, x, y, 0.016);
    m.castShadow = false;
    g.add(m);
  }
  g.add(mesh(geo('pavaRim', () => new THREE.TorusGeometry(0.32, 0.018, 6, 36)), M.leather, 0, 0, 0));
  g.add(mesh(boxGeo(0.62, 0.032, 0.008), M.leather, 0, 0, 0.018, 0, 0, 0.62));
  g.add(mesh(dome('pavaDome', 0.11), M.metal, 0, 0, 0.015));
  g.add(mesh(cylGeo(0.022, 0.028, 0.035, 10), M.black || M.iron, 0, 0, 0.13, Math.PI / 2, 0, 0));
  straps(g, M, -0.015);
  g.userData.back = 0.04;
  return g;
}

// castillo: escudo de caballero (tabla de algarrobo en punta, borde y umbo de bronce)
function heaterShape(k) {
  const s = new THREE.Shape();
  s.moveTo(-0.28 * k, 0.34 * k);
  s.lineTo(0.28 * k, 0.34 * k);
  s.lineTo(0.28 * k, 0.06 * k);
  s.quadraticCurveTo(0.27 * k, -0.2 * k, 0, -0.39 * k);
  s.quadraticCurveTo(-0.27 * k, -0.2 * k, -0.28 * k, 0.06 * k);
  s.closePath();
  return s;
}
function caballero(M) {
  const g = new THREE.Group();
  const face = geo('knFace', () => {
    const e = new THREE.ExtrudeGeometry(heaterShape(1), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 });
    // (las UV de la extrusión van en metros: la veta del algarrobo, a lo largo)
    return e.translate(0, 0, -0.0175);
  });
  const rim = geo('knRim', () => new THREE.ExtrudeGeometry(heaterShape(1.07), { depth: 0.02, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.035));
  g.add(mesh(face, M.woodDark, 0, 0, 0));
  g.add(mesh(rim, M.brass, 0, 0, 0));
  // el respaldo de madera (de atrás se veía el bronce del borde, liso)
  g.add(mesh(face, M.woodDark, 0, 0, -0.032));
  g.add(mesh(dome('knBoss', 0.085), M.brass, 0, 0.03, 0.023));
  // los clavos de bronce en las esquinas y la punta
  for (const [x, y] of [[-0.22, 0.28], [0.22, 0.28], [-0.2, -0.05], [0.2, -0.05], [0, -0.3]]) g.add(mesh(dome('knNail', 0.014), M.brass, x, y, 0.023));
  straps(g, M, -0.035);
  g.userData.back = 0.05;
  return g;
}

const BUILD = { molino: tranquera, granja: paja, penal: barrotes, esteros: yacare, torre: tapaPava, castillo: caballero, monumento: ejercito, eclipse: caballeros };
// (2026-10-10, Eclipse: el suyo; globalThis.__mduOldEclEscudo: el del molino, como antes)
if (globalThis.__mduOldEclEscudo === true) BUILD.eclipse = tranquera;

// Las piezas del escudo (decenas: barrotes, clavos, tientos) en una malla por
// material: se ve igual y es una llamada de dibujo por material en vez de una
// por pieza (el de barrotes del penal tenía 86, en cada pasada). Lo que brilla
// aparte (userData.glow) y lo que tiene hijos queda suelto; si un material no
// se puede juntar (atributos distintos), sus piezas quedan como estaban.
function mergeParts(g) {
  g.updateMatrixWorld(true);
  // (las piezas, en el marco del escudo: por si el armado lo giró o lo escaló)
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const keep = new Set(g.userData.glow || []);
  const by = new Map();
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || keep.has(o) || Array.isArray(o.material) || o.geometry.morphAttributes?.position) return;
    for (let p = o.parent; p && p !== g; p = p.parent) if (keep.has(p)) return;
    const L = by.get(o.material) || [];
    L.push(o);
    by.set(o.material, L);
  });
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    let geo = null;
    try {
      const geos = list.map((o) => {
        const src = o.geometry;
        const ge = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) {
          if (!src.attributes[k]) throw new Error('sin ' + k);
          ge.setAttribute(k, src.attributes[k]);
        }
        if (src.index) ge.setIndex(src.index);
        // (copia: las geometrías vienen del caché y las usan otros escudos)
        const flat = ge.index ? ge.toNonIndexed() : ge.clone();
        return flat.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      });
      geo = mergeGeometries(geos);
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = list.some((o) => o.castShadow);
    m.receiveShadow = list.some((o) => o.receiveShadow);
    for (const o of list) o.removeFromParent();
    g.add(m);
  }
}

// up: el escudo mejorado de ese mapa (world/shieldUpModels, world/ShieldUpgrade)
export function shieldModel(M, mapId, up = false) {
  const g = (BUILD[mapId] || tranquera)(M);
  // (antes de la mejora: lo que suma upgradeShield queda en piezas sueltas)
  mergeParts(g);
  if (up) upgradeShield(g, M, mapId);
  g.name = 'escudo';
  return g;
}
