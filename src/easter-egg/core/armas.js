// La armería mejorada (el usuario, 2026-10-12): cada mate de la armería sube
// de nivel con las bajas que hace (también mejorado en la Pack-a-Pava), y con
// el nivel se abren lugares para accesorios (un plus chico, sin contras) y, en
// el último, la mejora de especialista propia de ese mate (no ocupa lugar y se
// prende y apaga en la armería). Los camuflajes siguen yendo por el nivel del
// jugador (weapons/camos.js).
//
// Los datos viven en el perfil (core/progress armasData: { [mate]: { xp,
// acc: [ids], espOff } }), así viajan con la copia de seguridad. `xp` es el
// total juntado; el nivel sale de ahí.
//
// Los modelos de los accesorios: weapons/accesorios.js. La pantalla:
// ui/Armory.js. El aviso en la partida: ui/armeriaAviso.js.
//
// __mduSinAccesorios = true: ni efectos, ni modelos, ni puntos (como antes).

import * as P from './progress';
import { WEAPONS } from '../config/weapons';
import { CAMOABLE } from '../weapons/camos';
import { keyOf } from './controls';

// ---------------- los números (para tocar) ----------------
export const ARMERIA = {
  // el último nivel que da algo (accesorios, lugares, especialista); después
  // se sigue subiendo hasta `tope` sin premio (el usuario, 2026-10-13: "que
  // puedan subir hasta 999"; __mduArmasTope20 = true: tope en el 20, como antes)
  max: 20,
  tope: 999,
  // puntos por baja con ese mate (cuenta también mejorado); a la cabeza, un poco más
  baja: 1,
  cabeza: 1.25,
  // puntos para pasar del nivel n al n + 1: base + paso × n (redondeado a 10).
  // Del 1 al 20 son ~7.200: una partida larga (~30 rondas) trae ~1.500
  // muertos solo; con el mate como principal (~60 % de las bajas, un tercio a
  // la cabeza) son ~970 puntos: unas 7 u 8 partidas largas ("un poquito más
  // rápido" que 10, el usuario, 2026-10-12).
  base: 120,
  paso: 26,
  // en qué nivel se abre cada lugar para accesorios (el largo es el tope)
  lugares: [3, 8, 14],
  // en qué nivel sale el especialista (no ocupa lugar)
  especialista: 20,
  // qué bajas cuentan (no el cuchillo, ni las trampas, ni las bombas atómicas).
  // 'burn': las quemaduras que dejó el tiro, para el mate que las prendió (el
  // usuario, 2026-10-12; __mduSinQuemaduras: no cuentan)
  tipos: ['bullet', 'explosive', 'burn'],
  // la baja de un jefe vale más (el usuario, 2026-10-12)
  jefe: 10,
  // en qué niveles salen los ocho accesorios de cada categoría (el usuario, 2026-10-12)
  niveles: [2, 4, 6, 8, 10, 12, 15, 18],
  // el Lanzapava del Mate 47 (su especialista). El usuario, 2026-10-13: "que
  // tenga daño para matar de una a los zombies hasta ronda 20 aprox y que en
  // lugar de darte por kills que te de por max ammo y tengas 4 en la reserva".
  // tiros: los cargados; reserva: los de repuesto (se llenan con el Max Ammo).
  // danio: fijo, en el centro de la explosión (la vida de un muerto común es
  // 2.710 en la ronda 20 y 2.981 en la 21: config/rules zombieHealth; al borde
  // pega el 40 %, como toda explosión). Ese es el tope: no crece con la ronda.
  // bajas: lo de antes (__mduSinEspecialistas: vuelve uno cada 8 bajas, sin
  // reserva, y pega 400 + 40 por ronda como la bomba de yerba).
  lanzapava: { tiros: 2, reserva: 4, danio: 2750, bajas: 8 },
};

