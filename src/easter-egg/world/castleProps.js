import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, addBuilders } from './props';
import { flame, emberMat } from './castleFire';
import { DECOR } from './castleDecor';
import { NATURE } from './castleNature';
import { ROOMS } from './castleRooms';
import { ARMS } from './castleArms';

export { flameMaterial, flame } from './castleFire';

// Utilería del castillo del Mateendrache. Mismo formato que world/props.js:
// cada constructor devuelve { obj, boxes } con cajas locales (antes de rotar).
// Lo que va contra una pared mira hacia +z (la pared queda detrás, en z < 0).

const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

const BUILDERS = {
  // Brasero de hierro sobre tres patas, con brasas y llama.
  brasero(M) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      C(g, 0.025, 0.03, 0.95, M.iron, Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22, Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28, 6);
    }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.3, 0.04], [0.42, 0.2], [0.44, 0.24]].map(([r, y]) => new THREE.Vector2(r, y)), 18), M.iron);
    bowl.position.y = 0.86;
    bowl.castShadow = true;
    g.add(bowl);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = 0.1 + (k % 3) * 0.1;
      g.add(mesh(new THREE.DodecahedronGeometry(0.08, 0), emberMat(), Math.cos(a) * r, 1.05, Math.sin(a) * r, k, k * 2, 0));
    }
    flame(g, 0, 1.05, 0, 0.75, 1.1);
    return { obj: g, boxes: [[-0.4, 0, -0.4, 0.4, 1.1, 0.4]] };
  },

  // Antorcha de pared: la agarradera de hierro y el palo con la llama.
  antorcha(M) {
    const g = new THREE.Group();
    B(g, 0.08, 0.3, 0.05, M.iron, 0, 1.9, 0.03);
    C(g, 0.015, 0.015, 0.22, M.iron, 0, 1.95, 0.13, Math.PI / 2, 0, 0, 6);
    C(g, 0.03, 0.022, 0.55, M.woodDark || M.wood, 0, 2.02, 0.2, -0.35, 0, 0, 7);
    C(g, 0.045, 0.035, 0.1, M.black, 0, 2.28, 0.29, -0.35, 0, 0, 8);
    flame(g, 0, 2.3, 0.3, 0.32, 0.55);
    return { obj: g, boxes: [] };
  },

  // La chimenea del gran salón: hogar de piedra, jambas, repisa y la campana
  // que sube hasta el techo. El fuego lo pone FIRES (y la luz, LIGHTS).
  chimenea(M, o) {
    const g = new THREE.Group();
    const top = o.top || 10;
    const st = M.castleStone || M.stone;
    B(g, 3.6, 0.35, 1.3, st, 0, 0.17, 0.55);
    for (const s of [-1, 1]) B(g, 0.55, 2.1, 1.2, st, s * 1.5, 1.2, 0.5);
    B(g, 3.9, 0.3, 1.45, st, 0, 2.35, 0.55);
    B(g, 4.1, 0.12, 1.6, M.woodDark || M.wood, 0, 2.55, 0.6);
    // la campana: se angosta hasta el techo
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.9, top - 2.6, 4, 1, true), st);
    hood.rotation.y = Math.PI / 4;
    hood.scale.set(1, 1, 0.55);
    hood.position.set(0, 2.6 + (top - 2.6) / 2, 0.45);
    hood.castShadow = true;
    g.add(hood);
    // los leños y las brasas
    for (let k = 0; k < 4; k++) C(g, 0.1, 0.12, 1.4, M.log || M.wood, -0.3 + k * 0.2, 0.46, 0.55 + (k % 2) * 0.15, Math.PI / 2, 0.3 - k * 0.2, Math.PI / 2, 8);
    for (let k = 0; k < 10; k++) g.add(mesh(new THREE.DodecahedronGeometry(0.1, 0), emberMat(), -0.8 + k * 0.18, 0.4, 0.4 + (k % 3) * 0.12, k, k, 0));
    flame(g, -0.35, 0.4, 0.55, 1.2, 1.6);
    flame(g, 0.4, 0.4, 0.5, 1.0, 1.3);
    return { obj: g, boxes: [[-1.8, 0, 0, 1.8, 2.5, 1.2]] };
  },
};

let registered = false;
export function registerCastleProps() {
  if (registered) return;
  registered = true;
  addBuilders(BUILDERS);
  addBuilders(DECOR);
  addBuilders(NATURE);
  addBuilders(ROOMS);
  addBuilders(ARMS);
}
