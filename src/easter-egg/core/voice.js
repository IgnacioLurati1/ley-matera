// Síntesis de voz por formantes, en JS puro: una fuente glótica (pulsos con
// jitter, shimmer, aspiración, carraspera y subarmónicos) pasa por un tracto
// vocal de cuatro resonadores en cascada. Con eso salen los gemidos de los
// zombies y los "murmullos" de los personajes, que siguen el texto real:
// vocales del castellano, consonantes, pausas y entonación, sin palabras
// entendibles ni voz de robot. Todo se renderiza una vez a un buffer.

export const RATE = 24000;

// Formantes (F1, F2, F3, F4) de las vocales del castellano, voz adulta.
const VOWEL = {
  a: [760, 1300, 2500, 3500],
  e: [460, 1850, 2550, 3500],
  i: [300, 2200, 2950, 3700],
  o: [470, 880, 2450, 3400],
  u: [320, 760, 2350, 3300],
  y: [560, 1400, 2450, 3400], // vocal neutra (schwa) para zombies
  w: [640, 1050, 2350, 3300], // "oa" oscura de los gemidos
};
const BW = [80, 110, 160, 250];

function gauss(r) {
  return (r() + r() + r() + r() - 2) * 0.87;
}

// Renderiza una lista de segmentos:
// { dur, f0: [inicio, fin], v: 'a' | [F1..F4], amp: [inicio, fin], voiced: 0..1,
//   noise: { f, bw, amp }, glide }  y un perfil de voz P.
export function renderVoice(segs, P, rand = Math.random) {
  const total = segs.reduce((s, x) => s + x.dur, 0) + (P.tail ?? 0.08);
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  const T = 1 / RATE;
  // estado de los 4 resonadores
  const y1 = [0, 0, 0, 0];
  const y2 = [0, 0, 0, 0];
  const cA = [0, 0, 0, 0];
  const cB = [0, 0, 0, 0];
  const cC = [0, 0, 0, 0];
  const F = [...VOWEL.y];
  const Ft = [...VOWEL.y];
  let nf = { f: 4000, bw: 2000 };
  let nb1 = 0;
  let nb2 = 0;
  let nA = 0;
  let nB = 0;
  let nC = 0;
  const setRes = (i, f, bw) => {
    const c = -Math.exp(-2 * Math.PI * bw * T);
    const b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
    cA[i] = 1 - b - c;
    cB[i] = b;
    cC[i] = c;
  };
  const setNoise = (f, bw) => {
    nC = -Math.exp(-2 * Math.PI * bw * T);
    nB = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
    nA = (1 - nB - nC) * 0.5 + 0.02;
  };
  setNoise(4000, 2000);
  const shift = P.shift ?? 1;
  let phase = 0;
  let period = 0;
  let cycleAmp = 1;
  let cycleF0 = 100;
  let prevU = 0;
  let tilt = 0;
  let rough = 0;
  let roughT = 0;
  let jit = 0;
  let idx = 0;
  let segI = 0;
  let segT = 0;
  const glide = P.glide ?? 0.03;
  const kGlide = 1 - Math.exp(-T / glide);
  let voicedS = 0;
  let ampS = 0;
  let noiseAmpS = 0;
  const tiltK = P.tilt ?? 0.35;
  // susurro: la voz se apaga y queda el aire (un alma, un fantasma)
  const wh = P.whisper ?? 0;
  // temblor de volumen (la voz que tiembla de nervios o de locura)
  const trem = P.trem;
  for (idx = 0; idx < n; idx++) {
    const s = segs[Math.min(segI, segs.length - 1)];
    const done = segI >= segs.length;
    const u = done ? 1 : Math.min(1, segT / s.dur);
    const f0 = done ? s.f0[1] : s.f0[0] + (s.f0[1] - s.f0[0]) * u;
    const amp = done ? 0 : s.amp ? s.amp[0] + (s.amp[1] - s.amp[0]) * u : 1;
    const voiced = done ? 0 : s.voiced ?? 1;
    const nz = done ? null : s.noise;
    // objetivos de formantes (se deslizan)
    if (!done && (idx & 31) === 0) {
      const v = typeof s.v === 'string' ? VOWEL[s.v] : s.v || VOWEL.y;
      for (let i = 0; i < 4; i++) Ft[i] = v[i] * shift;
      if (nz && (nz.f !== nf.f || nz.bw !== nf.bw)) {
        nf = nz;
        setNoise(Math.min(RATE * 0.45, nz.f), nz.bw);
      }
    }
    if ((idx & 31) === 0) {
      for (let i = 0; i < 4; i++) {
        F[i] += (Ft[i] - F[i]) * Math.min(1, kGlide * 32);
        setRes(i, Math.min(RATE * 0.45, F[i]), BW[i] * (P.bwMul ?? 1));
      }
    }
    const ks = s.soft ?? 0.004;
    voicedS += (voiced - voicedS) * Math.min(1, T / ks);
    ampS += (amp - ampS) * Math.min(1, T / ks);
    noiseAmpS += ((nz ? nz.amp : 0) - noiseAmpS) * Math.min(1, T / 0.004);

    // ---- fuente glótica ----
    if (phase >= 1 || period === 0) {
      phase -= Math.floor(phase || 0);
      period++;
      jit = gauss(rand) * (P.jitter ?? 0.01);
      const vib = P.vib ? Math.sin((idx * T) * P.vib.rate * Math.PI * 2) * P.vib.depth : 0;
      cycleF0 = Math.max(25, f0 * (1 + jit + vib));
      cycleAmp = 1 + gauss(rand) * (P.shimmer ?? 0.05);
      // subarmónico: un pulso fuerte y uno débil (voz rasposa, "de ultratumba")
      if (P.sub && period % 2) cycleAmp *= 1 - P.sub;
      if (P.fry && rand() < P.fry) cycleAmp *= 0.3 + rand() * 0.5;
      // la voz que se quiebra al cerrar una frase: pulsos flojos, desparejos y más graves
      const cr = done ? 0 : s.creak || 0;
      if (cr > 0) {
        cycleF0 *= 1 - cr * 0.3 * rand();
        if (rand() < cr) cycleAmp *= 0.25 + rand() * 0.5;
      }
    }
    phase += cycleF0 * T;
    const oq = P.oq ?? 0.6;
    let flow = 0;
    const ph = phase % 1;
    if (ph < oq * 0.62) flow = 0.5 * (1 - Math.cos((Math.PI * ph) / (oq * 0.62)));
    else if (ph < oq) flow = Math.cos(((Math.PI / 2) * (ph - oq * 0.62)) / (oq * 0.38));
    const dU = (flow - prevU) * cycleAmp;
    prevU = flow;
    tilt += (dU - tilt) * (1 - tiltK);
    // aspereza: modulación de amplitud con ruido lento (gruñido)
    roughT -= T;
    if (roughT <= 0) {
      roughT = 1 / (P.roughRate ?? 55);
      rough = gauss(rand);
    }
    const growl = 1 + (P.growl ?? 0) * rough;
    // (con aire: al final de la frase la voz se apaga soplando)
    const by = done ? 0 : s.breathy || 0;
    const breath = (rand() * 2 - 1) * (P.breath ?? 0.08) * (0.35 + 0.65 * flow) * (1 + by * 3);
    const asp = wh ? (rand() * 2 - 1) * wh * 0.5 : 0;
    let x = (tilt * 18 * growl * (1 - by * 0.4) * (1 - wh * 0.85) + breath + asp) * voicedS;

    // ---- tracto vocal ----
    for (let i = 0; i < 4; i++) {
      const y = cA[i] * x + cB[i] * y1[i] + cC[i] * y2[i];
      y2[i] = y1[i];
      y1[i] = y;
      x = y;
    }
    // ---- fricción (consonantes, siseos, gorgoteo) ----
    let fr = 0;
    if (noiseAmpS > 1e-4) {
      const w = rand() * 2 - 1;
      const y = nA * w + nB * nb1 + nC * nb2;
      nb2 = nb1;
      nb1 = y;
      fr = y * noiseAmpS * (P.noiseGain ?? 2.5);
    }
    out[idx] = (x + fr) * ampS * (trem ? 1 - trem.depth * (0.5 + 0.5 * Math.sin(idx * T * trem.rate * Math.PI * 2)) : 1);
    segT += T;
    if (!done && segT >= s.dur) {
      segT -= s.dur;
      segI++;
    }
  }
  // normalizar, saturar (la carraspera de los zombies) y suavizar los bordes
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (P.drive && peak > 0) {
    const d = P.drive;
    const td = Math.tanh(d);
    for (let i = 0; i < n; i++) out[i] = Math.tanh((out[i] / peak) * d) / td;
    peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  }
  const g = peak > 0 ? (P.level ?? 0.85) / peak : 0;
  const fade = Math.min(n, Math.floor(RATE * 0.01));
  for (let i = 0; i < n; i++) {
    let k = g;
    if (i < fade) k *= i / fade;
    if (i > n - fade) k *= (n - i) / fade;
    out[i] *= k;
  }
  return out;
}

