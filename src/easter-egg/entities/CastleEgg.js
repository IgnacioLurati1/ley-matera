import * as THREE from 'three';
import { EE } from '../config/map';
import { WEAPONS } from '../config/weapons';
import Avatars from '../net/Avatars';
import { FierroNpc } from '../ui/fierroNpc';
import Altares from './castle/Altares';
import QuestFuego from './castle/QuestFuego';
import QuestViento from './castle/QuestViento';
import QuestRayo from './castle/QuestRayo';
import QuestHielo from './castle/QuestHielo';
import Mateendrache from '../world/Mateendrache';
import Dragon from './castle/Dragon';
import Cueva from './castle/Cueva';
import Vanguardia from './castle/Vanguardia';
import Cronicas from './castle/Cronicas';
import Tirolesa from './castle/Tirolesa';
import Termas from './castle/Termas';
import Sortija from './castle/Sortija';
import Taba from './castle/Taba';
import Munecos from './castle/Munecos';
import Asedio from './castle/Asedio';
import SongEgg from '../world/SongEgg';
import CastleOrigin from '../ui/CastleOrigin';
import { skinPap } from '../world/castleRooms';
import { ELEMENTS, ELEM_NAME, isHost, myId, announce, toastAll, glow } from './castle/common';

// Easter egg del castillo del Mateendrache: "La Gran Guerra". Lo guía Martín
// Fierro, que espera junto al fogón del gran salón.
//  1. Los cuatro mates de la luz (fuego, viento, rayo y hielo), cada uno con
//     su vuelta (entities/castle/Quest*.js) y su altar (Altares.js).
//  2. Con los cuatro, Fierro cuenta el origen de los mates (la escena).
//  3. El temple: cada mate se mejora en su altar aguantando un encierro.
//  4. El despertar del Mateendrache: el mate gigante del dragón.
//  5. Las cadenas del dragón (un tiro cargado de cada elemento).
//  6. La vanguardia del Chiquitijuein: cuatro Caballeros Negros.
//  7. El juramento: todos juntos al lado del dragón, que los lleva a...
//  8. La Gran Guerra (world/GranGuerra.js).
// En línea lo lleva el anfitrión: los invitados avisan con 'pee' y el estado
// entero viaja en cada cambio (netSync).

