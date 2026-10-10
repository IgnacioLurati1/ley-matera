import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Lo que le faltaba a La Disformidad (sesión 1f, 2026-10-06). El usuario pidió
// una dimensión "violeta y negra, todo muy oscuro"; al revisarla quedaba como
// un piso negro con rayitas violetas. Encima de lo de abismo.js:
//  1. los pedazos de los siete mapas, que flotan y giran en la oscuridad a los
//     costados del camino: la cabeza del molino con sus aspas, una pared del
//     establo de La Tapera, una reja del penal, una columna partida de la torre,
//     un tramo de almena del castillo, una columna del Monumento con un jirón de
//     bandera y la cruz con la cinta colorada del estero;
//  2. los que esperan: gauchos enormes de sombra, parados en la niebla lejos del
//     camino, con dos brasas por ojos, que giran la cabeza siguiendo al que pasa
//     (el libro: "el lugar donde están todos los que esperan"; las brasas son las
//     del final);
//  3. el polvo que sube: lo pone world/eclipseMood con la dimensión (A.abyss).
// Una malla por pedazo (color por vértice) y una por figura; sin luces.
// globalThis.__mduNoAbismoVida: sin esto.

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

// una pieza con su color, ya puesta (pos, giro, escala)
function part(geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  g.applyMatrix4(tmpM.compose(tmpV.set(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz)));
  const c = new THREE.Color(col);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s);

// ---------------- los pedazos de los mapas ----------------
export const PIECES = {
  // el molino: la cabeza con el cubo y cuatro aspas de madera
  molino() {
    const L = [part(cyl(0.35, 0.35, 0.8, 10), 0x3a2a1c, 0, 0, 0, Math.PI / 2), part(box(1.2, 1.0, 1.6), 0x2a1e16, 0, 0, -0.9)];
    for (let k = 0; k < 4; k++) L.push(part(box(0.5, 3.4, 0.06), 0x4a3624, 0, 0, 0.45, 0, 0, (k * Math.PI) / 2 + 0.3, 1, 1, 1));
    // (las aspas salen del centro: corridas medio largo)
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + 0.3;
      L[2 + k] = part(box(0.5, 3.4, 0.06), 0x4a3624, -Math.sin(a) * 1.7, Math.cos(a) * 1.7, 0.45, 0, 0, a);
    }
    return L;
  },
  // La Tapera: un pedazo de pared de establo colorado con su frontón
  tapera() {
    const L = [part(box(3.6, 2.4, 0.18), 0x5a1a14)];
    const sh = new THREE.Shape([new THREE.Vector2(-1.8, 0), new THREE.Vector2(1.8, 0), new THREE.Vector2(0, 1.3)]);
    L.push(part(new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: false }), 0x5a1a14, 0, 1.2, -0.09));
    for (const x of [-1.2, 0, 1.2]) L.push(part(box(0.08, 2.4, 0.22), 0xd8d0c0, x, 0, 0));
    return L;
  },
  // el penal: un marco de reja con barrotes, uno doblado
  penal() {
    const L = [part(box(2.6, 0.14, 0.14), 0x2a2c30, 0, 1.4), part(box(2.6, 0.14, 0.14), 0x2a2c30, 0, -1.4)];
    for (let k = 0; k < 7; k++) L.push(part(cyl(0.035, 0.035, 2.8, 6), 0x3a3c42, -1.2 + k * 0.4, 0, 0, 0, 0, k === 4 ? 0.35 : 0));
    return L;
  },
  // la torre: una columna partida con su capitel y un pedazo de piso
  torre() {
    return [part(cyl(0.42, 0.48, 3.4, 12), 0x8a7a52, 0, 0, 0, 0.12), part(box(1.3, 0.3, 1.3), 0x9a8a5a, 0, 1.8, 0), part(box(2.6, 0.25, 2.0), 0x6a5a3a, 0.6, -1.9, 0.2, 0.2, 0.3, 0.1)];
  },
  // el castillo: un tramo de muralla con almenas
  castillo() {
    const L = [part(box(3.4, 1.6, 0.9), 0x4a4e58)];
    for (const x of [-1.3, 0, 1.3]) L.push(part(box(0.7, 0.7, 0.9), 0x4a4e58, x, 1.15, 0));
    L.push(part(box(3.6, 0.12, 1.0), 0xc8d4e0, 0, 0.82, 0));
    return L;
  },
  // el Monumento: una columna clara con un jirón de bandera celeste y blanca
  monumento() {
    return [part(cyl(0.38, 0.38, 3.8, 16), 0xb8b2a6), part(box(0.95, 0.25, 0.95), 0xa8a296, 0, 2.0), part(box(1.6, 0.34, 0.02), 0x6aa8d8, 0.85, 1.4, 0, 0, 0, -0.1), part(box(1.6, 0.34, 0.02), 0xe8e8e8, 0.85, 1.06, 0, 0, 0, -0.1), part(box(1.6, 0.34, 0.02), 0x6aa8d8, 0.85, 0.72, 0, 0, 0, -0.1)];
  },
  // el estero: la cruz del Gauchito con su cinta colorada
  centro() {
    return [part(box(0.18, 2.6, 0.12), 0x2a1a10), part(box(1.3, 0.16, 0.12), 0x2a1a10, 0, 0.65), part(box(0.5, 0.7, 0.04), 0xb01c14, 0.3, 0.3, 0.08, 0, 0, 0.25), part(box(0.12, 0.6, 0.03), 0xb01c14, -0.1, 0.2, 0.08, 0, 0, -0.2)];
  },
};