// ---------------- zombies ----------------
const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, a, b) => a + (b - a) * r();

const ZPROFILE = {
  moan: { jitter: 0.035, shimmer: 0.14, breath: 0.2, growl: 0.35, roughRate: 38, sub: 0.35, fry: 0.12, tilt: 0.55, glide: 0.09, drive: 1.6, oq: 0.7, shift: 0.92 },
  snarl: { jitter: 0.05, shimmer: 0.2, breath: 0.2, growl: 0.75, roughRate: 70, sub: 0.25, fry: 0.2, tilt: 0.25, glide: 0.04, drive: 3.2, oq: 0.5, shift: 1.05, bwMul: 1.3 },
  scream: { jitter: 0.06, shimmer: 0.18, breath: 0.16, growl: 0.55, roughRate: 90, sub: 0.15, fry: 0.05, tilt: 0.2, glide: 0.05, drive: 3.8, oq: 0.45, shift: 1.12, bwMul: 1.4 },
  death: { jitter: 0.07, shimmer: 0.25, breath: 0.3, growl: 0.6, roughRate: 16, sub: 0.45, fry: 0.3, tilt: 0.5, glide: 0.07, drive: 2.2, oq: 0.7, shift: 0.9 },
  boss: { jitter: 0.03, shimmer: 0.12, breath: 0.15, growl: 0.7, roughRate: 34, sub: 0.6, fry: 0.1, tilt: 0.45, glide: 0.08, drive: 3, oq: 0.65, shift: 0.72, bwMul: 1.2 },
};

