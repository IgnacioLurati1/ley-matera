import { ISLANDS } from '../config/maps/eclipse';
import * as centro from './eclipse/centro';
import * as molino from './eclipse/molino';
import * as tapera from './eclipse/tapera';
import * as penal from './eclipse/penal';
import * as monumento from './eclipse/monumento';
import * as torre from './eclipse/torre';
import * as castillo from './eclipse/castillo';
import * as desgarro from './eclipse/desgarro';
import * as abismo from './eclipse/abismo';
import * as grietas from './eclipse/grietas';
import * as v5 from './eclipse/v5';
import * as v5b from './eclipse/v5b';
import * as claroVeg from './eclipse/claroVeg';
import * as penalCaos from './eclipse/penalCaos';

// El arte de cada isla de Eclipse Matero, un módulo por isla (world/eclipse/).
// Cada uno arma lo suyo encima del armado en bloques y de la roca, y si tiene
// algo que mover lo hace en update. __mduNoEclipseArt: solo los bloques.
// (abismo: La Disformidad, la dimensión de afuera; mundo, it. 4)
// (grietas: los cuatro jirones del paso I del Pack-a-Pava; 2026-10-10)
const MODS = { centro, molino, tapera, penal, monumento, torre, castillo, desgarro, abismo, grietas };

export function buildEclipseIslands(w) {
  if (globalThis.__mduNoEclipseArt === true) return [];
  const live = [];
  for (const [id, m] of Object.entries(MODS)) {
    const isl = ISLANDS[id];
    if (!isl) continue;
    // (un módulo que falla no tira el mapa: queda la isla en bloques y el aviso)
    try {
      m.build?.(w, w.g, isl);
      if (m.update) live.push(m);
    } catch (e) {
      console.error(`arte de la isla ${id}: no se armó`, e);
    }
  }
  // (arte6) el pajonal del estero en el claro y la playa de la laguna
  try {
    claroVeg.build(w);
  } catch (e) {
    console.error('Eclipse claroVeg: no se armó', e);
  }
  // lo que el origen arma por código en las secciones nuevas del layout v5 (arte-v5)
  try {
    v5.build(w, w.g);
    live.push(v5);
    // (la vuelta B: las zonas llenas y deformadas; se arma en el primer cuadro)
    v5b.build(w);
    live.push(v5b);
    // (arte6) el penal desarmado por la disformidad: después de v5b (no pisa sus piezas)
    penalCaos.build(w);
    live.push(penalCaos);
  } catch (e) {
    console.error('Eclipse v5: no se armó', e);
  }
  return live;
}
