// guadana5 (iteración 4): los sonidos nuevos del agujero negro y del rayo de la
// Furia (horneados en la carga con los demás: desgarradorFx.bake los llama).
//
// "El sonido del agujero negro brilla por su ausencia": el de la v4 sonaba (el
// nodo arrancaba, medido en guadana5/t_snd.mjs) pero casi todo iba abajo de
// 80 Hz (en parlantes comunes no se oye), entraba de a poco y caía junto con
// el tajo, el corte y el tragado: se tapaba. Este tiene cuerpo audible desde
// el primer instante:
//  · se abre: un desgarro seco (lo que lo ata a la imagen);
//  · la gravedad: tres sierras que se desafinan y se hunden de 196 a 49 Hz con
//    un temblor que se acelera (el "vuuuum" propio, armónicos que se oyen en
//    cualquier parlante);
//  · la succión: aire que crece y baja de agudo a grave, con un silbido;
//  · la implosión a los 0,9 s (cuando se cierra la imagen): el golpe de
//    verdad, con medio y grave, y se corta todo de golpe;
//  · el retumbo que queda (ruido marrón grave que tiembla).
// El rayo nuevo: el encendido (un "VUUM" que baja, el grave que pega y las
// chispas) y el rugido que se repite (sierras graves con el filtro que late,
// el grave abajo y el chisporroteo arriba).

const lin = (p, v, t) => p.linearRampToValueAtTime(v, t);
const set = (p, v, t) => p.setValueAtTime(v, t);

// ruido en loop con filtro y una envolvente a mano: [[t, gain], ...]
function noiseEnv(self, o, { type = 'bandpass', f0, f1, q = 1, env, brown = false, t1 }) {
  const c = self.ctx;
  const src = c.createBufferSource();
  src.buffer = brown ? self.brownBuf : self.noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  set(f.frequency, f0, env[0][0]);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t1 ?? env[env.length - 1][0]);
  const g = c.createGain();
  set(g.gain, 0, 0);
  for (const [t, v] of env) lin(g.gain, v, t);
  src.connect(f).connect(g).connect(o);
  src.start(env[0][0], Math.random() * 1.5);
  src.stop(env[env.length - 1][0] + 0.05);
}

