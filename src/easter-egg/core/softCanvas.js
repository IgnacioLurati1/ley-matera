// Los lienzos 2D que se crean mientras esto está puesto se pintan por
// software (willReadFrequently) en vez de con la placa.
// Para qué: mientras el logo de Luta Studios tapa la carga (ui/StudioLogo),
// la placa tiene que quedar libre para dibujar el logo. Con los lienzos
// acelerados, Chrome junta todo lo que se pintó en Game.buildScene (carteles,
// atlas, pieles) y lo dibuja de un saque en el proceso de la placa cuando
// buildScene termina: ~260 ms seguidos (compila un shader de Skia por cada
// tipo de trazo), y en ese rato el navegador no dibuja la página: el logo se
// congelaba. Por software se pintan en el momento, en el hilo del juego.
// (medido 2026-10-09, carga en frío del molino: de 1-2 trabas de 280-410 ms a
// ninguna de más de 50 ms)
// Devuelve la función que lo saca. Los lienzos creados mientras tanto quedan
// por software; los de después, como siempre.
export function softCanvas() {
  const undo = [];
  for (const C of [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]) {
    if (!C) continue;
    const orig = C.prototype.getContext;
    const soft = function (type, opts) {
      return type === '2d' ? orig.call(this, type, { willReadFrequently: true, ...opts }) : orig.apply(this, arguments);
    };
    C.prototype.getContext = soft;
    undo.push(() => {
      if (C.prototype.getContext === soft) C.prototype.getContext = orig;
    });
  }
  return () => undo.forEach((f) => f());
}
