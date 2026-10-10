import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { skinLook } from '../entities/bossSkin';
import { loadChiquiSkin } from './Chiqui';
import { loadChiquiBlend } from './chiquiBlend';

// guadana5 (iteración 4: "la pelea en el cielo entre Francisco y el
// Chiquitijuein son dos personajes 2D horribles"): los dos de verdad, en 3D,
// enormes en el cielo. Los modelos de siempre (francisco/modelo.glb con sus
// clips de la pelea del Infierno; el Chiquitijuein de Meshy con los clips de
// Blender), una copia de cada uno solo para el cielo: un cuerpo con piel cada
// uno, sin sombras, sin niebla, con un borde de luz propio (oro él, violeta el
// otro) para que se lean contra el cielo de noche. La coreografía (dónde
// están, cuándo tiran, cuándo les pegan, cuándo se lanzan uno sobre el otro)
// la sigue llevando world/eclipseGfxFight.js: acá solo se ponen y se animan.
// Se bajan con el mapa; hasta que están compilados se ven las figuras de
// antes. globalThis.__mduNoSky3d: las figuras planas, como antes.

const DIR = '/assets/sotano/modelos/';
const FADE = 0.22;

// Los clips en el formato del gaucho/jefes (el giro de cada hueso en el
// espacio del modelo por cuadro + la cadera) a THREE.AnimationClip (giros
// locales). (Lo mismo que world/chiquiBlend.js, para cualquier modelo.)
const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
function toClips(scene, J) {
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const names = J.bones;
  if (!names.every((n) => bones[n])) return {};
  const restQ = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const inScene = (o) => {
    const m = new THREE.Matrix4();
    for (let p = o; p && p !== scene; p = p.parent) m.premultiply(tmpM.compose(p.position, p.quaternion, p.scale));
    return m;
  };
  const hipsRest = new THREE.Vector3().setFromMatrixPosition(inScene(bones.Hips));
  const feet = new THREE.Vector3();
  let nf = 0;
  for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'])
    if (bones[n]) {
      feet.add(tmpP.setFromMatrixPosition(inScene(bones[n])));
      nf++;
    }
  feet.multiplyScalar(1 / Math.max(1, nf)).setY(0);
  const hipsParentInv = inScene(bones.Hips.parent).invert();
  const sceneQ = restQ(scene).invert();
  const parentStaticQ = {};
  for (const n of names) {
    const p = bones[n].parent;
    if (!names.includes(p.name)) parentStaticQ[n] = sceneQ.clone().multiply(restQ(p));
  }
  const nb = names.length;
  const out = {};
  for (const [key, c] of Object.entries(J.clips)) {
    const n = c.n || Math.round(c.q.length / (nb * 4));
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
    out[key] = new THREE.AnimationClip(key, (n - 1) / (J.fps || 30), tracks);
  }
  return out;
}

function loadFrancisco() {
  return new Promise((ok) => {
    const base = assetUrl(DIR + 'francisco/');
    const J = fetch(base + 'clips.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    new GLTFLoader().load(
      base + 'modelo.glb',
      async (gl) => {
        const C = await J;
        ok(C ? { scene: gl.scene, clips: toClips(gl.scene, C) } : null);
      },
      undefined,
      () => ok(null),
    );
  });
}
async function loadChiqui() {
  const gl = await loadChiquiSkin();
  if (!gl) return null;
  const clips = Object.fromEntries(gl.animations.map((c) => [c.name, c]));
  const B = await loadChiquiBlend(gl).catch(() => null);
  if (B) Object.assign(clips, B.clips);
  return { scene: gl.scene, clips };
}

