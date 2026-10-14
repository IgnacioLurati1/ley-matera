// Las cartas del rush de jefes (el usuario, 2026-10-12: "que arranques medio
// pelado, te salen 3 sets de 3 cards para elegir algo, perk, arma, pack a
// pava, empanada no tan op, etc. [...] si te dice cual es. Podrian tener tiers
// y salir la misma cantidad de tiers buenos que de tiers malos en general por
// partida, tier gris oro y prismatico").
//
// Acá, sin nada de pantalla: el pozo de cartas por tier, la bolsa de tiers de
// la partida y el reparto de cada set. La pantalla es ui/RushCards.js; lo
// elegido se aplica al empezar cada jefe (core/bossRush.js loadout).
//
// La bolsa: al arrancar el rush se sabe cuántas cartas van a salir en toda la
// partida (sets × 3). La mitad son buenas (oro o prismático) y la otra mitad
// grises; si el total es impar, la que sobra va una partida para cada lado
// (bossRush guarda de qué lado fue la última). Se mezcla y se reparte en sets
// de 3, cada uno con al menos una buena y una gris. Cada carta dice qué da:
// el tier de su lugar en la bolsa y, al mostrar el set, una cosa de ese tier
// que no tengas ni haya salido antes en la partida.
import { WEAPONS, weaponStats, maxTier, tierOf, ELEM_INFO } from '../config/weapons';
import { PERKS } from '../config/perks';
import { EMPANADA } from '../config/empanadas';

export const TIERS = ['gris', 'oro', 'prisma'];
export const TIER_NAME = { gris: 'Gris', oro: 'Oro', prisma: 'Prismático' };
export const good = (t) => t === 'oro' || t === 'prisma';

