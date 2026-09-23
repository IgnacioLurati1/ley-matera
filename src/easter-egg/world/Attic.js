import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { mesh, boxGeo, cylGeo } from './props';

// El Altillo del Patrón: un piso arriba de la Oficina (zona H), con una
// escalera empinada pegada a la pared este. Es chico, con una sola bajada, y
// cuando hay alguien arriba los muertos también se tiran por las claraboyas.
// Ahí está la mesa del curandero, donde se arma el Mate del Chiquitijuein.
//
// El resto del mapa es plano: acá están las cuentas de alturas que usan el
// jugador, los zombies y los disparos para saber en qué piso está cada uno.

// medidas en metros (x1 y z1 no incluidos)
export const ATTIC = { x0: 42, z0: 33, x1: 56, z1: 46, y: 3.6, top: 6.4 };
// la escalera sube hacia +z: abajo en z0, arriba (al nivel del altillo) en z1
export const STAIR = { x0: 54, x1: 56, z0: 41, z1: 46 };
// dónde se entra a la escalera desde cada piso
export const STAIR_BOTTOM = { x: 55, z: 40.4 };
export const STAIR_TOP = { x: 53.2, z: 45.35 };
// punto de la rampa donde se dobla para salir al altillo
export const STAIR_TURN = { x: 55, z: 45.55 };
export const SKYLIGHTS = [
  { x: 45.5, z: 36 },
  { x: 49.5, z: 42.5 },
  { x: 51.5, z: 35.5 },
];
export const ATTIC_NAME = 'Altillo del Patrón';
export const ATTIC_SUB = 'Lo que el patrón no quería que se viera';
// a partir de esta altura se está arriba
export const UP_Y = 2;

export const inStair = (x, z) => x >= STAIR.x0 && x < STAIR.x1 && z >= STAIR.z0 && z < STAIR.z1;
export const inAtticRect = (x, z) => x >= ATTIC.x0 && x < ATTIC.x1 && z >= ATTIC.z0 && z < ATTIC.z1;
export const inAttic = (x, z) => inAtticRect(x, z) && !inStair(x, z);
export const stairY = (z) => Math.min(1, Math.max(0, (z - STAIR.z0) / (STAIR.z1 - STAIR.z0))) * ATTIC.y;
// 0 abajo, 1 en el altillo
export const levelOf = (y) => ((y || 0) > UP_Y ? 1 : 0);

// Altura del piso bajo (x, z) para algo que está a la altura y.
export function floorAt(x, z, y = 0) {
  if (inStair(x, z)) {
    const h = stairY(z);
    // no se puede meter uno debajo de la rampa: o la pisa o está abajo
    return y >= h - 0.7 ? h : 0;
  }
  if (inAttic(x, z) && y > ATTIC.y - 1) return ATTIC.y;
  return 0;
}

