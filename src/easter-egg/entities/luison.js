import { arm, leg, ground, stepLegs } from './zombieGaits';
import { LUISON_PREP } from '../core/audio';

// El Luisón (Mate no Numa): el séptimo hijo varón, una bestia enorme entre lobo
// y perro que apesta a muerte. Tiene el cuerpo de los jefes (bossRig,
// LOOKS.luison) con sus propias poses: al acecho, encorvado con los brazos
// largos colgando; corriendo, en cuatro patas (las manos van al piso); el
// salto encima del jugador (charge, en arco); el aullido parado, con el hocico
// a la luna (antes junta aire; enfurecido sacude la cabeza; llamando a los
// muertos clava las manos en el barro); agazapado antes de saltar; el
// zarpazo; y atontado, sentado sacudiendo la cabeza.
// Las usa Zombies (poseGait/poseIdle/poseRoar/poseSlam) cuando z.kind === 'luison'.

const { sin, cos, max, min, abs, PI } = Math;
// lo que dura el salto (charge) y qué tan alto va
export const POUNCE = 0.75;
const POUNCE_H = 1.1;

// Los tiempos del aullido, en segundos del estado (Zombies los usa para
// cambiar de estado y para el vaho que hiela; las poses, para moverse). El
// aullido grabado arranca con un resuello (audio.LUISON_PREP): aullando
// (howl), enfurecido (enrage) y llamando a los muertos (summon) se prepara
// mientras tanto y levanta el hocico justo cuando aúlla. Al llegar (intro) ya
// aúlla: el resuello sonó desde el monte, con la canción.
export const HOWL_AT = LUISON_PREP;
export const LUISON_END = { intro: 3.0, howl: 3.6, enrage: 2.5, summon: 2.4 };
// cuándo clava las manos en el barro para levantar a los muertos (summon)
export const SUMMON_POUND = 0.45;
// el aullido grabado: la primera tirada, un respiro y la segunda (desde que aúlla)
const BREATH = 1.25;

const ease = (x) => {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return x * x * (3 - 2 * x);
};

// Poses de a pedazos que se mezclan (del resuello al aullido, del aullido a
// volver a encorvarse).
const KEYS = ['rootY', 'rootPitch', 'torsoP', 'torsoY', 'torsoR', 'headP', 'headY', 'headR', 'shLp', 'shLr', 'shRp', 'shRr', 'elL', 'elR', 'hipLp', 'hipLr', 'hipRp', 'hipRr', 'knL', 'knR'];
const A = {};
const B = {};
function mix(P, a, b, k) {
  for (const key of KEYS) P[key] = a[key] + (b[key] - a[key]) * k;
}

function still(P) {
  P.rootY = 0;
  P.rootPitch = 0;
  P.torsoY = 0;
  P.torsoR = 0;
  P.headY = 0;
  P.headR = 0;
}

