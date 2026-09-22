import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { local } from '../lib/storage';
import { useData, isPromoLive } from './DataContext';
import { encodeOrder } from '../lib/orderCode';
import { unitPrice } from '../lib/pricing';
import { SITE, whatsappLink } from '../config/site';

const CartContext = createContext(null);
const KEY = 'lm-cart';
const keyOf = (productId, promoId) => (promoId ? `${promoId}-${productId}` : productId);

export function CartProvider({ children }) {
  const { products, promos } = useData();
  // Guardamos sólo ids y cantidades: los precios siempre salen del catálogo actual.
  const [items, setItems] = useState(() => local.get(KEY, []));
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0); // dispara la animación del ícono

  useEffect(() => { local.set(KEY, items); }, [items]);

  // Stock de un producto (null = no se controla) y unidades que ya hay en el
  // carrito de ese producto, sumando las que vienen de promos.
  const stockOf = useCallback((productId) => products.find((p) => p.id === productId)?.stock ?? null, [products]);
  const inCartOf = (list, productId, exceptKey = null) =>
    list.filter((i) => i.productId === productId && keyOf(i.productId, i.promoId) !== exceptKey).reduce((n, i) => n + i.qty, 0);

  // Devuelve cuántas unidades se pudieron sumar (0 si no hay más stock).
  const add = useCallback(
    (productId, promoId = null, qty = 1) => {
      const stock = stockOf(productId);
      const room = stock == null ? qty : Math.max(0, Math.min(qty, stock - inCartOf(items, productId)));
      if (room <= 0) return 0;
      setItems((prev) => {
        const k = keyOf(productId, promoId);
        const found = prev.find((i) => keyOf(i.productId, i.promoId) === k);
        if (found) return prev.map((i) => (i === found ? { ...i, qty: i.qty + room } : i));
        return [...prev, { productId, promoId, qty: room }];
      });
      setBump((b) => b + 1);
      return room;
    },
    [items, stockOf],
  );

  const setQty = useCallback(
    (key, qty) => {
      setItems((prev) => {
        if (qty <= 0) return prev.filter((i) => keyOf(i.productId, i.promoId) !== key);
        const item = prev.find((i) => keyOf(i.productId, i.promoId) === key);
        const stock = item ? stockOf(item.productId) : null;
        const max = stock == null ? qty : Math.max(1, stock - inCartOf(prev, item.productId, key));
        return prev.map((i) => (keyOf(i.productId, i.promoId) === key ? { ...i, qty: Math.min(qty, max) } : i));
      });
    },
    [stockOf],
  );

  const remove = useCallback((key) => setQty(key, 0), [setQty]);
  const clear = useCallback(() => setItems([]), []);

  // Resuelve cada item contra el catálogo/promos actuales.
  const lines = useMemo(() => {
    const pMap = new Map(products.map((p) => [p.id, p]));
    const prMap = new Map(promos.map((p) => [p.id, p]));
    return items
      .map((i) => {
        const product = pMap.get(i.productId);
        if (!product) return null;
        const promo = i.promoId ? prMap.get(i.promoId) : null;
        const promoLive = promo && isPromoLive(promo);
        const promoItem = promoLive ? promo.items.find((x) => x.productId === i.productId) : null;
        const unit = unitPrice(product, promoItem?.promoPrice ?? null);
        const soldOut = product.stock === 0;
        return {
          soldOut,
          atMax: product.stock != null && i.qty >= product.stock,
          key: keyOf(i.productId, i.promoId),
          ...i,
          promoId: promoLive ? i.promoId : null,
          promo: promoLive ? promo : null,
          product,
          unit,
          subtotal: soldOut ? 0 : unit * i.qty,
        };
      })
      .filter(Boolean);
  }, [items, products, promos]);

  // Lo que se quedó sin stock después de agregarlo no entra en el pedido.
  const orderable = lines.filter((l) => !l.soldOut);
  const count = orderable.reduce((n, l) => n + l.qty, 0);
  const total = orderable.reduce((n, l) => n + l.subtotal, 0);
  // El código no lleva precios: el lector del admin los toma siempre del catálogo.
  const code = orderable.length ? encodeOrder(orderable) : '';

  // Mensaje para WhatsApp: sin precios (el cliente podría editarlos) y sin
  // emojis, que algunos WhatsApp no muestran bien al abrir desde el link.
  const buildMessage = useCallback(() => {
    const rows = orderable.map((l) => {
      const promo = l.promo ? ` - Promo "${l.promo.title}"` : '';
      return `- ${l.qty} x ${l.product.title} (${l.promoId ? `${l.promoId}-` : ''}${l.product.id})${promo}`;
    });
    return [
      `¡Hola ${SITE.name}! Quiero hacer este pedido:`,
      '',
      ...rows,
      '',
      `Código de pedido: ${code}`,
      '',
      '¡Muchas gracias!',
    ].join('\n');
  }, [orderable, code]);

  const orderLink = useCallback(() => whatsappLink(buildMessage()), [buildMessage]);

  const value = useMemo(
    () => ({ items, lines, count, total, code, open, setOpen, add, setQty, remove, clear, bump, buildMessage, orderLink, stockOf }),
    [items, lines, count, total, code, open, add, setQty, remove, clear, bump, buildMessage, orderLink, stockOf],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
