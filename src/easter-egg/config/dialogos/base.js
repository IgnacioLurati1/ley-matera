// Para armar las charlas de cada mapa (config/dialogos/<mapa>.js).
// Los caracteres (ui/cineCrew PERSONA): V el Valiente, M el Miedoso,
// C el Canchero, O el Viejo. En el estero y el Eclipse: V Gil, M Benito,
// C Cirilo, O Anacleto.
export const V = 'valiente';
export const M = 'miedoso';
export const C = 'canchero';
export const O = 'viejo';

// Una charla: id (único en el mapa), las frases ([quién, qué]) y, si hace
// falta, desde qué ronda (from) o una condición (when(g)). Los que hablan
// (who) salen de las frases: tienen que estar todos en la partida y en pie.
export function charla(id, lines, { from = 0, when = null } = {}) {
  return { id, lines, who: [...new Set(lines.map(([p]) => p))], from, when };
}
