// Build del juego para escritorio: solo el juego (desktop/index.html →
// src/easter-egg), sin la tienda ni React. Rutas relativas (base './') y salida
// en desktop/app. Los assets de public/assets/sotano NO se copian: el proceso
// principal los sirve desde public/ (o desde resources/ en el paquete).
// No toca el vite.config.js de la raíz: la web sigue igual.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
// la dirección de las fuentes que pide launch() (ver entry.js)
const FONTS = readFileSync(resolve(repo, 'src', 'easter-egg', 'index.js'), 'utf8').match(/const FONTS = '([^']+)'/)[1];

export default {
  root: here,
  base: './',
  // (.env de la raíz: VITE_SUPABASE_URL / VITE_SUPABASE_KEY, para las salas en línea)
  envDir: repo,
  // static/: las fuentes (tools/fonts.mjs)
  publicDir: resolve(here, 'static'),
  define: { __MDU_FONTS__: JSON.stringify(FONTS) },
  build: {
    outDir: resolve(here, 'app'),
    emptyOutDir: true,
    // (Electron 44 = Chromium nuevo: sin transpilar de más)
    target: 'esnext',
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false,
  },
};
