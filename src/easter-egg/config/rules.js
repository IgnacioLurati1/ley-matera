// Reglas de rondas y puntos calcadas de Black Ops 1 (partida solitaria).

export const START_POINTS = 500;
export const MAX_ALIVE = 24;
// Con más jugadores hay más zombies a la vez y más por ronda.
export const maxAlive = (players = 1) => MAX_ALIVE + (players - 1) * 8;
export const ROUND_BREAK = 10; // segundos entre rondas

export const POINTS = {
  hit: 10,
  kill: 50,
  neck: 20, // extra sobre kill
  head: 50, // extra sobre kill
  knife: 120, // extra sobre kill (130 en total)
  board: 10,
  nuke: 400,
  carpenter: 200,
  boss: 500,
};

// Vida: 150 en ronda 1, +100 por ronda hasta la 9, luego x1,1 por ronda.
export function zombieHealth(round) {
  if (round < 10) return 150 + 100 * (round - 1);
  return Math.floor(950 * Math.pow(1.1, round - 9));
}

// Cantidad total de zombies de la ronda (fórmula de BO1 para 1 jugador).
export function zombieCount(round, players = 1) {
  let multiplier = round / 5;
  if (multiplier < 1) multiplier = 1;
  if (round >= 10) multiplier *= round * 0.15;
  let max = 24 + Math.floor(0.5 * 6 * multiplier);
  if (round < 2) max = Math.floor(max * 0.25);
  else if (round < 3) max = Math.floor(max * 0.3);
  else if (round < 4) max = Math.floor(max * 0.5);
  else if (round < 5) max = Math.floor(max * 0.7);
  else if (round < 6) max = Math.floor(max * 0.9);
  return Math.floor(max * (1 + (players - 1) * 0.6));
}

// Demora entre apariciones: 2 s en ronda 1, x0,95 por ronda, mínimo 0,08.
export function spawnDelay(round) {
  return Math.max(0.08, 2 * Math.pow(0.95, round - 1));
}

// Velocidad (2026-09-27, pedido del usuario; el Challenge de la torre sigue con
// rollSpeedClassic): de la 1 a la 3 caminan (cada ronda un poco más ligero,
// walkPace); de la 4 a la 7 salen caminando y se largan a correr a medida que
// caen los números (runShare: cada ronda, más); desde la 8 corren todos y de a
// poco se suman los rapidísimos. Desde la 3, el último corre siempre (Zombies).
export function rollSpeed(round, rand = Math.random) {
  if (round < 8) return 'walk';
  return rand() < sprintShare(round) ? 'sprint' : 'run';
}

// La parte de rapidísimos: desde la 9, un 10% más por ronda (tope 80%).
export const sprintShare = (round) => (round < 8 ? 0 : Math.min(0.8, (round - 8) * 0.1));

// En las actividades del easter egg donde hay que aguantar (encierros,
// rituales, la defensa del yerbal...): como mínimo corren, y los rapidísimos
// van con la ronda pero con un piso, para que cada tanto salga alguno.
export function rollSpeedHold(round, rand = Math.random) {
  return rand() < Math.max(0.1, sprintShare(round)) ? 'sprint' : 'run';
}

// El paso de los que caminan: x0,94 en la 1, +0,05 por ronda hasta la 7.
export const walkPace = (round) => 0.94 + Math.min(Math.max(round, 1) - 1, 6) * 0.05;

// De la 4 a la 7: la parte de los muertos que ya corre con la ronda en q
// (0 al arrancar, 1 con el último); arranca a subir con el 10% caído.
const RUN_TOP = { 4: 0.35, 5: 0.55, 6: 0.75, 7: 0.9 };
export function runShare(round, q) {
  const top = RUN_TOP[round];
  return top ? top * Math.min(1, Math.max(0, (q - 0.1) / 0.7)) : 0;
}

// La de antes (la usa el Challenge): cada zombie tira un número en [ronda*8, ronda*8+35].
export function rollSpeedClassic(round, rand = Math.random) {
  if (round === 1) return 'walk';
  const base = round * 8;
  const v = base + rand() * 35;
  if (v <= 35) return 'walk';
  if (v <= 70) return 'run';
  return 'sprint';
}

export const SPEEDS = { walk: 1.05, run: 2.7, sprint: 4.1 };

// Rondas de carpinchos endemoniados (las de perros del original): la 6 y
// después cada 6, salvo que toque el Capataz.
export const dogRound = (round) => round >= 6 && round % 6 === 0 && !bossRound(round);
export const dogCount = (round, players = 1) => 6 + (players - 1) * 4 + Math.floor(round / 6) * 2;

// Jefe: el Capataz aparece en las rondas múltiplo de 5. (from: el mapa puede
// arrancarlo más tarde, y sigue cada 5 desde ahí: FEATURES.bossFrom, el
// Sargento del estero desde la 8)
export const bossRound = (round, from = 5) => round >= from && (round - from) % 5 === 0;
// (x1,5 desde el 2026-09-27: morían antes de enfurecerse)
export const bossHealth = (round) => Math.max(6000, zombieHealth(round) * 21);
// En co-op los jefes aguantan más: +100% de vida por cada jugador extra (con
// +75% la pelea duraba menos que en solo: cada jugador suma todo su daño).
export const bossScale = (players = 1) => players;

// Power-ups: cada 2000 puntos ganados (x1,14 por vez) cae uno, máximo 4 por ronda,
// y además un 2% por muerte. Se reparten en bolsa mezclada, como en BO1.
export const POWERUP = {
  firstThreshold: 2000,
  growth: 1.14,
  maxPerRound: 4,
  randomChance: 0.02,
  lifetime: 26.5,
  duration: 30,
};

export const PLAYER = {
  health: 100,
  juggHealth: 250,
  regenDelay: 2.6,
  regenRate: 120,
  walk: 4.3,
  sprint: 6.4,
  crouch: 2.2,
  ads: 2.6,
  stamina: 4,
  jump: 4.6,
  gravity: 16,
  eye: 1.62,
  eyeCrouch: 1.05,
  radius: 0.36,
};

export const ZOMBIE_DAMAGE = 50;
export const BOSS_DAMAGE = 110;
// Los potenciadores especiales (las armas de unos segundos) contra los jefes:
// cada una pega su bossMult (config/weapons.js) y al Luisón, además, esto
export const PUP_LUISON = 0.4;
export const LOCK_COST = 2000;
