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

// Velocidad: cada zombie tira un número en [ronda*8, ronda*8+35].
export function rollSpeed(round, rand = Math.random) {
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

// Jefe: el Capataz aparece en las rondas múltiplo de 5.
export const bossRound = (round) => round >= 5 && round % 5 === 0;
export const bossHealth = (round) => Math.max(4000, zombieHealth(round) * 14);
// En co-op los jefes aguantan más: +75% de vida por cada jugador extra.
export const bossScale = (players = 1) => 1 + (players - 1) * 0.75;

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
export const LOCK_COST = 2000;
