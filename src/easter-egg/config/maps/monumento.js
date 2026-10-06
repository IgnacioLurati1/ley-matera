// "Monumento al Mate" (mapa bonus): el Monumento Nacional a la Bandera de
// Rosario, de noche y con niebla baja, a orillas del Paraná. Grilla de 1 m,
// x hacia el este (el río) y z hacia el sur (calle Santa Fe; al norte, calle
// Córdoba). Es el monumento de verdad a escala 1:2 en planta (las alturas que
// se caminan van a escala real: un escalón es un escalón):
//  · el Pasaje Juramento (oeste, nivel de la ciudad), con el espejo de agua y
//    las estatuas de Lola Mora, entre la Catedral y el Palacio de los Leones;
//  · el Propileo (doce columnas planas al frente y atrás, la Llama Votiva en
//    el medio, que es el Pack-a-Pava) y, abajo, la Sala de Honor de las
//    Banderas de América;
//  · el Patio Cívico: la escalinata del Propileo y las 24 gradas largas que
//    bajan hasta la Torre;
//  · la Torre (el mástil de la nave), con la Cripta de Belgrano en el
//    basamento y el Mirador arriba (se sube en ascensor);
//  · la Proa con la Patria Abanderada, la explanada y la avenida Belgrano;
//  · el Parque Nacional a la Bandera, la barranca y la Costanera con el
//    muelle sobre el río.
// La arquitectura la arma world/Monumento.js; Levels.js pone las alturas,
// los choques y por dónde se pasa.

// (hasta 160: del 128 al 158, sobre el río y muy arriba, va el patio de la 2043)
export const MAP_W = 160;
export const MAP_H = 60;
export const WALL_H = 3.6;

// Los niveles (m): el Pasaje a 3,6; el Propileo a 4,2; el Patio baja de 2,2 a
// 0; la Cripta, la explanada de la Proa y el Parque a -2,6; la Costanera a
// -4,4 y el río a -5,2. El Mirador, a 44.
export const LEVEL = { pasaje: 3.6, propileo: 4.2, patioTop: 2.2, patio: 0, atrio: 0.8, cripta: -2.6, explanada: -2.6, parque: -2.6, costanera: -4.4, rio: -5.2, mirador: 44 };
// El Paraná se nada (entities/swim.js, como el estero): uno se tira desde la
// punta del muelle y vuelve a subir por la escalerilla (o trepando el borde).
export const WATER_Y = LEVEL.rio;

