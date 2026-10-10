import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { weaponStats, ELEM_INFO } from '../config/weapons';
import { mk3Skin } from './mk3Skin';
import { camoMaterial, papMaterial } from './camos';
import { upgradeBaseMats } from './baseSkins';

// Modelos 3D de los mates-arma, armados con geometría procedural.
// Se construyen parados (eje y) con la bombilla saliendo hacia arriba y luego
// se inclinan para que la bombilla (el cañón) apunte hacia adelante (-z).

let MATS = null;
// El color de las mangas de la mano (el estero: Gil va de colorado). null vuelve al de siempre.
export function setSleeveColor(hex) {
  MATS?.sleeve.color.set(hex ?? 0x5a5a44);
}
// Pose del mate en la mano (ajustable).
export const VM_POSE = { pitch: 0.15, roll: -0.12, yaw: 0.45, scale: 1, bombTilt: 1.45 };
function mats(T) {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
  MATS = {
    gourd: std({ map: T.gourd, roughness: 0.75 }),
    gourdDark: std({ map: T.gourd, color: 0x6a4a30, roughness: 0.7 }),
    // calabaza curada clara (el mate izquierdo del Mark III)
    gourdPale: std({ map: T.gourd, color: 0xf2dcb4, roughness: 0.55 }),
    cellSpent: std({ color: 0x2c3a2a, roughness: 0.5, emissive: 0x0c1a0c }),
    // el rayo incrustado del Mark III (sin pasarse de blanco)
    boltGreen: new THREE.MeshBasicMaterial({ color: 0x2cf060, toneMapped: false }),
    boltGold: new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }),
    // la calabaza de la Salamanca: verdosa, con un brillo apagado de adentro
    gourdLuz: std({ map: T.gourd, color: 0x7a9a6a, roughness: 0.55, emissive: 0x143a10, emissiveIntensity: 0.9 }),
    // las cruces talladas del Mate de la Luz Mala (Weapons.animateLuz las hace latir)
    luzCross: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff4a).multiplyScalar(0.6), toneMapped: false }),
    // el Mate de la Luz Mala Eterna (mejorado): la calabaza quemada en la
    // Salamanca, casi negra, y sus venas de fuego fatuo (laten con animateLuz)
    gourdEterna: std({ map: T.gourd, color: 0x20241e, roughness: 0.4, emissive: 0x031c10, emissiveIntensity: 1 }),
    luzVein: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4affc8).multiplyScalar(0.7), toneMapped: false }),
    ironOld: std({ color: 0x34302a, metalness: 0.85, roughness: 0.55 }),
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
    hornBlack: std({ map: T.gourd, color: 0x4a3a2a, roughness: 0.3, side: THREE.DoubleSide }),
    bone: std({ color: 0xc9b894, roughness: 0.6 }),
    blade: std({ color: 0xc8ccd0, metalness: 1, roughness: 0.25 }),
    bladeDark: std({ color: 0x1a1a20, metalness: 0.8, roughness: 0.35 }),
    glowDeath: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affb0).multiplyScalar(2.4), toneMapped: false }),
    glowPurple: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb05aff).multiplyScalar(2), toneMapped: false }),
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
    whet: std({ color: 0x7c8084, roughness: 0.9 }),
    whetWet: std({ color: 0x4e5256, roughness: 0.35 }),
  };
  // las caras de siempre, con relieve y brillo por partes (weapons/baseSkins.js)
  upgradeBaseMats(MATS, T);
  // Camuflaje del Pack-a-Pava: el de cada mapa, animado (weapons/camos.js; el
  // mapa lo pone Weapons.reset con setPapMap). Segunda mejora: el mismo,
  // teñido del color del elemento.
  MATS.camo = papMaterial(T);
  for (const k of Object.keys(ELEM_INFO)) MATS[`camo_${k}`] = papMaterial(T, k);
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
function bombilla({ len = 0.24, thick = 1, mat, tilt = VM_POSE.bombTilt, count = 1, spread = 0.02, bend = 0, filter = null }, M, y) {
  const g = new THREE.Group();
  const tips = [];
  const straws = [];
  const r = 0.0055 * thick;
  for (let k = 0; k < count; k++) {
    const b = new THREE.Group();
    const tube = cyl(r, r, len, mat || M.silver, 8);
    tube.position.y = len / 2;
    b.add(tube);
    // el filtro queda enterrado en la yerba: con las bombillas gruesas no crece
    // más que la boca (si no, al inspeccionar asoma media esfera por arriba)
    // (filter: el radio, para los de cuello finito: si no, el filtro asoma por el costado)
    const fil = new THREE.Mesh(new THREE.SphereGeometry(filter ?? Math.min(r * 3, 0.017), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat || M.silver);
    fil.rotation.x = Math.PI;
    b.add(fil);
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
  return handMark(bake(g));
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
  return handMark(bake(g));
}

// La mano y el brazo de primera persona: marcados, para que la copia que
// llevan los compañeros en la mano (net/Avatars.js setGun) los saque (ellos
// ya tienen sus manos).
function handMark(g) {
  g.userData.hand = true;
  return g;
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
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = path.getPointAt(t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
      // (como el torno: u alrededor, v a lo largo; sin esto los camuflajes salían de un solo color)
      uv.push(j / rs, t);
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
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, top: path.getPointAt(1), r1 };
}

// El Mate de la Luz Mala Eterna (el mejorado): no sale con el camuflaje del
// Pack-a-Pava sino quemado en la Salamanca. La calabaza casi negra con venas
// de fuego fatuo que suben desde abajo, un zuncho de hierro viejo remachado y
// otro de vértebras, una calaverita adelante con los ojos prendidos, la yerba
// verde agua y tres fuegos fatuos que le dan vueltas (Weapons.animateLuz).
function luzEterna(mate, M, T, anim, addBody, addVirola, rAt) {
  addBody('calabaza', M.gourdEterna);
  addVirola(M.ironOld, 0.016);
  const low = tor(rAt(0.022) + 0.0006, 0.0016, M.ironOld, 6, 32);
  low.rotation.x = Math.PI / 2;
  low.position.y = 0.022;
  mate.add(low);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = rAt(0.022) + 0.0019;
    const rivet = sph(0.0011, M.ironOld, 6, 4);
    rivet.position.set(Math.cos(a) * r, 0.022, Math.sin(a) * r);
    mate.add(rivet);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = rAt(0.079) + 0.0013;
    const v = box(0.0034, 0.0044, 0.0024, M.bone);
    v.position.set(Math.cos(a) * r, 0.079, Math.sin(a) * r);
    v.rotation.set(0, Math.PI / 2 - a, i % 2 ? 0.12 : -0.12);
    mate.add(v);
  }
  // adelante (del lado que se ve), la calaverita
  const front = Math.PI / 2 + 1;
  const skull = new THREE.Group();
  skull.scale.setScalar(1.35);
  const head = sph(0.0068, M.bone, 12, 10);
  head.scale.set(1, 0.92, 0.8);
  skull.add(head);
  const jaw = box(0.0076, 0.0034, 0.0046, M.bone);
  jaw.position.set(0, -0.0058, 0.0006);
  skull.add(jaw);
  for (const s of [-1, 1]) {
    const eye = sph(0.0018, M.glowDeath, 8, 6);
    eye.position.set(s * 0.0025, 0.0004, 0.0047);
    skull.add(eye);
  }
  const rs = rAt(0.047) + 0.0044;
  skull.position.set(Math.cos(front) * rs, 0.047, Math.sin(front) * rs);
  skull.rotation.y = Math.PI / 2 - front;
  mate.add(skull);
  // las venas: suben torcidas desde abajo, con una ramita (no pasan por la calavera)
  const at = (a, y, out = 0.0005) => {
    const r = rAt(y) + out;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  for (let i = 0; i < 6; i++) {
    let a = (i / 6) * Math.PI * 2 + 0.55;
    if (Math.abs(Math.atan2(Math.sin(a - front), Math.cos(a - front))) < 0.45) a += 0.5;
    let prev = at(a, 0.006);
    let branch = null;
    for (let k = 1; k <= 9; k++) {
      const y = 0.006 + k * 0.0068;
      a += Math.sin(k * 1.9 + i * 2.3) * 0.16;
      const p = at(a, y);
      mate.add(limb(prev, p, k < 6 ? 0.0008 : 0.0006, M.luzVein));
      if (k === 4) branch = { a, p };
      prev = p;
    }
    if (branch) {
      let b = branch.a;
      let bp = branch.p;
      for (let k = 1; k <= 3; k++) {
        b += (i % 2 ? 0.17 : -0.17);
        const p = at(b, branch.p.y + k * 0.0055);
        mate.add(limb(bp, p, 0.0005, M.luzVein));
        bp = p;
      }
    }
  }
  // los fuegos fatuos que la rondan
  anim.fatuos = [];
  for (const [i, y] of [0.03, 0.056, 0.074].entries()) {
    const f = new THREE.Group();
    f.add(sph(0.0024, M.glowDeath, 8, 6));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0x4affc8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    halo.scale.setScalar(0.02);
    f.add(halo);
    const a0 = (i / 3) * Math.PI * 2 + 1;
    const r = rAt(y) + 0.016;
    f.position.set(Math.cos(a0) * r, y, Math.sin(a0) * r);
    mate.add(f);
    anim.fatuos.push({ o: f, a0, y, r });
  }
  mate.userData.glowYerba = M.glowDeath;
}

// Arma el modelo. Devuelve { root, muzzle, anim: { spin: [], glow: [] } }.
// hand: 'L' para el de la mano izquierda de los que van de a dos (el Mark III
// tiene un mate distinto en cada mano).
// Mates que arman otros archivos (los cuatro elementales del castillo, en
// weapons/elementalModels.js): se anotan acá con registerMate.
const EXTRA = {};
export function registerMate(id, build) {
  EXTRA[id] = build;
}

// camoId: el camuflaje elegido en la armería (weapons/camos.js). Solo va sin
// mejorar: al pasar por el Pack-a-Pava lo reemplaza el del mapa.
export function buildMate(id, upgraded, T, hand = 'R', camoId = null) {
  if (EXTRA[id]) return EXTRA[id](upgraded, T, hand, camoId);
  if (id === 'hoz') return buildHoz(upgraded, T, camoId === 'oro');
  if (id === 'bombillon') return buildBombillon(T);
  const M = mats(T);
  const skin = !upgraded && camoId ? camoMaterial(camoId) : null;
  if (id === 'gut' || id === 'gutacida') return buildGut(upgraded, id === 'gutacida', T, skin);
  const mate = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  let bodyMat = M.gourd;
  let top = { r: 0.03, y: 0.1 };
  let bomb = { len: 0.2 };
  let virola = M.silver;
  let body = null;
  const st = weaponStats(id, upgraded);
  const camoMat = st.elem ? M[`camo_${st.elem}`] : M.camo;
  // (la Luz Mala mejorada no lleva el camuflaje: tiene su propia cara)
  const camo = (m) => (upgraded && id !== 'luzmala' ? camoMat : skin || m);

  // radio del cuerpo a cada altura (para que los dedos lo abracen)
  let rAt = (y) => profileRadius(PROFILES.calabaza, y);
  const addBody = (profile, mat) => {
    body = lathe(PROFILES[profile], camo(mat));
    // la pared de adentro (del borde hasta abajo de la yerba): sin ella, al mirar
    // la boca se ve a través del costado de atrás y parece que falta medio mate
    const rim = topOf(PROFILES[profile]);
    body.add(lathe([[rim.r, rim.y], [rim.r - 0.0025, rim.y], [rim.r - 0.0025, rim.y - 0.03]], body.material));
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
    const v = lathe([[top.r - 0.001, top.y - h], [top.r + 0.003, top.y - h], [top.r + 0.004, top.y - h / 2], [top.r + 0.003, top.y + 0.002], [top.r - 0.001, top.y + 0.002], [top.r - 0.001, top.y - h]], mat, 24);
    mate.add(v);
    return v;
  };

  switch (id) {
    case 'porongo':
      addBody('porongo', M.gourd);
      addVirola(M.silver, 0.01);
      bomb = { len: 0.19 };
      break;
    case 'caballero': {
      // el premio del super easter egg (core/eggs.js): el porongo en blanco
      // perla con filigrana de oro granulada, el sol de las ánimas en la panza
      // y virola y bombilla de oro
      const pearl = new THREE.MeshPhysicalMaterial({ color: 0xf6efe4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.6, sheenColor: new THREE.Color(0xfff0d0), iridescence: 0.35, iridescenceIOR: 1.4 });
      addBody('porongo', pearl);
      addVirola(M.gold, 0.012);
      for (const y of [0.012, 0.046, 0.084]) {
        const band = tor(rAt(y) + 0.0007, 0.0011, M.gold, 6, 36);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        mate.add(band);
      }
      // la filigrana: ocho hilos de granitos de oro, de faja a faja
      const bead = new THREE.SphereGeometry(0.0011, 6, 4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        for (let k = 0; k < 6; k++) {
          const y = 0.017 + k * 0.011;
          if (Math.abs(y - 0.046) < 0.004) continue;
          const aa = a + Math.sin(k * 1.1) * 0.12;
          const r = rAt(y) + 0.0006;
          const s = new THREE.Mesh(bead, M.gold);
          s.position.set(Math.cos(aa) * r, y, Math.sin(aa) * r);
          mate.add(s);
        }
      }
      // el sol de las ánimas (de frente y de atrás): disco, rayos y el centro que brilla
      for (const a of [Math.PI / 2 + 0.3, -Math.PI / 2 + 0.3]) {
        const sun = new THREE.Group();
        const disc = cyl(0.006, 0.006, 0.0012, M.gold, 20);
        disc.rotation.x = Math.PI / 2;
        sun.add(disc);
        for (let k = 0; k < 12; k++) {
          const ray = box(0.0012, k % 2 ? 0.0034 : 0.005, 0.0008, M.gold);
          const t = (k / 12) * Math.PI * 2;
          const d = 0.006 + (k % 2 ? 0.0017 : 0.0025);
          ray.position.set(Math.sin(t) * d, Math.cos(t) * d, 0);
          ray.rotation.z = -t;
          sun.add(ray);
        }
        const core = sph(0.0027, M.glowGold, 10, 8);
        core.position.z = 0.0008;
        sun.add(core);
        const r = rAt(0.062) + 0.0012;
        sun.position.set(Math.cos(a) * r, 0.062, Math.sin(a) * r);
        sun.rotation.y = Math.PI / 2 - a;
        mate.add(sun);
      }
      bomb = { len: 0.19, mat: M.gold };
      break;
    }
    case 'luzmala': {
      if (upgraded) {
        luzEterna(mate, M, T, anim, addBody, addVirola, (y) => rAt(y));
        bomb = { len: 0.2, mat: M.ironOld };
        break;
      }
      // la calabaza de la Salamanca: oscura, con dos zunchos de plata y una
      // ronda de cruces talladas que brillan verde (laten cuando está cargada);
      // la yerba brilla verde
      addBody('calabaza', M.gourdLuz);
      addVirola(M.silver, 0.014);
      for (const y of [0.024, 0.078]) {
        const band = tor(rAt(y) + 0.0006, 0.0013, M.silver, 6, 32);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        mate.add(band);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const r = rAt(0.05) + 0.0003;
        const cross = new THREE.Group();
        const v = box(0.0017, 0.013, 0.0012, M.luzCross);
        const h = box(0.008, 0.0017, 0.0012, M.luzCross);
        h.position.y = 0.0025;
        cross.add(v, h);
        cross.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
        cross.rotation.y = Math.PI / 2 - a;
        mate.add(cross);
      }
      mate.userData.glowYerba = true;
      bomb = { len: 0.2 };
      break;
    }
    case 'gemelos': {
      // calabacitas oscuras con una faja de cuero trenzado (van de a dos)
      addBody('porongo', M.gourdDark);
      scaleBody(0.84, 0.86);
      addVirola(M.bronze, 0.01);
      const faja = tor(rAt(top.y * 0.45) + 0.001, 0.004, M.leather, 6, 28);
      faja.rotation.x = Math.PI / 2;
      faja.position.y = top.y * 0.45;
      mate.add(faja);
      // (la calabacita achicada es finita donde va el filtro: con el de
      // siempre, 1,65 cm, asomaba por el costado; el usuario, 2026-10-08)
      bomb = { len: 0.16, filter: 0.011 };
      break;
    }
    case 'mk3': {
      // Rayo Matero Mark III: un mate distinto en cada mano. El derecho es el
      // del remolino (porongo oscuro con una espiral de oro y la cápsula
      // ámbar); el izquierdo, el del rayo (calabaza clara con aletas de plata,
      // un rayo incrustado y la cápsula verde).
      const left = hand === 'L';
      const trim = left ? M.silver : M.gold;
      if (left) {
        addBody('calabaza', M.gourdPale);
        scaleBody(0.92, 0.95);
      } else {
        addBody('porongo', M.gourdDark);
        scaleBody(0.86, 0.9);
      }
      // mejorado: cada mate con su piel (weapons/mk3Skin.js), no el camuflaje común
      if (upgraded) {
        const skin = mk3Skin()[left ? 'rayo' : 'remolino'];
        body.traverse((o) => {
          if (o.isMesh) o.material = skin;
        });
      }
      // la ventanita de la cápsula, del lado que mira a la cara (+z)
      const cy = top.y * (left ? 0.46 : 0.42);
      const win = new THREE.Group();
      win.position.set(0, cy, rAt(cy) - 0.003);
      win.add(tor(0.0165, 0.0034, trim, 8, 24));
      const hex = left ? (upgraded ? 0xffb000 : 0x18ff48) : upgraded ? 0xff2010 : 0xff7a00;
      const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), toneMapped: false });
      coreMat.userData.base = coreMat.color.clone();
      const core = sph(0.0125, coreMat, 14, 10);
      core.position.z = 0.002;
      win.add(core);
      mate.add(win);
      mate.userData.mk3 = { win, core, coreMat, left };
      if (left) {
        // el rayo incrustado, del lado de adentro (el que se ve), entre la
        // ventanita y la virola, con una faja de plata abajo
        const pts = [[2.1, 0.084], [2.6, 0.07], [2.2, 0.062], [2.75, 0.042]].map(([a, y]) => new THREE.Vector3(Math.cos(a) * (rAt(y) + 0.0008), y, Math.sin(a) * (rAt(y) + 0.0008)));
        for (let i = 0; i < pts.length - 1; i++) mate.add(limb(pts[i], pts[i + 1], 0.0026, upgraded ? M.boltGold : M.boltGreen));
        const band = tor(rAt(0.024) + 0.0012, 0.003, trim, 6, 28);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.024;
        mate.add(band);
      } else {
        // la espiral de oro del remolino: a la altura de la ventanita pasa por
        // atrás (-z), y da una vuelta y media para no pisarla
        const pts = [];
        const h = top.y - 0.02;
        for (let i = 0; i <= 90; i++) {
          const y = 0.008 + (i / 90) * (h - 0.008);
          const a = -Math.PI / 2 + ((y - cy) / h) * 1.5 * Math.PI * 2;
          const r = rAt(y) + 0.0012;
          pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
        }
        mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0028, 6), M.gold));
      }
      mate.userData.rings = trim;
      addVirola(trim, 0.012);
      bomb = { len: 0.19, thick: 2, mat: M.dark };
      break;
    }
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
      body.material = camo(M.glass);
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
    case 'asta': {
      // guampa de toro negro, curva, con dos anillos de plata
      const len = 0.17;
      const curve = 1.05;
      const h = hornGeo(0.012, 0.046, len, curve);
      body = new THREE.Mesh(h.geo, camo(M.hornBlack));
      mate.add(body);
      top = { r: h.r1, y: h.top.y };
      hornR(h, 0.012, len);
      // la punta del asta con un regatón de plata
      const tipCap = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.03, 10), upgraded ? M.gold : M.silver);
      tipCap.rotation.x = Math.PI;
      tipCap.position.y = -0.01;
      mate.add(tipCap);
      hornMouth(h, curve, upgraded ? M.gold : M.silver, 0.022);
      bomb = { len: 0.25, thick: 1.5, mat: upgraded ? M.gold : M.silver };
      break;
    }
    case 'mate47': {
      // calabaza de madera lustrada (como la culata), dos zunchos de acero y el
      // cargador curvo asomando al costado
      addBody('calabaza', M.wood);
      for (const y of [0.022, 0.072]) {
        const band = tor(rAt(y) + 0.0015, 0.0032, camo(M.steel), 6, 28);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        mate.add(band);
      }
      const mag = new THREE.Group();
      // tramos pegados a lo largo de un arco (así la curva sale lisa)
      for (let i = 0; i < 7; i++) {
        const th = i * 0.11;
        const seg = box(0.017, 0.013, 0.022, camo(M.dark));
        seg.position.set(-0.13 * Math.sin(th), -0.13 * (1 - Math.cos(th)), 0);
        seg.rotation.z = th;
        mag.add(seg);
      }
      // del lado que queda a la vista
      mag.position.set(-rAt(0.05) - 0.004, 0.05, 0.006);
      mate.add(mag);
      addVirola(M.silverDark, 0.014);
      bomb = { len: 0.24, thick: 1.7, mat: M.steel };
      break;
    }
    case 'campanario': {
      // bronce de campana: boca ancha, dos fajas oscuras, el tambor de balas al
      // costado y el badajo colgando abajo (la manija de cuero de atrás se
      // sacó: de la mano se veía como un arco suelto que no se entendía)
      addBody('camionero', M.bronze);
      scaleBody(1.05, 1.05);
      for (const y of [0.02, 0.085]) {
        const band = tor(rAt(y) + 0.0015, 0.004, camo(M.dark), 6, 28);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        mate.add(band);
      }
      const drum = new THREE.Group();
      drum.add(cyl(0.034, 0.034, 0.03, camo(M.dark), 20));
      for (const s of [-1, 1]) {
        const face = cyl(0.029, 0.029, 0.004, M.bronze, 20);
        face.position.y = s * 0.016;
        drum.add(face);
      }
      drum.rotation.z = Math.PI / 2;
      drum.position.set(-rAt(0.045) - 0.02, 0.045, 0);
      mate.add(drum);
      const clapper = sph(0.012, M.bronze);
      clapper.position.y = -0.022;
      mate.add(clapper);
      addVirola(M.copper, 0.02);
      bomb = { len: 0.26, thick: 2.2, mat: M.bronze };
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

  if (id !== 'cocido' && !mate.userData.hornTop) {
    mate.userData.yerba = yerba(top.r, top.y, M);
    if (mate.userData.glowYerba) mate.userData.yerba.material = mate.userData.glowYerba.isMaterial ? mate.userData.glowYerba : M.glowGreen;
    mate.add(mate.userData.yerba);
  }

  let muzzle = new THREE.Object3D();
  if (bomb) {
    const b = bombilla(bomb, M, top.y);
    if (mate.userData.hornTop) b.group.position.x = mate.userData.hornTop.x;
    mate.add(b.group);
    mate.userData.bombGroup = b.group;
    muzzle = b.tips[0];
    const straw = b.straws[0];
    if (mate.userData.rings) {
      // los tres anillos del Rayo Matero rodean la bombilla (del color de la virola)
      const ringMat = mate.userData.rings.isMaterial ? mate.userData.rings : M.silver;
      for (let i = 0; i < 3; i++) {
        const ring = tor(0.02 - i * 0.003, 0.0032, ringMat, 6, 24);
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
    if (id === 'luzmala') {
      // la luz mala espera en la punta de la bombilla: un corazón con su halo y
      // tres chispitas (cinco, mejorado) que le dan vueltas (Weapons.animateLuz)
      const orb = new THREE.Group();
      orb.position.y = 0.03;
      muzzle.add(orb);
      const core = sph(0.011, upgraded ? M.glowDeath : M.glowGreen);
      orb.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: upgraded ? 0x4affc8 : 0x5cff3a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
      halo.scale.setScalar(0.075);
      orb.add(halo);
      const motes = [];
      for (let i = 0; i < (upgraded ? 5 : 3); i++) {
        const m = sph(0.0032, upgraded ? M.glowDeath : M.glowGreen, 6, 4);
        orb.add(m);
        motes.push(m);
      }
      anim.luz = { orb, core, halo, motes, fatuos: anim.fatuos || null };
    }
    if (id === 'tronador') {
      const bell = cyl(0.03, 0.008, 0.04, M.copper, 16);
      bell.position.y = 0.012;
      muzzle.add(bell);
    }
    if (id === 'campanario') {
      // aletas para que no se recaliente la bombilla
      for (let i = 0; i < 4; i++) {
        const fin = tor(0.011, 0.003, M.bronze, 6, 16);
        fin.rotation.x = Math.PI / 2;
        fin.position.y = b.len * (0.5 + i * 0.08);
        straw.add(fin);
      }
    }
    if (id === 'mate47') {
      // la mira de adelante
      const sight = box(0.003, 0.014, 0.003, M.steel);
      sight.position.set(0, b.len * 0.9, 0.012);
      straw.add(sight);
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
  tilt.scale.setScalar((id === 'camionero' || id === 'tronador' || id === 'campanario' ? 0.95 : 1.1) * VM_POSE.scale);
  // dónde queda la punta de la bombilla respecto del modelo (para apuntar)
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded, tip, mouth, mate, bombGroup: mate.userData.bombGroup || null, yerba: mate.userData.yerba || null, mk3: mate.userData.mk3 || null };
}

// La cápsula gastada del Mark III (salta en la recarga): vidrio con la carga
// apagada adentro y las tapitas del color de la virola de ese mate.
export function buildMk3Cell(T, left) {
  const M = mats(T);
  const g = new THREE.Group();
  g.add(cyl(0.0105, 0.0105, 0.026, M.glass, 12));
  g.add(cyl(0.007, 0.007, 0.022, M.cellSpent, 10));
  for (const s of [-1, 1]) {
    const cap = cyl(0.0115, 0.0115, 0.005, left ? M.silver : M.gold, 12);
    cap.position.y = s * 0.0145;
    g.add(cap);
  }
  return g;
}


// Hoja de hoz: una medialuna plana que se afina hasta la punta. Se arma en
// el plano (z, y): arranca en el mango (origen), sube y se curva hacia adelante.
function sickleGeo(R, width, arc, thick) {
  const sh = new THREE.Shape();
  const n = 40;
  // borde de afuera y de adentro (el de adentro se va acercando hasta la punta)
  const outer = [];
  const inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * arc;
    const w = width * (1 - t) ** 0.7;
    outer.push([Math.cos(a) * R, Math.sin(a) * R]);
    inner.push([Math.cos(a) * (R - w), Math.sin(a) * (R - w)]);
  }
  sh.moveTo(outer[0][0], outer[0][1]);
  for (const [x, y] of outer) sh.lineTo(x, y);
  for (let i = inner.length - 1; i >= 0; i--) sh.lineTo(inner[i][0], inner[i][1]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: 0.002, bevelSegments: 1, curveSegments: 1 });
  // todas las hojas comparten el centro (así el filo queda justo en el borde de adentro)
  geo.translate(-R + 0.025, 0, -thick / 2);
  return { geo, tip: new THREE.Vector3(Math.cos(arc) * R - R + 0.025, Math.sin(arc) * R, 0) };
}

// La Hoz: mango con virola y la hoja curva. La de la Muerte: hoja negra con
// el filo verde que brilla, mango de hueso con tientos negros y runas violetas.
// gold: la hoz de oro (el bastón del Yasy dorado, entities/Yasy.js): el mango
// es el bastón, hoja de oro con el filo encendido y tachas que brillan.
let GLOW_GOLD = null;
// (los brillos propios de la hoz, más bajos que los de los otros mates: la de
// la Muerte y la de oro encandilaban; pedido del usuario 2026-10-01)
let GLOW_HOZ = null;
let RUNE_HOZ = null;
function buildHoz(upgraded, T, gold = false) {
  const M = mats(T);
  const g = new THREE.Group();
  const death = !!upgraded;
  GLOW_GOLD ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc84a).multiplyScalar(1.05), toneMapped: false });
  GLOW_HOZ ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affb0).multiplyScalar(1.3), toneMapped: false });
  RUNE_HOZ ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb05aff).multiplyScalar(1.2), toneMapped: false });
  const glowMat = gold ? GLOW_GOLD : GLOW_HOZ;
  const anim = { spin: [], glow: [], wobble: null };
  const handle = cyl(0.015, 0.018, 0.22, gold ? M.gold : death ? M.bone : M.wood, 10);
  handle.position.y = -0.03;
  g.add(handle);
  for (const y of [-0.1, -0.05, 0, 0.05]) {
    const wrap = tor(0.0175, 0.0032, gold ? M.bronze : death ? M.dark : M.leather, 6, 16);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = y;
    g.add(wrap);
  }
  if (death || gold) {
    const rune = tor(0.0182, 0.0022, gold ? GLOW_GOLD : RUNE_HOZ, 6, 16);
    rune.rotation.x = Math.PI / 2;
    rune.position.y = 0.025;
    g.add(rune);
  }
  const ferrule = cyl(0.02, 0.019, 0.035, gold ? M.gold : death ? M.bladeDark : M.bronze, 12);
  ferrule.position.y = 0.09;
  g.add(ferrule);
  // la hoja (en el plano x-y del shape; se gira para que quede en (z, y))
  const R = 0.15;
  const arc = 3.3;
  const s = sickleGeo(R, 0.0375, arc, 0.0048);
  const blade = new THREE.Mesh(s.geo, gold ? M.gold : death ? M.bladeDark : M.blade);
  const holder = new THREE.Group();
  holder.position.y = 0.1;
  holder.rotation.y = Math.PI / 2;
  holder.add(blade);
  // el filo: el borde de adentro, fino y brillante (verde en la de la Muerte)
  const edge = new THREE.Mesh(sickleGeo(R, 0.05, arc, 0.003).geo, gold ? GLOW_GOLD : death ? GLOW_HOZ : M.silver);
  holder.add(edge);
  g.add(holder);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(s.tip);
  holder.add(muzzle);
  // el filo (borde de adentro) a lo largo de la hoja: e = 0 junto a la virola, 1 en la punta
  const edgeAt = (e, out) => {
    const a = e * arc;
    const r = R - 0.05 * (1 - e) ** 0.7;
    return out.set(Math.cos(a) * r - R + 0.025, Math.sin(a) * r, 0);
  };
  // la estela va de la punta a la mitad de la hoja
  const mid = new THREE.Object3D();
  edgeAt(0.5, mid.position);
  holder.add(mid);
  if (death || gold) {
    const ember = sph(gold ? 0.013 : 0.01, glowMat);
    ember.position.copy(s.tip);
    holder.add(ember);
    anim.glow.push(ember);
  }
  // la de oro: tachas encendidas por el lomo de la hoja
  if (gold) {
    for (const e of [0.15, 0.32, 0.5, 0.68, 0.85]) {
      const a = e * arc;
      const stud = sph(0.0055, GLOW_GOLD);
      stud.position.set(Math.cos(a) * (R + 0.002) - R + 0.025, Math.sin(a) * (R + 0.002), 0);
      holder.add(stud);
    }
  }
  g.add(wrapHand(M, { radius: 0.018, y0: -0.12, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 }));
  // en la mano: el mango casi derecho y la hoja arriba, curvada hacia el centro
  const tilt = new THREE.Group();
  g.rotation.set(-0.2, 0.9, -0.45);
  g.position.set(-0.01, 0.03, 0);
  tilt.add(g);
  tilt.scale.setScalar(1.15);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  // wrist: girar g sobre su eje y (el del mango) es girar la muñeca
  return { root: tilt, muzzle, anim, upgraded, tip, mouth: null, mate: g, bombGroup: null, yerba: null, hoz: { wrist: g, baseRot: g.rotation.clone(), blade: holder, mid, edgeAt, glow: death || gold ? glowMat : null } };
}

