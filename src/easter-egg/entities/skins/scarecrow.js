import * as THREE from 'three';
import { clampT } from '../bossSkin';

// El Espantapájaros con cuerpo de verdad (entities/bossSkin.js; modelo
// facetado, esqueleto y clips de Meshy, los clips de su biblioteca en el mismo
// esqueleto, suyos y de nadie más). La pelea del Prado (world/Prado.js).
//
// Se mueve como un muñeco de paja, no como una persona: los clips dan el
// cuerpo (parado se balancea como en el palo; camina a saltitos, como un
// títere que tiran de los hilos; la carga, a saltos largos, agachado; sale de
// la tierra de un salto con brazos y piernas abiertos; el horquillazo es de
// arriba, con las dos manos: se estira, tiembla y baja de golpe; el latigazo,
// girando con los brazos abiertos) y encima va lo del muñeco (overlay): los
// brazos abiertos en cruz, los antebrazos colgando y bamboleándose (péndulos:
// se mecen con el cuerpo), las manos flojas, el tronco tieso como un palo, la
// cabeza caída de costado y suelta (un resorte: cabecea con los saltos y los
// frenazos), las rodillas flojas y, cada tanto, un tirón (como si le tiraran
// de un hilo). Atontado, muerto y al final se desarma como una bolsa vacía:
// se dobla, la cabeza le cuelga y los brazos caen. Cada golpe a tiempo con el
// daño. Cae de rodillas y así lo encuentra el final (ui/FarmCinematic.js):
// mira al cielo, abre los brazos en cruz mientras arde, se cae para adelante
// y se hunde en la paja. La horquilla (en la mano de la pieza 6) y el cuervo
// del hombro van colgados de sus huesos y desaparecen cuando la escena
// esconde los del de piezas; el fuego y el carbón del final se copian de los
// materiales del de piezas (bossMats) a los suyos.

// cuándo camina (m/s) y cuánto puede apurar o frenar el paso
const WALK_V = 0.35;
// el horquillazo (Zombies slam: pega a los 0,75 s, termina a los 1,4 s): en el
// clip, las manos arriba a los 0,94 s y abajo (los dientes en el piso) a los 1,13 s
const SLAM_TOP = 0.94;
const SLAM_HIT = 1.13;
// el latigazo: la mano de la horquilla más rápida a los 0,87 s del clip; el
// juego suelta el golpe al final de whipWind (0,65 s)
const LASH_AT = 0.87;
// el salto con brazos y piernas abiertos: agachado del todo a los 0,7 s, se
// despega a los 0,85 s
const CROUCH = 0.7;
const TAKEOFF = 0.82;
// la brasa del fuego sobre la ropa (la paja, más)
const BURN = 0.6;
// de rodillas (la muerte y el final) la horquilla queda clavada al lado de la
// rodilla izquierda (m del modelo, mirando a +z): cerca de donde la escena la
// deja caer cuando se desarma
const PLANT = [0.52, 0.36];
// cuánto de la zancada del clip queda en la carga (el resto, piernas quietas)
const LEG_CHARGE = 0.55;
const CHAR = new THREE.Color(0x1a120c);

// El que está a la vista (para ui/FarmCinematic: la horquilla que suelta, de
// dónde sale el primer cuervo).
let shown = null;
export function scarecrowProp(name) {
  return shown?.root?.visible ? shown[name] || null : null;
}
// Cómo quedó el cuerpo a la vista (para que el final arranque donde murió, sin
// saltar): la cadera, la cabeza y hacia dónde mira (por la línea de los hombros).
// who: el jefe o títere que se dibujó así; pts: de dónde sale el fuego.
const FIRE_BONES = ['Hips', 'Spine01', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg'];
export function scarecrowPose() {
  const S = shown;
  if (!S?.root?.visible) return null;
  const B = S.bones;
  const at = (n) => B[n].getWorldPosition(new THREE.Vector3());
  const l = at('LeftArm');
  const r = at('RightArm');
  return { who: S.lastZ, hips: at('Hips'), head: at('Head'), chest: at('Spine'), pts: FIRE_BONES.filter((n) => B[n]).map(at), yaw: Math.atan2(-(l.z - r.z), l.x - r.x) };
}
const lum = (c) => c.r * 0.3 + c.g * 0.5 + c.b * 0.2;

// La horquilla: cabo de madera, virola y tres dientes de hierro oxidado,
// curvos (en metros del modelo; el agarre en el origen, los dientes para +y).
function buildFork() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5e4128, roughness: 0.82 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4e4640, roughness: 0.55, metalness: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 1.5, 8), wood);
  shaft.position.y = 0.3;
  g.add(shaft);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.1, 8), iron);
  ferrule.position.y = 1.08;
  g.add(ferrule);
  for (const x of [-1, 0, 1]) {
    const pts = [
      new THREE.Vector3(0, 1.1, 0),
      new THREE.Vector3(x * 0.07, 1.16, 0.005),
      new THREE.Vector3(x * 0.1, 1.28, 0.02),
      new THREE.Vector3(x * 0.105, 1.44, 0.06),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.01, 5), iron));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.07, 5), iron);
    tip.position.set(x * 0.105, 1.475, 0.068);
    tip.rotation.x = 0.25;
    g.add(tip);
  }
  // (con recorte: piezas rígidas, su esfera sirve)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// La horquilla en la mano, cada cuadro. Parado y caminando la lleva como un
