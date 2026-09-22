// "Super ID" del pedido. Codifica el carrito completo en un texto corto que
// el admin pega en el Lector de pedidos:
//   LM-P12x2.PR1-P3.P7
//   └┬┘ └─┬──┘ └──┬──┘ └┬┘
//  prefijo  2×P12  P3 dentro   P7
//                 de promo PR1
// La cantidad 1 se omite. No lleva precios a propósito: el lector los toma
// siempre del catálogo, así que editar el mensaje no cambia lo que se cobra.
// (Códigos viejos con "/total" al final se siguen leyendo.)

const TOKEN = /^(?:(PR\d+)-)?(P\d+)(?:x(\d+))?$/i;
export const CODE_REGEX = /LM-[A-Z0-9.x-]+(?:\/\d+)?/gi;

export const encodeOrder = (items) =>
  `LM-${items
    .map((i) => `${i.promoId ? `${i.promoId}-` : ''}${i.productId}${i.qty > 1 ? `x${i.qty}` : ''}`)
    .join('.')}`;

export const decodeOrder = (code) => {
  const clean = code.trim().replace(/^LM-/i, '');
  const [body, totalRaw] = clean.split('/');
  const items = [];
  const invalid = [];
  body
    .split('.')
    .filter(Boolean)
    .forEach((tok) => {
      const m = tok.match(TOKEN);
      if (!m) return invalid.push(tok);
      items.push({
        promoId: m[1]?.toUpperCase() ?? null,
        productId: m[2].toUpperCase(),
        qty: Number(m[3] ?? 1),
      });
    });
  return { items, total: totalRaw ? Number(totalRaw) : null, invalid };
};

// Extrae todos los códigos de un texto pegado (ej. el mensaje entero de WhatsApp).
export const findCodes = (text) => [...new Set(text.match(CODE_REGEX) ?? [])];

// Si no hay código LM, intenta leer ids sueltos: "P3 x2, PR1-P7, P10".
export const parseLooseIds = (text) => {
  const found = [...text.matchAll(/(?:(PR\d+)-)?\b(P\d+)\b(?:\s*[x×*]\s*(\d+))?/gi)];
  return found.map((m) => ({
    promoId: m[1]?.toUpperCase() ?? null,
    productId: m[2].toUpperCase(),
    qty: Number(m[3] ?? 1),
  }));
};
