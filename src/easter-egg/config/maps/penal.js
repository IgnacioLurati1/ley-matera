// "Mate of the Dead": el penal de la Isla del Ceibo, en medio del río
// Paraná (Corrientes, 1878). Grilla de 1 m, x hacia el este y z hacia el sur.
// Es un mapa con alturas (world/Levels.js): cada zona tiene su piso (y) y su
// techo (roof); las rampas y escaleras unen los pisos. Es chico y apretado a
// propósito: el muelle, los yerbales, el secadero y los calabozos abajo (0 m);
// el pabellón, el comedor, la cocina, el patio y las duchas en el medio (4 m);
// la pasarela, la oficina del alcaide, la enfermería y la capilla arriba (8 m)
// y el cerro del Espinillo en la punta (12 m). Afuera, entre los calabozos y
// el secadero, queda el cementerio de los presos. Cruzando el río en bote,
// enfrente del muelle, está el islote con la ermita de San La Muerte (el
// santo de los presos): ahí quedó el Pack-a-Pava.

export const MAP_W = 98;
export const MAP_H = 140;
export const WALL_H = 3.6;

export const ZONES = {
  A: { name: 'El Pabellón B', sub: 'Penal de la Isla del Ceibo · Corrientes, 1878', y: 4, roof: 12.6, rects: [[32, 30, 59, 40], [32, 26, 59, 29, 8]], floor: 'concrete', wall: 'cellWall', ext: 'stoneWall', ceil: 'planksDark', cliff: 'cellWall' },
  B: { name: 'El Comedor', sub: 'Guiso de los jueves, desde hace cien años', y: 4, roof: 7.9, rects: [[32, 42, 45, 51]], floor: 'damero', wall: 'cellWall', ext: 'stoneWall', ceil: 'planksDark' },
  C: { name: 'La Cocina del Penal', sub: 'La olla nunca se enfría', y: 4, roof: 7.8, rects: [[47, 42, 56, 50]], floor: 'terracotta', wall: 'whitewash', ext: 'stoneWall', ceil: 'planksDark' },
  H: { name: 'El Patio de Recreo', sub: 'Una hora de sol por día', y: 4, rects: [[58, 42, 71, 53], [64, 54, 65, 59]], floor: 'dirt', outdoor: true, edge: 'bars' },
  I: { name: 'Los Yerbales de la Leva', sub: 'Cosechan de día... y de noche también', y: 0, rects: [[52, 61, 75, 73]], floor: 'dirtDark', outdoor: true, edge: 'bars' },
  S: { name: 'El Secadero', sub: 'El barbacuá seca la yerba con humo... y con otras cosas', y: 0, roof: 5.4, rects: [[42, 61, 50, 70]], floor: 'dirt', wall: 'planksDark', ext: 'stoneWall', ceil: 'corrugated' },
  J: { name: 'El Muelle', sub: 'El último bote salió hace cien años', y: 0, rects: [[25, 75, 62, 81], [30, 82, 32, 88], [50, 82, 52, 90]], floor: 'planks', outdoor: true, edge: 'rail' },
  K: { name: 'Los Calabozos', sub: 'Donde el penal guarda lo que no quiere que se vea', y: 0, roof: 3.4, rects: [[21, 48, 23, 78, 0, 3.4], [17, 50, 20, 53, 0, 3.4], [17, 59, 20, 63, 0, 3.4], [17, 69, 20, 72, 0, 3.4], [24, 61, 28, 67, 0, 3.4], [21, 40, 23, 47, 0, 7.6]], floor: 'concrete', wall: 'stoneWall', ext: 'stoneWall', ceil: 'stoneStep' },
  D: { name: 'Las Duchas', sub: 'El agua sale colorada', y: 4, roof: 7.6, rects: [[20, 30, 30, 38]], floor: 'azulejo', wall: 'azulejo', ext: 'stoneWall', ceil: 'planksDark' },
  E: { name: 'La Oficina del Alcaide', sub: 'Un porteño con la llave de todo', y: 8, roof: 11.9, rects: [[45, 15, 56, 24]], floor: 'parquet', wall: 'plasterOffice', ext: 'stoneWall', ceil: 'planksDark' },
  F: { name: 'La Enfermería', sub: 'Las camas todavía están tibias', y: 8, roof: 11.8, rects: [[30, 15, 43, 24]], floor: 'azulejo', wall: 'whitewash', ext: 'stoneWall', ceil: 'planksDark' },
  G: { name: 'La Capilla del Penal', sub: 'Velas rojas para un santo que no es santo', y: 8, roof: 15, rects: [[58, 11, 67, 24]], floor: 'calcareo', wall: 'whitewash', ext: 'stoneWall', ceil: 'planksDark' },
  P: { name: 'El Cerro del Espinillo', sub: 'Donde lo colgaron... o eso dicen', y: 12, circle: { x: 82.5, z: 18.5, r: 8.2 }, rects: [[69, 17, 73, 18]], floor: 'grass', outdoor: true, edge: 'rail' },
  // la estación de arriba de la telesilla del muelle (entities/PenalLift.js), al pie
  // del cerro: el portón al cerro se abre recién con el easter egg. La escalera
  // de tablones (la pasarela del alcaide) baja de la estación al piso de arriba
  // del pabellón: así la telesilla sirve para subir de una (del muelle a arriba
  // de todo) y los muertos también llegan a la estación
  T: { name: 'La Estación del Cerro', sub: 'La telesilla del alcaide: del muelle a la punta de la isla', y: 12, rects: [[78, 28, 88, 33], [61, 28, 77, 29]], floor: 'planks', outdoor: true, edge: 'rail' },
  // el islote de enfrente (solo se llega en el bote): el muellecito, el patio y la ermita
  L: { name: 'El Islote de las Ánimas', sub: 'Acá entierran a los que el río devuelve', y: 0, rects: [[11, 112, 14, 119], [3, 120, 22, 126], [3, 127, 6, 134], [19, 127, 22, 134]], floor: 'grass', outdoor: true, edge: 'rail' },
  M: { name: 'La Ermita de San La Muerte', sub: 'El santo de los presos no pregunta qué hiciste', y: 0, roof: 6.2, rects: [[8, 128, 17, 135]], floor: 'calcareo', wall: 'whitewash', ext: 'whitewash', ceil: 'planksDark' },
};

