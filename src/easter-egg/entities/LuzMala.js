import * as THREE from 'three';
import { RISERS, SKY, MAP_ID } from '../config/map';
import { SPEEDS } from '../config/rules';
import { WEAPONS } from '../config/weapons';
import { PERKS, PERK_ORDER } from '../config/perks';
import { reachableSpot } from './reach';
import { boxGeo, cylGeo } from '../world/props';

// La Noche de la Luz Mala (el molino, cada 10 rondas; la de la 20 y la 30,
// con más luces). La ronda entera es de noche cerrada:
//  - Se tapa la luna, baja una niebla rastrera y las lámparas y faroles del
//    molino titilan y se apagan (al terminar vuelven con un golpe de luz). El
//    ambiente se calla, un golpe y la música.
//  - Con el golpe de la música salen de las tumbas del cementerio las luces
//    malas (3, una más por cada otro jugador, dos más en la 20 y otras dos en
//    la 30): bolas de luz verdosa que tiemblan, dejan estela y flotan
//    zigzagueando entre 1 y 2,5 m. Van por los jugadores: a 2 m se plantan,
//    se encienden y se tiran encima (lastima y encandila).
//  - De paso se meten en algún muerto: queda poseído (ojos y aura verdes,
//    más rápido y el doble de duro) y la luz sigue.
//  - Las balas solo la espantan (titila y salta unos metros). Se apaga con el
//    facón (la cruz del cuchillo): hay que dejarla venir. El Mate de la Luz
//    Mala en la mano las llama a todas.
//  - Donde se apaga una queda un montículo de tierra removida que brilla (la
//    Luz Mala marca un entierro): mantener F lo desentierra (un cofre: puntos
//    para todos, un power-up y, a veces, un perk, el Tronador o un especial
//    de la caja para el que cavó).
//  - La última se mete en el Capataz: el Capataz Maldito (si no estaba, llega
//    con ella). Cuando cae, se apaga la última (el tesoro queda en su cuerpo) y
//    suelta el sombrero como siempre.
//  - Termina con la ronda (todas apagadas y la horda muerta): vuelve la luna,
//    se prenden las luces y un premio para todos.
//  - Siempre toca una durante el easter egg: cuando todos tienen su Mate de Oro
//    (paso 7), si todavía no hubo ninguna (antes de la 10), viene ahí (o con
//    la ronda que sigue) y la de la 10 ya no. Hasta que termina, la tumba del
//    Capataz (paso 8) espera.
// En línea lo simula el anfitrión (las luces, las posesiones, qué sale del
// cofre); los invitados ven el estado que les manda (por el canal 'ee' del
// easter egg) y le piden a él el facón, los tiros que las espantan y el pozo.
// Sin canción (el usuario, 2026-10-01): el apagón grabado (evento-apagon-molino)
// con el golpe del disyuntor justo cuando se apagan todas las lámparas.

const EVERY = 10;
// desde que arranca, cuándo suben las luces (con el golpe de la música)
const RISE_AT = 8;
const RISE_DUR = 1.7;
const SPEED = 3.3;
const BAIT_SPEED = 4.6;
// a esta distancia del jugador se planta, se enciende y se le tira encima
const FLARE_R = 2.3;
const FLARE_T = 0.8;
const LUNGE_SPEED = 9;
const TOUCH_R = 0.8;
// el facón la alcanza un poco más lejos que a un muerto (flota a la altura de la cara)
const KNIFE_R = 2.6;
// una bala que le pasa a esta distancia la espanta
const SCARE_R = 0.85;
const POSSESS_R = 9;
const MAX_MOUNDS = 14;
const DIG_TIME = 2.6;
const SYNC_T = 0.125;
// el color de los poseídos
const TINT = 0x6fb85a;
// estados de cada luz (viajan por la red)
const OFF = 0;
const RISE = 1;
const SEEK = 2;
const FLARE = 3;
const LUNGE = 4;
const POSSESS = 5;
const RECOIL = 6;
const CLIMAX = 7;
const INSIDE = 8;
// lo que queda de cada luz del mapa en lo más oscuro (las bombitas, casi nada;
// los faroles, nada: la luz está pegada al vidrio y con un poco ya lo prendía)
const KEEP = { fire: 0.4, candle: 0.22, lamp: 0 };
// el clima de la noche (world/Weather: se agrega a sus estados)
// (la neblina clara del clima, poca: la de la noche es la rastrera, oscura, de acá)
const WEATHER = { rain: 0, storm: 0, fog: 0.06, fogColor: 0x050b08, wind: 0.08, cloud: 1, mist: 0.3, blood: 0 };
const WKEYS = ['rain', 'storm', 'fog', 'wind', 'cloud', 'mist', 'blood'];
// los mates que no se pierden por un cofre (si no hay lugar, se cambia otro)
const PRECIOUS = ['oro', 'luzmala', 'hoz'];

const LINES = {
  start: 'Esta noche no hay luna para nadie, gauchitos.',
  again: 'Otra noche de luces malas. Ya saben: al facón.',
  force: "Se tapó la luna, m'hijos... Esta noche salen las luces malas.",
  over: "Ahora sí, m'hijos. El sombrero, a la tumba.",
};

const C_CORE = [1, 1, 0.82];
const C_HALO = [0.78, 1, 0.42];
const C_OUT = [0.45, 0.85, 0.25];
const C_TRAIL = [0.6, 1, 0.35];
const C_EYE = [0.85, 1, 0.6];
const C_DIRT = [0.32, 0.24, 0.16];
const C_FOG = [0.11, 0.15, 0.13];
const C_GOLD = [1, 0.8, 0.35];
// el Capataz Maldito: verde hondo (no blanco)
const C_DEEP = [0.22, 0.75, 0.14];
const C_FLAME = [0.3, 0.85, 0.18];

const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tC = new THREE.Vector3();
const tCol = new THREE.Color();
const m4 = new THREE.Matrix4();
const q0 = new THREE.Quaternion();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const dirOut = { x: 0, z: 0 };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Puntos de luz aditivos (los núcleos y halos de las luces, los ojos y el aura
// de los poseídos, el brillo de los montículos): todo en una sola llamada de
// dibujo, armado de nuevo en cada cuadro sobre arreglos fijos.
const GVERT = `
attribute float size; attribute vec4 rgba;
varying vec4 vC;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(0.05, -mv.z);
  vC = rgba;
}`;
const GFRAG = `
uniform sampler2D map; varying vec4 vC;
void main(){ float a = texture2D(map, gl_PointCoord).a * vC.a; if (a < 0.003) discard; gl_FragColor = vec4(vC.rgb * a, a); }`;

class Glow {
  constructor(g, max = 320) {
    this.max = max;
    this.n = 0;
    this.last = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aP);
    geo.setAttribute('rgba', this.aC);
    geo.setAttribute('size', this.aS);
    geo.setDrawRange(0, 0);
    // (el tamaño en pantalla con la misma escala que las partículas: fx.resize)
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: g.textures.dot }, uScale: g.fx.add.uniforms.uScale },
      vertexShader: GVERT,
      fragmentShader: GFRAG,
      transparent: true,
      depthWrite: false,
      // tope por píxel: cada punto se queda con el más brillante (MAX), no se
      // suman. Diez halos encimados ya no queman la pantalla en blanco.
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    g.scene.add(this.points);
  }

  begin(cam) {
    this.n = 0;
    this.cx = cam.x;
    this.cy = cam.y;
    this.cz = cam.z;
  }

  // Los halos (lo grande: no los núcleos ni los ojos) se apagan de a poco
  // hacia la cámara, desde los 6 m, y nunca miden más que una parte de la
  // distancia: pegado a la cámara, un halo de 4 m tapaba la pantalla entera.
  push(x, y, z, s, c, a) {
    if (this.n >= this.max || a <= 0.003) return;
    if (s > 0.7) {
      const dx = x - this.cx;
      const dy = y - this.cy;
      const dz = z - this.cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = Math.min(1, Math.max(0, (d - 0.6) / 5.4));
      a *= 0.12 + 0.88 * k * k * (3 - 2 * k);
      s = Math.min(s, d * 0.45);
      if (a <= 0.003) return;
    }
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0];
    this.col[i * 4 + 1] = c[1];
    this.col[i * 4 + 2] = c[2];
    this.col[i * 4 + 3] = a;
    this.size[i] = s;
  }

  end() {
    if (!this.n && !this.last) return;
    this.last = this.n;
    this.points.geometry.setDrawRange(0, this.n);
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = true;
  }
}

export default class LuzMala {
  constructor(game, ee) {
    this.g = game;
    this.ee = ee;
    this.active = false;
    // (la interfaz de g.defense: Zombies.pickSpawner, Zombies.chase, Rounds)
    this.zones = null;
    this.round = 0;
    this.tier = 1;
    // la noche adelantada por el easter egg (forceEarly): ya se hizo, falta
    // arrancarla con la ronda que viene, y cuál de las de siempre se saltea
    this.forced = false;
    this.early = false;
    this.pending = false;
    this.skipRound = 0;
    this.nights = 0;
    this.luces = [];
    this.n = 0;
    this.T = 0;
    this.riseT = 0;
    this.hintT = 0;
    this.syncT = 0;
    this.boss = null;
    this.climaxed = false;
    this.plist = [];
    // la oscuridad (en cada compu): 0 normal, 1 noche cerrada
    this.nightK = 0;
    this.darkT = 0;
    this.relT = 0;
    this.lightMode = null;
    this.saved = null;
    this.moonObj = {};
    this.lampMats = null;
    this.ambK = -1;
    this.fogT = 0;
    this.blindK = 0;
    this.hudT = 0;
    this.wasStrike = false;
    this.digSndT = 0;
    this.possessedN = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.glow = new Glow(game);
    this.buildMounds();
    this.chests = [this.buildChest(), this.buildChest()];
    this.buildPillars();
    // una luz de verdad para la luz más cercana a la cámara (la otra es la de
    // la Luz Mala de siempre, world/LuzMala, si está apagada): siempre en la
    // escena, en 0 cuando no hace falta (si no, se recompilan los materiales)
    this.lamp = new THREE.PointLight(0xc8ff7a, 0, 10, 1.6);
    // (anda flotando: sin sombra de fuego, fx/Epic)
    this.lamp.userData.noShadow = true;
    this.lamp.position.y = -50;
    // (no cuenta como luz mientras está apagada: World.adoptLight)
    game.scene.add(game.world.adoptLight(this.lamp));
    this.graves = RISERS.filter((r) => r.grave).map((r) => r.pos);
    this.registerDig();
    this.buildHud();
    this.bakeSounds();
  }

  // ---------------- la interfaz de g.defense ----------------
  // Los muertos persiguen como siempre (Zombies.chase).
  goal() {
    return null;
  }

  zombieHit() {}

  // La noche se termina con la horda (el usuario, 2026-10-01: las luces son
  // de yapa); solo espera a que suban y a que salga el Capataz (Rounds.update).
  get holding() {
    return this.active && (this.riseT > 0 || !this.climaxed);
  }

