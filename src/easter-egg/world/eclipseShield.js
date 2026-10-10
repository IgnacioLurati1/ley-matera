import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';

// El escudo de Eclipse Matero: el Escudo de los Caballeros (2026-10-10). Se
// arma con las tres piezas del mapa (config/maps/eclipse: ACT.parts): las
// tablas de quebracho del Acopio (la cara, cinco tablas en redondo), el umbo
// de bronce de la Herrería (el centro) y el zuncho de hierro de la Galería de
// los Arcos (el aro que las aprieta, remachado). Mide ~0,7 m, la cara a +z,
// centro en el origen, correas atrás (-z), como los de world/shieldModels.
// Mejorado (el Escudo de la Cúpula, world/shieldNudo): las cuatro piedras de
// los caballeros de la luz en el aro (fuego arriba, viento a la derecha, rayo
// abajo, hielo a la izquierda), cada una con su veta de luz hasta el umbo, y
// un anillo de luz alrededor del umbo. También las piezas sueltas, como se
// ven tiradas antes de llevarlas al banco (partModel).

const R = 0.33;
const GEO = new Map();
const geo = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
const MATS = new WeakMap();
function mats(M) {
  let m = MATS.get(M);
  if (m) return m;
  // el quebracho colorado: la veta de los rollizos, más rojiza
  const wood = M.log || M.woodDark;
  m = {
    quebracho: new THREE.MeshStandardMaterial({ map: wood?.map || null, color: 0x9a4a30, roughness: 0.78 }),
    quebrachoDark: new THREE.MeshStandardMaterial({ map: wood?.map || null, color: 0x5e2a1a, roughness: 0.85 }),
    // (las tablas sueltas, más claras: arriba de las tarimas del Acopio no se distinguían)
    tabla: new THREE.MeshStandardMaterial({ map: wood?.map || null, color: 0xe07a50, roughness: 0.7 }),
    tablaDark: new THREE.MeshStandardMaterial({ map: wood?.map || null, color: 0xb85a38, roughness: 0.75 }),
    tiento: new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 }),
    groove: new THREE.MeshStandardMaterial({ color: 0x1e0e08, roughness: 1 }),
    bronze: M.brass,
    iron: M.iron,
    zuncho: new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.45, metalness: 0.85 }),
  };
  MATS.set(M, m);
  return m;
}
// un brillo de piedra de caballero (uno por color, compartido). Cuánto brilla
// cada una, emparejado a ojo: el rayo, el viento y el hielo son claros y con
// el mismo número que el fuego encandilaban (el resplandor tapaba el escudo)
const GEM = new Map();
const GEM_K = { 0xff6a1a: 1.25, 0x8affb8: 0.5, 0xffe45a: 0.45, 0x9adcff: 0.5, 0xe8d8ff: 0.4 };
function gemMat(color) {
  if (!GEM.has(color)) GEM.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: GEM_K[color] ?? 0.6, roughness: 0.25, metalness: 0.1, toneMapped: true }));
  return GEM.get(color);
}
const dome = (key, r) => geo(key, () => new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));

// el largo de una tabla a esa distancia del centro (cuerda del círculo)
const chord = (x, r = R) => 2 * Math.sqrt(Math.max(0, r * r - x * x));

// las cinco tablas en redondo (cada una cortada al círculo)
function planks(key, r, w) {
  return geo(key, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
    const e = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 28 });
    // (las UV de la extrusión van en metros: la veta a lo largo de las tablas)
    const uv = e.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 1.5, uv.getX(i) * 0.4);
    return e.translate(0, 0, -w / 2);
  });
}

export function caballeros(M) {
  const X = mats(M);
  const g = new THREE.Group();
  g.add(mesh(planks('eclFace', R - 0.01, 0.034), X.quebracho, 0, 0, 0));
  // las juntas de las tablas (finitas, apenas delante de la cara)
  for (const x of [-0.19, -0.065, 0.065, 0.19]) {
    const j = mesh(boxGeo(0.008, chord(x, R - 0.015), 0.004), X.groove, x, 0, 0.0175);
    j.castShadow = false;
    g.add(j);
  }
  // el zuncho: el aro de hierro que aprieta las tablas, con sus remaches
  g.add(mesh(geo('eclZuncho', () => new THREE.TorusGeometry(R, 0.022, 8, 40)), X.iron, 0, 0, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    g.add(mesh(dome('eclRivet', 0.013), X.iron, Math.cos(a) * (R - 0.035), Math.sin(a) * (R - 0.035), 0.016));
  }
  // el umbo de bronce con su pestaña y cuatro clavos
  g.add(mesh(cylGeo(0.15, 0.15, 0.012, 24), X.bronze, 0, 0, 0.022, Math.PI / 2, 0, 0));
  g.add(mesh(dome('eclUmbo', 0.105), X.bronze, 0, 0, 0.027));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(mesh(dome('eclUmboNail', 0.012), X.bronze, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.027));
  }
  // atrás: dos flejes de hierro cruzados y las correas
  for (const y of [-0.12, 0.12]) g.add(mesh(boxGeo(chord(y, R - 0.02), 0.04, 0.01), X.iron, 0, y, -0.022));
  for (const x of [-0.11, 0.11]) g.add(mesh(boxGeo(0.045, 0.34, 0.014), M.leather, x, 0.02, -0.034));
  g.userData.back = 0.045;
  return g;
}

