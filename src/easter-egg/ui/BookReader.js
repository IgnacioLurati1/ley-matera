import './book.css';
import { eggsAll } from '../core/eggs';
import { profile } from '../core/progress';

// "La Ronda Eterna" (docs/libro/ronda.js): la historia de fondo del juego como
// un libro de verdad, desde el menú del título y el de la pausa. Tapa de cuero,
// dos páginas de papel viejo, la hoja que se da vuelta (en tiras con un poco de
// curva), folios, cabeceras y capitulares. Cada capítulo se abre con los easter
// eggs que pide (`need`); los cerrados son hojas selladas con cinta y lacre.
// Todo existe solo mientras está abierto: al cerrarlo se borra el DOM, se
// sueltan las teclas y no queda nada corriendo.

const STORE = 'lm-zombies-libro';
const FONT_DIR = '/assets/sotano/libro/';
// ancho / alto de una página
const ASPECT = 0.7;
// tiras de la hoja que se da vuelta (más tiras, más curva y más copias del texto)
const STRIPS = 10;
const TURN_MS = 820;
const COVER_MS = 1050;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
};
const writeStore = (v) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
};

// Los mapas con el easter egg hecho: lo anotado en core/eggs (también los
// invitados, Game.win) más el perfil (core/progress, viaja en la copia de
// seguridad).
function eggSet() {
  const s = new Set(eggsAll());
  try {
    const e = profile().eggs || {};
    for (const k of Object.keys(e)) if (e[k]) s.add(k);
  } catch {
    /* sin perfil */
  }
  return s;
}

// ---------------- fuentes ----------------
let fontsReady = null;
function loadFonts() {
  if (fontsReady) return fontsReady;
  const faces = [
    ['garamond.woff2', 'normal'],
    ['garamond-italica.woff2', 'italic'],
  ].map(([f, style]) => new FontFace('MduLibro', `url(${FONT_DIR}${f}) format('woff2')`, { style, weight: '400 800' }));
  fontsReady = Promise.all(
    faces.map((f) =>
      f.load().then((ff) => {
        document.fonts.add(ff);
      }),
    ),
  )
    .then(() => Promise.all([document.fonts.load('700 40px Cinzel'), document.fonts.load('500 40px Cinzel')]))
    .catch(() => {
      // (sin la fuente: queda la de reemplazo del CSS; se reintenta la próxima vez)
      fontsReady = null;
    });
  return fontsReady;
}

