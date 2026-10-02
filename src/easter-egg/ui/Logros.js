import * as L from '../core/logros';
import './logros.css';

// Los logros en el menú: una tarjeta chica abajo de la del nivel (no es un
// renglón más de la lista: en pantallas chicas la lista ya llega justo) y su
// pantalla, con los generales y los de cada mapa. Los secretos no dicen nada
// hasta que salen. La lista y el guardado: core/logros.js.

const SEEN = 'lm-logros-visto';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString('es-AR');

// Los símbolos (en 24×24): .f relleno claro con borde, .s trazo claro, .d oscuro.
const ICONS = {
  skull: '<path class="f" d="M12 3.2c-4.3 0-7.6 3-7.6 7 0 2.3 1.1 4.2 2.8 5.4v2.6c0 .6.4 1 1 1h1.4v-1.8h1.6v1.8h1.6v-1.8h1.6v1.8h1.4c.6 0 1-.4 1-1v-2.6c1.7-1.2 2.8-3.1 2.8-5.4 0-4-3.3-7-7.6-7z"/><circle class="d" cx="9" cy="11" r="1.9"/><circle class="d" cx="15" cy="11" r="1.9"/><path class="d" d="M12 13.2l1.1 2h-2.2z"/>',
  aim: '<circle class="s" cx="12" cy="12" r="7"/><circle class="s" cx="12" cy="12" r="2.4"/><path class="s" d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  knife: '<path class="f" d="M20.5 3.2c-3.6 1-7.9 4.6-10.7 8.1l2.9 2.9c3.5-2.8 7.1-7.1 7.8-11z"/><path class="f" d="M9.2 12.4l-5 5c-.5.5-.5 1.3 0 1.8l1.1 1.1c.5.5 1.3.5 1.8 0l5-5z" style="fill:#c8923a"/>',
  round: '<path class="s" d="M5.5 5v14M9.5 5v14M13.5 5v14M17.5 5v14M3.5 17L20 7"/>',
  mate: '<path class="f" d="M6.6 9.4c-.9 5.4 1.2 10.6 5.4 10.6s6.3-5.2 5.4-10.6z"/><rect class="f" x="6" y="7.6" width="12" height="2.4" rx=".6" style="fill:#f2c14e"/><path class="s" d="M13 8.4l3.6-5.6h2" style="stroke:#f2c14e"/>',
  pava: '<path class="f" d="M5 11.5c0-3 3.1-5 7-5s7 2 7 5v5.5c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3z"/><path class="s" d="M19 12.5l2.8-2.8M8.5 6.6c0-2.2 1.6-3.6 3.5-3.6s3.5 1.4 3.5 3.6"/>',
  box: '<path class="f" d="M3.5 9h17v10.5c0 .6-.4 1-1 1h-15c-.6 0-1-.4-1-1z"/><path class="f" d="M3.5 9c0-3 1.8-4.8 4-4.8h9c2.2 0 4 1.8 4 4.8z" style="fill:#c8923a"/><rect class="d" x="10.4" y="8" width="3.2" height="4.2" rx=".6"/>',
  door: '<path class="f" d="M6 21V8.5C6 5 8.7 3 12 3s6 2 6 5.5V21z"/><path class="d" d="M12 3v18" style="stroke:#2a1a10;stroke-width:1"/><circle class="d" cx="14.4" cy="13" r="1.1"/>',
  coin: '<circle class="f" cx="12" cy="12" r="8.2" style="fill:#f2c14e"/><circle class="s" cx="12" cy="12" r="5.6" style="stroke:#8a5a14;stroke-width:1.4"/><path class="s" d="M12 7.6v8.8M14.4 9.6c-.5-.9-1.3-1.3-2.4-1.3-1.4 0-2.4.7-2.4 1.8 0 2.6 4.9 1.4 4.9 4 0 1.1-1 1.9-2.5 1.9-1.2 0-2.1-.5-2.6-1.4" style="stroke:#8a5a14;stroke-width:1.4"/>',
  friends: '<circle class="f" cx="8.5" cy="8.2" r="3.2"/><circle class="f" cx="15.8" cy="9.2" r="2.8"/><path class="f" d="M2.8 19.5c0-3.5 2.5-6 5.7-6s5.7 2.5 5.7 6z"/><path class="f" d="M12.2 19.5c.2-3 1.6-5.2 3.6-5.2 2.6 0 4.6 2.2 4.6 5.2z"/>',
  hand: '<path class="f" d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" style="fill:#e8483a"/>',
  crown: '<path class="f" d="M3.5 17.5l-1-10 5.2 4.4L12 4.5l4.3 7.4 5.2-4.4-1 10z" style="fill:#f2c14e"/><rect class="f" x="3.5" y="17.5" width="17" height="3" rx=".6" style="fill:#f2c14e"/>',
  empanada: '<path class="f" d="M2.8 15.5C3.6 9.6 7.6 6 12 6s8.4 3.6 9.2 9.5z" style="fill:#e0a24a"/><path class="s" d="M4.4 14.4l1.6-1.4 1.4 1.2 1.6-1.4 1.4 1.2 1.6-1.4 1.4 1.2 1.6-1.4 1.4 1.2 1.6-1.4" style="stroke:#8a4a14;stroke-width:1.3"/>',
  shoe: '<path class="f" d="M3 16.5V9.6l3.6 1.2c1.7-.4 3.2 0 4.4 1.1 2.9.7 6.2 1.9 8.4 3.3.9.6 1 1.3.6 1.3z"/><path class="f" d="M2.8 16.4h18.4v2.2H2.8z" style="fill:#c8923a"/><path class="s" d="M.8 11.4h1.6M.8 14h1.6" style="stroke-width:1.4"/>',
  map: '<path class="f" d="M3 6.2l5.6-2.2 6.8 2.2L21 4v13.8l-5.6 2.2-6.8-2.2L3 20z"/><path class="s" d="M8.6 4v13.8M15.4 6.2V20" style="stroke:#2a1a10;stroke-width:1"/>',
  star: '<path class="f" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" style="fill:#f2c14e"/>',
  sun: '<circle class="f" cx="12" cy="12" r="4.6" style="fill:#f2c14e"/><path class="s" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" style="stroke:#f2c14e"/>',
  egg: '<path class="f" d="M12 2.8c-3.6 0-6.6 6-6.6 10.6 0 4.1 2.9 7 6.6 7s6.6-2.9 6.6-7C18.6 8.8 15.6 2.8 12 2.8z"/><path class="s" d="M6.4 12.6l2.4-1.6 2.2 1.6 2.2-1.6 2.2 1.6 2.4-1.6" style="stroke:#c8102e;stroke-width:1.5"/>',
  hoz: '<path class="f" d="M5 6.5C8.6 2 16.4 2.2 19.5 7.4c-3.8-2.6-9.3-2.5-12.2 1.3z" style="fill:#f2c14e"/><path class="s" d="M7.6 8.4L17 20" style="stroke:#c8923a;stroke-width:2.6"/>',
  key: '<circle class="s" cx="7.5" cy="8.5" r="3.8" style="stroke:#f2c14e"/><path class="s" d="M10.3 11.3l8.9 8.9M15.6 16.6l2.2-2.2M17.8 18.8l1.8-1.8" style="stroke:#f2c14e"/>',
  flask: '<path class="f" d="M9.5 3h5v5.4l5 8.6c.8 1.4-.2 3-1.8 3H6.3c-1.6 0-2.6-1.6-1.8-3l5-8.6z"/><path class="f" d="M6.6 15h10.8l1.3 2.3c.4.8-.1 1.5-1 1.5H6.3c-.9 0-1.4-.7-1-1.5z" style="fill:#7dd82a"/>',
  bolt: '<path class="f" d="M13.6 2.5L5.5 13.4h5.2l-1.6 8.1 8.6-11.4h-5.4z" style="fill:#7ec8ff"/>',
  stairs: '<path class="f" d="M3 20.5v-3.6h4.2v-3.6h4.2V9.7h4.2V6.1h4.2v14.4z"/>',
  book: '<path class="f" d="M12 6.4C9.8 4.8 6.6 4.4 3 5v13.2c3.6-.6 6.8-.2 9 1.4z"/><path class="f" d="M12 6.4c2.2-1.6 5.4-2 9-1.4v13.2c-3.6-.6-6.8-.2-9 1.4z"/>',
  ring: '<circle class="s" cx="12" cy="14.2" r="5.6" style="stroke:#f2c14e;stroke-width:2.4"/><path class="f" d="M12 2.8l3 3.4-3 3-3-3z" style="fill:#7ec8ff"/>',
  lock: '<rect class="f" x="6" y="10.5" width="12" height="9.5" rx="1.4" style="fill:#6a625a"/><path class="s" d="M8.6 10.5V8.2a3.4 3.4 0 0 1 6.8 0v2.3" style="stroke:#6a625a"/>',
  q: '<path class="s" d="M8.8 8.6c0-2 1.4-3.4 3.4-3.4s3.4 1.3 3.4 3.1c0 2.6-3.4 2.7-3.4 5.4" style="stroke:#8a8178;stroke-width:2.6"/><circle cx="12.2" cy="18" r="1.6" style="fill:#8a8178"/>',
};

