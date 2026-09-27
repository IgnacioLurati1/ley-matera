// Cómo camina, corre, pega y espera cada zombie. Antes todos se movían igual;
// ahora cada uno saca de su id (igual en el anfitrión y en el invitado) un
// estilo para caminar, otro para correr, otro para esprintar y otro para pegar,
// más unas perillas propias (largo del paso, ritmo, inclinación, altura de los
// brazos) para que ni los del mismo estilo se vean clonados.
//
// Convenciones del esqueleto (entities/skeleton.js), con el cuerpo mirando a +z:
// - pitch negativo en hombro/cadera: brazo/pierna hacia adelante; rodilla
//   positiva flexiona; codo negativo flexiona; torsoP positivo se inclina.
// - el lado 0 ("L") está en x negativo y el 1 ("R") en x positivo; hacia afuera
//   es roll negativo del lado 0 y positivo del lado 1 (arm/leg lo resuelven).
// - P.yawOff gira el cuerpo entero respecto de hacia dónde avanza (el cangrejo).

const WALK = ['shamble', 'onearm', 'hunch', 'drag', 'lurch'];
const RUN = ['lope', 'crab', 'flail', 'stagger', 'charge'];
const SPRINT = ['feral', 'crab', 'ape', 'flail'];
const HIT = ['slam', 'swipe', 'lunge', 'claw'];

const PI = Math.PI;
const { sin, cos, abs, max, min } = Math;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};

function pick(r, list, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let x = r() * total;
  for (let i = 0; i < list.length; i++) if ((x -= weights[i]) < 0) return list[i];
  return list[0];
}

// Lo que define el andar de un zombie (r: el rng de su id).
export function gaitOf(r) {
  return {
    walk: pick(r, WALK, [28, 16, 20, 16, 20]),
    // el cangrejo (de costado) y el mono (en cuatro patas) son raros: si no,
    // de tan vistos dejan de asustar
    run: pick(r, RUN, [30, 5, 25, 22, 18]),
    sprint: pick(r, SPRINT, [40, 6, 10, 44]),
    hit: pick(r, HIT, [28, 26, 24, 22]),
    // de qué lado va el cangrejo / qué brazo levanta / qué pierna arrastra
    side: r() < 0.5 ? -1 : 1,
    stride: 0.85 + r() * 0.3,
    tempo: 0.9 + r() * 0.22,
    lean: (r() - 0.35) * 0.22,
    arm: (r() - 0.5) * 0.45,
    sway: 0.7 + r() * 0.7,
    head: (r() - 0.4) * 0.3,
  };
}

// brazo i: pitch, cuánto se abre hacia afuera y codo
export function arm(P, i, pitch, out, elbow) {
  if (i === 0) {
    P.shLp = pitch;
    P.shLr = -out;
    P.elL = elbow;
  } else {
    P.shRp = pitch;
    P.shRr = out;
    P.elR = elbow;
  }
}

export function leg(P, i, pitch, out, knee) {
  if (i === 0) {
    P.hipLp = pitch;
    P.hipLr = -out;
    P.knL = knee;
  } else {
    P.hipRp = pitch;
    P.hipRr = out;
    P.knR = knee;
  }
}

// Qué tan abajo queda el pie de una pierna (desde la cadera), con los largos del esqueleto.
function legDrop(p, r, k) {
  const cr = cos(r);
  const cp = cos(p);
  return 0.03 + 0.43 * cr * cp + 0.45 * (cr * cp * cos(k) - sin(p) * sin(k));
}

// La cadera a la altura justa para que el pie que apoya toque el piso (ni flota ni se hunde).
export function ground(P, lift = 0) {
  const a = legDrop(P.hipLp, P.hipLr, P.knL);
  const b = legDrop(P.hipRp, P.hipRr, P.knR);
  P.hipY = max(a, b) + 0.02 + lift;
}

