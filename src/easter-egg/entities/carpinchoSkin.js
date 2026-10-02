import * as THREE from 'three';
import AnimalSkin, { local, seg, sstep, packWeights } from './animalSkin';

// El carpincho endemoniado con cuerpo de verdad: un modelo facetado de Meshy
// (malla y textura, sin esqueleto) con los huesos armados al cargar, con las
// medidas que trae el GLB (userData.carpincho: la nuca, la bisagra de la boca,
// la cola, hombro/rodilla/pie de cada pata y los ojos). Cada cuadro DogRig
// (entities/Dogs.js) calcula la pose de siempre (trote, el mordisco parado en
// las patas de atrás, la caída de costado) y esos mismos números mueven los
// huesos: el cuerpo, la cabeza, la mandíbula, la cola y muslo/caña de cada
// pata. Mientras baja el modelo se ven las piezas. window.__carpinchoSkinOff
// = true: las piezas.
//
// El GLB: public/assets/sotano/modelos/carpincho/modelo.glb (mirando a +z, las
// patas en el piso, del tamaño del de piezas).

const URL = '/assets/sotano/modelos/carpincho/modelo.glb';
// los huesos
const BODY = 0;
const HEAD = 1;
const JAW = 2;
const TAIL = 3;
const UP = 4; // 4-7 (una por pata, en el orden de Dogs.js LEGS)
const LO = 8; // 8-11
const NB = 12;
// la pose de las piezas que es la del modelo quieto (Dogs.js parado: la
// cabeza 0,05, la boca 0,1 y la rodilla 0,35)
const HEAD0 = 0.05;
const JAW0 = 0.1;
const BEND0 = 0.35;
// la boca del modelo viene cerrada: abre menos que la de las piezas
const JAW_K = 0.6;
// las patas: hasta qué distancia del hueso es pata del todo y desde cuál ya es cuerpo (m)
const LEG_R = [0.055, 0.1];
// lo que mide cada borde entre huesos a lo largo (m)
const BLEND = 0.06;

const tmpL = new THREE.Matrix4();

// Dónde va cada hueso (en el mundo) con la pose P de DogRig: { M (el bicho en
// el mundo, con su tamaño), y (lo que rebota), headP, jawA, legs (lo que
// barre cada pata), bend (la rodilla) }.
function bonesFor(X, P, out) {
  out[BODY].copy(P.M).multiply(tmpL.makeTranslation(0, P.y, 0));
  const N = X.neck;
  local(out[HEAD], out[BODY], N[0], N[1], N[2], P.headP - HEAD0, 0, 0);
  const Jp = X.jawPivot;
  local(out[JAW], out[HEAD], Jp[0] - N[0], Jp[1] - N[1], Jp[2] - N[2], (P.jawA - JAW0) * JAW_K, 0, 0);
  local(out[TAIL], out[BODY], X.tail[0], X.tail[1], X.tail[2], 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const G = X.legs[k];
    const sw = P.legs[k];
    // (la rodilla de adelante se dobla para atrás y la de atrás para adelante, como las piezas)
    const sgn = G.front ? -1 : 1;
    local(out[UP + k], out[BODY], G.sh[0], G.sh[1], G.sh[2], sw, 0, 0);
    local(out[LO + k], out[UP + k], G.el[0] - G.sh[0], G.el[1] - G.sh[1], G.el[2] - G.sh[2], sgn * (P.bend + Math.max(0, -sw) * 0.6 - BEND0), 0, 0);
  }
}
const REST = { M: new THREE.Matrix4(), y: 0, headP: HEAD0, jawA: JAW0, legs: [0, 0, 0, 0], bend: BEND0 };

// Los pesos de cada vértice (en reposo): las patas, lo que está cerca de su
// hueso (muslo y caña con el pie) y debajo de la panza; el resto a lo largo:
// cola, cuerpo, cabeza y, debajo de la línea de la boca, la mandíbula.
function weigh(X, pos) {
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const o1 = {};
  const o2 = {};
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const W = new Map();
    const add = (b, w) => w > 1e-4 && W.set(b, (W.get(b) || 0) + w);
    // la pata más cerca de este lado
    let legW = 0;
    let best = null;
    for (let k = 0; k < 4; k++) {
      const G = X.legs[k];
      if (Math.sign(p.x) !== Math.sign(G.sh[0])) continue;
      const d1 = seg(p, G.sh, G.el, o1);
      const d2 = seg(p, G.el, G.ft, o2);
      const d = Math.min(d1, d2);
      if (!best || d < best.d) best = { k, d, d1, d2, top: G.sh[1] };
    }
    if (best) {
      // (arriba, donde la pata entra al cuerpo, se mezcla con el cuerpo)
      const w = (1 - sstep(LEG_R[0], LEG_R[1], best.d)) * (1 - sstep(best.top - 0.07, best.top + 0.03, p.y));
      if (w > 0) {
        const lo = sstep(-0.015, 0.015, best.d1 - best.d2);
        add(UP + best.k, w * (1 - lo));
        add(LO + best.k, w * lo);
        legW = w;
      }
    }
    const rest = 1 - legW;
    if (rest > 0) {
      const tail = 1 - sstep(X.tailZ - BLEND, X.tailZ + BLEND, p.z);
      const head = sstep(X.neck[2] - BLEND, X.neck[2] + BLEND, p.z);
      // la mandíbula: lo de abajo de la boca, de la bisagra para adelante
      const jaw = head * sstep(X.jawZ - 0.04, X.jawZ + 0.02, p.z) * sstep(X.mouthY + 0.012, X.mouthY - 0.012, p.y);
      add(TAIL, rest * tail);
      add(BODY, rest * (1 - tail) * (1 - head));
      add(JAW, rest * (1 - tail) * jaw);
      add(HEAD, rest * (1 - tail) * (head - jaw));
    }
    packWeights(W, idx, wt, i);
  }
  return { idx, wt };
}

const DEF = {
  url: URL,
  key: 'carpincho',
  nb: NB,
  head: HEAD,
  off: '__carpinchoSkinOff',
  look: { rim: 0.35 },
  rest: () => REST,
  bonesFor,
  weigh,
};

export default class CarpinchoSkin extends AnimalSkin {
  constructor(game, eyeMat) {
    super(game, eyeMat, DEF);
  }
}