// bastón (derecha, un poco hacia donde va el brazo); en el golpe y el
// latigazo sigue la línea del brazo (los dientes llegan al piso cuando pega);
// en la carga, como una lanza, para adelante y un poco abajo. off: por dónde
// la agarra (m del modelo desde el agarre de siempre hacia el cabo).
const fv = { hand: new THREE.Vector3(), fa: new THREE.Vector3(), arm: new THREE.Vector3(), fwd: new THREE.Vector3(), d: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), t: new THREE.Vector3(), m: new THREE.Matrix4() };
const UPV = new THREE.Vector3(0, 1, 0);
const fvq = new THREE.Quaternion();
function holdFork(S, z, dt) {
  const B = S.bones;
  const st = z?.state;
  const strike = st === 'slam' || st === 'whipWind' || st === 'whip' ? 1 : 0;
  const lance = st === 'charge' ? 1 : 0;
  // (atontado, colgado como una bolsa: la horquilla le cuelga de la mano)
  const hang = st === 'stunned' ? 1 : 0;
  const k = Math.min(1, dt * 8);
  S.fk += (strike - S.fk) * k;
  S.fl += (lance - S.fl) * k;
  S.fh = (S.fh || 0) + (hang - (S.fh || 0)) * k;
  const s = S.root.scale.x;
  B.LeftHand.getWorldPosition(fv.hand);
  B.LeftForeArm.getWorldPosition(fv.fa);
  fv.arm.copy(fv.hand).sub(fv.fa).normalize();
  const yaw = z?.yaw || 0;
  fv.fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  // bastón / línea del brazo / lanza
  const ks = Math.max(0, 1 - S.fk - S.fl - S.fh);
  fv.d.set(fv.arm.x * 0.5, 1, fv.arm.z * 0.5).addScaledVector(fv.fwd, 0.15).normalize().multiplyScalar(ks);
  fv.d.addScaledVector(fv.arm, S.fk);
  fv.t.copy(fv.fwd).addScaledVector(UPV, -0.14).addScaledVector(fv.arm, 0.2).normalize();
  fv.d.addScaledVector(fv.t, S.fl);
  fv.t.copy(fv.fwd).multiplyScalar(0.35).addScaledVector(UPV, -1);
  fv.d.addScaledVector(fv.t.normalize(), S.fh).normalize();
  // los dientes abiertos de costado (se ven los tres de frente)
  fv.x.crossVectors(fv.d, fv.fwd);
  if (fv.x.lengthSq() < 1e-4) fv.x.crossVectors(fv.d, UPV);
  fv.x.normalize();
  fv.z.crossVectors(fv.x, fv.d);
  fv.m.makeBasis(fv.x, fv.d, fv.z);
  const F = S.fork;
  F.quaternion.setFromRotationMatrix(fv.m);
  // el agarre (dónde la agarra, desde el agarre del modelo de la horquilla):
  // de bastón, por la mitad (el cabo casi en el piso); en el golpe y colgando,
  // del cabo
  const off = 0.32 * ks - 0.3 * S.fk - 0.1 * S.fl - 0.35 * S.fh;
  F.position.copy(fv.hand).addScaledVector(fv.arm, 0.07 * s).addScaledVector(fv.d, -off * s);
  // de rodillas: clavada en el piso a su lado, un poco inclinada para afuera
  S.fp = (S.fp || 0) + ((S.plant ? 1 : 0) - (S.fp || 0)) * Math.min(1, dt * 5);
  if (S.fp > 0.001 && z) {
    fv.d.set(0.1, 1, -0.05).applyAxisAngle(UPV, yaw).normalize();
    // (desde la cadera del modelo: arrodillado, el cuerpo no queda sobre z.pos)
    fv.t.set(PLANT[0], 0, PLANT[1]).applyAxisAngle(UPV, yaw).multiplyScalar(s).add(B.Hips.getWorldPosition(fv.x));
    fv.t.y = (z.baseY || 0) + 0.42 * s * fv.d.y;
    fv.x.crossVectors(fv.d, fv.fwd).normalize();
    fv.z.crossVectors(fv.x, fv.d);
    fv.m.makeBasis(fv.x, fv.d, fv.z);
    F.quaternion.slerp(fvq.setFromRotationMatrix(fv.m), S.fp);
    F.position.lerp(fv.t, S.fp);
  }
  S.root.worldToLocal(F.position);
}

// ---------------- el muñeco (encima de los clips) ----------------
// Lo que se le pone encima a cada clip, de 0 a 1 (cada estado dice cuánto;
// se va de uno a otro en un rato):
//  crossL/crossR: el brazo abierto en cruz (L: el de la horquilla, la izquierda del modelo)
//  flopL/flopR: el antebrazo suelto, colgando y bamboleándose
//  stiff: el tronco tieso como un palo (sin doblarse como una persona)
//  tilt: la cabeza caída de costado y suelta
//  wob: las rodillas flojas
//  limp: la bolsa vacía (se dobla, la cabeza cuelga, los brazos caen)
//  lean: inclinado para adelante (rad)
//  twitch: los tirones de hilo
const DEF = { crossL: 0.85, crossR: 0.95, flopL: 0.55, flopR: 1, stiff: 0.6, tilt: 1, wob: 0.6, limp: 0, lean: 0, twitch: 1 };
// (qué tan rápido cambia: los golpes, de un tirón)
const RATE = 7;
const want = (S, o, rate = RATE) => {
  S.tgt = Object.assign(S.tgtObj || (S.tgtObj = {}), DEF, o);
  S.rate = rate;
};

