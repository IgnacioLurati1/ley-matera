import { clampT, upFor } from '../bossSkin';

// El Sargento ahogado (Mate no Numa) con cuerpo de verdad (entities/bossSkin.js).
// Low poly, con clips propios de la biblioteca de Meshy, por el personaje (un
// sargento de caballería que se ahogó y sigue mandando):
// - quieto: baja el sable, mira y lo levanta;
// - caminar: la marcha apurada del soldado (el paso a tiempo con lo que avanza);
// - correr: enojado, trota pesado (solo cuando va más rápido que la marcha);
// - carga: a la bayoneta, derecho;
// - grito: "¡A degüello, muchachos!", el brazo arriba arengando;
// - estocada: el sablazo de derecha (se tira adelante: saberStep);
// - golpe: el tajo de abajo para arriba;
// - dolor: como un balazo; muere: cae despacio de espaldas.
// El sable es el de las piezas, en la mano derecha. Apuntando la tercerola
// (aim/shoot) lo mueven las piezas: los dos brazos adelante.

// andando (m/s del modelo): quieto, marcha y, pasado RUN_ON, trote
const WALK_ON = 0.35;
const WALK_OFF = 0.2;
const RUN_ON = 2.05;
const RUN_OFF = 1.8;
const RATE_MAX = 1.6;

function move(S, dt, s) {
  const C = S.clips;
  const vm = S.v / Math.max(0.1, s);
  S.run = S.run ? vm > RUN_OFF : vm > RUN_ON;
  if (S.run) {
    S.runT = (S.runT || 0) + dt * Math.max(0.6, Math.min(1.3, vm / C.correr.speed));
    return { key: 'correr', t: S.runT % C.correr.dur };
  }
  S.walking = S.walking ? vm > WALK_OFF : vm > WALK_ON;
  if (S.walking) {
    S.walkT = (S.walkT || 0) + dt * Math.max(0.55, Math.min(RATE_MAX, vm / C.caminar.speed));
    return { key: 'caminar', t: S.walkT % C.caminar.dur };
  }
  S.idleT = (S.idleT || 0) + dt;
  return { key: 'quieto', t: S.idleT % C.quieto.dur };
}

export default {
  kind: 'sargento',
  dir: 'sargento',
  loops: ['quieto', 'caminar', 'correr', 'carga'],
  // el sable (la pieza 17): el puño en la mano, la hoja para abajo
  hand: { part: 17, fore: 'RightForeArm', bone: 'RightHand', grip: 0, fist: 0.04, upright: false },
  alias: { whip: 'RightHand' },
  upAngle: 0.35,

  pick(z, { S, dt, s }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // sale del agua arengando: el brazo arriba al segundo
      case 'intro':
      case 'summon':
      case 'enrage':
        return { key: 'grito', t: clampT(S, 'grito', C.grito.peak - 1 + Tt), up: upFor(Tt - 0.7, 1.4) };
      // el sablazo: arma (whipWind) y se tira adelante (whip, saberStep)
      case 'whipWind':
        return { key: 'estocada', t: clampT(S, 'estocada', C.estocada.hit + Tt - 0.65) };
      case 'whip':
        return { key: 'estocada', t: clampT(S, 'estocada', C.estocada.hit + Tt) };
      // el tajo de abajo para arriba: pega a los 0,75 s
      case 'slam':
      case 'locking':
        return { key: 'golpe', t: clampT(S, 'golpe', C.golpe.hit + (st === 'locking' ? Tt % 0.8 : Tt) - 0.75) };
      // a la bayoneta: el paso a tiempo con lo que avanza
      case 'chargeWind':
        S.chargeT = 0;
        return { key: 'carga', t: 0 };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.6, Math.min(1.5, S.v / Math.max(0.1, s) / C.carga.speed));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      case 'stunned':
      case 'shocked':
      case 'zapped':
        return { key: 'dolor', t: clampT(S, 'dolor', Tt) };
      case 'chase':
      case 'toLock':
        return move(S, dt, s);
    }
    // la tercerola (aim/shoot), el agua y lo demás: las piezas
    return { key: 'rig' };
  },
};
