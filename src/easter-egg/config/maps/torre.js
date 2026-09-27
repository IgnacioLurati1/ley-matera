// "Revelaciones Materas": la torre del remolino, el último mapa. Una torre de
// quince pisos (inspirada en las "towers" de los mapas custom de Black Ops 3)
// parada en el ojo de un remolino de viento que no deja ver qué hay más allá.
// Grilla de 1 m, x hacia el este y z hacia el sur.
//
// Todos los pisos tienen la misma planta: un cuadrado de 24 x 24 (celdas 18 a
// 41) con arcadas abiertas al remolino y un agujero de 8 x 8 en el medio por
// donde uno se cae. Los pisos 1, 5, 10 y 15 no tienen agujero (son las plazas).
// De cada piso sube una escalera pegada a una pared distinta (norte, este,
// sur, oeste, y vuelve a empezar), tapada con escombros que se pagan. La torre
// y su modelo de pisos apilados están en world/Tower.js; la pelea final (el
// Infierno Matero) queda lejos, al este, encerrada en una caverna.

export const MAP_W = 110;
export const MAP_H = 60;
export const WALL_H = 3.6;

const FH = 4;
const FLOORS = 15;
const yOf = (n) => (n - 1) * FH;

// Escaleras de cada lado (la del piso n va del lado (n - 1) % 4). `dir` es
// hacia dónde sube.
const SIDES = [
  { rect: [22, 18, 29, 19], dir: '+x' },
  { rect: [40, 22, 41, 29], dir: '+z' },
  { rect: [30, 40, 37, 41], dir: '-x' },
  { rect: [18, 30, 19, 37], dir: '-z' },
];
// Primera fila de escalones (ahí van los escombros).
const BOTTOM = [
  [[22, 18], [22, 19]],
  [[40, 22], [41, 22]],
  [[37, 40], [37, 41]],
  [[18, 37], [19, 37]],
];

export const TOWER = {
  floors: FLOORS,
  fh: FH,
  slab: 0.3,
  x0: 18,
  z0: 18,
  x1: 41,
  z1: 41,
  cx: 30,
  cz: 30,
  hole: [26, 26, 33, 33],
  solid: [1, 5, 10, 15],
  // la planta de cada piso con agujero (world/towerDecor.js layoutPieces): el
  // anillo abierto (los que no están), 'halves' (dos paredes con puerta abierta
  // en los lados sin escalera: un ala aparte) o 'cloister' (columnas alrededor
  // del agujero, afuera del anillo libre de 2 m)
  layouts: { 3: 'halves', 4: 'cloister', 7: 'halves', 8: 'cloister', 11: 'halves', 13: 'cloister', 14: 'halves' },
  // pilares de la arcada (a lo largo de cada lado); lo demás son arcos con baranda
  piers: [[18, 20], [25, 27], [32, 34], [39, 41]],
  sides: SIDES,
  stairs: Array.from({ length: FLOORS - 1 }, (_, i) => ({ n: i + 1, side: i % 4, ...SIDES[i % 4] })),
  // la escalera divina: una espiral dorada que sube desde la plaza del piso 15
  sky: { r0: 4.3, r1: 7.2, pitch: 9, turns: 2.6, a0: Math.PI * 0.75, breakAt: 15 },
  // la caverna del final
  arena: { x: 88, z: 30, r: 14, y: 0 },
  // el llano de afuera (world/Llano.js): la explanada donde aparece el Chiquitijuein
  llano: { spot: [24, -34] },
};

// ---------------- zonas: un piso cada una ----------------
const THEMES = [
  ['El Zaguán del Remolino', 'Revelaciones Materas · La torre del fin del mundo', 'calcareo', 'stoneWall'],
  ['La Yerbera', 'Olor a barbacuá, como en el molino', 'planks', 'brick'],
  ['El Secadero', 'La yerba se seca... y los muertos también', 'terracotta', 'brickSoot'],
  ['La Pulpería Colgada', 'Nadie paga la cuenta hace cien años', 'planks', 'plasterGreen'],
  ['La Plaza de las Ánimas', 'Acá descansan los que no llegaron arriba', 'calcareo', 'stoneWall'],
  ['El Galpón del Viento', 'Chapas que golpean solas', 'dirt', 'barn'],
  ['El Tambo Perdido', 'Ya no queda ni una vaca', 'planks', 'adobe'],
  ['El Maizal Colgante', 'Maíz que crece para abajo', 'dirtDark', 'adobe'],
  ['La Tapera de Arriba', 'La misma tapera... otra vez', 'planks', 'barn'],
  ['El Patio del Sello', 'Algo duerme debajo de las baldosas', 'damero', 'stoneWall'],
  ['Los Calabozos Altos', 'El penal también subió', 'concrete', 'cellWall'],
  ['La Enfermería del Viento', 'Camas que tiemblan con cada ráfaga', 'azulejo', 'whitewash'],
  ['La Capilla Torcida', 'Un santo sin cara mira para abajo', 'calcareo', 'whitewash'],
  ['El Pabellón de los Santos', 'Velas que no se apagan con el viento', 'concrete', 'cellWall'],
  ['La Cima del Remolino', 'Arriba de todo, la Voz', 'calcareo', 'stoneWall'],
];

