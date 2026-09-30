import './overCastle.css';

// La pantalla del final (Menus.gameOver) de Der Mateendrache, el último mapa:
// un amanecer en los Andes detrás del menú (el cielo, la cordillera nevada con
// el castillo en una cumbre, el sello de los cuatro elementos girando, motas
// de luz que suben y el Mateendrache que cruza volando), el título de oro que
// aparece letra por letra, los cuatro mates de la luz que se prenden de a uno
// y los números que cuentan desde cero. Con la victoria todo brilla; si te
// mataron, lo mismo pero apagado. En los demás mapas no hace nada (y saca lo
// que haya quedado de una partida anterior en el castillo).

const ELEM = [
  { name: 'Fuego', c: '#ff7a2a', g: '<path d="M0 -10C4 -4 7 -1 6 4C5 9 -5 9 -6 4C-7 0 -3 -3 -2 -6C-1 -3 1 -2 1 0C3 -3 2 -7 0 -10Z"/>' },
  { name: 'Viento', c: '#8affb8', g: '<path d="M-9 -3H4A3 3 0 1 0 1 -6M-9 1H7A3 3 0 1 1 4 4M-7 5H0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { name: 'Rayo', c: '#ffe45a', g: '<path d="M2 -11L-6 1H0L-3 11L7 -2H1Z"/>' },
  { name: 'Hielo', c: '#9adcff', g: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M0 -10V10M-8.7 -5L8.7 5M-8.7 5L8.7 -5"/><path d="M-2.5 -7.5L0 -5L2.5 -7.5M-2.5 7.5L0 5L2.5 7.5M-7.7 -1.2L-6.1 -3.9L-9 -5.2M7.7 1.2L6.1 3.9L9 5.2"/></g>' },
];
// las motas: casi todas de oro, alguna del color de cada elemento
const MOTES = ['255,214,130', '255,214,130', '255,190,100', '255,236,180', '255,122,42', '138,255,184', '255,228,90', '154,220,255'];

let rafSky = 0;
let rafNum = 0;

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export function decorateOver(g, s, { won = false } = {}) {
  cancelAnimationFrame(rafSky);
  cancelAnimationFrame(rafNum);
  s.querySelector('.mdu-ovc')?.remove();
  s.querySelector('.mdu-ovc-el')?.remove();
  s.classList.remove('mdu-over--castillo', 'is-won', 'is-lost');
  if (g.mapId !== 'castillo') return;
  s.classList.add('mdu-over--castillo', won ? 'is-won' : 'is-lost');
  const deco = h(`<div class="mdu-ovc" aria-hidden="true">
      <i class="mdu-ovc__sun"></i><i class="mdu-ovc__rays"></i>
      <canvas class="mdu-ovc__sky"></canvas>
      ${sealSvg()}
      ${drakeSvg()}
      ${mountainsSvg()}
      <i class="mdu-ovc__shade"></i>
    </div>`);
  s.prepend(deco);
  // el título: arriba chiquito de qué fue, abajo letra por letra
  const h2 = s.querySelector('.mdu-h2');
  const title = h2.textContent;
  h2.innerHTML = `<span class="mdu-ovc__kick">${won ? 'La Gran Guerra' : 'Der Mateendrache'}</span><span class="mdu-ovc__title">${[...title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</span>`;
  // los cuatro mates de la luz, debajo de lo que pasó
  const row = h(`<div class="mdu-ovc-el">${ELEM.map((e, i) => `<span class="mdu-ovc-el__b" style="--c:${e.c};--i:${i}"><svg viewBox="-12 -12 24 24" fill="currentColor">${e.g}</svg><small>${e.name}</small></span>`).join('')}</div>`);
  s.querySelector('[data-survived]').after(row);
  // los números, de a un renglón y contando desde cero
  const stats = s.querySelector('[data-stats]');
  [...stats.children].forEach((el, i) => el.style.setProperty('--i', String(i >> 1)));
  countUp(stats, s);
  sky(deco.querySelector('canvas'), s);
}

// ---------------- los números ----------------
function countUp(stats, s) {
  const items = [];
  [...stats.querySelectorAll('dd')].forEach((dd, i) => {
    const txt = dd.textContent.trim();
    let to = null;
    let fmt = null;
    if (/^\d+(\.\d{3})*$/.test(txt)) {
      to = Number(txt.replace(/\./g, ''));
      // (con puntos de miles solo si el número ya los traía)
      const dots = txt.includes('.');
      fmt = (v) => (dots ? Math.round(v).toLocaleString('es-AR') : String(Math.round(v)));
    } else if (/^\d+:\d\d$/.test(txt)) {
      const [m, sec] = txt.split(':').map(Number);
      to = m * 60 + sec;
      fmt = (v) => {
        const n = Math.round(v);
        return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
      };
    }
    if (to == null || !to) return;
    dd.textContent = fmt(0);
    items.push({ dd, to, fmt, at: 900 + i * 130, txt });
  });
  if (!items.length) return;
  const t0 = performance.now();
  const DUR = 1300;
  const tick = (now) => {
    // (si la pantalla se fue, los números quedan en su valor)
    const gone = !s.isConnected || !s.classList.contains('is-on');
    let left = false;
    for (const it of items) {
      const k = gone ? 1 : Math.max(0, Math.min(1, (now - t0 - it.at) / DUR));
      const e = 1 - (1 - k) ** 3;
      it.dd.textContent = k >= 1 ? it.txt : it.fmt(it.to * e);
      if (k < 1) left = true;
    }
    if (left && !gone) rafNum = requestAnimationFrame(tick);
  };
  rafNum = requestAnimationFrame(tick);
}

// ---------------- las motas de luz ----------------
function sky(cv, s) {
  const ctx = cv.getContext('2d');
  const P = [];
  const mote = (any) => ({
    x: Math.random(),
    y: any ? Math.random() : 1.04,
    r: 0.6 + Math.random() ** 2 * 2.6,
    v: 0.012 + Math.random() * 0.03,
    ph: Math.random() * 6.28,
    c: MOTES[(Math.random() * MOTES.length) | 0],
    a: 0.35 + Math.random() * 0.6,
  });
  for (let i = 0; i < 120; i++) P.push(mote(true));
  let last = performance.now();
  const loop = (now) => {
    if (!s.isConnected || !s.classList.contains('is-on')) {
      rafSky = 0;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr);
    const H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.y -= p.v * dt;
      p.ph += dt;
      if (p.y < -0.04) P[i] = mote(false);
      const x = (p.x + Math.sin(p.ph * 0.7) * 0.012) * W;
      const y = p.y * H;
      const tw = p.a * (0.55 + 0.45 * Math.sin(now * 0.002 + p.ph * 3));
      const r = p.r * dpr;
      ctx.fillStyle = `rgba(${p.c},${tw * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = `rgba(${p.c},${tw})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
    }
    rafSky = requestAnimationFrame(loop);
  };
  rafSky = requestAnimationFrame(loop);
}

// ---------------- los dibujos ----------------
// El sello de los cuatro elementos (como el del juramento): aros de oro, los
// cuatro cuartos de colores, marcas y el dibujo de cada elemento.
function sealSvg() {
  const arcs = ELEM.map((e, i) => {
    const a0 = (i / 4) * Math.PI * 2 + 0.12;
    const a1 = ((i + 1) / 4) * Math.PI * 2 - 0.12;
    const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    const mid = (a0 + a1) / 2;
    return `<path d="M${p(a0, 74)}A74 74 0 0 1 ${p(a1, 74)}" stroke="${e.c}" class="mdu-ovc__arc"/>
      <g transform="translate(${p(mid, 100).replace(' ', ',')}) scale(1.35)" color="${e.c}" fill="currentColor" class="mdu-ovc__glyph">${e.g}</g>`;
  }).join('');
  let ticks = '';
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const r0 = k % 4 === 0 ? 84 : 87;
    ticks += `<line x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * 91).toFixed(1)}" y2="${(Math.sin(a) * 91).toFixed(1)}"/>`;
  }
  return `<svg class="mdu-ovc__seal" viewBox="-120 -120 240 240">
      <g class="mdu-ovc__spin">
        <circle r="94" class="mdu-ovc__ring"/><circle r="82" class="mdu-ovc__ring mdu-ovc__ring--thin"/>
        <g class="mdu-ovc__ticks">${ticks}</g>
        ${arcs}
        <circle r="56" class="mdu-ovc__ring mdu-ovc__ring--thin"/>
      </g>
      <g class="mdu-ovc__spin mdu-ovc__spin--back">
        <path d="M0 -52L9 -9L52 0L9 9L0 52L-9 9L-52 0L-9 -9Z" class="mdu-ovc__ring mdu-ovc__ring--thin"/>
        <path d="M0 -30L5 -5L30 0L5 5L0 30L-5 5L-30 0L-5 -5Z" class="mdu-ovc__ring mdu-ovc__ring--thin" transform="rotate(45)"/>
      </g>
      <circle r="16" class="mdu-ovc__core"/>
    </svg>`;
}

