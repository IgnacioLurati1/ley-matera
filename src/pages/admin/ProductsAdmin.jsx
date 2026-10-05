import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productPhotos, useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { FLAT_CATEGORIES, categoryLabel, inCategory } from '../../config/categories';
import { salePrice } from '../../lib/pricing';
import { money, normalize } from '../../lib/format';
import Modal from '../../components/Modal';
import ProductCard from '../../components/ProductCard';
import ProductImage from '../../components/ProductImage';
import FramedImage from '../../components/FramedImage';
import ImagePositioner from '../../components/ImagePositioner';
import ImageDrop from '../../components/ImageDrop';
import { PRODUCT_SIZES } from '../../lib/media';
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
  images: [],
  stock: null,
  discount: 0,
  description: '',
  cost: null,
};

// Campo numérico chico de la fila (stock / descuento): guarda al salir del
// campo o con Enter.
function InlineNumber({ product, field, label, title, empty, max, suffix = '', okText, danger = false, wide = false, extra }) {
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
    <label className={`stock-input ${danger ? 'is-out' : ''} ${wide ? 'stock-input--wide' : ''}`} title={title}>
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

// "a", "a y b", "a, b y c"
const listJoin = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

// Fotos por producto como máximo (cada una se sube en 800 y 400 px).
const MAX_PHOTOS = 8;
let photoKey = 0;
// Foto del editor: encuadre + `upload` si hay que recortarla y subirla al publicar.
const newPhoto = (src, upload) => ({ key: ++photoKey, src, x: 50, y: 50, zoom: 1, upload });

// Fotos del producto: la grande se encuadra; abajo, las miniaturas para elegir,
// ordenar y quitar. La primera es la principal (la del catálogo).
function PhotosField({ photos, setPhotos, max }) {
  const [current, setCurrent] = useState(0);
  const cur = Math.min(current, photos.length - 1);
  const photo = photos[cur];

  const add = (src) => {
    setPhotos((ps) => (ps.length >= max ? ps : [...ps, newPhoto(src, true)]));
    setCurrent(Infinity);
  };
  const moveTo = (to) => {
    setPhotos((ps) => {
      const next = ps.filter((_, i) => i !== cur);
      next.splice(to, 0, ps[cur]);
      return next;
    });
    setCurrent(to);
  };

  if (!photo) {
    return (
      <ImageDrop
        multiple={max > 1}
        label={max > 1 ? 'Subí las fotos' : 'Subí una foto'}
        hint={`Recomendado: cuadradas, mínimo 800 × 800 px, fondo claro.${max > 1 ? ` Hasta ${max} fotos.` : ''}`}
        onImage={add}
      />
    );
  }
  return (
    <>
      <ImagePositioner
        key={photo.key}
        frame={photo}
        variants={PRODUCT_SIZES}
        onChange={(f) => setPhotos((ps) => ps.map((p, i) => (i === cur ? { ...f, upload: true } : p)))}
        aspect={1}
      />
      <div className="photos">
        {photos.map((p, i) => (
          <button
            type="button"
            key={p.key}
            className={`photos__thumb ${i === cur ? 'is-on' : ''}`}
            onClick={() => setCurrent(i)}
            aria-label={`Foto ${i + 1}${i === 0 ? ' (principal)' : ''}`}
          >
            <FramedImage frame={p} variants={PRODUCT_SIZES} />
            {i === 0 && <span className="photos__main">Principal</span>}
          </button>
        ))}
        {photos.length < max && <ImageDrop compact multiple label="Agregar" onImage={add} />}
      </div>
      <div className="photos__actions">
        {photos.length > 1 && (
          <>
            <button type="button" className="btn btn--sm btn--ghost" disabled={cur === 0} onClick={() => moveTo(cur - 1)}>
              ← Mover
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={cur === photos.length - 1}
              onClick={() => moveTo(cur + 1)}
            >
              Mover →
            </button>
            {cur > 0 && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => moveTo(0)}>
                Hacer principal
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setPhotos((ps) => ps.filter((_, i) => i !== cur))}
        >
          {photos.length > 1 ? 'Quitar' : 'Cambiar foto'}
        </button>
      </div>
      {max > 1 && <small>La principal se ve en el catálogo; todas se ven al abrir el producto. Hasta {max} fotos.</small>}
    </>
  );
}

function ProductEditor({ initial, onClose }) {
  const { saveProduct, stockEnabled, discountEnabled, descriptionEnabled, imagesEnabled, costEnabled } = useData();
  const { run } = useUI();
  const [form, setForm] = useState({
    ...initial,
    price: initial.price === '' ? '' : String(initial.price),
    stock: initial.stock == null ? '' : String(initial.stock),
    discount: initial.discount ? String(initial.discount) : '',
    description: initial.description ?? '',
    cost: initial.cost == null ? '' : String(initial.cost),
  });
  // Fotos con su encuadre: las nuevas o reencuadradas se recortan al publicar.
  const [photos, setPhotos] = useState(() => productPhotos(initial).map((src) => newPhoto(src, false)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const price = Number(String(form.price).replace(/\D/g, ''));
  const stock = form.stock === '' ? null : Number(String(form.stock).replace(/\D/g, ''));
  const discount = Math.min(90, Number(String(form.discount).replace(/\D/g, '')) || 0);
  // Invertido y ganancia por unidad: se guarda lo invertido; la ganancia es el
  // precio de venta (con descuento) menos eso. Escribir uno calcula el otro.
  const cost = form.cost === '' ? null : Number(form.cost);
  const sale = salePrice({ price, discount });
  const setGain = (e) => {
    const v = e.target.value.replace(/\D/g, '');
    setForm((f) => ({ ...f, cost: v === '' ? '' : String(Math.max(0, sale - Number(v))) }));
  };

  const publish = async () => {
    if (!form.title.trim() || !form.category || !price || !photos.length) {
      setError('Completá categoría, título, precio y foto antes de publicar.');
      return;
    }
    setSaving(true);
    setError('');
    // Las fotos nuevas o reencuadradas se suben recortadas en 800 y 400 px (WebP).
    const saved = await run(
      () => saveProduct({ ...form, title: form.title.trim(), price, stock, discount, cost }, photos),
      (p) => (initial.id ? 'Cambios guardados' : `Producto publicado (${p.id})`),
    );
    setSaving(false);
    if (saved) onClose();
  };

  const previewProduct = { ...form, price, stock, discount, image: photos[0]?.src ?? '' };

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
        {costEnabled && (
          <div className="field">
            <div className="cost-pair">
              <label>
                <span>Invertido por unidad</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value.replace(/\D/g, '') }))}
                  placeholder="Lo que te costó"
                />
              </label>
              <label>
                <span>Ganancia por unidad</span>
                <input
                  className={`input ${cost != null && sale - cost < 0 ? 'is-loss' : ''}`}
                  inputMode="numeric"
                  value={cost == null ? '' : String(sale - cost)}
                  onChange={setGain}
                  disabled={!price}
                  placeholder={price ? 'Lo que te queda' : 'Primero el precio'}
                />
              </label>
            </div>
            <small>
              {cost != null && price > 0
                ? `Cada uno: se vende a ${money(sale)}, costó ${money(cost)} y te quedan ${money(sale - cost)}. `
                : 'Escribí uno y el otro sale del precio de venta. '}
              Con esto se calcula la ganancia en Ventas.
            </small>
          </div>
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
            <small>Con 0 el producto aparece como “Sin stock” y el botón pasa a “Reservarlo”.</small>
          </label>
        )}
        {descriptionEnabled && (
          <label className="field">
            <span>Descripción</span>
            <textarea
              className="textarea"
              value={form.description}
              onChange={set('description')}
              placeholder="Ej: Calabaza curada a mano, virola de alpaca cincelada. Capacidad aprox. 200 ml."
              maxLength={1500}
              rows={5}
            />
            <small>Se ve al tocar el producto en el catálogo. Podés usar varios párrafos.</small>
          </label>
        )}
        <div className="field">
          <span>{imagesEnabled ? 'Fotos' : 'Foto'}</span>
          <PhotosField photos={photos} setPhotos={setPhotos} max={imagesEnabled ? MAX_PHOTOS : 1} />
        </div>
      </div>

      <div>
        <div className="preview-frame">
          <span className="preview-frame__label">Así se va a ver en el catálogo</span>
          <div style={{ maxWidth: 260, margin: '0 auto' }}>
            <ProductCard product={previewProduct} frame={photos[0]} preview />
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
  const {
    products,
    settings,
    deleteProduct,
    setFeatured,
    stockEnabled,
    discountEnabled,
    descriptionEnabled,
    imagesEnabled,
    costEnabled,
  } = useData();
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
  const missingMigrations = [
    !stockEnabled && { feature: 'el stock', file: 'migrations_stock.sql' },
    !discountEnabled && { feature: 'los descuentos', file: 'migrations_discount.sql' },
    !descriptionEnabled && { feature: 'las descripciones', file: 'migrations_description.sql' },
    !imagesEnabled && { feature: 'varias fotos por producto', file: 'migrations_images.sql' },
    !costEnabled && { feature: 'la plata invertida y la ganancia', file: 'migrations_cost.sql' },
  ].filter(Boolean);
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
      {missingMigrations.length > 0 && (
        <p className="warn">
          Para usar {listJoin(missingMigrations.map((m) => m.feature))} falta un paso en Supabase: abrí el SQL Editor y
          corré{' '}
          {missingMigrations.map((m, i) => (
            <span key={m.file}>
              {i > 0 && (i === missingMigrations.length - 1 ? ' y ' : ', ')}
              <code>supabase/{m.file}</code>
            </span>
          ))}
          . Después recargá esta página.
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
              {costEnabled && (
                <InlineNumber
                  product={p}
                  field="cost"
                  label="Invertido $"
                  empty={null}
                  max={99999999}
                  wide
                  title="Plata invertida por unidad (vacío = sin cargar)"
                  okText={(n) => (n == null ? 'Invertido borrado' : `Invertido guardado: ganás ${money(salePrice(p) - n)} por unidad`)}
                  extra={(n) =>
                    n != null && (
                      <b className={`cost-gain ${salePrice(p) - n < 0 ? 'is-loss' : ''}`}>+{money(salePrice(p) - n)}</b>
                    )
                  }
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
