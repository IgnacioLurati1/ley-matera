// La pantalla de las cartas del rush de jefes (core/rushCards.js arma cada
// set; core/bossRush.js la abre al arrancar y, si CARTAS_ENTRE_JEFES > 0,
// entre jefe y jefe). El usuario, 2026-10-12: "te salen 3 sets de 3 cards para
// elegir algo [...] si te dice cual es". Que se entienda de un vistazo y con
// poco texto: la clase arriba, el dibujo, el nombre y dos o tres palabras.
// El tier se ve en el marco: gris apagado, oro que brilla, prismático que
// gira por todos los colores. Las cartas entran repartidas, la elegida sube y
// baja a la fila de abajo (lo que llevás) y las otras se caen.
// 1, 2, 3 o el clic eligen; Esc (solo, antes del primer jefe) vuelve al menú.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildMate, getMats } from '../weapons/viewmodels';
import { perkIconURL } from './perkIcons';
import { RUSH_ICONS } from './rushIcons';
import './rush.css';

// cuánto dura cada cosa (ms; las animaciones están en ui/rush.css)
const DEAL = 110; // entre carta y carta al repartir
const TAKE = 680; // de elegir a que entre el set siguiente
const OUT = 420; // el fundido de salida

// El chambergo (la carta de vida) y un mate cualquiera (si no sale el dibujo).
const HAT = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="42" rx="28" ry="8" fill="#3a2614" stroke="#120a04" stroke-width="2"/>
  <path d="M17 41 C17 24 22 16 32 16 C42 16 47 24 47 41 Z" fill="#4a3018" stroke="#120a04" stroke-width="2"/>
  <path d="M17.6 35 C25 38 39 38 46.4 35 L46.8 39 C39 42 25 42 17.2 39 Z" fill="#8a1a10"/>
  <path d="M24 22 C27 19 31 18 34 18" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
// los ponchos (de cuero y de vicuña) y la faja
const poncho = (c1, c2) => `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10 L58 40 L50 54 L14 54 L6 40 Z" fill="${c1}" stroke="#120a04" stroke-width="2" stroke-linejoin="round"/>
  <path d="M10 44 H54 M12 49 H52" stroke="${c2}" stroke-width="2.4"/><path d="M27 15 L32 22 L37 15" fill="none" stroke="#120a04" stroke-width="2"/>
  <path d="M16 54 v5 M22 54 v5 M28 54 v5 M34 54 v5 M40 54 v5 M46 54 v5" stroke="${c1}" stroke-width="2" stroke-linecap="round"/></svg>`;
const FAJA = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 26 C20 22 44 22 58 26 L58 40 C44 36 20 36 6 40 Z" fill="#5a3418" stroke="#120a04" stroke-width="2"/>
  <path d="M8 31 C22 27 42 27 56 31" stroke="#c8a060" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>
  <rect x="25" y="25" width="14" height="14" rx="2" fill="none" stroke="#d8c48a" stroke-width="3"/></svg>`;
const VIDA_ART = { chambergo: HAT, faja: FAJA, poncho: poncho('#8a4a1c', '#e0b060'), vicuna: poncho('#d8b98a', '#7a3a8a') };
const MATE = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 26 C12 38 16 52 32 54 C48 52 52 38 46 26 Z" fill="#6a4020" stroke="#1a0a04" stroke-width="2"/>
  <rect x="17" y="21" width="30" height="6" rx="2" fill="#d8d4c4" stroke="#1a0a04"/><path d="M36 22 L46 6" stroke="#d8d4c4" stroke-width="3" stroke-linecap="round"/></svg>`;

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const later = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- los dibujos de los mates ----------------
// Como la armería (ui/Armory.js model): el mate parado, sin la mano, con luz
// de estudio; una imagen por mate y mejora, hecha una vez.
const ICONS = new Map();
let rig = null;
function mateIcon(g, id, up = 0, size = 160) {
  const key = `${id}|${up}`;
  if (ICONS.has(key)) return ICONS.get(key);
  let url = '';
  const R = g.renderer;
  const T = g.weapons?.T;
  try {
    if (!R || !T) throw new Error('sin placa');
    if (!rig) {
      const scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(R);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a2018, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 3.2);
      sun.position.set(0.6, 1.3, 1.1);
      scene.add(sun);
      rig = { scene, cam: new THREE.PerspectiveCamera(26, 1, 0.01, 10) };
    }
    const m = buildMate(id, up, T);
    const mate = m.mate;
    mate.removeFromParent();
    mate.rotation.set(0, 0, 0);
    const M = getMats(T);
    const hand = new Set([M.skin, M.nail, M.cuff, M.sleeve, M.glove]);
    const fingers = [];
    mate.traverse((o) => {
      if (o.isMesh && hand.has(o.material)) fingers.push(o);
    });
    for (const o of fingers) o.removeFromParent();
    for (const straw of m.bombGroup?.children || []) straw.rotation.x = -0.32;
    const grp = new THREE.Group();
    grp.add(mate);
    grp.rotation.y = -0.65;
    rig.scene.add(grp);
    grp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(grp);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5;
    const cam = rig.cam;
    // (el radio de la caja es de la diagonal: un mate alto queda chico; más cerca)
    const dist = (r / Math.sin((cam.fov * Math.PI) / 360)) * 0.74;
    cam.position.set(c.x, c.y + dist * 0.32, c.z + dist * 0.95);
    cam.lookAt(c);
    const S = size * 2;
    const rt = new THREE.WebGLRenderTarget(S, S);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevRT = R.getRenderTarget();
    const prevColor = R.getClearColor(new THREE.Color());
    const prevAlpha = R.getClearAlpha();
    const prevShadow = R.shadowMap.autoUpdate;
    R.shadowMap.autoUpdate = false;
    R.setRenderTarget(rt);
    R.setClearColor(0x000000, 0);
    R.clear();
    R.render(rig.scene, cam);
    const px = new Uint8Array(S * S * 4);
    R.readRenderTargetPixels(rt, 0, 0, S, S, px);
    R.setRenderTarget(prevRT);
    R.setClearColor(prevColor, prevAlpha);
    R.shadowMap.autoUpdate = prevShadow;
    rig.scene.remove(grp);
    rt.dispose();
    // (la placa lee de abajo para arriba)
    const big = document.createElement('canvas');
    big.width = big.height = S;
    const bx = big.getContext('2d');
    const img = bx.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    bx.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ox = out.getContext('2d');
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(big, 0, 0, size, size);
    url = out.toDataURL('image/png');
  } catch (err) {
    console.warn('rush: sin dibujo del mate', id, err);
  }
  ICONS.set(key, url);
  return url;
}

