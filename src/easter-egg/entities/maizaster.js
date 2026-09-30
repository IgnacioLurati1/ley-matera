import * as THREE from 'three';
import { rng } from '../core/noise';
import { evenFoliage } from '../world/esterosGrass';
import { addGrassPush, GRASS_PUSH } from '../fx/grassPush';
import '../ui/maizaster.css';

// Maizaster (el perk de La Tapera, yerba Maleza Gaucha; también en el
// Challenge de la torre). De vez en cuando, el zombie que matás deja una mata
// de pasto alto y seco (paja brava con penachos de cortadera y cañas de maíz
// secas) donde cayó: brota en un segundo, dura LIFE segundos y se seca.
// Adentro de la mata los zombies no te ven: se olvidan de vos y deambulan
// (Game.nearestPlayer y Session.nearest saltean al que tiene maizIn, y
// Zombies.chase no le tira el zarpazo). Los jefes tampoco: se van, y ni las
// bolas de fuego ni la lluvia de la arena ni el cuervo del Espantapájaros van
// por el escondido (Arena.standing, bossMoves.target, Prado).
// Las matas son de geometría sólida (como el pajonal del estero: nada de
// recortes), se mecen con el viento y se abren alrededor de los que pasan
// (fx/grassPush.js: el mismo empuje, también en el G-buffer de Épica).
// En línea: el anfitrión decide cuándo brota una (cada uno le avisa si tiene
// el perk: 'maiz' {k:'has'}) y la reparte ({k:'grow'}); cada uno avisa si se
// metió o salió ({k:'in'}), así el anfitrión sabe a quién no buscar.
// Se arma una vez por partida (Interactables, donde está la máquina) y lo
// mueve Effects.update (g.fx.maiz).

// chance por muerto, espera entre una y otra del mismo jugador (s), cuánto
// dura, cuántas a la vez, distancia mínima entre dos, radio de la mata y
// hasta dónde esconde (m)
export const MAIZ = { chance: 0.08, cd: 10, life: 16, max: 3, gap: 4.5, r: 1.75, hide: 1.4 };
const GROW = 1.1;
const WITHER = 3;
const SLOTS = 4;
const PER = { grass: 16, stalk: 5 };
// radio con el que se abre el pasto (jugadores y zombies que pasan)
const PUSH_PLAYER = 1.25;
const PUSH_ZOMBIE = 0.9;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => u * u * (3 - 2 * u);

// ¿Está escondido en una mata? (el jugador local o el registro de un compañero)
export const hiddenInMaiz = (p) => !!p?.maizIn;

export function maizal(g) {
  if (!g.fx || !g.scene) return null;
  const m = g.fx.maiz;
  if (!m || m.g !== g || m.root.parent !== g.scene) g.fx.maiz = new Maizal(g);
  return g.fx.maiz;
}

// ---------------- las matas (geometría de 1 m de alto) ----------------
// Una cinta a lo largo de una curva: puntos, ancho y color en cada punto.
function builder() {
  const P = [];
  const N = [];
  const C = [];
  const I = [];
  const push = (x, y, z, n, c) => {
    P.push(x, y, z);
    N.push(n[0], n[1], n[2]);
    C.push(c.r, c.g, c.b);
  };
  const ribbon = (pts, widths, cols, side, nrm) => {
    const first = P.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const [x, y, z] = pts[k];
      const w = widths[k] / 2;
      push(x - side[0] * w, y - side[1] * w, z - side[2] * w, nrm, cols[k]);
      push(x + side[0] * w, y + side[1] * w, z + side[2] * w, nrm, cols[k]);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = first + k * 2;
      I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  const done = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I);
    geo.computeBoundingSphere();
    return geo;
  };
  return { ribbon, done };
}

