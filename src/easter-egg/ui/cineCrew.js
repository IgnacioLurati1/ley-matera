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
