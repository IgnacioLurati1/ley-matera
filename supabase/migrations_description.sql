-- Agrega la descripción de los productos (se ve al tocar un producto en el
-- catálogo). Pegar en Supabase → SQL Editor → Run.
alter table public.products add column if not exists description text not null default '';
