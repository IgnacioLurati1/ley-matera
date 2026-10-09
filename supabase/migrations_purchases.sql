-- Compras de mercadería (órdenes de compra ya cumplidas), desde Panel → Compras.
-- Cada una guarda cuánto salió y los productos que entraron; al cargarla esas
-- unidades se suman al stock y el total se descuenta de la ganancia.
-- Privado: sólo los admins logueados pueden leer y escribir.
-- Sólo crea cosas nuevas: no borra ni cambia nada de las otras tablas (sin
-- drop, delete ni update). Se puede correr más de una vez.
-- Pegar en Supabase → SQL Editor → Run.
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  bought_on date not null default current_date,           -- día de la compra
  total integer not null default 0 check (total >= 0),   -- cuánto salió
  items jsonb not null default '[]'::jsonb,               -- [{ productId, title, qty }]
  note text not null default '',                          -- proveedor, factura…
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

-- Permiso para los admins logueados (se crea sólo si todavía no está).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchases' and policyname = 'purchases admin'
  ) then
    create policy "purchases admin" on public.purchases
      for all to authenticated using (true) with check (true);
  end if;
end $$;