export const ZONES = {};
THEMES.forEach(([name, sub, floor, wall], i) => {
  const n = i + 1;
  ZONES[`P${n}`] = { name: `Piso ${n} · ${name}`, sub, y: yOf(n), n, rects: [[18, 18, 41, 41]], floor, wall, ext: 'stoneWall' };
});
ZONES.INF = { name: 'El Infierno Matero', sub: 'Donde la yerba arde para siempre', y: 0, circle: { x: 88, z: 30, r: 14 }, floor: 'dirtDark', ext: 'stoneWall' };

export const RAMPS = [];
export const RIVER = [];

export const START_ZONE = 'P1';
export const PLAYER_START = { x: 30, z: 37, yaw: 0 };

// Escombros de cada escalera: cada uno sale un 22% más que el de abajo (de
// 700 a unos 9.300 en solitario) y +50% por cada jugador de más, así hay que
// quedarse un rato en cada piso y convidarse la plata para subir.
export const DOORS = TOWER.stairs.map((s, i) => ({
  id: i + 1,
  zones: [`P${s.n}`, `P${s.n + 1}`],
  cells: BOTTOM[s.side],
  cost: Math.round((700 * 1.22 ** i) / 50) * 50,
  perPlayer: 0.5,
  kind: 'debris',
  y: yOf(s.n),
}));

// En la torre no hay ventanas con tablas: los muertos salen de cada piso.
export const WINDOWS = [];

// Pozos: cuatro por piso, en molinete alrededor del agujero (lejos de las
// escaleras, de las máquinas y de la utilería de las esquinas).
const CORNERS = [
  [33.5, 22.5],
  [37.5, 26.5],
  [26.5, 37.5],
  [22.5, 33.5],
];
export const RISERS = [];
for (let n = 1; n <= FLOORS; n++) for (const [x, z] of CORNERS) RISERS.push({ zone: `P${n}`, pos: [x, z], y: yOf(n) });

// Lugares contra los pilares: norte (z=17), este (x=42), sur (z=42), oeste (x=17).
const N = (x, n) => ({ cell: [x, 17], face: [0, 1], y: yOf(n) });
const E = (z, n) => ({ cell: [42, z], face: [-1, 0], y: yOf(n) });
const S = (x, n) => ({ cell: [x, 42], face: [0, -1], y: yOf(n) });
const W = (z, n) => ({ cell: [17, z], face: [1, 0], y: yOf(n) });

export const WALL_BUYS = [
  { weapon: 'madera', ...S(26, 1) },
  { weapon: 'plastico', ...E(33, 1) },
  { weapon: 'vidrio', ...S(33, 2) },
  { weapon: 'lata', ...N(33, 4) },
  { weapon: 'algarrobo', ...W(26, 6) },
  { weapon: 'granadas', ...E(33, 8) },
  { weapon: 'bowie', ...S(26, 9) },
  // el Rayo Matero Mark III: en la pared de la cima (también sale de la caja)
  { weapon: 'mk3', ...W(26, 15) },
];

// Perks: uno por piso, repartidos a lo alto de la torre (hay que subir para
// armarse). La Flopa Hermanos (PhD Flopper) queda en el Patio del Sello, que
// es donde se usa para el easter egg.
export const PERK_SPOTS = [
  { perk: 'revive', ...W(26, 1) },
  { perk: 'speed', ...N(26, 3) },
  { perk: 'jugg', ...E(26, 5) },
  { perk: 'doubletap', ...W(33, 7) },
  { perk: 'phd', ...S(26, 10) },
  { perk: 'mule', ...N(26, 12) },
  { perk: 'deadshot', ...E(26, 13) },
];

// La llave de la luz de la torre, en la Plaza de las Ánimas.
export const POWER = E(33, 5);
export const PAP = { ...W(26, 10), width: 2 };

export const BOX_SPOTS = [
  { ...W(33, 3), zone: 'P3' },
  { ...N(33, 7), zone: 'P7' },
  { ...W(33, 11), zone: 'P11' },
  { ...S(26, 14), zone: 'P14' },
];
export const BOX_START = [0];

