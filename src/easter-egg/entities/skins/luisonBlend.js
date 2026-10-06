import * as THREE from 'three';
import { POUNCE } from '../luison';
import { clampT } from '../bossSkin';

// El Luisón animado en Blender (C:/Users/ignac/Tools/mdu-blender/luboss_clips.py):
// clips hechos a mano con IK y el paso medido, y el modelo con la mandíbula de
// verdad (modelo-blend.glb: toda la mandíbula de abajo al hueso luJaw, la boca
// por dentro oscura y los dientes). Lo usa skins/luison.js mientras no esté
// globalThis.__mduNoLuisonBlend (antes de que cargue el jefe: el modelo y los
// clips se eligen al bajarlos).
//
// Clips (clips-blend.json, en el lugar; los que andan con speed en m/s del
// modelo, sin patinar a ritmo v/speed): idle, walk, run, stalk (en cuatro patas,
// agazapado), crouchIdle, howl, intro, enrage, summon, slam, lunge
// (whipWind+whip), crouch (chargeWind), pounce (charge), land, daze, muere.
// Cada clip trae la boca por cuadro (jaw, rad).

export const FILES = { glb: 'modelo-blend.glb', clips: 'clips-blend.json' };

// andando: m/s del modelo (S.v / s)
const WALK_ON = 0.25;
const WALK_OFF = 0.15;
const RUN_ON = 1.45;
const RUN_OFF = 1.15;
const RATE = [0.55, 1.6];
const RATE_LOW = 3.0;
// en cuatro patas: del paso (stalk) a la carrera (bound), m/s del modelo
const BOUND_ON = 1.3;
const BOUND_OFF = 1.0;
// el salto: lo alto del arco en la pelea (m) y la caída (s del clip land)
const FLY_H = 1.25;
const LAND_T = 0.6;
// en el pajonal: un poco más abajo (las matas lo tapan)
const LOW_SINK = 0;

const rate = (vm, sp) => Math.max(RATE[0], Math.min(RATE[1], vm / sp));

// caminar, correr o quieto, con el paso a tiempo con lo que avanza; al pasar
// de uno al otro, la misma fase (el pie que apoya)
// (al arrancar desde parado el clip empieza con el pie izquierdo apoyado debajo
// del cuerpo, donde lo tiene parado, y entra rápido: el pie que queda en el piso
// no patina; RUN_UNDER/WALK_UNDER: fracción de la vuelta)
const RUN_UNDER = 0.18;
const WALK_UNDER = 0.3;
const START_FADE = 0.12;
function move(S, dt, s, walkOnly) {
  const C = S.clips;
  const vm = (S.vi ?? S.v) / Math.max(0.1, s);
  const wasRun = S.run;
  const wasWalk = S.walking;
  S.run = !walkOnly && (S.run ? vm > RUN_OFF : vm > RUN_ON);
  if (S.run) {
    let fade;
    if (!wasRun) {
      if (wasWalk) S.runT = ((S.walkT || 0) / C.walk.dur) * C.run.dur;
      else {
        S.runT = RUN_UNDER * C.run.dur;
        fade = START_FADE;
      }
    }
    S.walking = false;
    S.runT = (S.runT || 0) + dt * rate(vm, C.run.speed);
    return { key: 'run', t: S.runT % C.run.dur, fade };
  }
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    let fade;
    if (wasRun) S.walkT = ((S.runT || 0) / C.run.dur) * C.walk.dur;
    else if (!wasWalk) {
      S.walkT = WALK_UNDER * C.walk.dur;
      fade = START_FADE;
    }
    S.walkT = (S.walkT || 0) + dt * rate(vm, C.walk.speed);
    return { key: 'walk', t: S.walkT % C.walk.dur, ik: true, fade };
  }
  if (wasWalk) S.idleT = 0;
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'idle', t: S.idleT % C.idle.dur, ik: true };
}

// agazapado (el pajonal): en cuatro patas, andando o quieto
function low(S, dt, s) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  // (rápido: a la carrera en cuatro patas; si no, al paso)
  if (C.bound && (S.bounding ? vm > BOUND_OFF : vm > BOUND_ON)) {
    S.bounding = true;
    S.boundT = (S.boundT || 0) + dt * Math.max(RATE[0], Math.min(RATE_LOW, vm / C.bound.speed));
    return { key: 'bound', t: S.boundT % C.bound.dur, ik: true, hands: true };
  }
  S.bounding = false;
  if (vm > 0.3) {
    S.stalkT = (S.stalkT || 0) + dt * Math.max(RATE[0], Math.min(RATE_LOW, vm / C.stalk.speed));
    return { key: 'stalk', t: S.stalkT % C.stalk.dur, ik: true, hands: true };
  }
  S.crT = (S.crT || 0) + dt;
  return { key: 'crouchIdle', t: S.crT % C.crouchIdle.dur, ik: true, hands: true };
}

