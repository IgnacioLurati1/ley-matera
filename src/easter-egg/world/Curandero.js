import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { ATTIC } from './Attic';
import { zombieHealth } from '../config/rules';
import { RISERS } from '../config/map';
import { fireflies } from '../fx/Fireflies';
import Encierro, { missingIn, missingText } from '../entities/Encierro';
import { buildMate } from '../weapons/viewmodels';

// La mesa del curandero, arriba en el altillo, y las tres piezas del Mate de
// la Luz Mala. Cada pieza tiene su prueba (las piezas son del equipo):
//  · La calabaza de la Salamanca está en un rincón de la capilla, vacía: se
//    llena con almas de muertos que caen cerca.
//  · La bombilla del finado la tiene un peón muerto que aguanta mucho (el
//    Finado): desde la ronda 4 sale de la tierra una vez por ronda, al rato
//    de arrancar, y la suelta cuando cae (siempre del lado de adentro).
//  · La yerba de luna llena está en el acopio: al agarrarla se cierra el
//    acopio (encierro, tienen que estar todos) y hay que aguantar.
// Con las tres, cada jugador arma el suyo en la mesa (si se muere, lo vuelve a
// armar). El mate hace falta para el cementerio del easter egg: las almas de
// las tumbas solo las junta la luz mala.
// En línea lo lleva el anfitrión: reparte el estado con el evento 'ee' ({ lm }).

const PARTS = [
  { id: 'calabaza', name: 'Calabaza de la Salamanca' },
  { id: 'bombilla', name: 'Bombilla del finado' },
  { id: 'yerba', name: 'Yerba de luna llena' },
];
// la calabaza vacía, en el rincón de la capilla, y cuántas almas le entran
const CAL = { x: 54.3, z: 30.3, r: 5, need: 10, perPlayer: 3 };
// la yerba de luna llena, en el acopio (en el piso libre entre el camión y los
// pallets: en x 14 quedaba adentro de la cabina), y cuánto dura su encierro
const YER = { x: 18, z: 9.5, dur: 45 };
// el Finado: desde qué ronda, cuánto tarda en salir después de que arranca la ronda y cuánto aguanta
const FIN = { round: 4, delay: [8, 20], retry: 10, hp: 7 };
const BENCH = { x: 48.5, z: 45.1 };
const CRAFT_TIME = 1.4;
export const LUZ_WEAPON = 'luzmala';

const tmpV = new THREE.Vector3();