const oq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
const ov = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const oqK = new THREE.Quaternion();
const ovR = new THREE.Vector3();
const ovF = new THREE.Vector3();
const ID = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);

function ovReady(S) {
  const L = S.list;
  // (en el reposo, con el modelo en el origen: el mundo es el espacio del modelo)
  S.rp = L.map((d) => d.bone.getWorldPosition(new THREE.Vector3()));
  S.rel = L.map((d, i) => (d.pi >= 0 ? S.rp[i].clone().sub(S.rp[d.pi]) : new THREE.Vector3()));
  S.rinv = L.map((d) => d.rest.clone().invert());
  S.P = L.map(() => new THREE.Vector3());
  S.sub = L.map((_, i) => L.map((__, j) => j).filter((j) => {
    for (let k = j; k >= 0; k = L[k].pi) if (k === i) return true;
    return false;
  }));
  S.ix = Object.fromEntries(L.map((d, i) => [d.name, i]));
  S.ov = { ...DEF };
  want(S, {});
  S.hd = { p: 0, r: 0, vp: 0, vr: 0 };
  S.pend = { Left: null, Right: null };
  S.hv = new THREE.Vector3();
  S.ha = new THREE.Vector3();
  S.twT = 2;
  S.jk = 0;
  S.jkS = 1;
  S.ovT = 0;
}

// dónde queda cada hueso en el mundo con los giros de ahora (S.list[i].W)
function fk(S, hipsW, s) {
  const L = S.list;
  const P = S.P;
  P[0].copy(hipsW);
  for (let i = 1; i < L.length; i++) {
    const pi = L[i].pi;
    if (pi < 0) {
      P[i].copy(hipsW);
      continue;
    }
    oq[0].copy(L[pi].W).multiply(S.rinv[pi]);
    P[i].copy(S.rel[i]).multiplyScalar(s).applyQuaternion(oq[0]).add(P[pi]);
  }
}
// gira un hueso y todo lo que cuelga de él (alrededor de su articulación)
function turnSub(S, i, q) {
  for (const j of S.sub[i]) S.list[j].W.premultiply(q);
}
// hacia dónde va el hueso i (de su articulación a la del hijo c), en el mundo
function dirOf(S, i, c, out) {
  oq[1].copy(S.list[i].W).multiply(S.rinv[i]);
  return out.copy(S.rel[c]).applyQuaternion(oq[1]).normalize();
}
// gira el hueso i (y lo de abajo) para que apunte de 'from' a 'to', k de 0 a 1
function aimSub(S, i, from, to, k) {
  if (k <= 1e-3) return;
  oq[2].setFromUnitVectors(from, to);
  // (no slerpQuaternions(ID, oq[2]): copia ID encima de oq[2] antes de mezclar)
  if (k < 1) oq[2].copy(oqK.identity().slerp(oq[2], k));
  turnSub(S, i, oq[2]);
}

