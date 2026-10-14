// El rush de jefes (el usuario, 2026-10-12: "rush de jefes (en sus respectivas
// arenas con su respectiva música y mecánicas). Ganar da un logro, mucha exp y
// muchos pesos. Los mismos jefes son un poco más complicados que de normal.")
//
// La segunda vuelta (el usuario, el mismo día: "darle un giro de tuerca, que
// el orden de jefes sea aleatorio (aunque el final siempre el chiquitijuein) y
// que arranques medio pelado, te salen 3 sets de 3 cards para elegir [...]
// Los jefes arrancan debil y van escalando hasta ser mas fuertes"):
//
// - Los seis jefes finales de los mapas de la historia, uno atrás del otro,
//   cada uno en su mapa, en su arena, con su canción y su pelea de siempre (se
//   entra como los atajos de prueba de core/music.js SCENES, pero sin "modo
//   prueba": la partida suma experiencia). El orden sale al azar; el castillo
//   (el Chiquitijuein) siempre al final. En línea lo sortea el anfitrión.
// - Se arranca medio pelado: el mate de arranque, el facón y las granadas.
//   Antes del primero salen CARTAS_INICIO sets de 3 cartas (core/rushCards.js,
//   ui/RushCards.js) y de cada set se elige una: un perk, un mate, el
//   Pack-a-Pava de lo que tenés, una empanada. Lo elegido (el mazo) se lleva
//   a cada jefe, con la vida y la munición llenas (loadout); las empanadas,
//   en una canasta: arrancás con una y, cuando se termina, sale la siguiente.
//   Entre jefe y jefe, CARTAS_ENTRE_JEFES sets más (el usuario, 2026-10-12:
//   "Aparecen entre jefe y jefe sino es muy poco. La idea es que termines con
//   casi todos los perks o armas pack a puncheadas, empanadas, no que
//   termines cortito").
// - Los jefes escalan por su lugar en el orden, no por quién son: vida
//   (RUSH_HP) y lo rápido que corren los relojes de sus ataques (RUSH_PACE).
//   Solo números: ni animaciones ni ataques nuevos (harden).
// - Entre jefe y jefe: fundido a negro, la pantalla de carga con el cartel del
//   que sigue (ui/Arrival.js labelOf) y se destapa ya en la arena.
// - Ganar el último: el logro "Ni uno en pie", RUSH_XP de experiencia y
//   RUSH_PESOS pesos, con su pantalla (ui/overRush.js). Perder: RUSH_XP_JEFE y
//   RUSH_PESOS_JEFE por cada jefe que cayó, y la misma pantalla, apagada.
//
// En línea lo lleva el anfitrión: avisa con 'rush' (net/Session.js) cuándo
// arranca (con el orden), cuándo salen las cartas, cuándo se pasa al
// siguiente y cuándo se ganó; cada uno elige sus cartas y avisa cuando
// terminó ('drafted'); con todos listos, se sigue. El cambio de mapa es el de
// siempre (Arrival: 'start' con el mapa, sin la entrada). En la sala, todos
// ven "Rush de jefes" en vez del mapa (ui/Lobby.js; 'pick').
//
// El Boss Rush Mayhem (el usuario, 2026-10-13) es este mismo rush con la
// bandera `mayhem`: jefes más fuertes, combos y el pozo sin grises
// (core/rushMayhem.js).
// (pruebas: globalThis.__mduRushEntre = n pisa CARTAS_ENTRE_JEFES)
import * as L from './logros';
import { MAP_LIST, EE, ZONES } from '../config/map';
import { tierBag, dealSet, takeCard, newDeck, describe, dealArmas, dejables } from './rushCards';
import { EMPANADA } from '../config/empanadas';
import RushCards from '../ui/RushCards';
import RushBuild from './rushBuild';
import * as Armas from './armas';
import { rushOver, clearRushOver } from '../ui/overRush';
import { maizal } from '../entities/maizaster';
// el Boss Rush Mayhem: este mismo rush con la bandera `mayhem` (core/rushMayhem.js)
import { MAYHEM, Mayhem, mayhemBag, mayhemTiers, POZO_MAYHEM } from './rushMayhem';
// la munición y los muertos de cada pelea, parejos en todas (core/rushPelea.js)
import RushPelea from './rushPelea';

// Los jefes, cada uno en su mapa
export const JEFES = {
  molino: { map: 'molino', boss: 'El Mandinga' },
  granja: { map: 'granja', boss: 'El Espantapájaros' },
  penal: { map: 'penal', boss: 'El Gauchito Gil' },
  esteros: { map: 'esteros', boss: 'El Luisón' },
  torre: { map: 'torre', boss: 'Francisco' },
  // (los mates de la luz se agarran en los altares de la isla, como siempre;
  // el del fuego ya en la mano del anfitrión: CastleEgg.debugFinal)
  castillo: { map: 'castillo', boss: 'El Chiquitijuein' },
};
// los que salen al azar; el último, siempre el mismo
const AL_AZAR = ['molino', 'granja', 'penal', 'esteros', 'torre'];
const ULTIMO = 'castillo';
export const N_JEFES = AL_AZAR.length + 1;

