// Baja las fuentes de Google que usa el juego (las de src/easter-egg/index.js)
// a static/fonts, con su CSS apuntando a los archivos locales: el juego de
// escritorio anda sin internet. Correr de nuevo si cambian las fuentes.
// uso: node tools/fonts.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'static', 'fonts');
const src = readFileSync(resolve(here, '..', '..', 'src', 'easter-egg', 'index.js'), 'utf8');
const FONTS = src.match(/const FONTS = '([^']+)'/)[1];
// (con un navegador moderno Google sirve woff2)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

mkdirSync(out, { recursive: true });
let css = await (await fetch(FONTS, { headers: { 'User-Agent': UA } })).text();
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
let bytes = 0;
for (const [i, u] of urls.entries()) {
  const name = `f${String(i).padStart(3, '0')}.woff2`;
  const buf = Buffer.from(await (await fetch(u, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(resolve(out, name), buf);
  bytes += buf.length;
  css = css.split(u).join(`./${name}`);
}
writeFileSync(resolve(out, 'fonts.css'), `/* Copia local de ${FONTS} (tools/fonts.mjs) */\n${css}`);
writeFileSync(resolve(out, 'source.txt'), `${FONTS}\n`);
console.log(`${urls.length} archivos, ${(bytes / 1024).toFixed(0)} KB`);
