import * as THREE from 'three';
import AnimalSkin, { local, seg, sstep, packWeights } from './animalSkin';

// El yacaré con cuerpo de verdad: un modelo facetado de Meshy (malla y
// textura, sin esqueleto) y los huesos armados acá, al cargar, con las
// medidas que trae el GLB (userData.yacare: la nuca, la bisagra de la boca,
// la cola, hombro/codo/pie de cada pata y los ojos). Cada cuadro, YacareRig
// (entities/Yacares.js) calcula la pose de siempre (nadar con la cola,
// caminar a los costados, el tarascón, el coletazo, panza arriba y hundirse)
// y esos mismos números mueven los huesos: el cuerpo, la cabeza, la
// mandíbula, tres tramos de cola y brazo/antebrazo de cada pata. Mientras
// baja el modelo se ven las piezas. window.__yacareSkinOff = true: las piezas.
// (lo común con los caballos, entities/animalSkin.js)
//
// El GLB: public/assets/sotano/modelos/yacare/modelo.glb (mirando a +z, el
// origen en el centro del cuerpo como las piezas, la panza a 0,2 m del piso).

const URL = '/assets/sotano/modelos/yacare/modelo.glb';
// los huesos
const BODY = 0;
const HEAD = 1;
const JAW = 2;
const TAIL = 3; // 3, 4, 5
const ARM = 6; // 6-9 (una por pata)
const FORE = 10; // 10-13
const NB = 14;
// la pose de las piezas que es la del modelo en reposo (en tierra, quieto):
// cuánto abre cada pata y cuánto dobla la rodilla (Yacares.js: splay 1,3;
// knee 0,22 adelante y 0,3 atrás)
const SPLAY0 = 1.3;
const KNEE0 = [0.22, 0.22, 0.3, 0.3];
// la boca del modelo viene cerrada: abre menos que la de las piezas (si no, se
// estira la cara)
const JAW_K = 0.5;
const JAW_REST = 0.04;
// nadando: el lomo del modelo es más alto que el de las piezas; se hunde un
// poco más (m, a escala 1)
const SWIM_SINK = 0.17;
// lo que mide cada borde entre huesos (m): de un tramo al otro se mezcla
const BLEND = 0.07;
// las patas: hasta qué distancia del hueso (hombro-codo-pie) es pata del todo
// y desde cuál ya es cuerpo (m)
const LEG_R = [0.07, 0.13];

const tmpL = new THREE.Matrix4();

// Dónde va cada hueso (en el mundo) con la pose P de YacareRig; con P vacía,
// el reposo (el modelo tal cual, en el origen).
function bonesFor(X, P, out) {
  out[BODY].copy(P.M);
  const n = X.neck;
  local(out[HEAD], out[BODY], n[0], n[1], n[2], P.headP, P.headY, 0);
  const jp = X.jawPivot;
  local(out[JAW], out[HEAD], jp[0] - n[0], jp[1] - n[1], jp[2] - n[2], Math.max(0, P.jawA - JAW_REST) * JAW_K, 0, 0);
  const T = X.tail;
  const ty = P.tailYaw;
  local(out[TAIL], out[BODY], 0, X.tailY, T[0], 0, ty[0], 0);
  local(out[TAIL + 1], out[TAIL], 0, 0, T[1] - T[0], 0, ty[1] - ty[0] * 0.3, 0);
  local(out[TAIL + 2], out[TAIL + 1], 0, 0, T[2] - T[1], 0, ty[2] - ty[1] * 0.3, 0);
  for (let k = 0; k < 4; k++) {
    const G = X.legs[k];
    const side = G.sh[0] > 0 ? 1 : -1;
    const L = P.legs[k];
    local(out[ARM + k], out[BODY], G.sh[0], G.sh[1], G.sh[2], 0, L.swing, side * (L.splay - SPLAY0));
    local(out[FORE + k], out[ARM + k], G.el[0] - G.sh[0], G.el[1] - G.sh[1], G.el[2] - G.sh[2], 0, 0, side * (L.knee - L.splay - (KNEE0[k] - SPLAY0)));
  }
}
const REST = { M: new THREE.Matrix4(), headP: 0, headY: 0, jawA: JAW_REST, tailYaw: [0, 0, 0], legs: [0, 1, 2, 3].map((k) => ({ swing: 0, splay: SPLAY0, knee: KNEE0[k] })) };

