// "La Tapera": una chacra abandonada en medio de los maizales, al atardecer.
// Grilla de 1 m. x crece hacia el este, z hacia el sur. Las zonas pueden ser
// varios rectángulos juntos (rects) o un círculo (circle). Los espacios
// abiertos se cierran con alambrado (fence) y el prado con maíz (edge: 'corn');
// las paredes de verdad quedan para el rancho, el establo, el galpón y la atahona.
//
//   z 3-21    [ T Tablones (yerbal) ]  entrada  [ F Silos                ]
//   z 21-42   [ C Huerta ][ A Patio (arranque)   ][ D Establo (PaP) + cuadra ]
//   z 44-62   [ M ][ B Cocina / N Dormitorio ][ G Galpón (luz) ][ E Corral ]
//   z 67-90                                                ( P Prado, al final )
//
// Hay vueltas para correr: el patio tiene tranqueras a los tablones y a los
// silos, la atahona tiene una puerta de atrás al dormitorio y en el corral
// está el redondel de domar (un corral redondo con dos entradas).
//
// Tiene alturas (world/Levels.js, como el penal): el pajar, un ático cerrado
// arriba de los boxes del establo (3,6 m; se sube por el hueco de la
// escalera, que tiene su propio techo) y el barbacuá de los
// tablones (2,8 m), la plataforma de palos donde se seca la yerba con el
// humo del fuego de abajo. Los dos se abren junto con la zona de abajo
// (`with`). El rancho es la casa principal: tiene techos de bóveda.

export const MAP_W = 90;
export const MAP_H = 93;
export const WALL_H = 3.6;

export const ZONES = {
  A: { name: 'El Patio de la Tapera', sub: 'Chacra de los Cuervos · Misiones, 1987', rects: [[24, 23, 49, 33], [21, 34, 49, 42], [37, 21, 41, 22]], floor: 'dirt', outdoor: true, fence: true },
  B: { name: 'La Cocina del Rancho', sub: 'La pava sigue en la cocina a leña', rects: [[16, 44, 33, 52]], floor: 'terracotta', wall: 'adobe', ext: 'adobe', ceil: 'planksDark' },
  N: { name: 'El Dormitorio', sub: 'Las camas siguen tendidas', rects: [[16, 54, 27, 62], [28, 54, 33, 58]], floor: 'parquet', wall: 'adobe', ext: 'adobe', ceil: 'planksDark' },
  C: { name: 'La Huerta', sub: 'Los zapallos crecieron solos', rects: [[8, 23, 22, 32], [8, 33, 19, 42], [5, 26, 7, 39], [3, 29, 4, 36]], floor: 'dirtDark', outdoor: true, fence: true },
  D: { name: 'El Establo', sub: 'Los caballos se fueron. Algo volvió', rects: [[51, 23, 70, 31], [51, 32, 55, 38], [56, 32, 61, 32], [56, 33, 61, 34, 0, 6.2], [56, 35, 61, 38], [71, 26, 75, 35]], floor: 'dirtDark', wall: 'barn', ext: 'barn', ceil: 'planksDark', cliff: 'barn' },
  H: { name: 'El Pajar', sub: 'Arriba de los boxes, entre los fardos', with: 'D', y: 3.6, roof: 6.2, rects: [[62, 32, 70, 38]], floor: 'planks', wall: 'barn', ext: 'barn', ceil: 'planksDark', cliff: 'barn' },
  E: { name: 'El Corral', sub: 'El molino de viento no para aunque no sople', rects: [[53, 40, 74, 60], [75, 46, 80, 60], [57, 61, 76, 64]], floor: 'dirt', outdoor: true, fence: true },
  F: { name: 'Los Silos', sub: 'Llenos de algo que no es maíz', rects: [[43, 7, 68, 21], [45, 5, 65, 6], [49, 3, 61, 4], [69, 10, 70, 18], [71, 12, 72, 16]], floor: 'concrete', outdoor: true, fence: true },
  G: { name: 'El Galpón', sub: 'El tractor tiene la llave puesta', rects: [[35, 44, 51, 59]], floor: 'concrete', wall: 'corrugatedWall', ext: 'corrugatedWall', ceil: 'corrugated' },
  T: { name: 'Los Tablones', sub: 'El yerbal que nadie cosecha desde el 87', rects: [[7, 8, 35, 21], [7, 7, 29, 7], [10, 5, 29, 6], [14, 3, 28, 4], [5, 10, 6, 19], [3, 13, 4, 17]], floor: 'dirt', outdoor: true, fence: true, cliff: 'brick' },
  Y: { name: 'El Barbacuá', sub: 'La yerba se seca arriba del fuego', with: 'T', y: 2.8, rects: [[30, 3, 35, 7]], floor: 'planksDark', outdoor: true, fence: true, cliff: 'brick' },
  M: { name: 'La Atahona', sub: 'La piedra gira sola cuando nadie mira', rects: [[7, 44, 14, 54], [9, 55, 14, 58]], floor: 'terracotta', wall: 'brick', ext: 'brick', ceil: 'planksDark' },
  P: { name: 'El Prado', sub: 'Un claro redondo en el maizal', circle: { x: 75, z: 79, r: 11.5 }, rects: [[74, 66, 75, 68]], floor: 'grass', outdoor: true, edge: 'corn' },
};

