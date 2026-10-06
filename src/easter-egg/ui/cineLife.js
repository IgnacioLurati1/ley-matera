import * as THREE from 'three';

// Los gauchos de las escenas, vivos (el usuario, 2026-10-03): respiran,
// parpadean, miran al que habla, mueven la boca con su murmullo y el poncho
// se les hamaca con lo que se mueven. Solo los muñecos de escena (net/Avatars
// que no son los compañeros) y solo mientras anda una escena (la entrada, una del
// easter egg o un final): jugando no hace nada.
// La pose la sigue poniendo la escena (las piezas); esto se le suma a los
// huesos del gaucho de verdad (net/gauchoSkin pose: liveBegin, liveBone,
// liveAfter).
// Quién habla: talkAs(a, 'fierro') en la escena; la boca sale de lo que
// murmura ese personaje (core/audio talkLevel).
// window.__mduNoLife = true: sin esto (para comparar).

// la respiración: ciclos por segundo y cuánto se mueve el pecho (rad)
const BREATH_HZ = 0.23;
const BREATH = 0.035;
// la mirada: lo más que gira la cabeza (rad), qué tan rápido llega y hasta qué distancia mira
const LOOK_MAX = 0.6;
const LOOK_RATE = 3;
const LOOK_FAR = 9;
// el parpadeo (s) y cada cuánto
const BLINK_DUR = 0.16;
const BLINK_MIN = 1.8;
const BLINK_MAX = 5.5;
// la mandíbula (rad abierta del todo) y el cabeceo al hablar
const JAW_MAX = 0.2;
const NOD = 0.05;
// el poncho: resorte (rigidez, freno) y lo más que se corre (m)
const SWAY_K = 55;
const SWAY_C = 7;
const SWAY_MAX = 0.14;

const live = new Set();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qI = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const mI = new THREE.Matrix4();

// Hay una escena andando (Game: la entrada o la escena del easter egg, una
// cinemática de final o el final ya ganado).
export const scenePlaying = (g) => !!g && (!!g.sceneOn || !!g.cine || g.state === 'won');

export function liveOn(G) {
  const a = G.a;
  return globalThis.__mduNoLife !== true && !!a.people && !a.people.team && scenePlaying(a.g);
}

// Quién habla por este muñeco (el nombre de core/audio: 'fierro', 'nicanor'...).
export function talkAs(a, speaker) {
  if (a) a.speaker = speaker;
}
// (los que la escena ya llama por su nombre)
const BY_NAME = { 'Martín Fierro': 'fierro', 'Antonio Gil': 'gil', Anacleto: 'anacleto', Cirilo: 'cirilo', Benito: 'benito', Nicanor: 'nicanor', Abuelo: 'abuelo' };
const speakerOf = (a) => a.speaker || BY_NAME[a.r?.name] || null;

// Antes de poner los huesos: el reloj, la respiración, la mirada y la boca.
// headW0: el giro de la cabeza que pide la escena (en el mundo).
export function liveBegin(G, headW0) {
  const now = performance.now() / 1000;
  const S = (G.life ||= {
    t0: Math.random() * 10,
    last: now,
    look: new THREE.Quaternion(),
    blinkAt: now + 0.5 + Math.random() * 2,
    blinkT: -1,
    jaw: 0,
    talk: 0,
    sway: new THREE.Vector3(),
    swayV: new THREE.Vector3(),
    pPrev: null,
    vPrev: new THREE.Vector3(),
  });
  live.add(G);
  const dt = Math.max(0, Math.min(0.1, now - S.last));
  S.last = now;
  S.dt = dt;
  S.breath = Math.sin((now + S.t0) * Math.PI * 2 * BREATH_HZ);
  // la boca: lo que murmura el personaje de este muñeco
  const who = speakerOf(G.a);
  const lvl = who ? G.a.g?.audio?.talkLevel?.(who) || 0 : 0;
  S.jaw += (lvl - S.jaw) * Math.min(1, dt * 22);
  // (hablando hace un rato: los demás lo miran)
  S.talk = Math.max(lvl > 0.05 ? 1 : 0, S.talk - dt * 0.8);
  // el parpadeo
  if (S.blinkT < 0 && now >= S.blinkAt) S.blinkT = 0;
  if (S.blinkT >= 0) {
    S.blinkT += dt;
    if (S.blinkT > BLINK_DUR) {
      S.blinkT = -1;
      // (a veces dos seguidos)
      S.blinkAt = now + (Math.random() < 0.15 ? 0.25 : BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN));
    }
  }
  S.lid = S.blinkT < 0 ? 0 : Math.sin((S.blinkT / BLINK_DUR) * Math.PI);
  // desmayado (la escena lo marca: a.faint, de 0 a 1): los ojos cerrados, sin
  // parpadear ni mirar al que habla (el usuario, 2026-10-05: "cuando están
  // desmayados parpadean"). globalThis.__mduNoMolOjos: como antes
  const shut = globalThis.__mduNoMolOjos === true ? 0 : Math.max(0, Math.min(1, G.a.faint || 0));
  if (shut > 0) S.lid = Math.max(S.lid * (1 - shut), shut);
  // la mirada: al que habla (el más cerca), si no lo que pide la escena
  const head = G.bones.Head.getWorldPosition(vA);
  let best = null;
  let bd = LOOK_FAR;
  for (const o of live) {
    if (o === G || !o.on || !o.life || o.life.talk <= 0 || !liveOn(o)) continue;
    const p = o.bones.Head.getWorldPosition(vB);
    const d = p.distanceTo(head);
    if (d < bd && d > 0.3) {
      bd = d;
      best = vC.copy(p);
    }
  }
  qB.identity();
  if (best) {
    const fwd = vB.copy(Z).applyQuaternion(headW0);
    const to = best.sub(head).normalize();
    qB.setFromUnitVectors(fwd, to);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(qB.w)));
    // (para atrás no se da vuelta)
    if (ang > 2.2) qB.identity();
    else if (ang > LOOK_MAX) qB.slerp(qI, 1 - LOOK_MAX / ang);
  }
  if (shut > 0) qB.slerp(qI, shut);
  S.look.slerp(qB, 1 - Math.exp(-dt * LOOK_RATE));
  return S;
}

