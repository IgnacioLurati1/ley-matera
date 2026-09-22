import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages no conoce las rutas de la app (/catalogo, /admin…): responde con
// 404.html, que es una copia de index.html, y el router se encarga.
const spaFallback = () => ({
  name: 'spa-404',
  apply: 'build',
  closeBundle() {
    copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
  },
});

export default defineConfig({
  // En GitHub Pages el sitio vive en /ley-matera/ (lo define el workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [react(), spaFallback()],
  server: { port: 5180, strictPort: true, host: true },
});
