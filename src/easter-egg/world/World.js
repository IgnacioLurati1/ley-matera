import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import GeoBuilder from './GeoBuilder';
import { buildProp, mesh, cylGeo } from './props';
import { rng } from '../core/noise';
import { MAP_W, MAP_H, WALL_H, ZONES, DOORS, WINDOWS, PROPS, LIGHTS, FEATURES, SKY, MAP_ID, zoneRects, PLAYER_START, START_ZONE } from '../config/map';
import { buildRoofs } from './Roofs';
import { farmTextures, penalTextures } from '../core/textures';
import { buildAttic, blockStairCells, floorAt, inStair, STAIR } from './Attic';
import { buildFarmOutside, buildFences } from './Farm';
import { registerPenalProps } from './penalProps';
import { registerMolinoProps } from './molinoProps';
import { EDGE_RAIL, EDGE_BARS, computeHeights, addLevelBoxes, buildLevelArchitecture, buildTerrain, heightAt, ceilAt, rayTerrain } from './Levels';
import Tower from './Tower';
import { castleMaterials } from './castleTextures';
import { installCastleHooks, buildCastle } from './Castle';
import { buildMountain } from './Mountain';
import { registerCastleProps } from './castleProps';
import { installEsterosHooks, buildEsteros, esterosMaterials } from './Esteros';
import { installMonumentoHooks, buildMonumento, buildMonumentoOutside } from './Monumento';
import { monumentoMaterials } from './monumentoTextures';
import { buildCastleSky } from './castleSky';
import Night from '../fx/Night';
import { ARENA } from './Arena';
import { cullFarTiles } from './foliageTiles';

export const CELL = { OUT: 0, FLOOR: 1, WALL: 2, DOOR: 3, WINDOW: 4 };
// Qué es cada celda de borde: pared, alambrado (se ve y se tira por encima) o maíz.
// En el penal también hay barandas bajas (el muelle) y rejas altas (los patios).
export const EDGE = { WALL: 0, FENCE: 1, CORN: 2, RAIL: EDGE_RAIL, BARS: EDGE_BARS };
const FENCE_H = 1.25;
const CORN_H = 2.6;
const GATE_H = 1.6;
const SILL = 0.95;
const HEAD = 2.35;
const DOOR_H = 2.7;
// lámparas del mapa prendidas a la vez (las más cercanas a la cámara; ver
// cullLights). Cada luz puntual encarece cada píxel de todo lo que se dibuja:
// según la calidad (TIER_LIGHTS); en Ultra y Épica como siempre, solo en los
// mapas con muchas (el penal)
const MAX_LIGHTS = 10;
const CULL_FROM = 13;
const TIER_LIGHTS = { perf: 3, low: 5, medium: 7, high: 10 };
// las luces de evento (adoptLight): cuántas de verdad las representan
const POOL = { perf: 2, low: 2 };
const POOL_MAX = 3;
// la capa de las adoptadas: ninguna cámara la mira, three no las cuenta
const VIRT = 30;
// rayos de "¿se ve esta lámpara?" por vuelta de cullLights (las demás, lo guardado)
const SEE_RAYS = 3;
// El pasto alto y el maíz sin luces puntuales (World.foliage): con el define
// FOLIAGE_NOPOINT el material no recorre las lámparas. En el código de las
// luces de todos los materiales (sin el define no cambia nada; NUM_POINT_LIGHTS
// no es un define: three lo reemplaza por el número en el texto)
const POINT_LOOP = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )';
if (!THREE.ShaderChunk.lights_fragment_begin.includes('FOLIAGE_NOPOINT')) {
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(POINT_LOOP, `${POINT_LOOP} && !defined( FOLIAGE_NOPOINT )`);
}
// El medio del mapa, para el sol, la luna y su sombra (la granja lo corre a la
// chacra: el matorral agrandó la grilla hacia el sur, SKY.center)
const mapCenter = () => new THREE.Vector3(SKY.center?.[0] ?? MAP_W / 2, 0, SKY.center?.[1] ?? MAP_H / 2);
const SURFACE = { planks: 'wood', parquet: 'wood', planksDark: 'wood', dirt: 'dirt', dirtDark: 'dirt', grass: 'dirt', calcareo: 'tile', terracotta: 'tile', concrete: 'concrete', snow: 'dirt', snowPave: 'dirt' };

// Mapa: grilla, arquitectura, utilería, luces, cielo; colisiones y rayos.
export default class World {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.T = game.textures;
    this.W = MAP_W;
    this.H = MAP_H;
    this.zoneKeys = Object.keys(ZONES);
    // pisos a distintas alturas (el penal); los otros mapas son planos
    this.levels = !!FEATURES.levels;
    // la torre de Revelaciones Materas: pisos apilados (world/Tower.js)
    this.tower = null;
    this.boxes = [];
    this.cellBoxes = Array.from({ length: MAP_W * MAP_H }, () => []);
    this.dynamic = { flywheels: [], fans: [], lamps: [], kilnGlow: null, candles: null, bucket: null };
    this.lights = [];
    // las luces de evento adoptadas (adoptLight) y las de verdad que las representan
    this.virt = [];
    this.pool = null;
    this.power = false;
    // luz del día: 1 atardecer, 0 noche cerrada (el molino es siempre de noche)
    this.daylight = SKY.daylight || 0;
    this.dayCur = this.daylight;
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  build() {
    this.makeMaterials();
    if (FEATURES.tower) {
      this.tower = new Tower(this);
      this.tower.build();
      this.buildProps();
      this.buildSky();
      this.buildLights();
      this.computeNavBlock();
      return;
    }
    // el castillo: la montaña, las almenas y los puentes (ganchos de Levels)
    if (FEATURES.castle) installCastleHooks(this);
    // el estero: el suelo suave, el pajonal entre zonas (world/Esteros.js)
    if (FEATURES.esteros) installEsterosHooks(this);
    // el Monumento: las calles que bajan al río y el fondo del río (world/Monumento.js)
    if (FEATURES.monumento) installMonumentoHooks(this);
    this.makeGrid();
    // (el Monumento arma su arquitectura a mano, sin la de celdas de Levels)
    if (FEATURES.monumento) buildMonumento(this);
    else if (this.levels) buildLevelArchitecture(this, DOORS);
    else this.buildArchitecture();
    if (FEATURES.attic) this.attic = buildAttic(this);
    if (FEATURES.farm) buildFences(this);
    this.buildProps();
    if (FEATURES.farm) buildFarmOutside(this);
    else if (FEATURES.castle) {
      buildMountain(this);
      buildCastle(this);
    } else if (FEATURES.esteros) buildEsteros(this);
    else if (FEATURES.monumento) buildMonumentoOutside(this);
    else if (this.levels) buildTerrain(this);
    else this.buildOutside();
    // techos de adorno (el molino)
    buildRoofs(this, MAP_ID);
    this.buildSky();
    this.buildLights();
    // el pasto alto y el maíz, sin luces puntuales en las calidades bajas
    for (const m of [this.M.reed, this.M.tussock, this.M.corn]) this.foliage(m);
    // la luz arranca donde corresponde (sol del atardecer o luna)
    if (this.sunDir) this.updateDay(0);
    this.computeNavBlock();
  }