// Los números de los especialistas de la segunda vuelta (el usuario los
// aprobó el 2026-10-12: "que no den invencibilidad" y "nada a medio hacer").
// Lo que hacen: especial() (lo fijo, sobre las estadísticas) y
// weapons/especialistas.js (lo que pasa en la partida).
// __mduSinEspecialistas = true: solo los dos de antes (Último sorbo y Lanzapava).
export const ESP = {
  // las últimas balas del cargador pegan por mult (con estela dorada)
  ultimoSorbo: { balas: 3, mult: 2 },
  // cada baja a la cabeza pasa balas de la reserva al cargador (no crea balas)
  bendicion: { balas: 1 },
  // dos balas por gatillo (gastan una del cargador: el usuario, 2026-10-13), cadencia y patada
  // (cabeza: +25 % a la cabeza, el usuario 2026-10-13; __mduSorboViejo = true: sin eso)
  dobleSorbo: { balas: 2, gasta: 1, cadencia: -0.35, retroceso: 0.6, cabeza: 0.25 },
  // si el tiro mata, el siguiente sale a los `espera` s (sin el cerrojo)
  cerrojo: { espera: 0.12 },
  // apuntando, las dos bombillas juntas: el doble de perdigones y de patada
  lasDos: { balas: 2, retroceso: 1 },
  // de cadera, con el gatillo apretado, bombea solo (dispersión +15 %: el usuario, 2026-10-13)
  bombeo: { cadencia: 0.4, dispersion: 0.15 },
  // no apunta: de cadera más junto y se camina más rápido
  trilladora: { dispersion: 0.35, movimiento: 0.08 },
  // la bala atraviesa a `mas` muertos más que el mate, y a cada uno que
  // atraviesa le queda `queda` del daño: 100 %, 50 %, 25 % (el usuario, 2026-10-13,
  // en lugar de "Agua hirviendo")
  chorro: { mas: 2, queda: 0.5 },
  // la bala que pega en pared o piso rebota una vez, con menos daño y hasta `metros`
  deGoma: { danio: 0.5, metros: 15 },
  // ráfaga de `balas`; entre ráfaga y ráfaga, `pausa` s (daño +15 %: el usuario, 2026-10-13)
  rafaga: { balas: 4, dispersion: 0.25, alcance: 0.2, danio: 0.15, pausa: 0.2 },
  // con el clic derecho tiran los dos mates juntos (gastan dos); cargador y
  // reserva +25 % (el usuario, 2026-10-13)
  losDos: { balas: 2, cargador: 0.25, reserva: 0.25 },
  // cada `cada` tiros, el siguiente es una bala cuchilla: a los muertos
  // comunes los mata, atraviesa a `atraviesa` más sin perder daño, y a los
  // jefes y minijefes les pega `jefes` veces la bala normal (el usuario,
  // 2026-10-13, en lugar del "Eco de virola")
  cuchilla: { cada: 15, atraviesa: 2, jefes: 5 },
  // la cornada (la V): embestida de `metros`, voltea a `max` de adelante
  // (hasta `alcance` m) por `volteo` s. Una cada `recarga` s (en el medio la V
  // es el cuchillo de siempre); al mismo muerto, no otra vez hasta `otraVez` s
  // después de levantarse. Los jefes y los bichos especiales no se voltean.
  cornada: { metros: 2, alcance: 2.6, volteo: 1.5, recarga: 6, max: 4, otraVez: 8 },
  // el `tiros`.º tiro seguido al mismo muerto lo prende fuego `segundos` (seguido:
  // sin pegarle a otro y sin más de `hueco` s entre uno y otro)
  brasa: { tiros: 5, segundos: 3, hueco: 1.2 },
  // sin recarga: tira de la reserva. Cada tiro calienta 1; a `tiros` se recalienta
  // y para `pausa` s. Sin tirar, a los `espera` s se enfría `enfria` por segundo.
  termo: { tiros: 100, pausa: 3, enfria: 25, espera: 0.6 },
  // a los `espera` s de tirar seguido, la cadencia sube hasta soltar; cargador
  // y reserva +15 % (el usuario, 2026-10-13)
  rebato: { espera: 2, cadencia: 0.2, cargador: 0.15, reserva: 0.15 },
  // la baja revienta en un vacío de `radio` m que pega `danio` del golpe que la
  // mató a los de al lado (lo que mata el vacío no revienta otra vez)
  desgarro: { radio: 2, danio: 0.25 },
  // el saquito adormece `segundos` (camina a `lento`); el mismo muerto no se
  // vuelve a adormecer hasta `otraVez` s después de despertarse. Los jefes, no.
  tilo: { segundos: 2, lento: 0.5, otraVez: 6 },
  // con la bombilla en el aire o clavada, el gatillo la revienta ahí nomás
  voluntad: {},
  // manteniendo el gatillo se cargan hasta `max` (una cada `carga` s) y salen
  // juntas en abanico (`abanico` rad entre una y otra); juntas, cada una pega
  // `danio` más (el usuario, 2026-10-13: "útil para jefes")
  salva: { max: 4, carga: 0.3, abanico: 0.07, danio: 0.25 },
};

// Las categorías y qué mate va en cada una (los nuevos que no estén acá se
// clasifican solos por sus números: derivar).
export const CATEGORIAS = {
  pistola: 'Pistola',
  escopeta: 'Escopeta',
  subfusil: 'Subfusil',
  fusil: 'Fusil',
  ametralladora: 'Ametralladora',
  tirador: 'De precisión',
  explosivo: 'Explosivo',
};
const CATEGORIA = {
  porongo: 'pistola',
  caballero: 'pistola',
  madera: 'tirador',
  torpedo: 'tirador',
  plastico: 'escopeta',
  lata: 'escopeta',
  labrador: 'escopeta',
  vidrio: 'subfusil',
  silicona: 'subfusil',
  algarrobo: 'subfusil',
  gemelos: 'subfusil',
  imperial: 'fusil',
  asta: 'fusil',
  mate47: 'fusil',
  llamarada: 'fusil',
  camionero: 'ametralladora',
  campanario: 'ametralladora',
  caotico: 'ametralladora',
  cocido: 'explosivo',
  bombillazo: 'explosivo',
  explosivo: 'explosivo',
};
function derivar(w) {
  if (!w) return 'pistola';
  if (w.pellets > 1) return 'escopeta';
  if (w.projectile || w.bolt || w.kind === 'projectile' || w.kind === 'bolt') return 'explosivo';
  if (w.auto && w.mag >= 75) return 'ametralladora';
  if (w.auto && (w.rpm >= 750 || w.range <= 55)) return 'subfusil';
  if (w.auto) return 'fusil';
  if (w.damage >= 500 || w.scope) return 'tirador';
  return 'pistola';
}
export const categoria = (id) => CATEGORIA[id] || derivar(WEAPONS[id]);

