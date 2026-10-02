import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rboxGeo, cylGeo, boxGeo } from './props';

// La clausura del Capataz y del Alcaide (Interactables.lock): cadenas de
// eslabones de verdad que envuelven la cosa clausurada, un candado de bronce
// que cuelga del cruce y el precinto de papel con lacre. Cada cosa con lo suyo:
//   perk → dos vueltas alrededor de la máquina y una X al frente
//   box  → dos vueltas por encima de la tapa y una alrededor del cajón (la tapa no abre)
//   pap  → una X sobre el gabinete y una vuelta alrededor
// Todo en el marco de la cosa (el frente es +z, el piso y = 0) y colgado de su
// grupo: la caja se lo lleva con ella. Lo arma igual cada compu (el anfitrión
// avisa 'lock'), así en línea se ve lo mismo.

// el eslabón: un óvalo con el largo en y
const LINK_R = 0.034;
const LINK_T = 0.0105;
const LINK_LONG = 1.55;
// de un eslabón al siguiente (lo de adentro del óvalo: quedan enganchados)
const PITCH = 2 * (LINK_R * LINK_LONG - LINK_T) * 0.92;
// lo que se despega la cadena de la superficie
const OFF = 0.03;

let linkGeo = null;
let paperTex = null;
const tm = new THREE.Matrix4();
const tr = new THREE.Matrix4();
const ts = new THREE.Matrix4().makeScale(1, LINK_LONG, 1);
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

// Los materiales (una vez por partida; Interactables los guarda). Todos
// estándar, como el resto del mapa: no compilan nada nuevo al aparecer.
export function lockMats(M) {
  return {
    iron: new THREE.MeshStandardMaterial({ color: 0x8a8e96, metalness: 0.7, roughness: 0.34 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9a9ea6, metalness: 1, roughness: 0.28 }),
    brass: M.brass,
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.6 }),
    paper: new THREE.MeshStandardMaterial({ map: precintoTex(), roughness: 0.95 }),
    wax: new THREE.MeshStandardMaterial({ color: 0x861010, roughness: 0.32, metalness: 0.05 }),
  };
}

// El precinto: papel viejo con el sello rojo.
function precintoTex() {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e4d8b4';
  ctx.fillRect(0, 0, 512, 96);
  // manchas y bordes gastados
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${120 + Math.random() * 40},${90 + Math.random() * 30},40,${0.04 + Math.random() * 0.06})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 96, 4 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,20,16,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 76);
  ctx.fillStyle = 'rgba(150,18,14,0.92)';
  ctx.font = 'bold 58px "Stardos Stencil", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CLAUSURADO', 256, 52);
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

// Eslabones a lo largo de un camino (puntos en el marco de la cosa; closed:
// vuelve al primero). Junta las matrices en `out`.
function along(pts, closed, out) {
  const P = closed ? [...pts, pts[0]] : pts;
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    vy.subVectors(b, a);
    const len = vy.length();
    if (len < 1e-4) continue;
    vy.divideScalar(len);
    vx.crossVectors(vy, Math.abs(vy.y) > 0.9 ? SIDE : UP).normalize();
    vz.crossVectors(vx, vy);
    let s = carry;
    for (; s < len; s += PITCH) {
      const turn = out.length % 2 ? Math.PI / 2 : 0;
      tm.makeBasis(vx, vy, vz).multiply(tr.makeRotationY(turn)).multiply(ts);
      tm.setPosition(a.x + vy.x * s, a.y + vy.y * s, a.z + vy.z * s);
      out.push(tm.clone());
    }
    // (lo que sobró del paso sigue en el tramo siguiente)
    carry = s - len;
  }
}

// Una cadena colgando entre dos puntos (con panza).
function sag(a, b, k = 0.05, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * k, 0)));
  }
  return pts;
}