const STEPS = ['Los mates de la luz', 'El origen', 'El temple', 'La cueva', 'El despertar', 'Las cadenas', 'La vanguardia', 'El juramento'];
const FIERRO = {
  intro: [
    'Arrímense al fuego, paisanos. Martín Fierro, otra vez. Ya nos conocemos... y acá estamos de nuevo, al pie de la cordillera.',
    'Se viene la Gran Guerra. El Chiquitijuein, el señor oscuro, juntó almas en todos lados. Ahora viene por todo.',
    'Hace mucho, cuatro caballeros lo bajaron del trono con los mates de la luz. Fuego, viento, rayo y hielo.',
    'Esos mates duermen en este castillo, cada uno escondido a su manera. Despiértenlos.',
    'El fuego empieza con yesca de cardón; el viento, con las veletas; el rayo, rezando en la capilla; el hielo, en la cumbre.',
  ],
  hints: {
    fuego: 'La Salamandra del Pillán come yesca de cardón. Hay tres atados por el castillo... y una fragua con hambre.',
    viento: 'Las veletas de los techos (la biblioteca, la capilla, la caballeriza y la cocina) tienen que mirar al oeste, a la cordillera, de donde baja el Zonda. Un tiro las gira.',
    rayo: 'Illapa habla con campanas. Primero se le reza en el altar de la capilla; después, a tiros en el campanario, en el orden de la luz.',
    hielo: 'En la cumbre, subiendo por la sala del trono, delante de la tumba del Caballero del Hielo, algo late adentro de un bloque. A cuchillazos, o con fuego.',
  },
  four: 'Los cuatro mates de la luz, juntos... Vengan al fogón, que les cuento de dónde salieron.',
  origin: [
    'Antes que todo, el Chiquitijuein ya reinaba. Chiquito, sí. Pero con un hambre más grande que la cordillera.',
    'Cuatro caballeros de la luz se le plantaron, cada uno con un mate que era un pedazo del mundo.',
    'Pelearon siete días y siete noches. Y el octavo lo bajaron del trono. De ESE trono, el de esta sala.',
    'Después durmieron los mates acá, en el castillo, con el dragón de guardia, para que nadie los usara para el mal.',
    'Pero el Chiquitijuein no se murió. Esperó. Y ahora la Gran Guerra vuelve. Esta vez... es el turno de ustedes de empuñarlos.',
  ],
  temple: 'Un mate sin templar es un mate a medias. En su altar se sopla el erke, y el que sopla aguanta adentro. Los demás, que lo cuiden.',
  tempered: 'Los cuatro templados. Ahora, el dragón. Duerme abajo de todo, detrás del hielo de la gruta. Esa pared pide fuego del bueno.',
  freed: '¡Se soltó! Miren cómo vuela... Va para el castillo. Síganlo, que el Chiquitijuein no se va a quedar mirando.',
  cumbre: 'Se terminó la vanguardia. El dragón los espera en la cumbre, entre las tumbas de los caballeros viejos. Vayan a jurar.',
  sworn: 'Cuatro caballeros otra vez. Suban al lomo. Y agárrense del poncho, que este no frena.',
};
export default class CastleEgg {
  constructor(game) {
    this.g = game;
    this.scene = null;
    // 0 sin hablar con Fierro, 1 los mates, 2 el origen (hablar con Fierro),
    // 3 el temple, 4 la cueva...
    this.step = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.altares = new Altares(this);
    this.quests = { fuego: new QuestFuego(this), viento: new QuestViento(this), rayo: new QuestRayo(this), hielo: new QuestHielo(this) };
    // el Mateendrache (duerme en la cueva hasta el final)
    this.dragonModel = new Mateendrache(game);
    this.root.add(this.dragonModel.root);
    this.dragon = new Dragon(this, this.dragonModel);
    this.cueva = new Cueva(this);
    this.vanguardia = new Vanguardia(this);
    // las crónicas de la Gran Guerra (actividad: pergaminos por el castillo)
    this.cronicas = new Cronicas(this);
    // la tirolesa del adarve a las termas
    this.tirolesa = new Tirolesa(this);
    // el baño en las termas (el Calor del Inca)
    this.termas = new Termas(this);
    // el juego de la sortija en el palenque
    this.sortija = new Sortija(this);
    // la taba (timba) en el palenque
    this.taba = new Taba(this);
    // la canción escondida de los tres muñecos de nieve
    this.munecos = new Munecos(this);
    // el asedio de cada 10 rondas (y el del easter egg, después del origen):
    // los muertos lo buscan por g.defense (Zombies.chase y pickSpawner, Rounds)
    this.asedio = new Asedio(this);
    this.defense = this.asedio;
    game.defense = this.asedio;
    // easter egg musical: tres anchos de espadas (world/SongEgg.js)
    this.song = new SongEgg(game, 'castillo');
    this.exitT = -1;
    this.npc = new Avatars(game, null);
    // (fuera de cuadro no se animan: net/Avatars offCull)
    this.npc.offCull = true;
    this.buildFierro();
    // (el cartel de qué hacer ya no se muestra: el usuario lo sacó el
    // 2026-09-26; la guía de cada mapa va aparte, en PDF)
    this.register();
    this.hint = 0;
    this.voiceT = 120;
    this.holdT = 0;
    // las luces de relleno de los salones altos no tienen lámpara a la vista:
    // sin el halo, que quedaba flotando en el aire
    for (const l of game.ambience?.lamps || []) if (l.e.def.noHalo) l.halo.visible = false;
    // el Pack-a-Pava: la pava metida en una poza de las termas
    this.papSteam = skinPap(game);
  }

  // ---------------- Martín Fierro ----------------
  buildFierro() {
    const g = this.g;
    const [x, z] = EE.fierro;
    const y = g.world.floorAt(x, z);
    const n = { id: 500, name: 'Martín Fierro', noTag: true, pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(46 - x, 33.5 - z) + Math.PI, pitch: 0.1, speed: 0, crouch: true, moving: false };
    this.npc.add(n);
    const a = this.npc.list.get(500);
    // el alma de Fierro: medio transparente, con el tinte del fuego
    for (const m of Object.values(a.M)) {
      m.transparent = true;
      m.opacity = 0.7;
      m.depthWrite = false;
      if (m.emissive) {
        m.emissive.set(0xff8a3a);
        m.emissiveIntensity = 0.35;
      }
    }
    a.M.poncho.color.set(0x9a2a1a);
    a.hand.visible = true;
    this.fierro = n;
    // (con los clips de Blender: en cuclillas junto al fuego y, cuando habla, cuenta con la mano)
    // (el alma, también con el cuerpo de verdad: transparente y con el tinte del fuego)
    this.fierroNpc = new FierroNpc(g, this.npc, n, { color: 0xff8a3a, intensity: 0.2 });
    this.fierroGlow = glow(g.textures, 0xffa050, 2.8, 0.35);
    this.root.add(this.fierroGlow);
  }