// ---- el pozo (para ajustar) ----
// perk: los que se toman; gun: mates (gris, de la pared y los flojos de la
// caja; oro, los fuertes de la caja; prismático, los que revientan y los
// especiales); pap: el Pack-a-Pava de un mate que ya tenés (oro) o su
// segunda pasada, el elemento (gris); emp: empanadas, ninguna de las ultra
// raras ni las que regalan todo (Todo Incluido, Fiado, Ronda Robada...);
// vida: vida de más (Player.setHat), que se puede repetir (el chambergo y la
// faja grises, el poncho de cuero de oro, el de vicuña prismático; dos grises
// porque un set puede traer dos grises). Sale solo de relleno:
// cuando ya tenés casi todo y de ese tier no queda otra cosa (así la bolsa
// queda pareja igual).
// La tercera vuelta (el usuario, 2026-10-12: "crear nuevos tipos de cards,
// como por ejemplo tankear 1 hit mas, mas daño por bala, etc. Lo que se te
// ocurra, asi no es siempre tener todos los perks mate camionero pack a punch y
// listo. Capaz hasta meter habilidades"): mej, las mejoras (MEJORAS, que se
// apilan, en gris y oro; RAROS, las prismáticas, una vez cada una); hab, una
// habilidad con su tecla (HABILIDADES; una por jugador) y habup, su recarga
// más corta; esp, el especialista de un mate que llevás (core/armas.js; en el
// rush arrancan todos apagados). Lo que hacen en la pelea: core/rushBuild.js.
// globalThis.__mduRushViejo = true: el pozo de antes (sin estas cuatro).
export const POZO = {
  gris: {
    // (el usuario, 2026-10-13: Electric Cherry de prismático a gris; Double
    // Tap de oro a prismático; "faltan perks": el Aliento Dragónico en
    // prismático y el Acuanauta y el Maizaster, que andan en cualquier mapa del
    // rush —el Acuanauta solo en el agua—. El Catalizador Caótico de Eclipse no
    // sale solo: lo da el Heredero del caos, takeCard)
    // (2026-10-13 noche: el Maizaster baja a gris, el Stamin-Up sube a oro y
    // el Acuanauta sale del pozo: casi no hay agua en el rush)
    perk: ['deadshot', 'mule', 'cherry', 'maiz'],
    gun: ['madera', 'plastico', 'vidrio', 'lata', 'algarrobo', 'silicona', 'cocido', 'gemelos', 'bombillazo'],
    elem: true,
    emp: ['carne', 'caprese', 'tucumana', 'picante', 'saltena'],
    mej: ['polvora', 'bocho', 'domador', 'cebador', 'dedo', 'pulso', 'alpargata', 'achuras', 'vuelta', 'canita', 'bolsa', 'cuero', 'cocido', 'afilar'],
    habup: true,
    vida: [['chambergo', 'Chambergo', 25], ['faja', 'Faja de cuero', 15]],
  },
  oro: {
    perk: ['jugg', 'speed', 'revive', 'phd', 'stamin'],
    gun: ['imperial', 'camionero', 'torpedo', 'asta', 'mate47', 'campanario', 'llamarada'],
    pap: true,
    emp: ['jyq', 'humita', 'fugazzeta', 'cordero', 'jabali'],
    // (sin la Bolsa de yerba: solo gris; el usuario, 2026-10-13: "es pésimo")
    // (y el escudo mejorado, una vez: RAROS.escudo)
    mej: ['polvora', 'bocho', 'domador', 'cebador', 'dedo', 'pulso', 'alpargata', 'achuras', 'vuelta', 'canita', 'cuero', 'cocido', 'afilar', 'escudo'],
    hab: ['pique', 'rebencazo', 'humareda'],
    habup: true,
    esp: true,
    vida: [['poncho', 'Poncho de cuero', 50]],
  },
  prisma: {
    perk: ['wish', 'doubletap', 'dragon'],
    gun: ['rayo', 'labrador', 'explosivo', 'wunder', 'terere', 'tronador', 'diablo'],
    // las dos pasadas del Pack-a-Pava de una (el mate mejorado y con su elemento)
    pap2: true,
    emp: ['cabrito'],
    mej: ['pacto', 'gato', 'sangre', 'ultima', 'zonda', 'heredero', 'resurgir'],
    hab: ['paye'],
    vida: [['vicuna', 'Poncho de vicuña', 100]],
  },
};
// de las buenas, cuántas prismáticas (el resto, oro)
export const PRISMA_DE_BUENAS = 1 / 3;
// cuántas empanadas junta la canasta como mucho ("algunas")
export const EMP_MAX = 3;
// qué tan seguido sale cada clase en una carta. Antes los perks eran lo que
// más salía (4); desde la tercera vuelta compiten con las mejoras y las
// habilidades, así cada partida se arma distinto (sim_mazo3, eligiendo
// siempre lo de mejor tier: 3-4 perks de 10 en vez de 6-7, 3-4 mejoras, casi
// siempre una habilidad y unos 700 armados distintos cada 5000 partidas)
export const PESO_CLASE = { perk: 1.7, pap: 1.6, pap2: 1.6, gun: 0.8, elem: 0.9, emp: 0.8, mej: 2.6, hab: 1.8, habup: 1.1, esp: 1.6, vida: 0.3 };
const viejo = () => globalThis.__mduRushViejo === true;
const NUEVAS = new Set(['mej', 'hab', 'habup', 'esp']);

