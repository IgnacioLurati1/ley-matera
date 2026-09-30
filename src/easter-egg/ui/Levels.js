// La experiencia de la partida: cuánto da cada cosa (core/progress XP), el
// aviso de nivel nuevo en pantalla y el resumen del final (la barra que se
// llena nivel por nivel, lo que se ganó y lo desbloqueado).
//
// Cada jugador junta la suya: las bajas de un invitado las cuenta el
// anfitrión (net/Session creditKill) y se las manda con los puntos ('xp').
// Las partidas con atajos de prueba (g.cheated) no dan experiencia.

import * as P from '../core/progress';
import { zombieCount, dogCount } from '../config/rules';
import { rankSvg, pesoSvg } from './rankIcons';
import { unlocksAt, KIND_NAME } from './unlocks';
import { eggsDone, eggsTotal } from '../core/eggs';
import './levels.css';

const fmt = (n) => Math.round(n).toLocaleString('es-AR');

// Experiencia de una baja en la ronda `round`: la ronda reparte XP.killRound
// entre sus zombies (contados como si jugaras solo), así que con rondas más
// cargadas cada uno vale menos. Los jefes dan un tanto fijo.
export function killXp(round, z, type, zone) {
  if (z?.boss) return P.XP.boss;
  const r = Math.max(1, round | 0);
  const n = Math.max(6, z?.dog ? dogCount(r, 1) : zombieCount(r, 1));
  let v = P.XP.killRound(r) / n;
  if (type === 'knife') v *= P.XP.knife;
  else if (zone === 'head') v *= P.XP.head;
  return v;
}

// Por qué se ganó (para el resumen del final), en el orden en que se muestra.
const WHY = [
  ['kills', 'Bajas'],
  ['rounds', 'Rondas'],
  ['doors', 'Puertas abiertas'],
  ['buys', 'Compras'],
  ['boards', 'Ventanas'],
  ['revives', 'Compañeros levantados'],
  ['egg', 'Easter egg'],
  ['super', 'Super easter egg'],
];

const BUY = { perk: 'perk', pap: 'pap', box: 'box', salebox: 'box', wallbuy: 'wall', power: 'power' };

export default class Levels {
  constructor(g) {
    this.g = g;
    this.run = null;
    this.queue = [];
    this.toastEl = null;
    this.off = P.on('level', (u) => this.onLevel(u));
    this.retro();
  }

  // Los easter eggs hechos antes de que hubiera niveles (core/eggs) valen
  // igual: se acreditan una vez, como primera vez, y el super si están los seis.
  retro() {
    const d = P.profile();
    const miss = eggsDone().filter((m) => !d.eggs[m]);
    const all = eggsDone().length === eggsTotal();
    const sup = all && !d.superEgg;
    // (los 100 pesos del super easter egg llegaron después: también para el que ya lo tenía)
    const supPesos = all && !d.superPesos;
    if (!miss.length && !sup && !supPesos) return;
    let xp = 0;
    let pesos = 0;
    for (const m of miss) {
      P.markEggXp(m);
      xp += P.XP.egg * 2;
      pesos += P.PESOS.eggFirst;
    }
    if (sup && P.takeSuperEgg()) xp += P.XP.superEgg;
    if (supPesos && P.takeSuperPesos()) pesos += P.PESOS.superEgg;
    if (pesos) P.addPesos(pesos);
    if (xp) P.addXp(xp);
    P.setNote(`Te acreditamos ${miss.length ? `${miss.length === 1 ? 'el easter egg' : `los ${miss.length} easter eggs`} que ya habías hecho` : ''}${miss.length && (sup || supPesos) ? ' y ' : ''}${sup || supPesos ? 'el super easter egg' : ''}: ${xp ? `+${fmt(xp)} XP` : ''}${xp && pesos ? ' y ' : ''}${pesos ? `${pesos} pesos` : ''}.`);
  }

  // ---------- durante la partida ----------
  newGame() {
    const r = P.rank();
    this.run = { from: { level: r.level, prestige: r.prestige, xp: r.xp }, by: {}, total: 0, ups: [], pesos: 0, boards: 0, boardRound: 0, part: 0, ended: false };
    P.askPersist();
  }

  gain(n, why) {
    const g = this.g;
    if (!(n > 0) || g.cheated) return;
    if (!this.run) this.newGame();
    // la empanada del Patrón: experiencia doble un rato (entities/Empanadas)
    n *= g.emp?.xpMult?.() ?? 1;
    const R = this.run;
    // (las bajas dan fracciones: se juntan y se anota lo entero)
    R.part += n;
    const whole = Math.floor(R.part);
    if (whole <= 0) return;
    R.part -= whole;
    R.by[why] = (R.by[why] || 0) + whole;
    R.total += whole;
    const ups = P.addXp(whole);
    for (const u of ups) {
      R.ups.push(u);
      R.pesos += u.pesos;
    }
  }

  kill(z, type, zone) {
    this.gain(killXp(this.g.rounds?.round, z, type, zone), 'kills');
  }

  round(n) {
    this.gain(P.XP.round(n), 'rounds');
  }

