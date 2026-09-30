import * as THREE from 'three';
import { weaponStats } from '../config/weapons';
import { VM, VM_POSE, registerMate } from './viewmodels';
import SupremoFx, { SIX, PAL, raysTexture, flareTexture } from './supremoFx';
import { PART_COUNT } from '../entities/skeleton';

// El Mate Supremo: el premio de los seis easter eggs (core/eggs.js). Sale en
// la caja solo para el que los completó (y lo tiene prendido en Opciones).
// Rompe el juego a propósito, así lo pidió el usuario: munición infinita (el
// cargador no: se recarga, y además se va llenando solo), y todo lo que toca
// se deshace en luz.
// El mate: perla con vetas de oro vivo que suben, una corona de oro que flota
// arriba de la boca, un sol adentro (con sus rayos y chispas que suben) y las
// seis reliquias de los easter eggs girando alrededor, una por mapa: la piedra
// del molino, la hoja del yerbal, el alma del penal, el remolino de la torre,
// el corazón del dragón y la luna del estero.
//  · Clic izquierdo (automático): el rayo del sol. Atraviesa a todos, revienta
//    en un sol donde termina y salta en arcos de los seis colores.
//  · Clic derecho: el Juicio. Levanta el mate al cielo, se dibuja el sello de
//    los seis soles en el piso y cae una columna de luz sobre cada muerto de
//    alrededor. A los jefes les arranca un pedazo grande.
//  · El aura: con el mate en la mano, el muerto que se te acerca se hace luz.
//  · Recargar: el amanecer. Las seis reliquias se meten en la boca una por una,
//    el sol se eclipsa y vuelve a salir de un estallido.
// Con el Pack-a-Pava: Los Seis Soles (blanco prisma, todo más grande).
// Weapons (weapons/Weapons.js) le pasa cada tiro (fire), el clic derecho
// (input), cada cuadro (update), la pose (pose) y el final (clear).
// En línea: el daño lo pone cada uno (los invitados se lo pasan al anfitrión
// como cualquier tiro) y los demás solo ven: un mensaje por tiro ('supremo').

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const hitTmp = {};
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const TAU = Math.PI * 2;
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const rnd = () => Math.random() - 0.5;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const ease = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
const bump = (k, c, w) => sstep(1 - Math.abs(k - c) / w);
const SIX_RGB = SIX.map((c) => {
  const x = new THREE.Color(c);
  return [x.r, x.g, x.b];
});
const GOLD_RGB = [[1, 0.85, 0.45], [1, 0.95, 0.75], [1, 0.72, 0.25]];
// jefes y compañía: no se deshacen, se llevan un pedazo grande
const tough = (z) => z.boss || z.pombero || z.crow || z.mandinga;

// la recarga (el amanecer): sube, se tragan las reliquias, eclipse, sale el sol
const RL_UP = 0.14;
const IGNITE = 0.7;
const RL_DOWN = 0.86;
const RELIC_IN = (i) => RL_UP + 0.04 + i * 0.07;
const RELIC_FLY = 0.07;

const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());
// el tiempo de todos los materiales que se mueven (uno solo para todos)
const TIME = { value: 0 };

