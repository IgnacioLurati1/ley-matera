import * as THREE from 'three';
import { MID_Y } from './desgarradorModels';

// Las poses del Desgarrador Cósmico en primera persona (weapons/Desgarrador.js
// las usa; las pruebas las miran sin el juego: solo three y números). v3:
// golpes de guadaña propios (el barrido, el revés, la siega por arriba, el
// molinete, el arado de la embestida), con las dos manos en el asta.

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// la guadaña de verdad, achicada como todo lo de primera persona
export const VMS = 0.44;
// los codos (en el espacio de la mano: abajo y atrás de cada lado)
// (v3: más abajo y más afuera: con las dos manos en el asta, los antebrazos
// entran por las esquinas y no tapan el medio)
export const ELBOW_R = new THREE.Vector3(0.4, -0.52, 0.16);
export const ELBOW_L = new THREE.Vector3(-0.46, -0.56, 0.12);
// (guadana5) el codo izquierdo sigue a la mano: [cuánto más a la izquierda que
// la mano, cuánto más abajo, cuánto más atrás] (antes 0,42 / 0 / 0)
// (guadana5: la guadaña acostada: el codo más abajo y atrás, el antebrazo
// izquierdo baja casi derecho; globalThis.__mduDesgOldHold: como antes)
const OLD_HOLD = globalThis.__mduDesgOldHold === true;
// (guadana5, segunda vuelta: el usuario quiere el ASTA horizontal, paralela
// al borde de abajo, cruzada delante del cuerpo con las dos manos y la hoja en
// la punta izquierda; globalThis.__mduDesgOldHold2: la de la primera vuelta)
const OLD_HOLD2 = OLD_HOLD || globalThis.__mduDesgOldHold2 === true;
// (guadana5, tercera vuelta: "tiraría la mano izquierda más hacia el cuerpo así
// queda más horizontal y no tanto hacia el medio de la pantalla en altura": la
// izquierda más cerca del cuerpo, el asta más acostada y más abajo; los
// barridos, igual de más abajo. globalThis.__mduDesgOldHold3: la segunda vuelta)
const OLD_HOLD3 = OLD_HOLD2 || globalThis.__mduDesgOldHold3 === true;
const LO = (P) => (OLD_HOLD3 ? P : [P[0], P[1] - 0.08, P[2], P[3], P[4] * 0.3, P[5], P[6], P[7], P[8], P[9], P[10]]);
export const ELBOW_FOLLOW = OLD_HOLD ? [0.42, 0, 0] : OLD_HOLD2 ? [0.05, -0.15, 0.25] : [0, -0.3, 0.3];
// adónde se va la mano izquierda cuando suelta el asta (el giro): abajo, afuera de cuadro
export const LEFT_OFF = new THREE.Vector3(-0.2, -0.46, 0.06);

// La muñeca para que el asta vaya hacia d y la hoja salga hacia e (en el
// espacio de la mano): el asta es +y del modelo y la hoja +x.
const _bx = new THREE.Vector3();
const _bd = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _bm = new THREE.Matrix4();
export function shaftQuat(dx, dy, dz, ex, ey, ez, out) {
  _bd.set(dx, dy, dz).normalize();
  _bx.set(ex, ey, ez);
  _bx.addScaledVector(_bd, -_bx.dot(_bd));
  if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0).addScaledVector(_bd, -_bd.x);
  _bx.normalize();
  _bz.crossVectors(_bx, _bd);
  return out.setFromRotationMatrix(_bm.makeBasis(_bx, _bd, _bz));
}


