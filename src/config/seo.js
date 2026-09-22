// Datos para buscadores. Lo usan el build (vite.config.js arma un HTML por
// página pública, con su descripción) y la app (<PageMeta>, al navegar).
// Sin imports: vite.config.js lo lee desde Node.

export const SITE_TITLE = 'Ley Matera';

// Páginas que Google puede indexar. `path` sin barra inicial ('' = inicio).
export const PUBLIC_PAGES = [
  {
    path: '',
    description:
      'Mates, bombillas, termos y accesorios materos en Rosario. Elegí tus productos y pedilos por WhatsApp a Ley Matera.',
    priority: '1.0',
  },
  {
    path: 'catalogo',
    description:
      'Catálogo de Ley Matera: mates imperiales, camioneros, de calabaza y algarrobo, bombillas, termos, canastas y combos. Envíos en Rosario.',
    priority: '0.9',
  },
  {
    path: 'conocenos',
    description: 'Conocé a Ley Matera, tienda de mates y accesorios de Rosario, Santa Fe.',
    priority: '0.6',
  },
];

