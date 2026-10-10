import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VM, VM_POSE, registerMate } from './viewmodels';
import { camoMaterial } from './camos';
import { bakeSet, scratches } from './baseSkins';
import { fbm, hash, voronoi } from './camoPaint';
import { weaponStats } from '../config/weapons';
import { compactGroup } from '../world/props';

// Los cuatro mates nuevos de la caja (el usuario, 2026-10-08; config/weapons.js):
//  · Mate Labrador (la Haymaker 12): calabaza de chacra ancha, pirograbada
//    con espigas de trigo y guardas pampas, dos fajas de paja trenzada, tres
//    cartuchos metidos en la faja, un manojito de trigo, el barrilito de
//    perdigones al costado y una bombilla gruesa de escopeta con su granito
//    de mira y la funda de cuero.
//  · Mate Explosivo (la L4 Siege): calabaza de polvorín pintada verde oliva
//    (descascarada, con la faja de peligro y "NO CEBAR" en esténcil), cuatro
//    bombillas cohete atadas con zunchos (se ve el cohete en cada una mientras
//    queden en el cargador) y tres cartuchos de dinamita con la mecha prendida.
//  · Mate Caótico (la Dingo; solo Eclipse): calabaza de obsidiana partida en
//    facetas, con las grietas y el tajo del desgarro que laten, astillas que
//    le orbitan, el anillo de vacío que gira, la boca llena del remolino del
//    caos y la virola de corona de eclipse. Mejorado (Lobizón del Caos):
//    eclipse de sangre (carmesí y oro).
//  · Llamarada Matera (solo Der Mateendrache): como el Imperial (base con
//    tres patas y faja) pero del dragón: escamas de carbón con la brasa entre
//    las escamas, patas de garra, faja de oro con rubíes, una corona de llamas
//    de oro, la boca llena de brasas con fuego que sale y chispas que suben.
//    Mejorada (Llamarada del Dragón): fuego azul.
// Todos con relieve de verdad (normal, oclusión y rugosidad pintados acá,
// como weapons/baseSkins.js) y la boca tapada entera hasta la pared de
// adentro, con fondo (que nunca se vea a través entre el aro y la yerba).
// Con un camuflaje de la armería, el camuflaje va en la cáscara y lo que
// brilla (las grietas, la brasa, el fuego, el remolino) queda arriba igual.
// Lo que se mueve lo hace en el shader con un reloj propio: se mueve en la
// mano, en la armería, en la caja y en el mate de los compañeros.

const { mats, cyl, box, sph, tor, bombilla, cupHand, profileRadius } = VM;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// el reloj de los shaders (lo pone al día el material que se dibuja)
const TIME = { value: 0 };
const clock = () => {
  TIME.value = (performance.now() / 1000) % 3600;
};

// ---------------- piezas comunes ----------------
// Torno con la v de la textura por el largo del perfil (no por punto): los
// dibujos no se estiran donde los puntos están más separados.
function arcLathe(pts, seg = 36) {
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const L = [0];
  for (let j = 1; j < pts.length; j++) L.push(L[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  const uv = geo.attributes.uv;
  const n = pts.length;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < n; j++) uv.setY(i * n + j, L[j] / L[n - 1]);
  return geo;
}

// Bultos de verdad en la calabaza (no llegan al borde de la boca ni al pie:
// ahí tiene que cerrar justo con la pared de adentro y con la mano).
function lumpy(geo, amp, topY, n) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const n = Math.sin(a * 5 + y * 90) * 0.5 + Math.sin(a * 11 - y * 140 + 1.3) * 0.3 + Math.sin(a * 3 + y * 40 + 2) * 0.2;
    const k = 1 + amp * n * smooth(0.002, 0.02, y) * (1 - smooth(topY - 0.024, topY - 0.01, y));
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  // la costura del torno: la primera columna y la última son el mismo lugar,
  // con la misma normal (si no, se ve una raya de arriba abajo)
  const nr = geo.attributes.normal;
  const seg = p.count / n - 1;
  for (let j = 0; j < n; j++) {
    const b = seg * n + j;
    const v = new THREE.Vector3(nr.getX(j) + nr.getX(b), nr.getY(j) + nr.getY(b), nr.getZ(j) + nr.getZ(b)).normalize();
    nr.setXYZ(j, v.x, v.y, v.z);
    nr.setXYZ(b, v.x, v.y, v.z);
  }
}

function kit(id, up, T, camoId) {
  const M = mats(T);
  const st = weaponStats(id, up);
  return {
    id,
    up: !!up,
    T,
    M,
    st,
    // el camuflaje de la armería (solo sin mejorar) y el del Pack-a-Pava del mapa
    skin: !up && camoId ? camoMaterial(camoId) : null,
    pap: st.elem ? M[`camo_${st.elem}`] : M.camo,
    mate: new THREE.Group(),
    anim: { spin: [], glow: [], wobble: null },
    top: { r: 0.03, y: 0.1 },
    rAt: () => 0.03,
  };
}
// La cáscara: con el Pack-a-Pava, el camuflaje del mapa (o `own`, la cara
// propia del mejorado); con camuflaje de la armería, ese.
const shell = (c, m, own = null) => (c.up ? own || c.pap : c.skin || m);

function addBody(c, pts, mat, { amp = 0, seg = 36 } = {}) {
  const geo = arcLathe(pts, seg);
  const rim = pts[pts.length - 1];
  if (amp) lumpy(geo, amp, rim[1], pts.length);
  const body = new THREE.Mesh(geo, mat);
  // la pared de adentro y el fondo (abajo de la yerba): sin ellos, al mirar la
  // boca se ve a través del costado de atrás
  body.add(new THREE.Mesh(arcLathe([[rim[0], rim[1]], [rim[0] - 0.0025, rim[1]], [rim[0] - 0.0025, rim[1] - 0.03], [0, rim[1] - 0.03]], seg), mat));
  c.mate.add(body);
  c.body = body;
  c.geo = geo;
  c.top = { r: rim[0], y: rim[1] };
  c.rAt = (y) => profileRadius(pts, y);
  return body;
}

// Lo que brilla arriba de la cáscara (la misma malla, un pelo más grande).
function addGlow(c, mat) {
  const m = new THREE.Mesh(c.geo, mat);
  m.scale.set(1.004, 1.001, 1.004);
  m.renderOrder = 1;
  c.body.add(m);
  return m;
}

function addVirola(c, mat, h = 0.012) {
  const { r, y } = c.top;
  const v = new THREE.Mesh(arcLathe([[r - 0.001, y - h], [r + 0.003, y - h], [r + 0.004, y - h / 2], [r + 0.003, y + 0.002], [r - 0.001, y + 0.002], [r - 0.001, y - h]], 36), mat);
  c.mate.add(v);
  return v;
}

