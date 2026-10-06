import * as THREE from 'three';
import { MAP_W, MAP_H, ZONES, DOORS, PERK_SPOTS, WALL_BUYS, BOX_SPOTS, POWER, PAP } from '../config/map';
import { GROUND, WATER_Y, ROOFS } from '../config/maps/esteros';
import { makeGround, seamCells } from './esterosGround';
import { toTexture, coverageMips } from '../core/textures';
import { rng } from '../core/noise';
import Water from '../fx/Water';
import { depthPrepass } from '../fx/prepass';
import { addGrassPush, makeGrassPush, windOn } from '../fx/grassPush';
import { jitterGrass } from '../fx/TAA';
import { tejasTexture } from './Farm';
import { registerEsterosProps } from './esterosProps';
import { buildDecor, updateDecor } from './esterosDecor';
import { buildGroundDecor } from './esterosGroundDecor';
import { buildTussocks, leafCrownGeometry, evenFoliage } from './esterosGrass';
import { lightGrass } from '../config/quality';
import { tileInstances } from './foliageTiles';
import { compactGroup } from './props';

// Lo fijo de un grupo, una malla por material (world/props compactGroup): los
// techos y las tablas de los mates de pared eran ~80 llamadas de dibujo por
// pasada en el peor punto del estero (globalThis.__mduNoMerge2: como antes).
const pack = (g) => (globalThis.__mduNoMerge2 === true ? g : compactGroup(g));

// "Mate no Numa": el estero. Engancha a world/Levels.js el suelo suave (islas,
// barrancas y el fondo de lagunas y riachos, world/esterosGround.js), separa
// con pajonal las zonas de afuera que se tocan y arma lo que se ve del suelo:
// el barro, el pajonal alto de los bordes, las barandas de palo del puente y
// la pasarela, el agua (fx/Water) y el estero de afuera hasta el horizonte.
//
// Ganchos que usa Levels (todos opcionales en los otros mapas):
//  · w.seams(w): después de marcar las zonas, antes de las paredes.
//  · w.prepGround(w) y w.groundCell[i]: las celdas que pisan el suelo suave.
//  · w.groundAt(x, z): la altura del suelo.
//  · w.terrain(w): el terreno de afuera de las zonas.
//  · w.ownEdges / w.openEdges: los bordes (pajonal y barandas) los arma acá.
//  · w.skipCliff(i, j): sin cara de barranco entre esas dos celdas.

const OUT = 0;
const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const EDGE_CORN = 2;
const EDGE_RAIL = 3;
// metros de suelo de más alrededor de la grilla (el estero de afuera)
const PAD = 40;

export function installEsterosHooks(w) {
  const G = makeGround(MAP_W, MAP_H, GROUND, PAD);
  w.estero = { G };
  w.groundAt = (x, z) => G.at(x, z);
  const keys = Object.keys(ZONES);
  w.seams = () => {
    const floor = new Uint8Array(w.grid.length);
    for (let i = 0; i < floor.length; i++) floor[i] = w.grid[i] === FLOOR ? 1 : 0;
    for (const i of seamCells(MAP_W, MAP_H, w.zone, floor, keys, ZONES, DOORS)) {
      w.grid[i] = OUT;
      w.zone[i] = -1;
    }
  };
  w.prepGround = () => {
    const n = MAP_W * MAP_H;
    const gc = (w.groundCell = new Uint8Array(n));
    for (let i = 0; i < n; i++) {
      const t = w.grid[i];
      const x = i % MAP_W;
      const z = (i - x) / MAP_W;
      if (t === OUT) gc[i] = 1;
      else if (t === FLOOR) {
        const Z = ZONES[keys[w.zone[i]]];
        // (un rectángulo con altura propia no pisa el suelo: el cuello de la senda sí)
        gc[i] = Z.ground && !(Z.rects || []).some((r) => r[4] != null && x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) ? 1 : 0;
      } else if (t === DOOR) {
        const d = DOORS[w.doorAt[i]];
        gc[i] = d.zones.every((k) => ZONES[k].ground) ? 1 : 0;
      }
    }
  };
  w.terrain = () => {
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      if (w.grid[i] !== OUT) continue;
      const x = i % MAP_W;
      const z = (i - x) / MAP_W;
      w.ty[i] = G.at(x + 0.5, z + 0.5);
    }
  };
  // las barandas de palo y el pajonal los arma buildEsteros
  w.ownEdges = true;
  w.openEdges = () => {};
  w.noBars = true;
  // entre el suelo y el suelo no hay barranco; bajo el puente y la pasarela
  // no va la cara (van los pilotes) pero sí la baranda, salvo sobre agua
  // honda: de ahí uno se tira a nadar (y trepa de vuelta)
  const deep = (i) => {
    const x = i % MAP_W;
    return G.at(x + 0.5, (i - x) / MAP_W + 0.5) < WATER_Y - 1;
  };
  // de una plataforma de afuera baja (la pasarela) al agua se baja (y
  // nadando se trepa; si da pie, se sale caminando por la orilla)
  const wet = (i) => {
    const x = i % MAP_W;
    return G.at(x + 0.5, (i - x) / MAP_W + 0.5) < WATER_Y - 0.25;
  };
  w.passExtra = (i, j) => {
    const gi = w.groundCell[i];
    if (gi === w.groundCell[j]) return false;
    const plank = gi ? j : i;
    const Z = ZONES[keys[w.zone[plank]]];
    return !!Z?.outdoor && wet(gi ? i : j) && w.fy[plank] < WATER_Y + 0.95;
  };
  w.skipCliff = (i, j) => {
    if (w.groundCell[i] && w.groundCell[j]) return 'all';
    if (w.groundCell[i] || w.groundCell[j]) return deep(w.groundCell[i] ? i : j) ? 'all' : 'face';
    return null;
  };
  w.waterDepth = (x, z) => Math.max(0, (w.water?.level ?? WATER_Y) - w.floorAt(x, z));
}

