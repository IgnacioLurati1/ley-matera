import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FEATURES } from '../config/map';
import { gbufferPass, gbBegin, gbDrop } from '../core/sizeCull';

// El rebote de luz de Épica (fx/Bounce, de 59). Mientras el archivo no está,
// no hay rebote (así no se rompe nada).
const Bounce = Object.values(import.meta.glob('./Bounce.js', { eager: true }))[0]?.default || null;

// Lo que suman las calidades altas, de a poco (cada una tiene lo de la anterior):
//  - Media: sombras vivas (la luna se recalcula cada cuadro: los zombies tiran sombra)
//  - Alta: sombras más suaves y oclusión ambiental liviana (GTAO) en rincones,
//    bajo los props y contra las paredes
//  - Ultra: oclusión completa, reflejos en pantalla (metal, vidrio, agua y el piso
//    mojado cuando llueve), haces de luna volumétricos y los fuegos más cercanos con sombra
//  - Épica: más fuegos con sombra y el rebote de la luz (fx/Bounce)
// La oclusión y los reflejos salen de un G-buffer propio (normales + profundidad
// + cuánto refleja cada material).
// (Baja y Rendimiento no usan nada de esto; Épica suma lámparas con sombra)
export const LEVELS = {
  medium: { live: true, soft: 1.5 },
  high: { live: true, soft: 2, ao: 8 },
  ultra: { live: true, soft: 2.5, ao: 12, light: true, lamps: 3 },
  epic: { live: true, soft: 2.5, ao: 12, light: true, lamps: 5, bounce: true },
};

// Cuántas luces cercanas pueden tirar sombra (cada una renderiza la escena 6 veces).
// Es el máximo: Ultra usa las tres más cercanas y Épica cinco (con una sola,
// las demás no tiraban sombra hasta tenerlas encima).
const SHADOW_LIGHTS = 5;
const REFL_STEPS = 16;
// (los reflejos: cuánto corre cada píxel el arranque de la marcha, y si promedia el color del choque)
const OLD_SSR = globalThis.__mduOldSsr === true;
// La oclusión de cada mapa. El castillo tiene salones enormes y techos altos:
// con el radio de siempre solo se notaba en los rincones chicos.
const AO_BASE = { radius: 0.7, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, blend: 0.95, more: 0 };
// Cuánto se ven los haces de la luna en la niebla (VolPass) en cada mapa. En
// el estero la luna está baja y se la mira casi de frente: el brillo hacia
// adelante (la fase) ya la hace mucho más fuerte; con más, todo quedaba lechoso.
// sky: cuánta bruma va sobre el cielo (el estero lo quiere de noche cerrada).
// El Monumento: la Torre (70 m) corta la luna en la bruma del cielo y arriba
// de ella quedaban haces y una cuña clara contra las estrellas; poca bruma en
// el cielo (abajo, entre los edificios, los haces siguen).
// (Eclipse Matero, sesión 1f: la luz volumétrica pintaba de bruma gris el
// cielo alrededor del eclipse y dejaba rayos de sombra en el aire —las rejas
// "volando" que vio el usuario—; con la niebla más espesa de eclipseMood,
// todavía más. globalThis.__mduNoEclVol: como antes)
const VOL_MAP = { esteros: { scatter: 0.6, sky: 0.25 }, monumento: { sky: 0.15 }, ...(globalThis.__mduNoEclVol === true ? {} : { eclipse: { scatter: 0.35, sky: 0.1 } }) };
const AO_MAP = {
  castillo: { radius: 1.4, distanceExponent: 1.4, thickness: 2.4, scale: 1.8, blend: 1, more: 4 },
  // Eclipse Matero (grafica-v3): islas abiertas con muros, utilería grande y
  // barrancos; con el radio de los cuartos chicos "no se veía la oclusión"
  // (globalThis.__mduNoEclAo: la de siempre)
  // (pow: la oclusión elevada, más marcada en los rincones; islas abiertas de noche)
  // (2026-10-09, el usuario: "la oclusión en el mapa está medio rara": con
  // radio 1,8, grosor 2,6, escala 2,2 y elevada a 2,2 oscurecía cosas enteras
  // —la máquina del molino, las rejas del penal, la estatua del Monumento— y
  // se comía los charcos de luz y los faroles. Más suave: sigue marcando los
  // rincones. globalThis.__mduOldEclAo10: como antes)
  eclipse: globalThis.__mduOldEclAo10 === true ? { radius: 1.8, distanceExponent: 1.4, thickness: 2.6, scale: 2.2, blend: 1, more: 4, pow: 2.2 } : { radius: 1.2, distanceExponent: 1.4, thickness: 1.6, scale: 1.5, blend: 1, more: 4, pow: 1.3 },
};
// Cómo se elige qué fuego tira sombra (Epic.pickLamps).
const LAMP_FALL = 7; // a esta distancia un fuego cuenta la mitad
const LAMP_HOLD = 1.3; // ventaja del que ya tiene sombra (sin idas y vueltas)
const LAMP_IN = 0.35; // segundos en que aparece una sombra
const LAMP_OUT = 0.2; // y en que se va
const LAMP_WAIT = 0.6; // segundos que un fuego tiene que estar quieto y prendido// Cubos de sombra de fuegos guardados (lo quieto de cada uno: volver a un
// fuego es copiarlo, no redibujarlo).
const LAMP_CACHE = 8;

// El pasto en el G-buffer: su marca en el alfa (-7/15, aparte del agua) y
// cuánta oclusión le queda (GTAO a media resolución sobre hojas finitas hacía
// manchones negros que caminaban).
export const FOLIAGE_B = -7;
const FOLIAGE_AO = 0.3;

// Qué tanto refleja un material, de 0 a 15 (va en el alfa del G-buffer).
function reflOf(m) {
  if (!m || m.isShaderMaterial) return 0;
  // el agua (fx/Water) trae su propio reflejo: -1 = ni el de pantalla ni el del piso mojado
  if (m.userData?.water) return -15;
  // el pasto (recortes de doble cara y las matas): sin reflejo y con poca
  // oclusión. Solo en el estero (Mate no Numa), que es para lo que se hizo: en
  // los otros mapas queda como estaba (el usuario, 2026-09-26)
  // (userData.gbuf: un recorte que pide ir al G-buffer en cualquier mapa, como
  // el maizal del Prado: world/Prado.js)
  // (gbuf.solid: el vértice propio de algo que no es pasto, los zombies de entities/zombieBatch)
  if ((FEATURES.esteros && (m.userData?.foliage || (m.alphaTest > 0 && m.map && m.side === THREE.DoubleSide))) || (m.userData?.gbuf && !m.userData.gbuf.solid)) return FOLIAGE_B;
  // (con mapa de rugosidad de fx/Surfaces, la media que dejó ahí)
  let rough = m.userData?.reflRough ?? m.roughness;
  if (rough === undefined) rough = m.shininess ? 1 - Math.min(1, m.shininess / 90) : 1;
  const metal = m.metalness || 0;
  let r = (1 - rough) * (0.35 + 0.65 * metal);
  // vidrio y agua: transparentes y lisos
  if (m.transparent && m.opacity < 0.97 && rough < 0.5) r = Math.max(r, 0.4);
  return Math.round(Math.min(1, r / 0.8) * 15);
}

// El orden de three (r186) para lo opaco y lo transparente (WebGLRenderList).
function painter(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
}
function painterBack(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.z !== b.z) return b.z - a.z;
  return a.id - b.id;
}

// La última pasada de arriba (no anidada) de una escena: cuál, con qué cámara
// y sus matrices en ese momento (GBufferPass.fromMain).
function watch(renderer) {
  let rec = renderer.__gbRec;
  if (rec) return rec;
  rec = renderer.__gbRec = { scene: null, camera: null, at: 0, depth: 0, m: new Float64Array(32) };
  const render = renderer.render;
  renderer.render = function (scene, camera) {
    const top = rec.depth === 0;
    rec.depth++;
    try {
      return render.call(this, scene, camera);
    } finally {
      rec.depth--;
      if (top && scene.isScene === true) {
        rec.scene = scene;
        rec.camera = camera;
        rec.at++;
        const pe = camera.projectionMatrix.elements;
        const ve = camera.matrixWorldInverse.elements;
        for (let i = 0; i < 16; i++) {
          rec.m[i] = pe[i];
          rec.m[16 + i] = ve[i];
        }
      }
    }
  };
  return rec;
}

// La escena vacía del G-buffer se dibuja con la lista armada (three pide la
// lista de cada escena a renderLists.get).
const PROXY_LISTS = new WeakMap();
function hijack(renderer) {
  const rl = renderer.renderLists;
  if (rl.__gbHijack === true) return;
  rl.__gbHijack = true;
  const get = rl.get;
  rl.get = function (scene, depth) {
    const L = PROXY_LISTS.get(scene);
    return L !== undefined ? L : get.call(this, scene, depth);
  };
}

