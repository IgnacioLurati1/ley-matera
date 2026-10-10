import * as THREE from 'three';

// v4: el Cazador del Caos en el piso (entities/Powerups model('caos')): un ojo
// de vacío que mira a la cámara (negro, el iris violeta que late, la pupila
// rajada de oro) adentro de un anillo de oro que gira y dos aros finitos de
// eclipse cruzados. Antes era una bola violeta parecida al farol ("es
// exactamente igual al farol", el usuario). Se anima solo (onBeforeRender):
// Powerups no lo toca más que para hacerlo flotar y girar.

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const add = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, ...o });
  MATS = {
    black: new THREE.MeshBasicMaterial({ color: 0x020005 }),
    iris: add(new THREE.Color(0.65, 0.25, 1).multiplyScalar(1.15), { side: THREE.DoubleSide }),
    irisIn: add(new THREE.Color(1, 0.45, 0.85).multiplyScalar(0.9), { side: THREE.DoubleSide }),
    slit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.3).multiplyScalar(1.6), toneMapped: false }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc860, metalness: 0.9, roughness: 0.22, emissive: 0x6a4000, emissiveIntensity: 0.9 }),
  };
  return MATS;
}

const _v = new THREE.Vector3();
export function cazadorPickup() {
  const M = mats();
  const g = new THREE.Group();
  // el ojo: mira siempre a la cámara
  const eye = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), M.black);
  const iris = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.11, 40), M.iris);
  iris.position.z = 0.135;
  const irisIn = new THREE.Mesh(new THREE.RingGeometry(0.025, 0.05, 32), M.irisIn);
  irisIn.position.z = 0.137;
  const slit = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), M.slit);
  slit.scale.set(0.009, 0.045, 0.004);
  slit.position.z = 0.14;
  eye.add(ball, iris, irisIn, slit);
  g.add(eye);
  // el anillo de oro y los dos aros de eclipse
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 8, 48), M.gold);
  const hoopA = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.004, 6, 56), M.iris);
  const hoopB = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.004, 6, 56), M.irisIn);
  g.add(ring, hoopA, hoopB);
  // (se anima al dibujarse: el ojo mira a la cámara, el iris late y parpadea,
  // los aros giran)
  ball.onBeforeRender = (r, s, cam) => {
    const t = performance.now() / 1000;
    eye.parent.updateWorldMatrix(true, false);
    // (lookAt quiere el punto en el mundo)
    cam.getWorldPosition(_v);
    eye.lookAt(_v);
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    eye.scale.set(1, blink, 1);
    const beat = 1 + 0.08 * Math.sin(t * 6);
    iris.scale.setScalar(beat);
    irisIn.rotation.z = t * 2;
    ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.9) * 0.4, t * 1.6, 0);
    hoopA.rotation.set(t * 1.3, 0.6, t * 0.4);
    hoopB.rotation.set(-0.7, t * -1.7, t * 0.9);
    eye.updateMatrixWorld(true);
    ring.updateMatrixWorld(true);
    hoopA.updateMatrixWorld(true);
    hoopB.updateMatrixWorld(true);
  };
  g.userData.cazador = true;
  return g;
}

// ---------------- en la mano: las manos que se vuelven bruma con ojos ----------------
// Un ojo de la bruma (blanco violeta con la pupila negra): mira adelante.
let EYE_MATS = null;
export function eyeMats() {
  if (EYE_MATS) return EYE_MATS;
  EYE_MATS = {
    white: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 1).multiplyScalar(1.15), toneMapped: false, fog: false }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x050008, fog: false }),
    void: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.0, 0.1), transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
  };
  return EYE_MATS;
}
export function mistEye(r = 0.006) {
  const E = eyeMats();
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), E.white);
  const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), E.pupil);
  p.position.z = -r * 0.62;
  p.scale.z = 0.5;
  g.add(w, p);
  for (const m of [w, p]) m.renderOrder = 6;
  return g;
}
