-- Plata invertida y ganancia. Pegar en Supabase → SQL Editor → Run.
-- Sólo agrega columnas vacías (null); se puede correr más de una vez.
-- products.cost: lo que costó cada unidad del artículo (null = sin cargar).
-- orders.cost: invertido cambiado a mano en una venta (null = la suma de lo
-- invertido en sus artículos).
-- orders.profit: ganancia cargada a mano (versión anterior; se sigue respetando).
alter table public.products add column if not exists cost integer check (cost >= 0);
alter table public.orders add column if not exists cost integer;
alter table public.orders add column if not exists profit integer;