// Paso adelante de las dos piernas (la 1 media vuelta atrás de la 0).
// La rodilla se dobla en el vuelo (cuando la pierna viene para adelante).
export function stepLegs(P, ph, amp, kBase, kAmp, out = 0, lame = -1, limp = 0) {
  for (let i = 0; i < 2; i++) {
    const f = ph + i * PI;
    const swing = max(0, -cos(f + 0.4));
    let pitch = amp * sin(f) - swing * amp * 0.25;
    let knee = kBase + kAmp * swing + max(0, cos(f)) * kBase * 0.4;
    if (i === lame) {
      pitch *= 1 - limp * 0.5;
      knee = kBase * 0.5 + (knee - kBase) * (1 - limp * 0.8);
    }
    leg(P, i, pitch, out, knee);
  }
}

function base(P, z, G, t) {
  P.headY = sin(t * 0.7 + z.slot) * 0.15;
  P.headR = z.headTilt;
  P.torsoY = 0;
  P.torsoR = 0;
  P.yawOff = 0;
}

// ---------------- caminar ----------------
const WALK_K = { shamble: 2.7, onearm: 2.7, hunch: 3.3, drag: 2.3, lurch: 2.8 };

function walk(z, P, ph, G, t) {
  const s = sin(ph);
  const c = cos(ph);
  const s2 = sin(ph * 2);
  const st = G.walk;
  const sw = G.sway;
  base(P, z, G, t);
  const lame = z.limp > 0 ? (G.side > 0 ? 0 : 1) : -1;
  if (st === 'hunch') {
    // encorvado, con los brazos colgando que se bambolean y la cabeza arriba mirando
    P.torsoP = 0.62 + G.lean + s2 * 0.04;
    P.torsoR = s * 0.16 * sw;
    P.torsoY = s * 0.1;
    P.headP = -0.62 + G.head * 0.5 + s2 * 0.06;
    P.headR += s * 0.1;
    const hang = -P.torsoP - 0.1;
    arm(P, 0, hang + sin(ph - 0.6) * 0.38, 0.06, -0.3 - max(0, sin(ph - 0.6)) * 0.3);
    arm(P, 1, hang - sin(ph - 0.6) * 0.38, 0.06, -0.3 - max(0, -sin(ph - 0.6)) * 0.3);
    stepLegs(P, ph, 0.28 * G.stride, 0.28, 0.5, 0.03, lame, z.limp);
  } else if (st === 'drag') {
    // arrastra una pierna dura: la lleva atrás y la trae abriéndola en semicírculo;
    // el cuerpo se tira sobre la buena y el brazo del lado malo va apretado al pecho
    const bad = G.side > 0 ? 0 : 1;
    const good = 1 - bad;
    const fb = ph + bad * PI;
    const fg = ph + good * PI;
    const gs = max(0, -cos(fg + 0.4));
    leg(P, good, 0.42 * G.stride * sin(fg) - gs * 0.1, 0.02, 0.15 + gs * 0.65);
    const bs = max(0, -cos(fb));
    leg(P, bad, 0.2 + 0.12 * sin(fb), 0.06 + bs * 0.2, 0.06);
    const onBad = max(0, cos(fb));
    P.torsoP = 0.3 + G.lean + onBad * 0.06;
    P.torsoR = (bad === 0 ? -1 : 1) * (0.1 + onBad * 0.14) * sw;
    P.torsoY = sin(fg) * 0.12;
    P.headP = -0.05 + G.head + onBad * 0.12;
    P.headR += (bad === 0 ? -1 : 1) * 0.25;
    arm(P, bad, -0.45, -0.25, -1.45);
    arm(P, good, -1.4 + G.arm + sin(fg) * 0.12, -0.12, -0.3);
  } else if (st === 'lurch') {
    // a los tumbos, como por caerse para adelante en cada paso, brazos abiertos para
    // no caerse y la cabeza que se le va de un lado al otro
    const wob = sin(ph * 0.5 + z.slot);
    P.torsoP = 0.36 + G.lean + max(0, s2) * 0.16;
    P.torsoR = wob * 0.18 * sw;
    P.torsoY = s * 0.16;
    P.headP = -0.12 + G.head + max(0, s2) * 0.14;
    P.headR = z.headTilt * 0.5 + sin(ph * 0.5 + z.slot - 0.7) * 0.45;
    arm(P, 0, -0.75 + s * 0.22 + G.arm * 0.5, 0.55 + wob * 0.12, -0.2 - max(0, s) * 0.25);
    arm(P, 1, -0.75 - s * 0.22 + G.arm * 0.5, 0.55 - wob * 0.12, -0.2 - max(0, -s) * 0.25);
    stepLegs(P, ph, 0.38 * G.stride, 0.1, 0.38, 0.06, lame, z.limp);
  } else {
    // el clásico: brazos adelante, pero cada uno a su altura; 'onearm' con uno solo
    P.torsoP = 0.26 + G.lean + s2 * 0.03;
    P.torsoR = s * 0.12 * sw;
    P.torsoY = s * 0.12;
    P.headP = -0.2 + G.head + s2 * 0.05;
    P.headR += s * 0.06;
    const el = sin(t * 1.1 + z.slot) * 0.08;
    arm(P, 0, -1.3 + G.arm + s * 0.12 + z.armOff, -0.18, -0.25 + el);
    arm(P, 1, -1.25 + G.arm - s * 0.12 - z.armOff, -0.18, -0.35 - el);
    if (st === 'onearm') {
      const up = G.side > 0 ? 0 : 1;
      arm(P, up, -1.6 + G.arm * 0.5 + sin(t * 2.3 + z.slot) * 0.08, -0.05, -0.08);
      arm(P, 1 - up, -0.1 + sin(ph - 0.5) * 0.28, 0.1, -0.15);
      P.torsoR += (up === 0 ? 1 : -1) * 0.08;
    }
    stepLegs(P, ph, 0.36 * G.stride, 0.12, 0.5, 0, lame, z.limp);
  }
  // la pierna mala: al pisarla el cuerpo se hunde y se tuerce
  if (lame >= 0 && st !== 'drag') {
    const bad = z.limp * max(0, lame === 0 ? -s : s);
    P.torsoR += (lame === 0 ? -1 : 1) * bad * 0.14;
    P.headP += bad * 0.08;
  }
  ground(P);
}