  // Esta noche no sale la Luz Mala de siempre (world/LuzMala.spawn).
  get noLuz() {
    return this.active;
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  // La tumba del Capataz espera mientras viene o dura la noche (paso 8).
  lock() {
    if (this.g.net?.guest) return !!this.lockRemote;
    return this.active || this.early || this.pending;
  }

  // ---------------- rondas ----------------
  // ¿Algo del easter egg no deja que arranque ahora? (la pelea final, el encierro del cementerio)
  blocked() {
    const g = this.g;
    return !!g.arena?.active || this.ee.arenaGone || this.ee.tumba !== 'idle';
  }

  // Cada ronda nueva (anfitrión): cada 10, la noche.
  onRound(R) {
    const g = this.g;
    const due = R.round >= EVERY && R.round % EVERY === 0 && R.round !== this.skipRound;
    if ((due || (this.early && !R.dogs)) && g.state === 'playing') {
      // (con el cementerio abierto o en la Salamanca, la noche espera)
      if (this.blocked()) {
        if (!this.ee.arenaGone) this.early = true;
      } else {
        this.early = false;
        this.start(R);
      }
    }
    this.sync(true);
  }

  // (anfitrión) Todos agarraron su Mate de Oro: ¿viene la noche adelantada?
  // Desde ya la tumba espera, habla el Abuelo y al rato arranca.
  expectEarly() {
    const g = this.g;
    const R = g.rounds;
    if (this.forced || this.active || this.pending || this.nights > 0 || g.net?.guest || !R || R.round >= EVERY) return false;
    this.pending = true;
    this.sync(true);
    g.later(1, () => g.say('abuelo', LINES.force));
    g.later(6, () => this.forceEarly());
    return true;
  }

  forceEarly() {
    const g = this.g;
    const R = g.rounds;
    this.pending = false;
    if (this.forced || this.active || g.net?.guest || !R || R.round >= EVERY) {
      this.sync(true);
      return;
    }
    this.forced = true;
    this.skipRound = EVERY;
    // (en el descanso, con los carpinchos sueltos o con el cementerio abierto: con la ronda que viene)
    if (R.state === 'active' && !R.dogs && !this.blocked() && g.state === 'playing') this.start(R, true);
    else this.early = true;
    this.sync(true);
  }

  // Alt+I (core/music.js): la noche ya (o con la ronda que viene).
  debugStart() {
    const g = this.g;
    const R = g.rounds;
    if (this.active) return;
    if (R.state === 'active' && !R.dogs) this.start(R);
    else {
      this.early = true;
      R.breakT = Math.min(R.breakT ?? 1, 0.4);
    }
  }

  start(R, forcedNow = false) {
    const g = this.g;
    this.active = true;
    this.round = R.round;
    this.tier = Math.max(1, Math.floor(R.round / EVERY));
    this.nights++;
    this.climaxed = false;
    this.boss = null;
    this.T = 0;
    this.riseT = RISE_AT;
    this.hintT = RISE_AT + 2.5;
    this.luces.length = 0;
    const players = this.ee.players();
    this.n = Math.min(8, 3 + (players - 1) + 2 * (this.tier - 1));
    // el Capataz de la ronda no viene solo: llega con la última luz
    R.bossPending = false;
    // desde la 20, unos muertos más
    if (this.tier > 1) {
      const extra = Math.round(R.total * 0.12 * (this.tier - 1));
      R.total += extra;
      R.toSpawn += extra;
    }
    // la horda sale con las luces
    R.spawnT = Math.max(R.spawnT || 0, RISE_AT);
    this.ensureWeather();
    g.weather?.set('lmnoche');
    this.startFx();
    if (!forcedNow) g.later(1.6, () => g.say('entidad', this.nights > 1 ? LINES.again : LINES.start));
    this.sync(true);
  }

  // Suben las luces de las tumbas (anfitrión), de a una.
  raise() {
    const g = this.g;
    const graves = this.graves.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < this.n; i++) {
      const [x, z] = graves[i % graves.length] || [63, 24];
      const l = this.newLuz(i);
      l.pos.set(x + (Math.random() - 0.5) * 0.6, -0.3, z + (Math.random() - 0.5) * 0.6);
      l.st = RISE;
      l.t = -i * 0.45;
      l.alive = true;
      this.luces.push(l);
    }
    // el rayo verde sobre el cementerio, con el golpe
    this.fx(9, 63.5, 0, 24.5);
    this.sync(true);
  }

  newLuz(i) {
    return {
      i,
      st: OFF,
      alive: false,
      pos: new THREE.Vector3(),
      net: new THREE.Vector3(),
      hold: new THREE.Vector3(),
      from: new THREE.Vector3(),
      t: 0,
      ph: Math.random() * 20,
      tgt: null,
      tgtT: 0,
      baited: false,
      pcd: 3 + Math.random() * 3,
      zt: null,
      zid: -1,
      losT: 0,
      los: false,
      dartT: 0,
      dartGap: 2,
      dartS: 0,
      scT: 0,
      trailT: 0,
      whisT: 1 + Math.random() * 2,
      blinkT: 0,
      fl: 1,
      rose: false,
    };
  }

  setSt(l, st) {
    l.st = st;
    l.t = 0;
  }

  // La ronda terminó (anfitrión): toda la horda y las luces.
  onRoundEnd() {
    if (this.active) this.finish();
  }

  finish() {
    const g = this.g;
    this.active = false;
    this.pending = false;
    this.riseT = 0;
    // (las que nadie apagó se esfuman sin tesoro)
    for (const l of this.luces) {
      if (l.alive) this.fx(11, l.pos.x, l.pos.y, l.pos.z, l.i);
      l.alive = false;
      l.st = OFF;
    }
    this.boss = null;
    const pts = 1000 * this.tier;
    g.net?.event('ee', { lne: pts });
    this.reward(pts);
    g.weather?.set('clear');
    this.endFx();
    // (el easter egg: ahora sí, el sombrero a la tumba)
    const E = this.ee;
    if (this.forced && E.done && E.tumba === 'idle' && !E.arenaGone && g.world.power) g.later(4, () => g.say('abuelo', LINES.over));
    this.sync(true);
  }

  // El premio de la noche (cada uno suma lo suyo).
  reward(pts) {
    const g = this.g;
    g.addPoints(pts, null, true);
    g.hud.toast(`¡Volvió la luna! +${pts}`);
    g.audio.fanfare?.();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.ensureWeather();
    if (this.active) {
      this.T += dt;
      if (!g.net?.guest) this.hostTick(dt);
      else this.guestTick(dt);
    }
    this.knifeCheck();
    this.night(dt);
    this.draw(dt);
    this.updateChests(dt);
    this.updatePillars(dt);
    this.digTick(dt);
    if (this.blindK > 0) {
      this.blindK = Math.max(0, this.blindK - dt / 1.1);
      if (this.hud) this.hud.blind.style.opacity = (Math.min(1, this.blindK * 1.3) * 0.7).toFixed(3);
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.updateHud();
    }
  }

  hostTick(dt) {
    const g = this.g;
    if (this.riseT > 0) {
      this.riseT -= dt;
      if (this.riseT <= 0) this.raise();
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.ee.announce('Las balas la espantan. Al facón.', 4);
    }
    // (el clima de la ronda del Capataz no tapa la noche: Weather.onRound)
    if (g.weather && g.weather.name !== 'lmnoche') g.weather.set('lmnoche');
    this.players();
    for (const l of this.luces) if (l.alive) this.updLuz(l, dt);
    // la última luz busca al Capataz; si no las apagan, igual: con media horda
    // afuera una de las sueltas va por él (y si no queda ninguna, viene solo)
    if (!this.climaxed && this.luces.length && !this.luces.some((l) => l.alive && l.st === RISE)) {
      let alive = 0;
      let last = null;
      for (const l of this.luces) {
        if (!l.alive) continue;
        alive++;
        last = l;
      }
      const R = g.rounds;
      if (alive <= 1 || R.total - R.toSpawn >= R.total * 0.5) this.climax(last);
    }
    this.syncT -= dt;
    if (this.syncT <= 0) this.sync(true);
  }

  // Invitado: las luces van hacia donde las manda el anfitrión (suavizado).
  guestTick(dt) {
    const k = 1 - Math.exp(-dt * 9);
    for (const l of this.luces) {
      if (!l.alive) continue;
      l.t += dt;
      if (l.pos.distanceToSquared(l.net) > 9) l.pos.copy(l.net);
      else l.pos.lerp(l.net, k);
    }
  }