// La escalera del pajar (en el establo) y la del barbacuá (en los tablones).
export const RAMPS = [
  { rect: [56, 33, 61, 34], dir: '+x', y0: 0, y1: 3.6, steps: true, mat: 'planks' },
  { rect: [24, 6, 29, 7], dir: '+x', y0: 0, y1: 2.8, steps: true, mat: 'planks' },
];

export const START_ZONE = 'A';
export const PLAYER_START = { x: 38, z: 31, yaw: Math.PI / 2 };

// kind: 'door' (puerta de un edificio), 'debris', 'gate' (tranquera del
// alambrado) o 'corn' (el maíz que se abre al final: lo abre el easter egg).
export const DOORS = [
  { id: 1, zones: ['A', 'B'], cells: [[27, 43], [28, 43]], cost: 750, kind: 'door' },
  { id: 2, zones: ['A', 'C'], cells: [[23, 31], [23, 32]], cost: 750, kind: 'gate' },
  { id: 3, zones: ['A', 'D'], cells: [[50, 30], [50, 31]], cost: 1000, kind: 'door' },
  { id: 4, zones: ['B', 'G'], cells: [[34, 48], [34, 49]], cost: 1000, kind: 'door' },
  { id: 5, zones: ['C', 'T'], cells: [[14, 22], [15, 22]], cost: 1250, kind: 'gate' },
  { id: 6, zones: ['C', 'M'], cells: [[10, 43], [11, 43]], cost: 1000, kind: 'door' },
  { id: 7, zones: ['G', 'E'], cells: [[52, 50], [52, 51]], cost: 1250, kind: 'door' },
  { id: 8, zones: ['D', 'E'], cells: [[60, 39], [61, 39]], cost: 1250, kind: 'debris' },
  { id: 9, zones: ['D', 'F'], cells: [[55, 22], [56, 22]], cost: 1250, kind: 'door' },
  { id: 10, zones: ['E', 'P'], cells: [[74, 65], [75, 65]], cost: 0, kind: 'corn', locked: true },
  { id: 11, zones: ['B', 'N'], cells: [[22, 53], [23, 53]], cost: 750, kind: 'door' },
  // tranqueras del patio a los tablones y a los silos (entre los cuervos del alambrado)
  { id: 12, zones: ['A', 'T'], cells: [[28, 22], [29, 22]], cost: 1000, kind: 'gate' },
  { id: 13, zones: ['A', 'F'], cells: [[47, 22], [48, 22]], cost: 1250, kind: 'gate' },
  // la puerta de atrás de la atahona, al dormitorio
  { id: 14, zones: ['M', 'N'], cells: [[15, 56], [15, 57]], cost: 1000, kind: 'door' },
];

