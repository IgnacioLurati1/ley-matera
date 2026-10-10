import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crossGeo, cutToGbuf } from '../../world/eclipse/centro';

// Lo que se ve de "El chambergo del matrero" (entities/eclipse/Sombrero.js):
// el chambergo (en la estaca del santuario y en la cabeza de los muñecos), la
// cinta, la hebilla y la pluma que se juntan, el cóndor del Monumento, las
// cadenas de la celda de los Calabozos y el pajonal que arde de La Tapera.
// Todo de piezas simples, con materiales propios (uno por sesión).

let MATS = null;
function mats() {
  MATS ||= {
    felt: new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 0.95, side: THREE.DoubleSide }),
    cinta: new THREE.MeshStandardMaterial({ color: 0x9a2418, roughness: 0.7 }),
    cintaGlow: new THREE.MeshStandardMaterial({ color: 0x9a2418, roughness: 0.7, emissive: 0x7a1408, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
    rust: new THREE.MeshStandardMaterial({ color: 0x74442a, roughness: 0.7, metalness: 0.5 }),
    rustGlow: new THREE.MeshStandardMaterial({ color: 0x9a5630, roughness: 0.6, metalness: 0.55, emissive: 0x5a2a0c, emissiveIntensity: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 0.8, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8, side: THREE.DoubleSide }),
    quill: new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.6 }),
    // (el cóndor: negro contra el cielo de noche no se veía; un poco de luz propia)
    bird: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.85, emissive: 0x6a5a4a, emissiveIntensity: 0.75, side: THREE.DoubleSide }),
    birdWhite: new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.8, emissive: 0xf0ece2, emissiveIntensity: 0.42, side: THREE.DoubleSide }),
    birdHead: new THREE.MeshStandardMaterial({ color: 0x9a5a52, roughness: 0.8, emissive: 0x9a5a52, emissiveIntensity: 0.7 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.55, metalness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }),
  };
  return MATS;
}
const M = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};

// Una pluma de cóndor: la vena, y la barba negra con la base blanca. Parada
// en +y, de largo L (el cañón en el origen), chata en z.
function featherGeo(L, W) {
  const s = new THREE.Shape();
  s.moveTo(0, L * 0.12);
  s.quadraticCurveTo(W * 0.62, L * 0.3, W * 0.5, L * 0.72);
  s.quadraticCurveTo(W * 0.3, L * 0.96, 0, L);
  s.quadraticCurveTo(-W * 0.36, L * 0.9, -W * 0.42, L * 0.66);
  s.quadraticCurveTo(-W * 0.5, L * 0.3, 0, L * 0.12);
  return new THREE.ShapeGeometry(s, 8);
}
export function buildFeather(L = 0.6) {
  const X = mats();
  const g = new THREE.Group();
  const W = L * 0.24;
  const vane = M(featherGeo(L, W), X.black);
  g.add(vane);
  // la base blanca (los cóndores tienen blanco en las plumas del ala)
  const base = M(featherGeo(L * 0.5, W * 0.86), X.white, 0, L * 0.06, 0.002);
  g.add(base);
  g.add(M(new THREE.CylinderGeometry(L * 0.006, L * 0.012, L * 1.02, 5), X.quill, 0, L * 0.51, 0.001));
  return g;
}

