// Porteño encubierto: el Among Us de Mate of the Dead (el usuario, 2026-10-13:
// "Nuevo modo de juego: Among Us (llamado Porteño encubierto)"). El juego está
// en entities/penal/Porteno.js; los lugares del penal (tareas, botón, celdas y
// adónde se vuelve), en config/maps/penal.js porteno(). Acá, los números.

export const PZ = {
  // se juega en línea, de 4 a 10 (globalThis.__mduPorteñoMin: otro mínimo, solo para las pruebas)
  minPlayers: 4,
  maxPlayers: 10,
  // tareas por gaucho (y las de mentira del policía)
  tasks: 5,
  // el facón: alcance (m), lo que dura el tajo (s), cuándo corta y la espera entre muertes
  // (cada policía la suya; al arrancar y después de cada encierro, la primera)
  reach: 1.9,
  swing: 0.55,
  hitAt: 0.24,
  killCd: 25,
  firstCd: 15,
  // (el anfitrión acepta un tajo hasta esto más lejos de lo que lo ve: lo que se atrasa la red)
  lag: 1.4,
  // reportar un cuerpo: a cuánto (m)
  reportR: 2.6,
  // el botón rojo: uno por jugador por partida, y no antes de esto (s) desde
  // que arranca la partida o termina un encierro
  buttonWait: 15,
  buttonR: 1.8,
  // el encierro (s): fundido y celdas, la votación (el debate va por Discord),
  // cómo quedó, la visita del Alcaide y la vuelta al pabellón
  gather: 2.4,
  vote: 60,
  // (si votaron todos, se corta acá)
  voteAll: 3,
  result: 4,
  back: 1.6,
};

// (usuario 10-13: "Vamos a mejorar al impostor también") Los sabotajes del
// policía (entities/penal/pzSabotaje.js), con la Q. Uno activo a la vez y la
// espera es de todos los policías juntos (como en Among Us). Esperas en s.
export const PZS = {
  // la espera al arrancar la partida y después de cada encierro (cada sabotaje la suya)
  first: { fire: 60, lift: 20, doors: 20 },
  // la espera después de usar cada uno (cuenta desde que termina)
  cd: { fire: 150, lift: 30, doors: 35 },
  // la telesilla trabada y las zonas cerradas
  liftStop: 10,
  doorsT: 10,
  doorsMax: 3,
  // el incendio: lo que hay para apagarlo, cuánto tarda cada llama en crecer
  // entera (s) y cuánto la achica el chorro por segundo (de 0 a 1)
  fireT: 120,
  grow: 0.1,
  foam: 0.45,
  // el chorro del extintor: alcance (m) y ancho (coseno del ángulo)
  sprayR: 6.5,
  sprayCos: 0.93,
  // los botes: cuántos van, lo que espera para salir desde que sube el primero (s)
  seats: 5,
  boatWait: 5,
  // la isla quemada: lo que dura la toma hasta el final (s)
  burnT: 7,
};

// (usuario 10-13: "5 colores de poncho más, solo en Porteño encubierto") Los 10
// ponchos del modo, uno distinto por jugador (el anfitrión los reparte al
// arrancar: Porteno.hostStart). Los 5 primeros son los de siempre
// (net/Avatars PONCHOS); los demás modos siguen con esos 5. Los mismos colores
// van en los puntos de la votación y en los nombres.
export const PZ_PONCHOS = [0xa8231c, 0x1e5aa8, 0x1f7a3a, 0xc9a02a, 0x6a2a8a, 0xd0641e, 0x1aa0a8, 0xd0508c, 0xd8d4c8, 0x262626];

// El color de un poncho en la pantalla (los puntos de la votación y los
// nombres): como se ve en el pabellón (net/Avatars lo sube x1,7 en lineal, que
// en pantalla es x1,3 más o menos) y, con `light`, más claro, para las letras
// sobre fondo oscuro.
export function ponchoCss(hex, light = 0) {
  const ch = (sh) => {
    const v = Math.min(255, ((hex >> sh) & 255) * 1.3);
    return Math.round(v + (255 - v) * light);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// Cuántos policías: 'auto' (1 de 4 a 6 jugadores, 2 de 7 en adelante) o un
// número fijo; nunca más del tope de Among Us (1 hasta 6, 2 con 7-8, 3 con 9-10).
export function copsCap(n) {
  return n >= 9 ? 3 : n >= 7 ? 2 : 1;
}
export function copsFor(n, pick = 'auto') {
  const want = pick === 'auto' || !(pick > 0) ? (n >= 7 ? 2 : 1) : pick | 0;
  return Math.max(1, Math.min(copsCap(n), want));
}
