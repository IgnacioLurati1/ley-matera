import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useProductMap } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { getImageSize, previewDataUrl } from '../../lib/image';
import { money, todayISO } from '../../lib/format';
import { salePrice } from '../../lib/pricing';
import PromoBanner from '../../components/PromoBanner';
import { PromoView } from '../PromoPage';
import ImagePositioner from '../../components/ImagePositioner';
import ImageDrop from '../../components/ImageDrop';
import ProductPicker from '../../components/ProductPicker';
import ProductImage from '../../components/ProductImage';
import { DECORATION_OPTIONS, DecorationSwatch } from '../../components/PromoDecoration';
import { ArrowLeft, TrashIcon } from '../../components/Icons';
import { assetUrl } from '../../lib/assets';

// Tamaño mínimo recomendado para fondos: se ven bien en pantallas grandes
// tanto en el banner del home (≈2.4:1) como en la vista de la promo.
export const BG_MIN = { width: 1920, height: 800 };

export const DEFAULT_BACKGROUNDS = [
  { name: 'Yerbal', src: '/assets/promos/fondos/yerbal.svg' },
  { name: 'Madera', src: '/assets/promos/fondos/madera.svg' },
  { name: 'Crema', src: '/assets/promos/fondos/crema.svg' },
  { name: 'Atardecer', src: '/assets/promos/fondos/atardecer.svg' },
  { name: 'Pizarra', src: '/assets/promos/fondos/pizarra.svg' },
];

const in30days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const blankPromo = () => ({
  id: null,
  title: '',
  headline: '',
  message: '',
  endDate: in30days(),
  active: true,
  background: { src: DEFAULT_BACKGROUNDS[0].src, x: 50, y: 50, zoom: 1 },
  decoration: { type: 'laurel', color: '#f4eee0' },
  textColor: '#ffffff',
  shade: 1,
  items: [],
});

