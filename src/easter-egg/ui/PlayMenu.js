// Jugar: dos tarjetas, Solo o Con amigos (la sala en línea), con el mapa
// elegido arriba y, abajo, la entrada a la versión original.

import { mapChip } from './MapSelect';
import { diaDelMate } from '../core/diaDelMate';
import './playMenu.css';
import './rush.css';

// Un mate de perfil (para los dibujos de las tarjetas).
const mate = (x, y, s, body = '#6a4020') => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-11 -3 C-14 4 -12 12 -6 15 C-2 17 2 17 6 15 C12 12 14 4 11 -3 Z" fill="${body}" stroke="#1a0a04" stroke-width="1.3"/>
  <rect x="-11.6" y="-6" width="23.2" height="4" rx="1.3" fill="#d8d4c4" stroke="#1a0a04" stroke-width=".8"/>
  <path d="M3 -5 L10 -17" stroke="#d8d4c4" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M-6 1 C-7.5 5 -6.5 9 -3.5 11" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/></g>`;

// Solo: un mate contra la luna, y los muertos que se asoman en el horizonte.
const SOLO = `<svg viewBox="0 0 240 150" aria-hidden="true">
  <defs><radialGradient id="pm-moon"><stop offset="0" stop-color="#fff6dc"/><stop offset=".6" stop-color="#f0d8a0"/><stop offset="1" stop-color="#f0d8a0" stop-opacity="0"/></radialGradient>
  <linearGradient id="pm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0a14"/><stop offset="1" stop-color="#4a1a10"/></linearGradient></defs>
  <rect width="240" height="150" fill="url(#pm-sky)"/>
  <circle cx="170" cy="46" r="34" fill="url(#pm-moon)"/><circle cx="170" cy="46" r="20" fill="#fff0cc"/>
  <path d="M0 118 C40 110 70 116 110 112 C150 108 190 116 240 110 V150 H0Z" fill="#0c0406"/>
  ${[18, 44, 196, 222].map((x, i) => `<g transform="translate(${x} ${112 + (i % 2) * 3})" fill="#0c0406"><circle cy="-22" r="5"/><path d="M-5 -17 h10 l3 17 h-16z"/><path d="M-5 -14 l-9 ${-4 - i}" stroke="#0c0406" stroke-width="3" stroke-linecap="round"/><path d="M5 -14 l9 ${-2 - i}" stroke="#0c0406" stroke-width="3" stroke-linecap="round"/></g>`).join('')}
  ${mate(120, 96, 2.1)}
</svg>`;

// Con amigos: la ronda de mate alrededor de la pava, junto al fogón.
const RONDA = `<svg viewBox="0 0 240 150" aria-hidden="true">
  <defs><radialGradient id="pm-fire" cx=".5" cy=".75"><stop offset="0" stop-color="#ffd27a"/><stop offset=".4" stop-color="#e85a1a" stop-opacity=".7"/><stop offset="1" stop-color="#3a0a04" stop-opacity="0"/></radialGradient></defs>
  <rect width="240" height="150" fill="#16070a"/>
  <ellipse cx="120" cy="112" rx="120" ry="60" fill="url(#pm-fire)"/>
  <path d="M0 124 C60 118 180 118 240 124 V150 H0Z" fill="#0c0406"/>
  <path d="M112 116 l8 -26 l8 26 z" fill="#ffb040" opacity=".9"/><path d="M116 116 l4 -15 l4 15 z" fill="#fff0b0"/>
  <g transform="translate(160 92)"><path d="M-14 22 C-18 8 -14 -4 0 -6 C14 -4 18 8 14 22 Z" fill="#2a2a30" stroke="#0a0a0c" stroke-width="1.5"/><path d="M14 4 C24 0 28 -8 30 -14" fill="none" stroke="#2a2a30" stroke-width="4" stroke-linecap="round"/><path d="M-10 -4 C-8 -14 8 -14 10 -4" fill="none" stroke="#2a2a30" stroke-width="3"/></g>
  ${mate(52, 100, 1.5, '#7a4a22')}${mate(86, 110, 1.35, '#5a3418')}${mate(196, 106, 1.45, '#8a5a2a')}
</svg>`;

// la corona del botón del rush
const CROWN = '<svg viewBox="0 0 24 24"><path d="M3 18 L4.6 7.5 L9 12 L12 4.5 L15 12 L19.4 7.5 L21 18 Z" fill="currentColor"/><rect x="3" y="19.2" width="18" height="2.2" fill="currentColor"/></svg>';

