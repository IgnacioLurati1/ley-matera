import * as THREE from 'three';
import { clampT } from '../bossSkin';

// El Caballero Negro con cuerpo de verdad (entities/bossSkin.js): el minijefe
// del castillo y los cuatro de la vanguardia (entities/castle/Vanguardia.js),
// cada uno con su plaga. Un solo modelo de Meshy (armadura ennegrecida, el
// yelmo con la ranura encendida, el penacho y el poncho colorado); los clips
// son suyos, de la biblioteca de Meshy sobre su esqueleto: quieto (resopla
// y mira), guardia (la rodela arriba), grito (llega levantando la lanza),
// llama (se golpea la rodela: llama a los muertos, se enfurece), grita
// (pisotea antes de cargar), golpe (la lanza contra el piso con todo),
// estocada, dolor (se agarra el yelmo) y muere (cae de rodillas y de boca).
// Los que van con la lanza, espejados: la lanza va en la izquierda del modelo.
//
// Nunca corre: la armadura pesa. Camina a trancos largos (el paso del clip
// agrandado, los brazos casi quietos, el cuerpo cargado sobre la pierna de
// apoyo) y la carga es el mismo tranco más largo todavía, agachado, con la
// rodela y la lanza al frente. El paso va a lo que anda de verdad.
//
// Lo que no es clip:
// - La lanza: la de las piezas (pieza 17), en la mano izquierda del modelo
//   (la derecha del de piezas).
// - La rodela: la de las piezas (en la pieza 5, el antebrazo del otro lado),
//   atada por fuera del antebrazo derecho del modelo, mirando para afuera.
// - La plaga: la armadura toma el tono de la suya (los ojos ya los cambia
//   bossMoves.updatePlague: el mismo material del de piezas).

// la estocada: cuándo llega la lanza al frente (s del clip: antes la lleva para atrás)
const THRUST = 0.9;
// (el usuario, 2026-10-01: "es una armadura, no debería poder moverse tanto")
// los ataques: el cuerpo quieto y plantado (STAB_BASE) y solo los brazos de
// la estocada encima (adjust), de STAB_IN s antes del golpe a STAB_OUT s
// después, con rampa de STAB_RAMP s en cada punta; el torso apenas acompaña
const STAB_IN = 0.4;
const STAB_OUT = 0.45;
const STAB_RAMP = 0.15;
const STAB_BASE = 0.5;
// (huesos de clips.json: los dos brazos y el tronco)
const STAB_ARMS = [6, 7, 8, 9, 10, 11, 12, 13];
const STAB_SPINE = [1, 2, 3];
const STAB_ARM_W = 0.9;
const STAB_SPINE_W = 0.25;
const qs = new THREE.Quaternion();
const qs2 = new THREE.Quaternion();
// andando: desde WALK_V (m/s del modelo, sin escala) camina; más despacio, quieto
const WALK_V = 0.3;
// la rodela: dónde va en el antebrazo (0 el codo, 1 la muñeca) y cuánto se aparta
const SHIELD_AT = 0.55;
const SHIELD_OUT = 0.09;
// (la de las piezas es enorme para el cuerpo de verdad)
const SHIELD_K = 0.72;
// el tono de cada plaga (Sequía, Helada, Granizo, Langosta): color de la
// armadura y un brillo muy leve del mismo color
// (apenas: la armadura sigue negra y el poncho colorado; lo fuerte son los
// ojos y lo que larga cada plaga)
const PLAGUE = [
  { color: 0xfff0e0, glow: 0x301004, k: 0.2 },
  { color: 0xdde8ff, glow: 0x0a2440, k: 0.3 },
  { color: 0xf0f2f8, glow: 0x20242c, k: 0.15 },
  { color: 0xf0f4d8, glow: 0x182408, k: 0.2 },
];

// Las animaciones de siempre (las del de piezas, Zombies.js: el paso, el
// golpe, la carga, el grito, la muerte) puestas en el modelo: el usuario
// (2026-10-01) prefirió esas a los clips ("no me convencen, volvé a las
// originales y adaptalas al nuevo modelo"). false: los clips de abajo.
const ORIGINAL = true;

