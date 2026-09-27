import * as THREE from 'three';
import { VM } from './viewmodels';

// Lo que se ve en la mano con los mates de la luz (weapons/Elementales.js)
// además del mate: la mano izquierda que entra a hacer cosas, las chispas,
// llamas, vapores y copos (un solo THREE.Points), los rayitos (cintas que
// miran a la cámara) y las astillas de hielo. Con eso, la coreografía de la
// recarga y de la inspección de cada mate:
//  · Pillán: lo acerca a la cara y sopla las brasas (tres soplidos, la mano
//    le hace de reparo), chasquea los dedos, un anillo de fuego le da la
//    vuelta y se lo traga la boca, y lo asienta de un golpe.
//  · Zonda: el dedo le da un toque a la turbina, la mano le tapa la boca
//    mientras lo revuelve y el viento entra girando, lo destapa (¡pop!) y el
//    mate gira solo en la palma.
//  · Illapa: tres golpecitos con el dedo en la bombilla (cada uno un rayito),
//    el dedo baja por la bombilla cargándola, se suelta de un tirón y el arco
//    salta al cristal; la mano queda temblando.
//  · Penitente: la mano lo agarra, le pega un cachetazo y la escarcha salta
//    en astillas, le pasa la mano y las agujas vuelven a crecer una por una.
// Las inspecciones son más largas (y cuentan otra cosa: la quena del Zonda,
// la llamita en la palma del Pillán, la bola de plasma del Illapa, el dibujo
// en la escarcha del Penitente). Los sonidos de cada paso los pone
// weapons/elementalSounds.js (cue) en el cuadro en que pasa.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmp2 = new THREE.Vector2();
const tmpE = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const bump = (k, c, w) => smooth(1 - Math.abs(k - c) / w);
const EASE = { io: smooth, i: (u) => u * u * u, o: (u) => 1 - (1 - u) ** 3, l: (u) => u };

// ---------------- la mano izquierda ----------------
// Armada con la palma para abajo, los dedos hacia -z y el pulgar hacia +x.
// Cada dedo es una cadena de tres articulaciones que se doblan (curl).
const FINGERS = [
  { x: 0.025, len: [0.025, 0.017, 0.014], r: 0.0082, spread: -0.08 },
  { x: 0.0085, len: [0.028, 0.019, 0.015], r: 0.0086, spread: -0.02 },
  { x: -0.0085, len: [0.026, 0.018, 0.014], r: 0.0082, spread: 0.03 },
  { x: -0.024, len: [0.021, 0.014, 0.012], r: 0.0072, spread: 0.09 },
];
const THUMB = { len: [0.024, 0.02, 0.017], r: 0.0098 };
// cuánto dobla cada dedo [índice, medio, anular, meñique, pulgar]
const POSES = {
  open: [0.12, 0.1, 0.12, 0.16, 0.05],
  relax: [0.45, 0.55, 0.62, 0.7, 0.3],
  cup: [0.5, 0.55, 0.6, 0.66, 0.3],
  point: [0.02, 1.45, 1.5, 1.5, 0.85],
  fist: [1.45, 1.5, 1.5, 1.5, 0.95],
  snap0: [0.95, 0.35, 1.25, 1.35, 0.55],
  snap1: [0.95, 1.6, 1.25, 1.35, 0.15],
  flick0: [1.25, 1.45, 1.5, 1.5, 1.0],
  claw: [0.8, 0.85, 0.9, 0.95, 0.5],
  flat: [0, 0, 0, 0, 0],
};

function capsule(len, r, mat) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8).rotateX(-Math.PI / 2).translate(0, 0, -len / 2), mat);
}

function nailOn(parent, len, r, M) {
  const n = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 8, 6), M.nail);
  n.scale.set(1.1, 0.35, 1.3);
  n.position.set(0, r * 0.62, -len + r * 0.1);
  parent.add(n);
}

function buildHand(M) {
  const root = new THREE.Group();
  root.visible = false;
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), M.skin);
  palm.scale.set(0.041, 0.0155, 0.05);
  palm.position.set(0, 0, -0.012);
  root.add(palm);
  const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.046, 4, 10).rotateZ(Math.PI / 2), M.skin);
  ridge.position.set(0, 0.001, -0.05);
  root.add(ridge);
  const fingers = FINGERS.map((f) => {
    const joints = [];
    let parent = root;
    let z = -0.055;
    f.len.forEach((L, i) => {
      const j = new THREE.Group();
      j.position.set(i === 0 ? f.x : 0, 0, z);
      parent.add(j);
      j.add(capsule(L, f.r * (1 - i * 0.07), M.skin));
      joints.push(j);
      parent = j;
      z = -L;
    });
    nailOn(parent, f.len[2], f.r * 0.86, M);
    const tip = new THREE.Object3D();
    tip.position.z = -f.len[2] - f.r * 0.6;
    parent.add(tip);
    return { joints, tip, spread: f.spread };
  });
  // el pulgar: sale del costado de la palma, hacia adelante y abajo
  const base = new THREE.Group();
  base.position.set(0.032, -0.008, -0.004);
  base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0.62, -0.3, -0.72).normalize());
  root.add(base);
  const thumb = [];
  let parent = base;
  let z = 0;
  THUMB.len.forEach((L, i) => {
    const j = new THREE.Group();
    j.position.z = z;
    parent.add(j);
    j.add(capsule(L, THUMB.r * (1 - i * 0.06), M.skin));
    thumb.push(j);
    parent = j;
    z = -L;
  });
  nailOn(parent, THUMB.len[2], THUMB.r * 0.85, M);
  // el antebrazo va aparte: sale de la muñeca y apunta siempre al hombro
  // (abajo a la izquierda, afuera de cuadro), como un brazo de verdad
  const arm = new THREE.Group();
  arm.visible = false;
  arm.add(VM.limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.03, 0), 0.02, M.skin));
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.01, 8, 18).rotateX(Math.PI / 2), M.cuff);
  roll.position.y = 0.034;
  arm.add(roll);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.038, 1, 16, 1, true).translate(0, 0.5, 0), M.sleeve);
  sleeve.position.y = 0.034;
  arm.add(sleeve);
  root.traverse((o) => {
    o.frustumCulled = false;
  });
  arm.traverse((o) => {
    o.frustumCulled = false;
  });
  return { root, arm, sleeve, fingers, thumb, curls: POSES.relax.slice() };
}

// El hombro izquierdo en la escena de la mano (de ahí sale la manga).
const SHOULDER = new THREE.Vector3(-0.25, -0.36, -0.03);
const WRIST = new THREE.Vector3(0, -0.002, 0.032);

function setCurls(H, c) {
  H.fingers.forEach((F, i) => {
    const k = c[i];
    F.joints[0].rotation.set(-k * 0.95, F.spread * (1 - k * 0.6), 0);
    F.joints[1].rotation.x = -k * 1.15;
    F.joints[2].rotation.x = -k * 0.8;
  });
  const k = c[4];
  H.thumb[0].rotation.set(-k * 0.35, k * 0.55, 0);
  H.thumb[1].rotation.set(-k * 0.6, k * 0.2, 0);
  H.thumb[2].rotation.x = -k * 0.7;
}