// Anda o corre. speed: lo que avanza de verdad (m/s).
export function luisonGait(z, dt, speed, t) {
  const P = z.P;
  const run = z.speedType !== 'walk' || speed > 3.2 || z.state === 'charge';
  z.phase += dt * (run ? 1.5 : 2.3) * max(0.6, speed);
  const ph = z.phase;
  const s = sin(ph);
  still(P);
  if (run) {
    // al galope, en cuatro patas: el lomo casi horizontal, la cabeza levantada
    // mirando adelante; las manos van juntas al piso y después las patas
    // (la cabeza va firme, contra el vaivén del lomo: no pierde de vista a la presa)
    P.torsoP = 1.18 + s * 0.08;
    P.torsoY = s * 0.05;
    P.torsoR = sin(ph * 0.5) * 0.04;
    P.headP = -1.05 - s * 0.06;
    P.headY = sin(t * 0.8) * 0.08 - P.torsoY;
    const hang = -P.torsoP;
    for (let i = 0; i < 2; i++) {
      const f = ph + i * 0.35;
      arm(P, i, hang - sin(f) * 0.8, 0.14, -0.15 - max(0, sin(f)) * 0.7);
    }
    for (let i = 0; i < 2; i++) {
      const f = ph + PI + i * 0.35;
      leg(P, i, -0.95 + sin(f) * 0.55, 0.12, 1.9 + max(0, -cos(f)) * 0.35);
    }
    ground(P, max(0, cos(ph)) * 0.07);
    // el salto: arco hacia arriba, las garras adelante bien abiertas y las
    // patas estiradas atrás; al final las junta abajo para caer
    if (z.state === 'charge') {
      const k = min(1, z.stateT / POUNCE);
      const arc = sin(k * PI);
      const land = ease((k - 0.7) / 0.3);
      P.rootY = arc * POUNCE_H;
      P.torsoP = 0.85 - arc * 0.3;
      P.headP = -0.95 + arc * 0.25;
      P.headY = 0;
      arm(P, 0, -1.9 + k * 0.8, 0.45, -0.3 - land * 0.4);
      arm(P, 1, -1.9 + k * 0.8, 0.45, -0.3 - land * 0.4);
      leg(P, 0, 0.55 - land * 1.5, 0.14, 0.35 + land * 1.2);
      leg(P, 1, 0.7 - land * 1.45, 0.14, 0.45 + land * 1.1);
      ground(P);
    }
    return;
  }
  // al acecho: encorvado, los brazos largos colgando con las garras abiertas
  P.torsoP = 0.78 + s * 0.04;
  P.torsoR = s * 0.06;
  P.headP = -0.62 + sin(t * 1.1) * 0.06;
  P.headY = sin(t * 0.5) * 0.25;
  arm(P, 0, -0.5 - s * 0.4, 0.28, -0.4);
  arm(P, 1, -0.5 + s * 0.4, 0.28, -0.4);
  stepLegs(P, ph, 0.42, 0.75, 0.8, 0.1);
  ground(P);
}

// Agazapado en el pajonal (k de 0 a 1: Zombies.render, por dónde está): la
// panza casi al piso, las patas dobladas abajo del cuerpo, las manos adelante
// y la cabeza gacha mirando al frente; gatea con el mismo paso (z.phase). La
// paja (2,3-3 m) lo tapa entero sin hundirlo en el piso. Mezcla sobre P (la
// pose que ya armó la de andar o la de quieto).
const LOW = {};
export function luisonLow(z, P, k, t) {
  const Q = LOW;
  const ph = z.phase || 0;
  const s = sin(ph);
  Q.rootY = P.rootY;
  Q.rootPitch = 0;
  Q.torsoP = 1.5 + s * 0.04;
  Q.torsoY = s * 0.07;
  Q.torsoR = sin(ph * 0.5) * 0.03;
  Q.headP = -1.38 + sin(t * 1.1) * 0.05;
  Q.headY = P.headY;
  Q.headR = 0;
  for (let i = 0; i < 2; i++) {
    const f = ph + i * PI;
    // las manos: una adelante y la otra atrás, apoyando las garras
    arm(Q, i, -Q.torsoP - 0.25 - sin(f) * 0.4, 0.24, -0.7 - max(0, sin(f)) * 0.5);
    // las patas: bien dobladas abajo de la panza, empujando de a una
    leg(Q, i, -1.6 - sin(f) * 0.22, 0.26, 2.55 + max(0, cos(f)) * 0.15);
  }
  ground(Q);
  for (const key of KEYS) P[key] += (Q[key] - P[key]) * k;
  P.hipY += (Q.hipY - P.hipY) * k;
}

// Quieto: encorvado, resopla (se le hinchan los hombros) y olfatea el aire.
export function luisonIdle(z, t) {
  const P = z.P;
  const b = sin(t * 1.7);
  still(P);
  P.torsoP = 0.8 + b * 0.05;
  P.headP = -0.55 + max(0, sin(t * 0.9)) * 0.25;
  P.headY = sin(t * 0.45) * 0.4;
  arm(P, 0, -0.35 + b * 0.06, 0.3 + b * 0.05, -0.45);
  arm(P, 1, -0.35 + b * 0.06, 0.3 + b * 0.05, -0.45);
  leg(P, 0, -0.35, 0.12, 0.85);
  leg(P, 1, -0.2, 0.12, 0.75);
  ground(P);
}