// Piedra de asentar en la mano izquierda (la recarga de la Hoz de la Muerte).
// Parada sobre el eje y: se agarra abajo y afila con la punta (contact).
export function buildWhetstone(T) {
  const M = mats(T);
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.13, 4, 10), M.whet);
  stone.scale.set(1, 1, 0.6);
  stone.position.y = 0.065;
  g.add(stone);
  // la punta mojada (la parte que va contra el filo)
  const wet = new THREE.Mesh(new THREE.CapsuleGeometry(0.0142, 0.045, 4, 10), M.whetWet);
  wet.scale.set(1, 1, 0.61);
  wet.position.y = 0.112;
  g.add(wet);
  g.add(wrapHand(M, { radius: 0.0145, y0: -0.035, side: Math.PI / 2, dir: -1, arm: new THREE.Vector3(-0.55, -0.75, 0.4), scale: 0.95 }));
  const contact = new THREE.Object3D();
  contact.position.y = 0.142;
  g.add(contact);
  return { root: g, contact };
}

// Máquina de Muerte: una bombilla gigante de seis caños que giran, con el
// filtro de la bombilla hecho tambor y dos manijas.
function buildBombillon(T) {
  const M = mats(T);
  const g = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  const drum = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = cyl(0.009, 0.009, 0.42, M.silver, 8);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.2);
    drum.add(b);
  }
  for (const z of [-0.08, -0.36]) {
    const ring = tor(0.034, 0.006, M.gold, 6, 20);
    ring.position.z = z;
    drum.add(ring);
  }
  g.add(drum);
  anim.spin.push(drum);
  // el filtro de la bombilla, grande, atrás
  const filter = cyl(0.07, 0.07, 0.1, M.silverDark, 20);
  filter.rotation.x = Math.PI / 2;
  filter.position.z = 0.05;
  g.add(filter);
  for (let i = 0; i < 8; i++) {
    const slot = box(0.004, 0.08, 0.02, M.dark);
    const a = (i / 8) * Math.PI * 2;
    slot.position.set(Math.cos(a) * 0.071, Math.sin(a) * 0.071, 0.05);
    slot.rotation.z = a;
    g.add(slot);
  }
  const back = cyl(0.05, 0.07, 0.08, M.gold, 20);
  back.rotation.x = -Math.PI / 2;
  back.position.z = 0.14;
  g.add(back);
  const glow = sph(0.02, M.glowRed);
  glow.position.set(0, 0.075, 0.05);
  g.add(glow);
  anim.glow.push(glow);
  const grip = cyl(0.015, 0.015, 0.1, M.leather, 8);
  grip.position.set(0, -0.08, 0.08);
  g.add(grip);
  const top = tor(0.05, 0.008, M.dark, 6, 14, Math.PI);
  top.position.set(0, 0.07, -0.02);
  top.rotation.y = Math.PI / 2;
  g.add(top);
  // la mano en la empuñadura (antes no tenía: al inspeccionarlo flotaba solo)
  const hand = wrapHand(M, { radius: 0.015, y0: -0.13, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 });
  hand.position.set(0, 0, 0.08);
  g.add(hand);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.43);
  g.add(muzzle);
  const tilt = new THREE.Group();
  g.rotation.set(0.04, 0.06, 0);
  g.position.set(-0.03, 0.02, 0.05);
  tilt.add(g);
  tilt.scale.setScalar(1.15);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded: false, tip, mouth: null, mate: g, bombGroup: null, yerba: null };
}

