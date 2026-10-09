import { useState } from 'react';
import { usePurchases, purchasesTotal } from '../../context/PurchasesContext';
import { useProductMap } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { money } from '../../lib/format';
import Modal from '../../components/Modal';
import ProductImage from '../../components/ProductImage';
import ProductPicker from '../../components/ProductPicker';
import { TrashIcon } from '../../components/Icons';
import './Purchases.css';

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayLabel = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
};
const digits = (v) => String(v).replace(/\D/g, '');
const unitsOf = (items) => items.reduce((n, i) => n + (i.qty || 0), 0);
// Texto del aviso con el stock que quedó en cada producto.
const stockText = (base, verb, changes) =>
  changes?.length ? `${base}. ${verb}: ${changes.map((c) => `${c.title} (queda ${c.stock})`).join(', ')}` : base;

const empty = (boughtOn = today()) => ({ boughtOn, total: '', note: '', items: [] });

// Compras de mercadería: órdenes de compra que ya llegaron. Lo que entró se
// suma al stock y lo que salió se descuenta de la ganancia en Ventas.
export default function PurchasesAdmin() {
  const { purchases, loading, missing, addPurchase, deletePurchase } = usePurchases();
  const byId = useProductMap();
  const { run } = useUI();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setQty = (productId, qty) =>
    set({ items: form.items.map((i) => (i.productId === productId ? { ...i, qty: digits(qty) } : i)) });
  const total = Number(form.total) || 0;
  const ready = total > 0 && form.boughtOn && form.items.every((i) => Number(i.qty) > 0);
  const title = (i) => byId.get(i.productId)?.title ?? i.title ?? `Producto ${i.productId} (eliminado)`;

  const save = async () => {
    setSaving(true);
    const items = form.items.map((i) => ({ productId: i.productId, title: i.title, qty: Number(i.qty) }));
    const ok = await run(
      () => addPurchase({ boughtOn: form.boughtOn, total, note: form.note.trim(), items }),
      (r) => stockText('Compra guardada', 'Stock sumado', r.changes),
    );
    setSaving(false);
    if (ok) setForm(empty(form.boughtOn));
  };

  if (missing) {
    return (
      <div className="panel">
        <h2>Compras</h2>
        <p className="warn">
          Falta crear la tabla de compras en Supabase. Abrí <strong>SQL Editor</strong>, pegá el contenido de{' '}
          <code>supabase/migrations_purchases.sql</code> y tocá <strong>Run</strong>. Después recargá esta página.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="admin-grid-2">
        <div className="panel">
          <h2>Nueva compra</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Una orden de compra que ya llegó. Los productos que entraron se suman al stock y lo que salió se descuenta
            de la ganancia en Ventas.
          </p>
          <div className="purchase-form__row">
            <label className="field">
              <span>Fecha</span>
              <input
                className="input"
                type="date"
                value={form.boughtOn}
                max={today()}
                onChange={(e) => set({ boughtOn: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Cuánto salió</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="$ 0"
                value={total ? money(total) : ''}
                onChange={(e) => set({ total: digits(e.target.value) })}
              />
            </label>
          </div>
          <label className="field">
            <span>Detalle</span>
            <input
              className="input"
              placeholder="Proveedor, factura… (opcional)"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>
          <div className="field">
            <span>Productos que entraron</span>
            {form.items.length > 0 && (
              <ul className="alist">
                {form.items.map((i) => {
                  const p = byId.get(i.productId);
                  return (
                    <li key={i.productId} className="alist__item alist__item--icons">
                      <ProductImage src={p?.image} alt="" className="alist__img" />
                      <div className="alist__info">
                        <strong>{title(i)}</strong>
                        <span>{p?.stock == null ? 'No controla stock' : `Stock ahora: ${p.stock}`}</span>
                      </div>
                      <div className="alist__actions">
                        <input
                          className="input purchase-form__qty"
                          inputMode="numeric"
                          value={i.qty}
                          onChange={(e) => setQty(i.productId, e.target.value)}
                          aria-label={`Unidades de ${title(i)}`}
                        />
                        <span className="purchase-form__unit">u.</span>
                        <button
                          type="button"
                          className="icon-btn is-danger"
                          title="Quitar"
                          onClick={() => set({ items: form.items.filter((x) => x.productId !== i.productId) })}
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <ProductPicker
              selected={form.items.map((i) => i.productId)}
              onPick={(p) => set({ items: [...form.items, { productId: p.id, title: p.title, qty: '1' }] })}
            />
          </div>
          <button className="btn" disabled={!ready || saving} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar compra'}
          </button>
        </div>

        <div className="panel">
          <div className="panel__head">
            <h2>Compras cargadas</h2>
            <strong className="purchase-total">{money(purchasesTotal(purchases))}</strong>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 160 }} />
          ) : purchases.length === 0 ? (
            <p className="hint">Todavía no cargaste compras.</p>
          ) : (
            <ul className="plist">
              {purchases.map((pu) => (
                <li key={pu.id} className="plist__item">
                  <div className="plist__head">
                    <strong>{money(pu.total)}</strong>
                    <span>{dayLabel(pu.boughtOn)}</span>
                    <button
                      type="button"
                      className="icon-btn is-danger"
                      aria-label="Eliminar compra"
                      onClick={() => setConfirm(pu)}
                    >
                      <TrashIcon size={18} />
                    </button>
                  </div>
                  {pu.note && <p className="plist__note">{pu.note}</p>}
                  {pu.items.length > 0 && (
                    <p className="plist__items">{pu.items.map((i) => `${i.qty} × ${title(i)}`).join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            El total de las compras se descuenta de la ganancia total en Ventas.
          </p>
        </div>
      </div>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="¿Eliminar compra?" size="sm">
        <p>
          Vas a borrar la compra de <strong>{confirm && money(confirm.total)}</strong>
          {confirm && ` del ${dayLabel(confirm.boughtOn)}`}.
          {confirm?.items.length > 0 &&
            (unitsOf(confirm.items) === 1
              ? ' La unidad que entró se descuenta del stock.'
              : ` Las ${unitsOf(confirm.items)} unidades que entraron se descuentan del stock.`)}
        </p>
        <div className="toolbar" style={{ justifyContent: 'flex-end', margin: 0 }}>
          <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
            Volver
          </button>
          <button
            className="btn btn--danger"
            onClick={async () => {
              const id = confirm.id;
              setConfirm(null);
              await run(
                () => deletePurchase(id),
                (changes) => stockText('Compra eliminada', 'Stock descontado', changes),
              );
            }}
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </>
  );
}
