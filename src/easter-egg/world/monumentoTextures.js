import * as THREE from 'three';
import { makeNoise, rng } from '../core/noise';
import { toTexture, takePre } from '../core/textures';

// Texturas del Monumento a la Bandera (se pintan solo cuando se arma ese
// mapa). El monumento es de travertino: piedra clara, tibia, con vetas
// horizontales y poros chiquitos; las losas del Patio Cívico son del mismo
// travertino, gastadas por los actos. Además: el bronce con pátina verde de
// las urnas, las farolas y las estatuas; la baldosa de 64 panes de las
// veredas de Rosario; el adoquín de las bajadas, el asfalto de la avenida
// Belgrano; el mármol de la Cripta y de la Sala de las Banderas, y las
// fachadas de la ciudad con sus ventanas prendidas.
// Todas repiten cada 2 m (256 px por metro); las UV las pone world/Monumento.js
// en metros / 2. Cada una trae su relieve (fx/Surfaces: normal map desde Media).

const N = makeNoise(1812);
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
// ruido que repite justo en los S px (períodos enteros: sin costura)
const per = (S, px) => Math.max(1, Math.round(S / px));
const fbmS = (S, x, y, px, oct, off = 0) => {
  const k = per(S, px);
  return N.fbm((x * k) / S + off, (y * k) / S, oct, k);
};
const noiseS = (S, x, y, px, off = 0) => {
  const k = per(S, px);
  return N.noise((x * k) / S + off, (y * k) / S, k);
};
// Ruido estirado (las vetas del travertino van a lo largo de la losa; el
// chorreado de lluvia, de arriba abajo): bandas de ruido 1D a lo largo del eje
// corto, torcidas por un ruido 2D del largo del eje largo. Repite en S.
const streakS = (S, x, y, pxX, pxY, off = 0) => {
  const across = pxX < pxY;
  const k = per(S, across ? pxX : pxY);
  const warp = fbmS(S, x, y, across ? pxY : pxX, 3, off + 0.5);
  const t = ((across ? x : y) * k) / S + warp * 1.6;
  return N.noise(t, 7.31 + off * 13.7, k) * 0.6 + N.noise(t * 2, 3.17 + off * 5.1, k * 2) * 0.4;
};

function paint(w, h, fn) {
  // (en un worker —core/textureWorker.js— no hay document: OffscreenCanvas)
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const p = fn(x, y);
      d[i] = p[0];
      d[i + 1] = p[1];
      d[i + 2] = p[2];
      d[i + 3] = p.length > 3 ? p[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Hiladas de losas: `rows` hiladas en los S px; cada una con 1 a 3 losas que
// suman justo el ancho, corrida al azar. Devuelve dónde cae cada pixel.
function courses(S, rows, seed, minK = 2, maxK = 3) {
  const r = rng(seed);
  const rh = S / rows;
  const list = [];
  for (let j = 0; j < rows; j++) {
    const k = minK + Math.floor(r() * (maxK - minK + 1));
    const wts = Array.from({ length: k }, () => 0.7 + r() * 0.6);
    const sum = wts.reduce((a, b) => a + b, 0);
    const blocks = [];
    let x = 0;
    for (let i = 0; i < k; i++) {
      const x1 = i === k - 1 ? S : Math.round(x + (wts[i] / sum) * S);
      blocks.push({ x0: x, x1, t: 0.9 + r() * 0.18, hue: r(), off: r() * 50, tilt: r() * 2 - 1 });
      x = x1;
    }
    list.push({ off: Math.floor(r() * S), blocks });
  }
  return (x, y) => {
    const j = Math.min(rows - 1, Math.floor(y / rh));
    const row = list[j];
    const ly = y - j * rh;
    const xx = (x + row.off) % S;
    let blk = row.blocks[0];
    for (const q of row.blocks) if (xx >= q.x0) blk = q;
    const lx = xx - blk.x0;
    const e = Math.min(lx, blk.x1 - blk.x0 - lx, ly, rh - ly);
    return { j, ly, lx, blk, e, rh, w: blk.x1 - blk.x0 };
  };
}

// El color del travertino en un punto: vetas a lo largo, poros oscuros
// alargados, manchas de óxido apenas rosadas.
function travColor(S, x, y, base, blk, seed) {
  const v = streakS(S, x + blk.off * 7, y, 90, 9, seed + blk.hue * 9);
  const n = fbmS(S, x, y, 30, 3, seed + 5);
  let col = mix(base, [206, 198, 182], blk.hue * 0.5);
  const mot = fbmS(S, x, y, 9, 3, seed + 13);
  col = shade(col, blk.t * (0.9 + (v - 0.5) * 0.12 + (n - 0.5) * 0.12 + (mot - 0.5) * 0.1));
  // bandas más grises, como en la piedra de verdad
  const band = streakS(S, x, y + blk.off * 3, 160, 26, seed + 11);
  if (band > 0.66) col = mix(col, [168, 164, 156], Math.min(0.3, (band - 0.66) * 1.8));
  // poros: chiquitos y alargados, oscuros por dentro
  const p = noiseS(S, x * 0.6, y * 1.8, 3, seed + 21);
  const pore = p > 0.78 ? (p - 0.78) * 4.5 : 0;
  if (pore) col = mix(col, [110, 100, 86], Math.min(0.65, pore));
  return { col, pore };
}

// Sillería de travertino de las paredes (la Torre, el Propileo, el basamento):
// losas de 0,5 m de alto y de 0,7 a 1,3 m de largo, juntas finas apenas hundidas.
function travertino({ seed, base = 0xcdc2ac, rows = 4, stain = 0.5 }) {
  const S = 512;
  const at = courses(S, rows, seed);
  const b = hex(base);
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { ly, blk, e, rh } = at(x, y);
    const { col: c0, pore } = travColor(S, x, y, b, blk, seed);
    let col = c0;
    // la junta: 3 mm de mortero claro, 1 cm adentro; el canto, apenas gastado
    let h = 1.2 + blk.tilt * (ly / rh - 0.5) * 0.6 - pore * 1.6;
    if (e < 2) {
      col = shade([176, 168, 152], 0.86 + noiseS(S, x, y, 6, seed) * 0.2);
      h = -2.2;
    } else if (e < 5) {
      h -= (1 - (e - 2) / 3) * 1.2;
      col = shade(col, 0.93);
    }
    // chorreado de lluvia y hollín: rayas verticales que bajan desde la junta de arriba
    if (stain) {
      const s = streakS(S, x, y, 5, 200, seed + 31);
      const top = 1 - ly / rh;
      if (s > 0.58) col = shade(col, 1 - Math.min(0.22, (s - 0.58) * 0.9 * stain * (0.4 + top)));
    }
    H[y * S + x] = h;
    return col;
  });
  c.relief = { H, detail: 0.22, depth: 0.012, ao: 0.9, aoBlur: 3 };
  return c;
}

