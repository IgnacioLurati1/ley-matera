import * as THREE from 'three';
import { zombieHealth } from '../config/rules';
import { cherryFx } from '../fx/cherryFx';

// Electric Cherry (el perk del penal, la yerba Chisporé): al empezar a
// recargar, una descarga alrededor electrocuta a los muertos cerca. Cuanto
// más vacío el cargador, más lejos llega y más fuerte pega (con el cargador
// vacío mata a cualquiera, salvo a los jefes, que apenas los sacude).
// Recargar seguido no sirve: la descarga necesita CHERRY_CD para cargarse.
// La descarga la ven todos (Session, evento 'cherry'); el daño lo pone el que
// recarga: de invitado, Zombies.damage le pasa cada golpe al anfitrión.

export const CHERRY_CD = 1.6;
// radio con el cargador casi lleno y vacío
const R0 = 2.4;
const R1 = 6.5;
// menos de esto vacío no descarga (media bala de un cargador de 20)
const K_MIN = 0.05;
const BOSS_DMG = 300;
const BLOCK = new Set(['wall', 'door', 'window', 'slab', 'ground', 'floor', 'ceiling', 'coloso']);
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const hitT = {};

export const cherryRadius = (k) => R0 + (R1 - R0) * k;

// ¿Llega la descarga de a hasta b? La cortan paredes, puertas y pisos.
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

// ¿Descarga esta recarga? k: cuánto del cargador está vacío (0 a 1). Deja
// anotada la hora (para el enfriamiento) y devuelve si sale.
export function cherryReady(p, k, t) {
  if (!p.perks?.has('cherry') || k < K_MIN || t < (p.cherryReady ?? 0)) return false;
  p.cherryReady = t + CHERRY_CD;
  return true;
}