// Lo que llena la boca (la yerba, las brasas, el remolino): un disco que
// llega hasta adentro de la pared (la pared queda a 2,5 mm del borde y esto a
// 1,8 mm: no queda luz entre el aro y la yerba). dome: la lomita (negativa, un embudo).
function fill(c, mat, { drop = 0.009, dome = 0.007, rough = 0.0012 } = {}) {
  const r = c.top.r - 0.0018;
  const g = new THREE.CircleGeometry(r, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    const d2 = (x * x + yy * yy) / (r * r);
    pos.setZ(i, dome >= 0 ? (1 - d2) * dome - (yy / r) * 0.0025 * (1 - d2) + Math.sin(x * 400) * Math.cos(yy * 380) * rough * (1 - d2 * d2) : (1 - Math.sqrt(d2)) * dome);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = c.top.y - drop;
  c.mate.add(m);
  return m;
}

// La mano, la boca (donde apunta el termo) y la inclinación de siempre
// (weapons/viewmodels.js buildMate).
function finish(c, muzzle, bombGroup, yerba, scale = 1.1) {
  const { mate, M } = c;
  // una malla por material (world/props.js compactGroup): los adornos son
  // muchas piezas chicas y cada una era un dibujo aparte. Lo que se mueve
  // (userData.dynamic) queda suelto, y la bombilla se junta por su lado:
  // gira aparte (al inspeccionar, y parada en la armería).
  if (bombGroup) mate.remove(bombGroup);
  compactGroup(mate);
  if (bombGroup) {
    for (const straw of bombGroup.children) compactGroup(straw);
    mate.add(bombGroup);
  }
  mate.add(cupHand(M, c.rAt, c.top.y));
  const mouth = new THREE.Object3D();
  mouth.position.set(0, c.top.y - 0.004, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(scale * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim: c.anim, upgraded: c.up, tip, mouth, mate, bombGroup, yerba, mk3: null };
}

// Un material con el juego de texturas de bakeSet: color, relieve, oclusión y rugosidad.
function setMat(S, { normal = 1, ao = 0.8, rough = 1, metal = 0, color = 0xffffff, physical = null } = {}) {
  const o = { map: S.map, normalMap: S.normal, normalScale: new THREE.Vector2(normal, normal), aoMap: S.orm, aoMapIntensity: ao, roughnessMap: S.orm, roughness: rough, metalness: metal, color };
  return physical ? new THREE.MeshPhysicalMaterial({ ...o, ...physical }) : new THREE.MeshStandardMaterial(o);
}

// Una textura de datos pintada a mano (la fila 0 del lienzo arriba, como bakeSet).
function dataTex(d, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(d.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const BASIC_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Lo que brilla en las grietas: la máscara (rojo: dónde; verde: un ruido que
// corre; azul: un desfase por parte) entre dos colores, latiendo.
function glowMat(mask, a, b, { k = 1, pulse = 2.3, scroll = [0.02, -0.05] } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uMask: { value: mask }, uTime: TIME, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uK: { value: k }, uS: { value: new THREE.Vector2(scroll[0], scroll[1]) }, uP: { value: pulse } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uK;
      uniform vec2 uS;
      uniform float uP;
      varying vec2 vUv;
      void main() {
        vec4 m = texture2D(uMask, vUv);
        float n = texture2D(uMask, vUv + uS * uTime).g;
        float w = 0.5 + 0.5 * sin(uTime * uP + vUv.y * 14.0 + m.b * 6.2831);
        // (casi todo del primer color; el segundo pasa en oleadas)
        float h = smoothstep(0.55, 0.95, n * 0.6 + w * 0.5);
        float a = m.r * (0.5 + 0.5 * w) * (0.6 + 0.8 * n) * uK;
        gl_FragColor = vec4(mix(uA, uB, h) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.onBeforeRender = clock;
  return m;
}

// Una llama (como la del castillo, world/castleFire, pero con sus colores y
// su semilla: la de allá la saca del lugar, y en la mano el mate se mueve).
function flameMat(outer, inner, seed) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: new THREE.Color(outer) }, uB: { value: new THREE.Color(inner) }, uSeed: { value: seed }, uK: { value: 1 } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uSeed;
      uniform float uK;
      varying vec2 vUv;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float t = uTime * 2.2 + uSeed;
        float x = (vUv.x - 0.5) * 2.0;
        float y = clamp(vUv.y, 0.0, 1.0);
        float turb = vn(vec2(x * 2.5, y * 3.0 - t * 1.6)) * 0.55 + vn(vec2(x * 5.0 + 3.0, y * 6.0 - t * 2.7)) * 0.3;
        float width = (1.0 - y) * 0.9 * (0.75 + 0.25 * sin(t * 3.0 + y * 6.0)) + 0.001;
        float dx = abs(x + (turb - 0.45) * 0.5 * y);
        float body = 1.0 - smoothstep(width * 0.25, width, dx);
        float tip = 1.0 - smoothstep(0.45 + turb * 0.3, 1.0, y);
        float a = clamp(body * smoothstep(0.0, 0.08, y) * tip * 1.25, 0.0, 1.0) * uK;
        if (a < 0.01) discard;
        vec3 col = mix(uA, uB, clamp(1.0 - (y + (1.0 - body) * 0.3) / 0.55, 0.0, 1.0));
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  m.onBeforeRender = clock;
  return m;
}
function flame(parent, mat, x, y, z, w, h) {
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const f = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = ry;
    m.userData.dynamic = true;
    f.add(m);
  }
  f.position.set(x, y, z);
  f.userData.dynamic = true;
  parent.add(f);
  return f;
}

// Un brillito que titila (la chispa de la mecha, la punta de la bombilla).
function sparkle(T, color, size, speed = 23) {
  const mat = new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 });
  mat.onBeforeRender = () => {
    clock();
    mat.opacity = 0.62 + Math.sin(TIME.value * speed) * 0.2 + Math.sin(TIME.value * speed * 2.7) * 0.14;
  };
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.userData.dynamic = true;
  return s;
}

// Un cono (o lo que sea, que apunta a +y) mirando para dir.
const UP = new THREE.Vector3(0, 1, 0);
function aim(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  return mesh;
}
// (a: el ángulo alrededor de la calabaza; la cámara ve de +z, a = π/2, a -x, a = π)
const ring = (a, r, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);

// ---------------- Mate Labrador ----------------
const LAB_PTS = [[0, 0], [0.024, 0.002], [0.042, 0.012], [0.052, 0.03], [0.055, 0.05], [0.052, 0.068], [0.044, 0.084], [0.036, 0.096], [0.033, 0.103], [0.035, 0.11]];
let LAB = null;
function labSets() {
  if (LAB) return LAB;
  const scr = scratches(31, 22, { len: [0.02, 0.06], ang: [0.4, 1.4], width: 0.0035 });
  // (metros de la vuelta y del perfil: los dibujos se piensan en metros)
  const W_M = 0.32;
  const H_M = 0.151;
  // El pirograbado: a cuánto queda este punto del trazo más cerca (m; menos
  // de 0, adentro del trazo) y cuánto relleno quemado tiene (los granos).
  const pyro = (u, hf) => {
    let d = 1;
    let fillK = 0;
    // las guardas pampas: una franja en zigzag entre dos líneas, con un punto en cada diente
    for (const [h0, h1] of [[0.36, 0.42], [0.72, 0.79]]) {
      if (hf < h0 - 0.03 || hf > h1 + 0.03) continue;
      const bh = (h1 - h0) * H_M;
      const t = (hf - h0) / (h1 - h0);
      d = Math.min(d, Math.min(Math.abs(t), Math.abs(t - 1)) * bh - 0.0005);
      if (t > 0 && t < 1) {
        const s = fract(u * 26);
        const tri = Math.abs(s - 0.5) * 2;
        d = Math.min(d, Math.abs(tri - t) * bh * 0.7 - 0.00045);
        const cell = W_M / 26;
        d = Math.min(d, Math.hypot((s - 0.5) * cell, (t - 0.78) * bh) - 0.0007, Math.hypot((fract(s + 0.5) - 0.5) * cell, (t - 0.22) * bh) - 0.0007);
      }
    }
    // las espigas de trigo entre las guardas: cinco alrededor
    if (hf > 0.44 && hf < 0.71) {
      const x = (fract(u * 5 + 0.1) - 0.5) * (W_M / 5);
      const y = (hf - 0.45) * H_M;
      const cx = Math.sin(y * 70) * 0.0012;
      // el tallo y dos hojas
      if (y > 0 && y < 0.02) d = Math.min(d, Math.abs(x - cx) - 0.00045);
      for (const sd of [-1, 1]) {
        const lx = x - cx - sd * 0.0036;
        const ly = y - (sd > 0 ? 0.0075 : 0.0105);
        const ca = Math.cos(sd * 0.75);
        const sa = Math.sin(sd * 0.75);
        const e = Math.hypot((lx * ca - ly * sa) / 0.0012, (lx * sa + ly * ca) / 0.0046);
        d = Math.min(d, Math.abs(e - 1) * 0.0012 - 0.0004);
      }
      // los granos, de a pares e inclinados para arriba
      for (let k = 0; k < 6; k++) {
        const gy = 0.0185 + k * 0.0031;
        for (const sd of [-1, 1]) {
          const dx = x - cx - sd * (0.0024 - k * 0.00018);
          const dy = y - gy;
          const ca = Math.cos(sd * 0.55);
          const sa = Math.sin(sd * 0.55);
          const e = Math.hypot((dx * ca - dy * sa) / 0.0014, (dx * sa + dy * ca) / 0.0027);
          d = Math.min(d, Math.abs(e - 1) * 0.0014 - 0.0004);
          fillK = Math.max(fillK, 1 - smooth(0.7, 1, e));
        }
      }
      // el grano de la punta y la barba
      {
        const e = Math.hypot((x - cx) / 0.0013, (y - 0.0375) / 0.0027);
        d = Math.min(d, Math.abs(e - 1) * 0.0013 - 0.0004);
        fillK = Math.max(fillK, 1 - smooth(0.7, 1, e));
      }
      for (const o of [-1.6, -0.6, 0.6, 1.6]) {
        const t = clamp((y - 0.033) / 0.008);
        if (y > 0.033 && y < 0.041) d = Math.min(d, Math.abs(x - cx - o * 0.0012 * (1 + t * 1.4)) - 0.0003);
      }
    }
    return [d, fillK];
  };
  const gourd = bakeSet(
    512,
    256,
    (u, v) => {
      const hf = 1 - v;
      const base = fbm(u, v, 6, 3, 4, 41);
      const fib = fbm(u, v, 110, 3, 3, 42);
      const patch = smooth(0.55, 0.75, fbm(u, v, 4, 2, 4, 43));
      const [d, fillK] = pyro(u, hf);
      // el trazo quemado, el relleno más claro y el halo tostado alrededor
      const line = 1 - smooth(0, 0.0005, d);
      const burn = Math.max(line, fillK * 0.55);
      const halo = (1 - smooth(0.0002, 0.0022, d)) * 0.35;
      const sc = scr(u, v);
      const tone = 0.88 + base * 0.24 + (fib - 0.5) * 0.14;
      let col = [188 * tone, 138 * tone, 68 * tone];
      col = [col[0] * (1 - patch * 0.2), col[1] * (1 - patch * 0.28), col[2] * (1 - patch * 0.38)];
      col = lerp3(col, [112, 66, 28], halo);
      col = lerp3(col, [52, 26, 12], burn);
      return {
        c: [col[0] + sc * 34, col[1] + sc * 26, col[2] + sc * 16],
        h: 0.55 + (base - 0.5) * 0.4 + (fib - 0.5) * 0.28 - line * 0.5 - fillK * 0.2 - sc * 0.1,
        r: 0.82 - patch * 0.14 + burn * 0.14 + (fib - 0.5) * 0.08,
      };
    },
    { color: true, scale: 1.5, ao: 1 },
  );
  // la paja de las fajas: las fibras a lo largo, con nudos
  const straw = bakeSet(
    256,
    64,
    (u, v) => {
      const fib = fbm(u, v, 3, 22, 3, 51);
      const fine = fbm(u, v, 6, 70, 2, 52);
      const knot = smooth(0.72, 0.8, fbm(u, v, 9, 3, 2, 53));
      const tone = 0.72 + fib * 0.5 - knot * 0.25;
      return { c: [218 * tone, 178 * tone, 92 * tone], h: 0.3 + fib * 0.5 + fine * 0.2 - knot * 0.2, r: 0.85 + (fine - 0.5) * 0.2 };
    },
    { color: true, scale: 1.6, ao: 0.9 },
  );
  for (const t of [straw.map, straw.normal, straw.orm]) t.repeat.set(26, 1);
  LAB = { gourd, straw };
  return LAB;
}

// Una faja trenzada alrededor de la calabaza a la altura y: tres cabos que se cruzan.
function braid(c, y, mat, { r = 0.0021, waves = 21, amp = 0.0021 } = {}) {
  const R = c.rAt(y) + r * 0.8 + 0.0012;
  for (let s = 0; s < 3; s++) {
    const pts = [];
    for (let i = 0; i < 168; i++) {
      const a = (i / 168) * Math.PI * 2;
      const ph = a * waves + (s * Math.PI * 2) / 3;
      const rr = R + Math.cos(ph) * r * 0.55;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, y + Math.sin(ph) * amp, Math.sin(a) * rr));
    }
    c.mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 210, r, 5, true), mat));
  }
}

