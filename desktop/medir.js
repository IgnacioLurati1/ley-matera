// Prueba de rendimiento sola (2026-10-12, para comparar los modos de video en
// placas que no son la del usuario: Opciones › Gráficos › Prueba de rendimiento;
// main.cjs abre el juego con DirectX 11 y OpenGL, con --mdu-medir). Sin
// tocar nada: carga, entra a dos mapas, mira alrededor sin muertos y después con
// 24, y main.cjs deja los números en un archivo del escritorio.
// Los ajustes del jugador se guardan antes y se devuelven al terminar.
const KEY = 'lm-zombies-settings';
const MAPS = ['penal', 'eclipse'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (o) => console.log('MDU_MEDIR ' + JSON.stringify(o));

async function until(f, ms) {
  const t0 = performance.now();
  while (!f()) {
    if (performance.now() - t0 > ms) return false;
    await sleep(50);
  }
  return true;
}

// los cuadros de `secs` segundos girando la cámara despacio
async function frames(g, secs) {
  const P = g.player;
  const d = [];
  let last = 0;
  const t0 = performance.now();
  await new Promise((res) => {
    const f = (t) => {
      if (last) d.push(t - last);
      last = t;
      if (P) P.yaw += 0.004;
      if (t - t0 < secs * 1000) requestAnimationFrame(f);
      else res();
    };
    requestAnimationFrame(f);
  });
  const s = d.slice().sort((a, b) => a - b);
  const q = (k) => +(s[Math.min(s.length - 1, Math.floor(k * s.length))] || 0).toFixed(1);
  const avg = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  return { fps: +(1000 / avg).toFixed(0), ms: +avg.toFixed(2), p95: q(0.95), p99: q(0.99), max: +(s.at(-1) || 0).toFixed(0), tirones25: d.filter((x) => x > 25).length, tirones50: d.filter((x) => x > 50).length };
}

export async function medir(g, saved, corto = false) {
  await until(() => g.state === 'title', 300000);
  const tTitle = performance.now();
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  const out = {
    placa: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'sin webgl2',
    pantalla: `${screen.width}x${screen.height} (ventana ${innerWidth}x${innerHeight}, escala ${devicePixelRatio})`,
    calidad: g.settings?.quality,
    alTitulo_s: +(tTitle / 1000).toFixed(1),
    mapas: {},
  };
  try {
    for (const map of corto ? ['penal'] : MAPS) {
      const r = {};
      if (g.mapId !== map) {
        const t = performance.now();
        g.setMap(map);
        await until(() => g.mapId === map && g.state === 'title' && !g.loading, 180000);
        r.cambioDeMapa_s = +((performance.now() - t) / 1000).toFixed(1);
        await sleep(1500);
      }
      const t = performance.now();
      g.startGame();
      await until(() => g.state === 'playing', 180000);
      await until(() => g.intro?.active, 5000);
      if (g.intro?.active) g.intro.end(false);
      r.aJugar_s = +((performance.now() - t) / 1000).toFixed(1);
      g.godMode = true;
      // sin muertos: la ronda en pausa
      const R = g.rounds;
      R.state = 'break';
      R.breakT = 99999;
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      await sleep(2000);
      r.solo = await frames(g, corto ? 3 : 12);
      // con muertos alrededor
      R.round = 6;
      R.nextRound();
      R.toSpawn = 999;
      R.delay = 0.12;
      R.spawnT = 0;
      await until(() => g.zombies.pool.filter((z) => z.active).length >= 24, 25000);
      R.toSpawn = 0;
      await sleep(3000);
      r.conMuertos = await frames(g, corto ? 3 : 15);
      r.vivos = g.zombies.pool.filter((z) => z.active).length;
      out.mapas[map] = r;
      g.toTitle();
      await until(() => g.state === 'title', 30000);
      await sleep(1500);
    }
  } catch (e) {
    out.error = String(e?.message || e);
  } finally {
    try {
      if (saved == null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, saved);
    } catch {}
  }
  // (la app guarda el resultado y se vuelve a abrir con el modo siguiente)
  if (window.mduDesktop?.medirListo) await window.mduDesktop.medirListo(out);
  else {
    say(out);
    await sleep(300);
    window.close();
  }
}