// Las luces las maneja la torre (unas pocas que siguen al jugador de piso en piso).
export const LIGHTS = [];

// Easter egg "Las Revelaciones" (entities/TowerEgg.js).
export const EE = {
  fierro: { pos: [29.2, 30.4], rot: 0.4, y: 0 },
  fogon: [30.4, 31.6],
  cano: { pos: [37.2, 20.6], y: yOf(3) },
  rueda: { pos: [30, 30], y: yOf(8), land: yOf(5) },
  sello: { pos: [30, 30], r: 3.4, y: yOf(10) },
  canon: { pos: [30, 30], y: yOf(15), cage: 8.6, souls: 24 },
  // la escalera divina: 40.000 solo y 20.000 más por cada jugador (TowerEgg.endingCost)
  ending: { ...N(33, 15), cost: 40000, perPlayer: 20000 },
  arena: TOWER.arena,
};

// ---------------- utilería de cada piso ----------------
const P = (n, type, x, z, rot = 0, extra = {}) => ({ type, pos: [x, z], rot, y: yOf(n), ...extra });
export const PROPS = [
  // 1: el zaguán (el fogón del Abuelo va con el easter egg)
  P(1, 'crates', 36.5, 39.5, 0.2),
  P(1, 'barrel', 23.2, 40.2),
  P(1, 'sacks', 21, 34.5, 0.4),
  // colgada del pilar este, pegada a la pared y abajo de la moldura (en 30.5 hay arco: flotaba)
  P(1, 'cross', 41.98, 26.5, -Math.PI / 2, { y: yOf(1) - 0.22 }),
  // 2: la yerbera
  P(2, 'bigsacks', 36.6, 21.2, 0.1),
  P(2, 'sacks', 24.5, 40.2, 0.2),
  P(2, 'pallets', 39.4, 38.2, 0.3),
  P(2, 'yerbahang', 20.4, 33.5, Math.PI / 2),
  // 3: el secadero
  P(3, 'firewood', 24, 21.2, 0),
  P(3, 'barrel', 38.8, 36.2),
  P(3, 'rack', 21.2, 26.5, Math.PI / 2),
  // 4: la pulpería
  P(4, 'counter', 21.3, 27, Math.PI / 2),
  P(4, 'shelfWall', 18.55, 27, Math.PI / 2, { len: 3 }),
  P(4, 'desk', 38.8, 38.8, -0.3),
  P(4, 'chair', 37.6, 38.2, 2.2),
  P(4, 'crates', 36.6, 20.6, 0.4),
  // 5: la plaza
  P(5, 'pew', 22.5, 24.5, Math.PI / 2),
  P(5, 'pew', 22.5, 35.5, Math.PI / 2),
  P(5, 'candles', 30, 34.4),
  P(5, 'candles', 30, 25.6),
  // 6: el galpón
  P(6, 'hay', 36.5, 21, 0.3),
  P(6, 'tires', 38.8, 38, 0),
  P(6, 'toolrack', 24, 41.45, Math.PI),
  P(6, 'trough', 19.2, 37.5, Math.PI / 2),
  // 7: el tambo
  P(7, 'milkcans', 38.6, 38.5),
  P(7, 'washtub', 21.5, 38.5),
  P(7, 'saddle', 39.6, 33.5, -Math.PI / 2),
  P(7, 'hay', 23.5, 21.2, 0.2),
  // 8: el maizal colgante
  P(8, 'zapallos', 21.5, 25.5, 0),
  P(8, 'espantajo', 38.4, 37.8, 0.6),
  P(8, 'barrow', 36.4, 20.8, 0.8),
  // 9: la tapera de arriba
  P(9, 'bed', 38.6, 38.2, 0),
  P(9, 'wardrobe', 41.45, 26.5, -Math.PI / 2),
  P(9, 'rocker', 22, 21.8, 0.5),
  P(9, 'stove', 24.5, 40.9, Math.PI),
  // 10: el patio del sello
  P(10, 'candles', 25, 30),
  P(10, 'candles', 35, 30),
  P(10, 'crates', 38.6, 20.8, 0.2),
  // 11: los calabozos altos
  P(11, 'celdaK', 38.2, 38.2, Math.PI, { w: 5, d: 4 }),
  P(11, 'grilletes', 41.95, 34.5, -Math.PI / 2),
  P(11, 'balde', 22, 21.5),
  P(11, 'colchon', 24, 38.8, 0.3),
  // 12: la enfermería
  P(12, 'camaEnf', 24.5, 39.8, 0),
  P(12, 'camaEnf', 22.2, 21.8, Math.PI),
  P(12, 'vitrina', 18.45, 22.5, Math.PI / 2),
  P(12, 'biombo', 37.4, 38.6, 0.5),
  // 13: la capilla torcida
  P(13, 'altar', 30, 38.8, Math.PI),
  P(13, 'pew', 24, 36.5, Math.PI),
  P(13, 'pew', 36, 22.5, 0),
  P(13, 'banderas', 21.5, 38.4),
  // 14: el pabellón de los santos
  P(14, 'santuario', 38.5, 38.8, Math.PI),
  P(14, 'candles', 22, 22),
  P(14, 'cadenas', 37.5, 21.2, 0),
  // 15: la cima
  P(15, 'banderas', 21, 21),
  P(15, 'banderas', 39, 21),
  P(15, 'banderas', 21, 39),
  P(15, 'banderas', 39, 39),
  // ---- más detalle de cada piso (lejos de las máquinas, los pozos y las escaleras) ----
  // lo de las paredes va contra la cara de los pilares (x/z 18 o 42)
  // 1: el zaguán, con su alfombra, el banco de espera y el perchero
  P(1, 'rug', 30, 38.6, 0),
  P(1, 'bancoMadera', 18.75, 34.6, Math.PI / 2),
  P(1, 'perchero', 40.6, 21.4),
  P(1, 'chest', 38.4, 18.7, 0),
  P(1, 'retrato', 18.02, 33.5, Math.PI / 2),
  P(1, 'picture', 33.5, 41.98, Math.PI),
  P(1, 'manchas', 23.5, 23.5),
  P(1, 'papeles', 36, 36),
  // 2: la yerbera: la mesa de canchear y más bolsas
  P(2, 'sacks', 20.8, 21, 0.6),
  P(2, 'mesaLarga', 36.8, 34.6, Math.PI / 2, { len: 3 }),
  P(2, 'yerbahang', 26.5, 41.9, Math.PI),
  P(2, 'barrow', 22.8, 38.4, 0.4),
  // 3: el secadero: el barbacuá donde se seca la yerba
  P(3, 'barbacua', 22, 38.8, 0),
  P(3, 'sacks', 35.4, 38.3, 0.3),
  P(3, 'manchas', 31, 23),
  // 4: la pulpería: mesas con sillas, barriles y el cartel
  P(4, 'table', 37, 32.5, Math.PI / 2),
  P(4, 'chair', 35.9, 32.2, Math.PI / 2),
  P(4, 'chair', 38.1, 32.8, -Math.PI / 2),
  P(4, 'table', 23.5, 39.8, 0),
  P(4, 'chair', 23.5, 38.8, Math.PI),
  P(4, 'barrel', 40.6, 19.2),
  P(4, 'barrel', 40.8, 20.2),
  P(4, 'cartel', 26.5, 18.02, 0, { text: 'PULPERÍA' }),
  // 5: la plaza: bancos de piedra y cruces para las ánimas
  P(5, 'bancoPiedra', 28, 40.9, Math.PI),
  P(5, 'bancoPiedra', 32, 40.9, Math.PI),
  P(5, 'cross', 26.5, 41.88, Math.PI),
  P(5, 'cross', 33.5, 41.88, Math.PI),
  P(5, 'candles', 38.6, 39),
  // 6: el galpón: el generador viejo, cajones y tachos
  P(6, 'generator', 22.5, 21.2, 0),
  P(6, 'cajones', 35.2, 36.4, 0.2),
  P(6, 'tachos', 40.4, 35, 0),
  // 7: el tambo: el gallinero y el bebedero
  P(7, 'coop', 38.8, 20.9, 0),
  P(7, 'trough', 27.2, 40.9, 0),
  P(7, 'milkcans', 24.2, 40.8),
  // 8: el maizal: más zapallos y bolsas
  P(8, 'zapallos', 37.8, 23.6, 0.5),
  P(8, 'sacks', 20, 21, 0.3),
  // 9: la tapera: la mesa con dos sillas, la alfombra y las ollas
  P(9, 'table', 37.8, 21.5, 0),
  P(9, 'chair', 37.8, 20.55, 0),
  P(9, 'chair', 37.8, 22.45, Math.PI),
  P(9, 'rug', 37.2, 35.2, Math.PI / 2),
  P(9, 'potrack', 24.5, 41.2, Math.PI),
  P(9, 'picture', 41.98, 33.5, -Math.PI / 2),
  P(9, 'cabinet', 19, 19.3, 0),
  P(9, 'chest', 38.6, 36.5, 0),
  // 10: el patio del sello
  P(10, 'bancoPiedra', 33.5, 40.9, Math.PI),
  // (las banderas van arriba de la moldura del pilar, que a 2 m las cortaba)
  P(10, 'bandera', 41.98, 33.5, -Math.PI / 2, { y: yOf(10) + 0.45 }),
  P(10, 'manchas', 36, 36),
  P(10, 'candles', 21, 39.5),
  // 11: los calabozos: los casilleros de los guardias y su mesa
  P(11, 'lockers', 21.5, 18.05, 0),
  P(11, 'mesaGuardia', 33.5, 36.5, 0),
  P(11, 'charco', 30, 22.8),
  P(11, 'manchas', 25, 36),
  // 12: la enfermería: más camas y la vitrina de los remedios
  P(12, 'camaEnf', 40.3, 36.2, Math.PI / 2),
  P(12, 'camaEnf', 36.5, 21.2, Math.PI),
  P(12, 'perchero', 23.2, 37.6),
  P(12, 'vitrina', 41.55, 26.5, -Math.PI / 2),
  P(12, 'papeles', 34.5, 24.4),
  // 13: la capilla: más bancos, velas al pie del altar y el santo (world/Tower.js)
  P(13, 'pew', 36, 36.5, Math.PI),
  P(13, 'pew', 24, 22.5, 0),
  P(13, 'candles', 27.2, 39.6),
  P(13, 'candles', 32.8, 39.6),
  P(13, 'retrato', 41.98, 33.5, -Math.PI / 2),
  // 14: el pabellón de los santos: velas por todos lados
  P(14, 'candles', 35, 36.2),
  P(14, 'candles', 24.3, 35.8),
  P(14, 'santuario', 18.5, 22.5, Math.PI / 2),
  P(14, 'retrato', 18.02, 33.5, Math.PI / 2),
  P(14, 'cross', 18.12, 26.5, Math.PI / 2),
  // (en el otro pilar: en el de 33.5 está el farol de la pared)
  P(14, 'bandera', 26.5, 41.98, Math.PI, { y: yOf(14) + 0.45 }),
  // ---- el pase de detalle (2026-09-26): lo que le da carácter a cada piso ----
  // Ubicado contra las paredes y en las esquinas, lejos del anillo del agujero
  // (2 m), de las escaleras con su entrada y su salida, de las máquinas y de los
  // pozos (se comprobó que se llega caminando a todos lados). Lo chico que no
  // choca (velas, estantes, apliques, postigos, lo tirado) está en world/towerDecor.js.
  P(1, 'well', 19.19, 21.91, Math.PI),
  P(1, 'armchair', 18.53, 36.58, Math.PI / 2),
  P(1, 'bookshelf', 41.74, 19.19, -Math.PI / 2),
  P(1, 'cabinet', 18.36, 40.11, Math.PI / 2),
  P(1, 'desk', 22.99, 41.47, Math.PI),
  P(1, 'chair', 39.73, 23.08, -0.11),
  P(1, 'barrel', 31.93, 41.62, Math.PI),
  P(1, 'crates', 29.97, 41.5, Math.PI),
  P(1, 'sacks', 33.87, 18.31, 0),
  P(2, 'bigsacks', 19.29, 39.98, Math.PI),
  P(2, 'pallets', 18.68, 22.46, Math.PI / 2),
  P(2, 'pallets', 41.32, 33.15, -Math.PI / 2),
  P(2, 'sacks', 23.3, 41.69, Math.PI),
  P(2, 'sacks', 18.31, 31, Math.PI / 2),
  P(2, 'firewood', 28.97, 41.39, Math.PI),
  P(2, 'barrow', 20.39, 29.29, 4.55),
  P(2, 'bigsacks', 39.07, 40.89, Math.PI),
  P(2, 'crates', 36.15, 18.5, 0),
  P(3, 'firewood', 21.58, 18.61, 0),
  P(3, 'firewood', 20.07, 41.39, Math.PI),
  P(3, 'rack', 18.76, 26.42, Math.PI / 2),
  P(3, 'sacks', 18.31, 19.11, Math.PI / 2),
  P(3, 'barrel', 40.62, 41.62, Math.PI),
  P(3, 'barrel', 33.25, 18.38, 0),
  P(3, 'caldero', 28.47, 21.89, 1.67),
  P(3, 'pallets', 26.86, 41.32, Math.PI),
  P(3, 'bigsacks', 40.89, 33.8, -Math.PI / 2),
  P(4, 'table', 19.57, 20.5, -0.08),
  P(4, 'chair', 19.1, 21.4, Math.PI),
  P(4, 'chair', 20.25, 21.45, 2.8),
  P(4, 'barrel', 18.38, 23.91, Math.PI / 2),
  P(4, 'barrel', 27.41, 41.62, Math.PI),
  P(4, 'crates', 22.27, 41.5, Math.PI),
  P(4, 'bookshelf', 41.74, 19.32, -Math.PI / 2),
  P(4, 'chest', 38.26, 18.32, 0),
  P(5, 'tumbas', 38.24, 18.91, 0),
  P(5, 'santuario', 18.3, 23.43, Math.PI / 2),
  P(5, 'santuario', 41.7, 29.3, -Math.PI / 2),
  P(5, 'ofrendas', 35.19, 41.78, Math.PI),
  P(5, 'ofrendas', 18.22, 21.87, Math.PI / 2),
  P(5, 'ofrendas', 19.17, 41.78, Math.PI),
  P(5, 'ofrendas', 41.78, 22.75, -Math.PI / 2),
  P(5, 'bancoPiedra', 36.96, 41.69, Math.PI),
  P(5, 'candles', 41.72, 37.18, -Math.PI / 2),
  P(5, 'candles', 41.72, 21.73, -Math.PI / 2),
  P(6, 'tractor', 22.1, 38.68, 0),
  P(6, 'gastank', 41.77, 19.23, -Math.PI / 2),
  P(6, 'gastank', 41.77, 37.91, -Math.PI / 2),
  P(6, 'plow', 18.36, 23.31, Math.PI / 2),
  P(6, 'tires', 41.44, 40.28, -Math.PI / 2),
  P(6, 'cajones', 18.31, 33.25, Math.PI / 2),
  P(6, 'crates', 36.36, 41.5, Math.PI),
  P(6, 'barrel', 41.62, 33.32, -Math.PI / 2),
  P(7, 'tank', 19.88, 20.15, Math.PI / 2),
  P(7, 'washline', 29.53, 18.14, 0),
  P(7, 'plow', 41.64, 35.56, -Math.PI / 2),
  P(7, 'rollo', 18.66, 41.19, Math.PI),
  P(7, 'rollo', 18.81, 37.22, Math.PI / 2),
  P(7, 'milkcans', 41.36, 38.08, -Math.PI / 2),
  P(7, 'trough', 24.88, 18.36, 0),
  P(7, 'hay', 41.07, 41.64, Math.PI),
  P(7, 'barrel', 36.61, 18.38, 0),
  P(8, 'huerta', 39.44, 20.02, Math.PI),
  P(8, 'cart', 41.04, 29.34, -Math.PI / 2),
  P(8, 'rollo', 21.61, 18.81, 0),
  P(8, 'sacks', 26.63, 18.31, 0),
  P(8, 'zapallos', 41.34, 22.76, -Math.PI / 2),
  P(8, 'barrow', 30.15, 21.94, -0.22),
  P(8, 'hay', 41.64, 26.45, -Math.PI / 2),
  P(9, 'fogon', 40.23, 20.73, Math.PI / 2),
  P(9, 'washline', 41.86, 24.02, -Math.PI / 2),
  P(9, 'armchair', 40.03, 41.47, Math.PI),
  P(9, 'bookshelf', 34.76, 18.26, 0),
  P(9, 'barrel', 41.62, 34.64, -Math.PI / 2),
  P(9, 'chest', 40.67, 18.32, 0),
  P(9, 'logseat', 29.69, 40.18, 1.47),
  P(9, 'crates', 31.87, 41.5, Math.PI),
  P(10, 'tumbas', 38.41, 41.09, Math.PI),
  P(10, 'santuario', 18.9, 41.7, Math.PI),
  P(10, 'santuario', 41.52, 18.3, 0),
  P(10, 'ofrendas', 18.22, 36.6, Math.PI / 2),
  P(10, 'ofrendas', 38.39, 18.22, 0),
  P(10, 'ofrendas', 18.22, 22.17, Math.PI / 2),
  P(10, 'escombros', 30.76, 22.41, 3.49),
  P(10, 'escombros', 41.15, 37.76, 1.56),
  P(10, 'barrel', 18.38, 37.94, Math.PI / 2),
  P(10, 'candles', 32.82, 41.72, Math.PI),
  P(11, 'celdasFalsas', 19.6, 41.96, Math.PI, { len: 3 }),
  P(11, 'pizarra', 41.94, 41.17, -Math.PI / 2),
  P(11, 'ganchos', 18.25, 20.46, Math.PI / 2),
  P(11, 'cadenas', 27.22, 41.9, Math.PI),
  P(11, 'cadenas', 20.23, 18.1, 0),
  P(11, 'balde', 40.97, 19.29, 0.01),
  P(11, 'colchon', 21.75, 28.37, 1.92),
  P(11, 'colchon', 20.52, 37.75, 2.94),
  P(11, 'escombros', 26.71, 19.86, 2.82),
  P(12, 'mesaOperaciones', 40.27, 21.76, Math.PI),
  P(12, 'lavatorios', 20.6, 41.94, Math.PI),
  P(12, 'camaEnf', 40.94, 30.64, -Math.PI / 2),
  P(12, 'camaEnf', 22.9, 19.06, 0),
  P(12, 'biombo', 21.73, 37.71, 1.51),
  P(12, 'cabinet', 18.36, 41.49, Math.PI / 2),
  P(12, 'chair', 21.38, 26.13, 2.98),
  P(12, 'balde', 22.4, 29.63, 2.8),
  P(13, 'pew', 40.18, 21.74, 4.39),
  P(13, 'pew', 40.94, 38.16, 4.49),
  P(13, 'santuario', 18.3, 25.86, Math.PI / 2),
  P(13, 'ofrendas', 41.78, 32.29, -Math.PI / 2),
  P(13, 'ofrendas', 18.22, 20.46, Math.PI / 2),
  P(13, 'ofrendas', 18.22, 23.25, Math.PI / 2),
  P(13, 'candles', 33.19, 18.28, 0),
  P(13, 'candles', 41.72, 36.25, -Math.PI / 2),
  P(13, 'cross', 20.91, 41.94, Math.PI),
  P(13, 'cross', 41.94, 34.39, -Math.PI / 2),
  P(14, 'sanLaMuerte', 19.9, 37.51, Math.PI / 2),
  P(14, 'ofrendas', 40.95, 41.78, Math.PI),
  P(14, 'ofrendas', 19.88, 41.78, Math.PI),
  P(14, 'ofrendas', 34.01, 18.22, 0),
  P(14, 'ofrendas', 18.22, 40.42, Math.PI / 2),
  P(14, 'cadenas', 34.75, 41.9, Math.PI),
  P(14, 'cadenas', 33.6, 41.9, Math.PI),
  P(14, 'tumbas', 41.09, 36.03, -Math.PI / 2),
  P(14, 'candles', 18.28, 25.08, Math.PI / 2),
  P(14, 'candles', 37.99, 18.28, 0),
  P(15, 'escombros', 36.83, 21.57, 1.91),
  P(15, 'escombros', 36.99, 39.27, 4.66),
  P(15, 'escombros', 36.93, 19.25, -0.11),
  P(15, 'crates', 36.92, 41.5, Math.PI),
  P(15, 'barrel', 18.38, 33.74, Math.PI / 2),
  P(15, 'barrel', 33.03, 41.62, Math.PI),
  P(15, 'sacks', 29.07, 41.69, Math.PI),
  P(15, 'tachos', 23.82, 18.36, 0),
];

