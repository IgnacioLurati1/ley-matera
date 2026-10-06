import * as THREE from 'three';

// El puño del Alcaide (el final del molino: le arranca el Mate de Oro al tuyo).
// Su modelo de Meshy no tiene dedos, y con la mano abierta el mate quedaba
// pegado delante de la palma. Se le cierra la mano en la malla: los vértices
// de la mano más allá de los nudillos se enrollan alrededor de un eje que cruza
// la palma (como un papel alrededor de un caño) en sus posiciones de reposo, y
// el mate va en el medio del puño. Al terminar se devuelven las de siempre. No
// es un morph (no hay programas nuevos que compilar): solo se vuelven a subir
// la posición y la normal de la malla.
// S: el modelo del jefe ya bajado (entities/bossSkin, window.__bossSkins.alcaide);
// bone: la mano; o.flip: la palma del otro lado (si el reposo no la tiene para
// abajo); o.knuckle: dónde están los nudillos (del largo de la mano).
const v = new THREE.Vector3();
const q = new THREE.Vector3();
const lo = new THREE.Vector3();
const hi = new THREE.Vector3();
const ws = new THREE.Vector3();
const tp = new THREE.Vector3();
const ts = new THREE.Vector3();
const tf = new THREE.Vector3();
const tn = new THREE.Vector3();
const td = new THREE.Vector3();
const tc = new THREE.Vector3();
const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const tq3 = new THREE.Quaternion();

