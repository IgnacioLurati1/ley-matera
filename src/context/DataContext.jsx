import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseProducts } from '../lib/csv';
import { todayISO } from '../lib/format';
import { BACKGROUND_SIZES, PRODUCT_SIZES, removeVariants, uploadVariants } from '../lib/media';
import { backgroundVariants, productVariants } from '../lib/image';
import { assetUrl } from '../lib/assets';
import { whatsappFrom, whatsappLink } from '../config/site';

// Fuente de datos de todo el sitio: Supabase (tablas products, promos, settings).
// Si no hay credenciales configuradas (.env), se leen los archivos de
// /public/data en modo sólo lectura, útil para desarrollar sin conexión.
const DataContext = createContext(null);

// --- Conversión entre columnas de la base (snake_case) y el front ---
const productFromRow = (r) => ({
  id: r.id,
  title: r.title,
  category: r.category,
  price: r.price,
  image: r.image,
  stock: r.stock ?? null,
  discount: r.discount ?? 0,
  description: r.description ?? '',
  createdAt: r.created_at,
});
const productToRow = (p) => ({
  title: p.title,
  category: p.category,
  price: p.price,
  image: p.image,
  ...(optional.stock ? { stock: p.stock ?? null } : {}),
  ...(optional.discount ? { discount: p.discount ?? 0 } : {}),
  ...(optional.description ? { description: (p.description ?? '').trim() } : {}),
});

const promoFromRow = (r) => ({
  id: r.id,
  title: r.title,
  headline: r.headline,
  message: r.message,
  endDate: r.end_date,
  active: r.active,
  background: r.background,
  decoration: r.decoration,
  textColor: r.text_color,
  shade: r.shade,
  items: r.items,
  position: r.position,
  createdAt: r.created_at,
});
const promoToRow = (p) => ({
  title: p.title,
  headline: p.headline ?? '',
  message: p.message ?? '',
  end_date: p.endDate || null,
  active: p.active !== false,
  background: p.background,
  decoration: p.decoration,
  text_color: p.textColor ?? '#ffffff',
  shade: p.shade ?? 1,
  items: p.items,
  position: p.position ?? 0,
});

// Columnas que se agregaron después (stock, descuento, descripción). Si alguna todavía no
// existe en la base (falta correr su migración en supabase/), el sitio sigue
// andando sin esa función.
const optional = { stock: true, discount: true, description: true };
const productCols = () =>
  ['id,title,category,price,image,created_at', ...Object.keys(optional).filter((k) => optional[k])].join(',');
const missingColumn = (e) =>
  e && (e.code === '42703' || e.code === 'PGRST204')
    ? Object.keys(optional).find((k) => optional[k] && (e.message ?? '').includes(k))
    : null;
const PROMO_COLS =
  'id,title,headline,message,end_date,active,background,decoration,text_color,shade,items,position,created_at';

async function loadFromSupabase() {
  let products = await supabase.from('products').select(productCols()).order('created_at', { ascending: false });
  for (let col = missingColumn(products.error); col; col = missingColumn(products.error)) {
    optional[col] = false;
    products = await supabase.from('products').select(productCols()).order('created_at', { ascending: false });
  }
  const [promos, settings] = await Promise.all([
    supabase.from('promos').select(PROMO_COLS).order('position').order('created_at'),
    supabase.from('settings').select('key,value'),
  ]);
  const error = products.error || promos.error || settings.error;
  if (error) throw error;
  return {
    products: products.data.map(productFromRow),
    promos: promos.data.map(promoFromRow),
    settings: Object.fromEntries(settings.data.map((s) => [s.key, s.value])),
  };
}

async function loadFromFiles() {
  const get = (u) => fetch(assetUrl(u)).then((r) => r.text());
  const [csv, promos, settings] = await Promise.all([
    get('/data/products.csv'),
    get('/data/promos.json'),
    get('/data/settings.json'),
  ]);
  return { products: parseProducts(csv), promos: JSON.parse(promos), settings: JSON.parse(settings) };
}

const ensure = ({ error, data }) => {
  if (error) throw error;
  return data;
};