function buildLabrador(up, T, hand, camoId) {
  const c = kit('labrador', up, T, camoId);
  const { M, mate } = c;
  const S = labSets();
  addBody(c, LAB_PTS, shell(c, setMat(S.gourd, { normal: 1.1 })), { amp: 0.014 });
  const straw = setMat(S.straw, { normal: 1.2 });
  braid(c, 0.016, straw);
  braid(c, 0.088, straw);
  // tres cartuchos metidos en la faja de arriba, del lado que se ve
  const hull = new THREE.MeshStandardMaterial({ color: 0xa8201a, roughness: 0.55 });
  for (const [i, a] of [1.72, 2.0, 2.28].entries()) {
    const sh = new THREE.Group();
    const tube = cyl(0.0042, 0.0042, 0.02, hull, 10);
    tube.position.y = 0.004;
    sh.add(tube);
    const brass = cyl(0.0045, 0.0045, 0.007, M.bronze, 10);
    brass.position.y = -0.0095;
    sh.add(brass);
    sh.position.copy(ring(a, c.rAt(0.082) + 0.0062, 0.084));
    sh.rotation.set(0.06 * (i - 1), 0, 0.05 * (1 - i));
    mate.add(sh);
  }
  // el manojito de trigo metido en la faja (de oro con el Pack-a-Pava)
  const wheat = up ? M.gold : new THREE.MeshStandardMaterial({ color: 0xd9ae4e, roughness: 0.62 });
  const grain = new THREE.SphereGeometry(1, 8, 6);
  for (const [i, da] of [-0.15, 0.02, 0.19].entries()) {
    const a = 2.86 + da;
    const lean = 0.012 + i * 0.004;
    const p = [ring(a, c.rAt(0.03) + 0.003, 0.03), ring(a, c.rAt(0.088) + 0.006, 0.088), ring(a + da * 0.4, 0.05 + lean, 0.112), ring(a + da * 0.8, 0.057 + lean * 1.6, 0.126 + i * 0.004)];
    mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 24, 0.0008, 5), wheat));
    // la espiga: los granos de a pares a lo largo de la punta, y la barba
    const axis = new THREE.Vector3().subVectors(p[3], p[2]).normalize();
    const side = new THREE.Vector3().crossVectors(axis, UP).normalize();
    for (let k = 0; k < 9; k++) {
      const g = new THREE.Mesh(grain, wheat);
      const sd = k % 2 ? 1 : -1;
      g.position.copy(p[3]).addScaledVector(axis, 0.002 + k * 0.0024).addScaledVector(side, sd * 0.0015);
      g.scale.set(0.0016, 0.0032, 0.0016);
      aim(g, axis.clone().addScaledVector(side, sd * 0.45));
      mate.add(g);
      if (k > 4) {
        const awn = cyl(0.00025, 0.00035, 0.014, wheat, 4);
        awn.position.copy(g.position).addScaledVector(axis, 0.009).addScaledVector(side, sd * 0.004);
        aim(awn, axis.clone().addScaledVector(side, sd * 0.4));
        mate.add(awn);
      }
    }
  }
  // el barrilito de perdigones al costado (el cargador de tambor), de madera con zunchos de hierro
  const keg = new THREE.Group();
  keg.add(new THREE.Mesh(arcLathe([[0, -0.025], [0.0155, -0.025], [0.0185, -0.013], [0.0198, 0], [0.0185, 0.013], [0.0155, 0.025], [0, 0.025]], 20), shell(c, M.wood)));
  for (const y of [-0.016, 0.016]) {
    const hoop = tor(0.0184, 0.0013, M.ironOld, 6, 22);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    keg.add(hoop);
  }
  for (const y of [-0.0255, 0.0255]) {
    const plug = cyl(0.004, 0.004, 0.003, M.bronze, 10);
    plug.position.y = y;
    keg.add(plug);
  }
  keg.rotation.x = Math.PI / 2;
  keg.position.set(-c.rAt(0.05) - 0.019, 0.05, 0.004);
  mate.add(keg);
  for (const z of [-0.012, 0.02]) {
    const strap = box(0.012, 0.005, 0.0045, M.ironOld);
    strap.position.set(-c.rAt(0.05) - 0.002, 0.05, z);
    mate.add(strap);
  }
  // la virola de hierro forjado con remaches de bronce
  addVirola(c, M.ironOld, 0.014);
  for (let i = 0; i < 12; i++) {
    const rv = sph(0.0016, M.bronze, 8, 6);
    rv.position.copy(ring((i / 12) * Math.PI * 2, c.top.r + 0.0038, c.top.y - 0.006));
    mate.add(rv);
  }
  const yerba = fill(c, M.yerba);
  for (const [x, z, rx, rz] of [[0.012, 0.012, 0.5, 0.3], [-0.008, 0.016, 0.4, -0.5], [0.004, 0.02, 0.7, 0.1]]) {
    const st = cyl(0.0007, 0.0007, 0.02, straw, 5);
    st.position.set(x, c.top.y, z);
    st.rotation.set(rx, 0, rz);
    mate.add(st);
  }
  // la bombilla de escopeta: gruesa, con el choke, el granito de mira y la funda de cuero
  const b = bombilla({ len: 0.25, thick: 1.9, mat: M.steel }, M, c.top.y);
  mate.add(b.group);
  const s = b.straws[0];
  const r = 0.0055 * 1.9;
  const choke = tor(r * 1.2, r * 0.3, M.ironOld, 6, 18);
  choke.rotation.x = Math.PI / 2;
  choke.position.y = b.len * 0.97;
  s.add(choke);
  const bead = sph(0.0026, M.bronze, 8, 6);
  bead.position.set(0, b.len * 0.985, r + 0.0022);
  s.add(bead);
  const sleeve = cyl(r * 1.22, r * 1.22, 0.05, M.leather, 12);
  sleeve.position.y = b.len * 0.48;
  s.add(sleeve);
  return finish(c, b.tips[0], b.group, yerba, 1);
}