// ---------------- materiales ----------------
// El cuerpo: perla con vetas de oro vivo que suben despacio y un pulso de luz
// que las recorre; el borde encendido. La mejorada: blanco prisma con vetas de
// arcoíris. uDim apaga todo en el eclipse de la recarga; uKick lo enciende.
// (luz fija en la vista; sin normalizar vectores nulos: un NaN en la placa AMD
// apaga toda la pantalla)
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
uniform float uTime, uKick, uDim, uPrism; uniform vec3 uBase, uVein, uRim;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z); }
void main(){
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = (1.0 - ndv) * (1.0 - ndv);
  vec3 L = vec3(0.37, 0.8, 0.47);
  float dif = 0.5 + 0.5 * max(dot(n, L), 0.0);
  vec3 hv = L + v;
  vec3 H = hv / max(length(hv), 1e-4);
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  vec3 p = vP * 55.0;
  float t = uTime * 0.35;
  float f = vn(p + vec3(0.0, -t * 1.6, t * 0.3)) * 0.6 + vn(p * 2.03 + vec3(t, -t * 2.1, 0.0)) * 0.4;
  float ridge = 1.0 - abs(f * 2.0 - 1.0);
  float vein = smoothstep(0.84, 0.95, ridge);
  float hot = smoothstep(0.92, 0.99, ridge);
  float pulse = 0.55 + 0.45 * sin(uTime * 3.2 - vP.y * 110.0);
  vec3 vc = uVein;
  if (uPrism > 0.5) vc = 0.55 + 0.45 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vP.y * 12.0 + vP.x * 6.0 + uTime * 0.22));
  vec3 base = uBase * dif + vec3(spec * 0.5);
  vec3 col = mix(base, vc * (0.95 + spec), vein);
  col += vc * hot * pulse * (1.1 + uKick * 2.4) * uDim;
  col += uRim * fres * (0.7 + uKick * 1.4) * uDim;
  // (más oscuro abajo, donde lo tapa la mano)
  col *= mix(0.22, 1.0, uDim) * mix(0.5, 1.0, smoothstep(0.0, 0.075, vP.y));
  gl_FragColor = vec4(col, 1.0);
}`;

function bodyMat(up) {
  return once(`body${up}`, () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: TIME,
        uKick: { value: 0 },
        uDim: { value: 1 },
        uPrism: { value: up },
        uBase: { value: up ? new THREE.Color(0.6, 0.6, 0.7) : new THREE.Color(0.52, 0.44, 0.33) },
        uVein: { value: new THREE.Color(1, 0.6, 0.12) },
        uRim: { value: up ? new THREE.Color(0.55, 0.7, 0.9) : new THREE.Color(0.8, 0.55, 0.25) },
      },
      vertexShader: BODY_VS,
      fragmentShader: BODY_FS,
    }),
  );
}

function supMats(T, up) {
  return once(`mats${up}`, () => {
    const C = PAL[up];
    const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
    const spr = (map, hex, k, o = 1) => new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: o });
    return {
      body: bodyMat(up),
      gold: new THREE.MeshStandardMaterial({ color: up ? 0xffe6b0 : 0xffc640, metalness: 1, roughness: 0.14, emissive: up ? 0x3a2030 : 0x3a2400, emissiveIntensity: 0.7 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xaaa59c, roughness: 0.75, metalness: 0.05, emissive: 0x16263a, emissiveIntensity: 0.8 }),
      lit: glow(C.gold, 1.7),
      six: SIX.map((c) => glow(c, 2.3)),
      sixSpr: SIX.map((c) => spr(T.dot, c, 0.9, 0.7)),
      core: glow(C.star, 2.2),
      eclipse: new THREE.MeshBasicMaterial({ color: 0x070403 }),
      prism: glow(up ? 0xffffff : 0xfff2cc, 3),
      corona: spr(T.dot, C.hot, 0.9, 0.7),
      rays: spr(raysTexture(), C.gold, 0.75, 0.9),
      flare: spr(flareTexture(), C.star, 0.55, 0.85),
      ember: spr(T.dot, up ? 0xffc0f0 : 0xffb450, 1.4, 1),
      star: glow(0xffffff, 2.6),
    };
  });
}

// ---------------- el modelo ----------------
// Una calabaza redonda con el labio abierto (la mano la abraza como a cualquiera).
const PROF = [[0, 0], [0.022, 0.002], [0.037, 0.012], [0.046, 0.03], [0.049, 0.05], [0.046, 0.07], [0.039, 0.085], [0.031, 0.095], [0.03, 0.1], [0.034, 0.106]];
const ORBIT_Y = 0.052;
const ORBIT_R = 0.079;
const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0.2));
const TILT2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, -0.35));
const TRAIL = 3;
// el tamaño de los rayos, el destello y la corona del sol (quieto)
const RAYS_S = 0.085;
const FLARE_S = 0.065;
const CORONA_S = 0.05;

const cone = (r, h, mat, seg = 6) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);

// Las seis reliquias (una por easter egg, en el orden del juego).
function relicShape(i, P) {
  const g = new THREE.Group();
  const c = P.six[i];
  switch (i) {
    case 0: {
      // la piedra del molino (con el rayo del Tronador en el ojo)
      const stone = VM.cyl(0.0068, 0.0068, 0.003, P.stone, 16);
      stone.rotation.x = Math.PI / 2;
      g.add(stone);
      const rim = VM.tor(0.0069, 0.0009, c, 6, 20);
      g.add(rim);
      g.add(VM.sph(0.0019, c, 8, 6));
      break;
    }
    case 1: {
      // la hoja del yerbal, con la nervadura de oro
      const leaf = VM.sph(1, c, 12, 8);
      leaf.scale.set(0.0082, 0.0022, 0.0044);
      g.add(leaf);
      g.add(VM.box(0.014, 0.0007, 0.0007, P.gold));
      break;
    }
    case 2: {
      // el alma del penal: una llamita fría
      const f = cone(0.0042, 0.012, c, 10);
      f.position.y = 0.005;
      g.add(f, VM.sph(0.0043, c, 10, 8));
      break;
    }
    case 3: {
      // el remolino de la torre
      g.add(VM.tor(0.0054, 0.0013, c, 6, 22));
      const t2 = VM.tor(0.0033, 0.001, c, 6, 18);
      t2.rotation.x = Math.PI / 2;
      g.add(t2, VM.sph(0.0017, P.core, 8, 6));
      break;
    }
    case 4: {
      // el corazón del dragón, engarzado
      const h = new THREE.Mesh(new THREE.OctahedronGeometry(0.0058, 0), c);
      h.scale.y = 1.5;
      g.add(h);
      const band = VM.tor(0.0046, 0.0008, P.gold, 6, 18);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      break;
    }
    default: {
      // la luna del estero
      const m = VM.tor(0.0058, 0.0019, c, 6, 18, Math.PI * 1.25);
      m.rotation.z = Math.PI * 0.4;
      g.add(m);
    }
  }
  return g;
}

// display: el de las escenas (la bombilla parada, como en la mesa)
function supremoParts(T, up, display = false) {
  const M = VM.mats(T);
  const P = supMats(T, up);
  const top = VM.topOf(PROF);
  const rAt = (y) => VM.profileRadius(PROF, y);
  const mate = new THREE.Group();
  const body = VM.lathe(PROF, P.body, 36);
  // la pared de adentro (sin ella, al mirar la boca se ve el costado de atrás)
  body.add(VM.lathe([[top.r, top.y], [top.r - 0.0025, top.y], [top.r - 0.0025, top.y - 0.03]], P.body));
  mate.add(body);
  // adentro no hay yerba: hay luz
  const inside = new THREE.Mesh(new THREE.CircleGeometry(top.r - 0.002, 24).rotateX(-Math.PI / 2), P.lit);
  inside.position.y = top.y - 0.01;
  mate.add(inside);
  // la virola: una corona de doce puntas de oro
  const vir = VM.tor(top.r + 0.0012, 0.0034, P.gold, 8, 40);
  vir.rotation.x = Math.PI / 2;
  vir.position.y = top.y;
  mate.add(vir);
  const spikeGeo = new THREE.ConeGeometry(0.0026, 0.012, 6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const s = new THREE.Mesh(spikeGeo, P.gold);
    s.position.set(Math.cos(a) * (top.r + 0.001), top.y + 0.007, Math.sin(a) * (top.r + 0.001));
    s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    mate.add(s);
  }
  // las fajas de oro, el pie y las seis gemas engarzadas en la panza
  for (const y of [0.016, 0.084]) {
    const t = VM.tor(rAt(y) + 0.0008, 0.0015, P.gold, 6, 44);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    mate.add(t);
  }
  const foot = VM.tor(0.021, 0.0022, P.gold, 8, 36);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.002;
  mate.add(foot);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    const r = rAt(0.05) + 0.0012;
    const gem = VM.sph(0.0034, P.six[i], 10, 8);
    gem.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    mate.add(gem);
    const bez = VM.tor(0.0043, 0.0009, P.gold, 6, 16);
    bez.position.copy(gem.position);
    bez.rotation.y = Math.PI / 2 - a;
    mate.add(bez);
  }
  // la órbita de las reliquias: un hilo de luz inclinado
  const ringG = new THREE.Group();
  ringG.quaternion.copy(TILT);
  ringG.position.y = ORBIT_Y;
  const ring = VM.tor(ORBIT_R, 0.0006, P.lit, 4, 96);
  ring.rotation.x = Math.PI / 2;
  ringG.add(ring);
  mate.add(ringG);
  const relics = SIX.map((c, i) => {
    const h = new THREE.Group();
    h.add(relicShape(i, P));
    const s = new THREE.Sprite(P.sixSpr[i]);
    s.scale.setScalar(0.018);
    h.add(s);
    mate.add(h);
    return h;
  });
  // la mejorada: estelas detrás de cada reliquia y una segunda órbita de estrellas
  const trails = [];
  const stars2 = [];
  if (up) {
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < TRAIL; k++) {
        const s = new THREE.Sprite(P.sixSpr[i].clone());
        s.material.opacity = 0.55 * (1 - (k + 1) / (TRAIL + 1));
        s.scale.setScalar(0.02 * (1 - (k + 1) / (TRAIL + 2)));
        mate.add(s);
        trails.push({ i, k, s });
      }
    }
    for (let i = 0; i < 6; i++) {
      const s = VM.sph(0.0022, P.star, 8, 6);
      const gl = new THREE.Sprite(P.corona);
      gl.scale.setScalar(0.014);
      s.add(gl);
      mate.add(s);
      stars2.push(s);
    }
  }
  // el sol en la boca (corrido para no chocar con la bombilla)
  const star = new THREE.Group();
  star.position.set(-0.012, top.y + 0.016, -0.004);
  mate.add(star);
  const rays = new THREE.Sprite(P.rays);
  rays.scale.setScalar(RAYS_S);
  const corona = new THREE.Sprite(P.corona);
  corona.scale.setScalar(CORONA_S);
  const core = VM.sph(0.011, P.core, 16, 12);
  const eclipse = VM.sph(0.0118, P.eclipse, 16, 12);
  eclipse.visible = false;
  const flare = new THREE.Sprite(P.flare);
  flare.scale.setScalar(FLARE_S);
  // el golpe de color de cada reliquia que se traga (la recarga)
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  pulse.scale.setScalar(0.05);
  star.add(rays, corona, core, eclipse, flare, pulse);
  // las chispas que suben del sol
  const embers = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(P.ember.clone());
    s.scale.setScalar(0.008);
    star.add(s);
    embers.push(s);
  }
  // la corona que flota arriba de la boca
  const crown = new THREE.Group();
  const crownY = top.y + 0.044;
  crown.position.y = crownY;
  const cr = VM.tor(0.027, 0.0016, P.gold, 6, 40);
  cr.rotation.x = Math.PI / 2;
  crown.add(cr);
  const cSpike = new THREE.ConeGeometry(0.0024, 0.011, 5);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const s = new THREE.Mesh(cSpike, P.gold);
    s.position.set(Math.cos(a) * 0.027, 0.0055, Math.sin(a) * 0.027);
    crown.add(s);
    if (k % 2 === 0) {
      const gem = VM.sph(0.0019, P.six[(k / 2) % 6], 8, 6);
      gem.position.set(Math.cos(a) * 0.027, 0.0125, Math.sin(a) * 0.027);
      crown.add(gem);
    }
  }
  if (up) {
    const c2 = VM.tor(0.021, 0.0011, P.lit, 6, 36);
    c2.rotation.x = Math.PI / 2;
    c2.position.y = -0.006;
    crown.add(c2);
  }
  mate.add(crown);
  // la bombilla de oro: anillos de colores que giran y la punta de prisma
  const b = VM.bombilla({ len: display ? 0.2 : 0.24, mat: P.gold, thick: 1.2, tilt: display ? 0.32 : undefined }, M, top.y);
  b.group.position.x = 0.006;
  mate.add(b.group);
  const straw = b.straws[0];
  const spin = [];
  [0, 3, 5].forEach((c, i) => {
    const r = VM.tor(0.0125 - i * 0.002, 0.0021, P.six[c], 6, 24);
    r.rotation.x = Math.PI / 2;
    r.position.y = b.len * (0.38 + i * 0.17);
    straw.add(r);
    spin.push(r);
  });
  const muzzle = b.tips[0];
  const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.0068, 0), P.prism);
  muzzle.add(prism);
  const tipGlow = new THREE.Sprite(P.rays);
  tipGlow.scale.setScalar(0.04);
  muzzle.add(tipGlow);
  const sup = {
    relics,
    trails,
    stars2,
    hist: relics.map(() => []),
    star,
    rays,
    corona,
    core,
    eclipse,
    flare,
    pulse,
    embers,
    crown,
    crownY,
    ringG,
    prism,
    tipGlow,
    P,
    up,
    ang: Math.random() * TAU,
    ang2: 0,
    mouth: star.position.clone(),
    into: [0, 0, 0, 0, 0, 0],
  };
  return { mate, top, rAt, muzzle, spin, bombGroup: b.group, sup };
}

function buildSupremo(up, T) {
  const M = VM.mats(T);
  const S = supremoParts(T, up);
  const { mate, top, rAt, muzzle } = S;
  mate.add(VM.cupHand(M, rAt, top.y));
  const mouth = new THREE.Object3D();
  mouth.position.set(0, top.y - 0.004, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(1.08 * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  animateSupremo(S.sup, 0, 0);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim: { spin: S.spin, glow: [], wobble: null }, upgraded: !!up, tip, mouth, mate, bombGroup: S.bombGroup, yerba: null, sup: S.sup };
}

registerMate('supremo', (up, T) => buildSupremo(up ? 1 : 0, T));

// El mate supremo de la historia (el que se arma en el altar del penal, el que
// se lleva la Voz y el que Francisco les da a los gauchos): el mismo mate, sin
// la mano, agrandado a `size` (el alto del cuerpo, en metros). Se anima con
// animateSupremoDisplay.
const BODY_H = PROF[PROF.length - 1][1];
export function buildSupremoDisplay(T, size = 0.3, up = 0) {
  const S = supremoParts(T, up, true);
  const g = new THREE.Group();
  S.mate.scale.setScalar(size / BODY_H);
  g.add(S.mate);
  g.sup = S.sup;
  animateSupremo(S.sup, 0, 0);
  return g;
}

// El cuerpo (perla con vetas de oro vivo), para el Supremo gigante del cielo
// del Challenge (entities/challengeHeaven.js). Sin luces: no recompila nada.
export const supremoBodyMaterial = (up = 0) => bodyMat(up);
export const supremoTime = (t) => {
  TIME.value = t;
};

// Las reliquias, la corona y el sol de un mate de escena (o: como animateSupremo).
export function animateSupremoDisplay(g, dt, t, o) {
  if (!g?.sup) return;
  TIME.value = t;
  animateSupremo(g.sup, dt, t, o);
}

// Las reliquias, la corona, el sol y las chispas (cada cuadro, en la mano).
// o: { speed, open (se abren), kick, lift (las reliquias suben), dim (eclipse) }
export function animateSupremo(S, dt, t, o = {}) {
  const speed = o.speed ?? 1;
  const open = o.open || 0;
  const kick = o.kick || 0;
  const lift = o.lift || 0;
  S.ang += dt * (0.9 * speed);
  const R = ORBIT_R * (1 + open * 0.65);
  for (let i = 0; i < 6; i++) {
    const h = S.relics[i];
    const a = S.ang + (i / 6) * TAU;
    tmpV.set(Math.cos(a) * R, Math.sin(t * 2.1 + i * 1.7) * 0.003, Math.sin(a) * R).applyQuaternion(TILT);
    tmpV.y += ORBIT_Y + lift * (0.02 + 0.012 * Math.sin(a * 2 + t));
    const k = S.into[i];
    if (k > 0) tmpV.lerp(S.mouth, ease(k));
    h.position.copy(tmpV);
    h.rotation.y += dt * (1.6 + i * 0.35 + speed * 0.8);
    h.rotation.x = Math.sin(t * 1.3 + i) * 0.5;
    h.scale.setScalar((S.up ? 1.55 : 1.35) * (1 + kick * 0.25) * (1 - k * 0.92));
    // las estelas de la mejorada: por dónde pasó hace un ratito
    if (S.trails.length) {
      const H = S.hist[i];
      H.unshift(h.position.clone());
      if (H.length > TRAIL * 2 + 1) H.pop();
    }
  }
  for (const tr of S.trails) {
    const p = S.hist[tr.i][(tr.k + 1) * 2];
    tr.s.visible = !!p && S.into[tr.i] < 0.5;
    if (p) tr.s.position.copy(p);
  }
  // la segunda órbita (la mejorada): estrellitas al revés, más cerca
  if (S.stars2.length) {
    S.ang2 -= dt * (1.5 * speed);
    S.stars2.forEach((s, i) => {
      const a = S.ang2 + (i / 6) * TAU;
      s.position.set(Math.cos(a) * 0.063 * (1 + open * 0.4), 0, Math.sin(a) * 0.063 * (1 + open * 0.4)).applyQuaternion(TILT2);
      s.position.y += ORBIT_Y + 0.004;
    });
  }
  S.ringG.rotation.y += dt * 0.2 * speed;
  S.ringG.scale.setScalar(1 + open * 0.65);
  // la corona: flota, gira y salta con cada tiro
  S.crown.rotation.y += dt * (0.7 + speed * 0.4);
  S.crown.rotation.z = Math.sin(t * 1.1) * 0.12;
  S.crown.position.y = S.crownY + Math.sin(t * 2.2) * 0.003 + kick * 0.008 + lift * 0.02;
  // el sol: late, los rayos giran, el destello titila
  const pulse = 1 + Math.sin(t * 5.5) * 0.08 + kick * 0.6;
  S.core.scale.setScalar(pulse);
  S.corona.scale.setScalar(CORONA_S * (pulse + kick * 0.6));
  S.rays.material.rotation = t * 0.5 * speed;
  S.rays.scale.setScalar(RAYS_S * (1 + Math.sin(t * 1.9) * 0.08 + kick * 0.5));
  S.flare.material.rotation = -t * 0.3;
  S.flare.scale.setScalar(FLARE_S * (1 + Math.sin(t * 2.7) * 0.12 + kick * 0.9));
  S.tipGlow.material.rotation = t;
  S.tipGlow.scale.setScalar(0.04 * (1 + Math.sin(t * 9) * 0.15 + kick * 2));
  S.prism.rotation.y += dt * 3;
  S.prism.rotation.x = Math.sin(t * 2) * 0.4;
  // las chispas que suben
  S.embers.forEach((s, i) => {
    const u = (t * 0.9 + i / S.embers.length) % 1;
    const a = i * 2.4 + t * 0.7;
    s.position.set(Math.cos(a) * 0.009 * (1 - u), 0.004 + u * 0.05, Math.sin(a) * 0.009 * (1 - u));
    s.scale.setScalar(0.009 * (1 - u * 0.7));
    s.material.opacity = Math.sin(u * Math.PI);
  });
  // el golpe de color se apaga
  S.pulse.material.opacity = Math.max(0, S.pulse.material.opacity - dt * 4);
  S.pulse.scale.setScalar(0.05 + (1 - S.pulse.material.opacity) * 0.05);
}

// ---------------- en uso ----------------
export default class Supremo {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.cd = 0;
    this.charge = null;
    this.chargeK = 0;
    this.kick = 0;
    this.slam = 0;
    this.lastShot = -9;
    this.regenAcc = 0;
    this.auraT = 0;
    this.auraSig = null;
    this.sigils = [];
    this.crackT = 0;
    this.overlay = null;
    this.flashK = 0;
    this.inspectK = 0;
    // (armados de entrada en el grupo escondido de los mates: la carga
    // compila sus shaders y el primer Juicio no traba)
    this.fx = weapons.warm ? new SupremoFx(weapons.warm, weapons.T.dot, weapons.g) : null;
    this.rl = { lit: false, id: 0, glow: 0, sink: new THREE.Vector3(), seen: 0 };
  }

  get stats() {
    return this.w.stats?.kind === 'supremo' ? this.w.stats : null;
  }

  slot() {
    return this.w.slots?.find((x) => x.id === 'supremo');
  }

  // Lo que le saca a cada uno: los muertos comunes se deshacen; a los jefes,
  // lo que diga el arma o un pedazo de su vida (lo que sea más).
  hurt(z, base, frac, head = false) {
    if (!tough(z)) return 1e9;
    return Math.max(base, (z.maxHp || 0) * frac) * (head ? 1.25 : 1);
  }

  // ---------------- el rayo del sol ----------------
  fire(st, origin, fwd, muzzle) {
    const g = this.g;
    const S = st.sol;
    const up = st.upgraded ? 1 : 0;
    const dir = tmpD.copy(fwd);
    const wallT = g.world.raycast(origin, dir, st.range, hitTmp);
    const hitWall = Number.isFinite(wallT) && wallT <= st.range;
    const maxT = Math.min(wallT, st.range);
    const hits = g.zombies.raycast(origin, dir, maxT);
    let head = false;
    let last = null;
    let n = 0;
    const pierced = [];
    // atraviesa a todos
    for (const h of hits) {
      const z = h.z;
      const point = new THREE.Vector3().copy(origin).addScaledVector(dir, h.t);
      g.zombies.damage(z, this.hurt(z, st.damage, st.bossFrac, h.zone === 'head'), { type: 'bullet', zone: h.zone, arm: h.arm, point, dir: dir.clone() });
      if (h.zone === 'head') head = true;
      last = h;
      if (n++ < 5) pierced.push(point);
    }
    if (last) {
      g.hud.hitmarker(head);
      g.audio.hitmarker(head);
    }
    if (hitWall) g.fx.impact(hitTmp);
    g.water?.shot(origin, dir, maxT);
    g.ee?.onShot?.(origin, dir, maxT);
    g.secrets?.onShot(origin, dir, maxT);
    g.papq?.onShot(origin, dir, maxT);
    // el sol: en la pared (si está cerca) o en el último que atravesó
    let at = null;
    if (hitWall && wallT < 70) at = new THREE.Vector3().copy(origin).addScaledVector(dir, wallT).addScaledVector(hitTmp.normal || tmpA.copy(dir).negate(), 0.3);
    else if (last) at = new THREE.Vector3().copy(origin).addScaledVector(dir, last.t);
    const end = at ? at.clone() : new THREE.Vector3().copy(origin).addScaledVector(dir, Math.min(maxT, 90));
    const chain = [];
    if (at) {
      this.area(at, S.radius, st.damage, st.bossFrac * 0.5);
      // los arcos: a los más cercanos que quedaron en pie
      const near = g.zombies.inRadius(at, S.chainR).filter((e) => !e.z.dead && Math.abs((e.z.pos.y || 0) - at.y) < 4).sort((a, b) => a.d - b.d).slice(0, S.chain);
      for (const { z } of near) {
        const to = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.2 * (z.scale || 1), z.pos.z);
        g.zombies.damage(z, this.hurt(z, S.chainDmg, st.bossFrac * 0.5), { type: 'bullet', zone: 'torso', point: to, dir: tmpV.subVectors(to, at).normalize().clone() });
        chain.push(to);
      }
    }
    for (const p of pierced) this.fx?.sun(p, up, (up ? 0.45 : 0.35) * this.near(p, false), true);
    this.shotFx(muzzle, end, up, chain, !!at, false);
    g.net?.share('supremo', { k: 's', a: r2(muzzle), b: r2(end), c: chain.map(r2), u: up, x: at ? 1 : 0 });
    this.kick = 1;
    this.lastShot = g.time;
    g.fx.addShake(up ? 0.08 : 0.06);
  }

  // Daño en un radio (con la vista libre, como una explosión).
  area(at, R, base, frac) {
    const g = this.g;
    const from = tmpB.copy(at);
    from.y += 0.4;
    for (const { z, d } of g.zombies.inRadius(at, R, [])) {
      if (!g.world.clear(from, tmpA.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z))) continue;
      const dir = new THREE.Vector3(z.pos.x - at.x, 0.3, z.pos.z - at.z).normalize();
      g.zombies.damage(z, this.hurt(z, base * (1 - (d / R) * 0.4), frac), { type: 'explosive', dir, point: new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z) });
    }
    g.ee?.onExplosion?.(at, R);
    g.secrets?.onExplosion?.(at, R);
    g.papq?.onExplosion?.(at, R);
  }

  // Lo que se ve de un tiro (propio o de otro jugador).
  shotFx(a, b, up, chain, burst, ghost) {
    const g = this.g;
    const C = PAL[up];
    // (el propio: el que tira mira a lo largo del rayo y a 600 por minuto se
    // apilaba todo en la cara y dejaba ciego; lo dijo el usuario el 2026-09-29.
    // Lo gordo arranca más adelante, la boca solo tiene el hilo blanco y un
    // sol chiquito, y los soles de cerca se achican. Los demás lo ven como siempre.)
    const len0 = a.distanceTo(b);
    const a2 = ghost || len0 < 0.01 ? a : new THREE.Vector3().lerpVectors(a, b, Math.min(1.8, len0 * 0.4) / len0);
    // el rayo: un haz gordo de oro, otro caliente y el alma blanca
    this.ray(a2, b, C.gold, up ? 0.5 : 0.38, 0.16);
    this.ray(a2, b, up ? C.hot : C.halo, up ? 0.26 : 0.2, 0.2);
    this.ray(a, b, 0xffffff, ghost ? (up ? 0.12 : 0.09) : up ? 0.06 : 0.05, 0.13);
    // seis hebras de colores que se enroscan alrededor del rayo
    const d = tmpA.subVectors(b, a);
    const len = d.length();
    if (len > 0.01) {
      d.divideScalar(len);
      const side = Math.abs(d.y) > 0.95 ? X_AXIS : Y_AXIS;
      const u = new THREE.Vector3().crossVectors(d, side).normalize();
      const v = new THREE.Vector3().crossVectors(d, u).normalize();
      const per = Math.min(up ? 9 : 7, 3 + Math.floor(len * 0.22));
      // (arrancan un poco adelante: pegadas a la cámara se verían como manchones)
      const k0 = Math.min(0.5, 1.4 / len);
      const ph = Math.random() * TAU;
      const rad = up ? 0.26 : 0.2;
      for (let s = 0; s < 6; s++) {
        for (let i = 0; i < per; i++) {
          const k = k0 + ((1 - k0) * (i + Math.random() * 0.6)) / per;
          const ang = ph + k * len * 1.6 + (s / 6) * TAU;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const ox = u.x * ca + v.x * sa;
          const oy = u.y * ca + v.y * sa;
          const oz = u.z * ca + v.z * sa;
          g.fx.add.spawn(a.x + d.x * k * len + ox * rad, a.y + d.y * k * len + oy * rad, a.z + d.z * k * len + oz * rad, ox * 1.4, oy * 1.4 + 0.25, oz * 1.4, { color: SIX_RGB[s], size: up ? 0.11 : 0.09, size1: 0, life: 0.3 + Math.random() * 0.25 });
        }
      }
    }
    g.fx.flash(a, C.gold, ghost ? 3 : 2.5, 0.07, 6);
    this.fx?.sun(a, up, ghost ? (up ? 0.32 : 0.26) : up ? 0.09 : 0.07, true);
    if (burst) this.burstFx(b, up, ghost);
    chain.forEach((c, i) => {
      this.arc(b, c, SIX[i % 6], up);
      this.fx?.sun(c, up, (up ? 0.5 : 0.4) * this.near(c, ghost), true);
    });
    this.sndShot(ghost ? a.clone() : null, up);
    const now = g.time;
    if (now >= this.crackT) {
      this.crackT = now + (ghost ? 0.6 : 0.3);
      // (el trueno intenso y cercano de la Supernova con Pack-a-Pava, con o
      // sin Pack-a-Pava: los medios sonaban lejísimos; el usuario, 2026-09-29)
      g.audio.thunderCrack?.(ghost ? b.clone() : null, { dur: 0.95, gain: ghost ? 0.3 : 0.55, big: true });
    }
  }

  // Un haz recto en tramos que se alargan con la distancia: cada tramo mira a
  // la cámara desde su medio (uno solo, visto casi de punta desde el que tira,
  // queda finito como un hilo).
  ray(a, b, color, width, life) {
    const g = this.g;
    const len = a.distanceTo(b);
    let t0 = 0;
    let step = 0.7;
    const p0 = tmpA.copy(a);
    const p1 = new THREE.Vector3();
    while (t0 < len) {
      const t1 = Math.min(len, t0 + step);
      p1.lerpVectors(a, b, t1 / len);
      g.fx.beam(p0, p1, { color, width, life });
      p0.copy(p1);
      t0 = t1;
      step *= 2;
    }
  }

  // Un arco de un color (más liviano que fx.lightning: cuatro tramos).
  arc(a, b, color, up) {
    const g = this.g;
    const segs = 4;
    const len = a.distanceTo(b);
    let prev = a;
    for (let i = 1; i <= segs; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / segs);
      if (i < segs) p.add(tmpV.set(rnd() * len * 0.16, rnd() * len * 0.16, rnd() * len * 0.16));
      g.fx.beam(prev, p, { color, width: up ? 0.13 : 0.1, life: 0.2 });
      g.fx.beam(prev, p, { color: 0xffffff, width: 0.03, life: 0.16 });
      prev = p;
    }
  }

  // Cuánto se achica un sol a esta distancia del que tira (de cerca tapaba
  // todo); los de otro jugador, enteros.
  near(at, ghost) {
    if (ghost) return 1;
    return 0.3 + 0.7 * clamp01((this.g.camera.position.distanceTo(at) - 1) / 8);
  }

  // El sol donde termina el rayo.
  burstFx(at, up, ghost) {
    const g = this.g;
    const C = PAL[up];
    const k = this.near(at, ghost);
    g.fx.flash(at, C.hot, (up ? 20 : 16) * k, 0.22, up ? 16 : 13);
    this.fx?.sun(at, up, (up ? 1.15 : 0.9) * k);
    const n = up ? 36 : 28;
    for (let i = 0; i < n; i++) {
      tmpV.set(rnd(), rnd() + 0.3, rnd()).normalize().multiplyScalar(4 + Math.random() * 8);
      g.fx.add.spawn(at.x, at.y, at.z, tmpV.x, tmpV.y, tmpV.z, { color: i % 3 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: up ? 0.14 : 0.12, size1: 0, life: 0.5 + Math.random() * 0.4, drag: 2.2 });
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      g.fx.add.spawn(at.x, at.y, at.z, Math.cos(a) * 10, 0.3, Math.sin(a) * 10, { color: [1, 0.93, 0.8], size: 0.1, size1: 0, life: 0.3, drag: 3 });
    }
    const P = g.player;
    if (P?.pos && !ghost) {
      const dd = P.pos.distanceTo(at);
      if (dd < 12) g.fx.addShake((up ? 0.22 : 0.16) * (1 - dd / 12));
    }
    this.sndBurst(at.clone(), up);
  }

  // Un muerto que se hace luz: una columna de chispas de oro que sube.
  vaporFx(pos, k, up, light) {
    const g = this.g;
    const y0 = pos.y || 0;
    for (let i = 0; i < 16; i++) {
      const h = Math.random() * 1.8 * k;
      g.fx.add.spawn(pos.x + rnd() * 0.5, y0 + h, pos.z + rnd() * 0.5, rnd() * 0.5, 1.4 + Math.random() * 2.4, rnd() * 0.5, { color: i % 4 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.09, size1: 0, life: 0.7 + Math.random() * 0.6, drag: 0.8 });
    }
    if (light) g.fx.flash(tmpV.set(pos.x, y0 + 1, pos.z), PAL[up].gold, 6, 0.25, 6);
  }

  // Un muerto que se deshace en luz: su cuerpo, pieza por pieza (las del
  // esqueleto), queda un instante hecho luz blanca con su forma y después se
  // desarma en chispas de oro que suben cada vez más rápido (las de más
  // arriba, antes), con alguna de los seis colores; del pecho sale el alma.
  // Va antes del daño: después ya no está. n: chispas por pieza.
  dissolveFx(z, up, n = 5) {
    const g = this.g;
    const y0 = z.pos.y || 0;
    const sc = z.scale || 1;
    if (!z.mats || z.dog || z.boss) return this.vaporFx(z.pos, sc, up, false);
    const glow = up ? [1, 0.9, 1] : [1, 0.94, 0.78];
    for (let k = 0; k < PART_COUNT; k++) {
      const e = z.mats[k]?.elements;
      if (!e) continue;
      const px = e[12];
      const py = e[13];
      const pz = e[14];
      // (una pieza escondida queda en cero)
      if (!Number.isFinite(px + py + pz) || (px === 0 && py === 0 && pz === 0)) continue;
      const h = Math.max(0, py - y0);
      // el cuerpo de luz: una mancha blanca grande por pieza, que se apaga sola
      g.fx.add.spawn(px, py, pz, 0, 0.05, 0, { color: glow, size: 0.34 * sc, size1: 0.12 * sc, life: 0.32 + h * 0.06, drag: 4 });
      for (let i = 0; i < n; i++) {
        const jx = rnd() * 0.2 * sc;
        const jy = rnd() * 0.22 * sc;
        const jz = rnd() * 0.2 * sc;
        const six = (i + k) % 4 === 0;
        g.fx.add.spawn(px + jx, py + jy, pz + jz, jx * 0.8, 0.05 + Math.random() * 0.25, jz * 0.8, { color: six ? SIX_RGB[(i + k) % 6] : GOLD_RGB[(i + k) % 3], size: 0.075 + Math.random() * 0.05, size1: 0, life: 1 + h * 0.25 + Math.random() * 0.6, gravity: -(1.8 + h * 1.4 + Math.random()), drag: 0.35 });
      }
    }
    // el alma que sube: un chorrito brillante del pecho para arriba
    for (let i = 0; i < 8; i++) g.fx.add.spawn(z.pos.x + rnd() * 0.15, y0 + 1.3 * sc, z.pos.z + rnd() * 0.15, rnd() * 0.3, 2.5 + Math.random() * 3, rnd() * 0.3, { color: [1, 0.97, 0.9], size: 0.13, size1: 0.02, life: 0.8 + Math.random() * 0.5, gravity: -2, drag: 0.5 });
    // un anillo de chispas a ras del piso
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      g.fx.add.spawn(z.pos.x, y0 + 0.08, z.pos.z, Math.cos(a) * 3.5, 0.2, Math.sin(a) * 3.5, { color: GOLD_RGB[i % 3], size: 0.08, size1: 0, life: 0.4, drag: 3 });
    }
  }

  // ---------------- el Juicio ----------------
  // (Weapons.handleInput) El clic derecho: devuelve true si lo tomó (mientras
  // carga no tira el rayo).
  input(input, st, p) {
    const g = this.g;
    if (this.charge) return true;
    if (!input.mouse.rightPressed || this.w.state !== 'idle' || p.sprinting) return false;
    const s = this.w.slot;
    const J = st.juicio;
    if (this.cd > 0) {
      g.audio.empty();
      return true;
    }
    if (s.mag < J.cost) {
      this.w.startReload(st);
      return true;
    }
    s.mag -= J.cost;
    this.w.updateHud();
    this.lastShot = g.time;
    const sig = this.fx?.sigil(this.floorAt(p.pos, tmpV), 0.5);
    this.charge = { t: 0, dur: J.charge, st, cost: J.cost, snd: this.sndCharge(J.charge), sig };
    return true;
  }

  cancelCharge(refund = true) {
    const c = this.charge;
    if (!c) return;
    this.charge = null;
    c.snd?.stop();
    this.fx?.release(c.sig);
    const s = this.slot();
    if (refund && s) {
      s.mag += c.cost;
      this.w.updateHud();
    }
  }

  floorAt(p, out) {
    const fy = this.g.world.floorAt(p.x, p.z, p.y + 1);
    return out.set(p.x, (Number.isFinite(fy) ? fy : p.y) + 0.05, p.z);
  }

  // Los muertos que alcanza el Juicio, del más cerca al más lejos: todos los
  // del mapa (`all`), en cualquier piso.
  targets(c, J) {
    const g = this.g;
    const list = J.all ? g.zombies.inRadius(c, 1e5, []) : g.zombies.inRadius(c, J.radius, []).filter((e) => Math.abs((e.z.pos.y || 0) + 1 - c.y) < J.dy);
    // (el Cuervo vuela aparte)
    const cz = g.crow?.z;
    if (cz?.active && !cz.dead && !list.some((e) => e.z === cz) && (J.all || cz.pos.distanceTo(c) < J.radius)) list.push({ z: cz, d: cz.pos.distanceTo(c) });
    return list.sort((a, b) => a.d - b.d);
  }

  // Suelta el Juicio alrededor del que lo tiene.
  detonate(st, sig) {
    const g = this.g;
    const p = g.player;
    const J = st.juicio;
    const up = st.upgraded ? 1 : 0;
    const c = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
    this.cd = J.cd;
    this.kick = 1.6;
    this.slam = 1;
    this.lastShot = g.time;
    g.net?.share('supremo', { k: 'j', p: r2(c), u: up });
    this.juicioFx(c, up, false, sig);
    // el golpe te levanta un poquito del piso
    if (p.onGround && !p.downed) {
      p.vel.y = Math.max(p.vel.y, 4.5);
      p.onGround = false;
    }
  }

  // Una columna de luz por muerto, cuando lo alcanza la ola (del más cerca al
  // más lejos: `far` es el más lejano). hurt: las propias pegan; las de otro
  // jugador solo se ven.
  strikes(list, far, up, J, hurt) {
    const g = this.g;
    list.forEach(({ z, d }, i) => {
      const delay = J.lead + (d / far) * J.wave;
      g.later(delay, () => {
        if (!z.active || z.dead) return;
        const at = new THREE.Vector3(z.pos.x, z.pos.y || 0, z.pos.z);
        const col = SIX[i % 6];
        this.fx?.pillar(at, col, up, 0.55 * (z.scale || 1) * (tough(z) ? 1.8 : 1));
        if (i < 8) g.fx.flash(tmpV.set(at.x, at.y + 1.5, at.z), col, 14, 0.3, 9);
        if (i < 6) this.sndPillar(at.clone(), up, i);
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * TAU;
          g.fx.add.spawn(at.x, at.y + 0.1, at.z, Math.cos(a) * (3 + Math.random() * 3), 0.6 + Math.random() * 1.5, Math.sin(a) * (3 + Math.random() * 3), { color: SIX_RGB[i % 6], size: 0.1, size1: 0, life: 0.45 + Math.random() * 0.3, drag: 2.5 });
        }
        if (tough(z)) this.smiteFx(z, up);
        if (!hurt) {
          if (!tough(z)) this.dissolveFx(z, up, i < 12 ? 3 : 2);
          return;
        }
        const dir = new THREE.Vector3(0, -1, 0);
        const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z);
        // a cualquier jefe lo aniquila (entities/Zombies.js annihilate)
        if (tough(z)) g.zombies.damage(z, 1e9, { type: 'juicio', dir, point });
        else {
          this.dissolveFx(z, up, i < 12 ? 4 : 2);
          g.zombies.damage(z, 1e9, { type: 'luz', dir, point });
        }
      });
    });
  }

  // Un jefe aniquilado: una columna enorme, el sol que revienta encima, polvo
  // de estrellas que sube y el trueno fuerte.
  smiteFx(z, up) {
    const g = this.g;
    const sc = z.scale || 1;
    const at = new THREE.Vector3(z.pos.x, z.pos.y || 0, z.pos.z);
    this.fx?.pillar(at, 0xfff2c0, up, 1.8 * sc);
    const mid = at.clone().setY(at.y + 1.6 * sc);
    this.fx?.sun(mid, up, 2.4 * sc);
    g.fx.flash(mid, PAL[up].hot, 50, 0.8, 24);
    for (let k = 0; k < 3; k++) this.vaporFx(z.pos, sc * 1.6, up, false);
    for (let i = 0; i < 70; i++) {
      tmpV.set(rnd(), Math.random() * 0.8 + 0.1, rnd()).normalize().multiplyScalar(4 + Math.random() * 9);
      g.fx.add.spawn(mid.x, mid.y, mid.z, tmpV.x, tmpV.y, tmpV.z, { color: i % 3 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.16, size1: 0, life: 0.8 + Math.random() * 0.6, drag: 1.4 });
    }
    g.fx.addShake(0.5);
    g.audio.thunder?.(mid.clone(), true);
  }

  // El Juicio (propio o de otro): el sello, la ola que barre todo el mapa (con
  // su muralla de luz), un sol que se abre en el cielo, las seis columnas que
  // suben, rayos por todo el mapa, una columna sobre cada muerto, el fogonazo
  // y el trueno (otro cuando la ola llega a la otra punta).
  juicioFx(c, up, ghost, sig = null) {
    const g = this.g;
    const J = weaponStats('supremo', up).juicio;
    const C = PAL[up];
    const floor = this.floorAt(tmpB.set(c.x, c.y - 1, c.z), new THREE.Vector3());
    const list = this.targets(c, J).slice(0, ghost ? 40 : 999);
    const far = Math.max(24, list.length ? list[list.length - 1].d + 4 : 0);
    // el sello: el de la carga (o uno nuevo, si es de otro) se queda un rato
    const s = sig || this.fx?.sigil(floor, J.sigil);
    if (s) {
      s.mesh.position.copy(floor);
      this.sigils.push({ s, t: 0, R: J.sigil });
    }
    this.fx?.wave(floor, far, J.wave, up ? 5 : 4);
    // (el sol en el pecho: solo lo ven los demás; el que tira quedaba adentro y encandilaba)
    if (ghost) this.fx?.sun(c, up, up ? 3.6 : 3);
    // el sol del cielo (el propio, adelante y arriba de la mira; el de otro, arriba de él)
    if (ghost) tmpV.set(c.x, c.y + 30, c.z);
    else tmpV.copy(g.camera.getWorldDirection(tmpA).setY(0).normalize()).multiplyScalar(40).add(c).setY(c.y + 22);
    this.fx?.sun(tmpV, up, up ? 3.6 : 3, false, 2.4);
    // las seis columnas de los easter eggs suben al cielo
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const base = new THREE.Vector3(floor.x + Math.cos(a) * 1.6, floor.y, floor.z + Math.sin(a) * 1.6);
      const topP = base.clone().add(tmpV.set(0, 40, 0));
      g.fx.beam(base, topP, { color: SIX[i], width: up ? 0.7 : 0.55, life: 1.2 });
      g.fx.beam(base, topP, { color: 0xffffff, width: 0.16, life: 1 });
    }
    // rayos que caen por todo el mapa
    for (let i = 0; i < 6; i++) {
      const tz = list[Math.floor(Math.random() * list.length)]?.z;
      const to = tz ? new THREE.Vector3(tz.pos.x, tz.pos.y || 0, tz.pos.z) : new THREE.Vector3(c.x + rnd() * far, floor.y, c.z + rnd() * far);
      const topP = new THREE.Vector3(to.x + rnd() * 10, to.y + 22 + Math.random() * 10, to.z + rnd() * 10);
      g.later(Math.random() * J.wave, () => g.fx.lightning(topP, to, SIX[i], 0.5));
    }
    g.fx.flash(c, C.hot, 45, 0.6, 30);
    if (g.weather) g.weather.flash = 1;
    // chispas en anillo y en esfera
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * TAU;
      const flat = i < 100;
      tmpV.set(Math.cos(a), flat ? (Math.random() - 0.3) * 0.25 : rnd() * 2, Math.sin(a)).normalize().multiplyScalar((flat ? 15 : 7) + Math.random() * 10);
      g.fx.add.spawn(c.x, c.y - 0.5 + Math.random() * 0.6, c.z, tmpV.x, tmpV.y, tmpV.z, { color: i % 3 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.15, size1: 0.01, life: 0.6 + Math.random() * 0.5, drag: 1.6 });
    }
    // de lejos se ve igual, pero sin encandilar tanto
    const d = g.player?.pos ? g.player.pos.distanceTo(c) : 0;
    const k = ghost ? Math.max(0.35, 1 - d / 60) : 1;
    g.fx.addShake(0.5 + 0.6 * k);
    this.whiteout(0.45 * k, up);
    g.post?.flash?.(0.15 * k * this.calm());
    this.strikes(list, far, up, J, !ghost);
    // la Gran Guerra del castillo (el duende no es un muerto del mapa): se
    // termina de un golpe (world/GranGuerra.js juicio; el invitado le avisa al anfitrión)
    const A = g.arena;
    if (!ghost && A?.juicio && A.active && A.phase !== 'won') {
      const N = A.gnome;
      if (N?.root?.visible) this.smiteFx({ pos: N.pos, scale: 1.4 }, up);
      if (!g.net?.guest) g.later(J.lead + 0.2, () => A.juicio());
      else g.net.net.send({ t: 'pee', a: 'gg', k: 'kill' });
    }
    this.sndJuicio(ghost ? c.clone() : null, up);
    g.audio.thunder?.(ghost ? c.clone() : null, true);
    // cuando la ola llega a la otra punta, retumba de nuevo
    g.later(J.lead + J.wave, () => {
      g.audio.thunder?.(null, true);
      g.fx.addShake(0.35);
    });
  }

  // (Menos destellos, en Opciones: todo lo que encandila, más suave)
  calm() {
    return this.g.settings?.calmFx ? 0.35 : 1;
  }

  whiteout(k, up) {
    k *= this.calm();
    if (k <= 0.02) return;
    const el = this.overlayEl();
    if (!el) return;
    this.flashK = Math.max(this.flashK, k);
    el.style.setProperty('--sup-a', up ? 'rgba(255, 170, 230, 0.7)' : 'rgba(255, 196, 90, 0.7)');
  }

  overlayEl() {
    if (this.overlay?.isConnected) return this.overlay;
    const root = this.g.root;
    if (!root) return null;
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% 55%, rgba(255,252,240,0.96), var(--sup-a, rgba(255,196,90,0.7)) 40%, rgba(90,40,0,0) 80%)';
    root.appendChild(el);
    this.overlay = el;
    return el;
  }

  // ---------------- el aura ----------------
  // Con el mate en la mano: el sello chico a tus pies, y el que se acerca lo
  // agarra un latigazo de luz, le cae una columna del cielo y se deshace en
  // chispas de oro con su forma.
  aura(dt, st) {
    const g = this.g;
    const p = g.player;
    const A = st.aura;
    const up = st.upgraded ? 1 : 0;
    if (!this.auraSig) this.auraSig = this.fx?.sigil(this.floorAt(p.pos, tmpV), A.radius);
    const s = this.auraSig;
    this.auraHit = Math.max(0, (this.auraHit || 0) - dt * 3);
    if (s) {
      if (p.onGround) this.floorAt(p.pos, s.mesh.position);
      else s.mesh.position.set(p.pos.x, s.mesh.position.y, p.pos.z);
      s.mesh.scale.setScalar(A.radius * 2 * (1 + Math.sin(g.time * 2.4) * 0.03 + this.auraHit * 0.12));
      const U = s.mesh.material.uniforms;
      U.uSpin.value = g.time * 0.5 + this.auraHit * 0.6;
      U.uK.value = Math.max(0, 0.62 - Math.sin(g.time * 3) * 0.08 - this.kick * 0.1 - this.auraHit * 0.5);
    }
    this.auraT -= dt;
    if (this.auraT > 0) return;
    this.auraT = A.tick;
    const c = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
    const chest = new THREE.Vector3(p.pos.x, p.pos.y + 1.15, p.pos.z);
    let n = 0;
    for (const { z } of g.zombies.inRadius(c, A.radius, [])) {
      if (Math.abs((z.pos.y || 0) + 1 - c.y) > 2.2) continue;
      const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.1 * (z.scale || 1), z.pos.z);
      const dir = new THREE.Vector3(z.pos.x - c.x, 0.4, z.pos.z - c.z).normalize();
      if (n < 5) {
        // el latigazo del aura, del pecho al muerto
        this.arc(chest, point, n % 2 ? SIX[(n * 2) % 6] : PAL[up].gold, up);
        this.fx?.sun(point, up, 0.7, true);
      }
      if (tough(z)) g.zombies.damage(z, this.hurt(z, A.boss, A.bossFrac), { type: 'explosive', dir, point });
      else {
        if (n < 5) {
          this.dissolveFx(z, up, n < 2 ? 7 : 4);
          this.fx?.pillar(new THREE.Vector3(z.pos.x, z.pos.y || 0, z.pos.z), n % 2 ? SIX[(n * 3) % 6] : 0xfff0c8, up, 0.5 * (z.scale || 1));
          if (n < 2) g.fx.flash(point, PAL[up].gold, 12, 0.3, 8);
        }
        g.zombies.damage(z, 1e9, { type: 'luz', dir, point });
      }
      if (n++ === 0) this.sndAura(point.clone(), up);
      this.auraHit = 1;
    }
  }

  releaseAura() {
    if (!this.auraSig) return;
    this.fx?.release(this.auraSig);
    this.auraSig = null;
  }

  // ---------------- el cargador que se llena solo ----------------
  regen(dt) {
    const s = this.slot();
    if (!s) return;
    const st = weaponStats('supremo', s.up);
    const R = st.regen;
    if (s.mag >= st.mag) {
      this.regenAcc = 0;
      return;
    }
    if ((this.w.slot === s && this.w.state === 'reload') || this.charge || this.g.time - this.lastShot < R.delay) return;
    this.regenAcc += R.rate * dt;
    if (this.regenAcc < 1) return;
    const n = Math.floor(this.regenAcc);
    this.regenAcc -= n;
    s.mag = Math.min(st.mag, s.mag + n);
    if (this.w.slot === s) this.w.updateHud();
  }

  // ---------------- la pose ----------------
  // (Weapons.animate) ¿Mueve el mate en la mano?
  posing(state) {
    return state === 'reload' || this.chargeK > 0.01 || this.slam > 0.01;
  }

  // [x, y, z, rx, ry, rz]: la recarga, o levantarlo al cielo en el Juicio y
  // bajarlo de golpe al soltarlo.
  pose(state, k, t) {
    if (state === 'reload') return this.reloadPose(k, t);
    const e = sstep(this.chargeK);
    const s = this.slam;
    const shake = Math.sin(t * 63) * 0.012 * e;
    return [-0.09 * e, 0.11 * e - 0.05 * s, 0.03 * e - 0.04 * s, 0.8 * e - 0.4 * s + shake, 0.08 * e, -0.16 * e + shake * 0.5];
  }

  // La recarga: la levanta al medio mostrando la boca, tiembla mientras se
  // traga las reliquias, el estallido la empuja para atrás y vuelve.
  reloadPose(k, t) {
    const up = sstep(k / RL_UP) * (1 - sstep((k - RL_DOWN) / (1 - RL_DOWN)));
    const charge = clamp01((k - RL_UP) / (IGNITE - RL_UP));
    const hum = up * charge * charge * (k < IGNITE ? 1 : 0);
    const boom = bump(k, IGNITE + 0.03, 0.07);
    const sway = Math.sin(k * Math.PI * 2) * up;
    return [
      -0.12 * up + Math.sin(t * 61) * 0.005 * hum,
      0.1 * up + Math.sin(t * 47 + 1) * 0.005 * hum + charge * up * 0.022 - boom * 0.02,
      0.05 * up - boom * 0.08,
      0.62 * up - boom * 0.4 + Math.sin(t * 73) * 0.025 * hum,
      0.15 * up + sway * 0.12,
      -0.2 * up + sway * 0.05 + boom * 0.12,
    ];
  }

  // Lo que se ve de la recarga (cada cuadro, con el mate en la mano).
  reloadFx(S, k, dt, up) {
    const g = this.g;
    const R = this.rl;
    const charge = clamp01((k - RL_UP) / (IGNITE - RL_UP));
    const open = sstep(k / RL_UP) * (k < IGNITE ? 1 - charge * 0.5 : 1 - sstep((k - IGNITE) / 0.2));
    // las reliquias: una por una a la boca; en el estallido salen todas
    for (let i = 0; i < 6; i++) {
      const was = S.into[i];
      S.into[i] = k < IGNITE ? clamp01((k - RELIC_IN(i)) / RELIC_FLY) : 1 - sstep((k - IGNITE) / 0.14);
      if (k < IGNITE && was < 1 && S.into[i] >= 1) {
        // entró: el sol se tiñe de su color
        S.pulse.material.color.set(SIX[i]).multiplyScalar(2.2);
        S.pulse.material.opacity = 1;
        this.kick = Math.max(this.kick, 0.5);
      }
    }
    // el eclipse: el sol se tapa (queda la corona alrededor)
    const ecl = sstep((k - 0.3) / 0.3) * (k < IGNITE ? 1 : 1 - sstep((k - IGNITE) / 0.05));
    S.eclipse.visible = ecl > 0.02;
    S.eclipse.scale.setScalar(0.6 + ecl * 0.5);
    const spin = k < IGNITE ? 1.2 + charge * 5 : 4 * (1 - sstep((k - IGNITE) / 0.25)) + 1;
    animateSupremo(S, dt, g.time, { speed: spin, open, kick: 0, lift: charge });
    S.corona.scale.setScalar(CORONA_S * (1 + ecl * 1.6));
    // el sol vuelve a salir, enorme
    if (k >= IGNITE) {
      const a = 1 - sstep((k - IGNITE) / 0.22);
      S.core.scale.setScalar(1 + a * 1.6);
      S.rays.scale.setScalar(RAYS_S * (1 + a * 1.8));
      S.rays.material.rotation += dt * a * 8;
    } else {
      S.core.scale.setScalar(1 - ecl * 0.3);
      S.rays.scale.setScalar(RAYS_S * (1 - ecl * 0.6));
    }
    const U = S.P.body.uniforms;
    U.uDim.value = 1 - ecl * 0.8;
    U.uKick.value = k >= IGNITE ? (1 - sstep((k - IGNITE) / 0.3)) * 3 : charge * 0.4;
    R.glow = k < IGNITE ? charge : Math.max(0, 1 - (k - IGNITE) / 0.2);
    // el oro de alrededor se mete en la boca (en el mundo, hacia la punta)
    const at = this.w.model?.muzzle ? this.w.muzzleWorld(R.sink) : null;
    if (at && k > RL_UP * 0.6 && k < IGNITE) {
      // (salen de adelante de la cámara: pegadas a la cara se verían como manchones)
      const fwd = g.camera.getWorldDirection(tmpA);
      const n = 2 + Math.floor(charge * 5);
      for (let i = 0; i < n; i++) {
        tmpV.set(rnd(), rnd() * 0.8, rnd()).normalize().multiplyScalar(1.2 + Math.random() * 1.6).addScaledVector(fwd, 3);
        g.fx.add.spawn(at.x + tmpV.x, at.y + tmpV.y, at.z + tmpV.z, tmpV.y * 2, -tmpV.x * 2, tmpV.z, { color: i % 2 ? GOLD_RGB[i % 3] : SIX_RGB[(i + Math.floor(g.time * 7)) % 6], size: 0.016 + charge * 0.012, size1: 0.005, life: 0.9, attract: R.sink });
      }
      g.fx.addShake(dt * charge * 0.5);
    }
    // el amanecer: una vez por recarga
    if (k >= IGNITE && !R.lit) {
      R.lit = true;
      this.kick = 2;
      this.whiteout(0.4, up);
      g.fx.addShake(0.5);
      if (at) {
        g.fx.flash(at, PAL[up].hot, 26, 0.4, 12);
        this.fx?.sun(at, up, up ? 0.62 : 0.5);
        for (let i = 0; i < 48; i++) {
          tmpV.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(3 + Math.random() * 5);
          g.fx.add.spawn(at.x, at.y, at.z, tmpV.x, tmpV.y, tmpV.z, { color: i % 2 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.06, size1: 0, life: 0.45 + Math.random() * 0.3, drag: 2.4 });
        }
      }
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const p = g.player;
    TIME.value = g.time;
    this.fx?.update(dt, g.time);
    this.cd = Math.max(0, this.cd - dt);
    this.kick = Math.max(0, this.kick - dt * 4);
    this.slam = Math.max(0, this.slam - dt * 3);
    this.regen(dt);
    const st = this.stats;
    // la carga del Juicio
    const c = this.charge;
    if (c) {
      if (!st || !p.alive || p.downed || !['idle', 'raise'].includes(this.w.state)) this.cancelCharge(true);
      else {
        c.t += dt;
        const k = Math.min(1, c.t / c.dur);
        if (c.sig) {
          if (p.onGround) this.floorAt(p.pos, c.sig.mesh.position);
          c.sig.mesh.scale.setScalar(2 * (0.6 + ease(k) * (st.juicio.sigil - 0.6)));
          c.sig.mesh.material.uniforms.uSpin.value += dt * (1 + k * 6);
          c.sig.mesh.material.uniforms.uK.value = 0.3 - k * 0.3;
        }
        // lo de alrededor se chupa hacia el sol
        const pos = this.w.model?.muzzle ? this.w.muzzleWorld(tmpB) : null;
        if (pos) {
          for (let i = 0; i < 3; i++) {
            tmpV.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(0.8 + Math.random() * 0.6);
            g.fx.add.spawn(pos.x + tmpV.x, pos.y + tmpV.y, pos.z + tmpV.z, -tmpV.x * 2.2, -tmpV.y * 2.2, -tmpV.z * 2.2, { color: SIX_RGB[(i + Math.floor(c.t * 20)) % 6], size: 0.03, size1: 0.005, life: 0.38 });
          }
        }
        g.fx.addShake(dt * 0.7);
        if (c.t >= c.dur) {
          this.charge = null;
          this.detonate(c.st, c.sig);
        }
      }
    }
    this.chargeK = this.charge ? Math.min(1, this.charge.t / this.charge.dur) : Math.max(0, this.chargeK - dt * 5);
    // los sellos del Juicio se apagan
    for (let i = this.sigils.length - 1; i >= 0; i--) {
      const it = this.sigils[i];
      it.t += dt;
      const U = it.s.mesh.material.uniforms;
      U.uSpin.value += dt * Math.max(0.3, 3 - it.t * 3);
      U.uK.value = clamp01((it.t - 0.4) / 1.1);
      it.s.mesh.scale.setScalar(2 * it.R * (1 + ease(Math.min(1, it.t / 0.3)) * 0.25));
      if (it.t > 1.5) {
        this.fx?.release(it.s);
        this.sigils.splice(i, 1);
      }
    }
    // el aura (con el mate en la mano, de pie)
    if (st && p.alive && !p.downed && !g.paused) this.aura(dt, st);
    else this.releaseAura();
    // el mate en la mano
    const m = this.w.model?.sup ? this.w.model : null;
    const R = this.rl;
    if (m) {
      const S = m.sup;
      if (R.seen !== S) {
        // otro modelo (mejorado o no): arranca con las reliquias en órbita
        R.seen = S;
        S.into.fill(0);
        S.eclipse.visible = false;
      }
      if (this.w.state === 'reload') this.reloadFx(S, Math.min(1, this.w.stateT / (this.w.reloadTime || 1)), dt, m.upgraded ? 1 : 0);
      else {
        R.lit = false;
        R.glow = Math.max(0, R.glow - dt * 4);
        this.inspectK += ((this.w.state === 'inspect' ? 1 : 0) - this.inspectK) * Math.min(1, dt * 5);
        for (let i = 0; i < 6; i++) S.into[i] = Math.max(0, S.into[i] - dt * 6);
        S.eclipse.visible = false;
        animateSupremo(S, dt, g.time, { speed: 1 + this.kick * 2.5 + this.chargeK * 7 - this.inspectK * 0.6, open: this.chargeK * 1.2 + this.inspectK * 0.8, kick: this.kick * 0.5, lift: this.chargeK });
        const U = S.P.body.uniforms;
        U.uDim.value = 1;
        U.uKick.value = this.kick * 0.6 + this.chargeK * 1.5;
      }
    }
    // el fogonazo en pantalla se apaga
    if (this.flashK > 0) {
      this.flashK = Math.max(0, this.flashK - dt * 2.2);
      if (this.overlay) this.overlay.style.opacity = String(Math.min(1, this.flashK));
    }
    // (la carga y la recarga también tiñen los bordes)
    if (this.overlay) {
      const glow = Math.max(this.chargeK, R.glow * 0.8) * this.calm();
      this.overlay.style.boxShadow = glow > 0.01 ? `inset 0 0 ${80 + glow * 140}px ${glow * 40}px rgba(255, 190, 80, ${0.35 * glow})` : '';
    }
  }

  // ---------------- en línea ----------------
  ghost(m) {
    if (m.k === 's' && m.a && m.b) {
      const chain = Array.isArray(m.c) ? m.c.slice(0, 10).map((q) => new THREE.Vector3().fromArray(q)) : [];
      this.shotFx(new THREE.Vector3().fromArray(m.a), new THREE.Vector3().fromArray(m.b), m.u ? 1 : 0, chain, !!m.x, true);
    } else if (m.k === 'j' && m.p) this.juicioFx(new THREE.Vector3().fromArray(m.p), m.u ? 1 : 0, true);
  }

  clear() {
    this.cancelCharge(false);
    this.releaseAura();
    for (const it of this.sigils) this.fx?.release(it.s);
    this.sigils.length = 0;
    this.fx?.clear();
    this.flashK = 0;
    this.chargeK = 0;
    this.slam = 0;
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      this.overlay.style.boxShadow = '';
    }
  }

  // ---------------- lo que se escucha ----------------
  // El tiro: un zumbido que baja, un acorde de coro cortito y el golpe.
  sndShot(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: pos ? 0.7 : 0.55, reverb: 0.3 });
    const f = up ? 1400 : 1200;
    A.tone(o, { dur: 0.14, freq: f, freqEnd: f * 0.32, gain: 0.11, attack: 0.002 });
    A.tone(o, { dur: 0.1, type: 'triangle', freq: f * 2, freqEnd: f * 1.3, gain: 0.035 });
    const chord = up ? [523, 659, 784, 1046] : [523, 659, 784];
    const lift = 1 + (this.shotN = ((this.shotN || 0) + 1) % 6) * 0.02;
    chord.forEach((fr, i) => A.tone(o, { t: A.now + 0.004 * i, dur: 0.28, freq: fr * lift, gain: 0.018, attack: 0.006, detune: i % 2 ? 7 : -7 }));
    A.noise(o, { dur: 0.05, type: 'highpass', freq: 5600, gain: 0.16 });
    A.tone(o, { dur: 0.13, freq: 120, freqEnd: 44, gain: 0.3 });
  }

  // El sol donde pega: un soplido caliente y campanitas.
  sndBurst(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.7, reverb: 0.35, ref: 4 });
    A.noise(o, { dur: 0.35, freq: 1500, freqEnd: 200, gain: 0.45, attack: 0.004 });
    A.tone(o, { dur: 0.28, freq: 260, freqEnd: 60, gain: 0.22 });
    for (let i = 0; i < 3; i++) A.tone(o, { t: A.now + 0.03 + i * 0.05, dur: 0.3, freq: (up ? 1568 : 1319) * (1 + i * 0.26), gain: 0.018 });
  }

  // La carga del Juicio: un coro que sube y viento (se corta si se cancela).
  sndCharge(dur) {
    const A = this.g.audio;
    if (!A?.ctx) return null;
    const o = A.out({ gain: 0.75, reverb: 0.4 });
    [131, 196, 262, 330, 392].forEach((f, i) => {
      A.tone(o, { dur: dur + 0.08, type: i < 2 ? 'sawtooth' : 'triangle', freq: f, freqEnd: f * 2, gain: i < 2 ? 0.03 : 0.05, attack: dur * 0.6, detune: i % 2 ? 9 : -9 });
    });
    A.noise(o, { dur: dur + 0.08, type: 'bandpass', freq: 500, freqEnd: 4800, q: 1.3, gain: 0.25, attack: dur * 0.8 });
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

  // El Juicio: un golpe hondo, el soplido, un acorde mayor enorme que se
  // abre y una cascada de campanas.
  sndJuicio(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 1, reverb: 0.55, ref: 9 });
    const t = A.now;
    A.tone(o, { dur: 2.2, freq: 80, freqEnd: 22, gain: 0.8, attack: 0.004 });
    A.tone(o, { dur: 1.3, type: 'triangle', freq: 170, freqEnd: 38, gain: 0.3 });
    A.noise(o, { dur: 1.6, freq: 2400, freqEnd: 140, gain: 0.9, brown: true, attack: 0.003 });
    A.noise(o, { t: t + 0.05, dur: 2.8, type: 'highpass', freq: 6500, freqEnd: 3000, gain: 0.14, attack: 0.3 });
    const chord = up ? [262, 330, 392, 523, 659, 784, 1046] : [262, 330, 392, 523, 659, 784];
    chord.forEach((f, i) => A.tone(o, { t: t + 0.06 + i * 0.025, dur: 3, freq: f, gain: 0.03, attack: 0.05, detune: i % 2 ? 6 : -6 }));
    const bells = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637];
    bells.forEach((f, i) => A.tone(o, { t: t + 0.15 + i * 0.07, dur: 0.9, freq: f, gain: 0.02, attack: 0.003 }));
    // la ola que se va por todo el mapa: un rugido que se aleja y un coro que se abre
    A.noise(o, { t: t + 0.1, dur: 1.9, type: 'bandpass', freq: 180, freqEnd: 2600, q: 0.8, gain: 0.5, attack: 0.2 });
    [131, 196, 262, 392].forEach((f, i) => A.tone(o, { t: t + 0.2, dur: 3.8, type: 'sawtooth', freq: f, gain: 0.014, attack: 0.9, detune: i % 2 ? 8 : -8 }));
    A.tone(o, { t: t + 0.05, dur: 3, freq: 41, freqEnd: 30, gain: 0.5, attack: 0.05 });
  }

  // Cada columna que cae: un soplido que baja y su nota (seis notas, una por reliquia).
  sndPillar(pos, up, i) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.6, reverb: 0.45, ref: 5 });
    A.noise(o, { dur: 0.4, type: 'bandpass', freq: 2400, freqEnd: 300, q: 0.9, gain: 0.35, attack: 0.005 });
    const notes = [784, 880, 1047, 1175, 1319, 1568];
    A.tone(o, { dur: 0.6, freq: notes[i % 6] * (up ? 1.5 : 1), gain: 0.03, attack: 0.004 });
  }

  // El aura: un chasquido tibio.
  sndAura(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.55, reverb: 0.3 });
    A.noise(o, { dur: 0.22, freq: 2200, freqEnd: 400, gain: 0.3 });
    A.tone(o, { dur: 0.3, freq: up ? 1568 : 1319, freqEnd: up ? 2093 : 1760, gain: 0.025 });
  }

  // La recarga: el chupón, un zumbido de eclipse con una nota por cada
  // reliquia que entra, y el amanecer (acorde, coro y trueno).
  reloadSound(dur) {
    const g = this.g;
    const A = g.audio;
    const id = ++this.rl.id;
    this.rl.lit = false;
    if (!A?.ctx) return null;
    const up = this.stats?.upgraded ? 1 : 0;
    const o = A.out({ gain: 0.8, reverb: 0.45 });
    const t0 = A.now;
    const tu = t0 + dur * RL_UP;
    const ti = t0 + dur * IGNITE;
    A.noise(o, { dur: dur * RL_UP + 0.1, type: 'bandpass', freq: 3000, freqEnd: 280, q: 1.6, gain: 0.33, attack: 0.02 });
    A.tone(o, { dur: dur * RL_UP + 0.1, freq: 600, freqEnd: 110, gain: 0.1 });
    // el eclipse: un zumbido hondo que sube
    A.tone(o, { t: tu, dur: ti - tu, type: 'sawtooth', freq: 55, freqEnd: 110, gain: 0.045, attack: 0.1 });
    A.tone(o, { t: tu, dur: ti - tu, freq: 110, freqEnd: 440, gain: 0.07, attack: 0.1 });
    A.noise(o, { t: tu, dur: ti - tu, type: 'bandpass', freq: 400, freqEnd: 4200, q: 1.1, gain: 0.2, attack: (ti - tu) * 0.85 });
    // una nota por reliquia (la pentatónica de los seis)
    const notes = [784, 880, 1047, 1175, 1319, 1568];
    for (let i = 0; i < 6; i++) A.tone(o, { t: t0 + dur * (RELIC_IN(i) + RELIC_FLY), dur: 0.5, freq: notes[i] * (up ? 1.5 : 1), gain: 0.035, attack: 0.003 });
    // el amanecer
    A.tone(o, { t: ti, dur: 1.2, freq: 100, freqEnd: 28, gain: 0.55, attack: 0.003 });
    A.noise(o, { t: ti, dur: 1, freq: 3200, freqEnd: 200, gain: 0.6, brown: true, attack: 0.003 });
    const chord = up ? [262, 392, 523, 659, 784, 1046] : [262, 330, 392, 523, 659, 784];
    chord.forEach((f, i) => A.tone(o, { t: ti + 0.03 + i * 0.025, dur: 1.6, freq: f, gain: 0.032, attack: 0.03, detune: i % 2 ? 6 : -6 }));
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
}
