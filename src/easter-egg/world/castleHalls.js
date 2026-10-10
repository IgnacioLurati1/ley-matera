import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { quadUV } from './Levels';
import { glyph, guarda } from './castleDecor';
import { compactGroup } from './props';
import { lean } from './castleLean';

// Los dos salones grandes del castillo, con más cuerpo (lo llama buildCastle):
//  · la Sala del Trono: dos filas de columnas con capitel, un artesonado de
//    vigas con casetones rojos y rosetas de oro (reemplaza las vigas sueltas
//    de castleTrim), el dosel del trono con su guarda, y los escudos de los
//    cuatro caballeros con dos tacuaras cruzadas en las paredes;
//  · el Gran Salón: cerchas de madera a la vista sobre ménsulas de piedra
//    (tirante, pendolón, pares y jabalcones), entre los pendones.
// Todo va en un GeoBuilder (pocas llamadas de dibujo) salvo los escudos.

const K = { fy: 32, ceil: 38.8, x0: 44, x1: 58, z0: 20, z1: 32 };
// las columnas (en el eje del trono, dejando libres los braseros y la crónica)
const COLS = [
  [47.5, 25],
  [47.5, 29],
  [55.5, 25],
  [55.5, 29],
];
const D = { fy: 28, ceil: 38.5, z0: 33, z1: 45, trusses: [49, 54, 58] };

let GOLD = null;
function gold() {
  if (!GOLD) GOLD = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: 0.35, metalness: 0.9 });
  return GOLD;
}

// Un anillo (o tronco de cono) de radio r0 en y0 a r1 en y1, mirando para afuera.
function ring(gb, key, cx, cz, r0, r1, y0, y1, n = 16) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = ((k + 1) / n) * Math.PI * 2;
    const P = [
      [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0],
      [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0],
      [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1],
      [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1],
    ];
    const u0 = (a * 0.4) / 1.2;
    const u1 = (b * 0.4) / 1.2;
    const m = (a + b) / 2;
    quadUV(gb, key, P, [[u0, y0 / 1.2], [u1, y0 / 1.2], [u1, y1 / 1.2], [u0, y1 / 1.2]], [Math.cos(m), (r0 - r1) * 0.5, Math.sin(m)]);
  }
}

// Una barra inclinada de sección cuadrada (2·h de lado) entre a y b, en el
// plano x = cte (las cerchas corren a lo largo de z).
function bar(gb, key, x, a, b, h) {
  const [za, ya] = a;
  const [zb, yb] = b;
  const L = Math.hypot(zb - za, yb - ya) || 1;
  // la normal en el plano (z, y), perpendicular a la barra
  const nz = -(yb - ya) / L;
  const ny = (zb - za) / L;
  const P = (z, y, sx, sn) => [x + sx * h, y + ny * sn * h, z + nz * sn * h];
  const faces = [
    [P(za, ya, -1, 1), P(zb, yb, -1, 1), P(zb, yb, 1, 1), P(za, ya, 1, 1), [0, ny, nz]],
    [P(za, ya, -1, -1), P(zb, yb, -1, -1), P(zb, yb, 1, -1), P(za, ya, 1, -1), [0, -ny, -nz]],
    [P(za, ya, 1, -1), P(zb, yb, 1, -1), P(zb, yb, 1, 1), P(za, ya, 1, 1), [1, 0, 0]],
    [P(za, ya, -1, -1), P(zb, yb, -1, -1), P(zb, yb, -1, 1), P(za, ya, -1, 1), [-1, 0, 0]],
  ];
  for (const [p0, p1, p2, p3, hint] of faces) quadUV(gb, key, [p0, p1, p2, p3], [[0, 0], [L / 1.5, 0], [L / 1.5, 0.3], [0, 0.3]], hint);
}