// Devuelve { data, rate } con un sonido de zombie del tipo pedido.
export function zombieSound(kind, r = Math.random) {
  const segs = [];
  let P = ZPROFILE[kind] || ZPROFILE.moan;
  if (kind === 'moan') {
    // gemido largo: "ooaah" que cae, con respiración al final
    const f = between(r, 72, 118);
    const d = between(r, 0.9, 1.9);
    const v1 = pick(r, ['o', 'u', 'w']);
    const v2 = pick(r, ['a', 'w', 'y']);
    segs.push({ dur: 0.12, f0: [f * 0.8, f], v: v1, amp: [0, 0.8], voiced: 1, soft: 0.05 });
    segs.push({ dur: d * 0.45, f0: [f, f * between(r, 1.0, 1.25)], v: v1, amp: [0.8, 1] });
    segs.push({ dur: d * 0.55, f0: [f * 1.1, f * between(r, 0.6, 0.8)], v: v2, amp: [1, 0.15], soft: 0.03 });
    segs.push({ dur: between(r, 0.2, 0.45), f0: [f * 0.6, f * 0.5], v: 'y', amp: [0.25, 0], voiced: 0.1, noise: { f: 900, bw: 1400, amp: 0.12 } });
  } else if (kind === 'groan') {
    P = ZPROFILE.moan;
    const f = between(r, 80, 130);
    const v = pick(r, ['y', 'w', 'o', 'a']);
    segs.push({ dur: 0.06, f0: [f, f], v, amp: [0, 1], soft: 0.02 });
    segs.push({ dur: between(r, 0.3, 0.6), f0: [f * 1.1, f * 0.75], v, amp: [1, 0.2] });
    segs.push({ dur: 0.15, f0: [f * 0.7, f * 0.6], v: 'y', amp: [0.2, 0], voiced: 0.2, noise: { f: 700, bw: 1000, amp: 0.2 } });
  } else if (kind === 'snarl') {
    // ataque: inhalación áspera y un "graah" rasgado
    const f = between(r, 150, 230);
    segs.push({ dur: between(r, 0.08, 0.16), f0: [f, f], v: 'y', amp: [0, 0.4], voiced: 0, noise: { f: 1500, bw: 2200, amp: 0.25 } });
    segs.push({ dur: 0.05, f0: [f * 0.8, f], v: 'a', amp: [0.4, 1], soft: 0.01 });
    segs.push({ dur: between(r, 0.3, 0.55), f0: [f, f * between(r, 0.7, 0.9)], v: pick(r, ['a', 'w', 'e']), amp: [1, 0.55], noise: { f: 2200, bw: 3000, amp: 0.08 } });
    segs.push({ dur: 0.12, f0: [f * 0.7, f * 0.55], v: 'y', amp: [0.5, 0], noise: { f: 1200, bw: 2000, amp: 0.2 } });
  } else if (kind === 'scream') {
    // corredor: grito que sube y se quiebra
    const f = between(r, 230, 340);
    segs.push({ dur: 0.08, f0: [f * 0.7, f], v: 'a', amp: [0, 1], soft: 0.02 });
    segs.push({ dur: between(r, 0.4, 0.7), f0: [f, f * between(r, 1.15, 1.35)], v: pick(r, ['a', 'e']), amp: [1, 0.85], noise: { f: 2800, bw: 3000, amp: 0.07 } });
    segs.push({ dur: between(r, 0.2, 0.35), f0: [f * 1.2, f * 0.6], v: 'y', amp: [0.85, 0], noise: { f: 2000, bw: 3000, amp: 0.1 } });
  } else if (kind === 'death') {
    // gorgoteo que se apaga
    const f = between(r, 110, 160);
    segs.push({ dur: 0.06, f0: [f, f * 1.2], v: 'e', amp: [0, 1], soft: 0.01 });
    segs.push({ dur: between(r, 0.25, 0.4), f0: [f * 1.2, f * 0.7], v: pick(r, ['a', 'o', 'w']), amp: [1, 0.6] });
    const bubbles = 3 + Math.floor(r() * 4);
    for (let i = 0; i < bubbles; i++) {
      segs.push({ dur: between(r, 0.04, 0.08), f0: [f * 0.55, f * 0.5], v: pick(r, ['u', 'o', 'y']), amp: [0.5 - i * 0.05, 0.1], noise: { f: between(r, 300, 700), bw: 400, amp: 0.4 }, soft: 0.006 });
      segs.push({ dur: between(r, 0.02, 0.05), f0: [f * 0.5, f * 0.5], v: 'u', amp: [0.1, 0.1], voiced: 0.2 });
    }
    segs.push({ dur: 0.3, f0: [f * 0.45, f * 0.35], v: 'y', amp: [0.2, 0], voiced: 0.1, noise: { f: 600, bw: 900, amp: 0.2 } });
  } else if (kind === 'breath') {
    // respiración ronca de cerca
    P = ZPROFILE.moan;
    const f = between(r, 70, 90);
    segs.push({ dur: between(r, 0.35, 0.6), f0: [f, f], v: 'y', amp: [0, 0.6], voiced: 0.15, noise: { f: 1100, bw: 1600, amp: 0.5 }, soft: 0.1 });
    segs.push({ dur: 0.1, f0: [f, f], v: 'y', amp: [0.6, 0.1], voiced: 0.3 });
    segs.push({ dur: between(r, 0.4, 0.7), f0: [f * 0.9, f * 0.8], v: 'w', amp: [0.3, 0], voiced: 0.4, noise: { f: 700, bw: 1000, amp: 0.4 }, soft: 0.08 });
  } else if (kind === 'boss') {
    const f = between(r, 62, 80);
    segs.push({ dur: 0.1, f0: [f * 0.8, f], v: 'o', amp: [0, 1], soft: 0.04 });
    segs.push({ dur: between(r, 0.8, 1.3), f0: [f, f * 1.3], v: 'a', amp: [1, 1], noise: { f: 1600, bw: 2500, amp: 0.15 } });
    segs.push({ dur: 0.6, f0: [f * 1.3, f * 0.7], v: 'w', amp: [1, 0] });
  }
  return { data: renderVoice(segs, P, r), rate: RATE };
}

