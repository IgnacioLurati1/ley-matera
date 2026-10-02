// "El Molino": un molino yerbatero abandonado en Misiones (el primer mapa).
// Grilla de 1 m. x crece hacia el este, z hacia el sur. Cada zona es un
// rectángulo (x0, z0, x1, z1 inclusivos) y las paredes quedan entre zonas.
//
//   z 4-16   [ G Acopio (Pack-a-Pava) ][ F Sala de máquinas (luz)      ]
//   z 18-31  [ B Patio del secadero   ][ D Barbacuá ][ E Capilla       ]
//   z 33-45  [ A Galpón ][ C Almacén de ramos gen.  ][ H Oficina       ]
//   (al este de la capilla, el I Cementerio de los Peones)

export const MAP_W = 74;
export const MAP_H = 50;
export const WALL_H = 3.6;

export const ZONES = {
  A: { name: 'Galpón', sub: 'Molino yerbatero Santa Ana · Misiones, 1911', rect: [4, 33, 19, 45], floor: 'planks', wall: 'plasterGreen', ceil: 'planksDark' },
  B: { name: 'Patio del Secadero', sub: 'Las ramas todavía humean', rect: [4, 18, 30, 31], floor: 'dirt', wall: 'brick', outdoor: true },
  C: { name: 'Almacén de Ramos Generales', sub: 'Se fía los martes. Hoy es domingo', rect: [21, 33, 40, 45], floor: 'calcareo', wall: 'plasterBlue', ceil: 'planksDark' },
  D: { name: 'Barbacuá', sub: 'Donde se seca la yerba... y otras cosas', rect: [32, 18, 45, 31], floor: 'dirtDark', wall: 'brickSoot', ceil: 'planksDark' },
  E: { name: 'Capilla', sub: 'Alguien se sigue meciendo', rect: [47, 18, 55, 31], floor: 'terracotta', wall: 'plasterWhite', ceil: 'planksDark' },
  F: { name: 'Sala de Máquinas', sub: 'El molino todavía quiere andar', rect: [32, 4, 55, 16], floor: 'concrete', wall: 'concreteWall', ceil: 'corrugated' },
  G: { name: 'Acopio', sub: 'Bolsas de treinta kilos y un camión que no arranca', rect: [4, 4, 30, 16], floor: 'concrete', wall: 'brick', ceil: 'corrugated' },
  H: { name: 'Oficina del Patrón', sub: 'Nadie cobró el último jornal', rect: [42, 33, 55, 45], floor: 'parquet', wall: 'plasterOffice', ceil: 'planksDark' },
  I: { name: 'Cementerio de los Peones', sub: 'El patrón los enterró sin nombre', rect: [57, 17, 70, 31], floor: 'dirt', wall: 'plasterWhite', outdoor: true },
};

export const START_ZONE = 'A';
export const PLAYER_START = { x: 12, z: 41, yaw: Math.PI };

// cells: celdas de pared que ocupa la puerta. kind: 'door' | 'debris'.
export const DOORS = [
  { id: 1, zones: ['A', 'B'], cells: [[11, 32], [12, 32]], cost: 750, kind: 'door' },
  { id: 2, zones: ['A', 'C'], cells: [[20, 38], [20, 39]], cost: 750, kind: 'door' },
  { id: 3, zones: ['B', 'D'], cells: [[31, 24], [31, 25]], cost: 1000, kind: 'door' },
  { id: 4, zones: ['C', 'H'], cells: [[41, 38], [41, 39]], cost: 1000, kind: 'door' },
  { id: 5, zones: ['C', 'D'], cells: [[35, 32], [36, 32]], cost: 1250, kind: 'debris' },
  { id: 6, zones: ['H', 'E'], cells: [[50, 32], [51, 32]], cost: 1000, kind: 'door' },
  { id: 7, zones: ['D', 'E'], cells: [[46, 24], [46, 25]], cost: 1250, kind: 'debris' },
  { id: 8, zones: ['B', 'G'], cells: [[16, 17], [17, 17]], cost: 1250, kind: 'door' },
  { id: 9, zones: ['D', 'F'], cells: [[38, 17], [39, 17]], cost: 1250, kind: 'debris' },
  { id: 10, zones: ['E', 'F'], cells: [[50, 17], [51, 17]], cost: 1000, kind: 'door' },
  { id: 11, zones: ['G', 'F'], cells: [[31, 9], [31, 10]], cost: 1500, kind: 'door' },
  { id: 12, zones: ['E', 'I'], cells: [[56, 27], [56, 28]], cost: 1250, kind: 'door' },
];

