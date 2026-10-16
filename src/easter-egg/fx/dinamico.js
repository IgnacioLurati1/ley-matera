// Resolución dinámica de los efectos (2026-10-15, el usuario: "A y B capaz?"; esto es la
// A). La imagen principal queda siempre entera: cuando la placa no llega, bajan de a un
// escalón las pasadas que van aparte y se notan poco más chicas (el espejo del agua, la
// oclusión, los haces de luna, las sombras de contacto, la luz rebotada). Se decide con
// el tiempo de placa de cada cuadro (EXT_disjoint_timer_query_webgl2, alrededor de todo
// el dibujo de PostFX), contra lo que dura un cuadro del monitor (los intervalos más
// cortos entre cuadros: con vsync, el del monitor). Si la placa pasa del 92% de eso en
// más de la mitad del último medio segundo, un escalón abajo (cada 2 s como mucho); si
// queda debajo del 65% durante 4 s, uno arriba. Cada cambio de escalón rehace las
// texturas de esas pasadas (un cuadro algo más largo, de vez en cuando).
// La B (la imagen principal más chica): solo con globalThis.__mduDinamicoPrincipal =
// true, un último escalón con la principal al 90% y FSR (fx/Fsr), si el escalado está
// apagado. Para la B de verdad (reconstruir con los cuadros anteriores) hacen falta
// vectores de movimiento de cada objeto: ver fx/TAA.js (sin ellos, un muerto que cruza
// queda transparente).
// globalThis.__mduDinamicoNo = true (antes de cargar): nunca. En las pruebas automáticas
// (navigator.webdriver) no corre, salvo con globalThis.__mduDinamico = true.

// cada escalón: el espejo (fracción de su resolución) y los divisores de cada pasada
const LEVELS = [
  { refl: 1, ao: 2, vol: 2, contact: 2, bounce: 4, main: 1 },
  { refl: 0.7, ao: 3, vol: 2, contact: 2, bounce: 4, main: 1 },
  { refl: 0.5, ao: 4, vol: 3, contact: 3, bounce: 6, main: 1 },
  { refl: 0.5, ao: 4, vol: 3, contact: 3, bounce: 6, main: 0.9 },
];
// lo que leen las pasadas al tomar su tamaño (fx/Epic, fx/contacto, fx/Bounce, fx/Water)
export const DYN = { ...LEVELS[0], level: 0 };

export default class Dinamico {
  constructor(renderer, post) {
    this.post = post;
    const gl = renderer.getContext();
    this.gl = gl;
    const off = globalThis.__mduDinamicoNo === true || (typeof navigator !== 'undefined' && navigator.webdriver && globalThis.__mduDinamico !== true);
    this.ext = off ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.q = [];
    this.gpu = [];
    this.iv = [];
    this.changedAt = 0;
    this.query = null;
    // (Opciones › Gráficos › Resolución dinámica de efectos: Game setOn)
    this.enabled = true;
  }

  setOn(on) {
    this.enabled = !!on;
    if (!this.enabled) this.reset();
  }

  get on() {
    return !!this.ext && this.enabled;
  }

  // alrededor del dibujo de cada cuadro
  begin() {
    if (!this.on || this.query) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.query = q;
  }

  end(dtMs, now) {
    if (!this.ext) return;
    const gl = this.gl;
    // (apagada: se terminan las que quedaban y nada más)
    if (!this.enabled && !this.query && !this.q.length) return;
    if (this.query) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.q.push(this.query);
      this.query = null;
    }
    // (los resultados llegan uno a tres cuadros después)
    const dis = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.q.length && gl.getQueryParameter(this.q[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.q.shift();
      if (!dis) push(this.gpu, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6, 120);
      gl.deleteQuery(q);
    }
    if (this.q.length > 6) for (const q of this.q.splice(0, this.q.length - 6)) gl.deleteQuery(q);
    if (dtMs > 0 && dtMs < 100) push(this.iv, dtMs, 180);
    if (this.enabled) this.decide(now);
  }

  decide(now) {
    if (this.gpu.length < 30 || this.iv.length < 60) return;
    // lo que dura un cuadro del monitor: el 20% más corto de los intervalos (sin VSync,
    // en la app de escritorio, lo dice la app: globalThis.__mduMonitorMs)
    const s = this.iv.slice().sort((a, b) => a - b);
    const frame = globalThis.__mduMonitorMs > 0 ? globalThis.__mduMonitorMs : s[Math.floor(s.length * 0.2)];
    const last = this.gpu.slice(-30);
    const max = globalThis.__mduDinamicoPrincipal === true && this.post.scale === 1 && !this.post.fsr.enabled ? 3 : 2;
    let L = DYN.level;
    if (now - this.changedAt > 2000 && L < max && last.filter((g) => g > frame * 0.92).length > last.length / 2) L++;
    else if (now - this.changedAt > 4000 && L > 0 && this.gpu.slice(-120).every((g) => g < frame * 0.65)) L--;
    if (L !== DYN.level) this.set(L, now);
  }

  set(L, now = performance.now()) {
    const was = DYN.main;
    Object.assign(DYN, LEVELS[L], { level: L });
    this.changedAt = now;
    this.gpu.length = 0;
    const P = this.post;
    // (la principal, con FSR: como el modo de escalado personalizado)
    if (DYN.main !== was) {
      P.scale = DYN.main;
      P.fsr.enabled = DYN.main < 1;
      P.fsr.setSharpness(0.8);
      P.taa.valid = false;
    }
    if (P.size) P.setSize(...P.size);
  }

  // (al cambiar de calidad o de escalado a mano: de nuevo desde el principio)
  reset() {
    if (DYN.level !== 0) this.set(0);
    this.gpu.length = 0;
  }

  dispose() {
    for (const q of this.q) this.gl.deleteQuery(q);
    this.q.length = 0;
  }
}

function push(a, v, n) {
  a.push(v);
  if (a.length > n) a.shift();
}
