import * as THREE from 'three';
import { MODE } from '../config/map';
import { weaponStats } from '../config/weapons';
import { VM, VM_POSE, registerMate } from './viewmodels';
import NovaFx, { galaxyTexture } from './novaFx';

// La Supernova Matera: la maravilla del Challenge de la torre (vive en el altar
// de la cima: entities/TowerChallenge.js). Un mate de vidrio negro con una
// estrellita adentro que titila, un astrolabio de anillos de oro que gira
// alrededor y una bombilla de oro con la punta de luz. Rompe el juego a
// propósito (así lo pidió el usuario: solo en el Challenge y arriba de todo).
//  · Clic izquierdo (automático): el rayo estelar. Atraviesa a todos los que
//    encuentra, revienta en una nova donde pega y salta en arcos a los de al lado.
//  · Recargar: la levanta al cielo, la estrella se apaga, se traga las
//    estrellas de alrededor (los anillos se abren y giran enloquecidos) y
//    vuelve a nacer de un estallido (reloadPose, reloadFx, reloadSound).
//  · Clic derecho: el Big Bang. La estrella crece en la mano un instante y
//    explota alrededor del que la tiene: una ola de luz que barre el piso (y un
//    poco los de arriba y abajo) y deshace a los muertos en polvo de estrellas a
//    medida que los alcanza; a los jefes les arranca un pedazo grande. Gasta
//    varias cargas y tiene un respiro.
// Con el Pack-a-Pava es el Big Bang Matero: magenta y oro, y todo más grande.
// Weapons (weapons/Weapons.js) le pasa cada tiro (fire), el clic derecho
// (input), cada cuadro (update) y el final (clear).
// En línea: el daño lo pone cada uno (los invitados se lo pasan al anfitrión
// como cualquier tiro) y los demás solo ven: un mensaje por tiro ('nova').
// Los golpes de luz reciclables (weapons/novaFx.js) y las olas se arman solo en
// el Challenge: en los otros mapas no hay Supernova y no se compila nada de más.

const PAL = [
  { a: 0x6a3cff, b: 0x22e6ff, star: 0xfff1c8, hot: 0x9a7aff, beams: [0x7a5cff, 0x33e8ff, 0xff5ad8, 0xfff0a0] },
  { a: 0xff2a78, b: 0xffc23a, star: 0xffffff, hot: 0xff5aa0, beams: [0xff3a8a, 0xffc84a, 0x5affd8, 0xa07aff] },
];
// ola del Big Bang: cuántas a la vez (dos jugadores tirando juntos, y alguno más)
const BANGS = 3;
// lo que dura la ola (s) y lo que se queda la luz después
const WAVE_FADE = 0.45;

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Color();
const hitTmp = {};
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const rnd = () => Math.random() - 0.5;
const ease = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
// pulso suave alrededor de c (ancho w a cada lado)
const bump = (k, c, w) => sstep(1 - Math.abs(k - c) / w);
// la recarga: sube, se traga las estrellas y se vuelve a encender en IGNITE
const RL_UP = 0.16;
const IGNITE = 0.72;
const RL_DOWN = 0.84;
// color de arcoíris (0..1) como [r, g, b] para las partículas
const rainbow = (h) => {
  tmpC.setHSL(((h % 1) + 1) % 1, 1, 0.62);
  return [tmpC.r, tmpC.g, tmpC.b];
};
// jefes y compañía: no se deshacen, se llevan un golpe grande
const tough = (z) => z.boss || z.pombero || z.crow || z.mandinga;

const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());
// el tiempo de todos los materiales que titilan (uno solo para todos)
const TIME = { value: 0 };

// ---------------- materiales ----------------
// El vidrio negro: una nebulosa que se mueve adentro, estrellitas que titilan y
// el borde encendido (del violeta al cian; en la mejorada, del magenta al oro).
// (sin normalizar vectores nulos: un NaN en la placa AMD apaga toda la pantalla)
const BODY_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vP = position;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const BODY_FS = `
uniform float uTime, uKick, uScale; uniform vec3 uA, uB;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z); }
void main(){
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  float fres = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
  fres = fres * fres;
  vec3 p = vP * uScale;
  float t = uTime * 0.25;
  float neb = vn(p + vec3(t, -t * 0.6, t * 0.3)) * 0.6 + vn(p * 2.1 - vec3(t * 1.3, 0.0, t)) * 0.4;
  neb = smoothstep(0.35, 0.95, neb);
  vec3 col = vec3(0.012, 0.01, 0.03);
  col += mix(uA, uB, clamp(vn(p * 0.7 + t), 0.0, 1.0)) * neb * 0.6;
  // estrellas: una celda de cada setenta tiene una que titila
  vec3 c = floor(vP * uScale * 7.0);
  float s = h3(c);
  float star = step(0.986, s) * (0.55 + 0.45 * sin(uTime * (3.0 + s * 9.0) + s * 40.0));
  col += vec3(1.0, 0.95, 0.85) * star * 1.8;
  col += mix(uB, uA, fres) * fres * (0.9 + uKick * 1.6);
  gl_FragColor = vec4(col, 1.0);
}`;

function bodyMat(up, scale = 60) {
  return once(`body${up}${scale}`, () => {
    const C = PAL[up];
    return new THREE.ShaderMaterial({
      uniforms: { uTime: TIME, uKick: { value: 0 }, uScale: { value: scale }, uA: { value: new THREE.Color(C.a) }, uB: { value: new THREE.Color(C.b) } },
      vertexShader: BODY_VS,
      fragmentShader: BODY_FS,
    });
  });
}