export const ZONES = {
  A: {
    name: 'El Patio Cívico',
    sub: 'Monumento Nacional a la Bandera · Rosario',
    // la escalinata del Propileo, el descanso, las 24 gradas, el fondo, los
    // cinco escalones del atrio de la Torre y el atrio
    rects: [[34, 19, 37, 41], [38, 17, 39, 43, 2.2], [40, 17, 59, 43], [60, 17, 61, 43], [62, 21, 63, 39], [64, 21, 65, 39, 0.8]],
    floor: 'concrete',
    outdoor: true,
    edge: 'rail',
    rail: 'parapeto',
  },
  B: { name: 'El Propileo', sub: 'La Llama Votiva al Soldado Desconocido', y: 4.2, rects: [[21, 21, 33, 39]], floor: 'concrete', outdoor: true, edge: 'rail', rail: 'propileo' },
  C: {
    name: 'La Proa',
    sub: 'La Patria a su Bandera',
    y: -2.6,
    // las dos escaleras de costado del basamento, los descansos, la
    // explanada alrededor de la Proa y la avenida Belgrano
    rects: [
      [63, 17, 72, 19],
      [63, 41, 72, 43],
      [73, 10, 81, 19],
      [73, 41, 81, 50],
      [82, 10, 96, 22],
      [82, 38, 96, 50],
      [91, 23, 96, 37],
      [85, 23, 86, 23],
      [85, 37, 86, 37],
      [87, 23, 88, 25],
      [87, 35, 88, 37],
      [89, 23, 90, 27],
      [89, 33, 90, 37],
    ],
    floor: 'concrete',
    outdoor: true,
    edge: 'rail',
    rail: 'proa',
  },
  D: {
    name: 'La Cripta de Belgrano',
    sub: 'Aquí se izó por primera vez la Bandera',
    y: -2.6,
    roof: 1.0,
    // las dos escaleras que bajan del atrio, la nave, las alas que dan la
    // vuelta al pie de la Torre hasta la Proa y la cabina del ascensor (atrás
    // de su puerta, en la pared del este de la nave: se entra caminando)
    rects: [[67, 21, 71, 23], [67, 37, 71, 39], [67, 24, 71, 36], [72, 21, 80, 25], [72, 35, 80, 39], [72, 29, 72, 31]],
    floor: 'calcareo',
    wall: 'cryptStone',
    ext: 'travertino',
    ceil: 'cryptStone',
    under: true,
    noBeams: true,
  },
  E: {
    name: 'El Pasaje Juramento',
    sub: 'Las estatuas de Lola Mora miran el agua',
    y: 3.6,
    // la vereda del medio y el espejo de agua del sur (se camina mojado)
    rects: [[1, 27, 19, 32], [5, 33, 19, 39, 3.35]],
    floor: 'concrete',
    outdoor: true,
    edge: 'rail',
    rail: 'pasaje',
  },
  F: {
    name: 'La Sala de las Banderas',
    sub: 'Las banderas de toda América',
    roof: 3.0,
    // la sala (debajo del espejo norte) y la escalera del pilono del Propileo
    rects: [[5, 15, 19, 21], [20, 17, 30, 19], [31, 17, 32, 19, 4.2, 7.4]],
    floor: 'calcareo',
    wall: 'salaMarble',
    ext: 'travertino',
    ceil: 'salaCeil',
    under: true,
    noBeams: true,
  },
  G: { name: 'El Parque de la Bandera', sub: 'Tipas, palos borrachos y el río', y: -2.6, rects: [[98, 6, 103, 54]], floor: 'grass', outdoor: true, edge: 'rail', rail: 'parque' },
  H: {
    name: 'La Costanera',
    sub: 'El Paraná, negro y ancho',
    y: -4.4,
    // la costanera, las dos escaleras de la barranca y el muelle (entero,
    // hasta el farol de la punta: antes a la mitad había una pared invisible)
    rects: [[108, 4, 112, 56], [105, 18, 107, 20], [105, 40, 107, 42], [113, 28, 124, 32]],
    floor: 'concrete',
    outdoor: true,
    edge: 'rail',
    rail: 'costanera',
  },
  I: { name: 'El Mirador', sub: 'Setenta metros arriba de Rosario', y: 44, rects: [[75, 27, 78, 34]], floor: 'concrete', outdoor: true, edge: 'rail', rail: 'mirador' },
  // el easter egg secundario: el patio de la 2043 del Colegio San José, de día
  // (lejos de todo, a 150 m sobre el río; lo arma world/monumentoPatio.js y se
  // llega por el portal de la Sala de las Banderas: entities/monumento/Patio2043.js)
  P: { name: 'El patio de la 2043', sub: 'Colegio San José · Rosario', y: 150, rects: [[128, 16, 157, 41]], floor: 'concrete', outdoor: true },
};

