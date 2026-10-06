import * as THREE from 'three';

// Las tomas de afuera del vuelo a la Gran Guerra (cine-castillo-vuelo). El
// usuario (2026-10-04): "en la cinemática de vuelo no se veía bien el dragón
// nunca, sus alas aleteaban como robot y torcía el cuello demasiado". Antes la
// cámara iba siempre en el lomo (rideAlong): ahora la escena alterna tomas de
// afuera, que lo muestran entero con las alas, con las del lomo (el paseo de
// los cuatro). La hora es la del vuelo (GranGuerra.ft: la misma en todas las
// compus). Cada toma: dónde está la cámara en el marco del dragón (solo su
// rumbo, sin cabeceo ni rolido) o fija en el mundo, a dónde mira, y el lente;
// dentro de la toma la cámara se mueve suave (sin temblar con el rolido).
// Devuelve false en las tomas del lomo (la cámara de rideAlong queda).
// El usuario (2026-10-04, después de verla): le gustaba más en primera
// persona, en el lomo; que se viera poco el dragón no hacía falta arreglarlo.
// Apagadas: globalThis.__mduFlightShots = true las prende para probarlas.

// t0, t1 (s de vuelo); mode: 'ride' (lomo), 'rel' (pegada al dragón: from/to
// en su marco, se corre de una a otra), 'world' (fija donde quedó al empezar,
// mirando al dragón). at: a dónde mira (marco del dragón). fov.
export const FLIGHT_SHOTS = [
  // despega de la cumbre: de abajo y adelante, se lo ve agacharse, abrir las alas y subir
  // (del sureste y alto, como la toma B de la jura: de más abajo lo tapaba la torre redonda)
  { t0: 0, t1: 2.8, mode: 'world', from: [12, 5, 9], at: [0, 4, 2], fov: [56, 50] },
  // rodea el castillo: de costado y un poco abajo, la cámara pasa de adelante a atrás
  { t0: 2.8, t1: 8.2, mode: 'rel', from: [-17, -3.5, 9], to: [-15, -2, -9], at: [0, 0.5, 1.5], fov: [46, 46] },
  // en el lomo: los cuatro miran el castillo
  { t0: 8.2, t1: 10.9, mode: 'ride' },
  // sube a la tormenta: de abajo y atrás, contra el remolino
  { t0: 10.9, t1: 13.4, mode: 'rel', from: [9, -10, -24], to: [7, -12, -20], at: [0, 1, 2], fov: [50, 54] },
  // sale de las nubes al Éter: de frente y abajo, se viene hacia la cámara (el título arriba)
  // (mirando por arriba de él: el dragón abajo del título)
  { t0: 13.4, t1: 17.4, mode: 'rel', from: [7, -4, 30], to: [9, -3.5, 17], at: [0, 7.5, 0], fov: [46, 52] },
  // en el lomo: pasa rasante sobre la isla y se funde a negro
  { t0: 17.4, t1: 99, mode: 'ride' },
];

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

export function flightShotsOn() {
  return globalThis.__mduFlightShots === true;
}

// A llamar después de rideAlong (que ya movió al dragón y puso la cámara del lomo).
export function flightShot(arena, t, dt) {
  if (!flightShotsOn()) return false;
  const S = FLIGHT_SHOTS.find((s) => t >= s.t0 && t < s.t1);
  const st = (arena.fshot ||= { i: -1, yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), base: new THREE.Vector3(), byaw: 0 });
  if (st.fov0 == null) st.fov0 = arena.g.camera.fov;
  if (!S || S.mode === 'ride') {
    st.i = -1;
    // (vuelve al lente del jugador)
    const cam = arena.g.camera;
    if (Math.abs(cam.fov - st.fov0) > 0.01) {
      cam.fov = st.fov0;
      cam.updateProjectionMatrix();
    }
    return false;
  }
  const D = arena.D;
  const r = D.root;
  const g = arena.g;
  const cam = g.camera;
  const yawNow = arena.rideYaw ?? r.rotation.y;
  const idx = FLIGHT_SHOTS.indexOf(S);
  const fresh = st.i !== idx;
  if (fresh) {
    st.i = idx;
    st.yaw = yawNow;
    st.base.copy(r.position);
    st.byaw = yawNow;
  }
  // el rumbo suave (el de rideAlong ya va topado; acá además sin el rolido)
  let dy = yawNow - st.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  st.yaw += dy * Math.min(1, dt * 2.2);
  const u = smooth(clamp01((t - S.t0) / (S.t1 - S.t0)));
  const off = S.mode === 'world' ? S.from : S.from.map((v, k) => v + (S.to[k] - v) * u);
  const yaw = S.mode === 'world' ? st.byaw : st.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const org = S.mode === 'world' ? st.base : r.position;
  // (marco del dragón: x a su izquierda, z adelante)
  tmpV.set(org.x + off[0] * c + off[2] * s, org.y + off[1], org.z - off[0] * s + off[2] * c);
  const a = S.at;
  tmpW.set(r.position.x + a[0] * Math.cos(st.yaw) + a[2] * Math.sin(st.yaw), r.position.y + a[1], r.position.z - a[0] * Math.sin(st.yaw) + a[2] * Math.cos(st.yaw));
  // (la toma fija no se corre de lugar; la pegada sigue al dragón sin temblar)
  if (fresh || S.mode === 'world') st.pos.copy(tmpV);
  else st.pos.lerp(tmpV, Math.min(1, dt * 6));
  if (fresh) st.look.copy(tmpW);
  else st.look.lerp(tmpW, Math.min(1, dt * (S.mode === 'world' ? 3 : 8)));
  cam.position.copy(st.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(st.look);
  const fov = S.fov[0] + (S.fov[1] - S.fov[0]) * u;
  if (Math.abs(cam.fov - fov) > 0.01) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
  // (la mirada del lomo arranca de nuevo cuando vuelve: no gira desde la de afuera)
  arena.rideQ = null;
  return true;
}

// El lente de siempre al terminar (las tomas de afuera lo cambian).
export function flightShotsEnd(arena, fov) {
  if (!arena.fshot) return;
  fov ??= arena.fshot.fov0;
  arena.fshot = null;
  const cam = arena.g.camera;
  if (fov && Math.abs(cam.fov - fov) > 0.01) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}
