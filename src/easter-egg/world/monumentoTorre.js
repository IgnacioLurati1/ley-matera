import * as THREE from 'three';
import { RAMPS, WINDOWS } from '../config/map';
import { bbox, quad, sweep, stairs, PROFILE, roomShell, place, lathe, cylUV } from './monumentoKit';
import { carvedText, escudoMedallon, reliefCanvas } from './monumentoTextures';
import { toTexture } from '../core/textures';
import { statue } from './monumentoStatues';

// La Torre (el mástil de la nave) con su basamento, la Proa con la Patria
// Abanderada, la Cripta de Belgrano adentro del basamento y el Mirador
// arriba. A escala del mapa: el basamento de x 66 a 82 y de z 20 a 41 (sube
// hasta 6,2), el cuerpo alto con las estatuas blancas (hasta 11,4), el fuste
// de 6 x 10 m con los retranqueos de las esquinas y el sol tallado, el
// Mirador de 31 a 34,4 con sus ventanas y el remate escalonado hasta 37,2.
// La Proa sale al este (al río), una cuña de piedra con terrazas al pie.

export const TORRE = { x0: 74, x1: 80, z0: 26, z1: 36, cx: 77, cz: 31, base: 11.4, mir: 44, lint: 47.0, top: 50.2, chamfer: 0.45, remate: 49.2, roof: 49.45 };
const BASE = { x0: 66, x1: 82, z0: 20, z1: 41, top: 6.2 };
const UP = { x0: 69.5, x1: 82, z0: 22.5, z1: 38.5, top: 11.4 };
// la Proa: el contorno de la cuña (en planta) y la altura de su lomo
const PROA = { tipX: 89.6, z: 30.5, side: [[82, 23.6], [88.4, 28.1]], top0: 6.0, top1: 4.3 };

export function buildTorre(w, gb, extra) {
  buildBasamento(w, gb, extra);
  buildFuste(w, gb, extra);
  buildMirador(w, gb, extra);
  buildProa(w, gb, extra);
  buildCripta(w, gb, extra);
}

