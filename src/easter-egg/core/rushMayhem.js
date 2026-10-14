// El Boss Rush Mayhem (el usuario, 2026-10-13: "Boss Rush Mayhem: misma idea
// que la boss rush, pero los jefes están más op y pueden tener ataques y
// patrones nuevos o combinar dos a la vez. No habrá grises salvo algún gris
// que sea necesario para tener una buena build, de lo contrario todo dorado y
// prismático, prismático tendrá más chances de aparecer.")
//
// Es el mismo rush (core/bossRush.js: los mismos jefes, arenas, cartas y viaje
// entre arenas) con la bandera `mayhem`; se elige en el menú de jugar y en la
// sala, al lado del rush (ui/PlayMenu.js, ui/Lobby.js). Lo propio está acá:
// - MAYHEM: los números, por el lugar en el orden (vida, lo rápido que corren
//   los relojes de ataque, el daño que reciben ustedes y cada cuánto un combo).
// - El pozo: sin grises salvo los dos que hacen falta para armarse (Mule Kick,
//   el tercer mate; y el Elemento, la segunda pasada del Pack-a-Pava de oro),
//   que salen solo si todavía te faltan. Lo demás oro y prismático, con más
//   prismáticas que en el rush (MAYHEM.prisma).
// - Los combos (anfitrión): dos ataques de siempre a la vez o encadenados, y
//   patrones nuevos hechos con lo mismo (la lluvia de cada arena en anillo, en
//   cruz o en fila). Solo con los clips que ya tienen: la regla del usuario es
//   no tocar las animaciones de pelea, quieto mientras tira y el que camina
//   nunca corre. Cada combo avisa antes, en todas las compus: un aro morado
//   que se abre a los pies del jefe, un fogonazo y un bramido (mfx); después,
//   los avisos de siempre de cada ataque (el círculo de la lluvia, el tiro que
//   arma quieto, el aro del molinete, el escarbar del Luisón...).
//
// - Clips nuevos (el usuario dijo que sí, 2026-10-13; entities/skins/mayhemClips.js):
//   el Mandinga y el Gil avisan el combo con un grito (quietos, se encorvan y
//   gritan con los brazos abiertos: el aro, el fogonazo y el bramido van cuando
//   gritan) y el Espantapájaros tiene un combo más, el salto de ataque
//   (saltoAnillo): tres trancos, salta hacia uno y cae clavando las manos donde
//   avisa un círculo morado, y alrededor de donde cae, la lluvia en anillo.
//
import * as THREE from 'three';
import { POZO } from './rushCards';
import { tierOf, maxTier } from '../config/weapons';
import { BOSS_DAMAGE } from '../config/rules';
import { mhClip, mhScale, mhTravel, RUGE } from '../entities/skins/mayhemClips';

// ---- los números (para ajustar), del 1.º al 6.º jefe ----
// (el rush: vida 0,55 a 2 y relojes 0,85 a 1,4; core/bossRush.js RUSH_HP, RUSH_PACE)
export const MAYHEM = {
  hp: [0.85, 1.25, 1.7, 2.15, 2.6, 3.0],
  pace: [1.15, 1.25, 1.35, 1.45, 1.55, 1.65],
  // lo que pega todo en la pelea, a ustedes (entities/Player.js damage)
  dmg: [1.2, 1.3, 1.4, 1.5, 1.6, 1.75],
  // segundos entre combo y combo; el primero, a los `first` de empezar la pelea
  combo: [15, 13.5, 12, 11, 10, 9],
  first: 7,
  // del aviso al ataque (s)
  aviso: 0.8,
  // si el combo no pudo arrancar en este rato (el jefe lejos, ocupado), se suelta
  espera: 6,
  // el coloso del castillo: tiros cargados de más por gema (el rush: 1)
  gemas: 2,
  // las cartas: de las que no son grises, cuántas prismáticas (en el rush, 1 de 3 buenas)
  prisma: 0.45,
  // en cada set, la chance de un gris de los necesarios (si todavía te falta)
  grisNec: 0.3,
};

// ---- las cartas ----
// (D.pozo: core/rushCards.js options lo usa en vez de POZO)
export const POZO_MAYHEM = { gris: { perk: ['mule'], elem: true }, oro: POZO.oro, prisma: POZO.prisma };