// ---------------- texturas ----------------
// El pajonal: cañas finitas con la punta clara y algunas con penacho.
function reedCanvas(seed) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const x = c.getContext('2d');
  const r = rng(seed);
  x.lineCap = 'round';
  // de atrás para adelante: primero las cañas oscuras y después las claras
  for (let k = 0; k < 340; k++) {
    const t = k / 340;
    const bx = 4 + r() * 504;
    const top = 40 + r() * 520 * (1 - t * 0.4);
    const lean = (r() - 0.5) * 90;
    const wBase = 1.4 + r() * 2.6;
    const dry = r() * (0.4 + t * 0.6);
    const g = x.createLinearGradient(0, 1024, 0, top);
    g.addColorStop(0, `rgb(${28 + dry * 20},${36 + dry * 18},${18})`);
    g.addColorStop(0.5, `rgb(${62 + dry * 50},${74 + dry * 36},${38 + dry * 16})`);
    g.addColorStop(1, `rgb(${112 + dry * 60},${110 + dry * 44},${72 + dry * 26})`);
    x.strokeStyle = g;
    // la caña: una curva que se afina (tres tramos, cada vez más finos)
    const midX = bx + lean * 0.35;
    const midY = (1024 + top) / 2;
    for (let s = 0; s < 3; s++) {
      x.lineWidth = wBase * (1 - s * 0.3);
      x.beginPath();
      const t0 = s / 3;
      const t1 = (s + 1) / 3;
      const at = (u) => {
        const a = (1 - u) * (1 - u);
        const b2 = 2 * (1 - u) * u;
        const c2 = u * u;
        return [a * bx + b2 * midX + c2 * (bx + lean), a * 1024 + b2 * midY + c2 * top];
      };
      const [x0, y0] = at(t0);
      const [x1, y1] = at(t1);
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();
    }
    // el penacho: hilos finitos que cuelgan de la punta, apagados de noche
    if (r() < 0.16) {
      const px = bx + lean;
      x.lineWidth = 0.9;
      x.strokeStyle = `rgba(${150 + r() * 30},${138 + r() * 24},${104 + r() * 20},0.9)`;
      for (let j = 0; j < 26; j++) {
        const yy = top + j * 2.2;
        x.beginPath();
        x.moveTo(px, yy);
        x.lineTo(px + (r() - 0.5) * 16, yy + 8 + r() * 10);
        x.stroke();
      }
    }
  }
  return c;
}

// La paja de los techos: tallos apretados, dorados y grises, con vetas.
function thatchCanvas(seed, fringe = false) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = fringe ? 128 : 256;
  const x = c.getContext('2d');
  const r = rng(seed);
  if (!fringe) {
    x.fillStyle = '#5a4a30';
    x.fillRect(0, 0, 256, 256);
  }
  const n = fringe ? 500 : 2600;
  for (let k = 0; k < n; k++) {
    const px = r() * 256;
    const py = fringe ? r() * 30 : r() * 256;
    const len = fringe ? 50 + r() * 70 : 14 + r() * 26;
    const v = r();
    const cr = 110 + v * 90;
    x.strokeStyle = `rgba(${cr},${cr * 0.82},${cr * 0.5 + r() * 20},${fringe ? 0.95 : 0.8})`;
    x.lineWidth = 1 + r() * 1.5;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (r() - 0.5) * 6, py + len);
    x.stroke();
  }
  return c;
}

