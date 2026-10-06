import * as THREE from 'three';
import { mesh, boxGeo, rboxGeo, cylGeo, mergeByMaterial } from './props';

// La Caja Misteriosa de cada mapa. Todas miden lo mismo (1.7 × 0.55 × 0.8, con
// la bisagra de la tapa atrás), así la animación, el mate que sube y la
// colisión sirven igual; cambian el cajón, los herrajes y el color de la luz.
//   molino   → el cajón yerbatero de siempre (tablas y flejes de hierro), luz celeste
//   granja   → cajón de chacra pintado de colorado, con paja asomando, luz ámbar
//   penal    → baúl de chapa de un preso, con remaches y candado, luz verde
//   torre    → arcón tallado y oscuro con filetes de oro y runas, luz violeta
//   castillo → cofre de tapa redonda con flejes, cerradura de oro y escarcha, luz de hielo
//   esteros  → el Baúl del Ahogado: madera empapada, óxido, cadena y camalote, luz verde de luna
//   monumento → el Cofre del Ejército del Norte (1812): campaña de nogal con
//               cantoneras de bronce, correas, la escarapela y la bandera enrollada, luz celeste
//   eclipse  → el Baúl del Desgarro: cosido con pedazos de las otras cajas
//              (tablas del molino, chapa del penal, arcón de la torre) con
//              grapas de oro, y partido por una grieta de luz violeta
//
// Devuelve { group, lid, inner, qMat, glow, glowHex, beam, glowMats }:
// lid gira sobre su bisagra (x), inner es la luz de adentro al abrirse, glow el
// color base con que laten los signos (glowMats) y beam el color del haz.

const LOOK = {
  molino: { glow: [0.6, 0.85, 1], hex: 0x9fd8ff, beam: 0x5aa8ff },
  granja: { glow: [1, 0.72, 0.32], hex: 0xffb454, beam: 0xff9a3a },
  penal: { glow: [0.55, 1, 0.42], hex: 0x8cff6a, beam: 0x4aff5a },
  torre: { glow: [0.8, 0.58, 1], hex: 0xc79bff, beam: 0xa070ff },
  castillo: { glow: [0.75, 0.95, 1], hex: 0xbff0ff, beam: 0x9ae4ff },
  esteros: { glow: [0.7, 1, 0.8], hex: 0xb4ffd8, beam: 0x6ad8a0 },
  monumento: { glow: [0.62, 0.84, 1], hex: 0xa8d4ff, beam: 0x74acdf },
  // (poco rojo: con más, el tono de la imagen lo vira a magenta)
  eclipse: { glow: [0.27, 0.06, 1], hex: 0x8a4cff, beam: 0x6a2cff },
};

// Signo de pregunta blanco (el color lo pone el material de cada mapa).
let qTex = null;
function questionTex() {
  if (qTex) return qTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 110px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('?', 64, 70);
  qTex = new THREE.CanvasTexture(c);
  qTex.colorSpace = THREE.SRGBColorSpace;
  return qTex;
}

// Chapita pintada con plantilla (el número del preso).
function stencilTex(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d2bc';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 40px "Stardos Stencil", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (o) => new THREE.MeshStandardMaterial(o);
const add = (parent, geo, mat, x, y, z, rx, ry, rz) => {
  const m = mesh(geo, mat, x, y, z, rx, ry, rz);
  parent.add(m);
  return m;
};
// Signo que late (en la cara de enfrente o en la tapa).
const sign = (parent, qMat, size, x, y, z, rx = 0) => {
  const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), qMat);
  q.position.set(x, y, z);
  q.rotation.x = rx;
  parent.add(q);
  return q;
};
// Número pseudoaleatorio fijo (misma paja y remaches en cada carga).
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

