import { assetUrl } from '../../lib/assets';

// Las poses de los zombies de piezas hechas a mano en Blender (scratchpad
// blender-zombies: zclips.py arma cada clip con IK de piernas y brazos sobre el
// mismo esqueleto de entities/skeleton.js, y anim_qa los revisa con su
// solvePose). public/assets/sotano/modelos/zombies/clips-blend.json: por cuadro
// (30 por segundo) los ángulos de z.P (int16 ×1000).
//
// Cada estilo de entities/zombieGaits.js tiene su clip (andar, rengo, corrida,
// esprint, quieto, golpe); los del otro lado (G.side < 0: el otro brazo, la
// otra pierna) van espejados. El andar va a tiempo con lo que avanza: el clip
// se hizo a v m/s con los pies apoyados quietos en el piso, y acá el ritmo es
// vel / (v · escala), así los pies no patinan a ninguna velocidad.
// APAGADO (2026-10-05, el usuario: pasar los zombies a Blender era para
// arreglar problemas, no para rehacerlos; volvieron las poses de antes, las
// fórmulas). globalThis.__mduZombieBlend = true: los clips de Blender.

const URL = '/assets/sotano/modelos/zombies/clips-blend.json';
const FADE = 0.25;
let C = null;
let asked = false;
let KI = null;
// las claves que escribe cada clip (sin la raíz: rootY/rootPitch/rootRoll/rootFwd
// los siguen poniendo el agua, trepar, salir de la tierra)
let BODY = null;

function decode(J) {
  const K = J.keys;
  KI = Object.fromEntries(K.map((k, i) => [k, i]));
  BODY = K.map((k, i) => i).filter((i) => !/^root/.test(K[i]));
  const out = { fps: J.fps, K, nk: K.length, clips: {} };
  for (const [name, c] of Object.entries(J.clips)) {
    const bin = atob(c.d);
    const n16 = bin.length >> 1;
    const d = new Float32Array(n16);
    for (let i = 0; i < n16; i++) {
      let x = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (x > 32767) x -= 65536;
      d[i] = x / 1000;
    }
    out.clips[name] = { n: c.n, v: c.v || 0, loop: !!c.loop, dur: c.n / J.fps, d };
  }
  return out;
}

export function zombieBlendOn() {
  if (globalThis.__mduZombieBlend !== true) return false;
  if (!asked) {
    asked = true;
    fetch(assetUrl(URL))
      .then((r) => r.json())
      .then((J) => {
        C = decode(J);
      })
      .catch(() => {});
  }
  return !!C;
}

export function zclip(name) {
  return C?.clips[name] || null;
}

// los pares que se cambian al espejar (lado 0 <-> lado 1) y lo que cambia de signo
const SWAP = [
  ['shLp', 'shRp', 1],
  ['elL', 'elR', 1],
  ['hipLp', 'hipRp', 1],
  ['knL', 'knR', 1],
  ['shLr', 'shRr', -1],
  ['hipLr', 'hipRr', -1],
];
const NEG = ['torsoY', 'torsoR', 'headY', 'headR', 'yawOff'];

// Un cuadro del clip (t en s) en P; mir: espejado.
export function sampleClip(c, t, P, mir, all = false) {
  const nk = C.nk;
  const f = Math.max(0, t) * C.fps;
  let f0 = Math.floor(f);
  let f1 = f0 + 1;
  const al = f - f0;
  if (c.loop) {
    f0 %= c.n;
    f1 %= c.n;
  } else {
    f0 = Math.min(c.n - 1, f0);
    f1 = Math.min(c.n - 1, f1);
  }
  const d = c.d;
  const a = f0 * nk;
  const b = f1 * nk;
  const K = C.K;
  const list = all ? null : BODY;
  const m = all ? nk : list.length;
  for (let j = 0; j < m; j++) {
    const i = all ? j : list[j];
    P[K[i]] = d[a + i] + (d[b + i] - d[a + i]) * al;
  }
  if (mir) {
    for (const [l, r, s] of SWAP) {
      const x = P[l];
      P[l] = P[r] * s;
      P[r] = x * s;
    }
    for (const k of NEG) P[k] = -P[k];
  }
  return P;
}

