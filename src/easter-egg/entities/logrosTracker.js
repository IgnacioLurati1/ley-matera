import * as L from '../core/logros';
import * as P from '../core/progress';
import { PERK_SPOTS, DOORS } from '../config/map';
import { eggsDone, eggsTotal } from '../core/eggs';

// Los logros durante la partida (la lista y el guardado, en core/logros.js).
// No toca los archivos de la partida: se cuelga de lo que ya avisa (los
// métodos de g.levels, que son los mismos para el anfitrión y el invitado, y
// g.hud.achievement) y mira el resto cada medio segundo: las bajas propias
// (de invitado, las de la tabla que manda el anfitrión), la ronda, los perks,
// las puertas, los minijefes que caen y lo que se corre con Stamin-Up.
// Las partidas con trampas (g.cheated) no suman, como la experiencia.
const BUYS = new Set(['door', 'perk', 'pap', 'box', 'salebox', 'wallbuy']);
const GAP = 3.4;

export default class LogrosTracker {
  constructor(g) {
    this.g = g;
    this.run = null;
    this.queue = [];
    this.nextT = 0;
    this.bosses = new Set();
    this.hookHud();
    this.hookLevels();
    this.retro();
    this.offRank = P.on('change', () => this.rank());
    this.timer = setInterval(() => this.tick(), 500);
  }

  // ---------- lo que ya avisa ----------
  hookHud() {
    const g = this.g;
    const hud = g.hud;
    this.show = hud.achievement.bind(hud);
    hud.achievement = (title, text) => {
      this.show(title, text);
      this.nextT = performance.now() + GAP * 1000;
      if (g.cheated) return;
      const d = L.byTitle(title);
      if (d) L.unlock(d.id);
      else L.extra(title, text, g.mapId);
    };
  }

  hookLevels() {
    const g = this.g;
    const lv = g.levels;
    const wrap = (name, after) => {
      const orig = lv[name].bind(lv);
      lv[name] = (...a) => {
        const r = orig(...a);
        try {
          if (!g.cheated) after(...a);
        } catch (e) {
          console.error(e);
        }
        return r;
      };
    };
    wrap('newGame', () => this.startRun());
    wrap('bought', (it) => {
      if (!it) return;
      if (BUYS.has(it.kind) && this.run) this.run.buys++;
      if (it.kind === 'box' || it.kind === 'salebox') this.got(L.add('box'));
      if (it.kind === 'pap') this.got(L.unlock('pap'));
    });
    wrap('revive', () => this.got(L.unlock('revive')));
    wrap('egg', ({ challenge = false } = {}) => this.got(L.unlock(challenge ? 'reto' : `ee_${g.mapId}`)));
    wrap('superEgg', () => this.got(L.unlock('super')));
  }

  // Lo de antes de que hubiera logros: los easter eggs hechos, los récords de
  // cada mapa y el nivel (sin aviso).
  retro() {
    for (const id of eggsDone()) L.unlock(`ee_${id}`);
    if (eggsDone().length === eggsTotal()) L.unlock('super');
    for (const m of L.MAPS) {
      let best = 0;
      for (const mode of ['story', 'challenge']) {
        try {
          best = Math.max(best, JSON.parse(localStorage.getItem(this.g.keyOf(m.id, mode))) | 0);
        } catch {
          /* sin récord */
        }
      }
      if (best >= 2) L.setBest(m.id, best);
    }
    this.rank(true);
  }

  rank(quiet = false) {
    const r = P.rank();
    const out = [];
    if (r.prestige >= 1 || r.level >= 55) out.push(L.unlock('lvl55'));
    if (r.prestige >= 1) out.push(L.unlock('prest'));
    if (!quiet) this.got(out);
  }

  // ---------- la partida ----------
  startRun() {
    const g = this.g;
    this.run = { kills: 0, heads: 0, knife: 0, round: g.rounds?.round | 0, from: g.rounds?.round | 0, buys: 0, pos: null, m: 0 };
    this.bosses.clear();
    // (lo que quedó de la partida anterior ya está guardado)
    this.queue.length = 0;
  }