// ---------------- murmullos con forma de habla ----------------
// Cada personaje con su voz: altura (f0), velocidad, cuánto sube y baja la
// melodía (range), el largo del tracto (shift: más chico = más grande el que
// habla), aire, temblor, aspereza y la nasalidad (bwMul). Además: whisper
// (susurro), trem (temblor de volumen), jump (cada palabra a otra altura),
// rateVar (cuánto cambia la velocidad), pauseK (pausas) y drawl (el final
// de la frase arrastrado). Los gauchos del penal y del estero tienen que
// reconocerse sin leer el nombre (lo pidió el usuario, que juega con murmullos).
export const SPEAKERS = {
  // el Abuelo: viejo, lento y temblón
  abuelo: { f0: 112, rate: 0.8, range: 1.1, jitter: 0.04, shimmer: 0.12, breath: 0.26, vib: { rate: 5.8, depth: 0.045 }, tilt: 0.48, shift: 0.97, oq: 0.66, level: 0.8 },
  anunciador: { f0: 58, rate: 0.72, range: 0.6, jitter: 0.012, shimmer: 0.05, breath: 0.08, sub: 0.5, growl: 0.2, roughRate: 30, tilt: 0.4, shift: 0.8, drive: 1.8, oq: 0.6, level: 0.9 },
  // el Capataz de joven, antes del pacto: voz más clara y sin gruñido
  capatazJoven: { f0: 124, rate: 1.04, range: 1.2, jitter: 0.018, shimmer: 0.06, breath: 0.1, tilt: 0.32, shift: 0.99, oq: 0.55, level: 0.8 },
  capataz: { f0: 82, rate: 0.98, range: 0.8, jitter: 0.03, shimmer: 0.1, breath: 0.12, growl: 0.5, roughRate: 45, sub: 0.28, tilt: 0.36, shift: 0.86, drive: 2.3, oq: 0.55, level: 0.9 },
  radio: { f0: 128, rate: 1.1, range: 1.3, jitter: 0.015, shimmer: 0.05, breath: 0.1, tilt: 0.3, shift: 1.02, oq: 0.55, level: 0.8 },
  taza: { f0: 205, rate: 1.15, range: 1.5, jitter: 0.02, shimmer: 0.08, breath: 0.12, tilt: 0.28, shift: 1.2, oq: 0.5, level: 0.8 },
  // la Voz de Arriba: muy grave, lenta, pareja (casi sin melodía) y como en coro
  entidad: { f0: 64, rate: 0.74, range: 0.45, jitter: 0.006, shimmer: 0.03, breath: 0.28, sub: 0.45, vib: { rate: 2.8, depth: 0.015 }, tilt: 0.52, shift: 0.8, oq: 0.72, level: 0.85 },
  // el espantapájaros: seco y rasposo, como paja que cruje
  espantapajaros: { f0: 118, rate: 0.9, range: 1.4, jitter: 0.06, shimmer: 0.16, breath: 0.4, growl: 0.35, roughRate: 70, tilt: 0.28, shift: 1.08, drive: 1.8, oq: 0.48, level: 0.85 },
  // el Alcaide: porteño, rápido, agudo y nasal (la melodía sube y baja mucho)
  alcaide: { f0: 134, rate: 1.22, range: 1.6, jitter: 0.018, shimmer: 0.06, breath: 0.06, growl: 0.1, roughRate: 40, tilt: 0.2, shift: 1.07, bwMul: 1.5, drive: 1.3, oq: 0.45, level: 0.9 },
  // el Gauchito Gil: el más grave, liso y firme (nada de aspereza), pausado, con algo de santo
  gil: { f0: 70, rate: 0.78, range: 0.8, jitter: 0.012, shimmer: 0.05, breath: 0.14, sub: 0.36, vib: { rate: 4, depth: 0.02 }, growl: 0.08, roughRate: 35, tilt: 0.44, shift: 0.85, drive: 1.2, oq: 0.66, drawl: 1.15, pauseK: 1.25, level: 0.9 },
  // los presos:
  //  · Anacleto, el carnicero: grandote y viejo, ronco de ripio (gruñido lento y
  //    carraspera), oscuro, lento, con pausas largas y el final arrastrado
  //  · Cirilo: joven, agudo y brillante, habla de corrido y casi sin pausas
  //  · Benito, medio loco: nasal, la voz le tiembla (vibrato y volumen), cada
  //    palabra salta a otra altura y se apura y se frena de golpe
  anacleto: { f0: 92, rate: 0.86, range: 0.9, jitter: 0.05, shimmer: 0.16, breath: 0.3, growl: 0.6, roughRate: 26, fry: 0.14, creak: 0.7, tilt: 0.55, shift: 0.89, oq: 0.66, drive: 1.7, pauseK: 1.5, drawl: 1.2, level: 0.85 },
  cirilo: { f0: 178, rate: 1.32, range: 1.6, rateVar: 0.2, jitter: 0.02, shimmer: 0.06, breath: 0.1, tilt: 0.22, shift: 1.13, oq: 0.5, pauseK: 0.6, level: 0.8 },
  benito: { f0: 124, rate: 1.05, rateVar: 0.45, range: 2.1, jump: 0.22, jitter: 0.05, shimmer: 0.12, breath: 0.2, vib: { rate: 7.5, depth: 0.07 }, trem: { rate: 5.2, depth: 0.35 }, tilt: 0.38, shift: 1, bwMul: 1.6, oq: 0.56, level: 0.8 },
  // Nicanor, el compañero de celda de Cirilo (muerto hace cien años, solo le
  // habla al alma): un susurro (casi sin voz, puro aire), lento, con pausas
  // largas y un vaivén lento de fantasma
  nicanor: { f0: 118, rate: 0.7, range: 0.7, whisper: 0.7, jitter: 0.03, shimmer: 0.1, breath: 0.5, vib: { rate: 2.2, depth: 0.05 }, tilt: 0.6, shift: 1.04, bwMul: 1.3, oq: 0.8, pauseK: 1.6, drawl: 1.3, level: 0.85 },
  // la torre: Martín Fierro (la misma voz del Abuelo, más firme) y Francisco (la Voz, ya hombre)
  fierro: { f0: 102, rate: 0.84, range: 1, jitter: 0.025, shimmer: 0.08, breath: 0.2, vib: { rate: 5, depth: 0.03 }, tilt: 0.42, shift: 0.94, oq: 0.64, level: 0.85 },
  francisco: { f0: 90, rate: 0.9, range: 0.75, jitter: 0.015, shimmer: 0.06, breath: 0.18, sub: 0.22, vib: { rate: 3.6, depth: 0.018 }, tilt: 0.4, shift: 0.9, oq: 0.6, level: 0.9 },
  // los cuatro caballeros del castillo, fantasmas de antes: cada uno con su elemento
  // Fuego: caliente y rasposo (crepita), con ímpetu pero sin apurarse (a 1.1
  // hablaba muy rápido en las palabras del final: pedido del usuario)
  caballeroFuego: { f0: 98, rate: 0.92, pauseK: 1.2, range: 1.4, jitter: 0.04, shimmer: 0.14, breath: 0.18, growl: 0.7, roughRate: 64, fry: 0.16, tilt: 0.24, shift: 0.97, drive: 2.6, oq: 0.5, level: 0.9 },
  // Viento: alto, liviano y soplado (mucho aire), con un vaivén lento como una ráfaga
  caballeroViento: { f0: 165, rate: 0.94, range: 1.3, jitter: 0.015, shimmer: 0.06, breath: 0.45, vib: { rate: 3, depth: 0.03 }, tilt: 0.55, shift: 1.1, oq: 0.75, level: 0.8 },
  // Rayo: nítido y brillante, con un temblor rápido como electricidad
  caballeroRayo: { f0: 118, rate: 1.12, range: 1.6, jitter: 0.01, shimmer: 0.04, breath: 0.05, vib: { rate: 9, depth: 0.035 }, tilt: 0.12, shift: 1.05, bwMul: 0.75, drive: 1.6, oq: 0.42, level: 0.85 },
  // Hielo: grave, muy lento y casi sin melodía; resonancias finitas como de vidrio
  // el Sargento de la partida (el estero): ahogado, ladra órdenes con la voz
  // mojada (apagada, con un gorgoteo rápido) y más apurado que el viejo Anacleto
  sargento: { f0: 116, rate: 1.12, range: 1.35, jitter: 0.035, shimmer: 0.12, breath: 0.2, vib: { rate: 11, depth: 0.06 }, growl: 0.3, roughRate: 22, tilt: 0.46, shift: 0.95, bwMul: 2, drive: 1.5, oq: 0.58, level: 0.9 },
  caballeroHielo: { f0: 72, rate: 0.66, range: 0.3, jitter: 0.004, shimmer: 0.02, breath: 0.2, tilt: 0.22, shift: 1.02, bwMul: 0.55, oq: 0.5, level: 0.85 },
  // Manuel Belgrano, el ánima del Monumento: voz media y culta, solemne, con
  // mucha melodía y algo de aire de fantasma (no se confunde con Fierro: más
  // agudo, más melodía, el susurro y las pausas largas)
  belgrano: { f0: 114, rate: 0.88, range: 1.35, jitter: 0.012, shimmer: 0.05, breath: 0.24, whisper: 0.28, vib: { rate: 3.2, depth: 0.03 }, tilt: 0.48, shift: 0.97, oq: 0.58, pauseK: 1.3, drawl: 1.1, level: 0.9 },
  // San Martín en San Lorenzo (Eclipse Matero): voz de mando, firme y seca, sin
  // aire; Cabral, herido de muerte: más bajo, despacio y con mucho aire
  sanmartin: { f0: 96, rate: 1.0, range: 1.1, jitter: 0.01, shimmer: 0.04, breath: 0.12, vib: { rate: 5, depth: 0.02 }, tilt: 0.4, shift: 0.92, drive: 1.3, oq: 0.6, pauseK: 1.1, level: 0.95 },
  cabral: { f0: 104, rate: 0.8, range: 0.9, jitter: 0.03, shimmer: 0.09, breath: 0.42, whisper: 0.35, vib: { rate: 6, depth: 0.04 }, tilt: 0.5, shift: 0.96, oq: 0.55, pauseK: 1.5, drawl: 1.2, level: 0.8 },
};
// (2026-10-09, el usuario, por el final de Eclipse: "no se entiende quién dice
// qué... todos tienen la misma voz". Fierro (102 Hz), San Martín (96) y el Gil
// (70) eran tres graves parecidos. Fierro queda; San Martín, más agudo, firme y
// cortado —de mando—; el Gil, más grave, lento y con más pecho.
// globalThis.__mduOldVoces10: como antes)
if (globalThis.__mduOldVoces10 !== true) {
  Object.assign(SPEAKERS.sanmartin, { f0: 138, rate: 1.1, range: 0.75, tilt: 0.3, shift: 1.05, drive: 1.6, pauseK: 0.9 });
  Object.assign(SPEAKERS.gil, { f0: 60, rate: 0.72, shift: 0.8, sub: 0.46, drawl: 1.25 });
}