const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const n = new THREE.Vector3();
const u = new THREE.Vector3();
const sc = new THREE.Vector3();
const q = new THREE.Quaternion();
const qd = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();

// Un ataque (k: segundos desde el golpe): quieto, con los brazos de la estocada.
function stab(S, k) {
  const e = Math.min(k + STAB_IN, STAB_OUT - k);
  S.stabW = e <= 0 ? 0 : Math.min(1, e / STAB_RAMP);
  S.stabT = clampT(S, 'estocada', THRUST + Math.max(-STAB_IN, Math.min(STAB_OUT, k)) * 0.9);
  return { key: 'quieto', t: STAB_BASE };
}

// Un hueso de un clip en el tiempo t (el giro en el mundo, sin el rumbo).
function boneAt(S, key, i, t, out) {
  const cl = S.clips[key];
  const f = Math.max(0, t) * S.fps;
  const f0 = Math.min(cl.n - 1, Math.floor(f));
  const f1 = Math.min(cl.n - 1, f0 + 1);
  out.fromArray(cl.q, (f0 * S.nb + i) * 4);
  qs2.fromArray(cl.q, (f1 * S.nb + i) * 4);
  return out.slerp(qs2, f - Math.floor(f));
}

// ida y vuelta (los clips que no cierran la vuelta)
const pingpong = (t, d) => {
  const w = t % (2 * d);
  return w < d ? w : 2 * d - w;
};

