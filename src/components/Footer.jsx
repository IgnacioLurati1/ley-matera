import { Link } from 'react-router-dom';
import Logo from './Logo';
import { useUI } from '../context/UIContext';
import { CATEGORIES } from '../config/categories';
import { SITE, whatsappLink } from '../config/site';
import { InstagramIcon, MailIcon, WhatsAppIcon } from './Icons';
import './Footer.css';

export default function Footer() {
  const { openModal } = useUI();
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__col">
          <h4>Más información</h4>
          <Link to="/conocenos">Nosotros</Link>
          <button type="button" onClick={() => openModal('contact')}>Contacto</button>
          <button type="button" onClick={() => openModal('howto')}>Cómo pedir</button>
          <Link to="/carrito">Mi carrito</Link>
        </div>

        <div className="footer__brand">
          <Logo size={110} />
          <div className="footer__social">
            <a href={SITE.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a href={whatsappLink()} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <WhatsAppIcon />
            </a>
            <a href={`mailto:${SITE.email}`} aria-label={`Mail: ${SITE.email}`} title={SITE.email}>
              <MailIcon />
            </a>
          </div>
          <p className="footer__credit">
            Powered by{' '}
            <a href="https://www.instagram.com/nacho_lurati/" target="_blank" rel="noreferrer">
              El Luta
            </a>
          </p>
        </div>

        <div className="footer__col">
          <h4>Categorías</h4>
          {CATEGORIES.map((c) => (
            <Link key={c.slug} to={`/catalogo?cat=${c.slug}`}>{c.name}</Link>
          ))}
        </div>
      </div>
      <div className="footer__bottom">
        © {new Date().getFullYear()} {SITE.name}, {SITE.city}.
      </div>
    </footer>
  );
}