// Un destello de cuatro puntas (la estrella de la boca y la punta de la bombilla).
function flareTexture() {
  return once('flare', () => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'lighter';
    for (const [w, h, a] of [[S, 5, 0], [5, S, 0], [S * 0.62, 3, Math.PI / 4], [S * 0.62, 3, -Math.PI / 4]]) {
      x.save();
      x.translate(S / 2, S / 2);
      x.rotate(a);
      const lg = x.createLinearGradient(-w / 2, 0, w / 2, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = lg;
      x.fillRect(-w / 2, -h / 2, w, h);
      x.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

function novaMats(T, up) {
  return once(`mats${up}`, () => {
    const C = PAL[up];
    const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
    const sprite = (map, hex, k, o) => new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: o });
    return {
      body: bodyMat(up),
      void: new THREE.MeshBasicMaterial({ color: 0x030108 }),
      gold: new THREE.MeshStandardMaterial({ color: up ? 0xffd070 : 0xffc640, metalness: 1, roughness: 0.16, emissive: up ? 0x4a1a10 : 0x3a2400, emissiveIntensity: 0.7 }),
      glowA: glow(C.a, 2.2),
      glowB: glow(C.b, 2.2),
      core: glow(C.star, 3.2),
      pA: glow(0x3af0ff, 1.8),
      pB: glow(0xff5ad8, 1.8),
      pC: glow(0xffd060, 1.8),
      corona: sprite(T.dot, C.hot, 1.7, 0.85),
      flare: sprite(flareTexture(), C.star, 1.3, 0.9),
    };
  });
}

// ---------------- el modelo ----------------
// Las piezas del mate (sin la mano): el mismo para la vista y para el altar.
function novaParts(T, up) {
  const M = VM.mats(T);
  const P = novaMats(T, up);
  const prof = VM.PROFILES.calabaza;
  const top = VM.topOf(prof);
  const mate = new THREE.Group();
  const body = VM.lathe(prof, P.body, 32);
  // la pared de adentro (sin ella, al mirar la boca se ve el costado de atrás)
  body.add(VM.lathe([[top.r, top.y], [top.r - 0.0025, top.y], [top.r - 0.0025, top.y - 0.03]], P.body));
  mate.add(body);
  // adentro no hay yerba: hay vacío
  const inside = new THREE.Mesh(new THREE.CircleGeometry(top.r - 0.002, 24).rotateX(-Math.PI / 2), P.void);
  inside.position.y = top.y - 0.012;
  mate.add(inside);
  // la virola de oro con su corona de puntas
  const vir = VM.tor(top.r + 0.0012, 0.0032, P.gold, 8, 36);
  vir.rotation.x = Math.PI / 2;
  vir.position.y = top.y;
  mate.add(vir);
  const spike = new THREE.ConeGeometry(0.0032, 0.011, 6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(spike, P.gold);
    s.position.set(Math.cos(a) * (top.r + 0.001), top.y + 0.006, Math.sin(a) * (top.r + 0.001));
    s.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    mate.add(s);
  }
  // las bandas de filigrana y una hilera de gemas en la cintura
  for (const y of [0.03, 0.062]) {
    const t = VM.tor(VM.profileRadius(prof, y) + 0.0008, 0.0016, P.gold, 6, 40);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    mate.add(t);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = VM.profileRadius(prof, 0.046) + 0.0015;
    const gem = VM.sph(0.0028, i % 2 ? P.glowA : P.glowB, 8, 6);
    gem.position.set(Math.cos(a) * r, 0.046, Math.sin(a) * r);
    mate.add(gem);
  }
  // el astrolabio: tres anillos que giran alrededor, cada uno con su planeta
  const astro = new THREE.Group();
  astro.position.y = 0.05;
  mate.add(astro);
  const rings = [
    [0.071, 0.0017, P.gold, 0.35, 0, P.pA],
    [0.066, 0.0014, P.glowB, -0.55, 1.1, P.pB],
    [0.061, 0.0013, P.gold, 1.15, 2.2, P.pC],
  ].map(([r, th, mat, tilt, ph, pm]) => {
    const holder = new THREE.Group();
    holder.rotation.set(tilt, ph, 0);
    const ring = VM.tor(r, th, mat, 6, 64);
    ring.rotation.x = Math.PI / 2;
    holder.add(ring);
    const bead = VM.sph(0.0042, pm, 8, 6);
    bead.position.set(r, 0, 0);
    holder.add(bead);
    astro.add(holder);
    return holder;
  });
  // la estrella: flota en la boca, corrida para no chocar con la bombilla
  const star = new THREE.Group();
  star.position.set(-0.012, top.y + 0.013, -0.004);
  mate.add(star);
  const core = VM.sph(0.0105, P.core, 14, 10);
  star.add(core);
  const corona = new THREE.Sprite(P.corona);
  corona.scale.setScalar(0.06);
  star.add(corona);
  const flare = new THREE.Sprite(P.flare);
  flare.scale.setScalar(0.09);
  star.add(flare);
  const orbit = new THREE.Group();
  star.add(orbit);
  [P.pA, P.pB].forEach((m, i) => {
    const h = new THREE.Group();
    h.rotation.x = 0.4 + i * 1.1;
    const s = VM.sph(0.0024, m, 8, 6);
    s.position.set(0.019 + i * 0.006, 0, 0);
    h.add(s);
    orbit.add(h);
  });
  // la bombilla de oro, con anillos de luz que giran y la punta de cristal
  const b = VM.bombilla({ len: 0.23, mat: P.gold, thick: 1.15 }, M, top.y);
  b.group.position.x = 0.006;
  mate.add(b.group);
  const straw = b.straws[0];
  const spin = [];
  for (let i = 0; i < 3; i++) {
    const ring = VM.tor(0.013 - i * 0.0022, 0.0022, i % 2 ? P.glowA : P.glowB, 6, 24);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = b.len * (0.4 + i * 0.17);
    straw.add(ring);
    spin.push(ring);
  }
  const muzzle = b.tips[0];
  muzzle.add(VM.sph(0.0062, P.core, 10, 8));
  const tipGlow = new THREE.Sprite(P.corona);
  tipGlow.scale.setScalar(0.035);
  muzzle.add(tipGlow);
  // la mejorada: una galaxia que gira atrás de la estrella y una aureola de oro
  // que flota arriba de la boca
  let galaxy = null;
  let halo = null;
  if (up) {
    galaxy = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(), color: new THREE.Color(0xff6ab0).multiplyScalar(1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }));
    galaxy.scale.setScalar(0.15);
    star.add(galaxy);
    halo = new THREE.Group();
    halo.position.y = top.y + 0.045;
    const hr = VM.tor(0.034, 0.0022, P.glowB, 6, 40);
    hr.rotation.x = Math.PI / 2;
    halo.add(hr);
    const hr2 = VM.tor(0.029, 0.0012, P.gold, 6, 40);
    hr2.rotation.x = Math.PI / 2;
    halo.add(hr2);
    mate.add(halo);
  }
  return { mate, top, prof, muzzle, spin, bombGroup: b.group, nova: { star, core, corona, flare, orbit, rings, tipGlow, galaxy, halo, haloY: top.y + 0.045, P } };
}

