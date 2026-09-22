import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { CATEGORIES, inCategory } from '../config/categories';
import { normalize } from '../lib/format';
import { salePrice } from '../lib/pricing';
import ProductCard, { ProductSkeleton } from '../components/ProductCard';
import PriceRange from '../components/PriceRange';
import PromoMini from '../components/PromoMini';
import { CloseIcon, FilterIcon, SearchIcon } from '../components/Icons';
import './Catalog.css';

const SORTS = [
  { value: 'relevance', label: 'Destacados primero' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'az', label: 'Nombre: A → Z' },
  { value: 'za', label: 'Nombre: Z → A' },
  { value: 'new', label: 'Más nuevos' },
];
const PAGE = 24;

// Devuelve la cadena de nodos para un path: [mates, algarrobo, imperiales]
const nodeChain = (path) => {
  const chain = [];
  let nodes = CATEGORIES;
  (path ? path.split('/') : []).forEach((slug) => {
    const node = nodes?.find((n) => n.slug === slug);
    if (!node) return;
    chain.push(node);
    nodes = node.children;
  });
  return chain;
};

export default function Catalog() {
  const { products, loading, settings } = useData();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const [range, setRange] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'q' });
  };

  const chain = nodeChain(cat);

  const inCat = useMemo(() => products.filter((p) => inCategory(p.category, cat)), [products, cat]);

  const bounds = useMemo(() => {
    if (!inCat.length) return [0, 0];
    const prices = inCat.map(salePrice);
    const step = 500;
    return [Math.floor(Math.min(...prices) / step) * step, Math.ceil(Math.max(...prices) / step) * step];
  }, [inCat]);

  // Al cambiar de categoría se reinicia el rango de precios y la paginación.
  useEffect(() => {
    setRange(null);
    setLimit(PAGE);
  }, [cat, q]);

  const [lo, hi] = range ?? bounds;

  const results = useMemo(() => {
    const nq = normalize(q.trim());
    const featured = settings?.featured ?? [];
    const list = inCat.filter((p) => {
      if (salePrice(p) < lo || salePrice(p) > hi) return false;
      if (!nq) return true;
      return normalize(p.title).includes(nq) || p.id.toLowerCase() === nq;
    });
    const by = {
      relevance: (a, b) => (featured.includes(b.id) ? 1 : 0) - (featured.includes(a.id) ? 1 : 0),
      'price-asc': (a, b) => salePrice(a) - salePrice(b),
      'price-desc': (a, b) => salePrice(b) - salePrice(a),
      az: (a, b) => a.title.localeCompare(b.title, 'es'),
      za: (a, b) => b.title.localeCompare(a.title, 'es'),
      new: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    };
    const cmp = by[sort] ?? by.relevance;
    return [...list].sort((a, b) => (a.stock === 0) - (b.stock === 0) || cmp(a, b));
  }, [inCat, q, lo, hi, sort, settings]);

  // Filas de chips: nivel 0 siempre; luego los hijos de cada nodo elegido.
  const rows = [{ nodes: CATEGORIES, base: '', active: chain[0]?.slug }];
  chain.forEach((node, i) => {
    if (node.children) {
      rows.push({
        nodes: node.children,
        base: chain.slice(0, i + 1).map((n) => n.slug).join('/'),
        active: chain[i + 1]?.slug,
      });
    }
  });

  const filtersActive = range != null || sort !== 'relevance';

  return (
    <div className="catalog container">
      <header className="catalog__head">
        <div>
          <h1>{chain.length ? chain[chain.length - 1].name : 'Todos los productos'}</h1>
        </div>
        <label className="catalog__search">
          <SearchIcon size={20} />
          <input
            type="search"
            placeholder="Buscar productos…"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            aria-label="Buscar productos"
          />
        </label>
      </header>

      <nav className="catalog__cats" aria-label="Categorías">
        {rows.map((row, depth) => (
          <div className={`chips chips--d${depth}`} key={row.base || 'root'}>
            <button
              className={`chip ${!row.active ? 'is-active' : ''}`}
              onClick={() => setParam('cat', row.base)}
            >
              {depth === 0 ? 'Todo' : `Todo ${chain[depth - 1].name}`}
            </button>
            {row.nodes.map((n) => {
              const path = row.base ? `${row.base}/${n.slug}` : n.slug;
              return (
                <button
                  key={path}
                  className={`chip ${row.active === n.slug ? 'is-active' : ''}`}
                  onClick={() => setParam('cat', path)}
                >
                  {n.name}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="catalog__layout">
        <div className="catalog__side">
          <aside className={`catalog__filters ${filtersOpen ? 'is-open' : ''}`}>
            <div className="catalog__filters-head">
              <strong>Filtros</strong>
              <button className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">
                <CloseIcon />
              </button>
            </div>
            <div className="field">
              <span>Ordenar por</span>
              <select className="select" value={sort} onChange={(e) => setParam('sort', e.target.value === 'relevance' ? '' : e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {bounds[1] > bounds[0] && (
              <div className="field">
                <span>Rango de precio</span>
                <PriceRange min={bounds[0]} max={bounds[1]} value={[lo, hi]} onChange={setRange} />
              </div>
            )}
            {filtersActive && (
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  setRange(null);
                  setParam('sort', '');
                }}
              >
                Limpiar filtros
              </button>
            )}
            <button className="btn btn--block catalog__apply" onClick={() => setFiltersOpen(false)}>
              Ver {results.length} productos
            </button>
          </aside>
          <PromoMini />
        </div>

        <section className="catalog__results">
          <div className="catalog__bar">
            <span>
              {loading ? 'Cargando…' : `${results.length} ${results.length === 1 ? 'producto' : 'productos'}`}
            </span>
            <button className="btn btn--sm btn--ghost catalog__filter-btn" onClick={() => setFiltersOpen(true)}>
              <FilterIcon size={16} /> Filtrar y ordenar
            </button>
          </div>

          {loading ? (
            <div className="product-grid">
              {Array.from({ length: 8 }, (_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : results.length === 0 ? (
            <div className="empty-state">
              <h3>No hay productos con esos filtros</h3>
              <p>Probá con otra búsqueda o cambiá los filtros.</p>
              <button
                className="btn"
                onClick={() => {
                  setRange(null);
                  setParams(new URLSearchParams());
                }}
              >
                Ver todo el catálogo
              </button>
            </div>
          ) : (
            <>
              <div className="product-grid">
                {results.slice(0, limit).map((p, i) => (
                  <ProductCard key={p.id} product={p} style={{ animationDelay: `${Math.min(i % PAGE, 12) * 40}ms` }} />
                ))}
              </div>
              {results.length > limit && (
                <div className="catalog__more">
                  <button className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE)}>
                    Ver más productos
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {filtersOpen && <div className="catalog__backdrop" onClick={() => setFiltersOpen(false)} />}
    </div>
  );
}