export const RAMPS = [
  // la escalinata del Propileo (de 4,2 a 2,2) y las 24 gradas del Patio Cívico
  { rect: [34, 19, 37, 41], dir: '+x', y0: 4.2, y1: 2.2, steps: true, own: 'escalinata' },
  { rect: [40, 17, 59, 43], dir: '+x', y0: 2.2, y1: 0, steps: true, own: 'gradas' },
  // los cinco escalones del atrio de la Torre
  { rect: [62, 21, 63, 39], dir: '+x', y0: 0, y1: 0.8, steps: true, own: 'atrio' },
  // las escaleras de costado que bajan a la Proa
  { rect: [63, 17, 72, 19], dir: '+x', y0: 0, y1: -2.6, steps: true, own: 'costado' },
  { rect: [63, 41, 72, 43], dir: '+x', y0: 0, y1: -2.6, steps: true, own: 'costado' },
  // las escaleras de la Cripta (bajan del atrio); el techo en pendiente va 3,6
  // arriba de los escalones, así al pie queda a ras del techo de la Cripta (1,0)
  // y no baja como una losa negra cruzada delante de la nave
  { rect: [67, 21, 71, 23], dir: '+x', y0: 0.8, y1: -2.6, steps: true, ceil: 'slope', head: 3.6, own: 'cripta' },
  { rect: [67, 37, 71, 39], dir: '+x', y0: 0.8, y1: -2.6, steps: true, ceil: 'slope', head: 3.6, own: 'cripta' },
  // los tres escalones del Pasaje al Propileo
  { rect: [18, 27, 19, 32], dir: '+x', y0: 3.6, y1: 4.2, steps: true, own: 'pasaje' },
  // la escalera del pilono norte del Propileo, que baja a la Sala de las Banderas
  { rect: [20, 17, 30, 19], dir: '-x', y0: 4.2, y1: 0, steps: true, ceil: 'slope', head: 3.2, own: 'sala' },
  // las escaleras de la barranca
  { rect: [105, 18, 107, 20], dir: '+x', y0: -2.6, y1: -4.4, steps: true, own: 'barranca' },
  { rect: [105, 40, 107, 42], dir: '+x', y0: -2.6, y1: -4.4, steps: true, own: 'barranca' },
];

// (el río lo pone world/Monumento.js en el terreno de afuera: w.terrain)
export const RIVER = [];

export const START_ZONE = 'A';
export const PLAYER_START = { x: 50.5, z: 30.5, yaw: -Math.PI / 2 };

// kind: 'valla' (las vallas amarillas de los actos: se sacan de un empujón),
// 'door' (los portones de bronce), 'reja'.
export const DOORS = [
  // del Patio: arriba al Propileo, abajo a la Proa (por los dos costados) y a la Cripta
  // (sin las puntas z 21 y 39: ahí la primera columna queda a 55 cm del pilono
  // y la celda era de la valla, que la grilla de los muertos no mira: se
  // trababan queriendo pasar por ese hueco)
  { id: 1, zones: ['A', 'B'], cells: [[33, 22], [33, 23], [33, 24], [33, 25], [33, 26], [33, 27], [33, 28], [33, 29], [33, 30], [33, 31], [33, 32], [33, 33], [33, 34], [33, 35], [33, 36], [33, 37], [33, 38]], cost: 1000, kind: 'valla' },
  { id: 2, zones: ['A', 'C'], cells: [[62, 17], [62, 18], [62, 19]], cost: 750, kind: 'valla' },
  { id: 3, zones: ['A', 'C'], cells: [[62, 41], [62, 42], [62, 43]], cost: 750, kind: 'valla' },
  { id: 4, zones: ['A', 'D'], cells: [[66, 21], [66, 22], [66, 23]], cost: 1000, kind: 'door' },
  { id: 5, zones: ['A', 'D'], cells: [[66, 37], [66, 38], [66, 39]], cost: 1000, kind: 'door' },
  // de la Cripta a la Proa
  { id: 6, zones: ['D', 'C'], cells: [[81, 21], [81, 22]], cost: 750, kind: 'reja' },
  { id: 7, zones: ['D', 'C'], cells: [[81, 38], [81, 39]], cost: 750, kind: 'reja' },
  // del Propileo: al Pasaje y a la Sala de las Banderas
  { id: 8, zones: ['B', 'E'], cells: [[20, 27], [20, 28], [20, 29], [20, 30], [20, 31], [20, 32]], cost: 1000, kind: 'valla' },
  { id: 9, zones: ['B', 'F'], cells: [[31, 20], [32, 20]], cost: 1250, kind: 'door' },
  // de la avenida al Parque y del Parque a la Costanera
  { id: 10, zones: ['C', 'G'], cells: [[97, 13], [97, 14], [97, 15]], cost: 1000, kind: 'valla' },
  { id: 11, zones: ['C', 'G'], cells: [[97, 45], [97, 46], [97, 47]], cost: 1000, kind: 'valla' },
  { id: 12, zones: ['G', 'H'], cells: [[104, 18], [104, 19], [104, 20]], cost: 1250, kind: 'valla' },
  { id: 13, zones: ['G', 'H'], cells: [[104, 40], [104, 41], [104, 42]], cost: 1250, kind: 'valla' },
];

