import * as THREE from 'three';
import * as Armas from '../core/armas';
import { VOLTEO } from '../weapons/especialistas';

// Lo que le hace al zombie el escudo (world/ShieldUpgrade): 'reel' tambalea
// para atrás (el escudazo, el Empuje del molino, el vapor de la torre) y
// 'zapped' queda temblando electrocutado (la Descarga de la granja). Los dos
// son estados de verdad (viajan en la foto del anfitrión: net/Session STATES),
// así el invitado lo ve igual. z.reelT: cuánto le queda; z.reelV: el empujón.

const tmpV = new THREE.Vector3();

// En el anfitrión (y jugando solo): se mueve con el empujón y vuelve a perseguir.
export function reelStep(zs, z, dt, t) {
  const g = zs.g;
  z.reelT = (z.reelT || 0) - dt;
  const v = z.reelV;
  if (v && (v.x || v.z)) {
    const by = z.baseY || 0;
    z.pos.x += v.x * dt;
    z.pos.z += v.z * dt;
    const k = Math.max(0, 1 - dt * 6);
    v.x *= k;
    v.z *= k;
    g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
    const nf = g.world.floorAt(z.pos.x, z.pos.z, by);
    // (no se cae de un piso a otro por un empujón: si abajo no hay piso, se queda)
    if (Math.abs(nf - by) < 0.6) z.baseY = nf;
    z.pos.y = z.baseY || 0;
  }
  reelPose(zs, z, t);
  if (z.reelT <= 0) {
    z.reelV = null;
    // (el volteado se levantó: el cuerpo, derecho otra vez)
    if (z.state === 'volteado') {
      z.P.rootPitch = 0;
      z.P.rootY = 0;
    }
    zs.setState(z, 'chase');
  }
}

// La pose (el anfitrión y el invitado).
export function reelPose(zs, z, t) {
  const g = zs.g;
  if (z.state === 'volteado') return volteadoPose(zs, z, t);
  if (z.state === 'zapped') {
    zs.poseShock(z, t);
    if (Math.random() < 0.35) g.fx.electric(tmpV.set(z.pos.x, (z.baseY || 0) + 0.5 + Math.random() * 1.2, z.pos.z), 2);
    return;
  }
  const P = z.P;
  // para atrás de golpe, la cabeza tirada, los brazos abiertos buscando el
  // equilibrio y las piernas dando pasos cortos hacia atrás
  const st = z.stateT || 0;
  const k = Math.min(1, st * 7) * Math.min(1, Math.max(0, (z.reelT ?? 0.5) * 3 + 0.2));
  const w = t * 12 + (z.phase || 0);
  // (sin tocar rootPitch: el andar no lo vuelve a cero)
  P.rootY = 0;
  P.torsoP = -0.7 * k + Math.sin(w * 0.7) * 0.06;
  P.torsoR = Math.sin(w * 0.55) * 0.18 * k;
  P.headP = -0.7 * k;
  P.headR = Math.sin(w * 0.5) * 0.3 * k;
  P.shLp = -0.9 * k + Math.sin(w) * 0.5;
  P.shRp = -0.7 * k + Math.cos(w * 1.1) * 0.5;
  // (abiertos de verdad: el izquierdo está en -x y se abre con el giro negativo
  // —skeleton.js, como zombieGaits—; con el signo al revés las manos se
  // cruzaban en X adelante del pecho. El usuario, 2026-10-16, con el tambaleo
  // de la escopeta. globalThis.__mduBrazosViejos = true: como antes, también
  // en el volteado de abajo y en la caída de Zombies.poseDeath)
  const ab = globalThis.__mduBrazosViejos ? 1 : -1;
  P.shLr = ab * (1.35 * k + 0.1);
  P.shRr = -ab * (1.35 * k + 0.1);
  P.elL = -0.6 - Math.sin(w * 1.3) * 0.3;
  P.elR = -0.5 - Math.cos(w * 1.2) * 0.3;
  const step = Math.sin(w * 0.9);
  P.hipLp = 0.35 * step * k;
  P.hipRp = -0.35 * step * k;
  P.knL = (0.35 + Math.max(0, step) * 0.4) * k;
  P.knR = (0.35 + Math.max(0, -step) * 0.4) * k;
}

// La cornada del Asta de Toro (weapons/especialistas.js): cae de espaldas,
// queda en el piso pataleando y se levanta (cae VOLTEO.cae s, el piso lo que
// diga ESP.cornada.volteo y se levanta en VOLTEO.sube s). Con el reloj del
// estado: el invitado lo ve igual por la foto de la red.
export function volteadoPose(zs, z, t) {
  const P = z.P;
  zs.g.weapons?.oper?.volt?.add(z);
  const st = z.stateT || 0;
  const piso = Armas.ESP.cornada.volteo;
  const k1 = sm(st / VOLTEO.cae);
  // se levanta: de acostado a sentado y de sentado a parado
  const up = sm((st - VOLTEO.cae - piso) / VOLTEO.sube);
  const lie = k1 * (1 - up);
  const w = t * 7 + (z.phase || 0);
  // (en el piso, las piernas y los brazos se mueven buscando pararse)
  const kick = Math.sin(w) * 0.25 * lie * (st > VOLTEO.cae ? 1 : 0);
  // a medio levantar: sentado, con el torso adelante
  const sit = Math.sin(up * Math.PI);
  P.rootPitch = -(Math.PI / 2) * lie;
  P.rootY = 0.14 * lie + sit * 0.05;
  P.hipY = 0.92 - 0.12 * lie - sit * 0.3;
  P.torsoP = 0.1 * lie + sit * 0.55;
  P.torsoR = Math.sin(w * 0.5) * 0.12 * lie;
  P.headP = -0.4 * k1 * (1 - up) + sit * 0.2;
  P.headR = Math.sin(w * 0.4) * 0.25 * lie;
  P.shLp = -2.6 * lie - sit * 0.6 + kick;
  P.shRp = -2.3 * lie - sit * 0.5 - kick;
  // (los brazos arriba de la cabeza, abiertos: con el signo al revés las manos se cruzaban, como en el tambaleo)
  const ab = globalThis.__mduBrazosViejos ? 1 : -1;
  P.shLr = ab * (0.9 * lie + 0.1);
  P.shRr = -ab * (0.8 * lie + 0.1);
  P.elL = -0.3 - 0.4 * lie;
  P.elR = -0.6 - 0.3 * lie;
  P.hipLp = 0.1 * lie + kick * 0.8 - sit * 1.2;
  P.hipRp = -0.2 * lie - kick * 0.8 - sit * 1.0;
  P.knL = 0.4 * lie + Math.max(0, kick) + sit * 1.5;
  P.knR = 0.2 * lie + Math.max(0, -kick) + sit * 1.3;
}

const sm = (x) => {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
};