// Losas del piso (el Patio Cívico, el Propileo, las escalinatas): 1 x 0,5 m,
// travertino más gastado y liso, con alguna rota y manchas de agua.
function travPave({ seed, base = 0xc4baa6, rows = 2 }) {
  const S = 512;
  const at = courses(S, rows, seed, 2, 2);
  const b = hex(base);
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const crack = rng(seed + 3);
  const cracks = Array.from({ length: 6 }, () => ({ x: crack() * S, y: crack() * S, a: crack() * Math.PI, l: 40 + crack() * 90 }));
  const c = paint(S, S, (x, y) => {
    const { blk, e } = at(x, y);
    const { col: c0, pore } = travColor(S, x, y, b, blk, seed);
    let col = c0;
    let h = 0.8 + (fbmS(S, x, y, 40, 2, seed) - 0.5) * 0.8 - pore;
    let rough = 0.62 + (1 - fbmS(S, x, y, 50, 2, seed + 7)) * 0.16;
    if (e < 1.6) {
      col = shade(mix(b, [150, 142, 128], 0.5), 0.86 + noiseS(S, x, y, 6, seed) * 0.12);
      h = -1.6;
      rough = 0.9;
    } else if (e < 4) {
      h -= (1 - (e - 1.6) / 2.4) * 0.6;
      col = shade(col, 0.96);
    }
    // grietas finitas
    for (const k of cracks) {
      const dx = x - k.x;
      const dy = y - k.y;
      const along = dx * Math.cos(k.a) + dy * Math.sin(k.a);
      const off = -dx * Math.sin(k.a) + dy * Math.cos(k.a) + Math.sin(along * 0.08) * 3;
      if (along > 0 && along < k.l && Math.abs(off) < 0.8) {
        col = shade(col, 0.72);
        h = -1.5;
      }
    }
    // charcos secos y manchas de humedad (la niebla)
    const wet = fbmS(S, x, y, 120, 3, seed + 41);
    if (wet > 0.6) {
      col = shade(col, 1 - (wet - 0.6) * 0.5);
      rough -= (wet - 0.6) * 0.8;
    }
    H[y * S + x] = h;
    Rg[y * S + x] = Math.max(0.25, Math.min(1, rough));
    return col;
  });
  c.relief = { H, detail: 0.18, depth: 0.008, rough: Rg, ao: 0.8, aoBlur: 3 };
  return c;
}

// Bronce con pátina: el pardo del metal y el verde de cobre que chorrea.
function bronze({ seed }) {
  const S = 512;
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const n = fbmS(S, x, y, 60, 4, seed);
    const s = streakS(S, x, y, 14, 140, seed + 3);
    const f = noiseS(S, x, y, 3, seed + 9);
    let col = mix([70, 54, 34], [92, 70, 44], n);
    const pat = Math.min(1, Math.max(0, (s * 0.7 + n * 0.5 - 0.42) * 2.4));
    col = mix(col, mix([74, 132, 112], [118, 170, 146], f), pat);
    // lo que se toca brilla: el bronce limpio asoma en los cantos (lo pone el bisel)
    H[y * S + x] = pat * 0.8 + (f - 0.5) * 0.4;
    Rg[y * S + x] = 0.42 + pat * 0.45;
    return shade(col, 0.9 + (f - 0.5) * 0.2);
  });
  c.relief = { H, scale: 0.6, detail: 0.3, rough: Rg };
  return c;
}