// Lo que le pone la mejora (world/shieldUpModels: upgradeShield). Cuatro
// hijos, uno por caballero, en el orden en que se prenden en el Nudo (la
// estación los va mostrando de a uno: ShieldUpgrade.stationShield); el anillo
// de luz va con el último.
export const ECL_ORDER = ['fuego', 'viento', 'rayo', 'hielo'];
export const ECL_COLOR = { fuego: 0xff6a1a, viento: 0x8affb8, rayo: 0xffe45a, hielo: 0x9adcff };
export function caballerosUp(g, M) {
  const X = mats(M);
  const glow = [];
  ECL_ORDER.forEach((el, i) => {
    // fuego arriba y de ahí en el sentido del reloj (visto de frente)
    const a = Math.PI / 2 - (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const grp = new THREE.Group();
    grp.name = 'cab-' + el;
    // la piedra, engarzada en el aro (un engarce de bronce y la piedra arriba)
    grp.add(mesh(cylGeo(0.042, 0.042, 0.016, 12), X.bronze, c * R, s * R, 0.02, Math.PI / 2, 0, 0));
    const gem = mesh(geo('eclGem', () => new THREE.OctahedronGeometry(0.036, 0).scale(1, 1.25, 0.6)), gemMat(ECL_COLOR[el]), c * R, s * R, 0.036, 0, 0, a - Math.PI / 2);
    gem.castShadow = false;
    grp.add(gem);
    glow.push(gem);
    // la veta de luz por la junta de las tablas, del umbo a la piedra
    const len = R - 0.2;
    const vein = mesh(boxGeo(0.012, len, 0.004), gemMat(ECL_COLOR[el]), c * (0.155 + len / 2), s * (0.155 + len / 2), 0.0195, 0, 0, a - Math.PI / 2);
    vein.castShadow = false;
    grp.add(vein);
    glow.push(vein);
    if (i === 3) {
      // el anillo de luz alrededor del umbo (los cuatro juntos: blanco violáceo)
      const ring = mesh(geo('eclRing', () => new THREE.TorusGeometry(0.128, 0.007, 6, 40)), gemMat(0xe8d8ff), 0, 0, 0.03);
      ring.castShadow = false;
      grp.add(ring);
      glow.push(ring);
    }
    g.add(grp);
  });
  g.userData.glow = [...(g.userData.glow || []), ...glow];
  g.userData.emblem = g.children.find((o) => o.name === 'cab-hielo');
}

// Las piezas sueltas (tiradas en el piso de su isla hasta que alguien las
// lleva al banco del Claro). El origen va en el piso; giran enteras.
export function partModel(id, M) {
  const X = mats(M);
  const o = new THREE.Group();
  if (id === 'quebracho') {
    // tres tablas de quebracho cruzadas, atadas con un tiento
    o.add(mesh(boxGeo(0.86, 0.04, 0.15), X.tabla, 0, 0.02, -0.085, 0, 0.05, 0));
    o.add(mesh(boxGeo(0.82, 0.04, 0.14), X.tablaDark, 0.02, 0.02, 0.085, 0, -0.04, 0));
    o.add(mesh(boxGeo(0.8, 0.04, 0.15), X.tabla, 0, 0.06, 0, 0, 0.5, 0));
    for (const x of [-0.24, 0.24]) o.add(mesh(boxGeo(0.035, 0.012, 0.18), X.tiento, x * Math.cos(0.5), 0.086, -x * Math.sin(0.5), 0, 0.5, 0));
  } else if (id === 'bronce') {
    // el umbo de bronce boca abajo (la cúpula para arriba), con la pestaña y los clavos
    o.add(mesh(cylGeo(0.19, 0.19, 0.016, 24), X.bronze, 0, 0.008, 0));
    o.add(mesh(dome('eclUmboBig', 0.13), X.bronze, 0, 0.016, 0, -Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      o.add(mesh(cylGeo(0.012, 0.012, 0.012, 6), X.bronze, Math.cos(a) * 0.165, 0.021, Math.sin(a) * 0.165));
    }
    // (más grande que puesto en el escudo: suelto en el piso de la Herrería se perdía)
    o.scale.setScalar(1.3);
  } else if (id === 'zuncho') {
    // el aro de hierro acostado, con sus remaches y un pedazo de fleje suelto
    // (un hierro un poco más claro que el del mundo: negro en el piso no se leía)
    o.add(mesh(geo('eclZunchoPart', () => new THREE.TorusGeometry(0.3, 0.024, 8, 40)), X.zuncho, 0, 0.024, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      o.add(mesh(cylGeo(0.014, 0.014, 0.014, 6), X.bronze, Math.cos(a) * 0.3, 0.051, Math.sin(a) * 0.3));
    }
    o.add(mesh(boxGeo(0.34, 0.008, 0.045), X.zuncho, 0.02, 0.004, 0.05, 0, 0.6, 0));
  } else return null;
  return o;
}
