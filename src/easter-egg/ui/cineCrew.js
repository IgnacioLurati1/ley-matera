import * as THREE from 'three';

// Lo que comparten las cinemáticas con gauchos (PenalCinematic, FarmCinematic,
// TowerCinematic, introShots).

// Los gauchos de una cinemática: siempre cuatro, se juegue con los que se
// juegue (el usuario, 2026-09-29). Primero los de la partida (vos y los
// compañeros, en orden) y después los que faltan, con ponchos que no tiene
// nadie (net/Avatars: el color sale de id % 5).
export const CREW = 4;
export function crewIds(g) {
  const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
  const used = new Set(ids.map((id) => id % 5));
  for (let k = 0; ids.length < CREW && k < 5; k++) {
    if (used.has(k) || ids.includes(k)) continue;
    ids.push(k);
    used.add(k);
  }
  // (en orden también con los de relleno: el invitado arma las entradas
  // cuando todavía no le llegó el anfitrión, y le quedaba [1, 0, 2, 3] contra
  // el [0, 1, 2, 3] del anfitrión: el Valiente y el Miedoso con los ponchos
  // cambiados entre las dos compus. globalThis.__mduNoCrewSort: como antes)
  if (globalThis.__mduNoCrewSort !== true) ids.sort((a, b) => a - b);
  return ids;
}

const tmpW = new THREE.Vector3();

// Un brillo (Sprite aditivo) centrado en algo que está apoyado: la mitad de
// abajo quedaba adentro de la piedra y se veía cortado en línea recta. Lo
// corre `pull` metros hacia la cámara (así queda delante de lo que lo tapaba)
// y lo achica en proporción: en pantalla se ve igual. sprite: hijo de
// `parent` (se mueve con él); size: su tamaño sin correr (el de siempre).
export function glowFront(sprite, parent, camPos, size, pull = 0.8) {
  parent.updateWorldMatrix(true, false);
  tmpW.setFromMatrixPosition(parent.matrixWorld);
  const d = camPos.distanceTo(tmpW);
  if (d < 1e-3) return;
  const p = Math.min(pull, d * 0.45);
  // (en el mundo, hacia la cámara; después, al espacio del padre)
  tmpW.lerp(camPos, p / d);
  parent.worldToLocal(sprite.position.copy(tmpW));
  // (el padre puede estar agrandado: el tamaño es el del mundo)
  const k = parent.matrixWorld.getMaxScaleOnAxis() || 1;
  sprite.scale.setScalar(((size * (d - p)) / d) / k);
}

// Cada gaucho de la cuadrilla tiene su carácter, el mismo en todas las
// cinemáticas (el usuario 2026-10-03: "que sean distinguibles por encima del
// color del poncho"), por su lugar en crewIds:
// - el Valiente: encara, la mano en el facón, reacciona primero;
// - el Miedoso: se agacha, tiembla, se santigua y reza; salta enseguida;
// - el Canchero: nada lo despeina (los anteojos de sol), en jarra; lento;
// - el Viejo: trastabilla, se cansa, cae de rodillas, tose; el último.
// delay: cuánto tarda en reaccionar (s); turn: qué tan rápido se da vuelta.
export const PERSONA = ['valiente', 'miedoso', 'canchero', 'viejo'];
export const PERSONA_T = {
  valiente: { delay: 0, turn: 2.4 },
  miedoso: { delay: 0.12, turn: 3.2 },
  canchero: { delay: 0.45, turn: 1.1 },
  viejo: { delay: 0.7, turn: 0.9 },
};
export const personaOf = (i) => PERSONA[i % PERSONA.length];
