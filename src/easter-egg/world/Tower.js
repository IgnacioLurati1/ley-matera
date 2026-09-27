import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { rng } from '../core/noise';
import { toTexture } from '../core/textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rampY } from './Levels';
import { MAP_W, MAP_H, ZONES, DOORS, TOWER } from '../config/map';
import Llano from './Llano';
import { ChiquiSightings } from './Chiqui';
import { buildArches, buildHoleLip, buildOrbitDebris, buildFloorDecor, layoutPieces, buildLayouts, FLOOR_TINTS } from './towerDecor';

// La torre del remolino (Revelaciones Materas): quince pisos apilados sobre
// la misma planta. El resto del motor piensa en una grilla con un solo piso
// por celda; acá cada celda tiene una capa por piso:
//  · losa (se camina), escalón de la escalera (rampa entre un piso y el de
//    arriba) o nada (el agujero del medio y el hueco de la escalera de abajo).
//  · floorAt(x, z, y) busca, de arriba hacia abajo, la primera superficie que
//    no quede más arriba de un escalón: así se sube la escalera y uno se cae
//    por el agujero hasta el primer piso que tenga losa (los múltiplos de 5).
//  · Los enlaces entre celdas vecinas (con cambio de capa en las puntas de las
//    escaleras) los usa la navegación de los zombies (TowerNav).
// Sin `y` (código viejo que no la pasa), se usa la altura del jugador local.
//
// Además: la geometría (losas, arcadas, escaleras, barandas), las colisiones,
// las luces que acompañan al jugador de piso en piso, el remolino de viento que
// rodea todo y la escalera divina de oro que aparece con el easter egg.

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NONE = 0;
const SLAB = 1;
const RAMP = 2;
// hasta este escalón se sube caminando
const STEP = 0.5;
const JOIN = 0.3;
const RAIL_H = 1.05;
const ARCH_TOP = 2.95;
// luces de verdad a la vez (ver updateLights) y en cuántos segundos se
// prenden y se apagan al mudarse de farol
const LIGHTS = 8;
const LIGHT_IN = 0.55;
const LIGHT_OUT = 0.4;

export default class Tower {
  constructor(world) {
    this.w = world;
    const T = TOWER;
    this.T = T;
    this.L = T.floors;
    this.FH = T.fh;
    this.W = MAP_W;
    this.H = MAP_H;
    this.WH = MAP_W * MAP_H;
    this.ramps = T.stairs.map((s) => ({ rect: s.rect, dir: s.dir, side: s.side, y0: this.yOf(s.n - 1), y1: this.yOf(s.n) }));
    this.skyState = 'hidden';
    this.buildModel();
  }

  // Altura de la capa l (0 = planta baja, piso 1).
  yOf(l) {
    return l * this.FH;
  }

  // ¿El piso n (1..15) tiene agujero?
  hasHole(n) {
    return !this.T.solid.includes(n);
  }

  inFoot(x, z) {
    const T = this.T;
    return x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1;
  }

  inHole(x, z) {
    const [a, b, c, d] = this.T.hole;
    return x >= a && x <= c && z >= b && z <= d;
  }

  inArena(x, z) {
    const A = this.T.arena;
    return Math.hypot(x + 0.5 - A.x, z + 0.5 - A.z) <= A.r;
  }

  // ---------------- modelo de capas ----------------
  buildModel() {
    const { L, WH, W } = this;
    const T = this.T;
    this.kind = new Uint8Array(L * WH);
    this.rampOf = new Int16Array(L * WH).fill(-1);
    const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
    for (let l = 0; l < L; l++) {
      const n = l + 1;
      const below = l > 0 ? this.ramps[l - 1] : null;
      const up = l < L - 1 ? this.ramps[l] : null;
      for (let z = T.z0; z <= T.z1; z++) {
        for (let x = T.x0; x <= T.x1; x++) {
          const i = l * WH + z * W + x;
          if (up && inRect(up.rect, x, z)) {
            this.kind[i] = RAMP;
            this.rampOf[i] = l;
            continue;
          }
          // el hueco por donde sube la escalera del piso de abajo
          if (below && inRect(below.rect, x, z)) continue;
          if (this.hasHole(n) && this.inHole(x, z)) continue;
          this.kind[i] = SLAB;
        }
      }
    }
    // la caverna del final, en la capa de abajo
    const A = T.arena;
    for (let z = Math.floor(A.z - A.r); z <= Math.ceil(A.z + A.r); z++) {
      for (let x = Math.floor(A.x - A.r); x <= Math.ceil(A.x + A.r); x++) {
        if (x < 0 || z < 0 || x >= W || z >= this.H) continue;
        if (this.inArena(x, z)) this.kind[z * W + x] = SLAB;
      }
    }
    this.buildLinks();
  }

  // Posición del escalón k (0 = abajo) de una rampa a lo largo de su eje.
  rampStep(R, x, z) {
    const [x0, z0, x1, z1] = R.rect;
    if (R.dir === '+x') return x - x0;
    if (R.dir === '-x') return x1 - x;
    if (R.dir === '+z') return z - z0;
    return z1 - z;
  }

  rampAxis(R) {
    return R.dir === '+x' || R.dir === '-x' ? 'x' : 'z';
  }

  // Altura del borde de la celda (x, z) de la capa l hacia DIRS[d].
  edgeY(l, x, z, d) {
    const i = l * this.WH + z * this.W + x;
    if (this.kind[i] !== RAMP) return this.yOf(l);
    const [dx, dz] = DIRS[d];
    return rampY(this.ramps[this.rampOf[i]], x + 0.5 + dx * 0.5, z + 0.5 + dz * 0.5);
  }

  // Altura de la superficie de la capa l en el punto (x, z).
  surfaceY(l, i, x, z) {
    if (this.kind[i] === RAMP) return rampY(this.ramps[this.rampOf[i]], x, z);
    return this.yOf(l);
  }

  // Enlaces entre celdas vecinas (4 direcciones): nodo de destino o -1.
  // Un escalón solo se enlaza de costado si es el primero (la entrada);
  // arriba se sale por la punta.
  buildLinks() {
    const { L, WH, W, H } = this;
    this.links = new Int32Array(L * WH * 4).fill(-1);
    for (let l = 0; l < L; l++) {
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const a = l * WH + z * W + x;
          if (!this.kind[a]) continue;
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0];
            const nz = z + DIRS[d][1];
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            const hA = this.edgeY(l, x, z, d);
            for (const m of [l, l + 1, l - 1]) {
              if (m < 0 || m >= L) continue;
              const b = m * WH + nz * W + nx;
              if (!this.kind[b]) continue;
              // dentro de la misma escalera se va para cualquier lado; si no, de costado solo en el primer escalón
              const same = this.kind[a] === RAMP && this.kind[b] === RAMP && this.rampOf[a] === this.rampOf[b];
              if (!same && (!this.lateralOk(a, x, z, d) || !this.lateralOk(b, nx, nz, d ^ 1))) continue;
              if (Math.abs(hA - this.edgeY(m, nx, nz, d ^ 1)) < JOIN) {
                this.links[a * 4 + d] = b;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Los escalones (menos el primero) solo se enlazan a lo largo de la escalera.
  lateralOk(node, x, z, d) {
    if (this.kind[node] !== RAMP) return true;
    const R = this.ramps[this.rampOf[node]];
    const along = this.rampAxis(R) === 'x' ? d < 2 : d >= 2;
    return along || this.rampStep(R, x, z) === 0;
  }

  // ---------------- alturas ----------------
  // Capa de la superficie en la celda (cx, cz) para algo a la altura y (-1 si no hay).
  layerAt(cx, cz, y, px = cx + 0.5, pz = cz + 0.5) {
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) return -1;
    const i = cz * this.W + cx;
    for (let l = this.L - 1; l >= 0; l--) {
      const k = l * this.WH + i;
      if (!this.kind[k]) continue;
      if (this.surfaceY(l, k, px, pz) <= y + STEP) return l;
    }
    return -1;
  }

  floorAt(x, z, y) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    let h = 0;
    const l = this.layerAt(cx, cz, y, x, z);
    if (l >= 0) h = this.surfaceY(l, l * this.WH + cz * this.W + cx, x, z);
    // la escalera divina
    if (this.skyState === 'open' || this.skyState === 'locked') {
      const s = this.skyFloor(x, z, y);
      if (s > h) h = s;
    }
    return h;
  }

  // Piso (0..14) de algo a la altura y.
  levelOf(y) {
    return Math.max(0, Math.min(this.L - 1, Math.floor(((y || 0) + 0.7) / this.FH)));
  }

  zoneAt(x, z, y) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (this.inArena(cx, cz)) return 'INF';
    const T = this.T;
    if (cx < T.x0 - 1 || cx > T.x1 + 1 || cz < T.z0 - 1 || cz > T.z1 + 1) return null;
    return `P${this.levelOf(y) + 1}`;
  }

