import * as THREE from 'three';
import { headProp, FACE_EYES } from './gauchoSkin';

// Lo que distingue al Gauchito Gil bueno (el de Mate no Numa: el gaucho de
// siempre con el poncho colorado) de cualquier otro gaucho de poncho colorado:
// la vincha colorada en la frente, anudada atrás, con las dos puntas largas
// colgando sobre la nuca. Jugando solo, el gaucho del jugador también es
// colorado: en la escena del Monumento eran mellizos.
//
// Se arma en el espacio de la malla de la cabeza (centímetros, +z adelante,
// +y arriba: como FACE de net/gauchoSkin) y queda colgada del hueso de la
// cabeza (headProp), igual que los anteojos del Canchero.

// la frente: entre las cejas (ojos en y 172.4) y el ala del sombrero (y 180).
// La cabeza de la malla a esa altura va de x -15.5 a 14.6 y de z -10.9 a 16.5
// (medida: scratchpad eclipse/t_head.mjs); el aro la rodea con un centímetro de aire.
const BAND_Y = FACE_EYES.y + 4.2;
const HEAD_X = -0.4;
const HEAD_Z = 2.9;
const HEAD_RX = 15.9;
const HEAD_RZ = 14.9;

let MATS = null;

export function buildVincha() {
  MATS ||= {
    band: new THREE.MeshStandardMaterial({ color: 0xd8141c, roughness: 0.85, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x8e0c12, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  };
  const root = new THREE.Group();
  // la banda: un aro chato alrededor de la cabeza
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 24, 1, true), MATS.band);
  ring.material.side = THREE.DoubleSide;
  ring.scale.set(HEAD_RX, 1, HEAD_RZ);
  ring.position.set(HEAD_X, BAND_Y, HEAD_Z);
  root.add(ring);
  // el nudo, en la nuca
  const knot = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 2.6), MATS.dark);
  // (el pelo de la malla llega a z -14 en la nuca: el nudo y las puntas van afuera de él)
  knot.position.set(HEAD_X, BAND_Y - 0.8, HEAD_Z - HEAD_RZ - 3.0);
  root.add(knot);
  // las dos puntas: largas, abiertas, cayendo sobre la nuca y la espalda
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 24, 0.6), sx < 0 ? MATS.band : MATS.dark);
    tail.geometry.translate(0, -12, 0);
    tail.position.set(HEAD_X + sx * 1.6, BAND_Y - 1.6, HEAD_Z - HEAD_RZ - 3.6);
    // (giradas para que las puntas caigan hacia atrás, lejos del pelo)
    tail.rotation.set(0.2, 0, sx * 0.26);
    root.add(tail);
  }
  return root;
}

// Se la pone al muñeco `a` (net/Avatars) cuando su modelo ya cargó; devuelve
// el objeto (o null si todavía no se puede: se vuelve a llamar).
export function gilVincha(a) {
  if (!a || a.vincha) return a?.vincha || null;
  if (!a.gs?.on) return null;
  a.vincha = headProp(a, buildVincha());
  return a.vincha;
}
