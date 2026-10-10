import { FEATURES, MAP_ID } from '../config/map';
import { crewIds, personaOf } from './cineCrew';
import { ACCIONES } from '../config/dialogos/generales';
import { CHARLAS } from '../config/dialogos';
import './dialogos.css';

// Los gauchos hablan durante la partida (el usuario, 2026-10-08). Tres tipos:
//  · de uno: alguien habla solo, o dice algo al hacer una cosa (tomar un perk,
//    sacar un mate de la caja, el Pack-a-Pava, levantar a un compañero). Las
//    de las cosas son de todos los mapas (config/dialogos/generales.js); los
//    que hablan solos de lo que ven, de cada mapa;
//  · de dos y de tres: charlas entre los que están en la partida, de cada mapa
//    (config/dialogos/<mapa>.js), con lo que se sabe de la historia hasta ese
//    mapa. Con cuatro, las de dos o tres de ellos.
// Cada uno con su carácter (ui/cineCrew PERSONA: el de las cinemáticas) y con
// la voz de su par de Mate no Numa: el Valiente la de Gil, el Miedoso la de
// Benito, el Canchero la de Cirilo y el Viejo la de Anacleto. En el estero y
// en el Eclipse los jugadores son ellos mismos, con su nombre.
// No se abusa: una charla cada 4 o 5 rondas, cada frase y cada charla una sola
// vez por partida (si se acaban, se acaban). Nunca encima de otra voz: esperan
// a que nadie hable, y si llega la voz del mapa, una radio o una cinemática
// mientras hablan, se callan (core/audio.js say low / onYield).
// En línea: las charlas las elige el anfitrión y las ven todos; las frases de
// las cosas las oyen todos, pero el subtítulo es solo del que la dice (el
// usuario). globalThis.__mduNoDialogos = true: sin nada de esto.

const VOICE = { valiente: 'gil', miedoso: 'benito', canchero: 'cirilo', viejo: 'anacleto' };
const NAME = { valiente: 'El Valiente', miedoso: 'El Miedoso', canchero: 'El Canchero', viejo: 'El Viejo' };
// el estero y el Eclipse: el papel de cada jugador (EsterosEgg/EclipseEgg roles)
const ROLE = { gil: 'valiente', anacleto: 'viejo', cirilo: 'canchero', benito: 'miedoso' };
const NAMED = { valiente: 'Gil', miedoso: 'Benito', canchero: 'Cirilo', viejo: 'Anacleto' };

// la primera charla, en esta ronda; después cada 4 o 5
const FIRST = 3;
// cuánto después de que empieza la ronda (s, al azar): la canción y la
// llegada de los bichos ya pasaron
const START_AT = [7, 20];
// entre frase y frase
const GAP = 0.45;
// las frases de las cosas: no siempre, y no más de una cada tanto (s de juego)
const QUIP_ODDS = 0.55;
const QUIP_EVERY = 45;

export default class Dialogos {
  constructor(g) {
    this.g = g;
    this.map = MAP_ID;
    this.charlas = CHARLAS[this.map] || [];
    this.reset();
    g.audio.onYield = () => this.cut();
  }

  // Partida nueva: todo se puede volver a decir.
  reset() {
    this.used = new Set();
    this.next = FIRST;
    this.round = 0;
    this.pending = null;
    this.play = null;
    this.sub = null;
    this.quipT = -1e9;
  }

  off() {
    return globalThis.__mduNoDialogos === true;
  }

  named() {
    return FEATURES.egg === 'pacto' || FEATURES.egg === 'primermate';
  }

  label(p) {
    return (this.named() ? NAMED : NAME)[p];
  }

  myId() {
    return this.g.net ? this.g.net.id : 0;
  }

  // El carácter del jugador `id`: su lugar en la cuadrilla (el mismo de las
  // cinemáticas) o, en el estero y el Eclipse, el personaje que le tocó.
  personaOf(id) {
    const g = this.g;
    if (this.named()) return ROLE[g.ee?.roleOf?.(id)] || null;
    const i = crewIds(g).indexOf(id);
    return i < 0 ? null : personaOf(i);
  }

  // Los que pueden hablar: los que están en la partida y en pie.
  present() {
    const g = this.g;
    const out = new Set();
    const mine = this.personaOf(this.myId());
    if (mine && g.player.alive && !g.player.downed) out.add(mine);
    for (const [id, r] of g.net?.remote || []) {
      if (r.dead || r.downed) continue;
      const p = this.personaOf(id);
      if (p) out.add(p);
    }
    return out;
  }

  // Algo que no deja hablar: una escena, la pelea final, alguien hablando (lo
  // que suena o un subtítulo de alguien que habla, como una radio con la voz
  // apagada). Los subtítulos de esta charla no cuentan.
  busy() {
    const g = this.g;
    const A = g.audio;
    if (g.state !== 'playing' || g.paused || g.menuOpen) return true;
    if (g.intro?.active || g.ee?.scene || g.cine || A.cine || g.arena?.active) return true;
    if (A.voiceEnd > A.ctx.currentTime) return true;
    return !!g.hud.lines?.some((l) => !l.out && !l.dlg && l.el.classList.contains('is-talk'));
  }