// Una vuelta horizontal alrededor de una caja (medio ancho hx, medio fondo hz).
function band(y, hx, hz) {
  return [new THREE.Vector3(-hx, y, hz), new THREE.Vector3(hx, y, hz), new THREE.Vector3(hx, y, -hz), new THREE.Vector3(-hx, y, -hz)];
}

// Una vuelta vertical (de adelante para atrás, por arriba y por abajo) en x.
function loopX(x, y0, y1, hz) {
  return [new THREE.Vector3(x, y0, hz), new THREE.Vector3(x, y1, hz), new THREE.Vector3(x, y1, -hz), new THREE.Vector3(x, y0, -hz)];
}

function chainMesh(mats, L) {
  linkGeo ||= new THREE.TorusGeometry(LINK_R, LINK_T, 5, 10);
  const list = L.map((m) => linkGeo.clone().applyMatrix4(m));
  const geo = mergeGeometries(list);
  list.forEach((x) => x.dispose());
  const mesh = new THREE.Mesh(geo, mats.iron);
  mesh.userData.ownGeo = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// El candado (colgando de su origen: el arco arriba, el cuerpo abajo).
function padlock(mats, k = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rboxGeo(0.15, 0.13, 0.055, 0.018), mats.brass);
  body.position.y = -0.105;
  g.add(body);
  const shackle = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.011, 6, 14, Math.PI), mats.steel);
  arc.userData.ownGeo = true;
  arc.position.y = -0.04;
  shackle.add(arc);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(cylGeo(0.011, 0.011, 0.03, 6), mats.steel);
    leg.position.set(s * 0.043, -0.055, 0);
    shackle.add(leg);
  }
  g.add(shackle);
  const hole = new THREE.Mesh(cylGeo(0.012, 0.012, 0.01, 10), mats.dark);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, -0.095, 0.029);
  g.add(hole);
  const slot = new THREE.Mesh(boxGeo(0.008, 0.026, 0.01), mats.dark);
  slot.position.set(0, -0.115, 0.029);
  g.add(slot);
  g.scale.setScalar(k);
  g.userData.shackle = shackle;
  return g;
}

// El precinto pegado (w de ancho), con un lacre en cada punta.
function precinto(mats, w, h = w * 0.19) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.paper);
  p.userData.ownGeo = true;
  g.add(p);
  for (const s of [-1, 1]) {
    const wax = new THREE.Mesh(cylGeo(h * 0.42, h * 0.46, 0.012, 12), mats.wax);
    wax.rotation.x = Math.PI / 2;
    wax.position.set(s * (w / 2 - h * 0.25), 0, 0.006);
    g.add(wax);
  }
  return g;
}

// Una vuelta vertical que sigue el bulto de verdad del grupo (en x, alrededor
// de la altura cy): rayos desde afuera contra sus mallas, la envolvente de lo
// que tocan y un poco para afuera. null si no toca nada.
const ray = new THREE.Raycaster();
function wrapX(host, x, cy) {
  host.updateMatrixWorld(true);
  const meshes = [];
  host.traverse((o) => {
    if (o.isMesh && o.visible && !o.material?.transparent && !o.userData.lockPart) meshes.push(o);
  });
  if (!meshes.length) return null;
  const inv = new THREE.Matrix4().copy(host.matrixWorld).invert();
  const N = 72;
  const pts = [];
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // (en el marco de la cosa: z adelante, y arriba)
    o.set(x, cy + Math.sin(a) * 3, Math.cos(a) * 3).applyMatrix4(host.matrixWorld);
    d.set(0, -Math.sin(a), -Math.cos(a)).transformDirection(host.matrixWorld);
    ray.set(o, d);
    ray.far = 3.2;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) pts.push(hit.point.clone().applyMatrix4(inv));
  }
  if (pts.length < 8) return null;
  // la envolvente (en z, y), de a vuelta, y despegada OFF desde el centro
  const hull = convexHull(pts.map((p) => [p.z, p.y]));
  return hull.map(([z, y]) => {
    const dz = z;
    const dy = y - cy;
    const l = Math.hypot(dz, dy) || 1;
    return new THREE.Vector3(x, cy + dy + (dy / l) * OFF, dz + (dz / l) * OFF);
  });
}

