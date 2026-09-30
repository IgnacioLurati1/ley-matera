// El perfil en el menú: la tarjeta del jugador arriba a la derecha del
// título y la pantalla de Niveles, armada como un pase: una pista con los 55
// niveles del prestigio de ahora y lo que trae cada uno (camuflajes,
// empanadas, especiales que se pueden empezar a usar y pesos). Abajo, el
// detalle de lo elegido. Otras dos pestañas: los prestigios (emblemas y sus
// premios) y el guardado (la copia de seguridad y el aviso de Brave).

import * as P from '../core/progress';
import { rankSvg, pesoSvg } from './rankIcons';
import { tierOf, prestigeRewards, KIND_NAME } from './unlocks';
import { EMPANADA, RARITY } from '../config/empanadas';
import { empanadaIcon } from '../weapons/empanadaModels';
import { CAMO_BY_ID, camoCanvas } from '../weapons/camos';
import { useLine } from './Pulperia';
import './profile.css';

const fmt = (n) => Math.round(n).toLocaleString('es-AR');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rankLine = (r) => (r.master ? `Maestro · nivel ${r.level}` : `Nivel ${r.level} · ${r.name}${r.prestige ? ` · Prestigio ${r.prestigeName}` : ''}`);

// Las muestras de los camuflajes (chicas, de los lienzos de weapons/camos).
const thumbs = new Map();
function camoThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  const src = camoCanvas(id);
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 96;
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const u = c.toDataURL('image/jpeg', 0.85);
  thumbs.set(id, u);
  return u;
}

