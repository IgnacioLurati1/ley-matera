// El juego solo, sin la tienda: la misma launch() que abre /sotano en la web,
// con el mismo punto de encuentro de las salas (Supabase), así en línea se
// juntan la versión de escritorio y la web.
import { launch } from '../src/easter-egg/index.js';
import { createSignal } from '../src/lib/netSignal.js';

const q = new URLSearchParams(location.search);

// los atajos de prueba del juego (Alt+I las escenas, Alt+K…: core/devKeys),
// prendidos en la versión de escritorio (el usuario, 2026-10-03)
globalThis.__mduDevKeys = true;

// (pruebas: el proceso principal pasa ajustes con MDU_TEST_SETTINGS)
if (q.has('set')) {
  try {
    const k = 'lm-zombies-settings';
    const s = JSON.parse(localStorage.getItem(k) || '{}') || {};
    localStorage.setItem(k, JSON.stringify({ ...s, ...JSON.parse(q.get('set')) }));
  } catch {
    /* sin ajustes de prueba */
  }
}

// launch() agrega la hoja de Google Fonts si no hay un <link> con esa misma
// dirección; las fuentes ya están en ./fonts, así que se le deja uno que no
// descarga nada (rel distinto de stylesheet) con la dirección que busca.
const FONTS = __MDU_FONTS__;
const mark = document.createElement('link');
mark.rel = 'x-mdu-fonts-local';
mark.setAttribute('href', FONTS);
document.head.appendChild(mark);

// (pruebas: cuándo llegó al título, en hora del reloj: performance.timeOrigin + esto)
if (q.has('test')) {
  const tick = setInterval(() => {
    if (window.g?.state !== 'title') return;
    window.__tTitle = performance.now();
    clearInterval(tick);
  }, 20);
}
// El vsync de las opciones (Generales): se guarda para el próximo arranque
// (desktop/main.cjs lo lee antes de abrir la ventana)
window.__mduDesktop = {
  setVsync: (on) => fetch(`/__desktop/vsync?on=${on ? 1 : 0}`, { method: 'POST' }).catch(() => {}),
};

// Lo que en escritorio no va: la versión original (es otra página de la web) se
// esconde, y salir no vuelve a ninguna tienda: cierra el juego.
const css = document.createElement('style');
css.textContent = '.mdu-btn[data-act="original"]{display:none!important}';
document.head.appendChild(css);
const r = await launch({ signal: createSignal(), onExit: () => window.close() });
for (const b of document.querySelectorAll('.mdu-btn[data-act="exit"]')) b.textContent = 'Salir del juego';
if (q.has('test')) window.g = r?.game;
