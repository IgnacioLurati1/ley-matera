import Papa from 'papaparse';

const PRODUCT_FIELDS = ['id', 'title', 'category', 'price', 'image', 'images', 'description', 'createdAt'];

export const parseProducts = (text) =>
  Papa.parse(text.trim(), { header: true, skipEmptyLines: true }).data.map((r) => ({
    id: String(r.id).trim(),
    title: r.title?.trim() ?? '',
    category: r.category?.trim() ?? 'otros',
    price: Number(r.price) || 0,
    image: r.image?.trim() ?? '',
    // Fotos extra separadas con "|".
    images: (r.images ?? '').split('|').map((u) => u.trim()).filter(Boolean),
    description: r.description?.trim() ?? '',
    createdAt: r.createdAt?.trim() ?? '',
  }));

export const serializeProducts = (products) =>
  Papa.unparse(
    products.map((p) =>
      Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, f === 'images' ? (p.images ?? []).join('|') : (p[f] ?? '')])),
    ),
    { columns: PRODUCT_FIELDS },
  );