// ---------------- el aullido ----------------
// Juntando aire (u: de 0 a 1 del resuello): se agacha, baja el hocico, se le
// hincha el pecho y le tiembla el lomo.
function gather(Q, u, t) {
  const b = sin(u * PI);
  const q = sin(t * 24) * 0.015 * u;
  Q.rootY = 0;
  Q.rootPitch = 0;
  Q.torsoP = 0.95 + u * 0.15 - b * 0.12;
  Q.torsoY = 0;
  Q.torsoR = q;
  Q.headP = -0.45 + u * 0.35 + q;
  Q.headY = 0;
  Q.headR = 0;
  arm(Q, 0, -0.75 - u * 0.2, 0.35 + b * 0.25, -0.5);
  arm(Q, 1, -0.75 - u * 0.2, 0.35 + b * 0.25, -0.5);
  leg(Q, 0, -0.6 - u * 0.2, 0.15, 1.1 + u * 0.3);
  leg(Q, 1, -0.45 - u * 0.2, 0.15, 1.0 + u * 0.3);
}

// Enfurecido, antes de aullar: sacude la cabeza de lado a lado, tira
// zarpazos al aire con una garra y la otra, y pisotea.
function thrash(Q, t) {
  const s = sin(t * 17);
  const a = sin(t * 8.5);
  Q.rootY = 0;
  Q.rootPitch = 0;
  Q.torsoP = 0.55 + sin(t * 8.5 + 0.6) * 0.12;
  Q.torsoY = s * 0.3;
  Q.torsoR = sin(t * 8.5 + 1) * 0.1;
  Q.headP = -0.5 + sin(t * 11) * 0.15;
  Q.headY = sin(t * 19) * 0.55;
  Q.headR = s * 0.25;
  arm(Q, 0, -1.3 - max(0, a) * 1.2, 0.5, -0.4 - max(0, a) * 0.6);
  arm(Q, 1, -1.3 - max(0, -a) * 1.2, 0.5, -0.4 - max(0, -a) * 0.6);
  leg(Q, 0, -0.4 + a * 0.15, 0.18, 0.7 + max(0, a) * 0.3);
  leg(Q, 1, -0.2 - a * 0.15, 0.18, 0.6 + max(0, -a) * 0.3);
}

// Llamando a los muertos, antes de aullar: levanta las dos manos, las clava
// en el barro (SUMMON_POUND; Zombies.luisonPound) y escarba.
function pound(Q, st, t) {
  Q.rootY = 0;
  Q.rootPitch = 0;
  Q.torsoY = 0;
  Q.torsoR = 0;
  Q.headY = 0;
  Q.headR = 0;
  if (st < SUMMON_POUND) {
    const e = ease(st / SUMMON_POUND);
    Q.torsoP = 0.5 - e * 0.65;
    Q.headP = -0.6 - e * 0.2;
    arm(Q, 0, -1.0 - e * 1.9, 0.35, -0.4 - e * 0.5);
    arm(Q, 1, -1.0 - e * 1.9, 0.35, -0.4 - e * 0.5);
    leg(Q, 0, -0.4, 0.2, 0.7);
    leg(Q, 1, -0.2, 0.2, 0.6);
    return;
  }
  const e = min(1, (st - SUMMON_POUND) / 0.1);
  const dig = st > SUMMON_POUND + 0.15 ? sin(t * 16) * 0.1 : 0;
  Q.torsoP = -0.15 + e * 1.45;
  Q.headP = -0.8 + e * 0.1;
  arm(Q, 0, -2.9 + e * 1.55 + dig, 0.3, -0.9 + e * 0.6);
  arm(Q, 1, -2.9 + e * 1.55 - dig, 0.3, -0.9 + e * 0.6);
  leg(Q, 0, -0.3 - e * 0.9, 0.2, 0.7 + e * 0.9);
  leg(Q, 1, -0.2 - e * 0.6, 0.2, 0.6 + e * 0.8);
}

