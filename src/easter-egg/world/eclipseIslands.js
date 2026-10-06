import { ISLANDS } from '../config/maps/eclipse';
import * as centro from './eclipse/centro';
import * as molino from './eclipse/molino';
import * as tapera from './eclipse/tapera';
import * as penal from './eclipse/penal';
import * as monumento from './eclipse/monumento';
import * as torre from './eclipse/torre';
import * as castillo from './eclipse/castillo';
import * as desgarro from './eclipse/desgarro';

// El arte de cada isla de Eclipse Matero, un módulo por isla (world/eclipse/).
// Cada uno arma lo suyo encima del armado en bloques y de la roca, y si tiene
// algo que mover lo hace en update. __mduNoEclipseArt: solo los bloques.
const MODS = { centro, molino, tapera, penal, monumento, torre, castillo, desgarro };

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
  return live;
}