export const RAMPS = [
  { rect: [32, 30, 33, 35], dir: '-z', y0: 4, y1: 8, steps: true },
  { rect: [58, 30, 59, 35], dir: '-z', y0: 4, y1: 8, steps: true },
  { rect: [64, 54, 65, 59], dir: '+z', y0: 4, y1: 0, steps: true },
  { rect: [21, 40, 23, 47], dir: '-z', y0: 0, y1: 4, steps: true },
  { rect: [69, 17, 73, 18], dir: '+x', y0: 8, y1: 12, steps: true },
  // la pasarela del alcaide: del piso de arriba del pabellón a la estación de la telesilla
  { rect: [61, 28, 77, 29], dir: '+x', y0: 8, y1: 12, steps: true },
];
// el río: ahí el terreno de afuera se hunde bajo el agua
export const RIVER = [[0, 83, 97, 139], [0, 77, 18, 139], [64, 77, 97, 139], [86, 35, 97, 139]];

export const START_ZONE = 'A';
export const PLAYER_START = { x: 44, z: 35, yaw: Math.PI / 2 };

// kind: 'door', 'reja' (reja corrediza), 'debris', 'vida' (la abre la
// electricidad del gaucho life) o 'cerro' (la abre el easter egg).
export const DOORS = [
  { id: 1, zones: ['A', 'B'], cells: [[40, 41], [41, 41]], cost: 750, kind: 'reja' },
  { id: 2, zones: ['B', 'C'], cells: [[46, 45], [46, 46]], cost: 1000, kind: 'door' },
  { id: 3, zones: ['C', 'H'], cells: [[57, 45], [57, 46]], cost: 0, kind: 'vida' },
  { id: 4, zones: ['H', 'I'], cells: [[64, 60], [65, 60]], cost: 1250, kind: 'reja' },
  { id: 5, zones: ['I', 'S'], cells: [[51, 65], [51, 66]], cost: 750, kind: 'door' },
  { id: 6, zones: ['I', 'J'], cells: [[58, 74], [59, 74]], cost: 1250, kind: 'reja' },
  { id: 7, zones: ['J', 'K'], cells: [[24, 76], [24, 77]], cost: 1250, kind: 'door' },
  { id: 8, zones: ['K', 'D'], cells: [[21, 39], [22, 39]], cost: 1000, kind: 'reja' },
  { id: 9, zones: ['D', 'A'], cells: [[31, 37], [31, 38]], cost: 750, kind: 'door' },
  { id: 10, zones: ['A', 'E'], cells: [[50, 25], [51, 25]], cost: 0, kind: 'vida' },
  { id: 11, zones: ['E', 'F'], cells: [[44, 18], [44, 19]], cost: 1250, kind: 'door' },
  { id: 12, zones: ['E', 'G'], cells: [[57, 18], [57, 19]], cost: 1000, kind: 'door' },
  { id: 13, zones: ['G', 'P'], cells: [[68, 17], [68, 18]], cost: 0, kind: 'cerro', locked: true },
  { id: 14, zones: ['L', 'M'], cells: [[12, 127], [13, 127]], cost: 0, kind: 'door' },
  // de la estación de la telesilla al cerro (se abre con el de la capilla)
  { id: 15, zones: ['T', 'P'], cells: [[81, 27], [82, 27]], cost: 0, kind: 'cerro', locked: true },
  // del piso de arriba del pabellón a la pasarela de la estación (se abre sola
  // la primera vez que llega la telesilla: entities/PenalLift.js)
  { id: 16, zones: ['A', 'T'], cells: [[60, 28], [60, 29]], cost: 1250, kind: 'door' },
];

