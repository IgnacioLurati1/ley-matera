import * as THREE from 'three';

// La cadena en la mano de los jefes con cuerpo de verdad que pelean con
// cadenas (el Gauchito Gil y el Alcaide: entities/skins/gil.js, alcaide.js).
// Cuelga del puño y se hamaca con lo que hace; parado (sin caminar) la
// revolea: el brazo de la cadena deja el clip y gira el puño en un círculo al
// costado, y la cadena da vueltas como una boleadora. Los eslabones son los de
// la cadena que tira (entities/bossMoves.js: el mismo toro y world.M.iron, no
// compila nada). Es solo de vista: cada uno (anfitrión o invitado) la mueve.
//   attach(S, { side: 'Right' | 'Left', len })      en ready del archivo del jefe (el reposo)
//   armPose(S, dt, qYaw)                            en adjust (antes de escribir los huesos)
//   update(S, g, dt, show, floorY)                  en after (con los huesos ya puestos)

const LINK = 0.136;
const GRAV = -9.8;
let linkGeo = null;

const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const d = new THREE.Vector3();
const n1 = new THREE.Vector3();
const n2 = new THREE.Vector3();
const ax = new THREE.Vector3();
const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export function attach(S, { side = 'Right', len = 1.5 } = {}) {
  const B = S.bones;
  const C = { side, n: Math.max(4, Math.round(len / LINK)), links: [], p: [], o: [], play: 0, want: 0, ph: 0, live: false, group: null };
  for (let i = 0; i <= C.n; i++) {
    C.p.push(new THREE.Vector3());
    C.o.push(new THREE.Vector3());
  }
  // el brazo en reposo: hacia dónde apunta cada hueso (espacio del modelo)
  S.root.updateMatrixWorld(true);
  const wp = (nm) => B[nm].getWorldPosition(new THREE.Vector3());
  C.arm = S.byName[side + 'Arm'];
  C.fore = S.byName[side + 'ForeArm'];
  C.hand = S.byName[side + 'Hand'];
  C.armDir = wp(side + 'ForeArm').sub(wp(side + 'Arm')).normalize();
  C.foreDir = wp(side + 'Hand').sub(wp(side + 'ForeArm')).normalize();
  C.sx = side === 'Left' ? 1 : -1;
  S.chain = C;
  return C;
}

// Los eslabones, la primera vez que se ven (y en la escena donde está el modelo:
// con el reinicio rápido la escena puede ser otra).
function links(C, S, g) {
  if (!C.group) {
    linkGeo ||= new THREE.TorusGeometry(0.075, 0.02, 5, 10);
    C.group = new THREE.Group();
    for (let i = 0; i < C.n; i++) {
      const l = new THREE.Mesh(linkGeo, g.world.M.iron);
      l.castShadow = true;
      l.frustumCulled = false;
      C.group.add(l);
      C.links.push(l);
    }
  }
  const home = S.root.parent || g.scene;
  if (C.group.parent !== home) home.add(C.group);
  return C.group;
}

// El brazo que revolea (mezclado con el clip según C.play): el brazo abajo,
// adelante y afuera, el antebrazo para adelante y el puño dando vueltas en un
// círculo parado al costado (plano y-z). Los giros son en el mundo, como los
// de bossSkin (S.list[i].W, ya con el giro del jefe).
export function armPose(S, dt, qYaw) {
  const C = S.chain;
  if (!C || !C.arm || !C.fore) return;
  C.play += (C.want - C.play) * Math.min(1, dt * 4);
  if (C.play < 0.002) return;
  // (la fase se va sumando: un giro y medio por segundo)
  C.ph += dt * Math.PI * 2 * 1.5;
  const sx = C.sx;
  const W = (dir, rest, d0) => qa.setFromUnitVectors(d0, dir.normalize()).premultiply(qYaw).multiply(rest);
  // el brazo
  a.set(sx * 0.42, -0.72, 0.42 + Math.sin(C.ph) * 0.05);
  const qArm = W(a, C.arm.rest, C.armDir).clone();
  // el antebrazo, con la punta en círculo
  b.set(sx * 0.3, -0.15 + Math.sin(C.ph) * 0.55, 0.85 + Math.cos(C.ph) * 0.55);
  const qFore = W(b, C.fore.rest, C.foreDir).clone();
  // (la mano sigue al antebrazo: el mismo giro desde su reposo)
  q.copy(qFore).multiply(qa.copy(C.fore.rest).invert());
  const qHand = q.clone().multiply(C.hand.rest);
  const k = C.play;
  C.arm.W.slerp(qArm, k);
  C.fore.W.slerp(qFore, k);
  C.hand.W.slerp(qHand, k);
  C.spinAxis = C.spinAxis || new THREE.Vector3();
  C.spinAxis.set(sx, 0, 0).applyQuaternion(qYaw);
}

