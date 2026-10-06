import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { crewIds } from './cineCrew';
import { cineClip, gauchoClip, poseCineClip, headProp, FACE_EYES, whenGaucho } from '../net/gauchoSkin';
import { assetUrl } from '../../lib/assets';

// Los cuatro gauchos en las entradas de la torre (y su Challenge), el castillo
// y el monumento (ui/introShots.js), animados con los clips de Blender
// (C:/Users/ignac/Tools/mdu-blender: penal_clips.py, torre_clips.py,
// introB_clips.py) y cada uno con su personalidad (ui/cineCrew PERSONA, por
// lugar: 0 Valiente, 1 Miedoso, 2 Canchero, 3 Viejo).
//
// plan: las escenas con gauchos, cada una [t0, t1) en segundos de la entrada:
//   spots: [x, z, yaw] de cada uno (yaw: hacia dónde mira; 0 es +z)
//   acts: por gaucho, [[segundo, clip, { loop, look, yaw, fade, off }] ...]
//     (de uno al otro se mezcla `fade` segundos desde el anterior, que sigue
//     corriendo: sin saltos; off: por dónde arranca un clip en vuelta, para
//     que no respiren todos juntos)
//   light: [x, y, z, color, intensidad, alcance] (opcional): una luz de relleno
//     mientras dura la escena (de las virtuales de World.adoptLight: no cambia
//     la cuenta de luces ni recompila nada).
// Todo sale del segundo de la entrada (sin estado): en línea, en la carga y
// al saltar se ve lo mismo.
// shades: 'on' (el Canchero ya los tiene puestos) o el segundo en que se los
// pone (el clip 'shades' de cine-penal: en la mano a los 0,55 s, puestos a 1,15).

const FILES = ['cine-penal.json', 'cine-torre.json', 'cine-introB.json'];
let CLIPS = null;
let LOAD = null;
function loadClips() {
  LOAD ||= Promise.all(
    FILES.map((f) =>
      fetch(assetUrl(`/assets/sotano/modelos/gaucho/${f}`))
        .then((r) => r.json())
        .catch(() => null),
    ),
  ).then((all) => {
    const C = {};
    for (const J of all) if (J) for (const [k, c] of Object.entries(J.clips)) C[k] ||= cineClip(c);
    CLIPS = C;
  });
  return LOAD;
}
const clipOf = (name) => CLIPS?.[name] || gauchoClip(name);

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
// (el giro más corto de a a b)
const turnTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const floorRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const SH_HAND = 0.55;
const SH_ON = 1.15;

// Los anteojos de sol del Canchero (los mismos de PenalCinematic.buildShades),
// en el espacio de la malla: centímetros, +z adelante.
function buildShades() {
  const root = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.7, roughness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.3 });
  const E = FACE_EYES;
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.1, 0.4, 20).rotateX(Math.PI / 2), glass);
    lens.scale.y = 0.85;
    lens.position.set(E.x + sx * (E.half + 0.4), E.y - 1.3, 17.3);
    root.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 13), gold);
    arm.position.set(E.x + sx * (E.half + 4), E.y - 0.4, 11);
    root.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2 * E.half - 6, 0.5, 0.45), gold);
  bridge.position.set(E.x, E.y + 0.6, 17.4);
  root.add(bridge);
  return root;
}