// ---- las mejoras: [gris, oro] de cada una, y se suman ----
const pc = (v) => `${Math.round(v * 100)} %`;
export const MEJORAS = {
  // daño de todo lo que tirás (no el de la bomba atómica ni el Juicio)
  polvora: { name: 'Pólvora criolla', gris: 0.1, oro: 0.25, fx: (v) => `+${pc(v)} de daño` },
  bocho: { name: 'Al bocho', gris: 0.25, oro: 0.5, fx: (v) => `+${pc(v)} a la cabeza` },
  domador: { name: 'Domador', gris: 0.1, oro: 0.22, fx: (v) => `+${pc(v)} a los jefes` },
  // (lo que tarda en recargar: x(1 - suma), hasta TOPE)
  cebador: { name: 'Cebador ligero', gris: 0.12, oro: 0.28, fx: (v) => `Recargás ${pc(v)} más rápido` },
  dedo: { name: 'Dedo nervioso', gris: 0.08, oro: 0.18, fx: (v) => `Tirás ${pc(v)} más rápido` },
  pulso: { name: 'Pulso firme', gris: 0.25, oro: 0.5, fx: (v) => `-${pc(v)} de retroceso` },
  alpargata: { name: 'Alpargatas nuevas', gris: 0.06, oro: 0.14, fx: (v) => `Corrés ${pc(v)} más` },
  achuras: { name: 'Achuras', gris: 4, oro: 10, fx: (v) => `Cada baja: +${v} de vida` },
  // (de cada baja, esa parte del cargador a la reserva)
  vuelta: { name: 'Otra vuelta', gris: 0.06, oro: 0.15, fx: (v) => `Cada baja: ${pc(v)} del cargador` },
  canita: { name: 'Cañita voladora', gris: 0.08, oro: 0.2, fx: (v) => `${pc(v)} de las bajas explotan` },
  bolsa: { name: 'Bolsa de yerba', gris: 1, oro: 2, fx: (v) => `+${v} bomba${v > 1 ? 's' : ''} de yerba` },
  // (un golpe entero que no te toca; se recarga de a uno: core/rushBuild.js CUERO_CD)
  cuero: { name: 'Cuero de vaca', gris: 1, oro: 2, fx: (v) => `Aguantás ${v} golpe${v > 1 ? 's' : ''} más` },
  cocido: { name: 'Mate cocido', gris: 0.35, oro: 1, fx: (v) => `Te curás ${pc(v)} más rápido` },
  afilar: { name: 'Piedra de afilar', gris: 0.5, oro: 1.2, fx: (v) => `Facón +${pc(v)}` },
};
// hasta dónde se apila cada una (lo que pasa de acá ya no sale)
export const TOPE = { cebador: 0.6, dedo: 0.6, pulso: 0.8, alpargata: 0.4, canita: 0.5, bolsa: 4, cuero: 4, vuelta: 0.45, achuras: 30 };
// las prismáticas: raras o fuertes, una vez cada una
export const RAROS = {
  pacto: { name: 'Pacto con el Mandinga', fx: '+50 % de daño, mitad de vida', dmg: 0.5, vida: 0.5 },
  gato: { name: 'Siete vidas', fx: 'Una vez por jefe, no caés' },
  sangre: { name: 'Sangre caliente', fx: 'Menos vida, más daño', max: 0.8 },
  ultima: { name: 'La última', fx: 'La última bala pega x4', k: 4 },
  zonda: { name: 'Viento Zonda', fx: 'Cada 12 bajas, un ventarrón', n: 12 },
  // (el usuario, 2026-10-13: "Heredero del caos (te da la guadaña de eclipse
  // por 30 segundos, cooldown de un jefe en el medio, o sea el que estas no
  // cuenta, el siguiente no la tendrias, el siguiente si). Solo online,
  // Resurgir del mate (revive a todos los aliados con sus perks, un solo uso)".
  // Las dos van con su tecla: core/rushPrisma.js)
  // la guadaña de Eclipse (el Desgarrador Cósmico) secs segundos; usada en un
  // jefe, el siguiente descansa
  heredero: { name: 'Heredero del caos', fx: 'La guadaña de Eclipse 30 s', secs: 30, tecla: true },
  // (online: solo sale en línea, con al menos otro jugador en la sala)
  resurgir: { name: 'Resurgir del mate', fx: 'Levanta a todos, una vez', online: true, tecla: true },
  // (el usuario, 2026-10-13: una carta con el escudo mejorado, "que tome el
  // del mapa al que vas y se resetee full vida por cada pelea, incluso si se
  // rompió". De oro, una vez: core/bossRush.js loadout.
  // globalThis.__mduRushSinEscudo = true: no sale ni da el escudo)
  escudo: { name: 'Escudo mejorado', fx: 'El de cada mapa, nuevo en cada pelea', tier: 'oro' },
};

// ---- las habilidades: una por jugador, con su tecla (core/controls.js 'habilidad') ----
// cd: la recarga (s). Lo demás lo usa core/rushBuild.js.
export const HABILIDADES = {
  pique: { name: 'Pique', cd: 7, fx: 'Un pique para adelante', dist: 7, dur: 0.22 },
  rebencazo: { name: 'Rebencazo', cd: 16, fx: 'Los tira para atrás', r: 6.5, push: 6 },
  humareda: { name: 'Humareda', cd: 24, fx: 'No te ven por 5 s', secs: 5 },
  paye: { name: 'Payé', cd: 30, fx: 'Intocable por 4 s', secs: 4 },
};
// la recarga más corta (se suma), hasta HAB_CD_MIN de la de fábrica
export const HAB_UP = { gris: { id: 'resuello', name: 'Resuello', cd: 0.15 }, oro: { id: 'aire', name: 'Segundo aire', cd: 0.3 } };
export const HAB_CD_MIN = 0.45;
// el especialista de un mate tuyo (se le pide a core/armas.js por D.espDe)
export const ESP_TIER = 'oro';

