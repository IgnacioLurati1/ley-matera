// La música de las rondas del Monumento al Mate: la banda de los
// Granaderos. Lo toca core/audio.js (roundStart/roundEnd) con sus
// instrumentos sintetizados (sin archivos):
//  · al empezar la ronda: un redoble de tambor que crece y dos clarines que
//    tocan un toque de carga (solo las notas que da el clarín: sol, do, mi,
//    sol, do), con el bombo en cada golpe; queda colgado en el sol (sin
//    resolver: la carga sigue);
//  · al terminar: el toque de silencio, lento y con eco, un clarín solo
//    lejos y el bombo apagado como un corazón.

const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
// las notas del clarín (la serie de armónicos de do)
const G4 = 67;
const C5 = 72;
const E5 = 76;
const G5 = 79;
const C6 = 84;

// Una nota de clarín: el ataque que sube desde abajo, el cuerpo de bronce
// (diente de sierra con un triángulo encima) y el vibrato al final de las largas.
function clarin(A, o, t, n, dur, gain = 1) {
  const f = freq(n);
  const scoop = f * 0.965;
  const long = dur > 0.35;
  const a = A.tone(o, { t, dur, type: 'sawtooth', freq: scoop, freqEnd: f, gain: 0.05 * gain, attack: 0.025, release: Math.min(0.12, dur * 0.4) });
  A.tone(o, { t, dur, type: 'triangle', freq: scoop, freqEnd: f, gain: 0.13 * gain, attack: 0.02, release: Math.min(0.12, dur * 0.4) });
  // el resoplido del soplido
  A.noise(o, { t, dur: 0.05, type: 'bandpass', freq: 1800, q: 2, gain: 0.05 * gain });
  if (long && a?.o) {
    const lfo = A.ctx.createOscillator();
    const lg = A.ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.008, t + dur);
    lfo.connect(lg).connect(a.o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
}

// El redoblante: golpes cortos de ruido con la caja (y el bordón).
function caja(A, o, t, k = 1) {
  A.noise(o, { t, dur: 0.07, type: 'bandpass', freq: 2600, q: 0.9, gain: 0.32 * k });
  A.noise(o, { t, dur: 0.05, type: 'lowpass', freq: 600, gain: 0.18 * k });
  A.tone(o, { t, dur: 0.06, type: 'triangle', freq: 210, freqEnd: 160, gain: 0.12 * k });
}

// El bombo: un golpe grave que se apaga.
function bombo(A, o, t, k = 1) {
  A.tone(o, { t, dur: 0.45, type: 'sine', freq: 72, freqEnd: 44, gain: 0.55 * k, attack: 0.004 });
  A.noise(o, { t, dur: 0.06, type: 'lowpass', freq: 300, gain: 0.25 * k, brown: true });
}

export function monumentoStart(A, t) {
  const o = A.out({ gain: 0.82, reverb: 0.75, bus: A.music });
  // el redoble: de piano a forte en un segundo
  const roll = 1.05;
  for (let x = 0; x < roll; x += 0.045) caja(A, o, t + x, 0.25 + (x / roll) * 0.75);
  bombo(A, o, t + roll, 1.1);
  // el toque de carga (corcheas a 126): dos clarines, el segundo una tercera abajo
  const e = 0.238;
  const start = t + roll + 0.02;
  const line = [
    [G4, 1], [C5, 1], [E5, 1], [G5, 2], [E5, 1], [G5, 1], [C6, 3],
    [G5, 1], [E5, 1], [C5, 1], [E5, 1], [G5, 2], [G5, 1], [G5, 4],
  ];
  const low = { [G4]: G4, [C5]: G4, [E5]: C5, [G5]: E5, [C6]: G5 };
  let at = start;
  line.forEach(([n, len], i) => {
    const d = len * e * 0.92;
    clarin(A, o, at, n, d, 1);
    clarin(A, o, at + 0.006, low[n], d, 0.55);
    if (i % 2 === 0) caja(A, o, at, 0.55);
    if (len >= 2) bombo(A, o, at, 0.8);
    at += len * e;
  });
}

export function monumentoEnd(A, t) {
  const o = A.out({ gain: 0.7, reverb: 1, bus: A.music });
  // el silencio: lento, lejos, con eco
  const q = 0.55;
  const line = [[G4, 0.75], [G4, 0.25], [C5, 2], [G4, 0.75], [C5, 0.25], [E5, 2], [C5, 0.75], [E5, 0.25], [G5, 1.5], [E5, 0.5], [C5, 2.5]];
  let at = t + 0.1;
  for (const [n, len] of line) {
    clarin(A, o, at, n, len * q * 0.95, 0.7);
    at += len * q;
  }
  // el bombo apagado, como un corazón
  for (let k = 0; k < 4; k++) {
    bombo(A, o, t + 0.1 + k * 1.6, 0.45);
    bombo(A, o, t + 0.38 + k * 1.6, 0.3);
  }
}
