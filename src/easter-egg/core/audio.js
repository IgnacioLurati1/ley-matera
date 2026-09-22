// Todo el sonido es sintetizado con Web Audio: disparos, zombies, jingles,
// música ambiente. No se descarga ningún archivo de audio. Las voces (zombies
// y personajes) salen del sintetizador por formantes de core/voice.js.
import { zombieSound, speech, RATE } from './voice';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Jingles originales de cada perk: [nota midi, duración en pulsos].
const PERK_TUNES = {
  jugg: { wave: 'sawtooth', bpm: 150, cutoff: 1800, notes: [[45, 1], [45, 0.5], [48, 0.5], [52, 1], [50, 1], [48, 0.5], [47, 0.5], [45, 2], [40, 1], [45, 2]] },
  revive: { wave: 'triangle', bpm: 170, cutoff: 5000, notes: [[72, 0.5], [76, 0.5], [79, 0.5], [84, 1], [79, 0.5], [81, 0.5], [83, 1], [84, 2], [79, 1], [84, 2]] },
  speed: { wave: 'square', bpm: 220, cutoff: 3200, notes: [[64, 0.5], [67, 0.5], [71, 0.5], [74, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [67, 0.5], [69, 1], [72, 1], [76, 2]] },
  doubletap: { wave: 'sawtooth', bpm: 180, cutoff: 2400, notes: [[57, 0.5], [57, 0.5], [64, 1], [57, 0.5], [57, 0.5], [65, 1], [64, 0.5], [62, 0.5], [60, 1], [57, 2]] },
  mule: { wave: 'square', bpm: 140, cutoff: 1500, notes: [[50, 1], [57, 0.5], [55, 0.5], [53, 1], [50, 1], [55, 1], [53, 0.5], [52, 0.5], [50, 2]] },
  deadshot: { wave: 'triangle', bpm: 110, cutoff: 3000, notes: [[67, 1], [66, 1], [65, 1], [64, 3]] },
};

const BOX_TUNE = [[76, 1], [79, 1], [84, 1], [83, 0.5], [79, 0.5], [76, 1], [74, 1], [77, 1], [81, 1], [79, 2], [72, 1], [76, 2]];

// Parámetros por tipo de disparo.
const SHOTS = {
  pistol: { body: 2400, dur: 0.16, crack: 0.5, thump: 150, gain: 0.8, tail: 0.3 },
  rifle: { body: 3000, dur: 0.26, crack: 0.8, thump: 110, gain: 1, tail: 0.45 },
  smg: { body: 2600, dur: 0.12, crack: 0.5, thump: 130, gain: 0.65, tail: 0.25 },
  lmg: { body: 2000, dur: 0.2, crack: 0.7, thump: 90, gain: 0.9, tail: 0.4 },
  shotgun: { body: 1400, dur: 0.42, crack: 0.9, thump: 70, gain: 1.2, tail: 0.6 },
  pump: { body: 1500, dur: 0.4, crack: 0.9, thump: 70, gain: 1.15, tail: 0.6, pump: true },
  sniper: { body: 2200, dur: 0.6, crack: 1, thump: 60, gain: 1.3, tail: 0.9, bolt: true },
  bad: { body: 500, dur: 0.18, crack: 0, thump: 220, gain: 0.5, tail: 0.1, wobble: true },
};

export default class GameAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    // filtro que "tapa los oídos" cuando estás por caer
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.master.connect(this.muffle).connect(this.comp).connect(c.destination);
    // lo que no se tapa (el corazón y la respiración) va directo
    this.body = c.createGain();
    this.body.connect(this.comp);
    this.sfx = c.createGain();
    this.music = c.createGain();
    this.voice = c.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.voice.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain).connect(this.sfx);
    this.noiseBuf = this.makeNoise(2, 'white');
    this.brownBuf = this.makeNoise(4, 'brown');
    this.voices = 0;
    this.voiceMode = 'auto';
    this.naturalVoice = null;
    this.maleVoice = null;
    this.badVoices = new Set();
    this.pickVoice();
    this.bank = {};
    this.setVolumes({ master: 0.8, music: 0.6, sfx: 0.9 });
  }

  // Los personajes hablan con una voz en castellano del navegador, así se
  // entiende lo que dicen. Se elige la mejor: las neuronales (las "naturales"
  // de Edge, las de Google en Chrome) y, entre ellas, las rioplatenses y las
  // latinas antes que las de España. Si no hay ninguna, quedan los murmullos.
  pickVoice() {
    if (!('speechSynthesis' in window)) return;
    this.chooseVoice();
    speechSynthesis.onvoiceschanged = () => this.chooseVoice();
  }

  chooseVoice() {
    let all = [];
    try {
      all = speechSynthesis.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang) && !this.badVoices.has(v.name));
    } catch {
      /* sin voces */
    }
    const score = (v) =>
      (/natural|neural|online/i.test(v.name) ? 100 : /google/i.test(v.name) ? 70 : 0) +
      (/es[-_](AR|UY)/i.test(v.lang) ? 30 : /es[-_](MX|US|419|CO|CL|PE|VE)/i.test(v.lang) ? 20 : 10) +
      (v.localService ? 0 : 5);
    const male = (v) => /tom[aá]s|ra[uú]l|pablo|jorge|[aá]lvaro|dar[ií]o|gonzalo|mateo|gerardo|lorenzo|andr[eé]s|emilio|federico|sergio|carlos|juan|diego|alonso|enrique|luciano|alex|male|hombre/i.test(v.name);
    all.sort((a, b) => score(b) - score(a));
    this.voiceList = all;
    this.naturalVoice = all[0] || null;
    // casi todos los personajes son hombres: una voz de hombre si hay alguna aceptable
    this.maleVoice = all.find((v) => male(v) && score(v) >= score(all[0]) - 80) || this.naturalVoice;
    this.onVoices?.();
  }

  // La voz elegida a mano en las opciones ("v:<nombre>"), o la automática.
  voiceFor(speaker) {
    if (this.voiceMode.startsWith('v:')) {
      const v = this.voiceList?.find((x) => x.name === this.voiceMode.slice(2));
      if (v) return v;
    }
    return speaker === 'taza' ? this.naturalVoice : this.maleVoice;
  }

  get useNatural() {
    return this.voiceMode !== 'murmur' && this.voiceMode !== 'off' && !!this.naturalVoice;
  }

  // Banco de sonidos de zombie: varias tomas de cada tipo, generadas una vez.
  buildBank() {
    const plan = { moan: 10, groan: 8, breath: 6, snarl: 8, scream: 6, death: 8, boss: 3 };
    for (const [kind, n] of Object.entries(plan)) {
      this.bank[kind] = [];
      for (let i = 0; i < n; i++) this.bank[kind].push(this.toBuffer(zombieSound(kind).data));
    }
  }

  toBuffer(data) {
    const b = this.ctx.createBuffer(1, data.length, RATE);
    b.copyToChannel(data, 0);
    return b;
  }

  playBuffer(buf, { pos = null, gain = 1, reverb = 0.2, rate = 1, bus = null, filter = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const o = this.out({ pos, gain, reverb, bus });
    let node = src;
    if (filter) {
      for (const f of filter) {
        const bq = c.createBiquadFilter();
        bq.type = f.type;
        bq.frequency.value = f.freq;
        bq.Q.value = f.q ?? 0.7;
        node.connect(bq);
        node = bq;
      }
    }
    node.connect(o);
    src.start();
    return src;
  }

  setVolumes({ master, music, sfx }) {
    if (master != null) this.master.gain.value = master;
    if (music != null) this.music.gain.value = music;
    if (sfx != null) {
      this.sfx.gain.value = sfx;
      this.voice.gain.value = sfx;
    }
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  get now() {
    return this.ctx.currentTime;
  }

  makeNoise(seconds, color) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setListener(pos, fwd) {
    const l = this.ctx.listener;
    const t = this.now;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // Punto de salida: opcionalmente espacializado y con envío a reverb.
  out({ pos = null, reverb = 0.2, gain = 1, bus = null } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    let node = g;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.2;
      p.rolloffFactor = 1.3;
      p.maxDistance = 70;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      node = p;
    }
    node.connect(bus || this.sfx);
    if (reverb > 0) {
      const s = c.createGain();
      s.gain.value = reverb;
      node.connect(s).connect(this.reverb);
    }
    return g;
  }

  noise(dest, { t = this.now, dur = 0.2, type = 'lowpass', freq = 1000, freqEnd, q = 0.7, gain = 1, attack = 0.002, brown = false }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return { src, f, g };
  }

  tone(dest, { t = this.now, dur = 0.2, type = 'sine', freq = 440, freqEnd, gain = 0.5, attack = 0.004, detune = 0, release }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release || dur));
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + (release || dur) + 0.05);
    return { o, g };
  }

  // ---------- armas ----------
  shot(kind, pos = null, upgraded = false) {
    const t = this.now;
    if (kind === 'ray') return this.rayShot(pos, upgraded);
    if (kind === 'tesla') return this.tesla(pos);
    if (kind === 'ice') return this.iceShot(pos);
    if (kind === 'thunder') return this.thunder(pos);
    if (kind === 'launcher') return this.launcher(pos);
    if (kind === 'bolt') return this.boltShot(pos);
    if (kind === 'stream') return this.streamShot(pos, upgraded);
    const p = SHOTS[kind] || SHOTS.pistol;
    const o = this.out({ pos, reverb: p.tail, gain: p.gain * (0.9 + Math.random() * 0.2) });
    this.noise(o, { t, dur: p.dur, freq: p.body * (0.9 + Math.random() * 0.2), freqEnd: 300, q: 0.9, gain: 0.9 });
    if (p.crack) this.noise(o, { t, dur: 0.04, type: 'highpass', freq: 3000, gain: p.crack * 0.6 });
    this.tone(o, { t, dur: 0.18, freq: p.thump, freqEnd: 35, gain: 0.8 });
    if (upgraded) this.tone(o, { t, dur: 0.25, type: 'square', freq: 900, freqEnd: 120, gain: 0.08 });
    if (p.wobble) this.tone(o, { t, dur: 0.25, type: 'sawtooth', freq: 70 + Math.random() * 30, freqEnd: 40, gain: 0.25 });
    if (p.pump) this.mech(t + 0.32, [0.0, 0.12]);
    if (p.bolt) this.mech(t + 0.5, [0.0, 0.18, 0.3]);
    // chorrito de vapor: el mate escupe agua
    this.noise(o, { t: t + 0.02, dur: 0.22, type: 'bandpass', freq: 5200, freqEnd: 2000, q: 2, gain: 0.08 });
  }

  // Graznido de cuervo: "kraa" áspero, una o varias veces.
  caw(pos, n = 1) {
    const o = this.out({ pos, reverb: 0.5, gain: 0.35 });
    for (let i = 0; i < n; i++) {
      const t = this.now + i * (0.3 + Math.random() * 0.25);
      const f = 560 + Math.random() * 120;
      this.tone(o, { t, dur: 0.24, type: 'sawtooth', freq: f, freqEnd: f * 0.72, gain: 0.18, attack: 0.01 });
      this.tone(o, { t, dur: 0.24, type: 'square', freq: f * 1.51, freqEnd: f * 1.1, gain: 0.05, attack: 0.01 });
      this.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 1400, q: 2.5, gain: 0.25 });
    }
  }

  // Llamado de la manada de carpinchos: silbidos agudos que suben y bajan,
  // con un eco de otros que contestan (lejano si no tiene posición).
  howl(pos) {
    const o = this.out({ pos, reverb: 0.85, gain: pos ? 0.4 : 0.28 });
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = this.now + 0.02 + i * (0.22 + Math.random() * 0.2);
      const f = 1500 + Math.random() * 600;
      this.tone(o, { t, dur: 0.16, type: 'sine', freq: f, freqEnd: f * (Math.random() < 0.5 ? 1.35 : 0.75), gain: 0.2, attack: 0.02 });
      this.tone(o, { t, dur: 0.16, type: 'triangle', freq: f * 2, freqEnd: f * 2.2, gain: 0.03, attack: 0.02 });
    }
  }

  // "Ladrido" del carpincho: un resoplido grave y cortito, con chasquido de dientes.
  bark(pos) {
    const o = this.out({ pos, reverb: 0.3, gain: 0.5 });
    const t = this.now;
    const f = 150 + Math.random() * 40;
    this.tone(o, { t, dur: 0.14, type: 'sawtooth', freq: f, freqEnd: f * 0.7, gain: 0.25 });
    this.noise(o, { t, dur: 0.13, type: 'lowpass', freq: 700, gain: 0.45, brown: true });
    // chasquidos de dientes
    for (let i = 0; i < 3; i++) this.noise(o, { t: t + 0.18 + i * 0.07, dur: 0.015, type: 'highpass', freq: 3500, gain: 0.35 });
  }

  // Chillido del carpincho al caer: silbido cortado que se apaga.
  yelp(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.4, gain: 0.4 });
    this.tone(o, { t, dur: 0.35, type: 'sine', freq: 2100, freqEnd: 700, gain: 0.25 });
    this.noise(o, { t, dur: 0.15, type: 'bandpass', freq: 2400, q: 3, gain: 0.12 });
  }

  // Osito de juguete que revienta: el "cuic" del fuelle.
  squeakToy(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.3, gain: 0.5 });
    this.tone(o, { t, dur: 0.18, type: 'square', freq: 900, freqEnd: 1500, gain: 0.08 });
    this.tone(o, { t: t + 0.16, dur: 0.22, type: 'square', freq: 1500, freqEnd: 700, gain: 0.07 });
    this.noise(o, { t, dur: 0.25, type: 'bandpass', freq: 2500, q: 1, gain: 0.15 });
  }

  // "La zamba del osito": caja de música, guitarra, bombo legüero y un coro
  // fantasma, en re menor y 6/8. Devuelve cuánto dura.
  secretSong() {
    const c = this.ctx;
    const t0 = this.now + 0.3;
    const e = 0.19;
    const bar = 6 * e;
    const o = this.out({ gain: 0.8, reverb: 0.55, bus: this.music });
    const pad = c.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 900;
    pad.connect(o);
    const A = [
      [[74, 3], [77, 2], [76, 1]], [[74, 2], [72, 1], [74, 3]], [[73, 3], [76, 2], [73, 1]], [[69, 6]],
      [[70, 3], [74, 2], [72, 1]], [[74, 2], [77, 1], [81, 3]], [[79, 2], [77, 1], [76, 2], [73, 1]], [[74, 6]],
    ];
    const B = [
      [[77, 3], [81, 2], [79, 1]], [[79, 2], [77, 1], [76, 3]], [[77, 3], [74, 2], [77, 1]], [[76, 6]],
      [[74, 3], [77, 2], [74, 1]], [[72, 2], [74, 1], [77, 3]], [[79, 2], [77, 1], [74, 2], [70, 1]], [[73, 3], [69, 3]],
    ];
    const CA = ['Dm', 'Dm', 'A', 'A', 'Gm', 'Dm', 'A', 'Dm'];
    const CB = ['F', 'C', 'Dm', 'A', 'Bb', 'F', 'Gm', 'A'];
    const CH = { Dm: [50, 62, 65, 69], A: [45, 61, 64, 67], Gm: [43, 58, 62, 67], F: [41, 60, 65, 69], C: [48, 60, 64, 67], Bb: [46, 62, 65, 70] };
    // intro de guitarra, A, B, A, B, A y el final
    const form = [
      ['intro', null, ['Dm', 'A']],
      ['A', A, CA],
      ['B', B, CB],
      ['A', A, CA],
      ['B', B, CB],
      ['A', A, CA],
      ['end', null, ['Dm', 'Dm']],
    ];
    let t = t0;
    for (const [, mel, chords] of form) {
      chords.forEach((ch, i) => {
        const bt = t + i * bar;
        const [root, ...tones] = CH[ch];
        // guitarra: bajo en el 1 y arpegio en las otras corcheas
        this.tone(o, { t: bt, dur: bar * 0.9, type: 'triangle', freq: midi(root), gain: 0.28, release: 0.4 });
        [tones[0], tones[1], tones[2], tones[1], tones[0]].forEach((n, k) => {
          this.tone(o, { t: bt + (k + 1) * e, dur: e * 1.6, type: 'triangle', freq: midi(n - 12), gain: 0.07, attack: 0.003, release: 0.3 });
        });
        // bombo legüero: "bom" en 1 y 4, "tac" del aro en 3 y 6
        for (const k of [0, 3]) this.tone(o, { t: bt + k * e, dur: 0.3, freq: 70, freqEnd: 45, gain: 0.45 });
        for (const k of [2, 5]) this.noise(o, { t: bt + k * e, dur: 0.05, type: 'bandpass', freq: 1800, q: 2, gain: 0.25 });
        // coro fantasma de fondo
        for (const n of tones) this.tone(pad, { t: bt, dur: bar, type: 'sawtooth', freq: midi(n), gain: 0.018, attack: 0.5, detune: (n % 3) * 6 - 6, release: 0.6 });
        // caja de música con la melodía
        if (mel) {
          let mt = bt;
          for (const [n, d] of mel[i]) {
            this.tone(o, { t: mt, dur: d * e, freq: midi(n + 12), gain: 0.16, attack: 0.002, release: 1.1 });
            this.tone(o, { t: mt, dur: d * e * 0.5, freq: midi(n + 24), gain: 0.04, attack: 0.002, release: 0.6 });
            mt += d * e;
          }
        }
      });
      t += chords.length * bar;
    }
    // nota final larga de la caja de música
    this.tone(o, { t, dur: 2.5, freq: midi(74 + 12), gain: 0.14, attack: 0.002, release: 2 });
    return t - t0 + 2.5;
  }

  // Chillido de rata: dos o tres piquitos agudos.
  squeak(pos) {
    const o = this.out({ pos, reverb: 0.1, gain: 0.3 });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = this.now + i * 0.09;
      this.tone(o, { t, dur: 0.05, type: 'sine', freq: 3600 + Math.random() * 900, freqEnd: 4400, gain: 0.12 });
    }
  }

  // Chorro hirviendo: siseo de vapor y burbujeo grave.
  streamShot(pos, up) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.2, gain: 0.5 });
    this.noise(o, { t, dur: 0.13, type: 'bandpass', freq: up ? 3600 : 3000, freqEnd: 2400, q: 1.2, gain: 0.35 });
    this.tone(o, { t, dur: 0.1, type: 'sine', freq: 90 + Math.random() * 40, freqEnd: 60, gain: 0.25 });
  }

  mech(t, offsets) {
    const o = this.out({ gain: 0.5, reverb: 0.05 });
    for (const d of offsets) {
      this.noise(o, { t: t + d, dur: 0.035, type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 4, gain: 0.7 });
      this.tone(o, { t: t + d, dur: 0.03, type: 'square', freq: 1800, gain: 0.05 });
    }
  }

  rayShot(pos, up) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.4, gain: 0.7 });
    const base = up ? 1900 : 1500;
    this.tone(o, { t, dur: 0.28, type: 'square', freq: base, freqEnd: 180, gain: 0.25 });
    this.tone(o, { t, dur: 0.22, type: 'sawtooth', freq: base * 1.5, freqEnd: 300, gain: 0.12, detune: 12 });
    this.noise(o, { t, dur: 0.1, type: 'bandpass', freq: 4000, q: 3, gain: 0.3 });
  }

  tesla(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.5, gain: 0.9 });
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 90;
    const lfo = c.createOscillator();
    lfo.frequency.value = 37;
    const lg = c.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 1);
    lfo.stop(t + 1);
    for (let i = 0; i < 8; i++) this.noise(o, { t: t + i * 0.08 + Math.random() * 0.04, dur: 0.06, type: 'highpass', freq: 2500, gain: 0.5 });
    this.tone(o, { t, dur: 0.5, freq: 60, freqEnd: 30, gain: 0.6 });
  }

  zap(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.3, gain: 0.5 });
    this.noise(o, { t, dur: 0.18, type: 'highpass', freq: 3000, gain: 0.5 });
    this.tone(o, { t, dur: 0.2, type: 'sawtooth', freq: 180, freqEnd: 90, gain: 0.2 });
  }

  iceShot(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.5, gain: 0.8 });
    this.noise(o, { t, dur: 0.6, type: 'bandpass', freq: 800, freqEnd: 5000, q: 1.2, gain: 0.6 });
    for (let i = 0; i < 6; i++) this.tone(o, { t: t + 0.05 + i * 0.05, dur: 0.3, freq: 2500 + Math.random() * 2500, gain: 0.06 });
  }

  shatter(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.3, gain: 0.7 });
    this.noise(o, { t, dur: 0.35, type: 'highpass', freq: 2500, gain: 0.6 });
    for (let i = 0; i < 5; i++) this.tone(o, { t: t + Math.random() * 0.15, dur: 0.2, type: 'triangle', freq: 3000 + Math.random() * 3000, gain: 0.08 });
  }

  thunder(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.8, gain: 1.4 });
    this.noise(o, { t, dur: 1.3, freq: 400, freqEnd: 60, q: 0.8, gain: 1, brown: true });
    this.noise(o, { t, dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 2500, q: 0.6, gain: 0.5 });
    this.tone(o, { t, dur: 1, freq: 70, freqEnd: 22, gain: 1 });
  }

  launcher(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.3, gain: 0.8 });
    this.tone(o, { t, dur: 0.18, freq: 220, freqEnd: 70, gain: 0.8 });
    this.noise(o, { t, dur: 0.15, freq: 900, freqEnd: 200, gain: 0.6 });
  }

  boltShot(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.2, gain: 0.7 });
    this.tone(o, { t, dur: 0.4, type: 'triangle', freq: 320, freqEnd: 140, gain: 0.5 });
    this.noise(o, { t, dur: 0.25, type: 'bandpass', freq: 1800, freqEnd: 500, q: 2, gain: 0.3 });
  }

  explosion(pos, big = 1) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.7, gain: 1.3 * big });
    this.noise(o, { t, dur: 1.1, freq: 1800, freqEnd: 80, q: 0.5, gain: 1, brown: true });
    this.noise(o, { t, dur: 0.3, freq: 5000, freqEnd: 400, gain: 0.5 });
    this.tone(o, { t, dur: 0.8, freq: 90, freqEnd: 25, gain: 1 });
    for (let i = 0; i < 6; i++) this.noise(o, { t: t + 0.2 + Math.random() * 0.6, dur: 0.05, type: 'bandpass', freq: 2000 + Math.random() * 2000, q: 3, gain: 0.1 });
  }

  empty() {
    const o = this.out({ gain: 0.4, reverb: 0 });
    this.noise(o, { dur: 0.03, type: 'bandpass', freq: 3000, q: 6, gain: 0.8 });
  }

  // Recargar = cebar: el termo sirve agua en el mate.
  pour(duration) {
    // el agua corre mientras el termo está inclinado (30% a 74% de la recarga)
    const t = this.now + duration * 0.3;
    const o = this.out({ gain: 0.35, reverb: 0.05 });
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    const flow = duration * 0.44;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500, t + flow);
    const g = c.createGain();
    const lfo = c.createOscillator();
    lfo.frequency.value = 23;
    const lg = c.createGain();
    lg.gain.value = 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.06);
    g.gain.setValueAtTime(0.6, t + flow - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + flow);
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(o);
    src.start(t);
    lfo.start(t);
    src.stop(t + duration);
    lfo.stop(t + duration);
    this.mech(this.now + 0.05, [0]);
    this.mech(this.now + duration * 0.85, [0, 0.1]);
    return { stop: () => { try { src.stop(); lfo.stop(); } catch { /* ya terminó */ } } };
  }

  shell() {
    const o = this.out({ gain: 0.4, reverb: 0 });
    this.noise(o, { dur: 0.06, type: 'bandpass', freq: 1400, q: 3, gain: 0.8 });
  }

  // Sorbo de mate (tomar un perk).
  sip() {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.05 });
    for (let i = 0; i < 3; i++) this.noise(o, { t: t + 0.2 + i * 0.28, dur: 0.22, type: 'bandpass', freq: 900, freqEnd: 1600, q: 5, gain: 0.5 });
    // el ruidito final de la bombilla cuando se termina el agua
    this.noise(o, { t: t + 1.05, dur: 0.35, type: 'bandpass', freq: 2200, freqEnd: 4200, q: 8, gain: 0.7 });
    this.tone(o, { t: t + 1.45, dur: 0.12, freq: 140, freqEnd: 90, gain: 0.3 });
  }

  hitmarker(head) {
    const o = this.out({ gain: head ? 0.35 : 0.2, reverb: 0 });
    this.tone(o, { dur: 0.05, type: 'square', freq: head ? 2200 : 1600, gain: 0.3 });
    if (head) this.noise(o, { dur: 0.08, type: 'bandpass', freq: 800, q: 2, gain: 0.5 });
  }

  squish(pos) {
    const o = this.out({ pos, gain: 0.5, reverb: 0.1 });
    this.noise(o, { dur: 0.18, type: 'lowpass', freq: 900, freqEnd: 200, gain: 0.8 });
  }

  knife(hit) {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.05 });
    this.noise(o, { t, dur: 0.18, type: 'bandpass', freq: 1200, freqEnd: 3500, q: 2, gain: 0.5 });
    if (hit) this.noise(o, { t: t + 0.12, dur: 0.12, freq: 700, freqEnd: 150, gain: 0.9 });
  }

  footstep(surface, loud = 1) {
    const o = this.out({ gain: 0.18 * loud, reverb: 0.05 });
    const f = { dirt: 500, wood: 700, tile: 1600, concrete: 1300 }[surface] || 900;
    this.noise(o, { dur: 0.09, freq: f * (0.8 + Math.random() * 0.4), q: 1, gain: 0.8 });
    if (surface === 'wood') this.tone(o, { dur: 0.08, freq: 120, freqEnd: 70, gain: 0.3 });
  }

  land() {
    const o = this.out({ gain: 0.35, reverb: 0.05 });
    this.noise(o, { dur: 0.15, freq: 600, freqEnd: 150, gain: 0.8 });
  }

  hurt() {
    const t = this.now;
    const o = this.out({ gain: 0.6, reverb: 0.05 });
    this.noise(o, { t, dur: 0.2, freq: 500, freqEnd: 150, gain: 0.8 });
    this.tone(o, { t, dur: 0.25, type: 'sawtooth', freq: 160, freqEnd: 110, gain: 0.15 });
  }

  // Latido "lub-dub": golpe grave con cuerpo, sin pasar por el filtro de los oídos tapados.
  heartbeat() {
    const t = this.now;
    const o = this.out({ gain: 1.1 * this.master.gain.value, reverb: 0, bus: this.body });
    for (const [d, k] of [[0, 1], [0.2, 0.62]]) {
      this.tone(o, { t: t + d, dur: 0.16, freq: 58 * (k < 1 ? 1.12 : 1), freqEnd: 32, gain: 0.95 * k, attack: 0.008 });
      this.tone(o, { t: t + d, dur: 0.09, freq: 110, freqEnd: 60, gain: 0.25 * k, attack: 0.004 });
      this.noise(o, { t: t + d, dur: 0.12, freq: 180, freqEnd: 60, gain: 0.5 * k, brown: true, attack: 0.006 });
    }
  }

  // Estado crítico: oídos tapados, zumbido al entrar y respiración agitada.
  setCritical(on) {
    const t = this.now;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(this.muffle.frequency.value, t);
    this.muffle.frequency.exponentialRampToValueAtTime(on ? 650 : 20000, t + (on ? 0.25 : 1.2));
    clearInterval(this.breathTimer);
    this.breathTimer = null;
    if (!on) return;
    const o = this.out({ gain: 0.5 * this.master.gain.value, reverb: 0, bus: this.body });
    this.tone(o, { t, dur: 2.2, freq: 6200, gain: 0.05, attack: 0.05 });
    let inhale = true;
    const breathe = () => {
      if (this.ctx.state !== 'running') return;
      const b = this.out({ gain: 0.35 * this.master.gain.value, reverb: 0, bus: this.body });
      this.noise(b, { dur: inhale ? 0.55 : 0.7, type: 'bandpass', freq: inhale ? 1100 : 750, freqEnd: inhale ? 1600 : 500, q: 1.4, gain: 0.45, attack: inhale ? 0.25 : 0.06 });
      inhale = !inhale;
    };
    breathe();
    this.breathTimer = setInterval(breathe, 720);
  }

  // ---------- zombies ----------
  // kind: idle (gemido, quejido o respiración), attack, scream (corredores), death, boss.
  growl(pos, kind = 'idle') {
    if (this.voices > 9) return;
    const pickFrom = (k) => {
      const list = this.bank[k];
      return list?.length ? list[Math.floor(Math.random() * list.length)] : null;
    };
    let buf;
    let gain = 0.8;
    if (kind === 'idle') {
      const r = Math.random();
      buf = pickFrom(r < 0.5 ? 'moan' : r < 0.82 ? 'groan' : 'breath');
      gain = 0.75;
    } else if (kind === 'attack') {
      buf = pickFrom('snarl');
      gain = 1;
    } else {
      buf = pickFrom(kind);
      gain = kind === 'boss' ? 1.6 : kind === 'scream' ? 1 : 0.9;
    }
    if (!buf) return;
    // un toque más bajos en general y bastante más afuera (no hay paredes que los tapen)
    gain *= this.outdoor ? 0.62 : 0.85;
    this.voices++;
    const src = this.playBuffer(buf, { pos, gain, reverb: kind === 'boss' ? 0.5 : 0.28, rate: 0.9 + Math.random() * 0.2 });
    src.onended = () => {
      this.voices--;
    };
  }

  // Golpe contra el escudo de la espalda: madera y chapa.
  shieldHit() {
    const t = this.now;
    const o = this.out({ gain: 0.7, reverb: 0.1 });
    this.noise(o, { t, dur: 0.12, type: 'bandpass', freq: 900, q: 2, gain: 0.8 });
    this.tone(o, { t, dur: 0.35, type: 'triangle', freq: 420, freqEnd: 380, gain: 0.25 });
    this.tone(o, { t, dur: 0.15, freq: 120, freqEnd: 70, gain: 0.5 });
  }

  // Arrastre de pies y ropa de un zombie cerca.
  shuffle(pos) {
    const o = this.out({ pos, gain: 0.35, reverb: 0.05 });
    this.noise(o, { dur: 0.22, type: 'bandpass', freq: 500 + Math.random() * 300, q: 0.8, gain: 0.6, attack: 0.05 });
  }

  boardTear(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.9, reverb: 0.2 });
    this.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 600, freqEnd: 250, q: 1.5, gain: 0.9 });
    this.tone(o, { t, dur: 0.25, type: 'triangle', freq: 180, freqEnd: 90, gain: 0.3 });
    this.noise(o, { t: t + 0.25, dur: 0.12, freq: 900, gain: 0.4 });
  }

  boardRepair(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.8, reverb: 0.15 });
    this.tone(o, { t, dur: 0.12, freq: 220, freqEnd: 110, gain: 0.5 });
    this.noise(o, { t, dur: 0.1, freq: 1000, gain: 0.5 });
    this.noise(o, { t: t + 0.18, dur: 0.05, type: 'bandpass', freq: 2500, q: 4, gain: 0.5 });
  }

  rise(pos) {
    const o = this.out({ pos, gain: 0.8, reverb: 0.2 });
    this.noise(o, { dur: 1.2, freq: 400, freqEnd: 150, gain: 0.6, brown: true, attack: 0.2 });
  }

  // ---------- compras y máquinas ----------
  purchase() {
    const t = this.now;
    const o = this.out({ gain: 0.45, reverb: 0.1 });
    this.noise(o, { t, dur: 0.06, type: 'bandpass', freq: 2000, q: 3, gain: 0.6 });
    this.tone(o, { t: t + 0.05, dur: 0.5, type: 'triangle', freq: midi(88), gain: 0.4 });
    this.tone(o, { t: t + 0.12, dur: 0.6, type: 'triangle', freq: midi(93), gain: 0.35 });
  }

  deny() {
    const o = this.out({ gain: 0.35, reverb: 0 });
    this.tone(o, { dur: 0.25, type: 'square', freq: 110, gain: 0.3 });
    this.tone(o, { dur: 0.25, type: 'square', freq: 116, gain: 0.3 });
  }

  door(pos, debris) {
    const t = this.now;
    const o = this.out({ pos, gain: 1, reverb: 0.4 });
    if (debris) {
      for (let i = 0; i < 8; i++) this.noise(o, { t: t + i * 0.07, dur: 0.2, freq: 800, freqEnd: 150, gain: 0.6 });
      this.tone(o, { t, dur: 0.6, freq: 80, freqEnd: 30, gain: 0.6 });
    } else {
      this.noise(o, { t, dur: 0.9, type: 'bandpass', freq: 300, freqEnd: 700, q: 6, gain: 0.5 });
      this.tone(o, { t, dur: 0.8, type: 'sawtooth', freq: 90, freqEnd: 160, gain: 0.06 });
      this.noise(o, { t: t + 0.85, dur: 0.3, freq: 500, freqEnd: 100, gain: 0.8 });
    }
  }

  tune(notes, { wave = 'triangle', bpm = 160, cutoff = 3000, gain = 0.18, pos = null, t0 = this.now, bus = null } = {}) {
    const beat = 60 / bpm;
    const o = this.out({ pos, gain, reverb: 0.3, bus: bus || this.music });
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.connect(o);
    let t = t0;
    for (const [n, d] of notes) {
      if (n > 0) {
        this.tone(f, { t, dur: d * beat * 0.95, type: wave, freq: midi(n), gain: 0.5, attack: 0.01 });
        this.tone(f, { t, dur: d * beat * 0.95, type: wave, freq: midi(n - 12), gain: 0.2, attack: 0.01, detune: 6 });
      }
      t += d * beat;
    }
    return t - t0;
  }

  perkJingle(id, pos = null) {
    const tn = PERK_TUNES[id];
    if (!tn) return 0;
    return this.tune(tn.notes, { wave: tn.wave, bpm: tn.bpm, cutoff: tn.cutoff, pos, gain: pos ? 0.35 : 0.2 });
  }

  boxOpen(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.9, reverb: 0.4 });
    this.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 400, freqEnd: 800, q: 5, gain: 0.5 });
    // cajita de música
    const beat = 0.3;
    let tt = t + 0.3;
    for (const [n, d] of BOX_TUNE) {
      this.tone(o, { t: tt, dur: 0.5, freq: midi(n), gain: 0.25, attack: 0.002, release: 0.9 });
      this.tone(o, { t: tt, dur: 0.3, freq: midi(n + 12), gain: 0.06, attack: 0.002 });
      tt += d * beat;
    }
  }

  // La taza de café se ríe de vos.
  laugh(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 1.2, reverb: 0.6 });
    const c = this.ctx;
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.26;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190 - i * 12, tt);
      osc.frequency.linearRampToValueAtTime(150 - i * 12, tt + 0.2);
      const f1 = c.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 800;
      f1.Q.value = 5;
      const f2 = c.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1250;
      f2.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.7, tt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(o);
      this.noise(o, { t: tt, dur: 0.06, type: 'highpass', freq: 2000, gain: 0.3 });
      osc.start(tt);
      osc.stop(tt + 0.25);
    }
  }

  whoosh(pos) {
    const o = this.out({ pos, gain: 0.8, reverb: 0.4 });
    this.noise(o, { dur: 1.2, type: 'bandpass', freq: 300, freqEnd: 3000, q: 1, gain: 0.7, attack: 0.3 });
  }

  pap(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.9, reverb: 0.4 });
    this.noise(o, { t, dur: 3.2, freq: 200, q: 1, gain: 0.5, brown: true, attack: 0.3 });
    for (let i = 0; i < 10; i++) this.noise(o, { t: t + 0.3 + i * 0.28, dur: 0.12, type: 'bandpass', freq: 1500, q: 4, gain: 0.3 });
    this.noise(o, { t: t + 2.6, dur: 0.9, type: 'highpass', freq: 3000, gain: 0.3 });
    this.tone(o, { t: t + 3.3, dur: 1.5, type: 'triangle', freq: midi(84), gain: 0.4 });
    this.tone(o, { t: t + 3.3, dur: 1.5, type: 'triangle', freq: midi(91), gain: 0.3 });
  }

  powerOn(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 1.2, reverb: 0.8 });
    this.noise(o, { t, dur: 0.4, freq: 600, freqEnd: 80, gain: 1 });
    this.tone(o, { t: t + 0.2, dur: 4, type: 'sawtooth', freq: 30, freqEnd: 60, gain: 0.25, attack: 1.5 });
    const all = this.out({ gain: 0.6, reverb: 0.8 });
    this.tone(all, { t: t + 0.6, dur: 3, type: 'sawtooth', freq: 55, freqEnd: 110, gain: 0.15, attack: 1 });
  }

  powerupSpawn(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.7, reverb: 0.5 });
    for (let i = 0; i < 6; i++) this.tone(o, { t: t + i * 0.06, dur: 0.4, freq: midi(84 + i * 3), gain: 0.2 });
  }

  powerupGrab() {
    const t = this.now;
    const o = this.out({ gain: 0.6, reverb: 0.4 });
    [72, 76, 79, 84].forEach((n, i) => this.tone(o, { t: t + i * 0.05, dur: 0.6, type: 'triangle', freq: midi(n), gain: 0.3 }));
  }

  // Un personaje habla. Con una voz en castellano del navegador se entiende
  // todo; si no hay, murmullos sintetizados que siguen el ritmo del texto.
  // Devuelve cuánto dura (estimado), para los subtítulos y lo que sigue.
  say(text, speaker = 'abuelo') {
    const pauses = (text.match(/[,.;:!?…]/g) || []).length;
    const talk = (rate) => Math.max(1.6, (text.length * 0.064 + pauses * 0.22) / rate + 0.3);
    if (this.voiceMode === 'off') return talk(1);
    if (this.useNatural) {
      try {
        // tono y velocidad de cada personaje (las voces neuronales a veces ignoran el tono)
        const V = {
          abuelo: { rate: 0.9, pitch: 0.8 },
          anunciador: { rate: 0.82, pitch: 0.3 },
          capataz: { rate: 0.95, pitch: 0.55 },
          capatazJoven: { rate: 1, pitch: 0.95 },
          radio: { rate: 1.03, pitch: 1 },
          taza: { rate: 1.08, pitch: 1.5 },
        }[speaker] || { rate: 1, pitch: 1 };
        const voice = this.voiceFor(speaker);
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = V.rate;
        u.pitch = V.pitch;
        u.volume = Math.min(1, this.master.gain.value * this.voice.gain.value * 1.2);
        // si la voz falla (las de Google necesitan internet), se cambia por otra
        u.onerror = (e) => {
          if (e.error === 'interrupted' || e.error === 'canceled' || e.error === 'not-allowed') return;
          this.badVoices.add(voice.name);
          this.chooseVoice();
          this.murmur(text, speaker);
        };
        speechSynthesis.speak(u);
        return talk(V.rate);
      } catch {
        /* sigue con murmullos */
      }
    }
    return this.murmur(text, speaker);
  }

  murmur(text, speaker) {
    const { data } = speech(text, speaker);
    const buf = this.toBuffer(data);
    const fx = {
      abuelo: { reverb: 0.55, gain: 1.1 },
      anunciador: { reverb: 1.1, gain: 1.4 },
      capataz: { reverb: 0.4, gain: 1.3 },
      radio: { reverb: 0.1, gain: 1, filter: [{ type: 'highpass', freq: 450 }, { type: 'lowpass', freq: 2800 }, { type: 'peaking', freq: 1500, q: 1 }] },
      taza: { reverb: 0.5, gain: 1 },
    }[speaker] || { reverb: 0.4, gain: 1 };
    this.playBuffer(buf, { ...fx, bus: this.voice });
    return buf.duration;
  }

  announce(text) {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.6 });
    this.tone(o, { t, dur: 0.8, type: 'sawtooth', freq: 55, freqEnd: 40, gain: 0.3 });
    return this.say(text, 'anunciador');
  }

  // Radio vieja: barrido de sintonía, silbido y estática de fondo mientras habla.
  radioTune(pos, dur = 8) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.5, reverb: 0.15 });
    this.noise(o, { t, dur: 0.8, type: 'bandpass', freq: 600, freqEnd: 3000, q: 3, gain: 0.7, attack: 0.05 });
    this.tone(o, { t: t + 0.1, dur: 0.6, freq: 1800, freqEnd: 900, gain: 0.08 });
    this.noise(o, { t: t + 0.5, dur, type: 'bandpass', freq: 2200, q: 0.9, gain: 0.07, attack: 0.3 });
  }

  // Chamamé original para acordeón (bandoneón de feria), guitarra y bajo, en 6/8.
  chamame() {
    const c = this.ctx;
    const t0 = this.now + 0.2;
    const e = 0.165; // corchea
    const bus = c.createGain();
    bus.gain.value = 0.55;
    // trémolo de acordeón (voces "musette")
    const trem = c.createGain();
    trem.gain.value = 0.8;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.6;
    const lg = c.createGain();
    lg.gain.value = 0.18;
    lfo.connect(lg).connect(trem.gain);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const pk = c.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 1100;
    pk.gain.value = 5;
    trem.connect(lp).connect(pk).connect(bus);
    const o = this.out({ gain: 1, reverb: 0.35, bus: this.music });
    bus.connect(o);
    const MEL = [
      [69, 2], [72, 1], [76, 2], [74, 1], [72, 2], [71, 1], [69, 3], [67, 2], [71, 1], [74, 2], [72, 1], [71, 2], [69, 1], [67, 3],
      [69, 2], [72, 1], [76, 2], [81, 1], [79, 2], [77, 1], [76, 3], [74, 2], [76, 1], [77, 2], [74, 1], [76, 6],
      [77, 2], [76, 1], [74, 2], [72, 1], [74, 2], [72, 1], [71, 3], [72, 2], [71, 1], [69, 2], [68, 1], [69, 3], [64, 3],
      [69, 1], [71, 1], [72, 1], [74, 1], [76, 1], [77, 1], [76, 2], [74, 1], [72, 2], [71, 1], [72, 2], [71, 1], [69, 2], [68, 1], [69, 6],
    ];
    const CHORDS = ['Am', 'Am', 'G', 'G', 'Am', 'C', 'Dm', 'E', 'Dm', 'G', 'Am', 'E', 'Am', 'Dm', 'E', 'Am'];
    const ROOT = { Am: [57, 60, 64], G: [55, 59, 62], C: [60, 64, 67], Dm: [62, 65, 69], E: [64, 68, 71] };
    let end = t0;
    for (let rep = 0; rep < 2; rep++) {
      const base = t0 + rep * 16 * 6 * e;
      let t = base;
      for (const [n, d] of MEL) {
        const dur = d * e * 0.92;
        const f = midi(n);
        this.tone(trem, { t, dur, type: 'sawtooth', freq: f, gain: 0.16, attack: 0.02, detune: -9 });
        this.tone(trem, { t, dur, type: 'sawtooth', freq: f, gain: 0.16, attack: 0.02, detune: 9 });
        this.tone(trem, { t, dur, type: 'square', freq: f / 2, gain: 0.05, attack: 0.02 });
        t += d * e;
      }
      CHORDS.forEach((ch, bar) => {
        const bt = base + bar * 6 * e;
        const [r, a, b] = ROOT[ch];
        // bajo en 1 y 4, rasguido de guitarra en las otras corcheas
        this.tone(bus, { t: bt, dur: 2.5 * e, type: 'triangle', freq: midi(r - 12), gain: 0.5, attack: 0.005 });
        this.tone(bus, { t: bt + 3 * e, dur: 2.5 * e, type: 'triangle', freq: midi((bar % 2 ? a : r) - 12), gain: 0.4, attack: 0.005 });
        for (const k of [1, 2, 4, 5]) {
          for (const nn of [r, a, b]) this.tone(bus, { t: bt + k * e + (nn - r) * 0.003, dur: e * 0.8, type: 'triangle', freq: midi(nn), gain: 0.06, attack: 0.003 });
        }
      });
      end = base + 16 * 6 * e;
    }
    lfo.start(t0);
    lfo.stop(end + 1);
  }

  // ---------- música ----------
  roundStart() {
    const t = this.now + 0.05;
    const o = this.out({ gain: 0.7, reverb: 0.7, bus: this.music });
    for (let i = 0; i < 3; i++) {
      this.tone(o, { t: t + i * 0.55, dur: 0.9, freq: 65, freqEnd: 40, gain: 0.9 });
      this.noise(o, { t: t + i * 0.55, dur: 0.5, freq: 300, freqEnd: 80, gain: 0.4, brown: true });
    }
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1800, t + 2.2);
    f.frequency.linearRampToValueAtTime(400, t + 4);
    f.connect(o);
    for (const n of [45, 52, 57, 60]) {
      this.tone(f, { t: t + 1.1, dur: 3.2, type: 'sawtooth', freq: midi(n), gain: 0.12, attack: 0.8, detune: -5 });
      this.tone(f, { t: t + 1.1, dur: 3.2, type: 'sawtooth', freq: midi(n), gain: 0.12, attack: 0.8, detune: 7 });
    }
  }

  roundEnd() {
    const t = this.now + 0.05;
    const o = this.out({ gain: 0.6, reverb: 0.8, bus: this.music });
    [[76, 0], [75, 0.5], [71, 1], [69, 1.5], [64, 2.4]].forEach(([n, d]) => {
      this.tone(o, { t: t + d, dur: 1.6, freq: midi(n), gain: 0.25, release: 2.2 });
      this.tone(o, { t: t + d, dur: 1.6, type: 'triangle', freq: midi(n - 12), gain: 0.1, release: 2 });
    });
    this.tone(o, { t, dur: 5, type: 'sawtooth', freq: midi(40), gain: 0.05, attack: 1 });
  }

  gameOver() {
    const t = this.now + 0.1;
    const o = this.out({ gain: 0.7, reverb: 0.9, bus: this.music });
    for (const n of [38, 45, 50, 53]) this.tone(o, { t, dur: 7, type: 'sawtooth', freq: midi(n), gain: 0.07, attack: 1.5 });
    [0, 2, 4].forEach((d) => this.tone(o, { t: t + d, dur: 3, freq: midi(62 - d), gain: 0.25, release: 3 }));
  }

  fanfare() {
    const t = this.now + 0.1;
    const o = this.out({ gain: 0.6, reverb: 0.6, bus: this.music });
    [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [76, 0.9], [79, 1.05], [84, 1.2]].forEach(([n, d]) => {
      this.tone(o, { t: t + d, dur: 1.4, type: 'triangle', freq: midi(n), gain: 0.3 });
      this.tone(o, { t: t + d, dur: 1.4, type: 'square', freq: midi(n), gain: 0.04 });
    });
  }

  sting() {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.8, bus: this.music });
    this.tone(o, { t, dur: 2.5, freq: midi(81), gain: 0.2, release: 3 });
    this.tone(o, { t: t + 0.1, dur: 2.5, freq: midi(88), gain: 0.15, release: 3 });
    this.tone(o, { t, dur: 2, type: 'sawtooth', freq: midi(45), gain: 0.06 });
  }

  bossArrive() {
    const t = this.now;
    const o = this.out({ gain: 1, reverb: 0.8 });
    // silbato del capataz
    this.tone(o, { t, dur: 0.9, type: 'square', freq: 2600, gain: 0.12 });
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 28;
    this.tone(o, { t: t + 1, dur: 1.4, type: 'sawtooth', freq: 70, freqEnd: 45, gain: 0.35 });
    this.noise(o, { t: t + 1, dur: 1.4, freq: 600, freqEnd: 120, gain: 0.5, brown: true });
  }

  bossSlam(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 1.3, reverb: 0.6 });
    this.tone(o, { t, dur: 0.7, freq: 80, freqEnd: 25, gain: 1 });
    this.noise(o, { t, dur: 0.6, freq: 700, freqEnd: 60, gain: 0.8, brown: true });
  }

  chain(pos) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.8, reverb: 0.3 });
    for (let i = 0; i < 7; i++) this.noise(o, { t: t + i * 0.06, dur: 0.06, type: 'bandpass', freq: 3500 + Math.random() * 1500, q: 6, gain: 0.5 });
    this.noise(o, { t: t + 0.5, dur: 0.12, type: 'bandpass', freq: 1200, q: 3, gain: 0.8 });
  }

  kettle(pos, dur) {
    const t = this.now;
    const o = this.out({ pos, gain: 0.6, reverb: 0.3 });
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, t);
    osc.frequency.linearRampToValueAtTime(2300, t + dur);
    const vib = c.createOscillator();
    vib.frequency.value = 7;
    const vg = c.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.5);
    g.gain.setValueAtTime(0.3, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(o);
    this.noise(o, { t, dur, type: 'highpass', freq: 5000, gain: 0.08, attack: 0.4 });
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  // Ambiente: viento, zumbido grave y algún aullido lejano de vez en cuando.
  startAmbience() {
    if (this.amb) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.gain.linearRampToValueAtTime(0.5, this.now + 3);
    out.connect(this.music);
    const wind = c.createBufferSource();
    wind.buffer = this.brownBuf;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 400;
    wf.Q.value = 0.6;
    const wl = c.createOscillator();
    wl.frequency.value = 0.07;
    const wlg = c.createGain();
    wlg.gain.value = 250;
    wl.connect(wlg).connect(wf.frequency);
    const wg = c.createGain();
    wg.gain.value = 0.5;
    wind.connect(wf).connect(wg).connect(out);
    const d1 = c.createOscillator();
    const d2 = c.createOscillator();
    d1.frequency.value = 55;
    d2.frequency.value = 55.6;
    d1.type = d2.type = 'sawtooth';
    const df = c.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 160;
    const dg = c.createGain();
    dg.gain.value = 0.06;
    d1.connect(df);
    d2.connect(df);
    df.connect(dg).connect(out);
    [wind, wl, d1, d2].forEach((n) => n.start());
    this.amb = { out, nodes: [wind, wl, d1, d2], timer: 0 };
  }

  updateAmbience(dt) {
    if (!this.amb) return;
    this.amb.timer -= dt;
    if (this.amb.timer <= 0) {
      this.amb.timer = 14 + Math.random() * 20;
      const o = this.out({ gain: 0.25, reverb: 1, bus: this.music });
      const f = 300 + Math.random() * 200;
      this.tone(o, { dur: 3, freq: f, freqEnd: f * 0.6, gain: 0.2, attack: 1 });
      this.tone(o, { dur: 3, freq: f * 1.5, freqEnd: f * 0.9, gain: 0.08, attack: 1.2 });
    }
  }

  stopAmbience() {
    if (!this.amb) return;
    const { out, nodes } = this.amb;
    out.gain.linearRampToValueAtTime(0.0001, this.now + 1);
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }), 1200);
    this.amb = null;
  }

  // Fuego del barbacuá: crepitar en un lugar fijo.
  startFire(pos) {
    const c = this.ctx;
    const o = this.out({ pos, gain: 0.6, reverb: 0.1 });
    const src = c.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    src.connect(f).connect(o);
    src.start();
    const crackle = setInterval(() => {
      if (c.state !== 'running') return;
      this.noise(o, { dur: 0.03, type: 'highpass', freq: 2500, gain: 0.3 + Math.random() * 0.5 });
    }, 140);
    this.fire = { src, crackle };
  }

  dispose() {
    try {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    } catch {
      /* */
    }
    if (this.fire) clearInterval(this.fire.crackle);
    clearInterval(this.breathTimer);
    this.ctx.close();
  }
}
