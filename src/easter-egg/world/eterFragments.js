import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Los pedazos de los mapas que flotan alrededor de la isla del Éter (La Gran
// Guerra): una maqueta de lo que más se reconoce de cada mapa, parada sobre
// una roca en punta. De lejos se lee la silueta y lo que brilla, así que cada
// uno tiene su luz propia (ventanas, el fuego del barbacuá, el reflector, el
// remolino, las luciérnagas) y sus materiales un poco encendidos (en el Éter
// casi no llega luz a 60 m).
//  · el molino: el molino yerbatero de Santa Ana (el galpón de ladrillo con el
//    frente verde y el cartel, el barbacuá con su chimenea que humea, la
//    capilla, las bolsas de yerba y el camión) sobre tierra colorada.
//  · la tapera: el establo colorado de techo quebrado, el silo, el yerbal con
//    las cinco plantas que brillan, una torre-mate, el espantapájaros, el
//    cuervo en la cumbrera y la tapera en ruinas.
//  · el penal: el pabellón encalado con rejas, la garita con el reflector que
//    barre, el muro y el muelle, en una isla rodeada de agua negra.
//  · la torre: los pisos de arcadas, cada tanda de un mapa, la escalera de oro
//    y el remolino violeta que la rodea.
//  · el estero: agua negra con irupés, el rancho sobre pilotes con techo de
//    paja, palmeras, el algarrobo con las cintas coloradas y la cruz del Gil,
//    el pajonal del borde y las luciérnagas.
// Cada pedazo es un grupo: el primer hijo es el cono de roca (sobre él se
// arma el borde que brilla del color del mapa) y userData.tick(dt, t) mueve
// lo que se mueve. Todo lo quieto va junto en una malla por material.

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpV = new THREE.Vector3();

// dónde flota cada uno (respecto del medio de la isla) y el color de su borde:
// lejos (a unos 64 m), afuera de por donde vuela el dragón (hasta 40 m) y
// lejos del camino con el que llega al Éter; ninguno del lado del coloso (-z)
export const FRAGMENTS = [
  { id: 'molino', name: 'el molino', at: [-58, 7, -26], rim: 0xffc070 },
  { id: 'tapera', name: 'la tapera', at: [60, 9, -28], rim: 0xa8e060 },
  { id: 'penal', name: 'el penal', at: [-62, 6, 30], rim: 0x80b8ff },
  { id: 'torre', name: 'la torre', at: [52, 3, 44], rim: 0xd0a0ff },
  { id: 'esteros', name: 'el estero', at: [4, 5, 66], rim: 0x6ae0c0 },
];

// ---------------- armado ----------------
// Junta geometrías por material y al final hace una malla por material.
class Kit {
  constructor() {
    this.parts = new Map();
  }

  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(tmpM);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }

  // Caja con las texturas a escala (tile metros por repetición).
  box(w, h, d, mat, x, y, z, ry = 0, tile = 2, rx = 0, rz = 0) {
    return this.add(boxUV(w, h, d, tile), mat, x, y, z, rx, ry, rz);
  }

  build(group) {
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      group.add(m);
    }
    this.parts.clear();
  }
}

// Una caja con las UV en metros (una repetición cada `tile`).
function boxUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // caras: +x, -x, +y, -y, +z, -z (cuatro vértices cada una)
  const size = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * size[f][0]) / tile, (uv.getY(i) * size[f][1]) / tile);
    }
  }
  return g;
}

// Techo a dos aguas (el triángulo del frente queda adentro de las paredes):
// un prisma de largo L, ancho W y alto H, con la cumbrera a lo largo de x.
function gable(L, W, H) {
  return prism(L, [[-W / 2, 0], [W / 2, 0], [0, H]]);
}

// Un prisma de largo L (a lo largo de x) con el perfil pts ([z, y], de frente).
function prism(L, pts) {
  const s = new THREE.Shape();
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  g.translate(0, 0, -L / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// Un faldón de techo (losa inclinada) de largo L (en x), bajando hacia +z.
function slope(kit, mat, L, run, rise, x, y, z, side = 1, t = 0.14, tile = 2) {
  const len = Math.hypot(run, rise);
  const a = Math.atan2(rise, run);
  kit.box(L, t, len, mat, x, y + rise / 2, z + (side * run) / 2, 0, tile, side * a);
}

// Materiales propios del pedazo: los del mapa (con su textura y relieve) un
// poco prendidos, para que se lean en lo oscuro del Éter.
function lit(base, o = {}) {
  const c = new THREE.Color(o.c ?? (base?.color ? base.color.getHex() : 0xffffff));
  const m = new THREE.MeshStandardMaterial({
    map: o.noMap ? null : base?.map || null,
    normalMap: base?.normalMap || null,
    color: c,
    roughness: o.r ?? base?.roughness ?? 0.9,
    metalness: o.m ?? base?.metalness ?? 0,
    emissive: c.clone().multiplyScalar(o.lift ?? 0.22),
    emissiveMap: o.noMap ? null : base?.map || null,
    side: o.side ?? THREE.FrontSide,
  });
  if (base?.normalScale) m.normalScale.copy(base.normalScale);
  return m;
}
const glow = (hex, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, fog: false });
const additive = (hex, opacity) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });

