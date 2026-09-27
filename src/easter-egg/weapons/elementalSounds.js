// Los sonidos de los cuatro mates de la luz (weapons/Elementales.js), hechos
// con la síntesis de core/audio.js y en capas: el cuerpo, el aire, el grave y
// los detalles (chispas, crujidos, campanitas). Los templados suenan más
// grandes. Los de la mano propia van sin posición; los tiros de los demás
// jugadores suenan donde están.
//  · tiros: shot (común), release (cargado), charge (el que sube mientras se
//    carga, con su aviso de carga llena) y los golpes (boom, thunder...).
//  · la mano: equip (al sacarlo) y los pasos de la recarga y de la
//    inspección (cue), que dispara weapons/elementalFx.js en el cuadro justo.

// notas de la quena del Zonda (mi, sol, la, mi: pentatónica andina)
const QUENA = [659, 784, 880, 659];
// el hielo que vuelve a crecer: arpegio que sube
const GROW = [1568, 1760, 2093, 2349, 2637, 3136, 3520];

export default class ElemSounds {
  constructor(g) {
    this.g = g;
  }

  get a() {
    return this.g.audio;
  }

  // ---------------- piezas ----------------
  // chisporroteo: golpecitos de ruido sueltos
  crackle(o, t, dur, n, gain = 0.15, f = 3000) {
    const a = this.a;
    for (let i = 0; i < n; i++) a.noise(o, { t: t + Math.random() * dur, dur: 0.01 + Math.random() * 0.03, type: 'bandpass', freq: f * (0.6 + Math.random() * 1.2), q: 1.5, gain: gain * (0.4 + Math.random() * 0.8) });
  }

  // el cuerpo del fuego o de una ráfaga: ruido grave con el filtro que barre
  roar(o, t, dur, f0, f1, gain, attack = 0.05) {
    this.a.noise(o, { t, dur, type: 'lowpass', freq: f0, freqEnd: f1, q: 0.8, gain, brown: true, attack });
  }

  whoosh(o, t, dur, f0, f1, gain, q = 1.2) {
    this.a.noise(o, { t, dur, type: 'bandpass', freq: f0, freqEnd: f1, q, gain, attack: Math.min(0.08, dur * 0.3) });
  }

  thump(o, t, f0, f1, gain, dur = 0.3) {
    this.a.tone(o, { t, dur, freq: f0, freqEnd: f1, gain });
  }

  // campanita de vidrio: parciales inarmónicos que se apagan
  chime(o, t, f, gain = 0.08, dur = 0.9) {
    const a = this.a;
    for (const [m, k] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) a.tone(o, { t, dur: dur / Math.sqrt(m), freq: f * m, gain: gain * k, attack: 0.002 });
  }

