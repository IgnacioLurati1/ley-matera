import './studioLogo.css';
import { T, LOGO_MS, logoLayout, createLogoPainter } from './studioLogoDraw.js';

// El logo de Luta Studios, lo primero que se ve al abrir el juego: sobrio,
// blanco sobre negro. Se traza una L en el centro, la L se corre a la
// izquierda y una línea de luz destapa el resto de la palabra (LUTΛ), y
// abajo aparece STUDIOS (el dibujo está en ui/studioLogoDraw.js). Con sonido:
// el trazo, el golpe de la L, el aire al correrse y un acorde al quedar armado.
//
// Mientras tanto el juego carga detrás (Game.init), y eso tranca el hilo
// principal varios segundos seguidos. Por eso el logo NO usa animaciones de
// la página (ni de CSS ni element.animate): se dibuja en un lienzo desde otro
// hilo (ui/studioLogoWorker.js, con transferControlToOffscreen), con su propio
// reloj. Las dos versiones anteriores eran animaciones de la página y al
// usuario "se le teletransportaban a una L" cerca del final: cuando el hilo
// principal se destraba después de armar el mapa, su primer cuadro llega con
// la hora de antes de trabarse (medido: ~2,7 s atrasada) y la página
// re-sincroniza las animaciones con esa hora vieja. Un lienzo en otro hilo no
// pasa por ahí. El sonido se agenda entero de entrada (hilo del audio).
//
// Lo abre src/lib/easterEgg.js antes de que baje el juego (así es lo primero),
// o launch() si nadie se lo pasó. En las pruebas automáticas no sale, salvo
// con window.__mduStudioLogo = true (como ui/TitleIntro).

export { LOGO_MS };

export function studioLogoWanted() {
  if (typeof window === 'undefined') return false;
  if (window.__mduStudioLogo === false) return false;
  if (navigator.webdriver && !window.__mduStudioLogo) return false;
  return true;
}

// El lienzo del juego, con su contexto de WebGL ya creado y despierto. La
// primera llamada que espera respuesta del contexto ocupa la placa ~50 ms
// (ahí se termina de armar) y en ese rato el navegador no dibuja: se hace
// acá, antes de que el logo exista, y Game.init usa este lienzo (three pide
// el contexto con estos mismos atributos y recibe el que ya está).
// OJO: son los atributos del renderer de Game.init (sin antialias ni stencil,
// placa de alto rendimiento); si cambian allá, cambiarlos acá.
function gameCanvas() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { alpha: true, depth: true, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    // (la misma extensión que three prende primero: con ella despierta)
    gl?.getExtension('EXT_color_buffer_float');
    return gl ? c : null;
  } catch {
    return null;
  }
}