export function buildBoxSkin(g, M, mapId) {
  const L = LOOK[mapId] || LOOK.molino;
  const T = g.textures;
  const glow = new THREE.Color(L.glow[0], L.glow[1], L.glow[2]);
  const qMat = new THREE.MeshBasicMaterial({ map: questionTex(), transparent: true, color: glow.clone().multiplyScalar(1.6), toneMapped: false, depthWrite: false });
  const group = new THREE.Group();
  const lid = new THREE.Group();
  lid.position.set(0, 0.56, -0.4);
  group.add(lid);
  const glowMats = [qMat];
  const build = SKINS[mapId] || SKINS.molino;
  build({ group, lid, qMat, glowMats, M, T, glow });
  // las piezas quietas del cajón y de la tapa en una malla por material (el
  // de algunos mapas tenía decenas: remaches, listones, paja): muchas menos
  // llamadas de dibujo. Queda aparte lo que late (glowMats), lo transparente
  // y lo que tiene algo colgado.
  const apart = (p) => p.children.filter((o) => o.isMesh && (glowMats.includes(o.material) || o.material.transparent || o.children.length || Array.isArray(o.material)));
  mergeByMaterial(lid, apart(lid));
  mergeByMaterial(group, apart(group));
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0 }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.5;
  group.add(inner);
  return { group, lid, inner, qMat, glow, glowHex: L.hex, beam: L.beam, glowMats };
}

// Una grieta quebrada en el plano (x, y), de y = 0 a y = len, centrada en x = 0:
// la luz (ancho w) y el borde oscuro de alrededor (w + rim), con el mismo zigzag.
function crackShapes(len, w, seed, { rim = 0.022, jit = 0.035, n = 9 } = {}) {
  const r = seeded(seed);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = i === 0 || i === n ? 0 : (r() - 0.5) * 2 * jit;
    pts.push([x, t * len, 0.35 + 0.65 * Math.sin(Math.PI * t) * (0.7 + r() * 0.6)]);
  }
  const shape = (ww) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y, k], i) => (i ? s.lineTo(x - (ww * k) / 2, y) : s.moveTo(x - (ww * k) / 2, y)));
    for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0] + (ww * pts[i][2]) / 2, pts[i][1]);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  return { glow: shape(w), dark: shape(w + rim), pts };
}