const TIERS = { bronce: ['#f0b27a', '#a8622a', '#4a2408'], plata: ['#ffffff', '#b8c0ca', '#4a525c'], oro: ['#fff0b0', '#e2a926', '#6a4206'], platino: ['#f2fbff', '#9fd2f2', '#2a5a7a'] };
const LOCKED = ['#5a524a', '#2c2824', '#121010'];
let uid = 0;

// La medalla: el disco del color de la categoría, el aro y el símbolo.
export function medal(d, got, size = 56) {
  const [a, b, c] = got ? TIERS[d.tier] || TIERS.bronce : LOCKED;
  const id = `lgm${uid++}`;
  const ico = got ? ICONS[d.icon] || ICONS.star : d.secret ? ICONS.q : ICONS[d.icon] || ICONS.star;
  return `<svg class="mdu-lg-medal${got ? ' is-got' : ''}${got && d.tier === 'platino' ? ' is-plat' : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs>
    <circle cx="32" cy="32" r="30" fill="#120c08"/><circle cx="32" cy="32" r="27.5" fill="url(#${id})"/>
    <circle cx="32" cy="32" r="22" fill="rgba(0,0,0,${got ? 0.28 : 0.35})"/>
    <g transform="translate(14 14) scale(1.5)" class="mdu-lg-ico${got ? '' : ' is-off'}">${ico}</g>
  </svg>`;
}