// El chambergo, en centímetros (el espacio de la malla del gaucho, net/gauchoSkin:
// +y arriba, +z adelante). El origen va en el eje de la cabeza, a la altura del
// ala del sombrero de siempre (y 180 de la malla), al que tapa entero: ala de
// 32 (la de siempre mide 28), copa de 18,9 (la de siempre 16,9) hasta 15 arriba
// (la de siempre 13). Fieltro negro, la cinta de cuero colorado, la hebilla
// herrumbrada adelante y la pluma de cóndor a la izquierda, echada para atrás.
export function buildChambergo() {
  const X = mats();
  const g = new THREE.Group();
  const prof = [[16.5, -1.7], [30.6, -2.0], [32.0, -1.0], [31.2, 0.9], [19.8, 2.1], [18.9, 3.2], [18.4, 8.6], [17.3, 11.9], [14.2, 14.4], [7.6, 15.5], [0, 15.0]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(M(new THREE.LatheGeometry(prof, 28), X.felt));
  // la cinta de cuero, al pie de la copa
  g.add(M(new THREE.CylinderGeometry(19.15, 19.5, 3.0, 28, 1, true), X.cinta, 0, 3.7, 0));
  // la hebilla: un marco herrumbrado con su clavillo, adelante y un poco a la derecha
  const bk = new THREE.Group();
  for (const [w, h, x, y] of [[5.2, 0.8, 0, 1.7], [5.2, 0.8, 0, -1.7], [0.8, 4.2, 2.2, 0], [0.8, 4.2, -2.2, 0]]) bk.add(M(new THREE.BoxGeometry(w, h, 0.8), X.rust, x, y, 0));
  bk.add(M(new THREE.BoxGeometry(4.2, 0.5, 0.5), X.rust, 0.2, 0, 0.3, 0, 0, 0.12));
  const ba = 0.42;
  bk.position.set(Math.sin(ba) * 19.7, 3.7, Math.cos(ba) * 19.7);
  bk.rotation.y = ba;
  g.add(bk);
  // la pluma: metida en la cinta del lado derecho, acostada contra la copa
  // (la cara de la pluma mira para afuera), echada para atrás y arriba
  const f = buildFeather(30);
  const fa = -1.25;
  f.position.set(Math.sin(fa) * 20.1, 2.4, Math.cos(fa) * 20.1);
  f.rotation.set(0.16, fa, 0.62, 'YXZ');
  g.add(f);
  return g;
}

// La cinta de cuero colorado, enrollada, con la punta suelta (para juntar; ~0,3 m).
export function buildCinta() {
  const X = mats();
  const g = new THREE.Group();
  const coil = M(new THREE.TorusGeometry(0.11, 0.018, 6, 22), X.cintaGlow, 0, 0, 0, Math.PI / 2, 0, 0);
  coil.scale.z = 2.6;
  g.add(coil);
  const in2 = M(new THREE.TorusGeometry(0.075, 0.016, 6, 18), X.cintaGlow, 0, 0.004, 0, Math.PI / 2, 0, 0.8);
  in2.scale.z = 2.4;
  g.add(in2);
  // la punta que cuelga
  g.add(M(new THREE.BoxGeometry(0.2, 0.09, 0.012), X.cintaGlow, 0.2, -0.01, 0.045, 0, 0.5, -0.25));
  return g;
}

// La hebilla herrumbrada (para juntar; agrandada: ~0,24 m).
export function buildHebilla() {
  const X = mats();
  const g = new THREE.Group();
  for (const [w, h, x, y] of [[0.24, 0.035, 0, 0.075], [0.24, 0.035, 0, -0.075], [0.035, 0.185, 0.1025, 0], [0.035, 0.185, -0.1025, 0]]) g.add(M(new THREE.BoxGeometry(w, h, 0.03), X.rustGlow, x, y, 0));
  g.add(M(new THREE.BoxGeometry(0.2, 0.022, 0.022), X.rustGlow, 0.012, 0, 0.012, 0, 0, 0.1));
  g.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), X.rustGlow, -0.1025, 0, 0));
  return g;
}

// Las mallas sueltas de un grupo, una por material (las de un grupo de adentro
// no: se mueven aparte).
function fuse(grp) {
  const by = new Map();
  for (const o of [...grp.children]) {
    if (!o.isMesh) continue;
    o.updateMatrix();
    o.geometry.applyMatrix4(o.matrix);
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(o.geometry);
    grp.remove(o);
  }
  for (const [mat, L] of by) {
    grp.add(new THREE.Mesh(L.length > 1 ? mergeGeometries(L) : L[0], mat));
    if (L.length > 1) for (const q of L) q.dispose();
  }
}

