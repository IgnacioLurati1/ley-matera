// La pantalla del final del rush de jefes (Menus.gameOver → core/bossRush.js
// decorateOver). El usuario, 2026-10-12: una propia, no la del castillo.
// Detrás del menú, una corona de rayos de oro que gira y chispas que suben;
// el título letra por letra; los seis jefes en el orden en que salieron, que
// van cayendo de a uno (un tajo rojo encima), y los números contando desde
// cero. Ganado, todo de oro; perdido, apagado y el jefe que te tumbó en rojo.
// En cualquier otra partida saca lo que haya quedado (clearRushOver).
import { countUp } from './overCastle';
import './rush.css';

// un dibujo chico por jefe (viewBox -12 -12 24 24)
const GLYPH = {
  // el Mandinga: la cabeza con los cuernos
  molino: '<path d="M-9 -11C-8 -5 -6 -3 -4 -2L-5 2C-5 7 -2 10 0 10C2 10 5 7 5 2L4 -2C6 -3 8 -5 9 -11C6 -7 4 -5 0 -5C-4 -5 -6 -7 -9 -11Z"/><path d="M-3 1L-1 2.5M3 1L1 2.5" stroke="#000" stroke-width="1.4" stroke-linecap="round"/>',
  // el Espantapájaros: el sombrero de ala ancha sobre la cruz de palo
  granja: '<path d="M-11 -3H11L7 -5H3.5L2.5 -11H-2.5L-3.5 -5H-7Z"/><rect x="-1.2" y="-3" width="2.4" height="14"/><rect x="-9" y="2" width="18" height="2.4"/>',
  // el Gauchito Gil: la cruz
  penal: '<path d="M-2.2 -11H2.2V-4.5H8.5V-0.3H2.2V11H-2.2V-0.3H-8.5V-4.5H-2.2Z"/>',
  // el Luisón: la cabeza del lobizón
  esteros: '<path d="M-9 -11L-4 -5H4L9 -11L8.5 -1C8.5 5 4 9 0 11C-4 9 -8.5 5 -8.5 -1Z"/><path d="M-4.5 -1L-2 0.5M4.5 -1L2 0.5" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>',
  // Francisco: la llama del Infierno de la torre
  torre: '<path d="M0 -11C5 -5 8 -1 7 4C6 10 -6 10 -7 4C-8 -0.5 -4 -3 -2 -7C-1 -3 1 -2 1 0.5C3 -3 2 -7 0 -11Z"/>',
  // el Chiquitijuein: el gorro de duende con su pompón
  castillo: '<path d="M1 -8L8.5 6H-8.5Z"/><circle cx="1.5" cy="-9" r="2.4"/><rect x="-10.5" y="6" width="21" height="3.4" rx="1.2"/>',
};
const CROWN = '<path d="M3 18 L4.6 7.5 L9 12 L12 4.5 L15 12 L19.4 7.5 L21 18 Z"/><rect x="3" y="19.2" width="18" height="2.2"/>';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export function clearRushOver(s) {
  s.querySelector('.mdu-ovr')?.remove();
  s.querySelector('.mdu-ovr-bosses')?.remove();
  s.classList.remove('mdu-over--rush', 'is-rwon', 'is-rlost');
}

// bosses: [{ map, boss }] en el orden en que salieron; beaten: cuántos cayeron.
export function rushOver(s, { won = false, title = '', kick = '', bosses = [], beaten = 0 } = {}) {
  clearRushOver(s);
  s.classList.add('mdu-over--rush', won ? 'is-rwon' : 'is-rlost');
  const sparks = Array.from({ length: 22 }, (_, i) => `<i style="--x:${((i * 37) % 100) + Math.random() * 3}%;--d:${(i * 0.53) % 7}s;--t:${5 + (i % 5)}s;--s:${0.6 + (i % 3) * 0.35}"></i>`).join('');
  const deco = h(`<div class="mdu-ovr" aria-hidden="true">
      <i class="mdu-ovr__glow"></i><i class="mdu-ovr__rays"></i>
      <svg class="mdu-ovr__crown" viewBox="0 0 24 24">${CROWN}</svg>
      <div class="mdu-ovr__sparks">${sparks}</div>
      <i class="mdu-ovr__shade"></i>
    </div>`);
  s.prepend(deco);
  // el título: arriba chiquito qué fue; abajo, letra por letra
  const h2 = s.querySelector('.mdu-h2');
  h2.innerHTML = `<span class="mdu-ovr__kick">${kick}</span><span class="mdu-ovr__title">${[...title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</span>`;
  // los jefes, en orden: los que cayeron con el tajo, el que te tumbó en rojo
  const row = h(`<div class="mdu-ovr-bosses">${bosses
    .map((b, i) => {
      const st = i < beaten ? 'is-down' : i === beaten && !won ? 'is-killer' : 'is-far';
      return `<span class="mdu-ovr-b ${st}" style="--i:${i}"><span class="mdu-ovr-b__m"><svg viewBox="-12 -12 24 24" fill="currentColor">${GLYPH[b.map] || ''}</svg><i class="mdu-ovr-b__cut"></i></span><small>${b.boss.replace(/^El /, '')}</small></span>`;
    })
    .join('')}</div>`);
  s.querySelector('[data-survived]').after(row);
  // los números, de a un renglón y contando desde cero
  const stats = s.querySelector('[data-stats]');
  [...stats.children].forEach((el, i) => el.style.setProperty('--i', String(i >> 1)));
  countUp(stats, s);
}
