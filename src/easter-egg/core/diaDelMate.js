// El Día del Mate (el usuario, 2026-10-12: "todas las skins desbloqueadas por
// ese día, x2 de exp y x2 de pesos"): el 30 de noviembre, con la fecha de la
// compu de cada uno, todos los camuflajes se pueden usar (weapons/camos.js
// camoUnlocked; no se guardan como ganados: al otro día vuelven a como
// estaban) y la experiencia y los pesos que se ganan valen el doble
// (ui/Levels.js). En el título, un aviso corto (ui/PlayMenu.js).
// Para probar: globalThis.__mduDiaDelMate = true (lo fuerza) o = false (lo
// apaga aunque sea 30/11).

export function diaDelMate(now = new Date()) {
  const f = globalThis.__mduDiaDelMate;
  if (f === true) return true;
  if (f === false) return false;
  return now.getMonth() === 10 && now.getDate() === 30;
}

// cuánto se multiplican la experiencia y los pesos ganados hoy
export const mateK = () => (diaDelMate() ? 2 : 1);