// ---------------- Mate Explosivo ----------------
const EXP_PTS = [[0, 0], [0.03, 0.002], [0.046, 0.014], [0.052, 0.036], [0.053, 0.06], [0.05, 0.08], [0.045, 0.094], [0.043, 0.1], [0.044, 0.106]];
let EXP = null;
function expSets() {
  if (EXP) return EXP;
  const scr = scratches(47, 30, { len: [0.02, 0.09], ang: [0.3, 1.5], width: 0.0035 });
  const chipAt = (u, v) => smooth(0.63, 0.68, fbm(u, v, 12, 6, 5, 62));
  const gourd = bakeSet(
    512,
    256,
    (u, v) => {
      const hf = 1 - v;
      const n = fbm(u, v, 8, 4, 5, 61);
      const f = fbm(u, v, 12, 6, 5, 62);
      const chip = smooth(0.63, 0.68, f);
      // el borde levantado de la pintura donde saltó
      const lip = smooth(0.6, 0.63, f) * (1 - chip);
      const dent = fbm(u, v, 3, 2, 3, 63);
      const sc = scr(u, v);
      // la faja de peligro: rayas en diagonal amarillas y negras, y los filetes blancos
      const band = smooth(0.5, 0.505, hf) * (1 - smooth(0.635, 0.64, hf));
      const edge = Math.max(smooth(0.484, 0.489, hf) * (1 - smooth(0.495, 0.5, hf)), smooth(0.64, 0.645, hf) * (1 - smooth(0.651, 0.656, hf)));
      const tone = 0.84 + n * 0.32;
      let paint = [80 * tone, 90 * tone, 50 * tone];
      if (band > 0) paint = lerp3(paint, fract(u * 24 + hf * 3) < 0.5 ? [224 * tone, 178 * tone, 34 * tone] : [30, 28, 24], band);
      paint = lerp3(paint, [222 * tone, 216 * tone, 198 * tone], edge);
      let col = lerp3(paint, [152 * tone, 110 * tone, 60 * tone], chip);
      // el hollín de los cohetes, arriba
      const soot = smooth(0.8, 1, hf) * (0.55 + 0.45 * fbm(u, v, 12, 6, 3, 64));
      col = lerp3(col, [22, 20, 18], soot * 0.7);
      return {
        c: [col[0] + sc * 40, col[1] + sc * 38, col[2] + sc * 30],
        h: 0.55 + (dent - 0.5) * 0.35 + lip * 0.16 - chip * 0.22 + (n - 0.5) * 0.06 - sc * 0.12,
        r: 0.62 + chip * 0.28 + soot * 0.12 - sc * 0.15,
      };
    },
    { color: true, scale: 1.5, ao: 1 },
  );
  // el esténcil: letras blancas de plantilla, saltadas donde saltó la pintura
  const cv = gourd.map.image;
  const tmp = document.createElement('canvas');
  tmp.width = cv.width;
  tmp.height = cv.height;
  const x = tmp.getContext('2d');
  x.fillStyle = '#e8e4d4';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  // (del lado que se ve en la mano, entre el costado izquierdo y atrás; lejos de la costura)
  x.font = 'bold 23px "Arial Narrow", "Impact", "Arial", sans-serif';
  for (const [u, t] of [[0.895, 'NO CEBAR'], [0.36, 'POLVORA']]) x.fillText(t, u * cv.width, (1 - 0.755) * cv.height, 100);
  x.font = 'bold 16px "Arial Narrow", "Impact", "Arial", sans-serif';
  for (const [u, t] of [[0.895, '4 COHETES'], [0.36, 'LEY MATERA']]) x.fillText(t, u * cv.width, (1 - 0.4) * cv.height, 100);
  const img = x.getImageData(0, 0, cv.width, cv.height);
  for (let py = 0, i = 3; py < cv.height; py++) for (let px = 0; px < cv.width; px++, i += 4) if (img.data[i]) img.data[i] *= (1 - chipAt((px + 0.5) / cv.width, (py + 0.5) / cv.height)) * 0.88;
  x.putImageData(img, 0, 0);
  cv.getContext('2d').drawImage(tmp, 0, 0);
  gourd.map.needsUpdate = true;
  EXP = { gourd };
  return EXP;
}

