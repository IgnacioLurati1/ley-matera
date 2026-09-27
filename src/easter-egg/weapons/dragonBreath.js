import * as THREE from 'three';

// Aliento Dragónico (el perk del castillo, la yerba Baldragón): si te pegan
// dos golpes seguidos, largás una llamarada alrededor que prende fuego y mata
// a todos los muertos cerca (a los jefes apenas los chamusca). Después se
// enfría DRAGON_CD segundos.
// La llamarada la ven todos (Session, evento 'drag'); el daño lo pone el que
// la largó: de invitado, Zombies.damage le pasa cada golpe al anfitrión.

export const DRAGON_CD = 10;
export const DRAGON_R = 6.5;
// dos golpes con menos de esto entre uno y otro cuentan como seguidos
export const DRAGON_GAP = 2.5;
// a los jefes, apenas una chamuscada (tienen 4000 de vida como mínimo)
const BOSS_DMG = 200;
// lo que frena el fuego (los muebles, el yunque, los altares no: pasa por arriba)
const BLOCK = new Set(['wall', 'door', 'window', 'slab', 'ground', 'floor', 'ceiling', 'coloso']);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const hitT = {};

// ¿Llega el fuego de a hasta b? Solo lo cortan paredes, puertas y pisos.
function reaches(w, a, b) {
  const o = tmpO.copy(a);
  for (let k = 0; k < 6; k++) {
    const d = tmpD.subVectors(b, o);
    const len = d.length();
    if (len < 0.06) return true;
    d.divideScalar(len);
    const t = w.raycast(o, d, len - 0.05, hitT);
    if (t === Infinity) return true;
    const kind = typeof hitT.box === 'string' ? hitT.box : hitT.box?.kind;
    if (BLOCK.has(kind)) return false;
    o.addScaledVector(d, t + 0.05);
  }
  return true;
}

// La llamarada en `at` (los pies de quien la larga). mine: la largó el
// jugador de esta compu (pone el daño).
export function dragonBreath(g, at, mine) {
  const fx = g.fx;
  const x = at.x;
  const y = at.y;
  const z = at.z;
  // el anillo de fuego que se abre al ras del piso (dos alturas; arranca a un
  // metro: con el fuego encima de la cámara el que la larga veía todo blanco)
  for (let i = 0; i < 130; i++) {
    const a = (i / 130) * Math.PI * 2 + Math.random() * 0.04;
    const v = 8 + Math.random() * 5;
    const h = i % 2 ? 0.25 : 0.85;
    fx.add.spawn(x + Math.cos(a) * 1.1, y + h, z + Math.sin(a) * 1.1, Math.cos(a) * v, 0.5 + Math.random() * 1.2, Math.sin(a) * v, {
      color: [1, 0.3 + Math.random() * 0.3, 0.04],
      size: 0.75 + Math.random() * 0.45,
      size1: 0.25,
      life: 0.55 + Math.random() * 0.35,
      drag: 2.1,
    });
  }
  // la pared de fuego que sube alrededor, en remolino
  for (let i = 0; i < 48; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 0.7;
    fx.add.spawn(x + Math.cos(a) * r, y + Math.random() * 0.5, z + Math.sin(a) * r, -Math.sin(a) * 2.6 + Math.cos(a) * 0.8, 4.5 + Math.random() * 5, Math.cos(a) * 2.6 + Math.sin(a) * 0.8, {
      color: [1, 0.42 + Math.random() * 0.3, 0.08],
      size: 0.7,
      size1: 0.1,
      life: 0.6 + Math.random() * 0.45,
      drag: 1.2,
    });
  }
  // las brasas que saltan
  for (let i = 0; i < 44; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * 6;
    fx.add.spawn(x, y + 0.8, z, Math.cos(a) * v, 4 + Math.random() * 6, Math.sin(a) * v, { color: [1, 0.72, 0.25], size: 0.07, life: 1 + Math.random() * 0.8, gravity: 7 });
  }
  // el humo que queda donde pasó el fuego
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = DRAGON_R * (0.35 + Math.random() * 0.6);
    fx.alpha.spawn(x + Math.cos(a) * r, y + 0.4, z + Math.sin(a) * r, Math.cos(a) * 0.6, 0.8 + Math.random() * 0.6, Math.sin(a) * 0.6, { color: [0.1, 0.08, 0.07], size: 0.9, size1: 3.2, life: 1.8 + Math.random(), alpha: 0.45, drag: 1, gravity: -0.4 });
  }
  fx.flash(tmpV.set(x, y + 1.2, z), 0xff5a10, 45, 0.7, DRAGON_R * 2.4);
  const fy = g.world?.levels ? g.world.floorAt(x, z, y) : 0;
  fx.decal(2, { x, y: fy + 0.02, z }, { x: 0, y: 1, z: 0 }, DRAGON_R * 0.8);
  const near = mine ? 1 : Math.max(0, 1 - g.camera.position.distanceTo(tmpV.set(x, y, z)) / 22);
  if (near > 0) fx.addShake(0.6 * near);
  roar(g, tmpV.set(x, y + 1.2, z));
  if (!mine) return;
  // el daño: todo lo que está cerca y a la vista (no atraviesa paredes)
  const from = tmpW.set(x, y + 1, z);
  for (const { z: zb } of g.zombies.inRadius(from, DRAGON_R, [])) {
    const to = new THREE.Vector3(zb.pos.x, zb.pos.y + 1, zb.pos.z);
    if (!reaches(g.world, from, to)) continue;
    const dir = new THREE.Vector3(zb.pos.x - x, 0.3, zb.pos.z - z).normalize();
    g.zombies.damage(zb, zb.boss ? BOSS_DMG : 1e7, { type: 'burn', dir, point: to });
  }
}

// El rugido: un grave que baja, el fuego que sopla y el chisporroteo.
function roar(g, p) {
  const a = g.audio;
  if (!a?.ctx) return;
  const o = a.out({ pos: p.clone(), gain: 1.1, reverb: 0.4, ref: 8 });
  const t = a.now;
  a.tone(o, { t, dur: 1.1, type: 'sawtooth', freq: 112, freqEnd: 40, gain: 0.2, attack: 0.03 });
  a.tone(o, { t: t + 0.03, dur: 0.9, type: 'square', freq: 74, freqEnd: 34, gain: 0.07, attack: 0.05 });
  a.noise(o, { t, dur: 1.25, type: 'lowpass', freq: 450, freqEnd: 2600, q: 0.8, gain: 0.9, brown: true, attack: 0.02 });
  a.noise(o, { t: t + 0.12, dur: 0.95, type: 'bandpass', freq: 1900, freqEnd: 550, q: 1, gain: 0.32, attack: 0.05 });
  for (let i = 0; i < 18; i++) a.noise(o, { t: t + 0.1 + Math.random() * 1.1, dur: 0.02, type: 'bandpass', freq: 2500 + Math.random() * 3000, q: 1.5, gain: 0.12 });
}
