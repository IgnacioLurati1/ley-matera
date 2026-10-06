import * as THREE from 'three';
import { assetUrl } from '../../lib/assets';

// Los clips del Chiquitijuein hechos a mano en Blender (C:/Users/ignac/Tools/
// mdu-blender/chiqui_clips.py: su esqueleto de Meshy, mismos huesos que el
// gaucho; formato de los clips del gaucho: el giro de cada hueso en el espacio
// del modelo por cuadro + la cadera). Acá se pasan a THREE.AnimationClip (giros
// locales) y reemplazan, con el mismo nombre, a los de la biblioteca de Meshy:
// idle (quieto, respira; el cuadro 0 es el del agarre del bastón y el del
// coloso quieto), walk (con el bastón: se clava cada dos pasos, 'taps'),
// slam (el bastonazo: lo levanta con las dos manos y lo clava, 'key'), hit
// (le pegan), cast (invoca), dizzy (aturdido) y muere (nuevo). Los demás
// (taunt y sus gestos, run, throw, scared, zap, scream, kneel) siguen siendo
// los de Meshy. Switch: globalThis.__mduNoChiquiBlend = true (antes de bajar
// el modelo) = como antes; para probar con el switch apagado por defecto:
// globalThis.__mduChiquiBlend = true.

const URL = '/assets/sotano/modelos/chiqui/clips-blend.json';
const DEFAULT_ON = true;
export const chiquiBlendOn = () => globalThis.__mduNoChiquiBlend !== true && globalThis.__mduBlend !== false && (DEFAULT_ON || globalThis.__mduChiquiBlend === true);

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

// gl: el GLTF del Chiqui (su escena en reposo). Devuelve { clips: {nombre: AnimationClip}, meta: {nombre: {...}} } o null.
export async function loadChiquiBlend(gl) {
  if (!chiquiBlendOn()) return null;
  let J;
  try {
    const r = await fetch(assetUrl(URL));
    if (!r.ok) return null;
    J = await r.json();
  } catch {
    return null;
  }
  const scene = gl.scene;
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const names = J.bones;
  if (!names.every((n) => bones[n])) return null;
  // lo de reposo (espacio del modelo = la escena del GLTF): giro de cada padre
  // que no es hueso del clip, la cadera y los pies (la cadera del clip es
  // relativa: hips = cadera - cadera de reposo + pies)
  const restQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const inScene = (o) => {
    const m = new THREE.Matrix4();
    for (let p = o; p && p !== scene; p = p.parent) m.premultiply(tmpM.compose(p.position, p.quaternion, p.scale));
    return m;
  };
  const hipsRest = new THREE.Vector3().setFromMatrixPosition(inScene(bones.Hips));
  const feet = new THREE.Vector3();
  for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) feet.add(tmpP.setFromMatrixPosition(inScene(bones[n])));
  feet.multiplyScalar(0.25).setY(0);
  const hipsParentInv = inScene(bones.Hips.parent).invert();
  const sceneQ = restQ(scene).invert();
  const parentStaticQ = {};
  for (const n of names) {
    const p = bones[n].parent;
    if (!names.includes(p.name)) parentStaticQ[n] = sceneQ.clone().multiply(restQ(p));
  }
  const nb = names.length;
  const out = { clips: {}, meta: {} };
  for (const [key, c] of Object.entries(J.clips)) {
    const n = c.n;
    const times = new Float32Array(n);
    for (let f = 0; f < n; f++) times[f] = f / (J.fps || 30);
    const qv = names.map(() => new Float32Array(n * 4));
    const hv = new Float32Array(n * 3);
    const Qm = names.map(() => new THREE.Quaternion());
    for (let f = 0; f < n; f++) {
      for (let i = 0; i < nb; i++) {
        const o = (f * nb + i) * 4;
        Qm[i].set(c.q[o], c.q[o + 1], c.q[o + 2], c.q[o + 3]);
      }
      for (let i = 0; i < nb; i++) {
        const nm = names[i];
        const pi = names.indexOf(bones[nm].parent.name);
        const pq = pi >= 0 ? Qm[pi] : parentStaticQ[nm];
        tmpQ.copy(pq).invert().multiply(Qm[i]);
        qv[i].set([tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w], f * 4);
      }
      tmpP.set(c.hips[f * 3], c.hips[f * 3 + 1], c.hips[f * 3 + 2]).add(hipsRest).sub(feet).applyMatrix4(hipsParentInv);
      hv.set([tmpP.x, tmpP.y, tmpP.z], f * 3);
    }
    const tracks = names.map((nm, i) => new THREE.QuaternionKeyframeTrack(`${bones[nm].name}.quaternion`, times, qv[i]));
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.Hips.name}.position`, times, hv));
    const dur = (n - 1) / (J.fps || 30);
    out.clips[key] = new THREE.AnimationClip(key, dur, tracks);
    out.meta[key] = { dur, loop: !!c.loop, speed: c.speed ?? 0, key: c.key, hand: c.hand, taps: c.taps, blend: true };
    if (key === 'walk') out.meta[key].stride = (c.speed || 0.2) * dur * 0.5;
  }
  void tmpS;
  return out;
}

// Caminando con el bastón del clip: el "tic" (R.onTap) cuando la punta toca el piso
// (las marcas 'taps' del clip walk), en vez del bastón que se mueve solo (cane).
export function chiquiTaps(R, C) {
  const S = R.skin;
  const L = S?.layers?.find((l) => l.name === 'walk');
  const c = C.walk;
  if (!L || !c?.taps || L.w < 0.5 || !R.cane) {
    if (S) S.tapPrev = null;
    return;
  }
  const ph = ((L.t % c.dur) + c.dur) % c.dur;
  const prev = S.tapPrev;
  S.tapPrev = ph;
  // (arrancando a caminar, el bastón ya está clavado: el primer "tic" es el del cuadro 0)
  if (prev == null) {
    if (ph < 0.15 && c.taps.some((tt) => tt % c.dur === 0)) R.onTap?.();
    return;
  }
  for (const tt of c.taps) {
    const t0 = tt % c.dur;
    const crossed = prev <= ph ? prev < t0 && t0 <= ph : prev < t0 || t0 <= ph;
    if (crossed) R.onTap?.();
  }
}