// ---------------- el sonido ----------------
// Todo el sonido del logo, agendado de una en `ctx`. `at`: la hora del
// contexto en la que el logo arrancó (puede ser pasada: lo que ya pasó no
// suena, y el acorde entra por donde vaya). `vol`: el volumen general.
// Sirve igual para un OfflineAudioContext (las pruebas lo graban así).
export function logoSound(ctx, at, vol = 0.8) {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = vol;
  // un limitador al final, por si se suman picos
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8;
  lim.knee.value = 6;
  lim.ratio.value = 8;
  lim.attack.value = 0.003;
  lim.release.value = 0.18;
  out.connect(lim).connect(ctx.destination);
  // el aire de la sala: una cola de ruido que se apaga (2,2 s)
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const room = ctx.createConvolver();
  room.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
  room.connect(wet).connect(out);
  const bus = ctx.createGain();
  bus.connect(out);
  bus.connect(room);
  // se apaga con el logo
  const end = at + (T.out + 500) / 1000;
  bus.gain.setValueAtTime(1, Math.max(now, at + T.leave / 1000));
  bus.gain.linearRampToValueAtTime(0, Math.max(now + 0.05, end));

  // ruido blanco para los soplos
  const nLen = Math.floor(ctx.sampleRate * 1.5);
  const nb = ctx.createBuffer(1, nLen, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;

  // (lo que ya pasó hace más de un instante no se toca)
  const late = (t) => t < now - 0.06;
  // un soplo: ruido por un pasabanda que barre f[0] → f[1] → f[2] Hz, con el pico en `peak`
  const breath = (t, dur, f, peak, q = 0.9, pan = 0) => {
    if (late(t)) return;
    const s = ctx.createBufferSource();
    s.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f[0], t);
    bp.frequency.exponentialRampToValueAtTime(f[1], t + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(f[2], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(0, t);
    p.pan.linearRampToValueAtTime(pan, t + dur);
    s.connect(bp).connect(g).connect(p).connect(bus);
    s.start(t);
    s.stop(t + dur + 0.05);
  };
  // una nota: ataque `a`, y cae hasta `dur` (con `to`, baja de tono al
  // arrancar; con `tail`, no cae a cero sino a esa parte del pico; con
  // `hold`, si ya debería estar sonando entra ahora). `into`: a dónde va.
  const tone = (t, freq, peak, a, dur, { type = 'sine', to = 0, tail = 0, into = bus, detune = 0, hold = false } = {}) => {
    const t1 = hold ? Math.max(t, now) : t;
    if (!hold && late(t)) return;
    const stop = t + dur;
    if (stop <= t1 + 0.05) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t1);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t1 + Math.min(0.2, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t1);
    g.gain.exponentialRampToValueAtTime(peak, Math.min(stop - 0.02, t1 + a));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * tail), stop);
    o.connect(g).connect(into);
    o.start(t1);
    o.stop(stop + 0.05);
  };

  // 1) el trazo del palo y del pie: dos roces de aire que suben
  breath(at + T.stem / 1000, 0.44, [500, 2200, 1200], 0.26);
  breath(at + T.foot / 1000, 0.34, [700, 2600, 1500], 0.2, 0.9, 0.2);
  // 2) la L queda armada: un golpe con cuerpo (grave + madera) y un toque arriba
  const hit = at + T.land / 1000 - 0.03;
  tone(hit, 150, 0.5, 0.005, 0.6, { to: 52 });
  tone(hit, 330, 0.2, 0.004, 0.16, { type: 'triangle', to: 180 });
  tone(hit, 2100, 0.05, 0.002, 0.09);
  // 3) la L se corre y la luz destapa las letras: el aire, de centro a
  // izquierda, y un brillo fino que sube con la línea de luz
  breath(at + T.slide / 1000, T.slideMs / 1000 + 0.15, [260, 2100, 600], 0.34, 0.8, -0.35);
  breath(at + T.slide / 1000 + 0.1, T.slideMs / 1000, [2400, 6500, 3800], 0.07, 2.5, 0.4);
  // 4) queda armado: un acorde cálido (re con la novena), sostenido hasta que
  // el logo se apaga. Dientes de sierra apenas desafinados por un pasabajos
  // que se abre: se oye también en parlantes chicos (no es solo grave).
  const land = at + (T.slide + T.slideMs - 80) / 1000;
  const stay = end + 0.1 - land;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  const lp0 = Math.max(land, now);
  lp.frequency.setValueAtTime(500, lp0);
  lp.frequency.exponentialRampToValueAtTime(2600, lp0 + 0.9);
  lp.frequency.exponentialRampToValueAtTime(1500, Math.max(lp0 + 1, end));
  lp.connect(bus);
  for (const [f, g] of [
    [73.42, 0.1],
    [146.83, 0.085],
    [220, 0.07],
    [293.66, 0.06],
    [369.99, 0.05],
    [440, 0.042],
    [659.26, 0.03],
  ]) {
    tone(land, f, g, 0.45, stay, { type: 'sawtooth', tail: 0.6, into: lp, detune: -5, hold: true });
    tone(land, f, g, 0.45, stay, { type: 'sawtooth', tail: 0.6, into: lp, detune: 6, hold: true });
    tone(land, f, g * 0.6, 0.35, stay, { tail: 0.5, hold: true });
  }
  // 5) STUDIOS: dos campanitas
  const bell = at + (T.studios + 80) / 1000;
  tone(bell, 880, 0.09, 0.004, 2);
  tone(bell, 1318.5, 0.05, 0.004, 1.5);
  tone(bell + 0.19, 1760, 0.035, 0.004, 1.3);
  tone(bell + 0.19, 2637, 0.014, 0.004, 0.9);
  // 6) el brillo que cruza: un soplo muy fino
  breath(at + T.sweep / 1000, 0.75, [1800, 5200, 2600], 0.05, 1.6, 0.3);
  return out;
}

