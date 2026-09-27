// La música de las rondas de los esteros ("Mate no Numa"): un chamamé de noche.
// Lo toca core/audio.js (roundStart/roundEnd) con sus instrumentos: guitarra
// criolla, acordeón y bombo. Sin archivos.
//  · al empezar la ronda: dos compases de rasguido chamamecero en la menor, el
//    acordeón en terceras que sube y cae hasta el mi (sin resolver) y, lejos,
//    un canto que baja como el del urutaú;
//  · al terminar: el acordeón solo, lento, que baja nota por nota como el
//    urutaú y se queda en la menor, con la guitarra punteando.

const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);

// El chasquido: la mano que apaga las cuerdas en el tiempo débil del chamamé.
function chas(A, o, t, k = 1) {
  A.noise(o, { t, dur: 0.05, type: 'bandpass', freq: 1800, q: 1.4, gain: 0.3 * k });
  A.noise(o, { t, dur: 0.07, type: 'lowpass', freq: 400, gain: 0.25 * k, brown: true });
}

// El canto que baja (como el urutaú), lejos y con mucho eco.
function lament(A, o, t, notes, dur, gain) {
  let tt = t;
  for (const n of notes) {
    const f = freq(n);
    const tone = A.tone(o, { t: tt, dur, freq: f, freqEnd: f * 0.95, gain, attack: 0.1, release: dur * 0.95 });
    const lfo = A.ctx.createOscillator();
    const lg = A.ctx.createGain();
    lfo.frequency.value = 5.2;
    lg.gain.value = f * 0.012;
    lfo.connect(lg).connect(tone.o.frequency);
    lfo.start(tt);
    lfo.stop(tt + dur + 0.05);
    tt += dur + 0.1;
  }
  return tt;
}

export function esterosStart(A, t) {
  const o = A.out({ gain: 0.85, reverb: 0.9, bus: A.music });
  const gtr = A.guitarBus(o);
  const Am = [45, 52, 57, 60, 64];
  const E7 = [40, 47, 50, 56, 59, 64];
  const e = 0.21; // corchea del 6/8
  // tres compases de rasguido: fuerte, arriba, fuerte, chasquido
  [Am, Am, E7].forEach((ch, bar) => {
    const b = t + bar * 6 * e;
    A.pluck(gtr, b, ch[0] - 12 + (bar === 2 ? 12 : 0), 0.34);
    A.strum(gtr, b, ch, { gain: 0.28 });
    A.strum(gtr, b + 2 * e, ch.slice(2), { gain: 0.18, up: true });
    A.strum(gtr, b + 3 * e, ch, { gain: 0.24 });
    chas(A, o, b + 5 * e, 0.8);
  });
  A.bombo(o, t, false, 0.6);
  A.bombo(o, t + 12 * e, false, 0.7);
  // el acordeón, en terceras
  const acc = A.accordionBus(o, t + 2 * e, t + 22 * e);
  let tt = t + 3 * e;
  const up = [[69, 1], [72, 1], [76, 2], [74, 1], [72, 1], [71, 3], [69, 2], [68, 5]];
  const low = [65, 69, 72, 71, 69, 68, 64, 64];
  up.forEach(([n, d], i) => {
    A.accordion(acc, tt, n, d * e * 0.94, 0.08);
    A.accordion(acc, tt, low[i], d * e * 0.94, 0.05);
    tt += d * e;
  });
  // y lejos, el canto que baja
  const far = A.out({ gain: 0.35, reverb: 1.6, bus: A.music });
  lament(A, far, tt - 2 * e, [81, 78, 76, 73], 0.5, 0.12);
}

export function esterosEnd(A, t) {
  const o = A.out({ gain: 0.6, reverb: 1, bus: A.music });
  const gtr = A.guitarBus(o);
  const e = 0.32;
  const acc = A.accordionBus(o, t, t + 6);
  // re menor, la menor, mi, la menor: los acordes largos de abajo
  [[0, 3, [50, 53, 57]], [3, 2, [45, 52, 57]], [5, 2, [40, 47, 56]], [7, 5, [45, 52, 57, 60]]].forEach(([at, d, ch]) => {
    for (const n of ch) A.accordion(acc, t + at * e, n, d * e, 0.04);
    A.pluck(gtr, t + at * e, ch[0] - 12, 0.26, 2.2);
  });
  // la melodía baja nota por nota, como el urutaú
  let tt = t;
  for (const [n, d] of [[77, 1.5], [76, 1], [74, 1.5], [72, 1], [71, 2], [69, 5]]) {
    A.accordion(acc, tt, n, d * e * 0.95, 0.075);
    tt += d * e;
  }
  A.pluck(gtr, t + 7 * e + 0.2, 64, 0.16, 2.4);
  A.pluck(gtr, t + 7 * e + 0.4, 69, 0.12, 2.4);
}
