// Los sonidos nuevos de la v4 del Desgarrador y del Cazador del Caos
// (horneados en la carga con los demás: desgarradorFx.bake los llama). H: las
// capas de desgarradorFx (hall, tearL, subL, crystalL, shatterL, bellL). Nada
// de esto suena fuera de Eclipse (la guadaña y el Cazador duermen ahí).
//
// El agujero negro (pedido del usuario: "añadiría un sonido de agujero negro
// al agujero negro que crea"): un zumbido grave que baja de tono, el aire que
// entra (succión), la implosión seca y el cristal que se cierra. El cuerpo va
// abajo de 80 Hz y el aire en ruido, el cristal arriba de 2 kHz: no se pisa con
// el coro de la Furia (sierras de 110 a 330 Hz y sus formantes).
export function bakeV4(B, H) {
  // el grande (los agujeros de los tajos de la del Eclipse, la ruptura, la
  // succión del Cazador): 2 s; la implosión cae a los 0,9 s, cuando se cierra
  B('desg-agujero', 2.0, function (o0, t) {
    const o = H.hall(this, o0, 2.4, 0.32);
    const k = 0.94 + Math.random() * 0.12;
    // el zumbido grave que baja
    this.tone(o, { t, dur: 1.05, type: 'sine', freq: 76 * k, freqEnd: 23, gain: 0.55, attack: 0.1 });
    // el aire que entra: de lo agudo a lo grave, creciendo (se queda arriba de
    // los 450 Hz: abajo está el coro de la Furia)
    this.noise(o, { t, dur: 0.92, type: 'bandpass', freq: 4400 * k, freqEnd: 480, q: 1.3, gain: 0.62, attack: 0.72 });
    this.noise(o, { t: t + 0.08, dur: 0.84, type: 'highpass', freq: 6500, freqEnd: 1400, gain: 0.16, attack: 0.6 });
    // el remolino: ráfagas que dan vueltas y se aceleran
    for (let i = 0; i < 7; i++) {
      const u = i / 7;
      const f = 700 + 1500 * (0.5 + 0.5 * Math.sin(i * 1.9));
      this.noise(o, { t: t + 0.85 * (1 - (1 - u) * (1 - u)), dur: 0.16, type: 'bandpass', freq: f, freqEnd: f * 0.55, q: 5, gain: 0.18 + u * 0.22, attack: 0.07 });
    }
    // la implosión seca: el golpe sordo, sin cola
    this.noise(o, { t: t + 0.9, dur: 0.08, type: 'lowpass', freq: 2600, freqEnd: 90, gain: 0.8, attack: 0.002 });
    this.tone(o, { t: t + 0.9, dur: 0.42, type: 'sine', freq: 88, freqEnd: 22, gain: 0.62, attack: 0.004 });
    // el cristal que se cierra
    H.crystalL(this, o, t + 0.96, [2637 * k, 3520 * k, 4186 * k], { gain: 0.03, dur: 0.85, spread: 0.022 });
    this.tone(o, { t: t + 0.96, dur: 0.75, type: 'sine', freq: 5274, freqEnd: 4800, gain: 0.012, attack: 0.004 });
  }, 3);
  // el chico (cada muerto que se traga una grieta): lo mismo en 0,8 s
  B('desg-trago4', 0.85, function (o, t) {
    const k = 0.9 + Math.random() * 0.2;
    this.tone(o, { t, dur: 0.42, type: 'sine', freq: 80 * k, freqEnd: 28, gain: 0.32, attack: 0.05 });
    this.noise(o, { t, dur: 0.4, type: 'bandpass', freq: 4200 * k, freqEnd: 520, q: 1.4, gain: 0.5, attack: 0.3 });
    this.noise(o, { t: t + 0.38, dur: 0.06, type: 'lowpass', freq: 2200, freqEnd: 300, gain: 0.7, attack: 0.002 });
    this.tone(o, { t: t + 0.38, dur: 0.26, type: 'sine', freq: 85, freqEnd: 26, gain: 0.5, attack: 0.004 });
    H.crystalL(this, o, t + 0.42, [3136 * k, 4186 * k], { gain: 0.02, dur: 0.35, spread: 0.015 });
  }, 3);
  // el golpe cargado de la del Eclipse: mientras carga, el espacio que se
  // tensa (un latido grave de 2 s exactos: da la vuelta sin chasquido)
  // (horneado 4 s; se repite el tramo de 2 a 4 s, parejo)
  B('desg-carga', 4.0, function (o) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const bias = c.createConstantSource ? c.createConstantSource() : null;
    if (bias) {
      bias.offset.value = 0.08;
      bias.connect(g.gain);
      bias.start(0);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 4;
    const lg = c.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg).connect(g.gain);
    lfo.start(0);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    f.Q.value = 6;
    for (const [fr, type, gn] of [[41, 'sine', 1], [61.5, 'sine', 0.5], [82, 'sawtooth', 0.25], [123, 'sawtooth', 0.1], [2460, 'sine', 0.02]]) {
      const os = c.createOscillator();
      os.type = type;
      os.frequency.value = fr;
      const og = c.createGain();
      og.gain.value = gn;
      os.connect(og).connect(f);
      os.start(0);
    }
    f.connect(g).connect(o);
  });
  // la Furia divina (el Eclipse): un gong grave que se hunde, el coro oscuro
  // y el viento que lo apaga todo
  B('desg-eclipse', 3.4, function (o0, t) {
    const o = H.hall(this, o0, 3, 0.55);
    H.bellL(this, o, t, 98, 0.17, 3.2);
    H.subL(this, o, t, { f0: 60, f1: 18, dur: 2.4, gain: 0.55 });
    this.noise(o, { t, dur: 2.6, type: 'bandpass', freq: 3000, freqEnd: 200, q: 0.8, gain: 0.5, attack: 0.5 });
    this.choir?.(o, t + 0.15, [33, 40, 45, 52, 57], { dur: 2.4, gain: 0.05, attack: 0.4, release: 1.4 });
    H.shatterL(this, o, t + 0.05, { n: 22, span: 0.9, gain: 0.25 });
  });
  // ---------------- el Cazador del Caos ----------------
  // agarrarlo: el destello que rasga, un grito de vacío que baja y los ojos que se abren
  B('caz-toma', 2.2, function (o0, t) {
    const o = H.hall(this, o0, 2.2, 0.45);
    H.tearL(this, o, t, { dur: 0.5, f0: 300, f1: 4200, gain: 0.85, n: 20 });
    H.subL(this, o, t, { f0: 90, f1: 22, dur: 1.2, gain: 0.65 });
    this.tone(o, { t, dur: 1.4, type: 'sawtooth', freq: 880, freqEnd: 110, gain: 0.035, attack: 0.02 });
    this.tone(o, { t, dur: 1.4, type: 'sawtooth', freq: 932, freqEnd: 117, gain: 0.025, attack: 0.02 });
    this.choir?.(o, t + 0.2, [45, 52, 57, 64], { dur: 1.2, gain: 0.04, attack: 0.15, release: 0.9 });
    [1568, 2093, 2637, 3136, 4186].forEach((f, i) => H.crystalL(this, o, t + 0.25 + i * 0.06, [f], { gain: 0.025, dur: 0.6 }));
  });
  // de fondo los 20 s: el zumbido del vacío (4 s exactos: notas en múltiplos
  // de 0,25 Hz, da la vuelta sin chasquido) con un latido lento
  // (horneado 6 s; se repite el tramo de 2 a 6 s, como el coro de la Furia)
  B('caz-zumbido', 6.0, function (o) {
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    const bias = c.createConstantSource ? c.createConstantSource() : null;
    if (bias) {
      bias.offset.value = 0.6;
      bias.connect(out.gain);
      bias.start(0);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.75;
    const lg = c.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(out.gain);
    lfo.start(0);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 0.9;
    for (const [fr, type, gn] of [[46.25, 'sine', 0.5], [69.25, 'sine', 0.22], [92.5, 'sawtooth', 0.06], [93, 'sawtooth', 0.06], [185, 'triangle', 0.05], [277.5, 'sine', 0.03]]) {
      const os = c.createOscillator();
      os.type = type;
      os.frequency.value = fr;
      const og = c.createGain();
      og.gain.value = gn;
      os.connect(og);
      og.connect(fr < 80 ? out : f);
      os.start(0);
    }
    f.connect(out);
    out.connect(o);
  });
  // un rayo de vacío que salta de muerto en muerto: el chasquido, el zumbido
  // que corta y la cola que baja
  B('caz-rayo', 0.9, function (o, t) {
    for (let i = 0; i < 5; i++) this.noise(o, { t: t + i * 0.05 + Math.random() * 0.02, dur: 0.05, type: 'highpass', freq: 2500 + Math.random() * 3000, gain: 0.4 - i * 0.05, attack: 0.001 });
    this.tone(o, { t, dur: 0.35, type: 'sawtooth', freq: 1400, freqEnd: 180, gain: 0.055, attack: 0.003 });
    this.tone(o, { t, dur: 0.35, type: 'square', freq: 1480, freqEnd: 190, gain: 0.02, attack: 0.003 });
    H.subL(this, o, t, { f0: 100, f1: 32, dur: 0.35, gain: 0.3 });
    H.tearL(this, o, t + 0.03, { dur: 0.2, gain: 0.3, n: 7, f0: 1200, f1: 5000 });
  }, 3);
  // revientan en esquirlas: vidrio negro
  B('caz-esquirlas', 0.7, function (o, t) {
    this.noise(o, { t, dur: 0.1, type: 'lowpass', freq: 1800, freqEnd: 150, gain: 0.8, attack: 0.002 });
    H.shatterL(this, o, t, { n: 16, span: 0.45, gain: 0.32 });
    H.crystalL(this, o, t + 0.01, [1975.5 + Math.random() * 300], { gain: 0.022, dur: 0.4 });
  }, 3);
  // se termina: el vacío que se cierra en la mano
  B('caz-fin', 1.4, function (o, t) {
    this.noise(o, { t, dur: 0.6, type: 'bandpass', freq: 3800, freqEnd: 300, q: 1.2, gain: 0.5, attack: 0.4 });
    H.subL(this, o, t + 0.55, { f0: 110, f1: 30, dur: 0.4, gain: 0.5 });
    H.crystalL(this, o, t + 0.6, [2637, 1975.5, 1568], { gain: 0.03, dur: 0.6, spread: 0.06 });
  });
}