// Aullando (p: segundos desde que aúlla): parado, el lomo arqueado para
// atrás, el hocico a la luna y los brazos abiertos con las garras temblando.
// Entre las dos tiradas del aullido respira (baja un poco la cabeza) y la
// segunda la tira más alto.
function howling(Q, p, t) {
  const dip = max(0, 1 - abs(p - BREATH) / 0.14);
  const second = p > BREATH ? 1 : 0;
  const vib = sin(t * 34) * 0.012 + sin(t * 5.5) * 0.03;
  const q = sin(t * 13) * 0.04;
  Q.rootY = 0;
  Q.rootPitch = 0;
  Q.torsoP = -0.32 + dip * 0.3 - second * 0.06;
  Q.torsoY = sin(t * 0.9) * 0.05;
  Q.torsoR = 0;
  Q.headP = -1.15 - second * 0.15 + dip * 0.5 + vib;
  Q.headY = sin(t * 0.7) * 0.08;
  Q.headR = sin(t * 9) * 0.03;
  arm(Q, 0, -0.85 - dip * 0.2 + q, 1.2 - dip * 0.3, -1.0);
  arm(Q, 1, -0.85 - dip * 0.2 - q, 1.2 - dip * 0.3, -1.0);
  leg(Q, 0, -0.3, 0.16, 0.55);
  leg(Q, 1, 0.12, 0.16, 0.4);
}

// Encorvado, como anda al acecho (a lo que vuelve al terminar de aullar).
function hunch(Q) {
  Q.rootY = 0;
  Q.rootPitch = 0;
  Q.torsoP = 0.8;
  Q.torsoY = 0;
  Q.torsoR = 0;
  Q.headP = -0.58;
  Q.headY = 0;
  Q.headR = 0;
  arm(Q, 0, -0.4, 0.3, -0.45);
  arm(Q, 1, -0.4, 0.3, -0.45);
  leg(Q, 0, -0.35, 0.12, 0.85);
  leg(Q, 1, -0.2, 0.12, 0.75);
}

// Segundos desde que aúlla de verdad (negativo: todavía se prepara).
function howlTime(z) {
  return z.state === 'intro' ? z.stateT : z.stateT - HOWL_AT;
}

// Parado aullándole a la luna (intro, aullido, cuando se enfurece y cuando
// llama a los muertos); agazapado antes de saltar (chargeWind).
export function luisonRoar(z, t) {
  const P = z.P;
  still(P);
  const st = z.stateT;
  if (z.state === 'chargeWind') {
    // clavado mirando a la víctima, menea el lomo como el gato antes de saltar
    const k = min(1, st / 0.85);
    const q = sin(t * 30) * 0.02 * k;
    const w = sin(t * 13) * 0.07 * k;
    P.torsoP = 1.05 + k * 0.2;
    P.torsoY = w;
    P.torsoR = -w * 0.6;
    P.headP = -1.1 - k * 0.1;
    P.headY = -w * 0.8;
    arm(P, 0, -1.2 - k * 0.2 + q, 0.35, -0.9);
    arm(P, 1, -1.2 - k * 0.2 - q, 0.35, -0.9);
    leg(P, 0, -1.2 - k * 0.2, 0.15, 2.1 + k * 0.2);
    leg(P, 1, -1.1 - k * 0.2, 0.15, 2.0 + k * 0.2);
    ground(P);
    return;
  }
  const end = LUISON_END[z.state] ?? 1.8;
  const p = howlTime(z);
  // antes de aullar (al llegar: agachado, recién salido del monte)
  if (z.state === 'enrage') thrash(A, t);
  else if (z.state === 'summon') pound(A, st, t);
  else gather(A, z.state === 'intro' ? 1 : min(1, st / HOWL_AT), t);
  if (p <= 0) mix(P, A, A, 0);
  else {
    howling(B, p, t);
    mix(P, A, B, ease(p / 0.3));
  }
  // y al final vuelve a encorvarse para salir corriendo
  const left = end - st;
  if (left < 0.35) {
    hunch(B);
    mix(P, P, B, ease(1 - left / 0.35));
  }
  ground(P);
}

