import * as THREE from 'three';
import { TOWER, RISERS } from '../config/map';

// Lo que comparten las cosas del remolino en la torre (modo historia): las
// ráfagas (entities/towerWind.js), los postigos (world/towerShutters.js), la
// Noche del Remolino (entities/towerNoche.js), las campanas del easter egg
// (entities/towerBells.js) y el Mark III (entities/towerMk3Quest.js).
//  · La geometría de las arcadas: los cuatro lados, su cara de adentro y los
//    tres arcos de cada lado.
//  · TowerFlyers: los muertos que el remolino trae volando (entran por un arco
//    y caen al piso) y los que se chupa (salen por un arco dando vueltas y se
//    pierden en el viento). El anfitrión los mueve; los invitados los ven por
//    el estado ('fall' entrando, 'flung' saliendo) y ponen la estela.
//  · Unos sonidos de viento, golpes y campanas.

// el remolino gira hacia donde crece el ángulo (x, z) alrededor del centro
// (como las chapas y la yerba que vuelan: world/towerDecor.js)
export const SPIN = 1;

// Lados: 0 norte, 1 este, 2 sur, 3 oeste. n: hacia adentro; face: la cara de
// adentro de la arcada (x o z); along: el eje a lo largo del lado. Y los arcos
// de cada lado (entre pilares), en metros a lo largo del lado. (Se arman
// cuando se los pide: al cargar el módulo todavía no hay mapa.)
let geoOf = null;
let SIDES_ = null;
let SPANS_ = null;
function geo() {
  if (geoOf === TOWER) return;
  geoOf = TOWER;
  SIDES_ = [
    { n: [0, 1], face: TOWER.z0, along: 'x' },
    { n: [-1, 0], face: TOWER.x1 + 1, along: 'z' },
    { n: [0, -1], face: TOWER.z1 + 1, along: 'x' },
    { n: [1, 0], face: TOWER.x0, along: 'z' },
  ];
  SPANS_ = [];
  let start = -1;
  for (let a = TOWER.x0; a <= TOWER.x1 + 1; a++) {
    const pier = a > TOWER.x1 || TOWER.piers.some(([p0, p1]) => a >= p0 && a <= p1);
    if (!pier && start < 0) start = a;
    if (pier && start >= 0) {
      SPANS_.push([start, a]);
      start = -1;
    }
  }
}
export function sides() {
  geo();
  return SIDES_;
}
export function archSpans() {
  geo();
  return SPANS_;
}

// ¿(x, z) está adentro de la torre? (Tower.inFoot es por celdas: con metros,
// el último metro de los lados sur y este le quedaba afuera.)
export function inTower(x, z) {
  return x >= TOWER.x0 && x < TOWER.x1 + 1 && z >= TOWER.z0 && z < TOWER.z1 + 1;
}

// Qué tan adentro está (x, z) desde la cara de la arcada del lado s.
export function depthIn(s, x, z) {
  return s === 0 ? z - TOWER.z0 : s === 1 ? TOWER.x1 + 1 - x : s === 2 ? TOWER.z1 + 1 - z : x - TOWER.x0;
}

