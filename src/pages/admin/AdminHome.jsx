import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import {
  STATUSES,
  collected,
  depositPatch,
  halfOf,
  isPaid,
  statusLabel,
  restoresOnDelete,
  statusPatch,
  stockToast,
  toPay,
  useOrders,
} from '../../context/OrdersContext';
import { money, normalize } from '../../lib/format';
import Modal from '../../components/Modal';
import SalesInsights from './SalesInsights';
import { TrashIcon } from '../../components/Icons';
import './Sales.css';

const FILTERS = [
  { id: 'all', label: 'Todas', test: (o) => o.status !== 'cancelado' },
  { id: 'open', label: 'Por cobrar', test: (o) => o.status === 'reservado' || o.status === 'senado' },
  { id: 'paid', label: 'Pagadas', test: (o) => o.status === 'pagado' },
  { id: 'done', label: 'Entregadas', test: (o) => o.status === 'entregado' },
  { id: 'cancel', label: 'Canceladas', test: (o) => o.status === 'cancelado' },
];

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');
const digits = (v) => Number(String(v).replace(/\D/g, '')) || 0;

// Celda de texto editable: guarda al salir del campo.
function TextCell({ value, onSave, placeholder, multiline = false, label }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      className={`cell-input ${multiline ? 'cell-input--multi' : ''}`}
      value={v}
      rows={multiline ? 2 : undefined}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && e.currentTarget.blur()}
    />
  );
}

