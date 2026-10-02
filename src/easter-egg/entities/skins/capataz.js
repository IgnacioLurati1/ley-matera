import * as THREE from 'three';
import { clampT } from '../bossSkin';

// El Capataz con cuerpo de verdad (entities/bossSkin.js): el minijefe del
// molino (y de las rondas mezcladas de la torre). Low poly (el modelo de 2c),
// con clips propios de la biblioteca de Meshy (nadie más los usa) y de Mixamo
// (los que eligió el usuario): un bruto que manda a los gritos.
// - Parado respira encorvado como un ogro (quieto) y, de guardia, espera con
//   los brazos abiertos (guardia).
// - Despacio arrastra los pies como un muerto (pisoton); andando, pisa duro y
//   tieso (caminar) y, apurado, corre pesado como un oso (correr). El paso
//   siempre al ritmo de lo que avanza de verdad. (La marcha de antes era la de
//   cargar un cañón: caminaba mirando para el costado.)
// - Llega golpeándose el pecho (intro), llama a los peones a los gritos
//   (grito) y enojado patalea (enojo).
// - La pala contra el piso, con las dos manos desde atrás de la cabeza
//   (golpe); clausurando una máquina, a palazos (clausura).
// - El rebenque: un revés con la izquierda, girando el cuerpo (latigo, espejado).
// - Antes de embestir escarba el piso agachado (escarba) y sale como un toro,
//   con la cabeza gacha (carga).
// - Contra la pared: trastabilla para atrás, cae sentado y se levanta (aturdido).
// - Muere agarrándose el pecho, de rodillas y de cara al piso (muere).
//
// Lo que no es clip:
// - La pala: la de las piezas (pieza 17), en la mano derecha (skin.hand);
//   andando la arrastra atrás, con la hoja en el piso.
// - El sombrero: el de las piezas (pieza 13), sobre la cabeza del modelo. Así
//   se le sigue pudiendo volar de un tiro (bossRig.dropHat lo copia de ahí) y
//   el del easter egg del molino sigue igual.
// - Muerto, después de un rato se hunde (P.rootY, como el de piezas).

// el rebenque: cuándo lo revienta (s del clip latigo)
const THROW = 1.05;
// contra la pared: hasta dónde cae sentado (s del clip aturdido); después se levanta
const SIT = 1.9;
// andando (m/s del modelo, sin escala): arrastra los pies desde WALK_V, camina
// desde STEP_ON y corre desde RUN_ON (con histéresis)
const WALK_V = 0.15;
const STEP_ON = 0.45;
const STEP_OFF = 0.35;
const RUN_ON = 1.3;
const RUN_OFF = 1.1;
// (el paso nunca más rápido que esto: más, y las piernas van como en cámara rápida)
const RATE_MAX = 1.5;
// el sombrero: de dónde cuelga, desde el hueso de la cabeza (m del modelo)
const HAT_AT = new THREE.Vector3(0, -0.02, 0.0);
// (el de las piezas es para una cabeza más grande que la del modelo)
const HAT_K = 0.72;

const q = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const v = new THREE.Vector3();
const vs = new THREE.Vector3();
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();

