import * as THREE from 'three';

// El escudo del Monumento: el Escudo del Ejército del Norte (1812). Un óvalo
// de quebracho con el borde de bronce, la chapa pintada (celeste arriba,
// blanca abajo, como el óvalo del escudo nacional), las manos que se
// estrechan sosteniendo la pica con el gorro frigio (en relieve, bronce) y
// los remaches. Mide ~0,7 m, la cara a +z, centro en el origen, correas
// atrás (-z).
// Mejorado (el Escudo Bendecido, el canónigo Gorriti): el sol de mayo de oro
// arriba, que brilla; las ramas de laurel por los costados y la escarapela
// con sus cintas abajo. Lo usan world/shieldModels.js y world/shieldUpModels.js.

const GEO = new Map();
const geo = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
const MATS = new WeakMap();
function mats(M) {
  let m = MATS.get(M);
  if (m) return m;
  m = {
    celeste: new THREE.MeshStandardMaterial({ color: 0x6aa6dc, roughness: 0.45 }),
    blanco: new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.9, roughness: 0.25 }),
    sol: new THREE.MeshStandardMaterial({ color: 0xf6b40e, metalness: 0.7, roughness: 0.3, emissive: 0xffa020, emissiveIntensity: 0.9 }),
    laurel: new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.85, roughness: 0.35 }),
    cinta: new THREE.MeshStandardMaterial({ color: 0x74acdf, roughness: 0.6, side: THREE.DoubleSide }),
    cintaB: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.6, side: THREE.DoubleSide }),
    gorro: new THREE.MeshStandardMaterial({ color: 0xb01c20, roughness: 0.55 }),
  };
  MATS.set(M, m);
  return m;
}
const mesh = (g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(g, mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  return o;
};
const RX = 0.3;
const RY = 0.37;
const oval = (k = 1) => {
  const s = new THREE.Shape();
  s.absellipse(0, 0, RX * k, RY * k, 0, Math.PI * 2, false, 0);
  return s;
};
// media chapa (arriba o abajo), apenas delante de la madera
const half = (top) =>
  geo(top ? 'ejTop' : 'ejBot', () => {
    const s = new THREE.Shape();
    const k = 0.86;
    s.absellipse(0, 0, RX * k, RY * k, top ? 0 : Math.PI, top ? Math.PI : Math.PI * 2, false, 0);
    s.lineTo(top ? RX * k : -RX * k, 0);
    return new THREE.ShapeGeometry(s, 20);
  });

export function ejercito(M) {
  const g = new THREE.Group();
  const C = mats(M);
  const face = geo('ejFace', () => new THREE.ExtrudeGeometry(oval(1), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 }).translate(0, 0, -0.0175));
  const rim = geo('ejRim', () => {
    const s = oval(1.06);
    s.holes.push(new THREE.Path().absellipse(0, 0, RX * 0.97, RY * 0.97, 0, Math.PI * 2, true, 0));
    return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 28 }).translate(0, 0, -0.02);
  });
  g.add(mesh(face, M.woodDark));
  g.add(mesh(rim, M.brass || C.gold));
  // la chapa: celeste arriba, blanca abajo
  g.add(mesh(half(true), C.celeste, 0, 0, 0.027));
  g.add(mesh(half(false), C.blanco, 0, 0, 0.027));
  // la pica, las manos que se estrechan (con los puños de la casaca) y el
  // gorro frigio arriba, como en el escudo de la Asamblea (en relieve)
  const metal = M.brass || C.gold;
  g.add(mesh(geo('ejPica', () => new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6)), metal, 0, 0.01, 0.034));
  for (const sx of [-1, 1]) {
    const arm = geo('ejArm', () => new THREE.CylinderGeometry(0.024, 0.028, 0.2, 8).rotateZ(Math.PI / 2 - 0.35).translate(0.1, -0.035, 0));
    const a = mesh(arm, metal, sx * 0.02, -0.1, 0.036);
    a.scale.x = sx;
    g.add(a);
    g.add(mesh(geo('ejCuff', () => new THREE.TorusGeometry(0.028, 0.008, 5, 12).rotateY(Math.PI / 2)), metal, sx * 0.13, -0.14, 0.036, 0, 0, sx * -0.35));
  }
  g.add(mesh(geo('ejClasp', () => new THREE.SphereGeometry(0.038, 12, 8).scale(1.25, 0.85, 0.55)), metal, 0, -0.1, 0.04));
  g.add(mesh(geo('ejGorro', () => new THREE.ConeGeometry(0.034, 0.075, 10).rotateZ(-0.55)), C.gorro, 0.012, 0.235, 0.036));
  // los remaches del borde
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(mesh(geo('ejRiv', () => new THREE.SphereGeometry(0.011, 6, 4)), metal, Math.cos(a) * RX * 1.015, Math.sin(a) * RY * 1.015, 0.022));
  }
  // las correas atrás
  for (const y of [-0.12, 0.12]) g.add(mesh(geo('ejStrap', () => new THREE.BoxGeometry(0.42, 0.045, 0.012)), M.leather || M.woodDark, 0, y, -0.035));
  g.userData.back = 0.05;
  return g;
}

