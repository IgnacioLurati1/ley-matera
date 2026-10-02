import * as THREE from 'three';

// El paso de una persona (no el de un muerto) para los muñecos de piezas de
// las escenas: las piernas van y vienen casi parejo (no en seno: así el pie
// apoyado retrocede a la velocidad del cuerpo y no patina en las puntas del
// paso), la rodilla se dobla en el vuelo, y la fase sigue a lo que avanza
// (stepPerson), medida en los pies del cuerpo que tenga: el de verdad
// (entities/skinPuppet, net/gauchoSkin) o el de piezas. Lo usan la intro del
// molino (ui/introShots) y los de escena que caminan (net/Avatars).

// Las piernas (y la cadera que sube y baja) en la fase ph; k: el largo del paso.
export function walkLegs(P, ph, k = 1) {
  const s = Math.sin(ph);
  P.hipY = 0.93 + Math.abs(Math.cos(ph)) * 0.02 * k;
  P.torsoY = s * 0.08 * k;
  P.torsoR = s * 0.03 * k;
  const leg = 0.9 * (2 / Math.PI) * Math.asin(s) + 0.1 * s;
  P.hipLp = leg * 0.42 * k;
  P.hipRp = -leg * 0.42 * k;
  P.hipLr = 0;
  P.hipRr = 0;
  // (la rodilla se dobla en el vuelo, cuando la pierna va para adelante)
  P.knL = 0.06 + Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * 0.62 * k;
  P.knR = 0.06 + Math.max(0, Math.sin(ph + 1.4)) * 0.62 * k;
}

// Lo que avanza `a` por cada radián de la fase (con ese k): cada pie va y
// viene de adelante para atrás (D); apoyado, retrocede D en media vuelta, y en
// la vuelta entera el cuerpo avanza dos veces D. poseAt(ph, k) lo pone
// caminando en el origen mirando a +z (escribe la pose P y a.mats); la pose se
// devuelve como estaba.
const tmpL = new THREE.Vector3();
const tmpR = new THREE.Vector3();
export function strideOf(a, P, k, poseAt) {
  const gs = !a.sk?.on && a.gs?.on ? a.gs : null;
  const model = a.sk?.on ? a.sk.root : gs?.root || null;
  let m = a.strides;
  if (!m || m.model !== model) a.strides = m = { model, by: new Map() };
  const key = Math.round(k * 20);
  if (m.by.has(key)) return m.by.get(key);
  const keep = { ...P };
  const fL = model?.getObjectByName('LeftFoot');
  const fR = model?.getObjectByName('RightFoot');
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  const N = 48;
  for (let i = 0; i < N; i++) {
    poseAt((i / N) * Math.PI * 2, key / 20);
    if (fL && fR) {
      gs?.pose(false);
      model.updateMatrixWorld(true);
      fL.getWorldPosition(tmpL);
      fR.getWorldPosition(tmpR);
    } else {
      tmpL.setFromMatrixPosition(a.mats[11]);
      tmpR.setFromMatrixPosition(a.mats[12]);
    }
    [tmpL, tmpR].forEach((f, j) => {
      lo[j] = Math.min(lo[j], f.z);
      hi[j] = Math.max(hi[j], f.z);
    });
  }
  Object.assign(P, keep);
  const r = Math.max(0.05, (hi[0] - lo[0] + hi[1] - lo[1]) / 2 / Math.PI);
  m.by.set(key, r);
  return r;
}

// Cuánto avanza la fase por `dist` metros recorridos en `dt` (y con qué k):
// si va más rápido que un paso tranquilo (~4.4 rad/s), el paso se alarga un
// poco (hasta k 1.25) en vez de dispararse la cadencia.
export function stepPerson(a, P, dist, dt, k, poseAt) {
  const v = dt > 0 ? dist / dt : 0;
  const kk = Math.min(1.25, Math.max(k, k * Math.sqrt(v / (strideOf(a, P, k, poseAt) * 4.4))));
  return { dph: dist / strideOf(a, P, kk, poseAt), k: kk };
}