// Lo del muñeco, cada cuadro, sobre la mezcla de los clips.
function puppet(S, dt, s, hipsW) {
  if (!S.P) return;
  const o = S.ov;
  const T = S.tgt;
  const L = S.list;
  const ix = S.ix;
  dt = Math.min(dt, 0.1);
  const kr = Math.min(1, dt * S.rate);
  for (const k in DEF) o[k] += (T[k] - o[k]) * kr;
  const time = (S.ovT += dt);
  // lo que acelera la cadera (para la cabeza y los antebrazos)
  if (S.hp && dt > 0) {
    const vx = (hipsW.x - S.hp.x) / dt;
    const vy = (hipsW.y - S.hp.y) / dt;
    const vz = (hipsW.z - S.hp.z) / dt;
    // (un salto de lugar, un Fast restart: nada)
    if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < 60) {
      const k = Math.min(1, dt * 12);
      ov[0].set((vx - S.hv.x) / dt, (vy - S.hv.y) / dt, (vz - S.hv.z) / dt).clampLength(0, 40);
      S.ha.lerp(ov[0], k);
      S.hv.x += (vx - S.hv.x) * k;
      S.hv.y += (vy - S.hv.y) * k;
      S.hv.z += (vz - S.hv.z) * k;
    }
  }
  (S.hp ||= new THREE.Vector3()).copy(hipsW);
  const hipsD = oq[3].copy(L[0].W).multiply(S.rinv[0]);
  const right = ovR.copy(AX).applyQuaternion(hipsD);
  const fwd = ovF.copy(AZ).applyQuaternion(hipsD);

  // el tronco tieso: la columna sigue a la cadera, como un palo
  if (o.stiff > 0.01) {
    for (const nm of ['Spine02', 'Spine01', 'Spine']) {
      const i = ix[nm];
      const W = L[i].W;
      oq[0].copy(hipsD).multiply(L[i].rest);
      oq[1].copy(W).slerp(oq[0], o.stiff);
      oq[2].copy(W).invert().premultiply(oq[1]);
      turnSub(S, i, oq[2]);
    }
  }
  // doblado para adelante (la bolsa vacía, la carga) y, colgado, se mece
  const fold = o.limp * 1.0 + o.lean;
  if (Math.abs(fold) > 0.01) {
    oq[0].setFromAxisAngle(right, fold / 3);
    for (const nm of ['Spine02', 'Spine01', 'Spine']) turnSub(S, ix[nm], oq[0]);
  }
  if (o.limp > 0.01) {
    oq[0].setFromAxisAngle(fwd, o.limp * 0.1 * Math.sin(time * 1.3));
    turnSub(S, ix.Spine02, oq[0]);
  }
  fk(S, hipsW, s);

  // los brazos en cruz (en la bolsa vacía, caídos)
  const chest = oq[3].copy(L[ix.Spine].W).multiply(S.rinv[ix.Spine]);
  for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
    const a = ix[side + 'Arm'];
    const f = ix[side + 'ForeArm'];
    const cross = side === 'Left' ? o.crossL : o.crossR;
    const k = Math.max(cross, o.limp);
    if (k < 0.01) continue;
    const cur = dirOf(S, a, f, ov[3]);
    // (un poco caído y apenas adelante; colgando, para abajo y un poco afuera)
    const to = ov[4].set(sg, -0.14 - 0.06 * Math.sin(time * 0.9 + sg), 0.1).normalize().applyQuaternion(chest);
    if (o.limp > 0.01) {
      ov[0].set(sg * 0.22, 0, 0.18).applyQuaternion(chest).add(DOWN).normalize();
      to.lerp(ov[0], o.limp / k).normalize();
    }
    aimSub(S, a, cur, to, k);
  }
  fk(S, hipsW, s);

  // los antebrazos sueltos: un péndulo cada uno (cuelgan del codo, se mecen
  // con lo que se mueve el cuerpo; el clip los tira un poco)
  const sub = Math.max(1, Math.min(6, Math.ceil(dt / 0.008)));
  const h = dt / sub;
  for (const side of ['Left', 'Right']) {
    const fl = Math.max(side === 'Left' ? o.flopL : o.flopR, o.limp);
    const f = ix[side + 'ForeArm'];
    const hd = ix[side + 'Hand'];
    const E = S.P[f];
    const len = S.rel[hd].length() * s * 1.3;
    const clip = dirOf(S, f, hd, ov[3]);
    let p = S.pend[side];
    if (!p || dt <= 0 || p.x.distanceTo(E) > len * 3) {
      p = S.pend[side] = { x: E.clone().addScaledVector(clip, len), v: new THREE.Vector3() };
    }
    if (fl < 0.01) {
      p.x.copy(E).addScaledVector(clip, len);
      p.v.set(0, 0, 0);
      continue;
    }
    // (cuánto lo lleva el clip: suelto del todo, casi nada)
    const ks = 4 + (1 - fl) * 120;
    for (let n = 0; n < sub; n++) {
      ov[0].copy(E).addScaledVector(clip, len).sub(p.x).multiplyScalar(ks);
      ov[0].y -= 9.8;
      ov[0].addScaledVector(p.v, -2.2);
      p.v.addScaledVector(ov[0], h);
      p.x.addScaledVector(p.v, h);
      // (atado al codo: el largo del antebrazo; se le saca lo que iba para afuera)
      ov[1].copy(p.x).sub(E).normalize();
      p.x.copy(E).addScaledVector(ov[1], len);
      p.v.addScaledVector(ov[1], -p.v.dot(ov[1]));
    }
    const u = ov[1].copy(p.x).sub(E).normalize();
    // (que no se meta para adentro del brazo: el codo no se dobla del todo)
    const up = dirOf(S, ix[side + 'Arm'], f, ov[4]);
    const back = -u.dot(up);
    if (back > 0.75) u.addScaledVector(up, back - 0.75).normalize();
    aimSub(S, f, clip, u, fl);
    // la mano floja, para abajo
    fk(S, hipsW, s);
    const hdir = dirOf(S, f, hd, ov[3]);
    ov[4].copy(hdir).addScaledVector(DOWN, 0.9).normalize();
    aimSub(S, hd, hdir, ov[4], 0.5 * fl);
  }

  // los tirones de hilo: cada tanto la cabeza se endereza de golpe y vuelve a
  // caer, y los antebrazos saltan
  S.twT -= dt * (0.6 + o.limp);
  if (S.twT <= 0) {
    S.twT = 1.6 + Math.random() * 3.8;
    const k = o.twitch;
    S.hd.vr += (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5) * k;
    S.hd.vp -= (3 + Math.random() * 4) * k;
    // (y el tronco, de costado, como tirado de un hilo)
    S.jk = k;
    S.jkS = Math.random() < 0.5 ? -1 : 1;
    for (const side of ['Left', 'Right']) {
      const p = S.pend[side];
      if (p) p.v.add(ov[0].set(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(4 * k));
    }
  }

  if (S.jk > 0.01) {
    S.jk *= Math.exp(-dt * 9);
    oq[0].setFromAxisAngle(fwd, 0.16 * S.jk * S.jkS);
    turnSub(S, ix.Spine02, oq[0]);
    fk(S, hipsW, s);
  }

  // la cabeza: caída de costado (para el lado de la horquilla, lejos del
  // cuervo) y suelta: un resorte que cabecea con los saltos y los frenazos
  const H = S.hd;
  const tilt = o.tilt;
  const p0 = 0.14 * tilt + o.limp * 0.75;
  const r0 = -0.48 * tilt - o.limp * 0.2;
  const aFwd = S.ha.dot(ov[0].copy(fwd).setY(0).normalize());
  const aSide = S.ha.dot(ov[0].copy(right).setY(0).normalize());
  const dp = -40 * (H.p - p0) - 5 * H.vp + (S.ha.y * 0.22 - aFwd * 0.15) * (0.4 + tilt);
  const dr = -34 * (H.r - r0) - 4 * H.vr + aSide * 0.2 * (0.4 + tilt);
  H.vp += dp * dt;
  H.vr += dr * dt;
  H.p = Math.max(-0.7, Math.min(1.2, H.p + H.vp * dt));
  H.r = Math.max(-0.95, Math.min(0.95, H.r + H.vr * dt));
  const hk = Math.min(1, tilt + o.limp);
  if (hk > 0.01) {
    const chest2 = oq[3].copy(L[ix.Spine].W).multiply(S.rinv[ix.Spine]);
    const ax = ov[3].copy(AX).applyQuaternion(chest2);
    const az = ov[4].copy(AZ).applyQuaternion(chest2);
    oq[0].setFromAxisAngle(ax, H.p * hk).premultiply(oq[1].setFromAxisAngle(az, H.r * hk));
    oq[1].slerpQuaternions(ID, oq[0], 0.35);
    turnSub(S, ix.neck, oq[1]);
    oq[1].slerpQuaternions(ID, oq[0], 0.65);
    turnSub(S, ix.Head, oq[1]);
  }

  // las rodillas flojas: la pierna gira alrededor de la línea cadera-tobillo
  // (el pie no se mueve: la rodilla se va para adentro y para afuera)
  if (o.wob > 0.01) {
    for (const [side, ph] of [['Left', 0], ['Right', 2.1]]) {
      const u = ix[side + 'UpLeg'];
      const ft = ix[side + 'Foot'];
      const ax = ov[3].copy(S.P[ft]).sub(S.P[u]).normalize();
      const a = o.wob * (0.32 * Math.sin(time * 3.1 + ph) + 0.14 * Math.sin(time * 7.7 + ph * 2));
      oq[0].setFromAxisAngle(ax, a);
      // (las suelas, como en el clip)
      oq[1].copy(L[ft].W);
      oq[2].copy(L[ix[side + 'ToeBase']].W);
      L[u].W.premultiply(oq[0]);
      L[ix[side + 'Leg']].W.premultiply(oq[0]);
      L[ft].W.copy(oq[1]);
      L[ix[side + 'ToeBase']].W.copy(oq[2]);
    }
  }
}