// El cóndor (metros; mira a +z). Devuelve { root, flap(k) }: k de -1 (alas
// abajo) a 1 (arriba). Envergadura ~3,4 m: negro, el collar y las plumas del
// ala blancas, la cabeza pelada.
export function buildCondor() {
  const X = mats();
  const root = new THREE.Group();
  const body = M(new THREE.SphereGeometry(1, 12, 8), X.bird);
  body.scale.set(0.27, 0.23, 0.56);
  root.add(body);
  root.add(M(new THREE.TorusGeometry(0.13, 0.055, 6, 14), X.birdWhite, 0, 0.05, 0.47));
  root.add(M(new THREE.CylinderGeometry(0.06, 0.09, 0.26, 8), X.birdHead, 0, 0.07, 0.6, Math.PI / 2 - 0.2, 0, 0));
  const head = M(new THREE.SphereGeometry(0.085, 10, 8), X.birdHead, 0, 0.1, 0.76);
  head.scale.set(1, 0.95, 1.25);
  root.add(head);
  root.add(M(new THREE.ConeGeometry(0.035, 0.12, 6), X.quill, 0, 0.07, 0.9, Math.PI / 2 + 0.35, 0, 0));
  // la cola abierta
  for (let i = -2; i <= 2; i++) root.add(M(new THREE.BoxGeometry(0.11, 0.015, 0.5), X.bird, i * 0.085, 0, -0.72, 0, i * 0.14, 0));
  const wings = [];
  for (const s of [-1, 1]) {
    const inner = new THREE.Group();
    inner.position.set(s * 0.2, 0.06, 0.1);
    inner.add(M(new THREE.BoxGeometry(0.82, 0.03, 0.52), X.bird, s * 0.41, 0, 0));
    // las blancas, arriba del ala (atrás)
    inner.add(M(new THREE.BoxGeometry(0.74, 0.012, 0.24), X.birdWhite, s * 0.42, 0.022, -0.13));
    // (y abajo: desde el piso se le ve la panza)
    inner.add(M(new THREE.BoxGeometry(0.74, 0.012, 0.2), X.birdWhite, s * 0.42, -0.022, -0.13));
    const outer = new THREE.Group();
    outer.position.set(s * 0.82, 0, 0);
    outer.add(M(new THREE.BoxGeometry(0.62, 0.024, 0.44), X.bird, s * 0.31, 0, 0.01));
    // los dedos de la punta
    for (let i = 0; i < 5; i++) outer.add(M(new THREE.BoxGeometry(0.4, 0.012, 0.07), X.bird, s * 0.78, 0, 0.2 - i * 0.1, 0, s * (0.28 - i * 0.14), 0));
    inner.add(outer);
    root.add(inner);
    wings.push({ s, inner, outer });
  }
  const flap = (k) => {
    for (const w of wings) {
      w.inner.rotation.z = w.s * k * 0.42;
      w.outer.rotation.z = w.s * k * 0.34;
    }
  };
  // (2026-10-10: eran 28 mallas, 56 dibujos por cuadro cuando se lo ve. El
  // cuerpo, cada ala y cada punta de ala, juntos por material: 10.
  // globalThis.__mduCondorSuelto: como antes)
  if (globalThis.__mduCondorSuelto !== true) {
    for (const w of wings) {
      fuse(w.outer);
      fuse(w.inner);
    }
    fuse(root);
  }
  flap(0.2);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return { root, flap };
}

// Las cadenas que cruzan el vano de una celda (ancho w en x, alto h; en el
// plano z = 0, el piso en y = 0) y el candado en el medio, del lado +z.
export function buildCadenas(w = 1.1, h = 2.2) {
  const X = mats();
  const g = new THREE.Group();
  const link = new THREE.TorusGeometry(0.045, 0.012, 5, 10);
  const geos = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (const sg of [-1, 1]) {
    const a = new THREE.Vector3((-sg * w) / 2, h, 0);
    const b = new THREE.Vector3((sg * w) / 2, 0.25, 0);
    const len = a.distanceTo(b);
    const n = Math.round(len / 0.068);
    const tilt = Math.atan2(b.x - a.x, a.y - b.y);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // (una panza: la cadena cuelga un poco)
      p.lerpVectors(a, b, t);
      p.y -= Math.sin(t * Math.PI) * 0.1;
      p.z = sg * 0.018;
      q.setFromEuler(e.set(0, i % 2 ? Math.PI / 2 : 0, tilt, 'ZYX'));
      geos.push(link.clone().applyMatrix4(m4.compose(p, q, one)));
    }
  }
  const chain = new THREE.Mesh(mergeGeometries(geos), X.chain);
  chain.castShadow = false;
  g.add(chain);
  for (const x of geos) x.dispose();
  link.dispose();
  // el candado: el cuerpo y el arco
  const lock = new THREE.Group();
  lock.position.set(0, h * 0.5 + 0.06, 0.06);
  lock.add(M(new THREE.BoxGeometry(0.15, 0.16, 0.06), X.rust, 0, -0.03, 0));
  lock.add(M(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), X.chain, 0, 0.05, 0));
  lock.add(M(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 6), X.chain, 0, -0.03, 0.035, Math.PI / 2, 0, 0));
  g.add(lock);
  return { root: g, chain, lock };
}

