// Los tiros grabados de las armas y perks (public/assets/sotano/sfx/armas):
// la carpeta "Sonidos nuevos" del usuario (2026-09-28), recortados, ecualizados
// y todos al mismo volumen. Acá se decide cómo suena cada uno. Si un grabado
// todavía no bajó, el que llama sintetiza el de siempre (core/audio.js).
const DIR = '/assets/sotano/sfx/armas/';

// Los volúmenes (scratchpad t_wlevel2.mjs: ponderación K, el máximo de 400 ms,
// los automáticos en ráfaga a su cadencia): un tiro de pistola -16, rifle -15,
// escopeta -13, francotirador -12,5; las ráfagas de -12 a -15; el Tronador
// -8,5. El usuario los encontró desparejos (el Campanario y la Máquina de
// Muerte aturdían) y los niveló así el 2026-09-28.
//
// Por tipo de tiro (el `sound` de config/weapons.js): tomas, volumen, eco,
// velocidad al azar (que no suenen todos iguales), cuántos a la vez (los
// automáticos se pisan: el más viejo se apaga) y `mech`: el cerrojo o la
// corredera sintetizados de siempre (cuándo y los golpecitos). `pap`: con el
// Pack-a-Pava le suma el piquito de siempre.
const SHOTS = {
  pistol: { ids: ['pistola'], gain: 0.53, reverb: 0.3, rate: [0.95, 1.05], max: 4, pap: true },
  rifle: { ids: ['rifle'], gain: 0.61, reverb: 0.4, rate: [0.96, 1.04], max: 5, pap: true },
  // (la ametralladora no tiene grabado: el rifle, más grave)
  lmg: { ids: ['rifle'], gain: 0.62, reverb: 0.45, rate: [0.84, 0.9], max: 5, pap: true },
  smg: { ids: ['subfusil'], gain: 0.78, reverb: 0.25, rate: [0.96, 1.05], max: 6, pap: true },
  shotgun: { ids: ['escopeta'], gain: 0.59, reverb: 0.5, rate: [0.96, 1.03], max: 3, pap: true },
  pump: { ids: ['escopeta'], gain: 0.59, reverb: 0.5, rate: [0.96, 1.03], max: 3, pap: true, mech: [0.32, [0, 0.12]] },
  sniper: { ids: ['sniper'], gain: 0.85, reverb: 0.6, rate: [0.97, 1.02], max: 2, pap: true, mech: [0.5, [0, 0.18, 0.3]] },
  gut: { ids: ['gut'], gain: 0.8, reverb: 0.4, rate: [0.95, 1.04], max: 3, pap: true },
  luzmala: { ids: ['luzmala'], gain: 0.56, reverb: 0.5, rate: [0.95, 1.05], max: 3 },
  mk3: { ids: ['mk3'], gain: 0.5, reverb: 0.35, rate: [0.96, 1.04], max: 4 },
  // el remolino del Mark III (clic derecho)
  mk3alt: { ids: ['mk3-remolino'], gain: 0.57, reverb: 0.4, rate: [0.98, 1.02], max: 2 },
  // la medialuna de la Hoz de la Muerte (clic derecho)
  hoz: { ids: ['hoz-medialuna'], gain: 0.6, reverb: 0.3, rate: [0.95, 1.05], max: 3 },
  // el Tereré de Invierno
  ice: { ids: ['terere'], gain: 0.52, reverb: 0.5, rate: [0.97, 1.03], max: 2 },
  // el Mate Tronador
  thunder: { ids: ['tronador'], gain: 0.88, reverb: 0.6, rate: [0.97, 1.03], max: 2 },
  // (la segunda tanda, 2026-09-29) `upRate`: con el Pack-a-Pava, más agudo o
  // más grave en vez del piquito
  // el Rayo Matero (el Mark II, más agudo)
  ray: { ids: ['rayo'], gain: 0.5, reverb: 0.4, rate: [0.97, 1.03], max: 3, upRate: 1.08 },
  // el Mate de Oro del Abuelo
  oro: { ids: ['oro'], gain: 0.69, reverb: 0.35, rate: [0.96, 1.04], max: 4, upRate: 0.94 },
  // la Bombilla del Diablo: uno de los tres chorros por tiro (la de Belcebú, más grave)
  stream: { ids: ['diablo-1', 'diablo-2', 'diablo-3'], gain: 0.71, reverb: 0.2, rate: [0.94, 1.06], max: 3, upRate: 0.9 },
  // la Máquina de Muerte del penal (la Bombilla Gut hecha Gatling del
  // infierno): el chasquido de cada tiro, de una Gatling de verdad a manivela
  // ("Gatling Gun Close" de mikewest, freesound.org 239596, CC0). Lo grueso
  // es el sostenido de gatlingBurst. Mejorada, más grave.
  gatling: { ids: ['gatling-1', 'gatling-2', 'gatling-3', 'gatling-4'], gain: 0.22, reverb: 0.3, rate: [0.96, 1.05], max: 6, upRate: 0.92 },
  // Los cuatro mates nuevos de la caja (2026-10-08), armados con grabaciones
  // CC0 de freesound.org (scratchpad tools/build.py de la sesión 02b0a4d1):
  // el Mate Labrador (escopeta automática): craigsmith "R11-58-Loud Shotgun
  // Blasts" (486060) + MrGungus "shotgun shoot" (773873) + db465 "aa12_fire" (865991)
  labrador: { ids: ['labrador-1', 'labrador-2', 'labrador-3'], gain: 1.1, reverb: 0.45, rate: [0.97, 1.03], max: 3, pap: true },
  // el Mate Explosivo (la salida del cohete): Jarusca "Rocket Launch" (521377)
  // con el golpe de misosound "BOOMING PUNCHY EXPLOSION" (251759) abajo
  cohete: { ids: ['cohete-1', 'cohete-2'], gain: 0.75, reverb: 0.4, rate: [0.96, 1.04], max: 3, pap: true },
  // el Mate Caótico: un tiro de craigsmith "S19-02 Light machine gun from
  // optical" (675593) con un pedazo de Heretic4522 "Sci-Fi LMG Concept"
  // (850829) arriba; al soltar, la cola de la ráfaga (`tail`). Las tres tomas
  // llevan el mismo pedazo del sci-fi y tiros vecinos de la misma ráfaga (antes
  // cada una era otro pedazo y parecían armas distintas al azar)
  caotico: { ids: ['caotico-1', 'caotico-2', 'caotico-3'], gain: 0.94, reverb: 0.4, rate: [0.97, 1.03], max: 5, upRate: 0.94, tail: 'caotico-cola' },
  // la Llamarada Matera: un tiro de fusil (michorvath "AR15 rifle shot" 427596)
  // con la llamarada (Za-Games "Fire Burst Flash" 539972); las tres tomas, el
  // mismo fusil y la misma llamarada apenas corridos (antes una era otro fusil
  // con otra bola de fuego y parecían dos armas)
  llamarada: { ids: ['llamarada-1', 'llamarada-2', 'llamarada-3'], gain: 0.56, reverb: 0.4, rate: [0.96, 1.04], max: 5, upRate: 0.93 },
};
// si el grabado no bajó: qué sintetizado hace de ese tipo nuevo. El Mate
// Porongo del principio no tiene grabado a propósito: el usuario quiso el
// sintetizado de antes (2026-09-29), solo para ese.
const ALIAS = { gut: 'shotgun', luzmala: 'ray', mk3alt: 'ray', hoz: 'ray', oro: 'ray', porongo: 'pistol', gatling: 'lmg', labrador: 'shotgun', cohete: 'launcher', caotico: 'lmg', llamarada: 'rifle' };

