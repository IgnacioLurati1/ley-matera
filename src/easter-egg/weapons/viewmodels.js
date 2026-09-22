import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { weaponStats, ELEM_INFO } from '../config/weapons';

// Modelos 3D de los mates-arma, armados con geometría procedural.
// Se construyen parados (eje y) con la bombilla saliendo hacia arriba y luego
// se inclinan para que la bombilla (el cañón) apunte hacia adelante (-z).

let MATS = null;
// Pose del mate en la mano (ajustable).
export const VM_POSE = { pitch: 0.15, roll: -0.12, yaw: 0.45, scale: 1, bombTilt: 1.45 };
function mats(T) {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
  MATS = {
    gourd: std({ map: T.gourd, roughness: 0.75 }),
    gourdDark: std({ map: T.gourd, color: 0x6a4a30, roughness: 0.7 }),
    wood: std({ map: T.woodCarved, roughness: 0.65 }),
    woodDark: std({ map: T.woodCarved, color: 0x7a5238, roughness: 0.6 }),
    plastic: std({ color: 0xe8589a, roughness: 0.35 }),
    plasticWhite: std({ color: 0xf2efe8, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe8e0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false }),
    aluminium: std({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.3 }),
    leather: std({ map: T.leather, roughness: 0.8 }),
    silver: std({ color: 0xe6e6e6, metalness: 1, roughness: 0.18 }),
    silverDark: std({ color: 0xb0b0b0, metalness: 1, roughness: 0.3 }),
    bronze: std({ color: 0xb07a3a, metalness: 1, roughness: 0.3 }),
    gold: std({ color: 0xffc640, metalness: 1, roughness: 0.2 }),
    copper: std({ color: 0xc86a3a, metalness: 1, roughness: 0.3 }),
    silicone: std({ color: 0x2ec4b6, roughness: 0.55 }),
    ceramic: std({ color: 0xf4f0e8, roughness: 0.25 }),
    // las guampas son un tubo abierto: se ven de los dos lados al mirar adentro
    horn: std({ color: 0xd9c49a, roughness: 0.45, side: THREE.DoubleSide }),
    hornDark: std({ color: 0x3a2a1c, roughness: 0.45 }),
    red: std({ color: 0xa81c1c, metalness: 0.6, roughness: 0.35 }),
    dark: std({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.4 }),
    yerba: std({ map: T.yerba, roughness: 1 }),
    teabag: std({ color: 0xe8dcc0, roughness: 1 }),
    glowGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dff6a).multiplyScalar(2.5), toneMapped: false }),
    glowRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2.5), toneMapped: false }),
    glowBlue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ac8ff).multiplyScalar(3), toneMapped: false }),
    glowGold: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd34a).multiplyScalar(2.5), toneMapped: false }),
    ice: new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }),
    lemon: std({ color: 0xf2e040, roughness: 0.5 }),
    skin: new THREE.MeshPhysicalMaterial({ map: T.skin, color: 0xc98b68, roughness: 0.52, sheen: 0.5, sheenColor: new THREE.Color(0xff9c80), sheenRoughness: 0.55 }),
    nail: std({ color: 0xe6c2ae, roughness: 0.25 }),
    sleeve: std({ map: T.wool, color: 0x5a5a44, roughness: 1 }),
    cuff: std({ map: T.wool, color: 0x3e3a2c, roughness: 1 }),
    glove: std({ color: 0x6a4a32, roughness: 0.8 }),
    termo: std({ color: 0xa81c1c, roughness: 0.3, metalness: 0.3 }),
    water: new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55 }),
    steel: std({ color: 0xd0d4d8, metalness: 1, roughness: 0.25 }),
  };
  // Camuflaje del Pack-a-Pava: fluorescente y animado.
  MATS.camo = new THREE.MeshStandardMaterial({ map: T.camo, emissiveMap: T.camo, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });
  // segunda mejora: el mismo camuflaje teñido del color del elemento
  for (const [k, e] of Object.entries(ELEM_INFO)) {
    MATS[`camo_${k}`] = MATS.camo.clone();
    MATS[`camo_${k}`].color.set(e.color).lerp(new THREE.Color(0xffffff), 0.35);
    MATS[`camo_${k}`].emissive.set(e.color);
    MATS[`camo_${k}`].emissiveIntensity = 1.2;
  }
  for (const k of Object.keys(MATS)) if (k.startsWith('camo')) MATS[k].side = THREE.DoubleSide;
  return MATS;
}