// ---------------- el basamento ----------------
function buildBasamento(w, gb, extra) {
  const M = w.M;
  const B = BASE;
  // las cuatro caras del basamento bajo, con los huecos de las puertas de la
  // Cripta (oeste: z 21-24 y 37-40; este: z 21-23 y 38-40) y el nicho
  const yA = 0.8;
  const low = -3.2;
  // oeste (al atrio): de a tramos, salteando puertas y nicho
  const W = (z0, z1, y0, y1) => quad(gb, 'travertinoBig', [[B.x0, y0, z1], [B.x0, y0, z0], [B.x0, y1, z0], [B.x0, y1, z1]], [-1, 0, 0]);
  W(B.z0, 21, low, B.top);
  W(24, 28.4, yA - 0.4, B.top);
  W(32.6, 37, yA - 0.4, B.top);
  W(40, B.z1, low, B.top);
  // arriba de las puertas y del nicho
  W(21, 24, yA + 2.7, B.top);
  W(37, 40, yA + 2.7, B.top);
  W(28.4, 32.6, 5.6, B.top);
  // el umbral de abajo de las puertas (del piso del atrio para abajo)
  W(21, 24, low, yA);
  W(37, 40, low, yA);
  W(28.4, 32.6, low, yA + 0.3);
  // los vanos: jambas y dinteles (la piedra del espesor del muro, 1 m)
  for (const [z0, z1] of [[21, 24], [37, 40]]) {
    quad(gb, 'travertino', [[B.x0, yA, z0], [B.x0 + 1, yA, z0], [B.x0 + 1, yA + 2.7, z0], [B.x0, yA + 2.7, z0]], [0, 0, 1]);
    quad(gb, 'travertino', [[B.x0 + 1, yA, z1], [B.x0, yA, z1], [B.x0, yA + 2.7, z1], [B.x0 + 1, yA + 2.7, z1]], [0, 0, -1]);
    quad(gb, 'travertino', [[B.x0, yA + 2.7, z0], [B.x0 + 1, yA + 2.7, z0], [B.x0 + 1, yA + 2.7, z1], [B.x0, yA + 2.7, z1]], [0, -1, 0]);
    // el marco de bronce del portón
    sweep(gb, 'bronzeDark', [B.x0 - 0.001, z0], [B.x0 - 0.001, z1], [-1, 0], [[0, 0], [0.06, 0], [0.06, 0.18], [0, 0.18]], { y: yA + 2.7 });
  }
  // el nicho de la Madre Patria: un arco de medio punto de 0,85 de hondo
  niche(gb, B.x0, 28.4, 32.6, yA + 0.3, 5.6, 0.85);
  // el pedestal y la Madre Patria (bronce, de espaldas a la Torre, mirando al Patio)
  bbox(gb, 'travertino', B.x0 + 0.05, yA, 29.2, B.x0 + 0.85, yA + 0.6, 31.8, { b: 0.03, top: 'travStep' });
  // (las estatuas de afuera, con su material que se prende con los reflectores: world/monumentoLuces.js)
  const LB = globalThis.__mduNoTorreLuz === true ? M.bronze : M.bronzeLit;
  const LM = globalThis.__mduNoTorreLuz === true ? M.marble : M.marbleLit;
  extra.push(...statue('madre', LB, B.x0 + 0.45, yA + 0.6, 30.5, -Math.PI / 2, 1.3));
  // el reflector del piso del atrio que la alumbra (se prende con la luz:
  // config LIGHTS), una caja de bronce con el vidrio mirando al nicho
  bbox(gb, 'bronzeDark', 64.08, yA, 30.22, 64.42, yA + 0.08, 30.78, { b: 0.01 });
  extra.push(place(new THREE.BoxGeometry(0.3, 0.24, 0.42).rotateZ(0.5), M.bronzeDark, 64.28, yA + 0.22, 30.5));
  extra.push(place(new THREE.PlaneGeometry(0.4, 0.2).rotateY(Math.PI / 2).rotateZ(0.5), M.lampGlass, 64.37, yA + 0.31, 30.5));
  w.addBox([64.05, yA, 30.2, 64.45, yA + 0.4, 30.8], { kind: 'prop', solid: false });
  // norte, sur y este (a la explanada)
  quad(gb, 'travertinoBig', [[B.x0, low, B.z0], [B.x1, low, B.z0], [B.x1, B.top, B.z0], [B.x0, B.top, B.z0]], [0, 0, -1]);
  quad(gb, 'travertinoBig', [[B.x1, low, B.z1], [B.x0, low, B.z1], [B.x0, B.top, B.z1], [B.x1, B.top, B.z1]], [0, 0, 1]);
  const E = (z0, z1, y0, y1) => quad(gb, 'travertinoBig', [[B.x1, y0, z0], [B.x1, y0, z1], [B.x1, y1, z1], [B.x1, y1, z0]], [1, 0, 0]);
  E(B.z0, 21, -2.8, B.top);
  E(23, 24, -2.8, B.top);
  E(37, 38, -2.8, B.top);
  E(40, B.z1, -2.8, B.top);
  E(21, 23, 0.1, B.top);
  E(38, 40, 0.1, B.top);
  E(24, 37, -2.8, B.top);
  for (const [z0, z1] of [[21, 23], [38, 40]]) {
    quad(gb, 'travertino', [[B.x1 - 1, -2.6, z0], [B.x1, -2.6, z0], [B.x1, 0.1, z0], [B.x1 - 1, 0.1, z0]], [0, 0, 1]);
    quad(gb, 'travertino', [[B.x1, -2.6, z1], [B.x1 - 1, -2.6, z1], [B.x1 - 1, 0.1, z1], [B.x1, 0.1, z1]], [0, 0, -1]);
    quad(gb, 'travertino', [[B.x1 - 1, 0.1, z0], [B.x1, 0.1, z0], [B.x1, 0.1, z1], [B.x1 - 1, 0.1, z1]], [0, -1, 0]);
  }
  // zócalo de piedra oscura al pie de las caras de la explanada y la cornisa de arriba
  sweep(gb, 'travertinoDark', [B.x0 + 0.2, B.z0], [B.x1, B.z0], [0, -1], PROFILE.zocalo(2), { y: -2.6, caps: false });
  sweep(gb, 'travertinoDark', [B.x1, B.z1], [B.x0 + 0.2, B.z1], [0, 1], PROFILE.zocalo(2), { y: -2.6, caps: false });
  const c = [[B.x0, B.z0], [B.x0, B.z1], [B.x1, B.z1], [B.x1, B.z0]];
  const outs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (let i = 0; i < 4; i++) sweep(gb, 'travertino', c[i], c[(i + 1) % 4], outs[i], PROFILE.cornisa(1.1), { y: B.top - 0.36, caps: false });
  // la terraza de arriba del basamento
  quad(gb, 'travertinoDark', [[B.x0, B.top, B.z1], [B.x1, B.top, B.z1], [B.x1, B.top, B.z0], [B.x0, B.top, B.z0]], [0, 1, 0]);
  // los dos grupos de bronce de las esquinas del lado del Patio (jinete con lanza)
  for (const z of [21.4, 39.6]) {
    bbox(gb, 'travertino', 66.4, B.top, z - 1.0, 68.6, B.top + 0.7, z + 1.0, { b: 0.04, top: 'travStep' });
    extra.push(...statue('jinete', LB, 67.5, B.top + 0.7, z, -Math.PI / 2, 1.0));
  }
  // ---- el cuerpo alto: las estatuas blancas, el escudo y las frases
  const U = UP;
  bbox(gb, 'travertinoBig', U.x0, B.top, U.z0, U.x1, U.top, U.z1, { b: 0.05, skip: ['bottom'] });
  for (let i = 0; i < 4; i++) {
    const cu = [[U.x0, U.z0], [U.x0, U.z1], [U.x1, U.z1], [U.x1, U.z0]];
    sweep(gb, 'travertino', cu[i], cu[(i + 1) % 4], outs[i], PROFILE.cornisa(0.9), { y: U.top - 0.3, caps: false });
  }
  // la Pampa y los Andes: de pie en los hombros del cuerpo alto, mirando al Patio
  for (const [z, kind] of [[23.4, 'pampa'], [37.6, 'andes']]) {
    bbox(gb, 'travertino', U.x0 + 0.1, U.top, z - 0.7, U.x0 + 1.5, U.top + 0.5, z + 0.7, { b: 0.04, top: 'travStep' });
    extra.push(...statue(kind, LM, U.x0 + 0.8, U.top + 0.5, z, -Math.PI / 2, 1.25));
  }
  const medTex = toTexture(escudoMedallon(512));
  const med = new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.85 });
  extra.push(place(new THREE.CircleGeometry(1.0, 40), med, U.x0 - 0.012, 8.9, 30.5, -Math.PI / 2));
  // la frase de Belgrano del lado del río (y la del Patio, más corta)
  plaque(extra, ['CUÁN EXECRABLE ES EL ULTRAJAR', 'LA DIGNIDAD DE LOS PUEBLOS', 'VIOLANDO SU CONSTITUCIÓN'], U.x1 + 0.012, 9.4, 30.5, Math.PI / 2, 5.2);
  plaque(extra, ['A LA BANDERA', 'DE LA PATRIA'], U.x0 - 0.012, 10.55, 30.5, -Math.PI / 2, 3.0);
  // la cruz latina en relieve del lado de la Proa (abajo de la frase)
  bbox(gb, 'travertino', U.x1, 6.8, 30.1, U.x1 + 0.14, 8.4, 30.9, { b: 0.02 });
  bbox(gb, 'travertino', U.x1, 7.75, 29.5, U.x1 + 0.14, 8.1, 31.5, { b: 0.02 });
}

