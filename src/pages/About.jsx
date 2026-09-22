import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import Logo from '../components/Logo';
import { ABOUT_SIZES, srcSetFor } from '../lib/media';
import { DEFAULT_ABOUT_IMAGE } from '../lib/siteContent';
import './About.css';
import { assetUrl } from '../lib/assets';

export default function About() {
  const { settings, loading } = useData();
  const { openModal } = useUI();
  const about = settings?.about;
  const image = about?.image || DEFAULT_ABOUT_IMAGE;

  return (
    <div className="about">
      <section className="about__hero">
        <div className="container about__hero-inner">
          <Logo size={120} />
          <div>
            {loading ? (
              <div className="skeleton" style={{ height: 44, width: 280, marginTop: 8 }} />
            ) : (
              <h1>{about?.title ?? 'Somos Ley Matera'}</h1>
            )}
          </div>
        </div>
      </section>

      <section className="container about__body">
        <figure className="about__photo">
          {loading ? (
            <div className="skeleton about__photo-skel" />
          ) : (
            <img
              src={assetUrl(image)}
              srcSet={srcSetFor(image, ABOUT_SIZES)}
              sizes="(max-width: 760px) 90vw, 460px"
              alt="Los chicos de Ley Matera con sus mates"
              style={about?.imageY != null ? { objectPosition: `50% ${about.imageY}%` } : undefined}
            />
          )}
        </figure>
        <div className="about__text">
          {loading ? (
            <>
              <div className="skeleton" style={{ height: 18, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 18, marginBottom: 10, width: '92%' }} />
              <div className="skeleton" style={{ height: 18, width: '70%' }} />
            </>
          ) : (
            <div>
              {(about?.body ?? '')
                .split('\n')
                .filter(Boolean)
                .map((para) => (
                  <p key={para}>{para}</p>
                ))}
            </div>
          )}
          <div className="about__cta">
            <Link to="/catalogo" className="btn">
              Ver el catálogo
            </Link>
            <button type="button" className="btn btn--ghost" onClick={() => openModal('contact')}>
              Escribinos
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
