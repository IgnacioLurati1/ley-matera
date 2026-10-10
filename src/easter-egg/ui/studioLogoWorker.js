import { createLogoPainter, LOGO_MS } from './studioLogoDraw.js';

// El logo de Luta Studios dibujado en otro hilo (ui/StudioLogo.js le pasa los
// dos lienzos). Acá corre su propio reloj y sus propios cuadros: lo que se ve
// depende solo de cuánto tiempo pasó, no de lo que esté haciendo el hilo del
// juego ni de las animaciones de la página (el logo anterior, hecho con
// animaciones de la página, le volvía de golpe a "una L" al usuario cuando el
// hilo del juego se destrababa a mitad de la carga).

const frame = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
// la hora de pared, la misma en todos los hilos
const wall = () => performance.timeOrigin + performance.now();
let st = null;

function draw() {
  const t = st.frozen ?? wall() - st.t0;
  st.painter.paintBack(st.bctx, t, st.back.width, st.back.height);
  st.painter.paint(st.lctx, t, st.logo.width, st.logo.height);
  return t;
}

function tick() {
  const t = draw();
  if (!st.ready) {
    st.ready = true;
    self.postMessage('ready');
  }
  if (st.frozen != null) return;
  if (t > LOGO_MS + 150) return self.postMessage('done');
  frame(tick);
}

self.onmessage = ({ data }) => {
  // (pruebas: congelado en un momento)
  if (data.seek != null) {
    if (!st) return;
    const was = st.frozen;
    st.frozen = data.seek;
    if (was == null) return;
    draw();
    return;
  }
  const { back, logo, lay, dpr, t0, calm, gpu } = data;
  // Por software, no con la placa: la placa está ocupada compilando los
  // shaders del juego y un lienzo acelerado espera en la misma fila (el logo
  // se quedaba quieto ~1 s justo al apagarse). Por software se pinta en este
  // hilo y la página solo lo compone, que la placa hace primero que nada.
  const opt = gpu ? {} : { willReadFrequently: true };
  st = { back, logo, bctx: back.getContext('2d', opt), lctx: logo.getContext('2d', opt), painter: createLogoPainter(lay, dpr, calm), t0, frozen: null, ready: false };
  frame(tick);
};
