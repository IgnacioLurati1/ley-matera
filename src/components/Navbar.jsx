import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Logo from './Logo';
import CartDropdown from './CartDropdown';
import ThemeToggle from './ThemeToggle';
import SearchButton from './SearchButton';
import AnnouncementBar from './AnnouncementBar';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { Escarapela, Garland, PatrioRibbon, useSeasons } from './Seasonal';
import { CloseIcon, MenuIcon } from './Icons';
import './Navbar.css';

// Colapsa al bajar (queda sólo el logo) y se vuelve a abrir al subir.
function useCollapseOnScroll() {
  const [collapsed, setCollapsed] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last.current;
        if (y < 80) setCollapsed(false);
        else if (delta > 6) setCollapsed(true);
        else if (delta < -6) setCollapsed(false);
        last.current = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return collapsed;
}

export default function Navbar() {
  const collapsed = useCollapseOnScroll();
  const [menuOpen, setMenuOpen] = useState(false);
  const { openModal } = useUI();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const seasons = useSeasons();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // El espacio que deja la barra fija se ajusta a su alto real (cambia con la
  // barra de anuncios o el tamaño de pantalla). Se mide sólo con la barra
  // abierta: al instante, salvo justo después de abrirse o cerrarse al hacer
  // scroll, que espera a que termine la animación.
  const header = useRef(null);
  const collapsedRef = useRef(collapsed);
  const toggledAt = useRef(-Infinity);
  if (collapsedRef.current !== collapsed) toggledAt.current = performance.now();
  collapsedRef.current = collapsed;
  useEffect(() => {
    const el = header.current;
    let timer;
    const ANIMATION_MS = 500;
    const measure = () => {
      clearTimeout(timer);
      const wait = toggledAt.current + ANIMATION_MS - performance.now();
      if (wait > 0) {
        timer = setTimeout(measure, wait);
        return;
      }
      if (!collapsedRef.current) document.documentElement.style.setProperty('--nav-full', `${el.offsetHeight}px`);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const modalLink = (name) => () => {
    setMenuOpen(false);
    openModal(name);
  };

  const links = (
    <>
      <NavLink to="/" end>
        Inicio
      </NavLink>
      <NavLink to="/catalogo">Catálogo</NavLink>
      <NavLink to="/conocenos">Conocenos</NavLink>
      <button type="button" onClick={modalLink('contact')}>
        Contactanos
      </button>
      <button type="button" onClick={modalLink('howto')}>
        Cómo pedir
      </button>
      {isAdmin && (
        <NavLink to="/admin" className="nav__login">
          Panel admin
        </NavLink>
      )}
    </>
  );

  return (
    <>
      <header ref={header} className={`nav ${collapsed ? 'nav--collapsed' : ''}`}>
        <div className="nav__side nav__side--left">
          <button
            className="icon-btn nav__burger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menú"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <SearchButton />
        </div>

        <div className="nav__center">
          <Link to="/" className="nav__brand" aria-label="Ir al inicio">
            <span className="nav__logo-wrap">
              <Logo size={collapsed ? 48 : 92} className="nav__logo" />
              {seasons.includes('patrio') && <Escarapela className="nav__escarapela" />}
            </span>
          </Link>
          <div className="nav__full">
            <nav className="nav__links" aria-label="Principal">
              {links}
            </nav>
          </div>
        </div>

        <div className="nav__side nav__side--right">
          <ThemeToggle />
          <CartDropdown />
        </div>

        <div className="nav__announce">
          <AnnouncementBar />
        </div>
        {seasons.includes('navidad') && <Garland />}
        {seasons.includes('patrio') && <PatrioRibbon />}
      </header>

      <div className={`nav-drawer ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)}>
        <nav className="nav-drawer__panel" onClick={(e) => e.stopPropagation()} aria-label="Menú móvil">
          {links}
        </nav>
      </div>

      <div className="nav-spacer" aria-hidden />
    </>
  );
}