// Un nicho de medio punto en una pared que mira al oeste (x = x0), hacia adentro.
function niche(gb, x0, z0, z1, y0, yTop, depth) {
  const r = (z1 - z0) / 2;
  const zc = (z0 + z1) / 2;
  const ySpring = yTop - r;
  const xi = x0 + depth;
  // el fondo
  quad(gb, 'travertino', [[xi, y0, z1], [xi, y0, z0], [xi, ySpring, z0], [xi, ySpring, z1]], [-1, 0, 0]);
  // los costados y el piso del nicho
  quad(gb, 'travertino', [[x0, y0, z0], [xi, y0, z0], [xi, ySpring, z0], [x0, ySpring, z0]], [0, 0, 1]);
  quad(gb, 'travertino', [[xi, y0, z1], [x0, y0, z1], [x0, ySpring, z1], [xi, ySpring, z1]], [0, 0, -1]);
  quad(gb, 'travertinoDark', [[x0, y0, z1], [xi, y0, z1], [xi, y0, z0], [x0, y0, z0]], [0, 1, 0]);
  // la bóveda: gajos del medio cañón, y el fondo en abanico; la pared del
  // frente rellena las enjutas (los triángulos entre el arco y el rectángulo)
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI;
    const a1 = ((i + 1) / N) * Math.PI;
    const p = (a, x) => [x, ySpring + Math.sin(a) * r, zc + Math.cos(a) * r];
    quad(gb, 'travertino', [p(a0, x0), p(a1, x0), p(a1, xi), p(a0, xi)], [0, -1, 0].map((v, k) => (k === 1 ? -Math.sin((a0 + a1) / 2) : k === 2 ? -Math.cos((a0 + a1) / 2) : 0)));
    quad(gb, 'travertino', [[xi, ySpring, zc], p(a0, xi), p(a1, xi), [xi, ySpring, zc]], [-1, 0, 0]);
    // la enjuta del frente: del arco hasta yTop
    const q0 = p(a0, x0);
    const q1 = p(a1, x0);
    quad(gb, 'travertinoBig', [q0, [x0, yTop, q0[2]], [x0, yTop, q1[2]], q1], [-1, 0, 0]);
  }
  // la moldura del arco (una arquivolta apenas saliente)
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI;
    const a1 = ((i + 1) / N) * Math.PI;
    const p = (a, rr, x) => [x, ySpring + Math.sin(a) * rr, zc + Math.cos(a) * rr];
    quad(gb, 'travStep', [p(a0, r, x0 - 0.06), p(a0, r + 0.22, x0 - 0.06), p(a1, r + 0.22, x0 - 0.06), p(a1, r, x0 - 0.06)], [-1, 0, 0]);
    quad(gb, 'travStep', [p(a0, r + 0.22, x0 - 0.06), p(a0, r + 0.22, x0), p(a1, r + 0.22, x0), p(a1, r + 0.22, x0 - 0.06)], [0, 1, 0]);
  }
}

// Una placa de letras talladas (varias líneas) en la piedra.
function plaque(extra, lines, x, y, z, ry, width) {
  const H = 160;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = H * lines.length;
  const ctx = c.getContext('2d');
  lines.forEach((t, i) => ctx.drawImage(carvedText(t, { w: 2048, h: H, size: 96, spacing: 0.22 }), 0, i * H));
  const tex = toTexture(c);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const h = (width * c.height) / c.width;
  extra.push(place(new THREE.PlaneGeometry(width, h), mat, x, y, z, ry));
}

// ---------------- el fuste ----------------
function buildFuste(w, gb, extra) {
  const T = TORRE;
  const y0 = UP.top;
  const y1 = T.mir;
  // el fuste con las esquinas ochavadas
  bbox(gb, 'travertinoBig', T.x0, y0, T.z0, T.x1, y1, T.z1, { b: 0.45, corners: true, skip: ['top', 'bottom'] });
  // las fajas verticales que marcan los retranqueos de las esquinas (12 cm afuera)
  const fa = 0.12;
  for (const z of [T.z0 + 1.0, T.z1 - 1.6]) {
    bbox(gb, 'travertinoBig', T.x0 - fa, y0, z, T.x0, y1 - 1.2, z + 0.6, { b: 0.02, skip: ['bottom', '+x'] });
    bbox(gb, 'travertinoBig', T.x1, y0, z, T.x1 + fa, y1 - 1.2, z + 0.6, { b: 0.02, skip: ['bottom', '-x'] });
  }
  for (const x of [T.x0 + 1.0, T.x1 - 1.6]) {
    bbox(gb, 'travertinoBig', x, y0, T.z0 - fa, x + 0.6, y1 - 1.2, T.z0, { b: 0.02, skip: ['bottom', '+z'] });
    bbox(gb, 'travertinoBig', x, y0, T.z1, x + 0.6, y1 - 1.2, T.z1 + fa, { b: 0.02, skip: ['bottom', '-z'] });
  }
  // el sol tallado arriba, en las dos caras anchas (al Patio y al río) y en las angostas, más chico
  // (como en las fotos de la Torre: una roseta de bronce, el sol con sus
  // rayos sobre la piedra lisa, que se ve de lejos y se prende con los
  // reflectores: world/monumentoLuces.js statues; 5 cm afuera, delante del
  // lavado de luz. globalThis.__mduNoRoseta: el disco tallado de antes)
  const roseta = globalThis.__mduNoRoseta !== true;
  const solTex = roseta ? toTexture(rosetaCanvas(512), { repeat: false }) : toTexture(solRelief(512));
  const sol = roseta
    ? new THREE.MeshStandardMaterial({ map: solTex, emissiveMap: solTex, emissive: 0xffd2a0, emissiveIntensity: 0, roughness: 0.45, metalness: 0.6, alphaTest: 0.5 })
    : new THREE.MeshStandardMaterial({ map: solTex, roughness: 0.85 });
  // (sin sombra: la placa cuadrada recortada tiraba su sombra cuadrada en la pared)
  if (roseta) (w.mon.litMats ||= []).push(sol), (sol.userData.noShadow = true);
  const disc = roseta ? new THREE.PlaneGeometry(2, 2) : new THREE.CircleGeometry(1.0, 36);
  const ys = T.mir - 4.2;
  const d = roseta ? 0.05 : 0.012;
  // (la roseta, más grande: en las fotos ocupa un cuarto del ancho de la cara)
  const big = roseta ? 1.6 : 1.2;
  const small = roseta ? 1.1 : 0.8;
  extra.push(place(disc, sol, T.x0 - d, ys, T.cz, -Math.PI / 2, big));
  extra.push(place(disc, sol, T.x1 + d, ys, T.cz, Math.PI / 2, big));
  extra.push(place(disc, sol, T.cx, ys, T.z0 - d, Math.PI, small));
  extra.push(place(disc, sol, T.cx, ys, T.z1 + d, 0, small));
  // una faja de cornisa donde empieza el Mirador (no con el Mirador a ras:
  // la Torre sube plana hasta el techo, sin nada saliente; monumentoTorre buildMirador)
  const c = [[T.x0, T.z0], [T.x0, T.z1], [T.x1, T.z1], [T.x1, T.z0]];
  const outs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  if (!miradorRas()) for (let i = 0; i < 4; i++) sweep(gb, 'travertino', c[i], c[(i + 1) % 4], outs[i], PROFILE.listel(1.8), { y: y1 - 0.1, caps: false });
}