// La estaca del santuario: un palo con un travesaño corto y una cinta colorada
// atada (ahí aparece el chambergo). El origen en el piso; TOP: dónde apoya el sombrero.
export const ESTACA_TOP = 1.28;
export function buildEstaca() {
  const X = mats();
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.035, 0.045, ESTACA_TOP + 0.3, 7), X.wood, 0, (ESTACA_TOP + 0.3) / 2 - 0.3, 0, 0, 0, 0.03));
  g.add(M(new THREE.CylinderGeometry(0.024, 0.024, 0.46, 6), X.wood, 0, ESTACA_TOP - 0.22, 0, 0, 0, Math.PI / 2 + 0.06));
  g.add(M(new THREE.TorusGeometry(0.045, 0.012, 5, 12), X.cinta, 0, ESTACA_TOP - 0.22, 0, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.035, 0.3, 0.008), X.cinta, s * 0.03, ESTACA_TOP - 0.39, 0.045, 0.08, 0, s * 0.14));
  return g;
}

// El pajonal que arde: matas de paja alta en el rectángulo [x0, z0, x1, z1]
// (a la altura y), el piso quemado, las brasas y el resplandor. Devuelve
// { root, spots: [[x, z, h]...] (de dónde salen las llamas), glow, embers }.
export function buildPajonal(w, rect, y, seed = 7) {
  const [x0, z0, x1, z1] = rect;
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const root = new THREE.Group();
  root.name = 'eclipse:sombrero:pajonal';
  const base = w.M.reed;
  const mat = base
    ? new THREE.MeshStandardMaterial({ map: base.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: 0xc8a468, emissive: 0xff5a10, emissiveIntensity: 0.1 })
    : new THREE.MeshStandardMaterial({ color: 0xc8a050, side: THREE.DoubleSide, roughness: 0.95, emissive: 0xff5a10, emissiveIntensity: 0.1 });
  cutToGbuf(mat);
  // (un manchón desparejo adentro del rectángulo, más alto en el medio: con
  // las matas en cuadro se veía una pared de paja con el borde recto)
  const spots = [];
  const cx0 = (x0 + x1) / 2;
  const cz0 = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2 - 0.3;
  const rz = (z1 - z0) / 2 - 0.3;
  const ph = r() * 6;
  const n = Math.round((x1 - x0) * (z1 - z0) * 5);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const z = z0 + r() * (z1 - z0);
    const a = Math.atan2(z - cz0, x - cx0);
    const edge = 0.82 + 0.16 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 7 + ph * 2);
    const d = Math.hypot((x - cx0) / rx, (z - cz0) / rz) / edge;
    if (d > 1) continue;
    const k = 1 - d * d;
    spots.push([x, z, 0.55 + k * 0.85 + r() * 0.45, r() * Math.PI]);
  }
  const im = new THREE.InstancedMesh(crossGeo(1.2, 3), mat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  spots.forEach(([x, z, h, a], k) => {
    q.setFromAxisAngle(up, a);
    im.setMatrixAt(k, m4.compose(v.set(x, y - 0.05, z), q, sc.set(0.7 + (h - 1) * 0.25, h, 0.7 + (h - 1) * 0.25)));
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false;
  im.receiveShadow = true;
  root.add(im);
  // el piso quemado y el resplandor del fuego (dos planos pegados al piso)
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const tex = (inner, outer) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.7, outer);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const plane = new THREE.PlaneGeometry(x1 - x0 + 2.2, z1 - z0 + 2.2).rotateX(-Math.PI / 2);
  const burnt = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex('rgba(8,5,3,0.85)', 'rgba(10,6,4,0.6)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  burnt.position.set(cx, y + 0.012, cz);
  burnt.renderOrder = 1;
  root.add(burnt);
  const glow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex('rgba(255,120,30,1)', 'rgba(255,70,10,0.45)'), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  glow.position.set(cx, y + 0.02, cz);
  glow.renderOrder = 2;
  root.add(glow);
  // las brasas en el piso
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, toneMapped: false });
  const ne = 46;
  const embers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.028, 0), emberMat, ne);
  for (let i = 0; i < ne; i++) embers.setMatrixAt(i, m4.makeTranslation(x0 + r() * (x1 - x0), y + 0.03, z0 + r() * (z1 - z0)));
  embers.instanceMatrix.needsUpdate = true;
  embers.computeBoundingSphere();
  embers.castShadow = false;
  root.add(embers);
  return { root, spots, mat, im, glow, emberMat };
}
