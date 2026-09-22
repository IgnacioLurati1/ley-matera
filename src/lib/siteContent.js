import { variantUrl } from './media';
import { assetUrl } from './assets';

// Contenido editable desde Admin → Editar (se guarda en settings).
export const DEFAULT_HERO = {
  title: 'Ley Matera',
  text: 'Descubrí mates, bombillas y accesorios elegidos con dedicación, para que cada mate sea una excusa para juntarse.',
  image: '/assets/brand/hero.webp',
  posY: null, // encuadre vertical en % (null = el de siempre)
};

// La foto del hero va por variables CSS: 1920 px en desktop y 960 px en celular.
// Mientras cargan los datos no se muestra ninguna, así no aparece la vieja y
// después cambia.
export const heroStyle = (hero) => {
  if (!hero) return { '--hero-img': 'none', '--hero-img-sm': 'none' };
  const url = (u) => `url("${assetUrl(u)}")`;
  return {
    '--hero-img': url(hero.image),
    '--hero-img-sm': url(variantUrl(hero.image, 960)),
    ...(hero.posY != null ? { '--hero-y': `${hero.posY}%`, '--hero-y-sm': `${hero.posY}%` } : {}),
  };
};

export const DEFAULT_ABOUT_IMAGE = '/assets/brand/conocenos.webp';
