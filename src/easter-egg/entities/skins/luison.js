import * as THREE from 'three';
import { HOWL_AT, POUNCE, LUISON_END, SUMMON_POUND } from '../luison';
import { clampT } from '../bossSkin';
import BL, { FILES as BL_FILES } from './luisonBlend';

// El Luisón con cuerpo de verdad (entities/bossSkin.js): qué clip va en cada
// estado. De Mixamo: quieto, respira, caminar, correr, ruge (el aullido; las
// piernas plantadas), zarpazo, salto y muere. Anda en dos patas, como un
// hombre lobo: caminando o corriendo, con el paso a tiempo con lo que avanza
// (en cuatro patas quedaba deforme). La cresta de la llegada la sube caminando.

// andando (m/s del modelo): quieto, camina y, pasado RUN_ON, corre
const WALK_ON = 0.3;
const WALK_OFF = 0.18;
const RUN_ON = 1.6;
const RUN_OFF = 1.3;
const RATE_MAX = 1.5;

function move(S, dt, s, walkOnly) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  S.run = !walkOnly && (S.run ? vm > RUN_OFF : vm > RUN_ON);
  if (S.run) {
    S.runT = (S.runT || 0) + dt * Math.max(0.6, Math.min(RATE_MAX, vm / C.correr.speed));
    // (los pies en el piso: el clip se hundía un poco en cada paso)
    return { key: 'correr', t: S.runT % C.correr.dur, feet: true };
  }
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(0.5, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur, feet: true };
  }
  // quieto: respira (el clip de quieto, pasado el principio, abre los brazos y
  // hace fuerza como rugiendo sin abrir la boca: parecía un rugido a medias)
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'respira', t: S.idleT % C.respira.dur };
}

// (encorvado: las rodillas dobladas suben los pies; quieto, el de respirar
// también con los pies en el piso)
function stoopMove(S, dt, s) {
  const w = move(S, dt, s);
  if ((S.stoopK || 0) > 0.01) w.feet = true;
  return w;
}

// Arriba de la loma (la llegada): se planta donde terminó el paso y aúlla así.
// Los últimos pasos de la subida se acomodan (el ritmo del clip) para llegar
// arriba en un cuadro con los pies juntos (s del clip de caminar) y ahí queda
// quieto. Pasar al de parado arrastraba los pies de la zancada: parecía otra
// animación metida en el medio.
const PLANT = [0.1, 0.8];
const PLANT_IN = 1.2;
// (la escena cambia de estado con la música: puede cortar un poco antes; el
// apoyo se alcanza PLANT_EARLY s antes de lo que dura la subida y ahí espera)
const PLANT_EARLY = 0.35;
function climbTo(S, dt, left) {
  const d = S.clips.caminar.dur;
  const now = S.walkT || 0;
  const eff = left - PLANT_EARLY;
  if (S.climbC == null) {
    const k0 = Math.floor(now / d) * d;
    let c = Infinity;
    for (const base of [k0, k0 + d, k0 + 2 * d]) for (const p of PLANT) if (base + p >= now + Math.max(0, eff) * 0.45) c = Math.min(c, base + p);
    S.climbC = c;
  }
  const c = S.climbC;
  S.walkT = eff > dt ? now + ((c - now) * dt) / eff : c;
  return { key: 'caminar', t: S.walkT % d, feet: true };
}
function plant(S) {
  if (firmOn()) return stand(S, S.fadeK, S.dtNow);
  S.plantT ??= S.walkT || 0;
  return { key: 'caminar', t: S.plantT % S.clips.caminar.dur, feet: true };
}

