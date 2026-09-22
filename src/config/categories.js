// Árbol de categorías fijo. El "slug" de cada nodo se usa como path:
// ej. "mates/algarrobo/imperiales". Los productos guardan el path más específico.
export const CATEGORIES = [
  {
    slug: 'mates',
    name: 'Mates',
    children: [
      {
        slug: 'algarrobo',
        name: 'Algarrobo',
        children: [
          { slug: 'imperiales', name: 'Imperiales' },
          { slug: 'torpedos', name: 'Torpedos' },
        ],
      },
      {
        slug: 'calabaza',
        name: 'Calabaza',
        children: [
          { slug: 'imperiales', name: 'Imperiales' },
          { slug: 'torpedos', name: 'Torpedos' },
          { slug: 'con-base', name: 'Con base' },
        ],
      },
      { slug: 'camioneros', name: 'Camioneros' },
    ],
  },
  {
    slug: 'bombillas',
    name: 'Bombillas',
    children: [
      { slug: 'acero-inoxidable', name: 'Acero inoxidable' },
      { slug: 'bombillones', name: 'Bombillones' },
    ],
  },
  {
    slug: 'termos',
    name: 'Termos y Vasos',
    children: [
      { slug: 'media-manija', name: 'Media manija' },
      { slug: 'vasos-termicos', name: 'Vasos térmicos' },
    ],
  },
  {
    slug: 'canastas-y-bolsos',
    name: 'Canastas y Bolsos',
    children: [
      {
        slug: 'canastas',
        name: 'Canastas',
        children: [
          { slug: 'eco-cuero', name: 'Eco-cuero' },
          { slug: 'cuero', name: 'Cuero' },
        ],
      },
      { slug: 'morrales', name: 'Morrales' },
      { slug: 'porta-mates', name: 'Porta mates' },
    ],
  },
  { slug: 'combos', name: 'Combos' },
  { slug: 'grabados', name: 'Grabados' },
  { slug: 'otros', name: 'Otros productos' },
];

// Lista plana: [{ path, name, label, depth }]
export const FLAT_CATEGORIES = (() => {
  const out = [];
  const walk = (nodes, parentPath = '', parentLabel = '', depth = 0) => {
    nodes.forEach((n) => {
      const path = parentPath ? `${parentPath}/${n.slug}` : n.slug;
      const label = parentLabel ? `${parentLabel} › ${n.name}` : n.name;
      out.push({ path, name: n.name, label, depth, leaf: !n.children });
      if (n.children) walk(n.children, path, label, depth + 1);
    });
  };
  walk(CATEGORIES);
  return out;
})();

export const categoryLabel = (path) =>
  FLAT_CATEGORIES.find((c) => c.path === path)?.label ?? 'Sin categoría';

export const inCategory = (productPath, filterPath) =>
  !filterPath || productPath === filterPath || productPath?.startsWith(`${filterPath}/`);