// Por dónde entran: se trepan la baranda del Patio desde las calles Córdoba
// y Santa Fe, salen de la Catedral y de la plaza, de las rejillas de la Sala,
// de las bajadas de la avenida y del río.
export const WINDOWS = [
  // (las del Patio, entre los mástiles de la baranda, que van cada 1,75 m
  // desde 41,5: en 44, 52 y 58 las tablas se cruzaban con los mástiles; la
  // baranda tiene el hueco ahí, world/Monumento.js)
  { cell: [42, 16], out: [0, -1], zone: 'A' },
  { cell: [49, 16], out: [0, -1], zone: 'A' },
  { cell: [56, 16], out: [0, -1], zone: 'A' },
  { cell: [42, 44], out: [0, 1], zone: 'A' },
  { cell: [49, 44], out: [0, 1], zone: 'A' },
  { cell: [56, 44], out: [0, 1], zone: 'A' },
  { cell: [0, 28], out: [-1, 0], zone: 'E' },
  { cell: [0, 31], out: [-1, 0], zone: 'E' },
  { cell: [12, 40], out: [0, 1], zone: 'E' },
  { cell: [4, 18], out: [-1, 0], zone: 'F' },
  { cell: [12, 14], out: [0, -1], zone: 'F' },
  { cell: [78, 9], out: [0, -1], zone: 'C' },
  { cell: [88, 9], out: [0, -1], zone: 'C' },
  { cell: [78, 51], out: [0, 1], zone: 'C' },
  { cell: [88, 51], out: [0, 1], zone: 'C' },
  { cell: [100, 5], out: [0, -1], zone: 'G' },
  { cell: [100, 55], out: [0, 1], zone: 'G' },
  { cell: [113, 10], out: [1, 0], zone: 'H' },
  { cell: [113, 22], out: [1, 0], zone: 'H' },
  { cell: [113, 38], out: [1, 0], zone: 'H' },
  { cell: [113, 50], out: [1, 0], zone: 'H' },
  // el Mirador: los muertos trepan por la Torre y entran por las ventanas
  // (entre los parantes; la del este del medio es la de la tirolesa). Ojo:
  // la grilla es una sola para todas las alturas: nada en z 35-39 ni z 21-25
  // (abajo están las alas de la Cripta)
  { cell: [75, 26], out: [0, -1], zone: 'I' },
  { cell: [78, 26], out: [0, -1], zone: 'I' },
  { cell: [79, 34], out: [1, 0], zone: 'I' },
  { cell: [74, 34], out: [-1, 0], zone: 'I' },
];

