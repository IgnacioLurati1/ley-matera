import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isPromoLive, useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { decodeOrder, findCodes, parseLooseIds } from '../../lib/orderCode';
import { money } from '../../lib/format';
import { unitPrice } from '../../lib/pricing';
import { categoryLabel } from '../../config/categories';
import ProductImage from '../../components/ProductImage';
import { STATUSES, halfOf, stockToast, useOrders, withReserved } from '../../context/OrdersContext';
import './Sales.css';

const REGISTER_STATUSES = STATUSES.filter((s) => s.id !== 'cancelado' && s.id !== 'entregado');

// Texto de la columna PRODUCTO: "2x Mate imperial + Bombilla pico de loro".
const describe = (lines) =>
  lines.map((l) => `${l.qty > 1 ? `${l.qty}x ` : ''}${l.product?.title ?? l.productId}`).join(' + ');

// Carga el pedido leído como venta: cliente, precio y si quedó reservado,
// señado o pagado. Después se sigue editando en Ventas. Si trae productos sin
// stock arranca siempre como "Reservado".
function RegisterSale({ order, total }) {
  const { orders, addOrder, missing } = useOrders();
  const { run } = useUI();
  const reserved = order.lines.filter((l) => l.reserved > 0);
  const [client, setClient] = useState('');
  const [description, setDescription] = useState(() => describe(order.lines));
  const [price, setPrice] = useState(String(total));
  const [status, setStatus] = useState('reservado');
  const [deposit, setDeposit] = useState('');
  const [saved, setSaved] = useState(null);

  const priceN = Number(price) || 0;
  const depositN = status === 'senado' ? Number(deposit) || 0 : 0;
  const tracked = order.lines.filter((l) => l.product?.stock != null && l.qty > l.reserved);
  const existing = order.code ? orders.find((o) => o.code === order.code) : null;

  const pick = (id) => {
    setStatus(id);
    if (id === 'senado' && !deposit) setDeposit(String(halfOf(priceN)));
  };

  if (missing) {
    return (
      <p className="warn" style={{ marginTop: 12 }}>
        Para registrar ventas falta crear la tabla en Supabase: corré <code>supabase/migrations_orders.sql</code>.
      </p>
    );
  }
  if (saved) {
    return (
      <p className="ok" style={{ marginTop: 12 }}>
        Venta registrada para <strong>{saved.client || 'sin nombre'}</strong>. <Link to="/admin">Ver en Ventas</Link>
      </p>
    );
  }

  return (
    <form
      className="register"
      onSubmit={async (e) => {
        e.preventDefault();
        const items = order.lines.map((l) => ({ productId: l.productId, promoId: l.promoId, qty: l.qty }));
        const result = await run(
          () =>
            addOrder({
              code: order.code,
              client: client.trim(),
              description: description.trim(),
              items,
              price: priceN,
              deposit: depositN,
              status,
            }),
          (moved) => stockToast(moved.stock, 'Venta registrada'),
        );
        if (result) setSaved(result.order);
      }}
    >
      <h4>Registrar esta venta</h4>
      {reserved.length > 0 && (
        <p className="register__reserve">
          Hay productos sin stock ({reserved.map((l) => `${l.reserved} × ${l.product.title}`).join(', ')}): la venta
          queda como <strong>Reservado</strong> y esas unidades no se descuentan del stock.
        </p>
      )}
      {existing && (
        <p className="warn">
          Este código ya está cargado a nombre de <strong>{existing.client || 'sin nombre'}</strong>. Si lo registrás de
          nuevo va a quedar duplicado.
        </p>
      )}
      <div className="register__grid">
        <label className="field">
          <span>Producto (como va a figurar en el Excel)</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>Cliente</span>
          <input
            className="input"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Ej: Avril Utrera (WTSP)"
          />
        </label>
        <label className="field">
          <span>Precio total</span>
          <input
            className="input"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
          />
          <small>{money(priceN)}</small>
        </label>
      </div>
      <div className="register__status" role="radiogroup" aria-label="Estado de la venta">
        {REGISTER_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={status === s.id}
            className={`is-${s.id} ${status === s.id ? 'is-active' : ''}`}
            onClick={() => pick(s.id)}
          >
            {s.id === 'senado' ? 'Señado' : s.label}
          </button>
        ))}
      </div>
      {status === 'senado' && (
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Seña</span>
          <input
            className="input"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))}
          />
          <small>
            {money(depositN)} · {priceN ? Math.round((depositN / priceN) * 100) : 0}% del total{' '}
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeposit(String(halfOf(priceN)))}>
              50%
            </button>
          </small>
        </label>
      )}
      <div className="register__foot">
        <span className="register__sum">
          {status === 'pagado' ? (
            <>
              Pagado completo: <strong>{money(priceN)}</strong>
            </>
          ) : (
            <>
              Falta pagar: <strong>{money(Math.max(0, priceN - depositN))}</strong>
            </>
          )}
        </span>
        {tracked.length > 0 && (
          <span className="hint" style={{ flexBasis: '100%', margin: 0 }}>
            Al guardar se descuenta del stock:{' '}
            {tracked.map((l) => `${l.qty - l.reserved} × ${l.product.title}`).join(', ')}. Si después la cancelás,
            vuelve al stock.
          </span>
        )}
        <button className="btn" type="submit" disabled={!priceN && !description.trim()}>
          Guardar venta
        </button>
      </div>
    </form>
  );
}