// La mata de paja seca: hojas largas y paradas (las de afuera más caídas), de
// la base oscura a la punta pajiza (algunas grises, ya muertas), y unas cañas
// con el penacho de cortadera, claro y parado.
const BASE = new THREE.Color(0x2e2414);
const MID = new THREE.Color(0x8a7244);
const TIP = new THREE.Color(0xd6c088);
const GREY = new THREE.Color(0x9c9482);
const PLUME = new THREE.Color(0xe6dcc0);
const PLUME_TIP = new THREE.Color(0xf8f2e2);
function tussockGeo(seed) {
  const r = rng(seed);
  const { ribbon, done } = builder();
  const c = new THREE.Color();
  for (let k = 0; k < 40; k++) {
    const az = r() * Math.PI * 2;
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    const out = r();
    const tilt = 0.04 + out * 0.55;
    const len = (0.92 + r() * 0.26) * (1 - out * 0.25);
    const droop = 0.04 + out * 0.3 + r() * 0.1;
    const r0 = r() * 0.08;
    const w0 = 0.024 + r() * 0.016;
    const tip = r() < 0.3 ? GREY : TIP;
    const twist = (r() - 0.5) * 1.2;
    const pts = [];
    const ws = [];
    const cols = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      const h = Math.sin(tilt) * len * t;
      const y = Math.cos(tilt) * len * t - droop * len * t * t;
      pts.push([dx * (r0 + h), Math.max(0, y), dz * (r0 + h)]);
      ws.push(w0 * Math.pow(1 - t, 0.6) + 0.002);
      if (t < 0.3) c.copy(BASE).lerp(MID, t / 0.3);
      else c.copy(MID).lerp(tip, (t - 0.3) / 0.7);
      cols.push(c.clone());
    }
    const side = [-dz * Math.cos(twist), Math.sin(twist) * 0.4, dx * Math.cos(twist)];
    const nl = Math.hypot(dx * 0.7, 0.75, dz * 0.7);
    ribbon(pts, ws, cols, side, [(dx * 0.7) / nl, 0.75 / nl, (dz * 0.7) / nl]);
  }
  // las cortaderas: la caña y el penacho (hebras paradas, abiertas apenas)
  for (let k = 0; k < 4; k++) {
    const az = r() * Math.PI * 2;
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    const lean = r() * 0.18;
    const top = 1.02 + r() * 0.24;
    const pts = [];
    const cols = [];
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      pts.push([dx * Math.sin(lean) * top * t * t, top * t, dz * Math.sin(lean) * top * t * t]);
      cols.push(c.copy(BASE).lerp(MID, 0.4 + t * 0.6).clone());
    }
    ribbon(pts, [0.012, 0.01, 0.009, 0.008], cols, [-dz, 0, dx], [dx * 0.5, 0.86, dz * 0.5]);
    const [tx, ty, tz] = pts[pts.length - 1];
    for (let j = 0; j < 9; j++) {
      const a = az + (j / 9) * Math.PI * 2 + r() * 0.5;
      const ex = Math.cos(a) * 0.35;
      const ez = Math.sin(a) * 0.35;
      const l = 0.17 + r() * 0.1;
      const sp = [
        [tx - dx * 0.02, ty - l * 0.25, tz - dz * 0.02],
        [tx + ex * l * 0.2 + dx * lean * 0.1, ty + l * 0.35, tz + ez * l * 0.2 + dz * lean * 0.1],
        [tx + ex * l * 0.3 + dx * lean * 0.2, ty + l * 0.75, tz + ez * l * 0.3 + dz * lean * 0.2],
      ];
      ribbon(sp, [0.016, 0.04, 0.005], [PLUME, c.copy(PLUME).lerp(PLUME_TIP, 0.5).clone(), PLUME_TIP], [-Math.sin(a), 0, Math.cos(a)], [Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5]);
    }
  }
  return done();
}