export const WINDOWS = [
  { cell: [60, 37], out: [1, 0], zone: 'A' },
  // (en la 27 quedaba pegada a la puerta de la pasarela y daba contra su
  // baranda: se veía un boquete entre las dos)
  { cell: [60, 26], out: [1, 0], zone: 'A' },
  { cell: [31, 27], out: [-1, 0], zone: 'A' },
  { cell: [31, 44], out: [-1, 0], zone: 'B' },
  { cell: [31, 50], out: [-1, 0], zone: 'B' },
  { cell: [36, 52], out: [0, 1], zone: 'B' },
  { cell: [51, 51], out: [0, 1], zone: 'C' },
  { cell: [54, 51], out: [0, 1], zone: 'C' },
  { cell: [72, 45], out: [1, 0], zone: 'H' },
  { cell: [72, 51], out: [1, 0], zone: 'H' },
  { cell: [60, 54], out: [0, 1], zone: 'H' },
  { cell: [70, 54], out: [0, 1], zone: 'H' },
  { cell: [76, 65], out: [1, 0], zone: 'I' },
  { cell: [76, 71], out: [1, 0], zone: 'I' },
  { cell: [72, 74], out: [0, 1], zone: 'I' },
  { cell: [54, 60], out: [0, -1], zone: 'I' },
  { cell: [41, 63], out: [-1, 0], zone: 'S' },
  { cell: [44, 60], out: [0, -1], zone: 'S' },
  { cell: [38, 82], out: [0, 1], zone: 'J' },
  { cell: [46, 82], out: [0, 1], zone: 'J' },
  { cell: [60, 82], out: [0, 1], zone: 'J' },
  { cell: [63, 78], out: [1, 0], zone: 'J' },
  { cell: [20, 56], out: [-1, 0], zone: 'K' },
  { cell: [20, 66], out: [-1, 0], zone: 'K' },
  { cell: [20, 75], out: [-1, 0], zone: 'K' },
  { cell: [23, 29], out: [0, -1], zone: 'D' },
  { cell: [27, 29], out: [0, -1], zone: 'D' },
  { cell: [19, 37], out: [-1, 0], zone: 'D' },
  { cell: [47, 14], out: [0, -1], zone: 'E' },
  { cell: [54, 14], out: [0, -1], zone: 'E' },
  { cell: [35, 14], out: [0, -1], zone: 'F' },
  { cell: [41, 14], out: [0, -1], zone: 'F' },
  { cell: [29, 23], out: [-1, 0], zone: 'F' },
  { cell: [65, 10], out: [0, -1], zone: 'G' },
  { cell: [68, 22], out: [1, 0], zone: 'G' },
  { cell: [7, 131], out: [-1, 0], zone: 'M' },
  { cell: [18, 131], out: [1, 0], zone: 'M' },
];

export const RISERS = [
  { zone: 'A', pos: [37, 37.5] },
  { zone: 'A', pos: [51, 33] },
  { zone: 'A', pos: [56.5, 38] },
  { zone: 'B', pos: [33.5, 47.5] },
  { zone: 'C', pos: [54.5, 47] },
  { zone: 'H', pos: [61, 45] },
  { zone: 'H', pos: [68, 52] },
  { zone: 'I', pos: [54, 62.5] },
  { zone: 'I', pos: [73, 72.5] },
  { zone: 'I', pos: [62, 72] },
  { zone: 'S', pos: [48.5, 69] },
  { zone: 'J', pos: [28, 77.5] },
  { zone: 'J', pos: [43, 79.5] },
  { zone: 'J', pos: [56.5, 78.2] },
  { zone: 'K', pos: [22, 57.5] },
  { zone: 'K', pos: [22, 68.5] },
  { zone: 'K', pos: [22, 74] },
  { zone: 'D', pos: [21.5, 31.5] },
  { zone: 'E', pos: [54, 23] },
  { zone: 'F', pos: [36, 21.5] },
  { zone: 'G', pos: [62.5, 16.5] },
  { zone: 'T', pos: [79.5, 30.5] },
  { zone: 'T', pos: [81.5, 33.2] },
  { zone: 'L', pos: [5, 122.5] },
  { zone: 'L', pos: [20.5, 122.5] },
  { zone: 'L', pos: [4.5, 132.5] },
  { zone: 'L', pos: [20.5, 132.5] },
];

export const WALL_BUYS = [
  // (corrido de la esquina)
  { weapon: 'madera', cell: [31, 40], face: [1, 0], slide: -0.5 },
  { weapon: 'plastico', cell: [32, 41], face: [0, 1] },
  { weapon: 'vidrio', cell: [56, 41], face: [0, 1] },
  { weapon: 'lata', cell: [57, 50], face: [1, 0] },
  { weapon: 'algarrobo', cell: [41, 68], face: [1, 0] },
  { weapon: 'bowie', cell: [24, 72], face: [-1, 0] },
];

// Las máquinas no andan con la luz: se prenden una por una con la
// electricidad del gaucho life. (Sin Quick Revive: el gaucho life ya te
// saca del cuerpo cuando caés.)
export const PERK_SPOTS = [
  { perk: 'jugg', cell: [47, 51], face: [0, -1] },
  { perk: 'speed', cell: [30, 29], face: [0, 1] },
  { perk: 'doubletap', cell: [43, 71], face: [0, -1] },
  { perk: 'deadshot', cell: [29, 20], face: [1, 0] },
  { perk: 'mule', cell: [57, 43], face: [1, 0] },
  // Electric Cherry (la Chisporé): en la pared oeste de la capilla, entre los
  // estandartes y la puerta
  { perk: 'cherry', cell: [57, 15], face: [1, 0], y: 8 },
];

export const POWER = { cell: [21, 29], face: [0, 1] };
// el Pack-a-Pava está en la ermita del islote (se llega en el bote del muelle)
export const PAP = { cell: [12, 136], face: [0, -1], width: 2 };

export const BOX_SPOTS = [
  { cell: [54, 25], face: [0, 1], zone: 'A' },
  { cell: [38, 52], face: [0, -1], zone: 'B' },
  { cell: [76, 68], face: [-1, 0], zone: 'I' },
  { cell: [24, 58], face: [-1, 0], zone: 'K' },
  { cell: [34, 25], face: [0, -1], zone: 'F' },
  { cell: [48, 71], face: [0, -1], zone: 'S' },
];
export const BOX_START = [0, 1];