// Andando: corre, camina, arrastra los pies o respira (el paso, con lo que avanza de verdad).
function move(S, dt, s, z) {
  const C = S.clips;
  const vm = Math.min(S.v, (z.speed || 4) * 1.15) / Math.max(0.1, s);
  S.run = S.run ? vm > RUN_OFF : vm > RUN_ON;
  if (S.run) {
    S.runT = (S.runT || 0) + dt * Math.max(0.6, Math.min(RATE_MAX, vm / C.correr.slide));
    return { key: 'correr', t: S.runT % C.correr.dur };
  }
  S.step = S.step ? vm > STEP_OFF : vm > STEP_ON;
  if (S.step) {
    S.walkT = (S.walkT || 0) + dt * Math.min(1.6, vm / C.caminar.slide);
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  if (vm > WALK_V) {
    S.stompT = (S.stompT || 0) + dt * Math.min(RATE_MAX, vm / C.pisoton.slide);
    return { key: 'pisoton', t: S.stompT % C.pisoton.dur };
  }
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

// Andando, la pala no va apuntando adonde va el antebrazo (con el braceo
// quedaba como una lanza adelante): la arrastra atrás, con la hoja en el piso.
// En los golpes, el latigazo y el grito sigue a la mano (skin.hand).
const DRAG = new Set(['chase', 'toLock']);
// de la mano a la punta de la hoja, en medidas de la pieza (el mango de 1,3 y la hoja abajo)
const SHOVEL_TIP = 1.23;
const SHOVEL_GRIP = 0.3;
const Y = new THREE.Vector3(0, -1, 0);
const fist = new THREE.Vector3();
const dir = new THREE.Vector3();
const want = new THREE.Vector3();
function dragShovel(S, R, z, dt) {
  const P = R.parts[17];
  if (!P) return;
  const on = !z.dead && DRAG.has(z.state) ? 1 : 0;
  S.dragK = (S.dragK ?? 0) + (on - (S.dragK ?? 0)) * Math.min(1, dt * 6);
  if (S.dragK < 0.01) return;
  P.matrix.decompose(tv, tq, vs);
  dir.copy(Y).applyQuaternion(tq);
  fist.copy(tv).addScaledVector(dir, -SHOVEL_GRIP * vs.y);
  // atrás y un poco al costado derecho, bajando lo justo para que la punta toque el piso
  const yaw = z.yaw || 0;
  want.set(-Math.sin(yaw) * 0.85 - Math.cos(yaw) * 0.3, 0, -Math.cos(yaw) * 0.85 + Math.sin(yaw) * 0.3).normalize();
  const L = SHOVEL_TIP * vs.y;
  const sn = Math.max(0.2, Math.min(0.95, (fist.y - (z.baseY || 0)) / L));
  want.multiplyScalar(Math.sqrt(1 - sn * sn)).setY(-sn);
  dir.lerp(want, S.dragK).normalize();
  tq.setFromUnitVectors(Y, dir);
  tv.copy(fist).addScaledVector(dir, SHOVEL_GRIP * vs.y);
  P.matrix.compose(tv, tq, vs);
  P.matrixWorldNeedsUpdate = true;
}

export default {
  kind: 'capataz',
  dir: 'capataz',
  loops: ['quieto', 'guardia', 'pisoton', 'caminar', 'correr', 'carga'],
  // la pala (la pieza 17 de las piezas) en la derecha; el rebenque, en la izquierda
  hand: { part: 17, fore: 'RightForeArm', bone: 'RightHand' },
  alias: { whip: 'LeftHand' },

  pick(z, { S, dt, s }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // llega golpeándose el pecho (y a los 1,6 s dice lo suyo)
      case 'intro':
        return { key: 'intro', t: clampT(S, 'intro', Tt * 1.1) };
      // llama a los peones a los gritos
      case 'summon':
        return { key: 'grito', t: clampT(S, 'grito', 0.5 + Tt) };
      // enojado, patalea
      case 'enrage':
        return { key: 'enojo', t: clampT(S, 'enojo', Tt * 0.8) };
      // la pala contra el piso: pega a los 0,75 s
      case 'slam': {
        const hit = C.golpe.low;
        return { key: 'golpe', t: clampT(S, 'golpe', Tt < 0.75 ? (Tt * hit) / 0.75 : hit + (Tt - 0.75) * 0.9) };
      }
      // clausurando una máquina, a palazos
      case 'locking': {
        // (la pala toca el piso un poco antes de que las manos lleguen abajo del todo)
        const hit = C.clausura.low - 0.1;
        const k = ((Tt % 0.8) / 0.8) * 1.3;
        return { key: 'clausura', t: clampT(S, 'clausura', k < 0.75 ? hit - (0.75 - k) * 1.1 : hit + (k - 0.75) * 1.4) };
      }
      // el rebenque: gira el cuerpo y lo revienta de revés cuando pega (al pasar a whip)
      case 'whipWind':
        return { key: 'latigo', t: clampT(S, 'latigo', THROW - (0.65 - Tt)) };
      case 'whip':
        return { key: 'latigo', t: clampT(S, 'latigo', THROW + Tt * 1.2) };
      // escarba el piso agachado y sale como un toro
      case 'chargeWind':
        return { key: 'escarba', t: clampT(S, 'escarba', Tt) };
      case 'charge': {
        const vm = S.v / Math.max(0.1, s);
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.8, Math.min(1.6, vm / C.carga.slide));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      }
      // se la dio contra la pared: trastabilla, cae sentado y se levanta (el
      // mismo tramo al revés) antes de que el estado termine (2,8 s)
      case 'stunned':
        return { key: 'aturdido', t: clampT(S, 'aturdido', Tt < SIT ? Tt : Math.max(0.3, SIT - (Tt - SIT) * 1.8)) };
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
    if (z?.dead && z.P?.rootY < 0) hipsW.y += z.P.rootY;
  },

  // El sombrero de las piezas, sobre la cabeza del modelo (con lo que tiene
  // respecto de la pieza de la cabeza en las piezas).
  after(S, { zs, dt }, z) {
    const R = zs.bossRig;
    const P2 = R.parts[2];
    const P13 = R.parts[13];
    if (!S.root.visible || !z || !P2 || !P13) return;
    dragShovel(S, R, z, dt);
    if (!S.hatOn) {
      P13.traverse((o) => o.layers.set(0));
      S.hatOn = true;
    }
    // lo de la pieza del sombrero respecto de la de la cabeza (lo puso el de piezas este cuadro)
    m4b.copy(P2.matrix).invert().multiply(P13.matrix);
    const head = S.bones.Head;
    head.getWorldPosition(v);
    q.copy(head.getWorldQuaternion(q)).multiply(qx.copy(S.byName.Head.rest).invert());
    P2.matrix.decompose(tv, tq, vs);
    v.addScaledVector(tv.copy(HAT_AT).applyQuaternion(q), S.root.scale.x);
    m4.compose(v, q, vs.multiplyScalar(HAT_K)).multiply(m4b);
    P13.matrix.copy(m4);
    P13.matrixWorldNeedsUpdate = true;
  },
};
