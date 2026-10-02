import * as THREE from 'three';
import { clampT } from '../bossSkin';

// Francisco con cuerpo de verdad (entities/bossSkin.js): qué clip va en cada
// estado de la pelea del Infierno (world/Infierno.js, sobre world/Arena.js) y
// en la escena del final (ui/TowerCinematic.js). Low poly, con clips propios
// de la biblioteca de Meshy (nadie más los usa) y de Mixamo (los que eligió
// el usuario): el Eterno, un viejo triste que se cree un santo.
// - Parado, triste (quieto); esperando, predica con los brazos abiertos (sermon).
// - Anda como un viejo (caminar) y, apurado, no corre: flota hacia vos con
//   los brazos abiertos y las piernas colgando (vuelo, un tramo del sermón).
// - Llega levantándose del piso (arise).
// - El golpe de cerca: el brazo barre (latigo, como el latigazo; el salto con
//   el puño al piso no gustaba). La onda dorada sale igual.
// - El latigazo: el brazo barre y se estira (latigo).
// - La bola de oro: plantado, los dos brazos arriba y adelante (lanzar;
//   Arena lo frena mientras arma y suelta). Flotando en los rituales, solo
//   los brazos.
// - Antes de embestir junta poder con los brazos al cielo (poder) y embiste
//   volando, echado adelante con los brazos atrás (cielo).
// - En los rituales flota rezando (reza); atontado se queda parado y se
//   tambalea (el de cubrirse y retroceder parecía que recibía un golpe).
// - Muere sacudido por su propio poder, con los brazos en cruz, y cae de
//   rodillas mirando arriba (muere); ahí se queda de rodillas (rodillas): así
//   lo toma la escena del final.
//
// Lo que no es clip:
// - Flotando (vuelo, embestida, rituales): la cadera arriba, el cuerpo echado
//   adelante y las piernas colgando, con las puntas para abajo.
// - La aureola: la de piezas (la escena la quiebra y la clona desde su
//   matrixWorld) sigue a la cabeza del modelo y se ve.
// - El brillo de oro (setGlow del Infierno, las grietas de la escena): lo de
//   los materiales del de piezas pasa al modelo.
// - Se deshace en polvo de oro (la escena): de los pies a la cabeza, según las
//   piezas que la escena ya escondió.

// el latigazo: cuándo se estira el brazo (s del clip latigo)
const THROW = 1.0;
// la bola de oro: cuánto antes arma el tiro (Arena CAST_WIND)
const CAST_WIND = 1.0;
// (y cuánto queda plantado después: Arena CAST)
const CAST_AFTER = 0.5;
// muerto: de rodillas (s del clip muere); después cae de cara, eso no
const KNEEL = 4.0;
// andando (m/s del modelo, sin escala): camina desde WALK_V y flota desde GLIDE_ON
const WALK_V = 0.3;
const GLIDE_ON = 0.6;
const GLIDE_OFF = 0.45;
// (el paso nunca más rápido que esto: más, y las piernas van como en cámara rápida)
const RATE_MAX = 1.5;
// flotando: lo alto (m del modelo) y lo echado adelante (rad)
const HOVER = 0.3;
const LEAN_GLIDE = 0.2;
const LEAN_DASH = 0.5;
// embistiendo: el cuadro de cielo con los brazos atrás
const DASH_T = 1.13;
// en los rituales: el rezo, sin las puntas del tramo
const RITE_T = 0.3;
// el orden en que la escena lo deshace (ui/TowerCinematic CRUMBLE): hasta qué
// alto del cuerpo (en reposo, m del modelo) ya no está
const CRUMBLE_Y = [0.12, 0.5, 0.95, 0.95, 1.1, 1.35, 1.55, 2.0];
// tirando una bola de oro flotando en un ritual (Infierno.ritual): el torso
// y los dos brazos (lanzar), sobre el rezo
const THROW_BONES = { Spine01: 0.5, Spine: 0.8, neck: 0.5, LeftShoulder: 1, LeftArm: 1, LeftForeArm: 1, LeftHand: 1, RightShoulder: 1, RightArm: 1, RightForeArm: 1, RightHand: 1 };
const THROW_DUR = 0.85;
// (desde los brazos arriba; a los 0,2 s ya están adelante)
const EMP_T0 = 0.95;
const LEGS = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

