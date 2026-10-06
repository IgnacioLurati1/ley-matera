import * as THREE from 'three';
import { clampT } from '../bossSkin';
import { attach, armPose, update as chainUpdate } from '../skinChain';
import { assetUrl } from '../../../lib/assets';

// El Gauchito Gil con cuerpo de verdad (entities/bossSkin.js): el low poly de
// poncho grande (Meshy: concepto, malla y esqueleto; el poncho repesado al
// lomo y un poco al brazo) con clips de Mixamo que eligió el usuario. Qué clip
// va en cada estado de la pelea del cerro y de la cárcel (world/Cerro.js),
// cada golpe a tiempo con el juego. No corre: camina (el paso al ritmo de lo
// que avanza) y, parado, revolea la cadena de la mano derecha
// (entities/skinChain.js). Tira la cadena quieto, con la derecha.
// Agarrado por las almas (world/gilHeld.js) lo lleva el cuerpo de piezas (las
// almas le agarran las manos y los pies de las piezas). De rodillas en el
// final (ui/PenalCinematic.js gilWant), con clips hechos a mano en Blender
// sobre este mismo modelo (C:/Users/ignac/Tools/mdu-blender gil_clips.py →
// cine-gil.json: vencido, habla, ruega, señala, el rayo, se desarma);
// globalThis.__mduBlend = false: las poses de piezas de antes. Lo colorado de
// la segunda fase, el rayo y la ceniza se copian de los materiales del jefe (after).

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

// Los clips de la pelea hechos a mano en Blender (C:/Users/ignac/Tools/mdu-blender
// gilf_clips.py → clips-blend.json: caminar con el paso medido, la embestida, el
// grito, el molinete de una y de dos vueltas, atontado, agarrado, de rodillas),
// en vez de los de Mixamo de clips.json. APAGADOS desde 2026-10-05 (el usuario
// quiere la pelea como era): globalThis.__mduGilFightBlend = true los prende.
// (las cinemáticas del Gil no pasan por acá: siguen con lo suyo)
export const gilFightBlend = () => globalThis.__mduGilFightBlend === true && globalThis.__mduNoGilFightBlend !== true && globalThis.__mduBlend !== false;

