import * as THREE from 'three';
import { AVATAR_SETS } from '../net/Avatars';

// Para la lente de cine (fx/Lens.js): de los muñecos que están en cuadro, a
// qué distancia de la cámara está el más cercano y el más lejano. Todo ese
// tramo queda en foco: un personaje nunca sale borroso.
// Con un fantasma en cuadro (transparente: no deja profundidad, se
// desenfocaría con el fondo) no hay lente en esa toma: devuelve null.

const v = new THREE.Vector3();
const p = new THREE.Vector3();
const out = { near: 0, far: 0, n: 0 };

const shown = (o) => {
  let x = o;
  for (; x.parent; x = x.parent) if (!x.visible) return false;
  return x.visible && !!x.isScene;
};

export function lensHull(g, cam) {
  const e = cam.matrixWorld.elements;
  let near = Infinity;
  let far = 0;
  let n = 0;
  for (const A of AVATAR_SETS) {
    if (!A.root?.parent) continue;
    for (const a of A.list.values()) {
      if (!a.group || !shown(a.group)) continue;
      const hips = a.gs?.on ? a.gs.bones?.Hips : null;
      if (hips) p.setFromMatrixPosition(hips.matrixWorld);
      else p.setFromMatrixPosition(a.group.matrixWorld).y += 1;
      // (la distancia a lo largo de donde mira la cámara)
      const z = -((p.x - e[12]) * e[8] + (p.y - e[13]) * e[9] + (p.z - e[14]) * e[10]);
      if (!(z > 0.2 && z < 60)) continue;
      v.copy(p).project(cam);
      if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.15) continue;
      if (a.ghost) return null;
      near = Math.min(near, z);
      far = Math.max(far, z);
      n++;
    }
  }
  out.n = n;
  out.near = n ? near - 0.6 : 0;
  out.far = n ? far + 0.8 : 0;
  return out;
}
