import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PART_COUNT, makePose, solvePose, solveExtras, hitParts } from './skeleton';
import Navigation from '../world/Navigation';
import DogRig from './Dogs';
import { SILL_Y } from '../world/HighWindows';
import { RISERS } from '../config/map';
import { ARENA } from '../world/Arena';
import { ATTIC, SKYLIGHTS, STAIR_BOTTOM, STAIR_TOP, STAIR_TURN, UP_Y, atticNavWorld, inAtticRect, inStair, levelOf, stairY } from '../world/Attic';
import { SPEEDS, rollSpeed, ZOMBIE_DAMAGE, BOSS_DAMAGE, POINTS, bossHealth, bossScale } from '../config/rules';
import { rng } from '../core/noise';

// Zombies por rondas: aparición (ventanas y tierra), IA, animación procedural,
// render instanciado (una llamada de dibujo por tipo de parte) y daño.

const MAX = 40;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// un perro no dibuja ninguna parte del cuerpo humano
const ALL_PARTS = (1 << PART_COUNT) - 1;

const SKIN = [0x6d7a5e, 0x7a7f68, 0x5e6456, 0x858a76, 0x6a5f52, 0x78705a];
const SHIRT = [0x4a4f3a, 0x5a2c24, 0x2f3b4a, 0x6a6454, 0x3d4a34, 0x7a6a48, 0x2a2a2a, 0x8a8478];
const PANTS = [0x3a3328, 0x5a5040, 0x26282c, 0x4a3a2a, 0x6a5a44, 0x3a4048];
const BOOTS = [0x1c1612, 0x2a1e14, 0x3a2a1a];
const HATS = [0x1a1a1a, 0x2a2440, 0x3a1a18, 0x40382a];
const SCARVES = [0x8a1a14, 0xd8d0c0, 0x1e3a6a, 0x6a1a3a];
const HAIR = [0x1a1410, 0x3a2a1a, 0x6a6a64, 0x2a2a2a];

// Partes instanciadas: qué partes del esqueleto dibuja cada malla y de qué color.
// mat: qué textura usa; need: solo lo dibujan los zombies que tienen esa prenda.
const MESHES = [
  { key: 'pelvis', parts: [0], color: 'pants', mat: 'pants' },
  { key: 'torso', parts: [1], color: 'shirt', mat: 'cloth' },
  { key: 'head', parts: [2], color: 'skin', mat: 'head' },
  { key: 'headx', parts: [2], color: 'skin', mat: 'skin' },
  { key: 'uarm', parts: [3, 4], color: 'shirt', mat: 'cloth' },
  { key: 'farm', parts: [5, 6], color: 'skin', mat: 'skin' },
  { key: 'thigh', parts: [7, 8], color: 'pants', mat: 'pants' },
  { key: 'shin', parts: [9, 10], color: 'pants', mat: 'pants' },
  { key: 'foot', parts: [11, 12], color: 'boots', mat: 'leather' },
  { key: 'hat', parts: [13], color: 'hat', mat: 'plain' },
  { key: 'eye', parts: [14, 15], color: null },
  { key: 'hair', parts: [2], color: 'hair', mat: 'plain', need: 'hair' },
  { key: 'boina', parts: [2], color: 'hat', mat: 'plain', need: 'boina' },
  { key: 'scarf', parts: [1], color: 'scarf', mat: 'cloth', need: 'scarf' },
  { key: 'susp', parts: [1], color: 'boots', mat: 'leather', need: 'susp' },
];

// Lo que grita el Capataz cuando llega.
const CAPATAZ = ['¡A laburar, vagos! En mi turno nadie toma mate.', '¿Quién anda ahí? ¡La yerba no se cosecha sola!', 'Se terminó el recreo. Ahora mando yo.'];

const HIDE_HEAD = (1 << 2) | (1 << 13) | (1 << 14) | (1 << 15);
const HIDE_LEGS = (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);

// Foto nueva de un zombie ajeno: se arranca desde donde se lo está dibujando.
function netTarget(z, x, y, yaw) {
  const now = performance.now();
  const n = z.net || (z.net = { x, z: y, yaw, t1: now - 50 });
  n.px = z.pos.x;
  n.pz = z.pos.z;
  n.t0 = n.t1;
  n.t1 = now;
  n.x = x;
  n.z = y;
  n.yaw = yaw;
}

function geometries() {
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  const merge = (list) => mergeGeometries(list.map((g) => {
    const n = ni(g);
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  }));
  // antebrazo con mano huesuda y garras
  const hand = new THREE.SphereGeometry(0.048, 8, 6).scale(1, 1.1, 0.7).translate(0, -0.17, 0.01);
  const claws = [];
  for (let i = 0; i < 4; i++) {
    claws.push(new THREE.CapsuleGeometry(0.011, 0.055, 2, 5).rotateX(0.35).translate(-0.027 + i * 0.018, -0.235, 0.028));
  }
  claws.push(new THREE.CapsuleGeometry(0.013, 0.04, 2, 5).rotateZ(0.8).translate(0.045, -0.19, 0.03));
  const farm = merge([cap(0.046, 0.2), hand, ...claws]);
  // cara: nariz, orejas, ceño y la mandíbula caída
  const headx = merge([
    new THREE.BoxGeometry(0.038, 0.05, 0.035).translate(0, -0.005, 0.128),
    new THREE.SphereGeometry(0.034, 7, 5).scale(0.35, 1, 0.75).translate(-0.115, 0.01, 0),
    new THREE.SphereGeometry(0.034, 7, 5).scale(0.35, 1, 0.75).translate(0.115, 0.01, 0),
    new THREE.BoxGeometry(0.19, 0.028, 0.03).rotateX(-0.25).translate(0, 0.05, 0.122),
    new THREE.BoxGeometry(0.15, 0.045, 0.13).rotateX(0.35).translate(0, -0.152, 0.03),
    new THREE.CylinderGeometry(0.055, 0.065, 0.08, 8).translate(0, -0.14, -0.02),
  ]);
  const hair = merge([
    new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1, 0.9, 1.05).translate(0, 0.035, -0.012),
    new THREE.BoxGeometry(0.03, 0.08, 0.03).rotateZ(0.5).translate(0.06, 0.15, 0.02),
    new THREE.BoxGeometry(0.03, 0.07, 0.03).rotateZ(-0.4).translate(-0.05, 0.14, -0.03),
  ]);
  const boina = merge([
    new THREE.CylinderGeometry(0.14, 0.125, 0.045, 14).rotateZ(0.18).translate(0.015, 0.155, 0),
    new THREE.SphereGeometry(0.012, 5, 4).translate(0.02, 0.185, 0),
  ]);
  const scarf = merge([
    new THREE.ConeGeometry(0.11, 0.2, 3).rotateX(Math.PI).scale(1, 1, 0.25).translate(0, 0.16, 0.13),
    new THREE.TorusGeometry(0.095, 0.022, 5, 12).rotateX(Math.PI / 2).translate(0, 0.27, 0.01),
  ]);
  const susp = merge([
    new THREE.BoxGeometry(0.035, 0.56, 0.262).translate(-0.1, 0, 0),
    new THREE.BoxGeometry(0.035, 0.56, 0.262).translate(0.1, 0, 0),
  ]);
  return {
    headx,
    hair,
    boina,
    scarf,
    susp,
    pelvis: new RoundedBoxGeometry(0.34, 0.22, 0.2, 2, 0.05),
    torso: new RoundedBoxGeometry(0.42, 0.56, 0.25, 2, 0.07),
    head: new RoundedBoxGeometry(0.22, 0.27, 0.245, 3, 0.075),
    uarm: cap(0.056, 0.19),
    farm,
    thigh: cap(0.078, 0.28),
    shin: cap(0.066, 0.3),
    foot: new RoundedBoxGeometry(0.11, 0.08, 0.26, 1, 0.03),
    hat: new THREE.CylinderGeometry(0.15, 0.14, 0.05, 14).scale(1, 1, 1.05),
    eye: new THREE.SphereGeometry(0.02, 6, 4),
  };
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpC = new THREE.Color();
const dirOut = { x: 0, z: 0 };

// Borde de luz (fresnel) frío: los zombies se leen en la penumbra, como en BO1.
function rim(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += vec3(0.1, 0.13, 0.18) * rimK * 0.45;
      #include <opaque_fragment>`,
    );
  };
  return mat;
}