const SKINS = {
  // el cajón yerbatero de siempre
  molino({ group, lid, qMat, M, T }) {
    const wood = std({ map: T.planks, color: 0xd8b890, roughness: 0.8 });
    add(group, boxGeo(1.7, 0.55, 0.8), wood, 0, 0.28, 0);
    for (const x of [-0.84, 0.84]) add(group, boxGeo(0.05, 0.57, 0.82), M.iron, x, 0.28, 0);
    for (const s of [-1, 1]) sign(group, qMat, 0.35, s * 0.45, 0.3, 0.405);
    add(lid, boxGeo(1.72, 0.1, 0.82), wood, 0, 0.05, 0.4);
    sign(lid, qMat, 0.4, 0, 0.105, 0.4, -Math.PI / 2);
  },

  // cajón de chacra: listones pintados de colorado con esquineros blancos,
  // una herradura para la suerte y paja que se escapa por las rendijas
  granja({ group, lid, qMat, T }) {
    const red = std({ map: T.planks, color: 0xe0583a, roughness: 0.8 });
    const white = std({ map: T.planks, color: 0xfff4dc, roughness: 0.8 });
    const dark = std({ color: 0x1c130b, roughness: 1 });
    const straw = std({ color: 0xd9b45a, roughness: 0.9 });
    const iron = std({ color: 0x4a4440, metalness: 0.7, roughness: 0.5 });
    add(group, boxGeo(1.62, 0.5, 0.72), dark, 0, 0.28, 0);
    add(group, boxGeo(1.7, 0.04, 0.8), red, 0, 0.02, 0);
    // listones con rendijas
    for (const y of [0.11, 0.285, 0.46]) {
      for (const z of [-0.385, 0.385]) add(group, boxGeo(1.66, 0.15, 0.03), red, 0, y, z);
      for (const x of [-0.835, 0.835]) add(group, boxGeo(0.03, 0.15, 0.74), red, x, y, 0);
    }
    // esquineros y travesaño blancos
    for (const x of [-0.82, 0.82]) for (const z of [-0.37, 0.37]) add(group, boxGeo(0.075, 0.56, 0.075), white, x, 0.28, z);
    add(group, boxGeo(1.58, 0.045, 0.02), white, 0, 0.535, 0.4);
    // herradura (con las puntas para arriba, que junta la suerte)
    add(group, new THREE.TorusGeometry(0.07, 0.013, 6, 14, Math.PI * 1.35), iron, 0, 0.29, 0.412, 0, 0, Math.PI * 0.825);
    for (const s of [-1, 1]) sign(group, qMat, 0.3, s * 0.48, 0.29, 0.405);
    // paja asomando por las rendijas
    const r = seeded(7);
    for (let i = 0; i < 16; i++) {
      const front = i < 10;
      const y = [0.2, 0.37][i % 2] + (r() - 0.5) * 0.02;
      const len = 0.12 + r() * 0.12;
      const m = add(group, cylGeo(0.005, 0.004, len, 4), straw, 0, y, 0);
      if (front) {
        const x = (r() - 0.5) * 1.5;
        m.position.set(x, y, 0.4 + len * 0.3);
        m.rotation.set(Math.PI / 2 - 0.3 + r() * 0.6, 0, (r() - 0.5) * 1.6);
      } else {
        const s = r() < 0.5 ? -1 : 1;
        m.position.set(s * (0.85 + len * 0.3), y, (r() - 0.5) * 0.6);
        m.rotation.set((r() - 0.5) * 1.2, 0, s * (Math.PI / 2 - 0.3 + r() * 0.6));
      }
    }
    // tapa de listones
    for (const z of [0.1, 0.3, 0.5, 0.7]) add(lid, boxGeo(1.72, 0.06, 0.19), red, 0, 0.03, z);
    for (const x of [-0.8, 0.8]) add(lid, boxGeo(0.08, 0.065, 0.8), white, x, 0.035, 0.4);
    sign(lid, qMat, 0.38, 0, 0.066, 0.4, -Math.PI / 2);
  },

  // baúl de chapa de un preso: fajas remachadas, esquineros, manijas,
  // candado y el número pintado con plantilla
  penal({ group, lid, qMat, T }) {
    const steel = std({ map: T.metal, color: 0x6a7258, metalness: 0.55, roughness: 0.6 });
    const band = std({ map: T.metal, color: 0x3c4234, metalness: 0.6, roughness: 0.5 });
    const rivet = std({ color: 0x8a8a80, metalness: 0.8, roughness: 0.35 });
    const brass = std({ color: 0x9a7a3a, metalness: 0.8, roughness: 0.4 });
    add(group, rboxGeo(1.7, 0.55, 0.8, 0.025), steel, 0, 0.275, 0);
    for (const y of [0.09, 0.47]) add(group, boxGeo(1.72, 0.05, 0.82), band, 0, y, 0);
    for (const x of [-0.82, 0.82]) for (const z of [-0.37, 0.37]) add(group, boxGeo(0.08, 0.57, 0.08), band, x, 0.28, z);
    const rv = new THREE.SphereGeometry(0.011, 6, 4);
    for (const y of [0.09, 0.47]) for (let i = 0; i < 9; i++) add(group, rv, rivet, -0.72 + i * 0.18, y, 0.412);
    // manijas a los costados
    for (const s of [-1, 1]) add(group, new THREE.TorusGeometry(0.06, 0.011, 6, 12, Math.PI), band, s * 0.85, 0.3, 0).rotation.set(Math.PI / 2, s * Math.PI / 2, 0, 'YXZ');
    // pasador y candado
    add(group, boxGeo(0.1, 0.12, 0.02), band, 0, 0.47, 0.415);
    add(group, rboxGeo(0.1, 0.085, 0.04, 0.01), brass, 0, 0.345, 0.43);
    add(group, new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), rivet, 0, 0.388, 0.43);
    // número del preso
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), std({ map: stencilTex('Nº 1911'), roughness: 0.8 }));
    plate.position.set(0, 0.2, 0.402);
    group.add(plate);
    for (const s of [-1, 1]) sign(group, qMat, 0.26, s * 0.52, 0.28, 0.404);
    // tapa con faja y remaches
    add(lid, rboxGeo(1.72, 0.1, 0.82, 0.025), steel, 0, 0.05, 0.4);
    add(lid, boxGeo(1.74, 0.03, 0.06), band, 0, 0.02, 0.8);
    for (let i = 0; i < 9; i++) add(lid, rv, rivet, -0.72 + i * 0.18, 0.02, 0.832);
    sign(lid, qMat, 0.38, 0, 0.102, 0.4, -Math.PI / 2);
  },

  // arcón del remolino: madera tallada casi negra, filetes y patas de oro,
  // un ojo dorado al frente y runas que laten con la caja
  torre({ group, lid, qMat, glowMats, T, glow }) {
    const wood = std({ map: T.woodCarved, color: 0x4a3446, roughness: 0.6 });
    const gold = std({ color: 0xd8a84a, metalness: 0.9, roughness: 0.3 });
    const rune = new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(1.6), toneMapped: false });
    glowMats.push(rune);
    add(group, rboxGeo(1.66, 0.5, 0.76, 0.03), wood, 0, 0.3, 0);
    // zócalo y patas de oro
    add(group, boxGeo(1.7, 0.06, 0.8), gold, 0, 0.05, 0);
    for (const x of [-0.8, 0.8]) for (const z of [-0.36, 0.36]) add(group, new THREE.SphereGeometry(0.05, 10, 8), gold, x, 0.04, z);
    // filetes de las aristas
    for (const x of [-0.83, 0.83]) for (const z of [-0.38, 0.38]) add(group, boxGeo(0.035, 0.5, 0.035), gold, x, 0.31, z);
    add(group, boxGeo(1.7, 0.03, 0.8), gold, 0, 0.545, 0);
    // runas
    for (const y of [0.13, 0.49]) add(group, boxGeo(1.5, 0.012, 0.006), rune, 0, y, 0.382);
    for (const x of [-0.25, 0.25]) add(group, boxGeo(0.012, 0.3, 0.006), rune, x, 0.31, 0.382);
    // el ojo
    add(group, new THREE.TorusGeometry(0.085, 0.014, 8, 24), gold, 0, 0.31, 0.39);
    add(group, new THREE.SphereGeometry(0.045, 12, 8), rune, 0, 0.31, 0.385);
    for (const s of [-1, 1]) sign(group, qMat, 0.28, s * 0.55, 0.31, 0.384);
    // tapa abombada con marco de oro
    add(lid, rboxGeo(1.74, 0.12, 0.84, 0.04), wood, 0, 0.06, 0.4);
    for (const z of [0.02, 0.78]) add(lid, boxGeo(1.74, 0.025, 0.025), gold, 0, 0.115, z);
    for (const x of [-0.85, 0.85]) add(lid, boxGeo(0.025, 0.025, 0.8), gold, x, 0.115, 0.4);
    add(lid, new THREE.TorusGeometry(0.24, 0.012, 6, 32), gold, 0, 0.122, 0.4, -Math.PI / 2);
    sign(lid, qMat, 0.36, 0, 0.124, 0.4, -Math.PI / 2);
  },

  // cofre del castillo: tablas oscuras con flejes de hierro, tapa redonda,
  // cerradura de oro y escarcha con carámbanos
  castillo({ group, lid, qMat, T }) {
    const wood = std({ map: T.planksDark, color: 0xc8966a, roughness: 0.75 });
    const iron = std({ map: T.metal, color: 0x3e4148, metalness: 0.75, roughness: 0.45 });
    const gold = std({ color: 0xd9ad4f, metalness: 0.9, roughness: 0.3 });
    const frost = std({ color: 0xeef6ff, roughness: 0.35, transparent: true, opacity: 0.85 });
    const ice = std({ color: 0xcfeaff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75 });
    add(group, boxGeo(1.7, 0.55, 0.8), wood, 0, 0.275, 0);
    for (const x of [-0.8, 0, 0.8]) add(group, boxGeo(0.08, 0.56, 0.82), iron, x, 0.28, 0);
    add(group, boxGeo(1.72, 0.06, 0.82), iron, 0, 0.03, 0);
    // cerradura
    add(group, boxGeo(0.17, 0.2, 0.025), gold, 0, 0.42, 0.42);
    add(group, boxGeo(0.02, 0.05, 0.01), std({ color: 0x100c08 }), 0, 0.41, 0.434);
    for (const s of [-1, 1]) sign(group, qMat, 0.32, s * 0.4, 0.28, 0.405);
    // tapa redonda (medio tambor) con su fondo, flejes que la abrazan y nieve arriba
    const drum = add(lid, new THREE.CylinderGeometry(0.4, 0.4, 1.7, 20, 1, false, 0, Math.PI), wood, 0, 0, 0.4, 0, 0, Math.PI / 2);
    drum.castShadow = true;
    add(lid, boxGeo(1.7, 0.02, 0.8), wood, 0, 0.01, 0.4);
    for (const x of [-0.8, 0, 0.8]) add(lid, new THREE.TorusGeometry(0.405, 0.022, 6, 20, Math.PI), iron, x, 0, 0.4, 0, Math.PI / 2, 0);
    const snow = add(lid, new THREE.SphereGeometry(1, 16, 8), frost, 0, 0.36, 0.3);
    snow.scale.set(0.7, 0.07, 0.22);
    // carámbanos colgando del borde de adelante
    const r = seeded(11);
    for (let i = 0; i < 9; i++) {
      const len = 0.04 + r() * 0.06;
      const x = -0.7 + i * 0.175 + (r() - 0.5) * 0.05;
      if (Math.abs(x) < 0.12) continue;
      add(lid, new THREE.ConeGeometry(0.012, len, 5), ice, x, -len / 2, 0.815, Math.PI, 0, 0);
    }
    // el signo en la ladera de adelante de la tapa
    const a = Math.PI / 4;
    sign(lid, qMat, 0.32, 0, Math.cos(a) * 0.404, 0.4 + Math.sin(a) * 0.404, -a);
  },

  // el Baúl del Ahogado: lo sacaron del fondo del estero. Madera negra
  // empapada (brilla), flejes comidos por el óxido, el verdín hasta donde
  // estuvo hundido, una cadena con el candado reventado, camalote colgando,
  // los huevitos rosados del caracol pegados y un irupé chico en la tapa
  esteros({ group, lid, qMat, T }) {
    const wood = std({ map: T.planksDark, color: 0x8a987a, roughness: 0.38, metalness: 0.05 });
    const rust = std({ map: T.metal, color: 0x7a4428, metalness: 0.45, roughness: 0.75 });
    const moss = std({ color: 0x34521f, roughness: 0.85 });
    const weed = std({ color: 0x4e6a2a, roughness: 0.7, side: THREE.DoubleSide });
    const eggs = std({ color: 0xff5a9a, roughness: 0.3, emissive: 0x3a0818 });
    const pad = std({ color: 0x3e6a2e, roughness: 0.5 });
    const petal = std({ color: 0xf4f0e6, roughness: 0.6, emissive: 0x201c18 });
    add(group, rboxGeo(1.7, 0.55, 0.8, 0.03), wood, 0, 0.275, 0);
    // el verdín de abajo (la marca del agua) y los flejes
    add(group, boxGeo(1.712, 0.15, 0.812), moss, 0, 0.1, 0);
    for (const x of [-0.62, 0.62]) add(group, boxGeo(0.07, 0.57, 0.83), rust, x, 0.28, 0);
    add(group, boxGeo(1.72, 0.05, 0.83), rust, 0, 0.03, 0);
    // la cadena: cuelga de los flejes y junta en el candado reventado
    const link = new THREE.TorusGeometry(0.022, 0.0065, 4, 10);
    const N = 15;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = -0.6 + u * 1.2;
      const y = 0.36 + 0.14 * (x / 0.6) ** 2;
      const ang = Math.atan(0.28 * (x / 0.36));
      const m = add(group, link, rust, x, y, 0.428);
      m.scale.set(1.45, 1, 1);
      if (i % 2) m.rotation.set(Math.PI / 2, 0, ang, 'ZYX');
      else m.rotation.set(0, 0, ang);
    }
    add(group, rboxGeo(0.1, 0.085, 0.04, 0.01), rust, 0.02, 0.29, 0.44, 0, 0, 0.18);
    // el arco del candado, abierto y torcido
    add(group, new THREE.TorusGeometry(0.03, 0.007, 5, 12, Math.PI), rust, 0.055, 0.345, 0.44, 0, 0.4, 0.5);
    for (const s of [-1, 1]) sign(group, qMat, 0.24, s * 0.38, 0.22, 0.405);
    // camalote y verdín colgando de los costados
    const r = seeded(23);
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? -1 : 1;
      const len = 0.12 + r() * 0.22;
      add(group, boxGeo(0.004, len, 0.02), weed, s * 0.856, 0.5 - len / 2 - r() * 0.15, -0.3 + r() * 0.6, (r() - 0.5) * 0.3, 0, s * 0.08);
    }
    // los huevos del caracol, en racimo, en una esquina y en un fleje
    for (const [cx, cy, n] of [[-0.74, 0.22, 7], [0.64, 0.4, 5]]) {
      for (let i = 0; i < n; i++) {
        const e = add(group, new THREE.SphereGeometry(0.011 + r() * 0.007, 6, 4), eggs, cx + (r() - 0.5) * 0.07, cy + (r() - 0.5) * 0.07, 0.418);
        e.scale.z = 0.7;
      }
    }
    // la tapa: tablas empapadas con sus flejes, verdín arriba y el camalote que cuelga adelante
    add(lid, rboxGeo(1.72, 0.12, 0.82, 0.03), wood, 0, 0.06, 0.4);
    for (const x of [-0.62, 0.62]) add(lid, boxGeo(0.075, 0.13, 0.84), rust, x, 0.06, 0.4);
    const patch = add(lid, new THREE.SphereGeometry(1, 12, 6), moss, -0.4, 0.118, 0.55);
    patch.scale.set(0.3, 0.018, 0.17);
    for (let i = 0; i < 7; i++) {
      const len = 0.1 + r() * 0.2;
      const x = -0.78 + r() * 1.56;
      if (Math.abs(x) < 0.2) continue;
      add(lid, boxGeo(0.02, len, 0.004), weed, x, -len / 2 + 0.02, 0.825, 0, 0, (r() - 0.5) * 0.25);
    }
    // un irupé chico con el borde levantado y su flor
    add(lid, cylGeo(0.14, 0.14, 0.012, 20), pad, 0.44, 0.126, 0.46);
    add(lid, new THREE.TorusGeometry(0.14, 0.012, 4, 22), pad, 0.44, 0.136, 0.46, -Math.PI / 2, 0, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(lid, new THREE.ConeGeometry(0.016, 0.07, 5), petal, 0.5 + Math.cos(a) * 0.02, 0.16, 0.42 + Math.sin(a) * 0.02, Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    }
    sign(lid, qMat, 0.36, -0.02, 0.122, 0.4, -Math.PI / 2);
    // (son muchas piezas chicas: una sola malla por material)
    mergeByMaterial(group);
    mergeByMaterial(lid);
  },
  // el Cofre del Ejército del Norte: un baúl de campaña de Belgrano (1812)
  monumento({ group, lid, qMat, T }) {
    const wood = std({ map: T.planksDark, color: 0x6a4a34, roughness: 0.55 });
    const brass = std({ color: 0xc89a48, metalness: 0.85, roughness: 0.32 });
    const leather = std({ map: T.leather, color: 0x5a3220, roughness: 0.7 });
    const celeste = std({ color: 0x74acdf, roughness: 0.5 });
    const blanco = std({ color: 0xf2efe6, roughness: 0.5 });
    const sol = std({ color: 0xf6b40e, roughness: 0.4, metalness: 0.4, emissive: 0x3a2400 });
    add(group, rboxGeo(1.7, 0.55, 0.8, 0.02), wood, 0, 0.275, 0);
    // las cantoneras de bronce en las ocho esquinas y el zócalo
    for (const x of [-0.83, 0.83]) for (const z of [-0.38, 0.38]) for (const y of [0.04, 0.52]) add(group, boxGeo(0.07, 0.07, 0.07), brass, x, y, z);
    add(group, boxGeo(1.72, 0.05, 0.82), brass, 0, 0.025, 0);
    // las dos correas de cuero con su hebilla
    for (const x of [-0.45, 0.45]) {
      add(group, boxGeo(0.1, 0.57, 0.81), leather, x, 0.285, 0);
      add(group, boxGeo(0.12, 0.08, 0.02), brass, x, 0.42, 0.408);
    }
    // la escarapela al frente (celeste, blanca, celeste) con el sol en el medio
    add(group, cylGeo(0.13, 0.13, 0.012, 24), celeste, 0, 0.28, 0.402, Math.PI / 2, 0, 0);
    add(group, cylGeo(0.09, 0.09, 0.014, 24), blanco, 0, 0.28, 0.406, Math.PI / 2, 0, 0);
    add(group, cylGeo(0.05, 0.05, 0.016, 20), celeste, 0, 0.28, 0.41, Math.PI / 2, 0, 0);
    add(group, cylGeo(0.022, 0.022, 0.018, 12), sol, 0, 0.28, 0.414, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) sign(group, qMat, 0.22, s * 0.68, 0.24, 0.405);
    // la tapa: combada, con las cantoneras, la bandera enrollada atada arriba
    add(lid, rboxGeo(1.72, 0.12, 0.82, 0.03), wood, 0, 0.06, 0.4);
    for (const x of [-0.45, 0.45]) add(lid, boxGeo(0.1, 0.13, 0.83), leather, x, 0.06, 0.4);
    for (const x of [-0.83, 0.83]) for (const z of [0.02, 0.78]) add(lid, boxGeo(0.07, 0.13, 0.07), brass, x, 0.06, z);
    const rollC = add(lid, cylGeo(0.07, 0.07, 1.25, 16), celeste, 0, 0.19, 0.4, 0, 0, Math.PI / 2);
    rollC.scale.set(1, 1, 1);
    add(lid, cylGeo(0.072, 0.072, 0.4, 16), blanco, 0, 0.19, 0.4, 0, 0, Math.PI / 2);
    for (const x of [-0.45, 0.45]) add(lid, new THREE.TorusGeometry(0.075, 0.012, 6, 14), leather, x, 0.19, 0.4, 0, Math.PI / 2, 0);
    sign(lid, qMat, 0.3, 0.62, 0.122, 0.4, -Math.PI / 2);
    sign(lid, qMat, 0.3, -0.62, 0.122, 0.4, -Math.PI / 2);
    mergeByMaterial(group);
    mergeByMaterial(lid);
  },
  // el Baúl del Desgarro (Eclipse Matero): tres pedazos de otras cajas cosidos
  // con grapas de oro (a la izquierda las tablas y el fleje del molino con un
  // listón colorado de La Tapera, al medio la chapa remachada del penal con
  // su candado, a la derecha el arcón tallado de la torre con filetes de oro
  // y las cantoneras de bronce del Monumento) y partido entre la chapa y el
  // arcón por una grieta de luz violeta que sigue por la tapa y por atrás
  eclipse({ group, lid, qMat, glowMats, T, glow }) {
    const planks = std({ map: T.planks, color: 0xd8b890, roughness: 0.8 });
    const red = std({ map: T.planks, color: 0xff6a3a, roughness: 0.8 });
    const iron = std({ map: T.metal, color: 0x3e4148, metalness: 0.75, roughness: 0.45 });
    // (más claros que los de sus mapas: a la luz de un farol se iban a negro)
    const steel = std({ map: T.metal, color: 0xb4bca4, metalness: 0.2, roughness: 0.6 });
    const band = std({ map: T.metal, color: 0x6a7260, metalness: 0.3, roughness: 0.5 });
    const rivet = std({ color: 0x8a8a80, metalness: 0.8, roughness: 0.35 });
    const carved = std({ map: T.woodCarved, color: 0x8a6484, roughness: 0.55 });
    const gold = std({ color: 0xe0b050, metalness: 0.9, roughness: 0.28, emissive: 0x2a1a00 });
    const brass = std({ color: 0xc89a48, metalness: 0.85, roughness: 0.32 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0c0418 });
    const rift = new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(1.6), toneMapped: false });
    glowMats.push(rift);
    // dónde se cose cada pedazo (x): molino | penal | torre
    const A = -0.29;
    const B = 0.27;
    const seg = (x0, x1, mat, h = 0.55, d = 0.8) => add(group, boxGeo(x1 - x0, h, d), mat, (x0 + x1) / 2, h / 2, 0);
    seg(-0.85, A, planks);
    seg(A, B, steel, 0.55, 0.81);
    seg(B, 0.85, carved);
    // el molino: los flejes del costado y el listón colorado de la chacra, clavado encima
    for (const z of [-0.36, 0.36]) add(group, boxGeo(0.03, 0.57, 0.09), iron, -0.85, 0.28, z);
    add(group, boxGeo(0.03, 0.06, 0.82), iron, -0.85, 0.28, 0);
    add(group, boxGeo(0.4, 0.13, 0.016), red, -0.57, 0.1, 0.405);
    // el penal: las fajas remachadas y el candado (abierto: la grieta lo partió)
    const rv = new THREE.SphereGeometry(0.011, 6, 4);
    for (const y of [0.09, 0.47]) {
      add(group, boxGeo(B - A - 0.07, 0.05, 0.83), band, (A + B) / 2 - 0.025, y, 0);
      for (let i = 0; i < 4; i++) add(group, rv, rivet, A + 0.08 + i * 0.13, y, 0.417);
    }
    add(group, boxGeo(0.1, 0.12, 0.02), band, -0.03, 0.47, 0.42);
    add(group, rboxGeo(0.1, 0.085, 0.04, 0.01), brass, -0.03, 0.33, 0.43, 0, 0, 0.12);
    add(group, new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), rivet, 0.005, 0.385, 0.43, 0, 0.5, 0.35);
    // la torre: filetes de oro en las aristas y el zócalo; el Monumento: cantoneras de bronce abajo
    for (const z of [-0.39, 0.39]) add(group, boxGeo(0.035, 0.55, 0.035), gold, 0.835, 0.275, z);
    for (const z of [-0.39, 0.39]) add(group, boxGeo(0.85 - B, 0.03, 0.035), gold, (B + 0.85) / 2, 0.535, z);
    for (const z of [-0.37, 0.37]) add(group, boxGeo(0.08, 0.08, 0.08), brass, 0.81, 0.04, z);
    // las grapas de oro de la costura molino | penal (adelante, atrás y arriba)
    const staple = boxGeo(0.07, 0.022, 0.012);
    for (let i = 0; i < 5; i++) {
      const y = 0.06 + i * 0.105;
      const tw = (i % 2 ? 1 : -1) * 0.12;
      for (const s of [1, -1]) add(group, staple, gold, A, y, s * 0.412, 0, 0, tw);
    }
    add(group, boxGeo(0.008, 0.55, 0.004), gold, A, 0.275, 0.405);
    add(group, boxGeo(0.008, 0.55, 0.004), gold, A, 0.275, -0.405);
    // la grieta, adelante y atrás: el borde negro y la luz
    const C = crackShapes(0.53, 0.035, 7, { rim: 0.026 });
    for (const s of [1, -1]) {
      const zz = s * 0.41;
      add(group, C.dark, dark, B, 0.01, zz - s * 0.003, 0, s > 0 ? 0 : Math.PI, 0);
      add(group, C.glow, rift, B, 0.01, zz - s * 0.001, 0, s > 0 ? 0 : Math.PI, 0);
    }
    // astillas de vidrio violeta que asoman de la grieta (pegadas al borde)
    const shard = new THREE.ConeGeometry(0.012, 0.055, 4);
    const sr = seeded(29);
    for (let i = 1; i < C.pts.length - 1; i += 2) {
      const [x, y] = C.pts[i];
      const side = i % 4 === 1 ? 1 : -1;
      add(group, shard, rift, B + x + side * 0.024, 0.01 + y, 0.43, 0.9, 0, -side * (0.9 + sr() * 0.4));
    }
    for (const s of [-1, 1]) sign(group, qMat, 0.28, s < 0 ? -0.57 : 0.56, 0.31, 0.405);
    // la tapa: los mismos tres pedazos, la costura de oro y la grieta que sigue
    const lseg = (x0, x1, mat, h = 0.1) => add(lid, boxGeo(x1 - x0, h, 0.82), mat, (x0 + x1) / 2, h / 2, 0.4);
    lseg(-0.86, A, planks);
    lseg(A, B, steel, 0.105);
    lseg(B, 0.86, carved, 0.11);
    add(lid, boxGeo(B - A - 0.1, 0.03, 0.06), band, (A + B) / 2 - 0.04, 0.02, 0.8);
    for (const z of [0.02, 0.78]) add(lid, boxGeo(0.86 - B, 0.022, 0.022), gold, (B + 0.86) / 2, 0.113, z);
    add(lid, boxGeo(0.022, 0.022, 0.78), gold, 0.85, 0.113, 0.4);
    for (let i = 0; i < 4; i++) add(lid, boxGeo(0.07, 0.012, 0.022), gold, A, 0.108, 0.1 + i * 0.2, 0, 0.12 * (i % 2 ? 1 : -1), 0);
    add(lid, boxGeo(0.008, 0.004, 0.8), gold, A, 0.1055, 0.4);
    const LC = crackShapes(0.82, 0.03, 11, { rim: 0.024 });
    add(lid, LC.dark, dark, B, 0.112, 0.81, -Math.PI / 2, 0, 0);
    add(lid, LC.glow, rift, B, 0.114, 0.81, -Math.PI / 2, 0, 0);
    // y por el canto de adelante de la tapa
    const FC = crackShapes(0.1, 0.03, 13, { rim: 0.02, n: 3, jit: 0.008 });
    add(lid, FC.dark, dark, B, 0.0, 0.813, 0, 0, 0);
    add(lid, FC.glow, rift, B, 0.0, 0.815, 0, 0, 0);
    sign(lid, qMat, 0.34, -0.01, 0.107, 0.4, -Math.PI / 2);
    mergeByMaterial(group);
    mergeByMaterial(lid);
  },
};