export function ejercitoUp(g, M) {
  const C = mats(M);
  // las dos ramas de laurel que suben por los costados desde abajo (hojas de
  // a pares sobre el tallo), atadas con la escarapela
  const leaf = geo('ejLeaf', () => new THREE.SphereGeometry(0.03, 7, 4).scale(0.42, 1.25, 0.22).translate(0, 0.03, 0));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const t = -Math.PI / 2 + s * (0.18 + i * 0.205);
      const x = Math.cos(t) * RX * 1.1;
      const y = Math.sin(t) * RY * 1.08;
      const up = t + s * (Math.PI / 2);
      for (const side of [-1, 1]) g.add(mesh(leaf, C.laurel, x, y, 0.03, 0, 0, up - Math.PI / 2 + side * 0.55 + s * 0.15));
    }
  }
  // la escarapela abajo, con las dos cintas que cuelgan
  const esc = new THREE.Group();
  esc.position.set(0, -RY * 1.02, 0.045);
  esc.add(mesh(geo('ejEsc1', () => new THREE.CylinderGeometry(0.05, 0.05, 0.01, 18).rotateX(Math.PI / 2)), C.cinta));
  esc.add(mesh(geo('ejEsc2', () => new THREE.CylinderGeometry(0.033, 0.033, 0.012, 18).rotateX(Math.PI / 2)), C.cintaB, 0, 0, 0.002));
  esc.add(mesh(geo('ejEsc3', () => new THREE.CylinderGeometry(0.016, 0.016, 0.014, 12).rotateX(Math.PI / 2)), C.cinta, 0, 0, 0.004));
  for (const s of [-1, 1]) esc.add(mesh(geo('ejCinta', () => new THREE.PlaneGeometry(0.03, 0.16).translate(0, -0.08, 0)), s < 0 ? C.cinta : C.cintaB, s * 0.02, -0.02, 0.006, 0, 0, s * 0.18));
  g.add(esc);
  // el sol de mayo naciente arriba del óvalo (la cara y los rayos rectos y
  // ondulados), de oro, que brilla
  const sun = new THREE.Group();
  sun.position.set(0, RY * 0.97, 0.05);
  sun.add(mesh(geo('ejSun', () => new THREE.CylinderGeometry(0.062, 0.062, 0.022, 24).rotateX(Math.PI / 2)), C.sol));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const L = i % 2 ? 0.055 : 0.095;
    const r = mesh(geo(`ejRay${L}`, () => new THREE.BoxGeometry(L, i % 2 ? 0.01 : 0.014, 0.008).translate(L / 2, 0, 0)), C.sol, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, 0, 0, a + (i % 2 ? 0.12 : 0));
    sun.add(r);
  }
  g.add(sun);
  g.userData.glow = [...(g.userData.glow || []), sun.children[0]];
  g.userData.emblem = sun;
}
