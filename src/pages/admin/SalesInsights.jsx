import { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { STATUSES, collected } from '../../context/OrdersContext';
import { money } from '../../lib/format';

const MONTHS = 6;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
};
const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);

// Estadísticas del panel de ventas: evolución por mes, ticket promedio,
// productos más vendidos y cómo están repartidas las ventas por estado.
export default function SalesInsights({ orders }) {
  const { products } = useData();

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
    };
  }, [orders, products]);

  if (!orders.length) return null;

  return (
    <div className="insights">
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