export function DataProvider({ children }) {
  const [state, setState] = useState({ products: [], promos: [], settings: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (supabase ? loadFromSupabase() : loadFromFiles())
      .then(setState)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  const readOnly = !supabase;
  const guard = useCallback(() => {
    if (readOnly) throw new Error('Falta configurar Supabase (.env): el sitio está en modo sólo lectura.');
  }, [readOnly]);

  const actions = useMemo(
    () => ({
      // Guarda un producto. `frame` = encuadre de una foto nueva ({src,x,y,zoom}),
      // o null si la foto no cambió. Devuelve el producto guardado.
      saveProduct: async (product, frame = null) => {
        guard();
        let image = product.image;
        let saved = product.id
          ? product
          : productFromRow(
              ensure(
                await supabase
                  .from('products')
                  .insert(productToRow({ ...product, image: '' }))
                  .select(productCols())
                  .single(),
              ),
            );

        if (frame) {
          image = await uploadVariants('products', saved.id, await productVariants(frame.src, frame));
        }
        saved = productFromRow(
          ensure(
            await supabase
              .from('products')
              .update(productToRow({ ...product, image }))
              .eq('id', saved.id)
              .select(productCols())
              .single(),
          ),
        );
        const previous = product.id ? state.products.find((p) => p.id === product.id)?.image : null;
        if (frame && previous && previous !== image) removeVariants(previous, PRODUCT_SIZES);

        setState((s) => ({
          ...s,
          products: s.products.some((p) => p.id === saved.id)
            ? s.products.map((p) => (p.id === saved.id ? saved : p))
            : [saved, ...s.products],
        }));
        return saved;
      },

      deleteProduct: async (id) => {
        guard();
        const product = state.products.find((p) => p.id === id);
        ensure(await supabase.from('products').delete().eq('id', id));
        // Limpiamos referencias en destacados y promos.
        const featured = (state.settings?.featured ?? []).filter((f) => f !== id);
        await supabase.from('settings').upsert({ key: 'featured', value: featured });
        const touched = state.promos.filter((pr) => pr.items.some((i) => i.productId === id));
        await Promise.all(
          touched.map((pr) =>
            supabase
              .from('promos')
              .update({ items: pr.items.filter((i) => i.productId !== id) })
              .eq('id', pr.id),
          ),
        );
        if (product) removeVariants(product.image, PRODUCT_SIZES);
        setState((s) => ({
          ...s,
          products: s.products.filter((p) => p.id !== id),
          settings: { ...s.settings, featured },
          promos: s.promos.map((pr) => ({ ...pr, items: pr.items.filter((i) => i.productId !== id) })),
        }));
      },

      // Mueve el stock por una venta: sign = -1 descuenta, +1 devuelve.
      // Sólo toca productos que controlan stock (stock no vacío). Las unidades
      // que se vendieron sin stock (`reserved`) nunca salieron del stock.
      adjustStock: async (items, sign) => {
        guard();
        if (!optional.stock) return [];
        const qty = new Map();
        (items ?? []).forEach((i) => {
          const n = (i.qty || 1) - (i.reserved || 0);
          if (n > 0) qty.set(i.productId, (qty.get(i.productId) ?? 0) + n);
        });
        const changes = [...qty]
          .map(([id, n]) => {
            const p = state.products.find((x) => x.id === id);
            return p && p.stock != null ? { id, title: p.title, stock: Math.max(0, p.stock + sign * n) } : null;
          })
          .filter(Boolean);
        await Promise.all(
          changes.map(async (c) => ensure(await supabase.from('products').update({ stock: c.stock }).eq('id', c.id))),
        );
        const byId = new Map(changes.map((c) => [c.id, c.stock]));
        setState((s) => ({
          ...s,
          products: s.products.map((p) => (byId.has(p.id) ? { ...p, stock: byId.get(p.id) } : p)),
        }));
        return changes;
      },

      setFeatured: async (ids) => {
        guard();
        setState((s) => ({ ...s, settings: { ...s.settings, featured: ids } }));
        ensure(await supabase.from('settings').upsert({ key: 'featured', value: ids }));
      },

      updateSettings: async (patch) => {
        guard();
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
        ensure(await supabase.from('settings').upsert(Object.entries(patch).map(([key, value]) => ({ key, value }))));
      },

      // Si el fondo es una foto nueva (data URL) se sube en 1920 y 960 px.
      savePromo: async (promo) => {
        guard();
        let background = promo.background;
        const previous = promo.id ? state.promos.find((p) => p.id === promo.id)?.background?.src : null;
        if (background?.src?.startsWith('data:')) {
          const src = await uploadVariants('promos', promo.id ?? 'promo', await backgroundVariants(background.src));
          background = { ...background, src };
        }
        const row = promoToRow({
          ...promo,
          background,
          position: promo.id ? promo.position : state.promos.length,
        });
        const saved = promoFromRow(
          ensure(
            promo.id
              ? await supabase.from('promos').update(row).eq('id', promo.id).select(PROMO_COLS).single()
              : await supabase.from('promos').insert(row).select(PROMO_COLS).single(),
          ),
        );
        if (previous && previous !== saved.background?.src) removeVariants(previous, BACKGROUND_SIZES);
        setState((s) => ({
          ...s,
          promos: s.promos.some((p) => p.id === saved.id)
            ? s.promos.map((p) => (p.id === saved.id ? saved : p))
            : [...s.promos, saved],
        }));
        return saved;
      },

      deletePromo: async (id) => {
        guard();
        const promo = state.promos.find((p) => p.id === id);
        ensure(await supabase.from('promos').delete().eq('id', id));
        if (promo) removeVariants(promo.background?.src, BACKGROUND_SIZES);
        setState((s) => ({ ...s, promos: s.promos.filter((p) => p.id !== id) }));
      },
    }),
    [guard, state.products, state.promos, state.settings],
  );

  const value = useMemo(
    () => ({
      ...state,
      loading,
      error,
      readOnly,
      stockEnabled: readOnly || optional.stock,
      discountEnabled: readOnly || optional.discount,
      descriptionEnabled: readOnly || optional.description,
      ...actions,
    }),
    [state, loading, error, readOnly, actions],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

// Promos vigentes: activas y con fecha de fin hoy o posterior.
export const isPromoLive = (promo, today = todayISO()) =>
  promo.active !== false && (!promo.endDate || promo.endDate >= today);

export const useLivePromos = () => {
  const { promos } = useData();
  return useMemo(() => promos.filter((p) => isPromoLive(p)), [promos]);
};

// WhatsApp al que van el carrito, las consultas y las redes (editable en el admin).
export const useWhatsApp = () => {
  const { settings } = useData();
  const saved = settings?.whatsapp;
  return useMemo(() => {
    const { display, number } = whatsappFrom(saved);
    return { display, number, link: (text) => whatsappLink(text, number) };
  }, [saved]);
};

export const useProductMap = () => {
  const { products } = useData();
  return useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
};
