import * as THREE from 'three';
import { mesh, boxGeo } from '../../world/props';
import { pavaProp } from '../../weapons/Liquidificador';

// Cosas que usan todas las partes de "El Pacto" (el easter egg del estero):
// materiales propios, el brillo de lo que se puede agarrar y los modelitos.

const mats = new Map();
export function mat(key, make) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key);
}

const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  iron: () => mat('iron', () => std({ color: 0x3a3a38, metalness: 0.7, roughness: 0.45 })),
  rust: () => mat('rust', () => std({ color: 0x5a3a26, metalness: 0.4, roughness: 0.7 })),
  wood: () => mat('wood', () => std({ color: 0x4a3222, roughness: 0.85 })),
  leather: () => mat('leather', () => std({ color: 0x4a1e14, roughness: 0.7 })),
  paper: () => mat('paper', () => std({ color: 0xd8ccaa, roughness: 0.95 })),
  ribbon: () => mat('ribbon', () => std({ color: 0xa81810, roughness: 0.6 })),
  feather: () => mat('feather', () => std({ color: 0x8a7a64, roughness: 0.9, side: THREE.DoubleSide })),
  bird: () => mat('bird', () => std({ color: 0x6a5e4c, roughness: 0.95, flatShading: true })),
  // (el urutaú del paso, que se tiene que poder ver de noche: más claro, con
  // un poco de luz propia, como la corteza seca a la luz de la luna)
  birdSee: () => mat('birdSee', () => std({ color: 0x9a8a70, roughness: 0.9, flatShading: true, emissive: 0x2a241a, emissiveIntensity: 1 })),
  eye: () => mat('eye', () => new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false })),
  soot: () => mat('soot', () => std({ color: 0x1a1816, metalness: 0.5, roughness: 0.55 })),
};

// El brillito de algo que se agarra (un punto que late).
export function glint(g, color = 0xfff0c0, size = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
  s.scale.setScalar(size);
  s.renderOrder = 3;
  return s;
}

export function pulse(s, t, base = 0.55, amp = 0.35, speed = 3) {
  s.material.opacity = base + Math.sin(t * speed) * amp;
}

// La llave (de hierro, con argolla).
export function keyModel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12), MAT.iron(), 0, 0, 0));
  g.add(mesh(boxGeo(0.018, 0.018, 0.2), MAT.iron(), 0, 0, 0.14));
  g.add(mesh(boxGeo(0.018, 0.05, 0.03), MAT.iron(), 0, -0.03, 0.22));
  g.add(mesh(boxGeo(0.018, 0.035, 0.02), MAT.iron(), 0, -0.025, 0.18));
  return g;
}

// El códice de los padres: tapas de cuero, cantos de papel y una cinta.
export function bookModel() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(0.3, 0.075, 0.38), MAT.leather(), 0, 0.0375, 0));
  g.add(mesh(boxGeo(0.28, 0.055, 0.365), MAT.paper(), 0.012, 0.0375, 0));
  g.add(mesh(boxGeo(0.02, 0.004, 0.2), MAT.ribbon(), 0.05, 0.078, 0.2));
  return g;
}

// Los papeles del coronel: un fajo atado con una cinta colorada.
export function papersModel() {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) g.add(mesh(boxGeo(0.22, 0.012, 0.3), MAT.paper(), (k % 2) * 0.01, 0.006 + k * 0.012, k * 0.006, 0, k * 0.06, 0));
  g.add(mesh(boxGeo(0.235, 0.054, 0.02), MAT.ribbon(), 0, 0.027, 0));
  return g;
}

// Una pluma gris del urutaú.
export function featherModel() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.05, 0.12, 0, 0.3);
  s.quadraticCurveTo(-0.045, 0.12, 0, 0);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 6), MAT.feather());
  g.add(m);
  g.add(mesh(boxGeo(0.004, 0.3, 0.004), MAT.paper(), 0, 0.15, 0.001));
  return g;
}

// La pava negra del fondo de la laguna (lo que va a ser el Liquidificador):
// la misma de la mano, de tamaño real (weapons/Liquidificador.js). hot: la del
// altar, ya embrujada (la luz verde se escapa por las rajaduras).
export function pavaModel(hot = false) {
  return pavaProp(hot);
}

// Nombre corto del lugar de un punto (para los carteles).
export function floorAt(g, x, z, y) {
  return g.world.floorAt(x, z, y);
}

// (anfitrión) ¿Hay lugar para un jefe? Hay uno solo a la vez: si el que está
// ya cayó (el cuerpo tarda en irse), se lo saca; si anda vivo, no hay lugar.
export function freeBoss(g) {
  const b = g.zombies.boss;
  if (!b) return true;
  if (!b.dead) return false;
  g.zombies.removeBoss();
  return true;
}