// ---------------- correr y esprintar ----------------
// El cangrejo: el cuerpo de costado, abre y cierra las piernas (paso lateral),
// se tira hacia donde va y lo mira con la cabeza torcida; un brazo adelante
// buscando y el otro arriba, atrás.
function crab(z, P, ph, G, t, fast) {
  const s = sin(ph);
  const c = cos(ph);
  const lead = G.side > 0 ? 0 : 1;
  const trail = 1 - lead;
  const dir = G.side;
  P.yawOff = dir * (fast ? 1.4 : 1.3);
  const open = 0.5 + 0.5 * s;
  const amp = (fast ? 0.38 : 0.32) * G.stride;
  leg(P, lead, -0.45 - max(0, c) * 0.25, 0.2 + open * amp, 0.85 + max(0, c) * 0.5);
  leg(P, trail, -0.35 - max(0, -c) * 0.25, 0.1 + open * amp * 0.7, 0.8 + max(0, -c) * 0.5);
  P.torsoP = (fast ? 0.45 : 0.35) + G.lean;
  P.torsoR = -dir * (0.22 + s * 0.05);
  P.torsoY = -dir * 0.4;
  P.headY = -dir * 0.75;
  P.headP = -0.25 + G.head * 0.5 + sin(ph * 2) * 0.05;
  P.headR = dir * 0.3 + z.headTilt * 0.3;
  arm(P, lead, -1.5 + G.arm + s * 0.15, 0.55, -0.2);
  arm(P, trail, -2.5 + sin(ph * 2 + 1) * 0.35, 0.45, -0.7 + sin(ph * 2) * 0.25);
  ground(P, max(0, -c) * (fast ? 0.07 : 0.04));
}