// La caída del final: de rodillas se va de boca al piso como un palo que se
// suelta (cada vez más rápido), pega y rebota un poco. Gira todo menos las
// canillas alrededor de la línea de las rodillas (que quedan en el piso).
const FALL_A = 1.3;
const FALL_T = 1.05;
function toppleA(t) {
  if (t < FALL_T) return FALL_A * (t / FALL_T) ** 2;
  const u = t - FALL_T;
  return FALL_A - 0.12 * Math.abs(Math.sin(u * 7)) * Math.exp(-u * 4);
}
const tq = new THREE.Quaternion();
const tqi = new THREE.Quaternion();
// hacia dónde mira la cadera (en el piso) y el eje de la caída
function fallAxis(S, out) {
  const f = ov[1].copy(AZ).applyQuaternion(oq[0].copy(S.list[0].W).multiply(S.rinv[0])).setY(0);
  if (f.lengthSq() < 1e-6) return null;
  return out.crossVectors(UPV, f.normalize()).normalize();
}
function topple(S, s, hipsW, a) {
  if (a < 1e-3) return;
  const ix = S.ix;
  fk(S, hipsW, s);
  const piv = ov[0].copy(S.P[ix.LeftLeg]).add(S.P[ix.RightLeg]).multiplyScalar(0.5);
  const ax = fallAxis(S, ov[2]);
  if (!ax) return;
  tq.setFromAxisAngle(ax, a);
  tqi.copy(tq).invert();
  turnSub(S, 0, tq);
  turnSub(S, ix.LeftLeg, tqi);
  turnSub(S, ix.RightLeg, tqi);
  hipsW.sub(piv).applyQuaternion(tq).add(piv);
}
// Dónde queda el pecho cuando se va de boca desde como está ahora (la pila de
// paja del final va ahí: ahí se hunde).
export function scarecrowFallEnd() {
  const S = shown;
  if (!S?.root?.visible || !S.ix) return null;
  const B = S.bones;
  const at = (n) => B[n].getWorldPosition(new THREE.Vector3());
  const piv = at('LeftLeg').add(at('RightLeg')).multiplyScalar(0.5);
  const ax = fallAxis(S, new THREE.Vector3());
  if (!ax) return null;
  return at('Spine').sub(piv).applyAxisAngle(ax, FALL_A).add(piv);
}

