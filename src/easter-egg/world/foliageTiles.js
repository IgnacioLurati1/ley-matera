import * as THREE from 'three';

// El pasto alto y el maíz de afuera en cuadros: un InstancedMesh por cuadro,
// cada uno con su esfera, así lo que queda atrás o al costado de la cámara no
// se dibuja; y lo que está más lejos que `far` (perdido en la niebla) tampoco
// (World.preRender, farTiles). Antes era una sola malla con todas las matas del
// mapa, que se dibujaba siempre entera.
// items: [{ m: Matrix4, c?: Color, x, z }]. setup(im): lo de cada cuadro.
export function tileInstances(world, geo, mat, items, { tile = 16, far = 0, setup = null } = {}) {
  const cells = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.x / tile)},${Math.floor(it.z / tile)}`;
    let L = cells.get(k);
    if (!L) cells.set(k, (L = []));
    L.push(it);
  }
  const group = new THREE.Group();
  for (const L of cells.values()) {
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      if (it.c) im.setColorAt(i, it.c);
    });
    im.computeBoundingSphere();
    setup?.(im);
    group.add(im);
    if (far > 0) (world.farTiles ||= []).push({ im, c: im.boundingSphere.center, r: im.boundingSphere.radius, far });
  }
  return group;
}

// Cada tanto, antes de dibujar (World.preRender, también en las cinemáticas):
// los cuadros lejos de la cámara que dibuja, apagados.
export function cullFarTiles(world, dt, cam) {
  const T = world.farTiles;
  if (!T) return;
  world.farT = (world.farT || 0) - dt;
  if (world.farT > 0) return;
  world.farT = 0.25;
  const p = (world.farC ||= new THREE.Vector3()).setFromMatrixPosition(cam.matrixWorld);
  for (const t of T) {
    const d = Math.hypot(t.c.x - p.x, t.c.z - p.z) - t.r;
    t.im.visible = d < t.far;
  }
}
