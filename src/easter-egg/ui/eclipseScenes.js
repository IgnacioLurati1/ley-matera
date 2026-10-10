import EclipseSable from './eclipseCineSable';
import EclipseSableTrip, { sableTripOn } from './eclipseSableTrip';
import { myId } from '../entities/eclipse/common';
import EclipseEnding, { loadFinClips } from './EclipseEnding';

// Las escenas de Eclipse Matero que corren dentro de la partida (las arma el
// easter egg, entities/EclipseEgg.js: `ee.scenes`).
//  · sable(cb): la Llama abre un desgarro y los cuatro gauchos le alcanzan el
//    Sable al Gil (ui/eclipseCineSable.js); cb() cuando el Sable queda para
//    agarrar. Devuelve false si no puede (el paso muestra el Sable en la Llama).
//  · ending(): la cinemática final (después de San Lorenzo). null mientras no está.
//  · intro: la entrada antes de la ronda 1 va por ui/Intro.js + ui/introShots.js.
// Guiones: scratchpad eclipse/CINEMATICAS.md.
export function makeEclipseScenes(ee) {
  // (se arma cuando el easter egg ya tiene sus pasos: este constructor corre
  // antes; igual es con el mapa, escondido, antes de la compilación de la carga)
  let sable = null;
  Promise.resolve().then(() => {
    if (globalThis.__mduNoEclipseSable === true || ee.disposed) return;
    try {
      sable = new EclipseSable(ee);
    } catch (err) {
      console.error(err);
    }
  });
  // (Game llama ee.sceneCam mientras hay escena: el easter egg no la trae)
  if (!ee.sceneCam) ee.sceneCam = (dt) => (ee.scene ? ee.scene.update(dt) : false);
  // los clips del final, ya (son livianos y así no espera al empezar)
  if (globalThis.__mduNoEclipseFin !== true) loadFinClips();
  // El final (ui/EclipseEnding.js): lo llama EclipseEgg.arenaWon en todas las
  // compus. Al terminar: el logro y el fin de la partida (el anfitrión o solo;
  // los invitados reciben el 'win' del anfitrión).
  const ending = () => {
    const g = ee.g;
    if (ee.scene?.kind === 'eclipse-fin') return true;
    const cine = new EclipseEnding(ee);
    ee.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-fin', cine };
    cine.play(() => {
      if (ee.scene?.cine === cine) ee.scene = null;
      g.hud?.achievement?.('El que cebó el Primer Mate', 'Terminaste el easter egg de Eclipse Matero.');
      if (!g.net || g.net.host) g.win();
    });
    return true;
  };
  return {
    // (sesión 1f: el Gil cruza al Monumento y vuelve con el Sable —ui/eclipseSableTrip—;
    // __mduOldEclSable: los cuatro salen a Eclipse y se lo alcanzan, como antes)
    sable: (cb) => {
      if (!sableTripOn() || !sable || ee.scene) return !!sable?.play(cb);
      const g = ee.g;
      let cine;
      try {
        cine = new EclipseSableTrip(ee, sable);
      } catch (err) {
        console.error(err);
        return !!sable.play(cb);
      }
      ee.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-sable', cine };
      cine.play(() => {
        if (ee.scene?.cine === cine) ee.scene = null;
        const st = ee.steps?.sable;
        if (!st || st.st.done) return;
        // el Sable es del Gil: lo trae en la mano. (Si el Gil no está en esta
        // compu, llega su 'take'; si no llega —se fue—, queda en la Llama.)
        if (ee.isGil()) st.send({ a: 'take', id: myId(g) });
        else g.later(4, () => !st.st.done && cb?.());
      });
      return true;
    },
    ending: globalThis.__mduNoEclipseFin === true ? null : ending,
    // (Alt+I: el final, desde el campo de San Lorenzo si la arena se puede poner)
    debugEnding: () => {
      const g = ee.g;
      g.godMode = true;
      try {
        ee.arena?.start?.();
      } catch (err) {
        console.error(err);
      }
      g.later(1.2, () => (ee.done = true) && ending());
    },
    // (las pruebas y Alt+I: la escena del Sable; Go: el jugador delante de la
    // Llama, mirando hacia el desgarro, y la Llama prendida)
    debugSable: () => sable,
    debugSableGo: () => {
      const g = ee.g;
      const S = sable;
      if (!S) return;
      g.godMode = true;
      const P = g.player;
      P.pos.set(S.L.x + S.f.x * 2.3, S.L.y, S.L.z + S.f.z * 2.3);
      const mx = (S.L.x + S.R.x) / 2 - P.pos.x;
      const mz = (S.L.z + S.R.z) / 2 - P.pos.z;
      P.yaw = Math.atan2(-mx, -mz);
      P.pitch = -0.05;
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      ee.steps.sable.send({ a: 'lit' });
    },
  };
}