// El borde de luz propio (sobre el de los personajes): contra el cielo oscuro
// se lee la silueta. Y un poco de luz propia con su textura.
function skyMat(m, rim, self, dark = 1) {
  const n = m.clone();
  n.fog = false;
  if (dark !== 1 && n.color) n.color.multiplyScalar(dark);
  if ('emissive' in n) {
    n.emissive = new THREE.Color(self);
    if (n.map) n.emissiveMap = n.map;
    n.emissiveIntensity = 1;
  }
  const U = { uSkyRim: { value: new THREE.Color(rim) } };
  n.onBeforeCompile = (sh) => {
    sh.uniforms.uSkyRim = U.uSkyRim;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uSkyRim;\nvoid main() {').replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
	float skR = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
	totalEmissiveRadiance += uSkyRim * skR * skR;`,
    );
  };
  n.customProgramCacheKey = () => 'eclSky3d';
  delete n.userData.skinLook;
  skinLook(n);
  n.userData.sky3d = U;
  return n;
}

// Uno de los dos: su copia del modelo, sus clips y su capa de animación.
class Fighter {
  constructor(src, { rim, self, dark = 1, keep = () => true, eyes = null }) {
    const root = cloneSkinned(src.scene);
    root.updateMatrixWorld(true);
    // (lo suelto que no es piel -el sombrero suelto del Chiquitijuein, que
    // viene en el piso: el cuerpo ya trae el suyo- no va; como world/Chiqui.js)
    const loose = [];
    root.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) loose.push(o);
    });
    for (const o of loose) o.removeFromParent();
    // los ojos encendidos (las marcas eyeA/eyeB del modelo)
    if (eyes) {
      const mat = new THREE.MeshBasicMaterial({ color: eyes.color, toneMapped: false, fog: false });
      const geo = new THREE.SphereGeometry(eyes.r, 10, 8);
      for (const n of ['eyeA', 'eyeB']) {
        const e = root.getObjectByName(n);
        if (!e) continue;
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.scale.setScalar(1 / Math.max(1e-4, e.getWorldScale(tmpP).x));
        e.add(m);
      }
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!keep(o)) {
        o.visible = false;
        return;
      }
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;
      if (o.material?.type === 'MeshBasicMaterial') return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => skyMat(m, rim, self, dark)) : skyMat(o.material, rim, self, dark);
    });
    // el alto en reposo (para la escala) y el medio (para pararlo en q)
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    this.H = Math.max(0.3, box.max.y - box.min.y);
    this.mid = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    this.root = root;
    this.holder = new THREE.Group();
    this.holder.add(root);
    root.position.copy(this.mid).negate();
    this.holder.userData.reflect = false;
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = src.clips;
    this.acts = {};
    this.cur = null;
    this.hold = 0;
  }

  act(name) {
    if (!this.clips[name]) return null;
    return (this.acts[name] ||= this.mixer.clipAction(this.clips[name]));
  }

  // Un clip: loop, desde at s, a speed; dur s (después vuelve al de base).
  play(name, { loop = true, at = 0, speed = 1, dur = 0, fade = FADE } = {}) {
    const a = this.act(name);
    if (!a) return;
    if (this.cur === a && loop) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.time = at;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false);
    else a.fadeIn(fade);
    this.cur = a;
    this.hold = dur;
  }
}

// w: el mundo. Devuelve { ready, update(...), hide() }.
export function buildSky3d(w) {
  const S = { ready: false, F: null, C: null, group: new THREE.Group() };
  S.group.name = 'eclipseSky3d';
  S.group.visible = false;
  // (después de lo lejano y antes de lo transparente cercano, como las figuras planas)
  S.group.renderOrder = -0.5;
  w.root.add(S.group);
  Promise.all([loadFrancisco(), loadChiqui()]).then(([fr, ch]) => {
    if (!fr || !ch || !S.group.parent) return;
    // Francisco: oro (la aureola del de piezas no viene en el modelo: el
    // borde y la luz propia de oro); el Chiquitijuein: negro con borde violeta
    S.F = new Fighter(fr, { rim: new THREE.Color(1.25, 0.82, 0.28), self: new THREE.Color(0.17, 0.12, 0.05) });
    // (negro, con el borde violeta y los ojos colorados: como lo pinta la intro)
    S.C = new Fighter(ch, { rim: new THREE.Color(0.75, 0.22, 1.35), self: new THREE.Color(0, 0, 0), dark: 0.35, eyes: { color: new THREE.Color(3, 0.25, 0.15), r: 0.022 } });
    S.F.base = 'vuelo';
    S.C.base = 'idle';
    S.F.play('vuelo', { speed: 0.7 });
    S.C.play('idle');
    S.group.add(S.F.holder, S.C.holder);
    // se compila antes de mostrarse (si no, el primer cuadro traba)
    const g = w.g;
    const R = g?.renderer;
    const done = () => {
      S.ready = true;
    };
    if (R?.compileAsync && g.camera) {
      S.group.visible = true;
      R.compileAsync(S.group, g.camera, g.scene).then(done, done);
      S.group.visible = false;
    } else done();
  });

  const tmpD = new THREE.Vector3();
  const tmpO = new THREE.Vector3();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const M = new THREE.Matrix4();
  const qLean = new THREE.Quaternion();
  const prev = { F: { cast: 0, hit: 0, dash: 0 }, C: { cast: 0, hit: 0, dash: 0 } };

  // Pone a uno: P (de eclipseGfxFight: q, h, cast, hit), op (el otro), dirOf,
  // R (la distancia), cam, dash (0..1 del choque), EU (el cenit del plano).
  const place = (fi, P, op, who, ctx) => {
    const { dirOf, R, cam, dash, EU, dt } = ctx;
    const pv = prev[who];
    // lo que hace: el de base; tirar (al empezar el gesto); le pegan; se lanza
    if (P.cast > 0 && pv.cast <= 0) {
      if (who === 'F') fi.play('lanzar', { loop: false, at: 0.55, speed: 1.6, dur: 1.0 });
      else fi.play(fi.clips.zap ? 'zap' : 'cast', { loop: false, at: 0.1, speed: 1.4, dur: 1.0 });
    }
    if (P.hit > 0 && pv.hit <= 0) {
      if (who === 'F') fi.play('aturdido', { loop: false, at: 0.25, speed: 1.5, dur: 0.75 });
      else fi.play('hit', { loop: false, at: 0, speed: 1.3, dur: 0.7 });
    }
    if (dash > 0 && pv.dash <= 0) {
      if (who === 'F') fi.play('cielo', { loop: false, at: 0.9, speed: 0.9, dur: 0.95 });
      else fi.play('slam', { loop: false, at: 0.2, speed: 1.2, dur: 0.95 });
    }
    pv.cast = P.cast;
    pv.hit = P.hit;
    pv.dash = dash;
    if (fi.hold > 0) {
      fi.hold -= dt;
      if (fi.hold <= 0) fi.play(fi.base, { speed: who === 'F' ? 0.7 : 1 });
    }
    fi.mixer.update(dt);
    // dónde: a R m de la cámara, en la dirección de q
    dirOf(P.q, tmpD);
    fi.holder.position.copy(cam.position).addScaledVector(tmpD, R);
    // los ejes: arriba = hacia el cenit del plano (sin la parte que va hacia la
    // cámara); de frente, entre la cámara y el otro (tres cuartos)
    Y.copy(EU).addScaledVector(tmpD, -EU.dot(tmpD)).normalize();
    dirOf(op.q, tmpO).sub(tmpD);
    tmpO.addScaledVector(tmpD, -tmpO.dot(tmpD));
    if (tmpO.lengthSq() < 1e-8) tmpO.copy(X.crossVectors(Y, tmpD));
    tmpO.normalize();
    Z.copy(tmpO).multiplyScalar(0.8).addScaledVector(tmpD, -0.75);
    Z.addScaledVector(Y, -Z.dot(Y)).normalize();
    X.crossVectors(Y, Z).normalize();
    M.makeBasis(X, Y, Z);
    fi.holder.quaternion.setFromRotationMatrix(M);
    // se echa adelante cuando se lanza y atrás cuando le pegan
    const lean = 0.75 * Math.sin(Math.min(1, dash) * Math.PI) - 0.5 * Math.min(1, P.hit * 2);
    qLean.setFromAxisAngle(X.set(1, 0, 0), lean);
    fi.holder.quaternion.multiply(qLean);
    fi.holder.scale.setScalar((1.2 * (who === 'C' ? Math.max(P.h, 0.3) : P.h) * R) / fi.H);
  };

  S.update = (dt, ctx, F, C, on) => {
    S.group.visible = !!(on && S.ready);
    if (!S.group.visible) return false;
    const d = { ...ctx, dt };
    place(S.F, F, C, 'F', d);
    place(S.C, C, F, 'C', d);
    return true;
  };
  return S;
}
