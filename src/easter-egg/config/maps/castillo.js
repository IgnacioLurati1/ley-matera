// "Der Mateendrache": el castillo del Mateendrache, en la Cordillera de los
// Andes (Mendoza), de noche y nevando. Grilla de 1 m, x hacia el este y z
// hacia el sur. Es un mapa con alturas (world/Levels.js), como el penal, y
// sube por la montaña en terrazas: las termas y el puente levadizo (20 m),
// el patio de armas con el establo, la herrería y la cocina (24), el gran
// salón, la biblioteca y la capilla (28), la sala del trono y el adarve
// (32), los miradores del viento y del campanario (36) y la cumbre de los
// caballeros (40). Adentro de la montaña, al este, la bodega y las mazmorras
// (20), la gruta del glaciar (16) y la cueva del Mateendrache (12).
// Lo arma el script de la sesión castillo_design.py: de acá en más se toca a mano.

export const MAP_W = 104;
export const MAP_H = 100;
export const WALL_H = 3.6;

export const ZONES = {
  A: { name: 'El Patio de Armas', sub: 'Castillo del Mateendrache · Cordillera de los Andes', y: 24, rects: [[42, 46, 61, 61]], floor: 'snow', cliff: 'castleStone', outdoor: true },
  B: { name: 'La Caballeriza', sub: 'Los caballos se congelaron parados', y: 24, roof: 30.2, rects: [[28, 46, 40, 56]], floor: 'flagstone', wall: 'castlePlaster', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  C: { name: 'La Herrería', sub: 'El yunque espera un golpe', y: 24, roof: 30.6, rects: [[16, 46, 26, 56]], floor: 'flagstoneDark', wall: 'castleStoneDark', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  S: { name: 'El Palenque', sub: 'La liza de los torneos de sortija', y: 24, rects: [[16, 58, 31, 70]], floor: 'snow', cliff: 'castleStone', outdoor: true, edge: 'rail', rail: 'cerca' },
  D: { name: 'El Gran Salón', sub: 'El fogón de los caballeros', y: 28, roof: 38.5, rects: [[42, 33, 61, 44]], floor: 'flagstone', wall: 'castleStone', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  O: { name: 'La Biblioteca', sub: 'Crónicas de la Gran Guerra', y: 28, roof: 39.2, rects: [[28, 33, 40, 44], [28, 21, 29, 32]], floor: 'parquet', wall: 'castlePlaster', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  G: { name: 'El Mirador del Viento', sub: 'Acá sopla el Zonda', y: 36, rects: [[24, 12, 33, 20]], floor: 'snowPave', cliff: 'castleStone', outdoor: true, edge: 'rail', h: 1.3 },
  F: { name: 'La Capilla de los Caballeros', sub: 'Cuatro vitrales, cuatro juramentos', y: 28, roof: 39.2, rects: [[63, 33, 74, 44], [73, 21, 74, 32]], floor: 'calcareo', wall: 'castlePlaster', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  H: { name: 'El Campanario', sub: 'Tres campanas para Illapa', y: 36, rects: [[69, 12, 78, 20]], floor: 'snowPave', cliff: 'castleStone', outdoor: true, edge: 'rail', h: 1.3 },
  K: { name: 'La Sala del Trono', sub: 'Un trono vacío... por ahora', y: 32, roof: 38.8, rects: [[44, 20, 59, 31]], floor: 'flagstone', wall: 'castleStone', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  N: { name: 'La Cumbre de los Caballeros', sub: 'Espadas clavadas en la nieve', y: 40, rects: [[42, 8, 61, 18], [34, 14, 41, 15, 38, 0, 1], [62, 14, 68, 15, 38, 0, 1]], floor: 'snowPave', cliff: 'castleStone', outdoor: true, edge: 'rail', h: 1.3 },
  E: { name: 'La Cocina', sub: 'El cordero da vueltas solo', y: 24, roof: 30.2, rects: [[63, 46, 74, 56]], floor: 'terracotta', wall: 'castlePlaster', ext: 'castleStone', ceil: 'castlePlaster', noBeams: true },
  R: { name: 'La Bodega', sub: 'Malbec de la cosecha de la Gran Guerra', y: 20, roof: 25.4, rects: [[70, 58, 81, 67]], floor: 'flagstoneDark', wall: 'castleStoneDark', ext: 'castleStone', ceil: 'caveRock', under: true, noBeams: true },
  P: { name: 'Las Mazmorras', sub: 'Nadie volvió a pedir yerba', y: 20, roof: 23.8, rects: [[83, 57, 92, 69]], floor: 'flagstoneDark', wall: 'castleStoneDark', ext: 'castleStone', ceil: 'caveRock', under: true, noBeams: true },
  I: { name: 'La Gruta del Glaciar', sub: 'Hielo de mil inviernos', y: 16, roof: 25, rects: [[84, 42, 99, 55]], floor: 'iceFloor', wall: 'ice', ext: 'caveRock', ceil: 'ice', under: true, noBeams: true },
  Q: { name: 'La Cueva del Mateendrache', sub: 'Algo respira en la oscuridad', y: 12, roof: 30, rects: [[80, 15, 100, 40]], floor: 'caveFloor', wall: 'caveRock', ext: 'caveRock', ceil: 'caveRock', under: true, noBeams: true },
  J: { name: 'El Adarve', sub: 'La muralla que mira al valle', y: 32, rects: [[36, 62, 48, 64], [36, 65, 41, 68], [55, 62, 67, 64], [62, 65, 67, 68]], floor: 'snowPave', cliff: 'castleStone', outdoor: true, edge: 'rail', h: 1.3 },
  L: { name: 'La Barbacana', sub: 'El rastrillo y el puente levadizo', y: 24, roof: 30.4, rects: [[50, 63, 53, 70]], floor: 'flagstone', wall: 'castleStoneDark', ext: 'castleStone', ceil: 'castleStoneDark', noBeams: true },
  M: { name: 'Las Termas del Inca', sub: 'El agua sale caliente de la montaña', y: 20, rects: [[50, 72, 53, 76, 20, 0, 2], [50, 77, 53, 81, 20, 0, 1], [40, 82, 63, 92]], floor: 'snow', cliff: 'rock', outdoor: true, edge: 'rail', rail: 'roca' },
};

export const RAMPS = [
  { rect: [50, 46, 53, 51], dir: '-z', y0: 24, y1: 28, steps: true, rail: 'balaustrada' },
  { rect: [42, 50, 43, 61], dir: '+z', y0: 24, y1: 32, steps: true },
  { rect: [60, 50, 61, 61], dir: '+z', y0: 24, y1: 32, steps: true },
  { rect: [50, 33, 53, 38], dir: '-z', y0: 28, y1: 32, steps: true, rail: 'balaustrada' },
  { rect: [58, 20, 59, 30], dir: '-z', y0: 32, y1: 40, steps: true, ceil: 'shaft', head: 3.4 },
  { rect: [34, 14, 41, 15], dir: '+x', y0: 36, y1: 40, steps: true },
  { rect: [62, 14, 68, 15], dir: '-x', y0: 36, y1: 40, steps: true },
  { rect: [28, 21, 29, 32], dir: '-z', y0: 28, y1: 36, steps: true, ceil: 'slope', head: 3.6 },
  { rect: [73, 21, 74, 32], dir: '-z', y0: 28, y1: 36, steps: true, ceil: 'slope', head: 3.6 },
  { rect: [50, 63, 53, 70], dir: '+z', y0: 24, y1: 20, steps: false },
  { rect: [36, 46, 37, 51], dir: '-z', y0: 24, y1: 28, steps: true, rail: 'madera' },
  { rect: [66, 46, 67, 51], dir: '-z', y0: 24, y1: 28, steps: true, rail: 'madera' },
  { rect: [72, 58, 73, 63], dir: '+z', y0: 24, y1: 20, steps: true, ceil: 'shaft', head: 3.3 },
  { rect: [88, 50, 89, 55], dir: '-z', y0: 20, y1: 16, steps: true },
  { rect: [90, 35, 91, 40], dir: '-z', y0: 16, y1: 12, steps: true },
];

export const RIVER = [];

export const START_ZONE = 'A';
export const PLAYER_START = { x: 52, z: 60.3, yaw: 0 };

// kind: 'door', 'reja' (rastrillo), 'hielo' (la pared de hielo de la cueva:
// la abre el easter egg).
export const DOORS = [
  { id: 1, zones: ['A', 'B'], cells: [[41, 47], [41, 48]], cost: 750, kind: 'door' },
  { id: 2, zones: ['A', 'E'], cells: [[62, 47], [62, 48]], cost: 750, kind: 'door' },
  { id: 3, zones: ['A', 'D'], cells: [[50, 45], [51, 45], [52, 45], [53, 45]], cost: 1000, kind: 'door' },
  { id: 4, zones: ['B', 'C'], cells: [[27, 50], [27, 51]], cost: 1000, kind: 'door' },
  { id: 5, zones: ['C', 'S'], cells: [[20, 57], [21, 57]], cost: 1000, kind: 'door' },
  { id: 6, zones: ['D', 'O'], cells: [[41, 38], [41, 39]], cost: 1000, kind: 'door' },
  { id: 7, zones: ['D', 'F'], cells: [[62, 38], [62, 39]], cost: 1250, kind: 'door' },
  { id: 8, zones: ['D', 'K'], cells: [[50, 32], [51, 32], [52, 32], [53, 32]], cost: 1500, kind: 'door' },
  { id: 9, zones: ['K', 'N'], cells: [[58, 19], [59, 19]], cost: 1250, kind: 'door' },
  { id: 10, zones: ['E', 'R'], cells: [[72, 57], [73, 57]], cost: 1000, kind: 'door' },
  { id: 11, zones: ['R', 'P'], cells: [[82, 62], [82, 63]], cost: 1250, kind: 'reja' },
  { id: 12, zones: ['P', 'I'], cells: [[88, 56], [89, 56]], cost: 1250, kind: 'door' },
  { id: 13, zones: ['I', 'Q'], cells: [[90, 41], [91, 41]], cost: 0, kind: 'hielo', locked: true },
  { id: 14, zones: ['A', 'L'], cells: [[50, 62], [51, 62], [52, 62], [53, 62]], cost: 1000, kind: 'reja' },
  { id: 16, zones: ['B', 'O'], cells: [[36, 45], [37, 45]], cost: 1000, kind: 'door' },
  { id: 17, zones: ['E', 'F'], cells: [[66, 45], [67, 45]], cost: 1250, kind: 'door' },
  { id: 15, zones: ['L', 'M'], cells: [[50, 71], [51, 71], [52, 71], [53, 71]], cost: 0, kind: 'puente', locked: true },
];

export const WINDOWS = [
  { cell: [15, 49], out: [-1, 0], zone: 'C' },
  { cell: [15, 54], out: [-1, 0], zone: 'C' },
  // (en 30 los muertos entraban encima de la cuadra del Picazo)
  { cell: [31, 57], out: [0, 1], zone: 'B' },
  { cell: [27, 37], out: [-1, 0], zone: 'O' },
  { cell: [27, 42], out: [-1, 0], zone: 'O' },
  { cell: [43, 23], out: [-1, 0], zone: 'K' },
  { cell: [43, 28], out: [-1, 0], zone: 'K' },
  { cell: [60, 28], out: [1, 0], zone: 'K' },
  { cell: [75, 49], out: [1, 0], zone: 'E' },
  { cell: [75, 54], out: [1, 0], zone: 'E' },
  { cell: [74, 68], out: [0, 1], zone: 'R' },
  { cell: [79, 68], out: [0, 1], zone: 'R' },
  { cell: [93, 60], out: [1, 0], zone: 'P' },
  { cell: [93, 66], out: [1, 0], zone: 'P' },
];

export const RISERS = [
  { zone: 'A', pos: [45.5, 55.5] },
  { zone: 'A', pos: [58.5, 55.5] },
  { zone: 'A', pos: [46.5, 60.5] },
  { zone: 'A', pos: [57.5, 49.5] },
  { zone: 'B', pos: [31.5, 49.5] },
  { zone: 'B', pos: [33.5, 54.5] },
  { zone: 'C', pos: [19.5, 50.5] },
  { zone: 'C', pos: [23.5, 54.5] },
  { zone: 'S', pos: [20.5, 62.5] },
  { zone: 'S', pos: [27.5, 66.5] },
  { zone: 'S', pos: [22.5, 68] },
  { zone: 'D', pos: [44.5, 42.5] },
  { zone: 'D', pos: [59.5, 42.5] },
  { zone: 'D', pos: [45.5, 35.5] },
  { zone: 'O', pos: [33.5, 36.5] },
  { zone: 'O', pos: [38.5, 42.5] },
  { zone: 'G', pos: [26.5, 14.5] },
  { zone: 'G', pos: [31.5, 18.5] },
  { zone: 'F', pos: [69.5, 36.5] },
  { zone: 'F', pos: [64.5, 42.5] },
  { zone: 'H', pos: [71.5, 14.5] },
  { zone: 'H', pos: [76.5, 18.5] },
  { zone: 'K', pos: [46.5, 22.5] },
  { zone: 'K', pos: [54.5, 29.5] },
  { zone: 'N', pos: [44, 15.5] },
  { zone: 'N', pos: [56, 15.5] },
  { zone: 'N', pos: [51.5, 9] },
  { zone: 'E', pos: [72.5, 54.5] },
  { zone: 'E', pos: [68, 55.5] },
  { zone: 'R', pos: [76.5, 60.5] },
  { zone: 'R', pos: [79.5, 65.5] },
  { zone: 'P', pos: [90.5, 61] },
  { zone: 'P', pos: [90.5, 67.5] },
  { zone: 'I', pos: [86.5, 45.5] },
  { zone: 'I', pos: [97, 46.5] },
  { zone: 'I', pos: [98.3, 54.5] },
  { zone: 'Q', pos: [84.5, 20.5] },
  { zone: 'Q', pos: [96.5, 22.5] },
  { zone: 'Q', pos: [85.5, 33.5] },
  { zone: 'Q', pos: [96.5, 34.5] },
  { zone: 'J', pos: [38.5, 67.5] },
  { zone: 'J', pos: [65.5, 67.5] },
  { zone: 'J', pos: [46.5, 63.5] },
  { zone: 'M', pos: [41.5, 90.5] },
  { zone: 'M', pos: [59.8, 88.5] },
  { zone: 'M', pos: [48.5, 84] },
];

export const WALL_BUYS = [
  { weapon: 'madera', cell: [45, 45], face: [0, 1] },
  { weapon: 'plastico', cell: [58, 45], face: [0, 1] },
  { weapon: 'vidrio', cell: [34, 57], face: [0, -1] },
  { weapon: 'lata', cell: [75, 51], face: [-1, 0] },
  { weapon: 'algarrobo', cell: [41, 42], face: [1, 0] },
  { weapon: 'granadas', cell: [24, 57], face: [0, -1] },
  { weapon: 'bowie', cell: [43, 26], face: [1, 0] },
];

export const PERK_SPOTS = [
  { perk: 'revive', cell: [47, 45], face: [0, 1] },
  { perk: 'speed', cell: [32, 45], face: [0, 1] },
  { perk: 'doubletap', cell: [27, 47], face: [-1, 0] },
  { perk: 'jugg', cell: [76, 57], face: [0, 1] },
  // (en la esquina de la biblioteca: corrida al medio entre la pared este y la
  // pilastra, que pegada a la pared se le metía el zócalo por el costado)
  { perk: 'deadshot', cell: [40, 45], face: [0, -1], slide: -0.32 },
  { perk: 'mule', cell: [71, 45], face: [0, -1] },
  { perk: 'phd', cell: [46, 19], face: [0, 1] },
  // el Aliento Dragónico, en la herrería: pared oeste, entre la ventana y las
  // herramientas (delante del zócalo; en la pared del palenque tapaba el
  // cartel de las granadas y rozaba el arco de la puerta)
  { perk: 'dragon', cell: [15, 47], face: [1, 0], out: 0.07 },
];

export const POWER = { cell: [49, 32], face: [0, 1] };
export const PAP = { cell: [51, 93], face: [0, -1], width: 2 };

export const BOX_SPOTS = [
  { cell: [56, 45], face: [0, 1], zone: 'A' },
  { cell: [62, 42], face: [-1, 0], zone: 'D' },
  { cell: [15, 64], face: [1, 0], zone: 'S' },
  { cell: [82, 59], face: [-1, 0], zone: 'R' },
  // (del lado de la puerta, lejos del pie de la escalera a la cumbre: ahí la tapaba)
  { cell: [47, 32], face: [0, -1], zone: 'K' },
  { cell: [39, 87], face: [1, 0], zone: 'M' },
];

export const BOX_START = [0, 1];

export const LIGHTS = [
  { zone: 'A', pos: [46, 25.5, 58], color: 0xff8a3a, intensity: 30, noPower: 1, kind: 'fire' },
  { zone: 'A', pos: [57, 25.5, 58], color: 0xff8a3a, intensity: 30, noPower: 1, kind: 'fire' },
  { zone: 'A', pos: [49.2, 25.5, 47.1], color: 0xff8a3a, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'A', pos: [54.8, 25.5, 47.1], color: 0xff8a3a, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'B', pos: [34, 26.6, 46.5], color: 0xffa050, intensity: 22, noPower: 0.5, kind: 'fire' },
  { zone: 'C', pos: [21, 25.4, 47.2], color: 0xff6a20, intensity: 34, noPower: 1, kind: 'fire' },
  { zone: 'C', pos: [25.6, 26.3, 56.2], color: 0xffb070, intensity: 12, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'S', pos: [17.5, 26, 59.5], color: 0xff8a3a, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'D', pos: [46, 29.4, 33.6], color: 0xff7a30, intensity: 42, noPower: 0.35, kind: 'fire' },
  { zone: 'D', pos: [51.5, 34.4, 41], color: 0xffc080, intensity: 30, noPower: 0.25, kind: 'candle' },
  { zone: 'D', pos: [61.3, 31.2, 33.4], color: 0xffa050, intensity: 18, noPower: 0.3, kind: 'fire' },
  { zone: 'D', pos: [51.5, 36.9, 38.5], color: 0xffc890, intensity: 24, noPower: 0.3, kind: 'candle', noHalo: 1 },
  { zone: 'D', pos: [51.5, 31.4, 43.6], color: 0xffb070, intensity: 14, noPower: 0.3, kind: 'fire', noHalo: 1 },
  { zone: 'O', pos: [34.5, 33.9, 39], color: 0xffc890, intensity: 30, noPower: 0.4, kind: 'candle' },
  { zone: 'O', pos: [29, 33.5, 25], color: 0xffa050, intensity: 16, noPower: 1, kind: 'fire' },
  { zone: 'O', pos: [34, 36, 39.5], color: 0xffc890, intensity: 14, noPower: 0.4, kind: 'candle', noHalo: 1 },
  { zone: 'F', pos: [68.5, 31.3, 35.9], color: 0xffb070, intensity: 14, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'F', pos: [68.5, 35, 40], color: 0x9a8aff, intensity: 14, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'F', pos: [74, 33.5, 25], color: 0xffa050, intensity: 16, noPower: 1, kind: 'fire' },
  { zone: 'F', pos: [68.5, 37, 38.5], color: 0xffd0a0, intensity: 10, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'G', pos: [25.5, 37.4, 18.5], color: 0xff8a3a, intensity: 24, noPower: 1, kind: 'fire' },
  { zone: 'H', pos: [70, 37.4, 18.5], color: 0xff8a3a, intensity: 24, noPower: 1, kind: 'fire' },
  { zone: 'K', pos: [48, 33.6, 21.5], color: 0xff7a30, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'K', pos: [55, 33.6, 21.5], color: 0xff7a30, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'K', pos: [51.5, 36.8, 26], color: 0xffc080, intensity: 18, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'N', pos: [51.5, 41.4, 16], color: 0xff8a3a, intensity: 28, noPower: 1, kind: 'fire' },
  { zone: 'E', pos: [71.5, 25.4, 47.2], color: 0xff6a20, intensity: 30, noPower: 1, kind: 'fire' },
  { zone: 'E', pos: [67, 28.2, 53], color: 0xffb070, intensity: 16, noPower: 0.4, kind: 'candle', noHalo: 1 },
  { zone: 'R', pos: [75.5, 23.2, 62.5], color: 0xffa860, intensity: 16, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'P', pos: [87.5, 22.6, 60.5], color: 0xffa860, intensity: 12, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'P', pos: [88, 22.6, 67], color: 0xffa860, intensity: 12, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'I', pos: [90, 21, 47], color: 0x6ab8ff, intensity: 24, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'I', pos: [96, 20, 53], color: 0x9ad8ff, intensity: 16, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'Q', pos: [89.5, 17.2, 25], color: 0xff7a30, intensity: 58, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'Q', pos: [83.4, 14, 27.2], color: 0xffb048, intensity: 22, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'Q', pos: [97.4, 14, 29], color: 0xffb048, intensity: 20, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'Q', pos: [90, 15.5, 16.8], color: 0x7a8cff, intensity: 16, noPower: 1, kind: 'candle', noHalo: 1 },
  { zone: 'Q', pos: [81.4, 13.4, 38.8], color: 0x5a8aff, intensity: 18, noPower: 1, kind: 'candle' },
  { zone: 'J', pos: [39, 33.4, 66.5], color: 0xff8a3a, intensity: 22, noPower: 1, kind: 'fire' },
  { zone: 'J', pos: [64.5, 33.4, 66.5], color: 0xff8a3a, intensity: 22, noPower: 1, kind: 'fire' },
  { zone: 'L', pos: [51.5, 27.6, 64], color: 0xffa050, intensity: 18, noPower: 1, kind: 'fire' },
  { zone: 'M', pos: [46, 21.3, 90], color: 0xffb070, intensity: 22, noPower: 1, kind: 'fire' },
  { zone: 'M', pos: [62.96, 21.7, 88.5], color: 0xffc080, intensity: 12, noPower: 1, kind: 'candle' },
];

export const FIRES = [
  { pos: [21, 24.7, 46.9], spread: 0.35, sound: [21, 25, 47.2] },
  { pos: [46, 28.5, 33.5], spread: 0.5, sound: [46, 29, 33.8] },
  { pos: [71.5, 24.7, 46.9], spread: 0.3, sound: [71.5, 25, 47.2] },
];

export const TITLE_CAM = { at: [30, 36, 76], amp: [3, 0.8], look: [52, 30, 40], lookAmp: 4 };

// Easter egg "La Gran Guerra" (entities/CastleEgg.js): dónde está cada cosa.
export const EE = {
  // Martín Fierro, al lado del fogón del gran salón
  fierro: [49.2, 36.4],
  // los altares de los mates de la luz (en la herrería, el mirador del
  // viento, el campanario y la gruta) y el erke del temple de cada uno
  altars: { fuego: [19.5, 52.5], viento: [29, 16.2], rayo: [74, 16.8], hielo: [93.5, 50.5] },
  erkes: { fuego: [21.5, 53.8], viento: [26.8, 17], rayo: [76.2, 15.3], hielo: [91.5, 51.8] },
  // la vuelta del fuego: la yesca, la fragua, el fuelle, el yunque y los
  // braseros donde se sienta la salamandra
  fuego: { yesca: [[44.5, 53.5], [37.6, 54.2], [29.5, 65]], fragua: [21, 46.02], fuelle: [18.2, 47.8], yunque: [22.3, 49.6], braseros: [[17.5, 59.5], [57, 58], [64.5, 66.5]] },
  // la del viento: los techos con veleta y las zonas donde andan las plumas
  viento: { veletas: ['O', 'F', 'B', 'E'], plumas: ['J', 'N', 'S'] },
  // la del rayo: el altar de la capilla, el vitral, la calabaza y las marcas de la tormenta
  rayo: { rezo: [68.5, 34.7], vitral: [70.2, 33.02], calabaza: [73.5, 14.8], marcas: [[55.5, 52.5], [39.5, 63], [51.5, 12.5], [26.5, 61], [60.5, 63]] },
  // la del hielo: el bloque de la cumbre y las cinco agujas de los penitentes
  hielo: { bloque: [58, 13.4], penitentes: [[92.9, 47], [95.6, 47.6], [97, 49.9], [96.4, 52.6], [94.1, 54]] },
  // la cueva del dragón: dónde duerme (x, z, giro), el fogón de la pava, el
  // mate gigante, el termómetro y las cuatro cadenas (pared, segmento del dragón)
  cueva: { dragon: [89.5, 24.5, 0], fogon: [84.5, 31], mate: [91.8, 30.8], dial: [86.8, 33.4], cadenas: [[80.25, 21, 3], [100.75, 21, 9], [80.25, 30, 16], [100.75, 30, 26]] },
  // el techo del gran salón donde se posa (x, y, z, giro) y la cumbre del juramento (x, z, giro)
  techo: [52, 42.7, 40.5, 0],
  cumbre: [51.5, 14.2, Math.PI / 2],
  jura: [57.2, 14.2],
  // el Chiquitijuein en el adarve (x, y, z) y de dónde salen los Caballeros Negros
  chiqui: [44.5, 32, 62.6],
  caballeros: [52, 60.4],
};

const R90 = Math.PI / 2;
export const PROPS = [
  // ---- el patio de armas: la fuente del dragón, braseros, estandartes y trastos
  { type: 'fuenteDragon', pos: [52, 56.2], r: 2.1 },
  { type: 'brasero', pos: [46, 58] },
  { type: 'brasero', pos: [57, 58] },
  { type: 'brasero', pos: [48.3, 47.1] },
  { type: 'brasero', pos: [55.7, 47.1] },
  { type: 'estandarte', pos: [43.4, 46.02], kind: 'fuego', y0: 3.4, h: 3.4 },
  { type: 'estandarte', pos: [60.6, 46.02], kind: 'hielo', y0: 3.4, h: 3.4 },
  { type: 'estandarte', pos: [49, 46.02], kind: 'viento', y0: 4.6, h: 2.6, w: 0.9 },
  { type: 'estandarte', pos: [55, 46.02], kind: 'rayo', y0: 4.6, h: 2.6, w: 0.9 },
  { type: 'cart', pos: [45.5, 51], rot: 0.35 },
  { type: 'crates', pos: [44.6, 60.5], rot: 0.2 },
  { type: 'barrica', pos: [57.8, 60.6] },
  { type: 'barrica', pos: [58.6, 60.2] },
  { type: 'sacks', pos: [57.6, 51.2], rot: 1.2 },
  { type: 'munecoNieve', pos: [46.4, 55.0], rot: 0.9 },
  { type: 'lena', pos: [43.9, 46.55] },
  { type: 'trineo', pos: [58.6, 49.4], rot: 0.4 },
  // ---- la caballeriza
  { type: 'cuadra', pos: [28, 48], rot: R90, n: 2, sw: 1.9, horses: [1], names: ['MALACARA', 'TOSTADO'] },
  { type: 'cuadra', pos: [28, 54.5], rot: R90, n: 2, sw: 2.3, horses: [0], names: ['PICAZO', 'ZAINO'] },
  { type: 'arreos', pos: [37.3, 56.98], rot: Math.PI },
  { type: 'candil', pos: [40.98, 50.6], rot: -R90 },
  { type: 'candil', pos: [40.98, 54.6], rot: -R90 },
  { type: 'hay', pos: [38.8, 55.2] },
  { type: 'hay', pos: [39.2, 53.7], rot: 0.4 },
  { type: 'saddle', pos: [33.4, 55.6], rot: Math.PI },
  { type: 'trough', pos: [34.5, 53.3] },
  { type: 'antorcha', pos: [34, 46.03] },
  { type: 'antorcha', pos: [39, 56.97], rot: Math.PI },
  // ---- la herrería (la fragua es la chimenea del fondo)
  { type: 'chimenea', pos: [21, 46.02], top: 6.6 },
  { type: 'yunque', pos: [22.3, 49.6], rot: 0.3 },
  { type: 'fuelle', pos: [18.2, 47.8], rot: R90 },
  { type: 'armero', pos: [17.6, 56.97], rot: Math.PI },
  { type: 'trough', pos: [25, 51.2], rot: R90 },
  { type: 'crates', pos: [16.8, 52.2], rot: 0.5 },
  { type: 'herramientas', pos: [17.4, 46.02], w: 1.6 },
  { type: 'barrica', pos: [23.9, 46.8] },
  { type: 'candil', pos: [25.6, 56.98], rot: Math.PI },
  // ---- el palenque: la sortija, la tribuna y un brasero
  { type: 'sortija', pos: [23.5, 62.6], live: 1 },
  { type: 'tribuna', pos: [23.5, 68.6], rot: Math.PI, len: 6 },
  { type: 'brasero', pos: [17.5, 59.5] },
  { type: 'hay', pos: [29.8, 59.4] },
  { type: 'barrica', pos: [30.4, 69.2] },
  // ---- el gran salón: el fogón, dos mesas de banquete, tapices, armaduras y la araña
  { type: 'chimenea', pos: [46, 33.02], top: 10.5 },
  { type: 'mesaBanquete', pos: [46.6, 41.2], len: 6 },
  { type: 'mesaBanquete', pos: [56.6, 41.2], len: 6 },
  { type: 'tapiz', pos: [44.4, 44.98], rot: Math.PI, kind: 'fuego', y0: 1.6 },
  { type: 'tapiz', pos: [59.2, 44.98], rot: Math.PI, kind: 'viento', y0: 1.6 },
  { type: 'tapiz', pos: [56.2, 33.02], kind: 'rayo', y0: 1.6 },
  { type: 'tapiz', pos: [59.6, 33.02], kind: 'hielo', y0: 1.6, w: 2 },
  { type: 'armadura', pos: [61.5, 35.2], rot: -R90, kind: 'fuego' },
  { type: 'armadura', pos: [61.5, 40.95], rot: -R90, kind: 'hielo' },
  { type: 'armadura', pos: [42.5, 43.5], rot: R90, kind: 'viento' },
  { type: 'armadura', pos: [42.5, 36.8], rot: R90, kind: 'rayo' },
  { type: 'arana', pos: [51.5, 41.2], top: 10.5, hang: 6.4 },
  // (al costado del pie de la escalera: en la punta de las mesas cerraban el paso)
  { type: 'candelabro', pos: [49.3, 38.2] },
  { type: 'candelabro', pos: [54.7, 38.2] },
  { type: 'antorcha', pos: [48.5, 44.97], rot: Math.PI },
  { type: 'antorcha', pos: [54.8, 44.97], rot: Math.PI },
  { type: 'antorcha', pos: [61.3, 33.03] },
  { type: 'alfombra', pos: [51.5, 41.6], len: 5.6, w: 1.5 },
  { type: 'pendon', pos: [44.5, 39], kind: 'fuego', top: 9.9, h: 4.4 },
  { type: 'pendon', pos: [47.5, 39], kind: 'viento', top: 9.9, h: 4.4 },
  { type: 'pendon', pos: [56.5, 39], kind: 'rayo', top: 9.9, h: 4.4 },
  { type: 'pendon', pos: [59.5, 39], kind: 'hielo', top: 9.9, h: 4.4 },
  // ---- la biblioteca
  { type: 'atril', pos: [34, 38.6], rot: 0.2 },
  { type: 'escritorio', pos: [35.5, 41.8], rot: Math.PI },
  { type: 'candelabro', pos: [31.5, 36] },
  { type: 'escalera', pos: [29.2, 40], rot: R90, h: 5.3, lean: 1.3 },
  { type: 'globo', pos: [37.8, 35.6] },
  { type: 'mesaMapa', pos: [31.2, 41.3] },
  { type: 'arana', pos: [34.5, 39], top: 11.2, hang: 6.2 },
  // ---- la escalera cubierta al mirador
  { type: 'antorcha', pos: [29.97, 25], rot: -R90 },
  { type: 'antorcha', pos: [73.03, 25], rot: R90 },
  // ---- el mirador del viento y el campanario
  { type: 'veleta', pos: [32.6, 12.6], h: 3.6 },
  { type: 'brasero', pos: [25.5, 18.5] },
  { type: 'espadana', pos: [73.5, 13.2] },
  { type: 'brasero', pos: [70, 18.5] },
  // ---- la capilla: bancos, el altar, vitrales y velas
  { type: 'altar', pos: [68.5, 33.8] },
  { type: 'pew', pos: [66.2, 37.8], rot: Math.PI },
  { type: 'pew', pos: [70.8, 37.8], rot: Math.PI },
  { type: 'pew', pos: [66.2, 39.8], rot: Math.PI },
  { type: 'pew', pos: [70.8, 39.8], rot: Math.PI },
  { type: 'pew', pos: [66.2, 41.8], rot: Math.PI },
  { type: 'pew', pos: [70.8, 41.8], rot: Math.PI },
  { type: 'vitral', pos: [64.8, 33.02], kind: 'fuego' },
  { type: 'vitral', pos: [66.8, 33.02], kind: 'viento' },
  { type: 'vitral', pos: [70.2, 33.02], kind: 'rayo' },
  { type: 'vitral', pos: [72.2, 33.02], kind: 'hielo', w: 1.1 },
  { type: 'roseton', pos: [68.5, 33.02], y0: 7.4, r: 1.55 },
  { type: 'candelabro', pos: [66.3, 34.6] },
  { type: 'candelabro', pos: [70.7, 34.6] },
  { type: 'fresco', pos: [74.98, 39], rot: -R90, w: 8, h: 4, y0: 4.2 },
  { type: 'cielo', pos: [69, 39], w: 12, d: 12, h: 11.18 },
  { type: 'estandarte', pos: [63.02, 35.6], rot: R90, kind: 'fuego', y0: 3.2, h: 3.4 },
  { type: 'estandarte', pos: [63.02, 42.4], rot: R90, kind: 'viento', y0: 3.2, h: 3.4 },
  { type: 'candil', pos: [74.98, 34.4], rot: -R90 },
  { type: 'candil', pos: [74.98, 43.6], rot: -R90 },
  // ---- la sala del trono
  { type: 'trono', pos: [51.5, 21.4] },
  { type: 'brasero', pos: [48, 23.6] },
  { type: 'brasero', pos: [55, 23.6] },
  { type: 'estandarte', pos: [48, 20.02], kind: 'sombra', y0: 1.8, h: 3.6 },
  { type: 'estandarte', pos: [55, 20.02], kind: 'sombra', y0: 1.8, h: 3.6 },
  { type: 'armadura', pos: [44.6, 30.2], rot: R90 },
  { type: 'armadura', pos: [57.2, 30.2], rot: -R90 },
  { type: 'candelabro', pos: [45, 24.6] },
  { type: 'alfombra', pos: [51.5, 27.3], len: 7.6, w: 1.6 },
  // ---- la cumbre: las tumbas de los cuatro caballeros
  { type: 'tumbaCaballero', pos: [45, 11], kind: 'fuego' },
  { type: 'tumbaCaballero', pos: [49, 11], kind: 'viento' },
  { type: 'tumbaCaballero', pos: [54, 11], kind: 'rayo' },
  { type: 'tumbaCaballero', pos: [58, 11], kind: 'hielo' },
  { type: 'munecoNieve', pos: [42.8, 17.6], rot: 2.4 },
  { type: 'brasero', pos: [51.5, 16] },
  // ---- la cocina: el fogón, el asador a la cruz y la mesa
  { type: 'chimenea', pos: [71.5, 46.02], top: 6.2 },
  { type: 'asador', pos: [64.8, 54.2], rot: 0.6 },
  { type: 'mesaCocina', pos: [69.6, 52.6], rot: 0.05 },
  { type: 'caldero', pos: [73.4, 50] },
  { type: 'sacks', pos: [68.4, 56.1], rot: 0.3 },
  { type: 'ganchos', pos: [69, 50.2], top: 30 },
  { type: 'hornoBarro', pos: [64, 50.3], rot: R90 },
  { type: 'alacena', pos: [66.2, 56.98], rot: Math.PI },
  { type: 'repisa', pos: [74.98, 52.95], rot: -R90 },
  { type: 'ristras', pos: [63.02, 52.6], rot: R90 },
  { type: 'lena', pos: [65.6, 46.55], len: 1 },
  { type: 'barrica', pos: [63.5, 56.4] },
  { type: 'candil', pos: [64.5, 46.02] },
  { type: 'candil', pos: [70, 56.98], rot: Math.PI },
  { type: 'candil', pos: [74.98, 50.5], rot: -R90 },
  // ---- la bodega: toneles del malbec de la Gran Guerra
  { type: 'tonel', pos: [79.6, 60.4], rot: Math.PI },
  { type: 'tonel', pos: [79.6, 63.4], rot: Math.PI },
  { type: 'tonel', pos: [75, 66.6], rot: R90, r: 0.6, len: 1.2 },
  { type: 'barrica', pos: [70.8, 66.6] },
  { type: 'barrica', pos: [71.8, 66.9] },
  { type: 'crates', pos: [80.4, 66.2], rot: 0.3 },
  { type: 'antorcha', pos: [70.03, 60.6], rot: R90 },
  { type: 'botellero', pos: [70.02, 63.5], rot: R90 },
  { type: 'botellero', pos: [77, 67.98], rot: Math.PI },
  { type: 'mesaVino', pos: [75.8, 63.4] },
  { type: 'candil', pos: [81.97, 66.2], rot: -R90 },
  { type: 'candil', pos: [70.02, 58.8], rot: R90 },
  // ---- las mazmorras
  { type: 'celdaK', pos: [85.2, 59.6], rot: R90, w: 4.4, d: 4 },
  { type: 'celdaK', pos: [85.2, 66.4], rot: R90, w: 5, d: 4, open: 1 },
  { type: 'grilletes', pos: [92.98, 65.1], rot: -R90 },
  { type: 'cadenas', pos: [89.5, 59], h: 1.2, top: 23.8 },
  { type: 'cadenas', pos: [89.5, 67.5], h: 1.5, top: 23.8 },
  { type: 'esqueleto', pos: [83.3, 68.2], rot: R90 },
  { type: 'candil', pos: [92.98, 58.5], rot: -R90 },
  { type: 'candil', pos: [92.98, 68.5], rot: -R90 },
  // ---- la gruta del glaciar: penitentes y carámbanos
  { type: 'penitentes', pos: [86, 49.8], n: 14, r: 1.6 },
  { type: 'penitentes', pos: [85.6, 43.6], n: 7, r: 1, h: 1.4 },
  // ---- la cueva del Mateendrache: rocas
  { type: 'brasasSuelo', pos: [89.5, 24.5], r: 7 },
  { type: 'tesoro', pos: [83.2, 26.5], r: 1.6 },
  { type: 'tesoro', pos: [97.6, 28.5], r: 1.4 },
  { type: 'cristales', pos: [80.7, 15.7], color: 0x6ad8ff, n: 8, h: 1.4 },
  { type: 'cristales', pos: [100.3, 15.7], color: 0x9a7aff, n: 7, h: 1.2 },
  { type: 'cristales', pos: [81, 39.3], color: 0x6ad8ff, n: 9, h: 1.6 },
  { type: 'cristales', pos: [100, 39.2], color: 0x5affc0, n: 6 },
  { type: 'cristales', pos: [98.4, 42.6], color: 0x9adcff, n: 8, h: 1.3 },
  { type: 'cristales', pos: [84.6, 54.4], color: 0x9adcff, n: 7, h: 1.1 },
  // ---- el adarve y la barbacana
  { type: 'brasero', pos: [39, 66.5] },
  { type: 'brasero', pos: [64.5, 66.5] },
  { type: 'munecoNieve', pos: [66.3, 65.6], rot: -2.3 },
  { type: 'antorcha', pos: [50.03, 64], rot: R90 },
  { type: 'antorcha', pos: [53.97, 66], rot: -R90 },
  // la defensa: cañones por las troneras del sur, balas, lanzas y la campana de alarma
  { type: 'canon', pos: [36.6, 68.2], rot: Math.PI },
  { type: 'canon', pos: [66.5, 68.2], rot: Math.PI },
  { type: 'balas', pos: [38.2, 68.35] },
  { type: 'balas', pos: [64.9, 68.35] },
  { type: 'armero', pos: [38.6, 62.2] },
  { type: 'armero', pos: [65.2, 62.2] },
  { type: 'campanaAlarma', pos: [45.5, 64.75] },
  { type: 'campanaAlarma', pos: [58.5, 64.75] },
  // ---- las termas del Inca
  { type: 'terma', pos: [45, 85.6], r: 2 },
  { type: 'terma', pos: [57.4, 88.2], r: 2.4 },
  { type: 'terma', pos: [56, 84.2], r: 1.3 },
  { type: 'brasero', pos: [46, 90] },
  { type: 'quincho', pos: [60.6, 84.4] },
  { type: 'tendedero', pos: [44.2, 91.9], len: 2.6, seed: 1 },
  { type: 'farolito', pos: [50.3, 81.8] },
  { type: 'farolito', pos: [53.7, 81.8] },
  { type: 'farolito', pos: [40.6, 83], rot: R90 },
  { type: 'farolito', pos: [63.4, 88.5], rot: -R90 },
  { type: 'balde', pos: [47.6, 87.4] },
  { type: 'balde', pos: [54.4, 86.2] },
  { type: 'balde', pos: [59.6, 90.6] },
  { type: 'banco', pos: [44.8, 88.6], rot: 0.1, snow: 1 },
];
// los altares y sus erkes (la boquilla del erke mira para el lado contrario al altar)
for (const k of Object.keys(EE.altars)) {
  const [ax, az] = EE.altars[k];
  const [ex, ez] = EE.erkes[k];
  PROPS.push({ type: 'altarMate', pos: [ax, az], kind: k });
  PROPS.push({ type: 'erke', pos: [ex, ez], kind: k, rot: Math.atan2(ex - ax, ez - az) });
}

// ---------------- actividades ----------------
const JARS = [
  { cell: [41, 35], face: [1, 0], zone: 'D' },
  { cell: [75, 47], face: [-1, 0], zone: 'E' },
  { cell: [93, 63], face: [-1, 0], zone: 'P' },
];
const TRAPS = [
  { id: 'liza', name: 'las Brasas de la Liza', kind: 'fire', power: false, rect: [17.1, 58.1, 23.9, 60.9], lever: { cell: [15, 61], face: [1, 0] } },
  { id: 'aceite', name: 'el Aceite Hirviendo', kind: 'scald', power: true, rect: [50.1, 64.1, 53.9, 69.9], lever: { cell: [49, 66], face: [1, 0] } },
];
const PARTS = [
  { id: 'tabla', name: 'Tabla de algarrobo', pos: [19.5, 24.03, 69.3], zone: 'S' },
  { id: 'umbo', name: 'Umbo de bronce', pos: [80.3, 20.03, 66.4], zone: 'R' },
  { id: 'correas', name: 'Correas de cuero', pos: [29.4, 24.03, 55.4], zone: 'B' },
];
const BENCH = { pos: [24.2, 54.4], rot: Math.PI };
export const ACT = {
  jars: JARS,
  traps: TRAPS,
  radios: [],
  parts: PARTS,
  bench: BENCH,
  shield: { name: 'Escudo de Caballero', hp: 1200, where: 'la herrería', plan: 'ESCUDO: tabla + umbo + correas', up: { name: 'Escudo del Dragón', hp: 1900, prop: 'blazon', kind: 'forge', trap: 'liza', anvil: [22.3, 49.6], secs: 25 } },
  radioAch: ['Cronista del Castillo', 'Leíste las crónicas de la Gran Guerra'],
};

// ---------------- bichos de ambiente ----------------
// (los cuervos, parados arriba de las almenas)
export const CRITTERS = {
  flocks: [
    { perch: [[43.5, 65.5], [45.5, 65.5], [47.5, 65.5]], yaw: Math.PI, y: 33.8 },
    { perch: [[45.5, 7.5], [49.5, 7.5], [53.5, 7.5]], yaw: 0, y: 41.8 },
  ],
  rats: [[[84.5, 58.5], [91.5, 58.5]], [[71.5, 66.5], [80.5, 66.5]]],
};

// ---------------- lo demás del mapa ----------------
// levels: pisos a distintas alturas; castle: lo propio del castillo (la
// montaña, las almenas, la nieve).
export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: 'puma', boss: 'caballero', egg: 'mateendrache', castle: true, levels: true };
export const TEXT = {
  soul: (many) => `El castillo se quedó con ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Vencieron' : 'Venciste'} al Chiquitijuein en la ronda ${r}. La Gran Guerra terminó... por ahora.`,
  egg: 'La Gran Guerra',
  loading: 'Subiendo a la cordillera…',
};
// Noche cerrada y despejada sobre la cordillera.
export const SKY = { daylight: 0 };

// Los hornos de barro de las empanadas (entities/Empanadas): pared y hacia dónde mira.
export const HORNO_SPOTS = [
  { cell: [41, 51], face: [-1, 0] },
  { cell: [58, 45], face: [0, -1] },
  { cell: [70, 57], face: [0, -1] },
];