// Lo que dice cada carta debajo del nombre: pocas palabras (regla del usuario:
// textos cortos). Los mates lo sacan de cómo tiran (gunHint).
const PERK_FX = {
  jugg: 'El doble de vida',
  revive: 'Te levantás solo',
  speed: 'Recargás al doble',
  doubletap: 'Cada bala sale doble',
  mule: 'Un tercer mate',
  deadshot: 'Más daño a la cabeza',
  phd: 'Las explosiones no te tocan',
  stamin: 'Corrés más',
  cherry: 'Descarga al recargar',
  wish: 'Cinco segundos inmortal',
  dragon: 'Dos golpes seguidos: llamarada',
  aqua: 'Nadás y aguantás el aire',
  maiz: 'Las bajas dejan pasto para esconderte',
};
const EMP_FX = {
  carne: 'Apuntás al doble',
  caprese: 'Tirás corriendo',
  tucumana: 'Manos rápidas',
  picante: 'Tu fuego no te quema',
  saltena: 'Facón x5',
  jyq: 'Sin recargar',
  humita: 'No te ven (2 usos)',
  fugazzeta: 'Llamarada al recibir',
  cordero: 'Una munición máxima',
  jabali: 'Ciegos 30 s',
  cabrito: 'Todo a la cabeza',
};
const KIND_NAME = { perk: 'Perk', gun: 'Mate', pap: 'Pack-a-Pava', emp: 'Empanada', vida: 'Vida', mej: 'Mejora', hab: 'Habilidad', habup: 'Habilidad', esp: 'Especialista' };

export function gunHint(id, up = 0) {
  const s = weaponStats(id, up);
  if (s.pellets > 1) return 'Escopeta';
  const k = s.kind;
  if (k === 'chain') return 'Rayo en cadena';
  if (k === 'freeze') return 'Congela';
  if (k === 'blast') return 'Onda expansiva';
  if (k === 'stream') return 'Chorro hirviendo';
  if (k === 'bolt') return 'Ballesta';
  if (k === 'projectile') return 'Lanzador';
  if (s.akimbo) return 'Uno en cada mano';
  if (s.auto) return (s.mag || 0) >= 75 ? 'Ametralladora' : 'Automático';
  return (s.rpm || 0) < 100 ? 'Francotirador' : 'Semiautomático';
}

// El mazo de un jugador: lo que le dieron las cartas (y el mate de arranque).
export function newDeck(startId) {
  // (mej: [{ id, tier, v }]; hab: la habilidad; habUp: cuánto se le acortó la
  // recarga; esp: los mates con su especialista; espDe(id): lo pone bossRush)
  return { perks: [], guns: [{ id: startId, up: 0, base: true }], emps: [], hat: 0, picks: [], mej: [], hab: null, habUp: 0, esp: [] };
}

const slotsOf = (D) => (D.perks.includes('mule') ? 3 : 2);
// ¿Entra un mate más? (lleno, se cambia el de arranque si sigue sin mejorar)
function gunRoom(D) {
  if (D.guns.length < slotsOf(D)) return true;
  return D.guns.some((x) => x.base && !tierOf(x.up));
}

