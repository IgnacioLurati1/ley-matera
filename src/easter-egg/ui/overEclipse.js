import './overEclipse.css';

// La pantalla del final (Menus.gameOver) de Eclipse Matero, como la del castillo
// (ui/overCastle.js; el usuario, sesión 1f: "no tiene menú final especial como
// Der Mateendrache"). Detrás del menú: el cielo del eclipse que se abre en un
// amanecer —la luna negra se corre y sale el sol de oro, las grietas violetas
// se cierran de a una—, brasas que suben del fogón, en el horizonte el
// algarrobo con la cinta colorada que flamea y, lejos, el hombre de la linterna
// que se va caminando. El título de oro letra por letra, los cinco de la ronda
// (el Gil con su cinta y los cuatro de siempre con el color de su poncho) que
// se prenden de a uno y los números que cuentan desde cero. Si te mataron, lo
// mismo apagado y con el eclipse cerrado. En los demás mapas no hace nada.

const CREW = [
  { name: 'El Gil', c: '#e0302a', ribbon: true },
  { name: 'El Valiente', c: '#d8583a' },
  { name: 'El Miedoso', c: '#c9a46a' },
  { name: 'El Canchero', c: '#6f86d8' },
  { name: 'El Viejo', c: '#7fb06a' },
];
const EMBERS = ['255,196,110', '255,170,80', '255,214,150', '255,120,60', '255,224,170', '214,140,255'];

