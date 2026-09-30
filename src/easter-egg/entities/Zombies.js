import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PART_COUNT, makePose, solvePose, solveExtras, hitParts } from './skeleton';
import Navigation from '../world/Navigation';
import DogRig from './Dogs';
import HorseRig from './Horses';
import PumaRig from './Pumas';
import YacareRig from './Yacares';
import { buildBossRig } from './bossRig';
import { zombieLook, lookGeometries } from './zombieLooks';
import { gaitOf, gaitPose, idlePose, attackPose } from './zombieGaits';
import { soak, zombieWaterSpeed, updateNavCost, hasWater, submerged } from './swim';
import { luisonGait, luisonIdle, luisonRoar, luisonSlam, luisonDazed, luisonLow, POUNCE, HOWL_AT, LUISON_END, SUMMON_POUND } from './luison';
import { reachableSpot } from './reach';
import { SILL_Y } from '../world/HighWindows';
import { RISERS, FEATURES, MAP_ID, WATER_Y } from '../config/map';
import { ATTIC, SKYLIGHTS, STAIR_BOTTOM, STAIR_TOP, STAIR_TURN, UP_Y, atticNavWorld, inAtticRect, inStair, levelOf, stairY } from '../world/Attic';
import { walkLine } from '../world/Levels';
import { SPEEDS, rollSpeed, rollSpeedHold, walkPace, runShare, ZOMBIE_DAMAGE, DOG_DAMAGE, BOSS_DAMAGE, PUP_LUISON, POINTS, bossHealth, bossScale } from '../config/rules';
import { rng } from '../core/noise';
import BossMoves from './bossMoves';
import { reelStep, reelPose } from './zombieReel';

// Zombies por rondas: aparición (ventanas y tierra), IA, animación procedural,
// render instanciado (una llamada de dibujo por tipo de parte) y daño.

const MAX = 40;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// un perro no dibuja ninguna parte del cuerpo humano
const ALL_PARTS = (1 << PART_COUNT) - 1;

// Partes instanciadas: qué partes del esqueleto dibuja cada malla y de qué color.
// mat: qué textura usa; need: solo lo dibujan los zombies que tienen esa prenda.
// Cada mapa suma sus prendas y cambia telas y sombrero (entities/zombieLooks.js).
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
// Y el alcaide del penal: porteño, de kepí, y odia a los gauchos.
const ALCAIDE = [
  '¿Qué hacés, gaucho roñoso? Volvé a tu celda antes de que te fajo.',
  'Che, pajuerano, en mi penal no se toma mate. Esto es Buenos Aires, ¿entendés?',
  'Mirá vos, otro gaucho suelto. Qué bárbaro, loco, parece una plaga.',
  'Documentos. ¿Cómo que no tenés? Vago y mal entretenido. Directo al calabozo.',
];
// El Sargento de la partida (el estero): se ahogó persiguiendo al Gil y sigue de servicio.
const SARGENTO = [
  '¡Alto ahí! Por orden del Coronel: la papeleta o el cepo.',
  'Me ahogué buscándolo al Gil... y ustedes me lo van a pagar.',
  '¡Firmes! La partida no descansa, ni muerta.',
  '¿La llave del Coronel? Vengan a sacármela, desertores.',
];
// El nombre del jefe que anda suelto por el mapa (no el del final).
const bossLabel = (z) => (z?.kind === 'luison' ? 'El Luisón' : z?.kind === 'sargento' ? 'El Sargento' : z?.kind === 'alcaide' ? 'El Alcaide' : z?.kind === 'caballero' ? 'El Caballero Negro' : 'El Capataz');