// Ventanas con tablas (en el alambrado son tranqueras bajas tapiadas).
export const WINDOWS = [
  { cell: [38, 20], out: [0, -1], zone: 'A' },
  { cell: [40, 20], out: [0, -1], zone: 'A' },
  { cell: [17, 2], out: [0, -1], zone: 'T' },
  { cell: [25, 2], out: [0, -1], zone: 'T' },
  { cell: [2, 15], out: [-1, 0], zone: 'T' },
  { cell: [4, 10], out: [-1, 0], zone: 'T' },
  { cell: [55, 2], out: [0, -1], zone: 'F' },
  { cell: [73, 14], out: [1, 0], zone: 'F' },
  { cell: [64, 4], out: [0, -1], zone: 'F' },
  { cell: [2, 32], out: [-1, 0], zone: 'C' },
  { cell: [7, 23], out: [-1, 0], zone: 'C' },
  { cell: [76, 28], out: [1, 0], zone: 'D' },
  { cell: [76, 33], out: [1, 0], zone: 'D' },
  { cell: [73, 25], out: [0, -1], zone: 'D' },
  { cell: [20, 63], out: [0, 1], zone: 'N' },
  { cell: [25, 63], out: [0, 1], zone: 'N' },
  { cell: [31, 59], out: [0, 1], zone: 'N' },
  { cell: [15, 62], out: [-1, 0], zone: 'N' },
  { cell: [39, 60], out: [0, 1], zone: 'G' },
  { cell: [46, 60], out: [0, 1], zone: 'G' },
  { cell: [6, 48], out: [-1, 0], zone: 'M' },
  { cell: [11, 59], out: [0, 1], zone: 'M' },
  { cell: [81, 51], out: [1, 0], zone: 'E' },
  { cell: [81, 57], out: [1, 0], zone: 'E' },
  { cell: [78, 45], out: [0, -1], zone: 'E' },
  { cell: [62, 65], out: [0, 1], zone: 'E' },
  { cell: [54, 61], out: [0, 1], zone: 'E' },
];

// Muertos que salen de la tierra.
export const RISERS = [
  { zone: 'A', pos: [28, 27] },
  { zone: 'A', pos: [44, 36] },
  { zone: 'A', pos: [34, 39.5] },
  { zone: 'T', pos: [8, 8] },
  { zone: 'T', pos: [11, 12] },
  { zone: 'T', pos: [22, 16] },
  { zone: 'T', pos: [30, 8.2] },
  { zone: 'T', pos: [18, 20.4] },
  { zone: 'C', pos: [11, 28.5] },
  { zone: 'C', pos: [18, 35] },
  { zone: 'C', pos: [4, 33] },
  { zone: 'E', pos: [57, 47] },
  { zone: 'E', pos: [66, 50] },
  { zone: 'E', pos: [71, 58] },
  { zone: 'E', pos: [78, 55] },
  { zone: 'E', pos: [63, 62.5] },
  { zone: 'D', pos: [53.5, 36.5] },
];

export const WALL_BUYS = [
  { weapon: 'madera', cell: [25, 43], face: [0, -1] },
  { weapon: 'plastico', cell: [15, 45], face: [1, 0] },
  { weapon: 'vidrio', cell: [50, 25], face: [1, 0] },
  { weapon: 'lata', cell: [40, 43], face: [0, 1] },
  { weapon: 'algarrobo', cell: [54, 39], face: [0, -1] },
  { weapon: 'granadas', cell: [50, 37], face: [-1, 0] },
  { weapon: 'bowie', cell: [15, 51], face: [-1, 0] },
];

export const PERK_SPOTS = [
  { perk: 'revive', cell: [31, 43], face: [0, -1] },
  { perk: 'jugg', cell: [67, 22], face: [0, 1] },
  { perk: 'speed', cell: [52, 46], face: [-1, 0] },
  { perk: 'doubletap', cell: [66, 39], face: [0, 1] },
  { perk: 'deadshot', cell: [18, 63], face: [0, -1] },
  // Mulanda, arriba en el pajar
  { perk: 'mule', cell: [71, 37], face: [-1, 0] },
];

// La luz: el grupo electrógeno del galpón. El Pack-a-Pava, en el establo.
export const POWER = { cell: [43, 60], face: [0, -1] };
export const PAP = { cell: [61, 22], face: [0, 1], width: 2 };

export const BOX_SPOTS = [
  { cell: [50, 27], face: [-1, 0], zone: 'A' },
  { cell: [17, 43], face: [0, 1], zone: 'B' },
  { cell: [47, 43], face: [0, 1], zone: 'G' },
  { cell: [57, 39], face: [0, 1], zone: 'E' },
  { cell: [65, 22], face: [0, -1], zone: 'F' },
];
export const BOX_START = [0, 1];