// Ventanas con tablas en paredes exteriores. out: hacia afuera del edificio.
export const WINDOWS = [
  { cell: [3, 40], out: [-1, 0], zone: 'A' },
  { cell: [9, 46], out: [0, 1], zone: 'A' },
  { cell: [3, 22], out: [-1, 0], zone: 'B' },
  { cell: [3, 28], out: [-1, 0], zone: 'B' },
  { cell: [26, 46], out: [0, 1], zone: 'C' },
  { cell: [35, 46], out: [0, 1], zone: 'C' },
  { cell: [47, 46], out: [0, 1], zone: 'H' },
  { cell: [56, 40], out: [1, 0], zone: 'H' },
  { cell: [38, 3], out: [0, -1], zone: 'F' },
  { cell: [48, 3], out: [0, -1], zone: 'F' },
  { cell: [10, 3], out: [0, -1], zone: 'G' },
  { cell: [23, 3], out: [0, -1], zone: 'G' },
  { cell: [3, 10], out: [-1, 0], zone: 'G' },
  { cell: [71, 21], out: [1, 0], zone: 'I' },
  { cell: [64, 16], out: [0, -1], zone: 'I' },
];

// Zombies que salen de la tierra (patio y barbacuá, que tienen piso de tierra).
export const RISERS = [
  { zone: 'B', pos: [8, 20] },
  { zone: 'B', pos: [21, 21] },
  { zone: 'B', pos: [27, 27] },
  { zone: 'B', pos: [9, 30] },
  { zone: 'B', pos: [19, 28] },
  { zone: 'B', pos: [25, 19] },
  { zone: 'D', pos: [34, 29] },
  { zone: 'D', pos: [44, 20] },
  { zone: 'D', pos: [34, 19] },
  // el cementerio: de cada tumba puede salir uno
  { zone: 'I', pos: [59.5, 20], grave: true },
  { zone: 'I', pos: [62.3, 20], grave: true },
  { zone: 'I', pos: [65.1, 20], grave: true },
  { zone: 'I', pos: [59.5, 23.8], grave: true },
  { zone: 'I', pos: [62.3, 23.8], grave: true },
  { zone: 'I', pos: [65.1, 23.8], grave: true },
  { zone: 'I', pos: [61, 30.1], grave: true },
  { zone: 'I', pos: [63.8, 30.1], grave: true },
  { zone: 'I', pos: [66.6, 30.1], grave: true },
];

// Dibujos de tiza: cell es la celda de pared, face la dirección hacia la zona.
export const WALL_BUYS = [
  { weapon: 'madera', cell: [7, 32], face: [0, 1] },
  { weapon: 'plastico', cell: [20, 43], face: [-1, 0] },
  { weapon: 'vidrio', cell: [31, 20], face: [-1, 0] },
  { weapon: 'lata', cell: [28, 32], face: [0, 1] },
  { weapon: 'algarrobo', cell: [45, 32], face: [0, 1] },
  { weapon: 'bowie', cell: [20, 35], face: [1, 0] },
];

export const PERK_SPOTS = [
  // (en el galpón, a la izquierda de la puerta al patio: lo pidió el usuario 2026-09-28)
  { perk: 'revive', cell: [9, 32], face: [0, 1] },
  { perk: 'jugg', cell: [31, 28], face: [1, 0] },
  { perk: 'speed', cell: [56, 35], face: [-1, 0] },
  { perk: 'doubletap', cell: [34, 3], face: [0, 1] },
  { perk: 'deadshot', cell: [45, 17], face: [0, -1] },
  { perk: 'mule', cell: [56, 25], face: [-1, 0] },
  // Stamin-Up (la Trotadora), en el almacén: pared este, entre el estante de
  // las botellas y la pizarra de precios (en la norte quedaba encima del cuero
  // del escudo)
  { perk: 'stamin', cell: [41, 35], face: [-1, 0] },
];

export const POWER = { cell: [43, 3], face: [0, 1] };
export const PAP = { cell: [16, 3], face: [0, 1], width: 2 };

// Lugares posibles de la caja misteriosa (2 celdas de ancho, contra la pared).
export const BOX_SPOTS = [
  { cell: [21, 32], face: [0, -1], zone: 'B' },
  { cell: [30, 46], face: [0, -1], zone: 'C' },
  { cell: [42, 17], face: [0, 1], zone: 'D' },
  { cell: [46, 19], face: [1, 0], zone: 'E' },
  { cell: [24, 17], face: [0, -1], zone: 'G' },
];
export const BOX_START = [0, 1];

