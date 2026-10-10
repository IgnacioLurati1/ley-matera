import { canStep } from './Levels';
import { FEATURES } from '../config/map';
import TowerNav from './TowerNav';

// lo menos que pasa entre dos cálculos del campo de un jugador (ms)
const SOLVE_GAP = 110;
// cuántas celdas como mucho recorre un cálculo en Eclipse (~ 45-60 m alrededor)
const NAV_BUDGET = 6000;

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

  solve(start) {
    const w = this.w;
    const W = w.W;
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = this.heap;
    heap.clear();
    dist[start] = 0;
    heap.push(start, 0);
    // lo que cuesta cada celda (el agua honda, entities/swim.js); sin agua, todo 1
    const cost = w.navCost;
    // (Eclipse Matero: el mapa entero son ~40 000 celdas unidas por portales y
    // el campo completo tardaba ~190 ms cada vez que el jugador cambiaba de
    // celda —el usuario: "tirones tremendos, injugable" en la zona del medio—.
    // Se corta en las NAV_BUDGET celdas más cercanas: los muertos aparecen
    // cerca; más lejos van derecho. globalThis.__mduNoNavBudget: como antes)
    const budget = FEATURES.eclipse && globalThis.__mduNoNavBudget !== true ? NAV_BUDGET : Infinity;
    let popped = 0;
    while (heap.size) {
      // (sin armar un arreglo por celda: era basura de memoria en cada cálculo)
      const i = heap.pop();
      const d = heap.lastKey;
      if (d > dist[i]) continue;
      if (++popped > budget) break;
      const x = i % W;
      const z = (i - x) / W;
      for (const [dx, dz, c] of NB) {
        const nx = x + dx;
        const nz = z + dz;
        if (this.blocked(nx, nz)) continue;
        // sin cortar esquinas en diagonal
        if (dx && dz && (this.blocked(x + dx, z) || this.blocked(x, z + dz))) continue;
        // con alturas: no se cruza un desnivel (solo escaleras y rampas)
        if (w.pass && !canStep(w, x, z, dx, dz)) continue;
        if (!this.edgeOpen(x, z, dx, dz)) continue;
        const ni = nz * W + nx;
        const nd = d + (cost ? c * cost[ni] : c);
        if (nd < dist[ni]) {
          dist[ni] = nd;
          heap.push(ni, nd);
        }
      }
      // lo que une dos lugares sin caminar (la telesilla del penal): world.navLinks,
      // celda → [[celda, costo], ...]
      const links = w.navLinks?.get(i);
      if (links) {
        for (const [ni, c] of links) {
          const nd = d + c;
          if (nd < dist[ni]) {
            dist[ni] = nd;
            heap.push(ni, nd);
          }
        }
      }
    }
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