// Resuelve los items de un pedido contra el catálogo y las promos actuales.
// `reserved` = unidades que no hay en stock (se venden como reserva).
function resolve(items, products, promos) {
  const pMap = new Map(products.map((p) => [p.id, p]));
  const prMap = new Map(promos.map((p) => [p.id, p]));
  return withReserved(items, products).map((i) => {
    const product = pMap.get(i.productId);
    const promo = i.promoId ? prMap.get(i.promoId) : null;
    const promoItem = promo?.items.find((x) => x.productId === i.productId);
    const notes = [];
    if (!product) notes.push('Producto inexistente o eliminado');
    if (i.promoId && !promo) notes.push(`La promo ${i.promoId} ya no existe`);
    else if (promo && !isPromoLive(promo)) notes.push('La promo ya no está vigente');
    if (promo && !promoItem) notes.push('El producto ya no está en esa promo');
    const unit = product ? unitPrice(product, promoItem?.promoPrice ?? null) : 0;
    return { ...i, reserved: product ? (i.reserved ?? 0) : 0, product, promo, unit, subtotal: unit * i.qty, notes };
  });
}

export default function OrderReader() {
  const { products, promos } = useData();
  const { toast } = useUI();
  const [text, setText] = useState('');

  const orders = useMemo(() => {
    if (!text.trim()) return [];
    const codes = findCodes(text);
    if (codes.length) {
      return codes.map((code) => {
        const { items, total, invalid } = decodeOrder(code);
        return { code, total, invalid, lines: resolve(items, products, promos) };
      });
    }
    const loose = parseLooseIds(text);
    return loose.length ? [{ code: null, total: null, invalid: [], lines: resolve(loose, products, promos) }] : [];
  }, [text, products, promos]);

  const summary = (o) => {
    const current = o.lines.reduce((n, l) => n + l.subtotal, 0);
    return [
      `Pedido ${o.code ?? ''}`.trim(),
      ...o.lines.map(
        (l) =>
          `• ${l.qty} x ${l.product?.title ?? l.productId} (${l.promoId ? `${l.promoId}-` : ''}${l.productId})${l.promo ? ` [${l.promo.title}]` : ''}${l.reserved ? ` (${l.reserved} sin stock, reserva)` : ''} — ${money(l.subtotal)}`,
      ),
      `Total: ${money(current)}`,
    ].join('\n');
  };

  return (
    <div className="panel">
      <h2>Lector de pedidos</h2>
      <p className="hint">
        Pegá el mensaje de WhatsApp completo, sólo el código de pedido (<code>LM-…</code>) o ids sueltos (ej:{' '}
        <code>P3 x2, PR1-P10, P7</code>). Podés pegar varios pedidos a la vez.
      </p>
      <textarea
        className="textarea"
        style={{ minHeight: 120, fontFamily: 'ui-monospace, Consolas, monospace' }}
        placeholder="Ej: LM-P12x2.PR1-P3.P7"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {text.trim() && orders.length === 0 && (
        <p className="warn">No encontramos ningún código ni id de producto en el texto.</p>
      )}

      {orders.map((o, idx) => {
        const current = o.lines.reduce((n, l) => n + l.subtotal, 0);
        const units = o.lines.reduce((n, l) => n + l.qty, 0);
        return (
          <div key={`${o.code}-${idx}`} className="preview-frame" style={{ marginTop: 16, background: 'var(--paper)' }}>
            <div className="panel__head" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>
                {o.code ? (
                  <>
                    Pedido <span className="id-pill">{o.code}</span>
                  </>
                ) : (
                  'Ids encontrados'
                )}
              </h3>
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(summary(o));
                  toast('Resumen copiado');
                }}
              >
                Copiar resumen
              </button>
            </div>
            <ul className="alist">
              {o.lines.map((l, i) => (
                <li key={i} className="alist__item" style={{ gridTemplateColumns: '56px 1fr auto' }}>
                  <ProductImage src={l.product?.image} alt="" className="alist__img" />
                  <div className="alist__info">
                    <strong>{l.product?.title ?? `Id ${l.productId}`}</strong>
                    <span>
                      <span className="id-pill">
                        {l.promoId ? `${l.promoId}-` : ''}
                        {l.productId}
                      </span>
                      {l.product && ` · ${categoryLabel(l.product.category)}`}
                      {l.promo && ` · Promo “${l.promo.title}”`}
                    </span>
                    {l.reserved > 0 && (
                      <span className="reader__reserve">
                        {l.reserved === l.qty
                          ? 'Sin stock: va como reserva'
                          : `Hay ${l.qty - l.reserved} en stock: ${l.reserved} ${l.reserved === 1 ? 'va' : 'van'} como reserva`}
                      </span>
                    )}
                    {l.notes.map((n) => (
                      <span key={n} style={{ color: 'var(--danger)', fontWeight: 700 }}>
                        ⚠ {n}
                      </span>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {l.qty} × {money(l.unit)}
                    </div>
                    <strong>{money(l.subtotal)}</strong>
                  </div>
                </li>
              ))}
            </ul>
            {o.invalid.length > 0 && (
              <p className="warn" style={{ marginTop: 10 }}>
                No se pudieron leer: {o.invalid.join(', ')}
              </p>
            )}
            <div className="cartpage__total" style={{ marginTop: 14, marginBottom: 0 }}>
              <span>
                {units} {units === 1 ? 'unidad' : 'unidades'} · Total con precios del catálogo
              </span>
              <strong>{money(current)}</strong>
            </div>
            <RegisterSale key={`${o.code}-${current}`} order={o} total={current} />
          </div>
        );
      })}
    </div>
  );
}