  // ---------------- el cartel del objetivo ----------------
  buildObjective() {
    const el = document.createElement('div');
    el.className = 'mdu-obj';
    el.hidden = true;
    this.g.hud.root.appendChild(el);
    this.objEl = el;
    this.objKey = '';
  }

  setObjective(o) {
    if (!this.objEl) return;
    const stage = this.step >= 5 ? { 5: this.cueva.ph < 4 ? 4 : 5, 6: 5, 7: 6, 8: 7 }[this.step] ?? STEPS.length : Math.max(0, this.step - 1);
    const key = o ? `${stage}|${JSON.stringify(o)}` : '';
    if (key === this.objKey) return;
    this.objKey = key;
    this.objEl.hidden = !o;
    if (!o) {
      this.objEl.innerHTML = '';
      return;
    }
    const pips = STEPS.map((_, i) => `<i class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}"></i>`).join('');
    const list = o.list ? `<ul>${o.list.map(([name, where, done]) => `<li class="${done ? 'is-done' : ''}">${name}${where ? ` <span>· ${where}</span>` : ''}</li>`).join('')}</ul>` : '';
    this.objEl.innerHTML =
      `<header><span>La Gran Guerra</span><em class="mdu-obj__pips">${pips}</em></header>` +
      `<p>${o.main}</p>${o.sub ? `<small>${o.sub}</small>` : ''}${o.count ? `<b class="mdu-obj__count">${o.count}</b>` : ''}${list}`;
  }

  objective() {
    const A = this.altares;
    if (this.step === 0) {
      // sin hablar con Fierro: igual se ve lo que ya arrancó
      const any = ELEMENTS.some((el) => this.quests[el].ph > 0);
      return any ? this.mateList('Los mates de la luz', 'Martín Fierro espera junto al fogón del gran salón') : null;
    }
    if (this.step === 1) return this.mateList('Los mates de la luz', 'Cada uno tiene su vuelta. Fierro da pistas junto al fogón.');
    if (this.step === 2) return { main: 'Los cuatro mates de la luz', sub: 'Martín Fierro los espera junto al fogón del gran salón' };
    if (this.step === 3) {
      const T = A.temper;
      return {
        main: 'El temple de los mates',
        sub: T ? `Templando el ${ELEM_NAME[T.el]}: ${Math.max(0, Math.ceil(75 - T.t))} s` : 'Cada mate en su altar; se sopla el erke y se aguanta el encierro',
        count: `${A.count(true)}/4`,
        list: A.list.map((a) => [`${ELEM_NAME[a.el]}${a.up ? ' templado' : ''}`, a.up ? '' : ALTAR_WHERE[a.el], !!a.up]),
      };
    }
    if (this.step === 4 || this.step === 5) return this.cueva.line();
    if (this.step === 6) return { main: 'El Mateendrache se soltó', sub: 'Salió volando de la cueva: vuelvan al castillo' };
    if (this.step === 7) return { main: 'La vanguardia del Chiquitijuein', sub: 'Los Caballeros Negros vienen por el patio (la rodela los cubre de frente)', count: `${this.vanguardia.dead}/4` };
    if (this.step === 8) return { main: 'El juramento', sub: 'En la cumbre, al lado del dragón: cada uno jura (mantener F)', count: `${this.vanguardia.sworn.size}/${this.g.net ? this.g.net.net.count : 1}` };
    // la Gran Guerra: lo que toca en cada parte de la pelea
    if (this.step === 9) return this.g.arena?.objective?.() || null;
    return null;
  }