const lathe = (pts, mat, seg = 24) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
const cyl = (rt, rb, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const sph = (r, mat, ws = 12, hs = 8) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
const tor = (r, t, mat, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.Mesh(new THREE.TorusGeometry(r, t, rs, ts, arc), mat);

const PROFILES = {
  calabaza: [[0, 0], [0.02, 0.002], [0.036, 0.012], [0.044, 0.032], [0.046, 0.052], [0.042, 0.072], [0.034, 0.086], [0.029, 0.093], [0.031, 0.1]],
  porongo: [[0, 0], [0.024, 0.003], [0.038, 0.018], [0.04, 0.036], [0.033, 0.062], [0.024, 0.088], [0.021, 0.108], [0.023, 0.116]],
  cilindro: [[0, 0], [0.033, 0], [0.036, 0.006], [0.038, 0.05], [0.037, 0.092], [0.035, 0.102]],
  cup: [[0, 0], [0.028, 0], [0.03, 0.004], [0.041, 0.1], [0.043, 0.102]],
  lata: [[0, 0], [0.034, 0], [0.037, 0.004], [0.037, 0.098], [0.035, 0.103]],
  camionero: [[0, 0], [0.03, 0.002], [0.054, 0.02], [0.061, 0.05], [0.058, 0.082], [0.05, 0.102], [0.048, 0.112]],
  torpedo: [[0, 0], [0.01, 0.01], [0.026, 0.04], [0.035, 0.08], [0.034, 0.12], [0.027, 0.142], [0.026, 0.152]],
  soft: [[0, 0], [0.03, 0], [0.036, 0.012], [0.041, 0.06], [0.039, 0.1]],
  mug: [[0, 0], [0.037, 0], [0.04, 0.005], [0.04, 0.09], [0.042, 0.095]],
};

function topOf(profile) {
  const last = profile[profile.length - 1];
  return { r: last[0], y: last[1] };
}

// Yerba dentro de la boca: una lomita pareja que no se sale del borde.
function yerba(r, y, M) {
  const g = new THREE.CircleGeometry(r * 0.93, 24, 0, Math.PI * 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    const d2 = (x * x + yy * yy) / (r * r);
    // un poco más alta del lado de la bombilla (atrás) y rugosa
    pos.setZ(i, (1 - d2) * 0.007 - (yy / r) * 0.0025 + Math.sin(x * 400) * Math.cos(yy * 380) * 0.0012);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.yerba);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y - 0.009;
  return m;
}

// Bombilla: caño, pico curvo y filtro. Devuelve el grupo y la punta.
function bombilla({ len = 0.24, thick = 1, mat, tilt = VM_POSE.bombTilt, count = 1, spread = 0.02, bend = 0 }, M, y) {
  const g = new THREE.Group();
  const tips = [];
  const straws = [];
  const r = 0.0055 * thick;
  for (let k = 0; k < count; k++) {
    const b = new THREE.Group();
    const tube = cyl(r, r, len, mat || M.silver, 8);
    tube.position.y = len / 2;
    b.add(tube);
    const filter = new THREE.Mesh(new THREE.SphereGeometry(r * 3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat || M.silver);
    filter.rotation.x = Math.PI;
    b.add(filter);
    // pico: tramo corto doblado
    const pico = new THREE.Group();
    pico.position.y = len;
    // el pico se dobla para el mismo lado que se inclina la bombilla
    pico.rotation.x = tilt < 0 ? 0.35 + bend : -0.35 - bend;
    const p = cyl(r * 0.85, r, 0.028, mat || M.silver, 8);
    p.position.y = 0.014;
    pico.add(p);
    const tip = new THREE.Object3D();
    tip.position.y = 0.03;
    pico.add(tip);
    b.add(pico);
    // anillo decorativo
    const ring = tor(r * 1.6, r * 0.5, mat || M.silver, 6, 12);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = len * 0.72;
    b.add(ring);
    b.position.set((k - (count - 1) / 2) * spread, y - 0.03, 0.006);
    b.rotation.x = -tilt;
    g.add(b);
    tips.push(tip);
    straws.push(b);
  }
  return { group: g, tips, straws, len };
}

// ---------------- manos ----------------
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Cápsula entre dos puntos (falanges, muñeca).
function limb(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 4, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  return m;
}

// Uña en la punta de un dedo, mirando hacia afuera.
function nail(tip, along, out, r, M) {
  const n = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 8, 6), M.nail);
  n.scale.set(1, 0.32, 1.25);
  n.position.copy(tip).addScaledVector(out, r * 0.62).addScaledVector(along, -r * 0.35);
  const side = new THREE.Vector3().crossVectors(along, out).normalize();
  const basis = new THREE.Matrix4().makeBasis(side, out, along);
  n.quaternion.setFromRotationMatrix(basis);
  return n;
}

// Antebrazo: muñeca de piel, puño de lana enrollado y la manga que sale de cuadro.
function forearm(g, M, from, dir, { wrist = 0.021, sleeveR = 0.036 } = {}) {
  const d = dir.clone().normalize();
  const w1 = from.clone().addScaledVector(d, 0.028);
  g.add(limb(from, w1, wrist, M.skin));
  // tendones de la muñeca: se ensancha hacia la palma
  const flare = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.skin);
  flare.scale.set(wrist * 1.25, wrist * 1.1, wrist * 1.25);
  flare.position.copy(from);
  g.add(flare);
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d);
  const roll = new THREE.Mesh(new THREE.TorusGeometry(sleeveR, 0.011, 8, 18), M.cuff);
  roll.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  roll.position.copy(w1).addScaledVector(d, 0.004);
  g.add(roll);
  const len = 0.55;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(sleeveR, sleeveR * 1.45, len, 16, 1, true), M.sleeve);
  sleeve.quaternion.copy(q);
  sleeve.position.copy(w1).addScaledVector(d, len / 2);
  g.add(sleeve);
}