  // Una compra que salió (Interactables; de invitado, cuando el anfitrión la aprobó).
  bought(it) {
    if (!it) return;
    if (it.kind === 'door') return this.gain(P.XP.door, 'doors');
    if (it.kind === 'repair') {
      const R = this.run;
      const n = this.g.rounds?.round | 0;
      if (R && R.boardRound !== n) {
        R.boardRound = n;
        R.boards = 0;
      }
      if (R && R.boards >= P.XP.boardCap) return;
      if (R) R.boards += P.XP.board;
      return this.gain(P.XP.board, 'boards');
    }
    const k = BUY[it.kind];
    if (k) this.gain(P.XP[k], 'buys');
  }

  revive() {
    this.gain(P.XP.revive, 'revives');
  }

  // Terminó el easter egg (Game.win). `first`: primera vez en este mapa en el
  // perfil. `superEgg`: con este se completaron los seis (una sola vez).
  egg({ challenge = false } = {}) {
    const g = this.g;
    if (g.cheated) return;
    if (challenge) return this.gain(P.XP.challenge, 'egg');
    const first = P.markEggXp(g.mapId);
    this.gain(P.XP.egg * (first ? 2 : 1), 'egg');
    const n = first ? P.PESOS.eggFirst : P.PESOS.egg;
    P.addPesos(n);
    if (this.run) this.run.pesos += n;
  }

  superEgg() {
    if (this.g.cheated || !P.takeSuperEgg()) return;
    this.gain(P.XP.superEgg, 'super');
    // y 100 pesos (y el Mate Supremo en la caja: core/eggs supremoOn)
    if (!P.takeSuperPesos()) return;
    P.addPesos(P.PESOS.superEgg);
    if (this.run) this.run.pesos += P.PESOS.superEgg;
  }

  // Fin de la partida (muerte o victoria): a veces un peso de más en las
  // partidas largas. Devuelve lo de la partida para el resumen.
  endGame() {
    const R = this.run;
    if (!R || R.ended) return R;
    R.ended = true;
    const g = this.g;
    const r = g.stats?.round | 0;
    if (!g.cheated && r >= 10) {
      // desde la ronda 10: 15% y +2% por ronda (hasta 60%); desde la 25, uno seguro
      let n = Math.random() < Math.min(0.6, 0.15 + (r - 10) * 0.02) ? 1 : 0;
      if (r >= 25) n++;
      if (n) {
        P.addPesos(n);
        R.pesos += n;
        R.drop = n;
      }
    }
    if (R.total > 0) P.countGame();
    return R;
  }

  // ---------- el aviso de nivel ----------
  // (solo en la partida: en el menú y en el final lo muestra el resumen)
  onLevel(u) {
    if (this.g.state !== 'playing') return;
    this.queue.push(u);
    // los que suben juntos (una sola suma) van en un solo aviso
    if (!this.showing) {
      this.showing = true;
      setTimeout(() => this.nextToast(), 0);
    }
  }

  nextToast() {
    const g = this.g;
    if (!this.queue.length || g.state !== 'playing') {
      this.queue.length = 0;
      this.showing = false;
      return;
    }
    this.showing = true;
    // si sube varios de una (el easter egg), se muestra el último con la cuenta
    const all = this.queue.splice(0);
    const last = all[all.length - 1];
    const n = all.length;
    const pesos = all.reduce((a, x) => a + x.pesos, 0);
    const news = all.flatMap((x) => unlocksAt(x.level, x.prestige));
    const el = document.createElement('div');
    el.className = 'mdu-lvup';
    const title = n > 1 ? `+${n} niveles` : '¡Subiste de nivel!';
    const r = { level: last.level, prestige: last.prestige };
    el.innerHTML = `<div class="mdu-lvup__glow"></div>${rankSvg(r, 84)}<div class="mdu-lvup__txt"><small>${title}</small><b>Nivel ${last.level}</b><span>${last.prestige >= P.MASTER ? 'Maestro' : P.rankName(last.level)}${last.prestige && last.prestige < P.MASTER ? ` · Prestigio ${P.PRESTIGE_NAMES[last.prestige]}` : ''}</span>${pesos ? `<em>${pesoSvg(18)} +${pesos} ${pesos > 1 ? 'pesos' : 'peso'}</em>` : ''}${news.length ? `<i>Nuevo: ${news.map((x) => x.name).join(' · ')}</i>` : ''}</div>`;
    g.root.appendChild(el);
    this.toastEl = el;
    // un acorde corto que sube (por el bus de la música)
    try {
      if (g.audio?.ctx?.state === 'running') g.audio.tune([[72, 0.5], [76, 0.5], [79, 0.5], [84, 2]], { wave: 'triangle', bpm: 220, gain: 0.14, cutoff: 3600 });
    } catch {
      /* sin audio */
    }
    setTimeout(() => el.classList.add('is-out'), 3600);
    setTimeout(() => {
      el.remove();
      if (this.toastEl === el) this.toastEl = null;
      this.nextToast();
    }, 4200);
  }

