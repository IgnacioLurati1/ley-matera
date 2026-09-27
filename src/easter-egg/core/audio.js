// Todo el sonido es sintetizado con Web Audio: disparos, zombies, jingles,
// música ambiente. Solo los truenos y el dragón son grabados (mp3 de /public/
// assets/sotano/sfx; hasta que bajan suenan los sintetizados). Las voces de los
// personajes salen del sintetizador por formantes de core/voice.js; las de los
// zombies y los bichos de las rondas especiales son grabadas (core/sfxPack.js;
// el sintetizado queda para el jefe y por si no bajaron).
import { zombieSound, speechPlan, voiceLength, renderVoice, RATE } from './voice';
import { MAP_ID } from '../config/map';
import { esterosStart, esterosEnd } from '../fx/esterosMusic';
import SfxPack from './sfxPack';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Audio.out: cuántos sonidos recientes (en LOAD_TAU segundos) aguanta con
// paneo HRTF, con eco y en total (los de posición) antes de aflojar
const LOAD_TAU = 0.8;
const LOAD_HRTF = 14;
const LOAD_VERB = 26;
const LOAD_MAX = 48;

// Los truenos grabados y cuánto se les sube o baja para que suenen parejos
// (el intenso queda unos 3 dB arriba de los medios). El del carpincho es el
// medio 1 corto, sin el chasquido y más bajo (el rayo de los que aparecen).
const SFX_DIR = '/assets/sotano/sfx/';
const THUNDERS = { 'trueno-medio-1': 1, 'trueno-medio-2': 1.08, 'trueno-intenso': 0.7, 'trueno-carpincho': 1 };
// cuántos truenos grabados pueden sonar encimados (el más viejo se apaga);
// los pedazos cortos de las armas (thunderCrack) cuentan aparte
const THUNDER_MAX = 3;
// abajo del agua (setUnder): hasta dónde pasan los agudos
const UNDER_HZ = 460;
const CRACK_MAX = 5;
// la llegada de cada jefe de ronda, grabada (audio.bossSfx): el de la torre
// suena con el de su mapa
const BOSS_SFX_ID = { capataz: 'jefe-capataz', crow: 'jefe-cuervo', alcaide: 'jefe-alcaide', caballero: 'jefe-caballero', sargento: 'jefe-sargento' };
// los otros grabados (los usa quien los necesita, de audio.sfxBuf): el
// Mateendrache (fx/DragonFire.js)
// (el Mate Meme del Challenge: el mp3 lo pone el usuario; si no está, memeShot sintetiza)
// (el Luisón: su aullido y los lobos que lo anuncian desde lejos)
const WOLVES = ['lobos-1', 'lobos-2', 'lobos-3', 'lobos-4'];
const SFX_MORE = ['dragon-rugido', 'dragon-fuego-1', 'dragon-fuego-2', ...Object.values(BOSS_SFX_ID), 'alarma-creciente', 'mate-meme', 'luison-aullido', ...WOLVES];
// el aullido grabado del Luisón arranca con un resuello, como si lo
// preparase: el aullido de verdad llega a estos segundos (luisonHowl, y las
// poses de entities/luison.js esperan eso para levantar el hocico)
export const LUISON_PREP = 0.95;