// cuánto avanza la fase por metro, según el estilo (así los pies casi no patinan)
const RUN_K = { lope: 1.95, crab: 3.2, flail: 2.15, stagger: 1.85, charge: 2.4 };
const SPRINT_K = { feral: 1.8, crab: 3, ape: 1.55, flail: 1.95 };

function run(z, P, ph, G, t, fast, st) {
  const s = sin(ph);
  const c = cos(ph);
  const sw = G.sway;
  base(P, z, G, t);
  if (st === 'crab') return crab(z, P, ph, G, t, fast);
  const amp = (fast ? 0.95 : 0.72) * G.stride;
  if (st === 'flail') {
    // corre derecho revoleando los brazos por arriba, rodillas altas, la cabeza sacudida
    P.torsoP = (fast ? 0.3 : 0.16) + G.lean;
    P.torsoR = s * 0.1;
    P.torsoY = s * 0.18;
    P.headP = -0.35 + sin(ph * 2) * 0.2;
    P.headR = sin(ph * 1.3) * 0.3;
    P.headY = sin(ph * 0.9) * 0.3;
    const w = ph * 1.5;
    arm(P, 0, -1.7 + sin(w) * 1.25, 0.35 + 0.3 * sin(w * 0.5 + 1), -0.5 + sin(w * 2) * 0.4);
    arm(P, 1, -1.7 + sin(w + 2.1) * 1.25, 0.35 + 0.3 * sin(w * 0.5 + 2.6), -0.5 + sin(w * 2 + 1) * 0.4);
    stepLegs(P, ph, amp * 0.85, 0.3, 1.45, 0.02);
    ground(P, max(0, -c * s) * 0.06);
    return;
  }
  if (st === 'stagger') {
    // corre zigzagueando, a punto de irse al piso; un brazo atrás, el otro buscando
    const wob = sin(ph * 0.5 + z.slot);
    P.torsoP = 0.45 + G.lean;
    P.torsoR = wob * 0.24 * sw;
    P.torsoY = wob * 0.3;
    P.headP = -0.3 + G.head;
    P.headR = sin(ph * 0.5 + z.slot - 0.8) * 0.4;
    const back = G.side > 0 ? 0 : 1;
    arm(P, back, 0.55 + s * 0.3, 0.3, -0.2);
    arm(P, 1 - back, -1.5 + G.arm + s * 0.25, -0.1, -0.35);
    stepLegs(P, ph, amp * 0.9, 0.25, 1.05, 0.04 + wob * 0.05);
    ground(P);
    return;
  }
  if (st === 'charge') {
    // embiste agachado, la cabeza gacha y los brazos tirados para atrás
    P.torsoP = 0.72 + G.lean;
    P.torsoR = s * 0.06;
    P.torsoY = s * 0.1;
    P.headP = -0.15 + G.head * 0.5;
    P.headR = 0;
    arm(P, 0, 0.75 + s * 0.15, 0.3, -0.1);
    arm(P, 1, 0.75 - s * 0.15, 0.3, -0.1);
    stepLegs(P, ph, amp * 0.8, 0.4, 1.2, 0.03);
    ground(P);
    return;
  }
  if (st === 'ape') {
    // casi en cuatro patas: se estira y se junta como un mono, los brazos barriendo el piso
    P.torsoP = 0.95 + G.lean;
    P.torsoR = s * 0.05;
    P.torsoY = 0;
    P.headP = -0.95;
    P.headR = z.headTilt * 0.3;
    const hang = -P.torsoP;
    arm(P, 0, hang - 0.25 - s * 0.6, 0.12, -0.15 - max(0, -s) * 0.5);
    arm(P, 1, hang - 0.25 - sin(ph - 0.35) * 0.6, 0.12, -0.15 - max(0, -sin(ph - 0.35)) * 0.5);
    stepLegs(P, ph + 0.8, 0.62 * G.stride, 0.45, 1.0, 0.07);
    ground(P, max(0, s) * 0.06);
    return;
  }
  if (fast) {
    // el salvaje: bien agachado, bombeando los brazos con las garras abiertas
    P.torsoP = 0.55 + G.lean;
    P.torsoR = 0;
    P.torsoY = s * 0.2;
    P.headP = -0.55 + G.head * 0.5;
    P.headR = 0;
    arm(P, 0, -0.45 - s * 1.0 + G.arm * 0.5, 0.15, -1.3);
    arm(P, 1, -0.45 + s * 1.0 + G.arm * 0.5, 0.15, -1.3);
    stepLegs(P, ph, amp, 0.3, 1.5);
    ground(P, max(0, -c * s) * 0.08);
    return;
  }
  // el trote clásico: inclinado, los brazos estirados buscando
  P.torsoP = 0.42 + G.lean;
  P.torsoR = s * 0.08 * sw;
  P.torsoY = s * 0.15;
  P.headP = -0.35 + G.head * 0.5;
  P.headR = z.headTilt * 0.5;
  arm(P, 0, -1.3 + G.arm + s * 0.32, -0.15, -0.4);
  arm(P, 1, -1.3 + G.arm - s * 0.32, -0.15, -0.4);
  stepLegs(P, ph, amp, 0.2, 1.1);
  ground(P, max(0, -c * s) * 0.05);
}

