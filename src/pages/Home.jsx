import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useLivePromos, useProductMap } from '../context/DataContext';
import { inCategory } from '../config/categories';
import { useUI } from '../context/UIContext';
import PromoBanner from '../components/PromoBanner';
import Marquee, { MarqueeSkeleton } from '../components/Marquee';
import { heroFrom } from '../lib/siteContent';
import { assetUrl } from '../lib/assets';
import { BACKGROUND_SIZES, srcSetFor } from '../lib/media';
import './Home.css';

// Foto del hero: primero la copia diminuta difuminada (viene embebida, aparece
// al instante) y encima la foto real, que entra con un fundido cuando terminó
// de cargar. Mientras cargan los datos no hay foto, para no mostrar una vieja.
function HeroBackground({ hero }) {
  const [loaded, setLoaded] = useState(false);
  const img = useRef(null);
  // Si ya estaba en caché puede terminar de cargar antes de que React escuche.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true);
  }, []);
  const y = hero.posY != null ? { '--hero-y': `${hero.posY}%`, '--hero-y-sm': `${hero.posY}%` } : undefined;
  return (
    <div className="hero__bg" style={y}>
      {hero.placeholder && <img className="hero__ph" src={hero.placeholder} alt="" aria-hidden />}
      <img
        ref={img}
        className={`hero__img ${loaded ? 'is-loaded' : ''}`}
        src={assetUrl(hero.image)}
        srcSet={srcSetFor(assetUrl(hero.image), BACKGROUND_SIZES)}
        sizes="100vw"
        alt=""
        aria-hidden
        fetchPriority="high"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export default function Home() {
  const { loading, settings, products } = useData();
  const promos = useLivePromos();
  const pMap = useProductMap();
  const { openModal } = useUI();
  const featured = (settings?.featured ?? []).map((id) => pMap.get(id)).filter(Boolean);
  const hero = heroFrom(settings?.hero);
  const combos = products.filter((p) => inCategory(p.category, 'combos'));

  return (
    <>
      <section className="hero">
        {loading ? <div className="hero__bg" /> : <HeroBackground key={hero.image} hero={hero} />}
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