// La descarga en `at` (los pies de quien recarga), con fuerza k. mine: la
// largó el jugador de esta compu (pone el daño y ve el destello en la pantalla).
// Los rayos salen de la cintura (del pecho, pegados a la cámara del que
// recarga, le tapaban todo); los dibuja fx/cherryFx.js.
export function cherryShock(g, at, k, mine) {
  const fx = g.fx;
  const C = cherryFx(g);
  const R = cherryRadius(k);
  const x = at.x;
  const y = at.y;
  const z = at.z;
  const chest = new THREE.Vector3(x, y + 1.1, z);
  const waist = new THREE.Vector3(x, y + 0.8, z);
  const feet = new THREE.Vector3(x, y + 0.05, z);
  // la onda eléctrica del piso
  C?.ring(feet, R, k);
  // los rayos que corren a ras del piso desde los pies
  const tendrils = 5 + Math.round(5 * k);
  for (let i = 0; i < tendrils; i++) {
    const a = (i / tendrils) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const r = R * (0.55 + Math.random() * 0.45);
    const end = new THREE.Vector3(x + Math.cos(a) * r, y + 0.05, z + Math.sin(a) * r);
    C?.bolt(feet, end, 0.3 + Math.random() * 0.18, { depth: 5, spread: 0.2, branch: 0.5, width: 0.1, bright: 0.9, flat: true }, 0.05);
  }
  // las chispas del cuerpo y algunas rojas (la cereza), lejos de la cámara
  fx.electric(waist, Math.round(14 + 16 * k));
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.add.spawn(x + Math.cos(a) * 0.6, y + 0.5, z + Math.sin(a) * 0.6, Math.cos(a) * 3, 2 + Math.random() * 3, Math.sin(a) * 3, { color: [1, 0.25, 0.35], size: 0.05, size1: 0.01, life: 0.4 + Math.random() * 0.3, gravity: 6 });
  }
  // un rayo a cada muerto que alcanza (lo sigue si se mueve) y el
  // chisporroteo que le queda encima
  const hit = [];
  for (const { z: zb } of g.zombies.inRadius(chest, R, [])) {
    const s = zb.scale || 1;
    const by = zb.baseY ?? zb.pos.y;
    const to = new THREE.Vector3(zb.pos.x, by + 1.2 * s, zb.pos.z);
    if (!reaches(g.world, chest, to)) continue;
    hit.push({ zb, to });
    const P = to.clone();
    C?.bolt(waist, () => (zb.active ? P.set(zb.pos.x, (zb.baseY ?? zb.pos.y) + 1.2 * s, zb.pos.z) : P), 0.4 + Math.random() * 0.12, { depth: 5, spread: 0.22, branch: 0.4, width: 0.17, bright: 1.25 });
    for (let j = 0; j < 3; j++) {
      const h0 = by + (0.5 + Math.random() * 1.1) * s;
      const a0 = Math.random() * Math.PI * 2;
      const from = new THREE.Vector3(zb.pos.x + Math.cos(a0) * 0.3 * s, h0, zb.pos.z + Math.sin(a0) * 0.3 * s);
      const a1 = a0 + 1.5 + Math.random() * 2;
      const toC = new THREE.Vector3(zb.pos.x + Math.cos(a1) * 0.3 * s, h0 + (Math.random() - 0.5) * 0.7 * s, zb.pos.z + Math.sin(a1) * 0.3 * s);
      C?.bolt(from, toC, 0.5 + Math.random() * 0.45, { depth: 3, spread: 0.35, branch: 0, width: 0.06, bright: 0.8 }, 0.06);
    }
    fx.electric(to, 8);
  }
  // si no alcanzó a nadie, igual salen unos rayos cortos al aire
  if (!hit.length) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      C?.bolt(waist, new THREE.Vector3(x + Math.cos(a) * R * 0.5, y + 0.3 + Math.random() * 1.2, z + Math.sin(a) * R * 0.5), 0.2, { depth: 4, spread: 0.25, branch: 0.3, width: 0.12, bright: 1 });
    }
  }
  fx.flash(chest, 0x5aa8ff, 30 + 30 * k, 0.35, R * 2.2);
  fx.flash(tmpV.set(x, y + 0.3, z), 0xff3a5a, 8, 0.2, 5);
  const near = mine ? 1 : Math.max(0, 1 - g.camera.position.distanceTo(chest) / 20);
  if (near > 0) fx.addShake((0.2 + 0.35 * k) * near);
  if (mine) C?.screenFlash(k);
  crackle(g, chest, k);
  if (!mine) return;
  // el daño: con el cargador vacío mata a cualquiera de la ronda (menos a los jefes)
  const round = g.rounds?.round || 1;
  const dmg = 150 + k * Math.max(1500, zombieHealth(round) * 1.15);
  for (const { zb, to } of hit) {
    const dir = new THREE.Vector3(zb.pos.x - x, 0.2, zb.pos.z - z).normalize();
    g.zombies.damage(zb, zb.boss ? BOSS_DMG * k : dmg, { type: 'bullet', zone: 'torso', zap: true, dir, point: to });
  }
}

// El ruido: el zumbido que se descarga, los chasquidos y un trueno lejano.
function crackle(g, p, k) {
  const a = g.audio;
  if (!a?.ctx) return;
  const o = a.out({ pos: p.clone(), gain: 0.9 + 0.4 * k, reverb: 0.35, ref: 6 });
  const t = a.now;
  a.tone(o, { t, dur: 0.35, type: 'sawtooth', freq: 120, freqEnd: 900, gain: 0.12, attack: 0.01 });
  a.tone(o, { t: t + 0.02, dur: 0.3, type: 'square', freq: 60, freqEnd: 40, gain: 0.1 });
  a.noise(o, { t, dur: 0.4, type: 'highpass', freq: 2500, freqEnd: 6000, gain: 0.45, attack: 0.005 });
  for (let i = 0; i < 10 + 10 * k; i++) a.noise(o, { t: t + Math.random() * 0.45, dur: 0.018, type: 'bandpass', freq: 2500 + Math.random() * 4500, q: 2, gain: 0.35 });
  // y un trueno medio (el grabado, entero con su retumbe) bien bajito
  a.playThunder?.(Math.random() < 0.5 ? 'trueno-medio-1' : 'trueno-medio-2', { pos: p.clone(), gain: 0.14 + 0.08 * k });
}