export const LIGHTS = [
  { zone: 'A', pos: [37, 3.3, 33.45], color: 0xffb070, intensity: 30, noPower: 0.8, kind: 'lamp' },
  { zone: 'A', pos: [31, 1, 33], color: 0xff7a2a, intensity: 42, noPower: 1, kind: 'fire' },
  { zone: 'B', pos: [24, 3.05, 48], color: 0xffc48a, intensity: 34, noPower: 0.5 },
  { zone: 'N', pos: [23, 3.05, 58], color: 0xffb880, intensity: 28, noPower: 0.45 },
  { zone: 'D', pos: [60, 3.05, 31], color: 0xffc080, intensity: 44, noPower: 0.35 },
  { zone: 'H', pos: [66.5, 5.55, 35.5], color: 0xffb070, intensity: 20, noPower: 0.5 },
  { zone: 'Y', pos: [33.8, 5.05, 5.4], color: 0xffa860, intensity: 14, noPower: 1, kind: 'candle' },
  { zone: 'G', pos: [43, 3.05, 51], color: 0xffd6a0, intensity: 52, noPower: 0.05, emergency: true },
  { zone: 'M', pos: [13.2, 1.55, 45.3], color: 0xffb35a, intensity: 14, noPower: 1, kind: 'candle' },
  { zone: 'E', pos: [64.5, 3.3, 50.35], color: 0xffb070, intensity: 26, noPower: 0.7, kind: 'lamp' },
  { zone: 'F', pos: [47, 3.3, 13.85], color: 0xffc890, intensity: 26, noPower: 0.6, kind: 'lamp' },
];

// La defensa del yerbal (entities/FarmDefense.js): cada 10 rondas (o antes,
// si se llega a la cosecha sin haber tenido ninguna) la horda
// viene a romper las parcelas de los tablones (una por planta del easter egg).
// Los brocales de las torres de mate, la zona, la tranquera del patio que se
// abre sola y los nombres de las parcelas (en el orden de EE.plants).
const DEFENSE = {
  zone: 'T',
  gate: 12,
  every: 10,
  towers: [[12, 6.2], [21.5, 7.2], [17.5, 20.4], [33.3, 19]],
  names: ['la parcela del norte', 'la parcela del medio', 'la parcela del oeste', 'la parcela del este', 'la parcela de la tranquera'],
  map: { x0: 2, z0: 1, x1: 37, z1: 23 },
};

// Easter egg "La Hoz de la Muerte" (entities/FarmEgg.js).
export const EE = {
  // cada ritual con su vuelta: velones que apagan los muertos (velas), el
  // círculo que se muda entre los silos (luz) y almas que hay que ir a buscar (almas)
  rituals: [
    { id: 'hoja', name: 'la Hoja', zone: 'C', pos: [13, 32], r: 5.5, need: 10, kind: 'velas' },
    { id: 'mango', name: 'el Mango', zone: 'F', pos: [56, 13], r: 6, need: 12, kind: 'luz', spots: [[56, 13], [50, 16.5], [60.5, 16.5]], spotR: 3.6, every: 15 },
    { id: 'virola', name: 'la Virola', zone: 'H', pos: [66.5, 35.5], r: 2.6, need: 12, up: true, kind: 'almas' },
  ],
  barbacua: { zone: 'Y', deck: [30, 3, 36, 8], y: 2.8, mouth: [32.5, 8.1], secs: 45 },
  // la forja de la Hoz de la Muerte: segundos adentro del círculo, cuándo llega
  // el Cuervo y el lomo del techo del establo (x, z, alto) donde se posa
  papRitual: { pos: [62, 26], r: 5.5, secs: 45, crowAt: 0.3, roof: [61, 31, 10.2] },
  // muertos que hay que liquidar con la hoz antes de la forja (más por jugador)
  blood: { need: 15, per: 5 },
  bench: { pos: [42, 47.2], rot: 0 }, plants: [[15, 8.2], [26, 12.2], [9, 16.1], [32.5, 16.1], [21.5, 20.3]], mill: { pos: [10.5, 49.5] }, pack: { pos: [48, 56], rot: Math.PI / 2 }, altar: { pos: [75, 80] }, arena: { x: 75, z: 79, r: 11 }, defense: DEFENSE };