// ---------------- las poses ----------------
// Cada pose: [x, y, z] (se suma a la cadera), [dx, dy, dz] hacia dónde va el
// asta (de la mano derecha a la hoja), [ex, ey, ez] hacia dónde sale la hoja,
// cuánto se corre el asta (m) y cuánto suelta la izquierda (0..1). En la
// cámara: x derecha, y arriba, z hacia atrás. Claves [k, pose, curva] ('io'
// suave, 'i' arranca lento, 'o' sale rápido y frena, 'l' parejo).
// v3 (pedido del usuario: "un calco del sable"): todo de guadaña y con las dos
// manos en el asta. Quieta: la derecha abajo a la derecha, la izquierda más
// adelante en el asta, el asta cruzada por delante del cuerpo hacia la
// izquierda y la hoja parada a la izquierda, con la punta hacia el medio.
// v4 (tercera prueba: "la posición en idle es media extraña"; después: "el
// grip, como si la agarrase con los brazos al revés"): la Parca en guardia
// SIN cruzar los brazos. La derecha abajo a la derecha, en el regatón (su
// manga sale para abajo a la derecha), la izquierda más arriba en el asta (su
// manga para abajo a la izquierda); el asta en diagonal de abajo a la derecha
// hacia arriba a la izquierda y la hoja colgando a la izquierda con el filo
// para adentro, afuera del medio. La "diagonal" anterior (la hoja arriba a la
// derecha) tenía la izquierda a la derecha de la derecha: brazos cruzados.
// (hojas de comparación guadana/shots/_v4r7.png, _v4r8.png, _v4r9.png; la
// prueba numérica de cruces: guadana/t_cruce.mjs)
// (globalThis.__mduDesgOldRest: la quieta de la v3, la hoja parada a la izquierda)
// guadana5 (iteración 4: "la guadaña está posicionada de forma medio vertical
// en lugar de horizontal: no se ve en medio de la pantalla al usarla"): la
// hoja ACOSTADA cruzando la vista, como la Parca: las dos manos a la derecha
// (la derecha abajo, la izquierda más arriba en el asta, sin cruzar), el asta
// hacia adelante y arriba, la cabeza un poco a la derecha del medio y la hoja
// hacia la izquierda, horizontal, con la cara del cosmos a la vista, debajo de
// la mira. (hojas guadana5/shots/_r2.._r5.png; elegida M5c)
// (globalThis.__mduDesgOldHold: la quieta de la v4)
export const REST_P =
  globalThis.__mduDesgOldRest === true
    ? [0.02, 0.0, -0.02, -0.86, 0.24, -0.45, 0.36, 0.92, 0.14, 0, 0]
    : OLD_HOLD
      ? [0.12, -0.08, -0.22, -0.5, 0.75, -0.43, -0.8, -0.2, -0.55, 0.1, 0]
      : OLD_HOLD2
        ? [0.14, -0.05, -0.1, -0.3, 0.5, -0.81, -1, 0, 0, 0.45, 0]
        : OLD_HOLD3
          ? [0.0, 0.06, -0.22, -0.96, 0.12, -0.25, 0, 0.6, -0.8, 0.3, 0]
          : [0.0, -0.02, -0.2, -0.99, 0.03, -0.1, 0, 0.6, -0.8, 0.3, 0];
