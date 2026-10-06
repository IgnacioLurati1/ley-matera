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
// (globalThis.__mduNoEclipseBake: siempre en vivo)

const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
// lo que dura cada una (para hornear) y el volumen y el eco con que suenan
const START = { dur: 7.2, gain: 0.66, reverb: 0.9 };
const END = { dur: 6.6, gain: 0.72, reverb: 1.1 };

// Un número al azar que se repite (los vidrios suenan igual cada vez).
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

// Los vidrios: pings agudos que caen y se apagan.
function shards(A, o, t, n, spread, gain, seed, low = 2200) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const at = t + r() ** 1.8 * spread;
    const f = low + r() * 5200;
    const d = 0.06 + r() * 0.34;
    A.tone(o, { t: at, dur: d, type: r() < 0.7 ? 'sine' : 'triangle', freq: f, freqEnd: f * (0.97 + r() * 0.02), gain: gain * (0.5 + r() * 0.6), attack: 0.002 });
  }
}

// Un toque de bronce corto (el clarín del Monumento, el erke del castillo).
function brass(A, o, t, f, dur, gain, mul = [[1, 'sawtooth', 0.4], [1, 'triangle', 1]]) {
  for (const [m, type, k] of mul) {
    const h = A.hold(o, { t, dur, type, freq: f * m * 0.97, gain: gain * k, attack: 0.03, release: 0.12 });
    h.o.frequency.linearRampToValueAtTime(f * m, t + 0.06);
  }
}

// La ronda empieza: los pedazos de cada mapa y el vidrio que se rompe.
export function eclipseStartBody(A, o, t) {
  const c = A.ctx;
  // los pedazos van por una "radio rota" que se cierra y se corta al rajarse
  const crack = t + 2.85;
  const frag = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(1400, crack);
  frag.gain.setValueAtTime(1, t);
  frag.gain.setValueAtTime(1, crack - 0.02);
  frag.gain.linearRampToValueAtTime(0, crack + 0.05);
  frag.connect(lp).connect(o);
  // cada pedazo, un poco más desafinado que el anterior (en semitonos)
  const flat = [0, 0.12, 0.25, 0.4, 0.55, 0.75, 0.95];
  // el molino: bombo y tres notas de acordeón
  A.bombo(frag, t, false, 0.75);
  const acc = A.accordionBus(frag, t, t + 1.2);
  [[76, 1], [77, 1], [76, 2]].reduce((at, [n, d]) => (A.accordion(acc, at, n - flat[0], d * 0.13 * 0.94, 0.07), at + d * 0.13), t + 0.05);
  // La Tapera: el silbido del tropero
  A.whistle(frag, t + 0.42, [[88 - flat[1], 1], [91 - flat[1], 2.5, 0.05]], 0.16, 0.055);
  // el penal: la armónica que entra doblada
  A.harmonica(frag, t + 0.85, [[74 - flat[2], 3, 2]], 0.17, 0.1, { attack: 0.05, vibrato: 30 });
  // el estero: un rasguido en la menor
  A.strum(A.guitarBus(frag), t + 1.25, [45, 52, 57, 60, 64].map((n) => n - flat[3]), { gain: 0.2, dur: 1.1 });
  // la torre: la campana
  A.bell(frag, t + 1.6, 57 - flat[4], { gain: 0.14, dur: 2.2 });
  // el castillo: el erke
  brass(A, frag, t + 1.95, 73.4 * Math.pow(2, -flat[5] / 12), 0.42, 0.09, [[1, 'sawtooth', 1], [2, 'square', 0.3], [3, 'sawtooth', 0.18]]);
  // el Monumento: el clarín (sol, do)
  brass(A, frag, t + 2.3, freq(79 - flat[6]), 0.16, 0.1);
  brass(A, frag, t + 2.48, freq(84 - flat[6]), 0.3, 0.1);
  // lo que sube por abajo mientras se apilan
  A.noise(o, { t: t + 0.3, dur: 2.6, type: 'bandpass', freq: 300, freqEnd: 3200, q: 1, gain: 0.16, attack: 2.4 });
  A.tone(o, { t: t + 0.2, dur: 2.7, freq: 41, freqEnd: 58, gain: 0.35, attack: 2.2 });
  // el vidrio que se raja: el chasquido, el golpe grave y los pedazos
  A.noise(o, { t: crack, dur: 0.4, type: 'highpass', freq: 3600, gain: 0.34 });
  A.noise(o, { t: crack, dur: 0.14, type: 'bandpass', freq: 1700, q: 0.8, gain: 0.28 });
  A.tone(o, { t: crack, dur: 1.8, freq: 64, freqEnd: 27, gain: 0.55 });
  shards(A, o, crack, 26, 0.9, 0.05, 11);
  // y caen: el coro grave (re, la bemol, re, fa), el pedal del órgano y vidrios sueltos
  A.choir(o, crack + 0.12, [38, 44, 50, 53], { dur: 2.3, gain: 0.05, attack: 0.3, release: 1.3 });
  A.organ(o, crack + 0.1, 26, 2.6, 0.1);
  shards(A, o, crack + 0.7, 7, 1.6, 0.035, 23, 1500);
}