// Los demás grabados (los piden por nombre): volumen y eco.
const ONE = {
  // (la toma nueva, 2026-09-29: más llena que la de antes, al mismo volumen)
  'porongo-explosion': { gain: 0.95, reverb: 0.6, ref: 4 },
  'mk3-agujero': { gain: 1, reverb: 0.5, ref: 5 },
  'fuego-1': { gain: 0.63, reverb: 0.35 },
  'fuego-2': { gain: 0.63, reverb: 0.35 },
  'fuego-cargado': { gain: 1.6, reverb: 0.5 },
  cherry: { gain: 1.6, reverb: 0.3, ref: 6 },
  'pava-recarga': { gain: 0.55, reverb: 0.08 },
  'agua-caliente': { gain: 0.8, reverb: 0.3, ref: 4 },
  // el Farol de las Ánimas: el alma que sale del muerto (weapons/Potenciadores.js)
  alma: { gain: 0.36, reverb: 0.55, ref: 4 },
  // la Bombilla Ácida (2026-09-29): el reventón de cada frasco, las burbujas
  // del frasco pegado antes de reventar y el charco que queda chirriando
  'acido-explosion': { gain: 0.6, reverb: 0.55, ref: 4 },
  'acido-burbujas': { gain: 0.45, reverb: 0.2, ref: 2.5 },
  'acido-charco': { gain: 0.4, reverb: 0.25, ref: 3 },
  // la Máquina de Muerte: los caños que toman vuelta y los que frenan al
  // soltar el gatillo ("MiniGun Shooting" de Steelskull, freesound.org 153492,
  // CC0: la frenada del final, y un pedazo dado vuelta para el arranque)
  'gatling-arranque': { gain: 0.8, reverb: 0.2 },
  'gatling-fin': { gain: 0.9, reverb: 0.3 },
  // el final de la ráfaga: el C-RAM que corta y su eco ("C-RAM - Firing (+
  // Echo)" de gurkenjaeger13, freesound.org 621817, CC0)
  'gatling-cola': { gain: 0.7, reverb: 0.2, ref: 6 },
  // el reventón del cohete del Mate Explosivo (uno de los dos al azar):
  // misosound "BOOMING PUNCHY EXPLOSION - close, big" (251759) y unfa
  // "Grenade Explosion SFX (medium-sized, meaty, realistic)" (609587), CC0
  'cohete-boom-1': { gain: 1.22, reverb: 0.6, ref: 5 },
  'cohete-boom-2': { gain: 1.41, reverb: 0.6, ref: 5 },
  // el final de una ráfaga del Mate Caótico (SHOTS.caotico.tail)
  'caotico-cola': { gain: 0.9, reverb: 0.35, ref: 5 },
};
// Los que se repiten mientras dura algo (el remolino del Zonda, la ventisca del
// Penitente, la bola de rayos de Illapa): cuánto dura la vuelta (build.py le
// pega PAD segundos de cada lado, así el corte no se nota).
const PAD = 0.1;
const LOOPS = {
  'viento-loop': { len: 0.56, gain: 0.9, reverb: 0.5, ref: 5 },
  'hielo-loop': { len: 0.95, gain: 0.7, reverb: 0.6, ref: 5 },
  'rayo-bola-loop': { len: 7.95, gain: 1, reverb: 0.4, ref: 4 },
  // el rayo de oro de la hoz (weapons/hozBeam.js): el cuerpo de la medialuna
  // estirado en granos, el zumbido del Rayo Matero y un acorde de oro
  // (scratchpad hozloop/build.py, 2026-09-30)
  'hoz-rayo-loop': { len: 3.0, gain: 0.55, reverb: 0.35, ref: 5 },
  // la Máquina de Muerte (scratchpad 026bfe27…/snd/build2.py, 2026-10-07): el
  // BRRRT sostenido mientras tira (el C-RAM, la Gatling de 20 mm de
  // gurkenjaeger13, freesound.org 621817, CC0), el rugido del infierno debajo
  // (un lanzallamas, "Flamethrower" de SamsterBirdies, freesound.org 490166,
  // CC0) y el zumbido del tambor girando sin tirar (la minigun de Steelskull,
  // freesound.org 153492, CC0)
  'gatling-loop': { len: 2.6, gain: 0.5, reverb: 0.3, ref: 6 },
  'gatling-fuego': { len: 3.0, gain: 0.26, reverb: 0.25, ref: 5 },
  'gatling-giro': { len: 0.36, gain: 0.9, reverb: 0.1, ref: 4 },
};