// Avanza la fase y arma la pose de marcha. speed: lo que avanza de verdad (m/s).
// En el agua (z.swimK de entities/swim.js) pasa de a poco a nadar.
export function gaitPose(z, dt, speed, t) {
  const G = z.style;
  const P = z.P;
  const type = z.speedType;
  const v = max(0.6, speed);
  const sk = z.swimK || 0;
  if (sk > 0.98) {
    z.phase += dt * (3 + 2 * v) * G.tempo;
    crawl(z, P, z.phase, t);
    z.swum = true;
    return;
  }
  if (type === 'walk') {
    let k = WALK_K[G.walk];
    // el de los tumbos no lleva un ritmo parejo; el que arrastra, apura al traer la pierna
    if (G.walk === 'lurch') k *= 1 + 0.45 * sin(z.phase * 0.5 + z.slot);
    else if (G.walk === 'drag') k *= 1 + 0.4 * max(0, -cos(z.phase + (G.side > 0 ? 0 : PI)));
    z.phase += dt * k * G.tempo * min(v, 2.2);
    walk(z, P, z.phase, G, t);
  } else {
    const fast = type === 'sprint';
    let st = fast ? G.sprint : G.run;
    // prendido fuego corre derecho, aunque sea de los que van de costado
    if (st === 'crab' && z.state === 'burnrun') st = fast ? 'feral' : 'lope';
    let k = (fast ? SPRINT_K : RUN_K)[st];
    if (st === 'stagger') k *= 1 + 0.3 * sin(z.phase * 0.5 + z.slot);
    z.phase += dt * k * G.tempo * v;
    run(z, P, z.phase, G, t, fast, st);
  }
  wade(z, P);
  if (sk > 0.02) {
    mixWater(z, P, sk, (S) => crawl(z, S, z.phase, t));
    z.swum = true;
  } else if (z.swum) dry(z, P);
}

// ---------------- en el agua ----------------
const S = {};
const ROOT0 = { rootPitch: 0, rootY: 0, rootFwd: 0 };

// Mezcla la pose de tierra (ya en P) con la del agua (fill la arma en S).
function mixWater(z, P, k, fill) {
  for (const key in ROOT0) if (P[key] === undefined) P[key] = ROOT0[key];
  for (const key in P) S[key] = P[key];
  fill(S);
  for (const key in P) P[key] += (S[key] - P[key]) * k;
}

// Salió del agua: el cuerpo vuelve a pararse sobre los pies.
function dry(z, P) {
  P.rootPitch = 0;
  P.rootY = 0;
  P.rootFwd = 0;
  z.swum = false;
}