let rafSky = 0;
let rafNum = 0;

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export function decorateOverEclipse(g, s, { won = false } = {}) {
  cancelAnimationFrame(rafSky);
  cancelAnimationFrame(rafNum);
  s.querySelector('.mdu-ove')?.remove();
  s.querySelector('.mdu-ove-crew')?.remove();
  s.querySelector('.mdu-ove-veil')?.remove();
  s.classList.remove('mdu-over--eclipse', 'is-won', 'is-lost', 'is-veil');
  if (g.mapId !== 'eclipse' || globalThis.__mduNoOverEclipse === true) return;
  s.classList.add('mdu-over--eclipse', won ? 'is-won' : 'is-lost');
  // (2026-10-07, el usuario: "no hay música final en la pantalla final") la
  // épica, mientras dure la pantalla. globalThis.__mduNoOverEclipseMusic: sin
  // (2026-10-08, el usuario: en la pantalla final "la música baja de volumen" y
  // "la transición es muy abrupta, con un lag grande". La pieza arrancaba de su
  // principio, que va 17 dB más bajo que el telón durante 20 s, y se apagaba
  // sola al minuto. Ahora entra donde abre —20 s—, al nivel del telón —0,8: la
  // parte fuerte suena a -22 dB, el telón a -21,6— y da la vuelta cuando se
  // apagó la coda. Y la pantalla sale del negro del final: un velo negro que se
  // va despacio, con el fondo ya puesto; el primer cuadro, que el navegador
  // tarda en pintar entero, queda debajo del negro.
  // globalThis.__mduOldOverEclipseIn: como antes)
  const IN = won && globalThis.__mduOldOverEclipseIn !== true;
  const keep = (G) => G.state === 'won' || G.state === 'over';
  // (2026-10-08, ITERACION-8: la del usuario, "pantalla final", entera y desde
  // el principio —arranca fuerte—; da la vuelta recién a los 3 minutos.
  // globalThis.__mduOldFin8: la de antes)
  if (won && globalThis.__mduNoOverEclipseMusic !== true) {
    if (globalThis.__mduOldFin8 !== true) g.music?.play?.('fin8-pantalla', { fadeIn: 0.6, loop: true, while: keep });
    else g.music?.play?.('fin-eclipse-pantalla', IN ? { at: 20, gain: 0.8, fadeIn: 0.5, loop: true, while: keep } : { fadeIn: 2.5, while: keep });
  }
  const deco = h(`<div class="mdu-ove" aria-hidden="true">
      <i class="mdu-ove__glow"></i>
      ${eclipseSvg()}
      <canvas class="mdu-ove__sky"></canvas>
      ${horizonSvg()}
      <i class="mdu-ove__shade"></i>
    </div>`);
  s.prepend(deco);
  if (IN) {
    s.classList.add('is-veil');
    s.append(h('<i class="mdu-ove-veil" aria-hidden="true"></i>'));
  }
  const h2 = s.querySelector('.mdu-h2');
  const title = won ? 'El Primer Mate' : h2.textContent;
  h2.innerHTML = `<span class="mdu-ove__kick">${won ? 'La ronda se rompió' : 'Eclipse Matero'}</span><span class="mdu-ove__title">${[...title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</span>`;
  const row = h(`<div class="mdu-ove-crew">${CREW.map((e, i) => `<span class="mdu-ove-crew__b" style="--c:${e.c};--i:${i}">${e.ribbon ? ribbonSvg() : mateSvg()}<small>${e.name}</small></span>`).join('')}</div>`);
  s.querySelector('[data-survived]')?.after(row);
  const stats = s.querySelector('[data-stats]');
  if (stats) {
    [...stats.children].forEach((el, i) => el.style.setProperty('--i', String(i >> 1)));
    countUp(stats, s);
  }
  embers(deco.querySelector('canvas'), s, won);
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
    items.push({ dd, to, fmt, at: 1200 + i * 130, txt });
  });
  if (!items.length) return;
  const t0 = performance.now();
  const DUR = 1300;
  const tick = (now) => {
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

// ---------------- las brasas del fogón (canvas) ----------------
function embers(cv, s, won) {
  const ctx = cv.getContext('2d');
  const P = [];
  const mote = (any) => ({
    x: 0.08 + Math.random() * 0.5,
    y: any ? 0.4 + Math.random() * 0.6 : 1.02,
    r: 0.5 + Math.random() ** 2 * 2.2,
    v: 0.02 + Math.random() * 0.05,
    drift: (Math.random() - 0.3) * 0.02,
    ph: Math.random() * 6.28,
    c: EMBERS[(Math.random() * EMBERS.length) | 0],
    a: (won ? 0.45 : 0.25) + Math.random() * 0.5,
    life: 0,
  });
  for (let i = 0; i < 90; i++) P.push(mote(true));
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
      p.x += (p.drift + Math.sin(p.ph) * 0.01) * dt;
      p.ph += dt * 1.3;
      p.life += dt;
      if (p.y < 0.2 || p.x > 1.05) P[i] = mote(false);
      // (se apagan al subir)
      const fade = Math.max(0, Math.min(1, (p.y - 0.2) / 0.5));
      const tw = p.a * fade * (0.55 + 0.45 * Math.sin(now * 0.004 + p.ph * 3));
      const x = p.x * W;
      const y = p.y * H;
      const r = p.r * dpr;
      ctx.fillStyle = `rgba(${p.c},${tw * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, 6.2832);
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
// El eclipse que se abre: el sol de oro con su corona, la luna negra que se
// corre y las grietas violetas del cielo, que se apagan de a una.
function eclipseSvg() {
  const cracks = [
    'M120 -40L150 30L132 70L170 140L150 210',
    'M120 -40L80 20L96 60L40 120L60 190L20 260',
    'M120 -40L200 10L230 70L300 90L330 160',
    'M120 -40L110 -110L140 -170L120 -240',
    'M120 -40L40 -60L0 -120L-60 -130',
  ];
  return `<svg class="mdu-ove__ecl" viewBox="-400 -300 800 600" preserveAspectRatio="xMaxYMid slice">
      <defs>
        <radialGradient id="oveSun"><stop offset="0" stop-color="#fffbe8"/><stop offset="0.6" stop-color="#ffe6a8"/><stop offset="0.9" stop-color="#ffc56a"/><stop offset="0.97" stop-color="#ffaa50" stop-opacity="0.85"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
        <radialGradient id="oveCorona"><stop offset="0.55" stop-color="#ffcf7a" stop-opacity="0.9"/><stop offset="0.7" stop-color="#ffb860" stop-opacity="0.35"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="mdu-ove__cracks">${cracks.map((d, i) => `<path d="${d}" style="--i:${i}"/>`).join('')}</g>
      <g transform="translate(120 -40)">
        <circle r="210" fill="url(#oveCorona)" class="mdu-ove__corona"/>
        <circle r="82" fill="url(#oveSun)" class="mdu-ove__sun"/>
        <circle r="78" class="mdu-ove__moon"/>
      </g>
    </svg>`;
}

// El horizonte: la loma con el algarrobo (la soga y la cinta colorada que
// flamea), el pajonal y, lejos, el de la linterna que se va.
function horizonSvg() {
  let grass = '';
  for (let i = 0; i < 70; i++) {
    const x = (i / 70) * 1200 + ((i * 37) % 13);
    const hgt = 18 + ((i * 53) % 26);
    grass += `<path d="M${x} 300Q${x + 3} ${300 - hgt * 0.6} ${x + 6 + ((i * 7) % 9)} ${300 - hgt}"/>`;
  }
  return `<svg class="mdu-ove__hz" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice">
      <path class="mdu-ove__hill2" d="M0 236C160 214 300 226 460 210C640 192 820 222 1000 206C1080 199 1150 204 1200 200V300H0Z"/>
      ${globalThis.__mduOldOveFacon !== true ? faconSvg() : ''}
      <path class="mdu-ove__hill" d="M0 260C120 248 220 236 330 238C420 240 470 216 560 222C680 230 760 256 900 252C1020 249 1120 240 1200 244V300H0Z"/>
      <g class="mdu-ove__tree" transform="translate(470 224)">
        <path d="M-6 0L-4 -60C-20 -78 -46 -84 -70 -80M-3 -52C10 -76 30 -88 58 -92M-4 -66C-6 -90 4 -108 -6 -126M-4 -30C14 -40 30 -38 44 -46" fill="none" stroke-width="7" stroke-linecap="round"/>
        <path d="M0 0L-10 0L-6 -58Z"/>
        <ellipse cx="-58" cy="-88" rx="40" ry="14"/><ellipse cx="44" cy="-98" rx="46" ry="15"/><ellipse cx="-6" cy="-128" rx="38" ry="15"/><ellipse cx="-20" cy="-104" rx="52" ry="12"/>
        ${
          // (2026-10-09, el usuario: "la pantalla final tiene eso que el facón
          // vuela": la soga colgando de la rama, con la cinta, parecía un
          // facón en el aire. Sin la soga: la cinta atada a la rama.
          // globalThis.__mduOldOveRope: como antes)
          // (2026-10-10, el usuario: "añadí el facón del Gil con su bandana
          // flameando en lugar de ponerlo en el algarrobo": la cinta ya no va
          // en la rama; ver faconSvg. globalThis.__mduOldOveFacon: como antes)
          globalThis.__mduOldOveFacon !== true
            ? ''
            : globalThis.__mduOldOveRope === true
              ? '<path class="mdu-ove__rope" d="M30 -44L30 -20"/><path class="mdu-ove__ribbon" d="M30 -40C42 -42 50 -36 62 -38C70 -39 76 -36 82 -38"/>'
              : '<path class="mdu-ove__knot" d="M27 -41L33 -37"/><path class="mdu-ove__ribbon" d="M30 -39C40 -36 47 -31 57 -32C65 -33 70 -29 76 -30"/>'
        }
      </g>
      <g class="mdu-ove__lantern-man">
        <path d="M0 0L-3 -26L-9 -27L-8 -34L-14 -35L0 -42L14 -35L8 -34L9 -27L3 -26Z"/>
        <circle class="mdu-ove__lamp" cx="9" cy="-14" r="3.2"/>
      </g>
      <g class="mdu-ove__grass">${grass}</g>
    </svg>`;
}

// El facón del Gil clavado en la loma de adelante, con su bandana colorada
// atada al cabo y flameando (dos puntas, cada una a su tiempo). Va delante del
// algarrobo y más grande: es lo que quedó de él.
function faconSvg() {
  // (va dibujado antes que la loma de adelante, que le tapa la punta: queda
  // clavado. El lomo de esa loma en x = 742 está en y ≈ 243)
  return `<g class="mdu-ove__facon" transform="translate(742 268) rotate(-7) scale(1.3)">
        <path class="mdu-ove__facon-hoja" d="M-3.4 -4L-4.2 -50L0 -58L4.2 -50L3.4 -4L0 4Z"/>
        <path class="mdu-ove__facon-filo" d="M-0.4 -55L-2.6 -49L-2 -6"/>
        <path class="mdu-ove__facon-gavilan" d="M-11 -58C-11 -62 11 -62 11 -58C11 -55 -11 -55 -11 -58Z"/>
        <path class="mdu-ove__facon-cabo" d="M-3.6 -60L-3 -84C-3 -89 3 -89 3 -84L3.6 -60Z"/>
        <path class="mdu-ove__facon-pomo" d="M-4.6 -86C-4.6 -92 4.6 -92 4.6 -86C4.6 -83 -4.6 -83 -4.6 -86Z"/>
        <path class="mdu-ove__bandana-nudo" d="M-5 -70C-1 -73 2 -67 6 -70L6 -65C2 -62 -1 -68 -5 -65Z"/>
        <path class="mdu-ove__bandana" d="M4 -69C16 -74 24 -62 36 -67C46 -71 52 -62 62 -66L60 -58C52 -55 46 -63 37 -59C25 -54 17 -65 5 -62Z"/>
        <path class="mdu-ove__bandana mdu-ove__bandana--b" d="M4 -66C13 -62 19 -52 30 -54C38 -55 43 -48 50 -49L47 -43C41 -42 37 -48 30 -47C19 -45 12 -55 4 -60Z"/>
      </g>`;
}

function mateSvg() {
  return `<svg viewBox="-12 -12 24 24"><path fill="currentColor" d="M-6 -2C-7 4 -4 9 0 9C4 9 7 4 6 -2C6 -4 4 -5 0 -5C-4 -5 -6 -4 -6 -2Z"/><path d="M2 -4L6 -11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="0" cy="-3.6" rx="5" ry="1.4" fill="rgba(0,0,0,0.45)"/></svg>`;
}

function ribbonSvg() {
  return `<svg viewBox="-12 -12 24 24"><path fill="currentColor" d="M-2 -9C2 -10 3 -6 0 -4C-3 -2 -6 1 -3 4L-6 10L-1 6L1 11L2 4C5 1 3 -2 1 -3C4 -5 3 -10 -2 -9Z"/></svg>`;
}