// La baldosa de 64 panes de las veredas de Rosario: 20 x 20 cm, amarillenta,
// con sus 8 x 8 panecitos en relieve; gastada y con alguna floja.
function baldosa({ seed }) {
  const S = 512;
  const tile = S / 10;
  const pan = tile / 8;
  const r = rng(seed);
  const tone = Array.from({ length: 100 }, () => 0.88 + r() * 0.16);
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    const lx = x - tx * tile;
    const ly = y - ty * tile;
    const e = Math.min(lx, tile - lx, ly, tile - ly);
    const px = lx % pan;
    const py = ly % pan;
    const pe = Math.min(px, pan - px, py, pan - py);
    const n = fbmS(S, x, y, 40, 3, seed);
    let col = shade([196, 180, 142], tone[ty * 10 + tx] * (0.86 + n * 0.22));
    let h = 0;
    if (e < 1.5) {
      col = shade([110, 100, 86], 0.9);
      h = -2;
    } else if (pe < 1.2) {
      col = shade(col, 0.82);
      h = -0.6;
    } else h = 0.8 - (fbmS(S, x, y, 9, 2, seed + 4) - 0.5) * 0.4;
    // mugre en las juntas y manchas de chicle
    const dirt = fbmS(S, x, y, 70, 3, seed + 6);
    if (dirt > 0.62) col = shade(col, 1 - (dirt - 0.62) * 0.8);
    H[y * S + x] = h;
    return col;
  });
  c.relief = { H, detail: 0.15, depth: 0.006, ao: 0.8, aoBlur: 2 };
  return c;
}

// Adoquín de granito de las bajadas: hileras de piedras de 20 x 12 cm, gris
// azulado, abombadas, con tierra en las juntas.
function adoquin({ seed }) {
  const S = 512;
  const rh = S / 16;
  const r = rng(seed);
  const rows = Array.from({ length: 16 }, () => ({ off: r() * S, w: 46 + r() * 10 }));
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const j = Math.floor(y / rh);
    const ly = y - j * rh;
    const R = rows[j];
    const k = Math.round(S / R.w);
    const w = S / k;
    const xx = (x + R.off) % S;
    const i = Math.floor(xx / w);
    const lx = xx - i * w;
    const e = Math.min(lx, w - lx, ly, rh - ly);
    const seedT = Math.sin((j * 31 + i * 17 + seed) * 12.9898) * 43758.5453;
    const t = 0.8 + (seedT - Math.floor(seedT)) * 0.3;
    const n = fbmS(S, x, y, 12, 3, seed);
    let col = shade([96, 98, 104], t * (0.8 + n * 0.4));
    const u = lx / w - 0.5;
    const v = ly / rh - 0.5;
    let h = 2.6 - (u * u + v * v) * 6 + (n - 0.5);
    if (e < 2.5) {
      col = shade([52, 46, 40], 0.8 + n * 0.4);
      h = -2;
    }
    H[y * S + x] = h;
    return col;
  });
  c.relief = { H, detail: 0.2, depth: 0.02, ao: 1.2, aoBlur: 3 };
  return c;
}

// Asfalto de la avenida: gris oscuro con piedrita, parches y grietas de calor.
function asfalto({ seed }) {
  const S = 512;
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const n = fbmS(S, x, y, 50, 4, seed);
    const g = noiseS(S, x, y, 2, seed + 3);
    let col = shade([44, 44, 46], 0.8 + n * 0.35 + (g - 0.5) * 0.35);
    const patch = fbmS(S, x, y, 160, 3, seed + 7);
    if (patch > 0.63) col = shade(col, 0.78);
    H[y * S + x] = (g - 0.5) * 0.8;
    return col;
  });
  c.relief = { H, scale: 0.5, detail: 0.3 };
  return c;
}

// Mármol pulido (la Cripta: gris verdoso oscuro; la Sala: crema con vetas
// doradas): losas grandes con juntas finitas y vetas que cruzan.
function marmol({ seed, base, vein, joint = 0x3a3632, rows = 2 }) {
  const S = 512;
  const at = courses(S, rows, seed, 1, 2);
  const b = hex(base);
  const vc = hex(vein);
  const jc = hex(joint);
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { blk, e } = at(x, y);
    const n = fbmS(S, x, y, 120, 4, seed + blk.off);
    // vetas: donde una función de ruido cruza un valor (líneas finas que se ramifican)
    const w = Math.abs(Math.sin((x * 0.006 + y * 0.011 + n * 6 + blk.off) * Math.PI));
    const w2 = Math.abs(Math.sin((x * 0.013 - y * 0.004 + n * 9 + blk.hue * 20) * Math.PI));
    let col = shade(b, blk.t * (0.9 + (n - 0.5) * 0.3));
    if (w < 0.05) col = mix(col, vc, (0.05 - w) * 14);
    if (w2 < 0.025) col = mix(col, vc, (0.025 - w2) * 18);
    let h = 0.5;
    let rough = 0.18 + n * 0.1;
    if (e < 1.5) {
      col = jc;
      h = -1.5;
      rough = 0.7;
    }
    H[y * S + x] = h;
    Rg[y * S + x] = rough;
    return col;
  });
  c.relief = { H, detail: 0.08, rough: Rg };
  return c;
}

