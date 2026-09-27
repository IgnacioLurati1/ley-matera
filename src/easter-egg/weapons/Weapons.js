import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS, weaponStats, tierOf, maxTier, KNIFE, GRENADE, BOWIE } from '../config/weapons';
import { buildMate, buildTermo, buildKnife, buildGrenade, buildWhetstone, buildMk3Cell, muzzleTexture, getMats, VM_POSE } from './viewmodels';
import Elementales from './Elementales';
import Especiales from './Especiales';
import Facon from './Facon';
import Potenciadores from './Potenciadores';
import Liquidificador from './Liquidificador';
import Supernova from './Supernova';
import { memeFx } from './memeMate';
import { buildPerkMateFor, PERK_MATE_IDS } from './perkMates';
import Mk3Fx from './mk3Fx';
import { PERKS } from '../config/perks';
import { startMate } from '../core/eggs';
import { cherryReady, cherryShock } from './electricCherry';

// Armas: inventario, disparo (balas, proyectiles, rayos en cadena, conos),
// recarga (= cebar con el termo), cuchillo, granadas, pava silbadora y todas
// las animaciones de la vista en primera persona.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
// (el rayo del Mark III contra los remolinos: `fwd` del disparo ya es tmpV)
const tmpHole = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpV3 = new THREE.Vector3();
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const DRINK_DIP = 0.2;
const DRINK_DIR = new THREE.Vector3(-0.55, 0.25, 0.8).normalize();
const DRINK_MOUTH = new THREE.Vector3(0.0, -0.078, -0.07);
const hitTmp = {};
const HIP = new THREE.Vector3(0.19, -0.17, -0.4);
const ADS = new THREE.Vector3(0.0, -0.1, -0.29);
const SPRINT = new THREE.Vector3(0.12, -0.24, -0.32);
// corriendo con un mate en cada mano: cada uno a su costado, bajos, y los
// brazos van y vienen al paso
const SPRINT_AKIMBO = new THREE.Vector3(0.21, -0.18, -0.36);
// tramos del arco entre las bombillas del Mark III al recargar
const ARC_N = 9;
// inspeccionar: el mate se acerca al centro para mirarlo de cerca
const INSPECT = new THREE.Vector3(0.04, -0.11, -0.3);
// bombillas de la Gut clavadas a la vez
const STUCK_MAX = 64;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);

