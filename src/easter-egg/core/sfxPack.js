// Los grabados de zombies, de los bichos de las rondas especiales y el
// "especial" de fondo de cada mapa (public/assets/sotano/sfx/pack). Vienen
// recortados, con un compresor suave y todos al mismo volumen; acá se decide
// cómo suena cada grupo: los zombies y los ataques, cerca y con poco eco; las
// llegadas de las rondas especiales, sin posición y con eco; los especiales,
// de fondo (apagados, bajos y con mucho eco). Si un grabado todavía no bajó,
// el que llama sintetiza el de siempre (core/audio.js).
import { MAP_ID, FEATURES } from '../config/map';

const DIR = '/assets/sotano/sfx/pack/';
const takes = (p, k) => Array.from({ length: k }, (_, i) => `${p}-${i + 1}`);

// Cada grupo: tomas, volumen, envío a eco, velocidad al azar (más grave o más
// aguda: que no suenen todos iguales), ref (a qué distancia se oye con toda su
// fuerza: lo grande se oye de lejos) y cuántos pueden sonar a la vez. Los de
// los zombies quedan parejos con los sintetizados de antes (las partes que
// suenan: -14 dB los grabados, -9 a -11 los sintetizados).
const GROUPS = {
  // zombies (todos los mapas)
  idle: { ids: takes('z-idle', 8), gain: 0.95, reverb: 0.28, rate: [0.86, 1.1], max: 5 },
  crawl: { ids: takes('z-munon', 5), gain: 0.95, reverb: 0.25, rate: [0.9, 1.08], max: 3 },
  attack: { ids: takes('z-ataque', 3), gain: 1.5, reverb: 0.15, rate: [0.9, 1.08], max: 5 },
  // el raro: de vez en cuando, en vez de un ataque
  rare: { ids: ['z-raro'], gain: 1.5, reverb: 0.2, rate: [0.95, 1.05], max: 2 },
  // los que corren: los mismos ataques, más agudos y apurados
  scream: { ids: takes('z-ataque', 3), gain: 1.6, reverb: 0.2, rate: [1.06, 1.2], max: 4 },
  death: { ids: takes('z-muerte', 8), gain: 1.2, reverb: 0.3, rate: [0.88, 1.1], max: 5 },
  // carpinchos: el llamado (al aparecer) y el ataque
  'capybara.call': { ids: takes('carp-llamado', 5), gain: 0.8, reverb: 0.5, rate: [0.94, 1.08], ref: 4, max: 4 },
  'capybara.attack': { ids: takes('carp-ataque', 5), gain: 1, reverb: 0.2, rate: [0.94, 1.1], max: 4 },
  // caballos: el relincho de la llegada (y más bajo cuando aparece cada uno), el galope y el ataque
  'horse.intro': { ids: ['caballo-arranque'], gain: 0.85, reverb: 0.6, rate: [1, 1] },
  'horse.spawn': { ids: ['caballo-arranque'], gain: 0.5, reverb: 0.45, rate: [0.9, 1.1], ref: 5, max: 2 },
  'horse.run': { ids: ['caballo-galope'], gain: 0.9, reverb: 0.5, rate: [1, 1] },
  'horse.attack': { ids: takes('caballo-ataque', 2), gain: 1.2, reverb: 0.2, rate: [0.94, 1.06], ref: 3, max: 3 },
  // pumas: el grito de la llegada (y el de cada uno al saltar) y el ataque
  'puma.intro': { ids: ['puma-arranque'], gain: 0.9, reverb: 0.8, rate: [1, 1] },
  'puma.cry': { ids: ['puma-arranque'], gain: 0.55, reverb: 0.6, rate: [0.9, 1.1], ref: 5, max: 3 },
  'puma.attack': { ids: ['puma-ataque'], gain: 1.2, reverb: 0.25, rate: [0.93, 1.08], ref: 3, max: 3 },
  // yacarés: se acercan (la creciente) y el tarascón
  'yacare.intro': { ids: ['yacare-acercandose'], gain: 0.9, reverb: 0.45, rate: [1, 1] },
  'yacare.attack': { ids: takes('yacare-ataque', 2), gain: 1.2, reverb: 0.2, rate: [0.94, 1.06], ref: 3, max: 3 },
};