// ---------------- partículas (un solo THREE.Points) ----------------
const P_VERT = /* glsl */ `
uniform float uScale;
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.02, -mv.z);
  vA = aAlpha;
  vC = aColor;
}`;
const P_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vA * pow(max(0.0, 1.0 - r), 1.6);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC, a);
}`;

class Sparks {
  constructor(parent, n = 260) {
    this.n = n;
    this.list = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.01, s1: 0.01, a0: 1, c: [1, 1, 1], drag: 0, grav: 0, orbit: null, seek: null, fade: 'out' }));
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 500 } }, vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    // (hasta que haya algo: ni una llamada de dibujo)
    this.points.visible = false;
    g.setDrawRange(0, 0);
    parent.add(this.points);
    this.alive = 0;
  }

  // o: { vel, life, size, size1, alpha, color, drag, grav, orbit, seek, fade }
  spawn(p, o) {
    let s = null;
    for (let i = 0; i < this.n; i++) {
      const c = this.list[(this.next + i) % this.n];
      if (c.life <= 0) {
        s = c;
        this.next = (this.next + i + 1) % this.n;
        break;
      }
    }
    if (!s) {
      s = this.list[this.next];
      this.next = (this.next + 1) % this.n;
    }
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    const v = o.vel;
    s.vx = v ? v.x : 0;
    s.vy = v ? v.y : 0;
    s.vz = v ? v.z : 0;
    s.life = s.max = o.life ?? 0.5;
    s.s0 = o.size ?? 0.01;
    s.s1 = o.size1 ?? s.s0;
    s.a0 = o.alpha ?? 1;
    s.c = o.color || [1, 1, 1];
    s.drag = o.drag ?? 0;
    s.grav = o.grav ?? 0;
    s.orbit = o.orbit || null;
    s.seek = o.seek || null;
    s.fade = o.fade || 'out';
    return s;
  }

  update(dt, cam, fov, height) {
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
    let n = 0;
    for (const s of this.list) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      if (s.orbit) {
        // gira alrededor de un objeto (en su espacio) y se cierra o se abre
        const O = s.orbit;
        O.a += O.w * dt;
        O.y += (O.vy || 0) * dt;
        O.r = Math.max(0, O.r + (O.vr || 0) * dt);
        tmpV.set(Math.cos(O.a) * O.r, O.y, Math.sin(O.a) * O.r);
        O.obj.localToWorld(tmpV);
        s.x = tmpV.x;
        s.y = tmpV.y;
        s.z = tmpV.z;
      } else {
        if (s.seek) {
          // la chupa algo (una boca que se mueve con el mate)
          const T = s.seek.fn(tmpW);
          const k = Math.min(1, s.seek.k * dt);
          s.vx += (T.x - s.x) * k * 10 - s.vx * k;
          s.vy += (T.y - s.y) * k * 10 - s.vy * k;
          s.vz += (T.z - s.z) * k * 10 - s.vz * k;
        }
        const d = Math.max(0, 1 - s.drag * dt);
        s.vx *= d;
        s.vy = s.vy * d - s.grav * dt;
        s.vz *= d;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
      }
      const u = 1 - s.life / s.max;
      const i3 = n * 3;
      this.pos[i3] = s.x;
      this.pos[i3 + 1] = s.y;
      this.pos[i3 + 2] = s.z;
      this.col[i3] = s.c[0];
      this.col[i3 + 1] = s.c[1];
      this.col[i3 + 2] = s.c[2];
      const a = s.fade === 'inout' ? Math.sin(Math.min(1, u) * Math.PI) : s.fade === 'flicker' ? (1 - u) * (0.6 + Math.random() * 0.4) : 1 - u * u;
      this.alpha[n] = s.a0 * a;
      this.size[n] = s.s0 + (s.s1 - s.s0) * u;
      n++;
    }
    this.alive = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aAlpha', 'aSize']) g.attributes[k].needsUpdate = n > 0;
    this.points.visible = n > 0;
  }

  clear() {
    for (const s of this.list) s.life = 0;
  }
}

// ---------------- rayitos: cintas que miran a la cámara ----------------
class Bolts {
  constructor(parent, max = 220) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 3);
    const idx = [];
    for (let i = 0; i < max; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.visible = false;
    g.setDrawRange(0, 0);
    parent.add(this.mesh);
    this.n = 0;
    this.pts = Array.from({ length: 16 }, () => new THREE.Vector3());
  }

  begin() {
    this.n = 0;
  }

  quad(a, b, w, c) {
    if (this.n >= this.max) return;
    // de costado a la cámara (que está en el origen de la escena de la mano)
    const mid = tmpA.addVectors(a, b).multiplyScalar(0.5);
    const side = tmpB.subVectors(b, a).cross(mid).normalize().multiplyScalar(w / 2);
    const i = this.n * 12;
    const P = this.pos;
    P[i] = a.x - side.x;
    P[i + 1] = a.y - side.y;
    P[i + 2] = a.z - side.z;
    P[i + 3] = a.x + side.x;
    P[i + 4] = a.y + side.y;
    P[i + 5] = a.z + side.z;
    P[i + 6] = b.x - side.x;
    P[i + 7] = b.y - side.y;
    P[i + 8] = b.z - side.z;
    P[i + 9] = b.x + side.x;
    P[i + 10] = b.y + side.y;
    P[i + 11] = b.z + side.z;
    for (let k = 0; k < 4; k++) this.col.set(c, i + k * 3);
    this.n++;
  }

  // Un rayo quebrado de a hasta b (se rehace cada cuadro: titila solo).
  bolt(a, b, { width = 0.0016, color = [1, 0.95, 0.6], jag = 0.12, n = 7, glow = true } = {}) {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const dir = tmpV.subVectors(b, a).divideScalar(len);
    const s1 = tmpW.set(-dir.y, dir.x, 0);
    if (s1.lengthSq() < 1e-6) s1.set(1, 0, 0);
    s1.normalize();
    const s2 = new THREE.Vector3().crossVectors(dir, s1);
    const P = this.pts;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const amp = Math.sin(u * Math.PI) * len * jag;
      P[i].lerpVectors(a, b, u).addScaledVector(s1, (Math.random() - 0.5) * 2 * amp).addScaledVector(s2, (Math.random() - 0.5) * 2 * amp);
    }
    const dim = [color[0] * 0.28, color[1] * 0.28, color[2] * 0.28];
    for (let i = 0; i < n; i++) {
      if (glow) this.quad(P[i], P[i + 1], width * 4, dim);
      this.quad(P[i], P[i + 1], width, color);
    }
  }

  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 6);
    g.attributes.position.needsUpdate = this.n > 0;
    g.attributes.color.needsUpdate = this.n > 0;
    this.mesh.visible = this.n > 0;
  }
}

// ---------------- astillas de hielo ----------------
class Shards {
  constructor(parent, n = 30) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xdcf2ff, roughness: 0.08, emissive: 0x3a8ad0, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 });
    const geo = new THREE.OctahedronGeometry(1, 0);
    this.list = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      parent.add(m);
      return { m, life: 0, max: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3(), s: 0.005 };
    });
  }

  spawn(p, vel, s = 0.005) {
    const S = this.list.find((x) => x.life <= 0) || this.list[0];
    S.life = S.max = 0.7 + Math.random() * 0.4;
    S.m.position.copy(p);
    S.vel.copy(vel);
    S.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    S.s = s;
    S.m.visible = true;
  }

  update(dt) {
    for (const S of this.list) {
      if (S.life <= 0) continue;
      S.life -= dt;
      S.vel.y -= 1.6 * dt;
      S.m.position.addScaledVector(S.vel, dt);
      S.m.rotation.x += S.spin.x * dt;
      S.m.rotation.y += S.spin.y * dt;
      S.m.rotation.z += S.spin.z * dt;
      const k = Math.min(1, S.life / S.max / 0.3);
      S.m.scale.set(S.s * 0.6 * k, S.s * 1.6 * k, S.s * 0.6 * k);
      if (S.life <= 0) S.m.visible = false;
    }
  }

  clear() {
    for (const S of this.list) {
      S.life = 0;
      S.m.visible = false;
    }
  }
}

// ---------------- las coreografías ----------------
// Mano derecha (la del mate): claves [u, [x, y, z, rx, ry, rz, bajar], curva]
// que se suman a la pose de Weapons. Mano izquierda: claves
// [u, dónde, [dx, dy, dz], [giro x, y, z], pose, contacto, curva]: dónde es un
// punto del mate (o 'off', afuera de cuadro); con contacto 'tip' la punta del
// índice va a ese punto, con 'palm' la palma. u es la fracción de la recarga
// (0 a 1) o los segundos de la inspección.
const Z7 = [0, 0, 0, 0, 0, 0, 0];
const OFF = ['off', [0, 0, 0], [0.9, -0.3, 0.4], 'relax'];
const off = (u, ease = 'io') => [u, ...OFF, null, ease];

const CHOREO = {
  fuego: {
    reload: {
      right: [
        [0, Z7],
        [0.12, [-0.075, 0.055, 0.075, 0.62, -0.15, 0.22, 0], 'o'],
        [0.56, [-0.085, 0.05, 0.085, 0.66, -0.1, 0.26, 0]],
        [0.62, [-0.07, 0.075, 0.06, 0.42, 0.05, 0.1, 0], 'o'],
        [0.78, [-0.06, 0.065, 0.05, 0.3, 0.6, 0.05, 0]],
        [0.83, [-0.05, 0.03, 0.04, 0.12, 0.5, 0, 0], 'i'],
        [0.87, [-0.05, 0.045, 0.045, 0.18, 0.45, 0.02, 0], 'o'],
        [1, Z7],
      ],
      hand: [
        off(0),
        off(0.12),
        [0.2, 'mouth', [-0.05, -0.015, 0.005], [1.2, 0.15, Math.PI / 2], 'cup', null],
        [0.54, 'mouth', [-0.05, -0.015, 0.005], [1.2, 0.15, Math.PI / 2], 'cup', null],
        [0.575, 'mouth', [-0.05, -0.008, 0.008], [1.25, 0.05, Math.PI / 2], 'snap0', null],
        [0.6, 'mouth', [-0.05, -0.008, 0.008], [1.25, 0.05, Math.PI / 2], 'snap1', null, 'o'],
        [0.66, 'mouth', [-0.075, -0.03, 0.02], [1.1, 0.2, Math.PI / 2], 'open', null, 'o'],
        off(0.76),
        off(1),
      ],
      events: [[0.02, 'lift'], [0.15, 'cup'], [0.25, 'puff1'], [0.36, 'puff2'], [0.47, 'puff3'], [0.6, 'snap'], [0.63, 'swirl'], [0.8, 'suck'], [0.83, 'clack'], [0.9, 'down']],
    },
    inspect: {
      len: 6.4,
      right: [
        [0, Z7],
        [0.5, [-0.03, 0.02, 0, 0.25, -0.65, 0.1, 0]],
        [2, [-0.03, 0.03, 0, 0.3, 0.9, 0.15, 0]],
        [2.8, [-0.02, 0.03, 0.02, 0.8, 0.2, 0.2, 0]],
        [3.2, [-0.01, 0, 0, 0.35, 0.1, 0.25, 0]],
        [4.6, [-0.01, 0, 0, 0.38, 0.1, 0.25, 0]],
        [4.85, [-0.035, 0.045, 0, 0.18, -0.2, 0.1, 0], 'o'],
        [5.6, [-0.02, 0.02, 0, 0.42, -1.5, 0.3, 0]],
        [6.4, Z7],
      ],
      hand: [
        off(0),
        off(2.9),
        [3.25, 'mouth', [-0.085, -0.012, 0.02], [0.15, -0.9, Math.PI], 'cup', null],
        [3.8, 'mouth', [-0.085, -0.012, 0.02], [0.15, -0.9, Math.PI], 'cup', null],
        [3.95, 'mouth', [-0.085, -0.008, 0.02], [0.15, -0.9, Math.PI], 'fist', null, 'o'],
        [4.15, 'mouth', [-0.09, 0, 0.02], [0.35, -0.95, 0.3], 'point', null],
        [4.5, 'mouth', [-0.095, 0.004, 0.025], [0.35, -0.95, 0.3], 'point', null],
        [4.62, 'mouth', [-0.035, 0, 0.012], [0.3, -1.0, 0.3], 'flick0', null, 'i'],
        [4.7, 'mouth', [-0.055, 0.01, 0.015], [0.3, -1.0, 0.3], 'open', null, 'o'],
        off(5.1),
        off(6.4),
      ],
      events: [[0.1, 'lift'], [0.8, 'pulse'], [1.6, 'pulse2'], [2.4, 'peek'], [3.3, 'palm'], [3.9, 'fist'], [4.18, 'reflame'], [4.6, 'flick'], [5.05, 'spin'], [6, 'down']],
    },
  },
  viento: {
    reload: {
      right: [
        [0, Z7],
        [0.12, [-0.06, 0.03, 0.03, 0.3, -0.1, 0.05, 0], 'o'],
        [0.58, [-0.06, 0.04, 0.03, 0.34, -0.1, 0.05, 0]],
        [0.62, [-0.05, 0.08, 0.02, 0.08, -0.1, 0, 0], 'o'],
        [0.66, [-0.045, 0.07, 0.03, 0.18, -0.1, 0.02, 0]],
        [0.82, [-0.04, 0.06, 0.03, 0.2, -0.1, 0.02, 0]],
        [0.86, [-0.04, 0.05, 0.035, 0.22, -0.1, 0, 0], 'o'],
        [1, Z7],
      ],
      hand: [
        off(0),
        off(0.1),
        [0.15, 'turbine', [-0.012, 0.004, 0.012], [0.25, -1.1, 0.15], 'flick0', 'tip'],
        [0.19, 'turbine', [0.012, 0.002, 0.004], [0.25, -1.1, 0.15], 'point', 'tip', 'o'],
        [0.23, 'turbine', [-0.01, -0.012, 0.022], [0.3, -0.9, 0.3], 'open', 'tip'],
        off(0.34),
        off(1),
      ],
      events: [[0.02, 'lift'], [0.19, 'flick'], [0.28, 'swirl'], [0.6, 'uncork'], [0.66, 'spin'], [0.84, 'catch'], [0.92, 'down']],
    },
    inspect: {
      len: 6.4,
      right: [
        [0, Z7],
        [0.5, [-0.02, 0.035, 0, 0.25, 0, 0.05, 0]],
        [2.3, [-0.02, 0.035, 0, 0.25, 0, 0.05, 0]],
        [2.8, [-0.02, 0.025, 0, 0.3, 0, 0.1, 0]],
        [3.1, [-0.01, 0.03, 0.035, 0.7, -0.1, 0.25, 0]],
        [4.35, [-0.01, 0.03, 0.035, 0.7, -0.1, 0.25, 0]],
        [4.65, [-0.03, 0.05, 0, 0.2, 0.2, -0.1, 0]],
        [5.6, [-0.03, 0.05, 0, 0.2, 0.2, -0.1, 0]],
        [6.4, Z7],
      ],
      hand: [off(0), off(6.4)],
      events: [[0.1, 'lift'], [0.6, 'spinup'], [2.25, 'spinstop'], [3.25, 'note1'], [3.6, 'note2'], [3.95, 'note3'], [4.35, 'note4'], [4.7, 'twist'], [6, 'down']],
    },
  },
  rayo: {
    reload: {
      right: [
        [0, Z7],
        [0.12, [-0.06, 0.05, 0.02, 0.1, -0.95, 0.2, 0], 'o'],
        [0.62, [-0.06, 0.05, 0.02, 0.1, -0.95, 0.2, 0]],
        [0.66, [-0.06, 0.072, 0, 0.16, -1.02, 0.26, 0], 'o'],
        [0.8, [-0.06, 0.055, 0.02, 0.1, -0.95, 0.2, 0]],
        [1, Z7],
      ],
      hand: [
        off(0),
        off(0.1),
        [0.17, 'orb', [-0.03, 0.01, 0.025], [0.2, -0.85, 0.2], 'point', 'tip'],
        [0.2, 'orb', [0, 0, 0.004], [0.2, -0.85, 0.2], 'point', 'tip', 'i'],
        [0.25, 'orb', [-0.022, 0.008, 0.018], [0.2, -0.85, 0.2], 'point', 'tip', 'o'],
        [0.32, 'orb', [0, 0, 0.004], [0.2, -0.85, 0.2], 'point', 'tip', 'i'],
        [0.37, 'orb', [-0.022, 0.008, 0.018], [0.2, -0.85, 0.2], 'point', 'tip', 'o'],
        [0.44, 'orb', [0, 0, 0.004], [0.2, -0.85, 0.2], 'point', 'tip', 'i'],
        [0.48, 'orb', [-0.01, 0.004, 0.01], [0.2, -0.85, 0.2], 'point', 'tip', 'o'],
        [0.5, 'orb', [0, 0, 0.004], [0.2, -0.85, 0.2], 'point', 'tip'],
        [0.61, 'coil', [0, 0, 0.004], [0.1, -0.9, 0.2], 'point', 'tip', 'l'],
        [0.65, 'coil', [-0.05, 0.02, 0.035], [0.3, -0.6, 0.4], 'open', 'tip', 'o'],
        [0.74, 'coil', [-0.08, -0.01, 0.05], [0.4, -0.5, 0.4], 'relax', 'tip'],
        off(0.84),
        off(1),
      ],
      events: [[0.02, 'lift'], [0.2, 'tap1'], [0.32, 'tap2'], [0.44, 'tap3'], [0.5, 'slide'], [0.62, 'flick'], [0.67, 'shake'], [0.8, 'hum'], [0.92, 'down']],
    },
    inspect: {
      len: 6.2,
      right: [
        [0, Z7],
        [0.5, [-0.045, 0.03, 0, 0.1, -1.2, 0.15, 0]],
        [3.2, [-0.045, 0.03, 0, 0.1, -1.2, 0.15, 0]],
        [3.3, [-0.04, 0.045, -0.01, 0.16, -1.28, 0.22, 0], 'o'],
        [3.7, [-0.045, 0.03, 0, 0.1, -1.2, 0.15, 0]],
        [4.1, [-0.03, 0.065, 0, -0.35, -0.55, 0.1, 0]],
        [5.4, [-0.03, 0.065, 0, -0.35, -0.55, 0.1, 0]],
        [6.2, Z7],
      ],
      hand: [
        off(0),
        off(1.5),
        [2, 'orb', [-0.05, 0.02, 0.05], [0.25, -0.75, 0.2], 'point', 'tip'],
        [3.15, 'orb', [-0.012, 0.004, 0.012], [0.25, -0.75, 0.2], 'point', 'tip'],
        [3.22, 'orb', [0, 0, 0.004], [0.25, -0.75, 0.2], 'point', 'tip', 'i'],
        [3.35, 'orb', [-0.07, -0.01, 0.06], [0.5, -0.5, 0.5], 'open', 'tip', 'o'],
        [3.75, 'orb', [-0.08, -0.02, 0.06], [0.5, -0.5, 0.5], 'relax', 'tip'],
        off(4.1),
        off(6.2),
      ],
      events: [[0.1, 'lift'], [1.8, 'near'], [2.6, 'plasma'], [3.22, 'zap'], [3.35, 'shake'], [4.2, 'ladder'], [5.1, 'rumble'], [5.9, 'down']],
    },
  },
  hielo: {
    reload: {
      right: [
        [0, Z7],
        [0.12, [-0.04, 0.07, 0, 0.35, 0.4, 0.05, 0], 'o'],
        [0.31, [-0.04, 0.07, 0, 0.35, 0.4, 0.05, 0]],
        [0.345, [-0.03, 0.066, 0, 0.33, 0.44, -0.12, 0], 'o'],
        [0.4, [-0.04, 0.07, 0, 0.35, 0.4, 0.05, 0]],
        [0.8, [-0.04, 0.078, -0.01, 0.42, 0.15, 0.05, 0]],
        [0.83, [-0.04, 0.074, -0.01, 0.42, 0.15, 0.14, 0], 'o'],
        [0.86, [-0.04, 0.076, -0.01, 0.42, 0.15, 0, 0]],
        [1, Z7],
      ],
      hand: [
        off(0),
        off(0.1),
        [0.2, 'side', [-0.004, 0, 0], [1.1, 0.1, Math.PI / 2], 'claw', 'palm'],
        [0.27, 'side', [-0.004, 0, 0], [1.1, 0.1, Math.PI / 2], 'claw', 'palm'],
        [0.31, 'side', [-0.05, 0.01, 0.01], [1.1, 0.25, Math.PI / 2], 'flat', 'palm', 'o'],
        [0.34, 'side', [0.002, 0, 0], [1.1, 0.05, Math.PI / 2], 'flat', 'palm', 'i'],
        [0.38, 'side', [-0.006, 0.004, 0], [1.1, 0.05, Math.PI / 2], 'open', 'palm'],
        [0.46, 'side', [-0.004, 0.045, 0.004], [1.3, 0.05, Math.PI / 2], 'open', 'palm'],
        off(0.56),
        off(1),
      ],
      events: [[0.02, 'lift'], [0.18, 'grip'], [0.34, 'slap'], [0.4, 'wipe'], [0.52, 'grow'], [0.83, 'lock'], [0.92, 'down']],
    },
    inspect: {
      len: 6.4,
      right: [
        [0, Z7],
        [0.5, [-0.02, 0.005, -0.03, 0.55, -0.3, 0.1, 0]],
        [1.9, [-0.02, 0.005, -0.03, 0.55, 0.6, 0.1, 0]],
        [2.1, [-0.03, -0.015, 0.0, 0.5, 0.3, 0.2, 0]],
        [2.6, [-0.03, -0.015, 0.0, 0.5, 0.3, 0.2, 0]],
        [2.85, [-0.03, 0.01, -0.02, 0.25, 0.35, 0.05, 0]],
        [3.9, [-0.03, 0.01, -0.02, 0.25, 0.35, 0.05, 0]],
        [4.3, [-0.02, 0.035, -0.03, 0.4, -0.2, 0.05, 0]],
        [5, [-0.02, 0.03, -0.03, 0.35, -0.2, 0.05, 0]],
        [6.4, Z7],
      ],
      hand: [
        off(0),
        off(2.55),
        [2.85, 'front', [0.012, 0.004, 0.004], [0.3, -0.8, 0.35], 'point', 'tip'],
        [3.75, 'front', [0.012, 0.004, 0.004], [0.3, -0.8, 0.35], 'point', 'tip'],
        off(4.15),
        off(6.4),
      ],
      events: [[0.1, 'lift'], [2.1, 'breath'], [2.9, 'draw'], [4.1, 'bloom'], [4.7, 'drop'], [6, 'down']],
    },
  },
};

// Pose interpolada de una pista numérica.
function evalKeys(keys, u, out) {
  let i = 1;
  while (i < keys.length - 1 && u > keys[i][0]) i++;
  const [u0, a] = keys[i - 1];
  const [u1, b, ease] = keys[i];
  const f = (EASE[ease] || smooth)(clamp01((u - u0) / (u1 - u0 || 1)));
  for (let j = 0; j < out.length; j++) out[j] = a[j] + (b[j] - a[j]) * f;
  return out;
}

export default class ElemVm {
  constructor(elem) {
    this.E = elem;
    this.w = elem.w;
    this.g = elem.g;
    this.parent = this.w.vmRoot;
    this.sparks = new Sparks(this.parent);
    this.bolts = new Bolts(this.parent);
    this.shards = new Shards(this.parent);
    this.hand = null;
    this.mode = null;
    this.prevU = -1;
    this.out = null;
    // lo que la coreografía le pide al modelo (lo lee Elementales.animateModel)
    this.fx = { flare: 0, lava: 0, spin: 0, turb: 0, feather: 0, twister: 0, orb: 0, arcs: 0, grow: 1, core: 0, crown: 0 };
    this.spin = 0;
    this.tipLocal = {};
    this.palmLocal = new THREE.Vector3(0, -0.017, -0.018);
    this.o7 = [0, 0, 0, 0, 0, 0, 0];
  }

  // ---------------- la mano izquierda ----------------
  ensureHand() {
    if (this.hand) return this.hand;
    const M = VM.mats(null);
    this.hand = buildHand(M);
    this.parent.add(this.hand.root, this.hand.arm);
    return this.hand;
  }

  // El antebrazo: de la muñeca al hombro.
  placeArm() {
    const H = this.hand;
    H.root.updateMatrixWorld(true);
    const w = H.root.localToWorld(tmpA.copy(WRIST));
    const d = tmpB.subVectors(SHOULDER, w);
    const len = d.length();
    H.arm.position.copy(w);
    H.arm.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    H.sleeve.scale.y = Math.max(0.05, Math.min(0.7, len - 0.03));
    H.arm.visible = true;
  }

  // Dónde está la punta del índice (en el espacio de la mano) con una pose.
  tipOf(pose) {
    if (this.tipLocal[pose]) return this.tipLocal[pose];
    const H = this.ensureHand();
    const keep = H.curls.slice();
    const r = H.root;
    const p = r.position.clone();
    const q = r.quaternion.clone();
    r.position.set(0, 0, 0);
    r.quaternion.identity();
    setCurls(H, POSES[pose] || POSES.relax);
    r.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    H.fingers[0].tip.getWorldPosition(v);
    this.parent.updateMatrixWorld(true);
    this.parent.worldToLocal(v);
    this.tipLocal[pose] = v;
    r.position.copy(p);
    r.quaternion.copy(q);
    setCurls(H, keep);
    return v;
  }

  // Un punto del mate en la escena de la mano.
  anchor(name, out) {
    const m = this.model;
    const E = m?.elem;
    if (!E || name === 'off') return out.set(-0.3, -0.42, -0.16);
    switch (name) {
      case 'mouth':
        return m.mouth.getWorldPosition(out);
      case 'tip':
        return m.muzzle.getWorldPosition(out);
      case 'straw':
        return E.straw.localToWorld(out.set(0, E.strawLen * 0.55, 0));
      case 'strawLo':
        return E.straw.localToWorld(out.set(0, E.strawLen * 0.1, 0));
      case 'turbine':
        return E.turbine ? E.turbine.localToWorld(out.set(-E.turbineR, 0, 0.004)) : m.mouth.getWorldPosition(out);
      case 'orb':
        return (E.orb || m.mouth).getWorldPosition(out);
      case 'side':
        return E.gourd.localToWorld(out.set(-(E.sideR || 0.05), 0.05, 0.01));
      case 'coil':
        return E.gourd.localToWorld(out.set(0, 0.022, (E.sideR || 0.05) * 0.9));
      case 'front':
        return E.gourd.localToWorld(out.set(-0.02, 0.05, E.sideR || 0.05));
      default:
        return E.gourd.localToWorld(out.set(0, 0.05, 0));
    }
  }

  // Dónde va la raíz de la mano para una clave (con su contacto).
  keyPos(key, out) {
    const [, at, off3, rot, pose, contact] = key;
    this.anchor(at, out);
    out.x += off3[0];
    out.y += off3[1];
    out.z += off3[2];
    if (!contact) return out;
    const local = contact === 'tip' ? this.tipOf(pose) : this.palmLocal;
    tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2]));
    return out.sub(tmpA.copy(local).applyQuaternion(tmpQ));
  }

  updateHand(C, u, dt) {
    const keys = C?.hand;
    const H = this.hand;
    if (!keys || keys.length < 2) {
      if (H) H.root.visible = H.arm.visible = false;
      return;
    }
    let i = 1;
    while (i < keys.length - 1 && u > keys[i][0]) i++;
    const a = keys[i - 1];
    const b = keys[i];
    if (a[1] === 'off' && b[1] === 'off') {
      if (H) H.root.visible = H.arm.visible = false;
      return;
    }
    this.ensureHand();
    const h = this.hand;
    const f = (EASE[b[6]] || smooth)(clamp01((u - a[0]) / (b[0] - a[0] || 1)));
    const pa = this.keyPos(a, new THREE.Vector3());
    const pb = this.keyPos(b, tmpW);
    h.root.position.lerpVectors(pa, pb, f);
    h.root.rotation.set(a[3][0] + (b[3][0] - a[3][0]) * f, a[3][1] + (b[3][1] - a[3][1]) * f, a[3][2] + (b[3][2] - a[3][2]) * f);
    const ca = POSES[a[4]] || POSES.relax;
    const cb = POSES[b[4]] || POSES.relax;
    for (let j = 0; j < 5; j++) h.curls[j] = ca[j] + (cb[j] - ca[j]) * f;
    setCurls(h, h.curls);
    // la mano que se electrocutó tiembla
    if (this.shakeT > 0) {
      const s = Math.min(1, this.shakeT) * 0.004;
      h.root.position.x += (Math.random() - 0.5) * s;
      h.root.position.y += (Math.random() - 0.5) * s;
      h.root.rotation.z += (Math.random() - 0.5) * s * 20;
    }
    h.root.visible = true;
    this.placeArm();
  }

  fingerTip(out) {
    return this.hand ? this.hand.fingers[0].tip.getWorldPosition(out) : out.set(0, 0, 0);
  }

  // ---------------- las poses de la mano derecha ----------------
  reloadPose(st, k, t) {
    const C = CHOREO[st.element]?.reload;
    const o = evalKeys(C.right, k, this.o7).slice();
    this.addRight(st.element, 'reload', k, t, o);
    return o;
  }

  inspectPose(st, ik) {
    const C = CHOREO[st.element]?.inspect;
    const u = this.w.stateT;
    const o = evalKeys(C.right, u, this.o7).slice();
    this.addRight(st.element, 'inspect', u, this.g.time, o);
    for (let j = 0; j < 6; j++) o[j] *= ik;
    return o;
  }

  inspectLen(st) {
    return CHOREO[st.element]?.inspect.len || 6;
  }

  // Lo que se suma a la pose (sacudones, remolinos) según el momento.
  addRight(el, mode, u, t, o) {
    if (el === 'fuego' && mode === 'reload') {
      // cada soplido la acerca un poquito y le inclina la boca
      for (const kp of [0.26, 0.37, 0.48]) {
        const b = bump(u, kp, 0.035);
        o[2] += b * 0.012;
        o[3] += b * 0.08;
      }
    } else if (el === 'viento' && mode === 'reload') {
      // lo revuelve en círculos (cada vez más rápido) con la boca tapada
      const sw = smooth((u - 0.26) / 0.05) * (1 - smooth((u - 0.55) / 0.05));
      const ph = (u - 0.26) * 60 + (u - 0.26) * (u - 0.26) * 90;
      o[0] += Math.cos(ph) * 0.016 * sw;
      o[2] += Math.sin(ph) * 0.016 * sw;
      o[5] += Math.sin(ph) * 0.1 * sw;
    } else if (el === 'viento' && mode === 'inspect') {
      // el ocho del remolino
      const e = smooth((u - 4.7) / 0.3) * (1 - smooth((u - 5.5) / 0.3));
      o[0] += Math.sin((u - 4.7) * 6) * 0.025 * e;
      o[1] += Math.sin((u - 4.7) * 12) * 0.012 * e;
      o[5] += Math.sin((u - 4.7) * 6) * 0.2 * e;
    } else if (el === 'rayo' && mode === 'reload') {
      // cada golpecito la hunde un poco; cargada, zumba
      for (const kp of [0.2, 0.32, 0.44]) o[1] -= bump(u, kp + 0.01, 0.025) * 0.006;
      const hum = smooth((u - 0.5) / 0.05) * (1 - smooth((u - 0.62) / 0.02));
      o[0] += Math.sin(t * 71) * 0.0018 * hum;
      o[1] += Math.sin(t * 57 + 1) * 0.0015 * hum;
    } else if (el === 'rayo' && mode === 'inspect') {
      const hum = smooth((u - 4.1) / 0.2) * (1 - smooth((u - 5.4) / 0.2));
      o[0] += Math.sin(t * 64) * 0.0012 * hum;
    } else if (el === 'hielo' && mode === 'inspect') {
      // una sacudida para que caigan las astillas
      const sh = smooth((u - 4.6) / 0.08) * (1 - smooth((u - 5) / 0.1));
      o[5] += Math.sin(u * 55) * 0.12 * sh;
      o[0] += Math.sin(u * 55) * 0.006 * sh;
    }
  }

  // ---------------- cada cuadro ----------------
  // (lo llama Elementales.animateModel después de ubicar la mano)
  update(dt, st, model, state, stateT) {
    const el = st?.element;
    const mode = el && (state === 'reload' || state === 'inspect') ? state : null;
    const C = mode ? CHOREO[el]?.[mode] : null;
    const u = mode === 'reload' ? clamp01(stateT / (this.w.reloadTime || 1)) : stateT;
    if (mode !== this.mode || model !== this.model || (mode && u < this.prevU)) {
      // empezó otra (o se cortó la que iba): la de antes se calla (la de la
      // recarga la abre Elementales.reloadSound al empezar)
      if (this.out && this.outOwner !== mode) this.stopOut();
      this.mode = mode;
      this.model = model;
      this.prevU = -1;
      this.shakeT = 0;
      this.frost = 0;
      if (mode === 'inspect') this.startOut(st, 0.55, 'inspect');
      if (model?.elem?.gourd) model.elem.gourd.rotation.y = 0;
      this.spin = 0;
    }
    this.model = model;
    const E = model?.elem;
    this.resetFx();
    this.w.holder.updateMatrixWorld(true);
    if (C && E) {
      for (const [ku, name] of C.events) if (ku > this.prevU && ku <= u) this.event(el, name, st, E);
      this.prevU = u;
      this.bolts.begin();
      this.effects(el, mode, u, dt, st, E);
      this.updateHand(C, u, dt);
    } else {
      this.bolts.begin();
      if (this.hand) this.hand.root.visible = this.hand.arm.visible = false;
    }
    this.shakeT = Math.max(0, (this.shakeT || 0) - dt);
    this.bolts.end();
    const cam = this.w.vmCamera;
    const size = this.g.renderer.getDrawingBufferSize(tmp2);
    this.sparks.update(dt, cam, cam.fov, size.y);
    this.shards.update(dt);
  }

  resetFx() {
    const F = this.fx;
    F.flare = 0;
    F.lava = 0;
    F.turb = 0;
    F.feather = 0;
    F.twister = 0;
    F.orb = 0;
    F.arcs = 0;
    F.grow = 1;
    F.core = 0;
    F.crown = 0;
  }

  // La salida de sonido de la animación en curso (se calla si se corta).
  // owner: de qué es ('reload' o 'inspect').
  startOut(st, gain = 0.6, owner = null) {
    this.stopOut();
    const a = this.g.audio;
    if (!a?.ctx) return null;
    this.out = a.out({ gain: gain * (st.charge ? 1.15 : 1), reverb: 0.2 });
    this.outOwner = owner;
    return this.out;
  }

  stopOut() {
    const o = this.out;
    if (!o) return;
    this.out = null;
    try {
      o.gain.setTargetAtTime(0.0001, this.g.audio.now, 0.05);
      setTimeout(() => o.disconnect(), 400);
    } catch {
      /* ya estaba suelta */
    }
  }

  // Un paso de la coreografía: su sonido y lo que salta en ese momento.
  event(el, name, st, E) {
    this.E.snd.cue(el, name, !!st.charge, this.out);
    const up = !!st.charge;
    const mouth = this.anchor('mouth', new THREE.Vector3());
    if (el === 'fuego') {
      if (name === 'snap' || name === 'flick') this.burst(mouth, 'fire', up ? 26 : 18, 0.35);
      else if (name === 'clack') this.burst(mouth, 'spark', up ? 30 : 20, 0.5);
      else if (name === 'fist') this.burst(this.handPalm(new THREE.Vector3()), 'smoke', 8, 0.1);
      else if (name === 'swirl') this.ring(E, up ? 38 : 28);
    } else if (el === 'viento') {
      if (name === 'uncork') this.burst(mouth, 'wind', up ? 30 : 22, 0.45);
      else if (name === 'flick') this.turbKick = 1;
    } else if (el === 'rayo') {
      if (name === 'flick' || name === 'zap') {
        this.shakeT = 0.6;
        this.burst(this.fingerTip(new THREE.Vector3()), 'spark', 16, 0.35);
      }
    } else if (el === 'hielo') {
      if (name === 'slap') this.shatterSpikes(E, up);
      else if (name === 'lock') this.burst(mouth, 'frost', 14, 0.15);
      else if (name === 'drop') {
        for (let i = 0; i < 5; i++) this.shards.spawn(this.anchor('body', new THREE.Vector3()).add(tmpV.set((Math.random() - 0.5) * 0.05, -0.02, (Math.random() - 0.5) * 0.05)), tmpW.set((Math.random() - 0.5) * 0.1, -0.05, (Math.random() - 0.5) * 0.1), 0.004);
      }
    }
  }

  handPalm(out) {
    return this.hand ? this.hand.root.localToWorld(out.set(0, -0.02, -0.02)) : out.set(0, 0, 0);
  }

  // Un chorro de partículas de un tipo desde un punto.
  burst(p, kind, n, speed) {
    const S = this.sparks;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (kind === 'fire') S.spawn(p, { vel: v, life: 0.35 + Math.random() * 0.3, size: 0.012, size1: 0.003, alpha: 0.9, color: [2, 0.8 + Math.random() * 0.4, 0.25], drag: 3, grav: -0.2 });
      else if (kind === 'spark') S.spawn(p, { vel: v, life: 0.3 + Math.random() * 0.3, size: 0.004, size1: 0.001, alpha: 1, color: [2.2, 1.5, 0.7], drag: 1.5, grav: 1.2, fade: 'flicker' });
      else if (kind === 'wind') S.spawn(p, { vel: v.multiplyScalar(1.4), life: 0.5 + Math.random() * 0.3, size: 0.006, size1: 0.02, alpha: 0.35, color: [0.75, 1.1, 0.85], drag: 2.5 });
      else if (kind === 'frost') S.spawn(p, { vel: v, life: 0.5 + Math.random() * 0.4, size: 0.008, size1: 0.02, alpha: 0.35, color: [0.75, 0.95, 1.2], drag: 3, grav: 0.1 });
      else if (kind === 'smoke') S.spawn(p, { vel: v.multiplyScalar(0.3), life: 0.8, size: 0.01, size1: 0.035, alpha: 0.15, color: [0.5, 0.48, 0.46], drag: 1, grav: -0.08, fade: 'inout' });
    }
  }

  // El anillo de fuego que da vueltas y se mete en la boca (Pillán).
  ring(E, n) {
    for (let i = 0; i < n; i++) {
      const life = 0.52 + Math.random() * 0.05;
      this.sparks.spawn(tmpV.set(0, 0, 0), {
        life,
        size: 0.022,
        size1: 0.007,
        alpha: 0.9,
        color: [2, 0.7 + Math.random() * 0.4, 0.2],
        fade: 'inout',
        orbit: { obj: E.gourd, a: (i / n) * Math.PI * 2, w: 11 + Math.random() * 2, r: 0.085, vr: -0.14, y: 0.02 + (i % 3) * 0.012, vy: 0.17 },
      });
    }
  }

  // El cachetazo del Penitente: las agujas saltan en astillas.
  shatterSpikes(E, up) {
    const center = this.anchor('body', new THREE.Vector3());
    for (const s of E.spikes) {
      const p = s.getWorldPosition(new THREE.Vector3());
      const v = p.clone().sub(center).normalize().multiplyScalar(0.25 + Math.random() * 0.2);
      v.x += 0.08;
      v.y += 0.12;
      this.shards.spawn(p, v, up ? 0.008 : 0.0065);
    }
    for (let i = 0; i < 6; i++) this.shards.spawn(center.clone().add(tmpV.set(-0.03, (Math.random() - 0.3) * 0.05, 0.01)), tmpW.set(-0.1 - Math.random() * 0.15, 0.1 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2), 0.006);
    this.burst(center, 'frost', 26, 0.3);
  }

  // Lo que va pasando mientras dura (partículas, rayos, lo que se mueve en el mate).
  effects(el, mode, u, dt, st, E) {
    const F = this.fx;
    const S = this.sparks;
    const up = !!st.charge;
    const mouth = this.anchor('mouth', new THREE.Vector3());
    if (el === 'fuego') {
      if (mode === 'reload') {
        // los tres soplidos: el aliento va de la boca del que sopla a las brasas
        [0.26, 0.37, 0.48].forEach((kp, i) => {
          const b = bump(u, kp, 0.04);
          if (u > kp - 0.02 && u < kp + 0.03 && Math.random() < dt * 60) {
            const from = tmpV.set(0.0, -0.05, -0.07);
            const v = tmpW.subVectors(mouth, from).multiplyScalar(2.4 + Math.random());
            S.spawn(from, { vel: v, life: 0.3, size: 0.012, size1: 0.03, alpha: 0.1, color: [0.9, 0.85, 0.8], drag: 1.5, fade: 'inout' });
          }
          F.flare = Math.max(F.flare, bump(u, kp + 0.03, 0.05) * (0.5 + i * 0.3));
          if (b > 0.5 && Math.random() < dt * 30 * (i + 1)) this.emberAt(mouth, 0.12 + i * 0.05);
        });
        F.flare = Math.max(F.flare, bump(u, 0.615, 0.06) * 1.3, bump(u, 0.84, 0.03) * 1.1);
        // el anillo: las llamas dejan una estela chiquita
        if (u > 0.63 && u < 0.8) F.flare = Math.max(F.flare, 0.6);
        F.lava = F.flare * 1.4;
      } else {
        // los dos latidos del volcán, la llamita en la palma y la que vuelve a la boca
        F.lava = Math.max(bump(u, 0.9, 0.25), bump(u, 1.7, 0.25)) * 1.6 + bump(u, 4.75, 0.25) * 2;
        F.flare = bump(u, 2.5, 0.4) * 0.6 + bump(u, 4.75, 0.2) * 1.8;
        if (u > 2.3 && u < 2.8 && Math.random() < dt * 25) this.emberAt(mouth, 0.1);
        if (u > 3.3 && u < 3.9 && this.hand) {
          const p = this.handPalm(new THREE.Vector3()).add(tmpV.set(0, 0.012, 0));
          if (Math.random() < dt * 70) S.spawn(p, { vel: tmpW.set((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.04, (Math.random() - 0.5) * 0.02), life: 0.35, size: 0.02, size1: 0.004, alpha: 1, color: [2, 0.8, 0.25] });
        }
        if (u > 4.18 && u < 4.62 && this.hand) {
          const p = this.fingerTip(new THREE.Vector3());
          if (Math.random() < dt * 60) S.spawn(p, { vel: tmpW.set(0, 0.04, 0), life: 0.3, size: 0.013, size1: 0.003, alpha: 1, color: [2, 0.9, 0.3] });
        }
        if (u > 4.62 && u < 4.72 && this.hand) {
          // la llamita vuela a la boca
          const p = this.fingerTip(new THREE.Vector3());
          S.spawn(p, { vel: tmpW.subVectors(mouth, p).multiplyScalar(9), life: 0.12, size: 0.01, size1: 0.004, alpha: 1, color: [2, 0.9, 0.3] });
        }
      }
    } else if (el === 'viento') {
      if (mode === 'reload') {
        this.turbKick = Math.max(0, (this.turbKick || 0) - dt * 0.8);
        const sw = smooth((u - 0.26) / 0.05) * (1 - smooth((u - 0.6) / 0.03));
        F.turb = this.turbKick * 30 + sw * 55 + bump(u, 0.62, 0.05) * 30;
        F.feather = sw * 0.8 + bump(u, 0.63, 0.06) * 1.2;
        F.twister = sw;
        // el viento que entra girando por los costados de la mano
        if (sw > 0.2 && Math.random() < dt * 70) {
          S.spawn(tmpV, { life: 0.5, size: 0.004, size1: 0.009, alpha: 0.5, color: [0.7, 1.1, 0.85], fade: 'inout', orbit: { obj: E.gourd, a: Math.random() * 6.28, w: 9 + Math.random() * 4, r: 0.13 + Math.random() * 0.04, vr: -0.2, y: 0.03 + Math.random() * 0.1, vy: 0.04 } });
        }
        // el mate gira solo en la palma y frena justo en su lugar
        const s = clamp01((u - 0.66) / 0.18);
        E.gourd.rotation.y = s > 0 && s < 1 ? Math.PI * 4 * EASE.o(s) : 0;
        if (s > 0 && s < 1) F.turb = Math.max(F.turb, 20 * (1 - s));
      } else {
        // gira en la palma cada vez más rápido, frena, la quena y el ocho
        const s = clamp01((u - 0.6) / 1.7);
        const stop = clamp01((u - 2.3) / 0.5);
        let ang = 0;
        if (u > 0.6 && u < 2.3) ang = s * s * Math.PI * 9;
        else if (u >= 2.3 && u < 2.8) ang = Math.PI * 9 + EASE.o(stop) * Math.PI * 1;
        E.gourd.rotation.y = ang % (Math.PI * 2);
        F.feather = s * (1 - stop) * 1.2;
        F.turb = s * (1 - stop) * 50;
        if (u > 1 && u < 2.3 && Math.random() < dt * 40) S.spawn(tmpV, { life: 0.4, size: 0.004, size1: 0.008, alpha: 0.45, color: [0.7, 1.1, 0.85], fade: 'inout', orbit: { obj: E.gourd, a: Math.random() * 6.28, w: 14, r: 0.07 + Math.random() * 0.03, vr: 0.08, y: 0.04 + Math.random() * 0.05, vy: 0 } });
        // la quena: sopla la boca del mate como una botella (cada nota, un
        // soplido que entra y un remolinito que sale)
        for (const [kn, dn] of [[3.25, 0.3], [3.6, 0.3], [3.95, 0.55], [4.35, 0.8]]) {
          if (u > kn && u < kn + dn && Math.random() < dt * 45) {
            const from = tmpV.set(0, -0.05, -0.07);
            S.spawn(from, { vel: tmpW.subVectors(mouth, from).multiplyScalar(2.6), life: 0.28, size: 0.008, size1: 0.02, alpha: 0.12, color: [0.85, 1, 0.9], drag: 1.2, fade: 'inout' });
            S.spawn(tmpA, { life: 0.4, size: 0.003, size1: 0.007, alpha: 0.5, color: [0.7, 1.1, 0.85], fade: 'inout', orbit: { obj: E.gourd, a: Math.random() * 6.28, w: 18, r: 0.012, vr: 0.05, y: E.topY + 0.005, vy: 0.08 } });
            F.feather = Math.max(F.feather, 0.5);
            F.turb = Math.max(F.turb, 12);
          }
        }
        const tw = smooth((u - 4.7) / 0.3) * (1 - smooth((u - 5.6) / 0.3));
        F.twister = tw;
        if (tw > 0.1 && Math.random() < dt * 60) S.spawn(tmpV, { life: 0.45, size: 0.003, size1: 0.007, alpha: 0.5, color: [0.7, 1.1, 0.85], fade: 'inout', orbit: { obj: E.gourd, a: Math.random() * 6.28, w: 16, r: 0.01 + Math.random() * 0.01, vr: 0.05, y: E.topY + 0.01, vy: 0.12 } });
      }
    } else if (el === 'rayo') {
      const orb = this.anchor('orb', new THREE.Vector3());
      const tip = this.hand?.root.visible ? this.fingerTip(new THREE.Vector3()) : null;
      const col = up ? [1.6, 1.3, 0.5] : [1.4, 1.35, 0.8];
      if (mode === 'reload') {
        // cada golpecito: un rayito entre el dedo y la bombilla, y el cristal se enciende
        const taps = [0.2, 0.32, 0.44];
        let charge = 0;
        taps.forEach((kp, i) => {
          if (u >= kp) charge = (i + 1) / 3;
          if (tip && u > kp - 0.004 && u < kp + 0.03) {
            // el dedo toca el cristal: saltan chispas y un rayito a la boca
            for (let r = 0; r < 2; r++) this.bolts.bolt(orb, tmpA.copy(tip).add(tmpB.set((Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012, 0)), { width: 0.0012, color: col, jag: 0.3, n: 4 });
            if (Math.random() < 0.5) this.sparks.spawn(tip, { vel: tmpW.set((Math.random() - 0.5) * 0.2, Math.random() * 0.15, (Math.random() - 0.5) * 0.2), life: 0.25, size: 0.003, alpha: 1, color: [2, 1.8, 1], grav: 0.8, fade: 'flicker' });
          }
          if (u > kp && u < kp + 0.025) this.bolts.bolt(orb, this.anchor('mouth', new THREE.Vector3()), { width: 0.001, color: col, jag: 0.2, n: 6 });
        });
        F.orb = charge * 0.6 * (u < 0.62 ? 1 : 0) + bump(u, 0.64, 0.06) * 2.2;
        F.arcs = charge * 0.4;
        // el dedo baja hasta el resorte arrastrando la corriente del cristal
        if (tip && u > 0.5 && u < 0.62) {
          this.bolts.bolt(tip, orb, { width: 0.0013, color: col, jag: 0.3, n: 5 });
          if (Math.random() < dt * 40) this.sparks.spawn(tip, { vel: tmpW.set((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15), life: 0.2, size: 0.003, alpha: 1, color: [2, 1.8, 1], grav: 0.6, fade: 'flicker' });
        }
        // se suelta: el arco trepa del resorte a la boca y al cristal
        if (u > 0.62 && u < 0.7) {
          const coil = this.anchor('coil', new THREE.Vector3());
          this.bolts.bolt(coil, this.anchor('mouth', new THREE.Vector3()), { width: 0.0024, color: [2, 1.8, 1], jag: 0.22, n: 8 });
          this.bolts.bolt(coil, orb, { width: 0.0016, color: col, jag: 0.3, n: 5 });
          if (tip && u < 0.66) this.bolts.bolt(tip, coil, { width: 0.0012, color: col, jag: 0.35, n: 5 });
        }
        // y la corriente queda zumbando entre los pararrayos de la virola
        if (u > 0.76 && u < 0.92 && Math.random() < 0.7) this.rodArc(E, (u - 0.76) / 0.16);
      } else {
        // la bola de plasma: el arco sigue al dedo; al tocar, el chispazo
        if (tip && u > 1.9 && u < 3.3) {
          const near = smooth((u - 1.9) / 1.2);
          if (Math.random() < 0.3 + near * 0.7) this.bolts.bolt(orb, tip, { width: 0.001 + near * 0.0012, color: col, jag: 0.3, n: 6 });
          F.orb = near * 1.2;
        }
        F.orb = Math.max(F.orb, bump(u, 3.25, 0.12) * 2.5);
        F.arcs = smooth((u - 1.8) / 1) * (1 - smooth((u - 3.6) / 0.3)) * 0.8;
        // la escalera de Jacob entre los pararrayos de la virola
        if (u > 4.2 && u < 5.3) this.rodArc(E, ((u - 4.2) % 0.36) / 0.36);
        if (u > 5.1 && u < 5.3 && Math.random() < 0.2 && this.g.weather) this.g.weather.flash = Math.max(this.g.weather.flash || 0, 0.15);
      }
    } else {
      if (mode === 'reload') {
        // las agujas: rotas desde el cachetazo, vuelven a crecer una por una
        const n = E.spikes.length;
        F.grow = u < 0.34 ? 1 : u < 0.52 ? 0.02 : 1;
        this.spikeGrow = u >= 0.34 && u < 0.83 ? (i) => smooth((u - 0.52 - (i / n) * 0.26) / 0.05) : null;
        F.core = bump(u, 0.83, 0.04) * 1.5 + (u > 0.52 && u < 0.83 ? 0.4 : 0);
        F.crown = bump(u, 0.83, 0.04);
        // el frío que baja por el mate mientras crece
        if (u > 0.52 && u < 0.85 && Math.random() < dt * 30) {
          const p = E.gourd.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.08, E.topY, (Math.random() - 0.5) * 0.08));
          this.sparks.spawn(p, { vel: tmpW.set(0, -0.05, 0), life: 0.6, size: 0.006, size1: 0.016, alpha: 0.2, color: [0.8, 0.95, 1.2], drag: 1, fade: 'inout' });
        }
        // la mano que pasa limpia la escarcha: una nube por donde va
        if (this.hand?.root.visible && u > 0.38 && u < 0.47 && Math.random() < dt * 50) this.sparks.spawn(this.handPalm(new THREE.Vector3()), { vel: tmpW.set(0, 0.02, 0), life: 0.5, size: 0.008, size1: 0.02, alpha: 0.25, color: [0.8, 0.95, 1.2], fade: 'inout' });
      } else {
        this.spikeGrow = null;
        // el aliento empaña el mate; el dedo dibuja; la corona florece
        if (u > 2.1 && u < 2.6 && Math.random() < dt * 50) {
          const from = tmpV.set(0, -0.05, -0.06);
          const to = this.anchor('body', new THREE.Vector3());
          this.sparks.spawn(from, { vel: tmpW.subVectors(to, from).multiplyScalar(2 + Math.random()), life: 0.4, size: 0.012, size1: 0.03, alpha: 0.12, color: [0.85, 0.95, 1.1], drag: 1.2, fade: 'inout' });
        }
        this.frost = Math.min(1, (this.frost || 0) + (u > 2.2 && u < 2.7 ? dt * 2.5 : -dt * 0.4));
        if (this.hand?.root.visible && u > 2.9 && u < 3.75) {
          const tip = this.fingerTip(new THREE.Vector3());
          if (Math.random() < dt * 60) this.sparks.spawn(tip, { vel: tmpW.set(0, 0.01, 0), life: 0.6, size: 0.003, size1: 0.001, alpha: 1, color: [1.4, 1.7, 2], fade: 'flicker' });
        }
        F.grow = 1 + bump(u, 4.4, 0.35) * 0.45;
        F.core = bump(u, 4.3, 0.4) * 1.2 + this.frost * 0.3;
        F.crown = bump(u, 4.3, 0.4);
        if (u > 4.1 && u < 4.6 && Math.random() < dt * 25) this.burst(mouth, 'frost', 1, 0.08);
      }
    }
  }

  // Rayitos entre los pararrayos de la virola que suben por ellos (h: 0 abajo, 1 arriba).
  rodArc(E, h) {
    const R = E.rods;
    if (!R?.length) return;
    for (let i = 0; i < R.length; i++) {
      if (Math.random() < 0.4) continue;
      const a = R[i].localToWorld(new THREE.Vector3(0, -0.006 + h * 0.014, 0));
      const b = R[(i + 1) % R.length].localToWorld(new THREE.Vector3(0, -0.006 + h * 0.014, 0));
      this.bolts.bolt(a, b, { width: 0.0009, color: [1.6, 1.5, 0.9], jag: 0.3, n: 5 });
    }
  }

  emberAt(p, speed) {
    this.sparks.spawn(p, { vel: new THREE.Vector3((Math.random() - 0.5) * speed, speed * (0.6 + Math.random()), (Math.random() - 0.5) * speed), life: 0.4 + Math.random() * 0.3, size: 0.004, size1: 0.001, alpha: 1, color: [2.2, 0.9, 0.3], drag: 1, grav: -0.05, fade: 'flicker' });
  }

  clear() {
    this.sparks.clear();
    this.shards.clear();
    this.stopOut();
    if (this.hand) this.hand.root.visible = this.hand.arm.visible = false;
    this.mode = null;
  }
}
