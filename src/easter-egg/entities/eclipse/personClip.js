import * as THREE from 'three';
import { gauchoRig, sampleClip } from '../../net/gauchoSkin';

// Los clips del gaucho (net/gauchoSkin: clips.json y los de las cinemáticas)
// en las personas de Meshy de San Lorenzo (entities/eclipse/montar.js: San
// Martín, los granaderos, Cabral).
// (2026-10-08, el usuario, de la escena de Cabral: "cuando va caminando a
// ayudar a San Martín va robotizado, ataca robotizado, muere robotizado".
// Se movían con poses de piezas armadas a mano. El esqueleto es el mismo que
// el del gaucho —los 24 huesos de Meshy, con el mismo reposo: brazos colgando,
// a menos de 5° de diferencia—, así que el giro de cada hueso del clip (en el
// espacio del modelo) pasa derecho: el del clip, sacándole el reposo del gaucho
// y poniéndole el de la persona. La cadera, a la escala de las piernas.)
//   actPerson(a, clip, { loop, fade, rate, t })   pone un clip (null: vuelve a las piezas)
//   tickPerson(a, dt)                             cada cuadro, antes de people.update
// montar.js pose() llama a clipPose(G, T): true si lo posó el clip.
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qY = new THREE.Quaternion();
const vh = new THREE.Vector3();
const vb = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (u) => u * u * (3 - 2 * u);
let tmpW = null;

// lo que hace falta de cada modelo (una vez): por hueso del clip, el hueso de
// la persona, su reposo y el orden de padres a hijos
function rigOf(T, CL) {
  if (T.clipRig) return T.clipRig;
  const tb = {};
  T.root.traverse((o) => {
    if (o.isBone) tb[o.name] = o;
  });
  T.root.updateMatrixWorld(true);
  const restT = CL.names.map((n) => (tb[n] ? tb[n].getWorldQuaternion(new THREE.Quaternion()) : null));
  // K: del giro del clip al de la persona (W · K)
  const K = CL.names.map((n, i) => (restT[i] ? CL.restW[i].clone().invert().multiply(restT[i]) : null));
  const hips = tb.Hips.getWorldPosition(new THREE.Vector3());
  const feet = new THREE.Vector3();
  let nf = 0;
  for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) {
    if (!tb[n]) continue;
    feet.add(tb[n].getWorldPosition(new THREE.Vector3()));
    nf++;
  }
  feet.multiplyScalar(1 / Math.max(1, nf)).setY(0);
  // la escala: el largo de las piernas
  const leg = (B, s) => B[s + 'UpLeg'].getWorldPosition(new THREE.Vector3()).distanceTo(B[s + 'Leg'].getWorldPosition(new THREE.Vector3())) + B[s + 'Leg'].getWorldPosition(new THREE.Vector3()).distanceTo(B[s + 'Foot'].getWorldPosition(new THREE.Vector3()));
  const sc = CL.legLen > 0 ? leg(tb, 'Left') / CL.legLen : hips.y / CL.hipsRest.y;
  T.clipRig = { K, hips, feet, sc, restSpine: restT[CL.names.indexOf('Spine')] };
  return T.clipRig;
}

// Pone (o saca, con null) un clip en una persona. o: { loop, fade (s), rate, t (desde qué segundo) }
export function actPerson(a, c, o = {}) {
  const G = a?.gs;
  if (!G) {
    // (el modelo todavía no bajó: queda pedido)
    if (a) a.ccWant = c ? { c, o } : null;
    return;
  }
  if (!c) {
    G.cc = null;
    return;
  }
  const CL = gauchoRig();
  if (CL) G.cb ||= CL.names.map((n) => G.bones[n] || null);
  // de dónde viene (para no saltar): los huesos como están ahora
  let snap = null;
  if (CL && G.cb && (o.fade ?? 0.25) > 0) snap = { W: G.cb.map((b) => (b ? b.getWorldQuaternion(new THREE.Quaternion()) : null)), h: G.bones.Hips.getWorldPosition(new THREE.Vector3()) };
  G.cc = { c, lt: o.t || 0, rate: o.rate ?? 1, loop: !!o.loop, fade: o.fade ?? 0.25, age: 0, snap };
}

export function tickPerson(a, dt) {
  if (a?.ccWant && a.gs) {
    const w = a.ccWant;
    a.ccWant = null;
    actPerson(a, w.c, w.o);
  }
  const S = a?.gs?.cc;
  if (!S) return;
  S.lt += dt * S.rate;
  S.age += dt;
}

// ¿Terminó el clip (los que no dan la vuelta)?
export const personClipDone = (a) => {
  const S = a?.gs?.cc;
  return !S || (!S.loop && S.lt >= S.c.dur - 0.02);
};

// Lo llama montar.js pose(): los huesos según el clip. false: no hay clip (o
// todavía no bajaron los del gaucho): quedan las piezas.
export function clipPose(G, T) {
  const S = G.cc;
  if (!S) return false;
  const CL = gauchoRig();
  if (!CL) return false;
  const R = rigOf(T, CL);
  const nb = CL.nb;
  G.cb ||= CL.names.map((n) => G.bones[n] || null);
  G.cW ||= CL.names.map(() => new THREE.Quaternion());
  tmpW ||= CL.names.map(() => new THREE.Quaternion());
  const W = G.cW;
  const c = S.c;
  const loop = S.loop && c.loop !== false;
  sampleClip(c, loop ? S.lt : Math.min(Math.max(0, S.lt), c.dur), loop, W, vh);
  const r = G.a.r;
  const yaw = (r.yaw || 0) + Math.PI;
  qY.setFromAxisAngle(UP, yaw);
  // la cadera: la del clip, a la escala de la persona, desde sus pies
  vb.copy(vh).multiplyScalar(R.sc).add(R.hips).sub(R.feet);
  // (r.clipFwd: metros hacia adelante del cuerpo —para pasar de un clip tendido
  // a otro sin que la cabeza se corra—)
  if (r.clipFwd) vb.z += r.clipFwd;
  vb.applyQuaternion(qY);
  vb.x += r.pos.x;
  vb.y += r.pos.y + (r.clipY || 0);
  vb.z += r.pos.z;
  for (let i = 0; i < nb; i++) {
    if (!R.K[i]) continue;
    W[i].multiply(R.K[i]).premultiply(qY);
  }
  // la mezcla desde donde estaba
  if (S.snap && S.age < S.fade) {
    const k = smooth(Math.max(0, S.age / S.fade));
    for (let i = 0; i < nb; i++) if (S.snap.W[i] && R.K[i]) W[i].copy(qa.copy(S.snap.W[i]).slerp(W[i], k));
    vb.lerpVectors(S.snap.h, vb, k);
  }
  for (let i = 0; i < nb; i++) {
    const b = G.cb[i];
    if (!b) continue;
    const pi = CL.parent[i];
    b.quaternion.copy(qa.copy(pi >= 0 && G.cb[pi] ? W[pi] : T.armQ).invert()).multiply(W[i]);
  }
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  // la pieza del pecho (la usa el sable para saber dónde es adelante)
  const iS = CL.names.indexOf('Spine');
  if (iS >= 0 && R.restSpine) {
    qb.copy(W[iS]).multiply(qa.copy(R.restSpine).invert()).multiply(qa.copy(T.partRest[1]).invert());
    const M = G.a.mats;
    M[1].decompose(vh, qa, vb);
    M[1].compose(vh, qb, vb);
  }
  return true;
}
