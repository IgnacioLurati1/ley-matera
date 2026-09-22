import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useData } from '../context/DataContext';
import { money } from '../lib/format';
import QtyStepper from '../components/QtyStepper';
import ProductImage from '../components/ProductImage';
import ProductCard, { ProductSkeleton } from '../components/ProductCard';
import { TrashIcon, WhatsAppIcon } from '../components/Icons';
import { categoryLabel } from '../config/categories';
import './CartPage.css';

// Recomendados: primero destacados que no estén en el carrito, después
// productos de las mismas categorías de lo que ya eligió.
function useRecommendations(lines, limit = 4) {
  const { products, settings } = useData();
  return useMemo(() => {
    const inCart = new Set(lines.map((l) => l.productId));
    const cats = new Set(lines.map((l) => l.product.category.split('/')[0]));
    const featured = (settings?.featured ?? []).filter((id) => !inCart.has(id));
    const pool = products.filter((p) => !inCart.has(p.id));
    const score = (p) => (featured.includes(p.id) ? 2 : 0) + (cats.has(p.category.split('/')[0]) ? 0 : 1); // complementar
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, limit);
  }, [lines, products, settings, limit]);
}

export default function CartPage() {
  const { lines, total, count, setQty, remove, clear, orderLink, code } = useCart();
  const { loading } = useData();
  const recs = useRecommendations(lines);

  return (
    <div className="container cartpage">
      <header className="cartpage__head">
        <h1>Tu carrito</h1>
      </header>

      <div className="cartpage__layout">
        <aside className="cartpage__recs">
          <h2>¿Le sumás algo más?</h2>
          <p>Cosas que suelen ir juntas en una buena ronda.</p>
          <div className="cartpage__recs-grid">
            {loading
              ? Array.from({ length: 4 }, (_, i) => <ProductSkeleton key={i} />)
              : recs.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </aside>

        <section className="cartpage__main">
          {loading ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : lines.length === 0 ? (
            <div className="empty-state cartpage__empty">
              <h3>Tu carrito está vacío</h3>
              <p>Date una vuelta por el catálogo y elegí tu próximo compañero de mates.</p>
              <Link to="/catalogo" className="btn">
                Ir al catálogo
              </Link>
            </div>
          ) : (
            <>
              <ul className="cartpage__list">
                {lines.map((l) => (
                  <li key={l.key} className="cartline">
                    <ProductImage src={l.product.image} alt={l.product.title} className="cartline__img" />
                    <div className="cartline__info">
                      <strong>{l.product.title}</strong>
                      <span className="cartline__cat">
                        {l.promo ? `Promo “${l.promo.title}”` : categoryLabel(l.product.category)}
                      </span>
                      <span className="cartline__unit">
                        {money(l.unit)} c/u
                        {l.unit < l.product.price && <s> {money(l.product.price)}</s>}
                      </span>
                      {l.soldOut && <span className="cartline__reserve">Sin stock: lo pedís como reserva</span>}
                      {l.atMax && <span className="cartline__warn">No hay más unidades disponibles</span>}
                    </div>
                    <QtyStepper value={l.qty} onChange={(q) => setQty(l.key, q)} />
                    <strong className="cartline__sub">{money(l.subtotal)}</strong>
                    <button
                      className="icon-btn cartline__del"
                      onClick={() => remove(l.key)}
                      aria-label={`Eliminar ${l.product.title}`}
                    >
                      <TrashIcon size={19} />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="cartpage__summary">
                <div className="cartpage__total">
                  <span>
                    Total ({count} {count === 1 ? 'producto' : 'productos'})
                  </span>
                  <strong>{money(total)}</strong>
                </div>
                <a
                  className="btn btn--whatsapp btn--block cartpage__order"
                  href={orderLink()}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppIcon size={22} /> Solicitar productos
                </a>
                <p className="cartpage__note">
                  Se abre WhatsApp con tu pedido listo para enviar. Te confirmamos el precio final por ahí. Tu
                  código de pedido es <code>{code}</code>
                </p>
                <button className="btn btn--sm btn--ghost cartpage__clear" onClick={clear}>
                  Vaciar carrito
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