// El sonido de verdad. El navegador lo deja sonar ya si hubo un clic o una
// tecla antes (se llega escribiendo en el buscador); recargando la página del
// juego con F5 queda en pausa hasta el primer clic o tecla.
// Se agenda entero en el momento, sin esperar a que el contexto arranque:
// mientras no corre, su hora está quieta y arranca desde ahí. (La primera
// versión esperaba a que arrancara y lo descartaba si tardaba más de 0,35 s;
// para entonces el hilo principal ya estaba ocupado con el juego: al usuario
// no le sonó nunca.) Cuando arranca de verdad, si el dispositivo de audio
// tardó en despertar y quedó corrido del dibujo, se re-agenda en hora.
function playSound(startedAt) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    // (2026-10-10, el usuario: "a veces el logo inicial no suena". Si antes no hubo
    // un clic ni una tecla —F5 en la página del juego, la app de escritorio
    // recién abierta— acá se cortaba: nunca sonaba, aunque el navegador lo
    // dejara (la app de escritorio lo deja siempre). Ahora se agenda igual: si
    // el contexto arranca solo, suena; si queda en pausa, arranca con el primer
    // clic o tecla, por donde vaya el logo (ver `wake`).
    // globalThis.__mduLogoSoundGate: como antes)
    if (!AC || (globalThis.__mduLogoSoundGate === true && navigator.userActivation?.hasBeenActive === false)) return null;
    // el volumen general de los ajustes del juego
    let vol = 0.8;
    try {
      const m = JSON.parse(localStorage.getItem('lm-zombies-settings'))?.master;
      if (typeof m === 'number') vol = m;
    } catch {
      /* el de siempre */
    }
    if (vol <= 0) return null;
    const ctx = new AC();
    let at = ctx.currentTime + 0.03;
    let out = logoSound(ctx, at, vol);
    let checked = false;
    const check = () => {
      if (checked || ctx.state !== 'running') return;
      checked = true;
      // la hora del contexto en la que apareció el logo
      let want = null;
      try {
        const ts = ctx.getOutputTimestamp?.();
        if (ts?.performanceTime > 0) want = ts.contextTime - (ts.performanceTime - startedAt) / 1000;
      } catch {
        /* se calcula abajo */
      }
      if (want == null) want = ctx.currentTime - (performance.now() - startedAt) / 1000 - Math.min(0.15, (ctx.baseLatency || 0) + (ctx.outputLatency || 0));
      if (Math.abs(want - at) < 0.12) return;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.04);
      // (ya casi se fue el logo: no vale la pena)
      if (now - want > (T.leave - 300) / 1000) return;
      at = want;
      out = logoSound(ctx, want, vol);
    };
    ctx.addEventListener('statechange', check);
    ctx.resume().then(check, () => {});
    check();
    // en pausa (sin gesto todavía): el primer clic o tecla lo arranca; `check`
    // lo pone en hora con el dibujo, o lo deja mudo si el logo ya se va
    if (ctx.state !== 'running') {
      const EVS = ['pointerdown', 'keydown', 'touchstart'];
      const off = () => EVS.forEach((ev) => window.removeEventListener(ev, wake, true));
      const wake = () => {
        off();
        if (ctx.state !== 'closed') ctx.resume().then(check, () => {});
      };
      EVS.forEach((ev) => window.addEventListener(ev, wake, true));
      ctx.addEventListener('statechange', () => ctx.state !== 'suspended' && off());
    }
    return ctx;
  } catch {
    return null;
  }
}

// ---------------- el dibujo ----------------
let current = null;

