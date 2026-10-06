import * as THREE from 'three';
import { forgetBossSkins } from '../entities/bossSkin';

// Al cambiar de mapa (o rearmarlo) lo del mapa viejo se suelta de verdad. Antes
// Game.disposeScene solo tiraba las geometrías de la escena: los materiales y
// las texturas quedaban en la placa (penal → estero: ~130 texturas, ~45
// programas de más), lo armado fuera de la escena (los muñecos de la entrada
// estacionados, lo escondido de los sistemas) también, y algunas referencias
// sueltas dejaban vivo el mapa entero (la escena, el mundo, los zombies).
// retireScene (al tirar la escena) anota sus materiales, texturas y lo de los
// sistemas del mapa que no está en la escena; flushRetired (ui/Arrival compile,
// con el mapa nuevo ya compilado) libera lo que el mapa nuevo no usa. Así lo
// compartido entre los dos (lo de core/textures, los mates, cachés de los
// módulos) no se vuelve a subir ni a compilar.
// (globalThis.__mduNoFlush: como antes)

let retired = null;

// Las geometrías que la placa recibió en cada mapa. three guarda, de cada una
// que dibujó, sus atributos (WebGLBindingStates) hasta que se la tira: las que
// el mapa armó y soltó sin tirar (efectos de un rato, lo de una cinemática)
// quedaban para siempre (penal → estero → castillo → ...: +300 por mapa).
// Al tirar el mapa, las de antes que el nuevo no usa se tiran. (Se guardan
// enteras, no débiles: una que el recolector se llevaba sin tirar ya no se
// podía soltar de three: en el estero, después del castillo, ~530 así.)
let epoch = 0;
const uploaded = new Set();
// Materiales y texturas: solo los nacidos desde que se armó el mapa que se va
// (el número de three crece siempre). Los de antes son de lo que vive entre
// mapas (mates, efectos, cachés armadas en el primero): tirarlos obligaba a
// recompilar (un tirón) la próxima vez que se usaran.
const nextId = (C) => {
  const o = new C();
  const id = o.id;
  o.dispose();
  return id;
};
let matFrom = 0;
let texFrom = 0;
{
  const G = THREE.BufferGeometry.prototype;
  const add = G.addEventListener;
  G.addEventListener = function (type, fn) {
    // (three escucha 'dispose' la primera vez que la sube: WebGLGeometries)
    if (type === 'dispose') {
      this.__ep = epoch;
      uploaded.add(this);
    }
    return add.call(this, type, fn);
  };
  const dispose = G.dispose;
  G.dispose = function () {
    uploaded.delete(this);
    return dispose.call(this);
  };
}

// los sistemas de cada mapa (Game.buildScene los arma de nuevo)
const SYSTEMS = ['world', 'nav', 'navs', 'fx', 'barriers', 'player', 'interact', 'activities', 'luz', 'curandero', 'ambience', 'zombies', 'rounds', 'lastZ', 'powerups', 'emp', 'pombero', 'vida', 'crow', 'ee', 'matorral', 'yasy', 'papq', 'intro', 'weather', 'decor', 'arena', 'critters', 'secrets', 'highWindows', 'water'];
// lo que vive entre mapas (no se recorre aunque un sistema lo tenga a mano)
const LIVE = ['renderer', 'audio', 'hud', 'menus', 'post', 'net', 'weapons', 'textures', 'settings', 'input', 'levels', 'arrival', 'music', 'canvas', 'root', 'cine', 'hitch', 'logros', 'titleIntro'];
const DEPTH = 7;

function collect(o, mats, tex, geos) {
  const add = (t) => {
    if (t?.isTexture) tex.add(t);
  };
  if (geos && o.geometry?.isBufferGeometry) geos.add(o.geometry);
  const list = Array.isArray(o.material) ? [...o.material] : o.material ? [o.material] : [];
  if (o.customDepthMaterial) list.push(o.customDepthMaterial);
  if (o.customDistanceMaterial) list.push(o.customDistanceMaterial);
  for (const m of list) {
    if (!m?.isMaterial) continue;
    mats.add(m);
    for (const k in m) add(m[k]);
    for (const u of Object.values(m.uniforms || {})) {
      const v = u?.value;
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    }
  }
}

// Lo que tienen a mano unos sistemas (roots): mallas (con lo de adentro) que no
// cuelgan de `scene`, y geometrías, materiales y texturas sueltos.
function gather(roots, seen, scene, R) {
  const inScene = (o) => {
    let p = o;
    while (p.parent) p = p.parent;
    return p === scene;
  };
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.isObject3D) {
      if (!inScene(v)) v.traverse((o) => collect(o, R.mats, R.tex, R.geos));
      return;
    }
    if (v.isBufferGeometry) return void R.geos.add(v);
    if (v.isMaterial) return void collect({ material: v }, R.mats, R.tex);
    if (v.isTexture) return void R.tex.add(v);
    if (d >= DEPTH || ArrayBuffer.isView(v) || v instanceof ArrayBuffer || v instanceof Node || v instanceof Event || (typeof AudioNode !== 'undefined' && v instanceof AudioNode) || (typeof AudioBuffer !== 'undefined' && v instanceof AudioBuffer)) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, d + 1);
    } else if (v instanceof Map) {
      for (const [k, x] of v) {
        walk(k, d + 1);
        walk(x, d + 1);
      }
    } else if (v instanceof Set) {
      for (const x of v) walk(x, d + 1);
    } else {
      for (const k of Object.keys(v)) {
        if (k === 'g' || k === 'game' || k === 'parent') continue;
        let x;
        try {
          x = v[k];
        } catch {
          continue;
        }
        walk(x, d + 1);
      }
    }
  };
  for (const r of roots) walk(r, 0);
}

