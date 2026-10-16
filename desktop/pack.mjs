// Arma la carpeta para Windows x64 en desktop/out (sin firmar, sin
// actualizaciones automáticas). Antes: npm run build (desktop/app).
// Los assets del juego (public/assets/sotano) van en resources/sotano.
// uso: npm run pack
import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOLO_WEB } from '../src/easter-egg/core/edicion.js';

const here = dirname(fileURLToPath(import.meta.url));
if (!existsSync(resolve(here, 'app', 'index.html'))) {
  console.error('Falta desktop/app: correr antes npm run build');
  process.exit(1);
}
// (solo el proceso principal, el package.json y el juego armado)
const KEEP = ['/main.cjs', '/preload.cjs', '/package.json'];
const paths = await packager({
  dir: here,
  out: resolve(here, 'out'),
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: true,
  prune: true,
  name: 'Mate der Untoten',
  executableName: 'MateDerUntoten',
  // el logo (static/icono.ico; se arma con tools/icono/icono.py)
  icon: resolve(here, 'static', 'icono.ico'),
  appCopyright: 'El Luta · Ley Matera',
  win32metadata: { CompanyName: 'Ley Matera', FileDescription: 'Mate der Untoten', ProductName: 'Mate der Untoten' },
  extraResource: [resolve(here, '..', 'public', 'assets', 'sotano')],
  // sin lo que es solo de la web (src/easter-egg/core/edicion.js SOLO_WEB: la guía con
  // los nombres de Call of Duty y las canciones con dueño que ya tienen reemplazo): la
  // de escritorio es la de uso comercial (el usuario, 2026-10-15)
  afterCopyExtraResources: [
    async ({ buildPath }) => {
      for (const f of SOLO_WEB) rmSync(resolve(buildPath, 'resources', 'sotano', f), { force: true });
    },
  ],
  ignore: (p) => !!p && !(KEEP.includes(p) || p === '/app' || p.startsWith('/app/')),
  // de los idiomas de Chromium (los menús del sistema) quedan castellano e
  // inglés: los otros son 47 MB que el juego no usa
  afterExtract: [
    async ({ buildPath }) => {
      const dir = resolve(buildPath, 'locales');
      for (const f of readdirSync(dir)) if (!/^(es|es-419|en-US)\.pak$/.test(f)) rmSync(resolve(dir, f));
    },
  ],
});
console.log(paths.join('\n'));
// ZIP=1: además, un .zip de la carpeta para repartir (con el tar de Windows)
if (process.env.ZIP) {
  for (const dir of paths) {
    const zip = `${dir}.zip`;
    rmSync(zip, { force: true });
    // (el de Windows: el tar de Git Bash toma "C:" como una máquina remota)
    const tar = process.platform === 'win32' ? resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', dirname(dir), basename(dir)], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status || 1);
    console.log(`${zip} (${(statSync(zip).size / 1048576).toFixed(0)} MB)`);
  }
}