// La bolsa de la partida: sets de oro y prismático (sin grises: los pone mayhemTiers).
export function mayhemBag(sets, per = 3, rnd = Math.random) {
  return Array.from({ length: sets }, () => Array.from({ length: per }, () => (rnd() < MAYHEM.prisma ? 'prisma' : 'oro')));
}

// ¿Te falta un gris de los necesarios? (Mule Kick, o el Elemento de un mate con el Pack-a-Pava de oro)
export const grisFalta = (D) => !D.perks.includes('mule') || D.guns.some((x) => tierOf(x.up) === 1 && maxTier(x.id) >= 2);

// Los tiers de un set: a veces uno de oro pasa a gris, si te falta uno de los necesarios.
export function mayhemTiers(tiers, D, rnd = Math.random) {
  const t = (tiers || ['oro', 'oro', 'prisma']).slice();
  if (rnd() < MAYHEM.grisNec && grisFalta(D)) {
    const i = t.indexOf('oro');
    if (i >= 0) t[i] = 'gris';
  }
  return t;
}

// ---- los combos de cada jefe ----
// tiroLluvia: el tiro de siempre (arma quieto) y, al soltarlo, lluvia en anillo
//   alrededor de cada uno (sale por los huecos). En el Gil, el molinete.
// fila: la lluvia en fila, del jefe hacia cada uno y más allá, de a una.
// cruz: la lluvia en cruz sobre cada uno (se sale en diagonal).
// muroLluvia (Mandinga): el muro de fuego que pasa por uno y la lluvia de siempre.
// tierraLluvia (Espantapájaros): se mete bajo tierra y, donde va a salir, lluvia en anillo.
// remolinoOnda (Francisco): el remolino que los arrastra y el golpe con dos ondas.
// dobleSalto (Francisco, al final): se esfuma y golpea dos veces seguidas.
// aullidoSalto / aullidoLlamado / saltoZarpazo (Luisón): el aullido y enseguida
//   el salto, o el llamado; el salto y enseguida el zarpazo.
// manotazoYerba (coloso): el manotazo y yerba prendida que cae alrededor.
// fuegoRayos (coloso): el fuego del ojo y rayos alrededor de cada uno.
// esfumadaTiro (duende): se esfuma, tira la bola enseguida y deja yerba maldita.
const COMBOS = {
  molino: ['tiroLluvia', 'fila', 'muroLluvia'],
  granja: ['tiroLluvia', 'cruz', 'tierraLluvia', 'saltoAnillo'],
  penal: ['tiroLluvia', 'fila', 'cruz'],
  esteros: ['aullidoSalto', 'saltoZarpazo', 'aullidoLlamado'],
  torre: ['remolinoOnda', 'tiroLluvia', 'cruz', 'dobleSalto'],
  castillo: ['manotazoYerba', 'fuegoRayos', 'esfumadaTiro'],
};
const TORRE_PELEA = ['p1', 'p2', 'p3'];
// el salto del Espantapájaros: de dónde a dónde salta (m al más cercano), el radio
// del golpe al caer, cuánto más adelante que la cadera clavan las manos (m del
// modelo) y cuánto antes de aquel (m: si clava justo ahí, el cuerpo le queda encima)
const SALTO = { min: 8, max: 16, r: 2.8, manos: 0.65, antes: 2 };
const COLOR = 0xd040ff;
const COLOR_V = [0.85, 0.3, 1];

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export class Mayhem {
  constructor(g, R) {
    this.g = g;
    this.R = R;
    this.reset();
  }

  // Cada pelea de cero (bossRush.onNewRun, stop).
  reset() {
    this.t = MAYHEM.first;
    this.armed = null;
    // (el jefe que está gritando: el grito dura su clip aunque el combo ya haya salido)
    this.roar = null;
    this.k = Math.floor(Math.random() * 4);
    this.log = [];
  }

  // (anfitrión, cada cuadro: bossRush.harden)
  update(dt) {
    const g = this.g;
    const b = g.zombies?.boss;
    const A = g.arena?.active ? g.arena : null;
    if (this.roar) this.roarTick(A);
    // (un grito o un salto que quedó sin combo —se soltó, se reinició—: a perseguir)
    else if (!this.armed && b && !b.dead && (b.state === 'mhRoar' || b.state === 'mhSalto')) g.zombies.setState(b, 'chase');
    if (this.armed) {
      this.watch(A, b);
      return;
    }
    const list = this.ready(A, b);
    if (!list) return;
    this.t -= dt;
    if (this.t > 0) return;
    if (!list.length) {
      this.t = 0.5;
      return;
    }
    this.t = MAYHEM.combo[this.R.i] ?? 12;
    this.arm(list[this.k++ % list.length], A, b);
  }

  // Qué combos se pueden ahora (null: no hay pelea; [] : hay, pero ahora no).
  ready(A, b) {
    const map = this.R.cur.map;
    const all = COMBOS[map] || [];
    if (map === 'esteros') {
      if (!b || b.dead || b.kind !== 'luison' || !this.R.entered) return null;
      if (b.state !== 'chase') return [];
      // (el salto, de 7 a 18 m y viéndolo; el aullido, a menos de 16: entities/Zombies.js)
      let d = 99;
      let near = null;
      for (const p of this.g.zombies.moves.standing()) {
        const k = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
        if (k < d) {
          d = k;
          near = p;
        }
      }
      const sees = () => !!near && this.g.world.clear(tmpV.set(b.pos.x, (b.baseY || 0) + 1.4, b.pos.z), tmpW.set(near.pos.x, (near.pos.y || 0) + 1.4, near.pos.z));
      return all.filter((id) => (id === 'saltoZarpazo' ? d > 7.5 && d < 17 && (this.t > 0 || sees()) : d < 15));
    }
    if (!A || A.phase === 'won') return null;
    if (map === 'castillo') {
      if (A.stage === 'gems') return ['manotazoYerba', 'fuegoRayos'];
      const N = A.gnome;
      if (A.stage === 'gnome' && N?.root.visible) return !A.trick && N.stun <= 0 && N.cower <= 0 ? ['esfumadaTiro'] : [];
      return null;
    }
    if (A.phase !== 'fight' || !b || b.dead) return null;
    if (map === 'torre' && !TORRE_PELEA.includes(A.stage)) return null;
    if (b.state !== 'chase') return [];
    return all.filter((id) => {
      if (id === 'muroLluvia') return !!A.fcols?.length && !A.fcols.some((F) => F.t >= 0);
      if (id === 'tierraLluvia') return b.kind === 'scarecrow' && !A.ward;
      if (id === 'dobleSalto') return A.stage === 'p3';
      if (id === 'saltoAnillo') return this.leapTarget(A, b) != null;
      return true;
    });
  }

  // Avisa y, al rato, arranca.
  arm(id, A, b) {
    const g = this.g;
    const at = this.bossAt(A, b);
    this.armed = { id, at: g.time + MAYHEM.aviso, until: g.time + MAYHEM.aviso + MAYHEM.espera, step: 0 };
    this.log.push(id);
    // (que el de siempre no se meta bajo tierra mientras avisa: saldrían dos seguidos)
    if (id === 'tierraLluvia') A.digT = Math.max(A.digT ?? 0, 10);
    // (el salto: se planta mientras avisa y mira a quién va; arranca desde quieto,
    // sin fundir los trancos con el paso)
    if (id === 'saltoAnillo' && b) b.holdT = Math.max(b.holdT || 0, MAYHEM.aviso + 0.15);
    // el Mandinga y el Gil avisan gritando (quietos: el estado mhRoar, que el
    // invitado ve igual); el aro, el fogonazo y el bramido, cuando gritan, y el
    // combo, lo de siempre (MAYHEM.aviso) después
    if (this.roars(b)) {
      const C = this.armed;
      const k = RUGE.grita - RUGE.t0;
      g.zombies.setState(b, 'mhRoar');
      this.roar = b;
      C.at = g.time + k + MAYHEM.aviso;
      C.until = C.at + MAYHEM.espera;
      const p = at.clone();
      g.later(k, () => this.armed === C && this.tell(p));
      return;
    }
    this.tell(at);
  }

  // ¿Avisa con el grito? (el clip llegó, está persiguiendo y no lo tienen las almas)
  roars(b) {
    if (!b || b.dead || b.state !== 'chase' || (b.kind !== 'mandinga' && b.kind !== 'gil')) return false;
    return !!mhClip(b.kind, 'ruge') && !this.g.arena?.held?.active;
  }

  // (anfitrión, cada cuadro mientras grita) Quieto y sin tirar; al terminar el clip, a perseguir.
  roarTick(A) {
    const b = this.roar;
    if (b !== this.g.zombies?.boss || b.dead || b.state !== 'mhRoar') {
      this.roar = null;
      return;
    }
    const left = RUGE.fin - RUGE.t0 - b.stateT;
    // (que no tire en medio del grito, ni enseguida al terminar sin armar el tiro)
    if (A) A.fireT = Math.max(A.fireT, left + 0.9);
    if (left <= 0) {
      this.g.zombies.setState(b, 'chase');
      this.roar = null;
    }
  }

  // Dónde avisa: a los pies del jefe (el coloso y el duende, los suyos).
  bossAt(A, b) {
    if (this.R.cur.map === 'castillo' && A) {
      if (A.stage === 'gnome' && A.gnome) return tmpV.copy(A.gnome.pos);
      // (el coloso es enorme: el aviso, en los ojos, que es lo que se ve)
      return A.eyePos(tmpV);
    }
    return b ? tmpV.set(b.pos.x, b.baseY || 0, b.pos.z) : tmpV.set(A?.A.x || 0, A?.A.y || 0, A?.A.z || 0);
  }

  // ---------------- el aviso (todas las compus) ----------------
  tell(at) {
    const m = { a: 'mfx', x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) };
    this.R.send(m);
    this.onFx(m);
  }

  onFx(m) {
    const g = this.g;
    if (m.k === 'marca') return this.markFx(m);
    if (m.k === 'golpe') return this.slamFx(m);
    const p = new THREE.Vector3(m.x, m.y, m.z);
    // un aro morado que se abre por el piso
    const n = 36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.fx.add?.spawn(p.x + c * 0.8, p.y + 0.25, p.z + s * 0.8, c * 7, 0.4, s * 7, { color: COLOR_V, size: 0.32, size1: 0.05, life: 0.55, drag: 2 });
      g.fx.add?.spawn(p.x + c * 0.5, p.y + 0.3, p.z + s * 0.5, c * 3.5, 1.6, s * 3.5, { color: [1, 0.6, 1], size: 0.18, size1: 0, life: 0.7, drag: 1.5 });
    }
    g.fx.flash(p, COLOR, 14, 0.6, 14);
    g.audio.growl(tmpV.set(p.x, p.y + 2, p.z), 'boss');
    const a = g.audio;
    if (a.ctx) {
      const o = a.out({ pos: tmpV.set(p.x, p.y + 1.5, p.z), reverb: 0.6, gain: 1 });
      a.tone(o, { dur: 0.7, type: 'sawtooth', freq: 150, freqEnd: 62, gain: 0.32, attack: 0.01 });
      a.tone(o, { dur: 0.7, type: 'square', freq: 224, freqEnd: 93, gain: 0.12, attack: 0.01, detune: 9 });
      a.tone(o, { dur: 0.45, type: 'sine', freq: 880, freqEnd: 1320, gain: 0.08, attack: 0.02 });
    }
  }

  // ---------------- lo que hace cada combo (anfitrión) ----------------
  watch(A, b) {
    const g = this.g;
    const C = this.armed;
    if (g.time < C.at) return;
    const fight = this.R.cur.map === 'castillo' ? !!A : !!b && !b.dead;
    if (!fight || g.time > C.until) {
      this.armed = null;
      return;
    }
    const done = this[C.id]?.(C, A, b) !== false;
    if (done) this.armed = null;
  }

  // (cada combo devuelve false mientras sigue: lo llaman cada cuadro hasta que termina)
  tiroLluvia(C, A, b) {
    if (C.step === 0) {
      C.step = 1;
      C.cast = b.castAt;
      C.sweep = !!A.sweepS;
      // que arme el tiro ya (quieto, con su clip: Arena.update)
      A.fireT = Math.min(A.fireT, 1.3);
      return false;
    }
    // el Gil revolea la cadena (world/Cerro.js sweep); los demás sueltan el tiro (Arena.ranged)
    const gil = b.kind === 'gil';
    if (gil ? !(A.sweepS && !C.sweep) : b.castAt === C.cast) {
      if (gil && !A.sweepS) C.sweep = false;
      if (gil) A.fireT = Math.min(A.fireT, 0.8);
      return false;
    }
    for (const p of A.standing()) this.rain(A, this.anillo(A, p.x, p.z, true));
    return true;
  }

  fila(C, A, b) {
    const g = this.g;
    const r = A.rainR || 1.8;
    for (const p of A.standing()) {
      const dx = p.x - b.pos.x;
      const dz = p.z - b.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d;
      const uz = dz / d;
      // (por lo menos 4, aunque esté cerca)
      let i = 0;
      for (let s = r * 1.6; i < 4 || s < d + r * 3.2; s += r * 1.7, i++) {
        const pt = [[b.pos.x + ux * s, b.pos.z + uz * s]];
        g.later(i * 0.13, () => A.active && A.phase === 'fight' && this.rain(A, pt));
      }
    }
  }

  cruz(C, A) {
    const r = A.rainR || 1.8;
    for (const p of A.standing()) {
      const a0 = Math.random() * Math.PI;
      const pts = [[p.x, p.z]];
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k * Math.PI) / 2;
        for (const s of [r * 2, r * 4]) pts.push([p.x + Math.cos(a) * s, p.z + Math.sin(a) * s]);
      }
      this.rain(A, pts);
    }
  }

  muroLluvia(C, A) {
    const g = this.g;
    if (A.fcols.some((F) => F.t >= 0)) return;
    const list = A.standing();
    const p = list[Math.floor(Math.random() * list.length)];
    if (!p) return;
    const a = +(Math.random() * Math.PI).toFixed(3);
    const x = +p.x.toFixed(2);
    const z = +p.z.toFixed(2);
    A.spawnFireCols([a], x, z);
    g.net?.event('bfx', { k: 'fcol', a: [a], x, z });
    A.fireRain();
  }

  tierraLluvia(C, A, b) {
    const g = this.g;
    if (b.state !== 'chase') return false;
    const M = g.zombies.moves;
    const list = M.standing().filter((p) => !p.maizIn);
    const tp = list[Math.floor(Math.random() * list.length)];
    if (!tp) return;
    M.startBurrow(b, M.idOf(tp));
    // (que el de siempre no venga enseguida atrás)
    A.digT = Math.max(A.digT ?? 0, 8);
    // cuando el aro deja de seguirlo (bossMoves SINK + HIDE), la lluvia alrededor de donde sale
    g.later(3.4, () => {
      if (!A.active || A.phase !== 'fight' || b.dead) return;
      this.rain(A, this.anillo(A, tp.pos.x, tp.pos.z, false));
    });
  }

  // (el golpe, apenas puede: si estaba en otra cosa, cuando vuelve a perseguir)
  remolinoOnda(C, A, b) {
    const g = this.g;
    if (C.step === 0) {
      C.step = 1;
      C.next = g.time + 0.5;
      A.pull(2.6);
      g.net?.event('pee', { pull: 2.6 });
      return false;
    }
    if (g.time < C.next || b.state !== 'chase') return false;
    A.slam(b, 2);
  }

  dobleSalto(C, A, b) {
    const g = this.g;
    // 0: que se esfume ya; 1: se esfumó, al rato otra vez; 2: la segunda
    if (C.step === 0) {
      C.step = 1;
      A.blinkCd = 0;
      return false;
    }
    if (C.step === 1) {
      if (A.blinkCd <= 0) return false;
      C.step = 2;
      C.next = g.time + 1.6;
      return false;
    }
    if (g.time < C.next) return false;
    if (C.step === 2) {
      C.step = 3;
      A.blinkCd = 0;
      return false;
    }
    return A.blinkCd > 0;
  }

  // El Luisón: arranca uno (el aullido o el salto: sts, sus estados en
  // entities/Zombies.js) y, cuando termina y vuelve a perseguir, el siguiente ya.
  // (si estaba en otra cosa —un zarpazo, un salto suyo—, espera a que termine)
  luison(C, b, sts, first, then) {
    if (C.step === 0) {
      if (b.state !== 'chase') return false;
      C.step = 1;
    }
    if (C.step === 1) {
      if (sts.includes(b.state)) C.step = 2;
      else if (b.state === 'chase') first(b);
      return false;
    }
    if (b.state !== 'chase') return false;
    then(b);
    return true;
  }

  aullidoSalto(C, A, b) {
    return this.luison(C, b, ['howl'], (z) => (z.howlCd = 0), (z) => {
      z.chargeCd = 0;
      z.whipCd = 0;
    });
  }

  aullidoLlamado(C, A, b) {
    return this.luison(C, b, ['howl'], (z) => (z.howlCd = 0), (z) => {
      z.summonCd = 0;
    });
  }

  // (si en el aviso ya se le vino encima y no le da para el salto, el primero
  // es el zarpazo o el golpe de cerca, y después otro zarpazo)
  saltoZarpazo(C, A, b) {
    return this.luison(C, b, ['chargeWind', 'whipWind', 'slam'], (z) => {
      z.chargeCd = 0;
      z.whipCd = 0;
    }, (z) => {
      z.whipCd = 0;
    });
  }

  manotazoYerba(C, A) {
    const list = A.standing();
    const p = list[Math.floor(Math.random() * list.length)];
    if (!p) return;
    const atk = (m) => {
      A.send(m);
      A.attackFx(m);
    };
    atk({ gg: 'atk', k: 'slam', x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * Math.PI * 2) / 3;
      const [x, z] = this.inside(A, p.x + Math.cos(a) * 4.6, p.z + Math.sin(a) * 4.6) || [];
      if (x != null) atk({ gg: 'atk', k: 'meteor', x: +x.toFixed(1), z: +z.toFixed(1), sky: 1 });
    }
  }

  fuegoRayos(C, A) {
    A.fireball(A.eyePos(tmpV).clone(), 3);
    for (const p of A.standing()) {
      const a0 = Math.random() * Math.PI * 2;
      const pts = [[p.x, p.z]];
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * Math.PI * 2) / 3;
        pts.push([p.x + Math.cos(a) * 3.4, p.z + Math.sin(a) * 3.4]);
      }
      for (const [x0, z0] of pts) {
        const q = this.inside(A, x0, z0);
        if (!q) continue;
        const m = { gg: 'atk', k: 'bolt', x: +q[0].toFixed(1), z: +q[1].toFixed(1) };
        A.send(m);
        A.attackFx(m);
      }
    }
  }

  esfumadaTiro(C, A) {
    const N = A.gnome;
    if (!N?.root.visible || A.stage !== 'gnome') return;
    if (C.step === 0) {
      C.step = 1;
      N.blinkT = 0;
      return false;
    }
    if (N.blinkT <= 0) return false;
    // (se esfumó: la bola ya, con su clip de tiro —la arma 0,4 s antes—, y la yerba donde cayó)
    N.throwT = Math.min(N.throwT, 0.9);
    N.mineT = 0;
  }

  // ---------------- el salto de ataque del Espantapájaros ----------------
  // A quién salta: el más cercano de pie (fuera del maizal) entre SALTO.min y
  // SALTO.max, si el clip llegó (null: ahora no).
  leapTarget(A, b) {
    const c = mhClip('scarecrow', 'saltoAtaque');
    const s = mhScale('scarecrow');
    if (!b || b.kind !== 'scarecrow' || !A || A.ward || !c || !(s > 0)) return null;
    let best = null;
    let bd = Infinity;
    const run = mhTravel(c, c.up) * s;
    for (const p of this.g.zombies.moves.standing()) {
      if (p.maizIn) continue;
      const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      if (d < SALTO.min || d > SALTO.max || d >= bd) continue;
      // (los trancos, por lugar libre: no se lo frena ni se lo corre mientras pisa)
      const ux = (p.pos.x - b.pos.x) / d;
      const uz = (p.pos.z - b.pos.z) / d;
      let ok = true;
      for (let k = 0.5; k <= run + 0.01 && ok; k += 0.5) ok = this.free(A, b, ux, uz, k);
      if (!ok) continue;
      bd = d;
      best = p;
    }
    return best;
  }

  // (anfitrión) El clip va en el lugar: el jefe avanza lo que el clip (travel) por
  // la escala del cuerpo. En el aire, el tramo se estira o se acorta (sin pisar no
  // se nota) para caer donde estaba aquel al despegar; ahí avisa el círculo y,
  // alrededor, la lluvia en anillo. Al caer, pega a los que estén en el círculo.
  saltoAnillo(C, A, b) {
    const g = this.g;
    const c = mhClip('scarecrow', 'saltoAtaque');
    if (C.step === 0) {
      if (b.state !== 'chase') return false;
      const p = this.leapTarget(A, b);
      if (!p || !c) return;
      const dx = p.pos.x - b.pos.x;
      const dz = p.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      C.step = 1;
      C.who = p;
      C.ux = dx / d;
      C.uz = dz / d;
      C.yaw0 = b.yaw;
      C.yaw = Math.atan2(dx, dz);
      C.s = mhScale('scarecrow');
      C.k = 1;
      C.D = 0;
      g.zombies.setState(b, 'mhSalto');
      b.holdT = 0;
      b.mhT = 0;
      // (que no se meta bajo tierra ni tire el zapallo en medio)
      A.digT = Math.max(A.digT ?? 0, c.dur + 4);
      A.fireT = Math.max(A.fireT, c.dur + 1);
      return false;
    }
    if (b.dead || b.state !== 'mhSalto' || !c) return;
    const t = b.stateT;
    // al despegar: dónde cae (lo que la cadera avanza hasta pisar, para que las
    // manos claven donde estaba aquel) y el aviso
    if (C.step === 1 && t >= c.up) {
      C.step = 2;
      // (desde donde está ahora: lo que falta de los trancos, el vuelo y las manos)
      const run = mhTravel(c, c.up) * C.s - C.D;
      const fly = (mhTravel(c, c.land) - mhTravel(c, c.up)) * C.s;
      const P = C.who?.pos;
      const want = (P ? (P.x - b.pos.x) * C.ux + (P.z - b.pos.z) * C.uz : run + fly) - SALTO.antes;
      C.k = Math.max(0.55, Math.min(1.5, (want - SALTO.manos * C.s - run) / fly));
      // (adentro de la arena: si no, más corto)
      const R = A.A;
      for (let i = 0; i < 12; i++) {
        const D = run + fly * C.k + SALTO.manos * C.s;
        if (Math.hypot(b.pos.x + C.ux * D - R.x, b.pos.z + C.uz * D - R.z) < R.r - 2 || C.k <= 0.55) break;
        C.k = Math.max(0.55, C.k - 0.08);
      }
      // (que caiga en un lugar libre, y lo que retrocede al levantarse también: si
      // no, al volver a perseguir el mundo lo corría de golpe)
      const back = (mhTravel(c, c.dur) - mhTravel(c, c.land)) * C.s;
      const k0 = C.k;
      for (const dk of [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32]) {
        const k = k0 + dk;
        if (k < 0.55 || k > 1.5) continue;
        const L = run + fly * k;
        const H = L + SALTO.manos * C.s;
        const inA = Math.hypot(b.pos.x + C.ux * H - R.x, b.pos.z + C.uz * H - R.z) < R.r - 2;
        if ((inA || k <= k0) && this.free(A, b, C.ux, C.uz, L) && this.free(A, b, C.ux, C.uz, L + back)) {
          C.k = k;
          break;
        }
      }
      const D = run + fly * C.k + SALTO.manos * C.s;
      C.hx = b.pos.x + C.ux * D;
      C.hz = b.pos.z + C.uz * D;
      const m = { a: 'mfx', k: 'marca', x: +C.hx.toFixed(2), y: +(b.baseY || 0).toFixed(2), z: +C.hz.toFixed(2), r: SALTO.r, d: +(c.hit - c.up).toFixed(2) };
      this.R.send(m);
      this.onFx(m);
      this.rain(A, this.anillo(A, C.hx, C.hz, false));
    }
    // dónde va: lo del clip (en el aire, estirado o acortado). De a poco, sumando lo
    // de cada cuadro: si la arena lo corre de algo (un fardo), queda corrido y no
    // salta de golpe al volver a perseguir
    const T = mhTravel(c, t);
    const Tu = mhTravel(c, c.up);
    const Tl = mhTravel(c, c.land);
    const D = (t < c.up ? T : t < c.land ? Tu + (T - Tu) * C.k : Tu + (Tl - Tu) * C.k + (T - Tl)) * C.s;
    b.pos.x += C.ux * (D - C.D);
    b.pos.z += C.uz * (D - C.D);
    C.D = D;
    // (el cuerpo se dibuja antes que esto en el cuadro que viene: con este mismo
    // tiempo del clip, así el pie apoyado no tiembla con cuadros desparejos)
    b.mhT = t;
    // (se da vuelta para aquel mientras arranca, en el primer cuarto de segundo)
    let dy = C.yaw - C.yaw0;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const e = Math.min(1, t / 0.25);
    b.yaw = C.yaw0 + dy * e * e * (3 - 2 * e);
    // las manos en el piso: pega en el círculo
    if (C.step === 2 && t >= c.hit) {
      C.step = 3;
      const m = { a: 'mfx', k: 'golpe', x: +C.hx.toFixed(2), y: +(b.baseY || 0).toFixed(2), z: +C.hz.toFixed(2) };
      this.R.send(m);
      this.onFx(m);
      for (const p of g.zombies.moves.standing()) {
        if (Math.hypot(p.pos.x - C.hx, p.pos.z - C.hz) < SALTO.r && Math.abs((p.pos.y || 0) - (b.baseY || 0)) < 1.5) g.damagePlayer(p, BOSS_DAMAGE, b.pos);
      }
    }
    if (t < c.dur - 0.1) return false;
    b.mhT = null;
    g.zombies.setState(b, 'chase');
  }

  // ¿Está libre a d m de donde está, hacia (ux, uz)? Ni el mundo (como al caminar:
  // entities/Zombies.js moveBoss) ni lo de la arena (Arena.pushOut) lo corren.
  free(A, b, ux, uz, d) {
    const Z = this.g.zombies;
    const q = tmpW.set(b.pos.x + ux * d, b.pos.y, b.pos.z + uz * d);
    const x = q.x;
    const z = q.z;
    this.g.world.collide(q, 0.45, Z.bossFeet(b), (b.baseY || 0) + 2.4, Z.bossColl(b, b.skipCorn));
    A.pushOut?.(q, 0.6);
    return Math.hypot(q.x - x, q.z - z) < 0.02;
  }

  // (todas las compus) Dónde va a caer: el círculo morado que se llena hasta que pega.
  markFx(m) {
    const g = this.g;
    const A = g.arena;
    if (!A?.rainGeo) return;
    const group = new THREE.Group();
    group.position.set(m.x, m.y + 0.06, m.z);
    group.scale.setScalar(m.r);
    const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(A.rainGeo, mat);
    const fill = new THREE.Mesh(A.rainFill, mat.clone());
    fill.scale.setScalar(0.01);
    group.add(ring, fill);
    g.scene.add(group);
    this.anim(m.d, (k, end) => {
      const pulse = 0.7 + Math.sin(g.time * 20) * 0.3;
      mat.opacity = (0.4 + k * 0.5) * pulse;
      fill.material.opacity = 0.3 * k;
      fill.scale.setScalar(Math.max(0.01, k));
      if (end) {
        g.scene.remove(group);
        mat.dispose();
        fill.material.dispose();
      }
    });
  }

  // (todas las compus) Las manos y la horquilla contra el piso.
  slamFx(m) {
    const g = this.g;
    const p = new THREE.Vector3(m.x, m.y + 0.05, m.z);
    g.audio.bossSlam(p);
    g.fx.dust(p, { x: 0, y: 1, z: 0 }, [0.45, 0.38, 0.3], 22);
    g.fx.flash(p, COLOR, 10, 0.35, 10);
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fx.add?.spawn(p.x + Math.cos(a) * 0.6, p.y + 0.15, p.z + Math.sin(a) * 0.6, Math.cos(a) * 9, 0.6, Math.sin(a) * 9, { color: COLOR_V, size: 0.28, size1: 0.04, life: 0.5, drag: 2.5 });
    }
    const pp = g.player.pos;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    g.fx.addShake(d < 8 ? 0.6 : d < 18 ? 0.3 : 0.1);
  }

  // Cada cuadro hasta dur (en todas las compus, con los relojes del juego): fn(k de 0 a 1, terminó).
  anim(dur, fn) {
    const g = this.g;
    const t0 = g.time;
    const step = () => {
      const k = Math.min(1, (g.time - t0) / Math.max(0.01, dur));
      fn(k, k >= 1);
      if (k < 1) g.later(0, step);
    };
    step();
  }

  // ---------------- la lluvia de cada arena, en dibujos ----------------
  // Un anillo de 4 alrededor de (x, z), con o sin el del medio; huecos para salir.
  anillo(A, x, z, mid) {
    const r = A.rainR || 1.8;
    const pts = mid ? [[x, z]] : [];
    const a0 = Math.random() * Math.PI;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      pts.push([x + Math.cos(a) * r * 2, z + Math.sin(a) * r * 2]);
    }
    return pts;
  }

  // Adentro de la arena (si no, null).
  inside(A, x, z) {
    const R = A.A;
    return Math.hypot(x - R.x, z - R.z) < R.r - 0.8 ? [x, z] : null;
  }

  // Los círculos de la lluvia (todas las compus: 'frain').
  rain(A, pts) {
    const flat = [];
    for (const [x0, z0] of pts) {
      const q = this.inside(A, x0, z0);
      if (q) flat.push(+q[0].toFixed(1), +q[1].toFixed(1));
    }
    if (!flat.length) return;
    A.spawnRain(flat);
    this.g.net?.event('frain', { p: flat });
  }
}