// Junta todas las mallas del grupo en una por material (menos llamadas de dibujo).
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    const list = byMat.get(o.material) || [];
    list.push(geo);
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, list] of byMat) out.add(new THREE.Mesh(mergeGeometries(list), mat));
  return out;
}

// Radio de un perfil de torno a cierta altura.
function profileRadius(profile, y) {
  let r = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    if (y1 === y0) {
      if (Math.abs(y - y0) < 1e-4) r = Math.max(r, r0, r1);
      continue;
    }
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) r = Math.max(r, r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
  }
  return r;
}

// Mano derecha con la palma para arriba sosteniendo el mate desde abajo:
// la calabaza apoyada en la palma, los dedos subiendo por el lado de enfrente
// siguiendo la forma del mate y el pulgar por el costado derecho.
// rAt(y) da el radio del mate a esa altura; top es la altura de la boca.
function cupHand(M, rAt, top) {
  const g = new THREE.Group();
  const R0 = Math.max(0.022, rAt(0.01));
  const Rmax = Math.max(...[0.01, 0.03, 0.05, 0.07].map(rAt));
  // palma y talón de la mano
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), M.skin);
  palm.scale.set(Rmax * 0.95, 0.019, Rmax * 1.05);
  palm.position.set(0.004, -0.012, 0.004);
  g.add(palm);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.skin);
  heel.scale.set(0.03, 0.02, 0.03);
  heel.position.set(0.02, -0.022, 0.028);
  g.add(heel);
  const surface = (a, y, fr) => {
    const r = rAt(Math.min(y, top - 0.004)) + fr * 0.92;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  // camina por la superficie del mate hasta alejarse `len` del punto p
  const walk = (p, a, len, fr, y0) => {
    let y = y0;
    let q = surface(a, y, fr);
    while (q.distanceTo(p) < len && y < top + 0.02) {
      y += 0.0006;
      q = surface(a, y, fr);
      if (y > top - 0.004) q.addScaledVector(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), -(y - top + 0.004) * 1.6);
    }
    return { q, y };
  };
  // índice, medio, anular y meñique (del lado del pulgar al otro)
  const FINGERS = [
    { a: -Math.PI / 2 + 0.62, len: [0.024, 0.016, 0.013], r: 0.0082 },
    { a: -Math.PI / 2 + 0.16, len: [0.027, 0.018, 0.014], r: 0.0086 },
    { a: -Math.PI / 2 - 0.3, len: [0.025, 0.017, 0.013], r: 0.0082 },
    { a: -Math.PI / 2 - 0.74, len: [0.02, 0.013, 0.011], r: 0.0072 },
  ];
  for (const f of FINGERS) {
    let p = new THREE.Vector3(Math.cos(f.a) * R0 * 0.62, -0.008, Math.sin(f.a) * R0 * 0.62);
    let y = 0;
    const pts = [p];
    for (const L of f.len) {
      const w = walk(p, f.a, L, f.r, y);
      p = w.q;
      y = w.y;
      pts.push(p);
    }
    for (let i = 0; i < 3; i++) g.add(limb(pts[i], pts[i + 1], f.r * (1 - i * 0.08), M.skin));
    const along = new THREE.Vector3().subVectors(pts[3], pts[2]).normalize();
    g.add(nail(pts[3], along, new THREE.Vector3(Math.cos(f.a), 0, Math.sin(f.a)), f.r * 0.92, M));
  }
  // pulgar: nace del costado de la palma y sube por la derecha
  const ta = 0.12;
  const tr = 0.0102;
  const tb = new THREE.Vector3(Math.cos(0.75) * R0 * 0.9, -0.01, Math.sin(0.75) * R0 * 0.9);
  const t1 = surface(ta + 0.25, 0.01, tr);
  const w2 = walk(t1, ta, 0.026, tr, 0.01);
  const t3 = walk(w2.q, ta - 0.1, 0.02, tr, w2.y).q;
  g.add(limb(tb, t1, tr * 1.08, M.skin));
  g.add(limb(t1, w2.q, tr, M.skin));
  g.add(limb(w2.q, t3, tr * 0.92, M.skin));
  g.add(nail(t3, new THREE.Vector3().subVectors(t3, w2.q).normalize(), new THREE.Vector3(Math.cos(ta), 0, Math.sin(ta)), tr * 0.9, M));
  // muñeca y manga hacia abajo, a la derecha y hacia la cámara
  forearm(g, M, new THREE.Vector3(0.03, -0.03, 0.04), new THREE.Vector3(0.5, -0.66, 0.56));
  return bake(g);
}

