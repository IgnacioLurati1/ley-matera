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
  veil.textContent = 'Cargando…';
  veil.style.cssText =
    'position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:#000;color:#b3120f;font:24px "Courier New",monospace;letter-spacing:2px';
  document.body.appendChild(veil);
  // el punto de encuentro para las salas viaja aparte, así el juego sigue
  // siendo portable a cualquier sitio (sin Supabase funciona igual, con
  // códigos largos de copiar y pegar)
  opening = Promise.all([original ? import('../easter-egg-original/index.js') : import('../easter-egg/index.js'), import('./netSignal.js')])
    .then(([m, s]) => {
      // el juego ya muestra su propia pantalla de carga con la barra: el
      // velo solo tapa la descarga del código
      veil.remove();
      let signal = s.createSignal();
      if (signal && original) {
        const inner = signal;
        signal = { open: (code, on) => inner.open(`o${code}`, on), send: (msg) => inner.send(msg), close: () => inner.close() };
      }
      return m.launch({ signal, onExit });
    })
    .catch(() => {
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
