import { canStep } from './Levels';
import { FEATURES } from '../config/map';
import TowerNav from './TowerNav';

// lo menos que pasa entre dos cálculos del campo de un jugador (ms)
const SOLVE_GAP = 110;
// cuántas celdas como mucho recorre un cálculo en Eclipse (~ 45-60 m alrededor)
const NAV_BUDGET = 6000;
// Cuánto tiene que mejorar un camino para anotarlo (metros). Las distancias se
// guardan en 32 bits y se comparaban contra la suma en 64: dos caminos igual de
// largos daban números distintos en el último decimal, la celda volvía a la
// cola y con ella todo lo que cuelga de ella. En tierra (costos 1 y raíz de 2)
// casi no pasaba; con el agua (1,35 y 1,8) pasaba en todos lados: en la
// creciente del estero, con el mapa entero bajo el agua, un cálculo sacaba
// 223 000 celdas de la cola para 2 880 alcanzables (69 ms, 120 el peor, contra
// 1 ms), la cola se llenaba y se tiraban anotaciones: el campo quedaba mal
// (3 090 celdas sin camino) y los muertos no llegaban. El usuario, 2026-10-10,
// de a 4: "durante la inundación, al anfitrión le fue como el orto, totalmente
// injugable" (el anfitrión rehace un campo por jugador) y "no salían casi
// zombies".
const NAV_EPS = 1e-3;

// Campo de flujo: distancia (Dijkstra, 8 vecinos) desde la celda del jugador a
// todas las celdas caminables. Todos los zombies lo comparten: cada uno solo
// mira qué vecino está más cerca del jugador. Se recalcula cuando el jugador
// cambia de celda o se abre una puerta.

const SQ2 = Math.SQRT2;
const NB = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQ2],
  [1, -1, SQ2],
  [-1, 1, SQ2],
  [-1, -1, SQ2],
];

// Punto 15 de la tanda de optimización (2026-10-12, el usuario: "confío en tu
// criterio"). El cálculo del campo se iba casi todo en preguntar, por cada
// vecino de cada celda, si está libre, si corta una esquina, si hay un
// desnivel (canStep) y si un borde está tapado (edgeOpen, que además armaba
// una función en cada llamada). Esas respuestas no cambian mientras no cambie
// el mapa de navegación: quedan anotadas por celda en una máscara de 8 bits
// (bit k: se puede pasar hacia NB[k]) que se arma la primera vez que un cálculo
// pasa por la celda, y la comparten todos los campos del mismo mundo. El
// resultado da igual bit a bit: mismo orden de vecinos, misma cola con los
// mismos empates, mismas cuentas.
//
// Cuándo queda vieja: navBlock y navEdge solo cambian en World.computeNavBlock
// (arreglos nuevos y navVersion + 1: puertas, escombros, el asedio, el penal,
// Eclipse) y w.pass solo en computeHeights, al armar el mapa. La máscara se
// rehace si cambia navVersion o cualquiera de esos tres arreglos. navCost (el
// agua) y navLinks (la telesilla, los portales) no van en la máscara: se leen
// en cada cálculo, como antes.
const STEP = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];
const MASKS = new WeakMap();

// MinHeap.push con un hueco en vez de intercambios de a dos: las mismas
// comparaciones (en 32 bits, como quedan guardadas) y el mismo orden final.
// Devuelve el tamaño nuevo.
function heapPush(ids, keys, size, id, key) {
  if (size >= ids.length) return size;
  const k = Math.fround(key);
  let h = size;
  while (h > 0) {
    const p = (h - 1) >> 1;
    if (keys[p] <= k) break;
    ids[h] = ids[p];
    keys[h] = keys[p];
    h = p;
  }
  ids[h] = id;
  keys[h] = k;
  return size + 1;
}

export default class Navigation {
  constructor(world) {
    // en la torre (pisos apilados) el campo de flujo es por capas: mismo uso,
    // pero todo recibe además la altura
    if (world.tower) return new TowerNav(world);
    this.w = world;
    const n = world.W * world.H;
    this.dist = new Float32Array(n).fill(Infinity);
    this.heap = new MinHeap(n * 2);
    this.target = -1;
    this.version = -1;
    this.lures = [];
  }

  blocked(x, z) {
    const w = this.w;
    return !w.inside(x, z) || w.navBlock[w.idx(x, z)] === 1;
  }

