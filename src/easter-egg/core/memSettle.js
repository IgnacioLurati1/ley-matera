// La basura de la carga, afuera al empezar a jugar (solo donde se puede).
//
// Armar un mapa y pasar la cinemática de entrada deja ~400 MB de objetos y
// ~190 MB de arreglos de datos muertos (medido en Eclipse, Épica). El motor de
// JS los limpia recién en su próxima pasada grande, que llega sola a los
// 30-100 s de empezar a jugar: a veces no se nota y a veces es un cuadro de
// 60-150 ms.
//
// Desde una página no se le puede pedir al recolector que pase. Probado y
// descartado (2026-10-10): pedir y soltar ArrayBuffers para apurarlo solo
// dispara pasadas chicas (640 MB pedidos en 1,5 s y la grande no llegó), y
// retenerlos hasta que llegue pide tener cientos de MB de más. Así que esto
// solo hace algo cuando existe globalThis.gc: la versión de escritorio,
// abierta con --js-flags=--expose-gc (desktop/main.cjs). En el navegador no
// hace nada.
// globalThis.__mduNoMemSettle: como antes. globalThis.__mduMemSettle: cuánto
// tardó la última (ms), para las pruebas.

// Se llama al terminar la cinemática de entrada (o al entrar, si no hay): la
// pantalla todavía viene de negro.
export function settleMemory() {
  if (globalThis.__mduNoMemSettle === true || typeof globalThis.gc !== 'function') return;
  setTimeout(() => {
    const t0 = performance.now();
    try {
      globalThis.gc();
      globalThis.__mduMemSettle = Math.round(performance.now() - t0);
    } catch {
      /* sin recolector a mano: como antes */
    }
  }, 60);
}