// ---------------- actividades ----------------
const JARS = [
  { ...W(26, 2), zone: 'P2' },
  { ...W(26, 7), zone: 'P7' },
  { ...E(33, 12), zone: 'P12' },
];
// Radio del Remolino: tres transmisiones que cuentan quién es la Voz.
const RADIOS = [
  {
    pos: [38.8, yOf(4) + 0.86, 38.8],
    rot: -0.3,
    lines: [
      'Radio del Remolino. Hace cien años un yerbatero de Misiones subió a esta torre buscando el mate que no se termina nunca.',
      'Se llamaba Francisco. Nunca bajó. Desde entonces el viento no para de girar.',
    ],
  },
  {
    pos: [21.8, yOf(9) + 0.62, 21.8],
    rot: 0.5,
    lines: [
      'Dicen que Francisco hablaba solo, mirando para arriba. Que prometió las almas de todos los gauchos a cambio de un mate eterno.',
      'Su voz se volvió viento. Y el viento aprendió a hablar.',
    ],
  },
  {
    pos: [38.6, yOf(12) + 0.86, 21.2],
    rot: 2.6,
    lines: [
      'Última transmisión. El mate supremo ya no le alcanza: Francisco escucha pasos que vienen de muy lejos. Pasos chiquitos...',
      'Si alguien llega a la cima: la escalera de oro no lleva al cielo. Ya lo van a ver.',
    ],
  },
];
const SHIELD_PARTS = [
  { id: 'tapa', name: 'Tapa de pava', pos: [37.6, yOf(6) + 0.03, 38.4], zone: 'P6' },
  { id: 'cuero', name: 'Cuero de potro', pos: [22.4, yOf(8) + 0.03, 38.6], zone: 'P8' },
  { id: 'correa', name: 'Correa de rebenque', pos: [38.4, yOf(11) + 0.03, 22.2], zone: 'P11' },
];
export const ACT = {
  jars: JARS,
  traps: [],
  radios: RADIOS,
  parts: SHIELD_PARTS,
  bench: { pos: [19.3, 33.5], rot: Math.PI / 2, y: yOf(10) },
  shield: { name: 'Escudo de Tapa de Pava', hp: 1100, where: 'la mesa del Patio del Sello (piso 10)', plan: 'ESCUDO: tapa + cuero + correa' },
  radioAch: ['Oyente del Remolino', 'Escuchaste las tres transmisiones de la torre'],
};