// Jingles originales de cada perk: [nota midi, duración en pulsos].
const PERK_TUNES = {
  jugg: { wave: 'sawtooth', bpm: 150, cutoff: 1800, notes: [[45, 1], [45, 0.5], [48, 0.5], [52, 1], [50, 1], [48, 0.5], [47, 0.5], [45, 2], [40, 1], [45, 2]] },
  revive: { wave: 'triangle', bpm: 170, cutoff: 5000, notes: [[72, 0.5], [76, 0.5], [79, 0.5], [84, 1], [79, 0.5], [81, 0.5], [83, 1], [84, 2], [79, 1], [84, 2]] },
  speed: { wave: 'square', bpm: 220, cutoff: 3200, notes: [[64, 0.5], [67, 0.5], [71, 0.5], [74, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [67, 0.5], [69, 1], [72, 1], [76, 2]] },
  doubletap: { wave: 'sawtooth', bpm: 180, cutoff: 2400, notes: [[57, 0.5], [57, 0.5], [64, 1], [57, 0.5], [57, 0.5], [65, 1], [64, 0.5], [62, 0.5], [60, 1], [57, 2]] },
  mule: { wave: 'square', bpm: 140, cutoff: 1500, notes: [[50, 1], [57, 0.5], [55, 0.5], [53, 1], [50, 1], [55, 1], [53, 0.5], [52, 0.5], [50, 2]] },
  deadshot: { wave: 'triangle', bpm: 110, cutoff: 3000, notes: [[67, 1], [66, 1], [65, 1], [64, 3]] },
  // el Aliento Dragónico: marcha en re menor, grave y con fuerza
  dragon: { wave: 'sawtooth', bpm: 132, cutoff: 2000, notes: [[50, 1], [53, 0.5], [57, 0.5], [62, 1.5], [60, 0.5], [58, 1], [57, 1], [55, 0.5], [57, 0.5], [50, 2]] },
  // la PhD Flopper (Flopa Hermanos): un rock de guitarra cuadrada que sube la
  // escalera del trampolín, se tira y cae resbalando nota por nota hasta el piso
  phd: { wave: 'square', bpm: 176, cutoff: 2600, notes: [[64, 0.5], [67, 0.5], [71, 0.5], [76, 1], [74, 0.5], [71, 0.5], [76, 0.5], [79, 1.5], [78, 0.25], [77, 0.25], [76, 0.25], [75, 0.25], [74, 0.25], [72, 0.25], [64, 2]] },
  // Electric Cherry (Chisporé): un punk rápido y sucio, de guitarra eléctrica
  cherry: { wave: 'sawtooth', bpm: 196, cutoff: 2400, notes: [[52, 0.5], [52, 0.5], [55, 0.5], [57, 0.5], [59, 1], [57, 0.5], [55, 0.5], [52, 1], [64, 0.5], [62, 0.5], [59, 0.5], [57, 0.5], [59, 2]] },
  // el Acuanauta (Nadadito): un chamamecito correntino, que sube y baja como el agua
  aqua: { wave: 'triangle', bpm: 138, cutoff: 2600, notes: [[67, 0.5], [71, 0.5], [74, 1], [72, 0.5], [71, 0.5], [69, 1], [67, 0.5], [69, 0.5], [71, 1.5], [74, 0.5], [76, 1], [74, 0.5], [71, 0.5], [67, 2]] },
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

// Qué voz del navegador usa cada personaje (la posición en la lista de voces
// de hombre): los que hablan juntos quedan en voces distintas.
const VOICE_SLOT = { abuelo: 0, fierro: 0, alcaide: 1, entidad: 2, gil: 1, francisco: 1, capataz: 1, capatazJoven: 2, anacleto: 2, cirilo: 3, benito: 4, nicanor: 0, espantapajaros: 3, radio: 2, anunciador: 1, caballeroFuego: 1, caballeroViento: 2, caballeroRayo: 3, caballeroHielo: 4, sargento: 0 };

export default class GameAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    // ~25 ms de colchón (el mínimo, 'interactive', son ~10): con la compu
    // cargada y pocos fps la música se entrecortaba; esto no se nota en los tiros
    this.ctx = new Ctx({ latencyHint: 0.025 });
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
    // abajo del agua (setUnder): un pasabajos grave y un poco de cuerpo en los
    // graves; afuera quedan sin efecto (a 20 kHz y en 0 dB)
    this.under = c.createBiquadFilter();
    this.under.type = 'lowpass';
    this.under.frequency.value = 20000;
    this.under.Q.value = 0.5;
    this.underLow = c.createBiquadFilter();
    this.underLow.type = 'peaking';
    this.underLow.frequency.value = 170;
    this.underLow.Q.value = 0.8;
    this.underLow.gain.value = 0;
    this.master.connect(this.muffle).connect(this.under).connect(this.underLow).connect(this.comp).connect(c.destination);
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
    // las voces de los personajes: las que suenan (para poder cortarlas), las
    // que esperan su turno y hasta cuándo habla alguien (tiempo del contexto)
    this.voiceSrc = new Set();
    this.voiceTimers = new Set();
    this.voiceEnd = 0;
    this.sayWait = 0;
    // los murmullos se renderizan en un worker (cada línea son 20-30 ms de
    // cálculo); `voiceGen` cambia con hush y tira los que estaban en camino
    this.voiceGen = 0;
    this.voiceJobs = new Map();
    this.voiceJobId = 0;
    this.voiceWorker = null;
    try {
      this.voiceWorker = new Worker(new URL('./voiceWorker.js', import.meta.url), { type: 'module' });
      this.voiceWorker.onmessage = ({ data }) => {
        const job = this.voiceJobs.get(data.id);
        this.voiceJobs.delete(data.id);
        job?.(data.data);
      };
      this.voiceWorker.onerror = () => this.voiceFallback();
    } catch {
      this.voiceWorker = null;
    }
    this.cine = false;
    this.voiceMode = 'auto';
    this.naturalVoice = null;
    this.maleVoice = null;
    this.badVoices = new Set();
    this.pickVoice();
    this.bank = {};
    this.setVolumes({ master: 0.8, music: 0.6, sfx: 0.9 });
    this.sfxBuf = {};
    this.thunders = [];
    this.cracks = [];
    this.thunderReady = this.loadSfx();
    // los grabados de zombies, bichos y especiales de cada mapa (core/sfxPack.js)
    this.pack = new SfxPack(this);
  }

  // Baja los grabados (si uno no baja, ese sigue sintetizado).
  loadSfx() {
    return Promise.all(
      [...Object.keys(THUNDERS), ...SFX_MORE].map((id) =>
        fetch(SFX_DIR + id + '.mp3')
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((ab) => this.ctx.decodeAudioData(ab))
          .then((b) => {
            this.sfxBuf[id] = b;
          })
          .catch(() => {}),
      ),
    );
  }

  // Un trueno grabado: id (THUNDERS), gain, pos (con posición), bus, when
  // (segundos desde ahora), muffle (pasabajos, Hz: lejos), dur (solo el
  // principio: se apaga en esos segundos), rate (más grave o más agudo).
  // false si todavía no bajó (el que llama hace el sintetizado).
  playThunder(id, { pos = null, gain = 1, bus = null, when = 0, muffle = 0, dur = 0, rate = 1 } = {}) {
    const buf = this.sfxBuf[id];
    if (!buf) return false;
    const now = this.now;
    const t = now + when;
    const list = dur ? 'cracks' : 'thunders';
    const L = (this[list] = this[list].filter((x) => x.end > now));
    while (L.length >= (dur ? CRACK_MAX : THUNDER_MAX)) {
      const x = L.shift();
      const from = Math.max(now, x.t);
      x.src.out.gain.cancelScheduledValues(from);
      x.src.out.gain.setTargetAtTime(0, from, 0.12);
      x.src.stop(from + 0.6);
    }
    const k = gain * THUNDERS[id];
    const src = this.playBuffer(buf, { pos, gain: k, reverb: 0.3, bus, when: t, rate, filter: muffle ? [{ type: 'lowpass', freq: muffle }] : null });
    const len = dur ? Math.min(dur, buf.duration / rate) : buf.duration / rate;
    if (dur) {
      src.out.gain.setValueAtTime(k, t);
      src.out.gain.setTargetAtTime(0, t + len * 0.45, len * 0.18);
      src.stop(t + len + 0.1);
    }
    L.push({ src, t, end: t + len });
    return true;
  }

  // Cuál: en el castillo (o si es un rayo grande) el intenso; si no, los dos
  // medios, uno y uno.
  thunderId(big = false) {
    this.thunderAlt = !this.thunderAlt;
    return big || MAP_ID === 'castillo' ? 'trueno-intenso' : this.thunderAlt ? 'trueno-medio-1' : 'trueno-medio-2';
  }

  // El principio de un trueno (el chasquido y el golpe) para los rayos que se
  // tiran seguido: el Mark III, el Wunder-Mate, el Illapa, el alma del penal,
  // los del Infierno. dur: en cuánto se apaga.
  thunderCrack(pos, { dur = 0.8, gain = 0.6, big = false } = {}) {
    return this.playThunder(this.thunderId(big), { pos, gain, dur, rate: 0.93 + Math.random() * 0.14 });
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
    // si hay varias voces de hombre buenas, cada personaje se queda con una
    this.maleVoices = all.filter((v) => male(v) && score(v) >= score(all[0]) - 80);
    if (!this.maleVoices.length && this.maleVoice) this.maleVoices = [this.maleVoice];
    this.onVoices?.();
  }

  // La voz elegida a mano en las opciones ("v:<nombre>"), o la automática.
  voiceFor(speaker) {
    if (this.voiceMode.startsWith('v:')) {
      const v = this.voiceList?.find((x) => x.name === this.voiceMode.slice(2));
      if (v) return v;
    }
    if (speaker === 'taza') return this.naturalVoice;
    // los que hablan en la misma escena caen en voces distintas (Fierro y el
    // Alcaide, el Gil y la Voz, Fierro y Francisco, los tres presos)
    const L = this.maleVoices || [];
    const slot = VOICE_SLOT[speaker] ?? 0;
    return L.length ? L[slot % L.length] : this.maleVoice;
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

  playBuffer(buf, { pos = null, gain = 1, reverb = 0.2, rate = 1, bus = null, filter = null, when = 0, offset = 0, ref } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const o = this.out({ pos, gain, reverb, bus, ref });
    let node = src;
    if (filter) {
      for (const f of filter) {
        const bq = c.createBiquadFilter();
        bq.type = f.type;
        bq.frequency.value = f.freq;
        bq.Q.value = f.q ?? 0.7;
        if (f.gain != null) bq.gain.value = f.gain;
        node.connect(bq);
        node = bq;
      }
    }
    node.connect(o);
    src.start(when, offset);
    // (la salida, para poder apagarlo de a poco)
    src.out = o;
    return src;
  }

  // voice: volumen de las voces (si no viene, van con los efectos)
  setVolumes({ master, music, sfx, voice }) {
    if (master != null) this.master.gain.value = master;
    if (music != null) this.music.gain.value = music;
    if (sfx != null) {
      this.sfx.gain.value = sfx;
      this.voice.gain.value = voice ?? sfx;
    }
    if (voice != null) this.voice.gain.value = voice;
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
    // un cuadro con la cámara en NaN (teletransportes) tira una excepción en
    // setTargetAtTime: ese cuadro se saltea y el oído queda donde estaba
    if (!Number.isFinite(pos.x + pos.y + pos.z + fwd.x + fwd.y + fwd.z)) return;
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
  // ref: a qué distancia se oye con toda su fuerza (lo grande se oye de lejos)
  out({ pos = null, reverb = 0.2, gain = 1, bus = null, ref = 2.2 } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    // cuántos sonidos arrancaron hace poco (se olvida en ~1 s). Con muchos a
    // la vez (la guerra final: mates y explosiones seguidas) el hilo de audio
    // no daba abasto y la música se trababa: primero paneo simple (el HRTF es
    // de lo más caro), después sin eco y, al tope, los de posición no suenan
    const now = c.currentTime;
    this.load = (this.load || 0) * Math.exp(-(now - (this.loadT || 0)) / LOAD_TAU) + 1;
    this.loadT = now;
    if (pos && !bus && this.load > LOAD_MAX) return g;
    if (this.load > LOAD_VERB) reverb = 0;
    let node = g;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = this.load > LOAD_HRTF ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = ref > 2.2 ? 0.8 : 1.3;
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
    // (los mates de la luz del castillo hacen sus propios ruidos)
    if (kind === 'silent') return;
    const t = this.now;
    if (kind === 'ray') return this.rayShot(pos, upgraded);
    if (kind === 'meme') return this.memeShot(pos, upgraded);
    // el rayo del Mark III: el del Rayo Matero con un pedazo de trueno
    if (kind === 'mk3') {
      this.rayShot(pos, upgraded);
      return this.thunderCrack(pos, { dur: 0.7, gain: 0.5 });
    }
    // el Wunder-Mate: la descarga y un pedazo de trueno
    if (kind === 'tesla') {
      this.tesla(pos);
      return this.thunderCrack(pos, { dur: 1.2, gain: 0.75 });
    }
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

  // El Cuervo jefe: un "KRAAA" grave, áspero y largo que se oye desde lejos.
  bigCaw(pos, n = 1) {
    const o = this.out({ pos, reverb: 0.7, gain: 1.5, ref: 14 });
    for (let i = 0; i < n; i++) {
      const t = this.now + i * (0.42 + Math.random() * 0.2);
      const f = 300 + Math.random() * 60;
      const d = 0.38 + Math.random() * 0.12;
      this.tone(o, { t, dur: d, type: 'sawtooth', freq: f * 1.15, freqEnd: f * 0.72, gain: 0.34, attack: 0.012 });
      this.tone(o, { t, dur: d, type: 'square', freq: f * 1.72, freqEnd: f * 1.1, gain: 0.1, attack: 0.012 });
      this.tone(o, { t, dur: d * 0.9, type: 'sawtooth', freq: f * 0.5, freqEnd: f * 0.38, gain: 0.16, attack: 0.02 });
      this.noise(o, { t, dur: d, type: 'bandpass', freq: 1300, freqEnd: 900, q: 2.2, gain: 0.55, attack: 0.01 });
      this.noise(o, { t, dur: d * 0.6, type: 'bandpass', freq: 2600, q: 3, gain: 0.2, attack: 0.005 });
    }
  }

  // Chillido que sube antes de tirarse en picada.
  crowScreech(pos) {
    const o = this.out({ pos, reverb: 0.8, gain: 1.4, ref: 16 });
    const t = this.now;
    this.tone(o, { t, dur: 0.9, type: 'sawtooth', freq: 480, freqEnd: 1500, gain: 0.3, attack: 0.05 });
    this.tone(o, { t, dur: 0.9, type: 'square', freq: 720, freqEnd: 2100, gain: 0.08, attack: 0.05 });
    this.noise(o, { t, dur: 0.9, type: 'bandpass', freq: 1800, freqEnd: 3200, q: 2, gain: 0.4, attack: 0.05 });
  }

  // Aletazo: un golpe de aire grave (las alas son enormes).
  wingFlap(pos, k = 1) {
    const o = this.out({ pos, reverb: 0.3, gain: 0.9 * k, ref: 9 });
    const t = this.now;
    this.noise(o, { t, dur: 0.2, type: 'lowpass', freq: 520, freqEnd: 140, gain: 0.9, attack: 0.02, brown: true });
    this.noise(o, { t: t + 0.02, dur: 0.12, type: 'bandpass', freq: 900, q: 0.8, gain: 0.25, attack: 0.02 });
  }

  // Las plumas que tira: un silbido corto que corta el aire.
  featherFwip(pos) {
    const o = this.out({ pos, reverb: 0.2, gain: 0.8, ref: 10 });
    const t = this.now;
    for (let i = 0; i < 3; i++) this.noise(o, { t: t + i * 0.035, dur: 0.14, type: 'bandpass', freq: 3500, freqEnd: 1200, q: 3, gain: 0.35, attack: 0.004 });
  }

  // Llamado de la manada de carpinchos: silbidos agudos que suben y bajan,
  // con un eco de otros que contestan (lejano si no tiene posición).
  howl(pos) {
    // (grabado: el llamado de un carpincho de la manada, donde los hay)
    if (pos && this.pack.animal('capybara', 'call', pos)) return;
    const o = this.out({ pos, reverb: 0.85, gain: pos ? 0.4 : 0.28 });
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = this.now + 0.02 + i * (0.22 + Math.random() * 0.2);
      const f = 1500 + Math.random() * 600;
      this.tone(o, { t, dur: 0.16, type: 'sine', freq: f, freqEnd: f * (Math.random() < 0.5 ? 1.35 : 0.75), gain: 0.2, attack: 0.02 });
      this.tone(o, { t, dur: 0.16, type: 'triangle', freq: f * 2, freqEnd: f * 2.2, gain: 0.03, attack: 0.02 });
    }
  }

  // Cambiar la yerba: golpecitos al volcar el mate, el crujido de la yerba
  // cayendo y el shhh del paquete llenándolo.
  yerbaChange(dur = 2.5) {
    const o = this.out({ gain: 0.7, reverb: 0.15 });
    const t = this.now;
    for (let i = 0; i < 3; i++) this.noise(o, { t: t + dur * 0.12 + i * 0.07, dur: 0.05, type: 'bandpass', freq: 900, q: 2, gain: 0.5 });
    this.noise(o, { t: t + dur * 0.14, dur: dur * 0.18, type: 'bandpass', freq: 2600, q: 0.8, gain: 0.18, attack: 0.03 });
    for (const [a, b] of [[0.4, 0.52], [0.54, 0.66]]) this.noise(o, { t: t + dur * a, dur: dur * (b - a), type: 'bandpass', freq: 3200, q: 0.6, gain: 0.22, attack: 0.05 });
    const stopAt = t + dur;
    return { stop: () => o.gain.setTargetAtTime(0, Math.min(this.now, stopAt), 0.02) };
  }

  // Recarga del Rayo Matero Mark III (mismos momentos que la animación):
  // saltan las dos cápsulas con un pop y un siseo, calzan las nuevas, el arco
  // entre las bombillas las carga con un zumbido que sube y chisporrotea, y
  // la carga se suelta con un chasquido.
  mk3Reload(dur = 2.8) {
    const o = this.out({ gain: 0.6, reverb: 0.15 });
    const t = this.now;
    for (const k of [0.13, 0.19]) {
      const a = t + dur * k;
      this.tone(o, { t: a, dur: 0.09, freq: 520, freqEnd: 140, gain: 0.35 });
      this.noise(o, { t: a, dur: 0.05, type: 'bandpass', freq: 1800, q: 3, gain: 0.5 });
      this.noise(o, { t: a + 0.02, dur: 0.35, type: 'highpass', freq: 3500, gain: 0.12, attack: 0.02 });
    }
    for (const k of [0.38, 0.43]) {
      this.noise(o, { t: t + dur * k, dur: 0.04, type: 'bandpass', freq: 2600, q: 5, gain: 0.6 });
      this.tone(o, { t: t + dur * k, dur: 0.05, type: 'square', freq: 1300, gain: 0.04 });
    }
    const a0 = t + dur * 0.58;
    const a1 = t + dur * 0.81;
    const hum = this.hold(o, { t: a0, dur: a1 - a0, type: 'sawtooth', freq: 110, gain: 0.1, attack: 0.15, release: 0.05 });
    hum.o.frequency.exponentialRampToValueAtTime(420, a1);
    const whine = this.hold(o, { t: a0, dur: a1 - a0, type: 'sine', freq: 600, gain: 0.05, attack: 0.2, release: 0.05 });
    whine.o.frequency.exponentialRampToValueAtTime(2400, a1);
    for (let x = a0; x < a1; x += 0.045 + Math.random() * 0.05) this.noise(o, { t: x, dur: 0.03, type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.18 + Math.random() * 0.15 });
    this.noise(o, { t: a1, dur: 0.18, type: 'highpass', freq: 2500, gain: 0.5 });
    this.tone(o, { t: a1, dur: 0.25, type: 'triangle', freq: 1760, freqEnd: 880, gain: 0.12 });
    this.tone(o, { t: a1, dur: 0.2, freq: 160, freqEnd: 60, gain: 0.35 });
    const stopAt = t + dur;
    return { stop: () => o.gain.setTargetAtTime(0, Math.min(this.now, stopAt), 0.02) };
  }

  // Silbido del Pombero: dos cortitos que suben y uno largo que cae, como
  // llamando desde el monte.
  pombero(pos) {
    const o = this.out({ pos, reverb: 0.7, gain: 0.55 });
    const t = this.now;
    this.tone(o, { t, dur: 0.16, type: 'sine', freq: 1700, freqEnd: 2300, gain: 0.22, attack: 0.02 });
    this.tone(o, { t: t + 0.24, dur: 0.16, type: 'sine', freq: 1750, freqEnd: 2400, gain: 0.22, attack: 0.02 });
    this.tone(o, { t: t + 0.55, dur: 0.8, type: 'sine', freq: 2500, freqEnd: 1300, gain: 0.25, attack: 0.04 });
    this.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 2200, q: 4, gain: 0.03, attack: 0.05 });
  }

  // Relincho: sube, tiembla y baja (k: 1 normal, más alto para el grito al caer).
  // act: 'spawn' o 'attack' (grabados, core/sfxPack.js; el de caer sigue sintetizado).
  neigh(pos, k = 1, act = null) {
    if (act && this.pack.animal('horse', act, pos)) return;
    const o = this.out({ pos, reverb: 0.6, gain: 0.45 * Math.min(1.4, k) });
    const t = this.now;
    const f = (420 + Math.random() * 80) * k;
    const d = 0.9 + Math.random() * 0.3;
    // el temblor del relincho: pulsos seguidos que van bajando
    for (let i = 0; i < 9; i++) {
      const ff = f * (1.25 - i * 0.07);
      this.tone(o, { t: t + i * (d / 9), dur: d / 9 + 0.03, type: 'sawtooth', freq: ff * 1.06, freqEnd: ff * 0.94, gain: 0.13 * (1 - i * 0.07), attack: 0.01 });
    }
    this.noise(o, { t, dur: d, type: 'bandpass', freq: 1800, q: 1.4, gain: 0.18, attack: 0.03 });
    // resoplido al final
    this.noise(o, { t: t + d, dur: 0.35, type: 'bandpass', freq: 700, q: 0.8, gain: 0.35, attack: 0.02 });
  }

  // Resoplido de caballo: aire por la nariz, con un aleteo grave.
  snort(pos) {
    const o = this.out({ pos, reverb: 0.25, gain: 0.5 });
    const t = this.now;
    this.noise(o, { t, dur: 0.28, type: 'bandpass', freq: 900, freqEnd: 500, q: 0.9, gain: 0.6, attack: 0.01 });
    for (let i = 0; i < 5; i++) this.tone(o, { t: t + i * 0.045, dur: 0.04, type: 'square', freq: 70, gain: 0.08 });
  }

  // Galope que se acerca: cuatro golpes por tranco, lejos.
  gallop() {
    const o = this.out({ gain: 0.5, reverb: 0.7, bus: this.music });
    const t = this.now;
    for (let s = 0; s < 10; s++) {
      for (const [dt, g] of [[0, 0.5], [0.08, 0.35], [0.2, 0.6], [0.27, 0.4]]) {
        this.tone(o, { t: t + s * 0.42 + dt, dur: 0.07, freq: 90, freqEnd: 50, gain: g * (0.4 + s * 0.06) });
        this.noise(o, { t: t + s * 0.42 + dt, dur: 0.05, freq: 500, gain: g * 0.3 * (0.4 + s * 0.06), brown: true });
      }
    }
  }

  // "Ladrido" del carpincho: un resoplido grave y cortito, con chasquido de dientes.
  // act 'attack': el carpincho que se tira encima (grabado); el gruñido suelto, sintetizado.
  bark(pos, act = null) {
    if (act === 'attack' && this.pack.animal('capybara', 'attack', pos)) return;
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

  // El Mate Meme: el mp3 del usuario (sfx/mate-meme.mp3), a lo sumo tres
  // encimados; si todavía no está, un "BOOM" grave con eco.
  memeShot(pos, up) {
    const buf = this.sfxBuf['mate-meme'];
    const o = this.out({ pos, gain: pos ? 0.85 : 0.75, reverb: 0.25 });
    if (buf) {
      const now = this.now;
      this.memes = (this.memes || []).filter((x) => x.end > now);
      while (this.memes.length >= 3) {
        const x = this.memes.shift();
        try {
          x.src.stop(now + 0.03);
        } catch {
          /* ya paró */
        }
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = up ? 1.08 : 1;
      src.connect(o);
      src.start(now);
      this.memes.push({ src, end: now + buf.duration / src.playbackRate.value });
      return;
    }
    const t = this.now;
    this.tone(o, { t, dur: 0.9, freq: 72, freqEnd: 38, gain: 0.9, attack: 0.003 });
    this.tone(o, { t, dur: 0.6, type: 'triangle', freq: 144, freqEnd: 70, gain: 0.25 });
    this.noise(o, { t, dur: 0.12, freq: 900, freqEnd: 120, gain: 0.35, brown: true });
    this.tone(o, { t: t + 0.01, dur: 0.18, type: 'square', freq: up ? 990 : 880, freqEnd: up ? 1320 : 1180, gain: 0.03 });
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

  // El clarín de la partida (el Sargento): el toque de carga, lejos y desafinado.
  bugle(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.9, gain: 0.8, ref: 8 });
    let at = t;
    for (const [f, d] of [[392, 0.13], [523, 0.13], [659, 0.13], [784, 0.42], [659, 0.15], [784, 0.75]]) {
      const bend = f * (0.985 + Math.random() * 0.01);
      this.tone(o, { t: at, dur: d, type: 'sawtooth', freq: f, freqEnd: d > 0.3 ? bend : f, gain: 0.07, attack: 0.02 });
      this.tone(o, { t: at, dur: d, type: 'triangle', freq: f, freqEnd: d > 0.3 ? bend : f, gain: 0.16, attack: 0.02 });
      at += d + 0.03;
    }
  }

  // El sable del Sargento cortando el aire (con agua que salpica).
  saber(pos) {
    const t = this.now;
    const o = this.out({ pos, reverb: 0.25, gain: 0.9 });
    this.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 900, freqEnd: 3200, q: 1.4, gain: 0.7, attack: 0.04 });
    this.tone(o, { t: t + 0.05, dur: 0.35, type: 'sine', freq: 2600, freqEnd: 2450, gain: 0.04 });
    this.noise(o, { t: t + 0.15, dur: 0.3, type: 'highpass', freq: 2500, gain: 0.25, attack: 0.02 });
  }

  // El aullido del Luisón, grabado (sfx/luison-aullido.mp3). prep: con el
  // resuello de antes (el aullido llega a los LUISON_PREP s); si no, arranca
  // justo en el aullido. rate: más grave (al morir). Devuelve en cuántos
  // segundos se oye el aullido. Si el grabado no bajó, el sintetizado, a tiempo.
  luisonHowl(pos, { prep = false, rate = 1 } = {}) {
    const lead = prep ? LUISON_PREP / rate : 0;
    const buf = this.sfxBuf['luison-aullido'];
    if (!buf) {
      this.luisonSynth(pos, lead);
      return lead;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(this.out({ pos, reverb: 0.7, gain: 1.15, ref: 10 }));
    src.start(0, prep ? 0 : LUISON_PREP - 0.12);
    return lead;
  }

  // Los lobos del monte anunciando al Luisón (EsterosEgg.luisonMusic): lejos
  // (apagados, con mucho eco), cada uno de un lado, por debajo de la canción.
  wolves(i, { pan = 0, gain = 0.5 } = {}) {
    const buf = this.sfxBuf[WOLVES[i]];
    if (!buf) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1900;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    src.connect(lp).connect(p).connect(this.out({ gain, reverb: 0.9 }));
    src.start();
  }

  // El aullido sintetizado (si no bajó el grabado): sube, se sostiene
  // temblando y cae; con otro aullido desafinado encima, el eco de abajo y el
  // resuello del bicho. delay: en cuánto arranca.
  luisonSynth(pos, delay = 0) {
    const t = this.now + delay;
    const c = this.ctx;
    const o = this.out({ pos, reverb: 0.95, gain: 1.1, ref: 10 });
    for (const [f0, det, gain, type] of [[196, 0, 0.22, 'sawtooth'], [196, 23, 0.12, 'triangle'], [392, -8, 0.05, 'sawtooth']]) {
      const osc = c.createOscillator();
      osc.type = type;
      osc.detune.value = det;
      const f = osc.frequency;
      f.setValueAtTime(f0 * 0.6, t);
      f.exponentialRampToValueAtTime(f0 * 1.9, t + 0.55);
      f.linearRampToValueAtTime(f0 * 2, t + 1.5);
      f.exponentialRampToValueAtTime(f0 * 1.3, t + 2.2);
      f.exponentialRampToValueAtTime(f0 * 0.7, t + 2.6);
      const vib = c.createOscillator();
      vib.frequency.value = 5.5;
      const vg = c.createGain();
      vg.gain.value = f0 * 0.03;
      vib.connect(vg).connect(f);
      // un filtro que deja la "u" del aullido
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.3);
      g.gain.setValueAtTime(gain, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.7);
      osc.connect(lp).connect(g).connect(o);
      osc.start(t);
      vib.start(t);
      osc.stop(t + 2.8);
      vib.stop(t + 2.8);
    }
    this.noise(o, { t, dur: 2.4, type: 'bandpass', freq: 700, freqEnd: 500, q: 1.5, gain: 0.12, attack: 0.3 });
    this.tone(o, { t, dur: 1.2, freq: 55, freqEnd: 40, gain: 0.35, attack: 0.1 });
  }

  // El trueno de los rayos (armas, escenas, easter eggs): en el castillo el
  // intenso; en los demás mapas los dos medios, uno y uno. big: el intenso
  // en cualquier mapa (los rayos que importan: el que mata al Gil...).
  thunder(pos, big = false) {
    if (this.playThunder(this.thunderId(big), { pos, gain: 1.25 })) return;
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

  // La hoz: un zumbido corto de hoja cortando el aire (la de la Muerte, con un silbido fino).
  swish(death = false, k = 1) {
    const t = this.now;
    const o = this.out({ gain: 0.55 * k, reverb: 0.08 });
    this.noise(o, { t, dur: 0.17, type: 'bandpass', freq: 700, freqEnd: 2600, q: 1.3, gain: 0.7, attack: 0.03 });
    this.noise(o, { t: t + 0.02, dur: 0.12, type: 'highpass', freq: 4000, gain: 0.18, attack: 0.02 });
    if (death) this.tone(o, { t, dur: 0.3, type: 'sine', freq: 1500, freqEnd: 2400, gain: 0.05, attack: 0.04 });
  }

  // Piedra contra el filo: una raspada aguda y el "shiing" del final.
  sharpen(ring = false) {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.1 });
    this.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 3200, freqEnd: 5200, q: 3, gain: 0.45, attack: 0.03 });
    this.noise(o, { t, dur: 0.18, type: 'highpass', freq: 6500, gain: 0.12, attack: 0.02 });
    if (ring) {
      this.tone(o, { t: t + 0.05, dur: 0.9, type: 'sine', freq: 2630, gain: 0.07, attack: 0.005 });
      this.tone(o, { t: t + 0.05, dur: 0.7, type: 'sine', freq: 3950, gain: 0.035, attack: 0.005 });
    }
  }

  footstep(surface, loud = 1) {
    const o = this.out({ gain: 0.18 * loud, reverb: 0.05 });
    // vadeando: un chapoteo largo en vez del paso
    if (surface === 'water') {
      this.noise(o, { dur: 0.28, type: 'bandpass', freq: 900 + Math.random() * 500, freqEnd: 350, q: 0.9, gain: 1.3, attack: 0.02 });
      return;
    }
    const f = { dirt: 500, wood: 700, tile: 1600, concrete: 1300 }[surface] || 900;
    this.noise(o, { dur: 0.09, freq: f * (0.8 + Math.random() * 0.4), q: 1, gain: 0.8 });
    if (surface === 'wood') this.tone(o, { dur: 0.08, freq: 120, freqEnd: 70, gain: 0.3 });
  }

  // Sale a respirar después de mucho abajo del agua: la bocanada.
  gasp() {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.04 });
    this.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 1400, freqEnd: 2600, q: 1.2, gain: 0.9, attack: 0.03 });
    this.tone(o, { t, dur: 0.35, type: 'sawtooth', freq: 190, freqEnd: 260, gain: 0.05, attack: 0.05 });
    this.noise(o, { t: t + 0.55, dur: 0.3, type: 'bandpass', freq: 900, freqEnd: 500, q: 1, gain: 0.35, attack: 0.05 });
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

  // Abajo del agua (el nado: Mate no Numa y donde se pueda bucear): todo se oye
  // ahogado. Un pasabajos grave sobre todo lo que suena (música y voces
  // también), los graves con más cuerpo y más eco; de fondo, el retumbe sordo
  // del agua y las burbujas que se te escapan (por el cuerpo: no se tapan). Al
  // meterse, un "glup" de burbujas; al salir, se destapa de a poco.
  setUnder(on) {
    on = !!on;
    if (on === !!this.underOn) return;
    this.underOn = on;
    const t = this.now;
    const ramp = (param, v, dur) => {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + dur);
    };
    const f = this.under.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? UNDER_HZ : 20000, t + (on ? 0.12 : 0.4));
    ramp(this.under.Q, on ? 1.1 : 0.5, 0.2);
    ramp(this.underLow.gain, on ? 5 : 0, on ? 0.15 : 0.4);
    ramp(this.reverbGain.gain, on ? 0.95 : 0.55, on ? 0.2 : 0.5);
    clearInterval(this.bubbleTimer);
    this.bubbleTimer = null;
    if (this.underBed) {
      const { out, src } = this.underBed;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0.0001, t + 0.35);
      src.stop(t + 0.4);
      this.underBed = null;
    }
    if (!on) return;
    const k = this.master.gain.value * this.sfx.gain.value;
    // el retumbe: ruido marrón muy grave, que late despacio
    const c = this.ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.5 * k, t + 0.25);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    lp.Q.value = 0.9;
    const src = c.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.23;
    lg.gain.value = 0.18 * k;
    lfo.connect(lg).connect(out.gain);
    src.connect(lp).connect(out).connect(this.body);
    src.start(t, Math.random() * 3);
    lfo.start(t);
    src.onended = () => lfo.stop();
    this.underBed = { out, src };
    // el "glup" de entrar: un racimo de burbujas
    for (let i = 0; i < 7; i++) this.bubble(t + i * 0.05 + Math.random() * 0.04, k * 1.2);
    this.bubbleTimer = setInterval(() => {
      if (this.ctx.state !== 'running' || Math.random() < 0.35) return;
      const n = Math.random() < 0.25 ? 3 : 1;
      const kk = this.master.gain.value * this.sfx.gain.value;
      for (let i = 0; i < n; i++) this.bubble(this.now + i * 0.07, kk * 0.8);
    }, 650);
  }

  // Una burbuja: un "blup" que sube, cortito y cerca.
  bubble(t, k = 1) {
    const o = this.out({ gain: 0.32 * k, reverb: 0, bus: this.body });
    const f = 260 + Math.random() * 260;
    this.tone(o, { t, dur: 0.07, freq: f, freqEnd: f * (2 + Math.random() * 0.8), gain: 0.5, attack: 0.004 });
  }

  // ---------- zombies ----------
  // kind: idle (gemido, quejido o respiración), attack, scream (corredores), death, boss.
  // (crawl: el que se arrastra sin piernas). Grabados (core/sfxPack.js) menos el jefe.
  growl(pos, kind = 'idle') {
    if (kind !== 'boss' && this.pack.zombie(pos, kind, this.outdoor ? 0.62 : 0.85)) return;
    if (kind === 'crawl') kind = 'idle';
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

  // Se rompió el escudo: el mismo en todos los mapas (sea de hierro, de paja o
  // de algarrobo), para que se reconozca al toque. Golpe sordo, crujido, un
  // tañido que cae una quinta (tan-tuun) y los pedazos que caen.
  shieldBreak() {
    const t = this.now;
    const o = this.out({ gain: 0.8, reverb: 0.25 });
    this.tone(o, { t, dur: 0.3, freq: 150, freqEnd: 45, gain: 0.8 });
    this.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 1400, freqEnd: 300, q: 1.2, gain: 0.9 });
    this.tone(o, { t: t + 0.04, dur: 0.45, type: 'triangle', freq: 660, gain: 0.3 });
    this.tone(o, { t: t + 0.04, dur: 0.2, type: 'triangle', freq: 1822, gain: 0.08 });
    this.tone(o, { t: t + 0.22, dur: 0.7, type: 'triangle', freq: 440, freqEnd: 412, gain: 0.32 });
    for (let i = 0; i < 4; i++) this.noise(o, { t: t + 0.3 + i * 0.09 + Math.random() * 0.05, dur: 0.06, type: 'bandpass', freq: 1500 + Math.random() * 1800, q: 3, gain: 0.35 - i * 0.06 });
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

  // Lo que suena al terminar de tomar el mate de cada perk (encima del sorbo):
  // lo que hace el perk, dicho en ruido.
  perkDrink(id) {
    const t = this.now;
    const o = this.out({ gain: 0.55, reverb: 0.12 });
    switch (id) {
      case 'jugg':
        // el corazón que late fuerte y la coraza que se cierra
        for (const d of [0, 0.22]) this.tone(o, { t: t + d, dur: 0.16, freq: 70, freqEnd: 42, gain: 0.9, attack: 0.005 });
        this.noise(o, { t: t + 0.5, dur: 0.12, type: 'bandpass', freq: 2600, q: 3, gain: 0.5 });
        this.tone(o, { t: t + 0.5, dur: 0.6, type: 'triangle', freq: 620, gain: 0.12, release: 0.5 });
        this.tone(o, { t: t + 0.5, dur: 0.5, type: 'triangle', freq: 931, gain: 0.07, release: 0.4 });
        break;
      case 'revive':
        // el desfibrilador carga, descarga, y el monitor vuelve a pitar
        this.tone(o, { t, dur: 0.4, freq: 700, freqEnd: 2600, gain: 0.08, attack: 0.05 });
        this.noise(o, { t: t + 0.42, dur: 0.14, type: 'highpass', freq: 2500, gain: 0.55 });
        this.tone(o, { t: t + 0.42, dur: 0.1, type: 'square', freq: 90, freqEnd: 60, gain: 0.25 });
        for (const d of [0.75, 1.15]) this.tone(o, { t: t + d, dur: 0.09, freq: 1000, gain: 0.14 });
        break;
      case 'speed':
        // un zumbido que pasa volando y tres tics de reloj apurado
        this.noise(o, { t, dur: 0.32, type: 'bandpass', freq: 400, freqEnd: 5000, q: 2.5, gain: 0.6, attack: 0.06 });
        for (let i = 0; i < 3; i++) this.noise(o, { t: t + 0.36 + i * 0.07, dur: 0.025, type: 'bandpass', freq: 4200, q: 6, gain: 0.45 });
        break;
      case 'doubletap':
        // dos cerrojos, clic-clac, clic-clac
        for (const d of [0, 0.3]) {
          this.noise(o, { t: t + d, dur: 0.04, type: 'bandpass', freq: 3200, q: 5, gain: 0.6 });
          this.noise(o, { t: t + d + 0.09, dur: 0.06, type: 'bandpass', freq: 1500, q: 4, gain: 0.7 });
        }
        break;
      case 'mule': {
        // el rebuzno (i-aa, i-aa) y la patada
        const c = this.ctx;
        for (let i = 0; i < 2; i++) {
          const tt = t + i * 0.5;
          const osc = c.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(520, tt);
          osc.frequency.linearRampToValueAtTime(560, tt + 0.16);
          osc.frequency.setValueAtTime(260, tt + 0.2);
          osc.frequency.linearRampToValueAtTime(220, tt + 0.44);
          const f = c.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 900;
          f.Q.value = 3;
          const gg = c.createGain();
          gg.gain.setValueAtTime(0.0001, tt);
          gg.gain.exponentialRampToValueAtTime(0.35, tt + 0.03);
          gg.gain.exponentialRampToValueAtTime(0.2, tt + 0.2);
          gg.gain.exponentialRampToValueAtTime(0.3, tt + 0.24);
          gg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.46);
          osc.connect(f).connect(gg).connect(o);
          osc.start(tt);
          osc.stop(tt + 0.5);
        }
        this.tone(o, { t: t + 1.05, dur: 0.18, freq: 110, freqEnd: 50, gain: 0.8 });
        this.noise(o, { t: t + 1.05, dur: 0.1, freq: 600, gain: 0.5 });
        break;
      }
      case 'deadshot':
        // no hace nada: el trombón triste
        [[58, 0.32], [57, 0.32], [56, 0.32], [55, 0.9]].reduce((tt, [n, d]) => {
          this.tone(o, { t: tt, dur: d, type: 'sawtooth', freq: midi(n), freqEnd: d > 0.5 ? midi(n) * 0.97 : undefined, gain: 0.07, attack: 0.03 });
          this.tone(o, { t: tt, dur: d, type: 'triangle', freq: midi(n - 12), gain: 0.08, attack: 0.03 });
          return tt + d;
        }, t);
        break;
      case 'phd':
        // la bomba que cae silbando y revienta (lejos)
        this.tone(o, { t, dur: 0.55, freq: 2200, freqEnd: 500, gain: 0.08 });
        this.noise(o, { t: t + 0.55, dur: 0.7, freq: 500, freqEnd: 80, gain: 0.9, brown: true });
        this.tone(o, { t: t + 0.55, dur: 0.4, freq: 60, freqEnd: 30, gain: 0.6 });
        break;
      case 'dragon': {
        // la llamarada que ruge y las brasas que chisporrotean
        this.noise(o, { t, dur: 0.8, type: 'lowpass', freq: 250, freqEnd: 1600, gain: 0.9, brown: true, attack: 0.08 });
        for (let i = 0; i < 9; i++) this.noise(o, { t: t + 0.2 + Math.random() * 0.8, dur: 0.02, type: 'highpass', freq: 3000, gain: 0.35 });
        break;
      }
      case 'cherry':
        // el zumbido que sube, la descarga y los chasquidos
        this.tone(o, { t, dur: 0.45, type: 'sawtooth', freq: 90, freqEnd: 620, gain: 0.1, attack: 0.02 });
        this.noise(o, { t: t + 0.45, dur: 0.16, type: 'highpass', freq: 2600, gain: 0.6 });
        this.tone(o, { t: t + 0.45, dur: 0.18, type: 'square', freq: 70, freqEnd: 45, gain: 0.3 });
        for (let i = 0; i < 8; i++) this.noise(o, { t: t + 0.5 + Math.random() * 0.5, dur: 0.02, type: 'bandpass', freq: 3000 + Math.random() * 3000, q: 2, gain: 0.3 });
        break;
      case 'aqua':
        // burbujas que suben y el chapuzón
        for (let i = 0; i < 6; i++) this.tone(o, { t: t + i * 0.07, dur: 0.06, freq: 400 + i * 90, freqEnd: 900 + i * 140, gain: 0.12 });
        this.noise(o, { t: t + 0.5, dur: 0.35, type: 'bandpass', freq: 1200, freqEnd: 500, q: 1, gain: 0.5 });
        break;
      default:
        break;
    }
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
  // Las voces no se pisan: si alguien está hablando, la nueva espera su turno
  // (cuánto, queda en `sayWait`). En una cinemática solo hablan los de la
  // cinemática ({ cine: true }); las demás se callan. Devuelve cuánto dura lo
  // que dice, sin contar la espera.
  say(text, speaker = 'abuelo', { cine = false } = {}) {
    const pauses = (text.match(/[,.;:!?…]/g) || []).length;
    const talk = (rate) => Math.max(1.6, (text.length * 0.064 + pauses * 0.22) / rate + 0.3);
    this.sayWait = 0;
    if (this.cine && !cine) return talk(1);
    const now = this.ctx.currentTime;
    const wait = Math.max(0, this.voiceEnd - now);
    // con mucha cola esta no se dice (el subtítulo sale igual)
    if (wait > 12) return talk(1);
    this.sayWait = wait;
    if (this.voiceMode === 'off') {
      const d = talk(1);
      this.voiceEnd = now + wait + d;
      return d;
    }
    // en automática el Capataz murmura (con la voz del navegador pierde la gracia)
    const murmurOnly = this.voiceMode === 'auto' && (speaker === 'capataz' || speaker === 'capatazJoven');
    if (this.useNatural && !murmurOnly) {
      try {
        // tono y velocidad de cada personaje (las voces neuronales a veces ignoran el tono)
        const V = {
          abuelo: { rate: 0.88, pitch: 0.8 },
          anunciador: { rate: 0.82, pitch: 0.3 },
          capataz: { rate: 0.95, pitch: 0.5 },
          capatazJoven: { rate: 1.02, pitch: 1 },
          radio: { rate: 1.06, pitch: 1.05 },
          taza: { rate: 1.1, pitch: 1.5 },
          entidad: { rate: 0.74, pitch: 0.1 },
          espantapajaros: { rate: 0.9, pitch: 0.8 },
          alcaide: { rate: 1.18, pitch: 1.2 },
          gil: { rate: 0.86, pitch: 0.5 },
          anacleto: { rate: 0.86, pitch: 0.6 },
          cirilo: { rate: 1.06, pitch: 1.2 },
          benito: { rate: 1.04, pitch: 0.95 },
          nicanor: { rate: 0.84, pitch: 0.9 },
          fierro: { rate: 0.88, pitch: 0.75 },
          francisco: { rate: 0.92, pitch: 0.45 },
          caballeroFuego: { rate: 1.02, pitch: 0.75 },
          caballeroViento: { rate: 0.9, pitch: 1.4 },
          caballeroRayo: { rate: 1.08, pitch: 1.15 },
          caballeroHielo: { rate: 0.72, pitch: 0.25 },
          sargento: { rate: 0.98, pitch: 0.65 },
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
        const d = talk(V.rate);
        this.voiceEnd = now + wait + d;
        this.voiceLater(wait, () => speechSynthesis.speak(u));
        return d;
      } catch {
        /* sigue con murmullos */
      }
    }
    return this.murmur(text, speaker, now + wait);
  }

  // Algo de voz para dentro de `secs` (se cancela con hush).
  voiceLater(secs, fn) {
    if (secs < 0.05) {
      fn();
      return;
    }
    const id = setTimeout(() => {
      this.voiceTimers.delete(id);
      fn();
    }, secs * 1000);
    this.voiceTimers.add(id);
  }

  // Corta todas las voces de los personajes (las que suenan, las que esperaban
  // turno y la del navegador). Los demás sonidos siguen.
  hush() {
    try {
      speechSynthesis.cancel();
    } catch {
      /* sin voz del navegador */
    }
    for (const id of this.voiceTimers) clearTimeout(id);
    this.voiceTimers.clear();
    this.voiceGen++;
    const t = this.ctx.currentTime;
    for (const s of this.voiceSrc) {
      try {
        s.out.gain.setTargetAtTime(0, t, 0.015);
        s.stop(t + 0.08);
      } catch {
        /* ya terminó */
      }
    }
    this.voiceSrc.clear();
    this.voiceEnd = 0;
  }

  // Arranca (o termina) una cinemática: se callan todos para darle lugar.
  setCine(on) {
    if (on) this.hush();
    this.cine = !!on;
  }

  // Sin worker (no cargó o no hay): lo que estaba en camino se renderiza acá.
  voiceFallback() {
    this.voiceWorker?.terminate();
    this.voiceWorker = null;
    const jobs = [...this.voiceJobs.values()];
    this.voiceJobs.clear();
    for (const job of jobs) job(null);
  }

  murmur(text, speaker, when = 0) {
    const { segs, P } = speechPlan(text, speaker);
    const fx = {
      abuelo: { reverb: 0.55, gain: 1.1 },
      anunciador: { reverb: 1.1, gain: 1.4 },
      capataz: { reverb: 0.4, gain: 1.3 },
      radio: { reverb: 0.1, gain: 1, filter: [{ type: 'highpass', freq: 450 }, { type: 'lowpass', freq: 2800 }, { type: 'peaking', freq: 1500, q: 1, gain: 5 }] },
      taza: { reverb: 0.5, gain: 1 },
      entidad: { reverb: 1.4, gain: 1.4, filter: [{ type: 'lowpass', freq: 2600 }, { type: 'lowshelf', freq: 220, gain: 5 }] },
      espantapajaros: { reverb: 0.45, gain: 1.2, filter: [{ type: 'highpass', freq: 350 }] },
      // el Alcaide, nasal: un pico en los medios y sin graves
      alcaide: { reverb: 0.35, gain: 1.25, filter: [{ type: 'highpass', freq: 240 }, { type: 'peaking', freq: 1400, q: 1.6, gain: 7 }] },
      gil: { reverb: 0.8, gain: 1.35, filter: [{ type: 'lowshelf', freq: 250, gain: 4 }] },
      anacleto: { reverb: 0.5, gain: 1.15, filter: [{ type: 'lowpass', freq: 3000 }] },
      cirilo: { reverb: 0.5, gain: 1.1, filter: [{ type: 'highpass', freq: 200 }] },
      benito: { reverb: 0.6, gain: 1.1 },
      // Nicanor, desde el más allá: mucha sala, sin graves ni brillo
      nicanor: { reverb: 1.2, gain: 1.4, filter: [{ type: 'highpass', freq: 280 }, { type: 'lowpass', freq: 3400 }] },
      fierro: { reverb: 0.7, gain: 1.15 },
      francisco: { reverb: 0.9, gain: 1.3, filter: [{ type: 'lowshelf', freq: 220, gain: 3 }] },
      // los caballeros son fantasmas: mucha sala. Fuego con cuerpo y chisporroteo,
      // Viento sin graves y con aire arriba, Rayo con filo, Hielo con un brillo de vidrio
      caballeroFuego: { reverb: 0.95, gain: 1.3, filter: [{ type: 'lowshelf', freq: 200, gain: 3 }, { type: 'peaking', freq: 2300, q: 1.2, gain: 4 }] },
      caballeroViento: { reverb: 1.3, gain: 1.35, filter: [{ type: 'highpass', freq: 260 }, { type: 'highshelf', freq: 3500, gain: 4 }] },
      caballeroRayo: { reverb: 0.9, gain: 1.25, filter: [{ type: 'highpass', freq: 220 }, { type: 'peaking', freq: 3000, q: 1.4, gain: 6 }] },
      caballeroHielo: { reverb: 1.5, gain: 1.4, filter: [{ type: 'highpass', freq: 140 }, { type: 'peaking', freq: 3600, q: 2.5, gain: 5 }] },
      // el Sargento, como desde abajo del agua: sin agudos y con un pico hueco en los graves
      sargento: { reverb: 0.6, gain: 1.3, filter: [{ type: 'lowpass', freq: 1900 }, { type: 'peaking', freq: 520, q: 1.4, gain: 5 }] },
    }[speaker] || { reverb: 0.4, gain: 1 };
    // espera su turno (si alguien está hablando); el largo sale de los
    // segmentos, así se sabe antes de renderizar
    const t = this.ctx.currentTime;
    const at = Math.max(t, when || this.voiceEnd);
    const dur = voiceLength(segs, P);
    this.voiceEnd = Math.max(this.voiceEnd, at + dur);
    const gen = this.voiceGen;
    const play = (data) => {
      // hubo hush mientras se renderizaba
      if (gen !== this.voiceGen) return;
      const buf = this.toBuffer(data ?? renderVoice(segs, P));
      // si llegó tarde: hasta 0.12 s arranca corrida (se come la pausa del
      // final); más, arranca por la mitad para no quedar atrás del subtítulo
      const now = this.ctx.currentTime;
      const offset = now - at > 0.12 ? now - at : 0;
      if (offset >= buf.duration) return;
      // se anota para poder cortarla
      const src = this.playBuffer(buf, { ...fx, bus: this.voice, when: Math.max(at, now), offset });
      this.voiceSrc.add(src);
      src.onended = () => this.voiceSrc.delete(src);
    };
    if (this.voiceWorker) {
      const id = ++this.voiceJobId;
      this.voiceJobs.set(id, play);
      this.voiceWorker.postMessage({ id, segs, P });
    } else play(null);
    return dur;
  }

  announce(text) {
    const t = this.now;
    const o = this.out({ gain: 0.5, reverb: 0.6 });
    this.tone(o, { t, dur: 0.8, type: 'sawtooth', freq: 55, freqEnd: 40, gain: 0.3 });
    // el anunciador de los potenciadores murmura (con voz del navegador no queda)
    if (this.voiceMode === 'off' || this.cine) return Math.max(1.6, text.length * 0.064);
    // tampoco pisa a nadie: si hay mucha cola, se queda con el cartel
    if (this.voiceEnd - this.ctx.currentTime > 4) return Math.max(1.6, text.length * 0.064);
    return this.murmur(text, 'anunciador');
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
  // Cada mapa avisa el cambio de ronda con los instrumentos de su mundo:
  //  · El Molino (Misiones): bombo legüero y acordeón de chamamé, en menor.
  //  · La Tapera (la chacra al atardecer): guitarra criolla, silbido de
  //    tropero y el galope de la tropilla.
  //  · Mate of the Dead (el penal): la armónica sola de un preso, con eco.
  //  · Revelaciones Materas (la torre): campana, coro y el viento del remolino.
  // En la torre las rondas se encadenan casi sin pausa (4 s) y el aviso en
  // todas distrae: suena sólo al llegar a las múltiplos de 5 (y en la primera,
  // al terminar la cinemática, como en los demás mapas).
  // n: la ronda que empieza (roundStart) o la que terminó (roundEnd).
  roundStart(n) {
    if (MAP_ID === 'torre' && n % 5 && n !== 1) return;
    const t = this.now + 0.05;
    if (MAP_ID === 'granja') this.taperaStart(t);
    else if (MAP_ID === 'penal') this.penalStart(t);
    else if (MAP_ID === 'torre') this.torreStart(t);
    else if (MAP_ID === 'castillo') this.castilloStart(t);
    else if (MAP_ID === 'esteros') esterosStart(this, t);
    else this.molinoStart(t);
  }

  roundEnd(n) {
    if (MAP_ID === 'torre' && (n + 1) % 5) return;
    const t = this.now + 0.05;
    if (MAP_ID === 'granja') this.taperaEnd(t);
    else if (MAP_ID === 'penal') this.penalEnd(t);
    else if (MAP_ID === 'torre') this.torreEnd(t);
    else if (MAP_ID === 'castillo') this.castilloEnd(t);
    else if (MAP_ID === 'esteros') esterosEnd(this, t);
    else this.molinoEnd(t);
  }

  // El Molino: un compás de bombo solo y entra el acordeón; la frase se queda
  // colgada en el mi (la dominante), sin resolver.
  molinoStart(t) {
    const o = this.out({ gain: 0.7, reverb: 0.6, bus: this.music });
    const e = 0.19; // corchea del 6/8
    for (let k = 0; k < 18; k++) {
      const b = k % 6;
      if (b === 0 || b === 3) this.bombo(o, t + k * e, false, b === 0 ? 1 : 0.7);
      else if (k < 6 || b !== 5) this.bombo(o, t + k * e, true, 0.8);
    }
    const acc = this.accordionBus(o, t, t + 5);
    [[45, 57, 60, 64], [40, 56, 59, 62]].forEach((ch, i) => {
      for (const n of ch) this.accordion(acc, t + (6 + i * 6) * e, n, (i ? 7 : 6) * e, 0.05);
    });
    let tt = t + 6 * e;
    for (const [n, d] of [[76, 2], [77, 1], [76, 2], [72, 1], [71, 3], [68, 5]]) {
      this.accordion(acc, tt, n, d * e * 0.94, 0.09);
      tt += d * e;
    }
  }

  // El Molino: el acordeón solo, cansado, baja y se queda en la menor.
  molinoEnd(t) {
    const o = this.out({ gain: 0.55, reverb: 0.85, bus: this.music });
    const e = 0.3;
    const acc = this.accordionBus(o, t, t + 5);
    [[0, 2, [50, 53, 57]], [2, 3, [40, 56, 59]], [5, 5, [45, 57, 60, 64]]].forEach(([at, d, ch]) => {
      for (const n of ch) this.accordion(acc, t + at * e, n, d * e, 0.045);
    });
    let tt = t;
    for (const [n, d] of [[72, 1], [71, 1], [69, 1], [68, 2], [69, 5]]) {
      this.accordion(acc, tt, n, d * e * 0.95, 0.08);
      tt += d * e;
    }
    this.bombo(o, t, false, 0.5);
    this.bombo(o, t + 5 * e, false, 0.6);
  }

  // La Tapera: rasguido de guitarra, el silbido del tropero y la tropilla que
  // se acerca al galope; un cuervo lejos.
  taperaStart(t) {
    const o = this.out({ gain: 0.95, reverb: 0.5, bus: this.music });
    const gtr = this.guitarBus(o);
    const EM = [40, 47, 52, 55, 59, 64];
    this.strum(gtr, t, EM, { gain: 0.3 });
    this.strum(gtr, t + 0.42, EM.slice(2), { gain: 0.22, up: true });
    const beat = 0.28;
    const end = this.whistle(o, t + 0.35, [[83, 1], [88, 1], [90, 0.5], [91, 2.5], [90, 0.5], [88, 0.5], [86, 0.5], [88, 4]], beat, 0.08);
    this.strum(gtr, t + 0.35 + 6.5 * beat, EM, { gain: 0.28 });
    this.pluck(gtr, t + 0.35 + 6.5 * beat, 28, 0.35);
    // galope: ta-ka-TUM, cada vez más cerca y después se aleja
    for (let i = 0; i < 7; i++) {
      const k = Math.sin(((i + 1) / 8) * Math.PI);
      const tt = t + 0.9 + i * 0.36;
      [0.55, 0.7, 1].forEach((a, j) => this.hoof(o, tt + j * 0.08, a * k));
    }
    this.farCaw(o, end - 0.4);
  }

  // La Tapera: arpegio lento, el silbido que se cae y una ráfaga de viento.
  taperaEnd(t) {
    const o = this.out({ gain: 0.8, reverb: 0.7, bus: this.music });
    const gtr = this.guitarBus(o);
    [40, 47, 52, 55, 59, 64].forEach((n, i) => this.pluck(gtr, t + i * 0.2, n, 0.26));
    this.whistle(o, t + 0.9, [[88, 2], [86, 1], [83, 2], [76, 3, 0.45]], 0.3, 0.07);
    this.pluck(gtr, t + 3, 40, 0.3);
    this.pluck(gtr, t + 3.02, 47, 0.2);
    this.noise(o, { t, dur: 3.8, type: 'bandpass', freq: 250, freqEnd: 180, q: 0.8, gain: 0.25, attack: 1.6, brown: true });
  }

  // El penal: la armónica sola de un preso, lenta, con mucha reverb y el eco
  // del pabellón. Las mismas notas que la torre (re, si bemol, la): la cuarta
  // de abajo de la armónica completa los acordes (re menor, si bemol, la).
  penalStart(t) {
    const o = this.out({ gain: 0.95, reverb: 1.4, bus: this.music });
    this.harmonica(this.hallEcho(o), t, [[74, 3.5, 2], [70, 2.5, 1], [69, 5]], 0.42, 0.14, { attack: 0.12, vibrato: 40, breath: 0.06 });
  }

  // El penal: la armónica baja y se queda en el re, doblado desde abajo.
  penalEnd(t) {
    const o = this.out({ gain: 0.7, reverb: 1.5, bus: this.music });
    this.harmonica(this.hallEcho(o), t, [[74, 2], [70, 2, 1], [69, 2], [62, 5, 2]], 0.45, 0.13, { attack: 0.12, vibrato: 40, breath: 0.06 });
  }

  // La torre: golpe grave, campana, el viento que sube y un coro que no
  // resuelve (re menor, si bemol, la mayor sobre re).
  torreStart(t) {
    const o = this.out({ gain: 0.5, reverb: 0.8, bus: this.music });
    this.tone(o, { t, dur: 1.4, freq: 55, freqEnd: 30, gain: 0.8 });
    this.bell(o, t + 0.05, 50, { gain: 0.24, dur: 4.2 });
    this.noise(o, { t, dur: 3.2, type: 'bandpass', freq: 260, freqEnd: 1500, q: 1.1, gain: 0.3, attack: 2.2 });
    this.choir(o, t + 0.3, [50, 57, 62, 65], { dur: 1.2, gain: 0.05, attack: 0.5, release: 0.35 });
    this.choir(o, t + 1.6, [46, 58, 62, 65], { dur: 0.75, gain: 0.05, attack: 0.25, release: 0.3 });
    this.choir(o, t + 2.5, [45, 57, 61, 64], { dur: 0.9, gain: 0.055, attack: 0.2, release: 0.7 });
    this.bell(o, t + 2.5, 57, { gain: 0.14, dur: 2.5 });
    this.organ(o, t + 0.3, 26, 3.1, 0.12);
  }

  // La torre: el coro baja a re menor, una campana lejana y el viento se va.
  torreEnd(t) {
    const o = this.out({ gain: 0.85, reverb: 0.9, bus: this.music });
    this.choir(o, t, [45, 57, 61, 64], { dur: 0.8, gain: 0.04, attack: 0.3, release: 0.3 });
    this.choir(o, t + 1.1, [38, 57, 62, 65], { dur: 1.1, gain: 0.045, attack: 0.3, release: 1.1 });
    this.bell(o, t + 1.1, 62, { gain: 0.09, dur: 2.4 });
    this.noise(o, { t, dur: 3.4, type: 'bandpass', freq: 1400, freqEnd: 220, q: 1.1, gain: 0.25, attack: 0.25 });
  }

  // Der Mateendrache: el erke llama a la guerra (un toque corto y uno largo,
  // con el eco de la montaña), el bombo legüero y un coro grave en re menor.
  castilloStart(t) {
    const o = this.out({ gain: 0.55, reverb: 0.9, bus: this.music });
    const blast = (at, freq, dur, gain) => {
      for (const [mul, type, g] of [[1, 'sawtooth', 1], [2, 'square', 0.3], [3, 'sawtooth', 0.18]]) {
        const h = this.hold(o, { t: at, dur, type, freq: freq * mul, gain: gain * g, attack: 0.07, release: 0.25 });
        h.o.frequency.setValueAtTime(freq * mul * 0.97, at);
        h.o.frequency.linearRampToValueAtTime(freq * mul, at + 0.12);
      }
      this.noise(o, { t: at, dur: dur + 0.1, type: 'bandpass', freq: freq * 4, q: 2, gain: gain * 0.5, attack: 0.05 });
    };
    // el toque y sus dos ecos cada vez más lejos
    for (const [delay, k] of [[0, 1], [0.55, 0.35], [1.1, 0.15]]) {
      blast(t + delay, 73.4, 0.42, 0.11 * k);
      blast(t + 0.75 + delay, 110, 1.25, 0.12 * k);
    }
    for (const [dt, v] of [[0, 1], [0.75, 0.8], [1.15, 0.9], [2.1, 1]]) this.bombo(o, t + dt, false, v);
    this.choir(o, t + 0.8, [38, 45, 50, 53], { dur: 1.8, gain: 0.045, attack: 0.6, release: 0.8 });
    this.noise(o, { t, dur: 3.6, type: 'bandpass', freq: 300, freqEnd: 1300, q: 1, gain: 0.22, attack: 2 });
  }

  // Der Mateendrache: la campana del campanario, dos veces, y el viento que se va.
  castilloEnd(t) {
    const o = this.out({ gain: 0.8, reverb: 0.9, bus: this.music });
    this.bell(o, t, 45, { gain: 0.2, dur: 4.2 });
    this.bell(o, t + 1.5, 45, { gain: 0.13, dur: 3.5 });
    this.choir(o, t + 0.2, [38, 50, 53, 57], { dur: 1.6, gain: 0.035, attack: 0.5, release: 1 });
    this.noise(o, { t, dur: 3.8, type: 'bandpass', freq: 1300, freqEnd: 250, q: 1, gain: 0.22, attack: 0.3 });
  }

  // ---------- instrumentos de los cambios de ronda ----------
  // Nota sostenida (tone() cae enseguida): sube, se mantiene y se apaga.
  hold(dest, { t, dur, type = 'sawtooth', freq, gain = 0.2, attack = 0.05, release = 0.3, detune = 0 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const g = c.createGain();
    const top = t + Math.max(attack, dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, top);
    g.gain.linearRampToValueAtTime(0, top + release);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(top + release + 0.05);
    return { o, g };
  }

  // Oscilador lento para vibrato o trémolo; conectarle más parámetros a la salida.
  lfo(param, { t, end, rate, depth }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.value = rate;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g);
    if (param) g.connect(param);
    o.start(t);
    o.stop(end);
    return g;
  }

  // Acordeón: voces "musette" con trémolo y el filtro del fuelle.
  accordionBus(dest, t, end) {
    const c = this.ctx;
    const trem = c.createGain();
    trem.gain.value = 0.8;
    this.lfo(trem.gain, { t, end, rate: 5.6, depth: 0.18 });
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const pk = c.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 1100;
    pk.gain.value = 5;
    trem.connect(lp).connect(pk).connect(dest);
    return trem;
  }

  accordion(bus, t, n, dur, gain) {
    const f = midi(n);
    const k = { t, dur, freq: f, gain, attack: 0.04, release: 0.25 };
    this.hold(bus, { ...k, detune: -9 });
    this.hold(bus, { ...k, detune: 9 });
    this.hold(bus, { ...k, type: 'square', freq: f / 2, gain: gain * 0.3 });
  }

  // Bombo legüero: el parche (grave, de cuero) o el aro (golpe seco de madera).
  bombo(o, t, rim = false, k = 1) {
    if (rim) {
      this.noise(o, { t, dur: 0.06, type: 'bandpass', freq: 2200, q: 3, gain: 0.35 * k });
      this.tone(o, { t, dur: 0.05, type: 'triangle', freq: 900, freqEnd: 600, gain: 0.1 * k });
      return;
    }
    this.tone(o, { t, dur: 0.7, freq: 78, freqEnd: 44, gain: 0.9 * k });
    this.tone(o, { t, dur: 0.3, type: 'triangle', freq: 160, freqEnd: 90, gain: 0.2 * k });
    this.noise(o, { t, dur: 0.35, freq: 500, freqEnd: 90, gain: 0.45 * k, brown: true });
  }

  // Cuerda punteada (Karplus-Strong): se arma una vez por nota y se guarda.
  pluckBuf(n) {
    this.plucks ||= new Map();
    let p = this.plucks.get(n);
    if (p) return p;
    const c = this.ctx;
    const sr = c.sampleRate;
    const f = midi(n);
    const N = Math.max(2, Math.floor(sr / f));
    const len = Math.floor(sr * 1.8);
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    // púa blanda (nylon): el ruido inicial ya sale filtrado
    let x = 0;
    for (let i = 0; i < N; i++) d[i] = x = x * 0.5 + (Math.random() * 2 - 1) * 0.5;
    d[N] = d[0] * 0.99;
    for (let i = N + 1; i < len; i++) d[i] = (d[i - N] + d[i - N - 1]) * 0.4985;
    // el promedio de dos muestras alarga el período media muestra: se corrige
    p = { buf, rate: ((N + 0.5) * f) / sr };
    this.plucks.set(n, p);
    return p;
  }

  pluck(dest, t, n, gain = 0.3, dur = 1.6) {
    const { buf, rate } = this.pluckBuf(n);
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
    s.connect(g).connect(dest);
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  strum(dest, t, notes, { gain = 0.25, up = false, spread = 0.014, dur = 1.6 } = {}) {
    const ns = up ? [...notes].reverse() : notes;
    ns.forEach((n, i) => this.pluck(dest, t + i * spread, n, gain * (up ? 0.7 : 1), dur));
  }

  // Caja de la guitarra criolla: cuerpo grave y sin brillo de metal.
  guitarBus(dest) {
    const c = this.ctx;
    const body = c.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 180;
    body.Q.value = 1;
    body.gain.value = 6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    body.connect(lp).connect(dest);
    return body;
  }

  // Silbido: una sola nota que se desliza entre las notas, con vibrato en las
  // largas. notes: [midi, pulsos, deslizamiento]. Devuelve cuándo termina.
  whistle(dest, t, notes, beat, gain = 0.08) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(midi(notes[0][0]), t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    let tt = t;
    const end = t + notes.reduce((s, [, d]) => s + d * beat, 0);
    const vib = this.lfo(o.detune, { t, end: end + 0.5, rate: 5.3, depth: 0 });
    for (const [n, d, glide = 0.02] of notes) {
      o.frequency.setTargetAtTime(midi(n), tt, glide);
      vib.gain.setTargetAtTime(0, tt, 0.03);
      if (d * beat > 0.4) vib.gain.setTargetAtTime(22, tt + 0.15, 0.12);
      tt += d * beat;
    }
    g.gain.setTargetAtTime(0.0001, end - 0.15, 0.1);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(end + 0.5);
    return end;
  }

  // Casco de caballo sobre la tierra seca.
  hoof(o, t, k = 1) {
    this.noise(o, { t, dur: 0.07, type: 'bandpass', freq: 700, q: 2, gain: 0.3 * k });
    this.tone(o, { t, dur: 0.1, freq: 120, freqEnd: 70, gain: 0.35 * k });
  }

  farCaw(o, t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.34;
      this.tone(o, { t: tt, dur: 0.24, type: 'sawtooth', freq: 600, freqEnd: 430, gain: 0.05, attack: 0.01 });
      this.noise(o, { t: tt, dur: 0.22, type: 'bandpass', freq: 1400, q: 2.5, gain: 0.08 });
    }
  }

  // Armónica: lengüetas ásperas por el filtro de la boca, con una cuarta abajo
  // de colchón; cada nota puede entrar doblada desde abajo (bend, en semitonos).
  // notes: [midi, pulsos, bend]. attack: cuánto tarda en entrar cada nota;
  // breath: el soplido que se oye junto con las lengüetas.
  harmonica(dest, t, notes, beat, gain = 0.15, { attack = 0.025, vibrato = 30, breath = 0 } = {}) {
    const c = this.ctx;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    bp.connect(lp).connect(g).connect(dest);
    const end = t + notes.reduce((s, [, d]) => s + d * beat, 0);
    const vib = this.lfo(null, { t, end: end + 0.5, rate: 6, depth: 0 });
    const reeds = [['square', 1, 1], ['sawtooth', 1, 0.5], ['square', Math.pow(2, -5 / 12), 0.35]].map(([type, r, k]) => {
      const o = c.createOscillator();
      o.type = type;
      const og = c.createGain();
      og.gain.value = k;
      o.connect(og).connect(bp);
      vib.connect(o.detune);
      o.start(t);
      o.stop(end + 0.5);
      return { o, r };
    });
    if (breath) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const nf = c.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 1700;
      nf.Q.value = 0.9;
      const ng = c.createGain();
      ng.gain.value = breath;
      src.connect(nf).connect(ng).connect(g);
      src.start(t);
      src.stop(end + 0.5);
    }
    let tt = t;
    for (const [n, d, bend = 0] of notes) {
      for (const { o, r } of reeds) {
        if (bend || tt === t) o.frequency.setValueAtTime(midi(n - bend) * r, tt);
        o.frequency.setTargetAtTime(midi(n) * r, tt + (bend ? 0.03 : 0), bend ? 0.07 : 0.01);
      }
      // la lengua corta entre nota y nota
      if (tt > t) g.gain.setTargetAtTime(gain * 0.25, tt - 0.03, 0.01);
      g.gain.setTargetAtTime(gain, tt, attack);
      vib.gain.setTargetAtTime(0, tt, 0.02);
      if (d * beat > 0.45) vib.gain.setTargetAtTime(vibrato, tt + Math.min(0.4, d * beat * 0.25), 0.15);
      tt += d * beat;
    }
    g.gain.setTargetAtTime(0.0001, end - 0.1, 0.12);
    return end;
  }

  // Eco del pabellón de piedra: tres rebotes cada vez más apagados (sin
  // realimentación, así no queda nada sonando en el grafo).
  hallEcho(dest) {
    const c = this.ctx;
    const inp = c.createGain();
    inp.connect(dest);
    for (const [d, k] of [[0.34, 0.32], [0.68, 0.16], [1.02, 0.08]]) {
      const dl = c.createDelay(1.5);
      dl.delayTime.value = d;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.value = k;
      inp.connect(dl).connect(lp).connect(g).connect(dest);
    }
    return inp;
  }

  // Campana de bronce: el "hum" una octava abajo (con batido), la tercera
  // menor y los agudos, que se apagan primero.
  bell(o, t, n, { gain = 0.2, dur = 4 } = {}) {
    const f = midi(n);
    for (const [r, a, d] of [[0.5, 0.7, 1], [0.503, 0.4, 0.9], [1, 1, 0.8], [1.19, 0.55, 0.55], [1.5, 0.3, 0.45], [2, 0.45, 0.4], [2.52, 0.22, 0.28], [3.01, 0.18, 0.22], [4.1, 0.1, 0.15]]) {
      this.tone(o, { t, dur: dur * d, freq: f * r, gain: gain * a, attack: 0.004 });
    }
    this.noise(o, { t, dur: 0.07, type: 'bandpass', freq: Math.min(8000, f * 6), q: 2, gain: gain * 1.5 });
  }

  // Coro "aaa": serruchos desafinados por los formantes de una a, con vibrato.
  choir(dest, t, chord, { dur = 1.5, gain = 0.05, attack = 0.5, release = 0.6 } = {}) {
    const c = this.ctx;
    const voices = c.createGain();
    for (const [fq, q, k] of [[650, 4, 1], [1080, 6, 0.6], [2650, 8, 0.3]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = q;
      const kg = c.createGain();
      kg.gain.value = k * 3;
      voices.connect(bp).connect(kg).connect(dest);
    }
    const vib = this.lfo(null, { t, end: t + Math.max(attack, dur) + release + 0.1, rate: 4.8, depth: 9 });
    for (const n of chord) {
      for (const detune of [-12, 0, 11]) {
        const { o } = this.hold(voices, { t, dur, freq: midi(n), gain, attack, release, detune });
        vib.connect(o.detune);
      }
    }
  }

  // Pedal de órgano: fundamental y quinta, bien graves.
  organ(o, t, n, dur, gain) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.connect(o);
    this.hold(lp, { t, dur, type: 'square', freq: midi(n), gain, attack: 0.4, release: 0.8 });
    this.hold(lp, { t, dur, type: 'sine', freq: midi(n + 12), gain: gain * 1.5, attack: 0.4, release: 0.8 });
    this.hold(lp, { t, dur, type: 'sine', freq: midi(n + 19), gain: gain * 0.6, attack: 0.4, release: 0.8 });
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

  // La llegada de un jefe de ronda (kind: capataz, crow, alcaide, caballero) o
  // la alarma de la creciente ('creciente'), grabadas. Si todavía no bajaron,
  // la llegada sintetizada de siempre.
  bossSfx(kind) {
    const buf = this.sfxBuf[kind === 'creciente' ? 'alarma-creciente' : BOSS_SFX_ID[kind]];
    if (buf) this.playBuffer(buf, { gain: 1, reverb: 0.15 });
    else if (kind === 'creciente') this.sting();
    else this.bossArrive();
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
    this.fire = { src, crackle, out: o, on: true };
    // un mapa puede tener varios fuegos: se apagan todos al cambiar de mapa
    (this.fires ||= []).push(this.fire);
  }

  // Los fuegos se callan o vuelven (la creciente del estero tapa el fogón).
  fireOn(on) {
    for (const f of this.fires || []) {
      if (f.on === on) continue;
      f.on = on;
      f.out.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.5);
    }
  }

  stopFires() {
    for (const f of this.fires || []) {
      clearInterval(f.crackle);
      try {
        f.src.stop();
      } catch {
        /* ya estaba parado */
      }
    }
    this.fires = [];
    this.fire = null;
  }

  dispose() {
    try {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    } catch {
      /* */
    }
    if (this.fire) clearInterval(this.fire.crackle);
    clearInterval(this.breathTimer);
    this.voiceWorker?.terminate();
    this.ctx.close();
  }
}