export function makeFist(S, bone = 'RightHand', o = {}) {
  let M = null;
  S?.root?.traverse((x) => {
    if (x.isSkinnedMesh && !M) M = x;
  });
  if (!M) return null;
  const sk = M.skeleton;
  const bi = sk.bones.findIndex((b) => b.name === bone);
  if (bi < 0) return null;
  const B = sk.bones[bi];
  const geo = M.geometry;
  const P = geo.attributes.position;
  const N = geo.attributes.normal;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  if (!P || !SI || !SW) return null;
  // (de la malla al hueso de la mano, en reposo, y de vuelta)
  const toL = new THREE.Matrix4().multiplyMatrices(sk.boneInverses[bi], M.bindMatrix);
  const fromL = toL.clone().invert();
  const nToL = new THREE.Matrix3().getNormalMatrix(toL);
  const nFromL = new THREE.Matrix3().getNormalMatrix(fromL);
  const idx = [];
  const loc = [];
  const nrm = [];
  lo.set(Infinity, Infinity, Infinity);
  hi.set(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < P.count; i++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (SI.getComponent(i, j) === bi) w += SW.getComponent(i, j);
    if (w < 0.5) continue;
    idx.push(i);
    const p = v.fromBufferAttribute(P, i).applyMatrix4(toL).clone();
    loc.push(p);
    lo.min(p);
    hi.max(p);
    nrm.push(N ? new THREE.Vector3().fromBufferAttribute(N, i).applyMatrix3(nToL).normalize() : null);
  }
  if (idx.length < 20) return null;
  const orig = idx.map((i) => [P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 0, N ? N.getZ(i) : 0]);
  // los ejes de la mano: el más largo, de la muñeca (el origen) a la punta de
  // los dedos (el de este modelo: Y). Del grosor y lo ancho decide la parte de
  // los dedos sola (en la mano entera el pulgar las empareja): el más finito es
  // la normal de la palma. La palma, del lado donde sale el pulgar.
  const ext = [hi.x - lo.x, hi.y - lo.y, hi.z - lo.z];
  const fA = [0, 1, 2].sort((a, b) => ext[b] - ext[a])[0];
  const fS = Math.abs(hi.getComponent(fA)) >= Math.abs(lo.getComponent(fA)) ? 1 : -1;
  const L = fS > 0 ? hi.getComponent(fA) : -lo.getComponent(fA);
  const s0 = L * (o.knuckle ?? 0.6);
  const span = (a0, a1, ax) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of loc) {
      const a = p.getComponent(fA) * fS;
      if (a < a0 || a > a1) continue;
      mn = Math.min(mn, p.getComponent(ax));
      mx = Math.max(mx, p.getComponent(ax));
    }
    return [mn, mx];
  };
  const [o1, o2] = [0, 1, 2].filter((x) => x !== fA);
  const s1 = span(s0, L, o1);
  const s2 = span(s0, L, o2);
  const nA = s1[1] - s1[0] <= s2[1] - s2[0] ? o1 : o2;
  const lA = nA === o1 ? o2 : o1;
  const fing = nA === o1 ? s1 : s2;
  const thick = fing[1] - fing[0];
  const nMid = (fing[0] + fing[1]) / 2;
  // (el pulgar: en la palma, lo que sobresale más allá de los dedos)
  const pal = span(0.3 * L, s0, nA);
  const nS = (pal[1] - fing[1] >= fing[0] - pal[0] ? 1 : -1) * (o.flip ? -1 : 1);
  const lSp = span(s0, L, lA);
  const lMid = (lSp[0] + lSp[1]) / 2;
  const flen = L - s0;
  let r = o.r ?? 0.3 * flen;
  let k = 0;
  const F = {
    count: idx.length,
    get dbg() {
      return { fA, nA, lA, fS, nS, L, s0, thick, nMid, r, ext, k };
    },
    // el radio del puño (en el mundo): lo que tiene adentro y el grosor de los dedos
    fitWorld(radius) {
      const sc = B.getWorldScale(ws).x || 1;
      // (los dedos apenas se hunden: con el mate grande no daban la vuelta)
      r = radius / sc + thick * 0.2;
      F.set(k, true);
    },
    // 0 abierta, 1 cerrada
    set(kk, force = false) {
      if (!force && Math.abs(kk - k) < 1e-4) return;
      k = kk;
      for (let j = 0; j < idx.length; j++) {
        const p = loc[j];
        const a = p.getComponent(fA) * fS;
        const i = idx[j];
        if (a <= s0 || k <= 0) {
          const O = orig[j];
          P.setXYZ(i, O[0], O[1], O[2]);
          if (N) N.setXYZ(i, O[3], O[4], O[5]);
          continue;
        }
        const b = (p.getComponent(nA) - nMid) * nS;
        // (las puntas se cierran más que la base, como las falanges)
        const phi = ((a - s0) / r) * k * (1 + 0.45 * ((a - s0) / flen));
        const rho = r - b;
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        q.copy(p);
        q.setComponent(fA, (s0 + rho * s) * fS);
        q.setComponent(nA, (r - rho * c) * nS + nMid);
        q.applyMatrix4(fromL);
        P.setXYZ(i, q.x, q.y, q.z);
        if (N && nrm[j]) {
          const na = nrm[j].getComponent(fA) * fS;
          const nb = nrm[j].getComponent(nA) * nS;
          q.copy(nrm[j]);
          q.setComponent(fA, (na * c - nb * s) * fS);
          q.setComponent(nA, (na * s + nb * c) * nS);
          q.applyMatrix3(nFromL).normalize();
          N.setXYZ(i, q.x, q.y, q.z);
        }
      }
      P.needsUpdate = true;
      if (N) N.needsUpdate = true;
    },
    // el medio del puño, en el mundo (con la pose de este cuadro)
    center(out) {
      out.set(0, 0, 0);
      out.setComponent(fA, s0 * fS);
      out.setComponent(nA, r * k * nS + nMid);
      out.setComponent(lA, lMid);
      B.updateWorldMatrix(true, false);
      return out.applyMatrix4(B.matrixWorld);
    },
    // a lo ancho del puño (por donde lo atraviesa lo que agarra), en el mundo
    axis(out) {
      out.set(0, 0, 0).setComponent(lA, 1);
      return out.transformDirection(B.matrixWorld);
    },
    // Gira la mano sobre su largo (como el antebrazo) para que la palma (con el
    // mate) mire hacia `to` (en el mundo): con el brazo en alto quedaba de
    // espaldas a la cámara y el puño tapaba el mate. w: cuánto (0..1); max: el
    // giro más grande (rad). Cada cuadro, después de posar el modelo.
    face(to, w = 1, max = 2.2) {
      B.updateWorldMatrix(true, false);
      B.matrixWorld.decompose(tp, tq, ts);
      tf.set(0, 0, 0).setComponent(fA, fS).applyQuaternion(tq).normalize();
      tn.set(0, 0, 0).setComponent(nA, nS).applyQuaternion(tq).normalize();
      td.subVectors(to, tp);
      td.addScaledVector(tf, -td.dot(tf));
      if (td.lengthSq() < 1e-8 || !B.parent) return;
      td.normalize();
      const ang = Math.max(-max, Math.min(max, Math.atan2(tc.crossVectors(tn, td).dot(tf), tn.dot(td)))) * w;
      tq2.setFromAxisAngle(tf, ang).multiply(tq);
      B.parent.getWorldQuaternion(tq3).invert().multiply(tq2);
      B.quaternion.copy(tq3);
      B.updateMatrixWorld(true);
    },
    restore() {
      F.set(0, true);
    },
  };
  return F;
}
