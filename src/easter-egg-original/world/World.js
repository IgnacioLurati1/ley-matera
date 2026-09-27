import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import GeoBuilder from './GeoBuilder';
import { buildProp, mesh, cylGeo } from './props';
import { rng } from '../core/noise';
import { MAP_W, MAP_H, WALL_H, ZONES, DOORS, WINDOWS, PROPS, LIGHTS } from '../config/map';
import { buildAttic, blockStairCells, floorAt, inStair, STAIR } from './Attic';

export const CELL = { OUT: 0, FLOOR: 1, WALL: 2, DOOR: 3, WINDOW: 4 };
const SILL = 0.95;
const HEAD = 2.35;
const DOOR_H = 2.7;
const SURFACE = { planks: 'wood', parquet: 'wood', planksDark: 'wood', dirt: 'dirt', dirtDark: 'dirt', calcareo: 'tile', terracotta: 'tile', concrete: 'concrete' };

// Mapa: grilla, arquitectura, utilería, luces, cielo; colisiones y rayos.
export default class World {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.T = game.textures;
    this.W = MAP_W;
    this.H = MAP_H;
    this.zoneKeys = Object.keys(ZONES);
    this.boxes = [];
    this.cellBoxes = Array.from({ length: MAP_W * MAP_H }, () => []);
    this.dynamic = { flywheels: [], lamps: [], kilnGlow: null, candles: null, bucket: null };
    this.lights = [];
    this.power = false;
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  build() {
    this.makeMaterials();
    this.makeGrid();
    this.buildArchitecture();
    this.attic = buildAttic(this);
    this.buildProps();
    this.buildOutside();
    this.buildSky();
    this.buildLights();
    this.computeNavBlock();
  }

  idx(x, z) {
    return z * MAP_W + x;
  }

  inside(x, z) {
    return x >= 0 && z >= 0 && x < MAP_W && z < MAP_H;
  }

  type(x, z) {
    return this.inside(x, z) ? this.grid[this.idx(x, z)] : CELL.OUT;
  }

