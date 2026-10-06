// Los logros. Los generales (bajas, rondas, perks, la caja, los minijefes...),
// los de cada mapa (su easter egg, la ronda 20 y los que el juego ya anunciaba
// con g.hud.achievement, que antes no quedaban guardados) y los que se sumen
// después con g.hud.achievement sin estar acá (quedan como "extra" del mapa).
// Viven en el perfil (core/progress: localStorage, la copia de IndexedDB y el
// código de copia). Los secretos no dicen nada hasta que salen.
// Quién los gana: entities/logrosTracker.js (en la partida); quién los
// muestra: ui/Logros.js (la tarjeta del título y la pantalla).
import * as P from './progress';
import { MAP_LIST } from '../config/map';

// los mapas de siempre (ni el bonus ni el final canónico cambian Trotamundos)
const BASE_MAPS = MAP_LIST.filter((m) => !m.bonus && !m.final);

// tier: bronce, plata, oro o platino (el color de la medalla)
// stat + goal: se gana al llegar (con barra de progreso)
// title: el texto exacto de g.hud.achievement que lo da
const GENERAL = [
  { id: 'primera', name: 'Primera sangre', desc: 'Matá tu primer muerto.', icon: 'skull', tier: 'bronce', stat: 'kills', goal: 1 },
  { id: 'k1000', name: 'Matarife', desc: '1.000 bajas.', icon: 'skull', tier: 'plata', stat: 'kills', goal: 1000 },
  { id: 'k10000', name: 'Degollador', desc: '10.000 bajas.', icon: 'skull', tier: 'oro', stat: 'kills', goal: 10000 },
  { id: 'head500', name: 'Ojo de baqueano', desc: '500 tiros en la cabeza.', icon: 'aim', tier: 'plata', stat: 'heads', goal: 500 },
  { id: 'knife100', name: 'Facón en mano', desc: '100 bajas a cuchillo.', icon: 'knife', tier: 'plata', stat: 'knife', goal: 100 },
  { id: 'r10', name: 'Aguante', desc: 'Llegá a la ronda 10.', icon: 'round', tier: 'bronce', stat: 'ronda', goal: 10 },
  { id: 'r20', name: 'Aguantadero', desc: 'Llegá a la ronda 20.', icon: 'round', tier: 'plata', stat: 'ronda', goal: 20 },
  { id: 'r30', name: 'Mate amargo', desc: 'Llegá a la ronda 30.', icon: 'round', tier: 'oro', stat: 'ronda', goal: 30 },
  { id: 'r50', name: 'Leyenda del sótano', desc: 'Llegá a la ronda 50.', icon: 'round', tier: 'platino', stat: 'ronda', goal: 50 },
  { id: 'perks', name: 'Mateador compulsivo', desc: 'Todos los perks del mapa a la vez.', icon: 'mate', tier: 'plata' },
  { id: 'pap', name: 'Pack-a-Pava', desc: 'Mejorá un mate.', icon: 'pava', tier: 'bronce' },
  { id: 'box', name: 'Timbero', desc: 'Probá suerte en la caja 25 veces.', icon: 'box', tier: 'bronce', stat: 'box', goal: 25 },
  { id: 'doors', name: 'Dueño de casa', desc: 'Abrí todas las puertas de un mapa.', icon: 'door', tier: 'plata' },
  { id: 'pobre', name: 'Pobre pero honrado', desc: 'Llegá a la ronda 10 sin comprar nada.', icon: 'coin', tier: 'oro' },
  { id: 'online', name: 'Ronda de mate', desc: 'Jugá con amigos.', icon: 'friends', tier: 'bronce' },
  { id: 'revive', name: 'Gaucho solidario', desc: 'Levantá a un compañero.', icon: 'hand', tier: 'bronce' },
  { id: 'boss', name: 'Matajefes', desc: 'Derrotá un minijefe.', icon: 'crown', tier: 'bronce', stat: 'bosses', goal: 1 },
  { id: 'boss25', name: 'Cazador de jefes', desc: 'Derrotá 25 minijefes.', icon: 'crown', tier: 'oro', stat: 'bosses', goal: 25 },
  { id: 'emp', name: 'Empanadero', desc: 'Comé 10 empanadas.', icon: 'empanada', tier: 'bronce', stat: 'emp', goal: 10 },
  { id: 'stamin', name: 'Maratón', desc: 'Corré 1 km con Stamin-Up.', icon: 'shoe', tier: 'plata', stat: 'metros', goal: 1000 },
  { id: 'tour', name: 'Trotamundos', desc: 'Jugá todos los mapas.', icon: 'map', tier: 'plata', stat: 'mapas', goal: BASE_MAPS.length },
  { id: 'lvl55', name: 'Gaucho completo', desc: 'Llegá al nivel 55.', icon: 'star', tier: 'oro' },
  { id: 'prest', name: 'Prestigio', desc: 'Prestigiá por primera vez.', icon: 'sun', tier: 'oro' },
  { id: 'super', name: 'Super easter egg', desc: 'Todos los easter eggs.', icon: 'egg', tier: 'platino' },
];