// Los pesos de cada vértice (en reposo): las patas, lo que está cerca de su
// hueso (brazo, y antebrazo con la mano); el resto a lo largo: cola, cuerpo,
// cabeza y, debajo de la línea de la boca, la mandíbula.
function weigh(X, pos) {
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const T = X.tail;
  // la cadena a lo largo (de la punta de la cola a la cabeza): [hueso, desde z]
  const chain = [[TAIL + 2, -Infinity], [TAIL + 1, T[2]], [TAIL, T[1]], [BODY, T[0]], [HEAD, X.neck[2]]];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const W = new Map();
    const add = (b, w) => w > 1e-4 && W.set(b, (W.get(b) || 0) + w);
    // las patas
    let legW = 0;
    const o1 = {};
    const o2 = {};
    for (let k = 0; k < 4; k++) {
      const G = X.legs[k];
      if (Math.sign(p.x) !== Math.sign(G.sh[0])) continue;
      const d1 = seg(p, G.sh, G.el, o1);
      const d2 = seg(p, G.el, G.ft, o2);
      // (pegado al hombro se mezcla con el cuerpo)
      const w = (1 - sstep(LEG_R[0], LEG_R[1], Math.min(d1, d2))) * (d1 <= d2 ? sstep(0, 0.5, o1.t) : 1);
      if (w <= 0) continue;
      const lo = sstep(-0.02, 0.02, d1 - d2);
      add(ARM + k, w * (1 - lo));
      add(FORE + k, w * lo);
      legW = Math.max(legW, w);
    }
    // a lo largo
    const rest = 1 - legW;
    if (rest > 0) {
      for (let c = 0; c < chain.length; c++) {
        const [b, z0] = chain[c];
        const z1 = c + 1 < chain.length ? chain[c + 1][1] : Infinity;
        const a = z0 === -Infinity ? 1 : sstep(z0 - BLEND, z0 + BLEND, p.z);
        const e = z1 === Infinity ? 1 : 1 - sstep(z1 - BLEND, z1 + BLEND, p.z);
        let w = rest * Math.min(a, e);
        if (w <= 0) continue;
        if (b === HEAD) {
          // la mandíbula: lo de abajo de la línea de la boca, de la bisagra para adelante
          const j = sstep(X.jawZ - 0.02, X.jawZ + 0.06, p.z) * sstep(X.mouth[0] + X.mouth[1] * p.z + 0.012, X.mouth[0] + X.mouth[1] * p.z - 0.012, p.y);
          add(JAW, w * j);
          w *= 1 - j;
        }
        add(b, w);
      }
    }
    packWeights(W, idx, wt, i);
  }
  return { idx, wt };
}

const DEF = {
  url: URL,
  key: 'yacare',
  nb: NB,
  head: HEAD,
  off: '__yacareSkinOff',
  look: { rim: 0.35 },
  rest: () => REST,
  bonesFor: (X, P, out) => {
    // (la altura de la nuca de la cola, si no viene medida)
    X.tailY ??= 0.08;
    bonesFor(X, P, out);
  },
  weigh,
};

export default class YacareSkin extends AnimalSkin {
  constructor(game, eyeMat) {
    super(game, eyeMat, DEF);
  }

  // La pose de YacareRig (nadando, un poco más hundido: el lomo del modelo es
  // más alto que el de las piezas).
  pose(z, P) {
    if (P.sw > 0.01) P.M.multiply(tmpL.makeTranslation(0, -SWIM_SINK * P.sw, 0));
    return super.pose(z.slot, P);
  }
}