  // El pasto alto y el maíz (miles de planos con recorte, uno encima del
  // otro) no toman las luces puntuales en Baja y Rendimiento: cada lámpara se
  // calculaba en cada píxel de cada mata y casi no se nota. Es un define del
  // material (FOLIAGE_NOPOINT): al cambiar la calidad se recompilan solo ellos.
  foliage(mat) {
    if (!mat || this.foliageMats?.includes(mat)) return;
    (this.foliageMats ||= []).push(mat);
    this.foliageQ = null;
    this.foliageSync();
  }

  foliageSync() {
    const q = this.g.settings?.quality;
    if (!this.foliageMats || q === this.foliageQ) return;
    this.foliageQ = q;
    const off = q === 'perf' || q === 'low';
    for (const m of this.foliageMats) {
      if (off === !!m.defines?.FOLIAGE_NOPOINT) continue;
      if (off) m.defines = { ...m.defines, FOLIAGE_NOPOINT: 1 };
      else delete m.defines.FOLIAGE_NOPOINT;
      m.needsUpdate = true;
    }
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

  zoneAt(x, z, y) {
    if (this.tower) return this.tower.zoneAt(x, z, y ?? this.hintY());
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
    const i = this.idx(cx, cz);
    const t = this.grid[i];
    if (t === CELL.OUT) return false;
    if (t !== CELL.FLOOR) return this.edge[i] === EDGE.WALL;
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
    // la torre usa lo de todos los mapas (cada tanda de pisos es de uno)
    if (FEATURES.penal || FEATURES.tower || FEATURES.castle || FEATURES.esteros || FEATURES.monumento) {
      penalTextures(T);
      M.stoneWall = std(T.stoneWall, { bump: 1.4 });
      M.stoneStep = std(T.stoneWall, { c: 0xa8a298, bump: 1 });
      M.cellWall = std(T.cellWall, { bump: 1.1 });
      M.whitewash = std(T.whitewash, { bump: 1.1 });
      M.damero = std(T.damero, { r: 0.6 });
      // (menos brilloso: en Baja la lámpara de Las Duchas encandilaba en el piso y las paredes)
      M.azulejo = std(T.azulejo, { r: 0.55, bump: 0.25 });
      M.rock = std(T.rock, { bump: 1.6 });
      M.grass = std(T.grass, { bump: 0.6 });
      // Phong y no Standard: el Standard reflejaba el environment del estudio
      // (manchas blancas que encandilaban); así solo brilla la luna sobre el río
      M.water = new THREE.MeshPhongMaterial({ color: 0x0e1c22, specular: 0x4a5a70, shininess: 70, transparent: true, opacity: 0.93 });
      M.rust = std(T.metal, { c: 0x8a4a28, r: 0.7, m: 0.3 });
      M.bars = std(T.metal, { c: 0x3a3632, r: 0.45, m: 0.8 });
      M.yerbaBush = std(null, { c: 0x2e4a22, flat: true, r: 1 });
      M.redCloth = std(null, { c: 0xa0181a, side: THREE.DoubleSide });
      M.whiteCloth = std(null, { c: 0xd8d0c0, side: THREE.DoubleSide });
      M.fence = std(T.planks, { c: 0xb8aa94 });
      M.fenceDark = std(T.planksDark, { c: 0x6e6252 });
    }
    if (FEATURES.farm || FEATURES.tower) {
      farmTextures(T);
      M.adobe = std(T.adobe, { bump: 1.2 });
      M.barn = std(T.barn, { bump: 1 });
      M.corrugatedWall = std(T.corrugated, { r: 0.6, m: 0.4, bump: 1 });
      M.grass = std(T.grass, { bump: 0.6 });
      M.fence = std(T.fence, { c: 0xb8aa94 });
      M.fenceDark = std(T.fence, { c: 0x6e6252 });
      M.corn = new THREE.MeshStandardMaterial({ map: T.corn, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xd8c890 });
      M.straw = std(T.burlap, { c: 0xe0c070 });
      M.silo = std(T.metal, { c: 0xb8bcc0, r: 0.45, m: 0.6 });
      M.rust = std(T.metal, { c: 0x8a4a28, r: 0.7, m: 0.3 });
      M.tractor = std(T.metal, { c: 0xb03a1c, r: 0.5, m: 0.3 });
      M.pumpkin = std(null, { c: 0xd0701a, r: 0.6 });
      M.greenLeaf = std(null, { c: 0x3a5a24, flat: true, r: 1 });
      M.yerbaBush = std(null, { c: 0x2e4a22, flat: true, r: 1 });
      M.whiteCloth = std(null, { c: 0xd8d0c0, side: THREE.DoubleSide });
      M.redCloth = std(null, { c: 0x8a2a1a, side: THREE.DoubleSide });
    }
    // el castillo: granito, nieve, lajas, hielo y pizarra (world/castleTextures.js)
    if (FEATURES.castle) castleMaterials(T, M, std);
    if (FEATURES.esteros) esterosMaterials(T, M, std);
    if (FEATURES.monumento) monumentoMaterials(T, M, std);
    this.M = M;
  }

  // ---------------- grilla ----------------
  makeGrid() {
    const n = MAP_W * MAP_H;
    this.grid = new Uint8Array(n);
    this.zone = new Int8Array(n).fill(-1);
    this.doorAt = new Int16Array(n).fill(-1);
    this.windowAt = new Int16Array(n).fill(-1);
    // alturas: piso de cada celda, terreno de afuera y alto de las paredes
    this.fy = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.top = new Float32Array(n).fill(WALL_H);
    this.rampAt = new Int16Array(n).fill(-1);
    // techo propio de un rectángulo (0 = el de la zona)
    this.roofC = new Float32Array(n);
    this.zoneKeys.forEach((k, zi) => {
      const zy = ZONES[k].y || 0;
      const set = (x, z, y = zy, roof = 0) => {
        if (!this.inside(x, z)) return;
        this.grid[this.idx(x, z)] = CELL.FLOOR;
        this.zone[this.idx(x, z)] = zi;
        this.fy[this.idx(x, z)] = y;
        this.roofC[this.idx(x, z)] = roof;
      };
      for (const [x0, z0, x1, z1, ry, rr] of zoneRects(k)) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, ry ?? zy, rr || 0);
      // zona redonda (el prado): las celdas cuyo centro cae adentro
      const C = ZONES[k].circle;
      if (C) {
        for (let z = Math.floor(C.z - C.r); z <= Math.ceil(C.z + C.r); z++) {
          for (let x = Math.floor(C.x - C.r); x <= Math.ceil(C.x + C.r); x++) if (Math.hypot(x + 0.5 - C.x, z + 0.5 - C.z) <= C.r) set(x, z);
        }
      }
    });
    // el estero: donde dos zonas de afuera se tocan queda pajonal (world/Esteros.js)
    this.seams?.(this);
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
    // borde de cada celda: si toca una zona techada es pared; si no, alambrado o maíz
    this.edge = new Uint8Array(n);
    this.owner = new Int8Array(n).fill(-1);
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = this.idx(x, z);
        if (this.grid[i] === CELL.OUT || this.grid[i] === CELL.FLOOR) continue;
        let indoor = -1;
        let corn = false;
        let fence = false;
        let rail = false;
        let bars = false;
        let solid = false;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (this.type(x + dx, z + dz) !== CELL.FLOOR) continue;
          const zi = this.zone[this.idx(x + dx, z + dz)];
          const Z = ZONES[this.zoneKeys[zi]];
          if (!Z.outdoor) indoor = zi;
          else if (Z.edge === 'corn') corn = true;
          else if (Z.edge === 'rail') rail = true;
          else if (Z.edge === 'bars') bars = true;
          else if (Z.fence) fence = true;
          else solid = true;
        }
        this.owner[i] = indoor;
        // una pared de verdad le gana a la reja, y la reja a la baranda
        if (indoor >= 0 || solid) this.edge[i] = EDGE.WALL;
        else this.edge[i] = corn ? EDGE.CORN : fence ? EDGE.FENCE : bars ? EDGE.BARS : rail ? EDGE.RAIL : EDGE.WALL;
      }
    }
    WINDOWS.forEach((w, i) => {
      const [x, z] = w.cell;
      this.grid[this.idx(x, z)] = CELL.WINDOW;
      this.windowAt[this.idx(x, z)] = i;
    });
    this.doorOpen = new Uint8Array(DOORS.length);
    if (this.levels) {
      computeHeights(this);
      addLevelBoxes(this, DOORS);
      return;
    }
    // cajas de colisión de la arquitectura
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.grid[this.idx(x, z)];
        const edge = this.edge[this.idx(x, z)];
        // alambrado: frena al que camina pero los tiros y la vista pasan por arriba
        if (t === CELL.WALL && edge === EDGE.FENCE) this.addBox([x, 0, z, x + 1, FENCE_H, z + 1], { kind: 'fence', shoot: false });
        else if (t === CELL.WALL && edge === EDGE.CORN) this.addBox([x, 0, z, x + 1, CORN_H, z + 1], { kind: 'corn' });
        else if (t === CELL.WALL) this.addBox([x, 0, z, x + 1, WALL_H, z + 1], { kind: 'wall' });
        else if (t === CELL.WINDOW && edge !== EDGE.WALL) {
          // tranquera tapiada del alambrado: sin marco, solo las tablas
          this.addBox([x, 0, z, x + 1, WALL_H, z + 1], { kind: 'window', shoot: false, window: this.windowAt[this.idx(x, z)] });
        } else if (t === CELL.DOOR && edge !== EDGE.WALL) {
          const door = this.doorAt[this.idx(x, z)];
          const b = this.addBox([x, 0, z, x + 1, edge === EDGE.CORN ? CORN_H : GATE_H, z + 1], { kind: 'door', door, shoot: edge === EDGE.CORN });
          (DOORS[door].boxes ||= []).push(b);
        } else if (t === CELL.WINDOW) {
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
    if (this.tower) {
      this.tower.computeNav();
      this.navVersion = (this.navVersion || 0) + 1;
      return;
    }
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
        // con alturas, cuenta lo que está sobre el piso de esa celda (no el suelo ni las barandas)
        const fy = this.levels ? this.fy[i] : 0;
        for (const b of this.cellBoxes[i]) {
          if (!b.active || !b.solid || b.y0 > fy + 1) continue;
          if (this.levels && (b.y1 < fy + 0.3 || b.kind === 'rail' || b.kind === 'ground')) continue;
          // navCell: bloquea toda celda que toca (el redondel de la granja)
          // (en el molino, plano, con más margen: si no, los bancos de la capilla y los
          // estantes dejan celdas "libres" donde un muerto se traba contra la madera)
          const pad = this.levels ? 0.2 : 0.32;
          if (b.navCell || (cx > b.x0 - pad && cx < b.x1 + pad && cz > b.z0 - pad && cz < b.z1 + pad)) {
            this.navBlock[i] = 1;
            break;
          }
        }
      }
    }
    // la escalera del altillo: abajo es la rampa, no se camina por ahí
    blockStairCells(this);
    this.computeNavEdges();
    this.navVersion = (this.navVersion || 0) + 1;
  }

  // Los bordes entre dos celdas libres que no se pueden cruzar: una caja a
  // caballo del borde (un banco, un yunque, la baranda del costado de una
  // escalera) no tapa el centro de ninguna de las dos celdas, pero el cuerpo
  // de un muerto no pasa. Bits: 1 +x, 2 -x, 4 +z, 8 -z. (El campo de flujo
  // no los cruza: si no, los muertos caminaban contra eso sin parar.)
  computeNavEdges() {
    const n = MAP_W * MAP_H;
    const E = (this.navEdge = new Uint8Array(n));
    const R = 0.26;
    const spans = [];
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = this.idx(x, z);
        if (this.navBlock[i]) continue;
        for (const [dx, dz, bit, back] of [[1, 0, 1, 2], [0, 1, 4, 8]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (!this.inside(nx, nz)) continue;
          const j = this.idx(nx, nz);
          if (this.navBlock[j]) continue;
          // La línea que comparten (a lo largo de `u`, de u0 a u0 + 1): se tapa
          // si no queda un hueco del ancho de un cuerpo entre lo que la cruza
          // (barandas de escalera, muebles a caballo) y las paredes de los costados.
          const L = dx ? nx : nz;
          const u0 = dx ? z : x;
          const fy = this.levels ? heightAt(this, x + 0.5 + dx * 0.5, z + 0.5 + dz * 0.5) : 0;
          spans.length = 0;
          // los costados: si la celda de al lado (de una o de otra) es pared
          for (const s of [-1, 1]) {
            const ax = dx ? x : x + s;
            const az = dx ? z + s : z;
            const bx = dx ? nx : x + s;
            const bz = dx ? z + s : nz;
            if (!this.inside(ax, az) || this.navBlock[this.idx(ax, az)] || !this.inside(bx, bz) || this.navBlock[this.idx(bx, bz)]) spans.push(s < 0 ? [u0 - 1, u0 + R] : [u0 + 1 - R, u0 + 2]);
          }
          for (const c of [i, j]) {
            for (const b of this.cellBoxes[c]) {
              if (!b.active || !b.solid || b.kind === 'ground' || b.kind === 'window') continue;
              if (b.y1 <= fy + 0.15 || b.y0 >= fy + 1.7) continue;
              const a0 = dx ? b.x0 : b.z0;
              const a1 = dx ? b.x1 : b.z1;
              if (a1 <= L - R || a0 >= L + R) continue;
              const v0 = dx ? b.z0 : b.x0;
              const v1 = dx ? b.z1 : b.x1;
              if (v1 + R <= u0 || v0 - R >= u0 + 1) continue;
              spans.push([v0 - R, v1 + R]);
            }
          }
          if (!spans.length) continue;
          spans.sort((p, q) => p[0] - q[0]);
          let reach = u0;
          for (const [v0, v1] of spans) {
            if (v0 > reach + 0.02) break;
            if (v1 > reach) reach = v1;
          }
          if (reach >= u0 + 1 - 0.02) {
            E[i] |= bit;
            E[j] |= back;
          }
        }
      }
    }
  }

  // ¿Entra un cuerpo de radio r (de y0 a y1) parado en (x, z)?
  circleFree(x, z, r, y0, y1) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const r2 = r * r;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.inside(cx + dx, cz + dz)) continue;
        for (const b of this.cellBoxes[this.idx(cx + dx, cz + dz)]) {
          if (!b.active || !b.solid || b.kind === 'window') continue;
          if (b.y1 <= y0 || b.y0 >= y1) continue;
          const nx = Math.max(b.x0, Math.min(x, b.x1));
          const nz = Math.max(b.z0, Math.min(z, b.z1));
          if ((x - nx) ** 2 + (z - nz) ** 2 < r2) return false;
        }
      }
    }
    return true;
  }

  // ¿Pasa ese cuerpo en línea recta de (ax, az) a (bx, bz)? (la vista a la
  // altura de los ojos no ve los cajones, los bancos ni las barandas bajas)
  sweepFree(ax, az, bx, bz, r, y0, y1) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.3));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      if (!this.circleFree(ax + (bx - ax) * u, az + (bz - az) * u, r, y0, y1)) return false;
    }
    return true;
  }

  // Altura del piso bajo (x, z) para algo que está a la altura y (el altillo).
  floorAt(x, z, y) {
    // en la torre importa la altura: sin ella, la del jugador local
    if (this.tower) return this.tower.floorAt(x, z, y ?? this.hintY());
    return this.levels ? heightAt(this, x, z) : floorAt(x, z, y ?? 0);
  }

  // Cuánta agua hay en (x, z) (el estero y el penal la ponen; acá no hay).
  waterDepth() {
    return 0;
  }

  // A qué altura se busca el piso cuando el que pregunta no dice (la torre).
  hintY() {
    return this.g.player?.pos.y ?? 0;
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
    // la cara de afuera de una pared: la del edificio (adobe, chapa...) o el ladrillo de siempre
    const wallMatFor = (nx, nz, x, z) => {
      const t = this.type(nx, nz);
      // del lado de una zona con paredes propias, esas (un patio con alambrado no tiene: va la de afuera)
      if (t === CELL.FLOOR) {
        const w = ZONES[this.zoneKeys[this.zone[this.idx(nx, nz)]]].wall;
        if (w) return w;
      }
      const o = this.inside(x, z) ? this.owner[this.idx(x, z)] : -1;
      return (o >= 0 && ZONES[this.zoneKeys[o]].ext) || 'exterior';
    };
    // el alambrado y el maíz se ven "de afuera" desde la pared de al lado
    const openCell = (x, z) => this.inside(x, z) && this.grid[this.idx(x, z)] !== CELL.FLOOR && this.edge[this.idx(x, z)] !== EDGE.WALL;
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.type(x, z);
        if (!isWallish(t)) continue;
        // lo del alambrado y el maíz lo arma world/Farm.js
        if (this.edge[this.idx(x, z)] !== EDGE.WALL) {
          if (t === CELL.DOOR) {
            const d = DOORS[this.doorAt[this.idx(x, z)]];
            gb.flat(ZONES[d.zones[0]].floor, x, z, x + 1, z + 1, 0.001, true);
          }
          continue;
        }
        for (const n of dirs) {
          const nx = x + n[0];
          const nz = z + n[1];
          let nt = this.type(nx, nz);
          if (openCell(nx, nz)) nt = CELL.OUT;
          if (t === CELL.WALL) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) face(wallMatFor(nx, nz, x, z), x, z, n, 0, H);
            else if (nt === CELL.DOOR) face('trim', x, z, n, 0, DOOR_H);
            else if (nt === CELL.WINDOW) face('trim', x, z, n, SILL, HEAD);
          } else if (t === CELL.WINDOW) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) {
              const k = wallMatFor(nx, nz, x, z);
              face(k, x, z, n, 0, SILL);
              face(k, x, z, n, HEAD, H);
            }
          } else if (t === CELL.DOOR) {
            if (nt === CELL.FLOOR || nt === CELL.OUT) face(wallMatFor(nx, nz, x, z), x, z, n, DOOR_H, H);
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
      if (Z.circle) {
        // piso celda por celda (lo redondo)
        const zi = this.zoneKeys.indexOf(k);
        for (let i = 0; i < this.zone.length; i++) {
          if (this.zone[i] !== zi) continue;
          const cx = i % MAP_W;
          const cz = (i - cx) / MAP_W;
          gb.flat(Z.floor, cx, cz, cx + 1, cz + 1, 0.001, true);
        }
        continue;
      }
      for (const [x0, z0, x1, z1] of zoneRects(k)) {
      gb.flat(Z.floor, x0, z0, x1 + 1, z1 + 1, 0.001, true);
      if (Z.outdoor) continue;
      if (k === 'H' && FEATURES.attic) {
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
    }
    // marcos de ventana
    for (const w of WINDOWS) {
      const [x, z] = w.cell;
      if (this.edge[this.idx(x, z)] !== EDGE.WALL) continue;
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
    // (el castillo usa también algunos del penal: celdas, grilletes, la cocina)
    if (FEATURES.penal || FEATURES.tower || FEATURES.castle || FEATURES.esteros) registerPenalProps();
    if (FEATURES.cemetery) registerMolinoProps();
    if (FEATURES.castle) registerCastleProps();
    PROPS.forEach((d, i) => {
      const def = this.levels && d.y == null ? { ...d, y: this.floorAt(d.pos[0], d.pos[1]) } : d;
      const res = buildProp(def, this.M, 1000 + i * 17);
      if (!res) return;
      // (firm: la utilería chica que igual frena al Luisón, el fogón: World.collide lowProp)
      for (const b of res.boxes) this.addBox(b, { kind: 'prop', firm: !!res.firm });
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
        else if (d.name === 'fan') this.dynamic.fans.push(d);
        else if (d.name === 'kilnGlow') this.dynamic.kilnGlow = d;
        else if (d.name === 'candles') this.dynamic.candles = d;
        // reflectores y faros que giran (el penal)
        else if (d.name === 'spin') (this.dynamic.spins ||= []).push(d);
        // la roldana, la soga y el balde del aljibe (los mueve el easter egg del molino)
        else if (d.name === 'wellRig') (this.dynamic.wells ||= []).push(d);
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
      // (las llamas del castillo no tiran sombra)
      m.castShadow = !mat.userData?.noShadow;
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
      // la Salamanca queda al este del molino: adentro de la cueva no hay monte
      if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 5) continue;
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
    // el castillo: noche de alta montaña con la Vía Láctea (world/castleSky.js)
    if (FEATURES.castle) {
      buildCastleSky(this);
      return;
    }
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
        uDay: { value: this.dayCur },
        uSun: { value: new THREE.Vector3(...(SKY.sun || [-0.86, 0.1, -0.5])).normalize() },
        // los colores de la noche (SKY.colors; el estero la quiere más oscura y sin el resplandor rojizo)
        uHorizon: { value: new THREE.Vector3(...(SKY.colors?.horizon || [0.1, 0.07, 0.09])) },
        uZenith: { value: new THREE.Vector3(...(SKY.colors?.zenith || [0.012, 0.018, 0.04])) },
        uGlow: { value: new THREE.Vector3(...(SKY.colors?.glow || [0.16, 0.04, 0.02])) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime, uCloud, uFlash, uBlood, uFogAmt, uDay; uniform vec3 uFogColor, uSun, uHorizon, uZenith, uGlow;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          float h = vDir.y;
          vec3 horizon = mix(uHorizon, vec3(0.22,0.04,0.03), uBlood);
          vec3 zenith = mix(uZenith, vec3(0.05,0.01,0.012), uBlood);
          vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.55, h));
          // resplandor rojizo tipo BO1 en el horizonte
          col += mix(uGlow, vec3(0.35,0.05,0.02), uBlood) * pow(1.0 - abs(h), 12.0);
          // atardecer: cielo anaranjado abajo, violeta arriba y el sol ya bajo
          float sd = max(dot(vDir, uSun), 0.0);
          vec3 dusk = mix(vec3(0.95, 0.42, 0.16), vec3(0.2, 0.16, 0.36), smoothstep(-0.02, 0.5, h));
          dusk += vec3(1.0, 0.55, 0.22) * pow(sd, 6.0) * 0.55 + vec3(1.0, 0.8, 0.5) * pow(sd, 90.0) * 2.5;
          dusk = mix(dusk, vec3(0.12, 0.06, 0.05), smoothstep(0.0, -0.25, h));
          col = mix(col, dusk, uDay);
          vec3 cell = floor(vDir * 180.0);
          float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.4, h) * (1.0 - smoothstep(0.1, 0.5, uDay));
          star *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.0) * 30.0);
          // nubes que tapan las estrellas y se iluminan con los relámpagos
          vec2 cp = vDir.xz / (h + 0.25) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
          float cl = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.2, fbm(cp)) * smoothstep(-0.02, 0.15, h);
          col += vec3(star) * (1.0 - cl);
          vec3 cloudCol = mix(vec3(0.045, 0.045, 0.055), vec3(0.09, 0.02, 0.02), uBlood);
          // las nubes del atardecer se prenden de naranja del lado del sol
          cloudCol = mix(cloudCol, mix(vec3(0.35, 0.18, 0.2), vec3(1.0, 0.5, 0.25), pow(sd, 3.0)), uDay);
          col = mix(col, cloudCol, cl * 0.9);
          col += uFlash * (vec3(0.35, 0.4, 0.55) * (0.4 + cl * 1.2)) * smoothstep(-0.1, 0.3, h);
          col = mix(col, uFogColor, uFogAmt * (1.0 - smoothstep(0.0, 0.7, h) * 0.5));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.position.copy(mapCenter());
    sky.renderOrder = -1;
    this.sky = sky;
    this.root.add(sky);
    // luna (SKY.moon: dónde está y qué tan grande; la luna llena la dibuja fx/Night)
    const MS = SKY.moon || {};
    const moonDir = new THREE.Vector3(...(MS.dir || [-0.45, 0.62, -0.64])).normalize();
    const moonMat = new THREE.SpriteMaterial({ map: this.T.dot, color: 0xdfe8ff, fog: false, depthWrite: false, transparent: true });
    const moon = new THREE.Sprite(moonMat);
    moon.scale.set(MS.size || 22, MS.size || 22, 1);
    moon.position.copy(moonDir).multiplyScalar(260).add(mapCenter());
    this.root.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.dot, color: 0x5a6a90, fog: false, depthWrite: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
    halo.scale.set(80, 80, 1);
    halo.position.copy(moon.position);
    this.root.add(halo);
    this.moonDir = moonDir;
    this.moonSprite = moon;
    this.moonHalo = halo;
    // la noche del estero: luna llena, niebla sobre el agua y luciérnagas
    if (SKY.night) this.night = new Night(this.g, this, SKY.night);
    // el sol del atardecer (solo en los mapas que tienen día)
    if (SKY.daylight) {
      this.sunDir = new THREE.Vector3(...(SKY.sun || [-0.86, 0.1, -0.5])).normalize();
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.dot, color: 0xffc27a, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      sun.scale.set(34, 34, 1);
      sun.position.copy(this.sunDir).multiplyScalar(250).add(mapCenter());
      this.root.add(sun);
      this.sunSprite = sun;
    }
  }

  // Cuánta luz de día queda (la granja se va haciendo de noche con el easter egg).
  setDaylight(k) {
    this.daylight = Math.max(0, Math.min(1, k));
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
    moon.position.copy(this.moonDir).multiplyScalar(60).add(mapCenter());
    moon.target.position.copy(mapCenter());
    moon.castShadow = true;
    const sc = moon.shadow.camera;
    // el penal es más grande (y más alto): la sombra tiene que tapar todo
    const big = this.levels && !FEATURES.farm;
    const half = this.tower ? 50 : big ? 66 : 45;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = this.tower ? 240 : big ? 180 : 140;
    // la torre: la luna apunta a la mitad de la altura para que la sombra tape todos los pisos
    if (this.tower) {
      moon.position.y += 30;
      moon.target.position.y = 30;
    } else if (FEATURES.castle) {
      // el castillo está en la montaña: la sombra mira a la altura de los salones
      moon.position.y += 28;
      moon.target.position.y = 28;
    }
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.04;
    s.add(moon, moon.target);
    this.moon = moon;

    const bulbGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const shadeGeo = new THREE.ConeGeometry(0.28, 0.2, 16, 1, true);
    const bulbs = [];
    for (const L of LIGHTS) {
      const light = new THREE.PointLight(L.color, L.intensity, 22, 1.7);
      light.position.set(...L.pos);
      s.add(light);
      const entry = { def: L, light, base: L.intensity, phase: Math.random() * 100, bulb: null };
      if (!L.kind) {
        // la bombita: una instancia de this.bulbs (todas en un dibujo). Lo que
        // la toca de afuera (la Luz Mala, el motín) usa este "como si fuera"
        // una malla: visible y material.emissive / emissiveIntensity
        const bulb = { visible: true, shown: true, i: bulbs.length, position: new THREE.Vector3(...L.pos), material: { emissive: new THREE.Color(L.color), emissiveIntensity: 3 } };
        bulbs.push(bulb);
        const shade = new THREE.Mesh(shadeGeo, this.M.metalGreen);
        shade.position.set(L.pos[0], L.pos[1] + 0.1, L.pos[2]);
        // el cable sube hasta el techo de ese lugar
        const roof = this.levels ? Math.min(ceilAt(this, Math.floor(L.pos[0]), Math.floor(L.pos[2])), L.pos[1] + 6) : WALL_H;
        const wire = mesh(cylGeo(0.006, 0.006, Math.max(0.05, roof - L.pos[1]), 4), this.M.black, L.pos[0], (roof + L.pos[1]) / 2 + 0.1, L.pos[2]);
        // la pantalla y el cable no se mueven: van con la utilería fundida (un dibujo menos cada uno)
        if (this.addStatic) {
          const fixed = new THREE.Group();
          fixed.add(shade, wire);
          this.addStatic(fixed);
        } else this.root.add(shade, wire);
        entry.bulb = bulb;
      }
      this.lights.push(entry);
    }
    // las bombitas, todas juntas: el brillo de cada una es su color de instancia
    // (emissive por emissiveIntensity, puesto en updateBulbs); lo oscuro del
    // vidrio, el mismo para todas
    if (bulbs.length) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 1 });
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
      };
      const im = new THREE.InstancedMesh(bulbGeo, mat, bulbs.length);
      const m4 = new THREE.Matrix4();
      for (const b of bulbs) {
        im.setMatrixAt(b.i, m4.makeTranslation(b.position));
        im.setColorAt(b.i, b.material.emissive);
      }
      im.computeBoundingSphere();
      this.root.add(im);
      this.bulbs = { im, list: bulbs };
    }
    this.setPower(false);
    // (muchas lámparas para la calidad) prendidas de entrada las del arranque
    if (this.lights.length > this.maxLamps()) this.cullLights(0, new THREE.Vector3(PLAYER_START.x, (ZONES[START_ZONE]?.y ?? 0) + 1.6, PLAYER_START.z));
    // las de verdad que representan a las luces de evento (syncLights). Las
    // que sobran en esta calidad nacen apagadas: si no, los materiales se
    // compilaban en la carga con una luz de más y se recompilaban al jugar
    this.pool = [];
    const n = POOL[this.g.settings?.quality] ?? POOL_MAX;
    for (let i = 0; i < POOL_MAX; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.userData.src = null;
      l.visible = i < n;
      s.add(l);
      this.pool.push(l);
    }
  }

  // Una lámpara que se sumó después de armar el mapa (el farol del bote del
  // penal): se vuelve a recortar ya, así la cuenta de luces al compilar en la
  // carga es la misma que al jugar.
  recull() {
    if (this.lights.length <= this.maxLamps()) return;
    this.lightT = 0;
    this.cullLights(0, new THREE.Vector3(PLAYER_START.x, (ZONES[START_ZONE]?.y ?? 0) + 1.6, PLAYER_START.z));
  }

  // Las bombitas (instancias de this.bulbs): el brillo y si se ven, de lo que
  // dice cada una (e.bulb.visible, e.bulb.material).
  updateBulbs() {
    const B = this.bulbs;
    if (!B) return;
    const im = B.im;
    const c = (this.bulbC ||= new THREE.Color());
    let moved = false;
    for (const b of B.list) {
      im.setColorAt(b.i, c.copy(b.material.emissive).multiplyScalar(b.material.emissiveIntensity));
      if (b.visible === b.shown) continue;
      b.shown = b.visible;
      const m4 = (this.bulbM ||= new THREE.Matrix4());
      im.setMatrixAt(b.i, b.visible ? m4.makeTranslation(b.position) : m4.makeScale(0, 0, 0));
      moved = true;
    }
    im.instanceColor.needsUpdate = true;
    if (moved) im.instanceMatrix.needsUpdate = true;
  }

  // Cuántas lámparas del mapa van prendidas a la vez (Infinity: todas).
  maxLamps() {
    const n = TIER_LIGHTS[this.g.settings?.quality];
    if (n) return n;
    return this.lights.length >= CULL_FROM ? MAX_LIGHTS : Infinity;
  }

  // Una luz que se prende de a ratos (el fuego de un jefe, la de una
  // cinemática, el horno): existe desde que se arma el mapa para no recompilar
  // al prenderse, pero three cuenta cada luz visible en cada material aunque
  // esté en 0. La adoptada no se dibuja (capa VIRT); en cada cuadro las más
  // importantes que están prendidas se copian en las del pool (syncLights). Su
  // dueño la maneja igual que antes (intensidad, color, lugar, visible).
  // prio: cuánto pesa frente a las otras (los destellos de los tiros, poco).
  adoptLight(l, prio = 1) {
    if (!l || l.castShadow) return l;
    l.userData.prio = prio;
    if (this.virt.includes(l)) return l;
    l.layers.set(VIRT);
    this.virt.push(l);
    return l;
  }

  // Antes de dibujar (fx/PostFX.render, en cualquier estado: también las
  // cinemáticas del final): las luces de evento y el pasto lejano.
  preRender(cam, dt) {
    this.syncLights(cam);
    cullFarTiles(this, dt, cam);
  }

  // Las adoptadas que más se notan desde
  // la cámara (fuertes y que alcanzan hasta cerca) pasan a las luces del pool.
  // La que ya tiene una la conserva mientras no haya otra bastante mejor.
  syncLights(cam) {
    const P = this.pool;
    if (!P) return;
    const n = POOL[this.g.settings?.quality] ?? POOL_MAX;
    const cp = (this.syncC ||= new THREE.Vector3()).setFromMatrixPosition(cam.matrixWorld);
    const R = (this.ranked ||= []);
    R.length = 0;
    for (const l of this.virt) {
      if (!(l.intensity > 0.001)) continue;
      let o = l;
      while (o.visible && o.parent) o = o.parent;
      if (!o.visible || o !== this.scene) continue;
      const u = l.userData;
      const p = l.getWorldPosition((u.wp ||= new THREE.Vector3()));
      const d = p.distanceTo(cp);
      const reach = l.distance > 0 ? l.distance : 60;
      let s = (l.intensity * (u.prio ?? 1) * Math.max(0, 1 - Math.max(0, d - reach) / 30)) / (1 + (d * d) / 900);
      if (!(s > 0)) continue;
      for (let i = 0; i < n; i++) if (P[i].userData.src === l) s *= 1.5;
      u.s = s;
      R.push(l);
    }
    R.sort((a, b) => b.userData.s - a.userData.s);
    if (R.length > n) R.length = n;
    for (let i = 0; i < P.length; i++) {
      const pl = P[i];
      pl.visible = i < n;
      if (pl.userData.src && (i >= n || !R.includes(pl.userData.src))) pl.userData.src = null;
    }
    for (const l of R) {
      let has = false;
      for (let i = 0; i < n; i++) if (P[i].userData.src === l) has = true;
      if (has) continue;
      for (let i = 0; i < n; i++) {
        if (P[i].userData.src) continue;
        P[i].userData.src = l;
        break;
      }
    }
    for (const pl of P) {
      const l = pl.userData.src;
      if (!l) {
        pl.intensity = 0;
        continue;
      }
      pl.position.copy(l.userData.wp);
      pl.color.copy(l.color);
      pl.intensity = l.intensity;
      pl.distance = l.distance;
      pl.decay = l.decay;
      pl.updateMatrixWorld();
    }
  }

  // Cada luz puntual encarece todo lo que se dibuja (el penal tiene más de
  // veinte). Quedan prendidas solo las maxLamps más cercanas a la cámara y
  // siempre la misma cantidad, así los materiales no se recompilan al cambiar.
  // Las demás están lejos: casi no alumbran lo que se ve.
  cullLights(dt, at = this.g.camera.position) {
    this.lightT = (this.lightT || 0) - dt;
    if (this.lightT > 0) return;
    this.lightT = 0.25;
    const max = this.maxLamps();
    const here = this.zoneAt(at.x, at.z, at.y);
    // si se ve cada lámpara (un rayo contra el mapa) se guarda por celda de la
    // cámara y se rehacen pocas por vuelta: eran todas las de menos de 30 m
    // cada 0,25 s (en el penal, lo más caro del juego en la CPU)
    const cell = `${Math.floor(at.x)},${Math.floor(at.z)},${Math.floor(at.y / 2)}`;
    let rays = SEE_RAYS;
    for (const e of this.lights) {
      const [x, y, z] = e.def.pos;
      // lo de otro piso cuenta más lejos; la que ya está prendida, un poco más cerca (sin parpadeos)
      e.d2 = ((x - at.x) ** 2 + ((y - at.y) * 1.8) ** 2 + (z - at.z) ** 2) * (e.light.visible ? 0.8 : 1);
      // las del lugar donde se está cuentan como más cerca (el fogón del gran
      // salón alumbra desde la otra punta) y las que tapa una pared, más lejos
      if (here && e.def.zone === here) e.d2 *= 0.3;
      else if (e.d2 < 900) {
        if (e.seeCell !== cell && (rays > 0 || e.seeCell === undefined)) {
          rays--;
          e.seeCell = cell;
          e.seen = this.sees(at, x, y, z);
        }
        if (!e.seen) e.d2 *= 2.5;
      }
    }
    const order = [...this.lights].sort((a, b) => a.d2 - b.d2);
    order.forEach((e, i) => {
      e.light.visible = i < max;
    });
  }

  // ¿Se ve el punto (x, y, z) desde `at`? Lo que lo tapa pegado a él (la
  // campana del fogón, la reja del brasero) no cuenta.
  sees(at, x, y, z) {
    const d = Math.hypot(x - at.x, y - at.y, z - at.z);
    if (d < 1) return true;
    const dir = (this.seeDir ||= new THREE.Vector3()).set((x - at.x) / d, (y - at.y) / d, (z - at.z) / d);
    let t = Infinity;
    // (al terminar el castillo, la config del mapa vuelve antes que el mundo)
    try {
      t = this.raycast(at, dir, d, (this.seeHit ||= {}));
    } catch {
      return true;
    }
    return t === Infinity || t > d - 1.5;
  }

  // Luna tapada por nubes o teñida de rojo (clima).
  setMoon(cloud, blood) {
    if (!this.moonSprite) return;
    const vis = 1 - cloud * 0.75;
    this.moonSprite.material.color.setRGB(0.87 + blood * 0.13, 0.9 - blood * 0.62, 1 - blood * 0.72).multiplyScalar(vis * (SKY.moon?.glow ?? 1));
    this.moonHalo.material.color.setRGB(0.35 + blood * 0.45, 0.42 - blood * 0.3, 0.56 - blood * 0.45);
    this.moonHalo.material.opacity = 0.35 * vis + blood * 0.2;
    this.moonBase = 0.9 * (1 - cloud * 0.45) * (SKY.moon?.light ?? 1);
    this.blood = blood;
  }

  // Destello de un relámpago: la luna se vuelve un flash blanco que entra por las ventanas.
  setFlash(k, blood = 0) {
    if (!this.moon) return;
    const base = this.moonBase ?? 0.9;
    const d = this.dayCur || 0;
    // de día la luz grande es el sol bajo: anaranjada y más fuerte
    this.moon.intensity = base + k * 6 + d * 0.7;
    this.moon.color.setRGB(0.62 + k * 0.38 + blood * 0.3 + d * 0.38, 0.7 + k * 0.3 - blood * 0.45 - d * 0.1, 1 - blood * 0.55 - d * 0.55);
    this.hemi.intensity = (this.hemiBase ?? 0.9) + k * 1.6 + d * 0.5;
    this.hemi.color.setRGB(0.29 + blood * 0.2 + d * 0.5, 0.35 - blood * 0.18 + d * 0.2, 0.5 - blood * 0.3 - d * 0.05);
  }

  // El sol baja de a poco (unos 20 s por paso) y la luz grande pasa de sol a luna.
  updateDay(dt) {
    this.dayCur += Math.sign(this.daylight - this.dayCur) * Math.min(Math.abs(this.daylight - this.dayCur), dt / 20);
    const d = this.dayCur;
    if (this.sky) this.sky.material.uniforms.uDay.value = d;
    if (this.sunDir && this.moon) {
      // el sol se hunde en el horizonte mientras sube la luna
      const sunDir = this.sunDir.clone();
      sunDir.y = -0.08 + d * 0.2;
      sunDir.normalize();
      this.sunSprite.position.copy(sunDir).multiplyScalar(250).add(mapCenter());
      this.sunSprite.material.opacity = Math.min(1, d * 1.5);
      this.moonSprite.material.opacity = 1 - Math.min(1, d * 1.4);
      this.moonHalo.visible = d < 0.6;
      // la luz grande (y su sombra) se mueve a saltos, de vez en cuando
      // mientras baja: corriéndola en cada cuadro, la sombra de todo el mapa
      // (fx/Epic.js) se redibujaba entera en cada cuadro los 20 s que tarda,
      // en cada paso del easter egg y en cada ronda de caballos
      this.shadowT = (this.shadowT || 0) - dt;
      if (this.shadowT <= 0 || Math.abs(this.daylight - d) <= 0.001) {
        this.shadowT = 0.5;
        const dir = this.moonDir.clone().lerp(sunDir, Math.min(1, d * 1.6)).normalize();
        this.moon.position.copy(dir).multiplyScalar(60).add(mapCenter());
        this.g.renderer.shadowMap.needsUpdate = true;
      }
    }
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
    if (Math.abs(this.dayCur - this.daylight) > 0.001) this.updateDay(dt);
    // con luz de día el brillo (bloom) solo en lo que de verdad brilla
    const bloom = this.g.post?.bloom;
    if (bloom) bloom.threshold = 0.85 + this.dayCur * 0.6;
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
    this.updateBulbs();
    this.foliageSync();
    if (this.lights.length > this.maxLamps()) {
      this.culled = true;
      this.cullLights(dt);
    } else if (this.culled) {
      // (subió la calidad: todas de nuevo)
      this.culled = false;
      for (const e of this.lights) e.light.visible = true;
    }
    if (this.dynamic.kilnGlow) this.dynamic.kilnGlow.material.emissiveIntensity = 2.5 + Math.sin(t * 11) * 0.6 + Math.random() * 0.4;
    if (this.power) for (const w of this.dynamic.flywheels) w.rotateX(dt * 9);
    // el molino de viento gira siempre (aunque no sople)
    for (const f of this.dynamic.fans) f.rotateZ(dt * (1.6 + Math.sin(t * 0.3) * 0.5));
    for (const s of this.dynamic.spins || []) s.rotateY(dt * s.userData.speed);
    if (this.cornU) this.cornU.value = t;
    this.tower?.update(dt, t);
    // lo que se mueve solo en el castillo (las llamas)
    this.extraUpdate?.(dt, t);
  }

  // ---------------- colisiones ----------------
  // Empuja un círculo (x,z,radio) fuera de las cajas sólidas entre y0 e y1.
  // opts.skip: un tipo de caja que no frena (el Luisón atraviesa el pajonal, 'corn')
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
            if (opts.skip && b.kind === opts.skip) continue;
            // (lowProp: la utilería chica del piso, más baja que esto, no frena:
            // troncos, escombros; no la firm, el fogón; el Luisón, Zombies.bossColl)
            if (opts.lowProp != null && b.kind === 'prop' && !b.firm && b.y1 < opts.lowProp) continue;
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
    // techo (solo si ese punto está bajo techo); con alturas se mira celda por celda
    if (!this.levels && d.y > 1e-6 && o.y < WALL_H) {
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
    let axis = -1;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const tn = this._tn || (this._tn = { nx: 0, ny: 0, nz: 0 });
    for (let steps = 0; steps < 400; steps++) {
      if (tEnter > best) break;
      // (en la torre las losas son cajas: no pasa por acá)
      if (this.levels && !this.tower && this.inside(cx, cz)) {
        // el piso de esta celda (terreno, pisos altos, rampas) y su techo
        const tExit = Math.min(tmx, tmz, best);
        const th = rayTerrain(this, o, d, cx, cz, tEnter, tExit, axis, stepX, stepZ, tn);
        if (th < best) {
          best = th;
          nx = tn.nx;
          ny = tn.ny;
          nz = tn.nz;
          bestBox = 'floor';
        }
        const ceil = ceilAt(this, cx, cz);
        if (ceil < Infinity && d.y > 1e-6) {
          const tc = (ceil - o.y) / d.y;
          if (tc >= tEnter && tc <= tExit && tc < best) {
            best = tc;
            nx = 0;
            ny = -1;
            nz = 0;
            bestBox = 'ceiling';
          }
        }
      }
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
        axis = 0;
      } else {
        tEnter = tmz;
        tmz += tdz;
        cz += stepZ;
        axis = 1;
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
