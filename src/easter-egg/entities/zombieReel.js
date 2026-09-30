import * as THREE from 'three';

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
    zs.setState(z, 'chase');
  }
}

// La pose (el anfitrión y el invitado).
export function reelPose(zs, z, t) {
  const g = zs.g;
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
  P.shLr = 1.35 * k + 0.1;
  P.shRr = -1.35 * k - 0.1;
  P.elL = -0.6 - Math.sin(w * 1.3) * 0.3;
  P.elR = -0.5 - Math.cos(w * 1.2) * 0.3;
  const step = Math.sin(w * 0.9);
  P.hipLp = 0.35 * step * k;
  P.hipRp = -0.35 * step * k;
  P.knL = (0.35 + Math.max(0, step) * 0.4) * k;
  P.knR = (0.35 + Math.max(0, -step) * 0.4) * k;
}
