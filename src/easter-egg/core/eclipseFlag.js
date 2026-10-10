// "Eclipse Matero", el mapa final. Todo lo suyo pide
// globalThis.__mduEclipse === true (config/map.js, los controles, la armería,
// la escena nueva del Monumento, el capítulo 11 del libro...).
//
// Habilitado para todos desde el 2026-10-10 (el usuario: "Habilitá eclipse
// también"): la marca queda puesta siempre, en el sitio publicado y en el
// ejecutable. Este módulo se importa PRIMERO (index.js), así el switch ya está
// puesto cuando los demás lo leen.
// globalThis.__mduNoEclipse === true (puesto antes de cargar el juego): sin el
// mapa, como estaba mientras se armaba.
//
// (ECLIPSE_KEY: la marca vieja del servidor de desarrollo, Alt+E en el título;
// ya no decide nada.)

export const ECLIPSE_KEY = 'lm-zombies-eclipse';

if (globalThis.__mduNoEclipse !== true) globalThis.__mduEclipse = true;

export const eclipseOn = () => globalThis.__mduEclipse === true;
