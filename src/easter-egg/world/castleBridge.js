import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from './props';

// El puente levadizo de la barbacana (la puerta 15 del castillo, 'puente'):
// un tablero de tablones con zunchos de hierro, abisagrado al pie del portón,
// y dos cadenas de sus puntas a la pared de arriba del portón. Levantado tapa
// el portón desde afuera; bajado cruza el barranco hasta el puente de piedra.
// Lo baja el torno del Pack-a-Pava (world/papTermas.js): mientras se gira se
// inclina un poco y cuando se abre la puerta cae de golpe.
// El grupo de la puerta está en el centro de las celdas del portón (a lo
// ancho: x, hacia las termas: +z); todo va en esas coordenadas.

const LEN = 4.95;
const THICK = 0.18;
const HINGE_Z = 0.55;
const ANCHOR_Y = 6.6;
const LINK = 0.2;
const N_LINKS = 46;
const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function buildDrawbridge(g, M, group, pieces, width) {
  const half = width / 2;
  const hinge = new THREE.Group();
  hinge.position.set(0, 0, HINGE_Z);
  group.add(hinge);
  const wood = M.woodDark || M.wood;
  const light = M.beam || M.wood || wood;
  const iron = M.iron;
  // los tablones (a lo largo), con una rendija entre cada uno
  const nP = Math.round(width / 0.5);
  for (let i = 0; i < nP; i++) {
    const x = -half + 0.25 + i * (width / nP);
    const drop = (i % 3) * 0.006;
    hinge.add(mesh(boxGeo(width / nP - 0.025, THICK, LEN), i % 2 ? wood : light, x, -THICK / 2 - drop, LEN / 2));
  }
  // las vigas de abajo: dos largueros y tres travesaños
  for (const s of [-1, 1]) hinge.add(mesh(boxGeo(0.24, 0.16, LEN - 0.1), wood, s * (half - 0.45), -THICK - 0.08, LEN / 2));
  for (const z of [0.35, LEN / 2, LEN - 0.35]) {
    hinge.add(mesh(boxGeo(width - 0.1, 0.2, 0.22), wood, 0, -THICK - 0.1, z));
    // y arriba, el zuncho de hierro que los ata
    hinge.add(mesh(boxGeo(width + 0.02, 0.025, 0.12), iron, 0, 0.012, z));
  }
  // el canto de la punta, forrado de hierro, y el eje de la bisagra
  hinge.add(mesh(boxGeo(width + 0.04, THICK + 0.06, 0.06), iron, 0, -THICK / 2, LEN - 0.03));
  hinge.add(mesh(cylGeo(0.1, 0.1, width + 0.5, 10), iron, 0, -0.1, 0, 0, 0, Math.PI / 2));
  // las argollas de las cadenas, en las puntas
  const eye = new THREE.TorusGeometry(0.09, 0.025, 5, 12);
  for (const s of [-1, 1]) hinge.add(mesh(eye, iron, s * (half - 0.15), 0.07, LEN - 0.25, 0, Math.PI / 2, 0));
  mergeByMaterial(hinge);
  for (const o of hinge.children) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  // las chapas de hierro en la pared, de donde salen las cadenas
  const anchors = [-1, 1].map((s) => new THREE.Vector3(s * (half - 0.15), ANCHOR_Y, HINGE_Z - 0.03));
  for (const a of anchors) {
    group.add(mesh(boxGeo(0.42, 0.42, 0.06), iron, a.x, a.y, a.z));
    group.add(mesh(new THREE.TorusGeometry(0.11, 0.03, 5, 12), iron, a.x, a.y - 0.08, a.z + 0.06));
  }
  // las cadenas: eslabones de una sola malla, que se estiran según el tablero
  const link = new THREE.TorusGeometry(0.07, 0.022, 4, 10).scale(1, 1.55, 1);
  const chains = new THREE.InstancedMesh(link, iron, N_LINKS * 2);
  chains.frustumCulled = false;
  chains.castShadow = true;
  group.add(chains);
  const corner = [-1, 1].map((s) => new THREE.Vector3(s * (half - 0.15), 0.1, LEN - 0.25));

  const p = {
    obj: hinge,
    a: 0,
    from: null,
    slammed: false,
    // 0 levantado, 1 bajado
    pose(a) {
      p.a = a;
      hinge.rotation.x = -Math.PI / 2 * (1 - a);
      const c = Math.cos(hinge.rotation.x);
      const sn = Math.sin(hinge.rotation.x);
      for (let k = 0; k < 2; k++) {
        const q = corner[k];
        // la punta del tablero, girada con la bisagra
        tmpA.set(q.x, q.y * c - q.z * sn + hinge.position.y, q.y * sn + q.z * c + hinge.position.z);
        tmpB.copy(anchors[k]);
        tmpD.subVectors(tmpB, tmpA);
        const len = tmpD.length();
        tmpD.divideScalar(len || 1);
        const n = Math.min(N_LINKS, Math.max(1, Math.round(len / LINK)));
        tmpQ.setFromUnitVectors(UP, tmpD);
        for (let i = 0; i < N_LINKS; i++) {
          const idx = k * N_LINKS + i;
          if (i >= n) {
            chains.setMatrixAt(idx, ZERO);
            continue;
          }
          // cada eslabón girado un cuarto respecto del anterior
          tmpQ2.setFromAxisAngle(tmpD, (i % 2) * (Math.PI / 2)).multiply(tmpQ);
          const t = (i + 0.5) / n;
          tmpM.compose(tmpB.copy(tmpA).addScaledVector(tmpD, len * t), tmpQ2, ONE);
          chains.setMatrixAt(idx, tmpM);
        }
      }
      chains.instanceMatrix.needsUpdate = true;
    },
    // la caída (Interactables.openDoor): de donde esté hasta abajo, cada vez más rápido
    fall(k) {
      if (p.from == null) {
        p.from = p.a;
        g.audio?.chain?.(group.localToWorld(tmpA.set(0, ANCHOR_Y, HINGE_Z)));
      }
      p.pose(p.from + (1 - p.from) * k * k);
      if (k >= 1 && !p.slammed) {
        p.slammed = true;
        slam();
      }
    },
  };
  // el golpe contra el borde del barranco: polvo, astillas y el suelo que tiembla
  const slam = () => {
    const fx = g.fx;
    const tip = group.localToWorld(new THREE.Vector3(0, 0.1, HINGE_Z + LEN - 0.3));
    const mid = group.localToWorld(new THREE.Vector3(0, 0.1, HINGE_Z + LEN * 0.5));
    for (const s of [-1, 0, 1]) fx?.dust?.(tmpA.copy(tip).setX(tip.x + s * half * 0.8), UP, [0.62, 0.62, 0.66], 14);
    fx?.dust?.(mid, UP, [0.55, 0.52, 0.48], 10);
    // la nieve que se sacude del tablero
    for (let i = 0; i < 26; i++) {
      fx?.alpha?.spawn(mid.x + (Math.random() - 0.5) * width, mid.y + 0.2, mid.z + (Math.random() - 0.5) * LEN, (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2, { color: [0.9, 0.93, 1], size: 0.25, size1: 1.2, life: 1 + Math.random(), alpha: 0.35, drag: 0.6 });
    }
    g.audio?.bossSlam?.(tip);
    g.audio?.door?.(tip, true);
    const d = g.camera?.position.distanceTo(tip) ?? 99;
    if (d < 26) fx?.addShake?.(0.55 * (1 - d / 26));
  };
  p.pose(0);
  pieces.push(p);
  return p;
}