// Una carta como la ve la pantalla: { kind, id, up, tier, key, kindName, name, fx }.
export function describe(c) {
  const out = { ...c, kindName: KIND_NAME[c.kind] };
  if (c.kind === 'perk') {
    out.name = PERKS[c.id]?.name || c.id;
    out.fx = PERK_FX[c.id] || '';
  } else if (c.kind === 'gun') {
    out.name = weaponStats(c.id, c.up || 0).name;
    // ("Nueva arma" sin lugar: dice a cuál reemplaza; dealArmas)
    out.fx = c.replace ? `Reemplaza a tu ${weaponStats(c.replace, c.replaceUp || 0).name}` : gunHint(c.id, c.up || 0);
  } else if (c.kind === 'pap') {
    const S = weaponStats(c.id, c.up);
    if (c.up >= 2 && c.from === 1) {
      // (la segunda pasada: el elemento; el nombre ya lo trae: "X · Brasa")
      out.kindName = 'Elemento';
      out.name = S.name;
      out.fx = `Tu mate ${ELEM_INFO[WEAPONS[c.id].pap.elem]?.desc || ''}`.trim();
    } else {
      out.name = S.name;
      out.fx = `Tu ${weaponStats(c.id, 0).name}`;
    }
  } else if (c.kind === 'emp') {
    out.name = EMPANADA[c.id]?.name || c.id;
    out.fx = EMP_FX[c.id] || '';
  } else if (c.kind === 'vida') {
    out.name = c.label || c.id;
    out.fx = `+${c.hp} de vida`;
  } else if (c.kind === 'mej') {
    const M = MEJORAS[c.id];
    const R = RAROS[c.id];
    // (la de oro de una que también sale gris, con "II": el usuario, 2026-10-13,
    // de las dos con el mismo nombre: "no me gusta eso")
    out.name = M ? (c.tier === 'oro' && M.gris != null ? `${M.name} II` : M.name) : R?.name || c.id;
    out.fx = M ? M.fx(M[c.tier] ?? M.gris) : R?.fx || '';
  } else if (c.kind === 'hab') {
    out.name = HABILIDADES[c.id]?.name || c.id;
    out.fx = HABILIDADES[c.id]?.fx || '';
  } else if (c.kind === 'habup') {
    const U = HAB_UP[c.tier] || HAB_UP.gris;
    out.name = U.name;
    out.fx = `Tu habilidad vuelve ${pc(U.cd)} antes`;
  } else if (c.kind === 'esp') {
    out.name = c.label || c.id;
    out.fx = c.txt || '';
  }
  return out;
}

// Lo apilado de una mejora en el mazo.
export const sumaMej = (D, id) => (D.mej || []).reduce((a, x) => a + (x.id === id ? x.v : 0), 0);

// Lo que se podría ofrecer de un tier y una clase, con el mazo de ahora.
function options(tier, kind, D, seen, again = false) {
  // (D.pozo: el del Boss Rush Mayhem, core/rushMayhem.js POZO_MAYHEM)
  const P = (D.pozo || POZO)[tier];
  const out = [];
  if (kind === 'perk') for (const id of P.perk || []) if (PERKS[id] && !D.perks.includes(id)) out.push({ kind, id });
  if (kind === 'gun' && gunRoom(D) && !D.armaAparte) for (const id of P.gun || []) if (WEAPONS[id] && !D.guns.some((x) => x.id === id)) out.push({ kind, id, up: 0 });
  if (kind === 'pap' && P.pap) for (const x of D.guns) if (!tierOf(x.up) && maxTier(x.id) >= 1) out.push({ kind, id: x.id, up: 1, from: 0 });
  if (kind === 'pap2' && P.pap2) for (const x of D.guns) if (!tierOf(x.up) && maxTier(x.id) >= 2) out.push({ kind: 'pap', id: x.id, up: 2, from: 0 });
  if (kind === 'elem' && P.elem) for (const x of D.guns) if (tierOf(x.up) === 1 && maxTier(x.id) >= 2) out.push({ kind: 'pap', id: x.id, up: 2, from: 1 });
  // (las empanadas se juntan en la canasta: core/bossRush.js las va dando de a una)
  if (kind === 'emp' && D.emps.length < EMP_MAX) for (const id of P.emp || []) if (EMPANADA[id] && !D.emps.includes(id)) out.push({ kind, id });
  // (up: cuánta lleva, para que la próxima sea otra carta)
  if (kind === 'vida') for (const [id, label, hp] of P.vida || []) out.push({ kind, id, label, up: D.hat, hp });
  // las mejoras: las que se apilan, hasta su tope (up: cuántas llevás, para
  // que vuelvan a salir); las prismáticas, una vez
  const mej = D.mej || [];
  if (kind === 'mej') {
    for (const id of P.mej || []) {
      if (MEJORAS[id] && tier !== 'prisma' && !(TOPE[id] != null && sumaMej(D, id) + MEJORAS[id][tier] > TOPE[id] + 1e-6)) out.push({ kind, id, up: mej.filter((x) => x.id === id).length });
      // (las de en línea, con compañeros: D.equipo lo pone bossRush; sin él, nunca)
      // (una vez cada una; las prismáticas, y la del escudo, de oro: RAROS.escudo)
      else if (RAROS[id] && tier === (RAROS[id].tier || 'prisma') && !mej.some((x) => x.id === id) && !(id === 'escudo' && globalThis.__mduRushSinEscudo === true) && !(RAROS[id].online && !(D.equipo?.() > 0)) && !(RAROS[id].tecla && globalThis.__mduRushSinPoderes === true)) out.push({ kind, id });
    }
  }
  if (kind === 'hab' && !D.hab) for (const id of P.hab || []) if (HABILIDADES[id]) out.push({ kind, id });
  if (kind === 'habup' && P.habup && D.hab && HAB_UP[tier] && (D.habUp || 0) + HAB_UP[tier].cd <= 1 - HAB_CD_MIN + 1e-6) out.push({ kind, id: HAB_UP[tier].id, up: Math.round((D.habUp || 0) * 100) });
  if (kind === 'esp' && P.esp && D.espDe) {
    for (const x of D.guns) {
      const E = !(D.esp || []).includes(x.id) && D.espDe(x.id);
      if (E) out.push({ kind, id: x.id, label: E.name, txt: E.txt });
    }
  }
  return again ? out : out.filter((c) => !seen.has(keyOf(c)));
}

