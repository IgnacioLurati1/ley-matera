// Renderiza los murmullos de los personajes fuera del hilo principal: cada
// línea son 20-30 ms de síntesis y en el juego trababa varios cuadros. Recibe
// los segmentos y el perfil de voz (speechPlan) y devuelve las muestras.
import { renderVoice } from './voice';

self.onmessage = ({ data: { id, segs, P } }) => {
  const out = renderVoice(segs, P);
  self.postMessage({ id, data: out }, [out.buffer]);
};
