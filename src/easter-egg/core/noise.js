// Ruido de valor y números pseudoaleatorios con semilla, para texturas
// procedurales y variaciones repetibles.

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed = 1) {
  const rand = rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  // Ruido 2D que se repite cada `period` unidades (para texturas sin costuras).
  // (2026-10-12, tiempos de carga: sin la función de adentro y sin repetir
  // búsquedas, 1,6 veces más rápido con el mismo resultado bit a bit; era
  // ~0,7 s de la carga de Eclipse)
  const noise = (x, y, period = 256) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    let x0 = xi % period;
    if (x0 < 0) x0 += period;
    let y0 = yi % period;
    if (y0 < 0) y0 += period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const p0 = perm[x0 & 255];
    const p1 = perm[x1 & 255];
    const v00 = vals[perm[(p0 + y0) & 255]];
    const v10 = vals[perm[(p1 + y0) & 255]];
    const v01 = vals[perm[(p0 + y1) & 255]];
    const v11 = vals[perm[(p1 + y1) & 255]];
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    const a = v00 + (v10 - v00) * u;
    const b = v01 + (v11 - v01) * u;
    return a + (b - a) * w;
  };
  const fbm = (x, y, octaves = 4, period = 256) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f, y * f, period * f);
      f *= 2;
      amp *= 0.5;
    }
    return sum / (1 - Math.pow(0.5, octaves));
  };
  return { noise, fbm };
}