// el del Boss Rush Mayhem (core/rushMayhem.js): la corona con cuernos
export const HORNS = '<svg viewBox="0 0 24 24"><path d="M2 18 L2.6 4.5 L7.2 11 L9.4 2.5 L12 9 L14.6 2.5 L16.8 11 L21.4 4.5 L22 18 Z" fill="currentColor"/><rect x="2" y="19.2" width="20" height="2.2" fill="currentColor"/><circle cx="12" cy="14.2" r="1.7" fill="#000" opacity=".55"/></svg>';

// El botón del rush, prendido o no (y el mapa elegido, apagado mientras tanto).
// (con el Mayhem: uno u otro; el Mayhem es el rush con mayhemPick)
function syncRush(menus) {
  const R = menus.g.rush;
  const on = !!R?.pick;
  const mh = on && !!R.mayhemPick;
  const s = menus.screens.play;
  s.querySelector('[data-act="rush"]')?.setAttribute('aria-pressed', String(on && !mh));
  s.querySelector('[data-act="mayhem"]')?.setAttribute('aria-pressed', String(mh));
  s.classList.toggle('is-rush', on);
}

// El Día del Mate (core/diaDelMate.js): un aviso corto en el título ese día.
function syncDia(menus) {
  const t = menus.screens.title;
  let el = t?.querySelector('[data-diamate]');
  const on = diaDelMate();
  if (!on) {
    el?.remove();
    return;
  }
  if (el || !t) return;
  el = document.createElement('p');
  el.className = 'mdu-diamate';
  el.dataset.diamate = '';
  el.textContent = 'Día del Mate: experiencia y pesos x2, todos los camuflajes';
  t.querySelector('.mdu-tag')?.after(el);
}

export default class PlayMenu {
  constructor(menus) {
    menus.screen(
      'play',
      `<h2 class="mdu-kit-title">Jugar</h2>
       <div class="mdu-play__map">${mapChip()}</div>
       ${`<div class="mdu-rushrow"><button class="mdu-rushpick" data-act="rush" aria-pressed="false"><i aria-hidden="true">${CROWN}</i><span><b>Rush de jefes</b><small>Los seis, uno atrás del otro</small></span></button>${`<button class="mdu-rushpick mdu-rushpick--mayhem" data-act="mayhem" aria-pressed="false"><i aria-hidden="true">${HORNS}</i><span><b>Boss Rush Mayhem</b><small>Más bravos, sin grises</small></span></button>`}</div>`}
       <div class="mdu-play">
         <button class="mdu-kit-card mdu-play__card" data-act="solo">
           <span class="mdu-play__art">${SOLO}</span>
           <span class="mdu-play__txt"><b>Solo</b><small>Vos contra la noche</small></span>
         </button>
         <button class="mdu-kit-card mdu-play__card" data-act="online">
           <span class="mdu-play__art">${RONDA}</span>
           <span class="mdu-play__txt"><b>Con amigos</b><small>La ronda, en línea</small></span>
         </button>
       </div>
       <div class="mdu-play__foot">
         <button class="mdu-btn" data-act="back">Volver</button>
         <button class="mdu-btn mdu-btn--mini" data-act="original">¿Querés probar el original?</button>
       </div>`,
    );
    menus.screens.play.classList.add('mdu-menu--play');
    // el rush de jefes (core/bossRush.js; el usuario, 2026-10-12): elegido,
    // Solo y la sala arrancan el rush en vez del mapa (Game.startGame)
    menus.acts.rush = () => {
      const R = menus.g.rush;
      if (!R) return;
      // (con el Mayhem elegido, pasa al rush de siempre)
      R.pick = !(R.pick && !R.mayhemPick);
      R.mayhemPick = false;
      syncRush(menus);
    };
    // el Boss Rush Mayhem (core/rushMayhem.js; el usuario, 2026-10-13): el
    // mismo rush, con jefes más bravos y combos
    menus.acts.mayhem = () => {
      const R = menus.g.rush;
      if (!R) return;
      const on = !(R.pick && R.mayhemPick);
      R.pick = on;
      R.mayhemPick = on;
      syncRush(menus);
    };
    menus.showHooks.push((name) => {
      if (name === 'play') syncRush(menus);
      if (name === 'title') syncDia(menus);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && menus.current === 'play') menus.act('back');
    });
  }
}
