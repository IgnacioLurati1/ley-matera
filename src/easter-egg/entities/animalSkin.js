import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../lib/assets';
import { skinLook } from './bossSkin';

// Un bicho especial con cuerpo de verdad (los yacarés del estero, los
// caballos del infierno de La Tapera): un modelo facetado de Meshy (malla y
// textura, sin esqueleto) y los huesos armados acá, al cargar, con las
// medidas que trae el GLB (userData[def.key]: las articulaciones). Cada
// cuadro el rig de piezas de siempre (entities/Yacares.js, Horses.js) calcula
// su pose y esos mismos números mueven los huesos (def.bonesFor). Mientras
// baja el modelo se ven las piezas.
//
// def: { url, key, nb (huesos), head (el hueso de los ojos), rest (la pose
// de las piezas que es la del modelo quieto), bonesFor(X, P, out), weigh(X,
// pos) -> { idx, wt }, look (skinLook), off (window.__<algo>: las piezas) }

const tmpE = new THREE.Euler();
const tmpL = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// los lugares de bichos (entities/Zombies.js MAX = 40)
const SLOTS = 48;
// la esfera del recorte: la del modelo quieto, con margen para las patas, la
// cola y la boca abierta
const SPHERE_K = 1.25;

export const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// out = base · (trasladar p, girar rx/ry/rz en YXZ) — como local() de los rigs de piezas
export function local(out, base, px, py, pz, rx, ry, rz) {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpL.makeRotationFromEuler(tmpE).setPosition(px, py, pz);
  return out.multiplyMatrices(base, tmpL);
}

// distancia de p al tramo a-b (o.t: en qué parte del tramo, de 0 a 1)
export function seg(p, a, b, o) {
  const ax = b[0] - a[0];
  const ay = b[1] - a[1];
  const az = b[2] - a[2];
  const l2 = ax * ax + ay * ay + az * az || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * ax + (p.y - a[1]) * ay + (p.z - a[2]) * az) / l2));
  o.t = t;
  return Math.hypot(p.x - a[0] - ax * t, p.y - a[1] - ay * t, p.z - a[2] - az * t);
}

