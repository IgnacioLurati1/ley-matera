// Lo que cada carga arma igual, guardado en el disco del navegador (2026-10-12;
// el usuario: "hace lo de guardar en disco"). Medido en Eclipse: 15 s al
// título con el caché de shaders, ~8 s de eso armando el mapa a mano (la
// limpieza de caras repetidas, la roca, las texturas en alta). Cada parte que
// se guarda calcula una huella de lo que recibe (los vértices, las imágenes): si
// la huella coincide con lo guardado, usa eso; si no, lo arma como siempre y lo
// guarda para la próxima. Nunca cambia lo que se ve: o es lo mismo que daría
// armarlo, o se arma.
// - Antes de armar un mapa, cacheAbrir(mapa) trae lo de ese mapa a memoria (lo
//   que arma el mapa es sincrónico). Si no llegó (otro camino de carga), se arma.
// - Lo nuevo se escribe en los ratos libres, una entrada por nombre y mapa.
// - En el servidor de desarrollo está apagado (el código cambia a cada rato):
//   globalThis.__mduCacheDisco = true lo prende (las pruebas).

const DB = 'lm-zombies-cache';
const ST = 'c';
let dbP = null;
const mem = new Map();
const pend = new Map();
let flushQueued = false;
export const cacheStats = { leidas: 0, usadas: 0, armadas: 0, guardadas: 0, abrirMs: 0 };

export function cacheActivo() {
  if (typeof indexedDB === 'undefined') return false;
  return !import.meta.env?.DEV || globalThis.__mduCacheDisco === true;
}

function db() {
  if (!dbP) {
    dbP = new Promise((res) => {
      let r;
      try {
        r = indexedDB.open(DB, 1);
      } catch {
        return res(null);
      }
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    });
  }
  return dbP;
}
const upTo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

// Trae a memoria lo guardado de este mapa (antes de armarlo).
export async function cacheAbrir(map) {
  if (!cacheActivo()) return;
  const t0 = performance.now();
  const d = await upTo(db(), 2000);
  if (d) {
    await upTo(
      new Promise((res) => {
        try {
          const req = d.transaction(ST, 'readonly').objectStore(ST).openCursor(IDBKeyRange.bound(`${map}|`, `${map}|￿`));
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return res();
            mem.set(c.key, c.value);
            cacheStats.leidas++;
            c.continue();
          };
          req.onerror = () => res();
        } catch {
          res();
        }
      }),
      5000,
    );
  }
  cacheStats.abrirMs += performance.now() - t0;
}

// (la versión del juego: en la compilada, el nombre del archivo lleva la huella
// del código —y de lo que importa—; un juego nuevo no usa lo guardado por otro)
const BUILD = (() => {
  try {
    return new URL(import.meta.url).pathname.split('/').pop();
  } catch {
    return 'x';
  }
})();
const keyOf = (map, nombre, huella) => `${map}|${nombre}|${BUILD}|${huella}`;

// Lo guardado con esta huella, o undefined (se suelta de la memoria al tomarlo).
export function cacheTomar(map, nombre, huella) {
  if (!cacheActivo()) return undefined;
  const k = keyOf(map, nombre, huella);
  const v = mem.get(k);
  // (lo de este nombre con otra huella ya no sirve en memoria)
  for (const key of mem.keys()) if (key.startsWith(`${map}|${nombre}|`)) mem.delete(key);
  if (v === undefined) {
    cacheStats.armadas++;
    return undefined;
  }
  cacheStats.usadas++;
  return v;
}

// Para la próxima carga (se copia ahora: lo que lo armó puede seguir tocándolo).
export function cacheGuardar(map, nombre, huella, valor) {
  if (!cacheActivo()) return;
  let v;
  try {
    v = structuredClone(valor);
  } catch {
    return;
  }
  pend.set(`${map}|${nombre}|`, { key: keyOf(map, nombre, huella), v });
  if (flushQueued) return;
  flushQueued = true;
  const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1500));
  idle(flush, { timeout: 8000 });
}

async function flush() {
  flushQueued = false;
  const d = await db();
  if (!d || !pend.size) return;
  const items = [...pend.entries()];
  pend.clear();
  try {
    const tx = d.transaction(ST, 'readwrite');
    const st = tx.objectStore(ST);
    for (const [pre, { key, v }] of items) {
      // una sola entrada por nombre y mapa: la de antes se borra
      st.delete(IDBKeyRange.bound(pre, `${pre}￿`));
      st.put(v, key);
      cacheStats.guardadas++;
    }
  } catch {
    /* sin lugar o sin permiso: la próxima se arma igual */
  }
}

// Huella de lo que entra (números, textos, arreglos tipados, listas de eso):
// dos FNV-1a de 32 bits con distinto arranque, en hexadecimal.
export function cacheHuella(...partes) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  const word = (w) => {
    a = Math.imul(a ^ w, 0x01000193);
    b = Math.imul(b ^ w, 0x5bd1e995);
    b ^= b >>> 13;
  };
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const walk = (p) => {
    if (p == null) return word(0x9e3779b9);
    if (typeof p === 'number') {
      f64[0] = p;
      word(u32[0]);
      return word(u32[1]);
    }
    if (typeof p === 'string') {
      for (let i = 0; i < p.length; i++) word(p.charCodeAt(i));
      return word(p.length);
    }
    if (typeof p === 'boolean') return word(p ? 1 : 2);
    if (ArrayBuffer.isView(p)) {
      const n = p.byteLength;
      const W = p.byteOffset % 4 === 0 ? new Uint32Array(p.buffer, p.byteOffset, n >> 2) : null;
      if (W) for (let i = 0; i < W.length; i++) word(W[i]);
      const B = new Uint8Array(p.buffer, p.byteOffset, n);
      for (let i = W ? W.length * 4 : 0; i < n; i++) word(B[i]);
      return word(n);
    }
    if (Array.isArray(p)) {
      for (const q of p) walk(q);
      return word(p.length);
    }
    return walk(String(p));
  };
  for (const p of partes) walk(p);
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