// ---- los números (para ajustar) ----
// La escalera, por el lugar en el orden (1.º ... 6.º): la vida de cada jefe y
// lo rápido que corren los relojes de sus ataques (bolas de fuego, lluvia,
// cadenazos, embestidas, aullidos, llamados, pisotones...). El x1,3 y x1,15
// del primer rush quedan en el medio (entre el 3.º y el 4.º); el primero,
// flojo para que no te destruya; el último, el más duro.
export const RUSH_HP = [0.55, 0.85, 1.15, 1.45, 1.75, 2.0];
export const RUSH_PACE = [0.85, 0.95, 1.1, 1.2, 1.3, 1.4];
// el premio por ganarlo entero: la experiencia de dos easter eggs (~medio
// prestigio: un easter egg da 67.500, 135.000 la primera vez) y 20 pesos (un
// easter egg da 2, 3 la primera vez; el super easter egg, 100)
export const RUSH_XP = 135000;
export const RUSH_PESOS = 20;
// al perder: esto por cada jefe que cayó (sin el logro ni el premio)
export const RUSH_XP_JEFE = 10000;
export const RUSH_PESOS_JEFE = 1;
// el Boss Rush Mayhem paga el doble que el rush (la experiencia y los pesos,
// al ganar y lo de consuelo) y suma su logro, "Ni el diablo" (el usuario,
// 2026-10-13: "el doble que el rush normal más logro").
export const MAYHEM_PREMIO = 2;
// las cartas: cuántos sets de 3 salen al arrancar y entre jefe y jefe (de
// cada set se elige una). Con 3 y 2 se llega al último jefe con 13 elegidas;
// el pozo (core/rushCards.js) tiene 10 perks, 2 o 3 mates con hasta 2
// mejoras cada uno y la canasta de 3 empanadas. Un jugador promedio
// (simulado: elige el mejor tier y, entre iguales, perk > Pack-a-Pava > mate >
// empanada) llega con 6-7 perks (todos los de oro y prismáticos), sus mates
// con el Pack-a-Pava (98 %; 2,8 de 3,6 mejoras), ~1 mate nuevo y 3
// empanadas. Con 3 entre jefes se llena antes del final (sobra vida de relleno).
export const CARTAS_INICIO = 3;
export const CARTAS_ENTRE_JEFES = 2;
// (anfitrión) cuánto se espera, ya jugando y con la pantalla en negro, para
// entrar a la arena: en línea, que todos hayan arrancado la partida
const ENTER_AFTER = 1.2;
const ENTER_SOLO = 0.25;
// el fundido a negro al pasar al siguiente (ms; ui/rush.css)
const FADE_MS = 900;
// De arena en arena, más cortos (el usuario, 2026-10-13: los ~4 s de la
// última carta a la arena, "acortalos"): el negro arranca al elegir la
// última —debajo de la animación de la carta, ui/RushCards.js early— y los
// dos fundidos del viaje duran esto (ms). Lo que se hace en negro, igual.
const FADE_VIAJE = 500;
const FADE_DESTAPE = 600;
// El viaje de arena en arena (el usuario, 2026-10-13: "ahora irá de arena en
// arena, salteándose cinemáticas en el proceso. Para que se sienta más
// fluido, durante la elección de cartas previas al siguiente jefe, ahí
// arrancará a cargar la siguiente arena en segundo plano [...] Si por algún
// motivo no terminó de cargar, la pantalla negra simplemente durará más
// tiempo"; y después: "las cards salgan al terminar la boss fight, que
// cargue de mientras y luego salga la pantalla negra después de que todos
// los jugadores hayan elegido"): al caer el jefe, las cartas sobre la pelea
// quieta; con ellas en pantalla, la arena que sigue se arma de fondo
// (prepSoon; ui/Arrival.js preload); cuando eligieron todos, fundido a negro
// y en negro lo que falte —en línea, hasta que la tienen todos: Arrival
// espera a cada uno como siempre— y se destapa ya en la arena. Sin la
// pantalla de carga, sin el sorbo y sin la llegada del Luisón
// (entities/EsterosEgg.js). Va en down/onNet/showCards, así lo usa igual el
// Mayhem (y cualquier modo hermano).
// pasado esto en negro después de las cartas, un indicador mínimo (ms)
const WAIT_HINT = 6000;
// para qué lado va la carta que sobra (13 sets son 39 cartas: 19 y 20) en la próxima partida
const PAR_KEY = 'lm-zombies-rush-par';

const zero = () => ({ kills: 0, headshots: 0, knifeKills: 0, earned: 0, time: 0 });
const mapName = (id) => MAP_LIST.find((m) => m.id === id)?.name || id;
const entre = () => (typeof globalThis.__mduRushEntre === 'number' ? globalThis.__mduRushEntre : CARTAS_ENTRE_JEFES);

// El orden de una partida: los cinco al azar y el castillo al final.
function sortear() {
  const a = AL_AZAR.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [...a, ULTIMO];
}

// La carta que sobra, una partida para cada lado (en esta compu).
function nextOdd() {
  try {
    const v = localStorage.getItem(PAR_KEY) === '1' ? 1 : 0;
    localStorage.setItem(PAR_KEY, String(1 - v));
    return v;
  } catch {
    return Math.random() < 0.5 ? 1 : 0;
  }
}

export default class BossRush {
  constructor(g) {
    this.g = g;
    // elegido en el menú de jugar (ui/PlayMenu.js): Solo o la sala arrancan el rush
    this.pick = false;
    // (invitado) lo que eligió el anfitrión, para la sala
    this.roomPick = false;
    this.on = false;
    this.i = 0;
    this.order = [...AL_AZAR, ULTIMO];
    this.tot = zero();
    this.fadeEl = null;
    this.enterAt = null;
    this.entered = false;
    this.going = false;
    this.deck = null;
    this.ui = null;
    this.draftK = 0;
    this.drafting = null;
    this.ready = new Set();
    // las mejoras y la habilidad de las cartas, en la pelea (core/rushBuild.js)
    this.build = new RushBuild(g);
    // el Boss Rush Mayhem: elegido en el menú (mayhemPick, con pick), el de la
    // sala para el invitado (roomMayhem) y el de la partida (mayhem)
    this.mayhemPick = false;
    this.roomMayhem = false;
    this.mayhem = false;
    this.mh = new Mayhem(g, this);
    this.pelea = new RushPelea(g, this);
  }

  // Por cuánto se multiplica el premio (el Mayhem, MAYHEM_PREMIO).
  // Sin el contador de puntos mientras dura el rush (no hay nada que comprar;
  // world/Interactables.js tampoco deja).
  sinPuntos() {
    this.g.hud?.root?.classList.toggle('is-rush', this.on);
  }

  premio() {
    return this.mayhem ? MAYHEM_PREMIO : 1;
  }

  // (entities/Player.js damage) Lo que pega todo en la pelea del Mayhem, a cada uno en su compu.
  dmgIn() {
    return this.on && this.mayhem && this.entered ? MAYHEM.dmg[this.i] ?? 1 : 1;
  }

