import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { ejercitoUp } from './monumentoShield';
import { caballerosUp } from './eclipseShield';

// El escudo de cuero de yacaré de los esteros (le faltaba el suyo: usaba el
// del molino) y lo que le agrega la mejora a cada escudo (world/ShieldUpgrade):
// es el mismo escudo con lo que le pone su mejora. Misma convención que
// world/shieldModels: la cara mira a +z, centro en el origen, correas atrás.
// userData de lo mejorado: hot (las partes que se ponen al rojo en el penal y
// el castillo), glow (lo que brilla solo: la bombita del boyero, los ojos del
// dragón), vent (de dónde sale el vapor: la torre).

const GEO = new Map();
const geo = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
// materiales propios, uno solo por sesión (así no se compila uno por escudo)
const MAT = new Map();
const mat = (key, make) => {
  if (!MAT.has(key)) MAT.set(key, make());
  return MAT.get(key);
};
const std = (o) => new THREE.MeshStandardMaterial(o);

const dome = (key, r) => geo(key, () => new THREE.SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));

function ring(key, r, tube, seg = 32, arc = Math.PI * 2) {
  return geo(key, () => new THREE.TorusGeometry(r, tube, 6, seg, arc));
}

// óvalo con el borde apenas desparejo (el cuero)
function oval(key, rx, ry, amp, seed) {
  return geo(key, () => {
    const s = new THREE.Shape();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + amp * Math.sin(a * 4 + seed) * Math.cos(a * 3 - seed);
      const x = Math.cos(a) * rx * k;
      const y = Math.sin(a) * ry * k;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return new THREE.ShapeGeometry(s);
  });
}

const M2 = (M) => ({
  yacare: mat('yacare', () => std({ color: 0x3e4428, roughness: 0.78, metalness: 0.05 })),
  belly: mat('belly', () => std({ color: 0x8a8254, roughness: 0.8 })),
  lapacho: mat('lapacho', () => std({ color: 0xb06a50, roughness: 0.85, map: M.woodDark?.map || null })),
  bone: mat('bone', () => std({ color: 0xd9ccaa, roughness: 0.6 })),
  tooth: mat('tooth', () => std({ color: 0xefe6cc, roughness: 0.4 })),
  steelBlue: mat('steelBlue', () => std({ color: 0x3c4c6c, roughness: 0.32, metalness: 0.9 })),
  porcelain: mat('porcelain', () => std({ color: 0xf2efe6, roughness: 0.25, metalness: 0.05 })),
  spark: mat('spark', () => new THREE.MeshBasicMaterial({ color: 0x9ad0ff, toneMapped: false })),
  soot: mat('soot', () => std({ color: 0x141210, roughness: 0.7, metalness: 0.5 })),
  gold: mat('gold', () => std({ color: 0xd8a83a, roughness: 0.28, metalness: 1 })),
  dragonEye: mat('dragonEye', () => new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false })),
  ember: mat('ember', () => std({ color: 0x3a1408, roughness: 0.5, metalness: 0.4, emissive: 0xff4a10, emissiveIntensity: 0.6 })),
});

function straps(g, M, z) {
  for (const x of [-0.11, 0.11]) g.add(mesh(boxGeo(0.045, 0.34, 0.014), M.leather, x, 0.02, z - 0.008));
}

// esteros: una tabla de lapacho ovalada con el cuero de yacaré encima (las
// escamas del lomo en hileras), cosido con tientos
export function yacare(M) {
  const X = M2(M);
  const g = new THREE.Group();
  const board = mesh(cylGeo(0.3, 0.3, 0.03, 26), X.lapacho, 0, 0, -0.02, Math.PI / 2, 0, 0);
  board.scale.set(0.86, 1, 1.12);
  g.add(board);
  const hide = mesh(oval('yacHide', 0.25, 0.31, 0.05, 0.7), X.yacare, 0, 0, 0.0);
  hide.castShadow = false;
  g.add(hide);
  // la panza clara al medio
  const belly = mesh(oval('yacBelly', 0.1, 0.25, 0.04, 2.1), X.belly, 0, -0.01, 0.003);
  belly.castShadow = false;
  g.add(belly);
  // las escamas del lomo: tres hileras de lomitos
  const scute = dome('yacScute', 0.024);
  for (const x of [-0.16, 0.16]) {
    for (let i = 0; i < 6; i++) {
      const s = mesh(scute, X.yacare, x + (i % 2 ? 0.012 : -0.012), -0.22 + i * 0.088, 0.004);
      s.scale.set(0.9, 1.4, 0.8);
      s.castShadow = false;
      g.add(s);
    }
  }
  for (let i = 0; i < 5; i++) {
    const s = mesh(scute, X.belly, 0, -0.18 + i * 0.09, 0.005);
    s.scale.set(1.3, 0.8, 0.5);
    s.castShadow = false;
    g.add(s);
  }
  // los tientos del borde
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(mesh(boxGeo(0.012, 0.05, 0.008), M.leather, Math.cos(a) * 0.245, Math.sin(a) * 0.3, 0.006, 0, 0, a - Math.PI / 2));
  }
  straps(g, M, -0.035);
  g.userData.back = 0.05;
  return g;
}

