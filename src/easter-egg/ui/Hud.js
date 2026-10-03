import { PERKS } from '../config/perks';
import { perkIconURL } from './perkIcons';
import { ACT } from '../config/map';
import { keyLabel } from '../core/controls';
import { SHIELD_ICONS, SHIELD_CRACKS, PART_SHORT, partIcon, SOUL_ICON, CANDLE_ICON } from './hudIcons';

// HUD en DOM: ronda con palitos de tiza, puntos con "+10" volando, munición,
// perks, power-ups, mira, avisos, subtítulos, daño y el inventario del
// easter egg. Solo toca el DOM cuando algo cambia.

// Los avisos dicen "F": si el jugador cambió la tecla de usar, se muestra la suya.
const withKeys = (text) => {
  const use = keyLabel('use');
  if (typeof text !== 'string' || use === 'F') return text;
  return text.replace(/\[F\]/g, `[${use}]`).replace(/\bF(?= para)/g, use);
};

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const POWER_ICONS = {
  insta: { label: 'Muerte instantánea', glyph: '☠' },
  double: { label: 'Puntos dobles', glyph: 'x2' },
  firesale: { label: 'Liquidación', glyph: '$' },
  muerte: { label: 'Máquina de muerte', glyph: '✹' },
  admin: { label: 'Admin Mate', glyph: '⚜' },
  almas: { label: 'Farol de las Ánimas', glyph: '☼' },
  piedra: { label: 'Piedra de Molino', glyph: '◎' },
  dragon: { label: 'Mate Dragón', glyph: '♨' },
  facon: { label: 'Facón Relámpago', glyph: 'ϟ' },
  infinito: { label: 'Balas infinitas', glyph: '∞' },
  botas: { label: 'Botas de potro', glyph: '»' },
  clarin: { label: 'Toque de Clarín', glyph: '♫' },
};
// (uno que todavía no tiene ícono se ve igual, con una estrella)
const powerIcon = (k) => POWER_ICONS[k] || { label: k, glyph: '★' };

const INV = [
  ['calabaza', 'Calabaza', '◍'],
  ['bombilla', 'Bombilla', '⟋'],
  ['yerba', 'Yerba', '❦'],
  ['agua', 'Agua a punto', '♨'],
];

// Columnas de la tabla de puntos (Tab).
const BOARD_COLS = [
  ['points', 'Puntos'],
  ['kills', 'Bajas'],
  ['heads', 'Cabezas'],
  ['knife', 'Cuchillo'],
  ['downs', 'Caídas'],
  ['revives', 'Levantadas'],
  ['ping', 'Ping'],
];
// (en solitario no hay a quién levantar ni conexión que medir)
const SOLO_COLS = BOARD_COLS.filter(([k]) => k !== 'revives' && k !== 'ping');

// El ping en la tabla: el del anfitrión no se mide; verde, amarillo o rojo.
const pingCell = (v) => (v == null ? '<td class="mdu-scores__ping">—</td>' : `<td class="mdu-scores__ping ${v >= 200 ? 'is-bad' : v >= 100 ? 'is-meh' : 'is-ok'}">${v} ms</td>`);