// Luces por zona. Sin corriente algunas quedan apagadas o titilando.
export const LIGHTS = [
  { zone: 'A', pos: [12, 3.05, 39], color: 0xffc48a, intensity: 39, noPower: 0.55 },
  { zone: 'B', pos: [16, 3.3, 30.2], color: 0xffb070, intensity: 30, noPower: 0.8, kind: 'lamp' },
  { zone: 'C', pos: [30.5, 3.05, 39], color: 0xffd09a, intensity: 44, noPower: 0.45 },
  { zone: 'D', pos: [38.5, 1.1, 25.4], color: 0xff7a2a, intensity: 57, noPower: 1, kind: 'fire' },
  { zone: 'E', pos: [53.3, 1.7, 19.0], color: 0xffb35a, intensity: 14, noPower: 1, kind: 'candle' },
  { zone: 'F', pos: [43.5, 3.05, 10], color: 0xd8e6ff, intensity: 52, noPower: 0.05, emergency: true },
  { zone: 'G', pos: [17, 3.2, 10], color: 0xffd6a0, intensity: 52, noPower: 0.05, emergency: true },
  { zone: 'H', pos: [48.5, 3.05, 39], color: 0xffc080, intensity: 35, noPower: 0.5 },
  { zone: 'I', pos: [58.4, 3.3, 25.6], color: 0xffb070, intensity: 24, noPower: 0.8, kind: 'lamp' },
  { zone: 'I', pos: [68.4, 1.3, 27.5], color: 0xff9a40, intensity: 12, noPower: 1, kind: 'candle' },
];

// Objetos del easter egg "La Ronda del Abuelo".
export const EE = {
  calabaza: { pos: [27.6, 2.42, 41.5] },
  well: { pos: [14, 25] },
  kiln: { pos: [38.5, 25.2] },
  hearth: { cell: [53, 46], face: [0, -1] },
  // (al costado del pasillo: la puerta de la Sala de Máquinas entra por el medio)
  abuelo: { pos: [53.3, 19.6] },
  // la tumba del Capataz: ahí va su sombrero y arranca lo último
  tumba: { pos: [68.6, 27.5] },
};