export const PROPS = [
  { type: 'fogon', pos: [31, 33] },
  { type: 'logseat', pos: [29.3, 34.2], rot: 0.9 },
  { type: 'logseat', pos: [32.7, 31.4], rot: -0.6 },
  { type: 'logseat', pos: [33.1, 34.8], rot: 0.4 },
  { type: 'lamppost', pos: [37, 34] },
  { type: 'well', pos: [42.5, 28.5] },
  { type: 'ombu', pos: [26.8, 25.8] },
  { type: 'cart', pos: [45.2, 39.6], rot: 0.4 },
  { type: 'hay', pos: [25.7, 40.4] },
  { type: 'washline', pos: [34, 24.6] },
  { type: 'firewood', pos: [48, 33.5], rot: Math.PI / 2 },
  { type: 'tires', pos: [39, 40.6] },
  { type: 'barrow', pos: [28.2, 38.2], rot: 0.8 },
  { type: 'galeria', pos: [28.5, 42.95], rot: Math.PI, len: 9 },
  { type: 'trough', pos: [46.8, 35.8], rot: Math.PI / 2 },
  { type: 'huerta', pos: [17.5, 26.5] },
  { type: 'huerta', pos: [17.2, 38.6] },
  { type: 'zapallos', pos: [11.5, 26] },
  { type: 'espantajo', pos: [19.6, 32], rot: -Math.PI / 2 },
  { type: 'coop', pos: [10.4, 39.6] },
  { type: 'washtub', pos: [21, 24.4] },
  { type: 'yerbal', pos: [11, 10], len: 6 },
  { type: 'yerbal', pos: [19.5, 10], len: 6 },
  { type: 'yerbal', pos: [28.5, 10], len: 6 },
  { type: 'yerbal', pos: [8.6, 14], len: 3 },
  { type: 'yerbal', pos: [15, 14], len: 5 },
  { type: 'yerbal', pos: [22.5, 14], len: 5 },
  { type: 'yerbal', pos: [30, 14], len: 5 },
  { type: 'yerbal', pos: [12, 18], len: 6 },
  { type: 'yerbal', pos: [27.5, 18], len: 6 },
  { type: 'sacks', pos: [19.5, 5.6] },
  { type: 'rack', pos: [33.6, 12.2], rot: Math.PI / 2 },
  // el barbacuá: base de ladrillo con la boca del fuego, catre de palos y techo de paja
  { type: 'barbacuaChacra', rect: [30, 3, 36, 8], y: 2.8, mouth: 32.5 },
  { type: 'barrow', pos: [34.2, 20.4], rot: 0.3 },
  { type: 'silo', pos: [48, 10.5] },
  { type: 'silo', pos: [64.5, 10.5] },
  { type: 'siloRoto', pos: [64.5, 17.4] },
  { type: 'pallets', pos: [45.2, 19.6] },
  { type: 'sacks', pos: [49.4, 20.3] },
  { type: 'barrel', pos: [68.2, 19.2] },
  { type: 'barrel', pos: [68.2, 20.3] },
  { type: 'lamppost', pos: [47, 14.4] },
  { type: 'trailer', pos: [58.5, 5.8], rot: 0.15 },
  // el pajar: los boxes quedan abajo (world/Farm.js) y arriba los fardos
  { type: 'pajar', rect: [62, 32, 71, 39], y: 3.6, roof: 6.2, door: 66.5 },
  // el granero: techo redondo de chapa arriba del establo y alero sobre el anexo
  { type: 'boveda', rect: [50, 22, 72, 40], y: 0, base: 6.2, band: 3.4, rise: 4.2, mat: 'tin', head: 'barn', trim: 'white', oculus: true, lean: [72, 25, 77, 37, 5.4, 3.45] },
  { type: 'rollo', pos: [63.6, 38], rot: Math.PI / 2 },
  { type: 'rollo', pos: [69.7, 33.3], rot: Math.PI / 2 + 0.2 },
  { type: 'hay', pos: [67.3, 37.9] },
  { type: 'sacks', pos: [65.2, 32.45] },
  { type: 'crates', pos: [67.9, 32.7] },
  { type: 'chest', pos: [65.2, 38.55] },
  { type: 'saddle', pos: [62.4, 35.8], rot: Math.PI / 2 },
  { type: 'barrel', pos: [62.45, 38.5] },
  { type: 'milkcans', pos: [69.9, 35.4] },
  { type: 'saddle', pos: [73.2, 30.6], rot: Math.PI / 2 },
  { type: 'saddle', pos: [73.2, 32.2], rot: Math.PI / 2 },
  { type: 'hay', pos: [73.5, 33.8], rot: 0.2 },
  { type: 'toolrack', pos: [71.5, 35.95], rot: Math.PI },
  { type: 'hay', pos: [53.2, 27.5], rot: 0.2 },
  { type: 'trough', pos: [57.5, 36.9] },
  { type: 'cart', pos: [69.2, 27.8], rot: Math.PI / 2 + 0.15 },
  { type: 'sacks', pos: [52.3, 34], rot: Math.PI / 2 },
  { type: 'milkcans', pos: [69.4, 24.2] },
  { type: 'windmill', pos: [77.6, 52.5] },
  { type: 'tank', pos: [77.6, 57.6] },
  { type: 'trough', pos: [72.2, 56], rot: Math.PI / 2 },
  { type: 'tractor', pos: [58.6, 57.6], rot: 0.3 },
  { type: 'rollo', pos: [56.6, 43.6] },
  { type: 'rollo', pos: [58.3, 44.8], rot: 1.1 },
  { type: 'rollo', pos: [70.5, 44.6], rot: 0.4 },
  { type: 'redondel', pos: [64.5, 50.5], r: 4.2, gates: [0, Math.PI] },
  { type: 'lamppost', pos: [64.5, 50.9] },
  { type: 'plow', pos: [66.5, 62.3], rot: 0.2 },
  { type: 'truck', pos: [38.6, 56.2] },
  { type: 'bigsacks', pos: [48.4, 47.6] },
  { type: 'crates', pos: [36.4, 45.4], rot: 0.2 },
  { type: 'barrel', pos: [50.4, 58.4] },
  { type: 'barrel', pos: [49.4, 58.5] },
  { type: 'generator', pos: [37.6, 50.8], rot: Math.PI / 2 },
  { type: 'toolrack', pos: [44.5, 44.05] },
  { type: 'tires', pos: [50.6, 45.2] },
  { type: 'gastank', pos: [50.7, 53.4] },
  { type: 'boveda', rect: [15, 43, 35, 53.5], y: 0, rise: 2.3, chimney: [26, 51.2] },
  { type: 'boveda', rect: [15, 53.5, 29, 64], y: 0, rise: 2.2 },
  { type: 'boveda', rect: [29, 53.5, 35, 60], y: 0, rise: 1.5 },
  { type: 'table', pos: [21, 47.6] },
  { type: 'stove', pos: [26, 52.55], rot: Math.PI },
  { type: 'shelfWall', pos: [16.45, 49.5], rot: Math.PI / 2, len: 3 },
  { type: 'cabinet', pos: [32.6, 51.7] },
  { type: 'rug', pos: [22, 48] },
  { type: 'rocker', pos: [30, 46.2], rot: -0.6 },
  { type: 'sacks', pos: [32.6, 45.2], rot: Math.PI / 2 },
  { type: 'potrack', pos: [26, 52.9], rot: Math.PI },
  { type: 'picture', pos: [30.5, 44.05] },
  { type: 'bed', pos: [19.2, 55.2], rot: Math.PI / 2 },
  { type: 'bed', pos: [26.4, 55.2], rot: Math.PI / 2 },
  { type: 'wardrobe', pos: [31, 54.45] },
  { type: 'chest', pos: [23.4, 61.6] },
  { type: 'rug', pos: [22.2, 57], rot: 0.2 },
  { type: 'picture', pos: [19.5, 54.05] },
  { type: 'cross', pos: [16.05, 58.5], rot: Math.PI / 2 },
  { type: 'chair', pos: [29.6, 57.4], rot: 2.2 },
  { type: 'firewood', pos: [12.8, 53.4] },
  { type: 'sacks', pos: [8.8, 53.6] },
  { type: 'shelfWall', pos: [7.45, 46], rot: Math.PI / 2, len: 2 },
  { type: 'candles', pos: [13.3, 45.3] },
  { type: 'yerbahang', pos: [10.5, 45.2] },
  // el fondo de la atahona: la despensa
  { type: 'barrel', pos: [13.5, 58.4] },
  { type: 'barrel', pos: [14.35, 58.3] },
  { type: 'crates', pos: [9.6, 55.6], rot: Math.PI / 2 },
  { type: 'shelfWall', pos: [9.4, 57.6], rot: Math.PI / 2, len: 1.6 },
];


