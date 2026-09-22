import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';
import { categoryLabel } from '../config/categories';
import { money } from '../lib/format';
import { unitPrice } from '../lib/pricing';
import { PlusIcon } from './Icons';
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

// Ficha completa de un producto: foto grande, precio, stock y descripción.
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
        <div className="pdetail__media">
          <ProductImage
            src={product.image}
            alt={product.title}
            className="pdetail__img"
            sizes="(max-width: 720px) 90vw, 400px"
          />
          {hasDiscount && <span className="badge pdetail__off">-{off}%</span>}
        </div>

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