function pick(z, { S, dt, s }) {
  const st = z.state;
  const Tt = z.stateT || 0;
  // lo rápido que va de verdad, casi sin suavizar (S.v de bossSkin tarda ~0,2 s:
  // al arrancar, el clip iba lento con el cuerpo ya corriendo y patinaba)
  if (S.lp && dt > 0) {
    const sp = Math.min(30, Math.hypot(z.pos.x - S.lp.x, z.pos.z - S.lp.z) / dt);
    S.vi = (S.vi ?? sp) + (sp - (S.vi ?? sp)) * Math.min(1, dt * 20);
  }
  (S.lp ||= new THREE.Vector3()).copy(z.pos);
  // (de dónde viene: la caída después del salto)
  if (S.prevSt !== st) {
    if (S.prevSt === 'charge' && st !== 'stunned') S.landT = 0;
    S.prevSt = st;
  }
  if (S.landT != null) S.landT += dt;
  if (z.dead || st === 'dead' || st === 'melting') {
    S.deadT = (S.deadT ?? -dt) + dt;
    return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
  }
  S.deadT = null;
  S.lowNow = 0;
  switch (st) {
    case 'intro':
      return { key: 'intro', t: Tt };
    case 'howl':
      return { key: 'howl', t: Tt };
    case 'enrage':
      return { key: 'enrage', t: Tt };
    case 'summon':
      return { key: 'summon', t: Tt };
    case 'slam':
      return { key: 'slam', t: Tt };
    case 'whipWind':
      return { key: 'lunge', t: Math.min(0.65, Tt) };
    case 'whip':
      return { key: 'lunge', t: 0.65 + Tt };
    case 'chargeWind':
      return { key: 'crouch', t: Tt, ik: true, hands: Tt > 0.3 };
    case 'charge': {
      const k = Math.min(1, Tt / POUNCE);
      S.arcNow = FLY_H * Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.04) / 0.9)));
      return { key: 'pounce', t: k * S.clips.pounce.dur };
    }
    case 'stunned':
      return { key: 'daze', t: Tt % S.clips.daze.dur };
    case 'lurk':
      S.lowNow = 1;
      return low(S, dt, s);
  }
  if ((z.lowK || 0) > 0.3) {
    S.lowNow = z.lowK;
    return low(S, dt, s);
  }
  // recién caído del salto: la caída, y después a correr
  if (S.landT != null && S.landT < LAND_T && st === 'chase') return { key: 'land', t: S.landT, ik: S.landT > 0.08, hands: S.landT > 0.08 && S.landT < 0.4 };
  S.landT = null;
  if (st === 'chase' && z.holdT > 0) {
    S.idleT = (S.idleT || 0) + dt;
    return { key: 'idle', t: S.idleT % S.clips.idle.dur, ik: true };
  }
  return move(S, dt, s);
}

// La llegada (ui/LuisonArrival): sube la loma caminando (los pies en la loma con
// IK), parado respira, aúlla, se agacha, salta y cae.
const CROUCH_T = 0.55;
function cine({ who: L, A }, { S, dt, s }) {
  const C = S.clips;
  const st = L.stateT || 0;
  S.ground = A?.hillY ? (x, z) => A.hillY(x, z) : null;
  // (en la loma los pies apoyan: si el clip lo deja en el aire, baja hasta el piso;
  // en el salto no)
  S.snapFloor = L.state === 'climb' || L.state === 'pose' || L.state === 'howl' || (L.state === 'landed' && st > 0.12);
  switch (L.state) {
    case 'hide':
      return { key: 'idle', t: 0, hidden: true };
    case 'climb':
      return { ...move(S, dt, s, true), ik: true };
    case 'pose':
      S.idleT = (S.idleT || 0) + dt;
      return { key: 'idle', t: S.idleT % C.idle.dur, ik: true };
    case 'howl': {
      const cr = L.leapIn != null ? st - (L.leapIn - CROUCH_T) : -1;
      if (cr > 0) return { key: 'crouch', t: Math.min(C.crouch.dur, (cr * C.crouch.dur) / CROUCH_T), ik: true };
      return { key: 'howl', t: st, ik: true };
    }
    case 'leap': {
      const tot = A.luTop && A.luLand ? A.luTop.distanceTo(A.luLand) : 1;
      const d = A.luTop ? Math.hypot(L.pos.x - A.luTop.x, L.pos.z - A.luTop.z) : st;
      const k = Math.min(1, d / Math.max(0.01, tot));
      return { key: 'pounce', t: k * C.pounce.dur, feet: true };
    }
    case 'landed':
      if (st < LAND_T) return { key: 'land', t: st };
      S.idleT = (S.idleT || 0) + dt;
      return { key: 'idle', t: S.idleT % C.idle.dur, ik: true };
  }
  return { key: 'idle', t: 0 };
}

