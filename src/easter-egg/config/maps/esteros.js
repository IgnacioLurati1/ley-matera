// "Mate no Numa": los Esteros del Iberá, Corrientes, 1877. Una noche de luna
// llena. El Gauchito Gil y sus tres compañeros (Anacleto, Cirilo y Benito),
// desertores de una guerra entre hermanos, se esconden en el estero. Ahí una
// voz le habla solo a Gil. Grilla de 1 m, x hacia el este y z hacia el sur.
//
// Es un mapa chato: las zonas de afuera son islas de barro de forma
// despareja (manchones y sendas, nada cuadrado), cerradas por pajonal alto (edge
// 'corn') y rodeadas de agua. El suelo es uno solo y suave
// (world/esterosGround.js, GROUND): lagunas, riachos y charcos se hunden
// bajo el agua (WATER_Y) y ahí se nada. Las zonas con `ground` pisan ese
// suelo; las casas tienen su piso (y) y algunas un piso de arriba. `carve`
// deja el hueco de una casa (y su pared) adentro del polígono de una zona.
//
// El centro es la Isleta del Fogón (el campamento) y de ahí salen las
// sendas: el Obraje al norte, la Casona del Coronel al noreste, la
// Pesquería al este, la Laguna del Irupé al sur, el Embalsado al suroeste,
// la Reducción al oeste y el Algarrobo de los Colgados al noroeste.

export const MAP_W = 84;
export const MAP_H = 84;
export const WALL_H = 3.4;
export const WATER_Y = 0;

// 1b: luz y agua (la luna, la niebla y la corriente se tocan acá)
// Las formas (zonas y agua) son manchones [x, z, r] que se juntan, con el
// borde desparejo (jit), y sendas: polilíneas de ancho w (esterosGround.js).
export const GROUND = {
  level: WATER_Y,
  base: 0.34,
  rough: 0.12,
  bank: 0.3,
  water: [
    // la Laguna del Irupé, grande, hacia el sureste
    { blobs: [[50, 70, 9], [60, 66, 8], [68, 74, 9], [42, 76, 6], [76, 62, 6]], jit: 1.6, seed: 3, depth: 2.3, slope: 0.5 },
    // el riacho: baja del norte entre el Obraje y la Casona y se mete en la laguna
    { trails: [{ line: [[62, -6], [60, 6], [63, 16], [58, 24], [55, 32], [58, 42], [56, 50], [58, 58]], w: 6, jit: 0.8 }], seed: 7, depth: 1.9, slope: 0.6 },
    // el agua que rodea al Embalsado (una isla flotante adentro de la laguna)
    { blobs: [[23, 73, 7], [18, 77, 5]], jit: 1.2, seed: 11, depth: 1.7, slope: 0.6 },
    // el brazo que entra en la Reducción (la cripta se inunda por acá)
    { trails: [{ line: [[-4, 58], [6, 55], [12, 52]], w: 4.5, jit: 0.5 }], seed: 13, depth: 1.5, slope: 0.5 },
    // charcos para vadear
    { blobs: [[45, 15, 2.6]], jit: 0.8, seed: 17, depth: 0.55, slope: 0.3 },
    { blobs: [[14, 12, 2.4]], jit: 0.8, seed: 19, depth: 0.6, slope: 0.3 },
    { blobs: [[34, 45, 2.2]], jit: 0.7, seed: 23, depth: 0.5, slope: 0.3 },
    { blobs: [[74, 38, 2.4]], jit: 0.7, seed: 29, depth: 0.6, slope: 0.3 },
  ],
  // la isla flotante del Embalsado y el vado del riacho (entre la isleta y la Pesquería)
  mounds: [
    { x: 21, z: 74, r: 5.5, top: 0.6 },
    { x: 57, z: 41, r: 4, top: -0.55, drop: 1.2 },
    // los desembarcos: la pasarela al Embalsado (tranquera 8), la barraca del
    // obraje (puerta 9) y el rancho sobre pilotes (puerta 12)
    { x: 25.2, z: 72, r: 3, top: 0.5, drop: 0.8 },
    { x: 44.2, z: 12.4, r: 2, top: 0.58, drop: 1.2 },
    { x: 65.6, z: 33, r: 2.4, top: 1.05, drop: 1.3 },
  ],
};