export default function PromoEditor() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const { promos, savePromo, loading } = useData();
  const pMap = useProductMap();
  const { toast, run } = useUI();
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [promo, setPromo] = useState(null);
  const [view, setView] = useState('home');
  const [sizeWarn, setSizeWarn] = useState('');

  useEffect(() => {
    if (loading) return;
    if (isNew) setPromo(blankPromo());
    else {
      const found = promos.find((p) => p.id === id);
      setPromo(found ? { shade: 1, ...found } : null);
    }
    // Sólo al entrar: no pisamos lo que el admin está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]);

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!promo) {
    return (
      <div className="panel empty-state">
        <h3>No encontramos esa promo</h3>
        <Link to="/admin/promos" className="btn">Volver a promos</Link>
      </div>
    );
  }

  const set = (patch) => setPromo((p) => ({ ...p, ...patch }));
  const setField = (k) => (e) => set({ [k]: e.target.value });

  const onUpload = async (src) => {
    const { width, height } = await getImageSize(src);
    setSizeWarn(
      width < BG_MIN.width || height < BG_MIN.height
        ? `La imagen mide ${width} × ${height} px. Para que se vea nítida recomendamos al menos ${BG_MIN.width} × ${BG_MIN.height} px.`
        : '',
    );
    // Se sube recién al guardar (en 1920 y 960 px); acá sólo se muestra.
    set({ background: { src: await previewDataUrl(src), x: 50, y: 50, zoom: 1 } });
  };

  const addItem = (p) => set({ items: [...promo.items, { productId: p.id, promoPrice: null }] });
  const setItemPrice = (pid, value) => {
    const n = Number(String(value).replace(/\D/g, ''));
    set({ items: promo.items.map((i) => (i.productId === pid ? { ...i, promoPrice: value === '' ? null : n } : i)) });
  };
  const removeItem = (pid) => set({ items: promo.items.filter((i) => i.productId !== pid) });

  const save = async () => {
    if (!promo.title.trim()) return toast('Ponele un título a la promo', 'error');
    if (!promo.items.length) return toast('Sumá al menos un producto', 'error');
    setSaving(true);
    const saved = await run(
      () => savePromo({ ...promo, title: promo.title.trim() }),
      isNew ? 'Promo creada' : 'Cambios guardados',
    );
    setSaving(false);
    if (saved) navigate('/admin/promos');
    return undefined;
  };

  const expired = promo.endDate && promo.endDate < todayISO();

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <Link to="/admin/promos" className="btn btn--ghost btn--sm"><ArrowLeft size={16} /> Promos</Link>
        <button className="btn btn--accent" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : isNew ? 'Crear promo' : 'Guardar cambios'}
        </button>
      </div>

      <div className="admin-grid-2">
        <div>
          <div className="panel">
            <h3>1. Textos y duración</h3>
            <label className="field">
              <span>Título de la promo</span>
              <input className="input" value={promo.title} onChange={setField('title')} placeholder="Ej: Día de la Madre" maxLength={60} />
              <small>Nombre interno y el que aparece en el pedido de WhatsApp.</small>
            </label>
            <label className="field">
              <span>Título visible</span>
              <input className="input" value={promo.headline} onChange={setField('headline')} placeholder="Ej: ¡Mimá a mamá con un buen mate! 💐" maxLength={80} />
            </label>
            <label className="field">
              <span>Mensaje</span>
              <textarea className="textarea" value={promo.message} onChange={setField('message')} placeholder="Contá de qué se trata la promo…" maxLength={320} />
            </label>
            <div className="admin-grid-2" style={{ gap: 12 }}>
              <label className="field">
                <span>Se deja de mostrar después del</span>
                <input className="input" type="date" value={promo.endDate} min={todayISO()} onChange={setField('endDate')} />
                {expired && <small style={{ color: 'var(--danger)' }}>Esta fecha ya pasó: la promo no se muestra.</small>}
              </label>
              <label className="field" style={{ justifyContent: 'center' }}>
                <span>Estado</span>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                  <input type="checkbox" checked={promo.active !== false} onChange={(e) => set({ active: e.target.checked })} />
                  Activa
                </label>
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>2. Fondo</h3>
            <p className="hint">
              Elegí uno de los fondos listos o subí una foto propia. Tamaño mínimo recomendado:{' '}
              <strong>{BG_MIN.width} × {BG_MIN.height} px</strong> (horizontal). Dejá lo importante en el centro.
            </p>
            <div className="swatches" style={{ marginBottom: 12 }}>
              {DEFAULT_BACKGROUNDS.map((b) => (
                <button
                  key={b.src}
                  type="button"
                  className={`swatch ${promo.background.src === b.src ? 'is-active' : ''}`}
                  onClick={() => {
                    setSizeWarn('');
                    set({ background: { src: b.src, x: 50, y: 50, zoom: 1 } });
                  }}
                >
                  <img src={assetUrl(b.src)} alt="" />
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
            <ImageDrop onImage={onUpload} hint={`Mínimo ${BG_MIN.width} × ${BG_MIN.height} px · JPG o PNG`} />
            {sizeWarn && <p className="warn" style={{ marginTop: 10 }}>{sizeWarn}</p>}
            <div style={{ marginTop: 14 }}>
              <span className="preview-frame__label">
                Encuadre ({view === 'home' ? 'banner del home' : 'vista de la promo'})
              </span>
              <ImagePositioner
                frame={promo.background}
                onChange={(background) => set({ background })}
                aspect={view === 'home' ? 2.4 : 3}
              />
            </div>
          </div>

          <div className="panel">
            <h3>3. Decoración y colores</h3>
            <div className="swatches" style={{ marginBottom: 14 }}>
              {DECORATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`deco-opt ${promo.decoration?.type === d.value ? 'is-active' : ''}`}
                  onClick={() => set({ decoration: { ...promo.decoration, type: d.value } })}
                >
                  {d.value === 'none' ? (
                    <span className="deco-opt__empty">—</span>
                  ) : (
                    <DecorationSwatch type={d.value} color={promo.decoration?.color} />
                  )}
                  {d.name}
                </button>
              ))}
            </div>
            <div className="admin-grid-3" style={{ gap: 12 }}>
              <label className="field">
                <span>Color decoración</span>
                <input
                  type="color"
                  value={promo.decoration?.color ?? '#ffffff'}
                  onChange={(e) => set({ decoration: { ...promo.decoration, color: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Color del texto</span>
                <input type="color" value={promo.textColor ?? '#ffffff'} onChange={setField('textColor')} />
              </label>
              <label className="field">
                <span>Oscurecer fondo</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={promo.shade ?? 1}
                  onChange={(e) => set({ shade: Number(e.target.value) })}
                  style={{ accentColor: 'var(--green)' }}
                />
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>4. Productos de la promo</h3>
            <p className="hint">Dejá el precio promo vacío si el producto entra a la promo sin descuento.</p>
            {promo.items.length > 0 && (
              <ul className="alist" style={{ marginBottom: 14 }}>
                {promo.items.map((i) => {
                  const p = pMap.get(i.productId);
                  if (!p) return null;
                  return (
                    <li key={i.productId} className="alist__item">
                      <ProductImage src={p.image} alt="" className="alist__img" />
                      <div className="alist__info">
                        <strong>{p.title}</strong>
                        <span>Precio normal {money(p.price)}{p.discount > 0 && ` (con ${p.discount}% off: ${money(salePrice(p))})`}</span>
                      </div>
                      <div className="alist__actions">
                        <input
                          className="input"
                          style={{ width: 120 }}
                          inputMode="numeric"
                          placeholder="Precio promo"
                          value={i.promoPrice ?? ''}
                          onChange={(e) => setItemPrice(i.productId, e.target.value)}
                          aria-label={`Precio promo de ${p.title}`}
                        />
                        <button className="icon-btn is-danger" onClick={() => removeItem(i.productId)} title="Quitar">
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <ProductPicker selected={promo.items.map((i) => i.productId)} onPick={addItem} />
          </div>
        </div>

        <div className="sticky-desktop">
          <div className="panel">
            <div className="panel__head">
              <h3 style={{ margin: 0 }}>Vista previa</h3>
              <div className="segmented">
                <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}>Home</button>
                <button className={view === 'page' ? 'is-active' : ''} onClick={() => setView('page')}>Vista de la promo</button>
              </div>
            </div>
            <div className="preview-frame" style={{ padding: view === 'page' ? 0 : 16, overflow: 'hidden' }}>
              {view === 'home' ? (
                <PromoBanner promo={{ ...promo, id: promo.id ?? 'preview' }} preview />
              ) : (
                <div style={{ maxHeight: 640, overflow: 'auto' }}>
                  <PromoView promo={{ ...promo, id: promo.id ?? 'preview' }} preview />
                </div>
              )}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              La vista previa se adapta al ancho de este panel; en el sitio real el banner ocupa todo el ancho.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