  mateList(main, sub) {
    const list = ELEMENTS.map((el) => {
      const q = this.quests[el];
      const [text, count] = q.line();
      return [`${ELEM_NAME[el]}: ${text}`, count, q.done];
    });
    return { main, sub, count: `${ELEMENTS.filter((el) => this.quests[el].done).length}/4`, list };
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    g.interact.add({
      kind: 'ee',
      pos: this.fierro.pos.clone().setY(this.fierro.pos.y + 1.1),
      radius: 2.6,
      prompt: () => (this.scene ? null : { text: 'hablar con Martín Fierro', noCost: true }),
      cost: () => 0,
      use: () => {
        if (this.scene) return false;
        this.talk();
        return true;
      },
    });
  }

  // (anfitrión: la F del invitado llega por requestUse)
  talk() {
    const g = this.g;
    if (!isHost(g)) return;
    if (this.step === 0) {
      this.step = 1;
      this.lines('fierro', FIERRO.intro);
      this.netSync();
    } else if (this.step === 1) {
      // (si todavía está hablando no se le encima otra pista)
      const A = g.audio;
      if (A.ctx && (A.voiceEnd || 0) - A.ctx.currentTime > 0.3) return;
      // la pista del paso en que va cada vuelta: primero las empezadas (ahí es
      // donde uno se pierde), después las que no arrancaron, con la de arranque
      const pool = ELEMENTS.filter((el) => !this.quests[el].done);
      const going = pool.filter((el) => this.quests[el].hint?.());
      const list = [...going.map((el) => this.quests[el].hint()), ...pool.filter((el) => !going.includes(el)).map((el) => FIERRO.hints[el])];
      this.say('fierro', list.length ? list[this.hint++ % list.length] : FIERRO.four);
    } else if (this.step === 2) this.startOrigin();
    else if (this.step === 3) this.say('fierro', FIERRO.temple);
    else this.say('fierro', FIERRO.tempered);
    this.voiceT = 120;
  }

  say(who, text, delay = 0) {
    const g = this.g;
    if (!isHost(g)) return;
    const fn = () => g.say(who, text, 'npc');
    if (delay) g.later(delay, fn);
    else fn();
  }

  lines(who, list, start = 0) {
    let t = start;
    for (const text of list) {
      this.say(who, text, t);
      t += Math.max(2.5, text.length * 0.065 + 0.6);
    }
    return t;
  }

  // ---------------- pasos ----------------
  // Un mate llegó a su altar (lo llaman las vueltas en todas las compus).
  onMate(el) {
    const g = this.g;
    if (!isHost(g)) return;
    toastAll(g, `${WEAPONS[{ fuego: 'pillan', viento: 'zonda', rayo: 'illapa', hielo: 'penitente' }[el]].name}: el mate está en su altar`);
    if (this.step <= 1 && ELEMENTS.every((e) => this.quests[e].done)) {
      this.step = 2;
      this.say('fierro', FIERRO.four, 3);
      this.netSync();
    }
  }

  // La escena del origen de los mates (por ahora contada junto al fogón).
  // (anfitrión) Fierro cuenta de dónde salieron los mates: la escena, para todos.
  startOrigin() {
    const g = this.g;
    this.step = 3;
    // (el temple espera: el Chiquitijuein va a sentir despertar los mates)
    this.asedio.expectEarly();
    this.netSync();
    g.net?.event('ee', { cine: 'origen' });
    this.playOrigin();
  }

  playOrigin() {
    const g = this.g;
    if (this.scene) return;
    const cine = new CastleOrigin(g, FIERRO.origin);
    this.scene = { update: (dt) => cine.update(dt), kind: 'origen', cine };
    cine.play(() => {
      this.scene = null;
      if (!isHost(g)) return;
      // (el anfitrión la cortó o terminó: se termina para todos)
      g.net?.event('ee', { cine: 'end' });
      // (el Chiquitijuein sintió despertar los mates: antes del temple, el asedio)
      if (this.asedio.forceEarly()) return;
      this.templeHint();
    });
  }

  templeHint() {
    announce(this.g, 'Los mates de la luz se templan en su altar. Se sopla el erke y el que sopló aguanta el encierro.', 5);
    this.say('fierro', FIERRO.temple, 1);
  }

  // (anfitrión) Terminó un asedio: si estaban en el temple, ahora sí.
  asedioOver() {
    if (this.step === 3 && this.altares.count(true) < 4) this.templeHint();
  }

  // Las cuatro cadenas rotas (Cueva): el dragón se va volando y se posa en el techo.
  onFreed() {
    this.step = 6;
    this.dragon.setMode('exit');
    this.exitT = 11;
    this.say('fierro', FIERRO.freed, 1.5);
    this.netSync();
  }

