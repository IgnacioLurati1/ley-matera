import { useProductMap, useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import ProductPicker from '../../components/ProductPicker';
import ProductImage from '../../components/ProductImage';
import Marquee from '../../components/Marquee';
import { ChevronDown, TrashIcon } from '../../components/Icons';
import { money } from '../../lib/format';

export default function FeaturedAdmin() {
  const { settings, setFeatured: saveFeatured } = useData();
  const { run } = useUI();
  const setFeatured = (ids) => run(() => saveFeatured(ids));
  const pMap = useProductMap();
  const featured = (settings?.featured ?? []).filter((id) => pMap.has(id));

  const move = (idx, dir) => {
    const next = [...featured];
    const [item] = next.splice(idx, 1);
    next.splice(Math.max(0, Math.min(next.length, idx + dir)), 0, item);
    setFeatured(next);
  };

  return (
    <>
      <div className="admin-grid-2 is-stretch">
        <div className="panel">
          <h2>Destacados ({featured.length})</h2>
          <p className="hint">Se muestran en el home en la cinta que rota. Podés cambiar el orden con las flechas.</p>
          {featured.length === 0 ? (
            <p className="muted">Todavía no hay destacados. Sumalos desde la lista de la derecha.</p>
          ) : (
            <ul className="alist">
              {featured.map((id, i) => {
                const p = pMap.get(id);
                return (
                  <li key={id} className="alist__item alist__item--icons">
                    <ProductImage src={p.image} alt="" className="alist__img" />
                    <div className="alist__info">
                      <strong>{p.title}</strong>
                      <span>{p.id} · {money(p.price)}</span>
                    </div>
                    <div className="alist__actions">
                      <button className="icon-btn" title="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ChevronDown size={18} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                      <button className="icon-btn" title="Bajar" onClick={() => move(i, 1)} disabled={i === featured.length - 1}>
                        <ChevronDown size={18} />
                      </button>
                      <button className="icon-btn is-danger" title="Quitar" onClick={() => setFeatured(featured.filter((f) => f !== id))}>
                        <TrashIcon size={18} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Sumar productos</h2>
          <ProductPicker selected={featured} onPick={(p) => setFeatured([...featured, p.id])} />
        </div>
      </div>

      {featured.length > 0 && (
        <div className="panel" style={{ marginTop: 18, overflow: 'hidden' }}>
          <span className="preview-frame__label">Vista previa en el home</span>
          <div style={{ marginTop: 40 }}>
            <Marquee products={featured.map((id) => pMap.get(id))} />
          </div>
        </div>
      )}
    </>
  );
}
