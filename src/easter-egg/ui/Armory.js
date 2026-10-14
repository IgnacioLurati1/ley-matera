import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as P from '../core/progress';
import { WEAPONS } from '../config/weapons';
import { MAP_LIST } from '../config/map';
import { buildMate, getMats } from '../weapons/viewmodels';
import { CAMOS, CAMO_BY_ID, CAMOABLE, KNIGHT, PAP_CAMO, camoCanvas, papCanvas, camoUnlocked, knightEarned, papPreviewMaterial, tickCamos, tickMolino } from '../weapons/camos';
import './armory.css';
// la armería mejorada: nivel de cada mate, accesorios y especialista (el usuario, 2026-10-12)
import * as Armas from '../core/armas';
import { ponerAccesorios, animarAccesorios, tieneModelo } from '../weapons/accesorios';
import { instalarAvisos } from './armeriaAviso';
import './armeria-accesorios.css';

// La armería (menú del título): los mates comunes a la izquierda, el mate
// elegido en 3D en el medio (gira solo; se arrastra para girarlo y la rueda
// acerca) y los camuflajes a la derecha, por pestañas. Pasar por arriba de
// un camuflaje lo muestra en el mate (también los bloqueados: es para tentar);
// tocarlo lo equipa si ya está desbloqueado (core/progress setCamo) y si no,
// lo deja puesto a la vista con el candado y lo que pide. La pestaña del
// Pack-a-Pava muestra el camuflaje que da la pava en cada mapa.
//
// La escena 3D se dibuja en lugar del mundo del título (menus.stage, que
// Game.loop llama mientras está esta pantalla). Tamaños: ui/menuKit.css.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const TABS = [
  { id: 'basic', name: 'Básicos' },
  { id: 'animated', name: 'Animados' },
  { id: 'prestige', name: 'Prestigio' },
  { id: 'pap', name: 'Pack-a-Pava' },
];
const SEL_KEY = 'mdu-armory-sel';
const MODE_KEY = 'mdu-armory-mode';
// los dibujitos de cada parte del mate (core/armas.js PARTES)
const PART_SVG = {
  bombilla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21L17 4.5l2.5 1.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="7" cy="20.5" r="2.2" fill="currentColor"/></svg>',
  pico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20L14 8c2-2.6 5-2.4 5 .5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  virola: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 12v3c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-3" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/></svg>',
  cuerpo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-.5 3c4 1.6 5.5 5 5.5 8.5C20 19 16.5 21.5 12 21.5S4 19 4 14.5C4 11 5.5 7.6 9.5 6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.6 12.5h14.8" stroke="currentColor" stroke-width="2.6"/></svg>',
  yerba: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19c1-8 6-13 16-15-1 10-6 15-14 15z" fill="currentColor" opacity=".85"/><path d="M5 20L15 9" stroke="#1a0f08" stroke-width="1.6"/></svg>',
};
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.6 6.2 6.7.6-5.1 4.4 1.6 6.6L12 16.8l-5.8 3.5 1.6-6.6-5.1-4.4 6.7-.6z" fill="currentColor"/></svg>';
const SEEN_KEY = 'mdu-camos-seen';
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  },
};

// Qué pide un camuflaje, dicho corto.
function needText(c) {
  if (c.prestige === P.MASTER) return `Maestro ${c.level}`;
  if (c.prestige) return `Prestigio ${ROMAN[c.prestige] || c.prestige}`;
  return `Nivel ${c.level}`;
}
const TIER_CAP = { basic: 'Camuflaje', animated: 'Animado', prestige: 'Prestigio' };
const mapName = (id) => MAP_LIST.find((m) => m.id === id)?.name || id;

// Los mates de la lista: el Porongo del Caballero al final, secreto hasta
// que se gana el super easter egg (sin nombre, sin modelo y sin camuflajes).
const MATES = [...CAMOABLE.filter((id) => id !== KNIGHT), ...(CAMOABLE.includes(KNIGHT) ? [KNIGHT] : [])];
const usable = (id) => MATES.includes(id) && (id !== KNIGHT || knightEarned());

