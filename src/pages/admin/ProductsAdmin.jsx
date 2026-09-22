import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { FLAT_CATEGORIES, categoryLabel, inCategory } from '../../config/categories';
import { salePrice } from '../../lib/pricing';
import { money, normalize } from '../../lib/format';
import Modal from '../../components/Modal';
import ProductCard from '../../components/ProductCard';
import ProductImage from '../../components/ProductImage';
import ImagePositioner from '../../components/ImagePositioner';
import ImageDrop from '../../components/ImageDrop';
import { EditIcon, StarIcon, TrashIcon } from '../../components/Icons';

// Desde cuántas unidades se avisa que queda poco.
const LOW_STOCK = 3;
// 'out' (sin stock), 'low' (quedan pocas) o '' (sin aviso / stock sin controlar).
const stockLevel = (p) => (p.stock == null ? '' : p.stock === 0 ? 'out' : p.stock <= LOW_STOCK ? 'low' : '');

const EMPTY = {
  id: null,
  title: '',
  category: '',
  price: '',
  image: '',
  stock: null,
  discount: 0,
};

// Campo numérico chico de la fila (stock / descuento): guarda al salir del
// campo o con Enter.
function InlineNumber({ product, field, label, title, empty, max, suffix = '', okText, danger = false, extra }) {
  const { saveProduct } = useData();
  const { run } = useUI();
  const current = product[field] ?? empty;
  const [value, setValue] = useState(current ?? '');
  useEffect(() => setValue(current ?? ''), [current]);

  const commit = () => {
    const next = value === '' ? empty : Math.min(max, Number(String(value).replace(/\D/g, '')) || 0);
    if (next === current) return;
    run(() => saveProduct({ ...product, [field]: next }), okText(next));
  };

  return (
    <label className={`stock-input ${danger ? 'is-out' : ''}`} title={title}>
      <span>{label}</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder="—"
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={`${label} de ${product.title}`}
      />
      {suffix && <span>{suffix}</span>}
      {extra?.(value === '' ? empty : Math.min(max, Number(value) || 0))}
    </label>
  );
}