export default class Zombies {
  constructor(game) {
    this.g = game;
    this.geo = geometries();
    const T = game.textures;
    // texturas con relieve y un borde de luz fría para recortarlos contra la oscuridad
    const mk = (map, o = {}) => rim(new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 0.92, ...o }));
    const mats = {
      cloth: mk(T.zcloth),
      pants: mk(T.zpants),
      skin: mk(T.zskin, { roughness: 0.75 }),
      leather: mk(T.leather, { roughness: 0.7 }),
      plain: mk(T.grime),
    };
    const face = rim(new THREE.MeshStandardMaterial({ map: T.face, bumpMap: T.face, bumpScale: 2, roughness: 0.8 }));
    mats.head = [mats.skin, mats.skin, mats.skin, mats.skin, face, mats.skin];
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23a).multiplyScalar(3), toneMapped: false });
    this.meshes = MESHES.map((M) => {
      let mat = mats[M.mat] || mats.plain;
      if (M.key === 'eye') mat = this.eyeMat;
      const im = new THREE.InstancedMesh(this.geo[M.key], mat, MAX * M.parts.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (M.color) {
        for (let i = 0; i < im.count; i++) im.setColorAt(i, tmpC.set(0xffffff));
      }
      im.castShadow = false;
      im.frustumCulled = false;
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
      game.scene.add(im);
      return { ...M, im };
    });
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push(this.makeZombie(i));
    this.boss = null;
    this.bossRig = this.buildBossRig();
    this.navLure = new Navigation(game.world);
    // el altillo: abajo hacia la escalera, y arriba una grilla aparte
    this.navStair0 = new Navigation(game.world);
    const upWorld = atticNavWorld(game.world);
    this.navAtticTop = new Navigation(upWorld);
    this.navAttic = new Navigation(upWorld);
    this.hits = [];
    this.idc = 0;
    this.blobs = this.buildBlobShadows();
    this.dogRig = new DogRig(game, MAX, this.eyeMat);
    this.tele = this.buildTelegraphs();
  }

  // Avisos en el piso de los ataques del jefe: una franja (rebencazo y
  // embestida) y un círculo (golpe al piso). Los ven todos (salen del estado).
  buildTelegraphs() {
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), mat());
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), mat());
    for (const m of [line, ring]) {
      m.visible = false;
      m.renderOrder = 2;
      this.g.scene.add(m);
    }
    return { line, ring };
  }

  telegraph() {
    const { line, ring } = this.tele;
    const b = this.boss;
    line.visible = false;
    ring.visible = false;
    if (!b || b.dead) return;
    const s = b.state;
    const pulse = 0.5 + Math.sin(this.g.time * 18) * 0.2;
    if (s === 'whipWind' || s === 'chargeWind') {
      const k = Math.min(1, b.stateT / (s === 'whipWind' ? 0.65 : 0.85));
      const len = s === 'whipWind' ? 8.5 : 14;
      line.visible = true;
      line.position.set(b.pos.x, 0.035, b.pos.z);
      line.rotation.y = b.yaw;
      line.scale.set(s === 'whipWind' ? 0.9 : 1.7, 1, len * (0.3 + k * 0.7));
      line.material.opacity = (0.25 + k * 0.45) * pulse * 1.6;
    } else if (s === 'slam' && b.stateT < 0.75) {
      const k = b.stateT / 0.75;
      ring.visible = true;
      ring.position.set(b.pos.x + Math.sin(b.yaw) * 1.4, 0.04, b.pos.z + Math.cos(b.yaw) * 1.4);
      ring.scale.setScalar(0.6 + k * 1.8);
      ring.material.opacity = (0.3 + k * 0.5) * pulse * 1.6;
    }
  }

  // Jugadores que el jefe puede lastimar (el local y los de la red).
  bossTargets() {
    const g = this.g;
    const list = g.player.canBeHit() ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r);
    // al del altillo no lo alcanza
    return list.filter((p) => levelOf(p.pos.y) === 0);
  }

  // El rebencazo: pega a lo largo de la franja que marcó.
  whipHit(z) {
    const g = this.g;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const hand = new THREE.Vector3(z.pos.x + fx * 0.6, 2.2 * (z.scale / 1.4), z.pos.z + fz * 0.6);
    const end = new THREE.Vector3(z.pos.x + fx * 8.5, 0.3, z.pos.z + fz * 8.5);
    g.fx.tracer(hand, end, 0x8a5a30);
    g.fx.dust(end, { x: 0, y: 1, z: 0 }, [0.45, 0.38, 0.3], 10);
    g.audio.chain(end);
    g.fx.addShake(0.25);
    for (const p of this.bossTargets()) {
      const dx = p.pos.x - z.pos.x;
      const dz = p.pos.z - z.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0.5 && along < 9 && side < 0.9) g.damagePlayer(p, 65, z.pos);
    }
  }

  // Silba y se levantan peones alrededor.
  callPeones(z, n) {
    const g = this.g;
    g.audio.bossArrive();
    const round = g.rounds?.round || 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const at = new THREE.Vector3(z.pos.x + Math.cos(a) * 3.2, 0, z.pos.z + Math.sin(a) * 3.2);
      if (g.nav.blocked(Math.floor(at.x), Math.floor(at.z))) continue;
      g.later(0.4 + i * 0.3, () => this.spawn(round, Math.floor(bossHealth(round) / 40), at));
    }
  }

  makeZombie(slot) {
    return {
      slot,
      active: false,
      dead: false,
      boss: false,
      P: makePose(),
      mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()),
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      from: new THREE.Vector3(),
      dropDir: new THREE.Vector3(),
      colors: {},
      hidden: 0,
    };
  }

  // Sombras de manchita bajo cada zombie (más baratas que sombras reales).
  buildBlobShadows() {
    const tex = this.g.textures.dot;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, MAX + 1);
    im.frustumCulled = false;
    im.renderOrder = 1;
    for (let i = 0; i <= MAX; i++) im.setMatrixAt(i, ZERO);
    this.g.scene.add(im);
    return im;
  }

  get alive() {
    let n = 0;
    for (const z of this.pool) if (z.active && !z.dead) n++;
    return n;
  }

  // ---------------- aparición ----------------
  pickSpawner(allowRisers = true) {
    const g = this.g;
    const zones = g.activeZones;
    const player = g.player.pos;
    const list = [];
    for (const w of g.barriers.windows) {
      if (!zones.has(w.zone)) continue;
      const d = g.nav.distAt(w.int.x, w.int.z);
      list.push({ kind: 'window', w, d });
    }
    if (allowRisers) {
      for (const r of RISERS) {
        if (!zones.has(r.zone)) continue;
        const dx = r.pos[0] - player.x;
        const dz = r.pos[1] - player.z;
        if (dx * dx + dz * dz < 16) continue;
        const d = g.nav.distAt(r.pos[0], r.pos[1]);
        list.push({ kind: 'riser', r, d });
      }
    }
    // de a ratos, alguno se tira desde un ventanal alto
    if (allowRisers && g.rounds.round >= 3 && g.highWindows) {
      for (const hw of g.highWindows.list) {
        if (!zones.has(hw.zone)) continue;
        const d = g.nav.distAt(hw.x + hw.in.x * 1.3, hw.z + hw.in.z * 1.3);
        if (Number.isFinite(d)) list.push({ kind: 'drop', hw, d: d * 1.6 + 6 });
      }
    }
    if (!list.length) return null;
    let near = list.filter((c) => c.d < 30);
    if (!near.length) near = list.sort((a, b) => a.d - b.d).slice(0, 4);
    let total = 0;
    for (const c of near) {
      c.wt = 1 / (1 + (Number.isFinite(c.d) ? c.d : 60) * 0.06);
      total += c.wt;
    }
    let r = Math.random() * total;
    for (const c of near) {
      r -= c.wt;
      if (r <= 0) return c;
    }
    return near[near.length - 1];
  }

  freeSlot() {
    let z = this.pool.find((p) => !p.active);
    if (!z) {
      // reciclar el cadáver más viejo
      let oldest = null;
      for (const p of this.pool) if (p.dead && (!oldest || p.corpseT > oldest.corpseT)) oldest = p;
      if (!oldest) return null;
      this.free(oldest);
      z = oldest;
    }
    return z;
  }

  // at: punto fijo (sale de la tierra ahí), si no elige ventana o pozo.
  spawn(round, health, at = null) {
    // con alguien en el altillo, muchos se tiran por las claraboyas
    const sky = !at && this.atticBusy() && Math.random() < 0.45 ? SKYLIGHTS[Math.floor(Math.random() * SKYLIGHTS.length)] : null;
    const sp = at ? { kind: 'riser', r: { pos: [at.x, at.z] } } : sky ? { kind: 'sky', s: sky } : this.pickSpawner();
    if (!sp) return false;
    const z = this.freeSlot();
    if (!z) return false;
    const r = Math.random;
    z.active = true;
    z.dead = false;
    z.id = ++this.idc;
    z.hp = health;
    z.maxHp = health;
    z.scale = 0.93 + r() * 0.14;
    z.speedType = rollSpeed(round);
    z.speed = SPEEDS[z.speedType] * (0.92 + r() * 0.16);
    z.phase = r() * 10;
    z.stateT = 0;
    z.attackT = 0;
    z.growlT = 1 + r() * 4;
    z.crawler = false;
    z.hidden = 0;
    z.limp = r() < 0.35 ? 0.4 + r() * 0.5 : 0;
    z.headTilt = (r() - 0.5) * 0.7;
    z.armOff = (r() - 0.5) * 0.4;
    z.farT = 0;
    z.losT = 0;
    z.los = false;
    z.corpseT = 0;
    z.static = false;
    z.dog = false;
    z.pos.y = 0;
    z.level = 0;
    z.baseY = 0;
    z.burnT = 0;
    z.burnDmgT = 0.5;
    z.slowT = 0;
    z.steamT = 0;
    z.fountT = 0;
    z.window = -1;
    z.P.rootPitch = 0;
    z.P.rootRoll = 0;
    z.P.rootY = 0;
    z.colors = {
      skin: SKIN[Math.floor(r() * SKIN.length)],
      shirt: SHIRT[Math.floor(r() * SHIRT.length)],
      pants: PANTS[Math.floor(r() * PANTS.length)],
      boots: BOOTS[Math.floor(r() * BOOTS.length)],
      hat: HATS[Math.floor(r() * HATS.length)],
      scarf: SCARVES[Math.floor(r() * SCARVES.length)],
      hair: HAIR[Math.floor(r() * HAIR.length)],
    };
    // prendas: sombrero, boina o pelo; pañuelo y tiradores al azar
    const top = r();
    if (top > 0.4) z.hidden |= 1 << 13;
    z.flags = { hair: top > 0.4 && top < 0.78, boina: top >= 0.78, scarf: r() < 0.4, susp: r() < 0.35 };
    z.twitch = 0;
    z.twitchT = 1 + r() * 4;
    this.paint(z);
    if (sp.kind === 'sky') {
      // rompe lo que queda del vidrio y cae al altillo
      z.level = 1;
      z.baseY = ATTIC.y;
      z.pos.set(sp.s.x + (r() - 0.5) * 0.5, ATTIC.top - 0.2, sp.s.z + (r() - 0.5) * 0.4);
      z.vel.set(0, 0, 0);
      z.yaw = r() * Math.PI * 2;
      z.state = 'fall';
      const gp = new THREE.Vector3(sp.s.x, ATTIC.top, sp.s.z);
      this.g.fx.sparks(gp, 1, { x: 0, y: -1, z: 0 }, [0.8, 0.9, 1]);
      this.g.audio.shatter(gp);
    } else if (sp.kind === 'window') {
      const w = sp.w;
      z.window = w.i;
      const lat = new THREE.Vector3(-w.out.z, 0, w.out.x);
      z.pos.copy(w.ext).addScaledVector(w.out, 3 + r() * 3).addScaledVector(lat, (r() - 0.5) * 3);
      z.state = 'approach';
      z.yaw = Math.atan2(-w.out.x, -w.out.z);
    } else if (sp.kind === 'drop') {
      // se asoma por el ventanal alto (rompiendo lo que quedaba del vidrio)
      const hw = sp.hw;
      z.pos.set(hw.x + hw.in.x * 0.15, SILL_Y, hw.z + hw.in.z * 0.15);
      z.dropDir.copy(hw.in);
      z.vel.set(0, 0, 0);
      z.yaw = Math.atan2(hw.in.x, hw.in.z);
      z.state = 'drop';
      const gp = new THREE.Vector3(hw.x, SILL_Y + 0.6, hw.z);
      this.g.fx.sparks(gp, 1, { x: hw.in.x, y: 0.3, z: hw.in.z }, [0.8, 0.9, 1]);
      this.g.audio.shatter(gp);
    } else {
      z.pos.set(sp.r.pos[0] + (r() - 0.5) * 1.2, 0, sp.r.pos[1] + (r() - 0.5) * 1.2);
      z.state = 'rise';
      z.yaw = r() * Math.PI * 2;
      this.g.fx.dirt(z.pos);
      this.g.audio.rise(z.pos);
    }
    return true;
  }

  // ¿Hay alguien en el altillo?
  atticBusy() {
    const g = this.g;
    const up = (p) => p && p.pos.y > UP_Y && inAtticRect(p.pos.x, p.pos.z);
    if (g.player.alive && up(g.player)) return true;
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && up(r)) return true;
    return false;
  }

  // Sube (dir 1) o baja (dir -1) por la escalera del altillo: camina por la
  // rampa y dobla hacia el piso de arriba (o al revés).
  startStairs(z, dir) {
    z.stairDir = dir;
    z.stairI = 0;
    this.setState(z, 'stairs');
  }

  stairStep(z, dt, t) {
    const up = z.stairDir > 0;
    const path = up ? [STAIR_BOTTOM, STAIR_TURN, STAIR_TOP] : [STAIR_TOP, STAIR_TURN, STAIR_BOTTOM];
    const p = path[Math.min(2, (z.stairI || 0) + 1)];
    const dx = p.x - z.pos.x;
    const dz = p.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    const step = (z.dog ? 4.2 : Math.max(1.3, (z.speed || 1.2) * 0.75)) * (z.slowT > 0 ? 0.4 : 1) * dt;
    if (d <= step) {
      z.pos.x = p.x;
      z.pos.z = p.z;
      z.stairI = (z.stairI || 0) + 1;
      if (z.stairI >= 2) {
        z.level = up ? 1 : 0;
        z.baseY = up ? ATTIC.y : 0;
        z.pos.y = z.baseY;
        this.setState(z, 'chase');
        return;
      }
    } else {
      z.pos.x += (dx / d) * step;
      z.pos.z += (dz / d) * step;
      this.turn(z, Math.atan2(dx, dz), 8, dt);
    }
    // la altura: la rampa, o el piso de cada lado
    const past = (z.stairI || 0) >= 1;
    z.baseY = inStair(z.pos.x, z.pos.z) ? stairY(z.pos.z) : up === past ? ATTIC.y : 0;
    z.pos.y = z.baseY;
    z.level = levelOf(z.baseY + 0.3);
    if (!z.dog) this.poseGait(z, dt, 1.6, t);
  }

  // Perro cimarrón: cae un rayo cerca de algún jugador y aparece ahí.
  spawnDog(health) {
    const g = this.g;
    const at = this.dogSpot();
    if (!at) return false;
    const z = this.freeSlot();
    if (!z) return false;
    const r = Math.random;
    Object.assign(z, {
      active: true,
      dead: false,
      dog: true,
      level: 0,
      baseY: 0,
      id: ++this.idc,
      hp: health,
      maxHp: health,
      scale: 0.92 + r() * 0.16,
      speedType: 'sprint',
      speed: 5.8 + r() * 0.9,
      phase: r() * 10,
      stateT: 0,
      attackT: 0,
      growlT: 1 + r() * 2,
      crawler: false,
      hidden: ALL_PARTS,
      limp: 0,
      headTilt: 0,
      armOff: 0,
      farT: 0,
      losT: 0,
      los: false,
      corpseT: 0,
      static: false,
      burnT: 0,
      slowT: 0,
      steamT: 0,
      fountT: 0,
      window: -1,
      flags: {},
      burst: false,
      state: 'dogspawn',
      yaw: r() * Math.PI * 2,
    });
    z.P.rootPitch = 0;
    z.P.rootRoll = 0;
    z.P.rootY = 0;
    z.pos.set(at.x, 0, at.z);
    const top = new THREE.Vector3(at.x, 24, at.z);
    const ground = new THREE.Vector3(at.x, 0.1, at.z);
    g.fx.lightning(top, ground, 0xcfe0ff, 0.35);
    g.fx.flash(new THREE.Vector3(at.x, 1.5, at.z), 0xcfe0ff, 30, 0.3, 16);
    if (g.weather) g.weather.flash = Math.max(g.weather.flash, 0.9);
    g.weather?.thunder(0.05, true);
    g.fx.dirt(z.pos, 10);
    return true;
  }

  // Un lugar para el rayo: entre 6 y 12 m de algún jugador, en una zona abierta.
  dogSpot() {
    const g = this.g;
    const targets = [g.player, ...(g.net ? [...g.net.remote.values()].filter((p) => !p.dead) : [])].filter((p) => p.alive !== false);
    if (!targets.length) targets.push(g.player);
    for (let i = 0; i < 40; i++) {
      const tp = targets[Math.floor(Math.random() * targets.length)];
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 6;
      const x = tp.pos.x + Math.cos(a) * d;
      const z = tp.pos.z + Math.sin(a) * d;
      const zone = g.world.zoneAt(x, z);
      if (!zone || !g.activeZones.has(zone)) continue;
      const nd = g.nav.distAt(x, z);
      if (!Number.isFinite(nd) || nd > 45) continue;
      return { x, z };
    }
    return null;
  }

  paint(z, tint = null) {
    for (const M of this.meshes) {
      if (!M.color) continue;
      for (let k = 0; k < M.parts.length; k++) {
        const idx = z.slot * M.parts.length + k;
        tmpC.set(tint ?? z.colors[M.color]);
        M.im.setColorAt(idx, tmpC);
      }
      M.im.instanceColor.needsUpdate = true;
    }
  }

  free(z) {
    if (z.window >= 0) {
      const w = this.g.barriers.windows[z.window];
      if (w.tearer === z) w.tearer = null;
      if (w.climber === z) w.climber = null;
    }
    z.active = false;
    z.dead = false;
    for (const M of this.meshes) {
      for (let k = 0; k < M.parts.length; k++) M.im.setMatrixAt(z.slot * M.parts.length + k, ZERO);
      M.im.instanceMatrix.needsUpdate = true;
    }
    this.blobs.setMatrixAt(z.slot, ZERO);
  }

  reset() {
    for (const z of this.pool) if (z.active) this.free(z);
    if (this.boss) this.removeBoss();
  }

  // ---------------- el Capataz ----------------
  buildBossRig() {
    const T = this.g.textures;
    const G = this.geo;
    const std = (c, map) => new THREE.MeshStandardMaterial({ color: c, map: map || null, roughness: 0.9 });
    const skin = std(0x8a8270, T.grime);
    const cloth = std(0x3a3026, T.grime);
    const poncho = std(0x7a2418, T.grime);
    this.bossMats = { skin, cloth, poncho, base: { skin: skin.color.getHex(), cloth: cloth.color.getHex(), poncho: poncho.color.getHex() } };
    const face = new THREE.MeshStandardMaterial({ map: T.face, color: 0xb0a090, roughness: 0.9 });
    const rig = new THREE.Group();
    const parts = [];
    const add = (geo, mat, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      parts[i] = m;
      rig.add(m);
    };
    add(G.pelvis, cloth, 0);
    add(G.torso, cloth, 1);
    add(G.head, [skin, skin, skin, skin, face, skin], 2);
    add(G.uarm, poncho, 3);
    add(G.uarm, poncho, 4);
    add(G.farm, skin, 5);
    add(G.farm, skin, 6);
    add(G.thigh, cloth, 7);
    add(G.thigh, cloth, 8);
    add(G.shin, std(0x1a1410), 9);
    add(G.shin, std(0x1a1410), 10);
    add(G.foot, std(0x120e0a), 11);
    add(G.foot, std(0x120e0a), 12);
    // sombrero de ala ancha
    const hat = new THREE.Group();
    const hatMat = std(0x2a2018);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.025, 20), hatMat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 16), hatMat);
    crown.position.y = 0.08;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 16), std(0x6a1a12));
    band.position.y = 0.03;
    hat.add(brim, crown, band);
    const hatWrap = new THREE.Mesh(new THREE.BufferGeometry(), hatMat);
    hatWrap.add(hat);
    hatWrap.matrixAutoUpdate = false;
    parts[13] = hatWrap;
    rig.add(hatWrap);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(3), toneMapped: false });
    add(G.eye, eyeMat, 14);
    add(G.eye, eyeMat, 15);
    // cuernos del Mandinga (colgados de la cabeza; solo se ven en el final)
    const horns = new THREE.Group();
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 8), hornMat);
      h.position.set(s * 0.09, 0.19, 0.01);
      h.rotation.z = -s * 0.5;
      horns.add(h);
    }
    horns.visible = false;
    parts[2].add(horns);
    // poncho: una tela que cuelga del torso
    const ponchoGeo = new THREE.BoxGeometry(0.62, 0.6, 0.34);
    add(ponchoGeo, poncho, 16);
    // pala
    const shovel = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), std(0x5a4028));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.4, metalness: 0.8 }));
    blade.position.y = -0.78;
    shovel.add(handle, blade);
    const shovelWrap = new THREE.Mesh(new THREE.BufferGeometry(), hatMat);
    shovelWrap.add(shovel);
    shovelWrap.matrixAutoUpdate = false;
    parts[17] = shovelWrap;
    rig.add(shovelWrap);
    rig.visible = false;
    this.g.scene.add(rig);
    return { rig, parts, hat: hatWrap, horns };
  }

  // opts: { at, mandinga, hp } para el jefe final de la Salamanca.
  spawnBoss(round, opts = {}) {
    if (this.boss) return this.boss;
    const g = this.g;
    // aparece cerca del jugador, en un punto de su zona activa
    const cands = [];
    for (const w of g.barriers.windows) if (g.activeZones.has(w.zone)) cands.push(w.int.clone());
    for (const r of RISERS) if (g.activeZones.has(r.zone)) cands.push(new THREE.Vector3(r.pos[0], 0, r.pos[1]));
    const p = g.player.pos;
    cands.sort((a, b) => Math.abs(a.distanceTo(p) - 12) - Math.abs(b.distanceTo(p) - 12));
    const at = opts.at || cands[0] || new THREE.Vector3(p.x + 8, 0, p.z);
    const z = this.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.dead = false;
    z.id = ++this.idc;
    z.pos.copy(at);
    z.yaw = Math.atan2(p.x - at.x, p.z - at.z);
    z.scale = 1.4;
    const more = bossScale(g.rounds?.players || 1);
    z.maxHp = bossHealth(round) * more;
    z.hp = z.maxHp;
    z.hatHp = z.maxHp * 0.25;
    z.speed = 3.1;
    z.speedType = 'run';
    z.state = 'intro';
    z.stateT = 0;
    z.phase = 0;
    z.growlT = 2;
    z.lockT = 6 + Math.random() * 6;
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.window = -1;
    z.corpseT = 0;
    this.boss = z;
    this.bossRig.rig.visible = true;
    this.bossRig.hat.visible = true;
    const BM = this.bossMats;
    if (opts.mandinga) {
      // el diablo: más grande, rojo, con cuernos; no clausura máquinas
      z.mandinga = true;
      z.scale = 2.05;
      z.maxHp = (opts.hp || 60000) * more;
      z.hp = z.maxHp;
      z.hatHp = 0;
      z.lockT = Infinity;
      BM.skin.color.set(0xa82a18);
      BM.cloth.color.set(0x140a08);
      BM.poncho.color.set(0x2a0806);
      this.bossRig.hat.visible = false;
      this.bossRig.horns.visible = true;
      g.fx.explosion(at, 4, [1, 0.4, 0.1]);
      g.fx.flash(at, 0xff5a1a, 120, 0.8, 24);
      g.audio.growl(at.clone().setY(2), 'boss');
      return z;
    }
    BM.skin.color.set(BM.base.skin);
    BM.cloth.color.set(BM.base.cloth);
    BM.poncho.color.set(BM.base.poncho);
    this.bossRig.horns.visible = false;
    g.fx.explosion(at, 2.5, [0.6, 0.8, 1]);
    g.fx.flash(at, 0x9ac8ff, 90, 0.6, 20);
    g.fx.lightning(new THREE.Vector3(at.x, 12, at.z), new THREE.Vector3(at.x, 0.2, at.z), 0xbfd8ff, 0.5);
    g.audio.bossArrive();
    g.hud.subtitle('¡Llegó el Capataz! Cuidá las máquinas...', 3.5, 'boss');
    g.later(1.6, () => g.say('capataz', CAPATAZ[Math.floor(Math.random() * CAPATAZ.length)]));
    return z;
  }

  removeBoss() {
    if (this.boss && !this.boss.mandinga) this.g.hud.setBossBar(null);
    this.boss = null;
    this.bossRig.rig.visible = false;
    this.blobs.setMatrixAt(MAX, ZERO);
  }

  // ---------------- en línea (invitado) ----------------
  // Las posiciones llegan del anfitrión; acá solo se animan y se dibujan.
  applyRemote(id, x, z, yaw, state, f) {
    this.remoteMap = this.remoteMap || new Map();
    let zz = this.remoteMap.get(id);
    if (!zz) {
      zz = this.freeSlot();
      if (!zz) return;
      const r = rng(id * 2654435 + 7);
      zz.active = true;
      zz.dead = false;
      zz.id = id;
      zz.hp = 1;
      zz.maxHp = 1;
      zz.scale = 0.93 + r() * 0.14;
      zz.phase = r() * 10;
      zz.hidden = 0;
      zz.limp = r() < 0.35 ? 0.4 + r() * 0.5 : 0;
      zz.headTilt = (r() - 0.5) * 0.7;
      zz.armOff = (r() - 0.5) * 0.4;
      zz.static = false;
      zz.attackT = 0;
      zz.stateT = 0;
      zz.twitchT = 1 + r() * 4;
      zz.twitch = 0;
      zz.corpseT = 0;
      zz.state = null;
      // el lugar puede venir de un cadáver: que no herede la pose de acostado
      zz.P.rootPitch = 0;
      zz.P.rootRoll = 0;
      zz.P.rootY = 0;
      zz.colors = {
        skin: SKIN[Math.floor(r() * SKIN.length)],
        shirt: SHIRT[Math.floor(r() * SHIRT.length)],
        pants: PANTS[Math.floor(r() * PANTS.length)],
        boots: BOOTS[Math.floor(r() * BOOTS.length)],
        hat: HATS[Math.floor(r() * HATS.length)],
        scarf: SCARVES[Math.floor(r() * SCARVES.length)],
        hair: HAIR[Math.floor(r() * HAIR.length)],
      };
      const top = r();
      if (top > 0.4) zz.hidden |= 1 << 13;
      zz.flags = { hair: top > 0.4 && top < 0.78, boina: top >= 0.78, scarf: r() < 0.4, susp: r() < 0.35 };
      this.paint(zz);
      zz.pos.set(x, 0, z);
      zz.yaw = yaw;
      this.remoteMap.set(id, zz);
    }
    netTarget(zz, x, z, yaw);
    if (zz.state !== state) {
      zz.state = state;
      zz.stateT = 0;
      zz.attackT = 0;
      if (state === 'dead') {
        zz.dead = true;
        zz.deathFrom = null;
        zz.corpseT = 0;
      }
    }
    zz.dog = !!f.dog;
    zz.level = f.level ? 1 : 0;
    if (zz.dog) zz.hidden = ALL_PARTS;
    zz.speedType = f.speedType;
    zz.crawler = f.crawler;
    zz.dead = f.dead || state === 'dead';
    if (f.crawler) zz.hidden |= HIDE_LEGS;
    if (f.noHead) zz.hidden |= HIDE_HEAD;
  }

  pruneRemote(seen) {
    if (!this.remoteMap) return;
    for (const [id, z] of this.remoteMap) {
      if (seen.has(id)) continue;
      this.free(z);
      this.remoteMap.delete(id);
    }
  }

  applyRemoteBoss(b) {
    if (!b) {
      if (this.boss) this.removeBoss();
      return;
    }
    let z = this.boss;
    if (!z) {
      z = this.makeZombie(-1);
      z.boss = true;
      z.active = true;
      z.id = 0xffff;
      z.scale = b.mandinga ? 2.05 : 1.4;
      z.maxHp = 1;
      z.hatHp = b.mandinga ? 0 : 1;
      z.mandinga = b.mandinga;
      z.speedType = 'run';
      z.limp = 0;
      z.headTilt = 0;
      z.armOff = 0;
      this.boss = z;
      this.bossRig.rig.visible = true;
      this.bossRig.hat.visible = !b.mandinga;
      this.bossRig.horns.visible = !!b.mandinga;
      if (b.mandinga) {
        const BM = this.bossMats;
        BM.skin.color.set(0xa82a18);
        BM.cloth.color.set(0x140a08);
        BM.poncho.color.set(0x2a0806);
      }
      z.pos.set(b.x, 0, b.z);
    }
    netTarget(z, b.x, b.z, b.yaw);
    z.hp = b.hp;
    z.dead = b.dead;
    if (z.state !== b.state) {
      z.state = b.state;
      z.stateT = 0;
    }
    this.g.hud.setBossBar(b.mandinga ? 'El Mandinga' : 'El Capataz', b.hp);
  }

  // Animación de los zombies que maneja otro (sin pensar ni chocar).
  updateRemote(dt, t) {
    const now = performance.now();
    const all = this.pool.filter((z) => z.active);
    if (this.boss) all.push(this.boss);
    for (const z of all) {
      z.stateT += dt;
      // al terminar la caída desde el ventanal, vuelve a pisar el suelo
      if (z.state === 'chase' || z.state === 'attack') z.P.rootY = 0;
      if (z.net) {
        // de donde se lo dibujaba hasta la foto nueva, en lo que tarda en llegar la otra
        const n = z.net;
        const f = Math.min(1.15, (now - n.t1) / Math.max(20, n.t1 - n.t0));
        z.pos.x = n.px + (n.x - n.px) * f;
        z.pos.z = n.pz + (n.z - n.pz) * f;
        let d = z.net.yaw - z.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        z.yaw += d * Math.min(1, dt * 10);
      }
      // a qué altura está: la rampa, el altillo o abajo
      if (!z.boss) {
        z.baseY = z.state === 'stairs' && inStair(z.pos.x, z.pos.z) ? stairY(z.pos.z) : z.level ? ATTIC.y : 0;
        if (z.state !== 'flung' && z.state !== 'drop') z.pos.y = z.baseY;
      }
      const speed = SPEEDS[z.speedType] || 1.2;
      switch (z.state) {
        case 'stairs':
          if (!z.dog) this.poseGait(z, dt, 1.6, t);
          break;
        case 'fall': {
          const tt = z.stateT;
          const yy = Math.max(ATTIC.y, ATTIC.top - 0.2 - 7 * tt * tt);
          z.P.rootY = yy - ATTIC.y;
          this.poseClimb(z, 0.85);
          break;
        }
        case 'attack':
          z.attackT = (z.attackT + dt) % 0.95;
          this.poseAttack(z, t);
          break;
        case 'tear':
          this.poseTear(z, t);
          break;
        case 'climb':
          z.P.rootY = Math.sin(Math.min(1, z.stateT / 1.1) * Math.PI) * 0.95;
          this.poseClimb(z, Math.min(1, z.stateT / 1.1));
          break;
        case 'rise':
          z.P.rootY = -1.75 * (1 - Math.min(1, z.stateT / 1.7) * (2 - Math.min(1, z.stateT / 1.7)));
          this.poseRise(z, t);
          break;
        case 'dead':
          this.poseDeath(z);
          z.corpseT = (z.corpseT || 0) + dt;
          break;
        case 'shocked':
          this.poseShock(z, t);
          break;
        case 'drop': {
          // la misma caída que calcula el anfitrión, a partir del tiempo
          const tt = z.stateT - 0.9;
          if (tt < 0) {
            z.P.rootY = SILL_Y - 0.4;
            this.poseClimb(z, 0.3);
          } else {
            const y = SILL_Y + 1.3 * tt - 6 * tt * tt;
            z.P.rootY = Math.max(0, y - 0.2);
            if (y > 0) this.poseClimb(z, 0.85);
            else this.poseRise(z, t);
          }
          break;
        }
        case 'burnrun':
          z.pos.x += Math.sin(z.yaw) * 3.4 * dt;
          z.pos.z += Math.cos(z.yaw) * 3.4 * dt;
          this.poseBurnRun(z, dt, t);
          if (Math.random() < 0.8) this.g.fx.fire(tmpV.set(z.pos.x, 0.5 + Math.random() * 1.2, z.pos.z), 0.5, 2);
          break;
        case 'slam':
        case 'locking':
          this.poseSlam(z, z.stateT);
          break;
        case 'whipWind':
          this.poseSlam(z, Math.min(0.55, z.stateT * 0.8));
          break;
        case 'whip':
          this.poseSlam(z, 0.55 + Math.min(0.85, z.stateT * 2.6));
          break;
        case 'charge':
          this.poseGait(z, dt, 7, t);
          break;
        case 'stunned':
          this.poseShock(z, t * 0.35);
          break;
        case 'intro':
        case 'chargeWind':
        case 'enrage':
        case 'summon':
          this.poseRoar(z, t);
          break;
        case 'frozen':
        case 'flung':
          break;
        default:
          if (z.crawler) this.poseCrawl(z, dt);
          else this.poseGait(z, dt, speed, t);
          break;
      }
      if (!z.dead) {
        z.growlT = (z.growlT ?? 2) - dt;
        if (z.growlT <= 0) {
          z.growlT = 2.5 + Math.random() * 5;
          const d = Math.hypot(z.pos.x - this.g.player.pos.x, z.pos.z - this.g.player.pos.z);
          if (d < 24) this.g.audio.growl(tmpV.set(z.pos.x, 1.6, z.pos.z), z.speedType === 'sprint' ? 'scream' : 'idle');
        }
      }
    }
  }

  // ---------------- actualización ----------------
  update(dt, t) {
    const g = this.g;
    if (g.net?.guest) {
      this.updateRemote(dt, t);
      this.render();
      return;
    }
    const player = g.player;
    // campo de flujo hacia el señuelo más cercano, si hay
    this.lure = g.lures.length ? g.lures[0] : null;
    if (this.lure) this.navLure.update(this.lure.pos.x, this.lure.pos.z);
    const lastAlive = g.rounds.remainingTotal() <= 2 && g.rounds.round >= 4;
    for (const z of this.pool) {
      if (!z.active) continue;
      if (lastAlive && !z.dead && z.speedType === 'walk') {
        z.speedType = 'run';
        z.speed = SPEEDS.run;
      }
      this.think(z, dt, t, player);
    }
    if (this.boss) this.thinkBoss(this.boss, dt, t, player);
    this.separate(dt);
    this.render();
  }

  separate(dt) {
    const list = this.pool;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.active || a.dead || a.state !== 'chase' && a.state !== 'attack') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.active || b.dead || b.state !== 'chase' && b.state !== 'attack') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.5 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (0.72 - d) * 0.5 * Math.min(1, dt * 12);
        a.pos.x -= (dx / d) * push;
        a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push;
        b.pos.z += (dz / d) * push;
      }
    }
  }

  // Gira suavemente hacia un ángulo.
  turn(z, target, rate, dt) {
    let d = target - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  think(z, dt, t, player) {
    const g = this.g;
    if (z.dog) {
      this.thinkDog(z, dt, t, player);
      return;
    }
    z.stateT += dt;
    const P = z.P;
    const pp = player.pos;
    const dxp = pp.x - z.pos.x;
    const dzp = pp.z - z.pos.z;
    const distP = Math.hypot(dxp, dzp);

    if (!z.dead) {
      z.growlT -= dt;
      if (z.growlT <= 0) {
        z.growlT = 2.5 + Math.random() * 5;
        if (distP < 28) g.audio.growl(tmpV.set(z.pos.x, 1.6, z.pos.z), z.speedType === 'sprint' ? (Math.random() < 0.55 ? 'scream' : 'attack') : z.speedType === 'run' && Math.random() < 0.3 ? 'attack' : 'idle');
      }
      if (z.burnT > 0) {
        z.burnT -= dt;
        if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x, 0.8 + Math.random(), z.pos.z), 0.4, 1);
        // el fuego quema de a poco (sin puntos por cada quemadura)
        z.burnDmgT = (z.burnDmgT ?? 0.5) - dt;
        if (z.burnDmgT <= 0) {
          z.burnDmgT = 0.5;
          // los puntos del que lo prendió fuego (si es un compañero, se le mandan)
          const by = z.burnBy;
          const remote = by != null && g.net?.host && by !== g.net.id;
          this.damage(z, z.maxHp * 0.08 + 25, { type: 'burn', by, noPoints: remote, point: tmpV.set(z.pos.x, 1.2, z.pos.z).clone() });
          if (remote && this.lastPoints) g.net.pts.set(by, (g.net.pts.get(by) || 0) + this.lastPoints);
          if (z.dead) return;
        }
        if (z.burnT <= 0) this.paint(z);
      }
      if (z.slowT > 0) {
        z.slowT -= dt;
        if (Math.random() < 0.15) g.fx.frost(z.pos, 1);
        if (z.slowT <= 0 && !(z.burnT > 0)) this.paint(z);
      }
    }

    // espasmos: la cabeza pega un tirón de vez en cuando
    if (!z.dead && z.twitchT !== undefined) {
      z.twitchT -= dt;
      if (z.twitchT <= 0) {
        z.twitchT = 1.5 + Math.random() * 5;
        z.twitch = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4);
      }
      z.twitch *= Math.max(0, 1 - dt * 7);
    }

    switch (z.state) {
      case 'rise': {
        const k = Math.min(1, z.stateT / 1.7);
        P.rootY = -1.75 * (1 - k * (2 - k));
        this.poseRise(z, t);
        if (Math.random() < 0.3) g.fx.dirt(z.pos, 1);
        if (k >= 1) this.setState(z, 'chase');
        break;
      }
      case 'approach': {
        const w = g.barriers.windows[z.window];
        const target = w.tearer && w.tearer !== z ? tmpV.copy(w.ext).addScaledVector(w.out, 0.9) : w.ext;
        const dx = target.x - z.pos.x;
        const dz = target.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const step = Math.min(d, z.speed * dt);
          z.pos.x += (dx / d) * step;
          z.pos.z += (dz / d) * step;
          this.turn(z, Math.atan2(dx, dz), 5, dt);
          this.poseGait(z, dt, z.speed, t);
        } else {
          this.turn(z, Math.atan2(-w.out.x, -w.out.z), 6, dt);
          this.poseIdle(z, t);
          if (!w.tearer || w.tearer === z) {
            w.tearer = z;
            this.setState(z, 'tear');
          }
        }
        break;
      }
      case 'tear': {
        const w = g.barriers.windows[z.window];
        this.turn(z, Math.atan2(-w.out.x, -w.out.z), 6, dt);
        const interval = z.speedType === 'walk' ? 1.25 : 0.85;
        // manotazo por la ventana si el jugador está pegado
        const dIn = Math.hypot(pp.x - w.int.x, pp.z - w.int.z);
        const open = g.barriers.count(z.window) <= 1;
        if (z.attackT > 0 || (open && dIn < 1.1 && player.canBeHit() && levelOf(pp.y) === 0)) {
          if (z.attackT === 0) {
            z.attackHit = false;
            g.audio.growl(tmpV.set(z.pos.x, 1.6, z.pos.z), 'attack');
          }
          z.attackT += dt;
          this.poseAttack(z, t);
          if (!z.attackHit && z.attackT > 0.42) {
            z.attackHit = true;
            if (g.barriers.count(z.window) <= 1 && levelOf(pp.y) === 0 && Math.hypot(pp.x - w.int.x, pp.z - w.int.z) < 1.3) g.damagePlayer(player, ZOMBIE_DAMAGE, z.pos);
          }
          if (z.attackT > 0.9) z.attackT = 0;
          break;
        }
        this.poseTear(z, t);
        if (z.stateT > interval) {
          z.stateT = 0;
          if (!g.barriers.tear(z.window)) {
            w.tearer = null;
            w.climber = z;
            z.from.copy(z.pos);
            this.setState(z, 'climb');
          }
        }
        if (g.barriers.count(z.window) === 0 && z.stateT > 0.3) {
          w.tearer = null;
          w.climber = z;
          z.from.copy(z.pos);
          this.setState(z, 'climb');
        }
        break;
      }
      case 'climb': {
        const w = g.barriers.windows[z.window];
        // si repararon la ventana mientras trepaba, vuelve a romper
        const dur = 1.1;
        const k = Math.min(1, z.stateT / dur);
        z.pos.lerpVectors(z.from, w.int, k);
        P.rootY = Math.sin(k * Math.PI) * 0.95;
        this.poseClimb(z, k);
        if (k >= 1) {
          w.climber = null;
          z.window = -1;
          P.rootY = 0;
          this.setState(z, 'chase');
        }
        break;
      }
      case 'chase':
      case 'attack': {
        this.chase(z, dt, t, player, distP);
        break;
      }
      case 'stairs':
        this.stairStep(z, dt, t);
        break;
      case 'fall': {
        // cae por la claraboya al piso del altillo
        z.vel.y -= 14 * dt;
        z.pos.y += z.vel.y * dt;
        P.rootY = Math.max(0, z.pos.y - z.baseY);
        this.poseClimb(z, 0.85);
        if (z.pos.y <= z.baseY) {
          z.pos.y = z.baseY;
          P.rootY = 0;
          this.g.fx.dust(tmpV.set(z.pos.x, z.baseY + 0.05, z.pos.z), { x: 0, y: 1, z: 0 }, [0.45, 0.4, 0.35], 6);
          this.setState(z, 'chase');
        }
        break;
      }
      case 'frozen': {
        if (z.stateT > z.freezeT) {
          g.fx.frost(z.pos, 30);
          g.audio.shatter(tmpV.set(z.pos.x, 1, z.pos.z));
          this.free(z);
        }
        break;
      }
      case 'shocked': {
        this.poseShock(z, t);
        if (Math.random() < 0.4) g.fx.electric(tmpV.set(z.pos.x, 0.5 + Math.random() * 1.2, z.pos.z), 3);
        if (z.stateT > 0.8) {
          this.paint(z, 0x1a1a1a);
          this.setState(z, 'dead');
        }
        break;
      }
      case 'flung': {
        z.vel.y -= 14 * dt;
        z.pos.addScaledVector(z.vel, dt);
        const floorY = z.baseY || 0;
        P.rootY = z.pos.y - floorY;
        P.rootPitch += dt * 9;
        P.rootRoll += dt * 4;
        if (z.pos.y <= floorY && z.stateT > 0.15) {
          z.pos.y = floorY;
          P.rootY = 0;
          P.rootPitch = -Math.PI / 2;
          P.rootRoll = 0;
          z.deathFrom = { ...P };
          z.stateT = 1;
          z.state = 'dead';
        }
        break;
      }
      case 'drop': {
        // se asoma agachado un momento, salta y cae al piso
        if (z.stateT < 0.9) {
          P.rootY = SILL_Y - 0.4;
          this.poseClimb(z, 0.25 + z.stateT * 0.25);
          break;
        }
        if (z.pos.y > 0) {
          if (!z.jumped) {
            z.jumped = true;
            z.vel.set(z.dropDir.x * 1.7, 1.3, z.dropDir.z * 1.7);
          }
          z.vel.y -= 12 * dt;
          z.pos.addScaledVector(z.vel, dt);
          P.rootY = Math.max(0, z.pos.y - 0.2);
          this.poseClimb(z, 0.85);
          if (z.pos.y <= 0) {
            z.pos.y = 0;
            P.rootY = 0;
            z.landT = 0;
            z.jumped = false;
            g.world.collide(z.pos, 0.3, 0.1, 1.7);
            g.fx.dust(tmpV.set(z.pos.x, 0.05, z.pos.z), { x: 0, y: 1, z: 0 }, [0.45, 0.4, 0.35], 8);
            g.audio.land(tmpV.set(z.pos.x, 0.2, z.pos.z));
          }
          break;
        }
        z.landT = (z.landT || 0) + dt;
        P.rootY = -0.35 * (1 - Math.min(1, z.landT / 0.45));
        this.poseRise(z, t);
        if (z.landT > 0.45) this.setState(z, 'chase');
        break;
      }
      case 'burnrun': {
        // prendido fuego: corre a los manotazos para cualquier lado y cae
        z.turnT = (z.turnT ?? 0) - dt;
        if (z.turnT <= 0) {
          z.turnT = 0.35 + Math.random() * 0.4;
          z.runYaw = z.yaw + (Math.random() - 0.5) * 2.2;
        }
        this.turn(z, z.runYaw ?? z.yaw, 5, dt);
        z.pos.x += Math.sin(z.yaw) * 3.4 * dt;
        z.pos.z += Math.cos(z.yaw) * 3.4 * dt;
        g.world.collide(z.pos, 0.3, 0.1, 1.7);
        this.poseBurnRun(z, dt, t);
        g.fx.fire(tmpV.set(z.pos.x, 0.5 + Math.random() * 1.2, z.pos.z), 0.5, 2);
        if (z.stateT > z.runT) {
          z.deathFrom = null;
          this.setState(z, 'dead');
        }
        break;
      }
      case 'dead': {
        this.poseDeath(z);
        z.corpseT += dt;
        if (z.steamT > 0) {
          z.steamT -= dt;
          if (Math.random() < 0.35) g.fx.steam(tmpV.set(z.pos.x, 0.35, z.pos.z), 1, 0.5);
        }
        if (z.fountT > 0) {
          z.fountT -= dt;
          const np = tmpV.setFromMatrixPosition(z.mats[1]);
          np.y += 0.3 * z.scale;
          g.fx.blood(np, { x: (Math.random() - 0.5) * 0.4, y: 2.2, z: (Math.random() - 0.5) * 0.4 }, 2, 0.8);
        }
        if (z.corpseT > 9) {
          P.rootY = -Math.min(1.2, (z.corpseT - 9) * 0.8) + (z.crawler ? 0 : 0.12);
          z.static = false;
        }
        if (z.corpseT > 10.6) this.free(z);
        break;
      }
      default:
        break;
    }
  }

  thinkDog(z, dt, t, player) {
    const g = this.g;
    z.stateT += dt;
    if (z.state === 'stairs') {
      this.stairStep(z, dt, t);
      return;
    }
    if (z.state === 'dogspawn') {
      if (Math.random() < 0.6) g.fx.fire(tmpV.set(z.pos.x, 0.25, z.pos.z), 0.7, 1);
      if (z.stateT > 0.6) {
        this.setState(z, 'chase');
        g.audio.howl(tmpV.set(z.pos.x, 0.8, z.pos.z));
      }
      return;
    }
    if (z.dead) {
      // al rato se deshace en brasas
      z.corpseT += dt;
      if (z.stateT > 1.1 && !z.burst) {
        z.burst = true;
        g.fx.fire(tmpV.set(z.pos.x, 0.3, z.pos.z), 0.8, 8);
        g.fx.sparks(tmpV, 1.5, { x: 0, y: 1, z: 0 }, [1, 0.5, 0.2]);
      }
      if (z.stateT > 1.5) this.free(z);
      return;
    }
    if (z.slowT > 0) z.slowT -= dt;
    if (z.burnT > 0) {
      z.burnT -= dt;
      if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x, 0.6, z.pos.z), 0.4, 1);
    }
    z.growlT -= dt;
    if (z.growlT <= 0) {
      z.growlT = 1.2 + Math.random() * 2.5;
      if (Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z) < 22) g.audio.bark(tmpV.set(z.pos.x, 0.7, z.pos.z));
    }
    this.chase(z, dt, t, player, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));
  }

  setState(z, s) {
    z.state = s;
    z.stateT = 0;
    z.attackT = 0;
  }

  chase(z, dt, t, player, distP) {
    const g = this.g;
    const lure = this.lure;
    // va por el jugador de pie más cercano: a los tirados no los buscan
    const target = g.nearestPlayer(z.pos.x, z.pos.z, z.pos.y);
    if (target && target !== player) {
      distP = Math.hypot(target.pos.x - z.pos.x, target.pos.z - z.pos.z);
      player = target;
    }
    let tx = player.pos.x;
    let tz = player.pos.z;
    let nav = g.nav;
    // no queda nadie de pie: deambulan despacio alrededor, sin ir al que está tirado
    const wander = !target && !lure;
    if (wander) {
      z.wanderT = (z.wanderT ?? 0) - dt;
      if (!z.wander || z.wanderT <= 0 || Math.hypot(z.wander.x - z.pos.x, z.wander.z - z.pos.z) < 0.8) {
        // hacia afuera, del lado donde ya están
        const a = Math.atan2(z.pos.z - player.pos.z, z.pos.x - player.pos.x) + (Math.random() - 0.5) * 1.4;
        const r = 7 + Math.random() * 4;
        z.wander = { x: player.pos.x + Math.cos(a) * r, z: player.pos.z + Math.sin(a) * r };
        z.wanderT = 3 + Math.random() * 3;
      }
      tx = z.wander.x;
      tz = z.wander.z;
    }
    if (lure && Math.hypot(lure.pos.x - z.pos.x, lure.pos.z - z.pos.z) < 30) {
      tx = lure.pos.x;
      tz = lure.pos.z;
      nav = this.navLure;
    }
    // dos pisos: si el que busca está en el otro, primero va a la escalera
    const zl = z.level || 0;
    const sameLevel = zl === levelOf(player.pos.y);
    const reach = sameLevel ? distP : 99;
    if (!lure && !wander && !sameLevel) {
      const e = zl === 0 ? STAIR_BOTTOM : STAIR_TOP;
      tx = e.x;
      tz = e.z;
      nav = zl === 0 ? this.navStair0 : this.navAtticTop;
      nav.update(e.x, e.z);
      if (Math.hypot(e.x - z.pos.x, e.z - z.pos.z) < 0.6) {
        this.startStairs(z, zl === 0 ? 1 : -1);
        return;
      }
    } else if (zl === 1 && !lure) {
      nav = this.navAttic;
      nav.update(tx, tz);
    }
    const dx = tx - z.pos.x;
    const dz = tz - z.pos.z;
    const dist = Math.hypot(dx, dz);

    // línea de visión: se chequea de a ratos
    z.losT -= dt;
    if (z.losT <= 0) {
      z.losT = 0.25 + Math.random() * 0.15;
      const ey = (z.baseY || 0) + 1.2;
      z.los = dist < 14 && g.world.clear(tmpV.set(z.pos.x, ey, z.pos.z), tmpV2.set(tx, ey, tz));
    }
    let mx = 0;
    let mz = 0;
    if (dist < 1.6 || z.los || wander) {
      mx = dx / (dist || 1);
      mz = dz / (dist || 1);
    } else if (nav.direction(z.pos.x, z.pos.z, dirOut)) {
      mx = dirOut.x;
      mz = dirOut.z;
    } else {
      mx = dx / (dist || 1);
      mz = dz / (dist || 1);
    }

    const speed = (z.crawler ? 0.75 : z.speed) * (z.slowT > 0 ? 0.4 : 1) * (wander ? 0.55 : 1);
    const attacking = z.state === 'attack';
    // pasos arrastrados cuando andan cerca
    if (distP < 7) {
      z.stepT = (z.stepT ?? Math.random()) - dt * (z.speedType === 'walk' ? 1.3 : 2.6);
      if (z.stepT <= 0) {
        z.stepT = 1;
        g.audio.shuffle(tmpV.set(z.pos.x, 0.2, z.pos.z));
      }
    }
    const stop = !lure && !wander && reach < 0.95;
    const sp = attacking ? speed * 0.25 : stop ? 0 : speed;
    this.turn(z, Math.atan2(mx, mz), z.speedType === 'sprint' ? 9 : 6, dt);
    // avanzar hacia donde mira (así giran como personas, no como flechas)
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const align = Math.max(0.2, fx * mx + fz * mz);
    z.pos.x += fx * sp * align * dt;
    z.pos.z += fz * sp * align * dt;
    const by = z.baseY || 0;
    g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
    z.baseY = g.world.floorAt(z.pos.x, z.pos.z, by);
    z.pos.y = z.baseY;

    // empujar fuera del jugador
    const pdx = z.pos.x - player.pos.x;
    const pdz = z.pos.z - player.pos.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd < 0.7 && pd > 1e-4 && sameLevel) {
      z.pos.x += (pdx / pd) * (0.7 - pd);
      z.pos.z += (pdz / pd) * (0.7 - pd);
    }

    if (!attacking) {
      if (z.crawler) this.poseCrawl(z, dt);
      else this.poseGait(z, dt, sp * align, t);
      if (reach < 1.3 && (player.canBeHit ? player.canBeHit() : !player.downed && !player.dead) && !lure) {
        this.setState(z, 'attack');
        z.attackHit = false;
        if (z.dog) g.audio.bark(tmpV.set(z.pos.x, 0.7, z.pos.z));
        else g.audio.growl(tmpV.set(z.pos.x, 1.5, z.pos.z), 'attack');
      }
    } else {
      z.attackT += dt;
      if (z.crawler) this.poseCrawl(z, dt);
      else this.poseAttack(z, t);
      if (!z.attackHit && z.attackT > 0.42) {
        z.attackHit = true;
        if (reach < 1.65) g.damagePlayer(player, ZOMBIE_DAMAGE, z.pos);
      }
      if (z.attackT > 0.95) this.setState(z, 'chase');
    }

    // zombies perdidos o trabados: vuelven a la cola de la ronda
    if (distP > 36 && !z.los) z.farT += dt;
    else z.farT = 0;
    if (z.farT > 14) {
      this.free(z);
      g.rounds.requeue(1);
    }
  }

  // ---------------- Capataz ----------------
  thinkBoss(z, dt, t, player) {
    const g = this.g;
    if (g.net) player = g.nearestPlayer(z.pos.x, z.pos.z) || player;
    z.stateT += dt;
    const P = z.P;
    const pp = player.pos;
    const dxp = pp.x - z.pos.x;
    const dzp = pp.z - z.pos.z;
    const distP = Math.hypot(dxp, dzp);
    if (!z.dead) {
      z.growlT -= dt;
      if (z.growlT <= 0) {
        z.growlT = 3 + Math.random() * 3;
        g.audio.growl(tmpV.set(z.pos.x, 2, z.pos.z), Math.random() < 0.5 ? 'boss' : 'attack');
      }
    }
    if (!z.mandinga) g.hud.setBossBar(z.dead ? null : z.enraged ? 'El Capataz (enfurecido)' : 'El Capataz', Math.max(0, z.hp / z.maxHp));
    switch (z.state) {
      case 'intro': {
        this.turn(z, Math.atan2(dxp, dzp), 4, dt);
        this.poseRoar(z, t);
        if (z.stateT > 1.8) this.setState(z, 'chase');
        break;
      }
      case 'chase': {
        if (levelOf(pp.y) === 1) {
          // el Capataz no entra por la escalera: se planta abajo y manda a los peones
          this.navStair0.update(STAIR_BOTTOM.x, STAIR_BOTTOM.z);
          const ex = STAIR_BOTTOM.x - z.pos.x;
          const ez = STAIR_BOTTOM.z - z.pos.z;
          const ed = Math.hypot(ex, ez);
          let mx = ex / (ed || 1);
          let mz = ez / (ed || 1);
          if (!g.world.clear(tmpV.set(z.pos.x, 1.4, z.pos.z), tmpV2.set(STAIR_BOTTOM.x, 1.4, STAIR_BOTTOM.z)) && this.navStair0.direction(z.pos.x, z.pos.z, dirOut)) {
            mx = dirOut.x;
            mz = dirOut.z;
          }
          if (ed > 1.6) this.moveBoss(z, mx, mz, z.speed, dt, t);
          else this.poseRoar(z, t);
          z.summonCd = (z.summonCd ?? 6) - dt;
          if (z.summonCd <= 0) {
            z.summonCd = 13;
            this.setState(z, 'summon');
            this.callPeones(z, 2);
            g.hud.subtitle('El Capataz no sube: les silba a los peones para que suban.', 3, 'boss');
          }
          break;
        }
        // segunda fase: con la mitad de la vida se enfurece y llama a los peones
        if (!z.enraged && !z.mandinga && z.hp < z.maxHp * 0.5) {
          z.enraged = true;
          z.speed *= 1.3;
          this.setState(z, 'enrage');
          this.callPeones(z, 3 + Math.min(3, (g.rounds?.players || 1) - 1));
          g.hud.subtitle('¡El Capataz se enfureció! Silbó y vienen los peones.', 3, 'boss');
          break;
        }
        z.whipCd = (z.whipCd ?? 3) - dt;
        z.chargeCd = (z.chargeCd ?? 7) - dt;
        z.summonCd = (z.summonCd ?? 20) - dt;
        const ready = (z.whipCd <= 0 && distP > 3.2 && distP < 8.5) || (z.chargeCd <= 0 && distP > 7 && distP < 18);
        if (ready && player.canBeHit?.() !== false && g.world.clear(tmpV.set(z.pos.x, 1.4, z.pos.z), tmpV2.set(pp.x, 1.4, pp.z))) {
          if (z.chargeCd <= 0 && distP > 7) {
            z.chargeCd = (z.enraged ? 7 : 10) + Math.random() * 3;
            this.setState(z, 'chargeWind');
            g.audio.growl(tmpV.set(z.pos.x, 2, z.pos.z), 'boss');
          } else {
            z.whipCd = (z.enraged ? 3.5 : 5) + Math.random() * 2;
            this.setState(z, 'whipWind');
          }
          break;
        }
        if (z.enraged && z.summonCd <= 0) {
          z.summonCd = 22;
          this.setState(z, 'summon');
          this.callPeones(z, 2);
          break;
        }
        z.lockT -= dt;
        if (z.lockT <= 0) {
          z.lockT = 10 + Math.random() * 8;
          const target = g.interact.lockTarget(z.pos);
          if (target) {
            z.lockTarget = target;
            this.setState(z, 'toLock');
            break;
          }
        }
        let mx = dxp / (distP || 1);
        let mz = dzp / (distP || 1);
        const los = distP < 12 && g.world.clear(tmpV.set(z.pos.x, 1.4, z.pos.z), tmpV2.set(pp.x, 1.4, pp.z));
        if (!los && g.nav.direction(z.pos.x, z.pos.z, dirOut)) {
          mx = dirOut.x;
          mz = dirOut.z;
        }
        this.moveBoss(z, mx, mz, z.speed, dt, t);
        if (distP < 2.3 && levelOf(pp.y) === 0 && (player.canBeHit ? player.canBeHit() : !player.downed && !player.dead)) {
          this.setState(z, 'slam');
          z.attackHit = false;
        }
        break;
      }
      case 'toLock': {
        const tg = z.lockTarget;
        const dx = tg.front.x - z.pos.x;
        const dz = tg.front.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (tg.locked || z.stateT > 15) {
          this.setState(z, 'chase');
          break;
        }
        let mx = dx / (d || 1);
        let mz = dz / (d || 1);
        if (!g.world.clear(tmpV.set(z.pos.x, 1.4, z.pos.z), tmpV2.set(tg.front.x, 1.4, tg.front.z))) {
          // ir por el campo de flujo del señuelo apuntado a la máquina
          this.navLure.update(tg.front.x, tg.front.z, true);
          if (this.navLure.direction(z.pos.x, z.pos.z, dirOut)) {
            mx = dirOut.x;
            mz = dirOut.z;
          }
        }
        this.moveBoss(z, mx, mz, z.speed, dt, t);
        if (d < 1.4) this.setState(z, 'locking');
        if (distP < 2.2 && (player.canBeHit ? player.canBeHit() : !player.downed && !player.dead)) {
          this.setState(z, 'slam');
          z.attackHit = false;
        }
        break;
      }
      case 'locking': {
        const tg = z.lockTarget;
        this.turn(z, Math.atan2(tg.pos.x - z.pos.x, tg.pos.z - z.pos.z), 5, dt);
        this.poseSlam(z, (z.stateT % 0.8) / 0.8 * 1.3);
        if (z.stateT > 1.6) {
          g.interact.lock(tg);
          g.audio.chain(tg.pos);
          this.setState(z, 'chase');
        }
        break;
      }
      case 'slam': {
        this.turn(z, Math.atan2(dxp, dzp), 3, dt);
        this.poseSlam(z, z.stateT);
        if (!z.attackHit && z.stateT > 0.75) {
          z.attackHit = true;
          const hit = tmpV.set(z.pos.x + Math.sin(z.yaw) * 1.4, 0.05, z.pos.z + Math.cos(z.yaw) * 1.4);
          g.audio.bossSlam(hit);
          g.fx.dust(hit, { x: 0, y: 1, z: 0 }, [0.4, 0.35, 0.3], 14);
          g.fx.addShake(0.5);
          if (Math.hypot(pp.x - hit.x, pp.z - hit.z) < 2.4 && levelOf(pp.y) === 0) g.damagePlayer(player, BOSS_DAMAGE, z.pos);
        }
        if (z.stateT > 1.4) this.setState(z, 'chase');
        break;
      }
      case 'whipWind': {
        // levanta el rebenque apuntando a la víctima
        this.turn(z, Math.atan2(dxp, dzp), 5, dt);
        this.poseSlam(z, Math.min(0.55, z.stateT * 0.8));
        if (z.stateT > 0.65) {
          this.setState(z, 'whip');
          this.whipHit(z);
        }
        break;
      }
      case 'whip':
        this.poseSlam(z, 0.55 + Math.min(0.85, z.stateT * 2.6));
        if (z.stateT > 0.45) this.setState(z, 'chase');
        break;
      case 'chargeWind': {
        // escarba el piso mirando fijo: después sale derecho
        this.turn(z, Math.atan2(dxp, dzp), 6, dt);
        this.poseRoar(z, t);
        if (Math.random() < 0.3) g.fx.dust(tmpV.set(z.pos.x, 0.1, z.pos.z), { x: 0, y: 0.6, z: 0 }, [0.4, 0.35, 0.3], 3);
        if (z.stateT > 0.85) {
          this.setState(z, 'charge');
          z.chargeYaw = z.yaw;
          z.chargeHits = new Set();
        }
        break;
      }
      case 'charge': {
        const fx = Math.sin(z.chargeYaw);
        const fz = Math.cos(z.chargeYaw);
        const sp = 9.5 * dt;
        const bx = z.pos.x;
        const bz = z.pos.z;
        z.pos.x += fx * sp;
        z.pos.z += fz * sp;
        g.world.collide(z.pos, 0.45, 0.1, 2.4);
        const moved = Math.hypot(z.pos.x - bx, z.pos.z - bz);
        this.poseGait(z, dt, 7, t);
        if (Math.random() < 0.6) g.fx.dust(tmpV.set(z.pos.x, 0.1, z.pos.z), { x: -fx, y: 0.5, z: -fz }, [0.4, 0.35, 0.3], 2);
        // atropella a los que agarra en el camino
        for (const p of this.bossTargets()) {
          if (z.chargeHits.has(p)) continue;
          if (Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) > 1.6) continue;
          z.chargeHits.add(p);
          g.damagePlayer(p, 90, z.pos);
          if (p === g.player) {
            p.vel.x += fx * 9;
            p.vel.z += fz * 9;
            p.vel.y = 3;
            p.onGround = false;
          }
        }
        // se la dio contra la pared (o contra la roca de la Salamanca): queda atontado
        const edge = g.arena?.active && Math.hypot(z.pos.x - ARENA.x, z.pos.z - ARENA.z) > ARENA.r - 1.4;
        if (z.stateT > 0.12 && (moved < sp * 0.35 || edge)) {
          this.setState(z, 'stunned');
          g.audio.bossSlam(tmpV.set(z.pos.x, 1, z.pos.z));
          g.fx.sparks(tmpV.set(z.pos.x + fx * 0.6, 2, z.pos.z + fz * 0.6), 1.5, { x: -fx, y: 1, z: -fz });
          g.fx.addShake(0.4);
          g.hud.subtitle('¡Se dio contra la pared! Está atontado: dale ahora.', 2.5);
          g.net?.event('sub', { x: '¡Se dio contra la pared! Está atontado: dale ahora.', d: 2.5 });
        } else if (z.stateT > 1.8) this.setState(z, 'chase');
        break;
      }
      case 'stunned':
        this.poseShock(z, t * 0.35);
        if (Math.random() < 0.3) g.fx.sparkle(tmpV.set(z.pos.x + (Math.random() - 0.5) * 0.6, 2.9 * (z.scale / 1.4), z.pos.z + (Math.random() - 0.5) * 0.6), [1, 0.9, 0.4], 1, 0.3);
        if (z.stateT > 2.8) this.setState(z, 'chase');
        break;
      case 'enrage':
      case 'summon':
        this.turn(z, Math.atan2(dxp, dzp), 3, dt);
        this.poseRoar(z, t);
        if (z.stateT > (z.state === 'enrage' ? 1.8 : 1.2)) this.setState(z, 'chase');
        break;
      case 'dead': {
        this.poseDeath(z);
        z.corpseT += dt;
        if (z.corpseT > 7) P.rootY = -Math.min(1.5, (z.corpseT - 7) * 0.8);
        if (z.corpseT > 9) this.removeBoss();
        break;
      }
      default:
        break;
    }
  }

  moveBoss(z, mx, mz, speed, dt, t) {
    const g = this.g;
    this.turn(z, Math.atan2(mx, mz), 4, dt);
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const align = Math.max(0.2, fx * mx + fz * mz);
    z.pos.x += fx * speed * align * dt;
    z.pos.z += fz * speed * align * dt;
    g.world.collide(z.pos, 0.45, 0.1, 2.4);
    const pdx = z.pos.x - g.player.pos.x;
    const pdz = z.pos.z - g.player.pos.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd < 0.9 && pd > 1e-4) {
      z.pos.x += (pdx / pd) * (0.9 - pd);
      z.pos.z += (pdz / pd) * (0.9 - pd);
    }
    const before = Math.floor(z.phase / Math.PI);
    this.poseGait(z, dt, speed * align * 0.8, t);
    if (Math.floor(z.phase / Math.PI) !== before) {
      g.audio.footstep('concrete', 3);
      g.fx.addShake(0.04);
    }
  }

  // ---------------- poses ----------------
  poseGait(z, dt, speed, t) {
    const P = z.P;
    const type = z.speedType;
    z.phase += dt * (type === 'walk' ? 2.6 : type === 'run' ? 1.9 : 1.75) * Math.max(0.6, speed);
    const s = Math.sin(z.phase);
    const c = Math.cos(z.phase);
    const limp = z.limp;
    if (type === 'walk') {
      P.hipY = 0.92 + Math.abs(c) * 0.03;
      P.torsoP = 0.28 + s * 0.03;
      P.torsoR = s * 0.13;
      P.torsoY = s * 0.12;
      P.headP = -0.2 + Math.sin(t * 1.3 + z.phase) * 0.05;
      P.headR = z.headTilt + s * 0.06;
      P.headY = Math.sin(t * 0.7 + z.slot) * 0.15;
      P.shLp = -1.3 + s * 0.12 + z.armOff;
      P.shRp = -1.25 - s * 0.12 - z.armOff;
      P.shLr = 0.18;
      P.shRr = -0.18;
      P.elL = -0.25;
      P.elR = -0.35;
      P.hipLp = s * 0.36 * (1 - limp * 0.6);
      P.hipRp = -s * 0.36;
      P.hipLr = 0;
      P.hipRr = 0;
      P.knL = 0.12 + Math.max(0, Math.sin(z.phase + 1.4)) * 0.55 * (1 - limp);
      P.knR = 0.12 + Math.max(0, Math.sin(z.phase + 1.4 + Math.PI)) * 0.55;
    } else if (type === 'run') {
      P.hipY = 0.9 + Math.abs(c) * 0.05;
      P.torsoP = 0.42;
      P.torsoR = s * 0.08;
      P.torsoY = s * 0.15;
      P.headP = -0.35;
      P.headR = z.headTilt * 0.5;
      P.headY = 0;
      P.shLp = -1.15 + s * 0.35;
      P.shRp = -1.15 - s * 0.35;
      P.shLr = 0.2;
      P.shRr = -0.2;
      P.elL = -0.5;
      P.elR = -0.5;
      P.hipLp = s * 0.7;
      P.hipRp = -s * 0.7;
      P.knL = 0.2 + Math.max(0, Math.sin(z.phase + 1.3)) * 1.1;
      P.knR = 0.2 + Math.max(0, Math.sin(z.phase + 1.3 + Math.PI)) * 1.1;
    } else {
      P.hipY = 0.88 + Math.abs(c) * 0.07;
      P.torsoP = 0.55;
      P.torsoR = 0;
      P.torsoY = s * 0.2;
      P.headP = -0.5;
      P.headR = 0;
      P.headY = 0;
      P.shLp = -0.3 - s * 1.0;
      P.shRp = -0.3 + s * 1.0;
      P.shLr = 0.15;
      P.shRr = -0.15;
      P.elL = -1.4;
      P.elR = -1.4;
      P.hipLp = s * 0.95;
      P.hipRp = -s * 0.95;
      P.knL = 0.3 + Math.max(0, Math.sin(z.phase + 1.2)) * 1.5;
      P.knR = 0.3 + Math.max(0, Math.sin(z.phase + 1.2 + Math.PI)) * 1.5;
    }
    if (z.boss) {
      P.shRp = -0.5 - s * 0.3;
      P.elR = -0.6;
    }
  }

  poseIdle(z, t) {
    const P = z.P;
    const s = Math.sin(t * 1.5 + z.slot);
    P.hipY = 0.92;
    P.torsoP = 0.3 + s * 0.04;
    P.torsoR = s * 0.05;
    P.headP = -0.1;
    P.headR = z.headTilt;
    P.shLp = -1.1 + s * 0.1;
    P.shRp = -1.0 - s * 0.1;
    P.elL = -0.3;
    P.elR = -0.3;
    P.hipLp = 0;
    P.hipRp = 0;
    P.knL = 0.1;
    P.knR = 0.1;
  }

  poseTear(z, t) {
    const P = z.P;
    const s = Math.sin(t * 7 + z.slot);
    this.poseIdle(z, t);
    P.torsoP = 0.45 + s * 0.08;
    P.shLp = -1.6 + s * 0.45;
    P.shRp = -1.6 - s * 0.45;
    P.elL = -0.2 - Math.max(0, -s) * 0.9;
    P.elR = -0.2 - Math.max(0, s) * 0.9;
  }

  poseAttack(z, t) {
    const P = z.P;
    const k = z.attackT;
    this.poseIdle(z, t);
    if (k < 0.35) {
      const e = k / 0.35;
      P.shLp = -1.2 - e * 1.4;
      P.shRp = -1.2 - e * 1.5;
      P.torsoP = 0.25 - e * 0.15;
      P.elL = P.elR = -0.6 * e;
    } else if (k < 0.55) {
      const e = (k - 0.35) / 0.2;
      P.shLp = -2.6 + e * 2.1;
      P.shRp = -2.7 + e * 2.2;
      P.shLr = 0.2 - e * 0.5;
      P.shRr = -0.2 + e * 0.5;
      P.torsoP = 0.1 + e * 0.5;
      P.elL = P.elR = -0.6 + e * 0.4;
    } else {
      const e = Math.min(1, (k - 0.55) / 0.4);
      P.shLp = -0.5 - e * 0.8;
      P.shRp = -0.5 - e * 0.8;
      P.torsoP = 0.6 - e * 0.3;
    }
  }

  poseClimb(z, k) {
    const P = z.P;
    P.hipY = 0.92;
    P.torsoP = 0.7 - k * 0.3;
    P.headP = -0.6;
    P.shLp = -1.9;
    P.shRp = -1.8;
    P.elL = -0.4;
    P.elR = -0.5;
    const lift = Math.sin(k * Math.PI);
    P.hipLp = -1.3 * lift;
    P.knL = 1.5 * lift;
    P.hipRp = -0.6 * lift;
    P.knR = 1.0 * lift;
  }

  poseRise(z, t) {
    const P = z.P;
    const s = Math.sin(t * 5 + z.slot);
    P.hipY = 0.92;
    P.torsoP = -0.15 + s * 0.05;
    P.torsoR = s * 0.1;
    P.headP = -0.4;
    P.shLp = -2.8 + s * 0.3;
    P.shRp = -2.7 - s * 0.3;
    P.elL = -0.5;
    P.elR = -0.4;
    P.hipLp = 0;
    P.hipRp = 0;
    P.knL = 0.2;
    P.knR = 0.2;
  }

  poseCrawl(z, dt) {
    const P = z.P;
    z.phase += dt * 3;
    const s = Math.sin(z.phase);
    P.rootPitch = 1.35;
    P.rootY = 0.05;
    P.hipY = 0.2;
    P.torsoP = -0.1;
    P.torsoR = s * 0.1;
    P.headP = -1.1;
    P.headR = 0;
    P.shLp = -2.4 + s * 0.7;
    P.shRp = -2.4 - s * 0.7;
    P.elL = -0.3 - Math.max(0, s) * 0.8;
    P.elR = -0.3 - Math.max(0, -s) * 0.8;
    P.hipLp = 0.1;
    P.hipRp = 0.1;
    P.knL = 0;
    P.knR = 0;
  }

  poseShock(z, t) {
    const P = z.P;
    const j = () => (Math.random() - 0.5) * 0.5;
    P.torsoP = -0.2 + j();
    P.torsoR = j();
    P.headP = -0.4 + j();
    P.headR = j();
    P.shLp = -1.6 + j();
    P.shRp = -1.6 + j();
    P.shLr = 1.0 + j();
    P.shRr = -1.0 + j();
    P.elL = j();
    P.elR = j();
    P.knL = 0.2 + Math.abs(j());
    P.knR = 0.2 + Math.abs(j());
    P.rootY = 0.05 + Math.sin(t * 40) * 0.03;
  }

  poseRoar(z, t) {
    const P = z.P;
    const s = Math.sin(t * 12);
    P.hipY = 0.92;
    P.torsoP = -0.25;
    P.headP = -0.6 + s * 0.05;
    P.shLp = -2.6;
    P.shRp = -2.5;
    P.shLr = 0.7;
    P.shRr = -0.7;
    P.elL = -0.8;
    P.elR = -0.8;
    P.hipLp = 0;
    P.hipRp = 0;
    P.knL = 0.15;
    P.knR = 0.15;
  }

  poseSlam(z, k) {
    const P = z.P;
    P.hipY = 0.9;
    P.hipLp = -0.3;
    P.hipRp = 0.3;
    P.knL = 0.4;
    P.knR = 0.2;
    if (k < 0.6) {
      const e = k / 0.6;
      P.torsoP = -0.3 * e;
      P.shLp = P.shRp = -1 - e * 2.1;
      P.elL = P.elR = -0.5 * e;
    } else if (k < 0.8) {
      const e = (k - 0.6) / 0.2;
      P.torsoP = -0.3 + e * 1.0;
      P.shLp = P.shRp = -3.1 + e * 2.6;
      P.elL = P.elR = -0.5 + e * 0.5;
    } else {
      P.torsoP = 0.7 - Math.min(1, (k - 0.8) / 0.6) * 0.4;
      P.shLp = P.shRp = -0.5;
    }
  }

  poseBurnRun(z, dt, t) {
    this.poseGait(z, dt, 4, t);
    const P = z.P;
    P.shLp = -2.5 + Math.sin(t * 17 + z.phase) * 0.6;
    P.shRp = -2.3 + Math.cos(t * 15 + z.phase) * 0.6;
    P.shLr = 0.5;
    P.shRr = -0.5;
    P.elL = -0.9 + Math.sin(t * 21) * 0.3;
    P.elR = -0.8 + Math.cos(t * 19) * 0.3;
    P.headP = -0.45;
    P.torsoP = 0.15;
  }

  poseDeath(z) {
    const P = z.P;
    if (z.static) return;
    const k = Math.min(1, z.stateT / 0.75);
    const e = k * k;
    const back = z.deathBack ? -1 : 1;
    if (!z.deathFrom) z.deathFrom = { ...P };
    const f = z.deathFrom;
    const lerp = (a, b) => a + (b - a) * e;
    if (!z.crawler) {
      P.rootPitch = lerp(f.rootPitch, (Math.PI / 2) * back);
      P.rootY = lerp(f.rootY, 0.14);
      P.hipY = lerp(f.hipY, 0.8);
      P.knL = lerp(f.knL, 0.4 * (back > 0 ? 1 : 0.2));
      P.knR = lerp(f.knR, 0.2);
    }
    P.torsoP = lerp(f.torsoP, 0.1 * back);
    P.shLp = lerp(f.shLp, back > 0 ? -2.8 : -0.4);
    P.shRp = lerp(f.shRp, back > 0 ? -2.5 : -0.7);
    P.shLr = lerp(f.shLr, 0.9);
    P.shRr = lerp(f.shRr, -0.7);
    P.elL = lerp(f.elL, -0.3);
    P.elR = lerp(f.elR, -0.9);
    P.headR = lerp(f.headR, 0.6);
    P.hipLp = lerp(f.hipLp, 0.1);
    P.hipRp = lerp(f.hipRp, -0.2);
    if (k >= 1 && z.corpseT < 9) z.solvedOnce = true;
  }

  // ---------------- render ----------------
  render() {
    const blobM = new THREE.Matrix4();
    for (const z of this.pool) {
      if (!z.active) continue;
      if (!z.static) {
        // el espasmo se suma solo para este cuadro
        const tw = z.dead ? 0 : z.twitch || 0;
        z.P.headY += tw * 0.8;
        z.P.headR += tw * 0.5;
        const by = z.baseY || 0;
        z.P.rootY += by;
        solvePose(z.mats, z.pos.x, z.pos.z, z.yaw, z.scale, z.P);
        z.P.rootY -= by;
        z.P.headY -= tw * 0.8;
        z.P.headR -= tw * 0.5;
        if (z.solvedOnce) {
          z.static = true;
          z.solvedOnce = false;
        }
      }
      for (const M of this.meshes) {
        const off = M.need && !z.flags?.[M.need];
        for (let k = 0; k < M.parts.length; k++) {
          const part = M.parts[k];
          M.im.setMatrixAt(z.slot * M.parts.length + k, off || z.hidden & (1 << part) ? ZERO : z.mats[part]);
        }
      }
      if (z.state === 'approach' || z.state === 'tear' || z.state === 'rise' || z.state === 'drop' || z.state === 'dogspawn' || z.dead) this.blobs.setMatrixAt(z.slot, ZERO);
      else {
        blobM.makeScale(0.9, 1, 0.9).setPosition(z.pos.x, (z.baseY || 0) + 0.015, z.pos.z);
        this.blobs.setMatrixAt(z.slot, blobM);
      }
    }
    for (const M of this.meshes) M.im.instanceMatrix.needsUpdate = true;
    this.dogRig.update(this.pool);
    this.telegraph();
    const b = this.boss;
    if (b) {
      solvePose(b.mats, b.pos.x, b.pos.z, b.yaw, b.scale, b.P);
      solveExtras(b.mats);
      const parts = this.bossRig.parts;
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i];
        if (!m) continue;
        m.matrix.copy(b.mats[i]);
        m.matrixWorldNeedsUpdate = true;
      }
      this.bossRig.hat.visible = b.hatHp > 0;
      blobM.makeScale(1.5, 1, 1.5).setPosition(b.pos.x, 0.015, b.pos.z);
      this.blobs.setMatrixAt(MAX, b.dead ? ZERO : blobM);
    }
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  // ---------------- impactos y daño ----------------
  // Todos los zombies que cruza el rayo, ordenados por distancia.
  raycast(o, d, maxT) {
    const hits = this.hits;
    hits.length = 0;
    const test = (z) => {
      if (!z.active || z.dead) return;
      if (z.dog) {
        if (z.state === 'dogspawn') return;
        const h = DogRig.raycast(z, o, d, maxT);
        if (h) hits.push({ z, t: h.t, zone: h.zone });
        return;
      }
      tmpV.set(z.pos.x - o.x, z.pos.y + 1 * z.scale - o.y, z.pos.z - o.z);
      const along = tmpV.dot(d);
      if (along < -1.5 || along > maxT + 1.5) return;
      const perp2 = tmpV.lengthSq() - along * along;
      const r = 1.25 * z.scale;
      if (perp2 > r * r) return;
      const h = hitParts(z.mats, o, d, maxT, z.hidden);
      if (h) hits.push({ z, t: h.t, zone: z.boss && h.zone === 'head' && z.hatHp > 0 ? 'hat' : h.zone, part: h.part, arm: h.arm, leg: h.leg });
    };
    for (const z of this.pool) test(z);
    if (this.boss) test(this.boss);
    const pb = this.g.pombero?.hitTest(o, d, maxT);
    if (pb) hits.push(pb);
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  // Zombies vivos dentro de un radio (explosiones, cuchillo, conos).
  inRadius(p, r, out = []) {
    out.length = 0;
    const r2 = r * r;
    const check = (z) => {
      if (!z.active || z.dead) return;
      const dx = z.pos.x - p.x;
      const dz = z.pos.z - p.z;
      const dy = z.pos.y + 1 - p.y;
      const d2 = dx * dx + dz * dz + dy * dy * 0.3;
      if (d2 <= r2) out.push({ z, d: Math.sqrt(d2) });
    };
    for (const z of this.pool) check(z);
    if (this.boss) check(this.boss);
    if (this.g.pombero && this.g.pombero.state !== 'appear') check(this.g.pombero.z);
    return out;
  }

  // info: { zone, type, dir, point, weapon, noPoints }
  damage(z, amount, info = {}) {
    if (!z.active || z.dead) return false;
    const g = this.g;
    // de invitado, el daño lo aplica el anfitrión: acá solo se ve la sangre
    if (g.net?.guest) {
      if (info.point && !['freeze', 'chain', 'blast'].includes(info.type)) {
        g.fx.blood(info.point, info.dir ? tmpV2.copy(info.dir).multiplyScalar(0.6) : { x: 0, y: 0.5, z: 0 }, info.zone === 'head' ? 14 : 8);
      }
      g.net.reportHit(z, amount, info);
      return true;
    }
    if (z.pombero) return g.pombero.damage(amount, info);
    this.lastPoints = 0;
    let dmg = amount;
    const type = info.type || 'bullet';
    if (z.boss) {
      if (['chain', 'freeze', 'blast', 'nuke', 'scald'].includes(type)) dmg = type === 'nuke' ? 0 : type === 'scald' ? 320 : 2500;
      if (info.zone === 'hat') {
        z.hatHp -= dmg;
        if (!info.noPoints) g.addPoints(POINTS.hit);
        if (z.hatHp <= 0) {
          const hp = tmpV.setFromMatrixPosition(z.mats[13]);
          g.fx.sparks(hp, 2, { x: 0, y: 1, z: 0 });
          g.audio.chain(hp);
          g.hud.subtitle('¡Le volaste el sombrero!', 2);
        }
        return true;
      }
      if (info.zone === 'head') dmg *= 1.5;
      // el Mandinga no se deja voltear de un par de tiros de oro
      if (z.mandinga) dmg = Math.min(dmg, info.zone === 'head' ? 1300 : 900);
      // atontado contra la pared: es el momento de darle
      if (z.state === 'stunned') dmg *= 2;
    } else if (g.powerups.active.insta && type !== 'burn') {
      dmg = z.hp + 1;
    }
    if (dmg <= 0) return false;
    z.hp -= dmg;
    if (info.point && type !== 'freeze' && type !== 'chain' && type !== 'blast') {
      g.fx.blood(info.point, info.dir ? tmpV2.copy(info.dir).multiplyScalar(0.6) : { x: 0, y: 0.5, z: 0 }, info.zone === 'head' ? 14 : 8);
    }
    if (z.hp > 0) {
      this.lastPoints = type === 'burn' ? 0 : POINTS.hit;
      if (!info.noPoints && type !== 'burn') g.addPoints(POINTS.hit, info.point);
      // perder un antebrazo o las piernas
      if (!z.boss) {
        if (info.arm !== undefined && dmg > z.maxHp * 0.3 && Math.random() < 0.5) {
          z.hidden |= 1 << (5 + info.arm);
          if (info.point) g.fx.blood(info.point, { x: 0, y: -0.2, z: 0 }, 12);
        }
        if (type === 'explosive' && !z.crawler && Math.random() < 0.4 && ['chase', 'attack'].includes(z.state)) {
          z.crawler = true;
          z.hidden |= HIDE_LEGS;
          g.fx.blood(tmpV.set(z.pos.x, 0.5, z.pos.z), { x: 0, y: 1, z: 0 }, 20, 1.5);
        }
        if (info.burn && !(z.burnT > 0)) {
          z.burnT = 4;
          z.burnBy = info.by;
          this.paint(z, 0x6a3a20);
        }
        if (info.elem) this.applyElem(z, info, dmg);
      }
      if (z.boss && z.state === 'chase' && Math.random() < 0.02) this.setState(z, 'intro');
      // quejido de dolor de vez en cuando
      if (!z.boss && Math.random() < 0.12 && type !== 'burn') g.audio.growl(tmpV.set(z.pos.x, 1.5, z.pos.z), 'idle');
      return true;
    }
    this.kill(z, info);
    return true;
  }

  // Efecto del elemento de un mate mejorado en el Pack-a-Pava.
  applyElem(z, info, dmg) {
    const g = this.g;
    const e = info.elem;
    if (e === 'fire' && !(z.burnT > 0) && Math.random() < 0.4) {
      z.burnT = 5;
      z.burnBy = info.by;
      this.paint(z, 0x6a3a20);
    } else if (e === 'ice' && Math.random() < 0.45) {
      z.slowT = 2.5;
      if (!(z.burnT > 0)) this.paint(z, 0x9cc8e8);
      g.fx.frost(z.pos, 6);
    } else if (e === 'electric' && Math.random() < 0.3) {
      // arco a los dos zombies más cercanos
      const at = new THREE.Vector3(z.pos.x, 1.2 * z.scale, z.pos.z);
      const near = this.inRadius(at, 4.5, []).filter((n) => n.z !== z).sort((a, b) => a.d - b.d).slice(0, 2);
      g.fx.electric(at, 5);
      g.audio.zap(at);
      for (const { z: o } of near) {
        const to = new THREE.Vector3(o.pos.x, 1.2 * o.scale, o.pos.z);
        g.fx.lightning(at, to, 0x9ac8ff, 0.15);
        this.damage(o, dmg * 0.6, { type: 'bullet', zone: 'torso', point: to, noPoints: info.noPoints, by: info.by, zap: true });
      }
    }
  }

  kill(z, info = {}) {
    const g = this.g;
    const type = info.type || 'bullet';
    z.dead = true;
    z.deathFrom = null;
    z.static = false;
    z.corpseT = 0;
    if (z.window >= 0) {
      const w = g.barriers.windows[z.window];
      if (w.tearer === z) w.tearer = null;
      if (w.climber === z) w.climber = null;
    }
    // puntos
    let pts = POINTS.kill;
    if (z.boss) pts = POINTS.boss;
    else if (type === 'knife') pts += POINTS.knife;
    else if (info.zone === 'head') pts += POINTS.head;
    else if (info.zone === 'neck') pts += POINTS.neck;
    this.lastPoints = type === 'nuke' ? 0 : pts;
    if (type !== 'nuke' && !info.noPoints) g.addPoints(pts, info.point);
    if (info.by != null && g.net?.host && info.by !== g.net.id) {
      // lo liquidó un compañero: va a su cuenta, no a la del anfitrión
      g.net.creditKill(info.by, type, info.zone);
    } else {
      g.stats.kills++;
      if (info.zone === 'head' && ['bullet', 'knife'].includes(type)) g.stats.headshots++;
      if (type === 'knife') g.stats.knifeKills++;
    }
    // dirección de caída
    if (info.dir) {
      const fx = Math.sin(z.yaw);
      const fz = Math.cos(z.yaw);
      z.deathBack = info.dir.x * fx + info.dir.z * fz < 0;
    } else z.deathBack = Math.random() < 0.5;

    const neck = tmpV.setFromMatrixPosition(z.mats[1]);
    // muertes especiales: congelado que se hace trizas, electrocutado, prendido fuego corriendo
    const iced = z.slowT > 0 && !z.boss && type === 'bullet' && info.zone !== 'head' && Math.random() < 0.35;
    const zapped = (info.elem === 'electric' || info.zap) && !z.boss && type === 'bullet' && Math.random() < 0.45;
    const onFire = !z.boss && (type === 'burn' || (z.burnT > 0 && type === 'bullet' && info.zone !== 'head') || type === 'trapfire') && Math.random() < (type === 'burn' ? 0.9 : 0.55);
    const decap = !z.boss && type === 'knife' && (info.decap || Math.random() < 0.3);
    if (z.dog) {
      // aullido corto, sangre y cae de costado; después se hace brasas
      z.state = 'dead';
      z.stateT = 0;
      z.burst = false;
      g.audio.yelp(tmpV.set(z.pos.x, 0.6, z.pos.z));
      if (info.point) g.fx.blood(info.point, info.dir || { x: 0, y: 0.5, z: 0 }, 14);
    } else if (iced) {
      z.state = 'frozen';
      z.stateT = 0;
      z.freezeT = 0.35 + Math.random() * 0.3;
      this.paint(z, 0x9fd8ff);
      g.fx.frost(z.pos, 16);
    } else if (zapped) {
      z.state = 'shocked';
      z.stateT = 0;
      this.paint(z, 0xbfe0ff);
      g.fx.electric(tmpV.set(z.pos.x, 1.2, z.pos.z), 10);
    } else if (onFire && !z.crawler && ['chase', 'attack', 'dead'].includes(z.state)) {
      z.state = 'burnrun';
      z.stateT = 0;
      z.runT = 1.8 + Math.random() * 1.4;
      z.runYaw = z.yaw + (Math.random() - 0.5) * 2;
      this.paint(z, 0x2a1a10);
      g.audio.growl(tmpV.set(z.pos.x, 1.6, z.pos.z), 'scream');
    } else if (type === 'scald') {
      // hervido: queda colorado, suelta vapor y se desploma
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      z.steamT = 4;
      this.paint(z, 0xc0503a);
      g.fx.steam(tmpV.set(z.pos.x, 1.2, z.pos.z), 10, 0.6);
    } else if (decap) {
      // el facón le vuela la cabeza: queda un chorro de sangre del cuello
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      const hp = new THREE.Vector3().setFromMatrixPosition(z.mats[2]);
      z.hidden |= HIDE_HEAD;
      z.fountT = 1.4;
      g.fx.blood(hp, { x: 0, y: 1.5, z: 0 }, 30, 1.5);
      g.fx.gib(hp, new THREE.Vector3((info.dir?.x || 0) * 3 + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 2, (info.dir?.z || 0) * 3 + (Math.random() - 0.5) * 2));
      g.audio.squish(hp);
    } else if (type === 'freeze') {
      z.state = 'frozen';
      z.stateT = 0;
      z.freezeT = 0.9 + Math.random() * 0.8;
      this.paint(z, 0x9fd8ff);
      g.fx.frost(z.pos, 20);
    } else if (type === 'chain') {
      z.state = 'shocked';
      z.stateT = 0;
      this.paint(z, 0xbfe0ff);
    } else if (type === 'blast') {
      z.state = 'flung';
      z.stateT = 0;
      const d = info.dir || new THREE.Vector3(0, 0, 1);
      z.vel.set(d.x * (14 + Math.random() * 6), 6 + Math.random() * 4, d.z * (14 + Math.random() * 6));
      z.pos.y = (z.baseY || 0) + 0.1;
    } else if (type === 'yerba') {
      g.fx.yerbaPuff(z.pos);
      if (!z.boss) this.free(z);
      else {
        z.state = 'dead';
        z.stateT = 0;
      }
    } else {
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      // cabeza que vuela en disparos a la cabeza
      if (info.zone === 'head' && !z.boss && type !== 'nuke') {
        const hp = new THREE.Vector3().setFromMatrixPosition(z.mats[2]);
        z.hidden |= HIDE_HEAD;
        g.fx.blood(hp, { x: 0, y: 1.2, z: 0 }, 26, 1.4);
        g.fx.decal(1, { x: hp.x + (Math.random() - 0.5), y: 0.02, z: hp.z + (Math.random() - 0.5) }, { x: 0, y: 1, z: 0 }, 1.2);
        if (Math.random() < 0.6) g.fx.gib(hp, new THREE.Vector3((info.dir?.x || 0) * 4 + (Math.random() - 0.5) * 2, 3 + Math.random() * 2, (info.dir?.z || 0) * 4 + (Math.random() - 0.5) * 2));
        g.audio.squish(hp);
      } else if (type === 'explosive' && !z.boss && Math.random() < 0.5) {
        z.hidden |= 1 << (5 + Math.floor(Math.random() * 2));
        z.state = 'flung';
        z.stateT = 0;
        const d = info.dir || new THREE.Vector3(0, 0, 1);
        z.vel.set(d.x * 4, 4, d.z * 4);
        z.pos.y = (z.baseY || 0) + 0.05;
      }
      if (z.crawler) {
        z.P.rootPitch = 1.45;
      }
      if (type === 'trapfire') {
        this.paint(z, 0x2a1a10);
        g.fx.fire(tmpV.set(z.pos.x, 0.8, z.pos.z), 0.5, 8);
      }
    }
    g.fx.decal(1, { x: z.pos.x + (Math.random() - 0.5) * 0.6, y: (z.baseY || 0) + 0.02, z: z.pos.z + (Math.random() - 0.5) * 0.6 }, { x: 0, y: 1, z: 0 }, 0.8 + Math.random() * 0.6);
    if (type !== 'freeze' && type !== 'yerba') g.audio.growl(neck.clone(), 'death');
    if (z.mandinga) {
      g.audio.growl(tmpV.set(z.pos.x, 3, z.pos.z), 'boss');
      g.arena?.onBossDead();
    } else if (z.boss) {
      g.powerups.drop(z.pos, true);
      g.ee.dropHat(z.pos);
      g.hud.subtitle('El Capataz cayó. Se le voló el sombrero...', 3, 'boss');
      g.audio.sting();
    } else if (type !== 'nuke' && !z.dog) g.powerups.onKill(z.pos);
    g.rounds.onKill(z);
    g.ee.onKill(z, info);
    if (!z.boss && type !== 'nuke') g.activities?.onKill(z);
    return true;
  }

  // Kaboom: mata a todos (menos al Capataz) sin dar puntos por cada uno.
  nuke() {
    const list = this.pool.filter((z) => z.active && !z.dead);
    list.forEach((z, i) => {
      this.g.later(0.15 + i * 0.06 + Math.random() * 0.2, () => {
        if (!z.active || z.dead) return;
        this.paint(z, 0x2a1a10);
        this.g.fx.fire(tmpV.set(z.pos.x, 1, z.pos.z), 0.5, 6);
        this.kill(z, { type: 'nuke' });
      });
    });
  }

  setEyeColor(hex) {
    this.eyeMat.color.set(hex).multiplyScalar(3);
  }
}