// Cuánto abre la boca (bossRig la mueve): aullando, bien abierta y temblando
// (entre las dos tiradas la entrecierra); juntando aire, entreabierta;
// enfurecido, tira tarascones; saltando y dando zarpazos, los colmillos al
// aire; corriendo, jadea.
export function luisonJaw(z, t) {
  const st = z.state;
  const end = LUISON_END[st];
  if (end != null) {
    const p = howlTime(z);
    if (end - z.stateT < 0.3) return 0.15;
    if (p < 0) return st === 'enrage' ? 0.4 + sin(t * 17) * 0.2 : 0.22;
    const dip = max(0, 1 - abs(p - BREATH) / 0.14);
    return 0.72 - dip * 0.4 + sin(t * 34) * 0.03;
  }
  if (st === 'chargeWind' || st === 'whipWind' || st === 'whip' || st === 'charge' || st === 'slam') return 0.45;
  if (st === 'stunned') return 0.3 + sin(t * 3) * 0.05;
  if (st === 'chase') return 0.16 + max(0, sin(t * 7)) * 0.1;
  return 0.12;
}

// Atontado (se la dio contra la pared): sentado sobre las patas, la cabeza le
// da vueltas y cada tanto la sacude como un perro mojado.
export function luisonDazed(z) {
  const P = z.P;
  still(P);
  const st = z.stateT;
  const c = st % 1.4;
  const shake = c < 0.35 ? sin(st * 40) * (1 - c / 0.35) : 0;
  P.torsoP = 0.35 + sin(st * 1.7) * 0.06;
  P.torsoR = sin(st * 2.1) * 0.12;
  P.headP = -0.1 + cos(st * 2.1) * 0.15;
  P.headY = shake * 0.6 + sin(st * 2.1) * 0.2;
  P.headR = sin(st * 2.1 + 1) * 0.2 + shake * 0.3;
  arm(P, 0, -0.2, 0.25, -0.2);
  arm(P, 1, -0.15, 0.25, -0.25);
  leg(P, 0, -1.3, 0.3, 2.1);
  leg(P, 1, -1.25, 0.3, 2.05);
  ground(P);
}

// El zarpazo (k: segundos del golpe): levanta la garra derecha atrás y la baja
// cruzando; la izquierda acompaña. Pega a los ~0.75 s (como poseSlam).
export function luisonSlam(z, k) {
  const P = z.P;
  still(P);
  leg(P, 0, -0.5, 0.14, 0.9);
  leg(P, 1, 0.2, 0.14, 0.6);
  if (k < 0.6) {
    const e = k / 0.6;
    P.torsoP = 0.5 - e * 0.55;
    P.torsoY = e * 0.45;
    P.headP = -0.5;
    arm(P, 1, -0.6 - e * 2.3, 0.3 + e * 0.2, -0.4 - e * 0.9);
    arm(P, 0, -0.6, 0.35, -0.6);
  } else if (k < 0.85) {
    const e = (k - 0.6) / 0.25;
    P.torsoP = -0.05 + e * 0.95;
    P.torsoY = 0.45 - e * 1.0;
    P.headP = -0.5 + e * 0.1;
    arm(P, 1, -2.9 + e * 3.1, 0.5 - e * 0.7, -1.3 + e * 1.1);
    arm(P, 0, -0.6 - e * 0.6, 0.35, -0.6);
  } else {
    const e = min(1, (k - 0.85) / 0.55);
    P.torsoP = 0.9 - e * 0.15;
    P.torsoY = -0.55 * (1 - e);
    P.headP = -0.45;
    arm(P, 1, 0.2 - e * 0.7, -0.2 + e * 0.5, -0.2 - e * 0.2);
    arm(P, 0, -1.2 + e * 0.7, 0.35, -0.6);
  }
  ground(P);
}