// Las partes del mate donde va un accesorio (dos en la misma parte no se
// pueden: así no se pisan a la vista).
export const PARTES = { bombilla: 'Bombilla', pico: 'Pico', virola: 'Virola', cuerpo: 'Cuerpo', yerba: 'Yerba' };

// Los accesorios. fx: lo que mejoran (multiplica la estadística del mate):
//   alcance (range), cargador (mag, al menos +1), recarga (reload: menos es
//   mejor; en el de Lata, cada cartucho), dispersion, retroceso, reserva,
//   cabeza (headMult), apuntar (lo rápido que sube la mira), movimiento (con el
//   mate en la mano), cadencia (rpm), radio (de la explosión), velocidad (del
//   proyectil), impacto (el daño del proyectil).
// por: otro efecto para un mate puntual { mate: { fx, txt } }.
// txt: lo que dice la armería (corto). Los modelos: weapons/accesorios.js.
export const ACCESORIOS = {
  // pistola
  bombillaLarga: { name: 'Bombilla larga cincelada', parte: 'bombilla', fx: { alcance: 0.15 }, txt: 'Alcance +15%' },
  yerbaColmada: { name: 'Yerba colmada con palo', parte: 'yerba', fx: { cargador: 0.15 }, txt: 'Cargador +15%' },
  tiento: { name: 'Tiento trenzado', parte: 'cuerpo', fx: { recarga: 0.1 }, txt: 'Recarga 10% más rápida' },
  virolaPampa: { name: 'Virola de alpaca con guarda pampa', parte: 'virola', fx: { apuntar: 0.12 }, txt: 'Apuntar 12% más rápido' },
  picoLoro: { name: 'Pico de loro de bronce', parte: 'pico', fx: { retroceso: 0.12 }, txt: 'Retroceso −12%' },
  bombillaResorte: { name: 'Bombilla de resorte', parte: 'bombilla', fx: { dispersion: 0.1 }, txt: 'Dispersión −10%' },
  yerbaBarbacua: { name: 'Yerba barbacuá', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  fundaCarpincho: { name: 'Funda de carpincho', parte: 'cuerpo', fx: { movimiento: 0.05 }, txt: 'Movimiento +5%' },
  // escopeta
  bombillaCuchara: { name: 'Bombilla de cuchara', parte: 'bombilla', fx: { dispersion: 0.12 }, txt: 'Dispersión −12%' },
  picoChato: { name: 'Pico chato de bronce', parte: 'pico', fx: { retroceso: 0.15 }, txt: 'Retroceso −15%' },
  virolaAsta: { name: 'Virola de asta', parte: 'virola', fx: { apuntar: 0.12 }, txt: 'Apuntar 12% más rápido' },
  // (en el de Plástico, con cargador de 2, el cargador se cambia por reserva: el usuario, 2026-10-12)
  // (y en vez de reserva, que ya la daba la peperina: tiro a la cabeza; el usuario, 2026-10-13)
  yerbaGruesa: { name: 'Yerba de molienda gruesa', parte: 'yerba', fx: { cargador: 0.15 }, txt: 'Cargador +15%', por: { plastico: { fx: { cabeza: 0.1 }, txt: 'Tiro a la cabeza +10%' } } },
  lonjaCruda: { name: 'Lonja de cuero crudo', parte: 'cuerpo', fx: { recarga: 0.1 }, txt: 'Recarga 10% más rápida' },
  bombillaTacuara: { name: 'Bombilla de caña tacuara', parte: 'bombilla', fx: { alcance: 0.15 }, txt: 'Alcance +15%' },
  yerbaPeperina: { name: 'Yerba con peperina', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  manijaTiento: { name: 'Manija de tiento', parte: 'cuerpo', fx: { movimiento: 0.06 }, txt: 'Movimiento +6%' },
  // subfusil
  bombillaAlpaca: { name: 'Bombilla de alpaca lisa', parte: 'bombilla', fx: { dispersion: 0.1 }, txt: 'Dispersión −10%' },
  picoLoroAlpaca: { name: 'Pico de loro', parte: 'pico', fx: { retroceso: 0.12 }, txt: 'Retroceso −12%' },
  virolaPlata: { name: 'Virola fina de plata', parte: 'virola', fx: { apuntar: 0.15 }, txt: 'Apuntar 15% más rápido' },
  yerbaDespalada: { name: 'Yerba despalada', parte: 'yerba', fx: { cargador: 0.15 }, txt: 'Cargador +15%' },
  tientoCosido: { name: 'Tiento cosido', parte: 'cuerpo', fx: { recarga: 0.1 }, txt: 'Recarga 10% más rápida' },
  picoSilbador: { name: 'Pico silbador', parte: 'pico', fx: { cadencia: 0.05 }, txt: 'Cadencia +5%' },
  yerbaCedron: { name: 'Yerba compuesta con cedrón', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  fundaVaqueta: { name: 'Funda de vaqueta', parte: 'cuerpo', fx: { movimiento: 0.06 }, txt: 'Movimiento +6%' },
  // fusil
  bombillaLargaAlpaca: { name: 'Bombilla larga de alpaca', parte: 'bombilla', fx: { alcance: 0.15 }, txt: 'Alcance +15%' },
  picoCompensador: { name: 'Pico compensador de bronce', parte: 'pico', fx: { retroceso: 0.12 }, txt: 'Retroceso −12%' },
  virolaSol: { name: 'Virola cincelada con sol', parte: 'virola', fx: { cabeza: 0.1 }, txt: 'Tiro a la cabeza +10%' },
  yerbaPalo: { name: 'Yerba con palo', parte: 'yerba', fx: { cargador: 0.15 }, txt: 'Cargador +15%' },
  fajaTiento: { name: 'Faja de tiento', parte: 'cuerpo', fx: { recarga: 0.1 }, txt: 'Recarga 10% más rápida' },
  bombillaFiltro: { name: 'Bombilla de filtro fino', parte: 'bombilla', fx: { dispersion: 0.1 }, txt: 'Dispersión −10%' },
  virolaHueso: { name: 'Virola con muesca de hueso', parte: 'virola', fx: { apuntar: 0.12 }, txt: 'Apuntar 12% más rápido' },
  yerbaEstacionada: { name: 'Yerba estacionada', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  // ametralladora
  bombillaGruesa: { name: 'Bombilla gruesa larga', parte: 'bombilla', fx: { alcance: 0.12 }, txt: 'Alcance +12%' },
  picoMacizo: { name: 'Pico de bronce macizo', parte: 'pico', fx: { retroceso: 0.15 }, txt: 'Retroceso −15%' },
  virolaAncha: { name: 'Virola ancha de alpaca', parte: 'virola', fx: { apuntar: 0.15 }, txt: 'Apuntar 15% más rápido' },
  yerbaKilo: { name: 'Yerba de kilo', parte: 'yerba', fx: { cargador: 0.15 }, txt: 'Cargador +15%' },
  fajaHebilla: { name: 'Faja con hebilla', parte: 'cuerpo', fx: { movimiento: 0.08 }, txt: 'Movimiento +8%' },
  bombillaFiltroDoble: { name: 'Bombilla de filtro doble', parte: 'bombilla', fx: { dispersion: 0.1 }, txt: 'Dispersión −10%' },
  yerbaCompactada: { name: 'Yerba compactada', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  manijaTientoR: { name: 'Manija de tiento', parte: 'cuerpo', fx: { recarga: 0.1 }, txt: 'Recarga 10% más rápida', modelo: 'manijaTiento' },
  // de precisión
  bombillaPlata: { name: 'Bombilla larga de plata', parte: 'bombilla', fx: { alcance: 0.15 }, txt: 'Alcance +15%' },
  virolaAlza: { name: 'Virola con alza de hueso', parte: 'virola', fx: { apuntar: 0.15 }, txt: 'Apuntar 15% más rápido' },
  picoAsta: { name: 'Pico de asta', parte: 'pico', fx: { retroceso: 0.15 }, txt: 'Retroceso −15%' },
  virolaAcanto: { name: 'Virola cincelada', parte: 'virola', fx: { cabeza: 0.12 }, txt: 'Tiro a la cabeza +12%' },
  // explosivo
  bombillaBocaAncha: { name: 'Bombilla de boca ancha', parte: 'bombilla', fx: { radio: 0.12 }, txt: 'Radio de la explosión +12%' },
  picoCohete: { name: 'Pico de cohete', parte: 'pico', fx: { velocidad: 0.15 }, txt: 'Proyectil 15% más rápido' },
  virolaBronce: { name: 'Virola de bronce', parte: 'virola', fx: { apuntar: 0.12 }, txt: 'Apuntar 12% más rápido' },
  yerbaPolvora: { name: 'Yerba con pólvora', parte: 'yerba', fx: { reserva: 0.15 }, txt: 'Reserva +15%' },
  bombillaReforzada: { name: 'Bombilla reforzada', parte: 'bombilla', fx: { impacto: 0.08 }, txt: 'Daño del impacto +8%' },
  yerbaPrensada: { name: 'Yerba prensada', parte: 'yerba', fx: { recarga: 0.08 }, txt: 'Recarga 8% más rápida' },
  fajaCuero: { name: 'Faja de cuero', parte: 'cuerpo', fx: { movimiento: 0.06 }, txt: 'Movimiento +6%' },
};

// Qué accesorios tiene cada categoría; salen en ese orden, en los niveles de
// ARMERIA.niveles (gratis).
const ORDEN = {
  pistola: ['bombillaLarga', 'yerbaColmada', 'tiento', 'virolaPampa', 'picoLoro', 'bombillaResorte', 'yerbaBarbacua', 'fundaCarpincho'],
  escopeta: ['bombillaCuchara', 'picoChato', 'virolaAsta', 'yerbaGruesa', 'lonjaCruda', 'bombillaTacuara', 'yerbaPeperina', 'manijaTiento'],
  subfusil: ['bombillaAlpaca', 'picoLoroAlpaca', 'virolaPlata', 'yerbaDespalada', 'tientoCosido', 'picoSilbador', 'yerbaCedron', 'fundaVaqueta'],
  fusil: ['bombillaLargaAlpaca', 'picoCompensador', 'virolaSol', 'yerbaPalo', 'fajaTiento', 'bombillaFiltro', 'virolaHueso', 'yerbaEstacionada'],
  ametralladora: ['bombillaGruesa', 'picoMacizo', 'virolaAncha', 'yerbaKilo', 'fajaHebilla', 'bombillaFiltroDoble', 'yerbaCompactada', 'manijaTientoR'],
  tirador: ['bombillaPlata', 'virolaAlza', 'picoAsta', 'yerbaColmada', 'tiento', 'virolaAcanto', 'yerbaBarbacua', 'fundaVaqueta'],
  explosivo: ['bombillaBocaAncha', 'picoCohete', 'virolaBronce', 'yerbaPolvora', 'tiento', 'bombillaReforzada', 'yerbaPrensada', 'fajaCuero'],
};
export const LISTA = Object.fromEntries(Object.entries(ORDEN).map(([c, ids]) => [c, ids.map((a, i) => [a, ARMERIA.niveles[i]])]));

// El accesorio para ese mate (con su efecto propio, si lo tiene).
export function accDe(acc, mate) {
  const A = ACCESORIOS[acc];
  if (!A) return null;
  const p = A.por?.[mate];
  return p ? { ...A, ...p } : A;
}

// El especialista de cada mate: más fuerte que un accesorio, sin romperlo.
// (se aplica en aplicar(), según su id)
export const ESPECIALISTA = {
  porongo: { id: 'ultimoSorbo', name: 'Último sorbo', txt: 'Las 3 últimas balas pegan el doble' },
  // (aprobado por el usuario, 2026-10-12: weapons/lanzapava.js; txt lleva la tecla que eligió)
  mate47: { id: 'lanzapava', name: 'Lanzapava', txt: 'Lanzagranadas de 2 tiros' },
  // la segunda vuelta (el usuario, 2026-10-12; números en ESP)
  caballero: { id: 'bendicion', name: 'Bendición del alba', txt: 'Baja a la cabeza: una bala de la reserva al cargador' },
  madera: { id: 'dobleSorbo', name: 'Doble sorbo', txt: 'Dos balas por gatillo, +25% a la cabeza' },
  torpedo: { id: 'cerrojo', name: 'Cerrojo al vuelo', txt: 'Si mata, el siguiente sale enseguida' },
  plastico: { id: 'lasDos', name: 'Las dos de una', txt: 'Apuntando, las dos bombillas juntas' },
  lata: { id: 'bombeo', name: 'Bombeo a mano', txt: 'De cadera, bombea solo' },
  labrador: { id: 'trilladora', name: 'Trilladora', txt: 'Sin mira: más junto y más rápido' },
  vidrio: { id: 'chorro', name: 'Chorro a presión', txt: 'Atraviesa a dos más' },
  silicona: { id: 'deGoma', name: 'De goma', txt: 'La bala rebota una vez' },
  algarrobo: { id: 'rafaga', name: 'Ráfaga de cuatro', txt: 'Ráfagas de 4, más precisas' },
  gemelos: { id: 'losDos', name: 'Los dos a la vez', txt: 'Clic derecho: tiran los dos' },
  imperial: { id: 'cuchilla', name: 'Filo de alpaca', txt: 'Cada 15 tiros, una bala que corta' },
  asta: { id: 'cornada', name: 'Cornada', txt: 'Embestida que voltea' },
  llamarada: { id: 'brasa', name: 'Brasa que se junta', txt: 'Cinco seguidos al mismo: se prende' },
  camionero: { id: 'termo', name: 'Termo de ruta', txt: 'Sin recarga: se recalienta' },
  campanario: { id: 'rebato', name: 'Toque a rebato', txt: 'Tirando seguido, más cadencia' },
  caotico: { id: 'desgarro', name: 'Desgarro', txt: 'Las bajas revientan en vacío' },
  cocido: { id: 'tilo', name: 'Saquito de tilo', txt: 'El saquito adormece' },
  bombillazo: { id: 'voluntad', name: 'A voluntad', txt: 'Gatillo otra vez: revienta' },
  explosivo: { id: 'salva', name: 'Salva', txt: 'Mantené el gatillo: hasta 4 juntas' },
};
// (los dos de antes de la segunda vuelta: __mduSinEspecialistas deja solo estos)
const VIEJOS = new Set(['ultimoSorbo', 'lanzapava']);
export const sinNuevos = () => globalThis.__mduSinEspecialistas === true;

// ---------------- niveles ----------------
export const tieneNiveles = (id) => CAMOABLE.includes(id);
const off = () => globalThis.__mduSinAccesorios === true;

// Puntos para pasar del nivel n al n + 1.
const tope = () => (globalThis.__mduArmasTope20 === true ? ARMERIA.max : ARMERIA.tope);
export function need(n) {
  if (n >= tope()) return Infinity;
  // (pasado el 20, cada nivel cuesta lo mismo que el del 19 al 20)
  return Math.round((ARMERIA.base + ARMERIA.paso * Math.min(n, ARMERIA.max - 1)) / 10) * 10;
}
export const TOTAL = (() => {
  let s = 0;
  for (let n = 1; n < ARMERIA.max; n++) s += need(n);
  return s;
})();

// Del total juntado: { level, xp (dentro del nivel), need, max }.
export function nivelDe(total) {
  let left = Math.max(0, Math.floor(total || 0));
  let level = 1;
  while (level < ARMERIA.max && left >= need(level)) {
    left -= need(level);
    level++;
  }
  // (del 20 en adelante todos cuestan lo mismo: de una cuenta, sin recorrer 999)
  if (level >= ARMERIA.max && level < tope()) {
    const k = need(level);
    const n = Math.min(tope() - level, Math.floor(left / k));
    level += n;
    left -= n * k;
  }
  const max = level >= tope();
  return { level, xp: max ? 0 : left, need: max ? 0 : need(level), max };
}

// Cuántos lugares para accesorios hay en ese nivel.
export const lugares = (level) => ARMERIA.lugares.filter((l) => level >= l).length;

// Los datos de un mate, ordenados (lo que venga roto del perfil se ignora).
// Solo se anota en el perfil cuando hay algo que guardar (crear).
function dato(id, crear = true) {
  const all = P.armasData();
  let d = all[id];
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    d = { xp: 0, acc: [] };
    if (!crear) return d;
    all[id] = d;
  }
  d.xp = Math.max(0, Math.floor(+d.xp || 0));
  if (!Array.isArray(d.acc)) d.acc = [];
  d.acc = d.acc.filter((a) => typeof a === 'string' && ACCESORIOS[a]);
  return d;
}

export function estado(id) {
  const d = dato(id, false);
  return { ...nivelDe(d.xp), total: d.xp, cat: categoria(id) };
}

// La lista de su categoría: [{ id, ...accesorio, lvl, ok }].
export function lista(id) {
  const { level } = estado(id);
  return (LISTA[categoria(id)] || []).filter(([a]) => ACCESORIOS[a]).map(([a, lvl]) => ({ id: a, ...accDe(a, id), lvl, ok: level >= lvl }));
}

// Los que lleva puestos (solo los ganados, uno por parte, hasta los lugares
// que tiene): ids.
export function puestos(id) {
  if (!tieneNiveles(id)) return [];
  const d = dato(id, false);
  const { level } = nivelDe(d.xp);
  const ok = new Map(lista(id).filter((a) => a.ok).map((a) => [a.id, a]));
  const out = [];
  const partes = new Set();
  for (const a of d.acc) {
    const A = ok.get(a);
    if (!A || partes.has(A.parte) || out.length >= lugares(level)) continue;
    partes.add(A.parte);
    out.push(a);
  }
  return out;
}

// Lo que va en el modelo (en la mano, en la armería y en la de los compañeros).
// (más el Lanzapava del Mate 47 si tiene el especialista puesto: weapons/lanzapava.js)
export const modelo = (id) => {
  if (off()) return [];
  const out = puestos(id);
  if (id === 'mate47' && especialista(id)?.on) out.push('lanzapava');
  return out;
};

// Poner un accesorio: si ya hay uno en esa parte, lo reemplaza. Devuelve
// false si no se puede (bloqueado o sin lugar libre).
export function poner(id, acc) {
  const A = lista(id).find((a) => a.id === acc);
  if (!A?.ok) return false;
  const d = dato(id);
  const now = puestos(id);
  if (now.includes(acc)) return true;
  const same = now.find((a) => ACCESORIOS[a].parte === A.parte);
  const next = now.filter((a) => a !== same);
  if (next.length >= lugares(nivelDe(d.xp).level)) return false;
  d.acc = [...next, acc];
  P.saveArmas();
  return true;
}
export function sacar(id, acc) {
  const d = dato(id);
  d.acc = puestos(id).filter((a) => a !== acc);
  P.saveArmas();
}

// El especialista: { ...datos, ok (ganado), on (prendido) } o null.
export function especialista(id) {
  const E = ESPECIALISTA[id];
  if (!E || !tieneNiveles(id) || (sinNuevos() && !VIEJOS.has(E.id))) return null;
  const d = dato(id, false);
  const ok = nivelDe(d.xp).level >= ARMERIA.especialista;
  // (los de una tecla dicen cuál: la que eligió en Controles)
  const tecla = { lanzapava: 'lanzapava', cornada: 'knife' }[E.id];
  const txt = tecla ? `${(keyOf(tecla) || (tecla === 'knife' ? 'KeyV' : 'KeyN')).replace(/^Key|^Digit/, '')}: ${E.txt.toLowerCase()}` : E.txt;
  // (en el rush de jefes manda la partida, no la armería)
  if (porPartida) return { ...E, txt, ok: true, on: porPartida.has(id) };
  return { ...E, txt, ok, on: ok && !d.espOff };
}
export function prenderEspecialista(id, on) {
  const d = dato(id);
  if (on) delete d.espOff;
  else d.espOff = true;
  P.saveArmas();
}
// El rush de jefes (core/bossRush.js; el usuario, 2026-10-12: "que todos los
// mates arranquen sin accesorios de especialista" y una carta que te lo da):
// ids, los mates con el especialista prendido en esta partida, aunque no
// estén en el nivel; null, otra vez los de la armería. Los accesorios
// comunes no cambian.
let porPartida = null;
export function especialistasDePartida(ids) {
  porPartida = ids ? new Set(ids) : null;
  memo.clear();
}

// ---------------- en la partida ----------------
const memo = new Map();
P.on('change', () => memo.clear());

// Las estadísticas del mate con lo que lleva encima. st: la de
// weapons/config weaponStats (una copia nueva cada vez: se puede tocar).
// slot: { id, mag } (para el especialista que mira el cargador).
export function aplicar(st, slot) {
  if (!st || !slot || slot.temp || off() || !tieneNiveles(slot.id)) return st;
  // (se pide muchas veces por cuadro: lo puesto se guarda hasta que cambie el perfil)
  let c = memo.get(slot.id);
  if (!c) memo.set(slot.id, (c = { acc: puestos(slot.id), E: especialista(slot.id) }));
  const { acc, E } = c;
  if (!acc.length && !E?.on) return st;
  const out = { ...st };
  for (const a of acc) {
    const fx = accDe(a, slot.id).fx;
    if (fx.alcance && out.range) out.range *= 1 + fx.alcance;
    if (fx.cargador && out.mag > 0) out.mag = Math.max(out.mag + 1, Math.round(out.mag * (1 + fx.cargador)));
    if (fx.recarga && out.reload) out.reload *= 1 - fx.recarga;
    if (fx.dispersion && out.spread) {
      out.spread *= 1 - fx.dispersion;
      if (out.adsSpread) out.adsSpread *= 1 - fx.dispersion;
    }
    if (fx.retroceso && out.recoil) out.recoil *= 1 - fx.retroceso;
    if (fx.reserva && out.reserve > 0) out.reserve = Math.round(out.reserve * (1 + fx.reserva));
    if (fx.cabeza && out.headMult) out.headMult *= 1 + fx.cabeza;
    // (weapons/Weapons.js: lo rápido que sube la mira; entities/Player.js: moveMult)
    if (fx.apuntar) out.adsMult = (out.adsMult || 1) * (1 + fx.apuntar);
    if (fx.movimiento) out.moveMult = (out.moveMult || 1) * (1 + fx.movimiento);
    if (fx.cadencia && out.rpm) out.rpm *= 1 + fx.cadencia;
    // los explosivos: el proyectil, la bombilla que se clava o la explosión del tiro
    for (const k of ['projectile', 'bolt', 'explosive']) {
      if (!out[k] || !(fx.radio || fx.velocidad || fx.impacto)) continue;
      const o = (out[k] = { ...out[k] });
      if (fx.radio && o.radius) o.radius *= 1 + fx.radio;
      if (fx.velocidad && o.speed) o.speed *= 1 + fx.velocidad;
      if (fx.impacto && o.damage) o.damage *= 1 + fx.impacto;
    }
    if (fx.impacto && out.damage) out.damage *= 1 + fx.impacto;
  }
  if (E?.on) especial(E.id, out, slot);
  return out;
}

// Lo que hace cada especialista.
// (lo fijo: lo que pasa en la partida lo hace weapons/especialistas.js, que
// reconoce cada uno por st.esp)
function especial(id, st, slot) {
  st.esp = id;
  const N = ESP[id] || {};
  if (id === 'ultimoSorbo') {
    // (el que sale es uno de los 3 últimos del cargador: el doble, y la
    // estela dorada para que se note)
    if (slot.mag > 0 && slot.mag <= N.balas) {
      st.damage *= N.mult;
      if (st.projectile) st.projectile = { ...st.projectile, damage: st.projectile.damage * N.mult };
      st.tracer = 0xffc640;
    }
  } else if (id === 'dobleSorbo') {
    if (st.rpm) st.rpm *= 1 + N.cadencia;
    st.recoil *= 1 + N.retroceso;
    if (st.headMult && globalThis.__mduSorboViejo !== true) st.headMult *= 1 + N.cabeza;
  } else if (id === 'trilladora') {
    // (sin mira: el clic derecho no hace nada, weapons/Weapons wantAds noAds)
    st.noAds = true;
    st.spread *= 1 - N.dispersion;
    st.moveMult = (st.moveMult || 1) * (1 + N.movimiento);
  } else if (id === 'chorro') {
    // (weapons/Weapons hitscan: pen y penMult, lo que queda a cada atravesado)
    st.pen = (st.pen || 1) + N.mas;
    st.penMult = N.queda;
  } else if (id === 'rafaga') {
    st.spread *= 1 - N.dispersion;
    if (st.adsSpread) st.adsSpread *= 1 - N.dispersion;
    st.range *= 1 + N.alcance;
    st.damage *= 1 + N.danio;
  } else if (id === 'losDos' || id === 'rebato') {
    if (st.mag > 0) st.mag = Math.round(st.mag * (1 + N.cargador));
    if (st.reserve > 0) st.reserve = Math.round(st.reserve * (1 + N.reserva));
  }
}

// Los puntos de una baja (si cuenta). boss: un jefe vale ARMERIA.jefe.
export function puntos(type, zone, boss = false) {
  if (!cuenta(type)) return 0;
  if (boss && globalThis.__mduJefeComun !== true) return ARMERIA.jefe;
  return zone === 'head' ? ARMERIA.cabeza : ARMERIA.baja;
}
const cuenta = (type) => ARMERIA.tipos.includes(type || 'bullet') && !(type === 'burn' && globalThis.__mduSinQuemaduras === true);

// ¿Esta baja (o este tiro de un invitado) es del mate que tiene en la mano?
// Devuelve su id o null.
export function deQuien(g, type) {
  // (la quemadura es del mate que la prendió, no del que tiene en la mano: Zombies burnWp)
  if (off() || type === 'burn' || !cuenta(type)) return null;
  const s = g.weapons?.slot;
  return s && !s.temp && tieneNiveles(s.id) ? s.id : null;
}

// Una baja propia (entities/Zombies kill). wp: el mate que prendió el fuego
// (las quemaduras); boss: si era un jefe.
export function baja(g, type, zone, { wp = null, boss = false } = {}) {
  const id = type === 'burn' ? (!off() && cuenta(type) && wp && tieneNiveles(wp) ? wp : null) : deQuien(g, type);
  if (!id) return;
  sumar(g, { [id]: puntos(type, zone, boss) });
  for (const fn of bajaSubs) fn(id);
}
// (el Lanzapava junta sus tiros con las bajas del Mate 47)
const bajaSubs = new Set();
export const onBaja = (fn) => (bajaSubs.add(fn), () => bajaSubs.delete(fn));

// Suma puntos: { [mate]: puntos } (de invitado, los manda el anfitrión).
const subs = new Set();
export const onNivel = (fn) => (subs.add(fn), () => subs.delete(fn));
export function sumar(g, por, { red = false } = {}) {
  if (off() || g?.cheated || !por || typeof por !== 'object') return;
  let up = false;
  for (const [id, n] of Object.entries(por)) {
    if (!tieneNiveles(id) || !(n > 0) || n > 1000) continue;
    // (las bajas de un invitado llegan sumadas del anfitrión: más o menos una por punto)
    if (red) for (let i = 0; i < Math.min(30, Math.round(n)); i++) for (const fn of bajaSubs) fn(id);
    const d = dato(id);
    d.part = (d.part || 0) + n;
    const whole = Math.floor(d.part);
    d.part -= whole;
    if (!whole) continue;
    const before = nivelDe(d.xp).level;
    d.xp += whole;
    const after = nivelDe(d.xp).level;
    // lo de esta partida (el resumen del final: ui/Levels summary)
    const r = (RUN[id] ||= { from: before, pts: 0 });
    r.pts += whole;
    r.to = after;
    if (after <= before) continue;
    up = true;
    // lo que se ganó en esos niveles: accesorios, lugares y el especialista
    const news = [];
    for (let l = before + 1; l <= after; l++) {
      for (const [a, lvl] of LISTA[categoria(id)] || []) if (lvl === l && ACCESORIOS[a]) news.push(ACCESORIOS[a].name);
      if (ARMERIA.lugares.includes(l)) news.push('Lugar para accesorio');
      if (l === ARMERIA.especialista && ESPECIALISTA[id]) news.push(ESPECIALISTA[id].name);
    }
    for (const fn of subs) {
      try {
        fn({ id, level: after, news });
      } catch (e) {
        console.error(e);
      }
    }
  }
  P.saveArmas(up);
}

// ---------------- la partida ----------------
// Lo que subió cada mate en esta partida: { [mate]: { from, to, pts } }. Se
// limpia al empezar otra (ui/Levels newGame).
let RUN = {};
export function nuevaPartida() {
  RUN = {};
}
export function partida() {
  return Object.entries(RUN)
    .filter(([id, r]) => r.pts > 0 && WEAPONS[id])
    .map(([id, r]) => ({ id, name: WEAPONS[id].name, pts: r.pts, from: r.from, to: r.to ?? r.from }))
    .sort((a, b) => b.pts - a.pts);
}

// ---------------- lo nuevo ----------------
// Los accesorios ganados que todavía no se vieron en la armería (el "Nuevo"
// del botón, como los camuflajes; el usuario, 2026-10-12). Se guardan en el
// perfil: { [mate]: { visto: [ids] } }.
export function nuevos(id) {
  if (off() || !tieneNiveles(id)) return [];
  const d = dato(id, false);
  const seen = new Set(Array.isArray(d.visto) ? d.visto : []);
  return lista(id).filter((a) => a.ok && !seen.has(a.id)).map((a) => a.id);
}
export const cuantosNuevos = () => (off() ? 0 : CAMOABLE.reduce((n, id) => n + nuevos(id).length, 0));
export function verNuevos(id) {
  const fresh = nuevos(id);
  if (!fresh.length) return;
  const d = dato(id);
  d.visto = [...new Set([...(Array.isArray(d.visto) ? d.visto : []), ...fresh])];
  P.saveArmas();
}

// (pruebas y desarrollo) pone el total de un mate
export function _setXp(id, xp) {
  dato(id).xp = Math.max(0, xp | 0);
  P.saveArmas();
}