// La roseta de bronce de la Torre: el sol con la cara lisa, un anillo y 24
// rayos en punta, alternados largos y cortos, sobre fondo transparente
// (alphaTest); el bronce con su pátina verde en los huecos y el metal limpio
// en lo alto, la luz de arriba a la izquierda ya pintada.
function rosetaCanvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const k = S / 512;
  x.translate(S / 2, S / 2);
  x.scale(k, k);
  const grad = (r0, r1, a, b) => {
    const gr = x.createRadialGradient(-r1 * 0.3, -r1 * 0.3, r0, 0, 0, r1);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    return gr;
  };
  // los rayos: cada uno con su lomo (dos mitades, una más clara)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const L = i % 2 ? 190 : 248;
    const wd = i % 2 ? 15 : 20;
    x.save();
    x.rotate(a);
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(78, 0);
      x.lineTo(84, s * wd);
      x.lineTo(L, 0);
      x.closePath();
      const lit = Math.cos(a + Math.PI * 0.75) * s;
      x.fillStyle = lit > 0 ? '#c09a5a' : '#6e5636';
      x.fill();
    }
    x.restore();
  }
  // el anillo y la cara
  x.beginPath();
  x.arc(0, 0, 92, 0, Math.PI * 2);
  x.fillStyle = grad(10, 92, '#d2ae6c', '#5e4a2e');
  x.fill();
  x.beginPath();
  x.arc(0, 0, 72, 0, Math.PI * 2);
  x.fillStyle = '#4a5e4c';
  x.fill();
  x.beginPath();
  x.arc(0, 0, 66, 0, Math.PI * 2);
  x.fillStyle = grad(6, 66, '#e2c07e', '#7a5e38');
  x.fill();
  // la pátina verde que chorrea de los rayos
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(88,140,116,0.35)';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.06;
    x.beginPath();
    x.arc(Math.cos(a) * 120, Math.sin(a) * 120, 14, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

// El sol de la Torre: un disco con rayos alternados (rectos y flamígeros).
function solRelief(size) {
  return reliefCanvas(size, (ctx, S) => {
    const c = S / 2;
    const g = (v) => `rgb(${v},${v},${v})`;
    ctx.fillStyle = g(50);
    ctx.beginPath();
    ctx.arc(c, c, S * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g(190);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      ctx.beginPath();
      const r0 = S * 0.17;
      const L = i % 2 ? S * 0.22 : S * 0.29;
      ctx.moveTo(r0, -S * 0.02);
      if (i % 2) {
        ctx.quadraticCurveTo(r0 + L * 0.5, S * 0.04, r0 + L, 0);
        ctx.quadraticCurveTo(r0 + L * 0.5, -S * 0.04, r0, S * 0.02);
      } else {
        ctx.lineTo(r0 + L, 0);
        ctx.lineTo(r0, S * 0.02);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = g(230);
    ctx.beginPath();
    ctx.arc(c, c, S * 0.15, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------- el Mirador y el remate ----------------
function buildMirador(w, gb, extra) {
  const T = TORRE;
  const y0 = T.mir;
  const sill = y0 + 1.05;
  const lint = T.lint;
  // el antepecho (todo alrededor) y el dintel corrido
  const ring = (ya, yb, skip) => {
    bbox(gb, 'travertinoBig', T.x0, ya, T.z0, T.x1, yb, T.z0 + 1, { b: 0.02, skip });
    bbox(gb, 'travertinoBig', T.x0, ya, T.z1 - 1, T.x1, yb, T.z1, { b: 0.02, skip });
    bbox(gb, 'travertinoBig', T.x0, ya, T.z0 + 1, T.x0 + 1, yb, T.z1 - 1, { b: 0.02, skip });
    bbox(gb, 'travertinoBig', T.x1 - 1, ya, T.z0 + 1, T.x1, yb, T.z1 - 1, { b: 0.02, skip });
  };
  // El Mirador a ras de la Torre (pedido del usuario: la cara sube plana hasta
  // el techo): el antepecho y los parantes de las esquinas siguen las ochavas
  // del fuste; antes eran de esquinas vivas y, con la faja de cornisa de abajo
  // y la moldura de arriba, la franja de las ventanas sobresalía.
  // globalThis.__mduNoMiradorRas: como antes.
  const ras = miradorRas();
  if (ras) octoRing(gb, 'travertinoBig', T.x0, T.z0, T.x1, T.z1, T.chamfer, 1, y0 - 0.01, sill);
  else ring(y0 - 0.01, sill, ['bottom']);
  // (el antepecho es de esquinas vivas y el fuste de abajo, ochavado: en cada
  // esquina, desde abajo se veía adentro por el triángulo sin piso)
  if (!ras && globalThis.__mduNoZfix !== true) {
    const c = T.chamfer;
    for (const [X, Z, sx, sz] of [[T.x0, T.z0, 1, 1], [T.x1, T.z0, -1, 1], [T.x1, T.z1, -1, -1], [T.x0, T.z1, 1, -1]]) {
      quad(gb, 'travertinoBig', [[X, y0 - 0.01, Z], [X + sx * c, y0 - 0.01, Z], [X, y0 - 0.01, Z + sz * c], [X, y0 - 0.01, Z + sz * c]], [0, -1, 0]);
    }
  }
  // El remate como el de verdad (las fotos de la Torre): el fuste sigue liso
  // arriba de las ventanas, con las esquinas ochavadas como abajo, y termina
  // plano, con una losa de coronamiento apenas saliente. Antes eran tres
  // cajas escalonadas como una torta (globalThis.__mduNoRemate: las de antes).
  const nuevo = globalThis.__mduNoRemate !== true;
  // (el dintel con su cara de abajo: desde adentro se ve, si no queda hueco y se ve el cielo)
  if (!nuevo) ring(lint, lint + 0.4, []);
  // los parantes entre las ventanas (las ventanas: 4 en las caras largas, 2 en las cortas)
  const pierW = 0.7;
  const along = (a0, a1, n) => {
    const out = [];
    const step = (a1 - a0) / n;
    for (let i = 0; i <= n; i++) out.push(a0 + i * step);
    return out;
  };
  const isCorner = (a, a0, a1) => a <= a0 + 0.01 || a >= a1 - 0.01;
  for (const z of along(T.z0, T.z1, 4)) {
    if (ras && isCorner(z, T.z0, T.z1)) continue;
    for (const x of [T.x0, T.x1 - 1]) bbox(gb, 'travertinoBig', x, sill, Math.max(T.z0, z - pierW / 2), x + 1, lint, Math.min(T.z1, z + pierW / 2), { b: 0.03 });
  }
  // (los de las esquinas, sin lo que ya tapa el parante del costado: las dos
  // caras de afuera quedaban en el mismo plano y titilaban)
  const fix = globalThis.__mduNoZfix !== true;
  for (const x of along(T.x0, T.x1, 2)) {
    const corner = fix && isCorner(x, T.x0, T.x1);
    if (ras && corner) continue;
    for (const z of [T.z0, T.z1 - 1]) bbox(gb, 'travertinoBig', Math.max(T.x0, x - pierW / 2), sill, z + (corner && z === T.z0 ? pierW / 2 : 0), Math.min(T.x1, x + pierW / 2), lint, z + 1 - (corner && z !== T.z0 ? pierW / 2 : 0), { b: 0.03 });
  }
  // con el Mirador a ras, cada esquina es un parante en L (un metro por cada
  // cara, lo mismo que juntaban los dos de antes) con la ochava afuera
  if (ras) {
    for (const [X, Z, sx, sz] of [[T.x0, T.z0, 1, 1], [T.x1, T.z0, -1, 1], [T.x1, T.z1, -1, -1], [T.x0, T.z1, 1, -1]]) {
      const h = pierW / 2;
      const c = T.chamfer;
      prism(gb, 'travertinoBig', [[c, 0], [1, 0], [1, h], [h, h], [h, 1], [0, 1], [0, c]].map(([u, v]) => [X + sx * u, Z + sz * v]), sill, lint);
    }
  }
  // las ventanas de los muertos del Mirador (config WINDOWS): las tablas de
  // Barriers miden 1,18 m y el vano 2,3; quedaban colgadas en el medio, sin
  // tocar nada. Dos parantes de madera, del antepecho al dintel, donde se clavan.
  for (const wi of WINDOWS) {
    if (wi.zone !== 'I' || globalThis.__mduNoParantes === true) continue;
    const [ox, oz] = wi.out;
    const px = wi.cell[0] + 0.5 - ox * (0.42 - 0.053);
    const pz = wi.cell[1] + 0.5 - oz * (0.42 - 0.053);
    for (const s of [-1, 1]) {
      const x = px + Math.abs(oz) * s * 0.54;
      const z = pz + Math.abs(ox) * s * 0.54;
      const hx = oz ? 0.04 : 0.03;
      const hz = oz ? 0.03 : 0.04;
      bbox(gb, 'muelleDark', x - hx, sill, z - hz, x + hx, lint, z + hz, { b: 0.006 });
    }
  }
  // el cielorraso del Mirador: la cara de abajo del remate (un cielorraso
  // aparte, en el mismo plano, titilaba con ella)
  if (!nuevo && globalThis.__mduNoZfix === true) quad(gb, 'travertino', [[T.x0 + 1, lint + 0.4, T.z0 + 1], [T.x1 - 1, lint + 0.4, T.z0 + 1], [T.x1 - 1, lint + 0.4, T.z1 - 1], [T.x0 + 1, lint + 0.4, T.z1 - 1]], [0, -1, 0]);
  let y = lint + 0.4;
  if (nuevo) {
    // el cuerpo, del dintel arriba (su cara de abajo es el techo del Mirador)
    const c = T.chamfer;
    octo(gb, 'travertinoBig', T.x0, T.z0, T.x1, T.z1, c, lint, T.remate, { bottom: 'travertino', top: false });
    // la losa de coronamiento: 7 cm afuera, con su vuelo y la terraza arriba
    octo(gb, 'travStep', T.x0 - 0.07, T.z0 - 0.07, T.x1 + 0.07, T.z1 + 0.07, c + 0.03, T.remate, T.roof, { bottom: 'travertino', top: 'travertinoDark' });
    // y una moldura fina donde arranca el remate, arriba de las ventanas (no
    // con el Mirador a ras: sobresalía)
    if (!ras) octo(gb, 'travStep', T.x0 - 0.035, T.z0 - 0.035, T.x1 + 0.035, T.z1 + 0.035, c + 0.015, lint + 0.38, lint + 0.5, { bottom: 'travertino', top: 'travStep' });
    y = T.roof;
  } else {
    // el remate escalonado (tres cuerpos que se achican) con la cornisa
    const steps = [[0.25, 0.9], [0.6, 1.1], [1.4, 0.8]];
    steps.forEach(([ins, h], i) => {
      bbox(gb, 'travertinoBig', T.x0 + ins - (i === 0 ? 0.45 : 0), y, T.z0 + ins - (i === 0 ? 0.45 : 0), T.x1 - ins + (i === 0 ? 0.45 : 0), y + h, T.z1 - ins + (i === 0 ? 0.45 : 0), { b: 0.06, corners: i > 0 });
      y += h;
    });
  }
  // la baliza roja de arriba (los aviones) y el asta chica
  const beacon = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 3 });
  extra.push(place(new THREE.SphereGeometry(0.12, 10, 8), beacon, T.cx, y + 0.9, T.cz));
  extra.push(place(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), w.M.iron, T.cx, y + 0.45, T.cz));
  w.mon.beacon = beacon;
  // el ascensor del Mirador: llega por adentro del fuste a una caja de piedra
  // contra la pared del oeste (antes la puerta quedaba parada sola delante de
  // la ventana); la cabina va adentro y la puerta da al Mirador (x 76)
  const H = ELEV.top;
  const hx0 = ELEV.x0;
  const hx1 = ELEV.x1;
  const [hz0, hz1] = [T.cz - 1.1, T.cz + 1.1];
  const [dz0, dz1] = [T.cz - ELEV.hw - 0.12, T.cz + ELEV.hw + 0.12];
  // los costados, el fondo (del lado de la ventana) y el frente con el vano de la puerta
  quad(gb, 'travertinoBig', [[hx0, y0, hz0], [hx1, y0, hz0], [hx1, lint + 0.4, hz0], [hx0, lint + 0.4, hz0]], [0, 0, -1]);
  quad(gb, 'travertinoBig', [[hx1, y0, hz1], [hx0, y0, hz1], [hx0, lint + 0.4, hz1], [hx1, lint + 0.4, hz1]], [0, 0, 1]);
  quad(gb, 'travertinoBig', [[hx0, y0, hz1], [hx0, y0, hz0], [hx0, lint + 0.4, hz0], [hx0, lint + 0.4, hz1]], [-1, 0, 0]);
  quad(gb, 'travertino', [[hx1, y0, hz0], [hx1, y0, dz0], [hx1, lint + 0.4, dz0], [hx1, lint + 0.4, hz0]], [1, 0, 0]);
  quad(gb, 'travertino', [[hx1, y0, dz1], [hx1, y0, hz1], [hx1, lint + 0.4, hz1], [hx1, lint + 0.4, dz1]], [1, 0, 0]);
  quad(gb, 'travertino', [[hx1, y0 + H, dz0], [hx1, y0 + H, dz1], [hx1, lint + 0.4, dz1], [hx1, lint + 0.4, dz0]], [1, 0, 0]);
  // un zócalo oscuro y una moldura arriba de la puerta
  bbox(gb, 'travertinoDark', hx1, y0, hz0, hx1 + 0.03, y0 + 0.16, dz0, { b: 0.01 });
  bbox(gb, 'travertinoDark', hx1, y0, dz1, hx1 + 0.03, y0 + 0.16, hz1, { b: 0.01 });
  bbox(gb, 'travStep', hx1, y0 + H + 0.12, hz0 - 0.04, hx1 + 0.06, y0 + H + 0.22, hz1 + 0.04, { b: 0.01 });
  // choques: los costados de la caja y el fondo (la cabina, adentro, se camina)
  w.addBox([hx0, y0, hz0, hx1, lint + 0.4, dz0 + 0.08], { kind: 'wall' });
  w.addBox([hx0, y0, dz1 - 0.08, hx1, lint + 0.4, hz1], { kind: 'wall' });
  w.addBox([hx0, y0, hz0, hx1 - ELEV.dep, lint + 0.4, hz1], { kind: 'wall' });
  elevatorDoor(gb, extra, w, hx1 + 0.001, y0, T.cz, 1);
}

// El Mirador a ras de la Torre (globalThis.__mduNoMiradorRas: como antes).
export const miradorRas = () => globalThis.__mduNoMiradorRas !== true && globalThis.__mduNoRemate !== true;

// Un prisma de cualquier planta (los costados, sin tapas): pts [[x, z], ...];
// `inward`: las caras miran para adentro (el hueco de un anillo).
function prism(gb, key, pts, y0, y1, inward = false) {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    a2 += ax * bz - bx * az;
  }
  const s = (a2 > 0 ? 1 : -1) * (inward ? -1 : 1);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    quad(gb, key, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [s * (bz - az), 0, -s * (bx - ax)]);
  }
}

// Un anillo de planta ochavada (el antepecho del Mirador): afuera la ochava
// (como el fuste), adentro el rectángulo `t` más chico, y la tapa de arriba.
function octoRing(gb, key, x0, z0, x1, z1, c, t, y0, y1) {
  octo(gb, key, x0, z0, x1, z1, c, y0, y1, { top: false, bottom: false });
  const [i0, k0, i1, k1] = [x0 + t, z0 + t, x1 - t, z1 - t];
  prism(gb, key, [[i0, k0], [i0, k1], [i1, k1], [i1, k0]], y0, y1, true);
  const Y = y1;
  const tops = [
    [[x0 + c, z0], [x1 - c, z0], [i1, k0], [i0, k0]],
    [[x1, z0 + c], [x1, z1 - c], [i1, k1], [i1, k0]],
    [[x1 - c, z1], [x0 + c, z1], [i0, k1], [i1, k1]],
    [[x0, z1 - c], [x0, z0 + c], [i0, k0], [i0, k1]],
    [[x1 - c, z0], [x1, z0 + c], [i1, k0], [i1, k0]],
    [[x1, z1 - c], [x1 - c, z1], [i1, k1], [i1, k1]],
    [[x0 + c, z1], [x0, z1 - c], [i0, k1], [i0, k1]],
    [[x0, z0 + c], [x0 + c, z0], [i0, k0], [i0, k0]],
  ];
  for (const q of tops) quad(gb, key, q.map(([x, z]) => [x, Y, z]), [0, 1, 0]);
}

// Un prisma de planta ochavada (un rectángulo con las cuatro esquinas
// cortadas a 45°, c m): los ocho costados, y la tapa de arriba y la de abajo
// (top/bottom: el material, o false). Para el remate de la Torre.
function octo(gb, key, x0, z0, x1, z1, c, y0, y1, { top = key, bottom = key } = {}) {
  const P = [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
  for (let i = 0; i < 8; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[(i + 1) % 8];
    // (la normal hacia afuera: el contorno va en el sentido de las agujas vistas de arriba)
    quad(gb, key, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [bz - az, 0, -(bx - ax)]);
  }
  // las tapas: el rectángulo del medio y los dos trapecios de los costados
  const caps = [
    [[x0 + c, z0], [x1 - c, z0], [x1 - c, z1], [x0 + c, z1]],
    [[x0, z0 + c], [x0 + c, z0], [x0 + c, z1], [x0, z1 - c]],
    [[x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1]],
  ];
  for (const q of caps) {
    if (top) quad(gb, top, q.map(([x, z]) => [x, y1, z]), [0, 1, 0]);
    if (bottom) quad(gb, bottom, q.map(([x, z]) => [x, y0, z]), [0, -1, 0]);
  }
}

// El ascensor: la cabina (entities/monumento/Ascensor.js) mide `dep` de fondo
// y `hw` de medio ancho; arriba, la caja de piedra del Mirador va de x0 a x1.
export const ELEV = { dep: 0.95, hw: 0.7, top: 2.4, x0: 74.6, x1: 76 };

// La puerta de bronce del ascensor (de dos hojas, con su marco), sobre una
// pared que mira hacia +x (s = 1) o -x (s = -1).
function elevatorDoor(gb, extra, w, x, y, z, s) {
  const M = w.M;
  const hw = ELEV.hw;
  bbox(gb, 'bronzeDark', x - (s > 0 ? 0 : 0.06), y, z - hw - 0.12, x + (s > 0 ? 0.06 : 0), y + 2.4, z - hw, { b: 0.01 });
  bbox(gb, 'bronzeDark', x - (s > 0 ? 0 : 0.06), y, z + hw, x + (s > 0 ? 0.06 : 0), y + 2.4, z + hw + 0.12, { b: 0.01 });
  bbox(gb, 'bronzeDark', x - (s > 0 ? 0 : 0.06), y + 2.28, z - hw - 0.12, x + (s > 0 ? 0.06 : 0), y + 2.5, z + hw + 0.12, { b: 0.01 });
  const leaves = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.28, hw), M.bronze);
    // (un poco adentro del vano: al abrir corren por detrás de la pared, no por delante)
    leaf.position.set(x - s * 0.035, y + 1.14, z + side * hw * 0.5);
    leaf.userData.side = side;
    leaf.userData.dynamic = true;
    leaves.push(leaf);
    w.root.add(leaf);
  }
  (w.mon.elevDoors ||= []).push({ leaves, x, y, z, hw });
}

