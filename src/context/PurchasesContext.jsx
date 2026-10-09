import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useData } from './DataContext';
import { ensure, isMissingTable } from './OrdersContext';

// Compras de mercadería (tabla `purchases`, privada): órdenes de compra ya
// cumplidas, con cuánto salieron y los productos que entraron. Al cargar una,
// esas unidades se suman al stock y el total se descuenta de la ganancia
// (SalesInsights). Es aparte de lo invertido por artículo de Productos.
const PurchasesContext = createContext(null);

const COLS = 'id,bought_on,total,items,note,created_at';
const fromRow = (r) => ({
  id: r.id,
  boughtOn: r.bought_on,
  total: r.total,
  items: r.items ?? [],
  note: r.note,
  createdAt: r.created_at,
});
const toRow = (p) => ({
  bought_on: p.boughtOn,
  total: Math.max(0, Math.round(p.total || 0)),
  items: (p.items ?? []).map(({ productId, title, qty }) => ({ productId, title, qty })),
  note: p.note ?? '',
});
// Las más nuevas arriba (por día de compra y, el mismo día, la última cargada).
const sorted = (list) => [...list].sort((a, b) => b.boughtOn.localeCompare(a.boughtOn) || b.id - a.id);

export const purchasesTotal = (purchases) => purchases.reduce((n, p) => n + p.total, 0);

export function PurchasesProvider({ children }) {
  const { adjustStock } = useData();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data, error } = await supabase.from('purchases').select(COLS);
      if (error) setMissing(isMissingTable(error));
      else setPurchases(sorted(data.map(fromRow)));
      setLoading(false);
    })();
  }, []);

  const guard = useCallback(() => {
    if (!supabase) throw new Error('Falta configurar Supabase (.env).');
    if (missing) throw new Error('Falta crear la tabla de compras en Supabase (supabase/migrations_purchases.sql).');
  }, [missing]);

  const addPurchase = useCallback(
    async (purchase) => {
      guard();
      const saved = fromRow(ensure(await supabase.from('purchases').insert(toRow(purchase)).select(COLS).single()));
      setPurchases((list) => sorted([saved, ...list]));
      return { purchase: saved, changes: await adjustStock(saved.items, 1, { fromZero: true }) };
    },
    [guard, adjustStock],
  );

  // Borrarla saca del stock las unidades que había sumado.
  const deletePurchase = useCallback(
    async (id) => {
      guard();
      const purchase = purchases.find((p) => p.id === id);
      ensure(await supabase.from('purchases').delete().eq('id', id));
      setPurchases((list) => list.filter((p) => p.id !== id));
      return purchase ? adjustStock(purchase.items, -1) : [];
    },
    [guard, adjustStock, purchases],
  );

  const value = useMemo(
    () => ({ purchases, loading, missing, addPurchase, deletePurchase }),
    [purchases, loading, missing, addPurchase, deletePurchase],
  );
  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export const usePurchases = () => useContext(PurchasesContext);
