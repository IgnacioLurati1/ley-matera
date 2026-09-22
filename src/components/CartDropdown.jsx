import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { money } from '../lib/format';
import { CartIcon, WhatsAppIcon } from './Icons';
import QtyStepper from './QtyStepper';
import ProductImage from './ProductImage';
import './CartDropdown.css';

export default function CartDropdown() {
  const { lines, count, total, open, setOpen, setQty, bump, orderLink } = useCart();
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, setOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <div className="cartdd" ref={ref}>
      <button
        className="cartdd__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Carrito, ${count} productos`}
      >
        <span key={bump} className={bump ? 'cartdd__icon is-bumped' : 'cartdd__icon'}>
          <CartIcon size={24} />
        </span>
        <span className="cartdd__label">Carrito</span>
        {count > 0 && <span className="cartdd__count">{count}</span>}
      </button>

      <div className={`cartdd__panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="cartdd__head">
          <strong>Tu carrito</strong>
          <span>
            {count} {count === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="cartdd__empty">
            <p>Todavía no sumaste productos.</p>
            <Link to="/catalogo" className="btn btn--sm" onClick={() => setOpen(false)}>
              Ver catálogo
            </Link>
          </div>
        ) : (
          <>
            <ul className="cartdd__list">
              {lines.map((l) => (
                <li key={l.key}>
                  <ProductImage src={l.product.image} alt={l.product.title} className="cartdd__thumb" />
                  <div className="cartdd__info">
                    <span className="cartdd__title">{l.product.title}</span>
                    {l.promo && <span className="badge">Promo</span>}
                    {l.soldOut && <span className="cartdd__reserve">Reserva (sin stock)</span>}
                    <div className="cartdd__row">
                      <QtyStepper value={l.qty} onChange={(q) => setQty(l.key, q)} small />
                      <strong>{money(l.subtotal)}</strong>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="cartdd__total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <a className="btn btn--whatsapp btn--block" href={orderLink()} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={20} /> Solicitar productos
            </a>
          </>
        )}
        <Link to="/carrito" className="btn btn--ghost btn--block cartdd__details" onClick={() => setOpen(false)}>
          Ver detalles
        </Link>
      </div>
    </div>
  );
}
