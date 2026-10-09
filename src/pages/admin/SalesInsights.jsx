import { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { STATUSES, collected, isPaid, orderSpent } from '../../context/OrdersContext';
import { purchasesTotal, usePurchases } from '../../context/PurchasesContext';
import { money } from '../../lib/format';

const MONTHS = 6;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
};
const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);

// Estadísticas del panel de ventas: ganancia, evolución por mes, ticket
// promedio, productos más vendidos y cómo están repartidas las ventas por estado.
export default function SalesInsights({ orders }) {
  const { products } = useData();
  const { purchases } = usePurchases();

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'cancelado');

    // Últimos 6 meses (incluido el actual), aunque no tengan ventas.
    const now = new Date();
    const months = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return { key: monthKey(d), sold: 0, got: 0, count: 0 };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    active.forEach((o) => {
      const m = byKey.get(monthKey(new Date(o.createdAt)));
      if (!m) return;
      m.sold += o.price;
      m.got += collected(o);
      m.count += 1;
    });
    const max = Math.max(1, ...months.map((m) => m.sold));
    const [prev, current] = months.slice(-2);

    // Más vendidos: por unidades, a partir de los pedidos leídos con código.
    const titles = new Map(products.map((p) => [p.id, p.title]));
    const units = new Map();
    active.forEach((o) =>
      (o.items ?? []).forEach((i) => units.set(i.productId, (units.get(i.productId) ?? 0) + (i.qty || 1))),
    );
    const top = [...units.entries()]
      .map(([id, qty]) => ({ id, qty, title: titles.get(id) ?? `Producto ${id} (eliminado)` }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Ganancia total: lo cobrado en ventas pagadas o entregadas menos lo
    // invertido, que es el total de las compras de mercadería (Compras) más lo
    // invertido por artículo en las ventas que lo tienen (Productos o cambiado
    // en la tabla). Sin compras cargadas, se avisan las ventas sin invertido.
    const byId = new Map(products.map((p) => [p.id, p]));
    const profit = { got: 0, sales: 0, count: 0, unknown: 0, unknownSum: 0 };
    orders.filter(isPaid).forEach((o) => {
      const spent = orderSpent(o, byId);
      profit.got += o.price;
      profit.sales += spent ?? 0;
      profit.count += 1;
      if (spent == null) {
        profit.unknown += 1;
        profit.unknownSum += o.price;
      }
    });
    profit.purchases = purchasesTotal(purchases);
    profit.spent = profit.sales + profit.purchases;
    profit.gain = profit.got - profit.spent;
    profit.margin = profit.got ? Math.round((profit.gain / profit.got) * 100) : null;
    // Plata que sigue invertida en mercadería sin vender.
    profit.inStock = products.reduce((n, p) => n + (p.cost != null && p.stock > 0 ? p.cost * p.stock : 0), 0);

    const withDeposit = active.filter((o) => o.deposit > 0).length;
    const byStatus = STATUSES.map((s) => ({ ...s, count: orders.filter((o) => o.status === s.id).length }));

    return {
      months,
      max,
      current,
      change: pctChange(current.sold, prev.sold),
      avg: active.length ? Math.round(active.reduce((n, o) => n + o.price, 0) / active.length) : 0,
      depositRate: active.length ? Math.round((withDeposit / active.length) * 100) : 0,
      top,
      topMax: top[0]?.qty ?? 1,
      byStatus,
      total: orders.length,
      profit,
    };
  }, [orders, products, purchases]);

  if (!orders.length) return null;

  return (
    <div className="insights">
      <section className="panel insights__profit">
        <h2>Ganancia</h2>
        <div className="profit">
          <div className="profit__item">
            <span>Cobrado</span>
            <strong>{money(stats.profit.got)}</strong>
            <small>
              {stats.profit.count} {stats.profit.count === 1 ? 'venta pagada' : 'ventas pagadas'}
            </small>
          </div>
          <b className="profit__op" aria-hidden>
            −
          </b>
          <div className="profit__item">
            <span>Invertido</span>
            <strong>{money(stats.profit.spent)}</strong>
            <small>
              {stats.profit.purchases && stats.profit.sales
                ? `Compras ${money(stats.profit.purchases)} + artículos ${money(stats.profit.sales)}`
                : stats.profit.purchases
                  ? 'Compras de mercadería'
                  : 'En lo que se vendió'}
            </small>
          </div>
          <b className="profit__op" aria-hidden>
            =
          </b>
          <div className={`profit__item is-gain ${stats.profit.gain < 0 ? 'is-loss' : ''}`}>
            <span>Ganancia total</span>
            <strong>{money(stats.profit.gain)}</strong>
            <small>{stats.profit.margin != null ? `${stats.profit.margin}% de lo cobrado` : 'Todavía sin ventas pagadas'}</small>
          </div>
        </div>
        {stats.profit.unknown > 0 && !stats.profit.purchases && (
          <p className="warn">
            {stats.profit.unknown === 1 ? '1 venta pagada' : `${stats.profit.unknown} ventas pagadas`} (
            {money(stats.profit.unknownSum)}) no {stats.profit.unknown === 1 ? 'tiene' : 'tienen'} invertido: cargá las
            compras en Compras, o lo invertido en Productos o en la tabla de ventas.
          </p>
        )}
        {stats.profit.inStock > 0 && (
          <p className="hint">Además tenés {money(stats.profit.inStock)} invertidos en stock sin vender.</p>
        )}
      </section>

      <section className="panel insights__chart">
        <div className="panel__head" style={{ marginBottom: 8 }}>
          <h2>Ventas por mes</h2>
          <div className="insights__legend">
            <span className="is-sold">Vendido</span>
            <span className="is-got">Cobrado</span>
          </div>
        </div>
        <div className="bars" role="img" aria-label="Vendido y cobrado en los últimos 6 meses">
          {stats.months.map((m) => (
            <div key={m.key} className="bars__col" title={`${money(m.sold)} vendido · ${money(m.got)} cobrado`}>
              <div className="bars__stack">
                <span className="bars__sold" style={{ height: `${(m.sold / stats.max) * 100}%` }}>
                  <span className="bars__got" style={{ height: m.sold ? `${(m.got / m.sold) * 100}%` : 0 }} />
                </span>
              </div>
              <strong>{m.sold ? money(m.sold) : '—'}</strong>
              <small>{monthName(m.key)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel insights__facts">
        <div className="fact">
          <span>Este mes</span>
          <strong>{money(stats.current.sold)}</strong>
          <small>
            {stats.current.count} {stats.current.count === 1 ? 'venta' : 'ventas'}
            {stats.change != null && (
              <em className={stats.change >= 0 ? 'is-up' : 'is-down'}>
                {' '}
                {stats.change >= 0 ? '+' : ''}
                {stats.change}% vs. mes anterior
              </em>
            )}
          </small>
        </div>
        <div className="fact">
          <span>Ticket promedio</span>
          <strong>{money(stats.avg)}</strong>
          <small>Por venta, sin canceladas</small>
        </div>
        <div className="fact">
          <span>Dejan seña</span>
          <strong>{stats.depositRate}%</strong>
          <small>De las ventas registradas</small>
        </div>
      </section>

      <section className="panel insights__top">
        <h2>Lo más vendido</h2>
        {stats.top.length ? (
          <ol className="toplist">
            {stats.top.map((t) => (
              <li key={t.id}>
                <span className="toplist__name">{t.title}</span>
                <span className="toplist__bar">
                  <span style={{ width: `${(t.qty / stats.topMax) * 100}%` }} />
                </span>
                <strong>{t.qty} u.</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint">
            Aparece cuando registres pedidos desde el lector (las ventas a mano no traen productos).
          </p>
        )}
      </section>

      <section className="panel insights__status">
        <h2>Por estado</h2>
        <div className="statusbar" aria-hidden>
          {stats.byStatus
            .filter((s) => s.count)
            .map((s) => (
              <span key={s.id} className={`is-${s.id}`} style={{ flexGrow: s.count }} />
            ))}
        </div>
        <ul className="statuslist">
          {stats.byStatus.map((s) => (
            <li key={s.id}>
              <i className={`dot is-${s.id}`} />
              {s.label}
              <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
