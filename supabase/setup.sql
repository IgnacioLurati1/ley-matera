-- =====================================================================
-- Ley Matera · setup de Supabase
-- Pegá TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin romper nada.
-- =====================================================================

-- ---------- Tablas ----------
create sequence if not exists product_seq;
create sequence if not exists promo_seq;

create table if not exists public.products (
  id          text primary key default 'P' || nextval('product_seq'),
  title       text not null,
  category    text not null,
  price       integer not null check (price >= 0),
  image       text not null default '',
  -- null = no se controla stock; 0 = sin stock
  stock       integer check (stock >= 0),
  created_at  date not null default current_date
);
alter table public.products add column if not exists stock integer check (stock >= 0);
alter table public.products add column if not exists discount integer not null default 0 check (discount between 0 and 90);
alter table public.products add column if not exists description text not null default '';

create table if not exists public.promos (
  id          text primary key default 'PR' || nextval('promo_seq'),
  title       text not null,
  headline    text not null default '',
  message     text not null default '',
  end_date    date,
  active      boolean not null default true,
  background  jsonb not null default '{}'::jsonb,
  decoration  jsonb not null default '{}'::jsonb,
  text_color  text not null default '#ffffff',
  shade       real not null default 1,
  items       jsonb not null default '[]'::jsonb,
  position    integer not null default 0,
  created_at  date not null default current_date
);

-- Configuración general: destacados, temporadas, texto de "Conocenos".
create table if not exists public.settings (
  key    text primary key,
  value  jsonb not null
);