  zoneAt(x, z) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!this.inside(cx, cz)) return null;
    const zi = this.zone[this.idx(cx, cz)];
    return zi < 0 ? null : this.zoneKeys[zi];
  }

  surfaceAt(x, z) {
    const k = this.zoneAt(x, z);
    return k ? SURFACE[ZONES[k].floor] || 'concrete' : 'dirt';
  }

  isIndoorCell(cx, cz) {
    if (!this.inside(cx, cz)) return false;
    const t = this.grid[this.idx(cx, cz)];
    if (t === CELL.OUT) return false;
    if (t !== CELL.FLOOR) return true;
    const zk = this.zoneKeys[this.zone[this.idx(cx, cz)]];
    return !ZONES[zk].outdoor;
  }

  // Punto sobre la superficie de una pared, mirando hacia `face`.
  wallAnchor(cell, face, offset = 0) {
    const [cx, cz] = cell;
    return {
      x: cx + 0.5 + face[0] * (0.5 + offset),
      z: cz + 0.5 + face[1] * (0.5 + offset),
      rot: Math.atan2(face[0], face[1]),
    };
  }

  // ---------------- materiales ----------------
  makeMaterials() {
    const T = this.T;
    const std = (map, o = {}) =>
      new THREE.MeshStandardMaterial({
        map: map || null,
        color: o.c ?? 0xffffff,
        roughness: o.r ?? 0.92,
        metalness: o.m ?? 0,
        bumpMap: o.bump ? map : null,
        bumpScale: o.bump || 0,
        emissive: o.e ?? 0x000000,
        emissiveIntensity: o.ei ?? 1,
        transparent: !!o.t,
        opacity: o.o ?? 1,
        side: o.side ?? THREE.FrontSide,
        flatShading: !!o.flat,
      });
    const wallKeys = ['plasterGreen', 'plasterBlue', 'plasterWhite', 'plasterOffice', 'brick', 'brickSoot', 'concreteWall'];
    const M = {};
    for (const k of wallKeys) M[k] = std(T[k], { bump: 1.2 });
    for (const k of ['planks', 'planksDark', 'parquet', 'dirt', 'dirtDark', 'concrete', 'calcareo', 'terracotta', 'corrugated']) {
      M[k] = std(T[k], { bump: 1, r: k === 'calcareo' || k === 'terracotta' ? 0.7 : 0.92 });
    }
    M.exterior = std(T.brick, { c: 0x9a8f86, bump: 1.2 });
    M.wallTop = std(T.concrete, { c: 0x4a4540 });
    M.trim = std(T.planksDark, { c: 0x9a7a5a });
    M.beam = std(T.planksDark, { c: 0x7a6048 });
    M.truss = std(T.metal, { r: 0.6, m: 0.5 });
    M.ground = std(T.ground, { bump: 1 });
    M.wood = std(T.planks);
    M.woodDark = std(T.planksDark);
    M.crate = std(T.planks, { c: 0xcaa27a });
    M.drum = std(T.metal, { c: 0x4a6aa0, r: 0.6, m: 0.4 });
    M.drumRed = std(T.metal, { c: 0xa04030, r: 0.6, m: 0.4 });
    M.metal = std(T.metal, { r: 0.55, m: 0.6 });
    M.metalGreen = std(T.metalGreen, { r: 0.6, m: 0.4 });
    M.iron = std(null, { c: 0x2a2826, r: 0.5, m: 0.8 });
    M.copper = std(null, { c: 0xb0643a, r: 0.35, m: 0.9 });
    M.brass = std(null, { c: 0xb8923a, r: 0.35, m: 0.9 });
    M.silver = std(null, { c: 0xd8d8d8, r: 0.25, m: 1 });
    M.redPaint = std(null, { c: 0x8a1f18, r: 0.6 });
    M.black = std(null, { c: 0x0a0806, r: 1 });
    M.sack = std(T.burlap);
    M.sackYerba = std(T.burlap, { c: 0xc8d0a0 });
    M.hay = std(T.burlap, { c: 0xe8cf7a });
    M.log = std(T.woodCarved, { c: 0x8a6a50 });
    M.bark = std(T.woodCarved, { c: 0x4a3a2c });
    M.leaf = std(null, { c: 0x2c4a22, flat: true, r: 1 });
    M.yerbaBranch = std(T.yerba, { c: 0xb0b890 });
    M.roofTin = std(T.corrugated, { r: 0.6, m: 0.5, side: THREE.DoubleSide });
    M.brickRound = std(T.brick, { side: THREE.DoubleSide });
    M.stone = std(T.concrete, { c: 0xb0aaa0 });
    M.stoneDark = std(T.concrete, { c: 0x3a3632, side: THREE.DoubleSide });
    M.water = std(null, { c: 0x05090c, r: 0.25, m: 0 });
    M.rope = std(null, { c: 0x8a7a5a });
    M.glassLamp = std(null, { c: 0xffe0a0, e: 0xffb050, ei: 2 });
    M.glassLampOff = std(null, { c: 0x888070, e: 0x000000, r: 0.3 });
    M.glass = std(null, { c: 0x9ab8b0, r: 0.1, t: true, o: 0.45 });
    M.glassDark = std(null, { c: 0x10161a, r: 0.1, m: 0.2 });
    M.fireGlow = std(null, { c: 0x000000, e: 0xff5a10, ei: 3 });
    M.flame = std(null, { c: 0x000000, e: 0xffc060, ei: 1.6 });
    M.candle = std(null, { c: 0xf0e8d0 });
    M.clothWhite = std(null, { c: 0xe8e0d0 });
    M.paper = std(null, { c: 0xe0d8c0 });
    M.leather = std(T.leather);
    M.tire = std(null, { c: 0x151515, r: 0.95 });
    M.truckPaint = std(T.metal, { c: 0x5d7a8a, r: 0.7, m: 0.3 });
    M.termo = std(null, { c: 0xb0201a, r: 0.35, m: 0.2 });
    M.gourd = std(T.gourd);
    M.packRed = std(null, { c: 0xb3151d });
    M.packYellow = std(null, { c: 0xf0b52c });
    M.packGreen = std(null, { c: 0x2f6a3a });
    M.packBlue = std(null, { c: 0x1e4f9c });
    M.packWhite = std(null, { c: 0xece2cc });
    this.M = M;
  }

  // ---------------- grilla ----------------
  makeGrid() {
    const n = MAP_W * MAP_H;
    this.grid = new Uint8Array(n);
    this.zone = new Int8Array(n).fill(-1);
    this.doorAt = new Int16Array(n).fill(-1);
    this.windowAt = new Int16Array(n).fill(-1);
    this.zoneKeys.forEach((k, zi) => {
      const [x0, z0, x1, z1] = ZONES[k].rect;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        this.grid[this.idx(x, z)] = CELL.FLOOR;
        this.zone[this.idx(x, z)] = zi;
      }
    });
    // paredes: toda celda exterior que toca un piso
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.grid[this.idx(x, z)] !== CELL.OUT) continue;
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (this.type(x + dx, z + dz) === CELL.FLOOR) near = true;
        }
        if (near) this.grid[this.idx(x, z)] = CELL.WALL;
      }
    }
    DOORS.forEach((d, i) => {
      for (const [x, z] of d.cells) {
        this.grid[this.idx(x, z)] = CELL.DOOR;
        this.doorAt[this.idx(x, z)] = i;
      }
    });
    WINDOWS.forEach((w, i) => {
      const [x, z] = w.cell;
      this.grid[this.idx(x, z)] = CELL.WINDOW;
      this.windowAt[this.idx(x, z)] = i;
    });
    this.doorOpen = new Uint8Array(DOORS.length);
    // cajas de colisión de la arquitectura
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.grid[this.idx(x, z)];
        if (t === CELL.WALL) this.addBox([x, 0, z, x + 1, WALL_H, z + 1], { kind: 'wall' });
        else if (t === CELL.WINDOW) {
          this.addBox([x, 0, z, x + 1, SILL, z + 1], { kind: 'wall' });
          this.addBox([x, HEAD, z, x + 1, WALL_H, z + 1], { kind: 'wall' });
          this.addBox([x, 0, z, x + 1, WALL_H, z + 1], { kind: 'window', shoot: false, window: this.windowAt[this.idx(x, z)] });
        } else if (t === CELL.DOOR) {
          this.addBox([x, DOOR_H, z, x + 1, WALL_H, z + 1], { kind: 'wall' });
          const door = this.doorAt[this.idx(x, z)];
          const b = this.addBox([x, 0, z, x + 1, DOOR_H, z + 1], { kind: 'door', door });
          (DOORS[door].boxes ||= []).push(b);
        }
      }
    }
  }

  addBox(b, { kind = 'prop', solid = true, shoot = true, ...extra } = {}) {
    const box = { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], kind, solid, shoot, active: true, ...extra };
    this.boxes.push(box);
    const cx0 = Math.max(0, Math.floor(box.x0));
    const cx1 = Math.min(MAP_W - 1, Math.floor(box.x1 - 1e-4));
    const cz0 = Math.max(0, Math.floor(box.z0));
    const cz1 = Math.min(MAP_H - 1, Math.floor(box.z1 - 1e-4));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) this.cellBoxes[this.idx(x, z)].push(box);
    return box;
  }

  // Celdas que los zombies no pueden pisar (paredes, utilería, puertas cerradas).
  computeNavBlock() {
    const n = MAP_W * MAP_H;
    this.navBlock = new Uint8Array(n);
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = this.idx(x, z);
        const t = this.grid[i];
        if (t === CELL.DOOR) {
          this.navBlock[i] = this.doorOpen[this.doorAt[i]] ? 0 : 1;
          continue;
        }
        if (t !== CELL.FLOOR) {
          this.navBlock[i] = 1;
          continue;
        }
        const cx = x + 0.5;
        const cz = z + 0.5;
        for (const b of this.cellBoxes[i]) {
          if (!b.active || !b.solid || b.y0 > 1) continue;
          if (cx > b.x0 - 0.2 && cx < b.x1 + 0.2 && cz > b.z0 - 0.2 && cz < b.z1 + 0.2) {
            this.navBlock[i] = 1;
            break;
          }
        }
      }
    }
    // la escalera del altillo: abajo es la rampa, no se camina por ahí
    blockStairCells(this);
    this.navVersion = (this.navVersion || 0) + 1;
  }

  // Altura del piso bajo (x, z) para algo que está a la altura y (el altillo).
  floorAt(x, z, y = 0) {
    return floorAt(x, z, y);
  }

  openDoor(i) {
    this.doorOpen[i] = 1;
    for (const b of DOORS[i].boxes) b.active = false;
    this.computeNavBlock();
  }

  // ---------------- arquitectura ----------------
  buildArchitecture() {
    const gb = new GeoBuilder();
    const H = WALL_H;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const isWallish = (t) => t === CELL.WALL || t === CELL.DOOR || t === CELL.WINDOW;
    const face = (key, cx, cz, n, y0, y1) => {
      const right = [n[1], -n[0]];
      const mx = cx + 0.5 + n[0] * 0.5;
      const mz = cz + 0.5 + n[1] * 0.5;
      const lx = mx - right[0] * 0.5;
      const lz = mz - right[1] * 0.5;
      const rx = mx + right[0] * 0.5;
      const rz = mz + right[1] * 0.5;
      const uOff = lx * right[0] + lz * right[1];
      gb.wall(key, lx, lz, rx, rz, y0, y1, [n[0], 0, n[1]], H, uOff);
    };
    const wallMatFor = (nx, nz) => {
      const t = this.type(nx, nz);
      if (t === CELL.FLOOR) return ZONES[this.zoneKeys[this.zone[this.idx(nx, nz)]]].wall;
      return 'exterior';
    };
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.type(x, z);
        if (!isWallish(t)) continue;
        for (const n of dirs) {
          const nx = x + n[0];
          const nz = z + n[1];
          const nt = this.type(nx, nz);
          if (t === CELL.WALL) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) face(wallMatFor(nx, nz), x, z, n, 0, H);
            else if (nt === CELL.DOOR) face('trim', x, z, n, 0, DOOR_H);
            else if (nt === CELL.WINDOW) face('trim', x, z, n, SILL, HEAD);
          } else if (t === CELL.WINDOW) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) {
              const k = wallMatFor(nx, nz);
              face(k, x, z, n, 0, SILL);
              face(k, x, z, n, HEAD, H);
            }
          } else if (t === CELL.DOOR) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) face(wallMatFor(nx, nz), x, z, n, DOOR_H, H);
          }
        }
        gb.flat('wallTop', x, z, x + 1, z + 1, H, true);
        if (t === CELL.WINDOW) {
          gb.flat('trim', x, z, x + 1, z + 1, SILL, true, 1);
          gb.flat('trim', x, z, x + 1, z + 1, HEAD, false, 1);
        }
        if (t === CELL.DOOR) {
          const d = DOORS[this.doorAt[this.idx(x, z)]];
          gb.flat(ZONES[d.zones[0]].floor, x, z, x + 1, z + 1, 0.001, true);
          gb.flat('trim', x, z, x + 1, z + 1, DOOR_H, false, 1);
        }
      }
    }
    // pisos, techos y vigas
    for (const k of this.zoneKeys) {
      const Z = ZONES[k];
      const [x0, z0, x1, z1] = Z.rect;
      gb.flat(Z.floor, x0, z0, x1 + 1, z1 + 1, 0.001, true);
      if (Z.outdoor) continue;
      if (k === 'H') {
        // la oficina tiene el hueco de la escalera del altillo y no lleva vigas
        gb.flat(Z.ceil, x0, z0, STAIR.x0, z1 + 1, H, false);
        gb.flat(Z.ceil, STAIR.x0, z0, x1 + 1, STAIR.z0, H, false);
        continue;
      }
      gb.flat(Z.ceil, x0, z0, x1 + 1, z1 + 1, H, false);
      const alongX = x1 - x0 < z1 - z0;
      const metal = Z.ceil === 'corrugated';
      const key = metal ? 'truss' : 'beam';
      if (alongX) {
        for (let z = z0 + 1.5; z < z1; z += 2.4) gb.box(key, x0, H - 0.26, z - 0.09, x1 + 1, H, z + 0.09);
      } else {
        for (let x = x0 + 1.5; x < x1; x += 2.4) gb.box(key, x - 0.09, H - 0.26, z0, x + 0.09, H, z1 + 1);
      }
      if (metal) {
        const mid = alongX ? (x0 + x1 + 1) / 2 : (z0 + z1 + 1) / 2;
        if (alongX) gb.box('truss', mid - 0.08, H - 0.4, z0, mid + 0.08, H - 0.26, z1 + 1);
        else gb.box('truss', x0, H - 0.4, mid - 0.08, x1 + 1, H - 0.26, mid + 0.08);
      }
    }
    // marcos de ventana
    for (const w of WINDOWS) {
      const [x, z] = w.cell;
      const [ox, oz] = w.out;
      const ix = x + 0.5 - ox * 0.45;
      const iz = z + 0.5 - oz * 0.45;
      const px = oz !== 0 ? 0.5 : 0.04;
      const pz = ox !== 0 ? 0.5 : 0.04;
      gb.box('trim', ix - px, SILL - 0.06, iz - pz, ix + px, SILL + 0.02, iz + pz, 1);
      gb.box('trim', ix - px, HEAD - 0.02, iz - pz, ix + px, HEAD + 0.06, iz + pz, 1);
    }
    const arch = gb.build(this.M);
    this.root.add(arch);
  }

  // ---------------- utilería ----------------
  buildProps() {
    const merged = new Map();
    const addStatic = (obj) => {
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        let p = o;
        while (p) {
          if (p.userData.dynamic) return;
          p = p.parent;
        }
        let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (g.index) g = g.toNonIndexed();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
        const list = merged.get(o.material) || [];
        list.push(g);
        merged.set(o.material, list);
      });
    };
    PROPS.forEach((def, i) => {
      const res = buildProp(def, this.M, 1000 + i * 17);
      if (!res) return;
      for (const b of res.boxes) this.addBox(b, { kind: 'prop' });
      addStatic(res.obj);
      // partes animadas: quedan como objetos propios
      const dyn = [];
      res.obj.traverse((o) => {
        if (o.userData.dynamic) dyn.push(o);
      });
      for (const d of dyn) {
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        d.getWorldPosition(wp);
        d.getWorldQuaternion(wq);
        d.removeFromParent();
        d.position.copy(wp);
        d.quaternion.copy(wq);
        this.root.add(d);
        if (d.name === 'flywheel') this.dynamic.flywheels.push(d);
        else if (d.name === 'kilnGlow') this.dynamic.kilnGlow = d;
        else if (d.name === 'candles') this.dynamic.candles = d;
        else this.dynamic.lamps.push(d);
      }
      res.obj.traverse((o) => {
        if (o.name === 'bucket') this.dynamic.bucketPos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      });
    });
    this.addStatic = addStatic;
    this.mergedProps = merged;
  }

  // Llamado al final (después de que las máquinas agregan su parte estática).
  finalizeStatic() {
    for (const [mat, list] of this.mergedProps) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.root.add(m);
      list.forEach((x) => x.dispose());
    }
    this.mergedProps.clear();
  }

  // ---------------- exterior ----------------
  buildOutside() {
    const T = this.T;
    T.ground.repeat.set(1, 1);
    const size = 240;
    const g = new THREE.PlaneGeometry(size, size);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 2, uv.getY(i) * size / 2);
    const ground = new THREE.Mesh(g, this.M.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(MAP_W / 2, -0.01, MAP_H / 2);
    ground.receiveShadow = true;
    this.root.add(ground);
    // monte misionero alrededor del molino
    const r = rng(77);
    const count = 150;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.3, 1, 6), this.M.bark, count);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.M.leaf, count * 3);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let n = 0;
    let k = 0;
    while (n < count) {
      const x = -30 + r() * (MAP_W + 60);
      const z = -30 + r() * (MAP_H + 60);
      if (x > 0 && x < MAP_W && z > 0 && z < MAP_H) continue;
      const h = 5 + r() * 7;
      p.set(x, h / 2, z);
      s.set(1 + r(), h, 1 + r());
      m4.compose(p, q, s);
      trunk.setMatrixAt(n, m4);
      for (let j = 0; j < 3; j++) {
        const cs = 1.8 + r() * 2.4;
        p.set(x + (r() - 0.5) * 2.5, h + (r() - 0.2) * 2, z + (r() - 0.5) * 2.5);
        s.set(cs, cs * 0.75, cs);
        m4.compose(p, q, s);
        crown.setMatrixAt(k++, m4);
      }
      n++;
    }
    trunk.castShadow = crown.castShadow = true;
    this.root.add(trunk, crown);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCloud: { value: 0.15 },
        uFlash: { value: 0 },
        uBlood: { value: 0 },
        uFogAmt: { value: 0 },
        uFogColor: { value: new THREE.Color(0x0b0d14) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime, uCloud, uFlash, uBlood, uFogAmt; uniform vec3 uFogColor;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          float h = vDir.y;
          vec3 horizon = mix(vec3(0.10,0.07,0.09), vec3(0.22,0.04,0.03), uBlood);
          vec3 zenith = mix(vec3(0.012,0.018,0.04), vec3(0.05,0.01,0.012), uBlood);
          vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.55, h));
          // resplandor rojizo tipo BO1 en el horizonte
          col += mix(vec3(0.16,0.04,0.02), vec3(0.35,0.05,0.02), uBlood) * pow(1.0 - abs(h), 12.0);
          vec3 cell = floor(vDir * 180.0);
          float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.4, h);
          star *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.0) * 30.0);
          // nubes que tapan las estrellas y se iluminan con los relámpagos
          vec2 cp = vDir.xz / (h + 0.25) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
          float cl = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.2, fbm(cp)) * smoothstep(-0.02, 0.15, h);
          col += vec3(star) * (1.0 - cl);
          vec3 cloudCol = mix(vec3(0.045, 0.045, 0.055), vec3(0.09, 0.02, 0.02), uBlood);
          col = mix(col, cloudCol, cl * 0.9);
          col += uFlash * (vec3(0.35, 0.4, 0.55) * (0.4 + cl * 1.2)) * smoothstep(-0.1, 0.3, h);
          col = mix(col, uFogColor, uFogAmt * (1.0 - smoothstep(0.0, 0.7, h) * 0.5));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.position.set(MAP_W / 2, 0, MAP_H / 2);
    sky.renderOrder = -1;
    this.sky = sky;
    this.root.add(sky);
    // luna
    const moonDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
    const moonMat = new THREE.SpriteMaterial({ map: this.T.dot, color: 0xdfe8ff, fog: false, depthWrite: false, transparent: true });
    const moon = new THREE.Sprite(moonMat);
    moon.scale.set(22, 22, 1);
    moon.position.copy(moonDir).multiplyScalar(260).add(new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2));
    this.root.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.dot, color: 0x5a6a90, fog: false, depthWrite: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
    halo.scale.set(80, 80, 1);
    halo.position.copy(moon.position);
    this.root.add(halo);
    this.moonDir = moonDir;
    this.moonSprite = moon;
    this.moonHalo = halo;
  }

  // ---------------- luces ----------------
  buildLights() {
    const s = this.scene;
    // el color de abajo ilumina techos y vigas: que se lean aunque no haya luz
    this.hemi = new THREE.HemisphereLight(0x4a5a80, 0x6e5238, 0.95);
    s.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x505060, 0.5);
    s.add(this.ambient);
    const moon = new THREE.DirectionalLight(0x9fb4ff, 0.9);
    moon.position.copy(this.moonDir).multiplyScalar(60).add(new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2));
    moon.target.position.set(MAP_W / 2, 0, MAP_H / 2);
    moon.castShadow = true;
    const sc = moon.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 140;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.04;
    s.add(moon, moon.target);
    this.moon = moon;

    const bulbGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const shadeGeo = new THREE.ConeGeometry(0.28, 0.2, 16, 1, true);
    for (const L of LIGHTS) {
      const light = new THREE.PointLight(L.color, L.intensity, 22, 1.7);
      light.position.set(...L.pos);
      s.add(light);
      const entry = { def: L, light, base: L.intensity, phase: Math.random() * 100, bulb: null };
      if (!L.kind) {
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: L.color, emissiveIntensity: 3 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(...L.pos);
        const shade = new THREE.Mesh(shadeGeo, this.M.metalGreen);
        shade.position.set(L.pos[0], L.pos[1] + 0.1, L.pos[2]);
        const wire = mesh(cylGeo(0.006, 0.006, WALL_H - L.pos[1], 4), this.M.black, L.pos[0], (WALL_H + L.pos[1]) / 2 + 0.1, L.pos[2]);
        this.root.add(bulb, shade, wire);
        entry.bulb = bulb;
      }
      this.lights.push(entry);
    }
    this.setPower(false);
  }

  // Luna tapada por nubes o teñida de rojo (clima).
  setMoon(cloud, blood) {
    if (!this.moonSprite) return;
    const vis = 1 - cloud * 0.75;
    this.moonSprite.material.color.setRGB(0.87 + blood * 0.13, 0.9 - blood * 0.62, 1 - blood * 0.72).multiplyScalar(vis);
    this.moonHalo.material.color.setRGB(0.35 + blood * 0.45, 0.42 - blood * 0.3, 0.56 - blood * 0.45);
    this.moonHalo.material.opacity = 0.35 * vis + blood * 0.2;
    this.moonBase = 0.9 * (1 - cloud * 0.45);
    this.blood = blood;
  }

  // Destello de un relámpago: la luna se vuelve un flash blanco que entra por las ventanas.
  setFlash(k, blood = 0) {
    if (!this.moon) return;
    const base = this.moonBase ?? 0.9;
    this.moon.intensity = base + k * 6;
    this.moon.color.setRGB(0.62 + k * 0.38 + blood * 0.3, 0.7 + k * 0.3 - blood * 0.45, 1 - blood * 0.55);
    this.hemi.intensity = 0.9 + k * 1.6;
    this.hemi.color.setRGB(0.29 + blood * 0.2, 0.35 - blood * 0.18, 0.5 - blood * 0.3);
  }

  setPower(on) {
    this.power = on;
    for (const e of this.lights) {
      const L = e.def;
      if (L.emergency) e.light.color.set(on ? L.color : 0xff2a1a);
      e.target = on ? e.base : e.base * L.noPower;
      if (e.bulb) e.bulb.material.emissiveIntensity = on ? 3 : L.noPower * 3;
    }
    for (const l of this.dynamic.lamps) l.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = on ? 2.5 : 1.2; });
  }

  update(dt, t) {
    if (this.sky) this.sky.material.uniforms.uTime.value = t;
    for (const e of this.lights) {
      const L = e.def;
      let k = 1;
      if (L.kind === 'fire') k = 0.75 + 0.25 * Math.sin(t * 13 + e.phase) * Math.sin(t * 7.3) + Math.random() * 0.12;
      else if (L.kind === 'candle') k = 0.85 + 0.15 * Math.sin(t * 9 + e.phase) + Math.random() * 0.05;
      else if (!this.power && L.emergency) k = 0.6 + 0.4 * Math.sin(t * 2.2);
      else if (!this.power) {
        // bombitas que titilan cuando no hay luz
        const f = Math.sin(t * 0.9 + e.phase) + Math.sin(t * 2.7 + e.phase * 3);
        k = f > 1.55 ? 0.15 + Math.random() * 0.4 : 1;
      }
      e.light.intensity = (e.target ?? e.base) * k;
      if (e.bulb && !L.kind) e.bulb.material.emissiveIntensity = 3 * k * (this.power ? 1 : L.noPower);
    }
    if (this.dynamic.kilnGlow) this.dynamic.kilnGlow.material.emissiveIntensity = 2.5 + Math.sin(t * 11) * 0.6 + Math.random() * 0.4;
    if (this.power) for (const w of this.dynamic.flywheels) w.rotateX(dt * 9);
  }

  // ---------------- colisiones ----------------
  // Empuja un círculo (x,z,radio) fuera de las cajas sólidas entre y0 e y1.
  collide(pos, radius, y0, y1, opts = {}) {
    const cx = Math.floor(pos.x);
    const cz = Math.floor(pos.z);
    for (let pass = 0; pass < 2; pass++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (!this.inside(x, z)) continue;
          for (const b of this.cellBoxes[this.idx(x, z)]) {
            if (!b.active || !b.solid) continue;
            if (opts.ignoreWindows && b.kind === 'window') continue;
            if (b.y1 <= y0 || b.y0 >= y1) continue;
            const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
            const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
            const ddx = pos.x - nx;
            const ddz = pos.z - nz;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 >= radius * radius) continue;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              pos.x += (ddx / d) * (radius - d);
              pos.z += (ddz / d) * (radius - d);
            } else {
              // centro adentro de la caja: salir por el lado más cercano
              const pen = [pos.x - b.x0, b.x1 - pos.x, pos.z - b.z0, b.z1 - pos.z];
              const m = Math.min(...pen);
              if (m === pen[0]) pos.x = b.x0 - radius;
              else if (m === pen[1]) pos.x = b.x1 + radius;
              else if (m === pen[2]) pos.z = b.z0 - radius;
              else pos.z = b.z1 + radius;
            }
          }
        }
      }
    }
    return pos;
  }

  // Rayo contra la arquitectura/utilería. Devuelve distancia (o Infinity) y
  // completa hit.point / hit.normal / hit.box.
  raycast(o, d, maxT, hit = {}) {
    let best = maxT;
    let bestBox = null;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    // piso
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t < best) {
        best = t;
        nx = 0;
        ny = 1;
        nz = 0;
        bestBox = 'floor';
      }
    }
    // techo (solo si ese punto está bajo techo)
    if (d.y > 1e-6 && o.y < WALL_H) {
      const t = (WALL_H - o.y) / d.y;
      if (t < best) {
        const px = o.x + d.x * t;
        const pz = o.z + d.z * t;
        if (this.isIndoorCell(Math.floor(px), Math.floor(pz)) && !inStair(px, pz)) {
          best = t;
          nx = 0;
          ny = -1;
          nz = 0;
          bestBox = 'ceiling';
        }
      }
    }
    // DDA por celdas en XZ
    let cx = Math.floor(o.x);
    let cz = Math.floor(o.z);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (d.x || 1e-9));
    const tdz = Math.abs(1 / (d.z || 1e-9));
    let tmx = d.x > 0 ? (cx + 1 - o.x) * tdx : (o.x - cx) * tdx;
    let tmz = d.z > 0 ? (cz + 1 - o.z) * tdz : (o.z - cz) * tdz;
    let tEnter = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let steps = 0; steps < 400; steps++) {
      if (tEnter > best) break;
      if (this.inside(cx, cz)) {
        for (const b of this.cellBoxes[this.idx(cx, cz)]) {
          if (!b.active || !b.shoot || seen.has(b)) continue;
          seen.add(b);
          const r = rayBox(o, d, b);
          if (r && r.t < best && r.t >= 0) {
            best = r.t;
            nx = r.nx;
            ny = r.ny;
            nz = r.nz;
            bestBox = b;
          }
        }
      } else if (cx < -2 || cz < -2 || cx > MAP_W + 2 || cz > MAP_H + 2) break;
      if (tmx < tmz) {
        tEnter = tmx;
        tmx += tdx;
        cx += stepX;
      } else {
        tEnter = tmz;
        tmz += tdz;
        cz += stepZ;
      }
    }
    if (best >= maxT) return Infinity;
    hit.t = best;
    hit.box = bestBox;
    hit.normal = hit.normal || new THREE.Vector3();
    hit.normal.set(nx, ny, nz);
    hit.point = hit.point || new THREE.Vector3();
    hit.point.set(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
    return best;
  }

  // ¿Hay línea de visión entre dos puntos?
  clear(a, b) {
    const d = this._tmpD || (this._tmpD = new THREE.Vector3());
    d.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return this.raycast(a, d, len - 0.05, this._tmpHit || (this._tmpHit = {})) === Infinity;
  }
}

// Rayo vs caja alineada (slabs). Devuelve { t, nx, ny, nz } o null.
export function rayBox(o, d, b) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  const lo = [b.x0, b.y0, b.z0];
  const hi = [b.x1, b.y1, b.z1];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < lo[i] || oo[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - oo[i]) / dd[i];
    let t2 = (hi[i] - oo[i]) / dd[i];
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, nx: -d.x, ny: -d.y, nz: -d.z };
  return { t: tmin, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
}

export { SILL, HEAD, DOOR_H };