// Al morir queda en la pose con que arranca el final (ui/PenalCinematic.js
// gilWant: gDown de cine-gil.json, de rodillas, vencido; lo pidió el usuario el
// 2026-10-05): de vuelta en el cerro después de la cárcel ya está así (el paso
// queda bajo el pantallazo blanco) y, si cae en el cerro, se arrodilla (el
// arrodilla de siempre) y cae la otra rodilla. S.downT: por dónde va gDown; el
// final sigue desde ahí, sin salto. globalThis.__mduNoGilDeathCine = true: como
// antes (de rodillas con las poses de piezas de world/gilHeld.js, o el arrodilla solo)
const deathCine = (S) => globalThis.__mduNoGilDeathCine !== true && globalThis.__mduBlend !== false && !!S.clips.gDown;
// cayendo en el cerro: hasta acá del arrodilla (s desde que cae; la rodilla
// derecha va llegando al piso) y cuánto tarda en caer la otra
const KNEE_AT = 1.3;
const KNEE_FADE = 0.8;
// (de vuelta en el cerro, bajo el blanco: enseguida)
const HOME_FADE = 0.1;
function down(S, dt, fade) {
  S.downT = (S.downT ?? -dt) + dt;
  return { key: 'gDown', t: S.downT % S.clips.gDown.dur, fade };
}
// Cayendo la otra rodilla (arrodilla → gDown): de la rodilla para abajo llega
// antes que el resto (con la mezcla pareja el pie de adelante giraba para atrás
// con el tobillo abajo y se metía 20 cm en el piso): LEAD, qué parte de la
// mezcla ya hicieron las piernas cuando el resto va por el final.
const LEGS = ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'];
const LEAD = 0.8;
const smooth = (u) => u * u * (3 - 2 * u);
const kneeFading = (S) => {
  const L = S.layers;
  const top = L[L.length - 1];
  return L.length === 2 && top.key === 'gDown' && top.w < 1 ? top : null;
};
function legsFirst(S) {
  const top = kneeFading(S);
  if (!top) return;
  const from = S.layers[0];
  const k = smooth(Math.min(1, top.w / LEAD));
  S.legIx ||= LEGS.map((n) => S.list.indexOf(S.byName[n])).filter((i) => i >= 0);
  for (const i of S.legIx) S.list[i].W.copy(from.W[i]).slerp(top.W[i], k);
}
// Y en esa misma caída los pies no se meten en el piso: si un vértice del pie
// (los del tobillo y los dedos) queda abajo, la pierna de la rodilla para abajo
// gira para arriba lo justo (la rodilla queda donde está). Con los huesos ya puestos.
// (al arrancar deja lo que ya se hundía el arrodilla, unos 3 cm de la punta
// del pie: si no, el pie saltaba 5 cm en un cuadro)
const FOOT_MARGIN = 0.01;
const FOOT_START = 0.04;
const fv = new THREE.Vector3();
const fp = new THREE.Vector3();
const fk = new THREE.Vector3();
const fd = new THREE.Vector3();
const fq = new THREE.Quaternion();
const fw = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
function feetUp(S, floorY) {
  const top = kneeFading(S);
  if (!top) return;
  const level = floorY + FOOT_MARGIN - FOOT_START * (1 - smooth(Math.min(1, top.w / 0.3)));
  if (S.feet === undefined) {
    S.feet = null;
    S.root.traverse((o) => {
      if (!o.isSkinnedMesh || S.feet) return;
      const SI = o.geometry.attributes.skinIndex;
      const SW = o.geometry.attributes.skinWeight;
      const sides = {};
      for (const side of ['Left', 'Right']) {
        const want = [side + 'Foot', side + 'ToeBase'].map((n) => o.skeleton.bones.indexOf(S.bones[n]));
        const ix = [];
        for (let i = 0; i < SI.count; i++) {
          let bi = -1;
          let bw = -1;
          for (let k = 0; k < 4; k++) if (SW.getComponent(i, k) > bw) { bw = SW.getComponent(i, k); bi = SI.getComponent(i, k); }
          if (want.includes(bi)) ix.push(i);
        }
        sides[side] = ix;
      }
      S.feet = { mesh: o, sides };
    });
  }
  const F = S.feet;
  if (!F) return;
  const m = F.mesh;
  m.skeleton.update();
  for (const side of ['Left', 'Right']) {
    const shin = S.bones[side + 'Leg'];
    if (!shin) continue;
    for (let it = 0; it < 2; it++) {
      let lo = Infinity;
      for (const i of F.sides[side]) {
        m.getVertexPosition(i, fv).applyMatrix4(m.matrixWorld);
        if (fv.y < lo) {
          lo = fv.y;
          fp.copy(fv);
        }
      }
      const need = level - lo;
      if (!(need > 0.002)) break;
      shin.getWorldPosition(fk);
      fd.copy(fp).sub(fk);
      const r = fd.length();
      const a0 = Math.asin(Math.max(-1, Math.min(1, fd.y / r)));
      const a1 = Math.asin(Math.max(-1, Math.min(1, (fd.y + need) / r)));
      fd.cross(UP);
      if (fd.lengthSq() < 1e-8) break;
      fq.setFromAxisAngle(fd.normalize(), a1 - a0);
      shin.getWorldQuaternion(fw).premultiply(fq);
      shin.quaternion.copy(shin.parent.getWorldQuaternion(fq).invert().multiply(fw));
      shin.updateMatrixWorld(true);
      m.skeleton.update();
    }
  }
}