// Tomas que quedaron más bajas al normalizar (picos muy arriba del resto)
const TRIM = { 'z-idle-2': 1.4, 'z-idle-3': 1.5, 'z-raro': 1.4, 'z-ataque-2': 1.12, 'z-munon-1': 1.1, 'z-munon-4': 1.15 };

// El especial de cada mapa: de fondo, cada tanto al arrancar una ronda. La
// torre los mezcla todos (como a los bichos y a los jefes). lp: qué tan
// apagado (lejos) suena.
const SPECIALS = {
  molino: { id: 'especial-molino', gain: 0.4, lp: 3200 },
  granja: { id: 'especial-granja', gain: 0.32, lp: 3000 },
  penal: { id: 'especial-penal', gain: 0.34, lp: 3000 },
  esteros: { id: 'especial-esteros', gain: 0.38, lp: 3400 },
  castillo: { id: 'especial-castillo', gain: 0.36, lp: 2200 },
};
// cuántas rondas por tramo: suena una vez en cada tramo (dos cada 30 rondas,
// sin excepción; antes era un 8 % por ronda y con mala suerte se amontonaba)
const SPECIAL_EVERY = 15;
// El sapucay del estero: un grito de muy lejos (bajo, sin agudos, con mucho
// eco y un rebote más apagado sobre el agua). Raro: una vez cada dos partidas
// de 30 rondas (en cada tramo de 30, la mitad de las veces, en una ronda al
// azar). Va por el mismo aviso que el especial (lo decide el anfitrión):
// code + los segundos de más dentro de la ronda (delay), así no cae siempre
// al arrancar y suena igual para todos.
const SAPUCAY = { id: 'sapucay', map: 'esteros', every: 30, odds: 0.5, gain: 0.24, lp: 2300, hp: 180, code: 100, delay: [5, 26] };

// Cuánto dura la canción de cada mapa al empezar la ronda (audio.roundStart):
// la llegada de la ronda especial suena unos segundos después, y recién ahí
// aparecen los bichos.
const SONG = { molino: 4.8, granja: 3.8, penal: 5, torre: 4.3, castillo: 3.8, esteros: 6, monumento: 6, eclipse: 6.2 };
const INTRO_GAP = 1.5;
// cuánto después de que empieza la llegada salen los primeros
const INTRO_SPAWN = { capybara: 2.4, horse: 3.4, puma: 1.8, yacare: 3 };

const rnd = (a, b) => a + Math.random() * (b - a);

export default class SfxPack {
  constructor(audio) {
    this.a = audio;
    this.buf = {};
    this.asked = new Set();
    this.live = {};
    this.last = {};
    this.map = null;
    this.load(['idle', 'crawl', 'attack', 'rare', 'death']);
  }

  // Baja las tomas de esos grupos (una sola vez cada una).
  load(groups, extra = []) {
    const ids = [...groups.flatMap((k) => GROUPS[k]?.ids || []), ...extra];
    for (const id of ids) {
      if (this.asked.has(id)) continue;
      this.asked.add(id);
      fetch(DIR + id + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => this.a.ctx.decodeAudioData(ab))
        .then((b) => {
          this.buf[id] = b;
        })
        .catch(() => this.asked.delete(id));
    }
  }

  // Al cambiar de mapa: los bichos de su ronda especial y su especial de fondo.
  sync() {
    // (con el modo: la torre del Challenge carga más que la de la historia)
    const key = `${MAP_ID}:${FEATURES?.egg || ''}`;
    if (this.map === key) return;
    this.map = key;
    const sp = FEATURES?.special;
    // (el Challenge de la torre suma los yacarés de la inundación: entities/challengeFlood.js)
    const kinds = sp === 'mixed' ? ['capybara', 'horse', ...(FEATURES.egg === 'reto' ? ['yacare'] : [])] : sp ? [sp] : [];
    const extra = this.specialIds().map((s) => s.id);
    if (MAP_ID === SAPUCAY.map) extra.push(SAPUCAY.id);
    this.load(Object.keys(GROUPS).filter((k) => kinds.includes(k.split('.')[0])), extra);
  }

