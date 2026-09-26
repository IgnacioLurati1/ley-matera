-- Varias fotos por producto: la principal sigue en `image` (tarjetas, carrito,
-- promos) y las demás van en `images`, en el orden en que se ven en la ficha.
-- Pegar en Supabase → SQL Editor → Run.
alter table public.products add column if not exists images text[] not null default '{}';