  // Los que están de pie (anfitrión: el local y los remotos).
  players() {
    const g = this.g;
    const L = this.plist;
    L.length = 0;
    if (g.player.canBeHit()) L.push(g.player);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost) L.push(r);
    return L;
  }

  standing(p) {
    const g = this.g;
    if (!p) return false;
    if (p === g.player) return p.canBeHit();
    return !p.dead && !p.downed && !p.ghost && g.net?.remote.get(p.id) === p;
  }

  // ¿Tiene el Mate de la Luz Mala en la mano? (las llama)
  bait(p) {
    const g = this.g;
    if (p === g.player) return g.weapons.slot?.id === 'luzmala';
    return g.net?.wpn?.get(p.id)?.w === 'luzmala';
  }

  pickTarget(l) {
    l.tgtT = 0.6;
    l.tgt = null;
    l.baited = false;
    let best = null;
    let bd = Infinity;
    let bait = null;
    let bb = 35;
    for (const p of this.plist) {
      const d = Math.hypot(p.pos.x - l.pos.x, p.pos.z - l.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
      if (d < bb && this.bait(p)) {
        bb = d;
        bait = p;
      }
    }
    l.tgt = bait || best;
    l.baited = !!bait;
  }

  chestY(p) {
    return (p.pos.y || 0) + 1.3;
  }

  // Una luz (anfitrión).
  updLuz(l, dt) {
    const g = this.g;
    l.t += dt;
    l.pcd -= dt;
    l.tgtT -= dt;
    l.dartT -= dt;
    switch (l.st) {
      case RISE: {
        if (l.t < 0) return;
        if (!l.rose) {
          l.rose = true;
          this.fx(1, l.pos.x, 0, l.pos.z, l.i);
        }
        const k = Math.min(1, l.t / RISE_DUR);
        l.pos.y = -0.3 + (1 - (1 - k) * (1 - k)) * 2.2;
        if (k >= 1) this.setSt(l, SEEK);
        return;
      }
      case SEEK: {
        if (l.tgtT <= 0 || !this.standing(l.tgt)) this.pickTarget(l);
        // de paso, se mete en algún muerto
        if (!l.baited && l.pcd <= 0 && this.possessedN < this.possessCap()) {
          const z = this.zombieNear(l);
          if (z) {
            l.zt = z;
            l.zid = z.id;
            this.setSt(l, POSSESS);
            return;
          }
          l.pcd = 1;
        }
        const p = l.tgt;
        if (!p) {
          // nadie de pie: deambula sobre las tumbas
          this.fly(l, 63.5 + Math.sin(g.time * 0.3 + l.ph) * 4, 2, 24.5 + Math.cos(g.time * 0.27 + l.ph) * 4, 1.5, dt);
          return;
        }
        const cy = this.chestY(p);
        const d = this.steer(l, p.pos.x, cy, p.pos.z, l.baited ? BAIT_SPEED : SPEED, dt, p);
        if (d < FLARE_R && Math.abs(l.pos.y - cy) < 1.3) {
          l.hold.copy(l.pos);
          this.setSt(l, FLARE);
          this.fx(10, l.pos.x, l.pos.y, l.pos.z, l.i);
        }
        return;
      }
      case FLARE: {
        // se planta temblando y se enciende (el momento del facón)
        const p = l.tgt;
        if (!this.standing(p)) {
          this.setSt(l, SEEK);
          return;
        }
        const cy = this.chestY(p);
        l.hold.y += (cy + 0.15 - l.hold.y) * Math.min(1, dt * 4);
        l.pos.set(l.hold.x + Math.sin(g.time * 31 + l.ph) * 0.05, l.hold.y + Math.sin(g.time * 23) * 0.05, l.hold.z + Math.cos(g.time * 27 + l.ph) * 0.05);
        if (Math.hypot(p.pos.x - l.hold.x, p.pos.z - l.hold.z) > FLARE_R + 1.8) this.setSt(l, SEEK);
        else if (l.t > FLARE_T) this.setSt(l, LUNGE);
        return;
      }
      case LUNGE: {
        const p = l.tgt;
        if (!this.standing(p)) {
          this.setSt(l, RECOIL);
          return;
        }
        const d = this.fly(l, p.pos.x, this.chestY(p) + 0.2, p.pos.z, LUNGE_SPEED, dt, 0);
        if (d < TOUCH_R) {
          this.touch(l, p);
          l.from.copy(p.pos);
          this.setSt(l, RECOIL);
        } else if (l.t > 0.55) {
          l.from.copy(p.pos);
          this.setSt(l, RECOIL);
        }
        return;
      }
      case POSSESS: {
        const z = l.zt;
        if (!z || !z.active || z.dead || z.id !== l.zid || z.lmPid === z.id) {
          l.zt = null;
          l.pcd = 2;
          this.setSt(l, SEEK);
          return;
        }
        const d = this.fly(l, z.pos.x, (z.baseY || 0) + 1.25 * (z.scale || 1), z.pos.z, 5.2, dt);
        if (d < 0.55) {
          this.possess(z);
          l.zt = null;
          l.pcd = 7 + Math.random() * 4;
          l.pos.y += 0.7;
          this.setSt(l, SEEK);
        } else if (l.t > 4) {
          l.pcd = 2;
          this.setSt(l, SEEK);
        }
        return;
      }
      case RECOIL: {
        // se aleja del que tocó (o del que le tiró) y vuelve a subir
        const dx = l.pos.x - l.from.x;
        const dz = l.pos.z - l.from.z;
        const d = Math.hypot(dx, dz) || 1;
        const s = 3.6 * Math.max(0.2, 1 - l.t / 2.2) * dt;
        l.pos.x += (dx / d) * s;
        l.pos.z += (dz / d) * s;
        l.pos.y += ((l.from.y || 0) + 2.2 - l.pos.y) * Math.min(1, dt * 2);
        if (l.t > 2.2) this.setSt(l, SEEK);
        return;
      }
      case CLIMAX: {
        const b = this.boss;
        if (!b || !b.active || b.dead) return;
        const d = this.fly(l, b.pos.x, (b.baseY || 0) + 1.5 * (b.scale || 1), b.pos.z, 7.5, dt);
        if (d < 0.9 || l.t > 6) this.enter(l, b);
        return;
      }
      case INSIDE: {
        const b = this.boss;
        if (b?.active) l.pos.set(b.pos.x, (b.baseY || 0) + 1.5 * (b.scale || 1), b.pos.z);
        return;
      }
    }
  }

  // Hacia un jugador: por el campo de flujo si no lo ve (atraviesa lo que haga
  // falta si no hay camino: es un alma), zigzagueando y subiendo y bajando.
  // Devuelve la distancia (en el piso).
  steer(l, tx, ty, tz, speed, dt, p) {
    const g = this.g;
    const dx = tx - l.pos.x;
    const dz = tz - l.pos.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    let mx = dx / d;
    let mz = dz / d;
    l.losT -= dt;
    if (l.losT <= 0) {
      l.losT = 0.3;
      l.los = d < 3 || g.world.clear(tA.set(l.pos.x, l.pos.y, l.pos.z), tB.set(tx, ty, tz));
    }
    if (!l.los && p) {
      const nav = g.navFor ? g.navFor(p) : g.nav;
      if (nav?.direction(l.pos.x, l.pos.z, dirOut)) {
        mx = dirOut.x;
        mz = dirOut.z;
      }
    }
    // los saltos de costado de la luz mala
    if (l.dartT <= -l.dartGap) {
      l.dartT = 0.3;
      l.dartS = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random());
      l.dartGap = 1.5 + Math.random() * 2.5;
    }
    const w = Math.sin(g.time * 1.9 + l.ph) * 0.45 + (l.dartT > 0 ? l.dartS : 0);
    const vx = mx - mz * w;
    const vz = mz + mx * w;
    const vl = Math.hypot(vx, vz) || 1;
    l.pos.x += (vx / vl) * speed * dt;
    l.pos.z += (vz / vl) * speed * dt;
    // flota entre 1 y 2,5 m; cerca del que busca, a la altura del pecho
    const base = p ? p.pos.y || 0 : 0;
    const float = base + 1.75 + Math.sin(g.time * 0.9 + l.ph) * 0.45 + Math.sin(g.time * 2.7 + l.ph * 1.7) * 0.2;
    const want = d < 5 ? ty + (float - ty) * Math.max(0, (d - 2) / 3) : float;
    l.pos.y += (want - l.pos.y) * Math.min(1, dt * 2.5);
    return d;
  }

  // Derecho a un punto (atraviesa todo), con un temblor. Devuelve la distancia.
  fly(l, tx, ty, tz, speed, dt, wob = 0.35) {
    tA.set(tx - l.pos.x, ty - l.pos.y, tz - l.pos.z);
    const d = tA.length();
    if (d < 1e-3) return 0;
    const s = Math.min(d, speed * dt);
    l.pos.addScaledVector(tA, s / d);
    if (wob) {
      l.pos.x += Math.sin(this.g.time * 7 + l.ph) * wob * dt;
      l.pos.z += Math.cos(this.g.time * 6 + l.ph) * wob * dt;
    }
    return d - s;
  }

  // Le tocó a un jugador: lastima y encandila (anfitrión).
  touch(l, p) {
    const g = this.g;
    const dmg = 20 + (this.tier - 1) * 10;
    if (p === g.player) {
      g.player.damage(dmg, l.pos);
      this.blind();
    } else {
      g.damagePlayer(p, dmg, l.pos);
      g.net?.event('ee', { lnb: p.id });
    }
    this.fx(2, l.pos.x, l.pos.y, l.pos.z, l.i);
  }

  blind() {
    this.blindK = 1;
    this.g.post?.flash(this.g.settings?.calmFx ? 0.15 : 0.4);
  }

  possessCap() {
    return 3 + this.tier * 2 + (this.ee.players() - 1);
  }

  // El muerto más cercano sin poseer (ni perros ni jefes).
  zombieNear(l) {
    let best = null;
    let bd = POSSESS_R;
    for (const z of this.g.zombies.pool) {
      if (!z.active || z.dead || z.dog || z.boss || z.lmPid === z.id) continue;
      if (z.state === 'rise' || z.state === 'fall' || z.state === 'drop' || z.state === 'sky') continue;
      const d = Math.hypot(z.pos.x - l.pos.x, z.pos.z - l.pos.z);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  // Poseído: más rápido, el doble de duro, ojos y aura (anfitrión).
  possess(z) {
    const g = this.g;
    z.lmPid = z.id;
    z.hp = z.hp * 2 + 150;
    z.maxHp = z.maxHp * 2 + 150;
    z.speed = Math.max(z.speed * 1.35, SPEEDS.run * 1.2);
    z.speedType = z.speed > 3.7 ? 'sprint' : 'run';
    z.runU = null;
    z.fury = Math.max(z.fury || 1, 1.3);
    g.zombies.paint(z, TINT);
    this.fx(3, z.pos.x, (z.baseY || 0) + 1.2, z.pos.z);
  }

  // La última luz va por el Capataz (si no está, llega con ella).
  climax(l) {
    const g = this.g;
    this.climaxed = true;
    let b = g.zombies.boss;
    if (!b || b.dead || !b.active || b.mandinga) {
      b = g.zombies.spawnBoss(g.rounds.round || 1);
      // (la ronda espera al minijefe: Rounds.miniAlive)
      if (b && !b.mandinga) g.rounds.mini = b;
    }
    if (!b || b.mandinga) {
      this.boss = null;
      return;
    }
    this.boss = b;
    if (l) this.setSt(l, CLIMAX);
    this.sync(true);
  }

  enter(l, b) {
    this.setSt(l, INSIDE);
    b.maldito = true;
    b.lmPid = b.id;
    b.speed *= 1.3;
    this.fx(7, b.pos.x, (b.baseY || 0) + 1.6, b.pos.z, l.i);
    this.sync(true);
  }

  // Cayó el Capataz (anfitrión): se apaga la que tenía adentro y el tesoro
  // queda en su cuerpo (el sombrero y el power-up los suelta Zombies.kill).
  onBossDeath(pos, z) {
    if (this.g.net?.guest || !this.active || !z || z.mandinga) return;
    const l = this.luces.find((x) => x.alive && (x.st === CLIMAX || x.st === INSIDE));
    if (!l) return;
    l.pos.set(pos.x, (pos.y || 0) + 1.4, pos.z);
    this.killLuz(l, null, pos);
  }

  // ¿Se la puede apagar? (subiendo de la tumba o yendo al Capataz, no)
  killable(l) {
    return l.alive && l.st !== RISE && l.st !== CLIMAX && l.st !== INSIDE && l.st !== OFF;
  }

  // Se apagó una luz (anfitrión): el montículo donde estaba.
  killLuz(l, by, at = null) {
    const g = this.g;
    if (!l.alive) return;
    l.alive = false;
    l.st = OFF;
    this.fx(5, l.pos.x, l.pos.y, l.pos.z, l.i);
    const floor = at ? at.y || 0 : by ? by.pos.y || 0 : 0;
    const p = at || tC.set(l.pos.x, floor, l.pos.z);
    const spot = reachableSpot(g, tC.set(p.x, floor, p.z)) || tC;
    this.addMound(spot.x, spot.y || 0, spot.z);
    this.sync(true);
  }

  // ---------------- el facón y las balas ----------------
  // El tajo del jugador local (Weapons: knifeStrike / scytheStrike), en cada compu.
  knifeCheck() {
    const W = this.g.weapons;
    const s = (W.state === 'knife' && !!W.knifeHit) || (W.state === 'swing' && !!W.swingHit);
    if (s && !this.wasStrike && this.active) this.knifeAt();
    this.wasStrike = s;
  }

  knifeAt() {
    const g = this.g;
    const p = g.player;
    if (!p.alive || p.downed) return;
    const fwd = tA.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    let best = null;
    let bd = KNIFE_R;
    for (const l of this.luces) {
      if (!this.killable(l)) continue;
      const dx = l.pos.x - p.pos.x;
      const dz = l.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if (d > 0.7 && (dx * fwd.x + dz * fwd.z) / d < 0.4) continue;
      if (Math.abs(l.pos.y - ((p.pos.y || 0) + 1.4)) > 1.5) continue;
      bd = d;
      best = l;
    }
    if (!best) return;
    if (g.net?.guest) {
      g.net.net.send({ t: 'pee', a: 'lnk', i: best.i });
      g.fx.flash(best.pos, 0xc8ff7a, 30, 0.2, 8);
      return;
    }
    this.killLuz(best, p);
  }

  // Un tiro (EasterEgg.onShot, de este jugador): la que roza, se espanta.
  onShot(origin, dir, maxT) {
    if (!this.active) return;
    const g = this.g;
    for (const l of this.luces) {
      if (!this.killable(l) || l.scT > g.time) continue;
      tA.subVectors(l.pos, origin);
      const t = tA.dot(dir);
      if (t < 0.3 || t > maxT + 0.6) continue;
      tB.copy(origin).addScaledVector(dir, t);
      if (tB.distanceTo(l.pos) > SCARE_R) continue;
      l.scT = g.time + 0.3;
      if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'lns', i: l.i, x: +origin.x.toFixed(1), z: +origin.z.toFixed(1) });
      else this.scare(l, origin);
    }
  }

  onExplosion(pos, radius) {
    if (!this.active) return;
    const g = this.g;
    for (const l of this.luces) {
      if (!this.killable(l) || l.scT > g.time || l.pos.distanceTo(pos) > radius) continue;
      l.scT = g.time + 0.3;
      if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'lns', i: l.i, x: +pos.x.toFixed(1), z: +pos.z.toFixed(1) });
      else this.scare(l, pos);
    }
  }

  // Se espanta: titila y salta unos metros, lejos del que tiró (anfitrión).
  scare(l, from) {
    const g = this.g;
    const a0 = Math.atan2(l.pos.z - from.z, l.pos.x - from.x);
    let x = l.pos.x;
    let z = l.pos.z;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (Math.random() - 0.5) * (1.4 + k * 0.4);
      const r = 3 + Math.random() * 3;
      x = l.pos.x + Math.cos(a) * r;
      z = l.pos.z + Math.sin(a) * r;
      if (!g.nav.blocked(Math.floor(x), Math.floor(z))) break;
    }
    const fx0 = l.pos.x;
    const fy0 = l.pos.y;
    const fz0 = l.pos.z;
    l.pos.set(x, Math.max(1, Math.min(2.5, l.pos.y + (Math.random() - 0.3) * 0.7)), z);
    l.from.set(from.x, l.from.y, from.z);
    this.setSt(l, RECOIL);
    l.t = 0.7;
    this.fx(4, fx0, fy0, fz0, l.i, l.pos.x, l.pos.y, l.pos.z);
  }

  // Lo que pide un invitado ('pee'): el facón o un tiro que la roza.
  onGuest(m, from) {
    const g = this.g;
    const l = this.luces[m.i | 0];
    if (!l || !this.active) return;
    if (m.a === 'lnk') {
      const r = g.net?.remote.get(from);
      if (r && this.killable(l) && Math.hypot(r.pos.x - l.pos.x, r.pos.z - l.pos.z) < KNIFE_R + 1.6) this.killLuz(l, r);
    } else if (m.a === 'lns' && this.killable(l)) this.scare(l, tA.set(+m.x || 0, 0, +m.z || 0));
  }

  // ---------------- los entierros ----------------
  buildMounds() {
    const g = this.g;
    const M = g.world.M;
    // tierra removida, con terrones, y un brillo verde que sale de adentro (de
    // noche, sin eso, era una mancha negra que parecía un pozo)
    const dirt = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, map: M.dirtDark?.map || null, roughness: 1, flatShading: true, emissive: 0x2e5a1a, emissiveIntensity: 1.3 });
    const geo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const pa = geo.attributes.position;
    let sd = 7;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      if (y < 0.02) continue;
      const k = 1 + (rnd() - 0.5) * 0.45;
      pa.setXYZ(i, pa.getX(i) * k, y * (0.75 + rnd() * 0.6), pa.getZ(i) * k);
    }
    geo.computeVertexNormals();
    this.moundIM = new THREE.InstancedMesh(geo, dirt, MAX_MOUNDS);
    this.moundIM.receiveShadow = true;
    this.moundIM.frustumCulled = false;
    const hole = new THREE.MeshBasicMaterial({ color: 0x080503 });
    this.holeIM = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), hole, MAX_MOUNDS);
    this.holeIM.frustumCulled = false;
    for (let k = 0; k < MAX_MOUNDS; k++) {
      this.moundIM.setMatrixAt(k, ZERO);
      this.holeIM.setMatrixAt(k, ZERO);
    }
    // el resplandor en el piso alrededor (aditivo, uno por montículo)
    const glowMat = new THREE.MeshBasicMaterial({ map: g.textures.dot, color: new THREE.Color(0.32, 0.8, 0.22), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.moundGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMat, MAX_MOUNDS);
    this.moundGlow.frustumCulled = false;
    this.moundGlow.renderOrder = 3;
    for (let k = 0; k < MAX_MOUNDS; k++) this.moundGlow.setMatrixAt(k, ZERO);
    this.root.add(this.moundIM, this.holeIM, this.moundGlow);
    this.mounds = [];
    for (let k = 0; k < MAX_MOUNDS; k++) this.mounds.push({ k, st: 0, pos: new THREE.Vector3(), t: 0, it: null, age: 0 });
  }

  registerDig() {
    const g = this.g;
    for (const m of this.mounds) {
      m.it = g.interact.add({
        kind: 'luzdig',
        hold: true,
        holdTime: DIG_TIME,
        pos: new THREE.Vector3(0, -50, 0),
        radius: 1.7,
        wide: true,
        prompt: () => (m.st === 1 ? { text: 'cavar el tesoro', hold: true, noCost: true } : null),
        cost: () => 0,
        // (de invitado lo pide al anfitrión: Session.applyRemoteUse, useFrom)
        use: () => this.dig(m.k, g.net?.useFrom ?? this.myId()),
      });
    }
  }

  // Un montículo nuevo (en el lugar libre, o en el del pozo más viejo).
  addMound(x, y, z) {
    let m = this.mounds.find((q) => q.st === 0);
    if (!m) {
      let old = null;
      for (const q of this.mounds) if (q.st === 2 && (!old || q.age < old.age)) old = q;
      m = old || this.mounds[0];
    }
    m.st = 1;
    m.age = this.g.time;
    m.t = 0;
    m.pos.set(x, y, z);
    this.showMound(m);
  }

  showMound(m) {
    const p = m.pos;
    if (m.st === 1) this.moundIM.setMatrixAt(m.k, m4.compose(tA.set(p.x, p.y, p.z), q0, tB.set(0.62, 0.26, 0.62)));
    else if (m.st === 2) this.moundIM.setMatrixAt(m.k, m4.compose(tA.set(p.x + 0.55, p.y, p.z + 0.1), q0, tB.set(0.4, 0.14, 0.4)));
    else this.moundIM.setMatrixAt(m.k, ZERO);
    this.holeIM.setMatrixAt(m.k, m.st === 2 ? m4.makeTranslation(p.x, p.y + 0.012, p.z) : ZERO);
    this.moundGlow.setMatrixAt(m.k, m.st === 1 ? m4.compose(tA.set(p.x, p.y + 0.02, p.z), q0, tB.set(3.2, 1, 3.2)) : ZERO);
    this.moundIM.instanceMatrix.needsUpdate = true;
    this.holeIM.instanceMatrix.needsUpdate = true;
    this.moundGlow.instanceMatrix.needsUpdate = true;
    if (m.it) m.it.pos.set(p.x, m.st === 1 ? p.y + 0.5 : -50, p.z);
  }

  // Cavar (anfitrión; by: quién). Sale un cofre.
  dig(k, by) {
    const g = this.g;
    const m = this.mounds[k];
    if (!m || m.st !== 1) return false;
    m.st = 2;
    this.showMound(m);
    const R = g.rounds?.round || 1;
    const pts = 250 + R * 35 + (this.tier - 1) * 250;
    const r = Math.random();
    const P = this.tier >= 2 ? [0.3, 0.13, 0.15] : [0.24, 0.1, 0.11];
    let item = '';
    if (r < P[0]) item = 'perk';
    else if (r < P[0] + P[1] && this.onMap('tronador')) item = 'tronador';
    else if (r < P[0] + P[1] + P[2]) item = 'wonder';
    const msg = [by, pts, item, +m.pos.x.toFixed(2), +m.pos.y.toFixed(2), +m.pos.z.toFixed(2), k];
    g.net?.event('ee', { lnr: msg });
    this.applyChest(msg);
    // el power-up sale del otro lado del pozo (encima del que cavó lo agarraba sin verlo)
    const who = by === this.myId() ? g.player : g.net?.remote.get(by);
    const a = who ? Math.atan2(m.pos.z - who.pos.z, m.pos.x - who.pos.x) : Math.random() * 6;
    const at = m.pos.clone();
    g.later(1.4, () => g.powerups.drop(at.set(at.x + Math.cos(a) * 2, at.y, at.z + Math.sin(a) * 2), true));
    this.sync(true);
    return true;
  }

  onMap(id) {
    const W = WEAPONS[id];
    return !!W && (!W.only || [].concat(W.only).includes(MAP_ID));
  }

  // El cofre (en cada compu): puntos para todos, lo demás para el que cavó.
  applyChest([by, pts, item, x, y, z, k]) {
    const g = this.g;
    const m = this.mounds[k];
    if (m && m.st !== 2) {
      m.pos.set(x, y, z);
      m.st = 2;
      this.showMound(m);
    }
    this.openChest(x, y, z);
    g.addPoints(pts, null, true);
    const mine = by === this.myId();
    let label = '';
    if (mine && item) label = this.giveItem(item);
    g.hud.toast(`¡Tesoro! +${pts}${label ? ` · ${label}` : ''}`);
  }

  giveItem(item) {
    const g = this.g;
    if (item === 'perk') {
      const missing = PERK_ORDER.filter((p) => PERKS[p] && !g.player.perks?.has(p));
      const pick = missing[Math.floor(Math.random() * missing.length)];
      if (!pick) {
        g.addPoints(2000, null, true);
        return '+2000';
      }
      g.weapons.drink(PERKS[pick].color, () => g.player.givePerk(pick));
      return PERKS[pick].label?.brand || PERKS[pick].name;
    }
    let id = item === 'tronador' ? 'tronador' : null;
    if (item === 'wonder') {
      const list = Object.keys(WEAPONS).filter((w) => WEAPONS[w].wonder && WEAPONS[w].box && !WEAPONS[w].egg && this.onMap(w) && !g.weapons.has(w));
      id = list[Math.floor(Math.random() * list.length)] || null;
    }
    if (!id) {
      g.addPoints(2000, null, true);
      return '+2000';
    }
    // (no se pierde el Mate de Oro ni el de la Luz Mala: si no hay lugar, se cambia otro)
    const W = g.weapons;
    const precious = (s) => !s || PRECIOUS.includes(s.id) || WEAPONS[s.id]?.egg;
    if (!W.has(id) && W.slots.length >= W.maxSlots && precious(W.slot)) {
      const i = W.slots.findIndex((s) => !precious(s));
      if (i < 0) {
        g.addPoints(2000, null, true);
        return '+2000';
      }
      W.cur = i;
    }
    W.give(id);
    return WEAPONS[id].name;
  }

  // El cofre: sube del pozo, se abre con un golpe de luz dorada y monedas.
  buildChest() {
    const M = this.g.world.M;
    const grp = new THREE.Group();
    const wood = M.wood || M.woodDark;
    const iron = M.brass || M.iron;
    const body = new THREE.Mesh(boxGeo(0.62, 0.34, 0.4), wood);
    body.position.y = 0.17;
    grp.add(body);
    for (const x of [-0.24, 0.24]) {
      const band = new THREE.Mesh(boxGeo(0.05, 0.36, 0.42), iron);
      band.position.set(x, 0.17, 0);
      grp.add(band);
    }
    const lid = new THREE.Group();
    lid.position.set(0, 0.34, -0.2);
    const top = new THREE.Mesh(cylGeo(0.2, 0.2, 0.62, 12).clone().rotateZ(Math.PI / 2), wood);
    top.scale.set(1, 1, 1);
    top.position.set(0, 0, 0.2);
    lid.add(top);
    grp.add(lid);
    const shine = new THREE.Mesh(boxGeo(0.54, 0.02, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.3).multiplyScalar(2.2), toneMapped: false }));
    shine.position.y = 0.33;
    grp.add(shine);
    grp.visible = false;
    this.root.add(grp);
    return { grp, lid, shine, t: 0, on: false, pos: new THREE.Vector3() };
  }

  openChest(x, y, z) {
    const g = this.g;
    const c = this.chests.find((q) => !q.on) || this.chests[0];
    c.on = true;
    c.t = 0;
    c.pos.set(x, y, z);
    c.grp.visible = true;
    c.grp.position.set(x, y - 0.45, z);
    c.grp.rotation.y = Math.random() * Math.PI * 2;
    g.fx.dirt(tA.set(x, y + 0.1, z), 22);
    this.sfx('dig', tA);
  }

  updateChests(dt) {
    const g = this.g;
    for (const c of this.chests) {
      if (!c.on) continue;
      const was = c.t;
      c.t += dt;
      const up = Math.min(1, c.t / 0.6);
      c.grp.position.y = c.pos.y - 0.45 + (1 - (1 - up) * (1 - up)) * 0.47;
      const open = Math.max(0, Math.min(1, (c.t - 0.7) / 0.45));
      c.lid.rotation.x = -open * 1.9;
      if (was < 0.75 && c.t >= 0.75) {
        tA.set(c.pos.x, c.pos.y + 0.5, c.pos.z);
        g.fx.flash(tA, 0xffc864, 16, 0.9, 7);
        this.pillar(c.pos.x, c.pos.y + 0.3, c.pos.z, true, 4.5, true, 0.32);
        g.fx.sparkle(tA, [1, 0.85, 0.4], 26, 0.5);
        for (let i = 0; i < 26; i++) {
          g.fx.alpha.spawn(tA.x, tA.y, tA.z, (Math.random() - 0.5) * 2.4, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.4, { color: C_GOLD, size: 0.07, life: 1.3, gravity: 9, bounce: 1 });
        }
        this.sfx('chest', tA);
      }
      if (c.t > 4.5) {
        c.grp.position.y -= (c.t - 4.5) * 0.6;
        if (c.t > 5.4) {
          c.on = false;
          c.grp.visible = false;
        }
      }
    }
  }

  // Las columnas de luz (cuando suben de las tumbas se ven desde todo el molino,
  // por arriba de las paredes) y el anillo que corre por el piso. Un grupo
  // fijo, que se reusa.
  buildPillars() {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true).translate(0, 0.5, 0);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    const add = { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false };
    // la columna: de frente brilla, de canto se desvanece (borde suave, sin el
    // tubo macizo) y se apaga hacia arriba
    const beamMat = (r, gg, b) =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(r, gg, b) }, uOp: { value: 0 } },
        vertexShader: PILLAR_VS,
        fragmentShader: PILLAR_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    this.pillars = [];
    for (let i = 0; i < 9; i++) {
      const beam = new THREE.Mesh(geo, beamMat(0.42, 1, 0.26));
      const core = new THREE.Mesh(geo, beamMat(0.78, 1, 0.5));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1, 0.35), ...add }));
      for (const m of [beam, core, ring]) {
        m.visible = false;
        m.frustumCulled = false;
        m.renderOrder = 6;
        this.root.add(m);
      }
      this.pillars.push({ beam, core, ring, t: 0, on: false, tall: true, h: 24, r: 1.05 });
    }
  }

  pillar(x, y, z, tall = true, h = 24, gold = false, r = 1.05) {
    const P = this.pillars.find((q) => !q.on) || this.pillars[0];
    P.beam.material.uniforms.uColor.value.setRGB(...(gold ? [1, 0.62, 0.18] : [0.42, 1, 0.26]));
    P.core.material.uniforms.uColor.value.setRGB(...(gold ? [1, 0.85, 0.5] : [0.78, 1, 0.5]));
    P.ring.material.color.setRGB(...(gold ? [1, 0.7, 0.3] : [0.55, 1, 0.35]));
    P.on = true;
    P.t = 0;
    P.tall = tall;
    P.h = h;
    P.r = r;
    for (const m of [P.beam, P.core, P.ring]) m.position.set(x, y + 0.03, z);
  }

  updatePillars(dt) {
    const cam = this.g.camera.position;
    for (const P of this.pillars) {
      if (!P.on) continue;
      P.t += dt;
      const t = P.t;
      // de cerca se apaga (adentro, nada): pegada a la cámara tapaba la vista
      const dc = Math.hypot(cam.x - P.beam.position.x, cam.z - P.beam.position.z);
      const k = Math.min(1, Math.max(0, (dc - P.r - 0.3) / (6 - P.r - 0.3)));
      const near = k * k * (3 - 2 * k);
      // sube de golpe (0,25 s), se queda y se va apagando y afinando
      const up = Math.min(1, t / 0.25);
      const fade = t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 2);
      const vis = P.tall && fade > 0;
      P.beam.visible = P.core.visible = vis;
      if (vis) {
        const r = P.r * (0.55 + 0.45 * fade) * (1 + Math.sin(t * 30) * 0.04);
        P.beam.scale.set(r * 2, P.h * up, r * 2);
        P.core.scale.set(r * 0.7, P.h * up * 1.02, r * 0.7);
        P.beam.material.uniforms.uOp.value = 0.55 * fade * near;
        P.core.material.uniforms.uOp.value = 0.7 * fade * near;
      }
      const rk = Math.min(1, t / 0.9);
      P.ring.visible = rk < 1;
      if (P.ring.visible) {
        const rr = 0.6 + rk * (P.tall ? 6 * Math.min(1, P.r) : 3.5);
        P.ring.scale.set(rr, 1, rr);
        P.ring.material.opacity = 0.75 * (1 - rk) * (0.3 + 0.7 * near);
      }
      if (!vis && !P.ring.visible) P.on = false;
    }
  }

  // Mientras se mantiene F en un montículo: tierra que vuela y el ruido de la pala.
  digTick(dt) {
    const g = this.g;
    const it = g.interact?.current;
    if (!it || it.kind !== 'luzdig' || !g.input.key('KeyF') || !g.player.alive) return;
    this.digSndT -= dt;
    if (this.digSndT > 0) return;
    this.digSndT = 0.24;
    g.fx.dirt(tA.set(it.pos.x, it.pos.y - 0.4, it.pos.z), 6);
    for (let i = 0; i < 4; i++) g.fx.alpha.spawn(it.pos.x, it.pos.y - 0.35, it.pos.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 2, { color: C_DIRT, size: 0.06, life: 0.9, gravity: 9, bounce: 1 });
    this.sfx('scrape', tA);
  }

  // ---------------- la noche: luz, cielo, niebla y ambiente ----------------
  ensureWeather() {
    const W = this.g.weather;
    if (!W?.S || W.S.lmnoche) return;
    W.S.lmnoche = { ...WEATHER };
  }

  night(dt) {
    const g = this.g;
    const want = this.active ? 1 : 0;
    const d = want - this.nightK;
    if (d) this.nightK += Math.sign(d) * Math.min(Math.abs(d), dt / (want ? 3 : 3.5));
    this.darkT += dt;
    this.relT += dt;
    if (this.lightMode) this.lamps();
    const k = this.nightK;
    if (k > 0.001 || this.saved) this.sky(k, dt);
    // la niebla rastrera
    if (k > 0.25) {
      this.fogT -= dt;
      const cam = g.camera.position;
      while (this.fogT <= 0) {
        this.fogT += 0.11 / k;
        // (no pegada a la cámara: de cerca era un velo lechoso)
        const a = Math.random() * Math.PI * 2;
        const r = 4.5 + Math.random() * 13;
        g.fx.alpha.spawn(cam.x + Math.cos(a) * r, 0.04 + Math.random() * 0.22, cam.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.25, 0.01, (Math.random() - 0.5) * 0.25, { color: C_FOG, size: 3, size1: 5.5, life: 8 + Math.random() * 3, alpha: 0.13 * k, drag: 0.1 });
      }
    }
  }

  // Las lámparas y faroles del mapa: titilan y se apagan (cada una a su
  // tiempo); al final vuelven con un golpe de luz. EasterEgg.update corre
  // antes que World.update: alcanza con el target de cada una.
  lamps() {
    const g = this.g;
    const w = g.world;
    const fireL = this.ee.fireLight;
    let sum = 0;
    let n = 0;
    for (const e of w.lights) {
      const raw = e === fireL ? e.target ?? e.base : w.power ? e.base : e.base * e.def.noPower;
      const keep = KEEP[e.def.kind] ?? 0.03;
      let f = 1;
      if (this.lightMode === 'dark') {
        const t = this.darkT - (e.lmD ?? 1);
        if (t < -1) f = 1;
        else if (t < 0) f = Math.random() < 0.55 + t * 0.25 ? 1 : keep + Math.random() * 0.2;
        else f = keep;
      } else {
        const t = this.relT - (e.lmD ?? 0);
        f = t < 0 ? keep : t < 0.12 ? keep + (2.4 - keep) * (t / 0.12) : 1 + 1.4 * Math.exp(-(t - 0.12) * 2.6);
      }
      e.target = raw * f;
      if (e.bulb) e.bulb.visible = f > 0.2;
      sum += f;
      n++;
    }
    const avg = n ? sum / n : 1;
    if (!this.lampMats) {
      this.lampMats = [];
      this.lampCols = [];
      for (const l of w.dynamic.lamps || []) {
        l.traverse((o) => {
          if (!o.isMesh || !o.material?.emissive || this.lampMats.includes(o.material)) return;
          this.lampMats.push(o.material);
          this.lampCols.push(o.material.color.clone());
        });
      }
    }
    // (el vidrio de los faroles también se apaga del todo, y se oscurece: el
    // color crema solo, con la luna, parecía prendido)
    const lit = this.lightMode === 'dark' ? Math.min(1, avg * avg * 1.2) : avg;
    this.lampMats.forEach((m, i) => {
      m.emissiveIntensity = (w.power ? 2.5 : 1.2) * lit;
      m.color.copy(this.lampCols[i]).multiplyScalar(0.3 + 0.7 * Math.min(1, lit));
    });
    // ya volvieron todas: se deja de tocar
    if (this.lightMode === 'relight' && this.relT > 3.5) {
      this.lightMode = null;
      for (const e of w.lights) {
        e.target = e === fireL ? e.target : w.power ? e.base : e.base * e.def.noPower;
        if (e.bulb) e.bulb.visible = true;
      }
      this.lampMats.forEach((m, i) => {
        m.emissiveIntensity = w.power ? 2.5 : 1.2;
        m.color.copy(this.lampCols[i]);
      });
    }
  }

  // El cielo (la luna se tapa, menos luz de ambiente), la niebla que llega
  // rápido y el ambiente que se calla.
  sky(k, dt) {
    const g = this.g;
    const w = g.world;
    if (!this.saved) {
      this.saved = { hemi: w.hemiBase, amb: w.ambient?.intensity, moon: SKY.moon };
      this.moonObj = { ...(SKY.moon || {}) };
    }
    const S = this.saved;
    w.hemiBase = (S.hemi ?? 0.9) * (1 - 0.7 * k);
    if (w.ambient) w.ambient.intensity = (S.amb ?? 0.5) * (1 - 0.65 * k);
    this.moonObj.light = (S.moon?.light ?? 1) * (1 - 0.78 * k);
    this.moonObj.glow = (S.moon?.glow ?? 1) * (1 - 0.88 * k);
    SKY.moon = this.moonObj;
    // las nubes y la niebla no esperan los 12 s del clima
    const W = g.weather;
    // (la ronda pone su luna roja después de arrancar la noche: Rounds.nextRound)
    if (W && this.active && this.dusk0 != null && W.dusk > 0) {
      this.dusk0 = Math.max(this.dusk0, W.dusk);
      W.dusk = 0;
    }
    if (W?.cur && W.target && (W.name === 'lmnoche' || !this.active) && (this.active ? this.T < 7 : this.relT < 7)) {
      const f = Math.min(1, dt * 0.8);
      for (const key of WKEYS) W.cur[key] += (W.target[key] - W.cur[key]) * f;
      W.fogColor?.lerp(tCol.setHex(W.target.fogColor), f);
      if (W.duskCur != null) W.duskCur += (W.dusk - W.duskCur) * f;
    }
    // el ambiente (viento y zumbido) casi no se oye
    const amb = g.audio?.amb;
    if (amb && Math.abs(k - this.ambK) > 0.04) {
      this.ambK = k;
      amb.out.gain.setTargetAtTime(0.5 - 0.44 * k, g.audio.now, 0.4);
    }
    if (k <= 0.001 && !this.active) this.restoreSky();
  }

  restoreSky() {
    const S = this.saved;
    if (!S) return;
    this.saved = null;
    const w = this.g.world;
    w.hemiBase = S.hemi;
    if (w.ambient && S.amb !== undefined) w.ambient.intensity = S.amb;
    if (S.moon) SKY.moon = S.moon;
    else delete SKY.moon;
    const amb = this.g.audio?.amb;
    if (amb) amb.out.gain.setTargetAtTime(0.5, this.g.audio.now, 0.4);
    this.ambK = -1;
  }

  // Arranca la noche (en cada compu): el golpe, el rayo y las luces que se apagan.
  startFx() {
    const g = this.g;
    this.ensureWeather();
    this.T = 0;
    this.darkT = 0;
    this.lightMode = 'dark';
    // (todas juntas con el golpe del apagón grabado; si no bajó, de a una)
    const rec = g.audio?.eventSfx?.('evento-apagon-molino', { gain: 1.1, reverb: 0.35 });
    for (const e of g.world.lights) e.lmD = rec ? 0.08 + Math.random() * 0.22 : 0.6 + Math.random() * 2.6;
    this.sfx('sting');
    // la luna roja de las rondas altas también se tapa (vuelve al terminar)
    const W = g.weather;
    if (W && this.dusk0 == null) {
      this.dusk0 = W.dusk || 0;
      W.dusk = 0;
    }
    g.post?.flash(g.settings?.calmFx ? 0.2 : 0.55);
    g.fx.addShake(0.35);
    const top = tA.set(64, 34, 23);
    g.fx.lightning(top, tB.set(EE_TUMBA.x, 1.5, EE_TUMBA.z), 0x9affc8, 0.5);
    this.hud?.vig.classList.add('is-on');
  }

  // Termina (en cada compu): vuelve la luna y las luces con un golpe.
  endFx() {
    const g = this.g;
    this.lightMode = 'relight';
    this.relT = 0;
    const W = g.weather;
    if (W && this.dusk0 != null) W.dusk = Math.max(W.dusk || 0, this.dusk0);
    this.dusk0 = null;
    for (const e of g.world.lights) e.lmD = Math.random() * 0.7;
    g.post?.flash(g.settings?.calmFx ? 0.15 : 0.35);
    this.sfx('dawn');
    this.hud?.vig.classList.remove('is-on');
    this.lamp.intensity = 0;
    this.lamp.position.y = -50;
  }

  // ---------------- lo que se ve (en cada compu) ----------------
  draw(dt) {
    const g = this.g;
    const G = this.glow;
    const t = g.time;
    const cam = g.camera.position;
    G.begin(cam);
    let l1 = null;
    let d1 = Infinity;
    let l2 = null;
    let d2 = Infinity;
    for (const l of this.luces) {
      // (todavía abajo de la tierra, o adentro del Capataz)
      if (!l.alive || l.st === INSIDE || (l.st === RISE && l.t < 0) || l.pos.y < -0.1) continue;
      // tiembla, se apaga de golpe un instante y en el aviso se enciende
      if (l.blinkT > 0) l.blinkT -= dt;
      else if (Math.random() < dt * 0.35) l.blinkT = 0.08 + Math.random() * 0.1;
      let fl = 0.8 + Math.sin(t * 17 + l.ph) * 0.1 + Math.sin(t * 5.3 + l.ph * 2) * 0.08;
      if (l.blinkT > 0) fl *= 0.15;
      if (l.st === FLARE) fl *= 1.5 + Math.sin(t * 42) * 0.35;
      else if (l.st === LUNGE) fl *= 1.4;
      else if (l.st === RISE) fl *= 0.5 + Math.min(1, l.t / RISE_DUR) * 0.5;
      l.fl = fl;
      const p = l.pos;
      const dc = p.distanceToSquared(cam);
      const dd = Math.sqrt(dc);
      // de lejos sigue leyéndose como una luz (unos píxeles como mínimo); de
      // cerca el halo no tapa la pantalla (antes, encima, era todo verde)
      const near = Math.min(1, Math.max(0, (dd - 0.8) / 3));
      G.push(p.x, p.y, p.z, Math.max(0.42, dd * 0.022) * (0.8 + fl * 0.3), C_CORE, Math.min(0.9, fl));
      G.push(p.x, p.y, p.z, Math.max(Math.min(1.9 * fl, 0.5 * dd), dd * 0.1), C_HALO, 0.5 * fl);
      G.push(p.x, p.y, p.z, Math.min(5, 1.1 * dd), C_OUT, 0.14 * fl * near);
      // la estela (no pegada a la cámara: eran manchas grandes en la pantalla)
      l.trailT -= dt;
      while (l.trailT <= 0) {
        l.trailT += 0.035;
        if (dd < 2.2) continue;
        g.fx.add.spawn(p.x + (Math.random() - 0.5) * 0.12, p.y + (Math.random() - 0.5) * 0.12, p.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.25, (Math.random() - 0.5) * 0.3, { color: C_TRAIL, size: 0.2, size1: 0, life: 0.75, drag: 1.5 });
      }
      if (Math.random() < dt * 4) g.fx.sparkle(p, C_HALO, 1, 0.35);
      // el silbido (cerca)
      l.whisT -= dt;
      if (l.whisT <= 0) {
        l.whisT = 1.8 + Math.random() * 1.8;
        if (dc < 500) this.sfx('whisper', p);
      }
      if (dc < d1) {
        l2 = l1;
        d2 = d1;
        l1 = l;
        d1 = dc;
      } else if (dc < d2) {
        l2 = l;
        d2 = dc;
      }
    }
    // los poseídos: ojos, aura y lucecitas que suben
    let np = 0;
    for (const z of g.zombies.pool) {
      if (z.lmPid !== z.id || !z.active) continue;
      if (z.dead) {
        // se le escapa la luz
        z.lmPid = -1;
        tA.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z);
        for (let i = 0; i < 12; i++) g.fx.add.spawn(tA.x, tA.y, tA.z, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { color: C_TRAIL, size: 0.14, size1: 0, life: 0.9, drag: 1 });
        continue;
      }
      np++;
      this.drawPossessed(z, 1, t, dt);
    }
    this.possessedN = np;
    // el Capataz Maldito
    const b = g.zombies.boss;
    const mald = b && b.active && !b.dead && b.maldito;
    if (mald) this.drawPossessed(b, 2.4, t, dt);
    // los montículos
    for (const m of this.mounds) {
      if (m.st !== 1) continue;
      m.t += dt;
      const pul = 0.3 + Math.sin(t * 2.2 + m.k) * 0.08;
      G.push(m.pos.x, m.pos.y + 0.3, m.pos.z, 1.3, C_HALO, pul);
      G.push(m.pos.x, m.pos.y + 0.12, m.pos.z, 2.6, C_OUT, pul * 0.4);
      // lucecitas que suben del entierro (se ven de lejos)
      if (Math.random() < dt * 5) g.fx.add.spawn(m.pos.x + (Math.random() - 0.5) * 0.9, m.pos.y + 0.2, m.pos.z + (Math.random() - 0.5) * 0.9, 0, 0.5 + Math.random() * 0.6, 0, { color: C_TRAIL, size: 0.12, size1: 0, life: 1.6, drag: 0.3 });
      if (Math.random() < dt * 1.6) g.fx.sparkle(tA.set(m.pos.x + (Math.random() - 0.5) * 0.8, m.pos.y + 0.25, m.pos.z + (Math.random() - 0.5) * 0.8), C_HALO, 1, 0.3);
    }
    if (this.moundGlow) this.moundGlow.material.opacity = 0.42 + Math.sin(t * 2.2) * 0.12;
    for (const c of this.chests) {
      if (!c.on || c.t < 0.7) continue;
      const k = Math.max(0, 1 - (c.t - 0.7) / 3.5);
      G.push(c.pos.x, c.pos.y + 0.45, c.pos.z, 2.4, C_GOLD, 0.45 * k);
      if (Math.random() < dt * 8 * k) g.fx.sparkle(tA.set(c.pos.x, c.pos.y + 0.5, c.pos.z), C_GOLD, 1, 0.3);
    }
    G.end();
    // las luces de verdad: la luz más cercana (y el Capataz Maldito)
    const L = this.lamp;
    if (mald) {
      // (un poco hacia la cámara: que se le vea la cara verde, no solo el piso;
      // de cerca, menos: la luz pegada a la cámara blanqueaba todo)
      tA.set(cam.x - b.pos.x, 0, cam.z - b.pos.z);
      const db = tA.length() || 1;
      tA.multiplyScalar(1 / db);
      L.position.set(b.pos.x + tA.x * 0.8, (b.baseY || 0) + 1.2 * (b.scale || 1), b.pos.z + tA.z * 0.8);
      const kb = Math.min(1, Math.max(0, (db - 1.5) / 3.5));
      L.intensity = (3.2 + Math.sin(t * 9) * 0.8) * (0.3 + 0.7 * kb);
      l2 = l1;
    } else if (l1) {
      L.position.copy(l1.pos);
      // (encima de la cámara, menos: todo se volvía verde)
      L.intensity = 3.4 * Math.min(1.4, l1.fl) * Math.min(1, Math.max(0.25, (Math.sqrt(d1) - 0.5) / 2.5));
    } else if (L.intensity) {
      L.intensity = 0;
      L.position.y = -50;
    }
    const L2 = g.luz?.state === 'off' ? g.luz.light : null;
    if (L2) {
      if (l2 && this.active) {
        L2.position.copy(l2.pos);
        L2.intensity = 3 * Math.min(1.4, l2.fl);
        this.usedL2 = true;
      } else if (this.usedL2) {
        this.usedL2 = false;
        L2.intensity = 0;
        L2.position.y = -50;
      }
    }
  }

  // Ojos y aura de un poseído (k: el tamaño, el Capataz más grande).
  drawPossessed(z, k, t, dt) {
    const g = this.g;
    const G = this.glow;
    const s = z.scale || 1;
    const by = z.baseY || 0;
    const fl = 0.8 + Math.sin(t * 13 + z.id) * 0.12 + Math.sin(t * 4.1 + z.id * 2) * 0.08;
    // de cerca, el aura más chica y más tenue (encima tapaba la pantalla)
    const cam = g.camera.position;
    const dc = Math.hypot(z.pos.x - cam.x, by + 1 * s - cam.y, z.pos.z - cam.z);
    const near = 0.25 + 0.75 * Math.min(1, Math.max(0, (dc - 1) / 3));
    // la cabeza: la de la pose si está, si no la altura de siempre
    tA.setFromMatrixPosition(z.mats[2]);
    if (!(tA.y > by + 0.5) || Math.abs(tA.x - z.pos.x) > 2) tA.set(z.pos.x, by + 1.6 * s, z.pos.z);
    const fx = Math.sin(z.yaw || 0);
    const fz = Math.cos(z.yaw || 0);
    if (!(z.hidden & 4)) {
      const fwd = 0.13 * s;
      const side = 0.055 * s;
      const ey = tA.y + 0.03 * s;
      // (de lejos, los ojos no se pierden: unos píxeles como mínimo)
      const es = Math.max(0.09 * s, dc * 0.012);
      G.push(tA.x + fx * fwd - fz * side, ey, tA.z + fz * fwd + fx * side, es, C_EYE, 1);
      G.push(tA.x + fx * fwd + fz * side, ey, tA.z + fz * fwd - fx * side, es, C_EYE, 1);
      G.push(tA.x + fx * fwd, ey, tA.z + fz * fwd, Math.min(0.5 * s, dc * 0.3), C_HALO, 0.3 * fl);
    }
    const big = k > 1;
    // el aura: tenue sobre el cuerpo (se le ve la figura) y el resplandor en el piso
    G.push(z.pos.x, by + 1.05 * s, z.pos.z, 2.1 * s * (big ? 1.4 : 1), big ? C_DEEP : C_OUT, (big ? 0.38 : 0.18) * fl * near);
    G.push(z.pos.x, by + 0.12, z.pos.z, 1.4 * s * (big ? 2.2 : 1), big ? C_DEEP : C_HALO, (big ? 0.55 : 0.12) * fl * near);
    // lucecitas que le suben alrededor del cuerpo (al Capataz, llamas verdes
    // por el borde, no encima; de cerca, menos)
    const rate = big ? 22 * (0.3 + 0.7 * near) : 16;
    const n = Math.floor(dt * rate + Math.random());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (big ? 0.5 + Math.random() * 0.35 : 0.25 + Math.random() * 0.2) * s;
      g.fx.add.spawn(z.pos.x + Math.cos(a) * r, by + (big ? 0.2 + Math.random() * 1.3 : Math.random() * 1.6) * s, z.pos.z + Math.sin(a) * r, Math.cos(a) * 0.25, 0.8 + Math.random() * (big ? 1.4 : 0.8), Math.sin(a) * 0.25, { color: big ? C_FLAME : C_TRAIL, size: big ? 0.2 : 0.12, size1: 0, life: big ? 0.7 : 0.9, drag: 0.5 });
    }
  }

  // ---------------- efectos que van por la red ----------------
  // code: 1 sube, 2 toca, 3 posee, 4 se espanta (de, a), 5 se apaga,
  // 7 el Capataz Maldito, 9 el rayo de la subida, 10 se enciende
  fx(code, x, y, z, i = -1, x2 = 0, y2 = 0, z2 = 0) {
    const g = this.g;
    const m = [code, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), i];
    if (code === 4) m.push(+x2.toFixed(2), +y2.toFixed(2), +z2.toFixed(2));
    if (g.net?.host) g.net.event('ee', { lnf: m });
    this.playFx(m);
  }

  playFx([code, x, y, z, i, x2, y2, z2]) {
    const g = this.g;
    const p = tC.set(x, y, z);
    const A = g.fx.add;
    if (code === 1) {
      // sube de la tumba: tierra, un haz y el destello
      g.fx.dirt(p, 30);
      this.pillar(x, 0, z, true, 26);
      g.fx.flash(tA.set(x, 1.5, z), 0xb8ff70, 30, 0.6, 12);
      for (let k = 0; k < 20; k++) A.spawn(x + (Math.random() - 0.5) * 0.6, 0.2, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6, 2 + Math.random() * 5, (Math.random() - 0.5) * 1.6, { color: C_TRAIL, size: 0.16, size1: 0, life: 1.1, drag: 1.2 });
      for (let k = 0; k < 10; k++) g.fx.alpha.spawn(x, 0.1, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, { color: C_DIRT, size: 0.09, life: 1.2, gravity: 9, bounce: 1 });
      if (g.player.pos.distanceTo(tA.set(x, 0, z)) < 16) g.fx.addShake(0.12);
      this.sfx('rise', tA.set(x, 1, z));
    } else if (code === 2) {
      for (let k = 0; k < 22; k++) {
        tA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
        A.spawn(x, y, z, tA.x, tA.y, tA.z, { color: C_HALO, size: 0.14, size1: 0, life: 0.5, drag: 3 });
      }
      g.fx.flash(p, 0xd8ffa0, 25, 0.3, 7);
      this.sfx('zap', p);
    } else if (code === 3) {
      // se mete en el muerto: un remolino de luz y un rugido
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        A.spawn(x + Math.cos(a) * 0.9, y + (Math.random() - 0.3) * 0.8, z + Math.sin(a) * 0.9, -Math.cos(a) * 2.2, 0.4, -Math.sin(a) * 2.2, { color: C_TRAIL, size: 0.16, size1: 0, life: 0.45, drag: 1 });
      }
      g.fx.flash(p, 0x9aff6a, 40, 0.4, 9);
      this.sfx('possess', p);
    } else if (code === 4) {
      for (let k = 0; k < 14; k++) A.spawn(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, { color: C_HALO, size: 0.12, size1: 0, life: 0.35, drag: 4 });
      for (let k = 0; k < 10; k++) A.spawn(x2, y2, z2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, { color: C_CORE, size: 0.1, size1: 0, life: 0.4, drag: 4 });
      const l = this.luces[i];
      if (l && g.net?.guest) {
        l.pos.set(x2, y2, z2);
        l.net.set(x2, y2, z2);
      }
      if (l) l.blinkT = 0.12;
      this.sfx('blink', tA.set(x2, y2, z2));
    } else if (code === 5) {
      // se apaga: un estallido de luz, chispas que caen y la campana rota
      g.fx.flash(p, 0xe8ffb0, 30, 0.4, 10);
      g.fx.sparkle(p, C_CORE, 30, 0.6);
      this.pillar(x, Math.max(0, y - 1.4), z, false);
      for (let k = 0; k < 40; k++) {
        tA.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4);
        A.spawn(x, y, z, tA.x, tA.y, tA.z, { color: k % 3 ? C_HALO : C_CORE, size: 0.16, size1: 0, life: 0.8 + Math.random() * 0.5, drag: 2, gravity: 2 });
      }
      for (let k = 0; k < 10; k++) A.spawn(x, y, z, (Math.random() - 0.5) * 0.6, -0.5 - Math.random(), (Math.random() - 0.5) * 0.6, { color: C_TRAIL, size: 0.1, size1: 0, life: 1.4, attract: tB.set(x, 0, z).clone() });
      if (g.player.pos.distanceTo(p) < 12) g.fx.addShake(0.2);
      this.sfx('die', p);
    } else if (code === 7) {
      // entra en el Capataz: rayo, trueno y rugido
      g.fx.lightning(tA.set(x, y + 22, z), tB.set(x, y, z), 0x9affc8, 0.6);
      g.fx.flash(p, 0x9aff6a, 30, 0.7, 14);
      this.pillar(x, Math.max(0, y - 1.6), z, true, 30);
      g.post?.flash(g.settings?.calmFx ? 0.2 : 0.6);
      g.fx.addShake(0.45);
      for (let k = 0; k < 30; k++) {
        tA.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 5);
        A.spawn(x, y, z, tA.x, tA.y, tA.z, { color: C_FLAME, size: 0.16, size1: 0, life: 0.9, drag: 2 });
      }
      this.sfx('maldito', p);
      g.audio.sting();
      const b = g.zombies.boss;
      if (b && g.net?.guest) b.maldito = true;
    } else if (code === 9) {
      // el golpe: un rayo verde sobre el cementerio y el trueno
      g.fx.lightning(tA.set(x + 2, 36, z - 2), tB.set(x, 0.5, z), 0x9affc8, 0.7);
      g.post?.flash(g.settings?.calmFx ? 0.2 : 0.7);
      g.fx.addShake(0.3);
      g.audio.thunder?.(tA.set(x, 6, z), true);
    } else if (code === 10) {
      this.sfx('flare', p);
    } else if (code === 11) {
      // se esfuma sin tesoro (terminó la noche y nadie la apagó): sube y se deshace
      g.fx.sparkle(p, C_HALO, 14, 0.5);
      for (let k = 0; k < 16; k++) A.spawn(x, y, z, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, { color: k % 2 ? C_HALO : C_TRAIL, size: 0.14, size1: 0, life: 1 + Math.random() * 0.6, drag: 1.2, gravity: -0.4 });
    }
  }

  // ---------------- red ----------------
  state() {
    const L = [];
    for (const l of this.luces) L.push(Math.round(l.pos.x * 10), Math.round(l.pos.y * 10), Math.round(l.pos.z * 10), l.alive ? l.st : OFF);
    const P = [];
    for (const z of this.g.zombies.pool) if (z.active && !z.dead && z.lmPid === z.id) P.push(z.id & 0xffff);
    const M = [];
    for (const m of this.mounds) if (m.st) M.push(m.k, m.st, Math.round(m.pos.x * 100), Math.round(m.pos.y * 100), Math.round(m.pos.z * 100));
    const b = this.g.zombies.boss;
    return { a: this.active ? 1 : 0, l: this.lock() ? 1 : 0, r: this.round, t: this.tier, c: this.climaxed ? 1 : 0, C: b?.maldito && !b.dead ? 1 : 0, L, P, M };
  }

  sync(force = false) {
    const g = this.g;
    if (!g.net?.host || !force) return;
    this.syncT = SYNC_T;
    g.net.event('ee', { ln: this.state() });
  }

  // Lo que manda el anfitrión (invitados): el estado y los efectos.
  applyEvent(m) {
    const g = this.g;
    if (m.ln) this.applyRemote(m.ln);
    if (m.lnf) this.playFx(m.lnf);
    if (m.lnr) this.applyChest(m.lnr);
    if (m.lnb != null && m.lnb === g.net?.id) this.blind();
    if (m.lne) this.reward(m.lne);
  }

  applyRemote(s) {
    const g = this.g;
    const was = this.active;
    this.active = !!s.a;
    this.lockRemote = !!s.l;
    this.round = s.r | 0;
    this.tier = s.t || 1;
    this.climaxed = !!s.c;
    const L = s.L || [];
    const n = L.length / 4;
    while (this.luces.length < n) this.luces.push(this.newLuz(this.luces.length));
    this.luces.forEach((l, i) => {
      if (i >= n) {
        l.alive = false;
        l.st = OFF;
        return;
      }
      const st = L[i * 4 + 3];
      l.net.set(L[i * 4] / 10, L[i * 4 + 1] / 10, L[i * 4 + 2] / 10);
      if (!l.alive && st) l.pos.copy(l.net);
      if (st !== l.st) l.t = 0;
      l.st = st;
      l.alive = st !== OFF;
    });
    // los poseídos (el número que manda el anfitrión, de 16 bits)
    const P = s.P || [];
    if (P.length) {
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.lmPid === z.id) continue;
        if (P.includes(z.id & 0xffff)) {
          z.lmPid = z.id;
          g.zombies.paint(z, TINT);
        }
      }
    }
    const b = g.zombies.boss;
    if (b) {
      b.maldito = !!s.C;
      if (s.C) b.lmPid = b.id;
    }
    // los montículos
    const seen = new Set();
    const M = s.M || [];
    for (let j = 0; j + 4 < M.length; j += 5) {
      const m = this.mounds[M[j]];
      if (!m) continue;
      seen.add(m.k);
      const st = M[j + 1];
      const x = M[j + 2] / 100;
      const y = M[j + 3] / 100;
      const z = M[j + 4] / 100;
      if (m.st !== st || Math.abs(m.pos.x - x) > 0.05 || Math.abs(m.pos.z - z) > 0.05) {
        m.st = st;
        m.pos.set(x, y, z);
        this.showMound(m);
      }
    }
    for (const m of this.mounds) {
      if (m.st && !seen.has(m.k)) {
        m.st = 0;
        this.showMound(m);
      }
    }
    if (this.active !== was) {
      if (this.active) this.startFx();
      else this.endFx();
    }
  }

  // ---------------- el cartel ----------------
  buildHud() {
    const g = this.g;
    if (!g.hud?.root) return;
    const vig = document.createElement('div');
    vig.className = 'mdu-lmv';
    const blind = document.createElement('div');
    blind.className = 'mdu-lmb';
    const el = document.createElement('div');
    el.className = 'mdu-lmn';
    el.innerHTML = '<b>La Noche de la Luz Mala</b><i></i>';
    g.hud.root.prepend(vig, blind);
    g.hud.root.appendChild(el);
    this.hud = { el, vig, blind, dots: el.querySelector('i'), n: -1 };
  }

  updateHud() {
    const h = this.hud;
    if (!h) return;
    const on = this.active;
    h.el.classList.toggle('is-on', on);
    if (!on) return;
    const n = this.luces.length;
    if (n !== h.n) {
      h.n = n;
      h.dots.innerHTML = '<s></s>'.repeat(n);
    }
    const ds = h.dots.children;
    this.luces.forEach((l, i) => {
      const c = !l.alive ? 'is-out' : l.st === CLIMAX || l.st === INSIDE ? 'is-cap' : l.st === RISE && (l.t < 0 || l.pos.y < 0) ? 'is-wait' : '';
      if (ds[i] && ds[i].className !== c) ds[i].className = c;
    });
  }

  // ---------------- sonidos ----------------
  // Los que suenan seguido (el silbido de cada luz, la pala, los golpes) se
  // hornean una vez (audio.bakeSound) y suenan grabados: armar el sintetizado
  // en cada uno cargaba el hilo de audio en las compus flojas. Mientras no
  // están, suenan en vivo.
  bakeSounds() {
    const a = this.g.audio;
    if (!a?.bakeSound || a.baked?.['lm-whisper']) return;
    for (const [k, R] of Object.entries(SND)) a.bakeSound('lm-' + k, R.dur, R.body, R.takes);
  }

  sfx(kind, pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const R = SND[kind];
    if (R) {
      const buf = a.bakedBuf?.('lm-' + kind);
      if (buf) a.playBuffer(buf, { pos, gain: R.gain, reverb: R.verb, ref: R.ref });
      else R.body.call(a, a.out({ pos, gain: R.gain, reverb: R.verb, ref: R.ref }), t);
      if (kind === 'possess') a.growl?.(pos, 'attack');
      else if (kind === 'chest') a.powerupGrab?.();
      return;
    }
    // (una vez por noche: en vivo)
    if (kind === 'sting') {
      // el golpe que tapa la luna: un trueno lejano, un bajo que cae y un racimo de voces de luz
      const o = a.out({ gain: 0.9, reverb: 0.9, bus: a.music });
      a.tone(o, { t, dur: 3, freq: 58, freqEnd: 26, gain: 0.9, attack: 0.01 });
      a.noise(o, { t, dur: 2.4, freq: 600, freqEnd: 50, gain: 0.7, brown: true });
      a.tone(o, { t, dur: 4.5, type: 'sawtooth', freq: 41.2, gain: 0.07, attack: 0.6 });
      for (const [n, d] of [[69, 0], [70, 0.06], [76, 0.12], [77, 0.18], [81, 0.3]]) a.tone(o, { t: t + d, dur: 5, freq: midi(n), freqEnd: midi(n) * 0.93, gain: 0.06, attack: 1.4 });
      a.noise(o, { t: t + 0.2, dur: 3, type: 'bandpass', freq: 400, freqEnd: 3200, q: 2, gain: 0.12, attack: 2.4 });
      if (!a.playThunder?.('trueno-intenso', { gain: 0.8, muffle: 1500 })) a.thunder?.(null, true);
    } else if (kind === 'maldito') {
      const o = a.out({ pos, gain: 1.1, reverb: 0.8, ref: 5 });
      a.tone(o, { t, dur: 2, type: 'sawtooth', freq: 70, freqEnd: 35, gain: 0.25 });
      a.noise(o, { t, dur: 1.6, freq: 900, freqEnd: 80, gain: 0.7, brown: true });
      a.thunder?.(pos, true);
      a.growl?.(tA.copy(pos).setY(pos.y + 1), 'boss');
    } else if (kind === 'dawn') {
      const o = a.out({ gain: 0.6, reverb: 0.9, bus: a.music });
      [[60, 0], [67, 0.08], [72, 0.16], [76, 0.24]].forEach(([n, d]) => a.tone(o, { t: t + d, dur: 3, freq: midi(n), gain: 0.1, attack: 0.3 }));
      a.noise(o, { t, dur: 1.5, type: 'bandpass', freq: 3000, freqEnd: 800, q: 1, gain: 0.1, attack: 0.05 });
    }
  }

  dispose() {
    this.active = false;
    this.restoreSky();
    const h = this.hud;
    if (h) {
      h.el.remove();
      h.vig.remove();
      h.blind.remove();
    }
    this.hud = null;
  }
}