// Materiales propios del estero (World.makeMaterials).
export function esterosMaterials(T, M, std) {
  registerEsterosProps();
  T.thatch = T.thatch || toTexture(thatchCanvas(81));
  T.thatchFringe = T.thatchFringe || coverageMips(toTexture(thatchCanvas(82, true)), 0.4);
  M.thatch = std(T.thatch, { bump: 2 });
  M.thatchFringe = new THREE.MeshStandardMaterial({ map: T.thatchFringe, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  M.piedraRoja = std(T.stoneWall, { c: 0xc47a58, bump: 1.4 });
  M.quebracho = std(T.woodCarved, { c: 0x8a3a24 });
  M.palm = new THREE.MeshStandardMaterial({ color: 0x4a5220, roughness: 0.85, side: THREE.DoubleSide });
  M.palmTrunk = std(T.woodCarved, { c: 0x6a5a48, bump: 1.5 });
  M.pelego = std(null, { c: 0xd8ccb0, r: 1 });
  // las copas de hojitas (esterosGrass.leafCrownGeometry): el color de la
  // hoja acá, la luz y la sombra en los vértices
  M.leafDark = new THREE.MeshStandardMaterial({ color: 0x5a7a44, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  M.lapacho = new THREE.MeshStandardMaterial({ color: 0xb05a88, vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  M.ceiboLeaf = new THREE.MeshStandardMaterial({ color: 0x6a7a3c, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  M.tejas = new THREE.MeshStandardMaterial({ map: tejasTexture(), roughness: 0.82, side: THREE.DoubleSide });
  M.tejas.bumpMap = M.tejas.map;
  M.tejas.bumpScale = 1.5;
  // (coverageMips: de lejos las cañas no se deshacen en rayitas; core/textures.js)
  T.reed = T.reed || coverageMips(toTexture(reedCanvas(71), { repeat: false }), 0.45);
  M.reed = new THREE.MeshStandardMaterial({ map: T.reed, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
  // las puertas de pajonal (kind 'corn') usan las matas del maizal con cañas
  M.corn = new THREE.MeshStandardMaterial({ map: T.reed, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
  // las matas de cerca (hojas sólidas con color por vértice)
  M.tussock = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  // (las hojas, las cañas y las copas: parejas de los dos lados)
  for (const m of [M.tussock, M.reed, M.corn, M.leafDark, M.lapacho, M.ceiboLeaf]) evenFoliage(m);
  M.ground = std(T.grass, { bump: 0.5 });
  M.ground.vertexColors = true;
  M.mudStilt = std(T.planksDark, { c: 0x6a5a48 });
}

// ---------------- lo que se ve ----------------
export function buildEsteros(w) {
  const { G } = w.estero;
  buildGround(w, G);
  buildRoofs(w);
  buildRuins(w);
  buildHorizon(w);
  buildBoards(w);
  buildDecor(w);
  // lo del piso de cada zona (aserrín, conchas, cascotes, huesos...: world/esterosGroundDecor.js)
  buildGroundDecor(w);
  // lo que flota sigue a la creciente
  const prev = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    updateDecor(w);
  };
  buildEdgeRails(w);
  buildPajonal(w, G);
  buildWater(w, G);
}

// El barro: una malla de 1 m sobre las esquinas del suelo, con la grilla y
// PAD metros alrededor. Sin las casas (tienen su piso) y con color: fondo
// oscuro bajo el agua, barro mojado en la orilla y pasto arriba.
function buildGround(w, G) {
  const N = G.N;
  const Mc = G.M;
  const pos = new Float32Array(N * Mc * 3);
  const col = new Float32Array(N * Mc * 3);
  const uv = new Float32Array(N * Mc * 2);
  const c = new THREE.Color();
  for (let z = 0; z < Mc; z++) {
    for (let x = 0; x < N; x++) {
      const k = z * N + x;
      const px = x - PAD;
      const pz = z - PAD;
      const y = G.cy[k];
      pos.set([px, y, pz], k * 3);
      uv.set([px / 3, pz / 3], k * 2);
      const d = WATER_Y - y;
      const n = Math.sin(px * 0.7 + pz * 0.3) * 0.5 + Math.sin(px * 0.21 - pz * 0.63) * 0.5;
      if (d > 0.25) c.setRGB(0.2, 0.17, 0.12);
      else if (d > -0.15) c.setRGB(0.3, 0.26, 0.18);
      else c.setRGB(0.55 + n * 0.08, 0.6 + n * 0.1, 0.4);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const idx = [];
  const house = (x, z) => {
    if (!w.inside(x, z)) return false;
    const i = w.idx(x, z);
    return w.grid[i] === FLOOR && !w.groundCell[i] && !ZONES[w.zoneKeys[w.zone[i]]].outdoor;
  };
  for (let z = 0; z < Mc - 1; z++) {
    for (let x = 0; x < N - 1; x++) {
      if (house(x - PAD, z - PAD)) continue;
      const a = z * N + x;
      idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, w.M.ground);
  mesh.receiveShadow = true;
  w.root.add(mesh);
  w.groundMesh = mesh;
}

// Barandas de palo en los bordes del puente y la pasarela, y los pilotes.
function buildEdgeRails(w) {
  const pos = [];
  const box = (x0, y0, z0, x1, y1, z1) => pos.push([x0, y0, z0, x1, y1, z1]);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== WALL || w.edge[i] !== EDGE_RAIL) continue;
      const fy = w.fy[i];
      const bed = w.groundAt(x + 0.5, z + 0.5);
      // el pilote hasta el fondo y el poste de la baranda
      box(x + 0.42, bed - 0.3, z + 0.42, x + 0.58, fy + 1.05, z + 0.58);
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const j = w.inside(x + dx, z + dz) ? w.idx(x + dx, z + dz) : -1;
        if (j < 0 || w.grid[j] !== WALL || w.edge[j] !== EDGE_RAIL) continue;
        for (const y of [0.5, 1.0]) {
          if (dx) box(x + 0.5, fy + y, z + 0.47, x + 1.5, fy + y + 0.07, z + 0.53);
          else box(x + 0.47, fy + y, z + 0.5, x + 0.53, fy + y + 0.07, z + 1.5);
        }
      }
    }
  }
  // el tablero: los pilotes de abajo de las celdas de tablas sobre el agua
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR || w.groundCell[i]) continue;
      const Z = ZONES[w.zoneKeys[w.zone[i]]];
      if (!Z.outdoor) continue;
      const bed = w.groundAt(x + 0.5, z + 0.5);
      if (bed > w.fy[i] - 0.3) continue;
      if ((x + z) % 2 === 0) box(x + 0.1, bed - 0.3, z + 0.1, x + 0.24, w.fy[i], z + 0.24);
      // la viga de abajo del tablero
      box(x, w.fy[i] - 0.22, z + 0.45, x + 1, w.fy[i] - 0.02, z + 0.55);
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geo, w.M.woodDark, pos.length);
  const m = new THREE.Matrix4();
  pos.forEach(([x0, y0, z0, x1, y1, z1], k) => {
    m.makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    im.setMatrixAt(k, m);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  w.root.add(im);
}

// El pajonal: matas de cañas altas en los bordes de las zonas (que frenan
// como el maizal de la granja) y, más ralas, en todo el estero de afuera.
function buildPajonal(w, G) {
  const r = rng(907);
  const spots = [];
  const near = new Uint8Array(MAP_W * MAP_H);
  // distancia (en celdas) a lo caminable, hasta 6
  const dist = new Int8Array(MAP_W * MAP_H).fill(99);
  const q = [];
  for (let i = 0; i < dist.length; i++) {
    const t = w.grid[i];
    if (t === FLOOR || t === DOOR) {
      dist[i] = 0;
      q.push(i);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (dist[i] >= 6) continue;
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.inside(x + dx, z + dz)) continue;
      const j = w.idx(x + dx, z + dz);
      if (dist[j] <= dist[i] + 1) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  // lo que está contra el pajonal (máquinas, tizas, la caja, la luz): ahí
  // las cañas se abren para que no lo tapen
  const clear = [...PERK_SPOTS, ...WALL_BUYS, ...BOX_SPOTS, POWER, PAP].filter(Boolean).map((d) => [d.cell[0] + 0.5 + d.face[0] * 0.9, d.cell[1] + 0.5 + d.face[1] * 0.9, d.width || (d.perk || d.zone ? 2 : 1)]);
  // (y las tranqueras: ahí no crece nada, así se ve que es una puerta; al
  // costado, el pajonal llega hasta el poste)
  const doorCell = new Set();
  for (const d of DOORS) for (const [x, z] of d.cells) doorCell.add(w.idx(x, z));
  const inDoor = (px, pz) => {
    for (const [ox, oz] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
      const cx = Math.floor(px + ox);
      const cz = Math.floor(pz + oz);
      if (w.inside(cx, cz) && doorCell.has(w.idx(cx, cz))) return true;
    }
    return false;
  };
  const blocked = (px, pz) => inDoor(px, pz) || clear.some(([cx, cz, wd]) => Math.hypot(px - cx, pz - cz) < 0.9 + wd * 0.45);
  // (las matas de cerca: [x, y, z, alto, ángulo, ancho])
  const tuft = [];
  // (Personalizada: Game.tier('grass'), al armar el mapa)
  const low = lightGrass(w.g);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      const edge = t === WALL && w.edge[i] === EDGE_CORN;
      if (t !== OUT && !edge) continue;
      const y = G.at(x + 0.5, z + 0.5);
      // (en lo hondo no crece; en el borde de una zona sí: juncos parados en el
      // agua, así el borde se ve y no queda una pared invisible)
      if (y < WATER_Y - 1.1 && !edge) continue;
      near[i] = 1;
      // el borde y las dos filas de atrás: matas con volumen
      if (edge || dist[i] <= 2) {
        const nt = edge ? (low ? 2 : 4) : dist[i] <= 1 ? 2 : r() < 0.7 ? 1 : 0;
        for (let k = 0; k < nt; k++) {
          const px = x + 0.15 + r() * 0.7;
          const pz = z + 0.15 + r() * 0.7;
          if (blocked(px, pz)) continue;
          tuft.push([px, Math.max(G.at(px, pz), WATER_Y - 0.45) - 0.06, pz, (edge ? 2.05 : 2.2) + r() * 0.7, r() * Math.PI * 2, 0.9 + r() * 0.35]);
        }
        continue;
      }
      const n = dist[i] <= 5 ? 2 : r() < 0.6 ? 1 : 0;
      // en el borde, las matas un poco corridas hacia afuera (que no invadan el piso)
      let ox = 0;
      let oz = 0;
      if (edge) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (w.inside(x + dx, z + dz) && w.grid[w.idx(x + dx, z + dz)] === FLOOR) {
            ox -= dx * 0.3;
            oz -= dz * 0.3;
          }
        }
      }
      for (let k = 0; k < n; k++) {
        const px = x + r() + ox;
        const pz = z + r() + oz;
        if (blocked(px, pz)) continue;
        spots.push([px, Math.max(G.at(px, pz), WATER_Y - 0.45) - 0.1, pz, (edge ? 2.4 : 1.9) + r() * 1.1, r() * Math.PI]);
      }
    }
  }
  // afuera de la grilla, hasta el borde del suelo
  for (let z = -PAD; z < MAP_H + PAD; z++) {
    for (let x = -PAD; x < MAP_W + PAD; x++) {
      if (w.inside(x, z)) continue;
      const y = G.at(x + 0.5, z + 0.5);
      const out = Math.max(-x, -z, x - MAP_W, z - MAP_H);
      // (pegado a la grilla, juncos aunque sea hondo: el borde del mapa en el
      // agua se ve como un juncal, no como una pared invisible)
      if (y < WATER_Y - 0.9 && out > 2) continue;
      if (y < WATER_Y - 0.9) {
        for (let k = 0; k < 3; k++) spots.push([x + r(), WATER_Y - 0.5, z + r(), 2.3 + r() * 1.1, r() * Math.PI]);
        continue;
      }
      if (r() > (out < 8 ? 0.9 : 0.45)) continue;
      const px = x + r();
      const pz = z + r();
      spots.push([px, G.at(px, pz) - 0.1, pz, 1.8 + r() * 1.4, r() * Math.PI]);
    }
  }
  // cada mata: tres planos cruzados de 1.6 m de ancho
  const geo = new THREE.BufferGeometry();
  const P = [];
  const U = [];
  const I = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const cx = Math.cos(a) * 0.62;
    const cz = Math.sin(a) * 0.62;
    const b = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  // (las normales para arriba: la mata se ilumina pareja de los dos lados)
  const nrm = geo.attributes.normal;
  for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
  const qt = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const items = spots.map(([x, y, z, h, a]) => {
    qt.setFromAxisAngle(up, a);
    const m = new THREE.Matrix4().compose(v.set(x, y, z), qt, s.set(0.9 + (h - 2) * 0.2, h, 0.9 + (h - 2) * 0.2));
    const d = 0.75 + r() * 0.35;
    return { m, c: new THREE.Color(d, d * (0.95 + r() * 0.1), d * 0.9), x, z };
  });
  // en cuadros de 24 m (world/foliageTiles.js): lo que no se ve no se dibuja,
  // y lo perdido en la niebla tampoco. (Primero la profundidad: cada píxel del
  // pajonal se sombrea una sola vez; la pasada de profundidad es una para todos)
  let pre = null;
  // (de a 48 m: con cuadros de 24 m el pajonal y las matas eran ~250 llamadas
  // de dibujo por cuadro entre profundidad, color y G-buffer; las matas son de
  // 6 triángulos, dibujar las de más de un cuadro grande no cuesta.
  // globalThis.__mduSmallTiles: como antes, para comparar)
  const big = globalThis.__mduSmallTiles !== true;
  const im = tileInstances(w, geo, w.M.reed, items, {
    tile: big ? 48 : 24,
    far: 90,
    setup: (t) => {
      t.receiveShadow = true;
      depthPrepass(t);
      if (pre) t.userData.prepass.material = pre;
      else pre = t.userData.prepass.material;
    },
  });
  w.root.add(im);
  w.pajonal = im;
  // las matas de cerca (world/esterosGrass.js)
  w.tussocks = buildTussocks(w.root, tuft, w.M.tussock, { ...(low ? { leaves: 22, stems: 5 } : {}), chunk: big ? 42 : 21 });
  // (y cada mata con el detalle de su distancia, antes de cada dibujo: esterosGrass LODS)
  const pre0 = w.preRender;
  w.preRender = (cam, dt) => {
    pre0.call(w, cam, dt);
    w.tussocks.lod(cam);
  };
  // (con su pasada de profundidad, como el pajonal: de cerca las hojas se pisan
  // muchas veces y cada capa se sombreaba entera con todas las luces. Parado
  // en la tranquera de la laguna eran ~1,1 ms de placa en Épica a 1440p.
  // globalThis.__mduNoTuftPre al armar el mapa: sin ella, como antes)
  let tpre = null;
  if (globalThis.__mduNoTuftPre !== true) {
    for (const t of w.tussocks) {
      depthPrepass(t);
      if (tpre) t.userData.prepass.material = tpre;
      else tpre = t.userData.prepass.material;
    }
  }
  // el pasto alto se aparta cuando lo cruza el Luisón (o uno): fx/grassPush.js.
  // (también las pasadas de profundidad, que si no dejaban huecos)
  const mats = [w.M.reed, w.M.tussock, pre, tpre].filter(Boolean);
  for (const m of mats) addGrassPush(m);
  // (el viento a prueba: también las copas y las palmeras; fx/grassPush WIND)
  if (windOn()) for (const m of [w.M.leafDark, w.M.lapacho, w.M.ceiboLeaf, w.M.palm]) addGrassPush(m, { crown: true });
  // (y corrido una fracción de píxel por cuadro: el suavizado temporal lo
  // suaviza también parado; fx/TAA.js. La profundidad, igual que el color)
  for (const m of mats) jitterGrass(m);
  const isGrass = (x, z) => {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    if (!w.inside(fx, fz)) return G.at(x, z) > WATER_Y - 1.1;
    const i = w.idx(fx, fz);
    return (w.grid[i] === OUT && G.at(x, z) > WATER_Y - 1.1) || (w.grid[i] === WALL && w.edge[i] === EDGE_CORN);
  };
  const push = makeGrassPush(w.g, isGrass);
  const prev = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    push(dt);
  };
}

// El agua de todo el estero (fx/Water de 1b): el fondo es el suelo suave o,
// en las casas, su piso; bajo el puente y la pasarela, el fondo de abajo.
function buildWater(w, G) {
  const groundAt = (x, z) => {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    if (!w.inside(fx, fz)) return G.at(x, z);
    const i = w.idx(fx, fz);
    if (w.grid[i] === FLOOR && !w.groundCell[i]) {
      const Z = ZONES[w.zoneKeys[w.zone[i]]];
      return Z.outdoor ? G.at(x, z) : w.floorAt(x, z);
    }
    return G.at(x, z);
  };
  const roofAt = (x, z) => {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    if (!w.inside(fx, fz)) return false;
    const i = w.idx(fx, fz);
    if (w.grid[i] !== FLOOR) return false;
    const Z = ZONES[w.zoneKeys[w.zone[i]]];
    return !Z.outdoor && !!Z.ceil;
  };
  w.water = new Water(w.g, {
    level: WATER_Y,
    groundAt,
    roofAt,
    bounds: [-PAD, -PAD, MAP_W + PAD, MAP_H + PAD],
    // (números de 1b: agua color té del Iberá, más clara que el río del penal)
    body: 0x1a1608,
    clear: 0.9,
    flow: [0.035, 0.035],
    wind: 0.8,
    swell: 0.5,
  });
  w.root.add(w.water.mesh);
}

// Techos a dos aguas (config/maps/esteros.js ROOFS): la paja gruesa de los
// ranchos (con el fleco que cuelga del alero) o las tejas de la casona.
// rect: el borde de afuera de las paredes; axis: hacia dónde corre la
// cumbrera; base: la altura de las paredes; rise: cuánto sube.
function buildRoofs(w) {
  const M = w.M;
  const g = new THREE.Group();
  for (const d of ROOFS) {
    const [x0, z0, x1, z1] = d.rect;
    const alongX = d.axis === 'x';
    const len = alongX ? x1 - x0 : z1 - z0;
    const half = (alongX ? z1 - z0 : x1 - x0) / 2;
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const a0 = alongX ? x0 : z0;
    const paja = d.mat !== 'tejas';
    const over = paja ? 0.7 : 0.45;
    const end = paja ? 0.5 : 0.3;
    const thick = paja ? 0.35 : 0.08;
    const rise = d.rise || 2.4;
    const k = rise / half;
    const eave = d.base - over * k;
    const top = d.base + rise;
    const P = (u, v, y) => (alongX ? [a0 + u, y, mid + v] : [mid + v, y, a0 + u]);
    const mat = paja ? M.thatch : M.tejas;
    for (const sg of [-1, 1]) {
      // el faldón como una losa con espesor (la paja se ve gruesa en el borde)
      const A = P(-end, sg * (half + over), eave);
      const B = P(len + end, sg * (half + over), eave);
      const Cc = P(len + end, 0, top);
      const Dd = P(-end, 0, top);
      const up = [0, thick, 0];
      const pos = [];
      const add = (p, o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
      const quad = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
      quad(add(A, up), add(B, up), add(Cc, up), add(Dd, up));
      quad(A, Dd, Cc, B);
      quad(A, B, add(B, up), add(A, up));
      quad(A, add(A, up), add(Dd, up), Dd);
      quad(B, Cc, add(Cc, up), add(B, up));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv = [];
      for (let i = 0; i < pos.length; i += 3) {
        const u = alongX ? pos[i] : pos[i + 2];
        const v = Math.hypot(alongX ? pos[i + 2] - mid : pos[i] - mid, pos[i + 1] - top);
        uv.push(u / (paja ? 1.5 : 1.2), v / (paja ? 1.5 : 1.2));
      }
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      // (de los dos lados: así no importa hacia dónde quedó cada cara)
      const m = new THREE.Mesh(geo, keepDouble(mat));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      // el fleco de paja que cuelga del alero
      if (paja) {
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(len + end * 2, 0.5), M.thatchFringe);
        const [fx, , fz] = P(len / 2, sg * (half + over + 0.02), 0);
        fr.position.set(fx, eave - 0.18, fz);
        fr.rotation.y = alongX ? 0 : Math.PI / 2;
        g.add(fr);
      }
    }
    // la cumbrera (un rollo de paja o de tejas)
    const [rx, , rz] = P(len / 2, 0, 0);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(paja ? 0.28 : 0.14, paja ? 0.28 : 0.14, len + end * 2, 8), mat);
    ridge.position.set(rx, top + thick * 0.6, rz);
    ridge.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
    g.add(ridge);
    // las cabeceras: el triángulo de tablas (o de revoque) arriba de la pared
    const sh = new THREE.Shape();
    sh.moveTo(-half, 0);
    sh.lineTo(half, 0);
    sh.lineTo(0, rise);
    sh.closePath();
    const shGeo = new THREE.ShapeGeometry(sh);
    const head = keepDouble(d.head ? M[d.head] : M.woodDark);
    for (const u of [0, len]) {
      const [px, , pz] = P(u, 0, 0);
      const t = new THREE.Mesh(shGeo, head);
      t.position.set(px, d.base, pz);
      t.rotation.y = alongX ? Math.PI / 2 : 0;
      g.add(t);
    }
  }
  w.root.add(pack(g));
}

const doubles = new WeakMap();
function keepDouble(m) {
  if (!doubles.has(m)) {
    const d = m.clone();
    d.side = THREE.DoubleSide;
    doubles.set(m, d);
  }
  return doubles.get(m);
}

// La iglesia de la reducción en ruinas: arriba de las paredes (que Levels
// corta a la altura de la zona) van bloques de arenisca de alturas
// desparejas, como muros que se cayeron a pedazos.
function buildRuins(w) {
  const r = rng(515);
  const keys = w.zoneKeys;
  const ruin = new Set(Object.keys(ZONES).filter((k) => ZONES[k].ruin).map((k) => keys.indexOf(k)));
  if (!ruin.size) return;
  const pos = [];
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] !== WALL) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inside(x + dx, z + dz) && ruin.has(w.zone[w.idx(x + dx, z + dz)])) near = true;
      if (!near) continue;
      const top = w.top[i];
      // la altura del pedazo que queda: una onda a lo largo del muro, con saltos
      const h = Math.max(0, Math.sin(x * 0.7 + z * 0.9) * 1.4 + Math.sin(x * 0.23 - z * 0.31) * 1.1 + (r() - 0.3) * 0.8);
      if (h < 0.15) continue;
      const steps = Math.ceil(h / 0.45);
      for (let k = 0; k < steps; k++) {
        const sh = Math.min(0.45, h - k * 0.45);
        const inset = k * 0.04 + r() * 0.05;
        pos.push([x + inset, top + k * 0.45, z + inset, x + 1 - inset, top + k * 0.45 + sh, z + 1 - inset]);
      }
    }
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), w.M.piedraRoja, pos.length);
  const m = new THREE.Matrix4();
  pos.forEach(([x0, y0, z0, x1, y1, z1], k) => {
    m.makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    im.setMatrixAt(k, m);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  w.root.add(im);
}

// El estero de lejos: islas bajas de monte y palmeras sueltas que salen del
// agua, en un anillo alrededor del mapa (el agua sola parecía un mar).
function buildHorizon(w) {
  const r = rng(77);
  const cx = MAP_W / 2;
  const cz = MAP_H / 2;
  const isles = [];
  const crowns = [];
  const palms = [];
  for (let k = 0; k < 46; k++) {
    const a = r() * Math.PI * 2;
    const d = 95 + r() * 120;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const R = 8 + r() * 22;
    isles.push([x, z, R, R * (0.4 + r() * 0.5)]);
    const n = Math.round(R / 3);
    for (let j = 0; j < n; j++) {
      const aa = r() * Math.PI * 2;
      const dd = r() * R * 0.8;
      crowns.push([x + Math.cos(aa) * dd, z + Math.sin(aa) * dd * 0.7, 2.5 + r() * 3, 3 + r() * 5]);
    }
    if (r() < 0.6) for (let j = 0; j < 3; j++) palms.push([x + (r() - 0.5) * R, z + (r() - 0.5) * R * 0.5, 7 + r() * 5]);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const isleMat = new THREE.MeshStandardMaterial({ color: 0x1c2414, roughness: 1 });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), isleMat, isles.length);
  isles.forEach(([x, z, R, Rz], k) => {
    q.setFromAxisAngle(v.set(0, 1, 0), r() * 3);
    m4.compose(v.set(x, WATER_Y - 0.4, z), q, s.set(R, 1.6, Rz));
    im.setMatrixAt(k, m4);
  });
  const cm = new THREE.InstancedMesh(leafCrownGeometry(), w.M.leafDark, crowns.length);
  crowns.forEach(([x, z, h, rad], k) => {
    q.setFromAxisAngle(v.set(0, 1, 0), r() * 3);
    m4.compose(v.set(x, WATER_Y + h, z), q, s.set(rad, rad * 0.7, rad));
    cm.setMatrixAt(k, m4);
  });
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1, 5).translate(0, 0.5, 0);
  const pm = new THREE.InstancedMesh(trunkGeo, w.M.palmTrunk, palms.length);
  const fm = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 1.4, 7).translate(0, -0.2, 0), w.M.palm, palms.length);
  palms.forEach(([x, z, h], k) => {
    q.setFromAxisAngle(v.set(0, 0, 1), (r() - 0.5) * 0.25);
    m4.compose(v.set(x, WATER_Y, z), q, s.set(1, h, 1));
    pm.setMatrixAt(k, m4);
    m4.compose(v.set(x, WATER_Y + h, z), q, s.set(1, 1, 1));
    fm.setMatrixAt(k, m4);
  });
  w.root.add(im, cm, pm, fm);
}