// Pasa al clip nuevo mezclando desde la pose que se veía (sin saltos).
// (la raíz solo con all: la ponen el agua, trepar y salir de la tierra)
function mixIn(z, P, dt, all = false) {
  const zb = z.zb;
  if (zb.w >= 1) return;
  zb.w = Math.min(1, zb.w + dt / FADE);
  const e = zb.w * zb.w * (3 - 2 * zb.w);
  const F = zb.from;
  for (const k in F) if (P[k] !== undefined && (all || k.charCodeAt(0) !== 114 || k.charCodeAt(1) !== 111)) P[k] = F[k] + (P[k] - F[k]) * e;
}

function use(z, P, key, t) {
  let zb = z.zb;
  if (!zb) zb = z.zb = { key: null, t: 0, w: 1, from: {} };
  if (zb.key !== key) {
    if (zb.key) {
      // la pose de recién (lo que se dibujó) es de donde arranca la mezcla
      for (const k of C.K) if (P[k] !== undefined) zb.from[k] = P[k];
      zb.w = 0;
    }
    zb.key = key;
  }
  return zb;
}

// Las perillas de cada uno (inclinación, brazos, cabeza, bamboleo) sobre el clip.
function knobs(z, P, G, arms) {
  P.torsoP += G.lean * 0.7;
  P.headP += G.head * 0.5;
  P.torsoR *= 0.6 + G.sway * 0.4;
  P.headR += (z.headTilt || 0) * 0.5;
  if (arms) {
    P.shLp += G.arm * 0.5 + (z.armOff || 0) * 0.5;
    P.shRp += G.arm * 0.5 - (z.armOff || 0) * 0.5;
  }
}

const ARMS_UP = new Set(['shamble', 'onearm', 'lope', 'crab', 'stagger']);

// Andar / correr / esprintar. Devuelve false si no hay clip (sigue la fórmula).
export function blendGait(z, dt, speed, t, st, kind) {
  const G = z.style;
  const sc = z.scale || 1;
  const key = kind === 'walk' ? 'w_' + st + (z.limp > 0 ? '_r' : '') : (kind === 'run' ? 'r_' : 's_') + st;
  const c = C.clips[key];
  if (!c) return false;
  const P = z.P;
  const zb = use(z, P, key, t);
  // de un clip al otro con la misma fase (el pie izquierdo apoya en el 0 de todos)
  if (zb.w === 0 && zb.prevDur) zb.t = (zb.t / zb.prevDur) * c.dur;
  // lo que avanza de verdad (suavizado): choques, empujones entre ellos y, en el
  // invitado, la posición que llega por la red (allá speed es la nominal)
  let vm = speed;
  if (globalThis.__mduZbNominal !== true) {
    const jump = zb.px === undefined ? 99 : Math.hypot(z.pos.x - zb.px, z.pos.z - zb.pz);
    if (jump > 1 || !(dt > 0)) zb.v = speed;
    else zb.v += (Math.min(12, jump / dt) - zb.v) * Math.min(1, dt * 8);
    zb.px = z.pos.x;
    zb.pz = z.pos.z;
    // (trabado contra algo: arrastra los pies despacio, no queda congelado)
    vm = Math.max(zb.v, speed * 0.35);
  }
  const rate = Math.max(0, vm) / Math.max(0.2, c.v * sc);
  const du = dt * Math.min(2.2, rate);
  zb.t = (zb.t + du) % c.dur;
  zb.prevDur = c.dur;
  // (la fase de siempre, para el agua y los pasos: 2π por zancada)
  z.phase = (z.phase || 0) + (du / c.dur) * Math.PI * 2;
  sampleClip(c, zb.t, P, G.side < 0);
  knobs(z, P, G, ARMS_UP.has(st));
  mixIn(z, P, dt);
  return true;
}

export function blendIdle(z, t) {
  const G = z.style;
  const c = C.clips['i_' + G.walk];
  if (!c) return false;
  const P = z.P;
  const zb = use(z, P, 'i_' + G.walk, t);
  sampleClip(c, (t + (z.slot || 0) * 0.37) % c.dur, P, G.side < 0);
  knobs(z, P, G, G.walk === 'shamble' || G.walk === 'onearm');
  mixIn(z, P, 1 / 60);
  return true;
}