function buildExplosivo(up, T, hand, camoId) {
  const c = kit('explosivo', up, T, camoId);
  const { M, mate } = c;
  const S = expSets();
  addBody(c, EXP_PTS, shell(c, setMat(S.gourd, { normal: 1.2, metal: 0.1 })), { amp: 0.012 });
  addVirola(c, M.ironOld, 0.016);
  const yerba = fill(c, M.yerba);
  // las cuatro bombillas cohete: un atado de dos por dos que apunta para adelante
  const olive = M.steel.clone();
  olive.color.set(0x5a6438);
  olive.metalness = 0.55;
  olive.roughness = 0.6;
  const tube = shell(c, olive);
  const noseMat = up ? M.gold : new THREE.MeshStandardMaterial({ color: 0xc02a1a, roughness: 0.4, metalness: 0.3, emissive: 0x4a0a04 });
  const pod = new THREE.Group();
  pod.position.set(0, c.top.y - 0.03, 0.006);
  pod.rotation.x = -VM_POSE.bombTilt;
  const L = 0.2;
  const sp = 0.0106;
  const tr = 0.0085;
  const tubeGeo = new THREE.CylinderGeometry(tr, tr, L, 16);
  const holeGeo = new THREE.CircleGeometry(tr * 0.84, 16);
  const noseGeo = new THREE.ConeGeometry(tr * 0.7, 0.024, 12);
  const noses = [];
  for (const [ix, iz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const t = new THREE.Mesh(tubeGeo, tube);
    t.position.set(ix * sp, L / 2, iz * sp);
    pod.add(t);
    const lip = tor(tr * 0.94, 0.0012, M.ironOld, 6, 16);
    lip.rotation.x = Math.PI / 2;
    lip.position.set(ix * sp, L, iz * sp);
    pod.add(lip);
    const hole = new THREE.Mesh(holeGeo, M.dark);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(ix * sp, L + 0.0003, iz * sp);
    pod.add(hole);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(ix * sp, L + 0.007, iz * sp);
    nose.userData.dynamic = true;
    pod.add(nose);
    noses.push(nose);
  }
  // (el hueco del medio, tapado)
  const core = cyl(sp * 0.8, sp * 0.8, L - 0.004, M.dark, 8);
  core.position.y = L / 2;
  pod.add(core);
  for (const k of [0.3, 0.8]) {
    const clamp4 = tor(sp * 1.414 + tr + 0.0004, 0.0018, M.steel, 6, 30);
    clamp4.rotation.x = Math.PI / 2;
    clamp4.position.y = L * k;
    pod.add(clamp4);
    const buckle = box(0.008, 0.006, 0.004, M.ironOld);
    buckle.position.set(0, L * k, sp * 1.414 + tr + 0.001);
    pod.add(buckle);
  }
  // la mira de aro, arriba del atado
  const post = box(0.002, 0.004, 0.01, M.ironOld);
  post.position.set(0, L * 0.56, sp + tr + 0.004);
  pod.add(post);
  const sight = tor(0.0058, 0.001, M.ironOld, 6, 18);
  sight.rotation.x = Math.PI / 2;
  sight.position.set(0, L * 0.56, sp + tr + 0.0145);
  pod.add(sight);
  const muzzle = new THREE.Object3D();
  muzzle.position.y = L + 0.012;
  pod.add(muzzle);
  const bg = new THREE.Group();
  bg.add(pod);
  mate.add(bg);
  // tres cartuchos de dinamita atados al costado, con la mecha prendida
  const paper = new THREE.MeshStandardMaterial({ color: 0xb42a1c, roughness: 0.85 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 });
  const cord = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1 });
  const R = c.rAt(0.05) + 0.0062;
  for (const da of [-0.125, 0, 0.125]) {
    const p = ring(Math.PI + da, R, 0.05);
    const stick = cyl(0.0061, 0.0061, 0.056, paper, 12);
    stick.position.copy(p);
    mate.add(stick);
    for (const sy of [-1, 1]) {
      const e = cyl(0.0056, 0.0056, 0.002, cap, 12);
      e.position.set(p.x, 0.05 + sy * 0.029, p.z);
      mate.add(e);
    }
  }
  for (const y of [0.034, 0.066]) {
    const band = tor(0.0165, 0.0011, cord, 5, 24);
    band.rotation.x = Math.PI / 2;
    band.position.set(-R + 0.004, y, 0);
    mate.add(band);
  }
  const f0 = new THREE.Vector3(-R, 0.079, 0);
  const fuse = [f0, new THREE.Vector3(-R - 0.006, 0.09, 0.003), new THREE.Vector3(-R - 0.004, 0.1, 0.009), new THREE.Vector3(-R - 0.011, 0.106, 0.012)];
  mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fuse), 16, 0.0009, 5), cord));
  const ember = sph(0.0016, M.glowGold, 6, 4);
  ember.position.copy(fuse[3]);
  mate.add(ember);
  const spark = sparkle(T, 0xffa040, 0.02);
  spark.position.copy(fuse[3]);
  mate.add(spark);
  // en cada bombilla se ve su cohete mientras quede en el cargador
  c.anim.tick = (dt, W) => {
    const n = W.slot?.id === 'explosivo' ? W.slot.mag : 4;
    for (let i = 0; i < 4; i++) noses[i].visible = i < n;
  };
  return finish(c, muzzle, bg, yerba, 0.98);
}

// ---------------- Mate Caótico ----------------
const CAO_PTS = [[0, 0], [0.022, 0.003], [0.038, 0.016], [0.046, 0.036], [0.047, 0.056], [0.042, 0.076], [0.034, 0.092], [0.03, 0.101], [0.032, 0.108]];
let CAO = null;
function caoSets() {
  if (CAO) return CAO;
  const W = 512;
  const H = 256;
  const mask = new Uint8Array(W * H * 4);
  // el tajo del desgarro: de abajo arriba por el lado que se ve, quebrado
  const rift = (u, hf) => {
    if (hf < 0.16 || hf > 0.93) return 0;
    const k = Math.sin(Math.PI * clamp((hf - 0.16) / 0.77));
    const cu = 0.9 + Math.sin(hf * 19) * 0.016 + Math.sin(hf * 47 + 1) * 0.008;
    let du = Math.abs(u - cu);
    du = Math.min(du, 1 - du);
    return 1 - smooth(0.004 + k * 0.009, 0.007 + k * 0.016, du);
  };
  const gourd = bakeSet(
    W,
    H,
    (u, v, px, py) => {
      const hf = 1 - v;
      const [d1, d2, id, ox, oy] = voronoi(u, v, 14, 6, 91, 1);
      const edge = d2 - d1;
      const crack = 1 - smooth(0.02, 0.09, edge);
      const hair = 1 - smooth(0.0, 0.035, edge);
      const rf = rift(u, hf);
      const n = fbm(u, v, 24, 12, 3, 93);
      const flow = fbm(u, v, 9, 5, 3, 94);
      // cada faceta inclinada para su lado: el reflejo salta de una a otra
      const tiltK = (ox * (hash(Math.floor(id * 9973), 1, 92) - 0.5) + oy * (hash(Math.floor(id * 9973), 2, 92) - 0.5)) * 1.1;
      const j = (py * W + px) * 4;
      mask[j] = clamp(Math.max(hair * (0.35 + 0.65 * smooth(0.35, 0.7, flow)), rf)) * 255;
      mask[j + 1] = flow * 255;
      mask[j + 2] = id * 255;
      mask[j + 3] = 255;
      // obsidiana violeta casi negra; alguna faceta tira a petróleo
      let col = lerp3([16, 11, 26], [30, 18, 48], id);
      if (id > 0.72) col = lerp3(col, [12, 34, 40], 0.6);
      col = lerp3(col, [4, 2, 8], Math.max(crack * 0.7, rf));
      return {
        c: [col[0] * (0.85 + n * 0.3), col[1] * (0.85 + n * 0.3), col[2] * (0.85 + n * 0.3)],
        h: 0.6 + tiltK * 0.5 - crack * 0.42 - rf * 0.55 + (n - 0.5) * 0.05,
        r: 0.3 + (n - 0.5) * 0.14 + crack * 0.5,
      };
    },
    { color: true, scale: 2.2, ao: 0.9 },
  );
  CAO = { gourd, mask: dataTex(mask, W, H) };
  return CAO;
}