export const keyOf = (c) => `${c.kind}:${c.id}:${c.up || 0}`;
const KINDS0 = {
  gris: ['perk', 'gun', 'elem', 'emp', 'mej', 'habup', 'vida'],
  oro: ['perk', 'gun', 'pap', 'emp', 'mej', 'hab', 'habup', 'esp', 'vida'],
  prisma: ['perk', 'gun', 'pap2', 'emp', 'mej', 'hab', 'vida'],
};
const KINDS = new Proxy(KINDS0, { get: (o, t) => (viejo() ? o[t]?.filter((k) => !NUEVAS.has(k)) : o[t]) });

function pick(list, rnd) {
  return list[Math.floor(rnd() * list.length)];
}
// una de la lista según su peso
function pickW(list, w, rnd) {
  const tot = list.reduce((a, x) => a + w(x), 0);
  let r = rnd() * tot;
  for (const x of list) if ((r -= w(x)) <= 0) return x;
  return list[list.length - 1];
}

// Un set: una carta por cada tier de `tiers`, sin repetir clase en el set (si
// se puede) ni algo que ya salió en la partida (`seen`, se anota acá).
export function dealSet(tiers, D, seen, rnd = Math.random) {
  const used = new Set();
  const cards = [];
  for (const tier of tiers) {
    let c = null;
    // 1) una clase que todavía no está en el set; 2) cualquiera; 3) algo que
    // ya salió y no elegiste (con muchos sets el pozo se acaba). Si de su
    // tier no queda nada, lo del otro tier del mismo lado (oro ↔ prismático);
    // la vida (que se repite) recién después, de relleno, y una gris nunca
    // pasa a buena ni al revés (salvo que no quede nada de nada).
    const tryTier = (t, vida, fresh, again = false) => {
      const kinds = KINDS[t].filter((k) => (k === 'vida') === vida && (!fresh || !used.has(k === 'elem' || k === 'pap2' ? 'pap' : k)));
      const avail = kinds.map((k) => ({ k, l: options(t, k, D, seen, again).filter((x) => !cards.some((y) => keyOf(y) === keyOf(x))) })).filter((o) => o.l.length);
      if (!avail.length) return null;
      return { ...pick(pickW(avail, (o) => PESO_CLASE[o.k] ?? 1, rnd).l, rnd), tier: t };
    };
    const side = tier === 'gris' ? ['gris'] : tier === 'oro' ? ['oro', 'prisma'] : ['prisma', 'oro'];
    const other = tier === 'gris' ? ['oro'] : ['gris'];
    const stages = [...side.map((t) => [t, false]), ...side.map((t) => [t, true]), ...other.map((t) => [t, false]), ...other.map((t) => [t, true])];
    for (const [t, vida] of stages) {
      c = tryTier(t, vida, true) || tryTier(t, vida, false) || tryTier(t, vida, false, true);
      if (c) break;
    }
    if (!c) continue;
    used.add(c.kind);
    cards.push(c);
  }
  for (const c of cards) seen.add(keyOf(c));
  return cards.map(describe);
}