// Utilería. Cada entrada la arma world/props.js; block marca si frena al jugador.
export const PROPS = [
  // A · Galpón
  { type: 'table', pos: [8, 37], rot: 0 },
  { type: 'table', pos: [15, 43], rot: Math.PI / 2 },
  { type: 'crates', pos: [5, 34], rot: 0.2 },
  { type: 'crates', pos: [18, 34], rot: -0.3 },
  { type: 'barrel', pos: [5, 44.5] },
  { type: 'barrel', pos: [6, 44.6] },
  { type: 'hay', pos: [17.5, 44.2], rot: 0 },
  { type: 'sacks', pos: [5, 38], rot: Math.PI / 2 },
  // B · Patio
  { type: 'rack', pos: [8, 25], rot: 0 },
  { type: 'rack', pos: [24, 23.5], rot: 0 },
  { type: 'rack', pos: [24, 28.5], rot: 0 },
  { type: 'well', pos: [14, 25] },
  { type: 'tree', pos: [6, 19.5] },
  { type: 'tree', pos: [29, 30] },
  { type: 'tree', pos: [19, 19.5] },
  { type: 'cart', pos: [10, 29.8], rot: 0.3 },
  { type: 'lamppost', pos: [16, 30.6] },
  { type: 'sacks', pos: [29, 19.5], rot: 0 },
  // C · Almacén
  { type: 'shelf', pos: [27.5, 41.7], rot: 0, len: 6 },
  { type: 'shelf', pos: [27.5, 37.3], rot: 0, len: 6 },
  { type: 'counter', pos: [36.5, 36], rot: Math.PI / 2 },
  { type: 'barrel', pos: [39.5, 44.5] },
  { type: 'sacks', pos: [22, 44.4], rot: 0 },
  { type: 'shelfWall', pos: [40.55, 42], rot: -Math.PI / 2, len: 5 },
  // D · Barbacuá
  { type: 'kiln', pos: [38.5, 22.5] },
  { type: 'firewood', pos: [33, 21], rot: 0 },
  { type: 'firewood', pos: [44.5, 27], rot: Math.PI / 2 },
  { type: 'sacks', pos: [44.3, 30.4], rot: 0 },
  // E · Capilla
  // (corrido al este: en el medio tapaba la puerta de la Sala de Máquinas)
  { type: 'altar', pos: [53.3, 18.45] },
  { type: 'pew', pos: [49.3, 23], rot: 0 },
  { type: 'pew', pos: [52.7, 23], rot: 0 },
  { type: 'pew', pos: [49.3, 26], rot: 0 },
  { type: 'pew', pos: [52.7, 26], rot: 0 },
  { type: 'pew', pos: [49.3, 29], rot: 0 },
  { type: 'pew', pos: [52.7, 29], rot: 0 },
  // F · Máquinas
  { type: 'generator', pos: [37, 9], rot: 0 },
  { type: 'generator', pos: [49, 9], rot: 0 },
  { type: 'pipes', pos: [43.5, 15.6], rot: 0 },
  { type: 'barrel', pos: [54.4, 5] },
  { type: 'barrel', pos: [54.4, 6.1] },
  { type: 'crates', pos: [33, 15], rot: 0 },
  // G · Acopio
  { type: 'bigsacks', pos: [7, 7], rot: 0 },
  { type: 'bigsacks', pos: [7, 13], rot: 0.1 },
  { type: 'bigsacks', pos: [26, 7], rot: -0.1 },
  { type: 'pallets', pos: [21, 12.5], rot: 0 },
  { type: 'truck', pos: [13.5, 12], rot: Math.PI / 2 },
  { type: 'crates', pos: [29, 5], rot: 0.4 },
  // H · Oficina
  { type: 'desk', pos: [48.5, 36], rot: 0 },
  { type: 'cabinet', pos: [43, 34], rot: 0 },
  { type: 'cabinet', pos: [44, 34], rot: 0 },
  { type: 'armchair', pos: [50.5, 43], rot: Math.PI },
  { type: 'bookshelf', pos: [42.6, 43], rot: Math.PI / 2 },
  // I · Cementerio (las tumbas miran al camino que sale de la capilla)
  { type: 'tumba', pos: [59.5, 20], rot: 0 },
  { type: 'tumba', pos: [62.3, 20], rot: 0, kind: 'stone' },
  { type: 'tumba', pos: [65.1, 20], rot: 0 },
  { type: 'tumba', pos: [59.5, 23.8], rot: 0, kind: 'stone' },
  { type: 'tumba', pos: [62.3, 23.8], rot: 0 },
  { type: 'tumba', pos: [65.1, 23.8], rot: 0, kind: 'fence' },
  { type: 'tumba', pos: [61, 30.1], rot: Math.PI },
  { type: 'tumba', pos: [63.8, 30.1], rot: Math.PI, kind: 'fence' },
  { type: 'tumba', pos: [66.6, 30.1], rot: Math.PI, kind: 'stone' },
  { type: 'panteon', pos: [68.6, 27.5], rot: -Math.PI / 2 },
  { type: 'arbolSeco', pos: [69.2, 18.4] },
  { type: 'arbolSeco', pos: [57.9, 30.6] },
  { type: 'lamppost', pos: [58.4, 26] },
  { type: 'fosa', pos: [68.4, 21.4], rot: 0.15 },
  { type: 'cruces', pos: [70.3, 23.6], rot: -Math.PI / 2 },
];