const VOWELS_RE = /[aeiouáéíóúü]/;
const STRIP = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

// De la palabra escrita a "letras de sonido" del castellano rioplatense: la u
// muda de gue/gui/que/qui (llegué no es "llegüe") y la ü que sí suena, la h
// muda, ll e y como "sh", c y g suaves delante de e/i, z como s, v como b y la
// rr (o la r del principio) vibrante. Letras propias: G = g dura, S = sh,
// C = ch, R = rr.
export function phon(word) {
  return word
    .replace(/ch/g, 'C')
    .replace(/h/g, '')
    .replace(/ll/g, 'S')
    .replace(/rr/g, 'R')
    .replace(/^r/, 'R')
    .replace(/gü/g, 'Gw')
    .replace(/gu([eéií])/g, 'G$1')
    .replace(/g([eéií])/g, 'j$1')
    .replace(/g/g, 'G')
    .replace(/qu([eéií])/g, 'k$1')
    .replace(/q/g, 'k')
    .replace(/c([eéií])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/x/g, 'ks')
    .replace(/y$/, 'i')
    .replace(/y/g, 'S')
    .replace(/ü/g, 'u');
}

// La vocal que lleva el acento y las que son semivocales (la i/u de un
// diptongo, más cortas). Las sílabas se cuentan por núcleos: dos vocales
// seguidas son una sola sílaba si una es i/u sin tilde. `orig` es la palabra
// escrita (la regla de las graves mira cómo termina: vocal, n o s).
function stressOf(orig, L) {
  const nuclei = [];
  let prev = -2;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (!VOWELS_RE.test(c)) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && prev === i - 1 && ('iu'.includes(c) || 'iu'.includes(L[i - 1]))) last.push(i);
    else nuclei.push([i]);
    prev = i;
  }
  if (!nuclei.length) return { at: -1, glides: new Set() };
  let n = nuclei.findIndex((v) => v.some((i) => 'áéíóú'.includes(L[i])));
  if (n < 0) n = /[aeiouáéíóúns]$/.test(orig) ? Math.max(0, nuclei.length - 2) : nuclei.length - 1;
  const nu = nuclei[n];
  const at = nu.find((i) => 'áéíóú'.includes(L[i])) ?? nu.find((i) => 'aeo'.includes(L[i])) ?? nu[nu.length - 1];
  const glides = new Set();
  for (const v of nuclei) if (v.length > 1) for (const i of v) if (i !== at && 'iu'.includes(L[i])) glides.add(i);
  return { at, glides };
}

