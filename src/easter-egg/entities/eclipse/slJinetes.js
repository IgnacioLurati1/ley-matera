import * as THREE from 'three';
import Jinetes, { S } from './jinetes';
import { zombieHealth } from '../../config/rules';
import { toWorld } from '../../world/eclipse/sanlorenzoCampo';
import { myId, isHost } from './common';

// Los jinetes del caos en San Lorenzo, en tandas (2026-10-07, el usuario: "la
// batalla final me pareció medio fácil; la haría más difícil añadiendo
// también jinetes del caos en tandas").
// Son los del Desgarro Cósmico (entities/eclipse/jinetes.js), sin la cúpula:
// dan vueltas alto sobre el campo, de a uno se paran de manos y se tiran en
// picada a embestir a un jugador. Se bajan a tiros, con la guadaña o con el
// rayo de la Furia.
// Cuándo (el anfitrión): en el desembarco una tanda; con El Eclipse en el
// campo, una de entrada y otra cada 45 s; en la corona, una de entrada y otra
// cada 40 s. En las escenas (Cabral, el final) se van al cielo.
// En línea: el anfitrión los mueve y manda dónde están por SanLorenzo ('jn').
// globalThis.__mduNoSlJinetes: sin esto.

// por fase: la primera tanda (s desde que empieza), cada cuánto otra (0: una
// sola) y de cuántos (más uno por jugador de más)
const WAVES = {
  1: { first: 22, every: 0, n: 3 },
  2: { first: 16, every: 45, n: 4 },
  4: { first: 4, every: 40, n: 5, sub: 'corona' },
};
// de a uno cada tanto, y no más de tantos en el aire
const SPAWN_EVERY = 0.9;
const CAP = 7;
const SNAP = 0.1;
const KILL_PTS = 150;

