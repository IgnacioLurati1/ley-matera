import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { streetY } from './Monumento';
import { lathe, cylUV } from './monumentoKit';
import { rng } from '../core/noise';
import { statue } from './monumentoStatues';
import { windy } from '../fx/grassPush';

// La vida de las calles de afuera del Monumento (se ve, no se pisa): los
// fresnos de las veredas, los autos estacionados (y alguno abandonado de
// apuro, con la puerta abierta), las columnas de alumbrado, los bancos, los
// tachos, el kiosco de diarios, la parada del colectivo y los semáforos de la
// esquina con la avenida; al oeste, la plaza 25 de Mayo con sus tipas, sus
// canteros y el Monumento a la Independencia, y los edificios de alrededor.
// Todo en instancias (un dibujo por pieza para todas las copias), sin sombras.

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

// Una pieza repetida: la geometría, el material y la lista de matrices (y colores).
function kit(geo, mat) {
  return { geo, mat, list: [], cols: null };
}
function put(k, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0, col = null) {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  k.list.push(new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
  if (col != null) (k.cols ||= []).push(col);
}
function build(root, k) {
  if (!k.list.length) return null;
  const im = new THREE.InstancedMesh(k.geo, k.mat, k.list.length);
  k.list.forEach((m, i) => im.setMatrixAt(i, m));
  if (k.cols) k.cols.forEach((c, i) => im.setColorAt(i, tmpC.set(c)));
  im.castShadow = false;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  im.userData.reflect = false;
  root.add(im);
  return im;
}

// Las piezas de un objeto armado de cajas y cilindros, juntas en una geometría
// (en metros, con el origen en el piso).
function merged(parts) {
  const geos = parts.map(([g, x, y, z, rx = 0, ry = 0, rz = 0]) => {
    const c = g.index ? g.toNonIndexed() : g;
    tmpE.set(rx, ry, rz);
    return c.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(tmpE).setPosition(x, y, z));
  });
  for (const g of geos) for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
  return mergeGeometries(geos);
}

