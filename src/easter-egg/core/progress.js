// El perfil del jugador: nivel, prestigio, experiencia, pesos (el Liquid
// Divinium de Black Ops 3), las empanadas especiales que tiene guardadas, la
// canasta que lleva a la partida y el camuflaje de cada mate.
//
// Se guarda en el navegador (localStorage), como los easter eggs de
// core/eggs.js. Algunos navegadores (Brave con "olvidar al cerrar", los
// modos privados, limpiezas automáticas) lo borran: por eso se pide
// almacenamiento persistente, se guarda una segunda copia en IndexedDB y el
// menú de niveles ofrece bajar y cargar una copia de seguridad.
//
// Nivel 1 a 55; en el 55 se puede prestigiar (vuelve al 1 sin perder lo
// desbloqueado). Después del prestigio 10 viene Maestro: niveles del 56 al
// 1000 sin volver a empezar. Lo desbloqueado depende del rango (prestigio y
// nivel) y el rango nunca baja, así que nada se pierde al prestigiar.
//
// Uso: import * as P from '../core/progress'.

const KEY = 'lm-zombies-profile';
const IDB = 'lm-zombies';
const VERSION = 1;

export const LEVELS = 55;
export const PRESTIGES = 10;
// el prestigio de Maestro (después del 10)
export const MASTER = PRESTIGES + 1;
export const MASTER_MAX = 1000;
const MASTER_NEED = 10000;

// Experiencia para pasar de `level` a `level + 1`. Un prestigio entero (del 1
// al 55) son ~270.000: unas diez partidas largas (~30 rondas, ~27.000 cada una).
// Los primeros niveles salen cada una o dos rondas.
export function need(level, prestige = 0) {
  if (prestige >= MASTER || level >= LEVELS) return MASTER_NEED;
  return Math.round((230 + 174 * level) / 10) * 10;
}
export const PRESTIGE_XP = (() => {
  let s = 0;
  for (let l = 1; l < LEVELS; l++) s += need(l);
  return s;
})();

// Cuánto da cada cosa. Las bajas: la ronda reparte un tanto fijo (`killRound`)
// entre todos sus zombies, así que cuantos más zombies trae la ronda, menos da
// cada uno (se cuenta como si jugaras solo: en equipo cada uno gana parecido).
export const XP = {
  killRound: (r) => 150 + 30 * Math.min(r, 40),
  head: 1.25,
  knife: 1.25,
  boss: 750,
  round: (r) => 50 + 10 * Math.min(r, 40),
  door: 150,
  board: 5,
  boardCap: 100,
  revive: 250,
  perk: 100,
  pap: 300,
  pap2: 150,
  box: 25,
  wall: 20,
  power: 300,
  // el easter egg principal de un mapa: un cuarto de prestigio (la primera
  // vez en ese mapa, el doble); el Challenge de la torre, la mitad
  egg: Math.round((PRESTIGE_XP * 0.25) / 500) * 500,
  challenge: Math.round((PRESTIGE_XP * 0.125) / 500) * 500,
  // los seis: casi un prestigio entero, una sola vez
  superEgg: Math.round((PRESTIGE_XP * 0.9) / 1000) * 1000,
};

// Pesos: uno cada 3 niveles (cada 5 de Maestro), 3 al prestigiar, a veces uno
// al terminar una partida larga y 2 por un easter egg (3 la primera vez).
// (y 100 de una, con el super easter egg)
export const PESOS = { every: 3, masterEvery: 5, prestige: 3, egg: 2, eggFirst: 3, superEgg: 100 };

// Los pesos del pase (al llegar a ese nivel): 1 cada 3 niveles, 3 en los
// múltiplos de 10 y 5 en el 55; de Maestro, 1 cada 5 y 3 cada 25.
export function pesosAt(level, prestige = 0) {
  if (prestige >= MASTER || level > LEVELS) return level % 25 === 0 ? 3 : level % PESOS.masterEvery === 0 ? 1 : 0;
  if (level === LEVELS) return 5;
  if (level % 10 === 0) return 3;
  return level % PESOS.every === 0 ? 1 : 0;
}

// Los nombres de los rangos (cada 5 niveles).
export const RANKS = ['Gurí', 'Peón', 'Chasqui', 'Domador', 'Baqueano', 'Rastreador', 'Payador', 'Tropero', 'Capataz', 'Caudillo', 'Tata'];
export const rankName = (level) => RANKS[Math.min(RANKS.length - 1, Math.floor((Math.min(level, LEVELS) - 1) / 5))];
export const PRESTIGE_NAMES = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'Maestro'];

const fresh = () => ({ v: VERSION, level: 1, prestige: 0, xp: 0, bank: 0, total: 0, pesos: 0, megas: {}, canasta: null, camos: {}, eggs: {}, superEgg: false, games: 0, created: Date.now(), saved: 0 });

let data = null;
let saveT = 0;
const subs = new Map();

