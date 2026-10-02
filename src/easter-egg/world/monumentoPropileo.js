import * as THREE from 'three';
import { RAMPS } from '../config/map';
import { bbox, quad, sweep, stairs, PROFILE, lathe, place } from './monumentoKit';
import { carvedText, escudoMedallon } from './monumentoTextures';
import { toTexture } from '../core/textures';

// El Propileo Triunfal de la Patria: el templo de columnas planas (sin basa
// ni capitel) entre dos pilonos macizos, con el techo plano y las frases del
// Himno en el friso. A escala 1:2: 27 m de ancho (de z 16,5 a 43,5), 13,5 de
// fondo (de x 20,5 a 34) y 10 de alto sobre el piso (4,2). Adentro, cuatro
// filas de doce columnas dejan la nave del medio (x 25 a 30) donde está la
// Llama Votiva (el Pack-a-Pava, world/papLlama.js); delante de cada columna
// de los frentes, una farola de bronce, y en la nave, las ocho urnas de
// bronce verde pompeyano. En el pilono del norte, la escalera que baja a la
// Sala de Honor de las Banderas de América.

export const PROP = {
  x0: 20.5,
  x1: 34.0,
  z0: 16.5,
  z1: 43.5,
  y: 4.2,
  // arriba del todo (la cornisa)
  top: 14.6,
  // los pilonos (el hueco entre ellos es la nave)
  pyN: 21.0,
  pyS: 40.0,
  // las filas de columnas
  rows: [21.55, 24.4, 30.6, 33.45],
};
// las doce columnas de cada fila, simétricas alrededor de la Llama (z 30,5)
export const COLS = Array.from({ length: 12 }, (_, i) => 30.5 + (i - 5.5) * 1.59);
const COL_W = 0.42; // de canto (a lo largo del frente)
const COL_D = 0.76; // de fondo
const SHAFT_TOP = 12.9;