// Bombilla Gut (el penal): un trabuco con una calabaza de culata, un atado de
// bombillas de alpaca de caño y boca de campana. Con el kit de ácido lleva un
// frasco verde arriba con caños de cobre que bajan a las bombillas.
function buildGut(upgraded, acid, T, skin = null) {
  const M = mats(T);
  const g = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  const accent = upgraded ? M.glowPurple : M.gold;
  // la culata: una calabaza acostada (con el camuflaje de la armería, si tiene)
  const stock = lathe([[0, 0], [0.04, 0.01], [0.062, 0.05], [0.066, 0.09], [0.055, 0.13], [0.034, 0.155], [0.02, 0.16]], upgraded ? M.gourdDark : skin || M.gourd, 20);
  stock.rotation.x = -Math.PI / 2;
  stock.position.z = 0.2;
  g.add(stock);
  const ring = tor(0.024, 0.005, accent, 6, 18);
  ring.position.z = 0.045;
  g.add(ring);
  // el caño: un atado de bombillas que se abren hacia la punta. Todo el caño
  // cuelga de una bisagra adelante de la culata (se quiebra para recargar) y
  // el atado gira sobre su eje (se lo hace girar como un tambor al inspeccionar).
  const barrel = new THREE.Group();
  barrel.position.set(0, -0.03, 0.04);
  g.add(barrel);
  // mismo origen que g: los hijos se ubican con las medidas de siempre
  const front = new THREE.Group();
  front.position.set(0, 0.03, -0.04);
  barrel.add(front);
  const bundle = new THREE.Group();
  front.add(bundle);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = cyl(0.0065, 0.0065, 0.34, i % 2 ? M.silver : M.silverDark, 8);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, -0.13);
    bundle.add(b);
    // los filtros de las bombillas asoman atrás
    const f = cyl(0.009, 0.009, 0.018, M.silverDark, 8);
    f.rotation.x = Math.PI / 2;
    f.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0.045);
    bundle.add(f);
  }
  for (const z of [-0.06, -0.19]) {
    const band = tor(0.027, 0.005, accent, 6, 20);
    band.position.z = z;
    front.add(band);
  }
  // boca de campana (abierta: se ve de los dos lados)
  M.goldDS ||= Object.assign(M.gold.clone(), { side: THREE.DoubleSide });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.03, 0.07, 18, 1, true), M.goldDS);
  bell.rotation.x = -Math.PI / 2;
  bell.position.z = -0.325;
  front.add(bell);
  // la garganta: une el atado con la campana (sin ella quedaba un hueco y la boca parecía suelta)
  const throat = cyl(0.026, 0.031, 0.022, M.gold, 18);
  throat.rotation.x = Math.PI / 2;
  throat.position.z = -0.285;
  front.add(throat);
  const lip = tor(0.052, 0.005, accent, 6, 22);
  lip.position.z = -0.36;
  front.add(lip);
  // gatillo, guardamonte y la empuñadura de cuero
  const guard = tor(0.02, 0.003, M.dark, 6, 14, Math.PI);
  guard.position.set(0, -0.035, 0.08);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(guard);
  const trig = box(0.004, 0.022, 0.006, M.dark);
  trig.position.set(0, -0.03, 0.08);
  g.add(trig);
  const grip = cyl(0.016, 0.018, 0.11, M.leather, 8);
  grip.position.set(0, -0.075, 0.12);
  grip.rotation.x = 0.35;
  g.add(grip);
  // el martillo gira desde su base (se amartilla al cerrar)
  const hammer = new THREE.Group();
  hammer.position.set(0, 0.017, 0.066);
  hammer.rotation.x = -0.4;
  const hb = box(0.01, 0.03, 0.02, M.dark);
  hb.position.set(0, 0.013, -0.006);
  hammer.add(hb);
  g.add(hammer);
  let goo = null;
  if (acid) {
    // el frasco de ácido, con su burbujeo verde
    const jar = cyl(0.028, 0.028, 0.08, M.glass, 14);
    jar.position.set(0, 0.06, -0.02);
    front.add(jar);
    goo = cyl(0.023, 0.023, 0.065, M.glowGreen, 12);
    goo.position.copy(jar.position);
    front.add(goo);
    anim.glow.push(goo);
    const cap = cyl(0.03, 0.03, 0.012, M.copper, 12);
    cap.position.set(0, 0.105, -0.02);
    front.add(cap);
    for (const s of [-1, 1]) {
      const tube = cyl(0.004, 0.004, 0.16, M.copper, 6);
      tube.rotation.x = Math.PI / 2 - 0.35;
      tube.position.set(s * 0.02, 0.045, -0.11);
      front.add(tube);
    }
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.37);
  front.add(muzzle);
  // la boca de atrás del caño (por acá salen las bombillas usadas al recargar)
  const breech = new THREE.Object3D();
  breech.position.set(0, 0, 0.05);
  front.add(breech);
  const tilt = new THREE.Group();
  g.rotation.set(0.04, 0.06, 0);
  g.position.set(-0.03, 0.01, 0.06);
  tilt.add(g);
  tilt.scale.setScalar(1.2);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  const gut = { barrel, bundle, hammer, breech, goo };
  return { root: tilt, muzzle, anim, upgraded, tip, mouth: null, mate: g, bombGroup: null, yerba: null, gut };
}