// Adónde van los formantes en cada consonante (el "lugar" donde se cierra la
// boca): así las vocales se deslizan hacia la consonante y salen de ella, y
// una b no suena igual que una d o una g.
const LOCUS = {
  lab: [280, 900, 2300, 3300],
  alv: [300, 1700, 2600, 3400],
  pal: [280, 2150, 2900, 3500],
  vel: [300, 1500, 2200, 3300],
};

// Consonantes: tipo, lugar (at) y color del ruido. prev: la letra de antes
// (entre vocales la b, la d y la g son suaves, casi sin cerrar la boca);
// last: si es la última letra de la palabra (la d del final casi no suena).
function consonant(c, next, prev, last) {
  const soft = !!prev && (VOWELS_RE.test(prev) || prev === 'r');
  switch (c) {
    case 's':
      // la s antes de consonante se aspira ("ehtá", como en el Río de la Plata)
      return next && !VOWELS_RE.test(next) ? { k: 'fric', at: 'alv', f: 1400, bw: 2600, amp: 0.3, dur: 0.06 } : { k: 'fric', at: 'alv', f: 5200, bw: 2400, amp: 0.55, dur: 0.075 };
    case 'z':
      return { k: 'fric', at: 'alv', f: 5200, bw: 2400, amp: 0.55, dur: 0.075 };
    case 'S':
      return { k: 'fric', at: 'pal', f: 3100, bw: 2200, amp: 0.5, dur: 0.08 };
    case 'C':
      return { k: 'affr', at: 'pal', f: 3400, bw: 2400, amp: 0.45, dur: 0.07 };
    case 'c':
      return 'ei'.includes(next) ? { k: 'fric', at: 'alv', f: 5200, bw: 2400, amp: 0.55, dur: 0.075 } : { k: 'stop', at: 'vel', f: 2000, dur: 0.05 };
    case 'f':
      return { k: 'fric', at: 'lab', f: 4200, bw: 3500, amp: 0.25, dur: 0.07 };
    case 'j':
    case 'x':
      return { k: 'fric', at: 'vel', f: 1700, bw: 1600, amp: 0.45, dur: 0.07 };
    case 'G':
    case 'g':
      if (c === 'g' && 'ei'.includes(next)) return { k: 'fric', at: 'vel', f: 1700, bw: 1600, amp: 0.45, dur: 0.07 };
      return soft ? { k: 'approx', at: 'vel', amp: 0.5, dur: 0.045 } : { k: 'stop', at: 'vel', f: 1800, voiced: true, dur: 0.04 };
    case 'h':
      return null;
    case 'p':
      return { k: 'stop', at: 'lab', f: 900, dur: 0.055 };
    case 't':
      return { k: 'stop', at: 'alv', f: 3600, dur: 0.05 };
    case 'k':
    case 'q':
      return { k: 'stop', at: 'vel', f: 2000, dur: 0.055 };
    case 'b':
    case 'v':
      return soft ? { k: 'approx', at: 'lab', amp: 0.55, dur: 0.045 } : { k: 'stop', at: 'lab', f: 800, voiced: true, dur: 0.04 };
    case 'd':
      if (last) return soft ? { k: 'approx', at: 'alv', amp: 0.35, dur: 0.03 } : null;
      return soft ? { k: 'approx', at: 'alv', amp: 0.6, dur: 0.04 } : { k: 'stop', at: 'alv', f: 3000, voiced: true, dur: 0.035 };
    case 'm':
      return { k: 'nasal', v: [260, 1000, 2300, 3300], dur: 0.06 };
    case 'n':
      return { k: 'nasal', v: [260, 1500, 2500, 3300], dur: 0.055 };
    case 'ñ':
      return { k: 'nasal', v: [260, 2000, 2800, 3400], dur: 0.065 };
    case 'l':
      return { k: 'liquid', v: [360, 1500, 2700, 3400], dur: 0.05 };
    case 'r':
      return { k: 'tap', dur: 0.028 };
    case 'R':
      return { k: 'trill', dur: 0.075 };
    case 'y':
      return { k: 'liquid', v: [320, 2000, 2700, 3500], dur: 0.05 };
    case 'w':
      return { k: 'liquid', v: [330, 750, 2350, 3300], dur: 0.04 };
    default:
      return null;
  }
}