// Arranca el logo arriba de todo. Devuelve { el, canvas, started, clear,
// done, remove }: started = ya está dibujando (desde ahí se puede cargar
// pesado sin trabarlo); clear = el logo ya se apagó (solo queda irse el
// negro); done = se terminó de ir; canvas = el lienzo para el juego
// (null si el navegador no tiene WebGL 2). Uno solo a la vez: si ya hay uno
// andando, devuelve ese.
export function playStudioLogo(parent = document.body) {
  if (current && !current.over) return current;
  const canvas = gameCanvas();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const lay = logoLayout(vw, vh);
  let calm = false;
  try {
    calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* sin matchMedia: va con movimiento */
  }

  const el = document.createElement('div');
  el.className = 'sl-root';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Luta Studios');
  // el fondo: chico y estirado (es un degradé); el logo: en su caja, nítido
  let back = document.createElement('canvas');
  back.className = 'sl-back';
  back.width = 128;
  back.height = 72;
  let logo = document.createElement('canvas');
  logo.className = 'sl-logo';
  logo.width = Math.round(lay.bw * dpr);
  logo.height = Math.round(lay.bh * dpr);
  logo.style.cssText = `left:${lay.left}px;top:${lay.top}px;width:${lay.bw}px;height:${lay.bh}px`;
  el.append(back, logo);
  parent.appendChild(el);
  const startedAt = performance.now();
  const t0 = performance.timeOrigin + startedAt;

  let over = false;
  let finish;
  const done = new Promise((r) => {
    finish = r;
  });
  let ready;
  const started = new Promise((r) => {
    ready = r;
  });
  // (el negro liso del contenedor tapa hasta el primer cuadro; después el
  // negro es el del lienzo de fondo, que al final se desvanece)
  const onReady = () => {
    el.classList.add('is-on');
    ready();
  };
  let worker = null;
  let seek = () => {};
  let audio = null;
  let handle = null;
  const remove = () => {
    if (over) return;
    over = true;
    clearTimeout(safety);
    worker?.terminate();
    el.remove();
    // (el sonido ya se apagó con el logo; si lo sacan antes, se corta)
    if (audio && audio.state !== 'closed') audio.close().catch(() => {});
    if (current === handle) current = null;
    ready();
    finish();
  };
  // por si el aviso de que terminó no llega, igual se saca un rato después;
  // y la carga no espera más de un momento a que arranque
  const safety = setTimeout(remove, LOGO_MS + 2500);
  setTimeout(ready, 500);
  // el logo ya se apagó (queda el negro yéndose): Game.init puede volver a
  // ocupar la placa
  const clear = Promise.race([done, new Promise((r) => setTimeout(r, T.leave + 450))]);

  // Sin lienzos fuera del hilo (navegador viejo, o el hilo del logo falló):
  // se dibuja acá, en lienzos nuevos (los pasados al otro hilo ya no se
  // pueden usar). Se traba con la carga, pero sale.
  const paintHere = () => {
    if (over) return;
    worker?.terminate();
    worker = null;
    try {
      const nb = back.cloneNode(false);
      back.replaceWith(nb);
      back = nb;
      const nl = logo.cloneNode(false);
      logo.replaceWith(nl);
      logo = nl;
      const painter = createLogoPainter(lay, dpr, calm);
      const bctx = back.getContext('2d');
      const lctx = logo.getContext('2d');
      let frozen = null;
      seek = (ms) => {
        frozen = ms;
      };
      const tick = () => {
        if (over) return;
        const t = frozen ?? performance.now() - startedAt;
        painter.paintBack(bctx, t, back.width, back.height);
        painter.paint(lctx, t, logo.width, logo.height);
        onReady();
        if (frozen == null && t > LOGO_MS + 150) return remove();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setTimeout(remove, 0);
    }
  };
  try {
    // en otro hilo: no lo frena la carga del juego
    if (!logo.transferControlToOffscreen || typeof Worker === 'undefined' || globalThis.__mduLogoHere) throw new Error('sin lienzos fuera del hilo');
    worker = new Worker(new URL('./studioLogoWorker.js', import.meta.url), { type: 'module' });
    const ob = back.transferControlToOffscreen();
    const ol = logo.transferControlToOffscreen();
    worker.onmessage = ({ data }) => {
      if (data === 'ready') onReady();
      else if (data === 'done') remove();
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      paintHere();
    };
    // (globalThis.__mduLogoGpu: el lienzo con la placa, como antes)
    worker.postMessage({ back: ob, logo: ol, lay, dpr, t0, calm, gpu: globalThis.__mduLogoGpu === true }, [ob, ol]);
    seek = (ms) => worker?.postMessage({ seek: ms });
  } catch {
    paintHere();
  }

  audio = playSound(startedAt);

  handle = {
    el,
    canvas,
    audio,
    started,
    clear,
    done,
    remove,
    // (pruebas: congelado a los `ms`)
    seek: (ms) => seek(ms),
    get over() {
      return over;
    },
  };
  current = handle;
  return handle;
}
