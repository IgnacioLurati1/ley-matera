// El sitio puede publicarse dentro de una carpeta (GitHub Pages:
// /ley-matera/). Las rutas propias ("/assets/…", "/data/…") se guardan sin esa
// carpeta y se completan acá; las URLs externas (Supabase) quedan igual.
export const assetUrl = (u) =>
  typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? `${import.meta.env.BASE_URL}${u.slice(1)}` : u;