const HIDE_HEAD = (1 << 2) | (1 << 13) | (1 << 14) | (1 << 15);
// a estos estados el cuerpo llega mezclando la pose de antes (ver drawnPose)
const BLEND_TO = new Set(['chase', 'attack', 'approach', 'tear', 'climb', 'stairs', 'boat', 'boatHit', 'burnrun']);
const HIDE_LEGS = (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);
// derretido (la Liquidificador): lo que tarda en escurrirse y el color del barro
const MELT_T = 1.6;
const MELT_COL = new THREE.Color(0x283214);
const sm01 = (x) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

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
// cuándo baja la mano el zarpazo (en tiempo de ataque: z.attackT, que corre con z.fury)
const ATTACK_HIT = 0.42;
// (el Luisón atraviesa el pajonal: la caja de la paja no lo frena)
const SKIP_CORN = { skip: 'corn' };
// el Luisón: lo chico del piso no lo frena (Zombies.bossColl; lowProp se pone al usar)
const LUISON_COLL = { lowProp: 0 };
const LUISON_CORN = { skip: 'corn', lowProp: 0 };
// cuándo se esconde el Luisón en el pajonal (qué parte de la vida le queda)
const LURK_AT = [0.8, 0.55, 0.3];
// en la paja va agazapado (luisonLow) y apenas hundido: las patas quedan entre
// las matas bajas (m); solo andando o por saltar (saltando, aullando o pegando
// se levanta)
const LURK_LOW = 0.3;
const LOW_STATES = new Set(['chase', 'lurk', 'lurkIn', 'chargeWind']);
const lowPose = makePose();
const CROSS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
    // cómo se visten los de este mapa: telas, prendas propias y el color de los ojos
    const L = (this.look = zombieLook(MAP_ID));
    this.geo = { ...geometries(), ...lookGeometries(L) };
    const T = game.textures;
    // texturas con relieve y un borde de luz fría para recortarlos contra la oscuridad
    const mk = (map, o = {}) => rim(new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 0.92, ...o }));
    const mats = {
      cloth: mk(L.tex?.cloth?.() || T.zcloth),
      pants: mk(L.tex?.pants?.() || T.zpants),
      skin: mk(T.zskin, { roughness: 0.75 }),
      leather: mk(T.leather, { roughness: 0.7 }),
      plain: mk(T.grime),
    };
    for (const [k, f] of Object.entries(L.mats || {})) mats[k] = f(mk, T);
    const face = rim(new THREE.MeshStandardMaterial({ map: T.face, bumpMap: T.face, bumpScale: 2, roughness: 0.8 }));
    mats.head = [mats.skin, mats.skin, mats.skin, mats.skin, face, mats.skin];
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.eyes ?? 0xffc23a).multiplyScalar(L.eyeGlow ?? 3), toneMapped: false });
    // solo las prendas que usa este mapa (cada malla es una llamada de dibujo)
    const list = [...MESHES.filter((M) => !(L.drop || []).includes(M.key) && (!M.need || (L.base || []).includes(M.need))), ...(L.parts || [])];
    this.meshes = list.map((M) => {
      let mat = mats[M.key === 'hat' ? L.hatMat || M.mat : M.mat] || mats.plain;
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
    // la ronda especial: carpinchos en el molino, caballos en la granja
    this.horses = FEATURES.special === 'horse';
    // (el castillo: pumas de la cordillera)
    // (el estero: yacarés, que salen del agua; entities/Yacares.js)
    this.dogRig = this.horses ? new HorseRig(game, MAX, this.eyeMat) : FEATURES.special === 'puma' ? new PumaRig(game, MAX, this.eyeMat) : FEATURES.special === 'yacare' ? new YacareRig(game, MAX) : new DogRig(game, MAX, this.eyeMat);
    // la torre: carpinchos y caballos mezclados entre los muertos (cada uno con su cuerpo)
    this.horseRig = FEATURES.special === 'mixed' ? new HorseRig(game, MAX, this.eyeMat, true) : null;
    if (this.horseRig) this.dogRig.mixed = true;
    // y en el Challenge, yacarés con la inundación (entities/challengeFlood.js elige dónde salen)
    this.yacRig = FEATURES.special === 'mixed' && FEATURES.egg === 'reto' ? new YacareRig(game, MAX, true) : null;
    if (this.yacRig) this.yacRig.spot = () => game.ee?.flood?.spot() ?? null;
    this.tele = this.buildTelegraphs();
    // lo nuevo de los jefes: a quién va, la cadena, la tercerola, las plagas...
    this.moves = new BossMoves(game, this);
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
      const len = s === 'whipWind' ? (b.kind === 'alcaide' ? 14 : 8.5) : 14;
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
    const list = g.player.canBeHit() && !submerged(g.player) ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && !submerged(r)) list.push(r);
    // al del altillo no lo alcanza (ni, en el penal, al que está en otro piso;
    // ni al sumergido)
    const by = this.boss?.baseY || 0;
    return list.filter((p) => levelOf(p.pos.y) === 0 && (!g.world.levels || Math.abs((p.pos.y || 0) - by) < 2));
  }

  // Lo que se ve y se oye del rebencazo (el invitado también lo dibuja).
  whipFx(z, yaw = z.yaw) {
    const g = this.g;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const by = z.baseY || 0;
    const hand = new THREE.Vector3(z.pos.x + fx * 0.6, by + 2.2 * (z.scale / 1.4), z.pos.z + fz * 0.6);
    const end = new THREE.Vector3(z.pos.x + fx * 8.5, by + 0.3, z.pos.z + fz * 8.5);
    // la mano de verdad (la del arma), si ya está armado el cuerpo
    const rh = this.bossRig.parts[6];
    if (rh) hand.setFromMatrixPosition(rh.matrixWorld);
    this.bossRig.whip(hand, end);
    g.fx.dust(end, { x: 0, y: 1, z: 0 }, [0.45, 0.38, 0.3], 10);
    g.audio.chain(end);
    g.fx.addShake(0.25);
  }

  // El rebencazo: pega a lo largo de la franja que marcó.
  whipHit(z) {
    const g = this.g;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    this.whipFx(z);
    // (el del Capataz, lo que se ve: la franja mide 0,9 y pegaba en 1,8; se sentía injusto)
    const wide = z.kind === 'capataz' ? 0.65 : 0.9;
    for (const p of this.bossTargets()) {
      const dx = p.pos.x - z.pos.x;
      const dz = p.pos.z - z.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0.5 && along < 9 && side < wide) g.damagePlayer(p, 65, z.pos);
    }
  }

  // El sablazo del Sargento: se tira adelante (hasta 4.5 m) y corta en arco.
  saberStart(z) {
    let d = 9;
    for (const p of this.bossTargets()) d = Math.min(d, Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z));
    const big = z.kind === 'luison';
    z.lunge = Math.max(0, Math.min(big ? 5.5 : 4.5, d - (big ? 1.8 : 1.4)));
    z.saberHit = false;
    this.saberFx(z);
  }

  saberStep(z, dt) {
    const g = this.g;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    if (z.stateT < 0.22 && z.lunge > 0) {
      const bx = z.pos.x;
      const bz = z.pos.z;
      const sp = (z.lunge / 0.22) * dt;
      z.pos.x += fx * sp;
      z.pos.z += fz * sp;
      g.world.collide(z.pos, 0.45, this.bossFeet(z), (z.baseY || 0) + 2.4);
      this.bossGround(z, bx, bz);
    }
    if (!z.saberHit && z.stateT > 0.18) {
      z.saberHit = true;
      for (const p of this.bossTargets()) {
        const dx = p.pos.x - z.pos.x;
        const dz = p.pos.z - z.pos.z;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        const big = z.kind === 'luison';
        if (along > -0.3 && along < (big ? 3.4 : 2.8) && side < (big ? 1.8 : 1.5) && Math.abs((p.pos.y || 0) - (z.baseY || 0)) < 1.6) g.damagePlayer(p, big ? 80 : 70, z.pos);
      }
    }
  }

  // Lo que se ve y se oye del sablazo (también en el invitado): el silbido del
  // sable y el agua del estero que sale volando de la hoja.
  saberFx(z) {
    const g = this.g;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const s = (z.scale || 1.4) / 1.4;
    const at = new THREE.Vector3(z.pos.x + fx * 1.2, (z.baseY || 0) + 1.5 * s, z.pos.z + fz * 1.2);
    if (z.kind === 'luison') {
      // el zarpazo: gruñe y levanta barro donde pega
      g.audio.growl(at, 'attack');
      const hit = new THREE.Vector3(at.x + fx * 1.6, (z.baseY || 0) + 0.1, at.z + fz * 1.6);
      g.later(0.18, () => g.fx.dust(hit, { x: fx, y: 1, z: fz }, [0.24, 0.22, 0.16], 12));
      return;
    }
    g.audio.saber?.(at);
    g.later(0.15, () => {
      for (let i = 0; i < 16; i++) {
        const k = (i / 15 - 0.5) * 2;
        g.fx.alpha.spawn(at.x + fz * k * 0.9, at.y - k * 0.3, at.z - fx * k * 0.9, fx * 3 + fz * k * 2 + (Math.random() - 0.5), 1 + Math.random() * 1.5, fz * 3 - fx * k * 2 + (Math.random() - 0.5), { color: [0.55, 0.65, 0.68], size: 0.03, size1: 0.012, life: 0.6, gravity: 9 });
      }
    });
  }

  // Lo que se oye del Luisón aullando (anfitrión e invitado): el grabado, con
  // el resuello de antes si prep (el aullido llega a los HOWL_AT s).
  howlSound(z, opts) {
    const s = (z.scale || 1.4) / 1.4;
    this.g.audio.luisonHowl?.(new THREE.Vector3(z.pos.x, (z.baseY || 0) + 2.4 * s, z.pos.z), opts);
  }

  // ¿El aullido de la llegada ya sonó desde el monte, con la canción? (EsterosEgg.luisonMusic)
  luisonPreHowled() {
    const pre = this.g.ee?.howlPre;
    return pre != null && this.g.time - pre < 3;
  }

  // El Luisón clava las dos manos en el barro para levantar a los muertos
  // (summon, a los SUMMON_POUND s; anfitrión e invitado).
  luisonPound(z) {
    const g = this.g;
    const s = (z.scale || 1.4) / 1.4;
    const at = new THREE.Vector3(z.pos.x + Math.sin(z.yaw) * 0.9 * s, (z.baseY || 0) + 0.05, z.pos.z + Math.cos(z.yaw) * 0.9 * s);
    g.audio.bossSlam(at);
    g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.24, 0.22, 0.16], 18);
    if (g.world.waterDepth?.(at.x, at.z) > 0.1) g.water?.splash?.(at.x, at.z, 1.3);
    g.fx.addShake(0.3);
  }

  // El Luisón aúlla de verdad (anfitrión e invitado, cada uno para su
  // jugador): larga un vaho podrido y al que está cerca lo hiela (anda más
  // lento un rato: Player.slowT). El sonido lo pone howlSound, antes.
  howlFx(z) {
    const g = this.g;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fx.alpha.spawn(z.pos.x + Math.cos(a) * 0.8, (z.baseY || 0) + 0.3, z.pos.z + Math.sin(a) * 0.8, Math.cos(a) * 5, 0.3, Math.sin(a) * 5, { color: [0.26, 0.3, 0.16], size: 0.4, size1: 1.2, life: 1.2, alpha: 0.5, drag: 2 });
    }
    const p = g.player;
    const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
    if (!p.downed && d < 18 && Math.abs((p.pos.y || 0) - (z.baseY || 0)) < 4) {
      p.slowT = Math.max(p.slowT || 0, 2.8 * (1 - d / 24));
      g.fx.addShake(0.35);
    }
  }

  // El Luisón cae del salto: sacude el piso y pega a los que agarra abajo.
  pounceLand(z) {
    const g = this.g;
    const at = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 0.05, z.pos.z);
    g.audio.bossSlam(at);
    g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.3, 0.28, 0.2], 20);
    if (g.world.waterDepth?.(at.x, at.z) > 0.1) g.water?.splash?.(at.x, at.z, 1.6);
    g.fx.addShake(0.6);
    for (const p of this.bossTargets()) {
      if (z.chargeHits?.has(p)) continue;
      if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 2.6 && Math.abs((p.pos.y || 0) - at.y) < 1.8) g.damagePlayer(p, 80, z.pos);
    }
  }

  // El cuerpo (y la voz) de cada bicho: en la torre van mezclados los
  // carpinchos, los caballos y, en el Challenge, los yacarés.
  rigOf(z) {
    return z.yac && this.yacRig ? this.yacRig : z.horse && this.horseRig ? this.horseRig : this.dogRig;
  }

  // Lo que saca un golpe de este bicho: los carpinchos y los pumas muerden
  // menos (DOG_DAMAGE); caballos, yacarés y zombies, lo de siempre.
  biteOf(z) {
    if (!z.dog || this.isHorse(z) || z.yac) return ZOMBIE_DAMAGE;
    const rig = this.rigOf(z);
    return rig instanceof DogRig || rig instanceof PumaRig ? DOG_DAMAGE : ZOMBIE_DAMAGE;
  }

  // ¿Es un caballo? (en la granja todos los especiales; en la torre, algunos)
  isHorse(z) {
    return this.horses || !!z.horse;
  }

  // Silba y se levantan peones alrededor.
  callPeones(z, n) {
    const g = this.g;
    g.audio.bossArrive();
    const round = g.rounds?.round || 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const at = new THREE.Vector3(z.pos.x + Math.cos(a) * 3.2, z.baseY || 0, z.pos.z + Math.sin(a) * 3.2);
      if (g.nav.blocked(Math.floor(at.x), Math.floor(at.z), at.y)) continue;
      if (g.world.levels && Math.abs(g.world.floorAt(at.x, at.z, z.baseY) - (z.baseY || 0)) > 0.5) continue;
      g.later(0.4 + i * 0.3, () => this.spawn(round, Math.floor(bossHealth(round) / 60), at, false));
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
    // la defensa del yerbal: la horda sale por los tablones (casi siempre por las tranqueras)
    const zones = g.defense?.zones || g.activeZones;
    if (g.defense?.zones && Math.random() < 0.75) allowRisers = false;
    // la creciente del estero: la horda sale del agua (los pozos), no por las ventanas
    const flood = !!g.rounds?.flood && allowRisers;
    // en la torre salen cerca de cualquiera de los que están de pie (cada uno en su piso)
    const ref = g.navFor ? this.spawnRef() : g.player;
    const player = ref.pos;
    const nav = g.navFor ? g.navFor(ref) : g.nav;
    const list = [];
    for (const w of g.barriers.windows) {
      if (flood || !zones.has(w.zone)) continue;
      const d = nav.distAt(w.int.x, w.int.z);
      list.push({ kind: 'window', w, d });
    }
    // la inundación del Challenge de la torre: nadie sale abajo del agua
    const low = g.ee?.spawnFloor?.() ?? -Infinity;
    if (allowRisers) {
      for (const r of RISERS) {
        if (!zones.has(r.zone) || (r.y ?? 0) < low) continue;
        const dx = r.pos[0] - player.x;
        const dz = r.pos[1] - player.z;
        const dy = r.y != null ? r.y - player.y : 0;
        if (dx * dx + dz * dz + dy * dy < 16) continue;
        const d = nav.distAt(r.pos[0], r.pos[1], r.y);
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
  // hold: es de una actividad del easter egg donde hay que aguantar (los que
  // salen en un punto fijo, salvo los peones del jefe; y la defensa del yerbal)
  spawn(round, health, at = null, hold = !!at) {
    // con alguien en el altillo, muchos se tiran por las claraboyas
    const sky = !at && this.atticBusy() && Math.random() < 0.45 ? SKYLIGHTS[Math.floor(Math.random() * SKYLIGHTS.length)] : null;
    const sp = at ? { kind: 'riser', r: { pos: [at.x, at.z], y: at.y } } : sky ? { kind: 'sky', s: sky } : this.pickSpawner();
    if (!sp) return false;
    const z = this.freeSlot();
    if (!z) return false;
    const r = Math.random;
    z.active = true;
    z.dead = false;
    z.id = ++this.idc;
    z.hp = health;
    z.maxHp = health;
    // (en las actividades de aguantar, como mínimo corren: rollSpeedHold)
    hold = hold || !!this.g.ee?.defense?.active;
    z.speedType = hold ? rollSpeedHold(round) : rollSpeed(round);
    z.speed = SPEEDS[z.speedType] * (0.92 + r() * 0.16) * (z.speedType === 'walk' ? walkPace(round) : 1);
    // de la 4 a la 7 se larga a correr cuando la parte que corre (runShare) pasa su número
    z.runU = hold ? null : r();
    // (el Challenge de la torre los hace más rápidos y más bravos: entities/TowerChallenge.js)
    z.fury = 1;
    this.g.ee?.tuneZombie?.(z, round);
    z.phase = r() * 10;
    z.stateT = 0;
    z.attackT = 0;
    z.growlT = 1 + r() * 4;
    z.crawler = false;
    z.hidden = 0;
    z.farT = 0;
    z.losT = 0;
    z.los = false;
    z.stuckK = 0;
    z.sideT = 0;
    z.navT = 0;
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
    this.lookOf(z);
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
      if (this.g.world.levels) z.pos.y = z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z);
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
      if (this.g.world.levels) z.pos.y = z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z, sp.r.y);
      z.state = 'rise';
      z.yaw = r() * Math.PI * 2;
      this.g.fx.dirt(z.pos);
      this.g.audio.rise(z.pos);
      // (en el estero, el que sale de abajo del agua salpica)
      if ((this.g.world.waterDepth?.(z.pos.x, z.pos.z) || 0) > 0.3) this.g.water?.splash?.(z.pos.x, z.pos.z, 0.5, { sound: false });
    }
    return true;
  }

  // Alguien de pie al azar (la torre reparte las apariciones entre todos).
  spawnRef() {
    const g = this.g;
    const list = g.player.canBeHit() ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost) list.push(r);
    return list.length ? list[Math.floor(Math.random() * list.length)] : g.player;
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
  // kind: 'horse' o 'dog' (la torre los mezcla; si no, el de la ronda especial del mapa).
  spawnDog(health, kind = null) {
    const g = this.g;
    // (el yacaré elige su lugar: en el agua)
    const yac = kind === 'yacare' && !!this.yacRig;
    const at = yac ? this.yacRig.spot() : this.dogRig.spot?.() || this.dogSpot();
    if (!at) return false;
    const z = this.freeSlot();
    if (!z) return false;
    const r = Math.random;
    const horse = kind ? kind === 'horse' : this.horses;
    Object.assign(z, {
      active: true,
      dead: false,
      dog: true,
      horse: !!this.horseRig && horse,
      yac,
      level: 0,
      baseY: at.y || 0,
      id: ++this.idc,
      hp: health,
      maxHp: health,
      scale: horse ? 0.95 + r() * 0.1 : 0.92 + r() * 0.16,
      speedType: 'sprint',
      speed: horse ? 6.0 + r() * 0.7 : 5.8 + r() * 0.9,
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
      stuckK: 0,
      sideT: 0,
      navT: 0,
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
    const ay = at.y || 0;
    z.pos.set(at.x, ay, at.z);
    const rig = this.rigOf(z);
    rig.onSpawn?.(z);
    // el puma no cae con un rayo: baja de un salto desde lo alto
    if (rig.spawnFx) {
      rig.spawnFx(z);
      return true;
    }
    // en la torre el rayo no atraviesa los pisos: baja desde el techo
    const top = new THREE.Vector3(at.x, ay + (g.world.tower ? 3.6 : 24), at.z);
    const ground = new THREE.Vector3(at.x, ay + 0.1, at.z);
    g.fx.lightning(top, ground, 0xcfe0ff, 0.35);
    g.fx.flash(new THREE.Vector3(at.x, ay + 1.5, at.z), 0xcfe0ff, 30, 0.3, 16);
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
      // en la torre, en el mismo piso que el jugador (y no en el agujero)
      const tower = g.world.tower;
      // (en los mapas con pisos, a la altura del piso y en el mismo piso que el jugador)
      const y = tower ? g.world.floorAt(x, z, tp.pos.y) : g.world.levels ? g.world.floorAt(x, z) : 0;
      if (tower && Math.abs(y - tp.pos.y) > 0.6) continue;
      if (g.world.levels && Math.abs(y - tp.pos.y) > 1.2) continue;
      const zone = g.world.zoneAt(x, z, tower ? y : undefined);
      if (!zone || !g.activeZones.has(zone)) continue;
      const nd = (g.navFor ? g.navFor(tp) : g.nav).distAt(x, z, y);
      if (!Number.isFinite(nd) || nd > 45) continue;
      return { x, z, y };
    }
    return null;
  }

  // Cómo se ve cada zombie (tamaño, renguera, ropa del mapa) sale de su id:
  // el invitado lo viste igual que el anfitrión. El id viaja con 16 bits.
  lookOf(z) {
    const r = rng((z.id & 0xffff) * 2654435 + 11);
    z.scale = 0.93 + r() * 0.14;
    z.limp = r() < 0.35 ? 0.4 + r() * 0.5 : 0;
    z.headTilt = (r() - 0.5) * 0.7;
    z.armOff = (r() - 0.5) * 0.4;
    const dress = this.look.dress(r);
    z.colors = dress.colors;
    if (!dress.hat) z.hidden |= 1 << 13;
    z.flags = dress.flags;
    // y cómo camina, corre y pega (entities/zombieGaits.js); el lugar puede venir
    // de otro zombie: que no arranque mezclándose con la pose del anterior
    // (z.style: z.gait es la fase de los perros, pumas y caballos)
    z.style = gaitOf(r);
    z.Pr = null;
    z.pState = null;
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
    z.P.melt = 0;
    for (const M of this.meshes) {
      for (let k = 0; k < M.parts.length; k++) M.im.setMatrixAt(z.slot * M.parts.length + k, ZERO);
      M.im.instanceMatrix.needsUpdate = true;
    }
    this.blobs.setMatrixAt(z.slot, ZERO);
  }

  reset() {
    for (const z of this.pool) if (z.active) this.free(z);
    if (this.boss) this.removeBoss();
    this.moves.reset();
  }

  // ---------------- los jefes ----------------
  // Un solo cuerpo (entities/bossRig.js), vestido de cada uno.
  buildBossRig() {
    const R = buildBossRig(this.g);
    this.bossMats = R.mats;
    this.g.scene.add(R.rig);
    return R;
  }

  // La ropa del jefe según quién es: el Capataz, el Mandinga, el Espantapájaros...
  dressBoss(kind) {
    this.bossRig.dress(kind);
  }

  // opts: { at, mandinga, hp } para el jefe final de la Salamanca.
  spawnBoss(round, opts = {}) {
    // el Luisón (el final del estero) no espera: si hay un jefe de ronda, se lo lleva el barro
    if (this.boss && opts.kind === 'luison' && this.boss.kind !== 'luison' && !this.boss.mandinga) this.removeBoss();
    if (this.boss) return this.boss;
    const g = this.g;
    // aparece cerca del jugador, en un punto de su zona activa
    const cands = [];
    for (const w of g.barriers.windows) if (g.activeZones.has(w.zone)) cands.push(w.int.clone());
    for (const r of RISERS) if (g.activeZones.has(r.zone)) cands.push(new THREE.Vector3(r.pos[0], g.world.floorAt(r.pos[0], r.pos[1], r.y), r.pos[1]));
    const p = g.world.tower ? this.spawnRef().pos : g.player.pos;
    // en la torre, del mismo piso que el jugador si se puede
    const same = g.world.tower ? cands.filter((c) => Math.abs(c.y - p.y) < 1) : cands;
    const list = same.length ? same : cands;
    list.sort((a, b) => Math.abs(a.distanceTo(p) - 12) - Math.abs(b.distanceTo(p) - 12));
    let at = opts.at || list[0] || new THREE.Vector3(p.x + 8, p.y || 0, p.z);
    // el Luisón: si donde lo llaman no hay camino hasta el jugador (una zona
    // cerrada), sale en el lugar con camino más cercano a ese punto
    if (opts.at && opts.kind === 'luison' && !Number.isFinite(g.nav.distAt(at.x, at.z, at.y))) {
      let best = null;
      for (let r = 1; r <= 40 && !best; r++) {
        let bd = Infinity;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || dx * dx + dz * dz >= bd) continue;
            if (!Number.isFinite(g.nav.distAt(at.x + dx, at.z + dz, at.y))) continue;
            bd = dx * dx + dz * dz;
            best = new THREE.Vector3(at.x + dx, 0, at.z + dz);
          }
        }
      }
      if (best) best.y = g.world.floorAt(best.x, best.z, (at.y || 0) + 1);
      at = best || list[0] || at;
    }
    const z = this.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.dead = false;
    z.id = ++this.idc;
    z.pos.copy(at);
    z.baseY = g.world.levels ? g.world.floorAt(at.x, at.z, at.y) : 0;
    z.pos.y = z.baseY;
    z.yaw = Math.atan2(p.x - at.x, p.z - at.z);
    z.scale = 1.4;
    const more = bossScale(g.rounds?.players || 1);
    z.maxHp = bossHealth(round) * more;
    z.hp = z.maxHp;
    z.hatHp = z.maxHp * 0.25;
    z.speed = 3.6;
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
    z.stuckK = 0;
    z.sideT = 0;
    z.navT = 0;
    this.boss = z;
    this.bossRig.rig.visible = true;
    this.bossRig.hat.visible = true;
    if (opts.mandinga) {
      // el jefe final: el diablo (grande, rojo, con cuernos) o el espantapájaros
      // gigante de la granja; ninguno clausura máquinas
      z.mandinga = true;
      z.kind = opts.kind || 'mandinga';
      z.scale = z.kind === 'scarecrow' ? 2.7 : z.kind === 'gil' || z.kind === 'francisco' ? 1.85 : 2.05;
      z.maxHp = (opts.hp || 60000) * more;
      z.hp = z.maxHp;
      z.hatHp = 0;
      // el Gauchito Gil pelea con su sombrero puesto (no se le vuela: no es un
      // escudo como el del Capataz); antes salía sin y lo tenía en el final
      z.hatFixed = z.kind === 'gil';
      z.lockT = Infinity;
      this.dressBoss(z.kind);
      if (z.kind === 'scarecrow') {
        // sale de la tierra entre paja y cuervos
        g.fx.dirt(at, 40);
        g.fx.explosion(at, 3, [0.9, 0.7, 0.3]);
        g.audio.caw(at.clone().setY(3), 4);
      } else {
        g.fx.explosion(at, 4, [1, 0.4, 0.1]);
        g.fx.flash(at, 0xff5a1a, 120, 0.8, 24);
      }
      g.audio.growl(at.clone().setY(2), 'boss');
      return z;
    }
    // el del penal es el alcaide (mismo cuerpo, otra ropa y otra lengua)
    z.kind = opts.kind || (FEATURES.boss === 'alcaide' || FEATURES.boss === 'caballero' || FEATURES.boss === 'sargento' ? FEATURES.boss : 'capataz');
    this.dressBoss(z.kind);
    // el Caballero Negro no clausura máquinas: pelea (carga con la lanza, escudo al frente)
    if (z.kind === 'caballero') {
      z.lockT = Infinity;
      z.scale = 1.5;
      z.speed = 3.8;
      // los de la vanguardia traen su plaga (entities/castle/Vanguardia.js)
      z.plague = opts.plague ?? null;
      if (z.plague != null) this.moves.onPlague(z);
    }
    // el Luisón: enorme y rápido, no clausura máquinas; salta, aúlla, da
    // zarpazos y llama a los muertos del estero
    if (z.kind === 'luison') {
      z.lockT = Infinity;
      z.scale = 2.2;
      z.speed = 4.4;
      // (con 60.000 caía enseguida con un arma mejorada: el usuario lo quiso más duro)
      // En co-op, +80% por jugador extra (no el +100% de los otros jefes): se
      // esconde en el pajonal y en el estero cuesta tirarle cómodo.
      z.maxHp = (opts.hp || 100000) * (1 + ((g.rounds?.players || 1) - 1) * 0.8);
      z.hp = z.maxHp;
      z.hatHp = 0;
      z.howlCd = 6;
      z.summonCd = 12;
    }
    if (z.kind === 'sargento') {
      // sale del barro del estero: salpica, se levanta la niebla y toca el clarín
      if (g.world.waterDepth?.(at.x, at.z) > 0.1) g.water?.splash?.(at.x, at.z, 1.4);
      g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.22, 0.26, 0.24], 24);
      g.fx.flash(at, 0x7affd0, 50, 0.6, 16);
      // el silbato grabado (sfx/jefe-sargento.mp3); si no bajó, el clarín sintetizado
      if (g.audio.sfxBuf?.['jefe-sargento']) g.audio.bossSfx('sargento');
      else g.audio.bugle?.(at.clone().setY(at.y + 2));
    } else if (z.kind === 'luison') {
      // sale del monte entre el vaho podrido, aullando (quiet: ya estaba ahí,
      // en la escena de la llegada, ui/LuisonArrival)
      if (!opts.quiet) {
        g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.2, 0.22, 0.14], 30);
        g.fx.flash(at, 0x9aff5a, 60, 0.8, 18);
        // (con la canción el aullido ya arrancó desde acá, con su resuello: EsterosEgg.luisonMusic)
        if (!this.luisonPreHowled()) g.audio.luisonHowl?.(at.clone().setY(at.y + 3));
        g.fx.addShake(0.4);
      }
    } else {
      g.fx.explosion(at, 2.5, [0.6, 0.8, 1]);
      g.fx.flash(at, 0x9ac8ff, 90, 0.6, 20);
      g.fx.lightning(new THREE.Vector3(at.x, at.y + (g.world.tower ? 3.6 : 12), at.z), new THREE.Vector3(at.x, at.y + 0.2, at.z), 0xbfd8ff, 0.5);
      // la llegada grabada de cada uno (en la torre, la de su mapa)
      g.audio.bossSfx(z.kind);
      g.audio.thunder?.(at);
    }
    if (z.kind === 'luison') {
      // (sin cartel de llegada: el Luisón, el Sargento, el Alcaide y el Capataz se anuncian con su sonido)
    } else if (z.kind === 'caballero') {
      g.hud.subtitle('¡Un Caballero Negro! La rodela lo cubre de frente... por la espalda, o contra la pared.', 4.5, 'boss');
    } else if (z.kind === 'sargento') {
      g.later(1.6, () => g.say('sargento', SARGENTO[Math.floor(Math.random() * SARGENTO.length)]));
    } else if (z.kind === 'alcaide') {
      g.later(1.6, () => g.say('alcaide', ALCAIDE[Math.floor(Math.random() * ALCAIDE.length)]));
    } else {
      g.later(1.6, () => g.say('capataz', CAPATAZ[Math.floor(Math.random() * CAPATAZ.length)]));
    }
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
      zz.phase = r() * 10;
      zz.hidden = 0;
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
      this.lookOf(zz);
      this.paint(zz);
      zz.pos.set(x, f.y ?? 0, z);
      zz.baseY = f.y ?? 0;
      zz.yaw = yaw;
      this.remoteMap.set(id, zz);
    }
    netTarget(zz, x, z, yaw);
    // la altura que manda el anfitrión (la torre)
    if (f.y !== undefined) zz.ny = f.y;
    // (para los sonidos: null si recién llega)
    const was = zz.state;
    if (zz.state !== state) {
      zz.state = state;
      zz.stateT = 0;
      zz.attackT = 0;
      if (state === 'dead' || state === 'melting') {
        zz.dead = true;
        zz.deathFrom = null;
        zz.meltFrom = null;
        zz.meltSq = false;
        zz.corpseT = 0;
      }
    }
    zz.dog = !!f.dog;
    zz.horse = !!f.horse;
    zz.yac = !!f.yac;
    zz.level = f.level ? 1 : 0;
    if (zz.dog) zz.hidden = ALL_PARTS;
    zz.speedType = f.speedType;
    zz.crawler = f.crawler;
    zz.dead = f.dead || state === 'dead';
    if (f.crawler) zz.hidden |= HIDE_LEGS;
    if (f.noHead) zz.hidden |= HIDE_HEAD;
    if (was !== state) this.remoteSound(zz, was, state);
  }

  // En línea: lo que el anfitrión oye cuando un zombie o un bicho cambia de
  // estado (aparece, ataca, cae), el invitado lo oye con la foto que llega
  // (antes solo le sonaban los quejidos sueltos).
  remoteSound(z, was, state) {
    const g = this.g;
    const P = g.player.pos;
    if (Math.hypot(z.pos.x - P.x, z.pos.z - P.z) > 30) return;
    const x = z.pos.x;
    const y = z.baseY || 0;
    const horse = z.dog && this.isHorse(z);
    const rig = this.rigOf(z);
    const voiced = z.dog && rig.voice && !horse;
    if (state === 'dogspawn' && was == null) {
      if (voiced && rig.spawnFx) rig.spawnFx(z);
      else if (horse) g.audio.neigh(tmpV.set(x, y + 1.8, z.pos.z), 1, 'spawn');
      else g.audio.howl(tmpV.set(x, y + 0.8, z.pos.z));
    } else if (was == null) {
      // (recién visto: ya estaba así; no suena)
    } else if (state === 'attack') {
      if (voiced) rig.voice(z, 'attack');
      else if (horse) g.audio.neigh(tmpV.set(x, y + 1.8, z.pos.z), 0.6, 'attack');
      else if (z.dog) g.audio.bark(tmpV.set(x, y + 0.7, z.pos.z), 'attack');
      else g.audio.growl(tmpV.set(x, y + 1.5, z.pos.z), 'attack');
    } else if (state === 'dead') {
      if (voiced) rig.voice(z, 'die');
      else if (horse) g.audio.neigh(tmpV.set(x, y + 1.5, z.pos.z), 1.3);
      else if (z.dog) g.audio.yelp(tmpV.set(x, y + 0.6, z.pos.z));
      else if (was !== 'frozen') g.audio.growl(tmpV.set(x, y + 1.6, z.pos.z), 'death');
    }
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
    // el anfitrión cambió de jefe entre una foto y la otra (el alma pesada de
    // la torre saca al cadáver del de la ronda): se arma de nuevo, bien vestido
    if (z && ((b.kind && z.kind !== b.kind) || (z.dead && !b.dead))) {
      this.removeBoss();
      z = null;
    }
    if (!z) {
      z = this.makeZombie(-1);
      z.boss = true;
      z.active = true;
      z.id = 0xffff;
      z.kind = b.kind || (b.mandinga ? 'mandinga' : 'capataz');
      z.scale = z.kind === 'luison' ? 2.2 : z.kind === 'scarecrow' ? 2.7 : z.kind === 'gil' || z.kind === 'francisco' ? 1.85 : b.mandinga ? 2.05 : 1.4;
      z.maxHp = 1;
      z.hatHp = b.mandinga || z.kind === 'luison' ? 0 : 1;
      z.hatFixed = z.kind === 'gil';
      z.mandinga = b.mandinga;
      z.speedType = 'run';
      z.limp = 0;
      z.headTilt = 0;
      z.armOff = 0;
      // sin esto la pose sale NaN y el jefe no se dibuja en el invitado
      z.yaw = b.yaw;
      z.phase = 0;
      z.state = b.state;
      z.stateT = 0;
      z.attackT = 0;
      z.corpseT = 0;
      z.twitchT = 0;
      z.twitch = 0;
      z.window = -1;
      this.boss = z;
      this.bossRig.rig.visible = true;
      this.dressBoss(z.kind);
      z.pos.set(b.x, b.y ?? 0, b.z);
      z.baseY = b.y ?? 0;
      // recién llegado: el invitado también lo oye (la llegada grabada de cada uno)
      if (b.state === 'intro' && !b.dead && ['capataz', 'alcaide', 'caballero', 'sargento'].includes(z.kind)) this.g.audio.bossSfx(z.kind);
      // (el Luisón llega aullando: si con la canción ya sonó desde el monte, no se repite)
      if (b.state === 'intro' && !b.dead && z.kind === 'luison' && !this.luisonPreHowled()) this.howlSound(z);
    }
    netTarget(z, b.x, b.z, b.yaw);
    if (b.y !== undefined) z.ny = b.y;
    z.hp = b.hp;
    z.dead = b.dead;
    if (z.state !== b.state) {
      z.state = b.state;
      z.stateT = 0;
      if (b.state === 'whip' && !b.dead) {
        if (z.kind === 'sargento' || z.kind === 'luison') this.saberFx(z);
        else if (z.kind !== 'alcaide') this.whipFx(z, b.yaw);
      }
      // el Luisón: el aullido con su resuello (y el vaho cuando aúlla de verdad);
      // llamando a los muertos, antes clava las manos en el barro
      if (z.kind === 'luison' && !b.dead && (b.state === 'howl' || b.state === 'enrage' || b.state === 'summon')) {
        this.howlSound(z, { prep: true });
        if (b.state === 'howl') this.g.later(HOWL_AT, () => this.boss === z && this.howlFx(z));
        if (b.state === 'summon') this.g.later(SUMMON_POUND, () => this.boss === z && this.luisonPound(z));
      }
    }
    const fin = this.g.arena?.bossName || 'El Mandinga';
    // muerto, sin barra (como en el anfitrión): si no, quedaba vacía hasta que se iba el cadáver
    if (b.dead && !b.mandinga) this.g.hud.setBossBar(null);
    else this.g.hud.setBossBar(b.mandinga ? (this.g.arena?.ward ? `${fin} (protegido)` : fin) : bossLabel(z), b.hp);
  }

  // Animación de los zombies que maneja otro (sin pensar ni chocar).
  updateRemote(dt, t) {
    const now = performance.now();
    this.moves.update(dt);
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
      if (this.g.world.tower) {
        // la torre: el piso debajo de la altura que manda el anfitrión (y la caída por el agujero)
        const ny = z.ny ?? z.baseY ?? 0;
        // (el que el remolino se lleva volando por un arco va a la altura que manda: towerKit)
        z.baseY = z.state === 'flung' && !this.g.world.tower.inFoot(z.pos.x, z.pos.z) ? ny : this.g.world.floorAt(z.pos.x, z.pos.z, ny);
        z.pos.y = z.state === 'fall' ? ny : z.baseY;
      } else if (this.g.world.levels) {
        // en el penal la altura es la del piso donde está (o la del bote en el que viene por el río,
        // o, muy arriba del piso, la que manda el anfitrión: los que van en la telesilla)
        const fy = this.g.world.floorAt(z.pos.x, z.pos.z, z.baseY);
        z.baseY = z.state === 'boat' || z.state === 'boatHit' || (z.ny != null && z.ny > fy + 1.5) ? z.ny ?? z.baseY : fy;
        if (z.state !== 'flung' && z.state !== 'drop') z.pos.y = z.baseY;
      } else if (!z.boss) {
        z.baseY = z.state === 'stairs' && inStair(z.pos.x, z.pos.z) ? stairY(z.pos.z) : z.level ? ATTIC.y : 0;
        if (z.state !== 'flung' && z.state !== 'drop') z.pos.y = z.baseY;
      }
      const speed = SPEEDS[z.speedType] || 1.2;
      switch (z.state) {
        case 'stairs':
          if (!z.dog) this.poseGait(z, dt, 1.6, t);
          break;
        case 'fall': {
          if (this.g.world.tower) {
            // cae por el agujero de la torre
            z.P.rootY = Math.max(0, z.pos.y - z.baseY);
            z.pos.y = z.baseY;
            this.poseClimb(z, 0.85);
            break;
          }
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
        case 'melting':
          this.meltStep(z);
          break;
        case 'shocked':
          this.poseShock(z, t);
          break;
        case 'reel':
        case 'zapped':
          reelPose(this, z, t);
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
          if (Math.random() < 0.8) this.g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.5 + Math.random() * 1.2, z.pos.z), 0.5, 2);
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
        case 'howl':
          this.poseRoar(z, t);
          break;
        // los estados nuevos de los jefes (la tercerola, bajo tierra)
        case 'aim':
        case 'shoot':
        case 'burrow':
        case 'emerge':
          this.moves.pose(z, t);
          break;
        case 'frozen':
        case 'flung':
          break;
        // parados en los botes del río (el penal): quietos o tirando manotazos
        case 'boat':
          this.poseIdle(z, t);
          break;
        case 'boatHit':
          z.attackT = (z.attackT + dt) % 0.95;
          this.poseAttack(z, t);
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
          // (los bichos con voz propia, como el puma o el yacaré, suenan a ellos mismos)
          if (d < 24 && z.dog && this.rigOf(z).voice) this.rigOf(z).voice(z, 'growl');
          else if (d < 24) this.g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.6, z.pos.z), z.crawler ? 'crawl' : z.speedType === 'sprint' ? 'scream' : 'idle');
        }
      }
    }
  }

  // ---------------- actualización ----------------
  update(dt, t) {
    const g = this.g;
    if (g.net?.guest) {
      this.updateRemote(dt, t);
      this.render(dt);
      return;
    }
    const player = g.player;
    // campo de flujo hacia el señuelo más cercano, si hay
    this.lure = g.lures.length ? g.lures[0] : null;
    if (this.lure) this.navLure.update(this.lure.pos.x, this.lure.pos.z, false, this.lure.pos.y);
    // desde la 3 el último corre siempre (en el Challenge, los dos últimos desde la 4);
    // de la 4 a la 7 los que caminan se largan a correr a medida que caen los números
    const R = g.rounds;
    const challenge = !!g.ee?.tuneZombie;
    const left = R.remainingTotal();
    const lastAlive = challenge ? left <= 2 && R.round >= 4 : left <= 1 && R.round >= 3;
    const share = challenge || !R.total ? 0 : runShare(R.round, 1 - left / R.total);
    // lo hondo cuesta más en el campo de flujo (y la inundación lo cambia)
    updateNavCost(g);
    // las empanadas: Tiempo Muerto (quietos) y Paso de Tortuga (caminan todos)
    const freeze = !!g.emp?.frozen();
    const slow = !!g.emp?.slowAll();
    for (const z of this.pool) {
      if (!z.active) continue;
      if (freeze && !z.dead && !z.boss) continue;
      if (!z.dead && !slow && z.speedType === 'walk' && (lastAlive || (z.runU != null && z.runU < share))) {
        z.speedType = 'run';
        z.speed = SPEEDS.run * (0.92 + Math.random() * 0.16);
      }
      this.think(z, dt, t, player);
    }
    if (this.boss) this.thinkBoss(this.boss, dt, t, player);
    this.moves.update(dt);
    this.separate(dt);
    this.render(dt);
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
        a.pushed = true;
        b.pushed = true;
      }
    }
    // (el empujón entre ellos no puede meter a uno adentro de un mueble o de
    // una rendija: después se choca de nuevo con lo de alrededor)
    const w = this.g.world;
    for (const z of list) {
      if (!z.pushed) continue;
      z.pushed = false;
      const by = z.baseY || 0;
      w.collide(z.pos, z.boss ? 0.45 : 0.3, by + 0.1, by + (z.boss ? 2.4 : 1.7));
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
        // (el que se arrastra sin piernas tiene sus propios quejidos)
        if (distP < 28) g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.6, z.pos.z), z.crawler ? 'crawl' : z.speedType === 'sprint' ? (Math.random() < 0.55 ? 'scream' : 'attack') : z.speedType === 'run' && Math.random() < 0.3 ? 'attack' : 'idle');
      }
      if (z.burnT > 0) {
        z.burnT -= dt;
        if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.8 + Math.random(), z.pos.z), 0.4, 1);
        // el fuego quema de a poco (sin puntos por cada quemadura)
        z.burnDmgT = (z.burnDmgT ?? 0.5) - dt;
        if (z.burnDmgT <= 0) {
          z.burnDmgT = 0.5;
          // los puntos del que lo prendió fuego (si es un compañero, se le mandan)
          const by = z.burnBy;
          const remote = by != null && g.net?.host && by !== g.net.id;
          this.damage(z, z.maxHp * 0.08 + 25, { type: 'burn', by, noPoints: remote, point: tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z).clone() });
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
          if (g.world.levels) z.pos.y = z.baseY = g.world.floorAt(z.pos.x, z.pos.z);
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
        const sameY = levelOf(pp.y) === 0 && (!g.world.levels || Math.abs(pp.y - w.int.y) < 1.3);
        if (z.attackT > 0 || (open && dIn < 1.1 && player.canBeHit() && sameY)) {
          if (z.attackT === 0) {
            z.attackHit = false;
            g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.6, z.pos.z), 'attack');
          }
          z.attackT += dt;
          this.poseAttack(z, t);
          if (!z.attackHit && z.attackT > 0.42) {
            z.attackHit = true;
            if (g.barriers.count(z.window) <= 1 && sameY && Math.hypot(pp.x - w.int.x, pp.z - w.int.z) < 1.3) g.damagePlayer(player, ZOMBIE_DAMAGE, z.pos);
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
        if (g.world.levels) z.baseY = z.pos.y;
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
          // en la torre, el que se cae de muy alto se hace puré (sin puntos)
          if (g.world.tower && (z.fellFrom || 0) - z.baseY > 7) {
            g.audio.land?.(tmpV.set(z.pos.x, z.baseY + 0.2, z.pos.z));
            g.fx.blood(tmpV.set(z.pos.x, z.baseY + 0.3, z.pos.z), { x: 0, y: 1, z: 0 }, 18, 1.2);
            this.kill(z, { type: 'nuke', noPoints: true });
          }
          z.fellFrom = 0;
        }
        break;
      }
      case 'frozen': {
        if (z.stateT > z.freezeT) {
          g.fx.frost(z.pos, 30);
          g.audio.shatter(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z));
          this.free(z);
        }
        break;
      }
      case 'shocked': {
        this.poseShock(z, t);
        if (Math.random() < 0.4) g.fx.electric(tmpV.set(z.pos.x, (z.baseY || 0) + 0.5 + Math.random() * 1.2, z.pos.z), 3);
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
            g.world.collide(z.pos, 0.3, (z.baseY || 0) + 0.1, (z.baseY || 0) + 1.7);
            g.fx.dust(tmpV.set(z.pos.x, (z.baseY || 0) + 0.05, z.pos.z), { x: 0, y: 1, z: 0 }, [0.45, 0.4, 0.35], 8);
            g.audio.land(tmpV.set(z.pos.x, (z.baseY || 0) + 0.2, z.pos.z));
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
        g.world.collide(z.pos, 0.3, (z.baseY || 0) + 0.1, (z.baseY || 0) + 1.7);
        if (g.world.levels) z.pos.y = z.baseY = g.world.floorAt(z.pos.x, z.pos.z, z.baseY);
        this.poseBurnRun(z, dt, t);
        g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.5 + Math.random() * 1.2, z.pos.z), 0.5, 2);
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
          if (Math.random() < 0.35) g.fx.steam(tmpV.set(z.pos.x, (z.baseY || 0) + 0.35, z.pos.z), 1, 0.5);
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
      case 'melting':
        this.meltStep(z);
        if (z.stateT > MELT_T) this.free(z);
        break;
      // el escudo lo hizo tambalear o lo electrocutó (entities/zombieReel.js)
      case 'reel':
      case 'zapped':
        reelStep(this, z, dt, t);
        break;
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
      if (Math.random() < 0.6 && !this.rigOf(z).spawnFx) g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.25, z.pos.z), 0.7, 1);
      if (z.stateT > 0.6) {
        this.setState(z, 'chase');
        // (el puma ya gritó al saltar)
        if (this.rigOf(z).voice) return;
        if (this.isHorse(z)) g.audio.neigh(tmpV.set(z.pos.x, (z.baseY || 0) + 1.8, z.pos.z), 1, 'spawn');
        else g.audio.howl(tmpV.set(z.pos.x, (z.baseY || 0) + 0.8, z.pos.z));
      }
      return;
    }
    if (z.dead && this.rigOf(z).sinks) {
      // el yacaré queda panza arriba y se hunde (Yacares.js lo dibuja)
      z.corpseT += dt;
      if (z.stateT > 3.2) this.free(z);
      return;
    }
    if (z.dead) {
      // al rato se deshace en brasas
      z.corpseT += dt;
      if (z.stateT > 1.1 && !z.burst) {
        z.burst = true;
        g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.3, z.pos.z), 0.8, 8);
        g.fx.sparks(tmpV, 1.5, { x: 0, y: 1, z: 0 }, [1, 0.5, 0.2]);
      }
      if (z.stateT > 1.5) this.free(z);
      return;
    }
    if (z.slowT > 0) z.slowT -= dt;
    if (z.burnT > 0) {
      z.burnT -= dt;
      if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.6, z.pos.z), 0.4, 1);
    }
    z.growlT -= dt;
    if (z.growlT <= 0) {
      z.growlT = 1.2 + Math.random() * 2.5;
      if (Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z) < 22) {
        if (this.rigOf(z).voice) this.rigOf(z).voice(z, 'growl');
        else if (this.isHorse(z)) g.audio.snort(tmpV.set(z.pos.x, (z.baseY || 0) + 1.8, z.pos.z));
        else g.audio.bark(tmpV.set(z.pos.x, (z.baseY || 0) + 0.7, z.pos.z));
      }
    }
    this.chase(z, dt, t, player, Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z));
  }

  // ¿Camina y no avanza (contra algo que no deja pasar)? Primero deja la
  // línea recta y va un rato por el campo de flujo; si igual sigue trabado,
  // se corre de costado (del lado donde hay lugar) y después retoma.
  unstick(z, px0, pz0, want, mx, mz, dt, r) {
    if (want < 1e-4) return;
    const got = Math.hypot(z.pos.x - px0, z.pos.z - pz0);
    z.stuckK = Math.min(2, Math.max(0, (z.stuckK || 0) + (got < want * 0.3 ? dt : -dt * 0.7)));
    if (z.stuckK > 0.3 && !(z.navT > 0)) {
      z.navT = 2.5;
      z.los = false;
    }
    if (z.stuckK > 0.75 && !(z.sideT > 0)) {
      const w = this.g.world;
      const by = z.baseY || 0;
      const lf = w.circleFree ? w.circleFree(z.pos.x - mz * 0.7, z.pos.z + mx * 0.7, r, by + 0.15, by + 1.6) : true;
      const rf = w.circleFree ? w.circleFree(z.pos.x + mz * 0.7, z.pos.z - mx * 0.7, r, by + 0.15, by + 1.6) : true;
      // (el ángulo positivo gira hacia la izquierda de la marcha)
      z.side = lf && !rf ? 1 : rf && !lf ? -1 : z.side ? -z.side : Math.random() < 0.5 ? 1 : -1;
      z.sideT = 0.6 + Math.random() * 0.4;
      z.stuckK = 0.35;
    }
  }

  setState(z, s) {
    z.state = s;
    z.stateT = 0;
    z.attackT = 0;
  }

  chase(z, dt, t, player, distP) {
    const g = this.g;
    const lure = this.lure;
    // va por el jugador de pie más cercano: a los tirados no los buscan (ni al
    // sumergido: solo los yacarés, que lo siguen abajo del agua pero no lo muerden)
    const target = g.nearestPlayer(z.pos.x, z.pos.z, z.pos.y, z.dog && !!this.rigOf(z).sinks);
    if (target && target !== player) {
      distP = Math.hypot(target.pos.x - z.pos.x, target.pos.z - z.pos.z);
      player = target;
    }
    let tx = player.pos.x;
    let tz = player.pos.z;
    // el yacaré con el jugador sumergido: no se le pone encima, lo rodea (cada
    // uno en su lugar del círculo, que va girando despacio)
    const ring = !!target && z.dog && !!this.rigOf(z).sinks && submerged(player);
    if (ring) {
      const a = z.slot * 2.39996 + t * 0.25;
      tx = player.pos.x + Math.cos(a) * 2.6;
      tz = player.pos.z + Math.sin(a) * 2.6;
    }
    // la torre lleva un campo de flujo por jugador (cada uno puede estar en otro piso)
    let nav = g.navFor ? g.navFor(player) : g.nav;
    // no queda nadie de pie: deambulan despacio alrededor, sin ir al que está tirado
    // la granja, en la defensa del yerbal: van a romper las parcelas (salvo que tengan a alguien medio cerca)
    const plot = g.defense?.active && !lure ? g.defense.goal(z, target, distP) : null;
    const wander = !target && !lure && !plot;
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
    if (plot) {
      tx = plot.x;
      tz = plot.z;
      nav = plot.nav;
    }
    // dos pisos: si el que busca está en el otro, primero va a la escalera
    const zl = z.level || 0;
    const sameLevel = zl === levelOf(player.pos.y);
    // en el penal: si está en otro piso (arriba de una baranda) no lo alcanza
    // (nadando, cuenta la altura a la que flota, no el fondo: entities/swim.js)
    const zy = z.swimK > 0.5 ? z.wetY - (z.dog ? 0.4 : 1.3 * (z.scale || 1)) : z.baseY || 0;
    const vert = !g.world.levels || Math.abs((player.pos.y || 0) - zy) < (z.swimK > 0.5 ? 1.6 : 1.3);
    // (el que viaja en la telesilla del penal solo lo alcanzan los que van adentro)
    const reach = plot ? plot.d : sameLevel && vert && !g.ee?.lift?.riding?.(player) ? distP : 99;
    if (!lure && !wander && !plot && !sameLevel) {
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
      if (g.world.levels) {
        const ty = (tx === player.pos.x ? player.pos.y : g.world.floorAt(tx, tz, z.baseY)) + 1.2;
        z.los = dist < 14 && g.world.clear(tmpV.set(z.pos.x, ey, z.pos.z), tmpV2.set(tx, ty, tz)) && walkLine(g.world, z.pos.x, z.pos.z, tx, tz, z.baseY);
        // la torre: al que está en otro piso (se lo ve por el hueco de la
        // escalera) no se va derecho, que bajaba la rampa, lo perdía de vista,
        // volvía a subir y así sin parar: se sigue el camino
        if (z.los && g.world.tower && Math.abs(ty - ey) > 1.6) z.los = false;
      } else z.los = dist < 14 && g.world.clear(tmpV.set(z.pos.x, ey, z.pos.z), tmpV2.set(tx, ey, tz));
      // y que pase el cuerpo: los ojos ven por arriba de un banco o de una
      // baranda baja, pero las piernas no pasan (caminaba contra eso sin parar)
      if (z.los && g.world.sweepFree) z.los = g.world.sweepFree(z.pos.x, z.pos.z, tx, tz, 0.26, (z.baseY || 0) + 0.15, (z.baseY || 0) + 1.6);
      // recién destrabado: un rato por el campo de flujo
      if (z.navT > 0) z.los = false;
      // la granja: el alambrado deja ver pero no pasar (que no se queden contra él)
      if (z.los && FEATURES.farm && !zl) z.los = nav.lineFree(z.pos.x, z.pos.z, tx, tz);
    }
    let mx = 0;
    let mz = 0;
    if ((dist < 1.6 && vert) || z.los || wander) {
      mx = dx / (dist || 1);
      mz = dz / (dist || 1);
    } else if (nav.direction(z.pos.x, z.pos.z, dirOut, z.baseY)) {
      mx = dirOut.x;
      mz = dirOut.z;
    } else {
      mx = dx / (dist || 1);
      mz = dz / (dist || 1);
    }

    // trabado: se corre de costado un rato (ver unstick)
    if (z.sideT > 0) {
      z.sideT -= dt;
      const c = Math.cos(z.side * 1.15);
      const sn = Math.sin(z.side * 1.15);
      const rx = mx * c - mz * sn;
      mz = mx * sn + mz * c;
      mx = rx;
    }
    if (z.navT > 0) z.navT -= dt;

    // (el agua frena: vadeando un poco, nadando bastante; entities/swim.js)
    const wet = z.dog ? this.rigOf(z).waterSpeed?.(z) ?? 1 : zombieWaterSpeed(z);
    const slow = !z.boss && !z.dog && this.g.emp?.slowAll();
    // (z.chainT: el grillete del escudo del penal, world/ShieldUpgrade)
    const speed = (z.crawler ? 0.75 : slow ? Math.min(z.speed, SPEEDS.walk * 1.1) : z.speed) * (z.slowT > 0 ? 0.4 : z.chainT > 0 ? 0.45 : 1) * (wander ? 0.55 : 1) * wet;
    const attacking = z.state === 'attack';
    // pasos arrastrados cuando andan cerca
    if (distP < 7) {
      z.stepT = (z.stepT ?? Math.random()) - dt * (z.speedType === 'walk' ? 1.3 : 2.6);
      if (z.stepT <= 0) {
        z.stepT = 1;
        g.audio.shuffle(tmpV.set(z.pos.x, (z.baseY || 0) + 0.2, z.pos.z));
      }
    }
    const stop = !lure && !wander && (ring ? dist < 0.4 : reach < 0.95);
    const sp = attacking ? speed * 0.25 : stop ? 0 : speed;
    this.turn(z, Math.atan2(mx, mz), z.speedType === 'sprint' ? 9 : 6, dt);
    // avanzar hacia donde mira (así giran como personas, no como flechas)
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const align = Math.max(0.2, fx * mx + fz * mz);
    const px0 = z.pos.x;
    const pz0 = z.pos.z;
    z.pos.x += fx * sp * align * dt;
    z.pos.z += fz * sp * align * dt;
    const by = z.baseY || 0;
    g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
    if (!attacking) this.unstick(z, px0, pz0, sp * align * dt, mx, mz, dt, 0.3);
    const nf = g.world.floorAt(z.pos.x, z.pos.z, by);
    // en la torre, el que pisa el agujero se cae hasta el primer piso con losa
    if (g.world.tower && nf < by - 1) {
      z.baseY = nf;
      z.pos.y = by;
      z.vel.set(0, 0, 0);
      z.fellFrom = by;
      this.setState(z, 'fall');
      return;
    }
    z.baseY = nf;
    z.pos.y = z.baseY;

    // empujar fuera del jugador
    const pdx = z.pos.x - player.pos.x;
    const pdz = z.pos.z - player.pos.z;
    const pd = Math.hypot(pdx, pdz);
    // (el yacaré que rodea al sumergido queda a más de 2 m)
    const keep = ring ? 2.2 : 0.7;
    if (pd < keep && pd > 1e-4 && sameLevel && (vert || ring)) {
      z.pos.x += (pdx / pd) * (keep - pd);
      z.pos.z += (pdz / pd) * (keep - pd);
    }

    // la prueba del pasillo: al que pasa corriendo al lado se le adelanta el
    // zarpazo. Cuánto se acerca el jugador por su cuenta (m/s, suavizado; sin
    // lo que camina el zombie, que al pegar frena): si en lo que tarda el golpe
    // va a quedar a tiro, arranca ya (antes esperaba al metro y pico y, para
    // cuando bajaba la mano, el que corría ya había pasado: no pegaba ni a 30 cm)
    const fresh = z.lastTgt === player && g.time - (z.reachT ?? -9) < 0.1 && z.lastReach < 90 && reach < 90;
    const inst = fresh ? (z.lastReach - reach) / Math.max(dt, 1e-3) : 0;
    z.closeV = fresh ? (z.closeV || 0) + (inst - (z.closeV || 0)) * (1 - Math.exp(-dt * 12)) : 0;
    z.lastReach = reach;
    z.lastTgt = player;
    z.reachT = g.time;
    if (!attacking) {
      if (z.crawler) this.poseCrawl(z, dt);
      else this.poseGait(z, dt, sp * align, t);
      const own = z.closeV - sp * align;
      const soon = !plot && own > 1.5 && reach < 5 && reach - ((own + speed * 0.25) * ATTACK_HIT) / (z.fury || 1) < 1.2;
      // (al escondido en una mata del Maizaster no lo ven: no le tiran el zarpazo)
      if ((reach < 1.3 || soon) && (plot || ((player.canBeHit ? player.canBeHit() : !player.downed && !player.dead) && !submerged(player) && !player.maizIn)) && !lure) {
        this.setState(z, 'attack');
        z.attackHit = false;
        z.attackNear = 99;
        z.attackTgt = player;
        if (z.dog && this.rigOf(z).voice) this.rigOf(z).voice(z, 'attack');
        else if (z.dog && this.isHorse(z)) g.audio.neigh(tmpV.set(z.pos.x, (z.baseY || 0) + 1.8, z.pos.z), 0.6, 'attack');
        else if (z.dog) g.audio.bark(tmpV.set(z.pos.x, (z.baseY || 0) + 0.7, z.pos.z), 'attack');
        else g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.5, z.pos.z), 'attack');
      }
    } else {
      z.attackT += dt * (z.fury || 1);
      if (z.crawler) this.poseCrawl(z, dt);
      else this.poseAttack(z, t);
      // lo más cerca que pasó mientras bajaba la mano (el que cruzó por
      // adelante justo antes del golpe también cobra)
      if (z.attackT > 0.2 && player === z.attackTgt) z.attackNear = Math.min(z.attackNear ?? 99, reach);
      if (!z.attackHit && z.attackT > ATTACK_HIT) {
        z.attackHit = true;
        if (reach < 1.65 || (!plot && player === z.attackTgt && z.attackNear < 1.4)) {
          if (plot) g.defense.zombieHit(plot);
          // (se sumergió a tiempo: no lo alcanza)
          else if (!submerged(player)) g.damagePlayer(player, this.biteOf(z), z.pos);
        }
      }
      if (z.attackT > 0.95) this.setState(z, 'chase');
    }

    // zombies perdidos o trabados: vuelven a la cola de la ronda
    // (en la torre cuenta el camino: el que quedó muchos pisos abajo vuelve a salir cerca)
    const far = g.world.tower ? nav.distAt(z.pos.x, z.pos.z, z.baseY) > 60 : distP > 36;
    if (far && !z.los && !plot) z.farT += dt;
    else z.farT = 0;
    if (z.farT > 14) {
      this.free(z);
      g.rounds.requeue(1);
    }
  }

  // ---------------- Capataz ----------------
  thinkBoss(z, dt, t, player) {
    const g = this.g;
    // va por el jugador de pie más cercano (en co-op, cada tanto, por el que
    // más le pega: BossMoves.target); al que está tirado (o anda en gaucho
    // life) no lo persigue; si no queda nadie de pie, se aparta y espera
    const standing = this.moves.target(z, dt);
    if (standing) player = standing;
    const nobody = !standing;
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
        g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 2, z.pos.z), Math.random() < 0.5 ? 'boss' : 'attack');
      }
    }
    if (!z.mandinga) g.hud.setBossBar(z.dead ? null : z.enraged ? `${bossLabel(z)} (enfurecido)` : bossLabel(z), Math.max(0, z.hp / z.maxHp));
    switch (z.state) {
      case 'intro': {
        this.turn(z, Math.atan2(dxp, dzp), 4, dt);
        this.poseRoar(z, t);
        if (z.stateT > (z.kind === 'luison' ? LUISON_END.intro : 1.8)) this.setState(z, 'chase');
        break;
      }
      case 'chase': {
        z.fromGrass = false;
        // recién llegado (la llegada del Luisón: cayó de la loma), un rato
        // quieto mirándolos antes de atacar
        if (z.holdT > 0) {
          z.holdT -= dt;
          this.turn(z, Math.atan2(dxp, dzp), 3, dt);
          this.poseIdle(z, t);
          break;
        }
        if (nobody) {
          // (antes seguía encima del caído, rugiéndole y tirando golpes al aire)
          if (distP < 7) this.moveBoss(z, -dxp / (distP || 1), -dzp / (distP || 1), z.speed * 0.6, dt, t);
          else this.poseIdle(z, t);
          break;
        }
        if (levelOf(pp.y) === 1) {
          // el Capataz no entra por la escalera: se planta abajo y manda a los peones
          this.navStair0.update(STAIR_BOTTOM.x, STAIR_BOTTOM.z);
          const ex = STAIR_BOTTOM.x - z.pos.x;
          const ez = STAIR_BOTTOM.z - z.pos.z;
          const ed = Math.hypot(ex, ez);
          let mx = ex / (ed || 1);
          let mz = ez / (ed || 1);
          if (!g.world.clear(tmpV.set(z.pos.x, (z.baseY || 0) + 1.4, z.pos.z), tmpV2.set(STAIR_BOTTOM.x, 1.4, STAIR_BOTTOM.z)) && this.navStair0.direction(z.pos.x, z.pos.z, dirOut)) {
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
          }
          break;
        }
        // segunda fase: con la mitad de la vida se enfurece y llama a los peones
        if (!z.enraged && !z.mandinga && z.hp < z.maxHp * 0.5) {
          z.enraged = true;
          z.speed *= 1.3;
          this.setState(z, 'enrage');
          this.callPeones(z, 3 + Math.min(3, (g.rounds?.players || 1) - 1));
          if (z.kind === 'luison') this.howlSound(z, { prep: true });
          if (z.kind === 'alcaide') g.say('alcaide', '¡Guardia! ¡Guardia! ¡Traigan a los presos, que a este lo fajo yo!');
          // (sin clarín: el Sargento suena solo con el silbato de su llegada)
          if (z.kind === 'sargento') g.say('sargento', '¡A degüello, muchachos! ¡Que no quede ni uno!');
          break;
        }
        // el Luisón aúlla: el que lo oye cerca se queda helado un rato
        if (z.kind === 'luison') {
          z.howlCd = (z.howlCd ?? 6) - dt;
          if (z.howlCd <= 0 && distP < 16) {
            z.howlCd = (z.enraged ? 9 : 13) + Math.random() * 4;
            z.howled = false;
            this.setState(z, 'howl');
            this.howlSound(z, { prep: true });
            break;
          }
          // tres veces en la pelea (LURK_AT de la vida) se esconde en el
          // pajonal y sale por otro lado, cerca del que persigue. El seguro: si
          // quedó adentro de la paja o del monte, o hace un rato que no avanza
          // (trabado), también se esconde y sale al lado del jugador.
          if (g.world.levels) {
            z.lostT = (z.lostT || 0) - dt;
            z.lurkTry = (z.lurkTry || 0) - dt;
            const k = this.cellKind(z.pos.x, z.pos.z);
            const lost = (k === 1 || k === 2) && z.lostT <= 0;
            z.progT = (z.progT || 0) + dt;
            if (!z.progP || z.progT > 5) {
              z.stuckNow = !!z.progP && Math.hypot(z.pos.x - z.progP[0], z.pos.z - z.progP[1]) < 1.2 && distP > 3.5;
              z.progP = [z.pos.x, z.pos.z];
              z.progT = 0;
            }
            const n = z.lurks || 0;
            const due = n < LURK_AT.length && z.hp < z.maxHp * LURK_AT[n] && z.lurkTry <= 0;
            if (lost || z.stuckNow || due) {
              const here = lost || z.stuckNow;
              if (lost) z.lostT = 1;
              z.lurkTry = 2;
              z.stuckNow = false;
              if (this.planLurk(z, player, here)) {
                if (due) z.lurks = n + 1;
                break;
              }
            }
          }
        }
        z.whipCd = (z.whipCd ?? 3) - dt;
        z.chargeCd = (z.chargeCd ?? 7) - dt;
        z.summonCd = (z.summonCd ?? 20) - dt;
        // el Sargento, de lejos, apunta la tercerola
        if (z.kind === 'sargento' && this.moves.rifleReady(z, dt, distP, player)) {
          this.setState(z, 'aim');
          break;
        }
        // (la cadena del Alcaide llega más lejos que el rebenque)
        const ready = (z.whipCd <= 0 && distP > 3.2 && distP < (z.kind === 'alcaide' || z.kind === 'gil' ? 14 : 8.5)) || (z.chargeCd <= 0 && distP > 7 && distP < 18);
        const flat = !g.world.levels || (Math.abs((pp.y || 0) - (z.baseY || 0)) < 1 && walkLine(g.world, z.pos.x, z.pos.z, pp.x, pp.z, z.baseY));
        if (ready && flat && player.canBeHit?.() !== false && g.world.clear(tmpV.set(z.pos.x, (z.baseY || 0) + 1.4, z.pos.z), tmpV2.set(pp.x, (pp.y || 0) + 1.4, pp.z))) {
          if (z.chargeCd <= 0 && distP > 7) {
            z.chargeCd = (z.enraged ? 7 : 10) + Math.random() * 3;
            this.setState(z, 'chargeWind');
            g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 2, z.pos.z), 'boss');
          } else {
            z.whipCd = (z.enraged ? 3.5 : 5) + Math.random() * 2;
            this.setState(z, 'whipWind');
          }
          break;
        }
        if ((z.enraged || z.kind === 'luison') && z.summonCd <= 0) {
          z.summonCd = z.kind === 'luison' ? (z.enraged ? 14 : 20) : 22;
          this.setState(z, 'summon');
          this.callPeones(z, z.kind === 'luison' ? 3 : 2);
          if (z.kind === 'luison') {
            this.howlSound(z, { prep: true });
            z.pounded = false;
          }
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
        // (recién destrabado va por el campo de flujo; y la recta tiene que dejar pasar el cuerpo)
        const los = !(z.navT > 0) && distP < 12 && g.world.clear(tmpV.set(z.pos.x, (z.baseY || 0) + 1.4, z.pos.z), tmpV2.set(pp.x, (pp.y || 0) + 1.4, pp.z)) && (!g.world.levels || walkLine(g.world, z.pos.x, z.pos.z, pp.x, pp.z, z.baseY)) && (!g.world.sweepFree || g.world.sweepFree(z.pos.x, z.pos.z, pp.x, pp.z, 0.4, (z.baseY || 0) + 0.15, (z.baseY || 0) + 2.2));
        if (!los && (g.navFor ? g.navFor(player) : g.nav).direction(z.pos.x, z.pos.z, dirOut, z.baseY, 1)) {
          mx = dirOut.x;
          mz = dirOut.z;
        }
        this.moveBoss(z, mx, mz, z.speed, dt, t);
        if (distP < (z.kind === 'luison' ? 2.9 : 2.3) && levelOf(pp.y) === 0 && Math.abs((pp.y || 0) - (z.baseY || 0)) < 1.5 && (player.canBeHit ? player.canBeHit() : !player.downed && !player.dead)) {
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
        if (!g.world.clear(tmpV.set(z.pos.x, (z.baseY || 0) + 1.4, z.pos.z), tmpV2.set(tg.front.x, (tg.front.y || 0) + 1.4, tg.front.z)) || (g.world.levels && !walkLine(g.world, z.pos.x, z.pos.z, tg.front.x, tg.front.z, z.baseY))) {
          // ir por el campo de flujo del señuelo apuntado a la máquina
          this.navLure.update(tg.front.x, tg.front.z, true, tg.front.y);
          if (this.navLure.direction(z.pos.x, z.pos.z, dirOut, z.baseY)) {
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
        // (el Capataz fija el golpe a los 0,45 s y pega un poco más cerca)
        const capataz = z.kind === 'capataz';
        if (!(capataz && z.stateT > 0.45)) this.turn(z, Math.atan2(dxp, dzp), 3, dt);
        this.poseSlam(z, z.stateT);
        if (!z.attackHit && z.stateT > 0.75) {
          z.attackHit = true;
          const hit = tmpV.set(z.pos.x + Math.sin(z.yaw) * 1.4, (z.baseY || 0) + 0.05, z.pos.z + Math.cos(z.yaw) * 1.4);
          g.audio.bossSlam(hit);
          g.fx.dust(hit, { x: 0, y: 1, z: 0 }, [0.4, 0.35, 0.3], 14);
          g.fx.addShake(0.5);
          if (Math.hypot(pp.x - hit.x, pp.z - hit.z) < (capataz ? 2.1 : 2.4) && levelOf(pp.y) === 0 && Math.abs((pp.y || 0) - (z.baseY || 0)) < 1.5) g.damagePlayer(player, BOSS_DAMAGE, z.pos);
        }
        if (z.stateT > 1.4) this.setState(z, 'chase');
        break;
      }
      case 'whipWind': {
        // levanta el rebenque apuntando a la víctima (el Capataz deja de
        // seguirla a los 0,4 s: con la franja quieta se lo puede esquivar)
        if (!(z.kind === 'capataz' && z.stateT > 0.4)) this.turn(z, Math.atan2(dxp, dzp), 5, dt);
        this.poseSlam(z, Math.min(0.55, z.stateT * 0.8));
        if (z.stateT > 0.65) {
          this.setState(z, 'whip');
          // el Sargento, en vez del rebenque, se tira adelante con el sable
          if (z.kind === 'sargento' || z.kind === 'luison') this.saberStart(z);
          // el Alcaide tira la cadena y al que agarra lo trae (el Gil del cerro, igual:
          // juega con las cadenas, sin rebenque)
          else if (z.kind === 'alcaide' || z.kind === 'gil') this.moves.chainThrow(z);
          else this.whipHit(z);
        }
        break;
      }
      case 'whip':
        this.poseSlam(z, 0.55 + Math.min(0.85, z.stateT * 2.6));
        if (z.kind === 'sargento' || z.kind === 'luison') this.saberStep(z, dt);
        if (z.stateT > 0.45) this.setState(z, 'chase');
        break;
      case 'chargeWind': {
        // escarba el piso mirando fijo: después sale derecho
        this.turn(z, Math.atan2(dxp, dzp), 6, dt);
        this.poseRoar(z, t);
        if (Math.random() < 0.3) g.fx.dust(tmpV.set(z.pos.x, (z.baseY || 0) + 0.1, z.pos.z), { x: 0, y: 0.6, z: 0 }, [0.4, 0.35, 0.3], 3);
        if (z.stateT > 0.85) {
          this.setState(z, 'charge');
          z.chargeYaw = z.yaw;
          z.chargeHits = new Set();
          // el Luisón salta justo encima (de 7 a 16 m/s según lo lejos)
          z.pounceV = Math.max(7, Math.min(16, (distP - 1.2) / POUNCE));
        }
        break;
      }
      case 'charge': {
        const fx = Math.sin(z.chargeYaw);
        const fz = Math.cos(z.chargeYaw);
        const sp = (z.kind === 'luison' ? z.pounceV || 13 : z.kind === 'scarecrow' ? 7.5 : 9.5) * dt;
        const bx = z.pos.x;
        const bz = z.pos.z;
        z.pos.x += fx * sp;
        z.pos.z += fz * sp;
        // (el salto que sale del pajonal atraviesa la paja)
        g.world.collide(z.pos, 0.45, this.bossFeet(z), (z.baseY || 0) + 2.4, this.bossColl(z, z.fromGrass));
        this.bossGround(z, bx, bz);
        const moved = Math.hypot(z.pos.x - bx, z.pos.z - bz);
        this.poseGait(z, dt, 7, t);
        if (Math.random() < 0.6) g.fx.dust(tmpV.set(z.pos.x, (z.baseY || 0) + 0.1, z.pos.z), { x: -fx, y: 0.5, z: -fz }, [0.4, 0.35, 0.3], 2);
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
        // (en las arenas del final, solo contra las columnas: el borde lo frena y listo)
        const A = g.arena?.active ? g.arena.A : null;
        const edge = A && Math.hypot(z.pos.x - A.x, z.pos.z - A.z) > A.r - 1.4;
        const col = A && g.arena.colHit?.(z.pos, 0.7);
        if (edge && !col && z.stateT > 0.12) this.setState(z, 'chase');
        else if (z.stateT > 0.12 && (moved < sp * 0.35 || col)) {
          this.setState(z, 'stunned');
          z.stunK = A ? 1.5 : 2;
          g.audio.bossSlam(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z));
          g.fx.sparks(tmpV.set(z.pos.x + fx * 0.6, (z.baseY || 0) + 2, z.pos.z + fz * 0.6), 1.5, { x: -fx, y: 1, z: -fz });
          g.fx.addShake(0.4);
          g.hud.subtitle('¡Se dio contra la pared! Está atontado: dale ahora.', 2.5);
          g.net?.event('sub', { x: '¡Se dio contra la pared! Está atontado: dale ahora.', d: 2.5 });
        } else if (z.kind === 'luison' && z.stateT > POUNCE) {
          this.pounceLand(z);
          this.setState(z, 'chase');
        } else if (z.stateT > 1.8) this.setState(z, 'chase');
        break;
      }
      case 'stunned':
        this.poseShock(z, t * 0.35);
        if (Math.random() < 0.3) g.fx.sparkle(tmpV.set(z.pos.x + (Math.random() - 0.5) * 0.6, (z.baseY || 0) + 2.9 * (z.scale / 1.4), z.pos.z + (Math.random() - 0.5) * 0.6), [1, 0.9, 0.4], 1, 0.3);
        if (z.stateT > 2.8) {
          z.stunK = 0;
          this.setState(z, 'chase');
        }
        break;
      // la tercerola del Sargento y el Espantapájaros bajo tierra (entities/bossMoves.js)
      case 'aim':
      case 'shoot':
      case 'burrow':
      case 'emerge':
        this.moves.think(z, dt, t);
        break;
      case 'howl':
        // el aullido: junta aire mientras suena el resuello y cuando aúlla de
        // verdad sale el vaho que hiela (howlFx, también en el invitado)
        this.turn(z, Math.atan2(dxp, dzp), 3, dt);
        this.poseRoar(z, t);
        if (!z.howled && z.stateT > HOWL_AT) {
          z.howled = true;
          this.howlFx(z);
        }
        if (z.stateT > LUISON_END.howl) this.setState(z, 'chase');
        break;
      case 'enrage':
      case 'summon': {
        this.turn(z, Math.atan2(dxp, dzp), 3, dt);
        this.poseRoar(z, t);
        const lu = z.kind === 'luison';
        if (lu && z.state === 'summon' && !z.pounded && z.stateT > SUMMON_POUND) {
          z.pounded = true;
          this.luisonPound(z);
        }
        if (z.stateT > (lu ? LUISON_END[z.state] : z.state === 'enrage' ? 1.8 : 1.2)) this.setState(z, 'chase');
        break;
      }
      // el Luisón se mete al pajonal (planLurk): va a la paja más cercana...
      case 'lurkIn': {
        const [ex, ez] = z.lurkPath[0];
        const dx = ex - z.pos.x;
        const dz = ez - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          z.lurkI = 1;
          this.setState(z, 'lurk');
          break;
        }
        // (el seguro: si no llega a la paja, se hunde en el barro ahí y sale
        // igual por otro lado; si tampoco, sigue persiguiendo)
        if (z.stateT > 4) {
          if (!this.planLurk(z, player, true)) this.setState(z, 'chase');
          break;
        }
        z.skipCorn = true;
        this.moveBoss(z, dx / d, dz / d, z.speed * 0.85, dt, t);
        z.skipCorn = false;
        break;
      }
      // ...cruza por adentro de la paja y por el monte (afuera del mapa no se
      // lo ve ni se le pega: se lo oye y se mueve el pasto) y sale agazapado
      // en la paja de cerca del jugador, de donde salta
      case 'lurk': {
        const [ex, ez] = z.lurkPath[z.lurkI];
        const dx = ex - z.pos.x;
        const dz = ez - z.pos.z;
        const d = Math.hypot(dx, dz);
        const late = z.stateT > (z.lurkMin || 5) + 9;
        if (d < 0.3 || late) {
          if (z.lurkI < z.lurkPath.length - 1 && !late) {
            z.lurkI++;
            break;
          }
          z.pos.x = ex;
          z.pos.z = ez;
          z.pos.y = z.baseY = g.world.floorAt(ex, ez, z.baseY);
          z.yaw = Math.atan2(dxp, dzp);
          z.fromGrass = true;
          z.progP = null;
          this.setState(z, 'chargeWind');
          g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 2, z.pos.z), 'boss');
          break;
        }
        // cerca de la salida y todavía en el monte (no se lo ve), espera hasta
        // haber estado escondido un rato (lurkMin): gruñe una vez, desde ahí
        let left = d;
        const L = z.lurkPath;
        for (let i = z.lurkI; i < L.length - 1; i++) left += Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]);
        if (left < 5 && z.stateT < (z.lurkMin || 5) && this.cellKind(z.pos.x, z.pos.z) === 2) {
          this.turn(z, Math.atan2(dxp, dzp), 3, dt);
          this.poseGait(z, dt, 0, t);
          if (!z.lurkGrowl && z.stateT > (z.lurkMin || 5) - 2) {
            z.lurkGrowl = true;
            g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 'boss');
          }
          break;
        }
        const sp = Math.min(d, (this.cellKind(z.pos.x, z.pos.z) === 0 ? 10 : 6.5) * dt);
        z.pos.x += (dx / d) * sp;
        z.pos.z += (dz / d) * sp;
        z.pos.y = z.baseY = g.world.floorAt(z.pos.x, z.pos.z, z.baseY);
        this.turn(z, Math.atan2(dx, dz), 8, dt);
        this.poseGait(z, dt, 6.5, t);
        break;
      }
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

  // Qué hay en una celda para el Luisón que se mete al pajonal: 0 se camina,
  // 1 pajonal (la paja del borde de las islas), 2 el monte (afuera del mapa),
  // 3 otra cosa (paredes, barandas, casas).
  cellKind(x, z) {
    const w = this.g.world;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return 3;
    if (!this.cells || this.cellsW !== w) {
      this.cellsW = w;
      const K = (this.cells = new Uint8Array(w.W * w.H));
      for (let i = 0; i < K.length; i++) {
        let corn = false;
        let solid = false;
        for (const b of w.cellBoxes[i] || []) {
          if (!b.solid) continue;
          if (b.kind === 'corn') corn = true;
          else if (b.kind !== 'ground') solid = true;
        }
        K[i] = corn ? 1 : w.grid[i] === 0 ? (solid ? 3 : 2) : w.grid[i] === 1 ? 0 : 3;
      }
    }
    return this.cells[w.idx(cx, cz)];
  }

  // ¿De la paja en (cx, cz) se sale a un piso que se camina a esta altura?
  cornExit(cx, cz, y) {
    const w = this.g.world;
    for (const [dx, dz] of CROSS) {
      if (this.cellKind(cx + dx + 0.5, cz + dz + 0.5) !== 0) continue;
      if (Math.abs(w.floorAt(cx + dx + 0.5, cz + dz + 0.5, y) - y) < 1.2) return [cx + dx + 0.5, cz + dz + 0.5];
    }
    return null;
  }

  // ¿De a a b se va escondido (solo por paja y monte; deep: solo por el
  // monte, salvo en las celdas de las puntas)?
  hiddenLine(ax, az, bx, bz, deep = false) {
    const ca = Math.floor(ax) + Math.floor(az) * 4096;
    const cb = Math.floor(bx) + Math.floor(bz) * 4096;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      const k = this.cellKind(x, z);
      if (k === 0 || k === 3) return false;
      if (deep && k === 1) {
        const c = Math.floor(x) + Math.floor(z) * 4096;
        if (c !== ca && c !== cb) return false;
      }
    }
    return true;
  }

  // Lo que frena al jefe al moverse (corn: saliendo del pajonal o entrando,
  // pasa por la paja). El Luisón además pasa por arriba de la utilería chica del
  // piso (troncos, escombros: en el campamento se trababa en las maderas del
  // piso; el fogón sí lo frena, firm); los demás, como siempre.
  bossColl(z, corn) {
    if (z.kind !== 'luison') return corn ? SKIP_CORN : undefined;
    const o = corn ? LUISON_CORN : LUISON_COLL;
    o.lowProp = (z.baseY || 0) + 0.75;
    return o;
  }

  // ¿Pasa el cuerpo del jefe (0,45 m a cada lado) derecho de a a b, por piso o
  // por paja, sin chocar con nada (la caja, las máquinas, las barandas)?
  clearWalk(ax, az, bx, bz, y) {
    const w = this.g.world;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) return true;
    const nx = (-(bz - az) / L) * 0.45;
    const nz = ((bx - ax) / L) * 0.45;
    const n = Math.ceil(L / 0.3);
    for (let i = 0; i <= n; i++) {
      const cx = ax + ((bx - ax) * i) / n;
      const cz = az + ((bz - az) * i) / n;
      for (let sd = -1; sd <= 1; sd++) {
        const x = cx + nx * sd;
        const z = cz + nz * sd;
        const k = this.cellKind(x, z);
        if (k !== 0 && k !== 1) return false;
        for (const bb of w.cellBoxes[w.idx(Math.floor(x), Math.floor(z))] || []) {
          if (!bb.active || !bb.solid || bb.kind === 'ground' || bb.kind === 'corn') continue;
          if (bb.y1 < y + 0.3 || bb.y0 > y + 2 || (bb.kind === 'prop' && !bb.firm && bb.y1 < y + 0.75)) continue;
          if (x > bb.x0 && x < bb.x1 && z > bb.z0 && z < bb.z1) return false;
        }
      }
    }
    return true;
  }

  // La entrada al pajonal, ya hecha la búsqueda de planLurk (prev/lurkD): donde
  // está (here, el seguro) o la paja más cerca de él con piso al lado, paso
  // libre hasta ahí y a lo menos 3 celdas escondidas hasta una salida. -1: no hay.
  // minA: la entrada y su salida separadas a lo menos ese ángulo alrededor del
  // jugador (pp), así no sale por el mismo lado por donde se metió.
  lurkEntry(z, here, s0, by, minA = 0, pp = null) {
    const w = this.g.world;
    const W = w.W;
    const prev = this.lurkPrev;
    const D = this.lurkD;
    const apart = (i) => {
      if (!minA || !pp) return true;
      let r = i;
      for (let k = 0; k < 80 && prev[r] !== r; k++) r = prev[r];
      const a0 = Math.atan2((i % W) + 0.5 - pp.x, Math.floor(i / W) + 0.5 - pp.z);
      const a1 = Math.atan2((r % W) + 0.5 - pp.x, Math.floor(r / W) + 0.5 - pp.z);
      const da = Math.abs(a1 - a0) % (Math.PI * 2);
      return (da > Math.PI ? Math.PI * 2 - da : da) >= minA;
    };
    if (here) return prev[s0] >= 0 && apart(s0) ? s0 : -1;
    let s = -1;
    let bd = 101;
    const cx = Math.floor(z.pos.x);
    const cz = Math.floor(z.pos.z);
    for (let dz = -10; dz <= 10; dz++) {
      for (let dx = -10; dx <= 10; dx++) {
        const x = cx + dx;
        const zz = cz + dz;
        if (!w.inside(x, zz)) continue;
        const i = zz * W + x;
        if (prev[i] < 0 || D[i] < 3 || this.cells[i] !== 1) continue;
        const d2 = (x + 0.5 - z.pos.x) ** 2 + (zz + 0.5 - z.pos.z) ** 2;
        if (d2 < bd && this.cornExit(x, zz, by) && apart(i) && this.clearWalk(z.pos.x, z.pos.z, x + 0.5, zz + 0.5, by)) {
          bd = d2;
          s = i;
        }
      }
    }
    return s;
  }

  // El Luisón arma por dónde se mete al pajonal y por dónde sale: la salida es
  // paja pegada al piso del jugador a 4-9 m (mejor de costado o por detrás); la
  // entrada, la paja más cerca de él que tenga camino escondido (solo por paja y
  // monte) hasta alguna salida (here: desde donde está, el seguro). La búsqueda
  // va a lo ancho por la grilla desde las salidas y el camino se endereza; si
  // no hay (el seguro), se hunde y sale directo en la mejor salida.
  planLurk(z, player, here) {
    const g = this.g;
    const w = g.world;
    const by = z.baseY || 0;
    // las salidas posibles, de la mejor a la peor
    const pp = player.pos;
    const py = pp.y || 0;
    const fx = -Math.sin(player.yaw || 0);
    const fz = -Math.cos(player.yaw || 0);
    const outs = [];
    const pcx = Math.floor(pp.x);
    const pcz = Math.floor(pp.z);
    for (let dz = -9; dz <= 9; dz++) {
      for (let dx = -9; dx <= 9; dx++) {
        const x = pcx + dx;
        const zz = pcz + dz;
        const ox = x + 0.5 - pp.x;
        const oz = zz + 0.5 - pp.z;
        const d = Math.hypot(ox, oz);
        if (d < 4 || d > 9 || this.cellKind(x + 0.5, zz + 0.5) !== 1) continue;
        const step = this.cornExit(x, zz, py);
        if (!step || !Number.isFinite(g.nav.distAt(step[0], step[1], py))) continue;
        // de frente al jugador pesa más (lo ve venir): mejor de costado o de atrás
        const front = (ox * fx + oz * fz) / d;
        outs.push({ x, z: zz, a: Math.atan2(ox, oz), s: Math.abs(d - 6) + Math.max(0, front) * 4 + Math.random() });
      }
    }
    if (!outs.length) return false;
    outs.sort((a, b) => a.s - b.s);
    // sale lejos de por donde entró (el ángulo alrededor del jugador): mejor
    // del otro lado (más de 110°), si no de costado (70°), si no donde haya;
    // por el mismo lado atacaba casi desde donde se había metido
    const la = Math.atan2(z.pos.x - pp.x, z.pos.z - pp.z);
    for (const o of outs) {
      const da = Math.abs(o.a - la) % (Math.PI * 2);
      o.da = da > Math.PI ? Math.PI * 2 - da : da;
    }
    const MIN_A = [1.9, 1.2, 0];
    const tiers = MIN_A.map((m) => outs.filter((o) => o.da >= m));
    const passes = [];
    tiers.forEach((T, i) => {
      if (!T.length) return;
      for (const dp of [true, false]) passes.push([dp, T, MIN_A[i]]);
    });
    // a lo ancho por paja y monte desde las mejores salidas: cada celda sabe por
    // dónde se va a la salida más cerca (prev) y a cuántas celdas está (a lo
    // sumo 70)
    const W = w.W;
    const N = W * w.H;
    if (!this.lurkPrev || this.lurkPrev.length !== N) {
      this.lurkPrev = new Int32Array(N);
      this.lurkQ = new Int32Array(N);
      this.lurkD = new Int16Array(N);
    }
    const prev = this.lurkPrev;
    const D = this.lurkD;
    const Q = this.lurkQ;
    // (el seguro sale de donde está, aunque no sea paja)
    const s0 = here ? w.idx(Math.floor(z.pos.x), Math.floor(z.pos.z)) : -1;
    // (y las sendas angostas que cortan el monte, lejos del jugador: las
    // cruza corriendo; si no, en el fogón no salía nunca del otro lado)
    const K = this.cells;
    const narrow = (i) => {
      const x = i % W;
      const zz = (i - x) / W;
      if ((x + 0.5 - pp.x) ** 2 + (zz + 0.5 - pp.z) ** 2 < 100) return false;
      const side = (sx, sz) => {
        for (let k = 1; k <= 3; k++) {
          if (!w.inside(x + sx * k, zz + sz * k)) return false;
          const c = K[(zz + sz * k) * W + x + sx * k];
          if (c === 1 || c === 2) return true;
          if (c !== 0) return false;
        }
        return false;
      };
      return (side(1, 0) && side(-1, 0)) || (side(0, 1) && side(0, -1));
    };
    const hid = (i) => i === s0 || K[i] === 1 || K[i] === 2 || (K[i] === 0 && narrow(i));
    // deep: por el monte, donde no se lo ve (de la paja, solo la celda de la
    // salida y la de la entrada: por el borde de paja se lo veía siempre); si
    // no hay camino así, también por la paja (por cada grupo de salidas, del
    // otro lado primero)
    let s = -1;
    let en = null;
    let deep = true;
    for (const [dp, T, minA] of passes) {
      deep = dp;
      prev.fill(-1);
      let qh = 0;
      let qt = 0;
      for (const o of T) {
        const j = o.z * W + o.x;
        if (prev[j] >= 0) continue;
        prev[j] = j;
        D[j] = 0;
        Q[qt++] = j;
      }
      while (qh < qt) {
        const i = Q[qh++];
        if (D[i] >= 70 || i === s0 || (dp && D[i] > 0 && this.cells[i] === 1)) continue;
        const cx = i % W;
        const cz = (i - cx) / W;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const nx = cx + dx;
            const nz = cz + dz;
            if (!w.inside(nx, nz)) continue;
            const j = nz * W + nx;
            if (prev[j] >= 0 || !hid(j)) continue;
            if (dx && dz && (!hid(cz * W + nx) || !hid(nz * W + cx))) continue;
            prev[j] = i;
            D[j] = D[i] + 1;
            Q[qt++] = j;
          }
        }
      }
      s = this.lurkEntry(z, here, s0, by, minA, pp);
      if (s >= 0) break;
    }
    if (s >= 0) en = here ? [z.pos.x, z.pos.z] : [(s % W) + 0.5, Math.floor(s / W) + 0.5];
    let path = null;
    if (s >= 0) {
      // de la entrada a la salida siguiendo prev, y enderezado: de cada punto,
      // al más lejano que se ve escondido
      const cells = [en];
      for (let c = s; prev[c] !== c; ) {
        c = prev[c];
        cells.push([(c % W) + 0.5, Math.floor(c / W) + 0.5]);
      }
      if (cells.length < 2) cells.push([(s % W) + 0.5, Math.floor(s / W) + 0.5]);
      path = [cells[0]];
      for (let a = 0; a < cells.length - 1; ) {
        let b = a + 1;
        for (let c = cells.length - 1; c > a + 1; c--) {
          if (this.hiddenLine(cells[a][0], cells[a][1], cells[c][0], cells[c][1], deep)) {
            b = c;
            break;
          }
        }
        path.push(cells[b]);
        a = b;
      }
    } else {
      if (!here) return false;
      // el seguro: sin camino escondido, se hunde en el barro y sale en la salida
      const o = passes[0][1][0];
      const at = new THREE.Vector3(z.pos.x, by + 0.3, z.pos.z);
      g.fx.dust(at, { x: 0, y: 1, z: 0 }, [0.2, 0.22, 0.14], 24);
      if (g.world.waterDepth?.(at.x, at.z) > 0.1) g.water?.splash?.(at.x, at.z, 1.4);
      path = [[z.pos.x, z.pos.z], [o.x + 0.5, o.z + 0.5]];
      z.pos.x = o.x + 0.5;
      z.pos.z = o.z + 0.5;
    }
    z.lurkPath = path;
    z.lurkI = here ? 1 : 0;
    // (escondido a lo menos esto, contando desde que se mete: case 'lurk')
    z.lurkMin = 5 + Math.random() * 2.5;
    z.lurkGrowl = false;
    this.setState(z, here ? 'lurk' : 'lurkIn');
    return true;
  }

  // Desde qué altura frenan las paredes al jefe: desde el piso, pero en el agua
  // del estero desde la superficie, como el que nada. Así sale del agua
  // trepando por donde se sale nadando (el borde de una pasarela o un muelle:
  // el campo de flujo lo manda por ahí); antes el borde de las tablas lo trababa.
  bossFeet(z) {
    const by = z.baseY || 0;
    if (!hasWater()) return by + 0.1;
    // (el nivel de donde está parado, no el de la celda a la que entra: la
    // tabla ya no tiene agua y lo volvía a frenar desde el fondo; un poco
    // arriba de la superficie, que con el oleaje queda al ras del escalón)
    const lvl = this.g.world.water?.level ?? WATER_Y;
    return by < lvl - 0.05 ? Math.max(by + 0.1, lvl + 0.15) : by + 0.1;
  }

  // El jefe pisa el piso de donde está; en la torre no se cae por el agujero
  // (se frena en el borde).
  bossGround(z, bx, bz) {
    const g = this.g;
    if (!g.world.levels) return;
    const by = z.baseY || 0;
    const nf = g.world.floorAt(z.pos.x, z.pos.z, by);
    if (g.world.tower && nf < by - 1) {
      z.pos.x = bx;
      z.pos.z = bz;
      return;
    }
    z.pos.y = z.baseY = nf;
  }

  moveBoss(z, mx, mz, speed, dt, t) {
    const g = this.g;
    // trabado contra algo: de costado un rato (ver unstick)
    if (z.sideT > 0) {
      z.sideT -= dt;
      const c = Math.cos(z.side * 1.15);
      const sn = Math.sin(z.side * 1.15);
      const rx = mx * c - mz * sn;
      mz = mx * sn + mz * c;
      mx = rx;
    }
    if (z.navT > 0) z.navT -= dt;
    this.turn(z, Math.atan2(mx, mz), z.kind === 'luison' ? 4 : 3.3, dt);
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const align = Math.max(0.2, fx * mx + fz * mz);
    const bx = z.pos.x;
    const bz = z.pos.z;
    z.pos.x += fx * speed * align * dt;
    z.pos.z += fz * speed * align * dt;
    g.world.collide(z.pos, 0.45, this.bossFeet(z), (z.baseY || 0) + 2.4, this.bossColl(z, z.skipCorn));
    this.unstick(z, bx, bz, speed * align * dt, mx, mz, dt, 0.45);
    this.bossGround(z, bx, bz);
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
    if (z.boss && z.kind === 'luison') return luisonGait(z, dt, speed, t);
    // los zombies de verdad tienen cada uno su andar; los jefes y los cuerpos
    // de los compañeros siguen con este
    if (z.style && !z.boss && !z.dog) {
      soak(this.g, z, t);
      const half = Math.floor(z.phase / Math.PI);
      gaitPose(z, dt, speed, t);
      // brazadas: un anillo en el agua por cada una, y cada tanto un chapoteo
      // chico (sin sonido: serían muchos), solo si hay quien lo vea
      if (z.swimK > 0.5 && half !== Math.floor(z.phase / Math.PI) && this.g.water) {
        const cam = this.g.camera.position;
        const hx = z.pos.x + Math.sin(z.yaw) * 0.8;
        const hz = z.pos.z + Math.cos(z.yaw) * 0.8;
        if (Math.abs(cam.x - z.pos.x) + Math.abs(cam.z - z.pos.z) < 25) {
          this.g.water.ripple?.(hx, hz, 0.5, 0.9);
          if (Math.random() < 0.25) this.g.water.splash?.(hx, hz, 0.12, { sound: false });
        }
      }
      return;
    }
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
      // no andan todos igual: algunos con un brazo colgando, otros encorvados
      // con los dos caídos que se bambolean (sale del id: igual en todas las compus)
      const style = ((z.id || z.slot) * 7) % 5;
      if (style === 3) {
        P.shRp = -0.25 - s * 0.25;
        P.shRr = -0.1;
        P.elR = -0.12;
      } else if (style === 4) {
        P.shLp = -0.22 + s * 0.3;
        P.shRp = -0.22 - s * 0.3;
        P.shLr = 0.1;
        P.shRr = -0.1;
        P.elL = -0.2;
        P.elR = -0.2;
        P.torsoP += 0.1;
        P.headP -= 0.12;
      }
      // la pierna mala: al pisarla el cuerpo se hunde y se tuerce; la cabeza cabecea
      const bad = limp * Math.max(0, -s);
      P.hipY -= bad * 0.05;
      P.torsoR += bad * 0.14;
      P.headP += Math.abs(c) * 0.04;
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
    // los jefes no andan como zombies: erguidos, braceando y con el arma lista
    if (z.boss) this.bossGait(z, s, type !== 'walk');
  }

  bossGait(z, s, run) {
    const P = z.P;
    // el Gil, grandote y de poncho, va más derecho (si no parece que se cae)
    P.torsoP = z.kind === 'mandinga' ? 0.24 : z.kind === 'francisco' ? 0.04 : z.kind === 'gil' ? (run ? 0.1 : 0.06) : run ? 0.18 : 0.1;
    P.torsoY = s * 0.1;
    P.torsoR = s * 0.04;
    P.headP = z.kind === 'mandinga' ? -0.22 : -0.06;
    P.headY = 0;
    P.headR = 0;
    P.shLp = -s * (run ? 0.75 : 0.45);
    P.shLr = 0.12;
    P.elL = -0.25 - Math.max(0, s) * (run ? 0.9 : 0.45);
    P.shRp = -0.45 - s * 0.2;
    P.shRr = -0.18;
    P.elR = -0.75;
    // el espantapájaros: los brazos abiertos en cruz, como en el palo, y la cabeza caída
    if (z.kind === 'scarecrow') {
      P.shLp = -0.1 - s * 0.2;
      P.shLr = 1.25 + s * 0.12;
      P.elL = -0.1;
      P.headR = 0.35 + s * 0.08;
      P.torsoR = s * 0.1;
    }
  }

  poseIdle(z, t) {
    if (z.boss && z.kind === 'luison') return luisonIdle(z, t);
    if (z.style && !z.boss && !z.dog) {
      soak(this.g, z, t);
      return idlePose(z, t);
    }
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
    // el jefe quieto: respira, el arma lista y el otro brazo suelto
    if (z.boss) {
      this.bossGait(z, 0, false);
      P.torsoP += s * 0.02;
      P.shLp = 0.05 + s * 0.04;
    }
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
    if (z.style && !z.boss && !z.dog) {
      soak(this.g, z, t);
      return attackPose(z, t);
    }
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
    // el que se arrastra, en lo hondo nada a brazadas (sin piernas no se ven)
    if (z.style && !z.boss && !z.dog) {
      soak(this.g, z, this.g.time);
      if (z.swimK > 0.5) {
        gaitPose(z, dt, 0.75, this.g.time);
        return;
      }
    }
    const P = z.P;
    z.phase += dt * 3;
    const s = Math.sin(z.phase);
    P.rootPitch = 1.35;
    P.rootY = 0.05;
    // (el que venía de costado se arrastra derecho; el que salió nadando, sin correr la raíz)
    P.yawOff = 0;
    P.rootFwd = 0;
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
    if (z.boss && z.kind === 'luison') return luisonDazed(z);
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
    if (z.boss && z.kind === 'luison') return luisonRoar(z, t);
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
    if (z.boss && z.kind === 'luison') return luisonSlam(z, k);
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

  // Derretido (la Liquidificador), en el anfitrión y en los invitados: se agarra
  // la cara temblando, se le aflojan las rodillas y se escurre en el charco
  // (P.melt aplasta el cuerpo en skeleton.js) mientras chorrea barro; al final
  // queda debajo del piso. Los huesos que saltan los tira la Liquidificador.
  meltStep(z) {
    const g = this.g;
    const P = z.P;
    const k = Math.min(1, z.stateT / MELT_T);
    const f = z.meltFrom || (z.meltFrom = { ...P });
    const grab = sm01(k / 0.22);
    const kneel = sm01((k - 0.18) / 0.42);
    const ooze = sm01((k - 0.3) / 0.62);
    const jit = (1 - ooze) * (0.06 + grab * 0.1);
    const j = () => (Math.random() - 0.5) * jit;
    const T = {
      rootPitch: z.crawler ? f.rootPitch : 0.3 * kneel,
      rootRoll: 0,
      hipY: z.crawler ? f.hipY : 0.92 - 0.38 * kneel,
      hipLp: z.crawler ? f.hipLp : -1.1 * kneel,
      hipRp: z.crawler ? f.hipRp : -0.9 * kneel,
      hipLr: 0.15 * kneel,
      hipRr: -0.15 * kneel,
      knL: z.crawler ? f.knL : 1.9 * kneel,
      knR: z.crawler ? f.knR : 1.75 * kneel,
      torsoP: -0.18 * grab * (1 - kneel) + 0.75 * kneel + j(),
      torsoR: j(),
      headP: -0.55 * grab * (1 - kneel) + 0.5 * kneel + j(),
      headR: j() * 2,
      // las manos a la cara; después los brazos se caen y se desparraman
      shLp: -1.55 * grab * (1 - ooze) - 0.5 * ooze + j(),
      shRp: -1.5 * grab * (1 - ooze) - 0.6 * ooze + j(),
      shLr: -0.18 * grab * (1 - ooze) + 1.1 * ooze,
      shRr: 0.18 * grab * (1 - ooze) - 1.1 * ooze,
      elL: -2.3 * grab * (1 - ooze) - 0.2 * ooze,
      elR: -2.2 * grab * (1 - ooze) - 0.25 * ooze,
    };
    const e = sm01(z.stateT / 0.16);
    for (const key in T) P[key] = (f[key] ?? T[key]) + (T[key] - (f[key] ?? T[key])) * e;
    // (más aplastado, la luz de las caras se ve rara: el resto lo hace hundirse)
    P.melt = ooze * 0.72;
    // se hunde en su charco de a poco, hasta quedar abajo del piso
    P.rootY = (z.crawler ? f.rootY || 0 : 0) - sm01((k - 0.4) / 0.6) * 0.8 * (z.scale || 1);
    // el color: de su ropa al barro verdinegro
    const c = sm01(k / 0.4);
    for (const M of this.meshes) {
      if (!M.color) continue;
      tmpC.set(z.colors[M.color]).lerp(MELT_COL, c);
      for (let q = 0; q < M.parts.length; q++) M.im.setColorAt(z.slot * M.parts.length + q, tmpC);
      M.im.instanceColor.needsUpdate = true;
    }
    // chorrea: gotas de barro de las manos, la cara y el pecho, y vapor
    if (k < 0.9 && Math.random() < 0.7) {
      const part = [1, 2, 5, 6, 3, 4, 7, 8][Math.floor(Math.random() * 8)];
      tmpV.setFromMatrixPosition(z.mats[part]);
      g.fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4, { color: [0.13, 0.17, 0.08], size: 0.05 + Math.random() * 0.04, size1: 0.02, life: 0.55, alpha: 0.85, gravity: 9 });
      if (Math.random() < 0.3) g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, { color: [0.4, 0.9, 0.55], size: 0.04, size1: 0.01, life: 0.4, gravity: 3 });
    }
    if (Math.random() < 0.25) g.fx.steam(tmpV.set(z.pos.x, (z.baseY || 0) + 0.3 + (1 - ooze) * 1.1, z.pos.z), 1, 0.5);
    // el chasquido cuando se le van las piernas
    if (!z.meltSq && k > 0.4) {
      z.meltSq = true;
      g.audio.squish?.(tmpV.set(z.pos.x, (z.baseY || 0) + 0.6, z.pos.z));
    }
  }

  // ---------------- render ----------------
  // La pose que se dibuja: al cambiar de estado (de correr a pegar, de pegar a
  // correr, de quieto a caminar) pasa de una a la otra en un ratito en vez de
  // saltar; y el cuerpo de costado del cangrejo gira de a poco.
  drawnPose(z, dt) {
    const P = z.P;
    if (!z.style || z.boss) return P;
    if (z.state !== z.pState) {
      z.pState = z.state;
      // lo que solo tocan las poses nuevas no queda pegado en las viejas (trepar, romper tablas)
      if (!z.dead) {
        P.hipLr = P.hipRr = P.headY = P.torsoY = P.yawOff = 0;
        P.shLr = 0.1;
        P.shRr = -0.1;
      }
      z.blendK = z.Pr && BLEND_TO.has(z.state) ? 0 : 1;
      if (z.blendK < 1) z.Pf = { ...z.Pr };
    }
    const R = z.Pr || (z.Pr = { ...P, yawOff: P.yawOff || 0 });
    const yo = R.yawOff;
    if (z.blendK < 1) {
      z.blendK = Math.min(1, z.blendK + dt / 0.2);
      const e = z.blendK * z.blendK * (3 - 2 * z.blendK);
      const F = z.Pf;
      for (const k in P) {
        const f = F[k] ?? P[k] ?? 0;
        R[k] = f + ((P[k] ?? 0) - f) * e;
      }
    } else {
      for (const k in P) R[k] = P[k];
    }
    R.yawOff = yo + ((P.yawOff || 0) - yo) * Math.min(1, dt * 7);
    return R;
  }

  render(dt = 1 / 60) {
    const blobM = new THREE.Matrix4();
    for (const z of this.pool) {
      if (!z.active) continue;
      if (!z.static) {
        const R = this.drawnPose(z, dt);
        // el espasmo se suma solo para este cuadro
        const tw = z.dead ? 0 : z.twitch || 0;
        R.headY += tw * 0.8;
        R.headR += tw * 0.5;
        const by = z.baseY || 0;
        R.rootY += by;
        // (nadando, el cuerpo acostado gira en la cadera: la raíz va un poco atrás)
        const yw = z.yaw + (R.yawOff || 0);
        const fw = R.rootFwd || 0;
        solvePose(z.mats, z.pos.x + Math.sin(yw) * fw, z.pos.z + Math.cos(yw) * fw, yw, z.scale, R);
        R.rootY -= by;
        R.headY -= tw * 0.8;
        R.headR -= tw * 0.5;
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
    this.horseRig?.update(this.pool);
    this.yacRig?.update(this.pool);
    this.telegraph();
    const b = this.boss;
    if (b) {
      // una escena que lo tiene agarrado le pone su pose encima de la de
      // siempre (world/gilHeld.js: el Gil en manos de las almas)
      if (this.bossPose) this.bossPose(b, b.P, dt);
      // el Luisón en el pajonal va agazapado (las cañas lo tapan: se ve moverse
      // el pasto); por dónde está, anfitrión e invitado
      let P = b.P;
      if (b.kind === 'luison') {
        // (en el monte no se ve, pero sigue agachado: sale de ahí ya agazapado;
        // escondido, cruzando una senda lejos del jugador, no se para)
        const cell = this.cellKind(b.pos.x, b.pos.z);
        const low = !b.dead && (b.state === 'lurk' || (LOW_STATES.has(b.state) && (cell === 1 || cell === 2))) ? 1 : 0;
        b.lowK = (b.lowK || 0) + (low - (b.lowK || 0)) * Math.min(1, dt * 9);
        // (sobre una copia: la pose de verdad la vuelve a armar cada cuadro quien la mueve)
        if (b.lowK > 0.002) {
          P = Object.assign(lowPose, b.P);
          luisonLow(b, P, b.lowK, this.g.time);
        }
      }
      const by = (b.baseY || 0) - (b.lowK || 0) * LURK_LOW;
      P.rootY += by;
      solvePose(b.mats, b.pos.x, b.pos.z, b.yaw, b.scale, P);
      P.rootY -= by;
      solveExtras(b.mats);
      const parts = this.bossRig.parts;
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i];
        if (!m) continue;
        m.matrix.copy(b.mats[i]);
        m.matrixWorldNeedsUpdate = true;
      }
      this.bossRig.hat.visible = b.hatHp > 0 || !!b.hatFixed;
      // el Luisón metido en el monte (afuera del mapa, por el pajonal): no se ve
      // (anfitrión e invitado, por dónde está: Zombies 'lurk')
      if (b.kind === 'luison') {
        const monte = !b.dead && this.cellKind(b.pos.x, b.pos.z) === 2;
        if (monte !== !!b.monte) {
          b.monte = monte;
          this.bossRig.rig.visible = !monte;
        }
      }
      this.bossRig.tick(b, this.g.time);
      blobM.makeScale(1.5, 1, 1.5).setPosition(b.pos.x, (b.baseY || 0) + 0.015, b.pos.z);
      // (sin el cuerpo a la vista, tampoco la sombra: las cinemáticas lo esconden)
      this.blobs.setMatrixAt(MAX, b.dead || !this.bossRig.rig.visible ? ZERO : blobM);
    }
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  // ---------------- impactos y daño ----------------
  // Todos los zombies que cruza el rayo, ordenados por distancia.
  raycast(o, d, maxT) {
    const hits = this.hits;
    hits.length = 0;
    const test = (z) => {
      if (!z.active || z.dead || z.monte) return;
      if (z.dog) {
        if (z.state === 'dogspawn') return;
        const h = (z.yac && this.yacRig ? YacareRig : z.horse && this.horseRig ? HorseRig : this.dogRig.constructor).raycast(z, o, d, maxT);
        if (h) hits.push({ z, t: h.t, zone: h.zone });
        return;
      }
      // (nadando, pos.y es el fondo y el cuerpo flota acostado arriba: la esfera va en el torso dibujado)
      const sw = z.swimK > 0.5 ? z.mats[1].elements : null;
      if (sw) tmpV.set(sw[12] - o.x, sw[13] - o.y, sw[14] - o.z);
      else tmpV.set(z.pos.x - o.x, z.pos.y + 1 * z.scale - o.y, z.pos.z - o.z);
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
    const cr = this.g.crow?.hitTest(o, d, maxT);
    if (cr) hits.push(cr);
    // los Yasy del matorral de La Tapera (entities/Yasy.js)
    this.g.yasy?.hitTest(o, d, maxT, hits);
    // la estaca de Gil
    const st = this.moves.hitTest(o, d, maxT);
    if (st) hits.push(st);
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  // Zombies vivos dentro de un radio (explosiones, cuchillo, conos).
  inRadius(p, r, out = []) {
    out.length = 0;
    const r2 = r * r;
    const check = (z) => {
      if (!z.active || z.dead || z.monte) return;
      const dx = z.pos.x - p.x;
      const dz = z.pos.z - p.z;
      const dy = (z.swimK > 0.5 && z.mats ? z.mats[1].elements[13] : z.pos.y + 1) - p.y;
      const d2 = dx * dx + dz * dz + dy * dy * 0.3;
      if (d2 <= r2) out.push({ z, d: Math.sqrt(d2) });
    };
    for (const z of this.pool) check(z);
    if (this.boss) check(this.boss);
    if (this.g.pombero && this.g.pombero.state !== 'appear') check(this.g.pombero.z);
    if (this.g.crow?.z.active) check(this.g.crow.z);
    this.g.yasy?.inRadius(check);
    return out;
  }

  // (anfitrión) El Juicio del Mate Supremo: el jefe (o el Pombero, o el
  // Cuervo) se muere ya, sin escudo, tope ni fase que valga. Muere por el
  // camino de siempre (kill), así el easter egg sigue como si lo hubieran
  // bajado a tiros. (En el traslado a la Cárcel de las Almas espera a que
  // lleguen: muerto a mitad de camino, la escena quedaba a medias.)
  annihilate(z, info = {}) {
    const g = this.g;
    if (!z?.active || z.dead) return false;
    const how = { ...info, type: 'explosive', zone: 'torso' };
    if (z.pombero) {
      z.hp = 0;
      g.pombero.kill(how);
      return true;
    }
    if (z.yasy) return g.yasy.damage(z, 1e9, { ...how, type: 'knife' });
    if (z.crow) {
      z.hp = 0;
      g.crow.kill(how);
      return true;
    }
    if (z.mandinga && g.arena?.stage === 'shift') {
      g.later(0.6, () => this.annihilate(z, info));
      return true;
    }
    z.hp = 0;
    this.kill(z, how);
    return true;
  }

  // info: { zone, type, dir, point, weapon, noPoints }
  damage(z, amount, info = {}) {
    if (!z.active || z.dead) return false;
    const g = this.g;
    // la estaca de Gil (entities/bossMoves.js)
    if (z.stake) return this.moves.hitStake(z, amount, info);
    // el Juicio del Mate Supremo (weapons/Supremo.js): cualquier jefe cae al
    // toque, con escudo, bajo tierra o en la fase que sea (lo decide el anfitrión)
    if (info.type === 'juicio') {
      if (!g.net?.guest) return this.annihilate(z, info);
      g.net.reportHit(z, amount, info);
      return true;
    }
    // el Espantapájaros bajo tierra
    if (z.boss && this.moves.immune(z)) return false;
    // de invitado, el daño lo aplica el anfitrión: acá solo se ve la sangre
    if (g.net?.guest) {
      if (info.point && !['freeze', 'chain', 'blast', 'luz'].includes(info.type)) {
        g.fx.blood(info.point, info.dir ? tmpV2.copy(info.dir).multiplyScalar(0.6) : { x: 0, y: 0.5, z: 0 }, info.zone === 'head' ? 14 : 8);
      }
      g.net.reportHit(z, amount, info);
      return true;
    }
    // los potenciadores especiales pegan menos a los jefes (info.pup: su
    // bossMult; al Luisón, todavía menos)
    const pupK = info.pup ? info.pup * (z.kind === 'luison' ? PUP_LUISON : 1) : 1;
    if (z.pombero) return g.pombero.damage(amount * pupK, info);
    if (z.crow) return g.crow.damage(amount * pupK, info);
    if (z.yasy) return g.yasy.damage(z, amount, info);
    // el penal: un frasco de ácido en el Alcaide le derrite el llavero
    if (z.boss && info.type === 'acid') g.ee.onBossAcid?.(z);
    // el Mandinga envuelto en fuego no recibe daño hasta que caigan los peones
    if (z.mandinga && g.arena?.ward) {
      if (info.point && Math.random() < 0.5) g.fx.sparks(info.point, 0.6, { x: 0, y: 1, z: 0 }, [1, 0.5, 0.15]);
      return false;
    }
    this.lastPoints = 0;
    let dmg = amount;
    const type = info.type || 'bullet';
    if (z.boss) {
      if (['chain', 'freeze', 'blast', 'nuke', 'scald', 'melt'].includes(type)) dmg = type === 'nuke' ? 0 : type === 'scald' || type === 'melt' ? 320 : 2500;
      dmg *= pupK;
      if (info.zone === 'hat') {
        z.hatHp -= dmg;
        if (!info.noPoints) g.addPoints(POINTS.hit);
        if (z.hatHp <= 0) {
          if (!z.hatDropped) {
            z.hatDropped = true;
            this.bossRig.dropHat();
          }
          const hp = tmpV.setFromMatrixPosition(z.mats[13]);
          g.fx.sparks(hp, 2, { x: 0, y: 1, z: 0 });
          g.audio.chain(hp);
          g.hud.subtitle('¡Le volaste el sombrero!', 2);
        }
        return true;
      }
      if (info.zone === 'head') dmg *= 1.5;
      // el Caballero Negro: la rodela lo cubre de frente (salvo atontado o con explosiones)
      if (z.kind === 'caballero' && z.state !== 'stunned' && info.dir && !['explosive', 'burn', 'nuke'].includes(type)) {
        if (info.dir.x * Math.sin(z.yaw) + info.dir.z * Math.cos(z.yaw) < -0.35) {
          dmg *= 0.3;
          if (info.point && Math.random() < 0.5) g.fx.sparks(info.point, 0.5, { x: -info.dir.x, y: 0.4, z: -info.dir.z }, [1, 0.8, 0.5]);
        }
      }
      // el Mandinga no se deja voltear de un par de tiros de oro
      // (info.cap: la medialuna de la hoz de oro le pega más: entities/Yasy.js hozBaston)
      if (z.mandinga) dmg = Math.min(dmg, info.cap || (info.zone === 'head' ? 1300 : 900));
      // atontado contra la pared: es el momento de darle
      // (en las arenas, x1,5: stunK)
      if (z.state === 'stunned') dmg *= z.stunK || 2;
      // en co-op, lo que pega cada uno decide a quién va después
      this.moves.onHit(z, dmg, info);
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
          g.fx.blood(tmpV.set(z.pos.x, (z.baseY || 0) + 0.5, z.pos.z), { x: 0, y: 1, z: 0 }, 20, 1.5);
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
      if (!z.boss && Math.random() < 0.12 && type !== 'burn') g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.5, z.pos.z), 'idle');
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
      const at = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.2 * z.scale, z.pos.z);
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
      g.net.creditKill(info.by, type, info.zone, z);
    } else {
      g.stats.kills++;
      if (info.zone === 'head' && ['bullet', 'knife'].includes(type)) g.stats.headshots++;
      if (type === 'knife') g.stats.knifeKills++;
      // la experiencia (ui/Levels: vale menos en las rondas con más zombies)
      g.levels?.kill(z, type, info.zone);
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
    const decap = !z.boss && (type === 'knife' || type === 'scythe') && (info.decap || Math.random() < 0.3);
    if (z.dog) {
      // aullido corto, sangre y cae de costado; después se hace brasas
      z.state = 'dead';
      z.stateT = 0;
      z.burst = false;
      if (this.rigOf(z).voice) this.rigOf(z).voice(z, 'die');
      else if (this.isHorse(z)) g.audio.neigh(tmpV.set(z.pos.x, (z.baseY || 0) + 1.5, z.pos.z), 1.3);
      else g.audio.yelp(tmpV.set(z.pos.x, (z.baseY || 0) + 0.6, z.pos.z));
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
      g.fx.electric(tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z), 10);
    } else if (onFire && !z.crawler && ['chase', 'attack', 'dead'].includes(z.state)) {
      z.state = 'burnrun';
      z.stateT = 0;
      z.runT = 1.8 + Math.random() * 1.4;
      z.runYaw = z.yaw + (Math.random() - 0.5) * 2;
      this.paint(z, 0x2a1a10);
      g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 1.6, z.pos.z), 'scream');
    } else if (type === 'melt' && !z.boss) {
      // derretido (la Liquidificador): se escurre parado en su charco (meltStep)
      z.state = 'melting';
      z.stateT = 0;
      z.window = -1;
      z.meltFrom = null;
      z.meltSq = false;
      g.fx.steam(tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z), 10, 0.6);
    } else if (type === 'scald' || type === 'melt') {
      // hervido: queda colorado, suelta vapor y se desploma
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      z.steamT = 4;
      this.paint(z, type === 'melt' ? 0x4e5a34 : 0xc0503a);
      if (type === 'melt') z.corpseT = 8.3;
      g.fx.steam(tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z), 10, 0.6);
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
    } else if (type === 'gut' && !z.boss) {
      // el puñado de bombillas lo levanta y lo tira para atrás, a veces sin un brazo
      z.state = 'flung';
      z.stateT = 0;
      z.window = -1;
      const d = info.dir || new THREE.Vector3(0, 0, 1);
      const k = 6 + Math.random() * 4;
      z.vel.set(d.x * k, 3 + Math.random() * 2.5, d.z * k);
      z.pos.y = (z.baseY || 0) + 0.1;
      if (Math.random() < 0.45) z.hidden |= 1 << (5 + Math.floor(Math.random() * 2));
      if (info.point) g.fx.blood(info.point, d, 22, 1.3);
    } else if (type === 'acid' && !z.boss) {
      // el ácido lo deja verde y humeando
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      z.steamT = 3;
      this.paint(z, 0x4a6a2a);
      g.fx.steam(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 8, 0.5);
    } else if (type === 'yerba' || type === 'luz') {
      // (luz: el Mate Supremo lo deshace; sus chispas las pone weapons/Supremo.js)
      if (type === 'yerba') g.fx.yerbaPuff(z.pos);
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
        g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.8, z.pos.z), 0.5, 8);
      }
    }
    // (el derretido deja su charco de barro, no sangre)
    if (type !== 'melt' && type !== 'luz') g.fx.decal(1, { x: z.pos.x + (Math.random() - 0.5) * 0.6, y: (z.baseY || 0) + 0.02, z: z.pos.z + (Math.random() - 0.5) * 0.6 }, { x: 0, y: 1, z: 0 }, 0.8 + Math.random() * 0.6);
    if (type !== 'freeze' && type !== 'yerba' && type !== 'luz') g.audio.growl(neck.clone(), 'death');
    // el easter egg se entera de cualquier jefe que cae (el Sargento suelta la llave del Coronel)
    // (lo que suelta queda donde se llega caminando: no afuera del mapa ni del
    // otro lado de una baranda; entities/reach.js)
    const spot = reachableSpot(g, z.pos) || z.pos;
    if (z.boss) g.ee.onBossDeath?.(spot.clone(), z);
    if (z.mandinga) {
      g.audio.growl(tmpV.set(z.pos.x, (z.baseY || 0) + 3, z.pos.z), 'boss');
      g.arena?.onBossDead();
    } else if (z.boss) {
      g.powerups.drop(spot, true);
      g.ee.dropHat(spot, z, info);
      // (el último aullido, más grave)
      if (z.kind === 'luison') g.audio.luisonHowl?.(tmpV.set(z.pos.x, (z.baseY || 0) + 2, z.pos.z), { rate: 0.85 });
      g.audio.sting();
    } else if (type !== 'nuke' && !z.dog) g.powerups.onKill(spot);
    g.rounds.onKill(z);
    g.ee.onKill(z, info);
    if (!z.boss && type !== 'nuke') g.activities?.onKill(z, info);
    // el Maizaster: a veces el muerto deja una mata de pasto alto (entities/maizaster.js)
    if (!z.boss && type !== 'nuke') g.fx.maiz?.onKill(z, info, spot);
    return true;
  }

  // Kaboom: mata a todos (menos al Capataz) sin dar puntos por cada uno,
  // también a los que están saliendo, y por 3 s no sale nadie más
  // (Rounds.holdSpawns: así ninguno aparece mientras van cayendo).
  nuke() {
    const list = this.pool.filter((z) => z.active && !z.dead);
    // (con muchos, caen igual en poco más de un segundo)
    const step = Math.min(0.06, 1 / Math.max(1, list.length));
    this.g.rounds?.holdSpawns(3);
    list.forEach((z, i) => {
      const id = z.id;
      this.g.later(0.15 + i * step + Math.random() * 0.2, () => {
        // (si ya cayó y el lugar lo tomó otro, a ese no)
        if (!z.active || z.dead || z.id !== id) return;
        this.paint(z, 0x2a1a10);
        this.g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 0.5, 6);
        this.kill(z, { type: 'nuke' });
      });
    });
  }

  setEyeColor(hex) {
    this.eyeMat.color.set(hex).multiplyScalar(3);
  }
}