export const RISERS = [
  { zone: 'A', pos: [48.5, 24.5] },
  { zone: 'A', pos: [48.5, 36.5] },
  { zone: 'A', pos: [56.5, 21.5] },
  { zone: 'A', pos: [56.5, 39.5] },
  { zone: 'A', pos: [43.5, 30.5] },
  { zone: 'B', pos: [25.5, 24.5] },
  { zone: 'B', pos: [29.5, 36.5] },
  { zone: 'C', pos: [78.5, 14.5] },
  { zone: 'C', pos: [78.5, 46.5] },
  { zone: 'C', pos: [93.5, 30.5] },
  { zone: 'C', pos: [86.5, 16.5] },
  { zone: 'C', pos: [86.5, 44.5] },
  { zone: 'D', pos: [69.5, 27.5] },
  { zone: 'D', pos: [69.5, 33.5] },
  { zone: 'D', pos: [76.5, 23.5] },
  { zone: 'D', pos: [76.5, 37.5] },
  { zone: 'E', pos: [6.5, 30.5] },
  { zone: 'E', pos: [14.5, 29.5] },
  { zone: 'E', pos: [12.5, 36.5] },
  { zone: 'F', pos: [8.5, 18.5] },
  { zone: 'F', pos: [16.5, 19.5] },
  { zone: 'G', pos: [100.5, 10.5] },
  { zone: 'G', pos: [100.5, 30.5] },
  { zone: 'G', pos: [101.5, 48.5] },
  { zone: 'G', pos: [99.5, 22.5] },
  { zone: 'H', pos: [110.5, 8.5] },
  { zone: 'H', pos: [110.5, 30.5] },
  { zone: 'H', pos: [110.5, 52.5] },
  { zone: 'H', pos: [114.5, 30.5] },
];

export const WALL_BUYS = [
  // (en el basamento de la Torre, a los costados del nicho, mirando al Patio)
  { weapon: 'madera', cell: [66, 26], face: [-1, 0] },
  { weapon: 'plastico', cell: [66, 35], face: [-1, 0] },
  // (corrido: si no, el pizarrón se metía detrás de la primera columna del Propileo)
  { weapon: 'vidrio', cell: [29, 20], face: [0, 1], slide: -0.45 },
  { weapon: 'lata', cell: [9, 14], face: [0, 1] },
  { weapon: 'algarrobo', cell: [66, 34], face: [1, 0] },
  { weapon: 'bowie', cell: [70, 20], face: [0, -1] },
];

// Todas las máquinas del juego (el mapa bonus las tiene a todas).
export const PERK_SPOTS = [
  // (al pie de las gradas, en el fondo plano contra la baranda: en las gradas
  // la máquina pisaba dos escalones y quedaba torcida)
  { perk: 'revive', cell: [60, 16], face: [0, 1] },
  { perk: 'stamin', cell: [60, 44], face: [0, -1] },
  { perk: 'doubletap', cell: [23, 20], face: [0, 1] },
  { perk: 'deadshot', cell: [23, 40], face: [0, -1] },
  { perk: 'speed', cell: [14, 26], face: [0, 1] },
  { perk: 'mule', cell: [16, 14], face: [0, 1] },
  { perk: 'phd', cell: [4, 20], face: [1, 0] },
  { perk: 'jugg', cell: [66, 26], face: [1, 0] },
  { perk: 'cherry', cell: [76, 20], face: [0, 1] },
  { perk: 'wish', cell: [76, 40], face: [0, -1] },
  // (contra el murete de la explanada, de espaldas a la calle Córdoba: contra el
  // basamento de la Torre el zócalo de piedra se le metía en la espalda)
  { perk: 'dragon', cell: [72, 13], face: [1, 0] },
  { perk: 'maiz', cell: [97, 22], face: [1, 0] },
  { perk: 'aqua', cell: [113, 44], face: [-1, 0] },
];

// el tablero de la luz, en la nave de la Cripta (al lado del ascensor)
export const POWER = { cell: [72, 33], face: [-1, 0] };
// el Pack-a-Pava es la Llama Votiva, en el medio del Propileo (la arma world/papLlama.js)
export const PAP = { cell: [27, 20], face: [0, 1], width: 2, free: [27, 30] };

