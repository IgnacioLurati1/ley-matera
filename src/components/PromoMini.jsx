import { Link } from 'react-router-dom';
import { useLivePromos } from '../context/DataContext';
import { formatDate } from '../lib/format';
import FramedImage from './FramedImage';
import './PromoMini.css';

// Tarjetitas de las promos vigentes (columna del catálogo). Sin promos, no se muestra.
export default function PromoMini() {
  const promos = useLivePromos();
  if (!promos.length) return null;
  return (
    <section className="promo-mini" aria-label="Promos vigentes">
      <h2 className="promo-mini__title">{promos.length === 1 ? 'Promo vigente' : 'Promos vigentes'}</h2>
      <div className="promo-mini__list">
        {promos.map((p) => (
          <Link key={p.id} to={`/promo/${p.id}`} className="promo-mini__card" style={{ color: p.textColor || '#fff' }}>
            <div className="promo-mini__bg">
              <FramedImage frame={p.background} />
            </div>
            <div className="promo-mini__shade" style={{ opacity: p.shade ?? 1 }} />
            <strong>{p.headline || p.title}</strong>
            {p.endDate && <span>Hasta el {formatDate(p.endDate)}</span>}
            <span className="promo-mini__cta">Ver promo</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
