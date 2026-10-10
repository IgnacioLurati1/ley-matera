import * as THREE from 'three';
import { EE, DOORS, PERK_SPOTS } from '../../config/map';
import { zombieHealth } from '../../config/rules';
import { WEAPONS, BOX_POOL, boxWeight } from '../../config/weapons';
import { PERKS } from '../../config/perks';
import Navigation from '../../world/Navigation';
import { macroY } from '../../world/Mountain';
import { chiquiGiggle } from '../../world/Chiqui';
import { isHost, myId, announce, players } from './common';
import { ARM_COCK, ARM_FIRE, bannerTex, lavaTex, streamTex, buildCatapult, buildLadder, buildRam, buildCauldron, buildChest, boulderGeo, buildGateIce, buildStandards } from './asedioModels';
import { sleepHidden } from '../../world/castleLean';
import { SpriteBatch, spriteBatchOn } from '../../fx/spriteBatch';

// El asedio del castillo (cada 10 rondas, y una vez durante el easter egg):
// el Chiquitijuein sitia el castillo del Mateendrache.
//  · Tres campanadas (grabadas) y, con la tercera, los cuernos de guerra
//    desde el valle; el cielo se llena de humo y en las crestas aparecen sus
//    estandartes con antorchas. Sin música. Al terminar, la última campanada.
//  · Tres catapultas del otro lado de las termas tiran piedras en llamas; en
//    el piso se ve dónde van a caer. Revientan, tiran cascotes y dejan fuego.
//  · Escaleras de asalto contra el adarve: los muertos suben por ahí. Se tiran
//    abajo manteniendo F arriba; el fuego las quema y el viento las vuela
//    (los mates de la luz: cargados al toque, sin cargar con varios tiros).
//  · El rastrillo del patio tiene vida: la horda lo golpea desde la
//    barbacana. Si cae, entran por el frente. El hielo lo arregla.
//  · Los matacanes: dos calderos de mate hirviendo arriba de la barbacana
//    (mantener F: se vuelca; después se ceba y hay que esperar que hierva).
//  · Los cañones del adarve le tiran a las catapultas; el rayo de Illapa
//    también (cargado, el cielo la parte en dos).
//  · Al final llega el Caballero Negro con un ariete cargado por muertos.
//    Cuando cae, se levanta el asedio.
//  · Con el dragón suelto (paso 6 del easter egg en adelante) el Mateendrache
//    pasa quemando catapultas y hordas. Sin él, el asedio es más duro.
//  · Premio: puntos y power-ups según cómo quedó el rastrillo; con el
//    rastrillo entero, el Cofre del botín (cada uno: un perk que le falte o
//    un mate de la caja).
// En línea lo maneja el anfitrión (muertos, golpes, premios); los invitados
// ven el estado ('ee' {as}) y los golpes de efecto ('ee' {ase}) y mandan lo
// suyo con 'pee' {a:'as'} (los tiros de los mates) o con requestUse (F).

const EVERY = 10;
const GATE_HITS = 420; // manotazos que aguanta el rastrillo (un jugador)
const RAM_HIT = 0.07;
const KNIGHT_HIT = 0.05;
const ICE_CHARGED = 0.35;
const ICE_BASE = 0.025;
const CLIMB = 1.9; // m/s por la escalera
const RISE_T = 1.15;
const LADDER_CD = [6, 11];
const WIND_T = 2.6;
const LOAD_T = 0.9;
const FIRE_T = 0.7;
const RELEASE = 0.17;
const SWING = 0.22;
const GRAV = 18;
const BOULDER_R = 3.4;
const PATCH_T = 5;
const POUR_T = 1.8;
const HEAT_T = 6;
const CANNON_CD = 18;
const CANNON_FLY = 1.7;
const ZAP = 0.12;
const CANNON_DMG = 0.5;
const CMD_AT = 0.65;
const CMD_MIN = 55;
const CMD_TIME = 150;
const RAM_SPEED = 0.9;
const STRAFE_SPEED = 24;
// el tope de la escalera sobre el adarve (asoma arriba del parapeto)
const TOP_UP = 1.9;
const CAT_SCALE = 1.35;
// el cielo del asedio: humo pardo, rojizo, con poca nieve (CastleWeather)
const SKY = { rain: 0, snow: 0.35, storm: 0, fog: 0.017, fogColor: 0x2a1a14, wind: 0.55, cloud: 1, mist: 0.45, blood: 0.55 };
const LADDER_ST = ['off', 'rise', 'up', 'fall', 'burn', 'drop'];
const CAT_ST = ['idle', 'wind', 'load', 'fire', 'dead'];
const POT_ST = ['ready', 'pour', 'empty', 'heat'];
const GATE_MODE = ['up', 'down', 'broken'];
// las campanas grabadas (core/audio.js eventSfx): las tres del principio en un
// solo grabado (a los 0, 1,6 y 3,2 s); con la tercera arranca el asedio (las
// catapultas y las escaleras) y la última suena al terminar
const BELLS_START = 'evento-campanas-asedio';
const BELL_END = 'evento-campana-fin-asedio';
const BELL3 = 3.2;
const START_T = 3.6;
// la música: entra con el asedio, sobre el eco del tercer campanazo
const MUSIC = 'asedio-castillo';
const MUSIC_AT = 3.9;
// el ariete: de dónde sale el centro del tronco y dónde para (la cabeza contra la reja)
const RAM_FROM = 68.6;
const RAM_LEN = 5;

const LINES = {
  forced: '¡Cuernos en el valle! El Chiquitijuein sintió despertar los mates... ¡Viene a sitiar el castillo!',
  again: '¡Otra vez el asedio! A la muralla, paisanos.',
  hint: 'Las escaleras, a empujones desde el adarve. Y el mate hirviendo, por los matacanes.',
  cannons: 'Los cañones del adarve llegan a las catapultas. Úsenlos.',
  cmd: '¡El ariete! Y detrás, el Caballero Negro. Ese es el que manda.',
  won: 'Se levanta el asedio. El castillo sigue en pie.',
  broke: '¡Rompieron el rastrillo! ¡Al patio!',
};

// los sonidos horneados: volumen, eco y a qué distancia se oyen con toda su fuerza
const SFX = { whistle: [0.5, 0.3, 10], ratchet: [0.8, 0.4, 14], release: [1.2, 0.5, 18], thud: [1.1, 0.5, 14], ignite: [0.7, 0.3, 12], slam: [1, 0.4, 6], creak: [0.8, 0.4, 6], gust: [0.8, 0.4, 8], crash: [1, 0.6, 10], crackle: [0.6, 0.2, 6], clang: [0.55, 0.4, 5], ram: [1.5, 0.7, 14], break: [1.6, 0.7, 16], gateSlam: [1.3, 0.6, 12], pour: [0.5, 0.1, 4], scald: [1, 0.5, 10], fuse: [0.6, 0.2, 5] };

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpCol = new THREE.Color();
const hitTmp = {};
const near = [];
const R2 = () => Math.random() * 2 - 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (k) => k * k * (3 - 2 * k);