// Convierte un texto en segmentos con ritmo y entonación de castellano rioplatense.
// Las palabras de una frase van encadenadas (sin silencios entre una y otra);
// la frase se estira al final y cierra con la voz que se apaga (un poco de
// carraspera y de aire) y, después de un punto, a veces se toma aire.
// Los números, en palabras (hasta 9999): el murmullo arma sílabas con letras y
// los dígitos se los salteaba (2026-10-09, el usuario: Martín Fierro "quiere
// decir un número —1813— y no puede"). "1813" → "mil ochocientos trece".
// globalThis.__mduOldVoiceNum: como antes
const UNI = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function numWords(n) {
  if (n < 30) return UNI[n];
  if (n < 100) return DEC[Math.floor(n / 10)] + (n % 10 ? ' y ' + UNI[n % 10] : '');
  if (n === 100) return 'cien';
  if (n < 1000) return CEN[Math.floor(n / 100)] + (n % 100 ? ' ' + numWords(n % 100) : '');
  const m = Math.floor(n / 1000);
  return (m === 1 ? 'mil' : numWords(m) + ' mil') + (n % 1000 ? ' ' + numWords(n % 1000) : '');
}
const sayNumbers = (t) => (globalThis.__mduOldVoiceNum === true ? t : t.replace(/\d{1,4}/g, (d) => numWords(+d)));