  // ¿Se puede pasar de (x, z) a la vecina (dx, dz)? Además de las celdas, los
  // bordes que tapa algo a caballo (World.computeNavEdges); en diagonal, los
  // cuatro bordes del rincón.
  edgeOpen(x, z, dx, dz) {
    const E = this.w.navEdge;
    if (!E) return true;
    const W = this.w.W;
    const bit = (xx, zz, ddx, ddz) => (E[zz * W + xx] & (ddx > 0 ? 1 : ddx < 0 ? 2 : ddz > 0 ? 4 : 8)) === 0;
    if (!dx || !dz) return bit(x, z, dx, dz);
    return bit(x, z, dx, 0) && bit(x + dx, z, 0, dz) && bit(x, z, 0, dz) && bit(x, z + dz, dx, 0);
  }

  // Calcula desde (x, z) en metros. force: recalcular aunque no cambie la celda.
  update(x, z, force = false) {
    const w = this.w;
    let cx = Math.floor(x);
    let cz = Math.floor(z);
    // si el objetivo está en una celda bloqueada (arriba de algo), usar la vecina libre
    if (this.blocked(cx, cz)) {
      let found = false;
      for (const [dx, dz] of NB) {
        if (!this.blocked(cx + dx, cz + dz)) {
          cx += dx;
          cz += dz;
          found = true;
          break;
        }
      }
      if (!found) return;
    }
    const t = w.idx(cx, cz);
    if (!force && t === this.target && w.navVersion === this.version) return;
    // (no más de uno cada SOLVE_GAP: corriendo se cambia de celda varias veces
    // por segundo y el anfitrión rehace uno por jugador; el que queda
    // pendiente se hace en el cuadro siguiente que toque)
    const now = performance.now();
    if (!force && w.navVersion === this.version && now - (this.solvedAt || 0) < SOLVE_GAP) return;
    this.solvedAt = now;
    this.target = t;
    this.version = w.navVersion;
    this.solve(t);
  }

  // La máscara de pasos de este mundo, al día (ver STEP).
  masks() {
    const w = this.w;
    const W = w.W;
    const n = W * w.H;
    let M = MASKS.get(w);
    if (!M || M.W !== W || M.mask.length !== n) {
      M = { W, mask: new Uint8Array(n), stamp: new Int32Array(n), gen: 0, ver: NaN, block: null, edge: null, pass: null, off: new Int32Array(8) };
      for (let k = 0; k < 8; k++) M.off[k] = NB[k][1] * W + NB[k][0];
      MASKS.set(w, M);
    }
    if (M.ver !== w.navVersion || M.block !== w.navBlock || M.edge !== w.navEdge || M.pass !== w.pass) {
      M.gen++;
      M.ver = w.navVersion;
      M.block = w.navBlock;
      M.edge = w.navEdge;
      M.pass = w.pass;
    }
    return M;
  }

  // Los pasos posibles desde la celda i: las mismas preguntas que hace
  // solveOld por cada vecino, en el mismo orden.
  cellMask(i) {
    const w = this.w;
    const W = w.W;
    const x = i % W;
    const z = (i - x) / W;
    let m = 0;
    for (let k = 0; k < 8; k++) {
      const dx = NB[k][0];
      const dz = NB[k][1];
      if (this.blocked(x + dx, z + dz)) continue;
      if (dx && dz && (this.blocked(x + dx, z) || this.blocked(x, z + dz))) continue;
      if (w.pass && !canStep(w, x, z, dx, dz)) continue;
      if (!this.edgeOpen(x, z, dx, dz)) continue;
      m |= 1 << k;
    }
    return m;
  }

