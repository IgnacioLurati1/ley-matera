// Mate der Untoten de escritorio (Electron). El juego es el mismo de la web
// (src/easter-egg), armado con vite.desktop.mjs en desktop/app, servido por el
// protocolo app:// (como un sitio: las rutas '/assets/sotano/...' del juego
// andan igual). Sin barra de menú, en pantalla completa (F11), la placa de video
// dedicada en las notebooks y aislado (COOP/COEP) para SharedArrayBuffer.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, powerSaveBlocker, protocol, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
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
// el recolector de basura a mano (globalThis.gc): el juego lo pasa una vez al
// terminar la cinemática de entrada, así la basura de la carga no se limpia
// en plena partida (src/easter-egg/core/memSettle.js)
// Más memoria para el juego (escritorio 3, tanda de optimización, 2026-10-12;
// el usuario: "realmente pide nada de memoria el juego, podemos aumentarlo mucho
// y que sea seguro"): el techo de V8 a la mitad de la RAM de la PC, entre 4 y
// 8 GB (Eclipse usa ~800 MB), y la zona de lo recién creado más grande (64 MB):
// menos pasadas chicas del recolector. MDU_JS_FLAGS=0: solo --expose-gc, como antes.
const HEAP_MB = Math.max(4096, Math.min(8192, Math.floor(os.totalmem() / 1048576 / 2)));
app.commandLine.appendSwitch('js-flags', process.env.MDU_JS_FLAGS === '0' ? '--expose-gc' : `--expose-gc --max-old-space-size=${HEAP_MB} --max-semi-space-size=64`);
// Los shaders compilados quedan en disco (escritorio 7): Chromium ya los guarda,
// pero con un tope chico (unos MB) y el juego arma ~500 programas en Eclipse: se
// pisaban y cada arranque volvía a compilar. 512 MB de caché en disco y 64 en
// memoria. MDU_GPU_CACHE=0: el tamaño de siempre.
if (process.env.MDU_GPU_CACHE !== '0') {
  app.commandLine.appendSwitch('gpu-disk-cache-size-kb', String(512 * 1024));
  app.commandLine.appendSwitch('gpu-program-cache-size-kb', String(64 * 1024));
}
// Modo de video (ANGLE). Medido el 2026-10-12 (punto F de la tanda de
// optimización; 1920x1080 sin tope) en una AMD 9070 XT: con Vulkan el juego llega
// al título en la mitad de tiempo en frío (Eclipse 16 s contra 33 s con D3D11, el
// penal 7 contra 12), el cuadro es 4-5 % más corto y hay menos tirones. En NVIDIA
// e Intel no se midió (el usuario: "capaz rinde más OpenGL o el propio DX11"), así
// que Vulkan va solo en placas AMD y las demás siguen con D3D11, como antes. La
// marca de la placa se sabe recién con la app andando: se anota en
// userData/video.json y vale desde el arranque siguiente. Si con Vulkan la placa
// se cae o el juego termina dibujando por software, vuelve sola a D3D11 y lo anota
// ({"angle": "d3d11"}: elegido a mano o por la vuelta; manda sobre la marca).
// Para probar: MDU_ANGLE o --use-angle=… en la línea de comandos.
const VIDEO = () => path.join(app.getPath('userData'), 'video.json');
const AMD = 0x1002;
const FALLBACK = process.argv.includes('--mdu-video-d3d11');
function videoPrefs() {
  try {
    return JSON.parse(fs.readFileSync(VIDEO(), 'utf8')) || {};
  } catch {
    return {};
  }
}
function videoMode() {
  if (FALLBACK) return 'd3d11';
  if (process.env.MDU_ANGLE) return process.env.MDU_ANGLE;
  const v = videoPrefs();
  if (['d3d11', 'vulkan', 'gl'].includes(v.angle)) return v.angle;
  // (2026-10-12, más tarde: con Vulkan, Electron compone por software y lee cada
  // cuadro de vuelta de la placa —gpu_compositing "disabled_software", WebGL
  // "enabled_readback"; lo vio el agente de WebGPU—, cosa que el banco sin ventana
  // no mide. Hasta medirlo con ventana, D3D11 para todos; Vulkan, a mano desde
  // Opciones › Gráficos o con la prueba de rendimiento. MDU_VULKAN_AMD=1: Vulkan en AMD)
  return process.env.MDU_VULKAN_AMD === '1' && v.vendor === AMD ? 'vulkan' : 'd3d11';
}
const ANGLE = app.commandLine.hasSwitch('use-angle') && !FALLBACK ? app.commandLine.getSwitchValue('use-angle') : videoMode();
app.commandLine.appendSwitch('use-angle', ANGLE);
// La prueba de rendimiento (Opciones › Gráficos, desktop/medir.js): la app se abre
// sola con cada modo, mide sin tope de cuadros y pasa al siguiente.
const MEDIR = process.argv.includes('--mdu-medir');
if (MEDIR) {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}
// la marca de la placa que usa el juego, para el próximo arranque
function noteVendor() {
  app
    .getGPUInfo('basic')
    .then((info) => {
      const list = info?.gpuDevice || [];
      const vendor = (list.find((d) => d.active) || list[0])?.vendorId;
      if (!vendor) return;
      const v = videoPrefs();
      if (v.vendor === vendor) return;
      fs.writeFileSync(VIDEO(), JSON.stringify({ ...v, vendor }));
    })
    .catch(() => {});
}
// vuelta a D3D11: se anota y se reabre la app (sin el --use-angle de antes)
let fellBack = false;
function videoFallback(why) {
  // (midiendo, el modo que no anda queda anotado en el resultado: placa por software)
  if (fellBack || ANGLE === 'd3d11' || MEDIR) return;
  fellBack = true;
  console.error('modo de video:', ANGLE, '→ d3d11 (', why, ')');
  try {
    fs.writeFileSync(VIDEO(), JSON.stringify({ ...videoPrefs(), angle: 'd3d11', antes: ANGLE, porque: why }));
  } catch {}
  app.relaunch({ args: process.argv.slice(1).filter((a) => !a.startsWith('--use-angle') && a !== '--mdu-video-d3d11').concat('--mdu-video-d3d11') });
  app.exit(0);
}
app.on('child-process-gone', (e, d) => {
  if (d.type === 'GPU' && d.reason !== 'clean-exit') videoFallback(`placa ${d.reason}`);
});

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  // (sin placa de verdad con este modo, Chromium dibuja por software: SwiftShader)
  win.webContents.once('did-finish-load', () => {
    if (ANGLE === 'd3d11') return;
    win.webContents
      .executeJavaScript(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'sin webgl2'; })()`)
      .then((r) => {
        if (/swiftshader|basic render|llvmpipe|sin webgl2/i.test(r)) videoFallback(`dibujo por software: ${r}`);
      })
      .catch(() => {});
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
  if (MEDIR) q.set('medir', ANGLE);
  // (pruebas: una sola vuelta corta)
  if (MEDIR && process.env.MDU_MEDIR_CORTO) q.set('corto', '1');
  if (process.env.MDU_TEST_SETTINGS) q.set('set', process.env.MDU_TEST_SETTINGS);
  // (pruebas: MDU_URL carga otra dirección, ej. el mismo build por http, para
  // separar lo que cuesta el protocolo de lo que cuesta la ventana)
  win.loadURL(`${(TEST && process.env.MDU_URL) || 'app://game/index.html'}${q.size ? `?${q}` : ''}`);
  win.on('closed', () => {
    win = null;
  });
}

// Opciones › Gráficos (desktop/preload.cjs): el modo de video y la prueba
const MODES = ['d3d11', 'vulkan', 'gl'];
const MODE_NAME = { d3d11: 'DirectX 11', vulkan: 'Vulkan', gl: 'OpenGL', swiftshader: 'Software' };
const MEDIR_FILE = () => path.join(app.getPath('userData'), 'medir.json');
const relaunchWith = (extra) => {
  app.relaunch({ args: process.argv.slice(1).filter((a) => !a.startsWith('--use-angle') && !a.startsWith('--mdu-')).concat(extra) });
  app.exit(0);
};
ipcMain.handle('mdu:video', () => ({ actual: ANGLE, elegido: videoPrefs().angle || 'auto' }));
ipcMain.handle('mdu:setVideo', (e, mode) => {
  const v = videoPrefs();
  if (MODES.includes(mode)) v.angle = mode;
  else delete v.angle;
  delete v.antes;
  delete v.porque;
  try {
    fs.writeFileSync(VIDEO(), JSON.stringify(v));
  } catch {}
  return true;
});
ipcMain.handle('mdu:medir', () => {
  fs.writeFileSync(MEDIR_FILE(), JSON.stringify({ i: 0, res: [], desde: new Date().toISOString() }));
  relaunchWith(['--mdu-medir', `--use-angle=${MODES[0]}`]);
});
function medirResumen(st) {
  const f = (n, d = 0) => (n == null ? '-' : Number(n).toFixed(d).replace('.', ','));
  const a = st.res[0] || {};
  const L = [`Mate der Untoten · prueba de rendimiento · ${new Date().toLocaleString('es-AR')}`, `Placa: ${a.placa || '?'}`, `Pantalla: ${a.pantalla || '?'} · calidad ${a.calidad || '?'}`, ''];
  for (const r of st.res) {
    L.push(`${MODE_NAME[r.modo] || r.modo}: al título ${f(r.alTitulo_s, 1)} s${r.placa !== a.placa ? ` (placa: ${r.placa})` : ''}${r.error ? ` · error: ${r.error}` : ''}`);
    for (const [map, m] of Object.entries(r.mapas || {})) {
      const x = (k) => (m[k] ? `${f(m[k].fps)} fps, 95 % de los cuadros en ${f(m[k].p95, 1)} ms, ${m[k].tirones25} tirones` : '-');
      L.push(`  ${map}: entrar ${f(m.aJugar_s, 1)} s · solo ${x('solo')} · con ${m.vivos} muertos ${x('conMuertos')}`);
    }
  }
  L.push('', 'Datos completos:', JSON.stringify(st.res));
  return L.join(String.fromCharCode(13, 10));
}
ipcMain.handle('mdu:medirListo', (e, res) => {
  let st = { i: 0, res: [] };
  try {
    st = JSON.parse(fs.readFileSync(MEDIR_FILE(), 'utf8'));
  } catch {}
  st.res.push({ modo: ANGLE, ...res });
  st.i = st.res.length;
  if (st.i < MODES.length) {
    fs.writeFileSync(MEDIR_FILE(), JSON.stringify(st));
    relaunchWith(['--mdu-medir', `--use-angle=${MODES[st.i]}`]);
    return;
  }
  const txt = medirResumen(st);
  // (pruebas: MDU_MEDIR_OUT en vez del escritorio)
  const out = process.env.MDU_MEDIR_OUT || path.join(app.getPath('desktop'), 'Mate der Untoten - prueba de rendimiento.txt');
  try {
    fs.writeFileSync(out, txt);
  } catch {}
  fs.writeFileSync(MEDIR_FILE(), JSON.stringify({ ...st, fin: true, archivo: out }));
  relaunchWith([]);
});
ipcMain.handle('mdu:medirUltimo', () => {
  try {
    const st = JSON.parse(fs.readFileSync(MEDIR_FILE(), 'utf8'));
    if (!st.fin) return null;
    const best = st.res.map((r) => ({ modo: MODE_NAME[r.modo] || r.modo, fps: Object.values(r.mapas || {}).reduce((a, m) => a + (m.conMuertos?.fps || 0), 0) }));
    return { archivo: st.archivo, modos: best };
  } catch {
    return null;
  }
});

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
    noteVendor();
    // Escritorio 9 (2026-10-12): la pantalla no se apaga ni se bloquea con el
    // juego abierto (jugando con el joystick o mirando una cinemática no se toca
    // el teclado). Y prioridad: con la ventana del juego al frente, los procesos
    // del juego (el de la página y el de la placa) van en prioridad ALTA de
    // Windows: la CPU es primero para el juego. En segundo plano (otra ventana al
    // frente o minimizado) vuelven a normal, para no trabar lo demás (el usuario:
    // "quiero que mi juego ande mejor, no el resto de su pc; que baje en segundo
    // plano"). MDU_PRIORIDAD=0: como antes (todo normal).
    if (!TEST) powerSaveBlocker.start('prevent-display-sleep');
    if (process.env.MDU_PRIORIDAD !== '0') {
      const P = os.constants.priority;
      const prio = () => {
        const front = !!win && !win.isDestroyed() && win.isFocused() && !win.isMinimized();
        for (const m of app.getAppMetrics()) {
          // (y el proceso de audio de Chrome, type 'Utility': con la CPU ocupada
          // el sonido se cortaba con muchas cosas sonando; el usuario, 2026-10-12)
          const audio = m.type === 'Utility' && m.serviceName === 'audio.mojom.AudioService';
          if (m.type !== 'Browser' && m.type !== 'GPU' && m.type !== 'Tab' && !audio) continue;
          try {
            os.setPriority(m.pid, front ? P.PRIORITY_HIGH : P.PRIORITY_NORMAL);
          } catch {}
        }
      };
      prio();
      for (const ev of ['focus', 'blur', 'minimize', 'restore']) win?.on(ev, prio);
      win?.webContents.on('did-finish-load', prio);
      app.on('child-process-gone', () => setTimeout(prio, 3000));
      // el proceso de audio arranca recién cuando suena algo (después de cargar
      // la página) y no hay aviso de procesos nuevos: se repasa cada 5 s
      setInterval(prio, 5000);
    }
  });
  app.on('window-all-closed', () => app.quit());
}