function buildNova(up, T) {
  const M = VM.mats(T);
  const S = novaParts(T, up);
  const { mate, top, prof, muzzle } = S;
  mate.add(VM.cupHand(M, (y) => VM.profileRadius(prof, y), top.y));
  // la boca: ahí apunta el chorro del termo al cebar
  const mouth = new THREE.Object3D();
  mouth.position.set(0, top.y - 0.004, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(1.1 * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim: { spin: S.spin, glow: [], wobble: null }, upgraded: !!up, tip, mouth, mate, bombGroup: S.bombGroup, yerba: null, nova: S.nova };
}

registerMate('supernova', (up, T) => buildNova(up ? 1 : 0, T));

// La Supernova grande del altar (entities/TowerChallenge.js): el mismo mate sin
// la mano. Se anima con animateNova.
export function buildNovaDisplay(T, up = 0) {
  const S = novaParts(T, up);
  const g = new THREE.Group();
  g.add(S.mate);
  g.userData.nova = S.nova;
  g.userData.spin = S.spin;
  return g;
}

// Los anillos que giran, la estrella que late y los planetitas (vista y altar).
export function animateNova(N, spin, dt, t, k = 0) {
  N.rings[0].rotation.y += dt * (1.1 + k * 12);
  N.rings[1].rotation.z += dt * (0.8 + k * 9);
  N.rings[2].rotation.y -= dt * (1.4 + k * 14);
  N.orbit.rotation.y += dt * (3 + k * 10);
  if (spin) for (const s of spin) s.rotation.z += dt * (2 + k * 10);
  const pulse = 1 + Math.sin(t * 6) * 0.08 + k * 1.4;
  N.core.scale.setScalar(pulse);
  N.corona.scale.setScalar(0.06 * (pulse + k * 1.2));
  N.flare.scale.setScalar(0.09 * (1 + Math.sin(t * 2.3) * 0.12 + k * 1.8));
  N.flare.material.rotation = t * 0.35;
  N.tipGlow.scale.setScalar(0.035 * (1 + Math.sin(t * 9) * 0.15 + k * 2.6));
  if (N.galaxy) {
    N.galaxy.material.rotation -= dt * (1.6 + k * 8);
    N.galaxy.scale.setScalar(0.15 * (1 + Math.sin(t * 1.7) * 0.1 + k * 1.1));
  }
  if (N.halo) {
    N.halo.rotation.y += dt * (0.8 + k * 6);
    N.halo.rotation.x = Math.sin(t * 1.3) * 0.25;
    N.halo.position.y = N.haloY + Math.sin(t * 2.2) * 0.004;
  }
}

// ---------------- la ola del Big Bang ----------------
// Una pared de luz de arcoíris que se abre desde el que tira (se ve de adentro
// y de afuera), el anillo que corre por el piso y la cáscara de la esfera (la
// ven los demás desde afuera).
const BAND_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BAND_FS = `
uniform float uK, uTime; uniform vec3 uA, uB;
varying vec2 vUv;
void main(){
  float up = 1.0 - vUv.y;
  float stripes = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 24.0 + uTime * 9.0);
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vUv.x * 3.0 + uTime * 0.7));
  vec3 col = mix(uA, uB, vUv.y) * 1.4 + hue * 0.9;
  float a = up * up * stripes * (1.0 - uK) * 0.95;
  gl_FragColor = vec4(col, a);
}`;
const SHELL_VS = BODY_VS;
const SHELL_FS = `
uniform float uK, uTime; uniform vec3 uA, uB;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  float f = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
  float rim = f * f * f;
  float ang = atan(vP.z, vP.x + 1e-4);
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + ang * 0.159 + uTime * 0.8 + vP.y * 0.5));
  vec3 col = mix(uA, uB, rim) * (0.4 + rim * 2.0) + hue * rim * 1.2;
  float a = (0.06 + rim * 0.9) * (1.0 - uK);
  gl_FragColor = vec4(col, a);
}`;
const RING_FS = `
uniform float uK, uTime; uniform vec3 uA, uB;
varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5;
  float ang = atan(c.y, c.x + 1e-4);
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + ang * 0.318 - uTime * 0.9));
  vec3 col = mix(uA, uB, 0.5) * 0.8 + hue * 1.3;
  gl_FragColor = vec4(col, (1.0 - uK) * 0.9);
}`;

function bangSet(up) {
  const C = PAL[up];
  const uni = () => ({ uK: { value: 0 }, uTime: TIME, uA: { value: new THREE.Color(C.a) }, uB: { value: new THREE.Color(C.b) } });
  const add = (vs, fs, side = THREE.DoubleSide) => new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side, fog: false });
  const geo = once('bangGeo', () => ({
    band: new THREE.CylinderGeometry(1, 1, 3.3, 72, 1, true).translate(0, 1.65, 0),
    ring: new THREE.RingGeometry(0.86, 1, 96, 1).rotateX(-Math.PI / 2),
    shell: new THREE.SphereGeometry(1, 40, 22),
  }));
  const group = new THREE.Group();
  const band = new THREE.Mesh(geo.band, add(BAND_VS, BAND_FS));
  const ring = new THREE.Mesh(geo.ring, add(BAND_VS, RING_FS));
  ring.position.y = 0.06;
  const shell = new THREE.Mesh(geo.shell, add(SHELL_VS, SHELL_FS, THREE.FrontSide));
  shell.position.y = 1.2;
  for (const m of [band, ring, shell]) {
    m.frustumCulled = false;
    m.renderOrder = 7;
    m.userData.reflect = false;
    group.add(m);
  }
  return { group, band, ring, shell, up, t: 0, R: 1, busy: false };
}