// De un mapa hueso -> peso a los cuatro de más peso (normalizados).
export function packWeights(W, idx, wt, i) {
  const top = [...W.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;
  top.forEach(([b, w], k) => {
    idx[i * 4 + k] = b;
    wt[i * 4 + k] = w / sum;
  });
  if (!top.length) wt[i * 4] = 1;
}

export default class AnimalSkin {
  constructor(game, eyeMat, def) {
    this.g = game;
    this.eyeMat = eyeMat;
    this.def = def;
    this.state = 0;
    this.list = new Map();
    this.W = Array.from({ length: def.nb }, () => new THREE.Matrix4());
    if (window[def.off]) return;
    this.state = 1;
    new GLTFLoader().load(
      assetUrl(def.url),
      (gltf) => {
        try {
          this.ready(gltf);
        } catch (e) {
          console.warn(def.key + ': sin modelo', e);
          this.state = 3;
        }
      },
      undefined,
      () => {
        this.state = 3;
      },
    );
  }

  ready(gltf) {
    const D = this.def;
    let src = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !src) src = o;
    });
    const X = { ...src.userData[D.key] };
    this.X = X;
    // pesos sobre la malla con índices (cada vértice una vez) y después, para
    // las facetas, un vértice por cara con su normal plana
    let geo = src.geometry;
    const { idx, wt } = D.weigh(X, geo.attributes.position);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    this.geo = geo;
    const m = src.material;
    const mat = new THREE.MeshStandardMaterial({ map: m.map || null, roughness: 0.85, metalness: 0 });
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    skinLook(mat, D.look || { rim: 0.35 });
    this.mat = mat;
    // el reposo de cada hueso (y su inversa: la del esqueleto)
    const R = Array.from({ length: D.nb }, () => new THREE.Matrix4());
    D.bonesFor(X, D.rest(), R);
    this.inv = R.map((r) => r.clone().invert());
    // la esfera del recorte va pegada al hueso del cuerpo (0): sin recorte cada
    // bicho se dibujaba en todas las pasadas (el reflejo, la luna y las seis
    // caras de cada farol), aunque estuviera lejos o atrás
    geo.computeBoundingSphere();
    this.bc = geo.boundingSphere.center.clone().applyMatrix4(this.inv[0]);
    this.br = geo.boundingSphere.radius * SPHERE_K;
    // los ojos: dónde están, respecto del hueso de la cabeza en reposo; los de
    // todos los bichos en un solo dibujo (lugar slot * ojos + k)
    this.eyes = (X.eyes || []).map((e) => new THREE.Vector3(...e).applyMatrix4(this.inv[D.head]));
    const ne = this.eyes.length;
    if (ne) {
      const E = new THREE.InstancedMesh(new THREE.SphereGeometry(X.eyeR || 0.03, 8, 6), this.eyeMat, SLOTS * ne);
      for (let i = 0; i < SLOTS * ne; i++) E.setMatrixAt(i, ZERO);
      E.count = 0;
      // (chiquitos: sin recorte, una llamada para todos)
      E.frustumCulled = false;
      this.eyeIM = E;
    }
    this.state = 2;
  }

  // Uno para cada bicho a la vista (se arma la primera vez que hace falta).
  inst(slot) {
    let I = this.list.get(slot);
    if (I) return I;
    const bones = Array.from({ length: this.def.nb }, () => {
      const b = new THREE.Bone();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      return b;
    });
    const sk = new THREE.Skeleton(bones, this.inv.map((m) => m.clone()));
    const mesh = new THREE.SkinnedMesh(this.geo, this.mat);
    mesh.name = this.def.key;
    // (los huesos no están en la escena: cada cuadro se les pone el mundo a mano)
    mesh.bind(sk, new THREE.Matrix4());
    // (la malla queda en el origen: la esfera va en el mundo, la pone pose())
    mesh.boundingSphere = new THREE.Sphere();
    // los primeros cuadros sin recorte: compila sus programas (y los de las
    // sombras) al aparecer, como antes, y no recién cuando entra a la vista
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    I = { mesh, bones, warm: 4 };
    this.list.set(slot, I);
    return I;
  }

  // Los ojos de un lugar (H: la cabeza en el mundo; sin H, escondidos).
  eyesAt(slot, H, s) {
    const E = this.eyeIM;
    if (!E || slot >= SLOTS) return;
    const ne = this.eyes.length;
    for (let k = 0; k < ne; k++) {
      if (H) tmpL.makeScale(s, s, s).setPosition(tmpV.copy(this.eyes[k]).applyMatrix4(H));
      E.setMatrixAt(slot * ne + k, H ? tmpL : ZERO);
    }
    if (H) E.count = Math.max(E.count, (slot + 1) * ne);
    E.instanceMatrix.needsUpdate = true;
  }

  // La pose del rig de piezas en los huesos (P.M: el cuerpo en el mundo; P.s:
  // el tamaño). false: todavía no hay modelo.
  pose(slot, P) {
    if (this.state !== 2 || window[this.def.off]) return false;
    const I = this.inst(slot);
    const sc = this.g.scene;
    if (I.mesh.parent !== sc) sc.add(I.mesh);
    if (this.eyeIM && this.eyeIM.parent !== sc) sc.add(this.eyeIM);
    I.mesh.visible = true;
    const W = this.W;
    this.def.bonesFor(this.X, P, W);
    for (let i = 0; i < this.def.nb; i++) I.bones[i].matrixWorld.copy(W[i]);
    const B = I.mesh.boundingSphere;
    B.center.copy(this.bc).applyMatrix4(W[0]);
    B.radius = this.br * W[0].getMaxScaleOnAxis();
    if (I.warm && --I.warm === 0) I.mesh.frustumCulled = true;
    this.eyesAt(slot, W[this.def.head], P.s || 1);
    return true;
  }

  hide(slot) {
    const I = this.list.get(slot);
    if (!I) return;
    I.mesh.visible = false;
    this.eyesAt(slot, null);
  }
}