export function introCrew(g, plan, { base = 480, shades = null } = {}) {
  loadClips();
  // los clips de siempre (net/gauchoSkin, clips.json) se piden recién al primer
  // uso: jugando solo, eso era en Intro.warm, que no los tenía todavía. Los cuatro
  // no se veían en la carga y su variante del G-buffer (fx/Epic, la malla con
  // huesos) se compilaba en plena entrada, al aparecer: un cuadro de ~60 ms
  // (monumento, 2026-10-05). Se piden ya, con el mapa armado detrás del título
  // (apenas está el modelo: sin él, gauchoClip todavía no los pide).
  // globalThis.__mduNoCrewClipsEarly: como antes
  if (globalThis.__mduNoCrewClipsEarly !== true) whenGaucho(() => gauchoClip('idle'));
  const people = new Avatars(g, null);
  const crew = crewIds(g).map((id, i) => {
    people.add({ id: base + id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false });
    const a = people.list.get(base + id);
    a.group.visible = false;
    a.hand.visible = false;
    return { i, a, ys: new Map() };
  });
  // los anteojos: uno en la mano (mientras se los pone) y otro en la cabeza
  const C = crew[2];
  const shHead = shades != null ? buildShades() : null;
  const shHand = shades != null && shades !== 'on' ? new THREE.Group() : null;
  if (shHand) {
    shHand.add(buildShades());
    shHand.matrixAutoUpdate = false;
    shHand.visible = false;
    people.root.add(shHand);
  }
  let shWrap = null;
  const fill = new THREE.PointLight(0xffffff, 0, 10, 2);
  g.world.adoptLight?.(fill, 2);
  people.root.add(fill);
  // (2026-10-04, el usuario: en la entrada de la torre atravesaban el piso. El
  // piso del mapa (floorAt) da 0 y el entablonado de la planta baja está a 24 cm:
  // el piso es el de la malla que se ve, si está un poco más arriba (sin pasto
  // ni nada instanciado o recortado).
  // globalThis.__mduNoCrewRayFloor: como antes)
  const floorY = (c, st, x, z) => {
    let y = c.ys.get(st);
    if (y == null) {
      y = g.world.floorAt?.(x, z, (st.y ?? 0) + 1.2);
      if (!Number.isFinite(y)) y = st.y ?? 0;
      if (globalThis.__mduNoCrewRayFloor !== true && g.world.root) {
        floorRay.set(tmpV.set(x, y + 0.8, z), DOWN);
        floorRay.far = 1.2;
        // (los sprites del mundo la piden)
        floorRay.camera = g.camera;
        const h = floorRay.intersectObject(g.world.root, true).find((o) => o.object.isMesh && !o.object.isInstancedMesh && !o.object.material?.transparent && !(o.object.material?.alphaTest > 0));
        if (h && h.point.y > y + 0.01 && h.point.y < y + 0.5) y = h.point.y;
      }
      c.ys.set(st, y);
    }
    return y;
  };

  // la pose de uno en el segundo t de la escena st
  const pose = (c, st, t) => {
    const a = c.a;
    const acts = st.acts[c.i];
    let k = 0;
    while (k + 1 < acts.length && acts[k + 1][0] <= t) k++;
    const [ta, name, o = {}] = acts[k];
    if (!clipOf(name)) return false;
    const [x, z, yaw0] = st.spots[c.i];
    // un acto en el segundo tt: su clip, su tiempo y si da vueltas
    const at = (act, tt) => {
      const [t1, n1, oo = {}] = act;
      const c1 = clipOf(n1);
      const lt = Math.max(0, tt - t1) + (oo.loop ? (oo.off ?? c.i * 0.37) : 0);
      return { c: c1, t: oo.loop ? lt : Math.min(lt, c1?.dur ?? 0), loop: !!oo.loop };
    };
    const cur = at(acts[k], t);
    const look = (oo) => oo.look ?? st.look ?? 0;
    const yawOf = (oo) => oo.yaw ?? yaw0;
    const opt = { loop: cur.loop, look: look(o) };
    let yaw = yawOf(o);
    const fade = o.fade ?? 0.35;
    if (k > 0 && t - ta < fade) {
      const po = acts[k - 1][2] || {};
      const prev = at(acts[k - 1], t);
      if (prev.c) {
        const w = smooth(clamp01((t - ta) / fade));
        opt.from = prev;
        opt.w = w;
        opt.look = look(po) + (opt.look - look(po)) * w;
        yaw = turnTo(yawOf(po), yaw, w);
      }
    }
    return poseCineClip(a, cur.c, cur.t, x, floorY(c, st, x, z), z, yaw, opt);
  };

  const placeShades = (t, shown) => {
    if (!shHead) return;
    const a = C.a;
    if (!shWrap && a.gs?.on) shWrap = headProp(a, shHead);
    const on = shades === 'on' || t >= shades + SH_ON;
    const inHand = !on && t >= shades + SH_HAND;
    shHead.visible = shown && on;
    if (!shHand) return;
    shHand.visible = shown && inHand && !!a.gs?.on;
    if (!shHand.visible) return;
    // en la mano, ya derechos como van en la cara (PenalCinematic.updateShades)
    const B = a.gs.bones;
    const sk = a.gs.mesh.skeleton;
    const hi = sk.bones.indexOf(B.Head);
    tmpM.copy(B.Head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(a.gs.mesh.bindMatrix);
    const hand = B.RightHand.getWorldPosition(tmpV);
    tmpW.set(FACE_EYES.x, FACE_EYES.y, 16.4).applyMatrix4(tmpM);
    shHand.matrix.copy(tmpM).premultiply(tmpM2.makeTranslation(hand.x - tmpW.x, hand.y - tmpW.y, hand.z - tmpW.z));
    shHand.matrixWorldNeedsUpdate = true;
  };

  let forced = null;
  const update = (t) => {
    const st = forced || plan.find((p) => t >= p.t0 && t < p.t1);
    const tt = forced ? forced.t0 + 0.5 : t;
    let any = false;
    for (const c of crew) {
      const a = c.a;
      // (sin mate: tienen las manos ocupadas o no viene al caso)
      a.hand.visible = false;
      if (a.gun) a.gun.visible = false;
      const ok = !!st && !!CLIPS && pose(c, st, tt);
      a.group.visible = ok;
      any ||= ok;
    }
    placeShades(tt, any);
    const L = any && st.light;
    fill.intensity = L ? L[4] : 0;
    if (L) {
      fill.position.set(L[0], L[1], L[2]);
      fill.color.set(L[3]);
      fill.distance = L[5];
    }
  };
  return {
    update,
    // la carga: cada escena a la vista un cuadro (Intro.warm)
    warm(on) {
      forced = on ? plan[0] : null;
      update(0);
      // (los pisos de todas las escenas, en la carga: los rayos no van en la entrada)
      if (on) for (const st of plan) for (const c of crew) floorY(c, st, st.spots[c.i][0], st.spots[c.i][1]);
    },
    hide() {
      forced = null;
      for (const c of crew) c.a.group.visible = false;
      if (shHead) shHead.visible = false;
      if (shHand) shHand.visible = false;
      fill.intensity = 0;
    },
    // (las pruebas: la cadera de cada uno, cuadro a cuadro)
    debugCrew: () => crew.map((c) => c.a),
    // (las pruebas: el piso de cada uno se vuelve a medir si se mueven los lugares)
    debugFloor: () => crew.forEach((c) => c.ys.clear()),
    dispose() {
      shWrap?.removeFromParent();
      people.dispose();
    },
  };
}