  get cur() {
    return JEFES[this.order[this.i]] || JEFES[ULTIMO];
  }

  // (Game.newRun) del segundo jefe en adelante la experiencia de la partida sigue
  get keepRun() {
    return this.on && this.i > 0;
  }

  // El cartel de la pantalla de carga (ui/Arrival.js labelOf).
  label() {
    if (!this.on) return null;
    const R = this.cur;
    return { id: R.map, name: mapName(R.map), sub: `${this.mayhem ? 'Mayhem · ' : ''}Jefe ${this.i + 1} de ${N_JEFES} · ${R.boss}` };
  }

  // El mazo, la bolsa de tiers y lo que ya salió (cada uno el suyo).
  fresh() {
    const n = CARTAS_INICIO + entre() * (N_JEFES - 1);
    // (el Mayhem: oro y prismático, y los grises que hagan falta al repartir)
    this.bag = this.mayhem ? mayhemBag(n, 3) : tierBag(n, 3, nextOdd());
    this.setI = 0;
    this.seen = new Set();
    this.deck = newDeck(this.g.weapons.startSlot().id);
    if (this.mayhem) this.deck.pozo = POZO_MAYHEM;
    // ("Nueva arma" en el Mayhem: el tier de cada mate, como las cartas de su pozo, sin grises)
    if (this.mayhem) this.deck.armaTiers = { oro: 1 - MAYHEM.prisma, prisma: MAYHEM.prisma };
    // ("Nueva arma": los mates, en una elección aparte antes de cada tanda; showCards)
    this.deck.armaAparte = true;
    // (los especialistas: en el rush arrancan todos apagados y los prende
    // una carta; el usuario, 2026-10-12. core/armas.js)
    this.deck.espDe = (id) => Armas.especialista(id);
    Armas.especialistasDePartida([]);
    // cuántos compañeros hay (el Resurgir del mate solo sale con alguno:
    // core/rushCards.js options; en el título, la lista de la sala)
    this.deck.equipo = () => {
      const N = this.g.net;
      if (!N) return 0;
      const ids = new Set([...(N.net?.players?.keys?.() || []), ...N.remote.keys()]);
      ids.delete(N.id);
      return ids.size;
    };
    // (el usuario, 2026-10-13: "Ajuste a la rush en solo: siempre arrancás con
    // Quick Revive"): jugando solo, el rush y el Mayhem arrancan con Quick
    // Revive en el mazo (loadout lo da en cada arena, con su ícono, y te
    // levanta solo como en la partida normal: entities/Player.js damage). Como
    // ya lo tenés, su carta no sale (core/rushCards.js options). En línea,
    // como antes.
    if (!this.deck.equipo()) {
      this.deck.perks.push('revive');
      // (el usuario, 2026-10-13: "Maximo 3 (1 por boss fight) ... En mayhem es
      // una sola"): cuántas levantadas quedan en el rush (levanta). Ya
      // gastadas, 'revive' sigue en el mazo para que su carta no salga, pero
      // loadout no lo da.
      this.deck.revSolo = true;
      this.deck.revLeft = this.mayhem ? 1 : 3;
    }
    // (los compañeros que llevan el Maizaster: sus matas se arman en cada mapa)
    this.maizMates = new Set();
    this.paid = false;
    this.won = false;
  }

  // (solo o anfitrión; Game.startGame con el rush elegido) Sortea el orden,
  // salen las cartas y, cuando eligieron todos, el primero.
  start() {
    const g = this.g;
    if (g.net?.guest) return false;
    this.on = true;
    this.sinPuntos();
    this.i = 0;
    this.order = sortear();
    this.tot = zero();
    this.going = false;
    this.mayhem = !!this.mayhemPick;
    this.mh.reset();
    this.fresh();
    this.send({ a: 'state', order: this.order, mh: this.mayhem ? 1 : 0 });
    g.audio.resume();
    g.menus.show(null);
    // (solo, Esc en las cartas vuelve al menú de jugar)
    this.draft(CARTAS_INICIO, () => this.load(), g.net ? null : () => this.cancel());
    return true;
  }

  cancel() {
    this.stop();
    this.g.menus.show('play');
  }

  // Arma el mapa del jefe que toca, con la pantalla de carga y sin la entrada.
  load() {
    const g = this.g;
    const title = g.state === 'title';
    g.setMap(this.cur.map, { save: false, mode: 'story' });
    g.audio.resume();
    // (de arena en arena: en negro, sin la pantalla de carga; prep)
    if (g.arrival.usePre()) this.hint();
    g.arrival.start(!title || g.arrival.switching, { restart: true });
  }

  send(m) {
    this.g.net?.event('rush', { on: this.on ? 1 : 0, i: this.i, ...m });
  }

  // (anfitrión, en la sala) Si el rush está elegido, para los invitados.
  sendPick() {
    if (!this.g.net?.host) return;
    this.send({ a: 'pick', p: this.pick ? 1 : 0, mh: this.pick && this.mayhemPick ? 1 : 0 });
  }

