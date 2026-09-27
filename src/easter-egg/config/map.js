import * as molino from './maps/molino';
import * as granja from './maps/granja';
import * as penal from './maps/penal';
import * as esteros from './maps/esteros';
import * as torre from './maps/torre';
import * as castillo from './maps/castillo';
import { shapeRuns } from '../world/esterosGround';

// Mapa en juego. Cada mapa es un módulo de config/maps/ con la misma forma;
// acá se elige uno y todos los que importan ZONES, DOORS, etc. ven el del
// mapa actual (las exportaciones con `let` son enlaces vivos). Se cambia con
// useMap() antes de armar el mundo (Game.buildScene).

export const MAPS = { molino, granja, penal, esteros, torre, castillo };
// Para el menú: nombre corto y una línea.
export const MAP_LIST = [
  { id: 'molino', name: 'El Molino', sub: 'Un molino yerbatero abandonado en Misiones' },
  { id: 'granja', name: 'La Tapera', sub: 'Una chacra perdida entre los maizales, al atardecer' },
  { id: 'penal', name: 'Mate of the Dead', sub: 'El penal de la Isla del Ceibo, en medio del río' },
  { id: 'esteros', name: 'Mate no Numa', sub: 'Los Esteros del Iberá, bajo la luna llena' },
  { id: 'torre', name: 'Revelaciones Materas', sub: 'Una torre de quince pisos en el ojo del remolino' },
  { id: 'castillo', name: 'Der Mateendrache', sub: 'Un castillo en la cordillera nevada, donde duerme el dragón' },
];

// Modos de juego de cada mapa (por ahora solo la torre tiene otro): el de
// siempre ('story') y el que cada mapa arme con su challenge() (config/maps).
export const MAP_MODES = {
  torre: [
    { id: 'story', name: 'Historia', sub: 'Las Revelaciones: Martín Fierro, la Voz y el Infierno Matero' },
    { id: 'challenge', name: 'Challenge', sub: 'Sin historia ni ayuda: pisos sin centro, muertos que corren y la Supernova arriba de todo' },
  ],
};
export const modeOf = (id, mode) => (MAP_MODES[id]?.some((m) => m.id === mode) ? mode : 'story');

export let MAP_ID = 'molino';
// el modo del mapa en juego ('story' o 'challenge')
export let MODE = 'story';
export let MAP_W;
export let MAP_H;
export let WALL_H;
export let ZONES;
export let START_ZONE;
export let PLAYER_START;
export let DOORS;
export let WINDOWS;
export let RISERS;
export let WALL_BUYS;
export let PERK_SPOTS;
export let POWER;
export let PAP;
export let BOX_SPOTS;
export let BOX_START;
export let LIGHTS;
export let EE;
export let PROPS;
export let ACT;
export let CRITTERS;
export let FEATURES;
export let FIRES;
export let TITLE_CAM;
export let TEXT;
export let SKY;
// rampas y escaleras entre pisos (solo los mapas con alturas)
export let RAMPS = [];
// rectángulos donde el terreno de afuera se hunde bajo el río
export let RIVER = [];
// la torre de pisos apilados (solo Revelaciones Materas, world/Tower.js)
export let TOWER = null;
// el nivel del agua (el estero; null donde no hay agua para nadar)
export let WATER_Y = null;

export function useMap(id, mode = 'story') {
  const base = MAPS[id] ? MAPS[id] : molino;
  MAP_ID = MAPS[id] ? id : 'molino';
  MODE = modeOf(MAP_ID, mode);
  // el otro modo: los mismos datos con lo que cambia encima
  const m = MODE !== 'story' && base.challenge ? { ...base, ...base.challenge() } : base;
  ({ MAP_W, MAP_H, WALL_H, ZONES, START_ZONE, PLAYER_START, WINDOWS, RISERS, WALL_BUYS, PERK_SPOTS, POWER, PAP, BOX_SPOTS, BOX_START, LIGHTS, EE, PROPS, ACT, CRITTERS, FEATURES, FIRES, TITLE_CAM, TEXT, SKY } = m);
  // las puertas se copian: el mundo les cuelga sus cajas de colisión
  DOORS = m.DOORS.map((d) => ({ ...d }));
  RAMPS = m.RAMPS || [];
  RIVER = m.RIVER || [];
  TOWER = m.TOWER || null;
  WATER_Y = m.WATER_Y ?? null;
  return MAP_ID;
}

useMap('molino');

// Rectángulos de una zona (una zona puede ser varios juntos). Las islas del
// estero (manchones y sendas, world/esterosGround.js) van en tiras de una fila.
export function zoneRects(k) {
  const Z = ZONES[k];
  if (!Z) return [];
  const R = Z.rects || (Z.rect ? [Z.rect] : []);
  if (!Z.blobs && !Z.trails) return R;
  if (!Z.runs) Z.runs = [...shapeRuns(Z, MAP_W, MAP_H, Z.carve), ...R];
  return Z.runs;
}
