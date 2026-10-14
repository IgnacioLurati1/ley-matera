import { assetUrl } from '../../../lib/assets';

// Los clips nuevos del Boss Rush Mayhem (el usuario dijo que sí, 2026-10-13),
// solo para sus combos (core/rushMayhem.js); la pelea y el rush de siempre no
// los usan. De Mixamo, sobre el modelo de cada jefe, con el control de anim_qa
// (C:/Users/ignac/Tools/mdu-blender/mayhem_clips.py → modelos/<jefe>/clips-mayhem.json):
// - ruge (el Mandinga y el Gil): "Zombie Scream". El aviso del combo: se encorva,
//   abre los brazos y grita para abajo, aguanta y se endereza. Quieto.
// - saltoAtaque (el Espantapájaros): "Standing Melee Run Jump Attack". Tres
//   trancos, salta alto y cae clavando las manos (y la horquilla) adelante. El
//   clip va en el lugar; lo que avanza (travel, m del modelo por cuadro, sacado
//   del pie que pisa: no patina) lo pone el juego moviendo al jefe.

// el grito, en s del clip: arranca encorvándose (t0), grita con los brazos
// abiertos (grita: ahí el aro, el fogonazo y el bramido) y termina derecho (fin)
export const RUGE = { t0: 0.3, grita: 1.05, fin: 2.4 };

const LOADED = {};

// (cada jefe, en su ready: se suman a S.clips cuando llegan)
export function loadMayhemClips(S, kind, dir = kind) {
  fetch(assetUrl(`/assets/sotano/modelos/${dir}/clips-mayhem.json`))
    .then((r) => r.json())
    .then((J) => {
      for (const [k, c] of Object.entries(J.clips)) S.clips[k] = { ...c, q: Float32Array.from(c.q), hips: Float32Array.from(c.hips) };
      (LOADED[kind] ||= {}).clips = S.clips;
    })
    .catch(() => {});
}

// El clip (si ya llegó y no está apagado) y la escala del cuerpo de ese jefe
// (la pone su pick: para pasar lo que avanza el clip a metros del juego).
export const mhClip = (kind, key) => LOADED[kind]?.clips?.[key] || null;
export function mhSetScale(kind, s) {
  (LOADED[kind] ||= {}).s = s;
}
export const mhScale = (kind) => LOADED[kind]?.s || 0;

// Lo que avanzó el clip a los t s (m del modelo, interpolado).
export function mhTravel(c, t) {
  const f = Math.max(0, Math.min(c.n - 1, t * 30));
  const i = Math.min(c.n - 2, Math.floor(f));
  return c.travel[i] + (c.travel[i + 1] - c.travel[i]) * (f - i);
}
