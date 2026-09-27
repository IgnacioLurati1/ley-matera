// Campo de flujo de la torre: lo mismo que Navigation (Dijkstra desde el
// objetivo y cada zombie mira qué vecino queda más cerca), pero sobre las
// capas de la torre: un nodo es una celda de un piso, y las escaleras unen un
// piso con el de arriba. Todo recibe la altura (y) para saber en qué piso se
// está; sin ella se usa la del jugador local.

const SQ2 = Math.SQRT2;
const DIAG = [
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
];

export default class TowerNav {
  constructor(world) {
    this.w = world;
    this.T = world.tower;
    const n = this.T.L * this.T.WH;
    this.dist = new Float32Array(n).fill(Infinity);
    this.heap = new MinHeap(n * 3);
    this.target = -1;
    this.version = -1;
    this.lures = [];
  }

  node(x, z, y) {
    const T = this.T;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const l = T.layerAt(cx, cz, y ?? this.w.hintY(), x, z);
    return l < 0 ? -1 : l * T.WH + cz * T.W + cx;
  }

  isBlocked(k) {
    return k < 0 || !this.T.kind[k] || this.T.blocked[k] === 1;
  }

  blocked(x, z, y) {
    return this.isBlocked(this.node(x + 0.5, z + 0.5, y));
  }

  // Vecinos transitables de un nodo: fn(vecino, costo).
  each(a, fn) {
    const L = this.T.links;
    for (let d = 0; d < 4; d++) {
      const b = L[a * 4 + d];
      if (b >= 0 && !this.isBlocked(b)) fn(b, 1);
    }
    // en diagonal, sin cortar esquinas: los dos caminos en L tienen que llegar al mismo lugar
    for (const [dx, dz] of DIAG) {
      const p = L[a * 4 + dx];
      const q = L[a * 4 + dz];
      if (p < 0 || q < 0 || this.isBlocked(p) || this.isBlocked(q)) continue;
      const b = L[p * 4 + dz];
      if (b >= 0 && b === L[q * 4 + dx] && !this.isBlocked(b)) fn(b, SQ2);
    }
  }

  update(x, z, force = false, y) {
    let t = this.node(x, z, y);
    if (t < 0) return;
    // parado arriba de algo: la celda de al lado que esté libre
    if (this.isBlocked(t)) {
      let free = -1;
      this.each(t, (b) => {
        if (free < 0) free = b;
      });
      if (free < 0) {
        const L = this.T.links;
        for (let d = 0; d < 4 && free < 0; d++) if (L[t * 4 + d] >= 0 && !this.isBlocked(L[t * 4 + d])) free = L[t * 4 + d];
      }
      if (free < 0) return;
      t = free;
    }
    if (!force && t === this.target && this.w.navVersion === this.version) return;
    this.target = t;
    this.version = this.w.navVersion;
    this.solve(t);
  }

  solve(start) {
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = this.heap;
    heap.clear();
    dist[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const i = heap.popId();
      const d = heap.lastKey;
      if (d > dist[i]) continue;
      this.each(i, (b, c) => {
        const nd = d + c;
        if (nd < dist[b]) {
          dist[b] = nd;
          heap.push(b, nd);
        }
      });
    }
  }

  distAt(x, z, y) {
    const k = this.node(x, z, y);
    return k < 0 ? Infinity : this.dist[k];
  }

  // Dirección (en out.x, out.z) para ir hacia el objetivo desde (x, z, y).
  direction(x, z, out, y) {
    const T = this.T;
    let cur = this.node(x, z, y);
    if (cur < 0) return false;
    let found = false;
    for (let step = 0; step < 2; step++) {
      let best = this.dist[cur];
      let next = -1;
      this.each(cur, (b) => {
        if (this.dist[b] < best) {
          best = this.dist[b];
          next = b;
        }
      });
      if (next < 0) break;
      cur = next;
      found = true;
      if (step === 0 && best === 0) break;
    }
    if (!found) return false;
    const i = cur % T.WH;
    const cx = i % T.W;
    const cz = (i - cx) / T.W;
    const dx = cx + 0.5 - x;
    const dz = cz + 0.5 - z;
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
    this.lastKey = 0;
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

  // Saca el mínimo; su clave queda en lastKey (sin armar arreglos por cada nodo).
  popId() {
    const id = this.ids[0];
    this.lastKey = this.keys[0];
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
