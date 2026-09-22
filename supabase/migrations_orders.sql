-- Ventas / pedidos registrados desde el Lector de pedidos o a mano.
-- Privado: sólo los admins logueados pueden leer y escribir.
-- Pegar en Supabase → SQL Editor → Run.
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text,                                   -- código LM-… del pedido (si vino del lector)
  client text not null default '',
  description text not null default '',        -- columna PRODUCTO del Excel
  items jsonb not null default '[]'::jsonb,
  price integer not null default 0 check (price >= 0),     -- $ PRODUCTO
  deposit integer not null default 0 check (deposit >= 0), -- $ SEÑA
  status text not null default 'reservado'
    check (status in ('reservado', 'senado', 'pagado', 'entregado', 'cancelado')),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
drop policy if exists "orders admin" on public.orders;
create policy "orders admin" on public.orders for all to authenticated using (true) with check (true);
