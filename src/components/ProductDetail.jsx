import { useRef, useState } from 'react';
import { useCart } from '../context/CartContext';
import { productPhotos } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { categoryLabel } from '../config/categories';
import { money } from '../lib/format';
import { unitPrice } from '../lib/pricing';
import { ChevronLeft, ChevronRight, PlusIcon } from './Icons';
import Modal from './Modal';
import ProductImage from './ProductImage';
import './ProductDetail.css';

// Estado de stock para mostrar: sin stock se puede pedir igual, como reserva.
export const stockInfo = (product) => {
  const stock = product.stock ?? null;
  return { stock, soldOut: stock === 0, lowStock: stock != null && stock > 0 && stock <= 3 };
};

// Suma el producto al carrito y avisa. Devuelve true si entró.
export function useAddToCart(product, promoId = null) {
  const { add } = useCart();
  const { toast } = useUI();
  const { soldOut } = stockInfo(product);
  return () => {
    if (add(product.id, promoId)) {
      toast(soldOut ? `Sumaste “${product.title}” como reserva` : `Sumaste “${product.title}” al carrito`);
      return true;
    }
    toast(`No hay más stock de “${product.title}”`, 'error');
    return false;
  };
}

// Fotos de la ficha: la grande con flechas (o deslizando en el celu) y las
// miniaturas abajo. Con una sola foto se ve como siempre.
function Gallery({ product, badge }) {
  const photos = productPhotos(product);
  const [index, setIndex] = useState(0);
  const touchX = useRef(null);
  const n = photos.length;
  const i = Math.min(index, Math.max(0, n - 1));
  const go = (d) => setIndex((i + d + n) % n);

  return (
    <div className="pdetail__media">
      <div
        className="pdetail__stage"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
          touchX.current = null;
          if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <ProductImage
          src={photos[i] ?? ''}
          alt={n > 1 ? `${product.title} (foto ${i + 1} de ${n})` : product.title}
          className="pdetail__img"
          sizes="(max-width: 720px) 90vw, 400px"
        />
        {badge}
        {n > 1 && (
          <>
            <button type="button" className="pdetail__nav pdetail__nav--prev" onClick={() => go(-1)} aria-label="Foto anterior">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="pdetail__nav pdetail__nav--next" onClick={() => go(1)} aria-label="Foto siguiente">
              <ChevronRight size={20} />
            </button>
            <span className="pdetail__count">
              {i + 1} / {n}
            </span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="pdetail__thumbs">
          {photos.map((src, k) => (
            <button
              type="button"
              key={src}
              className={`pdetail__thumb ${k === i ? 'is-on' : ''}`}
              onClick={() => setIndex(k)}
              aria-label={`Ver foto ${k + 1}`}
              aria-current={k === i}
            >
              <ProductImage src={src} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Ficha completa de un producto: fotos, precio, stock y descripción.
export default function ProductDetail({ product, promoId = null, promoPrice = null, open, onClose }) {
  const addToCart = useAddToCart(product, promoId);
  const finalPrice = unitPrice(product, promoPrice);
  const hasDiscount = finalPrice < product.price;
  const off = hasDiscount ? Math.round((1 - finalPrice / product.price) * 100) : 0;
  const { stock, soldOut, lowStock } = stockInfo(product);
  const description = product.description?.trim();

  return (
    <Modal open={open} onClose={onClose} title={product.title} size="lg">
      <div className="pdetail">
        <Gallery product={product} badge={hasDiscount && <span className="badge pdetail__off">-{off}%</span>} />

        <div className="pdetail__info">
          <p className="pdetail__cat">{categoryLabel(product.category)}</p>
          <div className="pdetail__prices">
            <strong className="pdetail__price">{money(finalPrice)}</strong>
            {hasDiscount && <s className="pdetail__old">{money(product.price)}</s>}
          </div>
          {soldOut ? (
            <p className="pdetail__stock pdetail__stock--out">
              Sin stock por ahora. Podés reservarlo y lo coordinamos por WhatsApp.
            </p>
          ) : lowStock ? (
            <p className="pdetail__stock">{stock === 1 ? 'Queda la última unidad' : `Quedan ${stock} unidades`}</p>
          ) : null}

          {description && <p className="pdetail__desc">{description}</p>}

          <button
            className={`btn btn--block pdetail__add ${soldOut ? 'btn--accent' : ''}`}
            onClick={() => addToCart() && onClose()}
          >
            <PlusIcon size={18} /> {soldOut ? 'Reservarlo' : 'Agregar al carrito'}
          </button>
          <p className="pdetail__code">Código del producto: {product.id}</p>
        </div>
      </div>
    </Modal>
  );
}