// La caña de maíz seca: el tallo (dos cintas cruzadas), las hojas anchas que
// salen de los nudos, se arquean y cuelgan (secas, enruladas), y la panoja.
const STALK = new THREE.Color(0x8e7a4c);
const STALK_TOP = new THREE.Color(0xc6ae76);
const LEAF = new THREE.Color(0xb49a60);
const LEAF_TIP = new THREE.Color(0xdcc890);
const LEAF_OLD = new THREE.Color(0x8a6a3c);
function stalkGeo(seed) {
  const r = rng(seed);
  const { ribbon, done } = builder();
  const c = new THREE.Color();
  const lean = (r() - 0.5) * 0.08;
  const stem = [];
  const scol = [];
  for (let s = 0; s <= 4; s++) {
    const t = s / 4;
    stem.push([lean * t * t, t, 0]);
    scol.push(c.copy(STALK).lerp(STALK_TOP, t).clone());
  }
  const sw = [0.05, 0.044, 0.038, 0.032, 0.024];
  ribbon(stem, sw, scol, [1, 0, 0], [0, 0.3, 1]);
  ribbon(stem, sw, scol, [0, 0, 1], [1, 0.3, 0]);
  for (let k = 0; k < 7; k++) {
    const y0 = 0.22 + k * 0.1 + r() * 0.03;
    const az = k * 2.4 + r() * 0.6;
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    const len = 0.34 + r() * 0.18 - k * 0.012;
    const w = 0.07 + r() * 0.03;
    const old = r() < 0.35;
    const pts = [];
    const ws = [];
    const cols = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      // sube, se arquea y cae (la punta seca, enrulada para abajo)
      const hx = len * t;
      const y = y0 + Math.sin(t * Math.PI * 0.8) * len * 0.35 - t * t * t * len * 0.55;
      pts.push([lean * y0 * y0 + dx * hx, y, dz * hx]);
      ws.push(w * Math.sin(Math.min(1, t * 3 + 0.25) * Math.PI * 0.5) * (1 - t * 0.8) + 0.003);
      cols.push(c.copy(old ? LEAF_OLD : LEAF).lerp(LEAF_TIP, t * 0.8).clone());
    }
    ribbon(pts, ws, cols, [-dz, 0.15, dx], [dx * 0.35, 0.92, dz * 0.35]);
  }
  // la panoja arriba: unas ramitas finas, abiertas
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2 + r() * 0.4;
    const ex = Math.cos(a);
    const ez = Math.sin(a);
    const l = 0.12 + r() * 0.06;
    ribbon(
      [[lean, 0.98, 0], [lean + ex * l * 0.5, 1.02 + l * 0.35, ez * l * 0.5], [lean + ex * l, 1.0 + l * 0.2, ez * l]],
      [0.012, 0.009, 0.003],
      [STALK_TOP, LEAF_TIP, LEAF_TIP],
      [-ez, 0, ex],
      [ex * 0.4, 0.9, ez * 0.4],
    );
  }
  return done();
}