// Cada hueso, con su giro en el mundo ya puesto (d.W): la respiración en el
// pecho y los hombros, la mirada y el cabeceo en el cuello y la cabeza.
export function liveBone(S, d) {
  switch (d.name) {
    case 'Spine':
      d.W.multiply(qA.setFromAxisAngle(X, -BREATH * S.breath));
      break;
    case 'Spine01':
      d.W.multiply(qA.setFromAxisAngle(X, -BREATH * 0.5 * S.breath));
      break;
    case 'LeftShoulder':
    case 'RightShoulder':
      d.W.multiply(qA.setFromAxisAngle(Z, (d.name[0] === 'L' ? -1 : 1) * BREATH * 0.6 * S.breath));
      break;
    case 'neck':
      d.W.premultiply(qA.copy(qI).slerp(S.look, 0.4));
      break;
    case 'Head':
      d.W.premultiply(S.look);
      if (S.jaw > 0.01) d.W.multiply(qA.setFromAxisAngle(X, -NOD * S.jaw));
      break;
    default:
  }
}

// Con los huesos ya puestos: la mandíbula, los párpados y el poncho.
export function liveAfter(G, S) {
  if (G.jawU) G.jawU.value = S.jaw * JAW_MAX;
  if (G.lidU) G.lidU.value = S.lid;
  // el poncho: un resorte contra lo que acelera el pecho (en el mundo), pasado
  // al espacio de la malla para el shader (net/gauchoSkin material uSway)
  const dt = S.dt;
  const p = G.bones.Spine.getWorldPosition(vA);
  if (!S.pPrev || dt <= 0) {
    S.pPrev = p.clone();
    S.vPrev.set(0, 0, 0);
  } else {
    const v = vB.subVectors(p, S.pPrev).divideScalar(Math.max(dt, 1e-3));
    // (un salto de la escena: se acomoda de una)
    if (v.length() > 12) {
      v.set(0, 0, 0);
      S.sway.set(0, 0, 0);
      S.swayV.set(0, 0, 0);
    }
    const acc = vC.subVectors(v, S.vPrev).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 30);
    S.vPrev.copy(v);
    S.pPrev.copy(p);
    acc.y *= 0.3;
    S.swayV.addScaledVector(acc, -dt).addScaledVector(S.sway, -SWAY_K * dt).multiplyScalar(Math.max(0, 1 - SWAY_C * dt));
    S.sway.addScaledVector(S.swayV, dt).clampLength(0, SWAY_MAX);
  }
  if (G.swayU) {
    const len = S.sway.length();
    // (transformDirection deja el largo en 1: el largo va en unidades de la malla)
    if (len < 1e-5) G.swayU.value.set(0, 0, 0);
    else G.swayU.value.copy(S.sway).transformDirection(mI.copy(G.mesh.matrixWorld).invert()).multiplyScalar(len / G.meshScale);
  }
}

// Sin escena: todo quieto (la boca cerrada, los ojos abiertos, el poncho derecho).
export function liveRest(G) {
  if (G.jawU) G.jawU.value = 0;
  if (G.lidU) G.lidU.value = 0;
  if (G.swayU) G.swayU.value.set(0, 0, 0);
  live.delete(G);
}