  update(dt) {
    const g = this.g;
    if (this.off() || g.state !== 'playing') return;
    if (this.play) {
      this.step(dt);
      return;
    }
    if (g.net?.guest) return;
    // la charla de la ronda (la elige el anfitrión o el que juega solo)
    const n = g.rounds?.round | 0;
    if (n !== this.round) {
      this.round = n;
      if (n >= this.next && !this.pending) this.pending = { t: START_AT[0] + Math.random() * (START_AT[1] - START_AT[0]) };
    }
    if (!this.pending) return;
    this.pending.t -= dt;
    if (this.pending.t > 0 || this.busy()) return;
    this.pending = null;
    const c = this.pick();
    // (sin charla para los que están: se prueba en la ronda que viene)
    if (!c) {
      this.next = n + 1;
      return;
    }
    this.next = n + 4 + (Math.random() < 0.5 ? 1 : 0);
    this.start(c);
    g.net?.event('dlg', { c: c.id });
  }

  // Una charla que no se dijo, de los que están en pie ahora. Con más gente,
  // más ganas de charla que de hablar solo.
  pick() {
    const g = this.g;
    const have = this.present();
    const n = g.rounds?.round | 0;
    const ok = this.charlas.filter((c) => !this.used.has(c.id) && c.who.every((p) => have.has(p)) && (c.from || 0) <= n && (!c.when || c.when(g)));
    if (!ok.length) return null;
    const w = (c) => (c.who.length === 1 ? (have.size > 1 ? 0.35 : 1) : c.who.length === 2 ? 1 : 1.6);
    let r = Math.random() * ok.reduce((s, c) => s + w(c), 0);
    for (const c of ok) {
      r -= w(c);
      if (r <= 0) return c;
    }
    return ok[ok.length - 1];
  }

  start(c) {
    this.used.add(c.id);
    this.play = { c, i: 0, t: 0 };
  }

  // La charla en curso: cada frase cuando terminó la anterior.
  step(dt) {
    const g = this.g;
    const P = this.play;
    if (g.audio.cine || g.ee?.scene || g.intro?.active || g.arena?.active) {
      this.cut();
      return;
    }
    P.t -= dt;
    if (P.t > 0 || g.audio.voiceEnd > g.audio.ctx.currentTime) return;
    if (P.i >= P.c.lines.length) {
      this.play = null;
      return;
    }
    if (g.hud.lines?.some((l) => !l.out && !l.dlg && l.el.classList.contains('is-talk'))) return;
    const [who, text] = P.c.lines[P.i];
    // el que tenía que hablar cayó: la charla queda ahí
    if (!this.present().has(who)) {
      this.play = null;
      return;
    }
    P.i++;
    P.t = this.line(who, text, true) + GAP;
  }

  // Dice una frase: su voz (baja prioridad) y, si `sub`, su subtítulo.
  line(p, text, sub) {
    const g = this.g;
    const d = g.audio.say(text, VOICE[p], { low: true });
    if (sub) {
      g.hud.speak(this.label(p), text, d + 1.2, `dlg is-dlg-${p}`);
      const l = g.hud.lines?.[g.hud.lines.length - 1];
      if (l && l.text === text) {
        l.dlg = true;
        this.sub = l;
      }
    }
    return d;
  }

  // Llegó otra voz (o una escena): se callan y se va el subtítulo. La charla
  // cortada antes de la mitad vuelve a la bolsa.
  cut() {
    const P = this.play;
    if (P && P.i <= P.c.lines.length / 2) this.used.delete(P.c.id);
    this.play = null;
    if (this.sub && !this.sub.out) this.g.hud.dropLine(this.sub);
    this.sub = null;
  }

  // El jugador hizo algo (kind: perk, caja, pava, levantar): a veces lo dice.
  did(kind) {
    const g = this.g;
    if (this.off() || this.play || g.time - this.quipT < QUIP_EVERY || Math.random() > QUIP_ODDS || this.busy()) return;
    const p = this.personaOf(this.myId());
    const L = ACCIONES[kind]?.[p];
    if (!L) return;
    const free = L.map((_, i) => i).filter((i) => !this.used.has(`${kind}.${p}.${i}`));
    if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)];
    this.quip(kind, p, i, true);
    g.net?.share('dlg', { q: kind, p, i });
  }

  quip(kind, p, i, mine) {
    const text = ACCIONES[kind]?.[p]?.[i];
    if (!text) return;
    this.used.add(`${kind}.${p}.${i}`);
    this.quipT = this.g.time;
    this.line(p, text, mine);
  }

  // Lo que llega de los otros (Session 'dlg'): la charla que eligió el
  // anfitrión, o la frase de un compañero (se oye, sin subtítulo).
  onNet(m) {
    if (this.off()) return;
    if (typeof m.c === 'string') {
      const c = this.charlas.find((x) => x.id === m.c);
      if (c && !this.play) this.start(c);
      return;
    }
    if (typeof m.q !== 'string' || !VOICE[m.p] || this.play || this.busy()) return;
    this.quip(m.q, m.p, m.i | 0, false);
  }
}