function ProductEditor({ initial, onClose }) {
  const { saveProduct, stockEnabled, discountEnabled } = useData();
  const { run } = useUI();
  const [form, setForm] = useState({
    ...initial,
    price: initial.price === '' ? '' : String(initial.price),
    stock: initial.stock == null ? '' : String(initial.stock),
    discount: initial.discount ? String(initial.discount) : '',
  });
  // Encuadre de la foto: si es nueva la recortamos al publicar.
  const [frame, setFrame] = useState(initial.image ? { src: initial.image, x: 50, y: 50, zoom: 1 } : null);
  const [frameTouched, setFrameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const price = Number(String(form.price).replace(/\D/g, ''));
  const stock = form.stock === '' ? null : Number(String(form.stock).replace(/\D/g, ''));
  const discount = Math.min(90, Number(String(form.discount).replace(/\D/g, '')) || 0);

  const publish = async () => {
    if (!form.title.trim() || !form.category || !price || !frame?.src) {
      setError('Completá categoría, título, precio y foto antes de publicar.');
      return;
    }
    setSaving(true);
    setError('');
    // Si la foto es nueva o se reencuadró, se sube recortada en 800 y 400 px (WebP).
    const newFrame = frameTouched || frame.src.startsWith('data:') ? frame : null;
    const saved = await run(
      () => saveProduct({ ...form, title: form.title.trim(), price, stock, discount }, newFrame),
      (p) => (initial.id ? 'Cambios guardados' : `Producto publicado (${p.id})`),
    );
    setSaving(false);
    if (saved) onClose();
  };

  const previewProduct = { ...form, price, stock, discount, image: frame?.src ?? '' };

  return (
    <div className="admin-grid-2">
      <div>
        <label className="field">
          <span>Categoría</span>
          <select className="select" value={form.category} onChange={set('category')}>
            <option value="">Elegí una categoría…</option>
            {FLAT_CATEGORIES.map((c) => (
              <option key={c.path} value={c.path}>
                {'  '.repeat(c.depth)}
                {c.depth ? '└ ' : ''}
                {c.name}
              </option>
            ))}
          </select>
          {form.category && <small>{categoryLabel(form.category)}</small>}
        </label>
        <label className="field">
          <span>Título</span>
          <input
            className="input"
            value={form.title}
            onChange={set('title')}
            placeholder="Ej: Mate Imperial de Algarrobo"
            maxLength={90}
          />
        </label>
        <label className="field">
          <span>Precio (ARS)</span>
          <input
            className="input"
            inputMode="numeric"
            value={form.price}
            onChange={set('price')}
            placeholder="Ej: 35000"
          />
          {price > 0 && <small>{money(price)}</small>}
        </label>
        {discountEnabled && (
          <label className="field">
            <span>Descuento (%)</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.discount}
              onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="0 = sin descuento"
            />
            {discount > 0 && price > 0 && (
              <small>
                Se vende a <strong className="price-off">{money(salePrice({ price, discount }))}</strong> en lugar de{' '}
                <s>{money(price)}</s>.
              </small>
            )}
          </label>
        )}
        {stockEnabled && (
          <label className="field">
            <span>Stock</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.stock}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  stock: e.target.value.replace(/\D/g, ''),
                }))
              }
              placeholder="Vacío = no controlar stock"
            />
            <small>Con 0 el producto aparece como “Sin stock” y no se puede pedir.</small>
          </label>
        )}
        <div className="field">
          <span>Foto</span>
          {frame ? (
            <>
              <ImagePositioner
                frame={frame}
                onChange={(f) => {
                  setFrame(f);
                  setFrameTouched(true);
                }}
                aspect={1}
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ marginTop: 8 }}
                onClick={() => setFrame(null)}
              >
                Cambiar foto
              </button>
            </>
          ) : (
            <ImageDrop
              hint="Recomendado: cuadrada, mínimo 800 × 800 px, fondo claro."
              onImage={(src) => {
                setFrame({ src, x: 50, y: 50, zoom: 1 });
                setFrameTouched(true);
              }}
            />
          )}
        </div>
      </div>

      <div>
        <div className="preview-frame">
          <span className="preview-frame__label">Así se va a ver en el catálogo</span>
          <div style={{ maxWidth: 260, margin: '0 auto' }}>
            <ProductCard product={previewProduct} frame={frame} preview />
          </div>
        </div>
        {error && (
          <p className="warn" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        <div className="toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={publish} disabled={saving}>
            {saving ? 'Subiendo…' : initial.id ? 'Guardar cambios' : 'Publicar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsAdmin() {
  const { products, settings, deleteProduct, setFeatured, stockEnabled, discountEnabled } = useData();
  const { run } = useUI();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (params.get('nuevo')) {
      setEditing(EMPTY);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const featured = settings?.featured ?? [];
  // Arriba de todo los que se quedaron sin stock (rojo) y después los que
  // tienen poco (amarillo), de menos a más. El resto, del más nuevo al más viejo.
  const list = useMemo(() => {
    const urgent = (p) => (stockLevel(p) ? 0 : 1);
    const nq = normalize(q.trim());
    return products
      .filter((p) => inCategory(p.category, cat))
      .filter((p) => !nq || normalize(p.title).includes(nq) || p.id.toLowerCase() === nq)
      .sort(
        (a, b) =>
          urgent(a) - urgent(b) ||
          (urgent(a) === 0 ? a.stock - b.stock : 0) ||
          Number(b.id.slice(1)) - Number(a.id.slice(1)),
      );
  }, [products, q, cat]);

  const toggleFeatured = (id) => {
    run(() => setFeatured(featured.includes(id) ? featured.filter((f) => f !== id) : [...featured, id]));
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Productos</h2>
        <button className="btn" onClick={() => setEditing(EMPTY)}>
          + Nuevo producto
        </button>
      </div>
      {(!stockEnabled || !discountEnabled) && (
        <p className="warn">
          Para usar{' '}
          {!stockEnabled && !discountEnabled
            ? 'el stock y los descuentos'
            : !stockEnabled
              ? 'el stock'
              : 'los descuentos'}{' '}
          falta un paso en Supabase: abrí el SQL Editor y corré{' '}
          {!stockEnabled && <code>supabase/migrations_stock.sql</code>}
          {!stockEnabled && !discountEnabled && ' y '}
          {!discountEnabled && <code>supabase/migrations_discount.sql</code>}. Después recargá esta página.
        </p>
      )}
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar por título o id (ej: P12)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="select" style={{ maxWidth: 260 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {FLAT_CATEGORIES.map((c) => (
            <option key={c.path} value={c.path}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="muted">{list.length} productos</span>
      </div>

      <ul className="alist">
        {list.map((p) => (
          <li key={p.id} className={`alist__item ${stockLevel(p) ? `is-stock-${stockLevel(p)}` : ''}`}>
            <ProductImage src={p.image} alt={p.title} className="alist__img" />
            <div className="alist__info">
              <strong>{p.title}</strong>
              {stockLevel(p) && (
                <em className="stock-flag">
                  {p.stock === 0 ? 'Sin stock' : p.stock === 1 ? 'Queda 1' : `Quedan ${p.stock}`}
                </em>
              )}
              <span>
                <span className="id-pill">{p.id}</span> · {categoryLabel(p.category)} ·{' '}
                {p.discount > 0 ? (
                  <>
                    <s>{money(p.price)}</s> <strong className="price-off">{money(salePrice(p))}</strong>
                  </>
                ) : (
                  money(p.price)
                )}
              </span>
            </div>
            <div className="alist__actions">
              {discountEnabled && (
                <InlineNumber
                  product={p}
                  field="discount"
                  label="Desc."
                  suffix="%"
                  empty={0}
                  max={90}
                  title="Descuento en % (0 = sin descuento)"
                  okText={(n) => (n ? `Descuento de ${n}% aplicado` : 'Descuento quitado')}
                  extra={(n) => n > 0 && <b className="price-off">{money(salePrice({ price: p.price, discount: n }))}</b>}
                />
              )}
              {stockEnabled && (
                <InlineNumber
                  product={p}
                  field="stock"
                  label="Stock"
                  empty={null}
                  max={99999}
                  danger={p.stock === 0}
                  title="Stock (vacío = no se controla)"
                  okText={(n) => (n === 0 ? 'Marcado sin stock' : 'Stock actualizado')}
                />
              )}
              <button
                className={`icon-btn ${featured.includes(p.id) ? 'is-on' : ''}`}
                title={featured.includes(p.id) ? 'Quitar de destacados' : 'Destacar'}
                onClick={() => toggleFeatured(p.id)}
              >
                <StarIcon size={19} />
              </button>
              <button className="icon-btn" title="Editar" onClick={() => setEditing(p)}>
                <EditIcon size={19} />
              </button>
              <button className="icon-btn is-danger" title="Eliminar" onClick={() => setConfirm(p)}>
                <TrashIcon size={19} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Editar ${editing.id}` : 'Nuevo producto'}
        size="lg"
      >
        {editing && <ProductEditor key={editing.id ?? 'new'} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="¿Eliminar producto?" size="sm">
        <p>
          Vas a eliminar <strong>{confirm?.title}</strong>. También se va a quitar de destacados y de las promos.
        </p>
        <div className="toolbar" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
            Cancelar
          </button>
          <button
            className="btn btn--danger"
            onClick={async () => {
              await run(() => deleteProduct(confirm.id), 'Producto eliminado');
              setConfirm(null);
            }}
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}