  specialIds() {
    if (MAP_ID === 'torre') return Object.values(SPECIALS);
    return SPECIALS[MAP_ID] ? [SPECIALS[MAP_ID]] : [];
  }

  has(group) {
    this.sync();
    return !!GROUPS[group]?.ids.some((id) => this.buf[id]);
  }

  // Una toma al azar del grupo, sin repetir la última (si hay otra).
  pick(group) {
    const G = GROUPS[group];
    const ok = G.ids.filter((id) => this.buf[id]);
    if (!ok.length) return null;
    const pool = ok.length > 1 ? ok.filter((id) => id !== this.last[group]) : ok;
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.last[group] = id;
    return id;
  }

  // Suena una toma del grupo. true si sonó (false: no bajó o ya hay muchos
  // sonando; el que llama decide si sintetiza).
  play(group, { pos = null, gain = 1, when = 0, rate = 0, filter = null } = {}) {
    this.sync();
    const G = GROUPS[group];
    if (!G) return false;
    if (G.max && (this.live[group] || 0) >= G.max) return true;
    const id = this.pick(group);
    if (!id) return false;
    const a = this.a;
    const src = a.playBuffer(this.buf[id], {
      pos,
      gain: G.gain * gain * (TRIM[id] || 1),
      reverb: G.reverb,
      rate: rate || rnd(G.rate[0], G.rate[1]),
      when: when ? a.now + when : 0,
      filter,
      ref: G.ref,
    });
    this.live[group] = (this.live[group] || 0) + 1;
    src.onended = () => {
      this.live[group]--;
    };
    return src;
  }

  // Un zombie: kind idle, crawl, attack, scream, death (el jefe sigue sintetizado).
  zombie(pos, kind, gain = 1) {
    let group = kind;
    if (kind === 'attack' && Math.random() < 0.12) group = 'rare';
    if (!GROUPS[group] || group === 'boss') return false;
    return !!this.play(group, { pos, gain });
  }

  // Un bicho de ronda especial: kind capybara/horse/puma/yacare, act (call,
  // spawn, cry, attack...).
  animal(kind, act, pos, gain = 1) {
    return !!this.play(`${kind}.${act}`, { pos, gain });
  }

  // ---------- la llegada de la ronda especial ----------
  // Cuándo suena la llegada (segundos desde que arranca la ronda): después de
  // la canción de la ronda (en la torre, solo en las múltiplos de 5).
  introAt(round) {
    const song = MAP_ID === 'torre' && round % 5 && round !== 1 ? 0 : SONG[MAP_ID] ?? 4.5;
    return song + INTRO_GAP;
  }

  // Cuánto después de empezar la llegada salen los bichos.
  introSpawn(kind) {
    return INTRO_SPAWN[kind] ?? 2.5;
  }

  // La llegada: at (el jugador, para ubicar la manada alrededor). true si sonó.
  intro(kind, at) {
    this.sync();
    const a = this.a;
    if (kind === 'horse') {
      if (!this.has('horse.intro')) return false;
      this.play('horse.intro');
      // la tropilla se acerca al galope y pasa: sube, llega al máximo y se va
      const src = this.play('horse.run', { when: 0.6 });
      if (src?.out) {
        const t = a.now + 0.6;
        const o = src.out.gain;
        const g = o.value;
        o.setValueAtTime(0.0001, t);
        o.exponentialRampToValueAtTime(g, t + 3.2);
        o.setValueAtTime(g, t + 4.4);
        o.exponentialRampToValueAtTime(0.0001, t + 8);
      }
      return true;
    }
    if (kind === 'puma') {
      if (!this.has('puma.intro')) return false;
      // el grito y el eco de la montaña
      this.play('puma.intro');
      this.play('puma.cry', { when: 0.75, gain: 0.55, rate: 0.96, filter: [{ type: 'lowpass', freq: 2400 }] });
      return true;
    }
    if (kind === 'yacare') {
      return !!this.play('yacare.intro');
    }
    // los carpinchos: la manada llama desde varios lados, cada vez más cerca
    if (!this.has('capybara.call')) return false;
    const a0 = Math.random() * Math.PI * 2;
    [[0, 16, 0.8], [0.9, 12, 0.9], [1.8, 8, 1]].forEach(([when, d, k], i) => {
      const ang = a0 + i * 2.1;
      const pos = at ? { x: at.x + Math.cos(ang) * d, y: at.y + 1, z: at.z + Math.sin(ang) * d } : null;
      this.play('capybara.call', { pos, when, gain: k * (pos ? 1.6 : 1) });
    });
    return true;
  }