// Las recetas de los sonidos que suenan seguido (this: el audio; o: la salida;
// t: cuándo). dur y takes: para hornearlas (LuzMala.bakeSounds).
const SND = {
  whisper: {
    dur: 1.8,
    takes: 4,
    gain: 0.5,
    verb: 0.6,
    ref: 3,
    body(o, t) {
      const f = 820 + Math.random() * 520;
      this.tone(o, { t, dur: 1.6, freq: f, freqEnd: f * 0.7, gain: 0.07, attack: 0.5 });
      this.tone(o, { t: t + 0.05, dur: 1.4, freq: f * 1.5, freqEnd: f * 1.08, gain: 0.035, attack: 0.6 });
      this.noise(o, { t, dur: 1.2, type: 'bandpass', freq: 3200, q: 4, gain: 0.05, attack: 0.4 });
    },
  },
  rise: {
    dur: 1.9,
    takes: 2,
    gain: 0.9,
    verb: 0.7,
    ref: 4,
    body(o, t) {
      this.noise(o, { t, dur: 1.6, type: 'bandpass', freq: 250, freqEnd: 2600, q: 1.2, gain: 0.5, attack: 0.5 });
      this.tone(o, { t, dur: 1.8, freq: 520, freqEnd: 1400, gain: 0.12, attack: 0.6 });
      this.tone(o, { t: t + 0.1, dur: 1.6, freq: 780, freqEnd: 2100, gain: 0.06, attack: 0.6 });
      this.noise(o, { t, dur: 0.9, freq: 400, freqEnd: 120, gain: 0.5, brown: true });
    },
  },
  flare: {
    dur: 0.9,
    takes: 2,
    gain: 0.8,
    verb: 0.4,
    body(o, t) {
      this.tone(o, { t, dur: 0.8, freq: 1100, freqEnd: 2600, gain: 0.12, attack: 0.3 });
      this.tone(o, { t, dur: 0.8, type: 'triangle', freq: 1650, freqEnd: 3700, gain: 0.05, attack: 0.3 });
      this.noise(o, { t, dur: 0.8, type: 'highpass', freq: 3000, gain: 0.08, attack: 0.5 });
    },
  },
  zap: {
    dur: 0.45,
    takes: 2,
    gain: 0.8,
    verb: 0.3,
    body(o, t) {
      this.noise(o, { t, dur: 0.35, type: 'highpass', freq: 2200, gain: 0.5 });
      this.tone(o, { t, dur: 0.4, type: 'square', freq: 1800, freqEnd: 300, gain: 0.08 });
    },
  },
  possess: {
    dur: 1.5,
    takes: 2,
    gain: 0.9,
    verb: 0.5,
    body(o, t) {
      this.noise(o, { t, dur: 0.9, type: 'bandpass', freq: 3000, freqEnd: 200, q: 1.5, gain: 0.4, attack: 0.5 });
      this.tone(o, { t: t + 0.5, dur: 0.9, type: 'sawtooth', freq: 95, freqEnd: 60, gain: 0.12 });
    },
  },
  blink: {
    dur: 0.25,
    takes: 3,
    gain: 0.7,
    verb: 0.3,
    body(o, t) {
      this.noise(o, { t, dur: 0.2, type: 'bandpass', freq: 2600, freqEnd: 600, q: 2, gain: 0.4 });
      this.tone(o, { t, dur: 0.14, freq: 1200, freqEnd: 2600, gain: 0.08 });
    },
  },
  // la campana rota y el vidrio
  die: {
    dur: 1.7,
    takes: 2,
    gain: 1,
    verb: 0.8,
    ref: 4,
    body(o, t) {
      this.noise(o, { t, dur: 0.5, type: 'highpass', freq: 2500, gain: 0.5 });
      [96, 91, 87, 84].forEach((n, k) => this.tone(o, { t: t + k * 0.07, dur: 1.4, type: 'triangle', freq: midi(n), freqEnd: midi(n) * 0.97, gain: 0.12 }));
      this.tone(o, { t, dur: 0.5, freq: 110, freqEnd: 40, gain: 0.5 });
    },
  },
  scrape: {
    dur: 0.22,
    takes: 4,
    gain: 0.6,
    verb: 0.1,
    body(o, t) {
      this.noise(o, { t, dur: 0.18, type: 'bandpass', freq: 500 + Math.random() * 300, q: 2, gain: 0.6 });
      this.noise(o, { t, dur: 0.12, freq: 300, gain: 0.4, brown: true });
    },
  },
  dig: {
    dur: 0.85,
    takes: 1,
    gain: 0.8,
    verb: 0.3,
    body(o, t) {
      this.noise(o, { t, dur: 0.5, freq: 700, freqEnd: 150, gain: 0.7, brown: true });
      this.tone(o, { t: t + 0.2, dur: 0.6, type: 'sawtooth', freq: 180, freqEnd: 120, gain: 0.05 });
    },
  },
  chest: {
    dur: 1.3,
    takes: 1,
    gain: 0.8,
    verb: 0.5,
    body(o, t) {
      [84, 88, 91, 96, 100].forEach((n, k) => this.tone(o, { t: t + k * 0.06, dur: 0.8, type: 'triangle', freq: midi(n), gain: 0.14 }));
      for (let k = 0; k < 8; k++) this.tone(o, { t: t + 0.25 + Math.random() * 0.6, dur: 0.15, freq: 2600 + Math.random() * 2400, gain: 0.05 });
    },
  },
};

// La columna de luz: el brillo según cuánto mira la cara a la cámara (de canto,
// nada: borde suave) y cada vez menos hacia arriba.
const PILLAR_VS = `
varying float vY; varying vec3 vN; varying vec3 vV;
void main(){
  vY = position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PILLAR_FS = `
uniform vec3 uColor; uniform float uOp;
varying float vY; varying vec3 vN; varying vec3 vV;
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float y = clamp(vY, 0.0, 1.0);
  float a = uOp * pow(f, 2.4) * pow(1.0 - y, 1.3) * smoothstep(0.0, 0.03, y);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

// la cruz del panteón del Capataz (adonde cae el rayo del principio)
const EE_TUMBA = { x: 68.6, z: 27.5 };