export function buildCalles(w) {
  const M = w.M;
  const root = new THREE.Group();
  root.name = 'calles';
  w.root.add(root);
  const r = rng(2043);
  const slope = Math.atan(0.088);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0, ...o.x });

  // ---- los árboles (fresnos en las veredas, tipas en la plaza): tronco y tres copas
  const trunk = kit(new THREE.CylinderGeometry(0.11, 0.2, 1, 6).translate(0, 0.5, 0), M.bark);
  const leafM = windy(mat(0x2a3d22, { r: 0.95, x: { flatShading: true } }), { crown: true });
  const crown = kit(new THREE.IcosahedronGeometry(1, 1), leafM);
  const tree = (x, z, y, h = 4 + r() * 1.5, wide = 1) => {
    put(trunk, x, y, z, r() * 6, 1, h, 1);
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      const s = (1.3 + r() * 0.6) * wide;
      put(crown, x + Math.cos(a) * 0.7 * wide, y + h + 0.3 + r() * 0.8, z + Math.sin(a) * 0.7 * wide, r() * 6, s, s * 0.75, s);
    }
  };
  // ---- los autos: carrocería, cabina con vidrios, ruedas y paragolpes
  // (la carrocería con el techo y los parantes del color del auto; los vidrios,
  // una banda oscura metida adentro)
  const body = kit(merged([
    [new THREE.BoxGeometry(4.1, 0.6, 1.72), 0, 0.63, 0],
    [new THREE.BoxGeometry(1.2, 0.12, 1.66), 1.45, 0.96, 0, 0, 0, -0.06],
    [new THREE.BoxGeometry(0.9, 0.14, 1.66), -1.6, 0.97, 0],
    [new THREE.BoxGeometry(1.95, 0.07, 1.44), -0.22, 1.48, 0],
    [new THREE.BoxGeometry(0.08, 0.5, 1.4), 0.74, 1.2, 0, 0, 0, 0.62],
    [new THREE.BoxGeometry(0.08, 0.48, 1.4), -1.17, 1.2, 0, 0, 0, -0.5],
    [new THREE.BoxGeometry(0.06, 0.48, 1.46), -0.22, 1.21, 0],
    [new THREE.BoxGeometry(0.22, 0.16, 1.62), 2.06, 0.46, 0],
    [new THREE.BoxGeometry(0.22, 0.16, 1.62), -2.06, 0.46, 0],
  ]), mat(0xffffff, { r: 0.35, m: 0.4 }));
  const cabin = kit(merged([[new THREE.BoxGeometry(1.86, 0.46, 1.36), -0.22, 1.2, 0], [new THREE.BoxGeometry(0.42, 0.4, 1.3), 0.66, 1.16, 0, 0, 0, 0.62], [new THREE.BoxGeometry(0.34, 0.4, 1.3), -1.12, 1.17, 0, 0, 0, -0.5]]), mat(0x2a3440, { r: 0.08, m: 0.75 }));
  const wheel = kit(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2), mat(0x141414, { r: 0.9 }));
  const lights = kit(merged([[new THREE.BoxGeometry(0.04, 0.12, 0.3), 2.06, 0.75, 0.6], [new THREE.BoxGeometry(0.04, 0.12, 0.3), 2.06, 0.75, -0.6]]), mat(0xfff0c0, { r: 0.3, x: { emissive: 0x4a4030, emissiveIntensity: 0.6 } }));
  const door = kit(new THREE.BoxGeometry(1.0, 0.95, 0.06).translate(-0.5, 0.82, 0), mat(0xffffff, { r: 0.35, m: 0.4 }));
  const CAR = [0x8a1c1c, 0x1d3a6a, 0xd8d4c8, 0x2a2a2a, 0x5a6a48, 0xb89a3a, 0x6a6e74, 0x3a2a4a, 0xe6e0d0, 0x24484a];
  const car = (x, z, dir, open = false) => {
    const y = streetY(x);
    const ry = dir > 0 ? 0 : Math.PI;
    const col = CAR[Math.floor(r() * CAR.length)];
    // (la calle baja hacia el río: la trompa que mira al río, más abajo)
    const tilt = dir > 0 ? -slope : slope;
    const jit = (r() - 0.5) * 0.08;
    put(body, x, y, z, ry + jit, 1, 1, 1, 0, tilt, col);
    put(cabin, x, y, z, ry + jit, 1, 1, 1, 0, tilt);
    put(lights, x, y, z, ry + jit, 1, 1, 1, 0, tilt);
    for (const [dx, dz] of [[1.35, 0.78], [1.35, -0.78], [-1.3, 0.78], [-1.3, -0.78]]) {
      const c = Math.cos(ry + jit);
      const s = Math.sin(ry + jit);
      const wx = x + dx * c + dz * s;
      const wz = z - dx * s + dz * c;
      put(wheel, wx, streetY(wx) + 0.33, wz, ry + jit);
    }
    // la puerta del conductor abierta: se bajó corriendo
    if (open) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const hx = x + 0.75 * c + 0.86 * s;
      const hz = z - 0.75 * s + 0.86 * c;
      put(door, hx, streetY(hx), hz, ry + 1.0, 1, 1, 1, 0, 0, col);
    }
  };
  // ---- las columnas de alumbrado de las calles (pescante con la luminaria)
  const lampPole = kit(merged([[new THREE.CylinderGeometry(0.06, 0.11, 6.4, 8), 0, 3.2, 0], [new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), 0, 6.3, 0.65, Math.PI / 2], [new THREE.BoxGeometry(0.3, 0.12, 0.6), 0, 6.28, 1.35]]), M.iron);
  const lampGlass = kit(new THREE.BoxGeometry(0.24, 0.04, 0.5), M.lampGlass);
  const lamp = (x, z, toward) => {
    const y = streetY(x) + 0.12;
    const ry = toward > 0 ? 0 : Math.PI;
    put(lampPole, x, y, z, ry);
    put(lampGlass, x, y + 6.2, z + toward * 1.35, ry);
  };
  // ---- bancos, tachos, el kiosco, la parada y los semáforos
  // (las calles bajan hacia el río: las patas del banco, los parantes de la
  // parada y el kiosco bajan de más, que del lado de abajo no queden en el aire)
  const bench = kit(merged([[new THREE.BoxGeometry(1.7, 0.05, 0.42), 0, 0.44, 0], [new THREE.BoxGeometry(1.7, 0.32, 0.05), 0, 0.68, -0.2, -0.15], [new THREE.BoxGeometry(0.06, 0.56, 0.44), -0.78, 0.16, 0], [new THREE.BoxGeometry(0.06, 0.56, 0.44), 0.78, 0.16, 0]]), M.wood || M.woodDark);
  const bin = kit(new THREE.CylinderGeometry(0.22, 0.2, 0.85, 10).translate(0, 0.42, 0), mat(0x2a4a2a, { r: 0.6, m: 0.3 }));
  const kiosco = kit(merged([[new THREE.BoxGeometry(2.2, 2.45, 1.6), 0, 0.975, 0], [new THREE.BoxGeometry(2.6, 0.12, 2.0), 0, 2.3, 0], [new THREE.BoxGeometry(2.0, 0.9, 0.5), 0, 0.95, 1.0]]), mat(0x2a5a3a, { r: 0.55, m: 0.3 }));
  const revistas = kit(new THREE.PlaneGeometry(1.9, 0.8), mat(0xffffff, { r: 0.8, x: { map: magazines() } }));
  const parada = kit(merged([[new THREE.BoxGeometry(3.2, 0.08, 1.4), 0, 2.4, 0], [new THREE.BoxGeometry(0.07, 2.7, 0.07), -1.5, 1.05, -0.6], [new THREE.BoxGeometry(0.07, 2.7, 0.07), 1.5, 1.05, -0.6], [new THREE.BoxGeometry(3.0, 0.05, 0.4), 0, 0.5, -0.4], [new THREE.BoxGeometry(3.0, 1.6, 0.03), 0, 1.4, -0.66]]), mat(0x6a7480, { r: 0.4, m: 0.5 }));
  const semaforo = kit(merged([[new THREE.CylinderGeometry(0.07, 0.08, 3.2, 8), 0, 1.6, 0], [new THREE.BoxGeometry(0.3, 0.85, 0.28), 0, 3.4, 0]]), mat(0x1a1c1a, { r: 0.6, m: 0.4 }));
  const ambar = kit(new THREE.SphereGeometry(0.09, 8, 6), mat(0x302008, { x: { emissive: 0xffa020, emissiveIntensity: 2.2 } }));
  const cartel = kit(new THREE.PlaneGeometry(0.9, 0.22), mat(0xffffff, { r: 0.7, x: { map: streetSign() } }));

  // ---- Córdoba (norte) y Santa Fe (sur)
  for (const [zTree, zFar, zNear, s] of [[5.4, 7.25, 12.55, 1], [54.6, 52.75, 47.45, -1]]) {
    // los fresnos y las columnas de alumbrado de la vereda de enfrente
    for (let x = 23; x < 88; x += 7.5 + r() * 2) tree(x, zTree, streetY(x) + 0.12, 3.8 + r() * 1.6, 0.9);
    for (let x = 27; x < 88; x += 15) lamp(x, zTree + s * 0.4, s);
    // autos estacionados contra el cordón de enfrente; del lado del Monumento
    // pocos (y lejos de las ventanas por donde trepan los muertos)
    for (let x = 22; x < 70; x += 4.6 + r() * 3.2) if (r() < 0.82) car(x, zFar, r() < 0.5 ? 1 : -1, r() < 0.12);
    for (const x of [24.5, 30.5, 66.5]) car(x + (r() - 0.5), zNear, s > 0 ? 1 : -1, r() < 0.3);
    // bancos y tachos
    for (let x = 31; x < 86; x += 14) {
      put(bench, x, streetY(x) + 0.12, zTree - s * 0.9, s > 0 ? 0 : Math.PI);
      put(bin, x + 3, streetY(x + 3) + 0.12, zTree + s * 0.5);
    }
    // el kiosco de diarios y la parada del colectivo
    const kx = s > 0 ? 50 : 62;
    put(kiosco, kx, streetY(kx) + 0.12, zTree - s * 0.6, s > 0 ? 0 : Math.PI);
    put(revistas, kx, streetY(kx) + 0.12 + 0.95, zTree - s * 0.6 + s * 1.26, s > 0 ? 0 : Math.PI);
    const px = s > 0 ? 70 : 40;
    put(parada, px, streetY(px) + 0.12, zTree, s > 0 ? 0 : Math.PI);
    // los semáforos de la esquina con la avenida (titilan en amarillo): uno en
    // la vereda de enfrente y el otro en la explanada, 12 cm más abajo (estaba
    // a la altura de la vereda, en el aire)
    for (const [x, z, y] of [[89.6, zTree + s * 0.6, -2.48], [89.6, zNear + s * 2.6, -2.6]]) {
      put(semaforo, x, y, z, 0);
      put(ambar, x + 0.15, y + 3.4, z, 0);
      put(ambar, x - 0.15, y + 3.4, z, 0);
      if (y < -2.5) w.addBox([x - 0.08, y, z - 0.08, x + 0.08, y + 3.85, z + 0.08], { kind: 'prop', solid: false });
    }
    // el cartel de la calle en la esquina, atornillado al poste del semáforo
    // (antes quedaba colgado del aire, 80 cm al costado)
    put(cartel, 89.525, -2.48 + 2.6, zTree + s * 0.6, -Math.PI / 2);
  }
  // un auto abandonado de costado en la avenida, con la puerta abierta
  car(93.5, 6.5, 1, true);

  // ---- la plaza 25 de Mayo (al oeste del Pasaje)
  const py = 3.38;
  for (const [x, z] of [[-6, 22], [-12, 24], [-18, 21], [-26, 23], [-33, 21], [-6, 38], [-13, 36.5], [-20, 39], [-28, 37], [-35, 38.5], [-38, 30], [-9, 8], [-16, 3], [-25, 10], [-33, 4], [-10, 50], [-18, 56], [-27, 48], [-35, 55]]) tree(x, z, z > 20 && z < 40 ? py : 3.3, 4.5 + r() * 2, 1.25);
  for (const [x, z, ry] of [[-9, 26.5, Math.PI], [-9, 33.5, 0], [-30, 26.5, Math.PI], [-30, 33.5, 0], [-15, 26.5, Math.PI], [-24, 33.5, 0]]) put(bench, x, py, z, ry);
  for (const [x, z] of [[-4, 27], [-4, 34], [-36, 27], [-36, 34]]) {
    put(lampPole, x, py, z, 0, 0.75);
    put(lampGlass, x, py + 4.65, z + 1.0, 0, 0.75);
  }
  for (const k of [trunk, crown, body, cabin, wheel, lights, door, lampPole, lampGlass, bench, bin, kiosco, revistas, parada, semaforo, ambar, cartel]) build(root, k);

  // el Monumento a la Independencia: la columna de mármol sobre su basamento,
  // con la Libertad arriba, en el medio de la plaza
  const marble = M.marble || M.travertino;
  const cx = -21;
  const cz = 30;
  const col = new THREE.Group();
  const add = (g, m, x, y, z) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    col.add(o);
  };
  add(new THREE.BoxGeometry(5.4, 0.6, 5.4), M.travertino, cx, py + 0.3, cz);
  add(new THREE.BoxGeometry(4.2, 0.6, 4.2), M.travertino, cx, py + 0.9, cz);
  add(new THREE.BoxGeometry(2.6, 3.4, 2.6), marble, cx, py + 2.9, cz);
  add(lathe([[0, 0], [0.95, 0], [0.95, 0.25], [0.7, 0.45], [0.62, 0.6], [0.55, 12.0], [0.72, 12.2], [0.9, 12.6], [0.9, 12.9], [0, 12.9]], 20), marble, cx, py + 4.6, cz);
  for (const o of statue('lola', M.bronze, cx, py + 17.5, cz, Math.PI / 2, 1.5)) col.add(o);
  col.traverse((o) => o.isMesh && (o.castShadow = false));
  root.add(col);
  // los canteros con flores alrededor
  const flores = mat(0x6a2a4a, { r: 0.9, x: { flatShading: true } });
  const cantero = kit((globalThis.__mduNoCylUV === true ? (g) => g : cylUV)(new THREE.CylinderGeometry(1.6, 1.6, 0.35, 16).translate(0, 0.17, 0)), M.travertino);
  const flor = kit(new THREE.IcosahedronGeometry(0.4, 0), flores);
  for (const [x, z] of [[-14, 30], [-28, 30], [-21, 23], [-21, 37]]) {
    put(cantero, x, py, z);
    for (let k = 0; k < 7; k++) put(flor, x + (r() - 0.5) * 2.2, py + 0.4, z + (r() - 0.5) * 2.2, r() * 6, 1, 0.6 + r() * 0.4, 1);
  }
  build(root, cantero);
  build(root, flor);
  // los edificios de enfrente de la plaza (el Palacio Fuentes, el Correo): de
  // la fachada de departamentos, mirando al este
  buildPlazaFronts(w, root);
}