// El trofeo de la tarjeta y de la pantalla: una copa con forma de mate.
// (cada una con su degradé: el de una pantalla escondida no se pinta en la otra)
const trophy = (s, id = `lgtr${uid++}`) => `<svg class="mdu-lg-trophy" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#e2a926"/><stop offset="1" stop-color="#7a4a08"/></linearGradient></defs>
  <path d="M14 12h36v6c0 11-6.8 19.4-15 21.4V46h7v4H22v-4h7v-6.6C20.8 37.4 14 29 14 18z" fill="url(#${id})" stroke="#2a1606" stroke-width="2"/>
  <path d="M14 16H6c0 7 3.4 11.6 10 12.4M50 16h8c0 7-3.4 11.6-10 12.4" fill="none" stroke="#e2a926" stroke-width="3"/>
  <rect x="18" y="50" width="28" height="7" rx="1.5" fill="#5a3412" stroke="#2a1606" stroke-width="2"/>
  <path d="M33 14l9-10h4" fill="none" stroke="#d8dde2" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M25 22c0-3 2-5 4-6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

export default class LogrosMenu {
  constructor(menus) {
    this.m = menus;
    this.tab = 'general';
    const title = menus.screens.title;
    this.card = document.createElement('button');
    this.card.className = 'mdu-lgcard';
    this.card.type = 'button';
    this.card.dataset.act = 'logros';
    this.card.title = 'Tus logros';
    title.appendChild(this.card);
    menus.screen(
      'logros',
      `<div class="mdu-lg">
         <header class="mdu-lg__top">
           <div class="mdu-lg__emb">${trophy(120)}</div>
           <div class="mdu-lg__who">
             <b>Logros</b>
             <span data-lgcount></span>
             <div class="mdu-lv__bar"><i data-lgbar></i></div>
           </div>
         </header>
         <div class="mdu-kit-tabs">
           <button class="mdu-kit-tab is-on" data-lgtab="general">Generales</button>
           <button class="mdu-kit-tab" data-lgtab="mapas">Mapas</button>
         </div>
         <section class="mdu-lg__pane" data-lgpane></section>
         <div class="mdu-kit-back"><button class="mdu-btn" data-act="back">Volver</button></div>
       </div>`,
    );
    this.el = menus.screens.logros;
    this.el.classList.add('mdu-menu--logros');
    menus.acts.logros = () => {
      menus.prev = menus.current;
      menus.show('logros');
    };
    menus.showHooks.push((name) => {
      if (name === 'title') this.syncCard();
      if (name === 'logros') this.open();
    });
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-lgtab]');
      if (t) this.setTab(t.dataset.lgtab);
    });
    window.addEventListener('keydown', (this.onKey = (e) => {
      if (e.code === 'Escape' && menus.current === 'logros') menus.act('back');
    }));
    window.addEventListener('resize', (this.onResize = () => this.place()));
    L.onChange(() => {
      if (menus.current === 'title') this.syncCard();
      if (menus.current === 'logros') this.render();
    });
    this.syncCard();
  }

  // Abajo de la tarjeta del nivel (o arriba, cuando esa va abajo: pantallas angostas).
  place() {
    const c = this.m.profile?.card;
    if (!c || !c.offsetParent) return;
    const below = getComputedStyle(c).top !== 'auto';
    const s = this.card.style;
    if (below) {
      s.top = `${c.offsetTop + c.offsetHeight + 10}px`;
      s.bottom = 'auto';
    } else {
      s.top = 'auto';
      s.bottom = `${c.offsetParent.clientHeight - c.offsetTop + 10}px`;
    }
  }

  syncCard() {
    const { got, total } = L.count();
    let seen = 0;
    try {
      seen = +localStorage.getItem(SEEN) || 0;
    } catch {
      /* sin almacenamiento */
    }
    const fresh = L.LOGROS.some((d) => L.when(d.id) > seen) || L.extras().some((x) => x.t > seen);
    this.card.innerHTML = `${trophy(34)}<span class="mdu-lgcard__txt"><b>Logros</b><small>${got} de ${total}</small><span class="mdu-card__bar"><i style="width:${((got / total) * 100).toFixed(1)}%"></i></span></span>${fresh ? '<em class="mdu-card__new">¡Nuevo!</em>' : ''}`;
    requestAnimationFrame(() => this.place());
  }

  open() {
    this.render();
    try {
      localStorage.setItem(SEEN, String(Date.now()));
    } catch {
      /* sin almacenamiento */
    }
  }

  setTab(t) {
    this.tab = t;
    this.render();
  }

  render() {
    const { got, total } = L.count();
    this.el.querySelector('[data-lgcount]').textContent = `${got} de ${total}`;
    this.el.querySelector('[data-lgbar]').style.width = `${((got / total) * 100).toFixed(1)}%`;
    for (const b of this.el.querySelectorAll('[data-lgtab]')) b.classList.toggle('is-on', b.dataset.lgtab === this.tab);
    const pane = this.el.querySelector('[data-lgpane]');
    if (this.tab === 'general') {
      pane.innerHTML = `<div class="mdu-lg__grid">${L.LOGROS.filter((d) => d.cat === 'general').map((d) => this.item(d)).join('')}</div>`;
    } else {
      const extras = L.extras();
      pane.innerHTML = `<div class="mdu-lg__maps">${L.MAPS.map((m) => {
        const list = L.LOGROS.filter((d) => d.cat === m.id);
        const ex = extras.filter((x) => x.map === m.id);
        const n = list.filter((d) => L.has(d.id)).length;
        return `<section class="mdu-lg__map"><h3>${esc(m.name)}<small>${n} de ${list.length}</small></h3><div class="mdu-lg__list">${list.map((d) => this.item(d, true)).join('')}${ex.map((x) => this.item({ name: x.title, desc: x.text, icon: 'star', tier: 'plata' }, true, x.t)).join('')}</div></section>`;
      }).join('')}</div>`;
    }
    pane.scrollTop = 0;
  }

  item(d, small = false, t = 0) {
    const when = t || (d.id ? L.when(d.id) : 0);
    const got = !!when;
    const hide = !got && d.secret;
    const pr = !got && d.stat ? L.progress(d) : null;
    const date = got ? new Date(when).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    // (en los mapas, un renglón: el nombre y lo que lleva; lo demás, al pasar el mouse)
    if (small) {
      return `<div class="mdu-lg__it is-small${got ? ' is-got' : ''}" title="${esc(hide ? 'Secreto' : `${d.desc}${got ? ` · ${date}` : ''}`)}">
      ${medal(d, got, 40)}
      <b class="mdu-lg__name">${esc(hide ? 'Secreto' : d.name)}</b>
      ${pr ? `<em class="mdu-lg__meta">${fmt(pr.cur)} / ${fmt(pr.goal)}</em>` : ''}
    </div>`;
    }
    return `<div class="mdu-lg__it${got ? ' is-got' : ''}${small ? ' is-small' : ''}" title="${esc(hide ? 'Secreto' : d.desc)}">
      ${medal(d, got, small ? 44 : 58)}
      <div class="mdu-lg__txt">
        <b>${esc(hide ? 'Secreto' : d.name)}</b>
        <small>${esc(hide ? '???' : d.desc)}</small>
        ${pr ? `<span class="mdu-lg__pr"><span class="mdu-card__bar"><i style="width:${((pr.cur / pr.goal) * 100).toFixed(1)}%"></i></span><em>${fmt(pr.cur)} / ${fmt(pr.goal)}</em></span>` : ''}
        ${got ? `<em class="mdu-lg__date">${date}</em>` : ''}
      </div>
    </div>`;
  }
}