// Lo de los sistemas del mapa que no cuelga de la escena: mallas guardadas,
// estacionadas o de repuesto (los muñecos de la entrada), sueltos.
function offScene(g, scene, R) {
  const seen = new Set([g, scene, window, document]);
  for (const k of LIVE) if (g[k] && typeof g[k] === 'object') seen.add(g[k]);
  gather(SYSTEMS.map((k) => g[k]), seen, scene, R);
}

export function retireScene(g) {
  const scene = g.scene;
  if (!scene) return;
  // (los jefes de verdad se sueltan después de juntar sus materiales y
  // texturas: sacados antes, su textura de 1024² quedaba en la placa en cada
  // partida nueva. globalThis.__mduNoBossFree: como antes)
  const bossLate = globalThis.__mduNoBossFree !== true;
  if (!bossLate || globalThis.__mduNoFlush === true) forgetBossSkins(scene);
  if (globalThis.__mduNoFlush === true) return;
  const t0 = performance.now();
  epoch++;
  retired ||= { mats: new Set(), tex: new Set(), geos: new Set() };
  const R = { mats: new Set(), tex: new Set(), geos: retired.geos };
  // (las geometrías de la escena las tira Game.disposeScene, como siempre)
  scene.traverse((o) => collect(o, R.mats, R.tex));
  if (bossLate) forgetBossSkins(scene);
  for (const t of [scene.background, scene.environment]) if (t?.isTexture) R.tex.add(t);
  try {
    offScene(g, scene, R);
  } catch {
    /* lo que se llegó a juntar */
  }
  for (const m of R.mats) if (m.id >= matFrom) retired.mats.add(m);
  for (const t of R.tex) if (t.id >= texFrom) retired.tex.add(t);
  // (lo que nazca desde ahora es del mapa nuevo)
  matFrom = nextId(THREE.Material);
  texFrom = nextId(THREE.Texture);
  // (para las pruebas: cuánto tardó juntar)
  g.retireMs = performance.now() - t0;
}

export const hasRetired = () => !!retired;

// Lo que usa el mapa nuevo y lo que vive entre mapas (llamar con todo a la
// vista: ui/Arrival compile, con los mates y los potenciadores de muestra en la
// escena).
export function keepOf(g) {
  const mats = new Set();
  const tex = new Set();
  const geos = new Set();
  const scan = (root) => root?.traverse?.((o) => collect(o, mats, tex, geos));
  scan(g.scene);
  scan(g.weapons?.vmScene);
  for (const m of g.weapons?.models?.values?.() || []) scan(m?.root);
  // (y todo lo que tienen los mates y los compañeros en línea: proyectiles, efectos)
  try {
    gather([g.weapons, g.net?.avatars], new Set([g, window, document, g.audio, g.hud, g.menus, g.renderer, g.post]), null, { mats, tex, geos });
  } catch {
    /* lo que se llegó a juntar */
  }
  for (const t of Object.values(g.textures || {})) if (t?.isTexture) tex.add(t);
  for (const t of [g.scene?.background, g.scene?.environment, g.weapons?.envMap]) if (t?.isTexture) tex.add(t);
  return { mats, tex, geos };
}

export function flushRetired(keep) {
  const R = retired;
  retired = null;
  if (!R || !keep) return { mats: 0, tex: 0, geos: 0 };
  let nm = 0;
  let nt = 0;
  let ng = 0;
  for (const m of R.mats) {
    if (keep.mats.has(m)) continue;
    try {
      m.dispose();
      nm++;
    } catch {
      /* uno raro no frena el cambio de mapa */
    }
  }
  for (const t of R.tex) {
    // (los de los render targets son de quien los armó: el agua, los efectos)
    if (keep.tex.has(t) || t.isRenderTargetTexture) continue;
    try {
      t.dispose();
      nt++;
    } catch {
      /* ídem */
    }
  }
  // (las sueltas de antes de este mapa, todavía en la placa)
  for (const ge of uploaded) if (ge.__ep < epoch) R.geos.add(ge);
  for (const ge of R.geos) {
    if (keep.geos.has(ge)) continue;
    try {
      ge.dispose();
      ng++;
    } catch {
      /* ídem */
    }
  }
  return { mats: nm, tex: nt, geos: ng };
}

// Para las pruebas: las geometrías en la placa, de este mapa o de antes, en la
// escena o afuera (con un ejemplo de nombre de cada grupo).
export function uploadedStats(g) {
  const inScene = new Set();
  g.scene?.traverse((o) => o.geometry && inScene.add(o.geometry));
  const vm = new Set();
  g.weapons?.vmScene?.traverse((o) => o.geometry && vm.add(o.geometry));
  const by = {};
  for (const ge of uploaded) {
    const k = `${ge.__ep === epoch ? 'nuevo' : 'viejo'}-${inScene.has(ge) ? 'escena' : vm.has(ge) ? 'mano' : 'fuera'}`;
    const b = (by[k] ||= { n: 0, tipos: {} });
    b.n++;
    const t = ge.type || ge.constructor?.name || '?';
    b.tipos[t] = (b.tipos[t] || 0) + 1;
  }
  return by;
}