// a cuánto baja la cola del tiro anterior cuando sale el siguiente del mismo tipo
const CHOKE = 0.3;
// la ráfaga: con menos de DENSE s entre tiro y tiro, cada uno suena más bajo
// ((hueco / DENSE) ^ 0,6; a 750 por minuto -2,5 dB, a 1300 -5,4 dB): a la
// cadencia de una ametralladora los tiros se suman y aturdían
const DENSE = 0.13;

const rnd = (a, b) => a + Math.random() * (b - a);

export default class WeaponSfx {
  constructor(audio) {
    this.a = audio;
    this.buf = {};
    this.live = {};
    const ids = new Set([...Object.values(SHOTS).flatMap((s) => s.ids), ...Object.keys(ONE), ...Object.keys(LOOPS)]);
    for (const id of ids) {
      fetch(DIR + id + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => audio.ctx.decodeAudioData(ab))
        .then((b) => {
          this.buf[id] = b;
        })
        .catch(() => {});
    }
  }

  has(id) {
    return !!this.buf[id];
  }

  alias(kind) {
    return ALIAS[kind] || kind;
  }

  // Todo lo de acá va por el volumen de las armas (Opciones → Sonido).
  withCat(fn) {
    const a = this.a;
    const was = a.cat;
    a.cat = 'weapons';
    try {
      return fn();
    } finally {
      a.cat = was;
    }
  }