// Un arco: la guadaña entera gira alrededor de la normal del plano (n),
// pasando por d0 (el asta en el medio del arco), de `from` a `to` (radianes),
// con la punta de la hoja adelante. Las manos van de off0 a off1 (x, y, z,
// cuánto suelta la izquierda y cuánto se corren por el asta hacia la hoja). pivot: el punto del asta (m desde la mano
// derecha) que queda quieto (0: gira en la mano derecha; el medio de las dos
// manos: gira el asta entera, como un bastón). tilt: cuánto se tuerce la hoja
// afuera del plano (de canto no se ve la cara con el cosmos); rel: cuánto
// suelta la izquierda al final. Devuelve las claves de k0 a k1 (sin la quieta).
export function arcKeys({ n, d0, from, to, off0, off1, k0, k1, tilt = 0, rel = 0, pivot = 0, ease = 'sine' }) {
  const N = new THREE.Vector3(...n).normalize();
  const d = new THREE.Vector3(...d0);
  d.addScaledVector(N, -d.dot(N)).normalize();
  const e = new THREE.Vector3().crossVectors(N, d).multiplyScalar(Math.sign(to - from));
  e.multiplyScalar(Math.cos(tilt)).addScaledVector(N, Math.sin(tilt));
  const q = new THREE.Quaternion();
  const steps = Math.max(4, Math.ceil(Math.abs(to - from) / 0.28));
  const keys = [];
  const pv = pivot * VMS;
  for (let j = 0; j <= steps; j++) {
    const u = j / steps;
    // (arranca y frena: el medio es lo más rápido; 'in': acelera hasta el final)
    const s = ease === 'in' ? u * u : 0.5 - 0.5 * Math.cos(Math.PI * u);
    q.setFromAxisAngle(N, from + (to - from) * s);
    const dd = d.clone().applyQuaternion(q);
    const ee = e.clone().applyQuaternion(q);
    const o = off0.map((v, i) => v + (off1[i] - v) * s);
    // (el punto del asta en `pivot` queda donde estaría con el asta en d0)
    o[0] += (d.x - dd.x) * pv;
    o[1] += (d.y - dd.y) * pv;
    o[2] += (d.z - dd.z) * pv;
    const r = Math.max(o[3] || 0, rel * smooth(clamp01((u - 0.45) / 0.55)));
    keys.push([k0 + (k1 - k0) * u, [o[0], o[1], o[2], dd.x, dd.y, dd.z, ee.x, ee.y, ee.z, o[4] || 0, r], j === 0 ? 'io' : 'l']);
  }
  return keys;
}
// Un golpe entero: de la quieta a la preparación (wind: claves sueltas), el
// arco (o varios) y la vuelta a la quieta.
export function moveKeys(wind, arcs) {
  const keys = [[0, REST_P]];
  for (const w of wind) keys.push(w);
  for (const a of arcs) keys.push(...(Array.isArray(a) ? [a] : arcKeys(a)));
  keys.push([1, REST_P, 'io']);
  return keys;
}
// cut: el silbido, el tirón y la grieta; hit: cuándo corta; trail: la estela;
// kick: el tirón de la vista; stop: el freno al pegar; len: cuánto dura; k:
// fuerza; rift: la grieta (radio, medio ángulo, inclinación, de qué lado
// arranca, ancho). Los nombres (diag, rev, alto, remate) son los del aviso
// 'cut' de listen(): las misiones los usan.
export const MOVES = {
  // el barrido: de derecha a izquierda, ancho y a la altura de la cintura; las
  // manos se corren hacia la hoja (más cerca: se ve), la hoja afuera, la punta
  // adelante y el asta cruzando el cuerpo
  diag: {
    len: 1.05,
    cut: 0.3,
    hit: 0.46,
    trail: [0.26, 0.7],
    kick: [0.006, 0.04],
    stop: 0.065,
    k: 1,
    rift: { R: 2.5, half: 1.25, roll: 0.16, flip: 0, w: 0.055 },
    keys: moveKeys(
      [[0.13, [0.2, 0.08, 0.04, 0.05, 0.55, -0.83, -0.95, 0.25, 0.15, 0.25, 0], 'io']],
      [{ n: [0, 0.893, -0.45], d0: [0, -0.45, -0.893], from: -0.25, to: 1.45, off0: [0.22, 0.08, 0.04, 0, 0.3], off1: [-0.16, 0.05, -0.03, 0, 0.3], k0: 0.24, k1: 0.72, tilt: 0.5, pivot: 0.05 }],
    ),
  },
  // el revés: de vuelta, de izquierda a derecha y un poco más alto; la hoja se
  // da vuelta (la punta adelante otra vez) y el asta cruza para el otro lado
  rev: {
    len: 1.05,
    cut: 0.3,
    hit: 0.46,
    trail: [0.26, 0.7],
    kick: [0.004, -0.04],
    stop: 0.065,
    k: 1,
    rift: { R: 2.5, half: 1.2, roll: -0.22, flip: 1, w: 0.055 },
    keys: moveKeys(
      [[0.13, [-0.1, 0.14, -0.02, -0.82, 0.45, -0.35, 0.35, 0.82, -0.45, 0.25, 0], 'io']],
      [{ n: [0, 0.96, -0.28], d0: [0, -0.28, -0.96], from: 1.45, to: -0.2, off0: [-0.1, 0.23, -0.02, 0, 0.3], off1: [0.2, 0.21, 0.04, 0, 0.3], k0: 0.24, k1: 0.72, tilt: -0.4, pivot: 0.2 }],
    ),
  },
  // la siega por arriba: la izquierda suelta, la derecha la tira para atrás por
  // encima del hombro (la hoja atrás, fuera de cuadro) y la trae por arriba de
  // la cabeza: la hoja aparece arriba, baja en diagonal y se clava adelante;
  // al final la izquierda la vuelve a agarrar
  alto: {
    len: 1.2,
    cut: 0.36,
    hit: 0.54,
    trail: [0.32, 0.74],
    kick: [-0.05, 0.008],
    stop: 0.095,
    k: 1.25,
    rift: { R: 2.4, half: 1.0, roll: Math.PI / 2 - 0.5, flip: 0, w: 0.065 },
    keys: moveKeys(
      [[0.14, [0.04, 0.04, 0.04, 0.35, 0.9, 0.25, -0.3, -0.15, 0.94, 0.2, 1], 'io']],
      [{ n: [-0.84, 0.2, 0.5], d0: [0, 1, 0], from: -1.15, to: 1.85, off0: [0.0, 0.06, 0.04, 1, 0.25], off1: [-0.1, -0.02, -0.06, 1, 0.3], k0: 0.26, k1: 0.72, tilt: 0.3, pivot: 0 }],
    ),
  },
  // el molinete (el remate): la hace girar entera por delante, como un bastón
  // (la izquierda suelta en la vuelta y la vuelve a agarrar) y termina en un
  // barrido bajo y ancho que se clava adelante
  remate: {
    len: 1.75,
    cut: 0.52,
    hit: 0.66,
    trail: [0.16, 0.82],
    kick: [0.03, -0.05],
    stop: 0.12,
    k: 1.5,
    wide: true,
    rift: { R: 3, half: 1.55, roll: 0.05, flip: 0, w: 0.075 },
    keys: moveKeys(
      [[0.09, [-0.05, 0.08, -0.08, 0.6, 0.6, -0.5, -0.3, 0.8, 0.5, 0.35, 0.8], 'io']],
      [
        { n: [0, 0.3, 0.95], d0: [1, 0, 0], from: 0.3, to: -2 * Math.PI + 0.1, off0: [-0.1, 0.06, -0.14, 1, 0.4], off1: [-0.1, 0.06, -0.14, 1, 0.4], k0: 0.14, k1: 0.5, tilt: 0.25, pivot: 0.24, ease: 'in' },
        { n: [0, 0.85, -0.53], d0: [0, -0.53, -0.85], from: -0.3, to: 1.55, off0: [0.22, 0.06, 0.03, 0.6, 0.3], off1: [-0.18, 0.03, -0.04, 0, 0.3], k0: 0.54, k1: 0.82, tilt: 0.55, pivot: 0.05 },
      ],
    ),
  },
};
// guadana5: los barridos de la guadaña acostada. El asta gira en un plano
// inclinado hacia la cámara (como un limpiaparabrisas): la hoja cruza la
// pantalla entera de arriba a la derecha hasta abajo a la izquierda (el revés
// al revés), siempre con la cara a la vista y pasando por el medio. Mientras
// el asta apunta a la derecha, la izquierda suelta (si no, los brazos se
// cruzan) y vuelve a agarrar cuando el asta pasa por arriba.
if (!OLD_HOLD2) {
  // segunda vuelta: el asta siempre acostada en la pantalla; los golpes la
  // barren entera (la cabeza y la hoja cruzan el medio de derecha a izquierda,
  // de izquierda a derecha, o de arriba abajo en la siega). La izquierda
  // siempre a la izquierda de la derecha: nunca se cruzan.
  const W = LO([0.2, 0.06, -0.1, -0.5, 0.12, -0.86, -0.3, 0.5, -0.8, 0.3, 0]);
  const M = LO([0.06, 0.0, -0.2, -0.88, 0.1, -0.46, -0.35, 0.4, -0.85, 0.3, 0]);
  const L = LO([-0.12, -0.04, -0.16, -0.97, 0.08, 0.2, -0.25, 0.4, -0.88, 0.3, 0]);
  MOVES.diag.keys = moveKeys([[0.14, W, 'io']], [[0.3, LO([0.18, 0.04, -0.14, -0.55, 0.1, -0.83, -0.35, 0.45, -0.82, 0.3, 0]), 'i'], [0.5, M, 'l'], [0.72, L, 'o']]);
  MOVES.rev.keys = moveKeys(
    [[0.14, LO([-0.1, 0.02, -0.16, -0.97, 0.08, 0.15, 0.35, 0.45, -0.82, 0.3, 0]), 'io']],
    [[0.3, LO([-0.08, 0.0, -0.18, -0.95, 0.1, 0.0, 0.35, 0.45, -0.82, 0.3, 0]), 'i'], [0.5, LO([0.1, 0.02, -0.2, -0.75, 0.1, -0.65, 0.35, 0.45, -0.82, 0.3, 0]), 'l'], [0.72, LO([0.26, 0.04, -0.12, -0.45, 0.12, -0.88, 0.4, 0.45, -0.8, 0.3, 0]), 'o']],
  );
  // la siega: la levanta acostada por arriba de la cabeza (la hoja atrás) y la
  // baja: la hoja gira alrededor del asta y cae por el medio
  MOVES.alto.keys = moveKeys(
    [[0.16, [0.04, 0.26, -0.06, -0.96, 0.18, -0.2, 0, 0.8, 0.6, 0.3, 0], 'io']],
    [[0.34, [0.04, 0.24, -0.12, -0.96, 0.15, -0.22, 0, 0.95, -0.3, 0.3, 0], 'i'], [0.52, [0.04, 0.02, -0.26, -0.96, 0.08, -0.26, 0, 0.2, -1, 0.3, 0], 'l'], [0.7, [0.04, -0.14, -0.24, -0.96, 0.05, -0.26, 0, -0.6, -0.8, 0.3, 0], 'o']],
  );
  // el remate: el molinete de siempre y el barrido acostado
  MOVES.remate.keys = moveKeys(
    [[0.09, [-0.05, 0.08, -0.08, 0.6, 0.6, -0.5, -0.3, 0.8, 0.5, 0.35, 0.8], 'io']],
    [
      { n: [0, 0.3, 0.95], d0: [1, 0, 0], from: 0.3, to: -2 * Math.PI + 0.33, off0: [-0.1, 0.06, -0.14, 1, 0.4], off1: [-0.1, 0.06, -0.14, 1, 0.4], k0: 0.14, k1: 0.5, tilt: 0.25, pivot: 0.24, ease: 'in' },
      [0.58, LO([0.22, 0.06, -0.1, -0.5, 0.12, -0.86, -0.3, 0.5, -0.8, 0.3, 0.3]), 'io'],
      [0.68, LO([0.08, 0.0, -0.2, -0.85, 0.1, -0.5, -0.35, 0.4, -0.85, 0.3, 0]), 'i'],
      [0.84, LO([-0.14, -0.05, -0.16, -0.97, 0.08, 0.22, -0.25, 0.4, -0.88, 0.3, 0]), 'o'],
    ],
  );
} else if (!OLD_HOLD) {
  const N = [0, 0.82, 0.57];
  const D = [0, 0.57, -0.82];
  MOVES.diag.keys = moveKeys(
    [[0.13, [0.24, 0.0, -0.02, 0.7, 0.55, -0.45, -0.3, 0.4, -0.85, 0.45, 1], 'io']],
    [
      { n: N, d0: D, from: -1.1, to: 0, off0: [0.22, 0.02, -0.04, 1, 0.45], off1: [0.04, 0, -0.06, 0, 0.45], k0: 0.24, k1: 0.44, tilt: 0.15, pivot: 0.35 },
      { n: N, d0: D, from: 0, to: 1.3, off0: [0.04, 0, -0.06, 0, 0.45], off1: [-0.14, -0.03, -0.08, 0, 0.45], k0: 0.44, k1: 0.72, tilt: 0.15, pivot: 0.35 },
    ],
  );
  MOVES.rev.keys = moveKeys(
    [[0.13, [-0.06, 0.0, -0.04, -0.7, 0.55, -0.45, 0.3, 0.4, -0.85, 0.45, 0], 'io']],
    [{ n: N, d0: D, from: 1.2, to: -0.75, off0: [-0.08, 0, -0.06, 0, 0.45], off1: [0.2, -0.02, -0.05, 0, 0.45], k0: 0.24, k1: 0.72, tilt: -0.15, pivot: 0.35, rel: 1 }],
  );
  MOVES.remate.keys = moveKeys(
    [[0.09, [-0.05, 0.08, -0.08, 0.6, 0.6, -0.5, -0.3, 0.8, 0.5, 0.35, 0.8], 'io']],
    [
      { n: [0, 0.3, 0.95], d0: [1, 0, 0], from: 0.3, to: -2 * Math.PI + 0.33, off0: [-0.1, 0.06, -0.14, 1, 0.4], off1: [-0.1, 0.06, -0.14, 1, 0.4], k0: 0.14, k1: 0.5, tilt: 0.25, pivot: 0.24, ease: 'in' },
      { n: N, d0: D, from: -1.2, to: 0, off0: [0.24, 0.02, -0.04, 1, 0.45], off1: [0.04, 0, -0.06, 0, 0.45], k0: 0.54, k1: 0.66, tilt: 0.2, pivot: 0.35 },
      { n: N, d0: D, from: 0, to: 1.45, off0: [0.04, 0, -0.06, 0, 0.45], off1: [-0.16, -0.05, -0.08, 0, 0.45], k0: 0.66, k1: 0.84, tilt: 0.2, pivot: 0.35 },
    ],
  );
}
export const COMBO = ['diag', 'rev', 'alto', 'remate'];
// tirar la espectral: un latigazo corto de derecha a izquierda, como quien
// tira un disco (la guadaña de verdad no se va)
export const THROW = 0.38;
// (v4: la izquierda suelta el asta mientras la lleva para la derecha y la
// vuelve a agarrar al final: si no, los brazos se cruzaban)
// (guadana5, segunda vuelta: el tiro también con el asta acostada: un
// latigazo de derecha a izquierda, la hoja cruza el medio)
export const THROW_KEYS = !OLD_HOLD2
  ? moveKeys([[0.2, LO([0.22, 0.06, -0.08, -0.5, 0.12, -0.86, -0.3, 0.45, -0.85, 0.3, 0]), 'io']], [[0.45, LO([0.06, 0.02, -0.2, -0.88, 0.1, -0.46, -0.35, 0.35, -0.87, 0.3, 0]), 'i'], [0.62, LO([-0.12, -0.02, -0.16, -0.97, 0.08, 0.2, -0.25, 0.35, -0.9, 0.3, 0]), 'o']])
  : moveKeys([[0.2, [0.16, 0.0, 0.05, 0.75, 0.45, -0.5, -0.45, 0.85, 0.2, 0, 1], 'io']], [{ n: [0.1, 1, 0.2], d0: [0, -0.05, -1], from: -0.9, to: 0.9, off0: [0.12, 0.0, 0.03, 1, 0], off1: [-0.12, -0.03, -0.04, 0, 0], k0: 0.36, k1: 0.72, tilt: 0.35, pivot: 0.08 }]);
