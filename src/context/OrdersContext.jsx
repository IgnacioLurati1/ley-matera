import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useData } from './DataContext';

// Ventas registradas (tabla `orders`, privada). Sólo se monta dentro del panel,
// así que siempre hay un admin logueado.
const OrdersContext = createContext(null);

export const STATUSES = [
  { id: 'reservado', label: 'Reservado' },
  { id: 'senado', label: 'Señado' },
  { id: 'pagado', label: 'Pagado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

// Cuentas de una venta, igual que las columnas del Excel.
export const isPaid = (o) => o.status === 'pagado' || o.status === 'entregado';
export const toPay = (o) => Math.max(0, o.price - o.deposit);
export const collected = (o) => (o.status === 'cancelado' ? 0 : isPaid(o) ? o.price : Math.min(o.deposit, o.price));
export const halfOf = (price) => Math.round(price / 2);

// Cambios de estado con sus reglas: señar sin monto propone el 50%;
// volver a "reservado" borra la seña.
export const statusPatch = (order, status) => {
  if (status === 'senado' && !order.deposit) return { status, deposit: halfOf(order.price) };
  if (status === 'reservado') return { status, deposit: 0 };
  return { status };
};
export const depositPatch = (order, deposit) => {
  if (deposit > 0 && order.status === 'reservado') return { deposit, status: 'senado' };
  if (!deposit && order.status === 'senado') return { deposit, status: 'reservado' };
  return { deposit };
};

// Texto para el aviso cuando una venta movió stock.
export const stockToast = (moved, base) => {
  if (!moved?.changes?.length) return base;
  const list = moved.changes.map((c) => `${c.title} (queda ${c.stock})`).join(', ');
  return `${base ? `${base}. ` : ''}${moved.sign < 0 ? 'Stock descontado' : 'Stock devuelto'}: ${list}`;
};

// El stock queda descontado mientras la venta no esté cancelada.
// Al borrarla sólo se devuelve si todavía no se había cobrado ni entregado
// (si ya se pagó o entregó, el mate efectivamente se fue).
const holdsStock = (o) => o.status !== 'cancelado';
export const restoresOnDelete = (o) => o.status === 'reservado' || o.status === 'senado';

const COLS = 'id,code,client,description,items,price,deposit,status,note,created_at';
const fromRow = (r) => ({
  id: r.id,
  code: r.code,
  client: r.client,
  description: r.description,
  items: r.items ?? [],
  price: r.price,
  deposit: r.deposit,
  status: r.status,
  note: r.note,
  createdAt: r.created_at,
});
const toRow = (o) => ({
  code: o.code ?? null,
  client: o.client ?? '',
  description: o.description ?? '',
  items: o.items ?? [],
  price: Math.max(0, Math.round(o.price || 0)),
  deposit: Math.max(0, Math.round(o.deposit || 0)),
  status: o.status ?? 'reservado',
  note: o.note ?? '',
});

const ensure = ({ error, data }) => {
  if (error) throw error;
  return data;
};
// La tabla todavía no existe (falta correr supabase/migrations_orders.sql).
const isMissingTable = (e) =>
  e &&
  (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''));

export function OrdersProvider({ children }) {
  const { adjustStock } = useData();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [missing, setMissing] = useState(false);
  const ref = useRef(orders);
  ref.current = orders;

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('orders')
      .select(COLS)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setMissing(isMissingTable(error));
        else setOrders(data.map(fromRow));
        setLoading(false);
      });
  }, []);

  const guard = useCallback(() => {
    if (!supabase) throw new Error('Falta configurar Supabase (.env).');
    if (missing) throw new Error('Falta crear la tabla de ventas en Supabase (supabase/migrations_orders.sql).');
  }, [missing]);

  const addOrder = useCallback(
    async (order) => {
      guard();
      const saved = fromRow(ensure(await supabase.from('orders').insert(toRow(order)).select(COLS).single()));
      setOrders((list) => [saved, ...list]);
      const changes = holdsStock(saved) ? await adjustStock(saved.items, -1) : [];
      return { order: saved, stock: { sign: -1, changes } };
    },
    [guard, adjustStock],
  );

  // Optimista: la tabla se actualiza al toque y si falla se vuelve atrás.
  const updateOrder = useCallback(
    async (id, patch) => {
      guard();
      const before = ref.current.find((o) => o.id === id);
      if (!before) return;
      ref.current = ref.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      const { error } = await supabase
        .from('orders')
        .update(toRow({ ...before, ...patch }))
        .eq('id', id);
      if (error) {
        ref.current = ref.current.map((o) => (o.id === id ? before : o));
        setOrders((list) => list.map((o) => (o.id === id ? before : o)));
        throw error;
      }
      const after = { ...before, ...patch };
      if (holdsStock(before) === holdsStock(after)) return null;
      const sign = holdsStock(after) ? -1 : 1;
      return { sign, changes: await adjustStock(before.items, sign) };
    },
    [guard, adjustStock],
  );

  const deleteOrder = useCallback(
    async (id) => {
      guard();
      const order = ref.current.find((o) => o.id === id);
      ensure(await supabase.from('orders').delete().eq('id', id));
      setOrders((list) => list.filter((o) => o.id !== id));
      return order && restoresOnDelete(order) ? { sign: 1, changes: await adjustStock(order.items, 1) } : null;
    },
    [guard, adjustStock],
  );

  const value = useMemo(
    () => ({ orders, loading, missing, addOrder, updateOrder, deleteOrder }),
    [orders, loading, missing, addOrder, updateOrder, deleteOrder],
  );
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export const useOrders = () => useContext(OrdersContext);