// (2026-10-05, el usuario: "cuando se va a parar en la piedra queda torcido":
// quedaba congelado en un cuadro de la caminata, a media zancada, con los
// hombros girados 20° y un pie en el aire.) Ahora el paso de la subida va
// atado a lo que avanza (no patina) y llega a la cima justo cuando un pie
// pasa al lado del otro; ahí se para derecho con el de parado (el quieto), de
// frente a ellos. El quieto abre mucho los pies (1,36 m; al pasar van a
// 0,6-0,77): parado en la cresta los junta, si no se arrastraban de costado.
// globalThis.__mduNoLuFirme = true: como antes (el cuadro de la caminata).
const firmOn = () => globalThis.__mduNoLuFirme !== true;
// (s del clip de caminar en que un pie pasa al lado del otro: medido, el
// izquierdo a los 0 y el derecho a los 0,72)
const PASS = [0, 0.72];
// lo que tarda en pararse derecho, desde ese paso
const FIRM_FADE = 0.45;
// parado en la cresta, cuánto queda de lo ancho de cada pie (desde el medio)
const FIRM_W = 0.52;
// (la escena mueve el jefe con zombies.render() sin dt: 1/60 aunque el juego
// vaya a 30 o a 144; el fundido, en segundos de verdad: rdt, el de la escena)
function stand(S, k = 1, dt = 0) {
  // (la caminata que se va queda en su último cuadro: bossSkin sigue andando
  // las capas que salen, y el pie de adelante daba otro paso de 60 cm)
  for (const L of S.layers) if (L.key === 'caminar') L.t = ((S.walkT || 0) % S.clips.caminar.dur) - dt;
  return { key: 'quieto', t: STAND_T, feet: true, fade: FIRM_FADE * k };
}
// El pie apoyado al llegar (tobillo y punta, S.pinBones) clavado en S.pinAt
// mientras está arriba: se corre la cadera. Andando, la cadera va ~35 cm
// adelante de los pies; parado, encima: al pararse el cuerpo se acomoda
// encima de los pies (no los arrastra para adelante) y el otro pie, que viene
// en el aire, se apoya al lado. Al saltar, lo corrido se va en PIN_OUT s.
const PIN_OUT = 0.3;
const FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const WS = new THREE.Vector3();
const MID = new THREE.Vector3();
// el medio de esos huesos con los giros de la mezcla (S.list[i].W) y la cadera en hipsW
function feetMid(S, hipsW, sc, out, names) {
  S.fk ||= S.list.map(() => new THREE.Vector3());
  S.fkOk ||= new Uint8Array(S.list.length);
  S.fkOk.fill(0);
  const at = (i) => {
    const d = S.list[i];
    if (!S.fkOk[i]) {
      if (d.pi < 0) S.fk[i].copy(hipsW);
      else S.fk[i].copy(d.bone.position).multiplyScalar(sc).applyQuaternion(S.list[d.pi].W).add(at(d.pi));
      S.fkOk[i] = 1;
    }
    return S.fk[i];
  };
  out.set(0, 0, 0);
  let n = 0;
  for (const nm of names) {
    const i = S.list.indexOf(S.byName[nm]);
    if (i < 0) continue;
    out.add(at(i));
    n++;
  }
  return n ? out.multiplyScalar(1 / n) : null;
}
function pinFeet(S, ctx, hipsW) {
  if (!hipsW) return;
  if (S.pinAt) {
    // (la escala del mundo de los huesos: la del modelo por la del armado)
    if (!S.fkA) {
      S.bones.Hips.getWorldScale(WS);
      if (S.root.scale.x > 0) S.fkA = WS.x / S.root.scale.x;
    }
    if (!S.fkA || !feetMid(S, hipsW, S.fkA * ctx.s, MID, S.pinBones || FEET)) return;
    (S.pinOff ||= new THREE.Vector3()).set(S.pinAt.x - MID.x, 0, S.pinAt.z - MID.z);
    S.pinOutT = 0;
  } else if (S.pinOff) {
    S.pinOutT = (S.pinOutT || 0) + (S.rdt || ctx.dt);
    if (S.pinOutT >= PIN_OUT) {
      S.pinOff = null;
      return;
    }
    MID.copy(S.pinOff).multiplyScalar(1 - sm(S.pinOutT / PIN_OUT));
    hipsW.x += MID.x;
    hipsW.z += MID.z;
    return;
  } else return;
  hipsW.x += S.pinOff.x;
  hipsW.z += S.pinOff.z;
}
// La subida con el paso atado a lo que avanza: del principio a la cima, el
// clip va de donde estaba hasta el paso (PASS) más cerca de donde llegaría
// andando parejo (la zancada se estira o se acorta un poco, menos del 10%).
function climbLock(S, L, A, s) {
  const C = S.clips.caminar;
  const d = C.dur;
  const top = A?.luTop;
  const dl = top ? Math.hypot(L.pos.x - top.x, L.pos.z - top.z) : 0;
  if (S.lockD0 == null) {
    const w0 = S.walkT || 0;
    const end = w0 + dl / Math.max(1e-3, C.speed * s);
    let c = end;
    let best = Infinity;
    for (let base = Math.floor(w0 / d) * d; base <= end + d; base += d) {
      for (const p of PASS) {
        const x = base + p;
        if (x > w0 && Math.abs(x - end) < best) {
          best = Math.abs(x - end);
          c = x;
        }
      }
    }
    S.lockD0 = Math.max(1e-3, dl);
    S.lockW0 = w0;
    S.lockC = c;
  }
  // (arriba: se para, con los pies donde quedaron en el último paso)
  if (dl < 1e-3) {
    S.walkT = S.lockC;
    if (!S.pinAt) {
      // (el apoyado: el de la punta más baja)
      const B = S.bones;
      const left = B.LeftToeBase && B.RightToeBase ? B.LeftToeBase.getWorldPosition(WS).y < B.RightToeBase.getWorldPosition(MID).y : true;
      S.pinBones = left ? ['LeftFoot', 'LeftToeBase'] : ['RightFoot', 'RightToeBase'];
      S.pinAt = new THREE.Vector3();
      let n = 0;
      for (const nm of S.pinBones) {
        if (!B[nm]) continue;
        S.pinAt.add(B[nm].getWorldPosition(WS));
        n++;
      }
      if (n) S.pinAt.multiplyScalar(1 / n);
      else S.pinAt = null;
    }
    return stand(S, S.fadeK, S.dtNow);
  }
  S.walkT = S.lockW0 + (S.lockC - S.lockW0) * (1 - Math.min(1, dl / S.lockD0));
  return { key: 'caminar', t: S.walkT % d, feet: true };
}
// Parado en la cresta: los pies hacia adentro (cada pierna gira desde la
// cadera alrededor de adelante; el pie vuelve a quedar plano). k: cuánto.
const LV = new THREE.Vector3();
const HV = new THREE.Vector3();
const FWY = new THREE.Vector3();
function narrow(S, k) {
  const H = S.byName.Hips;
  if (!H) return;
  FWY.crossVectors(AXY, UPV).normalize();
  for (const [up, lo, ft] of [
    ['LeftUpLeg', 'LeftLeg', 'LeftFoot'],
    ['RightUpLeg', 'RightLeg', 'RightFoot'],
  ]) {
    const U = S.byName[up];
    const G = S.byName[lo];
    const F = S.byName[ft];
    if (!U || !G || !F) continue;
    // (la cadera desde el medio, y del muslo al tobillo: en el mundo, sin escala)
    HV.copy(U.bone.position).applyQuaternion(H.W);
    LV.copy(G.bone.position).applyQuaternion(U.W).add(TV.copy(F.bone.position).applyQuaternion(G.W));
    const hx = HV.dot(AXY);
    const lx = LV.dot(AXY);
    const ly = LV.dot(UPV);
    const r = Math.hypot(lx, ly);
    if (r < 1e-4) continue;
    const want = (hx + lx) * (1 - (1 - FIRM_W) * k) - hx;
    const a = Math.asin(Math.max(-0.9, Math.min(0.9, want / r))) - Math.atan2(lx, -ly);
    turn(S, up, FWY, a);
    turn(S, ft, FWY, -a);
  }
}

const qd = new THREE.Quaternion();
const qt = new THREE.Quaternion();
const AX = new THREE.Vector3();
const AXY = new THREE.Vector3();
const FW = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

// Un hueso y todo lo que cuelga de él, girado en el mundo (los giros de la
// mezcla son del mundo: los hijos no lo heredan solos).
function sub(S, name) {
  S.subs ||= {};
  if (S.subs[name]) return S.subs[name];
  const i0 = S.list.indexOf(S.byName[name]);
  const out = [];
  if (i0 >= 0) {
    for (let i = 0; i < S.list.length; i++) {
      let j = i;
      while (j >= 0 && j !== i0) j = S.list[j].pi;
      if (j === i0) out.push(i);
    }
  }
  return (S.subs[name] = out);
}
function turn(S, name, axis, ang) {
  if (Math.abs(ang) < 1e-4) return;
  qt.setFromAxisAngle(axis, ang);
  for (const i of sub(S, name)) S.list[i].W.premultiply(qt);
}