function emit(ev, x) {
  for (const fn of subs.get(ev) || []) {
    try {
      fn(x);
    } catch (e) {
      console.error(e);
    }
  }
}

// P.on('change' | 'level' | 'pesos', fn) → devuelve cómo desuscribirse.
export function on(ev, fn) {
  if (!subs.has(ev)) subs.set(ev, new Set());
  subs.get(ev).add(fn);
  return () => subs.get(ev)?.delete(fn);
}

function sane(d) {
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  const out = { ...f, ...d };
  out.level = Math.max(1, Math.min(MASTER_MAX, out.level | 0));
  out.prestige = Math.max(0, Math.min(MASTER, out.prestige | 0));
  for (const k of ['xp', 'bank', 'total', 'pesos', 'games']) out[k] = Math.max(0, Math.floor(+out[k] || 0));
  for (const k of ['megas', 'camos', 'eggs']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (out.canasta && !Array.isArray(out.canasta)) out.canasta = null;
  if (!out.logros || typeof out.logros !== 'object') out.logros = null;
  return out;
}

function load() {
  if (data) return data;
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(KEY));
  } catch {
    d = null;
  }
  data = sane(d);
  if (!d) restoreFromIdb();
  return data;
}

function write() {
  saveT = 0;
  data.saved = Date.now();
  const s = JSON.stringify(data);
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  idbPut(s);
}

// Guarda enseguida (lo importante) o de a ratos (la experiencia de cada baja).
function save(now = true) {
  if (now) {
    clearTimeout(saveT);
    write();
    return;
  }
  if (!saveT) saveT = setTimeout(write, 1500);
}

// ---------- la segunda copia (IndexedDB) ----------
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) {
      rej(e);
    }
  });
}
function idbPut(s) {
  idb()
    .then((db) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(s, KEY);
      tx.oncomplete = () => db.close();
    })
    .catch(() => {});
}
// Si el localStorage vino vacío pero la otra copia sigue, la recupera.
function restoreFromIdb() {
  idb()
    .then(
      (db) =>
        new Promise((res) => {
          const r = db.transaction('kv').objectStore('kv').get(KEY);
          r.onsuccess = () => {
            db.close();
            res(r.result);
          };
          r.onerror = () => {
            db.close();
            res(null);
          };
        }),
    )
    .then((s) => {
      if (!s) return;
      const d = sane(JSON.parse(s));
      // (solo si acá no se ganó nada todavía)
      if (data.total > 0 || d.total <= 0) return;
      data = d;
      write();
      emit('change', data);
    })
    .catch(() => {});
}

// Pide que el navegador no lo borre solo (Chrome/Edge/Firefox lo respetan si
// pueden; Brave con "olvidar al cerrar" borra igual).
let persistAsked = false;
export function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}
// ¿El navegador garantiza que no lo borra? (null: no se sabe)
export const persisted = () => navigator.storage?.persisted?.().catch(() => null) ?? Promise.resolve(null);
// ¿Es Brave? (para un aviso más fuerte)
export const isBrave = () => navigator.brave?.isBrave?.().catch(() => false) ?? Promise.resolve(false);

// ---------- lectura ----------
export function profile() {
  return load();
}

// { level, prestige, xp, need, name, prestigeName, master, max, bank }
export function rank() {
  const d = load();
  const master = d.prestige >= MASTER;
  const max = master ? d.level >= MASTER_MAX : d.level >= LEVELS;
  return {
    level: d.level,
    prestige: d.prestige,
    xp: d.xp,
    need: need(d.level, d.prestige),
    name: master ? 'Maestro' : rankName(d.level),
    prestigeName: PRESTIGE_NAMES[d.prestige] || '',
    master,
    max,
    bank: d.bank,
    canPrestige: !master && d.level >= LEVELS,
  };
}

// ¿Llegó a este rango alguna vez? `req` es { level, prestige } (prestigio 0
// si falta). Como el rango nunca baja, alcanza con mirar el de ahora.
export function unlocked(req = {}) {
  const d = load();
  const p = req.prestige | 0;
  const l = req.level | 0;
  if (d.prestige !== p) return d.prestige > p;
  return d.level >= l;
}

// ---------- experiencia ----------
// Suma experiencia (solo el perfil: el conteo de la partida lo lleva quien
// llama, ui/Levels). Devuelve los niveles que subió: [{ level, prestige, pesos }].
export function addXp(n) {
  const d = load();
  n = Math.floor(n);
  if (!(n > 0)) return [];
  d.total += n;
  const ups = [];
  let left = n;
  while (left > 0) {
    const master = d.prestige >= MASTER;
    const top = master ? MASTER_MAX : LEVELS;
    // tope: en el 55 no se junta nada (prestigiar arranca de cero: el
    // usuario, 2026-09-29)
    if (d.level >= top) break;
    const want = need(d.level, d.prestige) - d.xp;
    if (left < want) {
      d.xp += left;
      break;
    }
    left -= want;
    d.xp = 0;
    d.level++;
    const pesos = pesosAt(d.level, d.prestige);
    d.pesos += pesos;
    ups.push({ level: d.level, prestige: d.prestige, pesos });
  }
  save(!!ups.length);
  if (ups.length) {
    for (const u of ups) emit('level', u);
    emit('pesos', d.pesos);
  }
  emit('change', d);
  return ups;
}