// Lo de cada mapa: el easter egg, la ronda 20 y los anunciados.
const SPECIAL = {
  molino: [],
  granja: [{ id: 'hoz', name: 'La Hoz de la Muerte', desc: 'La hoja tomó sangre en el Pack-a-Pava.', icon: 'hoz', tier: 'oro', secret: true, title: 'La Hoz de la Muerte' }],
  penal: [
    { id: 'anacleto', name: 'Anacleto, libre', desc: 'Abriste la celda del pabellón.', icon: 'key', tier: 'plata', secret: true, title: 'Anacleto, libre' },
    { id: 'cirilo', name: 'Cirilo, libre', desc: 'Abriste la celda de los calabozos.', icon: 'key', tier: 'plata', secret: true, title: 'Cirilo, libre' },
    { id: 'benito', name: 'Benito, libre', desc: 'Abriste la celda de la enfermería.', icon: 'key', tier: 'plata', secret: true, title: 'Benito, libre' },
    { id: 'acida', name: 'Bombilla Ácida', desc: 'El ácido tomó almas en el encierro.', icon: 'flask', tier: 'oro', secret: true, title: 'Bombilla Ácida' },
    { id: 'cuchilla', name: 'La Cuchilla del Matarife', desc: 'Aguantaste el encierro de la ermita.', icon: 'knife', tier: 'oro', secret: true, title: 'La Cuchilla del Matarife' },
  ],
  esteros: [],
  torre: [
    { id: 'mk3', name: 'Rayo Matero Mark III', desc: 'Los gemelos del remolino.', icon: 'bolt', tier: 'oro', secret: true, title: 'Rayo Matero Mark III' },
    { id: 'buyable', name: 'Buyable Ending', desc: 'Pagaron la escalera al cielo.', icon: 'stairs', tier: 'oro', secret: true, title: 'Buyable Ending' },
    { id: 'reto', name: 'Escalera al cielo', desc: 'Terminá el Challenge de la torre.', icon: 'stairs', tier: 'platino' },
  ],
  // Eclipse Matero (solo existe con el mapa; MAP_LIST no lo trae sin el switch)
  eclipse: [
    { id: 'temple', name: 'Cuatro filos', desc: 'Templaste el Desgarrador del Eclipse.', icon: 'egg', tier: 'oro', secret: true, title: 'Desgarrador del Eclipse' },
    { id: 'cabral', name: 'Muero contento', desc: 'Viste caer a Cabral en San Lorenzo.', icon: 'book', tier: 'plata', secret: true },
    { id: 'lector11', name: 'La parte que faltaba', desc: 'Leíste el último capítulo de La Ronda Eterna.', icon: 'book', tier: 'plata', secret: true, title: 'El de la linterna' },
  ],
  castillo: [
    { id: 'cronista', name: 'Cronista del Castillo', desc: 'Leíste las crónicas de la Gran Guerra.', icon: 'book', tier: 'plata', secret: true, title: 'Cronista del Castillo' },
    { id: 'sortija', name: 'Sortijero', desc: 'Sacaste la sortija cinco veces seguidas.', icon: 'ring', tier: 'plata', secret: true, title: 'Sortijero' },
  ],
};
// (el del molino ya se anunciaba con su nombre)
const EE_TITLE = { molino: 'La Ronda del Abuelo', eclipse: 'El que cebó el Primer Mate' };