// Las astillas que le orbitan: una sola malla, y el shader hace girar cada
// una sobre sí misma y alrededor de la calabaza.
function shardGeo(n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    const sx = 0.004 + hash(i, 1, 201) * 0.004;
    const sy = 0.008 + hash(i, 2, 201) * 0.007;
    const sz = 0.0018 + hash(i, 3, 201) * 0.002;
    for (let k = 0; k < p.count; k++) {
      // (el mismo corrimiento para las copias del mismo vértice: no se abre)
      const q = [Math.round(p.getX(k) * 7), Math.round(p.getY(k) * 7), Math.round(p.getZ(k) * 7)];
      const jx = 1 + (hash(q[0] + i * 31, q[1], q[2] + 5) - 0.5) * 0.7;
      p.setXYZ(k, p.getX(k) * sx * jx, p.getY(k) * sy * (1 + (hash(q[1], q[2], q[0] + i * 17) - 0.5) * 0.5), p.getZ(k) * sz * jx);
    }
    const a = (i / n) * Math.PI * 2 + hash(i, 4, 201) * 0.6;
    const R = 0.066 + hash(i, 5, 201) * 0.016;
    const y = 0.02 + hash(i, 6, 201) * 0.058;
    const cen = [Math.cos(a) * R, y, Math.sin(a) * R];
    g.translate(cen[0], cen[1], cen[2]);
    g.computeVertexNormals();
    const cA = new Float32Array(p.count * 3);
    const oA = new Float32Array(p.count * 4);
    const sgn = i % 3 === 0 ? -1 : 1;
    for (let k = 0; k < p.count; k++) {
      cA.set(cen, k * 3);
      oA.set([hash(i, 7, 201) * 6.28, sgn * (0.35 + hash(i, 8, 201) * 0.4), hash(i, 9, 201) * 6.28, 0.6 + hash(i, 10, 201) * 1.4], k * 4);
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(cA, 3));
    g.setAttribute('aOrb', new THREE.BufferAttribute(oA, 4));
    parts.push(g);
  }
  return mergeGeometries(parts);
}
function shardMat(base, glow) {
  const m = base.clone();
  m.emissive = new THREE.Color(glow).multiplyScalar(0.22);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aCenter;
        attribute vec4 aOrb;
        uniform float uTime;
        vec2 mduR2(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float mduSp = uTime * aOrb.w + aOrb.x * 3.0;
        float mduAng = uTime * aOrb.y + aOrb.x;
        vec3 objectNormal = vec3( normal );
        objectNormal.xy = mduR2(objectNormal.xy, mduSp);
        objectNormal.yz = mduR2(objectNormal.yz, mduSp * 0.7);
        objectNormal.xz = mduR2(objectNormal.xz, mduAng);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = position - aCenter;
        transformed.xy = mduR2(transformed.xy, mduSp);
        transformed.yz = mduR2(transformed.yz, mduSp * 0.7);
        vec3 mduC = aCenter;
        mduC.y += sin(uTime * 1.3 + aOrb.z) * 0.005;
        transformed += mduC;
        transformed.xz = mduR2(transformed.xz, mduAng);`,
      );
  };
  m.customProgramCacheKey = () => 'mdu-caos-astilla';
  m.onBeforeRender = clock;
  return m;
}

// El anillo de vacío: rayas de luz que corren alrededor.
function ringMat(a, b, k = 1.4) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uK: { value: k } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uK;
      varying vec2 vUv;
      void main() {
        float d = fract(vUv.x * 7.0 - uTime * 0.3);
        float a = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.35, 0.85, d));
        float fine = 0.75 + 0.25 * sin(vUv.x * 190.0 + uTime * 9.0);
        gl_FragColor = vec4(mix(uB, uA, d) * a * fine * uK, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  m.onBeforeRender = clock;
  return m;
}

// El remolino del caos en la boca: brazos en espiral que caen al agujero del medio.
function vortexMat(a, b) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      varying vec2 vUv;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float sw = ang * 3.0 + r * 9.0 - uTime * 2.4;
        float arms = 0.5 + 0.5 * sin(sw);
        float arms2 = 0.5 + 0.5 * sin(sw * 2.0 + 1.7 + uTime * 0.7);
        vec3 col = mix(uA, uB, arms2) * (arms * arms * 0.9 + 0.06);
        // motas que caen al medio
        vec2 cell = vec2(floor(ang * 5.1), floor(r * 9.0 + uTime * 1.6));
        col += vec3(0.9, 0.95, 1.0) * step(0.93, h1(cell)) * smoothstep(0.15, 0.5, r) * 0.6;
        // el agujero negro del medio y el borde que se apaga contra la virola
        col *= smoothstep(0.1, 0.42, r) * (1.0 - 0.55 * smoothstep(0.8, 1.0, r));
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
    fog: false,
  });
  m.onBeforeRender = clock;
  return m;
}

function buildCaotico(up, T, hand, camoId) {
  const c = kit('caotico', up, T, camoId);
  const { M, mate } = c;
  const S = caoSets();
  // (mejorado: el eclipse de sangre)
  const A = up ? 0xff2018 : 0x8a38ff;
  const B = up ? 0xffc040 : 0x38e8ff;
  const obsid = setMat(S.gourd, { normal: 1.3, rough: 0.75, metal: 0.15, color: up ? 0xffb8a8 : 0xffffff, physical: { clearcoat: 0.8, clearcoatRoughness: 0.14 } });
  addBody(c, CAO_PTS, shell(c, obsid, obsid));
  addGlow(c, glowMat(S.mask, A, B, { k: 1.0, pulse: 2.0, scroll: [0.015, -0.04] }));
  // las astillas que orbitan y el anillo de vacío
  const shards = new THREE.Mesh(shardGeo(up ? 9 : 7), shardMat(obsid, A));
  shards.frustumCulled = false;
  shards.userData.dynamic = true;
  mate.add(shards);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0013, 6, 96), ringMat(A, B, 0.9));
  halo.position.y = 0.05;
  halo.rotation.set(Math.PI / 2 + 0.3, 0.25, 0);
  mate.add(halo);
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.0685, 0.0007, 5, 80), ringMat(B, A, 0.6));
  halo2.position.y = 0.046;
  halo2.rotation.set(Math.PI / 2 - 0.38, -0.5, 0);
  mate.add(halo2);
  // la virola: la corona del eclipse, de oro, con los rayos
  addVirola(c, M.gold, 0.012);
  const rayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(up ? 0xff5030 : 0xffc860), toneMapped: false });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const len = i % 2 ? 0.008 : 0.014;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.0011, len, 5), rayMat);
    const dir = new THREE.Vector3(Math.cos(a), 0.55, Math.sin(a)).normalize();
    ray.position.copy(ring(a, c.top.r + 0.003, c.top.y - 0.004)).addScaledVector(dir, len / 2);
    mate.add(aim(ray, dir));
  }
  // la boca: el remolino (un embudo que llega hasta la pared de adentro)
  const yerba = fill(c, vortexMat(A, B), { drop: 0.004, dome: -0.011 });
  // la bombilla de hierro negro, con tres aros de vacío que giran y la mota en la punta
  const b = bombilla({ len: 0.24, thick: 1.6, mat: M.bladeDark }, M, c.top.y);
  mate.add(b.group);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(A).multiplyScalar(1.1), toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const rg = tor(0.014 - i * 0.002, 0.0018, i === 1 ? M.gold : glow, 6, 24);
    rg.rotation.x = Math.PI / 2;
    rg.position.y = b.len * (0.46 + i * 0.16);
    rg.userData.dynamic = true;
    b.straws[0].add(rg);
    c.anim.spin.push(rg);
  }
  const mote = sparkle(T, B, 0.022, 11);
  mote.position.y = 0.004;
  b.tips[0].add(mote);
  return finish(c, b.tips[0], b.group, yerba, 1.05);
}

// ---------------- Llamarada Matera ----------------
const LLA_PTS = [[0, 0], [0.022, 0.002], [0.04, 0.013], [0.049, 0.035], [0.051, 0.057], [0.046, 0.079], [0.037, 0.094], [0.032, 0.102], [0.034, 0.11]];
let LLA = null;
function llaSets() {
  if (LLA) return LLA;
  const W = 512;
  const H = 256;
  const mask = new Uint8Array(W * H * 4);
  const COLS = 16;
  // (cuántas celdas de alto tiene el perfil, para que las escamas salgan redondas)
  const TALL = COLS * 0.47;
  const RAD = 0.57;
  // La escama que cubre este punto: círculos en filas cada media celda, cada
  // fila corrida media celda, y las de arriba tapan a las de abajo (de cada
  // una se ve el arco de abajo, como en un lomo de dragón). Devuelve [qué tan
  // lejos del centro (1: el borde), dx, un número de la escama].
  const scaleAt = (u, hf) => {
    const x = u * COLS;
    const y = hf * TALL;
    const r0 = Math.floor(y * 2);
    for (let r = r0 + 2; r >= r0 - 1; r--) {
      const off = (r & 1) * 0.5;
      const c0 = Math.round(x - off);
      let best = null;
      for (const cc of [c0 - 1, c0, c0 + 1]) {
        const dx = x - (cc + off);
        const d = Math.hypot(dx, y - r * 0.5) / RAD;
        if (d < 1 && (!best || d < best[0])) best = [d, dx, hash(((cc % COLS) + COLS) % COLS, r, 77)];
      }
      if (best) return best;
    }
    return null;
  };
  const gourd = bakeSet(
    W,
    H,
    (u, v, px, py) => {
      const hf = 1 - v;
      const s = scaleAt(u, hf);
      const n = fbm(u, v, 30, 15, 3, 71);
      const big = fbm(u, v, 5, 3, 3, 72);
      const flow = fbm(u, v, 8, 4, 3, 73);
      const j = (py * W + px) * 4;
      let col;
      let h;
      let r;
      let lava;
      if (!s) {
        lava = 1;
        col = [70, 16, 6];
        h = 0.05;
        r = 0.9;
      } else {
        const [d, dx, id] = s;
        // la brasa en el surco, la escama abombada con su lomo en el medio
        lava = smooth(0.84, 0.98, d);
        const dome = Math.sqrt(Math.max(0, 1 - d * d));
        const ridge = (1 - smooth(0, 0.1, Math.abs(dx))) * smooth(0.2, 0.9, d) * (1 - lava);
        h = 0.1 + dome * 0.6 + ridge * 0.22 + (n - 0.5) * 0.12;
        const ash = smooth(0.5, 0.98, dome) * (0.3 + id * 0.7);
        col = lerp3([24, 11, 9], [74, 40, 30], ash * 0.7);
        col = lerp3(col, [110, 96, 90], smooth(0.64, 0.82, n) * ash * 0.45);
        col = lerp3(col, [84, 18, 6], lava * 0.85);
        r = 0.42 + (1 - dome) * 0.4 + (n - 0.5) * 0.2;
      }
      // cerca de la boca y del pie se apagan (ahí van la virola y la base)
      lava *= smooth(0.06, 0.14, hf) * (1 - smooth(0.9, 0.97, hf));
      mask[j] = clamp(lava * (0.45 + 0.55 * smooth(0.3, 0.7, big))) * 255;
      mask[j + 1] = flow * 255;
      mask[j + 2] = (s ? s[2] : 0.5) * 255;
      mask[j + 3] = 255;
      return { c: [col[0] * (0.82 + big * 0.36), col[1] * (0.82 + big * 0.36), col[2] * (0.82 + big * 0.36)], h, r };
    },
    { color: true, scale: 2.4, ao: 1 },
  );
  LLA = { gourd, mask: dataTex(mask, W, H) };
  return LLA;
}

// Las brasas de la boca: manchas que se prenden y se apagan.
function emberMat(mask, a, b) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uMask: { value: mask }, uTime: TIME, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      varying vec2 vUv;
      void main() {
        float n = texture2D(uMask, vUv * vec2(0.5, 0.9) + vec2(uTime * 0.008, 0.0)).g;
        float n2 = texture2D(uMask, vUv * vec2(0.9, 1.7) - vec2(0.0, uTime * 0.013)).g;
        float heat = clamp(n * 1.5 + n2 * 0.9 - 0.75 + 0.12 * sin(uTime * 2.6 + vUv.x * 17.0), 0.0, 1.0);
        vec3 col = mix(vec3(0.035, 0.015, 0.012), uA, smoothstep(0.2, 0.6, heat));
        col = mix(col, uB, smoothstep(0.65, 1.0, heat));
        gl_FragColor = vec4(col * 1.7, 1.0);
      }`,
    toneMapped: false,
    fog: false,
  });
  m.onBeforeRender = clock;
  return m;
}

