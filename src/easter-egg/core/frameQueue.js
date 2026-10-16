// Cuántos cuadros puede ir la CPU por delante de la placa (2026-10-15, el usuario:
// "hacé 1 y 2"; el 1: limitar los cuadros en cola). En Eclipse el proceso de la
// placa de Chrome no daba abasto: la cola de órdenes se llenaba y el juego quedaba
// trabado a mitad de un dibujo (pasadas que tardaban el doble o el triple, cuadros de
// 105-133 ms). Como los motores de verdad: al terminar cada cuadro va una marca
// (fenceSync) y, si la placa todavía no terminó los MAX cuadros de antes, este cuadro
// no se arma (ni se juega ni se dibuja: el siguiente toma el tiempo que pasó). Las
// marcas se miran sin esperar (clientWaitSync con 0). Una marca que no llega en
// 100 ms se suelta, para no trabar nunca el juego.
// globalThis.__mduColaLibre = true: como antes; __mduColaMax: cuántos cuadros (2).
// APAGADA por defecto desde el 2026-10-16: en la app de escritorio de verdad (pantalla
// completa, monitor de 60 Hz) con VSync, la placa termina cada marca recién un cuadro o
// dos después (espera al refresco), la cola se llenaba y cada cuadro salteado perdía un
// refresco entero: Eclipse con 24 muertos bajaba de 60 a 42-59 fps, con cuadros de hasta
// 325 ms. Sin VSync no hace falta: Chromium ya no deja adelantarse a la CPU (demora de la
// placa de un cuadro, 5,4 ms, con y sin ella) y con ella Eclipse daba 4 % menos. Lo que
// se había medido a favor (+10 % en I-o) era del Chromium sin ventana de las pruebas.
// globalThis.__mduCola = true (antes de cargar o en cualquier momento): prendida.
const MAX = 2;
const STALE = 100;

export function frameQueue(renderer) {
  const gl = renderer.getContext();
  if (typeof gl.fenceSync !== 'function') return null;
  const q = [];
  const F = { marks: 0, skipped: 0, stale: 0 };
  const drop = () => {
    while (q.length > 0) gl.deleteSync(q.shift().s);
  };
  // ¿se arma este cuadro?
  const off = () => globalThis.__mduCola !== true || globalThis.__mduColaLibre === true;
  F.ready = (now) => {
    if (off()) return true;
    while (q.length > 0) {
      const e = q[0];
      if (gl.clientWaitSync(e.s, 0, 0) === gl.TIMEOUT_EXPIRED) {
        if (now - e.t < STALE) break;
        F.stale++;
      }
      gl.deleteSync(q.shift().s);
    }
    if (q.length < (globalThis.__mduColaMax ?? MAX)) return true;
    F.skipped++;
    return false;
  };
  // al terminar el cuadro
  F.mark = (now) => {
    F.marks++;
    if (off()) {
      drop();
      return;
    }
    const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (s !== null) q.push({ s, t: now });
  };
  F.dispose = drop;
  return F;
}