// La cadena: de la mano para abajo, con peso (verlet). show: si se ve.
export function update(S, g, dt, show, floorY = 0) {
  const C = S.chain;
  if (!C) return;
  const on = !!show && S.root.visible;
  if (!on && !C.group) return;
  links(C, S, g).visible = on;
  if (!on) {
    C.live = false;
    return;
  }
  const s = S.root.scale.x;
  const B = S.bones;
  // el agarre: un poco más allá de la muñeca
  B[C.side + 'Hand'].getWorldPosition(a);
  B[C.side + 'ForeArm'].getWorldPosition(b);
  d.subVectors(a, b).normalize();
  a.addScaledVector(d, 0.07 * s);
  const seg = LINK * Math.max(1, s * 0.55);
  const P = C.p;
  const O = C.o;
  if (!C.live) {
    for (let i = 0; i <= C.n; i++) {
      P[i].copy(a).addScaledVector(UP, -seg * i);
      O[i].copy(P[i]);
    }
    C.live = true;
  }
  const h = Math.min(1 / 30, Math.max(1e-3, dt));
  const spin = C.play * 55;
  for (let i = 1; i <= C.n; i++) {
    const p = P[i];
    v.subVectors(p, O[i]).multiplyScalar(0.985);
    O[i].copy(p);
    p.add(v);
    p.y += GRAV * h * h;
    // el revoleo: un empujón tangente al círculo alrededor del eje de costado
    if (spin > 0 && C.spinAxis) {
      n1.subVectors(p, a);
      n2.crossVectors(C.spinAxis, n1);
      const L = n2.length();
      if (L > 1e-4) p.addScaledVector(n2, (spin * h * h * Math.min(1, i / 3)) / L);
    }
  }
  for (let it = 0; it < 6; it++) {
    P[0].copy(a);
    for (let i = 0; i < C.n; i++) {
      d.subVectors(P[i + 1], P[i]);
      const L = d.length() || 1e-6;
      const diff = (L - seg) / L;
      if (i === 0) P[1].addScaledVector(d, -diff);
      else {
        P[i].addScaledVector(d, diff * 0.5);
        P[i + 1].addScaledVector(d, -diff * 0.5);
      }
    }
    for (let i = 1; i <= C.n; i++) if (P[i].y < floorY + 0.03) P[i].y = floorY + 0.03;
  }
  P[0].copy(a);
  // los eslabones: uno acostado y el que sigue parado, en el medio de cada tramo
  const k = Math.max(0.7, Math.min(1.3, s * 0.55));
  for (let i = 0; i < C.n; i++) {
    const L = C.links[i];
    d.subVectors(P[i + 1], P[i]);
    const len = d.length() || 1e-6;
    d.divideScalar(len);
    ax.copy(Math.abs(d.y) > 0.95 ? n1.set(1, 0, 0) : n1.crossVectors(d, UP).normalize());
    const nn = i % 2 ? ax : n2.crossVectors(d, ax);
    m.makeBasis(d, v.crossVectors(nn, d), nn);
    L.quaternion.setFromRotationMatrix(m);
    L.position.addVectors(P[i], P[i + 1]).multiplyScalar(0.5);
    L.scale.set(1.45 * k, k, k);
  }
}

export function detach(S) {
  const C = S.chain;
  if (!C) return;
  C.group?.removeFromParent();
  S.chain = null;
}