  // ---------- el especial de fondo ----------
  // ¿Suena esta ronda? Devuelve cuál (1..n) o 0. Lo decide el anfitrión.
  // Una vez por tramo de SPECIAL_EVERY rondas, en una ronda al azar del tramo
  // (desde la 2). Si esa ronda es especial o de creciente (Rounds no pregunta),
  // suena en la siguiente, siempre dentro del tramo.
  rollSpecial(round) {
    const L = this.specialIds();
    if (!L.length) return 0;
    // partida nueva (la ronda volvió para atrás): tramos de cero
    if (round < (this.specRound || 0)) {
      this.specBlock = null;
      this.sapBlock = null;
    }
    this.specRound = round;
    const block = Math.floor((round - 1) / SPECIAL_EVERY);
    if (this.specBlock !== block) {
      this.specBlock = block;
      this.specAt = block * SPECIAL_EVERY + 2 + Math.floor(Math.random() * (SPECIAL_EVERY - 3));
      this.specDone = false;
    }
    // (si le tocan los dos en la misma ronda, el sapucay pasa a la siguiente)
    if (this.specDone || round < this.specAt) return this.rollSapucay(round);
    this.specDone = true;
    return 1 + Math.floor(Math.random() * L.length);
  }

  // El sapucay (solo en el estero): SAPUCAY.code + los segundos de más, o 0.
  rollSapucay(round) {
    const S = SAPUCAY;
    if (MAP_ID !== S.map) return 0;
    const block = Math.floor((round - 1) / S.every);
    if (this.sapBlock !== block) {
      this.sapBlock = block;
      this.sapAt = Math.random() < S.odds ? block * S.every + 3 + Math.floor(Math.random() * (S.every - 5)) : Infinity;
    }
    if (round < this.sapAt) return 0;
    this.sapAt = Infinity;
    return S.code + Math.round(rnd(S.delay[0], S.delay[1]));
  }

  // Suena el especial k (de rollSpecial) a los `when` segundos.
  special(k, when = 0) {
    this.sync();
    if (k >= SAPUCAY.code) return this.sapucay(when + k - SAPUCAY.code);
    const S = this.specialIds()[k - 1];
    const buf = S && this.buf[S.id];
    if (!buf) return false;
    const a = this.a;
    a.playBuffer(buf, { gain: S.gain, reverb: 0.8, when: a.now + when, filter: [{ type: 'lowpass', freq: S.lp }] });
    return true;
  }

  // El sapucay a los `when` segundos: de lejos (sin posición: igual para
  // todos), todo al eco, y el rebote sobre el estero más bajo y más apagado.
  sapucay(when = 0) {
    const S = SAPUCAY;
    const buf = this.buf[S.id];
    if (!buf) return false;
    const a = this.a;
    const t = a.now + when;
    a.playBuffer(buf, { gain: S.gain, reverb: 1, when: t, filter: [{ type: 'lowpass', freq: S.lp }, { type: 'highpass', freq: S.hp }] });
    a.playBuffer(buf, { gain: S.gain * 0.35, reverb: 1, when: t + 0.42, filter: [{ type: 'lowpass', freq: 1300 }, { type: 'highpass', freq: 220 }] });
    return true;
  }
}

// El tipo de efecto de cada uno (el volumen de las opciones, core/audio.js
// CAT_OF): la llegada de los bichos de las rondas especiales va con los
// zombies; los especiales del mapa, con el ambiente.
for (const [n, cat] of [['intro', 'zombies'], ['special', 'world']]) {
  const fn = SfxPack.prototype[n];
  SfxPack.prototype[n] = function (...args) {
    const was = this.a.cat;
    this.a.cat = cat;
    try {
      return fn.apply(this, args);
    } finally {
      this.a.cat = was;
    }
  };
}