// Mano que envuelve un cilindro vertical (termo, mango del facón).
// side: ángulo donde apoya la palma; dir: hacia dónde cierran los dedos.
function wrapHand(M, { radius, y0 = 0, side = Math.PI, dir = 1, arm = new THREE.Vector3(-0.5, -0.7, 0.5), scale = 1 }) {
  const g = new THREE.Group();
  const out = new THREE.Vector3(Math.cos(side), 0, Math.sin(side));
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.skin);
  palm.scale.set(0.012 * scale, 0.042 * scale, 0.032 * scale);
  palm.position.copy(out).multiplyScalar(radius + 0.01 * scale).setY(y0 + 0.028 * scale);
  palm.rotation.y = -side;
  g.add(palm);
  const ring = (a, r) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  [0.0082, 0.0086, 0.0082, 0.0072].forEach((fr, i) => {
    const y = y0 + (0.058 - i * 0.018) * scale;
    const rr = radius + fr * 0.95;
    const steps = [0.35, 1.2, 1.95, 2.55].map((k) => side + dir * k * (0.028 / rr) * scale * (i === 3 ? 0.8 : 1));
    const pts = steps.map((a, j) => ring(a, j === 0 ? rr + 0.006 * scale : rr).setY(y - j * 0.002));
    for (let j = 0; j < 3; j++) g.add(limb(pts[j], pts[j + 1], fr * scale * (1 - j * 0.08), M.skin));
    const along = new THREE.Vector3().subVectors(pts[3], pts[2]).normalize();
    g.add(nail(pts[3], along, new THREE.Vector3(Math.cos(steps[3]), 0, Math.sin(steps[3])), fr * 0.92 * scale, M));
  });
  // pulgar por el otro lado, arriba del índice
  const tr = 0.0102 * scale;
  const rr = radius + tr;
  const ty = y0 + 0.075 * scale;
  const tp = [ring(side - dir * 0.2, rr + 0.012 * scale).setY(ty - 0.02 * scale), ...[0.5, 1.3, 2.0].map((k) => ring(side - dir * k * (0.026 / rr) * scale, rr).setY(ty))];
  for (let j = 0; j < 3; j++) g.add(limb(tp[j], tp[j + 1], tr * (1 - j * 0.06), M.skin));
  forearm(g, M, palm.position.clone().addScaledVector(out, 0.004).setY(y0 + 0.004), arm);
  return bake(g);
}

// Cuerno curvo (guampa / asta): anillos a lo largo de una curva con radio creciente.
function hornGeo(r0, r1, len, curve = 0.5, seg = 20, rs = 14) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3(Math.sin(t * curve) * len * 0.35, t * len, 0));
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const frames = path.computeFrenetFrames(seg, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = path.getPointAt(t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rs; j++) {
      const a = i * (rs + 1) + j;
      const b = a + rs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, top: path.getPointAt(1), r1 };
}