  // ---------- el resumen del final (Menus.gameOver) ----------
  summary(screen) {
    let box = screen.querySelector('[data-xp]');
    if (!box) {
      box = document.createElement('div');
      box.className = 'mdu-xp';
      box.dataset.xp = '';
      const after = screen.querySelector('[data-stats]');
      after.after(box);
    }
    cancelAnimationFrame(this.anim);
    const R = this.endGame();
    const g = this.g;
    if (!R || (!R.total && !R.pesos)) {
      box.hidden = !g.cheated;
      box.innerHTML = g.cheated ? '<p class="mdu-small" style="margin:0">Partida con atajos de prueba: no suma experiencia.</p>' : '';
      return;
    }
    box.hidden = false;
    const to = P.rank();
    const rows = WHY.filter(([k]) => R.by[k]).map(([k, label]) => `<li><span>${label}</span><b>+${fmt(R.by[k])}</b></li>`);
    const news = [];
    for (const u of R.ups) news.push(...unlocksAt(u.level, u.prestige));
    const nUps = R.ups.length;
    box.innerHTML = `
      <div class="mdu-xp__head">
        <div class="mdu-xp__emb" data-emb>${rankSvg(R.from, 64)}</div>
        <div class="mdu-xp__mid">
          <div class="mdu-xp__lvl"><b data-lv>Nivel ${R.from.level}</b><span data-rn>${R.from.prestige >= P.MASTER ? 'Maestro' : P.rankName(R.from.level)}</span></div>
          <div class="mdu-xp__bar"><i data-bar></i></div>
          <small data-num></small>
        </div>
        <strong class="mdu-xp__gain" data-gain>+0 XP</strong>
      </div>
      <ul class="mdu-xp__by">${rows.join('')}</ul>
      ${nUps || R.pesos ? `<p class="mdu-xp__ups">${nUps ? `¡Subiste ${nUps} ${nUps > 1 ? 'niveles' : 'nivel'}!` : ''}${R.pesos ? ` <span>${pesoSvg(18)} +${R.pesos} ${R.pesos > 1 ? 'pesos' : 'peso'} para la pulpería</span>` : ''}</p>` : ''}
      ${news.length ? `<div class="mdu-xp__new">${news.map((x) => `<span class="mdu-xp__chip mdu-xp__chip--${x.kind}">${KIND_NAME[x.kind] || 'Nuevo'}: <b>${x.name}</b></span>`).join('')}</div>` : ''}
      ${to.canPrestige ? '<p class="mdu-xp__ups">Llegaste al nivel 55: ya podés prestigiar desde el menú (Niveles).</p>' : ''}`;
    this.animate(box, R, to);
  }

  // La barra se llena nivel por nivel (unos 2,5 s en total).
  animate(box, R, to) {
    const $ = (s) => box.querySelector(s);
    const steps = [];
    let lv = R.from.level;
    let pr = R.from.prestige;
    let xp = R.from.xp;
    for (const u of R.ups) {
      steps.push({ level: lv, prestige: pr, a: xp / P.need(lv, pr), b: 1 });
      lv = u.level;
      pr = u.prestige;
      xp = 0;
    }
    steps.push({ level: to.level, prestige: to.prestige, a: xp / P.need(lv, pr), b: to.max ? 1 : to.xp / to.need });
    const per = Math.max(260, Math.min(900, 2400 / steps.length));
    const t0 = performance.now();
    let shown = -1;
    const tick = (now) => {
      if (!box.isConnected) return;
      // (el primer cuadro puede traer una hora anterior a t0: sin el tope, el
      // paso -1 no existe, tiraba error y la barra quedaba en +0 XP)
      const e = Math.max(0, now - t0);
      const i = Math.min(steps.length - 1, Math.floor(e / per));
      const k = i === steps.length - 1 && e >= per * steps.length ? 1 : Math.min(1, (e - i * per) / per);
      const s = steps[i];
      const f = 1 - (1 - k) ** 3;
      $('[data-bar]').style.width = `${(s.a + (s.b - s.a) * f) * 100}%`;
      if (shown !== i) {
        shown = i;
        $('[data-lv]').textContent = `Nivel ${s.level}`;
        $('[data-rn]').textContent = s.prestige >= P.MASTER ? 'Maestro' : P.rankName(s.level) + (s.prestige ? ` · Prestigio ${P.PRESTIGE_NAMES[s.prestige]}` : '');
        $('[data-emb]').innerHTML = rankSvg(s, 64);
        if (i > 0) {
          const emb = $('[data-emb]');
          emb.classList.remove('is-pop');
          void emb.offsetWidth;
          emb.classList.add('is-pop');
        }
      }
      const all = Math.min(1, e / (per * steps.length));
      $('[data-gain]').textContent = `+${fmt(R.total * (1 - (1 - all) ** 2))} XP`;
      const last = i === steps.length - 1;
      $('[data-num]').textContent = last && to.max ? 'Nivel máximo' : `${fmt((s.a + (s.b - s.a) * f) * P.need(s.level, s.prestige))} / ${fmt(P.need(s.level, s.prestige))} XP`;
      if (all < 1) this.anim = requestAnimationFrame(tick);
    };
    this.anim = requestAnimationFrame(tick);
  }
}