export function blendAttack(z, t) {
  const G = z.style;
  const c = C.clips['a_' + G.hit];
  if (!c) return false;
  const P = z.P;
  use(z, P, 'a_' + G.hit, t);
  // (z.attackT: 0 a 0.95, el daño a los 0.42; el clip pega en el mismo instante)
  sampleClip(c, Math.min(c.dur - 1e-3, z.attackT || 0), P, G.side < 0);
  P.torsoP += G.lean * 0.5;
  P.headR += (z.headTilt || 0) * 0.5;
  z.zb.w = 1;
  return true;
}

// ---- la ventana, salir de la tierra y las muertes (Zombies.js poseTear,
// poseClimb, poseRise, poseDeath llaman acá primero; false: la pose de antes)
const own = (z) => z.style && !z.boss && !z.dog && zombieBlendOn();

// romper las tablas: un tirón por tabla (los que caminan tardan 1.25 s, los demás 0.85)
export function blendTear(z, t) {
  if (!own(z)) return false;
  const c = C.clips.t_tear;
  if (!c) return false;
  const P = z.P;
  use(z, P, 't_tear', t);
  const per = z.speedType === 'walk' ? 1.25 : 0.85;
  sampleClip(c, ((t + (z.slot || 0) * 0.29) * (c.dur / per)) % c.dur, P, z.style.side < 0);
  P.headR += (z.headTilt || 0) * 0.5;
  mixIn(z, P, 1 / 60);
  return true;
}

// trepar (k de 0 a 1; la altura y el avance los pone el juego)
export function blendClimb(z, k) {
  if (!own(z)) return false;
  const c = C.clips.t_climb;
  if (!c) return false;
  const P = z.P;
  use(z, P, 't_climb', 0);
  sampleClip(c, Math.max(0, Math.min(1, k)) * (c.dur - 1e-3), P, z.style.side < 0);
  z.zb.w = 1;
  return true;
}

// saliendo de la tierra (z.stateT de 0 a 1.7; la altura la pone el juego)
export function blendRise(z) {
  if (!own(z)) return false;
  const c = C.clips.t_rise;
  if (!c) return false;
  const P = z.P;
  use(z, P, 't_rise', 0);
  sampleClip(c, Math.min(c.dur - 1e-3, (z.stateT || 0) * (c.dur / 1.7)), P, z.style.side < 0);
  z.zb.w = 1;
  return true;
}

// la muerte: de espaldas (le pegaron de frente) o de cara; arranca desde la
// pose que tenía (z.deathFrom) y termina tirado en el piso, apoyado
export function blendDeath(z) {
  if (!own(z) || z.crawler) return false;
  // (el que voló por una explosión ya cayó de espaldas: Zombies flung)
  const key = z.deathBack || (z.deathFrom?.rootPitch ?? 0) < -1 ? 'd_back' : 'd_front';
  const c = C.clips[key];
  if (!c) return false;
  const P = z.P;
  if (!z.deathFrom) z.deathFrom = { ...P };
  const T = z.stateT || 0;
  sampleClip(c, Math.min(c.dur - 1e-3, T), P, z.style.side < 0, true);
  const F = z.deathFrom;
  const e = Math.min(1, T / 0.15);
  if (e < 1) {
    const s = e * e * (3 - 2 * e);
    for (const k of C.K) if (F[k] !== undefined) P[k] = F[k] + (P[k] - F[k]) * s;
  }
  // (lo que queda tirado: a esta altura se hunde después, Zombies corpseT > 9)
  z.lieY = c.d[(c.n - 1) * C.nk + KI.rootY];
  z.zb && (z.zb.key = key);
  if (T >= c.dur && (z.corpseT || 0) < 9) z.solvedOnce = true;
  return true;
}

// sin piernas, arrastrándose con los brazos (la mano que tira queda clavada en el
// piso; v del clip 0.75 m/s = la del juego; pegando, casi quieto)
export function blendCrawl(z, dt) {
  if (!own(z)) return false;
  const c = C.clips.c_crawl;
  if (!c) return false;
  const P = z.P;
  const zb = use(z, P, 'c_crawl', 0);
  const rate = z.state === 'attack' ? 0.3 : 1;
  zb.t = (zb.t + dt * rate) % c.dur;
  z.phase = (z.phase || 0) + dt * rate * ((Math.PI * 2) / c.dur);
  sampleClip(c, zb.t, P, z.style.side < 0, true);
  P.yawOff = 0;
  P.rootFwd = 0;
  mixIn(z, P, dt, true);
  return true;
}
