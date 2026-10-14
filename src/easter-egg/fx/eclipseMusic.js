// La música de las rondas de Eclipse Matero: el mundo roto. Lo toca
// core/audio.js (roundStart/roundEnd) con sus instrumentos sintetizados (sin
// archivos), como los demás mapas:
//  · al empezar la ronda: entra un pedacito del cambio de ronda de cada mapa
//    (el bombo y el acordeón del molino, el silbido de La Tapera, la armónica
//    del penal, el rasguido del estero, la campana de la torre, el erke del
//    castillo y el clarín del Monumento), cada uno más desafinado, apilándose
//    hasta que todo se raja como un vidrio y cae en un coro grave que no
//    resuelve (re, la bemol, re, fa);
//  · al terminar: el espejo calmo: una campana sola, los vidrios que se juntan
//    en una nota (la grieta que se cierra) y el coro que se queda en re.
// Son muchos nodos (coro, vidrios): se hornean en buffers al armar el mapa
// (Game.buildScene → eclipseBake: audio.bakeSound) y la ronda toca el buffer;
// si todavía no terminó de hornearse, suena en vivo, igual.
// Nivel: medido con un render offline (scratchpad eclipse/kit/t_music.mjs),
// en el rango de los otros mapas.

const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
// lo que dura cada una (para hornear) y el volumen y el eco con que suenan
const START = { dur: 7.2, gain: 0.66, reverb: 0.9 };
const END = { dur: 6.6, gain: 0.72, reverb: 1.1 };

// Un número al azar que se repite (los vidrios suenan igual cada vez).
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

// (2026-10-08, el usuario: "mejorar el sonido de arranque de ronda y fin de
// ronda a algo más cósmico".)
// La versión cósmica: el espacio alrededor del sol tapado.
//  · al empezar: el viento del vacío que sube, estrellas que titilan con eco,
//    un colchón de sinusoides desafinadas que se abre y, cuando la luna tapa
//    el sol, el golpe grave, una campana de metal raro (parciales que no son
//    armónicos) y un coro alto y quieto en re (re, la, mi, fa: sin resolver);
//  · al terminar: el espejo: la campana rara sola, el colchón que baja y se
//    abre a re mayor, las estrellas que se alejan y un glissando que sube.

// Eco con realimentación (las estrellas y la campana rebotan en el vacío).
function echo(A, o, { time = 0.33, fb = 0.5, lp = 3200, wet = 0.6 } = {}) {
  const c = A.ctx;
  const inp = c.createGain();
  const d = c.createDelay(2);
  d.delayTime.value = time;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = c.createGain();
  g.gain.value = fb;
  const w = c.createGain();
  w.gain.value = wet;
  inp.connect(o);
  inp.connect(d);
  d.connect(f).connect(g).connect(d);
  f.connect(w).connect(o);
  return inp;
}

// Colchón: cada nota, tres sinusoides apenas desafinadas (el batido lento).
function pad(A, o, t, notes, { dur, gain, attack = 1, release = 1.5, type = 'sine' }) {
  for (const n of notes) {
    for (const det of [-7, 0, 6]) A.hold(o, { t, dur, type, freq: freq(n), gain, attack, release, detune: det });
  }
}

// Campana de metal raro: FM con razón no entera, se apaga larga.
function starBell(A, o, t, f, { gain = 0.1, dur = 4, ratio = 2.76, index = 3 } = {}) {
  const c = A.ctx;
  const car = c.createOscillator();
  car.frequency.value = f;
  const mod = c.createOscillator();
  mod.frequency.value = f * ratio;
  const mg = c.createGain();
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.7);
  mod.connect(mg).connect(car.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g).connect(o);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

// Estrellas: pings agudos cortos, de a uno, por el eco.
function stars(A, o, t, n, spread, gain, seed, lo = 1800, hi = 5200) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const at = t + r() * spread;
    const f = lo + r() * (hi - lo);
    A.tone(o, { t: at, dur: 0.25 + r() * 0.4, freq: f, gain: gain * (0.5 + r() * 0.6), attack: 0.003 });
  }
}

