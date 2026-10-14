// Zombies gauchescos: el modo en línea de Mate no Numa (el usuario, 2026-10-13:
// "basado en el Convertido de Black Ops 2"). El juego está en
// entities/esteros/Gauchescos.js; los lugares del mapa, en config/maps/esteros.js
// gauchescos(). Acá, la escalera de mates y los números del modo.

// La escalera: cada zombi que baja el humano lo pasa al mate siguiente; el
// primero que llega al último gana al instante. De los más fáciles (mucho
// cargador, automáticos) a los más difíciles (de a un tiro); el último, el
// especial. Cada jugador guarda en cuál quedó.
export const GZ_LADDER = ['camionero', 'vidrio', 'mate47', 'algarrobo', 'gemelos', 'lata', 'porongo', 'explosivo', 'torpedo', 'bombillazo', 'oro'];

export const GZ = {
  // la partida (s): al terminar gana el que más avanzó (empate: más bajas)
  time: 300,
  // se juega de a dos o más (en línea)
  minPlayers: 2,
  // la vida de un zombi para los mates del humano
  zombieHp: 100,
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