export const BOX_SPOTS = [
  // (en el Patio, en el descanso entre la escalinata y las gradas: plano y
  // contra la baranda; en las gradas quedaba torcida y encima del pebetero)
  { cell: [38, 16], face: [0, 1], zone: 'A' },
  { cell: [38, 44], face: [0, -1], zone: 'A' },
  { cell: [26, 20], face: [0, 1], zone: 'B' },
  { cell: [77, 40], face: [0, 1], zone: 'C' },
  { cell: [97, 30], face: [1, 0], zone: 'G' },
  { cell: [113, 16], face: [-1, 0], zone: 'H' },
  { cell: [12, 22], face: [0, -1], zone: 'F' },
  { cell: [10, 26], face: [0, 1], zone: 'E' },
];
export const BOX_START = [0, 1];

// Las luces que alumbran de verdad (las demás son de dibujo: los focos de la
// Torre y del Propileo pintan la piedra, world/Monumento.js). Sin luz: los
// faroles de la ciudad sí, el monumento apagado.
// Cada luz va donde está su farol (el halo de fx/Ambience se dibuja en `pos`:
// antes muchas quedaban metros al costado de su farol, brillando en el aire).
export const LIGHTS = [
  // los faroles de las barandas del Patio (la cruz de cuatro globos arriba del mástil)
  { zone: 'A', pos: [45, 7.1, 16.69], color: 0xffd9a0, intensity: 22, noPower: 0.25, kind: 'lamp' },
  { zone: 'A', pos: [55.5, 5.95, 16.69], color: 0xffd9a0, intensity: 22, noPower: 0.25, kind: 'lamp' },
  { zone: 'A', pos: [45, 7.1, 44.31], color: 0xffd9a0, intensity: 22, noPower: 0.25, kind: 'lamp' },
  { zone: 'A', pos: [55.5, 5.95, 44.31], color: 0xffd9a0, intensity: 22, noPower: 0.25, kind: 'lamp' },
  // el reflector del piso del atrio que alumbra a la Madre Patria en su nicho (con la luz)
  { zone: 'A', pos: [64.35, 1.12, 30.5], color: 0xffe6c0, intensity: 16, noPower: 0, kind: 'lamp' },
  // la Llama Votiva (siempre prendida) y las farolas de bronce del Propileo
  { zone: 'B', pos: [27.5, 6.4, 30.5], color: 0xff8a3a, intensity: 30, noPower: 1, kind: 'fire' },
  { zone: 'B', pos: [22.33, 6.5, 23.345], color: 0xffc888, intensity: 10, noPower: 0.2, kind: 'lamp' },
  { zone: 'B', pos: [22.33, 6.5, 37.655], color: 0xffc888, intensity: 10, noPower: 0.2, kind: 'lamp' },
  // la Cripta: la lámpara votiva de Belgrano (en su pie de bronce) y los faroles colgados de las alas
  { zone: 'D', pos: [68.75, -0.95, 30.5], color: 0xffb070, intensity: 14, noPower: 1, kind: 'candle' },
  { zone: 'D', pos: [76, -0.25, 23], color: 0xffd0a0, intensity: 10, noPower: 0.3, kind: 'lamp' },
  { zone: 'D', pos: [76, -0.25, 37], color: 0xffd0a0, intensity: 10, noPower: 0.3, kind: 'lamp' },
  // el Pasaje: los faroles de la ciudad (en los bordes de la vereda: antes uno
  // estaba parado en el agua del estanque y el otro, medio afuera del espejo)
  { zone: 'E', pos: [6, 7.8, 32.75], color: 0xffd6a0, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'E', pos: [16.6, 7.8, 27.3], color: 0xffd6a0, intensity: 18, noPower: 1, kind: 'lamp' },
  // la Sala de las Banderas (las dos arañas del techo)
  { zone: 'F', pos: [9, 2.45, 18], color: 0xfff0d0, intensity: 12, noPower: 0.3, kind: 'lamp' },
  { zone: 'F', pos: [16, 2.45, 18], color: 0xfff0d0, intensity: 12, noPower: 0.3, kind: 'lamp' },
  // las columnas de alumbrado de la avenida (la luminaria en la punta del pescante) y las farolas del parque
  { zone: 'C', pos: [85.55, 4.62, 14], color: 0xffcf8a, intensity: 22, noPower: 1, kind: 'lamp' },
  { zone: 'C', pos: [85.55, 4.62, 46], color: 0xffcf8a, intensity: 22, noPower: 1, kind: 'lamp' },
  { zone: 'C', pos: [92.45, 4.62, 30], color: 0xffcf8a, intensity: 22, noPower: 1, kind: 'lamp' },
  { zone: 'G', pos: [99.55, 1.85, 16], color: 0xffcf8a, intensity: 16, noPower: 1, kind: 'lamp' },
  { zone: 'G', pos: [99.55, 1.85, 44], color: 0xffcf8a, intensity: 16, noPower: 1, kind: 'lamp' },
  // la costanera (los faroles de la baranda y el de la punta del muelle)
  { zone: 'H', pos: [112.6, 0.6, 14], color: 0xffe0b0, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'H', pos: [112.6, 0.6, 46], color: 0xffe0b0, intensity: 18, noPower: 1, kind: 'lamp' },
  { zone: 'H', pos: [124.2, -1.9, 30.5], color: 0xffe0b0, intensity: 12, noPower: 1, kind: 'lamp' },
];