// Prestigiar (desde el menú, en el 55): vuelve al nivel 1 con un prestigio
// más (o pasa a Maestro después del 10) y 3 pesos, con la experiencia en
// cero. Devuelve false si todavía no se puede.
export function prestige() {
  const d = load();
  if (d.prestige >= MASTER || d.level < LEVELS) return false;
  d.prestige++;
  if (d.prestige >= MASTER) {
    // Maestro: sigue del 56 en adelante
    d.level = LEVELS + 1;
  } else d.level = 1;
  d.xp = 0;
  d.pesos += PESOS.prestige;
  d.bank = 0;
  save();
  emit('prestige', { prestige: d.prestige });
  emit('pesos', d.pesos);
  emit('change', d);
  return true;
}

// Anota un easter egg terminado en este perfil: devuelve si es la primera vez.
export function markEggXp(mapId) {
  const d = load();
  const first = !d.eggs[mapId];
  d.eggs[mapId] = (d.eggs[mapId] || 0) + 1;
  save();
  return first;
}
// El super easter egg da su premio una sola vez.
export function takeSuperEgg() {
  const d = load();
  if (d.superEgg) return false;
  d.superEgg = true;
  save();
  return true;
}
// Los 100 pesos del super easter egg: una sola vez (aparte de la experiencia,
// así los cobra también el que lo había ganado antes de que dieran pesos).
export function takeSuperPesos() {
  const d = load();
  if (d.superPesos) return false;
  d.superPesos = true;
  save();
  return true;
}
// Un aviso para la pantalla de Niveles (se muestra una vez).
export function setNote(t) {
  load().note = t;
  save();
  emit('change', data);
}
export function takeNote() {
  const d = load();
  const t = d.note;
  if (t) {
    delete d.note;
    save();
  }
  return t || null;
}

export function countGame() {
  load().games++;
  save(false);
}

// ---------- pesos ----------
export const pesos = () => load().pesos;
export function addPesos(n) {
  const d = load();
  d.pesos = Math.max(0, d.pesos + (n | 0));
  save();
  emit('pesos', d.pesos);
  emit('change', d);
}
export function spendPesos(n) {
  const d = load();
  if (d.pesos < n) return false;
  d.pesos -= n;
  save();
  emit('pesos', d.pesos);
  emit('change', d);
  return true;
}

// ---------- empanadas especiales (las que se gastan) ----------
export const megas = () => ({ ...load().megas });
export function addMega(id, n = 1) {
  const d = load();
  d.megas[id] = (d.megas[id] || 0) + n;
  save();
  emit('change', d);
}
// Gasta una (el horno de barro la entrega): false si no quedaba.
export function useMega(id) {
  const d = load();
  if (!(d.megas[id] > 0)) return false;
  if (--d.megas[id] <= 0) delete d.megas[id];
  save();
  emit('change', d);
  return true;
}

// ---------- la canasta (las 5 empanadas que se llevan a la partida) ----------
// null: todavía no la armó (el horno usa las primeras desbloqueadas).
export const canasta = () => (load().canasta ? [...load().canasta] : null);
export function setCanasta(ids) {
  const d = load();
  d.canasta = ids.slice(0, 5);
  save();
  emit('change', d);
}

// ---------- camuflajes ----------
// Los logros (core/logros.js): viven en el perfil, así van en la copia.
export const logrosData = () => load().logros;
export function setLogros(l, now = false) {
  load().logros = l;
  save(now);
  emit('logros', l);
}

export const camoOf = (weaponId) => load().camos[weaponId] || null;
export function setCamo(weaponId, camoId) {
  const d = load();
  if (camoId) d.camos[weaponId] = camoId;
  else delete d.camos[weaponId];
  save();
  emit('change', d);
}

// ---------- copia de seguridad ----------
// Un texto para guardar aparte (o un archivo): base64 del perfil con una suma
// para darse cuenta si se cortó al copiarlo.
const sum = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
export function exportCode() {
  const s = JSON.stringify(load());
  const b = btoa(unescape(encodeURIComponent(s)));
  return `MDU1.${sum(s)}.${b}`;
}
// Carga una copia: devuelve true si era válida.
export function importCode(code) {
  try {
    const [tag, chk, b] = String(code).trim().split('.');
    if (tag !== 'MDU1' || !b) return false;
    const s = decodeURIComponent(escape(atob(b)));
    if (sum(s) !== chk) return false;
    data = sane(JSON.parse(s));
    save();
    emit('change', data);
    emit('pesos', data.pesos);
    return true;
  } catch {
    return false;
  }
}

// (pruebas y desarrollo) reemplaza el perfil entero
export function _set(d) {
  data = sane(d);
  save();
  emit('change', data);
}