export const LIGHTS = [
  { zone: 'A', pos: [39, 8.4, 35], color: 0xffd6a0, intensity: 40, noPower: 0.25 },
  { zone: 'A', pos: [52, 8.4, 35], color: 0xffd6a0, intensity: 40, noPower: 0.25, emergency: true },
  { zone: 'A', pos: [46, 11.6, 27.5], color: 0xffc890, intensity: 24, noPower: 0.3 },
  { zone: 'B', pos: [38.5, 7.2, 46.5], color: 0xffc48a, intensity: 34, noPower: 0.3 },
  { zone: 'C', pos: [51.5, 7.1, 46.5], color: 0xffb070, intensity: 26, noPower: 0.35 },
  { zone: 'C', pos: [49.4, 5.0, 43.3], color: 0xff7a2a, intensity: 22, noPower: 1, kind: 'fire' },
  { zone: 'H', pos: [65.5, 7.4, 45.5], color: 0xffb070, intensity: 30, noPower: 0.7, kind: 'lamp' },
  { zone: 'I', pos: [63.5, 3.4, 67], color: 0xffb070, intensity: 28, noPower: 0.7, kind: 'lamp' },
  { zone: 'S', pos: [46, 1.0, 65.8], color: 0xff6a20, intensity: 26, noPower: 1, kind: 'fire' },
  { zone: 'S', pos: [46, 4.6, 63], color: 0xffb070, intensity: 16, noPower: 0.4 },
  { zone: 'J', pos: [36, 3.4, 75.6], color: 0xffc890, intensity: 26, noPower: 0.7, kind: 'lamp' },
  { zone: 'J', pos: [54, 3.4, 75.6], color: 0xffc890, intensity: 26, noPower: 0.7, kind: 'lamp' },
  { zone: 'K', pos: [22, 2.9, 51.5], color: 0xffa860, intensity: 12, noPower: 1, kind: 'candle' },
  { zone: 'K', pos: [22, 2.9, 64], color: 0xffa860, intensity: 12, noPower: 1, kind: 'candle' },
  { zone: 'K', pos: [22, 2.9, 75], color: 0xffa860, intensity: 11, noPower: 1, kind: 'candle' },
  { zone: 'K', pos: [26.5, 2.6, 64], color: 0x7aff5a, intensity: 6, noPower: 1, kind: 'candle' },
  { zone: 'D', pos: [25.5, 7.0, 34], color: 0xc8e0ff, intensity: 28, noPower: 0.3 },
  { zone: 'E', pos: [50.5, 11.4, 19.5], color: 0xffc48a, intensity: 30, noPower: 0.4 },
  { zone: 'F', pos: [37, 11.3, 19.5], color: 0xd8f0ff, intensity: 30, noPower: 0.3 },
  { zone: 'G', pos: [62.5, 9.6, 13.6], color: 0xff5a3a, intensity: 18, noPower: 1, kind: 'candle' },
  { zone: 'G', pos: [62.5, 14.2, 18.5], color: 0xffc890, intensity: 22, noPower: 0.3 },
  { zone: 'T', pos: [79.2, 15.25, 28.9], color: 0xffc890, intensity: 20, noPower: 0.7, kind: 'lamp' },
  { zone: 'L', pos: [14.5, 3.25, 118.05], color: 0xffb070, intensity: 22, noPower: 0.7, kind: 'lamp' },
  { zone: 'M', pos: [13, 2.4, 133.6], color: 0xff4a2a, intensity: 16, noPower: 1, kind: 'candle' },
  { zone: 'M', pos: [13, 5.6, 130.5], color: 0xffc890, intensity: 16, noPower: 0.3 },
];

// Easter egg "Los Tres Gauchos" (entities/PenalEgg.js).
// arena2: la Cárcel de las Almas, adonde Gil arrastra a todos en la segunda
// fase (world/Cerro.js, world/cerroCarcel.js): colgada en la tormenta, arriba del río.
export const EE = { gauchos: [{ id: 'g1', name: 'Anacleto', cell: [54.5, 39.4], rot: Math.PI, w: 3, d: 3 }, { id: 'g2', name: 'Cirilo', cell: [19.0, 61.5], rot: Math.PI / 2, w: 5, d: 4 }, { id: 'g3', name: 'Benito', cell: [32.4, 17.5], rot: Math.PI / 2, w: 4, d: 4.8 }], dogs: [{ pos: [70.2, 48.5], rot: -Math.PI / 2, r: 5, need: 5 }, { pos: [74.2, 62.4], rot: -Math.PI / 2, r: 5, need: 5 }, { pos: [51.5, 76.9], rot: 0, r: 5, need: 5 }], safe: { pos: [55.5, 16.4], rot: -Math.PI / 2 }, chair: { pos: [48.5, 23.3], rot: Math.PI }, table: { pos: [37.5, 23.6], rot: 0 }, encierro: { pos: [26.9, 64], r: 2.1, need: 14 }, parts: [{ id: 'frasco', name: 'Frasco de ácido', pos: [31.3, 23.2] }, { id: 'manguera', name: 'Manguera de goma', pos: [28.6, 37.5] }, { id: 'valvula', name: 'Válvula de bronce', pos: [53.2, 43.6] }], yerba: [65.5, 48.5], altar: [82.5, 18.5], arena: { x: 82.5, z: 18.5, r: 7.4, y: 12 }, arena2: { x: 168, z: 44, r: 15.5, y: 58 } };