// ---------------- la Proa ----------------
function buildProa(w, gb, extra) {
  const M = w.M;
  const [[ax, az], [bx, bz]] = PROA.side;
  const zc = PROA.z;
  // las terrazas del pie: siguen la grilla bloqueada (de a fajas de 1 m), con pasto arriba
  const rows = [[82, 23, 38], [83, 23, 38], [84, 23, 38], [85, 24, 37], [86, 24, 37], [87, 26, 35], [88, 26, 35], [89, 28, 33], [90, 28, 33]];
  for (const [x, z0, z1] of rows) {
    bbox(gb, 'travertino', x, -2.6, z0, x + 1, -2.0, z1, { b: 0.04, top: 'travStep' });
    // (el pasto 1 cm arriba de la piedra: a 1 mm, de lejos titilaba)
    const gy = globalThis.__mduNoZfix === true ? -1.999 : -1.99;
    quad(gb, 'grass', [[x + 0.06, gy, z1 - 0.06], [x + 0.94, gy, z1 - 0.06], [x + 0.94, gy, z0 + 0.06], [x + 0.06, gy, z0 + 0.06]], [0, 1, 0]);
  }
  // la cuña: de la cara del basamento a la punta, con el lomo que baja
  const yb = -2.0;
  const topY = (x) => PROA.top0 + ((x - 82) / (bx - 82)) * (PROA.top1 - PROA.top0);
  const N = [[ax, az], [bx, bz], [PROA.tipX, zc], [bx, 2 * zc - bz], [ax, 2 * zc - az]];
  for (let i = 0; i < N.length - 1; i++) {
    const [x0, z0] = N[i];
    const [x1, z1] = N[i + 1];
    const t0 = x0 >= bx ? PROA.top1 : topY(x0);
    const t1 = x1 >= bx ? PROA.top1 : topY(x1);
    // la normal de afuera (el contorno va de norte a sur por el lado del río)
    const nx = z1 - z0;
    const nz = -(x1 - x0);
    quad(gb, 'travertinoBig', [[x0, yb, z0], [x1, yb, z1], [x1, t1, z1], [x0, t0, z0]], [nx, 0, nz]);
  }
  // el lomo (dos faldones que se juntan en el eje) y la nariz
  quad(gb, 'travStep', [[ax, topY(ax), az], [ax, topY(ax) + 0.35, zc], [bx, PROA.top1 + 0.35, zc], [bx, PROA.top1, bz]], [0, 1, -0.3]);
  quad(gb, 'travStep', [[ax, topY(ax), 2 * zc - az], [bx, PROA.top1, 2 * zc - bz], [bx, PROA.top1 + 0.35, zc], [ax, topY(ax) + 0.35, zc]], [0, 1, 0.3]);
  quad(gb, 'travStep', [[bx, PROA.top1, bz], [bx, PROA.top1 + 0.35, zc], [PROA.tipX, PROA.top1, zc], [PROA.tipX, PROA.top1, zc]], [1, 1, -0.3]);
  quad(gb, 'travStep', [[bx, PROA.top1, 2 * zc - bz], [PROA.tipX, PROA.top1, zc], [PROA.tipX, PROA.top1, zc], [bx, PROA.top1 + 0.35, zc]], [1, 1, 0.3]);
  // el pedestal de la Patria Abanderada: un cilindro de piedra con la leyenda
  const px = 87.2;
  const r = 1.45;
  const pyTop = 7.0;
  const ped = new THREE.CylinderGeometry(r, r * 1.04, pyTop - yb, 40, 1, false);
  ped.translate(0, (pyTop + yb) / 2, 0);
  const uv = ped.attributes.uv;
  const pos = ped.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    uv.setXY(i, (a * r) / 2, pos.getY(i) / 2);
  }
  extra.push(place(ped, M.travertinoBig, px, 0, zc));
  // la leyenda en el frente curvo (mirando al río): LA PATRIA A SU BANDERA
  const leg = toTexture(carvedText('LA PATRIA A SU BANDERA', { w: 2048, h: 180, size: 120, spacing: 0.3 }));
  const legM = new THREE.MeshStandardMaterial({ map: leg, roughness: 0.9, transparent: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const arc = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.95, 40, 1, true, Math.PI / 2 - 0.95, 1.9);
  extra.push(place(arc, legM, px, 3.2, zc));
  // una cornisa arriba del pedestal y la estatua
  const cap = lathe([[0, 0], [r + 0.08, 0], [r + 0.16, 0.1], [r + 0.16, 0.28], [r + 0.06, 0.34], [0, 0.34]], 40);
  if (globalThis.__mduNoCylUV !== true) cylUV(cap);
  extra.push(place(cap, M.travertino, px, pyTop, zc));
  const LB = globalThis.__mduNoTorreLuz === true ? M.bronze : M.bronzeLit;
  const LM = globalThis.__mduNoTorreLuz === true ? M.marble : M.marbleLit;
  extra.push(...statue('patria', LB, px, pyTop + 0.34, zc, Math.PI / 2, 1.7));
  // los colosos del agua a los costados de la Proa: el Río Paraná y el Océano Atlántico
  for (const [z, kind, ry] of [[24.2, 'parana', 0.5], [36.8, 'atlantico', Math.PI - 0.5]]) {
    // (el pedestal baja hasta la explanada: se sale de las terrazas del pie y
    // del lado de afuera quedaba volando 60 cm sobre el piso)
    bbox(gb, 'travertino', 84.6, -2.6, z - 0.9, 86.4, -1.4, z + 0.9, { b: 0.04, top: 'travStep' });
    extra.push(...statue(kind, LM, 85.5, -1.4, z, ry, 1.3));
  }
}