const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="4.5" y="10" width="15" height="11" rx="2" fill="currentColor"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export default class Armory {
  constructor(menus) {
    this.m = menus;
    this.g = menus.g;
    const saved = store.get(SEL_KEY, 'porongo');
    this.sel = usable(saved) ? saved : MATES[0];
    this.tab = 'basic';
    // lo que se ve en el mate: lo que está bajo el mouse, si no lo último que
    // tocó, si no lo que tiene equipado
    this.hover = null;
    this.pick = null;
    this.seen = new Set(store.get(SEEN_KEY, []));
    // la mitad de la derecha: camuflajes o accesorios; accHover: el accesorio
    // bajo el mouse (se prueba en el mate)
    this.mode = store.get(MODE_KEY, 'camos') === 'acc' ? 'acc' : 'camos';
    this.accHover = null;
    instalarAvisos(menus.g);
    this.swatches = new Map();
    this.queue = [];
    menus.screen(
      'armory',
      `<div class="mdu-arm">
         <aside class="mdu-arm__side">
           <h2 class="mdu-kit-title mdu-arm__h">Armería</h2>
           <div class="mdu-arm__mates" data-mates></div>
           <div class="mdu-list mdu-kit-back"><button class="mdu-btn" data-act="back">Volver</button></div>
         </aside>
         <section class="mdu-arm__stage" data-stage>
           <div class="mdu-arm__info" data-info>
             <p class="mdu-arm__cap" data-cap></p>
             <h3 class="mdu-arm__name" data-name></h3>
             <button class="mdu-arm__equip" data-equip></button>
           </div>
         </section>
         <aside class="mdu-arm__camos">
           <div class="mdu-arm__mate"><b data-mname></b><em data-mmeta></em></div>
           <div class="mdu-arm__modes"><button class="mdu-arm__mode" data-mode="camos">Camuflajes</button><button class="mdu-arm__mode" data-mode="acc">Accesorios</button></div>
           <div class="mdu-acc" data-accs hidden></div>
           <div class="mdu-kit-tabs mdu-arm__tabs">${TABS.map((t) => `<button class="mdu-kit-tab" data-tab="${t.id}"><span>${t.name}</span><i data-tabn="${t.id}"></i></button>`).join('')}</div>
           <div class="mdu-arm__grid" data-grid></div>
         </aside>
       </div>`,
    );
    this.el = menus.screens.armory;
    this.el.classList.add('mdu-menu--armory');
    const $ = (s) => this.el.querySelector(s);
    this.$ = $;
    menus.acts.armory = () => {
      menus.prev = menus.current;
      menus.show('armory');
    };
    this.btn = menus.screens.title.querySelector('[data-act="armory"]');
    if (this.btn) this.btn.hidden = false;
    menus.showHooks.push((name) => {
      if (name === 'armory') this.open();
      else if (this.on) this.close();
      if (name === 'title') this.syncBadge();
    });
    this.el.addEventListener('click', (e) => {
      const w = e.target.closest('[data-w]');
      if (w) this.pickMate(w.dataset.w);
      const t = e.target.closest('[data-tab]');
      if (t) this.pickTab(t.dataset.tab);
      const c = e.target.closest('[data-camo]');
      if (c) this.pickCamo(c.dataset.camo);
      if (e.target.closest('[data-equip]')) this.equipShown();
      const md = e.target.closest('[data-mode]');
      if (md) this.pickMode(md.dataset.mode);
      const ac = e.target.closest('[data-acc]');
      if (ac) this.pickAcc(ac.dataset.acc);
      if (e.target.closest('[data-esp]')) this.pickEsp();
    });
    // pasar por arriba de un accesorio lo prueba en el mate
    const accs = $('[data-accs]');
    accs.addEventListener('pointerover', (e) => this.previewAcc(e.target.closest('[data-acc]')?.dataset.acc || null));
    accs.addEventListener('pointerleave', () => this.previewAcc(null));
    // pasar por arriba de un camuflaje lo muestra en el mate
    const grid = $('[data-grid]');
    grid.addEventListener('pointerover', (e) => {
      const c = e.target.closest('[data-camo]');
      if (c) this.preview(c.dataset.camo);
    });
    grid.addEventListener('focusin', (e) => {
      const c = e.target.closest('[data-camo]');
      if (c) this.preview(c.dataset.camo);
    });
    grid.addEventListener('pointerleave', () => this.preview(null));
    // girar y acercar el mate
    const stage = $('[data-stage]');
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('[data-equip]')) return;
      this.drag = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.stage) return;
      this.stage.spin(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => {
      this.drag = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener(
      'wheel',
      (e) => {
        if (!this.stage) return;
        e.preventDefault();
        this.stage.zoom(e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (this.onKey = (e) => {
      if (menus.current !== 'armory') return;
      if (e.code === 'Escape') menus.act('back');
      // flechas: otro mate (arriba/abajo) u otra pestaña (izquierda/derecha)
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const list = MATES.filter(usable);
        const i = list.indexOf(this.sel) + (e.code === 'ArrowUp' ? -1 : 1);
        if (list[i]) this.pickMate(list[i]);
        e.preventDefault();
      } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && this.mode === 'camos') {
        const i = TABS.findIndex((t) => t.id === this.tab) + (e.code === 'ArrowLeft' ? -1 : 1);
        if (TABS[i]) this.pickTab(TABS[i].id);
      }
    }));
    window.addEventListener('resize', (this.onResize = () => this.on && this.layout()));
    // (angosta, la columna se desplaza: el mate sigue a su lugar y no queda
    // dibujado detrás de la lista; prueba de la armería mejorada, 2026-10-12)
    this.el.addEventListener('scroll', () => this.on && this.layout(), { capture: true, passive: true });
    // (jugando no: lo sincroniza el showHooks al volver al título)
    P.on('change', () => {
      if (menus.g.state !== 'title') return;
      if (this.on) this.syncAll();
      this.syncBadge();
    });
    this.syncBadge();
  }

  // ---------------- entrar y salir ----------------
  open() {
    const g = this.g;
    if (!g.textures) return;
    this.on = true;
    this.stage ||= new ArmoryStage(g);
    this.m.stage = this.stage;
    this.stage.onFrame = () => this.paintNext();
    this.hover = null;
    this.pick = null;
    this.syncAll();
    this.layout();
    this.showMate();
  }

  close() {
    this.on = false;
    this.freshFor = null;
    if (this.m.stage === this.stage) this.m.stage = null;
    // lo visto deja de ser nuevo (lo que se vio solo por el Día del Mate no:
    // cuando se gane de verdad, sale nuevo; core/diaDelMate.js, 2026-10-12)
    store.set(SEEN_KEY, [...this.seen].filter((id) => !CAMO_BY_ID[id] || P.unlocked(CAMO_BY_ID[id])));
    this.syncBadge();
  }

  // El mate va en el hueco entre los dos paneles.
  layout() {
    const side = this.$('.mdu-arm__side').getBoundingClientRect();
    const camos = this.$('.mdu-arm__camos').getBoundingClientRect();
    const w = window.innerWidth;
    // (angosta: el mate arriba, en el lugar de la escena)
    const st = this.$('[data-stage]').getBoundingClientRect();
    this.stage.center = w > 900 ? (side.right + camos.left) / 2 : w / 2;
    // (ancha: un poco más arriba, que abajo va el nombre y el botón)
    this.stage.centerY = w > 900 ? window.innerHeight * 0.44 : st.top + st.height / 2;
  }

  // ¿Cuántos camuflajes desbloqueados todavía no vio? (el número del botón)
  syncBadge() {
    if (!this.btn) return;
    // (más los accesorios ganados que todavía no se vieron: core/armas.js nuevos; el usuario, 2026-10-12)
    const n = CAMOS.filter((c) => camoUnlocked(c) && !this.seen.has(c.id)).length + Armas.cuantosNuevos();
    this.btn.classList.toggle('mdu-btn--new', n > 0);
    this.btn.dataset.new = n > 0 ? String(n) : '';
  }

  // ---------------- listas ----------------
  syncAll() {
    this.syncMates();
    this.syncTabs();
    this.syncGrid();
    this.syncInfo();
    this.syncMode();
  }

  syncMates() {
    const box = this.$('[data-mates]');
    if (!usable(this.sel)) this.sel = MATES[0];
    box.innerHTML = MATES.map((id) => {
      if (!usable(id)) return `<button class="mdu-arm__row is-secret" disabled title="Secreto"><span class="mdu-arm__chip is-secret">?</span><b class="mdu-arm__rowtxt">???</b></button>`;
      const w = WEAPONS[id];
      const c = CAMO_BY_ID[P.camoOf(id)];
      const on = c && camoUnlocked(c);
      // (el camuflaje que lleva se ve en la muestra; el nombre, al pasar)
      return `<button class="mdu-arm__row${id === this.sel ? ' is-sel' : ''}" data-w="${id}" aria-pressed="${id === this.sel}" title="${on ? esc(c.name) : 'Sin camuflaje'}">
        <span class="mdu-arm__chip${on ? '' : ' is-none'}" data-chip="${on ? c.id : ''}"></span>
        <b class="mdu-arm__rowtxt">${esc(w.name)}</b>
        <i class="mdu-arm__lv${Armas.nuevos(id).length ? ' is-new' : ''}" title="Nivel del mate">${Armas.estado(id).level}</i>
      </button>`;
    }).join('');
    for (const el of box.querySelectorAll('[data-chip]')) if (el.dataset.chip) this.fillSwatch(el, el.dataset.chip);
  }

  syncTabs() {
    for (const t of TABS) {
      this.$(`[data-tab="${t.id}"]`).classList.toggle('is-on', t.id === this.tab);
      const n = this.$(`[data-tabn="${t.id}"]`);
      if (t.id === 'pap') {
        n.textContent = `${Object.keys(PAP_CAMO).length} mapas`;
        continue;
      }
      const list = CAMOS.filter((c) => c.tier === t.id);
      n.textContent = `${list.filter(camoUnlocked).length}/${list.length}`;
      n.classList.toggle('is-new', list.some((c) => camoUnlocked(c) && !this.seen.has(c.id)));
    }
  }

  syncGrid() {
    const grid = this.$('[data-grid]');
    const cur = P.camoOf(this.sel);
    const eqNone = !cur || !camoUnlocked(CAMO_BY_ID[cur]);
    const cards = [];
    if (this.tab === 'pap') {
      for (const m of MAP_LIST.filter((mm) => PAP_CAMO[mm.id])) {
        cards.push(`<button class="mdu-arm__card is-pap${this.pick === `pap:${m.id}` ? ' is-pick' : ''}" data-camo="pap:${m.id}">
          <span class="mdu-arm__sw" data-sw="pap:${m.id}"><span class="mdu-arm__map">${esc(m.name)}</span></span>
          <b class="mdu-arm__cn">${esc(PAP_CAMO[m.id].name)}</b>
        </button>`);
      }
    } else {
      if (this.tab === 'basic') {
        cards.push(`<button class="mdu-arm__card is-plain${eqNone ? ' is-eq' : ''}" data-camo="none">
          <span class="mdu-arm__sw is-plain"></span>
          <b class="mdu-arm__cn">Sin camuflaje</b>
          <i class="mdu-arm__eq">${CHECK_SVG}</i>
        </button>`);
      }
      for (const c of CAMOS.filter((cc) => cc.tier === this.tab)) {
        const ok = camoUnlocked(c);
        const fresh = ok && !this.seen.has(c.id);
        cards.push(`<button class="mdu-arm__card is-${c.tier}${ok ? '' : ' is-lock'}${ok && c.id === cur ? ' is-eq' : ''}${this.pick === c.id ? ' is-pick' : ''}" data-camo="${c.id}">
          <span class="mdu-arm__sw" data-sw="${c.id}">${ok ? '' : `<span class="mdu-arm__lock">${LOCK_SVG}${esc(needText(c))}</span>`}</span>
          <b class="mdu-arm__cn">${esc(c.name)}</b>
          <i class="mdu-arm__eq">${CHECK_SVG}</i>
          ${fresh ? '<em class="mdu-arm__newtag">Nuevo</em>' : ''}
        </button>`);
      }
    }
    // (entran de a una, en cascada)
    grid.innerHTML = `<div class="mdu-arm__cards">${cards.map((h, i) => h.replace('<button ', `<button style="--i:${i}" `)).join('')}</div>`;
    for (const el of grid.querySelectorAll('[data-sw]')) this.fillSwatch(el, el.dataset.sw);
  }

  // La muestra de un camuflaje (una imagen chica de su textura). Si todavía
  // no se pintó, queda en la cola: se pinta de a uno por cuadro.
  fillSwatch(el, id) {
    const url = this.swatches.get(id);
    if (url) {
      el.style.backgroundImage = `url(${url})`;
      el.classList.add('is-ready');
      return;
    }
    el.classList.remove('is-ready');
    if (!this.queue.includes(id)) this.queue.push(id);
  }

  paintNext() {
    const id = this.queue.shift();
    if (!id) return;
    const src = id.startsWith('pap:') ? papCanvas(id.slice(4), this.g.textures) : camoCanvas(id);
    if (!src) return;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    // (el del molino es cuadrado: se repite a lo ancho, como en el mate)
    if (src.width === src.height) {
      ctx.drawImage(src, 0, 0, 128, 128);
      ctx.drawImage(src, 128, 0, 128, 128);
    } else ctx.drawImage(src, 0, 0, 256, 128);
    let url = '';
    try {
      url = c.toDataURL('image/jpeg', 0.86);
    } catch {
      url = '';
    }
    this.swatches.set(id, url);
    for (const el of this.el.querySelectorAll(`[data-sw="${id}"], [data-chip="${id}"]`)) this.fillSwatch(el, id);
  }

  // ---------------- lo que se muestra ----------------
  get shown() {
    return this.hover ?? this.pick ?? P.camoOf(this.sel);
  }

  syncInfo() {
    const $ = this.$;
    const w = WEAPONS[this.sel];
    $('[data-mname]').textContent = w.name;
    $('[data-mmeta]').textContent = w.only && MAP_LIST.some((m) => m.id === w.only) ? mapName(w.only) : '';
    const id = this.shown;
    const info = $('[data-info]');
    const btn = $('[data-equip]');
    info.classList.remove('is-lock', 'is-pap', 'is-eq');
    btn.hidden = false;
    btn.disabled = false;
    if (id && id.startsWith('pap:')) {
      const map = id.slice(4);
      $('[data-cap]').textContent = `Pack-a-Pava · ${mapName(map)}`;
      $('[data-name]').textContent = PAP_CAMO[map].name;
      btn.hidden = true;
      info.classList.add('is-pap');
      return;
    }
    const c = CAMO_BY_ID[id];
    const cur = P.camoOf(this.sel);
    if (!c) {
      const eq = !cur || !camoUnlocked(CAMO_BY_ID[cur]);
      $('[data-cap]').textContent = 'Sin camuflaje';
      $('[data-name]').textContent = w.name;
      btn.innerHTML = eq ? `${CHECK_SVG}Equipado` : 'Sacar camuflaje';
      btn.disabled = eq;
      info.classList.toggle('is-eq', eq);
      return;
    }
    const ok = camoUnlocked(c);
    const eq = ok && cur === c.id;
    $('[data-cap]').textContent = TIER_CAP[c.tier];
    $('[data-name]').textContent = c.name;
    btn.innerHTML = !ok ? `${LOCK_SVG}${esc(needText(c))}` : eq ? `${CHECK_SVG}Equipado` : 'Equipar';
    btn.disabled = !ok || eq;
    info.classList.toggle('is-lock', !ok);
    info.classList.toggle('is-eq', eq);
  }

  // ---------------- elegir ----------------
  pickMate(id) {
    if (!usable(id) || id === this.sel) return;
    this.sel = id;
    store.set(SEL_KEY, id);
    this.hover = null;
    this.pick = null;
    this.g.audio?.shell();
    for (const b of this.el.querySelectorAll('[data-w]')) {
      const on = b.dataset.w === id;
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.syncGrid();
    this.syncInfo();
    this.accHover = null;
    if (this.mode === 'acc') this.syncAccs(true);
    this.showMate(true);
  }

  pickTab(id) {
    if (id === this.tab) return;
    // lo desbloqueado de la pestaña que se deja ya se vio
    for (const c of CAMOS) if (c.tier === this.tab && camoUnlocked(c)) this.seen.add(c.id);
    this.tab = id;
    this.hover = null;
    this.pick = null;
    this.syncTabs();
    this.syncGrid();
    this.syncInfo();
    this.showMate();
  }

  // Tocar un camuflaje: si está desbloqueado se equipa; si no (o es el del
  // Pack-a-Pava), queda a la vista.
  pickCamo(id) {
    const c = CAMO_BY_ID[id];
    if (id === 'none' || (c && camoUnlocked(c))) {
      this.pick = null;
      this.equip(id === 'none' ? null : id);
      return;
    }
    this.pick = id;
    this.g.audio?.shell();
    for (const b of this.el.querySelectorAll('[data-camo]')) b.classList.toggle('is-pick', b.dataset.camo === id);
    this.syncInfo();
    this.showMate(true);
  }

  // El botón de abajo del mate: equipa lo que se está mostrando.
  equipShown() {
    const id = this.shown;
    if (id && id.startsWith('pap:')) return;
    const c = CAMO_BY_ID[id];
    if (c && !camoUnlocked(c)) {
      this.g.audio?.deny();
      this.stage?.nudge();
      return;
    }
    this.equip(c ? c.id : null);
  }

  equip(id) {
    if (id) this.seen.add(id);
    if ((P.camoOf(this.sel) || null) !== id) {
      // (P.setCamo avisa 'change': se rearman las listas)
      P.setCamo(this.sel, id);
      this.g.audio?.purchase();
      const b = this.$('[data-equip]');
      b.classList.remove('is-flash');
      void b.offsetWidth;
      b.classList.add('is-flash');
    }
    this.hover = null;
    this.syncInfo();
    this.showMate(true);
  }

  preview(id) {
    if (id === this.hover) return;
    // al pasar, lo nuevo ya se vio (el cartelito se va al salir de la pestaña)
    if (id && CAMO_BY_ID[id] && camoUnlocked(CAMO_BY_ID[id])) this.seen.add(id);
    this.hover = id;
    this.syncInfo();
    this.showMate();
  }

  // Arma el mate de la escena con lo que se está mirando (los bloqueados se
  // ven enteros: es para tentar).
  showMate(pop = false, instant = pop) {
    if (!this.stage) return;
    const id = this.shown;
    if (id && id.startsWith('pap:')) this.stage.show(this.sel, { pap: id.slice(4) }, pop);
    else {
      let c = CAMO_BY_ID[id];
      // (uno equipado que ya no está desbloqueado no se usa en la partida)
      if (!this.hover && !this.pick && c && !camoUnlocked(c)) c = null;
      this.stage.show(this.sel, { camo: c ? c.id : null }, pop);
    }
    // los accesorios: entran y salen con su animación (al cambiar de mate, ya puestos)
    this.stage.setAcc(this.accShown(), instant);
  }

  // ---------------- accesorios (core/armas.js) ----------------
  // Lo que se ve puesto: lo que lleva y, si pasa por arriba de uno, ese en su
  // parte (también los bloqueados: para tentar).
  accShown() {
    // (el Lanzapava del Mate 47 se ve colgado de la bombilla mientras el especialista está puesto)
    const on = [...Armas.puestos(this.sel), ...(this.sel === 'mate47' && Armas.especialista('mate47')?.on ? ['lanzapava'] : [])];
    const h = this.mode === 'acc' && this.accHover && Armas.ACCESORIOS[this.accHover];
    if (!h) return on;
    return [...on.filter((a) => Armas.ACCESORIOS[a].parte !== h.parte), this.accHover];
  }

  pickMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    store.set(MODE_KEY, mode);
    this.accHover = null;
    this.hover = null;
    this.pick = null;
    this.g.audio?.shell();
    this.syncMode(true);
    this.syncInfo();
    this.showMate();
  }

  syncMode(enter = false) {
    const acc = this.mode === 'acc';
    for (const b of this.el.querySelectorAll('[data-mode]')) {
      const on = b.dataset.mode === this.mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.$('[data-accs]').hidden = !acc;
    this.$('.mdu-arm__tabs').hidden = acc;
    this.$('[data-grid]').hidden = acc;
    this.el.classList.toggle('is-acc', acc);
    if (acc) this.syncAccs(enter);
  }

  // El nivel del mate y su barra, los tres lugares, la lista de su categoría
  // y el especialista. enter: las tarjetas entran en cascada (al cambiar de
  // mate o de mitad; al poner o sacar, no).
  syncAccs(enter = false) {
    const box = this.$('[data-accs]');
    const id = this.sel;
    const S = Armas.estado(id);
    const list = Armas.lista(id);
    const on = Armas.puestos(id);
    const n = Armas.lugares(S.level);
    const E = Armas.especialista(id);
    const k = S.max ? 1 : S.xp / S.need;
    const slots = Armas.ARMERIA.lugares
      .map((lvl, i) => {
        if (i >= n) return `<div class="mdu-acc__slot is-lock">${LOCK_SVG}<span>Nivel ${lvl}</span></div>`;
        const a = on[i] && Armas.ACCESORIOS[on[i]];
        if (!a) return '<div class="mdu-acc__slot is-free"><span>Libre</span></div>';
        return `<button class="mdu-acc__slot is-on" data-acc="${on[i]}" title="Sacar">${PART_SVG[a.parte] || ''}<span>${esc(a.name)}</span></button>`;
      })
      .join('');
    const tag = (ok, eq, lvl, idle) => (!ok ? `${LOCK_SVG}Nivel ${lvl}` : eq ? `${CHECK_SVG}Puesto` : idle);
    // (los ganados que todavía no se habían visto: marcados mientras se mira ese
    // mate, hasta cambiar de mate o cerrar la armería; core/armas.js nuevos)
    if (this.freshFor !== id) {
      this.freshFor = id;
      this.fresh = new Set(this.on ? Armas.nuevos(id) : []);
    }
    const fresh = this.fresh;
    const cards = list
      .map((a, i) => {
        const eq = on.includes(a.id);
        return `<button class="mdu-acc__card${a.ok ? '' : ' is-lock'}${eq ? ' is-eq' : ''}${fresh.has(a.id) ? ' is-new' : ''}" data-acc="${a.id}" style="--i:${i}">
          <i class="mdu-acc__ico">${PART_SVG[a.parte] || ''}</i>
          <b class="mdu-acc__name">${esc(a.name)}</b>
          <em class="mdu-acc__fx">${esc(a.txt)}</em>
          <span class="mdu-acc__tag">${tag(a.ok, eq, a.lvl, esc(Armas.PARTES[a.parte]))}</span>
        </button>`;
      })
      .join('');
    const esp = E
      ? `<button class="mdu-acc__card mdu-acc__esp${E.ok ? '' : ' is-lock'}${E.on ? ' is-eq' : ''}" data-esp style="--i:${list.length}">
          <i class="mdu-acc__ico is-star">${STAR_SVG}</i>
          <b class="mdu-acc__name"><small>Especialista</small>${esc(E.name)}</b>
          <em class="mdu-acc__fx">${esc(E.txt)}</em>
          <span class="mdu-acc__tag">${tag(E.ok, E.on, Armas.ARMERIA.especialista, 'Poner')}</span>
        </button>`
      : '';
    box.classList.toggle('is-enter', enter);
    box.innerHTML = `<div class="mdu-acc__lvl">
        <span class="mdu-acc__cat">${esc(Armas.CATEGORIAS[S.cat] || '')}</span>
        <b class="mdu-acc__n">Nivel ${S.level}</b>
        <small class="mdu-acc__xp">${S.max ? 'Máximo' : `${Math.floor(S.xp)} / ${S.need}`}</small>
        <div class="mdu-acc__bar"><span style="--k:${k.toFixed(3)}"></span></div>
      </div>
      <div class="mdu-acc__slots" data-slots>${slots}</div>
      <div class="mdu-acc__list">${cards || '<p class="mdu-acc__none">Sin accesorios todavía</p>'}${esp}</div>`;
    if (fresh.size) {
      Armas.verNuevos(id);
      this.syncBadge();
      this.$(`[data-w="${id}"] .mdu-arm__lv`)?.classList.remove('is-new');
    }
  }

  previewAcc(id) {
    if (id === this.accHover) return;
    this.accHover = id;
    this.stage?.setAcc(this.accShown());
  }

  // Tocar un accesorio: ponerlo (si ya hay uno en esa parte, lo cambia) o sacarlo.
  pickAcc(accId) {
    const id = this.sel;
    const a = Armas.lista(id).find((x) => x.id === accId);
    if (!a) return;
    if (!a.ok) {
      this.g.audio?.deny();
      this.stage?.nudge();
      return;
    }
    if (Armas.puestos(id).includes(accId)) {
      Armas.sacar(id, accId);
      this.g.audio?.shell();
    } else if (Armas.poner(id, accId)) this.g.audio?.purchase();
    else {
      // sin lugar libre: se sacude la fila de lugares
      this.g.audio?.deny();
      const sl = this.$('[data-slots]');
      sl?.classList.remove('is-deny');
      void sl?.offsetWidth;
      sl?.classList.add('is-deny');
      return;
    }
    // (lo que se acaba de tocar ya no es prueba: se ve como queda)
    this.accHover = null;
    this.syncAccs();
    this.syncMates();
    this.stage?.setAcc(this.accShown());
  }

  // El especialista: se pone o se saca acá (no ocupa lugar; el usuario, 2026-10-12)
  pickEsp() {
    const E = Armas.especialista(this.sel);
    if (!E) return;
    if (!E.ok) {
      this.g.audio?.deny();
      this.stage?.nudge();
      return;
    }
    Armas.prenderEspecialista(this.sel, !E.on);
    if (E.on) this.g.audio?.shell();
    else this.g.audio?.purchase();
    this.syncAccs();
    this.stage?.setAcc(this.accShown());
  }
}

// ---------------- la escena 3D ----------------
// El mate sobre un posavasos de cuero, en una mesa oscura, con una luz de
// arriba que le marca la forma, un contraluz frío y motitas de polvo en el haz.
class ArmoryStage {
  constructor(g) {
    this.g = g;
    const T = g.textures;
    this.T = T;
    this.size = new THREE.Vector2();
    this.center = null;
    this.t = 0;
    this.rotY = 0.6;
    this.rotX = 0;
    this.vel = 0;
    this.dist = 0.62;
    this.distTo = 0.62;
    this.popT = 1;
    this.shake = 0;
    this.cache = new Map();
    // los accesorios (core/armas.js): cuánto entró cada uno (0 a 1) y cuáles van
    this.accK = new Map();
    this.accWant = new Set();
    const S = (this.scene = new THREE.Scene());
    S.background = new THREE.Color(0x050304);
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 20);
    // el fondo: un degradé cálido detrás del mate
    const bg = document.createElement('canvas');
    bg.width = bg.height = 256;
    const bctx = bg.getContext('2d');
    const grad = bctx.createRadialGradient(128, 118, 8, 128, 128, 128);
    grad.addColorStop(0, '#3a2416');
    grad.addColorStop(0.45, '#1a0f0a');
    grad.addColorStop(1, '#050304');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 256, 256);
    const bgTex = new THREE.CanvasTexture(bg);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: false, depthWrite: false }));
    back.position.set(0, 0.2, -1.6);
    S.add(back);
    // la mesa y el posavasos
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 48), new THREE.MeshStandardMaterial({ map: T.planksDark || T.woodCarved, color: 0x7a5a44, roughness: 0.7 }));
    table.position.y = -0.02;
    table.receiveShadow = true;
    S.add(table);
    const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.006, 40), new THREE.MeshStandardMaterial({ map: T.leather, color: 0xb08868, roughness: 0.75 }));
    coaster.position.y = 0.003;
    coaster.receiveShadow = true;
    coaster.castShadow = true;
    S.add(coaster);
    // luces
    S.add(new THREE.HemisphereLight(0x8a7a6a, 0x1a100a, 0.55));
    const key = new THREE.SpotLight(0xffe2bc, 7, 0, 0.42, 0.65, 0);
    key.position.set(-0.35, 1.2, 0.45);
    key.target.position.set(0, 0.06, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 2.4;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 3;
    S.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 2.2);
    rim.position.set(0.5, 0.4, -0.8);
    S.add(rim);
    const fill = new THREE.PointLight(0xff9a5a, 0.6, 0, 0);
    fill.position.set(0.5, 0.15, 0.5);
    S.add(fill);
    // polvo en el haz de luz
    const n = 70;
    const pos = new Float32Array(n * 3);
    this.motes = [];
    for (let i = 0; i < n; i++) {
      const m = { x: (Math.random() - 0.5) * 0.7, y: Math.random() * 0.6, z: (Math.random() - 0.5) * 0.5, s: 0.004 + Math.random() * 0.01, ph: Math.random() * 6 };
      this.motes.push(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: T.dot, color: 0xffd9a8, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    S.add(this.dust);
    this.holder = new THREE.Group();
    S.add(this.holder);
    // la mano y la manga (cupHand y forearm de weapons/viewmodels.js)
    const M = getMats(T);
    this.hand = new Set([M.skin, M.nail, M.cuff, M.sleeve, M.glove]);
  }

  // Un mate armado para mostrar: parado (sin la inclinación de la mano) y sin
  // la mano. key: qué mate y con qué.
  model(id, look, hand = 'R') {
    const key = `${id}|${look.pap || ''}|${look.camo || ''}|${hand}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const up = look.pap ? 1 : 0;
    const m = buildMate(id, up, this.T, hand, look.pap ? null : look.camo);
    const mate = m.mate;
    mate.removeFromParent();
    mate.rotation.set(0, 0, 0);
    const pap = look.pap ? papPreviewMaterial(look.pap, this.T) : null;
    const fingers = [];
    mate.traverse((o) => {
      if (!o.isMesh) return;
      if (this.hand.has(o.material)) fingers.push(o);
      else if (pap && o.material?.name?.startsWith('camo:pap')) o.material = pap;
      o.castShadow = true;
    });
    for (const o of fingers) o.removeFromParent();
    // la bombilla parada, como en un mate de verdad (en la mano va acostada:
    // es el caño)
    for (const straw of m.bombGroup?.children || []) straw.rotation.x = -0.32;
    // apoyado sobre el posavasos; el eje de la calabaza en el medio (el trabuco
    // de la Gut, que va acostado, por su caja)
    mate.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(mate);
    const flat = !m.bombGroup;
    mate.position.set(flat ? -(b.min.x + b.max.x) / 2 : 0, 0.006 - b.min.y, flat ? -(b.min.z + b.max.z) / 2 : 0);
    // los accesorios de su categoría, todos, escondidos: entran y salen
    // animados (ui/Armory accShown; weapons/accesorios.js)
    const accIds = [...Armas.lista(id).map((a) => a.id), ...(id === 'mate47' ? ['lanzapava'] : [])].filter(tieneModelo);
    if (accIds.length) ponerAccesorios(m, accIds, this.T, { armeria: true });
    const g = new THREE.Group();
    g.add(mate);
    g.userData.acc = m.acc || null;
    if (hand === 'L') g.scale.x = -1;
    this.cache.set(key, g);
    return g;
  }

  // Qué accesorios se ven puestos; instant: sin animación (otro mate).
  setAcc(ids, instant = false) {
    this.accWant = new Set(ids);
    if (!instant) return;
    this.accK.clear();
    for (const id of ids) this.accK.set(id, 1);
  }

  // Cada cuadro: avanza la entrada o la salida de cada accesorio y la aplica a
  // los mates de la escena (los de dos manos, a los dos).
  tickAcc(dt) {
    const all = new Map();
    for (const c of this.holder.children) for (const [id, a] of Object.entries(c.userData.acc || {})) all.set(id, [...(all.get(id) || []), a]);
    const step = [];
    for (const [id, list] of all) {
      let k = this.accK.get(id) ?? 0;
      const want = this.accWant.has(id) ? 1 : 0;
      if (k !== want) k = want > k ? Math.min(1, k + dt / 0.75) : Math.max(0, k - dt / 0.6);
      this.accK.set(id, k);
      for (const a of list) step.push([a, k]);
    }
    // (todos juntos: si uno sale y otro entra en la misma parte, lo que tapan lo decide el que más entró)
    if (step.length) animarAccesorios(step);
  }

  show(id, look, pop) {
    this.holder.clear();
    const w = WEAPONS[id];
    if (w.akimbo) {
      for (const [hand, x] of [
        ['R', 0.045],
        ['L', -0.045],
      ]) {
        const m = this.model(id, look, hand);
        m.position.set(x, 0, 0);
        this.holder.add(m);
      }
    } else this.holder.add(this.model(id, look));
    // encuadre: los altos (con bombilla larga) un poco más lejos
    const box = new THREE.Box3().setFromObject(this.holder);
    const h = box.max.y - box.min.y;
    // (lo que se sale de costado, como el cargador, cuenta al girar)
    const r = Math.max(Math.abs(box.min.x), box.max.x, Math.abs(box.min.z), box.max.z);
    const size = Math.max(h, r * 1.6);
    this.aim = Math.max(0.04, h * 0.44);
    this.distTo = THREE.MathUtils.clamp(size * 2.7, 0.34, 1.1);
    if (pop) this.popT = 0;
  }

  spin(dx, dy) {
    this.vel = dx * 0.012;
    this.rotY += dx * 0.012;
    this.rotX = THREE.MathUtils.clamp(this.rotX + dy * 0.006, -0.35, 0.5);
  }

  zoom(dy) {
    this.distTo = THREE.MathUtils.clamp(this.distTo * (1 + Math.sign(dy) * 0.08), 0.28, 1.1);
  }

  // un "no" con la cabeza (quiso equipar uno bloqueado)
  nudge() {
    this.shake = 1;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    tickCamos(t);
    tickMolino(this.T, t);
    // gira solo, más despacio si recién lo soltaron
    this.vel *= Math.exp(-dt * 3);
    this.rotY += dt * 0.35 + this.vel * dt * 8;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.popT = Math.min(1, this.popT + dt * 3.2);
    const pop = 1 + Math.sin(this.popT * Math.PI) * 0.06 * (1 - this.popT);
    this.holder.rotation.set(this.rotX * 0.6, this.rotY + Math.sin(t * 40) * 0.08 * this.shake, 0);
    this.holder.scale.setScalar(pop);
    this.tickAcc(dt);
    this.dist += (this.distTo - this.dist) * Math.min(1, dt * 6);
    const cam = this.camera;
    const aim = this.aim ?? 0.1;
    cam.position.set(Math.sin(t * 0.21) * 0.02, aim + 0.05 + this.rotX * 0.2 + Math.sin(t * 0.33) * 0.008, this.dist);
    cam.lookAt(0, aim, 0);
    // el polvo sube despacito y titila
    const p = this.dust.geometry.attributes.position;
    this.motes.forEach((m, i) => {
      const y = (m.y + t * m.s) % 0.6;
      p.setXYZ(i, m.x + Math.sin(t * 0.4 + m.ph) * 0.02, y, m.z + Math.cos(t * 0.3 + m.ph) * 0.02);
    });
    p.needsUpdate = true;
  }

  render(renderer, dt) {
    this.onFrame?.();
    renderer.getSize(this.size);
    const w = this.size.x;
    const h = this.size.y;
    const cam = this.camera;
    // el mate va en el hueco entre los paneles (la vista se corre)
    const off = this.center != null ? -(this.center - w / 2) : 0;
    const offY = this.centerY != null ? -(this.centerY - h / 2) : 0;
    if (cam.aspect !== w / h || this.off !== off || this.offY !== offY) {
      cam.aspect = w / h;
      this.off = off;
      this.offY = offY;
      if (off || offY) cam.setViewOffset(w, h, off, offY, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    if (!this.scene.environment) {
      this.scene.environment = this.g.weapons?.envMap || new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.7;
    }
    this.update(Math.min(dt, 0.1));
    const auto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(this.scene, cam);
    renderer.autoClear = auto;
  }
}
