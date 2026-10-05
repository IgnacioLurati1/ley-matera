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

// Ganancia. Cada artículo tiene la plata invertida por unidad (`cost`); al
// registrar una venta se copia en sus items, así cambiarla después no mueve las
// ventas viejas. Suma de lo invertido en la venta = esos costos × unidades;
// null si no se sabe (venta a mano o algún artículo sin invertido cargado).
// `byId` = useProductMap().
export const orderCost = (o, byId) => {
  if (!o.items?.length) return null;
  let total = 0;
  for (const i of o.items) {
    const cost = i.cost ?? byId.get(i.productId)?.cost;
    if (cost == null) return null;
    total += cost * (i.qty || 1);
  }
  return total;
};
// Invertido escrito a mano en la venta (si justo ese salió más o menos). Las
// ventas que tienen una ganancia cargada a mano (versión anterior) lo deducen
// de ahí. null = se usa la suma de sus artículos.
export const manualSpent = (o) => o.cost ?? (o.profit != null ? o.price - o.profit : null);
// Invertido de la venta: el escrito a mano o la suma de sus artículos.
export const orderSpent = (o, byId) => manualSpent(o) ?? orderCost(o, byId);
// Ganancia = lo cobrado menos lo invertido.
export const orderProfit = (o, byId) => {
  const spent = orderSpent(o, byId);
  return spent == null ? null : o.price - spent;
};
// Copia en cada item lo invertido por unidad de hoy (ver orderCost).
const withCost = (items, products) =>
  (items ?? []).map((i) => {
    const cost = products.find((p) => p.id === i.productId)?.cost;
    return cost != null && i.cost == null ? { ...i, cost } : i;
  });

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

// Marca en cada item cuántas unidades no había en stock al registrar la venta
// (`reserved`): quedan como reserva, no se descuentan ni se devuelven después.
export const withReserved = (items, products) => {
  const left = new Map();
  return (items ?? []).map((i) => {
    const stock = products.find((p) => p.id === i.productId)?.stock;
    if (stock == null) return i;
    const qty = i.qty || 1;
    const avail = left.get(i.productId) ?? stock;
    const taken = Math.min(avail, qty);
    left.set(i.productId, avail - taken);
    return qty > taken ? { ...i, reserved: qty - taken } : i;
  });
};

export const restoresOnDelete = (o) => o.status === 'reservado' || o.status === 'senado';

const COLS = 'id,code,client,description,items,price,deposit,status,note,created_at';
// Columnas que se agregaron después (supabase/migrations_cost.sql): `cost` =
// invertido escrito a mano; `profit` = ganancia a mano (versión anterior, se
// sigue respetando). Si alguna todavía no existe, las ventas andan igual y
// nunca se manda en un insert o update.
const optional = { cost: true, profit: true };
const cols = () => [COLS, ...Object.keys(optional).filter((k) => optional[k])].join(',');
// Sin mirar si ya estaba apagada: en desarrollo (StrictMode) la carga corre dos
// veces a la vez y la segunda también recibe el error de la columna.
const missingColumn = (e) =>
  e && (e.code === '42703' || e.code === 'PGRST204')
    ? Object.keys(optional).find((k) => (e.message ?? '').includes(k))
    : null;
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
  cost: r.cost ?? null,
  profit: r.profit ?? null,
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
  ...(optional.cost ? { cost: o.cost ?? null } : {}),
  ...(optional.profit ? { profit: o.profit ?? null } : {}),
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
  const { adjustStock, products } = useData();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [missing, setMissing] = useState(false);
  const [costEnabled, setCostEnabled] = useState(optional.cost);
  const ref = useRef(orders);
  ref.current = orders;

  useEffect(() => {
    if (!supabase) return;
    const load = () => supabase.from('orders').select(cols()).order('created_at', { ascending: false });
    (async () => {
      let { data, error } = await load();
      for (let col = missingColumn(error), n = 0; col && n < 3; col = missingColumn(error), n += 1) {
        optional[col] = false;
        ({ data, error } = await load());
      }
      setCostEnabled(optional.cost);
      if (error) setMissing(isMissingTable(error));
      else setOrders(data.map(fromRow));
      setLoading(false);
    })();
  }, []);

  const guard = useCallback(() => {
    if (!supabase) throw new Error('Falta configurar Supabase (.env).');
    if (missing) throw new Error('Falta crear la tabla de ventas en Supabase (supabase/migrations_orders.sql).');
  }, [missing]);

  const addOrder = useCallback(
    async (order) => {
      guard();
      const row = toRow({ ...order, items: withCost(withReserved(order.items, products), products) });
      const saved = fromRow(ensure(await supabase.from('orders').insert(row).select(cols()).single()));
      setOrders((list) => [saved, ...list]);
      const changes = holdsStock(saved) ? await adjustStock(saved.items, -1) : [];
      return { order: saved, stock: { sign: -1, changes } };
    },
    [guard, adjustStock, products],
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
    () => ({ orders, loading, missing, costEnabled, addOrder, updateOrder, deleteOrder }),
    [orders, loading, missing, costEnabled, addOrder, updateOrder, deleteOrder],
  );
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export const useOrders = () => useContext(OrdersContext);
