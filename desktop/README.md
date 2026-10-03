# Mate der Untoten para Windows (Electron)

El mismo juego de la web (`src/easter-egg`), solo, sin la tienda, en una ventana de Windows.
No toca el `package.json` ni el `vite.config.js` de la raíz: la web se arma igual que siempre.

## Comandos (desde `desktop/`)

```
npm install          # electron 44 y @electron/packager (solo acá)
npm run build        # el juego → desktop/app (vite.desktop.mjs, base './')
npm start            # abrir sin empaquetar (lee los assets de public/)
npm run pack         # carpeta para Windows x64 → desktop/out/Mate der Untoten-win32-x64
ZIP=1 npm run pack   # además, el .zip de esa carpeta para repartir (~275 MB)
```

`npm run pack` necesita `npm run build` antes. Lo que sale en `out/` no se sube (está en `.gitignore`).
Para repartirlo va el .zip (o la carpeta `Mate der Untoten-win32-x64` entera); adentro está `MateDerUntoten.exe`.
Va sin firmar y sin actualizaciones automáticas: Windows SmartScreen puede avisar la primera vez ("Más información" → "Ejecutar de todas formas").

## Cómo está armado

- `index.html` + `entry.js`: llaman a `launch()` de `src/easter-egg/index.js` con el mismo punto de encuentro de las salas que la web (`src/lib/netSignal.js`, Supabase). Así una partida en línea junta la versión de escritorio con la web.
- `main.cjs` (proceso principal):
  - sirve el juego por el protocolo `app://game/`, registrado como estándar y seguro, con fetch, streams y caché de código;
  - las rutas `/assets/sotano/...` del juego salen de `public/assets/sotano` (sin empaquetar) o de `resources/sotano` (empaquetado);
  - el archivo entero lo lee Chromium (`net.fetch`); los pedidos por partes (`Range`, la canción del easter egg por `<audio>`) van con un stream propio.
- Aislado entre orígenes (`crossOriginIsolated`): COOP `same-origin` + COEP `credentialless`. Hay `SharedArrayBuffer`, y Supabase (CORS y websockets) sigue andando.
- La placa dedicada en notebooks (`force_high_performance_gpu`), sin la lista negra de placas, y sin frenar nada en segundo plano.
- La ventana sale maximizada, sin barra de menú, cuando ya pintó (`ready-to-show`). F11 es pantalla completa.
  - Jugando, cerrar con la X pregunta antes, porque el juego pide confirmar al salir (`beforeunload`).
  - Una sola ventana: abrir el juego de nuevo trae la que ya estaba.
  - Si el proceso del juego se cae (memoria, placa), la ventana se vuelve a cargar sola en vez de quedar en blanco.
- Caché de código V8 (`v8CacheOptions: 'bypassHeatCheck'`, desde la primera vez) y la de shaders de la GPU quedan en la carpeta de datos (`%APPDATA%/Mate der Untoten`).
- Fuentes: van adentro (`static/fonts`, bajadas con `node tools/fonts.mjs`), así el juego anda sin internet. Si cambian las fuentes de `src/easter-egg/index.js`, correr de nuevo `tools/fonts.mjs`.
- El botón de la versión original (`/sotano-original`) no existe acá: la navegación queda bloqueada. Los links de afuera (Instagram) se abren en el navegador.

## Pruebas

`main.cjs` lee estas variables (solo para pruebas):

| Variable | Qué hace |
| --- | --- |
| `MDU_TEST=1` | Ventana chica, a la vista pero sin foco (no roba el teclado), sin pregunta al cerrar y con `window.g` y `window.__tTitle` (cuándo llegó al título). |
| `MDU_USERDATA=carpeta` | Otra carpeta de datos (arranque en frío con una vacía). |
| `MDU_TEST_SETTINGS={...}` | Ajustes del juego antes de arrancar (mapa, calidad...). |
| `MDU_NODE_STREAM=1` | Sirve los archivos enteros con stream de node en vez de `net.fetch` (comparar). |
| `MDU_URL=http://...` | Carga otra dirección (el mismo build por http): separa lo que cuesta el protocolo de lo que cuesta la ventana. |
| `MDU_TEST_RELOAD=1` | En modo prueba también recarga si el proceso del juego se cae. |

El exe empaquetado se maneja con `--remote-debugging-port=N` y `chromium.connectOverCDP` de Playwright, con timeout corto. Si no, la conexión puede esperar 30 s.

## El progreso de la web no pasa solo

La versión de escritorio arranca con el `localStorage` y el IndexedDB vacíos: nivel, logros, camuflajes y empanadas desde cero.
Idea para traerlo, no hecha: el perfil ya sale y entra con el código de respaldo (`ui/Profile.js`: exportar/importar archivo).
- En la web, un botón "Llevar a la versión de escritorio" que copie ese código.
- En escritorio, al primer arranque sin perfil, ofrecer "Pegar tu código de la web".
- Sin servidor ni cuentas: el mismo respaldo de siempre.