  // La Máquina de Muerte tirando: el sostenido y el fuego siguen mientras
  // lleguen tiros (uno para los míos, sin lugar; otro para los de los
  // compañeros, en su lugar) y se cortan con la cola del eco 0,12 s después
  // del último (0,25 s el de un compañero: sus tiros llegan por la red).
  // false si los grabados no bajaron.
  gatlingBurst(pos, up) {
    if (!this.buf['gatling-loop']) return false;
    const key = pos ? 'r' : 'me';
    const B = (this.bursts ||= {});
    let b = B[key];
    if (!b) {
      const rate = up ? 0.93 : 1;
      b = B[key] = { body: this.loop('gatling-loop', pos, { fadeIn: 0.02, rate }), fire: this.loop('gatling-fuego', pos, { fadeIn: 0.12, rate }) };
    } else if (pos) {
      b.body?.move(pos);
      b.fire?.move(pos);
    }
    b.pos = pos ? pos.clone() : null;
    clearTimeout(b.timer);
    b.timer = setTimeout(() => {
      b.body?.stop(0.06);
      b.fire?.stop(0.35);
      if (B[key] === b) delete B[key];
      this.play('gatling-cola', { pos: b.pos, rate: up ? 0.93 : 1 });
    }, pos ? 250 : 120);
    return true;
  }

  // Un tiro grabado. true si sonó (si no, el que llama sintetiza).
  shot(kind, pos, up) {
    // (la Máquina de Muerte: el sostenido; el chasquido, uno sí y uno no)
    if (kind === 'gatling' && this.gatlingBurst(pos, up)) {
      this.gN = (this.gN || 0) + 1;
      if (this.gN % 2) return true;
    }
    const S = SHOTS[kind];
    const id = S && S.ids[Math.floor(Math.random() * S.ids.length)];
    if (!id || !this.buf[id]) return false;
    const a = this.a;
    // los automáticos: la cola del tiro anterior baja cuando sale el nuevo
    // (si no, las colas se suman y la ráfaga aturde) y, si ya suenan muchos,
    // el más viejo se apaga rápido. Los míos y los de los demás, aparte.
    const key = kind + (pos ? ':r' : '');
    const L = (this.live[key] ||= []);
    const T = (this.lastT ||= {});
    const gap = a.now - (T[key] ?? -1);
    T[key] = a.now;
    const dense = gap < DENSE ? Math.max(0.45, Math.pow(gap / DENSE, 0.6)) : 1;
    while (L.length >= S.max) this.fadeOut(L.shift(), 0.03);
    for (const x of L) {
      if (x.choked) continue;
      x.choked = true;
      x.out?.gain.setTargetAtTime(x.out.gain.value * CHOKE, a.now, 0.025);
    }
    const src = this.withCat(() =>
      a.playBuffer(this.buf[id], {
        pos,
        gain: S.gain * dense * (0.92 + Math.random() * 0.12),
        reverb: S.reverb,
        rate: rnd(S.rate[0], S.rate[1]) * (up ? (S.upRate ?? (S.pap ? 0.95 : 1)) : 1),
        ref: pos ? 3 : undefined,
      }),
    );
    L.push(src);
    src.onended = () => {
      const i = L.indexOf(src);
      if (i >= 0) L.splice(i, 1);
    };
    const t = a.now;
    if (up && S.pap) {
      const o = this.withCat(() => a.out({ pos, reverb: 0.2, gain: S.gain }));
      a.tone(o, { t, dur: 0.25, type: 'square', freq: 900, freqEnd: 120, gain: 0.06 });
    }
    if (S.mech) a.mech(t + S.mech[0], S.mech[1]);
    // la cola de la ráfaga: suena una vez, 0,12 s después del último tiro
    // (0,25 s si es de un compañero: sus tiros llegan por la red)
    if (S.tail) {
      const TT = (this.tails ||= {});
      clearTimeout(TT[key]);
      const at = pos ? pos.clone() : null;
      TT[key] = setTimeout(() => {
        delete TT[key];
        this.play(S.tail, { pos: at, rate: up ? S.upRate ?? 1 : 1 });
      }, pos ? 250 : 120);
    }
    return true;
  }

  fadeOut(src, secs = 0.05) {
    const a = this.a;
    try {
      src.out?.gain.setTargetAtTime(0, a.now, secs / 3);
      src.stop(a.now + secs + 0.02);
    } catch {
      /* ya paró */
    }
  }

  // Uno de los otros grabados (ONE). when: en cuántos segundos. Devuelve la
  // fuente, o null si no bajó.
  play(id, { pos = null, gain = 1, rate = 1, when = 0, offset = 0, filter = null } = {}) {
    const O = ONE[id];
    if (!O || !this.buf[id]) return null;
    const a = this.a;
    return this.withCat(() => a.playBuffer(this.buf[id], { pos, gain: O.gain * gain, reverb: O.reverb, rate, when: when ? a.now + when : 0, offset, filter, ref: pos ? O.ref : undefined }));
  }

