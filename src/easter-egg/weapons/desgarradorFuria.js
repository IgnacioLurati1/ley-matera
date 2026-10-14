import * as THREE from 'three';
import { eclSfx } from '../fx/eclipseSfx';
import { PAL } from './desgarradorFx';
import { REST_P, NP, sample } from './desgarradorMoves';

// furia11 (2026-10-10, el usuario: "Mejora a la furia de la guadaña. Ahora al
// activarla hará una animación de cómo concentrando su poder para desatarlo y
// empezar el estado de furia (animación vistosa). Mientras se está prendiendo
// sonará esto 'se activo la furia.mp3' (ojo, arranca medio fuerte el audio, un
// fade in para que acumule volumen vendría bien). Cuando la barra se llena
// 'furia se cargo.mp3' y cuando la furia se acaba 'furia se acaba.mp3'").
// Lo que usa weapons/Desgarrador.js para eso:
//  · CONC: los tiempos. La H con la barra llena ya no prende la Furia de una:
//    primero CONC.time s de concentrar (la guadaña parada como un báculo
//    delante, el polvo que se le mete en la cabeza, la luz que crece, la
//    pantalla que se tensa), después el golpe del regatón contra el piso
//    (CONC.hit s) y ahí se desata: arranca la Furia de siempre.
//  · concPose: la pose de la mano en cada momento.
//  · FuriaGather: las chispas que se meten en la cabeza del arma y el
//    resplandor que crece (en la escena de la mano; se arma en la carga).
//  · concWorld / concBurst: lo que se ve en el mundo (también en el muñeco de
//    un compañero): el polvo que va hacia la guadaña y el estallido.
//  · furiaSnd: los tres sonidos grabados (fx/eclipseSfx), con la entrada
//    fundida y desde dónde arranca.
export const FURIA_SND = ['furia-activa', 'furia-cargada', 'furia-fin'];

// time: cuánto concentra; hit: lo que tarda en bajar el golpe (ahí se desata);
// out: del golpe a la quieta; move: cuánto camina mientras concentra (no queda
// clavado: se puede seguir escapando, despacio); guard: cuánto más allá del
// golpe no lo tocan (Player.guardT: concentrando no te pueden lastimar).
// sndHit: en qué segundo del grabado está la subida máxima (va con el golpe);
// sndFade: cuánto tarda en entrar.
export const CONC = { time: 1.4, hit: 0.085, out: 0.6, move: 0.4, guard: 0.5, sndHit: 2.85, sndFade: 1.15 };
// (el grabado arranca adelantado para que su subida caiga con el golpe)
export const SND_OFF = Math.max(0, CONC.sndHit - CONC.time - CONC.hit);

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rnd = () => Math.random() - 0.5;