// ---------------- los que esperan ----------------
function waiterGeo() {
  // un gaucho de pie con el poncho largo y el sombrero (de sombra: no se ve la cara)
  return mergeGeometries([
    part(cyl(0.18, 0.22, 1.0, 8), 0x000000, -0.16, 0.5, 0),
    part(cyl(0.18, 0.22, 1.0, 8), 0x000000, 0.16, 0.5, 0),
    part(cyl(0.32, 0.78, 1.45, 10), 0x000000, 0, 1.5, 0),
    part(cyl(0.16, 0.18, 0.25, 8), 0x000000, 0, 2.3, 0),
  ]);
}
function headGeo() {
  return mergeGeometries([part(new THREE.SphereGeometry(0.2, 10, 8), 0x000000, 0, 0.05, 0), part(cyl(0.44, 0.44, 0.04, 16), 0x000000, 0, 0.17, 0), part(cyl(0.17, 0.2, 0.2, 12), 0x000000, 0, 0.27, 0)]);
}

export function buildAbismoVida(w, isl, cells, rnd) {
  if (globalThis.__mduNoAbismoVida === true) return null;
  const g = w.g;
  const { isFloor } = cells;
  const [bx0, bz0, bx1, bz1] = cells.box;
  const root = new THREE.Group();
  root.name = 'eclipseAbismoVida';
  // la distancia al piso más cercano (en una ronda de rayos)
  const dist = (x, z) => {
    let d = Infinity;
    for (let s = 0; s < 32; s++) {
      const a = (s / 32) * Math.PI * 2;
      for (const r of [2, 5, 9, 14, 20, 27, 35, 44]) {
        if (r >= d) break;
        if (isFloor(Math.floor(x + Math.cos(a) * r), Math.floor(z + Math.sin(a) * r))) {
          d = r;
          break;
        }
      }
    }
    return d;
  };
  const spot = (dMin, dMax, pad, taken) => {
    for (let k = 0; k < 400; k++) {
      const x = bx0 - pad + rnd() * (bx1 - bx0 + pad * 2);
      const z = bz0 - pad + rnd() * (bz1 - bz0 + pad * 2);
      if (isFloor(Math.floor(x), Math.floor(z))) continue;
      const d = dist(x, z);
      if (d < dMin || d > dMax) continue;
      if (taken.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 12)) continue;
      taken.push([x, z]);
      return [x, z];
    }
    return null;
  };

  // 1. los pedazos
  const ruinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, emissive: 0x24104a, emissiveIntensity: 0.35 });
  const ruins = [];
  const taken = [];
  for (const [id, fn] of Object.entries(PIECES)) {
    const at = spot(7, 20, 16, taken);
    if (!at) continue;
    const geo = mergeGeometries(fn());
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, ruinMat);
    m.name = `abismo-ruina-${id}`;
    const s = 1.3 + rnd() * 0.6;
    m.scale.setScalar(s);
    m.position.set(at[0], isl.y + 1 + rnd() * 9, at[1]);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 0.9);
    m.castShadow = false;
    m.matrixAutoUpdate = true;
    root.add(m);
    ruins.push({ m, y: m.position.y, rx: m.rotation.x, rz: m.rotation.z, sp: (rnd() - 0.5) * 0.12, bob: rnd() * 6.28, spin: id === 'molino' ? 0.25 : 0 });
  }

  // 2. los que esperan
  // (sin niebla: recortados negros contra el violeta; con niebla se perdían)
  const shadow = new THREE.MeshBasicMaterial({ color: 0x020104, fog: false });
  const bodyG = waiterGeo();
  const headG = headGeo();
  const eyeTex = g?.textures?.dot;
  const waiters = [];
  const wt = [];
  for (let k = 0; k < 8; k++) {
    const at = spot(24, 42, 40, wt);
    if (!at) continue;
    const s = 5 + rnd() * 3;
    const grp = new THREE.Group();
    grp.position.set(at[0], isl.y - 4 - rnd() * 3, at[1]);
    grp.scale.setScalar(s);
    const body = new THREE.Mesh(bodyG, shadow);
    const head = new THREE.Group();
    head.position.y = 2.55;
    head.add(new THREE.Mesh(headG, shadow));
    for (const sx of [-0.07, 0.07]) {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: 0xff4a12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
      e.position.set(sx, 0.06, 0.19);
      e.scale.setScalar(0.09);
      head.add(e);
    }
    grp.add(body, head);
    // (de cara al camino: mirando al medio de la isla)
    grp.rotation.y = Math.atan2((bx0 + bx1) / 2 - at[0], (bz0 + bz1) / 2 - at[1]);
    root.add(grp);
    waiters.push({ grp, head, ph: rnd() * 6.28 });
  }
  w.root.add(root);
  (w.warmHidden ||= []).push(root);

  const cam = new THREE.Vector3();
  return {
    root,
    update(dt, t, here) {
      root.visible = here;
      if (!here) return;
      for (const R of ruins) {
        R.m.position.y = R.y + Math.sin(t * 0.35 + R.bob) * 0.8;
        R.m.rotation.y += R.sp * dt;
        R.m.rotation.x = R.rx + Math.sin(t * 0.21 + R.bob) * 0.08;
        R.m.rotation.z = R.rz + Math.sin(t * 0.17 + R.bob) * 0.06 + R.spin * t;
      }
      const c = g?.camera;
      if (!c) return;
      c.getWorldPosition(cam);
      for (const W of waiters) {
        // la cabeza sigue al que pasa, despacio y con un límite
        const gp = W.grp.position;
        const want = Math.atan2(cam.x - gp.x, cam.z - gp.z) - W.grp.rotation.y;
        const wa = Math.atan2(Math.sin(want), Math.cos(want));
        const lim = Math.max(-1.1, Math.min(1.1, wa));
        W.head.rotation.y += (lim - W.head.rotation.y) * Math.min(1, dt * 0.8);
        // (respiran: se mecen apenas)
        W.grp.rotation.z = Math.sin(t * 0.3 + W.ph) * 0.015;
      }
    },
  };
}
