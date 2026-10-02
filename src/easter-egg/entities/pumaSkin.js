import * as THREE from 'three';
import AnimalSkin, { local, seg, sstep, packWeights } from './animalSkin';

// El puma de la cordillera con cuerpo de verdad: un modelo facetado de Meshy
// (malla y textura, sin esqueleto) con los huesos armados al cargar, con las
// medidas que trae el GLB (userData.puma: el cogote, la bisagra de la boca,
// los tres puntos de la cola, hombro/rodilla/muñeca/mano de cada pata y los
// ojos). Cada cuadro PumaRig (entities/Pumas.js) calcula la pose de siempre
// (el salto desde la pared, la carrera a los saltos, el zarpazo, la caída de
// costado) y esos mismos números mueven los huesos: el cuerpo, la cabeza, la
// mandíbula, dos tramos de cola y muslo/caña/mano de cada pata. Mientras baja
// el modelo se ven las piezas. window.__pumaSkinOff = true: las piezas.
//
// El GLB: public/assets/sotano/modelos/puma/modelo.glb (mirando a +z, las
// patas en el piso, en las medidas del de piezas antes de su escala). El
// modelo viene dando un paso: cada pata trae su ángulo de reposo (a1 el muslo,
// a2 la caña) y los del rig se ponen tal cual (el muslo derecho con 0).

const URL = '/assets/sotano/modelos/puma/modelo.glb';
// los huesos
const BODY = 0;
const HEAD = 1;
const JAW = 2;
const TAIL1 = 3;
const TAIL2 = 4;
const UP = 5; // 5-8 (una por pata, en el orden de Pumas.js LEGS)
const LO = 9; // 9-12
const PAW = 13; // 13-16
const NB = 17;
// la pose de las piezas que es la del modelo quieto (Pumas.js parado: la
// cabeza 0,05, la cola 0,9 y 0,4)
const HEAD0 = 0.05;
const TAIL_A0 = 0.9;
const TAIL_B0 = 0.4;
// la boca del modelo viene abierta (gruñendo): con lo que abren las piezas de
// más se abre más, y apenas se cierra
const JAW0 = 0.1;
const JAW_K = 0.75;
const JAW_MIN = -0.08;
// la rodilla de las piezas parada (adelante y atrás); con el bOff de cada pata
// (el GLB) es la caña parada que deja la muñeca a la altura del modelo
const BEND0 = { true: -0.35, false: 0.55 };
// La rodilla no es la de las piezas (con esas cañas de verdad la mano de
// adelante estirada se doblaba hecha un bollo bajo el pecho): la de adelante
// estirada adelante queda en línea (REACH) y, corriendo, cada pata se dobla
// mientras vuelve adelante en el aire (FOLD, adelante y atrás). El muslo sí
// es el de las piezas, con el mismo desfase de cada pata (Pumas.js).
const REACH = 0.45;
const FOLD = { true: 1.1, false: 0.8 };
const OFF = [0, 0.35, Math.PI, Math.PI + 0.35];
// la mano sigue a la caña: poco cuando la pata va adelante (la mano se
// estira plana) y más cuando queda atrás (empuja y se arrastra, la almohadilla atrás)
const PAW_K = [0.3, 0.45];
// las patas: hasta qué distancia del hueso es pata del todo y desde cuál ya es
// cuerpo (m; las del puma son gruesas: la mitad de sus vértices a más de 0,07)
const LEG_R = [0.12, 0.17];
// arriba, donde la pata entra al cuerpo: desde cuánto debajo del hombro se mezcla (m)
const LEG_TOP = [0.18, 0.02];
// entre muslo, caña y mano: qué tan blando es el borde (m)
const SOFT = 0.012;
// lo que mide cada borde entre huesos a lo largo (m)
const BLEND = 0.08;

const tmpS = new THREE.Matrix4();