// Vadeando: levanta las rodillas y los brazos para no arrastrarlos por el agua.
function wade(z, P) {
  if (!z.wetD || z.wetMode !== 1) return;
  const k = clamp01((z.wetD - 0.3) / 0.9);
  P.knL += k * 0.3;
  P.knR += k * 0.3;
  P.torsoP += k * 0.08;
  P.shLp -= k * 0.25;
  P.shRp -= k * 0.25;
  ground(P);
}

// El cuerpo acostado sobre el agua girando en la cadera: la cadera queda donde
// está el zombie y apenas debajo de la superficie. a: cuánto se acuesta.
function floatAt(z, P, a, under) {
  const sc = z.scale || 1;
  P.hipY = 0.93;
  P.rootPitch = a;
  P.rootFwd = -0.93 * sc * sin(a);
  P.rootY = (z.wetY ?? 0) - under * sc - 0.93 * sc * cos(a) - (z.baseY || 0);
}

// Crol: casi horizontal, la cabeza afuera mirando adelante (a la presa),
// brazadas alternadas (la que vuelve por arriba del agua va con el codo
// doblado) y patada corta. El cuerpo rola con cada brazada.
function crawl(z, P, ph, t) {
  floatAt(z, P, 1.25, 0.3);
  P.yawOff = 0;
  P.torsoP = -0.3;
  P.torsoR = sin(ph) * 0.3;
  P.torsoY = 0;
  P.headP = -0.75;
  P.headR = sin(ph) * 0.1;
  P.headY = sin(ph + 0.6) * 0.2;
  for (let i = 0; i < 2; i++) {
    // -π (estirado adelante) → 0 (al costado, tirando por abajo) → π (vuelve por arriba)
    let a = ph + i * PI;
    a = ((a % (2 * PI)) + 2 * PI) % (2 * PI) - PI;
    const back = a > 0;
    arm(P, i, a, back ? 0.35 * sin(a) : 0.08, back ? -0.3 - sin(a) * 1.1 : -0.25);
  }
  const k = sin(ph * 3);
  leg(P, 0, -0.1 + k * 0.3, 0.05, 0.25 + max(0, k) * 0.3);
  leg(P, 1, -0.1 - k * 0.3, 0.05, 0.25 + max(0, -k) * 0.3);
}

// Pataleando en el lugar, parado en el agua con el pecho afuera (para pegar o
// esperar): las piernas en bicicleta y los brazos remando (si no pega).
function tread(z, P, t, arms) {
  // la cadera ~70 cm abajo: los hombros apenas mojados, la cabeza afuera
  floatAt(z, P, 0.12, arms ? 0.72 : 0.62);
  P.yawOff = 0;
  const ph = t * 4 + z.slot;
  leg(P, 0, -0.55 + sin(ph) * 0.4, 0.15, 1.0 + sin(ph + 1) * 0.4);
  leg(P, 1, -0.55 - sin(ph) * 0.4, 0.15, 1.0 - sin(ph + 1) * 0.4);
  if (arms) {
    arm(P, 0, -0.55 + sin(ph * 0.8) * 0.2, 0.6 + sin(ph * 1.6) * 0.3, -0.4);
    arm(P, 1, -0.55 - sin(ph * 0.8) * 0.2, 0.6 - sin(ph * 1.6) * 0.3, -0.4);
    P.headP = -0.35;
  }
}

// Un cuerpo nadando (los compañeros de la red, un cadáver que flota): mode 2
// en la superficie pataleando, 3 buceando.
export function swimPose(z, P, t, mode) {
  if (mode === 3) {
    z.phase = (z.phase || 0) + 1 / 60 * 5;
    crawl(z, P, z.phase, t);
    P.headP = -0.3;
  } else tread(z, P, t, true);
}