// Andando: camina o se queda quieto (el paso, con lo que avanza de verdad).
function move(S, dt, s, z) {
  const C = S.clips;
  const vm = Math.min(S.v, (z.speed || 4) * 1.3) / Math.max(0.1, s);
  if (vm > WALK_V) {
    S.walkT = (S.walkT || 0) + (dt * Math.max(0.5, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

// La armadura del tono de la plaga (null: la de siempre).
function tint(S, p) {
  const P = p == null ? null : PLAGUE[p];
  S.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const m = o.material;
    m.color.set(P ? P.color : 0xffffff);
    m.emissive.set(P ? P.glow : 0x000000);
    m.emissiveIntensity = P ? P.k : 0;
  });
}

export default {
  kind: 'caballero',
  dir: 'caballero',
  loops: ['quieto', 'guardia', 'caminar', 'carga'],
  // la lanza (la pieza 17 de las piezas) en la izquierda del modelo
  hand: { part: 17, fore: 'LeftForeArm', bone: 'LeftHand' },
  alias: { whip: 'LeftHand' },

  pick(z, { S, dt, s }) {
    if (ORIGINAL) return { key: 'rig' };
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // llega levantando la lanza y gritando
      case 'intro':
        return { key: 'grito', t: clampT(S, 'grito', 0.5 + Tt) };
      // llama a los muertos / se enfurece: se golpea la rodela con la lanza
      case 'summon':
      case 'enrage':
        // (el golpe en la rodela a los 3,4 s del clip: justo cuando termina)
        return { key: 'llama', t: clampT(S, 'llama', (st === 'summon' ? 2.2 : 1.9) + Tt) };
      // los ataques (el golpe pega a los 0,75 s, el rebenque al pasar a 'whip',
      // la estocada del asedio contra el rastrillo a los 0,75 s): todos cortos
      case 'slam':
        return stab(S, Tt - 0.75);
      case 'locking':
        return stab(S, (Tt % 0.8) - 0.4);
      case 'whipWind':
        return stab(S, Tt - 0.65);
      case 'whip':
        return stab(S, Tt);
      case 'lance':
        return stab(S, Tt - 0.75);
      // pisotea el piso como un toro (0,85 s) y sale agachado, la rodela al frente
      case 'chargeWind':
        return { key: 'grita', t: clampT(S, 'grita', (Tt * C.grita.dur) / 0.85) };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.6, S.v / (C.carga.speed * Math.max(0.1, s)));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      // atontado (se dio contra la pared): se agarra el yelmo y se tambalea
      case 'stunned':
        return { key: 'dolor', t: pingpong(0.2 + Math.max(0, Tt), 2.6) };
    }
    if (st !== 'chase' && st !== 'toLock') return { key: 'rig' };
    if (z.holdT > 0) {
      S.idleT = (S.idleT || 0) + dt;
      return { key: 'guardia', t: S.idleT % C.guardia.dur };
    }
    return move(S, dt, s, z);
  },

  // Muerto, se hunde como el de piezas.
  adjust(S, ctx, z, qYaw, hipsW) {
    // (con las de siempre, la cadera y todo ya vienen de las piezas)
    if (S.layers.some((L) => L.key === 'rig' && L.w > 0.5)) return;
    if (z?.dead && z.P?.rootY < 0) hipsW.y += z.P.rootY;
    // (los ataques, stab) los brazos de la estocada sobre el cuerpo quieto
    const w = S.stabW || 0;
    S.stabW = 0;
    if (w < 1e-3 || !z || z.dead || !S.clips.estocada) return;
    for (const i of STAB_ARMS) S.list[i].W.slerp(boneAt(S, 'estocada', i, S.stabT, qs).premultiply(qYaw), w * STAB_ARM_W);
    for (const i of STAB_SPINE) S.list[i].W.slerp(boneAt(S, 'estocada', i, S.stabT, qs).premultiply(qYaw), w * STAB_SPINE_W);
  },

  // La rodela en el antebrazo del modelo y el tono de la plaga.
  after(S, { zs }, z) {
    const R = zs.bossRig;
    const sh0 = S.shield;
    if (!S.root.visible || !z) {
      // (sin el modelo, la rodela vuelve a su lugar en las piezas)
      if (sh0 && !sh0.matrixAutoUpdate) sh0.matrixAutoUpdate = true;
      return;
    }
    const p = zs.moves?.plagueOf?.(z) ?? null;
    if (S.plagueP !== p) {
      S.plagueP = p;
      tint(S, p);
    }
    const P5 = R.parts[5];
    S.shield ||= P5?.children.find((o) => o.isGroup && o.visible && o.children.length >= 4) || null;
    const sh = S.shield;
    if (!sh || !sh.visible) return;
    // (las piezas se esconden en otra capa: la rodela se ve)
    if (!sh.layers.isEnabled(0)) sh.traverse((o) => o.layers.set(0));
    const fore = S.bones.RightForeArm;
    const hand = S.bones.RightHand;
    const chest = S.bones.Spine;
    if (!fore || !hand || !chest) return;
    S.root.updateMatrixWorld(true);
    fore.getWorldPosition(a);
    hand.getWorldPosition(b);
    chest.getWorldPosition(c);
    // a lo largo del antebrazo; afuera: del pecho al brazo, sin lo que va a lo largo
    u.copy(b).sub(a).normalize();
    n.copy(a).lerp(b, SHIELD_AT).sub(c);
    n.addScaledVector(u, -n.dot(u));
    if (n.lengthSq() < 1e-6) n.set(-1, 0, 0);
    n.normalize();
    const s = S.root.scale.x;
    v.copy(a).lerp(b, SHIELD_AT).addScaledVector(n, SHIELD_OUT * s);
    // (la rodela de las piezas mira a su x: esa x va para afuera)
    m4.makeBasis(n, u, c.crossVectors(n, u).normalize());
    q.setFromRotationMatrix(m4);
    P5.updateWorldMatrix(true, false);
    P5.matrixWorld.decompose(a, qd, sc);
    sc.multiplyScalar(SHIELD_K);
    m4b.compose(v, q, sc);
    sh.matrixAutoUpdate = false;
    sh.matrix.copy(m4.copy(P5.matrixWorld).invert().multiply(m4b));
    sh.matrixWorldNeedsUpdate = true;
  },
};