// El G-buffer: toda la escena con normales en vista y el reflejo en el alfa.
class GBufferPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.depthTexture = new THREE.DepthTexture(1, 1);
    this.depthTexture.format = THREE.DepthStencilFormat;
    this.depthTexture.type = THREE.UnsignedInt248Type;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: this.depthTexture,
    });
    this.mats = new Map();
    this.refl = new WeakMap();
    // el material del G-buffer de cada malla (armar la clave de texto en cada
    // cuadro para cada malla era basura para el recolector)
    this.pick = new WeakMap();
    // un número por cada userData.gbuf (ver material())
    this.gbIds = new WeakMap();
    this.gbN = 0;
    this.reflT = 0;
    // listas que se reusan (vaciarlas con length = 0 les suelta la memoria y
    // cada cuadro volvían a crecer)
    this.swapped = [];
    this.nSwapped = 0;
    this.hidden = [];
    this.nHidden = 0;
    this.scale = 1;
    this.w = 1;
    this.h = 1;
    // la lista del pase principal (fromMain): una escena vacía que se dibuja
    // con la lista que se arma acá
    this.proxy = new THREE.Scene();
    this.proxy.matrixWorldAutoUpdate = false;
    this.items = [];
    this.pool = [];
    this.nItems = 0;
    this.list = { opaque: this.items, transmissive: [], transparent: [], init() {}, push() {}, unshift() {}, finish() {}, sort() {} };
    PROXY_LISTS.set(this.proxy, this.list);
    this.seen = new Set();
    this.up = new Map();
    this.chain = [];
    this.usedAt = -1;
  }

  // Un material por combinación de objeto: si el mismo material pasa de un
  // mesh común a uno instanciado, three recalcula el programa en cada cambio.
  // Con el relieve (fx/Surfaces) va también su normal map, pero solo en lo que
  // refleja (b >= 2): los reflejos siguen las juntas. En lo mate (revoque,
  // ladrillo, tierra) el relieve ya lo dibuja la pasada principal; acá solo
  // tocaba la oclusión y el rebote, no se notaba y costaba 0,4-0,65 ms a 1440p.
  material(o, src, b) {
    const side = src.side ?? THREE.FrontSide;
    const morph = o.geometry?.morphAttributes?.position ? 1 : 0;
    const nm = (b >= 2 && src.normalMap) || null;
    // los recortes (pajonal, hojas, flecos de paja) van con su mismo recorte: si
    // no estaban, la niebla con luz y la oclusión de lo de atrás se dibujaban
    // encima y el pasto se veía transparente
    const cut = src.alphaTest > 0 && src.map ? src.map : null;
    // el pasto que se aparta (fx/grassPush.js): acá también, si no la oclusión dibujaba la mata quieta
    const push = src.userData?.grassPush || null;
    // un recorte con su propio vértice/descarte (userData.gbuf: { key, patch }):
    // el mismo que en el color, si no la oclusión y los reflejos no calzan
    const gb = src.userData?.gbuf || null;
    // (uno por cada gbuf, no por su key: cada uno trae sus propios uniforms. Con
    // la key sola, al rearmar el mapa (del título a la partida) quedaba el
    // material del anterior, con sus uniforms viejos: el maizal del matorral
    // cortado seguía entero en la oclusión y la niebla, como fantasmas en el
    // cielo; el usuario, 2026-09-29. El programa se comparte igual: la clave
    // del programa sigue siendo gb.key.)
    let gi = 0;
    if (gb) {
      gi = this.gbIds.get(gb);
      if (!gi) this.gbIds.set(gb, (gi = ++this.gbN));
    }
    // el reflejo por vértice (attribute float refl, 0..1 = b/15): piezas de
    // materiales distintos fusionadas en una malla (world/perkMachines.js)
    const vr = !!src.userData?.vRefl;
    const key = `${side}|${b}|${src.flatShading ? 1 : 0}|${o.isInstancedMesh ? 1 : 0}${o.instanceColor ? 1 : 0}${o.isSkinnedMesh ? 1 : 0}${o.isBatchedMesh ? 1 : 0}${morph}|${nm ? nm.id : 0}|${cut ? cut.id : 0}|${push ? push.windKey || 1 : 0}|${gb ? `${gb.key}#${gi}` : ''}|${vr ? 1 : 0}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshNormalMaterial({ side, flatShading: !!src.flatShading, normalMap: nm });
      if (nm) m.normalScale.copy(src.normalScale);
      m.blending = THREE.NoBlending;
      const a = (b / 15).toFixed(4);
      if (cut) {
        m.defines = { ...m.defines, USE_UV: '' };
        cut.updateMatrix();
        m.userData.cut = { gCut: { value: cut }, gCutUv: { value: cut.matrix }, gCutT: { value: src.alphaTest } };
      }
      // (una normal NaN, de un triángulo roto, queda mirando a la cámara)
      m.onBeforeCompile = (s) => {
        // el pasto: la normal siempre hacia la cámara (la cara de atrás la daba
        // vuelta y la oclusión y la luz veían hojas al azar mirando para adentro)
        if (b === FOLIAGE_B) s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normal.z < 0.0 ? -normal : normal;');
        if (cut) {
          Object.assign(s.uniforms, m.userData.cut);
          s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform sampler2D gCut;\nuniform mat3 gCutUv;\nuniform float gCutT;\nvoid main() {\n\tif (texture2D(gCut, (gCutUv * vec3(vUv, 1.0)).xy).a < gCutT) discard;');
        }
        if (vr) {
          s.vertexShader = s.vertexShader.replace('void main() {', 'attribute float refl;\nvarying float vRefl;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRefl = refl;');
          s.fragmentShader = s.fragmentShader.replace('void main() {', 'varying float vRefl;\nvoid main() {');
        }
        s.fragmentShader = s.fragmentShader.replace(/}\s*$/, `\tgl_FragColor = vec4(mix(gl_FragColor.rgb, vec3(0.5, 0.5, 1.0), greaterThanEqual(floatBitsToUint(gl_FragColor.rgb) & 0x7fffffffu, uvec3(0x7f800000u))), ${vr ? 'vRefl' : a});\n}`);
        push?.(s);
        gb?.patch(s);
      };
      m.customProgramCacheKey = () => `gbuf${b}${cut ? 'c' : ''}${push ? 'g' : ''}${gb ? gb.key : ''}${vr ? 'v' : ''}`;
      m.userData.key = key;
      if (gb) m.userData.gb = true;
      this.mats.set(key, m);
    }
    return m;
  }

  // lo que no va al G-buffer: partículas, carteles, recortes sin textura, cielo y shaders propios
  skip(o, m) {
    if (!m || m.visible === false || m.colorWrite === false) return true;
    // (los recortes van al G-buffer solo en el estero, para el pasto alto; en
    // los otros mapas, como antes, no van, salvo los que lo piden: userData.gbuf,
    // el maizal del Prado, que si no dejaba ver la niebla y los reflejos de lo
    // de atrás a través de las hojas)
    if (m.isShaderMaterial || (m.alphaTest > 0 && !m.userData?.gbuf && (!m.map || this.noCut || !FEATURES.esteros))) return true;
    if (m.transparent && (!m.depthWrite || m.opacity < 0.3)) return true;
    return false;
  }

  render(renderer, writeBuffer, readBuffer, dt) {
    const { scene, camera, swapped, hidden } = this;
    // lo que refleja cada material cambia poco (el piso se moja de a poco)
    this.reflT -= dt || 0;
    if (this.reflT <= 0) {
      this.reflT = 0.5;
      this.refl = new WeakMap();
    }
    this.nSwapped = 0;
    this.nHidden = 0;
    // (globalThis.__mduNoGbList: recorriendo la escena, como antes)
    const fromMain = globalThis.__mduNoGbList !== true && this.fromMain(renderer);
    if (!fromMain) scene.traverseVisible((o) => {
      if (o.isSprite || o.isPoints || o.isLine) {
        o.visible = false;
        hidden[this.nHidden++] = o;
        return;
      }
      if (!o.isMesh) return;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      if (this.skip(o, src)) {
        o.visible = false;
        hidden[this.nHidden++] = o;
        return;
      }
      let b = this.refl.get(src);
      if (b === undefined) {
        b = reflOf(src);
        this.refl.set(src, b);
      }
      swapped[this.nSwapped++] = o;
      swapped[this.nSwapped++] = o.material;
      let pk = this.pick.get(o);
      if (!pk || pk.src !== src || pk.b !== b || pk.nm !== src.normalMap) {
        pk = { src, b, nm: src.normalMap, m: this.material(o, src, b) };
        this.pick.set(o, pk);
      }
      o.material = pk.m;
    });
    const bg = scene.background;
    const fog = scene.fog;
    const auto = renderer.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    const cc = renderer.getClearColor((this.clearC ||= new THREE.Color()));
    const ca = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x7f7fff, 0);
    renderer.clear();
    // (sin las piezas chicas: core/sizeCull.js GB_PX)
    gbufferPass(true, this.aoOnly === true);
    try {
      renderer.render(fromMain ? this.proxy : scene, camera);
    } finally {
      gbufferPass(false);
      if (fromMain) this.dropItems();
    }
    renderer.setClearColor(cc, ca);
    renderer.shadowMap.autoUpdate = auto;
    scene.background = bg;
    scene.fog = fog;
    for (let i = 0; i < this.nSwapped; i += 2) {
      swapped[i].material = swapped[i + 1];
      swapped[i] = swapped[i + 1] = null;
    }
    for (let i = 0; i < this.nHidden; i++) {
      hidden[i].visible = true;
      hidden[i] = null;
    }
  }

  // La lista del pase principal: el mundo se acaba de dibujar con esta misma
  // cámara y las mismas matrices (PostFX: el G-buffer va justo después), así
  // que lo que entra al G-buffer sale de su lista, sin recorrer la escena
  // (traverseVisible) ni volver a recortar por cámara (projectObject): eran ~40%
  // de la CPU del G-buffer en el penal. Mismo resultado que recorriendo: las
  // mallas de la lista que no se saltean (ni ellas ni un padre: skip), sin las
  // chicas que su umbral saca (core/sizeCull gbDrop), con su material y en el
  // orden en que three ordena (painter). Si el principal no fue el último
  // dibujo de la escena con esta cámara (u otra cosa cambió la cámara), como
  // antes. Diferencias: un multimaterial cuyos grupos están todos escondidos,
  // o sin grupos, no entra (antes entraba entero); y los cuartos tapados
  // (sizeCull) quedan como en el principal de ese cuadro.
  fromMain(renderer) {
    const rec = watch(renderer);
    if (rec.scene !== this.scene || rec.camera !== this.camera || rec.at === this.usedAt || renderer.sortObjects !== true) return false;
    const cam = this.camera;
    const pe = cam.projectionMatrix.elements;
    const ve = cam.matrixWorldInverse.elements;
    for (let i = 0; i < 16; i++) if (rec.m[i] !== pe[i] || rec.m[16 + i] !== ve[i]) return false;
    this.usedAt = rec.at;
    hijack(renderer);
    const L = renderer.renderLists.get(this.scene, 0);
    const seen = this.seen;
    seen.clear();
    this.up.clear();
    const small = gbBegin(cam, this.aoOnly === true);
    const { swapped, pool, items } = this;
    const tr = this.list.transmissive;
    const tp = this.list.transparent;
    let n = 0;
    for (let a = 0; a < 3; a++) {
      const arr = a === 0 ? L.opaque : a === 1 ? L.transmissive : L.transparent;
      for (let i = 0, l = arr.length; i < l; i++) {
        const it = arr[i];
        const o = it.object;
        // (sprites, puntos y líneas no van; el fondo de three no tiene padre)
        if (o.isMesh !== true || o.parent === null || seen.has(o)) continue;
        seen.add(o);
        const src = Array.isArray(o.material) ? o.material[0] : o.material;
        if (this.skip(o, src) || this.hiddenUp(o.parent)) continue;
        if (small && gbDrop(o)) continue;
        let b = this.refl.get(src);
        if (b === undefined) {
          b = reflOf(src);
          this.refl.set(src, b);
        }
        let pk = this.pick.get(o);
        if (!pk || pk.src !== src || pk.b !== b || pk.nm !== src.normalMap) {
          pk = { src, b, nm: src.normalMap, m: this.material(o, src, b) };
          this.pick.set(o, pk);
        }
        // (el material cambiado en la malla mientras se dibuja, como antes: lo
        // que mire o.material en su onBeforeRender ve el del G-buffer)
        swapped[this.nSwapped++] = o;
        swapped[this.nSwapped++] = o.material;
        o.material = pk.m;
        let r = pool[n];
        if (r === undefined) r = pool[n] = { id: 0, object: null, geometry: null, material: null, materialVariant: 0, groupOrder: 0, renderOrder: 0, z: 0, group: null };
        n++;
        r.id = o.id;
        r.object = o;
        r.geometry = it.geometry;
        r.material = pk.m;
        r.materialVariant = it.materialVariant;
        r.groupOrder = it.groupOrder;
        r.renderOrder = o.renderOrder;
        r.z = it.z;
        if (pk.m.transmission > 0) tr.push(r);
        else if (pk.m.transparent === true) tp.push(r);
        else items.push(r);
      }
    }
    this.nItems = n;
    if (items.length > 1) items.sort(painter);
    if (tr.length > 1) tr.sort(painter);
    if (tp.length > 1) tp.sort(painterBack);
    return true;
  }

  // ¿Algún padre quedó afuera del G-buffer (sprite, punto, línea o malla que se
  // saltea)? Recorriendo, lo de adentro de esos tampoco se dibujaba.
  hiddenUp(p) {
    const up = this.up;
    const chain = this.chain;
    let k = 0;
    let res = false;
    for (let a = p; a !== null && a !== this.scene; a = a.parent) {
      const m = up.get(a);
      if (m !== undefined) {
        res = m;
        break;
      }
      chain[k++] = a;
      if (a.isSprite || a.isPoints || a.isLine || (a.isMesh && this.skip(a, Array.isArray(a.material) ? a.material[0] : a.material))) {
        res = true;
        break;
      }
    }
    for (let i = 0; i < k; i++) {
      up.set(chain[i], res);
      chain[i] = null;
    }
    return res;
  }

  // (sin quedarse con nada del mapa entre cuadros)
  dropItems() {
    for (let i = 0; i < this.nItems; i++) {
      const r = this.pool[i];
      r.object = r.geometry = r.material = null;
    }
    this.nItems = 0;
    this.items.length = 0;
    this.list.transmissive.length = 0;
    this.list.transparent.length = 0;
    this.seen.clear();
    this.up.clear();
  }

  // Mapa nuevo: los de vértice propio (userData.gbuf) eran del mapa viejo y su
  // patch guarda lo de ese mapa (los zombies de entities/zombieBatch, el
  // maizal): quedaban en mats para siempre y con ellos el mapa entero.
  forget() {
    for (const [k, m] of this.mats) {
      if (!m.userData.gb) continue;
      m.dispose();
      this.mats.delete(k);
    }
    this.pick = new WeakMap();
  }

  // (solo con oclusión va a media resolución: los reflejos lo necesitan entero)
  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.target.setSize(Math.ceil(w * this.scale), Math.ceil(h * this.scale));
  }

  dispose() {
    this.target.dispose();
    this.depthTexture.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}