  // (todos) Lo que avisa otro: el anfitrión, o un invitado que terminó sus cartas.
  onNet(m) {
    const g = this.g;
    if (m.a === 'pick') {
      this.roomPick = !!m.p;
      this.roomMayhem = !!m.mh;
      g.menus?.lobby?.syncMap();
      return;
    }
    if (m.a === 'state') {
      this.on = !!m.on;
      this.sinPuntos();
      this.i = m.i | 0;
      if (Array.isArray(m.order) && m.order.length === N_JEFES && m.order.every((x) => JEFES[x])) this.order = m.order.slice();
      this.tot = zero();
      this.going = false;
      this.mayhem = !!m.mh;
      if (this.on) this.fresh();
      return;
    }
    if (!this.on) return;
    if (m.a === 'draft') {
      if (!g.net?.guest) return;
      if (g.state === 'title') g.menus.show(null);
      this.showCards(m.n | 0, m.k);
    } else if (m.a === 'drafted') this.onDrafted(m);
    else if (m.a === 'go') {
      if (g.net?.guest) {
        this.ui?.close();
        // (de arena en arena: eligieron todos, el negro; travel)
        if (g.arrival.pre) {
          g.arrival.blackP = new Promise((r) => this.cover(r, this.fadeViaje()));
          this.hint();
        }
      }
    } else if (m.a === 'next') {
      this.addStats();
      this.i = m.i | 0;
      // (de arena en arena: las cartas ya, y cada uno arma de fondo la que
      // sigue cuando le salen —showCards—; sin cartas, en negro ya)
      this.hold();
      this.wantPrep = true;
      if (m.n === 0) {
        g.arrival.blackP = new Promise((r) => this.cover(r, this.fadeViaje()));
        this.prep();
        this.hint();
      }
    } else if (m.a === 'done') this.complete(m.board || null);
    // (lo que se ve de la habilidad de otro y, al invitado, sus bajas: core/rushBuild.js)
    else if (m.a === 'fx') this.build.onFx(m);
    else if (m.a === 'baja') this.build.onBaja(m);
    // (el Resurgir del mate: el invitado lo pide, el anfitrión dice quiénes vuelven; core/rushPrisma.js)
    // (el aviso de un combo del Mayhem: core/rushMayhem.js)
    else if (m.a === 'mfx') this.mh.onFx(m);
    else if (m.a === 'resPide') {
      if (g.net?.host) this.build.prisma.hostRes(m.id | 0);
    } else if (m.a === 'resurgir') this.build.prisma.onRes(m);
  }

  // ---------------- las cartas ----------------
  // (solo o anfitrión) n sets para cada uno; con todos listos, `then`.
  draft(n, then, cancel = null) {
    const g = this.g;
    const k = ++this.draftK;
    this.drafting = { n, then, k };
    this.send({ a: 'draft', n, k });
    this.showCards(n, k, cancel);
    clearInterval(this.draftIv);
    // (en línea: si alguien se va mientras elige, no se lo espera)
    if (g.net) this.draftIv = setInterval(() => this.checkDraft(), 1000);
  }

  // (todos) La pantalla de las cartas, con lo propio.
  showCards(n, k, cancel = null) {
    const g = this.g;
    this.hold();
    this.ready = new Set();
    this.ui ||= new RushCards(g);
    // ("Nueva arma": primero los tres mates, sin gastar de la bolsa, con su
    // título; después los sets de siempre, ya sin mates. core/rushCards.js dealArmas)
    let arma = !!this.deck.armaAparte && n > 0;
    const dealNormal = () => dealSet(this.mayhem ? mayhemTiers(this.bag[this.setI++], this.deck) : this.bag[this.setI++] || ['gris', 'oro', 'gris'], this.deck, this.seen);
    this.ui.open({
      total: n + (arma ? 1 : 0),
      have: this.deck.picks.map(describe),
      deal: () => {
        if (arma) {
          arma = false;
          const cs = dealArmas(this.deck, this.seen);
          if (cs.length) {
            cs.titulo = 'Nueva arma';
            return cs;
          }
        }
        return dealNormal();
      },
      take: (c) => {
        const D = takeCard(this.deck, c);
        // (el Heredero del caos: la guadaña se arma y se compila ya, entre jefes; core/rushPrisma.js)
        if (c.id === 'heredero') this.build.prisma.warm();
        return D;
      },
      done: () => this.drafted(k),
      stay: !!g.net,
      // ("Nueva arma" sin lugar: tus mates, para elegir cuál dejás)
      dejables: () => dejables(this.deck),
      // (entre jefes: el negro del viaje arranca al elegir la última; fadeViaje)
      early: this.i > 0,
      cancel,
    });
    // (de arena en arena: con las cartas ya en pantalla, la arena que sigue; prepSoon)
    if (this.wantPrep) this.prepSoon();
  }

  // Entre jefe y jefe: la pelea terminada queda quieta mientras se elige
  // (sin el menú de pausa: el mouse suelto es para las cartas).
  hold() {
    const g = this.g;
    if (g.state === 'playing') {
      g.state = 'paused';
      g.paused = true;
    }
    g.input.unlock();
    g.menus.showClick(false);
  }

  drafted(k) {
    const g = this.g;
    const m = { a: 'drafted', id: g.net ? g.net.id : 0, k };
    // (a los demás: si llevo la guadaña del Heredero o el Maizaster, que armen lo suyo en la carga)
    const D = this.deck;
    if (D?.mej?.some((x) => x.id === 'heredero')) m.her = 1;
    if (D?.perks?.includes('maiz')) m.maiz = 1;
    if (g.net?.guest) g.net.share('rush', m);
    else this.send(m);
    this.onDrafted(m);
  }

  onDrafted(m) {
    const me = this.g.net ? this.g.net.id : 0;
    if ((m.id | 0) !== me) {
      if (m.her) this.build.prisma.warmMate(m.id | 0);
      if (m.maiz) this.maizMates?.add(m.id | 0);
    }
    this.ready.add(m.id | 0);
    this.checkDraft();
  }

  // A quién se espera todavía (con su nombre).
  pending() {
    const net = this.g.net;
    if (!net) return this.ready.has(0) ? [] : [0];
    // (la lista de la sala: en el título el invitado todavía no tiene a los
    // demás en remote)
    const list = net.net?.players?.size ? [...net.net.players.keys()] : [...net.remote.keys()];
    const ids = [...new Set([net.id, ...list])];
    return ids.filter((id) => !this.ready.has(id));
  }

  checkDraft() {
    const g = this.g;
    const left = this.pending();
    this.ui?.wait(left.map((id) => g.net?.nameOf(id) || 'los demás'));
    const D = this.drafting;
    if (!D || g.net?.guest || left.length) return;
    clearInterval(this.draftIv);
    this.drafting = null;
    this.send({ a: 'go', k: D.k });
    if (g.net) this.ui?.close();
    D.then();
  }