// El charco de la Bombilla Ácida (un plano de 2x2: el borde lo recorta el shader).
function acidPoolMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uA: { value: 1 }, uSeed: { value: 0 } }]),
    vertexShader: `varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float uT; uniform float uA; uniform float uSeed;
varying vec2 vUv;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vUv;
  float r = length(p);
  vec2 dir = p / max(r, 1e-3);
  // borde irregular (lóbulos) que respira un poco
  float edge = 0.7 + 0.2 * noise(dir * 1.8 + uSeed * 7.0) + 0.07 * noise(dir * 4.5 - uSeed * 3.0 + uT * 0.6);
  if (r > edge) discard;
  float k = r / edge;
  // el líquido: verde oscuro con remolinos más claros que se mueven
  vec2 q = p * 2.6 + uSeed;
  float w = noise(q + vec2(uT * 0.22, -uT * 0.17) + 1.4 * noise(q * 1.7 - uT * 0.3));
  vec3 col = mix(vec3(0.02, 0.1, 0.01), vec3(0.22, 0.7, 0.03), smoothstep(0.3, 0.9, w) * 0.8);
  // más hondo y oscuro al medio, espuma lima en la orilla
  col *= 0.7 + 0.3 * k;
  float rim = smoothstep(0.86, 0.98, k);
  col = mix(col, vec3(0.42, 0.95, 0.1), rim * 0.7);
  // burbujas: anillitos que crecen y revientan
  vec2 c = p * 6.0 + uSeed * 5.0;
  vec2 ci = floor(c);
  vec2 cf = fract(c) - 0.5;
  float rnd = hash(ci);
  float life = fract(uT * (0.5 + rnd * 0.8) + rnd * 9.0);
  vec2 off = (vec2(hash(ci + 3.1), hash(ci + 5.7)) - 0.5) * 0.4;
  float bd = length(cf - off);
  float br = 0.05 + 0.25 * life;
  float ring = smoothstep(br + 0.04, br, bd) * smoothstep(br - 0.07, br - 0.02, bd);
  col += vec3(0.45, 1.0, 0.15) * ring * step(0.45, rnd) * (1.0 - life) * (1.0 - k) * 0.9;
  // brilla un poco de adentro (se ve de noche) y se hace más transparente en la orilla
  col += vec3(0.04, 0.16, 0.01) * (1.0 - k);
  float a = uA * (0.84 - 0.3 * smoothstep(0.85, 1.0, k));
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// La hoz: poses que se suman a la de la cadera [x, y, z, rx, ry, rz, muñeca].
// Cada golpe son claves [k, pose, curva] (k: fracción del golpe; curvas: 'io'
// suave, 'i' arranca lento y acelera, 'o' sale rápido y frena). cut: cuando
// arranca el tajo (ruido y sacudón), hit: cuando corta, trail: la estela.
const HOZ_REST = [0, 0, 0, 0, 0, 0, 0];
const HOZ_MOVES = {
  // derecho: cargada arriba a la derecha, cruza en diagonal hacia abajo a la izquierda
  fore: {
    cut: 0.26,
    hit: 0.4,
    trail: [0.27, 0.58],
    kick: [0.012, -0.022],
    keys: [
      [0, HOZ_REST],
      [0.26, [0.1, 0.06, 0.03, 0.25, 0.5, -0.65, -0.35], 'io'],
      [0.36, [-0.08, 0, -0.08, -0.25, 0.1, 0.45, 0.2], 'i'],
      [0.47, [-0.3, -0.1, -0.12, -0.6, 0, 1.3, 0.6], 'o'],
      [0.6, [-0.34, -0.12, -0.11, -0.7, -0.05, 1.45, 0.7], 'o'],
      [1, HOZ_REST, 'io'],
    ],
  },
  // revés: con la muñeca dada vuelta desde la izquierda, barre hacia la derecha
  back: {
    cut: 0.26,
    hit: 0.4,
    trail: [0.27, 0.58],
    kick: [0.01, 0.024],
    keys: [
      [0, HOZ_REST],
      [0.26, [-0.22, -0.02, -0.02, -0.2, -0.3, 1.05, 1.2], 'io'],
      [0.36, [-0.04, -0.04, -0.1, -0.45, 0, 0.2, 0.95], 'i'],
      [0.47, [0.06, -0.04, -0.09, -0.4, 0.15, -0.25, 0.7], 'o'],
      [0.6, [0.08, -0.05, -0.08, -0.4, 0.2, -0.35, 0.6], 'o'],
      [1, HOZ_REST, 'io'],
    ],
  },
  // de arriba (el tercero seguido): la levanta y la baja de golpe
  over: {
    cut: 0.3,
    hit: 0.44,
    trail: [0.31, 0.62],
    kick: [-0.03, 0.004],
    keys: [
      [0, HOZ_REST],
      [0.3, [0.04, 0.1, 0, 0.45, 0.15, -0.25, -0.2], 'io'],
      [0.4, [-0.04, 0.02, -0.12, -0.3, 0.1, 0.1, 0], 'i'],
      [0.5, [-0.08, -0.14, -0.1, -1.1, 0.1, 0.3, 0.2], 'o'],
      [0.62, [-0.09, -0.16, -0.09, -1.2, 0.1, 0.32, 0.22], 'o'],
      [1, HOZ_REST, 'io'],
    ],
  },
  // la medialuna de la Hoz de la Muerte: la carga atrás, brilla y la larga hacia adelante
  toss: {
    cut: 0.3,
    hit: 0.4,
    trail: [0.31, 0.56],
    kick: [0.02, 0],
    keys: [
      [0, HOZ_REST],
      [0.3, [0.06, 0.1, 0.05, 0.4, 0.4, -0.5, -0.5], 'io'],
      [0.4, [-0.02, 0.03, -0.12, -0.3, 0.1, 0.1, 0], 'i'],
      [0.5, [-0.12, -0.02, -0.18, -0.6, 0, 0.45, 0.3], 'o'],
      [1, HOZ_REST, 'io'],
    ],
  },
};
const HOZ_COMBO = ['fore', 'back', 'over'];
// La faka: pose absoluta del cuchillo [x, y, z, rx, ry, rz, -] en cada clave
// (mismas curvas que la hoz). Toma envión, corta rápido, acompaña y se va.
// Tajo y revés se van turnando; si hay que tirarse encima del zombie, puñalada.
const KNIFE_MOVES = {
  // tajo: cargado arriba a la derecha, cruza hacia la izquierda y abajo
  tajo: {
    trail: [0.3, 0.54],
    kick: [0.006, -0.014],
    keys: [
      [0, [0.24, -0.26, -0.34, -0.7, 0.3, -0.3, 0]],
      [0.24, [0.26, -0.06, -0.32, -0.55, 0.35, -0.7, 0], 'io'],
      [0.38, [0.04, -0.1, -0.44, -1.1, 0.2, 0.5, 0], 'i'],
      [0.52, [-0.2, -0.17, -0.34, -0.85, 0.1, 1.0, 0], 'o'],
      [0.66, [-0.22, -0.18, -0.33, -0.82, 0.1, 1.05, 0], 'o'],
      [1, [-0.1, -0.34, -0.3, -0.6, 0.1, 0.8, 0], 'io'],
    ],
  },
  // revés: cargado a la izquierda, vuelve cruzando hacia la derecha
  reves: {
    trail: [0.3, 0.54],
    kick: [0.006, 0.014],
    keys: [
      [0, [-0.14, -0.3, -0.32, -0.6, 0.1, 0.8, 0]],
      [0.24, [-0.24, -0.08, -0.3, -0.5, 0.1, 1.0, 0], 'io'],
      [0.38, [0.02, -0.09, -0.44, -1.05, 0.2, 0.1, 0], 'i'],
      [0.52, [0.24, -0.06, -0.36, -0.8, 0.3, -0.9, 0], 'o'],
      [0.66, [0.25, -0.07, -0.35, -0.78, 0.3, -0.95, 0], 'o'],
      [1, [0.24, -0.28, -0.32, -0.7, 0.3, -0.4, 0], 'io'],
    ],
  },
  // puñalada: la echa atrás con la punta al frente y la clava
  stab: {
    trail: [0.28, 0.42],
    kick: [0.014, 0],
    keys: [
      [0, [0.2, -0.28, -0.3, -0.9, 0.25, -0.1, 0]],
      [0.24, [0.16, -0.14, -0.26, -1.25, 0.25, 0.1, 0], 'io'],
      [0.36, [0.06, -0.09, -0.56, -1.4, 0.2, 0.15, 0], 'o'],
      [0.52, [0.07, -0.1, -0.53, -1.38, 0.2, 0.15, 0], 'o'],
      [1, [0.2, -0.28, -0.3, -0.9, 0.25, -0.1, 0], 'io'],
    ],
  },
};
const KP = [0, 0, 0, 0, 0, 0, 0];
// afilar: la hoja de costado con el filo hacia abajo, para que llegue la piedra
const HOZ_SHARPEN = [-0.02, 0.12, 0, -0.6, 0.2, 1.3, 2.4];
// inspeccionar la hoz: más lejos que un mate (la hoja es grande)
const INSPECT_HOZ = new THREE.Vector3(0.1, -0.12, -0.42);
// la Bombilla Gut al inspeccionar: un poco más lejos (es larga) y la vuelta dura esto
const INSPECT_GUT = new THREE.Vector3(0.1, -0.1, -0.5);
const GUT_INSPECT = 6.4;
// la piedra entra y se va por abajo a la izquierda; apunta hacia arriba y a la derecha
const WHET_OFF = new THREE.Vector3(-0.3, -0.36, -0.22);
const WHET_AXIS = new THREE.Vector3(0.4, 0.88, -0.25).normalize();
const HZ = [0, 0, 0, 0, 0, 0, 0];
// estela: muestras (punta y mitad de la hoja) suavizadas con Catmull-Rom
const TRAIL_MAX = 12;
const TRAIL_SUB = 4;
const TRAIL_LIFE = 0.12;
const TRAIL_STEEL = new THREE.Color(0xcfd6e2).multiplyScalar(0.45);
// la de la faka: más finita y tenue (es una hoja chica)
const TRAIL_KNIFE = new THREE.Color(0xcfd6e2).multiplyScalar(0.2);
const TRAIL_DEATH = new THREE.Color(0x6affb8).multiplyScalar(1.1);
const TRAIL_FACON = new THREE.Color(0x2f7cff).multiplyScalar(0.95);

export default class Weapons {
  constructor(game) {
    this.g = game;
    const T = game.textures;
    this.T = T;
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight(0x9aa8c8, 0x302418, 1.4);
    this.vmScene.add(this.vmHemi);
    this.vmKey = new THREE.DirectionalLight(0xffe2c0, 1.4);
    this.vmKey.position.set(0.6, 1, 0.4);
    this.vmScene.add(this.vmKey);
    this.vmFlash = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.vmScene.add(this.vmFlash);
    this.vmRoot = new THREE.Group();
    // reflejos para que los metales (virolas, bombillas) brillen
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    // (los paneles de luz de la sala, de 17 a 100, se reflejaban en las
    // virolas lisas como manchitas blancas que el bloom hacía encandilar)
    const room = new RoomEnvironment();
    room.traverse((o) => {
      if (o.material?.emissiveIntensity > 8) o.material.emissiveIntensity = 8;
    });
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
    this.vmScene.environment = this.envMap;
    this.vmScene.environmentIntensity = 0.4;
    this.vmScene.add(this.vmRoot);
    this.holder = new THREE.Group();
    this.vmRoot.add(this.holder);
    // mano izquierda de los mates akimbo (espejada)
    this.holder2 = new THREE.Group();
    this.vmRoot.add(this.holder2);
    this.side = 0;
    this.kickL = 0;
    // recarga "cambiar la yerba": la yerba lavada que cae al volcar
    this.crumbs = [];
    const crumbMat = new THREE.SpriteMaterial({ map: T.dot, color: 0x6f7c30, transparent: true, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(crumbMat.clone());
      s.visible = false;
      this.vmRoot.add(s);
      this.crumbs.push({ s, life: 0, vel: new THREE.Vector3() });
    }

    this.termo = buildTermo(T);
    this.termo.root.visible = false;
    this.vmRoot.add(this.termo.root);
    this.vmRoot.add(this.termo.stream);
    this.spoutLocal = this.termo.spoutTip.position.clone();
    // vapor que sale de la yerba mientras se ceba
    this.puffs = [];
    const puffMat = new THREE.SpriteMaterial({ map: T.dot, color: 0xdde4ea, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.visible = false;
      this.vmRoot.add(s);
      this.puffs.push({ s, life: 0, vel: new THREE.Vector3() });
    }
    this.puffT = 0;
    this.knife = buildKnife(T);
    this.knife.visible = false;
    this.vmRoot.add(this.knife);
    this.knifePlata = buildKnife(T, 'plata');
    this.knifePlata.visible = false;
    this.vmRoot.add(this.knifePlata);
    this.nade = buildGrenade(T);
    this.nade.visible = false;
    this.vmRoot.add(this.nade);
    this.pavaVm = buildGrenade(T, 'pava');
    this.pavaVm.visible = false;
    this.vmRoot.add(this.pavaVm);
    this.perkMate = null;
    // estela del tajo de la hoz: una cinta que sigue a la hoja de verdad
    const nv = (TRAIL_MAX - 1) * TRAIL_SUB + 1;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const tIdx = [];
    for (let i = 0; i < nv - 1; i++) tIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(tIdx);
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 10;
    this.vmRoot.add(this.trail);
    this.trailPts = [];
    this.trailFree = [];
    // la piedra de afilar y sus chispas (recarga de la Hoz de la Muerte)
    this.whet = buildWhetstone(T);
    this.whet.root.visible = false;
    this.vmRoot.add(this.whet.root);
    // las bombillas usadas que escupe la Bombilla Gut al quebrarse
    this.spent = [];
    const spentGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.09, 6);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(spentGeo, getMats(T).silverDark);
      s.visible = false;
      this.vmRoot.add(s);
      this.spent.push({ s, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.sparkles = [];
    const sparkMat = new THREE.SpriteMaterial({ map: T.dot, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(sparkMat.clone());
      s.visible = false;
      this.vmRoot.add(s);
      this.sparkles.push({ s, life: 0, vel: new THREE.Vector3() });
    }
    // Mark III: las cápsulas gastadas que saltan al recargar y el arco que
    // carga las nuevas cuando se juntan las bombillas
    this.cells = [false, true].map((left) => {
      const s = buildMk3Cell(T, left);
      s.visible = false;
      this.vmRoot.add(s);
      return { s, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
    });
    const arcGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    this.arcMats = [0x6aff8a, 0xf0ffe8].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcSegs = [];
    for (let i = 0; i < 2 * ARC_N; i++) {
      const m = new THREE.Mesh(arcGeo, this.arcMats[i < ARC_N ? 0 : 1]);
      m.visible = false;
      m.renderOrder = 11;
      this.vmRoot.add(m);
      this.arcSegs.push(m);
    }
    this.arcPts = Array.from({ length: ARC_N + 1 }, () => new THREE.Vector3());
    this.arcGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0x7affa0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcGlow.visible = false;
    this.arcGlow.renderOrder = 11;
    this.vmRoot.add(this.arcGlow);
    this.akR = [0, 0, 0, 0, 0, 0];
    this.akL = [0, 0, 0, 0, 0, 0];

    const mt = muzzleTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.08);
    this.flash.visible = false;
    this.models = new Map();
    // los cuatro mates de la luz del castillo (weapons/Elementales.js)
    this.elem = new Elementales(this);
    // los potenciadores de mano de cada mapa (weapons/Especiales.js)
    this.esp = new Especiales(this);
    // el Facón Relámpago de Mate no Numa (weapons/Facon.js)
    this.facon = new Facon(this);
    // el Admin Mate y el Farol de las Ánimas (weapons/Potenciadores.js)
    this.pot = new Potenciadores(this);
    // la Liquidificador de los esteros (weapons/Liquidificador.js)
    this.liq = new Liquidificador(this);
    this.prebuild();
    // la Supernova del Challenge de la torre (weapons/Supernova.js; arma sus
    // olas del Big Bang en el grupo escondido de prebuild)
    this.nova = new Supernova(this);
    this.projectiles = [];
    this.projGeo = new THREE.SphereGeometry(1, 10, 8);
    this.pose = { pos: HIP.clone(), rot: new THREE.Euler() };
    this.tuning = { HIP, ADS, SPRINT, VM_POSE };
    this.reset();
  }

  // Todos los mates (sin mejorar y con cada mejora del Pack-a-Pava) armados de
  // entrada en un grupo escondido de la escena de la mano: la carga compila sus
  // shaders y agarrar uno nuevo (de la pared, de la caja o de la pava) ya no
  // traba. Al equiparlo pasa a la mano. ui/Arrival pasea el grupo por el mapa
  // al compilar, para que salgan también las variantes con las luces del mapa
  // (el primer mate mejorado en la pava trababa medio segundo).
  prebuild() {
    const warm = new THREE.Group();
    warm.visible = false;
    this.vmScene.add(warm);
    this.warm = warm;
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (w.kind === 'tactical') continue;
      const keys = [];
      for (let up = 0; up <= maxTier(id); up++) keys.push(...(w.akimbo ? [`${id}|${up}`, `${id}|${up}|L`] : [`${id}|${up}`]));
      for (const key of keys) {
        const m = buildMate(id, +key.split('|')[1], this.T, key.endsWith('|L') ? 'L' : 'R');
        if (key.endsWith('|L')) {
          m.root.scale.x *= -1;
          m.root.rotation.y *= -1;
          m.root.rotation.z *= -1;
        }
        this.models.set(key, m);
        warm.add(m.root);
      }
    }
    // los mates de los perks (weapons/perkMates.js), uno por perk: se toman
    // de acá y vuelven acá
    this.perkMates = new Map();
    for (const id of PERK_MATE_IDS) {
      const pm = buildPerkMateFor(this.T, id);
      this.perkMates.set(id, pm);
      warm.add(pm.root);
    }
    // el remolino y el agujero negro del Mark III (weapons/mk3Fx.js)
    this.mk3fx = new Mk3Fx(warm);
    this.mk3fx.warm();
  }

  // El mate de arranque: el Porongo, o el Porongo del Caballero si ganó el
  // super easter egg (core/eggs.js).
  startSlot() {
    const id = startMate();
    return { id, up: 0, mag: WEAPONS[id].mag, reserve: WEAPONS[id].mag * 4 };
  }

  // Alt+O (Game): cambia en la mano el Porongo por el del Caballero (o al revés).
  swapStartMate() {
    const id = startMate();
    const other = id === 'caballero' ? 'porongo' : 'caballero';
    const s = this.slots.find((x) => x.id === other);
    if (!s) return;
    Object.assign(s, { id, mag: WEAPONS[id].mag, reserve: Math.max(s.reserve, WEAPONS[id].mag * 4) });
    this.equipModel();
    this.startRaise();
    this.updateHud();
  }

  reset() {
    this.slots = [this.startSlot()];
    this.cur = 0;
    this.grenades = 2;
    this.tactical = null;
    this.state = 'raise';
    this.stateT = 0;
    this.fireCd = 0;
    this.adsT = 0;
    this.bloom = 0;
    this.recoilKick = 0;
    this.sway = new THREE.Vector2();
    this.shellsLeft = 0;
    this.burst = 0;
    this.lastStand = null;
    this.bowie = false;
    this.temp = null;
    this.clearProjectiles();
    this.clearStuck();
    this.equipModel();
    this.updateHud();
  }

  get maxSlots() {
    return this.g.player.perks.has('mule') ? 3 : 2;
  }

  // La Máquina de Muerte ocupa la mano un rato: mientras dura es "el" mate.
  get slot() {
    return this.temp || this.slots[this.cur];
  }

  get stats() {
    const s = this.slot;
    return s ? weaponStats(s.id, s.up) : null;
  }

  // Manos llenas: comprar otro mate reemplaza el que tenés en la mano.
  get full() {
    return this.slots.length >= this.maxSlots;
  }

  // Potenciador: un arma que se tiene unos segundos y después se va sola.
  giveTemp(id, secs) {
    this.temp = { id, up: 0, mag: WEAPONS[id].mag, reserve: 0, temp: true, until: this.g.time + secs };
    this.startRaise();
  }

  clearTemp() {
    if (!this.temp) return;
    this.temp = null;
    this.g.powerups?.endPersonal();
    this.startRaise();
  }

  get currentName() {
    const s = this.slot;
    if (!s) return 'mate';
    return s.up ? weaponStats(s.id, s.up).name : WEAPONS[s.id].name;
  }

  has(id) {
    return this.slots.some((s) => s.id === id);
  }

  // ¿Tengo el Mate de la Luz Mala? (también si está en el Pack-a-Pava)
  hasLuz() {
    if (this.has('luzmala')) return true;
    const pap = this.g.interact?.pap;
    return !!pap?.entry && pap.entry.id === 'luzmala' && pap.entry.remote === undefined && pap.state !== 'idle';
  }

  // Saca un mate de las manos (al morirse se pierde el de la Luz Mala).
  drop(id) {
    const i = this.slots.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.slots.splice(i, 1);
    if (!this.slots.length) this.slots.push(this.startSlot());
    this.cur = Math.min(this.cur, this.slots.length - 1);
    this.startRaise();
  }

  // Agrega un arma (o recarga munición si ya la tenés).
  give(id, up = 0) {
    up = tierOf(up);
    // comprar algo con la Máquina de Muerte en la mano: se termina antes
    if (this.temp && WEAPONS[id].kind !== 'tactical') this.temp = null;
    const w = WEAPONS[id];
    if (w.kind === 'tactical') {
      this.tactical = { id, count: w.count };
      this.updateHud();
      return 'tactical';
    }
    const st = weaponStats(id, up);
    const existing = this.slots.findIndex((s) => s.id === id);
    if (existing >= 0) {
      const s = this.slots[existing];
      s.up = Math.max(up, tierOf(s.up));
      const full = weaponStats(id, s.up);
      s.mag = full.mag;
      s.reserve = full.reserve;
      if (existing !== this.cur) this.switchTo(existing);
      else {
        this.equipModel();
        this.updateHud();
      }
      return 'ammo';
    }
    const entry = { id, up, mag: st.mag, reserve: st.reserve };
    if (this.slots.length < this.maxSlots) {
      this.slots.push(entry);
      this.switchTo(this.slots.length - 1);
      return 'new';
    }
    this.slots[this.cur] = entry;
    this.startRaise();
    return 'replaced';
  }

  // Saca el arma actual (para el Pack-a-Pava). Devuelve la entrada.
  take() {
    const s = this.slots.splice(this.cur, 1)[0];
    this.cur = Math.max(0, Math.min(this.cur, this.slots.length - 1));
    if (this.slots.length) this.startRaise();
    else {
      this.state = 'empty';
      this.holder.clear();
    }
    this.updateHud();
    return s;
  }

  // Al perder Mule Kick se pierde el tercer mate.
  trimSlots() {
    while (this.slots.length > this.maxSlots) this.slots.pop();
    if (this.cur >= this.slots.length) this.cur = this.slots.length - 1;
    this.startRaise();
  }

  maxAmmo() {
    for (const s of this.slots) {
      s.reserve = weaponStats(s.id, s.up).reserve;
      // la hoz (que no se recarga) queda con el cargador lleno
      if (WEAPONS[s.id].kind === 'melee') s.mag = weaponStats(s.id, s.up).mag;
    }
    this.grenades = GRENADE.max;
    this.updateHud();
  }

  // ¿Ya tiene toda la munición? (para no cobrar una recarga que no hace falta)
  ammoFull(id) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return false;
    const st = weaponStats(id, s.up);
    return s.reserve >= st.reserve && s.mag >= st.mag;
  }

  // Facón de Plata comprado en la pared: se desenvaina para mostrarlo.
  giveBowie() {
    this.bowie = true;
    this.startKnife();
  }

  refillAmmo(id) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return false;
    const st = weaponStats(id, s.up);
    if (s.reserve >= st.reserve && s.mag >= st.mag) return false;
    s.reserve = st.reserve;
    this.updateHud();
    return true;
  }

  switchTo(i) {
    if (i === this.cur && this.state !== 'empty') {
      this.equipModel();
      this.updateHud();
      return;
    }
    this.cur = i;
    this.startRaise();
  }

  startRaise() {
    this.elem?.cancelCharge();
    this.nova?.cancelCharge();
    // si algo cortó el trago de un perk, el mate del perk no queda colgado en la pantalla
    if (this.perkMate) {
      this.perkMate.removeFromParent();
      this.perkMate = null;
      this.drinkDone?.();
      this.drinkDone = null;
    }
    this.state = 'raise';
    this.stateT = 0;
    this.pourSnd?.stop();
    this.equipModel();
    this.updateHud();
  }

  equipModel() {
    this.holder.clear();
    this.holder2.clear();
    this.model2 = null;
    const s = this.slot;
    if (!s) return;
    const key = `${s.id}|${s.up}`;
    let m = this.models.get(key);
    if (!m) {
      m = buildMate(s.id, s.up, this.T);
      this.models.set(key, m);
    }
    this.model = m;
    this.holder.add(m.root);
    m.muzzle.add(this.flash);
    if (WEAPONS[s.id].akimbo) {
      // el de la otra mano: el mismo mate espejado (el Mark III tiene otro)
      let m2 = this.models.get(`${key}|L`);
      if (!m2) {
        m2 = buildMate(s.id, s.up, this.T, 'L');
        // espejado entero: además de dar vuelta la escala, el giro hacia el
        // centro va para el otro lado (si no, la bombilla apunta para afuera)
        m2.root.scale.x *= -1;
        m2.root.rotation.y *= -1;
        m2.root.rotation.z *= -1;
        this.models.set(`${key}|L`, m2);
      }
      this.model2 = m2;
      this.holder2.add(m2.root);
    }
    this.side = 0;
  }

  // El mate que dispara ahora (con akimbo, van alternando).
  get firing() {
    return this.side && this.model2 ? this.model2 : this.model;
  }

  updateHud() {
    const s = this.slot;
    const st = this.stats;
    // la hoz sin mejorar no lleva munición; la Máquina de Muerte no se acaba
    const melee = st?.kind === 'melee' && !st.alt;
    this.g.hud?.setWeapon(st ? { name: st.upgraded ? st.name : WEAPONS[s.id].name, mag: melee || s.temp ? '∞' : s.mag, reserve: melee || s.temp ? '∞' : s.reserve, upgraded: s.up, desc: st.upgraded && st.desc ? st.desc : WEAPONS[s.id].desc } : null);
    // el cuchillo de Anacleto (el penal) ocupa el lugar de la pava y se muestra aparte
    const knife = this.tactical?.id === 'cuchillo';
    // (negativo: volando o enfriándose, se ve apagado)
    this.g.hud?.setGrenades(this.grenades, knife ? 0 : this.tactical?.count || 0, knife ? (this.tactical.up ? 2 : 1) * (this.tactical.count > 0 ? 1 : -1) : 0);
  }

  get busy() {
    return ['reload', 'knife', 'swing', 'throw', 'drink', 'raise', 'lower', 'empty'].includes(this.state) && !(this.state === 'reload' && this.stats?.shellReload);
  }

  // ---------------- entrada ----------------
  update(dt, input) {
    const g = this.g;
    const p = g.player;
    this.stateT += dt;
    this.fireCd -= dt;
    this.vortexCd = Math.max(0, (this.vortexCd || 0) - dt);
    this.bloom = Math.max(0, this.bloom - dt * 1.6);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9);
    this.kickL = Math.max(0, this.kickL - dt * 9);
    const st = this.stats;
    const canAct = p.alive && !g.paused;

    // ADS
    // con un mate en cada mano no se apunta con la mira (ni con las que tiran de la cadera)
    const wantAds = canAct && input.mouse.right && !p.sprinting && this.state !== 'drink' && this.state !== 'knife' && st && !st.akimbo && st.kind !== 'melee' && !st.temp && !st.noAds;
    // se terminó la Máquina de Muerte
    if (this.temp && (this.g.time >= this.temp.until || !p.alive || p.downed)) this.clearTemp();
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    this.ads = this.adsT > 0.6;

    switch (this.state) {
      case 'raise':
        if (this.stateT > 0.35) this.state = 'idle';
        break;
      case 'reload':
        if (st.shellReload) {
          const per = st.reload * p.reloadMult;
          if (this.stateT > per) {
            this.stateT = 0;
            const s = this.slot;
            if (s.reserve > 0 && s.mag < st.mag) {
              s.mag++;
              s.reserve--;
              g.audio.shell();
              this.updateHud();
            }
            if (s.mag >= st.mag || s.reserve <= 0) {
              this.state = 'idle';
              g.audio.mech(g.audio.now, [0, 0.12]);
            }
          }
          if (input.mouse.leftPressed && this.slot.mag > 0) this.state = 'idle';
        } else if (this.stateT >= this.reloadTime) {
          const s = this.slot;
          const need = st.mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
          this.state = 'idle';
          this.updateHud();
        }
        break;
      case 'knife':
        if (this.stateT > 0.22 && !this.knifeHit) this.knifeStrike();
        if (this.stateT > KNIFE.time) this.state = 'idle';
        break;
      case 'swing': {
        const mv = HOZ_MOVES[this.swingMove] || HOZ_MOVES.fore;
        if (this.stateT > this.swingTime * mv.hit && !this.swingHit) {
          if (this.facon.strike(st, this.swingMove)) this.swingHit = true;
          else if (this.swingMove === 'toss') this.launchCrescent(st);
          else this.scytheStrike(st);
        }
        if (this.stateT > this.swingTime) {
          this.state = 'idle';
          this.swingEnd = g.time;
        }
        break;
      }
      case 'throw':
        if (this.stateT > 0.28 && !this.thrown) this.throwItem();
        if (this.stateT > 0.65) this.state = 'idle';
        break;
      case 'inspect':
        // correr lo corta
        if (p.sprinting) this.state = 'idle';
        break;
      case 'drink':
        if (this.stateT > this.drinkTime) {
          // (el de cada perk vuelve al grupo escondido para la próxima)
          const pm = this.perkMate;
          if (pm && [...(this.perkMates?.values() || [])].some((x) => x.root === pm)) this.warm.add(pm);
          else pm?.removeFromParent();
          this.perkMate = null;
          const done = this.drinkDone;
          this.drinkDone = null;
          done?.();
          this.startRaise();
        }
        break;
      default:
        break;
    }

    // abajo del agua no se tira nada (solo en la superficie; entities/swim.js)
    if (canAct && st && this.state !== 'empty' && !p.underwater) this.handleInput(input, st, p);
    this.updateProjectiles(dt);
    this.elem.update(dt);
    this.esp.update(dt);
    this.facon.update(dt);
    this.pot.update(dt);
    this.liq.update(dt);
    this.nova.update(dt);
    this.updateStuck(dt);
    this.updatePools(dt);
    this.animate(dt, input, st);
  }

  handleInput(input, st, p) {
    const g = this.g;
    // inspeccionar (E): se corta con E de nuevo, disparando o haciendo cualquier otra cosa
    if (this.state === 'inspect') {
      const again = input.hit('KeyE');
      const other = input.mouse.left || input.mouse.right || input.mouse.wheel || ['KeyR', 'KeyV', 'KeyG', 'KeyT', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].some((k) => input.hit(k));
      if (!again && !other) return;
      this.state = 'idle';
      if (again) return;
    } else if (input.hit('KeyE') && this.state === 'idle' && !p.sprinting && !this.ads) {
      this.state = 'inspect';
      this.stateT = 0;
      return;
    }
    // con la Máquina de Muerte no se cambia de arma ni se recarga: se tira
    if (this.temp) {
      if (this.esp.input(input, st, p)) return;
      if (this.facon.input(input, st, p)) return;
      if (this.pot.input(input, st, p)) return;
      if (input.mouse.left && this.fireCd <= 0 && (this.state === 'idle' || this.state === 'reload')) {
        this.state = 'idle';
        this.fire(st);
      }
      return;
    }
    // cambiar de arma
    const count = this.slots.length;
    let next = -1;
    if (input.hit('Digit1')) next = 0;
    if (input.hit('Digit2')) next = 1;
    if (input.hit('Digit3')) next = 2;
    if (input.mouse.wheel || input.hit('KeyQ')) next = (this.cur + (input.mouse.wheel < 0 ? -1 : 1) + count) % count;
    if (next >= 0 && next < count && next !== this.cur && !['knife', 'throw', 'drink'].includes(this.state)) {
      this.switchTo(next);
      return;
    }
    if (input.hit('KeyV') && !['knife', 'throw', 'drink'].includes(this.state)) {
      this.startKnife();
      return;
    }
    if (input.hit('KeyG') && this.grenades > 0 && !this.busyHard()) {
      this.startThrow('frag');
      return;
    }
    if ((input.hit('KeyT') || input.hit('Digit4')) && this.tactical?.count > 0 && !this.busyHard()) {
      this.startThrow(this.tactical.id === 'cuchillo' ? 'cuchillo' : 'pava');
      return;
    }
    const s = this.slot;
    if (input.hit('KeyR') && this.state === 'idle' && s.mag < st.mag && s.reserve > 0) {
      this.startReload(st);
      return;
    }
    // la hoz: izquierdo corta (manteniendo, sigue cortando); la de la Muerte
    // además tira medialunas con el derecho
    if (st.kind === 'melee') {
      if (this.state !== 'idle' || this.fireCd > 0) return;
      if (st.alt && input.mouse.rightPressed) {
        if (s.mag > 0) this.startToss();
        else if (s.reserve > 0) this.startReload(st);
        else g.audio.empty();
        return;
      }
      if (input.mouse.left) this.startSwing(st);
      return;
    }
    // los mates de la luz del castillo: el gatillo (y el tiro cargado) lo maneja Elementales
    if (st.kind === 'elemental') {
      this.elem.input(input, st, p);
      return;
    }
    // la Supernova: el clic derecho carga el Big Bang (mientras carga no tira)
    if (st.kind === 'nova' && this.nova.input(input, st, p)) return;
    // Rayo Matero Mark III: con el derecho tira el remolino (gasta varias cargas)
    if (st.kind === 'mk3' && st.vortex && input.mouse.rightPressed && this.state === 'idle' && this.fireCd <= 0 && this.vortexCd <= 0 && !p.sprinting) {
      if (s.mag >= st.vortex.cost) this.fireVortex(st);
      else if (s.reserve > 0) this.startReload(st);
      else g.audio.empty();
      return;
    }
    if (this.state !== 'idle' && !(this.state === 'reload' && st.shellReload)) return;
    if (p.sprinting) return;
    const trigger = st.auto ? input.mouse.left : input.mouse.leftPressed || (this.buffered && input.mouse.left);
    if (!st.auto && input.mouse.leftPressed && this.fireCd > 0) this.buffered = true;
    if (!trigger || this.fireCd > 0) return;
    this.buffered = false;
    if (s.mag <= 0) {
      if (input.mouse.leftPressed) g.audio.empty();
      if (s.reserve > 0) this.startReload(st);
      return;
    }
    this.state = 'idle';
    this.fire(st);
  }

  busyHard() {
    return ['knife', 'throw', 'drink', 'raise'].includes(this.state);
  }

  startReload(st) {
    const g = this.g;
    this.state = 'reload';
    this.stateT = 0;
    this.reloadTime = st.reload * g.player.reloadMult;
    // Electric Cherry (Chisporé): la descarga al empezar a recargar, más fuerte
    // cuanto más vacío venía el cargador (acá y, por Session 'cherry', para los demás)
    const p = g.player;
    const k = st.mag > 0 ? Math.max(0, Math.min(1, 1 - (this.slot?.mag || 0) / st.mag)) : 0;
    if (p.alive && !p.downed && cherryReady(p, k, g.time)) {
      const at = p.pos.clone();
      cherryShock(g, at, k, true);
      g.net?.share('cherry', { id: g.net.id, p: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], k: +k.toFixed(2) });
    }
    // la Hoz de la Muerte se afila (cada pasada de la piedra hace su ruido)
    this.sharpStroke = -1;
    this.gutStage = 0;
    this.mk3Stage = 0;
    if (st.kind === 'melee' || this.model?.gut) this.pourSnd = null;
    else if (st.kind === 'mk3') this.pourSnd = g.audio.mk3Reload?.(this.reloadTime);
    else if (st.kind === 'elemental') this.pourSnd = this.elem.reloadSound(st, this.reloadTime);
    else if (st.kind === 'liquid') this.pourSnd = this.liq.reloadSound(this.reloadTime);
    else if (st.kind === 'nova') this.pourSnd = this.nova.reloadSound(this.reloadTime);
    else if (st.yerbaReload) this.pourSnd = g.audio.yerbaChange?.(this.reloadTime);
    else if (!st.shellReload) this.pourSnd = g.audio.pour(this.reloadTime);
    else g.audio.mech(g.audio.now, [0]);
  }

  startKnife() {
    this.pourSnd?.stop();
    this.state = 'knife';
    this.stateT = 0;
    this.knifeHit = false;
    this.knifeKick = false;
    // si el zombie está lejos hay que tirarse encima: puñalada; si no, tajo y revés turnados
    const t = this.knifeTarget();
    if (t.best && t.d > KNIFE.range) this.knifeMove = 'stab';
    else this.knifeMove = this.knifeMove === 'tajo' ? 'reves' : 'tajo';
    this.g.audio.knife(false);
  }

  // El zombie más cercano adelante, a tiro de estocada.
  knifeTarget() {
    const g = this.g;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    let best = null;
    let bestD = Infinity;
    for (const { z, d } of g.zombies.inRadius(g.player.pos, KNIFE.lunge)) {
      const dx = z.pos.x - g.player.pos.x;
      const dz = z.pos.z - g.player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx / len) * fwd.x + (dz / len) * fwd.z < 0.55) continue;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return { best, d: bestD, fwd };
  }

  knifeStrike() {
    const g = this.g;
    this.knifeHit = true;
    const { best, d: bestD, fwd } = this.knifeTarget();
    // sin muerto a tiro: lo del easter egg que se golpea con el cuchillo (el castillo)
    if ((!best || bestD > KNIFE.range) && g.ee.onKnife?.(fwd)) return;
    if (!best) return;
    // estocada: te acerca un poco si está a tiro de lunge
    if (bestD > KNIFE.range) {
      g.player.lunge(best.pos, bestD - 0.9);
    }
    const point = tmpV2.set(best.pos.x, 1.3 * best.scale, best.pos.z);
    // con el Facón de Plata se liquida de un tajo (y casi siempre vuela la cabeza)
    let dmg = KNIFE.damage;
    if (this.bowie) dmg = g.rounds.round <= BOWIE.oneHitUntil ? 1e9 : KNIFE.damage * BOWIE.mult;
    g.zombies.damage(best, dmg, { type: 'knife', zone: 'torso', point, dir: fwd.clone(), decap: this.bowie ? Math.random() < 0.85 : Math.random() < 0.3 });
    this.knifeBlood(best, point, fwd);
    g.audio.knife(true);
    g.fx.addShake(0.08);
  }

  // Que se note el tajo: la sangre sale para el lado del corte (y un poco hacia
  // uno, para verla), gotea al piso, marca de golpe y un salpicón en la pantalla.
  knifeBlood(z, point, fwd) {
    const g = this.g;
    // el tajo cruza de derecha a izquierda, el revés al revés; la puñalada salpica para arriba
    const side = this.knifeMove === 'tajo' ? -1 : this.knifeMove === 'reves' ? 1 : 0;
    const rx = -fwd.z;
    const rz = fwd.x;
    const dir = tmpV3.set(rx * side * 0.9 - fwd.x * 0.4, side ? 0.05 : 0.45, rz * side * 0.9 - fwd.z * 0.4);
    g.fx.blood(point, dir, this.bowie ? 26 : 18, 1.4);
    for (let i = 0; i < 2; i++) {
      g.fx.decal(1, { x: z.pos.x + rx * side * (0.4 + i * 0.5) + (Math.random() - 0.5) * 0.4, y: (z.baseY || 0) + 0.02, z: z.pos.z + rz * side * (0.4 + i * 0.5) + (Math.random() - 0.5) * 0.4 }, { x: 0, y: 1, z: 0 }, 0.45 + Math.random() * 0.4);
    }
    g.hud.hitmarker(false);
    if (!g.settings.calmFx) g.hud.knifeSplat?.(side);
  }

  startThrow(kind) {
    this.pourSnd?.stop();
    this.state = 'throw';
    this.stateT = 0;
    this.thrown = false;
    this.throwKind = kind;
  }

  throwItem() {
    const g = this.g;
    this.thrown = true;
    const cam = g.camera;
    const dir = tmpV.set(0, 0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const pos = tmpV2.copy(cam.position).addScaledVector(dir, 0.5);
    if (this.throwKind === 'frag') {
      this.grenades--;
      this.spawnProjectile({ kind: 'grenade', pos, vel: dir.clone().multiplyScalar(15), gravity: 12, fuse: GRENADE.fuse, bounce: true, mesh: buildGrenade(this.T) });
    } else if (this.throwKind === 'cuchillo') {
      // el cuchillo no se gasta: vuela, busca muertos y vuelve a la mano (weapons/Cuchillo.js)
      if (this.tactical?.id === 'cuchillo' && this.tactical.count > 0 && g.ee?.knife) {
        this.tactical.count = 0;
        g.ee.knife.throw(pos.clone());
      }
    } else if (this.tactical) {
      this.tactical.count--;
      this.spawnProjectile({ kind: 'pava', pos, vel: dir.clone().multiplyScalar(11), gravity: 12, fuse: 8, bounce: true, mesh: buildGrenade(this.T, 'pava') });
      if (this.tactical.count <= 0) this.tactical = null;
    }
    this.updateHud();
  }

  // Tomar un perk: el arma baja y aparece el mate de ese perk (cada uno tiene
  // el suyo, weapons/perkMates.js; el perk sale del color si no lo pasan).
  drink(color, onDone, perk = Object.keys(PERKS).find((k) => PERKS[k].color === color)) {
    this.pourSnd?.stop();
    this.state = 'drink';
    this.stateT = 0;
    this.drinkTime = 2.3;
    this.drinkDone = onDone;
    const pm = this.perkMates?.get(perk) || buildPerkMateFor(this.T, perk, color);
    this.perkMate?.removeFromParent();
    this.perkMate = pm.root;
    this.perkTip = pm.tip;
    // orientación final: la bombilla cruza en diagonal desde abajo a la derecha hasta la boca
    this.perkQ = new THREE.Quaternion().setFromUnitVectors(pm.strawDir, DRINK_DIR);
    // girarlo alrededor de la bombilla para que la boca del mate quede para arriba (no se ve la yerba de frente)
    let best = -Infinity;
    let bestQ = this.perkQ.clone();
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const q = new THREE.Quaternion().setFromAxisAngle(DRINK_DIR, a).multiply(this.perkQ);
      const up = tmpV.set(0, 1, 0).applyQuaternion(q);
      const score = up.y - up.z * 0.6;
      if (score > best) {
        best = score;
        bestQ = q;
      }
    }
    this.perkQ = bestQ;
    this.perkQ0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, -0.4, -0.2));
    // el mate se ubica respecto del cuerpo; como la mirada baja, este marco sube
    if (!this.drinkFrame) {
      this.drinkFrame = new THREE.Group();
      this.vmRoot.add(this.drinkFrame);
    }
    this.drinkFrame.add(this.perkMate);
    this.g.later(0.6, () => this.g.audio.sip());
    // y lo propio de cada perk, cuando termina el sorbo
    this.g.later(2.05, () => this.g.audio.perkDrink?.(perk));
  }

  // ---------------- disparo ----------------
  fire(st) {
    const g = this.g;
    const p = g.player;
    const s = this.slot;
    const rateMult = p.perks.has('doubletap') ? 1.33 : 1;
    this.fireCd = 60 / st.rpm / rateMult;
    if (!s.temp) s.mag--;
    // akimbo: tira una mano y después la otra
    if (this.model2) {
      this.side ^= 1;
      this.firing.muzzle.add(this.flash);
    }
    this.updateHud();
    g.audio.shot(st.sound, null, st.upgraded);
    g.stats.shots++;
    const cam = g.camera;
    const origin = cam.position;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const muzzle = this.muzzleWorld(new THREE.Vector3());

    // dispersión
    let spread = st.spread || 0;
    if (this.ads) spread = st.adsSpread ?? spread * 0.18;
    if (p.moving) spread *= 1.5;
    if (p.crouching) spread *= 0.75;
    if (!p.onGround) spread *= 2;
    spread += this.bloom * (this.ads ? 0.3 : 1) * 0.04;
    if (st.wobble) spread += Math.sin(g.time * 13) * 0.02;

    const kick = st.recoil * (this.ads ? 0.6 : 1) * (p.crouching ? 0.8 : 1);
    p.addRecoil(kick * 0.35, (Math.random() - 0.5) * kick * 0.25);
    if (this.model2 && this.side) this.kickL = Math.min(1.5, this.kickL + kick * 6 + 0.3);
    else this.recoilKick = Math.min(1.5, this.recoilKick + kick * 6 + 0.3);
    this.bloom = Math.min(1, this.bloom + st.recoil * 2);
    // la Máquina de Muerte tira tanto que el fogonazo va suave y salteado (si no, deja ciego)
    this.shotN = (this.shotN || 0) + 1;
    const soft = !!st.temp;
    this.flashT = soft ? (this.shotN % 3 === 0 ? 0.03 : 0) : 0.05;
    if ((!st.special || st.kind === 'projectile') && (!soft || this.shotN % 4 === 0)) {
      g.fx.flash(muzzle, st.kind === 'projectile' && st.projectile?.glow ? st.projectile.color : 0xffb060, soft ? 2.5 : 8, soft ? 0.04 : 0.06, soft ? 4 : 7);
    }
    if (st.gutFrac) {
      // el trabuco escupe las bombillas con una bocanada de humo de yerba quemada
      g.fx.addShake(st.upgraded ? 0.28 : 0.2);
      for (let i = 0; i < 14; i++) {
        const v = 2.5 + Math.random() * 4;
        g.fx.alpha.spawn(muzzle.x, muzzle.y, muzzle.z, fwd.x * v + (Math.random() - 0.5), fwd.y * v + Math.random() * 0.5, fwd.z * v + (Math.random() - 0.5), { color: [0.42, 0.46, 0.34], size: 0.06, size1: 0.55, life: 0.6 + Math.random() * 0.5, alpha: 0.3, drag: 2.5 });
      }
    }

    switch (st.kind) {
      case 'hitscan':
        for (let i = 0; i < (st.pellets || 1); i++) this.hitscan(st, origin, fwd, muzzle, spread, i);
        break;
      case 'projectile':
        this.fireProjectile(st, origin, fwd, muzzle, spread);
        break;
      case 'bolt':
        this.fireBolt(st, origin, fwd, muzzle);
        break;
      case 'chain':
        this.fireChain(st, origin, fwd, muzzle);
        break;
      case 'freeze':
        this.fireCone(st, origin, fwd, muzzle, 'freeze');
        break;
      case 'blast':
        this.fireCone(st, origin, fwd, muzzle, 'blast');
        break;
      case 'stream':
        this.fireStream(st, origin, fwd, muzzle);
        break;
      case 'wisp':
        this.fireWisps(st, fwd, muzzle, origin);
        break;
      case 'elemental':
        this.elem.fire(st, origin, fwd, muzzle);
        break;
      case 'mk3':
        this.fireBeam(st, origin, fwd, muzzle, spread);
        break;
      case 'liquid':
        this.liq.fire(st, origin, fwd, muzzle);
        break;
      case 'nova':
        this.nova.fire(st, origin, fwd, muzzle);
        break;
      default:
        break;
    }
    // el Mate Meme del Challenge: confeti en cada tiro (weapons/memeMate.js)
    if (st.meme) memeFx(g, muzzle, fwd, st.upgraded);
    // los tiros espantan a los cuervos del patio
    if (st.sound !== 'stream' || Math.random() < 0.1) g.critters?.onNoise(muzzle);
    // en línea: los demás ven y escuchan el disparo
    // (la Liquidificador manda su bola aparte: los demás no ven un trazo)
    if (g.net && st.kind !== 'liquid' && st.kind !== 'nova') {
      const end = tmpV2.copy(muzzle).addScaledVector(fwd, Math.min(st.range, 40));
      g.net.sendShot(muzzle, end, st.sound, st.upgraded);
    }
    // recarga automática al vaciar
    if (s.mag <= 0 && s.reserve > 0) this.g.later(0.2, () => this.state === 'idle' && this.slot === s && this.startReload(this.stats));
  }

  // ---------------- Rayo Matero Mark III ----------------
  // El rayo: atraviesa a todos los que encuentra en línea (hasta pen) y deja
  // una estela verde y dorada.
  fireBeam(st, origin, fwd, muzzle, spread) {
    const g = this.g;
    this.hitscan(st, origin, fwd, muzzle, spread * 0.3, 2);
    const end = this.aimPoint(origin, fwd, st.range);
    this.beamHole(origin, fwd, Math.min(st.range, g.world.raycast(origin, fwd, st.range, hitTmp)));
    g.fx.lightning(muzzle, end, st.upgraded ? 0xffd070 : 0x8aff9a, 0.1);
    g.fx.flash(muzzle, 0x8aff9a, 10, 0.06, 7);
  }

  // El remolino: una bolita que vuela despacio, se abre donde pega (o al
  // ratito) y durante unos segundos chupa a los muertos de alrededor y los
  // deshace. Los jefes lo sienten bastante menos.
  fireVortex(st) {
    const g = this.g;
    const s = this.slot;
    const V = st.vortex;
    s.mag -= V.cost;
    // el rayo sale enseguida (para convertirlo en agujero negro); lo que
    // espera es el próximo remolino (antes eran 1,1 s sin poder tirar nada)
    this.fireCd = 0.2;
    this.vortexCd = 0.8;
    this.side = 0;
    this.kickL = Math.min(1.5, this.kickL + 1);
    this.updateHud();
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const mesh = this.vortexMesh(st.upgraded);
    this.vortexN = ((this.vortexN || 0) % 9999) + 1;
    this.spawnProjectile({ kind: 'vortex', pos: muzzle, vel: fwd.clone().multiplyScalar(V.speed), gravity: 0, V, st, mesh, life: V.fly + V.life, open: false, tickT: 0, vid: this.vortexN });
    g.audio.shot('ray', null, true);
    g.audio.whoosh?.(muzzle);
    g.stats.shots++;
    if (g.net) {
      g.net.sendShot(muzzle, muzzle.clone().addScaledVector(fwd, 12), 'ray', true);
      // los demás lo ven volar y el anfitrión arrastra a los muertos (TowerEgg lo pasa)
      g.ee?.shareVortex?.({ p: [muzzle.x, muzzle.y, muzzle.z].map((n) => +n.toFixed(2)), v: [fwd.x, fwd.y, fwd.z].map((n) => +n.toFixed(3)), u: st.upgraded ? 1 : 0, id: this.vortexN });
    }
  }

  // El rayo cruzó un remolino propio: se vuelve agujero negro (como en el
  // Ray Gun Mark 3). Los demás se enteran por el mismo canal del remolino.
  beamHole(origin, fwd, maxT) {
    const g = this.g;
    for (const p of this.projectiles) {
      if (p.kind !== 'vortex' || p.net || p.hole) continue;
      const r = p.open ? Math.max(0.7, p.mesh.scale.x * 0.3) : 0.7;
      const oc = tmpHole.subVectors(p.pos, origin);
      const t = oc.dot(fwd);
      if (t < 0 || t > maxT + r || oc.lengthSq() - t * t > r * r) continue;
      this.makeHole(p);
      if (g.net) g.ee?.shareVortex?.({ p: [p.pos.x, p.pos.y, p.pos.z].map((n) => +n.toFixed(2)), v: [0, 0, 0], u: p.st.upgraded ? 1 : 0, h: p.vid });
    }
  }

  makeHole(p) {
    const g = this.g;
    if (p.hole) return;
    p.hole = true;
    const V = p.V;
    p.V = { ...V, radius: V.radius * 1.6, dps: V.dps * 1.8, life: V.life + 2.5 };
    // se abre ahí mismo; arranca chiquito y crece (se nota que se transformó)
    p.open = true;
    p.openT = 0;
    p.floorY ??= this.vortexFloor(p.pos);
    const m = this.holeMesh(p.st.upgraded);
    m.position.copy(p.pos);
    this.mk3fx.release(p.mesh);
    p.mesh = m;
    g.scene.add(m);
    g.audio.explosion(p.pos, 0.6);
    // (la onda la dibuja el agujero: el fogonazo, corto y sin encandilar)
    g.fx.flash(p.pos, 0x8a4dff, 9, 0.35, 12);
    g.fx.sparkle(p.pos, [0.7, 0.45, 1], 24, 0.6);
  }

  // El piso debajo del remolino (ahí arranca el tornado). Si abajo hay un
  // agujero (la torre), el tornado queda en el aire, un poco más abajo.
  vortexFloor(pos) {
    const y = this.g.world.floorAt(pos.x, pos.z, pos.y);
    return pos.y - y < 3 ? y : pos.y - 1.2;
  }

  // El remolino y el agujero negro (weapons/mk3Fx.js: se reusan).
  vortexMesh(upgraded) {
    return this.mk3fx.get('vortex', upgraded);
  }

  holeMesh(upgraded) {
    return this.mk3fx.get('hole', upgraded);
  }

  // Devuelve true cuando el remolino se terminó.
  updateVortex(p, dt) {
    const g = this.g;
    const V = p.V;
    const m = p.mesh;
    const vh = g.post?.composer?.renderTarget1?.height || g.renderer.domElement.height;
    if (!p.open) {
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      const seg = tmpV.subVectors(p.pos, p.prev);
      const len = seg.length();
      let stop = p.t > V.fly;
      if (len > 1e-5) {
        const dir = seg.clone().divideScalar(len);
        const wallT = g.world.raycast(p.prev, dir, len, hitTmp);
        const zh = g.zombies.raycast(p.prev, dir, Math.min(wallT, len));
        if (zh.length) {
          p.pos.copy(p.prev).addScaledVector(dir, zh[0].t);
          stop = true;
        } else if (Number.isFinite(wallT)) {
          // (un poco separado de la pared: el tornado no queda cortado)
          p.pos.copy(hitTmp.point).addScaledVector(hitTmp.normal, 0.9);
          stop = true;
        }
      }
      m.position.copy(p.pos);
      m.userData.fx.update(dt, 0, V.radius, p.pos.y, vh);
      g.fx.sparkle(p.pos, [0.6, 1, 0.5], 1, 0.06);
      if (stop) {
        p.open = true;
        p.openT = 0;
        p.floorY = this.vortexFloor(p.pos);
        g.audio.explosion(p.pos, 0.4);
        g.fx.flash(p.pos, 0x9aff8a, 8, 0.25, 10);
      }
      return false;
    }
    p.openT += dt;
    const k = Math.min(1, p.openT / 0.4) * (p.openT > V.life - 0.5 ? Math.max(0, (V.life - p.openT) / 0.5) : 1);
    m.userData.fx.update(dt, k, V.radius, p.floorY ?? p.pos.y, vh, p.openT);
    // chupa: los muertos van hacia el centro (lo maneja el que simula) y se deshacen
    p.tickT -= dt;
    const tick = p.tickT <= 0;
    if (tick) p.tickT = 0.2;
    const host = !g.net?.guest;
    for (const { z, d } of g.zombies.inRadius(p.pos, V.radius)) {
      if (host && !z.boss && !z.crow && !z.pombero && !z.dead && (z.state === 'chase' || z.state === 'attack')) {
        const dx = p.pos.x - z.pos.x;
        const dz = p.pos.z - z.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        const pull = Math.min(dd, (p.hole ? 8.5 : 5.5) * dt);
        z.pos.x += (dx / dd) * pull;
        z.pos.z += (dz / dd) * pull;
      }
      // el de otro jugador solo arrastra: el daño lo manda el que lo tiró
      if (tick && !p.net) {
        const dmg = V.dps * 0.2 * (z.boss || z.crow ? 0.2 : 1) * (d < 1.6 ? 1.6 : 1);
        g.zombies.damage(z, dmg, { type: 'explosive', point: new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), dir: new THREE.Vector3(z.pos.x - p.pos.x, 0.4, z.pos.z - p.pos.z).normalize() });
      }
    }
    if (Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      const r = V.radius * (0.4 + Math.random() * 0.6) * k;
      g.fx.sparkle(new THREE.Vector3(p.pos.x + Math.cos(a) * r, p.pos.y + (Math.random() - 0.3) * 1.5, p.pos.z + Math.sin(a) * r), p.hole ? [0.7, 0.45, 1] : [0.55, 1, 0.5], 1, 0.15);
    }
    if (p.openT > V.life) {
      this.mk3fx.release(m);
      return true;
    }
    return false;
  }

  // El remolino que tiró otro jugador (llega por la red): vuela igual y arrastra, sin daño.
  spawnNetVortex(vx) {
    if (vx.h) {
      const q = this.projectiles.find((x) => x.kind === 'vortex' && x.net && x.vid === vx.h && x.by === vx.by);
      if (q) this.makeHole(q);
      return;
    }
    const st = weaponStats('mk3', vx.u ? 1 : 0);
    const V = st.vortex;
    const pos = new THREE.Vector3(...vx.p);
    const vel = new THREE.Vector3(...vx.v).multiplyScalar(V.speed);
    this.spawnProjectile({ kind: 'vortex', pos, vel, gravity: 0, V, st, mesh: this.vortexMesh(st.upgraded), life: V.fly + V.life, open: false, tickT: 0, net: true, vid: vx.id, by: vx.by });
    this.g.audio.whoosh?.(pos);
  }

  // ---------------- la hoz ----------------
  startSwing(st) {
    const g = this.g;
    this.state = 'swing';
    this.stateT = 0;
    this.swingHit = false;
    this.swingWhoosh = false;
    // golpes seguidos (manteniendo el clic): derecho, revés y el de arriba
    const chain = g.time - (this.swingEnd ?? -9) < 0.3;
    this.swingN = chain ? ((this.swingN || 0) + 1) % HOZ_COMBO.length : 0;
    this.swingMove = HOZ_COMBO[this.swingN];
    const rateMult = g.player.perks.has('doubletap') ? 1.2 : 1;
    this.swingTime = 60 / st.rpm / rateMult;
    this.fireCd = this.swingTime;
  }

  // Hoz de la Muerte: carga la medialuna atrás y la larga (sale en launchCrescent).
  startToss() {
    this.state = 'swing';
    this.stateT = 0;
    this.swingHit = false;
    this.swingWhoosh = false;
    this.swingMove = 'toss';
    this.swingN = -1;
    this.swingTime = 0.5;
    this.fireCd = 0.55;
  }

  // El tajo: agarra a los que están adelante, en un arco.
  scytheStrike(st) {
    const g = this.g;
    this.swingHit = true;
    const M = st.melee;
    const cam = g.camera;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const list = [];
    for (const { z, d } of g.zombies.inRadius(g.player.pos, M.range + 0.6)) {
      const dx = z.pos.x - g.player.pos.x;
      const dz = z.pos.z - g.player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len > 0.9 && (dx / len) * fwd.x + (dz / len) * fwd.z < M.cos) continue;
      if (Math.abs((z.pos.y || 0) + 1 - (g.player.pos.y + 1)) > 2.5 && !z.crow) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    let hit = false;
    for (const { z } of list.slice(0, M.targets)) {
      const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.3 * (z.scale || 1), z.pos.z);
      g.zombies.damage(z, st.damage, { type: 'scythe', zone: 'torso', point, dir: fwd.clone(), decap: Math.random() < 0.6 });
      hit = true;
    }
    if (hit) {
      g.hud.hitmarker(false);
      g.audio.knife(true);
      g.fx.addShake(0.12);
    }
    // cosechar: la yerba del easter egg se corta con la hoz
    g.ee?.onScythe?.(g.player.pos, fwd, st);
  }

  // Hoz de la Muerte: una medialuna que atraviesa todo lo que encuentra.
  launchCrescent(st) {
    const g = this.g;
    const s = this.slot;
    const C = st.crescent;
    this.swingHit = true;
    if (!C || s.mag <= 0) return;
    s.mag--;
    this.updateHud();
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const pos = cam.position.clone().addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, -0.15, 0));
    this.crescentMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9affc8).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 20, Math.PI * 1.1), this.crescentMat);
    arc.rotation.x = Math.PI / 2;
    mesh.add(arc);
    this.spawnProjectile({ kind: 'crescent', pos, vel: fwd.clone().multiplyScalar(C.speed), gravity: 0, C, st, mesh, life: C.life, hits: new Set() });
    g.audio.shot('ray', null, true);
    g.audio.whoosh?.(pos);
    g.stats.shots++;
    if (g.net) g.net.sendShot(pos, pos.clone().addScaledVector(fwd, 20), 'ray', true);
  }

  muzzleWorld(out) {
    // posición de la punta de la bombilla (en el espacio de la cámara) pasada al mundo
    this.firing.muzzle.getWorldPosition(out);
    return this.g.camera.localToWorld(out);
  }

  randomDir(fwd, spread, out) {
    out.copy(fwd);
    if (spread <= 0) return out;
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const up = Math.abs(fwd.y) > 0.99 ? tmpV2.set(1, 0, 0) : tmpV2.set(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const u = new THREE.Vector3().crossVectors(right, fwd);
    out.addScaledVector(right, Math.cos(a) * r).addScaledVector(u, Math.sin(a) * r).normalize();
    return out;
  }

  hitscan(st, origin, fwd, muzzle, spread, pellet) {
    const g = this.g;
    const dir = this.randomDir(fwd, spread, new THREE.Vector3());
    const range = st.range * 1.6;
    const wallT = g.world.raycast(origin, dir, range, hitTmp);
    const maxT = Math.min(wallT, range);
    const hits = g.zombies.raycast(origin, dir, maxT);
    let pen = st.pen || 1;
    let dmgMult = 1;
    let endT = maxT;
    let hitAny = false;
    for (const h of hits) {
      if (pen <= 0) break;
      const point = new THREE.Vector3().copy(origin).addScaledVector(dir, h.t);
      const falloff = h.t > st.range ? 0.55 : 1;
      let mult = 1;
      if (h.zone === 'head') mult = st.headMult;
      else if (h.zone === 'neck') mult = Math.max(1, st.headMult * 0.5);
      // Bombilla Gut: cada bombilla se lleva una parte fija de la vida del muerto,
      // así sigue matando de un tiro en cualquier ronda (a los jefes no)
      const base = st.gutFrac && !h.z.boss ? Math.max(st.damage, (h.z.maxHp || 0) * st.gutFrac) : st.damage;
      g.zombies.damage(h.z, base * mult * falloff * dmgMult, { type: st.gutFrac ? 'gut' : 'bullet', zone: h.zone, arm: h.arm, point, dir, burn: st.burn, elem: st.elem, pup: st.bossMult });
      if (st.gutFrac && pen <= 1) this.stickBombilla(point, dir, h.z);
      if (st.explosive) this.explode(point, st.explosive.radius, st.explosive.damage, { color: [0.6, 1, 0.4], elem: st.elem });
      if (!hitAny) {
        g.hud.hitmarker(h.zone === 'head');
        g.audio.hitmarker(h.zone === 'head');
      }
      hitAny = true;
      dmgMult *= 0.75;
      endT = h.t;
      pen--;
    }
    // la bala siguió de largo hasta una pared
    if (pen > 0 && Number.isFinite(wallT) && wallT <= range) {
      endT = wallT;
      g.fx.impact(hitTmp);
      if (st.explosive && !hitAny) this.explode(hitTmp.point, st.explosive.radius, st.explosive.damage, { color: [0.6, 1, 0.4], elem: st.elem });
      // la bombilla queda clavada en la pared
      if (st.gutFrac) this.stickBombilla(hitTmp.point, dir, null, hitTmp.normal);
    }
    // la bala que cruza el agua la salpica (fx/Water)
    g.water?.shot(origin, dir, Math.min(endT, range));
    if (pen > 0) {
      g.ee.onShot(origin, dir, Math.min(endT, range));
      g.secrets?.onShot(origin, dir, Math.min(endT, range));
      g.papq?.onShot(origin, dir, Math.min(endT, range));
    }
    if ((pellet < 2 || st.gutFrac) && (!st.temp || this.shotN % 2 === 0)) {
      const end = new THREE.Vector3().copy(origin).addScaledVector(dir, Math.min(endT, 80));
      g.fx.tracer(muzzle, end, st.gutFrac ? (st.upgraded ? 0xe0b0ff : 0xe8f0ff) : st.upgraded ? 0xffa0ff : 0xfff0c8);
    }
  }

  // Bombillas de la Gut clavadas en paredes y muertos: quedan un rato y se van.
  stickBombilla(point, dir, z, normal) {
    if (!this.stuckMesh) {
      const geo = new THREE.CylinderGeometry(0.006, 0.006, 0.26, 5).rotateX(Math.PI / 2).translate(0, 0, -0.06);
      const filter = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6).rotateX(Math.PI / 2).translate(0, 0, 0.07);
      const merged = mergeGeometries([geo, filter]);
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.25, metalness: 1 });
      this.stuckMesh = new THREE.InstancedMesh(merged, mat, STUCK_MAX);
      this.stuckMesh.frustumCulled = false;
      this.stuckMesh.count = 0;
      this.stuck = [];
      this.g.scene.add(this.stuckMesh);
    }
    const s = this.stuck.length < STUCK_MAX ? { m: new THREE.Matrix4() } : this.stuck.shift();
    s.t = 0;
    s.z = z;
    s.pos = point.clone().addScaledVector(dir, z ? 0.05 : -0.04);
    if (normal && !z) s.pos.set(s.pos.x + normal.x * 0.02, s.pos.y + normal.y * 0.02, s.pos.z + normal.z * 0.02);
    s.q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, new THREE.Vector3().copy(dir).negate().normalize());
    s.id = z ? z.id : 0;
    if (z) s.off = new THREE.Vector3(point.x - z.pos.x, point.y - (z.pos.y || 0), point.z - z.pos.z);
    this.stuck.push(s);
  }

  updateStuck(dt) {
    if (!this.stuck?.length) return;
    let n = 0;
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t += dt;
      // en los muertos se quedan mientras dura el cuerpo; en la pared, 14 segundos
      if (s.z ? !s.z.active || s.z.id !== s.id || s.t > 8 : s.t > 14) this.stuck.splice(i, 1);
    }
    for (const s of this.stuck) {
      if (s.z) s.pos.set(s.z.pos.x + s.off.x, (s.z.pos.y || 0) + s.off.y, s.z.pos.z + s.off.z);
      s.m.compose(s.pos, s.q, ONE);
      this.stuckMesh.setMatrixAt(n++, s.m);
    }
    this.stuckMesh.count = n;
    this.stuckMesh.instanceMatrix.needsUpdate = true;
  }

  // El reventón del frasco: gotas verdes que salpican en arco, un fogonazo
  // verde y una nube tóxica baja (sin humo negro ni quemadura).
  acidSplash(at, radius) {
    const g = this.g;
    g.fx.flash(at, 0x7aff3a, 35, 0.3, radius * 3.5);
    g.audio.explosion(at, 0.45);
    g.audio.squish?.(at);
    g.critters?.onNoise(at, 18);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * radius * 1.6;
      g.fx.alpha.spawn(at.x, at.y + 0.1, at.z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, { color: [0.28 + Math.random() * 0.12, 0.75 + Math.random() * 0.2, 0.08], size: 0.05 + Math.random() * 0.07, size1: 0.03, life: 0.6 + Math.random() * 0.5, gravity: 11, alpha: 0.95 });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = radius * (1.4 + Math.random());
      g.fx.add.spawn(at.x, at.y + 0.2, at.z, Math.cos(a) * s, Math.random() * 1.5, Math.sin(a) * s, { color: [0.45, 1, 0.18], size: 0.45, size1: 0.05, life: 0.35, drag: 4 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;
      g.fx.alpha.spawn(at.x + Math.cos(a) * r, at.y + 0.2, at.z + Math.sin(a) * r, Math.cos(a) * 0.8, 0.4 + Math.random() * 0.6, Math.sin(a) * 0.8, { color: [0.3, 0.5, 0.16], size: 0.4, size1: 1.8, life: 1.4 + Math.random(), alpha: 0.32, drag: 1.2 });
    }
    if (g.camera.position.distanceTo(at) < radius * 2.5) g.fx.addShake(0.2);
  }

  // El frasco pegado (llama a los muertos): late verde y echa burbujas y vaho.
  acidLure(p, dt) {
    const g = this.g;
    const k = Math.min(1, (p.t - (p.stuck.until - p.B.fuse)) / p.B.fuse);
    p.mesh.scale.setScalar(1 + Math.max(0, Math.sin(p.t * (10 + k * 22))) * (0.25 + k * 0.35));
    if (Math.random() < dt * 14) g.fx.add.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, { color: [0.5, 1, 0.25], size: 0.07, size1: 0.01, life: 0.5, gravity: -0.5 });
    if (Math.random() < dt * 5) g.fx.alpha.spawn(p.pos.x, p.pos.y + 0.05, p.pos.z, (Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2, { color: [0.35, 0.6, 0.2], size: 0.08, size1: 0.4, life: 1, alpha: 0.2, drag: 0.8 });
    // cada tanto un blip que se oye de lejos (el "mono" de los muertos)
    p.blipT = (p.blipT ?? 0) - dt;
    if (p.blipT <= 0) {
      p.blipT = 0.45 - k * 0.25;
      g.fx.flash(p.pos, 0x6aff3a, 6 + k * 10, 0.12, 5);
    }
  }

  // Charco de ácido: queda en el piso unos segundos, frena y carcome a los que lo
  // pisan. Se dibuja con un shader: verde tóxico con remolinos, borde irregular
  // que respira, espuma clara en la orilla y burbujas que revientan.
  acidPool(pos, B) {
    const g = this.g;
    const y = g.world.floorAt(pos.x, pos.z, pos.y) + 0.03;
    const r = B.radius * 0.75;
    this.poolMat ||= acidPoolMaterial();
    this.poolGeo ||= new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(this.poolGeo, this.poolMat.clone());
    mesh.material.uniforms.uSeed.value = Math.random() * 10;
    mesh.position.set(pos.x, y, pos.z);
    mesh.scale.setScalar(0.2);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.renderOrder = 2;
    g.scene.add(mesh);
    (this.pools ||= []).push({ pos: new THREE.Vector3(pos.x, y, pos.z), r, B, t: 0, life: 4.5, tick: 0, mesh });
    while (this.pools.length > 8) this.pools.shift().mesh.removeFromParent();
  }

  updatePools(dt) {
    if (!this.pools?.length) return;
    const g = this.g;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const P = this.pools[i];
      P.t += dt;
      // se desparrama rápido con un pequeño rebote y al final se seca encogiéndose
      const k = Math.min(1, P.t / 0.4);
      const grow = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08;
      const fade = Math.max(0, Math.min(1, (P.life - P.t) / 1.2));
      P.mesh.scale.setScalar(P.r * grow * (0.85 + fade * 0.15));
      const u = P.mesh.material.uniforms;
      u.uT.value = P.t;
      u.uA.value = fade;
      if (Math.random() < dt * 10 * fade) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * P.r * 0.8;
        tmpV3.set(P.pos.x + Math.cos(a) * rr, P.pos.y + 0.03, P.pos.z + Math.sin(a) * rr);
        g.fx.add.spawn(tmpV3.x, tmpV3.y, tmpV3.z, 0, 0.3 + Math.random() * 0.4, 0, { color: [0.55, 1, 0.3], size: 0.06, size1: 0.12, life: 0.25 });
      }
      if (Math.random() < dt * 4 * fade) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * P.r * 0.7;
        g.fx.alpha.spawn(P.pos.x + Math.cos(a) * rr, P.pos.y + 0.05, P.pos.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, { color: [0.32, 0.55, 0.18], size: 0.15, size1: 0.7, life: 1.4, alpha: 0.16, drag: 0.6 });
      }
      P.tick -= dt;
      if (P.tick <= 0 && P.t < P.life - 0.4) {
        P.tick = 0.35;
        for (const { z } of g.zombies.inRadius(P.pos, P.r)) {
          if (Math.abs((z.baseY || 0) - P.pos.y) > 1.5) continue;
          z.slowT = Math.max(z.slowT || 0, 0.6);
          const dmg = z.boss ? P.B.damage * 0.05 : Math.max(P.B.damage * 0.06, (z.maxHp || 0) * 0.12);
          g.zombies.damage(z, dmg, { type: 'acid', zone: 'torso', point: new THREE.Vector3(z.pos.x, (z.baseY || 0) + 0.4, z.pos.z) });
        }
      }
      if (P.t >= P.life) {
        P.mesh.removeFromParent();
        P.mesh.material.dispose();
        this.pools.splice(i, 1);
      }
    }
  }

  clearStuck() {
    for (const P of this.pools || []) P.mesh.removeFromParent();
    this.pools = [];
    if (this.stuck) this.stuck.length = 0;
    if (this.stuckMesh) this.stuckMesh.count = 0;
  }

  // Punto al que apunta la mira (para que los proyectiles converjan ahí).
  aimPoint(origin, dir, range) {
    const g = this.g;
    const t = g.world.raycast(origin, dir, range, hitTmp);
    const hits = g.zombies.raycast(origin, dir, Math.min(t, range));
    const tt = hits.length ? hits[0].t : Math.min(t, range);
    return new THREE.Vector3().copy(origin).addScaledVector(dir, tt);
  }

  // Mate de la Luz Mala: suelta lucecitas que buscan solas a los muertos. Cada
  // una sale derecho hacia uno de los que hay adelante (primero el más cercano a
  // la mira; si hay pocos, varias van al mismo) y revienta al pasarle cerca.
  // (Antes salían para arriba y daban vueltas alrededor del que estaba enfrente
  // sin tocarlo.) Apuntándole a la Luz Mala van a ella: así se carga el mate.
  fireWisps(st, fwd, muzzle, origin) {
    const g = this.g;
    const W = st.wisp;
    const luz = g.luz;
    let toLuz = false;
    if (luz && (luz.state === 'idle' || luz.state === 'hop')) {
      const v = new THREE.Vector3().subVectors(luz.orb.position, origin);
      const d = v.length();
      if (d < 45 && v.dot(fwd) / d > 0.985 && g.world.clear(origin, luz.orb.position)) toLuz = true;
    }
    const targets = toLuz ? [] : this.wispTargets(origin, fwd);
    g.fx.flash(muzzle, st.upgraded ? 0x8affd8 : 0x9cff5a, 10, 0.12, 6);
    for (let i = 0; i < W.count; i++) {
      const target = targets.length ? targets[i % targets.length] : null;
      const dir = new THREE.Vector3();
      if (target) dir.set(target.pos.x - muzzle.x, target.pos.y + 1.1 * (target.scale || 1) - muzzle.y, target.pos.z - muzzle.z).normalize();
      else if (toLuz) dir.subVectors(luz.orb.position, muzzle).normalize();
      else dir.copy(fwd);
      // salen en abanico y se cierran sobre el blanco
      dir.applyAxisAngle(UP_AXIS, (i - (W.count - 1) / 2) * 0.2);
      dir.y += 0.05;
      dir.normalize();
      this.spawnProjectile({ kind: 'wisp', pos: muzzle.clone(), vel: dir.multiplyScalar(W.speed * 0.6), gravity: 0, W, st, mesh: this.wispMesh(st), life: W.life, seek: 0.3, target, luz: toLuz, trailT: 0 });
    }
    // la lucecita de la punta se va con el tiro y se vuelve a juntar
    this.luzCharge = 0;
  }

  // Los muertos que hay adelante, del más cercano a la mira al más lejos (los
  // pegados cuentan aunque estén un poco al costado).
  wispTargets(origin, fwd) {
    const g = this.g;
    const list = [];
    const v = new THREE.Vector3();
    const at = new THREE.Vector3();
    for (const { z } of g.zombies.inRadius(origin, 30)) {
      at.set(z.pos.x, z.pos.y + 1.1 * (z.scale || 1), z.pos.z);
      v.subVectors(at, origin);
      const len = v.length() || 1;
      const dot = v.dot(fwd) / len;
      if (dot < (len < 3 ? 0.3 : 0.82)) continue;
      if (!g.world.clear(origin, at)) continue;
      list.push({ z, s: (1 - dot) * 12 + len * 0.15 });
    }
    list.sort((a, b) => a.s - b.s);
    return list.slice(0, 5).map((x) => x.z);
  }

  // Una lucecita: un corazón blanco verdoso con un halo que tiembla.
  wispMesh(st) {
    const T = this.T;
    const add = { map: T.dot, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
    this.wispMats ||= {
      core: new THREE.SpriteMaterial({ ...add, color: new THREE.Color(0xeaffd8).multiplyScalar(2), toneMapped: false }),
      halo: new THREE.SpriteMaterial({ ...add, color: 0x5cff3a, opacity: 0.6 }),
      haloUp: new THREE.SpriteMaterial({ ...add, color: 0x4affc8, opacity: 0.65 }),
    };
    const m = new THREE.Group();
    const halo = new THREE.Sprite(st.upgraded ? this.wispMats.haloUp : this.wispMats.halo);
    const core = new THREE.Sprite(this.wispMats.core);
    m.add(halo, core);
    m.userData = { halo, core, ph: Math.random() * 6, hs: st.upgraded ? 0.85 : 0.7 };
    return m;
  }

  // Cada lucecita va a su muerto (si cae, al más cercano) y dobla más fuerte
  // cuanto más cerca está, así no queda dando vueltas. Devuelve 'boom' si pasó
  // pegada a alguno, 'luz' si llegó a la Luz Mala.
  steerWisp(p, dt) {
    const g = this.g;
    const luz = g.luz;
    if (p.luz && luz.state !== 'idle' && luz.state !== 'hop') p.luz = false;
    let aim = null;
    if (p.luz) aim = tmpV.copy(luz.orb.position);
    else {
      p.seek -= dt;
      if ((!p.target?.active || p.target.dead) && p.seek <= 0) {
        p.seek = 0.2;
        let best = null;
        let bd = 26;
        for (const { z, d } of g.zombies.inRadius(p.pos, 26)) {
          if (d < bd) {
            bd = d;
            best = z;
          }
        }
        p.target = best;
      }
      const t = p.target?.active && !p.target.dead ? p.target : null;
      if (t) aim = tmpV.set(t.pos.x, t.pos.y + 1.1 * (t.scale || 1), t.pos.z);
    }
    const speed = Math.min(p.W.speed, p.vel.length() + dt * p.W.speed * 2);
    let near = 4;
    if (aim) {
      tmpV2.subVectors(aim, p.pos);
      near = tmpV2.length() || 0.01;
      tmpV2.multiplyScalar(speed / near);
      p.vel.lerp(tmpV2, Math.min(1, dt * p.W.turn * (1 + 5 / Math.max(0.6, near))));
    }
    // un temblor de luz mala (casi nada cuando ya está encima)
    const wob = Math.min(1, near / 4) * dt * 8;
    p.vel.x += (Math.random() - 0.5) * wob;
    p.vel.y += (Math.random() - 0.5) * wob;
    p.vel.setLength(speed);
    // pegada a un muerto: revienta (el rayo de a un cuadro a veces lo cruzaba sin tocarlo)
    for (const { z } of g.zombies.inRadius(p.pos, 2.4)) {
      const s = z.scale || 1;
      const y = Math.min(Math.max(p.pos.y, z.pos.y + 0.2), z.pos.y + 1.75 * s);
      if (Math.hypot(z.pos.x - p.pos.x, y - p.pos.y, z.pos.z - p.pos.z) < 0.5 * s + 0.2) return 'boom';
    }
    if (p.luz && luz.onWisp(p)) return 'luz';
    // estela de fuego fatuo y el halo que tiembla
    const up = p.st.upgraded;
    const A = g.fx.add;
    p.trailT -= dt;
    while (p.trailT <= 0) {
      p.trailT += 0.018;
      A.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, { color: up ? [0.4, 1, 0.8] : [0.5, 1, 0.3], size: 0.16, size1: 0, life: 0.32, drag: 2 });
    }
    if (Math.random() < 0.25) A.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2, { color: [0.85, 1, 0.75], size: 0.04, size1: 0.01, life: 0.7, gravity: 2 });
    const u = p.mesh.userData;
    const fl = 0.85 + Math.sin(p.t * 23 + u.ph) * 0.1 + Math.sin(p.t * 51 + u.ph * 2) * 0.07;
    u.halo.scale.setScalar(u.hs * fl);
    u.core.scale.setScalar(0.14 + Math.sin(p.t * 37 + u.ph) * 0.02);
    return null;
  }

  wispBoom(p, point) {
    // (el daño sale un poquito arriba del punto: si no, una pared o el techo la tapaban)
    this.explode(point, p.W.radius, p.W.damage, { type: 'wisp', lift: 0.1, fx: false });
    this.wispBurst(point, p.W.radius, p.st?.upgraded);
  }

  // El estallido de una luz mala: un fogonazo verde, un anillo de fuego fatuo
  // que se abre y lenguas de luz que suben (sin humo negro ni quemadura en el piso).
  wispBurst(at, radius, up) {
    const g = this.g;
    const A = g.fx.add;
    const c1 = up ? [0.4, 1, 0.85] : [0.55, 1, 0.3];
    const c2 = [0.92, 1, 0.85];
    g.fx.flash(at, up ? 0x8affd8 : 0x9cff5a, 45, 0.35, radius * 4);
    g.audio.explosion(at, 0.3);
    g.audio.zap?.(at);
    g.critters?.onNoise(at, 14);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const s = radius * (2.2 + Math.random() * 0.6);
      A.spawn(at.x, at.y, at.z, Math.cos(a) * s, (Math.random() - 0.5) * 0.8, Math.sin(a) * s, { color: c1, size: 0.34, size1: 0.04, life: 0.42, drag: 4 });
    }
    for (let i = 0; i < 10; i++) A.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, { color: c2, size: 0.7, size1: 0, life: 0.22, drag: 3 });
    for (let i = 0; i < 16; i++) {
      const r = Math.random() * radius * 0.6;
      const a = Math.random() * Math.PI * 2;
      A.spawn(at.x + Math.cos(a) * r, at.y - 0.3 + Math.random() * 0.4, at.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6, { color: c1, size: 0.3, size1: 0.02, life: 0.7 + Math.random() * 0.5, drag: 1.5, gravity: -1 });
    }
    for (let i = 0; i < 14; i++) A.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, { color: c2, size: 0.05, size1: 0.02, life: 0.8 + Math.random() * 0.5, gravity: 7, drag: 1 });
    if (g.camera.position.distanceTo(at) < radius * 2.5) g.fx.addShake(0.15);
  }

  fireProjectile(st, origin, fwd, muzzle, spread) {
    const P = st.projectile;
    const dir = this.randomDir(fwd, spread * 0.5, new THREE.Vector3());
    const target = this.aimPoint(origin, dir, st.range);
    const vel = target.sub(muzzle).normalize().multiplyScalar(P.speed);
    let mesh;
    if (P.teabag) {
      mesh = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.015), new THREE.MeshStandardMaterial({ color: P.color, roughness: 1 }));
      mesh.add(bag);
    } else {
      mesh = new THREE.Mesh(this.projGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(P.color).multiplyScalar(P.glow ? 3 : 1.5), toneMapped: false }));
      mesh.scale.setScalar(P.size * 0.6);
    }
    this.spawnProjectile({ kind: 'shot', pos: muzzle.clone(), vel, gravity: P.gravity, P, st, mesh, life: 4 });
  }

  fireBolt(st, origin, fwd, muzzle) {
    const B = st.bolt;
    // la Bombilla Ácida tira un puñado de frascos en abanico
    if (B.count > 1) {
      for (let i = 0; i < B.count; i++) this.fireAcid(st, origin, this.randomDir(fwd, B.spread || 0.05, new THREE.Vector3()), muzzle);
      return;
    }
    const target = this.aimPoint(origin, fwd, st.range);
    const vel = target.sub(muzzle).normalize().multiplyScalar(B.speed);
    const mesh = new THREE.Group();
    const M = getMats(this.T);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), M.silver);
    tube.rotation.x = Math.PI / 2;
    mesh.add(tube);
    if (st.upgraded) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M.glowGreen);
      glow.position.z = 0.12;
      mesh.add(glow);
    }
    this.spawnProjectile({ kind: 'bolt', pos: muzzle.clone(), vel, gravity: 2, B, st, mesh, life: 6 });
  }

  // Un frasco de ácido: vuela en arco, se pega a lo que toca y revienta en verde.
  fireAcid(st, origin, dir, muzzle) {
    const B = st.bolt;
    const target = this.aimPoint(origin, dir, st.range);
    const vel = target.sub(muzzle).normalize().multiplyScalar(B.speed);
    const M = getMats(this.T);
    const mesh = new THREE.Group();
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 8), M.glass);
    jar.rotation.x = Math.PI / 2;
    mesh.add(jar);
    const goo = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.045, 8), M.glowGreen);
    goo.rotation.x = Math.PI / 2;
    mesh.add(goo);
    this.spawnProjectile({ kind: 'bolt', pos: muzzle.clone(), vel, gravity: 6, B, st, mesh, life: 6 });
  }

  fireChain(st, origin, fwd, muzzle) {
    const g = this.g;
    const C = st.chain;
    let first = null;
    let bestScore = Infinity;
    for (const { z, d } of g.zombies.inRadius(origin, st.range)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1.1 * z.scale - origin.y, z.pos.z - origin.z);
      const len = tmpV2.length();
      const dot = tmpV2.dot(fwd) / (len || 1);
      if (dot < 0.97) continue;
      const score = d * (1.5 - dot);
      if (score < bestScore && g.world.clear(origin, tmpV.set(z.pos.x, z.pos.y + 1.1 * z.scale, z.pos.z))) {
        bestScore = score;
        first = z;
      }
    }
    g.fx.flash(muzzle, 0x9ac8ff, 30, 0.3, 10);
    if (!first) {
      const end = this.aimPoint(origin, fwd, st.range);
      g.fx.lightning(muzzle, end);
      return;
    }
    const visited = new Set([first]);
    let prev = muzzle.clone();
    let cur = first;
    for (let i = 0; i < C.targets && cur; i++) {
      const target = cur;
      const at = new THREE.Vector3(target.pos.x, target.pos.y + 1.1 * target.scale, target.pos.z);
      const from = prev.clone();
      this.g.later(i * 0.07, () => {
        g.fx.lightning(from, at);
        g.fx.electric(at, 12);
        g.audio.zap(at);
        g.zombies.damage(target, 1e9, { type: 'chain', point: at });
      });
      prev = at;
      let next = null;
      let nd = C.hop;
      for (const { z } of g.zombies.inRadius(at, C.hop)) {
        if (visited.has(z)) continue;
        const d = z.pos.distanceTo(target.pos);
        if (d < nd && g.world.clear(at, tmpV.set(z.pos.x, z.pos.y + 1.1, z.pos.z))) {
          nd = d;
          next = z;
        }
      }
      if (next) visited.add(next);
      cur = next;
    }
  }

  // Bombilla del Diablo: un chorro de agua hirviendo que atraviesa a todos los que toca.
  fireStream(st, origin, fwd, muzzle) {
    const g = this.g;
    const range = st.range;
    const wallT = g.world.raycast(origin, fwd, range, hitTmp);
    const maxT = Math.min(wallT, range);
    const R = st.stream?.radius || 0.7;
    const end = new THREE.Vector3().copy(origin).addScaledVector(fwd, maxT);
    let hit = false;
    for (const { z } of g.zombies.inRadius(origin, maxT + 1.5)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1 * z.scale - origin.y, z.pos.z - origin.z);
      const along = tmpV2.dot(fwd);
      if (along < 0.2 || along > maxT + 0.5) continue;
      const perp = tmpV2.addScaledVector(fwd, -along).length();
      if (perp > R + 0.35) continue;
      const point = new THREE.Vector3().copy(origin).addScaledVector(fwd, along);
      g.zombies.damage(z, st.damage, { type: 'scald', point, dir: fwd.clone() });
      hit = true;
    }
    if (hit) g.hud.hitmarker(false);
    g.fx.waterJet(muzzle, end, st.upgraded);
    g.ee.onShot(origin, fwd, maxT);
    g.secrets?.onShot(origin, fwd, maxT);
    g.papq?.onShot(origin, fwd, maxT);
  }

  fireCone(st, origin, fwd, muzzle, type) {
    const g = this.g;
    const C = st.cone;
    if (type === 'freeze') g.fx.frostCone(muzzle, fwd, st.range);
    else {
      g.fx.blastCone(muzzle, fwd, st.range);
      g.fx.addShake(0.5);
      // el soplido del Tronador apaga el barbacuá (easter egg del molino)
      g.ee?.onBlast?.(origin, fwd, st.range, C.angle);
    }
    const tanA = Math.tan(C.angle);
    const list = [];
    for (const { z, d } of g.zombies.inRadius(origin, st.range + 0.5)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1 - origin.y, z.pos.z - origin.z);
      const along = tmpV2.dot(fwd);
      if (d > 3) {
        // en el cono, con el ancho del cuerpo de margen (si no, al que está en el borde no le pega);
        // de cerca, a todo lo que tenga adelante
        if (along <= 0) continue;
        const side = Math.sqrt(Math.max(0, tmpV2.lengthSq() - along * along));
        if (side > 0.9 + along * tanA) continue;
      } else if (along < -0.3) continue;
      // se lo ve si se ve alguna parte: la cabeza, el pecho o las rodillas (detrás de un banco o gateando)
      const s = z.scale || 1;
      let seen = false;
      for (const h of [1.5, 1.1, 0.45]) {
        if (g.world.clear(origin, tmpV.set(z.pos.x, z.pos.y + h * s, z.pos.z))) {
          seen = true;
          break;
        }
      }
      if (!seen) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    for (const { z } of list.slice(0, C.targets)) {
      const dir = new THREE.Vector3(z.pos.x - origin.x, 0, z.pos.z - origin.z).normalize();
      g.zombies.damage(z, 1e9, { type, dir, point: new THREE.Vector3(z.pos.x, z.pos.y + 1.2, z.pos.z) });
    }
  }

  // ---------------- proyectiles ----------------
  spawnProjectile(p) {
    p.pos = p.pos.clone();
    p.prev = p.pos.clone();
    p.t = 0;
    p.life = p.life ?? 10;
    p.stuck = null;
    p.resting = false;
    if (p.mesh) {
      this.g.scene.add(p.mesh);
      p.mesh.position.copy(p.pos);
    }
    this.projectiles.push(p);
  }

  clearProjectiles() {
    this.elem?.clear();
    this.esp?.clear();
    this.facon?.clear();
    this.pot?.clear();
    this.liq?.clear();
    this.nova?.clear();
    for (const p of this.projectiles || []) p.mesh?.removeFromParent();
    this.projectiles = [];
    if (this.g.lures) this.g.lures.length = 0;
  }

  updateProjectiles(dt) {
    const g = this.g;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.fuse !== undefined && p.t >= p.fuse && p.kind !== 'shot') {
        this.detonate(p);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.kind === 'wisp') {
        const hit = p.t > p.life ? 'boom' : this.steerWisp(p, dt);
        if (hit) {
          if (hit === 'boom') this.wispBoom(p, p.pos);
          p.mesh?.removeFromParent();
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.kind === 'vortex') {
        if (this.updateVortex(p, dt)) this.projectiles.splice(i, 1);
        continue;
      }
      if (p.kind === 'crescent') {
        if (p.t > p.life || this.moveCrescent(p, dt)) {
          p.mesh?.removeFromParent();
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      if (p.t > p.life && p.kind === 'shot') {
        p.mesh?.removeFromParent();
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.stuck) {
        if (p.stuck.z && p.stuck.z.active) {
          p.pos.set(p.stuck.z.pos.x, (p.stuck.z.pos.y || 0) + 1.1 * p.stuck.z.scale, p.stuck.z.pos.z);
        }
        p.mesh.position.copy(p.pos);
        if (p.B?.lure) {
          this.setLure(p, p.pos);
          // el frasco pegado late y burbujea mientras llama a los muertos
          if (p.B.acid) this.acidLure(p, dt);
        }
        if (p.t >= p.stuck.until) {
          this.boltBoom(p);
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      if (p.resting) {
        if (p.kind === 'pava') {
          this.setLure(p, p.pos);
          if (Math.random() < 0.3) g.fx.steam(tmpV.copy(p.pos).add(tmpV2.set(0, 0.12, 0)), 1, 0.05);
          p.mesh.rotation.z = Math.sin(p.t * 30) * 0.05;
        }
        continue;
      }
      p.prev.copy(p.pos);
      p.vel.y -= (p.gravity || 0) * dt;
      p.pos.addScaledVector(p.vel, dt);
      // trayecto de este cuadro contra paredes y zombies
      const seg = tmpV.subVectors(p.pos, p.prev);
      const len = seg.length();
      if (len > 1e-5) {
        const dir = seg.clone().divideScalar(len);
        const wallT = g.world.raycast(p.prev, dir, len, hitTmp);
        const zh = p.kind === 'grenade' || p.kind === 'pava' ? [] : g.zombies.raycast(p.prev, dir, Math.min(wallT, len));
        if (zh.length) {
          const h = zh[0];
          const point = p.prev.clone().addScaledVector(dir, h.t);
          if (this.onProjectileHit(p, point, dir, h)) {
            this.projectiles.splice(i, 1);
            continue;
          }
        } else if (Number.isFinite(wallT)) {
          const point = hitTmp.point.clone();
          if (p.bounce) {
            // rebote
            const n = hitTmp.normal;
            p.pos.copy(point).addScaledVector(n, 0.05);
            const vn = p.vel.dot(n);
            p.vel.addScaledVector(n, -1.6 * vn).multiplyScalar(0.55);
            if (n.y > 0.7 && p.vel.length() < 1.2) {
              p.resting = true;
              p.pos.y = Math.max(p.pos.y, 0.05);
              if (p.kind === 'pava') {
                g.audio.kettle(p.pos, Math.max(1, p.fuse - p.t));
                p.mesh.rotation.set(0, Math.random() * 6, 0);
              }
            } else g.audio.shell();
          } else if (this.onProjectileHit(p, point, dir, null)) {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.kind === 'bolt' || p.P?.teabag) {
          p.mesh.lookAt(tmpV2.copy(p.pos).add(p.vel));
          if (p.P?.teabag) p.mesh.rotation.z += dt * 12;
        } else if (p.kind === 'grenade' || p.kind === 'pava') {
          p.mesh.rotation.x += dt * 8;
          p.mesh.rotation.y += dt * 5;
        }
      }
      // estela
      if (p.P?.glow) g.fx.sparkle(p.pos, colorArr(p.P.color), 2, 0.05);
      else if (p.P?.trail) g.fx.sparkle(p.pos, colorArr(p.P.trail), 1, 0.03);
      if (p.pos.y < -2) {
        p.mesh?.removeFromParent();
        this.projectiles.splice(i, 1);
      }
    }
    // los señuelos vencidos se borran solos en Game
  }

  // Avanza la medialuna: corta a cada uno que toca (una vez) y se frena en las paredes.
  moveCrescent(p, dt) {
    const g = this.g;
    p.prev.copy(p.pos);
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
    p.mesh.children[0].rotation.z += dt * 18;
    g.fx.sparkle(p.pos, [0.5, 1, 0.7], 2, 0.3);
    for (const { z } of g.zombies.inRadius(p.pos, p.C.radius + 0.5)) {
      if (p.hits.has(z)) continue;
      p.hits.add(z);
      const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.2 * (z.scale || 1), z.pos.z);
      g.zombies.damage(z, p.C.damage, { type: 'scythe', zone: 'torso', point, dir: p.vel.clone().normalize(), decap: true });
      g.hud.hitmarker(false);
    }
    g.ee?.onScythe?.(p.pos, p.vel.clone().setY(0).normalize(), p.st, true);
    const seg = tmpV.subVectors(p.pos, p.prev);
    const len = seg.length();
    if (len > 1e-5 && Number.isFinite(g.world.raycast(p.prev, seg.divideScalar(len), len, hitTmp))) {
      g.fx.sparks(hitTmp.point, 1, hitTmp.normal, [0.5, 1, 0.7]);
      return true;
    }
    return false;
  }

  setLure(p, pos) {
    const lures = this.g.lures;
    let l = lures.find((x) => x.src === p);
    if (!l) {
      l = { src: p, pos: pos.clone() };
      lures.push(l);
    }
    l.pos.copy(pos);
  }

  removeLure(p) {
    const lures = this.g.lures;
    const i = lures.findIndex((x) => x.src === p);
    if (i >= 0) lures.splice(i, 1);
  }

  // Devuelve true si el proyectil terminó.
  onProjectileHit(p, point, dir, zhit) {
    const g = this.g;
    if (p.kind === 'wisp') {
      // (en la pared revienta un poquito antes: si no, la pared tapa el estallido)
      if (!zhit) point.addScaledVector(dir, -0.25);
      this.wispBoom(p, point);
      p.mesh?.removeFromParent();
      return true;
    }
    if (p.kind === 'bolt') {
      p.stuck = { z: zhit ? zhit.z : null, until: p.t + p.B.fuse };
      p.pos.copy(point);
      if (zhit) g.fx.blood(point, dir, 6);
      else g.fx.sparks(point, 0.5, hitTmp.normal || { x: 0, y: 1, z: 0 });
      g.audio.shell();
      return false;
    }
    const P = p.P;
    const st = p.st;
    if (zhit) {
      const type = st.id === 'oro' ? 'yerba' : 'explosive';
      g.zombies.damage(zhit.z, P.damage * (zhit.zone === 'head' ? st.headMult || 1 : 1), { type: P.radius > 0 ? type : 'bullet', zone: zhit.zone, point, dir, elem: st.elem });
      g.hud.hitmarker(zhit.zone === 'head');
    }
    if (P.radius > 0) {
      const color = colorArr(P.color);
      this.explode(point, P.radius, P.splash ?? P.damage, { color, selfDamage: P.selfDamage ?? (st.id === 'porongo' ? 35 : 0), skip: zhit?.z, type: st.id === 'oro' ? 'yerba' : 'explosive', big: P.glow ? 0.6 : 1, elem: st.elem });
    } else if (!zhit && hitTmp.normal) {
      g.fx.impact({ point, normal: hitTmp.normal });
    }
    p.mesh?.removeFromParent();
    return true;
  }

  boltBoom(p) {
    this.removeLure(p);
    p.mesh?.removeFromParent();
    if (p.B.acid) {
      // el ácido: un reventón verde que salpica y carcome (al Alcaide le derrite el cinturón)
      this.explode(p.pos, p.B.radius, p.B.damage, { selfDamage: 20, type: 'acid', fx: false });
      this.acidSplash(p.pos, p.B.radius);
      this.acidPool(p.pos, p.B);
      return;
    }
    this.explode(p.pos, p.B.radius, p.B.damage, { color: p.st.upgraded ? [0.5, 1, 0.4] : [1, 0.55, 0.2], selfDamage: 60, elem: p.st.elem });
  }

  detonate(p) {
    const g = this.g;
    p.mesh?.removeFromParent();
    if (p.kind === 'pava') {
      this.removeLure(p);
      this.explode(p.pos, 6, 2500, { selfDamage: 0 });
      g.fx.steam(p.pos, 20, 1.2);
    } else if (p.kind === 'grenade') {
      this.explode(p.pos, GRENADE.radius, GRENADE.damage + g.rounds.round * 40, { selfDamage: 75 });
    }
  }

  // Explosión con daño decreciente y línea de visión.
  // fx: false para las que se dibujan aparte (la luz mala, el ácido); lift: de
  // qué altura sobre el punto se mira si la explosión alcanza a cada uno.
  // pup: el bossMult del potenciador que la tiró (pega menos a los jefes)
  explode(pos, radius, damage, { color = [1, 0.55, 0.2], selfDamage = 0, skip = null, type = 'explosive', big = 1, elem, lift = 0.4, fx = true, pup } = {}) {
    const g = this.g;
    if (fx) {
      g.fx.explosion(pos, radius * big, color);
      g.audio.explosion(pos, big);
      g.critters?.onNoise(pos, 22);
    }
    const from = tmpV.copy(pos).add(tmpV2.set(0, lift, 0));
    for (const { z, d } of g.zombies.inRadius(pos, radius)) {
      if (z === skip) continue;
      if (!g.world.clear(from, new THREE.Vector3(z.pos.x, z.pos.y + 1, z.pos.z))) continue;
      const k = 1 - (d / radius) * 0.6;
      const dir = new THREE.Vector3(z.pos.x - pos.x, 0.3, z.pos.z - pos.z).normalize();
      g.zombies.damage(z, damage * k, { type, dir, point: new THREE.Vector3(z.pos.x, z.pos.y + 1, z.pos.z), elem, pup });
    }
    const pd = g.player.pos.distanceTo(pos);
    if (selfDamage > 0 && pd < radius * 0.8 && g.world.clear(from, g.camera.position)) {
      g.player.damage(selfDamage * (1 - pd / radius), pos, true);
    }
    g.ee.onExplosion(pos, radius);
    g.secrets?.onExplosion(pos, radius);
    g.papq?.onExplosion(pos, radius);
  }

  // ---------------- animación de la vista ----------------
  animate(dt, input, st) {
    const g = this.g;
    const p = g.player;
    const pose = this.pose;
    const ads = this.adsT;
    // (buceando, el arma va baja como corriendo)
    const sprint = (p.sprinting || p.underwater) && this.state !== 'reload' ? 1 : 0;
    this.sprintT = (this.sprintT || 0) + (sprint - (this.sprintT || 0)) * Math.min(1, dt * 8);
    const sp = this.sprintT;

    // al apuntar, la punta de la bombilla queda justo debajo de la mira
    const tip = this.model?.tip;
    const ads3 = tip ? tmpV2.set(-tip.x, -0.018 - tip.y, -0.3 - tip.z) : ADS;
    // con un mate en cada mano no se cruzan al correr: cada uno a su costado
    const akimbo = !!(st?.akimbo && this.model2);
    const target = tmpV.copy(HIP).lerp(ads3, ads).lerp(akimbo ? SPRINT_AKIMBO : SPRINT, sp);
    // (los mates, con la bombilla para arriba y abierta hacia afuera)
    let rx = sp * (akimbo ? 0.2 : -0.35);
    let ry = sp * (akimbo ? 0.1 : 0.7);
    let rz = sp * (akimbo ? -0.38 : 0.35);

    // balanceo al caminar
    const bobAmp = (p.moving && p.onGround ? 1 : 0) * (1 - ads * 0.85) * (1 + sp * 1.2);
    const bp = p.bobPhase;
    target.x += Math.cos(bp) * 0.011 * bobAmp;
    target.y += -Math.abs(Math.sin(bp)) * 0.012 * bobAmp;
    rz += Math.cos(bp) * 0.02 * bobAmp;
    // lo que hace cada mano por su lado [x (+ afuera), y, z, rx, ry, rz]:
    // corriendo, los brazos van y vienen al paso, uno adelante y otro atrás
    const akR = this.akR.fill(0);
    const akL = this.akL.fill(0);
    if (akimbo && sp > 0.01) {
      const pump = Math.sin(bp) * sp * (p.moving && p.onGround ? 1 : 0.25);
      for (const [a, s] of [[akR, 1], [akL, -1]]) {
        a[1] += pump * s * 0.035;
        a[2] -= pump * s * 0.045;
        a[3] += pump * s * 0.24;
      }
    }
    // respiración
    target.y += Math.sin(g.time * 1.6) * 0.0025 * (1 - ads);
    // inercia del mouse
    this.sway.x += (-input.mouse.dx * 0.00025 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (input.mouse.dy * 0.00025 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-0.03, 0.03);
    target.x += this.sway.x * (1 - ads * 0.7);
    target.y += this.sway.y * (1 - ads * 0.7);
    ry += this.sway.x * 1.5;
    rx += this.sway.y * 1.5;
    // retroceso
    const rk = this.recoilKick;
    target.z += rk * 0.025;
    rx += rk * 0.09;
    // agacharse / caer
    target.y -= p.landKick * 0.04;

    // estados
    const t = this.stateT;
    this.knife.visible = false;
    this.knifePlata.visible = false;
    this.nade.visible = false;
    this.pavaVm.visible = false;
    g.ee?.knife?.hideVm();
    this.holder.visible = this.state !== 'empty';
    let lower = 0;
    // la hoz sube menos tapada: se tiene que ver cómo la da vuelta en la muñeca
    if (this.state === 'raise') lower = (1 - Math.min(1, t / 0.35)) * (this.model?.hoz ? 0.5 : 1);
    let pour = null;
    let yerbaK = null;
    const hoz = this.model?.hoz || null;
    const gut = this.model?.gut || null;
    let gutK = null;
    let roll = 0;
    let trailOn = false;
    let sharpK = null;
    let mk3K = null;
    if (this.state === 'reload' && st?.kind === 'elemental') {
      // cada mate de la luz tiene su recarga (weapons/Elementales.js)
      const o = this.elem.reloadPose(st, Math.min(1, t / this.reloadTime), g.time);
      target.x += o[0];
      target.y += o[1];
      target.z += o[2];
      rx += o[3];
      ry += o[4];
      rz += o[5];
      lower = Math.max(lower, o[6]);
    } else if (this.state === 'reload' && st?.kind === 'liquid') {
      // la Liquidificador se carga con el porongo (weapons/Liquidificador.js)
      const o = this.liq.reloadPose(Math.min(1, t / this.reloadTime), g.time);
      target.x += o[0];
      target.y += o[1];
      target.z += o[2];
      rx += o[3];
      ry += o[4];
      rz += o[5];
    } else if (this.state === 'reload' && st?.kind === 'nova') {
      // la Supernova no se ceba: se traga las estrellas (weapons/Supernova.js)
      const o = this.nova.reloadPose(Math.min(1, t / this.reloadTime), g.time);
      target.x += o[0];
      target.y += o[1];
      target.z += o[2];
      rx += o[3];
      ry += o[4];
      rz += o[5];
    } else if (this.state === 'reload' && hoz) {
      // afilar la Hoz de la Muerte: la pone de costado y le pasa la piedra tres veces
      const k = Math.min(1, t / this.reloadTime);
      const e = smooth(clamp01(k / 0.14)) * (1 - smooth(clamp01((k - 0.86) / 0.14)));
      target.x += HOZ_SHARPEN[0] * e;
      target.y += HOZ_SHARPEN[1] * e;
      target.z += HOZ_SHARPEN[2] * e;
      rx += HOZ_SHARPEN[3] * e;
      ry += HOZ_SHARPEN[4] * e;
      rz += HOZ_SHARPEN[5] * e;
      roll += HOZ_SHARPEN[6] * e;
      // cada pasada de la piedra empuja un poquito la hoja
      const sp = clamp01((k - 0.2) / 0.6) * 3;
      const u = sp - Math.min(2, Math.floor(sp));
      if (k > 0.2 && k < 0.8 && u > 0.18 && u < 0.73) rz += Math.sin(((u - 0.18) / 0.55) * Math.PI) * 0.035;
      sharpK = k;
    } else if (this.state === 'reload' && st?.yerbaReload) {
      // cambiar la yerba: se vuelcan hacia afuera (la yerba lavada cae), bajan
      // a cargar yerba nueva de la bolsa y vuelven a subir llenos
      const k = Math.min(1, t / this.reloadTime);
      const dump = smooth(clamp01(k / 0.14)) * (1 - smooth(clamp01((k - 0.28) / 0.1)));
      rz -= dump * 0.95;
      rx -= dump * 0.3;
      target.x -= dump * 0.1;
      target.y += dump * 0.09;
      target.z -= dump * 0.03;
      // un sacudón al final del volcado para que salga todo
      rz += dump * Math.sin(t * 38) * 0.05 * smooth(clamp01((k - 0.16) / 0.06));
      lower = Math.max(lower, smooth(clamp01((k - 0.3) / 0.14)) * (1 - smooth(clamp01((k - 0.7) / 0.16))));
      yerbaK = k;
    } else if (this.state === 'reload' && gut) {
      // la Bombilla Gut se quiebra como una escopeta: la inclina, el caño cae
      // en la bisagra y escupe las usadas, baja un momento a cargar el atado
      // nuevo (fuera de cuadro) y se cierra de un golpe (ver animateGut)
      const k = Math.min(1, t / this.reloadTime);
      // la levanta con la boca para arriba: al caer el caño queda a la vista
      const e = smooth(clamp01(k / 0.14)) * (1 - smooth(clamp01((k - 0.84) / 0.16)));
      target.x -= e * 0.07;
      target.y += e * 0.07;
      target.z -= e * 0.04;
      rx += e * 0.6;
      ry += e * 0.35;
      rz += e * 0.45;
      // baja a cargar el atado nuevo
      const load = smooth(clamp01((k - 0.3) / 0.1)) * (1 - smooth(clamp01((k - 0.55) / 0.1)));
      target.y -= load * 0.07;
      rx -= load * 0.12;
      // el golpe para arriba que la cierra y el sacudón al amartillar
      rx += bump(k, 0.7, 0.05) * 0.2;
      target.y += bump(k, 0.7, 0.05) * 0.02;
      rz -= bump(k, 0.86, 0.04) * 0.05;
      gutK = k;
    } else if (this.state === 'reload' && st?.kind === 'mk3' && this.model2) {
      // Mark III: los pone de costado y saltan las cápsulas gastadas (cada
      // mano con su golpe de muñeca), bajan a calzar las nuevas, se juntan con
      // las bombillas casi tocándose, un arco las carga y al soltar la carga se
      // separan de un tirón (ver animateMk3)
      const k = Math.min(1, t / this.reloadTime);
      const show = smooth(clamp01(k / 0.1)) * (1 - smooth(clamp01((k - 0.22) / 0.08)));
      rz -= show * 0.5;
      rx += show * 0.3;
      ry += show * 0.25;
      target.y += show * 0.05;
      target.z += show * 0.04;
      for (const [a, at] of [[akR, 0.13], [akL, 0.19]]) {
        const b = bump(k, at, 0.035);
        a[1] += b * 0.015;
        a[3] += b * 0.22;
        a[5] -= b * 0.18;
      }
      lower = Math.max(lower, smooth(clamp01((k - 0.27) / 0.09)) * (1 - smooth(clamp01((k - 0.42) / 0.1))) * 0.85);
      const join = smooth(clamp01((k - 0.5) / 0.12)) * (1 - smooth(clamp01((k - 0.84) / 0.12)));
      // las bombillas paradas y juntas en punta, como una V dada vuelta
      target.x -= join * (HIP.x - 0.15);
      target.y += join * 0.03;
      target.z -= join * 0.02;
      ry += join * 0.14;
      rx += join * 0.5;
      // tiemblan mientras pasa la carga y pegan el tirón al soltarla
      const hum = join * clamp01((k - 0.58) / 0.1) * (1 - smooth(clamp01((k - 0.8) / 0.03)));
      target.x += Math.sin(t * 61) * 0.0025 * hum;
      target.y += Math.sin(t * 47 + 1) * 0.002 * hum;
      rx += bump(k, 0.82, 0.04) * 0.3;
      target.z += bump(k, 0.82, 0.04) * 0.03;
      mk3K = k;
    } else if (this.state === 'reload' && st && !st.shellReload) {
      // cebar: el mate se acerca y muestra la boca; el termo se la busca
      const k = Math.min(1, t / this.reloadTime);
      const tilt = smooth(clamp01(k / 0.2)) * (1 - smooth(clamp01((k - 0.84) / 0.16)));
      rz += tilt * 0.36;
      rx += tilt * 0.34;
      ry -= tilt * 0.12;
      target.x -= tilt * 0.06;
      target.y += tilt * 0.035;
      target.z += tilt * 0.03;
      pour = k;
    }
    if (this.state === 'reload' && st?.shellReload) {
      const k = (t / (st.reload * p.reloadMult)) % 1;
      rx += Math.sin(k * Math.PI) * 0.25;
      target.y -= Math.sin(k * Math.PI) * 0.02;
    }
    this.knifeTrail = null;
    if (this.state === 'knife') {
      // el mate se esconde del todo y rápido: si no, se ve abajo mientras corta
      lower = 1.2;
      const k = Math.min(1, t / KNIFE.time);
      const kn = this.bowie ? this.knifePlata : this.knife;
      kn.visible = true;
      const mv = KNIFE_MOVES[this.knifeMove] || KNIFE_MOVES.tajo;
      hozPose(mv.keys, k, KP);
      kn.position.set(KP[0], KP[1], KP[2]);
      kn.rotation.set(KP[3], KP[4], KP[5]);
      // la vista acompaña el tajo (un tironcito) y la hoja deja estela
      if (k >= mv.trail[0] && !this.knifeKick) {
        this.knifeKick = true;
        p.addRecoil(mv.kick[0], mv.kick[1]);
      }
      if (k >= mv.trail[0] && k <= mv.trail[1]) this.knifeTrail = kn;
    }
    let snap = false;
    if (this.state === 'swing' && hoz) {
      // la hoz: cada golpe es una serie de poses (carga, tajo, remate y vuelta)
      snap = true;
      const mv = HOZ_MOVES[this.swingMove] || HOZ_MOVES.fore;
      const k = Math.min(1, t / (this.swingTime || 0.5));
      hozPose(mv.keys, k, HZ);
      target.x += HZ[0];
      target.y += HZ[1];
      target.z += HZ[2];
      rx += HZ[3];
      ry += HZ[4];
      rz += HZ[5];
      roll += HZ[6];
      if (k >= mv.cut && !this.swingWhoosh) {
        this.swingWhoosh = true;
        g.audio.swish?.(!!st?.upgraded, this.swingMove === 'over' ? 1.25 : 1);
        p.addRecoil(mv.kick[0], mv.kick[1]);
        if (this.swingMove === 'over') g.fx.addShake(0.05);
      }
      trailOn = k >= mv.trail[0] && k <= mv.trail[1];
    }
    // al sacarla: la da vuelta en la muñeca y la para
    if (this.state === 'raise' && hoz) {
      const e = 1 - smooth(clamp01(t / 0.35));
      roll += e * 2.6;
      rz -= e * 0.7;
      rx += e * 0.3;
    }
    if (this.state === 'throw') {
      lower = 0.7;
      const k = Math.min(1, t / 0.6);
      const obj = this.throwKind === 'pava' ? this.pavaVm : this.throwKind === 'cuchillo' && g.ee?.knife ? g.ee.knife.vm : this.nade;
      obj.visible = !this.thrown;
      obj.position.set(0.12 - k * 0.05, -0.12 + Math.sin(k * Math.PI) * 0.1, -0.3 - k * 0.2);
      obj.rotation.set(-k * 2, 0, 0);
    }
    if (this.state === 'drink' && this.perkMate) {
      // tomar: la punta de la bombilla va a la boca, tres sorbos y el ruidito final
      lower = 1;
      const D = this.drinkTime;
      const k = smooth(clamp01((t - 0.15) / 0.45)) * (1 - smooth(clamp01((t - (D - 0.5)) / 0.45)));
      const pm = this.perkMate;
      this.viewDip = k * DRINK_DIP;
      this.drinkFrame.rotation.x = this.viewDip;
      pm.quaternion.slerpQuaternions(this.perkQ0, this.perkQ, k);
      const sip = k > 0.95 && t < 1.9 ? Math.max(0, Math.sin(((t - 0.62) * Math.PI * 2) / 0.28)) * 0.006 : 0;
      const local = tmpV2.copy(this.perkTip).applyQuaternion(pm.quaternion);
      // la punta de la bombilla va a la boca (justo debajo del borde de la pantalla)
      pm.position.copy(DRINK_MOUTH).sub(local).addScaledVector(DRINK_DIR, -sip);
      pm.position.x += (1 - k) * 0.12;
      pm.position.y -= (1 - k) * 0.25;
    } else this.viewDip = Math.max(0, (this.viewDip || 0) - dt * 2);
    // inspeccionar: lo trae al centro, inclina la boca para ver la yerba y lo
    // va girando despacio para mostrar la calabaza y la virola
    const insp = this.state === 'inspect' ? smooth(clamp01(t / 0.4)) : 0;
    this.inspK = (this.inspK || 0) + (insp - (this.inspK || 0)) * Math.min(1, dt * 12);
    const ik = this.inspK;
    if (ik > 0.001 && st?.kind === 'elemental') {
      const o = this.elem.inspectPose(st, ik, Math.max(0, t - 0.4));
      target.lerp(INSPECT, ik);
      target.x += o[0];
      target.y += o[1];
      target.z += o[2];
      rx += o[3];
      ry += o[4];
      rz += o[5];
    } else if (ik > 0.001 && hoz) {
      // la hoz: la acuesta en el medio y gira la muñeca para mostrar la hoja y el filo
      const c = Math.max(0, t - 0.4);
      target.lerp(INSPECT_HOZ, ik);
      rx += ik * (-0.45 + Math.sin(c * 0.9) * 0.12);
      ry += ik * Math.sin(c * 0.6) * 0.35;
      rz += ik * (0.7 + Math.sin(c * 0.5) * 0.15);
      roll += ik * Math.sin(c * 1.3) * 0.9;
    } else if (ik > 0.001 && gut) {
      // la Bombilla Gut: la muestra de costado, hace girar el atado como un
      // tambor y después la da vuelta para espiar la campana
      const c = Math.max(0, t - 0.4);
      const u = c % GUT_INSPECT;
      const peek = smooth(clamp01((u - 3.2) / 0.7)) * (1 - smooth(clamp01((u - 5.2) / 0.7)));
      target.lerp(INSPECT_GUT, ik);
      target.x += ik * peek * 0.05;
      rx += ik * (0.18 + Math.sin(c * 1.1) * 0.05 + peek * 0.5);
      ry += ik * (0.95 + Math.sin(c * 0.7) * 0.15 + peek * 0.45);
      rz += ik * (0.25 + Math.sin(c * 0.5 + 1) * 0.1 - peek * 0.2);
      // el golpecito con la palma que hace girar el atado
      rz -= ik * bump(u, 1.45, 0.12) * 0.08;
    } else if (ik > 0.001) {
      const c = Math.max(0, t - 0.4);
      target.lerp(INSPECT, ik);
      rx += ik * (0.62 + Math.sin(c * 1.05) * 0.16);
      ry += ik * (Math.sin(c * 0.7) * 0.85 - 0.2);
      rz += ik * (0.25 + Math.sin(c * 0.55 + 1) * 0.22);
    }
    const bg = this.model?.bombGroup;
    if (bg) bg.rotation.y = ik * Math.sin(Math.max(0, t - 0.6) * 1.6) * 0.9;
    if (this.state === 'empty') lower = 1;
    target.y -= lower * 0.35;
    rx -= lower * 0.5;

    // cargando un mate de la luz: lo levanta y tiembla
    if (st?.kind === 'elemental') {
      const o = this.elem.chargePose(g.time);
      target.x += o[0];
      target.y += o[1];
      target.z += o[2];
      rx += o[3];
    }
    pose.pos.lerp(target, Math.min(1, dt * (snap || this.state === 'knife' ? 40 : 18)));
    this.holder.position.copy(pose.pos);
    this.holder.rotation.set(rx, ry, rz);
    this.animateHoz(hoz, roll, trailOn, sharpK, dt, st);
    // la otra mano: la misma pose espejada (con su propio retroceso)
    this.holder2.visible = !!this.model2 && this.holder.visible;
    if (this.model2) {
      const dk = this.kickL - rk;
      this.holder.position.add(tmpV2.set(akR[0], akR[1], akR[2]));
      this.holder.rotation.set(rx + akR[3], ry + akR[4], rz + akR[5]);
      this.holder2.position.set(-pose.pos.x - akL[0], pose.pos.y + akL[1], pose.pos.z + dk * 0.025 + akL[2]);
      this.holder2.rotation.set(rx + dk * 0.09 + akL[3], -ry - akL[4], -rz - akL[5]);
    }
    this.animatePour(pour, dt);
    this.animateYerba(yerbaK, dt);
    this.animateGut(gut, gutK, ik, dt);

    // fogonazo
    this.flashT = (this.flashT || 0) - dt;
    this.flash.visible = this.flashT > 0 && !st?.special;
    if (this.flash.visible) {
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.scale.setScalar(st?.temp ? 0.018 + Math.random() * 0.012 : 0.05 + Math.random() * 0.05);
    }
    this.vmFlash.intensity = this.flashT > 0 ? (st?.temp ? 0.5 : 3) : 0;
    if (this.vmFlash.intensity > 0) this.model.muzzle.getWorldPosition(this.vmFlash.position);
    this.animateMk3(mk3K, dt, st);
    if (st?.kind === 'elemental') this.elem.animateModel(dt, st, this.model, this.state, t);

    // animaciones propias del arma
    const m = this.model;
    if (m) {
      for (const s of m.anim.spin) s.rotation.z += dt * (this.state === 'idle' ? 2 : 8);
      for (const gl of m.anim.glow) gl.scale.setScalar(0.85 + Math.sin(g.time * 8) * 0.15 + (this.flashT > 0 ? 0.5 : 0));
      if (m.anim.wobble) m.anim.wobble.rotation.z = Math.sin(g.time * 9) * 0.06 + this.sway.x * 3;
      if (m.anim.luz) this.animateLuz(m.anim.luz, dt);
    }
    if (m?.upgraded || this.slots.some((s) => s.up)) {
      const camo = getMats(this.T).camo;
      camo.map.offset.x = (g.time * 0.05) % 1;
      camo.map.offset.y = (g.time * 0.03) % 1;
      camo.emissiveIntensity = 0.7 + Math.sin(g.time * 3) * 0.25;
    }
    // la luz de la vista sigue un poco la del lugar
    const lvl = g.lightLevel ?? 1;
    this.vmHemi.intensity = 0.6 + lvl * 1.0;
    this.vmKey.intensity = 0.4 + lvl * 1.1;
  }

  // El Mate de la Luz Mala: la lucecita de la punta se va con cada tiro y se
  // vuelve a juntar (las chispitas se abren y vuelven a cerrarse); al cebar se
  // apaga y se enciende de a poco. Cargado con la Luz Mala (o mejorado), las
  // cruces y la calabaza laten y la punta echa lenguas de luz.
  animateLuz(L, dt) {
    const g = this.g;
    const s = this.slot;
    const M = getMats(this.T);
    this.luzCharge = Math.min(1, (this.luzCharge ?? 1) + dt * 2.5);
    let c = this.luzCharge;
    if (this.state === 'reload') {
      const k = Math.min(1, this.stateT / (this.reloadTime || 1));
      c *= k < 0.15 ? 1 - k / 0.15 : k > 0.7 ? (k - 0.7) / 0.3 : 0;
    }
    const e = c * c * (3 - 2 * c);
    const lit = !!(s?.lit || s?.up);
    const fl = 0.85 + Math.sin(g.time * 19) * 0.08 + Math.sin(g.time * 43) * 0.06;
    L.core.scale.setScalar(Math.max(0.001, e * fl * (lit ? 1.2 : 1)));
    L.halo.scale.setScalar(0.075 * (0.3 + 0.7 * e) * fl * (lit ? 1.35 : 1));
    L.halo.material.opacity = 0.8 * e;
    L.spin = (L.spin || 0) + dt * (3 + (1 - e) * 12);
    const n = L.motes.length;
    L.motes.forEach((m, i) => {
      const a = L.spin + (i / n) * Math.PI * 2;
      const r = 0.017 + (1 - e) * 0.03;
      m.position.set(Math.cos(a) * r, Math.sin(g.time * 4 + i * 2.1) * 0.005, Math.sin(a) * r);
      m.scale.setScalar(0.6 + 0.4 * e);
    });
    const pulse = lit ? 1.7 + Math.sin(g.time * 4) * 0.8 : 0.6;
    M.luzCross.color.setRGB(0.42 * pulse, pulse, 0.3 * pulse);
    M.gourdLuz.emissiveIntensity = lit ? 1.6 + Math.sin(g.time * 4) * 0.7 : 0.9;
    // la Eterna (mejorada): las venas laten y los fuegos fatuos le dan vueltas
    if (L.fatuos) {
      M.luzVein.color.setRGB(0.25 * pulse, 0.75 * pulse, 0.6 * pulse);
      M.gourdEterna.emissiveIntensity = 0.8 + Math.sin(g.time * 4) * 0.4;
      L.fat = (L.fat || 0) + dt * 0.9;
      L.fatuos.forEach((f, i) => {
        const a = L.fat + f.a0;
        f.o.position.set(Math.cos(a) * f.r, f.y + Math.sin(g.time * 2.3 + i * 1.7) * 0.006, Math.sin(a) * f.r);
        f.o.scale.setScalar(0.8 + Math.sin(g.time * 9 + i * 2) * 0.2);
      });
    }
    if (lit && e > 0.5 && this.state !== 'empty' && Math.random() < dt * 18) {
      const at = this.muzzleWorld(tmpV3);
      g.fx.add.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15, { color: [0.5, 1, 0.35], size: 0.035, size1: 0, life: 0.45 });
    }
  }

  // El termo busca la boca del mate: se ubica para que el pico quede arriba de
  // la yerba, se inclina y el chorro cae justo adentro (con vapor).
  animatePour(k, dt) {
    const T = this.termo;
    const tr = T.root;
    if (k === null || !this.model?.mouth) {
      tr.visible = false;
      T.stream.visible = false;
    } else {
      this.holder.updateMatrixWorld(true);
      const mouth = this.model.mouth.getWorldPosition(tmpV3);
      const enter = smooth(clamp01((k - 0.03) / 0.2));
      const leave = smooth(clamp01((k - 0.8) / 0.17));
      const tip = smooth(clamp01((k - 0.14) / 0.16)) * (1 - smooth(clamp01((k - 0.72) / 0.12)));
      const g = this.g;
      tr.visible = k > 0.03 && k < 0.97;
      tr.rotation.set(0.12, -0.3, -0.4 - tip * 1.52 + Math.sin(g.time * 7) * 0.025 * tip);
      const local = tmpV2.copy(this.spoutLocal).applyEuler(tr.rotation);
      tr.position.copy(mouth).add(tmpV.set(-0.018, 0.065 + (1 - tip) * 0.05, 0.004)).sub(local);
      const away = 1 - enter + leave;
      tr.position.x -= away * 0.24;
      tr.position.y -= away * 0.32;
      tr.position.z += away * 0.06;
      const pouring = tip > 0.9 && k < 0.74;
      T.stream.visible = pouring;
      if (pouring) {
        tr.updateMatrixWorld(true);
        const a = T.spoutTip.getWorldPosition(tmpV);
        const d = tmpV2.subVectors(mouth, a);
        const len = d.length();
        T.stream.position.copy(a);
        T.stream.quaternion.setFromUnitVectors(DOWN, d.normalize());
        const w = 1 + Math.sin(g.time * 47) * 0.12;
        T.stream.scale.set(w, len, w);
        this.puffT -= dt;
        if (this.puffT <= 0) {
          this.puffT = 0.09;
          const p = this.puffs.find((x) => x.life <= 0);
          if (p) {
            p.life = 0.9;
            p.s.position.copy(mouth).add(tmpV.set((Math.random() - 0.5) * 0.02, 0.005, (Math.random() - 0.5) * 0.02));
            p.vel.set((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.03, (Math.random() - 0.5) * 0.02);
            p.s.visible = true;
          }
        }
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.vel, dt);
      const a = Math.max(0, p.life / 0.9);
      p.s.material.opacity = a * (1 - a) * 1.1;
      p.s.scale.setScalar(0.012 + (1 - a) * 0.05);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  // La hoz, después de ubicar la mano: la muñeca, la estela del tajo, la piedra
  // de afilar con sus chispas y el brillo del filo de la Hoz de la Muerte.
  animateHoz(hoz, roll, trailOn, sharpK, dt, st) {
    const g = this.g;
    if (hoz) {
      hoz.wrist.rotation.copy(hoz.baseRot);
      hoz.wrist.rotateY(roll);
      this.holder.updateMatrixWorld(true);
    }
    // estela: la más nueva primero; se borran solas
    const pts = this.trailPts;
    for (const s of pts) s.age += dt;
    while (pts.length && pts[pts.length - 1].age > TRAIL_LIFE) this.trailFree.push(pts.pop());
    const kt = this.knifeTrail;
    if (kt) this.trailKnife = true;
    else if (trailOn && hoz) this.trailKnife = false;
    if ((trailOn && hoz) || kt) {
      const s = this.trailFree.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      if (kt) kt.updateMatrixWorld(true);
      (kt ? kt.userData.tip : this.model.muzzle).getWorldPosition(s.a);
      (kt ? kt.userData.mid : hoz.mid).getWorldPosition(s.b);
      s.age = 0;
      pts.unshift(s);
      if (pts.length > TRAIL_MAX) this.trailFree.push(pts.pop());
    }
    const tg = this.trail.geometry;
    if (pts.length < 2) tg.setDrawRange(0, 0);
    else {
      const P = tg.attributes.position.array;
      const C = tg.attributes.color.array;
      const col = this.trailKnife ? TRAIL_KNIFE : st?.id === 'facon' ? TRAIL_FACON : st?.upgraded ? TRAIL_DEATH : TRAIL_STEEL;
      const n = pts.length;
      let v = 0;
      for (let i = 0; i < n - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(n - 1, i + 2)];
        const steps = TRAIL_SUB + (i === n - 2 ? 1 : 0);
        for (let j = 0; j < steps; j++) {
          const u = j / TRAIL_SUB;
          const a = catmull(p0.a, p1.a, p2.a, p3.a, u, tmpV);
          const b = catmull(p0.b, p1.b, p2.b, p3.b, u, tmpV2);
          const age = p1.age + (p2.age - p1.age) * u;
          const f = Math.max(0, 1 - age / TRAIL_LIFE) ** 1.5;
          P.set([a.x, a.y, a.z, b.x, b.y, b.z], v * 6);
          C.set([col.r * f, col.g * f, col.b * f, col.r * f * 0.12, col.g * f * 0.12, col.b * f * 0.12], v * 6);
          v++;
        }
      }
      tg.setDrawRange(0, (v - 1) * 6);
      tg.attributes.position.needsUpdate = true;
      tg.attributes.color.needsUpdate = true;
    }
    // el filo de la Hoz de la Muerte brilla al cargar la medialuna y al terminar de afilar
    if (hoz?.glow) {
      hoz.glowBase ||= hoz.glow.color.clone();
      let boost = 0;
      if (this.state === 'swing' && this.swingMove === 'toss') {
        const k = this.stateT / (this.swingTime || 0.5);
        boost = smooth(clamp01(k / 0.35)) * (1 - smooth(clamp01((k - 0.4) / 0.25))) * 1.4;
      }
      if (sharpK !== null) boost = Math.max(boost, clamp01((sharpK - 0.74) / 0.06) * (1 - smooth(clamp01((sharpK - 0.82) / 0.16))) * 2);
      hoz.glow.color.copy(hoz.glowBase).multiplyScalar(1 + boost);
    }
    // la piedra: entra por abajo, tres pasadas de la virola a la punta y se va
    const W = this.whet;
    if (sharpK === null || !hoz) W.root.visible = false;
    else {
      const k = sharpK;
      const come = smooth(clamp01((k - 0.05) / 0.14)) * (1 - smooth(clamp01((k - 0.8) / 0.12)));
      W.root.visible = come > 0.01;
      const sp = clamp01((k - 0.2) / 0.6) * 3;
      const n = Math.min(2, Math.floor(sp));
      const u = sp - n;
      let along = 0.12;
      let lift = 1;
      if (k >= 0.2 && k < 0.8) {
        if (u < 0.18) lift = 1 - smooth(u / 0.18);
        else if (u < 0.73) {
          along = 0.12 + 0.8 * smooth((u - 0.18) / 0.55);
          lift = 0;
          if (this.sharpStroke !== n) {
            this.sharpStroke = n;
            g.audio.sharpen?.(n === 2);
          }
        } else {
          const r = smooth((u - 0.73) / 0.27);
          along = 0.92 - 0.8 * r;
          lift = Math.min(1, r * 2);
        }
      }
      const c = hoz.blade.localToWorld(hoz.edgeAt(along, tmpV3));
      W.root.quaternion.setFromUnitVectors(UP_AXIS, WHET_AXIS);
      W.root.position.copy(c).addScaledVector(WHET_AXIS, -(0.142 + lift * 0.035));
      W.root.position.lerp(WHET_OFF, 1 - come);
      // chispas mientras la piedra corre por el filo
      if (lift === 0 && come > 0.9 && Math.random() < dt * 40) {
        const s = this.sparkles.find((x) => x.life <= 0);
        if (s) {
          const ahead = hoz.blade.localToWorld(hoz.edgeAt(Math.min(1, along + 0.05), tmpV2)).sub(c).normalize();
          s.life = 0.22 + Math.random() * 0.15;
          s.s.visible = true;
          s.s.position.copy(c);
          s.vel.copy(ahead).multiplyScalar(0.25 + Math.random() * 0.25).add(tmpV.set((Math.random() - 0.5) * 0.25, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25));
          s.s.material.color.setHex(st?.upgraded ? (Math.random() < 0.5 ? 0x9affc8 : 0xe8fff0) : 0xffc070);
        }
      }
    }
    for (const s of this.sparkles) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= dt * 1.4;
      s.s.position.addScaledVector(s.vel, dt);
      s.s.scale.setScalar(0.006 + s.life * 0.022);
      s.s.material.opacity = Math.min(1, s.life * 5);
      if (s.life <= 0) s.s.visible = false;
    }
  }

  // La Bombilla Gut por dentro: la bisagra del caño, las bombillas usadas que
  // salen volando, el martillo y el atado que gira. k es el avance de la
  // recarga (null si no recarga); ik, la inspección.
  animateGut(gut, k, ik, dt) {
    const g = this.g;
    if (gut) {
      let open = 0;
      let cock = 0;
      if (k !== null) {
        open = smooth(clamp01((k - 0.12) / 0.06)) * (1 - smooth(clamp01((k - 0.68) / 0.04)));
        cock = smooth(clamp01((k - 0.84) / 0.04)) * (1 - smooth(clamp01((k - 0.92) / 0.06)));
        // sonidos a medida que pasa cada paso: abre, entra el atado (dos
        // golpecitos), cierra y amartilla
        const stage = k < 0.16 ? 0 : k < 0.42 ? 1 : k < 0.5 ? 2 : k < 0.7 ? 3 : k < 0.84 ? 4 : 5;
        while ((this.gutStage || 0) < stage) {
          this.gutStage = (this.gutStage || 0) + 1;
          const n = g.audio.now;
          if (this.gutStage === 1) {
            g.audio.mech(n, [0, 0.06]);
            this.ejectSpent(gut);
          } else if (this.gutStage === 2 || this.gutStage === 3) g.audio.shell();
          else if (this.gutStage === 4) g.audio.mech(n, [0, 0.025]);
          else g.audio.mech(n, [0]);
        }
      }
      // al cerrar rebota un poquito contra la culata
      gut.barrel.rotation.x = -0.62 * open + (k !== null ? bump(k, 0.705, 0.03) * 0.05 : 0);
      gut.hammer.rotation.x = -0.4 - cock * 0.75 + (this.flashT > 0 ? 0.3 : 0);
      // el atado gira: al cerrar y con el golpe de la inspección, y frena solo
      let spin = k !== null ? 20 * bump(k, 0.75, 0.07) : 0;
      if (ik > 0.001) {
        const u = Math.max(0, this.stateT - 0.4) % GUT_INSPECT;
        if (u > 1.45) spin = Math.max(spin, 19 * Math.exp(-(u - 1.45) * 1.5) * ik);
      }
      gut.bundle.rotation.z += spin * dt;
      // el trinquete: un clic por bombilla mientras va despacio
      const tooth = Math.floor(gut.bundle.rotation.z / ((Math.PI * 2) / 7));
      if (tooth !== this.gutTooth) {
        this.gutTooth = tooth;
        if (spin > 0.6 && spin < 11) g.audio.mech(g.audio.now, [0]);
      }
    }
    for (const b of this.spent) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vel.y -= dt * 3.2;
      b.s.position.addScaledVector(b.vel, dt);
      b.s.rotation.x += b.spin.x * dt;
      b.s.rotation.z += b.spin.z * dt;
      if (b.life <= 0) b.s.visible = false;
    }
  }

  // El Mark III por dentro: el brillo de las cápsulas (se apagan, saltan,
  // vuelven apagadas y se cargan), los anillos de los dos mates y el arco
  // entre las bombillas. k es el avance de la recarga (null si no recarga).
  animateMk3(k, dt, st) {
    const g = this.g;
    const models = st?.kind === 'mk3' ? [this.model, this.model2].filter((m) => m?.mk3) : [];
    let arc = 0;
    let release = 0;
    if (models.length) {
      let charge = 1;
      let boost = 0;
      if (k !== null) {
        charge = k < 0.3 ? 1 - smooth(clamp01((k - 0.02) / 0.1)) * 0.75 : 0.12 + 0.88 * smooth(clamp01((k - 0.58) / 0.22));
        boost = smooth(clamp01((k - 0.55) / 0.2)) * (1 - smooth(clamp01((k - 0.86) / 0.1)));
        arc = k > 0.58 && k < 0.81 ? 1 : 0;
        release = bump(k, 0.815, 0.03);
        // saltan las cápsulas (primero la derecha) y se suelta la carga
        const stage = k < 0.13 ? 0 : k < 0.19 ? 1 : k < 0.81 ? 2 : 3;
        while (this.mk3Stage < stage) {
          this.mk3Stage++;
          if (this.mk3Stage <= 2) {
            const m = models[this.mk3Stage - 1];
            if (m) this.ejectCell(m, this.cells[this.mk3Stage - 1]);
          } else {
            for (const m of models) this.vmSparks(m.muzzle, m.mk3.left ? 0x9affb0 : 0xffd070, 8, 0.5);
            g.fx.addShake?.(0.04);
          }
        }
      }
      const fire = this.flashT > 0 ? 0.6 : 0;
      models.forEach((m, i) => {
        const M3 = m.mk3;
        // sin cápsula desde que salta hasta que vuelve de abajo con la nueva
        M3.core.visible = !(k !== null && k > (i ? 0.19 : 0.13) && k < 0.4);
        const pulse = 0.9 + Math.sin(g.time * 7 + i * 1.7) * 0.1;
        M3.coreMat.color.copy(M3.coreMat.userData.base).multiplyScalar((0.15 + 0.85 * charge) * pulse + fire + release * 1.5);
        M3.core.scale.setScalar(0.85 + 0.15 * charge + release * 0.35);
        // los anillos del izquierdo giran igual que los del derecho
        const spin = (m === this.model2 ? (this.state === 'idle' ? 2 : 8) : 0) + boost * 40;
        for (const s of m.anim.spin) s.rotation.z += dt * spin;
      });
    }
    // el arco entre las dos bombillas: dos hilos quebrados que cambian solos
    const segs = this.arcSegs;
    if (!arc || models.length < 2) {
      if (this.arcLit) {
        this.arcLit = false;
        for (const s of segs) s.visible = false;
        this.arcGlow.visible = false;
        this.vmFlash.color.setHex(0xffb060);
      }
    } else {
      this.arcLit = true;
      this.holder.updateMatrixWorld(true);
      this.holder2.updateMatrixWorld(true);
      const A = this.vmRoot.worldToLocal(this.model.muzzle.getWorldPosition(tmpV3));
      const B = this.vmRoot.worldToLocal(this.model2.muzzle.getWorldPosition(tmpV2));
      const dir = tmpV.subVectors(B, A);
      const len = dir.length();
      dir.divideScalar(len || 1);
      const p1 = (this.arcP1 ||= new THREE.Vector3()).crossVectors(dir, UP_AXIS).normalize();
      const p2 = (this.arcP2 ||= new THREE.Vector3()).crossVectors(dir, p1).normalize();
      if (g.time - (this.arcT || 0) > 0.04) {
        this.arcT = g.time;
        this.arcJit = Array.from({ length: 2 * (ARC_N + 1) * 2 }, () => Math.random() * 2 - 1);
      }
      const J = this.arcJit;
      const P = this.arcPts;
      for (let s = 0; s < 2; s++) {
        const amp = len * (s ? 0.12 : 0.22);
        for (let i = 0; i <= ARC_N; i++) {
          const u = i / ARC_N;
          const w = Math.sin(Math.PI * u) * amp;
          const j = (s * (ARC_N + 1) + i) * 2;
          P[i].copy(A).addScaledVector(dir, len * u).addScaledVector(p1, J[j] * w).addScaledVector(p2, J[j + 1] * w);
        }
        for (let i = 0; i < ARC_N; i++) {
          const m = segs[s * ARC_N + i];
          const d = (this.arcD ||= new THREE.Vector3()).subVectors(P[i + 1], P[i]);
          const l = d.length();
          m.visible = true;
          m.position.copy(P[i]).addScaledVector(d, 0.5);
          m.quaternion.setFromUnitVectors(UP_AXIS, d.divideScalar(l || 1));
          const r = (s ? 0.0016 : 0.003) * (0.7 + Math.random() * 0.6);
          m.scale.set(r, l, r);
        }
      }
      for (const m of this.arcMats) m.opacity = 0.55 + Math.random() * 0.45;
      this.arcGlow.visible = true;
      this.arcGlow.position.copy(A).lerp(B, 0.5);
      this.arcGlow.scale.setScalar(len * (0.9 + Math.random() * 0.5));
      this.arcGlow.material.opacity = 0.35 + Math.random() * 0.25;
      // la luz verde del arco sobre los mates y las manos
      this.vmFlash.color.setHex(0x9affb0);
      this.vmFlash.intensity = 1.5 + Math.random() * 1.5;
      this.vmFlash.position.copy(A).lerp(B, 0.5);
      if (Math.random() < dt * 25) this.vmSparks(Math.random() < 0.5 ? this.model.muzzle : this.model2.muzzle, 0xd8ffe0, 1, 0.3);
    }
    if (release > 0.05 && models.length) {
      // (arcLit hace que la luz vuelva a su color al terminar)
      this.arcLit = true;
      this.vmFlash.color.setHex(0xfff0c0);
      this.vmFlash.intensity = Math.max(this.vmFlash.intensity, release * 4);
      this.model.muzzle.getWorldPosition(this.vmFlash.position);
    }
    for (const c of this.cells) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= dt * 3.2;
      c.s.position.addScaledVector(c.vel, dt);
      c.s.rotation.x += c.spin.x * dt;
      c.s.rotation.z += c.spin.z * dt;
      if (c.life <= 0) c.s.visible = false;
    }
  }

  // La cápsula gastada salta de la ventanita hacia afuera, con chispas y humo.
  ejectCell(m, c) {
    this.holder.updateMatrixWorld(true);
    this.holder2.updateMatrixWorld(true);
    const at = this.vmRoot.worldToLocal(m.mk3.win.getWorldPosition(tmpV3));
    const out = m.mk3.left ? -1 : 1;
    c.life = 0.85;
    c.s.visible = true;
    c.s.position.copy(at);
    // sale para arriba y apenas hacia afuera, así se la ve caer
    c.vel.set(out * (0.07 + Math.random() * 0.05), 0.6 + Math.random() * 0.12, 0.06 + Math.random() * 0.04);
    c.s.rotation.set(Math.random(), 0, Math.PI / 2);
    c.spin.set((Math.random() - 0.5) * 16, 0, out * (10 + Math.random() * 8));
    this.vmSparks(m.mk3.win, m.mk3.left ? 0x9affb0 : 0xffc060, 6, 0.4);
    for (let i = 0; i < 2; i++) {
      const p = this.puffs.find((x) => x.life <= 0);
      if (!p) break;
      p.life = 0.9;
      p.s.visible = true;
      p.s.position.copy(at);
      p.vel.set(out * 0.03, 0.06 + Math.random() * 0.03, 0.02);
    }
  }

  // Chispitas de la vista que salen de un objeto (usa las de la piedra de afilar).
  vmSparks(obj, color, n, speed) {
    const at = this.vmRoot.worldToLocal(obj.getWorldPosition(this.burstAt ||= new THREE.Vector3()));
    for (let i = 0; i < n; i++) {
      const s = this.sparkles.find((x) => x.life <= 0);
      if (!s) break;
      s.life = 0.18 + Math.random() * 0.2;
      s.s.visible = true;
      s.s.position.copy(at);
      s.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      s.s.material.color.setHex(color);
    }
  }

  // Las bombillas usadas saltan de la recámara para arriba y a la derecha.
  ejectSpent(gut) {
    this.holder.updateMatrixWorld(true);
    const at = gut.breech.getWorldPosition(tmpV3);
    this.vmRoot.worldToLocal(at);
    for (const b of this.spent) {
      b.life = 0.7 + Math.random() * 0.2;
      b.s.visible = true;
      b.s.position.copy(at).add(tmpV2.set((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, 0));
      b.vel.set(0.2 + Math.random() * 0.15, 0.6 + Math.random() * 0.3, -0.05 + Math.random() * 0.15);
      b.s.rotation.set(Math.PI / 2, 0, Math.random());
      b.spin.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
    }
  }

  // "Cambiar la yerba": la vieja cae en migas al volcar; la nueva vuelve con
  // los mates cuando suben.
  animateYerba(k, dt) {
    const models = [this.model, this.model2].filter(Boolean);
    if (k === null) {
      for (const m of models) if (m.yerba) m.yerba.visible = true;
    } else {
      this.holder.updateMatrixWorld(true);
      this.holder2.updateMatrixWorld(true);
      for (const m of models) if (m.yerba) m.yerba.visible = k < 0.2 || k > 0.62;
      // migas de yerba cayendo mientras están volcados
      if (k > 0.1 && k < 0.3) {
        for (const m of models) {
          if (Math.random() > dt * 70) continue;
          const c = this.crumbs.find((x) => x.life <= 0);
          if (!c) break;
          c.life = 0.6;
          m.mouth.getWorldPosition(c.s.position);
          c.vel.set((Math.random() - 0.5) * 0.06, -0.1, -0.05 + (Math.random() - 0.5) * 0.05);
          c.s.visible = true;
        }
      }
    }
    for (const c of this.crumbs) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= dt * 1.2;
      c.s.position.addScaledVector(c.vel, dt);
      c.s.scale.setScalar(0.009 + Math.random() * 0.004);
      c.s.material.opacity = Math.min(1, c.life * 3);
      if (c.life <= 0) c.s.visible = false;
    }
  }

  // Tamaño de la mira (para el HUD).
  get crosshair() {
    const st = this.stats;
    if (!st) return 0;
    const p = this.g.player;
    let s = st.spread || 0.02;
    if (p.moving) s *= 1.5;
    if (p.crouching) s *= 0.75;
    if (!p.onGround) s *= 2;
    s += this.bloom * 0.04;
    return s * (1 - this.adsT);
  }
}

// Estela del tajo: un arco que se desvanece hacia la punta.
// Pose de la hoz en la fracción k de un golpe (claves [k, pose, curva]).
function hozPose(keys, k, out) {
  let i = 1;
  while (i < keys.length - 1 && k > keys[i][0]) i++;
  const [k0, a] = keys[i - 1];
  const [k1, b, ease] = keys[i];
  let u = clamp01((k - k0) / (k1 - k0 || 1));
  u = ease === 'i' ? u * u * u : ease === 'o' ? 1 - (1 - u) ** 3 : smooth(u);
  for (let j = 0; j < 7; j++) out[j] = a[j] + (b[j] - a[j]) * u;
  return out;
}

// Catmull-Rom entre p1 y p2 (para que la estela sea una curva y no un serrucho).
function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const c of ['x', 'y', 'z']) {
    out[c] = 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3);
  }
  return out;
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

// Pulso suave que sube y baja alrededor de c (ancho w a cada lado).
function bump(k, c, w) {
  return smooth(clamp01(1 - Math.abs(k - c) / w));
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function colorArr(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export { tmpQ, HIP };