export default class Curandero {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.parts = {};
    // la calabaza: hungry (junta almas) → full (se puede agarrar)
    this.cal = 'hungry';
    this.calSouls = 0;
    // la bombilla: none → guard (la tiene el Finado) → floor (tirada)
    this.bomb = 'none';
    this.fin = null;
    this.finNet = -1;
    this.finT = 0;
    this.finRound = 0;
    this.bombAt = new THREE.Vector3();
    // la yerba: idle → enc (encierro del acopio) → (tomada)
    this.yer = 'idle';
    this.yerT = 0;
    // a quién se le dio recién el mate (hasta que llegue su aviso)
    this.claims = new Map();
    this.claim = null;
    this.encG = new Encierro(game, { zone: 'G', color: 0x8aff6a, place: 'el acopio' });
    this.buildParts();
    this.buildBench();
  }

  mats() {
    if (this.M) return this.M;
    const T = this.g.textures;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
    this.M = {
      gourd: std({ map: T.gourd, color: 0x5a3a24 }),
      gourdFull: std({ map: T.gourd, color: 0x5a3a24, emissive: 0x3aff4a, emissiveIntensity: 0 }),
      silver: std({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }),
      yerba: std({ map: T.yerba, color: 0xb8e890, emissive: 0x2a6a1a, emissiveIntensity: 0.8 }),
      cloth: std({ color: 0x3a1a2a }),
      wood: std({ map: T.planksDark, color: 0x8a6a50 }),
      stone: std({ color: 0x6a665e, roughness: 0.95 }),
      candle: std({ color: 0xefe6cc }),
      jar: new THREE.MeshStandardMaterial({ color: 0x9ae07a, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x1a5a14, emissiveIntensity: 0.6 }),
      bone: std({ color: 0xd8ccb0 }),
      flame: new THREE.SpriteMaterial({ map: T.dot, color: 0xffb060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      halo: new THREE.SpriteMaterial({ map: T.dot, color: 0x8aff6a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }),
      ring: new THREE.MeshBasicMaterial({ color: 0x8aff6a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
    return this.M;
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  host() {
    return !this.g.net?.guest;
  }

  // Luciérnagas verdes sobre lo que está para agarrar (sutiles, de cerca).
  beamAt(x, y, z) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    const halo = fireflies(this.g, 0x9aff7a, 1.2);
    halo.position.y = 0.25;
    fx.add(halo);
    // (antes había un haz: lo que le cambiaba la opacidad ya no hace nada)
    fx.userData.beam = { material: { opacity: 0 } };
    this.root.add(fx);
    return fx;
  }

  // ---------------- piezas ----------------
  buildParts() {
    const g = this.g;
    const I = g.interact;
    const M = this.mats();
    for (const def of PARTS) this.parts[def.id] = { def, taken: false };
    // la calabaza, vacía en su piedra del rincón de la capilla
    const calY = g.world.floorAt(CAL.x, CAL.z);
    const cal = new THREE.Group();
    cal.position.set(CAL.x, calY, CAL.z);
    cal.add(mesh(boxGeo(0.5, 0.8, 0.5), M.stone, 0, 0.4, 0));
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M.gourdFull);
    gourd.scale.set(1, 1.15, 1);
    gourd.position.y = 0.95;
    cal.add(gourd);
    cal.add(mesh(cylGeo(0.06, 0.07, 0.03, 14), M.silver, 0, 1.1, 0));
    this.root.add(cal);
    g.world.addBox([CAL.x - 0.25, calY, CAL.z - 0.25, CAL.x + 0.25, calY + 0.8, CAL.z + 0.25], { kind: 'prop' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAL.r - 0.12, CAL.r, 48).rotateX(-Math.PI / 2), M.ring);
    ring.position.set(CAL.x, calY + 0.04, CAL.z);
    this.root.add(ring);
    this.calObj = { g: cal, gourd, ring, top: new THREE.Vector3(CAL.x, calY + 1, CAL.z), fx: this.beamAt(CAL.x, calY + 0.8, CAL.z) };
    I.add({
      kind: 'lmpart',
      pos: new THREE.Vector3(CAL.x, calY + 1, CAL.z),
      radius: 1.9,
      prompt: () => {
        if (this.parts.calabaza.taken) return null;
        if (this.cal === 'full') return { text: 'agarrar la calabaza de la Salamanca (pieza del Mate de la Luz Mala)', noCost: true };
        return { text: `La calabaza de la Salamanca tiene hambre de almas (${this.calSouls} de ${this.calNeed()})`, noCost: true, info: true };
      },
      cost: () => 0,
      use: () => {
        if (this.parts.calabaza.taken || this.cal !== 'full') return false;
        this.takePart('calabaza');
        return true;
      },
    });
    // la bombilla: en el cinto del Finado o tirada donde cayó
    const bomb = new THREE.Group();
    bomb.add(mesh(cylGeo(0.008, 0.008, 0.28, 8), M.silver, 0, 0, 0, 0, 0, Math.PI / 2));
    bomb.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), M.silver, 0.14, 0, 0));
    const glint = new THREE.Sprite(M.halo);
    glint.scale.setScalar(0.5);
    bomb.add(glint);
    bomb.visible = false;
    this.root.add(bomb);
    this.bombObj = bomb;
    this.bombFx = this.beamAt(0, 0, 0);
    this.bombFx.visible = false;
    this.bombIt = I.add({
      kind: 'lmpart',
      pos: new THREE.Vector3(),
      radius: 1.9,
      prompt: () => (this.bomb === 'floor' && !this.parts.bombilla.taken ? { text: 'agarrar la bombilla del finado (pieza del Mate de la Luz Mala)', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.bomb !== 'floor' || this.parts.bombilla.taken) return false;
        this.takePart('bombilla');
        return true;
      },
    });
    // la yerba de luna llena, arriba de unos cajones del acopio
    const yerY = g.world.floorAt(YER.x, YER.z);
    const yer = new THREE.Group();
    yer.position.set(YER.x, yerY, YER.z);
    yer.add(mesh(boxGeo(0.7, 0.5, 0.6), M.wood, 0, 0.25, 0));
    yer.add(mesh(boxGeo(0.55, 0.4, 0.5), M.wood, 0.05, 0.7, 0, 0, 0.3, 0));
    const bag = mesh(boxGeo(0.2, 0.26, 0.12), M.yerba, 0, 1.03, 0);
    yer.add(bag);
    this.root.add(yer);
    g.world.addBox([YER.x - 0.35, yerY, YER.z - 0.3, YER.x + 0.35, yerY + 0.9, YER.z + 0.3], { kind: 'prop' });
    this.yerObj = { g: yer, bag, fx: this.beamAt(YER.x, yerY + 0.9, YER.z) };
    I.add({
      kind: 'lmpart',
      pos: new THREE.Vector3(YER.x, yerY + 1, YER.z),
      radius: 2,
      hold: true,
      holdTime: 1,
      prompt: () => {
        if (this.parts.yerba.taken) return null;
        if (this.yer === 'enc') return { text: `Aguanten: el acopio los tiene encerrados (${Math.max(0, Math.ceil(YER.dur - this.yerT))} s)`, noCost: true, info: true };
        const miss = this.encG.missing();
        if (miss.length) return { text: missingText(miss, 'el acopio'), noCost: true, info: true };
        return { text: 'agarrar la yerba de luna llena (el acopio se va a cerrar)', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        if (this.parts.yerba.taken || this.yer !== 'idle' || missingIn(g, 'G').length) return false;
        this.startYerba();
        return true;
      },
    });
  }

  calNeed() {
    return CAL.need + CAL.perPlayer * (this.players() - 1);
  }

  takePart(id, remote = false) {
    const g = this.g;
    const part = this.parts[id];
    if (!part || part.taken) return;
    part.taken = true;
    g.audio.shell();
    if (!remote) g.net?.event('lmpart', { id });
    const got = this.got();
    g.hud.toast(`Pieza del Mate de la Luz Mala: ${got} de ${PARTS.length}`);
  }

  got() {
    return Object.values(this.parts).filter((p) => p.taken).length;
  }

  // ---------------- las pruebas ----------------
  // (anfitrión) Un muerto cayó: si fue cerca de la calabaza, un alma para ella.
  onKill(z) {
    const g = this.g;
    if (!this.host()) return;
    if (this.fin && z === this.fin.z && this.bomb === 'guard') {
      this.dropBomb(this.dropSpot(z));
      this.sync();
      return;
    }
    if (this.parts.calabaza.taken || this.cal !== 'hungry') return;
    if (Math.hypot(z.pos.x - CAL.x, z.pos.z - CAL.z) > CAL.r) return;
    this.calSouls++;
    g.fx.soul(z.pos, this.calObj.top);
    if (this.calSouls >= this.calNeed()) {
      this.cal = 'full';
      g.ee?.announce?.('La calabaza de la Salamanca se llenó de almas. Agárrenla, en el rincón de la capilla.', 4, true);
    }
    g.net?.event('ee', { lm: this.netState(), lsoul: [+z.pos.x.toFixed(1), +z.pos.z.toFixed(1)] });
  }

  // (anfitrión) El Finado: de a ratos, uno de los muertos de la ronda lleva la bombilla.
  updateFinado(dt) {
    const g = this.g;
    if (this.parts.bombilla.taken || this.bomb === 'floor') return;
    if (this.bomb === 'guard') {
      const z = this.fin?.z;
      if (!z || !z.active || z.id !== this.fin.id) {
        // se fue sin morir (se trabó y volvió a la cola): otra vez más adelante
        this.bomb = 'none';
        this.fin = null;
        this.finT = FIN.retry;
        this.sync();
      }
      return;
    }
    if (g.rounds.state !== 'active' || (g.rounds.round || 0) < FIN.round || g.arena?.active) return;
    // una vez por ronda, al rato de arrancar
    if (this.finRound !== g.rounds.round) {
      this.finRound = g.rounds.round;
      this.finT = FIN.delay[0] + Math.random() * (FIN.delay[1] - FIN.delay[0]);
    }
    if (this.finT === Infinity) return;
    this.finT -= dt;
    if (this.finT > 0) return;
    const round = Math.max(FIN.round, g.rounds.round);
    if (!g.zombies.spawn(round, zombieHealth(round) * FIN.hp * (1 + 0.5 * (this.players() - 1)), this.finadoSpot())) {
      this.finT = 2;
      return;
    }
    this.finT = Infinity;
    const z = g.zombies.pool.find((q) => q.active && q.id === g.zombies.idc);
    if (!z) return;
    this.fin = { z, id: z.id };
    this.bomb = 'guard';
    this.dressFinado(z);
    g.ee?.announce?.('Se oye silbar una bombilla entre los muertos... salió el Finado.', 4.5, true);
    this.sync();
  }

  // Dónde sale el Finado: de la tierra, en una zona abierta a la que se llega
  // (nunca afuera de una ventana, así cae adentro). null: donde toque.
  finadoSpot() {
    const g = this.g;
    const w = g.world;
    const players = [g.player.alive ? g.player.pos : null, ...(g.net ? [...g.net.remote.values()].filter((r) => !r.dead).map((r) => r.pos) : [])].filter(Boolean);
    const list = RISERS.filter((r) => {
      if (!g.activeZones.has(r.zone)) return false;
      const [x, z] = r.pos;
      if (!Number.isFinite(g.nav.distAt(x, z))) return false;
      return players.every((p) => Math.hypot(p.x - x, p.z - z) > 7);
    });
    if (!list.length) return null;
    const [x, z] = list[Math.floor(Math.random() * list.length)].pos;
    return new THREE.Vector3(x, w.floorAt(x, z), z);
  }

  // Dónde queda la bombilla si el Finado cae afuera (del otro lado de una
  // ventana o donde no se llega): el lugar alcanzable más cercano.
  dropSpot(z) {
    const g = this.g;
    const w = g.world;
    const ok = (x, zz) => w.inside(Math.floor(x), Math.floor(zz)) && !!w.zoneAt(x, zz) && !w.navBlock[w.idx(Math.floor(x), Math.floor(zz))] && Number.isFinite(g.nav.distAt(x, zz));
    const at = new THREE.Vector3(z.pos.x, 0, z.pos.z);
    if (!ok(at.x, at.z)) {
      const win = z.window >= 0 ? g.barriers.windows[z.window] : null;
      if (win) at.set(win.int.x - win.out.x * 0.8, 0, win.int.z - win.out.z * 0.8);
    }
    for (let r = 1; r <= 10 && !ok(at.x, at.z); r++) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = z.pos.x + Math.cos(a) * r;
        const zz = z.pos.z + Math.sin(a) * r;
        if (ok(x, zz)) {
          at.set(x, 0, zz);
          break;
        }
      }
    }
    if (!ok(at.x, at.z)) at.set(g.player.pos.x, 0, g.player.pos.z);
    at.y = w.floorAt(at.x, at.z, (z.baseY || 0) + 0.5);
    return at;
  }

  // El Finado: pálido y verdoso, para reconocerlo entre los demás.
  dressFinado(z) {
    if (!z?.colors) return;
    z.colors.shirt = 0x9ab89a;
    z.colors.pants = 0x2a3a2a;
    if ('skin' in z.colors) z.colors.skin = 0x8aa88a;
    this.g.zombies.paint(z);
  }

  dropBomb(at) {
    const g = this.g;
    this.bomb = 'floor';
    this.fin = null;
    this.bombAt.copy(at);
    this.bombIt.pos.set(at.x, at.y + 0.5, at.z);
    g.fx.sparkle(tmpV.copy(at).setY(at.y + 0.3), [0.7, 1, 0.6], 14, 0.4);
    g.hud.subtitle('El Finado cayó y soltó la bombilla.', 3);
  }

  startYerba() {
    const g = this.g;
    this.yer = 'enc';
    this.yerT = 0;
    this.encG.start();
    g.ee?.announce?.(`¡El acopio se cerró! Aguanten ${YER.dur} segundos con la yerba de luna llena.`, 4, true);
    this.sync();
  }

  // ---------------- red ----------------
  sync() {
    if (this.g.net?.host) this.g.net.event('ee', { lm: this.netState() });
  }

  netState() {
    return { cal: this.cal, cs: this.calSouls, bomb: this.bomb, fin: this.fin ? this.fin.z.id & 0xffff : -1, bp: this.bomb === 'floor' ? this.bombAt.toArray().map((v) => +v.toFixed(2)) : null, yer: this.yer, yt: +this.yerT.toFixed(1) };
  }

  applyRemote(s, soul) {
    const g = this.g;
    this.cal = s.cal;
    this.calSouls = s.cs;
    this.yer = s.yer;
    this.yerT = s.yt;
    if (s.bomb === 'floor' && this.bomb !== 'floor' && s.bp) this.dropBomb(new THREE.Vector3(...s.bp));
    this.bomb = s.bomb;
    this.finNet = s.fin;
    if (s.fin < 0) this.fin = null;
    if (soul) g.fx.soul(new THREE.Vector3(soul[0], this.calObj.top.y - 1, soul[1]), this.calObj.top);
  }

  // ---------------- mesa ----------------
  buildBench() {
    const g = this.g;
    const M = this.mats();
    const y = ATTIC.y;
    const b = new THREE.Group();
    b.position.set(BENCH.x, y, BENCH.z);
    b.add(mesh(boxGeo(1.8, 0.07, 0.7), M.wood, 0, 0.86, 0));
    for (const [a, c] of [[-0.82, -0.28], [0.82, -0.28], [-0.82, 0.28], [0.82, 0.28]]) b.add(mesh(boxGeo(0.07, 0.85, 0.07), M.wood, a, 0.435, c));
    // mantel oscuro, frascos verdes, velas, huesitos
    b.add(mesh(boxGeo(1.2, 0.01, 0.6), M.cloth, -0.1, 0.9, 0));
    for (const [x, h] of [[-0.7, 0.22], [-0.52, 0.16], [0.72, 0.26]]) b.add(mesh(cylGeo(0.06, 0.06, h, 12), M.jar, x, 0.9 + h / 2, -0.18));
    this.flames = [];
    for (const [x, zz, h] of [[-0.3, 0.2, 0.18], [0.35, 0.18, 0.24], [0.55, -0.2, 0.14]]) {
      b.add(mesh(cylGeo(0.018, 0.02, h, 8), M.candle, x, 0.9 + h / 2, zz));
      const f = new THREE.Sprite(M.flame);
      f.position.set(x, 0.9 + h + 0.03, zz);
      f.scale.setScalar(0.07);
      b.add(f);
      this.flames.push(f);
    }
    b.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), M.bone, 0.05, 0.96, -0.15));
    // el mate armado a medias en el centro: se completa cuando están las piezas
    this.proto = new THREE.Group();
    this.proto.position.set(0.05, 0.92, 0.05);
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), M.gourd);
    gourd.scale.set(1, 1.15, 1);
    gourd.position.y = 0.07;
    this.proto.add(gourd);
    this.protoGlow = new THREE.Sprite(M.halo);
    this.protoGlow.scale.setScalar(0.5);
    this.protoGlow.position.y = 0.16;
    this.proto.add(this.protoGlow);
    b.add(this.proto);
    // el tuyo ya armado, parado en la mesa hasta que lo agarrás (cada uno ve
    // el suyo; se arma desde ya, escondido, para no trabar al mostrarlo)
    this.doneMate = buildMate(LUZ_WEAPON, false, g.textures).root;
    this.doneMate.scale.setScalar(2.2);
    this.doneMate.position.set(0.05, 0.9, 0.05);
    this.doneMate.visible = false;
    b.add(this.doneMate);
    this.root.add(b);
    g.world.addBox([BENCH.x - 0.95, y, BENCH.z - 0.4, BENCH.x + 0.95, y + 0.95, BENCH.z + 0.4], { kind: 'prop' });
    // (hold va en el aviso: armar se mantiene, agarrar es una F)
    g.interact.add({
      kind: 'lmbench',
      pos: new THREE.Vector3(BENCH.x, y + 1.1, BENCH.z),
      radius: 2.2,
      holdTime: CRAFT_TIME,
      prompt: () => {
        if (this.hasIt(this.myId()) || this.built) return null;
        const missing = PARTS.length - this.got();
        if (missing) return { text: `Mesa del curandero: ${missing === 1 ? 'falta 1 pieza' : `faltan ${missing} piezas`} del Mate de la Luz Mala`, noCost: true, info: true };
        return { text: 'armar tu Mate de la Luz Mala', noCost: true, hold: true };
      },
      cost: () => (this.got() === PARTS.length ? 0 : 1),
      use: () => {
        if (this.built || !this.claimFor(this.myId())) return false;
        this.crafted();
        return true;
      },
    });
    // agarrarlo (lo de cada uno: el invitado no le pregunta al anfitrión)
    g.interact.add({
      kind: 'lmtake',
      local: true,
      pos: new THREE.Vector3(BENCH.x, y + 1.1, BENCH.z),
      radius: 2.2,
      prompt: () => (this.built && !g.weapons.hasLuz?.() ? { text: 'agarrar tu Mate de la Luz Mala', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.built || g.weapons.hasLuz?.()) return false;
        this.built = false;
        this.doneMate.visible = false;
        g.weapons.give(LUZ_WEAPON);
        g.audio.powerupGrab();
        return true;
      },
    });
  }

  // Se armó el mío: queda en la mesa hasta que lo agarro (también al invitado,
  // cuando el anfitrión le dice que sí).
  crafted() {
    this.built = true;
    this.doneMate.visible = true;
    this.craftFx();
    this.g.hud.achievement('Mate de la Luz Mala', 'Lo armaste en la mesa del curandero');
  }

  craftFx() {
    const g = this.g;
    const p = tmpV.set(BENCH.x, ATTIC.y + 1.1, BENCH.z);
    g.fx.flash(p, 0x8aff6a, 30, 0.4, 8);
    g.fx.sparkle(p, [0.6, 1, 0.4], 14, 0.5);
    g.audio.powerupGrab();
  }

  // ¿Ese jugador ya tiene el suyo? (o se lo acaban de dar y todavía no llegó su aviso)
  hasIt(id) {
    const g = this.g;
    if (id === this.myId() && g.weapons?.hasLuz?.()) return true;
    const r = g.net?.remote.get(id);
    if (r?.hasLuz && !r.dead) return true;
    return (this.claims.get(id) || 0) > g.time;
  }

  // Alguien (vivo) tiene el mate: hace falta para el cementerio.
  anyoneHas() {
    const g = this.g;
    if (g.player.alive && g.weapons?.hasLuz?.()) return true;
    if (g.net) for (const r of g.net.remote.values()) if (r.hasLuz && !r.dead) return true;
    return false;
  }

  // El anfitrión (o el solitario) le da el mate a cada uno: uno por jugador.
  claimFor(id) {
    if (this.got() < PARTS.length || this.hasIt(id)) return false;
    this.claims.set(id, this.g.time + 4);
    this.g.net?.event('lmcraft', { id });
    return true;
  }

  // (atajo) Las tres piezas del equipo.
  debugParts() {
    for (const id of Object.keys(this.parts)) if (!this.parts[id].taken) this.takePart(id);
    this.cal = 'full';
    this.yer = 'idle';
    this.encG.stop();
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    const pulse = 0.75 + Math.sin(t * 3.3) * 0.25;
    const M = this.mats();
    M.halo.opacity = 0.5 + pulse * 0.4;
    const host = this.host();
    // la calabaza: brilla más cuantas más almas tiene
    const C = this.calObj;
    const calTaken = this.parts.calabaza.taken;
    C.g.visible = !calTaken;
    C.gourd.visible = !calTaken;
    C.ring.visible = !calTaken && this.cal === 'hungry';
    C.fx.visible = !calTaken && this.cal === 'full';
    M.gourdFull.emissiveIntensity = this.cal === 'full' ? 0.8 + pulse * 0.4 : (this.calSouls / this.calNeed()) * 0.6;
    if (C.ring.visible) M.ring.opacity = 0.18 + pulse * 0.12;
    // la bombilla
    if (host) this.updateFinado(dt);
    else if (this.finNet >= 0 && (!this.fin || !this.fin.z.active || (this.fin.z.id & 0xffff) !== this.finNet)) {
      const z = g.net.findZombie(this.finNet);
      this.fin = z ? { z, id: z.id } : null;
      if (z) this.dressFinado(z);
    }
    const bombTaken = this.parts.bombilla.taken;
    const fz = this.bomb === 'guard' ? this.fin?.z : null;
    this.bombObj.visible = !bombTaken && (this.bomb === 'floor' || (!!fz && !fz.dead));
    this.bombFx.visible = !bombTaken && this.bomb === 'floor';
    if (this.bomb === 'floor') {
      this.bombObj.position.set(this.bombAt.x, this.bombAt.y + 0.05, this.bombAt.z);
      this.bombObj.rotation.set(0, t, 0);
      this.bombFx.position.copy(this.bombAt);
    } else if (fz) {
      const yaw = fz.yaw || 0;
      this.bombObj.position.set(fz.pos.x + Math.cos(yaw) * 0.22, fz.pos.y + 1 * (fz.scale || 1), fz.pos.z - Math.sin(yaw) * 0.22);
      this.bombObj.rotation.set(0, yaw, Math.sin(t * 8) * 0.3);
    }
    // la yerba y el encierro del acopio
    const Y = this.yerObj;
    const yerTaken = this.parts.yerba.taken;
    Y.bag.visible = !yerTaken;
    Y.fx.visible = !yerTaken && this.yer === 'idle';
    if (!yerTaken) {
      Y.bag.position.y = this.yer === 'enc' ? 1.3 + Math.sin(t * 2) * 0.1 : 1.03;
      Y.bag.rotation.y += dt * (this.yer === 'enc' ? 2 : 0.7);
    }
    const encOn = this.yer === 'enc' && !yerTaken;
    if (encOn && !this.encG.on) this.encG.start();
    else if (!encOn && this.encG.on) this.encG.stop();
    this.encG.update(dt);
    if (encOn) {
      this.yerT += dt;
      if (host) {
        this.encG.spawns(dt, 1.3);
        if (this.yerT >= YER.dur) {
          this.yer = 'idle';
          this.takePart('yerba');
          g.ee?.announce?.('¡Aguantaron! La yerba de luna llena es de ustedes.', 4, true);
          this.sync();
        } else if (Math.floor(this.yerT / 10) !== Math.floor((this.yerT - dt) / 10)) this.sync();
      }
    }
    for (const fx of [C.fx, this.bombFx, Y.fx]) if (fx.visible) fx.userData.beam.material.opacity = 0.2 + pulse * 0.15;
    for (const f of this.flames) f.scale.setScalar(0.06 + Math.random() * 0.02);
    // el mate de la mesa brilla más cuantas más piezas hay
    this.protoGlow.scale.setScalar(0.2 + this.got() * 0.18);
    this.proto.visible = !this.built;
    if (this.built) this.doneMate.rotation.y += dt * 0.8;
  }

  // Lo que muestra el HUD (lo escribe el easter egg, que es el dueño del contador).
  hudText() {
    if (this.yer === 'enc' && !this.parts.yerba.taken) return `<span>Encierro del acopio</span><b>${Math.max(0, Math.ceil(YER.dur - this.yerT))} s</b>`;
    if (this.got() === PARTS.length && this.anyoneHas()) return null;
    return `<span>Luz Mala</span>${Object.values(this.parts).map((p) => `<i class="${p.taken ? 'is-got' : ''}">◈</i>`).join('')}`;
  }
}