// Termo para la animación de recarga (cebar = recargar): cuerpo pintado,
// hombro de acero, tapón con pico vertedor, manija y la mano izquierda.
// spoutTip marca por dónde sale el agua; el chorro se dibuja aparte.
export function buildTermo(T) {
  const M = mats(T);
  const g = new THREE.Group();
  // (el cuerpo con su propio material: Weapons.tintTermo lo pinta según el
  // mate que se ceba: verde el de balas, azul el especial, rojo el explosivo)
  const body = lathe([[0, 0], [0.029, 0], [0.032, 0.005], [0.032, 0.196], [0.03, 0.204]], M.termo.clone(), 28);
  g.add(body);
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
  return { root: g, stream, spoutTip, body };
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
  // punta y mitad de la hoja: de ahí sale la estela del tajo
  const tip = new THREE.Object3D();
  tip.position.y = plata ? 0.32 : 0.22;
  const mid = new THREE.Object3D();
  mid.position.y = plata ? 0.12 : 0.09;
  g.add(tip, mid);
  g.userData.tip = tip;
  g.userData.mid = mid;
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
    // pava de aluminio: panza ancha, tapa con perilla, el pico que sale de
    // abajo y sube, y la manija negra en arco de adelante hacia atrás
    const body = lathe([[0, 0], [0.056, 0], [0.063, 0.008], [0.064, 0.03], [0.057, 0.058], [0.043, 0.077], [0.031, 0.084], [0, 0.084]], M.aluminium, 28);
    g.add(body);
    const lid = lathe([[0, 0.083], [0.031, 0.083], [0.029, 0.089], [0.016, 0.095], [0, 0.096]], M.aluminium, 20);
    g.add(lid);
    const knob = sph(0.009, M.dark);
    knob.position.y = 0.102;
    g.add(knob);
    const sp1 = cyl(0.009, 0.013, 0.05, M.aluminium, 10);
    sp1.position.set(0, 0.03, 0.075);
    sp1.rotation.x = 0.9;
    g.add(sp1);
    const sp2 = cyl(0.006, 0.009, 0.036, M.aluminium, 10);
    sp2.position.set(0, 0.061, 0.102);
    sp2.rotation.x = 0.45;
    g.add(sp2);
    const handle = tor(0.046, 0.007, M.dark, 6, 16, Math.PI);
    handle.rotation.y = Math.PI / 2;
    handle.position.y = 0.074;
    g.add(handle);
    return g;
  }
  // La bomba de yerba: un paquete de yerba de papel (amarillo, con la franja
  // colorada y la hoja), atado en cruz con piolín, el doblez de arriba y la
  // mecha retorcida con la chispa en la punta ('nadeSpark', titila en la
  // mano y volando).
  const paper = new THREE.MeshStandardMaterial({ map: yerbaPackTex(T), roughness: 0.85 });
  g.add(box(0.052, 0.078, 0.032, paper));
  // el doblez del papel, arriba
  const fold = box(0.05, 0.008, 0.028, paper);
  fold.position.set(0, 0.042, -0.002);
  fold.rotation.x = 0.18;
  g.add(fold);
  // el piolín en cruz
  const twine = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 });
  const t1 = box(0.056, 0.005, 0.036, twine);
  t1.position.y = -0.008;
  g.add(t1);
  const t2 = box(0.005, 0.084, 0.036, twine);
  g.add(t2);
  // la mecha, retorcida hacia arriba
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.044, 0), new THREE.Vector3(0.004, 0.058, 0.002), new THREE.Vector3(-0.002, 0.07, 0.004), new THREE.Vector3(0.006, 0.08, 0.002)]);
  const fuse = new THREE.Mesh(new THREE.TubeGeometry(path, 10, 0.0024, 5, false), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }));
  g.add(fuse);
  if (T?.dot) {
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    spark.position.set(0.006, 0.082, 0.002);
    spark.scale.setScalar(0.04);
    // (por nombre: clone() copia userData por JSON y un objeto ahí no sobrevive)
    spark.name = 'nadeSpark';
    g.add(spark);
  }
  return g;
}