  // Mis bajas, cabezas y cuchilladas de esta partida.
  mine() {
    const g = this.g;
    if (g.net?.guest) {
      const row = (g.net.table || []).find((b) => b.id === g.net.id) || {};
      return { kills: row.kills | 0, heads: row.heads | 0, knife: row.knife | 0 };
    }
    return { kills: g.stats?.kills | 0, heads: g.stats?.headshots | 0, knife: g.stats?.knifeKills | 0 };
  }

  tick() {
    const g = this.g;
    this.flush();
    if (g.state !== 'playing' || g.cheated || g.intro?.active) return;
    if (!this.run) this.startRun();
    const R = this.run;
    // las bajas
    const m = this.mine();
    for (const k of ['kills', 'heads', 'knife']) {
      if (m[k] < R[k]) R[k] = m[k];
      if (m[k] > R[k]) {
        this.got(L.add(k, m[k] - R[k]));
        R[k] = m[k];
      }
    }
    // la ronda (desde la 2, el mapa cuenta como jugado)
    const r = g.rounds?.round | 0;
    if (r > R.round) {
      R.round = r;
      if (r >= 2) this.got(L.setBest(g.mapId, r));
      if (r >= 10 && R.from <= 1 && R.buys === 0) this.got(L.unlock('pobre'));
    }
    const p = g.player;
    // todos los perks del mapa a la vez
    const ids = [...new Set(PERK_SPOTS.map((s) => s.perk))];
    if (ids.length && ids.every((id) => p.perks.has(id))) this.got(L.unlock('perks'));
    // todas las puertas abiertas
    const open = g.world?.doorOpen;
    if (DOORS.length && open && DOORS.every((d, i) => open[i])) this.got(L.unlock('doors'));
    if (g.net?.remote?.size > 0) this.got(L.unlock('online'));
    // las empanadas (g.emp es de cada partida)
    if (g.emp && g.emp !== this.emp) {
      this.emp = g.emp;
      const eat = g.emp.eat.bind(g.emp);
      g.emp.eat = (...a) => {
        const out = eat(...a);
        if (!g.cheated) this.got(L.add('emp'));
        return out;
      };
    }
    // los minijefes que caen (de quien sea: el equipo los derrota)
    // (el jefe de ronda no es del pool: es g.zombies.boss)
    const zs = g.zombies?.boss ? [...(g.zombies.pool || []), g.zombies.boss] : g.zombies?.pool || [];
    for (const z of zs) {
      if (!z.boss || !z.active) {
        this.bosses.delete(z);
        continue;
      }
      if (!z.dead) this.bosses.add(z);
      else if (this.bosses.delete(z)) this.got(L.add('bosses'));
    }
    // lo corrido con Stamin-Up (sin contar los saltos de lugar)
    const at = p.pos;
    if (R.pos && p.alive && !p.downed && !p.ghost && p.perks.has('stamin')) {
      const d = Math.hypot(at.x - R.pos.x, at.z - R.pos.z);
      if (d < 6) R.m += d;
      if (R.m >= 5) {
        const n = Math.floor(R.m);
        R.m -= n;
        this.got(L.add('metros', n));
      }
    }
    R.pos = { x: at.x, z: at.z };
  }

  // ---------- el aviso ----------
  got(list) {
    for (const d of [].concat(list)) if (d) this.queue.push(d);
    this.flush();
  }

  // De a uno, con tiempo para leerlo (y solo en la partida).
  flush() {
    const g = this.g;
    if (!this.queue.length || g.state !== 'playing' || performance.now() < this.nextT) return;
    const d = this.queue.shift();
    this.show(d.name, d.desc);
    this.nextT = performance.now() + GAP * 1000;
  }

  dispose() {
    clearInterval(this.timer);
    this.offRank?.();
  }
}