  // Lo mismo que solveOld, sobre la máscara y con la cola a mano (ver STEP).
  solve(start) {
    const w = this.w;
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = this.heap;
    const ids = heap.ids;
    const keys = heap.keys;
    const M = this.masks();
    const mask = M.mask;
    const stamp = M.stamp;
    const gen = M.gen;
    const off = M.off;
    const cost = w.navCost;
    const links = w.navLinks;
    const budget = FEATURES.eclipse ? NAV_BUDGET : Infinity;
    const eps = NAV_EPS;
    dist[start] = 0;
    let size = heapPush(ids, keys, 0, start, 0);
    let popped = 0;
    while (size) {
      // MinHeap.pop con un hueco: mismas comparaciones que allá
      const i = ids[0];
      const d = keys[0];
      size--;
      if (size > 0) {
        const lid = ids[size];
        const lk = keys[size];
        let h = 0;
        for (;;) {
          const l = h * 2 + 1;
          const r = l + 1;
          let m = h;
          let mk = lk;
          if (l < size && keys[l] < mk) {
            m = l;
            mk = keys[l];
          }
          if (r < size && keys[r] < mk) {
            m = r;
            mk = keys[r];
          }
          if (m === h) break;
          ids[h] = ids[m];
          keys[h] = mk;
          h = m;
        }
        ids[h] = lid;
        keys[h] = lk;
      }
      if (d > dist[i]) continue;
      if (++popped > budget) break;
      if (stamp[i] !== gen) {
        mask[i] = this.cellMask(i);
        stamp[i] = gen;
      }
      for (let bits = mask[i], k = 0; bits; bits >>= 1, k++) {
        if (!(bits & 1)) continue;
        const ni = i + off[k];
        const nd = d + (cost ? STEP[k] * cost[ni] : STEP[k]);
        if (nd < dist[ni] - eps) {
          dist[ni] = nd;
          size = heapPush(ids, keys, size, ni, nd);
        }
      }
      const L = links?.get(i);
      if (L) {
        for (const [ni, c] of L) {
          const nd = d + c;
          if (nd < dist[ni] - eps) {
            dist[ni] = nd;
            size = heapPush(ids, keys, size, ni, nd);
          }
        }
      }
    }
    heap.size = size;
  }

  // ¿Se puede ir en línea recta de (ax, az) a (bx, bz) sin pisar una celda
  // bloqueada? (sin contar la de salida ni la de llegada)
  lineFree(ax, az, bx, bz) {
    let cx = Math.floor(ax);
    let cz = Math.floor(az);
    const tx = Math.floor(bx);
    const tz = Math.floor(bz);
    const dx = bx - ax;
    const dz = bz - az;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (dx || 1e-9));
    const tdz = Math.abs(1 / (dz || 1e-9));
    let tmx = dx > 0 ? (cx + 1 - ax) * tdx : (ax - cx) * tdx;
    let tmz = dz > 0 ? (cz + 1 - az) * tdz : (az - cz) * tdz;
    for (let k = 0; k < 64; k++) {
      if (tmx < tmz) {
        tmx += tdx;
        cx += sx;
      } else {
        tmz += tdz;
        cz += sz;
      }
      if (cx === tx && cz === tz) return true;
      if (this.blocked(cx, cz)) return false;
    }
    return true;
  }

  distAt(x, z) {
    const w = this.w;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return Infinity;
    return this.dist[w.idx(cx, cz)];
  }

  // Dirección sugerida (en out.x, out.z) para ir hacia el jugador desde (x, z).
  // Mira dos pasos adelante para suavizar el recorrido; look 1: al centro de
  // la celda siguiente (los jefes, más anchos: cortando la esquina de dos
  // celdas se trababan contra la baranda de una pasarela).
  direction(x, z, out, _y, look = 2) {
    const w = this.w;
    const W = w.W;
    let cx = Math.floor(x);
    let cz = Math.floor(z);
    if (!w.inside(cx, cz)) return false;
    let tx = cx + 0.5;
    let tz = cz + 0.5;
    let found = false;
    for (let step = 0; step < look; step++) {
      let best = this.dist[cz * W + cx];
      let bx = -1;
      let bz = -1;
      for (const [dx, dz] of NB) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
        if (w.pass && !canStep(w, cx, cz, dx, dz)) continue;
        if (!this.edgeOpen(cx, cz, dx, dz)) continue;
        const d = this.dist[nz * W + nx];
        if (d < best) {
          best = d;
          bx = nx;
          bz = nz;
        }
      }
      if (bx < 0) break;
      cx = bx;
      cz = bz;
      tx = cx + 0.5;
      tz = cz + 0.5;
      found = true;
      if (step === 0 && best === 0) break;
    }
    if (!found) return false;
    const dx = tx - x;
    const dz = tz - z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }
}

class MinHeap {
  constructor(cap) {
    this.ids = new Int32Array(cap);
    this.keys = new Float32Array(cap);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(id, key) {
    if (this.size >= this.ids.length) return;
    let i = this.size++;
    this.ids[i] = id;
    this.keys[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop() {
    const id = this.ids[0];
    const key = this.keys[0];
    this.size--;
    if (this.size > 0) {
      this.ids[0] = this.ids[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.keys[l] < this.keys[m]) m = l;
        if (r < this.size && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    this.lastKey = key;
    return id;
  }

  swap(a, b) {
    const ti = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }
}