// Fachada de edificio de la ciudad: hileras de ventanas (unas prendidas, de
// noche) y balcones. Devuelve el color y, aparte, lo que brilla (emissive).
function fachada({ seed, base = 0x8a8478, cols = 5, rows = 6, lit = 0.35, warm = true }) {
  const S = 512;
  const r = rng(seed);
  const cw = S / cols;
  const rh = S / rows;
  const win = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) win.push({ on: r() < lit, k: 0.6 + r() * 0.5, cur: r(), tv: r() < 0.12 });
  const b = hex(base);
  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  const gctx = glow.getContext('2d');
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, S, S);
  const c = paint(S, S, (x, y) => {
    const i = Math.floor(x / cw);
    const j = Math.floor(y / rh);
    const lx = x - i * cw;
    const ly = y - j * rh;
    const W = win[j * cols + i];
    const n = fbmS(S, x, y, 40, 3, seed);
    let col = shade(b, 0.85 + n * 0.25);
    // la losa del balcón (raya oscura abajo) y el antepecho
    if (ly > rh * 0.86) col = shade(col, 0.62);
    const inWin = lx > cw * 0.18 && lx < cw * 0.82 && ly > rh * 0.18 && ly < rh * 0.78;
    if (inWin) {
      if (W.on) {
        const curtain = W.cur > 0.5 && (lx < cw * 0.3 || lx > cw * 0.7);
        col = W.tv ? [90, 120, 170] : warm ? (curtain ? [150, 110, 60] : [235, 190, 120]) : [210, 220, 230];
      } else col = shade([26, 30, 36], 0.8 + n * 0.4);
      // el marco
      if (lx < cw * 0.21 || lx > cw * 0.79 || ly < rh * 0.21 || ly > rh * 0.75) col = shade(b, 0.55);
    }
    return col;
  });
  // lo que brilla: solo las ventanas prendidas
  win.forEach((W, k) => {
    if (!W.on) return;
    const i = k % cols;
    const j = Math.floor(k / cols);
    gctx.fillStyle = W.tv ? `rgba(110,150,220,${0.7 * W.k})` : `rgba(255,${190 + Math.floor(W.k * 30)},${110 + Math.floor(W.cur * 40)},${W.k})`;
    gctx.fillRect(i * cw + cw * 0.22, j * rh + rh * 0.22, cw * 0.56, rh * 0.52);
  });
  return { c, glow };
}

// Letras talladas en la piedra (las frases del Propileo, la Torre y la Proa):
// un canvas de travertino con el texto hundido (sombra arriba, luz abajo).
export function carvedText(text, { w = 2048, h = 128, size = 72, base = 0xc4b59a, spacing = 0.18 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const b = hex(base);
  const img = paint(w, h, (x, y) => {
    const n = fbmS(512, x % 512, y, 40, 3, 7);
    return shade(b, 0.88 + n * 0.18);
  });
  ctx.drawImage(img, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // separación entre letras (letterSpacing no está en todos los navegadores)
  const chars = [...text];
  const measure = (s) => {
    ctx.font = `600 ${s}px "Times New Roman", Georgia, serif`;
    return chars.map((ch) => ctx.measureText(ch).width + s * spacing);
  };
  let widths = measure(size);
  let total = widths.reduce((a, v) => a + v, 0);
  // (si la frase no entra, la letra se achica: "AL GRAN PUEBLO ARGENTINO
  // ¡SALUD!" quedaba cortada en las dos puntas del friso)
  if (total > w * 0.96) {
    widths = measure(Math.floor((size * w * 0.96) / total));
    total = widths.reduce((a, v) => a + v, 0);
  }
  const draw = (dx, dy, color) => {
    ctx.fillStyle = color;
    let x = w / 2 - total / 2;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, x + widths[i] / 2 + dx, h / 2 + dy);
      x += widths[i];
    });
  };
  draw(0, 2, 'rgba(255,248,230,0.55)');
  draw(0, -1, 'rgba(40,32,22,0.9)');
  draw(0, 0, 'rgba(92,78,58,0.95)');
  return c;
}

