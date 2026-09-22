import { PERKS } from '../config/perks';

// HUD en DOM: ronda con palitos de tiza, puntos con "+10" volando, munición,
// perks, power-ups, mira, avisos, subtítulos, daño y el inventario del
// easter egg. Solo toca el DOM cuando algo cambia.

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
};

const INV = [
  ['calabaza', 'Calabaza', '◍'],
  ['bombilla', 'Bombilla', '⟋'],
  ['yerba', 'Yerba', '❦'],
  ['agua', 'Agua a punto', '♨'],
];

export default class Hud {
  constructor(root) {
    this.root = el('div', 'mdu-hud', root);
    const r = this.root;
    this.vignette = el('div', 'mdu-hurt', r);
    this.dirs = el('div', 'mdu-dirs', r);
    this.scope = el('div', 'mdu-scope', r, '<div class="mdu-scope__lens"></div>');
    this.cross = el('div', 'mdu-cross', r, '<i></i><i></i><i></i><i></i>');
    this.hit = el('div', 'mdu-hitmark', r, '<i></i><i></i><i></i><i></i>');
    this.toastBox = el('div', 'mdu-toast', r);
    this.ach = el('div', 'mdu-ach', r);
    this.inv = el('div', 'mdu-inv', r);
    this.subs = el('div', 'mdu-subs', r);
    this.lines = [];
    this.loc = el('div', 'mdu-loc', r, '<b></b><span></span>');
    this.room = el('div', 'mdu-room', r);
    this.hint = el('div', 'mdu-hint', r);
    this.pups = el('div', 'mdu-pups', r);
    const bl = el('div', 'mdu-bl', r);
    this.shield = el('div', 'mdu-shield', bl, '<i>⛨</i><b><s></s></b>');
    this.perks = el('div', 'mdu-perks', bl);
    this.parts = el('div', 'mdu-parts', r);
    this.team = el('div', 'mdu-team', r);
    this.round = el('div', 'mdu-round', bl);
    const br = el('div', 'mdu-br', r);
    this.popups = el('div', 'mdu-popups', br);
    this.points = el('div', 'mdu-points', br, '500');
    this.ammoBox = el('div', 'mdu-ammo', br);
    this.weaponName = el('div', 'mdu-wname', this.ammoBox);
    this.ammo = el('div', 'mdu-mag', this.ammoBox);
    this.nades = el('div', 'mdu-nades', this.ammoBox);
    this.down = el('div', 'mdu-down', r, '<span>Rosamorte te está levantando...</span><b><i></i></b>');
    this.fps = el('div', 'mdu-fps', r);
    this.pickup = el('div', 'mdu-pickup', r);
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

  reset() {
    this.cache = {};
    this.popups.innerHTML = '';
    this.setPerks([]);
    this.setShield(null);
    this.setParts(null);
    this.setBossBar(null);
    this.setInventory({ calabaza: false, bombilla: false, yerba: false, agua: false }, true);
    this.setHint(null);
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    this.loc.classList.remove('is-on');
    this.hurt(0);
    this.setDowned(null);
    this.round.innerHTML = '';
    this.ach.classList.remove('is-on');
  }

  // ---------------- ronda ----------------
  setRound(n, animate) {
    this.round.innerHTML = n <= 5 ? tally(n) : `<span class="mdu-round__num">${n}</span>`;
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

  addPoints(n) {
    const p = el('span', n < 0 ? 'is-neg' : '', this.popups, `${n > 0 ? '+' : ''}${n}`);
    p.style.setProperty('--dx', `${-40 - Math.random() * 60}px`);
    p.style.setProperty('--dy', `${-10 - Math.random() * 40}px`);
    setTimeout(() => p.remove(), 900);
  }

  flashPoints() {
    this.points.classList.remove('is-deny');
    void this.points.offsetWidth;
    this.points.classList.add('is-deny');
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
      this.pickup.classList.remove('is-on');
      void this.pickup.offsetWidth;
      this.pickup.classList.add('is-on');
    });
    this.set('ammo', `${w.mag}|${w.reserve}`, () => {
      this.ammo.innerHTML = `<b class="${w.mag === 0 ? 'is-empty' : ''}">${w.mag}</b><span>/ ${w.reserve}</span>`;
    });
  }