export function bakeV5(B, H) {
  // ---------------- el agujero negro ----------------
  B('desg-agujero5', 2.4, function (o0, t) {
    const c = this.ctx;
    const o = H.hall(this, o0, 2.0, 0.22);
    const k = 0.95 + Math.random() * 0.1;
    const T = 0.9;
    // se abre: el desgarro seco
    this.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 1400 * k, freqEnd: 260, q: 1.6, gain: 0.55, attack: 0.004 });
    this.tone(o, { t, dur: 0.3, type: 'sine', freq: 160 * k, freqEnd: 60, gain: 0.45, attack: 0.004 });
    // la gravedad: tres sierras que se hunden, con el temblor que se acelera
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    set(lp.frequency, 1700, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + T);
    const vg = c.createGain();
    set(vg.gain, 0, t);
    lin(vg.gain, 0.16, t + 0.08);
    lin(vg.gain, 0.42, t + T - 0.03);
    lin(vg.gain, 0, t + T);
    const trem = c.createGain();
    trem.gain.value = 0.55;
    const lfo = c.createOscillator();
    set(lfo.frequency, 6, t);
    lfo.frequency.exponentialRampToValueAtTime(28, t + T);
    const lg = c.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + T + 0.05);
    for (const [f, d, gn] of [[196, 0, 0.5], [197.8, 9, 0.4], [98, -7, 0.55]]) {
      const os = c.createOscillator();
      os.type = 'sawtooth';
      os.detune.value = d;
      set(os.frequency, f * k, t);
      os.frequency.exponentialRampToValueAtTime((f * k) / 4, t + T);
      const og = c.createGain();
      og.gain.value = gn;
      os.connect(og).connect(lp);
      os.start(t);
      os.stop(t + T + 0.05);
    }
    lp.connect(trem).connect(vg).connect(o);
    // la succión: el aire que crece y baja, y se corta cuando se cierra
    noiseEnv(this, o, { type: 'bandpass', f0: 3200 * k, f1: 340, q: 1.2, env: [[t + 0.02, 0.03], [t + 0.5, 0.22], [t + T - 0.02, 0.85], [t + T, 0]] });
    noiseEnv(this, o, { type: 'highpass', f0: 5200, f1: 1600, q: 0.7, env: [[t + 0.05, 0.0], [t + T - 0.05, 0.16], [t + T, 0]] });
    // el silbido que cae
    const wh = c.createOscillator();
    wh.type = 'sine';
    set(wh.frequency, 2300 * k, t);
    wh.frequency.exponentialRampToValueAtTime(420, t + T);
    const wg = c.createGain();
    set(wg.gain, 0, t);
    lin(wg.gain, 0.045, t + T - 0.05);
    lin(wg.gain, 0, t + T);
    wh.connect(wg).connect(o);
    wh.start(t);
    wh.stop(t + T + 0.05);
    // la implosión: el golpe con medio y grave
    this.noise(o, { t: t + T, dur: 0.32, type: 'lowpass', freq: 4200, freqEnd: 90, gain: 0.7, attack: 0.002 });
    this.tone(o, { t: t + T, dur: 0.75, type: 'sine', freq: 140, freqEnd: 28, gain: 0.55, attack: 0.003 });
    this.tone(o, { t: t + T, dur: 0.22, type: 'square', freq: 72, freqEnd: 34, gain: 0.2, attack: 0.003 });
    this.tone(o, { t: t + T, dur: 0.12, type: 'triangle', freq: 420, freqEnd: 110, gain: 0.3, attack: 0.002 });
    // el retumbo que queda
    noiseEnv(this, o, { type: 'lowpass', f0: 240, q: 0.9, brown: true, env: [[t + T, 0], [t + T + 0.06, 0.55], [t + T + 0.6, 0.3], [t + 2.35, 0]] });
    this.tone(o, { t: t + T + 0.02, dur: 1.4, type: 'sine', freq: 46, freqEnd: 31, gain: 0.3, attack: 0.03 });
    // el cristal que se cierra, apenas
    H.crystalL(this, o, t + T + 0.06, [2637 * k, 3520 * k], { gain: 0.018, dur: 0.7, spread: 0.02 });
  }, 3);

  // ---------------- el rayo de la Furia ----------------
  // el encendido: un VUUM que baja, el grave que pega y chispas
  B('desg-rayo5', 1.3, function (o0, t) {
    const o = H.hall(this, o0, 1.6, 0.2);
    this.tone(o, { t, dur: 0.75, type: 'sawtooth', freq: 900, freqEnd: 70, gain: 0.32, attack: 0.01 });
    this.tone(o, { t, dur: 0.75, type: 'sawtooth', freq: 906, freqEnd: 71, gain: 0.26, attack: 0.01, detune: 12 });
    this.tone(o, { t, dur: 0.9, type: 'sine', freq: 110, freqEnd: 34, gain: 0.5, attack: 0.004 });
    this.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 5000, freqEnd: 600, q: 0.9, gain: 0.55, attack: 0.004 });
    this.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 3000, freqEnd: 120, gain: 0.55, attack: 0.002 });
    for (let i = 0; i < 9; i++) {
      const tt = t + 0.04 + Math.random() * 0.8;
      this.noise(o, { t: tt, dur: 0.03 + Math.random() * 0.04, type: 'highpass', freq: 2500 + Math.random() * 3500, gain: 0.25 + Math.random() * 0.2, attack: 0.001 });
    }
  });
  // el rugido que se repite: horneado 3 s, se repite de 0,5 a 2,5 s (todo lo
  // periódico entra justo en 2 s: sierras de 55/55,5/110 Hz, el temblor de 6 Hz)
  B('desg-rayo5-loop', 3.0, function (o) {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.value = 900;
    const flfo = c.createOscillator();
    flfo.frequency.value = 6;
    const flg = c.createGain();
    flg.gain.value = 420;
    flfo.connect(flg).connect(f.frequency);
    flfo.start(0);
    const g = c.createGain();
    g.gain.value = 0.26;
    for (const [fr, type, gn] of [[55, 'sawtooth', 0.6], [55.5, 'sawtooth', 0.55], [110, 'sawtooth', 0.35], [165, 'square', 0.12], [27.5, 'sine', 0.6]]) {
      const os = c.createOscillator();
      os.type = type;
      os.frequency.value = fr;
      const og = c.createGain();
      og.gain.value = gn;
      os.connect(og).connect(f);
      os.start(0);
    }
    f.connect(g).connect(o);
    // el chisporroteo de arriba (ráfagas cortas, ninguna cruza el corte del loop)
    for (let i = 0; i < 46; i++) {
      const tt = 0.52 + Math.random() * 1.9;
      this.noise(o, { t: tt, dur: 0.02 + Math.random() * 0.05, type: 'highpass', freq: 2200 + Math.random() * 4000, gain: 0.08 + Math.random() * 0.12, attack: 0.001 });
    }
    // el aire del rayo: un siseo parejo (constante en todo el tramo)
    noiseEnv(this, o, { type: 'bandpass', f0: 2600, q: 0.6, env: [[0, 0.1], [3.0, 0.1]] });
  });
}