export function buildPropileo(w, gb, extra) {
  const M = w.M;
  const P = PROP;
  const y = P.y;
  // ---- el basamento (la plataforma): de la calle / el estanque hasta el piso.
  // (el del norte, hueco: adentro baja la escalera de la Sala, que sale al
  // oeste por debajo del estanque; su cara del oeste es solo la faja de arriba)
  bbox(gb, 'travertinoBig', P.x0, 1.2, P.z0, P.x1, y, P.pyN, { b: 0.03, skip: ['top', 'bottom', '-x'] });
  // (baja hasta el fondo del estanque: bajo el agua también se veía el vacío)
  quad(gb, 'travertinoBig', [[P.x0, 3.08, P.z0], [P.x0, 3.08, P.pyN], [P.x0, y, P.pyN], [P.x0, y, P.z0]], [-1, 0, 0]);
  bbox(gb, 'travertinoBig', P.x0, 1.2, P.pyS, P.x1, y, P.z1, { b: 0.03, skip: ['top'] });
  // el frente del oeste (contra el Pasaje y el estanque): la cara del escalón
  // (hasta el piso, que va 2 mm arriba: si no, en el canto queda una ranura)
  quad(gb, 'travertino', [[P.x0, 3.0, P.pyN], [P.x0, 3.0, P.pyS], [P.x0, y + 0.004, P.pyS], [P.x0, y + 0.004, P.pyN]], [-1, 0, 0]);
  // ---- los pilonos: macizos, de travertino grande, con el medallón del escudo.
  // El del norte tiene la puerta de la Sala (x 31 a 33, 2,7 m) del lado de la nave.
  const yT = SHAFT_TOP;
  // (las caras de adentro del paso, x 31 y 33, solo en el vano de la puerta:
  // entre z 17 y 20 la escalera sigue al descanso y una cara ahí era una
  // pared de papel que tapaba la escalera vista desde el descanso)
  bbox(gb, 'travertinoBig', P.x0, y, P.z0, 31, yT, P.pyN, { b: 0.04, skip: ['top', 'bottom', '+x'] });
  bbox(gb, 'travertinoBig', 33, y, P.z0, P.x1, yT, P.pyN, { b: 0.04, skip: ['top', 'bottom', '-x'] });
  bbox(gb, 'travertinoBig', 31, y + 2.7, P.z0, 33, yT, P.pyN, { b: 0.04, skip: ['top'] });
  quad(gb, 'travertinoBig', [[31, y, P.pyN], [31, y, 20], [31, y + 2.7, 20], [31, y + 2.7, P.pyN]], [1, 0, 0]);
  quad(gb, 'travertinoBig', [[33, y, 20], [33, y, P.pyN], [33, y + 2.7, P.pyN], [33, y + 2.7, 20]], [-1, 0, 0]);
  // y el frente del pilono hacia la calle, delante del descanso (la sala lo cierra recién en z 17)
  quad(gb, 'travertinoBig', [[33, y, P.z0], [31, y, P.z0], [31, y + 2.7, P.z0], [33, y + 2.7, P.z0]], [0, 0, -1]);
  bbox(gb, 'travertinoBig', P.x0, y, P.pyS, P.x1, yT, P.z1, { b: 0.04, skip: ['top', 'bottom'] });
  // los zócalos (la piedra más oscura abajo) y una faja a media altura, por afuera
  const Z = PROFILE.zocalo(1.4);
  const L = PROFILE.listel(1.2);
  for (const [a, b, out] of [
    [[P.x0, P.z0], [P.x0, P.pyN], [-1, 0]],
    [[P.x1, P.pyN], [P.x1, P.z0], [1, 0]],
    [[P.x0, P.z0], [P.x1, P.z0], [0, -1]],
    [[P.x0, P.pyS], [P.x0, P.z1], [-1, 0]],
    [[P.x1, P.z1], [P.x1, P.pyS], [1, 0]],
    [[P.x1, P.z1], [P.x0, P.z1], [0, 1]],
  ]) {
    sweep(gb, 'travertinoDark', a, b, out, Z, { y, caps: true });
    sweep(gb, 'travertino', a, b, out, L, { y: y + 4.0, caps: true });
  }
  // del lado de la nave: el zócalo del pilono sur entero y el del norte con la puerta
  sweep(gb, 'travertinoDark', [P.x1, P.pyS], [P.x0, P.pyS], [0, -1], Z, { y });
  sweep(gb, 'travertinoDark', [P.x0, P.pyN], [31, P.pyN], [0, 1], Z, { y });
  sweep(gb, 'travertinoDark', [33, P.pyN], [P.x1, P.pyN], [0, 1], Z, { y });
  // ---- el entablamento y el techo: una losa de 1,7 m con el friso de las frases
  const yE = SHAFT_TOP;
  bbox(gb, 'travertinoBig', P.x0 - 0.05, yE, P.z0 - 0.05, P.x1 + 0.05, P.top - 0.32, P.z1 + 0.05, { b: 0.04, skip: ['top'] });
  // la cornisa de remate alrededor
  const c = [[P.x0 - 0.05, P.z0 - 0.05], [P.x0 - 0.05, P.z1 + 0.05], [P.x1 + 0.05, P.z1 + 0.05], [P.x1 + 0.05, P.z0 - 0.05]];
  const outs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (let i = 0; i < 4; i++) sweep(gb, 'travertino', c[i], c[(i + 1) % 4], outs[i], PROFILE.cornisa(1), { y: P.top - 0.32, caps: false });
  // la terraza del techo (un poco más adentro, con su babeta)
  bbox(gb, 'travertinoDark', P.x0 + 0.2, P.top - 0.32, P.z0 + 0.2, P.x1 - 0.2, P.top - 0.18, P.z1 - 0.2, { b: 0.02 });
  // el cielorraso de la nave: casetones entre vigas que van de fila a fila
  const yC = yE;
  quad(gb, 'travertino', [[P.x0, yC + 0.6, P.pyN], [P.x1, yC + 0.6, P.pyN], [P.x1, yC + 0.6, P.pyS], [P.x0, yC + 0.6, P.pyS]], [0, -1, 0]);
  for (const x of P.rows) bbox(gb, 'travertino', x - 0.4, yC, P.pyN, x + 0.4, yC + 0.62, P.pyS, { b: 0.02, skip: ['top'] });
  for (const z of COLS) bbox(gb, 'travertino', P.x0, yC + 0.25, z - 0.22, P.x1, yC + 0.62, z + 0.22, { b: 0.02, skip: ['top'] });
  // ---- las columnas: planas, sin basa ni capitel, de travertino en hiladas
  for (const x of P.rows) {
    for (const z of COLS) {
      // un dado apenas más ancho al pie y el fuste
      bbox(gb, 'travertinoDark', x - COL_D / 2 - 0.04, y, z - COL_W / 2 - 0.04, x + COL_D / 2 + 0.04, y + 0.22, z + COL_W / 2 + 0.04, { b: 0.02 });
      bbox(gb, 'travertino', x - COL_D / 2, y + 0.22, z - COL_W / 2, x + COL_D / 2, SHAFT_TOP, z + COL_W / 2, { b: 0.025, corners: true, skip: ['top', 'bottom'] });
      // choque: del metro para arriba es sólido (no corta la grilla de los muertos);
      // abajo, solo para las balas (World.computeNavBlock no cuenta lo que está más arriba)
      w.addBox([x - COL_D / 2, y + 1.02, z - COL_W / 2, x + COL_D / 2, SHAFT_TOP, z + COL_W / 2], { kind: 'prop' });
      w.addBox([x - COL_D / 2, y - 0.1, z - COL_W / 2, x + COL_D / 2, y + 1.02, z + COL_W / 2], { kind: 'prop', solid: false });
    }
  }
  // ---- los frisos con las frases (al Patio y al Pasaje)
  frieze(w, extra, 'Y LOS LIBRES DEL MUNDO RESPONDEN · AL GRAN PUEBLO ARGENTINO ¡SALUD!', P.x1 + 0.066, Math.PI / 2);
  frieze(w, extra, 'OÍD MORTALES EL GRITO SAGRADO · ¡LIBERTAD! ¡LIBERTAD! ¡LIBERTAD!', P.x0 - 0.066, -Math.PI / 2);
  // ---- los medallones del escudo en los pilonos (de los dos lados)
  const medTex = toTexture(escudoMedallon(512));
  const medMat = new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.85, transparent: false });
  const med = new THREE.CircleGeometry(1.15, 40);
  for (const z of [(P.z0 + P.pyN) / 2, (P.pyS + P.z1) / 2]) {
    for (const [x, ry] of [[P.x1 + 0.012, Math.PI / 2], [P.x0 - 0.012, -Math.PI / 2]]) extra.push(place(med, medMat, x, 11.0, z, ry));
  }
  // ---- las farolas de bronce delante de cada columna de los frentes
  const lampGeo = lampColumn();
  const bowl = new THREE.CylinderGeometry(0.29, 0.16, 0.05, 12);
  for (const [x, dx] of [[P.rows[0], 0.78], [P.rows[3], -0.78]]) {
    for (const z of COLS) {
      extra.push(place(lampGeo, M.bronze, x + dx, y, z));
      // la luz que sale del cuenco (un disco que brilla)
      extra.push(place(bowl, M.lampGlass, x + dx, y + 2.18, z));
      w.addBox([x + dx - 0.16, y + 1.02, z - 0.16, x + dx + 0.16, y + 2.25, z + 0.16], { kind: 'prop' });
    }
  }
  // ---- las ocho urnas de bronce verde pompeyano, en la nave (cuatro por lado)
  const urn = urnGeo();
  for (const x of [26.0, 29.0]) {
    for (const z of [23.6, 26.4, 34.6, 37.4]) {
      bbox(gb, 'travertino', x - 0.42, y, z - 0.42, x + 0.42, y + 0.85, z + 0.42, { b: 0.04, top: 'travStep' });
      extra.push(place(urn, M.bronze, x, y + 0.85, z));
      w.addBox([x - 0.42, y, z - 0.42, x + 0.42, y + 1.9, z + 0.42], { kind: 'prop' });
    }
  }
  // las dos urnas grandes arriba de los cheek de la escalinata
  for (const [x, uy, z] of w.mon.urnas || []) extra.push(place(urn, M.bronze, x, uy, z, 0, 1.45));
  // ---- la escalera del pilono norte a la Sala de las Banderas
  buildSalaStair(w, gb);
}