// Arma el modelo. Devuelve { root, muzzle, anim: { spin: [], glow: [] } }.
export function buildMate(id, upgraded, T) {
  const M = mats(T);
  const mate = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  let bodyMat = M.gourd;
  let top = { r: 0.03, y: 0.1 };
  let bomb = { len: 0.2 };
  let virola = M.silver;
  let body = null;
  const st = weaponStats(id, upgraded);
  const camoMat = st.elem ? M[`camo_${st.elem}`] : M.camo;
  const camo = (m) => (upgraded ? camoMat : m);

  // radio del cuerpo a cada altura (para que los dedos lo abracen)
  let rAt = (y) => profileRadius(PROFILES.calabaza, y);
  const addBody = (profile, mat) => {
    body = lathe(PROFILES[profile], camo(mat));
    mate.add(body);
    top = topOf(PROFILES[profile]);
    rAt = (y) => profileRadius(PROFILES[profile], y);
    return body;
  };
  const scaleBody = (sx, sy) => {
    body.scale.set(sx, sy, sx);
    top.y *= sy;
    top.r *= sx;
    const base = rAt;
    rAt = (y) => base(y / sy) * sx;
  };
  const hornR = (h, r0, len) => {
    rAt = (y) => r0 + (h.r1 - r0) * Math.pow(Math.min(1, Math.max(0, y / len)), 0.8);
  };
  // Las guampas son curvas: la boca queda corrida y un poco inclinada. Todo lo
  // de arriba (virola, yerba, hielo) va en este grupo, y la bombilla se corre.
  const hornMouth = (h, curve, virolaMat, virolaH) => {
    mate.userData.hornTop = h.top;
    const mouth = new THREE.Group();
    mouth.position.set(h.top.x, h.top.y, 0);
    mouth.rotation.z = -Math.atan(0.35 * curve * Math.cos(curve));
    mate.add(mouth);
    const vir = addVirola(virolaMat, virolaH);
    vir.position.y = -h.top.y;
    mouth.add(vir);
    mouth.add(yerba(top.r, 0, M));
    return mouth;
  };
  const addVirola = (mat = M.silver, h = 0.012) => {
    const v = lathe([[top.r - 0.001, top.y - h], [top.r + 0.003, top.y - h], [top.r + 0.004, top.y - h / 2], [top.r + 0.003, top.y + 0.002], [top.r - 0.001, top.y + 0.002]], mat, 24);
    mate.add(v);
    return v;
  };

  switch (id) {
    case 'porongo':
      addBody('porongo', M.gourd);
      addVirola(M.silver, 0.01);
      bomb = { len: 0.19 };
      break;
    case 'madera': {
      addBody('cilindro', M.wood);
      for (const y of [0.02, 0.05, 0.08]) {
        const r = tor(0.038, 0.0025, camo(M.woodDark), 6, 24);
        r.rotation.x = Math.PI / 2;
        r.position.y = y;
        mate.add(r);
      }
      addVirola(M.bronze, 0.014);
      bomb = { len: 0.24, mat: M.bronze };
      break;
    }
    case 'plastico':
      addBody('cup', M.plastic);
      bomb = { len: 0.19, count: 2, spread: 0.022, mat: M.plasticWhite, thick: 1.3 };
      break;
    case 'vidrio': {
      addBody('cup', M.glass);
      body.material = upgraded ? camoMat : M.glass;
      const inner = lathe([[0, 0.003], [0.027, 0.003], [0.037, 0.085]], M.yerba);
      mate.add(inner);
      addVirola(M.silver, 0.012);
      bomb = { len: 0.2 };
      break;
    }
    case 'lata': {
      addBody('lata', M.aluminium);
      const grip = cyl(0.016, 0.016, 0.07, camo(M.dark), 10);
      grip.rotation.x = Math.PI / 2;
      grip.position.set(0, 0.05, -0.05);
      mate.add(grip);
      bomb = { len: 0.21, thick: 1.8, mat: M.aluminium };
      break;
    }
    case 'algarrobo': {
      addBody('cilindro', M.woodDark);
      scaleBody(0.95, 1.15);
      addVirola(M.silver, 0.016);
      // cargador: termito de acero al costado
      const mag = cyl(0.012, 0.012, 0.07, M.steel, 10);
      mag.position.set(0.048, 0.04, 0);
      mate.add(mag);
      bomb = { len: 0.22 };
      break;
    }
    case 'imperial': {
      addBody('calabaza', M.gourdDark);
      const base = lathe([[0, -0.012], [0.03, -0.012], [0.034, 0.004], [0.028, 0.012], [0, 0.012]], M.silver);
      mate.add(base);
      for (let i = 0; i < 3; i++) {
        const leg = cyl(0.004, 0.006, 0.02, M.silver, 6);
        const a = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.025, -0.02, Math.sin(a) * 0.025);
        mate.add(leg);
      }
      const band = lathe([[0.043, 0.03], [0.047, 0.035], [0.047, 0.055], [0.043, 0.06]], upgraded ? M.gold : M.silverDark);
      mate.add(band);
      addVirola(upgraded ? M.gold : M.silver, 0.02);
      bomb = { len: 0.23, mat: upgraded ? M.gold : M.silver, thick: 1.2 };
      break;
    }
    case 'camionero': {
      addBody('camionero', M.leather);
      for (let i = 0; i < 16; i++) {
        const s = box(0.002, 0.08, 0.003, M.plasticWhite);
        const a = (i / 16) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06);
        s.rotation.y = -a;
        mate.add(s);
      }
      addVirola(M.silver, 0.018);
      const drum = cyl(0.03, 0.03, 0.04, M.steel, 16);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(0.075, 0.04, 0);
      mate.add(drum);
      bomb = { len: 0.26, thick: 2 };
      break;
    }
    case 'torpedo': {
      addBody('torpedo', M.gourd);
      addVirola(M.bronze, 0.012);
      mate.userData.scope = true;
      bomb = { len: 0.3 };
      break;
    }
    case 'silicona':
      addBody('soft', M.silicone);
      bomb = { len: 0.2, mat: M.silicone, thick: 1.5, bend: 0.4 };
      anim.wobble = true;
      break;
    case 'cocido': {
      addBody('mug', M.ceramic);
      const handleM = tor(0.025, 0.006, camo(M.ceramic), 8, 16, Math.PI);
      handleM.position.set(0.045, 0.05, 0);
      mate.add(handleM);
      const tea = new THREE.Mesh(new THREE.CircleGeometry(0.037, 20), new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.2 }));
      tea.rotation.x = -Math.PI / 2;
      tea.position.y = 0.08;
      mate.add(tea);
      const string = cyl(0.0008, 0.0008, 0.09, M.teabag, 4);
      string.position.set(0.02, 0.12, 0.02);
      string.rotation.z = -0.4;
      mate.add(string);
      const tag = box(0.018, 0.022, 0.001, M.teabag);
      tag.position.set(0.042, 0.16, 0.02);
      mate.add(tag);
      bomb = null;
      break;
    }
    case 'bombillazo': {
      const h = hornGeo(0.012, 0.04, 0.13, 0.9);
      body = new THREE.Mesh(h.geo, camo(M.horn));
      mate.add(body);
      top = { r: h.r1, y: h.top.y };
      hornR(h, 0.012, 0.13);
      hornMouth(h, 0.9, M.silver, 0.012);
      bomb = { len: 0.28, thick: 1.4 };
      break;
    }
    case 'rayo': {
      addBody('calabaza', upgraded ? camoMat : M.red);
      const chamber = sph(0.02, upgraded ? M.glowRed : M.glowGreen);
      chamber.position.set(0, 0.05, 0.043);
      mate.add(chamber);
      anim.glow.push(chamber);
      mate.userData.rings = true;
      for (const s of [-1, 1]) {
        const fin = box(0.002, 0.04, 0.03, M.silverDark);
        fin.position.set(s * 0.046, 0.06, 0);
        mate.add(fin);
      }
      addVirola(M.silver, 0.014);
      bomb = { len: 0.22, thick: 2.2, mat: M.dark };
      break;
    }
    case 'wunder': {
      addBody('calabaza', M.gourdDark);
      addVirola(M.copper, 0.016);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const c = tor(0.012, 0.003, M.copper, 6, 16);
          c.position.set(s * 0.052, 0.025 + i * 0.012, 0);
          c.rotation.x = Math.PI / 2;
          mate.add(c);
        }
      }
      bomb = { len: 0.2, thick: 1.8, mat: M.copper };
      break;
    }
    case 'terere': {
      const h = hornGeo(0.018, 0.042, 0.12, 0.6);
      body = new THREE.Mesh(h.geo, camo(M.horn));
      mate.add(body);
      top = { r: h.r1, y: h.top.y };
      hornR(h, 0.018, 0.12);
      const mouth = hornMouth(h, 0.6, M.silver, 0.012);
      for (let i = 0; i < 4; i++) {
        const ice = box(0.016, 0.016, 0.016, M.ice);
        const a = (i / 4) * Math.PI * 2 + 0.4;
        ice.position.set(Math.cos(a) * 0.019, 0.002, Math.sin(a) * 0.019);
        ice.rotation.set(Math.random(), Math.random(), Math.random());
        mouth.add(ice);
      }
      const lemon = cyl(0.016, 0.016, 0.004, M.lemon, 14);
      lemon.position.set(0.024, 0.009, -0.008);
      lemon.rotation.z = 1.1;
      mouth.add(lemon);
      bomb = { len: 0.2, mat: M.silver, thick: 1.4 };
      break;
    }
    case 'tronador': {
      addBody('camionero', M.dark);
      scaleBody(1.15, 1.15);
      for (const s of [-1, 1]) {
        const t = new THREE.Group();
        t.add(cyl(0.028, 0.028, 0.03, M.silverDark, 16));
        for (let i = 0; i < 6; i++) {
          const blade = box(0.05, 0.004, 0.012, M.silver);
          blade.rotation.y = (i / 6) * Math.PI * 2;
          blade.position.y = 0.016;
          t.add(blade);
        }
        t.position.set(s * 0.078, 0.06, 0);
        t.rotation.z = s * Math.PI / 2;
        mate.add(t);
        anim.spin.push(t);
      }
      addVirola(M.copper, 0.02);
      bomb = { len: 0.2, thick: 3, mat: M.copper };
      break;
    }
    case 'diablo': {
      // calabaza roja con cuernos, virola de oro y una bombilla gruesa que hierve
      addBody('calabaza', upgraded ? camoMat : M.red);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.055, 8), M.hornDark);
        horn.position.set(s * 0.038, top.y + 0.008, -0.012);
        horn.rotation.set(-0.35, 0, s * -0.55);
        mate.add(horn);
      }
      const ember = sph(0.013, M.glowRed);
      ember.position.set(0, 0.035, 0.046);
      mate.add(ember);
      anim.glow.push(ember);
      addVirola(M.gold, 0.016);
      bomb = { len: 0.21, thick: 2.4, mat: M.copper };
      break;
    }
    case 'oro':
      addBody('calabaza', M.gold);
      addVirola(M.gold, 0.02);
      bomb = { len: 0.23, mat: M.gold, thick: 1.4 };
      break;
    default:
      addBody('calabaza', bodyMat);
      addVirola(virola);
  }

  if (id !== 'cocido' && !mate.userData.hornTop) mate.add(yerba(top.r, top.y, M));

  let muzzle = new THREE.Object3D();
  if (bomb) {
    const b = bombilla(bomb, M, top.y);
    if (mate.userData.hornTop) b.group.position.x = mate.userData.hornTop.x;
    mate.add(b.group);
    mate.userData.bombGroup = b.group;
    muzzle = b.tips[0];
    const straw = b.straws[0];
    if (mate.userData.rings) {
      // los tres anillos del Rayo Matero rodean la bombilla
      for (let i = 0; i < 3; i++) {
        const ring = tor(0.02 - i * 0.003, 0.0032, M.silver, 6, 24);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = b.len * (0.45 + i * 0.16);
        straw.add(ring);
        anim.spin.push(ring);
      }
    }
    if (mate.userData.scope) {
      const scope = cyl(0.012, 0.012, 0.13, M.dark, 12);
      scope.position.set(0, b.len * 0.55, 0.028);
      straw.add(scope);
      for (const y of [0.49, 0.61]) {
        const mount = box(0.006, 0.01, 0.026, M.dark);
        mount.position.set(0, b.len * y, 0.014);
        straw.add(mount);
      }
      const lens = cyl(0.014, 0.012, 0.008, M.glowBlue, 12);
      lens.position.set(0, b.len * 0.55 + 0.068, 0.028);
      straw.add(lens);
    }
    if (id === 'wunder') {
      const bulb = sph(0.016, M.glass);
      bulb.position.y = 0.012;
      muzzle.add(bulb);
      const fil = sph(0.006, M.glowBlue);
      fil.position.y = 0.012;
      muzzle.add(fil);
      anim.glow.push(fil);
    }
    if (id === 'tronador') {
      const bell = cyl(0.03, 0.008, 0.04, M.copper, 16);
      bell.position.y = 0.012;
      muzzle.add(bell);
    }
    if (anim.wobble) anim.wobble = b.group;
  } else {
    muzzle.position.set(0, 0.1, -0.02);
    mate.add(muzzle);
  }

  // Inclinar: la boca del mate mira hacia adelante y la bombilla apunta al frente.
  const tilt = new THREE.Group();
  mate.add(cupHand(M, rAt, top.y));
  // la boca del mate: ahí apunta el chorro del termo al cebar
  const mouth = new THREE.Object3D();
  mouth.position.set(mate.userData.hornTop ? mate.userData.hornTop.x : 0, top.y - 0.004, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar((id === 'camionero' || id === 'tronador' ? 0.95 : 1.1) * VM_POSE.scale);
  // dónde queda la punta de la bombilla respecto del modelo (para apuntar)
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded, tip, mouth, mate, bombGroup: mate.userData.bombGroup || null };
}