// La tela del dosel: rojo punzó con la guarda pampa y un fleco de oro.
function doselTex() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#7a1014';
  x.fillRect(0, 0, 512, 64);
  guarda(x, 0, 10, 512, 34, '#e8d8b0', '#1a0c0a', '#c89a3a');
  x.fillStyle = '#c89a3a';
  for (let i = 0; i < 64; i++) x.fillRect(i * 8, 50, 4, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// El casetón: rojo oscuro con un filete de oro pintado.
function cofferTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4a0e10';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#b8903a';
  x.lineWidth = 5;
  x.strokeRect(14, 14, 100, 100);
  x.lineWidth = 2;
  x.strokeRect(24, 24, 80, 80);
  // estrella de ocho puntas en el medio
  x.fillStyle = '#c89a3a';
  x.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = k % 2 ? 9 : 22;
    x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// El escudo de un caballero: el color del elemento, el símbolo en oro y el borde.
const SHIELDS = {
  fuego: ['#8a1a12', 'fire'],
  viento: ['#1e5a2e', 'wind'],
  rayo: ['#8a6a10', 'bolt'],
  hielo: ['#1a3e7a', 'ice'],
};
function shieldTex(kind) {
  const [bg, g] = SHIELDS[kind];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 320);
  // la banda de la guarda arriba y el símbolo
  guarda(x, 0, 18, 256, 40, '#e8d8b0', '#1a0c0a', '#c89a3a');
  glyph(x, g, 128, 180, 150, '#f0c860');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shield(M, kind) {
  const W = 0.9;
  const H = 1.15;
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, H * 0.45);
  sh.lineTo(W / 2, H * 0.45);
  sh.lineTo(W / 2, 0);
  sh.quadraticCurveTo(W / 2, -H * 0.4, 0, -H * 0.55);
  sh.quadraticCurveTo(-W / 2, -H * 0.4, -W / 2, 0);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.035, bevelSegments: 1, curveSegments: 10 });
  const tex = shieldTex(kind);
  // (las tapas del extruido traen las coordenadas de la forma: se llevan a 0..1)
  tex.repeat.set(1 / W, 1 / H);
  tex.offset.set(0.5, 0.55);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 });
  const m = new THREE.Mesh(geo, [face, gold()]);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  // dos tacuaras cruzadas detrás, con su moharra
  const wood = M.woodDark || M.wood;
  for (const s of [-1, 1]) {
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 2.5, 6), wood);
    lance.position.set(0, 0, -0.05);
    lance.rotation.z = s * 0.62;
    g.add(lance);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), M.iron);
    tip.position.set(-s * Math.sin(0.62) * 1.35, Math.cos(0.62) * 1.35, -0.05);
    tip.rotation.z = s * 0.62;
    g.add(tip);
  }
  return g;
}