  // Uno de los otros grabados que dura `dur` segundos: después se apaga de a
  // poco (en `fade` s). tail: el final del grabado (no el principio). null si
  // no bajó.
  playFor(id, dur, opts = {}) {
    const buf = this.buf[id];
    if (!buf) return null;
    const offset = opts.tail ? Math.max(0, buf.duration - dur) : 0;
    const src = this.play(id, { ...opts, offset });
    if (!src) return null;
    const a = this.a;
    const g = src.out.gain;
    const v = g.value;
    const fade = Math.min(opts.fade ?? 1.5, dur * 0.5);
    const t = a.now + (opts.when || 0);
    const end = t + Math.max(0.1, dur);
    // (desde la mitad del grabado: entra de a poco, sin chasquido)
    if (offset) {
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(v, t + 0.08);
    }
    if (end < t + buf.duration - offset) {
      g.setValueAtTime(v, end - fade);
      g.linearRampToValueAtTime(0.0001, end);
      src.stop(end + 0.05);
    }
    return src;
  }

  // Uno de los otros grabados (ONE) que sigue a algo que se mueve: { move(pos),
  // stop(secs) } o null si no bajó. Si nadie lo apaga a tiempo, repite solo
  // el último pedacito (la cola, bajita), no vuelve a arrancar.
  follow(id, pos, { gain = 1, rate = 1 } = {}) {
    const O = ONE[id];
    const buf = this.buf[id];
    if (!O || !buf) return null;
    return this.loopBuf(buf, pos, { gain: O.gain * gain, reverb: O.reverb, ref: O.ref ?? 3, rate, fadeIn: 0.03, from: Math.max(0, buf.duration - 0.35), to: buf.duration });
  }

  // Un sonido que se repite hasta que lo apagan. pos: dónde (null: sin
  // posición); lo mueve move(pos). Devuelve { move(pos), stop(secs) } o null
  // si no bajó. rate: más grave o más agudo; fadeIn: cuánto tarda en entrar.
  loop(id, pos = null, { gain = 1, rate = 1, fadeIn = 0.25 } = {}) {
    const Lp = LOOPS[id];
    const buf = this.buf[id];
    if (!Lp || !buf) return null;
    return this.loopBuf(buf, pos, { gain: Lp.gain * gain, reverb: Lp.reverb, ref: Lp.ref, rate, fadeIn, from: PAD, to: PAD + Lp.len, offset: PAD + Math.random() * Lp.len });
  }

  // El loop de cualquier grabado (buf): da vueltas entre from y to (segundos)
  // y arranca en offset (desde el principio, si no viene).
  loopBuf(buf, pos = null, { gain = 1, reverb = 0.3, ref = 3, rate = 1, fadeIn = 0.25, from = 0, to = buf.duration, offset = 0 } = {}) {
    const a = this.a;
    const c = a.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = from;
    src.loopEnd = to;
    src.playbackRate.value = rate;
    const env = c.createGain();
    const t = a.now;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + fadeIn);
    let pan = null;
    if (pos) {
      pan = c.createPanner();
      pan.panningModel = a.flat ? 'equalpower' : 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = ref;
      pan.rolloffFactor = 0.8;
      pan.maxDistance = 70;
      if (pan.positionX) {
        pan.positionX.value = pos.x;
        pan.positionY.value = pos.y;
        pan.positionZ.value = pos.z;
      } else pan.setPosition(pos.x, pos.y, pos.z);
    }
    const o = this.withCat(() => a.out({ gain, reverb }));
    src.connect(env);
    (pan ? env.connect(pan) : env).connect(o);
    // (los de LOOPS arrancan en un lugar al azar de la vuelta: dos iguales no suenan en fase)
    src.start(t, offset);
    let done = false;
    return {
      move: (p) => {
        if (!pan || done) return;
        if (pan.positionX) {
          pan.positionX.setTargetAtTime(p.x, a.now, 0.03);
          pan.positionY.setTargetAtTime(p.y, a.now, 0.03);
          pan.positionZ.setTargetAtTime(p.z, a.now, 0.03);
        } else pan.setPosition(p.x, p.y, p.z);
      },
      stop: (secs = 0.6) => {
        if (done) return;
        done = true;
        const n = a.now;
        try {
          env.gain.cancelScheduledValues(n);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), n);
          env.gain.exponentialRampToValueAtTime(0.0001, n + secs);
          src.stop(n + secs + 0.05);
        } catch {
          /* ya paró */
        }
        src.onended = () => o.disconnect();
      },
    };
  }
}