export const PROPS = [
  { type: 'celdas', pos: [37.5, 39.4], rot: Math.PI, len: 4, n: 2 },
  { type: 'celdas', pos: [47, 39.4], rot: Math.PI, len: 10, n: 4 },
  { type: 'celdas', pos: [58, 39.4], rot: Math.PI, len: 3.6, n: 1 },
  { type: 'celdasFalsas', pos: [46, 30.02], len: 23.5, n: 8, h: 3.9 },
  { type: 'celdasFalsas', pos: [40.5, 26.02], len: 15, n: 5, h: 3.4 },
  { type: 'mesaGuardia', pos: [36.5, 33.2], rot: 0.1 },
  { type: 'barrel', pos: [56.8, 36.6] },
  { type: 'crates', pos: [55.2, 36.9], rot: 0.3 },
  { type: 'balde', pos: [49.5, 37.5] },
  { type: 'colchon', pos: [43.5, 35.8], rot: 0.4 },
  { type: 'papeles', pos: [46, 33.5] },
  { type: 'papeles', pos: [51.5, 37], rot: 1.3 },
  { type: 'manchas', pos: [41, 34] },
  { type: 'manchas', pos: [53.5, 32.2], rot: 1 },
  // (arriba de la puerta a la pasarela, centrado: entre la esquina y el marco no entraba y se metía en la pared)
  { type: 'cartel', pos: [59.97, 29], rot: -Math.PI / 2, text: 'PABELLÓN B' },
  { type: 'cartel', pos: [21.03, 48.5], rot: Math.PI / 2, text: 'SILENCIO' },
  { type: 'bancoMadera', pos: [48, 31.4] },
  { type: 'crates', pos: [57.2, 27.2], rot: 0.2 },
  { type: 'colchon', pos: [44.5, 28.2], rot: 1.4 },
  { type: 'barrel', pos: [35.5, 27.4] },
  { type: 'papeles', pos: [51, 28], rot: 0.5 },
  { type: 'cadenas', pos: [39, 30.6], h: 2.2, top: 8 },
  { type: 'cadenas', pos: [53, 30.6], h: 1.6, top: 8 },
  { type: 'balcon', pos: [46, 40.98], rot: Math.PI, len: 28, y: 8.0 },
  { type: 'celdasFalsas', pos: [46, 40.98], rot: Math.PI, len: 27.6, n: 9, h: 3.4, y: 8.0 },
  { type: 'mesaLarga', pos: [35.5, 45], len: 4.5 },
  { type: 'mesaLarga', pos: [35.5, 48.5], len: 4.5 },
  { type: 'mesaLarga', pos: [42, 45], len: 4.5 },
  { type: 'mesaLarga', pos: [42, 48.5], len: 4.5 },
  { type: 'mostrador', pos: [36, 42.45], len: 5 },
  { type: 'olla', pos: [34.8, 42.45] },
  { type: 'bandejas', pos: [37.4, 42.45] },
  { type: 'pizarra', pos: [45.97, 43.2], rot: -Math.PI / 2, text: 'menu' },
  { type: 'pizarra', pos: [32.03, 47], rot: Math.PI / 2, text: 'marcas' },
  { type: 'tachos', pos: [44.6, 50.6] },
  { type: 'papeles', pos: [39, 51], rot: 0.3 },
  { type: 'manchas', pos: [39, 47], rot: 0.5 },
  { type: 'cartel', pos: [38.5, 42.03], text: 'COMEDOR' },
  { type: 'fogonPenal', pos: [50.5, 42.6] },
  { type: 'caldero', pos: [54.4, 48.6] },
  { type: 'mesaCocina', pos: [51.2, 46.6], rot: 0.05 },
  { type: 'shelfWall', pos: [47.45, 43.8], rot: Math.PI / 2, len: 2 },
  { type: 'sacks', pos: [55.6, 43.0], rot: 0.3 },
  { type: 'barrel', pos: [55.8, 45.6] },
  { type: 'ganchos', pos: [51.5, 49.8], top: 7.8 },
  { type: 'tachos', pos: [48.3, 49.5] },
  { type: 'manchas', pos: [50, 48.5], rot: 2 },
  { type: 'torre', pos: [69.3, 44.3] },
  { type: 'horca', pos: [62.2, 49.2] },
  { type: 'barras', pos: [68.6, 51.4], rot: 0.05 },
  { type: 'pesas', pos: [66.2, 52.2] },
  { type: 'bancoPiedra', pos: [60.5, 52.4] },
  { type: 'lamppost', pos: [65.5, 45.4] },
  { type: 'santuario', pos: [58.6, 46.4], rot: Math.PI / 2 },
  { type: 'alambre', pos: [64.7, 42.3], len: 12 },
  { type: 'escombros', pos: [70.8, 52.3], rot: 0.4 },
  { type: 'yerbal', pos: [56, 64], len: 5 },
  { type: 'yerbal', pos: [56, 67], len: 5 },
  { type: 'yerbal', pos: [56, 70], len: 5 },
  { type: 'yerbal', pos: [70.5, 65], len: 6 },
  { type: 'yerbal', pos: [70.5, 68], len: 6 },
  { type: 'yerbal', pos: [70.5, 71], len: 6 },
  { type: 'cart', pos: [61.2, 65.2], rot: 0.4 },
  { type: 'sacks', pos: [62.2, 69.6], rot: 1.1 },
  { type: 'sacks', pos: [61.0, 70.4], rot: 0.2 },
  { type: 'barrow', pos: [66.2, 63.2], rot: 0.8 },
  { type: 'lamppost', pos: [63.5, 67.4] },
  { type: 'torre', pos: [53.6, 72] },
  { type: 'rack', pos: [59, 62.3] },
  { type: 'barbacua', pos: [46, 65.8] },
  { type: 'bigsacks', pos: [46, 70] },
  { type: 'bigsacks', pos: [49.3, 62], rot: Math.PI },
  { type: 'yerbahang', pos: [46, 62], y: 1.8 },
  { type: 'yerbahang', pos: [46, 69.6], y: 1.8 },
  { type: 'firewood', pos: [49.4, 66.8], rot: Math.PI / 2 },
  { type: 'sacks', pos: [49.4, 68.9], rot: 0.4 },
  { type: 'bote', pos: [28.2, 85], rot: 0.1, y: -0.5 },
  { type: 'bote', pos: [34.8, 86.5], rot: -0.25, y: -0.5 },
  { type: 'bote', pos: [48.2, 87], rot: 0.2, y: -0.5 },
  { type: 'bitas', pos: [30.3, 87.5] },
  { type: 'bitas', pos: [32.7, 83] },
  { type: 'bitas', pos: [50.3, 89.5] },
  { type: 'bitas', pos: [52.7, 84] },
  { type: 'crates', pos: [27.5, 76.2], rot: 0.1 },
  { type: 'crates', pos: [44.5, 76.3], rot: -0.2 },
  { type: 'barrel', pos: [39.2, 76.0] },
  { type: 'barrel', pos: [40.1, 76.4] },
  { type: 'sogas', pos: [35, 80.2] },
  { type: 'sogas', pos: [56.5, 80.4] },
  { type: 'redes', pos: [48.5, 76.3] },
  { type: 'redes', pos: [31.5, 80.5], rot: 1.6 },
  { type: 'lamppost', pos: [36, 75.6] },
  { type: 'lamppost', pos: [54, 75.6] },
  { type: 'sacks', pos: [61.4, 76.4], rot: 0.4 },
  { type: 'cajones', pos: [51.2, 80.4], rot: 0.2 },
  { type: 'cajones', pos: [42.2, 80.5], rot: -0.3 },
  { type: 'celdaK', pos: [19.0, 51.5], rot: Math.PI / 2, w: 4, d: 4 },
  { type: 'celdaK', pos: [19.0, 71.0], rot: Math.PI / 2, w: 4, d: 4, open: 1 },
  { type: 'celdaK', pos: [26.5, 64.0], rot: -Math.PI / 2, w: 7, d: 5, open: 1 },
  { type: 'grilletes', pos: [21.05, 55], rot: Math.PI / 2 },
  { type: 'grilletes', pos: [21.05, 65], rot: Math.PI / 2 },
  { type: 'grilletes', pos: [21.05, 77.5], rot: Math.PI / 2 },
  { type: 'balde', pos: [22.9, 49.5] },
  { type: 'barrel', pos: [22.8, 60] },
  { type: 'papeles', pos: [22, 67], rot: 0.2 },
  { type: 'manchas', pos: [22, 54], rot: 0.3 },
  { type: 'manchas', pos: [22, 73], rot: 2 },
  { type: 'cadenas', pos: [22, 59], h: 1.2, top: 3.4 },
  { type: 'cadenas', pos: [22, 70.5], h: 1.5, top: 3.4 },
  { type: 'duchas', pos: [25.5, 34], len: 7 },
  { type: 'bancoMadera', pos: [24.2, 37.4] },
  { type: 'bancoMadera', pos: [26.8, 30.6] },
  { type: 'lavatorios', pos: [20.0, 32.8], rot: Math.PI / 2 },
  { type: 'lockers', pos: [30.99, 32], rot: -Math.PI / 2, n: 2 },
  { type: 'manchas', pos: [25, 36] },
  { type: 'charco', pos: [27, 32] },
  { type: 'charco', pos: [23, 36.5], rot: 1 },
  { type: 'desk', pos: [50.5, 18] },
  { type: 'bookshelf', pos: [45.4, 16.3], rot: Math.PI / 2 },
  { type: 'armchair', pos: [49.4, 20.1], rot: 2.8 },
  { type: 'armchair', pos: [51.8, 20.2], rot: -2.8 },
  { type: 'retrato', pos: [49.5, 15.02] },
  { type: 'bandera', pos: [51.8, 15.02] },
  { type: 'cabinet', pos: [55.4, 22.5], rot: -Math.PI / 2 },
  { type: 'rug', pos: [50.5, 19.5] },
  { type: 'perchero', pos: [45.8, 23.6] },
  { type: 'papeles', pos: [53, 20.5], rot: 0.4 },
  { type: 'pizarra', pos: [45.03, 22], rot: Math.PI / 2, text: 'mapa' },
  { type: 'camaEnf', pos: [36.5, 16.05] },
  { type: 'camaEnf', pos: [38.5, 16.05] },
  { type: 'camaEnf', pos: [40.5, 16.05] },
  { type: 'camaEnf', pos: [41, 23.9], rot: Math.PI },
  { type: 'biombo', pos: [38.3, 19.4], rot: 0.3 },
  { type: 'vitrina', pos: [43.98, 16.3], rot: -Math.PI / 2 },
  { type: 'vitrina', pos: [43.98, 22.4], rot: -Math.PI / 2 },
  { type: 'manchas', pos: [39.5, 18] },
  { type: 'papeles', pos: [35, 21], rot: 0.8 },
  { type: 'balde', pos: [42.8, 18.2] },
  { type: 'mesaOperaciones', pos: [41.2, 20.4] },
  { type: 'pew', pos: [60.5, 19], rot: Math.PI },
  { type: 'pew', pos: [64.5, 19], rot: Math.PI },
  { type: 'pew', pos: [60.5, 21.6], rot: Math.PI },
  { type: 'pew', pos: [64.5, 21.6], rot: Math.PI },
  { type: 'altar', pos: [62.5, 12.5] },
  { type: 'banderas', pos: [59, 12.2] },
  { type: 'banderas', pos: [66, 12.2] },
  { type: 'candles', pos: [61, 13.9] },
  { type: 'candles', pos: [64, 13.9] },
  { type: 'santuario', pos: [66.6, 16.5], rot: -Math.PI / 2 },
  { type: 'cruzPared', pos: [62.5, 11.02] },
  { type: 'banderas', pos: [76.5, 13], rot: 0.4 },
  { type: 'banderas', pos: [88.5, 13], rot: -0.5 },
  { type: 'banderas', pos: [89, 24.5], rot: 2.4 },
  { type: 'banderas', pos: [76, 24.2], rot: -2.2 },
  { type: 'espinillo', pos: [86.3, 15.2] },
  { type: 'tumbas', pos: [29.5, 45], n: 5 },
  { type: 'tumbas', pos: [28, 56], rot: 0.1, n: 6 },
  { type: 'tumbas', pos: [34, 57.5], rot: -0.1, n: 5 },
  { type: 'tumbas', pos: [30, 65], rot: 0.05, n: 6 },
  { type: 'ombu', pos: [36, 64.5] },
  { type: 'tree', pos: [26, 51] },
  { type: 'tree', pos: [39, 56] },
  { type: 'tree', pos: [82, 55.5] },
  { type: 'tree', pos: [14, 37] },
  { type: 'tree', pos: [80, 67] },
  { type: 'tree', pos: [15, 57] },
  { type: 'tree', pos: [16, 27] },
  { type: 'tree', pos: [27, 19] },
  { type: 'tree', pos: [41, 10] },
  { type: 'santuario', pos: [30.5, 69.5] },
  { type: 'torre', pos: [78, 43] },
  { type: 'reflector', pos: [69.9, 44.9], lift: 5.4 },
  { type: 'reflector', pos: [54.2, 72.6], rot: 2, lift: 5.4, speed: -0.35 },
  { type: 'reflector', pos: [78.6, 43.6], rot: 4, lift: 5.4, speed: 0.3 },
  { type: 'faro', pos: [17, 97], y: -0.55 },
  { type: 'naufragio', pos: [72, 91.5], rot: 0.6, y: -0.9 },
  // la capilla: donde estaba el Pack-a-Pava cuelga el timón del bote, de promesa (entities/PenalBoat.js)
  { type: 'candles', pos: [61.2, 24.2] },
  { type: 'candles', pos: [63.8, 24.2] },
  // el islote de las ánimas: el muellecito, las cruces de los ahogados y el ceibo
  { type: 'tablado', pos: [13, 116], len: 8, w: 4 },
  { type: 'bitas', pos: [14.6, 113.2] },
  { type: 'bitas', pos: [14.6, 117.6] },
  { type: 'lamppost', pos: [14.5, 118.6] },
  { type: 'tumbas', pos: [6.5, 123.8], n: 3 },
  { type: 'tumbas', pos: [19.5, 123.8], rot: 0.1, n: 3 },
  { type: 'tumbas', pos: [4.5, 131], rot: Math.PI / 2, n: 3 },
  { type: 'ceibo', pos: [20.6, 131] },
  { type: 'sanLaMuerte', pos: [11, 121.2], rot: Math.PI, small: true },
  { type: 'ofrendas', pos: [11, 120.5] },
  { type: 'candles', pos: [10.6, 126.3] },
  { type: 'candles', pos: [15.4, 126.3] },
  { type: 'espadana', pos: [13, 127.5], rot: Math.PI, y: 6.2 },
  // adentro de la ermita: bancos, velas y el santo arriba del Pack-a-Pava
  { type: 'pew', pos: [10.6, 129.8] },
  { type: 'pew', pos: [15.4, 129.8] },
  { type: 'pew', pos: [10.6, 132] },
  { type: 'pew', pos: [15.4, 132] },
  { type: 'sanLaMuerte', pos: [13, 135.97], rot: Math.PI, y: 2.85, shelf: true },
  { type: 'candles', pos: [10.4, 135.3] },
  { type: 'candles', pos: [15.6, 135.3] },
  { type: 'ofrendas', pos: [9, 135.1] },
  { type: 'ofrendas', pos: [17, 135.1] },
];