// Las piernas más cortas (la carga: el clip estira el paso y el pie de atrás
// subía hasta la cadera; pedido del usuario 2026-10-01): el muslo y la rodilla
// se acercan a como cuelgan quietos, k de 0 (quietos) a 1 (como el clip).
const lq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function calmLegs(S, k) {
  const L = S.list;
  const ix = S.ix;
  const hipsD = lq[0].copy(L[0].W).multiply(S.rinv[0]);
  for (const side of ['Left', 'Right']) {
    const u = ix[side + 'UpLeg'];
    const n = ix[side + 'Leg'];
    // (la rodilla, en su propio giro respecto del muslo, antes de mover el muslo)
    const knee = lq[1].copy(L[u].W).invert().multiply(L[n].W);
    const kneeRest = lq[2].copy(L[u].rest).invert().multiply(L[n].rest);
    knee.slerp(kneeRest, 1 - k);
    // el muslo
    oq[0].copy(hipsD).multiply(L[u].rest);
    oq[1].copy(L[u].W).slerp(oq[0], 1 - k);
    oq[2].copy(L[u].W).invert().premultiply(oq[1]);
    turnSub(S, u, oq[2]);
    // la rodilla
    oq[1].copy(L[u].W).multiply(knee);
    oq[2].copy(L[n].W).invert().premultiply(oq[1]);
    turnSub(S, n, oq[2]);
  }
}

// El tiro del zapallo (Arena: castIn, lo que falta para que salga; castAt,
// cuando salió): quieto, las dos manos arriba como en el horquillazo (el clip
// 'golpe', con el zapallo prendido en la derecha), tiembla arriba y lo revolea
// para adelante (sin bajar hasta el piso). THROW_WIND: Arena CAST.scarecrow.
const THROW_WIND = 0.9;
const THROW_REL = 1.04;
function throwT(z, g) {
  const since = g.time - (z.castAt ?? -99);
  if (since >= 0 && since < 0.5) return SLAM_TOP + Math.min(1, since / 0.1) * (THROW_REL - SLAM_TOP);
  const ci = z.castIn;
  if (ci == null || ci <= 0 || ci >= THROW_WIND) return null;
  const u = 1 - ci / THROW_WIND;
  return u < 0.75 ? 0.38 + (u / 0.75) * (SLAM_TOP - 0.38) : SLAM_TOP + Math.sin(u * 60) * 0.012;
}
// el zapallo en la mano mientras arma el tiro (uno de los de la pelea del Prado)
const pv = new THREE.Vector3();
function heldPumpkin(S, z, g) {
  const ci = z?.castIn;
  const on = !!z && !z.dead && (z.state === 'chase' || z.state === 'toLock') && ci != null && ci > 0 && ci < THROW_WIND && !!g?.arena?.fireballMesh && g.cine?.sc !== z;
  if (!S.pump && on) {
    S.pump = g.arena.fireballMesh();
    S.pump.traverse((o) => (o.frustumCulled = false));
  }
  if (!S.pump) return;
  if (S.pump.parent !== g.scene) g.scene.add(S.pump);
  S.pump.visible = on;
  if (!on) return;
  const u = 1 - ci / THROW_WIND;
  const B = S.bones;
  const s = S.root.scale.x;
  // (en la palma: pasando la muñeca)
  B.RightHand.getWorldPosition(S.pump.position);
  B.RightForeArm.getWorldPosition(pv);
  pv.subVectors(S.pump.position, pv).normalize();
  S.pump.position.addScaledVector(pv, 0.13 * s);
  // (aparece prendiéndose: de chico a grande)
  S.pump.scale.setScalar(1.3 * Math.min(1, 0.2 + u * 3));
  S.pump.rotation.y += 0.05;
  if (Math.random() < 0.6) g.fx.fire(S.pump.position, 0.25, 1);
}

// el horquillazo: se estira (las dos manos arriba), tiembla arriba y baja de
// golpe justo cuando pega; después, el clip
function slamT(t) {
  const t0 = SLAM_HIT - 0.75 + 0.0;
  if (t < 0.42) return t0 + (t / 0.42) * (SLAM_TOP - t0);
  if (t < 0.66) return SLAM_TOP + Math.sin(t * 70) * 0.015;
  if (t < 0.75) return SLAM_TOP + ((t - 0.66) / 0.09) * (SLAM_HIT - SLAM_TOP);
  return SLAM_HIT + (t - 0.75);
}
// el latigazo (whipWind 0,65 s y whip 0,45 s): se tuerce, se queda temblando
// y suelta el giro con la horquilla de un tirón
function lashT(st, t) {
  if (st === 'whip') return LASH_AT + t * 1.05;
  if (t < 0.5) return 0.18 + (t / 0.5) * 0.42;
  if (t < 0.58) return 0.6 + Math.sin(t * 70) * 0.012;
  return 0.6 + ((t - 0.58) / 0.07) * (LASH_AT - 0.6);
}