// El Mateendrache de perfil, volando hacia la izquierda (sus alas baten).
function drakeSvg() {
  return `<svg class="mdu-ovc__drake" viewBox="0 0 200 90">
      <g class="mdu-ovc__wing mdu-ovc__wing--far"><path d="M86 44L96 10L106 20L117 12L119 27L131 24L112 46Z"/></g>
      <path d="M6 44L18 39L24 32L27 39L34 40C56 37 78 43 100 45C122 47 140 43 160 47C173 50 185 56 197 51C188 60 171 59 156 56C138 53 120 57 100 56C80 55 60 50 42 48L34 50L26 51L18 49Z"/>
      <path d="M62 50L58 60L64 58ZM118 55L114 66L121 63Z"/>
      <g class="mdu-ovc__wing"><path d="M78 44L90 4L102 17L114 8L117 25L130 21L108 47Z"/></g>
    </svg>`;
}

// La cordillera: tres filas de cerros (la de atrás más clara) con nieve en las
// puntas, y el castillo en una cumbre de la del medio.
function mountainsSvg() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const W = 1600;
  const row = (base, amp, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W + (i && i < n ? (rnd() - 0.5) * (W / n) * 0.6 : 0);
      const y = base - (i % 2 ? amp * (0.55 + rnd() * 0.45) : amp * (0.1 + rnd() * 0.3));
      pts.push([x, y]);
    }
    return pts;
  };
  const poly = (pts) => `0,300 ${pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ')} ${W},300`;
  const snow = (pts) =>
    pts
      .map(([x, y], i) => {
        if (i === 0 || i === pts.length - 1 || y > pts[i - 1][1] || y > pts[i + 1][1]) return '';
        const [xa, ya] = pts[i - 1];
        const [xb, yb] = pts[i + 1];
        const k = 0.24;
        const l = [x + (xa - x) * k, y + (ya - y) * k];
        const r = [x + (xb - x) * k, y + (yb - y) * k];
        return `<polygon points="${x.toFixed(0)},${y.toFixed(0)} ${r[0].toFixed(0)},${r[1].toFixed(0)} ${((x + r[0]) / 2).toFixed(0)},${(y + (r[1] - y) * 0.7).toFixed(0)} ${x.toFixed(0)},${(y + (Math.max(ya, yb) - y) * 0.16).toFixed(0)} ${((x + l[0]) / 2).toFixed(0)},${(y + (l[1] - y) * 0.75).toFixed(0)} ${l[0].toFixed(0)},${l[1].toFixed(0)}"/>`;
      })
      .join('');
  const far = row(210, 150, 14);
  const mid = row(250, 140, 10);
  const near = row(292, 90, 8);
  // el castillo en la cumbre más alta de la del medio
  let top = mid[1];
  for (let i = 1; i < mid.length - 1; i++) if (mid[i][1] < top[1] && mid[i][0] > 300 && mid[i][0] < 1300) top = mid[i];
  const [cx, cy] = top;
  const castle = `<g class="mdu-ovc__castle" transform="translate(${cx.toFixed(0)},${(cy + 6).toFixed(0)})">
      <path d="M-34 0V-22H-28V-27H-24V-22H-18V-27H-14V-22H-10V-44H-6V-50H6V-44H10V-22H14V-27H18V-22H24V-27H28V-22H34V0Z"/>
      <path d="M-4 -50V-66L6 -62L-2 -59V-50Z"/>
      <rect x="-2" y="-38" width="4" height="6" class="mdu-ovc__win"/><rect x="-26" y="-16" width="3" height="5" class="mdu-ovc__win"/><rect x="23" y="-16" width="3" height="5" class="mdu-ovc__win"/>
    </g>`;
  return `<svg class="mdu-ovc__mts" viewBox="0 0 ${W} 300" preserveAspectRatio="xMidYMax slice">
      <polygon class="mdu-ovc__far" points="${poly(far)}"/><g class="mdu-ovc__snow mdu-ovc__snow--far">${snow(far)}</g>
      <polygon class="mdu-ovc__mid" points="${poly(mid)}"/><g class="mdu-ovc__snow">${snow(mid)}</g>
      ${castle}
      <polygon class="mdu-ovc__near" points="${poly(near)}"/><g class="mdu-ovc__snow mdu-ovc__snow--near">${snow(near)}</g>
    </svg>`;
}