  setGrenades(n, tac) {
    this.set('nades', `${n}|${tac}`, () => {
      this.nades.innerHTML = `${'<i class="mdu-nade"></i>'.repeat(n)}${'<i class="mdu-pava"></i>'.repeat(tac)}`;
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

  hitmarker(head) {
    this.hit.classList.toggle('is-head', head);
    this.hit.classList.remove('is-on');
    void this.hit.offsetWidth;
    this.hit.classList.add('is-on');
  }

  // ---------------- perks y power-ups ----------------
  // Perks abajo a la izquierda, arriba de la ronda; el nuevo entra con un destello.
  setPerks(ids) {
    const prev = new Set((this.cache.perks || '').split(',').filter(Boolean));
    this.set('perks', ids.join(','), () => {
      this.perks.innerHTML = ids
        .map((id) => {
          const p = PERKS[id];
          return `<i class="mdu-perk ${prev.has(id) ? '' : 'is-new'}" style="--c:${p.label.bg};--t:${p.label.text}" title="${p.name}">${p.glyph}</i>`;
        })
        .join('');
    });
  }

  setPowerups(active) {
    const key = Object.entries(active)
      .map(([k, v]) => (v > 0 ? `${k}:${v < 5 ? Math.floor(v * 4) % 2 : 1}` : ''))
      .join('|');
    this.set('pups', key, () => {
      this.pups.innerHTML = Object.entries(active)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `<i class="mdu-pup ${v < 5 && Math.floor(v * 4) % 2 ? 'is-blink' : ''}" title="${POWER_ICONS[k].label}">${POWER_ICONS[k].glyph}</i>`)
        .join('');
    });
  }

  // ---------------- avisos ----------------
  setHint(text) {
    this.set('hint', text, (t) => {
      this.hint.textContent = t || '';
      this.hint.classList.toggle('is-on', !!t);
    });
  }

  // Escudo a la espalda con su aguante (null = no tenés).
  setShield(k) {
    this.set('shield', k == null ? null : Math.round(k * 50), () => {
      this.shield.classList.toggle('is-on', k != null);
      if (k != null) this.shield.querySelector('s').style.width = `${k * 100}%`;
    });
  }

  // Piezas del escudo juntadas (arriba a la derecha, debajo del inventario).
  setParts(list) {
    this.parts.innerHTML = list ? list.map((got) => `<i class="${got ? 'is-got' : ''}">⛨</i>`).join('') : '';
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

  // Barra de vida del jefe final.
  setBossBar(name, k = 1) {
    if (!this.bossBar) this.bossBar = el('div', 'mdu-bossbar', this.root, '<span></span><b><s></s></b>');
    this.set('bossbar', name == null ? null : `${name}|${Math.round(k * 200)}`, () => {
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
    this.addLine({ text, secs, kind, speaker: null });
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
    while (this.lines.filter((l) => !l.out).length > 3) this.dropLine(this.lines.find((l) => !l.out));
    requestAnimationFrame(() => p.classList.add('is-on'));
  }

  dropLine(l) {
    if (!l || l.out) return;
    l.out = true;
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
      this.room.classList.remove('is-change');
      void this.room.offsetWidth;
      this.room.classList.add('is-change');
    });
  }

  // Cartel del lugar al entrar a una zona nueva.
  location(name, sub = '') {
    this.loc.querySelector('b').textContent = name;
    this.loc.querySelector('span').textContent = sub;
    this.loc.classList.remove('is-on');
    void this.loc.offsetWidth;
    this.loc.classList.add('is-on');
  }

  toast(text) {
    this.toastBox.textContent = text;
    this.toastBox.classList.remove('is-on');
    void this.toastBox.offsetWidth;
    this.toastBox.classList.add('is-on');
  }

  achievement(title, text) {
    this.ach.innerHTML = `<small>Logro desbloqueado</small><b>${title}</b><span>${text}</span>`;
    this.ach.classList.remove('is-on');
    void this.ach.offsetWidth;
    this.ach.classList.add('is-on');
  }

  setInventory(items, hide) {
    if (!items) {
      this.inv.innerHTML = '';
      return;
    }
    const any = Object.values(items).some(Boolean);
    this.inv.innerHTML = hide || !any ? '' : INV.map(([k, label, g]) => `<i class="${items[k] ? 'is-got' : ''}" title="${label}">${g}</i>`).join('');
  }

  // ---------------- daño ----------------
  hurt(level) {
    this.set('hurt', Math.round(level * 20), () => {
      this.vignette.style.opacity = String(Math.min(1, level * 1.1));
    });
  }

  damageFrom(angle) {
    const d = el('i', 'mdu-dir', this.dirs);
    d.style.transform = `rotate(${-angle + Math.PI}rad)`;
    setTimeout(() => d.remove(), 900);
  }

  setDowned(progress) {
    this.set('down', progress == null ? null : Math.round(progress * 50), () => {
      this.down.classList.toggle('is-on', progress != null);
      if (progress != null) this.down.querySelector('i').style.width = `${progress * 100}%`;
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
  }
}

// Palitos de tiza roja para las rondas 1 a 5, como en el original.
function tally(n) {
  const strokes = [];
  for (let i = 0; i < Math.min(n, 4); i++) {
    const x = 14 + i * 20;
    const j = () => (Math.random() - 0.5) * 4;
    strokes.push(`<path d="M${x + j()} ${8 + j()} Q ${x + 3 + j()} 45 ${x + j()} ${84 + j()}" />`);
  }
  if (n >= 5) strokes.push('<path d="M2 70 Q 45 45 92 20" />');
  return `<svg class="mdu-tally" viewBox="0 0 96 92" aria-label="Ronda ${n}"><defs><filter id="chalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter></defs><g filter="url(#chalk)">${strokes.join('')}</g></svg>`;
}