  // (Game.newRun, todos) Arrancó la partida del jefe que toca: la pantalla
  // queda en negro hasta entrar a la arena, y cada uno recibe lo suyo.
  onNewRun() {
    if (!this.on) return;
    const g = this.g;
    this.blackNow();
    this.entered = false;
    this.going = false;
    this.muted = false;
    this.bossSeen = false;
    this.newRunAt = g.time;
    this.mh.reset();
    this.pelea.reset();
    // (el penal arranca cada partida con el alma afuera, el gaucho life: a la
    // pelea se va en el cuerpo)
    if (g.vida?.active) g.vida.leave(true);
    this.loadout();
    if (this.cur.map === 'esteros') this.placeAt(EE.hueco);
    // (el usuario, 2026-10-13: "abierto todo en Mate no Numa": la pelea del
    // Luisón, en el rush y en el Mayhem, con todas las puertas del estero
    // abiertas; en cada compu, de una, sin sonido, todavía en negro. Las otras
    // arenas, como estaban)
    if (this.cur.map === 'esteros') g.interact?.applyPreDoors(g.interact.list.filter((x) => x.kind === 'door').map((x) => x.door.index));
    this.enterAt = g.net?.guest ? null : g.time + (g.net ? ENTER_AFTER : ENTER_SOLO);
  }

  // Lo de cada uno para la pelea (en su compu: el jugador local): el mazo de
  // las cartas, con la vida y la munición llenas.
  loadout() {
    const g = this.g;
    const W = g.weapons;
    const P = g.player;
    const D = this.deck;
    if (!D) return;
    // (Mule Kick primero: con él entra el tercer mate)
    // (Quick Revive de solo, sin levantadas que queden: no; levanta)
    for (const id of D.perks) if (id !== 'revive' || !D.revSolo || D.revLeft > 0) P.givePerk(id);
    // (también 0: el Pacto con el Mandinga lo baja, y de jefe en jefe no se acumula)
    P.setHat(D.hat || 0);
    // las mejoras y la habilidad (antes de llenar la vida y las bombas: las tocan)
    this.build.set(D);
    // (el Maizaster fuera de La Tapera: las matas se arman solo donde está su
    // máquina; acá, en cada mapa si alguien lo lleva. entities/maizaster.js)
    if (D.perks.includes('maiz') || this.maizMates?.size) maizal(g);
    Armas.especialistasDePartida(D.esp || []);
    P.health = P.maxHealth;
    // (la carta del escudo mejorado: el de este mapa, con su propiedad, y
    // lleno en cada pelea aunque se haya roto en la anterior. core/rushCards.js
    // RAROS.escudo; world/Activities equipShield)
    if (D.mej?.some((x) => x.id === 'escudo')) {
      g.activities?.equipShield(true);
      // (y el de la mano —Z— ya compilado, acá en negro: al levantarlo por
      // primera vez compilaba un programa, ~27 ms)
      try {
        const m = W.shieldHand?.model(true);
        if (m) g.renderer.compile(m.holder, W.vmCamera, W.vmScene);
      } catch {
        /* se compila al levantarlo, como antes */
      }
    }
    W.slots = D.guns.map(({ id, up }) => {
      const st = W.statsOf(id, up);
      return { id, up, mag: st.mag, reserve: st.reserve };
    });
    // (el castillo: en la mano el de arranque —o el menos mejorado y de
    // menor tier—, que es el que se cambia por el mate de la luz)
    let hand = 0;
    if (this.cur.map === ULTIMO) {
      const val = (x) => (x.base ? -1 : (x.up | 0) * 10 + ({ oro: 1, prisma: 2 }[x.tier] || 0));
      hand = D.guns.reduce((m, x, i) => (val(x) < val(D.guns[m]) ? i : m), 0);
    }
    W.cur = -1;
    W.switchTo(hand);
    W.maxAmmo();
    // la canasta: primero las que se gastan (las de usar y las de un rato);
    // las de rondas, al final (en la arena no pasan las rondas: duran toda la pelea)
    const ORD = { activa: 0, tiempo: 1, auto: 2, rondas: 3 };
    this.canasta = D.emps.slice().sort((a, b) => (ORD[EMPANADA[a]?.use] ?? 2) - (ORD[EMPANADA[b]?.use] ?? 2));
    this.empI = 0;
    // (sin el cartel de la empanada al arrancar cada jefe; el usuario,
    // 2026-10-12: "El 5 sacalo")
    this.nextEmp(true);
  }

  // (el usuario, 2026-10-13: "Maximo 3 (1 por boss fight), en boss rush
  // normal perdes un perk al azar. En mayhem es una sola y perdes los
  // perks"): te levantó el Quick Revive de solo (entities/Player.js goDown).
  // Se gasta (en esta pelea no hay otro) y vuelve en la arena siguiente
  // mientras queden levantadas (3 por rush; 1 en el Mayhem). En el rush
  // perdés un perk al azar; en el Mayhem, todos. Lo perdido se va del mazo
  // por el resto del rush (su carta puede volver a salir). false: como antes
  // (Player saca todos los perks de esta arena y el mazo los devuelve).
  levanta(P) {
    const D = this.deck;
    if (!this.on || !D?.revSolo) return false;
    const g = this.g;
    D.revLeft = Math.max(0, (D.revLeft || 0) - 1);
    P.perks.delete('revive');
    const antes = [...P.perks];
    if (this.mayhem) P.loseAllPerks();
    // (Gusto a Más, la empanada de roquefort, te guarda los perks también acá:
    // entities/Empanadas.js)
    else if (antes.length && g.emp?.cur?.id === 'roquefort') P.loseAllPerks();
    else if (antes.length) P.losePerk(antes[Math.floor(Math.random() * antes.length)]);
    g.hud.setPerks([...P.perks]);
    for (const id of antes) if (!P.perks.has(id)) this.sacarPerk(id);
    return true;
  }