// ---------------- actividades ----------------
const JARS = [
  { cell: [31, 48], face: [1, 0], zone: 'B' },
  { cell: [19, 31], face: [1, 0], zone: 'D' },
  { cell: [24, 51], face: [-1, 0], zone: 'K' },
];
const TRAPS = [
  { id: 'picana', name: 'la Picana del Pabellón', kind: 'shock', power: true, rect: [52.1, 30.1, 55.9, 37.9], posts: [[52.4, 30.4], [52.4, 37.6]], lever: { cell: [56, 25], face: [0, 1] } },
  { id: 'horno', name: 'el Barbacuá del Secadero', kind: 'fire', power: false, rect: [43.6, 63.8, 48.4, 67.8], lever: { cell: [47, 60], face: [0, 1] } },
  { id: 'duchas', name: 'las Duchas Hirvientes', kind: 'scald', power: true, rect: [21.1, 32.3, 29.9, 35.7], lever: { cell: [19, 35], face: [1, 0] } },
];
const RADIO_POS = [{ pos: [36.8, 4.92, 33.05], rot: 0.2 }, { pos: [51.5, 5.02, 46.6], rot: 0 }, { pos: [50.9, 8.86, 18.05], rot: 0.5 }, { pos: [39.2, 0.92, 76.0], rot: 2.6 }, { pos: [22.8, 0.92, 60.0], rot: -1.4 }];
const PARTS = [
  { id: 'barrote', name: 'Barrote suelto', pos: [29.2, 4.03, 30.6], zone: 'D' },
  { id: 'grillete', name: 'Grillete', pos: [18.3, 0.03, 70.3], zone: 'K' },
  { id: 'chapa', name: 'Chapa de catre', pos: [41, 0.03, 78.5], zone: 'J' },
];
const BENCH = { pos: [42.8, 50.95], rot: Math.PI };