// Las chispas que suben de la boca (puntos; el shader las hace subir y volver a empezar).
function sparksUp(y, n, a, b, r) {
  const pos = new Float32Array(n * 3);
  const e = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos.set([0, y, 0], i * 3);
    const ang = hash(i, 1, 301) * 6.28;
    const rr = Math.sqrt(hash(i, 2, 301)) * r;
    e.set([Math.cos(ang) * rr, Math.sin(ang) * rr, hash(i, 3, 301), 0.35 + hash(i, 4, 301) * 0.5], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aE', new THREE.BufferAttribute(e, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aE;
      uniform float uTime;
      varying float vK;
      void main() {
        float k = fract(aE.z + uTime * aE.w);
        vec3 p = position;
        p.x += aE.x + sin(uTime * 3.0 + aE.z * 20.0) * 0.005 * k;
        p.z += aE.y + cos(uTime * 2.6 + aE.z * 13.0) * 0.005 * k;
        p.y += k * 0.075;
        vK = k;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 2.6 * (1.0 - k * 0.6) / max(0.08, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uK;
      varying float vK;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.15, 0.5, r)) * (1.0 - vK) * uK;
        gl_FragColor = vec4(mix(uB, uA, vK) * a * 2.2, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  mat.onBeforeRender = clock;
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.userData.dynamic = true;
  return p;
}

let FLAME_SHAPE = null;
function crownGeo() {
  if (FLAME_SHAPE) return FLAME_SHAPE;
  const s = new THREE.Shape();
  s.moveTo(-0.0042, 0);
  s.quadraticCurveTo(-0.005, 0.006, -0.0016, 0.009);
  s.quadraticCurveTo(-0.0034, 0.0125, 0.0006, 0.018);
  s.quadraticCurveTo(0.0002, 0.0125, 0.0026, 0.0105);
  s.quadraticCurveTo(0.005, 0.006, 0.0042, 0);
  s.lineTo(-0.0042, 0);
  FLAME_SHAPE = new THREE.ExtrudeGeometry(s, { depth: 0.0014, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, -0.0007);
  return FLAME_SHAPE;
}

function buildLlamarada(up, T, hand, camoId) {
  const c = kit('llamarada', up, T, camoId);
  const { M, mate } = c;
  const S = llaSets();
  // (mejorada: el fuego azul del dragón)
  const F0 = up ? 0x1a48ff : 0xff3a08;
  const F1 = up ? 0xa8dcff : 0xffb838;
  const scales = setMat(S.gourd, { normal: 1.5, rough: 0.9, metal: 0.25, color: up ? 0x9aa8e0 : 0xffffff });
  addBody(c, LLA_PTS, shell(c, scales, scales));
  addGlow(c, glowMat(S.mask, F0, F1, { k: 2.4, pulse: 3.1, scroll: [0.01, 0.05] }));
  // la base y las tres patas del Imperial, pero de hierro quemado y con garras de oro
  const iron = M.ironOld.clone();
  iron.color.set(0x241e1c);
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(F0).multiplyScalar(1.8), toneMapped: false });
  mate.add(new THREE.Mesh(arcLathe([[0, -0.012], [0.03, -0.012], [0.034, 0.004], [0.028, 0.012], [0, 0.012]], 28), iron));
  const seam = tor(0.0338, 0.0009, hot, 5, 36);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.0045;
  mate.add(seam);
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 + 2.2;
    for (const [da, k] of [[-0.3, 0.8], [0, 1], [0.3, 0.8]]) {
      const a = a0 + da;
      const p0 = ring(a, 0.024, -0.008);
      const p1 = ring(a, 0.024 + 0.014 * k, -0.016 - 0.002 * k);
      mate.add(VM.limb(p0, p1, 0.0042 * k, iron));
      const dir = new THREE.Vector3(Math.cos(a) * 0.55, -1, Math.sin(a) * 0.55).normalize();
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.0036 * k, 0.014 * k, 7), M.gold);
      talon.position.copy(p1).addScaledVector(dir, 0.006 * k);
      mate.add(aim(talon, dir));
    }
  }
  // la faja de oro con rubíes (zafiros, mejorada)
  mate.add(new THREE.Mesh(arcLathe([[0.0502, 0.0435], [0.0528, 0.0462], [0.053, 0.0528], [0.0508, 0.0555]], 36), M.gold));
  const gem = new THREE.MeshBasicMaterial({ color: new THREE.Color(up ? 0x3080ff : 0xff2010).multiplyScalar(1.6), toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const g = sph(0.002, gem, 8, 6);
    g.position.copy(ring((i / 8) * Math.PI * 2 + 0.2, 0.0532, 0.0495));
    g.scale.set(1, 1.3, 1);
    mate.add(g);
  }
  // la virola de hierro y la corona de llamas de oro (adelante no: por ahí sale la bombilla)
  addVirola(c, iron, 0.014);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.29;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.5) continue;
    const sp = new THREE.Mesh(crownGeo(), M.gold);
    sp.position.copy(ring(a, c.top.r + 0.002, c.top.y - 0.002));
    sp.rotation.order = 'YXZ';
    sp.rotation.set(0.32, Math.PI / 2 - a, 0);
    sp.scale.setScalar(i % 2 ? 0.8 : 1.05);
    mate.add(sp);
  }
  // la boca: llena de brasas hasta la pared de adentro, con carbones, fuego y chispas
  const yerba = fill(c, emberMat(S.mask, F0, F1), { drop: 0.008, dome: 0.006, rough: 0.002 });
  const coal = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5;
    const lump = new THREE.Mesh(coal, i % 3 === 1 ? hot : iron);
    lump.position.copy(ring(a, i % 2 ? 0.019 : 0.011, c.top.y - 0.004));
    lump.scale.setScalar(0.0045 + hash(i, 1, 401) * 0.0028);
    lump.rotation.set(a, a * 2, a * 3);
    mate.add(lump);
  }
  const fires = [];
  for (const [i, [x, z, w, h]] of [[0.004, 0.012, 0.03, 0.045], [-0.012, 0.002, 0.022, 0.032], [0.012, -0.006, 0.02, 0.028]].entries()) {
    const fm = flameMat(F0, F1, i * 2.7 + 0.5);
    flame(mate, fm, x, c.top.y - 0.006, z, w, h);
    fires.push(fm);
  }
  const sparks = sparksUp(c.top.y - 0.002, 14, F0, F1, c.top.r * 0.7);
  mate.add(sparks);
  // la bombilla de hierro negro con la punta al rojo
  const b = bombilla({ len: 0.24, thick: 1.3, mat: M.bladeDark }, M, c.top.y);
  mate.add(b.group);
  const r = 0.0055 * 1.3;
  const heat = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.12, r * 1.12, b.len * 0.4, 10, 1, true),
    new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color(F0) }, uB: { value: new THREE.Color(F1) } },
      vertexShader: BASIC_VS,
      fragmentShader: /* glsl */ `uniform vec3 uA; uniform vec3 uB; varying vec2 vUv; void main() { float k = vUv.y * vUv.y; gl_FragColor = vec4(mix(uA, uB, k * k) * k * 1.3, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    }),
  );
  heat.position.y = b.len * 0.8;
  b.straws[0].add(heat);
  for (const k of [0.5, 0.6]) {
    const fin = tor(r * 1.7, r * 0.45, M.gold, 6, 14);
    fin.rotation.x = Math.PI / 2;
    fin.position.y = b.len * k;
    b.straws[0].add(fin);
  }
  const tipGlow = sparkle(T, F1, 0.028, 17);
  tipGlow.position.y = 0.004;
  b.tips[0].add(tipGlow);
  // al apuntar, el fuego de la boca se achica (que no tape la mira)
  c.anim.tick = (dt, W) => {
    const k = 1 - (W.adsT || 0) * 0.85;
    for (const fm of fires) fm.uniforms.uK.value = k;
    sparks.material.uniforms.uK.value = k;
  };
  return finish(c, b.tips[0], b.group, yerba, 1.05);
}

registerMate('labrador', buildLabrador);
registerMate('explosivo', buildExplosivo);
registerMate('caotico', buildCaotico);
registerMate('llamarada', buildLlamarada);
