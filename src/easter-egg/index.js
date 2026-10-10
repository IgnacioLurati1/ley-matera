// (primero: prende el switch de Eclipse Matero, el mapa en obra, si corresponde)
import './core/eclipseFlag';
import './ui/style.css';
import './ui/hudThemes.css';
import Game from './Game';
import { playStudioLogo, studioLogoWanted } from './ui/StudioLogo';
import { softCanvas } from './core/softCanvas';

// Punto de entrada del juego oculto. Es independiente de React: monta todo en
// un contenedor propio encima de la página y lo desarma al salir, así se puede
// reutilizar en cualquier otro sitio con `launch()`.

// Creepster y Special Elite para todo; Rye (La Tapera), Stardos Stencil (el
// penal) y Cinzel (la torre) para el HUD de cada mapa.
const FONTS = 'https://fonts.googleapis.com/css2?family=Creepster&family=Special+Elite&family=Rye&family=Stardos+Stencil:wght@400;700&family=Cinzel:wght@500;700;900&family=UnifrakturMaguntia&family=Kaushan+Script&display=swap';
let running = null;

// logo: el logo de Luta Studios ya andando (ui/StudioLogo: lo abre el sitio
// antes de bajar el juego); si no viene, lo abre launch.
export async function launch({ onExit, signal, logo = null } = {}) {
  if (running) return running;
  if (!logo && studioLogoWanted()) logo = playStudioLogo();
  if (!document.querySelector(`link[href="${FONTS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS;
    document.head.appendChild(link);
  }
  const root = document.createElement('div');
  root.className = 'mdu-root';
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Mate der Untoten');
  document.body.appendChild(root);
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  const close = () => {
    logo?.remove();
    root.remove();
    document.documentElement.style.overflow = prevOverflow;
    running = null;
    onExit?.();
  };

  if (!supported(logo)) {
    root.innerHTML = `<div class="mdu-loading"><div><div class="mdu-title" style="font-size:56px">Mate der Untoten</div>
      <p class="mdu-tag" style="max-width:420px;margin:16px auto">Este juego necesita teclado, mouse y WebGL 2. Probalo desde una computadora.</p>
      <button class="mdu-btn" data-close>Volver a la tienda</button></div></div>`;
    root.querySelector('[data-close]').addEventListener('click', () => close());
    running = { close };
    return running;
  }
  const game = new Game(root, { onExit: close, signal, logo });
  // en desarrollo queda a mano para depurar desde la consola
  if (import.meta.env.DEV) window.__mdu = game;
  running = { game, close: () => game.exit() };
  // la carga pesada arranca con el logo ya en pantalla (sus animaciones
  // corren en el compositor: no se traban mientras carga) y, mientras dure,
  // los lienzos 2D se pintan por software para no ocuparle la placa
  // (core/softCanvas; globalThis.__mduHardCanvas: como antes)
  if (logo && globalThis.__mduHardCanvas !== true) logo.done.then(softCanvas());
  // (y el grano de película espera a que el logo se vaya: ui/studioLogo.css)
  if (logo) {
    root.classList.add('is-logo');
    logo.done.then(() => root.classList.remove('is-logo'));
  }
  await logo?.started;
  try {
    await game.init();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="mdu-loading"><div><p class="mdu-tag">No se pudo iniciar el juego en este navegador.</p><button class="mdu-btn" data-close>Volver a la tienda</button></div></div>`;
    root.querySelector('[data-close]').addEventListener('click', () => close());
  }
  return running;
}

function supported(logo) {
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches;
  if (touchOnly) return false;
  // (el logo ya creó el lienzo del juego con WebGL 2: no hace falta otro de prueba)
  if (logo?.canvas) return true;
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
