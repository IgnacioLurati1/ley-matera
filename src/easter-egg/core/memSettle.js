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
// globalThis.__mduMemSettle: cuánto tardó la última (ms), para las pruebas.

// Se llama al terminar la cinemática de entrada (o al entrar, si no hay): la
// pantalla todavía viene de negro.
export function settleMemory() {
  if (typeof globalThis.gc !== 'function') return;
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

// Y en cada descanso entre rondas (escritorio 3, tanda de optimización,
// 2026-10-12): la pasada grande del recolector caía en plena ronda (en Eclipse,
// Épica, 9 en 90 s, la peor de 43 ms). Con la ronda terminada y sin muertos
// vivos se pasa ahí, a 1,5 s del final (el cartel de la ronda ya está arriba).
// En la torre el descanso es corto y quedan muertos: no se hace.
// globalThis.__mduBreakGc: cuánto tardó.
export function settleBreak(g) {
  if (typeof globalThis.gc !== 'function') return;
  setTimeout(() => {
    if (g.rounds?.state !== 'break' || g.zombies?.pool?.some((z) => z.active && !z.dead)) return;
    const t0 = performance.now();
    try {
      globalThis.gc();
      globalThis.__mduBreakGc = Math.round(performance.now() - t0);
    } catch {
      /* sin recolector a mano: como antes */
    }
  }, 1500);
}