// ---------------- actividades ----------------
const JARS = [
  { cell: [21, 43], face: [0, 1], zone: 'B' },
  { cell: [37, 43], face: [0, 1], zone: 'G' },
  // colgado del poste del medio del barbacuá, mirando al catre
  { pos: [33, 3.05], face: [0, 1], y: 2.8, zone: 'Y' },
  { cell: [6, 51], face: [1, 0], zone: 'M' },
];
const TRAPS = [
  { id: 'boyero', name: 'el Boyero Eléctrico', kind: 'shock', power: true, rect: [75.1, 46.1, 80.9, 49.4], posts: [[75.4, 46.4], [80.6, 46.4]], lever: { cell: [69, 39], face: [0, 1] } },
  { id: 'quema', name: 'la Quema de Rastrojo', kind: 'fire', power: false, rect: [3.1, 28.1, 6.9, 37.9], lever: { cell: [8, 43], face: [0, -1] } },
];
const RADIO_POS = [{ pos: [21.45, 0.815, 47.35], rot: 0.2 }, { pos: [50.4, 0.9, 58.4], rot: -0.4 }, { pos: [67.45, 4.62, 37.75], rot: Math.PI }];
const PARTS = [
  { id: 'paja', name: 'Atado de paja', pos: [68.6, 3.63, 38.45], zone: 'H' },
  { id: 'arpillera', name: 'Arpillera de bolsa', pos: [46, 0.03, 16], zone: 'F' },
  { id: 'alambre', name: 'Rollo de alambre', pos: [26, 0.03, 61.5], zone: 'N' },
];
const BENCH = { pos: [45.5, 24.8], rot: 0 };