export default {
  kind: 'scarecrow',
  dir: 'scarecrow',
  loops: ['quieto', 'caminar', 'carga', 'rodillas'],
  // el latigazo sale de la mano de la horquilla (Zombies.whipFx)
  alias: { whip: 'LeftHand' },

  ready(S) {
    S.root.updateMatrixWorld(true);
    ovReady(S);
    S.root.traverse((o) => {
      if (o.isSkinnedMesh) S.mat = o.material;
    });
    // la horquilla en la izquierda del modelo (la pieza 6, la del rebenque):
    // cuelga del modelo y cada cuadro va a la mano (after: hacia dónde apunta)
    S.fork = buildFork();
    S.root.add(S.fork);
    S.fk = 0;
    S.fl = 0;
    // (sin el cuervo del hombro: pedido del usuario 2026-10-01)
    // el fuego del final: la brasa en la ropa y la paja, y el carbón (uniforms:
    // el programa es uno solo, prendido o apagado)
    S.burnU = { value: new THREE.Color(0) };
    S.charU = { value: 0 };
    if (S.mat) {
      S.mat.onBeforeCompile = (sh) => {
        sh.uniforms.uBurn = S.burnU;
        sh.uniforms.uChar = S.charU;
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform vec3 uBurn;\nuniform float uChar;\nvoid main() {')
          .replace('#include <map_fragment>', '#include <map_fragment>\n\tfloat sLum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));\n\tdiffuseColor.rgb *= 1.0 - uChar * 0.85;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uBurn * (0.25 + smoothstep(0.2, 0.55, sLum)) * (1.0 - uChar * 0.5);');
      };
      S.mat.customProgramCacheKey = () => 'scarecrowSkin';
      S.mat.needsUpdate = true;
    }
  },

  // La pelea y el final (la escena arma su Espantapájaros como jefe).
  pick(z, { S, dt, s, g }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    S.dy = 0;
    S.plant = false;
    S.tp = null;
    S.legK = 1;
    // el final: de rodillas, mira al cielo, en cruz, se cae y se hunde
    const F = g.cine;
    if (F?.sc === z) {
      S.plant = true;
      // (al entrar al final, de rodillas de una: sin fundirse con la muerte de la
      // pelea, que el títere ya quedó puesto donde cayó y como cayó)
      if (S.cPose == null) S.layers.length = 0;
      const pose = F.fallT != null ? 'fall' : F.scPose;
      if (pose !== S.cPose) {
        S.cPose = pose;
        S.cT = 0;
      } else S.cT += dt;
      switch (pose) {
        // mira al cielo: la cabeza se levanta sola (sin el muñeco encima)
        case 'look':
          want(S, { crossL: 0, crossR: 0, flopL: 0.3, flopR: 0.3, stiff: 0, tilt: 0.15, wob: 0, twitch: 0.3 }, 2.5);
          return { key: 'mira', t: clampT(S, 'mira', S.cT) };
        // en cruz mientras arde: los antebrazos le cuelgan
        case 'cross':
          want(S, { crossL: 0, crossR: 0, flopL: 0.45, flopR: 0.45, stiff: 0, tilt: 0.35, wob: 0, twitch: 0.6 }, 3);
          return { key: 'cruz', t: clampT(S, 'cruz', S.cT) };
        // se desarma como una bolsa vacía: de rodillas como está, se va de boca
        // al piso (sin pararse ni morirse otra vez: el clip 'cae' lo levantaba)
        // y ya tirado se hunde (rootY, después de la caída)
        case 'fall':
          S.dy = z.P.rootY || 0;
          S.tp = S.cT;
          want(S, { crossL: 0, crossR: 0, stiff: 0, tilt: 0.6, wob: 0, limp: 0.6, twitch: 0 }, 5);
          return { key: 'rodillas', t: null };
      }
      // de rodillas, doblado y con la cabeza colgando (como quedó al morir)
      want(S, { crossL: 0, crossR: 0, stiff: 0, wob: 0, limp: 0.55, twitch: 0.5 }, 3);
      return { key: 'rodillas', t: null };
    }
    S.cPose = null;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      // (al caer de rodillas clava la horquilla y se afloja: la bolsa vacía)
      S.plant = S.deadT > 0.9;
      want(S, S.deadT > 1.1 ? { crossL: 0, crossR: 0, stiff: 0, wob: 0, limp: 0.55, twitch: 0.5 } : { crossL: 0, crossR: 0, flopL: 0.8, stiff: 0, wob: 0, tilt: 0.6, twitch: 0 }, S.deadT > 1.1 ? 2 : 8);
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    // (el primer 'intro' es cuando sale de la tierra; después, el que le da
    // cada tanto un golpe: Zombies hitBoss)
    if (st === 'intro' && S.seenZ !== z) {
      S.seenZ = z;
      S.rise = true;
    } else if (st !== 'intro') S.rise = false;
    switch (st) {
      case 'intro':
        // sale de la tierra de un salto, con brazos y piernas abiertos
        if (S.rise) {
          want(S, { crossL: 0.35, crossR: 0.35, flopL: 0.8, wob: 0.3 }, 9);
          return { key: 'salto', t: clampT(S, 'salto', CROUCH - 0.15 + Tt) };
        }
      // falls through: el grito al cielo con las dos manos (llama a los cuervos)
      case 'summon':
      case 'enrage':
      case 'howl':
        want(S, { crossL: 0, crossR: 0, flopL: 0.35, flopR: 0.5, stiff: 0.3, tilt: 0.45 }, 9);
        return { key: 'grito', t: clampT(S, 'grito', 0.15 + Tt) };
      // agazapado, temblando, antes de saltar adelante (0,85 s)
      case 'chargeWind': {
        want(S, { crossL: 0.45, crossR: 0.45, stiff: 0.1, wob: 0.9, tilt: 0.6, lean: 0.5 }, 9);
        const t = Tt < 0.55 ? 0.25 + (Tt / 0.55) * (CROUCH - 0.25) : CROUCH + Math.sin(Tt * 60) * 0.012;
        return { key: 'salto', t };
      }
      // la carga: saltos largos, agachado, la horquilla de lanza (al paso)
      // (las piernas, más cortas que en el clip: calmLegs; con el paso más corto
      // va más ligero y los pies en el piso)
      case 'charge':
        want(S, { crossL: 0.2, crossR: 0.7, flopL: 0.2, stiff: 0.2, wob: 0.5, lean: 0.15 }, 9);
        S.legK = LEG_CHARGE;
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.8, Math.min(2.1, S.v / (C.carga.speed * s * LEG_CHARGE)));
        return { key: 'carga', t: S.chargeT % C.carga.dur, feet: true };
      // el horquillazo de arriba, con las dos manos (los dientes en el piso a los 0,75 s)
      case 'slam':
        want(S, { crossL: 0, crossR: 0, flopL: 0.1, flopR: 0.35, stiff: 0, tilt: 0.55, wob: 0.2, twitch: 0 }, 12);
        return { key: 'golpe', t: clampT(S, 'golpe', slamT(Tt)) };
      // el latigazo, girando con los brazos abiertos (la horquilla adelante)
      case 'whipWind':
      case 'whip':
        want(S, { crossL: 0, crossR: 0.45, flopL: 0.1, flopR: 0.9, stiff: 0.1, tilt: 0.6, wob: 0.2, twitch: 0 }, 12);
        return { key: 'latigo', t: clampT(S, 'latigo', lashT(st, Tt)) };
      // atontado: colgado como una bolsa vacía, se mece y da tirones
      case 'stunned':
        want(S, { crossL: 0, crossR: 0, stiff: 0.3, wob: 0.4, limp: 1, twitch: 1.4 }, 6);
        S.idleT = (S.idleT || 0) + dt * 0.6;
        return { key: 'quieto', t: S.idleT % C.quieto.dur };
      // bajo tierra (entities/bossMoves.js): se afloja y se hunde; sale de un salto
      case 'burrow':
        S.dy = z.P.rootY || 0;
        want(S, { crossL: 0, crossR: 0, stiff: 0, wob: 0, limp: 0.7, twitch: 0.3 }, 5);
        return { key: 'ruge', t: clampT(S, 'ruge', 3.9 + Tt) };
      case 'emerge':
        S.dy = z.P.rootY || 0;
        want(S, { crossL: 0.35, crossR: 0.35, flopL: 0.8, wob: 0.3 }, 9);
        return { key: 'salto', t: clampT(S, 'salto', TAKEOFF - 0.05 + Tt) };
      case 'chase':
      case 'toLock': {
        const th = throwT(z, g);
        if (th != null) {
          want(S, { crossL: 0, crossR: 0, flopL: 0.1, flopR: 0.1, stiff: 0, tilt: 0.35, wob: 0.15, twitch: 0 }, 10);
          return { key: 'golpe', t: clampT(S, 'golpe', th) };
        }
        // camina a saltitos (el paso, al que anda)
        if (S.v > WALK_V) {
          want(S, {});
          S.walkT = (S.walkT || 0) + dt * Math.max(0.6, Math.min(1.5, S.v / (C.caminar.speed * s)));
          return { key: 'caminar', t: S.walkT % C.caminar.dur };
        }
        // parado: se balancea como en el palo
        want(S, { crossL: 0.9, wob: 0.3 });
        S.idleT = (S.idleT || 0) + dt;
        return { key: 'quieto', t: S.idleT % C.quieto.dur };
      }
    }
    return { key: 'rig' };
  },

  cine() {
    return { key: 'rig' };
  },

  // hundido (bajo tierra, en la pila de paja): lo que baja el de piezas; y lo
  // del muñeco encima de los clips
  adjust(S, ctx, z, qYaw, hipsW) {
    if (S.dy) hipsW.y += S.dy;
    if (S.layers.some((L) => L.key === 'rig' && L.w > 0.5)) return;
    // (la caída del final, antes del muñeco: los brazos flojos cuelgan hacia el piso)
    if (S.tp != null && S.P) topple(S, ctx.s, hipsW, toppleA(S.tp));
    if (S.legK < 1 && S.P) calmLegs(S, S.legK);
    puppet(S, ctx.dt, ctx.s, hipsW);
  },

  // La horquilla, como la del de piezas; el fuego y el carbón.
  after(S, { zs, dt, g }, z) {
    shown = S;
    S.lastZ = z;
    holdFork(S, z, dt);
    heldPumpkin(S, z, g);
    const R = zs.bossRig;
    if (!R) return;
    S.fork.visible = R.parts[17].children.some((o) => o.visible);
    const BM = zs.bossMats;
    if (!BM || !S.mat) return;
    const c = BM.cloth;
    S.burnU.value.copy(c.emissive || CHAR).multiplyScalar((c.emissiveIntensity || 0) * BURN);
    const L = lum(c.color);
    if (!(c.emissiveIntensity > 0) && (S.cloth0 == null || L > S.cloth0)) S.cloth0 = L;
    const L0 = S.cloth0 ?? L;
    S.charU.value = Math.max(0, Math.min(1, (L0 - L) / Math.max(1e-3, L0 - lum(CHAR))));
  },
};
