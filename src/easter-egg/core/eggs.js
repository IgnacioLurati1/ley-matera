import { MAP_LIST } from '../config/map';

// Los easter eggs completados (uno por mapa) y el premio por completarlos
// todos, el super easter egg: se arranca con el Porongo del Caballero en vez
// del Porongo, y el menú muestra el título de Caballero de la Luz.
// Cuenta el final del easter egg principal de cada mapa (Game.win), también
// para los invitados; no las partidas con atajos de prueba (Alt+K, Alt+L o un
// salto del Alt+I). Alt+O prende y apaga una prueba del premio sin tocar lo
// ganado de verdad.

const KEY = 'lm-zombies-eggs';
const TEST = 'lm-zombies-eggs-test';

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: no se guarda */
  }
};

// Los mapas con el easter egg completado (en el orden del juego).
export function eggsDone() {
  const d = read(KEY) || {};
  return MAP_LIST.filter((m) => d[m.id]).map((m) => m.id);
}

export const eggsTotal = () => MAP_LIST.length;

// Anota el mapa; devuelve true si es la primera vez.
export function markEgg(id) {
  const d = read(KEY) || {};
  if (d[id]) return false;
  d[id] = Date.now();
  write(KEY, d);
  return true;
}

export const eggTest = () => !!read(TEST);

export function toggleEggTest() {
  const on = !eggTest();
  write(TEST, on);
  return on;
}

// ¿Ganó el premio (o lo está probando)?
// (la prueba del premio, Alt+O, solo en desarrollo)
export const isKnight = () => (!!import.meta.env.DEV && eggTest()) || eggsDone().length === eggsTotal();

// El mate con el que se arranca.
export const startMate = () => (isKnight() ? 'caballero' : 'porongo');

// El Mate Supremo (weapons/Supremo.js): sale en la caja para el que ganó el
// super easter egg, salvo que lo apague en Opciones (settings.supremo).
export const supremoOn = (settings) => isKnight() && settings?.supremo !== false;
// La pregunta de la primera partida con los seis (ui/SupremoAsk.js).
export const supremoAsk = (settings) => isKnight() && !settings?.supremoAsked;