  // Un perk que se va del mazo: de lo que se da en cada arena y de la mano de
  // las cartas (la carta puede volver a salir). Sin Mule Kick, el tercer mate
  // se va con él (el que soltó Weapons.trimSlots).
  sacarPerk(id) {
    const D = this.deck;
    D.perks = D.perks.filter((x) => x !== id);
    D.picks = D.picks.filter((c) => !(c.kind === 'perk' && c.id === id));
    if (id === 'mule' && D.guns.length > 2) {
      const W = this.g.weapons;
      const quedan = D.guns.filter((x) => W.slots.some((s) => s.id === x.id));
      D.guns = (quedan.length >= 2 ? quedan : D.guns).slice(0, 2);
      if (D.esp) D.esp = D.esp.filter((e) => D.guns.some((x) => x.id === e));
    }
  }

  // La siguiente empanada de la canasta, si no hay otra andando.
  nextEmp(quiet = false) {
    const E = this.g.emp;
    if (!E || E.cur || !this.canasta || this.empI >= this.canasta.length) return;
    E.start(this.canasta[this.empI++], quiet);
  }

  // Cada uno a un costado de ese punto (en línea no aparecen encimados).
  placeAt(at) {
    const g = this.g;
    if (!at) return;
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    const slot = ids.indexOf(g.net ? g.net.id : 0);
    const x = at[0] - 1.5 + (slot - (ids.length - 1) / 2) * 1.6;
    const z = at[1] + 2;
    g.player.pos.set(x, g.world.floorAt(x, z), z);
    g.player.vel?.set(0, 0, 0);
    // (el cartel del lugar: el de donde quedó, no el del comienzo del mapa)
    const k = g.world.zoneAt(x, z);
    if (ZONES[k]) g.hud.location(ZONES[k].name, ZONES[k].sub || '');
  }

  // (solo o anfitrión) Adentro: la pelea del mapa, como al final de su easter egg.
  enter() {
    const g = this.g;
    this.entered = true;
    const map = this.cur.map;
    const E = g.ee;
    try {
      if (map === 'esteros') {
        // (el atajo le da el Liquidificador al que lo llama: en el rush se
        // pelea con lo de las cartas, como el invitado)
        const W = g.weapons;
        const keep = W.slots.map((s) => ({ ...s }));
        const cur = W.cur;
        E.debugLuison();
        W.slots = keep;
        W.cur = -1;
        W.switchTo(Math.max(0, Math.min(cur, keep.length - 1)));
      } else {
        // (el castillo: los mates de la luz templados en sus altares y el del
        // fuego en la mano, como al final de su easter egg; sin las líneas de
        // Fierro de los pasos que se saltean: hablaban de la cueva y la cumbre)
        if (map === 'castillo') {
          const say = E.say;
          E.say = () => {};
          try {
            E.debugFinal();
          } finally {
            E.say = say;
          }
        }
        // (la torre: el paso de la caída al Infierno, sin el panel de las Revelaciones)
        if (map === 'torre' && E.step < 9) {
          E.step = 9;
          E.fight = true;
          E.netSync?.();
        }
        g.arena.start();
        // (la canción de la Gran Guerra arranca en el vuelo, que acá no hay)
        if (map === 'castillo') g.arena.playSong?.();
      }
    } catch (err) {
      console.error(err);
    }
    this.hushTest();
    setTimeout(() => this.uncover(), 350);
  }

  // Los atajos que se usan para entrar avisan "Modo prueba": acá no va.
  hushTest() {
    const H = this.g.hud;
    for (const l of H?.lines || []) if (!l.out && /^Modo prueba/.test(l.text)) H.dropLine(l);
  }