// Sombra de relleno mientras la luna todavía no tiene la suya (un sampler de
// sombra sin textura de profundidad hace que WebGL descarte el cuadro).
const noShadow = new THREE.DepthTexture(1, 1);
noShadow.compareFunction = THREE.LessEqualCompare;
noShadow.needsUpdate = true;

// Reflejos en pantalla + la luz volumétrica de la luna (que llega hecha de
// VolPass, a media resolución), en una sola pasada.
const LightShader = {
  defines: { REFL_STEPS, SSR_JIT: OLD_SSR ? '0.1' : '0.0', SSR_BLUR: OLD_SSR ? 0 : 1 },
  uniforms: {
    tDiffuse: { value: null },
    tVol: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tShadow: { value: noShadow },
    uHasShadow: { value: 0 },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uUpView: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonColor: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uDensity: { value: 0.03 },
    uScatter: { value: 1 },
    uMaxDist: { value: 45 },
    uSkyVol: { value: 1 },
    uWet: { value: 0 },
    uRefl: { value: 1 },
    uVolOn: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tNormal, tVol;
    uniform highp sampler2DShadow tShadow;
    uniform float uHasShadow, uDensity, uScatter, uMaxDist, uWet, uRefl, uVolOn;
    uniform mat4 uShadowMatrix, uProj, uProjInv, uCamWorld;
    uniform vec3 uCamPos, uUpView, uMoonDir, uMoonColor, uFogColor;
    varying vec2 vUv;

    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    vec2 toUv(vec3 p) {
      vec4 c = uProj * vec4(p, 1.0);
      return c.xy / c.w * 0.5 + 0.5;
    }
    // NaN a 0 e Inf a un tope: un solo píxel NaN que pasa de acá se desparrama
    // (reflejos, bloom) y deja la pantalla en negro. Con los bits porque
    // isnan() no anda en todas las placas (ANGLE sobre D3D11 en AMD: siempre falso).
    vec3 finite(vec3 c) {
      c = mix(c, vec3(0.0), greaterThan(floatBitsToUint(c) & 0x7fffffffu, uvec3(0x7f800000u)));
      return clamp(c, 0.0, 16384.0);
    }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float moonLit(vec3 wp) {
      vec4 c = uShadowMatrix * vec4(wp, 1.0);
      c.xyz /= c.w;
      if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
      return texture(tShadow, vec3(c.xy, c.z - 0.0015));
    }

    void main() {
      vec3 col = finite(texture2D(tDiffuse, vUv).rgb);
      float d = texture2D(tDepth, vUv).x;
      bool sky = d >= 0.999999;
      vec3 vp = viewPos(vUv, d);
      float jit = ign(gl_FragCoord.xy);

      // ---- reflejos ----
      if (!sky && uRefl > 0.0) {
        vec4 nr = texture2D(tNormal, vUv);
        vec3 n = nr.xyz * 2.0 - 1.0;
        n *= inversesqrt(max(dot(n, n), 1e-8));
        float refl = nr.a * 0.8;
        // piso mojado con la lluvia: lo que mira para arriba y le da el cielo
        // (bajo techo la luna no llega: se usa su sombra para saberlo)
        if (uWet > 0.01 && nr.a >= 0.0) {
          float up = smoothstep(0.82, 0.96, dot(n, uUpView));
          float open = uHasShadow > 0.5 && up > 0.0 ? moonLit((uCamWorld * vec4(vp, 1.0)).xyz + vec3(0.0, 0.05, 0.0)) : 0.0;
          refl = max(refl, uWet * up * open * 0.4);
        }
        // lo que refleja 1/15 (revoque, tierra: rugosidad ~0,9) no se ve y la
        // marcha con normal maps salta por toda la pantalla (+1,3 ms a 1440p)
        if (refl > 0.06) {
          vec3 v = normalize(vp);
          vec3 r = normalize(reflect(v, n));
          float fres = mix(0.3, 1.0, pow(clamp(1.0 - dot(-v, n), 0.0, 1.0), 4.0));
          vec3 p = vp + n * 0.03;
          // (2026-10-05, el usuario: el reflejo de las lámparas se veía hecho de
          // puntitos: cada píxel arrancaba la marcha en otro lugar (ign) y unos
          // chocaban con la lámpara y otros no. Ahora todos igual y el color del
          // choque promediado con sus vecinos. globalThis.__mduOldSsr: como antes)
          float stepLen = 0.12 + SSR_JIT * jit;
          vec2 hit = vec2(-1.0);
          float fade = 0.0;
          for (int i = 0; i < REFL_STEPS; i++) {
            vec3 prev = p;
            p += r * stepLen;
            vec2 uv = toUv(p);
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || p.z > -0.05) break;
            float sz = viewPos(uv, texture2D(tDepth, uv).x).z;
            float diff = sz - p.z;
            if (diff > 0.0 && diff < stepLen * 2.0 + 0.15) {
              // afina el punto de choque
              vec3 a = prev, b = p;
              for (int k = 0; k < 5; k++) {
                vec3 m = (a + b) * 0.5;
                vec2 mu = toUv(m);
                if (viewPos(mu, texture2D(tDepth, mu).x).z > m.z) b = m; else a = m;
              }
              hit = toUv(b);
              vec2 e = min(hit, 1.0 - hit);
              fade = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - float(i) / float(REFL_STEPS));
              break;
            }
            stepLen *= 1.35;
          }
          // lo que no encuentra en pantalla refleja apenas la niebla del cielo
          vec3 hc = finite(texture2D(tDiffuse, max(hit, 0.0)).rgb);
#if SSR_BLUR
          vec2 tx = 1.5 / vec2(textureSize(tDiffuse, 0));
          hc = hc * 0.4 + 0.15 * (finite(texture2D(tDiffuse, max(hit + vec2(tx.x, 0.0), 0.0)).rgb) + finite(texture2D(tDiffuse, max(hit - vec2(tx.x, 0.0), 0.0)).rgb) + finite(texture2D(tDiffuse, max(hit + vec2(0.0, tx.y), 0.0)).rgb) + finite(texture2D(tDiffuse, max(hit - vec2(0.0, tx.y), 0.0)).rgb));
#endif
          vec3 rc = mix(uFogColor * 0.6, hc, fade);
          col = mix(col, rc, clamp(refl * fres * (0.35 + 0.65 * fade), 0.0, 0.8));
        }
      }

      // ---- luz volumétrica de la luna (VolPass) ----
      if (uHasShadow > 0.5 && uVolOn > 0.5) col += finite(texture2D(tVol, vUv).rgb);
      gl_FragColor = vec4(finite(col), 1.0);
    }`,
};

// Los haces de la luna, a media resolución: es una bruma suave (a la mitad no
// se nota) y con 18 muestras de sombra por píxel a 1440p era de lo más caro de
// Épica. Comparte los uniforms con LightPass (los llena Epic.before).
const VolShader = {
  defines: { VOL_STEPS: 18 },
  vertexShader: LightShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tDepth;
    uniform highp sampler2DShadow tShadow;
    uniform float uHasShadow, uDensity, uScatter, uMaxDist, uSkyVol;
    uniform mat4 uShadowMatrix, uProjInv, uCamWorld;
    uniform vec3 uCamPos, uMoonDir, uMoonColor;
    varying vec2 vUv;

    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float moonLit(vec3 wp) {
      vec4 c = uShadowMatrix * vec4(wp, 1.0);
      c.xyz /= c.w;
      if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
      return texture(tShadow, vec3(c.xy, c.z - 0.0015));
    }

    void main() {
      if (uHasShadow < 0.5) {
        gl_FragColor = vec4(0.0);
        return;
      }
      float d = texture2D(tDepth, vUv).x;
      bool sky = d >= 0.999999;
      vec3 vp = viewPos(vUv, d);
      float jit = ign(gl_FragCoord.xy);
      // (el cielo: menos bruma en los mapas que lo quieren oscuro)
      float dist = sky ? uMaxDist * uSkyVol : min(length(vp), uMaxDist);
      vec3 dir = normalize((uCamWorld * vec4(vp, 0.0)).xyz);
      float stepL = dist / float(VOL_STEPS);
      float acc = 0.0;
      for (int i = 0; i < VOL_STEPS; i++) {
        float t = (float(i) + jit) * stepL;
        acc += moonLit(uCamPos + dir * t) * exp(-t * uDensity);
      }
      acc *= stepL * uDensity;
      // más fuerte mirando hacia la luna (Henyey-Greenstein)
      // (poca bruma pareja: la niebla del mapa ya la pone; acá van los haces)
      float g = 0.5;
      float cosT = dot(dir, uMoonDir);
      float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
      gl_FragColor = vec4(uMoonColor * acc * (0.06 + hg * 0.09) * uScatter, 1.0);
    }`,
};