// ---- "Nueva arma" ----
// (el usuario, 2026-10-13: "Carta obligatoria nueva, 'Nueva arma': antes de
// las 3 cartas normales, una elección aparte entre 3 mates. Se elige PRIMERO,
// y las 3 cartas normales ya no traen mates y se arman según el mate elegido
// (que no salga, por ejemplo, el especialista del mate que tenías antes)").
// Con D.armaAparte (core/bossRush.js fresh) los sets de siempre no traen
// mates (options) y antes de cada tanda sale este: tres mates que no tenés,
// cada uno con su tier al azar (armaTiers).
// Sin lugar, el jugador elige cuál deja (el usuario, 2026-10-13: "elige el
// jugador a cuál reemplaza"): la carta lleva `elegir` y ui/RushCards.js
// muestra sus mates (dejables) para que elija; el Pack-a-Pava y el
// especialista del que deja se van con él (takeCard).
// globalThis.__mduReemplazoAuto = true: como antes (va en lugar del peor que
// llevás —el de arranque o el menos mejorado— y la carta lo dice).
// globalThis.__mduRushSinArma = true: como antes (los mates en los sets).
export const armaAparte = () => globalThis.__mduRushSinArma !== true && !viejo();
// La calidad de cada uno, al azar (el usuario, 2026-10-13: "que la calidad
// de las armas sea aleatoria, no siempre salga gris, dorada y prismática,
// todos elegirían la última siempre"): como sale cualquier carta del rush (la
// mitad grises; de las buenas, PRISMA_DE_BUENAS prismáticas), cada uno por su
// lado: pueden salir dos grises o tres de oro. El Mayhem trae las suyas
// (D.armaTiers, core/bossRush.js fresh: sin grises).
// globalThis.__mduArmaTierFijo = true: como antes (gris, oro, oro o prismático).
export const ARMA_TIERS = { gris: 0.5, oro: 0.5 * (1 - PRISMA_DE_BUENAS), prisma: 0.5 * PRISMA_DE_BUENAS };
function armaTiers(D, rnd) {
  if (globalThis.__mduArmaTierFijo === true) return ['gris', 'oro', rnd() < PRISMA_DE_BUENAS ? 'prisma' : 'oro'];
  const W = D.armaTiers || ARMA_TIERS;
  const ts = TIERS.filter((t) => W[t] > 0);
  return [0, 1, 2].map(() => pickW(ts, (t) => W[t], rnd));
}
const reemplazoAuto = () => globalThis.__mduReemplazoAuto === true;
function armaPeor(D) {
  if (D.guns.length < slotsOf(D)) return null;
  // (lo mejorado con el Pack-a-Pava pesa más que el tier; el de arranque, lo menos)
  const val = (x) => (tierOf(x.up) || 0) * 10 + (x.base ? 0 : 1 + ({ oro: 1, prisma: 2 }[x.tier] || 0));
  return D.guns.reduce((m, x) => (val(x) < val(m) ? x : m), D.guns[0]);
}
export function dealArmas(D, seen, rnd = Math.random) {
  const P = D.pozo || POZO;
  const out = [];
  const lleno = D.guns.length >= slotsOf(D);
  const peor = reemplazoAuto() ? armaPeor(D) : null;
  const elegir = lleno && !peor ? true : undefined;
  const free = (t) => (P[t]?.gun || []).filter((id) => WEAPONS[id] && !D.guns.some((x) => x.id === id) && !out.some((c) => c.id === id));
  for (const t of armaTiers(D, rnd)) {
    // (de su tier, lo que no salió todavía; si no, lo que salió; si no, de otro tier)
    for (const tt of [t, ...['oro', 'prisma', 'gris'].filter((x) => x !== t)]) {
      const l = free(tt);
      if (!l.length) continue;
      const fresh = l.filter((id) => !seen.has(keyOf({ kind: 'gun', id })));
      out.push({ kind: 'gun', id: pick(fresh.length ? fresh : l, rnd), up: 0, tier: tt, replace: peor?.id, replaceUp: peor?.up, elegir });
      break;
    }
  }
  for (const c of out) seen.add(keyOf(c));
  return out.map(describe);
}