  // (todos, cada cuadro: Game.update)
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    // (al morir: el cartel del final dice hasta qué jefe se llegó, y lo de
    // consuelo se anota antes de que el resumen lo muestre)
    if (g.state === 'over' && g.endEl && !g.endEl.dataset.rush) {
      g.endEl.dataset.rush = '1';
      this.payLoss();
      const p = g.endEl.querySelector('.mdu-end__txt p');
      if (p) p.textContent = `${g.net?.remote.size ? 'Llegaron' : 'Llegaste'} al jefe ${this.i + 1} de ${N_JEFES}.`;
    }
    if (g.state !== 'playing') return;
    // (el usuario, 2026-10-13: la música de la pelea a veces seguía después de
    // matar al jefe —el estero y el castillo no salen de su paso en el rush, y
    // al invitado la arena no le pasa a 'won'—): se apaga con fundido al caer
    // el jefe, en todos)
    if (this.entered && !this.muted && this.fightOver()) {
      this.muted = true;
      g.music?.stop(2);
    }
    this.build.update(dt);
    if (this.entered) this.nextEmp();
    if (this.enterAt != null && g.time >= this.enterAt) {
      this.enterAt = null;
      this.enter();
    }
    // (invitado) se destapa cuando la pelea del anfitrión llegó (o al rato)
    if (g.net?.guest && !this.entered && this.newRunAt != null) {
      const up = g.arena?.active || (this.cur.map === 'esteros' && g.ee?.step >= 5);
      if (up || g.time - this.newRunAt > 8) {
        this.entered = true;
        this.hushTest();
        setTimeout(() => this.uncover(), 350);
      }
    }
    if (!g.net?.guest) this.harden(dt);
  }

  // ¿Cayó el jefe de esta arena? La arena pasó a 'won' (o el castillo a
  // 'dead'), o el jefe que se vio vivo ya no está (el Luisón; y en el invitado,
  // que no pasa la arena a 'won').
  fightOver() {
    const g = this.g;
    const A = g.arena;
    if (A?.active && (A.phase === 'won' || A.stage === 'dead')) return true;
    const b = g.zombies?.boss;
    if (b && !b.dead) {
      this.bossSeen = true;
      return false;
    }
    return !!this.bossSeen;
  }

  // (anfitrión) La escalera: vida y relojes de ataque según el lugar en el orden.
  harden(dt) {
    const g = this.g;
    // (el Mayhem: sus números y sus combos; core/rushMayhem.js)
    const HP = (this.mayhem ? MAYHEM.hp : RUSH_HP)[this.i] ?? 1;
    const x = dt * (((this.mayhem ? MAYHEM.pace : RUSH_PACE)[this.i] ?? 1) - 1);
    if (this.mayhem) this.mh.update(dt);
    // (la munición, la horda del estero: core/rushPelea.js)
    this.pelea.update(dt);
    // (solo los relojes que la pelea está corriendo ahora: los que bajaron
    // desde el cuadro anterior; uno quieto —la lluvia antes de los dos
    // tercios, el pozo del Espantapájaros con el escudo— queda quieto. Con
    // menos de 1, el reloj baja más despacio)
    const tick = (o, keys) => {
      const prev = (o.rushPrev ||= {});
      for (const k of keys) {
        const v = o[k];
        if (typeof v !== 'number') continue;
        if (prev[k] != null && v < prev[k] && v > 0) o[k] = v - x;
        prev[k] = o[k];
      }
    };
    const b = g.zombies?.boss;
    if (b && !b.dead && (b.mandinga || b.kind === 'luison')) {
      if (!b.rushHard) {
        b.rushHard = true;
        b.maxHp *= HP;
        b.hp *= HP;
      }
      // (entities/Zombies.js: los cadenazos, las embestidas, los llamados y el aullido)
      tick(b, ['whipCd', 'chargeCd', 'summonCd', 'howlCd']);
    }
    const A = g.arena;
    if (!A?.active || A.phase === 'won') return;
    // (world/Arena.js y sus hijas: las bolas de fuego, la lluvia, las cadenas
    // del Gil, los pisotones y tirones de Francisco, el Espantapájaros bajo tierra)
    if (A.phase === 'fight') tick(A, ['fireT', 'rainT', 'bindCd', 'sweepCd', 'slamCd', 'pullCd', 'specialT', 'blinkCd', 'digT']);
    // (world/GranGuerra.js) el coloso: gemas con un tiro cargado más y sus
    // ataques; el duende: la vida de su lugar y sus trampas y bolas de fuego
    if (A.gems && A.stage === 'gems') {
      if (!A.rushGems) {
        A.rushGems = true;
        A.gemMax = (A.gemMax || 3) + (this.mayhem ? MAYHEM.gemas : 1);
        for (const G of A.gems) if (G.hp > 0) G.hp = A.gemMax;
        A.sync?.();
      }
      if (A.cd) tick(A.cd, ['slam', 'rain', 'fire', 'meteor']);
    }
    if (A.gnome && A.stage === 'gnome') {
      if (!A.rushGnome) {
        A.rushGnome = true;
        const k = A.gnome.max ? A.gnome.hp / A.gnome.max : 1;
        A.gnome.max *= HP;
        A.gnome.hp = A.gnome.max * k;
        A.sync?.();
      }
      tick(A.gnome, ['throwT', 'mineT', 'blinkT']);
    }
  }

  // Cayó el jefe de este mapa (Game.win; el castillo y el estero, antes de su
  // final: world/GranGuerra.js, entities/EsterosEgg.js). Devuelve si el rush
  // se hizo cargo (entonces no va el final del easter egg).
  down() {
    if (!this.on) return false;
    const g = this.g;
    // (el invitado espera lo que diga el anfitrión)
    if (g.net?.guest || this.going) return true;
    this.going = true;
    if (this.i >= N_JEFES - 1) {
      this.send({ a: 'done', board: g.net ? g.net.board() : undefined });
      this.complete(null);
      return true;
    }
    this.addStats();
    this.i++;
    const n = entre();
    this.send({ a: 'next', n });
    // (el usuario, 2026-10-13: "las cards salgan al terminar la boss fight,
    // que cargue de mientras y luego salga la pantalla negra después de que
    // todos los jugadores hayan elegido"): las cartas ya, sobre la pelea
    // quieta; la arena que sigue se arma mientras se elige (showCards →
    // prepSoon) y el negro, con lo que falte, al final (travel)
    this.hold();
    this.wantPrep = true;
    if (n > 0) this.draft(n, () => this.travel());
    else this.travel();
    return true;
  }

  // (todos) La arena del jefe que sigue, armada de fondo: ui/Arrival.js preload.
  prep() {
    const g = this.g;
    this.wantPrep = false;
    // (quieto: si no, el mapa nuevo corría —rondas, jugador— mientras se armaba)
    this.hold();
    if (g.arrival.pre) return;
    g.arrival.preload(this.cur.map, 'story');
  }

  // Con las cartas recién puestas: el armado (0,6-1,2 s que traban la página)
  // arranca cuando ya entraron en pantalla. El fundido de las cartas y el
  // reparto son de opacidad y movimiento: siguen andando con la página
  // trabada. Los dibujos de los mates del primer set ya están hechos (si no,
  // esperaban a que la placa terminara de compilar el mapa: 400-750 ms).
  prepSoon() {
    this.wantPrep = false;
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => this.on && this.prep(), 30))));
  }

  // (anfitrión) Eligieron todos: fundido a negro y, en negro, lo que falte de
  // la carga (y en línea, hasta que la tienen todos: Arrival) y adentro.
  // Lo que no dibuja (compilar lo que sumaron las cartas, las radios...) va
  // durante el fundido; lo que dibuja espera al negro entero (Arrival blackP).
  travel() {
    const g = this.g;
    if (!g.arrival.pre) this.prep();
    g.arrival.blackP = new Promise((r) => this.cover(r, this.fadeViaje()));
    this.load();
  }

  // Ya sin cartas y en negro: si la carga tarda, un indicador mínimo.
  hint() {
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.fadeEl?.classList.add('is-wait'), WAIT_HINT);
  }

  addStats() {
    const s = this.g.stats;
    const T = this.tot;
    if (!s) return;
    for (const k of Object.keys(T)) T[k] += s[k] || 0;
  }

  // Ganaron el último: el logro (cada uno el suyo) y, al rato, la pantalla del
  // final con el premio (la experiencia y los pesos van ahí: jugando, los
  // niveles de golpe tapaban el aviso del logro).
  complete(board) {
    const g = this.g;
    if (this.won) return;
    this.won = true;
    // (el del Mayhem primero: los avisos salen de a uno)
    if (!g.cheated) g.logros?.got?.([this.mayhem ? L.unlock('mayhem') : null, L.unlock('rush')]);
    setTimeout(() => this.victory(board), 3200);
  }

  // Como Game.win, sin el final del easter egg (ni lo marca como hecho).
  victory(board) {
    const g = this.g;
    if (g.state !== 'playing' && g.state !== 'paused') return;
    if (!board && g.net?.host) board = g.net.board();
    g.useBoard(board);
    g.menuOpen = false;
    g.hostPaused = false;
    g.menus.show(null);
    g.audio.ctx.resume?.();
    g.state = 'won';
    g.paused = true;
    if (!g.cheated) {
      g.levels.gain(RUSH_XP * this.premio(), 'rush');
      g.levels.earnPesos(RUSH_PESOS * this.premio());
    }
    g.stats.round = g.rounds.round;
    g.stats.won = true;
    g.input.unlock();
    g.menus.showClick(false);
    g.hud.show(false);
    g.audio.stopAmbience();
    g.weather?.stopAudio();
    g.audio.setCritical(false);
    g.audio.setUnder(false);
    g.menus.gameOver(g.stats, g.best, { won: true, board, role: g.netRole() });
  }

  // Perdiste: un poco por cada jefe que cayó (una vez por rush; cada uno lo suyo).
  payLoss() {
    const g = this.g;
    if (this.paid || !this.on) return false;
    this.paid = true;
    const k = this.i;
    if (!k || g.cheated) return false;
    g.levels.gain(RUSH_XP_JEFE * k * this.premio(), 'rush');
    g.levels.earnPesos(RUSH_PESOS_JEFE * k * this.premio());
    return true;
  }

  // (ui/Menus.js gameOver) La pantalla del final, con lo del rush entero.
  decorateOver(s, { won = false, team = false } = {}) {
    clearRushOver(s);
    if (!this.on) return;
    const g = this.g;
    // (perdido sin pasar por el final de siempre —se cortó la conexión—: lo de
    // consuelo recién ahora, y el resumen de la experiencia otra vez)
    if (!won && this.payLoss()) g.levels.summary(s);
    const n = N_JEFES;
    s.querySelector('[data-survived]').textContent = won ? `${team ? 'Vencieron' : 'Venciste'} a los ${n} jefes.` : `${team ? 'Llegaron' : 'Llegaste'} al jefe ${this.i + 1} de ${n}: ${this.cur.boss}.`;
    const st = g.stats;
    const T = this.tot;
    const t = T.time + (st.time || 0);
    const rows = [
      ['Zombies liquidados', T.kills + (st.kills || 0)],
      ['Tiros a la cabeza', T.headshots + (st.headshots || 0)],
      ['Con el facón', T.knifeKills + (st.knifeKills || 0)],
      ['Puntos ganados', (T.earned + (st.earned || 0)).toLocaleString('es-AR')],
      ['Tiempo', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`],
      ['Jefes vencidos', `${won ? n : this.i} de ${n}`],
    ];
    s.querySelector('[data-stats]').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    rushOver(s, { won, title: won ? '¡Rush ganado!' : 'Fin del rush', kick: this.mayhem ? 'Boss Rush Mayhem' : 'Rush de jefes', bosses: this.order.map((m) => JEFES[m]), beaten: won ? n : this.i });
    // (el fast restart arma el mapa solo, no el rush: se vuelve al menú)
    const r = s.querySelector('[data-act="restart"]');
    if (r) r.hidden = true;
  }

  // Fundido a negro (y al terminar, cb).
  // (ms: lo que dura el fundido; de arena en arena, fadeViaje)
  cover(cb, ms = FADE_MS) {
    const g = this.g;
    let el = this.fadeEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mdu-rush-fade';
      g.root.appendChild(el);
      this.fadeEl = el;
      // (dos cuadros: que el navegador tome el transparente antes de fundir)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    } else {
      el.classList.remove('is-gone');
      el.classList.add('is-on');
    }
    el.style.transitionDuration = `${ms}ms`;
    if (cb) setTimeout(cb, ms + 100);
  }

  // Negro ya, sin fundido (debajo de la pantalla de carga, que también está en negro).
  blackNow() {
    const g = this.g;
    let el = this.fadeEl;
    if (!el) {
      el = document.createElement('div');
      g.root.appendChild(el);
      this.fadeEl = el;
    }
    el.className = 'mdu-rush-fade is-now is-on';
    void el.offsetWidth;
    el.classList.remove('is-now');
  }

  // El fundido a negro del viaje (y el destape, uncover) más cortos.
  fadeViaje() {
    this.rapido = true;
    return this.rapido ? FADE_VIAJE : FADE_MS;
  }

  uncover() {
    clearTimeout(this.hintT);
    const el = this.fadeEl;
    if (!el) return;
    this.fadeEl = null;
    // (de arena en arena, el destape también más corto: fadeViaje)
    const ms = this.rapido ? FADE_DESTAPE : FADE_MS;
    this.rapido = false;
    el.style.transitionDuration = `${ms}ms`;
    el.classList.remove('is-on');
    setTimeout(() => el.remove(), ms + 300);
  }

  // Se sale del rush (al menú, se cerró la sala): el título vuelve al mapa del jugador.
  stop() {
    const g = this.g;
    if (this.fadeEl) {
      this.fadeEl.remove();
      this.fadeEl = null;
    }
    this.ui?.close(true);
    clearInterval(this.draftIv);
    clearTimeout(this.hintT);
    // (la arena que se armaba de fondo: se suelta; prep)
    this.wantPrep = false;
    g.arrival?.dropPre();
    this.drafting = null;
    this.enterAt = null;
    this.newRunAt = null;
    this.won = false;
    this.roomPick = false;
    this.roomMayhem = false;
    this.mh.reset();
    // (fuera del rush: sin mejoras y los especialistas de la armería)
    this.build.reset();
    Armas.especialistasDePartida(null);
    if (!this.on) return;
    this.on = false;
    this.sinPuntos();
    this.going = false;
    const id = g.settings?.map;
    if (id && id !== g.mapId) {
      g.mapId = id;
      g.mode = g.settings.mode || 'story';
    }
  }
}