  // (anfitrión) cayeron los cuatro Caballeros Negros: el dragón baja a la cumbre
  onVanguard() {
    const g = this.g;
    this.step = 8;
    this.dragon.setMode('cumbre');
    announce(g, 'Cayó la vanguardia. El dragón bajó a la cumbre de los caballeros. Vayan a jurar.', 5, true);
    this.say('fierro', FIERRO.cumbre, 2);
    this.netSync();
  }

  // (anfitrión) juraron todos: a la Gran Guerra
  onSworn() {
    const g = this.g;
    this.step = 9;
    this.say('fierro', FIERRO.sworn);
    this.netSync();
    // (antes, la ceremonia de los cuatro caballeros: castle/Juramento.js FINALE)
    g.later(6.5, () => this.startWar());
  }

  // El vuelo a la Gran Guerra (world/GranGuerra.js: el vuelo, el Éter y la pelea).
  startWar() {
    const g = this.g;
    this.dragon.mode = 'war';
    g.arena?.begin?.();
  }

  // Se terminó todo: la escena del final (por ahora, directo a la victoria).
  playEnding() {
    const g = this.g;
    g.stats.easterEgg = true;
    // (el anfitrión gana y avisa: a los invitados les llega el final con la tabla)
    if (isHost(g)) g.win();
  }

  // Un temple terminó bien (Altares).
  onTempered() {
    if (this.step === 3 && this.altares.count(true) === 4) {
      this.step = 4;
      this.say('fierro', FIERRO.tempered, 2.5);
      this.netSync();
    }
  }

  // ---------------- ganchos del juego ----------------
  onZone() {}

  onPower() {}

  dropHat() {}

  onShot(o, d, maxT) {
    if (this.g.arena?.active) return this.g.arena.onShot(o, d, maxT);
    for (const el of ['viento', 'rayo', 'hielo']) this.quests[el].onShot(o, d, maxT);
    this.sortija.onShot(o, d, maxT);
    this.asedio.onShot(o, d, maxT);
    return undefined;
  }

  // Cuchillo sin muerto adelante: el yunque o el bloque de hielo.
  onKnife(fwd) {
    return this.quests.fuego.onKnife(fwd) || this.quests.hielo.onKnife(fwd);
  }

  // El soplido del Zonda (sin cargar).
  onBlast(o, d, range, angle) {
    if (this.g.arena?.active) return this.g.arena.onBlast?.(o, d, range, angle);
    this.asedio.onBlast(o, d, range, angle);
    return undefined;
  }

  // Un tiro cargado recién salido (Elementales: el Illapa que llama al rayo).
  onCharged(el, o, d) {
    if (this.g.arena?.active) return undefined;
    this.asedio.onCharged(el, o, d);
    return undefined;
  }

  onExplosion(pos, r) {
    if (this.g.arena?.active) return this.g.arena.onExplosion(pos, r);
    this.quests.hielo.onExplosion(pos, r);
    return undefined;
  }

  onElemental(el, pos, charged) {
    if (this.g.arena?.active) return this.g.arena.onElemental(el, pos, charged);
    this.quests.hielo.onElemental(el, pos, charged);
    this.cueva.onElemental(el, pos, charged);
    this.asedio.onElemental(el, pos, charged);
    return undefined;
  }

  onKill(z) {
    if (!isHost(this.g)) return;
    this.quests.fuego.onKill(z);
    this.vanguardia.onKill(z);
    this.asedio.onKill(z);
  }

  // La cámara de la escena en curso (el vuelo a la Gran Guerra, las cinemáticas).
  sceneCam(dt) {
    return this.scene ? this.scene.update(dt) : false;
  }

  // ---------------- red ----------------
  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  fullState() {
    const qs = {};
    for (const el of ELEMENTS) qs[el] = this.quests[el].state();
    return { step: this.step, alt: this.altares.state(), qs, cu: this.cueva.state(), vgs: this.vanguardia.state(), dm: this.dragon.mode, as: this.asedio.state(), ...this.munecos.state() };
  }

