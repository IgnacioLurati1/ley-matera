import * as THREE from 'three';
import { buildChiqui, chiquiEmber, chiquiAnchor, chiquiMeta, chiquiGiggle, chiquiGlitch } from '../../world/Chiqui';
import { warmObject } from '../../fx/ghostMat';
import { toWorld, toLocal, hLoc, yawOf, dirWorld, edgeU, WATER_Y, F } from '../../world/eclipse/sanlorenzoCampo';

// El Eclipse (la pelea de San Lorenzo, entities/eclipse/SanLorenzo.js): el
// Chiquitijuein con la aureola de Francisco tragada. El coloso de
// world/Chiqui.js (×78: la cabeza a 60 m) está SIEMPRE a la vista: desde la
// llegada mira desde el fondo del Paraná, hundido hasta el pecho, detrás de la
// escuadra; en la fase 2 cruza el río a zancadas hasta la barranca. Tiene el
// borde encendido (violeta y oro) para que se lea contra el cielo, la aureola
// rota de oro atrás de la cabeza y la corona de cuatro pedazos en el ala.
//  · La coraza: placas de vidrio negro con vetas violetas en el pecho y los dos
//    brazos. Cada amarra (un desgarro clavado en el campo con una cadena gruesa
//    hasta su placa) la sostiene: al cortar una, esa placa revienta y él se
//    tambalea. Sin coraza le entra todo.
//  · Lo que tira (lo decide el anfitrión; cada compu se cuida sola):
//    - las astillas: círculos que se marcan con un hilo de luz del cielo y les
//      cae encima una astilla de obsidiana que queda clavada un rato;
//    - el manotazo: la mano contra el borde (queda apoyada: ahí entra la
//      guadaña) y una onda baja que sale de ahí;
//    - la barrida: alza el brazo y barre: una ola de oscuridad sale del río y
//      cruza todo el campo (hay que saltarla);
//    - el rayo de los ojos: una línea roja en el pasto y después el rayo que
//      la recorre dejando fuego violeta;
//    - la invocación: alza la mano y los botes salen todos juntos.
//  · Se tambalea (golpes, amarras) y cae de rodillas (aturdido): ahí le duele más.
//  · La fase 4: la carga y el sol lo voltean de rodillas contra la barranca;
//    la corona queda a tiro del rayo de la Furia.
//  · El final: se raja y se deshunde; queda el duende, que se ríe y se va.
// Lo que se ve es igual en todas las compus; lo decide SanLorenzo (el anfitrión).