// Envolvente convexa (monotone chain) de puntos [a, b].
function convexHull(P) {
  P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of P) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up = [];
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Arma la clausura de una cosa. kind: 'perk' | 'box' | 'pap'; dims: { w, d, h }
// (el bulto de la cosa en su marco). Devuelve el grupo (con userData.lock: el
// candado, para que se hamaque) o null si no es una de esas.
export function buildLock(kind, dims, mats, host = null) {
  const G = new THREE.Group();
  const L = [];
  const hx = dims.w / 2 + OFF;
  const hz = dims.d / 2 + OFF;
  const front = hz + 0.01;
  let lock = null;
  let hook = null;
  if (kind === 'perk') {
    const H = dims.h;
    along(band(H * 0.33, hx, hz), true, L);
    along(band(H * 0.72, hx, hz), true, L);
    hook = new THREE.Vector3(0, H * 0.53, front + 0.012);
    along(sag(new THREE.Vector3(-hx, H * 0.9, front), hook, 0.03, 8), false, L);
    along(sag(hook, new THREE.Vector3(hx, H * 0.16, front), 0.03, 8), false, L);
    along(sag(new THREE.Vector3(hx, H * 0.9, front), hook, 0.03, 8), false, L);
    along(sag(hook, new THREE.Vector3(-hx, H * 0.16, front), 0.03, 8), false, L);
    lock = padlock(mats, 1.25);
    const pr = precinto(mats, dims.w * 0.9);
    pr.position.set(0, H * 0.86, front - 0.006);
    pr.rotation.z = -0.07;
    G.add(pr);
  } else if (kind === 'box') {
    const top = dims.h + 0.012;
    // (por encima de la tapa como sea: plana, redonda o con herrajes; sin el grupo, un rectángulo)
    for (const x of [-dims.w * 0.3, dims.w * 0.3]) along((host && wrapX(host, x, dims.h * 0.5)) || loopX(x, 0.012, top, hz), true, L);
    const y = dims.h * 0.4;
    along(band(y, hx, hz), true, L);
    hook = new THREE.Vector3(0, y, front + 0.008);
    lock = padlock(mats, 1);
    // cruzado sobre la junta de la tapa, al costado del candado
    const pr = precinto(mats, 0.42);
    pr.position.set(-dims.w * 0.15, dims.h * 0.78, hz - 0.012);
    pr.rotation.z = 0.32;
    G.add(pr);
  } else if (kind === 'pap') {
    const H = dims.h;
    hook = new THREE.Vector3(0, H * 0.52, front + 0.012);
    along(band(H * 0.52, hx, hz), true, L);
    along(sag(new THREE.Vector3(-hx, H * 0.95, front), hook, 0.03, 8), false, L);
    along(sag(hook, new THREE.Vector3(hx, H * 0.08, front), 0.03, 8), false, L);
    along(sag(new THREE.Vector3(hx, H * 0.95, front), hook, 0.03, 8), false, L);
    along(sag(hook, new THREE.Vector3(-hx, H * 0.08, front), 0.03, 8), false, L);
    lock = padlock(mats, 1.35);
    const pr = precinto(mats, dims.w * 0.55);
    pr.position.set(dims.w * 0.2, H * 0.84, front - 0.006);
    pr.rotation.z = 0.06;
    G.add(pr);
  } else return null;
  G.add(chainMesh(mats, L));
  lock.position.copy(hook);
  G.add(lock);
  G.userData.lock = lock;
  return G;
}

// Saca la clausura y suelta lo que es solo de ella (las piezas de props quedan: son compartidas).
export function disposeLock(G) {
  G.removeFromParent();
  G.traverse((o) => {
    if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
  });
}
