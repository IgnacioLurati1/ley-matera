import * as THREE from 'three';
import { buildChiqui, chiquiEmber, chiquiAnchor, chiquiMeta, chiquiGiggle, chiquiGlitch } from '../../world/Chiqui';
import { warmObject } from '../../fx/ghostMat';
import { toWorld, toLocal, hLoc, yawOf, dirWorld, edgeU, WATER_Y } from '../../world/eclipse/sanlorenzoCampo';

// El Eclipse (la pelea de San Lorenzo, entities/eclipse/SanLorenzo.js): el
// Chiquitijuein con la aureola de Francisco tragada. El coloso de
// world/Chiqui.js (escala grande) sale del Paraná con las grietas encendidas de
// violeta, la aureola rota de oro atrás de la cabeza y una corona de cuatro
// pedazos de oro en el sombrero.
//  · El manto: una sombra que lo envuelve mientras lo atan sus tres amarras
//    (desgarros clavados en el campo, cada uno con una cadena de oscuridad
//    hasta el pecho). Con el manto no le entra nada.
//  · Las sombras: círculos que se marcan en el piso y al rato les cae encima
//    una columna de oscuridad.
//  · El manotazo: avisa con un círculo al borde de la barranca, pega con la
//    mano y la deja apoyada un rato (ahí se le pega con la guadaña).
//  · La corona (fase 4): los cuatro pedazos se encienden de a uno; solo el
//    rayo de la Furia los rompe.
//  · El final: se raja y se deshunde; queda el duende, que se ríe y se va.
// Lo que se ve es igual en todas las compus; lo decide SanLorenzo (el anfitrión).

const SCALE = 54;
// dónde está parado (en el río) y adónde se acerca sin el manto
export const COL_U = 80;
export const COL_U_NEAR = 68;
// la altura de los pies (abajo del agua)
const FOOT_Y = WATER_Y - 3.5;
// lo que se hunde en la fase 4
const SINK = 14;
// las amarras: dónde se clavan en el campo (u, v)
export const AMARRAS = [
  [-6, 25],
  [13, -25],
  [31, 7],
];
// los manotazos: adónde puede pegar (al borde, cerca de la barranca)
export const SLAMS = [
  [36, -15],
  [37, 0],
  [36, 15],
];
const VIOLET = new THREE.Color(0x9a50ff);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const L = {};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
// rayo contra esfera: t o -1
export function rayHit(o, d, maxT, c, r) {
  tmpW.subVectors(c, o);
  const t = tmpW.dot(d);
  if (t < 0 || t > maxT + r) return -1;
  const d2 = tmpW.lengthSq() - t * t;
  return d2 <= r * r ? t : -1;
}
// distancia de un punto al segmento a-b
function segDist(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const L2 = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L2);
  const x = a.x + abx * t - p.x;
  const y = a.y + aby * t - p.y;
  const z = a.z + abz * t - p.z;
  return Math.sqrt(x * x + y * y + z * z);
}

// ---------------- los sombreadores ----------------
// El manto: humo negro que se arremolina, con el borde violeta.
const MANTO_VERT = /* glsl */ `
varying vec3 vP, vN, vV;
void main() {
  vP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const MANTO_FRAG = /* glsl */ `
