-- Agrega el stock a los productos. Pegar en Supabase → SQL Editor → Run.
-- null = no se controla stock (siempre disponible); 0 = sin stock.
alter table public.products add column if not exists stock integer check (stock >= 0);
