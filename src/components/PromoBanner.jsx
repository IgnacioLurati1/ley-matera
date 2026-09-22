import { Link } from 'react-router-dom';
import PromoDecoration from './PromoDecoration';
import ProductImage from './ProductImage';
import FramedImage from './FramedImage';
import { useProductMap } from '../context/DataContext';
import { formatDate, money } from '../lib/format';
import { unitPrice } from '../lib/pricing';
import { ClockIcon } from './Icons';
import './Promo.css';

// Banner de promo para el home. `preview` desactiva los links (lo usa el admin).
export default function PromoBanner({ promo, preview = false }) {
  const pMap = useProductMap();
  const items = promo.items.map((i) => ({ ...i, product: pMap.get(i.productId) })).filter((i) => i.product);
  const cheapest = items.reduce(
    (min, i) => Math.min(min, unitPrice(i.product, i.promoPrice)),
    Number.POSITIVE_INFINITY,
  );

  const cta = preview ? (
    <span className="btn btn--light">Ver detalles de la promo</span>
  ) : (
    <Link to={`/promo/${promo.id}`} className="btn btn--light">Ver detalles de la promo</Link>
  );

  return (
    <article className="promo-banner" style={{ color: promo.textColor || '#fff' }}>
      <div className="promo-banner__bg">
        <FramedImage frame={promo.background} />
      </div>
      <div className="promo-banner__shade" style={{ opacity: promo.shade ?? 1 }} />
      <PromoDecoration type={promo.decoration?.type} color={promo.decoration?.color} />
      <div className="promo-banner__content">
        <div className="promo-banner__text">
          <span className="promo-banner__tag">Promo vigente</span>
          <h2>{promo.headline || promo.title}</h2>
          {promo.message && <p>{promo.message}</p>}
          <div className="promo-banner__meta">
            {Number.isFinite(cheapest) && <span>Desde <strong>{money(cheapest)}</strong></span>}
            {promo.endDate && (
              <span>
                <ClockIcon size={16} /> Hasta el {formatDate(promo.endDate)}
              </span>
            )}
          </div>
          {cta}
        </div>
        {items.length > 0 && (
          <div className="promo-banner__products">
            {items.slice(0, 4).map((i) => (
              <div className="promo-banner__thumb" key={i.productId}>
                <ProductImage src={i.product.image} alt={i.product.title} />
                {unitPrice(i.product, i.promoPrice) < i.product.price && (
                  <span className="badge">-{Math.round((1 - unitPrice(i.product, i.promoPrice) / i.product.price) * 100)}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