// El papel del paquete de yerba (una vez por juego de texturas).
function yerbaPackTex(T) {
  if (T && T._yerbaPack) return T._yerbaPack;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#d9a63e';
  x.fillRect(0, 0, 128, 192);
  // la trama del papel
  for (let i = 0; i < 900; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,20,0.12)' : 'rgba(255,240,200,0.12)';
    x.fillRect(Math.random() * 128, Math.random() * 192, 2, 1);
  }
  // la franja colorada con dos rayas blancas
  x.fillStyle = '#b3151d';
  x.fillRect(0, 96, 128, 46);
  x.fillStyle = '#f2efe8';
  x.fillRect(0, 102, 128, 4);
  x.fillRect(0, 132, 128, 4);
  // la hoja de yerba
  x.fillStyle = '#3d6b2a';
  x.beginPath();
  x.ellipse(64, 56, 16, 30, 0.5, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#a8c070';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(48, 80);
  x.lineTo(80, 32);
  x.stroke();
  // abajo, más oscuro
  x.fillStyle = 'rgba(80,40,10,0.35)';
  x.fillRect(0, 170, 128, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (T) T._yerbaPack = t;
  return t;
}

// Mate cebado con la yerba del perk (para la animación de tomar): la bombilla
// se inclina hacia quien toma y tip marca su punta (la que va a la boca).
export function buildPerkMate(T, color) {
  const M = mats(T);
  const g = new THREE.Group();
  const body = lathe(PROFILES.calabaza, new THREE.MeshStandardMaterial({ color, roughness: 0.5, map: T.gourd }));
  // la pared de adentro y la virola cerrada (la vieja no tenía cara de adentro
  // y parecía una arandela flotando). Los de cada perk: weapons/perkMates.js
  body.add(lathe([[0.031, 0.1], [0.0285, 0.1], [0.0285, 0.07]], body.material));
  g.add(body);
  const v = lathe([[0.03, 0.09], [0.034, 0.09], [0.035, 0.096], [0.034, 0.102], [0.03, 0.102], [0.03, 0.09]], M.silver);
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

// Las piezas para armar mates en otros archivos.
export const VM = { mats, lathe, cyl, box, sph, tor, bombilla, cupHand, wrapHand, yerba, profileRadius, topOf, limb, PROFILES };
