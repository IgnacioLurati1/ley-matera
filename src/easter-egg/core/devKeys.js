// Los atajos de prueba (Alt+I las escenas, Alt+K, Alt+G…): en el servidor de
// desarrollo y en la versión de escritorio, que los prende con
// globalThis.__mduDevKeys (desktop/entry.js; el usuario, 2026-10-03). En el
// sitio publicado, no.
export const devKeys = () => !!import.meta.env.DEV || globalThis.__mduDevKeys === true;