// (hall: false = solo la sala del trono; lo usa Eclipse, world/eclipse/v5.js)
export function buildHalls(w, { hall = true } = {}) {
  const M = w.M;
  const gb = new GeoBuilder();
  const coffer = new THREE.MeshStandardMaterial({ map: cofferTex(), roughness: 0.8 });
  const mats = { ...M, gold: gold(), coffer };
  // ---------------- la Sala del Trono ----------------
  const { fy, ceil } = K;
  const bb = ceil - 0.6;
  for (const [cx, cz] of COLS) {
    // el plinto, la basa, el fuste con su anillo de oro y el capitel con el ábaco
    gb.box('castleStoneDark', cx - 0.48, fy, cz - 0.48, cx + 0.48, fy + 0.3, cz + 0.48, 1);
    ring(gb, 'stoneStep', cx, cz, 0.44, 0.36, fy + 0.3, fy + 0.5);
    ring(gb, 'stoneStep', cx, cz, 0.34, 0.34, fy + 0.5, bb - 0.72);
    ring(gb, 'gold', cx, cz, 0.36, 0.36, fy + 1.55, fy + 1.66);
    ring(gb, 'gold', cx, cz, 0.36, 0.36, bb - 0.95, bb - 0.86);
    ring(gb, 'stoneStep', cx, cz, 0.34, 0.58, bb - 0.72, bb - 0.28);
    gb.box('stoneStep', cx - 0.62, bb - 0.28, cz - 0.62, cx + 0.62, bb - 0.1, cz + 0.62, 1);
    // el zapato de madera que recibe la viga maestra
    gb.box('beam', cx - 0.26, bb - 0.1, cz - 0.7, cx + 0.26, bb, cz + 0.7, 1);
    w.addBox([cx - 0.42, fy, cz - 0.42, cx + 0.42, ceil, cz + 0.42], { kind: 'prop' });
  }
  // el artesonado: vigas maestras sobre las columnas (a lo largo de z), una
  // viga en el eje del trono y dos travesaños; casetones rojos con roseta
  const X = [K.x0, 47.5, 51.5, 55.5, K.x1];
  const Z = [K.z0, 25, 29, K.z1];
  for (const x of [47.5, 55.5]) {
    gb.box('beam', x - 0.22, bb, K.z0, x + 0.22, ceil - 0.01, K.z1, 1);
    // las ménsulas de piedra donde la viga entra en la pared
    for (const z of [K.z0, K.z1 - 0.5]) gb.box('castleStone', x - 0.3, bb - 0.55, z, x + 0.3, bb, z + 0.5, 1);
  }
  gb.box('beam', 51.5 - 0.15, ceil - 0.45, K.z0, 51.5 + 0.15, ceil - 0.01, K.z1, 1);
  for (const z of [25, 29]) gb.box('beam', K.x0, ceil - 0.45, z - 0.15, K.x1, ceil - 0.01, z + 0.15, 1);
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const a = X[i] + 0.22;
      const b = X[i + 1] - 0.22;
      const c = Z[j] + 0.18;
      const d = Z[j + 1] - 0.18;
      if (b - a < 0.6 || d - c < 0.6) continue;
      // el panel pintado (apenas debajo del revoque) y la roseta dorada
      const y = ceil - 0.015;
      quadUV(gb, 'coffer', [[a, y, c], [b, y, c], [b, y, d], [a, y, d]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0]);
      const mx = (a + b) / 2;
      const mz = (c + d) / 2;
      ring(gb, 'gold', mx, mz, 0.2, 0.08, ceil - 0.02, ceil - 0.16, 10);
      // el filete de moldura alrededor del casetón
      gb.box('beam', a, ceil - 0.1, c, b, ceil - 0.02, c + 0.06, 1);
      gb.box('beam', a, ceil - 0.1, d - 0.06, b, ceil - 0.02, d, 1);
      gb.box('beam', a, ceil - 0.1, c, a + 0.06, ceil - 0.02, d, 1);
      gb.box('beam', b - 0.06, ceil - 0.1, c, b, ceil - 0.02, d, 1);
    }
  }
  // el dosel del trono: un bastidor que sale de la pared con su tela roja,
  // guardas colgando al frente y a los costados, y dos escuadras doradas
  const y0 = fy + 5.25;
  const dx0 = 49.75;
  const dx1 = 53.25;
  const dz = 21.9;
  gb.box('woodDark', dx0, y0, K.z0, dx1, y0 + 0.12, dz, 1);
  gb.box('redCloth', dx0 + 0.05, y0 + 0.12, K.z0, dx1 - 0.05, y0 + 0.2, dz - 0.05, 1);
  gb.box('gold', dx0 - 0.04, y0 - 0.04, dz - 0.06, dx1 + 0.04, y0 + 0.16, dz + 0.02, 1);
  for (const x of [dx0 + 0.1, dx1 - 0.1]) {
    const P = [[x, y0 - 1.1, K.z0 + 0.02], [x, y0, dz - 0.2]];
    bar(gb, 'gold', x, [P[0][2], P[0][1]], [P[1][2], P[1][1]], 0.035);
  }
  const g = new THREE.Group();
  const tex = doselTex();
  const val = (len, rot, px, pz) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 1.8, 1);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), mat);
    m.position.set(px, y0 - 0.22, pz);
    m.rotation.y = rot;
    m.castShadow = true;
    g.add(m);
  };
  val(dx1 - dx0 + 0.08, 0, (dx0 + dx1) / 2, dz + 0.04);
  val(dz - K.z0, Math.PI / 2, dx0 - 0.02, (K.z0 + dz) / 2);
  val(dz - K.z0, -Math.PI / 2, dx1 + 0.02, (K.z0 + dz) / 2);
  // los escudos de los caballeros (el fuego y el viento al oeste, el rayo y el hielo al sur)
  const place = [
    ['fuego', 44.08, fy + 3.3, 21.3, Math.PI / 2],
    ['viento', 44.08, fy + 3.3, 25.5, Math.PI / 2],
    ['rayo', 46.5, fy + 3.5, 31.92, Math.PI],
    ['hielo', 56.5, fy + 3.5, 31.92, Math.PI],
  ];
  for (const [kind, x, y, z, ry] of place) {
    const s = shield(M, kind);
    s.position.set(x, y, z);
    s.rotation.y = ry;
    g.add(s);
  }
  if (hall) {
    // ---------------- el Gran Salón: las cerchas ----------------
    const tie = D.fy + 6.2;
    const mid = (D.z0 + D.z1) / 2;
    const apex = D.ceil - 0.55;
    for (const x of D.trusses) {
      // el tirante y las ménsulas de piedra que lo reciben
      gb.box('beam', x - 0.15, tie, D.z0, x + 0.15, tie + 0.36, D.z1, 1);
      for (const z of [D.z0, D.z1 - 0.55]) {
        gb.box('castleStone', x - 0.24, tie - 0.6, z, x + 0.24, tie, z + 0.55, 1);
        gb.box('stoneStep', x - 0.28, tie - 0.72, z - (z === D.z0 ? 0 : 0.03), x + 0.28, tie - 0.6, z + 0.58, 1);
      }
      // el pendolón y los pares hasta la cumbrera
      gb.box('beam', x - 0.13, tie + 0.36, mid - 0.13, x + 0.13, apex + 0.3, mid + 0.13, 1);
      bar(gb, 'beam', x, [D.z0 + 0.3, tie + 0.36], [mid, apex], 0.12);
      bar(gb, 'beam', x, [D.z1 - 0.3, tie + 0.36], [mid, apex], 0.12);
      // los jabalcones (del pie del pendolón a la mitad de cada par)
      const q = (za) => [za + (mid - za) * 0.5, tie + 0.36 + (apex - tie - 0.36) * 0.5];
      bar(gb, 'beam', x, [mid - 0.1, tie + 0.6], q(D.z0 + 0.3), 0.08);
      bar(gb, 'beam', x, [mid + 0.1, tie + 0.6], q(D.z1 - 0.3), 0.08);
      // herrajes: una planchuela en cada unión
      gb.box('iron', x - 0.16, tie + 0.3, mid - 0.2, x + 0.16, tie + 0.62, mid + 0.2, 1);
    }
  }
  const mesh = gb.build(mats);
  w.root.add(mesh);
  // (las lanzas y las moharras de los escudos: una malla cada una)
  if (lean()) compactGroup(g);
  w.root.add(g);
}
