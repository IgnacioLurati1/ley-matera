// Abre el juego oculto. El juego (three.js incluido) vive en un chunk aparte
// que solo se descarga cuando alguien escribe "nodeberiasveresto" en el buscador.

let opening = null;

export function openEasterEgg() {
  if (opening) return opening;
  const veil = document.createElement('div');
  veil.textContent = 'Cargando…';
  veil.style.cssText =
    'position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:#000;color:#b3120f;font:24px "Courier New",monospace;letter-spacing:2px';
  document.body.appendChild(veil);
  // el punto de encuentro para las salas viaja aparte, así el juego sigue
  // siendo portable a cualquier sitio (sin Supabase funciona igual, con
  // códigos largos de copiar y pegar)
  opening = Promise.all([import('../easter-egg/index.js'), import('./netSignal.js')])
    .then(([m, s]) => m.launch({ signal: s.createSignal() }))
    .catch(() => {
      veil.textContent = 'No se pudo cargar. Probá de nuevo.';
      return new Promise((r) => setTimeout(r, 1800));
    })
    .finally(() => {
      veil.remove();
      opening = null;
    });
  return opening;
}