uniform float uTime, uK;
varying vec3 vP, vN, vV;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
void main() {
  vec3 v = vV / max(length(vV), 1e-4);
  float fr = 1.0 - abs(dot(vN, v));
  vec3 q = vP * 5.0 + vec3(0.0, -uTime * 0.35, uTime * 0.12);
  float s = n3(q) * 0.6 + n3(q * 2.3 + 4.1) * 0.3 + n3(q * 5.1 - 1.7) * 0.1;
  float a = clamp((s - 0.28) * 1.7, 0.0, 1.0) * (0.55 + 0.45 * fr) * uK;
  vec3 col = mix(vec3(0.012, 0.004, 0.02), vec3(0.42, 0.14, 0.8), pow(clamp(fr, 0.0, 1.0), 3.0) * 0.8 + s * 0.08);
  gl_FragColor = vec4(col, a);
}`;
// La cadena de una amarra: oscuridad violeta con pulsos que suben hacia él.
const CHAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CHAIN_FRAG = /* glsl */ `
uniform float uTime, uK, uHit;
varying vec2 vUv;
void main() {
  float p = fract(vUv.y * 6.0 - uTime * 1.3);
  float pulse = smoothstep(0.75, 1.0, p) * (1.0 - smoothstep(0.98, 1.0, p));
  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
  vec3 col = vec3(0.26, 0.06, 0.5) * (0.3 + 0.5 * edge) + vec3(0.7, 0.45, 1.0) * pulse * 0.7 + vec3(1.0) * uHit * 0.5;
  gl_FragColor = vec4(col * uK * 0.7, 1.0);
}`;

export default class EclipseBoss {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'slEclipse';
    sl.actors.add(this.root);
    this.time = { value: 0 };
    this.t = 0;
    // el coloso
    const R = buildChiqui(g.textures);
    R.auto = false;
    R.idle = 'idle';
    R.root.scale.setScalar(SCALE);
    R.root.visible = false;
    this.root.add(R.root);
    this.R = R;
    this.C = { u: COL_U, v: 0, y: FOOT_Y - 48, rise: 0, uTo: COL_U, vTo: 0, yaw: yawOf(-1, 0), glow: 0, crack: 0, dis: 0, ember: null, sink: 0, sinkTo: 0 };
    // la aureola rota y la corona (se cuelgan de la cabeza cuando llega el cuerpo)
    this.buildHalo();
    this.buildCrown();
    this.buildManto();
    this.buildAmarras();
    this.marks = [];
    this.cols = [];
    this.markGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    this.fillGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a3aff).multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.darkMat = new THREE.MeshBasicMaterial({ color: 0x050208, transparent: true, opacity: 0, depthWrite: false });
    this.colGeo = new THREE.CylinderGeometry(1, 1.3, 1, 14, 1, true).translate(0, 0.5, 0);
    this.colMat = new THREE.MeshBasicMaterial({ color: 0x07020c, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
    // (una marca y una columna de muestra: se compilan con el mapa)
    const warm = new THREE.Group();
    warm.add(new THREE.Mesh(this.markGeo, this.markMat), new THREE.Mesh(this.fillGeo, this.darkMat), new THREE.Mesh(this.colGeo, this.colMat));
    // (a la vista pero lejos, abajo del piso: se compilan con lo demás y nunca se ven)
    warm.position.set(0, -400, 0);
    warm.scale.setScalar(0.01);
    this.root.add(warm);
    this.warm = warm;
    // el duende del final
    const gn = buildChiqui(g.textures);
    gn.root.scale.setScalar(1.3);
    gn.root.visible = false;
    gn.vary = true;
    this.root.add(gn.root);
    this.gnome = { R: gn, t: -1, path: null };
    R.onSkin(() => this.onSkin());
    // la mano apoyada (el blanco de la guadaña) y el cuerpo (para los tiros)
    this.hand = { on: 0, at: new THREE.Vector3(), r: 3.2 };
    this.solids = [
      { bone: 'Spine01', r: 0.2, c: new THREE.Vector3() },
      { bone: 'Head', r: 0.17, c: new THREE.Vector3() },
    ];
  }

  // ---------------- el armado ----------------
  buildHalo() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc458).multiplyScalar(2.2), toneMapped: false });
    // cuatro tramos con huecos: la aureola de Francisco, rota
    const arcs = [
      [0.2, 1.1],
      [1.45, 0.75],
      [2.45, 1.3],
      [4.05, 1.6],
    ];
    for (const [a0, len] of arcs) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.014, 5, 28, len), mat);
      m.rotation.z = a0;
      g.add(m);
    }
    // astillas sueltas del oro, flotando cerca de los huecos
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), mat);
      const a = [1.32, 2.25, 3.82, 5.75, 1.38, 3.9][i];
      m.position.set(Math.cos(a) * (0.4 + (i % 2) * 0.05), Math.sin(a) * (0.4 + (i % 2) * 0.05), 0);
      m.userData.a = a;
      m.userData.k = i;
      g.add(m);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
    glow.scale.setScalar(0.8);
    glow.position.z = -0.03;
    g.add(glow);
    this.halo = { g, mat, glow };
  }

  buildCrown() {
    const g = new THREE.Group();
    const base = new THREE.MeshStandardMaterial({ color: 0xb08a2a, metalness: 0.9, roughness: 0.35, emissive: 0x4a2c00, emissiveIntensity: 0.4 });
    this.crown = [];
    // cuatro pedazos al frente (los que se ven desde el campo), del más izquierdo al más derecho
    const ANG = [-0.95, -0.32, 0.32, 0.95];
    ANG.forEach((a, i) => {
      const piece = new THREE.Group();
      const mat = base.clone();
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 4), mat);
      spike.position.y = 0.085;
      const side = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 4), mat);
      side.position.set(0.035, 0.05, 0);
      side.rotation.z = -0.4;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a9a).multiplyScalar(1.5), toneMapped: false }));
      gem.position.set(0, 0.04, 0.03);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffd060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      glow.scale.setScalar(0.38);
      glow.position.y = 0.08;
      // (el medio del pedazo: a donde apunta el rayo)
      const mid = new THREE.Object3D();
      mid.position.y = 0.08;
      piece.add(spike, side, gem, glow, mid);
      piece.userData.a = a;
      g.add(piece);
      this.crown.push({ piece, mid, mat, glow, a, hp: 1, lit: 0, broken: false, shake: 0, at: new THREE.Vector3() });
    });
    this.crownG = g;
  }

  buildManto() {
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: { value: 0 } }, vertexShader: MANTO_VERT, fragmentShader: MANTO_FRAG, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
    // (en las medidas del bicho: lo envuelve entero, más alto que ancho)
    m.scale.set(0.42, 0.62, 0.36);
    m.position.y = 0.5;
    m.renderOrder = 3;
    this.R.root.add(m);
    this.manto = { m, mat, k: 0, want: 0 };
  }

  buildAmarras() {
    // el desgarro clavado: dos tajos cruzados de luz violeta con el centro blanco
    const tear = new THREE.BufferGeometry();
    const P = [];
    const C = [];
    const H = 3.4;
    const N = 9;
    for (let k = 0; k < N; k++) {
      const y0 = (k / N) * H;
      const y1 = ((k + 1) / N) * H;
      const w0 = Math.sin((k / N) * Math.PI) * 0.42 + 0.03;
      const w1 = Math.sin(((k + 1) / N) * Math.PI) * 0.42 + 0.03;
      const x0 = Math.sin(k * 2.3) * 0.16;
      const x1 = Math.sin((k + 1) * 2.3) * 0.16;
      // (el borde violeta y el medio blanco)
      P.push(x0 - w0, y0, 0, x1 - w1, y1, 0, x0, y0, 0, x0, y0, 0, x1 - w1, y1, 0, x1, y1, 0);
      P.push(x0, y0, 0, x1, y1, 0, x0 + w0, y0, 0, x0 + w0, y0, 0, x1, y1, 0, x1 + w1, y1, 0);
      const e = [0.26, 0.07, 0.55];
      const c = [0.75, 0.5, 1.0];
      C.push(...e, ...e, ...c, ...c, ...e, ...c);
      C.push(...c, ...c, ...e, ...e, ...c, ...e);
    }
    tear.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    tear.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const tearMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const chainGeo = new THREE.CylinderGeometry(0.1, 0.34, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.amarras = AMARRAS.map(([u, v], i) => {
      const g = new THREE.Group();
      const a = new THREE.Mesh(tear, tearMat);
      const b = new THREE.Mesh(tear, tearMat);
      b.rotation.y = Math.PI / 2;
      g.add(a, b);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xa060ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      glow.scale.setScalar(2.0);
      glow.position.y = 1.7;
      g.add(glow);
      const at = toWorld(u, v);
      g.position.copy(at);
      g.visible = false;
      const cmat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: { value: 0 }, uHit: { value: 0 } }, vertexShader: CHAIN_VERT, fragmentShader: CHAIN_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const chain = new THREE.Mesh(chainGeo, cmat);
      chain.visible = false;
      chain.frustumCulled = false;
      this.root.add(g, chain);
      return { i, u, v, g, glow, chain, cmat, at, hp: 1, cut: false, k: 0, hit: 0, snap: 0 };
    });
  }

  // El cuerpo de verdad: brasas violetas, la aureola y la corona en la cabeza.
  onSkin() {
    const R = this.R;
    const S = R.skin;
    this.C.ember = chiquiEmber(R, 0x9a50ff);
    const head = S.bind.Head ? new THREE.Vector3().setFromMatrixPosition(S.bind.Head) : new THREE.Vector3(0, 0.75, 0);
    // la aureola: atrás de la cabeza, de canto hacia adelante
    const ha = chiquiAnchor(R, 'Head', [head.x, head.y + 0.1, head.z - 0.24]);
    ha.add(this.halo.g);
    // la corona: cuatro pedazos parados sobre el ala del sombrero, adelante
    // (arriba de la copa no se veían desde el campo: los tapaba el ala)
    const ca = chiquiAnchor(R, 'Head', [head.x, head.y + 0.1, head.z]);
    ca.add(this.crownG);
    for (const P of this.crown) {
      P.piece.position.set(Math.sin(P.a) * 0.24, 0.02, Math.cos(P.a) * 0.24);
      P.piece.rotation.set(0.3 * Math.cos(P.a), 0, -0.3 * Math.sin(P.a));
    }
    // lo que pide la mano para el manotazo: dónde queda en el golpe (en el bicho)
    this.measureSlam();
    warmObject(this.g, this.root);
  }

  // Dónde queda la mano en el cuadro del golpe del manotazo, en las medidas del bicho.
  measureSlam() {
    const R = this.R;
    const S = R.skin;
    const key = chiquiMeta()?.clips?.slam?.key ?? 1.65;
    try {
      const vis = R.root.visible;
      R.root.visible = true;
      R.one = { name: 'slam', t: key, wait: 0, rate: 0, hold: true, until: null };
      R.update(0, 0);
      R.update(1 / 60, 0);
      R.root.updateMatrixWorld(true);
      const inv = tmpM.copy(R.root.matrixWorld).invert();
      this.slamHand = S.hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      R.one = null;
      R.root.visible = vis;
    } catch {
      this.slamHand = new THREE.Vector3(0.1, 0.05, 0.38);
    }
  }

  // ---------------- lo que manda SanLorenzo ----------------
  reset() {
    const C = this.C;
    C.u = C.uTo = COL_U;
    C.v = C.vTo = 0;
    C.rise = 0;
    C.y = FOOT_Y - 48;
    C.dis = 0;
    C.crack = 0;
    C.sink = C.sinkTo = 0;
    this.R.root.visible = false;
    this.R.stop();
    this.R.mode = null;
    this.manto.want = 0;
    this.manto.k = 0;
    for (const A of this.amarras) {
      A.hp = 1;
      A.cut = false;
      A.k = 0;
      A.g.visible = false;
      A.chain.visible = false;
    }
    for (const P of this.crown) {
      P.hp = 1;
      P.broken = false;
      P.lit = 0;
      P.piece.visible = true;
    }
    this.litI = -1;
    this.hand.on = 0;
    this.gnome.t = -1;
    this.gnome.R.root.visible = false;
    for (const m of this.marks) m.g.removeFromParent();
    this.marks = [];
    for (const c of this.cols) c.m.removeFromParent();
    this.cols = [];
  }

  // Sale del río (fase 2): con el manto y las amarras.
  rise(now = false) {
    const g = this.g;
    const C = this.C;
    this.R.root.visible = true;
    C.rise = now ? 1 : 0.0001;
    this.manto.want = 1;
    if (now) this.manto.k = 1;
    for (const A of this.amarras) {
      if (A.cut) continue;
      A.g.visible = true;
      A.chain.visible = true;
      if (now) A.k = 1;
    }
    if (!now) {
      this.R.act('scream', { delay: 2.2 });
      g.audio?.bossArrive?.();
      chiquiGlitch(g.audio, 0.8);
      g.fx.addShake(0.5);
    }
  }

  get up() {
    return this.C.rise > 0;
  }

  // Una amarra recibió un golpe (hp: lo que le queda, 0..1).
  setAmarra(i, hp) {
    const A = this.amarras[i];
    if (!A || A.cut) return;
    const g = this.g;
    const was = A.hp;
    A.hp = hp;
    if (hp < was) {
      A.hit = 1;
      g.fx.sparkle(tmpV.copy(A.at).setY(A.at.y + 1.6), [0.8, 0.5, 1], 14, 0.8);
      g.fx.addShake(0.08);
    }
    if (hp <= 0) {
      A.cut = true;
      A.snap = 1;
      g.fx.flash(tmpV.copy(A.at).setY(A.at.y + 1.5), 0xb070ff, 18, 0.5, 18);
      g.fx.explosion(tmpV.copy(A.at).setY(A.at.y + 1.2), 2.2, [0.6, 0.3, 1]);
      g.audio?.explosion?.(A.at, 0.5);
      chiquiGlitch(g.audio, 0.6);
      this.R.act('hit');
      this.manto.want = this.amarras.filter((x) => !x.cut).length / this.amarras.length;
    }
  }

  // Sin el manto: se lo saca de encima y se acerca a la barranca.
  unveil() {
    const g = this.g;
    this.manto.want = 0;
    this.C.uTo = COL_U_NEAR;
    const at = this.bodyAt(tmpV);
    g.fx.flash(at, 0xc080ff, 40, 0.8, 80);
    g.post?.flash?.(0.5);
    this.R.act('scream');
    chiquiGlitch(g.audio, 1);
    g.fx.addShake(0.6);
  }

  // Las sombras que caen: marca cada punto (x, z del mundo) y al rato la columna.
  shadows(flat, delay = 1.8) {
    const g = this.g;
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i];
      const z = flat[i + 1];
      toLocal(x, z, L);
      const y = hLoc(L.u, L.v);
      const grp = new THREE.Group();
      grp.position.set(x, y + 0.06, z);
      const ring = new THREE.Mesh(this.markGeo, this.markMat.clone());
      const fill = new THREE.Mesh(this.fillGeo, this.darkMat.clone());
      fill.scale.setScalar(0.01);
      grp.add(ring, fill);
      grp.scale.setScalar(2.6);
      this.root.add(grp);
      this.marks.push({ g: grp, ring, fill, t: 0, dur: delay, at: new THREE.Vector3(x, y, z), r: 2.6 });
    }
    if (!this.R.one) this.R.act('cast');
  }

  // Un manotazo al punto (x, z): la marca, el clip y la mano apoyada.
  slam(x, z, delay = 2.0) {
    const C = this.C;
    toLocal(x, z, L);
    const y = hLoc(L.u, L.v);
    const at = new THREE.Vector3(x, y, z);
    // (el cuerpo se corre en el río para que la mano llegue ahí)
    const H = this.slamHand || new THREE.Vector3(0.1, 0.05, 0.38);
    const fwd = H.z * SCALE;
    const side = H.x * SCALE;
    // mirando a -u: adelante es -u; el costado (x del bicho) es -v
    C.uTo = Math.max(52, L.u + fwd);
    C.vTo = L.v + side;
    const key = chiquiMeta()?.clips?.slam?.key ?? 1.65;
    this.R.one = { name: 'slam', t: Math.max(0, key - delay), wait: Math.max(0, delay - key), rate: 1, hold: true, until: null };
    this.slamJob = { at, t: 0, delay, key, rest: 3.8, hit: false };
    const grp = new THREE.Group();
    grp.position.set(x, y + 0.06, z);
    const ring = new THREE.Mesh(this.markGeo, this.markMat.clone());
    const fill = new THREE.Mesh(this.fillGeo, this.darkMat.clone());
    fill.scale.setScalar(0.01);
    grp.add(ring, fill);
    grp.scale.setScalar(5.5);
    this.root.add(grp);
    this.marks.push({ g: grp, ring, fill, t: 0, dur: delay, at, r: 5.5, slam: true });
  }

  // La fase 4: encandilado por el sol, se hunde hasta la cintura en el río,
  // pegado a la barranca, mareado: la corona queda a tiro del rayo.
  kneel() {
    this.C.uTo = 58;
    this.C.vTo = 0;
    this.C.sinkTo = 1;
    this.R.one = null;
    this.R.mode = chiquiMeta()?.clips?.dizzy ? 'dizzy' : null;
    this.manto.want = 0;
  }

  // Cuál pedazo de la corona está prendido (-1: ninguno).
  light(i) {
    this.litI = i;
    for (const P of this.crown) P.lit = 0;
    if (i >= 0 && this.crown[i]) {
      this.crown[i].lit = 0.001;
      this.g.audio?.chain?.(this.crown[i].at);
    }
  }

  setCrown(i, hp) {
    const P = this.crown[i];
    if (!P || P.broken) return;
    const g = this.g;
    if (hp < P.hp) P.shake = 1;
    P.hp = hp;
    if (hp <= 0) {
      P.broken = true;
      P.piece.visible = false;
      g.fx.flash(P.at, 0xffd060, 30, 0.6, 60);
      g.fx.explosion(P.at, 2.4, [1, 0.8, 0.3]);
      g.fx.sparkle(P.at, [1, 0.85, 0.4], 40, 2.5);
      g.audio?.explosion?.(P.at, 0.7);
      g.post?.flash?.(0.25);
      this.R.act('hit');
      this.C.crack = Math.min(1, this.C.crack + 0.25);
    }
  }

  // El final: se raja, se hunde y queda el duende en la barranca, que se ríe y se va.
  fall() {
    const g = this.g;
    this.C.dis = 0.0001;
    this.R.act('scream');
    g.post?.flash?.(1.2);
    chiquiGlitch(g.audio, 1);
    g.fx.addShake(0.9);
    const at = this.bodyAt(tmpV);
    g.fx.flash(at, 0xffffff, 60, 1.2, 120);
    const G = this.gnome;
    G.t = 0;
    const from = toWorld(edgeU(2) - 2.5, 2);
    G.R.root.position.copy(from);
    G.R.root.rotation.y = yawOf(-1, 0);
    G.from = from.clone();
  }

  // ---------------- dónde está cada cosa ----------------
  bodyAt(out) {
    const R = this.R;
    const b = R.skin?.bones?.Spine01;
    if (b) return b.getWorldPosition(out);
    return out.copy(R.root.position).setY(R.root.position.y + 0.5 * SCALE);
  }

  // Un tiro (rayo del mundo): ¿le pega al cuerpo, a la mano o a la corona?
  // Devuelve { part: 'body' | 'hand' | 'crown', i, t } o null.
  shotHit(o, d, maxT) {
    if (!this.up || this.C.dis > 0) return null;
    let best = null;
    if (this.hand.on > 0.5) {
      const t = rayHit(o, d, maxT, this.hand.at, this.hand.r);
      if (t >= 0) best = { part: 'hand', t };
    }
    for (const S of this.solids) {
      const t = rayHit(o, d, maxT, S.c, S.r * SCALE);
      if (t >= 0 && (!best || t < best.t)) best = { part: 'body', t };
    }
    return best;
  }

  // El rayo de la Furia (segmento de a hasta b): ¿qué toca? (la corona prendida, la mano, el cuerpo)
  beamHit(a, b) {
    if (!this.up || this.C.dis > 0) return null;
    const P = this.crown[this.litI];
    if (P && !P.broken && segDist(P.at, a, b) < 2.6) return { part: 'crown', i: this.litI };
    if (this.hand.on > 0.5 && segDist(this.hand.at, a, b) < this.hand.r + 0.6) return { part: 'hand' };
    for (const S of this.solids) if (segDist(S.c, a, b) < S.r * SCALE) return { part: 'body' };
    return null;
  }

  // Un tajo de guadaña (desde o, hacia fwd, con su alcance): ¿una amarra o la mano?
  cutHit(o, fwd, range) {
    const res = [];
    for (const A of this.amarras) {
      if (A.cut || !A.g.visible) continue;
      const dx = A.at.x - o.x;
      const dz = A.at.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > range + 1.1) continue;
      if (d > 1 && (dx * fwd.x + dz * fwd.z) / d < 0.15) continue;
      if (Math.abs(o.y - (A.at.y + 1.5)) > 3) continue;
      res.push({ part: 'amarra', i: A.i });
    }
    if (this.hand.on > 0.5) {
      const dx = this.hand.at.x - o.x;
      const dz = this.hand.at.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < range + this.hand.r && (d < 1.5 || (dx * fwd.x + dz * fwd.z) / d > 0.1)) res.push({ part: 'hand' });
    }
    return res;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.t += dt;
    this.time.value = this.t;
    const C = this.C;
    const R = this.R;
    // sale del agua (7 s), se acerca o se va a donde le toca (despacio: es enorme)
    if (C.rise > 0 && C.rise < 1) C.rise = Math.min(1, C.rise + dt / 7);
    const yUp = FOOT_Y;
    // (hundido hasta la cintura en la fase 4: SINK m)
    C.sink += ((C.sinkTo || 0) - C.sink) * Math.min(1, dt * 0.5);
    C.y = FOOT_Y - 48 + (yUp - (FOOT_Y - 48)) * ease(C.rise) - SINK * C.sink;
    C.u += (C.uTo - C.u) * Math.min(1, dt * 0.9);
    C.v += (C.vTo - C.v) * Math.min(1, dt * 0.9);
    if (C.dis > 0) C.dis = Math.min(1, C.dis + dt / 3.2);
    const at = toWorld(C.u, C.v, C.y - C.dis * 30, tmpV);
    R.root.position.copy(at);
    R.root.rotation.y = C.yaw;
    R.root.scale.setScalar(SCALE * (1 - 0.5 * ease(C.dis)));
    if (C.dis >= 1) R.root.visible = false;
    if (R.root.visible) R.update(dt, this.t);
    // las brasas: más con las grietas de la corona rota
    if (C.ember) C.ember.value = 0.9 + 0.3 * Math.sin(this.t * 2.1) + C.crack * 1.5 + C.dis * 4;
    // el manto
    const M = this.manto;
    M.k += (M.want - M.k) * Math.min(1, dt * 1.2);
    M.m.visible = M.k > 0.01 && R.root.visible;
    M.mat.uniforms.uK.value = M.k;
    // la aureola: gira apenas y las astillas tiemblan
    const H = this.halo;
    H.g.rotation.z = Math.sin(this.t * 0.2) * 0.08;
    for (const c of H.g.children) if (c.userData.k != null) c.position.z = Math.sin(this.t * 2 + c.userData.k) * 0.01;
    H.glow.material.opacity = (0.32 + 0.1 * Math.sin(this.t * 1.7)) * (1 - 0.5 * (this.sl.dawn || 0));
    // los cuerpos para los tiros
    if (R.skin && R.root.visible) {
      for (const S of this.solids) R.skin.bones[S.bone]?.getWorldPosition(S.c);
    } else for (const S of this.solids) S.c.set(1e5, -1e5, 1e5);
    // la corona: dónde está cada pedazo y cómo brilla
    for (const P of this.crown) {
      P.mid.getWorldPosition(P.at);
      P.shake = Math.max(0, P.shake - dt * 4);
      const lit = this.litI >= 0 && this.crown[this.litI] === P && !P.broken;
      P.lit = lit ? Math.min(1, P.lit + dt * 2) : Math.max(0, P.lit - dt * 2);
      P.mat.emissive.setRGB(0.3 + 1.6 * P.lit, 0.18 + 1.0 * P.lit, 0.02 + 0.3 * P.lit);
      P.mat.emissiveIntensity = (lit ? 0.5 : 0.15) + P.lit * (1.8 + 0.8 * Math.sin(this.t * 8)) + P.shake * 2;
      P.glow.material.opacity = P.lit * (0.8 + 0.2 * Math.sin(this.t * 6)) * (0.5 + 0.5 * P.hp);
      P.glow.scale.setScalar(0.38 + P.lit * (0.3 + 0.08 * Math.sin(this.t * 6)));
      P.piece.scale.setScalar(1 + P.lit * (0.18 + 0.06 * Math.sin(this.t * 7)));
      P.piece.position.y = P.shake * 0.01 * Math.sin(this.t * 60);
      // (chispas de oro del que hay que romper)
      if (lit && this.t - (P.spT || 0) > 0.12) {
        P.spT = this.t;
        this.g.fx.sparkle(P.at, [1, 0.85, 0.4], 2, 1.5);
      }
    }
    this.updateAmarras(dt);
    this.updateMarks(dt);
    this.updateSlam(dt);
    this.updateGnome(dt);
  }

  updateAmarras(dt) {
    const chest = this.bodyAt(tmpW);
    for (const A of this.amarras) {
      A.hit = Math.max(0, A.hit - dt * 3);
      if (A.cut) {
        // la cadena cortada se recoge hacia él y se apaga
        A.snap = Math.max(0, A.snap - dt * 0.9);
        A.chain.visible = A.snap > 0.01;
        A.g.visible = A.snap > 0.01;
        A.g.scale.setScalar(Math.max(0.01, A.snap));
        A.cmat.uniforms.uK.value = A.snap;
      } else if (A.g.visible) {
        A.k = Math.min(1, A.k + dt * 0.6);
        // el desgarro tiembla más cuanto más cortado
        A.g.rotation.y += dt * (0.4 + (1 - A.hp) * 2.5);
        A.g.scale.set(1 + A.hit * 0.25, (0.6 + 0.4 * A.hp) * (1 + 0.05 * Math.sin(this.t * 13)), 1);
        A.glow.material.opacity = (0.3 + 0.15 * Math.sin(this.t * 3 + A.i)) * A.k + A.hit * 0.6;
        A.cmat.uniforms.uK.value = A.k;
        A.cmat.uniforms.uHit.value = A.hit;
      }
      if (A.chain.visible) {
        // de la punta del desgarro al pecho (si se cortó, el cabo se va recogiendo)
        const a = tmpV.copy(A.at).setY(A.at.y + 2.4);
        if (A.cut) a.lerp(chest, 1 - A.snap);
        const len = a.distanceTo(chest);
        A.chain.position.copy(a);
        A.chain.lookAt(chest);
        A.chain.scale.set(1 + A.hit * 0.6, 1 + A.hit * 0.6, Math.max(0.01, len));
      }
    }
  }

  updateMarks(dt) {
    const g = this.g;
    const pulse = 0.7 + Math.sin(this.t * 18) * 0.3;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const M = this.marks[i];
      M.t += dt;
      const k = Math.min(1, M.t / M.dur);
      M.ring.material.opacity = (0.3 + 0.6 * k) * pulse;
      M.fill.material.opacity = 0.55 * k;
      M.fill.scale.setScalar(Math.max(0.01, k));
      if (M.t < M.dur) continue;
      M.g.removeFromParent();
      M.ring.material.dispose();
      M.fill.material.dispose();
      this.marks.splice(i, 1);
      if (M.slam) continue;
      // la columna de oscuridad cae
      const m = new THREE.Mesh(this.colGeo, this.colMat);
      m.position.copy(M.at);
      m.scale.set(M.r * 0.9, 60, M.r * 0.9);
      m.position.y = M.at.y + 40;
      this.root.add(m);
      this.cols.push({ m, t: 0, at: M.at, r: M.r, hit: false });
    }
    for (let i = this.cols.length - 1; i >= 0; i--) {
      const c = this.cols[i];
      c.t += dt;
      // baja en 0,25 s, golpea y se deshace
      const k = Math.min(1, c.t / 0.25);
      c.m.position.y = c.at.y + 40 * (1 - k * k);
      c.m.scale.y = 60 * (1 - 0.6 * clamp01((c.t - 0.25) / 0.6));
      c.m.material.opacity = 0.88;
      if (k >= 1 && !c.hit) {
        c.hit = true;
        g.fx.explosion(tmpV.copy(c.at).setY(c.at.y + 0.4), c.r, [0.35, 0.12, 0.6]);
        g.fx.addShake(0.15);
        g.audio?.explosion?.(c.at, 0.45);
        this.sl.onShadowHit?.(c.at, c.r);
      }
      if (c.t > 0.85) {
        c.m.removeFromParent();
        this.cols.splice(i, 1);
      }
    }
  }

  updateSlam(dt) {
    const J = this.slamJob;
    const H = this.hand;
    if (!J) {
      H.on = Math.max(0, H.on - dt * 3);
      return;
    }
    const g = this.g;
    J.t += dt;
    if (!J.hit && J.t >= J.delay) {
      J.hit = true;
      // el golpe: congela el clip en el cuadro de la mano en el piso
      if (this.R.one?.name === 'slam') this.R.one.rate = 0;
      H.at.copy(J.at).setY(J.at.y + 1.2);
      H.on = 1;
      g.fx.explosion(tmpV.copy(J.at).setY(J.at.y + 0.5), 4.5, [0.5, 0.25, 0.8]);
      g.fx.dirt(J.at, 30);
      g.fx.addShake(0.7);
      g.audio?.explosion?.(J.at, 1);
      this.sl.onSlamHit?.(J.at, 5.5);
    }
    if (J.hit) {
      // la mano de verdad, si está: el blanco la sigue
      const hb = this.R.skin?.hand;
      if (hb) {
        hb.getWorldPosition(tmpV);
        if (tmpV.distanceTo(J.at) < 9) H.at.lerp(tmpV, 0.5);
      }
      if (J.t >= J.delay + J.rest) {
        if (this.R.one?.name === 'slam') {
          this.R.one.rate = 1;
          this.R.one.hold = false;
        }
        this.slamJob = null;
        H.on = 0;
      }
    }
  }

  updateGnome(dt) {
    const G = this.gnome;
    if (G.t < 0) return;
    const g = this.g;
    const R = G.R;
    G.t += dt;
    R.root.visible = G.t < 6.2;
    if (!R.root.visible) return;
    if (G.t < 1.6) {
      // aparece en la barranca, mira a los jugadores y se ríe
      if (G.t < dt * 1.5) {
        g.fx.flash(tmpV.copy(G.from).setY(G.from.y + 1), 0xc080ff, 12, 0.5, 14);
        chiquiGiggle(g.audio, { pos: G.from, gain: 1.4, pitch: 1.1 });
        R.act('victory');
      }
    } else {
      // y se va corriendo por el borde
      const k = G.t - 1.6;
      const at = toWorld(edgeU(2 + k * 5.2) - 2.5, 2 + k * 5.2, null, tmpV);
      R.root.position.copy(at);
      R.root.rotation.y = yawOf(0.1, 1);
      if (G.t > 5.7 && !G.puff) {
        G.puff = true;
        g.fx.flash(tmpV.copy(at).setY(at.y + 0.8), 0xc080ff, 10, 0.4, 12);
        g.fx.sparkle(tmpV, [0.7, 0.4, 1], 30, 1.2);
        chiquiGiggle(g.audio, { pos: at, gain: 0.8, pitch: 1.25, echo: 0.7 });
      }
    }
    R.update(dt, this.t);
  }

  dispose() {
    this.root.removeFromParent();
  }
}