// ---------------- el material ----------------
// Lo del estero (hojas de dos caras con la misma normal y el empuje) más: se
// mece con el viento y, a menos de medio metro de la cámara, se deshace en
// puntitos (el que está adentro no ve una hoja pegada al ojo).
function grassMaterial(uT) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMzT = uT;
    sh.vertexShader = `uniform float uMzT;\nvarying float vMzCam;\n${sh.vertexShader}`
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	vec3 mzB = instanceMatrix[3].xyz;
	float mzH = clamp(transformed.y, 0.0, 1.4);
	float mzS = sin(uMzT * 1.3 + mzB.x * 0.7 + mzB.z * 0.5) * 0.05 + sin(uMzT * 2.9 + mzB.z * 1.3 + mzB.x) * 0.018;
	transformed.x += mzS * mzH * mzH;
	transformed.z += mzS * 0.6 * mzH * mzH;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
	vMzCam = distance((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);`,
      );
    sh.fragmentShader = `varying float vMzCam;\n${sh.fragmentShader}`.replace(
      'void main() {',
      `void main() {
	float mzNear = clamp((vMzCam - 0.22) / 0.4, 0.0, 1.0);
	if (mzNear < 1.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > mzNear) discard;`,
    );
  };
  mat.customProgramCacheKey = () => 'maizGrass';
  evenFoliage(mat);
  addGrassPush(mat);
  // (es pasto: en Épica, poca oclusión y sin reflejo; fx/Epic.js)
  mat.userData.foliage = true;
  return mat;
}

// ---------------- todo junto ----------------
class Maizal {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    this.root.name = 'maizal';
    g.scene.add(this.root);
    this.uT = { value: 0 };
    const mat = grassMaterial(this.uT);
    this.mat = mat;
    const mk = (geo, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, ZERO);
        im.setColorAt(i, tmpC.setRGB(1, 1, 1));
      }
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // (las matas andan por todo el mapa: se dibujan siempre; son pocas)
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.castShadow = false;
      this.root.add(im);
      return im;
    };
    this.grass = mk(tussockGeo(907), SLOTS * PER.grass);
    this.stalks = mk(stalkGeo(911), SLOTS * PER.stalk);
    this.patches = Array.from({ length: SLOTS }, () => ({ on: false }));
    // (anfitrión) quiénes tienen el perk, y la espera de cada uno
    this.has = new Set();
    this.cd = new Map();
    this.hadPerk = false;
    g.player.maizIn = false;
    this.pushUsed = 0;
    this.el = null;
  }

  // ¿Es de la partida que se está jugando? (en otro mapa queda colgada)
  live() {
    return this.root.parent === this.g.scene;
  }

  // ---------------- brotar ----------------
  // (anfitrión, o solo) murió un zombie: ¿deja una mata?
  onKill(z, info = {}, spot = null) {
    const g = this.g;
    if (!this.live() || (g.net && !g.net.host) || z.boss) return;
    const by = info.by != null && g.net && info.by !== g.net.id ? info.by : 'me';
    if (!(by === 'me' ? g.player.perks.has('maiz') : this.has.has(by))) return;
    if (g.time < (this.cd.get(by) ?? 0) || Math.random() > MAIZ.chance) return;
    const at = spot || z.pos;
    const x = at.x;
    const zz = at.z;
    const y = g.world.floorAt(x, zz, (z.baseY || 0) + 0.5);
    if (!Number.isFinite(y) || Math.abs(y - (z.baseY || 0)) > 1.2) return;
    if ((g.world.waterDepth?.(x, zz) ?? 0) > 0.4) return;
    let free = -1;
    let alive = 0;
    for (let i = 0; i < SLOTS; i++) {
      const p = this.patches[i];
      if (!p.on) {
        if (free < 0) free = i;
        continue;
      }
      alive++;
      if (Math.hypot(p.x - x, p.z - zz) < MAIZ.gap && Math.abs(p.y - y) < 2) return;
    }
    if (free < 0 || alive >= MAIZ.max) return;
    this.cd.set(by, g.time + MAIZ.cd);
    const seed = (Math.random() * 1e9) | 0;
    this.grow(free, x, y, zz, seed);
    g.net?.event('maiz', { k: 'grow', i: free, p: [+x.toFixed(2), +y.toFixed(2), +zz.toFixed(2)], s: seed });
  }

  // Brota la mata en el lugar i (en todas las compus igual: las plantas salen
  // de la semilla y del mapa, que es el mismo).
  grow(i, x, y, z, seed) {
    const g = this.g;
    const P = this.patches[i];
    if (!P) return;
    const r = rng(seed);
    const w = g.world;
    const ok = (px, pz) => {
      if (!w.circleFree(px, pz, 0.12, y + 0.3, y + 1.6) || !w.sweepFree(x, z, px, pz, 0.12, y + 0.3, y + 1.6)) return false;
      const fy = w.floorAt(px, pz, y + 0.5);
      return Number.isFinite(fy) && Math.abs(fy - y) < 0.35;
    };
    const plants = [];
    const R = MAIZ.r;
    for (let k = 0; k < PER.grass; k++) {
      // en espiral (parejas) con un poco de azar; las del medio, más altas
      const d = R * Math.sqrt((k + 0.5) / PER.grass) * (0.9 + r() * 0.15);
      const a = k * 2.39996 + r() * 0.6;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const h = 1.95 + (1 - d / R) * 0.45 + r() * 0.3;
      plants.push({ kind: 'grass', ok: ok(px, pz), x: px, z: pz, yaw: r() * Math.PI * 2, h, w: 0.55 + r() * 0.12, delay: (d / R) * 0.45 + r() * 0.15, tint: 0.86 + r() * 0.24 });
    }
    for (let k = 0; k < PER.stalk; k++) {
      const d = R * 0.75 * Math.sqrt(r());
      const a = r() * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      plants.push({ kind: 'stalk', ok: ok(px, pz), x: px, z: pz, yaw: r() * Math.PI * 2, h: 2.3 + r() * 0.45, w: 1, delay: 0.1 + r() * 0.35, tint: 0.9 + r() * 0.2 });
    }
    Object.assign(P, { on: true, x, y, z, t0: g.time, plants, last: -1 });
    this.growFx(P);
  }

  plantMatrix(P, i, j, pl, k, dry) {
    const im = pl.kind === 'grass' ? this.grass : this.stalks;
    const idx = pl.kind === 'grass' ? i * PER.grass + j : i * PER.stalk + (j - PER.grass);
    if (!pl.ok || k <= 0) {
      im.setMatrixAt(idx, ZERO);
      return;
    }
    // (al secarse se achica y se abre, como pasto pisado)
    const h = pl.h * k * (1 - 0.5 * dry * dry);
    const s = (pl.kind === 'grass' ? pl.h * pl.w : 1) * (0.35 + 0.65 * k) * (1 + dry * 0.25);
    tmpQ.setFromAxisAngle(UP, pl.yaw);
    im.setMatrixAt(idx, tmpM.compose(tmpP.set(pl.x, P.y, pl.z), tmpQ, tmpS.set(s, Math.max(1e-3, h), s)));
    const t = pl.tint * (1 - dry * 0.42);
    im.setColorAt(idx, tmpC.setRGB(t, t * (1 - dry * 0.08), t * (1 - dry * 0.14)));
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!this.live() || !g.player) return;
    this.uT.value += dt;
    let dirtyG = false;
    let dirtyS = false;
    let any = false;
    for (let i = 0; i < SLOTS; i++) {
      const P = this.patches[i];
      if (!P.on) continue;
      const age = g.time - P.t0;
      if (age >= MAIZ.life) {
        P.on = false;
        P.plants.forEach((pl, j) => this.plantMatrix(P, i, j, pl, 0, 0));
        dirtyG = dirtyS = true;
        continue;
      }
      any = true;
      const dry = clamp01((age - (MAIZ.life - WITHER)) / WITHER);
      const growing = age < GROW + 0.7;
      if (growing || dry > 0 || P.last < 0) {
        P.plants.forEach((pl, j) => this.plantMatrix(P, i, j, pl, smooth(clamp01((age - pl.delay) / GROW)), dry));
        dirtyG = dirtyS = true;
        P.last = age;
      }
      if (dry > 0 && !P.dryFx) {
        P.dryFx = true;
        this.dryFx(P);
      }
      // la paja seca que se vuela al final
      if (dry > 0 && Math.random() < dt * 14) this.chaff(P, 1);
    }
    if (dirtyG) {
      this.grass.instanceMatrix.needsUpdate = true;
      this.grass.instanceColor.needsUpdate = true;
    }
    if (dirtyS) {
      this.stalks.instanceMatrix.needsUpdate = true;
      this.stalks.instanceColor.needsUpdate = true;
    }
    this.pushers(any);
    this.hideCheck();
    this.perkCheck();
  }

  // Los que abren el pasto (fx/grassPush): los jugadores y los zombies que
  // andan adentro de alguna mata.
  pushers(any) {
    const g = this.g;
    const PUSH = GRASS_PUSH.push.value;
    let n = 0;
    const add = (x, y, z, r) => {
      if (n >= 4) return;
      PUSH[n * 2].set(x, y, z, r);
      PUSH[n * 2 + 1].set(x, y, z, 0);
      n++;
    };
    if (any) {
      const inside = (x, y, z) => this.patches.some((P) => P.on && Math.hypot(P.x - x, P.z - z) < MAIZ.r + 1 && Math.abs(P.y - y) < 2);
      const p = g.player;
      if (p.alive && inside(p.pos.x, p.pos.y, p.pos.z)) add(p.pos.x, p.pos.y, p.pos.z, PUSH_PLAYER);
      if (g.net) for (const r of g.net.remote.values()) if (!r.dead && inside(r.pos.x, r.pos.y || 0, r.pos.z)) add(r.pos.x, r.pos.y || 0, r.pos.z, PUSH_PLAYER);
      for (const z of g.zombies?.pool || []) {
        if (n >= 4) break;
        if (z.active && !z.dead && inside(z.pos.x, z.baseY || 0, z.pos.z)) add(z.pos.x, z.baseY || 0, z.pos.z, PUSH_ZOMBIE);
      }
    }
    for (let i = n; i < this.pushUsed; i++) {
      PUSH[i * 2].w = 0;
      PUSH[i * 2 + 1].w = 0;
    }
    this.pushUsed = n;
    GRASS_PUSH.count.value = n * 2;
  }

  // ¿El local está adentro de una mata ya crecida (y no seca del todo)?
  hideCheck() {
    const g = this.g;
    const p = g.player;
    let inNow = false;
    if (p.alive && !p.downed && g.state === 'playing') {
      for (const P of this.patches) {
        if (!P.on) continue;
        const age = g.time - P.t0;
        if (age < 0.8 || age > MAIZ.life - 1) continue;
        if (Math.hypot(P.x - p.pos.x, P.z - p.pos.z) < MAIZ.hide && Math.abs((p.pos.y || 0) - P.y) < 1.5) {
          inNow = true;
          break;
        }
      }
    }
    if (inNow === !!p.maizIn) return;
    p.maizIn = inNow;
    g.net?.share('maiz', { k: 'in', id: g.net.id, on: inNow ? 1 : 0 });
    this.overlay(inNow);
    this.sndRustle(null, inNow ? 0.9 : 0.6);
    if (inNow) this.sndHush();
  }

  // Cada uno le cuenta al anfitrión si tiene el perk (así sabe si su muerto deja mata).
  perkCheck() {
    const g = this.g;
    const has = g.player.perks.has('maiz');
    if (has === this.hadPerk) return;
    this.hadPerk = has;
    if (g.net && !g.net.host) g.net.share('maiz', { k: 'has', id: g.net.id, on: has ? 1 : 0 });
  }

  // ---------------- red ----------------
  onEvent(m) {
    const g = this.g;
    if (!this.live()) return;
    if (m.k === 'grow' && Array.isArray(m.p)) {
      if (!g.net?.host) this.grow(m.i | 0, +m.p[0], +m.p[1], +m.p[2], m.s | 0);
    } else if (m.k === 'has') {
      if (m.on) this.has.add(m.id);
      else this.has.delete(m.id);
    } else if (m.k === 'in') {
      const r = g.net?.remote.get(m.id);
      if (r) r.maizIn = !!m.on;
    }
  }

  // ---------------- lo que se ve y se oye ----------------
  growFx(P) {
    const g = this.g;
    // tierra y paja que saltan, y el pasto que sube crujiendo
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * MAIZ.r;
      const v = 0.6 + Math.random() * 1.4;
      g.fx.alpha?.spawn(P.x + Math.cos(a) * d, P.y + 0.1, P.z + Math.sin(a) * d, Math.cos(a) * v, 1 + Math.random() * 1.8, Math.sin(a) * v, { color: [0.42, 0.34, 0.2], size: 0.12, size1: 0.5, life: 0.8 + Math.random() * 0.6, alpha: 0.45, gravity: 2, drag: 1.5 });
    }
    this.chaff(P, 12);
    const A = g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.set(P.x, P.y + 1, P.z), gain: 0.9, reverb: 0.2, ref: 5 });
    const t = A.now;
    A.noise(o, { t, dur: 1.1, type: 'bandpass', freq: 900, freqEnd: 3400, q: 0.7, gain: 0.5, attack: 0.4 });
    for (let k = 0; k < 10; k++) A.noise(o, { t: t + 0.1 + Math.random() * 1, dur: 0.03, type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.3 });
  }

  dryFx(P) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.set(P.x, P.y + 1, P.z), gain: 0.6, reverb: 0.2, ref: 4 });
    const t = A.now;
    for (let k = 0; k < 14; k++) A.noise(o, { t: t + Math.random() * 2.4, dur: 0.02 + Math.random() * 0.03, type: 'bandpass', freq: 2500 + Math.random() * 3500, q: 2, gain: 0.35 });
    A.noise(o, { t, dur: 2.6, type: 'bandpass', freq: 3000, freqEnd: 1200, q: 0.8, gain: 0.18, attack: 0.3 });
  }

  // Pedacitos de paja que vuelan.
  chaff(P, n) {
    const g = this.g;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * MAIZ.r;
      g.fx.alpha?.spawn(P.x + Math.cos(a) * d, P.y + 0.4 + Math.random() * 1.8, P.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, { color: [0.78, 0.66, 0.4], size: 0.035, size1: 0.03, life: 1.2 + Math.random() * 1.2, alpha: 0.9, gravity: 0.6, drag: 1.2 });
    }
  }

  // El roce de la paja (al entrar o salir; sin lugar: es el de uno).
  sndRustle(pos, k = 1) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.5 * k, reverb: 0.1 });
    const t = A.now;
    A.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 2600 + Math.random() * 1200, freqEnd: 1400, q: 0.8, gain: 0.6, attack: 0.03 });
    A.noise(o, { t: t + 0.12, dur: 0.25, type: 'highpass', freq: 4200, q: 0.5, gain: 0.3, attack: 0.02 });
  }

  // Un "shhh" bajito: estás escondido.
  sndHush() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.22, reverb: 0.25 });
    A.noise(o, { t: A.now + 0.18, dur: 0.7, type: 'bandpass', freq: 3600, q: 0.9, gain: 0.5, attack: 0.2 });
  }

  // El borde de la pantalla con la paja de adelante (y el medallón que brilla).
  overlay(on) {
    const g = this.g;
    if (!this.el || !this.el.isConnected) {
      const el = document.createElement('div');
      el.className = 'mdu-maiz';
      el.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="none">${blades()}</svg>`;
      g.root.appendChild(el);
      this.el = el;
    }
    this.el.classList.toggle('is-on', on);
    g.hud.perks?.querySelector?.('[data-perk="maiz"]')?.classList.toggle('is-hid', on);
  }
}