// Termo para la animación de recarga (cebar = recargar): cuerpo pintado,
// hombro de acero, tapón con pico vertedor, manija y la mano izquierda.
// spoutTip marca por dónde sale el agua; el chorro se dibuja aparte.
export function buildTermo(T) {
  const M = mats(T);
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.029, 0], [0.032, 0.005], [0.032, 0.196], [0.03, 0.204]], M.termo, 28));
  for (const [y0, y1] of [[0.012, 0.022], [0.176, 0.186]]) g.add(lathe([[0.0328, y0], [0.0328, y1]], M.steel, 28));
  g.add(lathe([[0.03, 0.203], [0.031, 0.21], [0.026, 0.224], [0.018, 0.236], [0.017, 0.246]], M.steel, 28));
  // tapón cebador con el pico hacia +x
  g.add(lathe([[0, 0.262], [0.012, 0.262], [0.017, 0.256], [0.018, 0.244]], M.dark, 20));
  const spout = cyl(0.005, 0.008, 0.03, M.dark, 10);
  spout.position.set(0.018, 0.255, 0);
  spout.rotation.z = -1.05;
  g.add(spout);
  const spoutTip = new THREE.Object3D();
  spoutTip.position.set(0.032, 0.262, 0);
  g.add(spoutTip);
  // manija de costado, hacia la cámara
  const handleT = tor(0.04, 0.0065, M.dark, 8, 16, Math.PI);
  handleT.position.set(0, 0.11, 0.032);
  handleT.rotation.set(0, Math.PI / 2, Math.PI / 2);
  g.add(handleT);
  // mano izquierda agarrando el cuerpo; el antebrazo sale abajo a la izquierda al servir
  // palma del lado de la cámara (se ve el dorso), dedos por abajo y pulgar por arriba al servir
  g.add(wrapHand(M, { radius: 0.032, y0: 0.05, side: Math.PI / 2, dir: -1, arm: new THREE.Vector3(0.7, -0.3, 0.65) }));
  // chorro: cilindro de alto 1 colgando desde su punta (se estira entre el pico y la boca)
  const streamGeo = new THREE.CylinderGeometry(0.0026, 0.0034, 1, 8, 1, true).translate(0, -0.5, 0);
  const stream = new THREE.Mesh(streamGeo, M.water);
  stream.visible = false;
  return { root: g, stream, spoutTip };
}