// Dónde va cada hueso (en el mundo) con la pose P de PumaRig: { M (el puma
// en el mundo, con su tamaño, el rebote y la inclinación), headP, jawA,
// tailA, tailB, sway (la cola de lado), legs (lo que barre cada muslo), ph y
// run (el paso y cuánto corre), gallop (corriendo) }. P.rest: la pose del modelo.
function bonesFor(X, P, out) {
  out[BODY].copy(P.M);
  const N = X.neck;
  local(out[HEAD], out[BODY], N[0], N[1], N[2], P.headP - HEAD0, 0, 0);
  const Jp = X.jawPivot;
  local(out[JAW], out[HEAD], Jp[0] - N[0], Jp[1] - N[1], Jp[2] - N[2], Math.max(JAW_MIN, P.jawA - JAW0) * JAW_K, 0, 0);
  const [T0, T1] = X.tail;
  local(out[TAIL1], out[BODY], T0[0], T0[1], T0[2], TAIL_A0 - P.tailA, P.sway || 0, 0);
  local(out[TAIL2], out[TAIL1], T1[0] - T0[0], T1[1] - T0[1], T1[2] - T0[2], TAIL_B0 - P.tailB, 0, 0);
  for (let k = 0; k < 4; k++) {
    const G = X.legs[k];
    // (el ángulo de cada tramo respecto del cuerpo: 0 derecho para abajo, negativo adelante)
    const aU = P.rest ? G.a1 : P.legs[k];
    const idle = BEND0[G.front] + G.bOff;
    const fold = P.gallop ? P.run * Math.max(0, -Math.cos(P.ph + OFF[k])) : 0;
    const aL = P.rest ? G.a2 : aU + idle + (G.front ? REACH * Math.max(0, -aU) : 0) + fold * FOLD[G.front];
    const dL = aL - idle;
    const aP = P.rest ? 0 : dL * PAW_K[dL > 0 ? 1 : 0];
    const sc = P.rest ? 1 : G.sc;
    local(out[UP + k], out[BODY], G.sh[0], G.sh[1], G.sh[2], aU, 0, 0);
    local(out[LO + k], out[UP + k], G.el[0] - G.sh[0], -G.L1, 0, aL - aU, 0, 0);
    local(out[PAW + k], out[LO + k], G.wr[0] - G.el[0], -G.L2 * sc, 0, aP - aL, 0, 0);
    // (la pata estirada del modelo, más larga que la otra: su caña se acorta)
    if (sc !== 1) out[LO + k].multiply(tmpS.makeScale(1, sc, 1));
  }
}
const REST = { M: new THREE.Matrix4(), rest: true, headP: HEAD0, jawA: JAW0, tailA: TAIL_A0, tailB: TAIL_B0, sway: 0 };

// Los pesos de cada vértice (en reposo): las patas, lo que está cerca de su
// hueso (muslo, caña o mano: el más cerca, con el borde blando) y debajo del
// hombro; el resto a lo largo: cola (dos tramos), cuerpo, cabeza y, debajo de
// la línea de la boca, la mandíbula.
function weigh(X, pos) {
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const o = {};
  const [T0, T1, T2] = X.tail;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const W = new Map();
    const add = (b, w) => w > 1e-4 && W.set(b, (W.get(b) || 0) + w);
    // la pata más cerca de este lado
    let best = null;
    for (let k = 0; k < 4; k++) {
      const G = X.legs[k];
      if (Math.sign(p.x) !== Math.sign(G.sh[0])) continue;
      const d1 = seg(p, G.sh, G.el, o);
      const d2 = seg(p, G.el, G.wr, o);
      const d3 = seg(p, G.wr, G.toe, o);
      const d = Math.min(d1, d2, d3);
      if (!best || d < best.d) best = { k, d, d1, d2, d3, top: G.sh[1] };
    }
    let legW = 0;
    if (best) {
      const w = (1 - sstep(LEG_R[0], LEG_R[1], best.d)) * (1 - sstep(best.top - LEG_TOP[0], best.top - LEG_TOP[1], p.y));
      if (w > 0) {
        const e1 = Math.exp(-(best.d1 - best.d) / SOFT);
        const e2 = Math.exp(-(best.d2 - best.d) / SOFT);
        const e3 = Math.exp(-(best.d3 - best.d) / SOFT);
        const s = e1 + e2 + e3;
        // (en el borde con el cuerpo, la caña y la mano tiran menos: el muslo, que
        // se mueve menos, se lleva lo suyo; si no, el borde se estira como una tela)
        add(UP + best.k, (w * (e1 + (1 - w) * (e2 + e3))) / s);
        add(LO + best.k, (w * w * e2) / s);
        add(PAW + best.k, (w * w * e3) / s);
        legW = w;
      }
    }
    const rest = 1 - legW;
    if (rest > 0) {
      // la cola: detrás de la grupa (y arriba de las patas); el segundo tramo, el más cerca del de la punta
      const tail = (1 - sstep(X.tailZ - BLEND / 2, X.tailZ + BLEND / 2, p.z)) * sstep(0.14, 0.2, p.y);
      const t2 = tail > 0 ? 1 / (1 + Math.exp((seg(p, T1, T2, o) - seg(p, T0, T1, o)) / SOFT)) : 0;
      const head = sstep(X.neck[2] - BLEND, X.neck[2] + BLEND, p.z) * sstep(X.headY - 0.02, X.headY + 0.04, p.y);
      // la mandíbula: lo de abajo de la boca, de la bisagra para adelante
      const jaw = head * sstep(X.jawZ - 0.03, X.jawZ + 0.01, p.z) * sstep(X.mouthY + 0.01, X.mouthY - 0.01, p.y);
      add(TAIL1, rest * tail * (1 - t2));
      add(TAIL2, rest * tail * t2);
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
  key: 'puma',
  nb: NB,
  head: HEAD,
  off: '__pumaSkinOff',
  look: { rim: 0.35 },
  rest: () => REST,
  bonesFor,
  weigh,
};

export default class PumaSkin extends AnimalSkin {
  constructor(game, eyeMat) {
    super(game, eyeMat, DEF);
  }
}
