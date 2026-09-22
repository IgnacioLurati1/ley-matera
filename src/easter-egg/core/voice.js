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
    const breath = (rand() * 2 - 1) * (P.breath ?? 0.08) * (0.35 + 0.65 * flow);
    let x = (tilt * 18 * growl + breath) * voicedS;

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
    out[idx] = (x + fr) * ampS;
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
export const SPEAKERS = {
  abuelo: { f0: 108, rate: 0.82, jitter: 0.03, shimmer: 0.09, breath: 0.22, vib: { rate: 5.5, depth: 0.035 }, tilt: 0.45, shift: 0.96, oq: 0.65, level: 0.8 },
  anunciador: { f0: 58, rate: 0.72, jitter: 0.012, shimmer: 0.05, breath: 0.08, sub: 0.5, growl: 0.2, roughRate: 30, tilt: 0.4, shift: 0.8, drive: 1.8, oq: 0.6, level: 0.9 },
  capataz: { f0: 88, rate: 1.0, jitter: 0.03, shimmer: 0.1, breath: 0.12, growl: 0.45, roughRate: 45, sub: 0.25, tilt: 0.35, shift: 0.88, drive: 2.2, oq: 0.55, level: 0.9 },
  radio: { f0: 122, rate: 1.05, jitter: 0.015, shimmer: 0.05, breath: 0.1, tilt: 0.3, shift: 1.0, oq: 0.55, level: 0.8 },
  taza: { f0: 190, rate: 1.1, jitter: 0.02, shimmer: 0.08, breath: 0.12, tilt: 0.3, shift: 1.15, oq: 0.5, level: 0.8 },
};

const VOWELS_RE = /[aeiouáéíóúü]/;
const STRIP = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

// Consonantes: tipo y color del ruido.
function consonant(c, next) {
  switch (c) {
    case 's':
    case 'z':
      return { k: 'fric', f: 5200, bw: 2400, amp: 0.55, dur: 0.075 };
    case 'c':
      return 'ei'.includes(next) ? { k: 'fric', f: 5200, bw: 2400, amp: 0.55, dur: 0.075 } : { k: 'stop', f: 2000, dur: 0.05 };
    case 'f':
      return { k: 'fric', f: 4200, bw: 3500, amp: 0.25, dur: 0.07 };
    case 'j':
    case 'x':
      return { k: 'fric', f: 1700, bw: 1600, amp: 0.45, dur: 0.07 };
    case 'g':
      return 'ei'.includes(next) ? { k: 'fric', f: 1700, bw: 1600, amp: 0.45, dur: 0.07 } : { k: 'stop', f: 1800, voiced: true, dur: 0.04 };
    case 'h':
      return null;
    case 'p':
      return { k: 'stop', f: 900, dur: 0.055 };
    case 't':
      return { k: 'stop', f: 3600, dur: 0.05 };
    case 'k':
    case 'q':
      return { k: 'stop', f: 2000, dur: 0.055 };
    case 'b':
    case 'v':
      return { k: 'stop', f: 800, voiced: true, dur: 0.04 };
    case 'd':
      return { k: 'stop', f: 3000, voiced: true, dur: 0.035 };
    case 'm':
      return { k: 'nasal', v: [260, 1100, 2400, 3300], dur: 0.06 };
    case 'n':
    case 'ñ':
      return { k: 'nasal', v: [260, 1500, 2500, 3300], dur: 0.055 };
    case 'l':
      return { k: 'liquid', v: [360, 1200, 2600, 3400], dur: 0.05 };
    case 'r':
      return { k: 'tap', dur: 0.03 };
    case 'y':
      return { k: 'liquid', v: [320, 2000, 2700, 3500], dur: 0.05 };
    case 'w':
      return { k: 'liquid', v: [330, 750, 2350, 3300], dur: 0.04 };
    default:
      return null;
  }
}