// ---------------- bichos de ambiente ----------------
export const CRITTERS = { flocks: [{ perch: [[25, 22.5], [27, 22.52], [30.5, 22.48], [33.8, 22.5]], yaw: Math.PI, y: 1.22 }, { perch: [[23.5, 26], [23.52, 28.4]], yaw: Math.PI / 2, y: 1.22 }, { perch: [[59, 65.5], [66.5, 65.52], [70.5, 65.48]], yaw: Math.PI, y: 1.22 }, { perch: [[81.5, 48], [81.5, 54], [81.52, 59]], yaw: -Math.PI / 2, y: 1.22 }], rats: [[[35.4, 45], [35.4, 58.6]], [[36.2, 44.4], [50.6, 44.4]], [[16.4, 45], [16.4, 47.5]]] };

export const FIRES = [{ pos: [31, 0.35, 33], spread: 0.6, sound: [31, 1, 33] }];
export const TITLE_CAM = { at: [38.5, 1.75, 38.5], amp: [2.2, 1], look: [26, 2.6, 26], lookAmp: 4 };

const LINES = [
  [
    'Radio Misiones, servicio rural. Se pide a los chacareros de la zona de los Cuervos que no salgan después de la oración.',
    'Desde que se secó el yerbal, dicen que algo camina entre el maíz. Algo que no hace ruido.',
  ],
  [
    'La familia de la tapera no bajó al pueblo para la cosecha. La última vez que los vieron estaban cebando mate... mirando para arriba.',
    'El cura dijo que no era nada. El cura tampoco volvió.',
  ],
  [
    'Última transmisión. Si escucha una voz que viene del cielo, no le conteste... salvo que le pida yerba.',
    'Y ahora, un chamamé para los que siguen de pie.',
  ],
];
const RADIOS = RADIO_POS.map((r, i) => ({ ...r, lines: LINES[i] }));
export const ACT = {
  jars: JARS,
  traps: TRAPS,
  radios: RADIOS,
  parts: PARTS,
  bench: BENCH,
  shield: { name: 'Escudo de paja', hp: 800, where: 'la mesa de trabajo del patio', plan: 'ESCUDO: paja + arpillera + alambre' },
  radioAch: ['Oyente de Radio Misiones', 'Escuchaste las tres transmisiones de la chacra'],
};

// ---------------- lo demás del mapa ----------------
export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: 'horse', boss: 'crow', egg: 'hoz', farm: true, deathMachine: true, levels: true };
export const TEXT = {
  soul: (many) => `La tapera se quedó con ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Vencieron' : 'Venciste'} al Espantapájaros en la ronda ${r}. La Entidad tiene su yerba... y el camino sigue.`,
  egg: 'La Hoz de la Muerte',
  loading: 'Sembrando el maizal…',
};
// Cielo: arranca al atardecer y se hace de noche con el easter egg.
// (la ronda de los caballos: noche de luna roja, sin tormenta; FarmEgg.update
// baja la luz del día mientras dura, pedido del usuario 2026-09-27)
export const SKY = { daylight: 1, sun: [-0.86, 0.1, -0.5], states: { dogs: { storm: 0, blood: 1, fog: 0.06, fogColor: 0x2e0d0b, cloud: 0.3, mist: 0.6 } } };