const q = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ax = new THREE.Vector3();
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();
// la aureola, desde el hueso de la cabeza (m del modelo): arriba y atrás
const HALO_UP = 0.1;
const HALO_BACK = -0.13;
const HALO_AT = new THREE.Vector3(0, HALO_UP, HALO_BACK);
// los ojos: el alto (en reposo, m del modelo) y lo que se achican ya libre
const EYE_Y = 1.68;
const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();
const v = new THREE.Vector3();
const vs = new THREE.Vector3();

// ida y vuelta (los clips que no cierran la vuelta)
const pingpong = (t, d) => {
  const u = t % (2 * d);
  return u < d ? u : 2 * d - u;
};
const smooth = (k) => k * k * (3 - 2 * k);

// Andando: camina, flota o predica (el paso, con lo que avanza de verdad).
function move(S, dt, s, z) {
  const C = S.clips;
  // (lo que avanza de verdad, sin pasarse de lo que puede: un salto de lugar
  // -el Eterno desaparece y aparece- no lo pone a volar)
  const vm = Math.min(S.v, (z.speed || 4) * 1.15) / Math.max(0.1, s);
  S.glide = S.glide ? vm > GLIDE_OFF : vm > GLIDE_ON;
  if (S.glide) {
    S.glideT = (S.glideT || 0) + dt;
    return { key: 'vuelo', t: pingpong(S.glideT * 0.35, C.vuelo.dur) };
  }
  if (vm > WALK_V) {
    S.walkT = (S.walkT || 0) + dt * Math.min(RATE_MAX, vm / C.caminar.slide);
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

// La bola de oro en los rituales: cuando aparece una nueva cerca de él (en el
// anfitrión y en los invitados, que la reciben por la red), los brazos la tiran.
function throwArm(S, dt, g, z, qYaw) {
  const A = g.arena;
  const list = A?.active ? A.fireballs : null;
  const n = list?.length || 0;
  if (z && !z.dead && n > (S.fbN || 0)) {
    const f = list[n - 1].mesh.position;
    if (Math.hypot(f.x - z.pos.x, f.z - z.pos.z) < 4) S.throwT = 0;
  }
  S.fbN = n;
  if (S.throwT == null || !z || z.dead || inCine(z, g) || z.state !== 'fall') {
    S.throwT = null;
    return;
  }
  S.throwT += dt;
  const u = S.throwT;
  if (u > THROW_DUR) {
    S.throwT = null;
    return;
  }
  // (entra rápido, sale de a poco)
  const w = Math.min(1, u / 0.1) * Math.min(1, (THROW_DUR - u) / 0.3);
  const cl = S.clips.lanzar;
  const f = Math.min(cl.n - 1, Math.max(0, (EMP_T0 + u) * S.fps));
  const f0 = Math.floor(f);
  const f1 = Math.min(cl.n - 1, f0 + 1);
  const al = f - f0;
  for (const [name, k] of Object.entries(THROW_BONES)) {
    const d = S.byName[name];
    if (!d) continue;
    const i = S.list.indexOf(d);
    q.fromArray(cl.q, (f0 * S.nb + i) * 4).slerp(qx.fromArray(cl.q, (f1 * S.nb + i) * 4), al).premultiply(qYaw);
    d.W.slerp(q, w * k);
  }
}

// ¿Es el Francisco de la escena del final?
const inCine = (z, g) => !!g.cine && g.cine.franZ === z;

export default {
  kind: 'francisco',
  dir: 'francisco',
  loops: ['quieto', 'sermon', 'caminar', 'rodillas'],
  // el latigazo sale de la mano que baja en el clip (la derecha)
  alias: { whip: 'RightHand' },

  ready(S) {
    // el cuerpo en reposo (alto de cada vértice) para deshacerse de abajo para arriba
    S.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      S.mesh = o;
      const mat = o.material;
      S.mat = mat;
      mat.emissive = new THREE.Color(0xffa020);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0;
      const U = (S.crumbleU = { uCut: { value: -1 } });
      // (el mismo recorte en todo lo que dibuja el cuerpo: el color, las
      // sombras y el G-buffer de la calidad épica, si no queda un fantasma)
      const cutPatch = (sh) => {
        sh.uniforms.uCut = U.uCut;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRestY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestY = position.y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vRestY;\nuniform float uCut;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vRestY < uCut) discard;');
      };
      mat.onBeforeCompile = (sh) => {
        cutPatch(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat edge = uCut > -0.5 ? 1.0 - smoothstep(0.0, 0.06, vRestY - uCut) : 0.0;\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.35) * edge * 3.0;');
      };
      mat.customProgramCacheKey = () => 'francisco-skin';
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      const dist = new THREE.MeshDistanceMaterial();
      for (const [m, k] of [[depth, 'd'], [dist, 'x']]) {
        m.onBeforeCompile = cutPatch;
        m.customProgramCacheKey = () => 'francisco-cut-' + k;
      }
      o.customDepthMaterial = depth;
      o.customDistanceMaterial = dist;
      // (el G-buffer lo pide solo mientras se deshace: userData.gbuf lo trata como pasto)
      S.gbuf = { key: 'franciscoCut', patch: cutPatch };
    });
    // la aureola del de piezas (la que la escena quiebra)
    S.halo = null;
  },

  // La pelea (y la escena del final, que usa el mismo jefe).
  pick(z, { S, dt, s, g }) {
    S.fly = 0;
    if (inCine(z, g)) return { key: 'rig' };
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      // sacudido por su poder, en cruz, y de rodillas mirando arriba (ahí se queda)
      S.deadT = (S.deadT ?? -dt) + dt;
      const u = S.deadT * 1.3;
      if (u < KNEEL) return { key: 'muere', t: u };
      return { key: 'rodillas', t: ((u - KNEEL) / 1.3) % C.rodillas.dur };
    }
    S.deadT = null;
    switch (st) {
      // llega levantándose del piso (la llegada dura 1,8 s)
      case 'intro':
        return { key: 'arise', t: clampT(S, 'arise', Tt) };
      // de cerca: el brazo barre y pega a los 0,75 s (la onda dorada sale ahí)
      case 'slam':
      case 'locking': {
        const k = st === 'locking' ? Tt % 0.8 : Tt;
        return { key: 'latigo', t: clampT(S, 'latigo', THROW - (0.75 - k) * 1.1) };
      }
      // el latigazo: echa el brazo atrás y lo estira cuando pega (al pasar a whip)
      case 'whipWind':
        return { key: 'latigo', t: clampT(S, 'latigo', THROW - (0.65 - Tt) * 1.1) };
      case 'whip':
        return { key: 'latigo', t: clampT(S, 'latigo', THROW + Tt * 1.2) };
      // junta poder (agachado, los brazos al cielo) y sale volando derecho
      case 'chargeWind':
        return { key: 'poder', t: clampT(S, 'poder', 0.5 + Tt * 1.35) };
      case 'charge':
        S.fly = 2;
        return { key: 'cielo', t: DASH_T };
      // atontado: parado, se tambalea (adjust)
      case 'stunned':
        S.idleT = (S.idleT || 0) + dt;
        return { key: 'quieto', t: S.idleT % C.quieto.dur };
      // flotando sobre el trono (los rituales): reza con las manos juntas
      case 'fall':
        S.floatT = (S.floatT || 0) + dt;
        S.riteT = RITE_T + pingpong(S.floatT * 0.5, C.reza.dur - 2 * RITE_T);
        return { key: 'reza', t: S.riteT };
    }
    if (st !== 'chase' && st !== 'toLock') return { key: 'rig' };
    // la bola de oro: plantado, arma el tiro (castIn, lo que falta) y suelta cuando sale (castAt)
    const hit = C.lanzar.throw;
    const since = g.time - (z.castAt ?? -99);
    if (since >= 0 && since < CAST_AFTER) return { key: 'lanzar', t: clampT(S, 'lanzar', hit + since) };
    if (z.castIn != null && z.castIn > 0 && z.castIn < CAST_WIND) return { key: 'lanzar', t: clampT(S, 'lanzar', hit - z.castIn) };
    if (z.holdT > 0) {
      S.idleT = (S.idleT || 0) + dt;
      return { key: 'sermon', t: S.idleT % C.sermon.dur };
    }
    const w = move(S, dt, s, z);
    if (w.key === 'vuelo') S.fly = 1;
    return w;
  },

  // Después de mezclar: flotando (vuelo, embestida, rituales), la cadera arriba,
  // el cuerpo echado adelante y las piernas colgando; atontado, se tambalea.
  adjust(S, { dt, g, s }, z, qYaw, hipsW) {
    throwArm(S, dt, g, z, qYaw);
    if (!z) return;
    const cine = inCine(z, g);
    const rite = !cine && z.state === 'fall' && !z.dead;
    const fly = cine || z.dead ? 0 : S.fly || 0;
    S.floatK = Math.max(0, Math.min(1, (S.floatK || 0) + (rite || fly ? dt : -dt) / 0.35));
    // (lo echado adelante: más embistiendo)
    const leanTo = fly === 2 ? LEAN_DASH : fly === 1 ? LEAN_GLIDE : 0;
    S.lean = (S.lean || 0) + (leanTo - (S.lean || 0)) * Math.min(1, dt * 5);
    const t = g.time;
    // atontado: la cabeza y el torso van y vienen
    const dz = !cine && !z.dead && z.state === 'stunned' ? 1 : 0;
    S.dizzy = (S.dizzy || 0) + (dz - (S.dizzy || 0)) * Math.min(1, dt * 4);
    if (S.dizzy > 0.01) {
      ax.copy(Z).applyQuaternion(qYaw);
      for (const [name, a] of [['Spine01', 0.06], ['Spine', 0.07], ['neck', 0.1], ['Head', 0.14]]) {
        const d = S.byName[name];
        if (d) d.W.premultiply(qx.setFromAxisAngle(ax, Math.sin(t * 2.6) * a * S.dizzy));
      }
    }
    if (S.floatK <= 0) return;
    const k = smooth(S.floatK);
    // la cadera: en los rituales, la altura de verdad; volando, un poco arriba y meciéndose
    if (rite) {
      // (el rezo es de rodillas: la cadera del clip baja; flotando, va donde la pone el ritual)
      const cl = S.clips.reza;
      const f = Math.min(cl.n - 1, Math.max(0, Math.round((S.riteT || 0) * S.fps)));
      hipsW.y += ((z.P?.rootY || 0) - cl.hips[f * 3 + 1] * s) * k;
    }
    else hipsW.y += (HOVER + Math.sin(t * 2.2) * 0.03) * s * k;
    for (const name of LEGS) {
      const d = S.byName[name];
      if (!d) continue;
      const right = name.startsWith('Right');
      const sw = Math.sin(t * 1.3 + (right ? 1.4 : 0)) * 0.08;
      // (embistiendo, las piernas quedan atrás)
      const back = fly === 2 ? 0.25 : 0;
      const bend = name.endsWith('UpLeg') ? -0.12 + sw - back : name.endsWith('Leg') ? 0.3 - sw * 0.5 + back : 0.75;
      qx.setFromAxisAngle(X, bend);
      q.copy(qYaw).multiply(qx).multiply(d.rest);
      d.W.slerp(q, k);
    }
    // todo el cuerpo echado adelante, alrededor de la cadera
    if (S.lean > 0.005) {
      ax.copy(X).applyQuaternion(qYaw);
      qx.setFromAxisAngle(ax, S.lean * k);
      for (const d of S.list) d.W.premultiply(qx);
    }
  },

  // Después de mover los huesos: la aureola, el brillo y el polvo de oro.
  after(S, { g, zs }, z) {
    const R = zs.bossRig;
    const root = S.root;
    if (!root.visible || !z) return;
    const cine = inCine(z, g) ? g.cine : null;
    // el brillo: el de los materiales del cuerpo de piezas (la camisa brilla menos)
    const BM = zs.bossMats;
    if (BM && S.mat) {
      const src = BM.skin?.emissive ? BM.skin : BM.cloth;
      S.mat.emissive.copy(src.emissive);
      S.mat.emissiveIntensity = Math.max(BM.skin?.emissiveIntensity || 0, BM.cloth?.emissiveIntensity || 0) * 0.7;
    }
    // el polvo de oro: hasta dónde ya se deshizo (la escena esconde las piezas de a grupos)
    let cut = -1;
    if (cine && cine.ascT != null) {
      const n = cine.crumbled || 0;
      if (n > 0) {
        const u = cine.t - cine.ascT - (2.4 + (n - 1) * 0.34);
        const a = CRUMBLE_Y[n - 1];
        const b = CRUMBLE_Y[Math.min(CRUMBLE_Y.length - 1, n)];
        cut = a + (b - a) * Math.max(0, Math.min(1, u / 0.34));
      } else cut = 0.02 * Math.max(0, cine.t - cine.ascT - 2.2);
    }
    if (S.crumbleU) S.crumbleU.uCut.value = cut;
    if (S.mat) {
      if (cut > -0.5) S.mat.userData.gbuf = S.gbuf;
      else delete S.mat.userData.gbuf;
    }
    // ya deshecho del todo: no queda nada (la escena deja de mover al jefe)
    if (cut >= 1.99) {
      root.visible = false;
      return;
    }
    // los ojos: libre (la aureola rota) se apagan de a poco y quedan los de
    // un hombre; se van con la cabeza
    const free = cine && cine.freeT != null ? Math.min(1, (cine.t - cine.freeT) / 1.2) : 0;
    const ek = cut > EYE_Y ? 0 : 1 - free * 0.85;
    for (const n of ['eyeA', 'eyeB']) {
      const e = S.bones[n]?.children[0];
      if (!e) continue;
      e.userData.s0 ||= e.scale.clone();
      e.scale.copy(e.userData.s0).multiplyScalar(Math.max(1e-3, ek));
      e.visible = ek > 0.02;
    }
    // la aureola: la de piezas, sobre la cabeza del modelo
    if (!S.halo || S.halo.parent !== R.parts[2]) {
      S.halo = R.parts[2]?.children.find((o) => o.isGroup && o.children[0]?.geometry?.parameters?.radius === 0.17) || null;
      S.haloOn = false;
    }
    const H = S.halo;
    if (!H) return;
    if (!S.haloOn) {
      H.traverse((o) => o.layers.set(0));
      S.haloOn = true;
    }
    // detrás del centro de la cabeza del modelo (el hueso Head está en la nuca),
    // girando con ella; el tamaño, el de la pieza de la cabeza
    const head = S.bones.Head;
    const hd = S.byName.Head;
    head.getWorldPosition(v);
    q.copy(head.getWorldQuaternion(q)).multiply(qx.copy(hd.rest).invert());
    R.parts[2].updateWorldMatrix(true, false);
    R.parts[2].matrixWorld.decompose(tv, tq, vs);
    v.addScaledVector(HALO_AT.applyQuaternion(q), root.scale.x);
    HALO_AT.set(0, HALO_UP, HALO_BACK);
    m4.compose(v, tq.copy(q).multiply(qx.setFromAxisAngle(Z, H.rotation.z)), vs);
    // (la aureola cuelga de la pieza: se la pone en el espacio de la pieza)
    m4b.copy(R.parts[2].matrixWorld).invert().multiply(m4);
    m4b.decompose(H.position, H.quaternion, H.scale);
  },
};
