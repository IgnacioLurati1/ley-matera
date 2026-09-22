import { Link } from 'react-router-dom';
import { useData, useLivePromos, useProductMap } from '../context/DataContext';
import { inCategory } from '../config/categories';
import { useUI } from '../context/UIContext';
import PromoBanner from '../components/PromoBanner';
import Marquee, { MarqueeSkeleton } from '../components/Marquee';
import { DEFAULT_HERO, heroStyle } from '../lib/siteContent';
import './Home.css';

export default function Home() {
  const { loading, settings, products } = useData();
  const promos = useLivePromos();
  const pMap = useProductMap();
  const { openModal } = useUI();
  const featured = (settings?.featured ?? []).map((id) => pMap.get(id)).filter(Boolean);
  const hero = { ...DEFAULT_HERO, ...settings?.hero };
  const combos = products.filter((p) => inCategory(p.category, 'combos'));

  return (
    <>
      <section className="hero" style={heroStyle(loading ? null : hero)}>
        <div className="hero__bg" />
        <div className={`container hero__content ${loading ? 'is-loading' : ''}`}>
          <h1>{hero.title}</h1>
          {hero.text && <p>{hero.text}</p>}
          <div className="hero__actions">
            <Link to="/catalogo" className="btn btn--light">Ver productos</Link>
            <button type="button" className="btn btn--ghost-light" onClick={() => openModal('howto')}>
              ¿Cómo pedir?
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="container home-promos">
          <div className="skeleton" style={{ height: 320, borderRadius: 24 }} />
        </section>
      ) : (
        promos.length > 0 && (
          <section className="container home-promos" aria-label="Promociones">
            {promos.map((p) => (
              <PromoBanner key={p.id} promo={p} />
            ))}
          </section>
        )
      )}

      {(loading || featured.length > 0) && (
        <section className="section home-featured">
          <div className="container section-title home-featured__head">
            <h2>Productos destacados</h2>
            <Link to="/catalogo" className="home-link">Ver todo el catálogo</Link>
          </div>
          <div className="home-featured__track">
            {loading ? <MarqueeSkeleton /> : <Marquee products={featured} />}
          </div>
        </section>
      )}

      {!loading && combos.length > 0 && (
        <>
          <Divider />
          <section className="home-combos">
            <div className="container section-title home-featured__head">
              <h2>Combos</h2>
              <Link to="/catalogo?cat=combos" className="home-link">Ver todos los combos</Link>
            </div>
            <div className="home-featured__track">
              <Marquee products={combos} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

// Separador con el mate del logo, para que las dos cintas no se lean como una
// sola. La imagen se usa como máscara y toma el color del tema.
function Divider() {
  return (
    <div className="container home-divider" aria-hidden>
      <span className="home-divider__line" />
      <span className="home-divider__mate" />
      <span className="home-divider__line" />
    </div>
  );
}