  // ¿Se ve desde afuera (para el Cuervo)? Pegado a las arcadas o en la cima.
  exposed(p) {
    const T = this.T;
    if (this.levelOf(p.y) === this.L - 1) return true;
    const d = Math.min(p.x - T.x0, T.x1 + 1 - p.x, p.z - T.z0, T.z1 + 1 - p.z);
    return d < 3.2;
  }

  // ¿Se va caminando derecho de a hasta b sin cambiar de piso ni cruzar un hueco?
  walkLine(ax, az, bx, bz, y) {
    let cx = Math.floor(ax);
    let cz = Math.floor(az);
    const tx = Math.floor(bx);
    const tz = Math.floor(bz);
    let l = this.layerAt(cx, cz, y ?? this.w.hintY(), ax, az);
    if (l < 0) return false;
    let node = l * this.WH + cz * this.W + cx;
    const dx = bx - ax;
    const dz = bz - az;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (dx || 1e-9));
    const tdz = Math.abs(1 / (dz || 1e-9));
    let tmx = dx > 0 ? (cx + 1 - ax) * tdx : (ax - cx) * tdx;
    let tmz = dz > 0 ? (cz + 1 - az) * tdz : (az - cz) * tdz;
    for (let k = 0; k < 64 && (cx !== tx || cz !== tz); k++) {
      let d;
      if (tmx < tmz) {
        d = sx > 0 ? 0 : 1;
        tmx += tdx;
        cx += sx;
      } else {
        d = sz > 0 ? 2 : 3;
        tmz += tdz;
        cz += sz;
      }
      const next = this.links[node * 4 + d];
      if (next < 0 || this.blocked?.[next]) return false;
      node = next;
    }
    return true;
  }

  // ---------------- navegación: celdas trabadas ----------------
  computeNav() {
    const { L, WH, W, H } = this;
    const w = this.w;
    this.blocked = new Uint8Array(L * WH);
    for (let l = 0; l < L; l++) {
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const i = z * W + x;
          const k = l * WH + i;
          if (!this.kind[k]) continue;
          const fy = this.kind[k] === RAMP ? Math.min(this.edgeY(l, x, z, 0), this.edgeY(l, x, z, 1), this.edgeY(l, x, z, 2), this.edgeY(l, x, z, 3)) : this.yOf(l);
          const cx = x + 0.5;
          const cz = z + 0.5;
          for (const b of w.cellBoxes[i]) {
            if (!b.active || !b.solid || b.kind === 'rail' || b.kind === 'ground' || b.kind === 'slab' || b.kind === 'arch') continue;
            if (b.y0 > fy + 1 || b.y1 < fy + 0.3) continue;
            // (lo finito, como los barrotes de una celda, traba la celda que
            // pisa aunque no llegue al centro: si no, caía entre dos centros y
            // los muertos querían pasar derecho a través)
            const thin = b.x1 - b.x0 < 0.5 || b.z1 - b.z0 < 0.5;
            const over = thin && b.x0 < x + 0.95 && b.x1 > x + 0.05 && b.z0 < z + 0.95 && b.z1 > z + 0.05;
            if (over || (cx > b.x0 - 0.2 && cx < b.x1 + 0.2 && cz > b.z0 - 0.2 && cz < b.z1 + 0.2)) {
              this.blocked[k] = 1;
              break;
            }
          }
        }
      }
    }
    // la grilla vieja (lo que la lea sin altura ve la planta baja)
    w.navBlock = new Uint8Array(WH);
    for (let i = 0; i < WH; i++) w.navBlock[i] = !this.kind[i] || this.blocked[i] ? 1 : 0;
  }

  // ---------------- la grilla plana (compatibilidad) ----------------
  // Lo que el resto del motor lee de World: tipo de celda, zona, puertas...
  makeGrid() {
    const w = this.w;
    const n = this.WH;
    const T = this.T;
    w.grid = new Uint8Array(n);
    w.zone = new Int8Array(n).fill(-1);
    w.doorAt = new Int16Array(n).fill(-1);
    w.windowAt = new Int16Array(n).fill(-1);
    w.fy = new Float32Array(n);
    w.ty = new Float32Array(n);
    w.top = new Float32Array(n).fill(this.L * this.FH);
    w.rampAt = new Int16Array(n).fill(-1);
    w.roofC = new Float32Array(n);
    w.edge = new Uint8Array(n);
    w.owner = new Int8Array(n).fill(-1);
    const p1 = w.zoneKeys.indexOf('P1');
    const inf = w.zoneKeys.indexOf('INF');
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        const i = z * this.W + x;
        if (this.inFoot(x, z)) {
          w.grid[i] = 1;
          w.zone[i] = p1;
        } else if (this.inArena(x, z)) {
          w.grid[i] = 1;
          w.zone[i] = inf;
        } else if (x >= T.x0 - 1 && x <= T.x1 + 1 && z >= T.z0 - 1 && z <= T.z1 + 1) {
          w.grid[i] = 2;
          w.owner[i] = p1;
        }
      }
    }
    DOORS.forEach((d, k) => {
      for (const [x, z] of d.cells) w.doorAt[z * this.W + x] = k;
    });
    w.doorOpen = new Uint8Array(DOORS.length);
  }

  // ---------------- colisiones ----------------
  addBoxes() {
    const w = this.w;
    const T = this.T;
    const top = this.yOf(this.L - 1);
    const full = top + 3.2;
    // losas: frenan los tiros (no el paso: de un agujero uno se cae)
    for (let l = 1; l < this.L; l++) {
      const y = this.yOf(l);
      this.slabRuns(l, (x0, x1, z) => w.addBox([x0, y - T.slab, z, x1 + 1, y, z + 1], { kind: 'slab', solid: false }));
    }
    // la arcada: pilares macizos; en los arcos, una pared invisible (los tiros pasan)
    this.forPerimeter((x, z, pier, corner) => {
      if (pier || corner) w.addBox([x, -1, z, x + 1, full, z + 1], { kind: 'wall' });
      else w.addBox([x, -1, z, x + 1, full, z + 1], { kind: 'arch', shoot: false });
    });
    // los pisos distintos: paredes con puerta o columnas (towerDecor.layoutPieces)
    this.layout = layoutPieces(this);
    for (const b of this.layout.solids) w.addBox(b, { kind: 'wall' });
    // costado de las escaleras: frena al que viene de abajo, y la baranda del lado de adentro
    this.ramps.forEach((R, l) => {
      const [x0, z0, x1, z1] = R.rect;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const k = this.rampStep(R, x, z);
          const low = R.y0 + (k * (R.y1 - R.y0)) / this.rampLen(R);
          if (low - STEP > R.y0) w.addBox([x, R.y0 - 0.05, z, x + 1, low - STEP * 0.9, z + 1], { kind: 'ground', shoot: false });
        }
      }
      for (const e of this.innerEdge(R)) {
        if (e.k === 0) continue;
        const lo = R.y0 + ((e.k + 0.5) * (R.y1 - R.y0)) / this.rampLen(R);
        w.addBox(e.box(lo - 0.3, lo + RAIL_H), { kind: 'rail', shoot: false });
      }
      // arriba: baranda alrededor del hueco (menos donde se sale)
      if (l + 1 < this.L) {
        const y = this.yOf(l + 1);
        for (const e of this.wellEdges(R)) w.addBox(e.box(y, y + RAIL_H), { kind: 'rail', shoot: false });
      }
    });
    // escombros de cada escalera
    DOORS.forEach((d) => {
      d.boxes = [];
      for (const [x, z] of d.cells) d.boxes.push(w.addBox([x, d.y, z, x + 1, d.y + 2.7, z + 1], { kind: 'door', door: DOORS.indexOf(d) }));
    });
  }

  rampLen(R) {
    const [x0, z0, x1, z1] = R.rect;
    return this.rampAxis(R) === 'x' ? x1 + 1 - x0 : z1 + 1 - z0;
  }

  // Tramos de losa de la capa l, fila por fila: fn(x0, x1, z).
  slabRuns(l, fn, pred = null) {
    const T = this.T;
    for (let z = T.z0; z <= T.z1; z++) {
      let run = -1;
      for (let x = T.x0; x <= T.x1 + 1; x++) {
        const k = l * this.WH + z * this.W + x;
        const ok = x <= T.x1 && this.kind[k] === SLAB && (!pred || pred(x, z));
        if (ok && run < 0) run = x;
        if (!ok && run >= 0) {
          fn(run, x - 1, z);
          run = -1;
        }
      }
    }
  }

  // Recorre las celdas del borde de la torre: fn(x, z, pilar, esquina, lado, a lo largo).
  forPerimeter(fn) {
    const T = this.T;
    const pier = (a) => T.piers.some(([p0, p1]) => a >= p0 && a <= p1);
    for (let a = T.x0 - 1; a <= T.x1 + 1; a++) {
      const corner = a < T.x0 || a > T.x1;
      fn(a, T.z0 - 1, pier(a), corner, 0, a);
      fn(a, T.z1 + 1, pier(a), corner, 2, a);
    }
    for (let a = T.z0; a <= T.z1; a++) {
      fn(T.x0 - 1, a, pier(a), false, 3, a);
      fn(T.x1 + 1, a, pier(a), false, 1, a);
    }
  }

  // El borde de adentro de una escalera (el que da al anillo), por escalón.
  innerEdge(R) {
    const [x0, z0, x1, z1] = R.rect;
    const out = [];
    const th = 0.05;
    const n = this.rampLen(R);
    if (R.side === 0) for (let x = x0; x <= x1; x++) out.push({ k: this.rampStep(R, x, z1), box: (a, b) => [x, a, z1 + 1 - th, x + 1, b, z1 + 1 + th] });
    if (R.side === 2) for (let x = x0; x <= x1; x++) out.push({ k: this.rampStep(R, x, z0), box: (a, b) => [x, a, z0 - th, x + 1, b, z0 + th] });
    if (R.side === 1) for (let z = z0; z <= z1; z++) out.push({ k: this.rampStep(R, x0, z), box: (a, b) => [x0 - th, a, z, x0 + th, b, z + 1] });
    if (R.side === 3) for (let z = z0; z <= z1; z++) out.push({ k: this.rampStep(R, x1, z), box: (a, b) => [x1 + 1 - th, a, z, x1 + 1 + th, b, z + 1] });
    return out.filter((e) => e.k >= 0 && e.k < n);
  }

  // Los bordes del hueco de una escalera, en el piso de arriba: el de adentro
  // y la punta de abajo (por la punta de arriba se sale).
  wellEdges(R) {
    const [x0, z0, x1, z1] = R.rect;
    const th = 0.05;
    const out = this.innerEdge(R).map((e) => ({ ...e }));
    const end = (a, b) => {
      if (R.dir === '+x') return [x0 - th, a, z0, x0 + th, b, z1 + 1];
      if (R.dir === '-x') return [x1 + 1 - th, a, z0, x1 + 1 + th, b, z1 + 1];
      if (R.dir === '+z') return [x0, a, z0 - th, x1 + 1, b, z0 + th];
      return [x0, a, z1 + 1 - th, x1 + 1, b, z1 + 1 + th];
    };
    out.push({ k: -1, box: end });
    return out;
  }

  // ---------------- armado ----------------
  build() {
    this.makeGrid();
    this.addBoxes();
    this.makeMaterials();
    this.buildArchitecture();
    this.buildOutside();
    this.buildVortex();
    this.buildStorm();
    this.buildLights();
    this.buildDetail();
    this.buildSkyStair();
    this.sightings = new ChiquiSightings(this.w.g, this);
  }

  makeMaterials() {
    const M = this.w.M;
    // la rosa de los vientos de las plazas (mosaico)
    M.rosa = new THREE.MeshStandardMaterial({ map: rosaTexture(), roughness: 0.55 });
    M.marble = new THREE.MeshStandardMaterial({ map: this.w.T.calcareo, color: 0xd8d0c4, roughness: 0.5 });
    M.gold = new THREE.MeshStandardMaterial({ color: 0xffc84a, roughness: 0.25, metalness: 1, emissive: 0x4a3000, emissiveIntensity: 0.5 });
    M.goldGlass = new THREE.MeshStandardMaterial({ color: 0xffd870, roughness: 0.1, metalness: 0.4, emissive: 0xffa820, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    M.lantern = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb050, emissiveIntensity: 2.2 });
    M.towerStone = new THREE.MeshStandardMaterial({ map: this.w.T.stoneWall || this.w.T.concrete, color: 0xb8ae9e, roughness: 0.95, bumpMap: this.w.T.stoneWall || null, bumpScale: 1.2 });
    M.ceilStone = new THREE.MeshStandardMaterial({ map: this.w.T.concrete, color: 0x6e6862, roughness: 1 });
    // la piedra más clara de las claves y las impostas de los arcos
    M.keyStone = new THREE.MeshStandardMaterial({ map: this.w.T.stoneWall || this.w.T.concrete, color: 0xe0d8c8, roughness: 0.85 });
  }

  buildArchitecture() {
    const w = this.w;
    const T = this.T;
    const gb = new GeoBuilder();
    const S = T.slab;
    for (let l = 0; l < this.L; l++) {
      const n = l + 1;
      const Z = ZONES[`P${n}`];
      const y = this.yOf(l);
      const plaza = !this.hasHole(n);
      const [h0, h1, h2, h3] = T.hole;
      // piso (la plaza del medio lleva la rosa de los vientos)
      this.slabRuns(l, (x0, x1, z) => gb.flat(Z.floor, x0, z, x1 + 1, z + 1, y + 0.002, true), plaza ? (x, z) => !this.inHole(x, z) : null);
      if (plaza) {
        const a = h0;
        const b = h2 + 1;
        const c = h1;
        const d = h3 + 1;
        gb.quad('rosa', [a, y + 0.004, d], [b, y + 0.004, d], [b, y + 0.004, c], [a, y + 0.004, c], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      // techo: la cara de abajo de la losa
      if (l > 0) this.slabRuns(l, (x0, x1, z) => gb.flat('ceilStone', x0, z, x1 + 1, z + 1, y - S, false));
      // cantos de la losa alrededor de los huecos
      if (l > 0) {
        for (let z = T.z0; z <= T.z1; z++) {
          for (let x = T.x0; x <= T.x1; x++) {
            const k = l * this.WH + z * this.W + x;
            if (this.kind[k] !== SLAB) continue;
            DIRS.forEach(([dx, dz]) => {
              const nx = x + dx;
              const nz = z + dz;
              if (!this.inFoot(nx, nz) || this.kind[l * this.WH + nz * this.W + nx] === SLAB) return;
              const mx = x + 0.5 + dx * 0.5;
              const mz = z + 0.5 + dz * 0.5;
              const rx = dz;
              const rz = -dx;
              gb.wall('towerStone', mx - rx * 0.5, mz - rz * 0.5, mx + rx * 0.5, mz + rz * 0.5, y - S, y, [dx, 0, dz], 2);
              // guarda de piedra al borde del agujero
              if (this.inHole(nx, nz)) {
                if (dx) gb.box('trim', mx - 0.06, y, z, mx + 0.06, y + 0.08, z + 1, 1);
                else gb.box('trim', x, y, mz - 0.06, x + 1, y + 0.08, mz + 0.06, 1);
              }
            });
          }
        }
      }
      this.buildPerimeter(gb, l, Z);
    }
    // escaleras: escalones de verdad, baranda de adentro y la del hueco de arriba
    this.ramps.forEach((R, l) => {
      const [x0, z0, x1, z1] = R.rect;
      const len = this.rampLen(R);
      const count = Math.round(this.FH / 0.25);
      const run = len / count;
      const alongX = this.rampAxis(R) === 'x';
      const key = 'stoneStep';
      for (let k = 0; k < count; k++) {
        const hTop = R.y0 + (this.FH * (k + 1)) / count;
        const up = R.dir[0] === '+';
        const s0 = up ? k * run : len - (k + 1) * run;
        const s1 = s0 + run;
        if (alongX) gb.box(key, x0 + s0, R.y0 - 0.02, z0, x0 + s1, hTop, z1 + 1);
        else gb.box(key, x0, R.y0 - 0.02, z0 + s0, x1 + 1, hTop, z0 + s1);
      }
      // baranda del lado de adentro: parantes y el pasamanos en tramos
      for (const e of this.innerEdge(R)) {
        if (e.k === 0) continue;
        const lo = R.y0 + ((e.k + 0.5) * this.FH) / len;
        const b = e.box(lo, lo + RAIL_H);
        const cx = (b[0] + b[3]) / 2;
        const cz = (b[2] + b[5]) / 2;
        gb.box('iron', cx - 0.03, lo - 0.1, cz - 0.03, cx + 0.03, lo + RAIL_H, cz + 0.03, 1);
        gb.box('iron', b[0], lo + RAIL_H - 0.04, b[2], b[3], lo + RAIL_H + 0.02, b[5], 1);
      }
      if (l + 1 < this.L) {
        const y = this.yOf(l + 1);
        for (const e of this.wellEdges(R)) {
          const b = e.box(y, y + RAIL_H);
          gb.box('iron', b[0], y + RAIL_H - 0.04, b[2], b[3], y + RAIL_H + 0.02, b[5], 1);
          gb.box('iron', b[0], y + 0.5, b[2], b[3], y + 0.54, b[5], 1);
          const longX = b[3] - b[0] > b[5] - b[2];
          const L = longX ? b[3] - b[0] : b[5] - b[2];
          for (let s = 0; s <= L; s += 1) {
            const px = longX ? b[0] + s : (b[0] + b[3]) / 2;
            const pz = longX ? (b[2] + b[5]) / 2 : b[2] + s;
            gb.box('iron', px - 0.03, y, pz - 0.03, px + 0.03, y + RAIL_H, pz + 0.03, 1);
          }
        }
      }
    });
    w.root.add(gb.build(w.M));
    this.buildBalusters();
    // los arcos curvos y el borde roto del agujero (world/towerDecor.js)
    buildArches(this, ARCH_TOP);
    buildHoleLip(this);
    buildLayouts(this, this.layout);
  }

  // Pilares, arcos con baranda y la cornisa de afuera de un piso.
  buildPerimeter(gb, l, Z) {
    const y = this.yOf(l);
    const T = this.T;
    const H = this.FH - T.slab;
    const last = l === this.L - 1;
    const inner = Z.wall || 'stoneWall';
    this.balusters ||= [];
    const r = rng(200 + l);
    this.forPerimeter((x, z, pier, corner, side) => {
      // hacia adentro de la torre
      const n = [[0, 1], [-1, 0], [0, -1], [1, 0]][side];
      if (corner) {
        gb.box('towerStone', x, y, z, x + 1, last ? y + 1.6 : y + this.FH, z + 1, 2);
        return;
      }
      if (pier) {
        const h = last ? (r() < 0.5 ? 1.25 : 1.6) : this.FH;
        gb.box('towerStone', x, y, z, x + 1, y + h, z + 1, 2);
        // la cara de adentro con la pared del piso
        const mx = x + 0.5 + n[0] * 0.505;
        const mz = z + 0.5 + n[1] * 0.505;
        gb.wall(inner, mx - n[1] * 0.5, mz + n[0] * 0.5, mx + n[1] * 0.5, mz - n[0] * 0.5, y, y + Math.min(h, H), [n[0], 0, n[1]], 3.6, (x + z) % 4);
        return;
      }
      // arco: antepecho con balaustres y, arriba, el dintel
      gb.box('towerStone', x, y, z, x + 1, y + 0.16, z + 1, 1);
      if (n[0]) gb.box('trim', x + 0.1, y + 0.94, z, x + 0.9, y + 1.04, z + 1, 1);
      else gb.box('trim', x, y + 0.94, z + 0.1, x + 1, y + 1.04, z + 0.9, 1);
      for (let s = 0.17; s < 1; s += 0.33) this.balusters.push(n[0] ? [x + 0.5, y + 0.16, z + s] : [x + s, y + 0.16, z + 0.5]);
      if (last) return;
      gb.box('towerStone', x, y + ARCH_TOP, z, x + 1, y + this.FH, z + 1, 2);
    });
    // (la curva de cada arco va aparte, lisa: towerDecor.buildArches)
    // cornisa de afuera, a la altura de cada losa
    const c0 = T.x0 - 1.15;
    const c1 = T.x1 + 2.15;
    const d0 = T.z0 - 1.15;
    const d1 = T.z1 + 2.15;
    const cy = y - 0.35;
    if (l > 0) {
      gb.box('towerStone', c0, cy, d0, c1, y + 0.05, d0 + 0.2, 1);
      gb.box('towerStone', c0, cy, d1 - 0.2, c1, y + 0.05, d1, 1);
      gb.box('towerStone', c0, cy, d0, c0 + 0.2, y + 0.05, d1, 1);
      gb.box('towerStone', c1 - 0.2, cy, d0, c1, y + 0.05, d1, 1);
    }
  }

  // Tramos de arco a lo largo de un lado (entre pilares).
  archSpans() {
    if (this._arches) return this._arches;
    const T = this.T;
    const out = [];
    let start = -1;
    for (let a = T.x0; a <= T.x1 + 1; a++) {
      const pier = a > T.x1 || T.piers.some(([p0, p1]) => a >= p0 && a <= p1);
      if (!pier && start < 0) start = a;
      if (pier && start >= 0) {
        out.push([start, a - 1]);
        start = -1;
      }
    }
    this._arches = out;
    return out;
  }

  // Balaustres torneados de todas las arcadas (una sola malla).
  buildBalusters() {
    const list = this.balusters || [];
    // pocos lados: son más de dos mil
    const prof = [[0.05, 0], [0.03, 0.14], [0.06, 0.38], [0.032, 0.64], [0.055, 0.78]];
    const geo = new THREE.LatheGeometry(prof.map(([rr, yy]) => new THREE.Vector2(rr, yy)), 6);
    const im = new THREE.InstancedMesh(geo, this.w.M.towerStone, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, y, z], k) => {
      m4.makeTranslation(x, y, z);
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    this.w.root.add(im);
  }

  // La base de la torre (dos escalones de piedra) y el llano de alrededor
  // (world/Llano.js: la explanada, el camino, lo que se trajo el viento).
  buildOutside() {
    const w = this.w;
    const T = this.T;
    const gb = new GeoBuilder();
    for (let s = 0; s < 2; s++) {
      const e = 1.6 - s * 0.6;
      gb.box('towerStone', T.x0 - 1 - e, -0.02, T.z0 - 1 - e, T.x1 + 2 + e, 0.12 + s * 0.12, T.z1 + 2 + e, 2);
    }
    w.root.add(gb.build(w.M));
    this.llano = new Llano(w);
  }

  // ---------------- el remolino ----------------
  // Tres cortinas de viento que giran a distinta velocidad y un montón de
  // hojas, yuyos y yerba dando vueltas (todo se mueve en la placa de video).
  // Las cortinas son vetas de polvo en espiral con huecos entre una y otra (se
  // ve la de atrás); la de afuera tapa todo: más allá no hay nada. Y lo grande
  // que vuela (tablas, chapas, ramas, cajones) está en towerDecor.
  buildVortex() {
    const w = this.w;
    const T = this.T;
    this.vortex = [];
    // (floor: lo mínimo que tapa entre veta y veta; la de afuera casi todo)
    const shells = [
      { r: 27, speed: 0.26, alpha: 0.5, color: 0x8e8470, floor: 0.08 },
      { r: 36, speed: 0.17, alpha: 0.78, color: 0x5e584c, floor: 0.3 },
      { r: 52, speed: 0.11, alpha: 1, color: 0x2c2824, floor: 0.88 },
    ];
    for (const s of shells) {
      const geo = new THREE.CylinderGeometry(s.r, s.r * 1.12, 160, 64, 1, true);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: { uTime: { value: 0 }, uSpeed: { value: s.speed }, uAlpha: { value: s.alpha }, uFloor: { value: s.floor }, uColor: { value: new THREE.Color(s.color) }, uFlash: { value: 0 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          varying vec2 vUv; varying vec3 vPos; uniform float uTime, uSpeed, uAlpha, uFloor, uFlash; uniform vec3 uColor;
          float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.1; a *= 0.5; } return s; }
          void main(){
            // vetas que giran y suben en espiral: el polvo grueso, las vetas
            // finas que corren y las bandas inclinadas del remolino
            vec2 q = vec2(vUv.x * 16.0 - uTime * uSpeed * 3.4 + vUv.y * 7.0, vUv.y * 6.0 - uTime * uSpeed * 0.7);
            float n = fbm(q);
            float fine = fbm(vec2(q.x * 0.7 + n * 1.5, q.y * 14.0));
            // la costura del cilindro (u = 1 vuelve a u = 0): se funde con la vuelta anterior
            float seam = smoothstep(0.86, 1.0, vUv.x);
            if (seam > 0.0) {
              vec2 q2 = q - vec2(16.0, 0.0);
              float n2 = fbm(q2);
              fine = mix(fine, fbm(vec2(q2.x * 0.7 + n2 * 1.5, q2.y * 14.0)), seam);
              n = mix(n, n2, seam);
            }
            float streak = smoothstep(0.45, 0.82, fine);
            float band = 0.5 + 0.5 * sin(vUv.x * 31.4159 + vUv.y * 24.0 - uTime * uSpeed * 9.0 + n * 3.0);
            band = smoothstep(0.2, 0.95, band);
            float k = clamp(n * 0.55 + streak * 0.6 + band * 0.6 - 0.3, 0.0, 1.3);
            float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
            vec3 col = uColor * (0.35 + k * 1.15) + vec3(0.6, 0.65, 0.8) * uFlash * (0.25 + k);
            gl_FragColor = vec4(col, clamp(uAlpha * (uFloor + k * 0.9) * fade, 0.0, 1.0));
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(T.cx, 60, T.cz);
      m.renderOrder = -1;
      w.root.add(m);
      this.vortex.push(m);
    }
    // basura del viento: hojas de yerba, yuyos, polvo
    const N = 1600;
    const r = rng(77);
    const pos = new Float32Array(N * 3);
    const data = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      data[i * 4] = 20 + r() * 26; // radio
      data[i * 4 + 1] = -4 + r() * 120; // altura
      data[i * 4 + 2] = r() * Math.PI * 2; // ángulo
      data[i * 4 + 3] = 0.35 + r() * 0.5; // velocidad
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), 200);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uMap: { value: w.T.dot }, uScale: { value: 300 } },
      vertexShader: `
        attribute vec4 aData; uniform float uTime, uScale; varying float vK;
        void main(){
          float ang = aData.z + uTime * aData.w * (30.0 / aData.x);
          float y = mod(aData.y + uTime * aData.w * 2.0, 124.0) - 4.0;
          vec3 p = vec3(cos(ang) * aData.x, y, sin(ang) * aData.x);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vK = fract(aData.z * 7.13);
          gl_PointSize = clamp(uScale * (0.25 + vK * 0.35) / -mv.z, 1.0, 26.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vK;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          vec3 c = mix(vec3(0.35, 0.42, 0.22), vec3(0.55, 0.48, 0.38), vK);
          gl_FragColor = vec4(c, t.a * 0.85);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(T.cx, 0, T.cz);
    pts.frustumCulled = false;
    w.root.add(pts);
    this.debris = pts;
    const q = w.g?.settings?.quality;
    this.flying = buildOrbitDebris(this, q === 'perf' || q === 'low');
  }

  // El ojo de la tormenta sobre la cima: nubes en espiral y la luz de la Voz.
  buildStorm() {
    const w = this.w;
    const T = this.T;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uHurt: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime, uOpen, uHurt;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p *= 2.05; a *= 0.5; } return s; }
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          float a = atan(c.y, c.x);
          // nubes que giran en espiral hacia el ojo
          float sw = a + r * 5.0 - uTime * 0.12;
          float n = fbm(vec2(cos(sw), sin(sw)) * 2.0 + vec2(r * 4.0, uTime * 0.03));
          vec3 cloud = mix(vec3(0.05, 0.05, 0.07), vec3(0.2, 0.18, 0.22), n);
          // el ojo: violeta, y dorado cuando se abre el cielo
          float eye = smoothstep(0.28 + uOpen * 0.2, 0.0, r);
          vec3 glow = mix(vec3(0.6, 0.4, 1.0), vec3(1.0, 0.8, 0.35), uOpen) * (1.4 + uHurt * 2.0);
          vec3 col = mix(cloud, glow, eye);
          float alpha = smoothstep(1.0, 0.75, r);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(95, 64).rotateX(Math.PI / 2), mat);
    disk.position.set(T.cx, 128, T.cz);
    disk.renderOrder = -1;
    w.root.add(disk);
    this.storm = disk;
    // la Voz: un ojo de luz en el centro de la tormenta
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.dot, color: 0xc8a0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    eye.scale.setScalar(26);
    eye.position.set(T.cx, 124, T.cz);
    w.root.add(eye);
    this.eye = eye;
  }

  // ---------------- luces ----------------
  // Faroles en todos los pisos (se ven prendidos de lejos) y unas pocas luces
  // de verdad que se van ubicando en los faroles más cercanos a la cámara.
  buildLights() {
    const w = this.w;
    const T = this.T;
    this.anchors = [];
    const lamp = new THREE.SphereGeometry(0.11, 8, 6);
    const cage = new THREE.CylinderGeometry(0.14, 0.18, 0.34, 6, 1, true);
    // el techito y la base del farol
    const capBase = mergeGeometries([
      new THREE.ConeGeometry(0.2, 0.13, 6).translate(0, 0.235, 0),
      new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6).translate(0, 0.32, 0),
      new THREE.CylinderGeometry(0.19, 0.17, 0.035, 6).translate(0, -0.187, 0),
    ]);
    // el brazo de la pared (en su marco: la pared en x = 0, el farol en x = 0.35):
    // la chapa atornillada, el brazo que lo sostiene de abajo y la escuadra
    const brace = Math.atan2(0.24, 0.28);
    const armGeo = mergeGeometries([
      new THREE.BoxGeometry(0.03, 0.36, 0.12).translate(0.015, -0.3, 0),
      new THREE.BoxGeometry(0.4, 0.03, 0.045).translate(0.2, -0.22, 0),
      new THREE.BoxGeometry(0.37, 0.025, 0.03).rotateZ(brace).translate(0.16, -0.33, 0),
      new THREE.SphereGeometry(0.026, 8, 6).translate(0.4, -0.22, 0),
    ]);
    const arms = [];
    const bulbs = [];
    const posts = new GeoBuilder();
    const [h0, h1, h2, h3] = T.hole;
    for (let l = 0; l < this.L; l++) {
      const last = l === this.L - 1;
      // faroles contra los pilares (en la cima, a la altura de las almenas)
      const y = this.yOf(l) + (last ? 1.05 : 3.1);
      const n = l + 1;
      // el color de la luz, el de cada piso (towerDecor.FLOOR_TINTS)
      const color = FLOOR_TINTS[l] ?? 0xffb070;
      const pts = [
        [T.x0 + 0.35, T.cz + 3.5, y],
        [T.x1 + 0.65, T.cz - 3.5, y],
        [T.cx - 3.5, T.z0 + 0.35, y],
        [T.cx + 3.5, T.z1 + 0.65, y],
      ];
      // (el giro de cada brazo: de la pared hacia adentro)
      [0, Math.PI, -Math.PI / 2, Math.PI / 2].forEach((rot, k) => arms.push([pts[k][0] - Math.cos(rot) * 0.35, pts[k][2], pts[k][1] + Math.sin(rot) * 0.35, rot]));
      // en las plazas (arriba está el agujero del piso de arriba): faroles de pie en las cuatro puntas
      if (!this.hasHole(n) && !last) {
        const fy = this.yOf(l);
        for (const [x, z] of [[h0 - 0.4, h1 - 0.4], [h2 + 1.4, h1 - 0.4], [h0 - 0.4, h3 + 1.4], [h2 + 1.4, h3 + 1.4]]) {
          posts.box('iron', x - 0.05, fy, z - 0.05, x + 0.05, fy + 2.45, z + 0.05, 1);
          posts.box('iron', x - 0.14, fy, z - 0.14, x + 0.14, fy + 0.12, z + 0.14, 1);
          w.addBox([x - 0.15, fy, z - 0.15, x + 0.15, fy + 2.6, z + 0.15], { kind: 'prop' });
          pts.push([x, z, fy + 2.62]);
        }
      }
      for (const [x, z, yy] of pts) {
        this.anchors.push({ pos: new THREE.Vector3(x, yy, z), l, color });
        bulbs.push([x, yy, z]);
      }
    }
    w.root.add(posts.build(w.M));
    const bulbIm = new THREE.InstancedMesh(lamp, w.M.lantern, bulbs.length);
    const cageIm = new THREE.InstancedMesh(cage, w.M.iron, bulbs.length);
    const capIm = new THREE.InstancedMesh(capBase, w.M.iron, bulbs.length);
    const m4 = new THREE.Matrix4();
    bulbs.forEach(([x, y, z], k) => {
      m4.makeTranslation(x, y, z);
      bulbIm.setMatrixAt(k, m4);
      cageIm.setMatrixAt(k, m4);
      capIm.setMatrixAt(k, m4);
    });
    const armIm = new THREE.InstancedMesh(armGeo, w.M.iron, arms.length);
    const q = new THREE.Quaternion();
    arms.forEach(([x, y, z, rot], k) => {
      m4.compose(tmpV3.set(x, y, z), q.setFromAxisAngle(UPV, rot), tmpS.set(1, 1, 1));
      armIm.setMatrixAt(k, m4);
    });
    w.root.add(bulbIm, cageIm, capIm, armIm);
    // las luces de verdad: cada una con su farol (`a`), cuánto está prendida
    // (`k`, 0 a 1), si se está yendo (`out`) y su fuerza (`base`)
    this.lightPool = [];
    for (let i = 0; i < LIGHTS; i++) {
      const L = new THREE.PointLight(0xffb070, 0, 16, 1.7);
      L.userData = { a: null, k: 0, out: false, base: 0 };
      w.scene.add(L);
      this.lightPool.push(L);
    }
    this.lightT = 0;
    // las luces de la cinemática del final (el mate supremo y el ánima de
    // Fierro): existen desde ahora, apagadas; si se sumaran en medio de la
    // escena se recompilarían todos los shaders (ver ui/cineWarm.js)
    this.cineLights = [0, 1].map(() => {
      const L = new THREE.PointLight(0xffffff, 0, 8, 2);
      w.scene.add(L);
      return L;
    });
  }

  // Las luces de verdad van a los faroles más cercanos a la cámara (los del
  // piso donde se está pesan más). Cada una se queda en su farol mientras siga
  // entre los más cercanos (el que ya tiene luz cuenta más cerca: sin idas y
  // vueltas); si hay que mudarla se apaga despacio, se muda apagada y se
  // prende despacio en el otro. Antes saltaban de farol en farol cada cuarto
  // de segundo: luces y sombras que aparecían y se iban al moverse un poco (y
  // la sombra de la Épica, que espera que la luz esté quieta, no llegaba).
  updateLights(dt) {
    const w = this.w;
    const cam = w.g.camera;
    const pool = this.lightPool;
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.25;
      const cy = cam.position.y;
      const held = new Set();
      for (const L of pool) if (L.userData.a) held.add(L.userData.a);
      for (const a of this.anchors) a.d = (a.pos.distanceToSquared(cam.position) + Math.abs(a.pos.y - cy - 1.4) * 40) * (held.has(a) ? 0.6 : 1);
      const want = new Set([...this.anchors].sort((p, q) => p.d - q.d).slice(0, LIGHTS));
      // las que sobran se van apagando (y vuelven si las quieren de nuevo)
      for (const L of pool) L.userData.out = !!L.userData.a && !want.has(L.userData.a);
      // los faroles que faltan toman una luz libre, que arranca apagada
      for (const a of want) {
        if (held.has(a)) continue;
        const L = pool.find((x) => !x.userData.a);
        if (!L) break;
        const u = L.userData;
        u.a = a;
        u.k = 0;
        u.out = false;
        u.base = a.l === this.L - 1 ? 30 : 26;
        L.position.copy(a.pos);
        L.color.set(a.color);
      }
    }
    // (dim: el apagón del Challenge, entities/TowerChallenge.js; en la historia no se toca)
    const dim = this.dim ?? 1;
    const on = (w.power ? 1 : 0.45) * dim;
    if (this.dim !== undefined) w.M.lantern.emissiveIntensity = 2.2 * Math.max(0.12, dim);
    const t = w.g.time;
    pool.forEach((L, i) => {
      const u = L.userData;
      if (u.a) u.k = u.out ? Math.max(0, u.k - dt / LIGHT_OUT) : Math.min(1, u.k + dt / LIGHT_IN);
      if (u.out && u.k === 0) {
        // ya apagada: queda libre y en el próximo cuadro se reparte
        u.a = null;
        u.out = false;
        this.lightT = 0;
      }
      const flick = w.power ? 1 : Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 3.1 + i) > 1.5 ? 0.3 : 1;
      L.intensity = (u.base || 0) * u.k * on * flick * (0.92 + Math.sin(t * 7 + i * 3) * 0.04);
    });
  }

  // ---------------- detalle de los pisos ----------------
  // Lo que se repite en todos: el entrepiso de madera (viguetas sobre dos
  // vigas maestras), faroles colgando (también son lugares para las luces que
  // siguen al jugador), zócalo y moldura de piedra en los pilares. Y lo propio
  // de algunos pisos: la yerba colgando a secar (2 y 3), las chapas del galpón
  // que se hamacan y golpean (6), el maíz que crece para abajo (8), las
  // cadenas de los calabozos (11) y el santo sin cara de la capilla (13).
  buildDetail() {
    const w = this.w;
    const T = this.T;
    const gb = new GeoBuilder();
    const ceilOk = (l, x, z) => l + 1 < this.L && this.kind[(l + 1) * this.WH + z * this.W + x] === SLAB;
    // tramos seguidos de celdas con techo a lo largo de x (fijo z) o de z (fijo x)
    const runs = (l, fixed, alongX, fn) => {
      let s = -1;
      for (let a = T.x0; a <= T.x1 + 1; a++) {
        const ok = a <= T.x1 && (alongX ? ceilOk(l, a, fixed) : ceilOk(l, fixed, a));
        if (ok && s < 0) s = a;
        if (!ok && s >= 0) {
          fn(s, a);
          s = -1;
        }
      }
    };
    this.hangers = [];
    for (let l = 0; l < this.L - 1; l++) {
      const yc = this.yOf(l + 1) - T.slab;
      // viguetas (a lo largo de z, cada 2 m)
      for (let x = T.x0; x <= T.x1; x += 2) {
        const cx = x + 0.5;
        runs(l, x, false, (z0, z1) => gb.box('beam', cx - 0.08, yc - 0.2, z0, cx + 0.08, yc + 0.01, z1, 1));
      }
      // vigas maestras (a lo largo de x) debajo de las viguetas
      for (const z of [22, 37]) {
        runs(l, z, true, (x0, x1) => {
          gb.box('beam', x0, yc - 0.48, z + 0.36, x1, yc - 0.2, z + 0.64, 1);
          // ménsulas contra la pared
          if (x0 === T.x0) gb.box('towerStone', x0, yc - 0.7, z + 0.3, x0 + 0.3, yc - 0.48, z + 0.7, 1);
          if (x1 === T.x1 + 1) gb.box('towerStone', x1 - 0.3, yc - 0.7, z + 0.3, x1, yc - 0.48, z + 0.7, 1);
        });
        // faroles colgando de la viga
        for (const x of [22, 37]) if (ceilOk(l, x, z)) this.hangers.push({ l, x: x + 0.5, z: z + 0.5, top: yc - 0.48 });
      }
    }
    // zócalo y moldura de piedra en la cara de adentro de los pilares (menos
    // donde pasa la escalera que sube o está el hueco de la que llega)
    for (let l = 0; l < this.L; l++) {
      const y = this.yOf(l);
      const last = l === this.L - 1;
      const busy = [l < this.L - 1 ? this.ramps[l] : null, l > 0 ? this.ramps[l - 1] : null].filter(Boolean);
      const free = (side, a0, a1) => !busy.some((R) => {
        if (R.side !== side) return false;
        const [x0, z0, x1, z1] = R.rect;
        const [b0, b1] = side % 2 ? [z0, z1 + 1] : [x0, x1 + 1];
        return a0 < b1 && a1 > b0;
      });
      for (const [p0, p1] of T.piers) {
        const a0 = Math.max(T.x0, p0);
        const a1 = Math.min(T.x1, p1) + 1;
        const bands = last ? [[0, 0.28, 0.07]] : [[0, 0.28, 0.07], [2.02, 2.14, 0.1]];
        for (const [h0, h1, d] of bands) {
          if (free(0, a0, a1)) gb.box('towerStone', a0, y + h0, T.z0, a1, y + h1, T.z0 + d, 1);
          if (free(2, a0, a1)) gb.box('towerStone', a0, y + h0, T.z1 + 1 - d, a1, y + h1, T.z1 + 1, 1);
          if (free(3, a0, a1)) gb.box('towerStone', T.x0, y + h0, a0, T.x0 + d, y + h1, a1, 1);
          if (free(1, a0, a1)) gb.box('towerStone', T.x1 + 1 - d, y + h0, a0, T.x1 + 1, y + h1, a1, 1);
        }
      }
    }
    w.root.add(gb.build(w.M));
    // los faroles: cadena, jaula y la luz (lugar para las luces de verdad)
    const chain = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
    const glass = new THREE.SphereGeometry(0.1, 8, 6);
    const cage = new THREE.CylinderGeometry(0.12, 0.16, 0.3, 6, 1, true);
    const cap = new THREE.ConeGeometry(0.17, 0.12, 6);
    const n = this.hangers.length;
    const ims = [[chain, w.M.iron], [glass, w.M.lantern], [cage, w.M.iron], [cap, w.M.iron]].map(([geo, mat]) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      w.root.add(im);
      return im;
    });
    const m4 = new THREE.Matrix4();
    this.hangers.forEach((h, k) => {
      const ly = h.top - 0.75;
      m4.compose(tmpV3.set(h.x, (h.top + ly + 0.2) / 2, h.z), IDQ, tmpS.set(1, h.top - ly - 0.2, 1));
      ims[0].setMatrixAt(k, m4);
      m4.makeTranslation(h.x, ly, h.z);
      ims[1].setMatrixAt(k, m4);
      ims[2].setMatrixAt(k, m4);
      m4.makeTranslation(h.x, ly + 0.2, h.z);
      ims[3].setMatrixAt(k, m4);
      this.anchors.push({ pos: new THREE.Vector3(h.x, ly, h.z), l: h.l, color: FLOOR_TINTS[h.l] ?? 0xffb070 });
    });
    this.buildThemes();
    // apliques, estantes, postigos y lo tirado en cada piso (world/towerDecor.js)
    this.decor = buildFloorDecor(this);
  }

  // Lo propio de algunos pisos (ver buildDetail).
  buildThemes() {
    const w = this.w;
    const T = this.T;
    const M = w.M;
    const r = rng(915);
    const ceil = (n) => this.yOf(n) - T.slab;
    const hasCeil = (n, x, z) => this.kind[n * this.WH + Math.floor(z) * this.W + Math.floor(x)] === SLAB;
    // la yerba colgando a secar (pisos 2 y 3): atados de ramas bajo las viguetas
    const bundle = mergeGeometries([
      new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4).translate(0, -0.175, 0),
      new THREE.ConeGeometry(0.13, 0.55, 7).rotateX(Math.PI).translate(0, -0.6, 0),
    ]);
    const bundles = [];
    for (const n of [2, 3]) {
      for (let x = T.x0; x <= T.x1; x += 2) {
        for (let z = T.z0 + 0.6; z < T.z1 + 1; z += 1.3) {
          if (!hasCeil(n, x, z) || r() < 0.25) continue;
          bundles.push([x + 0.5, ceil(n) - 0.2, z + (r() - 0.5) * 0.3, r() * 3, 0.8 + r() * 0.5]);
        }
      }
    }
    this.instanced(bundle, M.yerbaBranch, bundles);
    // el maíz colgante (piso 8): plantas de maíz cabeza abajo desde el techo
    if (M.corn) {
      // la planta dada vuelta: la raíz en el techo y las puntas para abajo
      const card = mergeGeometries([0, 1].map((k) => new THREE.PlaneGeometry(0.9, 1.3).rotateZ(Math.PI).translate(0, -0.65, 0).rotateY((k * Math.PI) / 2)));
      const corn = [];
      for (let x = T.x0 + 0.5; x <= T.x1; x += 1.1) {
        for (let z = T.z0 + 0.5; z <= T.z1; z += 1.1) {
          if (!hasCeil(8, x, z) || r() < 0.3) continue;
          corn.push([x + (r() - 0.5) * 0.5, ceil(8) - 0.2, z + (r() - 0.5) * 0.5, r() * 3, 0.75 + r() * 0.4]);
        }
      }
      this.instanced(card, M.corn, corn);
    }
    // las cadenas de los calabozos altos (piso 11), colgando de las vigas
    const links = [];
    for (let k = 0; k < 9; k++) links.push(new THREE.TorusGeometry(0.045, 0.012, 4, 8).rotateY(k % 2 ? Math.PI / 2 : 0).translate(0, -0.07 - k * 0.12, 0));
    const chainGeo = mergeGeometries(links);
    const chains = [];
    for (const z of [22.5, 37.5]) {
      for (let x = T.x0 + 1; x <= T.x1; x += 1.6) {
        if (!hasCeil(11, x, z) || r() < 0.3) continue;
        chains.push([x + (r() - 0.5) * 0.4, ceil(11) - 0.48, z + (r() - 0.5) * 0.2, r() * 3, 0.6 + r() * 0.6]);
      }
    }
    this.instanced(chainGeo, M.iron, chains);
    // las chapas del galpón del viento (piso 6): cuelgan de alambres y se hamacan
    this.sheets = [];
    const sheetGeo = new THREE.PlaneGeometry(0.9, 1.4, 1, 1).translate(0, -0.9, 0);
    const wireGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.2, 3).translate(0, -0.1, 0);
    const tin = M.roofTin || M.metal;
    for (const [x, z] of [[20.5, 23.5], [23.5, 20.5], [36.5, 20.5], [39.5, 23.5], [39.5, 36.5], [36.5, 39.5], [20.5, 36.5], [23.5, 39.5]]) {
      if (!hasCeil(6, x, z)) continue;
      const g = new THREE.Group();
      g.position.set(x, ceil(6) - 0.2, z);
      g.rotation.y = r() * 3;
      g.add(new THREE.Mesh(wireGeo, M.iron), new THREE.Mesh(sheetGeo, tin));
      w.root.add(g);
      this.sheets.push({ g, ph: r() * 6, k: 0.6 + r() * 0.6 });
    }
    this.bangT = 3;
    // el santo sin cara de la capilla torcida (piso 13): mira para abajo
    this.buildSaint(new THREE.Vector3(30, this.yOf(12), 40.9));
  }

  // Muchas copias de una pieza: [x, y, z, giro, escala].
  instanced(geo, mat, list) {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach(([x, y, z, a, s], i) => {
      q.setFromAxisAngle(UPV, a);
      m4.compose(tmpV3.set(x, y, z), q, tmpS.set(s, s, s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    this.w.root.add(im);
  }

  // Un santo de yeso sobre su pedestal, torcido, con la cabeza gacha y sin cara.
  buildSaint(at) {
    const M = this.w.M;
    const stone = M.marble || M.stone;
    const g = new THREE.Group();
    g.position.copy(at);
    // mira al norte (hacia la capilla) y se venció para un costado
    g.rotation.set(0, Math.PI, 0.13);
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    add(new THREE.BoxGeometry(0.9, 0.9, 0.7), stone, 0, 0.45, 0);
    add(new THREE.BoxGeometry(1, 0.1, 0.8), stone, 0, 0.95, 0);
    // el manto: largo hasta los pies
    add(new THREE.CylinderGeometry(0.2, 0.36, 1.3, 12), stone, 0, 1.65, 0);
    add(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 2.28, 0);
    // la cabeza gacha, lisa (sin cara), con la aureola de lata torcida
    add(new THREE.SphereGeometry(0.13, 12, 10), stone, 0, 2.5, 0.08, 0.5);
    add(new THREE.TorusGeometry(0.2, 0.012, 4, 20), M.brass || M.metal, 0, 2.62, -0.02, 0.9, 0.3);
    // las manos juntas
    add(new THREE.BoxGeometry(0.1, 0.16, 0.1), stone, 0, 2.02, 0.22, -0.4);
    this.w.root.add(g);
    this.w.addBox([at.x - 0.5, at.y, at.z - 0.4, at.x + 0.5, at.y + 2.7, at.z + 0.4], { kind: 'prop' });
  }

  // Las chapas se hamacan con el viento y, de vez en cuando, golpean.
  updateSheets(dt, t) {
    if (!this.sheets?.length) return;
    for (const s of this.sheets) {
      const gust = Math.max(0, Math.sin(t * 0.37 + s.ph)) ** 3;
      s.g.rotation.x = Math.sin(t * 1.3 * s.k + s.ph) * (0.12 + gust * 0.45);
      s.g.rotation.z = Math.sin(t * 0.9 + s.ph * 2) * 0.08;
    }
    // un golpe de chapa si hay alguien en el galpón
    const g = this.w.g;
    if (g.state !== 'playing' || this.levelOf(g.player.pos.y) !== 5) return;
    this.bangT -= dt;
    if (this.bangT > 0) return;
    this.bangT = 3 + Math.random() * 6;
    const s = this.sheets[Math.floor(Math.random() * this.sheets.length)];
    tinBang(g.audio, s.g.getWorldPosition(tmpV3).clone());
  }

  // ---------------- la escalera divina ----------------
  // Una espiral de escalones de oro transparentes alrededor del eje de la
  // torre, que sube desde la plaza del piso 15 hasta el ojo de la tormenta.
  buildSkyStair() {
    const w = this.w;
    const T = this.T;
    const S = T.sky;
    const base = this.yOf(this.L - 1);
    const perTurn = 26;
    const count = Math.round(S.turns * perTurn);
    const geo = new THREE.BoxGeometry(1, 0.12, 1);
    this.skySteps = [];
    const group = new THREE.Group();
    for (let k = 0; k < count; k++) {
      const u = (k + 0.5) / perTurn;
      const a = S.a0 + u * Math.PI * 2;
      const rm = (S.r0 + S.r1) / 2;
      const m = new THREE.Mesh(geo, w.M.goldGlass);
      m.scale.set(S.r1 - S.r0, 1, ((Math.PI * 2 * rm) / perTurn) * 1.08);
      m.position.set(T.cx + Math.cos(a) * rm, base + u * S.pitch, T.cz + Math.sin(a) * rm);
      m.rotation.y = -a;
      m.userData.home = m.position.clone();
      group.add(m);
      this.skySteps.push(m);
    }
    // la luz que baja por el medio
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 4.2, 80, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.set(T.cx, base + 40, T.cz);
    group.add(beam);
    this.skyBeam = beam;
    group.visible = false;
    w.root.add(group);
    this.skyGroup = group;
    this.skyTop = base + S.turns * S.pitch;
  }

  // 'hidden' | 'locked' (se ve pero no se pisa) | 'open' | 'broken'
  setSky(state) {
    if (this.skyState === state) return;
    this.skyState = state;
    this.skyGroup.visible = state !== 'hidden';
    this.skyShow = state === 'hidden' ? 0 : this.skyShow || 0;
    if (state === 'broken') {
      this.skySteps.forEach((m) => {
        m.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6);
        m.userData.spin = new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5);
      });
    }
  }

  // Altura de la escalera divina bajo (x, z) para algo a la altura y (o -Infinity).
  skyFloor(x, z, y) {
    if (this.skyState !== 'open') return -Infinity;
    const T = this.T;
    const S = T.sky;
    const dx = x - T.cx;
    const dz = z - T.cz;
    const r = Math.hypot(dx, dz);
    if (r < S.r0 || r > S.r1) return -Infinity;
    const base = this.yOf(this.L - 1);
    let a = Math.atan2(dz, dx) - S.a0;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let best = -Infinity;
    for (let k = 0; k < S.turns + 1; k++) {
      const u = a / (Math.PI * 2) + k;
      if (u > S.turns) break;
      const h = base + u * S.pitch + 0.06;
      if (h <= y + STEP && h > best) best = h;
    }
    return best;
  }

  // ---------------- cada cuadro ----------------
  update(dt, t) {
    // en la caverna del Infierno no va el remolino: la cortina de afuera la
    // cruzaba por la mitad (adentro de la roca no se ve nada de afuera igual)
    const A = this.T.arena;
    const cam = this.w.g.camera?.position;
    const inCave = !!(A && cam && Math.hypot(cam.x - A.x, cam.z - A.z) < A.r + 5 && cam.y < (A.y || 0) + 18);
    for (const m of this.vortex) {
      m.visible = !inCave;
      m.material.uniforms.uTime.value = t;
      m.material.uniforms.uFlash.value = this.w.g.weather?.flash || 0;
    }
    this.debris.material.uniforms.uTime.value = t;
    this.debris.material.uniforms.uScale.value = this.w.g.renderer ? this.w.g.renderer.getDrawingBufferSize(tmpV2).y * 0.5 : 300;
    const st = this.storm.material.uniforms;
    st.uTime.value = t;
    st.uOpen.value += ((this.skyOpenK || 0) - st.uOpen.value) * Math.min(1, dt * 0.8);
    st.uHurt.value = Math.max(0, st.uHurt.value - dt * 0.6);
    this.eye.material.color.set(0xc8a0ff).lerp(new THREE.Color(0xffd070), st.uOpen.value);
    this.eye.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.2;
    this.updateLights(dt);
    this.updateSheets(dt, t);
    this.decor?.update(t);
    this.llano?.update(dt, t);
    this.sightings?.update(dt);
    // la escalera divina: aparece de a poco, brilla y, rota, se cae a pedazos
    if (this.skyState !== 'hidden') {
      this.skyShow = Math.min(1, (this.skyShow || 0) + dt * 0.35);
      const k = this.skyShow;
      this.skySteps.forEach((m, i) => {
        if (this.skyState === 'broken') {
          const v = m.userData.vel;
          v.y -= 12 * dt;
          m.position.addScaledVector(v, dt);
          m.rotation.x += m.userData.spin.x * dt;
          m.rotation.z += m.userData.spin.z * dt;
          return;
        }
        const on = k * this.skySteps.length > i ? 1 : 0;
        m.visible = !!on;
      });
      this.skyBeam.material.opacity = this.skyState === 'broken' ? Math.max(0, this.skyBeam.material.opacity - dt * 0.2) : 0.1 + Math.sin(t * 2) * 0.03;
      this.w.M.goldGlass.emissiveIntensity = this.skyState === 'locked' ? 0.35 + Math.sin(t * 3) * 0.1 : 0.9 + Math.sin(t * 2) * 0.15;
      this.w.M.goldGlass.opacity = this.skyState === 'locked' ? 0.3 : 0.55;
    }
  }

  // El cañonazo le pega a la Voz: el ojo destella.
  hurtEye(k = 1) {
    this.storm.material.uniforms.uHurt.value = k;
  }

  dispose() {
    for (const L of this.lightPool || []) L.removeFromParent();
    for (const L of this.cineLights || []) L.removeFromParent();
    this.sightings?.dispose();
  }
}

const tmpV2 = new THREE.Vector2();
const tmpV3 = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const IDQ = new THREE.Quaternion();

// Un golpe de chapa suelta (el galpón del viento).
function tinBang(A, pos) {
  if (!A?.ctx || !A.out) return;
  const o = A.out({ pos, gain: 0.9, reverb: 0.5, ref: 4 });
  const t = A.now;
  A.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 1400, freqEnd: 600, q: 2, gain: 0.8 });
  for (const f of [173, 241, 389]) A.tone(o, { t, dur: 0.7, type: 'square', freq: f, freqEnd: f * 0.97, gain: 0.06 });
}

// Rosa de los vientos en mosaico calcáreo (las plazas de los pisos sin agujero).
function rosaTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#d8cdb8';
  x.fillRect(0, 0, 512, 512);
  // guarda
  x.strokeStyle = '#6a2a1e';
  x.lineWidth = 18;
  x.strokeRect(14, 14, 484, 484);
  x.strokeStyle = '#2a3a4a';
  x.lineWidth = 6;
  x.strokeRect(34, 34, 444, 444);
  x.translate(256, 256);
  for (const [r, col] of [[210, '#e8dfcc'], [196, '#2a3a4a'], [188, '#e8dfcc']]) {
    x.fillStyle = col;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
  }
  // puntas de la rosa
  const star = (n, R, r0, a0, c1, c2) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      for (const [s, col] of [[1, c1], [-1, c2]]) {
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        x.lineTo(Math.cos(a + (s * Math.PI) / n) * r0, Math.sin(a + (s * Math.PI) / n) * r0);
        x.closePath();
        x.fill();
      }
    }
  };
  star(8, 150, 38, Math.PI / 8, '#7a6a4a', '#a8946a');
  star(4, 184, 44, -Math.PI / 2, '#6a2a1e', '#8a3a28');
  x.fillStyle = '#c8a040';
  x.beginPath();
  x.arc(0, 0, 22, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#2a1a0e';
  x.font = 'bold 34px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('N', 0, -208 + 12);
  x.fillText('S', 0, 208 - 12);
  x.fillText('E', 208 - 12, 0);
  x.fillText('O', -208 + 12, 0);
  const t = toTexture(c, { repeat: false });
  return t;
}