// ---------------- la mejora de cada mapa ----------------

// molino: remachado en la prensa de la Sala de Máquinas. Un aro de hierro
// grueso con remaches, dos flejes cruzados y el centro reforzado.
function molinoUp(g, M) {
  const hot = [];
  const add = (m) => {
    g.add(m);
    return m;
  };
  g.add(mesh(ring('upTrqHoop', 0.315, 0.022), M.iron, 0, 0, 0.012));
  const rivet = dome('upRivet', 0.016);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    hot.push(add(mesh(rivet, M.iron, Math.cos(a) * 0.315, Math.sin(a) * 0.315, 0.03)));
  }
  for (const y of [-0.12, 0.12]) {
    g.add(mesh(boxGeo(0.6, 0.045, 0.012), M.iron, 0, y, 0.024));
    for (const x of [-0.26, -0.09, 0.09, 0.26]) hot.push(add(mesh(rivet, M.iron, x, y, 0.03)));
  }
  g.add(mesh(dome('upTrqBoss', 0.075), M.iron, 0, 0, 0.018));
  g.add(mesh(ring('upTrqBossRing', 0.078, 0.01, 20), M.brass, 0, 0, 0.02));
  g.userData.hot = hot;
}

// granja: alambre de púa dando vueltas, tres aisladores de porcelana arriba,
// la bobina de cobre al medio y una bombita que chispea
function granjaUp(g, M) {
  const X = M2(M);
  for (const y of [-0.16, 0.05, 0.25]) {
    g.add(mesh(boxGeo(0.66, 0.008, 0.14), M.metal, 0, y, 0));
    for (let i = 0; i < 7; i++) g.add(mesh(boxGeo(0.006, 0.03, 0.006), M.metal, -0.28 + i * 0.093, y, 0.07, 0, 0, 0.8));
  }
  for (const x of [-0.2, 0, 0.2]) {
    g.add(mesh(cylGeo(0.03, 0.036, 0.06, 10), X.porcelain, x, 0.36, 0.03));
    g.add(mesh(cylGeo(0.042, 0.042, 0.012, 10), X.porcelain, x, 0.35, 0.03));
  }
  // la bobina de cobre
  for (let i = 0; i < 5; i++) g.add(mesh(ring('upCoil', 0.07 - i * 0.008, 0.007, 18), M.copper, 0, -0.02, 0.07 + i * 0.006));
  const bulb = mesh(geo('upBulb', () => new THREE.SphereGeometry(0.022, 10, 8)), X.spark, 0, -0.02, 0.11);
  bulb.castShadow = false;
  g.add(bulb);
  g.userData.glow = [bulb];
}

// penal: la chapa templada azul, puntas en los barrotes y una cadena cruzada
function penalUp(g, M) {
  const X = M2(M);
  const plate = mesh(boxGeo(0.46, 0.6, 0.008), X.steelBlue, 0, 0, 0.012);
  g.add(plate);
  const hot = [plate];
  for (const x of [-0.15, 0, 0.15]) {
    for (const s of [1, -1]) g.add(mesh(geo('upSpike', () => new THREE.ConeGeometry(0.022, 0.07, 8)), M.bars || M.iron, x, s * 0.405, 0.026, s < 0 ? Math.PI : 0, 0, 0));
  }
  // la cadena en diagonal
  const link = ring('upLink', 0.024, 0.0065, 12);
  for (let i = 0; i < 11; i++) {
    const k = i / 10;
    g.add(mesh(link, M.iron, -0.24 + k * 0.48, 0.25 - k * 0.5 - Math.sin(k * Math.PI) * 0.06, 0.06, 0, i % 2 ? Math.PI / 2 : 0, -0.8));
  }
  g.add(mesh(ring('upShackle', 0.07, 0.014, 18), M.iron, 0, 0.02, 0.07));
  g.userData.hot = hot;
}