// Los frentes del lado de la plaza (x -42), altos, con su revoque de ventanas.
function buildPlazaFronts(w, root) {
  const M = w.M;
  const facs = M.fachadas || [];
  if (!facs.length) return;
  let z = -8;
  let i = 0;
  while (z < 66) {
    const W = 10 + (i % 3) * 4;
    const h = 18 + (i % 4) * 6;
    const geo = new THREE.PlaneGeometry(W, h);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (W / 10), uv.getY(k) * (h / 24));
    const m = new THREE.Mesh(geo, facs[i % facs.length]);
    m.position.set(-44, 3.3 + h / 2, z + W / 2);
    m.rotation.y = Math.PI / 2;
    m.castShadow = false;
    root.add(m);
    z += W + 0.3;
    i++;
  }
}

// Las tapas de las revistas del kiosco (un cartel de colores).
function magazines() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 108;
  const x = c.getContext('2d');
  x.fillStyle = '#1a1a1a';
  x.fillRect(0, 0, 256, 108);
  const cols = ['#c83a2a', '#e8c040', '#2a6ac8', '#e8e0d0', '#3a8a4a', '#c85a9a', '#f08030'];
  for (let i = 0; i < 18; i++) {
    x.fillStyle = cols[i % cols.length];
    x.fillRect(4 + (i % 9) * 28, 6 + Math.floor(i / 9) * 50, 24, 44);
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.fillRect(6 + (i % 9) * 28, 10 + Math.floor(i / 9) * 50, 20, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// El cartel azul de la esquina (Av. Belgrano).
function streetSign() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#1d4a8a';
  x.fillRect(0, 0, 256, 64);
  x.strokeStyle = '#f2f2f2';
  x.lineWidth = 4;
  x.strokeRect(4, 4, 248, 56);
  x.fillStyle = '#f2f2f2';
  x.font = '700 30px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('AV. BELGRANO', 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
