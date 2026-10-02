import * as THREE from 'three';
import { clampT } from '../bossSkin';
import { attach, armPose, update as chainUpdate } from '../skinChain';

// El Gauchito Gil con cuerpo de verdad (entities/bossSkin.js): el low poly de
// poncho grande (Meshy: concepto, malla y esqueleto; el poncho repesado al
// lomo y un poco al brazo) con clips de Mixamo que eligió el usuario. Qué clip
// va en cada estado de la pelea del cerro y de la cárcel (world/Cerro.js),
// cada golpe a tiempo con el juego. No corre: camina (el paso al ritmo de lo
// que avanza) y, parado, revolea la cadena de la mano derecha
// (entities/skinChain.js). Tira la cadena quieto, con la derecha.
// Agarrado por las almas (world/gilHeld.js) y de rodillas en el final
// (ui/PenalCinematic.js) lo lleva el cuerpo de piezas (las almas le agarran
// las manos y los pies de las piezas); lo colorado de la segunda fase, el
// rayo y la ceniza se copian de los materiales del jefe (after).

// caminando o parado (m/s del modelo, con histéresis) y el ritmo máximo del paso
const WALK_ON = 0.3;
const WALK_OFF = 0.15;
const RATE_MAX = 1.6;
// el molinete del cerro (world/Cerro.js SWEEP_WARN y SWEEP_GAP): cuándo pega cada vuelta
const SWEEP_WARN = 1.05;
const SWEEP_GAP = 0.8;
// agarrado por las almas: hasta acá se sacude (después lo tienen de las manos)
const HELD_GRAB = 1.05;
// y cuánto de su altura (la del clip, escalada al gigante, era de tres metros)
const SALTA_ALTO = 0.45;
// lo colorado de la segunda fase (por la textura: el poncho y la piel más que la ropa negra;
// con la textura viva, más era salmón)
const GLOW = 0.7;
// la piel del de piezas (bossRig LOOKS.gil) y el carbón del final (PenalCinematic CHAR)
const SKIN0 = new THREE.Color(0xb08662);
const CHAR = new THREE.Color(0x141110);

// Andando: camina (nunca corre) o, parado, revolea la cadena.
function move(S, dt, s) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(0.55, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.chain.want = 1;
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

export default {
  kind: 'gil',
  dir: 'gil',
  loops: ['quieto', 'caminar', 'carga'],
  // la cadena sale de la derecha (el tiro: entities/bossMoves.js chainThrow)
  alias: { whip: 'RightHand' },
  // (menos borde de luz: el revés del poncho, visto de canto, quedaba gris)
  look: { rim: 0.35 },

  ready(S) {
    S.root.traverse((o) => {
      if (o.isSkinnedMesh) S.mat = o.material;
    });
    if (S.mat) {
      S.mat.emissive = new THREE.Color(0);
      // (lo que brilla sigue a la textura: prendido no queda una silueta lisa)
      S.mat.emissiveMap = S.mat.map;
      S.mat.needsUpdate = true;
      S.mat.userData.color0 = S.mat.color.clone();
    }
    attach(S, { side: 'Right', len: 1.6 });
  },

  // La pelea (y el final, que arma su Gil como jefe).
  pick(z, { S, dt, s, g }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    // (la cadena: se ve salvo que diga otra cosa; revolea solo parado)
    S.chainShow = true;
    S.chain.want = 0;
    // de rodillas en el final: las poses de la escena
    if (g.cine?.gil === z) {
      S.chainShow = false;
      return { key: 'rig' };
    }
    // agarrado por las almas: se sacude y después lo tienen de las manos
    const H = g.arena?.held;
    if (H?.active && H.z === z) {
      S.chainShow = false;
      if (!H.home && H.t < HELD_GRAB) return { key: 'electro', t: clampT(S, 'electro', 0.4 + H.t) };
      return { key: 'rig' };
    }
    if (z.dead || st === 'dead' || st === 'melting') {
      S.chainShow = false;
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'arrodilla', t: clampT(S, 'arrodilla', 0.6 + S.deadT) };
    }
    S.deadT = null;
    // el molinete: la vuelta pasa cuando pega la cadena (con dos vueltas, dos veces)
    const W = g.arena?.sweepS;
    if (W && (st === 'summon' || st === 'chase')) {
      S.chainShow = false;
      const next = SWEEP_WARN + Math.min(W.hits, W.n - 1) * SWEEP_GAP;
      return { key: 'molinete', t: clampT(S, 'molinete', C.molinete.fast + W.t - next) };
    }
    switch (st) {
      // el grito de guerra (al llegar, al llevárselos a la cárcel y al llegar allá)
      case 'intro':
      case 'enrage':
      case 'summon':
        return { key: 'grito', t: clampT(S, 'grito', 0.2 + Tt) };
      // la cadena: quieto, la suelta con la derecha al final de whipWind (0,65 s)
      case 'whipWind':
        return { key: 'tira', t: clampT(S, 'tira', C.tira.fast - 0.65 + Tt) };
      case 'whip':
        S.chainShow = false;
        return { key: 'tira', t: clampT(S, 'tira', C.tira.fast + Tt) };
      // de cerca: un cadenazo de arriba para abajo (pega a los 0,75 s); el salto
      // con las dos manos de antes no gustaba
      case 'slam':
        return { key: 'tira', t: clampT(S, 'tira', C.tira.fast - 0.75 + Tt) };
      // mira fijo, grita y sale embistiendo
      case 'chargeWind':
        return { key: 'grito', t: clampT(S, 'grito', 0.3 + Tt * 1.2) };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.7, Math.min(1.5, S.v / (C.carga.speed * s)));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      case 'stunned':
        return { key: 'dolor', t: clampT(S, 'dolor', 0.1 + Tt) };
      case 'chase':
        return move(S, dt, s);
    }
    S.chainShow = false;
    return { key: 'rig' };
  },

  cine() {
    return { key: 'rig' };
  },

  // el brazo que revolea la cadena (sobre el clip); el salto con golpe, más bajo
  // (el de Mixamo, a su escala, lo subía tres metros)
  adjust(S, { dt, s }, z, qYaw, hipsW) {
    armPose(S, dt, qYaw);
    const top = S.layers[S.layers.length - 1];
    if (top?.key === 'salta' && z) {
      const base = (z.baseY || 0) + S.hipsRest.y * s;
      const lift = hipsW.y - base;
      if (lift > 0) hipsW.y = base + lift * SALTA_ALTO;
    }
  },

  // Lo colorado, el rayo y la ceniza: lo que los finales le ponen a los
  // materiales del de piezas (bossMats), en el modelo. Y la cadena.
  after(S, { zs, dt, g }, z) {
    chainUpdate(S, g, dt, S.chainShow && S.layers[S.layers.length - 1]?.key !== 'rig', z?.baseY || 0);
    S.chainShow = false;
    const BM = zs.bossMats;
    const m = S.mat;
    if (!BM || !m) return;
    const src = BM.poncho;
    if (src.emissive) m.emissive.copy(src.emissive);
    m.emissiveIntensity = (src.emissiveIntensity || 0) * GLOW;
    // el carbón: cuánto se fue la piel del de piezas hacia el negro
    const k = Math.max(0, Math.min(1, (SKIN0.r - BM.skin.color.r) / (SKIN0.r - CHAR.r)));
    m.color.copy(m.userData.color0).lerp(CHAR, k);
  },
};
