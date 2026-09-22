// Precio de venta de un producto: aplica su descuento (%) si tiene.
export const salePrice = (product) =>
  product.discount > 0 ? Math.round((product.price * (100 - product.discount)) / 100) : product.price;

// Precio final dentro del carrito: el precio de la promo manda; si no hay,
// el precio con descuento del producto.
export const unitPrice = (product, promoPrice = null) => promoPrice ?? salePrice(product);