const SCALE = 78;
// dónde está: lejos (fases 0-1, hundido detrás de la escuadra), cerca (de la
// fase 2, al pie de la barranca), de rodillas (fase 4)
export const FAR = { u: 190, v: 30, sink: 21 };
export const NEAR = { u: 76, v: 0 };
// (de rodillas se va de boca contra la barranca: la cabeza y la corona quedan
// a pocos metros del borde, al alcance del rayo de la Furia)
export const KNEEL = { u: 70, v: 0, sink: 16, lean: 0.42 };
// (compatibilidad: lo de antes)
export const COL_U = NEAR.u;
export const COL_U_NEAR = 72;
// la altura de los pies (en el lecho del río)
const FOOT_Y = WATER_Y - 4.5;
// a qué velocidad cruza el río (m/s)
const WADE = 14.5;
// las amarras: dónde se clavan en el campo (u, v) y a qué placa van
export const AMARRAS = [
  [-6, 25],
  [13, -25],
  [22, 0.5],
];
// los manotazos: adónde puede pegar (al borde, cerca de la barranca)
export const SLAMS = [
  [36, -15],
  [37, 0],
  [36, 15],
];
const VIOLET = new THREE.Color(0x9a50ff);
// (la corona prendida, mucho menos brillante: ver update)
const DIM_CROWN = globalThis.__mduOldCrownGlow !== true;
// la aureola: cuánto más arriba y más atrás de la cabeza (ver onSkin)
const HALO_UP = +(globalThis.__mduHaloUp ?? 0.3);
const HALO_BACK = +(globalThis.__mduHaloBack ?? -0.46);
// (2026-10-09, el usuario, con otra foto: "la aureola sigue mal". Colgada
// atrás de la cabeza —un gigante de 78 m visto desde abajo—, el aro quedaba
// flotando arriba del sombrero. Ahora mira siempre a la cámara y va justo
// detrás de la cabeza en la línea de la vista: de donde se lo mire, la cabeza
// y la corona quedan adentro del aro. HALO9_UP: el centro, sobre el hueso;
// HALO9_BACK: cuánto detrás (medidas del modelo). __mduOldHalo9: fija, como antes)
const HALO9 = globalThis.__mduOldHalo9 !== true && globalThis.__mduOldHalo !== true;
const HALO9_UP = +(globalThis.__mduHalo9Up ?? 0.1);
const HALO9_BACK = +(globalThis.__mduHalo9Back ?? 0.3);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const L = {};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const fract = (x) => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
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
// La cadena de una amarra: eslabones de oscuridad con pulsos que suben hacia él.
const CHAIN_VERT = /* glsl */ `
varying vec2 vUv;
uniform float uLen;
void main() { vUv = vec2(uv.x, uv.y * uLen); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CHAIN_FRAG = /* glsl */ `
uniform float uTime, uK, uHit;
varying vec2 vUv;
void main() {
  // los eslabones: cada 2,4 m un anillo que brilla
  // (los eslabones: dos medias vueltas cruzadas cada 3 m; el borde fino brilla)
  float y = vUv.y / 3.0 + (fract(vUv.x * 2.0) > 0.5 ? 0.5 : 0.0);
  float link = abs(fract(y) - 0.5) * 2.0;
  float ring = smoothstep(0.86, 0.97, link);
  float p = fract(vUv.y / 26.0 - uTime * 0.8);
  float pulse = smoothstep(0.9, 1.0, p) * (1.0 - smoothstep(0.995, 1.0, p));
  float edge = pow(1.0 - abs(fract(vUv.x * 4.0) - 0.5) * 2.0, 3.0);
  vec3 col = vec3(0.035, 0.008, 0.07) + vec3(0.5, 0.16, 0.95) * (ring * 0.7 + edge * 0.12) + vec3(0.9, 0.65, 1.0) * pulse * 1.1 + vec3(1.0) * uHit * 0.6;
  gl_FragColor = vec4(col * uK, 1.0);
}`;
// La ola de la barrida: una pared baja de oscuridad con la cresta violeta.
const WAVE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAVE_FRAG = /* glsl */ `
uniform float uTime, uK;
varying vec2 vUv;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float n = vn(vec2(vUv.x * 60.0 - uTime * 3.0, vUv.y * 3.0 + uTime * 2.0));
  float top = 0.78 + 0.18 * n;
  if (vUv.y > top) discard;
  float crest = smoothstep(top - 0.22, top, vUv.y);
  vec3 col = mix(vec3(0.03, 0.0, 0.06), vec3(0.7, 0.35, 1.0), crest);
  float a = (0.82 + 0.18 * crest) * uK * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  gl_FragColor = vec4(col * (1.0 + crest * 1.5), a);
}`;
// El rayo de los ojos: el núcleo oscuro y el halo violeta (aditivo).
const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */ `
uniform float uTime, uK;
uniform vec3 uCol;
varying vec2 vUv;
void main() {
  float e = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float s = 0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 30.0);
  gl_FragColor = vec4(uCol * pow(e, 1.5) * s * uK, 1.0);
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
    this.C = { u: FAR.u, v: FAR.v, y: FOOT_Y - FAR.sink, rise: 0, uTo: FAR.u, vTo: FAR.v, yaw: yawOf(-1, 0), glow: 0, crack: 0, dis: 0, ember: null, sink: FAR.sink, sinkTo: FAR.sink, wade: false, stagger: 0, hurt: 0, eyes: 0, lean: 0, leanTo: 0 };
    R.root.rotation.order = 'YXZ';
    // la aureola rota y la corona (se cuelgan de la cabeza cuando llega el cuerpo)
    this.buildHalo();
    this.buildCrown();
    this.buildArmor();
    this.buildAmarras();
    this.buildAttacks();
    this.marks = [];
    this.markGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    this.fillGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a3aff).multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.darkMat = new THREE.MeshBasicMaterial({ color: 0x050208, transparent: true, opacity: 0, depthWrite: false });
    // (una marca de muestra: se compila con el mapa)
    const warm = new THREE.Group();
    warm.add(new THREE.Mesh(this.markGeo, this.markMat), new THREE.Mesh(this.fillGeo, this.darkMat));
    // (sin recorte: en los cuadros de la carga se dibujan aunque la cámara no los vea,
    // así se compilan también las variantes del G-buffer y de las sombras)
    for (const c of warm.children) c.frustumCulled = false;
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
    this.hand = { on: 0, at: new THREE.Vector3(), r: 4.2 };
    this.solids = [
      { bone: 'Spine01', r: 0.2, c: new THREE.Vector3() },
      { bone: 'Head', r: 0.17, c: new THREE.Vector3() },
    ];
  }

  // La aureola de cara a la cámara, detrás de la cabeza en la línea de la vista (HALO9).
  haloFace() {
    const H = this.halo;
    if (!HALO9 || !H?.anchor) return;
    const cam = this.g.camera;
    const A = H.anchor;
    A.updateWorldMatrix(true, false);
    const sc = A.getWorldScale(tmpU).x;
    tmpV.setFromMatrixPosition(A.matrixWorld);
    tmpW.subVectors(tmpV, cam.position).normalize();
    tmpV.addScaledVector(tmpW, HALO9_BACK * sc);
    H.g.position.copy(A.worldToLocal(tmpV));
    A.getWorldQuaternion(tmpQ).invert();
    H.g.quaternion.copy(tmpQ).multiply(cam.quaternion);
    H.g.rotateZ(Math.sin(this.t * 0.2) * 0.08);
  }

  // ---------------- el armado ----------------
  buildHalo() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc458).multiplyScalar(2.0), toneMapped: false });
    // cuatro tramos con huecos: la aureola de Francisco, rota
    const arcs = [
      [0.2, 1.1],
      [1.45, 0.75],
      [2.45, 1.3],
      [4.05, 1.6],
    ];
    for (const [a0, len] of arcs) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 5, 28, len), mat);
      m.rotation.z = a0;
      g.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), mat);
      const a = [1.32, 2.25, 3.82, 5.75, 1.38, 3.9][i];
      m.position.set(Math.cos(a) * (0.4 + (i % 2) * 0.05), Math.sin(a) * (0.4 + (i % 2) * 0.05), 0);
      m.userData.a = a;
      m.userData.k = i;
      g.add(m);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3, fog: false }));
    glow.scale.setScalar(0.62);
    glow.position.z = -0.03;
    g.add(glow);
    this.halo = { g, mat, glow };
  }

  buildCrown() {
    const g = new THREE.Group();
    const base = new THREE.MeshStandardMaterial({ color: 0xb08a2a, metalness: 0.9, roughness: 0.35, emissive: 0x4a2c00, emissiveIntensity: 0.4 });
    this.crown = [];
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
      const mid = new THREE.Object3D();
      mid.position.y = 0.08;
      piece.add(spike, side, gem, glow, mid);
      piece.userData.a = a;
      g.add(piece);
      this.crown.push({ piece, mid, mat, glow, a, hp: 1, lit: 0, broken: false, shake: 0, at: new THREE.Vector3() });
    });
    this.crownG = g;
  }

  // La coraza: tres juegos de placas de vidrio negro (el pecho y los dos brazos).
  // Se cuelgan de los huesos cuando llega el cuerpo (onSkin).
  buildArmor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x07040c, roughness: 0.1, metalness: 0.85, emissive: 0x3a0e70, emissiveIntensity: 0.35, flatShading: true });
    this.armorMat = mat;
    // (una placa: una losa de vidrio con punta, inclinada)
    const shard = (w, h, d) => {
      const g = new THREE.CylinderGeometry(0, 1, 1, 4, 1).translate(0, 0.5, 0);
      g.scale(w * 1.5, h * 2.2, d * 1.6);
      g.translate(0, -h * 0.9, 0);
      return g;
    };
    // (en medidas del bicho: mide 1)
    const SETS = [
      // el pecho: cuatro placas grandes adelante y dos en la espalda
      { bone: 'Spine01', parts: [[0, 0.04, 0.09, 0.07, 0.09, 0.03, 0.1], [-0.07, 0.0, 0.07, 0.05, 0.07, 0.025, -0.3], [0.07, 0.0, 0.07, 0.05, 0.07, 0.025, 0.3], [0, -0.07, 0.08, 0.06, 0.05, 0.025, 0], [0.04, 0.03, -0.08, 0.06, 0.08, 0.025, 0.2], [-0.04, 0.03, -0.08, 0.06, 0.08, 0.025, -0.2]] },
      { bone: 'LeftArm', parts: [[0.0, 0.02, 0.0, 0.06, 0.045, 0.06, 0], [0.08, 0.0, 0.0, 0.05, 0.035, 0.05, 0.4]] },
      { bone: 'RightArm', parts: [[0.0, 0.02, 0.0, 0.06, 0.045, 0.06, 0], [-0.08, 0.0, 0.0, 0.05, 0.035, 0.05, -0.4]] },
    ];
    this.armor = SETS.map((S, i) => {
      const g = new THREE.Group();
      for (const [x, y, z, w, h, d, rz] of S.parts) {
        const m = new THREE.Mesh(shard(w, h, d), mat);
        m.position.set(x, y, z);
        m.rotation.set(0.2 * (i - 1), 0.3 * x * 10, rz);
        m.castShadow = true;
        g.add(m);
      }
      return { i, bone: S.bone, g, on: true, k: 1, anchor: null };
    });
    // (la compatibilidad con lo de antes: SanLorenzo mira manto.want / manto.k)
    this.manto = { m: new THREE.Group(), want: 1, k: 1 };
  }

  buildAmarras() {
    // el desgarro clavado: dos tajos cruzados de luz violeta con el centro blanco (6 m)
    const tear = new THREE.BufferGeometry();
    const P = [];
    const C = [];
    const H = 6.2;
    const N = 10;
    for (let k = 0; k < N; k++) {
      const y0 = (k / N) * H;
      const y1 = ((k + 1) / N) * H;
      const w0 = Math.sin((k / N) * Math.PI) * 0.8 + 0.04;
      const w1 = Math.sin(((k + 1) / N) * Math.PI) * 0.8 + 0.04;
      const x0 = Math.sin(k * 2.3) * 0.3;
      const x1 = Math.sin((k + 1) * 2.3) * 0.3;
      P.push(x0 - w0, y0, 0, x1 - w1, y1, 0, x0, y0, 0, x0, y0, 0, x1 - w1, y1, 0, x1, y1, 0);
      P.push(x0, y0, 0, x1, y1, 0, x0 + w0, y0, 0, x0 + w0, y0, 0, x1, y1, 0, x1 + w1, y1, 0);
      const e = [0.26, 0.07, 0.55];
      const c = [0.85, 0.6, 1.0];
      C.push(...e, ...e, ...c, ...c, ...e, ...c);
      C.push(...c, ...c, ...e, ...e, ...c, ...e);
    }
    tear.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    tear.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const tearMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    // la grieta del piso alrededor del desgarro
    const crack = new THREE.RingGeometry(0.4, 3.4, 9, 1).rotateX(-Math.PI / 2);
    const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a20c0), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const chainGeo = new THREE.CylinderGeometry(0.55, 0.85, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.amarras = AMARRAS.map(([u, v], i) => {
      const g = new THREE.Group();
      const a = new THREE.Mesh(tear, tearMat);
      const b = new THREE.Mesh(tear, tearMat);
      b.rotation.y = Math.PI / 2;
      const cr = new THREE.Mesh(crack, crackMat);
      cr.position.y = 0.08;
      g.add(a, b, cr);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xa060ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      glow.scale.setScalar(4.0);
      glow.position.y = 3.0;
      g.add(glow);
      const at = toWorld(u, v);
      g.position.copy(at);
      g.visible = false;
      const cmat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: { value: 0 }, uHit: { value: 0 }, uLen: { value: 1 } }, vertexShader: CHAIN_VERT, fragmentShader: CHAIN_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const chain = new THREE.Mesh(chainGeo, cmat);
      chain.visible = false;
      chain.frustumCulled = false;
      this.root.add(g, chain);
      return { i, u, v, g, glow, chain, cmat, at, hp: 1, cut: false, k: 0, hit: 0, snap: 0, shoot: 0 };
    });
  }

  // Lo de los golpes: las astillas (un pool), la ola, el rayo, la línea del rayo.
  buildAttacks() {
    // las astillas de obsidiana
    const sg = new THREE.CylinderGeometry(0, 0.9, 6.5, 5, 1).translate(0, 3.25, 0);
    const sg2 = new THREE.CylinderGeometry(0.9, 0, 2.0, 5, 1).translate(0, -1.0, 0);
    const geo = new THREE.BufferGeometry();
    {
      const a = sg.toNonIndexed().attributes.position.array;
      const b = sg2.toNonIndexed().attributes.position.array;
      const all = new Float32Array(a.length + b.length);
      all.set(a);
      all.set(b, a.length);
      geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
      geo.computeVertexNormals();
      sg.dispose();
      sg2.dispose();
    }
    const smat = new THREE.MeshStandardMaterial({ color: 0x140a20, emissive: 0x6a28c0, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.6, flatShading: true });
    const NS = 28;
    const im = new THREE.InstancedMesh(geo, smat, NS);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // (una, lejos abajo, para compilar en la carga; en la arena, clearAttacks la saca)
    im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -400, 0));
    im.count = 1;
    im.frustumCulled = false;
    im.castShadow = true;
    im.name = 'slAstillas';
    this.root.add(im);
    this.shardMesh = im;
    this.shardList = [];
    // la ola (un sector de cilindro abierto, en el mundo; se escala con el radio)
    const wmat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: { value: 1 } }, vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.waveMat = wmat;
    this.waves = [];
    // (el sector de muestra, para compilar)
    const wg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true, 0, 1).translate(0, 0.5, 0);
    const wm = new THREE.Mesh(wg, wmat);
    wm.frustumCulled = false;
    wm.scale.setScalar(0.01);
    wm.position.y = -400;
    this.root.add(wm);
    // el rayo de los ojos: dos cilindros (núcleo oscuro, halo violeta) y su línea en el pasto
    const bg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const core = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x08020e, transparent: true, opacity: 0.92, depthWrite: false }));
    const halo = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: { value: 1 }, uCol: { value: new THREE.Color(0.75, 0.3, 1.0) } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    core.frustumCulled = halo.frustumCulled = false;
    core.renderOrder = 6;
    halo.renderOrder = 7;
    this.root.add(core, halo);
    core.visible = halo.visible = true;
    core.scale.setScalar(0.001);
    halo.scale.setScalar(0.001);
    this.beamM = { core, halo };
    const lg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    const line = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.15, 0.45).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    line.frustumCulled = false;
    line.renderOrder = 3;
    line.scale.set(0.001, 1, 0.001);
    this.root.add(line);
    this.beamLine = line;
    this.beam = null;
  }

  // El cuerpo de verdad: brasas violetas, el borde que brilla, la coraza, la aureola y la corona.
  onSkin() {
    const R = this.R;
    const S = R.skin;
    this.C.ember = chiquiEmber(R, 0x9a50ff);
    this.rimLook();
    const head = S.bind.Head ? new THREE.Vector3().setFromMatrixPosition(S.bind.Head) : new THREE.Vector3(0, 0.75, 0);
    // (2026-10-09, el usuario, con foto: "la aureola del Eclipse está mal". Iba
    // a la altura de la cara y apenas atrás: la parte de abajo cruzaba los
    // hombros y el ala del sombrero quedaba atrás del aro. Ahora detrás del
    // sombrero y más arriba, enmarcando la cabeza. globalThis.__mduOldHalo: como antes)
    const HO = globalThis.__mduOldHalo === true ? [0.1, -0.24] : HALO9 ? [HALO9_UP, 0] : [HALO_UP, HALO_BACK];
    const ha = chiquiAnchor(R, 'Head', [head.x, head.y + HO[0], head.z + HO[1]]);
    ha.add(this.halo.g);
    this.halo.anchor = ha;
    const ca = chiquiAnchor(R, 'Head', [head.x, head.y + 0.1, head.z]);
    ca.add(this.crownG);
    for (const P of this.crown) {
      P.piece.position.set(Math.sin(P.a) * 0.24, 0.02, Math.cos(P.a) * 0.24);
      P.piece.rotation.set(0.3 * Math.cos(P.a), 0, -0.3 * Math.sin(P.a));
    }
    // la coraza, en sus huesos (en el medio del hueso y su hijo)
    for (const A of this.armor) {
      const b = S.bind[A.bone];
      if (!b) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(b);
      const child = { LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', Spine01: 'Spine' }[A.bone];
      if (child && S.bind[child]) p.lerp(new THREE.Vector3().setFromMatrixPosition(S.bind[child]), A.bone === 'Spine01' ? 0.5 : 0.45);
      const an = chiquiAnchor(R, A.bone, [p.x, p.y, p.z]);
      an.add(A.g);
      A.anchor = an;
      A.g.visible = A.on;
    }
    this.measureSlam();
    warmObject(this.g, this.root);
  }

  // El borde del coloso (violeta y oro, fresnel) y menos niebla: que se lea
  // contra el cielo desde cualquier lado. Sobre el material de las brasas.
  rimLook() {
    const S = this.R.skin;
    const m = S.body.material;
    if (!m || globalThis.__mduNoSlRim === true) return;
    const U = { uRimK: { value: 1 }, uRimHit: { value: 0 }, uFogK: { value: 0.45 } };
    this.rimU = U;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRimK, uRimHit, uFogK;')
        .replace(
          '#include <fog_fragment>',
          `{
            vec3 vv = normalize(vViewPosition);
            float fr = pow(clamp(1.0 - abs(dot(normal, vv)), 0.0, 1.0), 3.6);
            vec3 rim = mix(vec3(0.5, 0.2, 1.0), vec3(1.0, 0.72, 0.3), smoothstep(0.7, 0.98, fr));
            gl_FragColor.rgb += rim * fr * (0.5 * uRimK + 2.0 * uRimHit);
          }
          #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
            gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * uFogK );
          #endif`,
        );
    };
    m.customProgramCacheKey = () => 'chiquiEmberSL';
    m.needsUpdate = true;
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
  // Al entrar: lejos, hundido detrás de la escuadra, con la coraza; ya se ve.
  reset() {
    const C = this.C;
    C.u = C.uTo = FAR.u;
    C.v = C.vTo = FAR.v;
    C.sink = C.sinkTo = FAR.sink;
    C.rise = 0;
    C.dis = 0;
    C.crack = 0;
    C.wade = false;
    C.stagger = 0;
    C.lean = C.leanTo = 0;
    C.yaw = this.faceYaw(FAR.u, FAR.v);
    this.R.root.visible = true;
    this.R.stop();
    this.R.mode = null;
    this.R.idle = 'idle';
    this.manto.want = this.manto.k = 1;
    for (const A of this.armor) {
      A.on = true;
      A.k = 1;
      A.g.visible = true;
      A.g.scale.setScalar(1);
    }
    for (const A of this.amarras) {
      A.hp = 1;
      A.cut = false;
      A.k = 0;
      A.shoot = 0;
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
    this.slamJob = null;
    this.gnome.t = -1;
    this.gnome.R.root.visible = false;
    for (const m of this.marks) m.g.removeFromParent();
    this.marks = [];
    this.clearAttacks();
  }

  // el giro para mirar al convento desde (u, v)
  faceYaw(u, v) {
    return yawOf(-48 - u, 0 - v * 0.6);
  }

  // Sale (fase 2): cruza el río a zancadas hasta la barranca, ruge y las cadenas
  // de la coraza se clavan en el campo. now: ya está ahí (el que entra tarde).
  rise(now = false) {
    const g = this.g;
    const C = this.C;
    this.R.root.visible = true;
    C.uTo = NEAR.u;
    C.vTo = NEAR.v;
    C.sinkTo = 0;
    this.manto.want = 1;
    if (now) {
      C.u = NEAR.u;
      C.v = NEAR.v;
      C.sink = 0;
      C.rise = 1;
      C.wade = false;
      C.yaw = this.faceYaw(C.u, C.v);
      this.chainsOut(true);
      return;
    }
    C.rise = 0.0001;
    C.wade = true;
    // (primero ruge en el lugar; después cruza)
    C.wadeT = -2.5;
    this.R.mode = 'walk';
    this.R.act('scream', { delay: 0 });
    g.audio?.bossArrive?.();
    chiquiGlitch(g.audio, 0.8);
    g.fx.addShake(0.6);
  }

  get up() {
    return this.C.rise > 0;
  }

  // Llegó a la barranca: ruge y le salen las cadenas de la coraza al campo.
  chainsOut(now = false) {
    const g = this.g;
    for (const A of this.amarras) {
      if (A.cut) continue;
      A.g.visible = true;
      A.chain.visible = true;
      A.shoot = now ? 1 : 0.0001;
      if (now) A.k = 1;
    }
    if (!now) {
      this.R.act('scream');
      g.fx.addShake(0.9);
      g.world.eclipse?.pulse?.(0.8);
      chiquiGlitch(g.audio, 1);
      g.audio?.chain?.(this.amarras[2].at);
    }
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
      g.fx.sparkle(tmpV.copy(A.at).setY(A.at.y + 2.6), [0.8, 0.5, 1], 16, 1.2);
      g.fx.addShake(0.08);
    }
    if (hp <= 0) {
      A.cut = true;
      A.snap = 1;
      g.fx.flash(tmpV.copy(A.at).setY(A.at.y + 2), 0xb070ff, 22, 0.6, 22);
      g.fx.explosion(tmpV.copy(A.at).setY(A.at.y + 1.5), 3.2, [0.6, 0.3, 1]);
      g.audio?.explosion?.(A.at, 0.6);
      chiquiGlitch(g.audio, 0.7);
      // su placa revienta y él se tambalea hacia el campo
      this.breakArmor(i);
      this.stagger(2.2, 'hit');
      this.C.u -= 2.5;
      this.manto.want = this.amarras.filter((x) => !x.cut).length / this.amarras.length;
    }
  }

  // Revienta un juego de placas: esquirlas de vidrio negro que caen al río.
  breakArmor(i) {
    const A = this.armor[i];
    if (!A || !A.on) return;
    const g = this.g;
    A.on = false;
    const at = A.g.getWorldPosition(tmpU);
    g.fx.explosion(at, 6, [0.45, 0.2, 0.9]);
    g.fx.flash(at, 0xb070ff, 40, 0.7, 70);
    g.fx.sparkle(at, [0.75, 0.45, 1], 60, 9);
    for (let k = 0; k < 40; k++) g.fx.alpha.spawn(at.x + (Math.random() - 0.5) * 6, at.y + (Math.random() - 0.5) * 6, at.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 18, Math.random() * 10, (Math.random() - 0.5) * 18, { color: [0.06, 0.02, 0.1], size: 0.9, size1: 0.4, life: 2.2, alpha: 0.95, gravity: 14, drag: 0.4 });
    g.audio?.explosion?.(at, 1);
    g.fx.addShake(0.5);
  }

  // Sin la coraza: ruge y se arrima a la barranca.
  unveil() {
    const g = this.g;
    this.manto.want = 0;
    for (let i = 0; i < 3; i++) this.breakArmor(i);
    this.C.uTo = COL_U_NEAR;
    const at = this.bodyAt(tmpV);
    g.fx.flash(at, 0xc080ff, 40, 0.8, 80);
    g.post?.flash?.(0.5);
    this.R.act('scream');
    chiquiGlitch(g.audio, 1);
    g.fx.addShake(0.8);
  }

  // Se tambalea (kind 'hit') o cae de rodillas aturdido (kind 'kneel') por dur s.
  stagger(dur = 2, kind = 'hit') {
    const C = this.C;
    C.stagger = Math.max(C.stagger, dur);
    if (kind === 'kneel') {
      this.R.act('kneel', { hold: true });
      this.kneelT = dur;
      C.sinkTo = Math.max(C.sinkTo, 5);
      C.leanTo = 0.18;
      this.g.fx.addShake(0.7);
      this.g.audio?.bossArrive?.();
    } else this.R.act('hit');
    if (this.rimU) this.rimU.uRimHit.value = 1;
  }

  get staggered() {
    return this.C.stagger > 0;
  }

  // Le entró un golpe al cuerpo (cada compu lo ve): el borde se prende.
  hurtFx(big = false) {
    if (this.rimU) this.rimU.uRimHit.value = Math.min(1, this.rimU.uRimHit.value + (big ? 0.6 : 0.25));
    this.C.hurt = 1;
    if (big && !this.R.one && this.t - (this.hitT || -9) > 3.5) {
      this.hitT = this.t;
      this.R.act('hit');
    }
  }

  // ---------------- los golpes ----------------
  // Las astillas: marca cada punto (x, z del mundo) y al rato la astilla cae del cielo.
  shadows(flat, delay = 1.9) {
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i];
      const z = flat[i + 1];
      toLocal(x, z, L);
      const y = hLoc(L.u, L.v);
      const at = new THREE.Vector3(x, y, z);
      this.mark(at, 2.8, delay, 'shard');
    }
    if (!this.R.one && !this.staggered) this.R.act('cast');
    this.g.audio?.chain?.(this.bodyAt(tmpV));
  }

  // Una marca en el piso (anillo que pulsa y se llena) que al terminar hace lo suyo.
  mark(at, r, dur, kind) {
    const grp = new THREE.Group();
    grp.position.set(at.x, at.y + 0.08, at.z);
    const ring = new THREE.Mesh(this.markGeo, this.markMat.clone());
    const fill = new THREE.Mesh(this.fillGeo, this.darkMat.clone());
    fill.scale.setScalar(0.01);
    grp.add(ring, fill);
    grp.scale.setScalar(r);
    this.root.add(grp);
    const M = { g: grp, ring, fill, t: 0, dur, at: at.clone(), r, kind };
    this.marks.push(M);
    return M;
  }

  // Un manotazo al punto (x, z): la marca, el clip y la mano apoyada.
  slam(x, z, delay = 2.0) {
    const C = this.C;
    toLocal(x, z, L);
    const y = hLoc(L.u, L.v);
    const at = new THREE.Vector3(x, y, z);
    const H = this.slamHand || new THREE.Vector3(0.1, 0.05, 0.38);
    const fwd = H.z * SCALE;
    const side = H.x * SCALE;
    C.uTo = Math.max(56, L.u + fwd);
    C.vTo = L.v + side;
    const key = chiquiMeta()?.clips?.slam?.key ?? 1.65;
    this.R.one = { name: 'slam', t: Math.max(0, key - delay), wait: Math.max(0, delay - key), rate: 1, hold: true, until: null };
    this.slamJob = { at, t: 0, delay, key, rest: 3.8, hit: false };
    this.mark(at, 6, delay, 'slam');
  }

  // La barrida: alza el brazo y una ola baja sale del río hacia el convento (hay
  // que saltarla). side: hacia qué lado tuerce el brazo (+1 / -1).
  sweep(side = 1, delay = 1.5) {
    const g = this.g;
    const key = chiquiMeta()?.clips?.throw?.key ?? 0.5;
    this.R.act('throw', { delay: Math.max(0, delay - key) });
    this.sweepJob = { t: 0, delay, side, done: false };
    // el aviso: la línea violeta al borde de la barranca, de punta a punta
    const c = toWorld(this.C.u, this.C.v, hLoc(30, 0));
    this.edgeGlow(c, Math.max(8, this.C.u - 46), delay);
    g.audio?.whoosh?.(this.bodyAt(tmpV));
  }

  // (la ola: un sector de cilindro que crece desde c)
  launchWave(c, r0, speed, rMax, h, span) {
    const toConv = dirWorld(-1, 0, tmpV);
    const th = Math.atan2(toConv.x, toConv.z);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true, th - span / 2, span).translate(0, 0.5, 0);
    // (u: a lo ancho, para el borde que se apaga en las puntas)
    const m = new THREE.Mesh(geo, this.waveMat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.position.copy(c);
    m.scale.set(r0, h, r0);
    this.root.add(m);
    this.waves.push({ m, geo, c: c.clone(), r: r0, speed, rMax, h, th, span, hit: false });
  }

  // La línea del aviso al borde: un sector de anillo chato que brilla y se apaga.
  edgeGlow(c, r, dur) {
    const span = 1.9;
    const toConv = dirWorld(-1, 0, tmpV);
    const th = Math.atan2(toConv.x, toConv.z);
    // (RingGeometry acostada: el ángulo θ del anillo queda en atan2(x, z) = θ + π/2)
    const geo = new THREE.RingGeometry(r - 0.8, r + 0.8, 64, 1, th - span / 2 - Math.PI / 2, span).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.markMat.clone());
    m.position.set(c.x, hLoc(40, 0) + 0.15, c.z);
    m.frustumCulled = false;
    this.root.add(m);
    this.marks.push({ g: m, ring: m, fill: null, t: 0, dur, at: c.clone(), r: 1, kind: 'edge' });
  }

  // El rayo de los ojos: la línea en el pasto (de a a b, mundo) y al rato el
  // rayo que la recorre.
  eyeBeam(ax, az, bx, bz, delay = 1.7, dur = 1.6) {
    const a = toWorld(...lc(ax, az));
    const b = toWorld(...lc(bx, bz));
    this.beam = { a, b, t: 0, delay, dur, trail: [], hitDone: false, lastFx: 0 };
    const len = a.distanceTo(b);
    const line = this.beamLine;
    line.position.copy(a).setY(a.y + 0.12);
    line.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    line.scale.set(len, 1, 0.5);
    this.C.eyes = 1;
    if (!this.R.one && !this.staggered) this.R.act('zap', { until: delay + dur });
  }

  // La invocación: alza la mano y los barcos se encienden (los botes los larga SanLorenzo).
  summon() {
    const g = this.g;
    if (!this.R.one || this.R.one.name !== 'kneel') this.R.act('cast');
    for (const [u, v] of F.ships) {
      const p = toWorld(u, v, WATER_Y + 8);
      g.fx.flash(p, 0xb060ff, 14, 0.8, 40);
      g.fx.sparkle(p, [0.75, 0.45, 1], 30, 6);
    }
    chiquiGlitch(g.audio, 0.6);
  }

  clearAttacks() {
    for (const W of this.waves || []) {
      W.m.removeFromParent();
      W.geo.dispose();
    }
    this.waves = [];
    this.shardList = [];
    if (this.shardMesh) this.shardMesh.count = 0;
    this.beam = null;
    this.sweepJob = null;
    if (this.beamLine) this.beamLine.material.opacity = 0;
    if (this.beamM) {
      this.beamM.core.scale.setScalar(0.001);
      this.beamM.halo.scale.setScalar(0.001);
    }
  }

  // La fase 4: la carga y el sol lo voltean: cae de rodillas contra la
  // barranca, mareado; la corona queda a tiro del rayo.
  kneel(now = false) {
    const C = this.C;
    C.uTo = KNEEL.u;
    C.vTo = KNEEL.v;
    C.sinkTo = KNEEL.sink;
    C.leanTo = KNEEL.lean;
    C.wade = false;
    this.R.mode = null;
    this.R.act('kneel', { hold: true, at: now ? 9 : 0 });
    this.R.idle = 'idle';
    this.kneelT = Infinity;
    this.manto.want = 0;
    if (now) {
      C.u = KNEEL.u;
      C.v = KNEEL.v;
      C.sink = KNEEL.sink;
      C.lean = KNEEL.lean;
    }
  }

  // Lo voltea la carga: los golpes de la caballería y el sol (todas las compus, en la fase 4).
  charged() {
    const g = this.g;
    this.R.act('scared');
    g.later(1.4, () => {
      this.R.act('hit');
      this.hurtFx(true);
      g.fx.addShake(1.0);
      g.later(1.0, () => this.kneel());
    });
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
    if (hp < P.hp) {
      P.shake = 1;
      if (this.rimU) this.rimU.uRimHit.value = Math.max(this.rimU.uRimHit.value, 0.3);
    }
    P.hp = hp;
    if (hp <= 0) {
      P.broken = true;
      P.piece.visible = false;
      g.fx.flash(P.at, 0xffd060, 30, 0.6, 60);
      g.fx.explosion(P.at, 4, [1, 0.8, 0.3]);
      g.fx.sparkle(P.at, [1, 0.85, 0.4], 50, 4);
      g.audio?.explosion?.(P.at, 0.8);
      g.post?.flash?.(0.3);
      this.R.act('hit');
      g.fx.addShake(0.5);
      this.C.crack = Math.min(1, this.C.crack + 0.25);
      g.later(1.4, () => this.C.dis === 0 && this.R.act('kneel', { hold: true, at: 9 }));
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
    this.clearAttacks();
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
  headAt(out) {
    const b = this.R.skin?.bones?.Head;
    if (b) return b.getWorldPosition(out);
    return out.copy(this.R.root.position).setY(this.R.root.position.y + 0.85 * SCALE);
  }
  eyesAt(out) {
    const b = this.R.skin?.front || this.R.skin?.bones?.headfront;
    if (b) return b.getWorldPosition(out);
    return this.headAt(out);
  }

  // Un tiro (rayo del mundo): ¿le pega al cuerpo, a la mano? { part, t } o null.
  shotHit(o, d, maxT) {
    if (!this.up || this.C.dis > 0) return null;
    let best = null;
    if (this.hand.on > 0.5) {
      const t = rayHit(o, d, maxT, this.hand.at, this.hand.r);
      if (t >= 0) best = { part: 'hand', t };
    }
    for (const S of this.solids) {
      const t = rayHit(o, d, maxT, S.c, S.r * SCALE);
      if (t >= 0 && (!best || t < best.t)) best = { part: S.bone === 'Head' ? 'head' : 'body', t };
    }
    return best;
  }

  // El rayo de la Furia (segmento de a hasta b): ¿qué toca? (la corona prendida, la mano, el cuerpo)
  // distancia de la recta a-b al pedazo P de la corona (los tiros, SanLorenzo.onShot)
  crownDist(P, a, b) {
    return segDist(P.at, a, b);
  }

  // (2026-10-07, el usuario: "le disparo a la corona del eclipse y no le bajo
  // vida": le tiraba al pedazo que no estaba prendido, y ese no sentía nada)
  // Cualquier pedazo sano que toque la recta a-b (el más cerca), o -1. El
  // prendido es el que se marca, no el único que se rompe.
  // globalThis.__mduOldCrownLit: solo el prendido, como antes.
  crownHit(a, b, r) {
    if (globalThis.__mduOldCrownLit === true) return -1;
    let best = -1;
    let bd = r;
    for (let i = 0; i < this.crown.length; i++) {
      const P = this.crown[i];
      if (P.broken) continue;
      const d = segDist(P.at, a, b);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  beamHit(a, b) {
    if (!this.up || this.C.dis > 0) return null;
    const P = this.crown[this.litI];
    if (P && !P.broken && segDist(P.at, a, b) < 3.4) return { part: 'crown', i: this.litI };
    const i = this.crownHit(a, b, 3.4);
    if (i >= 0) return { part: 'crown', i };
    if (this.hand.on > 0.5 && segDist(this.hand.at, a, b) < this.hand.r + 0.6) return { part: 'hand' };
    for (const S of this.solids) if (segDist(S.c, a, b) < S.r * SCALE) return { part: 'body' };
    return null;
  }

  // Un tajo de guadaña (desde o, hacia fwd, con su alcance): ¿una amarra o la mano?
  cutHit(o, fwd, range) {
    const res = [];
    for (const A of this.amarras) {
      if (A.cut || !A.g.visible || A.shoot < 1) continue;
      const dx = A.at.x - o.x;
      const dz = A.at.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > range + 1.6) continue;
      if (d > 1.2 && (dx * fwd.x + dz * fwd.z) / d < 0.15) continue;
      if (Math.abs(o.y - (A.at.y + 1.8)) > 4) continue;
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
    // cruza el río a zancadas (a velocidad fija) o se arrima a donde le toca
    const du = C.uTo - C.u;
    const dv = C.vTo - C.v;
    const d = Math.hypot(du, dv);
    if (C.wade && (C.wadeT = (C.wadeT || 0) + dt) < 0) {
      this.splash(dt, 0.6);
    } else if (C.wade) {
      const s = Math.min(d, WADE * dt);
      if (d > 1e-3) {
        C.u += (du / d) * s;
        C.v += (dv / d) * s;
        C.yaw = angLerp(C.yaw, yawOf(du, dv), Math.min(1, dt * 3));
      }
      // (el agua le llega más abajo a medida que sale)
      C.sink = Math.max(0, FAR.sink * (Math.min(1, d / 60) ** 0.8));
      C.rise = Math.max(0.0001, 1 - d / Math.hypot(FAR.u - NEAR.u, FAR.v - NEAR.v));
      this.splash(dt, 1);
      if (d < 0.6) {
        C.wade = false;
        C.rise = 1;
        R.mode = null;
        this.chainsOut();
      }
    } else {
      C.u += du * Math.min(1, dt * 0.9);
      C.v += dv * Math.min(1, dt * 0.9);
      C.sink += ((C.sinkTo || 0) - C.sink) * Math.min(1, dt * 0.6);
      if (d > 2) this.splash(dt, 0.4);
      // mira al convento (o a donde pega)
      C.yaw = angLerp(C.yaw, this.faceYaw(C.u, C.v), Math.min(1, dt * 0.8));
    }
    if (C.dis > 0) C.dis = Math.min(1, C.dis + dt / 3.2);
    C.stagger = Math.max(0, C.stagger - dt);
    if (this.kneelT != null && this.kneelT !== Infinity) {
      this.kneelT -= dt;
      if (this.kneelT <= 0) {
        this.kneelT = null;
        if (R.one?.name === 'kneel') R.stop();
        C.sinkTo = 0;
        C.leanTo = 0;
      }
    }
    C.y = FOOT_Y - C.sink;
    const at = toWorld(C.u, C.v, C.y - C.dis * 30, tmpV);
    R.root.position.copy(at);
    C.lean += ((C.leanTo || 0) - C.lean) * Math.min(1, dt * 0.7);
    // (la barrida: se tuerce hacia un lado, junta fuerza y barre al otro)
    let swing = 0;
    const SJ = this.sweepJob;
    if (SJ) {
      const w0 = Math.max(0.01, SJ.delay - 0.55);
      swing = SJ.t < w0 ? ease(SJ.t / w0) * 0.45 : 0.45 * Math.cos(Math.PI * clamp01((SJ.t - w0) / 0.9));
      swing *= SJ.side;
    }
    C.swing = (C.swing || 0) + (swing - (C.swing || 0)) * Math.min(1, dt * 8);
    R.root.rotation.set(C.lean * (1 - C.dis), C.yaw + C.swing, 0, 'YXZ');
    R.root.scale.setScalar(SCALE * (1 - 0.5 * ease(C.dis)));
    if (C.dis >= 1) R.root.visible = false;
    if (R.root.visible && C.dis === 0) this.track(dt);
    if (R.root.visible) R.update(dt, this.t);
    // las brasas, el borde y los ojos
    C.hurt = Math.max(0, C.hurt - dt * 3);
    if (C.ember) C.ember.value = 0.9 + 0.3 * Math.sin(this.t * 2.1) + C.crack * 1.5 + C.dis * 4 + C.hurt * 1.2;
    if (this.rimU) {
      this.rimU.uRimHit.value = Math.max(0, this.rimU.uRimHit.value - dt * 1.6);
      this.rimU.uRimK.value = 0.8 + 0.25 * Math.sin(this.t * 1.3) + (this.sl.dawn || 0) * 0.6;
    }
    C.eyes = Math.max(0, C.eyes - dt * 0.4);
    R.eyeK = 1 + C.eyes * 2;
    // la coraza: el vidrio negro late
    const M = this.manto;
    M.k += (M.want - M.k) * Math.min(1, dt * 1.2);
    this.armorMat.emissiveIntensity = 0.3 + 0.2 * Math.sin(this.t * 2.6);
    for (const A of this.armor) A.g.visible = A.on && R.root.visible;
    // la aureola: gira apenas y las astillas tiemblan
    const H = this.halo;
    H.g.rotation.z = Math.sin(this.t * 0.2) * 0.08;
    this.haloFace();
    for (const c of H.g.children) if (c.userData.k != null) c.position.z = Math.sin(this.t * 2 + c.userData.k) * 0.01;
    H.glow.material.opacity = (0.22 + 0.06 * Math.sin(this.t * 1.7)) * (1 - 0.5 * (this.sl.dawn || 0));
    // los cuerpos para los tiros
    if (R.skin && R.root.visible) {
      for (const S of this.solids) R.skin.bones[S.bone]?.getWorldPosition(S.c);
    } else for (const S of this.solids) S.c.set(1e5, -1e5, 1e5);
    // la corona
    for (const P of this.crown) {
      P.mid.getWorldPosition(P.at);
      P.shake = Math.max(0, P.shake - dt * 4);
      const lit = this.litI >= 0 && this.crown[this.litI] === P && !P.broken;
      P.lit = lit ? Math.min(1, P.lit + dt * 2) : Math.max(0, P.lit - dt * 2);
      if (DIM_CROWN) {
        // (2026-10-08, el usuario: "reducirle MUCHO el brillo a la corona que
        // brilla". El resplandor —un sprite aditivo a la escala del gigante,
        // ~27 m— con el bloom hacía una nube blanca que tapaba medio cielo.
        // Ahora el pedazo prendido es oro tibio que late, crece un poco y
        // larga alguna chispa: se sabe cuál es sin encandilar.
        // globalThis.__mduOldCrownGlow: como antes)
        P.mat.emissive.setRGB(0.3 + 0.7 * P.lit, 0.18 + 0.42 * P.lit, 0.02 + 0.08 * P.lit);
        P.mat.emissiveIntensity = (lit ? 0.3 : 0.15) + P.lit * (0.35 + 0.15 * Math.sin(this.t * 5)) + P.shake * 0.8;
        P.glow.material.opacity = P.lit * (0.1 + 0.04 * Math.sin(this.t * 5)) * (0.5 + 0.5 * P.hp);
        P.glow.scale.setScalar(0.2 + P.lit * 0.06);
      } else {
        P.mat.emissive.setRGB(0.3 + 1.6 * P.lit, 0.18 + 1.0 * P.lit, 0.02 + 0.3 * P.lit);
        P.mat.emissiveIntensity = (lit ? 0.5 : 0.15) + P.lit * (1.8 + 0.8 * Math.sin(this.t * 8)) + P.shake * 2;
        P.glow.material.opacity = P.lit * (0.8 + 0.2 * Math.sin(this.t * 6)) * (0.5 + 0.5 * P.hp);
        P.glow.scale.setScalar(0.38 + P.lit * (0.3 + 0.08 * Math.sin(this.t * 6)));
      }
      P.piece.scale.setScalar(1 + P.lit * (0.25 + 0.08 * Math.sin(this.t * 7)));
      P.piece.position.y = P.shake * 0.01 * Math.sin(this.t * 60);
      if (lit && this.t - (P.spT || 0) > (DIM_CROWN ? 0.4 : 0.12)) {
        P.spT = this.t;
        this.g.fx.sparkle(P.at, [1, 0.85, 0.4], DIM_CROWN ? 2 : 3, 3);
      }
    }
    this.updateAmarras(dt);
    this.updateMarks(dt);
    this.updateShards(dt);
    this.updateSweep(dt);
    this.updateWaves(dt);
    this.updateBeam(dt);
    this.updateSlam(dt);
    this.updateGnome(dt);
  }

  // La cabeza sigue al jugador (o al punto del rayo mientras tira): de a poco
  // y sin torcerse más de lo que da el cuello. __mduNoSlTrack: quieta.
  track(dt) {
    if (globalThis.__mduNoSlTrack === true || this.sl.ee.scene) return;
    const R = this.R;
    const head = R.head;
    if (!head) return;
    const B = this.beam;
    let to;
    if (B && B.t > 0.2 && B.t < B.delay + B.dur) to = tmpU.lerpVectors(B.a, B.b, ease(Math.max(0, (B.t - B.delay) / B.dur)));
    else {
      const P = this.g.player;
      to = tmpU.copy(P.pos).setY(P.pos.y + 1.6);
    }
    const q0 = (this.hq0 ||= new THREE.Quaternion()).copy(head.quaternion);
    head.lookAt(to);
    const qT = head.quaternion;
    // (como mucho 0,75 rad del frente)
    const a = 2 * Math.acos(Math.min(1, Math.abs(qT.w)));
    if (a > 0.75) qT.slerp(tmpQ.identity(), 1 - 0.75 / a);
    head.quaternion.copy(q0).slerp(qT.clone(), Math.min(1, dt * 1.5));
  }

  // El agua que levanta al moverse (k: cuánto).
  splash(dt, k) {
    const g = this.g;
    const C = this.C;
    if (C.dis > 0) return;
    const n = Math.floor(dt * 40 * k + Math.random());
    const p = this.R.root.position;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 9;
      g.fx.alpha.spawn(p.x + Math.cos(a) * r, WATER_Y + 0.3, p.z + Math.sin(a) * r, Math.cos(a) * 3, 6 + Math.random() * 9, Math.sin(a) * 3, { color: [0.7, 0.74, 0.8], size: 1.5, size1: 4.5, life: 1.6 + Math.random(), alpha: 0.5, gravity: 9, drag: 0.6 });
    }
  }

  updateAmarras(dt) {
    for (const A of this.amarras) {
      A.hit = Math.max(0, A.hit - dt * 3);
      // (a qué placa va: el pecho, el brazo izquierdo o el derecho)
      const ar = this.armor[A.i]?.anchor;
      const chest = ar && this.R.skin ? ar.getWorldPosition(tmpW) : this.bodyAt(tmpW);
      if (A.cut) {
        A.snap = Math.max(0, A.snap - dt * 0.9);
        A.chain.visible = A.snap > 0.01;
        A.g.visible = A.snap > 0.01;
        A.g.scale.setScalar(Math.max(0.01, A.snap));
        A.cmat.uniforms.uK.value = A.snap;
      } else if (A.g.visible) {
        A.k = Math.min(1, A.k + dt * 0.6);
        // (la cadena sale de él y se clava: 0,7 s)
        if (A.shoot > 0 && A.shoot < 1) {
          A.shoot = Math.min(1, A.shoot + dt / 0.7);
          if (A.shoot >= 1) {
            const g = this.g;
            g.fx.explosion(tmpV.copy(A.at).setY(A.at.y + 0.6), 3, [0.55, 0.25, 1]);
            g.fx.dirt(A.at, 30);
            g.fx.addShake(0.35);
            g.audio?.explosion?.(A.at, 0.6);
          }
        }
        A.g.rotation.y += dt * (0.4 + (1 - A.hp) * 2.5);
        A.g.scale.set(1 + A.hit * 0.25, (0.6 + 0.4 * A.hp) * (1 + 0.05 * Math.sin(this.t * 13)) * ease(A.shoot), 1 + A.hit * 0.25);
        A.glow.material.opacity = (0.35 + 0.15 * Math.sin(this.t * 3 + A.i)) * A.k + A.hit * 0.6;
        A.cmat.uniforms.uK.value = A.k;
        A.cmat.uniforms.uHit.value = A.hit;
      }
      if (A.chain.visible) {
        // del pecho (o el brazo) a la punta del desgarro; saliendo, la punta viaja
        const a = tmpV.copy(A.at).setY(A.at.y + 3.4);
        if (A.cut) a.lerp(chest, 1 - A.snap);
        else if (A.shoot < 1) a.lerpVectors(chest, a, ease(A.shoot));
        const len = a.distanceTo(chest);
        A.chain.position.copy(chest);
        A.chain.lookAt(a);
        // (la tensión: tiembla)
        const th = A.cut ? 0 : 0.06 * Math.sin(this.t * 30 + A.i) * (1 - A.hp);
        A.chain.scale.set(1 + A.hit * 0.5 + th, 1 + A.hit * 0.5 + th, Math.max(0.01, len));
        A.cmat.uniforms.uLen.value = len;
      }
    }
  }

  updateMarks(dt) {
    const pulse = 0.7 + Math.sin(this.t * 18) * 0.3;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const M = this.marks[i];
      M.t += dt;
      const k = Math.min(1, M.t / M.dur);
      M.ring.material.opacity = (0.35 + 0.6 * k) * pulse;
      if (M.fill) {
        M.fill.material.opacity = 0.55 * k;
        M.fill.scale.setScalar(Math.max(0.01, k));
      }
      // (las astillas: un hilo de luz del cielo sobre la marca)
      if (M.kind === 'shard' && M.t > 0.2 && Math.random() < 0.6) this.g.fx.beam(tmpV.copy(M.at).setY(M.at.y + 0.2), tmpU.copy(M.at).setY(M.at.y + 70), { color: 0xb070ff, width: 0.1 + 0.25 * k, life: 0.05 });
      if (M.t < M.dur) continue;
      M.g.removeFromParent();
      M.ring.material.dispose();
      M.fill?.material.dispose();
      if (M.kind === 'edge') M.g.geometry.dispose();
      this.marks.splice(i, 1);
      M.onEnd?.();
      if (M.kind === 'shard') this.dropShard(M.at, M.r);
    }
  }

  // Cae una astilla en at (en 0,35 s) y queda clavada ~7 s.
  dropShard(at, r) {
    if (this.shardList.length >= 28) this.shardList.shift();
    this.shardList.push({ at: at.clone(), r, t: 0, hit: false, tilt: (Math.random() - 0.5) * 0.5, tiltZ: (Math.random() - 0.5) * 0.5, ry: Math.random() * 6, s: 0.85 + Math.random() * 0.4 });
  }

  updateShards(dt) {
    const g = this.g;
    const im = this.shardMesh;
    let n = 0;
    for (let i = this.shardList.length - 1; i >= 0; i--) {
      const S = this.shardList[i];
      S.t += dt;
      if (S.t > 8) this.shardList.splice(i, 1);
    }
    for (const S of this.shardList) {
      const fallK = Math.min(1, S.t / 0.35);
      let y = S.at.y + 70 * (1 - fallK * fallK) - 1.6 * fallK;
      let sc = S.s;
      if (S.t > 7) sc *= 1 - ease((S.t - 7) / 1);
      if (fallK < 1) g.fx.add.spawn(S.at.x + (Math.random() - 0.5), y + 3, S.at.z + (Math.random() - 0.5), 0, 4, 0, { color: [0.6, 0.3, 1], size: 0.8, size1: 0.1, life: 0.5, alpha: 0.8 });
      if (fallK >= 1 && !S.hit) {
        S.hit = true;
        g.fx.explosion(tmpV.copy(S.at).setY(S.at.y + 0.5), S.r, [0.4, 0.15, 0.7]);
        g.fx.dirt(S.at, 24);
        g.fx.addShake(0.2);
        g.audio?.explosion?.(S.at, 0.5);
        this.sl.onShadowHit?.(S.at, S.r);
      }
      tmpQ.setFromEuler(tmpE.set(S.tilt * fallK, S.ry, S.tiltZ * fallK));
      tmpM.compose(tmpV.set(S.at.x, y, S.at.z), tmpQ, tmpS.setScalar(Math.max(0.001, sc)));
      im.setMatrixAt(n++, tmpM);
    }
    im.count = n;
    if (n) im.instanceMatrix.needsUpdate = true;
  }

  updateSweep(dt) {
    const J = this.sweepJob;
    if (!J) return;
    J.t += dt;
    if (!J.done && J.t >= J.delay) {
      J.done = true;
      const g = this.g;
      // sale del pie de la barranca (donde el brazo pega el agua), hacia el convento
      const c = toWorld(this.C.u, this.C.v, hLoc(20, 0) - 0.4);
      const r0 = Math.max(8, this.C.u - 47);
      this.launchWave(c, r0, 24, 175, 1.5, 1.9);
      g.fx.addShake(0.6);
      g.audio?.explosion?.(toWorld(46, this.C.v, hLoc(40, 0)), 1);
      for (let k = 0; k < 30; k++) {
        const p = toWorld(47, -40 + k * 2.8 + (Math.random() - 0.5) * 2);
        g.fx.alpha.spawn(p.x, p.y, p.z, 0, 4 + Math.random() * 4, 0, { color: [0.12, 0.05, 0.18], size: 1.2, size1: 3.2, life: 1.4, alpha: 0.6, gravity: 2, drag: 1 });
      }
    }
    if (J.t > J.delay + 0.6) this.sweepJob = null;
  }

  updateWaves(dt) {
    const g = this.g;
    const P = g.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const W = this.waves[i];
      W.r += W.speed * dt;
      W.m.scale.set(W.r, W.h, W.r);
      if (W.r > W.rMax) {
        W.m.removeFromParent();
        W.geo.dispose();
        this.waves.splice(i, 1);
        continue;
      }
      // el jugador de esta compu: si está en el piso cuando pasa, lo tumba
      if (!W.hit && !this.sl.ee.scene && P.canBeHit?.()) {
        const dx = P.pos.x - W.c.x;
        const dz = P.pos.z - W.c.z;
        const d = Math.hypot(dx, dz);
        let da = Math.atan2(dx, dz) - W.th;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < W.span / 2 && Math.abs(d - W.r) < 1.6) {
          W.hit = true;
          toLocal(P.pos.x, P.pos.z, L);
          const air = P.pos.y - hLoc(L.u, L.v);
          if (P.onGround !== false && air < 0.45) {
            P.damage(32, W.c);
            if (P.vel) {
              P.vel.x += (dx / d) * 7;
              P.vel.z += (dz / d) * 7;
              P.vel.y = Math.max(P.vel.y, 4);
            }
            g.fx.addShake(0.4);
          }
        }
      }
      // la cresta echa chispas y deja humo negro detrás (que se lea de lejos)
      const nn = W.span > 3 ? 3 : 7;
      for (let q = 0; q < nn; q++) {
        const a = W.th + (Math.random() - 0.5) * W.span;
        const x = W.c.x + Math.sin(a) * W.r;
        const z = W.c.z + Math.cos(a) * W.r;
        toLocal(x, z, L);
        if (L.u > edgeU(L.v) - 0.5) continue;
        const y = hLoc(L.u, L.v);
        g.fx.add.spawn(x, y + W.h * 0.8, z, Math.sin(a) * 3, 2.5, Math.cos(a) * 3, { color: [0.75, 0.4, 1], size: 0.7, size1: 0.1, life: 0.7, alpha: 1 });
        g.fx.alpha.spawn(x, y + 0.4, z, Math.sin(a) * 1.5, 1.2, Math.cos(a) * 1.5, { color: [0.06, 0.02, 0.1], size: 1.0, size1: 3.2, life: 1.2, alpha: 0.55, drag: 1.2, gravity: -0.2 });
      }
    }
  }

  updateBeam(dt) {
    const B = this.beam;
    const line = this.beamLine;
    const M = this.beamM;
    if (!B) {
      line.material.opacity = Math.max(0, line.material.opacity - dt * 2);
      return;
    }
    const g = this.g;
    B.t += dt;
    const pre = B.t < B.delay;
    line.material.opacity = pre ? (0.4 + 0.5 * Math.abs(Math.sin(this.t * 14))) * Math.min(1, B.t * 3) : Math.max(0, 0.6 - (B.t - B.delay) * 0.5);
    line.scale.z = pre ? 0.25 + 0.5 * (B.t / B.delay) : 0.6;
    const k = (B.t - B.delay) / B.dur;
    if (k < 0 || k > 1.15) {
      M.core.scale.setScalar(0.001);
      M.halo.scale.setScalar(0.001);
      if (k > 1.15) {
        // (el fuego del rastro se apaga solo)
        if (B.t > B.delay + B.dur + 4) this.beam = null;
      }
      this.trail(B, dt);
      return;
    }
    const kk = Math.min(1, k);
    const p = tmpV.lerpVectors(B.a, B.b, ease(kk));
    toLocal(p.x, p.z, L);
    p.y = hLoc(L.u, L.v);
    const e = this.eyesAt(tmpW);
    const len = e.distanceTo(p);
    for (const [m, w] of [
      [M.core, 0.55],
      [M.halo, 1.6],
    ]) {
      m.position.copy(e);
      m.lookAt(p);
      m.scale.set(w, w, len);
    }
    if (this.t - B.lastFx > 0.07) {
      B.lastFx = this.t;
      g.fx.explosion(tmpU.copy(p).setY(p.y + 0.4), 1.6, [0.55, 0.2, 1]);
      g.fx.dirt(p, 6);
      B.trail.push({ x: p.x, y: p.y, z: p.z, t: 0 });
      g.fx.addShake(0.06);
    }
    // el jugador de esta compu
    const P = g.player;
    if (!B.hitDone && !this.sl.ee.scene && P.canBeHit?.() && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 2.6 && Math.abs(P.pos.y - p.y) < 3) {
      B.hitDone = true;
      P.damage(30, p);
    }
    this.trail(B, dt);
  }

  // El rastro de fuego violeta del rayo: quema al que lo pisa.
  trail(B, dt) {
    const g = this.g;
    const P = g.player;
    let burn = false;
    for (const T of B.trail) {
      T.t += dt;
      if (T.t > 4) continue;
      if (Math.random() < dt * 6) g.fx.add.spawn(T.x + (Math.random() - 0.5) * 1.2, T.y + 0.2, T.z + (Math.random() - 0.5) * 1.2, 0, 2.2 + Math.random() * 2, 0, { color: [0.7, 0.3, 1], size: 0.7, size1: 0.1, life: 0.7, alpha: 0.9 });
      if (Math.hypot(P.pos.x - T.x, P.pos.z - T.z) < 1.4 && Math.abs(P.pos.y - T.y) < 2) burn = true;
    }
    this.burnT = Math.max(0, (this.burnT || 0) - dt);
    if (burn && this.burnT <= 0 && !this.sl.ee.scene && P.canBeHit?.()) {
      this.burnT = 0.5;
      P.damage(6, tmpV.set(P.pos.x, P.pos.y, P.pos.z));
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
      if (this.R.one?.name === 'slam') this.R.one.rate = 0;
      H.at.copy(J.at).setY(J.at.y + 1.6);
      H.on = 1;
      g.fx.explosion(tmpV.copy(J.at).setY(J.at.y + 0.5), 6, [0.5, 0.25, 0.8]);
      g.fx.dirt(J.at, 40);
      g.fx.addShake(0.8);
      g.audio?.explosion?.(J.at, 1);
      this.sl.onSlamHit?.(J.at, 6);
      // la onda baja que sale de la mano (se salta)
      this.launchWave(tmpV.copy(J.at).setY(J.at.y - 0.3), 6, 20, 34, 0.9, Math.PI * 2);
    }
    if (J.hit) {
      const hb = this.R.skin?.hand;
      if (hb) {
        hb.getWorldPosition(tmpV);
        if (tmpV.distanceTo(J.at) < 12) H.at.lerp(tmpV, 0.5);
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
      if (G.t < dt * 1.5) {
        g.fx.flash(tmpV.copy(G.from).setY(G.from.y + 1), 0xc080ff, 12, 0.5, 14);
        chiquiGiggle(g.audio, { pos: G.from, gain: 1.4, pitch: 1.1 });
        R.act('victory');
      }
    } else {
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
    this.clearAttacks();
    this.root.removeFromParent();
  }
}

// (u, v del campo a partir de x, z del mundo, para toWorld)
function lc(x, z) {
  toLocal(x, z, L);
  return [L.u, L.v];
}
function angLerp(a, b, k) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
}