// (la Llama Votiva suena cuando se prende: world/papLlama.js)
export const FIRES = [];

// la cámara del título: desde arriba de la escalinata del Propileo, el Patio
// Cívico con las farolas y las banderas, la Torre iluminada (los reflectores
// van prendidos en el título, world/Monumento.js) y la luna al costado. La
// Torre corrida a la derecha, que el menú no la tape. (Antes, desde el
// Parque: los árboles tapaban todo, y la postal salía con un árbol negro.)
export const TITLE_CAM = { at: [35.5, 8.5, 30.5], amp: [1.0, 2.2], look: [76, 21, 22], lookAmp: 2 };

// El easter egg "La Primera Bandera" (entities/MonumentoEgg.js): dónde está cada cosa.
export const EE = {
  // el mástil de la barranca donde se iza (x, z)
  mastil: [101.5, 30.5],
  // la costurera (María Catalina Echevarría), al lado de la estatua de Belgrano y la Bandera
  costurera: [9.5, 29.2],
  // la tela celeste (en la baranda del Mirador) y la blanca (en la niebla del muelle)
  celeste: [78.2, 31.6],
  blanca: [114.6, 31.6],
  // la Batería Libertad (el cañón que se maneja) y la Batería Independencia, en la isla
  bateria: [102.3, 8.5],
  independencia: [160, 24],
  // el ascensor (abajo, en la Cripta; arriba, en el Mirador) y la tirolesa
  ascensor: { abajo: [72.5, 30.5], arriba: [75.5, 30.5] },
  // (la tirolesa sale por la ventana del este del medio: z 28,85 a 30,65)
  tirolesa: { desde: [78.6, 29.75], hasta: [101.2, 13.5] },
  // la Llama Votiva y los cuatro pebeteros: al pie de la escalinata, en el
  // descanso (en la escalinata el pie quedaba entre dos escalones, mitad en el
  // aire) y al final de las gradas, en el medio de un escalón
  llama: [27.5, 30.5],
  pebeteros: [[38.6, 19.6], [38.6, 41.4], [58.75, 17.6], [58.75, 43.4]],
  // la caña de pescar del muelle
  cana: [114.4, 28.6],
  // los cuadernos Rivadavia de los primeros probadores (el patio de la 2043)
  cuadernos: [[8.2, 21.4], [70.4, 36.6], [77.8, 28.4], [102.6, 52.6], [24.4, 38.6], [93.6, 11.2]],
};

// La utilería de config (la grande la arma world/Monumento.js).
export const PROPS = [];