// El desenfoque de los haces (a media resolución, en cruz: horizontal y
// vertical, 9 muestras con el filtro lineal). Sin esto, mirando a la luna el
// pajonal quedaba con rayas y bordes duros: cada caña corta los haces y a
// media resolución el corte se ve en escalones.
const VolBlurShader = {
  vertexShader: LightShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tSrc;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
      c += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
      c += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
      c += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.0705;
      c += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.0705;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
// cuánto se abre el desenfoque (en texeles de media resolución)
const VOL_BLUR = 1.6;

class VolPass extends Pass {
  constructor(uniforms) {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.tmp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VolBlurShader.vertexShader,
      fragmentShader: VolBlurShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.blurQuad = new FullScreenQuad(this.blur);
    this.spread = VOL_BLUR;
    this.material = new THREE.ShaderMaterial({
      defines: { ...VolShader.defines },
      uniforms,
      vertexShader: VolShader.vertexShader,
      fragmentShader: VolShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    this.target.setSize(hw, hh);
    this.tmp.setSize(hw, hh);
  }

  render(renderer) {
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    // en cruz: de target a tmp (horizontal) y de vuelta (vertical)
    const B = this.blur.uniforms;
    B.tSrc.value = this.target.texture;
    B.uDir.value.set(this.spread / this.target.width, 0);
    renderer.setRenderTarget(this.tmp);
    this.blurQuad.render(renderer);
    B.tSrc.value = this.tmp.texture;
    B.uDir.value.set(0, this.spread / this.target.height);
    renderer.setRenderTarget(this.target);
    this.blurQuad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.tmp.dispose();
    this.material.dispose();
    this.blur.dispose();
    this.quad.dispose();
    this.blurQuad.dispose();
  }
}

class LightPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      defines: { ...LightShader.defines },
      uniforms: THREE.UniformsUtils.clone(LightShader.uniforms),
      vertexShader: LightShader.vertexShader,
      fragmentShader: LightShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

// La luna mira el mapa entero desde un lugar fijo y casi todo lo que tira
// sombra (paredes, árboles, muebles) no se mueve nunca: rehacerlo cada cuadro
// eran ~550 llamadas de dibujo, y el cubo de cada lámpara seis veces lo que
// tiene cerca. Lo quieto se dibuja una vez por luz y se guarda; cada vez se
// copia lo guardado y encima va solo lo que se mueve. Si algo que estaba quieto
// se mueve o desaparece, se rehace lo guardado y esa cosa pasa a la lista de lo
// que se mueve; cuando lleva un rato quieta (una puerta ya abierta) vuelve a lo
// guardado.
const SIG = 20;
const SETTLE = 240;
// lo que dejó de moverse vuelve a lo guardado solo si son al menos tantas
// cosas: volver una sola (el mate de un potenciador que cayó, algo suelto)
// rehacía todas las sombras guardadas, y al levantarla otra vez. Pocas
// quietas entre las que se mueven cuestan menos que rehacer todo
// (globalThis.__mduIdleAll: como antes)
const IDLE_MIN = 6;
const NONE = [];
// Lo que cambia seguido aunque pase ratos quieto (userData.shadowDyn: las tablas
// de las ventanas, world/Barriers) va siempre con lo que se mueve: cada tabla
// arrancada o repuesta rehacía todo lo guardado (la luna y cada cubo de fuego,
// ~550-2000 llamadas en un cuadro). Quien lo mueve avisa con Epic.kickShadow.
// Switch __mduNoShadowDyn (como antes).
function keepDyn(o) {
  return o.userData.shadowDyn === true && globalThis.__mduNoShadowDyn !== true;
}

function look(m) {
  if (!Array.isArray(m)) return m?.visible ? m.id + 1 : 0;
  let v = 0;
  for (const x of m) v = v * 31 + (x?.visible ? x.id + 1 : 0);
  return v;
}

function sign(o, s) {
  const e = o.matrixWorld.elements;
  for (let k = 0; k < 16; k++) s[k] = e[k];
  s[16] = o.isInstancedMesh ? o.instanceMatrix.version * 1e5 + o.count : 0;
  s[17] = o.geometry?.id ?? 0;
  s[18] = o.geometry?.attributes.position?.version || 0;
  s[19] = look(o.material);
  return s;
}

function changed(o, s) {
  const e = o.matrixWorld.elements;
  for (let k = 0; k < 16; k++) if (s[k] !== e[k]) return true;
  return (
    s[16] !== (o.isInstancedMesh ? o.instanceMatrix.version * 1e5 + o.count : 0) ||
    s[17] !== (o.geometry?.id ?? 0) ||
    s[18] !== (o.geometry?.attributes.position?.version || 0) ||
    s[19] !== look(o.material)
  );
}

// ¿Cambió desde dónde mira la luz? (posición y alcance; la luna, su encuadre)
function moved(l, v) {
  let d = false;
  const put = (k, x) => {
    if (v[k] !== x) {
      v[k] = x;
      d = true;
    }
  };
  const e = l.matrixWorld.elements;
  if (l.isPointLight) {
    put(0, e[12]);
    put(1, e[13]);
    put(2, e[14]);
    put(3, l.distance);
    put(4, l.shadow.camera.near);
    return d;
  }
  const t = l.target.matrixWorld.elements;
  const p = l.shadow.camera.projectionMatrix.elements;
  for (let k = 0; k < 16; k++) {
    put(k, e[k]);
    put(16 + k, t[k]);
    put(32 + k, p[k]);
  }
  return d;
}

class ShadowCache {
  constructor(renderer, lights) {
    this.renderer = renderer;
    this.sm = renderer.shadowMap;
    this.orig = this.sm.render;
    this.on = false;
    this.moon = null;
    this.pool = new Set(lights);
    this.entries = new Map();
    this.snap = new Map();
    this.msig = new WeakMap();
    this.still = [];
    this.dyn = [];
    this.gen = 0;
    this.stamp = 0;
    this.hit = 0;
    this.idle = 0;
    this.settled = 0;
    this.dirty = true;
    this.fresh = false;
    this.cur = null;
    this.proxy = new THREE.Object3D();
    this.others = [];
    this.mine = [];
    this.one = [null];
    this.layers = null;
    this.copy = () => this.blit();
    this.visit = (o) => this.check(o);
    this.sort = (o) => this.split(o);
    this.sm.render = (lights, scene, camera) => this.render(lights, scene, camera);
  }

  use(moon) {
    if (moon === this.moon) return;
    this.drop(this.moon);
    this.moon = moon;
    this.reset();
  }

  drop(l) {
    this.entries.get(l)?.rt.dispose();
    this.entries.delete(l);
  }

  // sin sombras vivas no hace falta nada de lo guardado
  free() {
    for (const l of [...this.entries.keys()]) this.drop(l);
    this.reset();
  }

  reset() {
    this.snap.clear();
    this.msig = new WeakMap();
    this.still.length = 0;
    this.dyn.length = 0;
    this.settled = 0;
    this.dirty = true;
    this.first = true;
  }

  render(lights, scene, camera) {
    const sm = this.sm;
    if (!this.on || sm.enabled === false || (!sm.autoUpdate && !sm.needsUpdate)) return this.orig.call(sm, lights, scene, camera);
    const others = this.others;
    const mine = this.mine;
    others.length = 0;
    mine.length = 0;
    for (const l of lights) {
      const s = l.shadow;
      if (s.map && (s.autoUpdate || s.needsUpdate) && (l === this.moon || this.pool.has(l))) mine.push(l);
      else others.push(l);
    }
    if (!mine.length) return this.orig.call(sm, lights, scene, camera);
    if (others.length) this.orig.call(sm, others, scene, camera);
    this.scan(scene, camera);
    for (const l of mine) this.draw(l, camera);
    sm.needsUpdate = false;
  }

  draw(l, camera) {
    const sm = this.sm;
    const s = l.shadow;
    // lo quieto se guarda por fuego, no por luz: si una luz del pool vuelve a
    // un fuego que ya tuvo (o lo toma otra), se copia en vez de redibujarlo
    const key = l.userData.src || l;
    let e = this.entries.get(key);
    if (!e || e.map.width !== s.map.width || e.cube !== !!s.map.isWebGLCubeRenderTarget) e = this.target(key, s.map, e);
    e.map = s.map;
    e.used = this.stamp;
    const proxy = this.proxy;
    this.one[0] = l;
    if (moved(l, e.view) || e.gen !== this.gen) {
      proxy.children = this.still;
      s.needsUpdate = sm.needsUpdate = true;
      this.orig.call(sm, this.one, proxy, camera);
      e.gen = this.gen;
      this.fresh = true;
    }
    // three limpia el mapa antes de dibujar: en vez de limpiar, se copia lo quieto
    const r = this.renderer;
    const clear = r.clear;
    r.clear = this.copy;
    this.cur = e;
    proxy.children = this.dyn;
    s.needsUpdate = sm.needsUpdate = true;
    const hook = l.isPointLight && this.onLight;
    if (hook) hook(l, true);
    try {
      this.orig.call(sm, this.one, proxy, camera);
    } finally {
      r.clear = clear;
      proxy.children = NONE;
      this.fresh = false;
      if (hook) hook(l, false);
    }
  }

  target(l, map, old) {
    old?.rt.dispose();
    const cube = !!map.isWebGLCubeRenderTarget;
    const w = map.width;
    const h = map.height;
    const rt = cube ? new THREE.WebGLCubeRenderTarget(w, { format: THREE.RedFormat }) : new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat });
    rt.depthTexture = cube ? new THREE.CubeDepthTexture(w, THREE.UnsignedIntType) : new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    const r = this.renderer;
    const cur = r.getRenderTarget();
    const face = r.getActiveCubeFace();
    const mip = r.getActiveMipmapLevel();
    r.setRenderTarget(rt);
    r.setRenderTarget(cur, face, mip);
    const e = { map, rt, cube, gen: -1, view: new Float64Array(48).fill(NaN), used: this.stamp };
    this.entries.set(l, e);
    this.trim();
    return e;
  }

  // no más de LAMP_CACHE fuegos guardados: se suelta el que hace más que no se usa
  trim() {
    let n = 0;
    let old = null;
    for (const [k, e] of this.entries) {
      if (!e.cube) continue;
      n++;
      if (e.used < this.stamp && (!old || e.used < this.entries.get(old).used)) old = k;
    }
    if (n > LAMP_CACHE && old) this.drop(old);
  }

  // la profundidad de lo quieto: al rehacer, del mapa a lo guardado; si no, al revés
  blit() {
    const e = this.cur;
    const r = this.renderer;
    const gl = r.getContext();
    const st = r.state;
    const P = r.properties;
    let a = P.get(e.map).__webglFramebuffer;
    let b = P.get(e.rt).__webglFramebuffer;
    if (e.cube) {
      const f = r.getActiveCubeFace();
      a = a[f];
      b = b[f];
    }
    const w = e.map.width;
    const h = e.map.height;
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fresh ? a : b);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fresh ? b : a);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, a);
  }

  caster(o) {
    return o.castShadow && (o.isMesh || o.isLine || o.isPoints) && o.layers.test(this.layers);
  }

  // se movió (o apareció, o desapareció) ahora: queda un rato en lo que se mueve
  moving(o) {
    const m = sign(o, new Float64Array(SIG + 1));
    m[SIG] = this.stamp;
    this.msig.set(o, m);
  }

  check(o) {
    if (!this.caster(o)) return;
    const s = this.snap.get(o);
    if (s) {
      this.hit++;
      s[SIG] = this.stamp;
      if (!changed(o, s)) return;
      this.moving(o);
      this.dirty = true;
      return;
    }
    this.dyn.push(o);
    if (o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences?.length || keepDyn(o)) return;
    const m = this.msig.get(o);
    if (!m) this.moving(o);
    else if (changed(o, m)) {
      sign(o, m);
      m[SIG] = this.stamp;
    } else if (this.stamp - m[SIG] > SETTLE) this.idle++;
  }

  split(o) {
    if (!this.caster(o)) return;
    const m = this.msig.get(o);
    if ((m && this.stamp - m[SIG] <= SETTLE) || o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences?.length || keepDyn(o)) {
      this.dyn.push(o);
      return;
    }
    if (m) this.msig.delete(o);
    this.still.push(o);
    this.snap.set(o, sign(o, new Float64Array(SIG + 1)));
  }

  scan(scene, camera) {
    const snap = this.snap;
    this.layers = camera.layers;
    this.stamp++;
    this.hit = 0;
    this.idle = 0;
    this.dyn.length = 0;
    scene.traverseVisible(this.visit);
    if (this.hit < snap.size) {
      for (const [o, s] of snap) if (s[SIG] !== this.stamp) this.moving(o);
      this.dirty = true;
    }
    // lo que dejó de moverse vuelve a lo guardado (no más de una vez cada tanto)
    if (this.idle >= (globalThis.__mduIdleAll === true ? 1 : IDLE_MIN) && this.stamp - this.settled > SETTLE * 2) {
      this.settled = this.stamp;
      this.dirty = true;
    }
    if (!this.dirty) return;
    snap.clear();
    this.still.length = 0;
    this.dyn.length = 0;
    // recién armado (otro mapa, otra calidad): todo lo que no es animado
    // arranca como quieto, y lo que se mueve se ve en el cuadro siguiente y
    // pasa a lo que se mueve. Antes todo arrancaba como "recién movido" y los
    // primeros SETTLE * 2 cuadros (16 s a 30 cuadros) la sombra entera se
    // redibujaba en cada cuadro (~600-900 dibujos)
    if (this.first) {
      this.first = false;
      this.msig = new WeakMap();
    }
    scene.traverseVisible(this.sort);
    this.dirty = false;
    this.gen++;
  }

  dispose() {
    this.sm.render = this.orig;
    this.free();
  }
}