// El dibujo de una carta (una imagen o un svg).
function art(g, c) {
  let url = '';
  if (c.kind === 'perk') url = perkIconURL(c.id, 128);
  else if (c.kind === 'gun' || c.kind === 'pap') url = mateIcon(g, c.id, c.up || 0);
  else if (c.kind === 'emp') url = g.emp?.iconFor?.(c.id) || '';
  else if (c.kind === 'vida') return VIDA_ART[c.id] || HAT;
  // (las cartas nuevas: ui/rushIcons.js; el especialista, el dibujo de su mate)
  else if (c.kind === 'mej' || c.kind === 'hab' || c.kind === 'habup') return RUSH_ICONS[c.id] || MATE;
  else if (c.kind === 'esp') url = mateIcon(g, c.id, 0);
  return url ? `<img class="k-${c.kind}" alt="" src="${url}" draggable="false">` : MATE;
}

export default class RushCards {
  constructor(g) {
    this.g = g;
    this.el = null;
    this.run = 0;
    this.onKey = (e) => this.key(e);
  }

  get active() {
    return !!this.el;
  }

  // opts: total (sets), deal() → cartas del set, take(carta), done(), cancel (o null),
  // dejables() → tus mates en cartas (una "Nueva arma" sin lugar), early (done al elegir la última)
  open(opts) {
    this.close(true);
    const run = ++this.run;
    this.opts = opts;
    this.n = 0;
    this.busy = false;
    this.nuevo = null;
    this.sent = false;
    const el = h(`<div class="mdu-rc" role="dialog" aria-label="Cartas">
        <div class="mdu-rc__top">
          <span class="mdu-rc__pips">${Array.from({ length: opts.total }, () => '<i></i>').join('')}</span>
          <h2 class="mdu-rc__title">Elegí una</h2>
        </div>
        <div class="mdu-rc__row"></div>
        <div class="mdu-rc__hand"></div>
        <p class="mdu-rc__wait" hidden></p>
      </div>`);
    (this.g.root || document.body).appendChild(el);
    this.el = el;
    for (const c of opts.have || []) this.addHand(c, true);
    window.addEventListener('keydown', this.onKey, true);
    requestAnimationFrame(() => requestAnimationFrame(() => run === this.run && el.classList.add('is-on')));
    this.next();
  }

  // El set que sigue (o, si ya están todos, el final).
  next() {
    const el = this.el;
    if (!el) return;
    const pips = el.querySelectorAll('.mdu-rc__pips i');
    pips.forEach((p, i) => {
      p.classList.toggle('is-done', i < this.n);
      p.classList.toggle('is-on', i === this.n);
    });
    if (this.n >= this.opts.total) {
      this.finish();
      return;
    }
    const cards = this.opts.deal() || [];
    el.classList.remove('is-deja');
    this.show(cards);
  }

