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

// mats: los materiales de otra (las bandanas de los compañeros, crewBandana);
// tailLen: el largo de las puntas (cm; las del Gil, 24).
export function buildVincha(mats = null, tailLen = 24) {
  MATS ||= {
    band: new THREE.MeshStandardMaterial({ color: 0xd8141c, roughness: 0.85, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x8e0c12, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  };
  const own = mats || MATS;
  const root = new THREE.Group();
  // la banda: un aro chato alrededor de la cabeza
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 24, 1, true), own.band);
  ring.material.side = THREE.DoubleSide;
  ring.scale.set(HEAD_RX, 1, HEAD_RZ);
  ring.position.set(HEAD_X, BAND_Y, HEAD_Z);
  root.add(ring);
  // el nudo, en la nuca
  const knot = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 2.6), own.dark);
  // (el pelo de la malla llega a z -14 en la nuca: el nudo y las puntas van afuera de él)
  knot.position.set(HEAD_X, BAND_Y - 0.8, HEAD_Z - HEAD_RZ - 3.0);
  root.add(knot);
  // las dos puntas: largas, abiertas, cayendo sobre la nuca y la espalda
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.8, tailLen, 0.6), sx < 0 ? own.band : own.dark);
    tail.geometry.translate(0, -tailLen / 2, 0);
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
  // (si el modelo todavía no cargó, queda pedida: net/Avatars.update la pone)
  a.wantVincha = true;
  if (!a.gs?.on) return null;
  // (si le había tocado la bandana de los compañeros, se la saca)
  if (a.bandana) {
    a.bandana.removeFromParent();
    a.bandana = null;
  }
  a.vincha = headProp(a, buildVincha());
  return a.vincha;
}

// Las bandanas de los compañeros del Gil (2026-10-10, el usuario: "añadí
// bandanas a los personajes de mate no numa y los de eclipse (o sea los
// compañeros del gil; los que no tienen nombre que juegan los otros mapas
// dejalos como están)"). La misma vincha, del color del poncho de cada uno y
// con las puntas más cortas: la colorada de puntas largas sigue siendo solo la
// del Gil (lo que lo distingue). La pone net/Avatars.update en los juegos de
// muñecos que la piden (`bandanas`), solo en esos dos mapas.
// globalThis.__mduNoBandanas: sin ellas.
export const BANDANA_MAPS = new Set(['esteros', 'eclipse']);
const darker = new THREE.Color();
export function crewBandana(a) {
  if (!a || a.bandana || a.vincha || a.wantVincha || a.noBandana) return a?.bandana || null;
  if (!a.gs?.on || !a.M?.poncho) return null;
  const mats = {
    band: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  };
  a.bandana = headProp(a, buildVincha(mats, 13));
  if (!a.bandana) return null;
  a.bandana.userData.mats = mats;
  a.bandana.userData.hex = -1;
  bandanaColor(a);
  return a.bandana;
}
// (el poncho puede cambiar de color —los papeles de Eclipse, net/Avatars restyle—: la bandana lo sigue)
export function bandanaColor(a) {
  const B = a?.bandana;
  const c = a?.M?.poncho?.color;
  if (!B || !c) return;
  const hex = c.getHex();
  if (hex === B.userData.hex) return;
  B.userData.hex = hex;
  B.userData.mats.band.color.copy(c);
  B.userData.mats.dark.color.copy(darker.copy(c).multiplyScalar(0.62));
}