// Las hojas de paja de los bordes de la pantalla (siluetas, abajo y a los costados).
let bladesSvg = null;
function blades() {
  if (bladesSvg) return bladesSvg;
  const r = rng(915);
  let out = '';
  const leaf = (x0, y0, dx, dy, w, c) => {
    const x1 = x0 + dx;
    const y1 = y0 + dy;
    const mx = x0 + dx * 0.45 + (r() - 0.5) * 60;
    const my = y0 + dy * 0.55;
    out += `<path d="M${x0 - w} ${y0} Q${mx - w * 0.5} ${my} ${x1} ${y1} Q${mx + w * 0.5} ${my} ${x0 + w} ${y0} Z" fill="${c}"/>`;
  };
  const cols = ['#1c140a', '#2a1e0e', '#3a2a14', '#4a3818'];
  for (let i = 0; i < 46; i++) {
    const x = r() * 1600;
    const edge = Math.min(x, 1600 - x) / 800;
    const h = (260 + r() * 360) * (1.25 - edge * 0.7);
    leaf(x, 910, (r() - 0.5) * 260 + (x < 800 ? 60 : -60) * (1 - edge), -h, 10 + r() * 16, cols[(r() * cols.length) | 0]);
  }
  for (const side of [0, 1]) {
    for (let i = 0; i < 12; i++) {
      const y = 200 + r() * 700;
      const x = side ? 1610 : -10;
      leaf(x, y, (side ? -1 : 1) * (120 + r() * 180), -(160 + r() * 240), 8 + r() * 12, cols[(r() * cols.length) | 0]);
    }
  }
  bladesSvg = out;
  return out;
}