  applyRemote(m) {
    if (m.song) {
      this.song.applyRemote(m.song);
      return;
    }
    // lo suelto de una vuelta (almas, campanas, plumas, rayos...)
    if (m.q) {
      this.quests[m.q]?.apply(m);
      return;
    }
    // las escenas
    if (m.cine === 'origen') return this.playOrigin();
    if (m.cine === 'end') return this.scene?.cine?.finish();
    // lo suelto de la cueva, la vanguardia y el dragón
    if (m.cv) return this.cueva.apply(m);
    if (m.vg) return this.vanguardia.apply(m);
    if (m.dr) return this.dragon.apply(m);
    if (m.gg) return this.g.arena?.onNet?.(m);
    if (m.ase) return this.asedio.onEvent(m);
    if (m.sn != null) return this.munecos.apply(m);
    if (m.step !== undefined) this.step = m.step;
    if (m.qs) for (const el of ELEMENTS) if (m.qs[el]) this.quests[el].apply(m.qs[el]);
    if (m.alt) this.altares.apply(m.alt);
    if (m.cu) this.cueva.apply(m.cu);
    if (m.vgs) this.vanguardia.apply(m.vgs);
    if (m.dm) this.dragon.setMode(m.dm);
    if (m.sns) this.munecos.apply(m, true);
    if (m.as) this.asedio.applyRemote(m.as);
  }

  // Lo que manda un invitado.
  onGuest(m, from) {
    if (m.a === 'alt') this.altares.onGuest(m, from);
    else if (m.a === 'q') this.quests[m.q]?.onGuest(m, from);
    else if (m.a === 'cueva') this.cueva.onGuest(m);
    else if (m.a === 'gg') this.g.arena?.onGuestHit?.(m, from);
    else if (m.a === 'as') this.asedio.onGuest(m, from);
  }

  // ---------------- atajos de prueba ----------------
  // Los cuatro mates en sus altares (para probar el temple).
  debugMates() {
    const g = this.g;
    if (!isHost(g)) return;
    for (const el of ELEMENTS) {
      const q = this.quests[el];
      if (!q.done) q.ph = { fuego: 4, viento: 3, rayo: 5, hielo: 4 }[el];
      this.altares.unlock(el);
    }
    this.step = 2;
    this.netSync();
    g.hud.subtitle('Modo prueba: los cuatro mates están en sus altares.', 3);
  }

  // Alt+K (solo): el último paso antes de la Gran Guerra. Los cuatro mates
  // templados, la cueva y la vanguardia hechas, el dragón posado en la cumbre
  // y el jugador al lado, con el Pillán Despierto en la mano, listo para jurar.
  debugFinal() {
    const g = this.g;
    if (!isHost(g) || this.step >= 9) return;
    this.debugStep(8);
    // (los pasos de golpe: cuatro altares que explotan y el retumbe de la cueva en el
    // mismo cuadro sacudían la cámara al máximo; queda un golpe leve.
    // globalThis.__mduNoJuraCalm = true: como antes)
    if (globalThis.__mduNoJuraCalm !== true) g.fx.shake = Math.min(g.fx.shake, 0.12);
    const D = this.dragon;
    D.flight = null;
    D.place('cumbre');
    D.D.setPose('stand', 0.3);
    const fuego = this.altares.list.find((A) => A.el === 'fuego');
    if (fuego && !this.altares.heldBy(myId(g))) this.altares.take(fuego, myId(g));
    const [x, z] = EE.jura;
    const p = g.player;
    p.pos.set(x + 2.2, g.world.floorAt(x + 2.2, z, 40), z);
    p.vel?.set(0, 0, 0);
    // mirando la cabeza del dragón
    p.yaw = Math.atan2(-(EE.cumbre[0] - p.pos.x), -(EE.cumbre[1] - p.pos.z));
    p.pitch = 0;
  }