export const CRITTERS = { flocks: [], rats: [] };
export const FIRES = [];
// adentro del remolino, mirando la torre de abajo hacia arriba
export const TITLE_CAM = { at: [46, 8, 8], amp: [3, 1.5], look: [30, 34, 30], lookAmp: 3 };

// ---------------- lo demás ----------------
// tower: la torre de pisos apilados (world/Tower.js). levels: los zombies
// usan las alturas de verdad. Los bichos especiales de todos los mapas
// salen mezclados en las rondas (special/boss 'mixed', entities/Rounds.js).
export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: 'mixed', boss: 'mixed', egg: 'revelaciones', tower: true, levels: true, vida: false };
export const TEXT = {
  soul: (many) => `El remolino se llevó ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Vencieron' : 'Venciste'} a Francisco en la ronda ${r}. El Chiquitijuein se acerca...`,
  egg: 'Las Revelaciones',
  loading: 'Levantando la torre…',
};
// Noche cerrada con el remolino girando.
export const SKY = { daylight: 0 };

// ---------------- el Challenge ----------------
// La misma torre para los que ya la conocen (config/map.js useMap la arma con
// esto encima): sin historia ni personajes (ni Fierro, ni la Voz, ni las
// radios; solo hablan los minijefes), los pisos sin centro (del 2 al 15: el que
// se cae, cae hasta la planta baja), los muertos más rápidos y más bravos de
// entrada, minijefes seguido, un evento del remolino por ronda y, arriba de
// todo, la Supernova (entities/TowerChallenge.js, weapons/Supernova.js).
export function challenge() {
  // lo del centro de las plazas viejas (5, 10 y 15) queda colgando del agujero
  const [h0, h1, h2, h3] = TOWER.hole;
  const plaza = [5, 10, 15].map(yOf);
  const nearHole = (p) => plaza.includes(p.y) && p.pos[0] > h0 - 1.2 && p.pos[0] < h2 + 2.2 && p.pos[1] > h1 - 1.2 && p.pos[1] < h3 + 2.2;
  // el altar de la Supernova, donde en la historia está la pared dorada
  const altar = { ...N(33, 15), cost: 10000, ammo: 2500 };
  // la pared dorada del "buyable ending" (la escalera al cielo): del lado de
  // enfrente, cerca de donde arranca la escalera
  const ending = { ...S(28, 15), cost: 40000, perPlayer: 20000 };
  return {
    TOWER: { ...TOWER, solid: [1], challenge: true },
    PROPS: PROPS.filter((p) => !nearHole(p)),
    // arriba no hay ninguna Voz: está la Supernova
    ZONES: { ...ZONES, P15: { ...ZONES.P15, sub: 'Arriba de todo, la Supernova y la escalera al cielo' } },
    // sin transmisiones (nadie cuenta nada); el escudo y los frascos quedan
    ACT: { ...ACT, radios: [] },
    // (la caja trae los mates de todos los mapas, menos los especiales de otro
    // mapa: world/Interactables.js inBox)
    // (y los potenciadores: balas infinitas y botas; en lugar del Admin Mate,
    // el especial de cualquier mapa: entities/Powerups.js)
    FEATURES: { ...FEATURES, egg: 'reto', boxAll: { skip: ['gut'] }, pups: ['infinito', 'botas'], anySpecial: true },
    EE: {
      // (towerDecor deja libres los dos lugares)
      altar,
      ending,
      // la Bombilla del Remolino: en el medio de la planta baja, te chupa y te
      // escupe arriba: `below` pisos abajo del más alto abierto (a la cima si
      // está abierta); `perFloor` por piso que sube, hasta `top` (la cima)
      bombilla: { pos: [30, 30], y: 0, below: 5, perFloor: 250, top: 3000, cd: 12 },
      // (la caverna del Infierno se arma igual, sin uso: world/Infierno.js)
      arena: TOWER.arena,
    },
    TEXT: {
      ...TEXT,
      won: (team, r) => `${team ? 'Subieron' : 'Subiste'} al Cielo de los Mates en la ronda ${r}.`,
      egg: 'Escalera al cielo',
      loading: 'Sacándole el centro a la torre…',
    },
  };
}