// El aullido (a mano, sobre el parado firme): con el resuello junta aire (el
// pecho afuera, los hombros arriba, la cabeza un poco gacha); cuando suena,
// de una sola vez: el lomo para atrás, el hocico a la luna, los brazos
// abiertos para abajo y atrás; tiembla aullando, respira y aúlla más alto; al
// final (si hay) baja la cabeza hacia ellos. Sin nada en el medio.
// h: segundos desde que suena el aullido (antes, negativo: el resuello);
// end: cuándo termina (en h) o null (sigue en otra cosa: se agacha y salta).
// [h, lomo (+ adelante), cabeza (- arriba), brazos: junta aire, (sin usar),
// abiertos (cuánto de cada uno; ARMS), hombros arriba]
// (el hocico, a unos 60° del piso: más atrás el cráneo se metía en la melena)
const HOWL = [
  [-0.95, 0, 0, 0, 0, 0, 0],
  [-0.4, -0.12, 0.1, 0.55, 0, 0, 0.16],
  [-0.05, -0.15, 0.16, 0.65, 0, 0, 0.18],
  [0.28, -0.32, -0.82, 0, 0, 1, -0.08],
  [1.15, -0.36, -0.88, 0, 0, 1, -0.07],
  [1.32, -0.24, -0.62, 0, 0, 0.85, -0.05],
  [1.58, -0.4, -0.95, 0, 0, 1, -0.08],
];
// aullando, el cuello se estira (m del modelo, arriba y adelante): la cabeza
// sale de la melena (el hueso del cuello mide 8 cm: girándolo no alcanzaba)
const NECK_UP = 0.12;
const NECK_FWD = 0.05;
const HOWL_OUT = [0.3, 0.15, 0, 0, 0, 0.02];
// parado firme (arriba de la loma, aullando): un cuadro quieto del quieto (el
// clip después abre los brazos y hace fuerza: queda raro antes del aullido)
const STAND_T = 0.05;
// antes de saltar se agacha CROUCH_T s (el clip de salto, desde CROUCH_FROM hasta que despega)
const CROUCH_T = 0.55;
const CROUCH_FROM = 0.2;
// el salto: del clip, solo agacharse, despegar y caer (en el aire es un salto
// para arriba que echa el cuerpo atrás); al agacharse y caer, un poco
// inclinado adelante (rad, según el cuadro del clip). En el aire, abalanzado:
// la zancada larga de la corrida, el cuerpo adelante y las garras al frente.
const LEAN = [
  [0.3, 0],
  [0.6, 0.45],
  [0.7, 0.55],
  [1.35, 0.3],
  [1.6, 0.1],
  [1.8, 0],
];
// El salto encima de la presa (la pelea y la llegada), del clip solo lo de
// agacharse, estirar las piernas y caer, sin el subir del clip (que es un salto
// para arriba: lo tiraba al cielo, torcido, y volvía al piso corriendo). En el
// aire, abalanzado: el cuerpo adelante casi acostado, derecho hacia donde va,
// las garras al frente y las piernas estiradas atrás. El arco lo pone la pelea
// (FLY_H) o la escena (la llegada, con los pies).
// (k del vuelo: hasta POUNCE_OFF estira las piernas, desde POUNCE_LAND cae)
const POUNCE_OFF = 0.14;
const POUNCE_LAND = 0.8;
// (s del clip de salto: lo más agachado y recién estirado, al despegar)
const CROUCH_LOW = 0.43;
const PUSH_T = 0.62;
// abalanzado: cuánto se acuesta (rad, desde la cadera) y la cabeza mirando adelante
const FLY_LEAN = 1.05;
const FLY_HEAD = 0.8;
// lo alto del arco en la pelea (m, en el medio del salto)
const FLY_H = 1.25;
// el tirón del zarpazo largo: un saltito (m) inclinado adelante (rad)
const LUNGE_H = 0.45;
const LUNGE_LEAN = 0.35;
// las piernas en el aire (izquierda, arriba, adelante del cuerpo; el muslo y la
// canilla): la izquierda estirada atrás, la derecha con la rodilla un poco doblada
const LEGS_FLY = [
  [[0.1, -0.5, -0.86], [0.04, -0.38, -0.92]],
  [[0.12, -0.66, -0.74], [0.05, -0.9, -0.42]],
];
// el vuelo del salto (k: 0 despega, 1 cae): qué va. arc: la pelea pone la altura.
function pounce(S, k, arc) {
  const C = S.clips.salto;
  S.arcNow = arc ? FLY_H * Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.04) / 0.9))) : 0;
  if (k < POUNCE_OFF) {
    const t = CROUCH_LOW + (k / POUNCE_OFF) * (PUSH_T - CROUCH_LOW);
    S.flyNow = k / POUNCE_OFF;
    return { key: 'salto', t, flat: true };
  }
  if (k < POUNCE_LAND) {
    S.flyNow = 1;
    return { key: 'quieto', t: STAND_T };
  }
  const t = C.land - 0.12 + ((k - POUNCE_LAND) / (1 - POUNCE_LAND)) * 0.17;
  S.flyNow = Math.max(0, 1 - (k - POUNCE_LAND) / 0.12);
  S.leanNow = leanAt(t);
  return { key: 'salto', t, flat: true };
}
function leanAt(t) {
  if (t <= LEAN[0][0] || t >= LEAN[LEAN.length - 1][0]) return 0;
  let i = 0;
  while (i < LEAN.length - 2 && t > LEAN[i + 1][0]) i++;
  const [a, x] = LEAN[i];
  const [b, y] = LEAN[i + 1];
  let k = (t - a) / (b - a);
  k = k * k * (3 - 2 * k);
  return x + (y - x) * k;
}
// hacia dónde apuntan el brazo y el antebrazo izquierdos (izquierda, arriba,
// adelante del cuerpo; el derecho, en espejo): juntando aire, abiertos un poco
// para atrás; (sin usar); aullando, abiertos para abajo y atrás, las garras
// abiertas
const ARMS = [
  [[0.35, -0.86, -0.3], [0.3, -0.9, 0.2]],
  [[0.2, -0.75, 0.55], [-0.35, -0.25, 0.9]],
  [[0.78, -0.5, -0.38], [0.85, -0.25, 0.05]],
  // abalanzado: las garras al frente (un poco abiertas y para abajo)
  [[0.3, -0.15, 0.95], [0.2, -0.3, 0.93]],
  // las dos manos al barro, adelante (llamando a los muertos)
  [[0.2, -0.8, 0.56], [0.08, -0.93, 0.36]],
  // rugiendo a la presa: los brazos bien abiertos a los costados, las garras
  // adelante y arriba
  [[0.9, -0.05, 0.3], [0.45, 0.3, 0.84]],
];
const sm = (x) => {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return x * x * (3 - 2 * x);
};
// Llamando a los muertos (summon): se agacha estirando las manos hasta el
// barro (el golpe, a SUMMON_POUND s: Zombies.luisonPound), las deja un rato y
// se levanta para aullar. t: s del estado.
const POUND_UP = 0.75;
const POUND_LEAN = 0.7;
function poundAt(t) {
  return sm(t / SUMMON_POUND) * sm((POUND_UP + 0.3 - t) / 0.3);
}
// enfurecido, mientras resuella: se sacude (la cabeza de lado a lado, el lomo,
// los hombros de a uno)
// atontado: el s del clip de salto (medio agachado), y el bamboleo (el cuerpo
// de lado a lado, la cabeza gacha que se sacude despacio, como mareado)
const DAZE_T = 0.3;
function daze(S, T, k) {
  turn(S, 'Hips', FW, Math.sin(T * 1.7) * 0.09 * k);
  turn(S, 'Spine01', AX, 0.18 * k);
  turn(S, 'neck', AX, 0.25 * k);
  turn(S, 'Head', AX, 0.2 * k);
  turn(S, 'Head', UPV, Math.sin(T * 3.1) * 0.35 * k);
  turn(S, 'Head', FW, Math.sin(T * 2.3 + 1) * 0.15 * k);
}
function thrash(S, T, th) {
  turn(S, 'Spine01', UPV, Math.sin(T * 8.5) * 0.2 * th);
  turn(S, 'neck', UPV, Math.sin(T * 17 + 0.6) * 0.25 * th);
  turn(S, 'Head', UPV, Math.sin(T * 17) * 0.3 * th);
  turn(S, 'Head', FW, Math.sin(T * 11) * 0.12 * th);
  turn(S, 'LeftShoulder', FW, Math.max(0, Math.sin(T * 8.5)) * 0.25 * th);
  turn(S, 'RightShoulder', FW, -Math.max(0, -Math.sin(T * 8.5)) * 0.25 * th);
}
function howlAt(h, end) {
  const keys = HOWL.slice();
  if (end != null) {
    const hold = keys[keys.length - 1].slice(1);
    // (el último grito sigue hasta medio segundo antes del final)
    while (keys.length > 1 && keys[keys.length - 1][0] > end - 0.55) keys.pop();
    keys.push([end - 0.55, ...hold], [end, ...HOWL_OUT]);
  }
  if (h <= keys[0][0]) return keys[0].slice(1);
  let i = 0;
  while (i < keys.length - 2 && h > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let k = Math.min(1, Math.max(0, (h - a[0]) / Math.max(1e-3, b[0] - a[0])));
  k = k * k * (3 - 2 * k);
  return a.slice(1).map((x, j) => x + (b[j + 1] - x) * k);
}

// (2026-10-05, el usuario, del Luisón parado en el pajonal bajo: "de última
// que se encorve un poco".) Escondiéndose (lurk, lurkIn, chase/toLock en la
// paja: z.lowK de Zombies.render), con los mismos clips: el lomo más adelante,
// la cabeza gacha y las rodillas más dobladas (el muslo adelante, la canilla
// atrás, el pie igual: el tobillo sube derecho y los pies en el piso bajan el
// cuerpo, sin patinar). Entra y sale en ~0,3 s (rate). La cabeza, de ~2,4 m a
// ~1,8. globalThis.__mduNoLuEncorva = true: parado, como recién.
// (tail: la cola, levantada desde la raíz: con la cadera más baja se clavaba en el piso)
const STOOP = { arch: 0.42, head: 0.12, fwd: 0.1, knee: 0.45, tail: 0.35, rate: 7 };
const STOOP_STATES = new Set(['lurk', 'lurkIn', 'chase', 'toLock']);
const QP = new THREE.Quaternion();
const QW = new THREE.Quaternion();
function stoopTail(S, a) {
  const tb = S.tail?.[0]?.bone;
  if (!tb?.parent) return;
  tb.parent.getWorldQuaternion(QP);
  QW.copy(QP).multiply(tb.quaternion).premultiply(qt.setFromAxisAngle(AXY, a));
  tb.quaternion.copy(QP.invert().multiply(QW));
  tb.updateMatrixWorld(true);
}
function stoopLegs(S, b) {
  for (const [up, lo, ft] of [
    ['LeftUpLeg', 'LeftLeg', 'LeftFoot'],
    ['RightUpLeg', 'RightLeg', 'RightFoot'],
  ]) {
    turn(S, up, AXY, -b);
    turn(S, lo, AXY, 2 * b);
    turn(S, ft, AXY, -b);
  }
}

// Encorvado andando: el lomo adelante, los hombros adelante y arriba, los
// brazos colgando adelante, la cabeza mirando al frente (el clip los echaba
// atrás y lo achicaba).
const HUNCH = { arch: 0.3, head: -0.26, fwd: 0.32, shrug: 0.1, arms: -0.18 };

const DV = new THREE.Vector3();
const TV = new THREE.Vector3();
const IDQ = new THREE.Quaternion();
// Que el hueso (y lo que cuelga) apunte hacia dir (en el mundo), en la medida k.
function aim(S, name, child, dir, k) {
  const d = S.byName[name];
  const c = S.byName[child]?.bone;
  if (!d || !c || k < 1e-3) return;
  DV.copy(c.position).applyQuaternion(d.W).normalize();
  qt.setFromUnitVectors(DV, dir);
  if (k < 1) qt.slerp(IDQ, 1 - k);
  for (const i of sub(S, name)) S.list[i].W.premultiply(qt);
}
// la dirección de ARMS[j][part] para un lado (side 1 izquierdo, -1 derecho), mezclada
function armDir(w, part, side, out) {
  out.set(0, 0, 0);
  for (let j = 0; j < ARMS.length; j++) {
    if (!w[j]) continue;
    const [l, u, f] = ARMS[j][part];
    out.addScaledVector(AX, l * side * w[j]).addScaledVector(UPV, u * w[j]).addScaledVector(FW, f * w[j]);
  }
  return out.normalize();
}

function pose(S, ctx, z, qYaw) {
  const dt = ctx.dt;
  // (los ejes del cuerpo, del esqueleto: AX hacia su izquierda, FW adelante)
  const bl = S.bones.LeftUpLeg;
  const br = S.bones.RightUpLeg;
  if (bl && br) {
    bl.getWorldPosition(AX);
    br.getWorldPosition(FW);
    AX.sub(FW).setY(0);
  }
  if (!bl || !br || AX.lengthSq() < 1e-8) AX.set(1, 0, 0).applyQuaternion(qYaw);
  AX.normalize();
  FW.crossVectors(AX, UPV).normalize();
  // el aullido
  const H = S.howlNow;
  S.howlNow = null;
  if (H) S.howlLast = H;
  S.howlK = (S.howlK || 0) + ((H ? 1 : 0) - (S.howlK || 0)) * Math.min(1, dt * 7);
  let arch = 0;
  let head = 0;
  let shrug = 0;
  let fwd = 0;
  let arms = 0;
  let aw = null;
  let ak = 0;
  S.howlJaw = 0;
  S.neckK = 0;
  S.thrashK = 0;
  S.poundK = 0;
  if (S.howlK > 0.01 && S.howlLast) {
    const { h, end, thrash, pound } = S.howlLast;
    const p = howlAt(h, end);
    const k = S.howlK;
    // (aullando tiembla un poco)
    const howling = h > 0.15 && (end == null || h < end - 0.45) ? 1 : 0;
    const tr = howling * Math.sin((ctx.g?.time || 0) * 21) * 0.025;
    // enfurecido: mientras resuella se sacude (THRASH) y aúlla para adelante,
    // a la presa (el lomo adelante, el hocico apenas arriba), no a la luna
    const th = thrash ? sm((h + HOWL_AT) / 0.2) * sm((0.1 - h) / 0.25) : 0;
    if (thrash) {
      p[0] = -p[0] * 0.5 + 0.15 * th;
      p[1] *= 0.45;
    }
    // llamando a los muertos: antes, agachado con las manos en el barro
    const pk = pound ? poundAt(h + HOWL_AT) : 0;
    // (sin juntar aire mientras se sacude o golpea el barro)
    const g0 = 1 - Math.max(th, pk);
    arch += p[0] * k;
    head += (p[1] + tr + 0.15 * th) * k;
    aw = [p[2] * g0, p[3], Math.max(p[4], 0.9 * th)];
    // (enfurecido, aullando: los brazos abiertos a la presa)
    if (thrash) {
      const rk = sm((h + 0.05) / 0.2) * (end == null ? 1 : sm((end - 0.3 - h) / 0.35));
      aw[2] *= 1 - rk;
      aw[5] = rk;
    }
    ak = Math.min(1, aw[0] + aw[1] + aw[2] + (aw[5] || 0)) * k;
    shrug += (p[5] * g0 + tr * 0.6) * k;
    S.neckK = Math.min(1, Math.max(0, -p[1] / 0.85)) * k;
    S.howlJaw = Math.min(1, Math.max(0, (h - 0.05) / 0.25)) * (end == null ? 1 : Math.min(1, Math.max(0, (end - 0.4 - h) / 0.3))) * k;
    // (el respiro del medio: la boca se entrecierra; sacudiéndose, gruñe)
    if (h > 1.2 && h < 1.5) S.howlJaw *= 0.55;
    S.howlJaw = Math.max(S.howlJaw, 0.45 * th * k);
    S.thrashK = th * k;
    S.poundK = pk * k;
    if (pk > 0.01) {
      // agachado adelante desde la cadera, la cabeza mirando al frente y las
      // dos manos al barro, adelante
      S.leanNow = Math.max(S.leanNow || 0, POUND_LEAN * pk * k);
      head -= POUND_LEAN * 0.55 * pk * k;
      aw = [aw[0], 0, aw[2] * (1 - pk), 0, pk];
      ak = Math.max(ak, pk * k);
    }
  }
  // parado firme: respira (el pecho sube y baja, apenas)
  S.breathK = (S.breathK || 0) + ((S.breathNow ? 1 : 0) - (S.breathK || 0)) * Math.min(1, dt * 4);
  S.breathNow = false;
  if (S.breathK > 0.01) {
    const b = Math.sin((ctx.g?.time || 0) * 2.1) * S.breathK;
    arch += -0.035 * b;
    shrug += 0.03 * b;
  }
  // encorvado, en la medida que camina o corre
  let wk = 0;
  for (const L of S.layers) if (L.key === 'caminar' || L.key === 'correr') wk += L.w;
  // atontado (daze, abajo): los brazos colgando adelante
  S.dazeK = (S.dazeK || 0) + ((S.dazeNow ? 1 : 0) - (S.dazeK || 0)) * Math.min(1, dt * 5);
  S.dazeNow = false;
  arms += HUNCH.arms * 1.5 * S.dazeK;
  fwd += HUNCH.fwd * 0.6 * S.dazeK;
  // el salto: abalanzado (S.flyNow, de pounce), con los ejes de hacia dónde
  // mira (los de las piernas se tuercen con la cadera del clip: lo inclinaban
  // de costado)
  S.flyK = (S.flyK || 0) + ((S.flyNow || 0) - (S.flyK || 0)) * Math.min(1, dt * 14);
  S.flyNow = 0;
  const fk = S.flyK;
  AXY.set(1, 0, 0).applyQuaternion(qYaw);
  if (fk > 0.01) {
    AX.lerp(AXY, fk).normalize();
    FW.crossVectors(AX, UPV).normalize();
  }
  wk = Math.min(1, wk) * (1 - S.howlK) * (1 - fk);
  arch += HUNCH.arch * wk;
  head += HUNCH.head * wk;
  fwd += HUNCH.fwd * wk;
  shrug += HUNCH.shrug * wk;
  arms += HUNCH.arms * wk;
  // agachado y al caer, un poco adelante desde la cadera; abalanzado, casi acostado
  const lean = Math.max(S.leanNow || 0, fk * FLY_LEAN);
  S.leanNow = 0;
  S.lean = (S.lean || 0) + (lean - (S.lean || 0)) * Math.min(1, dt * 14);
  // (de la cadera, hacia donde mira: con el eje de las piernas, si el clip
  // tuerce la cadera, se inclinaba de costado)
  if (Math.abs(S.lean) > 1e-3) turn(S, 'Hips', AXY, S.lean);
  // abalanzado: la cabeza mirando adelante (no al piso) y las garras al frente
  if (fk > 0.01) {
    head -= S.lean * FLY_HEAD;
    aw = [0, 0, 0, fk];
    ak = fk;
  }
  // parado firme en la cresta (la llegada): los pies más juntos, en la medida
  // del de parado (al agacharse para saltar se va con él)
  S.firmK = (S.firmK || 0) + ((S.firmArr ? 1 : 0) - (S.firmK || 0)) * Math.min(1, dt * 10);
  if (S.firmK > 1e-3) {
    // (y agachado para saltar: con el salto abría los pies a 1,44 m)
    let wq = 0;
    for (const L of S.layers) if (L.key === 'quieto' || L.key === 'salto') wq += L.w;
    if (wq * S.firmK > 1e-3) narrow(S, Math.min(1, wq) * S.firmK);
  }
  // escondiéndose en la paja (la pelea, z.lowK): encorvado sobre el clip
  const sk = S.fightNow && z && STOOP_STATES.has(z.state) && globalThis.__mduNoLuEncorva !== true ? Math.min(1, z.lowK || 0) : 0;
  S.stoopK = (S.stoopK || 0) + (sk - (S.stoopK || 0)) * Math.min(1, dt * STOOP.rate);
  if (S.stoopK > 1e-3) {
    const k = S.stoopK;
    arch += STOOP.arch * k;
    head += STOOP.head * k;
    fwd += STOOP.fwd * k;
    stoopLegs(S, STOOP.knee * k);
  }
  if (Math.abs(arch) + Math.abs(head) + ak + Math.abs(fwd) < 1e-3) return;
  turn(S, 'Spine02', AX, arch * 0.35);
  turn(S, 'Spine01', AX, arch * 0.35);
  turn(S, 'Spine', AX, arch * 0.3);
  // (el cuello lleva más: la cabeza sube en vez de doblarse contra la nuca)
  turn(S, 'neck', AX, head * 0.6);
  turn(S, 'Head', AX, head * 0.4);
  // los hombros (adelante y arriba) y los brazos colgando adelante
  turn(S, 'LeftShoulder', FW, shrug);
  turn(S, 'RightShoulder', FW, -shrug);
  turn(S, 'LeftShoulder', UPV, -fwd);
  turn(S, 'RightShoulder', UPV, fwd);
  turn(S, 'LeftArm', AX, arms);
  turn(S, 'RightArm', AX, arms);
  // aullando, los brazos adonde van (el brazo y después el antebrazo)
  if (aw && ak > 1e-3) {
    aim(S, 'LeftArm', 'LeftForeArm', armDir(aw, 0, 1, TV), ak);
    aim(S, 'LeftForeArm', 'LeftHand', armDir(aw, 1, 1, TV), ak);
    aim(S, 'RightArm', 'RightForeArm', armDir(aw, 0, -1, TV), ak);
    aim(S, 'RightForeArm', 'RightHand', armDir(aw, 1, -1, TV), ak);
  }
  if (S.thrashK > 0.01) thrash(S, ctx.g?.time || 0, S.thrashK);
  if (S.dazeK > 0.01) daze(S, ctx.g?.time || 0, S.dazeK);
  // abalanzado: las piernas estiradas atrás (el muslo y después la canilla)
  if (fk > 0.01) {
    aim(S, 'LeftUpLeg', 'LeftLeg', legDir(0, 0, 1, TV), fk);
    aim(S, 'LeftLeg', 'LeftFoot', legDir(0, 1, 1, TV), fk);
    aim(S, 'RightUpLeg', 'RightLeg', legDir(1, 0, -1, TV), fk);
    aim(S, 'RightLeg', 'RightFoot', legDir(1, 1, -1, TV), fk);
  }
}
function legDir(j, part, side, out) {
  const [l, u, f] = LEGS_FLY[j][part];
  return out.set(0, 0, 0).addScaledVector(AX, l * side).addScaledVector(UPV, u).addScaledVector(FW, f).normalize();
}

// La boca (el hueso luJaw del modelo: la mandíbula de abajo, abre alrededor
// de su x): abierta en el rugido, desde un poco antes del pico hasta que baja
// el hocico (y mientras aúlla a la luna: S.up); gruñendo en el zarpazo y en el salto.
// (aullando, bien abierta: con 0,17 parecía que aullaba con la boca cerrada;
// adentro está la lengua y la garganta oscura del modelo)
// (rugiendo y aullando, bien abierta: con 0,5 rad de frente casi no se veía
// abierta; la mandíbula del modelo arrastra solo el labio de abajo, el mentón
// sigue a medias. Gruñendo en el zarpazo y en el salto, menos)
const JAW_MAX = 0.5;
const ROAR_MAX = 0.95;
const OPEN = { ruge: 1, zarpazo: 0.5 };
function mouth(S, { dt, g }) {
  const J = S.bones.luJaw;
  if (!J) return;
  S.jawRest ||= J.quaternion.clone();
  let roar = 0;
  let snarl = 0;
  for (const L of S.layers) {
    const o = OPEN[L.key];
    if (!o) continue;
    const C = S.clips[L.key];
    const t = L.t;
    let k;
    if (L.key === 'ruge') k = Math.min(1, Math.max(0, (t - (C.peak - 0.7)) / 0.45)) * Math.min(1, Math.max(0, (C.peak + 2.2 - t) / 0.6));
    else if (L.key === 'zarpazo') k = Math.max(0, 1 - Math.abs(t - C.hit) / 0.6);
    else k = t > C.takeoff - 0.2 && t < C.land + 0.2 ? 1 : 0;
    if (L.key === 'ruge') roar += o * k * L.w;
    else snarl += o * k * L.w;
  }
  // (abalanzado, gruñendo: la boca abierta)
  roar = Math.max(roar, S.up || 0, S.howlJaw || 0);
  snarl = Math.max(snarl, (S.flyK || 0) * 0.6);
  const want = Math.max(roar * ROAR_MAX, snarl * JAW_MAX);
  S.jaw = (S.jaw || 0) + (want - (S.jaw || 0)) * Math.min(1, dt * 9);
  // (abierta, tiembla un poco: gruñe)
  const a = S.jaw * (1 + Math.sin((g?.time || 0) * 23) * 0.06 * Math.min(1, S.jaw / JAW_MAX));
  J.quaternion.copy(S.jawRest).multiply(qd.setFromAxisAngle(XA, a));
  J.updateMatrixWorld(true);
}
const XA = new THREE.Vector3(1, 0, 0);

// El cuello estirado (con los huesos ya puestos: corre la cabeza en el mundo).
const NP = new THREE.Vector3();
function neck(S) {
  const H = S.bones.Head;
  const N = H?.parent;
  if (!H || !N) return;
  S.headRest ||= H.position.clone();
  H.position.copy(S.headRest);
  const k = S.neckK || 0;
  if (k > 1e-3) {
    const s = S.root.scale.x;
    N.updateMatrixWorld(true);
    H.getWorldPosition(NP);
    NP.addScaledVector(UPV, NECK_UP * k * s).addScaledVector(FW, NECK_FWD * k * s);
    H.position.copy(N.worldToLocal(NP));
  }
  H.updateMatrixWorld(true);
}

// (el de Blender, skins/luisonBlend.js, APAGADO: el usuario lo pidió como antes
// el 2026-10-05; globalThis.__mduLuisonBlend = true, antes de que baje el jefe,
// lo vuelve a prender: modelo, clips y todo esto)
const blendOn = () => globalThis.__mduLuisonBlend === true && !globalThis.__mduNoLuisonBlend;

export default {
  kind: 'luison',
  dir: 'luison',
  loops: ['quieto', 'respira', 'caminar', 'correr', 'idle', 'walk', 'run', 'stalk', 'bound', 'crouchIdle', 'daze'],
  files: () => (blendOn() ? BL_FILES : null),
  // (2026-10-05) Los tiros le pegan al modelo que se ve (bossSkin skinHit: las
  // cajas de las piezas puestas sobre sus huesos): caminando por la paja
  // (pick lurk/lurkIn) iba parado y las piezas agachadas, y aun persiguiendo la
  // cabeza de las piezas quedaba 0,8 m adelante de la que se ve (el pecho
  // contaba como cabeza). globalThis.__mduNoLuHit = true: las piezas, como antes.
  get hitSkin() {
    return globalThis.__mduNoLuHit !== true;
  },
  ready(S) {
    S.blend = !!S.clips.stalk;
    // (la boca por dentro y la lengua no hacen sombra: están adentro de la cabeza;
    // la boca se dibuja solo abierta: luisonBlend mouth)
    if (S.blend) {
      S.root.traverse((o) => {
        if (o.name === 'luMouth' || o.name === 'luTongue') o.castShadow = false;
        if (o.name === 'luMouth' && o.isMesh) S.mouthMesh = o;
      });
    }
  },
  // El aullido y el andar encorvado, sobre la mezcla.
  adjust(S, ctx, z, qYaw, hipsW) {
    if (S.blend) return BL.adjust(S, ctx, z, qYaw, hipsW);
    pose(S, ctx, z, qYaw);
    // (arriba de la loma, en la llegada: los pies clavados)
    pinFeet(S, ctx, hipsW);
    // el arco del salto de la pelea (pounce)
    if (S.arcNow && hipsW) hipsW.y += S.arcNow;
    S.arcNow = 0;
  },

  // Después de mover los huesos: el cuello y la boca.
  after(S, ctx, z) {
    if (S.blend) return BL.after(S, ctx, z);
    if (!z || !S.root.visible) return;
    neck(S);
    mouth(S, ctx);
    // (encorvado en la paja: la cola arriba)
    if ((S.stoopK || 0) > 1e-3) stoopTail(S, STOOP.tail * S.stoopK);
  },

  // La pelea.
  pick(z, ctx) {
    if (ctx.S.blend) {
      ctx.S.ground = null;
      const w = BL.pick(z, ctx);
      ctx.S.ikNow = !!w.ik;
      ctx.S.handNow = !!w.hands;
      return w;
    }
    const { S, dt, s } = ctx;
    S.firmArr = false;
    S.pinAt = null;
    S.pinOff = null;
    S.fightNow = true;
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // el aullido (a mano, sobre el quieto): al llegar ya aúlla; aullando y
      // llamando a los muertos, primero el resuello
      case 'intro':
        S.howlNow = { h: Tt, end: LUISON_END.intro };
        S.breathNow = true;
        return { key: 'quieto', t: STAND_T };
      case 'howl':
        S.howlNow = { h: Tt - HOWL_AT, end: LUISON_END.howl - HOWL_AT };
        S.breathNow = true;
        return { key: 'quieto', t: STAND_T };
      // llamando a los muertos: agachado, clava las manos en el barro y después aúlla
      case 'summon':
        S.howlNow = { h: Tt - HOWL_AT, end: LUISON_END.summon - HOWL_AT, pound: true };
        S.breathNow = true;
        if (Tt < POUND_UP) return { key: 'salto', t: CROUCH_FROM + sm(Tt / SUMMON_POUND) * (CROUCH_LOW - CROUCH_FROM), flat: true };
        return { key: 'quieto', t: STAND_T };
      // enfurecido: se sacude resollando y aúlla hacia adelante, a la presa (el
      // clip de rugir apenas movía la cabeza y la boca)
      case 'enrage':
        S.howlNow = { h: Tt - HOWL_AT, end: LUISON_END.enrage - HOWL_AT, thrash: true };
        S.breathNow = true;
        return { key: 'quieto', t: STAND_T };
      // el zarpazo: la garra pasa cuando pega (slam: a los 0,75 s; el largo, al tirarse)
      case 'slam':
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt - 0.75) };
      case 'whipWind':
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt - 0.8) };
      // (el tirón hacia adelante, Zombies.saberStep: z.lunge m en 0,22 s; antes
      // patinaba parado: ahora un salto bajo, inclinado adelante)
      case 'whip': {
        if (z.lunge > 0.5 && Tt < 0.24) {
          const u = Math.sin(Math.PI * Math.min(1, Tt / 0.22));
          S.arcNow = LUNGE_H * Math.min(1, z.lunge / 4) * u;
          S.leanNow = LUNGE_LEAN * u;
        }
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt + 0.65 - 0.8) };
      }
      // el salto: se agacha mientras mira, despega al salir y cae al llegar
      // (agachado del todo antes de salir: tiembla, juntando fuerza)
      case 'chargeWind': {
        const t = CROUCH_FROM + Math.min(1, Tt / 0.6) * (CROUCH_LOW - CROUCH_FROM);
        S.leanNow = leanAt(t) + (Tt > 0.6 ? Math.sin(Tt * 40) * 0.02 : 0);
        return { key: 'salto', t, flat: true };
      }
      case 'charge':
        return pounce(S, Math.min(1, Tt / POUNCE), true);
      // atontado (se dio contra la pared): medio agachado, la cabeza gacha
      // sacudiéndose y el cuerpo que se bambolea (parado respirando no se
      // entendía que estaba atontado)
      case 'stunned':
        S.dazeNow = true;
        return { key: 'salto', t: DAZE_T, flat: true };
      // (2026-10-05, el usuario: "cuando se va a esconder en los matorrales hace
      // la animación vieja ... queda muy chistosa, cambiala por la de caminar
      // normal".) Yendo a la paja (lurkIn), por adentro (lurk) y persiguiendo
      // agazapado en el pajonal: camina o corre con sus clips, a lo que va de
      // verdad; quieto esperando, respira. globalThis.__mduNoLuLurk = true: el
      // de piezas agazapado, como antes.
      case 'lurk':
      case 'lurkIn':
        if (globalThis.__mduNoLuLurk !== true) return stoopMove(S, dt, s);
        return { key: 'rig' };
    }
    if (globalThis.__mduNoLuLurk !== true && (st === 'chase' || st === 'toLock')) return stoopMove(S, dt, s);
    // agazapado en el pajonal (y volando por un golpe, etc.): el de piezas
    if ((z.lowK || 0) > 0.3) return { key: 'rig' };
    if (st !== 'chase' && st !== 'toLock') return { key: 'rig' };
    return move(S, dt, s);
  },

  // La llegada (ui/LuisonArrival): el títere de la escena.
  puppet(g) {
    // (mientras corre, la escena está en g.ee.scene.cine; antes, en g.ee.arrival)
    const A = g.ee?.scene?.cine?.lu ? g.ee.scene.cine : g.ee?.arrival;
    return A?.luOn && A.lu ? { who: A.lu, A } : null;
  },
  cine(c, ctx) {
    if (ctx.S.blend) {
      const w = BL.cine(c, ctx);
      ctx.S.ikNow = !!w.ik;
      ctx.S.handNow = !!w.hands;
      return w;
    }
    const { who: L, A } = c;
    const { S, dt, s } = ctx;
    const C = S.clips;
    const st = L.stateT || 0;
    S.fightNow = false;
    // (subiendo y parado en la cresta: firmOn)
    S.firmArr = firmOn() && (L.state === 'climb' || L.state === 'pose' || L.state === 'howl');
    if (L.state !== 'climb') S.lockD0 = null;
    // (lo que dura el cuadro de verdad: el de la escena; ctx.dt es 1/60 fijo)
    S.rdt = A?.dtNow > 0 ? A.dtNow : dt;
    S.fadeK = dt / Math.max(1e-4, S.rdt);
    S.dtNow = dt;
    // (los pies clavados, solo arriba: subiendo todavía no, y al saltar se suelta)
    if (!S.firmArr || L.state === 'hide' || (L.state === 'climb' && S.lockD0 == null)) S.pinAt = null;
    switch (L.state) {
      // escondido abajo, atrás de la loma: no se dibuja (que no asome nada)
      case 'hide':
        return { key: 'quieto', t: STAND_T, feet: true, hidden: true };
      // sube la cuesta de atrás de la loma caminando, en dos patas (la escena
      // lo lleva parejo de abajo a la cima; los pies en la loma)
      case 'climb': {
        S.plantT = null;
        if (firmOn()) return climbLock(S, L, A, s);
        const left = (L.climbDur ?? 0) - st;
        if (left < PLANT_IN) return climbTo(S, dt, left);
        S.climbC = null;
        return { ...move(S, dt, s, true), feet: true };
      }
      // parado firme en la cima, contra la luna, respirando (plantado en el paso)
      case 'pose':
        S.breathNow = true;
        return plant(S);
      // el aullido grabado suena a los 0,95 s del resuello; al final se
      // agacha para saltar (el salto arranca agachado: L.leapIn, desde el aullido)
      case 'howl': {
        const crouch = L.leapIn != null ? st - (L.leapIn - CROUCH_T) : -1;
        if (crouch > 0) {
          const t = CROUCH_FROM + Math.min(1, crouch / CROUCH_T) * (CROUCH_LOW - CROUCH_FROM);
          S.leanNow = leanAt(t);
          // (firmOn: los pies siguen donde estaban parado, S.pinAt; y apoyados
          // en la piedra: el clip los hundía 30 cm y al despegar subían de golpe.
          // globalThis.__mduNoLuAgacha = true: hundidos, como antes)
          return { key: 'salto', t, pin: !S.pinAt, feet: globalThis.__mduNoLuAgacha !== true };
        }
        S.howlNow = { h: st - HOWL_AT, end: null };
        S.breathNow = true;
        return plant(S);
      }
      // el salto de la cima al claro (la escena lleva el arco)
      case 'leap': {
        const tot = A.luTop && A.luLand ? A.luTop.distanceTo(A.luLand) : 1;
        const d = A.luTop ? Math.hypot(L.pos.x - A.luTop.x, L.pos.z - A.luTop.z) : st;
        const k = Math.min(1, d / Math.max(0.01, tot));
        // (los pies siguen el arco de la escena)
        return { ...pounce(S, k), feet: true };
      }
      // cayó agachado y se levanta (sigue el salto)
      case 'landed':
        if (st < 0.9) return { key: 'salto', t: C.salto.land + st, feet: true };
        return { key: 'quieto', t: STAND_T, feet: true };
    }
    return { key: 'rig' };
  },
};
