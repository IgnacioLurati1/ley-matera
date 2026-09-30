// La pulpería del menú (Dr. Monty's Factory de Black Ops 3): los pesos se
// cambian por empanadas especiales, que se gastan una por vez en el horno de
// barro de la partida. Tres pestañas:
//  - Hornear: 1, 2 o 3 pesos. Cada peso prende un horno y cada horno saca una
//    especial (con más pesos, mejor chance de rara y ultra rara). A veces el
//    horno da otra cosa: "¡A todo horno!" (prende gratis los que faltaban),
//    "Peso de vuelta" o "Doble" (duplica lo demás de la hornada).
//  - Canasta: las cinco que se llevan a la partida (clásicas y especiales).
//    Las especiales fuertes traen `level`: salen en el horno igual, pero no
//    se pueden llevar (ni el horno de barro las da) hasta ese nivel.
//  - Despensa: todas, con lo que falta desbloquear y cuántas especiales hay.
// La escena 3D es ui/pulperiaScene.js (se dibuja sola: menus.stage). Se arma
// y se compila de antemano en el título (preload), con los íconos.

import * as P from '../core/progress';
import { EMPANADAS, EMPANADA, ESPECIALES, CLASICAS, RARITY, defaultCanasta } from '../config/empanadas';
import { buildEmpanada, empanadaIcon } from '../weapons/empanadaModels';
import { keyLabel } from '../core/controls';
import PulperiaScene from './pulperiaScene';
import { pesoSvg } from './rankIcons';
import './pulperia.css';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Chances de cada horno según cuántos pesos se pusieron (como los tachos del Dr. Monty).
export const ODDS = {
  1: { comun: 0.72, rara: 0.23, ultra: 0.05 },
  2: { comun: 0.55, rara: 0.35, ultra: 0.1 },
  3: { comun: 0.4, rara: 0.42, ultra: 0.18 },
};
// Lo raro que puede dar un horno en vez de una empanada.
const EXTRA = { boost: 0.07, refund: 0.07, doble: 0.05 };
const OPTS = [
  { n: 1, name: 'Una hornada' },
  { n: 2, name: 'Dos hornadas' },
  { n: 3, name: 'Tres hornadas' },
];
const EXTRA_TXT = {
  boost: { name: '¡A todo horno!', desc: 'Prendió gratis los hornos que faltaban' },
  refund: { name: 'Peso de vuelta', desc: 'Te devuelve un peso' },
  doble: { name: '¡Doble!', desc: 'Duplica lo demás de la hornada' },
};
const RARS = ['comun', 'rara', 'ultra'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
// ¿Se puede usar ya? (las clásicas y las especiales fuertes piden nivel)
export const usable = (e) => !e.level || P.unlocked({ level: e.level, prestige: e.prestige });

// Lo que sale de una hornada de `paid` pesos: por horno (0..2), null si no se
// prendió. Cada empanada trae cuántas (qty).
export function rollBake(paid) {
  const odds = ODDS[paid];
  const res = [null, null, null];
  let lit = paid;
  const rollEmp = () => {
    const r = Math.random();
    const rar = r < odds.ultra ? 'ultra' : r < odds.ultra + odds.rara ? 'rara' : 'comun';
    const e = pick(ESPECIALES.filter((x) => x.rarity === rar));
    return { k: 'emp', id: e.id, rarity: rar, color: RARITY[rar].color, qty: 1 };
  };
  for (let i = 0; i < 3; i++) {
    if (i >= lit) break;
    const r = Math.random();
    let out;
    if (lit < 3 && r < EXTRA.boost) {
      out = { k: 'boost', color: '#ffb040' };
      lit = 3;
    } else if (r < EXTRA.boost + EXTRA.refund) out = { k: 'refund', color: '#dfe6ee' };
    else if (r < EXTRA.boost + EXTRA.refund + EXTRA.doble) out = { k: 'doble', color: '#7af0ff' };
    else out = rollEmp();
    out.paid = i < paid;
    res[i] = out;
  }
  // el doble sin nada que duplicar se vuelve una empanada
  const emps = res.filter((x) => x?.k === 'emp').length;
  for (let i = 0; i < 3; i++) if (res[i]?.k === 'doble' && !emps) res[i] = { ...rollEmp(), paid: res[i].paid };
  const dobles = res.filter((x) => x?.k === 'doble').length;
  for (const x of res) if (x?.k === 'emp') x.qty = 2 ** dobles;
  return res;
}

export function useLine(e) {
  if (e.use === 'tiempo') return e.dur >= 60 ? `${Math.round(e.dur / 60)} min` : `${e.dur} s`;
  if (e.use === 'rondas') return `${e.dur} ${e.dur > 1 ? 'rondas' : 'ronda'}`;
  if (e.use === 'activa') return `[${keyLabel('empanada') || 'B'}] · ${e.dur} ${e.dur > 1 ? 'usos' : 'uso'}`;
  return e.dur > 1 ? `${e.dur} veces` : 'Al comerla';
}

export default class Pulperia {
  constructor(menus) {
    this.m = menus;
    this.g = menus.g;
    this.tab = 'hornear';
    this.busy = false;
    const opts = OPTS.map(
      (o) => `<button class="mdu-kit-card mdu-pulp__opt" data-bake="${o.n}">
          <span class="mdu-pulp__coins">${pesoSvg(34).repeat(o.n)}</span>
          <span class="mdu-pulp__otxt"><b>${o.name}</b>
            <span class="mdu-pulp__odds">${RARS.map((r) => `<i style="--w:${ODDS[o.n][r] * 100}%;--c:${RARITY[r].color}"></i>`).join('')}</span>
            <span class="mdu-pulp__pct">${RARS.map((r) => `<em style="--c:${RARITY[r].color}">${Math.round(ODDS[o.n][r] * 100)}%</em>`).join('')}</span>
          </span>
        </button>`,
    ).join('');
    menus.screen(
      'pulperia',
      `<div class="mdu-pulp">
        <header class="mdu-pulp__head">
          <div><h2 class="mdu-kit-title">Pulpería</h2><p class="mdu-kit-sub">«El Finado» · se fía mañana</p></div>
          <div class="mdu-pulp__purse" title="Tus pesos">${pesoSvg(44)}<b data-pesos>0</b></div>
        </header>
        <div class="mdu-kit-tabs" role="tablist">
          <button class="mdu-kit-tab is-on" data-ptab="hornear">Hornear</button>
          <button class="mdu-kit-tab" data-ptab="canasta">Canasta</button>
          <button class="mdu-kit-tab" data-ptab="despensa">Despensa</button>
        </div>
        <section class="mdu-pulp__pane" data-ppane="hornear">
          <div class="mdu-pulp__opts">${opts}</div>
          <p class="mdu-pulp__legend">${RARS.map((r) => `<span style="--c:${RARITY[r].color}"><i></i>${RARITY[r].name}</span>`).join('')}</p>
          <p class="mdu-pulp__hint" data-hint></p>
        </section>
        <section class="mdu-pulp__pane mdu-pulp__pane--fill" data-ppane="canasta" hidden>
          <p class="mdu-pulp__hint">El horno de barro te da una al azar de estas cinco.</p>
          <div class="mdu-pulp__slots" data-slots></div>
          <div class="mdu-pulp__pick" data-pick hidden></div>
          <div class="mdu-pulp__row" data-slotacts><button class="mdu-btn mdu-btn--mini" data-pact="reset">Volver a la de fábrica</button></div>
        </section>
        <section class="mdu-pulp__pane mdu-pulp__pane--fill" data-ppane="despensa" hidden>
          <div class="mdu-pulp__scroll" data-grid></div>
          <div class="mdu-pulp__info" data-info></div>
        </section>
        <div class="mdu-kit-back"><button class="mdu-btn" data-act="back">Volver</button></div>
      </div>`,
    );
    this.el = menus.screens.pulperia;
    this.el.classList.add('mdu-menu--pulp');
    this.results = document.createElement('div');
    this.results.className = 'mdu-pulp__results';
    this.el.appendChild(this.results);
    this.banner = document.createElement('div');
    this.banner.className = 'mdu-pulp__banner';
    this.el.appendChild(this.banner);
    menus.acts.pulperia = () => {
      menus.prev = menus.current;
      menus.show('pulperia');
    };
    const btn = menus.screens.title.querySelector('[data-act="pulperia"]');
    btn.hidden = false;
    this.titleBtn = btn;
    menus.showHooks.push((name) => (name === 'pulperia' ? this.open() : this.close()));
    this.el.addEventListener('click', (e) => this.click(e));
    P.on('change', () => {
      this.syncTitle();
      if (menus.current === 'pulperia' && !this.busy) {
        this.sync();
        if (this.scene && this.scene.coinCount !== P.pesos()) this.scene.setCoins(P.pesos());
      }
    });
    window.addEventListener('keydown', (this.onKey = (e) => {
      if (e.code !== 'Escape' || menus.current !== 'pulperia') return;
      if (!this.el.querySelector('[data-pick]').hidden) this.closePick();
      else if (!this.busy) menus.act('back');
    }));
    this.syncTitle();
  }

  // El botón del título muestra los pesos.
  syncTitle() {
    const n = P.pesos();
    this.titleBtn.innerHTML = `Pulpería${n ? `<span class="mdu-pulp__tag">${pesoSvg(18)}<b>${n}</b></span>` : ''}`;
  }

  canasta() {
    const c = P.canasta();
    return c || defaultCanasta(P.unlocked);
  }

  quality() {
    const s = this.g.settings;
    return s.qualityMode === 'custom' ? s.gfx?.surf || s.quality : s.quality;
  }

  // Arma la escena, la compila y saca los íconos antes de que se abra (en
  // el título, de a poco). Si se abre antes, se hace ahí.
  preload() {
    const g = this.g;
    if (!g.renderer || !g.textures) return;
    if (!this.scene) this.scene = new PulperiaScene(g.textures, (id) => buildEmpanada(id));
    this.scene.prepare(g.renderer, this.quality());
    if (!this.basketDone) {
      this.basketDone = true;
      this.scene.setBasket(this.canasta());
    }
    if (this.iconsQueued) return;
    this.iconsQueued = true;
    const ids = EMPANADAS.map((e) => e.id);
    const step = () => {
      for (let k = 0; k < 3 && ids.length; k++) empanadaIcon(g.renderer, ids.shift(), 96);
      if (ids.length) setTimeout(step, 60);
      else if (this.m.current === 'pulperia') this.refreshIcons();
    };
    setTimeout(step, 0);
  }

  open() {
    this.preload();
    this.scene.setCoins(P.pesos());
    this.scene.setBasket(this.canasta());
    this.setTab(this.tab);
    this.m.stage = this;
    this.sync();
  }

  close() {
    if (this.m.stage === this) this.m.stage = null;
    this.results.innerHTML = '';
  }

  // Lo llama Game.loop mientras la pulpería está abierta.
  render(renderer, dt) {
    this.scene.render(renderer, dt);
    // chisporroteo de los hornos prendidos
    const lit = this.scene.ovens.reduce((a, o) => a + Math.max(0, o.k - 0.25), 0);
    if (lit > 0 && Math.random() < dt * 9 * lit) this.sfx('crackle', lit);
    // los carteles de lo que salió siguen a la tabla
    for (const c of this.cards || []) {
      const s = this.scene.screenOf(c.at);
      c.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }

  setTab(t) {
    if (this.busy) return;
    this.tab = t;
    for (const b of this.el.querySelectorAll('[data-ptab]')) {
      b.classList.toggle('is-on', b.dataset.ptab === t);
      b.setAttribute('aria-selected', b.dataset.ptab === t);
    }
    for (const p of this.el.querySelectorAll('[data-ppane]')) p.hidden = p.dataset.ppane !== t;
    this.scene?.setShot(t === 'hornear' ? 'hornos' : t);
    this.clearCards();
    this.banner.classList.remove('is-on');
    if (t === 'canasta') this.closePick();
    if (t === 'despensa') this.renderGrid();
  }

  sync() {
    const n = P.pesos();
    this.el.querySelector('[data-pesos]').textContent = n;
    for (const b of this.el.querySelectorAll('[data-bake]')) b.disabled = this.busy || n < +b.dataset.bake;
    this.el.querySelector('[data-hint]').textContent = n ? 'Cada peso prende un horno: más hornos, mejores empanadas.' : 'No tenés pesos: se ganan subiendo de nivel.';
    if (this.tab === 'canasta' && this.el.querySelector('[data-pick]').hidden) this.renderSlots();
    if (this.tab === 'despensa') this.renderGrid();
  }

  refreshIcons() {
    if (this.tab === 'canasta') {
      if (this.el.querySelector('[data-pick]').hidden) this.renderSlots();
      else this.openPick(this.slot);
    }
    if (this.tab === 'despensa') this.renderGrid();
  }

  click(e) {
    const t = e.target.closest('[data-ptab],[data-bake],[data-slot],[data-choose],[data-pact],[data-emp]');
    if (!t || t.disabled) return;
    this.g.audio?.resume?.();
    if (t.dataset.ptab) this.setTab(t.dataset.ptab);
    else if (t.dataset.bake) this.bake(+t.dataset.bake);
    else if (t.dataset.slot != null) this.openPick(+t.dataset.slot);
    else if (t.dataset.choose != null) this.choose(t.dataset.choose);
    else if (t.dataset.pact === 'reset') {
      P.setCanasta(defaultCanasta(P.unlocked));
      this.scene.setBasket(this.canasta());
      this.renderSlots();
    } else if (t.dataset.pact === 'unpick') this.closePick();
    else if (t.dataset.emp) this.info(t.dataset.emp);
  }

  // ---------- la hornada ----------
  bake(n) {
    if (this.busy || !P.spendPesos(n)) return;
    this.busy = true;
    this.clearCards();
    const res = rollBake(n);
    // se anota ya (si se cierra en el medio, no se pierde)
    let refund = 0;
    for (const r of res) {
      if (r?.k === 'emp') P.addMega(r.id, r.qty);
      if (r?.k === 'refund') refund++;
    }
    if (refund) P.addPesos(refund);
    this.sync();
    for (const b of this.el.querySelectorAll('[data-bake],[data-ptab]')) b.disabled = true;
    const S = this.scene;
    S.setCoins(P.pesos() + n - refund);
    S.setShot('bake');
    this.sfx('coinsDown', n);
    this.cards = [];
    const dur = S.bake(res, n, (name, d) => {
      if (name === 'coin') this.sfx('coin', d);
      else if (name === 'fire') this.sfx('fire');
      else if (name === 'boost') {
        this.sfx('boost');
        this.showBanner(EXTRA_TXT.boost.name, EXTRA_TXT.boost.desc, '#ffb040');
      } else if (name === 'land') {
        S.setShot('tabla');
        this.card(d.i, d.r);
      } else if (name === 'done') this.finish(res);
    });
    this.safety = setTimeout(() => this.finish(res), (dur + 3) * 1000);
  }

  finish(res) {
    if (!this.busy) return;
    clearTimeout(this.safety);
    this.busy = false;
    this.scene.setCoins(P.pesos());
    for (const b of this.el.querySelectorAll('[data-ptab]')) b.disabled = false;
    this.sync();
    const got = res.filter((r) => r?.k === 'emp').reduce((a, r) => a + r.qty, 0);
    this.showBanner(`+${got} a la despensa`, 'Ponelas en la canasta para llevarlas', '#ffd24a', 3.2);
  }

  card(i, r) {
    const el = document.createElement('div');
    el.className = `mdu-pulp__card mdu-pulp__card--${r.rarity || r.k} is-${['l', 'c', 'r'][i]}`;
    el.style.setProperty('--c', r.color || '#ffd24a');
    if (r.k === 'emp') {
      const e = EMPANADA[r.id];
      const lock = !usable(e) ? `<p class="mdu-pulp__lock">Se puede usar desde el nivel ${e.level}</p>` : '';
      el.innerHTML = `<div class="mdu-pulp__cardin"><small>${RARITY[r.rarity].name}${r.qty > 1 ? ` · ×${r.qty}` : ''}</small><b>${esc(e.name)}</b><span>${esc(e.sabor)}</span><p>${esc(e.desc)}</p>${lock}</div>`;
      this.sfx(r.rarity);
    } else {
      const x = EXTRA_TXT[r.k];
      el.innerHTML = `<div class="mdu-pulp__cardin"><small>Del horno</small><b>${x.name}</b><p>${x.desc}</p></div>`;
      this.sfx(r.k === 'refund' ? 'refund' : 'rara');
    }
    // arriba de lo que cayó
    const at = this.scene.tray.find((t) => t.i === i)?.at.clone() || null;
    if (!at) return;
    at.y += 0.12;
    this.results.appendChild(el);
    this.cards.push({ el, at });
  }

  clearCards() {
    this.cards = [];
    this.results.innerHTML = '';
  }

  showBanner(title, sub, color, secs = 2.2) {
    const b = this.banner;
    b.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    b.style.setProperty('--c', color);
    b.classList.remove('is-on');
    void b.offsetWidth;
    b.classList.add('is-on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('is-on'), secs * 1000);
  }

  // ---------- la canasta ----------
  renderSlots() {
    const ids = this.canasta();
    const box = this.el.querySelector('[data-slots]');
    const mega = P.megas();
    let html = '';
    for (let i = 0; i < 5; i++) {
      const e = EMPANADA[ids[i]];
      if (!e) {
        html += `<button class="mdu-kit-card mdu-pulp__slot is-empty" data-slot="${i}"><span class="mdu-pulp__ico"></span><b>Vacío</b><small>Elegí una</small></button>`;
        continue;
      }
      const sp = e.kind === 'especial';
      const left = mega[e.id] || 0;
      html += `<button class="mdu-kit-card mdu-pulp__slot ${(sp && !left) || !usable(e) ? 'is-out' : ''}" data-slot="${i}" style="--c:${this.colorOf(e)}" title="${esc(e.desc)}">
        <span class="mdu-pulp__ico">${this.iconImg(e.id)}</span><b>${esc(e.name)}</b><small>${esc(e.sabor)}</small><em>${sp ? `×${left}` : '∞'}</em></button>`;
    }
    box.innerHTML = html;
  }

  colorOf(e) {
    return e.kind === 'especial' ? RARITY[e.rarity].color : e.color;
  }

  openPick(slot) {
    this.slot = slot;
    const ids = this.canasta();
    const mega = P.megas();
    const box = this.el.querySelector('[data-pick]');
    // las clásicas desbloqueadas y las especiales que tenés (las que piden
    // más nivel se ven, con candado)
    const can = EMPANADAS.filter((e) => (e.kind === 'clasica' ? usable(e) : mega[e.id] > 0));
    box.innerHTML = `<div class="mdu-pulp__scroll"><div class="mdu-pulp__grid">${can
      .map((e) => {
        const inUse = ids.includes(e.id) && ids[slot] !== e.id;
        const sp = e.kind === 'especial';
        const ok = usable(e);
        return `<button class="mdu-kit-card mdu-pulp__cell ${inUse ? 'is-used' : ''} ${ok ? '' : 'is-locked'}" data-choose="${e.id}" style="--c:${this.colorOf(e)}" title="${esc(e.desc)}"${ok ? '' : ' disabled'}>
          <span class="mdu-pulp__ico">${this.iconImg(e.id)}</span><b>${esc(e.name)}</b><em>${ok ? (sp ? `×${mega[e.id]}` : '∞') : `Nv ${e.level}`}</em></button>`;
      })
      .join('')}</div></div><div class="mdu-pulp__row"><button class="mdu-btn mdu-btn--mini" data-pact="unpick">Cancelar</button><button class="mdu-btn mdu-btn--mini" data-choose="">Dejar vacío</button></div>`;
    box.hidden = false;
    this.el.querySelector('[data-slots]').hidden = true;
    this.el.querySelector('[data-slotacts]').hidden = true;
  }

  choose(id) {
    if (id && !usable(EMPANADA[id])) return;
    const ids = this.canasta();
    while (ids.length < 5) ids.push(null);
    // si ya estaba en otro lugar, se intercambian
    const was = ids.indexOf(id);
    if (id && was >= 0) ids[was] = ids[this.slot];
    ids[this.slot] = id || null;
    P.setCanasta(ids);
    this.scene.setBasket(ids);
    this.closePick();
    this.sfx('pick');
  }

  closePick() {
    this.el.querySelector('[data-pick]').hidden = true;
    this.el.querySelector('[data-slots]').hidden = false;
    this.el.querySelector('[data-slotacts]').hidden = false;
    this.renderSlots();
  }

  // ---------- la despensa ----------
  renderGrid() {
    const mega = P.megas();
    const cell = (e) => {
      const sp = e.kind === 'especial';
      const ok = usable(e);
      const n = mega[e.id] || 0;
      const badge = sp ? `×${n}${ok ? '' : ` · Nv ${e.level}`}` : ok ? '∞' : `Nv ${e.level}`;
      return `<button class="mdu-kit-card mdu-pulp__cell ${!ok || (sp && !n) ? 'is-locked' : ''} ${this.infoId === e.id ? 'is-sel' : ''}" data-emp="${e.id}" style="--c:${this.colorOf(e)}">
        <span class="mdu-pulp__ico">${this.iconImg(e.id)}</span><b>${esc(e.name)}</b><em>${badge}</em></button>`;
    };
    const byR = (r) => ESPECIALES.filter((e) => e.rarity === r);
    const scroll = this.el.querySelector('[data-grid]');
    const top = scroll.scrollTop;
    scroll.innerHTML = `<h3 class="mdu-pulp__h">Clásicas <small>no se gastan</small></h3><div class="mdu-pulp__grid">${CLASICAS.map(cell).join('')}</div>
      ${RARS.map((r) => `<h3 class="mdu-pulp__h" style="--c:${RARITY[r].color}">${RARITY[r].name}</h3><div class="mdu-pulp__grid">${byR(r).map(cell).join('')}</div>`).join('')}`;
    scroll.scrollTop = top;
    this.info(this.infoId || EMPANADAS[0].id, true);
  }

  info(id, quiet = false) {
    const e = EMPANADA[id];
    if (!e) return;
    this.infoId = id;
    for (const c of this.el.querySelectorAll('[data-emp]')) c.classList.toggle('is-sel', c.dataset.emp === id);
    const sp = e.kind === 'especial';
    const n = P.megas()[e.id] || 0;
    const ok = usable(e);
    const status = !ok ? `Se usa desde el nivel ${e.level}` : sp ? (n ? `Tenés ${n}` : 'Sale en el horno') : 'No se gasta';
    this.el.querySelector('[data-info]').innerHTML = `<span class="mdu-pulp__ico mdu-pulp__ico--big" style="--c:${this.colorOf(e)}">${this.iconImg(e.id)}</span>
      <div><small style="color:${this.colorOf(e)}">${sp ? RARITY[e.rarity].name : 'Clásica'} · ${useLine(e)}</small><b>${esc(e.name)}</b><span>${esc(e.sabor)} · ${status}</span><p>${esc(e.desc)}</p></div>`;
    if (!quiet) this.sfx('pick');
  }

  // El ícono (foto de la empanada 3D, weapons/empanadaModels empanadaIcon).
  iconImg(id) {
    let u = null;
    try {
      if (this.g.renderer) u = empanadaIcon(this.g.renderer, id, 96);
    } catch {
      u = null;
    }
    return u ? `<img src="${u}" alt="" draggable="false">` : '';
  }

  // ---------- sonidos ----------
  sfx(kind, x = 1) {
    const A = this.g.audio;
    if (!A?.ctx || A.ctx.state !== 'running') return;
    const t = A.now;
    try {
      if (kind === 'coin' || kind === 'refund') {
        const o = A.out({ gain: 0.5, reverb: 0.25 });
        const f = 2300 + Math.random() * 500;
        A.tone(o, { t, dur: 0.18, type: 'triangle', freq: f, gain: 0.35 });
        A.tone(o, { t, dur: 0.3, type: 'sine', freq: f * 1.52, gain: 0.2 });
        A.tone(o, { t: t + 0.06, dur: 0.25, type: 'sine', freq: f * 1.1, gain: 0.15 });
        if (kind === 'refund') A.tune([[84, 0.5], [91, 1.5]], { wave: 'triangle', bpm: 240, gain: 0.12 });
      } else if (kind === 'coinsDown') {
        const o = A.out({ gain: 0.4, reverb: 0.15 });
        for (let i = 0; i < x; i++) A.noise(o, { t: t + i * 0.05, dur: 0.05, type: 'bandpass', freq: 3200, q: 4, gain: 0.5 });
      } else if (kind === 'fire') {
        const o = A.out({ gain: 0.9, reverb: 0.35 });
        A.noise(o, { t, dur: 1.1, type: 'lowpass', freq: 250, freqEnd: 1400, gain: 0.8, attack: 0.12, brown: true });
        A.noise(o, { t: t + 0.05, dur: 0.6, type: 'bandpass', freq: 900, freqEnd: 400, q: 1.2, gain: 0.3, attack: 0.05 });
        A.tone(o, { t, dur: 0.7, type: 'sine', freq: 70, freqEnd: 45, gain: 0.35, attack: 0.08 });
      } else if (kind === 'crackle') {
        const o = A.out({ gain: 0.12 * Math.min(2, x), reverb: 0.2 });
        A.noise(o, { t, dur: 0.012 + Math.random() * 0.02, type: 'highpass', freq: 1800 + Math.random() * 2500, gain: 0.8 });
      } else if (kind === 'boost') {
        const o = A.out({ gain: 1, reverb: 0.5 });
        A.noise(o, { t, dur: 1.6, type: 'lowpass', freq: 200, freqEnd: 2600, gain: 0.9, attack: 0.3, brown: true });
        A.tune([[67, 0.5], [71, 0.5], [74, 0.5], [79, 2]], { wave: 'sawtooth', bpm: 240, gain: 0.1, cutoff: 2400 });
      } else if (kind === 'comun') A.tune([[76, 0.5], [81, 1.5]], { wave: 'triangle', bpm: 220, gain: 0.12 });
      else if (kind === 'rara') A.tune([[74, 0.5], [79, 0.5], [86, 2]], { wave: 'triangle', bpm: 220, gain: 0.14 });
      else if (kind === 'ultra') {
        A.tune([[72, 0.5], [76, 0.5], [79, 0.5], [84, 0.5], [88, 0.5], [91, 3]], { wave: 'triangle', bpm: 240, gain: 0.16 });
        A.sting?.();
      } else if (kind === 'pick') {
        const o = A.out({ gain: 0.3, reverb: 0.1 });
        A.noise(o, { t, dur: 0.05, type: 'bandpass', freq: 1400, q: 2, gain: 0.5 });
      }
    } catch {
      /* sin audio */
    }
  }
}