// Un relieve tallado: `draw(ctx)` dibuja las alturas en grises (negro = fondo,
// blanco = lo que más sobresale) y de ahí sale el color de la piedra (o del
// bronce) con la luz de arriba a la izquierda ya pintada (así se lee aun en
// Baja, sin normal map) y el relieve de verdad para fx/Surfaces.
export function reliefCanvas(size, draw, { base = 0xcbbca0, metal = false, light = 0.9, blurPx = 2 } = {}) {
  const hc = document.createElement('canvas');
  hc.width = hc.height = size;
  const hx = hc.getContext('2d');
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, size, size);
  hx.filter = `blur(${blurPx}px)`;
  draw(hx, size);
  const hd = hx.getImageData(0, 0, size, size).data;
  const H = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) H[i] = hd[i * 4] / 255;
  const b = hex(base);
  const at = (x, y) => H[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  const c = paint(size, size, (x, y) => {
    const h = at(x, y);
    // la luz: la pendiente hacia arriba a la izquierda aclara, la otra oscurece
    const dx = at(x + 1, y) - at(x - 1, y);
    const dy = at(x, y + 1) - at(x, y - 1);
    const lit = 1 + (-dx - dy) * 6 * light;
    const n = fbmS(size, x, y, 30, 3, 5);
    let col = metal ? mix([64, 50, 32], [104, 160, 136], Math.min(1, 0.3 + (1 - h) * 0.6 + n * 0.3)) : shade(b, 0.82 + n * 0.16);
    // lo hundido junta mugre; lo alto, gastado y más claro
    col = shade(col, (0.78 + h * 0.3) * Math.max(0.55, Math.min(1.45, lit)));
    if (metal && h > 0.75) col = mix(col, [176, 140, 88], (h - 0.75) * 1.4);
    return col;
  });
  const HH = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) HH[i] = H[i] * 6;
  c.relief = { H: HH, detail: 0.12, depth: 0.015, ao: 1.4, aoBlur: 4 };
  return c;
}