// Arma el altillo en el mundo: geometría, colisiones y luz.
export function buildAttic(world) {
  const M = world.M;
  const gb = new GeoBuilder();
  const { x0, z0, x1, z1, y, top } = ATTIC;
  const H = top - y;

  // piso del altillo (arriba del techo de la oficina), menos el hueco de la escalera
  gb.flat('planks', x0, z0, STAIR.x0, z1, y + 0.002, true);
  gb.flat('planks', STAIR.x0, z0, x1, STAIR.z0, y + 0.002, true);
  // techo a dos aguas simple: plano con cabriadas
  gb.flat('planksDark', x0, z0, x1, z1, top, false);
  for (let x = x0 + 1.2; x < x1; x += 2.2) gb.box('beam', x - 0.09, top - 0.28, z0, x + 0.09, top, z1);
  gb.box('beam', x0, top - 0.5, (z0 + z1) / 2 - 0.1, x1, top - 0.28, (z0 + z1) / 2 + 0.1);
  // paredes de adentro (tablas viejas) y de afuera (ladrillo)
  const walls = [
    [x0, z0, x1, z0, [0, 0, 1], [0, 0, -1]],
    [x1, z0, x1, z1, [-1, 0, 0], [1, 0, 0]],
    [x1, z1, x0, z1, [0, 0, -1], [0, 0, 1]],
    [x0, z1, x0, z0, [1, 0, 0], [-1, 0, 0]],
  ];
  for (const [ax, az, bx, bz, nIn, nOut] of walls) {
    gb.wall('planksDark', ax, az, bx, bz, y, top, nIn, H);
    // la cara de afuera, un metro más allá (el grueso de la pared)
    const ox = nOut[0];
    const oz = nOut[2];
    gb.wall('exterior', bx + ox, bz + oz, ax + ox, az + oz, y, top, nOut, H);
    // tapa de arriba de la pared
    const lx = Math.min(ax, bx, ax + ox, bx + ox);
    const hx = Math.max(ax, bx, ax + ox, bx + ox);
    const lz = Math.min(az, bz, az + oz, bz + oz);
    const hz = Math.max(az, bz, az + oz, bz + oz);
    gb.flat('wallTop', lx, lz, hx, hz, top + 0.001, true);
  }
  // zócalo del altillo
  gb.box('trim', x0, y, z0, x1, y + 0.12, z0 + 0.04);
  gb.box('trim', x0, y, z1 - 0.04, STAIR.x0, y + 0.12, z1);
  gb.box('trim', x0, y, z0, x0 + 0.04, y + 0.12, z1);

  // la escalera: escalones, zancas y la baranda del lado abierto
  const steps = 12;
  const d = (STAIR.z1 - STAIR.z0) / steps;
  for (let i = 0; i < steps; i++) {
    const za = STAIR.z0 + i * d;
    const h = stairY(za + d);
    gb.box('planks', STAIR.x0 + 0.05, h - 0.06, za, STAIR.x1 - 0.05, h, za + d + 0.02);
    // contrahuella
    gb.box('woodDark', STAIR.x0 + 0.05, Math.max(0, h - 0.3), za, STAIR.x1 - 0.05, h - 0.06, za + 0.03);
  }
  gb.box('beam', STAIR.x0 - 0.02, 0, STAIR.z0, STAIR.x0 + 0.08, 0.35, STAIR.z1);
  for (let i = 0; i <= 5; i++) {
    const zp = STAIR.z0 + 0.2 + i * ((STAIR.z1 - STAIR.z0 - 0.4) / 5);
    const h = stairY(zp);
    gb.box('trim', STAIR.x0 - 0.02, h, zp - 0.03, STAIR.x0 + 0.04, h + 1, zp + 0.03);
  }
  // pasamanos inclinado: tramos cortos que siguen la rampa
  for (let i = 0; i < 10; i++) {
    const za = STAIR.z0 + 0.2 + i * ((STAIR.z1 - STAIR.z0 - 0.4) / 10);
    const zb = za + (STAIR.z1 - STAIR.z0 - 0.4) / 10;
    const h = (stairY(za) + stairY(zb)) / 2 + 1;
    gb.box('trim', STAIR.x0 - 0.03, h - 0.03, za, STAIR.x0 + 0.05, h + 0.03, zb);
  }
  // baranda del altillo alrededor del hueco (deja libre la llegada de arriba)
  const railZ = 44.8;
  gb.box('trim', STAIR.x0 - 0.06, y + 0.95, STAIR.z0, STAIR.x0 + 0.02, y + 1.02, railZ);
  gb.box('trim', STAIR.x0, y + 0.95, STAIR.z0 - 0.06, STAIR.x1, y + 1.02, STAIR.z0 + 0.02);
  for (let zp = STAIR.z0; zp <= railZ; zp += 0.9) gb.box('trim', STAIR.x0 - 0.06, y, zp - 0.03, STAIR.x0 + 0.02, y + 1, zp + 0.03);
  for (let xp = STAIR.x0; xp <= STAIR.x1; xp += 0.9) gb.box('trim', xp - 0.03, y, STAIR.z0 - 0.06, xp + 0.03, y + 1, STAIR.z0 + 0.02);
  // borde del piso visto desde la escalera
  gb.box('woodDark', STAIR.x0 - 0.02, y - 0.18, STAIR.z0, STAIR.x0 + 0.02, y, railZ + 1.2);
  gb.box('woodDark', STAIR.x0, y - 0.18, STAIR.z0 - 0.02, STAIR.x1, y, STAIR.z0 + 0.02);

  // claraboyas: marco en el techo (los muertos se tiran por ahí)
  for (const s of SKYLIGHTS) {
    gb.box('trim', s.x - 0.75, top - 0.12, s.z - 0.6, s.x + 0.75, top, s.z - 0.5);
    gb.box('trim', s.x - 0.75, top - 0.12, s.z + 0.5, s.x + 0.75, top, s.z + 0.6);
    gb.box('trim', s.x - 0.75, top - 0.12, s.z - 0.5, s.x - 0.65, top, s.z + 0.5);
    gb.box('trim', s.x + 0.65, top - 0.12, s.z - 0.5, s.x + 0.75, top, s.z + 0.5);
  }
  const arch = gb.build(M);
  world.root.add(arch);

  // vidrios rotos de las claraboyas y la luz de luna que entra
  const moonMat = new THREE.MeshBasicMaterial({ color: 0x8fa8d8, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.MeshBasicMaterial({ color: 0x1a2436, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  for (const s of SKYLIGHTS) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1).rotateX(Math.PI / 2), glass);
    g.position.set(s.x, top - 0.01, s.z);
    world.root.add(g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, H, 10, 1, true), moonMat);
    beam.position.set(s.x, y + H / 2, s.z);
    world.root.add(beam);
  }

  // cosas viejas del patrón
  const P = new THREE.Group();
  world.root.add(P);
  const trunk = new THREE.Group();
  trunk.add(mesh(boxGeo(1.1, 0.55, 0.6), M.leather, 0, 0.28, 0));
  trunk.add(mesh(boxGeo(1.12, 0.06, 0.62), M.brass, 0, 0.5, 0));
  trunk.position.set(43, y, 44.9);
  P.add(trunk);
  world.addBox([42.4, y, 44.55, 43.6, y + 0.6, 45.3], { kind: 'prop' });
  for (const [sx, sz, r] of [[42.6, 34, 0.2], [43.4, 33.7, -0.3], [47, 33.6, 0.1]]) {
    const sack = mesh(boxGeo(0.7, 0.8, 0.45), M.sackYerba, sx, y + 0.4, sz, 0, r, 0);
    P.add(sack);
  }
  world.addBox([42, y, 33, 44, y + 0.8, 34.3], { kind: 'prop' });
  const chair = new THREE.Group();
  chair.add(mesh(boxGeo(0.5, 0.05, 0.5), M.woodDark || M.wood, 0, 0.45, 0));
  chair.add(mesh(boxGeo(0.5, 0.6, 0.05), M.woodDark || M.wood, 0, 0.75, -0.23, -0.2, 0, 0));
  for (const [a, b] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) chair.add(mesh(cylGeo(0.025, 0.025, 0.45, 6), M.wood, a, 0.22, b));
  chair.position.set(49.5, y, 38);
  chair.rotation.set(0, 0.7, 1.35);
  P.add(chair);

  // colisiones: paredes del altillo, baranda y lo de abajo de la escalera
  world.addBox([x0 - 1, y, z0 - 1, x0, top, z1 + 1], { kind: 'wall' });
  world.addBox([x1, y, z0 - 1, x1 + 1, top, z1 + 1], { kind: 'wall' });
  world.addBox([x0, y, z0 - 1, x1, top, z0], { kind: 'wall' });
  world.addBox([x0, y, z1, x1, top, z1 + 1], { kind: 'wall' });
  world.addBox([STAIR.x0 - 0.1, 0.8, STAIR.z0, STAIR.x0 + 0.05, y + 1, railZ], { kind: 'rail' });
  world.addBox([STAIR.x0, y, STAIR.z0 - 0.1, STAIR.x1, y + 1, STAIR.z0 + 0.02], { kind: 'rail' });
  for (let i = 0; i < steps; i++) {
    const za = STAIR.z0 + i * d;
    const h = stairY(za) - 0.35;
    if (h > 0.05) world.addBox([STAIR.x0, 0, za, STAIR.x1, h, za + d], { kind: 'stair' });
  }
  // piso y techo del altillo: frenan tiros y vistas, pero no a los que caminan
  world.addBox([x0, y - 0.15, z0, STAIR.x0, y, z1], { kind: 'slab', solid: false });
  world.addBox([STAIR.x0, y - 0.15, z0, x1, y, STAIR.z0], { kind: 'slab', solid: false });
  world.addBox([x0, top, z0, x1, top + 0.2, z1], { kind: 'slab', solid: false });

  // luz: velas en la mesa del curandero (la mesa la arma el que maneja el mate)
  const candle = new THREE.PointLight(0xffa860, 16, 12, 1.4);
  candle.position.set(48.5, y + 1.6, 44.2);
  world.root.add(candle);
  return { candle };
}

// Celdas de la escalera: abajo no se puede caminar por ahí (es la rampa).
export function blockStairCells(world) {
  for (let z = STAIR.z0; z < STAIR.z1; z++) for (let x = STAIR.x0; x < STAIR.x1; x++) world.navBlock[world.idx(x, z)] = 1;
}

// Navegación del altillo: una grilla aparte con solo las celdas de arriba.
export function atticNavWorld(world) {
  const n = world.W * world.H;
  const block = new Uint8Array(n).fill(1);
  for (let z = ATTIC.z0; z < ATTIC.z1; z++) {
    for (let x = ATTIC.x0; x < ATTIC.x1; x++) if (inAttic(x + 0.5, z + 0.5)) block[world.idx(x, z)] = 0;
  }
  // el baúl, las bolsas y la mesa del curandero
  for (const [x, z] of [[42, 44], [43, 44], [42, 45], [43, 45], [42, 33], [43, 33], [47, 44], [48, 44], [49, 44], [47, 45], [48, 45], [49, 45]]) block[world.idx(x, z)] = 1;
  return { W: world.W, H: world.H, inside: (x, z) => world.inside(x, z), idx: (x, z) => world.idx(x, z), navBlock: block, navVersion: 1 };
}