const _from = new Array(NP).fill(0);
// furia12 (2026-10-10, el usuario: "La animación de cargar la furia no me
// convence. Sugiero que la guadaña se levante de las manos (siguiendo la pose
// horizontal) como volando, parezca que se está cargando y vuelva a caer a la
// posición original"). Ya no se para como un báculo ni golpea el piso: queda
// acostada como en la quieta, las manos la sueltan (bajan apenas) y sube
// flotando; arriba se mece y tiembla cada vez más mientras se le meten las
// chispas (FuriaGather, que sigue a la cabeza del arma); toma un poco más de
// altura y cae de golpe a las manos, que ceden con el peso y vuelven. La Furia
// prende cuando cae (los mismos tiempos de CONC: el sonido no cambia).
//  · floatPose: las manos (la pose de siempre, un poco abajo).
//  · concFloat: cuánto se separa la guadaña de las manos (weapons/Desgarrador
//    lo pone en el grupo del arma, después de la pose).
// up: cuánto sube; rise: en cuánto; more: la toma de altura del final y desde
// cuándo antes de caer (air); fall: cuánto antes de CONC.time empieza a caer;
// hands: cuánto bajan las manos al soltarla; give: cuánto ceden al atajarla
const FLOAT = { up: 0.085, rise: 0.55, more: 0.024, air: 0.42, fall: 0.07, hands: 0.016, give: 0.034 };
const _open = new Array(NP).fill(0);
const _catch = new Array(NP).fill(0);
const _back = new Array(NP).fill(0);
const FLOAT_UP = [
  [0, _from],
  [0.34, _open, 'io'],
  [CONC.time, _open, 'l'],
];
const FLOAT_OUT = [
  [0, _open],
  [CONC.hit, _open, 'l'],
  [CONC.hit + 0.09, _catch, 'o'],
  [CONC.hit + 0.3, _back, 'io'],
  [CONC.hit + CONC.out, REST_P, 'io'],
];
function floatPose(t, from, P) {
  for (let j = 0; j < NP; j++) {
    _from[j] = from?.[j] ?? REST_P[j];
    _open[j] = _catch[j] = _back[j] = REST_P[j];
  }
  _open[1] -= FLOAT.hands;
  _catch[1] -= FLOAT.give;
  _back[1] += 0.004;
  if (t < CONC.time) {
    sample(FLOAT_UP, t, P);
    return clamp01(t / CONC.time);
  }
  sample(FLOAT_OUT, Math.min(t - CONC.time, CONC.hit + CONC.out), P);
  return 1;
}
// Cuánto se separa la guadaña de las manos a los t s de la H (en la mano: x a
// la derecha, y arriba, z hacia uno) y cuánto se ladea (radianes): out = [x, y,
// z, cabeceo, ladeo]. Después de caer, todo en cero.
export function concFloat(t, time, out) {
  const T = CONC.time;
  const end = T + CONC.hit;
  out[0] = out[1] = out[2] = out[3] = out[4] = 0;
  if (t >= end) return out;
  // (despacio al despegar y al frenar: levita, no salta)
  const rise = smooth(clamp01(t / FLOAT.rise));
  const more = smooth(clamp01((t - (T - FLOAT.air)) / (FLOAT.air - FLOAT.fall)));
  // (cae acelerando: llega a las manos justo cuando prende)
  const q = clamp01((t - (T - FLOAT.fall)) / (FLOAT.fall + CONC.hit));
  const held = 1 - q * q;
  const k = clamp01(t / T);
  // se mece despacio y tiembla cada vez más (el poder que no entra)
  const a = (0.0005 + 0.0032 * k * k) * held;
  out[0] = Math.sin(time * 61) * a + Math.sin(time * 1.7) * 0.004 * rise * held;
  out[1] = (FLOAT.up * rise + FLOAT.more * more + Math.sin(time * 3.1) * 0.005 * rise) * held + Math.sin(time * 53 + 1.3) * a;
  out[2] = Math.sin(time * 47 + 2.1) * a * 0.5;
  out[3] = Math.sin(time * 2.3) * 0.022 * rise * held;
  out[4] = Math.sin(time * 1.9 + 1) * 0.03 * rise * held;
  return out;
}

// t: segundos desde la H; from: la pose en la que estaba (sin salto); time:
// para el temblor. Devuelve cuánto giran los aros (0..1, para el que lo quiera).
export function concPose(t, from, time, P) {
  return floatPose(t, from, P);
}

