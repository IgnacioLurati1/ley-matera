import * as THREE from 'three';
import { mesh, boxGeo } from './props';

// Ventanales altos rotos (a la altura de un piso de arriba que ya no existe):
// de vez en cuando un zombie se asoma por ahí y se tira al piso.
// cell: celda de pared exterior; face: hacia adentro de la habitación.
export const HIGH_WINDOWS = [
  { cell: [3, 43], face: [1, 0], zone: 'A' },
  { cell: [32, 46], face: [0, -1], zone: 'C' },
  { cell: [19, 3], face: [0, 1], zone: 'G' },
  { cell: [46, 3], face: [0, 1], zone: 'F' },
  { cell: [56, 37], face: [-1, 0], zone: 'H' },
];
export const SILL_Y = 2.35;

// Dibuja los marcos con el hueco oscuro y los vidrios rotos, pegados a la pared.
export function buildHighWindows(game) {
  const M = game.world.M;
  const root = new THREE.Group();
  const hole = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9ab0c0, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.45 });
  const list = HIGH_WINDOWS.map((w) => {
    const a = game.world.wallAnchor(w.cell, w.face, 0.02);
    const g = new THREE.Group();
    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.rot;
    // hueco, marco y parteluz
    g.add(mesh(new THREE.PlaneGeometry(0.9, 0.95), hole, 0, SILL_Y + 0.5, -0.005));
    g.add(mesh(boxGeo(1.08, 0.08, 0.08), M.woodDark, 0, SILL_Y + 0.02, 0.02));
    g.add(mesh(boxGeo(1.08, 0.08, 0.08), M.woodDark, 0, SILL_Y + 1.0, 0.02));
    for (const x of [-0.5, 0.5]) g.add(mesh(boxGeo(0.08, 1.06, 0.08), M.woodDark, x, SILL_Y + 0.51, 0.02));
    g.add(mesh(boxGeo(0.04, 0.95, 0.05), M.woodDark, 0.05, SILL_Y + 0.5, 0.02, 0, 0, 0.06));
    // vidrios rotos en punta que quedaron en el marco
    const shards = [[-0.36, 0.12, 0.2, 0.3, 0.2], [0.3, 0.85, 0.24, 0.22, -0.4], [-0.3, 0.86, 0.18, 0.2, 2.8], [0.38, 0.2, 0.14, 0.26, 0.1]];
    for (const [x, y, w2, h, r] of shards) {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(w2 / 2, h, 3), glass);
      tri.scale.z = 0.05;
      tri.position.set(x, SILL_Y + y, 0.01);
      tri.rotation.z = r;
      g.add(tri);
    }
    // no se mueve nunca: va junto con el resto de la utilería fija del mapa
    game.world.addStatic(g);
    return { ...w, x: a.x, z: a.z, rot: a.rot, in: new THREE.Vector3(w.face[0], 0, w.face[1]) };
  });
  return { root, list };
}