  // Alt+M (solo, prueba): el siguiente mate de la luz en la mano (con Shift,
  // templado). Suelta el que tenía, porque se lleva uno solo a la vez.
  debugMate(up) {
    const g = this.g;
    const ids = ['pillan', 'zonda', 'illapa', 'penitente'];
    const w = g.weapons;
    const cur = w.slots.find((s) => ids.includes(s.id));
    const next = ids[(ids.indexOf(cur?.id) + 1) % ids.length];
    if (cur) w.drop(cur.id);
    w.give(next, up ? 1 : 0);
    g.hud.subtitle(`Modo prueba: ${WEAPONS[next].name}${up ? ' (templado)' : ''}.`, 3);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.altares.update(dt);
    this.song.update(dt);
    for (const el of ELEMENTS) this.quests[el].update(dt);
    this.cueva.update(dt);
    this.dragon.update(dt);
    this.asedio.update(dt);
    // el vapor de la poza del Pack-a-Pava
    const ps = this.papSteam;
    const cam = g.camera.position;
    if (ps && g.papq?.done && g.fx?.alpha && Math.random() < dt * 4 && Math.abs(cam.x - ps.x) + Math.abs(cam.z - ps.z) < 60) {
      g.fx.alpha.spawn(ps.x + (Math.random() - 0.5) * 1.2, ps.y, ps.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, { color: [0.86, 0.9, 0.94], size: 0.4, size1: 2, life: 2.5 + Math.random() * 1.5, alpha: 0.14, drag: 0.3 });
    }
    this.vanguardia.update(dt);
    this.cronicas.update(dt);
    this.tirolesa.update(dt);
    this.termas.update(dt);
    this.sortija.update(dt);
    this.taba.update(dt);
    // (anfitrión) el dragón ya llegó al techo: la vanguardia
    if (this.exitT > 0 && isHost(g)) {
      this.exitT -= dt;
      if (this.exitT <= 0 && this.step === 6) {
        this.step = 7;
        this.vanguardia.start();
        this.netSync();
      }
    }
    // Fierro mira al que se le acerca y el alma late como una brasa
    const f = this.fierro;
    const pp = g.player.pos;
    if (Math.abs(pp.y - f.pos.y) < 2 && Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z) < 6) {
      let d = Math.atan2(pp.x - f.pos.x, pp.z - f.pos.z) + Math.PI - f.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, dt * 1.5);
    }
    this.fierroNpc.update(dt);
    const a = this.npc.list.get(500);
    if (a) for (const m of Object.values(a.M)) m.opacity = 0.62 + Math.sin(t * 2.1) * 0.08;
    this.fierroGlow.position.copy(f.pos).setY(f.pos.y + 1.1);
    this.fierroGlow.material.opacity = 0.28 + Math.sin(t * 2.1) * 0.06;
    this.setObjective(this.scene ? null : this.objective());
    if (!isHost(g)) return;
    // los mates de los que se fueron vuelven a su altar
    this.holdT -= dt;
    if (this.holdT <= 0) {
      this.holdT = 1;
      this.altares.checkHolders();
    }
    // si pasa mucho sin avanzar, Fierro llama desde el fogón
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 150;
      if (this.step === 0 && g.rounds.round >= 2) this.say('fierro', 'Paisanos... vengan al fogón del gran salón. Tengo algo que contarles.');
      else if (this.step === 2) this.say('fierro', FIERRO.four);
    }
  }

  // Prueba: salta a un paso del final (4 la cueva, 5 el ritual, 6 las cadenas rotas, 7 la vanguardia, 8 el juramento).
  debugStep(n) {
    const g = this.g;
    if (!isHost(g)) return;
    if (this.step < 3) this.debugMates();
    for (const A of this.altares.list) A.up = 1;
    if (n >= 5) {
      const it = g.interact.list.find((x) => x.kind === 'door' && x.door?.def.kind === 'hielo');
      if (it && !it.door.open) g.interact.openDoor(it.door);
    }
    this.step = Math.min(n, 5);
    if (n >= 6) {
      this.cueva.ph = 4;
      this.cueva.chains = [3, 3, 3, 3];
      this.cueva.chainObjs.forEach((C) => {
        C.broken = true;
      });
      this.onFreed();
      if (n >= 7) {
        this.exitT = 0.01;
        this.dragon.setMode('roof');
      }
      if (n >= 8) {
        this.step = 7;
        this.vanguardia.dead = 4;
        this.onVanguard();
      }
    }
    this.netSync();
  }

  dispose() {
    this.asedio.dispose();
    if (this.g.defense === this.asedio) this.g.defense = null;
    this.song?.dispose();
    this.dragonModel.dispose();
    this.cueva.dispose();
    this.vanguardia.dispose();
    this.altares.dispose();
    for (const el of ELEMENTS) this.quests[el].dispose();
    this.npc.root.removeFromParent();
    this.objEl?.remove();
    this.root.removeFromParent();
  }
}

const ALTAR_WHERE = { fuego: 'la herrería', viento: 'el mirador del viento', rayo: 'el campanario', hielo: 'la gruta del glaciar' };
