// Contenido editable desde Admin → Editar (se guarda en settings).

// Foto de siempre del hero, en dos medidas (-1920 / -960) como las subidas.
const DEFAULT_HERO_IMAGE = '/assets/brand/hero-1920.webp';
// Versiones anteriores guardaban esta ruta.
const LEGACY_HERO_IMAGE = '/assets/brand/hero.webp';

export const DEFAULT_HERO = {
  title: 'Ley Matera',
  text: 'Descubrí mates, bombillas y accesorios elegidos con dedicación, para que cada mate sea una excusa para juntarse.',
  image: DEFAULT_HERO_IMAGE,
  // Copia diminuta (32 px) que se muestra difuminada mientras carga la foto.
  placeholder: 'data:image/webp;base64,UklGRswAAABXRUJQVlA4IMAAAAAwBQCdASogABYAPrlInkunJCMht+gA4BcJYgCxHoAETXyQwfu3gDiIRSEdBdDQNbcFEAD3cvzMoqbOADsgapGCp11u4CB5D7P1w6PN+68qGPuNdJl9d10/J0GMzRdI9gzdbwylbdruIzN7ybaTBIapp60vtMMWsqogwUPOUpd2HK/fga0TuyCHzVoBIuDyLQYB9NlkLGi3iJVyLJHHuNAlN0HVGKk8Wd5fun+cvITWZdfSQMJxK4SPaSfoCfgAAAA=',
  posY: null, // encuadre vertical en % (null = el de siempre)
};

// Hero guardado + valores por defecto. Si la foto es la de siempre, usa su
// copia difuminada; si es una subida vieja sin copia, no hay difuminado.
export const heroFrom = (saved) => {
  const hero = { ...DEFAULT_HERO, ...saved };
  if (hero.image === LEGACY_HERO_IMAGE) hero.image = DEFAULT_HERO_IMAGE;
  if (hero.image === DEFAULT_HERO_IMAGE) hero.placeholder = DEFAULT_HERO.placeholder;
  else if (!saved?.placeholder) hero.placeholder = null;
  return hero;
};

export const DEFAULT_ABOUT_IMAGE = '/assets/brand/conocenos.webp';
