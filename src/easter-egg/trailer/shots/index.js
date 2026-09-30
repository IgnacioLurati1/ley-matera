import * as lab from './lab';
import * as molino from './molino';
import * as granja from './granja';
import * as penal from './penal';
import * as esteros from './esteros';
import * as torre from './torre';
import * as castillo from './castillo';

// Todas las tomas del trailer, por id (cada archivo exporta las suyas).
export const SHOTS = {};
for (const mod of [lab, molino, granja, penal, esteros, torre, castillo]) for (const [k, v] of Object.entries(mod)) if (v && typeof v === 'object' && v.map) SHOTS[k] = v;
