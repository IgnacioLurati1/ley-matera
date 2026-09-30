// Lo que se desbloquea con el rango (el pase de niveles): los camuflajes
// (weapons/camos.js), las empanadas clásicas y las especiales fuertes
// (config/empanadas.js: `level` es desde cuándo se pueden usar) traen su
// `level` y, algunos, su `prestige`; y los pesos de cada nivel
// (core/progress pesosAt). Lo usan el aviso de nivel, el resumen del final
// y la pantalla de Niveles.

import { LEVELS, MASTER, pesosAt } from '../core/progress';
import { CLASICAS, ESPECIALES } from '../config/empanadas';
import { CAMOS } from '../weapons/camos';

// [{ kind: 'camo' | 'emp' | 'use', id, name, sub, level, prestige }]
//  'emp': una clásica nueva; 'use': una especial que ya se puede usar
const ALL = [];
const add = (kind, list, name, sub) => {
  for (const x of list) if (x.level || x.prestige) ALL.push({ kind, id: x.id, name: name(x), sub: sub(x), level: x.level | 0 || 1, prestige: x.prestige | 0 });
};
add('camo', CAMOS, (c) => c.name, (c) => (c.tier === 'animated' ? 'Camuflaje animado' : c.tier === 'prestige' ? 'Camuflaje de prestigio' : 'Camuflaje'));
add('emp', CLASICAS, (e) => e.name, (e) => `Empanada de ${e.sabor.toLowerCase()}`);
add('use', ESPECIALES, (e) => e.name, (e) => `Especial de ${e.sabor.toLowerCase()}: ya se puede usar`);

export const KIND_NAME = { camo: 'Camuflaje', emp: 'Empanada', use: 'Especial', pesos: 'Pesos' };

// Lo que se abre justo al llegar a este nivel (de este prestigio).
export function unlocksAt(level, prestige = 0) {
  // (los de nivel 1 sin prestigio ya vienen de entrada: no se anuncian)
  return ALL.filter((x) => x.prestige === (prestige | 0) && x.level === level && !(x.level <= 1 && !x.prestige));
}

// Un escalón del pase: lo que trae ese nivel (lo de siempre, que después
// de prestigiar ya se tiene, y lo propio de este prestigio), con sus pesos.
export function tierOf(level, prestige = 0) {
  const p0 = prestige | 0;
  // (lo del nivel 1 sin prestigio es lo de entrada: no es un premio)
  const items = ALL.filter((x) => x.level === level && (x.prestige === p0 || !x.prestige) && !(level <= 1 && !x.prestige));
  const p = level > 1 ? pesosAt(level, prestige) : 0;
  if (p) items.push({ kind: 'pesos', id: `p${level}`, name: `${p} ${p > 1 ? 'pesos' : 'peso'}`, sub: 'Para la pulpería', n: p, level, prestige });
  return items;
}

// Lo que trae cada prestigio (nivel 1 de ese prestigio, o el 100 de Maestro).
export const prestigeRewards = (p) => ALL.filter((x) => x.prestige === p);

// Lo próximo que se abre desde este rango (los primeros n).
export function nextUnlocks(r, n = 4) {
  const key = (x) => x.prestige * 2000 + x.level;
  const now = (r.prestige >= MASTER ? MASTER : r.prestige) * 2000 + r.level;
  return ALL.filter((x) => key(x) > now)
    .sort((a, b) => key(a) - key(b))
    .slice(0, n);
}

export const unlockCount = () => ALL.length;
export { LEVELS };