  // un silbido con vibrato (y el aire alrededor)
  whistle(o, t, dur, f0, f1, gain, vib = 6) {
    const a = this.a;
    const c = a.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = vib;
    const lg = c.createGain();
    lg.gain.value = f0 * 0.014;
    lfo.connect(lg).connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.12, dur * 0.3));
    g.gain.setTargetAtTime(0.0001, t + dur * 0.75, dur * 0.1);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.3);
    lfo.stop(t + dur + 0.3);
    a.noise(o, { t, dur, type: 'bandpass', freq: f0 * 1.5, freqEnd: f1 * 1.5, q: 5, gain: gain * 0.6, attack: 0.08 });
  }

  // una nota de quena: soplada (mucho aire al principio) con vibrato tardío
  flute(o, t, dur, f, gain = 0.09) {
    const a = this.a;
    const c = a.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(f * 0.985, t);
    osc.frequency.linearRampToValueAtTime(f, t + 0.06);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + dur);
    lfo.connect(lg).connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.2);
    lfo.stop(t + dur + 0.2);
    a.tone(o, { t, dur: dur * 0.9, freq: f * 2, gain: gain * 0.12, attack: 0.05 });
    a.noise(o, { t, dur: 0.12, type: 'bandpass', freq: f * 2.2, q: 2, gain: gain * 1.4 });
    a.noise(o, { t, dur, type: 'bandpass', freq: f * 1.6, q: 7, gain: gain * 0.35, attack: 0.04 });
  }

  // chispazo eléctrico
  zap(o, t, gain = 0.4, f = 1400) {
    const a = this.a;
    a.noise(o, { t, dur: 0.045, type: 'highpass', freq: 3500, gain });
    a.tone(o, { t, dur: 0.06, type: 'square', freq: f * (0.7 + Math.random() * 0.6), freqEnd: f * 0.3, gain: gain * 0.1 });
    a.tone(o, { t, dur: 0.1, type: 'sawtooth', freq: 180 + Math.random() * 80, freqEnd: 60, gain: gain * 0.3 });
  }

  // zumbido de corriente: sierra con trémolo, filtrada
  buzz(o, t, dur, f0, f1, gain, rate = 42) {
    const a = this.a;
    const c = a.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, f0 * 6);
    bp.Q.value = 0.8;
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = rate;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    osc.connect(bp).connect(am).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.4);
    lfo.stop(t + dur + 0.4);
  }

  // el zumbido de una turbina (sierra grave filtrada que sube o baja)
  whirr(o, t, dur, f0, f1, gain) {
    const a = this.a;
    const c = a.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.8, dur * 0.12);
    osc.connect(lp).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.4);
  }

  // hielo que se raja
  crack(o, t, gain = 0.5) {
    const a = this.a;
    a.noise(o, { t, dur: 0.03, type: 'highpass', freq: 1800, gain });
    a.noise(o, { t: t + 0.01, dur: 0.12, type: 'bandpass', freq: 700, q: 4, gain: gain * 0.5 });
    a.tone(o, { t, dur: 0.1, freq: 220, freqEnd: 80, gain: gain * 0.5 });
  }

  // el hielo que cruje al apretarlo
  creak(o, t, gain = 0.2) {
    const a = this.a;
    const f = 280 + Math.random() * 380;
    for (let i = 0; i < 5; i++) a.noise(o, { t: t + i * 0.018, dur: 0.02, type: 'bandpass', freq: f * (1 + i * 0.04), q: 8, gain: gain * (1 - i * 0.12) });
  }

  // se rompe el vidrio (o el hielo)
  shatter(o, t, gain = 0.5, n = 8) {
    const a = this.a;
    a.noise(o, { t, dur: 0.4, type: 'highpass', freq: 2500, gain });
    for (let i = 0; i < n; i++) this.chime(o, t + Math.random() * 0.25, 2200 + Math.random() * 4200, 0.03 + Math.random() * 0.03, 0.35);
  }

  breath(o, t, dur, gain = 0.3, f = 1400) {
    this.a.noise(o, { t, dur, type: 'bandpass', freq: f, freqEnd: f * 0.7, q: 0.7, gain, attack: dur * 0.35 });
  }

  snap(o, t, gain = 0.5) {
    const a = this.a;
    a.noise(o, { t, dur: 0.018, type: 'highpass', freq: 2500, gain });
    a.tone(o, { t, dur: 0.03, type: 'triangle', freq: 1900, freqEnd: 900, gain: gain * 0.3 });
  }

  // la ropa y la mano al moverse
  rustle(o, t, dur = 0.2, gain = 0.1) {
    this.a.noise(o, { t, dur, type: 'bandpass', freq: 900, q: 0.6, gain, attack: dur * 0.3 });
  }

  // el chirrido de un dedo sobre el hielo
  squeak(o, t, dur, gain = 0.12) {
    const a = this.a;
    const c = a.ctx;
    const n = a.noise(o, { t, dur, type: 'bandpass', freq: 2600, q: 9, gain, attack: 0.03 });
    const lfo = c.createOscillator();
    lfo.frequency.value = 11;
    const lg = c.createGain();
    lg.gain.value = 500;
    lfo.connect(lg).connect(n.f.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  // Una salida que gira de izquierda a derecha (un remolino alrededor de la cabeza).
  swirl(o, t, dur, rate = 2) {
    const c = this.a.ctx;
    if (!c.createStereoPanner) return o;
    const p = c.createStereoPanner();
    const lfo = c.createOscillator();
    lfo.frequency.value = rate;
    const lg = c.createGain();
    lg.gain.value = 0.85;
    lfo.connect(lg).connect(p.pan);
    lfo.start(t);
    lfo.stop(t + dur + 0.5);
    p.connect(o);
    return p;
  }

  // ---------------- los tiros ----------------
  // Tiro común. pos: null para el propio (sin posición).
  shot(el, pos, up) {
    const a = this.a;
    if (!a?.ctx) return;
    const t = a.now;
    const k = up ? 1.2 : 1;
    if (el === 'fuego') {
      const o = a.out({ pos, reverb: 0.35, gain: 0.8 * k });
      this.whoosh(o, t, 0.38, 500, 2600, 0.8, 0.8);
      this.roar(o, t, 0.45, 1400, 180, 0.7);
      this.thump(o, t, up ? 120 : 150, 45, 0.7, 0.25);
      this.crackle(o, t + 0.05, 0.4, up ? 14 : 8, 0.14);
      if (up) {
        this.thump(o, t, 70, 28, 0.6, 0.4);
        a.noise(o, { t, dur: 0.3, type: 'highpass', freq: 5000, gain: 0.12 });
      }
    } else if (el === 'viento') {
      const o = a.out({ pos, reverb: 0.5, gain: 0.85 * k });
      a.noise(o, { t, dur: 0.9 * k, type: 'lowpass', freq: 300, freqEnd: 2800, q: 0.9, gain: 1, brown: true, attack: 0.05 });
      this.whoosh(o, t + 0.05, 0.7 * k, 1800, 500, 0.35, 1.4);
      this.thump(o, t, 90, 40, 0.4, 0.4);
      this.whistle(o, t + 0.02, 0.3, 900, 1500, 0.035);
      if (up) this.roar(o, t, 0.6, 200, 900, 0.5);
    } else if (el === 'rayo') {
      const o = a.out({ pos, reverb: 0.45, gain: 0.85 * k });
      a.noise(o, { t, dur: 0.07, type: 'highpass', freq: 3800, gain: 0.9 });
      a.tone(o, { t, dur: 0.3, type: 'sawtooth', freq: 340, freqEnd: 70, gain: 0.3 });
      a.tone(o, { t: t + 0.015, dur: 0.16, type: 'square', freq: 1500, freqEnd: 280, gain: 0.07 });
      this.zap(o, t + 0.05, 0.3);
      a.noise(o, { t: t + 0.06, dur: 0.55 * k, type: 'lowpass', freq: 520, freqEnd: 60, q: 0.7, gain: 0.5, brown: true });
      if (up) {
        a.noise(o, { t: t + 0.03, dur: 0.05, type: 'highpass', freq: 5000, gain: 0.6 });
        this.thump(o, t, 90, 30, 0.5, 0.4);
      }
      // el trueno del castillo (el intenso), cortito
      a.thunderCrack?.(pos, { dur: 0.9 * k, gain: 0.3, big: true });
    } else {
      const o = a.out({ pos, reverb: 0.6, gain: 0.7 * k });
      a.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 3000, freqEnd: 6500, q: 1.5, gain: 0.55 });
      a.noise(o, { t, dur: 0.14, type: 'highpass', freq: 2200, gain: 0.3 });
      for (let i = 0; i < (up ? 5 : 3); i++) this.chime(o, t + i * 0.025, 1800 + Math.random() * 2600, 0.05, 0.7);
      this.thump(o, t, 700, 300, 0.18, 0.12);
      if (up) this.thump(o, t, 160, 60, 0.35, 0.3);
    }
  }

  // El tiro cargado al soltar el clic.
  release(el, pos, up) {
    const a = this.a;
    if (!a?.ctx) return;
    const t = a.now;
    const k = up ? 1.1 : 1;
    if (el === 'fuego') {
      const o = a.out({ pos, reverb: 0.5, gain: 1.15 * k });
      this.roar(o, t, 1.1, 2400, 90, 1, 0.02);
      this.thump(o, t, 95, 26, 1, 0.8);
      this.whoosh(o, t, 0.7, 300, 3000, 0.6, 0.7);
      this.crackle(o, t + 0.1, 1.2, 24, 0.16);
      a.noise(o, { t: t + 0.2, dur: 1.6, type: 'lowpass', freq: 140, q: 0.6, gain: 0.5, brown: true, attack: 0.3 });
    } else if (el === 'viento') {
      const o = a.out({ pos, reverb: 0.6, gain: 1.15 * k });
      this.roar(o, t, 1.6, 250, 3200, 1, 0.08);
      this.whoosh(this.swirl(o, t, 1.5, 3), t + 0.1, 1.4, 2200, 300, 0.45, 1.6);
      a.noise(o, { t: t + 0.2, dur: 2.2, type: 'lowpass', freq: 160, q: 0.8, gain: 0.55, brown: true, attack: 0.4 });
      this.whistle(o, t, 0.9, 1400, 500, 0.06);
      this.thump(o, t, 80, 30, 0.6, 0.5);
    } else if (el === 'rayo') {
      const o = a.out({ pos, reverb: 0.6, gain: 1.15 * k });
      a.noise(o, { t, dur: 0.1, type: 'highpass', freq: 3000, gain: 1 });
      this.buzz(o, t, 0.9, 220, 90, 0.35);
      for (let i = 0; i < 6; i++) this.zap(o, t + 0.05 + Math.random() * 0.6, 0.25);
      this.thump(o, t, 70, 24, 0.9, 0.7);
      a.noise(o, { t: t + 0.05, dur: 1.2, freq: 400, freqEnd: 50, q: 0.8, gain: 0.7, brown: true });
      a.thunderCrack?.(pos, { dur: 1.8, gain: 0.6, big: true });
    } else {
      const o = a.out({ pos, reverb: 0.8, gain: 1.05 * k });
      a.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 2500, freqEnd: 7000, q: 1.2, gain: 0.6 });
      for (let i = 0; i < 9; i++) this.chime(o, t + i * 0.035, 1500 + Math.random() * 3500, 0.05, 1);
      this.thump(o, t, 140, 45, 0.6, 0.5);
      this.whoosh(o, t + 0.05, 1, 3000, 800, 0.3, 1);
    }
  }

  // Lo que suena mientras se carga: capas que suben hasta la carga llena
  // (time: lo que tarda) y un detalle suelto que se va juntando. Devuelve
  // { full(), stop() }: full avisa que está lista; stop la corta de a poco.
  charge(el, up, time) {
    const a = this.a;
    if (!a?.ctx) return null;
    const c = a.ctx;
    const t = a.now;
    const o = a.out({ gain: 0.0001, reverb: 0.25 });
    o.gain.setValueAtTime(0.0001, t);
    o.gain.exponentialRampToValueAtTime(up ? 0.6 : 0.5, t + 0.25);
    const nodes = [];
    const src = (brown) => {
      const s = c.createBufferSource();
      s.buffer = brown ? a.brownBuf : a.noiseBuf;
      s.loop = true;
      s.start(t, Math.random());
      nodes.push(s);
      return s;
    };
    const filt = (type, f0, f1, q) => {
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(f1, t + time);
      f.Q.value = q;
      return f;
    };
    const amp = (v) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const osc = (type, f0, f1) => {
      const x = c.createOscillator();
      x.type = type;
      x.frequency.setValueAtTime(f0, t);
      x.frequency.exponentialRampToValueAtTime(f1, t + time);
      x.start(t);
      nodes.push(x);
      return x;
    };
    const lfo = (param, rate, depth) => {
      const x = c.createOscillator();
      x.frequency.value = rate;
      const g = amp(depth);
      x.connect(g).connect(param);
      x.start(t);
      nodes.push(x);
      return x;
    };
    if (el === 'fuego') {
      // el rugido que crece, el siseo que sube y el retumbe de abajo
      src(true).connect(filt('lowpass', 180, 1500, 0.9)).connect(amp(1.1)).connect(o);
      src(false).connect(filt('bandpass', 700, 2600, 1.2)).connect(amp(0.25)).connect(o);
      osc('sine', 48, 72).connect(amp(0.35)).connect(o);
    } else if (el === 'viento') {
      // el aullido que ondula, el silbido de botella que sube y la turbina
      const bp = filt('bandpass', 280, 1500, 3.5);
      src(false).connect(bp).connect(amp(1.2)).connect(o);
      lfo(bp.frequency, 0.9, 160);
      const w = osc('sine', 520, 1400);
      lfo(w.frequency, 6, 9);
      w.connect(amp(0.07)).connect(o);
      osc('sawtooth', 30, 160).connect(filt('lowpass', 200, 800, 1)).connect(amp(0.12)).connect(o);
    } else if (el === 'rayo') {
      // el zumbido de la corriente (cada vez más agudo y más rápido) y el pito
      const b = osc('sawtooth', 110, 330);
      const am = amp(0.5);
      const l = lfo(am.gain, 18, 0.5);
      l.frequency.linearRampToValueAtTime(60, t + time);
      b.connect(filt('bandpass', 600, 2400, 0.9)).connect(am).connect(amp(0.5)).connect(o);
      osc('sine', 1800, 5200).connect(amp(0.035)).connect(o);
      src(false).connect(filt('highpass', 5000, 7000, 0.7)).connect(amp(0.05)).connect(o);
    } else {
      // el viento helado y un grave que sube
      src(false).connect(filt('bandpass', 700, 2200, 1.4)).connect(amp(0.6)).connect(o);
      osc('sine', 110, 190).connect(amp(0.12)).connect(o);
    }
    // los detalles sueltos, cada vez más seguidos (hasta unos segundos de más)
    const span = time + 4;
    const at = () => t + Math.pow(Math.random(), 0.7) * span;
    if (el === 'fuego') this.crackle(o, t, span, Math.round(span * 22), 0.13);
    else if (el === 'rayo') for (let i = 0; i < span * 7; i++) this.zap(o, at(), 0.12 + Math.random() * 0.12);
    else if (el === 'hielo') {
      for (let i = 0; i < span * 9; i++) this.chime(o, at(), 2000 + Math.random() * 4000, 0.02 + Math.random() * 0.02, 0.5);
      for (let i = 0; i < span * 3; i++) this.creak(o, at(), 0.15);
    } else for (let i = 0; i < span * 2; i++) this.chime(o, at(), 1200 + Math.random() * 1500, 0.015, 0.6);
    let full = false;
    return {
      full: () => {
        if (full) return;
        full = true;
        this.ready(el, up);
      },
      stop: () => {
        const n = a.now;
        o.gain.cancelScheduledValues(n);
        o.gain.setTargetAtTime(0.0001, n, 0.04);
        setTimeout(() => {
          for (const x of nodes) {
            try {
              x.stop();
            } catch {
              /* ya estaba parado */
            }
          }
          o.disconnect();
        }, 300);
      },
    };
  }

  // Carga llena: el aviso de que se puede soltar.
  ready(el, up) {
    const a = this.a;
    const t = a.now;
    const o = a.out({ gain: up ? 0.75 : 0.6, reverb: 0.3 });
    if (el === 'fuego') {
      this.roar(o, t, 0.35, 2600, 400, 0.6);
      a.noise(o, { t, dur: 0.4, type: 'highpass', freq: 5000, gain: 0.12 });
    } else if (el === 'viento') {
      this.whoosh(o, t, 0.4, 700, 2500, 0.4);
      this.chime(o, t + 0.05, 2637, 0.08, 1.2);
    } else if (el === 'rayo') {
      a.noise(o, { t, dur: 0.06, type: 'highpass', freq: 3000, gain: 0.7 });
      a.tone(o, { t, dur: 0.45, freq: 2400, gain: 0.08 });
    } else {
      for (const [i, f] of [2093, 2637, 3136].entries()) this.chime(o, t + i * 0.04, f, 0.07, 1.4);
      this.crack(o, t, 0.3);
    }
  }

  // ---------------- los golpes ----------------
  boom(pos, big) {
    const a = this.a;
    a.explosion(pos, big * 0.8);
    const o = a.out({ pos, reverb: 0.4, gain: 0.6 * big });
    this.crackle(o, a.now + 0.1, 1, 12, 0.2, 3200);
    this.roar(o, a.now, 0.9 * big, 1800, 120, 0.5);
  }

  gust(pos, big) {
    const a = this.a;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.5, gain: 0.9 * big });
    a.noise(o, { t, dur: 0.9 * big, type: 'lowpass', freq: 300, freqEnd: 2800, q: 0.9, gain: 1, brown: true, attack: 0.05 });
    a.noise(o, { t: t + 0.05, dur: 0.7 * big, type: 'bandpass', freq: 1800, freqEnd: 500, q: 1.4, gain: 0.35 });
    a.tone(o, { t, dur: 0.4, freq: 90, freqEnd: 40, gain: 0.4 });
  }

  zapAt(pos) {
    const a = this.a;
    const o = a.out({ pos, reverb: 0.3, gain: 0.5 });
    this.zap(o, a.now, 0.5);
  }

  thunder(pos) {
    const a = this.a;
    a.thunder(pos);
    const o = a.out({ pos, reverb: 0.5, gain: 1 });
    a.noise(o, { t: a.now, dur: 0.1, type: 'highpass', freq: 3000, gain: 1 });
    for (let i = 0; i < 5; i++) this.zap(o, a.now + Math.random() * 0.4, 0.3);
  }

  iceHit(pos) {
    const a = this.a;
    const o = a.out({ pos, reverb: 0.4, gain: 0.7 });
    this.shatter(o, a.now, 0.5, 5);
    this.crack(o, a.now, 0.3);
  }

  blizzard(pos) {
    const a = this.a;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.7, gain: 1 });
    a.noise(o, { t, dur: 3.8, type: 'bandpass', freq: 600, freqEnd: 1600, q: 0.6, gain: 0.6, brown: true, attack: 0.3 });
    this.whoosh(this.swirl(o, t, 3.5, 0.7), t + 0.2, 3.4, 2600, 1200, 0.25, 2);
    this.shatter(o, t, 0.6, 10);
    for (let i = 0; i < 10; i++) this.chime(o, t + 0.3 + Math.random() * 3, 1800 + Math.random() * 3000, 0.02, 0.8);
  }

  // ---------------- la mano ----------------
  // Al sacarlo (subir el mate a la mano).
  equip(el, up) {
    const a = this.a;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ gain: up ? 0.6 : 0.5, reverb: 0.25 });
    this.rustle(o, t, 0.2, 0.1);
    if (el === 'fuego') {
      this.snap(o, t + 0.05, 0.3);
      this.roar(o, t + 0.07, 0.5, 2200, 300, 0.55);
      this.crackle(o, t + 0.1, 0.5, 8, 0.12);
    } else if (el === 'viento') {
      this.whoosh(o, t, 0.45, 500, 2000, 0.35);
      this.whirr(o, t, 0.5, 90, 280, 0.06);
      this.chime(o, t + 0.12, 2637, 0.05, 1);
    } else if (el === 'rayo') {
      this.zap(o, t + 0.04, 0.4);
      this.buzz(o, t + 0.04, 0.35, 120, 160, 0.12);
    } else {
      for (const [i, f] of [2349, 3136].entries()) this.chime(o, t + i * 0.05, f, 0.06, 1.2);
      this.crack(o, t + 0.02, 0.25);
    }
    if (up) this.thump(o, t + 0.05, 90, 40, 0.3, 0.3);
  }

  // Un paso de la recarga o de la inspección (lo pide elementalFx en el cuadro
  // en que pasa). o: la salida de esa animación (se corta si se interrumpe).
  cue(el, name, up, o) {
    const a = this.a;
    if (!a?.ctx || !o) return;
    const t = a.now;
    const k = up ? 1.25 : 1;
    if (name === 'lift' || name === 'down') return this.rustle(o, t, name === 'lift' ? 0.25 : 0.2, 0.1);
    if (el === 'fuego') this.cueFuego(o, t, name, k);
    else if (el === 'viento') this.cueViento(o, t, name, k);
    else if (el === 'rayo') this.cueRayo(o, t, name, k);
    else this.cueHielo(o, t, name, k);
    return undefined;
  }

  cueFuego(o, t, name, k) {
    const a = this.a;
    const puff = { puff1: 1, puff2: 2, puff3: 3 }[name];
    if (puff) {
      this.breath(o, t, 0.34, 0.22 + puff * 0.04, 1300);
      this.roar(o, t + 0.1, 0.55, 300 + puff * 250, 1400 + puff * 300, (0.3 + puff * 0.14) * k);
      this.crackle(o, t + 0.12, 0.45, 4 + puff * 3, 0.12);
    } else if (name === 'cup') {
      this.rustle(o, t, 0.15, 0.1);
      a.noise(o, { t: t + 0.1, dur: 0.05, type: 'lowpass', freq: 400, gain: 0.25 });
    } else if (name === 'snap') {
      this.snap(o, t, 0.6);
      this.roar(o, t + 0.02, 0.65, 2600, 200, 0.85 * k, 0.01);
      this.thump(o, t + 0.02, 110, 38, 0.6 * k, 0.4);
      this.crackle(o, t + 0.05, 0.5, 12, 0.16);
    } else if (name === 'swirl') {
      const p = this.swirl(o, t, 1, 2.6);
      this.whoosh(p, t, 0.85, 400, 1800, 0.45 * k, 1);
      this.roar(p, t, 0.9, 300, 1700, 0.5 * k, 0.2);
      this.crackle(p, t, 0.9, 14, 0.12);
    } else if (name === 'suck') {
      this.whoosh(o, t, 0.3, 2400, 300, 0.45, 1.5);
      this.thump(o, t + 0.2, 70, 140, 0.25, 0.12);
    } else if (name === 'clack') {
      this.thump(o, t, 170, 50, 0.7, 0.2);
      a.noise(o, { t, dur: 0.06, type: 'lowpass', freq: 900, gain: 0.5 });
      this.crackle(o, t + 0.02, 0.3, 12, 0.2, 3600);
      a.noise(o, { t, dur: 0.35, type: 'highpass', freq: 5000, gain: 0.1 });
    } else if (name === 'pulse' || name === 'pulse2') {
      this.thump(o, t, 55, 38, 0.55, 0.5);
      this.roar(o, t, 0.6, 200, 600, 0.3 * k);
      a.noise(o, { t: t + 0.05, dur: 0.4, type: 'bandpass', freq: 3000, q: 1, gain: 0.07 });
    } else if (name === 'peek') {
      this.crackle(o, t, 1.2, 14, 0.1);
      this.roar(o, t, 0.9, 200, 420, 0.22 * k, 0.3);
    } else if (name === 'palm') {
      this.whoosh(o, t, 0.25, 800, 2000, 0.25);
      this.crackle(o, t + 0.1, 0.8, 8, 0.09);
    } else if (name === 'fist') {
      a.noise(o, { t, dur: 0.35, type: 'highpass', freq: 2500, gain: 0.25 });
      this.thump(o, t, 90, 50, 0.2, 0.2);
    } else if (name === 'reflame') {
      this.snap(o, t, 0.45);
      this.roar(o, t + 0.02, 0.35, 1800, 300, 0.4);
    } else if (name === 'flick') {
      this.whoosh(o, t, 0.3, 600, 2400, 0.35);
      this.roar(o, t + 0.22, 0.75, 2600, 150, 0.85 * k, 0.01);
      this.thump(o, t + 0.22, 100, 35, 0.6 * k, 0.45);
      this.crackle(o, t + 0.25, 0.6, 14, 0.15);
    } else if (name === 'spin') {
      this.whoosh(this.swirl(o, t, 0.6, 3), t, 0.55, 300, 900, 0.3);
      this.crackle(o, t, 0.5, 6, 0.1);
    }
  }

  cueViento(o, t, name, k) {
    const a = this.a;
    const note = { note1: 0, note2: 1, note3: 2, note4: 3 }[name];
    if (note !== undefined) {
      this.flute(o, t, [0.3, 0.3, 0.55, 0.8][note], QUENA[note], 0.09 * k);
      return;
    }
    if (name === 'flick') {
      this.snap(o, t, 0.35);
      this.whirr(o, t, 0.6, 60, 260, 0.08 * k);
    } else if (name === 'cap') {
      a.noise(o, { t, dur: 0.06, type: 'lowpass', freq: 320, gain: 0.35 });
      this.thump(o, t, 180, 90, 0.15, 0.1);
    } else if (name === 'swirl') {
      const p = this.swirl(o, t, 1, 2.4);
      this.whirr(o, t, 0.95, 120, 420, 0.07 * k);
      this.whoosh(p, t, 1, 400, 1400, 0.4 * k, 4);
      this.whistle(o, t + 0.1, 0.9, 600, 1500, 0.05 * k);
    } else if (name === 'uncork') {
      a.tone(o, { t, dur: 0.08, freq: 520, freqEnd: 140, gain: 0.5 });
      a.noise(o, { t, dur: 0.05, type: 'bandpass', freq: 1200, gain: 0.3 });
      this.roar(o, t + 0.03, 0.6, 400, 3000, 0.7 * k);
    } else if (name === 'spin') {
      this.whirr(o, t, 1.2, 300, 80, 0.09 * k);
      for (let i = 0; i < 4; i++) this.chime(o, t + 0.15 + i * 0.12, 1800 + i * 300, 0.035, 0.8);
    } else if (name === 'catch') {
      this.thump(o, t, 140, 60, 0.35, 0.15);
      this.rustle(o, t, 0.12, 0.08);
    } else if (name === 'spinup') {
      this.whirr(o, t, 1.7, 80, 400, 0.08 * k);
      this.whoosh(this.swirl(o, t, 1.7, 1.5), t, 1.7, 400, 1200, 0.3 * k, 3);
    } else if (name === 'spinstop') {
      this.whirr(o, t, 0.6, 400, 60, 0.07);
      this.thump(o, t + 0.45, 150, 70, 0.25, 0.12);
    } else if (name === 'twist') {
      this.whoosh(this.swirl(o, t, 1.1, 3.5), t, 1.1, 500, 1700, 0.35 * k, 2);
      a.noise(o, { t, dur: 1.1, type: 'lowpass', freq: 200, q: 0.8, gain: 0.35, brown: true, attack: 0.2 });
    }
  }

  cueRayo(o, t, name, k) {
    const a = this.a;
    const tap = { tap1: 1, tap2: 2, tap3: 3 }[name];
    if (tap) {
      a.noise(o, { t, dur: 0.01, type: 'highpass', freq: 4000, gain: 0.3 });
      this.zap(o, t, (0.22 + tap * 0.1) * k, 1000 + tap * 350);
      this.crackle(o, t + 0.02, 0.15, 3, 0.1, 5000);
    } else if (name === 'slide') {
      this.buzz(o, t, 0.45, 140, 420, 0.22 * k);
      a.noise(o, { t, dur: 0.45, type: 'highpass', freq: 6000, gain: 0.07 });
    } else if (name === 'flick') {
      a.noise(o, { t, dur: 0.09, type: 'highpass', freq: 3000, gain: 0.9 });
      this.thump(o, t, 80, 28, 0.6 * k, 0.5);
      a.noise(o, { t: t + 0.04, dur: 0.8, type: 'lowpass', freq: 500, freqEnd: 60, q: 0.7, gain: 0.5 * k, brown: true });
      for (let i = 0; i < 3; i++) this.zap(o, t + 0.03 + i * 0.06, 0.3);
    } else if (name === 'shake') {
      this.crackle(o, t, 0.35, 8, 0.12, 5000);
      this.rustle(o, t, 0.3, 0.08);
    } else if (name === 'hum') {
      this.buzz(o, t, 0.6, 120, 90, 0.1 * k);
      this.zap(o, t + 0.2, 0.15);
    } else if (name === 'near') {
      this.buzz(o, t, 1.3, 90, 160, 0.12 * k, 30);
      this.crackle(o, t, 1.2, 6, 0.08, 5000);
    } else if (name === 'plasma') {
      this.buzz(o, t, 1.1, 160, 240, 0.18 * k, 55);
      for (let i = 0; i < 5; i++) this.zap(o, t + Math.random() * 1, 0.12);
    } else if (name === 'zap') {
      a.noise(o, { t, dur: 0.1, type: 'highpass', freq: 2800, gain: 1 });
      this.zap(o, t, 0.6, 1800);
      this.thump(o, t, 120, 45, 0.5, 0.25);
    } else if (name === 'ladder') {
      for (let i = 0; i < 3; i++) this.buzz(o, t + i * 0.36, 0.32, 200, 900, 0.14 * k, 70);
      this.crackle(o, t, 1.1, 10, 0.1, 5000);
    } else if (name === 'rumble') {
      a.noise(o, { t, dur: 1.8, type: 'lowpass', freq: 300, freqEnd: 60, q: 0.7, gain: 0.4 * k, brown: true, attack: 0.3 });
    }
  }

  cueHielo(o, t, name, k) {
    const a = this.a;
    if (name === 'grip') {
      for (let i = 0; i < 3; i++) this.creak(o, t + i * 0.07, 0.22);
    } else if (name === 'slap') {
      a.noise(o, { t, dur: 0.05, type: 'lowpass', freq: 900, gain: 0.6 });
      this.shatter(o, t + 0.01, 0.55 * k, 9);
      this.crack(o, t, 0.5);
    } else if (name === 'wipe') {
      this.squeak(o, t, 0.3, 0.12);
      a.noise(o, { t, dur: 0.3, type: 'highpass', freq: 4000, gain: 0.1, attack: 0.05 });
    } else if (name === 'grow') {
      GROW.forEach((f, i) => this.chime(o, t + i * 0.085, f, 0.045 * k, 0.9));
      this.crackle(o, t, 0.7, 12, 0.06, 6000);
    } else if (name === 'lock') {
      this.crack(o, t, 0.5 * k);
      for (const [i, f] of [2093, 2637, 3136].entries()) this.chime(o, t + i * 0.03, f, 0.06 * k, 1.3);
    } else if (name === 'breath') {
      this.breath(o, t, 0.7, 0.3, 900);
      a.noise(o, { t: t + 0.3, dur: 0.5, type: 'highpass', freq: 4500, gain: 0.07, attack: 0.1 });
    } else if (name === 'draw') {
      this.squeak(o, t, 1.1, 0.1);
    } else if (name === 'bloom') {
      for (let i = 0; i < 10; i++) this.chime(o, t + i * 0.07, GROW[i % GROW.length] * (i < 7 ? 1 : 1.5), 0.04 * k, 1);
      this.crackle(o, t, 0.8, 10, 0.06, 6000);
    } else if (name === 'drop') {
      for (let i = 0; i < 5; i++) this.chime(o, t + 0.1 + i * 0.09 + Math.random() * 0.04, 2800 + Math.random() * 2400, 0.04, 0.4);
      this.shatter(o, t + 0.05, 0.2, 3);
    }
  }
}