export default class SlJinetes {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    this.root = new THREE.Group();
    this.root.name = 'slJinetes';
    (sl.top || this.g.scene).add(this.root);
    // (lo que Jinetes le pide al evento: ver Desgarro10)
    this.st = { on: 1 };
    this.charge = 0;
    this.killPts = KILL_PTS;
    this.nextBig = false;
    const c = toWorld(4, 0, null, new THREE.Vector3());
    c.y += 4;
    // (sin cúpula: f > 1 es "afuera")
    this.cupula = { c, R: 60, Ry: 12, f: () => 9 };
    this.jin = new Jinetes(this);
    this.prevYasy = null;
    this.adapter = this.makeAdapter();
    this.reset();
  }

  get host() {
    return isHost(this.g);
  }

  nPlayers() {
    return 1 + (this.g.net ? this.g.net.remote.size : 0);
  }

  solid() {
    return false;
  }

  // el ritmo (Jinetes.hostTick): uno en picada por jugador y un respiro entre
  // picadas (sin la cúpula que los frene, con el del Desgarro no se aguantaba)
  maxDive(np) {
    return np;
  }

  diveGap(np) {
    return 3.2 / Math.sqrt(np);
  }

  shielded() {
    return false;
  }

  domeHit() {}

  // A quién se tira (el que no tenga ya uno encima, si hay).
  pickTarget(list) {
    const g = this.g;
    const out = [];
    if (g.player.alive && !g.player.downed) out.push({ id: myId(g), pos: g.player.pos });
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && r.pos) out.push({ id: r.id, pos: r.pos });
    if (!out.length) return null;
    const busy = new Set(list.filter((J) => J.st === S.wind || J.st === S.dive).map((J) => J.tgt));
    const free = out.filter((p) => !busy.has(p.id));
    const pool = free.length ? free : out;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  playerPos(id) {
    const g = this.g;
    if (id === myId(g)) return g.player.alive && !g.player.downed ? g.player.pos : null;
    const r = g.net?.remote.get(id);
    return r && !r.dead && !r.downed ? r.pos : null;
  }

  // (anfitrión) Uno bajado: a todos.
  onKill(J) {
    const c = J.hs[1];
    this.sl.send({ a: 'jn', s: 'die', i: J.i, p: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] });
  }

  // ---------------- las armas: en g.yasy (como en Desgarro10) ----------------
  makeAdapter() {
    const J = this.jin;
    const prev = () => this.prevYasy;
    return {
      slj: this,
      hitTest: (o, d, maxT, hits) => {
        prev()?.hitTest?.(o, d, maxT, hits);
        J.hitTest(o, d, maxT, hits);
      },
      inRadius: (check) => {
        prev()?.inRadius?.(check);
        J.inRadius(check);
      },
      // (los del Desgarro usan los mismos números: se reconocen por el objeto)
      damage: (z, amount, info) => (z?.jinete && J.list.some((x) => x.z === z) ? J.damage(z, amount, info) : prev()?.damage?.(z, amount, info) ?? false),
      byId: (id) => J.byId(id) || prev()?.byId?.(id) || null,
      onMelee: () => prev()?.onMelee?.() || false,
      onEvent: (m) => prev()?.onEvent?.(m),
      pushers: (add) => prev()?.pushers?.(add),
      update: (dt) => prev()?.update?.(dt),
    };
  }

  install() {
    const g = this.g;
    if (g.yasy === this.adapter) return;
    this.prevYasy = g.yasy || null;
    g.yasy = this.adapter;
  }

  uninstall() {
    const g = this.g;
    if (g.yasy === this.adapter) g.yasy = this.prevYasy || null;
    this.prevYasy = null;
  }

  // Al entrar a la arena: nada en el aire, el reloj de las tandas a cero.
  reset() {
    this.jin.reset();
    this.waveAt = -1;
    this.left = 0;
    this.spawnT = 0;
    this.snapT = 0;
    this.phase = -1;
    this.sub = '';
  }

  // (en todas) lo que manda el anfitrión
  apply(m) {
    if (m.s === 'die') this.jin.die(this.jin.list[m.i], Array.isArray(m.p) ? m.p : null);
    else if (m.s === 'l') {
      if (!this.host) this.jin.applySnap(m.l);
    } else if (m.s === 'fl') this.jin.flee();
  }

  // Se van al cielo (las escenas, el final).
  flee() {
    this.jin.flee();
    this.left = 0;
  }

  update(dt) {
    const g = this.g;
    const sl = this.sl;
    const S2 = sl.st;
    const ph = S2.phase;
    const W = WAVES[ph];
    const fight = !!W && (!W.sub || S2.sub === W.sub) && !sl.ee.scene && !sl.scene;
    if (fight) this.install();
    // (cambió la fase o la parte: el reloj de las tandas vuelve a empezar)
    if (ph !== this.phase || S2.sub !== this.sub) {
      this.phase = ph;
      this.sub = S2.sub;
      this.waveT = 0;
      this.waveN = 0;
      this.left = 0;
      if (!fight) this.jin.flee();
    }
    const playing = g.state === 'playing';
    if (this.host && fight && playing) {
      this.waveT += dt;
      const due = this.waveN === 0 ? W.first : W.every > 0 ? W.first + this.waveN * W.every : Infinity;
      if (this.waveT >= due) {
        this.waveN++;
        this.left += W.n + (this.nPlayers() - 1);
      }
      this.spawnT -= dt;
      if (this.left > 0 && this.spawnT <= 0 && this.jin.alive() < CAP) {
        const r = Math.max(g.rounds?.round || 10, 10);
        const h = Math.round(zombieHealth(r) * 1.15 * (1 + 0.2 * (this.nPlayers() - 1)));
        if (this.jin.spawn(h)) {
          this.left--;
          this.spawnT = SPAWN_EVERY;
        }
      }
    }
    this.jin.update(dt, playing && fight);
    if (this.host && g.net) {
      this.snapT -= dt;
      if (this.snapT <= 0 && !this.jin.idle()) {
        this.snapT = SNAP;
        g.net.event('pee', { k: 'sl', a: 'jn', s: 'l', l: this.jin.snap() });
      }
    }
    if (!fight && this.jin.idle()) this.uninstall();
  }

  dispose() {
    this.uninstall();
    this.jin.dispose();
    this.root.removeFromParent();
  }
}