// esteros: placas de hueso (los osteodermos del yacaré viejo) y dientes en el borde
function esterosUp(g, M) {
  const X = M2(M);
  const plate = geo('upOsteo', () => new THREE.SphereGeometry(0.035, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));
  const plates = [];
  for (let r = 0; r < 4; r++) {
    for (const s of [-1, 1]) {
      const p = mesh(plate, X.bone, s * (0.07 + (r % 2) * 0.03), -0.18 + r * 0.12, 0.008);
      p.scale.set(1, 1.35, 0.9);
      g.add(p);
      plates.push(p);
    }
  }
  const tooth = geo('upTooth', () => new THREE.ConeGeometry(0.014, 0.06, 6));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(mesh(tooth, X.tooth, Math.cos(a) * 0.29, Math.sin(a) * 0.35, 0.0, 0, 0, a - Math.PI / 2));
  }
  const rim = mesh(ring('upYacRim', 1, 0.045, 32), X.bone, 0, 0, 0);
  rim.scale.set(0.27, 0.33, 0.3);
  g.add(rim);
  g.userData.plates = plates;
}

// torre: la tapa hervida, tiznada, con el pico de una pava silbadora de cobre
// arriba, remaches de bronce y la válvula que larga el vapor
function torreUp(g, M) {
  const X = M2(M);
  g.add(mesh(ring('upPavaRim', 0.325, 0.02, 36), M.brass, 0, 0, 0.004));
  const soot = mesh(geo('upPavaSoot', () => new THREE.CircleGeometry(0.16, 20)), X.soot, 0, 0, 0.02);
  soot.castShadow = false;
  g.add(soot);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(mesh(dome('upPavaRivet', 0.012), M.brass, Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.017));
  }
  // el pico silbador arriba, torcido hacia afuera
  const spout = new THREE.Group();
  spout.position.set(0.1, 0.27, 0.04);
  spout.rotation.z = -0.5;
  spout.add(mesh(cylGeo(0.018, 0.03, 0.14, 10), M.copper, 0, 0.07, 0));
  spout.add(mesh(cylGeo(0.026, 0.02, 0.03, 10), M.copper, 0, 0.15, 0));
  g.add(spout);
  const vent = new THREE.Object3D();
  vent.position.set(0, 0.17, 0);
  spout.add(vent);
  g.add(mesh(cylGeo(0.03, 0.03, 0.03, 10), M.copper, -0.13, -0.18, 0.03, Math.PI / 2, 0, 0));
  g.userData.vent = vent;
}

// castillo: el borde de oro, el umbo convertido en una cabeza de dragón de
// bronce con los ojos encendidos y las alas labradas a los costados
function castilloUp(g, M) {
  const X = M2(M);
  // clavos de oro nuevos en el borde
  for (const [x, y] of [[-0.25, 0.12], [0.25, 0.12], [-0.13, -0.24], [0.13, -0.24], [0, 0.32]]) g.add(mesh(dome('upDrgNail', 0.016), X.gold, x, y, 0.024));
  const head = new THREE.Group();
  head.position.set(0, 0.04, 0.03);
  head.add(mesh(dome('upDrgSkull', 0.075), X.gold, 0, 0, 0));
  const snout = mesh(geo('upDrgSnout', () => new THREE.ConeGeometry(0.045, 0.1, 8).rotateX(Math.PI / 2)), X.gold, 0, -0.035, 0.07);
  snout.rotation.x = 0.35;
  head.add(snout);
  for (const s of [-1, 1]) {
    head.add(mesh(geo('upDrgHorn', () => new THREE.ConeGeometry(0.014, 0.1, 6)), X.gold, s * 0.055, 0.075, 0.01, -0.5, 0, -s * 0.5));
    const eye = mesh(geo('upDrgEye', () => new THREE.SphereGeometry(0.011, 8, 6)), X.dragonEye, s * 0.03, 0.02, 0.066);
    eye.castShadow = false;
    head.add(eye);
    g.userData.glow = [...(g.userData.glow || []), eye];
    // las alas labradas: tres plumas de oro que se abren al costado
    for (let i = 0; i < 3; i++) g.add(mesh(boxGeo(0.16 - i * 0.03, 0.022, 0.01), X.gold, s * (0.14 + i * 0.012), 0.12 - i * 0.07, 0.022, 0, 0, s * (0.35 - i * 0.25)));
  }
  g.add(head);
  // la lengua de fuego que baja hacia la punta (brasa: se prende con la carga)
  const flame = mesh(geo('upDrgFlame', () => new THREE.ConeGeometry(0.035, 0.2, 6).rotateZ(Math.PI)), X.ember, 0, -0.16, 0.024);
  flame.scale.z = 0.35;
  g.add(flame);
  g.userData.hot = [flame];
  g.userData.emblem = head;
}

const UP = { molino: molinoUp, granja: granjaUp, penal: penalUp, esteros: esterosUp, torre: torreUp, castillo: castilloUp, monumento: ejercitoUp, eclipse: caballerosUp };

// Le pone al escudo recién armado lo de su mejora (lo llama shieldModel).
export function upgradeShield(g, M, mapId) {
  (UP[mapId] || molinoUp)(g, M);
  g.userData.up = true;
  return g;
}