// Las piezas del escudo y los frascos (las ánimas de los caídos)
const PARTS = [
  { id: 'chapa', name: 'Chapa de bronce', pos: [32.2, 4.6, 23.6], zone: 'B' },
  { id: 'cuero', name: 'Cuero de granadero', pos: [69.5, -2.2, 35.6], zone: 'D' },
  { id: 'tabla', name: 'Tabla de quebracho', pos: [99.4, -2.2, 41.8], zone: 'G' },
];
const BENCH = { pos: [61.2, 30.5], rot: Math.PI / 2 };
const JARS = [
  // (en la Sala, entre la caja y las vitrinas: en 16 quedaba metido en la vitrina del Uruguay)
  { cell: [14, 22], face: [0, -1], zone: 'F' },
  { cell: [81, 23], face: [-1, 0], zone: 'D' },
  { cell: [70, 40], face: [0, 1], zone: 'C' },
];
const TRAPS = [
  // la Llamarada Votiva: la llama del Propileo larga un anillo de fuego
  // (la palanca en la cara del pilono sur que da a la nave, de frente a la Llama
  // y entre las urnas; en [21, 20] quedaba escondida detrás de la primera columna)
  { id: 'llamarada', name: 'la Llamarada Votiva', kind: 'fire', power: false, own: true, lever: { cell: [27, 40], face: [0, -1] }, rect: [24.6, 27.6, 30.4, 33.4], posts: [] },
  // el espejo electrificado del Pasaje Juramento
  { id: 'espejo', name: 'el Espejo Electrificado', kind: 'shock', power: true, lever: { cell: [4, 32], face: [1, 0] }, rect: [5, 33, 20, 40], posts: [[5.3, 33.3], [19.7, 33.3]] },
];
export const ACT = {
  jars: JARS,
  traps: TRAPS,
  radios: [],
  parts: PARTS,
  bench: BENCH,
  shield: {
    name: 'Escudo del Ejército del Norte',
    hp: 1000,
    where: 'el banco del Patio Cívico',
    plan: 'ESCUDO: chapa + cuero + tabla',
    up: { name: 'Escudo Bendecido', hp: 1600, prop: 'rebote', kind: 'gorriti', pos: [14.5, 33.9], rot: Math.PI, r: 8, need: 8 },
  },
};
export const CRITTERS = { flocks: [], rats: [] };

export const FEATURES = { attic: false, highWindows: false, decor: false, curandero: false, secrets: false, special: 'paloma', boss: 'surubi', bossFrom: 6, egg: 'bandera', monumento: true, levels: true };

export const TEXT = {
  soul: (many) => `El Paraná se llevó ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Izaron' : 'Izaste'} la primera bandera en la ronda ${r}.`,
  egg: 'La Primera Bandera',
  loading: 'Bajando al Monumento…',
};

// Noche de Rosario con niebla baja: la luna sobre el río (al este), las
// luces de la ciudad en el horizonte del oeste.
export const SKY = {
  daylight: 0,
  center: [62, 30],
  moon: { dir: [0.78, 0.36, -0.22], size: 24, light: 1.0, glow: 1.1 },
  colors: { horizon: [0.05, 0.05, 0.075], zenith: [0.005, 0.008, 0.02], glow: [0.06, 0.035, 0.02] },
  weathers: [['clear', 3], ['fog', 3]],
  states: {
    clear: { fog: 0.02, fogColor: 0x10161f, cloud: 0.12 },
    fog: { fog: 0.034, fogColor: 0x1e2630, mist: 1, cloud: 0.35 },
  },
};

// Los hornos de barro de las empanadas (entities/Empanadas): pared y hacia dónde mira.
export const HORNO_SPOTS = [
  // (en la punta norte del Parque, del otro lado de la ventana de los muertos:
  // en 103 quedaba detrás del cañón de la Batería Libertad)
  { cell: [98, 5], face: [0, 1], slide: 0.3 },
  { cell: [73, 34], face: [0, 1] },
];