// ---------------- bichos de ambiente ----------------
export const CRITTERS = { flocks: [{ perch: [[59, 41.6], [64, 41.6], [69, 41.6]], yaw: Math.PI, y: 7.5 }, { perch: [[53, 60.6], [62, 60.6], [72, 60.6]], yaw: Math.PI, y: 3.5 }], rats: [[[22.5, 49], [22.5, 77]], [[32.6, 43], [32.6, 50.4]], [[42.6, 64], [42.6, 69.5]]] };

export const FIRES = [{ pos: [49.4, 4.5, 43.0], spread: 0.3, sound: [49.4, 5, 43.0] }, { pos: [46, 0.4, 65.8], spread: 0.6, sound: [46, 0.8, 65.8] }];
export const TITLE_CAM = { at: [35, 10.2, 27.8], amp: [2.5, 0.5], look: [50, 5.5, 36], lookAmp: 4 };

const LINES = [
  [
    'Radio Nacional, onda corta. Las visitas al penal de la Isla del Ceibo quedan suspendidas hasta nuevo aviso.',
    'El señor alcaide, llegado de Buenos Aires, asegura que en su penal no se toma mate. Dice que es cosa de gauchos.',
  ],
  [
    'Los pescadores del río juran que de noche se ven luces coloradas arriba del cerro. Como velas. Como banderas.',
    'Un preso escapado habló de tres gauchos que nadie pudo matar. Los tienen encerrados en lo más hondo del penal... y todavía cantan.',
  ],
  [
    'Última transmisión desde la isla. Si alguien escucha esto, no le recen al que cuelga del espinillo. Ese no concede milagros.',
    'Y ahora, un chamamé para los que siguen de pie.',
  ],
  [
    'El vapor Esperanza, que llevaba víveres al penal, no volvió a puerto. Lo último que telegrafió fue que en el agua hay manos.',
    'Se recomienda a los pescadores no acercarse a la Isla del Ceibo después de la oración.',
  ],
  [
    'Aviso al personal de guardia. El preso de la celda de castigo volvió a pedir yerba. No se le da. Hace tres años que está muerto.',
    'Si escucha cantar en los calabozos, no conteste. El que contesta, se queda.',
  ],
];
const RADIOS = RADIO_POS.map((r, i) => ({ ...r, lines: LINES[i] }));
export const ACT = {
  jars: JARS,
  traps: TRAPS,
  radios: RADIOS,
  parts: PARTS,
  bench: BENCH,
  shield: { name: 'Escudo de barrotes', hp: 1000, where: 'la mesa del comedor', plan: 'ESCUDO: barrote + grillete + chapa', up: { name: 'Escudo de barrotes templado', hp: 1600, prop: 'chain', kind: 'temper', trap: 'duchas', pos: [25.5, 33.2], rot: Math.PI, dunk: [31, 87.4], secs: 40 } },
  radioAch: ['Oyente de Radio Nacional', 'Escuchaste las cinco transmisiones del penal'],
};