export function speechSegments(text, S, r = Math.random) {
  const segs = [];
  const clean = sayNumbers(text).toLowerCase().replace(/[¡¿"«»()]/g, '');
  const phrases = clean.split(/([,.;:!?…]+)/);
  const base = S.f0;
  // cuánto se mueve la melodía (acentos, caída de la frase, exclamaciones)
  const R = S.range ?? 1;
  // cuánto se le quiebra la voz al cerrar una frase (los graves, más)
  const creakK = S.creak ?? (base < 100 ? 0.45 : 0.3);
  let prevPunct = '';
  // (cut: a la frase la interrumpe otra cosa; la última palabra no se estira
  // ni cierra con pausa, queda cortada en el aire)
  let lastBody = -1;
  if (S.cut) for (let p = 0; p < phrases.length; p += 2) if (phrases[p].trim()) lastBody = p;
  for (let p = 0; p < phrases.length; p += 2) {
    const body = phrases[p].trim();
    const punct = phrases[p + 1] || '';
    if (!body) continue;
    const words = body.split(/\s+/);
    // cada frase a su velocidad (las cortas, más rápido)
    // (rateVar: cuánto cambia de una frase a otra; el que está medio loco, mucho)
    const rv = S.rateVar ?? 0.14;
    const rate = (S.rate ?? 1) * (1 - rv / 2 + r() * rv) * (words.length <= 3 ? 1.06 : 1);
    const sounds = words.map((w) => [...phon(w)]);
    const vowelsTotal = sounds.reduce((n, L) => n + L.filter((c) => VOWELS_RE.test(c)).length, 0) || 1;
    let vi = 0;
    const question = punct.includes('?');
    const excl = punct.includes('!');
    const stop = /[.!?…]/.test(punct);
    const ends = !!punct;
    // después de un punto, a veces se oye cómo toma aire
    if (/[.!?…]/.test(prevPunct) && r() < 0.35) segs.push({ dur: (0.14 + r() * 0.08) / rate, f0: [base, base], v: 'a', amp: [0.3, 0.35], voiced: 0, noise: { f: 1600, bw: 2600, amp: 0.07 }, soft: 0.04 });
    prevPunct = punct;
    words.forEach((word, wi) => {
      const letters = sounds[wi];
      const { at, glides } = stressOf(word, letters);
      const lastWord = wi === words.length - 1 && p !== lastBody;
      // jump: cada palabra salta a otra altura (la melodía que se le escapa)
      const wj = S.jump ? 1 + (r() - 0.5) * 2 * S.jump : 1;
      for (let i = 0; i < letters.length; i++) {
        const c = letters[i];
        const next = letters[i + 1] || '';
        if (VOWELS_RE.test(c)) {
          const v = STRIP[c] || c;
          const prog = vi / vowelsTotal;
          const stressed = i === at;
          const glide = glides.has(i);
          const lastV = vi === vowelsTotal - 1;
          let f = base * wj * (1 + (0.08 - prog * 0.22) * R) * (stressed ? 1 + 0.14 * R : 1) * (excl ? 1 + 0.12 * R : 1);
          if (question && prog > 0.7) f *= 1 + (prog - 0.7) * 1.2 * R;
          f *= 1 + (r() - 0.5) * 0.05;
          let dur = (glide ? 0.042 : (stressed ? 0.105 : 0.068) + r() * 0.015) / rate;
          // se frena hacia el final de la frase y la última palabra se estira
          dur *= 1 + prog * 0.12;
          // (drawl: el que arrastra el final de la frase, bien de campo)
          if (lastWord && !glide) dur *= (stressed ? 1.45 : lastV ? 1.35 : 1.1) * (S.drawl ?? 1);
          const glideTo = f * (stressed ? 1 - 0.06 * R : 0.98);
          if (lastV && ends && !glide) {
            // la última vocal: se apaga, y al cerrar la frase se quiebra un poco
            const k = stop && !question && !excl ? creakK : creakK * 0.3;
            segs.push({ dur: dur * 0.6, f0: [f, f + (glideTo - f) * 0.6], v, amp: [0.85, 0.75] });
            segs.push({ dur: dur * 0.4, f0: [f + (glideTo - f) * 0.6, glideTo * (stop && !question ? 0.94 : 1)], v, amp: [0.75, 0.3], creak: k, breathy: stop ? 0.5 : 0.2 });
            // el aire que sale al terminar
            if (stop) segs.push({ dur: 0.07 / rate, f0: [glideTo * 0.9, glideTo * 0.85], v, amp: [0.3, 0], voiced: 0.15, breathy: 1, noise: { f: 1300, bw: 2200, amp: 0.05 }, soft: 0.01 });
          } else segs.push({ dur, f0: [f, glideTo], v, amp: glide ? [0.6, 0.7] : [0.85, stressed ? 1 : 0.8] });
          vi++;
          continue;
        }
        const k = consonant(c, next, letters[i - 1] || (wi > 0 ? sounds[wi - 1][sounds[wi - 1].length - 1] : ''), i === letters.length - 1);
        if (!k) continue;
        const prevF = segs.length ? segs[segs.length - 1].f0[1] : base;
        const d = (k.dur * 0.72) / rate;
        const L = k.at ? LOCUS[k.at] : 'y';
        if (k.k === 'fric') segs.push({ dur: d, f0: [prevF, prevF], v: L, amp: [0.5, 0.5], voiced: 0, noise: { f: k.f, bw: k.bw, amp: k.amp * 0.3 } });
        else if (k.k === 'stop' || k.k === 'affr') {
          segs.push({ dur: d * 0.7, f0: [prevF, prevF], v: L, amp: [k.voiced ? 0.15 : 0, k.voiced ? 0.15 : 0], voiced: k.voiced ? 1 : 0, soft: 0.003 });
          segs.push({ dur: 0.012, f0: [prevF, prevF], v: L, amp: [0.5, 0.5], voiced: k.voiced ? 0.6 : 0, noise: { f: k.k === 'affr' ? 3600 : k.f, bw: 2500, amp: 0.22 }, soft: 0.001 });
          // la ch: después del golpe, un "sh" cortito
          if (k.k === 'affr') segs.push({ dur: d * 0.6, f0: [prevF, prevF], v: L, amp: [0.5, 0.4], voiced: 0, noise: { f: k.f, bw: k.bw, amp: k.amp * 0.3 } });
        } else if (k.k === 'approx') {
          // b, d, g suaves: la boca casi no se cierra, la voz no se corta
          segs.push({ dur: d, f0: [prevF, prevF * 0.99], v: [Math.max(L[0], 340), L[1], L[2], L[3]], amp: [k.amp, k.amp], soft: 0.008 });
        } else if (k.k === 'nasal' || k.k === 'liquid') segs.push({ dur: d, f0: [prevF, prevF * 0.99], v: k.v, amp: [k.k === 'nasal' ? 0.45 : 0.65, k.k === 'nasal' ? 0.45 : 0.65] });
        else if (k.k === 'tap') segs.push({ dur: d, f0: [prevF, prevF], v: LOCUS.alv, amp: [0.3, 0.3], soft: 0.002 });
        else if (k.k === 'trill') {
          // la rr: tres golpecitos de lengua
          for (let j = 0; j < 3; j++) {
            segs.push({ dur: d * 0.18, f0: [prevF, prevF], v: LOCUS.alv, amp: [0.2, 0.2], soft: 0.001 });
            segs.push({ dur: d * 0.15, f0: [prevF, prevF], v: [420, 1600, 2500, 3400], amp: [0.55, 0.55], soft: 0.001 });
          }
        }
      }
    });
    if (p === lastBody) continue;
    // pausa según la puntuación
    // (pauseK: el que piensa cada palabra, o el que habla de corrido)
    const pause = (punct.includes('…') || punct.includes('...') ? 0.4 : /[.!?]/.test(punct) ? 0.28 : punct ? 0.15 : 0.08) * (S.pauseK ?? 1);
    segs.push({ dur: pause / rate, f0: [base * 0.8, base * 0.8], v: 'y', amp: [0, 0], voiced: 0, noise: { f: 1200, bw: 1500, amp: 0.02 } });
  }
  return segs;
}

// Lo que dice un personaje, listo para renderizar (segmentos y perfil): el
// audio lo renderiza en un worker para no trabar el juego.
export function speechPlan(text, speaker = 'abuelo', r = Math.random, { cut = false } = {}) {
  const S0 = SPEAKERS[speaker] || SPEAKERS.abuelo;
  const S = cut ? { ...S0, cut: true, tail: 0 } : S0;
  return { segs: speechSegments(text, S, r), P: { ...S, glide: 0.022 } };
}

// Cuánto dura lo que renderVoice arma con esos segmentos (la misma cuenta).
export const voiceLength = (segs, P) => segs.reduce((s, x) => s + x.dur, 0) + (P.tail ?? 0.08);

export function speech(text, speaker = 'abuelo', r = Math.random) {
  const { segs, P } = speechPlan(text, speaker, r);
  return { data: renderVoice(segs, P, r), rate: RATE };
}