// Convierte un texto en segmentos con ritmo y entonación de castellano rioplatense.
export function speechSegments(text, S, r = Math.random) {
  const segs = [];
  const clean = text.toLowerCase().replace(/[¡¿"«»()]/g, '');
  const phrases = clean.split(/([,.;:!?…]+)/);
  const rate = S.rate ?? 1;
  const base = S.f0;
  for (let p = 0; p < phrases.length; p += 2) {
    const body = phrases[p].trim();
    const punct = phrases[p + 1] || '';
    if (!body) continue;
    const words = body.split(/\s+/);
    const vowelsTotal = (body.match(/[aeiouáéíóúü]/g) || []).length || 1;
    let vi = 0;
    const question = punct.includes('?');
    const excl = punct.includes('!');
    words.forEach((word, wi) => {
      const letters = [...word];
      const wv = letters.filter((c) => VOWELS_RE.test(c)).length;
      const accented = letters.findIndex((c) => 'áéíóú'.includes(c));
      // sílaba tónica: la que tiene tilde, o la penúltima (la última si termina en consonante que no es n/s)
      let stressV = accented >= 0 ? letters.slice(0, accented).filter((c) => VOWELS_RE.test(c)).length : Math.max(0, wv - (/[aeiouns]$/.test(word) ? 2 : 1));
      if (wv === 1) stressV = 0;
      let wvi = 0;
      for (let i = 0; i < letters.length; i++) {
        const c = letters[i];
        const next = letters[i + 1] || '';
        if (VOWELS_RE.test(c)) {
          const v = STRIP[c] || c;
          const prog = vi / vowelsTotal;
          const stressed = wvi === stressV;
          let f = base * (1.08 - prog * 0.22) * (stressed ? 1.14 : 1) * (excl ? 1.12 : 1);
          if (question && prog > 0.7) f *= 1 + (prog - 0.7) * 1.2;
          f *= 1 + (r() - 0.5) * 0.05;
          const dur = ((stressed ? 0.105 : 0.068) + r() * 0.015) / rate;
          const glideTo = f * (stressed ? 0.94 : 0.98);
          segs.push({ dur, f0: [f, glideTo], v, amp: [0.85, stressed ? 1 : 0.8] });
          vi++;
          wvi++;
          continue;
        }
        const k = consonant(c, next);
        if (!k) continue;
        const prevF = segs.length ? segs[segs.length - 1].f0[1] : base;
        const d = (k.dur * 0.72) / rate;
        if (k.k === 'fric') segs.push({ dur: d, f0: [prevF, prevF], v: 'y', amp: [0.5, 0.5], voiced: 0, noise: { f: k.f, bw: k.bw, amp: k.amp * 0.3 } });
        else if (k.k === 'stop') {
          segs.push({ dur: d * 0.7, f0: [prevF, prevF], v: 'y', amp: [k.voiced ? 0.15 : 0, k.voiced ? 0.15 : 0], voiced: k.voiced ? 1 : 0, soft: 0.003 });
          segs.push({ dur: 0.012, f0: [prevF, prevF], v: 'y', amp: [0.5, 0.5], voiced: k.voiced ? 0.6 : 0, noise: { f: k.f, bw: 2500, amp: 0.22 }, soft: 0.001 });
        } else if (k.k === 'nasal' || k.k === 'liquid') segs.push({ dur: d, f0: [prevF, prevF * 0.99], v: k.v, amp: [k.k === 'nasal' ? 0.45 : 0.65, k.k === 'nasal' ? 0.45 : 0.65] });
        else if (k.k === 'tap') segs.push({ dur: d, f0: [prevF, prevF], v: 'y', amp: [0.25, 0.25], soft: 0.002 });
      }
      if (wi < words.length - 1) segs.push({ dur: (0.012 + r() * 0.025) / rate, f0: [base, base], v: 'y', amp: [0, 0], voiced: 0 });
    });
    // pausa según la puntuación
    const pause = punct.includes('…') || punct.includes('...') ? 0.4 : /[.!?]/.test(punct) ? 0.28 : punct ? 0.15 : 0.08;
    segs.push({ dur: pause / rate, f0: [base * 0.8, base * 0.8], v: 'y', amp: [0, 0], voiced: 0, noise: { f: 1200, bw: 1500, amp: 0.02 } });
  }
  return segs;
}

export function speech(text, speaker = 'abuelo', r = Math.random) {
  const S = SPEAKERS[speaker] || SPEAKERS.abuelo;
  const segs = speechSegments(text, S, r);
  return { data: renderVoice(segs, { ...S, glide: 0.022 }, r), rate: RATE };
}
