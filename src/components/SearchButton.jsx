import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { money, normalize } from '../lib/format';
import { salePrice } from '../lib/pricing';
import ProductImage from './ProductImage';
import { SearchIcon } from './Icons';
import './SearchButton.css';

// Lupa de la navbar: abre un buscador con sugerencias y lleva al catálogo
// filtrado por lo que se escribió. Escribir "Ley Matera" lleva al login del
// panel (no hay link visible para iniciar sesión).
const isLoginWord = (text) => normalize(text).replace(/\s+/g, '') === 'leymatera';

export default function SearchButton() {
  const { products } = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const input = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return undefined;
    input.current?.focus();
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const matches = useMemo(() => {
    const nq = normalize(q.trim());
    if (!nq) return [];
    return products.filter((p) => normalize(p.title).includes(nq) || p.id.toLowerCase() === nq).slice(0, 5);
  }, [products, q]);

  const go = (text) => {
    const t = text.trim();
    if (isLoginWord(t)) {
      navigate('/login');
      setOpen(false);
      setQ('');
      return;
    }
    navigate(t ? `/catalogo?q=${encodeURIComponent(t)}` : '/catalogo');
    setOpen(false);
  };

  return (
    <div className="search" ref={ref}>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label="Buscar productos"
        aria-expanded={open}
      >
        <SearchIcon size={20} />
      </button>
      <div className={`search__panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
        >
          <label className="search__field">
            <SearchIcon size={18} />
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar mates, bombillas, termos…"
              aria-label="Buscar productos"
            />
          </label>
        </form>
        {matches.length > 0 && (
          <ul className="search__list">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => go(p.title)}>
                  <ProductImage src={p.image} alt="" className="search__img" sizes="44px" />
                  <span>{p.title}</span>
                  <strong>{money(salePrice(p))}</strong>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim() && !isLoginWord(q) && (
          <button type="button" className="search__all" onClick={() => go(q)}>
            Ver todos los resultados de “{q.trim()}”
          </button>
        )}
      </div>
    </div>
  );
}
