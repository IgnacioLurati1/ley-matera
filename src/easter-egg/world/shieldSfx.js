// Los ruidos del escudo en la mano y de su mejora (world/ShieldUpgrade,
// weapons/shieldHand): sintetizados con lo de core/audio (out, tone, noise).
// pos: dónde suena (null: en la cabeza del que juega).

const ok = (a) => a?.ctx && a.out;

// levantar o bajar el escudo: el cuero de las correas y un golpecito de la tabla
export function sfxRaise(a, up = true) {
  if (!ok(a)) return;
  const o = a.out({ gain: 0.45, reverb: 0.05 });
  a.noise(o, { dur: 0.16, type: 'bandpass', freq: up ? 900 : 700, q: 1.4, gain: 0.5, attack: 0.02 });
  a.tone(o, { t: a.now + 0.1, dur: 0.12, freq: up ? 150 : 120, freqEnd: 80, gain: 0.25 });
}

// el escudazo: el golpe sordo (más fuerte si pegó en algo)
export function sfxBash(a, hit, pos = null) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: hit ? 0.8 : 0.4, reverb: 0.08 });
  a.noise(o, { dur: 0.1, type: 'bandpass', freq: hit ? 520 : 1200, q: 1, gain: 0.7 });
  if (hit) {
    a.tone(o, { dur: 0.22, freq: 120, freqEnd: 55, gain: 0.7 });
    a.tone(o, { dur: 0.3, type: 'triangle', freq: 330, freqEnd: 300, gain: 0.12 });
  }
}

// hierro contra hierro (la prensa, el yunque): parciales que no son armónicos
export function sfxClang(a, pos, k = 1) {
  if (!ok(a)) return;
  const t = a.now;
  const o = a.out({ pos, gain: 0.75 * k, reverb: 0.35, ref: 4 });
  a.noise(o, { t, dur: 0.05, type: 'highpass', freq: 2500, gain: 0.8 });
  for (const [f, d, gn] of [[587, 1.1, 0.3], [1321, 0.8, 0.18], [2263, 0.5, 0.12], [3470, 0.3, 0.06]]) a.tone(o, { t, dur: d * (0.7 + k * 0.3), type: 'triangle', freq: f, freqEnd: f * 0.995, gain: gn });
  a.tone(o, { t, dur: 0.14, freq: 150, freqEnd: 60, gain: 0.5 });
}

// engranajes trabados
export function sfxGrind(a, pos) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: 0.5, reverb: 0.2 });
  a.noise(o, { dur: 0.45, type: 'bandpass', freq: 380, freqEnd: 900, q: 3, gain: 0.8, attack: 0.03 });
  a.tone(o, { dur: 0.4, type: 'sawtooth', freq: 55, freqEnd: 48, gain: 0.12 });
}

// chirrido del hierro caliente
export function sfxSizzle(a, pos, dur = 0.8, k = 1) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: 0.35 * k, reverb: 0.1 });
  a.noise(o, { dur, type: 'highpass', freq: 3200, gain: 0.6, attack: 0.05 });
}

// el hierro al rojo que entra al agua: el siseo largo y el burbujeo
export function sfxQuench(a, pos) {
  if (!ok(a)) return;
  const t = a.now;
  const o = a.out({ pos, gain: 0.9, reverb: 0.3, ref: 4 });
  a.noise(o, { t, dur: 0.25, type: 'lowpass', freq: 700, gain: 0.9 });
  a.noise(o, { t: t + 0.05, dur: 2.2, type: 'highpass', freq: 2600, freqEnd: 900, gain: 0.75, attack: 0.04 });
  for (let i = 0; i < 12; i++) a.tone(o, { t: t + 0.2 + i * 0.14 + Math.random() * 0.1, dur: 0.06, freq: 500 + Math.random() * 700, freqEnd: 1400, gain: 0.08 });
}

// la mandíbula del cráneo que se cierra
export function sfxClack(a, pos) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: 0.7, reverb: 0.25, ref: 3 });
  a.noise(o, { dur: 0.05, type: 'bandpass', freq: 1500, q: 2, gain: 0.9 });
  a.tone(o, { dur: 0.1, freq: 210, freqEnd: 120, gain: 0.4 });
}

// un chorro de vapor
export function sfxSteam(a, pos, k = 1) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: 0.6 * k, reverb: 0.15 });
  a.noise(o, { dur: 0.7 * k, type: 'highpass', freq: 1800, freqEnd: 1100, gain: 0.7, attack: 0.02 });
}

// una llamarada
export function sfxFlame(a, pos) {
  if (!ok(a)) return;
  const o = a.out({ pos, gain: 0.8, reverb: 0.2 });
  a.noise(o, { dur: 0.8, type: 'lowpass', freq: 900, freqEnd: 250, gain: 0.9, attack: 0.03, brown: true });
  a.noise(o, { dur: 0.35, type: 'bandpass', freq: 2200, q: 0.8, gain: 0.3 });
}

// se terminó la mejora: un acorde que sube
export function sfxUpgrade(a, pos = null) {
  if (!ok(a)) return;
  const t = a.now;
  const o = a.out({ pos, gain: 0.55, reverb: 0.45, ref: 6 });
  [392, 494, 587, 784].forEach((f, i) => {
    a.tone(o, { t: t + i * 0.09, dur: 1.6 - i * 0.2, type: 'triangle', freq: f, gain: 0.16 });
    a.tone(o, { t: t + i * 0.09, dur: 1.2, type: 'sine', freq: f * 2, gain: 0.05 });
  });
  a.noise(o, { t, dur: 0.9, type: 'highpass', freq: 5000, gain: 0.12, attack: 0.3 });
}