// Monto editable: muestra $ 46.000 y al tocarlo deja escribir el número.
function MoneyCell({ value, onSave, label, placeholder = '$ 0' }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value || ''));
  useEffect(() => setV(String(value || '')), [value]);
  return (
    <input
      className="cell-input cell-input--money"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={editing ? v : value ? money(value) : ''}
      onFocus={() => setEditing(true)}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={() => {
        setEditing(false);
        if (digits(v) !== value) onSave(digits(v));
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export default function AdminHome() {
  const { orders, loading, missing, addOrder, updateOrder, deleteOrder } = useOrders();
  const { run, toast } = useUI();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [exporting, setExporting] = useState(false);

  const active = useMemo(() => orders.filter((o) => o.status !== 'cancelado'), [orders]);
  const totals = useMemo(() => {
    const sold = active.reduce((n, o) => n + o.price, 0);
    const got = active.reduce((n, o) => n + collected(o), 0);
    return { sold, got, due: sold - got, open: active.filter((o) => !isPaid(o)).length };
  }, [active]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    const nq = normalize(q.trim());
    return orders.filter(
      (o) => f.test(o) && (!nq || normalize(`${o.client} ${o.description} ${o.code ?? ''}`).includes(nq)),
    );
  }, [orders, filter, q]);

  const save = (o, patch) =>
    run(
      () => updateOrder(o.id, patch),
      (moved) => stockToast(moved, ''),
    );
  const pct = totals.sold ? Math.round((totals.got / totals.sold) * 100) : 0;

  if (missing) {
    return (
      <div className="panel">
        <h2>Ventas</h2>
        <p className="warn">
          Falta crear la tabla de ventas en Supabase. Abrí <strong>SQL Editor</strong>, pegá el contenido de{' '}
          <code>supabase/migrations_orders.sql</code> y tocá <strong>Run</strong>. Después recargá esta página.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="sales-stats">
        <div className="sstat">
          <span>Vendido</span>
          <strong>{money(totals.sold)}</strong>
          <small>
            {active.length} {active.length === 1 ? 'venta' : 'ventas'}
          </small>
        </div>
        <div className="sstat sstat--ok">
          <span>Cobrado</span>
          <strong>{money(totals.got)}</strong>
          <small>Pagos completos y señas</small>
        </div>
        <div className="sstat sstat--due">
          <span>Falta cobrar</span>
          <strong>{money(totals.due)}</strong>
          <small>
            {totals.open} {totals.open === 1 ? 'venta abierta' : 'ventas abiertas'}
          </small>
        </div>
        <div className="sales-progress" aria-label={`Cobrado el ${pct}% de lo vendido`}>
          <div className="sales-progress__bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p>Cobrado el {pct}% de lo vendido</p>
        </div>
      </div>

      <SalesInsights orders={orders} />

      <div className="panel">
        <div className="panel__head">
          <h2>Ventas</h2>
          <div className="toolbar" style={{ margin: 0 }}>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => run(() => addOrder({ status: 'reservado' }), 'Fila agregada: completala en la tabla')}
            >
              + Venta a mano
            </button>
            <button
              className="btn btn--sm"
              disabled={exporting || !visible.length}
              onClick={async () => {
                setExporting(true);
                try {
                  const { exportSalesExcel } = await import('../../lib/salesExcel');
                  await exportSalesExcel(visible);
                  toast('Excel descargado');
                } catch (e) {
                  toast(`No se pudo exportar: ${e.message ?? e}`, 'error');
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? 'Exportando…' : 'Exportar a Excel'}
            </button>
          </div>
        </div>

        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder="Buscar por cliente, producto o código"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="segmented" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? 'is-active' : ''}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <small>{orders.filter(f.test).length}</small>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : visible.length === 0 ? (
          <div className="sales-empty">
            {orders.length ? (
              <p>No hay ventas con ese filtro.</p>
            ) : (
              <>
                <p>
                  Todavía no registraste ventas. Pegá un pedido en el lector para cargarlo, o agregá una fila a mano.
                </p>
                <Link to="/admin/lector" className="btn btn--sm">
                  Leer un pedido
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="sales-wrap">
            <table className="sales">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">$ Producto</th>
                  <th>Cliente</th>
                  <th className="num">$ Seña</th>
                  <th className="num">A pagar</th>
                  <th>Estado</th>
                  <th className="num">Ganancia</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id} className={`is-${o.status}`}>
                    <td>
                      <TextCell
                        multiline
                        value={o.description}
                        placeholder="Qué se llevó"
                        label="Producto"
                        onSave={(description) => save(o, { description })}
                      />
                      <span className="sales__meta">
                        {shortDate(o.createdAt)}
                        {o.code && <span className="id-pill">{o.code}</span>}
                      </span>
                    </td>
                    <td className="num">
                      <MoneyCell value={o.price} label="Precio" onSave={(price) => save(o, { price })} />
                    </td>
                    <td>
                      <TextCell
                        value={o.client}
                        placeholder="Nombre (WTSP / IG)"
                        label="Cliente"
                        onSave={(client) => save(o, { client })}
                      />
                    </td>
                    <td className="num">
                      <MoneyCell
                        value={o.deposit}
                        label="Seña"
                        placeholder="Sin seña"
                        onSave={(deposit) => save(o, depositPatch(o, deposit))}
                      />
                      {o.price > 0 && !o.deposit && !isPaid(o) && o.status !== 'cancelado' && (
                        <button
                          type="button"
                          className="sales__half"
                          onClick={() => save(o, depositPatch(o, halfOf(o.price)))}
                        >
                          Señar 50%
                        </button>
                      )}
                    </td>
                    <td className="num sales__due">{money(toPay(o))}</td>
                    <td>
                      <select
                        className={`status-select is-${o.status}`}
                        value={o.status}
                        aria-label="Estado"
                        onChange={(e) => save(o, statusPatch(o, e.target.value))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      {isPaid(o) ? (
                        <strong>{money(o.price)}</strong>
                      ) : (
                        <span className="sales__missing">Falta pagar</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn is-danger"
                        aria-label="Eliminar venta"
                        onClick={() => setConfirm(o)}
                      >
                        <TrashIcon size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          Tocá cualquier celda para editarla; se guarda sola. El Excel sale con las ventas que estás viendo y con el
          formato de la planilla de ventas.
        </p>
      </div>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="¿Eliminar venta?" size="sm">
        <p>
          Vas a borrar la venta de <strong>{confirm?.client || 'sin cliente'}</strong>
          {confirm?.description ? ` (${confirm.description})` : ''}. Si sólo se cayó, mejor marcala como{' '}
          {statusLabel('cancelado').toLowerCase()} y queda el registro.
          {confirm && confirm.items?.length > 0 && (
            <>
              {' '}
              {restoresOnDelete(confirm)
                ? 'Los productos vuelven al stock.'
                : 'Como ya estaba cobrada o entregada, el stock no se toca.'}
            </>
          )}
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
                () => deleteOrder(id),
                (moved) => stockToast(moved, 'Venta eliminada'),
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