  // Pone un set en la fila: el de siempre, "Nueva arma" o qué mate dejás.
  show(cards) {
    const el = this.el;
    this.cards = cards;
    // (un set con su título: "Nueva arma", core/bossRush.js showCards)
    el.querySelector('.mdu-rc__title').textContent = cards.titulo || 'Elegí una';
    el.classList.toggle('is-arma', !!cards.titulo);
    const row = el.querySelector('.mdu-rc__row');
    row.innerHTML = cards
      .map(
        (c, i) => `<button class="mdu-rc__card is-${c.tier}${c.deja ? ' is-deja' : ''}" style="--i:${i};--r0:${(i - (cards.length - 1) / 2) * 7}deg" data-i="${i}">
          <span class="mdu-rc__frame" aria-hidden="true"></span>
          <span class="mdu-rc__kind">${esc(c.kindName)}</span>
          <span class="mdu-rc__art">${art(this.g, c)}</span>
          <b class="mdu-rc__name">${esc(c.name)}</b>
          <small class="mdu-rc__fx">${esc(c.fx || '')}</small>
          <kbd class="mdu-rc__key">${i + 1}</kbd>
        </button>`,
      )
      .join('');
    for (const b of row.querySelectorAll('[data-i]')) b.addEventListener('click', () => this.choose(+b.dataset.i));
    // (no se elige hasta que terminaron de entrar: un clic de más no se lleva la primera)
    this.busy = true;
    const run = this.run;
    setTimeout(() => run === this.run && (this.busy = false), DEAL * cards.length + 260);
  }

  async choose(i) {
    const c = this.cards?.[i];
    if (!c || this.busy || !this.el) return;
    this.busy = true;
    const run = this.run;
    const row = this.el.querySelector('.mdu-rc__row');
    const nuevo = this.nuevo;
    // (eligiendo cuál dejás: ese se cae y los que quedan bajan a la mano)
    row.querySelectorAll('.mdu-rc__card').forEach((b, k) => b.classList.add((k === i) !== !!nuevo ? 'is-picked' : 'is-out'));
    this.g.audio?.purchase?.();
    // ("Nueva arma" sin lugar —core/rushCards.js dealArmas, elegir—: un paso
    // más, con tus mates en cartas, para elegir cuál dejás; el usuario,
    // 2026-10-13: "elige el jugador a cuál reemplaza")
    const dej = !nuevo && c.elegir ? this.opts.dejables?.() : null;
    if (dej?.length) {
      await later(TAKE);
      if (run !== this.run) return;
      this.nuevo = c;
      dej.titulo = '¿Cuál dejás?';
      this.el.classList.add('is-deja');
      this.show(dej);
      return;
    }
    this.nuevo = null;
    const pick = nuevo ? { ...nuevo, replace: c.id, replaceUp: c.up } : c;
    this.opts.take(pick);
    // (la última: se avisa ya y el negro del viaje arranca debajo de la
    // animación de la carta; core/bossRush.js showCards early)
    if (this.opts.early && this.n + 1 >= this.opts.total) {
      this.sent = true;
      this.opts.done?.();
    }
    await later(TAKE * 0.62);
    if (run !== this.run) return;
    this.addHand(pick);
    await later(TAKE * 0.38);
    if (run !== this.run) return;
    this.n++;
    this.next();
  }

  // Lo que llevás: una ficha chica por carta elegida.
  addHand(c, now = false) {
    const hand = this.el?.querySelector('.mdu-rc__hand');
    if (!hand) return;
    const chip = h(`<span class="mdu-rc__chip is-${c.tier}${now ? ' is-now' : ''}" title="${esc(c.name)}"><span class="mdu-rc__chipart">${art(this.g, c)}</span><b>${esc(c.name)}</b></span>`);
    hand.appendChild(chip);
    // (con muchas, solo los dibujos: que se lea rápido entre jefe y jefe)
    hand.classList.toggle('is-many', hand.children.length > 6);
  }

  async finish() {
    const el = this.el;
    const run = this.run;
    el.querySelector('.mdu-rc__row').innerHTML = '';
    el.classList.add('is-done');
    el.querySelector('.mdu-rc__title').textContent = 'Listo';
    if (!this.sent) this.opts.done?.();
    // (en línea queda hasta que eligen todos: bossRush llama close)
    if (this.opts.stay) return;
    await later(650);
    if (run === this.run) this.close();
  }

  // En línea: a quién se espera (vacío: a nadie).
  wait(names) {
    const p = this.el?.querySelector('.mdu-rc__wait');
    if (!p) return;
    p.hidden = !names?.length || !this.el.classList.contains('is-done');
    if (!p.hidden) p.textContent = `Esperando a ${names.join(', ')}`;
  }

  key(e) {
    if (!this.el) return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n != null) {
      e.preventDefault();
      e.stopPropagation();
      this.choose(n);
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.opts.cancel && !this.el.classList.contains('is-done')) {
        const cancel = this.opts.cancel;
        this.close();
        cancel();
      }
    }
  }

  close(now = false) {
    const el = this.el;
    this.run++;
    window.removeEventListener('keydown', this.onKey, true);
    if (!el) return;
    this.el = null;
    if (now) {
      el.remove();
      return;
    }
    el.classList.add('is-gone');
    setTimeout(() => el.remove(), OUT + 80);
  }
}