// El lado de la arcada más cercano.
export function nearSide(x, z) {
  let best = 0;
  let bd = Infinity;
  for (let s = 0; s < 4; s++) {
    const d = depthIn(s, x, z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

// Un punto sobre el lado s: `a` a lo largo, `d` metros hacia adentro (negativo: afuera).
export function sidePoint(s, a, d, y, out = new THREE.Vector3()) {
  const S = sides()[s];
  const f = S.face + (S.n[0] + S.n[1]) * d;
  return S.along === 'x' ? out.set(a, y, f) : out.set(f, y, a);
}

// El arco del lado s más cercano a `a` (su centro a lo largo, y su ancho).
export function nearArch(s, a) {
  const SPANS = archSpans();
  let best = SPANS[0];
  for (const sp of SPANS) if (Math.abs((sp[0] + sp[1]) / 2 - a) < Math.abs((best[0] + best[1]) / 2 - a)) best = sp;
  return { a: (best[0] + best[1]) / 2, w: best[1] - best[0], span: best };
}

export function alongOf(s, x, z) {
  return sides()[s].along === 'x' ? x : z;
}

// La tangente del giro del remolino en (x, z).
export function swirl(x, z, out = new THREE.Vector3()) {
  const dx = x - TOWER.cx;
  const dz = z - TOWER.cz;
  const d = Math.hypot(dx, dz) || 1;
  return out.set((-dz / d) * SPIN, 0, (dx / d) * SPIN);
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const rnd = () => Math.random() - 0.5;
const ease = (k) => k * k * (3 - 2 * k);

// ---------------- los que vuelan ----------------
export class TowerFlyers {
  constructor(g) {
    this.g = g;
    this.T = g.world.tower;
    this.ins = [];
    this.outs = [];
  }

  // (anfitrión) Un muerto recién salido llega volando desde el remolino por
  // el arco más cercano y cae en `land` (en su piso). Se le puede tirar en el aire.
  flyIn(z, land, { dur = 2 + Math.random() * 0.6 } = {}) {
    if (!z?.active || z.dead || z.boss || z.dog) return false;
    const fy = land.y;
    const s = nearSide(land.x, land.z);
    const S = sides()[s];
    const A = nearArch(s, alongOf(s, land.x, land.z));
    const a = A.a + rnd() * (A.w - 1.4);
    const tan = swirl(sidePoint(s, a, 0, 0, tmpV).x, tmpV.z, tmpW).clone();
    const out = new THREE.Vector3(-S.n[0], 0, -S.n[1]);
    const inner = sidePoint(s, a, 0.9, fy + 1.55);
    const lip = sidePoint(s, a, -1.3, fy + 1.9);
    const mid = lip.clone().addScaledVector(out, 6).addScaledVector(tan, -5 * SPIN).setY(fy + 3 + Math.random() * 2);
    const far = lip.clone().addScaledVector(out, 15).addScaledVector(tan, -13 * SPIN).setY(fy + 2 + Math.random() * 6);
    const hop = inner.clone().lerp(land, 0.55).setY(Math.max(inner.y, land.y + 1.3));
    const curve = new THREE.CatmullRomCurve3([far, mid, lip, inner, hop, land.clone().setY(land.y + 0.35)], false, 'centripetal');
    z.state = 'fall';
    z.stateT = 0;
    z.baseY = fy;
    z.fellFrom = 0;
    z.vel.set(0, 0, 0);
    const p0 = curve.getPointAt(0);
    z.pos.copy(p0);
    this.ins.push({ z, id: z.id, curve, t: 0, dur, fy, spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4) });
    return true;
  }

  // (anfitrión) Se lo lleva el remolino: lo mata y lo tira para afuera por
  // el lado s, dando vueltas, hasta perderse en el viento.
  suckOut(z, s, { by = null, noPoints = false } = {}) {
    const g = this.g;
    if (!z?.active || z.dead || z.boss) return false;
    const S = sides()[s];
    const dir = new THREE.Vector3(-S.n[0], 0.5, -S.n[1]).normalize();
    const point = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.1, z.pos.z);
    const fy = z.baseY || 0;
    g.zombies.damage(z, 1e9, { type: 'blast', dir, point, by, noPoints });
    // (los bichos de cuatro patas se quedan donde caen)
    if (!z.dead || z.dog || z.state !== 'flung') return true;
    z.baseY = fy - 90;
    this.outs.push({ z, id: z.id, s, t: 0, fy });
    if (Math.random() < 0.6) g.audio.growl(point, 'scream');
    return true;
  }

  flying() {
    return this.ins.length;
  }

  // (anfitrión) Trae uno volando a un pozo del piso fy (lejos de `near`).
  bring(fy, near, round, health) {
    const g = this.g;
    const cands = RISERS.filter((r) => Math.abs((r.y ?? 0) - fy) < 0.5 && (!near || Math.hypot(r.pos[0] - near.x, r.pos[1] - near.z) > 4));
    if (!cands.length) return null;
    const r = cands[Math.floor(Math.random() * cands.length)];
    const at = new THREE.Vector3(r.pos[0], fy, r.pos[1]);
    if (!g.zombies.spawn(round, health, at)) return null;
    const z = g.zombies.pool.find((q) => q.active && q.id === g.zombies.idc);
    if (z) this.flyIn(z, at);
    return z;
  }

  update(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    if (host) {
      for (let i = this.ins.length - 1; i >= 0; i--) {
        const f = this.ins[i];
        const z = f.z;
        if (!z.active || z.id !== f.id || z.dead || z.state !== 'fall') {
          // lo bajaron en el aire: afuera de la torre se cae al remolino
          if (z.active && z.id === f.id && z.dead && !inTower(z.pos.x, z.pos.z)) z.baseY = f.fy - 90;
          this.ins.splice(i, 1);
          continue;
        }
        f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        const u = ease(k) * 0.35 + k * 0.65;
        f.curve.getPointAt(u, tmpV);
        const dx = tmpV.x - z.pos.x;
        const dz = tmpV.z - z.pos.z;
        z.pos.copy(tmpV);
        z.vel.set(0, 0, 0);
        if (dx * dx + dz * dz > 1e-6) z.yaw = Math.atan2(dx, dz) + Math.sin(f.t * f.spin) * 0.6;
        if (k >= 1) {
          // lo deja apenas arriba del piso: Zombies lo hace caer y seguir
          z.pos.y = f.fy + 0.05;
          z.vel.y = -3;
          g.fx.dust(new THREE.Vector3(z.pos.x, f.fy + 0.05, z.pos.z), { x: 0, y: 1, z: 0 }, [0.55, 0.55, 0.6], 8);
          this.ins.splice(i, 1);
        }
      }
      for (let i = this.outs.length - 1; i >= 0; i--) {
        const f = this.outs[i];
        const z = f.z;
        if (!z.active || z.id !== f.id) {
          this.outs.splice(i, 1);
          continue;
        }
        f.t += dt;
        const S = sides()[f.s];
        const inside = depthIn(f.s, z.pos.x, z.pos.z) > -0.8;
        swirl(z.pos.x, z.pos.z, tmpW);
        const out = 7 + f.t * 12;
        const tw = 3 + f.t * 11;
        z.vel.set(-S.n[0] * out + tmpW.x * tw, inside ? Math.max(4.5, z.vel.y) : 6.5 - f.t * 6, -S.n[1] * out + tmpW.z * tw);
        // (tiene que pasar por arriba de la baranda)
        if (inside && z.pos.y < f.fy + 1.2) z.pos.y = Math.min(f.fy + 1.2, z.pos.y + dt * 6);
        z.yaw += dt * 9;
        if (f.t > 2.8) {
          g.zombies.free(z);
          this.outs.splice(i, 1);
        }
      }
    }
    // la estela: los que entran (cayendo afuera o recién adentro) y los que salen
    if (!this.T) return;
    for (const z of g.zombies.pool) {
      if (!z.active) continue;
      const inn = z.state === 'fall' && (!inTower(z.pos.x, z.pos.z) || z.pos.y > (z.baseY || 0) + 0.9) && !this.T.inHole(z.pos.x, z.pos.z);
      const outg = z.state === 'flung' && !inTower(z.pos.x, z.pos.z);
      if (!inn && !outg) continue;
      const y = z.pos.y + 1;
      for (let k = 0; k < 2; k++) {
        g.fx.add.spawn(z.pos.x + rnd() * 0.6, y + rnd() * 1.2, z.pos.z + rnd() * 0.6, rnd() * 0.6, rnd() * 0.6, rnd() * 0.6, { color: inn ? [0.55, 0.7, 1] : [0.8, 0.85, 1], size: 0.16, size1: 0, life: 0.55, alpha: 0.5 });
      }
      if (Math.random() < 0.4) g.fx.alpha.spawn(z.pos.x + rnd(), y + rnd(), z.pos.z + rnd(), rnd() * 2, rnd() * 2, rnd() * 2, { color: [0.4, 0.46, 0.3], size: 0.05, size1: 0.1, life: 0.8, alpha: 0.5 });
    }
  }
}

// ---------------- sonidos ----------------
// El viento que entra: sube, sopla y se va (pos puede ser null: en la oreja).
export function sndGust(g, pos, { warn = 1.2, dur = 2.2, gain = 1 } = {}) {
  const A = g.audio;
  if (!A?.ctx) return;
  const o = A.out({ pos, gain, reverb: 0.35 });
  A.noise(o, { dur: warn + dur, type: 'bandpass', freq: 240, freqEnd: 1300, q: 0.9, gain: 0.55, attack: warn });
  A.noise(o, { t: A.now + warn, dur, freq: 1600, freqEnd: 320, gain: 0.5, brown: true, attack: 0.15 });
  A.noise(o, { t: A.now + warn * 0.5, dur: warn + dur * 0.7, type: 'bandpass', freq: 1900, freqEnd: 2600, q: 9, gain: 0.12, attack: warn * 0.6 });
}

// Un viento que sigue soplando hasta que se lo para (los postigos abiertos,
// la Noche del Remolino). Devuelve { stop(fade), set(gain) }.
export function sndWindLoop(g, pos, gain = 0.8, { whistle = 1800 } = {}) {
  const A = g.audio;
  const c = A?.ctx;
  if (!c) return { stop() {}, set() {} };
  const o = A.out({ pos, gain: 0.0001, reverb: 0.3, ref: pos ? 4 : 2.2 });
  const t = c.currentTime;
  o.gain.setValueAtTime(0.0001, t);
  o.gain.exponentialRampToValueAtTime(gain, t + 0.8);
  const nodes = [];
  const src = c.createBufferSource();
  src.buffer = A.brownBuf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  src.connect(lp).connect(o);
  src.start();
  nodes.push(src);
  const src2 = c.createBufferSource();
  src2.buffer = A.noiseBuf;
  src2.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = whistle;
  bp.Q.value = 7;
  const wg = c.createGain();
  wg.gain.value = 0.18;
  // el silbido sube y baja
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.35;
  const lg = c.createGain();
  lg.gain.value = whistle * 0.25;
  lfo.connect(lg).connect(bp.frequency);
  lfo.start();
  src2.connect(bp).connect(wg).connect(o);
  src2.start();
  nodes.push(src2, lfo);
  let dead = false;
  return {
    set(v) {
      if (!dead) o.gain.setTargetAtTime(Math.max(0.0001, v), c.currentTime, 0.3);
    },
    stop(fade = 1.2) {
      if (dead) return;
      dead = true;
      const now = c.currentTime;
      o.gain.cancelScheduledValues(now);
      o.gain.setValueAtTime(Math.max(0.0001, o.gain.value), now);
      o.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      for (const n of nodes) {
        try {
          n.stop(now + fade + 0.1);
        } catch {
          /* ya parado */
        }
      }
    },
  };
}

// Un golpe seco de madera (los postigos que se abren o se cierran).
export function sndSlam(g, pos, big = 1) {
  const A = g.audio;
  if (!A?.ctx) return;
  const o = A.out({ pos, gain: 0.9 * big, reverb: 0.45 });
  A.noise(o, { dur: 0.35, freq: 900, freqEnd: 120, gain: 0.9 });
  A.tone(o, { dur: 0.4, freq: 95, freqEnd: 40, gain: 0.7 });
  A.noise(o, { t: A.now + 0.02, dur: 0.12, type: 'bandpass', freq: 2400, q: 3, gain: 0.25 });
}

// Madera que cruje (bisagras, sogas tensas).
export function sndCreak(g, pos, dur = 1) {
  const A = g.audio;
  if (!A?.ctx) return;
  const o = A.out({ pos, gain: 0.5, reverb: 0.3 });
  for (let i = 0; i < 5; i++) A.noise(o, { t: A.now + (i / 5) * dur, dur: dur / 4, type: 'bandpass', freq: 500 + Math.random() * 400, freqEnd: 300 + Math.random() * 600, q: 12, gain: 0.35 });
  A.tone(o, { dur, type: 'sawtooth', freq: 70, freqEnd: 55, gain: 0.03 });
}

// Una campana de bronce (nota midi).
export function sndBell(g, pos, note = 43, gain = 0.5, dur = 6) {
  const A = g.audio;
  if (!A?.ctx || !A.bell) return;
  const o = A.out({ pos, gain: 1, reverb: 0.9, ref: 8 });
  A.bell(o, A.now + 0.01, note, { gain: gain * 0.35, dur });
}

// El chisporroteo de la electricidad.
export function sndArc(g, pos, gain = 0.5) {
  const A = g.audio;
  if (!A?.ctx) return;
  const o = A.out({ pos, gain, reverb: 0.2 });
  for (let i = 0; i < 6; i++) A.noise(o, { t: A.now + i * 0.035 + Math.random() * 0.02, dur: 0.05, type: 'highpass', freq: 2500 + Math.random() * 3000, gain: 0.5 });
  A.tone(o, { dur: 0.25, type: 'sawtooth', freq: 120, gain: 0.08 });
}
