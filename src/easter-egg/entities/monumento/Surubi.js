import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EE } from '../../config/map';
import { assetUrl } from '../../../lib/assets';
import { skinLook } from '../bossSkin';
import { walkLine } from '../../world/Levels';
import SurubiOld from './surubiOld';

// El Surubí del Paraná: el minijefe del Monumento, una pelea chistosa y fácil
// a la "How to Fish" (el usuario, 2026-10-05). Un bagre pintado de 8,5 m,
// facetado (Meshy: public/assets/sotano/modelos/surubi/modelo.glb, de largo 1
// con la cabeza a +z y la panza en y = 0), con huesos armados acá: doce de la
// columna, la mandíbula y las dos aletas del pecho; encima, los ojos saltones
// con resorte, los bigotes de cuerda, la boca por dentro y la lengua.
//
// Sale solo en la pesca del Pack-a-Pava (emergeWithPava): el Monumento no
// tiene jefe de ronda (el usuario, 2026-10-05: MonumentoEgg.tuneRound; con
// globalThis.__mduMonuRoundBoss = true vuelve, cada 5 rondas desde la 6, con
// esta misma pelea, la vida de jefe de su ronda y su premio al caer).
// La pelea es la chistosa a la "How to Fish" (z.fish): la piensa este archivo
// (think) con los estados de siempre, así viajan solos al invitado; lo que hace
// falta además (adónde salta, el carril de la rodada, las bolas de agua, las
// mojarritas, la pava) va por 'pee' (k: 'srb'):
//  · intro: la salida. Burbujea el agua y gira una sombra enorme abajo (2 s),
//    sale saltando con una columna de agua, da una vuelta en el aire y cae de
//    panza en la orilla (ahí pega el golpe de la música de jefe), rebota dos
//    veces y ruge.
//  · chase: avanza a saltitos (como un pescado fuera del agua).
//  · chargeWind / charge / slam: el panzazo. Marca una sombra donde va a caer,
//    salta y cae; en la segunda fase, tres seguidos. Después queda panza
//    arriba, boqueando (stunned: recibe el doble).
//  · aim / shoot / reel: se infla como un pez globo (marca el carril) y viene
//    rebotando; si se la da contra una pared queda mareado; si no, se desinfla
//    a los chiflidos.
//  · whipWind / whip: escupe bolas de agua a círculos marcados.
//  · ram: el coletazo (antes enrosca la cola del lado del que tiene cerca).
//  · summon: eructa mojarritas que saltan en el piso; agarrarlas cura.
//  · enrage: el berrinche de la segunda fase.
//  · summon + burrow (al final, con un cuarto de vida): escupe la pava al
//    muelle y se tira de vuelta al río dando una vuelta en el aire.
// globalThis.__mduOldSurubi = true: el de antes (entities/monumento/surubiOld.js);
// __mduSurubiRoundOld = true: el jefe de ronda (si lo hay) como antes, de piezas.

const URL = '/assets/sotano/modelos/surubi/modelo.glb';
const L = 8.5;
const NB = 12;
const Z0 = 0.4;
const Z1 = -0.48;
const CY = 0.12;
const SEG = ((Z0 - Z1) / (NB - 1)) * L;
// la boca (del modelo: el labio a y 0,113 desde z 0,289) y los ojos
const MOUTH_Y = 0.113;
const HINGE = new THREE.Vector3(0, MOUTH_Y, 0.285);
const EYES = [new THREE.Vector3(-0.0836, 0.1681, 0.3449), new THREE.Vector3(0.0739, 0.1679, 0.3501)];
const EYE_R = 0.034;
const FIN_K = 3;
const FINS = [new THREE.Vector3(0.1, 0.06, 0.13), new THREE.Vector3(-0.1, 0.06, 0.13)];
// lo ancho del cuerpo a lo largo (v: 0 la cabeza .. 1 la cola), para los tiros
const RAD = (v) => (v < 0.6 ? 0.125 : 0.125 - ((v - 0.6) / 0.4) * 0.085) * L;
// los tiempos de la salida (s): burbujas, vuelo, rebotes y rugido
const BUB = 2.0;
const FLY = 1.5;
const LAND = BUB + FLY;
const INTRO_END = 6.0;
// la música de jefe de ronda: el golpe (medido en el mp3) cae con la llegada
const TRACK = 'jefe-generico-2';
const TRACK_BOOM = 3.84;
// la pelea (fácil): velocidades, daños y tiempos
const WALK = 2.2;
const WALK2 = 2.8;
const HOP_T = 0.62;
const PZ_WIND = 1.0;
const PZ_WIND2 = 0.6;
const PZ_FLY = 1.15;
const PZ_R = 3.4;
const PZ_DMG = 30;
const SLAM_T = 0.55;
const STUN_T = 4.0;
const DIZZY_T = 3.4;
const ROLL_WIND = 1.3;
const ROLL_SPEED = 8.5;
const ROLL_MAX = 3.0;
const ROLL_DMG = 20;
const REEL_T = 1.4;
const SPIT_WIND = 0.9;
const SPIT_T = 1.3;
const SPIT_FLY = 0.95;
const SPIT_R = 1.7;
const SPIT_DMG = 12;
const RAM_T = 1.6;
const RAM_DMG = 18;
const MOJ_T = 1.8;
const MOJ_LIFE = 16;
const MOJ_HEAL = 35;
const ENRAGE_T = 2.0;
// (la vida: más que la de un jefe de ronda, pero pega poco y avisa todo; con
// el mate de arranque se gana igual, más largo)
const HP_K = 2;
// (y un 75 % más: el usuario, 2026-10-05. Con más jugadores, como todos los
// jefes: Zombies.spawnBoss ya la multiplica por bossScale, uno más por
// jugador. Los umbrales van en proporción: el berrinche al 60 %, la pava al
// 25 %. __mduNoSurubiVida: la de antes)
const VIDA_K = 1.75;
const STUN_K = 1.5;
// (la pesca termina con un cuarto de vida; la segunda fase, al 60 %)
const PAVA_AT = 0.25;
const PHASE2 = 0.6;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpN = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const dirOut = new THREE.Vector3();
const isHost = (g) => !g.net || g.net.host;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// un resorte (x tiende a target, con rebote)
function spring(s, target, k, damp, dt) {
  const h = Math.min(dt, 1 / 30);
  s.v += ((target - s.x) * k - s.v * damp) * h;
  s.x += s.v * h;
  return s.x;
}
const sp = (x) => ({ x, v: 0 });
// el vuelo de un salto: de S a E con altura h (k 0..1)
function arc(S, E, h, k, out) {
  return out.set(S.x + (E.x - S.x) * k, S.y + (E.y - S.y) * k + 4 * h * k * (1 - k), S.z + (E.z - S.z) * k);
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];