const esc =(s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default class Hud {
  constructor(root) {
    this.root = el('div', 'mdu-hud', root);
    const r = this.root;
    // las animaciones a reiniciar en el cuadro que viene (pulse) y los puntos
    // que se juntan antes de salir (addPoints)
    this.pulses = new Map();
    this.pulseRaf = 0;
    this.runPulses = () => {
      this.pulseRaf = 0;
      for (const [e, c] of this.pulses) e.classList.add(c);
      this.pulses.clear();
    };
    this.ptsAcc = [0, 0];
    this.ptsT = 0;
    this.flushPoints = () => {
      this.ptsT = 0;
      const [pos, neg] = this.ptsAcc;
      this.ptsAcc[0] = this.ptsAcc[1] = 0;
      if (pos) this.popPoints(pos);
      if (neg) this.popPoints(neg);
      // (mientras sigan llegando, la ventana sigue abierta)
      if (pos || neg) this.ptsT = setTimeout(this.flushPoints, 120);
    };
    this.vignette = el('div', 'mdu-hurt', r);
    this.dirs = el('div', 'mdu-dirs', r);
    this.scope = el('div', 'mdu-scope', r, '<div class="mdu-scope__lens"></div>');
    this.cross = el('div', 'mdu-cross', r, '<i></i><i></i><i></i><i></i>');
    this.hit = el('div', 'mdu-hitmark', r, '<i></i><i></i><i></i><i></i>');
    this.splat = el('div', 'mdu-splat', r);
    this.toastBox = el('div', 'mdu-toast', r);
    this.ach = el('div', 'mdu-ach', r);
    this.inv = el('div', 'mdu-inv', r);
    // (justo después del inventario: se esconde mientras el inventario se asoma)
    this.tabHint = el('div', 'mdu-tabhint', r, '<kbd>Tab</kbd> piezas y objetos');
    this.peekT = new Map();
    this.subs = el('div', 'mdu-subs', r);
    this.lines = [];
    this.songTag = el('div', 'mdu-song', r, '♪ <b>M</b> silenciar la canción');
    this.loc = el('div', 'mdu-loc', r, '<b></b><span></span>');
    this.room = el('div', 'mdu-room', r);
    this.hint = el('div', 'mdu-hint', r);
    this.pups = el('div', 'mdu-pups', r);
    const bl = el('div', 'mdu-bl', r);
    this.shield = el('div', 'mdu-shield', bl);
    this.perks = el('div', 'mdu-perks', bl);
    this.parts = el('div', 'mdu-plan', r);
    this.craft = el('div', 'mdu-parts mdu-craft', r);
    this.team = el('div', 'mdu-team', r);
    this.round = el('div', 'mdu-round', bl);
    const br = el('div', 'mdu-br', r);
    this.popups = el('div', 'mdu-popups', br);
    this.points = el('div', 'mdu-points', br, '500');
    this.ammoBox = el('div', 'mdu-ammo', br);
    this.weaponName = el('div', 'mdu-wname', this.ammoBox);
    this.ammo = el('div', 'mdu-mag', this.ammoBox);
    this.nades = el('div', 'mdu-nades', this.ammoBox);
    this.down = el('div', 'mdu-down', r, '<span></span><b><i></i></b>');
    this.spec = el('div', 'mdu-spec', r);
    this.fps = el('div', 'mdu-fps', r);
    this.pickup = el('div', 'mdu-pickup', r);
    this.vida = el(
      'div',
      'mdu-vida',
      r,
      `<div class="mdu-vida__soul">${SOUL_ICON}</div><div class="mdu-vida__body"><header><span>Gaucho life</span><small class="mdu-vida__pct"></small></header><div class="mdu-vida__candles"></div><b class="mdu-vida__bar"><s></s></b><p class="mdu-vida__keys"></p></div>`,
    );
    this.board = el('div', 'mdu-scores', r);
    this.revives = el('div', 'mdu-revives', r);
    this.revMarks = new Map();
    this.cache = {};
    this.hitT = 0;
    this.subT = 0;
    this.toastT = 0;
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  show(on) {
    this.root.style.display = on ? '' : 'none';
  }

  // Una vez por mapa (cada uno tiene su cartel y su letra), en el menú del
  // título: el HUD a la vista unos cuadros,
  // casi transparente y con el cartel de las piezas abierto. La primera vez que
  // el navegador dibuja esos degradés y sombras difuminadas compila lo suyo en
  // su proceso de la placa (~50 ms) y el juego esperaba atrás: era el tirón al
  // terminar la entrada, cuando el cartel se asoma (2026-10-03). Tapado por la
  // pantalla de carga no sirve (lo tapado no se dibuja).
  // (globalThis.__mduNoHudWarm: como antes)
  prewarm() {
    const r = this.root;
    if (globalThis.__mduNoHudWarm === true || this.warmed === this.theme || r.style.display !== 'none') return Promise.resolve();
    this.warmed = this.theme;
    // (el cartel se ve solo asomado o con Tab; en el título está vacío: unas
    // piezas de muestra del mapa, una juntada)
    const plan = this.parts;
    const had = [...plan.classList];
    const html = plan.innerHTML;
    if (!html) {
      const defs = (ACT?.parts || []).slice(0, 4);
      plan.innerHTML = `<header><b>${esc(ACT?.shield?.name || 'Escudo')}</b><em>1/${defs.length || 4}</em></header><ol>${defs.map((d, i) => `<li class="${i ? '' : 'is-got'}">${partIcon(d.id)}<span>${esc(PART_SHORT[d.id] || d.name || '')}</span></li>`).join('')}</ol><small>Piezas del escudo</small>`;
    }
    plan.classList.add('is-on', 'is-peek');
    r.style.opacity = '0.01';
    r.style.display = '';
    return new Promise((res) => {
      let n = 0;
      const step = () => {
        if (++n < 6) return requestAnimationFrame(step);
        r.style.display = 'none';
        r.style.opacity = '';
        plan.className = had.join(' ');
        if (!html) plan.innerHTML = '';
        res();
      };
      requestAnimationFrame(step);
    });
  }

  reset() {
    this.cache = {};
    this.popups.innerHTML = '';
    this.setPerks([]);
    this.setShield(null);
    this.setParts(null);
    this.setCraft(null);
    this.setBossBar(null);
    this.setInventory({ calabaza: false, bombilla: false, yerba: false, agua: false }, true);
    this.setHint(null);
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    this.loc.classList.remove('is-on');
    this.hurt(0);
    this.setDowned(null);
    this.setSpectate(null);
    this.round.innerHTML = '';
    this.ach.classList.remove('is-on');
    this.setBoard(null);
    this.setRevives([]);
  }

  // Cada mapa tiene su HUD: colores, letras y adornos en ui/hudThemes.css.
  setTheme(id) {
    this.theme = id;
    this.root.dataset.map = id;
  }

  // Opción: tamaño de los subtítulos (1 = normal).
  setSubScale(k) {
    this.root.style.setProperty('--sub-scale', String(k || 1));
  }

  // En línea: aviso chico arriba si la conexión con el anfitrión anda mal (null = nada).
  setNet(text) {
    if (!this.net) this.net = el('div', 'mdu-netwarn', this.root);
    this.set('net', text, (t) => {
      this.net.textContent = t || '';
      this.net.classList.toggle('is-on', !!t);
    });
  }

  // ---------------- ronda ----------------
  setRound(n, animate) {
    // la torre cuenta las rondas en números romanos, como capítulos
    if (this.theme === 'torre') this.round.innerHTML = `<span class="mdu-round__num">${roman(n)}</span>`;
    else this.round.innerHTML = n <= 5 ? tally(n) : `<span class="mdu-round__num">${n}</span>`;
    if (animate) {
      this.round.classList.remove('is-changing');
      void this.round.offsetWidth;
      this.round.classList.add('is-changing');
    }
  }

  roundEnd() {
    this.round.classList.remove('is-changing');
    void this.round.offsetWidth;
    this.round.classList.add('is-ending');
    setTimeout(() => this.round.classList.remove('is-ending'), 4000);
  }

  // ---------------- puntos ----------------
  setPoints(v) {
    this.set('points', v, (x) => {
      this.points.textContent = x.toLocaleString('es-AR');
    });
  }

  // El primero sale enseguida; lo que llega en los 120 ms siguientes sale
  // sumado en un solo número (con la escopeta era un span y un timer por perdigón).
  addPoints(n) {
    if (this.ptsT) {
      this.ptsAcc[n < 0 ? 1 : 0] += n;
      return;
    }
    this.popPoints(n);
    this.ptsT = setTimeout(this.flushPoints, 120);
  }

  popPoints(n) {
    const p = el('span', n < 0 ? 'is-neg' : '', this.popups, `${n > 0 ? '+' : ''}${n}`);
    p.style.setProperty('--dx', `${-40 - Math.random() * 60}px`);
    p.style.setProperty('--dy', `${-10 - Math.random() * 40}px`);
    setTimeout(() => p.remove(), 900);
  }

  // Reinicia la animación CSS de `cls`: saca la clase ya y la vuelve a poner en
  // el cuadro que viene. Antes era sacar, `void offsetWidth` (un layout forzado
  // de toda la página) y poner: con la escopeta, uno por perdigón. Varios en el
  // mismo cuadro quedan en uno.
  pulse(e, cls = 'is-on') {
    e.classList.remove(cls);
    this.pulses.set(e, cls);
    if (!this.pulseRaf) this.pulseRaf = requestAnimationFrame(this.runPulses);
  }

  flashPoints() {
    this.pulse(this.points, 'is-deny');
  }

  // ---------------- armas ----------------
  setWeapon(w) {
    if (!w) {
      this.ammoBox.style.visibility = 'hidden';
      return;
    }
    this.ammoBox.style.visibility = '';
    this.set('wname', `${w.name}|${w.upgraded}`, () => {
      this.weaponName.textContent = w.name;
      this.weaponName.classList.toggle('is-pap', !!w.upgraded);
      this.pickup.innerHTML = `<b>${w.name}</b><span>${w.desc || ''}</span>`;
      this.pulse(this.pickup);
    });
    this.set('ammo', `${w.mag}|${w.reserve}`, () => {
      this.ammo.innerHTML = `<b class="${w.mag === 0 ? 'is-empty' : ''}">${w.mag}</b><span>/ ${w.reserve}</span>`;
    });
  }

  // knife: el cuchillo de Anacleto (penal): 1 el de carnicero, 2 el mejorado
  // (en negativo mientras vuela o se enfría)
  setGrenades(n, tac, knife = 0) {
    this.set('nades', `${n}|${tac}|${knife}`, () => {
      this.nades.innerHTML = `${'<i class="mdu-nade"></i>'.repeat(n)}${'<i class="mdu-pava"></i>'.repeat(tac)}${knife ? `<i class="mdu-cuchi${Math.abs(knife) > 1 ? ' is-up' : ''}${knife < 0 ? ' is-cd' : ''}"></i>` : ''}`;
    });
  }

  setCrosshair(spread, visible, scope) {
    const px = Math.round(6 + spread * 700);
    this.set('cross', `${px}|${visible}`, () => {
      this.cross.style.setProperty('--gap', `${px}px`);
      this.cross.style.opacity = visible ? '1' : '0';
    });
    this.set('scope', scope, (s) => this.scope.classList.toggle('is-on', s));
  }

  // Salpicón de sangre en la pantalla al acuchillar (side: -1 tajo, 1 revés, 0 puñalada).
  knifeSplat(side = 0) {
    const s = this.splat;
    s.style.setProperty('--flip', side > 0 ? -1 : 1);
    s.classList.toggle('is-stab', !side);
    this.pulse(s);
  }

  // (un perdigón a la cabeza en el cuadro la pinta de rojo)
  hitmarker(head) {
    if (!this.pulses.has(this.hit)) this.hit.classList.toggle('is-head', !!head);
    else if (head) this.hit.classList.add('is-head');
    this.pulse(this.hit);
  }

  // ---------------- perks y power-ups ----------------
  // Perks abajo a la izquierda, arriba de la ronda; el nuevo entra con un destello.
  setPerks(ids) {
    const prev = new Set((this.cache.perks || '').split(',').filter(Boolean));
    this.set('perks', ids.join(','), () => {
      this.perks.innerHTML = ids
        .map((id) => {
          const p = PERKS[id];
          // el medallón dibujado (ui/perkIcons), con el resplandor del color del perk
          return `<i class="mdu-perk ${prev.has(id) ? '' : 'is-new'}" data-perk="${id}" style="--c:${p.color}" title="${p.name}"><img src="${perkIconURL(id, 104)}" alt="${p.name}"></i>`;
        })
        .join('');
      this.layoutT = 0;
    });
  }

  // El aire abajo del agua (entities/swim.js): una barra de burbujas arriba de
  // la mira que se vacía; en rojo cuando falta poco. null: se esconde.
  setBreath(k) {
    if (!this.breath) {
      this.breath = el('div', null, this.root);
      this.breath.style.cssText = 'position:absolute;left:50%;top:58%;width:170px;height:7px;margin-left:-85px;border-radius:4px;background:rgba(10,30,40,.55);box-shadow:0 0 0 1px rgba(180,230,255,.35);opacity:0;transition:opacity .4s;pointer-events:none';
      this.breathFill = el('div', null, this.breath);
      this.breathFill.style.cssText = 'height:100%;border-radius:4px;background:linear-gradient(90deg,#9fe3ff,#e8fbff);transform-origin:left;transition:background .3s';
    }
    const v = k == null ? -1 : Math.round(k * 100);
    this.set('breath', v, () => {
      this.breath.style.opacity = v < 0 ? '0' : '1';
      if (v < 0) return;
      this.breathFill.style.transform = `scaleX(${v / 100})`;
      this.breathFill.style.background = v < 25 ? 'linear-gradient(90deg,#ff5a3a,#ffb08a)' : 'linear-gradient(90deg,#9fe3ff,#e8fbff)';
    });
  }

  // Un perk que se está enfriando (el Aliento Dragónico): el ícono apagado.
  perkCool(id, on) {
    this.perks.querySelector(`[data-perk="${id}"]`)?.classList.toggle('is-cool', on);
  }

  setPowerups(active) {
    const key = Object.entries(active)
      .map(([k, v]) => (v > 0 ? `${k}:${v < 5 ? Math.floor(v * 4) % 2 : 1}` : ''))
      .join('|');
    this.set('pups', key, () => {
      this.pups.innerHTML = Object.entries(active)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `<i class="mdu-pup ${v < 5 && Math.floor(v * 4) % 2 ? 'is-blink' : ''}" title="${powerIcon(k).label}">${powerIcon(k).glyph}</i>`)
        .join('');
    });
  }

  // ---------------- avisos ----------------
  setHint(text) {
    text = withKeys(text);
    this.set('hint', text, (t) => {
      this.hint.textContent = t || '';
      this.hint.classList.toggle('is-on', !!t);
      this.layoutT = 0;
    });
  }

  // Escudo a la espalda con su aguante (null = no tenés). El dibujo es el del
  // escudo del mapa (ui/hudIcons): se vacía de arriba hacia abajo, se raja a los
  // dos tercios y al tercio, y tiembla con cada golpe. La barra va en tramos de
  // 100 de aguante.
  // up: el mejorado (world/ShieldUpgrade): otro nombre, más tramos y su brillo.
  setShield(k, up = false) {
    this.set('shield', k == null ? null : Math.round(k * 50) + (up ? 1000 : 0), () => {
      const s = this.shield;
      const prev = this.shieldK;
      s.classList.toggle('is-on', k != null);
      if (k == null) {
        this.shieldK = null;
        s.classList.remove('is-hit', 'is-new');
        return;
      }
      if (s.dataset.theme !== this.shieldTheme() || s.dataset.up !== (up ? '1' : '')) this.buildShield(up);
      const kk = Math.max(0, Math.min(1, k));
      s.style.setProperty('--k', kk.toFixed(3));
      s.dataset.crack = kk < 0.34 ? '2' : kk < 0.67 ? '1' : '0';
      s.classList.toggle('is-low', kk < 0.25);
      s.querySelector('.mdu-shield__hp').textContent = `${Math.round(kk * 100)}%`;
      // (se reinicia la animación: golpe tras golpe tiembla de nuevo)
      const anim = prev == null ? 'is-new' : kk < prev - 1e-3 ? 'is-hit' : null;
      if (anim) {
        s.classList.remove('is-hit', 'is-new');
        this.pulse(s, anim);
      }
      this.shieldK = kk;
    });
  }

  shieldTheme() {
    return SHIELD_ICONS[this.theme] ? this.theme : 'molino';
  }

  buildShield(up = false) {
    const id = this.shieldTheme();
    const s = this.shield;
    const icon = SHIELD_ICONS[id];
    const box = 'viewBox="0 0 40 46" aria-hidden="true"';
    const U = up ? ACT?.shield?.up : null;
    s.dataset.theme = id;
    s.dataset.up = U ? '1' : '';
    s.classList.toggle('is-up', !!U);
    s.style.setProperty('--seg', String(Math.max(4, Math.round((U?.hp || ACT?.shield?.hp || 1000) / 100))));
    s.innerHTML = `<div class="mdu-shield__icon"><svg class="mdu-shield__base" ${box}>${icon}</svg><svg class="mdu-shield__full" ${box}>${icon}</svg><svg class="mdu-shield__cracks" ${box}>${SHIELD_CRACKS}</svg></div><div class="mdu-shield__info"><span class="mdu-shield__name">${esc(U?.name || ACT?.shield?.name || 'Escudo')}</span><b class="mdu-shield__bar"><s></s></b><small class="mdu-shield__hp"></small><em class="mdu-shield__tag"></em></div>`;
    this.shieldTagText = null;
  }

  // Un aviso chiquito debajo del escudo (el tiempo que le queda al rojo).
  setShieldTag(text) {
    if (text === this.shieldTagText) return;
    this.shieldTagText = text;
    const t = this.shield.querySelector('.mdu-shield__tag');
    if (t) t.textContent = text || '';
    this.shield.classList.toggle('is-hot', !!text);
  }

  // Piezas del escudo juntadas (arriba a la derecha, debajo del inventario).
  // Piezas del Mate de la Luz Mala (hasta que alguien lo arma).
  setCraft(list) {
    this.set('craft', list ? list.map((x) => (x ? 1 : 0)).join('') : null, () => {
      this.craft.innerHTML = list ? `<span>Luz Mala</span>${list.map((got) => `<i class="${got ? 'is-got' : ''}">◈</i>`).join('')}` : '';
      this.craft.classList.toggle('is-list', !!list);
      if (list) this.peek(this.craft);
      this.syncTabHint();
    });
  }

  // Contador libre en el mismo lugar (el ritual de la granja). Si es una fila
  // de piezas (íconos, como las del Mate de la Luz Mala) va con Tab; si es
  // un contador de un paso (almas, segundos, metros), siempre a la vista.
  setCraftText(html) {
    this.set('craftText', html, () => {
      const list = !!html && /<i[\s>]/.test(html) && !/<b[\s>]/.test(html);
      this.craft.innerHTML = html || '';
      this.craft.classList.toggle('is-list', list);
      if (list) this.peek(this.craft);
      this.syncTabHint();
    });
  }

  // Las piezas del escudo del mapa (arriba a la derecha, debajo del
  // inventario): una tarjeta con el nombre del escudo, las tres piezas con su
  // dibujo y, cuando están todas, dónde se arma. Cada mapa la viste a su manera
  // (ui/hudThemes.css); la pieza recién juntada se enciende.
  setParts(list) {
    this.set('parts', list ? list.map((x) => (x ? 1 : 0)).join('') : null, () => {
      const p = this.parts;
      const prev = this.partsGot;
      this.partsGot = list ? [...list] : null;
      p.classList.toggle('is-on', !!list);
      if (!list) {
        p.innerHTML = '';
        this.syncTabHint();
        return;
      }
      const defs = ACT?.parts || [];
      const got = list.filter(Boolean).length;
      const done = got === list.length;
      // (el penal numera como un legajo; la torre, en romanos)
      const num = (i) => (this.theme === 'torre' ? roman(i + 1) : this.theme === 'penal' ? String(i + 1).padStart(2, '0') : '');
      const items = list.map((ok, i) => {
        const d = defs[i] || {};
        const fresh = ok && prev && !prev[i];
        const n = num(i);
        return `<li class="${ok ? 'is-got' : ''}${fresh ? ' is-new' : ''}" title="${esc(d.name || '')}">${n ? `<i>${n}</i>` : ''}${partIcon(d.id)}<span>${esc(PART_SHORT[d.id] || d.name || '')}</span></li>`;
      });
      p.classList.toggle('is-done', done);
      this.peek(p);
      p.innerHTML = `<header><b>${esc(ACT?.shield?.name || 'Escudo')}</b><em>${got}/${list.length}</em></header><ol>${items.join('')}</ol><small>${done ? `Armalo en ${esc(ACT?.shield?.where || 'la mesa de trabajo')}` : 'Piezas del escudo'}</small>`;
      this.syncTabHint();
    });
  }

  // Lo que solo se ve con Tab (las piezas del escudo, las de un arma especial y
  // los objetos juntados) se asoma unos segundos cada vez que cambia. Los pasos
  // del easter egg (el cartel del objetivo, los contadores) no pasan por acá:
  // siempre a la vista.
  peek(e, secs = 4) {
    clearTimeout(this.peekT.get(e));
    e.classList.add('is-peek');
    this.peekT.set(
      e,
      setTimeout(() => e.classList.remove('is-peek'), secs * 1000),
    );
  }

  // El aviso chico de "Tab" arriba a la derecha, si hay algo escondido.
  syncTabHint() {
    const any = this.parts.classList.contains('is-on') || !!this.inv.firstChild || (this.craft.classList.contains('is-list') && !!this.craft.firstChild);
    this.tabHint.classList.toggle('is-on', any);
  }

  // Compañeros de sala: nombre, vida y si están caídos.
  setTeam(list) {
    const key = (list || []).map((p) => `${p.name}${Math.round(p.health / 10)}${p.downed ? 'd' : ''}${p.dead ? 'x' : ''}`).join('|');
    this.set('team', key, () => {
      this.team.innerHTML = (list || [])
        .map((p) => `<div class="mdu-team__p ${p.downed ? 'is-down' : ''} ${p.dead ? 'is-dead' : ''}"><span>${p.name}</span><b><s style="width:${Math.max(0, p.health)}%"></s></b></div>`)
        .join('');
    });
  }

  // Compañeros caídos: el ícono de reanimar arriba de cada uno, visible a
  // través de las paredes (en el borde si quedan fuera de vista). Se llama
  // cada cuadro. list: [{ id, name, x, y, edge, ang, dist, k }], con x/y en
  // píxeles y k = cuánto se desangró (0 recién caído, 1 se muere).
  setRevives(list) {
    if (!list.length && !this.revMarks.size) return;
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id);
      let e = this.revMarks.get(m.id);
      if (!e) {
        e = el('div', 'mdu-revive', this.revives, '<div class="mdu-revive__in"><i class="mdu-revive__arrow"></i><i class="mdu-revive__ring"></i><svg class="mdu-revive__icon" viewBox="0 0 32 32"><path d="M12.5 5h7v7.5H27v7h-7.5V27h-7v-7.5H5v-7h7.5z"/></svg><b></b><small></small></div>');
        e.nameEl = e.querySelector('b');
        e.distEl = e.querySelector('small');
        this.revMarks.set(m.id, e);
      }
      e.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      e.style.setProperty('--k', m.k.toFixed(3));
      e.style.setProperty('--ang', `${m.ang.toFixed(3)}rad`);
      e.classList.toggle('is-edge', m.edge);
      e.classList.toggle('is-late', m.k > 0.66);
      if (e.nameText !== m.name) {
        e.nameText = m.name;
        e.nameEl.textContent = m.name;
      }
      const d = `${Math.round(m.dist)} m`;
      if (e.distText !== d) {
        e.distText = d;
        e.distEl.textContent = d;
      }
    }
    for (const [id, e] of this.revMarks) {
      if (seen.has(id)) continue;
      e.remove();
      this.revMarks.delete(id);
    }
  }

  // Tabla de puntos, mientras mantenés Tab (los datos los arma ui/Scoreboard.js;
  // null la esconde).
  setBoard(info) {
    this.set('board', info ? JSON.stringify(info) : null, () => {
      this.board.classList.toggle('is-on', !!info);
      // con Tab también se ven las piezas y los objetos (ver peek)
      this.root.classList.toggle('is-tab', !!info);
      if (!info) return;
      const n = (v) => (v | 0).toLocaleString('es-AR');
      const round = !info.round ? '–' : this.theme === 'torre' ? roman(info.round) : info.round;
      const cols = info.solo ? SOLO_COLS : BOARD_COLS;
      const rows = info.rows.map((p, i) => {
        const st = p.dead ? 'is-dead' : p.down ? 'is-down' : '';
        const tag = p.dead ? '<em>muerto</em>' : p.down ? '<em>caído</em>' : '';
        return `<tr class="${p.me ? 'is-me' : ''} ${st}"><td class="mdu-scores__pos">${i + 1}</td><td class="mdu-scores__name"><span>${esc(p.name)}</span>${tag}</td>${cols.map(([k]) => (k === 'ping' ? pingCell(p.ping) : `<td>${n(p[k])}</td>`)).join('')}</tr>`;
      });
      this.board.innerHTML = `<header><b>${esc(info.map)}</b><span>Ronda ${round} · ${info.time}</span></header><table><thead><tr><th></th><th>Jugador</th>${cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    });
  }

  // Gaucho life (el penal): cada carga es una vela de ánimas (prendida o
  // apagada); adentro, el alma se va apagando con la energía y quedan a la vista
  // las teclas.
  setVida(v) {
    const key = v ? `${v.charges}/${v.max}|${v.energy == null ? '-' : Math.round(v.energy * 100)}` : null;
    this.set('vida', key, () => {
      const e = this.vida;
      e.classList.toggle('is-on', !!v);
      if (!v) {
        this.vidaC = null;
        return;
      }
      const active = v.energy != null;
      e.classList.toggle('is-active', active);
      e.classList.toggle('is-low', active && v.energy < 0.25);
      e.classList.toggle('is-empty', !active && v.charges <= 0);
      e.style.setProperty('--e', (active ? v.energy : 1).toFixed(3));
      e.querySelector('.mdu-vida__pct').textContent = active ? `${Math.round(v.energy * 100)}%` : `${v.charges}/${v.max}`;
      // (las velas solo se rearman si cambian: si no, la llama vuelve a arrancar)
      const ck = `${v.charges}/${v.max}`;
      if (this.vidaC !== ck) {
        const had = this.vidaC ? +this.vidaC.split('/')[0] : null;
        this.vidaC = ck;
        e.querySelector('.mdu-vida__candles').innerHTML = Array.from({ length: v.max }, (_, i) => `<i class="${i < v.charges ? 'is-lit' : ''}${had != null && i >= v.charges && i < had ? ' is-out' : ''}">${CANDLE_ICON}</i>`).join('');
      }
      const keys = active
        ? '<kbd>Clic</kbd> rayo · <kbd>F</kbd> mantenida: volver al cuerpo'
        : v.charges > 0
          ? `<kbd>${esc(keyLabel('vida'))}</kbd> salir del cuerpo`
          : 'Sin velas: vuelve una cada 5 rondas';
      const k = e.querySelector('.mdu-vida__keys');
      if (k.innerHTML !== keys) k.innerHTML = keys;
    });
  }

  // Barra de vida del jefe final.
  setBossBar(name, k = 1) {
    if (!this.bossBar) this.bossBar = el('div', 'mdu-bossbar', this.root, '<span></span><b><s></s></b>');
    this.set('bossbar', name == null ? null : `${name}|${Math.round(k * 200)}`, () => {
      if (this.bossBar.classList.contains('is-on') !== (name != null)) this.layoutT = 0;
      this.bossBar.classList.toggle('is-on', name != null);
      if (name != null) {
        this.bossBar.querySelector('span').textContent = name;
        this.bossBar.querySelector('s').style.width = `${Math.max(0, k) * 100}%`;
      }
    });
  }

  // Barrita debajo del aviso mientras se mantiene F.
  setHold(k) {
    this.set('hold', k == null ? null : Math.round(k * 40), () => {
      this.hint.classList.toggle('is-holding', k != null);
      if (k != null) this.hint.style.setProperty('--k', k.toFixed(3));
    });
  }

  // Subtítulos apilados (hasta 3). Los avisos van en cursiva; los diálogos
  // llevan el nombre de quien habla y el texto aparece al ritmo de la voz.
  subtitle(text, secs = 3, kind = '') {
    this.addLine({ text: withKeys(text), secs, kind, speaker: null });
  }

  speak(speaker, text, secs, kind = '') {
    this.addLine({ text, secs, kind, speaker, reveal: Math.min(secs * 0.85, text.length * 0.045) });
  }

  addLine({ text, secs, kind, speaker, reveal = 0 }) {
    const same = this.lines.find((l) => l.text === text && !l.out);
    if (same) {
      same.t = Math.max(same.t, secs);
      return;
    }
    const p = el('p', `mdu-line ${speaker ? 'is-talk' : 'is-info'} ${kind ? `is-${kind}` : ''}`, this.subs);
    if (speaker) el('b', '', p, speaker);
    const span = el('span', '', p);
    span.textContent = reveal > 0 ? '' : text;
    const line = { el: p, span, text, t: secs, reveal, shown: reveal > 0 ? 0 : text.length, age: 0, out: false };
    this.lines.push(line);
    this.layoutT = 0;
    while (this.lines.filter((l) => !l.out).length > 3) this.dropLine(this.lines.find((l) => !l.out));
    requestAnimationFrame(() => p.classList.add('is-on'));
  }

  dropLine(l) {
    if (!l || l.out) return;
    l.out = true;
    this.layoutT = 0;
    l.el.classList.remove('is-on');
    setTimeout(() => {
      l.el.remove();
      this.lines = this.lines.filter((x) => x !== l);
    }, 450);
  }

  // Habitación donde estás (siempre arriba a la izquierda).
  setRoom(name) {
    this.set('room', name, (n) => {
      this.room.textContent = n || '';
      this.room.classList.toggle('is-on', !!n);
      this.pulse(this.room, 'is-change');
    });
  }

  // Mientras suena la canción de un easter egg musical: con la M se silencia.
  setSong(on) {
    this.set('song', on, (v) => this.songTag.classList.toggle('is-on', v));
  }

  // Cartel del lugar al entrar a una zona nueva.
  location(name, sub = '') {
    this.loc.querySelector('b').textContent = name;
    this.loc.querySelector('span').textContent = sub;
    this.pulse(this.loc);
  }

  toast(text) {
    this.toastBox.textContent = text;
    this.toastBox.classList.remove('is-on');
    void this.toastBox.offsetWidth;
    this.toastBox.classList.add('is-on');
    this.toastUntil = performance.now() + 2600;
    this.layout();
  }

  achievement(title, text) {
    this.ach.innerHTML = `<small>Logro desbloqueado</small><b>${title}</b><span>${text}</span>`;
    this.ach.classList.remove('is-on');
    void this.ach.offsetWidth;
    this.ach.classList.add('is-on');
    this.achUntil = performance.now() + 7000;
    this.layout();
  }

  // list: qué íconos mostrar (el easter egg de cada mapa trae los suyos).
  // Los objetos del easter egg juntados (con Tab; se asoman al cambiar).
  setInventory(items, hide, list = INV) {
    const any = !!items && Object.values(items).some(Boolean);
    const html = !items || hide || !any ? '' : list.map(([k, label, g]) => `<i class="${items[k] ? 'is-got' : ''}" title="${label}">${g}</i>`).join('');
    if (html === this.invHtml) return;
    this.invHtml = html;
    this.inv.innerHTML = html;
    if (html) this.peek(this.inv);
    this.syncTabHint();
  }

  // ---------------- daño ----------------
  hurt(level) {
    this.set('hurt', Math.round(level * 20), () => {
      this.vignette.style.opacity = String(Math.min(1, level * 1.1));
    });
  }

  // k: cuánto pegó (0,45 a 1,15): el arco más grande y más fuerte
  damageFrom(angle, k = 0.7) {
    const d = el('i', 'mdu-dir', this.dirs);
    d.style.transform = `rotate(${-angle + Math.PI}rad)`;
    d.style.setProperty('--k', k.toFixed(2));
    // (no más de cuatro a la vez)
    while (this.dirs.children.length > 4) this.dirs.firstChild.remove();
    setTimeout(() => d.remove(), 1300);
  }

  // Salpicón de sangre en el borde del lado de donde vino el golpe (sx:
  // derecha, sy: adelante, de -1 a 1; sin lado, abajo al costado). Formas
  // armadas una vez (SVG): gotas alrededor de una mancha y unos chorros.
  hitSplat(sx, sy, k) {
    if (!this.splatSvgs) {
      this.splatSvgs = [];
      for (let v = 0; v < 6; v++) {
        let s = '';
        const R = () => Math.random();
        s += `<circle cx="50" cy="50" r="${11 + R() * 5}"/>`;
        for (let i = 0; i < 5; i++) s += `<circle cx="${50 + (R() - 0.5) * 18}" cy="${50 + (R() - 0.5) * 18}" r="${5 + R() * 6}"/>`;
        for (let i = 0; i < 16; i++) {
          const a = R() * Math.PI * 2;
          const d = 16 + R() * 30;
          const r = Math.max(0.8, 4.2 - d * 0.075 + R() * 1.2);
          s += `<circle cx="${(50 + Math.cos(a) * d).toFixed(1)}" cy="${(50 + Math.sin(a) * d).toFixed(1)}" r="${r.toFixed(1)}"/>`;
        }
        for (let i = 0; i < 4; i++) {
          const a = R() * Math.PI * 2;
          const d = 10 + R() * 14;
          s += `<ellipse cx="${(50 + Math.cos(a) * d).toFixed(1)}" cy="${(50 + Math.sin(a) * d).toFixed(1)}" rx="${(7 + R() * 9).toFixed(1)}" ry="${(1.4 + R() * 1.2).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${(50 + Math.cos(a) * d).toFixed(1)} ${(50 + Math.sin(a) * d).toFixed(1)})"/>`;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#6e0303" fill-opacity="0.9">${s}</g><g fill="#a00a06" fill-opacity="0.55" transform="translate(-2 -2)">${s}</g></svg>`;
        this.splatSvgs.push(`url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
      }
      this.splats = el('div', 'mdu-hitsplats', this.root);
      // (debajo de los indicadores y del resto del HUD)
      this.root.insertBefore(this.splats, this.dirs);
    }
    // sin lado conocido: abajo, a un costado
    let x = sx;
    let y = sy;
    if (!x && !y) {
      x = Math.random() < 0.5 ? -0.7 : 0.7;
      y = -0.5;
    }
    const n = Math.hypot(x, y) || 1;
    const d = el('i', 'mdu-hitsplat', this.splats);
    // (en el borde: adelante es arriba)
    d.style.left = `${50 + (x / n) * 40 + (Math.random() - 0.5) * 10}%`;
    d.style.top = `${50 - (y / n) * 38 + (Math.random() - 0.5) * 10}%`;
    d.style.backgroundImage = this.splatSvgs[(Math.random() * this.splatSvgs.length) | 0];
    d.style.setProperty('--s', (0.75 + k * 0.5).toFixed(2));
    d.style.setProperty('--r', `${(Math.random() * 360) | 0}deg`);
    while (this.splats.children.length > 4) this.splats.firstChild.remove();
    setTimeout(() => d.remove(), 1600);
  }

  // Barra de caído: en solitario se llena mientras Rosamorte te levanta; en
  // línea (`bleed`) se vacía mientras te desangrás esperando a un compañero.
  setDowned(progress, text = 'Rosamorte te está levantando...', bleed = false) {
    this.set('down', progress == null ? null : `${Math.round(progress * 50)}${text}`, () => {
      this.down.classList.toggle('is-on', progress != null);
      this.down.classList.toggle('is-bleed', bleed);
      if (progress == null) return;
      this.down.querySelector('span').textContent = text;
      this.down.querySelector('i').style.width = `${progress * 100}%`;
    });
  }

  // Muerto en línea: a quién estás mirando.
  setSpectate(name) {
    this.set('spec', name, () => {
      this.spec.classList.toggle('is-on', name != null);
      this.spec.innerHTML = name == null ? '' : `Mirando a <b></b><small>Volvés en la próxima ronda</small>`;
      if (name != null) this.spec.querySelector('b').textContent = name;
    });
  }

  setFps(v) {
    this.set('fps', v, (x) => {
      this.fps.textContent = x == null ? '' : `${x} fps`;
    });
  }

  update(dt) {
    for (const l of this.lines) {
      if (l.out) continue;
      l.age += dt;
      if (l.reveal > 0 && l.shown < l.text.length) {
        const n = Math.min(l.text.length, Math.ceil((l.age / l.reveal) * l.text.length));
        if (n !== l.shown) {
          l.shown = n;
          l.span.textContent = l.text.slice(0, n);
        }
      }
      l.t -= dt;
      if (l.t <= 0) this.dropLine(l);
    }
    // (cada medio segundo: lee posiciones de la página y fuerza un layout; lo
    // que cambia el acomodo al toque — renglones, el aviso, los perks, la barra
    // del jefe — lo adelanta con layoutT = 0)
    this.layoutT = (this.layoutT || 0) - dt;
    if (this.layoutT <= 0) {
      this.layoutT = 0.5;
      this.layout();
    }
  }

  // Lo que se pisaba: la lista de compañeros va debajo de lo que se vea en la
  // columna de la derecha (la tarjeta del escudo, las piezas, el cartel del
  // objetivo), y el "Mantené [F]..." sube cuando los subtítulos llegan hasta él.
  layout() {
    // la fila de perks se parte en filas de cuatro cuando, entera, llegaría
    // hasta los subtítulos (seis o más a 1280/1366 de ancho: los últimos
    // medallones tapaban el arranque de los renglones). Se decide con la
    // cuenta y el ancho, no con que haya un renglón a la vista: así no salta
    // cada vez que alguien habla.
    const pk0 = this.perks.children;
    let wrap = false;
    if (pk0.length > 4) {
      const a = pk0[0].getBoundingClientRect();
      const step = pk0[1].getBoundingClientRect().left - a.left;
      wrap = a.left + (pk0.length - 1) * step + a.width + 8 > this.subs.getBoundingClientRect().left;
    }
    if (wrap !== !!this.perkWrap) {
      this.perkWrap = wrap;
      this.root.classList.toggle('is-perkwrap', wrap);
    }
    if (this.team.firstChild) {
      let top = 156;
      for (const e of this.root.querySelectorAll('.mdu-plan, .mdu-craft, .mdu-obj')) {
        if (e.offsetParent && e.offsetHeight) top = Math.max(top, e.offsetTop + e.offsetHeight + 12);
      }
      const v = `${top}px`;
      if (this.team.style.top !== v) this.team.style.top = v;
    }
    let bottom = '';
    if (this.hint.classList.contains('is-on') && this.subs.offsetHeight) {
      const h = this.root.clientHeight;
      const need = h - this.subs.offsetTop + 16;
      if (need > h * 0.3) bottom = `${Math.round(need)}px`;
    }
    if (this.hint.style.bottom !== bottom) this.hint.style.bottom = bottom;
    // la tarjeta del arma, siempre arriba de los puntos (a 720 de alto se pisaban)
    const br = this.points.parentElement;
    const pk = `${Math.max(170, Math.round(this.root.clientHeight - br.offsetTop - this.points.offsetTop + 10))}px`;
    if (this.pickup.style.bottom !== pk) this.pickup.style.bottom = pk;
    // el cartel del lugar va debajo de la vida del gaucho (penal) si no entra
    // arriba (con la barra del jefe baja y, angostado, ocupa dos renglones)
    let vd = '';
    if (this.vida.classList.contains('is-on') && this.vida.offsetHeight) {
      const was = this.loc.style.top;
      this.loc.style.top = '';
      if (this.loc.offsetTop + this.loc.offsetHeight > this.vida.offsetTop - 6) vd = `${this.vida.offsetTop + this.vida.offsetHeight + 10}px`;
      this.loc.style.top = was;
    }
    if (this.loc.style.top !== vd) this.loc.style.top = vd;
    // arriba al medio, uno debajo del otro: la barra del jefe, el logro y el aviso
    const now = performance.now();
    const bb = this.bossBar?.classList.contains('is-on') ? this.bossBar : null;
    let y = bb ? bb.offsetTop + bb.offsetHeight + 12 : 0;
    // el cartelón de un evento del Challenge (centrado en su top) también ocupa
    // arriba al medio: lo demás va debajo y el cartel grande del lugar no sale
    const rb = this.root.querySelector('.mdu-reto-banner.is-on');
    const bannerOn = !!rb && +getComputedStyle(rb).opacity > 0.05;
    if (bannerOn) y = Math.max(y, rb.offsetTop + rb.offsetHeight / 2 + 12);
    this.root.classList.toggle('is-banner', bannerOn);
    const achOn = now < (this.achUntil || 0);
    // (con el logro arriba al medio, el cartel del lugar se angosta)
    this.root.classList.toggle('is-ach', achOn);
    const at = achOn && y ? `${y}px` : '';
    if (this.ach.style.top !== at) this.ach.style.top = at;
    if (achOn) y = this.ach.offsetTop + this.ach.offsetHeight + 12;
    const tt = y > this.root.clientHeight * 0.16 && now < (this.toastUntil || 0) ? `${y}px` : '';
    if (this.toastBox.style.top !== tt) this.toastBox.style.top = tt;
  }
}

// La ronda en números romanos (la torre).
function roman(n) {
  let s = '';
  for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (n >= v) {
      s += r;
      n -= v;
    }
  }
  return s;
}

// Un palito de tiza: la curva de (x0, y0) a (x1, y1) con el control en (cx,
// cy), en tramitos corridos al azar de costado (el borde áspero de la tiza).
// Antes ese borde lo hacía un filtro de SVG (feTurbulence + feDisplacementMap)
// y cada cambio de ronda trababa ~60 ms: el navegador lo redibuja en su proceso
// de la placa, y el juego esperaba atrás (2026-10-03).
function chalkPath(x0, y0, cx, cy, x1, y1) {
  const N = 16;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const l = Math.hypot(dx, dy) || 1;
    const k = (Math.random() - 0.5) * 2.2;
    const x = a * x0 + b * cx + c * x1 - (dy / l) * k;
    const y = a * y0 + b * cy + c * y1 + (dx / l) * k;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `<path d="${d}" />`;
}

// Palitos de tiza roja para las rondas 1 a 5, como en el original.
function tally(n) {
  const strokes = [];
  for (let i = 0; i < Math.min(n, 4); i++) {
    const x = 14 + i * 20;
    const j = () => (Math.random() - 0.5) * 4;
    strokes.push(chalkPath(x + j(), 8 + j(), x + 3 + j(), 45, x + j(), 84 + j()));
  }
  if (n >= 5) strokes.push(chalkPath(2, 70, 45, 45, 92, 20));
  return `<svg class="mdu-tally" viewBox="0 0 96 92" aria-label="Ronda ${n}">${strokes.join('')}</svg>`;
}
