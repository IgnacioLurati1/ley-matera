import * as THREE from 'three';

// Pasada de profundidad para lo recortado con alphaTest que se amontona (el
// pajonal del estero: miles de planos cruzados). Sin esto la placa sombreaba
// cada píxel una vez por cada caña que se pisa, con todas las luces y sombras
// del mapa; ahora primero va solo la profundidad, con un material barato y el
// mismo recorte, y después el color sin escribir profundidad: cada píxel se
// sombrea una sola vez (y lo que queda atrás del pajonal se descarta antes).
// En el estero a 1440p en Épica el cuadro bajó de 8,2 a 5,6 ms de placa.
// Va de hija del mesh: lo sigue en visible, en la posición y en el reflejo.
export function depthPrepass(mesh) {
  const src = mesh.material;
  if (!src || mesh.userData.prepass) return mesh;
  const mat = new THREE.MeshBasicMaterial({ map: src.map, alphaMap: src.alphaMap, alphaTest: src.alphaTest, side: src.side, colorWrite: false });
  mat.name = 'prepass';
  let pre;
  if (mesh.isInstancedMesh) {
    if (!mesh.boundingSphere) mesh.computeBoundingSphere();
    pre = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count);
    pre.instanceMatrix = mesh.instanceMatrix;
    pre.count = mesh.count;
    pre.boundingSphere = mesh.boundingSphere;
  } else pre = new THREE.Mesh(mesh.geometry, mat);
  pre.frustumCulled = mesh.frustumCulled;
  pre.castShadow = false;
  pre.receiveShadow = false;
  pre.renderOrder = mesh.renderOrder - 1;
  pre.userData.reflect = mesh.userData.reflect;
  mesh.add(pre);
  src.depthWrite = false;
  mesh.userData.prepass = pre;
  return mesh;
}