// El Escudo Nacional en un medallón redondo de piedra (los pilonos del
// Propileo, la Torre): el óvalo partido, las manos que se estrechan sosteniendo
// la pica con el gorro frigio, el sol naciente arriba y los laureles.
export function escudoMedallon(size = 512, opts = {}) {
  return reliefCanvas(size, (ctx, S) => {
    const k = S / 512;
    const g = (v) => `rgb(${v},${v},${v})`;
    ctx.save();
    ctx.scale(k, k);
    // el disco y su moldura
    ctx.fillStyle = g(60);
    ctx.beginPath();
    ctx.arc(256, 256, 246, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 16;
    ctx.strokeStyle = g(170);
    ctx.beginPath();
    ctx.arc(256, 256, 234, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = g(120);
    ctx.beginPath();
    ctx.arc(256, 256, 218, 0, Math.PI * 2);
    ctx.stroke();
    // los laureles: hojas a lo largo de dos arcos
    ctx.fillStyle = g(150);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 13; i++) {
        const t = i / 12;
        const a = Math.PI / 2 + s * (0.35 + t * 1.85);
        const x = 256 + Math.cos(a) * 168;
        const y = 268 + Math.sin(a) * 150;
        for (const o of [-1, 1]) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + s * Math.PI / 2 + o * 0.55);
          ctx.beginPath();
          ctx.ellipse(0, -14, 7, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    // la cinta de abajo
    ctx.fillStyle = g(140);
    ctx.beginPath();
    ctx.moveTo(200, 418);
    ctx.quadraticCurveTo(256, 440, 312, 418);
    ctx.lineTo(320, 436);
    ctx.quadraticCurveTo(256, 462, 192, 436);
    ctx.closePath();
    ctx.fill();
    // el óvalo
    ctx.fillStyle = g(130);
    ctx.beginPath();
    ctx.ellipse(256, 276, 104, 128, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g(150);
    ctx.beginPath();
    ctx.ellipse(256, 276, 104, 128, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = g(90);
    ctx.beginPath();
    ctx.moveTo(152, 276);
    ctx.lineTo(360, 276);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = g(185);
    ctx.beginPath();
    ctx.ellipse(256, 276, 104, 128, 0, 0, Math.PI * 2);
    ctx.stroke();
    // el sol naciente, con sus rayos rectos y flamígeros
    ctx.fillStyle = g(200);
    for (let i = 0; i < 21; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      const L = i % 2 ? 46 : 62;
      ctx.save();
      ctx.translate(256, 150);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(30, -4);
      if (i % 2) {
        ctx.quadraticCurveTo(30 + L * 0.5, 8, 30 + L, 0);
        ctx.quadraticCurveTo(30 + L * 0.5, -8, 30, 4);
      } else {
        ctx.lineTo(30 + L, 0);
        ctx.lineTo(30, 4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = g(225);
    ctx.beginPath();
    ctx.arc(256, 150, 32, Math.PI, Math.PI * 2);
    ctx.fill();
    // la pica y el gorro frigio
    ctx.fillStyle = g(215);
    ctx.fillRect(251, 196, 10, 150);
    ctx.fillStyle = g(235);
    ctx.beginPath();
    ctx.moveTo(232, 214);
    ctx.quadraticCurveTo(236, 178, 264, 176);
    ctx.quadraticCurveTo(290, 178, 284, 196);
    ctx.quadraticCurveTo(270, 190, 268, 202);
    ctx.lineTo(280, 214);
    ctx.closePath();
    ctx.fill();
    // las manos que se estrechan (los antebrazos vienen de los costados)
    ctx.fillStyle = g(230);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(256 + s * 104, 318);
      ctx.quadraticCurveTo(256 + s * 60, 300, 256 + s * 22, 304);
      ctx.lineTo(256 + s * 18, 326);
      ctx.quadraticCurveTo(256 + s * 60, 334, 256 + s * 104, 346);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(256, 314, 30, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, opts);
}

// El Sol de Mayo de la bandera: la cara con sus rasgos (cejas, ojos, nariz,
// cachetes y boca) y los 32 rayos alternados, 16 rectos y 16 flamígeros (el
// de arriba, recto), dorado con el contorno marrón como el de la bandera
// oficial. (cx, cy): el centro; R: hasta la punta de los rayos rectos.
export function solDeMayo(x, cx, cy, R) {
  const GOLD = '#f6b40e';
  const BROWN = '#85340a';
  const f = R * 0.4;
  const lw = Math.max(0.6, R * 0.022);
  x.save();
  x.translate(cx, cy);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.fillStyle = GOLD;
  x.strokeStyle = BROWN;
  x.lineWidth = lw;
  const r0 = f * 0.9;
  for (let i = 0; i < 32; i++) {
    x.save();
    x.rotate(-Math.PI / 2 + (i / 32) * Math.PI * 2);
    x.beginPath();
    if (i % 2 === 0) {
      // recto: una punta de lanza
      const w0 = R * 0.072;
      x.moveTo(r0, -w0);
      x.lineTo(R, 0);
      x.lineTo(r0, w0);
    } else {
      // flamígero: una llama que ondula y se afina hasta la punta
      const L = R * 0.92;
      const N = 18;
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        pts.push([r0 + (L - r0) * t, Math.sin(t * Math.PI * 3) * R * 0.045 * (0.35 + 0.65 * t), R * 0.058 * (1 - t) + R * 0.004]);
      }
      x.moveTo(pts[0][0], pts[0][1] - pts[0][2]);
      for (const [r, c, hw] of pts) x.lineTo(r, c - hw);
      for (let k = N; k >= 0; k--) x.lineTo(pts[k][0], pts[k][1] + pts[k][2]);
    }
    x.closePath();
    x.fill();
    x.stroke();
    x.restore();
  }
  // la cara
  x.beginPath();
  x.arc(0, 0, f, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = lw * 1.5;
  x.stroke();
  x.lineWidth = lw * 1.3;
  x.fillStyle = BROWN;
  const line = (pts) => {
    x.beginPath();
    x.moveTo(pts[0] * f, pts[1] * f);
    for (let k = 2; k < pts.length; k += 4) x.quadraticCurveTo(pts[k] * f, pts[k + 1] * f, pts[k + 2] * f, pts[k + 3] * f);
    x.stroke();
  };
  for (const s of [-1, 1]) {
    // la ceja, el ojo (la almendra y la pupila) y el cachete
    line([s * 0.1, -0.3, s * 0.36, -0.52, s * 0.62, -0.3]);
    x.beginPath();
    x.moveTo(s * 0.17 * f, -0.13 * f);
    x.quadraticCurveTo(s * 0.38 * f, -0.3 * f, s * 0.59 * f, -0.13 * f);
    x.quadraticCurveTo(s * 0.38 * f, -0.02 * f, s * 0.17 * f, -0.13 * f);
    x.stroke();
    x.beginPath();
    x.arc(s * 0.38 * f, -0.14 * f, 0.07 * f, 0, Math.PI * 2);
    x.fill();
    line([s * 0.5, 0.1, s * 0.62, 0.24, s * 0.5, 0.36]);
  }
  // la nariz (larga, con las alitas) y la boca chica de labios marcados
  line([0.02, -0.2, 0.1, 0.06, 0.08, 0.2]);
  line([0.12, 0.2, 0, 0.3, -0.12, 0.2]);
  line([-0.26, 0.47, 0, 0.58, 0.26, 0.47]);
  line([-0.14, 0.58, 0, 0.66, 0.14, 0.58]);
  x.restore();
}

// La bandera argentina en un canvas: tres franjas iguales y el Sol de Mayo en
// la blanca (de 5/6 de su alto). `seams`: las costuras a mano (la del easter egg).
export function banderaArgentina(w = 1024, h = 640, { seams = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#74acdf';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#f4f2ec';
  x.fillRect(0, h / 3, w, h / 3);
  if (seams) {
    x.strokeStyle = 'rgba(80,90,110,0.35)';
    x.lineWidth = h / 160;
    x.setLineDash([h / 53, h / 40]);
    for (const y of [h / 3, (2 * h) / 3]) {
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
    }
    x.setLineDash([]);
  }
  solDeMayo(x, w / 2, h / 2, ((h / 3) * 5) / 12);
  return c;
}
// (una textura por tipo, compartida por todas las banderas del mapa)
const banderaTexs = {};
export function banderaTexture({ seams = false } = {}) {
  const k = seams ? 'seams' : 'plain';
  return (banderaTexs[k] ||= toTexture(banderaArgentina(1024, 640, { seams }), { repeat: false }));
}

// Revoque a la cal de los edificios viejos: crema, parejo, con manchas de
// humedad suaves y algún descascarado (sin la faja de los galpones).
function revoque({ seed, base = 0xd8c8a8 }) {
  const S = 512;
  const b = hex(base);
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const n = fbmS(S, x, y, 60, 4, seed);
    const f = noiseS(S, x, y, 3, seed + 2);
    let col = shade(b, 0.9 + (n - 0.5) * 0.18 + (f - 0.5) * 0.06);
    const damp = fbmS(S, x, y, 140, 3, seed + 9);
    if (damp > 0.6) col = mix(col, [150, 140, 118], Math.min(0.35, (damp - 0.6) * 1.6));
    const peel = fbmS(S, x, y, 24, 3, seed + 17);
    let h = (n - 0.5) * 0.6 + (f - 0.5) * 0.3;
    if (peel > 0.72) {
      col = shade([168, 120, 96], 0.85 + f * 0.2);
      h -= 1.2;
    }
    H[y * S + x] = h;
    return col;
  });
  c.relief = { H, detail: 0.3, ao: 0.6, aoBlur: 3 };
  return c;
}

// Granito pulido del Pasaje: baldosones de 60 cm gris claro con pinta negra
// y blanca, juntas finas; brilla (los faroles se reflejan).
function granito({ seed }) {
  const S = 512;
  const tile = S / (2 / 0.6);
  const r = rng(seed);
  const tones = Array.from({ length: 64 }, () => 0.92 + r() * 0.12);
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    const lx = x - tx * tile;
    const ly = y - ty * tile;
    const e = Math.min(lx, tile - lx, ly, tile - ly);
    const sp = noiseS(S, x, y, 1.6, seed + tx * 3 + ty);
    let col = shade([196, 194, 190], tones[(ty * 8 + tx) % 64]);
    if (sp > 0.8) col = shade(col, 0.45);
    else if (sp < 0.12) col = shade(col, 1.12);
    let h = 0.3;
    let rough = 0.14 + noiseS(S, x, y, 40, seed + 5) * 0.12;
    if (e < 1.5) {
      col = [120, 118, 112];
      h = -1;
      rough = 0.7;
    }
    H[y * S + x] = h;
    Rg[y * S + x] = rough;
    return col;
  });
  c.relief = { H, detail: 0.05, rough: Rg };
  return c;
}

// Las que se pueden pintar en otro hilo (core/texturePool.js las pide al abrir
// el juego; acá se toman con takePre). Sesión 1f, el usuario: "la pantalla de
// cambio de mapa tarda una eternidad": eran ~2,7 s en el hilo principal al
// elegir Eclipse o el Monumento. __mduNoMonuWorker: se pintan acá, como antes.
export const MONU_PAINT = {
  'monu:travertino': () => travertino({ seed: 1812 }),
  'monu:travertinoBig': () => travertino({ seed: 1813, rows: 3, stain: 0.8 }),
  'monu:travPave': () => travPave({ seed: 1957 }),
  'monu:travStepTex': () => travPave({ seed: 1958, rows: 1 }),
  'monu:revoque': () => revoque({ seed: 1880 }),
  'monu:granito': () => granito({ seed: 1930 }),
  'monu:bronze': () => bronze({ seed: 1810 }),
  'monu:baldosa': () => baldosa({ seed: 64 }),
  'monu:adoquin': () => adoquin({ seed: 1900 }),
  'monu:asfalto': () => asfalto({ seed: 27 }),
  'monu:cryptMarble': () => marmol({ seed: 1820, base: 0x3e4440, vein: 0x9aa49a, joint: 0x1c1e1c }),
  'monu:salaMarble': () => marmol({ seed: 1853, base: 0xd8ccb4, vein: 0xa8884a, joint: 0x8a7a62 }),
  'monu:salaFloor': () => marmol({ seed: 1816, base: 0xb8aa92, vein: 0x6a5a44, joint: 0x4a4036, rows: 4 }),
};

// Las texturas del Monumento (una vez).
export function monumentoTextures(T) {
  if (T.travertino) return T;
  const pre = globalThis.__mduNoMonuWorker !== true;
  for (const [k, fn] of Object.entries(MONU_PAINT)) T[k.slice(5)] = toTexture((pre && takePre(k)) || fn());
  const f1 = fachada({ seed: 11, base: 0x9a9284, cols: 5, rows: 8, lit: 0.32 });
  const f2 = fachada({ seed: 12, base: 0x7a7a7e, cols: 4, rows: 7, lit: 0.26, warm: false });
  const f3 = fachada({ seed: 13, base: 0xb0a48e, cols: 6, rows: 9, lit: 0.4 });
  T.fachada = [f1, f2, f3].map((f) => ({ map: toTexture(f.c), glow: toTexture(f.glow) }));
  return T;
}

// Los materiales del Monumento. `std(map, o)` es el ayudante de World.
export function monumentoMaterials(T, M, std) {
  monumentoTextures(T);
  M.travertino = std(T.travertino, { bump: 0.6 });
  M.travertinoBig = std(T.travertinoBig, { bump: 0.6 });
  // la piedra de las juntas de afuera y de la cara de los bordes (Levels/Barriers)
  M.travertinoDark = std(T.travertino, { c: 0xa49a88, bump: 0.6 });
  M.travPave = std(T.travPave, { r: 0.7, bump: 0.5 });
  M.travStep = std(T.travStepTex, { c: 0xf4ece0, r: 0.66, bump: 0.5 });
  M.bronze = std(T.bronze, { r: 0.5, m: 0.65 });
  M.bronzeDark = std(T.bronze, { c: 0x8a7a66, r: 0.45, m: 0.75 });
  M.baldosa = std(T.baldosa, { r: 0.8, bump: 0.5 });
  M.adoquin = std(T.adoquin, { r: 0.85, bump: 0.8 });
  M.asfalto = std(T.asfalto, { r: 0.9, bump: 0.3 });
  M.cryptStone = std(T.cryptMarble, { r: 0.3 });
  M.cryptFloor = std(T.cryptMarble, { c: 0xc8ccc8, r: 0.25 });
  M.salaMarble = std(T.salaMarble, { r: 0.35 });
  M.salaFloor = std(T.salaFloor, { r: 0.22 });
  M.salaCeil = std(T.salaMarble, { c: 0xe6dccb, r: 0.6 });
  M.granito = std(T.adoquin, { c: 0x8a8a90, r: 0.6, bump: 0.3 });
  M.lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 2.2, roughness: 0.3 });
  M.lampGlassOff = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, emissive: 0x2a2418, emissiveIntensity: 1, roughness: 0.3 });
  M.fachadas = T.fachada.map((f) => new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.glow, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.85 }));
  // (cuántos pisos tiene cada fachada en sus 24 m: los balcones van a esa altura, monumentoCity)
  M.fachadas.forEach((m, i) => (m.userData.rows = [8, 7, 9][i]));
  // las estatuas de mármol, el cielorraso de la Cripta, el revoque de la ciudad
  M.marble = new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.62, flatShading: true });
  M.bronze.flatShading = false;
  // las estatuas del Monumento que bañan los reflectores (la Madre Patria del
  // nicho, los jinetes, la Pampa y los Andes, la Patria Abanderada y los
  // colosos): el mismo material con un emisivo que sube con la luz
  // (world/monumentoLuces.js); dos dibujos más, sin luces puntuales
  M.bronzeLit = std(T.bronze, { r: 0.5, m: 0.65, e: 0xffd2a0, ei: 0 });
  M.bronzeLit.emissiveMap = T.bronze;
  M.marbleLit = new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.62, flatShading: true, emissive: 0xfff0dc, emissiveIntensity: 0 });
  M.cryptCeil = std(T.cryptMarble, { c: 0x9aa09a, r: 0.5 });
  M.revoque = std(T.revoque, { bump: 0.4 });
  M.revoqueDark = std(T.revoque, { c: 0xb8aa94, bump: 0.4 });
  M.azotea = std(T.asfalto, { c: 0x8a8680, r: 0.9 });
  M.ducto = std(null, { c: 0x0c0b0a, r: 1 });
  // los pizarrones de las tizas (en el travertino claro la tiza no se ve)
  M.pizarron = std(T.asfalto, { c: 0x2a3a30, r: 0.95 });
  M.pizarronMarco = std(T.planksDark, { c: 0x5a4030 });
  M.ironBar = std(null, { c: 0x22201e, r: 0.5, m: 0.7 });
  M.riverBed = std(T.dirt, { c: 0x3a3428 });
  // los pisos de cada lugar
  M.explanada = std(T.travPave, { c: 0xc89e88, r: 0.75, bump: 0.5 });
  M.pasaje = std(T.granito, { r: 0.2 });
  M.poolBed = std(T.travPave, { c: 0x4a5048, r: 0.4 });
  M.pintura = std(null, { c: 0xbcb8a8, r: 0.9 });
  M.muelle = std(T.planks, { c: 0x9a8a74 });
  M.muelleDark = std(T.planksDark, { c: 0x6a5a48 });
  if (!M.grass) M.grass = std(T.grass, { bump: 0.6 });
  // lo que piden los bordes genéricos (Levels/Barriers/Interactables)
  M.stoneWall = M.travertino;
  M.stoneStep = M.travStep;
  M.exterior = M.travertino;
  M.wallTop = M.travertinoDark;
  M.calcareo = M.cryptFloor;
  return M;
}
