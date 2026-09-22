import { Link, useParams } from 'react-router-dom';
import { isPromoLive, useData, useProductMap } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import PromoDecoration from '../components/PromoDecoration';
import FramedImage from '../components/FramedImage';
import ProductCard, { ProductSkeleton } from '../components/ProductCard';
import { formatDate, todayISO } from '../lib/format';
import { ArrowLeft, ClockIcon } from '../components/Icons';
import '../components/Promo.css';
import './PromoPage.css';

const daysLeft = (endDate) => {
  if (!endDate) return null;
  const [y, m, d] = endDate.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59);
  return Math.max(0, Math.ceil((end - new Date()) / 86_400_000));
};

// Vista completa de una promo. También la usa el editor del admin como preview.
export function PromoView({ promo, preview = false }) {
  const pMap = useProductMap();
  const items = promo.items.map((i) => ({ ...i, product: pMap.get(i.productId) })).filter((i) => i.product);
  const left = daysLeft(promo.endDate);

  return (
    <div className="promo-page">
      <section className="promo-hero" style={{ color: promo.textColor || '#fff' }}>
        <div className="promo-hero__bg">
          <FramedImage frame={promo.background} />
        </div>
        <div className="promo-hero__shade" style={{ opacity: promo.shade ?? 1 }} />
        <PromoDecoration type={promo.decoration?.type} color={promo.decoration?.color} />
        <div className="promo-hero__content">
          <span className="promo-banner__tag">Promo</span>
          <h1>{promo.headline || promo.title || 'Título de la promo'}</h1>
          {promo.message && <p>{promo.message}</p>}
          {promo.endDate && (
            <div className="promo-hero__timer">
              <ClockIcon size={18} />
              {left === 0 ? '¡Último día!' : `Quedan ${left} ${left === 1 ? 'día' : 'días'}`} · hasta el {formatDate(promo.endDate)}
            </div>
          )}
        </div>
      </section>

      <section className="container promo-page__products">
        <h2>Productos de la promo</h2>
        {items.length === 0 ? (
          <p className="empty-state">Todavía no hay productos cargados en esta promo.</p>
        ) : (
          <div className="product-grid">
            {items.map((i) => (
              <ProductCard key={i.productId} product={i.product} promoId={promo.id} promoPrice={i.promoPrice} preview={preview} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PromoPage() {
  const { id } = useParams();
  const { promos, loading } = useData();
  const { isAdmin } = useAuth();
  const promo = promos.find((p) => p.id === id);

  if (loading) {
    return (
      <div className="promo-page">
        <div className="skeleton" style={{ height: 380, borderRadius: 0 }} />
        <div className="container promo-page__products">
          <div className="product-grid">
            {Array.from({ length: 4 }, (_, i) => <ProductSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  const live = promo && isPromoLive(promo, todayISO());
  if (!promo || (!live && !isAdmin)) {
    return (
      <div className="container empty-state">
        <h3>Esta promo ya terminó 😢</h3>
        <p>¡Pero tenemos un montón de productos esperándote!</p>
        <Link to="/catalogo" className="btn">Ir al catálogo</Link>
      </div>
    );
  }

  return (
    <>
      {!live && <div className="promo-page__admin-note">Vista de admin: esta promo no está vigente para el público.</div>}
      <PromoView promo={promo} />
      <div className="container">
        <Link to="/" className="btn btn--ghost btn--sm"><ArrowLeft size={16} /> Volver al inicio</Link>
      </div>
    </>
  );
}