// ---------------- quieto ----------------
export function idlePose(z, t) {
  const G = z.style;
  const P = z.P;
  const s = sin(t * 1.5 + z.slot);
  const b = sin(t * 0.8 + z.slot * 1.7);
  base(P, z, G, t);
  P.torsoR = b * 0.06 * G.sway;
  P.headR = z.headTilt + sin(t * 0.6 + z.slot) * 0.12;
  leg(P, 0, -0.04, 0.03, 0.1);
  leg(P, 1, 0.04, 0.03, 0.1);
  if (G.walk === 'hunch') {
    P.torsoP = 0.6 + G.lean + s * 0.04;
    P.headP = -0.6;
    const hang = -P.torsoP - 0.08;
    arm(P, 0, hang + b * 0.12, 0.06, -0.3);
    arm(P, 1, hang - b * 0.12, 0.06, -0.3);
    leg(P, 0, -0.1, 0.05, 0.3);
    leg(P, 1, 0.05, 0.05, 0.25);
  } else if (G.walk === 'drag') {
    // parado sobre la pierna buena, la otra floja
    const bad = G.side > 0 ? 0 : 1;
    P.torsoP = 0.28 + G.lean + s * 0.03;
    P.torsoR = (bad === 0 ? -1 : 1) * 0.12;
    P.headP = -0.05 + G.head;
    arm(P, bad, -0.45, -0.25, -1.45);
    arm(P, 1 - bad, -1.1 + G.arm + s * 0.1, -0.12, -0.3);
    leg(P, bad, 0.15, 0.08, 0.2);
  } else if (G.walk === 'lurch') {
    P.torsoP = 0.35 + G.lean + s * 0.05;
    P.torsoR = b * 0.14;
    P.headP = -0.1 + G.head;
    P.headR = sin(t * 0.9 + z.slot) * 0.45;
    arm(P, 0, -0.5 + s * 0.1, 0.4 + b * 0.1, -0.2);
    arm(P, 1, -0.5 - s * 0.1, 0.4 - b * 0.1, -0.2);
  } else {
    P.torsoP = 0.3 + G.lean + s * 0.04;
    P.headP = -0.1 + G.head;
    arm(P, 0, -1.1 + G.arm + s * 0.1, -0.1, -0.3);
    arm(P, 1, -1.0 + G.arm - s * 0.1, -0.1, -0.3);
    if (G.walk === 'onearm') {
      const up = G.side > 0 ? 0 : 1;
      arm(P, 1 - up, -0.05 + b * 0.08, 0.1, -0.15);
    }
  }
  ground(P);
  wade(z, P);
  const sk = z.swimK || 0;
  if (sk > 0.02) {
    mixWater(z, P, sk, (S) => tread(z, S, t, true));
    z.swum = true;
  } else if (z.swum) dry(z, P);
}

