import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { PUBLIC_PAGES, SITE_TITLE } from './src/config/seo.js';
import { SITE } from './src/config/site.js';

// Dirección pública del sitio (sin barra final), para canonical, sitemap y redes.
const SITE_URL = (process.env.SITE_URL || 'https://ignaciolurati1.github.io/ley-matera').replace(/\/$/, '');
// Código de Google Search Console (método "etiqueta HTML"), si se cargó.
const GOOGLE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || '';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const pageUrl = (path) => `${SITE_URL}/${path ? `${path}/` : ''}`;

// Datos de la tienda para Google (schema.org).
const storeJsonLd = () =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: SITE.name,
    url: pageUrl(''),
    logo: `${SITE_URL}/assets/brand/icon-512.png`,
    image: `${SITE_URL}/assets/brand/og-image.jpg`,
    description: PUBLIC_PAGES[0].description,
    email: SITE.email,
    telephone: `+${SITE.whatsappNumber}`,
    address: { '@type': 'PostalAddress', addressLocality: 'Rosario', addressRegion: 'Santa Fe', addressCountry: 'AR' },
    areaServed: 'Rosario',
    sameAs: [SITE.instagramUrl],
  });

const seoTags = (page) =>
  [
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${pageUrl(page.path)}" />`,
    GOOGLE_VERIFICATION && `<meta name="google-site-verification" content="${esc(GOOGLE_VERIFICATION)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="es_AR" />`,
    `<meta property="og:site_name" content="${SITE_TITLE}" />`,
    `<meta property="og:title" content="${SITE_TITLE}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${pageUrl(page.path)}" />`,
    `<meta property="og:image" content="${SITE_URL}/assets/brand/og-image.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${storeJsonLd()}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');

const SEO_MARK = /<!-- %SEO%[^>]*-->/;

// - Completa las etiquetas de SEO del inicio.
// - Arma un HTML por página pública (catalogo/index.html…): GitHub Pages las
//   sirve con estado 200 (Google no indexa lo que responde 404) y cada una
//   trae su descripción.
// - Copia index.html como 404.html: GitHub Pages no conoce el resto de las
//   rutas (/admin, /promo/…) y responde con ese archivo; el router se encarga.
// - Genera sitemap.xml para cargar en Search Console.
const seo = () => ({
  name: 'seo',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace(SEO_MARK, seoTags(PUBLIC_PAGES[0])),
  },
  // Sólo en el build (en desarrollo no hay dist/).
  closeBundle() {
    const dist = resolve('dist');
    const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
    const home = PUBLIC_PAGES[0];
    const forPage = (page) =>
      html
        .replaceAll(`content="${esc(home.description)}"`, `content="${esc(page.description)}"`)
        .replace(`<link rel="canonical" href="${pageUrl('')}" />`, `<link rel="canonical" href="${pageUrl(page.path)}" />`)
        .replace(`property="og:url" content="${pageUrl('')}"`, `property="og:url" content="${pageUrl(page.path)}"`);
    for (const page of PUBLIC_PAGES.slice(1)) {
      mkdirSync(resolve(dist, page.path), { recursive: true });
      writeFileSync(resolve(dist, page.path, 'index.html'), forPage(page));
    }
    // El 404 no tiene que indexarse ni declararse como el inicio.
    writeFileSync(
      resolve(dist, '404.html'),
      html
        .replace(/\s*<link rel="canonical"[^>]*>/, '')
        .replace('<meta name="description"', '<meta name="robots" content="noindex" />\n    <meta name="description"'),
    );
    const today = new Date().toISOString().slice(0, 10);
    const urls = PUBLIC_PAGES.map(
      (p) => `  <url><loc>${pageUrl(p.path)}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`,
    ).join('\n');
    writeFileSync(
      resolve(dist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  },
});

export default defineConfig({
  // En GitHub Pages el sitio vive en /ley-matera/ (lo define el workflow).
  base: process.env.BASE_PATH || '/',
  define: { __SITE_URL__: JSON.stringify(SITE_URL) },
  plugins: [react(), seo()],
  server: { port: 5180, strictPort: true, host: true },
});