// ---------------- la Cripta de Belgrano ----------------
function buildCripta(w, gb, extra) {
  const M = w.M;
  // el ascensor: en la nave, contra la pared del este (x 72). Las celdas de
  // atrás de la puerta (x 72, z 29 a 31) son de la Cripta: ahí está la cabina
  // y se entra caminando (entities/monumento/Ascensor.js); la pared tiene el vano
  const elev = (x, z, dx) => dx === 1 && x === 71 && z >= 29 && z <= 31;
  roomShell(w, gb, ['D'], { wall: 'cryptStone', ceil: 'cryptCeil', base: 'travertinoDark', skip: (x, z, dx) => elev(x, z, dx) });
  const x = 72;
  const [ez0, ez1] = [30.5 - ELEV.hw - 0.12, 30.5 + ELEV.hw + 0.12];
  quad(gb, 'cryptStone', [[x, -3.0, ez0], [x, -3.0, 29], [x, -2.6 + ELEV.top, 29], [x, -2.6 + ELEV.top, ez0]], [-1, 0, 0]);
  quad(gb, 'cryptStone', [[x, -3.0, 32], [x, -3.0, ez1], [x, -2.6 + ELEV.top, ez1], [x, -2.6 + ELEV.top, 32]], [-1, 0, 0]);
  quad(gb, 'cryptStone', [[x, 1.0, 32], [x, 1.0, 29], [x, -2.6 + ELEV.top, 29], [x, -2.6 + ELEV.top, 32]], [-1, 0, 0]);
  // el zócalo de los dos lados del vano
  bbox(gb, 'travertinoDark', x - 0.03, -2.6, 29, x, -2.44, ez0, { b: 0.01 });
  bbox(gb, 'travertinoDark', x - 0.03, -2.6, ez1, x, -2.44, 32, { b: 0.01 });
  // choques: los costados de la cabina (lo de atrás del muro, a los lados del vano)
  w.addBox([x, -2.6, 29, x + 1, 1.0, 30.5 - ELEV.hw + 0.08], { kind: 'wall' });
  w.addBox([x, -2.6, 30.5 + ELEV.hw - 0.08, x + 1, 1.0, 32], { kind: 'wall' });
  w.addBox([x + ELEV.dep, -2.6, 29, x + 1, 1.0, 32], { kind: 'wall' });
  elevatorDoor(gb, extra, w, x - 0.001, -2.6, 30.5, -1);
  // las escaleras de la Cripta
  for (const R of RAMPS.filter((r) => r.own === 'cripta')) stairs(gb, R, { count: 16, base: -3.0, riser: 'cryptStone', tread: 'travStep' });
  // Belgrano: el bronce de Fioravanti sobre su pedestal, al fondo de la nave, mirando al ascensor
  bbox(gb, 'cryptStone', 67.05, -2.6, 29.3, 68.4, -1.6, 31.7, { b: 0.04 });
  bbox(gb, 'travertino', 67.0, -1.6, 29.2, 68.5, -1.45, 31.8, { b: 0.03 });
  extra.push(...statue('belgrano', M.bronze, 67.75, -1.45, 30.5, Math.PI / 2, 1.05));
  w.addBox([67.0, -2.6, 29.2, 68.5, 0.6, 31.8], { kind: 'prop' });
  // la piedra fundamental (1898) en el piso, delante del pedestal
  bbox(gb, 'travertinoDark', 69.0, -2.62, 29.9, 70.0, -2.57, 31.1, { b: 0.01 });
  // la cruz en la pared, arriba de Belgrano
  bbox(gb, 'bronzeDark', 67.0, -0.4, 30.42, 67.06, 0.85, 30.58, { b: 0.005 });
  bbox(gb, 'bronzeDark', 67.0, 0.3, 30.1, 67.06, 0.44, 30.9, { b: 0.005 });
  // las banderas de las alas (astas de bronce con la bandera colgando)
  w.mon.cryptFlags = [[74.5, 21.2], [78.5, 21.2], [74.5, 39.8], [78.5, 39.8]];
  // la lámpara votiva de Belgrano: el vaso de vidrio colorado sobre su pie de
  // bronce (la luz de config LIGHTS va ahí; antes brillaba sola en el aire)
  extra.push(place(lathe([[0, 0], [0.2, 0], [0.2, 0.04], [0.06, 0.12], [0.035, 0.3], [0.03, 1.3], [0.06, 1.38], [0.12, 1.46], [0.12, 1.5], [0, 1.5]], 12), M.bronze, 68.75, -2.6, 30.5));
  const votiva = new THREE.MeshStandardMaterial({ color: 0x5a0a06, emissive: 0xff5a20, emissiveIntensity: 1.6, roughness: 0.25, transparent: true, opacity: 0.88 });
  extra.push(place(new THREE.CylinderGeometry(0.075, 0.055, 0.17, 12), votiva, 68.75, -1.02, 30.5));
  w.addBox([68.5, -2.6, 30.25, 69.0, -0.9, 30.75], { kind: 'prop', solid: false });
  // los faroles de bronce colgados del techo de las alas (las luces de las alas)
  const lanternBase = lathe([[0, 0], [0.05, -0.08], [0.15, 0], [0.16, 0.05], [0, 0.05]], 8);
  const lanternCap = lathe([[0, 0], [0.2, 0], [0.07, 0.12], [0.03, 0.18], [0, 0.18]], 8);
  for (const z of [23, 37]) {
    extra.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.98, 4), M.bronzeDark, 76, 0.51, z));
    extra.push(place(lanternCap, M.bronze, 76, -0.16, z));
    extra.push(place(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8, 1, true), M.lampGlass, 76, -0.31, z));
    extra.push(place(lanternBase, M.bronze, 76, -0.51, z));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      extra.push(place(new THREE.BoxGeometry(0.02, 0.32, 0.02), M.bronze, 76 + Math.cos(a) * 0.145, -0.31, z + Math.sin(a) * 0.145));
    }
  }
}

export { elevatorDoor };
