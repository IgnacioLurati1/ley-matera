// Zombies gauchescos: el modo en línea de Mate no Numa (el usuario, 2026-10-13:
// "basado en el Convertido de Black Ops 2"). El juego está en
// entities/esteros/Gauchescos.js; los lugares del mapa, en config/maps/esteros.js
// gauchescos(). Acá, la escalera de mates y los números del modo.

// La escalera: cada zombi que baja el humano lo pasa al mate siguiente; el
// primero que llega al último gana al instante. De los más fáciles (mucho
// cargador, automáticos) a los más difíciles (de a un tiro); el último, el
// especial. Cada jugador guarda en cuál quedó.
export const GZ_LADDER = ['camionero', 'vidrio', 'mate47', 'algarrobo', 'gemelos', 'lata', 'porongo', 'explosivo', 'torpedo', 'bombillazo', 'oro'];

// Los tiros que hacen falta, como mínimo, para bajar al zombi con cada mate
// (el usuario, 2026-10-14: "el humano ganaba siempre porque el zombie moría muy
// rápido, por eso forzar 3 o 4 tiros por arma"): un disparo le saca como mucho
// 1/n de la vida, cabeza incluida. Las automáticas, 4; las de a un tiro y las
// fuertes, 3. (entities/esteros/Gauchescos.js damage)
export const GZ_SHOTS = { camionero: 4, vidrio: 4, mate47: 4, algarrobo: 4, gemelos: 4, lata: 3, porongo: 3, explosivo: 3, torpedo: 3, bombillazo: 3, oro: 3 };

export const GZ = {
  // la partida (s): al terminar gana el que más avanzó (empate: más bajas)
  time: 300,
  // se juega de a dos o más (en línea)
  minPlayers: 2,
  // la vida de un zombi para los mates del humano
  zombieHp: 100,
  // el tope por disparo (GZ_SHOTS) de lo que no es un mate de la escalera (el facón, las granadas)
  shotsElse: 3,
  // la paja que se ve a través (m): más que esto entre el humano y el zombi, el tiro no le pega
  grassSee: 1.2,
  // (lo alta que es la paja: por arriba, desde la galería de la Casona, se ve)
  grassH: 2.6,
  // el zombi va a esto por lo que va el humano (el usuario: "más rápido que el player")
  zombieSpeed: 1.25,
  // el zombi caído vuelve a los (s), lejos del humano
  respawn: 4,
  // el zarpazo: alcance (m), lo que dura (s) y cuándo pega
  reach: 1.9,
  swing: 0.55,
  hitAt: 0.2,
  // (el anfitrión acepta un zarpazo hasta esto más lejos de lo que lo ve: lo que se atrasa la red)
  lag: 1.6,
  // el que toma la cura también aparece lejos (como el que convierte al humano)
  cureTp: true,
};