export const ZONES = {
  A: {
    name: 'La Isleta del Fogón',
    sub: 'Esteros del Iberá · Corrientes, 1877',
    blobs: [[36, 38, 5.2], [42, 42, 4.6], [36, 46, 3.8], [44, 36, 3]],
    seed: 1,
    trails: [
      // al Obraje (norte)
      { line: [[40, 36], [38, 31], [40, 26], [40, 21]], w: 3 },
      // el vado del riacho (este), hacia la Pesquería
      { line: [[45, 42], [50, 40], [55, 40.5], [60, 40.5]], w: 3.2 },
      // a la Laguna (sur)
      { line: [[38, 48], [36, 53], [37.5, 55], [37.5, 57]], w: 3 },
      // a la Reducción (oeste)
      { line: [[32, 40], [27, 38.5], [21, 38.5]], w: 3 },
    ],
    // (el final recto de cada senda, contra la puerta: entre las dos zonas
    // queda una sola fila de pajonal)
    rects: [[39, 19, 41, 21], [58, 39, 60, 41], [36, 56, 38, 57], [20, 37, 22, 39]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  B: {
    name: 'El Obraje',
    sub: 'Hachaban quebracho hasta que se les murió el patrón',
    blobs: [[31, 11, 4.5], [38, 13, 5], [46, 10, 5.5], [52, 14, 3.2], [35, 18, 3]],
    seed: 2,
    carve: [[39, 3, 50, 11]],
    rects: [[39, 15, 41, 17], [30, 11, 32, 13], [52, 12, 54, 13]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  // la barraca de los hacheros: abajo el galpón alto y arriba el entrepiso
  B2: { name: 'La Barraca', sub: 'Veinte catres y un solo farol', y: 0.5, roof: 7.2, rects: [[40, 6, 49, 10]], floor: 'planks', wall: 'planksDark', ext: 'planksDark', ceil: 'planksDark' },
  B3: { name: 'El Entrepiso', sub: 'Los hacheros dormían arriba de la plata del patrón', y: 3.8, roof: 7.2, rects: [[40, 4, 49, 5]], floor: 'planksDark', wall: 'planksDark', ext: 'planksDark', ceil: 'planksDark', cliff: 'planksDark' },
  C: {
    name: 'La Pesquería',
    sub: 'Las redes salen con cosas que no son pescados',
    blobs: [[67, 30, 4.5], [72, 36, 5], [78, 32, 3.5], [70, 44, 4], [64, 38, 3]],
    seed: 4,
    carve: [[59, 29, 64, 35]],
    rects: [[62, 39, 64, 41], [76, 27, 78, 28]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  C2: { name: 'El Rancho del Pescador', sub: 'Sobre pilotes, por las crecidas', y: 0.9, roof: 4.2, rects: [[60, 30, 63, 34]], floor: 'planks', wall: 'planksDark', ext: 'planksDark', ceil: 'planksDark' },
  D: {
    name: 'La Laguna del Irupé',
    sub: 'Las hojas del irupé aguantan a un chico... o a un muerto',
    // (y el agua: la laguna entera con los irupés y el anillo alrededor del
    // Embalsado, con margen, así se nada en todo lo que se ve; F y la
    // pasarela van después y se quedan con sus celdas)
    blobs: [[39, 63, 4], [44, 63, 4], [33, 66, 4], [48, 59, 3], [38, 69, 3.5], [49, 67, 4.5], [45, 72, 3.5], [50, 70, 11], [60, 66, 10], [68, 74, 11], [42, 76, 8], [76, 62, 8], [23, 73, 9], [18, 77, 7]],
    seed: 5,
    rects: [[36, 59, 38, 61]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  F: {
    name: 'El Embalsado',
    sub: 'Una isla de raíces que flota y camina de noche',
    blobs: [[22, 73, 4.4], [18, 76, 3]],
    seed: 6,
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  E: {
    name: 'La Reducción',
    sub: 'Los jesuitas se fueron hace cien años; la piedra roja se quedó',
    blobs: [[14, 30, 5], [9, 38, 4.5], [17, 42, 3.6], [12, 47, 4.2], [19, 32, 2.6], [17, 36, 2.6]],
    seed: 8,
    carve: [[5, 32, 14, 43], [6, 43, 10, 51]],
    rects: [[15, 37, 18, 39]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  // la iglesia en ruinas: sin techo, con la luna adentro
  E2: { name: 'La Iglesia de la Reducción', sub: 'Sin techo desde que se fueron los padres', y: 0.45, roof: 5.2, ruin: true, rects: [[6, 33, 13, 42]], floor: 'calcareo', wall: 'piedraRoja', ext: 'piedraRoja' },
  // la cripta inundada (abajo del agua: se entra nadando)
  E4: { name: 'La Cripta', sub: 'El agua entró y no se fue más', y: -2.1, roof: 0.9, rects: [[7, 44, 9, 50]], floor: 'stoneStep', wall: 'piedraRoja', ext: 'piedraRoja', ceil: 'stoneStep', lid: 'piedraRoja' },
  G: {
    name: 'El Algarrobo de los Colgados',
    sub: 'Nadie cuelga de sus ramas... todavía',
    blobs: [[12, 10, 5.5], [18, 7, 3.5], [8, 17, 3.5]],
    seed: 9,
    trails: [{ line: [[18, 12], [23, 13.5], [26, 12.5]], w: 2.8 }],
    rects: [[26, 11, 28, 13]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  H: {
    name: 'La Casona del Coronel',
    sub: 'El que mandó a buscarlos nunca volvió a su casa',
    blobs: [[72, 17, 4.2], [78, 14, 3.4], [77, 21, 3], [67, 17, 3]],
    seed: 10,
    carve: [[65, 1, 76, 13]],
    trails: [{ line: [[76, 18], [77, 22], [77, 24]], w: 3 }],
    rects: [[76, 24, 78, 25]],
    floor: 'dirtDark',
    outdoor: true,
    ground: true,
    edge: 'corn',
  },
  // la sala de doble altura con la galería de arriba, y el despacho cerrado
  H2: { name: 'La Casona', sub: 'La sala del coronel, con la galería arriba', y: 0.6, roof: 7.4, rects: [[66, 8, 75, 12]], floor: 'parquet', wall: 'plasterWhite', ext: 'plasterWhite', ceil: 'planksDark' },
  H3: { name: 'La Galería', sub: 'Desde acá el coronel miraba el estero', y: 4.2, roof: 7.4, rects: [[66, 6, 75, 7]], floor: 'parquet', wall: 'plasterWhite', ext: 'plasterWhite', ceil: 'planksDark', cliff: 'plasterWhite' },
  H4: { name: 'El Despacho del Coronel', sub: 'Los papeles de la partida siguen sobre el escritorio', y: 4.2, roof: 7.4, rects: [[66, 2, 75, 4]], floor: 'parquet', wall: 'plasterOffice', ext: 'plasterWhite', ceil: 'planksDark' },
  // el puente de tablas sobre el riacho, entre el Obraje y la Casona
  P: { name: 'El Puente de Tablas', sub: 'Cruje con cada paso... y con cada muerto', y: 0.55, rects: [[56, 12, 66, 13]], floor: 'planks', outdoor: true, edge: 'rail', join: ['H'] },
  // la pasarela sobre el agua, de la laguna al Embalsado
  D2: { name: 'La Pasarela', sub: 'Tablas atadas con tiento sobre el agua negra', y: 0.45, rects: [[27, 71, 35, 72]], floor: 'planks', outdoor: true, edge: 'rail', join: ['D'] },
};

// Techos (world/Esteros.js buildRoofs): rect es el borde de afuera de las
// paredes, base la altura de las paredes. La iglesia de la reducción no tiene.
// Lo chico del estero (world/esterosDecor.js): matas de irupé y de camalote
// [x, z, radio, cuántas], árboles muertos en el agua [x, z, alto], troncos
// caídos [x, z, largo, ángulo] y cuántos árboles de monte van alrededor.
export const DECOR = {
  irupe: [[46, 66, 4, 40], [52, 72, 5, 55], [60, 66, 4, 30], [44, 76, 3, 20], [19, 67, 3, 18]],
  camalote: [[58, 30, 3, 22], [56, 50, 3, 24], [64, 75, 4, 28], [30, 75, 3, 18], [6, 55, 3, 18], [72, 58, 4, 20]],
  snags: [[54, 72, 5], [61, 62, 6], [66, 70, 4.5], [25, 78, 5], [58, 21, 5.5], [3, 56, 4], [50, 79, 6], [70, 77, 5]],
  logs: [[36.2, 42.4, 2.2, 0.2], [41.4, 43.6, 2, 1.4], [29, 9.2, 3, 0.2], [79.4, 17.6, 2.4, 0.9], [16.4, 17.2, 2.6, 2.2], [20.6, 29.8, 2.2, 1.1], [44.2, 58.6, 2.4, 0.5]],
  monte: 70,
};

export const ROOFS = [
  // la barraca del obraje y el rancho del pescador: paja
  { rect: [39, 3, 51, 12], axis: 'x', base: 7.2, rise: 3.2, mat: 'paja' },
  { rect: [59, 29, 65, 36], axis: 'z', base: 4.2, rise: 2.2, mat: 'paja' },
  // la casona del coronel: tejas
  { rect: [65, 1, 77, 14], axis: 'x', base: 7.4, rise: 2.6, mat: 'tejas', head: 'plasterWhite' },
];

export const RAMPS = [
  // las escaleras de la barraca y de la casona, a sus entrepisos (con un
  // descanso abajo: si llegaban hasta la pared de enfrente, la baranda del
  // costado corría de punta a punta y no había por dónde subir)
  { rect: [48, 6, 49, 9], dir: '-z', y0: 0.5, y1: 3.8, steps: true },
  { rect: [74, 8, 75, 11], dir: '-z', y0: 0.6, y1: 4.2, steps: true },
  // la escalera de la iglesia que baja a la cripta (bajo el agua), con su
  // techo inclinado: con el de la cripta (0.9) arriba de todo quedaban 70 cm
  // y parecía que no se podía entrar
  { rect: [7, 44, 9, 48], dir: '+z', y0: 0.45, y1: -2.1, steps: true, ceil: 'slope', head: 3 },
];

export const START_ZONE = 'A';
export const PLAYER_START = { x: 42.5, z: 44.5, yaw: 0 };

// kind 'gate': las tranqueras de palo que cierran las sendas del pajonal.
// (2026-09-27: 250 más baratas, mínimo 750 — la caja ya no arranca siempre al lado)
export const DOORS = [
  { id: 1, zones: ['A', 'B'], cells: [[39, 18], [40, 18]], cost: 750, kind: 'gate' },
  { id: 2, zones: ['A', 'C'], cells: [[61, 40], [61, 41]], cost: 750, kind: 'gate' },
  { id: 3, zones: ['A', 'D'], cells: [[37, 58], [38, 58]], cost: 750, kind: 'gate' },
  { id: 4, zones: ['A', 'E'], cells: [[19, 38], [19, 39]], cost: 750, kind: 'gate' },
  { id: 5, zones: ['B', 'G'], cells: [[29, 12], [29, 13]], cost: 1000, kind: 'gate' },
  { id: 6, zones: ['B', 'P'], cells: [[55, 12], [55, 13]], cost: 1000, kind: 'gate' },
  { id: 7, zones: ['H', 'C'], cells: [[77, 26], [78, 26]], cost: 1000, kind: 'gate' },
  { id: 8, zones: ['D2', 'F'], cells: [[26, 71], [26, 72]], cost: 1000, kind: 'gate' },
  // las casas
  { id: 9, zones: ['B', 'B2'], cells: [[43, 11], [44, 11]], cost: 750, kind: 'door' },
  { id: 10, zones: ['H', 'H2'], cells: [[70, 13], [71, 13]], cost: 750, kind: 'door' },
  { id: 11, zones: ['H3', 'H4'], cells: [[70, 5], [71, 5]], cost: 750, kind: 'door' },
  { id: 12, zones: ['C', 'C2'], cells: [[64, 32], [64, 33]], cost: 750, kind: 'door' },
  { id: 13, zones: ['E', 'E2'], cells: [[14, 38], [14, 39]], cost: 750, kind: 'door' },
  // la reja de la cripta (la abre el easter egg)
  { id: 14, zones: ['E2', 'E4'], cells: [[8, 43], [9, 43]], cost: 0, kind: 'reja', locked: true },
];

export const WINDOWS = [
  { cell: [42, 11], out: [0, 1], zone: 'B2' },
  { cell: [39, 6], out: [-1, 0], zone: 'B2' },
  { cell: [61, 35], out: [0, 1], zone: 'C2' },
  { cell: [76, 12], out: [1, 0], zone: 'H2' },
  { cell: [67, 13], out: [0, 1], zone: 'H2' },
  { cell: [72, 1], out: [0, -1], zone: 'H4' },
  { cell: [9, 32], out: [0, -1], zone: 'E2' },
  { cell: [5, 35], out: [-1, 0], zone: 'E2' },
];
export const RISERS = [
  { zone: 'A', pos: [58.5, 40.5] },
  { zone: 'A', pos: [22.5, 38.5] },
  { zone: 'A', pos: [40.5, 21.5] },
  { zone: 'A', pos: [37.5, 55.5] },
  { zone: 'B', pos: [53.5, 15.5] },
  { zone: 'B', pos: [28.5, 9.5] },
  { zone: 'B', pos: [40.5, 14.5] },
  { zone: 'B', pos: [33.5, 20.5] },
  { zone: 'B2', pos: [45.5, 8.5] },
  { zone: 'C', pos: [69.5, 47.5] },
  { zone: 'C', pos: [66.5, 26.5] },
  { zone: 'C', pos: [79.5, 34.5] },
  { zone: 'C', pos: [62.5, 37.5] },
  { zone: 'C2', pos: [61.5, 31.5] },
  { zone: 'D', pos: [49.5, 58.5] },
  { zone: 'D', pos: [30.5, 67.5] },
  { zone: 'D', pos: [42.5, 71.5] },
  { zone: 'D', pos: [39.5, 61.5] },
  { zone: 'D', pos: [45.5, 64.5] },
  { zone: 'F', pos: [23.5, 70.5] },
  { zone: 'F', pos: [18.5, 77.5] },
  { zone: 'E', pos: [12.5, 50.5] },
  { zone: 'E', pos: [10.5, 26.5] },
  { zone: 'E', pos: [20.5, 33.5] },
  { zone: 'E', pos: [17.5, 42.5] },
  { zone: 'E2', pos: [12.5, 41.5] },
  { zone: 'E2', pos: [7.5, 41.5] },
  { zone: 'G', pos: [26.5, 12.5] },
  { zone: 'G', pos: [6.5, 18.5] },
  { zone: 'G', pos: [13.5, 6.5] },
  { zone: 'G', pos: [13.5, 14.5] },
  { zone: 'H', pos: [65.5, 15.5] },
  { zone: 'H', pos: [79.5, 22.5] },
  { zone: 'H', pos: [78.5, 13.5] },
  { zone: 'H', pos: [72.5, 18.5] },
  { zone: 'H2', pos: [72.5, 8.5] },
  { zone: 'H4', pos: [68.5, 3.5] },
];
export const WALL_BUYS = [
  { weapon: 'madera', cell: [39, 46], face: [-1, 0] },
  { weapon: 'plastico', cell: [30, 35], face: [1, 0] },
  { weapon: 'vidrio', cell: [31, 16], face: [1, 0] },
  { weapon: 'lata', cell: [77, 38], face: [0, -1] },
  { weapon: 'algarrobo', cell: [18, 28], face: [-1, 0] },
  { weapon: 'granadas', cell: [32, 61], face: [0, 1] },
  { weapon: 'bowie', cell: [73, 21], face: [1, 0] },
];
export const PERK_SPOTS = [
  { perk: 'revive', cell: [44, 32], face: [0, 1] },
  { perk: 'speed', cell: [39, 8], face: [1, 0] },
  { perk: 'doubletap', cell: [59, 32], face: [1, 0] },
  { perk: 'jugg', cell: [65, 10], face: [1, 0] },
  { perk: 'mule', cell: [5, 39], face: [1, 0] },
  { perk: 'deadshot', cell: [10, 4], face: [0, 1] },
  { perk: 'aqua', cell: [46, 55], face: [0, 1] },
];
// (contra el pajonal, sin pared: va en un poste)
export const POWER = { cell: [31, 6], face: [0, 1], post: true };
export const PAP = { cell: [21, 76], face: [0, -1], width: 2 };
export const BOX_SPOTS = [
  { cell: [41, 32], face: [0, 1], zone: 'A' },
  { cell: [50, 17], face: [0, -1], zone: 'B' },
  { cell: [70, 49], face: [0, -1], zone: 'C' },
  { cell: [10, 48], face: [1, 0], zone: 'E' },
  { cell: [16, 2], face: [0, 1], zone: 'G' },
  { cell: [80, 15], face: [-1, 0], zone: 'H' },
];
export const BOX_START = [0];
export const LIGHTS = [
  // el fogón del campamento y el farol de la isleta
  { zone: 'A', pos: [38.5, 0.95, 40.5], color: 0xff7a2a, intensity: 30, noPower: 1, kind: 'fire' },
  { zone: 'A', pos: [45.05, 2.15, 41.5], color: 0xffc080, intensity: 18, noPower: 1, kind: 'lamp' },
  // el obraje: la caldera, el farol del patio y el galpón
  { zone: 'B', pos: [31.85, 0.95, 9.2], color: 0xff6a20, intensity: 14, noPower: 1, kind: 'fire' },
  { zone: 'B', pos: [38.05, 2.15, 12.5], color: 0xffc080, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'B2', pos: [44.5, 6.3, 8.2], color: 0xffc48a, intensity: 26, noPower: 0.35 },
  // la pesquería
  { zone: 'C', pos: [67.05, 2.15, 37.5], color: 0xffc080, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'C2', pos: [61.5, 3.7, 32], color: 0xffb070, intensity: 14, noPower: 0.4 },
  // las velas de las cruces de la laguna y el farol de la pasarela
  { zone: 'D', pos: [35.55, 2.15, 69.8], color: 0xffc080, intensity: 16, noPower: 1, kind: 'lamp' },
  { zone: 'D', pos: [36.7, 0.7, 64.6], color: 0xff8a4a, intensity: 6, noPower: 1, kind: 'candle' },
  // la iglesia: velas del altar
  { zone: 'E2', pos: [9.5, 1.7, 34.4], color: 0xffa860, intensity: 14, noPower: 1, kind: 'candle' },
  // el algarrobo: velas coloradas al pie
  { zone: 'G', pos: [12, 0.8, 13.2], color: 0xff5a3a, intensity: 10, noPower: 1, kind: 'candle' },
  // la casona: el farol del patio, la araña de la sala y la lámpara del despacho
  { zone: 'H', pos: [71.05, 2.15, 15.5], color: 0xffc080, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'H2', pos: [70.5, 6.6, 10], color: 0xffc890, intensity: 28, noPower: 0.3 },
  { zone: 'H4', pos: [70.5, 6.9, 3], color: 0xffc48a, intensity: 16, noPower: 0.4 },
];
// ---------------- el easter egg: "El Pacto" (entities/EsterosEgg.js) ----------------
// Lugares [x, z] (la altura la da el piso). Todo lo que se deja va al hueco del
// algarrobo; el fondo de la laguna está a -2.3 (hay que bucear).
export const EE = {
  // el hueco del algarrobo de los colgados (del lado seco, mirando al oeste)
  hueco: [11.5, 10.6],
  // el saber: la llave de la reja de la cripta (en el fondo de la laguna), el
  // cofre de los padres (en la cripta inundada), la caja fuerte del coronel
  // (el despacho) y tres urutaú parados en palos secos [x, z, alto]
  llaveReja: [49.5, 67.5],
  cofre: [8.5, 49.2],
  caja: [74.2, 2.9],
  urutau: [[52.6, 19.8, 3.5], [78.6, 46.2, 3.8], [5.8, 28.6, 3.6]],
  // el poder: la pava hundida, las brasas de la locomóvil, el rayo de luna
  // sobre el agua y el altar de la iglesia (encierro)
  pava: [45.5, 70.5],
  brasas: [33.6, 10.9],
  luna: [41.2, 71.2],
  altar: [9.5, 34.7],
  // donde se junta la luz de los ahogados (en medio de la laguna)
  orbe: [47.5, 66.5],
  // por donde entra el Luisón
  // (entra por lo abierto del noreste del algarrobo, a 7 m del hueco)
  luison: [17.5, 6.2],
};
export const PROPS = [
  // ---- la isleta del fogón: el campamento de Gil ----
  { type: 'fogonCampo', pos: [38.5, 40.5] },
  { type: 'enramada', pos: [34.6, 36.6], rot: 0.2, w: 4, d: 3 },
  { type: 'recados', pos: [34.6, 37.2], rot: 0.2 },
  { type: 'mesaTosca', pos: [42.6, 38.4], rot: 0.4 },
  { type: 'farolPoste', pos: [44.5, 41.5] },
  { type: 'cruzCinta', pos: [23.5, 37.2], rot: 1.5 },
  { type: 'palmera', pos: [30.8, 43.2] },
  { type: 'palmera', pos: [46.4, 46.2], h: 7.5 },
  { type: 'arbolMonte', pos: [32.6, 47.6], h: 5.5 },
  { type: 'bote', pos: [52.6, 43.2], rot: 1.3, y: -0.35 },
  // ---- el obraje ----
  { type: 'locomovil', pos: [33.6, 9.3], rot: 0 },
  { type: 'troncos', pos: [34.2, 17.8], rot: 0.3, rows: 3 },
  { type: 'troncos', pos: [50.3, 15.4], rot: 1.4, rows: 2, len: 2.6, hacha: true },
  { type: 'carreta', pos: [36, 14.6], rot: 0.2 },
  { type: 'farolPoste', pos: [37.5, 12.5] },
  { type: 'mesaTosca', pos: [42.5, 7.6], len: 2.2 },
  // ---- la pesquería ----
  { type: 'redesPalo', pos: [71.5, 32.5], rot: 0.3 },
  { type: 'redesPalo', pos: [74.5, 44.2], rot: 1.2, len: 2 },
  { type: 'bote', pos: [57.4, 34.2], rot: 1.6, y: -0.3 },
  { type: 'bote', pos: [58.8, 46.4], rot: 1.9, y: -0.3 },
  { type: 'farolPoste', pos: [66.5, 37.5] },
  { type: 'mesaTosca', pos: [73.4, 40.6], rot: 0.2, len: 1.6 },
  // ---- la laguna del irupé ----
  { type: 'cruzCinta', pos: [36.5, 64.4], rot: 0.3 },
  { type: 'cruzCinta', pos: [34.4, 67.2], rot: -0.4, h: 1.1 },
  { type: 'cruzCinta', pos: [38.2, 66.4], rot: 0.9, vela: false },
  { type: 'palmera', pos: [47.2, 60.2], h: 8 },
  { type: 'arbolMonte', pos: [30.2, 60.5], flores: true, h: 4.5 },
  { type: 'farolPoste', pos: [35.0, 69.8], rot: Math.PI },
  // ---- el embalsado ----
  { type: 'palmera', pos: [19.6, 72.4], h: 6.5 },
  // ---- la reducción ----
  { type: 'cruzMision', pos: [17.6, 33.8] },
  { type: 'escombroRojo', pos: [12.5, 27.6] },
  { type: 'escombroRojo', pos: [18.4, 44.6], n: 4 },
  { type: 'escombroRojo', pos: [14.6, 47.8], n: 5 },
  { type: 'altar', pos: [9.5, 33.9] },
  { type: 'candles', pos: [8.2, 34.3] },
  { type: 'candles', pos: [10.8, 34.3] },
  { type: 'pew', pos: [8, 36.8] },
  { type: 'pew', pos: [11.2, 36.8] },
  { type: 'pew', pos: [8, 38.9], rot: 0.15 },
  { type: 'escombroRojo', pos: [11, 39.6], n: 3 },
  // ---- el algarrobo de los colgados ----
  { type: 'algarrobo', pos: [12.6, 10.4], s: 1.25 },
  { type: 'cruzCinta', pos: [13.6, 14.3], rot: 0.2 },
  { type: 'cruzCinta', pos: [16.4, 4.4], rot: 0.6 },
  { type: 'cruzCinta', pos: [19.6, 12.4], rot: -0.5, h: 1.1 },
  { type: 'cruzCinta', pos: [5.6, 17.6], rot: 1.1, vela: false },
  { type: 'arbolMonte', pos: [20.6, 6.6], h: 6 },
  // ---- la casona del coronel ----
  { type: 'farolPoste', pos: [70.5, 15.5] },
  { type: 'carreta', pos: [69.5, 18.5], rot: 1.2 },
  { type: 'palmera', pos: [66.4, 17.6], h: 7 },
  { type: 'arbolMonte', pos: [80.2, 12.2], flores: true, h: 5 },
  { type: 'rug', pos: [70.5, 10.2] },
  { type: 'armchair', pos: [69.4, 10.6], rot: 2.8 },
  { type: 'armchair', pos: [71.8, 10.6], rot: -2.8 },
  { type: 'desk', pos: [70.5, 2.9] },
  { type: 'bookshelf', pos: [66.4, 3.2], rot: Math.PI / 2 },
  { type: 'papeles', pos: [72.6, 3.6], rot: 0.4 },
];
// ---------------- actividades ----------------
// El escudo de cuero de yacaré: el cuero en la Pesquería, las correas en el
// Obraje y la tabla en la Reducción; se arma en la mesa del fogón.
const PARTS = [
  { id: 'cuero', name: 'Cuero de yacaré', pos: [73.5, 0.4, 33.5], zone: 'C' },
  { id: 'correas', name: 'Correas de tiento', pos: [34.5, 0.4, 12.5], zone: 'B' },
  { id: 'tabla', name: 'Tabla de lapacho', pos: [16.5, 0.4, 45.5], zone: 'E' },
];
const BENCH = { pos: [38.5, 36.2], rot: 0.3 };
// Los Frascos de las Ánimas (el botellón del Gil, world/jarModels.js), en los
// pisos de arriba de las casas, que no tenían nada que hacer: el entrepiso de
// la barraca, la galería y el despacho de la casona. Se llenan con los que
// caen arriba (el piso de abajo no se ve desde el frasco). La zona es la que
// se abre con la puerta de abajo (el entrepiso y la galería no tienen puerta).
const JARS = [
  { cell: [45, 3], face: [0, 1], zone: 'B2' },
  { cell: [67, 5], face: [0, 1], zone: 'H2' },
  { cell: [73, 5], face: [0, -1], zone: 'H4' },
];
export const ACT = {
  jars: JARS,
  traps: [],
  radios: [],
  parts: PARTS,
  bench: BENCH,
  shield: { name: 'Escudo de cuero de yacaré', hp: 1000, where: 'la mesa del fogón', plan: 'ESCUDO: cuero + correas + tabla' },
};
export const CRITTERS = { flocks: [], rats: [] };
export const FIRES = [
  { pos: [38.5, 0.75, 40.5], spread: 0.35, sound: [38.5, 1, 40.5] },
];
export const TITLE_CAM = { at: [42, 6, 60], amp: [2, 0.4], look: [42, 1, 44], lookAmp: 3 };
// (bossFrom: el Sargento recién en la 8 y después cada 5 — nunca cae en una
// creciente, que son las múltiplo de 10; pedido del usuario 2026-09-27)
export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: 'yacare', boss: 'sargento', bossFrom: 8, egg: 'pacto', esteros: true, levels: true };
export const TEXT = {
  soul: (many) => `El estero se quedó con ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Terminaron' : 'Terminaste'} lo que pedía la voz en la ronda ${r}.`,
  egg: 'El Pacto',
  loading: 'Entrando al estero…',
};
// Noche de luna llena, sin lluvia (1b: luz y agua).
// moon: dónde está (baja, al sureste sobre la laguna grande: su camino de luz
// en el agua se ve desde la isleta), tamaño, fuerza de la luz y brillo del disco.
// weathers: los climas que tocan (nada de lluvia); states: el color de la
// noche de cada uno. night: la luna llena, la niebla sobre el agua y las
// luciérnagas (fx/Night.js).
export const SKY = {
  daylight: 0,
  moon: { dir: [0.6, 0.31, 0.74], size: 30, light: 1.15, glow: 1.3 },
  // noche cerrada: sin el resplandor rojizo del horizonte (parecía que amanecía)
  colors: { horizon: [0.03, 0.036, 0.055], zenith: [0.004, 0.006, 0.016], glow: [0.012, 0.014, 0.022] },
  weathers: [['clear', 4], ['fog', 2], ['wind', 1]],
  states: {
    clear: { fog: 0.026, fogColor: 0x0c121c, cloud: 0.05 },
    fog: { fog: 0.055, fogColor: 0x34404c, mist: 1, cloud: 0.3 },
    wind: { fog: 0.03, fogColor: 0x0b111a, cloud: 0.35 },
  },
  night: {
    mist: { amount: 1, color: 0xa4b6cc },
    fireflies: { count: 380, radius: 34, color: 0xc8ff6a, glow: 4, size: 0.08 },
    // ranas, grillos, el urutaú lejano, el agua en la orilla y el pajonal (fx/NightSounds.js)
    sounds: { frogs: 1, crickets: 1, urutau: true, lap: 1, reeds: 1 },
    // lo que mide menos de 35 cm no hace sombra de luna (fx/Night.js trimShadows: rendimiento)
    trimShadows: 0.35,
    // el aire de cada zona: la niebla y la luz de abajo toman su tono (fx/Night.js zoneTint)
    zones: {
      A: { fog: [1.2, 1, 0.8], hemi: [1.12, 0.98, 0.84] }, // el fogón: tibio
      B: { fog: [1.14, 0.92, 0.82], hemi: [1.08, 0.93, 0.86] }, // el obraje: polvo de quebracho
      C: { fog: [0.84, 1.06, 1.1], hemi: [0.9, 1.04, 1.1] }, // la pesquería: verde agua
      D: { fog: [0.9, 1, 1.16], hemi: [0.94, 1.02, 1.14] }, // la laguna: plata de luna
      E: { fog: [1.16, 0.88, 0.9], hemi: [1.1, 0.9, 0.92] }, // la reducción: piedra roja
      F: { fog: [0.88, 1.16, 0.9], hemi: [0.92, 1.12, 0.94] }, // el embalsado: verde enfermo
      G: { fog: [0.88, 0.86, 1.08], hemi: [0.84, 0.84, 0.96] }, // el algarrobo: frío, más oscuro
      H: { fog: [1.1, 1.03, 0.88], hemi: [1.06, 1, 0.9] }, // la casona: luz de ventana
    },
  },
};