export const MAPS = MAP_LIST.map((m) => ({ id: m.id, name: m.name, bonus: !!m.bonus }));
// (el easter egg de un mapa bonus, cuando sea jugable: sacarlo de acá. El del
// Monumento ya se juega y lo da MonumentoEgg.playEnding, como Game.win)
const NO_EE = new Set(MAP_LIST.filter((m) => m.bonus && (m.id !== 'monumento' || globalThis.__mduNoEggLogro)).map((m) => m.id));
const PER_MAP = MAPS.flatMap((m) => [
  ...(NO_EE.has(m.id) ? [] : [{ id: `ee_${m.id}`, name: EE_TITLE[m.id] || `${m.name}: easter egg`, desc: `Terminá el easter egg de ${m.name}.`, icon: 'egg', tier: 'oro', cat: m.id, title: EE_TITLE[m.id] }]),
  { id: `r20_${m.id}`, name: `Ronda 20 en ${m.name}`, desc: `Llegá a la ronda 20 en ${m.name}.`, icon: 'round', tier: 'plata', cat: m.id, stat: `ronda:${m.id}`, goal: 20 },
  ...(SPECIAL[m.id] || []).map((d) => ({ ...d, cat: m.id })),
]);

export const LOGROS = [...GENERAL.map((d) => ({ ...d, cat: 'general' })), ...PER_MAP];
const BY_ID = new Map(LOGROS.map((d) => [d.id, d]));
const BY_TITLE = new Map(LOGROS.filter((d) => d.title).map((d) => [d.title, d]));

const fresh = () => ({ v: 1, got: {}, n: {}, best: {}, maps: {}, extra: {} });
function state() {
  const d = P.logrosData();
  if (!d || typeof d !== 'object') return fresh();
  const f = fresh();
  for (const k of Object.keys(f)) if (!d[k] || typeof d[k] !== 'object') d[k] = f[k];
  return d;
}
const keep = (s, now) => P.setLogros(s, now);

export const def = (id) => BY_ID.get(id);
export const byTitle = (t) => BY_TITLE.get(t);
export const has = (id) => !!state().got[id];
export const when = (id) => state().got[id] || 0;
export const extras = () => Object.entries(state().extra).map(([title, x]) => ({ title, ...x }));
export const onChange = (fn) => P.on('logros', fn);

// Lo que lleva de un logro con meta: { cur, goal } (o null).
export function progress(d) {
  if (!d.stat) return null;
  return { cur: Math.min(d.goal, statOf(state(), d.stat)), goal: d.goal };
}

function statOf(s, stat) {
  if (stat === 'ronda') return Math.max(0, ...Object.values(s.best).map((v) => v | 0));
  if (stat.startsWith('ronda:')) return s.best[stat.slice(6)] | 0;
  if (stat === 'mapas') return Object.keys(s.maps).filter((k) => BASE_MAPS.some((m) => m.id === k)).length;
  return s.n[stat] || 0;
}

export function count() {
  const s = state();
  const got = LOGROS.filter((d) => s.got[d.id]).length;
  return { got, total: LOGROS.length };
}

// Los que llegaron a su meta con este estado (y no estaban).
function reached(s) {
  const out = [];
  for (const d of LOGROS) {
    if (!d.stat || s.got[d.id]) continue;
    if (statOf(s, d.stat) >= d.goal) {
      s.got[d.id] = Date.now();
      out.push(d);
    }
  }
  return out;
}

// Gana uno (si no lo tenía): devuelve su definición, o null.
export function unlock(id) {
  const d = BY_ID.get(id);
  if (!d) return null;
  const s = state();
  if (s.got[id]) return null;
  s.got[id] = Date.now();
  keep(s, true);
  return d;
}

// Suma a un contador (kills, heads, knife, box, bosses, emp, metros):
// devuelve los logros que salieron con esto.
export function add(stat, n = 1) {
  if (!(n > 0)) return [];
  const s = state();
  s.n[stat] = (s.n[stat] || 0) + n;
  const out = reached(s);
  keep(s, out.length > 0);
  return out;
}

// La mejor ronda en un mapa (y que lo jugó).
export function setBest(mapId, round) {
  const s = state();
  const was = s.best[mapId] | 0;
  const seen = !!s.maps[mapId];
  if (round <= was && seen) return [];
  s.best[mapId] = Math.max(was, round | 0);
  s.maps[mapId] = 1;
  const out = reached(s);
  keep(s, out.length > 0);
  return out;
}

// Uno anunciado con g.hud.achievement que no está en la lista: queda guardado
// igual, como extra del mapa. Devuelve true si es nuevo.
export function extra(title, text, mapId) {
  const s = state();
  if (s.extra[title]) return false;
  s.extra[title] = { text: String(text || ''), map: mapId, t: Date.now() };
  keep(s, true);
  return true;
}