// Un cartel pintado (el del molino).
function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 96);
  x.strokeStyle = fg;
  x.lineWidth = 6;
  x.strokeRect(8, 8, 496, 80);
  x.fillStyle = fg;
  x.font = '700 40px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// La roca en punta de abajo y la tapa de arriba (del material del mapa).
function rockChunk(rock, cap, r, h, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geo = new THREE.ConeGeometry(r, h, 20, 6, true);
  const p = geo.attributes.position;
  const ph = rnd() * 6;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const y = p.getY(i);
    const k = 1 + Math.sin(a * 7 + y * 0.6 + ph) * 0.1 + Math.sin(a * 13 + y * 1.3) * 0.05;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, rock);
  m.rotation.x = Math.PI;
  m.position.y = -h / 2;
  const grp = new THREE.Group();
  grp.add(m);
  // la tapa, con el borde desgranado como la roca
  const top = new THREE.CircleGeometry(r * 1.02, 40);
  const tp = top.attributes.position;
  const tuv = top.attributes.uv;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const y = tp.getY(i);
    const a = Math.atan2(y, x);
    const k = Math.hypot(x, y) > r * 0.9 ? 1 + Math.sin(a * 7 + ph) * 0.1 : 1;
    tp.setXY(i, x * k, y * k);
    tuv.setXY(i, (x * k) / 2, (y * k) / 2);
  }
  top.rotateX(-Math.PI / 2);
  const capM = new THREE.Mesh(top, cap);
  grp.add(capM);
  // unas piedras colgando abajo y otras sueltas en el borde
  const kit = new Kit();
  const dode = new THREE.DodecahedronGeometry(1, 0);
  for (let k = 0; k < 7; k++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.25 + rnd() * 0.45);
    kit.add(dode, rock, Math.cos(a) * d, -h * (0.35 + rnd() * 0.35), Math.sin(a) * d, rnd() * 3, rnd() * 3, 0, 0.6 + rnd(), 1.2 + rnd() * 1.4, 0.6 + rnd());
  }
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2;
    kit.add(dode, rock, Math.cos(a) * r * 0.97, 0.05, Math.sin(a) * r * 0.97, rnd() * 3, rnd() * 3, 0, 0.35 + rnd() * 0.4, 0.25 + rnd() * 0.3, 0.35 + rnd() * 0.4);
  }
  kit.build(grp);
  return grp;
}

// ---------------- los cinco ----------------
export function buildFragments(g) {
  const M = g.world.M;
  const rock = M.caveRock || M.stoneDark;
  const out = [];
  for (const [i, F] of FRAGMENTS.entries()) {
    const f = BUILD[F.id](g, M, rock, i);
    f.userData.frag = F;
    out.push(f);
  }
  return out;
}