function adjust(S, ctx, z, qYaw, hipsW) {
  if (S.arcNow && hipsW) hipsW.y += S.arcNow;
  S.arcNow = 0;
  // agazapado en la paja: un poco hundido (lo tapan las matas)
  S.lowK = (S.lowK || 0) + ((S.lowNow || 0) - (S.lowK || 0)) * Math.min(1, ctx.dt * 6);
  if (S.lowK > 1e-3 && hipsW) hipsW.y -= LOW_SINK * S.lowK;
}

// La boca: la que trae cada clip por cuadro, mezclada con sus pesos; abierta
// tiembla apenas (gruñe).
const qd = new THREE.Quaternion();
const XA = new THREE.Vector3(1, 0, 0);
function jawOf(S) {
  let a = 0;
  let w = 0;
  for (const L of S.layers) {
    const c = S.clips[L.key];
    w += L.w;
    if (!c?.jaw) continue;
    const f = Math.max(0, L.t) * S.fps;
    const loop = c.loop;
    let f0 = Math.floor(f);
    let f1 = f0 + 1;
    if (loop) {
      f0 %= c.n;
      f1 %= c.n;
    } else {
      f0 = Math.min(c.n - 1, f0);
      f1 = Math.min(c.n - 1, f1);
    }
    const k = f - Math.floor(f);
    a += (c.jaw[f0] + (c.jaw[f1] - c.jaw[f0]) * k) * L.w;
  }
  return w > 0 ? a / w : 0;
}
function mouth(S, { dt, g }) {
  const J = S.bones.luJaw;
  if (!J) return;
  S.jawRest ||= J.quaternion.clone();
  const want = jawOf(S);
  S.jaw = (S.jaw || 0) + (want - (S.jaw || 0)) * Math.min(1, dt * 18);
  const a = S.jaw * (1 + Math.sin((g?.time || 0) * 23) * 0.05 * Math.min(1, S.jaw / 0.5));
  J.quaternion.copy(S.jawRest).multiply(qd.setFromAxisAngle(XA, a));
  J.updateMatrixWorld(true);
  // (cerrada no se ve: no se dibuja)
  if (S.mouthMesh) S.mouthMesh.visible = S.jaw > 0.12;
}

// Los pies en el piso de verdad (la loma, un puente): dos huesos por pierna; si
// un pie tiene que bajar más de lo que alcanza la pierna, baja la cadera.
const A0 = new THREE.Vector3();
const B0 = new THREE.Vector3();
const C0 = new THREE.Vector3();
const T0 = new THREE.Vector3();
const TT = new THREE.Vector3();
const U = new THREE.Vector3();
const V = new THREE.Vector3();
const Wv = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const qf = new THREE.Quaternion();
const LEGS = [
  ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'],
  ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'],
];
// dos huesos: el extremo (tobillo o muñeca) sube/baja dy en el mundo y queda
// con el mismo giro en el mundo que tenía
function ik2(S, [u, l, f], dy) {
  const du = S.byName[u];
  const dl = S.byName[l];
  const df = S.byName[f];
  du.bone.getWorldPosition(A0);
  dl.bone.getWorldPosition(B0);
  df.bone.getWorldPosition(C0);
  TT.copy(C0);
  TT.y += dy;
  const l1 = A0.distanceTo(B0);
  const l2 = B0.distanceTo(C0);
  U.copy(TT).sub(A0);
  const dist = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, U.length()));
  U.normalize();
  Wv.copy(B0).sub(A0);
  Wv.addScaledVector(U, -Wv.dot(U));
  if (Wv.lengthSq() < 1e-8) Wv.set(0, 0, 1);
  Wv.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  V.copy(U).multiplyScalar(cosA * l1).addScaledVector(Wv, sinA * l1).add(A0);
  q1.setFromUnitVectors(Wv.copy(B0).sub(A0).normalize(), T0.copy(V).sub(A0).normalize());
  Wv.copy(C0).sub(B0).normalize().applyQuaternion(q1);
  T0.copy(A0).addScaledVector(U, dist).sub(V).normalize();
  q2.setFromUnitVectors(Wv, T0).multiply(q1);
  qf.copy(df.W);
  du.W.premultiply(q1);
  dl.W.premultiply(q2);
  df.W.copy(qf);
  for (const dd of [du, dl, df]) {
    const P = dd.pi >= 0 ? S.list[dd.pi].W : null;
    if (P) dd.bone.quaternion.copy(P).invert().multiply(dd.W);
  }
  du.bone.updateMatrixWorld(true);
}
const ARMS = [
  ['LeftArm', 'LeftForeArm', 'LeftHand'],
  ['RightArm', 'RightForeArm', 'RightHand'],
];
// Los pies (y en cuatro patas, las manos) en el piso de verdad (la loma, un
// puente): el piso bajo cada uno contra el del jefe; si uno tiene que bajar
// más de lo que alcanza, baja la cadera.
function feetIK(S, ctx, z) {
  const ground = S.ground || ((x, zz) => ctx.g?.world?.floorAt?.(x, zz, (z.baseY || 0) + 1.5) ?? z.baseY ?? 0);
  const floorY = z.baseY || 0;
  const k = S.ikK || 0;
  if (k < 1e-3) return;
  const at = (n) => {
    S.bones[n].getWorldPosition(C0);
    const gy = ground(C0.x, C0.z);
    return Number.isFinite(gy) ? Math.max(-0.8, Math.min(0.8, gy - floorY)) * k : 0;
  };
  const d = LEGS.map(([, , f]) => at(f));
  const hk = S.handK || 0;
  const dh = hk > 1e-3 ? ARMS.map(([, , h]) => at(h) * hk) : [0, 0];
  const drop = Math.max(0, -Math.min(d[0], d[1], dh[0], dh[1]));
  if (drop > 1e-3) {
    const H = S.bones.Hips;
    H.getWorldPosition(A0);
    A0.y -= drop;
    H.position.copy(H.parent.worldToLocal(A0));
    H.updateMatrixWorld(true);
  }
  for (let i = 0; i < 2; i++) ik2(S, LEGS[i], d[i] + drop);
  if (hk > 1e-3) for (let i = 0; i < 2; i++) ik2(S, ARMS[i], dh[i] + drop);
}