// El friso: una tira de texto tallado arriba de las columnas.
function frieze(w, extra, text, x, ry) {
  const tex = toTexture(carvedText(text, { w: 4096, h: 160, size: 92, spacing: 0.28 }));
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const L = PROP.z1 - PROP.z0 - 2.2;
  const geo = new THREE.PlaneGeometry(L, (L * 160) / 4096);
  extra.push(place(geo, mat, x, SHAFT_TOP + 0.75, (PROP.z0 + PROP.z1) / 2, ry));
}

// La farola de bronce del Propileo: base ochavada, fuste con anillos y el
// cuenco arriba (2,2 m).
function lampColumn() {
  return lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.2, 0.08],
      [0.16, 0.12],
      [0.13, 0.2],
      [0.075, 0.26],
      [0.06, 0.34],
      [0.075, 0.38],
      [0.06, 0.42],
      [0.05, 1.7],
      [0.068, 1.74],
      [0.068, 1.82],
      [0.055, 1.86],
      [0.06, 1.95],
      [0.12, 2.02],
      [0.24, 2.1],
      [0.31, 2.17],
      [0.3, 2.2],
      [0.0, 2.2],
    ],
    8,
  );
}

// La urna pompeyana: pie, panza y boca con labio.
function urnGeo() {
  return lathe(
    [
      [0, 0],
      [0.24, 0],
      [0.24, 0.05],
      [0.15, 0.1],
      [0.11, 0.18],
      [0.16, 0.24],
      [0.3, 0.38],
      [0.37, 0.55],
      [0.36, 0.7],
      [0.28, 0.84],
      [0.2, 0.9],
      [0.19, 0.96],
      [0.26, 1.0],
      [0.27, 1.04],
      [0.2, 1.04],
      [0.18, 0.98],
      [0, 0.98],
    ],
    24,
  );
}

// La escalera del pilono: baja hacia el oeste de 4,2 a 0 (dentro del pilono),
// con paredes de mármol, el techo inclinado y el descanso arriba.
function buildSalaStair(w, gb) {
  const R = RAMPS.find((r) => r.own === 'sala');
  stairs(gb, R, { count: 22, base: -0.3, riser: 'salaMarble', tread: 'travStep' });
  // las paredes, el techo inclinado y la sala: roomShell (Monumento.js)
}
