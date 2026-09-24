import { Link } from 'react-router-dom';
import Logo from './Logo';
import { useUI } from '../context/UIContext';
import { CATEGORIES } from '../config/categories';
import { SITE } from '../config/site';
import { useWhatsApp } from '../context/DataContext';
import { InstagramIcon, MailIcon, WhatsAppIcon } from './Icons';
import './Footer.css';

// Abre la redacción de Gmail en otra pestaña con un mensaje de ejemplo
// (mailto: no hace nada si la persona no tiene un programa de correo configurado).
const gmailLink = () =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SITE.email)}&su=${encodeURIComponent(
    'Consulta desde la web',
  )}&body=${encodeURIComponent('¡Hola Ley Matera! Quería consultarles por...')}`;

export default function Footer() {
  const { openModal } = useUI();
  const whatsapp = useWhatsApp();
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
            <a href={whatsapp.link()} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <WhatsAppIcon />
            </a>
            <a href={gmailLink()} target="_blank" rel="noreferrer" aria-label={`Mail: ${SITE.email}`} title={SITE.email}>
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