export const THROW_AT = 0.55;
// la embestida: la baja adelante como un arado (las dos manos, el asta para
// abajo y adelante, la hoja abajo de punta) y al final la levanta cortando
export const DASH_KEYS = [
  [0, REST_P],
  [0.14, [0.06, 0.1, -0.06, -0.3, -0.2, -0.93, 0.15, -0.97, 0.18, 0.3, 0], 'o'],
  [0.62, [0.06, 0.08, -0.08, -0.28, -0.17, -0.94, 0.12, -0.98, 0.15, 0.3, 0], 'l'],
  OLD_HOLD2 ? [0.8, [0.0, 0.04, -0.06, -0.7, 0.4, -0.6, 0.3, 0.9, 0.3, 0.2, 0], 'o'] : [0.8, [0.04, 0.12, -0.2, -0.96, 0.15, -0.22, 0, 1, 0.1, 0.3, 0], 'o'],
  [1, REST_P, 'io'],
];
// sacarla: sube de abajo a la derecha dando una vuelta sobre el asta
export const DRAW = 0.5;
export const DRAW_KEYS = [
  // (guadana5, segunda vuelta: sube acostada desde abajo a la derecha)
  OLD_HOLD2 ? [0, [0.14, -0.22, 0.06, -0.3, 0.9, 0.3, 0.9, 0.3, 0.2, 0, 0.8]] : [0, [0.14, -0.24, 0.0, -0.95, 0.1, 0.2, 0, 0.9, 0.3, 0.3, 0.8]],
  OLD_HOLD2 ? [0.6, [0.07, -0.1, 0.03, -0.8, 0.45, -0.4, 0.3, 0.85, 0.3, 0, 0.1], 'o'] : [0.6, [0.06, -0.02, -0.16, -0.96, 0.12, -0.2, 0, 0.8, -0.5, 0.3, 0.1], 'o'],
  [1, REST_P, 'io'],
];
// mostrarla (inspeccionar): la para delante de la cara (las dos manos en el
// asta) con la cara de la hoja y el cosmos a la vista; la gira para ver el
// filo, otra vez la cara, y un floreo
export const INSPECT = 3.8;
// (guadana5, segunda vuelta: la levanta acostada delante de la cara, la hoja
// parada mostrando el cosmos; después de canto, el filo)
export const I_FACE = OLD_HOLD2 ? [-0.06, -0.06, -0.04, -0.3, 0.85, -0.42, 0.95, 0.25, 0.1, 0.35, 0] : [0.0, 0.12, -0.24, -0.96, 0.15, -0.2, 0, 1, 0.15, 0.3, 0];
export const INSPECT_KEYS = [
  [0, REST_P],
  [0.12, I_FACE, 'io'],
  [0.36, OLD_HOLD2 ? [-0.06, -0.05, -0.05, -0.32, 0.85, -0.4, 0.88, 0.2, 0.42, 0.35, 0] : [0.0, 0.13, -0.24, -0.96, 0.15, -0.2, 0, 0.9, 0.45, 0.3, 0], 'io'],
  [0.52, OLD_HOLD2 ? [-0.06, -0.06, -0.05, -0.3, 0.85, -0.42, 0.3, 0.38, 0.88, 0.35, 0] : [0.0, 0.12, -0.24, -0.96, 0.15, -0.2, 0, 0.3, -0.95, 0.3, 0], 'io'],
  [0.68, I_FACE, 'io'],
  [0.8, I_FACE, 'io'],
  [1, REST_P, 'io'],
];
// el rayo de la Furia: (v4) el asta apuntando a la mira desde la derecha, la
// cabeza a la altura del pecho (de ahí nace el rayo: Desgarrador.drawBeam) y la
// hoja parada a la derecha, afuera del medio. Antes la hoja colgaba y el rayo
// salía de su punta, abajo: tapaba la vista ("sale desde muy abajo").
// (globalThis.__mduDesgBeamTip: la pose y el rayo de antes)
export const BEAM_P = globalThis.__mduDesgBeamTip === true ? [0.02, 0.06, -0.06, -0.12, 0.38, -0.92, 0.15, -0.9, -0.38, 0.3, 0] : OLD_HOLD2 ? [0.1, -0.12, -0.16, -0.18, 0.45, -0.87, 0.5, 0.7, 0.5, 0.2, 0] : OLD_HOLD3 ? [0.12, 0.0, -0.2, -0.6, 0.15, -0.79, 0, 0.9, 0.3, 0.3, 0] : [0.12, -0.1, -0.1, -0.25, 0.05, -0.97, 0.3, 0.9, 0, 0.3, 0];
// (guadana5, tercera vuelta: "al tirar el rayo se pone tan al medio que tapa
// todo": la cabeza del arma -de donde nace el rayo- abajo a la derecha, el asta
// para adelante y la hoja parada hacia afuera)
// (v4) el golpe cargado de la del Eclipse: la levanta (el asta más parada, la
// hoja alta a la derecha, a la vista, las dos manos en el asta); al soltar baja
// con la siega por arriba (alto). (hoja de comparación guadana/shots/_v4cp.png: c3)
// (sin cruzar los brazos: la derecha abajo a la derecha, el asta parada hacia
// arriba a la izquierda, la hoja alta)
// (guadana5: la levanta con la hoja acostada arriba, cruzando la vista por
// encima de la mira)
export const CHARGE_P = OLD_HOLD ? [0.14, 0.02, -0.18, -0.4, 0.85, -0.35, -0.8, 0.1, -0.6, 0.1, 0] : OLD_HOLD2 ? [0.12, 0.04, -0.12, -0.35, 0.8, -0.5, -1, 0.1, 0, 0.45, 0] : [0.02, 0.2, -0.2, -0.96, 0.15, -0.2, 0, 0.9, 0.4, 0.3, 0];
// el giro (R): la agarra del medio, la sube por arriba de la cabeza y la hace
// girar acostada (vueltas enteras), soltando la izquierda
export const SPIN_UP = [-0.02, 0.2, -0.12, 0.0, 0.12, -1, -1, 0.0, 0.0, MID_Y, 1];
export const SPIN_TURNS = 3;

// (para afinar desde las pruebas)
export const DESG_POSES = { arc: arcKeys, moveKeys, MOVES, THROW_KEYS, DASH_KEYS, DRAW_KEYS, INSPECT_KEYS, BEAM_P, CHARGE_P, SPIN_UP, REST_P, ELBOW_R, ELBOW_L, LEFT_OFF };

export const NP = 11;
export function sample(keys, k, out) {
  let i = 1;
  while (i < keys.length - 1 && k > keys[i][0]) i++;
  const [k0, a] = keys[i - 1];
  const [k1, b, ease] = keys[i];
  let u = clamp01((k - k0) / (k1 - k0 || 1));
  u = ease === 'l' ? u : ease === 'i' ? u * u * u : ease === 'o' ? 1 - (1 - u) ** 3 : smooth(u);
  for (let j = 0; j < NP; j++) out[j] = (a[j] || 0) + ((b[j] || 0) - (a[j] || 0)) * u;
  return out;
}
export const mix = (a, b, k, out) => {
  for (let j = 0; j < NP; j++) out[j] = (a[j] || 0) + ((b[j] || 0) - (a[j] || 0)) * k;
  return out;
};

