import { clampT } from '../bossSkin';
import { attach, armPose, update as chainUpdate } from '../skinChain';

// El Alcaide con cuerpo de verdad (entities/bossSkin.js): el low poly de Meshy
// (el faldón del sacón repesado entre la cadera y los muslos; la cadena y las
// llaves del cinto enteras) con clips de Mixamo que eligió el usuario. El jefe
// de ronda del penal (y de las rondas mezcladas de la torre): clausura
// máquinas a cachiporrazos, tira la cadena y, enojado, llama a la guardia.
// No corre: camina sobrado (el paso al ritmo de lo que avanza) y, parado,
// revolea la cadena de la mano izquierda (entities/skinChain.js). La tira
// quieto, con la izquierda (el clip espejado). La cachiporra es la pieza 17
// del de piezas, que sigue a la mano derecha.

// caminando o parado (m/s del modelo, con histéresis) y el ritmo máximo del paso
const WALK_ON = 0.2;
const WALK_OFF = 0.1;
const RATE_MAX = 1.65;
// el cachiporrazo: cuándo pega en el clip (clips.json golpe.fast) y cada cuánto
// golpea la máquina que clausura (Zombies 'locking': dos golpes de 0,8 s)
const LOCK_GAP = 0.8;

// Andando: camina (nunca corre) o, parado, revolea la cadena.
function move(S, dt, s) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(0.55, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.chain.want = 1;
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

export default {
  kind: 'alcaide',
  dir: 'alcaide',
  loops: ['quieto', 'caminar', 'carga', 'llama', 'dolor'],
  // la cadena sale de la izquierda (el tiro, espejado: entities/bossMoves.js chainThrow)
  alias: { whip: 'LeftHand' },
  // la cachiporra (bossRig 'baton', pieza 17) en la mano derecha. grip: el
  // mango (y 0,12 de la pieza: la cachiporra corrida -0,2 y el mango a +0,32)
  // en el puño; con 0,3 quedaba toda adelante del puño, sin tocar la mano
  // (el usuario, 2026-10-05)
  // (upright: false: con el brazo colgando, colgando para abajo; parada se
  // metía entera adentro del antebrazo y no se veía)
  hand: { part: 17, fore: 'RightForeArm', bone: 'RightHand', grip: 0.12, upright: false },

  ready(S) {
    attach(S, { side: 'Left', len: 1.3 });
  },

  pick(z, { S, dt, s }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    S.chainShow = true;
    S.chain.want = 0;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.chainShow = false;
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // llega o se enoja: grita
      case 'intro':
      case 'enrage':
        return { key: 'grito', t: clampT(S, 'grito', 0.3 + Tt) };
      // "¡Guardia! ¡Guardia!": llama a los presos agitando la mano
      case 'summon':
        return { key: 'llama', t: Tt % C.llama.dur };
      // la cadena: quieto, la revolea atrás y la suelta al final de whipWind (0,65 s)
      case 'whipWind':
        return { key: 'tira', t: clampT(S, 'tira', C.tira.fast - 0.65 + Tt) };
      case 'whip':
        S.chainShow = false;
        return { key: 'tira', t: clampT(S, 'tira', C.tira.fast + Tt) };
      // el cachiporrazo: pega a los 0,75 s
      case 'slam':
        return { key: 'golpe', t: clampT(S, 'golpe', C.golpe.fast - 0.75 + Tt) };
      // clausura la máquina: dos cachiporrazos
      case 'locking':
        return { key: 'golpe', t: clampT(S, 'golpe', C.golpe.fast - 0.5 + (Tt % LOCK_GAP)) };
      case 'chargeWind':
        return { key: 'grito', t: clampT(S, 'grito', 0.3 + Tt) };
      // la panza por delante, a los tumbos
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.7, Math.min(1.6, S.v / (C.carga.speed * s)));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      // mareado, sin aire
      case 'stunned':
        return { key: 'dolor', t: (0.3 + Tt) % C.dolor.dur };
      case 'chase':
      case 'toLock':
        return move(S, dt, s);
    }
    S.chainShow = false;
    return { key: 'rig' };
  },

  cine() {
    return { key: 'rig' };
  },

  // el brazo que revolea la cadena (sobre el clip)
  adjust(S, { dt }, z, qYaw) {
    armPose(S, dt, qYaw);
  },

  after(S, { dt, g }, z) {
    chainUpdate(S, g, dt, S.chainShow && S.layers[S.layers.length - 1]?.key !== 'rig', z?.baseY || 0);
    S.chainShow = false;
  },
};