const BUILD = {
  // El molino yerbatero de Santa Ana.
  molino(g, M, rock, seed) {
    const R = 10;
    const earth = lit(M.dirt || M.ground, { c: 0xb0543a, lift: 0.18 });
    const f = rockChunk(rock, earth, R, 14, seed + 11);
    const K = new Kit();
    const brick = lit(M.brick, { lift: 0.24 });
    const soot = lit(M.brickSoot || M.brick, { c: 0x6a5a50, lift: 0.18 });
    const green = lit(M.plasterGreen, { lift: 0.26 });
    const white = lit(M.plasterWhite, { lift: 0.3 });
    const tin = lit(M.roofTin || M.metal, { c: 0x9aa0a0, r: 0.55, m: 0.5, lift: 0.18, side: THREE.DoubleSide });
    const terra = lit(M.terracotta || M.redPaint, { c: 0xa0502c, lift: 0.2 });
    const wood = lit(M.woodDark, { lift: 0.2 });
    const sack = lit(M.sackYerba || M.sack, { lift: 0.24 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0a0605 });
    const win = glow(0xffc070, 1.5);
    const ember = glow(0xff6a1a, 2.2);
    const paint = lit(null, { c: 0x8a2a1c, r: 0.55, m: 0.3, lift: 0.2 });
    const tire = lit(null, { c: 0x141414, lift: 0 });
    // el galpón: ladrillo, el frente verde con el portón y el cartel
    K.box(11, 5, 6, brick, -1.5, 2.5, -1.8);
    K.box(11.1, 5, 0.12, green, -1.5, 2.5, 1.25);
    K.add(gable(11.1, 6.1, 1.9), brick, -1.5, 5, -1.8);
    slope(K, tin, 11.8, 3.3, 1.9, -1.5, 5, -1.8, 1);
    slope(K, tin, 11.8, 3.3, 1.9, -1.5, 5, -1.8, -1);
    K.box(2.8, 3.6, 0.1, dark, -1.5, 1.8, 1.33);
    for (const x of [-5.6, -3.7, 0.7, 2.6]) K.box(0.9, 1.1, 0.08, win, x, 3.1, 1.34);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.95), new THREE.MeshBasicMaterial({ map: signTexture('MOLINO SANTA ANA', '#e8dcb8', '#6a1a10'), toneMapped: false }));
    sign.position.set(-1.5, 4.35, 1.34);
    f.add(sign);
    // el barbacuá, con la boca del fuego y la chimenea alta
    K.box(4.4, 3.2, 4, soot, 5.3, 1.6, -2.6);
    slope(K, tin, 4.8, 4.2, 0.8, 5.3, 3.2, -4.6, 1);
    K.box(1.3, 1.5, 0.08, ember, 5.3, 0.8, -0.56);
    K.add(new THREE.CylinderGeometry(0.42, 0.62, 10, 12), brick, 6.8, 5, -4);
    K.add(new THREE.CylinderGeometry(0.56, 0.56, 0.3, 12), soot, 6.8, 10.1, -4);
    // la capilla: blanca, techo de tejas, campanario con su cruz
    K.box(2.6, 2.8, 3.6, white, -6.6, 1.4, -5.4, 0.3);
    K.add(gable(2.8, 3.8, 1.3).rotateY(Math.PI / 2), terra, -6.6, 2.8, -5.4, 0, 0.3);
    K.box(0.9, 1.1, 0.9, white, -6.1, 4.3, -4.0, 0.3);
    K.box(0.12, 0.9, 0.12, wood, -6.1, 5.3, -4.0, 0.3);
    K.box(0.55, 0.12, 0.12, wood, -6.1, 5.45, -4.0, 0.3);
    K.box(0.9, 1.6, 0.06, dark, -6.0, 0.8, -3.55, 0.3);
    // las bolsas de yerba apiladas junto al portón
    for (let k = 0; k < 9; k++) {
      const row = k < 5 ? 0 : k < 8 ? 1 : 2;
      const n = k < 5 ? k : k < 8 ? k - 5 : 0;
      K.box(0.95, 0.48, 0.62, sack, -7.4 + n * 1 + row * 0.5, 0.24 + row * 0.48, 3.2, (n % 2) * 0.12);
    }
    // el camión viejo
    K.box(2.6, 0.9, 1.6, paint, 3.2, 1.05, 4.4, 0.4);
    K.box(1.2, 1.1, 1.5, paint, 4.7, 1.4, 3.8, 0.4);
    K.box(0.06, 0.5, 1.2, win, 5.28, 1.6, 3.55, 0.4);
    for (const [dx, dz] of [[-0.9, -0.8], [-0.9, 0.8], [1.3, -0.8], [1.3, 0.8]]) {
      const c = Math.cos(0.4);
      const s = Math.sin(0.4);
      K.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), tire, 3.6 + dx * c + dz * s, 0.42, 4.1 - dx * s + dz * c, Math.PI / 2, 0.4, 0);
    }
    K.build(f);
    // el humo de la chimenea y el fuego del barbacuá que respira
    const top = new THREE.Vector3(6.8, 10.4, -4);
    f.userData.tick = (dt, t) => {
      ember.color.setRGB(1, 0.42, 0.1).multiplyScalar(2 + Math.sin(t * 7) * 0.4 + Math.sin(t * 13) * 0.2);
      if (Math.random() < dt * 5) {
        const p = f.localToWorld(tmpV.copy(top));
        g.fx.alpha?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4, { color: [0.16, 0.14, 0.14], size: 1.2, size1: 5, life: 5, alpha: 0.45, drag: 0.15 });
      }
    };
    return f;
  },

  // La tapera: el establo, el silo, el yerbal y el espantapájaros.
  tapera(g, M, rock, seed) {
    const R = 10;
    const grass = lit(M.grass || M.ground, { c: 0x6a8a3a, lift: 0.2 });
    const f = rockChunk(rock, grass, R, 12, seed + 23);
    const K = new Kit();
    const barn = lit(M.barn || M.wood, { c: 0x9a2a1a, lift: 0.26 });
    const trim = lit(null, { c: 0xe8e0d0, lift: 0.3 });
    const roof = lit(M.planksDark || M.woodDark, { c: 0x4a3a34, lift: 0.18, side: THREE.DoubleSide });
    const silo = lit(M.silo || M.metal, { c: 0xb8bcc0, r: 0.4, m: 0.6, lift: 0.18 });
    const leaf = lit(null, { c: 0x2e5a26, lift: 0.18 });
    const adobe = lit(M.adobe || M.dirt, { c: 0xb08a60, lift: 0.22 });
    const post = lit(M.woodDark, { lift: 0.18 });
    const straw = lit(M.hay || M.sack, { c: 0xd8b060, lift: 0.26 });
    const cloth = lit(null, { c: 0x6a3a2a, lift: 0.2, side: THREE.DoubleSide });
    const gourd = lit(M.gourd || M.wood, { c: 0x8a6a3a, lift: 0.22 });
    const silver = lit(null, { c: 0xd8d8d8, r: 0.25, m: 1, lift: 0.15 });
    const crow = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0a0605 });
    const win = glow(0xffc070, 1.4);
    // el establo: colorado, el techo quebrado (cuatro faldones) y el portón con la cruz blanca
    const bx = -1.8;
    const bz = -2.4;
    K.box(8, 4.2, 6.4, barn, bx, 2.1, bz);
    // (las paredes del frente con la forma del techo quebrado)
    K.add(prism(8.05, [[-3.2, 0], [3.2, 0], [1.6, 1.4], [0, 2.3], [-1.6, 1.4]]), barn, bx, 4.2, bz);
    slope(K, roof, 8.6, 1.6, 1.4, bx, 4.2, bz + 1.6, 1);
    slope(K, roof, 8.6, 1.6, 1.4, bx, 4.2, bz - 1.6, -1);
    slope(K, roof, 8.6, 1.7, 0.9, bx, 5.6, bz, 1);
    slope(K, roof, 8.6, 1.7, 0.9, bx, 5.6, bz, -1);
    K.box(3, 3, 0.1, dark, bx, 1.5, bz + 3.25);
    K.box(3.2, 0.16, 0.14, trim, bx, 3.05, bz + 3.3);
    for (const s of [-1, 1]) {
      K.box(0.16, 3.1, 0.14, trim, bx + s * 1.55, 1.55, bz + 3.3);
      K.box(0.14, 3.9, 0.12, trim, bx, 1.5, bz + 3.32, 0, 2, 0, s * 0.78);
    }
    K.box(1.1, 1, 0.08, win, bx, 4.8, bz + 3.22);
    // el cuervo en la cumbrera
    K.add(new THREE.SphereGeometry(0.28, 10, 8), crow, bx + 2.2, 6.75, bz, 0, 0, 0, 1, 0.8, 1.6);
    K.add(new THREE.SphereGeometry(0.16, 8, 6), crow, bx + 2.2, 7.0, bz + 0.38);
    K.add(new THREE.ConeGeometry(0.06, 0.22, 6), crow, bx + 2.2, 6.98, bz + 0.6, Math.PI / 2);
    for (const s of [-1, 1]) K.box(0.9, 0.04, 0.35, crow, bx + 2.2 + s * 0.5, 6.85, bz - 0.05, 0, 2, 0, s * 0.5);
    // el silo
    K.add(new THREE.CylinderGeometry(1.5, 1.5, 7.5, 20, 1), silo, 4.8, 3.75, -3.6);
    K.add(new THREE.SphereGeometry(1.52, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), silo, 4.8, 7.5, -3.6);
    for (let y = 0.8; y < 7.4; y += 0.5) K.box(0.5, 0.05, 0.05, post, 4.8, y, -2.05);
    // el yerbal: tres hileras, con las cinco plantas que brillan
    const ico = new THREE.IcosahedronGeometry(0.55, 1);
    const shine = [];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 7; k++) {
        const x = -6.6 + k * 1.45 + (row % 2) * 0.5;
        const z = 2.6 + row * 1.6;
        if (Math.hypot(x, z) > R - 1.2) continue;
        K.add(ico, leaf, x, 0.45, z, 0, k, 0, 1, 0.85, 1);
        if ((row * 7 + k) % 4 === 1 && shine.length < 5) shine.push(new THREE.Vector3(x, 1.2, z));
      }
    }
    // la torre-mate de la defensa: un mate enorme en un poste, con su bombilla
    K.add(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 8), post, 6.4, 1.6, 2.6);
    K.add(new THREE.SphereGeometry(0.95, 16, 12), gourd, 6.4, 4, 2.6, 0, 0, 0, 1, 1.15, 1);
    K.add(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), silver, 6.7, 5.1, 2.6, 0, 0, -0.3);
    // el espantapájaros
    K.add(new THREE.CylinderGeometry(0.07, 0.08, 3.2, 6), post, -7.4, 1.6, 0.4);
    K.box(2.2, 0.1, 0.1, post, -7.4, 2.4, 0.4);
    K.add(new THREE.SphereGeometry(0.34, 10, 8), straw, -7.4, 3.25, 0.4);
    K.add(new THREE.ConeGeometry(0.45, 0.5, 12), straw, -7.4, 3.7, 0.4);
    K.add(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 16), straw, -7.4, 3.5, 0.4);
    K.add(new THREE.ConeGeometry(0.9, 1.4, 4, 1, true), cloth, -7.4, 1.9, 0.4, 0, Math.PI / 4);
    // la tapera en ruinas: adobe roto y el techo caído
    K.box(3.2, 2.2, 2.6, adobe, 6.2, 1.1, -0.4, -0.4);
    K.box(1.4, 1.2, 0.1, adobe, 5.6, 2.7, 0.62, -0.4);
    K.box(3.4, 0.12, 2.9, roof, 6.3, 2.1, -0.5, -0.4, 2, 0.15, 0.35);
    K.box(0.8, 1.4, 0.08, dark, 6.7, 0.7, 0.74, -0.4);
    K.build(f);
    // las cinco plantas del easter egg, con su brillo
    const lights = shine.map((p, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xd8ff70, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.position.copy(p);
      s.scale.setScalar(1.3);
      s.userData.ph = i * 1.7;
      f.add(s);
      return s;
    });
    f.userData.tick = (dt, t) => {
      for (const s of lights) s.material.opacity = 0.55 + Math.sin(t * 2.2 + s.userData.ph) * 0.3;
    };
    return f;
  },

  // El penal, en su isla de agua negra.
  penal(g, M, rock, seed) {
    const R = 11;
    // (agua negra que brilla apenas: con mucho reflejo se veía un plato blanco)
    const water = new THREE.MeshStandardMaterial({ color: 0x08131c, roughness: 0.38, metalness: 0, envMapIntensity: 0.15, emissive: 0x0a2034, emissiveIntensity: 0.55 });
    const f = rockChunk(rock, water, R, 16, seed + 37);
    const K = new Kit();
    const isle = lit(M.rock || M.stoneDark, { c: 0x6a6660, lift: 0.18 });
    const wash = lit(M.whitewash || M.plasterWhite, { lift: 0.3 });
    const cell = lit(M.cellWall || M.concrete, { c: 0xa8a49a, lift: 0.22 });
    const iron = lit(null, { c: 0x2a2826, r: 0.5, m: 0.8, lift: 0.1 });
    const wood = lit(M.woodDark, { lift: 0.2 });
    const roof = lit(M.roofTin || M.metal, { c: 0x5a4a44, lift: 0.16, side: THREE.DoubleSide });
    const dark = new THREE.MeshBasicMaterial({ color: 0x07090c });
    const lamp = glow(0xfff0c0, 2.4);
    const win = glow(0xffd090, 1.2);
    // la isla (arriba del agua) y su borde de piedras
    const top = new THREE.CylinderGeometry(7.4, 7.9, 0.7, 28);
    K.add(top, isle, 0, 0.2, -0.6);
    // el pabellón de celdas: encalado, dos filas de ventanas con rejas
    K.box(9, 5, 4.6, wash, -0.6, 2.8, -2);
    K.box(9.3, 0.4, 4.9, cell, -0.6, 5.5, -2);
    for (let k = 0; k < 5; k++) {
      for (const y of [1.9, 3.8]) {
        const x = -4.2 + k * 1.8;
        K.box(0.8, 1, 0.06, k === 2 && y > 3 ? win : dark, x, y, 0.34);
        for (let b = 0; b < 4; b++) K.box(0.05, 1.05, 0.05, iron, x - 0.3 + b * 0.2, y, 0.4);
      }
    }
    K.box(1.4, 2.2, 0.08, iron, -0.6, 1.4, 0.35);
    // la garita con el reflector
    const gx = 4.6;
    const gz = 2.2;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) K.add(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), iron, gx + dx, 3.8, gz + dz);
    for (const y of [2.4, 4.8]) K.box(1.8, 0.08, 1.8, iron, gx, y, gz);
    K.box(2.4, 1.8, 2.4, cell, gx, 8.2, gz);
    K.add(new THREE.ConeGeometry(2.1, 1.3, 4), roof, gx, 9.75, gz, 0, Math.PI / 4);
    K.box(1.4, 0.6, 0.06, win, gx, 8.4, gz + 1.22);
    // el muro de atrás con los postes del alambre
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * 1.05 + (k / 10) * Math.PI * 0.9;
      const x = Math.cos(a) * 6.6;
      const z = Math.sin(a) * 6.6 - 0.6;
      K.box(1.9, 1.6, 0.35, cell, x, 1.3, z, -a + Math.PI / 2);
      K.add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), iron, x, 2.5, z);
    }
    // el muelle y el bote
    K.box(1.2, 0.14, 3.4, wood, -3.8, 0.18, 7.6, 0.2);
    for (const dz of [6.4, 8.8]) for (const dx of [-0.5, 0.5]) K.add(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), wood, -3.8 + dx, -0.2, dz);
    K.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood, -2.2, 0.15, 8.4, 0, 0.3, 0, 0.6, 0.35, 1.5);
    K.build(f);
    // el reflector: la lámpara y el haz que barre el agua
    const head = new THREE.Group();
    head.position.set(gx, 9.3, gz);
    f.add(head);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 12), lamp);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.z = 0.4;
    head.add(bulb);
    // (el haz se apaga a lo largo: parejo parecía un cono macizo)
    const fadeTex = new THREE.CanvasTexture(
      (() => {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 64;
        const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, '#000');
        gr.addColorStop(0.55, '#333');
        gr.addColorStop(1, '#fff');
        x.fillStyle = gr;
        x.fillRect(0, 0, 4, 64);
        return c;
      })(),
    );
    const beamMat = additive(0xfff0c8, 0.3);
    beamMat.alphaMap = fadeTex;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 18, 20, 1, true), beamMat);
    beam.geometry.translate(0, -9, 0);
    beam.rotation.x = -Math.PI / 2 + 0.35;
    beam.position.z = 0.5;
    beam.renderOrder = 4;
    head.add(beam);
    f.userData.tick = (dt, t) => {
      head.rotation.y = Math.sin(t * 0.45) * 1.4 + Math.PI * 0.15;
    };
    return f;
  },

  // La torre del remolino: pisos de arcadas (cada tanda de un mapa), la
  // escalera de oro y el remolino violeta alrededor.
  torre(g, M, rock, seed) {
    const R = 8;
    const stone = lit(M.castleStone || M.stone, { c: 0x8a8480, lift: 0.2 });
    const f = rockChunk(rock, stone, R, 18, seed + 51);
    const K = new Kit();
    const bands = [M.brick, M.plasterGreen, M.whitewash || M.plasterWhite, M.concreteWall || M.concrete, M.castleStone || M.stone, M.planksDark || M.woodDark, M.plasterWhite].map((m) => lit(m, { lift: 0.26 }));
    const slab = lit(M.concrete || M.stone, { c: 0x8a8680, lift: 0.18 });
    const core = new THREE.MeshBasicMaterial({ color: 0x120a18 });
    const gold = glow(0xffc050, 1.8);
    const W = 6;
    const FH = 1.9;
    const FLOORS = 7;
    K.box(W - 1.2, FLOORS * FH, W - 1.2, core, 0, (FLOORS * FH) / 2, 0);
    for (let n = 0; n < FLOORS; n++) {
      const y = n * FH;
      const mat = bands[n % bands.length];
      K.box(W + 0.5, 0.3, W + 0.5, slab, 0, y + 0.15, 0);
      // cuatro lados de arcadas: pilares y dintel
      for (let side = 0; side < 4; side++) {
        const ry = (side * Math.PI) / 2;
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        for (let k = 0; k < 4; k++) {
          const u = -W / 2 + 0.25 + k * ((W - 0.5) / 3);
          K.box(0.5, FH - 0.3, 0.5, mat, u * c + (W / 2) * s, y + 0.3 + (FH - 0.3) / 2, -u * s + (W / 2) * c, ry);
        }
        K.box(W, 0.4, 0.5, mat, (W / 2) * s, y + FH - 0.2, (W / 2) * c, ry);
        // las ventanas de oro de adentro (la luz de Francisco)
        if ((n + side) % 3 === 0) K.box(0.8, 0.8, 0.05, gold, (W / 2 - 0.57) * s, y + 1, (W / 2 - 0.57) * c, ry);
      }
    }
    // la cima con almenas
    const topY = FLOORS * FH;
    K.box(W + 0.8, 0.4, W + 0.8, slab, 0, topY + 0.2, 0);
    for (let k = 0; k < 12; k++) {
      const side = Math.floor(k / 3);
      const u = -W / 2 + 0.6 + (k % 3) * ((W - 1.2) / 2);
      const ry = (side * Math.PI) / 2;
      K.box(0.7, 0.8, 0.5, bands[4], u * Math.cos(ry) + (W / 2 + 0.15) * Math.sin(ry), topY + 0.8, -u * Math.sin(ry) + (W / 2 + 0.15) * Math.cos(ry), ry);
    }
    // la escalera divina de oro: escalones que suben dando la vuelta
    for (let k = 0; k < 26; k++) {
      const a = k * 0.42;
      const r = W / 2 + 1.1;
      K.box(1.1, 0.12, 0.45, gold, Math.cos(a) * r, 0.6 + k * 0.5, Math.sin(a) * r, -a);
    }
    K.build(f);
    // el remolino: tres cintas violetas en espiral que giran
    const swirl = new THREE.Group();
    f.add(swirl);
    const mat = additive(0xb070ff, 0.09);
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const a = u * Math.PI * 5 + (k * Math.PI * 2) / 3;
        const r = 5.2 + u * 3.2 + Math.sin(u * 9) * 0.3;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 1 + u * (topY + 5), Math.sin(a) * r));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.16 + k * 0.06, 6, false), mat);
      tube.renderOrder = 4;
      swirl.add(tube);
    }
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xd0a0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    eye.position.set(0, topY + 3, 0);
    eye.scale.setScalar(7);
    f.add(eye);
    f.userData.tick = (dt, t) => {
      swirl.rotation.y += dt * 0.9;
      eye.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.15;
    };
    return f;
  },

  // El estero: agua negra con irupés, el rancho sobre pilotes, las palmeras,
  // el algarrobo del Gil y las luciérnagas.
  esteros(g, M, rock, seed) {
    const R = 10;
    const water = new THREE.MeshStandardMaterial({ color: 0x06110f, roughness: 0.38, metalness: 0, envMapIntensity: 0.15, emissive: 0x0a2630, emissiveIntensity: 0.5 });
    const f = rockChunk(rock, water, R, 12, seed + 67);
    const K = new Kit();
    const mud = lit(M.dirtDark || M.ground, { c: 0x4a3a2a, lift: 0.18 });
    const planks = lit(M.planks || M.wood, { lift: 0.24 });
    const dark = lit(M.planksDark || M.woodDark, { lift: 0.18 });
    const paja = lit(M.hay || M.sack, { c: 0xc8a060, lift: 0.26, side: THREE.DoubleSide });
    const reed = lit(null, { c: 0x8a7c48, lift: 0.14 });
    const pad = lit(null, { c: 0x3a6a2a, lift: 0.22, side: THREE.DoubleSide });
    const frond = lit(null, { c: 0x2e5226, lift: 0.2, side: THREE.DoubleSide });
    const bark = lit(M.bark || M.woodDark, { c: 0x5a4636, lift: 0.18 });
    const crown = lit(null, { c: 0x243a1e, lift: 0.16 });
    const red = lit(null, { c: 0xb0161a, lift: 0.45, side: THREE.DoubleSide });
    const petal = glow(0xf8e8f0, 1.1);
    const win = glow(0xffb060, 1.6);
    const candle = glow(0xff3a20, 2.4);
    // el embalsado: la isla de barro y pasto flotando
    K.add(new THREE.CylinderGeometry(4.6, 5, 0.5, 20), mud, -2.6, 0.1, -2.2, 0, 0, 0, 1, 1, 0.8);
    // el rancho del pescador sobre pilotes
    const rx = 4;
    const rz = -1.5;
    for (const [dx, dz] of [[-1.5, -1.3], [1.5, -1.3], [-1.5, 1.3], [1.5, 1.3], [0, -1.3], [0, 1.3]]) K.add(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), dark, rx + dx, 0.6, rz + dz);
    K.box(3.6, 0.16, 3.2, planks, rx, 1.7, rz);
    K.box(3.2, 2.2, 2.8, planks, rx, 2.9, rz);
    K.add(gable(3.25, 2.85, 1).rotateY(Math.PI / 2), planks, rx, 4, rz);
    slope(K, paja, 3.9, 1.8, 1.4, rx, 4, rz, 1, 0.26);
    slope(K, paja, 3.9, 1.8, 1.4, rx, 4, rz, -1, 0.26);
    K.box(0.7, 0.6, 0.05, win, rx + 0.7, 3.2, rz + 1.42);
    for (let k = 0; k < 5; k++) K.box(0.6, 0.06, 0.06, dark, rx - 1, 0.35 + k * 0.32, rz + 1.9, 0, 2, 0.35, 0);
    // dos palmeras (pindó) que se tuercen
    const trunk = new THREE.CylinderGeometry(0.13, 0.2, 1.3, 7);
    // (la hoja: un huso chato que sale del tronco para afuera)
    const leafG = new THREE.SphereGeometry(1, 8, 6).scale(0.35, 0.06, 1.4).translate(0, 0, 1.4);
    for (const [px, pz, h, lean] of [[-4.5, -4, 7, 0.18], [-1.2, -4.8, 5.6, -0.12]]) {
      const n = Math.round(h / 1.2);
      let x = px;
      let y = 0.3;
      for (let k = 0; k < n; k++) {
        K.add(trunk, bark, x, y + 0.6, pz, 0, 0, lean);
        x -= Math.sin(lean) * 1.2;
        y += Math.cos(lean) * 1.2;
      }
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        // (cae hacia afuera: primero se inclina y después se gira hacia su lado)
        K.add(leafG.clone().rotateX(0.35 + (k % 2) * 0.3).rotateY(Math.PI / 2 - a), frond, x, y + 0.1, pz);
      }
    }
    // el algarrobo del Gil: tronco, copa, cintas coloradas, la cruz y las velas
    const ax = -3.2;
    const az = 0.6;
    K.add(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 8), bark, ax, 1.9, az, 0, 0, 0.08);
    for (const [dx, dy, dz, s] of [[0, 4.2, 0, 2], [1.3, 3.8, 0.5, 1.4], [-1.2, 3.9, -0.4, 1.5], [0.3, 4.6, -1, 1.3]]) K.add(new THREE.IcosahedronGeometry(1, 1), crown, ax + dx, dy, az + dz, 0, dx, 0, s, s * 0.7, s);
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      K.box(0.1, 0.9, 0.02, red, ax + Math.cos(a) * 1.6, 3.1, az + Math.sin(a) * 1.4, a, 2, 0, 0.1);
    }
    K.box(0.12, 1.5, 0.12, red, ax + 1.2, 1.05, az + 1.6);
    K.box(0.8, 0.12, 0.12, red, ax + 1.2, 1.45, az + 1.6);
    K.box(0.9, 0.06, 0.02, red, ax + 1.6, 1.8, az + 1.6, 0, 2, 0, -0.3);
    for (const dx of [0.8, 1.6]) K.add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), candle, ax + dx, 0.55, az + 2.1);
    // los irupés en el agua (con el borde doblado) y alguna flor
    let s = seed + 5;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const padG = new THREE.CylinderGeometry(1, 1, 0.04, 16);
    const rimG = new THREE.TorusGeometry(1, 0.06, 4, 16);
    for (let k = 0; k < 16; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 5.5 + rnd() * 3.4;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.hypot(x - rx, z - rz) < 3) continue;
      const r = 0.45 + rnd() * 0.5;
      K.add(padG, pad, x, 0.03, z, 0, 0, 0, r, 1, r);
      K.add(rimG, pad, x, 0.08, z, Math.PI / 2, 0, 0, r, r, 1);
      if (k % 5 === 0) K.add(new THREE.SphereGeometry(0.16, 8, 6), petal, x + r * 0.3, 0.2, z);
    }
    // el pajonal del borde
    // (matas de pajas finas, cada una de varias hojas abiertas)
    const tuft = new THREE.ConeGeometry(0.06, 1.8, 4, 1, true).translate(0, 0.9, 0);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + rnd() * 0.1;
      if (a > 1.1 && a < 2.1) continue;
      const d = R * (0.88 + rnd() * 0.08);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      for (let j = 0; j < 5; j++) {
        const b = rnd() * Math.PI * 2;
        const lean = 0.15 + rnd() * 0.35;
        K.add(tuft, reed, x + Math.cos(b) * 0.12, 0, z + Math.sin(b) * 0.12, Math.sin(b) * lean, 0, -Math.cos(b) * lean, 1, 0.6 + rnd() * 0.7, 1);
      }
    }
    K.build(f);
    // las luciérnagas
    const flies = [];
    for (let k = 0; k < 18; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xd8ff80, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.scale.setScalar(0.45);
      sp.userData = { a: rnd() * 6.3, r: 1.5 + rnd() * 7, y: 0.6 + rnd() * 3, ph: rnd() * 6.3, v: 0.2 + rnd() * 0.3 };
      f.add(sp);
      flies.push(sp);
    }
    f.userData.tick = (dt, t) => {
      for (const sp of flies) {
        const u = sp.userData;
        u.a += dt * u.v;
        sp.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.8 + u.ph) * 0.4, Math.sin(u.a) * u.r * 0.8);
        sp.material.opacity = Math.max(0, Math.sin(t * 2.4 + u.ph)) * 0.9;
      }
      candle.color.setRGB(1, 0.23, 0.12).multiplyScalar(2.2 + Math.sin(t * 9) * 0.3);
    };
    return f;
  },
};

// Las piedras sueltas que flotan: siempre en los mismos lugares (en todas las
// compus igual) y nunca donde pasa el dragón ni encima de un pedazo.
// blocked(p, r): true si una piedra de radio r en p molestaría.
export function floatingRocks(M, A, blocked, n = 60) {
  const rock = M.caveRock || M.stoneDark;
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rock, n);
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let k = 0;
  for (let tries = 0; k < n && tries < n * 40; tries++) {
    const a = rnd() * Math.PI * 2;
    const d = 52 + rnd() * 100;
    const sc = 0.6 + rnd() * 2.6;
    tmpP.set(A.x + Math.cos(a) * d, A.y - 20 + rnd() * 50, A.z + Math.sin(a) * d);
    if (blocked(tmpP, sc * 1.3)) continue;
    tmpM.compose(tmpP, tmpQ.setFromEuler(tmpE.set(rnd() * 3, rnd() * 3, 0)), tmpS.setScalar(sc));
    mesh.setMatrixAt(k++, tmpM);
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
