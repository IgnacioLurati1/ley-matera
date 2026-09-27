import { supabase } from './supabase';

// Punto de encuentro para las salas del juego escondido. Solo sirve para que
// dos navegadores intercambien la "tarjeta de presentación" (WebRTC) y se
// conecten directo: después de eso los datos de la partida no pasan por acá.
// No se guarda nada en la base: son mensajes al voleo de Realtime.
export function createSignal() {
  if (!supabase) return null;
  let channel = null;
  return {
    async open(code, onMessage) {
      // un intento anterior que quedó abierto (la sala no contestó y se
      // reintenta con el mismo código): Supabase devolvería ese mismo canal ya
      // suscripto, y su subscribe no avisa nunca (quedaba "Conectando...")
      if (channel) await supabase.removeChannel(channel);
      for (const c of supabase.getChannels()) if (c.topic === `realtime:mdu-${code}`) await supabase.removeChannel(c);
      channel = supabase.channel(`mdu-${code}`, { config: { broadcast: { self: false } } });
      channel.on('broadcast', { event: 'sig' }, ({ payload }) => onMessage(payload));
      await new Promise((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('No se pudo abrir la sala'));
        });
      });
    },
    send(msg) {
      channel?.send({ type: 'broadcast', event: 'sig', payload: msg });
    },
    close() {
      if (channel) supabase.removeChannel(channel);
      channel = null;
    },
  };
}
