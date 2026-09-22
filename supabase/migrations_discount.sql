-- Descuento por producto (porcentaje, 0 = sin descuento). Pegar en Supabase → SQL Editor → Run.
alter table public.products add column if not exists discount integer not null default 0 check (discount between 0 and 90);