// ---------------- texturas (una vez por sesión, en un canvas) ----------------
// Ruido de valores que se repite en los bordes (las texturas se embaldosan sin costura).
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function vnoise(w, h, cx, cy, rnd) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cy;
    const y0 = Math.floor(fy);
    const ty = sm(fy - y0);
    const r0 = (y0 % cy) * cx;
    const r1 = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cx;
      const x0 = Math.floor(fx);
      const tx = sm(fx - x0);
      const x1 = (x0 + 1) % cx;
      const a = g[r0 + (x0 % cx)] + (g[r0 + x1] - g[r0 + (x0 % cx)]) * tx;
      const b = g[r1 + (x0 % cx)] + (g[r1 + x1] - g[r1 + (x0 % cx)]) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(w, h, octs, rnd) {
  const out = new Float32Array(w * h);
  let tot = 0;
  for (const [cx, cy, amp] of octs) {
    const n = vnoise(w, h, cx, cy, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function paint(w, h, fn, after) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const [r, g, b] = fn(i, i % w, (i / w) | 0);
    d[p] = r;
    d[p + 1] = g;
    d[p + 2] = b;
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  after?.(ctx);
  return c.toDataURL('image/png');
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const rnd = rng(1877);
  // papel: manchas grandes, grano fino y fibras
  const S = 384;
  const mot = fbm(S, S, [[3, 3, 0.5], [6, 6, 0.3], [12, 12, 0.2], [24, 24, 0.12]], rnd);
  const grain = vnoise(S, S, 160, 160, rnd);
  const paper = paint(
    S,
    S,
    (i) => {
      const v = (mot[i] - 0.5) * 26 + (grain[i] - 0.5) * 11;
      return [236 + v, 224 + v * 0.95, 194 + v * 0.8];
    },
    (ctx) => {
      // fibras (copiadas al otro lado del borde: sigue embaldosando)
      for (let k = 0; k < 520; k++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const a = rnd() * Math.PI;
        const l = 3 + rnd() * 9;
        ctx.strokeStyle = rnd() < 0.6 ? `rgba(120,90,50,${0.05 + rnd() * 0.06})` : `rgba(255,250,235,${0.08 + rnd() * 0.08})`;
        ctx.lineWidth = 0.6;
        for (const ox of [-S, 0, S])
          for (const oy of [-S, 0, S]) {
            ctx.beginPath();
            ctx.moveTo(x + ox, y + oy);
            ctx.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 2, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
            ctx.stroke();
          }
      }
    },
  );
  // cuero: poro (ruido fino marcado) y manchas de uso
  const L = 256;
  const pore = vnoise(L, L, 72, 72, rnd);
  const pore2 = vnoise(L, L, 36, 36, rnd);
  const lmot = fbm(L, L, [[4, 4, 0.6], [8, 8, 0.4]], rnd);
  const leather = paint(L, L, (i) => {
    const p = Math.abs(pore[i] - 0.5) * 2;
    const q = Math.abs(pore2[i] - 0.5) * 2;
    const v = (p < 0.12 ? -26 : 0) + (q < 0.1 ? -14 : 0) + (lmot[i] - 0.5) * 34 + (pore[i] - 0.5) * 10;
    return [96 + v, 40 + v * 0.55, 24 + v * 0.35];
  });
  // guardas de papel marmolado
  const MW = 420;
  const MH = 600;
  const wa = fbm(MW, MH, [[3, 4, 0.6], [6, 8, 0.4]], rnd);
  const wb = fbm(MW, MH, [[4, 6, 0.6], [9, 12, 0.4]], rnd);
  const fine = vnoise(MW, MH, 140, 200, rnd);
  const pal = [
    [126, 40, 32],
    [196, 170, 120],
    [52, 66, 84],
    [168, 120, 58],
    [96, 34, 28],
    [210, 190, 146],
    [40, 52, 66],
  ];
  // peinado fino (como las guardas de los libros viejos): rayas onduladas
  const marble = paint(MW, MH, (i, x, y) => {
    const u = x / MW;
    const v = y / MH;
    // (las ondas grandes del peine y, encima, el ondeado fino)
    const t = u * 96 + Math.sin(v * 22 + wb[i] * 4) * 2.2 + Math.sin(v * 140 + u * 9) * 0.35 + wa[i] * 14;
    const band = Math.floor(t);
    const f = t - band;
    const c0 = pal[((band % pal.length) + pal.length) % pal.length];
    // (el borde entre rayas, suavizado: sin serrucho al estirarse)
    const cp = pal[(((band - 1) % pal.length) + pal.length) % pal.length];
    const w = f < 0.14 ? 0.5 - (f / 0.14) * 0.5 : 0;
    const c = [c0[0] + (cp[0] - c0[0]) * w, c0[1] + (cp[1] - c0[1]) * w, c0[2] + (cp[2] - c0[2]) * w];
    const edge = Math.min(f, 1 - f);
    const k = (0.8 + Math.min(1, edge * 5) * 0.2) * (0.86 + wb[i] * 0.24) + (fine[i] - 0.5) * 0.1;
    // apagado: los colores se van hacia un marrón viejo
    const m = 0.42;
    return [(c[0] * (1 - m) + 92 * m) * k, (c[1] * (1 - m) + 64 * m) * k, (c[2] * (1 - m) + 48 * m) * k];
  });
  // la mesa: madera oscura con veta larga
  const D = 512;
  const st = fbm(D, D, [[2, 40, 0.6], [4, 90, 0.3], [8, 160, 0.1]], rnd);
  const dm = fbm(D, D, [[3, 3, 0.7], [6, 6, 0.3]], rnd);
  const desk = paint(D, D, (i) => {
    const s = st[i];
    const ring = Math.sin(s * 60) * 0.5 + 0.5;
    const v = 0.7 + s * 0.45 + ring * 0.12 + (dm[i] - 0.5) * 0.3;
    return [62 * v, 38 * v, 22 * v];
  });
  TEX = { paper, leather, marble, desk };
  return TEX;
}

// ---------------- adornos (SVG) ----------------
const SVG_FLEURON = `<svg viewBox="0 0 120 20" aria-hidden="true"><path d="M2 10 C 22 2, 34 18, 52 10" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M118 10 C 98 2, 86 18, 68 10" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M60 3 L66 10 L60 17 L54 10 Z" fill="currentColor"/><circle cx="47" cy="10" r="1.6" fill="currentColor"/><circle cx="73" cy="10" r="1.6" fill="currentColor"/></svg>`;
const SVG_RULE = `<svg viewBox="0 0 200 14" aria-hidden="true"><path d="M4 7 H 86" stroke="currentColor" stroke-width="0.9"/><path d="M114 7 H 196" stroke="currentColor" stroke-width="0.9"/><path d="M100 1 L106 7 L100 13 L94 7 Z" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="100" cy="7" r="1.6" fill="currentColor"/><circle cx="90" cy="7" r="1.2" fill="currentColor"/><circle cx="110" cy="7" r="1.2" fill="currentColor"/></svg>`;
// un mate con su bombilla (la viñeta de la portada y del lacre)
const MATE_PATH = 'M34 40 C 22 40, 16 52, 18 66 C 20 82, 32 92, 50 92 C 68 92, 80 82, 82 66 C 84 52, 78 40, 66 40 C 64 34, 58 31, 50 31 C 42 31, 36 34, 34 40 Z';
const SVG_MATE = (cls = '') =>
  `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${MATE_PATH}" fill="none" stroke="currentColor" stroke-width="3"/><path d="M33 41 C 42 45, 58 45, 67 41" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M56 40 L 70 8 L 78 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M26 62 C 40 70, 60 70, 74 62" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".7"/></svg>`;
const SVG_CORNER = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M4 56 V 4 H 56" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 50 V 10 H 50" fill="none" stroke="currentColor" stroke-width="1"/><path d="M10 10 C 22 12, 26 20, 20 26 C 15 30, 12 24, 16 21" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24 14 C 30 16, 34 14, 38 10 M14 24 C 16 30, 14 34, 10 38" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="30" cy="30" r="2.2" fill="currentColor"/></svg>`;
// el lacre: una gota de cera de borde irregular, con el mate y el número hundidos
function waxSeal(n) {
  const pts = [];
  const r = rng(n * 97 + 13);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rad = 44 + r() * 6;
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const id = `wx${n}`;
  return `<svg class="bk-wax" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="${id}a" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#c8392c"/><stop offset=".55" stop-color="#8e1a14"/><stop offset="1" stop-color="#4e0a08"/></radialGradient>
      <radialGradient id="${id}b" cx="50%" cy="50%" r="50%"><stop offset=".7" stop-color="#7a1410"/><stop offset="1" stop-color="#a42a20"/></radialGradient>
    </defs>
    <path d="${d}" fill="url(#${id}a)"/>
    <path d="${d}" fill="none" stroke="#3a0605" stroke-opacity=".5" stroke-width="1.2"/>
    <circle cx="50" cy="50" r="30" fill="url(#${id}b)"/>
    <circle cx="50" cy="50" r="30" fill="none" stroke="#3d0706" stroke-width="1.6" stroke-opacity=".7"/>
    <circle cx="50.6" cy="51" r="30" fill="none" stroke="#e0655a" stroke-width=".8" stroke-opacity=".5"/>
    <g transform="translate(29 25) scale(.42)" color="#3d0706" opacity=".8">${SVG_MATE().replace(/<\/?svg[^>]*>/g, '')}</g>
    <g transform="translate(29.8 25.8) scale(.42)" color="#e8786a" opacity=".35">${SVG_MATE().replace(/<\/?svg[^>]*>/g, '')}</g>
    <text x="50" y="76" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="11" fill="#3d0706" fill-opacity=".85">${ROMAN[n]}</text>
  </svg>`;
}

// ---------------- el texto ----------------
// Un párrafo en palabras; cada palabra, tramos con o sin cursiva (*así*).
function words(par) {
  const out = [];
  let it = false;
  for (const raw of par.split(' ')) {
    if (!raw) continue;
    const runs = [];
    let buf = '';
    for (const ch of raw) {
      if (ch === '*') {
        if (buf) runs.push({ t: buf, it });
        buf = '';
        it = !it;
      } else buf += ch;
    }
    if (buf) runs.push({ t: buf, it });
    if (runs.length) out.push(runs);
  }
  return out;
}
// HTML de las palabras [a, b): la cursiva abarca los espacios de adentro.
function render(ws, a = 0, b = ws.length) {
  let html = '';
  let open = false;
  for (let i = a; i < b; i++) {
    const runs = ws[i];
    if (i > a) {
      const next = runs[0].it;
      if (open && !next) {
        html += '</em> ';
        open = false;
      } else html += ' ';
    }
    for (const r of runs) {
      if (r.it && !open) {
        html += '<em>';
        open = true;
      } else if (!r.it && open) {
        html += '</em>';
        open = false;
      }
      html += esc(r.t);
    }
  }
  if (open) html += '</em>';
  return html;
}

// ---------------- el lector ----------------
class BookReader {
  constructor(menus) {
    this.m = menus;
    this.g = menus.g;
    this.from = menus.current;
    this.data = null;
    this.spreads = [];
    this.at = 0;
    this.state = 'closed';
    this.turn = null;
    this.queue = [];
    this.open0 = performance.now();
    this.prevFocus = document.activeElement;
    this.build();
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey, true);
    this.onResize = () => {
      clearTimeout(this.rsT);
      this.rsT = setTimeout(() => this.relayout(), 160);
    };
    window.addEventListener('resize', this.onResize);
    // otra pantalla del menú (el anfitrión soltó la pausa, terminó la partida…): se cierra
    this.hook = (name) => {
      if (name !== this.from && this.state !== 'gone') this.destroy();
    };
    menus.showHooks.push(this.hook);
    // en el título no se dibuja el mundo de atrás mientras se lee (Game.loop: menus.stage)
    if (this.g?.state === 'title' && !menus.stage) {
      this.stageSet = { render() {} };
      menus.stage = this.stageSet;
    }
    this.load();
  }

  // ---------- armado ----------
  build() {
    const T = textures();
    const root = el('div', 'mdu-book');
    root.tabIndex = -1;
    root.style.setProperty('--t-paper', `url(${T.paper})`);
    root.style.setProperty('--t-leather', `url(${T.leather})`);
    root.style.setProperty('--t-marble', `url(${T.marble})`);
    root.style.setProperty('--t-desk', `url(${T.desk})`);
    root.innerHTML = `
      <div class="bk-desk"></div>
      <div class="bk-stage">
        <div class="bk-obj">
          <div class="bk-dshadow bk-dshadow--l"></div>
          <div class="bk-dshadow bk-dshadow--r"></div>
          <div class="bk-board bk-board--l"></div>
          <div class="bk-board bk-board--r"></div>
          <div class="bk-stack bk-stack--l"></div>
          <div class="bk-stack bk-stack--r"></div>
          <div class="bk-page bk-page--l"></div>
          <div class="bk-page bk-page--r"></div>
          <div class="bk-tshade bk-tshade--l"></div>
          <div class="bk-tshade bk-tshade--r"></div>
          <div class="bk-ribbon"></div>
          <div class="bk-hot bk-hot--l" data-bk="prev"></div>
          <div class="bk-hot bk-hot--r" data-bk="next"></div>
          <div class="bk-cover">
            <div class="bk-cover__front">
              <div class="bk-cover__frame"></div>
              <div class="bk-cover__corner bk-cover__corner--tl">${SVG_CORNER}</div>
              <div class="bk-cover__corner bk-cover__corner--tr">${SVG_CORNER}</div>
              <div class="bk-cover__corner bk-cover__corner--bl">${SVG_CORNER}</div>
              <div class="bk-cover__corner bk-cover__corner--br">${SVG_CORNER}</div>
              <div class="bk-cover__title"><span class="bk-cover__deboss">La Ronda<br>Eterna</span><span class="bk-cover__gold">La Ronda<br>Eterna</span></div>
              <div class="bk-cover__mate">${SVG_MATE('bk-cover__mateA')}${SVG_MATE('bk-cover__mateB')}</div>
              <div class="bk-cover__rule">${SVG_RULE}</div>
              <div class="bk-cover__joint"></div>
            </div>
            <div class="bk-cover__back"><div class="bk-cover__inside"></div></div>
          </div>
        </div>
      </div>
      <nav class="bk-nav">
        <button type="button" data-bk="prev" aria-label="Página anterior">&lsaquo;</button>
        <button type="button" data-bk="toc">Índice</button>
        <span class="bk-nav__pg" data-pg></span>
        <button type="button" data-bk="close">Cerrar</button>
        <button type="button" data-bk="next" aria-label="Página siguiente">&rsaquo;</button>
      </nav>
      <div class="bk-measure" aria-hidden="true"><div class="bk-sheet bk-recto"><div class="bk-text"><div class="bk-flow"></div></div></div><div class="bk-sheet bk-recto"><div class="bk-text bk-text--free"><div class="bk-flow"></div></div></div></div>`;
    this.el = root;
    const q = (s) => root.querySelector(s);
    this.obj = q('.bk-obj');
    this.pageL = q('.bk-page--l');
    this.pageR = q('.bk-page--r');
    this.cover = q('.bk-cover');
    this.inside = q('.bk-cover__inside');
    this.shL = q('.bk-tshade--l');
    this.shR = q('.bk-tshade--r');
    this.dsh = q('.bk-dshadow--l');
    this.pgEl = q('[data-pg]');
    this.measure = root.querySelector('.bk-measure');
    root.addEventListener('click', (e) => this.click(e));
    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('wheel', (e) => this.wheel(e), { passive: true });
    this.m.root.appendChild(root);
    this.layout();
    this.closedPose();
    // aparece de a poco (la tapa cerrada sobre la mesa)
    requestAnimationFrame(() => root.classList.add('is-in'));
    try {
      this.prevFocus?.blur?.();
      root.focus({ preventScroll: true });
    } catch {
      /* */
    }
  }

  // Tamaños: todo sale del ancho de la página (la letra también), así el texto
  // corta igual en 1280x720 que en 2560x1440.
  layout() {
    const W = this.m.root.clientWidth || innerWidth;
    const H = this.m.root.clientHeight || innerHeight;
    const nav = clamp(H * 0.05, 28, 70);
    const ph = Math.floor(Math.min((H - nav * 1.9) * 0.93, (W * 0.94) / (2 * ASPECT + 0.12)));
    const pw = Math.floor(ph * ASPECT);
    const fs = pw * 0.0352;
    const lh = fs * 1.37;
    const mt = ph * 0.098;
    const mb = ph * 0.115;
    const lines = Math.floor((ph - mt - mb) / lh);
    const s = this.el.style;
    const px = (v) => `${v.toFixed(2)}px`;
    s.setProperty('--pw', `${pw}px`);
    s.setProperty('--ph', `${ph}px`);
    s.setProperty('--fs', px(fs));
    s.setProperty('--lh', px(lh));
    s.setProperty('--lines', String(lines));
    s.setProperty('--mt', px(mt + (ph - mt - mb - lines * lh) * 0.4));
    s.setProperty('--nav', px(nav));
    this.L = { W, H, pw, ph, fs, lh, lines, ov: pw * 0.032 };
  }

  async load() {
    try {
      const [data] = await Promise.all([import('../docs/libro/ronda.js'), loadFonts()]);
      if (this.state === 'gone') return;
      this.data = data;
      const t0 = performance.now();
      this.paginate();
      this.pmMs = Math.round(performance.now() - t0);
      this.pickStart();
      this.ready = true;
      this.renderStatic();
      // la tapa cerrada se ve un momento; después se abre sola (o al tocar algo)
      const wait = Math.max(0, 950 - (performance.now() - this.open0));
      if (!globalThis.__mduBookHold) this.openT = setTimeout(() => this.openCover(), wait);
    } catch (err) {
      console.warn('[libro]', err);
      this.destroy();
    }
  }

  // ---------- paginado ----------
  // Las páginas "físicas": 0 la guarda de adelante, 1 la portada, 2 el índice,
  // y cada capítulo arranca en una impar (a la derecha). Los capítulos cerrados
  // también se paginan (sin mostrarse) para que los folios sean los de verdad;
  // se ven como un bloque sellado: el frente y el dorso de una sola hoja gruesa.
  paginate() {
    const { lh, lines } = this.L;
    const cap = lines * lh + 0.5;
    const meas = this.measure.children;
    const flow = meas[0].querySelector('.bk-flow');
    const free = meas[1].querySelector('.bk-flow');
    const open = eggSet();
    const pages = [{ kind: 'endpaper' }, { kind: 'title' }, { kind: 'toc' }];
    // (también por cantidad: `at` easter eggs hechos, sin contar Eclipse;
    // globalThis.__mduOldBookNeed: solo los que pide cada capítulo)
    const done = [...open].filter((m) => m !== 'eclipse').length;
    const byCount = (c) => globalThis.__mduOldBookNeed !== true && c.at > 0 && done >= c.at;
    const chapters = this.data.CHAPTERS.map((c) => ({ ...c, open: c.need.every((m) => open.has(m)) || byCount(c) }));
    const lineCount = (h) => Math.round(h / lh);
    const height = () => flow.getBoundingClientRect().height;
    for (const c of chapters) {
      if (pages.length % 2 === 0) pages.push({ kind: 'blank' });
      c.start = pages.length;
      let blocks = [];
      const push = () => {
        pages.push({ kind: blocks.opener ? 'opener' : 'text', ch: c.n, html: blocks.join('') });
        blocks = [];
        flow.innerHTML = '';
      };
      const add = (html) => {
        flow.insertAdjacentHTML('beforeend', html);
        blocks.push(html);
      };
      add(`<div class="bk-open"><div class="bk-open__num">${ROMAN[c.n]}</div><div class="bk-open__title">${esc(c.title)}</div><div class="bk-open__orn">${SVG_RULE}</div></div>`);
      blocks.opener = true;
      let first = true;
      let afterSep = true;
      for (const par of c.text) {
        if (par === '---') {
          // (el corte de escena va con, al menos, dos renglones de lo que sigue)
          // (si cae justo en el cambio de página, el adorno abre la siguiente)
          if (blocks.length && height() + 4 * lh > cap) push();
          add(`<div class="bk-sep">${SVG_FLEURON}</div>`);
          afterSep = true;
          continue;
        }
        let ws = words(par);
        let cls = first ? 'bk-p dc' : afterSep ? 'bk-p ni' : 'bk-p';
        first = false;
        afterSep = false;
        while (ws.length) {
          const p = el('p', cls);
          p.innerHTML = render(ws);
          flow.appendChild(p);
          if (height() <= cap) {
            blocks.push(p.outerHTML);
            break;
          }
          // no entra entero: cuántas palabras entran (sin cortar ninguna)
          const fit = (limit) => {
            let lo = 0;
            let hi = ws.length;
            while (lo < hi) {
              const mid = (lo + hi + 1) >> 1;
              p.innerHTML = render(ws, 0, mid);
              if (height() <= limit) lo = mid;
              else hi = mid - 1;
            }
            return lo;
          };
          const top = p.offsetTop;
          let k = fit(cap);
          p.innerHTML = render(ws, 0, k);
          let n = k ? lineCount(p.getBoundingClientRect().height) : 0;
          // un solo renglón al pie (huérfana) o nada: todo el párrafo a la página siguiente
          if (n < 2 && blocks.length) {
            p.remove();
            push();
            continue;
          }
          // y no dejar un solo renglón arriba de la siguiente (viuda)
          free.innerHTML = `<p class="bk-p ni">${render(ws, k)}</p>`;
          if (lineCount(free.getBoundingClientRect().height) < 2 && n >= 3) {
            k = fit(top + (n - 1) * lh + 0.5);
            p.innerHTML = render(ws, 0, k);
            n = lineCount(p.getBoundingClientRect().height);
          }
          p.className = `${cls} cut`;
          blocks.push(p.outerHTML);
          push();
          ws = ws.slice(k);
          cls = 'bk-p ni cont';
        }
      }
      if (blocks.length) push();
      c.end = pages.length - 1;
      // (cierra en impar: el dorso queda en blanco)
      if (pages.length % 2 === 0) pages.push({ kind: 'blank', ch: c.n, tail: true });
      c.last = pages.length - 1;
    }
    flow.innerHTML = '';
    free.innerHTML = '';
    // la guarda de atrás, a la derecha
    if (pages.length % 2 === 0) pages.push({ kind: 'blank', tail: true });
    pages.push({ kind: 'endpaper', back: true });
    this.pages = pages;
    this.chapters = chapters;
    // las caras que se ven, en pares (izquierda, derecha); lo sellado se junta
    const sides = [];
    for (let i = 0; i < pages.length; i++) {
      const c = chapters.find((x) => x.start === i);
      if (c && !c.open) {
        sides.push({ ...pages[i], kind: 'seal', ch: c.n, no: i, face: 'front' });
        sides.push({ kind: 'seal', ch: c.n, no: c.last, face: 'back' });
        i = c.last;
        continue;
      }
      sides.push({ ...pages[i], no: i });
    }
    this.spreads = [];
    for (let i = 0; i < sides.length; i += 2) this.spreads.push({ l: sides[i], r: sides[i + 1] || { kind: 'blank', no: i + 1 } });
    this.total = pages.length - 1;
    // dónde empieza cada capítulo (para el índice y para saltar)
    for (const c of chapters) c.spread = this.spreads.findIndex((s) => s.r.no === c.start);
  }

  // Dónde se abre: en un capítulo recién desbloqueado, si hay; si no, donde se dejó.
  pickStart() {
    const st = readStore();
    const seen = new Set(st.seen || []);
    const fresh = this.chapters.find((c) => c.open && st.seen && !seen.has(c.n));
    let at = 0;
    if (fresh) at = fresh.spread;
    else if (st.pg) {
      const i = this.spreads.findIndex((s) => s.r.no >= st.pg);
      at = i < 0 ? this.spreads.length - 1 : i;
    }
    this.at = clamp(at, 0, this.spreads.length - 1);
    this.save();
  }

  save() {
    const s = this.spreads[this.at];
    writeStore({ pg: s ? s.r.no : 1, seen: this.chapters.filter((c) => c.open).map((c) => c.n) });
  }

  // ---------- una página ----------
  // (cada hoja con el papel corrido a otro lado: no se repiten las manchas)
  sheet(side, recto) {
    const n = side?.no || 0;
    const tile = this.L.pw * 0.62;
    const po = `--po:${((n * 0.37) % 1) * tile}px ${((n * 0.61) % 1) * tile}px`;
    return this.sheetHTML(side, recto).replace('<div class="bk-sheet', `<div style="${po}" class="bk-sheet`);
  }

  sheetHTML(side, recto) {
    const cls = `bk-sheet ${recto ? 'bk-recto' : 'bk-verso'}`;
    if (!side) return `<div class="${cls} bk-sheet--blank"></div>`;
    const c = side.ch ? this.chapters.find((x) => x.n === side.ch) : null;
    const folio = (n) => `<div class="bk-folio">${n}</div>`;
    switch (side.kind) {
      case 'endpaper':
        return `<div class="${cls} bk-sheet--endpaper"></div>`;
      case 'title':
        return `<div class="${cls} bk-sheet--title"><div class="bk-tp"><div class="bk-tp__orn">${SVG_RULE}</div><div class="bk-tp__title">La Ronda<br>Eterna</div><div class="bk-tp__orn">${SVG_RULE}</div><div class="bk-tp__mate">${SVG_MATE()}</div></div></div>`;
      case 'toc':
        return `<div class="${cls} bk-sheet--toc"><div class="bk-text"><div class="bk-toc"><div class="bk-toc__h">Índice</div>${this.chapters
          .map(
            (x) =>
              `<button type="button" class="bk-toc__row${x.open ? '' : ' is-sealed'}" data-ch="${x.n}"><span class="bk-toc__n">${ROMAN[x.n]}</span><span class="bk-toc__t">${esc(x.title)}${x.open ? '' : '<i class="bk-toc__dot"></i>'}</span><span class="bk-toc__dots"></span><span class="bk-toc__pg">${x.start}</span></button>`,
          )
          .join('')}</div></div>${folio(side.no)}</div>`;
      case 'seal':
        if (side.face === 'front')
          return `<div class="${cls} bk-sheet--seal"><div class="bk-seal"><div class="bk-seal__num">${ROMAN[side.ch]}</div><div class="bk-seal__title">${esc(c.title)}</div><div class="bk-seal__mid"><div class="bk-seal__cord"></div><div class="bk-seal__wax">${waxSeal(side.ch)}</div></div><div class="bk-seal__word">Sellado</div></div></div>`;
        return `<div class="${cls} bk-sheet--seal bk-sheet--sealback"><div class="bk-seal"><div class="bk-seal__num" style="visibility:hidden">${ROMAN[side.ch]}</div><div class="bk-seal__title" style="visibility:hidden">${esc(c.title)}</div><div class="bk-seal__mid"><div class="bk-seal__cord"></div><div class="bk-seal__knot"></div></div><div class="bk-seal__word" style="visibility:hidden">Sellado</div></div></div>`;
      case 'blank':
        return `<div class="${cls} bk-sheet--blank">${side.tail ? `<div class="bk-blank__orn">${SVG_FLEURON}</div>` : ''}</div>`;
      case 'opener':
        return `<div class="${cls} bk-sheet--opener"><div class="bk-text"><div class="bk-flow">${side.html}</div></div>${folio(side.no)}</div>`;
      default:
        return `<div class="${cls}"><div class="bk-head">${recto ? esc(c.title) : 'La Ronda Eterna'}</div><div class="bk-text"><div class="bk-flow">${side.html}</div></div>${folio(side.no)}</div>`;
    }
  }

  renderStatic() {
    const s = this.spreads[this.at];
    this.pageL.innerHTML = this.sheet(s.l, false);
    this.pageR.innerHTML = this.sheet(s.r, true);
    this.syncChrome();
  }

  // Lo de alrededor: el grosor de las pilas de hojas, la cinta, la barra de abajo.
  syncChrome() {
    const s = this.spreads[this.at];
    const tot = Math.max(1, this.total);
    const k = clamp(s.l.no / tot, 0, 1);
    const max = this.L.pw * 0.022;
    this.el.style.setProperty('--stl', `${(1.5 + k * max).toFixed(1)}px`);
    this.el.style.setProperty('--str', `${(1.5 + (1 - k) * max).toFixed(1)}px`);
    const shown = (x) => x.kind !== 'endpaper' && x.kind !== 'seal' && x.no > 0;
    const pg = [s.l, s.r].filter(shown).map((x) => x.no);
    this.pgEl.textContent = pg.length ? pg.join(' · ') : '';
    this.el.querySelector('.bk-nav [data-bk="prev"]').disabled = this.at <= 0;
    this.el.querySelector('.bk-nav [data-bk="next"]').disabled = this.at >= this.spreads.length - 1;
    this.el.classList.toggle('at-first', this.at <= 0);
    this.el.classList.toggle('at-last', this.at >= this.spreads.length - 1);
  }

  // ---------- la tapa ----------
  closedPose() {
    this.el.classList.add('is-closed');
    this.setCover(0);
  }

  // t: 0 cerrada → 1 abierta del todo (la tapa del lado izquierdo)
  setCover(t) {
    const pw = this.L.pw;
    const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    this.obj.style.transform = `translateX(${(-pw / 2) * (1 - e)}px)`;
    // (la sombra de la mitad izquierda aparece cuando la tapa ya se apoya)
    this.dsh.style.opacity = clamp((e - 0.8) / 0.2, 0, 1).toFixed(3);
    this.cover.style.transform = `rotateY(${-180 * e}deg)`;
    // (la sombra de la tapa sobre la página de la derecha mientras sube)
    this.shR.style.opacity = String(Math.sin(e * Math.PI) * 0.55 * (e < 0.5 ? 1 : 0.4));
  }

  animate(ms, fn, done) {
    const t0 = performance.now();
    const step = (now) => {
      if (this.state === 'gone') return;
      const t = clamp((now - t0) / ms, 0, 1);
      fn(t);
      if (t < 1) this.raf = requestAnimationFrame(step);
      else done?.();
    };
    this.raf = requestAnimationFrame(step);
  }

  openCover() {
    if (!this.ready || this.state !== 'closed') return;
    clearTimeout(this.openT);
    this.state = 'opening';
    const s = this.spreads[this.at];
    this.inside.innerHTML = this.sheet(s.l, false);
    this.el.classList.remove('is-closed');
    this.el.classList.add('is-opening');
    this.animate(
      COVER_MS,
      (t) => this.setCover(t),
      () => {
        this.el.classList.remove('is-opening');
        this.el.classList.add('is-open');
        this.shR.style.opacity = '0';
        this.state = 'open';
        this.next0();
      },
    );
  }

  close() {
    if (this.state === 'closing' || this.state === 'gone') return;
    clearTimeout(this.openT);
    if (this.state !== 'open') {
      this.destroy();
      return;
    }
    this.finishTurn(true);
    this.state = 'closing';
    const s = this.spreads[this.at];
    this.inside.innerHTML = this.sheet(s.l, false);
    this.el.classList.remove('is-open');
    this.el.classList.add('is-opening');
    this.animate(
      COVER_MS * 0.8,
      (t) => this.setCover(1 - t),
      () => {
        this.el.classList.remove('is-opening');
        this.el.classList.add('is-closed', 'is-out');
        this.outT = setTimeout(() => this.destroy(), 260);
      },
    );
  }

  // ---------- dar vuelta la hoja ----------
  go(to) {
    if (!this.ready) return;
    if (this.state === 'closed') {
      this.openCover();
      return;
    }
    if (this.state !== 'open') return;
    to = clamp(to, 0, this.spreads.length - 1);
    if (to === this.at) return;
    if (this.turn) {
      // (otra mientras se da vuelta: la que va termina rápido y sigue esta)
      this.turn.fast = true;
      if (this.queue.length < 2) this.queue.push(to);
      return;
    }
    this.startTurn(to, false);
    this.runTurn();
  }

  next0() {
    const q = this.queue.shift();
    if (q != null) this.go(q);
  }

  // Arma la hoja que gira: tiras anidadas (cada una gira un poco más que la de
  // antes, así la hoja se curva) con su pedazo del frente y del dorso.
  startTurn(to, manual) {
    const dir = to > this.at ? 1 : -1;
    const A = this.spreads[this.at];
    const B = this.spreads[to];
    const { pw, ph } = this.L;
    const front = dir > 0 ? this.sheet(A.r, true) : this.sheet(A.l, false);
    const back = dir > 0 ? this.sheet(B.l, false) : this.sheet(B.r, true);
    // lo que queda abajo ya es la página nueva
    if (dir > 0) this.pageR.innerHTML = this.sheet(B.r, true);
    else this.pageL.innerHTML = this.sheet(B.l, false);
    const leaf = el('div', `bk-leaf bk-leaf--${dir > 0 ? 'r' : 'l'}`);
    const w = pw / STRIPS;
    const strips = [];
    let parent = leaf;
    for (let i = 0; i < STRIPS; i++) {
      const s = el('div', 'bk-strip');
      s.style.width = `${w}px`;
      s.style.height = `${ph}px`;
      if (dir > 0) s.style.left = `${i === 0 ? 0 : w}px`;
      else s.style.left = `${i === 0 ? pw - w : -w}px`;
      s.style.transformOrigin = dir > 0 ? '0 50%' : '100% 50%';
      // cada cara, un pelo más ancha que la tira (sin rayitas entre una y otra);
      // el dorso va espejado, así que su pedazo sale del otro lado de la página
      const ov = 0.8;
      const span = pw - (i + 1) * w;
      const face = dir > 0 ? [0, -i * w, -ov, -span] : [-ov, -span + ov, -ov, -i * w];
      s.innerHTML = `<div class="bk-face" style="left:${face[0]}px;width:${w + ov}px"><div class="bk-face__in" style="left:${face[1]}px">${front}</div><i class="bk-face__sh"></i></div><div class="bk-face bk-face--back" style="left:${face[2]}px;width:${w + ov}px"><div class="bk-face__in" style="left:${face[3]}px">${back}</div><i class="bk-face__sh"></i></div>`;
      parent.appendChild(s);
      parent = s;
      const faces = s.children;
      strips.push({ s, fsh: faces[0].lastChild, bsh: faces[1].lastChild });
    }
    this.obj.insertBefore(leaf, this.el.querySelector('.bk-ribbon'));
    this.turn = { to, dir, leaf, strips, p: 0, manual, fast: false };
    this.setTurn(0);
  }

  // p: 0 → 1. El lomo y el borde de afuera giran con curvas distintas (el borde
  // va adelante): la diferencia se reparte entre las tiras.
  setTurn(p) {
    const T = this.turn;
    if (!T) return;
    T.p = p;
    const sg = T.dir > 0 ? -1 : 1;
    const spine = 180 * Math.pow(p, 1.45);
    const edge = 180 * (1 - Math.pow(1 - p, 1.6));
    let prev = 0;
    const n = T.strips.length;
    for (let i = 0; i < n; i++) {
      const f = Math.pow(i / (n - 1), 1.25);
      const abs = spine + (edge - spine) * f;
      const st = T.strips[i];
      st.s.style.transform = `rotateY(${(sg * (abs - prev)).toFixed(2)}deg)`;
      prev = abs;
      st.abs = abs;
    }
    // la luz: cada tira, de la sombra de su borde de adentro a la del de afuera
    // (sin escalones entre tiras)
    const cs = (a) => Math.cos((a * Math.PI) / 180);
    const col = (a) => `rgba(28,16,7,${a.toFixed(3)})`;
    for (let i = 0; i < n; i++) {
      const a0 = i ? (T.strips[i - 1].abs + T.strips[i].abs) / 2 : T.strips[0].abs;
      const a1 = i < n - 1 ? (T.strips[i].abs + T.strips[i + 1].abs) / 2 : T.strips[i].abs;
      const f0 = Math.max(0, 1 - cs(a0)) * 0.42;
      const f1 = Math.max(0, 1 - cs(a1)) * 0.42;
      const b0 = Math.max(0, 1 + cs(a0)) * 0.42;
      const b1 = Math.max(0, 1 + cs(a1)) * 0.42;
      const st = T.strips[i];
      st.fsh.style.background = T.dir > 0 ? `linear-gradient(90deg,${col(f0)},${col(f1)})` : `linear-gradient(90deg,${col(f1)},${col(f0)})`;
      st.bsh.style.background = T.dir > 0 ? `linear-gradient(90deg,${col(b1)},${col(b0)})` : `linear-gradient(90deg,${col(b0)},${col(b1)})`;
    }
    // la sombra que la hoja tira sobre las páginas de abajo
    const lift = Math.sin((spine * Math.PI) / 180);
    const under = T.dir > 0 ? this.shR : this.shL;
    const land = T.dir > 0 ? this.shL : this.shR;
    under.style.opacity = (lift * (spine < 90 ? 0.7 : 0.25)).toFixed(3);
    land.style.opacity = (spine > 90 ? lift * 0.55 : 0).toFixed(3);
  }

  runTurn() {
    const T = this.turn;
    const from = T.p;
    const goal = T.cancel ? 0 : 1;
    const t0 = performance.now();
    const dur = () => (T.fast ? TURN_MS * 0.42 : TURN_MS) * Math.abs(goal - from);
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
    const step = (now) => {
      if (this.state === 'gone' || this.turn !== T) return;
      const d = Math.max(1, dur());
      const t = clamp((now - t0) / d, 0, 1);
      this.setTurn(from + (goal - from) * (T.manual ? 1 - (1 - t) * (1 - t) : ease(t)));
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.finishTurn();
    };
    this.raf = requestAnimationFrame(step);
  }

  finishTurn(abort = false) {
    const T = this.turn;
    if (!T) return;
    this.turn = null;
    T.leaf.remove();
    this.shL.style.opacity = '0';
    this.shR.style.opacity = '0';
    if (!T.cancel) this.at = T.to;
    this.renderStatic();
    this.save();
    if (!abort) this.next0();
  }

  // ---------- mouse y teclado ----------
  click(e) {
    const b = e.target.closest('[data-bk],[data-ch]');
    if (this.state === 'closed' && this.ready && e.target.closest('.bk-obj')) {
      this.openCover();
      return;
    }
    if (!b) return;
    if (this.dragged) return;
    if (b.dataset.ch) {
      const c = this.chapters.find((x) => x.n === +b.dataset.ch);
      if (c) this.go(c.spread);
      return;
    }
    const a = b.dataset.bk;
    if (a === 'next') this.go(this.at + 1);
    else if (a === 'prev') this.go(this.at - 1);
    else if (a === 'toc') this.go(1);
    else if (a === 'close') this.close();
  }

  // Arrastrar la hoja desde el borde: sigue al mouse; al soltar, termina o vuelve.
  down(e) {
    const hot = e.target.closest('.bk-hot');
    this.dragged = false;
    if (!hot || e.button !== 0 || this.state !== 'open' || this.turn) return;
    const dir = hot.dataset.bk === 'next' ? 1 : -1;
    const to = this.at + dir;
    if (to < 0 || to >= this.spreads.length) return;
    const x0 = e.clientX;
    const r = this.obj.getBoundingClientRect();
    let started = false;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!started) {
        if (Math.abs(dx) < 6) return;
        started = true;
        this.dragged = true;
        this.startTurn(to, true);
      }
      // el borde de la hoja va donde está el mouse
      const p = dir > 0 ? (r.right - ev.clientX) / r.width : (ev.clientX - r.left) / r.width;
      this.setTurn(clamp(p, 0, 1));
      this.vx = ev.movementX;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!started) return;
      const T = this.turn;
      if (!T) return;
      const fling = dir > 0 ? (this.vx || 0) < -4 : (this.vx || 0) > 4;
      // (si no llegó, vuelve: finishTurn deja las páginas de antes)
      T.cancel = !(T.p > 0.42 || fling);
      this.runTurn();
      setTimeout(() => {
        this.dragged = false;
      }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  wheel(e) {
    if (this.state !== 'open') return;
    const now = performance.now();
    if (now - (this.wheelT || 0) < 380 || Math.abs(e.deltaY) < 8) return;
    this.wheelT = now;
    this.go(this.at + (e.deltaY > 0 ? 1 : -1));
  }

  key(e) {
    const k = e.code;
    const map = {
      ArrowRight: 1,
      ArrowDown: 1,
      PageDown: 1,
      Space: 1,
      KeyD: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      PageUp: -1,
      KeyA: -1,
    };
    let used = true;
    if (k === 'Escape' || k === 'Backspace') this.close();
    else if (k === 'Enter' || k === 'NumpadEnter') {
      if (this.state === 'closed') this.openCover();
    } else if (map[k]) {
      if (this.state === 'closed') this.openCover();
      else this.go(this.at + map[k]);
    } else if (k === 'Home') this.go(0);
    else if (k === 'End') this.go(this.spreads.length - 1);
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  // Cambió el tamaño de la ventana: se vuelve a paginar y se sigue en el mismo
  // capítulo, a la misma altura.
  relayout() {
    if (this.state === 'gone' || !this.ready) return;
    this.finishTurn(true);
    const s = this.spreads[this.at];
    const c = this.chapters.find((x) => s.r.no >= x.start && s.r.no <= x.last);
    const frac = c ? (s.r.no - c.start) / Math.max(1, c.last - c.start) : 0;
    this.layout();
    this.paginate();
    if (c) {
      const n = this.chapters.find((x) => x.n === c.n);
      const pg = n.start + Math.round(frac * (n.last - n.start));
      const i = this.spreads.findIndex((x) => x.r.no >= pg);
      this.at = i < 0 ? n.spread : i;
    } else this.at = clamp(this.at, 0, this.spreads.length - 1);
    this.renderStatic();
    if (this.state === 'closed') this.setCover(0);
    else if (this.state === 'open') this.setCover(1);
  }

  destroy() {
    if (this.state === 'gone') return;
    this.state = 'gone';
    cancelAnimationFrame(this.raf);
    clearTimeout(this.openT);
    clearTimeout(this.outT);
    clearTimeout(this.rsT);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    const i = this.m.showHooks.indexOf(this.hook);
    if (i >= 0) this.m.showHooks.splice(i, 1);
    if (this.stageSet && this.m.stage === this.stageSet) this.m.stage = null;
    this.el.remove();
    if (this.m.book === this) this.m.book = null;
    // el foco vuelve al botón del menú
    try {
      if (this.m.current === this.from) this.prevFocus?.focus?.({ preventScroll: true });
    } catch {
      /* */
    }
  }

  // (pruebas) dejar la hoja quieta a mitad de camino
  debugTurn(p, dir = 1) {
    if (this.state !== 'open') return false;
    if (!this.turn) this.startTurn(this.at + dir, true);
    this.setTurn(p);
    return true;
  }
}

// Precarga (ui/Menus, en la carga del juego): las letras, el texto y las
// texturas del papel y el cuero (se pintan en un canvas: lo que trababa la
// primera vez que se abría, el usuario 2026-10-05), ya decodificadas.
// globalThis.__mduNoBookPreload: como antes (todo al abrirlo).
export function preloadBook() {
  if (globalThis.__mduNoBookPreload === true) return;
  loadFonts().catch?.(() => {});
  import('../docs/libro/ronda.js').catch(() => {});
  const T = textures();
  for (const u of Object.values(T)) {
    const im = new Image();
    im.src = u;
    im.decode?.().catch(() => {});
  }
}

// Abre el libro sobre el menú actual (título o pausa).
export function openBook(menus) {
  if (menus.book && menus.book.state !== 'gone') return menus.book;
  menus.book = new BookReader(menus);
  return menus.book;
}
