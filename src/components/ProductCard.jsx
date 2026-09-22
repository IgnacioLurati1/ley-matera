import { useUI } from '../context/UIContext';
import { money } from '../lib/format';
import { unitPrice } from '../lib/pricing';
import { PRODUCT_SIZES } from '../lib/media';
import { PlusIcon } from './Icons';
import ProductImage from './ProductImage';
import FramedImage from './FramedImage';
import { stockInfo, useAddToCart } from './ProductDetail';
import './ProductCard.css';

// `frame` (sólo en la vista previa del admin) muestra la foto con el encuadre elegido.
// Tocar la tarjeta abre la ficha con la descripción; sin stock se puede reservar.
export default function ProductCard({ product, promoId = null, promoPrice = null, preview = false, frame = null, style }) {
  const addToCart = useAddToCart(product, promoId);
  const { openProduct } = useUI();
  // Precio final: el de la promo, o el del producto con su descuento.
  const finalPrice = unitPrice(product, promoPrice);
  const hasDiscount = finalPrice < product.price;
  const off = hasDiscount ? Math.round((1 - finalPrice / product.price) * 100) : 0;

  const { stock, soldOut, lowStock } = stockInfo(product);
  const title = product.title || 'Título del producto';

  const onAdd = (e) => {
    e.stopPropagation();
    if (!preview) addToCart();
  };

  return (
    <article className={`pcard ${soldOut ? 'is-soldout' : ''}`} style={style}>
      <div className="pcard__media">
        {frame?.src ? (
          <div className="pimg pcard__img">
            <FramedImage frame={frame} alt={product.title} variants={PRODUCT_SIZES} />
          </div>
        ) : (
          <ProductImage src={product.image} alt={product.title} className="pcard__img" />
        )}
        {hasDiscount && <span className="badge pcard__off">-{off}%</span>}
        {soldOut && <span className="pcard__stock pcard__stock--out">Sin stock</span>}
        {lowStock && <span className="pcard__stock">{stock === 1 ? 'Última unidad' : `Últimas ${stock}`}</span>}
      </div>
      <div className="pcard__body">
        <h3 className="pcard__title">
          {preview ? (
            title
          ) : (
            <button type="button" className="pcard__open" onClick={() => openProduct(product, promoId, promoPrice)}>
              {title}
            </button>
          )}
        </h3>
        <div className="pcard__prices">
          {hasDiscount ? (
            <>
              <strong className="pcard__price">{money(finalPrice)}</strong>
              <s className="pcard__old">{money(product.price)}</s>
            </>
          ) : (
            <strong className="pcard__price">{money(product.price)}</strong>
          )}
        </div>
      </div>
      <button
        className="pcard__add"
        onClick={onAdd}
        aria-label={soldOut ? `Reservar ${product.title} (sin stock)` : `Agregar ${product.title} al carrito`}
      >
        <PlusIcon size={18} /> <span>{soldOut ? 'Reservarlo' : 'Agregar'}</span>
      </button>
    </article>
  );
}

export function ProductSkeleton() {
  return (
    <div className="pcard pcard--skeleton" aria-hidden>
      <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
      <div className="pcard__body">
        <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 22, width: '40%' }} />
      </div>
    </div>
  );
}