// ---------------- pegar ----------------
// k: el tiempo del golpe (0 a 0.95; el daño cae a los 0.42, igual para todos).
export function attackPose(z, t) {
  const G = z.style;
  const P = z.P;
  const k = z.attackT;
  const st = G.hit;
  const side = G.side > 0 ? 0 : 1;
  const other = 1 - side;
  const sg = side === 0 ? 1 : -1;
  base(P, z, G, t);
  P.headR = z.headTilt * 0.5;
  leg(P, 0, -0.18, 0.04, 0.2);
  leg(P, 1, 0.22, 0.04, 0.15);
  if (st === 'swipe') {
    // zarpazo de costado: se tuerce para atrás, cruza el brazo por delante y sigue de largo
    const a = ease(k / 0.3);
    const b = ease((k - 0.3) / 0.16);
    const r = ease((k - 0.55) / 0.4);
    P.torsoP = 0.25 + a * 0.05 + b * 0.2 - r * 0.2;
    P.torsoY = sg * (a * 0.55 - b * 1.2 + r * 0.65);
    P.torsoR = sg * (a * 0.1 - b * 0.18 + r * 0.08);
    P.headP = -0.25 + b * 0.1;
    P.headY = -P.torsoY * 0.6;
    arm(P, side, -1.2 - a * 0.7 + b * 0.5 + r * 0.2, 0.2 + a * 0.9 - b * 1.4 + r * 0.3, -0.3 - a * 1.0 + b * 1.1 + r * -0.1);
    arm(P, other, -1.2 + a * 0.2, -0.1, -0.5);
    leg(P, side, -0.3 * b, 0.06, 0.25);
  } else if (st === 'lunge') {
    // se agacha, se tira encima con las dos manos y el tarascón, y forcejea
    const a = ease(k / 0.3);
    const b = ease((k - 0.3) / 0.12);
    const r = ease((k - 0.7) / 0.25);
    const shake = k > 0.42 && k < 0.7 ? sin(t * 32) * 0.06 : 0;
    P.torsoP = 0.2 + a * 0.15 + b * 0.45 - r * 0.5;
    P.torsoY = shake;
    P.headP = -0.1 - a * 0.35 + b * 0.55 - r * 0.2;
    arm(P, 0, -1.0 - a * 0.2 - b * 0.6 + r * 0.6, -0.1 - b * 0.1, -1.3 * a + b * 1.0 + r * 0.2 + shake);
    arm(P, 1, -1.0 - a * 0.2 - b * 0.6 + r * 0.6, -0.1 - b * 0.1, -1.3 * a + b * 1.0 + r * 0.2 - shake);
    leg(P, side, -0.18 - b * 0.4 + r * 0.4, 0.05, 0.2 + a * 0.3 + b * 0.2 - r * 0.4);
    leg(P, other, 0.22 + b * 0.15 - r * 0.15, 0.05, 0.15 + a * 0.3 - r * 0.2);
  } else if (st === 'claw') {
    // tres arañazos seguidos, un brazo y el otro (el del medio es el que lastima)
    const n = k / 0.95 * 3;
    const i = min(2, Math.floor(n));
    const f = n - i;
    const hand = (i % 2 === 0) === (side === 0) ? 0 : 1;
    const up = f < 0.45 ? ease(f / 0.45) : 1 - ease((f - 0.45) / 0.35);
    P.torsoP = 0.45 + G.lean + (1 - up) * 0.12;
    P.torsoY = (hand === 0 ? 1 : -1) * (up * 0.3 - 0.15);
    P.headP = -0.4;
    arm(P, hand, -0.6 - up * 1.9, 0.3 - up * 0.35, -0.5 - up * 0.4);
    arm(P, 1 - hand, -1.0 - (1 - up) * 0.3, 0.1, -0.9);
  } else {
    // el golpe de martillo con los dos brazos (el de siempre, más marcado)
    if (k < 0.35) {
      const e = ease(k / 0.35);
      P.torsoP = 0.25 - e * 0.25;
      P.headP = -0.1 - e * 0.25;
      arm(P, 0, -1.2 - e * 1.45, -0.2, -0.6 * e);
      arm(P, 1, -1.2 - e * 1.55, -0.2, -0.6 * e);
    } else if (k < 0.52) {
      const e = ease((k - 0.35) / 0.17);
      P.torsoP = 0 + e * 0.65;
      P.headP = -0.35 + e * 0.2;
      arm(P, 0, -2.65 + e * 2.15, -0.2 - e * 0.3, -0.6 + e * 0.45);
      arm(P, 1, -2.75 + e * 2.25, -0.2 - e * 0.3, -0.6 + e * 0.45);
    } else {
      const e = ease((k - 0.52) / 0.43);
      P.torsoP = 0.65 - e * 0.35;
      P.headP = -0.15 - e * 0.05;
      arm(P, 0, -0.5 - e * 0.8, -0.5 + e * 0.3, -0.15 - e * 0.15);
      arm(P, 1, -0.5 - e * 0.8, -0.5 + e * 0.3, -0.15 - e * 0.15);
    }
  }
  ground(P);
  wade(z, P);
  // en lo hondo pega manoteando desde el agua, pataleando para mantenerse
  const sk = z.swimK || 0;
  if (sk > 0.02) {
    mixWater(z, P, sk, (S) => tread(z, S, t, false));
    z.swum = true;
  } else if (z.swum) dry(z, P);
}