export default class Profile {
  constructor(menus) {
    this.m = menus;
    this.g = menus.g;
    this.tab = 'pase';
    this.card = document.createElement('button');
    this.card.className = 'mdu-card';
    this.card.type = 'button';
    this.card.dataset.act = 'levels';
    menus.screens.title.appendChild(this.card);
    menus.screen(
      'levels',
      `<div class="mdu-lv">
         <header class="mdu-lv__top">
           <div class="mdu-lv__emb" data-emb></div>
           <div class="mdu-lv__who">
             <b data-lvl></b><span data-rank></span>
             <div class="mdu-lv__bar"><i data-bar></i></div>
             <small data-num></small>
           </div>
           <div class="mdu-lv__side">
             <div class="mdu-pulp__purse" title="Tus pesos">${pesoSvg(40)}<b data-pesos>0</b></div>
             <button class="mdu-lv__prestige" data-lv="prestige" hidden>Prestigiar</button>
           </div>
         </header>
         <p class="mdu-lv__note" data-note hidden></p>
         <div class="mdu-kit-tabs">
           <button class="mdu-kit-tab is-on" data-ltab="pase">Pase</button>
           <button class="mdu-kit-tab" data-ltab="prestigios">Prestigios</button>
           <button class="mdu-kit-tab" data-ltab="guardado">Tu progreso</button>
         </div>
         <section class="mdu-lv__pane" data-lpane="pase">
           <div class="mdu-pass">
             <button class="mdu-pass__arrow" data-lv="left" aria-label="Anteriores">‹</button>
             <div class="mdu-pass__track" data-track></div>
             <button class="mdu-pass__arrow" data-lv="right" aria-label="Siguientes">›</button>
           </div>
           <div class="mdu-pass__info" data-info></div>
         </section>
         <section class="mdu-lv__pane" data-lpane="prestigios" hidden>
           <div class="mdu-lv__prests" data-prests></div>
         </section>
         <section class="mdu-lv__pane" data-lpane="guardado" hidden>
           <div class="mdu-lv__save" data-save></div>
           <div class="mdu-lv__backup">
             <button class="mdu-kit-card mdu-lv__bk" data-lv="copy"><b>Copiar código</b><small>Para pegarlo en otro navegador</small></button>
             <button class="mdu-kit-card mdu-lv__bk" data-lv="file"><b>Bajar archivo</b><small>Una copia en tu compu</small></button>
             <button class="mdu-kit-card mdu-lv__bk" data-lv="load"><b>Cargar una copia</b><small>Código o archivo</small></button>
             <input type="file" accept=".txt,.json,text/plain" data-file hidden>
           </div>
           <div class="mdu-lv__import" data-import hidden>
             <textarea spellcheck="false" placeholder="Pegá acá el código (MDU1.…)" data-code></textarea>
             <div class="mdu-lv__imrow"><button class="mdu-btn" data-lv="apply">Cargar</button><button class="mdu-btn" data-lv="file2">Desde un archivo…</button><span class="mdu-lv__msg" data-msg></span></div>
           </div>
           <h3 class="mdu-pulp__h">Cómo se gana experiencia</h3>
           <ul class="mdu-lv__how">
             <li>Bajas <small>con más zombies en la ronda, cada una vale menos</small></li>
             <li>Rondas, puertas y compras</li>
             <li>Levantar compañeros</li>
             <li>Easter egg de un mapa <small>¼ de prestigio (la 1ª vez, ½) + pesos</small></li>
             <li>Super easter egg <small>casi un prestigio, una vez</small></li>
           </ul>
         </section>
         <div class="mdu-kit-back"><button class="mdu-btn" data-act="back">Volver</button></div>
       </div>`,
    );
    this.el = menus.screens.levels;
    this.el.classList.add('mdu-menu--levels');
    menus.acts.levels = () => {
      menus.prev = menus.current;
      menus.show('levels');
    };
    menus.showHooks.push((name) => {
      if (name === 'title') this.syncCard();
      if (name === 'levels') this.open();
    });
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ltab]');
      if (t) return this.setTab(t.dataset.ltab);
      const tier = e.target.closest('[data-item]');
      if (tier) return this.select(tier.dataset.item);
      const b = e.target.closest('[data-lv]');
      if (b) this.action(b.dataset.lv, b);
    });
    this.el.querySelector('[data-file]').addEventListener('change', (e) => this.fromFile(e.target.files?.[0]));
    // la rueda del mouse corre la pista de costado
    this.el.querySelector('[data-track]').addEventListener(
      'wheel',
      (e) => {
        const tr = e.currentTarget;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          tr.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
    P.on('change', () => {
      this.syncCard();
      if (menus.current === 'levels') this.syncHead();
    });
    window.addEventListener('keydown', (this.onKey = (e) => {
      if (e.code === 'Escape' && menus.current === 'levels' && !this.confirming) menus.act('back');
    }));
    this.syncCard();
  }

  syncCard() {
    const r = P.rank();
    const k = r.max ? 1 : r.xp / r.need;
    const note = !!P.profile().note;
    this.card.innerHTML = `${rankSvg(r, 64)}<span class="mdu-card__txt"><b>${r.master ? 'Maestro' : `Nivel ${r.level}`}</b><small>${r.master ? `nivel ${r.level}` : r.name}${r.prestige && !r.master ? ` · P${r.prestige}` : ''}</small><span class="mdu-card__bar"><i style="width:${(k * 100).toFixed(1)}%"></i></span></span><span class="mdu-card__pesos">${pesoSvg(22)}<b>${P.pesos()}</b></span>${r.canPrestige ? '<em class="mdu-card__new">¡Prestigio!</em>' : note ? '<em class="mdu-card__new">¡Nuevo!</em>' : ''}`;
    this.card.title = 'Niveles, prestigio y copia de tu progreso';
  }

  open() {
    this.syncHead();
    this.setTab(this.tab);
  }

  setTab(t) {
    this.tab = t;
    for (const b of this.el.querySelectorAll('[data-ltab]')) b.classList.toggle('is-on', b.dataset.ltab === t);
    for (const p of this.el.querySelectorAll('[data-lpane]')) p.hidden = p.dataset.lpane !== t;
    if (t === 'pase') this.renderPass();
    if (t === 'prestigios') this.renderPrestiges();
    if (t === 'guardado') this.checkSaved();
  }

  syncHead() {
    const r = P.rank();
    const $ = (s) => this.el.querySelector(s);
    $('[data-emb]').innerHTML = rankSvg(r, 150);
    $('[data-lvl]').textContent = r.master ? `Maestro ${r.level}` : `Nivel ${r.level}`;
    $('[data-rank]').textContent = r.master ? 'La calavera matera' : `${r.name}${r.prestige ? ` · Prestigio ${r.prestigeName}` : ''}`;
    $('[data-bar]').style.width = `${(r.max ? 1 : r.xp / r.need) * 100}%`;
    $('[data-num]').textContent = r.max ? 'Nivel máximo' : `${fmt(r.xp)} / ${fmt(r.need)} XP`;
    $('[data-pesos]').textContent = P.pesos();
    $('[data-lv="prestige"]').hidden = !r.canPrestige;
    $('[data-lv="prestige"]').textContent = r.prestige + 1 > P.PRESTIGES ? 'Ser Maestro' : `Prestigiar · ${P.PRESTIGE_NAMES[r.prestige + 1]}`;
    const note = P.takeNote();
    if (note) {
      $('[data-note]').textContent = note;
      $('[data-note]').hidden = false;
    } else if (!this.keepNote) $('[data-note]').hidden = true;
    this.keepNote = false;
  }

  // ---------- el pase ----------
  renderPass() {
    const r = P.rank();
    const p = Math.min(r.prestige, P.MASTER);
    const master = r.master;
    // Maestro: la pista muestra de a 55 niveles alrededor del de ahora
    const from = master ? Math.max(P.LEVELS + 1, r.level - 10) : 1;
    const to = master ? Math.min(P.MASTER_MAX, from + 54) : P.LEVELS;
    const cols = [];
    this.items = new Map();
    for (let lv = from; lv <= to; lv++) {
      const items = tierOf(lv, p);
      const got = lv <= r.level;
      const next = lv === r.level + 1;
      const state = got ? 'is-got' : next ? 'is-next' : 'is-lock';
      const fill = got ? 1 : next ? (r.max ? 1 : r.xp / r.need) : 0;
      const tiles = items
        .map((x) => {
          const key = `${x.kind}:${x.id}:${lv}`;
          this.items.set(key, x);
          const have = x.kind === 'pesos' ? got : P.unlocked({ level: x.level, prestige: x.prestige });
          return `<button class="mdu-pass__tile mdu-pass__tile--${x.kind} ${have ? 'is-got' : 'is-lock'}" data-item="${key}" title="${esc(x.name)}">${this.art(x)}<span>${esc(x.name)}</span></button>`;
        })
        .join('');
      cols.push(`<div class="mdu-pass__col ${state} ${items.length ? '' : 'is-empty'} ${items.length > 2 ? 'is-many' : ''}" data-lvcol="${lv}">
        <span class="mdu-pass__lv">${lv}</span>
        <div class="mdu-pass__tiles">${tiles}</div>
        <span class="mdu-pass__rail"><i style="width:${(fill * 100).toFixed(1)}%"></i></span>
      </div>`);
    }
    const tr = this.el.querySelector('[data-track]');
    tr.innerHTML = cols.join('');
    // se va al nivel de ahora
    requestAnimationFrame(() => {
      const cur = tr.querySelector(`[data-lvcol="${Math.min(to, r.level + 1)}"]`);
      if (cur) tr.scrollLeft = cur.offsetLeft - tr.clientWidth * 0.35;
    });
    // lo primero que viene, elegido
    const first = [...this.items.entries()].find(([, x]) => x.level > r.level) || [...this.items.entries()].pop();
    if (first) this.select(first[0]);
    else this.el.querySelector('[data-info]').innerHTML = '';
    this.fillThumbs();
  }

  // El dibujito de cada premio.
  art(x) {
    if (x.kind === 'pesos') return `<i class="mdu-pass__art mdu-pass__art--pesos">${pesoSvg(40).repeat(Math.min(3, x.n))}${x.n > 3 ? `<em>×${x.n}</em>` : ''}</i>`;
    if (x.kind === 'camo') {
      const u = thumbs.get(x.id);
      return `<i class="mdu-pass__art mdu-pass__art--camo" data-thumb="${x.id}"${u ? ` style="background-image:url(${u})"` : ''}></i>`;
    }
    let u = null;
    try {
      u = empanadaIcon(this.g.renderer, x.id, 96);
    } catch {
      u = null;
    }
    const e = EMPANADA[x.id];
    const c = e.kind === 'especial' ? RARITY[e.rarity].color : e.color;
    return `<i class="mdu-pass__art mdu-pass__art--emp" style="--c:${c}">${u ? `<img src="${u}" alt="">` : ''}</i>`;
  }

  // Las muestras de camuflaje se pintan de a poco (algunas tardan).
  fillThumbs() {
    const pend = [...this.el.querySelectorAll('[data-thumb]:not([style])')];
    const step = () => {
      for (let k = 0; k < 2 && pend.length; k++) {
        const el = pend.shift();
        const u = camoThumb(el.dataset.thumb);
        if (u) for (const same of this.el.querySelectorAll(`[data-thumb="${el.dataset.thumb}"]`)) same.style.backgroundImage = `url(${u})`;
      }
      if (pend.length && this.m.current === 'levels') setTimeout(step, 30);
    };
    setTimeout(step, 50);
  }

  select(key) {
    const x = this.items?.get(key);
    if (!x) return;
    for (const t of this.el.querySelectorAll('[data-item]')) t.classList.toggle('is-sel', t.dataset.item === key);
    const r = P.rank();
    const got = x.kind === 'pesos' ? x.level <= r.level && x.prestige === Math.min(r.prestige, P.MASTER) : P.unlocked({ level: x.level, prestige: x.prestige });
    let body = '';
    let big = this.art(x);
    if (x.kind === 'camo') {
      const c = CAMO_BY_ID[x.id];
      body = esc(c?.desc || '');
      const u = camoThumb(x.id);
      if (u) big = `<i class="mdu-pass__art mdu-pass__art--camo" style="background-image:url(${u})"></i>`;
    } else if (x.kind === 'emp' || x.kind === 'use') {
      const e = EMPANADA[x.id];
      body = `${esc(e.desc)} <small>${useLine(e)}</small>`;
    } else if (x.kind === 'pesos') body = 'Para cambiar por empanadas especiales en la pulpería.';
    const same = (x.prestige | 0) === Math.min(r.prestige, P.MASTER);
    const need = same || !x.prestige ? `Nivel ${x.level}` : x.prestige >= P.MASTER ? `Maestro, nivel ${x.level}` : `Prestigio ${P.PRESTIGE_NAMES[x.prestige]}`;
    const left = Math.max(0, x.level - r.level);
    const state = got ? (x.kind === 'use' ? 'Ya la podés usar' : 'Desbloqueado') : same ? `${need} · ${left === 1 ? 'te falta uno' : `te faltan ${left}`}` : need;
    this.el.querySelector('[data-info]').innerHTML = `<span class="mdu-pass__big">${big}</span><div><small>${KIND_NAME[x.kind]} · <em class="${got ? 'is-got' : ''}">${got ? '✓' : '🔒'} ${state}</em></small><b>${esc(x.name)}</b><span>${esc(x.sub || '')}</span><p>${body}</p></div>`;
  }

  // ---------- prestigios ----------
  renderPrestiges() {
    const r = P.rank();
    let html = '';
    for (let p = 1; p <= P.MASTER; p++) {
      const got = r.prestige >= p;
      const rw = prestigeRewards(p);
      const name = p > P.PRESTIGES ? 'Maestro' : `Prestigio ${P.PRESTIGE_NAMES[p]}`;
      html += `<div class="mdu-kit-card mdu-lv__pr ${got ? 'is-got' : ''} ${r.prestige === p ? 'is-now' : ''}">
        ${rankSvg({ level: p > P.PRESTIGES ? P.LEVELS + 1 : 1, prestige: p }, 72)}
        <b>${name}</b><small>+${P.PESOS.prestige} pesos${rw.length ? ` · ${rw.map((x) => esc(x.name)).join(' · ')}` : ''}</small></div>`;
    }
    this.el.querySelector('[data-prests]').innerHTML = html;
  }

  // ---------- guardado ----------
  // El aviso: en el navegador, y Brave o el modo privado lo borran.
  async checkSaved() {
    const box = this.el.querySelector('[data-save]');
    const [brave, kept] = await Promise.all([P.isBrave(), P.persisted()]);
    const d = P.profile();
    const when = d.saved ? new Date(d.saved).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'todavía no';
    box.classList.toggle('is-brave', !!brave);
    box.innerHTML = `<b>Tu progreso vive solo en este navegador.</b> Si borrás los datos, usás el modo privado o cambiás de compu, se pierde: bajate una copia.${
      brave ? '<br><b>Brave:</b> apagá «Olvidarme al cerrar este sitio» (el león de la barra) o lo borra cada vez que cerrás.' : ''
    }<small>Último guardado: ${when}${kept === true ? ' · guardado persistente ✓' : ''}</small>`;
  }

  action(a, b) {
    const $ = (s) => this.el.querySelector(s);
    const msg = (t, bad) => {
      const m = $('[data-msg]');
      m.textContent = t;
      m.classList.toggle('is-bad', !!bad);
    };
    const tr = $('[data-track]');
    if (a === 'left' || a === 'right') tr.scrollBy({ left: (a === 'left' ? -1 : 1) * tr.clientWidth * 0.7, behavior: 'smooth' });
    else if (a === 'copy') {
      const code = P.exportCode();
      navigator.clipboard?.writeText(code).then(
        () => this.flash(b, '¡Copiado!'),
        () => this.showCode(code),
      ) ?? this.showCode(code);
    } else if (a === 'file') {
      const blob = new Blob([P.exportCode()], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const r = P.rank();
      link.href = url;
      link.download = `Mate der Untoten - progreso nivel ${r.level}${r.prestige ? ` P${r.prestige}` : ''}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.flash(b, '¡Listo!');
    } else if (a === 'load') {
      const box = $('[data-import]');
      box.hidden = !box.hidden;
      if (!box.hidden) $('[data-code]').focus();
    } else if (a === 'file2') $('[data-file]').click();
    else if (a === 'apply') {
      const code = $('[data-code]').value;
      if (!code.trim()) return msg('Pegá el código primero.', true);
      this.confirmLoad(code, msg);
    } else if (a === 'prestige') this.confirmPrestige();
  }

  fromFile(file) {
    if (!file) return;
    const msg = (t, bad) => {
      const m = this.el.querySelector('[data-msg]');
      m.textContent = t;
      m.classList.toggle('is-bad', !!bad);
    };
    file.text().then((t) => {
      this.el.querySelector('[data-import]').hidden = false;
      this.el.querySelector('[data-code]').value = t.trim();
      this.confirmLoad(t, msg);
    });
    this.el.querySelector('[data-file]').value = '';
  }

  confirmLoad(code, msg) {
    const cur = P.rank();
    this.ask(`¿Cargar esta copia? Reemplaza tu progreso de ahora (${rankLine(cur)}, ${P.pesos()} pesos).`, 'Cargar', () => {
      if (P.importCode(code)) {
        msg(`Listo: ${rankLine(P.rank())}.`);
        this.syncHead();
      } else msg('Ese código no sirve (¿se cortó al copiarlo?).', true);
    });
  }

  confirmPrestige() {
    const r = P.rank();
    const master = r.prestige + 1 > P.PRESTIGES;
    const to = r.prestige + 1;
    const news = prestigeRewards(to).filter((x) => x.level <= (master ? P.LEVELS + 1 : 1));
    this.ask(
      master ? '¿Pasar a Maestro? Seguís del nivel 56 en adelante.' : `¿Prestigiar? Volvés al nivel 1 con el Prestigio ${P.PRESTIGE_NAMES[to]}. No perdés nada de lo desbloqueado.`,
      master ? 'Ser Maestro' : 'Prestigiar',
      () => {
        if (!P.prestige()) return;
        P.setNote(`${master ? '¡Sos Maestro!' : `¡Prestigio ${P.PRESTIGE_NAMES[to]}!`} +${P.PESOS.prestige} pesos${news.length ? ` · ${news.map((x) => x.name).join(' · ')}` : ''}.`);
        this.open();
        const emb = this.el.querySelector('[data-emb]');
        emb.classList.remove('is-burst');
        void emb.offsetWidth;
        emb.classList.add('is-burst');
        try {
          const A = this.g.audio;
          A?.resume?.();
          A?.tune?.([[60, 0.5], [64, 0.5], [67, 0.5], [72, 1], [67, 0.5], [72, 0.5], [76, 0.5], [79, 3]], { wave: 'triangle', bpm: 200, gain: 0.16, cutoff: 3200 });
        } catch {
          /* sin audio */
        }
      },
    );
  }

  // Un cartel de confirmación sobre la pantalla.
  ask(text, yes, fn) {
    this.confirming = true;
    const d = document.createElement('div');
    d.className = 'mdu-ask';
    d.innerHTML = `<div class="mdu-ask__box"><p></p><div><button class="mdu-btn" data-y></button><button class="mdu-btn" data-n>Cancelar</button></div></div>`;
    d.querySelector('p').textContent = text;
    d.querySelector('[data-y]').textContent = yes;
    const close = () => {
      d.remove();
      window.removeEventListener('keydown', key, true);
      setTimeout(() => (this.confirming = false), 0);
    };
    const key = (e) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    d.querySelector('[data-y]').onclick = () => {
      close();
      fn();
    };
    d.querySelector('[data-n]').onclick = close;
    d.addEventListener('click', (e) => e.target === d && close());
    window.addEventListener('keydown', key, true);
    this.el.appendChild(d);
    d.querySelector('[data-n]').focus();
  }

  showCode(code) {
    this.el.querySelector('[data-import]').hidden = false;
    const t = this.el.querySelector('[data-code]');
    t.value = code;
    t.select();
  }

  flash(b, t) {
    const el = b.querySelector('b') || b;
    const was = el.dataset.was || el.textContent;
    el.dataset.was = was;
    el.textContent = t;
    setTimeout(() => (el.textContent = was), 1400);
  }
}