// Facón para el cuchillo.
export function buildKnife(T, kind = 'plain') {
  const M = mats(T);
  const g = new THREE.Group();
  const plata = kind === 'plata';
  // el Facón de Plata: hoja más larga, guarda en S y cabo de plata con virolas
  const blade = new THREE.Mesh(new THREE.ConeGeometry(plata ? 0.014 : 0.012, plata ? 0.3 : 0.2, 4), M.steel);
  blade.scale.set(1, 1, 0.25);
  blade.position.y = plata ? 0.18 : 0.13;
  g.add(blade);
  const guard = box(plata ? 0.07 : 0.05, 0.008, 0.012, plata ? M.gold : M.silver);
  guard.position.y = 0.028;
  g.add(guard);
  if (plata) {
    for (const s of [-1, 1]) {
      const curl = tor(0.009, 0.0025, M.gold, 6, 12);
      curl.position.set(s * 0.036, 0.034, 0);
      g.add(curl);
    }
  }
  const handleK = cyl(0.011, 0.012, 0.09, plata ? M.silver : M.hornDark, 10);
  handleK.position.y = -0.02;
  g.add(handleK);
  if (plata) {
    for (const y of [-0.05, -0.02, 0.01]) {
      const ring = tor(0.0122, 0.0022, M.gold, 6, 14);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
  }
  const pommel = sph(0.013, plata ? M.gold : M.silver);
  pommel.position.y = -0.068;
  g.add(pommel);
  g.add(wrapHand(M, { radius: 0.012, y0: -0.068, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.85 }));
  return g;
}

// Paquetito de yerba explosivo (granada) y la pava silbadora.
export function buildGrenade(T, kind = 'frag') {
  const M = mats(T);
  const g = new THREE.Group();
  if (kind === 'pava') {
    const body = lathe([[0, 0], [0.05, 0], [0.058, 0.02], [0.055, 0.06], [0.03, 0.085], [0.012, 0.09]], M.aluminium);
    g.add(body);
    const spout = cyl(0.006, 0.014, 0.08, M.aluminium, 8);
    spout.position.set(0, 0.04, 0.065);
    spout.rotation.x = 1;
    g.add(spout);
    const handleP = tor(0.04, 0.005, M.dark, 6, 14, Math.PI);
    handleP.position.y = 0.09;
    g.add(handleP);
    return g;
  }
  const pack = box(0.05, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0xb3151d, roughness: 0.6 }));
  g.add(pack);
  const band = box(0.051, 0.02, 0.031, M.plasticWhite);
  g.add(band);
  const fuse = cyl(0.002, 0.002, 0.03, M.dark, 4);
  fuse.position.y = 0.05;
  g.add(fuse);
  return g;
}

