import * as THREE from 'three';
import { HOWL_AT, POUNCE, LUISON_END } from '../luison';
import { clampT } from '../bossSkin';

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
  S.idleT = (S.idleT || 0) + dt;
  const a = C.quieto.dur;
  const it = S.idleT % (a + C.respira.dur);
  return it < a ? { key: 'quieto', t: it } : { key: 'respira', t: it - a };
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
  S.plantT ??= S.walkT || 0;
  return { key: 'caminar', t: S.plantT % S.clips.caminar.dur, feet: true };
}

const qd = new THREE.Quaternion();
const qt = new THREE.Quaternion();
const AX = new THREE.Vector3();
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
// (de la vuelta del salto: hasta acá despega, desde acá cae; el cuadro de la corrida)
const POUNCE_OFF = 0.12;
const POUNCE_LAND = 0.78;
const POUNCE_RUN_T = 0.22;
const POUNCE_LEAN = 0.3;
// (las piernas, para atrás: estiradas detrás del cuerpo)
const POUNCE_LEGS = 0.5;
// el vuelo del salto (k: 0 despega, 1 cae): qué va
function pounce(S, k) {
  const C = S.clips.salto;
  if (k < POUNCE_OFF) {
    const t = C.takeoff + (k / POUNCE_OFF) * 0.1;
    S.leanNow = leanAt(t);
    return { key: 'salto', t };
  }
  if (k < POUNCE_LAND) {
    S.pounceNow = true;
    return { key: 'correr', t: POUNCE_RUN_T };
  }
  const t = C.land - 0.15 + ((k - POUNCE_LAND) / (1 - POUNCE_LAND)) * 0.15;
  S.leanNow = leanAt(t);
  return { key: 'salto', t };
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
];
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
  if (S.howlK > 0.01 && S.howlLast) {
    const { h, end } = S.howlLast;
    const p = howlAt(h, end);
    const k = S.howlK;
    // (aullando tiembla un poco)
    const howling = h > 0.15 && (end == null || h < end - 0.45) ? 1 : 0;
    const tr = howling * Math.sin((ctx.g?.time || 0) * 21) * 0.025;
    arch += p[0] * k;
    head += (p[1] + tr) * k;
    aw = [p[2], p[3], p[4]];
    ak = Math.min(1, p[2] + p[3] + p[4]) * k;
    shrug += (p[5] + tr * 0.6) * k;
    S.neckK = Math.min(1, Math.max(0, -p[1] / 0.85)) * k;
    S.howlJaw = Math.min(1, Math.max(0, (h - 0.05) / 0.25)) * (end == null ? 1 : Math.min(1, Math.max(0, (end - 0.4 - h) / 0.3))) * k;
    // (el respiro del medio: la boca se entrecierra)
    if (h > 1.2 && h < 1.5) S.howlJaw *= 0.55;
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
  wk = Math.min(1, wk) * (1 - S.howlK) * (1 - (S.pounceK || 0));
  arch += HUNCH.arch * wk;
  head += HUNCH.head * wk;
  fwd += HUNCH.fwd * wk;
  shrug += HUNCH.shrug * wk;
  arms += HUNCH.arms * wk;
  // el salto: todo el cuerpo adelante, desde la cadera (y abalanzado, más)
  S.pounceK = (S.pounceK || 0) + ((S.pounceNow ? 1 : 0) - (S.pounceK || 0)) * Math.min(1, dt * 10);
  S.pounceNow = false;
  const lean = Math.max(S.leanNow || 0, S.pounceK * POUNCE_LEAN);
  S.leanNow = 0;
  S.lean = (S.lean || 0) + (lean - (S.lean || 0)) * Math.min(1, dt * 12);
  if (Math.abs(S.lean) > 1e-3) turn(S, 'Hips', AX, S.lean);
  // abalanzado: la cabeza mirando adelante (no al piso) y las garras al frente
  if (S.pounceK > 0.01) {
    head -= S.lean * 0.6;
    aw = [0, 0, 0, S.pounceK];
    ak = S.pounceK;
    turn(S, 'LeftUpLeg', AX, POUNCE_LEGS * S.pounceK);
    turn(S, 'RightUpLeg', AX, POUNCE_LEGS * 0.7 * S.pounceK);
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
}

// La boca (el hueso luJaw del modelo: la mandíbula de abajo, abre alrededor
// de su x): abierta en el rugido, desde un poco antes del pico hasta que baja
// el hocico (y mientras aúlla a la luna: S.up); gruñendo en el zarpazo y en el salto.
// (poco: la boca del modelo viene cerrada y más abierta estira los dientes y
// la garganta; en el salto, cerrada)
const JAW_MAX = 0.17;
const OPEN = { ruge: 1, zarpazo: 0.5 };
function mouth(S, { dt, g }) {
  const J = S.bones.luJaw;
  if (!J) return;
  S.jawRest ||= J.quaternion.clone();
  let want = 0;
  for (const L of S.layers) {
    const o = OPEN[L.key];
    if (!o) continue;
    const C = S.clips[L.key];
    const t = L.t;
    let k;
    if (L.key === 'ruge') k = Math.min(1, Math.max(0, (t - (C.peak - 0.7)) / 0.45)) * Math.min(1, Math.max(0, (C.peak + 2.2 - t) / 0.6));
    else if (L.key === 'zarpazo') k = Math.max(0, 1 - Math.abs(t - C.hit) / 0.6);
    else k = t > C.takeoff - 0.2 && t < C.land + 0.2 ? 1 : 0;
    want += o * k * L.w;
  }
  want = Math.max(want, S.up || 0, S.howlJaw || 0);
  S.jaw = (S.jaw || 0) + (want - (S.jaw || 0)) * Math.min(1, dt * 9);
  // (abierta, tiembla un poco: gruñe)
  const a = S.jaw * JAW_MAX * (1 + Math.sin((g?.time || 0) * 23) * 0.06 * S.jaw);
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

export default {
  kind: 'luison',
  dir: 'luison',
  loops: ['quieto', 'respira', 'caminar', 'correr'],
  // El aullido y el andar encorvado, sobre la mezcla.
  adjust(S, ctx, z, qYaw) {
    pose(S, ctx, z, qYaw);
  },

  // Después de mover los huesos: el cuello y la boca.
  after(S, ctx, z) {
    if (!z || !S.root.visible) return;
    neck(S);
    mouth(S, ctx);
  },

  // La pelea.
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
      // el aullido (a mano, sobre el quieto): al llegar ya aúlla; aullando y
      // llamando a los muertos, primero el resuello
      case 'intro':
        S.howlNow = { h: Tt, end: LUISON_END.intro };
        S.breathNow = true;
        return { key: 'quieto', t: STAND_T };
      case 'howl':
      case 'summon':
        S.howlNow = { h: Tt - HOWL_AT, end: LUISON_END[st] - HOWL_AT };
        S.breathNow = true;
        return { key: 'quieto', t: STAND_T };
      // enfurecido: el rugido sacudiéndose
      case 'enrage':
        return { key: 'ruge', t: clampT(S, 'ruge', C.ruge.peak - 0.25 + Tt - HOWL_AT) };
      // el zarpazo: la garra pasa cuando pega (slam: a los 0,75 s; el largo, al tirarse)
      case 'slam':
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt - 0.75) };
      case 'whipWind':
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt - 0.8) };
      case 'whip':
        return { key: 'zarpazo', t: clampT(S, 'zarpazo', C.zarpazo.hit + Tt + 0.65 - 0.8) };
      // el salto: se agacha mientras mira, despega al salir y cae al llegar
      case 'chargeWind': {
        const t = C.salto.takeoff * Math.min(1, Tt / 0.85);
        S.leanNow = leanAt(t);
        return { key: 'salto', t };
      }
      case 'charge':
        return pounce(S, Math.min(1, Tt / POUNCE));
      case 'stunned':
        return { key: 'respira', t: null };
      case 'lurk':
        return { key: 'rig' };
    }
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
  cine({ who: L, A }, { S, dt, s }) {
    const C = S.clips;
    const st = L.stateT || 0;
    switch (L.state) {
      // escondido abajo, atrás de la loma: no se dibuja (que no asome nada)
      case 'hide':
        return { key: 'quieto', t: STAND_T, feet: true, hidden: true };
      // sube la cuesta de atrás de la loma caminando, en dos patas (la escena
      // lo lleva parejo de abajo a la cima; los pies en la loma)
      case 'climb': {
        S.plantT = null;
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
          const t = CROUCH_FROM + Math.min(1, crouch / CROUCH_T) * (C.salto.takeoff - CROUCH_FROM);
          S.leanNow = leanAt(t);
          return { key: 'salto', t, pin: true };
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