// ---------------- en uso ----------------
export default class Supernova {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.cd = 0;
    this.charge = null;
    this.kick = 0;
    this.beamN = 0;
    this.chargeK = 0;
    // las olas del Big Bang: armadas de entrada en el grupo escondido de los
    // mates (la carga compila sus shaders: el primer Big Bang no traba)
    this.bangs = [];
    this.fx = null;
    if (MODE === 'challenge') {
      for (let i = 0; i < BANGS; i++) {
        for (const up of [0, 1]) {
          const b = bangSet(up);
          weapons.warm?.add(b.group);
          this.bangs.push(b);
        }
      }
      if (weapons.warm) this.fx = new NovaFx(weapons.warm, flareTexture(), weapons.T.dot, weapons.g.scene);
    }
    this.live = [];
    this.overlay = null;
    this.crackT = 0;
    // la recarga: si ya estalló, cuánto brilla el borde y adónde van las estrellas
    this.rl = { lit: false, glow: 0, id: 0, sink: new THREE.Vector3() };
  }

  get stats() {
    return this.w.stats?.kind === 'nova' ? this.w.stats : null;
  }

  // ---------------- el rayo estelar ----------------
  fire(st, origin, fwd, muzzle) {
    const g = this.g;
    const N = st.nova;
    const up = st.upgraded ? 1 : 0;
    const dir = new THREE.Vector3().copy(fwd);
    const range = st.range;
    const wallT = g.world.raycast(origin, dir, range, hitTmp);
    const maxT = Math.min(wallT, range);
    const hits = g.zombies.raycast(origin, dir, maxT);
    let first = null;
    let head = false;
    // atraviesa a todos
    for (const h of hits) {
      const point = new THREE.Vector3().copy(origin).addScaledVector(dir, h.t);
      g.zombies.damage(h.z, st.damage * (h.zone === 'head' ? st.headMult : 1), { type: 'bullet', zone: h.zone, arm: h.arm, point, dir: dir.clone(), elem: st.elem });
      if (!first) first = h;
      if (h.zone === 'head') head = true;
    }
    if (first) {
      g.hud.hitmarker(head);
      g.audio.hitmarker(head);
    }
    const hitWall = Number.isFinite(wallT) && wallT <= range;
    const endT = first ? first.t : maxT;
    const end = new THREE.Vector3().copy(origin).addScaledVector(dir, Math.min(endT, 90));
    // la nova: en el primero que toca, o en la pared (un poco afuera)
    const burst = !!first || hitWall;
    const chain = [];
    if (burst) {
      const at = end.clone();
      if (!first) at.addScaledVector(hitTmp.normal || dir.clone().negate(), 0.25);
      this.w.explode(at, N.radius, N.blast, { type: 'explosive', fx: false, elem: st.elem });
      // los arcos: a los más cercanos que quedaron en pie
      const near = g.zombies.inRadius(at, N.chainR).filter((e) => !e.z.dead && Math.abs((e.z.pos.y || 0) - at.y) < 3.5).sort((a, b) => a.d - b.d).slice(0, N.chain);
      for (const { z } of near) {
        const to = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.2 * (z.scale || 1), z.pos.z);
        g.zombies.damage(z, N.chainDmg, { type: 'bullet', zone: 'torso', point: to, dir: tmpV.subVectors(to, at).normalize().clone() });
        chain.push(to);
      }
      end.copy(at);
    }
    g.ee?.onShot?.(origin, dir, endT);
    this.shotFx(muzzle, end, up, chain, burst, false);
    g.net?.share('nova', { k: 's', a: r2(muzzle), b: r2(end), c: chain.map(r2), u: up, x: burst ? 1 : 0 });
    this.kick = 1;
    g.fx.addShake(up ? 0.09 : 0.06);
  }

  // Lo que se ve de un tiro (propio o de otro jugador).
  shotFx(a, b, up, chain, burst, ghost) {
    const g = this.g;
    const C = PAL[up];
    const col = C.beams[this.beamN++ % C.beams.length];
    const col2 = C.beams[(this.beamN + 1) % C.beams.length];
    // el rayo: un haz gordo de color, otro más fino del color que sigue y el
    // alma blanca (la mejorada, todavía más gordo)
    g.fx.beam(a, b, { color: col, width: up ? 0.46 : 0.32, life: 0.16 });
    g.fx.beam(a, b, { color: col2, width: up ? 0.22 : 0.15, life: 0.2 });
    g.fx.beam(a, b, { color: 0xffffff, width: up ? 0.11 : 0.08, life: 0.12 });
    // una doble espiral de chispas de colores alrededor del rayo
    const d = tmpA.subVectors(b, a);
    const len = d.length();
    if (len > 0.01) {
      d.divideScalar(len);
      const side = Math.abs(d.y) > 0.95 ? X_AXIS : Y_AXIS;
      const u = new THREE.Vector3().crossVectors(d, side).normalize();
      const v = new THREE.Vector3().crossVectors(d, u).normalize();
      const n = Math.min(up ? 46 : 36, 10 + Math.floor(len * 1.3));
      const ph = Math.random() * 6;
      const rad = up ? 0.2 : 0.15;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const ang = ph + k * len * 2.4 + (i % 2) * Math.PI;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const px = a.x + d.x * k * len + (u.x * ca + v.x * sa) * rad;
        const py = a.y + d.y * k * len + (u.y * ca + v.y * sa) * rad;
        const pz = a.z + d.z * k * len + (u.z * ca + v.z * sa) * rad;
        g.fx.add.spawn(px, py, pz, (u.x * ca + v.x * sa) * 1.2, (u.y * ca + v.y * sa) * 1.2 + 0.3, (u.z * ca + v.z * sa) * 1.2, { color: rainbow(k + ph + (i % 2) * 0.5), size: up ? 0.1 : 0.08, size1: 0, life: 0.35 + Math.random() * 0.25 });
      }
    }
    g.fx.flash(a, col, ghost ? 4 : 8, 0.07, 7);
    // la estrellita en la punta de la bombilla
    this.fx?.burst(a, up, up ? 0.3 : 0.22, true);
    if (burst) this.burstFx(b, up, col, ghost);
    for (const c of chain) {
      g.fx.lightning(b, c, col, 0.2);
      if (up) g.fx.lightning(b, c, col2, 0.14);
      this.fx?.burst(c, up, up ? 0.55 : 0.42, true);
    }
    this.sndShot(ghost ? a.clone() : null, up);
    // el trueno: un chasquido por tiro (cada tanto, para no taparlo todo)
    const now = g.time;
    if (now >= this.crackT) {
      this.crackT = now + (ghost ? 0.55 : 0.28);
      g.audio.thunderCrack?.(ghost ? b.clone() : null, { dur: up ? 0.95 : 0.7, gain: ghost ? 0.3 : up ? 0.55 : 0.42, big: !!up });
    }
  }

  // La nova donde pega: estrellitas para todos lados y un anillo de chispas.
  burstFx(at, up, col, ghost) {
    const g = this.g;
    g.fx.flash(at, col, up ? 26 : 20, 0.22, up ? 16 : 13);
    // la nova: estrella, halo, anillo de choque (y la galaxia, en la mejorada)
    this.fx?.burst(at, up, up ? 1.25 : 0.95);
    const n = up ? 44 : 32;
    for (let i = 0; i < n; i++) {
      tmpV.set(rnd(), rnd() + 0.25, rnd()).normalize().multiplyScalar(4 + Math.random() * 7);
      g.fx.add.spawn(at.x, at.y, at.z, tmpV.x, tmpV.y, tmpV.z, { color: rainbow(Math.random()), size: up ? 0.14 : 0.12, size1: 0, life: 0.5 + Math.random() * 0.4, drag: 2.2 });
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fx.add.spawn(at.x, at.y, at.z, Math.cos(a) * 9, 0.3, Math.sin(a) * 9, { color: [1, 0.95, 0.9], size: 0.09, size1: 0, life: 0.3, drag: 3 });
    }
    // la mejorada: esquirlas de luz que salen disparadas en rayitas
    if (up) {
      for (let i = 0; i < 7; i++) {
        tmpV.set(rnd(), rnd() * 0.8 + 0.2, rnd()).normalize().multiplyScalar(1.6 + Math.random() * 1.8);
        g.fx.beam(at, tmpB.copy(at).add(tmpV), { color: PAL[1].beams[i % 4], width: 0.07, life: 0.14 });
      }
    }
    const P = g.player;
    if (P?.pos) {
      const dd = P.pos.distanceTo(at);
      if (dd < 12) g.fx.addShake((up ? 0.2 : 0.15) * (1 - dd / 12));
    }
    this.sndBurst(at.clone(), up);
  }

  // ---------------- el Big Bang ----------------
  // (Weapons.handleInput) El clic derecho: devuelve true si lo tomó (mientras
  // carga no se tira el rayo).
  input(input, st, p) {
    const g = this.g;
    if (this.charge) return true;
    if (!input.mouse.rightPressed || this.w.state !== 'idle' || p.sprinting) return false;
    const s = this.w.slot;
    const B = st.bang;
    if (this.cd > 0) {
      g.audio.empty();
      return true;
    }
    if (s.mag < B.cost) {
      if (s.reserve > 0) this.w.startReload(st);
      else g.audio.empty();
      return true;
    }
    s.mag -= B.cost;
    this.w.updateHud();
    this.charge = { t: 0, dur: B.charge, st, cost: B.cost, snd: this.sndCharge(B.charge) };
    return true;
  }

  cancelCharge(refund = true) {
    const c = this.charge;
    if (!c) return;
    this.charge = null;
    c.snd?.stop();
    const s = this.w.slots?.find((x) => x.id === 'supernova');
    if (refund && s) {
      s.mag += c.cost;
      this.w.updateHud();
    }
  }

  // Explota alrededor del que la tiene.
  detonate(st) {
    const g = this.g;
    const p = g.player;
    const B = st.bang;
    const up = st.upgraded ? 1 : 0;
    const c = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
    this.cd = B.cd;
    this.kick = 1.5;
    this.bigBang(c, up, false);
    g.net?.share('nova', { k: 'bb', p: r2(c), u: up });
    // la ola los alcanza de a poco: el más lejos, al final
    const list = g.zombies.inRadius(c, B.radius).filter((e) => Math.abs((e.z.pos.y || 0) + 1 - c.y) < B.dy);
    // (el Cuervo vuela aparte: si pasa cerca, también se la lleva)
    const cz = g.crow?.z;
    if (cz?.active && !cz.dead && cz.pos.distanceTo(c) < B.radius + 2) list.push({ z: cz, d: cz.pos.distanceTo(c) });
    let n = 0;
    for (const { z, d } of list) {
      const delay = Math.min(1, d / B.radius) * B.wave;
      g.later(delay, () => {
        if (!z.active || z.dead) return;
        const dir = new THREE.Vector3(z.pos.x - c.x, 0.4, z.pos.z - c.z).normalize();
        const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z);
        if (tough(z)) {
          g.zombies.damage(z, B.boss, { type: 'explosive', dir, point });
          g.fx.flash(point, PAL[up].hot, 10, 0.2, 8);
        } else {
          this.vaporFx(z.pos, z.scale || 1, up, n++ < 10);
          g.zombies.damage(z, 1e9, { type: 'yerba', dir, point });
        }
      });
    }
    // el golpe te levanta un poquito del piso
    if (p.onGround && !p.downed) {
      p.vel.y = Math.max(p.vel.y, 4.2);
      p.onGround = false;
    }
  }

  // Lo que se ve de un Big Bang (propio o de otro): la ola, los rayos que
  // salen para todos lados, las estrellas y el fogonazo.
  bigBang(c, up, ghost) {
    const g = this.g;
    const B = weaponStats('supernova', up).bang;
    const R = B.radius;
    const C = PAL[up];
    const set = this.bangs.find((b) => !b.busy && b.up === up) || this.bangs.find((b) => b.up === up);
    if (set) {
      set.busy = true;
      set.t = 0;
      set.R = R;
      set.wave = B.wave;
      const fy = g.world.floorAt(c.x, c.z, c.y);
      set.group.position.set(c.x, fy, c.z);
      set.group.scale.setScalar(0.01);
      g.scene.add(set.group);
      if (!this.live.includes(set)) this.live.push(set);
    }
    g.fx.flash(c, C.hot, 60, 0.7, R * 2.2);
    this.fx?.burst(c, up, up ? 3.4 : 2.8);
    // rayos que bajan del cielo sobre el que la tiró
    for (let i = 0; i < 5; i++) {
      const top = new THREE.Vector3(c.x + rnd() * 10, c.y + 12 + Math.random() * 6, c.z + rnd() * 10);
      g.fx.lightning(top, new THREE.Vector3(c.x + rnd() * 3, c.y - 0.6, c.z + rnd() * 3), C.beams[(i + 1) % C.beams.length], 0.45);
    }
    // los rayos: salen para todos lados hasta la pared
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const dir = tmpV.set(Math.cos(a), (Math.random() - 0.35) * 0.35, Math.sin(a)).normalize();
      const t = Math.min(R * (0.6 + Math.random() * 0.4), g.world.raycast(c, dir, R, hitTmp));
      const end = new THREE.Vector3().copy(c).addScaledVector(dir, t);
      g.fx.lightning(c, end, C.beams[i % C.beams.length], 0.3);
    }
    // estrellas que salen volando en anillo y en esfera
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2;
      const flat = i < 90;
      tmpV.set(Math.cos(a), flat ? (Math.random() - 0.3) * 0.25 : rnd() * 2, Math.sin(a)).normalize().multiplyScalar((flat ? 14 : 7) + Math.random() * 10);
      g.fx.add.spawn(c.x, c.y - 0.4 + Math.random() * 0.6, c.z, tmpV.x, tmpV.y, tmpV.z, { color: rainbow(a / 6.283 + Math.random() * 0.2), size: 0.14, size1: 0.01, life: 0.6 + Math.random() * 0.5, drag: 1.6 });
    }
    // brillitos que quedan flotando y caen despacio
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * R * 0.8;
      g.fx.add.spawn(c.x + Math.cos(a) * r, c.y + 0.5 + Math.random() * 2, c.z + Math.sin(a) * r, rnd() * 0.3, 0.2 + Math.random() * 0.3, rnd() * 0.3, { color: rainbow(Math.random()), size: 0.07, size1: 0, life: 1.4 + Math.random() * 1.2, gravity: 0.4 });
    }
    // de lejos se ve igual, pero sin encandilar tanto
    const d = g.player?.pos ? g.player.pos.distanceTo(c) : 0;
    const k = ghost ? Math.max(0, 1 - d / (R * 2)) : 1;
    g.fx.addShake(0.35 + 0.65 * k);
    this.whiteout(0.85 * k, up);
    if (ghost) {
      // los muertos que alcanza la ola de otro también se ven deshacer (el daño lo pone él)
      const list = g.zombies.inRadius(c, R).filter((e) => !tough(e.z) && Math.abs((e.z.pos.y || 0) + 1 - c.y) < B.dy);
      list.slice(0, 16).forEach(({ z, d: zd }, i) => g.later(Math.min(1, zd / R) * B.wave, () => z.active && this.vaporFx(z.pos, z.scale || 1, up, i < 6)));
    }
    this.sndBang(ghost ? c.clone() : null, up);
    g.audio.thunder?.(ghost ? c.clone() : null, true);
  }

  // Un muerto que se hace polvo de estrellas: una columna de luz que sube.
  vaporFx(pos, k, up, light) {
    const g = this.g;
    const y0 = pos.y || 0;
    for (let i = 0; i < 18; i++) {
      const h = Math.random() * 1.8 * k;
      g.fx.add.spawn(pos.x + rnd() * 0.5, y0 + h, pos.z + rnd() * 0.5, rnd() * 0.6, 1.2 + Math.random() * 2.2, rnd() * 0.6, { color: rainbow(Math.random() * 0.3 + (up ? 0.85 : 0.6)), size: 0.09, size1: 0, life: 0.7 + Math.random() * 0.6, drag: 0.8 });
    }
    if (light) g.fx.flash(tmpV.set(pos.x, y0 + 1, pos.z), PAL[up].b, 6, 0.25, 6);
  }

  // Fogonazo en pantalla (el que tira lo recibe entero; los demás, según lo cerca).
  whiteout(k, up) {
    if (k <= 0.02) return;
    const el = this.overlayEl();
    if (!el) return;
    this.flashK = Math.max(this.flashK || 0, k);
    el.style.setProperty('--nova-a', up ? 'rgba(255, 190, 120, 0.7)' : 'rgba(180, 150, 255, 0.7)');
  }

  overlayEl() {
    if (this.overlay?.isConnected) return this.overlay;
    const root = this.g.root;
    if (!root) return null;
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% 55%, rgba(255,255,255,0.96), var(--nova-a, rgba(180,150,255,0.7)) 38%, rgba(40,10,80,0) 78%)';
    root.appendChild(el);
    this.overlay = el;
    return el;
  }

  // ---------------- la recarga ----------------
  // (Weapons.updatePose) Cómo se mueve el mate en la mano: [x, y, z, rx, ry, rz, bajar].
  // La levanta al medio mostrando la boca, tiembla de energía mientras traga,
  // el estallido la empuja para atrás y vuelve a la cadera.
  reloadPose(k, t) {
    const up = sstep(k / RL_UP) * (1 - sstep((k - RL_DOWN) / (1 - RL_DOWN)));
    const charge = clamp01((k - RL_UP) / (IGNITE - RL_UP));
    const hum = up * charge * charge * (k < IGNITE ? 1 : 0);
    const boom = bump(k, IGNITE + 0.03, 0.06);
    const sway = Math.sin(k * Math.PI * 2.5) * up;
    return [
      -0.13 * up + Math.sin(t * 57) * 0.004 * hum,
      0.085 * up + Math.sin(t * 43 + 1) * 0.004 * hum + charge * up * 0.02 - boom * 0.015,
      0.045 * up - boom * 0.07,
      0.55 * up - boom * 0.35 + Math.sin(t * 71) * 0.02 * hum,
      0.18 * up + sway * 0.12,
      -0.22 * up + sway * 0.06 + boom * 0.1,
      0,
    ];
  }

  // El sonido: el chupón que apaga la estrella, un zumbido que sube lleno de
  // campanitas y el estallido (con trueno) cuando se vuelve a encender.
  reloadSound(dur) {
    const g = this.g;
    const A = g.audio;
    const id = ++this.rl.id;
    this.rl.lit = false;
    if (!A?.ctx) return null;
    const up = this.stats?.upgraded ? 1 : 0;
    const o = A.out({ gain: 0.8, reverb: 0.4 });
    const t0 = A.now;
    const tc = t0 + dur * RL_UP;
    const ti = t0 + dur * IGNITE;
    A.noise(o, { dur: dur * RL_UP + 0.1, type: 'bandpass', freq: 3200, freqEnd: 260, q: 1.6, gain: 0.35, attack: 0.02 });
    A.tone(o, { dur: dur * RL_UP + 0.1, freq: 520, freqEnd: 90, gain: 0.12 });
    A.tone(o, { t: tc, dur: ti - tc, type: 'sawtooth', freq: 55, freqEnd: 330, gain: 0.05, attack: 0.1 });
    A.tone(o, { t: tc, dur: ti - tc, freq: 110, freqEnd: 880, gain: 0.08, attack: 0.1 });
    A.tone(o, { t: tc, dur: ti - tc, freq: 113, freqEnd: 893, gain: 0.05, attack: 0.15 });
    A.noise(o, { t: tc, dur: ti - tc, type: 'bandpass', freq: 500, freqEnd: 5200, q: 1.1, gain: 0.25, attack: (ti - tc) * 0.85 });
    const bells = up ? [1568, 1760, 2093, 2349, 2637, 3136] : [2093, 2349, 2637, 3136, 3520];
    for (let s2 = tc; s2 < ti - 0.04; s2 += 0.05 + Math.random() * 0.04) A.tone(o, { t: s2, dur: 0.22, freq: bells[Math.floor(Math.random() * bells.length)] * (1 + (s2 - tc) / (ti - tc) * 0.5), gain: 0.018, attack: 0.003 });
    // el estallido
    A.tone(o, { t: ti, dur: 1.1, freq: 110, freqEnd: 30, gain: 0.55, attack: 0.003 });
    A.noise(o, { t: ti, dur: 0.9, freq: 3000, freqEnd: 200, gain: 0.6, brown: true, attack: 0.003 });
    const chord = up ? [392, 523, 659, 784, 1046] : [440, 554, 659, 880, 1109];
    chord.forEach((f, i) => A.tone(o, { t: ti + 0.04 + i * 0.03, dur: 1.4, freq: f, gain: 0.035, attack: 0.02 }));
    g.later(dur * IGNITE, () => {
      if (this.rl.id === id && this.w.state === 'reload') A.thunderCrack?.(null, { dur: 0.9, gain: 0.5, big: !!up });
    });
    return {
      stop: () => {
        this.rl.id++;
        try {
          o.gain.cancelScheduledValues(A.now);
          o.gain.setTargetAtTime(0, A.now, 0.03);
        } catch {
          /* ya terminó */
        }
      },
    };
  }

  // Lo que se ve de la recarga (cada cuadro, con el mate en la mano): la
  // estrella se apaga, los anillos se abren y giran, las estrellas de
  // alrededor se meten en la boca y al final, el estallido.
  reloadFx(N, k, dt, up) {
    const g = this.g;
    const R = this.rl;
    const charge = clamp01((k - RL_UP) / (IGNITE - RL_UP));
    const open = sstep(k / RL_UP) * (1 - sstep((k - 0.8) / 0.2));
    // los anillos del astrolabio: se abren alrededor y giran cada vez más rápido
    const spin = k < IGNITE ? 0.6 + charge * 3.2 : 2.5 * (1 - sstep((k - IGNITE) / 0.25));
    animateNova(N, null, dt, g.time, spin);
    // (la punta y la galaxia no crecen tanto: taparían toda la pantalla)
    N.tipGlow.scale.setScalar(0.035 * (1 + charge * 1.2));
    if (N.galaxy) N.galaxy.scale.setScalar(0.15 * (1 + charge * 0.5));
    N.rings.forEach((r, i) => r.scale.setScalar(1 + open * (1.1 + i * 0.35) + bump(k, IGNITE + 0.02, 0.05) * 0.8));
    // la estrella: se apaga, titila mientras traga y nace de nuevo, enorme
    let core;
    if (k < IGNITE) core = 1 - sstep(k / 0.12) * 0.88 + (Math.random() < 0.3 ? 0.12 : 0) * charge;
    else core = 1 + (1 - sstep((k - IGNITE) / 0.2)) * 3.2;
    N.core.scale.setScalar(Math.max(0.05, core));
    N.corona.scale.setScalar(0.06 * Math.max(0.2, core * 1.2));
    N.flare.scale.setScalar(0.09 * Math.max(0.2, core * (k < IGNITE ? 0.6 : 1.6)));
    N.P.body.uniforms.uKick.value = charge * 1.4 + (k >= IGNITE ? (1 - sstep((k - IGNITE) / 0.25)) * 2.5 : 0);
    R.glow = k < IGNITE ? charge : Math.max(0, 1 - (k - IGNITE) / 0.2);
    // las estrellas que se traga (en el mundo, hacia la punta del mate)
    const at = this.w.model?.muzzle ? this.w.muzzleWorld(R.sink) : null;
    if (at && k > RL_UP * 0.6 && k < IGNITE) {
      // (salen de adelante de la cámara: pegadas a la cara se verían como manchones)
      const fwd = g.camera.getWorldDirection(tmpA);
      const n = 3 + Math.floor(charge * 6);
      for (let i = 0; i < n; i++) {
        tmpV.set(rnd(), rnd() * 0.8, rnd()).normalize().multiplyScalar(1.2 + Math.random() * 1.6).addScaledVector(fwd, 3);
        g.fx.add.spawn(at.x + tmpV.x, at.y + tmpV.y, at.z + tmpV.z, tmpV.y * 2, -tmpV.x * 2, tmpV.z, { color: rainbow(Math.random()), size: 0.025 + charge * 0.02, size1: 0.008, life: 0.9, attract: R.sink });
      }
      g.fx.addShake(dt * charge * 0.5);
    }
    // el estallido: una vez por recarga
    if (k >= IGNITE && !R.lit) {
      R.lit = true;
      this.kick = 1.8;
      this.whiteout(0.5, up);
      g.fx.addShake(0.45);
      if (at) {
        g.fx.flash(at, PAL[up].hot, 22, 0.35, 10);
        this.fx?.burst(at, up, up ? 0.5 : 0.4);
        for (let i = 0; i < 40; i++) {
          tmpV.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(3 + Math.random() * 5);
          g.fx.add.spawn(at.x, at.y, at.z, tmpV.x, tmpV.y, tmpV.z, { color: rainbow(Math.random()), size: 0.06, size1: 0, life: 0.45 + Math.random() * 0.3, drag: 2.4 });
        }
      }
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    TIME.value = g.time;
    this.cd = Math.max(0, this.cd - dt);
    this.kick = Math.max(0, this.kick - dt * 4);
    // la carga del Big Bang
    const c = this.charge;
    if (c) {
      const p = g.player;
      if (!this.stats || !p.alive || p.downed || !['idle', 'raise'].includes(this.w.state)) this.cancelCharge(true);
      else {
        c.t += dt;
        const pos = this.w.model?.muzzle ? this.w.muzzleWorld(tmpB) : null;
        // lo de alrededor se chupa hacia la estrella
        if (pos && Math.random() < 0.9) {
          for (let i = 0; i < 3; i++) {
            tmpV.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(0.8 + Math.random() * 0.6);
            g.fx.add.spawn(pos.x + tmpV.x, pos.y + tmpV.y, pos.z + tmpV.z, -tmpV.x * 2.2, -tmpV.y * 2.2, -tmpV.z * 2.2, { color: rainbow(Math.random()), size: 0.03, size1: 0.005, life: 0.38 });
          }
        }
        g.fx.addShake(dt * 0.6);
        if (c.t >= c.dur) {
          this.charge = null;
          this.detonate(c.st);
        }
      }
    }
    this.chargeK = this.charge ? Math.min(1, this.charge.t / this.charge.dur) : Math.max(0, this.chargeK - dt * 5);
    this.fx?.update(dt);
    // el mate en la mano
    const m = this.w.model?.nova ? this.w.model : null;
    const R = this.rl;
    if (m) {
      const N = m.nova;
      if (this.w.state === 'reload') this.reloadFx(N, Math.min(1, this.w.stateT / (this.w.reloadTime || 1)), dt, m.upgraded ? 1 : 0);
      else {
        R.lit = false;
        R.glow = Math.max(0, R.glow - dt * 4);
        animateNova(N, null, dt, g.time, this.chargeK + this.kick * 0.25);
        for (const r of N.rings) r.scale.setScalar(1);
        N.P.body.uniforms.uKick.value = this.kick * 0.6 + this.chargeK;
      }
    }
    // las olas
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.wave);
      const r = Math.max(0.3, b.R * ease(k));
      b.band.scale.set(r, 1, r);
      b.ring.scale.set(r * 1.04, 1, r * 1.04);
      b.shell.scale.setScalar(r * 0.92);
      b.group.scale.setScalar(1);
      const fade = Math.max(0, (b.t - b.wave * 0.55) / (b.wave * 0.45 + WAVE_FADE));
      for (const mm of [b.band, b.ring, b.shell]) mm.material.uniforms.uK.value = Math.min(1, fade);
      if (b.t > b.wave + WAVE_FADE) {
        b.busy = false;
        this.w.warm?.add(b.group);
        this.live.splice(i, 1);
      }
    }
    // el fogonazo en pantalla se apaga
    if (this.flashK > 0) {
      this.flashK = Math.max(0, this.flashK - dt * 2.2);
      const el = this.overlay;
      if (el) el.style.opacity = String(Math.min(1, this.flashK));
    }
    // (la carga también tiñe los bordes)
    if (this.overlay) {
      const glow = Math.max(this.chargeK, R.glow * 0.8);
      this.overlay.style.boxShadow = glow > 0.01 ? `inset 0 0 ${80 + glow * 140}px ${glow * 40}px rgba(160, 120, 255, ${0.35 * glow})` : '';
    }
  }

  // ---------------- en línea ----------------
  ghost(m) {
    if (m.k === 's' && m.a && m.b) {
      const chain = Array.isArray(m.c) ? m.c.slice(0, 8).map((q) => new THREE.Vector3().fromArray(q)) : [];
      this.shotFx(new THREE.Vector3().fromArray(m.a), new THREE.Vector3().fromArray(m.b), m.u ? 1 : 0, chain, !!m.x, true);
    } else if (m.k === 'bb' && m.p) this.bigBang(new THREE.Vector3().fromArray(m.p), m.u ? 1 : 0, true);
  }

  clear() {
    this.cancelCharge(false);
    this.fx?.clear();
    for (const b of this.live) {
      b.busy = false;
      this.w.warm?.add(b.group);
    }
    this.live.length = 0;
    this.flashK = 0;
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      this.overlay.style.boxShadow = '';
    }
  }

  // ---------------- lo que se escucha ----------------
  // El tiro: un zumbido que baja, un campanazo agudo de estrella y el golpe.
  sndShot(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: pos ? 0.7 : 0.55, reverb: 0.3 });
    const f = up ? 1500 : 1900;
    A.tone(o, { dur: 0.16, freq: f, freqEnd: f * 0.3, gain: 0.12, attack: 0.002 });
    A.tone(o, { dur: 0.12, type: 'triangle', freq: f * 2, freqEnd: f * 1.2, gain: 0.04 });
    const notes = up ? [1568, 1760, 2093, 2349] : [2093, 2349, 2637, 3136];
    A.tone(o, { t: A.now + 0.01, dur: 0.4, freq: notes[Math.floor(Math.random() * notes.length)], gain: 0.025, attack: 0.004 });
    A.noise(o, { dur: 0.06, type: 'highpass', freq: 5200, gain: 0.18 });
    A.tone(o, { dur: 0.12, freq: 130, freqEnd: 50, gain: 0.28 });
  }

  // La nova donde pega: un soplido de luz y campanitas.
  sndBurst(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.7, reverb: 0.35, ref: 4 });
    A.noise(o, { dur: 0.3, freq: 1400, freqEnd: 220, gain: 0.45, attack: 0.004 });
    A.tone(o, { dur: 0.25, freq: 320, freqEnd: 80, gain: 0.18 });
    for (let i = 0; i < 3; i++) A.tone(o, { t: A.now + 0.03 + i * 0.05, dur: 0.3, freq: (up ? 1320 : 1760) * (1 + i * 0.25), gain: 0.02 });
  }

  // La carga: un zumbido que sube y un coro de fondo (se corta si se cancela).
  sndCharge(dur) {
    const A = this.g.audio;
    if (!A?.ctx) return null;
    const o = A.out({ gain: 0.7, reverb: 0.2 });
    A.tone(o, { dur: dur + 0.05, type: 'sawtooth', freq: 70, freqEnd: 560, gain: 0.05, attack: 0.05 });
    A.tone(o, { dur: dur + 0.05, freq: 220, freqEnd: 1320, gain: 0.07, attack: 0.05 });
    A.tone(o, { dur: dur + 0.05, freq: 223, freqEnd: 1336, gain: 0.05, attack: 0.08 });
    A.noise(o, { dur: dur + 0.05, type: 'bandpass', freq: 600, freqEnd: 4200, q: 1.2, gain: 0.22, attack: dur * 0.8 });
    return {
      stop: () => {
        try {
          o.gain.cancelScheduledValues(A.now);
          o.gain.setTargetAtTime(0, A.now, 0.02);
        } catch {
          /* ya terminó */
        }
      },
    };
  }

  // El Big Bang: un trueno hondo que cae, el soplido y un acorde que brilla.
  sndBang(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 1, reverb: 0.5, ref: 8 });
    A.tone(o, { dur: 1.8, freq: 92, freqEnd: 26, gain: 0.75, attack: 0.004 });
    A.tone(o, { dur: 1.2, type: 'triangle', freq: 180, freqEnd: 40, gain: 0.3 });
    A.noise(o, { dur: 1.4, freq: 2400, freqEnd: 160, gain: 0.9, brown: true, attack: 0.003 });
    A.noise(o, { t: A.now + 0.05, dur: 2.6, type: 'highpass', freq: 6000, freqEnd: 3000, gain: 0.16, attack: 0.3 });
    const chord = up ? [392, 523, 659, 784, 1046] : [440, 554, 659, 880, 1109];
    chord.forEach((f, i) => A.tone(o, { t: A.now + 0.08 + i * 0.03, dur: 2.4, freq: f, gain: 0.035, attack: 0.02, detune: (i % 2 ? 6 : -6) }));
  }
}