// La ronda termina: la campana sola, la grieta que se cierra y el coro en re.
export function eclipseEndBody(A, o, t) {
  A.bell(o, t, 50, { gain: 0.2, dur: 5 });
  // los vidrios que se juntan: cuatro agudos que bajan a la misma nota y se apagan
  const r = seeded(31);
  const to = freq(86);
  for (let i = 0; i < 4; i++) {
    const f = to * (1.6 + r() * 1.6);
    const h = A.hold(o, { t: t + 0.6 + i * 0.12, dur: 1.5, type: 'sine', freq: f, gain: 0.028, attack: 0.5, release: 0.9 });
    h.o.frequency.exponentialRampToValueAtTime(to, t + 2.1);
  }
  A.tone(o, { t: t + 2.1, dur: 2.2, type: 'sine', freq: to, gain: 0.05, attack: 0.01 });
  // el coro: re menor que se queda en re (sin la tercera: ni triste ni contento)
  A.choir(o, t + 0.3, [38, 45, 50, 53], { dur: 1.6, gain: 0.04, attack: 0.5, release: 0.6 });
  A.choir(o, t + 2.0, [38, 45, 50, 57], { dur: 1.6, gain: 0.04, attack: 0.4, release: 1.6 });
  // un soplo que se va
  A.noise(o, { t, dur: 3.8, type: 'bandpass', freq: 1500, freqEnd: 260, q: 1, gain: 0.18, attack: 0.3 });
}

// Hornea las dos (una sola vez por página).
export function eclipseBake(A) {
  if (A.eclipseBaking || globalThis.__mduNoEclipseBake === true || !A.bakeSound) return;
  A.eclipseBaking = true;
  A.bakeSound('eclipseStart', START.dur, function (o, t) {
    eclipseStartBody(this, o, t);
  });
  A.bakeSound('eclipseEnd', END.dur, function (o, t) {
    eclipseEndBody(this, o, t);
  });
}

function play(A, t, key, S, body) {
  eclipseBake(A);
  const buf = globalThis.__mduNoEclipseBake === true ? null : A.bakedBuf(key);
  if (buf) return A.playBuffer(buf, { gain: S.gain, reverb: S.reverb, bus: A.music, when: t });
  body(A, A.out({ gain: S.gain, reverb: S.reverb, bus: A.music }), t);
  return null;
}

export const eclipseStart = (A, t) => play(A, t, 'eclipseStart', START, eclipseStartBody);
export const eclipseEnd = (A, t) => play(A, t, 'eclipseEnd', END, eclipseEndBody);