function cosmicStartBody(A, o, t) {
  const hit = t + 2.7;
  const sky = echo(A, o, { time: 0.37, fb: 0.55, lp: 4200, wet: 0.7 });
  // el viento del vacío: ruido por un filtro angosto que sube (y otro que baja)
  A.noise(o, { t, dur: 2.9, type: 'bandpass', freq: 180, freqEnd: 3800, q: 6, gain: 0.22, attack: 2.4 });
  A.noise(o, { t: t + 0.4, dur: 2.5, type: 'bandpass', freq: 5200, freqEnd: 700, q: 9, gain: 0.12, attack: 2 });
  // el grave que sube hasta el golpe
  A.tone(o, { t, dur: 2.75, freq: 30, freqEnd: 55, gain: 0.4, attack: 2.4 });
  // el colchón que se abre (re, la, mi) y las estrellas
  pad(A, o, t + 0.1, [62, 69, 76], { dur: 2.2, gain: 0.022, attack: 2.2, release: 0.5 });
  stars(A, sky, t + 0.2, 9, 2.3, 0.045, 7);
  // un glissando que sube como un theremin hasta el golpe
  A.hold(sky, { t: t + 0.6, dur: 2, type: 'sine', freq: freq(74), gain: 0.03, attack: 1.4, release: 0.15 }).o.frequency.exponentialRampToValueAtTime(freq(86), hit);
  // la luna tapa el sol: el golpe, el soplo y la campana rara
  A.tone(o, { t: hit, dur: 2.6, freq: 72, freqEnd: 24, gain: 0.6 });
  A.noise(o, { t: hit, dur: 1.8, type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.3 });
  A.noise(o, { t: hit, dur: 0.25, type: 'highpass', freq: 5000, gain: 0.12 });
  starBell(A, sky, hit, freq(50), { gain: 0.16, dur: 3.4, ratio: 2.76, index: 4 });
  starBell(A, sky, hit + 0.01, freq(74), { gain: 0.06, dur: 2.6, ratio: 3.53, index: 2 });
  // el coro alto y quieto (re, la, mi, fa) y el pedal grave
  A.choir(o, hit + 0.1, [62, 69, 76, 77], { dur: 2.1, gain: 0.03, attack: 0.6, release: 1.3 });
  pad(A, o, hit, [38, 45], { dur: 2.2, gain: 0.05, attack: 0.15, release: 1.3, type: 'triangle' });
  stars(A, sky, hit + 0.3, 6, 2, 0.03, 13, 2600, 6400);
}

function cosmicEndBody(A, o, t) {
  const sky = echo(A, o, { time: 0.45, fb: 0.6, lp: 3000, wet: 0.75 });
  // la campana rara sola, más suave
  starBell(A, sky, t, freq(62), { gain: 0.12, dur: 4.5, ratio: 2.76, index: 2.5 });
  // el colchón: re menor que se abre a re mayor (fa a fa sostenido)
  pad(A, o, t + 0.2, [50, 57, 65], { dur: 1.7, gain: 0.03, attack: 0.8, release: 0.8 });
  pad(A, o, t + 2.1, [50, 57, 66, 69], { dur: 1.8, gain: 0.028, attack: 0.7, release: 2 });
  // las estrellas que se alejan (cada vez más graves y bajitas)
  stars(A, sky, t + 0.4, 8, 3, 0.035, 41, 2000, 4800);
  // el glissando que sube y se va
  A.hold(sky, { t: t + 1.6, dur: 1.8, type: 'sine', freq: freq(69), gain: 0.025, attack: 0.6, release: 1.2 }).o.frequency.exponentialRampToValueAtTime(freq(81), t + 4.4);
  // el viento que baja y el grave que se apaga
  A.noise(o, { t, dur: 4.5, type: 'bandpass', freq: 2600, freqEnd: 200, q: 5, gain: 0.16, attack: 0.6 });
  A.tone(o, { t, dur: 4, freq: 44, freqEnd: 30, gain: 0.25, attack: 0.8 });
}

// Hornea las dos (una sola vez por página).
export function eclipseBake(A) {
  if (A.eclipseBaking || !A.bakeSound) return;
  A.eclipseBaking = true;
  A.bakeSound('eclipseStart', START.dur, function (o, t) {
    cosmicStartBody.call(null, this, o, t);
  });
  A.bakeSound('eclipseEnd', END.dur, function (o, t) {
    cosmicEndBody.call(null, this, o, t);
  });
}

function play(A, t, key, S, body) {
  eclipseBake(A);
  const buf = A.bakedBuf(key);
  if (buf) return A.playBuffer(buf, { gain: S.gain, reverb: S.reverb, bus: A.music, when: t });
  body(A, A.out({ gain: S.gain, reverb: S.reverb, bus: A.music }), t);
  return null;
}

export const eclipseStart = (A, t) => play(A, t, 'eclipseStart', START, cosmicStartBody);
export const eclipseEnd = (A, t) => play(A, t, 'eclipseEnd', END, cosmicEndBody);