export default class Asedio {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.D = EE.asedio || {
      escaleras: [[44, 66.05, 68.6, 64.4], [47.2, 66.05, 68.6, 64.4], [56.6, 66.05, 68.6, 64.4], [59.8, 66.05, 68.6, 64.4]],
      calderos: [[48.35, 63, 1], [55.65, 63, -1]],
      catapultas: [[34, 103], [52, 106], [70, 103]],
      canones: [[36.6, 68.2], [66.5, 68.2]],
      puerta: 14,
      barbacana: [51.5, 70.2],
      frente: [51.5, 63.4],
      cofre: [52, 58.4],
    };
    this.active = false;
    // (Zombies.pickSpawner: el asedio elige él de dónde salen, con spawnAt)
    this.zones = null;
    this.phase = 'off';
    this.t = 0;
    this.round = 0;
    this.done = 0;
    this.forced = false;
    this.early = false;
    this.pending = false;
    this.skipRound = 0;
    this.lockRemote = false;
    this.dragonOn = false;
    this.goalObj = { x: 0, z: 0, d: 0, nav: null, gate: true };
    this.forceSpawn = null;
    this.spIdx = 0;
    this.spLadder = { kind: 'custom', place: (z) => this.placeClimber(z, this.ladders[this.spIdx]) };
    this.spGate = { kind: 'custom', place: (z) => this.placeGate(z) };
    this.syncT = 0;
    this.dirty = false;
    this.hudT = 0;
    this.stats = { ladders: 0, cats: 0 };
    this.root = new THREE.Group();
    this.root.visible = false;
    g.scene.add(this.root);
    // (escondido hasta el primer asedio: no se recorre)
    sleepHidden(this.root);
    this.disposables = [];
    this.makeMats();
    this.buildGate();
    this.buildLadders();
    this.buildCats();
    this.buildCauldrons();
    this.buildCannons();
    this.buildRam();
    this.buildChest();
    this.buildSky();
    this.buildPools();
    this.register();
    this.buildHud();
    this.bakeSfx();
  }

  // ---------------- materiales ----------------
  makeMats() {
    const T = this.g.textures;
    const keep = (m) => {
      this.disposables.push(m);
      return m;
    };
    this.tex = { banner: bannerTex(), lava: lavaTex(), stream: streamTex() };
    for (const t of Object.values(this.tex)) this.disposables.push(t);
    this.tex.stream.wrapS = this.tex.stream.wrapT = THREE.RepeatWrapping;
    const add = (color, opacity = 1, fog = true) => keep(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, fog }));
    this.mat = {
      banner: keep(new THREE.MeshStandardMaterial({ map: this.tex.banner, side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.4 })),
      glow: keep(new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false })),
      eye: keep(new THREE.MeshBasicMaterial({ color: 0xff3018, toneMapped: false })),
      liquid: keep(new THREE.MeshStandardMaterial({ color: 0x6a7a22, emissive: 0x5a7a10, emissiveIntensity: 1.1, roughness: 0.2 })),
      gold: keep(new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.3, emissive: 0x3a2808 })),
      seal: keep(new THREE.MeshStandardMaterial({ color: 0x8a1008, emissive: 0x5a0804, roughness: 0.5 })),
      boulder: keep(new THREE.MeshStandardMaterial({ color: 0x2e241e, roughness: 0.95, emissive: 0xff5a14, emissiveIntensity: 1.6, emissiveMap: this.tex.lava })),
      rock: keep(new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 1 })),
      burnt: keep(new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1, emissive: 0x401000, emissiveIntensity: 0.6 })),
      ice: keep(new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, emissive: 0x2a7ab8, emissiveIntensity: 0.7, depthWrite: false })),
      ball: keep(new THREE.MeshStandardMaterial({ color: 0x22201e, metalness: 0.7, roughness: 0.5 })),
      // la cabeza del ariete, al rojo vivo
      ramHot: keep(new THREE.MeshStandardMaterial({ color: 0x3a2620, metalness: 0.6, roughness: 0.45, emissive: 0xff4a12, emissiveIntensity: 1.5, emissiveMap: this.tex.lava })),
      stream: keep(new THREE.MeshBasicMaterial({ map: this.tex.stream, color: 0xd8f08a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
      flood: keep(new THREE.MeshBasicMaterial({ color: 0x6a7a26, transparent: true, opacity: 0, depthWrite: false })),
      ring: keep(new THREE.MeshBasicMaterial({ color: 0xff3a0a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })),
      fill: keep(new THREE.MeshBasicMaterial({ color: 0xff2a08, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })),
      shadow: keep(new THREE.MeshBasicMaterial({ map: T.dot, color: 0x000000, transparent: true, opacity: 0, depthWrite: false })),
      smoke: keep(new THREE.SpriteMaterial({ map: T.dot, color: 0x1c1612, transparent: true, depthWrite: false, opacity: 0.5 })),
      fireS: add(0xff8a30, 0.9),
      flame: add(0xffa040, 0.95, false),
      camp: add(0xff6a20, 0.8, false),
      hot: add(0xffd070, 0.9),
      goldS: add(0xffd36a, 0.7),
      iceS: add(0x9adcff, 0.7),
    };
  }

  // ---------------- el rastrillo ----------------
  buildGate() {
    const g = this.g;
    const it = g.interact.list.find((x) => x.kind === 'door' && x.door?.def.id === this.D.puerta);
    const door = it?.door || null;
    const piece = door?.pieces.find((p) => p.lift != null) || null;
    const [fx, fz] = this.D.frente;
    const G = (this.gate = {
      door,
      idx: door ? door.index : -1,
      grate: piece?.obj || null,
      lift: piece?.lift ?? 3.9,
      hp: 1,
      mode: door?.open ? 'up' : 'down',
      brokeOnce: false,
      wasOpen: false,
      lock0: false,
      frost: 0,
      iceT: 0,
      hitT: 0,
      y: door?.open ? piece?.lift ?? 0 : 0,
      vy: 0,
      rx: 0,
      front: new THREE.Vector3(fx, g.world.floorAt(fx, fz), fz),
      nav: new Navigation(g.world),
    });
    // el hielo que lo tapa (el Penitente)
    G.ice = buildGateIce(this.mat.ice);
    G.ice.visible = false;
    if (door) {
      // (del lado del patio: los barrotes quedan adentro del hielo)
      G.ice.position.copy(door.group.position).setZ(door.group.position.z - 0.12);
      G.ice.rotation.y = door.group.rotation.y;
    }
    this.root.add(G.ice);
  }

  // Cerrado o no, para todos: las cajas de la puerta, el campo de flujo y si
  // los tiros pasan entre los barrotes (en el asedio sí).
  gateSolid(on, shoot) {
    const G = this.gate;
    const w = this.g.world;
    if (G.idx < 0) return;
    w.doorOpen[G.idx] = on ? 0 : 1;
    for (const b of DOORS[G.idx].boxes || []) {
      b.active = on;
      b.shoot = shoot;
    }
    w.computeNavBlock();
  }

  // up: levantado (abierto), down: bajado (cerrado), broken: arrancado.
  setGateMode(mode) {
    const G = this.gate;
    if (G.mode === mode) return;
    const was = G.mode;
    G.mode = mode;
    G.vy = 0;
    this.gateSolid(mode === 'down', !this.active);
    if (mode === 'down' && was === 'up') G.slam = true;
    // (el hielo o el arreglo del final: vuelve a su lugar y cae)
    if (mode === 'down' && was === 'broken' && G.grate) {
      G.grate.rotation.x = 0;
      G.grate.position.y = G.lift * 0.6;
      G.slam = true;
    }
  }

  // ---------------- las escaleras ----------------
  buildLadders() {
    const g = this.g;
    this.ladders = this.D.escaleras.map(([x, faceZ, footZ, landZ], i) => {
      const fy = g.world.floorAt(x, footZ);
      const ly = g.world.floorAt(x, landZ, 40);
      const foot = new THREE.Vector3(x, fy, footZ);
      const top = new THREE.Vector3(x, ly + TOP_UP, faceZ);
      const len = Math.hypot(top.y - foot.y, top.z - foot.z);
      // (el ángulo desde el sur: más de 90 grados, apoyada contra el muro)
      const phi0 = Math.atan2(top.y - foot.y, faceZ - footZ);
      const group = buildLadder(g.world.M, len + 0.6);
      group.visible = false;
      this.root.add(group);
      sleepHidden(group);
      const L = { i, x, foot, top, land: new THREE.Vector3(x, ly, landZ), len, phi0, phi: 0.1, group, st: 'off', t: 0, cd: 0, lastSpawn: -9, fire: 0, wind: 0, by: null, roll: 0, slide: 0, sink: 0, mats: [] };
      group.traverse((o) => {
        if (o.isMesh) L.mats.push([o, o.material]);
      });
      this.posLadder(L);
      return L;
    });
  }

  // El punto a u metros del pie, corrido `off` hacia afuera del muro (donde va
  // el que sube). out: hacia dónde cae (sur, +z).
  ladderPoint(L, u, off, out) {
    const c = Math.cos(L.phi);
    const s = Math.sin(L.phi);
    // a lo largo: (0, sen, cos); la normal de afuera: (0, -cos, sen)
    out.set(L.x, L.foot.y + s * u - c * off, L.foot.z + c * u + s * off);
    out.z += L.slide;
    out.y -= L.sink;
    return out;
  }

  posLadder(L) {
    const gr = L.group;
    const c = Math.cos(L.phi);
    const s = Math.sin(L.phi);
    // base: x a lo largo del muro, y a lo largo de la escalera, z = x × y
    tmpA.set(1, 0, 0);
    tmpB.set(0, s, c);
    tmpC.set(0, -c, s);
    tmpM.makeBasis(tmpA, tmpB, tmpC);
    gr.quaternion.setFromRotationMatrix(tmpM);
    if (L.roll) gr.quaternion.premultiply(tmpQ.setFromAxisAngle(tmpB, L.roll));
    gr.position.set(L.x, L.foot.y - L.sink, L.foot.z + L.slide);
  }

  // ---------------- las catapultas ----------------
  buildCats() {
    const g = this.g;
    const M = g.world.M;
    const [cx, cz] = this.D.frente;
    this.cats = this.D.catapultas.map(([x, z], i) => {
      const m = buildCatapult(M, this.mat.banner, this.mat.glow);
      const y = this.groundY(x, z) - 0.1;
      const yaw = Math.atan2(cx - x, cz - z);
      m.root.position.set(x, y, z);
      m.root.rotation.y = yaw;
      m.root.scale.setScalar(CAT_SCALE);
      m.root.visible = false;
      this.root.add(m.root);
      // la piedra en la cuchara
      const rock = new THREE.Mesh(this.boulderGeo || (this.boulderGeo = boulderGeo()), this.mat.boulder);
      rock.scale.setScalar(0.85);
      rock.visible = false;
      m.slot.add(rock);
      // el resplandor del brasero y el de la piedra encendida
      const bglow = new THREE.Sprite(this.mat.camp);
      bglow.scale.setScalar(3.2);
      bglow.position.set(1.95, 1.6, -2.6);
      m.body.add(bglow);
      const rglow = new THREE.Sprite(this.mat.fireS);
      rglow.scale.setScalar(2.4);
      rglow.visible = false;
      m.slot.add(rglow);
      // dos antorchas en los parantes (que se vean de lejos, de noche)
      const torches = [-1, 1].map((sx) => {
        const f = new THREE.Sprite(this.mat.flame);
        f.scale.setScalar(1.3);
        f.position.set(sx * 1.2, 4.1, 2.2);
        m.body.add(f);
        return f;
      });
      const mats = [];
      m.body.traverse((o) => {
        if (o.isMesh && o.material !== this.mat.glow && o.material !== this.mat.banner && o.material !== this.mat.boulder) mats.push([o, o.material]);
      });
      return { i, x, y, z, yaw, m, rock, bglow, rglow, torches, mats, hp: 1, st: 'idle', t: 0, reload: 0, theta: ARM_FIRE, roll: 0, jolt: 0, burnT: 0, hitT: 0, center: new THREE.Vector3(x, y + 2.6 * CAT_SCALE, z), fire: null };
    });
  }

  // El piso de afuera: el de la grilla adentro del mapa; más allá, la montaña.
  groundY(x, z) {
    const w = this.g.world;
    return w.inside(Math.floor(x), Math.floor(z)) ? w.floorAt(x, z) : macroY(x, z);
  }

  // ---------------- los calderos ----------------
  buildCauldrons() {
    const g = this.g;
    const M = g.world.M;
    this.pots = this.D.calderos.map(([x, z, dir], i) => {
      const y = g.world.floorAt(x, z, 40);
      const spill = this.mat.stream.clone();
      this.disposables.push(spill);
      const m = buildCauldron(M, this.mat.liquid, this.mat.glow, dir, spill);
      m.root.position.set(x, y, z);
      m.root.visible = false;
      this.root.add(m.root);
      sleepHidden(m.root);
      // la cascada adentro de la barbacana (del muro de ese lado) y el vapor
      const sx = dir > 0 ? 50.15 : 53.85;
      const top = 29.7;
      const fy = g.world.floorAt(sx + dir * 0.6, 63.6);
      const h = top - fy;
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, h, 1, 6), this.mat.stream.clone());
      this.disposables.push(fall.material, fall.geometry);
      fall.position.set(sx + dir * 0.45, fy + h / 2, 63.5);
      fall.rotation.y = Math.PI / 2;
      fall.visible = false;
      fall.renderOrder = 4;
      this.root.add(fall);
      return { i, x, y, z, dir, m, fall, sx, fy, water: 1, heat: 1, st: 'ready', t: 0, tilt: 0, by: null, tick: 0 };
    });
    // la ola de mate hirviendo por el piso de la barbacana
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 4.6).rotateX(-Math.PI / 2), this.mat.flood);
    fl.position.set(51.5, g.world.floorAt(51.5, 65) + 0.06, 65.1);
    fl.rotation.x = -0.27;
    fl.visible = false;
    fl.renderOrder = 3;
    this.root.add(fl);
    this.flood = { mesh: fl, k: 0 };
    this.disposables.push(fl.geometry);
  }

  // ---------------- los cañones del adarve ----------------
  buildCannons() {
    const g = this.g;
    this.cannons = this.D.canones.map(([x, z], j) => {
      const y = g.world.floorAt(x, z, 40);
      // (el cañón mira al sur por la tronera: la boca, 1,34 m adelante)
      const muzzle = new THREE.Vector3(x, y + 1.06, z + 1.34);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.mat.ball);
      this.disposables.push(ball.geometry);
      ball.visible = false;
      this.root.add(ball);
      return { j, x, y, z, muzzle, ball, cd: 0, fuse: -1, fly: -1, target: -1, from: new THREE.Vector3(), v0: new THREE.Vector3(), to: new THREE.Vector3() };
    });
  }

  // ---------------- el ariete ----------------
  buildRam() {
    const g = this.g;
    const grp = buildRam(g.world.M, this.mat.eye, this.mat.ramHot, this.mat.fireS);
    grp.visible = false;
    sleepHidden(grp);
    // la cabeza hacia el rastrillo (al norte)
    grp.rotation.order = 'YXZ';
    this.root.add(grp);
    this.ram = { group: grp, on: false, st: 'off', cz: RAM_FROM, swing: 0, t: 0, y: 0, drop: 0, hits: 0 };
  }

  // ---------------- el cofre del botín ----------------
  buildChest() {
    const g = this.g;
    const [x, z] = this.D.cofre;
    const m = buildChest(g.world.M, this.mat.gold, this.mat.seal);
    const y = g.world.floorAt(x, z);
    m.root.position.set(x, y, z);
    // mirando al rastrillo (al sur)
    m.root.rotation.y = Math.PI;
    m.root.visible = false;
    this.root.add(m.root);
    sleepHidden(m.root);
    const glow = new THREE.Sprite(this.mat.goldS);
    glow.scale.setScalar(2.4);
    glow.position.set(x, y + 0.9, z);
    glow.visible = false;
    this.root.add(glow);
    this.chest = { m, glow, on: false, opened: new Set(), mine: false, round: 0, open: 0, at: new THREE.Vector3(x, y, z) };
  }

  // ---------------- el cielo y las crestas ----------------
  buildSky() {
    const g = this.g;
    // los estandartes con antorcha en un arco al sur, en las lomas
    const spots = [[8, 104], [18, 112], [30, 118], [44, 122], [60, 123], [74, 119], [88, 112], [98, 104], [106, 94], [0, 94], [24, 106], [80, 106], [38, 109], [66, 109], [-6, 84], [112, 84]];
    const n = spots.length;
    const S = buildStandards(g.world.M, this.mat.banner, this.mat.flame, n);
    this.root.add(S.root);
    this.std = S;
    this.stdList = spots.map(([x, z], i) => ({ x, z, y: this.groundY(x, z) - 0.2, yaw: Math.atan2(52 - x, 60 - z) + Math.PI / 2, k: 0, delay: 0.4 + i * 0.32, ph: Math.random() * 10 }));
    // las fogatas del campamento y las columnas de humo (en cada catapulta y en las dos fogatas)
    this.camps = [[22, 112], [84, 110]].map(([x, z]) => {
      const y = this.groundY(x, z);
      const s = new THREE.Sprite(this.mat.camp);
      s.position.set(x, y + 1.2, z);
      s.scale.setScalar(0.01);
      this.root.add(s);
      return { x, y, z, s };
    });
    const cols = [...this.cats.map((c) => [c.x - Math.sin(c.yaw) * 3, c.y + 1, c.z - Math.cos(c.yaw) * 3]), ...this.camps.map((c) => [c.x, c.y + 1, c.z])];
    this.smoke = [];
    for (const [x, y, z] of cols) {
      for (let k = 0; k < 7; k++) {
        const s = new THREE.Sprite(this.mat.smoke.clone());
        this.disposables.push(s.material);
        s.visible = false;
        this.root.add(s);
        this.smoke.push({ s, x, y, z, t: (k / 7) * 9, life: 9 });
      }
    }
    // (las 16 llamas y los 35 humos en un dibujo cada uno: fx/spriteBatch.js)
    if (spriteBatchOn()) {
      this.batches = [new SpriteBatch(S.flames), new SpriteBatch(this.smoke.map((p) => p.s), { sort: true })];
    }
    this.skyK = 0;
  }

  // ---------------- piedras, avisos, fuegos y cascotes ----------------
  buildPools() {
    const g = this.g;
    this.boulders = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.boulderGeo, this.mat.boulder);
      mesh.visible = false;
      const glow = new THREE.Sprite(this.mat.fireS);
      glow.scale.setScalar(3);
      glow.visible = false;
      this.root.add(mesh, glow);
      this.boulders.push({ on: false, mesh, glow, from: new THREE.Vector3(), v0: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), prev: new THREE.Vector3(), t: 0, T: 1, whistle: false, spin: new THREE.Vector3() });
    }
    const ringGeo = new THREE.RingGeometry(BOULDER_R - 0.38, BOULDER_R, 48).rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.disposables.push(ringGeo, fillGeo, shadowGeo);
    this.warns = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(ringGeo, this.mat.ring.clone());
      const fill = new THREE.Mesh(fillGeo, this.mat.fill.clone());
      const shadow = new THREE.Mesh(shadowGeo, this.mat.shadow.clone());
      this.disposables.push(ring.material, fill.material, shadow.material);
      for (const m of [ring, fill, shadow]) {
        m.visible = false;
        m.renderOrder = 3;
        this.root.add(m);
      }
      this.warns.push({ on: false, ring, fill, shadow, pos: new THREE.Vector3(), t: 0, T: 1 });
    }
    // el estallido de cada piedra: un fogonazo y la onda que corre por el piso
    const waveGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.disposables.push(waveGeo);
    this.blasts = [];
    for (let i = 0; i < 4; i++) {
      const flash = new THREE.Sprite(this.mat.hot.clone());
      const wave = new THREE.Mesh(waveGeo, this.mat.ring.clone());
      this.disposables.push(flash.material, wave.material);
      flash.visible = wave.visible = false;
      wave.renderOrder = 3;
      this.root.add(flash, wave);
      this.blasts.push({ on: false, flash, wave, t: 0, pos: new THREE.Vector3() });
    }
    this.blastNext = 0;
    this.patches = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(this.mat.fireS);
      s.visible = false;
      this.root.add(s);
      this.patches.push({ on: false, s, pos: new THREE.Vector3(), t: 0, tick: 0 });
    }
    // cascotes de piedra (instanciados)
    const n = 64;
    const dg = new THREE.DodecahedronGeometry(1, 0);
    this.disposables.push(dg);
    this.debris = new THREE.InstancedMesh(dg, this.mat.rock, n);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.debris.castShadow = false;
    this.root.add(this.debris);
    this.chunks = [];
    tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.debris.setMatrixAt(i, tmpM);
      this.chunks.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.1, t: 0, floor: 0 });
    }
    this.chunkNext = 0;
  }

  // ---------------- las F ----------------
  register() {
    const g = this.g;
    for (const L of this.ladders) {
      g.interact.add({
        kind: 'ee',
        holdTime: 0.6,
        pos: new THREE.Vector3(L.x, L.land.y + 1.1, L.land.z + 0.2),
        radius: 2.2,
        wide: true,
        prompt: () => (this.active && (L.st === 'up' || L.st === 'burn') ? { text: 'derribar la escalera', noCost: true, hold: true } : null),
        cost: () => 0,
        use: () => this.pushLadder(L.i, g.net?.useFrom ?? myId(g), 'push'),
      });
    }
    for (const K of this.pots) {
      g.interact.add({
        kind: 'ee',
        holdTime: 0.55,
        pos: new THREE.Vector3(K.x, K.y + 1.1, K.z),
        radius: 1.9,
        wide: true,
        prompt: () => {
          if (!this.active) return null;
          if (K.st === 'ready') return { text: 'volcar el mate hirviendo', noCost: true, hold: true };
          if (K.st === 'empty') return { text: `cebar el caldero (${Math.round(K.water * 100)}%)`, noCost: true, hold: true };
          if (K.st === 'heat') return { text: 'Hirviendo...', noCost: true, info: true };
          return null;
        },
        cost: () => 0,
        use: () => this.useCauldron(K.i, g.net?.useFrom ?? myId(g)),
      });
    }
    for (const N of this.cannons) {
      // (en la culata, del lado del adarve: ahí se para el que lo dispara)
      g.interact.add({
        kind: 'ee',
        holdTime: 0.8,
        pos: new THREE.Vector3(N.x, N.y + 1.05, N.z - 0.8),
        radius: 2.2,
        wide: true,
        prompt: () => {
          if (!this.active || !this.cats.some((C) => C.st !== 'dead')) return null;
          if (N.cd > 0 || N.fuse >= 0) return { text: 'Cargando el cañón', noCost: true, info: true };
          return { text: 'disparar el cañón', noCost: true, hold: true };
        },
        cost: () => 0,
        use: () => this.fireCannon(N.j),
      });
    }
    const C = this.chest;
    g.interact.add({
      kind: 'ee',
      holdTime: 0.9,
      pos: C.at.clone().setY(C.at.y + 1),
      radius: 2.2,
      wide: true,
      prompt: () => {
        if (!C.on) return null;
        if (C.mine) return { text: 'Ya abriste el cofre', noCost: true, info: true };
        return { text: 'abrir el Cofre del botín', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => this.openChest(g.net?.useFrom ?? myId(g)),
    });
  }

  // ---------------- el easter egg ----------------
  // El temple espera: mientras el asedio está por venir o en marcha.
  templeLock() {
    if (this.g.net?.guest) return !!this.lockRemote;
    return this.active || this.early || this.pending;
  }

  // (anfitrión) La escena del origen arrancó: si todavía no hubo asedio, va a venir.
  expectEarly() {
    const R = this.g.rounds;
    if (this.forced || this.active || this.done || !isHost(this.g) || !R || R.round >= EVERY) return false;
    this.pending = true;
    this.sync(true);
    return true;
  }

  // (anfitrión) Terminó la escena: el Chiquitijuein sintió despertar los mates.
  // true si el asedio viene (ya, o con la ronda que sigue).
  forceEarly() {
    const g = this.g;
    const R = g.rounds;
    const was = this.pending;
    this.pending = false;
    if (this.forced || this.active || this.done || !isHost(g) || !R || R.round >= EVERY) {
      if (was) this.sync(true);
      return false;
    }
    this.forced = true;
    this.skipRound = EVERY;
    if (R.state === 'active' && !R.dogs && g.state === 'playing' && !this.blocked()) this.start(R);
    else {
      this.early = true;
      this.horns(0, 0.6);
    }
    this.sync(true);
    return true;
  }

  blocked() {
    const E = this.egg;
    return E.step === 7 || E.step >= 9 || !!E.scene || !!this.g.arena?.active || this.active;
  }

  dragonFree() {
    const E = this.egg;
    return E.step >= 6 && E.step <= 8;
  }

  // ---------------- rondas ----------------
  onRound(R) {
    const g = this.g;
    // el cofre dura hasta que termina la ronda siguiente
    if (this.egg.step >= 9) {
      this.early = false;
      return;
    }
    const due = R.round >= EVERY && R.round % EVERY === 0 && R.round !== this.skipRound;
    if (!due && !this.early) return;
    if (R.dogs || this.blocked() || g.state !== 'playing') {
      if (due) this.early = true;
      return;
    }
    this.early = false;
    this.start(R);
  }

  onRoundEnd() {
    if (this.active) this.finish();
    else if (this.chest.on && this.g.rounds.round > this.chest.round) this.chestOff();
  }

  get holding() {
    return this.active && this.phase !== 'won';
  }

  nPlayers() {
    return this.g.net ? this.g.net.net.count || 1 : 1;
  }

  // (anfitrión) Arranca el asedio en la ronda R.
  start(R) {
    const g = this.g;
    if (this.active) return;
    this.active = true;
    this.phase = 'horns';
    this.t = 0;
    this.round = R.round;
    this.dragonOn = this.dragonFree();
    this.stats.ladders = 0;
    this.stats.cats = 0;
    this.cmd = null;
    this.cmdT = 0;
    this.strafeT = 16;
    this.cmdSaid = false;
    const extra = Math.max(0, this.nPlayers() - 1);
    // más muertos (sin el dragón, todavía más) y de a montones
    const k = (this.dragonOn ? 1.15 : 1.3) * (1 + extra * 0.2);
    // (en las rondas bajas, el asedio del easter egg: que dure)
    R.total = R.toSpawn = Math.max(R.toSpawn, Math.round(R.total * k), 30 + extra * 8);
    R.capBonus = (R.capBonus || 0) + 4 + extra * 4;
    R.delay = Math.max(0.3, (R.delay || 1) * 0.6);
    R.spawnT = Math.max(R.spawnT || 0, START_T + 0.3);
    R.bossPending = false;
    this.R = R;
    // el rastrillo baja (y nadie queda afuera, en la barbacana)
    const G = this.gate;
    G.hp = 1;
    G.frost = 0;
    G.brokeOnce = false;
    for (const L of this.ladders) {
      L.st = 'off';
      L.cd = 0.2 + L.i * 2.5;
      L.fire = 0;
      L.wind = 0;
    }
    for (const C of this.cats) {
      C.hp = 1;
      C.st = 'idle';
      C.reload = 0.8 + C.i * 2.6;
      C.burnT = 0;
    }
    for (const K of this.pots) Object.assign(K, { water: 1, heat: 1, st: 'ready', t: 0, tilt: 0 });
    for (const N of this.cannons) Object.assign(N, { cd: 0, fuse: -1, fly: -1 });
    this.ram.on = false;
    this.ram.st = 'off';
    this.startFx();
    g.net?.event('ee', { ase: 'start' });
    this.egg.say('fierro', this.forced && !this.done ? LINES.forced : LINES.again, 1.2);
    g.later(14, () => this.active && this.phase !== 'won' && this.egg.say('fierro', LINES.hint));
    this.dirty = true;
    this.sync(true);
  }

  // Lo que se ve y se oye al empezar (en todas las compus).
  startFx() {
    const g = this.g;
    this.root.visible = true;
    this.active = true;
    if (this.phase === 'off') this.phase = 'horns';
    this.t = 0;
    const G = this.gate;
    G.wasOpen = !!G.door?.open;
    G.mode = G.wasOpen ? 'up' : 'down';
    G.iceT = 0;
    if (G.door) {
      G.lock0 = !!G.door.def.locked;
      G.door.def.locked = true;
    }
    // ¡bajen el rastrillo!
    if (G.mode === 'up') {
      this.setGateMode('down');
    } else this.gateSolid(true, false);
    // el que quedó en la barbacana pasa al patio
    const p = g.player.pos;
    if (g.world.zoneAt(p.x, p.z, p.y) === 'L') {
      p.set(52, g.world.floorAt(52, 60.6), 60.6);
      g.player.vel?.set(0, 0, 0);
    }
    for (const C of this.cats) {
      C.m.root.visible = true;
      C.roll = 0;
      this.catLook(C, false);
    }
    for (const K of this.pots) K.m.root.visible = true;
    // el cielo de humo
    const W = g.weather;
    if (W) {
      W.target = SKY;
      W.name = 'asedio';
      W.timer = 9999;
    }
    for (const S of this.stdList) S.k = 0;
    this.hudOn(true);
    this.card();
    // las tres campanadas (grabadas) y, con la tercera, arranca el asedio:
    // los cuernos del valle, la risa del Chiquitijuein y la música de batalla
    this.bakeSfx();
    this.bell(BELLS_START);
    g.later(MUSIC_AT, () => this.music());
    this.horns(BELL3 + 0.4, 1);
    g.later(BELL3 + 2.5, () => this.active && chiquiGiggle(g.audio, { pos: tmpA.set(52, 30, 120), gain: 1.6, ref: 40, echo: 0.8 }));
    g.fx.addShake(0.25);
  }

  // ---------------- los muertos ----------------
  // (Zombies.pickSpawner, anfitrión) De dónde sale el próximo: una escalera,
  // la barbacana, o null (las ventanas y pozos de siempre).
  spawnAt() {
    if (!this.active || this.phase === 'won' || this.g.net?.guest) return null;
    if (this.forceSpawn) {
      const f = this.forceSpawn;
      this.forceSpawn = null;
      return f;
    }
    const g = this.g;
    let gateN = 0;
    for (const z of g.zombies.pool) if (z.active && !z.dead && z.asId === z.id && z.asRole === 'gate') gateN++;
    const extra = Math.max(0, this.nPlayers() - 1);
    const gateOk = gateN < (this.gate.mode === 'broken' ? 12 : 6 + extra * 2);
    let best = -1;
    let bs = Infinity;
    for (const L of this.ladders) {
      if (L.st !== 'up' || g.time - L.lastSpawn < 1.4) continue;
      const n = this.riders(L);
      if (n >= 3) continue;
      const s = n + Math.random();
      if (s < bs) {
        bs = s;
        best = L.i;
      }
    }
    if (best >= 0 && (!gateOk || Math.random() < 0.55)) {
      this.spIdx = best;
      return this.spLadder;
    }
    if (gateOk) return this.spGate;
    return null;
  }

  riders(L) {
    let n = 0;
    for (const z of this.g.zombies.pool) if (z.active && !z.dead && z.asId === z.id && z.asRole === 'climb' && z.asL === L.i && z.state === 'ladder') n++;
    return n;
  }

  // Sale al pie de la escalera y sube.
  placeClimber(z, L) {
    const g = this.g;
    z.asId = z.id;
    z.asRole = 'climb';
    z.asL = L.i;
    z.asU = 0.15;
    z.asPh = 'climb';
    z.asT = 0;
    z.asVy = 0;
    z.state = 'ladder';
    z.stateT = 0;
    z.level = 0;
    z.yaw = Math.PI;
    this.ladderPoint(L, z.asU, 0.32, z.pos);
    z.baseY = z.pos.y;
    L.lastSpawn = g.time;
    g.fx.dust(tmpA.set(L.x, L.foot.y + 0.1, L.foot.z), UP, [0.45, 0.42, 0.4], 4);
  }

  // Sube por la barbacana: sale del piso (con el puente levantado) o cruza el puente, si está bajo.
  placeGate(z) {
    const g = this.g;
    const [bx, bz] = this.D.barbacana;
    const x = bx + R2() * 1.3;
    z.asId = z.id;
    z.asRole = 'gate';
    z.level = 0;
    z.yaw = Math.PI;
    const bridge = DOORS.findIndex((d) => d.kind === 'puente');
    const open = bridge >= 0 && !!g.world.doorOpen[bridge];
    if (open) {
      const zz = bz + 3.5 + Math.random() * 3;
      z.pos.set(x, 0, zz);
      z.pos.y = z.baseY = g.world.floorAt(x, zz);
      z.state = 'chase';
      z.stateT = 0;
      return;
    }
    // (levantado, el tablero tapa todo el arco: no hay por dónde entrar. Salen
    // de abajo del piso de la barbacana, como los muertos de todo el castillo;
    // antes salían de adentro del puente y parecían atravesarlo volando)
    const zz = bz - 0.6 - Math.random() * 4.2;
    z.pos.set(x, 0, zz);
    z.pos.y = z.baseY = g.world.floorAt(x, zz);
    z.state = 'rise';
    z.stateT = 0;
  }

  // Los estados propios ('ladder': trepando o saltando; 'ram': cargando el
  // ariete). Zombies.think (anfitrión) y Zombies.updateRemote (invitado).
  stateStep(z, dt, t) {
    const g = this.g;
    if (g.net?.guest) {
      if (z.ny != null) {
        z.baseY = z.ny;
        z.pos.y = z.ny;
      }
      const vy = (z.pos.y - (z.asPy ?? z.pos.y)) / Math.max(dt, 1e-3);
      z.asPy = z.pos.y;
      if (z.state === 'ram') this.poseCarry(z, t, Math.hypot(z.pos.x - (z.asPx ?? z.pos.x), z.pos.z - (z.asPz ?? z.pos.z)) / Math.max(dt, 1e-3));
      else this.poseLadder(z, t, vy);
      z.asPx = z.pos.x;
      z.asPz = z.pos.z;
      return;
    }
    if (z.asId !== z.id || !this.active) {
      this.release(z);
      return;
    }
    if (z.state === 'ram') return this.stepCarrier(z, dt, t);
    if (z.asPh === 'hop') return this.stepHop(z, dt, t);
    return this.stepClimber(z, dt, t);
  }

  // Suelto: anda como cualquiera desde donde está.
  release(z) {
    z.P.rootY = 0;
    z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z, z.pos.y + 0.5);
    z.pos.y = z.baseY;
    if (z.asRole === 'ram') z.asRole = 'gate';
    this.g.zombies.setState(z, 'chase');
  }

  stepHop(z, dt, t) {
    z.asT += dt;
    const k = Math.min(1, z.asT / 0.65);
    z.pos.lerpVectors(z.asFrom, z.asTo, k);
    z.pos.y += Math.sin(k * Math.PI) * 0.5;
    z.baseY = z.pos.y;
    z.P.rootY = 0;
    this.g.zombies.poseClimb(z, 0.4 + k * 0.6);
    if (k >= 1) {
      this.g.fx.dust(z.pos, UP, [0.45, 0.4, 0.35], 4);
      this.release(z);
    }
  }

  stepClimber(z, dt, t) {
    const g = this.g;
    const L = this.ladders[z.asL];
    if (!L || L.st === 'off') {
      g.zombies.kill(z, { type: 'nuke' });
      return;
    }
    if (z.asPh === 'climb') {
      if (L.st === 'up' || L.st === 'burn') {
        // (no se le sube encima al de adelante)
        let ahead = Infinity;
        for (const o of g.zombies.pool) {
          if (o === z || !o.active || o.dead || o.asId !== o.id || o.asRole !== 'climb' || o.asL !== z.asL || o.state !== 'ladder') continue;
          const d = o.asU - z.asU;
          if (d > 0 && d < ahead) ahead = d;
        }
        const sp = CLIMB * (z.speedType === 'sprint' ? 1.3 : z.speedType === 'walk' ? 0.75 : 1) * (z.slowT > 0 ? 0.45 : 1);
        if (ahead > 1.7) z.asU = Math.min(L.len, z.asU + sp * dt);
      }
      this.ladderPoint(L, z.asU, 0.32, z.pos);
      z.baseY = z.pos.y;
      this.poseLadder(z, t, L.st === 'up' ? 1 : 0);
      if (L.st === 'up' && z.asU >= L.len - 1.2) {
        z.asPh = 'over';
        z.asT = 0;
        (z.asFrom ||= new THREE.Vector3()).copy(z.pos);
      }
      return;
    }
    // pasa por arriba del parapeto y cae en el adarve
    z.asT += dt;
    const k = Math.min(1, z.asT / 0.75);
    z.pos.lerpVectors(z.asFrom, L.land, k);
    z.pos.y += Math.sin(k * Math.PI) * 0.9 + (1 - k) * 0;
    z.baseY = z.pos.y;
    g.zombies.poseClimb(z, 0.3 + k * 0.7);
    if (k >= 1) {
      z.asRole = 'adarve';
      g.fx.dust(z.pos, UP, [0.8, 0.82, 0.85], 3);
      this.release(z);
    }
  }

  // Trepando: brazos y piernas alternados (cayendo, braceando).
  poseLadder(z, t, vy) {
    const P = z.P;
    P.rootY = 0;
    P.rootPitch = 0;
    P.rootRoll = 0;
    P.hipY = 0.9;
    if (vy < -3) {
      const s = Math.sin(t * 14 + z.slot);
      P.torsoP = -0.3;
      P.headP = 0.4;
      P.shLp = -2.6 + s * 0.5;
      P.shRp = -2.4 - s * 0.5;
      P.shLr = 0.8;
      P.shRr = -0.8;
      P.elL = P.elR = -0.3;
      P.hipLp = -0.6 + s * 0.4;
      P.hipRp = -0.3 - s * 0.4;
      P.knL = P.knR = 0.9;
      return;
    }
    const ph = (z.asCl = (z.asCl || 0) + (vy > 0.05 ? 0.12 : 0.02)) * 1;
    const s = Math.sin(ph * 2.2 + z.slot);
    P.torsoP = 0.32;
    P.torsoR = s * 0.05;
    P.headP = -0.55;
    P.shLp = -2.55 + s * 0.4;
    P.shRp = -2.55 - s * 0.4;
    P.shLr = 0.12;
    P.shRr = -0.12;
    P.elL = -0.5 - Math.max(0, s) * 0.5;
    P.elR = -0.5 - Math.max(0, -s) * 0.5;
    P.hipLp = -0.9 - s * 0.45;
    P.hipRp = -0.9 + s * 0.45;
    P.knL = 1.25 + s * 0.4;
    P.knR = 1.25 - s * 0.4;
  }

  // Cargando el ariete: los brazos al tronco, el paso corto.
  poseCarry(z, t, speed) {
    const P = z.P;
    P.rootY = 0;
    P.hipY = 0.92;
    z.asCl = (z.asCl || 0) + speed * 0.05;
    const s = Math.sin(z.asCl * 3.2 + z.slot);
    const R = this.ram;
    const sw = R.st === 'batter' ? R.swing : 0;
    P.torsoP = 0.3 + sw * 0.25;
    P.headP = -0.15;
    P.shLp = -0.75 - sw * 0.4;
    P.shRp = -0.75 - sw * 0.4;
    P.shLr = 0.25;
    P.shRr = -0.25;
    P.elL = -1.0;
    P.elR = -1.0;
    P.hipLp = s * 0.5 * Math.min(1, speed);
    P.hipRp = -s * 0.5 * Math.min(1, speed);
    P.knL = 0.25 + Math.max(0, s) * 0.5 * Math.min(1, speed);
    P.knR = 0.25 + Math.max(0, -s) * 0.5 * Math.min(1, speed);
  }

  // (anfitrión) Un cargador del ariete: a su lugar al lado del tronco.
  stepCarrier(z, dt, t) {
    const R = this.ram;
    if (!R.on || R.st === 'drop' || R.st === 'off') {
      this.release(z);
      return;
    }
    const k = z.asK | 0;
    const side = k % 2 ? 1 : -1;
    const along = k < 2 ? -1.3 : 1.0;
    const x = 51.5 + side * 0.78;
    const zz = R.cz + R.swing + along;
    const moved = Math.hypot(x - z.pos.x, zz - z.pos.z);
    z.pos.x = x;
    z.pos.z = zz;
    z.pos.y = z.baseY = this.g.world.floorAt(x, zz);
    z.yaw = Math.PI;
    this.poseCarry(z, t, moved / Math.max(dt, 1e-3));
  }

  // (Zombies.chase, anfitrión) Los de la barbacana van a golpear el rastrillo.
  goal(z, target, distP) {
    if (!this.active || z.dog || z.boss || z.asId !== z.id || z.asRole !== 'gate' || this.gate.mode === 'broken') return null;
    // (si alguien se metió en la barbacana, van por él)
    if (target && distP < 4.5 && this.g.world.zoneAt(target.pos.x, target.pos.z, target.pos.y) === 'L') return null;
    const G = this.goalObj;
    const fr = this.gate.front;
    G.x = fr.x - 1.35 + ((z.id * 7) % 4) * 0.9;
    G.z = fr.z + 0.15 + ((z.id * 3) % 3) * 0.3;
    G.d = Math.hypot(G.x - z.pos.x, G.z - z.pos.z);
    // al llegar miran derecho a la reja (Zombies.chase): mirando al punto,
    // empujados por los de al lado, daban vueltas sin parar
    G.face = window.__gateFaceOff ? null : Math.atan2(0, fr.z - G.z);
    const nav = this.gate.nav;
    nav.update(fr.x, fr.z + 0.6);
    G.nav = nav;
    return G;
  }

  // (Zombies: el golpe y la estocada de los jefes) ¿El rastrillo bajado queda
  // en el medio? El de la barbacana no le pega al del patio a través de la reja.
  shielded(z, p) {
    const G = this.gate;
    if (!this.active || !G || G.mode !== 'down' || !G.door) return false;
    const gz = G.door.group.position.z;
    return (z.pos.z - gz) * (p.z - gz) < 0 && Math.abs(z.pos.x - this.D.frente[0]) < 4;
  }

  zombieHit() {
    this.hitGate(1 / this.gateHits(), 'z');
  }

  gateHits() {
    return GATE_HITS * (1 + Math.max(0, this.nPlayers() - 1) * 0.35);
  }

  // (anfitrión) Le pegan al rastrillo.
  hitGate(amount, kind) {
    const G = this.gate;
    if (!this.active || G.mode !== 'down') return;
    G.hp = Math.max(0, G.hp - amount);
    G.hitT = kind === 'z' ? 0.15 : 0.5;
    this.dirty = true;
    if (kind !== 'z') this.g.net?.event('ee', { ase: 'rh', k: kind });
    this.gateHitFx(kind);
    if (G.hp <= 0) this.breakGate();
  }

  gateHitFx(kind) {
    const g = this.g;
    const G = this.gate;
    const big = kind !== 'z';
    G.hitT = big ? 0.5 : 0.15;
    const p = tmpA.copy(G.front).setY(G.front.y + 1 + Math.random() * (big ? 1.6 : 1));
    p.x += R2() * 1.4;
    g.fx.sparks(p, big ? 3 : 0.6, { x: 0, y: 0.2, z: -1 }, [1, 0.8, 0.5]);
    if (big) {
      g.fx.dust(tmpB.copy(G.front).setY(G.front.y + 0.2), UP, [0.45, 0.4, 0.35], 18);
      const d = g.player.pos.distanceTo(G.front);
      if (d < 22) g.fx.addShake(0.5 * (1 - d / 22));
    }
    this.sfx(big ? 'ram' : 'clang', p);
  }

  // (anfitrión) El rastrillo cayó: entran por el frente.
  breakGate() {
    const g = this.g;
    const G = this.gate;
    G.hp = 0;
    G.brokeOnce = true;
    this.setGateMode('broken');
    g.net?.event('ee', { ase: 'gb' });
    this.breakFx();
    announce(g, '', 3, true);
    this.egg.say('fierro', LINES.broke, 0.5);
    this.dirty = true;
    this.sync(true);
  }

  breakFx() {
    const g = this.g;
    const G = this.gate;
    G.vy = 0;
    g.fx.explosion(tmpA.copy(G.front).setY(G.front.y + 1.2).setZ(G.front.z - 0.8), 2.2, [0.8, 0.7, 0.6]);
    for (let k = 0; k < 10; k++) this.chunk(tmpA.copy(G.front).setY(G.front.y + 1 + Math.random() * 2), tmpB.set(R2() * 3, 2 + Math.random() * 3, -2 - Math.random() * 3), 0.08 + Math.random() * 0.1);
    this.sfx('break', G.front);
    const d = g.player.pos.distanceTo(G.front);
    if (d < 30) g.fx.addShake(0.8 * (1 - d / 30));
  }

  // (anfitrión) El hielo del Penitente: lo tapa y lo arregla un poco (cargado,
  // de golpe; sin cargar, de a poquito). Roto, el hielo lo vuelve a cerrar.
  iceGate(charged) {
    const g = this.g;
    const G = this.gate;
    if (!this.active || this.phase === 'won') return;
    if (G.mode === 'broken') {
      G.frost += charged ? 1 : 0.05;
      if (G.frost < 0.35) {
        g.net?.event('ee', { ase: 'gi', c: 0 });
        this.iceFx(false);
        return;
      }
      G.frost = 0;
      G.hp = charged ? ICE_CHARGED : 0.2;
      this.setGateMode('down');
      announce(g, '', 3, true);
    } else if (G.hp < 1) G.hp = Math.min(1, G.hp + (charged ? ICE_CHARGED : ICE_BASE));
    G.iceT = Math.max(G.iceT, charged ? 25 : 8);
    g.net?.event('ee', { ase: 'gi', c: charged ? 1 : 0 });
    this.iceFx(charged);
    this.dirty = true;
    this.sync(true);
  }

  iceFx(charged) {
    const g = this.g;
    const G = this.gate;
    if (charged) G.iceT = Math.max(G.iceT, 25);
    else G.iceT = Math.max(G.iceT, 8);
    g.fx.frost(tmpA.copy(G.front).setZ(G.front.z - 0.6), charged ? 60 : 14);
    if (charged) g.fx.flash(tmpA.copy(G.front).setY(G.front.y + 1.5), 0x9adcff, 30, 0.5, 12);
    g.audio.shatter?.(tmpA.copy(G.front).setY(G.front.y + 1.4));
  }

  // ---------------- las escaleras ----------------
  // (anfitrión) Se levanta una escalera contra el adarve.
  raiseLadder(L) {
    L.st = 'rise';
    L.t = 0;
    L.fire = 0;
    L.wind = 0;
    L.by = null;
    this.g.net?.event('ee', { ase: 'lr', i: L.i });
    this.ladderLook(L, false);
    this.dirty = true;
  }

  // (anfitrión) La tiran abajo: kind 'push' (F), 'wind' (el Zonda), 'burn' (se quemó).
  pushLadder(i, by, kind = 'push') {
    const g = this.g;
    const L = this.ladders[i];
    if (!isHost(g) || !L || !this.active || (L.st !== 'up' && L.st !== 'burn' && L.st !== 'rise')) return false;
    this.fallLadder(L, kind, by);
    g.net?.event('ee', { ase: 'lf', i, k: kind });
    this.stats.ladders++;
    this.dirty = true;
    return true;
  }

  fallLadder(L, kind, by = null) {
    L.st = 'fall';
    L.t = 0;
    L.by = by;
    L.w = kind === 'wind' ? 1.1 : kind === 'burn' ? 0.15 : 0.45;
    L.rollW = kind === 'wind' ? (Math.random() < 0.5 ? -1 : 1) * 0.9 : 0;
    L.killed = false;
    this.sfx(kind === 'wind' ? 'gust' : 'creak', L.top);
  }

  // (anfitrión) Se prende fuego (el Pillán): arde un rato y se cae.
  burnLadder(L) {
    const g = this.g;
    if (!this.active || (L.st !== 'up' && L.st !== 'rise')) return;
    L.st = 'burn';
    L.t = 0;
    g.net?.event('ee', { ase: 'lb', i: L.i });
    this.ladderLook(L, true);
    this.stats.ladders++;
    this.dirty = true;
    // los que van subiendo se prenden
    for (const z of g.zombies.pool) {
      if (z.active && !z.dead && z.asId === z.id && z.asRole === 'climb' && z.asL === L.i) {
        z.burnT = 4;
        z.burnBy = undefined;
      }
    }
  }

  ladderLook(L, burnt) {
    for (const [o, m] of L.mats) o.material = burnt ? this.mat.burnt : m;
  }

  updateLadder(L, dt, host) {
    const g = this.g;
    L.t += dt;
    if (L.st === 'off') {
      L.group.visible = false;
      if (host && this.phase !== 'won' && this.phase !== 'horns') {
        L.cd -= dt;
        const up = this.ladders.filter((x) => x.st !== 'off').length;
        const max = Math.min(4, 2 + Math.floor(this.round / 15) + (this.nPlayers() > 2 ? 1 : 0));
        if (L.cd <= 0 && up < max) this.raiseLadder(L);
      }
      return;
    }
    L.group.visible = true;
    if (L.st === 'rise') {
      // la levantan de abajo: arranca acostada y golpea contra el parapeto
      const k = Math.min(1, L.t / RISE_T);
      L.phi = 0.12 + (L.phi0 - 0.12) * (k * k);
      L.slide = 0;
      L.sink = 0;
      L.roll = 0;
      if (k >= 1) {
        L.st = 'up';
        L.t = 0;
        L.phi = L.phi0;
        this.sfx('slam', L.top);
        g.fx.dust(L.top, { x: 0, y: 0.3, z: 1 }, [0.75, 0.75, 0.78], 10);
        const d = g.player.pos.distanceTo(L.top);
        if (d < 12) g.fx.addShake(0.25 * (1 - d / 12));
        if (host && !this.saidLadders) {
          this.saidLadders = true;
        }
      }
    } else if (L.st === 'up') {
      L.phi = L.phi0;
    } else if (L.st === 'burn') {
      L.phi = L.phi0;
      // el fuego sube por los largueros
      for (let k = 0; k < 3; k++) {
        this.ladderPoint(L, Math.random() * L.len, 0, tmpA);
        tmpA.x += R2() * 0.3;
        g.fx.fire(tmpA, 0.25, 2);
      }
      if (Math.random() < dt * 3) this.sfx('crackle', L.top);
      if (host && L.t > 2.6) {
        this.fallLadder(L, 'burn');
        g.net?.event('ee', { ase: 'lf', i: L.i, k: 'burn' });
      }
    } else if (L.st === 'fall') {
      // se va para atrás (al precipicio) cada vez más rápido
      L.w += dt * 2.6;
      L.phi = Math.max(-0.35, L.phi - L.w * dt);
      L.roll += (L.rollW || 0) * dt;
      if (L.st === 'fall' && L.phi < 0.35 && !L.killed) {
        L.killed = true;
        // los que iban arriba se van con ella
        if (host) {
          for (const z of g.zombies.pool) {
            if (!z.active || z.dead || z.asId !== z.id || z.asRole !== 'climb' || z.asL !== L.i || z.state !== 'ladder') continue;
            z.asDrop = true;
            g.zombies.kill(z, { type: 'explosive', by: L.by ?? undefined, point: z.pos.clone().setY(z.pos.y + 1), dir: tmpA.set(0, 0.3, 1) });
          }
        }
        this.sfx('crash', tmpA.set(L.x, L.foot.y, L.foot.z + 4));
      }
      if (L.phi <= -0.3) {
        L.st = 'drop';
        L.t = 0;
      }
    } else if (L.st === 'drop') {
      // se resbala por el barranco
      L.slide += dt * 4;
      L.sink += dt * (2 + L.t * 9);
      if (L.t > 1.6) {
        L.st = 'off';
        L.t = 0;
        L.cd = rnd(...LADDER_CD);
        L.slide = 0;
        L.sink = 0;
        L.roll = 0;
        L.phi = 0.1;
        this.ladderLook(L, false);
        L.group.visible = false;
        if (host) this.dirty = true;
      }
    }
    this.posLadder(L);
    // los que van trepando una que se cae, se caen con ella (anfitrión: Zombies llama a stateStep)
  }

  // ---------------- las catapultas ----------------
  // (anfitrión) Empieza a darle cuerda.
  catWind(C) {
    C.st = 'wind';
    C.t = 0;
    this.sfx('ratchet', C.center, 1);
  }

  // (anfitrión) Elige adónde tira y cuánto tarda la piedra.
  catAim(C) {
    const g = this.g;
    const list = players(g).filter((p) => !p.downed);
    let to = null;
    if (list.length && Math.random() < 0.62) {
      const p = list[Math.floor(Math.random() * list.length)];
      const zone = g.world.zoneAt(p.pos.x, p.pos.z, p.pos.y);
      if (zone === 'A' || zone === 'J' || zone === 'S' || zone === 'L') {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.6;
        const x = p.pos.x + Math.cos(a) * r;
        const z = p.pos.z + Math.sin(a) * r;
        to = tmpA.set(x, g.world.floorAt(x, z, p.pos.y + 0.6), z);
      }
    }
    if (!to) {
      // al castillo: el patio y el adarve (no a la barbacana ni a las
      // escaleras: ahí están los suyos)
      const SPOTS = [[47, 55], [57, 55], [52, 50], [45, 59], [59, 59], [40, 63.4], [63, 63.4], [52, 57.5], [46.5, 51.5]];
      const [x0, z0] = SPOTS[Math.floor(Math.random() * SPOTS.length)];
      const x = x0 + R2() * 1.5;
      const z = z0 + R2() * 1.2;
      to = tmpA.set(x, g.world.floorAt(x, z, 40), z);
    }
    const d = Math.hypot(to.x - C.x, to.z - C.z);
    // en arco alto, que pase por arriba de la muralla y de la barbacana; si
    // igual pega contra algo (la torre del rastrillo), más alto, y si no hay
    // caso, el aviso va donde pega de verdad
    const from = this.releasePoint(C, tmpD);
    const T0 = Math.max(3.4, Math.min(4.6, d / 12));
    let T = T0;
    let hit = null;
    for (const k of [0, 0.9, 1.8]) {
      T = T0 + k;
      hit = this.arcHit(from, to, T);
      if (!hit) break;
    }
    if (hit) {
      T = hit[3];
      to.set(hit[0], hit[1], hit[2]);
    }
    return [+to.x.toFixed(2), +to.y.toFixed(2), +to.z.toFixed(2), +T.toFixed(2)];
  }

  // Dónde sale la piedra (la cuchara en el momento en que se suelta).
  releasePoint(C, out) {
    const arm = C.m.arm;
    const was = arm.rotation.x;
    const u = RELEASE / SWING;
    arm.rotation.x = ARM_COCK + (ARM_FIRE + 0.12 - ARM_COCK) * u * u;
    this.catSlot(C, out);
    arm.rotation.x = was;
    C.m.root.updateMatrixWorld(true);
    return out;
  }

  // ¿El arco de `from` a `to` en T segundos pega contra algo antes? [x, y, z, t] o null.
  arcHit(from, to, T) {
    const w = this.g.world;
    const vx = (to.x - from.x) / T;
    const vz = (to.z - from.z) / T;
    const vy = (to.y + 0.45 - from.y) / T + 0.5 * GRAV * T;
    const N = 18;
    let px = from.x;
    let py = from.y;
    let pz = from.z;
    for (let i = 1; i <= N; i++) {
      const t = (T * i) / N;
      const x = from.x + vx * t;
      const y = from.y + vy * t - 0.5 * GRAV * t * t;
      const z = from.z + vz * t;
      if (z < 101 && i < N) {
        tmpB.set(x - px, y - py, z - pz);
        const len = tmpB.length();
        tmpB.divideScalar(len || 1);
        tmpC.set(px, py, pz);
        const h = w.raycast(tmpC, tmpB, len, hitTmp);
        if (h < Infinity) {
          const th = (T * (i - 1)) / N + (h / (len || 1)) * (T / N);
          return [+hitTmp.point.x.toFixed(2), +(hitTmp.point.y - 0.45).toFixed(2), +hitTmp.point.z.toFixed(2), +Math.max(0.5, th).toFixed(2)];
        }
      }
      px = x;
      py = y;
      pz = z;
    }
    return null;
  }

  // Dispara (en todas las compus): el brazo pega contra el tope y la piedra sale.
  catFire(C, to) {
    C.st = 'fire';
    C.t = 0;
    C.shot = to;
    C.released = false;
  }

  // Dónde está la piedra de la cuchara ahora (en el mundo).
  catSlot(C, out) {
    C.m.root.updateMatrixWorld(true);
    return C.m.slot.getWorldPosition(out);
  }

  launch(C) {
    const [x, y, z, T] = C.shot;
    const B = this.boulders.find((b) => !b.on) || this.boulders[0];
    this.catSlot(C, B.from);
    B.to.set(x, y + 0.45, z);
    B.T = T;
    B.t = 0;
    // v0 = (d - g t²/2) / t (con la gravedad para abajo)
    B.v0.subVectors(B.to, B.from).divideScalar(T);
    B.v0.y += 0.5 * GRAV * T;
    B.on = true;
    B.whistle = false;
    B.pos.copy(B.from);
    B.prev.copy(B.from);
    B.spin.set(R2() * 4, R2() * 4, R2() * 4);
    B.mesh.visible = true;
    B.glow.visible = true;
    // el aviso en el piso: dónde va a caer
    const W = this.warns.find((w) => !w.on) || this.warns[0];
    W.on = true;
    W.pos.set(x, y + 0.07, z);
    W.t = 0;
    W.T = T + RELEASE * 0;
    B.warn = W;
    C.rock.visible = false;
    C.rglow.visible = false;
    this.sfx('release', C.center);
  }

  updateCat(C, dt, host) {
    const g = this.g;
    const m = C.m;
    C.t += dt;
    // entran rodando desde atrás del humo
    C.roll = Math.min(1, C.roll + dt / START_T);
    const back = (1 - smooth(C.roll)) * 9;
    m.root.position.set(C.x - Math.sin(C.yaw) * back, C.y, C.z - Math.cos(C.yaw) * back);
    if (C.st === 'dead') {
      // los restos arden un rato y humean
      C.burnT -= dt;
      if (C.burnT > 0 && Math.random() < 0.8) g.fx.fire(tmpA.set(C.x + R2() * 1.6, C.y + 0.6 + Math.random() * 1.6, C.z + R2() * 1.6), 0.6, 2);
      return;
    }
    if (C.st === 'idle') {
      C.theta += (ARM_FIRE - C.theta) * Math.min(1, dt * 3);
      if (host && this.phase !== 'won' && this.phase !== 'horns' && C.roll >= 1) {
        C.reload -= dt;
        if (C.reload <= 0) {
          this.catWind(C);
          g.net?.event('ee', { ase: 'cw', i: C.i });
        }
      }
    } else if (C.st === 'wind') {
      const k = Math.min(1, C.t / WIND_T);
      C.theta = ARM_FIRE + (ARM_COCK - ARM_FIRE) * smooth(k);
      m.winch.rotation.x -= dt * 5;
      if (k >= 1) {
        C.st = 'load';
        C.t = 0;
        C.rock.visible = true;
        C.rglow.visible = true;
        g.fx.fire(this.catSlot(C, tmpA), 0.3, 6);
        this.sfx('ignite', C.center);
      }
    } else if (C.st === 'load') {
      C.theta = ARM_COCK;
      if (Math.random() < 0.5) g.fx.fire(this.catSlot(C, tmpA), 0.25, 1);
      if (host && C.t >= LOAD_T && this.phase !== 'won') {
        const to = this.catAim(C);
        this.catFire(C, to);
        g.net?.event('ee', { ase: 'cf', i: C.i, to });
      }
    } else if (C.st === 'fire') {
      const t = C.t;
      if (t < SWING) {
        const u = t / SWING;
        C.theta = ARM_COCK + (ARM_FIRE + 0.12 - ARM_COCK) * u * u;
      } else {
        // pega contra el tope y rebota un poco
        const u = t - SWING;
        C.theta = ARM_FIRE + 0.12 * Math.cos(u * 22) * Math.exp(-u * 8);
        if (!C.slammed) {
          C.slammed = true;
          C.jolt = 1;
          this.sfx('thud', C.center);
          g.fx.dust(tmpA.set(C.x, C.y + 0.2, C.z), UP, [0.5, 0.45, 0.4], 10);
        }
      }
      if (!C.released && t >= RELEASE) {
        C.released = true;
        m.arm.rotation.x = C.theta;
        this.launch(C);
      }
      if (t >= FIRE_T) {
        C.st = 'idle';
        C.t = 0;
        C.slammed = false;
        C.reload = this.dragonOn ? rnd(12, 16) : rnd(9, 13);
      }
    }
    m.arm.rotation.x = C.theta;
    // el sacudón del golpe
    C.jolt = Math.max(0, C.jolt - dt * 4);
    m.body.rotation.x = -C.jolt * 0.06 * Math.sin(C.t * 30);
    m.body.position.y = C.jolt * 0.05;
    // el estandarte flamea
    m.flag.rotation.y = Math.sin(g.time * 2.3 + C.i) * 0.35;
    C.bglow.material.opacity = 0.7 + Math.sin(g.time * 13 + C.i) * 0.15;
    if (Math.random() < dt * 4) g.fx.fire(tmpA.set(0, 0, 0).copy(C.bglow.position).applyMatrix4(m.body.matrixWorld), 0.15, 1);
    if (C.hitT > 0) C.hitT -= dt;
  }

  // (anfitrión) Un golpe a la catapulta: el cañón, el rayo de Illapa sin cargar.
  hurtCat(i, amount, how) {
    const g = this.g;
    const C = this.cats[i];
    if (!C || C.st === 'dead' || !this.active) return;
    C.hp = Math.max(0, C.hp - amount);
    this.dirty = true;
    if (C.hp <= 0) this.destroyCat(i, how);
    else {
      g.net?.event('ee', { ase: 'ch', i, k: how });
      this.catHitFx(C, how);
    }
  }

  catHitFx(C, how) {
    const g = this.g;
    C.hitT = 0.4;
    if (how === 'zap') {
      g.fx.electric(C.center, 18);
      g.fx.flash(C.center, 0xffe45a, 30, 0.2, 14);
      g.fx.sparks(C.center, 2, UP, [1, 0.92, 0.45]);
    } else {
      g.fx.explosion(tmpA.copy(C.center).setY(C.center.y - 0.6), 2.6, [1, 0.6, 0.25]);
      this.sfx('boom', C.center, 0.8);
      for (let k = 0; k < 6; k++) this.chunk(C.center, tmpB.set(R2() * 4, 3 + Math.random() * 4, R2() * 4), 0.1, true);
    }
  }

  // (anfitrión) La catapulta cae: how 'rayo' (Illapa cargado), 'dragon', 'canon', 'zap'.
  destroyCat(i, how) {
    const g = this.g;
    const C = this.cats[i];
    if (!C || C.st === 'dead') return;
    g.net?.event('ee', { ase: 'cx', i, k: how });
    this.catDead(C, how);
    this.stats.cats++;
    this.dirty = true;
    this.sync(true);
  }

  catDead(C, how) {
    const g = this.g;
    C.st = 'dead';
    C.hp = 0;
    C.burnT = 14;
    C.rock.visible = false;
    C.rglow.visible = false;
    if (how === 'rayo') {
      // el cielo la parte en dos
      this.bigBolt(C.center, 0);
      g.later(0.12, () => this.bigBolt(C.center, 1));
      g.later(0.35, () => this.bigBolt(C.center, 2));
    }
    g.fx.explosion(C.center, 4.2, how === 'rayo' ? [1, 0.95, 0.6] : [1, 0.55, 0.2]);
    for (let k = 0; k < 14; k++) this.chunk(C.center, tmpB.set(R2() * 6, 4 + Math.random() * 6, R2() * 6), 0.12 + Math.random() * 0.12, true);
    this.sfx('boom', C.center, 1.4);
    this.sfx('crash', C.center);
    this.catLook(C, true);
    g.hud.toast('¡Catapulta destruida! +300');
    g.addPoints(300, null, true);
  }

  // El rayo grande del cielo (Illapa cargado): gordo, en zigzag, con su resplandor.
  bigBolt(to, k) {
    const g = this.g;
    const top = tmpD.set(to.x + R2() * 8, to.y + 75, to.z + R2() * 8);
    let px = top.x;
    let py = top.y;
    let pz = top.z;
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const j = i < n ? (1 - u) * 5 : 0;
      const nx = top.x + (to.x - top.x) * u + R2() * j;
      const ny = top.y + (to.y - top.y) * u;
      const nz = top.z + (to.z - top.z) * u + R2() * j;
      tmpA.set(px, py, pz);
      tmpB.set(nx, ny, nz);
      g.fx.beam(tmpA, tmpB, { color: k ? 0xbfe0ff : 0xfff2a0, width: 1.6, life: 0.35 });
      g.fx.beam(tmpA, tmpB, { color: 0xffffff, width: 0.45, life: 0.35 });
      // ramitas
      if (i % 3 === 0 && i < n) g.fx.lightning(tmpB, tmpC.set(nx + R2() * 6, ny - 6, nz + R2() * 6), 0xfff2a0, 0.25);
      px = nx;
      py = ny;
      pz = nz;
    }
    g.fx.flash(to, 0xfff0c0, 120, 0.5, 40);
    if (g.weather) g.weather.flash = Math.max(g.weather.flash || 0, 1);
    if (!k) g.audio.thunder?.(to, true);
  }

  // Entera o hecha pedazos (quemada, torcida y con el brazo roto).
  catLook(C, dead) {
    for (const [o, m] of C.mats) o.material = dead ? this.mat.burnt : m;
    const m = C.m;
    m.body.rotation.z = dead ? 0.22 : 0;
    m.body.rotation.y = dead ? 0.3 : 0;
    m.arm.rotation.z = dead ? 0.9 : 0;
    if (dead) C.theta = 1.2;
    m.arm.rotation.x = C.theta;
    m.flag.visible = !dead;
    C.bglow.visible = !dead;
  }

  // ---------------- las piedras ----------------
  updateBoulders(dt, host) {
    const g = this.g;
    for (const B of this.boulders) {
      if (!B.on) continue;
      B.t += dt;
      B.prev.copy(B.pos);
      const t = Math.min(B.t, B.T);
      B.pos.copy(B.from).addScaledVector(B.v0, t);
      B.pos.y -= 0.5 * GRAV * t * t;
      B.mesh.position.copy(B.pos);
      B.mesh.rotation.x += B.spin.x * dt;
      B.mesh.rotation.y += B.spin.y * dt;
      B.glow.position.copy(B.pos);
      B.glow.material.opacity = 0.75 + Math.random() * 0.25;
      // la estela de fuego y humo
      g.fx.fire(B.pos, 0.35, 3);
      if (Math.random() < 0.7) g.fx.alpha.spawn(B.pos.x, B.pos.y, B.pos.z, R2() * 0.3, 0.4, R2() * 0.3, { color: [0.12, 0.1, 0.09], size: 0.6, size1: 2.6, life: 1.6, alpha: 0.4, drag: 0.6 });
      // el silbido que llega
      if (!B.whistle && B.T - B.t < 1.3) {
        B.whistle = true;
        this.sfx('whistle', B.to);
      }
      // ¿pegó contra algo antes (la muralla, un techo)?
      let hit = null;
      if (B.pos.z < 101 && B.t > 0.3) {
        tmpA.subVectors(B.pos, B.prev);
        const len = tmpA.length();
        if (len > 1e-4) {
          tmpA.divideScalar(len);
          if (g.world.raycast(B.prev, tmpA, len, hitTmp) < Infinity) hit = hitTmp.point;
        }
      }
      if (hit || B.t >= B.T) this.impact(B, hit || B.to, host);
    }
  }

  impact(B, at, host) {
    const g = this.g;
    B.on = false;
    B.mesh.visible = false;
    B.glow.visible = false;
    if (B.warn) B.warn.on = false;
    const p = tmpC.copy(at);
    g.fx.explosion(p, 4.2, [1, 0.5, 0.15]);
    g.fx.fire(p, 1.6, 22);
    for (let k = 0; k < 14; k++) this.chunk(p, tmpB.set(R2() * 6, 4 + Math.random() * 6, R2() * 6), 0.09 + Math.random() * 0.17);
    // el hongo de humo negro y el fogonazo con su onda
    for (let k = 0; k < 12; k++) g.fx.alpha.spawn(p.x + R2() * 1.2, p.y + 0.5 + Math.random(), p.z + R2() * 1.2, R2() * 1.4, 2.5 + Math.random() * 2.5, R2() * 1.4, { color: [0.1, 0.08, 0.07], size: 1, size1: 4.2, life: 2.6 + Math.random(), alpha: 0.5, drag: 1.1 });
    const X = this.blasts[this.blastNext];
    this.blastNext = (this.blastNext + 1) % this.blasts.length;
    X.on = true;
    X.t = 0;
    X.pos.copy(p);
    this.sfx('boom', p, 1.3);
    const me = g.player;
    const d = me.pos.distanceTo(p);
    if (d < 26) g.fx.addShake(0.7 * (1 - d / 26));
    // al que agarra (cada uno el suyo)
    const dp = Math.hypot(me.pos.x - p.x, me.pos.z - p.z);
    if (dp < BOULDER_R && Math.abs(me.pos.y - p.y) < 2.5 && me.alive) me.damage(Math.round(15 + 70 * (1 - dp / BOULDER_R)), p, true);
    // el fuego que queda
    const fy = g.world.floorAt(p.x, p.z, p.y + 0.5);
    if (Math.abs(fy - p.y) < 1.2) {
      const P = this.patches.find((x) => !x.on) || this.patches[0];
      P.on = true;
      P.pos.set(p.x, fy, p.z);
      P.t = 0;
      P.tick = 0;
    }
    if (!host) return;
    for (const { z } of g.zombies.inRadius(p, BOULDER_R + 0.4, near)) {
      if (z.boss) g.zombies.damage(z, z.maxHp * 0.04, { type: 'explosive', noPoints: true, point: p.clone() });
      else g.zombies.damage(z, z.maxHp * 3 + 10, { type: 'explosive', noPoints: true, point: tmpA.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z).clone(), dir: tmpB.set(z.pos.x - p.x, 0.5, z.pos.z - p.z).normalize().clone() });
    }
  }

  updateWarns(dt) {
    const g = this.g;
    for (const W of this.warns) {
      if (!W.on) {
        W.ring.visible = W.fill.visible = W.shadow.visible = false;
        continue;
      }
      W.t += dt;
      const k = clamp01(W.t / W.T);
      W.ring.visible = W.fill.visible = W.shadow.visible = true;
      W.ring.position.copy(W.pos);
      W.fill.position.copy(W.pos);
      W.shadow.position.copy(W.pos).setY(W.pos.y + 0.01);
      const pulse = 0.5 + 0.5 * Math.sin(g.time * (6 + k * 18));
      W.ring.material.opacity = 0.65 + pulse * 0.35;
      W.fill.scale.setScalar(0.3 + k * (BOULDER_R - 0.3));
      W.fill.material.opacity = 0.2 + k * 0.35;
      W.shadow.scale.setScalar(1.5 + k * 5);
      W.shadow.material.opacity = k * 0.55;
    }
  }

  updatePatches(dt, host) {
    const g = this.g;
    const me = g.player;
    for (const P of this.patches) {
      if (!P.on) {
        P.s.visible = false;
        continue;
      }
      P.t += dt;
      const k = 1 - P.t / PATCH_T;
      if (k <= 0) {
        P.on = false;
        P.s.visible = false;
        continue;
      }
      P.s.visible = true;
      P.s.position.set(P.pos.x, P.pos.y + 0.5, P.pos.z);
      P.s.scale.setScalar(3.4 * (0.5 + 0.5 * k) * (0.9 + Math.random() * 0.2));
      for (let j = 0; j < 3; j++) g.fx.fire(tmpA.set(P.pos.x + R2() * 1.6, P.pos.y + 0.05, P.pos.z + R2() * 1.6), 0.5, 2);
      if (Math.random() < 0.25) g.fx.alpha.spawn(P.pos.x + R2(), P.pos.y + 1.2, P.pos.z + R2(), 0, 1.2, 0, { color: [0.12, 0.1, 0.09], size: 0.6, size1: 2.4, life: 2, alpha: 0.35, drag: 0.6 });
      P.tick -= dt;
      if (P.tick > 0) continue;
      P.tick = 0.5;
      if (me.alive && Math.hypot(me.pos.x - P.pos.x, me.pos.z - P.pos.z) < 1.8 && Math.abs(me.pos.y - P.pos.y) < 1.2) me.damage(7, P.pos, false);
      if (!host) continue;
      for (const { z } of g.zombies.inRadius(P.pos, 2, near)) {
        if (z.boss) continue;
        z.burnT = Math.max(z.burnT || 0, 2.5);
      }
    }
  }

  updateBlasts(dt) {
    for (const X of this.blasts) {
      if (!X.on) continue;
      X.t += dt;
      const k = X.t / 0.7;
      if (k >= 1) {
        X.on = false;
        X.flash.visible = X.wave.visible = false;
        continue;
      }
      X.flash.visible = X.wave.visible = true;
      X.flash.position.set(X.pos.x, X.pos.y + 1.2, X.pos.z);
      X.flash.scale.setScalar(4 + k * 9);
      X.flash.material.opacity = (1 - k) * (1 - k);
      X.wave.position.set(X.pos.x, X.pos.y + 0.12, X.pos.z);
      X.wave.scale.setScalar(0.6 + k * 7.5);
      X.wave.material.opacity = (1 - k) * 0.9;
    }
  }

  // Un cascote que salta.
  chunk(p, v, s, far = false) {
    const c = this.chunks[this.chunkNext];
    this.chunkNext = (this.chunkNext + 1) % this.chunks.length;
    c.on = true;
    c.p.copy(p);
    c.v.copy(v);
    c.s = s;
    c.t = 0;
    c.r.set(Math.random() * 6, Math.random() * 6, 0);
    c.w.set(R2() * 8, R2() * 8, R2() * 8);
    c.floor = far ? macroY(p.x, p.z) : this.g.world.floorAt(p.x, p.z, p.y + 0.5);
  }

  updateChunks(dt) {
    let any = false;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.on) continue;
      any = true;
      c.t += dt;
      c.v.y -= 16 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.floor + c.s) {
        c.p.y = c.floor + c.s;
        c.v.multiplyScalar(0.35);
        c.v.y = Math.abs(c.v.y) * 0.4;
        c.w.multiplyScalar(0.5);
      }
      c.r.x += c.w.x * dt;
      c.r.y += c.w.y * dt;
      const s = c.t > 5 ? Math.max(0, c.s * (1 - (c.t - 5))) : c.s;
      if (c.t > 6) c.on = false;
      tmpQ.setFromEuler(c.r);
      tmpM.compose(c.p, tmpQ, tmpS.set(s, s * 0.8, s));
      this.debris.setMatrixAt(i, c.on ? tmpM : tmpM.makeScale(0, 0, 0));
    }
    if (any || this.chunksDirty) this.debris.instanceMatrix.needsUpdate = true;
    this.chunksDirty = any;
  }

  // ---------------- los calderos ----------------
  // (anfitrión) F en el caldero: volcar si está listo, si no cebar.
  useCauldron(i, by) {
    const g = this.g;
    const K = this.pots[i];
    if (!isHost(g) || !K || !this.active) return false;
    if (K.st === 'ready') {
      this.pour(K, by);
      g.net?.event('ee', { ase: 'po', i, by });
      this.dirty = true;
      return true;
    }
    if (K.st === 'empty') {
      K.water = Math.min(1, K.water + 0.34);
      this.sfx('pour', tmpA.set(K.x, K.y + 1.3, K.z));
      g.fx.waterJet(tmpA.set(K.x - K.dir * 0.4, K.y + 2.1, K.z + 0.3), tmpB.set(K.x, K.y + 1.4, K.z), false);
      if (K.water >= 0.99) {
        K.st = 'heat';
        K.t = 0;
      }
      this.dirty = true;
      return true;
    }
    return false;
  }

  pour(K, by) {
    K.st = 'pour';
    K.t = 0;
    K.by = by;
    K.tick = 0;
    this.sfx('scald', tmpA.set(K.sx, K.fy + 2, 64));
    this.g.audio.guns?.play('agua-caliente', { pos: tmpA.set(K.x, K.y + 1.2, K.z), gain: 1 });
  }

  updatePot(K, dt, host) {
    const g = this.g;
    K.t += dt;
    const m = K.m;
    if (K.st === 'pour') {
      const t = K.t;
      const want = t < 0.4 ? (t / 0.4) * 1.05 : t < POUR_T - 0.5 ? 1.05 : Math.max(0, 1.05 * (1 - (t - (POUR_T - 0.5)) / 0.5));
      K.tilt = want;
      K.water = Math.max(0, 1 - t / (POUR_T - 0.3));
      const on = t > 0.25 && t < POUR_T - 0.2;
      // el chorro a la canaleta y la cascada adentro de la barbacana
      if (on) {
        g.fx.waterJet(tmpA.set(K.x + K.dir * 0.6, K.y + 1.45, K.z), tmpB.set(K.x + K.dir * 1.5, K.y + 0.7, K.z), true);
        g.fx.steam(tmpA.set(K.x + K.dir * 1.2, K.y + 0.9, K.z), 2, 0.4);
        this.steamBurst(K, dt);
      }
      K.fall.visible = on || K.fall.material.opacity > 0.02;
      K.fall.material.opacity += ((on ? 0.95 : 0) - K.fall.material.opacity) * Math.min(1, dt * 10);
      K.fall.material.map.offset.y -= dt * 3.5;
      m.spill.visible = K.fall.visible;
      m.spill.material.opacity = K.fall.material.opacity;
      // la columna de vapor donde la canaleta entra al muro
      if (on && Math.random() < 0.8) g.fx.alpha.spawn(K.x + K.dir * 1.45, K.y + 0.9, K.z + R2() * 0.3, R2() * 0.4, 2 + Math.random() * 1.5, R2() * 0.4, { color: [0.86, 0.88, 0.82], size: 0.6, size1: 2.8, life: 1.8, alpha: 0.32, drag: 0.4 });
      this.flood.k = Math.max(this.flood.k, on ? Math.min(1, (t - 0.25) * 1.6) : 0);
      // (anfitrión) los de abajo se cocinan
      if (host && on) {
        K.tick -= dt;
        if (K.tick <= 0) {
          K.tick = 0.2;
          this.scaldBox(K.by);
        }
      }
      if (t >= POUR_T) {
        K.st = 'empty';
        K.t = 0;
        K.water = 0;
        K.heat = 0;
        K.fall.visible = false;
        if (host) this.dirty = true;
      }
    } else if (K.st === 'heat') {
      K.heat = Math.min(1, K.t / HEAT_T);
      if (host && K.t >= HEAT_T) {
        K.st = 'ready';
        K.t = 0;
        this.dirty = true;
      }
    } else {
      K.tilt += (0 - K.tilt) * Math.min(1, dt * 4);
    }
    m.pot.rotation.z = -K.dir * K.tilt;
    // el nivel y el hervor del mate
    const lvl = K.water;
    m.liquid.visible = lvl > 0.04;
    m.liquid.position.y = 0.3 + lvl * 0.32;
    m.liquid.scale.setScalar(0.72 + lvl * 0.28);
    const boil = K.st === 'ready' ? 1 : K.st === 'heat' ? K.heat : 0;
    if (boil > 0.3 && Math.random() < dt * 6 * boil) g.fx.steam(tmpA.set(K.x, K.y + 1.35, K.z), 1, 0.4);
  }

  // El vapor que llena la barbacana, sale por la reja y sube por el techo.
  steamBurst(K, dt) {
    const g = this.g;
    const n = Math.random() < 0.5 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const z = 62.9 + Math.random() * 4.2;
      const x = 50.2 + Math.random() * 2.6;
      const y = g.world.floorAt(x, z) + 0.2 + Math.random() * 2;
      g.fx.alpha.spawn(x, y, z, R2() * 0.8, 1 + Math.random(), R2() * 0.8, { color: [0.8, 0.82, 0.78], size: 0.7, size1: 2.6, life: 1.4 + Math.random(), alpha: 0.3, drag: 0.8 });
    }
    // por la reja, al patio
    if (Math.random() < 0.6) g.fx.alpha.spawn(50.6 + Math.random() * 2, 24.4 + Math.random() * 2, 62.4, R2() * 0.5, 0.6, -1.8 - Math.random(), { color: [0.85, 0.86, 0.82], size: 0.5, size1: 2.2, life: 1.6, alpha: 0.28, drag: 0.7 });
    // por los agujeros del techo
    if (Math.random() < 0.5) g.fx.alpha.spawn(50.5 + Math.random() * 2.5, 30.6, 63.5 + Math.random() * 3, R2() * 0.3, 2.2, R2() * 0.3, { color: [0.85, 0.86, 0.82], size: 0.8, size1: 3, life: 2.2, alpha: 0.25, drag: 0.3 });
    // salpicones calientes en el piso
    if (Math.random() < 0.7) g.fx.add.spawn(K.sx + K.dir * 0.6, K.fy + 0.1, 63 + Math.random() * 1.5, R2() * 2, 1 + Math.random() * 2, R2() * 2, { color: [0.75, 0.8, 0.4], size: 0.07, life: 0.5, gravity: 9 });
  }

  // (anfitrión) Lo que agarra el mate hirviendo: la barbacana, del rastrillo para afuera.
  scaldBox(by) {
    const g = this.g;
    const hit = (z) => z.active && !z.dead && z.pos.x > 49.9 && z.pos.x < 54.1 && z.pos.z > 62.6 && z.pos.z < 67.4 && (z.baseY || z.pos.y) < 27;
    const info = { type: 'scald', by: by === myId(g) ? undefined : by, point: null };
    for (const z of g.zombies.pool) {
      if (!hit(z)) continue;
      info.point = tmpA.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z).clone();
      g.zombies.damage(z, z.maxHp * 2 + 10, info);
    }
    const b = g.zombies.boss;
    if (b && hit(b)) g.zombies.damage(b, b.maxHp * 0.025, { type: 'scald', by: info.by, point: tmpA.set(b.pos.x, (b.baseY || 0) + 1.5, b.pos.z).clone() });
  }

  // ---------------- los cañones ----------------
  // (anfitrión) F en el cañón: le tira a la catapulta más cercana que quede.
  fireCannon(j) {
    const g = this.g;
    const N = this.cannons[j];
    if (!isHost(g) || !N || !this.active || N.cd > 0 || N.fuse >= 0) return false;
    let best = -1;
    let bd = Infinity;
    for (const C of this.cats) {
      if (C.st === 'dead') continue;
      const d = Math.hypot(C.x - N.x, C.z - N.z);
      if (d < bd) {
        bd = d;
        best = C.i;
      }
    }
    if (best < 0) return false;
    this.cannonGo(N, best);
    g.net?.event('ee', { ase: 'cn', j, i: best });
    this.dirty = true;
    return true;
  }

  cannonGo(N, i) {
    N.fuse = 0;
    N.target = i;
    N.cd = CANNON_CD;
    this.sfx('fuse', N.muzzle);
  }

  updateCannon(N, dt, host) {
    const g = this.g;
    if (N.cd > 0 && N.fuse < 0 && N.fly < 0) N.cd = Math.max(0, N.cd - dt);
    if (N.fuse >= 0) {
      N.fuse += dt;
      g.fx.sparks(tmpA.set(N.x, N.y + 1.05, N.z - 0.3), 0.15, UP, [1, 0.7, 0.3]);
      if (N.fuse >= 0.6) {
        N.fuse = -1;
        // ¡bum!
        const C = this.cats[N.target];
        N.from.copy(N.muzzle);
        N.to.copy(C.center);
        N.v0.subVectors(N.to, N.from).divideScalar(CANNON_FLY);
        N.v0.y += 0.5 * GRAV * CANNON_FLY;
        N.fly = 0;
        N.ball.visible = true;
        g.fx.flash(N.muzzle, 0xffb060, 40, 0.25, 14);
        g.fx.fire(N.muzzle, 0.3, 10);
        for (let k = 0; k < 14; k++) g.fx.alpha.spawn(N.muzzle.x, N.muzzle.y, N.muzzle.z, R2() * 1.2, 0.5 + Math.random(), 2 + Math.random() * 3, { color: [0.6, 0.6, 0.62], size: 0.4, size1: 2.4, life: 2, alpha: 0.4, drag: 1.4 });
        this.sfx('cannon', N.muzzle);
        const d = g.player.pos.distanceTo(N.muzzle);
        if (d < 14) g.fx.addShake(0.45 * (1 - d / 14));
      }
    }
    if (N.fly >= 0) {
      N.fly += dt;
      const t = Math.min(N.fly, CANNON_FLY);
      N.ball.position.copy(N.from).addScaledVector(N.v0, t);
      N.ball.position.y -= 0.5 * GRAV * t * t;
      if (Math.random() < 0.8) g.fx.alpha.spawn(N.ball.position.x, N.ball.position.y, N.ball.position.z, 0, 0.2, 0, { color: [0.5, 0.5, 0.52], size: 0.25, size1: 1, life: 0.9, alpha: 0.3, drag: 0.5 });
      if (N.fly >= CANNON_FLY) {
        N.fly = -1;
        N.ball.visible = false;
        if (host) this.hurtCat(N.target, CANNON_DMG, 'canon');
      }
    }
  }

  // ---------------- el comandante y el ariete ----------------
  // (anfitrión)
  startCommander() {
    const g = this.g;
    const R = g.rounds;
    if (!this.active || this.phase === 'won' || this.phase === 'cmd') return;
    this.phase = 'cmd';
    this.cmdT = 0;
    const [bx, bz] = this.D.barbacana;
    const at = new THREE.Vector3(bx, 0, bz + 0.2);
    at.y = g.world.floorAt(at.x, at.z);
    let b = g.zombies.boss;
    if (!b || b.dead) b = g.zombies.spawnBoss(Math.max(this.round, 6), { kind: 'caballero', at });
    this.cmd = b || null;
    if (b) R.mini = b;
    if (this.gate.mode === 'down') {
      const RM = this.ram;
      RM.on = true;
      RM.st = 'walk';
      RM.cz = RAM_FROM;
      RM.swing = 0;
      RM.t = 0;
      RM.drop = 0;
      RM.hits = 0;
      const hp = zombieHealth(Math.max(this.round, 5));
      for (let k = 0; k < 4; k++) {
        this.forceSpawn = { kind: 'custom', place: (z) => this.placeCarrier(z, k) };
        g.zombies.spawn(this.round, hp);
      }
      this.forceSpawn = null;
      g.fx.dust(tmpA.set(bx, at.y + 0.3, bz), UP, [0.45, 0.4, 0.35], 18);
    }
    announce(g, '', 3, true);
    this.egg.say('fierro', LINES.cmd, 1.5);
    g.net?.event('ee', { ase: 'cmd' });
    this.horns(0, 0.7);
    this.dirty = true;
    this.sync(true);
  }

  placeCarrier(z, k) {
    z.asId = z.id;
    z.asRole = 'ram';
    z.asK = k;
    z.level = 0;
    z.state = 'ram';
    z.stateT = 0;
    z.yaw = Math.PI;
    const side = k % 2 ? 1 : -1;
    z.pos.set(51.5 + side * 0.78, 0, this.ram.cz + (k < 2 ? -1.3 : 1));
    z.pos.y = z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z);
  }

  updateRam(dt, host) {
    const g = this.g;
    const R = this.ram;
    const grp = R.group;
    if (!R.on) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    R.t += dt;
    const stop = this.gate.front.z + RAM_LEN / 2 + 0.05;
    if (host && (R.st === 'walk' || R.st === 'batter')) {
      // sin cargadores no se mueve (y con el rastrillo roto lo sueltan)
      let n = 0;
      for (const z of g.zombies.pool) if (z.active && !z.dead && z.asId === z.id && z.asRole === 'ram' && z.state === 'ram') n++;
      if (n < 2 || this.gate.mode !== 'down') {
        this.dropRam();
        g.net?.event('ee', { ase: 'rd' });
      }
    }
    if (R.st === 'walk') {
      R.cz = Math.max(stop, R.cz - RAM_SPEED * dt);
      R.swing = 0;
      if (R.cz <= stop + 1e-3 && host) {
        R.st = 'batter';
        R.t = 0;
        this.dirty = true;
      }
    } else if (R.st === 'batter') {
      // para atrás de a poco, el empujón y el golpe contra la reja
      const c = R.t % 2.4;
      if (c < 1.5) R.swing = smooth(c / 1.5) * 0.85;
      else if (c < 1.78) {
        const u = (c - 1.5) / 0.28;
        R.swing = 0.85 - u * u * 0.85;
      } else R.swing = 0;
      if (c >= 1.78 && R.lastC < 1.78 && host) {
        R.hits++;
        this.hitGate(RAM_HIT, 'ram');
      }
      R.lastC = c;
    } else if (R.st === 'drop') {
      R.drop = Math.min(1, R.drop + dt * 2.5);
      R.swing *= Math.max(0, 1 - dt * 5);
    }
    // dónde está: a la altura de las manos, siguiendo la rampa
    const zc = R.cz + R.swing;
    const yh = g.world.floorAt(51.5, zc - RAM_LEN / 2 + 0.3);
    const yt = g.world.floorAt(51.5, zc + RAM_LEN / 2 - 0.3);
    const lift = 0.95 * (1 - R.drop) + 0.3 * R.drop;
    grp.position.set(51.5, (yh + yt) / 2 + lift, zc);
    grp.rotation.set(Math.atan2(yh - yt, RAM_LEN - 0.6) * -1, Math.PI, R.drop * 0.15);
  }

  dropRam() {
    const R = this.ram;
    if (R.st === 'drop' || !R.on) return;
    R.st = 'drop';
    R.drop = 0;
    this.sfx('thud', R.group.position);
    this.g.fx.dust(tmpA.copy(R.group.position).setY(R.group.position.y - 0.6), UP, [0.45, 0.4, 0.35], 14);
    this.dirty = true;
  }

  // El Caballero Negro contra el rastrillo: si llega, lo golpea con la lanza.
  updateCommander(dt) {
    const g = this.g;
    const b = this.cmd;
    if (!b || b.dead || g.zombies.boss !== b) return;
    if (this.gate.mode !== 'down') {
      if (b.state === 'lance') g.zombies.setState(b, 'chase');
      return;
    }
    const fr = this.gate.front;
    const d = Math.hypot(b.pos.x - fr.x, b.pos.z - fr.z);
    this.knightT = (this.knightT || 0) - dt;
    // (con la estocada, no con el golpe al piso: ese les pegaba a los de atrás de la reja)
    if (d < 2.6 && this.knightT <= 0 && b.state === 'chase') {
      this.knightT = 2.8;
      g.zombies.setState(b, 'lance');
      this.knightHit = true;
    }
    if (b.state === 'lance') {
      // mirando la reja, quieto (Zombies.thinkBoss no lo mueve en este estado)
      b.yaw = Math.PI;
      g.zombies.poseSlam(b, b.stateT);
      if (this.knightHit && b.stateT > 0.75) {
        this.knightHit = false;
        this.hitGate(KNIGHT_HIT, 'knight');
      }
      if (b.stateT > 1.4) g.zombies.setState(b, 'chase');
    }
  }

  // (CastleEgg.onKill, anfitrión)
  onKill(z) {
    if (this.active && this.phase === 'cmd' && z === this.cmd) this.win();
  }

  // ---------------- el dragón ----------------
  // (anfitrión) Una pasada: a una catapulta (la quema) o a la horda de afuera.
  strafe() {
    const g = this.g;
    const Dg = this.egg.dragon;
    if (!Dg || Dg.flight || Dg.jet || (Dg.mode !== 'roof' && Dg.mode !== 'cumbre')) return false;
    const alive = this.cats.filter((C) => C.st !== 'dead');
    let m;
    if (alive.length && (Math.random() < 0.7 || !this.lastCat)) {
      const C = alive[Math.floor(Math.random() * alive.length)];
      m = { k: 'cat', i: C.i, at: [C.x, C.y, C.z], home: Dg.mode, dir: 0 };
      this.lastCat = true;
    } else {
      m = { k: 'horde', i: -1, at: [52, 23.8, 68.4], home: Dg.mode, dir: Math.random() < 0.5 ? 1 : -1 };
      this.lastCat = false;
    }
    this.strafeGo(m);
    g.net?.event('ee', { ase: 'ds', ...m });
    return true;
  }

  strafeGo(m) {
    const g = this.g;
    const Dg = this.egg.dragon;
    if (!Dg) return;
    const H = Dg.spots[m.home]?.pos || Dg.D.root.position;
    const at = new THREE.Vector3(...m.at);
    let dir;
    let pts;
    if (m.k === 'cat') {
      dir = new THREE.Vector3(at.x - H.x, 0, at.z - H.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const yl = at.y + 9;
      pts = [
        H.clone(),
        H.clone().add(new THREE.Vector3(0, 10, 0)).addScaledVector(dir, 8),
        at.clone().addScaledVector(dir, -36).setY(Math.max(H.y, at.y) + 14),
        at.clone().addScaledVector(dir, -14).setY(yl),
        at.clone().addScaledVector(dir, 8).setY(yl - 1),
        at.clone().addScaledVector(dir, 30).setY(at.y + 18),
        at.clone().addScaledVector(dir, 34).addScaledVector(side, 26).setY(at.y + 24),
        H.clone().addScaledVector(side, 22).setY(H.y + 18),
        H.clone(),
      ];
    } else {
      dir = new THREE.Vector3(m.dir, 0, 0);
      const yl = 41;
      pts = [
        H.clone(),
        H.clone().add(new THREE.Vector3(m.dir * -10, 12, 6)),
        at.clone().addScaledVector(dir, -38).setY(yl + 8).setZ(at.z + 6),
        at.clone().addScaledVector(dir, -14).setY(yl).setZ(at.z + 1.5),
        at.clone().addScaledVector(dir, 14).setY(yl).setZ(at.z + 1.5),
        at.clone().addScaledVector(dir, 38).setY(yl + 10).setZ(at.z + 8),
        at.clone().addScaledVector(dir, 30).setY(yl + 16).setZ(H.z + 10),
        H.clone().add(new THREE.Vector3(0, 14, 4)),
        H.clone(),
      ];
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    this.ds = { m, at, dir, curve, t: 0, dur: len / STRAFE_SPEED, home: m.home, done: false, tick: 0, prev: H.clone(), yaw: Dg.D.root.rotation.y, pitch: 0, roll: 0, said: false };
    Dg.mode = 'asedio';
    Dg.D.setPose('fly', 0.6);
    Dg.fire?.roar?.(H);
    g.ee?.cueva?.whistle?.(1.2);
  }

  updateStrafe(dt, host) {
    const g = this.g;
    const S = this.ds;
    if (!S) return;
    const Dg = this.egg.dragon;
    const D = Dg.D;
    S.t += dt;
    const u = Math.min(1, S.t / S.dur);
    const p = S.curve.getPointAt(u, tmpA);
    // hacia dónde mira: por donde va, inclinado en las curvas
    tmpB.subVectors(p, S.prev).divideScalar(Math.max(dt, 1e-3));
    S.prev.copy(p);
    const hs = Math.hypot(tmpB.x, tmpB.z);
    let yawRate = 0;
    if (hs > 0.5) {
      let dy = Math.atan2(tmpB.x, tmpB.z) - S.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const step = dy * Math.min(1, dt * 6);
      S.yaw += step;
      yawRate = step / Math.max(dt, 1e-3);
    }
    S.pitch += (THREE.MathUtils.clamp(-Math.atan2(tmpB.y, Math.max(hs, 1)), -0.9, 0.9) - S.pitch) * Math.min(1, dt * 5);
    S.roll += (THREE.MathUtils.clamp(-yawRate * 1.6, -0.7, 0.7) - S.roll) * Math.min(1, dt * 3);
    D.root.position.copy(p);
    D.root.quaternion.setFromEuler(tmpE.set(S.pitch, S.yaw, S.roll, 'YXZ'));
    D.root.visible = true;
    // el fuego: sobre el blanco
    const s = tmpC.subVectors(p, S.at).dot(S.dir);
    const spit = u < 0.7 && s > (S.m.k === 'cat' ? -16 : -16) && s < (S.m.k === 'cat' ? 3 : 16);
    D.open(spit ? 1 : 0);
    if (spit) {
      D.root.updateMatrixWorld(true);
      const mouth = D.mouthPos(tmpD);
      const f = S.m.k === 'cat' ? tmpB.copy(S.at).setY(S.at.y + 1) : tmpB.set(p.x + S.dir.x * 5, g.world.floorAt(p.x + S.dir.x * 5, S.at.z), S.at.z);
      if (!S.looked) {
        S.looked = true;
        D.look(f);
      }
      Dg.fire?.breathe(mouth, f, dt, true);
      if (host) {
        S.tick -= dt;
        if (S.tick <= 0) {
          S.tick = 0.2;
          for (const { z } of g.zombies.inRadius(f, 3.8, near)) g.zombies.damage(z, z.boss ? z.maxHp * 0.03 : z.maxHp * 0.8 + 1, { type: z.boss ? 'scald' : 'burn', point: tmpC.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z).clone(), noPoints: true });
        }
        if (S.m.k === 'cat' && !S.done && s > 0) {
          S.done = true;
          this.destroyCat(S.m.i, 'dragon');
        }
      }
    }
    if (u >= 1) this.endStrafe();
  }

  endStrafe() {
    const Dg = this.egg.dragon;
    const S = this.ds;
    this.ds = null;
    if (!Dg || !S) return;
    Dg.D.look(null);
    Dg.D.open(0);
    if (Dg.mode === 'asedio') {
      Dg.mode = S.home;
      Dg.place(S.home);
      Dg.D.setPose('stand', 0.8);
    }
  }

  // ---------------- el final ----------------
  // (anfitrión) Cayó el comandante: se levanta el asedio.
  win() {
    const g = this.g;
    if (this.phase === 'won') return;
    this.phase = 'won';
    this.wonT = 0;
    const R = g.rounds;
    if (R) R.toSpawn = 0;
    this.dropRam();
    for (const L of this.ladders) {
      if (L.st !== 'up' && L.st !== 'rise' && L.st !== 'burn') continue;
      this.fallLadder(L, 'push');
      g.net?.event('ee', { ase: 'lf', i: L.i, k: 'push' });
    }
    const G = this.gate;
    const intact = !G.brokeOnce;
    const pts = 500 + (intact ? 1000 : Math.round(G.hp * 600)) + this.stats.ladders * 40 + this.stats.cats * 200;
    const pups = intact ? 3 : G.mode === 'down' && G.hp > 0.4 ? 2 : 1;
    const res = [pts, intact ? 1 : 0, this.stats.cats, this.stats.ladders];
    g.net?.event('ee', { ase: 'win', r: res });
    this.winFx(res);
    for (let k = 0; k < pups; k++) g.later(1.5 + k * 0.6, () => g.powerups.drop(new THREE.Vector3(48.5 + k * 3.5, 24, 54.5), true));
    if (intact) {
      this.chest.on = true;
      this.chest.round = R?.round || 0;
      this.chest.opened.clear();
      this.chest.mine = false;
      this.chest.open = 0;
    }
    this.egg.say('fierro', LINES.won, 2);
    this.dirty = true;
    this.sync(true);
  }

  winFx([pts, intact]) {
    const g = this.g;
    this.phase = 'won';
    g.addPoints(pts, null, true);
    g.hud.toast(intact ? `¡Rastrillo entero! +${pts} y el Cofre del botín` : `¡Se levantó el asedio! +${pts}`);
    announce(g, '', 4, true);
    this.bell(BELL_END, 0.2);
    this.belled = true;
    this.retreat();
    this.cardWin();
  }

  // (todas) Termina: vuelve el cielo, el rastrillo como estaba, se apaga todo.
  finish() {
    const g = this.g;
    const host = isHost(g);
    if (!this.active) return;
    if (!this.belled) this.bell(BELL_END, 0.1);
    this.belled = false;
    this.active = false;
    this.phase = 'off';
    this.done++;
    this.endStrafe();
    for (const L of this.ladders) {
      L.st = 'off';
      L.group.visible = false;
      this.ladderLook(L, false);
    }
    this.ram.on = false;
    this.ram.st = 'off';
    this.ram.group.visible = false;
    for (const B of this.boulders) {
      B.on = false;
      B.mesh.visible = B.glow.visible = false;
    }
    for (const W of this.warns) W.on = false;
    const G = this.gate;
    G.iceT = 0;
    G.ice.visible = false;
    if (G.door) G.door.def.locked = G.lock0;
    // como estaba antes: abierto si lo habían comprado; si no, cerrado (arreglado)
    const want = G.wasOpen ? 'up' : 'down';
    if (G.mode !== want) this.setGateMode(want);
    else this.gateSolid(want === 'down', true);
    // (el que quedó en la barbacana con el rastrillo cerrado, al patio)
    const pp = g.player.pos;
    if (want === 'down' && g.world.zoneAt(pp.x, pp.z, pp.y) === 'L') {
      pp.set(52, g.world.floorAt(52, 60.6), 60.6);
      g.player.vel?.set(0, 0, 0);
    }
    G.hp = 1;
    this.gateAnim = 4;
    for (const W of this.warns) W.ring.visible = W.fill.visible = W.shadow.visible = false;
    for (const P of this.patches) {
      P.on = false;
      P.s.visible = false;
    }
    for (const X of this.blasts) {
      X.on = false;
      X.flash.visible = X.wave.visible = false;
    }
    if (g.weather?.name === 'asedio') {
      g.weather.name = '';
      g.weather.timer = 0;
      g.weather.set('clear', false);
    }
    this.hudOn(false);
    if (host) {
      // (los muertos que quedaron en la escalera o cargando: sueltos)
      for (const z of g.zombies.pool) if (z.active && !z.dead && z.asId === z.id && (z.state === 'ladder' || z.state === 'ram')) this.release(z);
      this.egg.asedioOver?.();
      this.sync(true);
    }
  }

  // ---------------- el cofre ----------------
  // (anfitrión) Alguien abre el cofre: lo de adentro sale en su compu.
  openChest(id) {
    const g = this.g;
    const C = this.chest;
    if (!isHost(g) || !C.on || C.opened.has(id)) return false;
    C.opened.add(id);
    if (id === myId(g)) this.loot();
    else g.net?.event('ee', { ase: 'loot', id });
    g.net?.event('ee', { ase: 'co' });
    this.chestFx();
    // abierto por todos: se va
    if (players(g).every((p) => C.opened.has(p.id))) g.later(4, () => this.chestOff());
    this.dirty = true;
    return true;
  }

  chestFx() {
    const g = this.g;
    const C = this.chest;
    C.open = Math.max(C.open, 0.001);
    const p = tmpA.copy(C.at).setY(C.at.y + 0.8);
    g.fx.sparkle(p, [1, 0.85, 0.35], 40, 1.2);
    g.fx.flash(p, 0xffd060, 24, 0.5, 8);
    for (let k = 0; k < 24; k++) g.fx.add.spawn(p.x, p.y, p.z, R2() * 2, 3 + Math.random() * 3, R2() * 2, { color: [1, 0.8, 0.3], size: 0.06, life: 1.2, gravity: 9, bounce: 0.5 });
    g.audio.boxOpen?.(p);
  }

  chestOff() {
    const C = this.chest;
    if (!C.on) return;
    C.on = false;
    this.dirty = true;
    if (isHost(this.g)) this.sync(true);
  }

  // Lo que le toca a este jugador: un perk que le falte (o un mate de la caja) y munición.
  loot() {
    const g = this.g;
    const C = this.chest;
    if (C.mine) return;
    C.mine = true;
    const W = g.weapons;
    const p = g.player;
    const miss = [...new Set(PERK_SPOTS.map((x) => x.perk))].filter((id) => PERKS[id] && !p.perks.has(id));
    g.audio.powerupGrab?.();
    g.addPoints(500, null, true);
    if (miss.length) {
      const id = miss[Math.floor(Math.random() * miss.length)];
      W.drink(PERKS[id].color, () => {
        p.givePerk(id);
        W.maxAmmo?.();
        W.updateHud?.();
      });
      g.audio.perkJingle?.(id, p.pos);
      g.hud.toast(`Cofre del botín: ${PERKS[id].name} gratis`);
      return;
    }
    const id = this.pickWeapon();
    if (id) {
      W.give(id);
      g.hud.toast(`Cofre del botín: ${WEAPONS[id].name}`);
    } else g.hud.toast('Cofre del botín: +500');
    W.maxAmmo?.();
    W.updateHud?.();
  }

  pickWeapon() {
    const g = this.g;
    const map = g.mapId;
    const have = new Set(g.weapons.slots.map((s) => s.id));
    const list = BOX_POOL.filter((w) => (!w.only || w.only.includes(map)) && !have.has(w.id) && WEAPONS[w.id].kind !== 'tactical' && WEAPONS[w.id].kind !== 'elemental');
    let r = Math.random() * list.reduce((a, w) => a + boxWeight(w, map), 0);
    for (const w of list) {
      r -= boxWeight(w, map);
      if (r <= 0) return w.id;
    }
    return list[0]?.id || null;
  }

  updateChest(dt) {
    const C = this.chest;
    const g = this.g;
    const vis = C.on;
    C.m.root.visible = vis;
    C.glow.visible = vis;
    if (!vis) return;
    this.root.visible = true;
    if (C.open > 0) C.open = Math.min(1, C.open + dt * 2.5);
    C.m.lid.rotation.x = -smooth(C.open) * 1.9;
    C.m.coins.visible = C.open > 0;
    C.glow.material.opacity = 0.45 + Math.sin(g.time * 3) * 0.15 + C.open * 0.3;
    if (Math.random() < dt * 4) g.fx.sparkle(tmpA.copy(C.at).setY(C.at.y + 0.7 + Math.random() * 0.5), [1, 0.85, 0.4], 1, 1.2);
  }

  // ---------------- los mates de la luz ----------------
  // (CastleEgg.onElemental) Donde pegó un mate (cargado o no).
  onElemental(el, pos, charged) {
    if (!this.active || this.phase === 'won' || !pos) return;
    if (el === 'fuego') {
      const L = this.ladderNear(pos, charged ? 3.6 : 2);
      if (L) this.ask({ k: 'fire', i: L.i, c: charged ? 1 : 0 });
    } else if (el === 'viento' && charged) {
      const L = this.ladderNear(pos, 3.2);
      if (L) this.ask({ k: 'wind', i: L.i, c: 1 });
    } else if (el === 'hielo') {
      if (pos.x > 49 && pos.x < 55 && pos.z > 61.2 && pos.z < 68.5 && pos.y > 19 && pos.y < 30) this.ask({ k: 'ice', c: charged ? 1 : 0 });
    }
  }

  // (CastleEgg.onBlast) El soplido del Zonda sin cargar: empuja las escaleras.
  onBlast(o, d, range, angle) {
    if (!this.active || this.phase === 'won') return;
    const cos = Math.cos(angle + 0.12);
    for (const L of this.ladders) {
      if (L.st !== 'up' && L.st !== 'burn') continue;
      let hit = false;
      for (let k = 0.55; k <= 1.001 && !hit; k += 0.15) {
        this.ladderPoint(L, L.len * k, 0, tmpA);
        tmpB.subVectors(tmpA, o);
        const dist = tmpB.length();
        if (dist < range + 1 && tmpB.dot(d) / (dist || 1) > cos) hit = this.g.world.clear(o, tmpA);
      }
      if (hit) this.ask({ k: 'wind', i: L.i, c: 0 });
    }
  }

  // (CastleEgg.onShot) El rayo de Illapa sin cargar, sin muerto adelante: a una catapulta.
  onShot(o, d, maxT) {
    if (!this.active || this.phase === 'won' || this.g.weapons.slot?.id !== 'illapa') return;
    // (el parapeto de adelante no corta el rayo: salta por arriba de la almena)
    if (maxT < 3) maxT = 60;
    for (const C of this.cats) {
      if (C.st === 'dead') continue;
      tmpA.subVectors(C.center, o);
      const t = tmpA.dot(d);
      if (t < 0 || t > maxT + 3.5) continue;
      if (tmpA.lengthSq() - t * t > 3.4 * 3.4) continue;
      this.g.fx.lightning(tmpB.copy(o).addScaledVector(d, Math.min(t, maxT) * 0.92), C.center, 0xffe45a, 0.14);
      this.ask({ k: 'zap', i: C.i });
      return;
    }
  }

  // (CastleEgg.onCharged) El Illapa cargado apuntando a una catapulta: llama al rayo.
  onCharged(el, o, d) {
    if (el !== 'rayo' || !this.active || this.phase === 'won') return;
    let best = -1;
    let ba = 0.13;
    for (const C of this.cats) {
      if (C.st === 'dead') continue;
      tmpA.subVectors(C.center, o);
      const dist = tmpA.length();
      if (dist > 130) continue;
      const a = Math.acos(THREE.MathUtils.clamp(tmpA.dot(d) / dist, -1, 1));
      if (a < ba) {
        ba = a;
        best = C.i;
      }
    }
    if (best >= 0) this.ask({ k: 'bolt', i: best });
  }

  ladderNear(p, r) {
    let best = null;
    let bd = r;
    for (const L of this.ladders) {
      if (L.st !== 'up' && L.st !== 'rise') continue;
      for (let k = 0; k <= 1.001; k += 0.125) {
        this.ladderPoint(L, L.len * k, 0, tmpA);
        const d = tmpA.distanceTo(p);
        if (d < bd) {
          bd = d;
          best = L;
        }
      }
    }
    return best;
  }

  // Lo decide el anfitrión (el invitado le pide).
  ask(m) {
    const g = this.g;
    if (isHost(g)) this.decide(m, myId(g));
    else g.net.net.send({ t: 'pee', a: 'as', ...m });
  }

  decide(m, from) {
    const g = this.g;
    if (!this.active || this.phase === 'won') return;
    if (m.k === 'fire' || m.k === 'wind') {
      const L = this.ladders[m.i | 0];
      if (!L || (L.st !== 'up' && L.st !== 'rise' && L.st !== 'burn')) return;
      if (m.k === 'fire') {
        if (L.st === 'burn') return;
        L.fire += m.c ? 3 : 1;
        if (L.fire >= 3) this.burnLadder(L);
        else {
          g.net?.event('ee', { ase: 'lh', i: L.i, k: 'fire' });
          this.ladderHitFx(L, 'fire');
        }
      } else {
        L.wind += m.c ? 3 : 1;
        if (L.wind >= 3) this.pushLadder(L.i, from, 'wind');
        else {
          g.net?.event('ee', { ase: 'lh', i: L.i, k: 'wind' });
          this.ladderHitFx(L, 'wind');
        }
      }
    } else if (m.k === 'ice') this.iceGate(!!m.c);
    else if (m.k === 'zap') this.hurtCat(m.i | 0, ZAP, 'zap');
    else if (m.k === 'bolt') {
      const i = m.i | 0;
      if (this.cats[i]?.st === 'dead') return;
      g.later(0.6, () => this.active && this.destroyCat(i, 'rayo'));
    }
  }

  ladderHitFx(L, k) {
    const g = this.g;
    this.ladderPoint(L, L.len * 0.85, 0, tmpA);
    if (k === 'fire') g.fx.fire(tmpA, 0.4, 8);
    else {
      g.fx.blastCone(tmpA, tmpB.set(0, 0.2, 1), 4);
      L.wob = 1;
      this.sfx('creak', L.top);
    }
  }

  onGuest(m, from) {
    if (m.a === 'as') this.decide(m, from);
  }

  // ---------------- red ----------------
  state() {
    const G = this.gate;
    return {
      a: this.active ? 1 : 0,
      ph: this.phase,
      r: this.round,
      l: this.templeLock() ? 1 : 0,
      g: [Math.round(G.hp * 100), GATE_MODE.indexOf(G.mode), Math.round(G.iceT)],
      L: this.ladders.map((L) => LADDER_ST.indexOf(L.st)),
      c: this.cats.map((C) => [Math.round(C.hp * 100), CAT_ST.indexOf(C.st)]),
      k: this.pots.map((K) => [Math.round(K.water * 100), Math.round(K.heat * 100), POT_ST.indexOf(K.st)]),
      n: this.cannons.map((N) => Math.round(N.cd)),
      rm: this.ram.on ? [Math.round(this.ram.cz * 100), this.ram.st === 'drop' ? 2 : this.ram.st === 'batter' ? 1 : 0] : 0,
      ch: this.chest.on ? 1 : 0,
      dr: this.dragonOn ? 1 : 0,
    };
  }

  applyRemote(s) {
    if (!s) return;
    this.lockRemote = !!s.l;
    this.round = s.r || this.round;
    this.dragonOn = !!s.dr;
    if (s.a && !this.active) {
      this.phase = s.ph || 'horns';
      this.startFx();
    }
    if (s.ph) this.phase = s.ph;
    const G = this.gate;
    if (s.g) {
      const hp = s.g[0] / 100;
      if (hp < G.hp - 0.004 && this.active) this.gateHitFx('z');
      G.hp = hp;
      const mode = GATE_MODE[s.g[1]];
      if (mode && mode !== G.mode && this.active) {
        if (mode === 'broken') this.breakFx();
        this.setGateMode(mode);
      }
      if (s.g[2] > G.iceT + 1) G.iceT = s.g[2];
    }
    s.L?.forEach((st, i) => {
      const L = this.ladders[i];
      const name = LADDER_ST[st];
      if (!L || !name || name === L.st) return;
      // (las caídas y los fuegos llegan con su evento; acá, lo que falte)
      if (name === 'rise' || (name === 'up' && L.st === 'off')) {
        L.st = name;
        L.t = 0;
        if (name === 'up') L.phi = L.phi0;
        this.ladderLook(L, false);
      } else if (name === 'off' && L.st !== 'drop' && L.st !== 'fall') {
        L.st = 'off';
        L.group.visible = false;
      }
    });
    s.c?.forEach(([hp, st], i) => {
      const C = this.cats[i];
      if (!C) return;
      C.hp = hp / 100;
      if (CAT_ST[st] === 'dead' && C.st !== 'dead') this.catDead(C, 'canon');
    });
    s.k?.forEach(([w, h, st], i) => {
      const K = this.pots[i];
      if (!K) return;
      if (K.st !== 'pour') {
        K.water = w / 100;
        K.heat = h / 100;
        K.st = POT_ST[st] || K.st;
      }
    });
    s.n?.forEach((cd, j) => {
      const N = this.cannons[j];
      if (N && N.fuse < 0 && N.fly < 0) N.cd = cd;
    });
    const R = this.ram;
    if (s.rm) {
      if (!R.on) {
        R.on = true;
        R.drop = 0;
        R.t = 0;
      }
      R.cz += (s.rm[0] / 100 - R.cz) * 0.5;
      const st = s.rm[1] === 2 ? 'drop' : s.rm[1] === 1 ? 'batter' : 'walk';
      if (st !== R.st) {
        if (st === 'drop') this.dropRam();
        else {
          R.st = st;
          R.t = 0;
        }
      }
    } else if (R.on && !this.active) R.on = false;
    const C = this.chest;
    if (!!s.ch !== C.on) {
      C.on = !!s.ch;
      if (C.on) {
        C.mine = false;
        C.open = 0;
      }
    }
    if (!s.a && this.active) this.finish();
  }

  // Los golpes de efecto del anfitrión (invitados).
  onEvent(m) {
    const g = this.g;
    const k = m.ase;
    if (k === 'start') {
      if (!this.active) {
        this.phase = 'horns';
        this.startFx();
      }
    } else if (k === 'cw') {
      const C = this.cats[m.i];
      if (C && C.st !== 'dead') this.catWind(C);
    } else if (k === 'cf') {
      const C = this.cats[m.i];
      if (C && C.st !== 'dead') {
        if (C.st !== 'load') {
          C.rock.visible = true;
          C.theta = ARM_COCK;
        }
        this.catFire(C, m.to);
      }
    } else if (k === 'cx') {
      const C = this.cats[m.i];
      if (C && C.st !== 'dead') this.catDead(C, m.k);
    } else if (k === 'ch') {
      const C = this.cats[m.i];
      if (C) this.catHitFx(C, m.k);
    } else if (k === 'cn') {
      const N = this.cannons[m.j];
      if (N) this.cannonGo(N, m.i);
    } else if (k === 'lr') {
      const L = this.ladders[m.i];
      if (L) {
        L.st = 'rise';
        L.t = 0;
        this.ladderLook(L, false);
      }
    } else if (k === 'lf') {
      const L = this.ladders[m.i];
      if (L && L.st !== 'fall' && L.st !== 'drop') this.fallLadder(L, m.k);
    } else if (k === 'lb') {
      const L = this.ladders[m.i];
      if (L) {
        L.st = 'burn';
        L.t = 0;
        this.ladderLook(L, true);
      }
    } else if (k === 'lh') {
      const L = this.ladders[m.i];
      if (L) this.ladderHitFx(L, m.k);
    } else if (k === 'po') {
      const K = this.pots[m.i];
      if (K) this.pour(K, m.by);
    } else if (k === 'rh') this.gateHitFx(m.k);
    else if (k === 'gb') {
      if (this.gate.mode !== 'broken') {
        this.breakFx();
        this.setGateMode('broken');
      }
    } else if (k === 'gi') this.iceFx(!!m.c);
    else if (k === 'rd') this.dropRam();
    else if (k === 'ds') this.strafeGo(m);
    else if (k === 'cmd') {
      this.phase = 'cmd';
      this.horns(0, 0.7);
    } else if (k === 'win') this.winFx(m.r);
    else if (k === 'loot') {
      if (m.id === myId(g)) this.loot();
    } else if (k === 'co') this.chestFx();
  }

  sync(force = false) {
    const g = this.g;
    if (!g.net?.host || (!force && !this.dirty)) return;
    this.dirty = false;
    this.syncT = 0.25;
    g.net.event('ee', { as: this.state() });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const host = isHost(g);
    this.updateChest(dt);
    this.updateHud(dt);
    // (el rastrillo vuelve a como estaba después del asedio)
    if (!this.active && this.gateAnim > 0) {
      this.gateAnim -= dt;
      this.updateGate(dt);
    }
    if (!this.active && !this.root.visible) return;
    if (!this.active) {
      // después del asedio: las catapultas y los estandartes se van con el humo
      this.fadeOut(dt);
      this.updateChunks(dt);
      return;
    }
    this.t += dt;
    if (host) this.hostStep(dt);
    for (const L of this.ladders) this.updateLadder(L, dt, host);
    for (const C of this.cats) this.updateCat(C, dt, host);
    for (const K of this.pots) this.updatePot(K, dt, host);
    for (const N of this.cannons) this.updateCannon(N, dt, host);
    this.updateRam(dt, host);
    this.updateBoulders(dt, host);
    this.updateWarns(dt);
    this.updatePatches(dt, host);
    this.updateBlasts(dt);
    this.updateChunks(dt);
    this.updateStrafe(dt, host);
    this.updateGate(dt);
    this.updateSky(dt);
    if (host) {
      this.syncT -= dt;
      if (this.syncT <= 0) this.sync();
    }
  }

  hostStep(dt) {
    const g = this.g;
    const R = g.rounds;
    if (this.phase === 'horns' && this.t > START_T) {
      this.phase = 'battle';
      this.dirty = true;
    }
    // los que trepan y se murieron en la escalera caen al piso
    for (const z of g.zombies.pool) {
      if (!z.active || !z.dead || z.asId !== z.id || z.asRole !== 'climb') continue;
      const ground = g.world.floorAt(z.pos.x, z.pos.z, z.pos.y + 0.3);
      if (z.state === 'flung') {
        z.baseY = ground;
        continue;
      }
      if (z.pos.y > ground + 0.02) {
        z.asVy = (z.asVy || 0) - 16 * dt;
        z.pos.y = Math.max(ground, z.pos.y + z.asVy * dt);
        z.baseY = z.pos.y;
        if (z.pos.y <= ground) g.fx.dust(z.pos, UP, [0.5, 0.48, 0.46], 4);
      }
    }
    if (this.phase === 'battle') {
      const spawned = R.total ? (R.total - R.toSpawn) / R.total : 1;
      let alive = 0;
      for (const z of g.zombies.pool) if (z.active && !z.dead) alive++;
      if ((spawned >= CMD_AT && this.t > CMD_MIN) || this.t > CMD_TIME || (R.toSpawn <= 0 && alive <= 3 && this.t > 25)) this.startCommander();
    }
    if (this.phase === 'cmd') {
      this.cmdT += dt;
      this.updateCommander(dt);
      // (si el comandante se fue por otro lado: igual se levanta)
      const b = this.cmd;
      if (!b || (g.zombies.boss !== b && this.cmdT > 2) || b.dead) this.win();
    }
    if (this.phase === 'won') {
      this.wonT += dt;
      // la horda que quedaba se desarma
      this.killT = (this.killT || 0) - dt;
      if (this.killT <= 0) {
        this.killT = 0.14;
        const z = g.zombies.pool.find((x) => x.active && !x.dead && !x.boss);
        if (z) g.zombies.kill(z, { type: 'nuke', noPoints: true });
      }
      if (this.wonT > 6) this.finish();
      return;
    }
    // el dragón
    if (this.dragonOn && !this.ds && this.phase !== 'horns') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) this.strafeT = this.strafe() ? rnd(28, 36) : 4;
    }
  }

  // El rastrillo: cómo se ve (bajando de golpe, sacudido, arrancado) y el hielo.
  updateGate(dt) {
    const g = this.g;
    const G = this.gate;
    const gr = G.grate;
    if (G.iceT > 0) {
      G.iceT = Math.max(0, G.iceT - dt);
      G.ice.visible = G.mode === 'down';
      const k = Math.min(1, G.iceT / 4);
      G.ice.scale.set(1, Math.max(0.05, k), 1);
      if (Math.random() < dt * 2) g.fx.frost(tmpA.copy(G.front).setY(G.front.y + Math.random() * 3).setZ(G.front.z - 0.8), 2);
    } else G.ice.visible = false;
    if (!gr) return;
    let y = gr.position.y;
    let rx = gr.rotation.x;
    if (G.mode === 'down') {
      // cae de golpe (con la gravedad) y retumba
      if (y > 0) {
        G.vy += 22 * dt;
        y = Math.max(0, y - G.vy * dt);
        if (y <= 0) {
          G.vy = 0;
          if (G.slam) {
            G.slam = false;
            this.sfx('gateSlam', G.front);
            g.fx.dust(tmpA.copy(G.front).setZ(G.front.z - 0.6), UP, [0.45, 0.4, 0.35], 16);
            const d = g.player.pos.distanceTo(G.front);
            if (d < 20) g.fx.addShake(0.4 * (1 - d / 20));
          }
        }
      }
      rx += (0 - rx) * Math.min(1, dt * 8);
    } else if (G.mode === 'up') {
      y = Math.min(G.lift, y + dt * 1.6);
      rx = 0;
    } else {
      // arrancado: se va para adentro y queda en el piso del patio
      G.vy += dt * 6;
      rx = Math.max(-1.42, rx - G.vy * dt);
      y = Math.max(0.02, y - dt * 2);
    }
    gr.position.y = y;
    gr.rotation.x = rx;
    // los golpes lo sacuden
    if (G.hitT > 0) {
      G.hitT = Math.max(0, G.hitT - dt);
      gr.position.x = Math.sin(g.time * 70) * 0.04 * (G.hitT * 3);
    } else gr.position.x = 0;
  }

  // El humo, los estandartes, las fogatas y el cielo.
  updateSky(dt) {
    const g = this.g;
    this.skyK = Math.min(1, this.skyK + dt / 5);
    this.updateStandards(dt, 1);
    this.updateSmoke(dt, this.skyK);
    if (this.batches) for (const b of this.batches) b.sync(g.camera);
    for (const c of this.camps) {
      c.s.scale.setScalar((5 + Math.sin(g.time * 9 + c.x) * 0.6) * this.skyK);
      if (Math.random() < dt * 6) g.fx.fire(tmpA.set(c.x + R2(), c.y + 0.4, c.z + R2()), 0.8, 2);
    }
  }

  fadeOut(dt) {
    this.skyK = Math.max(0, this.skyK - dt / 5);
    this.updateStandards(dt, 0);
    this.updateSmoke(dt, this.skyK);
    if (this.batches) for (const b of this.batches) b.sync(this.g.camera);
    for (const c of this.camps) c.s.scale.setScalar(5 * this.skyK);
    for (const C of this.cats) {
      // se van para atrás, al humo
      C.roll = Math.max(0, C.roll - dt / 5);
      const back = (1 - smooth(C.roll)) * 9;
      C.m.root.position.set(C.x - Math.sin(C.yaw) * back, C.y - (1 - this.skyK) * 3, C.z - Math.cos(C.yaw) * back);
      if (this.skyK <= 0) C.m.root.visible = false;
    }
    for (const K of this.pots) if (this.skyK <= 0) K.m.root.visible = false;
    if (this.skyK <= 0 && !this.chest.on) this.root.visible = false;
  }

  updateStandards(dt, on) {
    const g = this.g;
    const S = this.std;
    let dirty = false;
    this.stdList.forEach((s, i) => {
      const want = on ? (this.t > s.delay ? 1 : 0) : 0;
      if (s.k !== want) {
        s.k = on ? Math.min(want, s.k + dt / 1.2) : Math.max(0, s.k - dt / 2);
        dirty = true;
      }
      const k = smooth(s.k);
      tmpQ.setFromAxisAngle(UP, s.yaw);
      tmpM.compose(tmpA.set(s.x, s.y - (1 - k) * 5.6, s.z), tmpQ, tmpS.set(1, 1, 1));
      if (dirty || k > 0) {
        S.poles.setMatrixAt(i * 2, k > 0 ? tmpM : tmpM.makeScale(0, 0, 0));
        // la antorcha al lado (un palo más corto)
        tmpM.compose(tmpB.set(s.x + Math.cos(s.yaw) * 1.6, s.y - 2.2 - (1 - k) * 4, s.z - Math.sin(s.yaw) * 1.6), tmpQ, tmpS.set(1, 0.62, 1));
        S.poles.setMatrixAt(i * 2 + 1, k > 0 ? tmpM : tmpM.makeScale(0, 0, 0));
        // el paño flamea
        tmpQ.setFromAxisAngle(UP, s.yaw + Math.sin(g.time * 2.1 + s.ph) * 0.3);
        tmpM.compose(tmpA.set(s.x, s.y + 5.2 - (1 - k) * 5.6, s.z), tmpQ, tmpS.set(1, 1, 1));
        S.cloth.setMatrixAt(i, k > 0 ? tmpM : tmpM.makeScale(0, 0, 0));
      }
      const f = S.flames[i];
      f.visible = k > 0.6;
      if (f.visible) {
        f.position.set(s.x + Math.cos(s.yaw) * 1.6, s.y + 1.3, s.z - Math.sin(s.yaw) * 1.6);
        f.scale.setScalar(1.6 + Math.sin(g.time * 11 + s.ph) * 0.25 + Math.random() * 0.15);
      }
    });
    S.poles.instanceMatrix.needsUpdate = true;
    S.cloth.instanceMatrix.needsUpdate = true;
  }

  updateSmoke(dt, k) {
    for (const p of this.smoke) {
      p.t += dt;
      if (p.t > p.life) p.t -= p.life;
      const u = p.t / p.life;
      const s = p.s;
      s.visible = k > 0.01;
      if (!s.visible) continue;
      s.position.set(p.x + u * 6, p.y + u * 26, p.z + u * 2);
      s.scale.setScalar(3 + u * 13);
      s.material.opacity = k * 0.55 * Math.sin(u * Math.PI);
    }
  }

  // ---------------- sonidos ----------------
  // Todo lo del asedio que suena seguido (golpes, piedras, escaleras) y lo
  // largo (cuernos, tambores) se hornea una vez (audio.bakeSound) y se toca con
  // playBuffer: un nodo por golpe en vez de diez (en una compu floja el hilo
  // de audio no daba abasto). Mientras no terminó de hornearse, no suena.
  bakeSfx() {
    const a = this.g.audio;
    if (this.baked || !a?.ctx || !a.bakeSound) return;
    this.baked = true;
    const one = (key, dur, body, takes = 1) => a.bakeSound('as-' + key, dur, function (o) {
      body(this, o);
    }, takes);
    const horn = (f0) => (A, o) => {
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.connect(o);
      for (const [mul, type, gg] of [[1, 'sawtooth', 1], [2, 'sawtooth', 0.5], [3, 'square', 0.14], [1.5, 'sawtooth', 0.2]]) {
        const h = A.hold(lp, { t: 0.02, dur: 2.1, type, freq: f0 * mul, gain: 0.2 * gg, attack: 0.28, release: 0.9 });
        h.o.frequency.setValueAtTime(f0 * mul * 0.9, 0.02);
        h.o.frequency.linearRampToValueAtTime(f0 * mul, 0.42);
      }
      A.noise(lp, { t: 0.02, dur: 2.5, type: 'bandpass', freq: 380, q: 1.2, gain: 0.14, attack: 0.3 });
    };
    one('horn0', 3.2, horn(61.7));
    one('horn1', 3.2, horn(55));
    one('horn2', 3.2, horn(73.4));
    one('retreat', 4, (A, o) => {
      for (const [mul, gg] of [[1, 1], [2, 0.45]]) {
        const h = A.hold(o, { t: 0.02, dur: 2.6, type: 'sawtooth', freq: 73.4 * mul, gain: 0.16 * gg, attack: 0.2, release: 1.2 });
        h.o.frequency.setValueAtTime(73.4 * mul, 0.8);
        h.o.frequency.exponentialRampToValueAtTime(49 * mul, 2.8);
      }
    });
    one('clang', 0.4, (A, o) => {
      A.noise(o, { t: 0.01, dur: 0.12, type: 'bandpass', freq: 2100 + Math.random() * 700, q: 8, gain: 0.6 });
      A.tone(o, { t: 0.01, dur: 0.3, type: 'triangle', freq: 320 + Math.random() * 80, gain: 0.08 });
    }, 3);
    one('ram', 1.4, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.8, freq: 55, freqEnd: 28, gain: 1 });
      A.noise(o, { t: 0.01, dur: 0.7, freq: 800, freqEnd: 80, gain: 0.9, brown: true });
      A.noise(o, { t: 0.01, dur: 0.4, type: 'bandpass', freq: 1700, q: 5, gain: 0.5 });
      A.tone(o, { t: 0.01, dur: 1.2, type: 'triangle', freq: 210, freqEnd: 190, gain: 0.1 });
    });
    one('break', 1.6, (A, o) => {
      A.tone(o, { t: 0.01, dur: 1, freq: 50, freqEnd: 22, gain: 1 });
      for (let i = 0; i < 8; i++) A.noise(o, { t: 0.01 + i * 0.07, dur: 0.25, type: 'bandpass', freq: 1500 + ((i * 997) % 1500), q: 6, gain: 0.5 });
      A.noise(o, { t: 0.01, dur: 1.2, freq: 1200, freqEnd: 90, gain: 0.8, brown: true });
    });
    one('gateSlam', 1, (A, o) => {
      for (let i = 0; i < 6; i++) A.noise(o, { t: 0.01 + i * 0.05, dur: 0.06, type: 'bandpass', freq: 3500 + i * 200, q: 6, gain: 0.4 });
      A.tone(o, { t: 0.32, dur: 0.6, freq: 75, freqEnd: 35, gain: 0.9 });
      A.noise(o, { t: 0.32, dur: 0.3, type: 'bandpass', freq: 1500, q: 3, gain: 0.6 });
    });
    one('thud', 0.6, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.4, freq: 70, freqEnd: 34, gain: 0.9 });
      A.noise(o, { t: 0.01, dur: 0.25, freq: 900, freqEnd: 120, gain: 0.5, brown: true });
    });
    one('slam', 0.4, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.25, freq: 140, freqEnd: 70, gain: 0.6 });
      A.noise(o, { t: 0.01, dur: 0.18, type: 'bandpass', freq: 1200, q: 2, gain: 0.5 });
    });
    one('creak', 0.8, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.6, type: 'sawtooth', freq: 180, freqEnd: 120, gain: 0.08 });
      A.noise(o, { t: 0.01, dur: 0.5, type: 'bandpass', freq: 600, q: 4, gain: 0.3 });
    });
    one('gust', 1.2, (A, o) => A.noise(o, { t: 0.01, dur: 1, type: 'bandpass', freq: 500, freqEnd: 1400, q: 0.7, gain: 0.6, attack: 0.1 }));
    one('crash', 1.4, (A, o) => {
      for (let i = 0; i < 6; i++) A.noise(o, { t: 0.4 + i * 0.09, dur: 0.2, type: 'bandpass', freq: 400 + ((i * 331) % 900), q: 2, gain: 0.5 });
      A.tone(o, { t: 0.4, dur: 0.5, freq: 60, freqEnd: 30, gain: 0.6 });
    });
    one('crackle', 0.5, (A, o) => {
      for (let i = 0; i < 5; i++) A.noise(o, { t: 0.01 + i * 0.08, dur: 0.03, type: 'highpass', freq: 2500, gain: 0.4 });
    });
    one('whistle', 1.4, (A, o) => {
      A.noise(o, { t: 0.01, dur: 1.3, type: 'bandpass', freq: 2400, freqEnd: 500, q: 6, gain: 0.35, attack: 0.4 });
      A.tone(o, { t: 0.01, dur: 1.3, type: 'sine', freq: 1500, freqEnd: 380, gain: 0.05, attack: 0.5 });
    });
    one('ratchet', 2.6, (A, o) => {
      for (let i = 0; i < 18; i++) A.noise(o, { t: 0.01 + i * 0.14, dur: 0.04, type: 'bandpass', freq: 1800 + (i % 2) * 400, q: 5, gain: 0.5 });
    });
    one('release', 0.6, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.3, freq: 90, freqEnd: 40, gain: 0.8 });
      A.noise(o, { t: 0.01, dur: 0.5, type: 'bandpass', freq: 500, freqEnd: 1600, q: 1, gain: 0.5 });
    });
    one('ignite', 0.9, (A, o) => A.noise(o, { t: 0.01, dur: 0.8, type: 'bandpass', freq: 700, freqEnd: 1800, q: 0.8, gain: 0.5, attack: 0.05 }));
    one('rumble', 1.4, (A, o) => A.noise(o, { t: 0.06, dur: 1.2, freq: 600, freqEnd: 60, gain: 0.7, brown: true }));
    one('pour', 0.35, (A, o) => A.noise(o, { t: 0.01, dur: 0.3, type: 'bandpass', freq: 1100, q: 3, gain: 0.5 }));
    one('scald', 2.2, (A, o) => {
      A.noise(o, { t: 0.2, dur: 1.8, type: 'highpass', freq: 2500, gain: 0.45, attack: 0.2 });
      A.noise(o, { t: 0.2, dur: 1.6, type: 'bandpass', freq: 600, q: 0.8, gain: 0.5, attack: 0.15 });
    });
    one('fuse', 0.7, (A, o) => A.noise(o, { t: 0.01, dur: 0.6, type: 'highpass', freq: 3000, gain: 0.4 }));
    one('cannon', 1.2, (A, o) => {
      A.tone(o, { t: 0.01, dur: 0.9, freq: 60, freqEnd: 25, gain: 1 });
      A.noise(o, { t: 0.01, dur: 0.5, freq: 2400, freqEnd: 200, gain: 0.6 });
    });
  }

  // Un sonido horneado (en `when` segundos desde ahora).
  play(key, pos, { gain = 1, reverb = 0.4, ref = 8, when = 0, rate = 1 } = {}) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.('as-' + key);
    if (!buf) return;
    a.playBuffer(buf, { pos, gain, reverb, ref, when: when ? a.now + when : 0, rate });
  }

  // Cuernos de guerra desde el valle (tres, de lugares distintos).
  horns(delay, k) {
    const from = [[20, 30, 120], [84, 30, 116], [52, 26, 140]];
    from.forEach((p, i) => this.play('horn' + i, tmpA.set(p[0], p[1], p[2]), { gain: 1.5 * k, reverb: 0.95, ref: 60, when: delay + i * 1.7 + 0.01 }));
  }

  // La retirada: el cuerno que baja y se va.
  retreat() {
    this.play('retreat', tmpA.set(52, 26, 135), { gain: 1.2, reverb: 0.95, ref: 60, when: 1.6 });
  }

  // Las campanas grabadas del asedio (core/audio.js las baja al arrancar): sin
  // lugar, se oyen en todo el castillo. Si todavía no bajaron, no suenan.
  bell(id, when = 0) {
    this.g.audio?.eventSfx?.(id, { gain: 1, reverb: 0.45, when });
  }

  // (Zombies/music: en el asedio no va la de pelea del jefe de ronda: va la suya)
  get quiet() {
    return this.active;
  }

  // La música de la batalla (en cada compu): entra después de los tres
  // campanazos y se va cuando se levanta el asedio (ahí suena la última campana).
  music() {
    const g = this.g;
    if (!this.active || this.phase === 'won') return;
    // (G.ee.asedio === this: al reiniciar la partida el asedio es otro y esta se va)
    g.music?.play(MUSIC, { loop: true, fadeIn: 1.2, while: (G) => this.active && this.phase !== 'won' && G.ee?.asedio === this && (G.state === 'playing' || G.state === 'paused') });
  }

  sfx(kind, pos, k = 1) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    if (kind === 'boom') {
      a.explosion(pos, 1.2 * k, 'porongo-explosion');
      this.play('rumble', pos, { gain: 0.8 * k, reverb: 0.6 });
    } else if (kind === 'cannon') {
      a.explosion(pos, 1.3);
      this.play('cannon', pos, { gain: 1.3, reverb: 0.8, ref: 16 });
    } else {
      const V = SFX[kind];
      if (V) this.play(kind, pos, { gain: V[0] * k, reverb: V[1], ref: V[2], rate: kind === 'clang' ? 0.9 + Math.random() * 0.2 : 1 });
    }
  }

  // ---------------- el cartel ----------------
  buildHud() {
    const g = this.g;
    if (!g.hud?.root) return;
    const cat = '<svg viewBox="0 0 24 16"><path d="M2 13h20M5 13l2-4h10l2 4M12 9 6 2M5 1.6a1.6 1.6 0 1 0 0.01 0"/></svg>';
    const lad = '<svg viewBox="0 0 10 16"><path d="M2 1v14M8 1v14M2 4h6M2 8h6M2 12h6"/></svg>';
    const el = document.createElement('div');
    el.className = 'mdu-asedio';
    el.innerHTML =
      '<b>El Asedio</b>' +
      '<div class="as-gate"><i class="as-grate"></i><span class="as-bar"><s></s></span></div>' +
      `<div class="as-row"><span class="as-cats">${cat}${cat}${cat}</span><span class="as-lads">${lad}${lad}${lad}${lad}</span></div>` +
      '<small></small>';
    g.hud.root.appendChild(el);
    const card = document.createElement('div');
    card.className = 'mdu-asedio-card';
    card.innerHTML = '<b>El Asedio</b><span>El Chiquitijuein sitia el castillo</span>';
    g.hud.root.appendChild(card);
    this.hud = { el, card, bar: el.querySelector('.as-bar s'), gate: el.querySelector('.as-gate'), cats: [...el.querySelectorAll('.as-cats svg')], lads: [...el.querySelectorAll('.as-lads svg')], line: el.querySelector('small'), key: '' };
  }

  hudOn(on) {
    this.hud?.el.classList.toggle('is-on', on);
  }

  card() {
    const c = this.hud?.card;
    if (!c) return;
    c.querySelector('b').textContent = 'El Asedio';
    c.querySelector('span').textContent = 'El Chiquitijuein sitia el castillo';
    c.classList.remove('is-on');
    void c.offsetWidth;
    c.classList.add('is-on');
  }

  cardWin() {
    const c = this.hud?.card;
    if (!c) return;
    c.querySelector('b').textContent = 'El castillo resiste';
    c.querySelector('span').textContent = 'Se levantó el asedio';
    c.classList.remove('is-on');
    void c.offsetWidth;
    c.classList.add('is-on');
  }

  updateHud(dt) {
    const h = this.hud;
    if (!h) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.12;
    if (!this.active) return;
    const G = this.gate;
    const broken = G.mode === 'broken';
    const hp = broken ? 0 : G.hp;
    h.bar.style.width = `${Math.round(hp * 100)}%`;
    h.gate.classList.toggle('is-broken', broken);
    h.gate.classList.toggle('is-ice', G.iceT > 0 && !broken);
    h.gate.classList.toggle('is-hit', G.hitT > 0);
    this.cats.forEach((C, i) => h.cats[i]?.classList.toggle('is-dead', C.st === 'dead'));
    this.ladders.forEach((L, i) => h.lads[i]?.classList.toggle('is-up', L.st === 'rise' || L.st === 'up' || L.st === 'burn'));
    const txt = this.phase === 'cmd' ? 'El Caballero Negro y el ariete' : this.phase === 'won' ? 'Se levanta el asedio' : broken ? 'Rompieron el rastrillo' : '';
    if (txt !== h.key) {
      h.key = txt;
      h.line.textContent = txt;
    }
  }

  dispose() {
    this.endStrafe();
    const G = this.gate;
    if (G?.door && this.active) G.door.def.locked = G.lock0;
    // (la música del asedio se va sola: su while mira active)
    this.active = false;
    this.hud?.el.remove();
    this.hud?.card.remove();
    this.hud = null;
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
  }

  // ---------------- prueba ----------------
  // Alt+I (y los tests): el asedio ya, en la ronda que sea (o con la que viene).
  debugStart() {
    const g = this.g;
    if (!isHost(g) || this.active) return;
    const R = g.rounds;
    if (R.state === 'active' && !R.dogs) this.start(R);
    else this.early = true;
  }
}
