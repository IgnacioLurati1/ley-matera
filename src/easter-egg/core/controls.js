// Teclas que se pueden cambiar. El juego sigue preguntando por la tecla de
// fábrica (input.key('KeyW')): Input traduce la tecla que eligió el jugador a
// la de fábrica, así ningún sistema tiene que saber de esto.

export const ACTIONS = [
  { id: 'forward', label: 'Adelante', key: 'KeyW' },
  { id: 'back', label: 'Atrás', key: 'KeyS' },
  { id: 'left', label: 'Izquierda', key: 'KeyA' },
  { id: 'right', label: 'Derecha', key: 'KeyD' },
  { id: 'sprint', label: 'Correr', key: 'ShiftLeft' },
  { id: 'jump', label: 'Saltar', key: 'Space' },
  { id: 'crouch', label: 'Agacharse', key: 'KeyC' },
  { id: 'reload', label: 'Cebar (recargar)', key: 'KeyR' },
  { id: 'use', label: 'Usar · comprar · abrir (mantener: reconstruir, levantar)', key: 'KeyF' },
  { id: 'knife', label: 'Facón (cuchillo)', key: 'KeyV' },
  { id: 'inspect', label: 'Inspeccionar el mate', key: 'KeyE' },
  { id: 'grenade', label: 'Bomba de yerba', key: 'KeyG' },
  { id: 'tactical', label: 'Pava silbadora', key: 'KeyT' },
  { id: 'slot1', label: 'Mate 1', key: 'Digit1' },
  { id: 'slot2', label: 'Mate 2', key: 'Digit2' },
  { id: 'slot3', label: 'Mate 3', key: 'Digit3' },
  { id: 'next', label: 'Mate siguiente', key: 'KeyQ' },
  { id: 'vida', label: 'Gaucho life (el penal)', key: 'KeyX' },
];

const BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
// teclas que no se pueden asignar (las maneja el navegador o el juego)
const RESERVED = new Set(['Escape', 'Tab', 'Enter', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12']);

// Lo que eligió el jugador: { acción: tecla }, solo las que cambió.
let binds = {};

export function setBinds(next) {
  binds = {};
  for (const [id, code] of Object.entries(next || {})) if (BY_ID[id] && typeof code === 'string' && !RESERVED.has(code)) binds[id] = code;
  return binds;
}

export const getBinds = () => ({ ...binds });
export const keyOf = (id) => binds[id] || BY_ID[id]?.key;
export const isReserved = (code) => RESERVED.has(code);

// Tecla física -> tecla de fábrica que espera el juego. Una tecla de fábrica
// que quedó libre (su acción se mudó a otra) no hace nada, salvo que otra
// acción la haya tomado.
export function remapTable() {
  const map = new Map();
  for (const a of ACTIONS) {
    const k = keyOf(a.id);
    if (k !== a.key && !map.has(a.key)) map.set(a.key, '');
  }
  for (const a of ACTIONS) {
    const k = keyOf(a.id);
    if (k !== a.key) map.set(k, a.key);
  }
  return map;
}

// Asigna una tecla. Si otra acción la usaba, se quedan con la tecla vieja
// (se intercambian), así nunca hay dos acciones en la misma tecla.
export function assign(id, code) {
  if (!BY_ID[id] || RESERVED.has(code)) return binds;
  const prev = keyOf(id);
  const other = ACTIONS.find((a) => a.id !== id && keyOf(a.id) === code);
  const next = { ...binds, [id]: code };
  if (other) next[other.id] = prev;
  // lo que volvió a su tecla de fábrica no hace falta guardarlo
  for (const a of ACTIONS) if (next[a.id] === a.key) delete next[a.id];
  return setBinds(next);
}

const NAMES = {
  Space: 'Espacio',
  ShiftLeft: 'Shift izq.',
  ShiftRight: 'Shift der.',
  ControlLeft: 'Ctrl izq.',
  ControlRight: 'Ctrl der.',
  AltLeft: 'Alt izq.',
  AltRight: 'Alt der.',
  CapsLock: 'Bloq Mayús',
  Backspace: 'Borrar',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: 'Ñ',
  Quote: "'",
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '<',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse1: 'Clic de la rueda',
  Mouse3: 'Botón lateral 1',
  Mouse4: 'Botón lateral 2',
};

// Cómo se ve una tecla en pantalla ("KeyW" -> "W").
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

// La tecla de una acción, para mostrar ("F" o la que haya elegido).
export const keyLabel = (id) => keyName(keyOf(id));
