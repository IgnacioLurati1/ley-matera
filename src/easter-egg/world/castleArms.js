import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';

// La defensa del adarve: cañones de bronce en su cureña, pilas de balas y la
// campana de alarma. Mismo formato que world/props.js: cada constructor
// devuelve { obj, boxes } con cajas locales (antes de rotar). Lo que va contra
// el parapeto mira hacia -z (el cañón apunta para afuera por la tronera).

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
const lathe = (pts, mat, seg = 20) => {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
// el bronce viejo (verdoso en lo hondo), uno solo por mapa
const bronze = (M) => (M.castleBronze ||= new THREE.MeshStandardMaterial({ color: 0x6a5634, roughness: 0.42, metalness: 0.85 }));

export const ARMS = {
  // Cañón de bronce en su cureña de madera con cuatro ruedas macizas.
  canon(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const iron = M.iron;
    // la cureña: dos gualderas escalonadas, el travesaño y los ejes
    for (const s of [-1, 1]) {
      B(g, 0.1, 0.42, 1.3, wood, s * 0.26, 0.5, 0.1);
      B(g, 0.1, 0.2, 0.5, wood, s * 0.26, 0.81, -0.2);
      B(g, 0.11, 0.03, 1.1, M.snowCap || M.snow, s * 0.26, 0.725, 0.2);
      // el herraje del muñón
      B(g, 0.12, 0.05, 0.2, iron, s * 0.26, 0.93, -0.2);
    }
    B(g, 0.44, 0.14, 0.14, wood, 0, 0.42, 0.62);
    B(g, 0.44, 0.1, 0.5, wood, 0, 0.36, -0.2);
    for (const z of [-0.36, 0.5]) {
      C(g, 0.045, 0.045, 0.96, iron, 0, 0.22, z, 0, 0, Math.PI / 2, 8);
      for (const s of [-1, 1]) {
        C(g, 0.22, 0.22, 0.1, wood, s * 0.42, 0.22, z, 0, 0, Math.PI / 2, 14);
        C(g, 0.225, 0.225, 0.06, iron, s * 0.42, 0.22, z, 0, 0, Math.PI / 2, 14);
        C(g, 0.06, 0.06, 0.12, iron, s * 0.46, 0.22, z, 0, 0, Math.PI / 2, 8);
      }
    }
    // el caño: de la culata (con su botón) a la boca, con los refuerzos
    const barrel = lathe(
      [
        [0, -0.2], [0.04, -0.2], [0.05, -0.16], [0.03, -0.12], [0.03, -0.07], [0.15, -0.05], [0.19, 0], [0.19, 0.09], [0.172, 0.11],
        [0.168, 0.66], [0.186, 0.68], [0.186, 0.76], [0.158, 0.78], [0.148, 1.44], [0.162, 1.46], [0.162, 1.52], [0.138, 1.54],
        [0.128, 1.72], [0.158, 1.78], [0.158, 1.9], [0.085, 1.9], [0.085, 1.7],
      ],
      bronze(M),
    );
    barrel.rotation.x = -Math.PI / 2 + 0.07;
    barrel.position.set(0, 0.93, 0.55);
    g.add(barrel);
    // los muñones y la boca negra
    C(g, 0.05, 0.05, 0.62, bronze(M), 0, 0.93, -0.2, 0, 0, Math.PI / 2, 10);
    const muzzle = C(g, 0.085, 0.085, 0.02, M.black, 0, 0.93 + Math.sin(0.07) * 1.88, 0.55 - Math.cos(0.07) * 1.89, Math.PI / 2 + 0.07, 0, 0, 12);
    muzzle.castShadow = false;
    // un poco de nieve arriba del caño
    const cap = mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.snowCap || M.snow, 0, 1.1, -0.05, 0.07, 0, 0);
    cap.scale.set(0.7, 0.45, 2.6);
    g.add(cap);
    return { obj: g, boxes: [[-0.52, 0, -1.4, 0.52, 1.0, 0.75]] };
  },

  // Pila de balas de hierro (tres pisos) en su marco de madera.
  balas(M) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.1, 10, 8);
    const put = (x, y, z) => g.add(mesh(geo, M.iron, x, y, z));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) put((i - 1) * 0.2, 0.1, (j - 1) * 0.2);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put((i - 0.5) * 0.2, 0.241, (j - 0.5) * 0.2);
    put(0, 0.383, 0);
    const wood = M.woodDark || M.wood;
    for (const s of [-1, 1]) {
      B(g, 0.72, 0.08, 0.06, wood, 0, 0.04, s * 0.33);
      B(g, 0.06, 0.08, 0.72, wood, s * 0.33, 0.04, 0);
    }
    const snow = mesh(new THREE.SphereGeometry(0.105, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), M.snowCap || M.snow, 0, 0.39, 0);
    snow.scale.y = 0.55;
    g.add(snow);
    return { obj: g, boxes: [[-0.36, 0, -0.36, 0.36, 0.48, 0.36]] };
  },

  // La campana de alarma: dos postes, el yugo con su techito y la cuerda.
  campanaAlarma(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    for (const s of [-1, 1]) {
      B(g, 0.13, 2.35, 0.13, wood, s * 0.52, 1.175, 0);
      B(g, 0.3, 0.12, 0.3, M.castleStone || M.stone, s * 0.52, 0.06, 0);
      // los tornapuntas
      B(g, 0.08, 0.5, 0.08, wood, s * 0.38, 2.05, 0, 0, 0, s * 0.75);
    }
    B(g, 1.3, 0.14, 0.16, wood, 0, 2.28, 0);
    // el techito de dos aguas (pizarra con nieve)
    for (const s of [-1, 1]) {
      B(g, 1.5, 0.05, 0.42, M.slate || wood, 0, 2.5, s * 0.17, s * 0.55, 0, 0);
      B(g, 1.5, 0.03, 0.4, M.snowCap || M.snow, 0, 2.53, s * 0.175, s * 0.55, 0, 0);
    }
    const bell = lathe([[0, 0.5], [0.08, 0.5], [0.13, 0.46], [0.16, 0.36], [0.18, 0.2], [0.21, 0.07], [0.26, 0.0], [0.255, -0.02], [0.2, 0.0]], bronze(M), 18);
    bell.position.set(0, 1.7, 0);
    g.add(bell);
    B(g, 0.08, 0.1, 0.08, M.iron, 0, 2.18, 0);
    C(g, 0.035, 0.035, 0.2, M.iron, 0, 1.64, 0, 0, 0, 0, 8);
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M.iron, 0, 1.53, 0));
    // la cuerda que cuelga del badajo
    C(g, 0.012, 0.012, 0.65, M.rope || wood, 0.02, 1.2, 0.02, 0, 0, 0.04, 6);
    return { obj: g, boxes: [[-0.62, 0, -0.18, 0.62, 2.6, 0.18]] };
  },
};
