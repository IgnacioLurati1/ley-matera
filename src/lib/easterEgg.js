// Abre el juego oculto. El juego (three.js incluido) vive en un chunk aparte
// que solo se descarga cuando alguien escribe "easter egg" en el buscador.
// Corre en su propia página (/sotano, ver pages/Sotano.jsx), nunca encima del
// inicio: así el uso fuerte de placa y procesador queda en otra dirección.

let opening = null;

// original: la primera versión del juego (src/easter-egg-original), con sus
// salas en línea aparte (el código de sala lleva una "o" adelante en el canal).
export function openEasterEgg({ onExit, original = false } = {}) {
  if (opening) return opening;
  const veil = document.createElement('div');
  veil.style.cssText =
    'position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:#000;color:#b3120f;font:24px "Courier New",monospace;letter-spacing:2px';
  document.body.appendChild(veil);
  // el juego nuevo abre con el logo de Luta Studios: es lo primero que se ve
  // (un pedazo chico aparte, easter-egg/ui/StudioLogo) y el juego baja y
  // carga detrás. El original, con su "Cargando…" de siempre.
  if (original) veil.textContent = 'Cargando…';
  const logo = original
    ? null
    : import('../easter-egg/ui/StudioLogo.js')
        .then((m) => m.playStudioLogo())
        .catch(() => {
          veil.textContent = 'Cargando…';
          return null;
        });
  // el punto de encuentro para las salas viaja aparte, así el juego sigue
  // siendo portable a cualquier sitio (sin Supabase funciona igual, con
  // códigos largos de copiar y pegar)
  opening = Promise.all([original ? import('../easter-egg-original/index.js') : import('../easter-egg/index.js'), import('./netSignal.js'), logo])
    .then(([m, s, lg]) => {
      // el juego ya muestra su propia pantalla de carga con la barra: el
      // velo solo tapa la descarga del código
      veil.remove();
      let signal = s.createSignal();
      if (signal && original) {
        const inner = signal;
        signal = { open: (code, on) => inner.open(`o${code}`, on), send: (msg) => inner.send(msg), close: () => inner.close() };
      }
      return original ? m.launch({ signal, onExit }) : m.launch({ signal, onExit, logo: lg });
    })
    .catch(() => {
      logo?.then((lg) => lg?.remove());
      document.body.appendChild(veil);
      veil.textContent = 'No se pudo cargar. Probá de nuevo.';
      return new Promise((r) => setTimeout(r, 1800));
    })
    .finally(() => {
      veil.remove();
      opening = null;
    });
  return opening;
}