// ---------------- lo demás del mapa ----------------
// levels: pisos a distintas alturas. vida: el modo gaucho life (se arranca así
// y la electricidad prende las máquinas). No hay ronda especial: el alcaide
// aparece de vez en cuando entre los muertos, como un Brutus porteño.
export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: null, boss: 'alcaide', egg: 'gauchos', penal: true, levels: true, vida: true };
export const TEXT = {
  soul: (many) => `El penal se quedó con ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Vencieron' : 'Venciste'} al Gauchito Gil en la ronda ${r}. Las almas del penal son libres... por ahora.`,
  egg: 'Los Tres Gauchos',
  loading: 'Cerrando las celdas…',
};
// Noche cerrada, con tormenta sobre el río.
export const SKY = { daylight: 0 };

// Los hornos de barro de las empanadas (entities/Empanadas): pared y hacia dónde mira.
export const HORNO_SPOTS = [
  { cell: [54, 41], face: [0, -1] },
  { cell: [64, 41], face: [0, 1] },
  { cell: [44, 22], face: [1, 0] },
  { cell: [41, 74], face: [0, 1] },
];

// Los huecos del gaucho life (entities/vidaHuecos.js): las rejas 'vida' se
// abren pegándole con la electricidad al tablero que está del otro lado de
// la pared. Solo el alma ve el hueco y lo pasa (los muertos no). cell: la
// pared; into: hacia la zona cerrada; where: dónde queda, mirando la reja.
export const HUECOS = [
  { door: 10, cell: [49, 25], into: [0, -1], panel: { cell: [53, 25], face: [0, -1] }, where: 'a la izquierda de la reja', label: 'OFICINA' },
  { door: 3, cell: [57, 48], into: [1, 0], panel: { cell: [57, 47], face: [1, 0] }, where: 'a la derecha de la reja', label: 'PATIO' },
];