// Los mates que llevás, como cartas, para elegir cuál dejás ("Nueva arma" sin
// lugar): el marco con su tier (o el de su Pack-a-Pava, si es más) y lo que se
// va con él.
export function dejables(D) {
  return D.guns.map((x) => {
    const up = x.up || 0;
    const pap = tierOf(up) || 0;
    const esp = (D.esp || []).includes(x.id);
    const fx = pap && esp ? 'Con su Pack-a-Pava y especialista' : pap ? 'Se va con su Pack-a-Pava' : esp ? 'Se va con su especialista' : gunHint(x.id, up);
    return { kind: 'gun', id: x.id, up, tier: TIERS[Math.max(pap, TIERS.indexOf(x.tier || 'gris'))], deja: true, kindName: 'Tu mate', name: weaponStats(x.id, up).name, fx };
  });
}

// Lo elegido, al mazo.
export function takeCard(D, c) {
  D.picks.push({ kind: c.kind, id: c.id, up: c.up || 0, tier: c.tier, hp: c.hp, label: c.label, from: c.from, txt: c.txt });
  if (c.kind === 'mej') {
    const M = MEJORAS[c.id];
    (D.mej ||= []).push({ id: c.id, tier: c.tier, v: M ? (M[c.tier] ?? M.gris) : 1 });
    // (el Heredero del caos trae el perk del caos de Eclipse, el Catalizador
    // Caótico, desde que se elige: el usuario, 2026-10-13. Solo si el mapa de
    // Eclipse está prendido, que es cuando el perk existe)
    if (c.id === 'heredero' && PERKS.catal && !D.perks.includes('catal')) D.perks.push('catal');
    return D;
  }
  if (c.kind === 'hab') D.hab = c.id;
  else if (c.kind === 'habup') D.habUp = (D.habUp || 0) + (HAB_UP[c.tier] || HAB_UP.gris).cd;
  else if (c.kind === 'esp') {
    if (!(D.esp ||= []).includes(c.id)) D.esp.push(c.id);
  }
  if (c.kind === 'perk') {
    if (!D.perks.includes(c.id)) D.perks.push(c.id);
  } else if (c.kind === 'gun') {
    if (D.guns.length >= slotsOf(D)) {
      // ("Nueva arma" sin lugar: el que eligió —o el que dice la carta—, y su
      // especialista se va con él; si llegara sin elegir, el peor)
      const i = c.replace ? D.guns.findIndex((x) => x.id === c.replace) : c.elegir ? D.guns.indexOf(armaPeor(D)) : D.guns.findIndex((x) => x.base && !tierOf(x.up));
      if (i >= 0) {
        const [old] = D.guns.splice(i, 1);
        if ((c.replace || c.elegir) && D.esp) D.esp = D.esp.filter((id) => id !== old.id);
      }
    }
    D.guns.push({ id: c.id, up: c.up || 0, tier: c.tier });
  } else if (c.kind === 'pap') {
    const x = D.guns.find((y) => y.id === c.id);
    if (x) x.up = Math.max(tierOf(x.up), c.up);
  } else if (c.kind === 'emp') {
    if (!D.emps.includes(c.id)) D.emps.push(c.id);
  }
  else if (c.kind === 'vida') D.hat += c.hp || 0;
  return D;
}

// La bolsa de tiers de la partida, ya repartida en sets de `per`.
// odd: para qué lado va la carta que sobra si el total es impar (1: buena).
export function tierBag(sets, per = 3, odd = 0, rnd = Math.random) {
  const n = sets * per;
  const goods = Math.floor(n / 2) + (n % 2 ? odd : 0);
  const fr = goods * PRISMA_DE_BUENAS;
  const prisma = Math.floor(fr) + (rnd() < fr - Math.floor(fr) ? 1 : 0);
  const mix = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  // las buenas: cuáles de oro y cuáles prismáticas
  const goodT = mix([...Array(goods - prisma).fill('oro'), ...Array(prisma).fill('prisma')]);
  const gray = n - goods;
  // cada set con una buena y una gris seguro (si alcanzan); el resto, mezclado
  const sure = per >= 2 ? Math.min(sets, goods, gray) : 0;
  const rest = mix([...Array(goods - sure).fill('g'), ...Array(gray - sure).fill('b')]);
  const out = [];
  for (let s = 0; s < sets; s++) {
    const set = s < sure ? ['g', 'b'] : [];
    while (set.length < per) set.push(rest.pop());
    out.push(mix(set).map((x) => (x === 'g' ? goodT.pop() : 'gris')));
  }
  return mix(out);
}