// ---------------- las chispas que se le meten (la escena de la mano) ----------------
// Cada chispa es una raya finita (una cinta de SEG cortes: la cabeza ancha y
// viva, la cola en punta y apagada) que entra dando la vuelta, cada vez más
// rápido. Rayas y no puntos: de cerca los puntos redondos son "burbujitas" (el
// usuario ya las hizo sacar una vez); primero fueron puntos con cola y se leían
// como rosarios de bolitas (hoja furia11/shots/_h4_cab.png).
const SPARKS = 56;
const SEG = 3;
const SEG_W = [1, 0.62, 0.04];
const SEG_A = [1, 0.5, 0];
// (cuánto más atrás en su camino va cada corte: la raya se estira al acelerar)
const DU_IN = 0.07;
const DU_OUT = 0.11;
const VS = `
attribute float aSize; attribute vec4 aCol;
uniform float uScale;
varying vec4 vCol;
void main(){
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec4 vCol;
void main(){
  if (vCol.a <= 0.002) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  // un punto con el centro vivo y la falda suave
  float f = pow(1.0 - r, 2.2);
  gl_FragColor = vec4(vCol.rgb * f * vCol.a, 1.0);
}`;
const _h = new THREE.Vector3();
const _p = [0, 0, 0, 0, 0, 0, 0, 0, 0];
// violeta, violeta claro, violeta hondo y (la del Eclipse) oro: saturados, para
// que sumados no se laven a blanco
const SPARK_C = [[0.78, 0.32, 1], [0.95, 0.58, 1], [0.55, 0.2, 1]];
const GOLD = [1.2, 0.8, 0.3];
export class FuriaGather {
  constructor() {
    // las rayas (el mismo material que la estela del tajo: no compila nada nuevo)
    const sg = new THREE.BufferGeometry();
    const nv = SPARKS * SEG * 2;
    this.sp = new Float32Array(nv * 3);
    this.sc = new Float32Array(nv * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sc, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < SPARKS; i++) {
      for (let j = 0; j < SEG - 1; j++) {
        const a = (i * SEG + j) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    sg.setIndex(idx);
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    this.streakMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false });
    this.streaks = new THREE.Mesh(sg, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 11;
    // el resplandor de la cabeza del arma: un punto que crece (y el destello del golpe)
    const pg = new THREE.BufferGeometry();
    this.pos = new Float32Array(3);
    this.size = new Float32Array(1);
    this.col = new Float32Array(4);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    this.glowPt = new THREE.Points(pg, this.mat);
    this.glowPt.frustumCulled = false;
    this.glowPt.renderOrder = 11;
    this.mesh = new THREE.Group();
    this.mesh.add(this.streaks, this.glowPt);
    this.mesh.visible = false;
    // cada chispa: la edad (-1: libre), la vida, de dónde sale (respecto de la
    // cabeza del arma), cuánto da la vuelta, el medio ancho, el color y si sale
    // (el golpe) en vez de entrar
    this.S = [];
    for (let i = 0; i < SPARKS; i++) this.S.push({ age: -1, life: 1, x: 0, y: 0, z: 0, sw: 0, s: 0.003, c: 0, out: 0 });
    this.next = 0;
    this.acc = 0;
    this.glow = 0;
    this.flashK = 0;
    this.live = 0;
  }

  // Para la carga (Weapons.warmFx): una copia a la vista.
  warmMesh() {
    const grp = new THREE.Group();
    const a = new THREE.Mesh(this.streaks.geometry, this.streakMat);
    const b = new THREE.Points(this.glowPt.geometry, this.mat);
    a.frustumCulled = b.frustumCulled = false;
    grp.add(a, b);
    return grp;
  }

  // El golpe: las que estaban entrando se cortan y salen disparadas otras.
  burst() {
    this.flashK = 1;
    for (let i = 0; i < SPARKS; i++) {
      const s = this.S[i];
      if (i >= 34) {
        s.age = -1;
        continue;
      }
      const a = Math.random() * Math.PI * 2;
      const b = rnd() * 1.1;
      const r = 0.26 + Math.random() * 0.46;
      s.age = 0;
      s.life = 0.26 + Math.random() * 0.2;
      s.x = Math.cos(a) * Math.cos(b) * r;
      s.y = Math.sin(a) * Math.cos(b) * r;
      s.z = Math.sin(b) * r * 0.5;
      s.sw = rnd() * 0.5;
      s.s = 0.0024 + Math.random() * 0.002;
      s.c = Math.random();
      s.out = 1;
    }
  }

  // m: la guadaña de la mano; k: cuánto lleva concentrando (0..1; 0: nada
  // nuevo); gold: la del Eclipse (oro entre el violeta); scale: el alto de la
  // pantalla sobre 2·tan(fov/2) de la cámara de la mano; root: el grupo donde
  // cuelga (Weapons.vmRoot).
  update(dt, m, k, gold, scale, root, time) {
    this.mat.uniforms.uScale.value = scale;
    const want = k > 0 && !!m?.head;
    this.glow += ((want ? k : 0) - this.glow) * Math.min(1, dt * (want ? 9 : 6));
    this.flashK = Math.max(0, this.flashK - dt / 0.28);
    if (!want && this.live <= 0 && this.glow < 0.004 && this.flashK <= 0) {
      this.mesh.visible = false;
      this.acc = 0;
      return;
    }
    if (m?.head) {
      m.head.getWorldPosition(_h);
      root.worldToLocal(_h);
      this.hx = _h.x;
      this.hy = _h.y;
      this.hz = _h.z;
    }
    const hx = this.hx || 0;
    const hy = this.hy || 0;
    const hz = this.hz || 0;
    if (want) {
      this.acc += dt * (16 + 44 * k);
      while (this.acc >= 1) {
        this.acc -= 1;
        const s = this.S[this.next];
        this.next = (this.next + 1) % SPARKS;
        // de alrededor, casi en el plano de la pantalla (la vuelta se ve de frente)
        const a = Math.random() * Math.PI * 2;
        const b = rnd() * 0.9;
        const r = 0.26 + Math.random() * 0.34;
        s.age = 0;
        s.life = 0.6 - 0.2 * k + Math.random() * 0.14;
        s.x = Math.cos(a) * Math.cos(b) * r;
        s.y = Math.sin(a) * Math.cos(b) * r;
        s.z = Math.sin(b) * r * 0.45 - 0.02;
        // (una vuelta apenas: se tienen que leer yendo a la cabeza del arma)
        s.sw = 0.5 + Math.random() * 0.7;
        s.s = 0.002 + Math.random() * 0.0018;
        s.c = Math.random();
        s.out = 0;
      }
    } else this.acc = 0;
    let live = 0;
    const P = this.sp;
    const C = this.sc;
    for (let i = 0; i < SPARKS; i++) {
      const s = this.S[i];
      const o = i * SEG * 2;
      if (s.age >= 0) {
        s.age += dt / s.life;
        if (s.age >= 1) s.age = -1;
      }
      if (s.age < 0) {
        // (libre: la cinta, sin área y apagada)
        for (let q = o; q < o + SEG * 2; q++) {
          P[q * 3] = hx;
          P[q * 3 + 1] = hy;
          P[q * 3 + 2] = hz;
          C[q * 3] = C[q * 3 + 1] = C[q * 3 + 2] = 0;
        }
        continue;
      }
      live++;
      const D = gold && s.c > 0.66 ? GOLD : SPARK_C[s.c < 0.3 ? 0 : s.c < 0.5 ? 2 : 1];
      // los cortes de la raya: el mismo camino, cada uno un poco antes
      for (let j = 0; j < SEG; j++) {
        const u = Math.max(0, s.age - j * (s.out ? DU_OUT : DU_IN));
        // entra: cada vez más rápido y dando la vuelta; sale: derecho y frenando
        const rr = s.out ? 1 - (1 - u) * (1 - u) : 1 - u * u;
        const ang = s.sw * (s.out ? u * 0.4 : u * u * 1.7);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        _p[j * 3] = hx + (s.x * ca - s.y * sa) * rr;
        _p[j * 3 + 1] = hy + (s.x * sa + s.y * ca) * rr;
        _p[j * 3 + 2] = hz + s.z * rr;
      }
      // (de canto a la cámara: el ancho, perpendicular a la raya en el plano de la pantalla)
      let dx = _p[0] - _p[6];
      let dy = _p[1] - _p[7];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const al = (s.out ? (1 - s.age) * (1 - s.age) : smooth(clamp01(s.age / 0.2)) * (0.55 + 0.45 * s.age)) * 1.15;
      for (let j = 0; j < SEG; j++) {
        const w = s.s * SEG_W[j];
        const a = al * SEG_A[j];
        for (let e = 0; e < 2; e++) {
          const q = o + j * 2 + e;
          const sg = e ? 1 : -1;
          P[q * 3] = _p[j * 3] - dy * w * sg;
          P[q * 3 + 1] = _p[j * 3 + 1] + dx * w * sg;
          P[q * 3 + 2] = _p[j * 3 + 2];
          C[q * 3] = D[0] * a;
          C[q * 3 + 1] = D[1] * a;
          C[q * 3 + 2] = D[2] * a;
        }
      }
    }
    this.live = live;
    // el resplandor de la cabeza (crece con lo que junta; el destello del golpe)
    this.pos[0] = hx;
    this.pos[1] = hy;
    this.pos[2] = hz + 0.035;
    const gk = this.glow;
    const fl = this.flashK;
    this.size[0] = 0.045 + 0.085 * gk + 0.012 * gk * Math.sin(time * 23) + 0.15 * fl * (2 - fl);
    this.col[0] = 0.72;
    this.col[1] = gold ? 0.42 : 0.34;
    this.col[2] = 1.0;
    this.col[3] = Math.min(0.8, 0.42 * gk * gk + 0.4 * fl);
    this.mesh.visible = true;
    const G = this.streaks.geometry;
    G.attributes.position.needsUpdate = true;
    G.attributes.color.needsUpdate = true;
    const Gp = this.glowPt.geometry;
    Gp.attributes.position.needsUpdate = true;
    Gp.attributes.aSize.needsUpdate = true;
    Gp.attributes.aCol.needsUpdate = true;
  }

  clear() {
    for (const s of this.S) s.age = -1;
    this.sc.fill(0);
    this.streaks.geometry.attributes.color.needsUpdate = true;
    this.live = 0;
    this.glow = 0;
    this.flashK = 0;
    this.acc = 0;
    this.mesh.visible = false;
  }
}

// ---------------- en el mundo ----------------
// El polvo de alrededor que va hacia la guadaña (at: la cabeza del arma) desde
// el piso y el aire, más cuanto más junta. fy: el piso. far: cuánto más lejos
// nace (el propio: lejos, para verlo venir; el del compañero: alrededor).
// rate: cuánto (en primera persona, menos: de cerca son puntos redondos y el
// usuario ya pidió sacar "burbujitas"; las rayas las hacen las chispas de la mano).
export function concWorld(g, at, fy, k, dt, gold, far = 1, rate = 1) {
  const n = dt * (16 + 70 * k) * rate;
  let c = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  while (c-- > 0) {
    const a = Math.random() * Math.PI * 2;
    const r = (1.7 + Math.random() * 2.6) * far;
    const x = at.x + Math.cos(a) * r;
    const z = at.z + Math.sin(a) * r;
    const y = Math.random() < 0.6 ? fy + 0.05 + Math.random() * 0.5 : at.y + rnd() * 2.2;
    const tt = 0.42 + Math.random() * 0.2 - 0.12 * k;
    g.fx.add.spawn(x, y, z, (at.x - x) / tt, (at.y - y) / tt, (at.z - z) / tt, { color: gold && Math.random() < 0.3 ? GOLD : PAL.furia.dust[(Math.random() * 3) | 0], size: (0.034 + 0.02 * k) * (rate < 1 ? 0.8 : 1), size1: 0.01, life: tt, drag: 0 });
  }
}

// El golpe contra el piso: la columna de chispas que sube y el polvo que se
// abre (el anillo y el destello los pone el estallido de siempre, fx.nova).
// r0..r1: a qué distancia del que la desata (el muñeco de un compañero: pegado
// al cuerpo; el propio: más afuera, que no le pase por delante de la cara).
export function concBurst(g, p, fy, gold, r0 = 0.25, r1 = 0.75) {
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    g.fx.add.spawn(p.x + Math.cos(a) * r, fy + 0.1 + Math.random() * 0.4, p.z + Math.sin(a) * r, Math.cos(a) * 0.7, 3.5 + Math.random() * 5, Math.sin(a) * 0.7, { color: gold && i % 3 === 0 ? GOLD : PAL.furia.dust[i % 3], size: 0.05, size1: 0, life: 0.5 + Math.random() * 0.4, drag: 1.6 });
  }
}