export default class Surubi {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    this.root.name = 'surubi';
    this.root.visible = false;
    g.scene.add(this.root);
    // las posiciones y los giros de los huesos (sirven también sin el modelo: los tiros)
    this.P = Array.from({ length: NB }, () => new THREE.Vector3());
    this.Q = Array.from({ length: NB }, () => new THREE.Quaternion());
    this.S = Array.from({ length: NB }, () => new THREE.Vector3(1, 1, 1));
    this.M = Array.from({ length: NB }, () => new THREE.Matrix4());
    this.segYaw = new Float32Array(NB);
    this.pose = { arch: sp(0), squash: sp(1), puff: sp(0), mouth: sp(0), curl: sp(0), roll: sp(0), pitch: sp(0), lift: sp(0), air: sp(0), eye: sp(1) };
    this.spin = 0;
    this.wavePh = 0;
    this.hopPh = 0;
    this.finPh = 0;
    this.cur = null;
    this.lastState = '';
    this.stT = 0;
    this.prevT = 0;
    this.intro = null;
    this.fly = null;
    this.lane = null;
    this.spits = [];
    this.balls = [];
    this.mojs = [];
    this.mojN = 0;
    this.pavaCb = null;
    this.pend = {};
    this.buildFx();
    this.load();
  }

  // ---------------- el modelo ----------------
  load() {
    new GLTFLoader().load(
      assetUrl(URL),
      (gl) => {
        if (this.disposed) return;
        let src = null;
        gl.scene.traverse((o) => {
          if (o.isMesh && !src) src = o;
        });
        if (src) this.build(src);
      },
      undefined,
      (e) => console.warn('surubi: sin modelo', e?.message || e),
    );
  }

  build(src) {
    const geo = src.geometry.clone();
    geo.scale(L, L, L);
    const pos = geo.attributes.position;
    const n = pos.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    // huesos: 0..NB-1 columna, NB mandíbula, NB+1 / NB+2 aletas
    const JAW = NB;
    const FL = NB + 1;
    const FR = NB + 2;
    const mz = 0.289 * L;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const zz = pos.getZ(i);
      const s = clamp((Z0 * L - zz) / ((Z0 - Z1) * L), 0, 1) * (NB - 1);
      const a = Math.min(NB - 2, Math.floor(s));
      const f = s - a;
      let w0 = 1 - f;
      let w1 = f;
      let wj = 0;
      let wf = 0;
      let fb = 0;
      // la mandíbula: lo de abajo del labio, adelante de las agallas
      if (zz > mz - 0.04 * L && y < MOUTH_Y * L + 0.004 * L) wj = clamp((zz - (mz - 0.04 * L)) / (0.05 * L), 0, 1) * clamp((MOUTH_Y * L + 0.004 * L - y) / (0.016 * L), 0, 1);
      // las aletas del pecho: lo que sale de costado entre z 0,03 y 0,22
      if (zz > 0.03 * L && zz < 0.22 * L && Math.abs(x) > 0.105 * L && y < 0.12 * L) {
        wf = clamp((Math.abs(x) - 0.105 * L) / (0.025 * L), 0, 1);
        fb = x > 0 ? FL : FR;
      }
      const rest = 1 - wj - wf;
      w0 *= rest;
      w1 *= rest;
      si.set([a, a + 1, JAW, fb || JAW], i * 4);
      sw.set([w0, w1, wj, wf], i * 4);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const map = src.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, flatShading: true, emissive: 0x000000 });
    skinLook(mat, { key: 0.45, rim: 0.22 });
    this.mat = mat;
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const rootB = new THREE.Bone();
    const bones = [];
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.position.set(0, CY * L, (Z0 - (i / (NB - 1)) * (Z0 - Z1)) * L);
      rootB.add(b);
      bones.push(b);
    }
    const jaw = new THREE.Bone();
    jaw.position.copy(HINGE).multiplyScalar(L);
    rootB.add(jaw);
    bones.push(jaw);
    for (const f of FINS) {
      const b = new THREE.Bone();
      b.position.copy(f).multiplyScalar(L);
      rootB.add(b);
      bones.push(b);
    }
    mesh.add(rootB);
    rootB.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    for (const b of bones) b.matrixAutoUpdate = false;
    this.mesh = mesh;
    this.bones = bones;
    this.rest = bones.map((b) => b.position.clone());
    this.root.add(mesh);
    this.buildParts();
  }

  // los ojos saltones, la boca por dentro, la lengua y los bigotes
  buildParts() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35, flatShading: true });
    const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.25 });
    this.eyes = EYES.map((c, i) => {
      const o = new THREE.Group();
      o.matrixAutoUpdate = false;
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(EYE_R * L, 1), white);
      ball.castShadow = true;
      o.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * L * 0.46, 12, 8), black);
      o.add(pupil);
      // la cruz de muerto
      const X = new THREE.Group();
      for (const r of [0.75, -0.75]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(EYE_R * L * 1.15, EYE_R * L * 0.22, EYE_R * L * 0.22), black);
        bar.rotation.z = r;
        X.add(bar);
      }
      X.visible = false;
      o.add(X);
      this.root.add(o);
      return { o, ball, pupil, X, c, side: i ? 1 : -1, g: new THREE.Vector2(), gv: new THREE.Vector2() };
    });
    // la boca por dentro (oscura) y la lengua (rosa), se ven al abrirla
    const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5a0c14, roughness: 0.7 }));
    throat.scale.set(0.085 * L, 0.035 * L, 0.11 * L);
    throat.matrixAutoUpdate = false;
    this.root.add(throat);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0607a, roughness: 0.5, flatShading: true }));
    tongue.matrixAutoUpdate = false;
    this.root.add(tongue);
    this.throat = throat;
    this.tongue = tongue;
    // los bigotes: dos largos (de las comisuras) y cuatro cortos (del mentón)
    const bigote = new THREE.MeshStandardMaterial({ color: 0x4d6272, roughness: 0.55, flatShading: true });
    const BW = [
      { at: [0.072, 0.118, 0.47], dir: [0.7, 0.12, 0.7], len: 0.3, n: 8, r: 0.0042, jaw: false },
      { at: [-0.072, 0.118, 0.47], dir: [-0.7, 0.12, 0.7], len: 0.3, n: 8, r: 0.0042, jaw: false },
      { at: [0.03, 0.085, 0.475], dir: [0.3, -0.4, 0.85], len: 0.1, n: 4, r: 0.0026, jaw: true },
      { at: [-0.03, 0.085, 0.475], dir: [-0.3, -0.4, 0.85], len: 0.1, n: 4, r: 0.0026, jaw: true },
      { at: [0.055, 0.09, 0.45], dir: [0.6, -0.4, 0.6], len: 0.08, n: 4, r: 0.0024, jaw: true },
      { at: [-0.055, 0.09, 0.45], dir: [-0.6, -0.4, 0.6], len: 0.08, n: 4, r: 0.0024, jaw: true },
    ];
    const segs = BW.reduce((s, b) => s + b.n - 1, 0);
    this.whiskMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0), bigote, segs);
    this.whiskMesh.frustumCulled = false;
    this.whiskMesh.castShadow = true;
    this.whiskMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.whiskMesh);
    this.whisk = BW.map((b) => ({
      ...b,
      local: new THREE.Vector3(...b.at).multiplyScalar(L),
      ldir: new THREE.Vector3(...b.dir).normalize(),
      seg: (b.len * L) / (b.n - 1),
      p: Array.from({ length: b.n }, () => new THREE.Vector3()),
      o: Array.from({ length: b.n }, () => new THREE.Vector3()),
      init: false,
    }));
  }

  // ---------------- lo que se marca en el piso, el agua, las mojarritas ----------------
  buildFx() {
    const g = this.g;
    const decal = (color, opacity) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    // la sombra del panzazo: un círculo oscuro con borde colorado
    const shadow = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), decal(0x000000, 0.45));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), decal(0xff3a20, 0.8));
    shadow.add(disc, ring);
    shadow.visible = false;
    shadow.renderOrder = 3;
    g.scene.add(shadow);
    this.shadow = { grp: shadow, disc, ring };
    // la sombra enorme abajo del agua (la salida)
    const deep = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), decal(0x05090c, 0));
    deep.scale.set(1.3, 1, 4.2);
    deep.visible = false;
    g.scene.add(deep);
    this.deep = deep;
    // el carril de la rodada
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), decal(0xff5030, 0));
    lane.visible = false;
    g.scene.add(lane);
    this.laneM = lane;
    // los círculos de las bolas de agua y las bolas
    this.ringMat = decal(0x40a0ff, 0.75);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 36).rotateX(-Math.PI / 2);
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0x5aa8e0, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1, emissive: 0x103050 });
    this.ballGeo = new THREE.IcosahedronGeometry(0.42, 1);
    // las mojarritas: plateadas, chiquitas, con su cola
    const mg = new THREE.SphereGeometry(0.16, 8, 6).scale(0.45, 0.7, 1.4);
    const tail = new THREE.ConeGeometry(0.13, 0.18, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.26);
    this.mojGeo = [mg, tail];
    this.mojMat = new THREE.MeshStandardMaterial({ color: 0xc8d6e0, roughness: 0.25, metalness: 0.6, emissive: 0x1a2a3a, flatShading: true });
    // la pava que escupe (la del Pack-a-Pava)
    const al = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 });
    this.pavaM = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.7, 0.15], [0.68, 0.55], [0.45, 0.85], [0.18, 0.95], [0.2, 1.02]].map(([r, y]) => new THREE.Vector2(r * 0.55, y * 0.55)), 16), al);
    this.pavaM.visible = false;
    g.scene.add(this.pavaM);
    this.pavaFly = null;
    this.pavaMouth = this.pavaM.clone();
    this.pavaMouth.matrixAutoUpdate = false;
    this.pavaMouth.visible = false;
    this.root.add(this.pavaMouth);
    this.hasPava = false;
  }

  // ---------------- el jefe ----------------
  get boss() {
    const b = this.g.zombies?.boss;
    return b && b.kind === 'surubi' ? b : null;
  }

  // Lo manda el anfitrión (y lo hace él mismo).
  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'srb', ...m });
  }

  apply(m) {
    const g = this.g;
    switch (m.a) {
      case 'in':
        this.mode = m.f ? 'fish' : 'old';
        this.modeT = g.time;
        if (m.f) {
          this.intro = { W: v3(m.W), E: v3(m.E), drain: !!m.d, t: g.time };
          this.startMusic();
        } else {
          this.intro = null;
          this.roundEmerge(v3(m.E));
        }
        break;
      case 'jump':
        this.fly = { S: v3(m.S), E: v3(m.E), h: m.h, dur: m.dur };
        this.shadowAt = v3(m.E);
        break;
      case 'lane':
        this.lane = { S: v3(m.S), d: new THREE.Vector2(m.d[0], m.d[1]), len: m.len };
        break;
      case 'spit':
        this.spits = m.pts.map((p) => v3(p));
        this.spitRings();
        break;
      case 'moj':
        for (const [id, x, y, z] of m.l) this.addMoj(id, new THREE.Vector3(x, y, z));
        break;
      case 'eat':
        this.removeMoj(m.id);
        break;
      case 'dive':
        this.dive = { S: v3(m.S), W: v3(m.W), t: g.time };
        break;
      case 'hasPava':
        this.hasPava = true;
        break;
      case 'pava':
        this.pavaFly = { S: v3(m.S), E: v3(m.E), t: 0 };
        this.hasPava = false;
        break;
      default:
    }
  }

  // Del invitado: agarró una mojarrita.
  onGuest(m) {
    if (m.a === 'eat') this.send({ a: 'eat', id: m.id });
  }

  // ---------------- de dónde sale ----------------
  // (el jefe de ronda, de donde salía siempre) El agua más cercana al jugador
  // con camino abierto: la orilla de la Costanera, el estanque del Pasaje o el
  // espejo del sur.
  spotNear(p) {
    const g = this.g;
    const cands = [];
    if (g.activeZones.has('H')) for (let z = 8; z <= 52; z += 4) cands.push([112.3, z, 'rio']);
    if (g.activeZones.has('E')) {
      for (let x = 7; x <= 17; x += 3) cands.push([x, 27.3, 'pozo']);
      for (let x = 7; x <= 17; x += 4) cands.push([x, 36.5, 'espejo']);
    }
    let best = null;
    let bd = Infinity;
    for (const [x, z, k] of cands) {
      const d = g.nav.distAt(x, z);
      if (!Number.isFinite(d)) continue;
      const s = Math.abs(d - 14);
      if (s < bd) {
        bd = s;
        best = [x, z, k];
      }
    }
    if (!best) return null;
    return { at: new THREE.Vector3(best[0], g.world.floorAt(best[0], best[1]), best[1]), kind: best[2] };
  }

  // Dónde está el agua de donde sale (o adónde se tira): la más honda cerca.
  waterNear(E, rmin = 4, rmax = 10) {
    const g = this.g;
    const W = g.water;
    let best = null;
    let bs = Infinity;
    if (W?.depthAt) {
      for (let r = rmin; r <= rmax; r += 1.5) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const x = E.x + Math.cos(a) * r;
          const z = E.z + Math.sin(a) * r;
          const d = W.depthAt(x, z);
          if (d < 0.6) continue;
          const s = Math.abs(r - 7) - d * 0.5;
          if (s < bs) {
            bs = s;
            best = new THREE.Vector3(x, W.heightAt ? W.heightAt(x, z) : -5.2, z);
          }
        }
      }
    }
    // el Pasaje: los espejos (el del norte, si no lo vaciaron)
    if (!best && Math.abs(E.y - 3.6) < 0.6 && E.x < 21) {
      const drained = this.g.ee?.sable?.st?.drained;
      best = new THREE.Vector3(clamp(E.x, 6, 19), 3.0, drained ? 36.5 : 21);
    }
    return best;
  }

  // Al aparecer (Zombies.spawnBoss, en el anfitrión): la salida épica.
  emergeFx(z) {
    const g = this.g;
    if (!isHost(g)) return;
    const fishing = this.fishing;
    this.fishing = false;
    // el jefe de ronda de antes (__mduSurubiRoundOld): sale y pelea como siempre
    if (!fishing && globalThis.__mduSurubiRoundOld) {
      this.send({ a: 'in', f: 0, E: r2(z.pos) });
      return;
    }
    z.fish = true;
    // la pesca: vida propia (no depende de la ronda); el jefe de ronda, la de su ronda
    if (fishing) {
      z.maxHp *= HP_K * (globalThis.__mduNoSurubiVida ? 1 : VIDA_K);
      z.hp = z.maxHp;
    } else z.roundBoss = true;
    // (panza arriba recibe más, pero no el doble de los otros jefes)
    z.stunK = STUN_K;
    const E = z.pos.clone();
    let W = (fishing && this.fishW) || this.waterNear(E);
    this.fishW = null;
    let drain = false;
    if (!W) {
      // sin agua cerca: revienta una boca de tormenta y sale de abajo
      drain = true;
      W = E.clone().add(tmpV.set(Math.sin(z.yaw + Math.PI) * 5, -2.5, Math.cos(z.yaw + Math.PI) * 5));
    }
    this.send({ a: 'in', f: 1, W: r2(W), E: r2(E), d: drain ? 1 : 0 });
    z.yaw = Math.atan2(E.x - W.x, E.z - W.z);
    z.atkCd = 1.6;
    z.comboN = 0;
  }

  // ---------------- la vuelta del Pack-a-Pava ----------------
  emergeWithPava(cb) {
    const g = this.g;
    if (g.zombies.boss) {
      // (ya hay un jefe en la cancha: se suelta y hay que volver a pescar)
      g.hud.subtitle('Se soltó. Hay demasiado lío arriba: probá de nuevo.', 3);
      g.later?.(0.1, () => g.papq?.termas?.onFish?.('cut'));
      return;
    }
    // Sale del lado de la caña (donde entra el hilo, al norte del muelle) y cae
    // en la Costanera al lado del pescador, al norte de la entrada del muelle
    // (no se la tapa: si caía en la punta del muelle el que pescaba quedaba
    // encerrado). __mduNoSurubiSide: el de antes, más al sur, de cualquier agua.
    const [cx, cz] = EE.cana;
    const side = !globalThis.__mduNoSurubiSide;
    const at = side ? new THREE.Vector3(cx - 3.9, 0, cz - 2.6) : new THREE.Vector3(110.3, 0, 36.5);
    at.y = g.world.floorAt(at.x, at.z);
    this.fishW = side ? new THREE.Vector3(cx + 0.8, g.water?.heightAt?.(cx + 0.8, cz - 5) ?? -5.2, cz - 5) : null;
    // (emergeFx, adentro de spawnBoss, la arma como la pelea de la pesca)
    this.fishing = true;
    const z = g.zombies.spawnBoss(g.rounds.round, { at, kind: 'surubi' });
    this.fishing = false;
    if (!z) return cb();
    z.pava = true;
    this.pavaCb = cb;
    this.send({ a: 'hasPava' });
  }

  // (el de antes la escupía desde update: acá lo hace think)
  spitPava() {}

  // ---------------- la pelea (anfitrión: Zombies.thinkBoss) ----------------
  think(z, dt, t, player) {
    const g = this.g;
    const zs = g.zombies;
    z.stateT += dt;
    const T = z.stateT;
    const tgt = z.dead ? null : zs.moves.target(z, dt);
    if (!z.dead && z.state !== 'burrow') g.hud.setBossBar(z.pava ? 'El Surubí (tiene la pava)' : z.enraged ? 'El Surubí (enojado)' : 'El Surubí', Math.max(0, z.hp / z.maxHp));
    // la pesca: con un cuarto de vida escupe la pava y se va (de cualquier
    // ataque; y no se deja matar antes, salvo de un golpe enorme)
    if (z.pava && !z.dead) {
      if (z.hp < z.maxHp * 0.12) z.hp = z.maxHp * 0.12;
      if (z.hp < z.maxHp * PAVA_AT && !['intro', 'summon', 'burrow', 'charge'].includes(z.state)) {
        this.set(z, 'summon');
        z.pavaOut = true;
      }
    }
    const pp = tgt?.pos || player.pos;
    const dx = pp.x - z.pos.x;
    const dz = pp.z - z.pos.z;
    const dist = Math.hypot(dx, dz);
    switch (z.state) {
      case 'intro': {
        const I = this.intro;
        // (ya salió: Zombies lo vuelve a poner en 'intro' a veces al pegarle,
        // un rugido de dolor; acá, un segundo y sigue)
        if (z.introDone || !I) {
          if (T > 1.0 || !I) this.set(z, 'chase');
          break;
        }
        if (T < BUB) z.pos.copy(I.W);
        else if (T < LAND) {
          arc(I.W, I.E, 6.5, (T - BUB) / FLY, z.pos);
          z.yaw = Math.atan2(I.E.x - I.W.x, I.E.z - I.W.z);
        } else {
          z.pos.copy(I.E);
          z.baseY = I.E.y;
          if (!z.landed) {
            z.landed = true;
            this.hurtAround(I.E, 3.6, 10, 7);
          }
          if (T > LAND + 1.2) this.turn(z, Math.atan2(dx, dz), 2.5, dt);
          if (T > INTRO_END) {
            z.introDone = true;
            this.set(z, 'chase');
          }
        }
        break;
      }
      case 'chase': {
        // la pava: al final la escupe y se vuelve al río
        if (z.pava && z.hp < z.maxHp * PAVA_AT) {
          this.set(z, 'summon');
          z.pavaOut = true;
          break;
        }
        // la segunda fase: el berrinche
        if (!z.enraged && z.hp < z.maxHp * PHASE2) {
          z.enraged = true;
          this.set(z, 'enrage');
          break;
        }
        z.atkCd = (z.atkCd ?? 2) - dt;
        z.nearT = dist < 4.5 ? (z.nearT || 0) + dt : 0;
        if (tgt && z.atkCd <= 0 && this.pickAttack(z, tgt, dist)) break;
        if (!tgt) {
          this.hop(z, dt, 0);
          break;
        }
        // (el que se tiró al río o no se llega caminando: lo espera en la orilla)
        if (!this.onLand(pp)) {
          this.turn(z, Math.atan2(dx, dz), 2, dt);
          this.hop(z, dt, 0);
          break;
        }
        // a los saltitos (frena un poco al caer de cada uno)
        const nav = g.navFor ? g.navFor(tgt) : g.nav;
        let mx = dx / (dist || 1);
        let mz = dz / (dist || 1);
        const los = dist < 12 && g.world.clear(tmpV.set(z.pos.x, (z.baseY || 0) + 1.4, z.pos.z), tmpW.set(pp.x, (pp.y || 0) + 1.4, pp.z)) && (!g.world.levels || walkLine(g.world, z.pos.x, z.pos.z, pp.x, pp.z, z.baseY));
        if (!los && nav.direction(z.pos.x, z.pos.z, dirOut, z.baseY, 1)) {
          mx = dirOut.x;
          mz = dirOut.z;
        }
        const v = (z.enraged ? WALK2 : WALK) * (dist > 3 ? 1 : 0.2);
        this.hop(z, dt, v, mx, mz, t);
        break;
      }
      case 'chargeWind': {
        // el panzazo: se agacha y menea la cola; la sombra marca dónde cae
        const wind = z.comboN > 0 ? PZ_WIND2 : PZ_WIND;
        if (!z.aimed) {
          z.aimed = true;
          const E = this.landSpot(pp, z);
          if (!E) {
            z.comboN = 0;
            this.set(z, 'chase');
            break;
          }
          this.send({ a: 'jump', S: r2(z.pos), E: r2(E), h: 5.5, dur: PZ_FLY });
        }
        if (this.fly) this.turn(z, Math.atan2(this.fly.E.x - z.pos.x, this.fly.E.z - z.pos.z), 4, dt);
        if (T >= wind) this.set(z, 'charge');
        break;
      }
      case 'charge': {
        const F = this.fly;
        if (!F) {
          this.set(z, 'chase');
          break;
        }
        arc(F.S, F.E, F.h, Math.min(1, T / F.dur), z.pos);
        if (T >= F.dur) {
          z.pos.copy(F.E);
          z.baseY = F.E.y;
          this.hurtAround(F.E, PZ_R, PZ_DMG * this.dmgK(z), 8);
          this.set(z, 'slam');
        }
        break;
      }
      case 'slam': {
        if (T >= SLAM_T) {
          z.comboN = (z.comboN || 0) + 1;
          if (z.enraged && z.comboN < 3 && tgt) {
            z.aimed = false;
            this.set(z, 'chargeWind');
          } else {
            z.comboN = 0;
            z.stunDur = STUN_T;
            this.set(z, 'stunned');
          }
        }
        break;
      }
      case 'stunned': {
        if (T >= (z.stunDur || STUN_T)) {
          z.atkCd = 1.2;
          // (la primera vez que queda patas arriba, después eructa las mojarritas)
          if ((z.mojN || 0) < (z.enraged ? 2 : 1)) {
            this.set(z, 'summon');
            break;
          }
          this.set(z, 'chase');
        }
        break;
      }
      case 'aim': {
        // se infla: el carril marca por dónde viene
        if (!z.aimed) {
          z.aimed = true;
          const d = new THREE.Vector2(dx, dz).normalize();
          const len = this.laneLen(z, d);
          this.send({ a: 'lane', S: r2(z.pos), d: [+d.x.toFixed(3), +d.y.toFixed(3)], len: +len.toFixed(1) });
        }
        if (this.lane) this.turn(z, Math.atan2(this.lane.d.x, this.lane.d.y), 5, dt);
        if (T >= ROLL_WIND) {
          z.rollHits = new Set();
          z.rollD = 0;
          z.stuckT = 0;
          this.set(z, 'shoot');
        }
        break;
      }
      case 'shoot': {
        const Ln = this.lane;
        if (!Ln) {
          this.set(z, 'chase');
          break;
        }
        const bx0 = z.pos.x;
        const bz0 = z.pos.z;
        zs.moveBoss(z, Ln.d.x, Ln.d.y, ROLL_SPEED, dt, t);
        const moved = Math.hypot(z.pos.x - bx0, z.pos.z - bz0);
        z.rollD += moved;
        z.stuckT = moved < ROLL_SPEED * dt * 0.3 ? z.stuckT + dt : 0;
        for (const p of zs.bossTargets()) {
          if (z.rollHits.has(p)) continue;
          if (Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) > 2.8) continue;
          z.rollHits.add(p);
          g.damagePlayer(p, Math.round(ROLL_DMG * this.dmgK(z)), z.pos);
        }
        if (z.stuckT > 0.12 && T > 0.25) {
          // se la dio contra la pared: mareado
          z.stunDur = DIZZY_T;
          z.dizzy = true;
          this.send({ a: 'bonk' });
          this.set(z, 'stunned');
        } else if (T > ROLL_MAX || z.rollD > Ln.len) this.set(z, 'reel');
        break;
      }
      case 'reel': {
        if (T >= REEL_T) {
          z.atkCd = 2.2;
          this.set(z, 'chase');
        }
        break;
      }
      case 'whipWind': {
        if (!z.aimed) {
          z.aimed = true;
          const n = z.enraged ? 5 : 3;
          const lead = tgt?.vel ? tmpV.set(tgt.vel.x || 0, 0, tgt.vel.z || 0).multiplyScalar(0.5) : tmpV.set(0, 0, 0);
          const pts = [];
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = i === 0 ? 0 : 1.8 + Math.random() * 2.6;
            const x = pp.x + lead.x + Math.cos(a) * r;
            const zz = pp.z + lead.z + Math.sin(a) * r;
            pts.push(r2(tmpW.set(x, g.world.floorAt(x, zz, (pp.y || 0) + 1), zz)));
          }
          this.send({ a: 'spit', pts });
        }
        this.turn(z, Math.atan2(dx, dz), 4, dt);
        if (T >= SPIT_WIND) this.set(z, 'whip');
        break;
      }
      case 'whip': {
        if (T >= SPIT_T) {
          z.atkCd = 1.8;
          this.set(z, 'chase');
        }
        break;
      }
      case 'ram': {
        // el coletazo: enrosca la cola hacia el del costado y barre
        if (!z.aimed) {
          z.aimed = true;
          const side = Math.sign(Math.sin(Math.atan2(dx, dz) - z.yaw)) || 1;
          z.ramSide = side;
          this.send({ a: 'ram', s: side });
          z.ramHits = new Set();
        }
        if (T > 0.65 && T < 1.05) {
          for (const p of zs.bossTargets()) {
            if (z.ramHits.has(p)) continue;
            for (let i = 5; i < NB; i++) {
              if (Math.hypot(p.pos.x - this.P[i].x, p.pos.z - this.P[i].z) > 2.3) continue;
              z.ramHits.add(p);
              g.damagePlayer(p, Math.round(RAM_DMG * this.dmgK(z)), z.pos);
              break;
            }
          }
        }
        if (T >= RAM_T) {
          z.atkCd = 1.6;
          this.set(z, 'chase');
        }
        break;
      }
      case 'summon': {
        // eructa mojarritas (o, con la pava, la escupe)
        if (!z.aimed && T > 0.6) {
          z.aimed = true;
          if (z.pavaOut) this.spitOutPava(z);
          else this.spawnMojs(z);
        }
        if (T >= MOJ_T) {
          if (z.pavaOut) {
            this.startDive(z);
            this.set(z, 'burrow');
          } else {
            z.atkCd = 1.5;
            this.set(z, 'chase');
          }
        }
        break;
      }
      case 'enrage': {
        if (T >= ENRAGE_T) {
          z.atkCd = 0.6;
          this.set(z, 'chase');
        }
        break;
      }
      case 'burrow': {
        const D = this.dive;
        if (D) arc(D.S, D.W, 4.5, Math.min(1, T / 1.3), z.pos);
        if (T > 2.2) {
          zs.removeBoss();
          g.hud.setBossBar?.(null);
        }
        break;
      }
      case 'dead': {
        z.corpseT = (z.corpseT || 0) + dt;
        // (lo bajaron de un saque antes de que la escupiera: la escupe igual)
        if (z.pava) this.spitOutPava(z);
        const D = this.dive;
        if (z.corpseT > 3.0 && !z.dove) {
          z.dove = true;
          const W = this.waterNear(z.pos, 3, 13);
          if (W) this.send({ a: 'dive', S: r2(z.pos), W: r2(W) });
        }
        if (D && z.dove) arc(D.S, D.W, 4.5, Math.min(1, (z.corpseT - 3.0) / 1.3), z.pos);
        if (z.corpseT > (z.dove && D ? 5.5 : 9.5)) zs.removeBoss();
        break;
      }
      default:
        this.set(z, 'chase');
    }
  }

  // El jefe de ronda (con __mduMonuRoundBoss) pega más en las rondas altas
  // (fácil, pero no un trámite); la pesca, siempre igual.
  dmgK(z) {
    if (!z?.roundBoss) return 1;
    return 1 + Math.max(0, (this.g.rounds?.round || 6) - 6) * 0.06;
  }

  set(z, s) {
    z.state = s;
    z.stateT = 0;
    z.attackT = 0;
    z.aimed = false;
  }

  turn(z, yaw, rate, dt) {
    let d = yaw - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += clamp(d, -rate * dt, rate * dt);
  }

  // A los saltitos: avanza en la parte alta de cada salto (al caer frena).
  hop(z, dt, v, mx = 0, mz = 0, t = 0) {
    const g = this.g;
    if (v > 0) {
      const k = Math.max(0.15, Math.sin((z.hopPh || 0) * Math.PI));
      g.zombies.moveBoss(z, mx, mz, v * 1.6 * k, dt, t);
    }
    const before = z.hopPh || 0;
    z.hopPh = before + dt / HOP_T;
    if (Math.floor(z.hopPh) !== Math.floor(before)) {
      // cayó: el golpe sordo (lo oyen todos por el estado: acá solo el temblor)
      const d = Math.hypot(g.player.pos.x - z.pos.x, g.player.pos.z - z.pos.z);
      if (d < 14 && v > 0) g.fx.addShake(0.06 * (1 - d / 14));
    }
  }

  // Qué hace ahora (con la vida y la distancia), o nada.
  pickAttack(z, tgt, dist) {
    const g = this.g;
    const pp = tgt.pos;
    const land = this.onLand(pp);
    const flat = land && (!g.world.levels || Math.abs((pp.y || 0) - (z.baseY || 0)) < 2.5);
    const opts = [];
    if (z.nearT > 1.0 && dist < 4.5) opts.push(['ram', 4]);
    if (dist > 4 && dist < 18 && flat && this.landSpot(pp, z)) opts.push(['chargeWind', 3]);
    if (dist > 4 && dist < 15) opts.push(['whipWind', land ? 2 : 1]);
    if (dist > 6 && dist < 16 && flat && walkLine(g.world, z.pos.x, z.pos.z, pp.x, pp.z, z.baseY)) opts.push(['aim', 2]);
    if (!opts.length) return false;
    let s = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    let pick = opts[0][0];
    for (const [k, w] of opts) {
      s -= w;
      if (s <= 0) {
        pick = k;
        break;
      }
    }
    // (que no repita la misma tres veces)
    if (pick === z.lastAtk && z.sameN >= 1 && opts.length > 1) pick = opts.find((o) => o[0] !== pick)[0];
    z.sameN = pick === z.lastAtk ? (z.sameN || 0) + 1 : 0;
    z.lastAtk = pick;
    z.atkCd = (z.enraged ? 1.6 : 2.4) + Math.random() * 1.2 + (land ? 0 : 2.5);
    z.comboN = 0;
    this.set(z, pick);
    return true;
  }

  // Dónde cae el panzazo: donde está el jugador, si es piso que se camina
  // (al agua no se tira), o null.
  landSpot(pp, z) {
    const g = this.g;
    if (!this.onLand(pp)) return null;
    const E = new THREE.Vector3(pp.x, 0, pp.z);
    E.y = g.world.floorAt(E.x, E.z, (pp.y || z.baseY || 0) + 1);
    return E;
  }

  // ¿Se llega caminando (y no es el río ni el agua honda)?
  onLand(pp) {
    const g = this.g;
    // (en el agua: hay agua honda y está abajo de la superficie; arriba del
    // muelle hay agua debajo pero se camina)
    const deep = g.world.waterDepth?.(pp.x, pp.z) > 0.3 || (g.water?.depthAt?.(pp.x, pp.z) || 0) > 0.3;
    if (deep && (pp.y || 0) < (g.water?.heightAt?.(pp.x, pp.z) ?? -5.2) + 0.25) return false;
    return Number.isFinite(g.nav.distAt(pp.x, pp.z));
  }

  // Hasta dónde llega la rodada derecho (hasta la pared, como mucho 24 m).
  laneLen(z, d) {
    const g = this.g;
    let len = 0;
    for (let s = 1; s <= 24; s += 1) {
      const x = z.pos.x + d.x * s;
      const zz = z.pos.z + d.y * s;
      if (!walkLine(g.world, z.pos.x, z.pos.z, x, zz, z.baseY)) break;
      len = s;
    }
    return Math.max(6, len + 1.5);
  }

  // El golpe de una caída: a los de cerca les pega y los tira para atrás
  // (el daño lo decide el anfitrión; el empujón, cada compu: ver landFx).
  hurtAround(at, r, dmg, push) {
    const g = this.g;
    for (const p of g.zombies.bossTargets()) {
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      if (d > r || Math.abs((p.pos.y || 0) - at.y) > 2.5) continue;
      g.damagePlayer(p, Math.round(dmg * (1 - (d / r) * 0.55)), at);
    }
    void push;
  }

  spawnMojs(z) {
    const g = this.g;
    const n = 4 + (z.enraged ? 1 : 0);
    const l = [];
    z.mojN = (z.mojN || 0) + 1;
    this.mojSeq = (this.mojSeq || 0) + 1;
    for (let i = 0; i < n; i++) {
      const a = z.yaw + (i / n - 0.5) * 2.6 + (Math.random() - 0.5) * 0.4;
      const r = 3.5 + Math.random() * 3;
      let x = z.pos.x + Math.sin(a) * r;
      let zz = z.pos.z + Math.cos(a) * r;
      if (!Number.isFinite(g.nav.distAt(x, zz))) {
        x = z.pos.x + Math.sin(a) * 1.8;
        zz = z.pos.z + Math.cos(a) * 1.8;
      }
      l.push([this.mojSeq * 10 + i, +x.toFixed(2), +g.world.floorAt(x, zz, (z.baseY || 0) + 1).toFixed(2), +zz.toFixed(2)]);
    }
    this.send({ a: 'moj', l });
  }

  // La pava del Pack-a-Pava: ¡ptui! al muelle (la deja papLlama donde va).
  spitOutPava(z) {
    const [cx, cz] = EE.cana;
    const E = new THREE.Vector3(cx - 1.4, this.g.world.floorAt(cx - 1.4, cz), cz + 0.6);
    const S = this.mouthPos(new THREE.Vector3());
    this.send({ a: 'pava', S: r2(S), E: r2(E) });
    const cb = this.pavaCb;
    this.pavaCb = null;
    z.pava = false;
    this.g.later?.(0.85, () => cb?.());
  }

  startDive(z) {
    const W = this.intro?.W && this.intro.W.distanceTo(z.pos) < 16 ? this.intro.W : this.waterNear(z.pos, 3, 14) || z.pos.clone().add(tmpV.set(0, -3, 0));
    this.send({ a: 'dive', S: r2(z.pos), W: r2(W) });
  }

  // ---------------- cada cuadro (en todas las compus) ----------------
  update(dt) {
    const g = this.g;
    const z = this.boss;
    if (!z) {
      if (this.cur) this.gone();
      this.updateFx(dt, null);
      return;
    }
    if (z !== this.cur) this.arrive(z);
    // (__mduSurubiRoundOld: el jefe de ronda con el cuerpo de piezas de antes)
    if (this.mode === 'old') {
      this.root.visible = false;
      this.old ||= new SurubiOld(g);
      this.old.update(dt);
      return;
    }
    if (this.old) this.old.root.visible = false;
    // el cuerpo de piezas del jefe no se dibuja (se veía un muñeco montado en la cabeza)
    const R = g.zombies.bossRig;
    if (R?.rig) R.rig.visible = false;
    if (z.state !== this.lastState) {
      this.onState(z, this.lastState);
      this.lastState = z.state;
      this.prevT = 0;
      this.stT = 0;
    } else {
      this.prevT = this.stT;
      this.stT += dt;
    }
    this.root.visible = true;
    this.animate(z, dt);
    this.events(z);
    this.updateFx(dt, z);
  }

  // Llegó un jefe nuevo (también en el invitado): la música en hora.
  arrive(z) {
    const g = this.g;
    this.cur = z;
    this.lastState = '';
    this.segInit = false;
    this.spin = 0;
    for (const W of this.whisk || []) W.init = false;
    // cuál de las dos peleas (el anfitrión lo sabe; el invitado, por el aviso 'in')
    if (isHost(g)) this.mode = z.fish ? 'fish' : 'old';
    else if (!(this.modeT > g.time - 4)) this.mode = globalThis.__mduSurubiRoundOld ? 'old' : 'fish';
    // la del intro que no llegó (el invitado sin el mensaje): de un costado
    if (this.mode !== 'fish' || !this.intro || g.time - this.intro.t > 4) this.intro = null;
    this.musicFor = null;
    if (this.mode === 'fish') this.startMusic();
  }

  // La pelea de la pesca: la de jefe de ronda, con el golpe de la canción en
  // la caída de la salida (una vez por pescado).
  startMusic() {
    const g = this.g;
    const z = this.boss;
    if (!z || this.musicFor === z || z.state !== 'intro' || z.dead || !g.music || globalThis.__mduNoSurubiMusic) return;
    this.musicFor = z;
    const left = LAND - (z.stateT || 0);
    if (left < 0.2) return;
    const b = z;
    g.music.play(TRACK, { loop: true, at: Math.max(0, TRACK_BOOM - left), delay: Math.max(0, left - TRACK_BOOM), while: (G) => G.zombies?.boss === b && !b.dead && b.state !== 'burrow' && (G.state === 'playing' || G.state === 'paused') });
  }

  // El jefe de ronda sale como antes: el chapuzón (o el desagüe), el vapor y el rugido.
  roundEmerge(at) {
    const g = this.g;
    const p = tmpW.set(at.x, at.y + 0.3, at.z);
    for (let k = 0; k < 4; k++) g.fx.steam(p, 6, 1.2);
    g.water?.splash?.(Math.max(113.2, at.x + 1.2), at.z, 3);
    g.fx.dirt?.(p, 22);
    g.audio.growl?.(p.clone().setY(p.y + 1), 'boss');
  }

  gone() {
    this.cur = null;
    this.root.visible = false;
    this.shadow.grp.visible = false;
    this.laneM.visible = false;
    this.deep.visible = false;
    this.lane = null;
    this.fly = null;
    this.dive = null;
    this.hasPava = false;
    for (const r of this.spitRingsM || []) r.visible = false;
  }

  onState(z, prev) {
    const g = this.g;
    if (prev === 'intro') this.introDoneFor = z;
    const at = tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z);
    switch (z.state) {
      case 'chargeWind':
        g.audio.growl?.(at, 'attack');
        break;
      case 'aim':
        this.sfxInflate(at);
        break;
      case 'reel':
        this.sfxPfff(at);
        this.reelSeed = Math.random() * 10;
        break;
      case 'stunned':
        if (z.dizzy || prev === 'shoot') {
          g.fx.addShake(0.2);
          g.fx.sparkle(tmpV.set(z.pos.x, (z.baseY || 0) + 2.4, z.pos.z), [1, 0.95, 0.5], 18, 1.1);
          this.sfxBonk(at);
        }
        break;
      case 'whip':
        this.spitT = 0;
        this.spitI = 0;
        void 0;
        break;
      case 'enrage':
        g.audio.growl?.(at, 'boss');
        break;
      case 'summon':
        this.sfxBurp(at, 0.5);
        break;
      case 'dead':
        g.audio.growl?.(at, 'death');
        this.sfxBlub(at);
        break;
      default:
    }
  }

  // Lo que pasa en momentos fijos de cada estado (en todas las compus, igual).
  events(z) {
    const g = this.g;
    const a = this.prevT;
    const b = this.stT;
    const cross = (x) => a < x && b >= x;
    const st = z.state;
    if (st === 'intro' && this.introDoneFor === z) {
      if (cross(0.2)) g.audio.growl?.(tmpV.set(z.pos.x, (z.baseY || 0) + 2.5, z.pos.z), 'attack');
    } else if (st === 'intro') {
      const I = this.intro;
      const W = I?.W || z.pos;
      if (b < BUB) {
        // burbujas, el agua que se revuelve y el retumbe
        if (Math.random() < 0.5) this.bubble(W, 2.5 + b);
        const d = Math.hypot(g.player.pos.x - W.x, g.player.pos.z - W.z);
        if (d < 30) g.fx.addShake(0.012 * (b / BUB) * (1 - d / 30));
      }
      if (cross(0.05)) this.sfxRumble(W);
      if (cross(BUB)) {
        // ¡sale!
        if (I?.drain) {
          g.fx.dirt?.(tmpV.copy(I.E).setY(I.E.y + 0.2), 50);
          g.fx.explosion(tmpV.copy(W).setY(I.E.y + 0.3), 2.2, [0.5, 0.6, 0.7]);
        }
        this.bigSplash(W, 3);
        g.audio.growl?.(tmpV.copy(W).setY(W.y + 2), 'boss');
        this.sfxBlub(W);
      }
      if (b > BUB && b < LAND && Math.random() < 0.6) this.drip();
      if (cross(LAND)) this.landFx(I?.E || z.pos, 1.3);
      if (cross(LAND + 0.45) || cross(LAND + 0.8)) this.thud(z.pos, 0.5);
      if (cross(LAND + 1.3)) {
        g.audio.growl?.(tmpV.set(z.pos.x, (z.baseY || 0) + 2.5, z.pos.z), 'boss');
      }
    } else if (st === 'chase') {
      const hp = z.hopPh ?? b / HOP_T;
      if (Math.floor(hp) !== Math.floor(this.lastHop ?? hp)) this.thud(z.pos, 0.18);
      this.lastHop = hp;
    } else if (st === 'charge') {
      if (Math.random() < 0.4) this.drip();
    } else if (st === 'slam') {
      if (cross(0.0001) || (a === 0 && b > 0 && !this.slamDone)) {
        this.slamDone = true;
        this.landFx(this.fly?.E || z.pos, 1);
      }
    } else if (st === 'whip') {
      // las bolas de agua, de a una
      const n = this.spits.length;
      for (let i = 0; i < n; i++) if (cross(0.12 + i * 0.16)) this.launchBall(i);
    } else if (st === 'ram') {
      if (cross(0.65)) this.sfxWhoosh(z.pos);
    } else if (st === 'summon') {
      if (cross(0.6)) this.sfxBurp(tmpV.set(z.pos.x, (z.baseY || 0) + 1.6, z.pos.z), 1);
    } else if (st === 'enrage') {
      if (cross(0.3) || cross(1.0)) this.thud(z.pos, 0.6);
      if (Math.random() < 0.3) g.fx.steam(tmpV.set(z.pos.x + (Math.random() - 0.5), (z.baseY || 0) + 2.6, z.pos.z + (Math.random() - 0.5)), 2, 0.35);
    } else if (st === 'stunned') {
      if (Math.random() < 0.06) this.sfxBlub(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 0.4);
      if (Math.random() < 0.2) g.fx.sparkle(tmpV.set(this.P[0].x, this.P[0].y + 1.6, this.P[0].z), [1, 0.95, 0.5], 1, 0.5);
    } else if (st === 'burrow' || st === 'dead') {
      const t0 = st === 'dead' ? 3.0 : 0;
      if (this.dive && cross(t0 + 1.3)) this.bigSplash(this.dive.W, 2.5);
      if (st === 'dead' && (cross(0.6) || cross(1.3) || cross(1.9) || cross(2.4))) this.thud(z.pos, 0.3);
    }
    if (st !== 'slam') this.slamDone = false;
  }

  // ---------------- el cuerpo ----------------
  animate(z, dt) {
    const g = this.g;
    const t = g.time || 0;
    const st = z.state;
    const T = this.stT;
    const PO = this.pose;
    const host = isHost(g);
    // lo que quiere cada estado
    let arch = 0;
    let squash = 1;
    let puff = 0;
    let mouth = 0.05 + Math.max(0, Math.sin(t * 1.7)) * 0.08;
    let curl = 0;
    let roll = 0;
    let pitch = 0;
    let lift = 0;
    let air = 0;
    let eye = 1;
    let wave = 0.06;
    let waveF = 2.5;
    let fin = 2;
    let H = tmpU.copy(z.pos);
    let groundY = z.baseY ?? z.pos.y;
    let fwdPitch = 0;
    this.hidden = false;
    let headYaw = z.yaw;
    // (la salida, o el rugido si lo vuelve a poner Zombies al pegarle: introDone)
    if (st === 'intro' && this.introDoneFor === z) {
      const k = smooth(T / 0.25) * (1 - smooth((T - 0.75) / 0.3));
      pitch = 0.4 * k;
      mouth = 0.15 + 0.85 * k;
      eye = 1 + 0.5 * k;
      arch = -0.25 * k;
      wave = 0.25 * k;
      waveF = 10;
    } else if (st === 'intro') {
      const I = this.intro;
      if (I && T < BUB) {
        this.hidden = true;
        H.copy(I.W);
      } else if (I && T < LAND) {
        const k = (T - BUB) / FLY;
        arc(I.W, I.E, 6.5, k, H);
        groundY = H.y;
        air = 1;
        fwdPitch = Math.atan2(4 * 6.5 * (1 - 2 * k), I.W.distanceTo(I.E) || 1) * 0.8;
        this.spin = smooth(k) * Math.PI * 2;
        arch = 0.9 * Math.sin(k * Math.PI);
        mouth = 1;
        eye = 1.5;
        wave = 0.4;
        waveF = 9;
        fin = 14;
        headYaw = Math.atan2(I.E.x - I.W.x, I.E.z - I.W.z);
      } else {
        this.spin = 0;
        const u = T - LAND;
        // los rebotes: dos, más chicos, y se aplasta al caer
        const b1 = u < 0.45 ? Math.sin((u / 0.45) * Math.PI) * 0.9 : u < 0.8 ? Math.sin(((u - 0.45) / 0.35) * Math.PI) * 0.35 : 0;
        lift = b1;
        squash = u < 0.08 ? 0.62 : 1;
        if (u > 1.2) {
          // ruge: levanta la cabeza, boca enorme, ojos saltones
          const r = smooth((u - 1.2) / 0.3) * (1 - smooth((u - 2.2) / 0.3));
          pitch = 0.45 * r;
          mouth = 0.15 + r * 0.85;
          eye = 1 + r * 0.6;
          arch = -0.3 * r;
          wave = 0.25 * r;
          waveF = 10;
        }
        if (I) {
          H.set(I.E.x, I.E.y, I.E.z);
          groundY = I.E.y;
        }
      }
    } else if (st === 'chase') {
      const hp = z.hopPh ?? T / HOP_T;
      const f = hp - Math.floor(hp);
      lift = Math.sin(f * Math.PI) * 0.45;
      arch = Math.sin(f * Math.PI) * 0.55 - 0.15;
      squash = f < 0.12 ? 0.85 : 1;
      wave = 0.18;
      waveF = 7;
      mouth = 0.1 + Math.sin(f * Math.PI) * 0.25;
      fin = 6;
    } else if (st === 'chargeWind') {
      const wind = z.comboN > 0 ? PZ_WIND2 : PZ_WIND;
      const k = Math.min(1, T / wind);
      squash = 1 - 0.28 * k;
      arch = -0.35 * k;
      wave = 0.35 * k;
      waveF = 16;
      mouth = 0.4;
      eye = 1.25;
      fin = 10;
    } else if (st === 'charge') {
      const F = this.fly;
      if (F) {
        const k = Math.min(1, T / F.dur);
        arc(F.S, F.E, F.h, k, H);
        groundY = H.y;
        air = 1;
        fwdPitch = Math.atan2(4 * F.h * (1 - 2 * k), F.S.distanceTo(F.E) || 1) * 0.5;
        headYaw = Math.atan2(F.E.x - F.S.x, F.E.z - F.S.z);
      }
      arch = 0.8;
      squash = 1.12;
      mouth = 0.8;
      eye = 1.4;
      wave = 0.3;
      waveF = 10;
      fin = 16;
    } else if (st === 'slam') {
      squash = T < 0.1 ? 0.55 : 1;
      arch = T < 0.1 ? -0.6 : 0;
      mouth = 0.6;
      eye = 1.6;
    } else if (st === 'stunned') {
      // panza arriba, boqueando, aletas a mil, ojos que giran
      const dur = z.dizzy ? DIZZY_T : STUN_T;
      const flip = smooth(T / 0.35) * (1 - smooth((T - (dur - 0.45)) / 0.4));
      roll = Math.PI * flip;
      lift = T < 0.35 ? Math.sin((T / 0.35) * Math.PI) * 1.2 : T > dur - 0.45 && T < dur ? Math.sin(((T - (dur - 0.45)) / 0.45) * Math.PI) * 0.9 : 0;
      mouth = 0.25 + Math.abs(Math.sin(t * 7)) * 0.6;
      wave = 0.35;
      waveF = 13;
      arch = 0.25 + Math.sin(t * 9) * 0.15;
      fin = 22;
      if (z.dizzy) puff = Math.max(0, 1 - T / 1.2) * 0.9;
    } else if (st === 'aim') {
      const k = smooth(T / ROLL_WIND);
      puff = k;
      mouth = 0.02;
      eye = 1 + k * 0.5;
      wave = 0.12;
      waveF = 20;
      lift = k * 0.6;
      fin = 18;
    } else if (st === 'shoot') {
      puff = 1;
      mouth = 0.02;
      eye = 1.5;
      // rebota y rueda (de costado, como un barril)
      lift = 0.6 + Math.abs(Math.sin(T * 6.5)) * 1.4;
      this.spin += dt * 9;
      roll = this.spin;
      fin = 25;
      wave = 0.05;
    } else if (st === 'reel') {
      // se desinfla a los chiflidos: da vueltas y se sacude
      const k = Math.min(1, T / REEL_T);
      puff = 1 - smooth(k);
      lift = Math.sin(k * Math.PI) * 1.3;
      const s = this.reelSeed || 0;
      headYaw = z.yaw + Math.sin(T * 13 + s) * 1.4 * (1 - k);
      roll = Math.sin(T * 17 + s) * 0.8 * (1 - k);
      pitch = Math.sin(T * 11) * 0.4 * (1 - k);
      mouth = 0.7;
      eye = 1.7;
      wave = 0.6 * (1 - k);
      waveF = 18;
      fin = 25;
      if (Math.random() < 0.5) g.fx.alpha.spawn(this.P[0].x, this.P[0].y + 0.3, this.P[0].z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, { color: [0.85, 0.9, 1], size: 0.2, size1: 0.9, life: 0.5, alpha: 0.18, drag: 2 });
    } else if (st === 'whipWind') {
      const k = smooth(T / SPIT_WIND);
      pitch = 0.3 * k;
      arch = -0.25 * k;
      mouth = 0.02;
      puff = 0.25 * k;
      eye = 1.2;
    } else if (st === 'whip') {
      const n = Math.max(1, this.spits.length);
      const ph = clamp((T - 0.12) / (0.16 * n), 0, 1);
      pitch = 0.35 - ph * 0.2;
      mouth = 0.3 + Math.abs(Math.sin(T * 20)) * 0.7 * (ph < 1 ? 1 : 0);
      squash = 1 + Math.sin(T * 20) * 0.05;
    } else if (st === 'ram') {
      const side = z.ramSide || this.ramSide || 1;
      if (T < 0.65) {
        curl = side * smooth(T / 0.65) * 1.8;
        squash = 0.92;
        wave = 0.1;
        headYaw = z.yaw - side * 0.25 * smooth(T / 0.65);
      } else if (T < 1.05) {
        curl = side * (1.8 - smooth((T - 0.65) / 0.4) * 3.8);
        wave = 0.15;
        lift = Math.sin(((T - 0.65) / 0.4) * Math.PI) * 0.4;
      } else {
        curl = side * -2.0 * (1 - smooth((T - 1.05) / 0.5));
      }
      mouth = 0.3;
      eye = 1.2;
    } else if (st === 'summon') {
      const k = smooth((T - 0.35) / 0.25) * (1 - smooth((T - 1.3) / 0.4));
      mouth = 0.1 + k;
      pitch = 0.35 * k;
      arch = -0.2 * k;
      squash = 1 + Math.sin(T * 12) * 0.06 * k;
      eye = 1 + k * 0.4;
    } else if (st === 'enrage') {
      // el berrinche: dos saltos en el lugar, cola que golpea, todo colorado
      const u = (T % 0.7) / 0.7;
      lift = Math.sin(u * Math.PI) * 1.3;
      arch = Math.sin(u * Math.PI) * 0.8;
      squash = u < 0.1 ? 0.6 : 1;
      mouth = 0.9;
      eye = 1.6;
      wave = 0.5;
      waveF = 14;
      fin = 20;
    } else if (st === 'burrow' || st === 'dead') {
      const t0 = st === 'dead' ? 3.0 : 0;
      const D = this.dive;
      if (st === 'dead' && T < t0) {
        // patas arriba, aletazos que se van apagando
        roll = Math.PI * smooth(T / 0.45);
        const f = Math.max(0, 1 - T / 2.6);
        lift = T < 0.45 ? Math.sin((T / 0.45) * Math.PI) * 1.0 : Math.abs(Math.sin(T * 5.5)) * 0.5 * f;
        arch = Math.sin(T * 11) * 0.4 * f;
        wave = 0.3 * f;
        waveF = 12;
        mouth = 0.55;
        fin = 15 * f;
      } else if (D && T >= t0) {
        const k = Math.min(1, (T - t0) / 1.3);
        arc(D.S, D.W, 4.5, k, H);
        groundY = H.y;
        air = 1;
        headYaw = Math.atan2(D.W.x - D.S.x, D.W.z - D.S.z);
        fwdPitch = Math.atan2(4 * 4.5 * (1 - 2 * k), D.S.distanceTo(D.W) || 1) * 0.6;
        roll = st === 'dead' ? Math.PI * (1 - smooth(k * 1.4)) : 0;
        this.spin = st === 'burrow' ? k * Math.PI * 2 : 0;
        arch = 0.6;
        mouth = 0.8;
        wave = 0.4;
        waveF = 10;
        fin = 18;
        if (k >= 1) this.hidden = true;
      } else if (st === 'dead') {
        roll = Math.PI;
        mouth = 0.55;
        // se hunde al final
        if (T > 7) lift = -Math.min(2.5, (T - 7) * 1.1);
      }
    }
    if (st === 'dead' || (st === 'burrow' && !this.dive)) eye = 1.3;
    // los resortes
    const k = 60;
    spring(PO.arch, arch, k, 9, dt);
    spring(PO.squash, squash, 220, 11, dt);
    spring(PO.puff, puff, 40, 8, dt);
    spring(PO.mouth, mouth, 180, 18, dt);
    spring(PO.curl, curl, 90, 12, dt);
    PO.roll.x += (roll - PO.roll.x) * Math.min(1, dt * (st === 'shoot' ? 60 : 12));
    spring(PO.pitch, pitch, 70, 12, dt);
    spring(PO.lift, lift, st === 'chase' || st === 'enrage' || st === 'shoot' ? 900 : 160, st === 'chase' || st === 'shoot' ? 45 : 14, dt);
    PO.air.x += (air - PO.air.x) * Math.min(1, dt * (air ? 30 : 9));
    spring(PO.eye, eye, 120, 8, dt);
    this.wavePh += dt * waveF;
    this.finPh += dt * fin;
    this.root.visible = !this.hidden;
    if (this.mesh) this.mesh.visible = !this.hidden;
    this.pose3(z, H, groundY, headYaw, fwdPitch, wave, dt);
    this.drawParts(z, dt, t);
  }

  // Las posiciones de los huesos: la columna hacia atrás desde la cabeza (cada
  // tramo sigue al de adelante con atraso: así se curva al doblar), el arco,
  // el meneo, la cola enroscada, apoyada en el piso o en el aire.
  pose3(z, H, groundY, headYaw, fwdPitch, wave, dt) {
    const g = this.g;
    const PO = this.pose;
    const sy = this.segYaw;
    const air = PO.air.x;
    const puff = PO.puff.x;
    const sq = PO.squash.x;
    const segL = SEG * (1 - 0.42 * puff);
    if (!this.segInit) {
      this.segInit = true;
      sy.fill(headYaw);
    }
    sy[0] = headYaw;
    for (let i = 1; i < NB; i++) {
      let d = sy[i - 1] - sy[i];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      sy[i] += d * Math.min(1, dt * (air > 0.5 ? 14 : 5.5));
      // (no se dobla más que eso entre dos tramos)
      let e = sy[i] - sy[i - 1];
      while (e > Math.PI) e -= Math.PI * 2;
      while (e < -Math.PI) e += Math.PI * 2;
      if (Math.abs(e) > 0.38) sy[i] = sy[i - 1] + Math.sign(e) * 0.38;
    }
    const P = this.P;
    // la cabeza
    const cyL = CY * L;
    let x = H.x;
    let zz = H.z;
    const fp = fwdPitch * air;
    const ch = Math.cos(fp);
    const shh = Math.sin(fp);
    const curl = PO.curl.x;
    for (let i = 0; i < NB; i++) {
      const v = i / (NB - 1);
      if (i > 0) {
        const yaw = sy[i - 1] + Math.sin(this.wavePh - v * 6) * wave * (0.25 + v) + curl * Math.pow(v, 1.5) * 0.55;
        x -= Math.sin(yaw) * segL * ch;
        zz -= Math.cos(yaw) * segL * ch;
      }
      const syi = sq * (1 + puff * 1.15 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.25)), 0.7));
      // el arco: con la cabeza y la cola para arriba (+) o la joroba (-)
      const bow = ((v - 0.42) / 0.58) ** 2;
      const archY = PO.arch.x * (bow - 0.25) * 1.1;
      let y;
      if (air < 0.999) {
        const fl = g.world.floorAt(x, zz, (groundY || 0) + 1.5);
        const gy = (Number.isFinite(fl) && Math.abs(fl - groundY) < 3 ? fl : groundY) + cyL * syi;
        y = gy;
        if (air > 0.001) y = gy * (1 - air) + (H.y + cyL - i * segL * shh) * air;
      } else y = H.y + cyL - i * segL * shh;
      P[i].set(x, y + archY + PO.lift.x, zz);
    }
    // la cabeza levantada (rugir, escupir)
    const pt = PO.pitch.x;
    if (Math.abs(pt) > 0.001) {
      P[0].y += Math.sin(pt) * segL * 1.2;
      P[1].y += Math.sin(pt) * segL * 0.5;
    }
    // los giros: adelante = del de atrás al de adelante; rolido (+ el giro del aire)
    const roll = PO.roll.x + this.spin * (air > 0.5 || z.state === 'shoot' ? 1 : 0);
    for (let i = 0; i < NB; i++) {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(NB - 1, i + 1)];
      tmpV.subVectors(a, b).normalize();
      if (i === 0) {
        tmpV.y += Math.sin(pt) * 0.6;
        tmpV.normalize();
      }
      bx.crossVectors(UP, tmpV);
      if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0);
      bx.normalize();
      by.crossVectors(tmpV, bx);
      const r = roll + (z.state === 'stunned' || z.state === 'dead' ? Math.sin(this.wavePh * 0.7 - i * 0.5) * 0.18 : 0);
      if (r) {
        const c = Math.cos(r);
        const s = Math.sin(r);
        tmpW.copy(bx).multiplyScalar(c).addScaledVector(by, s);
        by.multiplyScalar(c).addScaledVector(bx, -s);
        bx.copy(tmpW);
      }
      tmpM.makeBasis(bx, by, tmpV);
      this.Q[i].setFromRotationMatrix(tmpM);
      const v = i / (NB - 1);
      const pk = 1 + puff * 1.15 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.25)), 0.7);
      this.S[i].set(pk / Math.sqrt(sq), pk * sq, 1 - 0.42 * puff);
      // (rolado, panza arriba: el lomo es más alto que la panza; sube el hueso
      // para que apoye el lomo y no se entierre)
      if (air < 0.5 && Math.cos(r) < 0.999) P[i].y += (1 - Math.cos(r)) * 0.5 * (0.27 * L - 2 * cyL) * pk * sq;
      this.M[i].compose(P[i], this.Q[i], this.S[i]);
    }
  }

  // Los huesos del modelo, los ojos, la boca y los bigotes.
  drawParts(z, dt, t) {
    if (!this.mesh) return;
    const PO = this.pose;
    const B = this.bones;
    const rest = this.rest;
    for (let i = 0; i < NB; i++) {
      B[i].matrix.copy(this.M[i]);
      B[i].matrixWorld.copy(this.M[i]);
    }
    const M0 = this.M[0];
    // la mandíbula: gira en la bisagra (en el espacio de la cabeza)
    const open = PO.mouth.x * 0.55;
    const jawM = B[NB].matrix;
    jawM.copy(M0).multiply(tmpN.makeTranslation(rest[NB].x - rest[0].x, rest[NB].y - rest[0].y, rest[NB].z - rest[0].z)).multiply(tmpM.makeRotationX(open));
    B[NB].matrixWorld.copy(jawM);
    // las aletas: aletean (más rápido cuanto más apurado)
    const Mk = this.M[FIN_K];
    for (let s = 0; s < 2; s++) {
      const b = B[NB + 1 + s];
      const r = rest[NB + 1 + s];
      const a = (Math.sin(this.finPh + s * 0.4) * 0.45 + 0.15) * (s ? -1 : 1);
      b.matrix.copy(Mk).multiply(tmpN.makeTranslation(r.x - rest[FIN_K].x, r.y - rest[FIN_K].y, r.z - rest[FIN_K].z)).multiply(tmpM.makeRotationZ(a));
      b.matrixWorld.copy(b.matrix);
    }
    // la boca por dentro (en la cabeza) y la lengua (en la mandíbula)
    const hx = HINGE.x * L - rest[0].x;
    const hy = HINGE.y * L - rest[0].y;
    const hz = HINGE.z * L - rest[0].z;
    this.throat.matrix.copy(M0).multiply(tmpN.makeTranslation(0, hy - 0.004 * L, hz + 0.1 * L)).multiply(tmpM.makeScale(0.075 * L, 0.03 * L, 0.11 * L));
    this.throat.matrixWorld.copy(this.throat.matrix);
    this.throat.visible = PO.mouth.x > 0.08;
    const tong = PO.mouth.x > 0.25 || z.state === 'dead';
    this.tongue.visible = tong;
    if (tong) {
      const out = z.state === 'dead' || (z.state === 'stunned' && z.dizzy) ? 0.07 * L : 0;
      this.tongue.matrix.copy(jawM).multiply(tmpN.makeTranslation(0, -0.012 * L, 0.12 * L + out)).multiply(tmpM.makeRotationX(out ? 0.5 : 0)).multiply(tmpM.makeScale(0.045 * L, 0.014 * L, 0.08 * L));
      this.tongue.matrixWorld.copy(this.tongue.matrix);
    }
    void hx;
    // la pava en la boca (la del Pack-a-Pava), agarrada de la manija
    const PM = this.pavaMouth;
    PM.visible = !!this.hasPava;
    if (PM.visible) {
      PM.matrix.copy(jawM).multiply(tmpN.makeTranslation(0, -0.01 * L, 0.21 * L)).multiply(tmpM.makeRotationX(1.25));
      PM.matrixWorld.copy(PM.matrix);
    }
    this.drawEyes(z, dt, t);
    this.drawWhiskers(z, dt, jawM);
    if (this.mat) {
      // colorado en el berrinche
      const red = z.state === 'enrage' ? 0.35 + Math.sin(t * 18) * 0.15 : 0;
      this.mat.emissive.setRGB(red, 0, 0);
    }
  }

  drawEyes(z, dt, t) {
    const PO = this.pose;
    const M0 = this.M[0];
    const rest = this.rest[0];
    const st = z.state;
    const dead = st === 'dead';
    const spinEyes = st === 'stunned' || st === 'reel';
    // la aceleración de la cabeza mueve las pupilas (resorte)
    const hp = this.P[0];
    this.hv ||= new THREE.Vector3();
    this.hlast ||= hp.clone();
    tmpV.subVectors(hp, this.hlast).divideScalar(Math.max(dt, 1e-3));
    const acc = tmpW.subVectors(tmpV, this.hv);
    this.hv.copy(tmpV);
    this.hlast.copy(hp);
    for (const E of this.eyes) {
      const s = PO.eye.x;
      const off = E.c;
      // saltones: un poco afuera y arriba de los dibujados
      tmpS.set(off.x * L - rest.x + E.side * 0.012 * L, off.y * L - rest.y + 0.012 * L, off.z * L - rest.z);
      E.o.matrix.copy(M0).multiply(tmpN.makeTranslation(tmpS.x, tmpS.y, tmpS.z)).multiply(tmpM.makeScale(s, s, s));
      E.o.matrixWorld.copy(E.o.matrix);
      // la pupila: hacia adelante y afuera; se sacude con los golpes
      const gx = -acc.x * 0.0009 * E.side;
      const gy = -acc.y * 0.0012;
      E.gv.x += (gx - E.g.x * 30) * dt - E.gv.x * 6 * dt;
      E.gv.y += (gy - E.g.y * 30) * dt - E.gv.y * 6 * dt;
      E.g.x = clamp(E.g.x + E.gv.x * dt * 8, -0.6, 0.6);
      E.g.y = clamp(E.g.y + E.gv.y * dt * 8, -0.6, 0.6);
      let ux = 0.35 * E.side + E.g.x;
      let uy = 0.1 + E.g.y;
      if (spinEyes) {
        ux = Math.cos(t * 9 * E.side) * 0.55;
        uy = Math.sin(t * 9 * E.side) * 0.55;
      }
      const R = EYE_R * L;
      const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
      E.pupil.position.set(ux * R * 0.8, uy * R * 0.8, uz * R * 0.72);
      E.pupil.visible = !dead;
      E.X.visible = dead;
      E.X.position.set(0, 0, R * 0.95);
    }
  }

  // Los bigotes: cuerdas (verlet) con algo de rigidez hacia su dirección.
  drawWhiskers(z, dt, jawM) {
    const M0 = this.M[0];
    const rest = this.rest[0];
    const restJ = this.rest[NB];
    const IM = this.whiskMesh;
    const h = Math.min(dt, 1 / 30);
    let n = 0;
    const lash = z.state === 'charge' || (z.state === 'intro' && this.stT > BUB && this.stT < LAND) ? 1 : 0;
    // el latigazo del jefe de ronda: los dos largos se estiran adelante (y la cadena sale de la boca)
    const whip = 0;
    for (const W of this.whisk) {
      const Mb = W.jaw ? jawM : M0;
      const r = W.jaw ? restJ : rest;
      const root = tmpV.set(W.local.x - r.x, W.local.y - r.y, W.local.z - r.z).applyMatrix4(Mb);
      const wk = W.jaw ? 0 : whip;
      const dirW = tmpW.set(W.ldir.x * (1 - wk), W.ldir.y * (1 - wk), W.ldir.z + (1 - W.ldir.z) * wk).normalize().transformDirection(Mb);
      const seg = W.seg * (1 + wk * 1.2);
      if (!W.init) {
        W.init = true;
        for (let k = 0; k < W.n; k++) {
          W.p[k].copy(root).addScaledVector(dirW, W.seg * k);
          W.o[k].copy(W.p[k]);
        }
      }
      W.p[0].copy(root);
      W.o[0].copy(root);
      for (let k = 1; k < W.n; k++) {
        const p = W.p[k];
        const o = W.o[k];
        const vx = (p.x - o.x) * 0.9;
        const vy = (p.y - o.y) * 0.9;
        const vz = (p.z - o.z) * 0.9;
        o.copy(p);
        p.x += vx;
        p.y += vy - 4 * h * h * (1 - lash);
        p.z += vz;
        // la rigidez: hacia donde apunta desde la raíz
        tmpU.copy(root).addScaledVector(dirW, seg * k);
        p.lerp(tmpU, Math.min(1, h * (W.jaw ? 9 : 5.5 + wk * 20)));
      }
      for (let it = 0; it < 2; it++) {
        for (let k = 1; k < W.n; k++) {
          const a = W.p[k - 1];
          const b = W.p[k];
          tmpU.subVectors(b, a);
          const d = tmpU.length() || 1e-6;
          b.copy(a).addScaledVector(tmpU, seg / d);
        }
      }
      for (let k = 1; k < W.n; k++) {
        const a = W.p[k - 1];
        const b = W.p[k];
        tmpU.subVectors(b, a);
        const d = tmpU.length() || 1e-6;
        tmpQ.setFromUnitVectors(UP, tmpU.divideScalar(d));
        const rr = W.r * L * (1 - (k / W.n) * 0.6);
        IM.setMatrixAt(n++, tmpM.compose(a, tmpQ, tmpS.set(rr, d, rr)));
      }
    }
    IM.instanceMatrix.needsUpdate = true;
  }

  // ---------------- los tiros ----------------
  // Esferas a lo largo del cuerpo; la cabeza (los dos primeros) es 'head'.
  hitTest(o, d, maxT) {
    const z = this.boss;
    if (this.mode === 'old' && this.old) return this.old.hitTest(o, d, maxT);
    if (!z || z.dead || this.hidden) return null;
    let best = null;
    for (let j = 0; j < NB; j++) {
      const c = this.P[j];
      const r = RAD(j / (NB - 1)) * Math.max(this.S[j].x, 1) * 1.05;
      tmpV.subVectors(c, o);
      const along = tmpV.dot(d);
      if (along < 0 || along > maxT) continue;
      const perp2 = tmpV.lengthSq() - along * along;
      if (perp2 > r * r) continue;
      const tt = along - Math.sqrt(r * r - perp2);
      if (!best || tt < best.t) best = { z, t: Math.max(0, tt), zone: j <= 1 ? 'head' : 'torso' };
    }
    return best;
  }

  // la punta de la boca (en el mundo)
  mouthPos(out) {
    return out.set(0, (HINGE.y - CY) * L, (0.5 - Z0) * L).applyMatrix4(this.M[0]);
  }

  // ---------------- lo de alrededor ----------------
  spitRings() {
    const g = this.g;
    this.spitRingsM ||= [];
    this.spitRingsM.forEach((m) => (m.visible = false));
    this.spits.forEach((p, i) => {
      let m = this.spitRingsM[i];
      if (!m) {
        m = new THREE.Mesh(this.ringGeo, this.ringMat);
        m.renderOrder = 3;
        g.scene.add(m);
        this.spitRingsM[i] = m;
      }
      m.position.set(p.x, p.y + 0.04, p.z);
      m.scale.setScalar(SPIT_R);
      m.visible = true;
      m.userData.t = 0;
    });
  }

  launchBall(i) {
    const g = this.g;
    const E = this.spits[i];
    if (!E) return;
    const S = this.mouthPos(new THREE.Vector3());
    let m = this.balls.find((b) => !b.on);
    if (!m) {
      m = { mesh: new THREE.Mesh(this.ballGeo, this.ballMat), on: false };
      m.mesh.castShadow = true;
      g.scene.add(m.mesh);
      this.balls.push(m);
    }
    m.on = true;
    m.S = S;
    m.E = E.clone();
    m.t = 0;
    m.i = i;
    m.mesh.visible = true;
    this.sfxPtui(S);
  }

  addMoj(id, at) {
    const g = this.g;
    if (this.mojs.some((m) => m.id === id)) return;
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(this.mojGeo[0], this.mojMat), new THREE.Mesh(this.mojGeo[1], this.mojMat));
    grp.scale.setScalar(1.6);
    g.scene.add(grp);
    const S = this.cur ? this.mouthPos(new THREE.Vector3()) : at.clone();
    this.mojs.push({ id, grp, S, E: at.clone(), t: 0, life: MOJ_LIFE, ph: Math.random() * 6, yaw: Math.random() * 6 });
  }

  removeMoj(id) {
    const i = this.mojs.findIndex((m) => m.id === id);
    if (i < 0) return;
    const m = this.mojs[i];
    m.grp.removeFromParent();
    this.mojs.splice(i, 1);
  }

  updateFx(dt, z) {
    const g = this.g;
    const t = g.time || 0;
    const st = z?.state;
    const T = this.stT;
    // la sombra enorme abajo del agua (la salida)
    const I = this.intro;
    const deep = this.deep;
    if (z && st === 'intro' && I && T < BUB + 0.2 && !I.drain) {
      deep.visible = true;
      const k = Math.min(1, T / BUB);
      const a = t * 1.8;
      deep.position.set(I.W.x + Math.cos(a) * 2.2 * (1 - k), I.W.y + 0.06, I.W.z + Math.sin(a) * 2.2 * (1 - k));
      deep.rotation.y = -a + Math.PI / 2;
      deep.material.opacity = 0.55 * Math.min(1, T * 1.5) * (T > BUB ? 0 : 1);
      deep.scale.set(1.3 * (0.6 + k * 0.5), 1, 4.2 * (0.6 + k * 0.5));
    } else deep.visible = false;
    // la sombra del panzazo
    const SH = this.shadow;
    const pz = z && (st === 'chargeWind' || st === 'charge') && this.shadowAt;
    if (pz) {
      SH.grp.visible = true;
      SH.grp.position.set(this.shadowAt.x, this.shadowAt.y + 0.04, this.shadowAt.z);
      const k = st === 'charge' ? Math.min(1, T / (this.fly?.dur || 1)) : 0;
      const grow = st === 'chargeWind' ? Math.min(1, T / 0.4) : 1;
      SH.grp.scale.setScalar(PZ_R * (0.5 + 0.5 * grow) * (st === 'charge' ? 1.1 - 0.15 * k : 1));
      SH.disc.material.opacity = 0.25 + 0.35 * k;
      SH.ring.material.opacity = 0.55 + Math.sin(t * 14) * 0.3;
    } else SH.grp.visible = false;
    // el carril de la rodada
    const LM = this.laneM;
    if (z && (st === 'aim' || st === 'shoot') && this.lane) {
      const Ln = this.lane;
      LM.visible = true;
      LM.position.set(Ln.S.x, Ln.S.y + 0.05, Ln.S.z);
      LM.rotation.y = Math.atan2(Ln.d.x, Ln.d.y);
      LM.scale.set(3.4, 1, Ln.len);
      LM.material.opacity = st === 'aim' ? Math.min(0.45, T * 0.6) * (0.75 + Math.sin(t * 12) * 0.25) : Math.max(0, 0.35 - T * 0.3);
    } else LM.visible = false;
    // los círculos de las bolas
    for (const m of this.spitRingsM || []) {
      if (!m.visible) continue;
      m.userData.t += dt;
      const on = z && (st === 'whipWind' || st === 'whip');
      if (!on && m.userData.t > 0.2 && !this.balls.some((b) => b.on)) m.visible = false;
      m.material.opacity = 0.5 + Math.sin(t * 12) * 0.3;
    }
    // las bolas de agua en el aire
    for (const B of this.balls) {
      if (!B.on) continue;
      B.t += dt;
      const k = Math.min(1, B.t / SPIT_FLY);
      arc(B.S, B.E, 3.2, k, B.mesh.position);
      B.mesh.rotation.x += dt * 8;
      if (Math.random() < 0.4) g.fx.alpha.spawn(B.mesh.position.x, B.mesh.position.y, B.mesh.position.z, 0, 0, 0, { color: [0.6, 0.8, 1], size: 0.1, size1: 0.02, life: 0.4, alpha: 0.5, gravity: 4 });
      if (k >= 1) {
        B.on = false;
        B.mesh.visible = false;
        const R = this.spitRingsM?.[B.i];
        if (R) R.visible = false;
        this.splashAt(B.E, 1.2);
        // (el anfitrión pega; cada uno se empuja a sí mismo)
        if (isHost(g)) this.hurtAround(B.E, SPIT_R, SPIT_DMG * this.dmgK(this.boss), 0);
        this.pushMe(B.E, SPIT_R, 5, 2.5);
      }
    }
    // las mojarritas: saltan en el piso; el que pasa por encima se cura
    for (let i = this.mojs.length - 1; i >= 0; i--) {
      const m = this.mojs[i];
      m.t += dt;
      m.life -= dt;
      const G = m.grp;
      if (m.t < 0.7) {
        arc(m.S, m.E, 2.5, m.t / 0.7, G.position);
        G.rotation.set(m.t * 9, m.yaw, 0);
      } else {
        // los coletazos en el piso
        m.ph += dt * 9;
        const f = Math.abs(Math.sin(m.ph));
        G.position.set(m.E.x, m.E.y + 0.12 + f * 0.35, m.E.z);
        G.rotation.set(0, m.yaw + Math.sin(m.ph * 0.5) * 0.6, Math.PI / 2 + Math.sin(m.ph) * 0.9);
        const me = g.player;
        if (me.alive && !me.downed && Math.hypot(me.pos.x - m.E.x, me.pos.z - m.E.z) < 1.1 && Math.abs(me.pos.y - m.E.y) < 1.5) {
          this.eatMoj(m);
          continue;
        }
      }
      if (m.life <= 0) this.removeMoj(m.id);
    }
    // la pava que escupe
    const PF = this.pavaFly;
    if (PF) {
      PF.t += dt;
      const k = Math.min(1, PF.t / 0.85);
      this.pavaM.visible = k < 1;
      arc(PF.S, PF.E, 3.5, k, this.pavaM.position);
      this.pavaM.rotation.set(PF.t * 10, 0, PF.t * 6);
      if (k >= 1) this.pavaFly = null;
    }
    // la carne de lo que flota sobre el agua: gotas al salir del agua
    if (z && (st === 'intro' && T > BUB && T < BUB + 0.4)) this.drip(6);
  }

  eatMoj(m) {
    const g = this.g;
    const P = g.player;
    P.health = Math.min(P.maxHealth, P.health + MOJ_HEAL);
    g.hud.hurt?.(1 - P.health / P.maxHealth);
    g.audio.powerupGrab?.();
    g.hud.toast?.(`¡Mojarrita! +${MOJ_HEAL} de vida`);
    g.fx.sparkle(tmpV.set(m.E.x, m.E.y + 0.5, m.E.z), [0.7, 0.95, 1], 10, 0.6);
    const id = m.id;
    this.removeMoj(id);
    if (isHost(g)) this.send({ a: 'eat', id });
    else g.net?.net.send({ t: 'pee', k: 'srb', a: 'eat', id });
  }

  // Cada uno se empuja a sí mismo (el golpe lo manda el anfitrión).
  pushMe(at, r, push, up) {
    const g = this.g;
    const P = g.player;
    if (!P.alive || P.downed || g.godMode === 'off') return;
    const dx = P.pos.x - at.x;
    const dz = P.pos.z - at.z;
    const d = Math.hypot(dx, dz);
    if (d > r || Math.abs(P.pos.y - at.y) > 2.5) return;
    P.vel.x += (dx / (d || 1)) * push;
    P.vel.z += (dz / (d || 1)) * push;
    P.vel.y = Math.max(P.vel.y, up);
    P.onGround = false;
  }

  // La caída de un panzazo: temblor, polvo y agua, el golpe y el empujón.
  landFx(at, k) {
    const g = this.g;
    const d = Math.hypot(g.player.pos.x - at.x, g.player.pos.z - at.z);
    g.fx.addShake((0.25 + 0.35 * k) * Math.max(0, 1 - d / 26));
    g.audio.bossSlam?.(tmpV.copy(at).setY(at.y + 0.5));
    g.fx.dust(tmpV.copy(at).setY(at.y + 0.1), { x: 0, y: 1, z: 0 }, [0.55, 0.52, 0.48], Math.round(30 * k));
    for (let i = 0; i < 26 * k; i++) {
      const a = (i / (26 * k)) * Math.PI * 2;
      g.fx.alpha.spawn(at.x + Math.cos(a) * 1.5, at.y + 0.15, at.z + Math.sin(a) * 1.5, Math.cos(a) * 6, 1.5 + Math.random() * 2, Math.sin(a) * 6, { color: [0.75, 0.82, 0.9], size: 0.25, size1: 0.9, life: 0.7, alpha: 0.35, drag: 2.5, gravity: 2 });
    }
    this.splashAt(at, 1.6 * k);
    this.pushMe(at, PZ_R + 0.6, 7 * k, 5 * k);
  }

  thud(at, k) {
    const g = this.g;
    const A = g.audio;
    const d = Math.hypot(g.player.pos.x - at.x, g.player.pos.z - at.z);
    if (d < 18) g.fx.addShake(0.08 * k * (1 - d / 18));
    if (!A?.ctx || d > 40) return;
    const o = A.out({ pos: tmpV.copy(at).setY((at.y || 0) + 0.5), gain: 0.6 + k * 0.4, reverb: 0.3, ref: 5 });
    A.tone(o, { t: A.now, dur: 0.18, type: 'sine', freq: 95, freqEnd: 45, gain: 0.5 * k + 0.2 });
    A.noise(o, { t: A.now, dur: 0.12, type: 'lowpass', freq: 600, gain: 0.35 * k + 0.1 });
    // el chasquido mojado de la panza
    A.noise(o, { t: A.now + 0.01, dur: 0.08, type: 'bandpass', freq: 1800, q: 2, gain: 0.18 });
  }

  bubble(at, k) {
    const g = this.g;
    const x = at.x + (Math.random() - 0.5) * k;
    const z = at.z + (Math.random() - 0.5) * k;
    const y = (this.intro?.drain ? (this.intro.E.y || at.y) : at.y) + 0.05;
    g.fx.alpha.spawn(x, y, z, 0, 0.8 + Math.random(), 0, { color: [0.85, 0.92, 1], size: 0.12, size1: 0.3, life: 0.5, alpha: 0.6, drag: 1 });
    if (Math.random() < 0.15) g.water?.splash?.(x, z, 0.35, { sound: false });
    const A = g.audio;
    if (A?.ctx && Math.random() < 0.3) {
      const o = A.out({ pos: tmpV.set(x, y, z), gain: 0.5, reverb: 0.3, ref: 6 });
      const f = 220 + Math.random() * 500;
      A.tone(o, { t: A.now, dur: 0.07, type: 'sine', freq: f, freqEnd: f * 2.2, gain: 0.12 });
    }
  }

  bigSplash(at, k) {
    const g = this.g;
    if (g.water?.depthAt?.(at.x, at.z) > 0.05) g.water.splash(at.x, at.z, k);
    else this.splashAt(at, k);
    // la columna de agua
    for (let i = 0; i < 60 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      g.fx.alpha.spawn(at.x + Math.cos(a) * r, (at.y || 0) + 0.2, at.z + Math.sin(a) * r, Math.cos(a) * 1.5, 7 + Math.random() * 6, Math.sin(a) * 1.5, { color: [0.78, 0.86, 0.95], size: 0.22 + Math.random() * 0.2, size1: 0.06, life: 1.0 + Math.random() * 0.6, alpha: 0.6, gravity: 9.8, drag: 0.2 });
    }
  }

  splashAt(at, k) {
    const g = this.g;
    if (g.water?.depthAt?.(at.x, at.z) > 0.05) {
      g.water.splash(at.x, at.z, k);
      return;
    }
    for (let i = 0; i < 18 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      g.fx.alpha.spawn(at.x, (at.y || 0) + 0.15, at.z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, { color: [0.7, 0.82, 0.95], size: 0.08, size1: 0.03, life: 0.6, alpha: 0.7, gravity: 9.8 });
    }
    const A = g.audio;
    if (A?.ctx) {
      const o = A.out({ pos: tmpV.copy(at), gain: 0.7, reverb: 0.25 });
      A.noise(o, { dur: 0.3 + k * 0.2, freq: 1400, freqEnd: 300, gain: 0.6, attack: 0.004 });
    }
  }

  // gotas que se le caen al saltar
  drip(n = 1) {
    const g = this.g;
    for (let i = 0; i < n; i++) {
      const p = this.P[Math.floor(Math.random() * NB)];
      g.fx.alpha.spawn(p.x + (Math.random() - 0.5) * 1.5, p.y, p.z + (Math.random() - 0.5) * 1.5, 0, -1, 0, { color: [0.75, 0.85, 0.95], size: 0.07, size1: 0.03, life: 0.7, alpha: 0.7, gravity: 9.8 });
    }
  }

  // ---------------- los ruidos (sintetizados) ----------------
  sfxRumble(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 1, reverb: 0.5, ref: 12 });
    A.noise(o, { t: A.now, dur: BUB + 0.2, type: 'lowpass', freq: 160, freqEnd: 320, gain: 0.7, attack: 1.2, brown: true });
    A.tone(o, { t: A.now, dur: BUB, type: 'sine', freq: 38, freqEnd: 55, gain: 0.35 });
  }

  sfxBlub(at, k = 1) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 0.8 * k, reverb: 0.4, ref: 6 });
    for (let i = 0; i < 3; i++) A.tone(o, { t: A.now + i * 0.13, dur: 0.12, type: 'sine', freq: 140 + i * 30, freqEnd: 320 + i * 40, gain: 0.35 });
  }

  sfxInflate(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 0.9, reverb: 0.3, ref: 6 });
    A.tone(o, { t: A.now, dur: ROLL_WIND, type: 'triangle', freq: 120, freqEnd: 520, gain: 0.18 });
    A.noise(o, { t: A.now, dur: ROLL_WIND, type: 'bandpass', freq: 900, freqEnd: 2600, q: 3, gain: 0.2, attack: 0.3 });
  }

  sfxPfff(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 1, reverb: 0.2, ref: 6 });
    A.noise(o, { t: A.now, dur: REEL_T, type: 'bandpass', freq: 3200, freqEnd: 900, q: 1.5, gain: 0.45, attack: 0.02 });
    A.tone(o, { t: A.now, dur: REEL_T, type: 'sawtooth', freq: 520, freqEnd: 120, gain: 0.05 });
  }

  sfxBonk(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 1, reverb: 0.4, ref: 6 });
    A.tone(o, { t: A.now, dur: 0.35, type: 'square', freq: 220, freqEnd: 90, gain: 0.12 });
    for (let i = 0; i < 4; i++) A.tone(o, { t: A.now + 0.25 + i * 0.12, dur: 0.1, type: 'sine', freq: 1800 + i * 300, gain: 0.05 });
  }

  sfxPtui(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 0.9, reverb: 0.3, ref: 6 });
    A.noise(o, { t: A.now, dur: 0.12, type: 'bandpass', freq: 2200, q: 2, gain: 0.4 });
    A.tone(o, { t: A.now, dur: 0.1, type: 'sine', freq: 380, freqEnd: 180, gain: 0.25 });
  }

  sfxBurp(at, k) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 1, reverb: 0.4, ref: 7 });
    A.tone(o, { t: A.now, dur: 0.5 * k + 0.2, type: 'sawtooth', freq: 70, freqEnd: 52, gain: 0.25 });
    A.noise(o, { t: A.now, dur: 0.5 * k + 0.2, type: 'lowpass', freq: 400, gain: 0.3 });
  }

  sfxWhoosh(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(at), gain: 1, reverb: 0.2, ref: 6 });
    A.noise(o, { t: A.now, dur: 0.4, type: 'bandpass', freq: 600, freqEnd: 2200, q: 1.2, gain: 0.5, attack: 0.05 });
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.shadow.grp.removeFromParent();
    this.deep.removeFromParent();
    this.laneM.removeFromParent();
    this.pavaM.removeFromParent();
    for (const m of this.spitRingsM || []) m.removeFromParent();
    for (const b of this.balls) b.mesh.removeFromParent();
    for (const m of this.mojs) m.grp.removeFromParent();
    this.mesh?.geometry.dispose();
  }
}
