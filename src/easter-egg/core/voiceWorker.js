// Renderiza los murmullos de los personajes fuera del hilo principal: cada
// línea son 20-30 ms de síntesis y en el juego trababa varios cuadros. Recibe
// los segmentos y el perfil de voz (speechPlan) y devuelve las muestras.
import { renderVoice, zombieSound } from './voice';

// (bank: los gemidos de los zombies del arranque, core/audio buildBank)
self.onmessage = ({ data: { id, segs, P, bank } }) => {
  if (bank) {
    const out = {};
    const tr = [];
    for (const [kind, n] of Object.entries(bank)) {
      out[kind] = [];
      for (let i = 0; i < n; i++) {
        const d = zombieSound(kind).data;
        out[kind].push(d);
        tr.push(d.buffer);
      }
    }
    self.postMessage({ id, data: out }, tr);
    return;
  }
  const out = renderVoice(segs, P);
  self.postMessage({ id, data: out }, [out.buffer]);
};