// La oclusión hace acos/sqrt de cosenos que por redondeo pasan apenas de 1 y
// normaliza vectores que pueden ser nulos: eso da NaN, y en placas donde
// isnan() no anda (ANGLE sobre D3D11 en AMD) no había cómo frenarlo. Se acota
// en la fuente y, si igual sale algo no finito, ese píxel queda sin oclusión.
function safeGtao(gtao, gNormal) {
  const m = gtao.gtaoMaterial;
  m.fragmentShader = m.fragmentShader
    .replace('vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);', 'cosHorizons = clamp(cosHorizons, -1., 1.);\n\t\t\t\tvec2 sinHorizons = sqrt(max(1. - cosHorizons * cosHorizons, 0.));')
    .replace(/dot\(viewDir, normalize\(viewDelta\)\)/g, 'dot(viewDir, viewDelta) * inversesqrt(max(dot(viewDelta, viewDelta), 1e-12))')
    .replace('ao = clamp(ao / float(DIRECTIONS), 0., 1.);', 'if ((floatBitsToUint(ao) & 0x7f800000u) == 0x7f800000u) ao = float(DIRECTIONS);\n\t\t\tao = clamp(ao / float(DIRECTIONS), 0., 1.);');
  m.needsUpdate = true;
  const b = gtao.blendMaterial;
  // (el pasto, marcado en el G-buffer, con poca oclusión: hojas más finas que un
  // píxel a media resolución dejaban manchones negros que caminaban al moverse.
  // También lo que se ve por los huecos entre las cañas: el fondo de atrás
  // tomaba a las cañas de adelante como si lo taparan y quedaba con puntos
  // negros. Por eso la marca se mira también a unos píxeles alrededor.)
  b.uniforms.tGNormal = { value: gNormal };
  b.uniforms.uFolAO = { value: FOLIAGE_AO };
  // (cuánto se marca: 1 = como sale del GTAO; AO_MAP[mapa].pow)
  b.uniforms.uAoPow = { value: 1 };
  b.uniforms.uGTexel = { value: new THREE.Vector2(1, 1) };
  b.fragmentShader = b.fragmentShader
    .replace(
      'uniform sampler2D tDiffuse;',
      `uniform sampler2D tDiffuse, tGNormal;
		uniform float uFolAO, uAoPow;
		uniform vec2 uGTexel;
		float folAt(vec2 uv) { return abs(texture2D(tGNormal, uv).a - ${(FOLIAGE_B / 15).toFixed(4)}) < 0.02 ? 1.0 : 0.0; }
		float folNear(vec2 uv) {
			float f = folAt(uv);
			vec2 a = uGTexel * 3.0, c = uGTexel * 7.0;
			f = max(f, max(max(folAt(uv + vec2(a.x, 0.0)), folAt(uv - vec2(a.x, 0.0))), max(folAt(uv + vec2(0.0, a.y)), folAt(uv - vec2(0.0, a.y)))));
			f = max(f, 0.8 * max(max(folAt(uv + vec2(c.x, 0.0)), folAt(uv - vec2(c.x, 0.0))), max(folAt(uv + vec2(0.0, c.y)), folAt(uv - vec2(0.0, c.y)))));
			return f;
		}`,
    )
    .replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\ttexel = mix( texel, vec4( 1.0 ), greaterThanEqual( floatBitsToUint( texel ) & 0x7fffffffu, uvec4( 0x7f800000u ) ) );',
    )
    .replace('mix(vec3(1.), texel.rgb, intensity)', 'mix(vec3(1.), pow(max(texel.rgb, vec3(0.0)), vec3(uAoPow)), intensity * mix(1.0, uFolAO, folNear(vUv)))');
  b.needsUpdate = true;
}

