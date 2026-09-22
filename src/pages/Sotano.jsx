import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { openEasterEgg } from '../lib/easterEgg';

// La página del juego oculto. Solo se entra desde el buscador (que deja la
// marca en la pestaña, así recargar sigue funcionando); escribiendo la
// dirección a mano se vuelve al inicio.
export const EGG_PATH = '/sotano';
const FLAG = 'lm-sotano';

export function allowSotano() {
  try {
    sessionStorage.setItem(FLAG, '1');
  } catch {
    /* sin sessionStorage igual se entra con el estado de la navegación */
  }
}

function allowed(state) {
  if (state?.egg) return true;
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

// Una sola partida abierta. En desarrollo React monta, desmonta y vuelve a
// montar: el juego se cierra solo si la página de verdad dejó de estar.
let session = null;
let mounted = 0;

export default function Sotano() {
  const navigate = useNavigate();
  const { state, key } = useLocation();
  const ok = allowed(state);

  useEffect(() => {
    if (!ok) return undefined;
    mounted++;
    // al salir del juego se vuelve a la página de donde vino
    const leave = () => {
      if (state?.from && key !== 'default') navigate(-1);
      else navigate(state?.from || '/', { replace: true });
    };
    if (!session) {
      const s = { done: false, silent: false, leave };
      s.game = openEasterEgg({
        onExit: () => {
          if (s.done) return;
          s.done = true;
          if (session === s) session = null;
          if (!s.silent) s.leave();
        },
      });
      session = s;
    } else session.leave = leave;
    return () => {
      mounted--;
      setTimeout(() => {
        if (mounted || !session) return;
        // se fue con el botón de atrás: se cierra el juego sin navegar otra vez
        const s = session;
        session = null;
        s.silent = true;
        if (!s.done) Promise.resolve(s.game).then((r) => r?.close?.());
      }, 0);
    };
  }, [ok, state, key, navigate]);

  if (!ok) return <Navigate to="/" replace />;
  return <div style={{ position: 'fixed', inset: 0, background: '#000' }} />;
}
