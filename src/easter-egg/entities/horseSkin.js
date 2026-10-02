import * as THREE from 'three';
import AnimalSkin, { local, seg, sstep, packWeights } from './animalSkin';

// El caballo del infierno con cuerpo de verdad (La Tapera): un modelo
// facetado de Meshy (criollo muerto, cara de calavera, costillas a la vista,
// brasas en las patas) con los huesos armados acá (entities/animalSkin.js) y
// movidos por la pose de siempre de HorseRig (entities/Horses.js): el
// galope, pararse de manos para pegar y caer de costado. Los huesos: el
// cuerpo, el cogote con la cabeza y la crin, la mandíbula, la cola y muslo y
// caña de cada pata. window.__horseSkinOff = true: las piezas.
//
// El GLB: public/assets/sotano/modelos/caballo/modelo.glb (mirando a +z, el
// origen en el piso al medio, la cadera a 1,05 m como las piezas).

const URL = '/assets/sotano/modelos/caballo/modelo.glb';
const BODY = 0;
const HEAD = 1;
const JAW = 2;
const TAIL = 3;
const UP = 4; // 4-7
const LOW = 8; // 8-11
const NB = 12;
// la pose de las piezas que es la del modelo quieto (Horses.js parado: la
// cabeza a -0,1, la cola a -0,3, la rodilla doblada 0,25)
const HEADP0 = -0.1;
const TAIL0 = -0.3;
const BEND0 = 0.25;
const JAW0 = 0.05;
// la boca del modelo viene cerrada: abre menos que la de las piezas
const JAW_K = 0.6;
// lo que mide cada borde entre huesos (m)
const BLEND = 0.08;
// las patas: hasta qué distancia de su hueso es pata del todo y desde cuál ya es cuerpo (m)
const LEG_R = [0.09, 0.16];
// la cola es angosta (el anca no: queda con el cuerpo)
const TAIL_W = [0.07, 0.13];

// Dónde va cada hueso (en el mundo) con la pose P de HorseRig.
function bonesFor(X, P, out) {
  out[BODY].copy(P.M);
  const n = X.neck;
  local(out[HEAD], out[BODY], n[0], n[1], n[2], P.headP - HEADP0, 0, 0);
  const jp = X.jawPivot;
  local(out[JAW], out[HEAD], jp[0] - n[0], jp[1] - n[1], jp[2] - n[2], Math.max(0, P.jawA - JAW0) * JAW_K, 0, 0);
  const t = X.tail;
  local(out[TAIL], out[BODY], t[0], t[1], t[2], P.tailR - TAIL0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const G = X.legs[k];
    const L = P.legs[k];
    const front = k < 2 ? -1 : 1;
    local(out[UP + k], out[BODY], G.hip[0], G.hip[1], G.hip[2], L.sw, 0, 0);
    local(out[LOW + k], out[UP + k], G.knee[0] - G.hip[0], G.knee[1] - G.hip[1], G.knee[2] - G.hip[2], front * (L.bend - BEND0), 0, 0);
  }
}
const REST = { M: new THREE.Matrix4(), headP: HEADP0, jawA: JAW0, tailR: TAIL0, legs: [0, 1, 2, 3].map(() => ({ sw: 0, bend: BEND0 })) };

// Los pesos: las patas, lo cerca de su hueso (muslo / caña con el vaso); la
// cola, lo angosto de atrás; la cabeza, lo que está arriba y adelante del
// cogote (con la crin) y, debajo de la línea de la boca, la mandíbula.
function weigh(X, pos) {
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const o1 = {};
  const o2 = {};
  const N = X.neck;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const W = new Map();
    const add = (b, w) => w > 1e-4 && W.set(b, (W.get(b) || 0) + w);
    let legW = 0;
    for (let k = 0; k < 4; k++) {
      const G = X.legs[k];
      if (Math.sign(p.x) !== Math.sign(G.hip[0])) continue;
      const d1 = seg(p, G.hip, G.knee, o1);
      const d2 = seg(p, G.knee, G.hoof, o2);
      // (pegado a la cadera se mezcla con el cuerpo)
      const w = (1 - sstep(LEG_R[0], LEG_R[1], Math.min(d1, d2))) * (d1 <= d2 ? sstep(0, 0.4, o1.t) : 1);
      if (w <= 0) continue;
      const lo = sstep(-0.03, 0.03, d1 - d2);
      add(UP + k, w * (1 - lo));
      add(LOW + k, w * lo);
      legW = Math.max(legW, w);
    }
    let rest = 1 - legW;
    if (rest > 0) {
      const tw = rest * sstep(X.tailZ + BLEND / 2, X.tailZ - BLEND / 2, p.z) * (1 - sstep(TAIL_W[0], TAIL_W[1], Math.abs(p.x)));
      add(TAIL, tw);
      rest -= tw;
      const h = rest * sstep(-BLEND, BLEND, p.z - N[2] + (p.y - N[1]) * X.headTilt);
      if (h > 0) {
        const j = h * sstep(X.jawZ - 0.02, X.jawZ + 0.08, p.z) * sstep(X.mouth[0] + X.mouth[1] * p.z + 0.015, X.mouth[0] + X.mouth[1] * p.z - 0.015, p.y);
        add(JAW, j);
        add(HEAD, h - j);
      }
      add(BODY, rest - h);
    }
    packWeights(W, idx, wt, i);
  }
  return { idx, wt };
}

const DEF = { url: URL, key: 'horse', nb: NB, head: HEAD, off: '__horseSkinOff', look: { rim: 0.35 }, rest: () => REST, bonesFor, weigh };

export default class HorseSkin extends AnimalSkin {
  constructor(game, eyeMat) {
    super(game, eyeMat, DEF);
  }
}