// El suavizado de three (Poisson) dejaba la oclusión granulada: puntitos de
// media resolución (el patrón de 4x4 de las direcciones más el giro al azar
// del suavizado) que se veían en lo liso y caminaban al moverse; el rebote de
// la luz, que junta la imagen ya oscurecida, los copiaba. Encima va un
// desenfoque en cruz (4 vecinos por lado, gaussiano) que no cruza bordes:
// cada vecino pesa según cuánto se parece su profundidad.
const AoBlurShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tAO, tDepth;
    uniform vec2 uDir;
    uniform float uNear, uFar;
    varying vec2 vUv;
    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    void main() {
      vec4 c = texture2D(tAO, vUv);
      float z0 = viewZ(vUv);
      float tol = 0.04 * z0 + 0.03;
      vec4 sum = c;
      float wsum = 1.0;
      for (int i = 1; i <= 4; i++) {
        float gw = exp(-float(i * i) / 8.0);
        for (int s = -1; s <= 1; s += 2) {
          vec2 uv = vUv + uDir * float(i * s);
          float w = gw * max(0.0, 1.0 - abs(viewZ(uv) - z0) / tol);
          sum += texture2D(tAO, uv) * w;
          wsum += w;
        }
      }
      gl_FragColor = sum / wsum;
    }`,
};

// Engancha el desenfoque justo después del suavizado de three (dentro de su render).
function aoBlur(gtao, depth) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tAO: { value: null }, tDepth: { value: depth }, uDir: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    vertexShader: AoBlurShader.vertexShader,
    fragmentShader: AoBlurShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const quad = new FullScreenQuad(mat);
  const tmp = gtao.pdRenderTarget.clone();
  const renderPass = gtao._renderPass.bind(gtao);
  gtao._renderPass = (renderer, m, target, cc, ca) => {
    renderPass(renderer, m, target, cc, ca);
    // (noBlur: para comparar en las pruebas)
    if (m !== gtao.pdMaterial || gtao.noBlur) return;
    const pd = gtao.pdRenderTarget;
    if (tmp.width !== pd.width || tmp.height !== pd.height) tmp.setSize(pd.width, pd.height);
    const u = mat.uniforms;
    u.uNear.value = gtao.camera.near;
    u.uFar.value = gtao.camera.far;
    const prev = renderer.getRenderTarget();
    u.tAO.value = pd.texture;
    u.uDir.value.set(1 / pd.width, 0);
    renderer.setRenderTarget(tmp);
    quad.render(renderer);
    u.tAO.value = tmp.texture;
    u.uDir.value.set(0, 1 / pd.height);
    renderer.setRenderTarget(pd);
    quad.render(renderer);
    renderer.setRenderTarget(prev);
  };
  return () => {
    mat.dispose();
    quad.dispose();
    tmp.dispose();
  };
}

const tmpV = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const zBox = new THREE.Box3();
const zSphere = new THREE.Sphere();
// En la sombra de los fuegos (cada uno dibuja a los zombies en hasta 6
// direcciones) van solo las piezas que hacen la silueta: los pies, los ojos,
// lo de la cabeza y los adornos chicos no se distinguen en la pared. Y solo
// los ZLAMPS fuegos más cerca de la cámara (con margen, para que no salten):
// los otros, con lo quieto. Peleando en el penal eran ~70 de ~380 llamadas por
// cuadro (globalThis.__mduZShadowAll: como antes).
const ZSMALL = new Set(['foot', 'eye', 'headx', 'hair', 'boina', 'scarf', 'susp', 'shackle', 'cuff', 'num', 'cord', 'belts', 'algae', 'algaeS', 'bonete', 'faja', 'snow', 'chullo']);
const ZLAMPS = 2;
const ZLAMP_HOLD = 2;

export default class Epic {
  constructor(post, renderer, scene, camera) {
    this.post = post;
    this.renderer = renderer;
    this.cfg = null;
    this.gbuffer = new GBufferPass(scene, camera);
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.setGBuffer(this.gbuffer.depthTexture, this.gbuffer.target.texture);
    safeGtao(this.gtao, this.gbuffer.target.texture);
    this.aoBlurFree = aoBlur(this.gtao, this.gbuffer.depthTexture);
    this.gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
    this.gtao.blendIntensity = 0.95;
    // la oclusión a media resolución (el composer le pasa la entera): casi no
    // se nota y cuesta la cuarta parte
    const gtaoSize = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => {
      gtaoSize(Math.ceil(w / 2), Math.ceil(h / 2));
      // (el píxel de pantalla, para mirar la marca del pasto alrededor)
      this.gtao.blendMaterial.uniforms.uGTexel.value.set(1 / w, 1 / h);
    };
    this.light = new LightPass();
    const u = this.light.material.uniforms;
    u.tDepth.value = this.gbuffer.depthTexture;
    u.tNormal.value = this.gbuffer.target.texture;
    const vu = {};
    for (const k of ['tDepth', 'tShadow', 'uHasShadow', 'uShadowMatrix', 'uProjInv', 'uCamWorld', 'uCamPos', 'uMoonDir', 'uMoonColor', 'uDensity', 'uScatter', 'uMaxDist', 'uSkyVol']) vu[k] = u[k];
    this.vol = new VolPass(vu);
    u.tVol.value = this.vol.target.texture;
    // luces que tiran sombra: se mudan cada cuadro a los fuegos más cercanos
    this.pool = [];
    for (let i = 0; i < SHADOW_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.camera.near = 0.08;
      l.shadow.bias = -0.004;
      l.shadow.normalBias = 0.03;
      l.shadow.radius = 3;
      l.shadow.autoUpdate = false;
      l.name = 'epicShadowLight';
      l.userData.src = null;
      l.userData.k = 0;
      this.pool.push(l);
    }
    this.candidates = [];
    this.candT = 0;
    // lo que se sabe de cada fuego candidato, de qué lugar del mapa es cada uno
    // y si se ve desde la cámara (se mira cada tanto)
    this.recs = new Map();
    this.zoneOf = new Map();
    this.ranked = [];
    this.visT = 0;
    this.here = null;
    this.rayHit = {};
    this.camPos = new THREE.Vector3();
    this.borrowed = [];
    this.touched = new Map();
    this.depthMats = new Map();
    this.mc = new ShadowCache(renderer, this.pool);
    this.mc.onLight = (l, on) => this.fitZombies(l, on);
    this.zFit = [];
    // el rebote lee el color ya iluminado (con la oclusión) y el G-buffer, y lo
    // suyo pasa por los reflejos. Comparte los uniforms de la luz (se ponen al
    // día en before()).
    this.bounce = Bounce ? new Bounce({ tDepth: u.tDepth, tNormal: u.tNormal, uProj: u.uProj, uProjInv: u.uProjInv, uCamWorld: u.uCamWorld, uCamPos: u.uCamPos }) : null;
    this.passes = [this.gbuffer, this.gtao, this.vol, ...(this.bounce ? [this.bounce] : []), this.light];
    for (const p of this.passes) p.enabled = false;
  }

  setScenes(scene, camera) {
    for (const p of [this.gbuffer, this.gtao]) {
      p.scene = scene;
      p.camera = camera;
    }
    this.scene = scene;
    this.camera = camera;
    this.gbuffer.forget();
    this.candT = 0;
    this.touched.clear();
    this.recs.clear();
    for (const l of this.pool) {
      l.userData.src = null;
      l.userData.k = 0;
    }
    // (lo guardado de cada fuego va por la luz del mapa viejo: con reset solo,
    // esa luz dejaba viva la escena entera del mapa anterior; y la luna, igual)
    this.mc.free();
    this.mc.moon = null;
  }

  get on() {
    return !!this.cfg;
  }

  // Aplica lo de una calidad (LEVELS; null apaga todo). Sumar o sacar luces
  // con sombra recompila los shaders: solo pasa al cambiar la calidad.
  configure(cfg, game) {
    this.cfg = cfg || null;
    this.game = game;
    const c = this.cfg || {};
    this.gtao.enabled = !!c.ao;
    // (Personalizada: reflejos y haces de luna por separado; las calidades
    // traen los haces con los reflejos)
    const vol = c.vol ?? !!c.light;
    this.volOn = vol;
    this.light.enabled = !!c.light || vol;
    this.light.material.uniforms.uRefl.value = c.light ? 1 : 0;
    this.light.material.uniforms.uVolOn.value = vol ? 1 : 0;
    if (this.bounce) {
      this.bounce.enabled = !!c.bounce;
      this.bounce.configure?.(c, game);
    }
    this.vol.enabled = vol;
    this.mc.on = !!c.live;
    if (!c.live) this.mc.free();
    this.gbuffer.enabled = !!(c.ao || c.light || vol);
    // (solo para la oclusión: core/sizeCull deja afuera más piezas chicas)
    this.gbuffer.aoOnly = !c.light && !vol && !c.bounce;
    this.gbuffer.scale = c.gres || (c.light ? 1 : 0.5);
    this.gbuffer.setSize(this.gbuffer.w, this.gbuffer.h);
    if (c.ao) {
      const A = (game?.mapId === 'eclipse' && globalThis.__mduNoEclAo === true ? null : AO_MAP[game?.mapId]) || AO_BASE;
      this.gtao.updateGtaoMaterial({ radius: A.radius, distanceExponent: A.distanceExponent, thickness: A.thickness, scale: A.scale, samples: c.ao + A.more });
      this.gtao.updatePdMaterial({ samples: c.ao >= 12 ? 8 : 6 });
      this.gtao.blendIntensity = A.blend;
      this.gtao.blendMaterial.uniforms.uAoPow.value = A.pow ?? 1;
    }
    const scene = this.scene;
    this.pool.forEach((l, i) => {
      const on = i < (c.lamps || 0);
      // su mapa de sombra tiene que existir desde el primer cuadro (si no,
      // WebGL se queja del sampler vacío aunque la luz esté apagada)
      l.shadow.needsUpdate = true;
      l.shadow.radius = c.lampSoft ?? 3;
      if (on && scene && l.parent !== scene) scene.add(l);
      if (!on) {
        l.removeFromParent();
        l.userData.src = null;
        l.userData.k = 0;
      }
    });
    // sombras vivas: la luna se recalcula cada cuadro (parejo, sin tirones)
    this.renderer.shadowMap.autoUpdate = !!c.live;
    this.renderer.shadowMap.needsUpdate = true;
    const moon = game?.world?.moon;
    if (moon) {
      moon.shadow.radius = c.soft || 1;
      moon.shadow.autoUpdate = true;
      moon.shadow.needsUpdate = true;
    }
    this.shadowCasters(!!c.live, game);
  }

  // Con sombras vivas los zombies tiran sombra y lo que brilla (faroles, llamas) no:
  // si no, la luz de adentro del farol queda tapada por su propio vidrio.
  shadowCasters(on, game) {
    if (!on) {
      for (const [o, v] of this.touched) o.castShadow = v;
      this.touched.clear();
      return;
    }
    const set = (o, v) => {
      if (o.castShadow === v) return;
      if (!this.touched.has(o)) this.touched.set(o, o.castShadow);
      o.castShadow = v;
    };
    // (los ojos brillan: sin sombra, como los faroles)
    for (const M of game?.zombies?.meshes || []) set(M.im, M.key !== 'eye');
    if (game?.zombies?.batch) set(game.zombies.batch.mesh, true);
    this.scene?.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m?.emissive && m.emissiveIntensity > 0.2 && m.emissive.r + m.emissive.g + m.emissive.b > 0.3) set(o, false);
      else this.depthVariant(o);
    });
  }

  // three usa un solo material de sombra para todas las mallas y, cada vez que
  // pasa de una común a una instanciada (o con esqueleto), recalcula el programa:
  // con la luna y las tres luces del pool eran ~50 veces por cuadro. Cada tipo de
  // malla se queda con el suyo (las que three ya separa, con recorte, se dejan).
  depthVariant(o) {
    if (o.customDepthMaterial || o.customDistanceMaterial) return;
    const morph = o.geometry?.morphAttributes?.position?.length || 0;
    if (!o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !morph) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.alphaTest > 0 || m.alphaToCoverage || (m.displacementMap && m.displacementScale !== 0) || m.clippingPlanes?.length) return;
    }
    const key = `${o.isInstancedMesh ? 'I' : ''}${o.instanceColor ? 'c' : ''}${o.morphTexture ? 'm' : ''}${o.isSkinnedMesh ? 'S' : ''}${o.isBatchedMesh ? 'B' : ''}${morph}`;
    let v = this.depthMats.get(key);
    if (!v) {
      v = { depth: new THREE.MeshDepthMaterial(), dist: new THREE.MeshDistanceMaterial() };
      this.depthMats.set(key, v);
    }
    o.customDepthMaterial = v.depth;
    o.customDistanceMaterial = v.dist;
  }

  // Antes de dibujar: luces con sombra en los fuegos cercanos y los datos de la luna.
  before(dt, game) {
    const cfg = this.cfg;
    if (!cfg) return;
    const cam = this.camera;
    const scene = this.scene;
    if (!cam || !scene) return;
    this.mc.use(game?.world?.moon);
    this.candT -= dt;
    if (this.candT <= 0) {
      this.candT = 0.5;
      this.candidates.length = 0;
      if (cfg.lamps) {
        scene.traverse((o) => {
          // (no las adoptadas de World.adoptLight: van por las del pool)
          // (ni las que piden no tener sombra: los destellos de fx/Effects)
          if (o.isPointLight && o.name !== 'epicShadowLight' && o.distance >= 5 && o.layers.isEnabled(0) && !o.userData.noShadow) this.candidates.push(o);
        });
        this.zoneOf.clear();
        for (const e of game?.world?.lights || []) if (e.def?.zone) this.zoneOf.set(e.light, e.def.zone);
      }
      // lo que se sumó al mapa (zombies nuevos, cosas que se prenden)
      this.shadowCasters(cfg.live, game);
    }
    if (!cfg.lamps && !cfg.light && !this.volOn) return;
    const camPos = cam.getWorldPosition(this.camPos);
    if (cfg.lamps) this.pickLamps(dt, camPos, game, cfg.lamps);

    // uniforms de la pasada de luz
    const u = this.light.material.uniforms;
    cam.updateMatrixWorld();
    u.uProj.value.copy(cam.projectionMatrix);
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.copy(camPos);
    u.uUpView.value.set(0, 1, 0).transformDirection(tmpM.copy(cam.matrixWorldInverse));
    const w = game.world;
    const moon = w?.moon;
    const shadowTex = moon?.castShadow && moon.shadow.map?.depthTexture;
    u.uHasShadow.value = shadowTex ? 1 : 0;
    u.tShadow.value = shadowTex || noShadow;
    if (shadowTex) {
      u.tShadow.value = shadowTex;
      u.uShadowMatrix.value.copy(moon.shadow.matrix);
      u.uMoonDir.value.copy(moon.position).sub(moon.target.position).normalize();
      // de día (la granja al atardecer) casi no hay haces
      const night = 1 - 0.8 * (w.daylight ?? 0);
      u.uMoonColor.value.copy(moon.color).multiplyScalar(Math.min(moon.intensity, 2.5) * 0.9 * night);
    }
    const fog = scene.fog;
    u.uDensity.value = fog?.density ?? 0.03;
    // (abajo del agua, apenas: los haces se cortaban como una cuña)
    const V = VOL_MAP[game?.mapId];
    u.uScatter.value = (V?.scatter ?? 1) * (game?.player?.underwater ? 0.3 : 1);
    u.uSkyVol.value = V?.sky ?? 1;
    if (fog) u.uFogColor.value.copy(fog.color);
    u.uWet.value = game.weather?.wet || 0;
  }

  // Qué fuegos tiran sombra (cada luz con sombra dibuja la escena seis veces:
  // hay pocas). Cuenta cuánto se nota cada fuego: lo fuerte que es, la
  // distancia (de a poco: el fogón del gran salón se nota desde la otra punta)
  // y si está en el mismo lugar o se ve desde la cámara (el del otro lado de la
  // pared casi no cuenta). El que ya tiene sombra la conserva mientras no haya
  // otro bastante mejor. La sombra no aparece de golpe: la luz con sombra le va
  // sacando la luz al fuego (entre las dos alumbran igual) y al irse se la
  // devuelve. Un fuego recién prendido o que se mueve (un destello) espera un
  // poco: su sombra habría que rehacerla entera cada vez.
  pickLamps(dt, camPos, game, lamps) {
    const w = game?.world;
    const ranked = this.ranked;
    ranked.length = 0;
    this.visT -= dt;
    const recheck = this.visT <= 0;
    if (recheck) {
      this.visT = 0.2;
      this.here = w?.zoneAt?.(camPos.x, camPos.z, camPos.y) ?? null;
    }
    for (const l of this.candidates) {
      let r = this.recs.get(l);
      if (!r) {
        r = { l, p: new THREE.Vector3(), s: 0, v: -1, since: 0 };
        this.recs.set(l, r);
      }
      // (las del pool de World.adoptLight llevan la luz que representan: un
      // destello de fx/Effects tampoco va con sombra)
      if (!l.visible || l.intensity < 0.3 || !l.parent || l.userData.src?.userData?.noShadow) {
        r.since = 0;
        continue;
      }
      l.getWorldPosition(tmpP);
      r.since = tmpP.distanceToSquared(r.p) > 0.0025 ? 0 : r.since + dt;
      r.p.copy(tmpP);
      const d = r.p.distanceTo(camPos);
      if (d > l.distance + 6) continue;
      if (recheck || r.v < 0) r.v = this.zoneOf.get(l) === this.here && this.here ? 1 : this.seen(w, camPos, r.p, d);
      r.s = (l.intensity * r.v) / (1 + (d / LAMP_FALL) ** 2);
      // (y la que ya tiene sombra y se movió, la suelta: una luz que anda
      // rehacía lo quieto de su sombra en cada cuadro, ~400 llamadas)
      if (r.since < LAMP_WAIT && (!this.holds(l) || (r.since === 0 && globalThis.__mduMovingLamps !== true))) continue;
      if (this.holds(l)) r.s *= LAMP_HOLD;
      ranked.push(r);
    }
    ranked.sort((a, b) => b.s - a.s);
    if (ranked.length > lamps) ranked.length = lamps;
    // una lámpara nueva por cuadro: al entrar a un cuarto con varios fuegos no
    // se rehacen (o traen de lo guardado) todos los cubos de sombra de golpe
    let fresh = 1;
    // Lo quieto de cada cubo de sombra ya está guardado (ShadowCache): rehacerlo
    // es dibujar solo lo que se mueve cerca. Día por medio, todas las lámparas
    // que tienen algo moviéndose al lado.
    this.flip = !this.flip;
    for (let i = 0; i < lamps; i++) {
      const pl = this.pool[i];
      const u = pl.userData;
      if (u.src && !ranked.some((c) => c.l === u.src)) {
        // se va: primero se apaga su sombra
        u.k = Math.max(0, u.k - dt / LAMP_OUT);
        if (u.k === 0) u.src = null;
      } else if (u.src) u.k = Math.min(1, u.k + dt / LAMP_IN);
      if (!u.src && fresh) {
        const c = ranked.find((q) => !this.holds(q.l));
        if (c) {
          u.src = c.l;
          u.k = 0;
          fresh--;
        }
      }
      const r = u.src && this.recs.get(u.src);
      if (!r) {
        // (en la carga, ui/Arrival warmWorld: en la cámara y con alcance grande,
        // para que se compile la sombra de fuego de cada tipo de cosa; si no, se
        // compilaban al tomar el primer fuego después de la intro, ~60 ms)
        if (this.warmAt) {
          pl.position.copy(this.warmAt);
          pl.distance = 300;
          pl.intensity = 0.001;
          pl.shadow.needsUpdate = true;
          continue;
        }
        pl.intensity = 0;
        pl.distance = 1;
        pl.position.set(0, -500, 0);
        continue;
      }
      const l = u.src;
      if (pl.position.distanceToSquared(r.p) > 1e-4 || (this.flip && this.movingNear(r.p, l.distance, game))) pl.shadow.needsUpdate = true;
      pl.position.copy(r.p);
      pl.color.copy(l.color);
      pl.intensity = l.intensity * u.k;
      pl.distance = l.distance;
      pl.decay = l.decay;
      this.borrowed.push(l, l.intensity);
      l.intensity *= 1 - u.k;
    }
    // lo que siempre va con lo que se mueve (keepDyn) y cambió cerca de un fuego
    // con sombra: ese cubo se rehace (solo lo que se mueve, encima de lo guardado)
    const K = this.kicks;
    if (K?.length) {
      for (let i = 0; i < lamps; i++) {
        const pl = this.pool[i];
        if (!pl.userData.src) continue;
        for (let k = 0; k < K.length; k += 4) {
          if (pl.position.distanceToSquared(tmpP.set(K[k], K[k + 1], K[k + 2])) < (pl.distance + K[k + 3]) ** 2) {
            pl.shadow.needsUpdate = true;
            break;
          }
        }
      }
      K.length = 0;
    }
  }

  // Algo de keepDyn cambió en p (null: en cualquier lado): Epic.pickLamps
  kickShadow(p, r = 0) {
    if (!this.cfg?.lamps) return;
    const K = (this.kicks ||= []);
    if (K.length > 400) K.length = 0;
    if (p) K.push(p.x, p.y, p.z, r);
    else K.push(0, 0, 0, Infinity);
  }

  // ¿Ese fuego ya lo tiene alguna luz con sombra?
  holds(l) {
    for (const pl of this.pool) if (pl.userData.src === l) return true;
    return false;
  }

  // Un fuego de otro lugar: ¿se ve desde la cámara (por una puerta, una
  // ventana)? Lo que lo tapa pegado a él (la campana del fogón) no cuenta. Si
  // se ve cuenta la mitad (su sombra cae casi toda del otro lado); si no, poco.
  seen(w, cam, p, d) {
    if (!w?.raycast || d < 1) return 1;
    const dir = tmpD.copy(p).sub(cam).divideScalar(d);
    let t = Infinity;
    // (al terminar el castillo, la config del mapa vuelve antes que el mundo)
    try {
      t = w.raycast(cam, dir, d, this.rayHit);
    } catch {
      return 0.5;
    }
    return t === Infinity || t > d - 1.5 ? 0.5 : 0.15;
  }

  // Las mallas de los zombies van sin recorte (todos comparten las mismas) y en
  // el cubo de sombra de una lámpara se dibujaban en las seis caras. Mientras se
  // dibuja esa sombra se recortan con una esfera que abarca solo a los de cerca.
  fitZombies(l, on) {
    const f = this.zFit;
    const off = (this.zOff ||= []);
    if (!on) {
      for (let i = 0; i < f.length; i += 2) {
        f[i].frustumCulled = false;
        f[i].boundingSphere = f[i + 1];
      }
      f.length = 0;
      for (const im of off) im.visible = true;
      off.length = 0;
      return;
    }
    const Z = this.game?.zombies;
    if (!Z?.meshes) return;
    const p = l.position;
    const all = globalThis.__mduZShadowAll === true;
    // (de los fuegos con sombra, ¿este está entre los ZLAMPS más cerca de la cámara?)
    let near = true;
    const cam = this.game?.camera;
    if (!all && cam) {
      const c = cam.position;
      const d = p.distanceTo(c) - (l.userData.zNear ? ZLAMP_HOLD : 0);
      let closer = 0;
      for (const o of this.pool) {
        if (o === l || !o.parent || !(o.intensity > 0) || !o.castShadow) continue;
        if (o.position.distanceTo(c) - (o.userData.zNear ? ZLAMP_HOLD : 0) < d) closer++;
      }
      near = closer < ZLAMPS;
      l.userData.zNear = near;
    }
    const r2 = (l.distance + 1.5) ** 2;
    zBox.makeEmpty();
    if (near)
      for (const z of Z.pool) {
        if (!z.active || z.pos.distanceToSquared(p) > r2) continue;
        zBox.expandByPoint(z.pos);
        zBox.expandByPoint(tmpV.copy(z.pos).setY(z.pos.y + 2.4));
      }
    if (zBox.isEmpty()) zSphere.set(tmpV.set(0, -1e4, 0), 0);
    else zBox.expandByScalar(1).getBoundingSphere(zSphere);
    // (todo el cuerpo en una: entities/zombieBatch)
    const ims = Z.batch ? [{ key: 'batch', im: Z.batch.mesh }, ...Z.meshes.filter((M) => M.key === 'eye')] : Z.meshes;
    for (const M of ims) {
      const im = M.im;
      if (!all && ZSMALL.has(M.key) && im.visible) {
        im.visible = false;
        off.push(im);
        continue;
      }
      if (im.frustumCulled) continue;
      f.push(im, im.boundingSphere);
      im.boundingSphere = zSphere;
      im.frustumCulled = true;
    }
  }

  // ¿Algún zombie (o jefe) dentro del alcance de una luz?
  movingNear(p, r, game) {
    const Z = game?.zombies;
    if (!Z) return false;
    const r2 = r * r;
    for (const z of Z.pool) if (z.active && z.pos.distanceToSquared(p) < r2) return true;
    return !!(Z.boss?.active && Z.boss.pos.distanceToSquared(p) < r2);
  }

  // Después de dibujar: los fuegos recuperan su luz.
  after() {
    const b = this.borrowed;
    for (let i = 0; i < b.length; i += 2) b[i].intensity = b[i + 1];
    b.length = 0;
  }

  dispose() {
    this.configure(null, this.game);
    this.aoBlurFree?.();
    this.mc.dispose();
    for (const p of this.passes) p.dispose();
    for (const l of this.pool) l.dispose();
    for (const v of this.depthMats.values()) {
      v.depth.dispose();
      v.dist.dispose();
    }
  }
}
