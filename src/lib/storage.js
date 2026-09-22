// localStorage puede fallar (modo privado, cuota, etc.), así que todo va envuelto.
export const local = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin espacio o bloqueado: seguimos sin persistir */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};
