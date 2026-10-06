// Mate der Untoten de escritorio (Electron). El juego es el mismo de la web
// (src/easter-egg), armado con vite.desktop.mjs en desktop/app, servido por el
// protocolo app:// (como un sitio: las rutas '/assets/sotano/...' del juego
// andan igual). Sin barra de menú, en pantalla completa (F11), la placa de video
// dedicada en las notebooks y aislado (COOP/COEP) para SharedArrayBuffer.
const { app, BrowserWindow, Menu, dialog, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const TEST = !!process.env.MDU_TEST;
// (pruebas: arranque en frío con una carpeta de datos vacía)
if (process.env.MDU_USERDATA) app.setPath('userData', process.env.MDU_USERDATA);

// la placa dedicada (notebooks con dos), sin la lista negra de placas, y que
// no se frene nada con la ventana tapada o en segundo plano
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Vsync siempre prendido, como en el navegador (el usuario, 2026-10-03: sin
// él, con muchos fps, el juego se sentía trabado; con él va parejo). Sin tope
// de FPS: manda el refresco del monitor.

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

const APP_DIR = path.join(__dirname, 'app');
// los assets del juego: en el paquete van en resources/sotano; probando desde
// el repo, directo de public/
const ASSETS_DIR = app.isPackaged ? path.join(process.resourcesPath, 'sotano') : path.join(__dirname, '..', 'public', 'assets', 'sotano');
const ASSETS = '/assets/sotano/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

// Aislado entre orígenes (crossOriginIsolated): SharedArrayBuffer y timers
// finos. credentialless deja pasar lo de afuera sin cookies (Supabase va por
// CORS y websockets: no lo afecta).
const ISOLATE = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function fileFor(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const [base, rel] = p.startsWith(ASSETS) ? [ASSETS_DIR, p.slice(ASSETS.length)] : [APP_DIR, p === '/' ? 'index.html' : p.slice(1)];
  const full = path.resolve(base, rel);
  // (nada fuera de su carpeta)
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

async function serve(req) {
  const url = new URL(req.url);
  // (pruebas: qué se pidió, por la salida estándar)
  if (TEST && process.env.MDU_TEST_LOG) console.log('GET', url.pathname);
  const file = fileFor(url.pathname);
  let st = null;
  try {
    st = file && (await fs.promises.stat(file));
  } catch {
    st = null;
  }
  if (!st || !st.isFile()) return new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...ISOLATE } });
  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', ...ISOLATE };
  // pedazos (la canción del easter egg va por <audio> y pide por partes)
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}`, ...ISOLATE } });
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    headers['Content-Length'] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers });
  }
  headers['Content-Length'] = String(st.size);
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers });
  // (el archivo entero lo lee Chromium directo: más rápido que pasarlo por
  // un stream de node en el proceso principal)
  if (!process.env.MDU_NODE_STREAM) {
    const r = await net.fetch(pathToFileURL(file).toString());
    return new Response(r.body, { status: 200, headers });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers });
}

let win = null;

// Arranca en pantalla completa (2026-10-04): así Windows le da la pantalla
// entera al juego y el FreeSync/G-Sync del monitor puede seguir los cuadros;
// maximizada, con el escritorio componiendo encima, muchas veces no. F11 la
// saca y se acuerda para la próxima (userData/ventana.json).
const PREFS = () => path.join(app.getPath('userData'), 'ventana.json');
function fullPref() {
  try {
    return JSON.parse(fs.readFileSync(PREFS(), 'utf8')).completa !== false;
  } catch {
    return true;
  }
}
function saveFullPref(on) {
  try {
    fs.writeFileSync(PREFS(), JSON.stringify({ completa: on }));
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: '#000000',
    title: 'Mate der Untoten',
    // (el logo también en la ventana y la barra de tareas sin empaquetar)
    icon: path.join(APP_DIR, 'icono.png'),
    autoHideMenuBar: true,
    // (pruebas: chica, a la vista pero sin foco: escondida, Chromium frena los
    // cuadros a 1 por segundo)
    focusable: !TEST,
    skipTaskbar: TEST,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      // el código queda compilado en disco desde la primera vez
      v8CacheOptions: 'bypassHeatCheck',
    },
  });
  // se muestra cuando ya pintó algo (no una ventana blanca esperando)
  win.once('ready-to-show', () => {
    if (TEST) {
      win.setBounds({ x: 0, y: 0, width: 960, height: 540 });
      win.showInactive();
      return;
    }
    // (maximizada debajo: al salir con F11 vuelve a la ventana grande)
    win.maximize();
    win.show();
    if (fullPref()) win.setFullScreen(true);
  });
  // jugando, el juego pide confirmar antes de salir (beforeunload): en
  // Electron eso cancelaba el cierre sin avisar; se pregunta acá
  win.webContents.on('will-prevent-unload', (e) => {
    if (TEST) return e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Salir', 'Seguir jugando'],
      defaultId: 1,
      cancelId: 1,
      title: 'Mate der Untoten',
      message: '¿Salir del juego?',
      detail: 'La partida en curso se pierde.',
    });
    if (r === 0) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && !input.alt && !input.control) {
      const on = !win.isFullScreen();
      win.setFullScreen(on);
      saveFullPref(on);
      e.preventDefault();
    }
    // F12: la consola (para los interruptores de prueba, globalThis.__mdu…)
    if (input.type === 'keyDown' && input.key === 'F12' && !input.alt && !input.control) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
  // nada de navegar fuera del juego (el botón de la versión original de la web
  // no existe acá); los links de afuera van al navegador
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/index.html')) e.preventDefault();
  });
  // si el proceso del juego se cae (falta de memoria, la placa), se vuelve a
  // cargar en vez de quedar la ventana en blanco
  win.webContents.on('render-process-gone', (e, d) => {
    console.error('render-process-gone', d.reason, d.exitCode);
    if ((TEST && !process.env.MDU_TEST_RELOAD) || d.reason === 'clean-exit' || !win || win.isDestroyed()) return;
    setTimeout(() => win && !win.isDestroyed() && win.reload(), 500);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const q = new URLSearchParams();
  if (TEST) q.set('test', '1');
  if (process.env.MDU_TEST_SETTINGS) q.set('set', process.env.MDU_TEST_SETTINGS);
  // (pruebas: MDU_URL carga otra dirección, ej. el mismo build por http, para
  // separar lo que cuesta el protocolo de lo que cuesta la ventana)
  win.loadURL(`${(TEST && process.env.MDU_URL) || 'app://game/index.html'}${q.size ? `?${q}` : ''}`);
  win.on('closed', () => {
    win = null;
  });
}

// una sola ventana: abrirlo de nuevo trae la que ya está
if (!TEST && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(() => {
    protocol.handle('app', serve);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