// ---------------- los sonidos grabados ----------------
// Uno de los tres (fx/eclipseSfx: 'furia-activa', 'furia-cargada',
// 'furia-fin'), por el volumen de las armas. offset: desde qué segundo;
// fadeIn: cuánto tarda en entrar. Devuelve { src } (para cortarlo con
// stopSnd). Si todavía no bajó, se pide y suena cuando llega (si tarda menos
// de 1,5 s), adelantado lo que tardó: no se desfasa de la animación.
export function furiaSnd(g, id, { pos = null, gain = 1, reverb = 0.25, offset = 0, fadeIn = 0, ref = 6 } = {}) {
  const a = g.audio;
  const H = { src: null, dead: false };
  if (!a?.ctx) return H;
  const E = eclSfx(g);
  const start = (late) => {
    const buf = E.buf?.[id];
    if (!buf || H.dead || late > 1.5) return;
    const go = () => a.playBuffer(buf, { pos, gain, reverb, offset: Math.min(offset + late, Math.max(0, buf.duration - 0.2)), ref: pos ? ref : undefined });
    const src = a.guns?.withCat ? a.guns.withCat(go) : go();
    H.src = src;
    const fade = fadeIn - late;
    if (src?.out && fade > 0.02) {
      // ("arranca medio fuerte": entra de a poco, acumulando)
      const t = a.ctx.currentTime;
      const o = src.out.gain;
      o.setValueAtTime(0.0001, t);
      o.linearRampToValueAtTime(gain * 0.3, t + fade * 0.55);
      o.linearRampToValueAtTime(gain, t + fade);
    }
  };
  if (E.buf?.[id]) start(0);
  else {
    const t0 = a.ctx.currentTime;
    E.load([id]).then(() => start(a.ctx.currentTime - t0));
  }
  return H;
}

export function stopSnd(g, H, secs = 0.25) {
  const a = g.audio;
  if (!H) return;
  H.dead = true;
  const src = H.src;
  if (!src || !a?.ctx) return;
  try {
    const t = a.ctx.currentTime;
    src.out?.gain.cancelScheduledValues(t);
    src.out?.gain.setTargetAtTime(0, t, secs / 3);
    src.stop(t + secs + 0.05);
  } catch {
    /* ya paró */
  }
}