-- ---------- Permisos (Row Level Security) ----------
-- Cualquiera puede LEER. Sólo usuarios logueados (los admins) pueden ESCRIBIR.
alter table public.products enable row level security;
alter table public.promos   enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','promos','settings'] loop
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('drop policy if exists "escritura admins" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select using (true)', t);
    execute format('create policy "escritura admins" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Storage para fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "imagenes lectura publica" on storage.objects;
drop policy if exists "imagenes escritura admins" on storage.objects;
create policy "imagenes lectura publica" on storage.objects
  for select using (bucket_id = 'imagenes');
create policy "imagenes escritura admins" on storage.objects
  for all to authenticated using (bucket_id = 'imagenes') with check (bucket_id = 'imagenes');

-- ---------- Datos iniciales (los mismos que tiene hoy el sitio) ----------
insert into public.products (id, title, category, price, image, created_at) values
  ('P1', 'Mate Imperial de Algarrobo con virola de alpaca', 'mates/algarrobo/imperiales', 38500, '/assets/products/demo/mate.svg', '2026-08-01'),
  ('P2', 'Mate Imperial de Algarrobo cincelado', 'mates/algarrobo/imperiales', 42900, '/assets/products/demo/mate.svg', '2026-08-03'),
  ('P3', 'Mate Torpedo de Algarrobo virola acero', 'mates/algarrobo/torpedos', 29500, '/assets/products/demo/mate.svg', '2026-08-05'),
  ('P4', 'Mate Torpedo de Algarrobo forrado en cuero', 'mates/algarrobo/torpedos', 33000, '/assets/products/demo/mate.svg', '2026-08-07'),
  ('P5', 'Mate Imperial de Calabaza premium', 'mates/calabaza/imperiales', 45000, '/assets/products/demo/mate.svg', '2026-08-09'),
  ('P6', 'Mate Torpedo de Calabaza virola de alpaca', 'mates/calabaza/torpedos', 36800, '/assets/products/demo/mate.svg', '2026-08-10'),
  ('P7', 'Mate de Calabaza con base de cuero crudo', 'mates/calabaza/con-base', 31200, '/assets/products/demo/mate.svg', '2026-08-12'),
  ('P8', 'Camionero Criollo calabaza pulida base cuero', 'mates/camioneros', 25000, '/assets/products/demo/camionero.svg', '2026-08-14'),
  ('P9', 'Camionero boca ancha cuero repujado', 'mates/camioneros', 27900, '/assets/products/demo/camionero.svg', '2026-08-15'),
  ('P10', 'Bombilla pico de loro acero inoxidable', 'bombillas/acero-inoxidable', 9800, '/assets/products/demo/bombilla.svg', '2026-08-16'),
  ('P11', 'Bombilla chata acero inoxidable', 'bombillas/acero-inoxidable', 8500, '/assets/products/demo/bombilla.svg', '2026-08-17'),
  ('P12', 'Bombillón resorte acero', 'bombillas/bombillones', 12900, '/assets/products/demo/bombilla.svg', '2026-08-18'),
  ('P13', 'Termo media manija 1 L acero', 'termos/media-manija', 52000, '/assets/products/demo/termo.svg', '2026-08-19'),
  ('P14', 'Termo media manija 1.2 L verde oliva', 'termos/media-manija', 58500, '/assets/products/demo/termo.svg', '2026-08-20'),
  ('P15', 'Vaso térmico 500 ml con tapa', 'termos/vasos-termicos', 21000, '/assets/products/demo/termo.svg', '2026-08-21'),
  ('P16', 'Canasta matera eco-cuero marrón', 'canastas-y-bolsos/canastas/eco-cuero', 34500, '/assets/products/demo/canasta.svg', '2026-08-22'),
  ('P17', 'Canasta matera de cuero vaqueta', 'canastas-y-bolsos/canastas/cuero', 61000, '/assets/products/demo/canasta.svg', '2026-08-23'),
  ('P18', 'Morral matero de lona y cuero', 'canastas-y-bolsos/morrales', 39900, '/assets/products/demo/canasta.svg', '2026-08-24'),
  ('P19', 'Porta mate de cuero con tapa', 'canastas-y-bolsos/porta-mates', 15500, '/assets/products/demo/canasta.svg', '2026-08-25'),
  ('P20', 'Combo Clásico: mate torpedo + bombilla + yerbera', 'combos', 44900, '/assets/products/demo/combo.svg', '2026-08-26'),
  ('P21', 'Combo Viajero: termo + mate + canasta eco-cuero', 'combos', 119000, '/assets/products/demo/combo.svg', '2026-08-27'),
  ('P22', 'Grabado láser personalizado (nombre o frase)', 'grabados', 6500, '/assets/products/demo/grabado.svg', '2026-08-28'),
  ('P23', 'Yerbera y azucarera de lata', 'otros', 11900, '/assets/products/demo/otros.svg', '2026-08-29'),
  ('P24', 'Cepillo limpia bombillas x2', 'otros', 2500, '/assets/products/demo/otros.svg', '2026-08-30')
on conflict (id) do nothing;

insert into public.promos (id, title, headline, message, end_date, active, background, decoration, text_color, shade, items, created_at) values
  ('PR1', 'Llegó la primavera', '¡Llegó la primavera! 🌼', 'Sacá los mates al sol: elegimos algunos favoritos con precio especial para arrancar la temporada de rondas al aire libre. Válido hasta agotar stock o hasta fin de octubre.', '2026-10-31', true, '{"src": "/assets/promos/fondos/yerbal.svg", "x": 50, "y": 50, "zoom": 1}'::jsonb, '{"type": "laurel", "color": "#f4eee0"}'::jsonb, '#ffffff', 1, '[{"productId": "P3", "promoPrice": 25900}, {"productId": "P10", "promoPrice": 7900}, {"productId": "P16", "promoPrice": 29900}, {"productId": "P20", "promoPrice": null}]'::jsonb, '2026-09-21')
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('featured', '["P1", "P5", "P8", "P13", "P17", "P20", "P21", "P22"]'::jsonb),
  ('seasons', '{"navidad": {"mode": "auto", "from": "12-01", "to": "01-06"}, "carnaval": {"mode": "auto", "from": "", "to": ""}, "pascua": {"mode": "auto", "from": "", "to": ""}, "patrio": {"mode": "auto", "from": "", "to": ""}}'::jsonb),
  ('about', '{"title": "Somos Ley Matera", "body": "Muy pronto vas a poder conocer nuestra historia acá. Mientras tanto, te adelantamos lo importante: somos de Rosario, nos encanta el mate y creemos que no hay mejor excusa para juntarse que una buena ronda."}'::jsonb)
on conflict (key) do nothing;

-- Las secuencias siguen desde el último id cargado (así nunca se reutiliza un id borrado).
select setval('product_seq', greatest((select coalesce(max(substring(id from 2)::int), 0) from public.products), 1));
select setval('promo_seq',   greatest((select coalesce(max(substring(id from 3)::int), 0) from public.promos), 1));

-- ---------- Ventas (también en migrations_orders.sql) ----------
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
