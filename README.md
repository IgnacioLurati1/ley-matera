# Ley Matera · Rosario

Tienda online front-end (React + React Router + Vite) con **Supabase** como base de datos,
storage de fotos y login de admins. No hay servidor propio: los cambios del panel se ven al instante.

## Correr local

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # genera dist/
```

## Supabase

1. Correr `supabase/setup.sql` en el SQL Editor (tablas, permisos, bucket `imagenes` y datos iniciales).
2. Copiar `.env.example` como `.env` con la Project URL y la publishable key.
3. Admins: se crean en Authentication → Users (registro público desactivado).
4. En GitHub, cargar las variables de repo `SUPABASE_URL` y `SUPABASE_KEY` para el workflow que evita la pausa por inactividad.

Sin `.env`, el sitio lee `public/data/` en modo sólo lectura.

## Fotos y consumo (egress)

Las fotos se suben desde el panel ya recortadas y en WebP, en dos medidas (productos 400/800 px,
fondos 960/1920 px). El navegador baja sólo la que necesita (`srcset`), con caché de un año.

## Código de pedido

`LM-P12x2.PR1-P3.P7` → 2×P12, P3 dentro de la promo PR1, 1×P7. No incluye precios: el lector
del panel los toma del catálogo, así que editar el mensaje de WhatsApp no cambia lo que se cobra.

## Estructura

```
public/assets/          logo, foto del hero, ilustraciones y fondos por defecto
public/data/            datos iniciales / modo sin conexión
supabase/setup.sql      esquema, permisos y carga inicial
src/config/             datos del sitio y categorías
src/context/            datos (Supabase), carrito, sesión, UI
src/lib/                supabase, imágenes, código de pedido, temporadas
src/components/  src/pages/  src/pages/admin/
```