// ---------------- actividades (frascos, trampas, radios y escudo) ----------------
const JARS = [
  { cell: [3, 36], face: [1, 0], zone: 'A' },
  { cell: [38, 46], face: [0, -1], zone: 'C' },
  { cell: [3, 14], face: [1, 0], zone: 'G' },
  // (no en la pared de atrás de la escalera del altillo: ahí no se llega)
  { cell: [56, 38], face: [-1, 0], zone: 'H' },
];
const TRAPS = [
  {
    id: 'trapiche',
    name: 'la Trampa del Trapiche',
    kind: 'shock',
    power: true,
    lever: { cell: [53, 17], face: [0, -1] },
    rect: [49.4, 15.9, 52.6, 18.9],
    posts: [[49.75, 16.25], [52.25, 16.25]],
  },
  {
    id: 'llamarada',
    name: 'la Llamarada',
    kind: 'fire',
    power: false,
    lever: { cell: [31, 22], face: [1, 0] },
    rect: [29.9, 23.7, 33.1, 26.3],
  },
];
const RADIOS = [
  {
    pos: [8.45, 0.815, 36.78],
    rot: 0.3,
    lines: [
      'Radio Misiones, boletín de las nueve. En el molino Santa Ana siguen sin aparecer los peones del turno noche.',
      'El patrón asegura que es un asunto gremial. Los vecinos hablan de otra cosa.',
    ],
  },
  {
    pos: [36.35, 1.06, 34.9],
    rot: Math.PI / 2,
    lines: [
      'Se recomienda a la población no acercarse al barbacuá después de hora. Dicen que el humo tiene voces.',
      'Y si escucha una mecedora en la capilla... no conteste.',
    ],
  },
  {
    pos: [48.95, 0.84, 35.85],
    rot: -0.2,
    lines: [
      'Última transmisión. Si alguien escucha esto... la yerba no se toca, la yerba se ceba.',
      'Y ahora, un chamamé para los que siguen de pie.',
    ],
  },
];
const PARTS = [
  { id: 'tapa', name: 'Tapa de olla de hierro', pos: [16.2, 0.93, 33.45], zone: 'A' },
  { id: 'cuero', name: 'Cuero crudo de vaca', pos: [38.6, 0.03, 34.3], zone: 'C' },
  { id: 'tientos', name: 'Tientos y hebillas', pos: [10.4, 0.03, 9.2], zone: 'G' },
];
const BENCH = { pos: [12, 19.15], rot: 0 };
export const ACT = {
  jars: JARS,
  traps: TRAPS,
  radios: RADIOS,
  parts: PARTS,
  bench: BENCH,
  shield: { name: 'Escudo de tranquera', hp: 900, where: 'la mesa de trabajo del patio', plan: 'ESCUDO: tapa + cuero + tientos', up: { name: 'Escudo de tranquera remachado', hp: 1450, prop: 'push', kind: 'press', pos: [40.5, 12.5], rot: 0, secs: 40 } },
  radioAch: ['Oyente de Radio Misiones', 'Escuchaste las tres transmisiones'],
};

// ---------------- bichos de ambiente ----------------
// Bandadas: dónde se posan (en el borde de arriba de las paredes, del lado del
// patio, para que se vean desde abajo) y hacia dónde miran (al patio).
const FLOCKS = [
  { perch: [[6.2, 32.1], [7.1, 32.08], [8.4, 32.12], [9.2, 32.1], [15.3, 32.1]], yaw: Math.PI },
  { perch: [[21.5, 17.9], [22.6, 17.92], [24.1, 17.88], [26.8, 17.9], [27.7, 17.9]], yaw: 0 },
  { perch: [[31.1, 19.4], [31.1, 20.3], [31.12, 28.6], [31.08, 29.5], [31.1, 30.4]], yaw: -Math.PI / 2 },
];
// Recorridos de las ratas en el acopio: de una cueva a otra, pegadas a la pared.
const RAT_RUNS = [
  [[4.35, 5.2], [4.35, 15.4]],
  [[6.2, 15.65], [14.8, 15.65]],
  [[29.65, 7.6], [29.65, 15.3]],
  [[23.5, 4.35], [28.3, 4.35]],
];
export const CRITTERS = { flocks: FLOCKS, rats: RAT_RUNS };

// ---------------- lo demás del mapa ----------------
// Qué sistemas lleva este mapa (los de la granja son otros).
export const FEATURES = { attic: true, highWindows: true, decor: true, curandero: true, secrets: true, cemetery: true, special: 'capybara', boss: 'capataz', egg: 'abuelo' };
// Fuego del barbacuá (llama y crepitar).
export const FIRES = [{ pos: [38.5, 0.4, 24.4], spread: 0.8, sound: [38.5, 1, 25] }];
// Cámara del menú: da vueltas por el patio.
export const TITLE_CAM = { at: [13, 1.7, 28], amp: [3, 1.2], look: [19, 1.9, 21.5], lookAmp: 5 };
export const TEXT = {
  soul: (many) => `El molino se quedó con ${many ? 'sus almas' : 'tu alma'}.`,
  won: (team, r) => `${team ? 'Vencieron' : 'Venciste'} al Mandinga en la ronda ${r}. El Abuelo por fin toma mate en paz.`,
  egg: 'La Ronda del Abuelo',
  loading: 'Levantando el molino…',
};
// Cielo: siempre de noche.
export const SKY = { daylight: 0 };

// Los hornos de barro de las empanadas (entities/Empanadas): pared y hacia dónde mira.
export const HORNO_SPOTS = [
  { cell: [24, 32], face: [0, -1] },
  { cell: [46, 21], face: [-1, 0] },
  { cell: [56, 14], face: [-1, 0] },
];
