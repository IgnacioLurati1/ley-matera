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
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      const x = i % W;
      const z = (i - x) / W;
      for (const [dx, dz, c] of NB) {
        const nx = x + dx;
        const nz = z + dz;
        if (this.blocked(nx, nz)) continue;
        // sin cortar esquinas en diagonal
        if (dx && dz && (this.blocked(x + dx, z) || this.blocked(x, z + dz))) continue;
        const ni = nz * W + nx;
        const nd = d + c;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          heap.push(ni, nd);
        }
      }
    }
  }

  distAt(x, z) {
    const w = this.w;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return Infinity;
    return this.dist[w.idx(cx, cz)];
  }

  // Dirección sugerida (en out.x, out.z) para ir hacia el jugador desde (x, z).
  // Mira dos pasos adelante para suavizar el recorrido.
  direction(x, z, out) {
    const w = this.w;
    const W = w.W;
    let cx = Math.floor(x);
    let cz = Math.floor(z);
    if (!w.inside(cx, cz)) return false;
    let tx = cx + 0.5;
    let tz = cz + 0.5;
    let found = false;
    for (let step = 0; step < 2; step++) {
      let best = this.dist[cz * W + cx];
      let bx = -1;
      let bz = -1;
      for (const [dx, dz] of NB) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
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
    return [id, key];
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
