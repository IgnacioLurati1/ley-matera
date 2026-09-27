import './ui/style.css';
import Game from './Game';

// Punto de entrada del juego oculto. Es independiente de React: monta todo en
// un contenedor propio encima de la página y lo desarma al salir, así se puede
// reutilizar en cualquier otro sitio con `launch()`.

const FONTS = 'https://fonts.googleapis.com/css2?family=Creepster&family=Special+Elite&display=swap';
let running = null;

export async function launch({ onExit, signal } = {}) {
  if (running) return running;
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
    root.remove();
    document.documentElement.style.overflow = prevOverflow;
    running = null;
    onExit?.();
  };

  if (!supported()) {
    root.innerHTML = `<div class="mdu-loading"><div><div class="mdu-title" style="font-size:56px">Mate der Untoten</div>
      <p class="mdu-tag" style="max-width:420px;margin:16px auto">Este juego necesita teclado, mouse y WebGL 2. Probalo desde una computadora.</p>
      <button class="mdu-btn" data-close>Volver a la tienda</button></div></div>`;
    root.querySelector('[data-close]').addEventListener('click', () => close());
    running = { close };
    return running;
  }
  const game = new Game(root, { onExit: close, signal });
  // en desarrollo queda a mano para depurar desde la consola
  if (import.meta.env.DEV) window.__mdu = game;
  running = { game, close: () => game.exit() };
  try {
    await game.init();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="mdu-loading"><div><p class="mdu-tag">No se pudo iniciar el juego en este navegador.</p><button class="mdu-btn" data-close>Volver a la tienda</button></div></div>`;
    root.querySelector('[data-close]').addEventListener('click', () => close());
  }
  return running;
}

function supported() {
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches;
  if (touchOnly) return false;
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