// Mate cebado con la yerba del perk (para la animación de tomar): la bombilla
// se inclina hacia quien toma y tip marca su punta (la que va a la boca).
export function buildPerkMate(T, color) {
  const M = mats(T);
  const g = new THREE.Group();
  const body = lathe(PROFILES.calabaza, new THREE.MeshStandardMaterial({ color, roughness: 0.5, map: T.gourd }));
  g.add(body);
  const v = lathe([[0.03, 0.09], [0.034, 0.09], [0.035, 0.1], [0.03, 0.102]], M.silver);
  g.add(v);
  g.add(yerba(0.031, 0.1, M));
  const b = bombilla({ len: 0.19, tilt: -0.78 }, M, 0.1);
  g.add(b.group);
  g.add(cupHand(M, (y) => profileRadius(PROFILES.calabaza, y), 0.1));
  g.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  b.tips[0].getWorldPosition(tip);
  const base = new THREE.Vector3();
  b.straws[0].getWorldPosition(base);
  return { root: g, tip, strawDir: tip.clone().sub(base).normalize() };
}

// Brillo del fogonazo.
export function muzzleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.2, 'rgba(255,210,120,0.9)');
  g.addColorStop(0.5, 'rgba(255,140,40,0.35)');
  g.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,230,160,0.8)';
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(60, 0);
    ctx.lineTo(0, 4);
    ctx.fill();
    ctx.restore();
  }
  return new THREE.CanvasTexture(c);
}

export function getMats(T) {
  return mats(T);
}