// Andando: camina (nunca corre) o, parado, revolea la cadena.
function move(S, dt, s, z) {
  const C = S.clips;
  // (los de Blender: el paso sigue a lo que avanza casi sin demora y puede ir más
  // lento, así cuando frena de golpe o se traba el pie apoyado no patina)
  const bl = !!C.quieto.blend && !!S.gp;
  const vm = (bl ? S.gp.v : S.v) / Math.max(0.1, s);
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(bl ? 0.3 : 0.55, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.chain.want = 1;
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

export default {
  kind: 'gil',
  dir: 'gil',
  // (pesos de la piel rehechos 2026-10-04: el poncho cuelga del lomo y los hombros
  // con transición suave a los brazos, sin puntas ni agujeros; scratchpad
  // penal-npc2/wopt.py. globalThis.__mduOldGil = true: el modelo de antes)
  // (los clips de la pelea hechos en Blender, clips-blend.json: gilFightBlend())
  files: () => ({ ...(globalThis.__mduOldGil ? { glb: 'modelo-viejo.glb' } : {}), ...(gilFightBlend() ? { clips: 'clips-blend.json' } : {}) }),
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
    // los del final del penal (se suman a los de la pelea; S.cineGil cuando llegan)
    if (globalThis.__mduBlend !== false)
      fetch(assetUrl('/assets/sotano/modelos/gil/cine-gil.json'))
        .then((r) => r.json())
        .then((J) => {
          for (const [k, c] of Object.entries(J.clips)) {
            S.clips[k] = { ...c, q: Float32Array.from(c.q), hips: Float32Array.from(c.hips) };
            if (c.loop && !S.skin.loops.includes(k)) S.skin.loops.push(k);
          }
          S.cineGil = true;
        })
        .catch(() => {});
  },

  // La pelea (y el final, que arma su Gil como jefe).
  pick(z, { S, dt, s, g }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    // (los de Blender: lo que avanza de verdad, cuadro a cuadro, para el ritmo del paso: move)
    if (C.quieto.blend && z.pos) {
      const P = (S.gp ||= { x: z.pos.x, z: z.pos.z, v: 0 });
      const sp = dt > 0 ? Math.hypot(z.pos.x - P.x, z.pos.z - P.z) / dt : 0;
      P.v += (Math.min(30, sp) - P.v) * Math.min(1, dt * 12);
      P.x = z.pos.x;
      P.z = z.pos.z;
    }
    // (la cadena: se ve salvo que diga otra cosa; revolea solo parado)
    S.chainShow = true;
    S.chain.want = 0;
    S.kneeing = false;
    // de rodillas en el final: las poses de la escena
    if (g.cine?.gil === z) {
      S.chainShow = false;
      return (S.cineGil && g.cine.gilWant?.(S)) || { key: 'rig' };
    }
    // agarrado por las almas: se sacude y después lo tienen de las manos
    const H = g.arena?.held;
    if (H?.active && H.z === z) {
      S.chainShow = false;
      if (H.home && deathCine(S)) return down(S, dt, HOME_FADE);
      if (!H.home && H.t < HELD_GRAB) return { key: 'electro', t: clampT(S, 'electro', 0.4 + H.t) };
      return { key: 'rig' };
    }
    if (z.dead || st === 'dead' || st === 'melting') {
      S.chainShow = false;
      S.deadT = (S.deadT ?? -dt) + dt;
      if (S.deadT >= KNEE_AT && deathCine(S)) {
        S.kneeing = true;
        return down(S, dt, KNEE_FADE);
      }
      return { key: 'arrodilla', t: clampT(S, 'arrodilla', 0.6 + S.deadT) };
    }
    S.deadT = null;
    S.downT = null;
    // el molinete: la vuelta pasa cuando pega la cadena (con dos vueltas, dos veces)
    const W = g.arena?.sweepS;
    // (los de Blender: con dos vueltas, molinete2 de corrido, sin volver atrás;
    // la cadena en la mano salvo mientras se ve la del cerro, world/Cerro.js updateSweep)
    if (W && (st === 'summon' || st === 'chase') && C.quieto.blend && C.molinete2) {
      S.chainShow = W.t < SWEEP_WARN - 0.42 || W.t > SWEEP_WARN + (W.n - 1) * SWEEP_GAP + 0.2;
      const k = W.n > 1 ? 'molinete2' : 'molinete';
      S.molK = k;
      S.molT = C[k].fast + W.t - SWEEP_WARN;
      return { key: k, t: clampT(S, k, S.molT) };
    }
    // (y cuando la cadena del cerro se va, termina el giro y apoya el pie:
    // world/Cerro.js sweep lo deja quieto hasta acá)
    if (S.molK && !W && st === 'chase' && C.quieto.blend) {
      S.molT += dt;
      if (S.molT < C[S.molK].dur) return { key: S.molK, t: clampT(S, S.molK, S.molT) };
    }
    S.molK = null;
    if (W && (st === 'summon' || st === 'chase')) {
      S.chainShow = false;
      const next = SWEEP_WARN + Math.min(W.hits, W.n - 1) * SWEEP_GAP;
      return { key: 'molinete', t: clampT(S, 'molinete', C.molinete.fast + W.t - next) };
    }
    // la cadena: la de Blender (de costado, con el cuerpo: gil_clips.py tiraP)
    // si está; la de Mixamo le rompía el poncho en puntas (brazo por arriba).
    // globalThis.__mduBlend = false: la de antes
    const TK = globalThis.__mduBlend !== false && C.tiraP ? 'tiraP' : 'tira';
    switch (st) {
      // el grito de guerra (al llegar, al llevárselos a la cárcel y al llegar allá)
      case 'intro':
      case 'enrage':
      case 'summon':
        return { key: 'grito', t: clampT(S, 'grito', 0.2 + Tt) };
      // la cadena: quieto, la suelta con la derecha al final de whipWind (0,65 s)
      case 'whipWind':
        return { key: TK, t: clampT(S, TK, C[TK].fast - 0.65 + Tt) };
      case 'whip':
        S.chainShow = false;
        return { key: TK, t: clampT(S, TK, C[TK].fast + Tt) };
      // de cerca: un cadenazo de arriba para abajo (pega a los 0,75 s); el salto
      // con las dos manos de antes no gustaba
      case 'slam':
        return { key: TK, t: clampT(S, TK, C[TK].fast - 0.75 + Tt) };
      // mira fijo, grita y sale embistiendo
      case 'chargeWind':
        return { key: 'grito', t: clampT(S, 'grito', 0.3 + Tt * 1.2) };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.7, Math.min(1.5, S.v / (C.carga.speed * s)));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      case 'stunned':
        return { key: 'dolor', t: clampT(S, 'dolor', 0.1 + Tt) };
      case 'chase':
        return move(S, dt, s, z);
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
    if (S.kneeing) legsFirst(S);
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
    if (S.kneeing) feetUp(S, z?.baseY || 0);
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