// Las armas de pared contra el pajonal van dibujadas en un tablón clavado en
// dos postes (si no, la tiza quedaba flotando entre las cañas).
function buildBoards(w) {
  const g = new THREE.Group();
  for (const d of WALL_BUYS) {
    const [x, z] = d.cell;
    const i = w.idx(x, z);
    if (w.grid[i] !== WALL || w.edge[i] !== EDGE_CORN) continue;
    const [fx, fz] = d.face;
    const y = w.floorAt(x + 0.5 + fx, z + 0.5 + fz);
    const b = new THREE.Group();
    // (el frente de las tablas queda 1 cm detrás de la tiza)
    b.position.set(x + 0.5 + fx * 0.505, y, z + 0.5 + fz * 0.505);
    b.rotation.y = Math.atan2(fx, fz);
    // tres tablas horizontales, un poco desparejas (tapan de 0.74 a 2 m)
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.42, 0.05), w.M.wood);
      t.position.set((k - 1) * 0.02, 0.95 + k * 0.42, -0.035);
      t.rotation.z = (k - 1) * 0.008;
      b.add(t);
    }
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), w.M.bark);
      post.position.set(sx * 0.9, 1.1, -0.1);
      b.add(post);
    }
    g.add(b);
  }
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  w.root.add(pack(g));
}
