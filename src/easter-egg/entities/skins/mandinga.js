import { clampT } from '../bossSkin';

// El Mandinga con cuerpo de verdad (entities/bossSkin.js), el jefe de la
// Salamanca (world/Arena.js). Low poly, con clips propios de la biblioteca de
// Meshy, elegidos por el personaje (un diablo sobrador, de payador):
// - quieto: la mano en la cintura, canchero;
// - caminar: el paso sobrador. Nunca corre: el paso va a tiempo con lo que
//   avanza (Arena le da una velocidad de caminar);
// - reverencia: llega y saluda, burlón;
// - invoca: los brazos arriba, llama a los peones;
// - conjuro: la bola de fuego, tirada como un lanzador de béisbol (arma el
//   tiro antes de que salga: Arena marca castIn);
// - barrida: el latigazo, barre con el tridente;
// - golpe: salta y clava el tridente en el piso (ya no se usa: de cerca
//   también barre, el salto no gustaba);
// - carga: se tira y se desliza por el piso;
// - dolor: como una cachetada; muere: cae de espaldas.
// El tridente es el de las piezas, en su mano (andando o quieto, parado como
// un bastón: staff).

// andando: quieto por debajo de WALK_OFF, camina desde WALK_ON (m/s del modelo)
const WALK_ON = 0.35;
const WALK_OFF = 0.2;
// lo más rápido que da el paso (más, patina un poco antes que parecer apurado)
const RATE_MAX = 1.45;
// la bola de fuego: cuánto antes de que salga arma el tiro (s)
const WIND = 1.15;

const pingpong = (t, d) => {
  const u = t % (2 * d);
  return u < d ? u : 2 * d - u;
};

function move(S, dt, s) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(0.55, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur, staff: true };
  }
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur, staff: true };
}

export default {
  kind: 'mandinga',
  dir: 'mandinga',
  loops: ['quieto', 'caminar'],
  // el tridente (la pieza 17 de las piezas) en la mano con que pega
  hand: { part: 17, fore: 'RightForeArm', bone: 'RightHand' },
  alias: { whip: 'RightHand' },

  pick(z, { S, dt, g, s }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // llega a la Salamanca y saluda, burlón (la reverencia entera en 1,8 s)
      case 'intro':
        return { key: 'reverencia', t: clampT(S, 'reverencia', 1 + Tt * 1.8) };
      // llama a los peones (los brazos arriba)
      case 'summon':
      case 'enrage':
        return { key: 'invoca', t: clampT(S, 'invoca', Tt * 2.2) };
      // de cerca (y clausurando una máquina): barre con el tridente, sin
      // despegarse del piso; pega cuando pega el golpe (slam, a los 0,75 s)
      case 'slam':
      case 'locking': {
        const k = st === 'locking' ? Tt % 0.8 : Tt;
        return { key: 'barrida', t: clampT(S, 'barrida', C.barrida.hit - (0.75 - k) * 1.2) };
      }
      // el latigazo: arma la barrida y barre cuando sale (whip)
      case 'whipWind':
        return { key: 'barrida', t: clampT(S, 'barrida', C.barrida.hit - (0.65 - Tt) * 1.5) };
      case 'whip':
        return { key: 'barrida', t: clampT(S, 'barrida', C.barrida.hit + Tt * 1.5) };
      // la embestida: se tira y se desliza (el tramo en el piso, de ida y vuelta)
      case 'chargeWind':
        S.chargeT = 0;
        return { key: 'carga', t: clampT(S, 'carga', (Tt / 0.85) * 0.4) };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt;
        return { key: 'carga', t: 0.45 + pingpong(S.chargeT * 0.5, 0.4) };
      case 'stunned':
      case 'shocked':
      case 'zapped':
        return { key: 'dolor', t: clampT(S, 'dolor', Tt) };
      case 'chase':
      case 'toLock':
        break;
      default:
        return { key: 'rig' };
    }
    // la bola de fuego: arma el tiro (castIn, lo que falta) y suelta cuando sale (castAt)
    const since = g.time - (z.castAt ?? -99);
    if (since >= 0 && since < 1.3) return { key: 'conjuro', t: clampT(S, 'conjuro', C.conjuro.hit + since) };
    if (z.castIn != null && z.castIn < WIND && z.castIn > 0) return { key: 'conjuro', t: clampT(S, 'conjuro', C.conjuro.hit - z.castIn) };
    return move(S, dt, s);
  },
};
