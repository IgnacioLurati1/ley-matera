// "Eclipse Matero", el mapa final, está en obra y escondido: todo lo suyo pide
// globalThis.__mduEclipse === true (config/map.js, los controles, la armería,
// la escena nueva del Monumento...). Las pruebas lo prenden antes de cargar.
//
// Para probarlo a mano en el servidor de desarrollo: Alt+E en el título
// (Game.onKey) guarda esta marca y recarga la página. Este módulo se importa
// PRIMERO (index.js), así el switch ya está puesto cuando los demás lo leen.
// Fuera del servidor de desarrollo (el sitio publicado, el ejecutable) la
// marca no se mira: ahí Eclipse no existe.

export const ECLIPSE_KEY = 'lm-zombies-eclipse';

try {
  if (import.meta.env.DEV && localStorage.getItem(ECLIPSE_KEY) === '1') globalThis.__mduEclipse = true;
} catch {
  // (sin localStorage: queda apagado)
}

export const eclipseOn = () => globalThis.__mduEclipse === true;