// Ningún pie adentro del piso (las mezclas entre clips muy distintos, de parado a
// agazapado, bajaban la punta del pie unos cuadros): si la punta queda abajo del
// piso, esa pierna sube lo que falta.
function floorGuard(S, ctx, z) {
  const floorY = z.baseY || 0;
  const s = S.root.scale.x;
  for (const leg of LEGS) {
    S.bones[leg[3]].getWorldPosition(C0);
    const gy = S.ground ? S.ground(C0.x, C0.z) : ctx.g?.world?.floorAt?.(C0.x, C0.z, floorY + 1.5) ?? floorY;
    const under = (Number.isFinite(gy) ? Math.max(gy, floorY - 0.3) : floorY) - 0.012 * s - C0.y;
    if (under > 0.01) ik2(S, leg, under);
  }
}

// El pie más bajo en el piso (la llegada, ui/LuisonArrival): los clips de parado,
// aullando y agachado lo dejaban hasta 14 cm en el aire sobre la loma (t_cineqa
// FLOTA). Baja la cadera lo que sobra entre el pie más bajo y el piso; si
// sobra poco, nada. (globalThis.__mduNoLuFloor: como antes)
let SOLE = null;
function floorSnap(S, ctx, z) {
  if (globalThis.__mduNoLuFloor || !S.ground) return;
  // (parado, la punta del pie queda 1,5-2,5 cm adentro del pasto de la loma: medido, t_cineqa FLOTA apoyo)
  SOLE ??= -0.015;
  let lo = Infinity;
  for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) {
    const b = S.bones[n];
    if (!b) continue;
    b.getWorldPosition(C0);
    const gy = S.ground(C0.x, C0.z);
    if (Number.isFinite(gy)) lo = Math.min(lo, C0.y - gy);
  }
  if (!Number.isFinite(lo)) return;
  const over = lo - SOLE;
  // (suave: lo que baja de más se reparte en unos cuadros; nunca sube)
  S.snapY = (S.snapY || 0) + (Math.max(0, over) - (S.snapY || 0)) * Math.min(1, (ctx.dt || 0.033) * 12);
  if (S.snapY < 0.003) return;
  const H = S.bones.Hips;
  H.getWorldPosition(A0);
  A0.y -= S.snapY;
  H.position.copy(H.parent.worldToLocal(A0));
  H.updateMatrixWorld(true);
}

function after(S, ctx, z, want) {
  if (!z || !S.root.visible) return;
  if (S.snapFloor) floorSnap(S, ctx, z);
  else S.snapY = 0;
  // (los pies con IK: andando, quieto y en la llegada; se apaga suave)
  S.ikK = (S.ikK || 0) + ((S.ikNow ? 1 : 0) - (S.ikK || 0)) * Math.min(1, ctx.dt * 8);
  S.handK = (S.handK || 0) + ((S.handNow ? 1 : 0) - (S.handK || 0)) * Math.min(1, ctx.dt * 8);
  feetIK(S, ctx, z);
  // (en el aire, no: el salto)
  if (!S.layers.some((L) => L.key === 'pounce' && L.w > 0.5)) floorGuard(S, ctx, z);
  mouth(S, ctx);
}

export default { pick, cine, adjust, after };
