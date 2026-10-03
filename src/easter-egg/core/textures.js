import * as THREE from 'three';
import { makeNoise, rng } from './noise';
import { drawPerkIcon } from '../ui/perkIcons';

// Texturas procedurales pintadas en canvas: no se descarga ninguna imagen.

const N = makeNoise(115);

// (en un worker, core/textureWorker.js, no hay document: OffscreenCanvas)
function canvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w;
  c.height = h;
  return c;
}

// Pinta pixel por pixel: fn(x, y) devuelve [r, g, b] (0..255) o [r, g, b, a].
function paint(w, h, fn) {
  const c = canvas(w, h);
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

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];

export function toTexture(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Mipmaps para lo recortado con alphaTest (pasto, cañas, flecos de paja): al
// achicarse, las hojas finitas se promedian con el fondo transparente, el alfa
// baja del corte y de lejos el pasto se deshace en rayitas de un pixel. Acá
// cada nivel se achica a mano (el color pesado por el alfa) y después se le
// sube el alfa hasta que tape la misma parte que el original (la cobertura
// del corte se conserva). Los niveles van como ImageData (sin pasar por un
// canvas, que redondea el color de lo casi transparente).
export function coverageMips(tex, cutoff = 0.5) {
  const src = tex?.image;
  if (!src || !src.width || tex.userData.coverage) return tex;
  let w = src.width;
  let h = src.height;
  let data = src.getContext ? src.getContext('2d').getImageData(0, 0, w, h).data : null;
  if (!data) return tex;
  const cut = cutoff * 255;
  const covers = (d, s) => {
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] * s > cut) n++;
    return n / (d.length / 4);
  };
  const cov0 = covers(data, 1);
  // el nivel 0 tal cual y los de abajo en números con coma (sin redondeos en la cadena)
  const levels = [new ImageData(new Uint8ClampedArray(data), w, h)];
  let f = Float32Array.from(data);
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const g = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let gg = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx);
            const sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            const al = f[i + 3];
            r += f[i] * al;
            gg += f[i + 1] * al;
            b += f[i + 2] * al;
            a += al;
          }
        }
        const o = (y * nw + x) * 4;
        g[o] = a > 0 ? r / a : 0;
        g[o + 1] = a > 0 ? gg / a : 0;
        g[o + 2] = a > 0 ? b / a : 0;
        g[o + 3] = a / 4;
      }
    }
    // cuánto hay que subirle el alfa para tapar lo mismo que el nivel 0
    let lo = 1;
    let hi = 6;
    if (cov0 > 0) {
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        if (covers(g, m) < cov0) lo = m;
        else hi = m;
      }
    }
    const s = (lo + hi) / 2;
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let i = 0; i < g.length; i += 4) {
      out[i] = g[i];
      out[i + 1] = g[i + 1];
      out[i + 2] = g[i + 2];
      out[i + 3] = Math.min(255, g[i + 3] * s);
    }
    levels.push(new ImageData(out, nw, nh));
    f = g;
    w = nw;
    h = nh;
  }
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.coverage = cutoff;
  tex.needsUpdate = true;
  return tex;
}

// Altura de una baldosa para el relieve (fx/Surfaces): junta de `joint` px
// hundida y canto redondeado de `bevel` px. lx/ly: posición dentro de la baldosa.
function tileH(lx, ly, t, joint, bevel) {
  if (lx < joint || ly < joint) return 0.15;
  return 0.5 + 0.5 * Math.min(1, Math.min(lx - joint, t - lx, ly - joint, t - ly) / bevel);
}

// Grietas finas: caminatas aleatorias oscuras.
function cracks(ctx, w, h, count, seed, color = 'rgba(30,24,18,0.55)') {
  const r = rng(seed);
  ctx.strokeStyle = color;
  for (let k = 0; k < count; k++) {
    let x = r() * w;
    let y = r() * h;
    let a = r() * Math.PI * 2;
    ctx.lineWidth = 0.6 + r();
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = 8 + r() * 30;
    for (let s = 0; s < len; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 3;
      y += Math.sin(a) * 3;
      ctx.lineTo(x, y);
      if (r() < 0.04) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        a += (r() - 0.5) * 2;
      }
    }
    ctx.stroke();
  }
}

// Revoque con zócalo pintado abajo (1 m de 3,6). u: 2 m, v: altura completa.
// Donde se cayó el revoque asoma lo de abajo (`under`: ladrillo si `bricks`).
function plaster({ base, band, seed, soot = 0, under = 0x9a5a40, bricks = true }) {
  const W = 512;
  const H = 512;
  const b = hex(base);
  const bd = band == null ? null : hex(band);
  const ub = hex(under);
  const bandTop = H * (1 - 1 / 3.6);
  // altura en px de textura (256 por metro): el revoque tiene 2 cm (5 px)
  const Hh = new Float32Array(W * H);
  const c = paint(W, H, (x, y) => {
    const n = N.fbm(x / 64 + seed, y / 64, 5, 8);
    const s = N.fbm(x / 22 + 40 + seed, y / 22, 3, 512 / 22);
    const grain = N.noise(x / 2 + seed * 17, y / 2, 256);
    let col = shade(b, 0.84 + n * 0.24);
    // manchas de humedad
    const damp = N.fbm(x / 110 + seed * 3, y / 90 + 7, 3, 512 / 110);
    if (damp > 0.6) col = mix(col, shade(b, 0.72), Math.min(1, (damp - 0.6) * 3));
    // la llana deja ondas suaves y la arena un granito
    let h = 5 + (n - 0.5) * 1.2 + (grain - 0.5) * 0.5;
    if (bd && y > bandTop) {
      const peel = N.fbm(x / 30 + 90 + seed, y / 30, 4, 512 / 30);
      col = peel > 0.66 ? shade(b, 0.7 + s * 0.2) : shade(bd, 0.75 + n * 0.35);
      if (peel <= 0.66) h += 0.15;
      if (Math.abs(y - bandTop) < 2) col = shade(col, 0.6);
    }
    // revoque caído (más cerca del piso, donde sube la humedad)
    const ch = N.fbm(x / 128 + seed * 5, y / 80 + seed * 3.7, 5, 4) + 0.12 * Math.max(0, (y / H - 0.6) / 0.4);
    if (ch > 0.77) {
      let uc;
      let uh;
      if (bricks) {
        const row = Math.floor(y / 10);
        const lx = (x + (row % 2) * 32) % 64;
        const t = ((((row * 73856093) ^ (Math.floor((x + (row % 2) * 32) / 64) * 19349663)) >>> 0) % 1000) / 1000;
        const mortar = lx < 2 || y % 10 < 2;
        uc = mortar ? shade([150, 138, 120], 0.6 + n * 0.3) : shade(ub, 0.75 + t * 0.4 + (grain - 0.5) * 0.15);
        uh = (mortar ? 0.3 : 1.3) + (grain - 0.5) * 0.4;
      } else {
        uc = shade(ub, 0.75 + n * 0.3 + (grain - 0.5) * 0.2);
        uh = 0.8 + (n - 0.5) * 1.5 + (grain - 0.5) * 0.6;
      }
      // canto quebrado: un poco más claro (el revoque de adentro no está sucio)
      const e = Math.min(1, (ch - 0.77) / 0.01);
      col = e < 1 ? mix(shade(b, 1.04), uc, e) : uc;
      h += (uh - h) * e;
    }
    Hh[y * W + x] = h;
    // mugre cerca del piso y hollín arriba
    const fromBottom = (H - y) / H;
    if (fromBottom < 0.12) col = shade(col, 0.55 + fromBottom * 3.7);
    if (soot) col = shade(col, 1 - soot * Math.max(0, 1 - y / (H * 0.6)) * (0.6 + n * 0.5));
    return col;
  });
  cracks(c.getContext('2d'), W, H, 14, seed * 7 + 3);
  // relieve (fx/Surfaces): la altura de arriba, y del color solo las grietas
  c.relief = { H: Hh, detail: 0.3, blur: 3, depth: 0.022, ao: 1.4, aoBlur: 5 };
  return c;
}

function bricks({ seed, soot = 0, tint = 0xa0472c }) {
  const W = 512;
  const H = 922;
  const rows = 48;
  const cols = 8;
  const rh = H / rows;
  const bw = W / cols;
  const r = rng(seed);
  const tints = [];
  for (let i = 0; i < rows * cols * 2; i++) tints.push(0.7 + r() * 0.45);
  const base = hex(tint);
  const mortar = [150, 138, 120];
  // altura en px de textura (256 por metro), para fx/Surfaces
  const Hh = new Float32Array(W * H);
  const hash = (a, b) => ((((a * 73856093) ^ (b * 19349663)) >>> 0) % 10007) / 10007;
  const cv = paint(W, H, (x, y) => {
    const row = Math.floor(y / rh);
    const off = row % 2 ? bw / 2 : 0;
    const cx = (x + off) % W;
    const col = Math.floor(cx / bw);
    const lx = cx - col * bw;
    const ly = y - row * rh;
    const n = N.fbm(x / 20 + seed, y / 20, 4, W / 20);
    // cada ladrillo quedó un poco más afuera o más adentro, y torcido; a alguno
    // se le rompió una esquina y cada tanto falta uno
    const u1 = hash(row, col + 7 * seed);
    const u2 = hash(row + 91, col);
    const gone = hash(col + 13, row + 5 * seed) < 0.022;
    let c;
    let h;
    if (lx < 3 || ly < 3) {
      c = shade(mortar, 0.7 + n * 0.4);
      h = -1.4 + n;
    } else if (gone) {
      c = shade(mortar, 0.3 + n * 0.25);
      h = -4.5 + n;
    } else {
      const t = tints[(row * cols + col) % tints.length];
      c = shade(base, t * (0.8 + n * 0.35));
      h = 1.2 + (u1 - 0.5) * 1.6 + (lx / bw - 0.5) * (u2 - 0.5) * 2.4;
      // canto gastado, más comido donde el ruido lo dice
      const e = Math.min(lx - 3, bw - lx, ly - 3, rh - ly);
      const wear = 2 + n * 4;
      if (e < wear) h -= (1 - e / wear) ** 2 * (1.5 + n * 1.5);
      if (e < 6 && u2 > 0.55 && N.noise(x / 6 + seed * 3, y / 6, 256) > 0.68) {
        h -= 1.6;
        c = shade(c, 1.15);
      }
      if (N.noise(x / 3, y / 3) > 0.83) {
        c = shade(c, 0.7);
        h -= 0.6;
      }
    }
    Hh[y * W + x] = h;
    const fromBottom = (H - y) / H;
    if (fromBottom < 0.1) c = shade(c, 0.6 + fromBottom * 4);
    if (soot) {
      const k = N.fbm(x / 70 + 30, y / 70, 3, W / 70);
      c = shade(c, 1 - soot * (0.4 + k * 0.6) * Math.max(0.15, 1 - y / H));
    }
    return c;
  });
  // relieve (fx/Surfaces): el ladrillo sobresale del mortero, con el canto gastado
  cv.relief = { H: Hh, detail: 0.15, depth: 0.026, ao: 1.3, aoBlur: 4 };
  return cv;
}

// weather: cuánto se levantó la veta con la intemperie (en px de altura)
function planks({ seed, base = 0x6b4a2e, width = 64, dark = 1, weather = 0.6 }) {
  const W = 512;
  const H = 512;
  const r = rng(seed);
  const n = W / width;
  const pl = [];
  for (let i = 0; i < n; i++) pl.push({ t: 0.7 + r() * 0.5, joint: r() * H, off: r() * 100, cup: (r() - 0.5) * 1.6 });
  const b = hex(base);
  // altura en px de textura (256 por metro), para fx/Surfaces
  const Hh = new Float32Array(W * H);
  const c = paint(W, H, (x, y) => {
    const i = Math.floor(x / width);
    const p = pl[i];
    const lx = x - i * width;
    const grain = N.fbm((x + p.off) / 6, y / 90 + p.off, 4, W / 6);
    const knot = N.noise(x / 14 + p.off, y / 14);
    let col = shade(b, p.t * (0.72 + grain * 0.5) * dark);
    // cada tabla un poco más afuera o adentro y combada; la veta levantada
    const u = (lx / width - 0.5) * 2;
    let h = 1 + (p.t - 0.95) * 1.2 + u * u * p.cup + (grain - 0.5) * 2 * weather;
    if (knot > 0.86) {
      col = shade(col, 0.65);
      h += 0.4;
    }
    const e = Math.min(lx, width - lx);
    if (e < 2) {
      col = shade(col, 0.35);
      h = -2.5;
    } else if (e < 4) h -= (4 - e) * 0.4;
    const jy = Math.abs(y - p.joint);
    if (jy < 1.5) {
      col = shade(col, 0.35);
      h = Math.min(h, -1.5);
    }
    // clavos
    if ((Math.abs(lx - 8) < 1.6 || Math.abs(lx - width + 8) < 1.6) && Math.abs(jy - 6) < 1.6) {
      col = [40, 38, 36];
      h -= 0.8;
    }
    Hh[y * W + x] = h;
    return col;
  });
  // relieve (fx/Surfaces): la rendija entre tablas, la junta de punta y la veta
  c.relief = { H: Hh, detail: 0.2, depth: 0.012, ao: 1.3, aoBlur: 3 };
  return c;
}

function dirt({ seed, base = 0x8c3a1f, dark = 1 }) {
  const b = hex(base);
  const r = rng(seed);
  const c = paint(512, 512, (x, y) => {
    const n = N.fbm(x / 48 + seed, y / 48, 5, 512 / 48);
    const m = N.fbm(x / 9 + 50, y / 9, 3, 512 / 9);
    let col = shade(b, (0.62 + n * 0.55 + (m - 0.5) * 0.18) * dark);
    const moss = N.fbm(x / 80 + 200, y / 80, 3, 512 / 80);
    if (moss > 0.62) col = mix(col, shade([58, 62, 30], dark), Math.min(0.7, (moss - 0.62) * 3));
    return col;
  });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 260; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const s = 1 + r() * 3;
    ctx.fillStyle = `rgba(${40 + r() * 60},${30 + r() * 30},${20 + r() * 20},0.8)`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,190,0.15)';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  c.relief = { detail: 0.5 };
  return c;
}

function concrete({ seed, base = 0x77736b }) {
  const b = hex(base);
  const c = paint(512, 512, (x, y) => {
    const n = N.fbm(x / 40 + seed, y / 40, 5, 512 / 40);
    const f = N.noise(x / 2.5, y / 2.5);
    let col = shade(b, 0.7 + n * 0.45 + (f - 0.5) * 0.12);
    const stain = N.fbm(x / 120 + 11, y / 120, 3, 512 / 120);
    if (stain > 0.6) col = shade(col, 1 - (stain - 0.6) * 1.4);
    // juntas de losa
    if (x % 256 < 2 || y % 256 < 2) col = shade(col, 0.55);
    return col;
  });
  cracks(c.getContext('2d'), 512, 512, 10, seed + 5, 'rgba(20,20,20,0.5)');
  c.relief = { detail: 0.4, h: (x, y) => (x % 256 < 2 || y % 256 < 2 ? 0.3 : 0.7) };
  return c;
}

// Calcáreos de patio porteño: 10 x 10 baldosas por textura (2 m).
function calcareo({ seed }) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const t = S / 10;
  const r = rng(seed);
  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 10; i++) {
      const x = i * t;
      const y = j * t;
      ctx.fillStyle = '#d8ccb2';
      ctx.fillRect(x, y, t, t);
      ctx.save();
      ctx.translate(x + t / 2, y + t / 2);
      // cuarto de flor en cada esquina: al juntarse forman el dibujo
      for (let q = 0; q < 4; q++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#9a3b24';
        ctx.beginPath();
        ctx.arc(t / 2, t / 2, t * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#23201c';
        ctx.beginPath();
        ctx.moveTo(0, t * 0.12);
        ctx.lineTo(t * 0.12, 0);
        ctx.lineTo(0, -t * 0.12);
        ctx.lineTo(-t * 0.12, 0);
        ctx.fill();
        ctx.strokeStyle = '#23201c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(t / 2, t / 2, t * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(40,30,20,0.6)';
      ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);
      // baldosa rota de vez en cuando
      if (r() < 0.06) {
        ctx.fillStyle = 'rgba(60,45,30,0.5)';
        ctx.beginPath();
        ctx.moveTo(x + r() * t, y);
        ctx.lineTo(x + t, y + r() * t);
        ctx.lineTo(x + t, y);
        ctx.fill();
      }
    }
  }
  wear(ctx, S, S, seed, 0.35);
  // relieve: solo la junta; el dibujo es pigmento, no se levanta
  c.relief = {
    detail: 0.08,
    h: (x, y) => {
      const lx = x % t;
      const ly = y % t;
      const e = Math.min(lx, t - lx, ly, t - ly);
      return e < 1.2 ? 0.3 : 0.5 + 0.5 * Math.min(1, (e - 1.2) / 2);
    },
    rough: (x, y) => (Math.min(x % t, t - (x % t), y % t, t - (y % t)) < 1.2 ? 0.9 : 0.5),
  };
  return c;
}

function terracotta({ seed }) {
  const S = 512;
  const t = S / 8;
  const r = rng(seed);
  const tones = [];
  for (let i = 0; i < 64; i++) tones.push(0.75 + r() * 0.35);
  const c = paint(S, S, (x, y) => {
    const i = Math.floor(x / t);
    const j = Math.floor(y / t);
    const lx = x - i * t;
    const ly = y - j * t;
    const n = N.fbm(x / 16 + seed, y / 16, 4, S / 16);
    if (lx < 3 || ly < 3) return shade([120, 110, 95], 0.6 + n * 0.3);
    return shade([150, 70, 44], tones[j * 8 + i] * (0.75 + n * 0.4));
  });
  c.relief = {
    detail: 0.15,
    depth: 0.006,
    h: (x, y) => {
      const lx = x % t;
      const ly = y % t;
      if (lx < 3 || ly < 3) return 0.1;
      return 0.5 + 0.5 * Math.min(1, Math.min(lx - 3, t - lx, ly - 3, t - ly) / 4);
    },
    rough: (x, y) => (x % t < 3 || y % t < 3 ? 0.95 : 0.62),
  };
  return c;
}

// Desgaste y suciedad general sobre un canvas ya pintado.
// El factor del desgaste en cada pixel: solo ruido, no depende de lo pintado.
// Las etiquetas de los perks (512x1024, ~90 ms cada una) lo traen hecho de los
// workers del arranque (core/texturePool.js, putWearField).
export function wearField(w, h, seed, amount) {
  const f = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) f[i] = 1 - amount * N.fbm(x / 50 + seed, y / 50, 4, w / 50) * 0.9 - (N.noise(x / 2, y / 2) - 0.5) * 0.08;
  }
  return f;
}
const wearFields = new Map();
export const wearKey = (w, h, seed, amount) => `${w}x${h}:${seed}:${amount}`;
export const putWearField = (key, f) => wearFields.set(key, f);

function wear(ctx, w, h, seed, amount) {
  const key = wearKey(w, h, seed, amount);
  let f = wearFields.get(key);
  if (!f) wearFields.set(key, (f = wearField(w, h, seed, amount)));
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0, j = 0; j < f.length; i += 4, j++) {
    const k = f[j];
    d[i] = clamp(d[i] * k);
    d[i + 1] = clamp(d[i + 1] * k);
    d[i + 2] = clamp(d[i + 2] * k);
  }
  ctx.putImageData(img, 0, 0);
}

function corrugated({ seed }) {
  const c = paint(256, 256, (x, y) => {
    const wave = Math.sin((x / 256) * Math.PI * 16);
    const n = N.fbm(x / 30 + seed, y / 30, 4, 256 / 30);
    let col = shade([128, 130, 128], 0.75 + wave * 0.18 + n * 0.25);
    const rust = N.fbm(x / 40 + 70, y / 25, 4, 256 / 40);
    if (rust > 0.55) col = mix(col, [120, 58, 26], Math.min(1, (rust - 0.55) * 3));
    return col;
  });
  c.relief = { detail: 0.2, scale: 2.5, h: (x) => 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 16) };
  return c;
}

function metal({ seed, base = 0x5d6164 }) {
  const b = hex(base);
  const c = paint(256, 256, (x, y) => {
    const n = N.fbm(x / 24 + seed, y / 24, 4, 256 / 24);
    const brushed = N.noise(x / 60, y * 2) * 0.1;
    let col = shade(b, 0.75 + n * 0.3 + brushed);
    const rust = N.fbm(x / 34 + 20, y / 34, 4, 256 / 34);
    if (rust > 0.6) col = mix(col, [110, 55, 25], Math.min(1, (rust - 0.6) * 3.5));
    if (x % 128 < 2 || y % 128 < 2) col = shade(col, 0.5);
    return col;
  });
  // relieve: la unión entre chapas
  c.relief = {
    detail: 0.25,
    h: (x, y) => {
      const e = Math.min(x % 128, 128 - (x % 128), y % 128, 128 - (y % 128));
      return e < 2 ? 0.2 : 0.55 + 0.45 * Math.min(1, (e - 2) / 3);
    },
  };
  return c;
}

function burlap({ seed }) {
  return paint(256, 256, (x, y) => {
    const wx = Math.sin(x * 1.6) * 0.5 + 0.5;
    const wy = Math.sin(y * 1.6) * 0.5 + 0.5;
    const weave = (x + y) % 8 < 4 ? wx : wy;
    const n = N.fbm(x / 30 + seed, y / 30, 3, 256 / 30);
    return shade([168, 138, 92], 0.6 + weave * 0.25 + n * 0.3);
  });
}

// Lana tejida para la manga del saco (punto elástico).
function wool() {
  return paint(128, 128, (x, y) => {
    const rib = Math.abs(Math.sin((x * Math.PI) / 4));
    const st = Math.sin(((y + (Math.floor(x / 4) % 2) * 2) * Math.PI) / 4);
    const n = N.fbm(x / 12 + 40, y / 12, 3, 128 / 12);
    return shade([150, 140, 120], 0.55 + rib * 0.22 + st * 0.07 + n * 0.25);
  });
}

// Piel: variación suave y poros (se multiplica por el color de la mano).
function skinTex() {
  return paint(128, 128, (x, y) => {
    const n = N.fbm(x / 10 + 3, y / 10, 4, 128 / 10);
    const p = N.fbm(x / 2.5 + 9, y / 2.5, 2, 128 / 2.5);
    return shade([255, 240, 230], 0.84 + n * 0.13 + p * 0.06);
  });
}

function boardTex({ seed }) {
  return paint(256, 64, (x, y) => {
    const g = N.fbm(x / 40 + seed, y / 4, 4, 256 / 40);
    let col = shade([118, 88, 58], 0.6 + g * 0.55);
    if (y < 2 || y > 61) col = shade(col, 0.5);
    if ((x < 14 || x > 242) && Math.abs(y - 32) < 3 && (x % 240) % 14 > 7) col = [50, 48, 45];
    return col;
  });
}

// Mugre y sangre para ropa y piel de los zombies (se multiplica por el color).
function grime() {
  const c = paint(256, 256, (x, y) => {
    const n = N.fbm(x / 20, y / 20, 5, 256 / 20);
    const v = 150 + n * 105;
    const tear = N.fbm(x / 8 + 9, y / 8, 3, 32);
    const k = tear > 0.72 ? 0.45 : 1;
    return [v * k, v * k, v * k];
  });
  const ctx = c.getContext('2d');
  const r = rng(9);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256;
    const y = r() * 256;
    ctx.fillStyle = `rgba(${90 + r() * 50},8,6,${0.5 + r() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + r() * 12, 2 + r() * 8, r() * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(x + (r() - 0.5) * 10, y, 1.5, 5 + r() * 16);
    }
  }
  return c;
}

// Camisa leñadora a cuadros (en grises: el color lo pone cada zombie), rota y con sangre.
function zombieCloth() {
  const c = paint(256, 256, (x, y) => {
    const a = Math.floor(x / 32) % 2;
    const b = Math.floor(y / 32) % 2;
    const thin = x % 32 < 3 || y % 32 < 3 ? 0.75 : 1;
    let v = (a && b ? 0.55 : a || b ? 0.8 : 1) * thin;
    const weave = (x + y) % 4 < 2 ? 0.95 : 1.05;
    const n = N.fbm(x / 18 + 3, y / 18, 4, 256 / 18);
    v *= weave * (0.7 + n * 0.45);
    // agujeros y desgarros (se ve piel oscura)
    const tear = N.fbm(x / 10 + 21, y / 10, 3, 256 / 10);
    if (tear > 0.74) return [70, 55, 50];
    return [clamp(210 * v), clamp(205 * v), clamp(200 * v)];
  });
  bloodStains(c.getContext('2d'), 12, 5);
  return c;
}

// Bombacha de campo: lona con costuras, parches y barro.
function zombiePants() {
  const c = paint(256, 256, (x, y) => {
    const n = N.fbm(x / 14 + 7, y / 30, 4, 256 / 14);
    const twill = (x + y * 2) % 6 < 3 ? 0.93 : 1.05;
    let v = (0.72 + n * 0.4) * twill;
    if (Math.abs(x - 128) < 2) v *= 0.6;
    const mud = N.fbm(x / 22 + 40, y / 22, 3, 256 / 22);
    if (y > 150 && mud > 0.55) v *= 0.55;
    return [clamp(200 * v), clamp(196 * v), clamp(188 * v)];
  });
  const ctx = c.getContext('2d');
  const r = rng(31);
  for (let i = 0; i < 3; i++) {
    const x = r() * 200;
    const y = r() * 200;
    ctx.fillStyle = `rgba(${120 + r() * 60},${110 + r() * 50},${90 + r() * 40},0.9)`;
    ctx.fillRect(x, y, 30 + r() * 20, 26 + r() * 20);
    ctx.strokeStyle = 'rgba(30,20,10,0.8)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 2, y + 2, 26 + r() * 16, 22 + r() * 14);
    ctx.setLineDash([]);
  }
  return c;
}

// Piel podrida: moteado, venas oscuras y heridas abiertas.
function zombieSkin() {
  const c = paint(256, 256, (x, y) => {
    const n = N.fbm(x / 16, y / 16, 5, 256 / 16);
    const blotch = N.fbm(x / 40 + 11, y / 40, 3, 256 / 40);
    let v = 0.72 + n * 0.35;
    const col = [205 * v, 210 * v, 190 * v];
    if (blotch > 0.62) return [col[0] * 0.8, col[1] * 0.7, col[2] * 0.85];
    return col.map(clamp);
  });
  const ctx = c.getContext('2d');
  const r = rng(17);
  // venas
  ctx.strokeStyle = 'rgba(40,50,60,0.45)';
  for (let i = 0; i < 18; i++) {
    let x = r() * 256;
    let y = r() * 256;
    ctx.lineWidth = 0.8 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 22;
      y += 6 + r() * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // heridas
  for (let i = 0; i < 6; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 10 + r() * 12);
    g.addColorStop(0, 'rgba(60,4,4,0.95)');
    g.addColorStop(0.5, 'rgba(120,20,16,0.8)');
    g.addColorStop(1, 'rgba(120,40,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 25, y - 25, 50, 50);
  }
  bloodStains(ctx, 5, 8);
  return c;
}

function bloodStains(ctx, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * 256;
    const y = r() * 256;
    ctx.fillStyle = `rgba(${80 + r() * 40},6,4,${0.55 + r() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + r() * 14, 3 + r() * 9, r() * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 3; k++) ctx.fillRect(x + (r() - 0.5) * 12, y, 1.5 + r(), 6 + r() * 20);
  }
}

// Cara del zombie para la cara frontal de la cabeza.
function zombieFace() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  const g = ctx.createRadialGradient(64, 60, 8, 64, 64, 84);
  g.addColorStop(0, '#c4c6b2');
  g.addColorStop(0.6, '#8e927c');
  g.addColorStop(1, '#5a5e4c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // piel moteada
  const r = rng(23);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${60 + r() * 40},${60 + r() * 30},${40 + r() * 30},${0.08 + r() * 0.15})`;
    ctx.beginPath();
    ctx.arc(r() * 128, r() * 128, 2 + r() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // ojeras hundidas y cuencas
  for (const x of [40, 88]) {
    const e = ctx.createRadialGradient(x, 52, 4, x, 52, 22);
    e.addColorStop(0, 'rgba(20,10,8,1)');
    e.addColorStop(0.55, 'rgba(50,20,20,0.85)');
    e.addColorStop(1, 'rgba(80,40,40,0)');
    ctx.fillStyle = e;
    ctx.fillRect(x - 24, 28, 48, 48);
  }
  // nariz carcomida
  ctx.fillStyle = '#2a1410';
  ctx.beginPath();
  ctx.moveTo(64, 60);
  ctx.lineTo(56, 80);
  ctx.lineTo(62, 78);
  ctx.lineTo(64, 82);
  ctx.lineTo(66, 78);
  ctx.lineTo(72, 80);
  ctx.fill();
  // boca desgarrada con dientes rotos
  ctx.fillStyle = '#1a0605';
  ctx.beginPath();
  ctx.moveTo(38, 96);
  ctx.quadraticCurveTo(64, 86, 92, 94);
  ctx.quadraticCurveTo(66, 124, 38, 96);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 7) continue;
    ctx.fillStyle = i % 2 ? '#b8a878' : '#d2c69a';
    ctx.fillRect(42 + i * 5.2, 92 + Math.abs(4 - i) * 0.6, 4, 5 + (i % 3) * 2);
    ctx.fillRect(44 + i * 5, 110 - (i % 3), 3.5, 5);
  }
  // costura y sangre
  ctx.strokeStyle = '#2a1a14';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(90, 18);
  ctx.lineTo(108, 70);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(90 + t * 18 - 4, 18 + t * 52);
    ctx.lineTo(90 + t * 18 + 4, 18 + t * 52 - 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(110,6,4,0.85)';
  ctx.fillRect(56, 110, 4, 18);
  ctx.fillRect(74, 108, 3, 20);
  ctx.fillRect(30, 60, 3, 14);
  return c;
}


// Trazo de tiza irregular: repasa el camino varias veces con temblor.
function chalkStroke(ctx, pts, r, passes = 4) {
  for (let p = 0; p < passes; p++) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (r() - 0.5) * 3;
      const jy = y + (r() - 0.5) * 3;
      if (i === 0) ctx.moveTo(jx, jy);
      else ctx.lineTo(jx, jy);
    });
    ctx.stroke();
  }
}

// Siluetas de mate para los dibujos de tiza: alto y ancho relativo a cada altura
// (0 = base, 1 = boca).
const CHALK_MATES = {
  round: { h: 124, w: 58, prof: [[0, 0.55], [0.08, 0.86], [0.3, 1], [0.55, 0.93], [0.76, 0.7], [0.9, 0.56], [1, 0.52]], virola: true },
  tall: { h: 142, w: 44, prof: [[0, 0.45], [0.1, 0.76], [0.36, 0.94], [0.62, 0.86], [0.86, 0.62], [1, 0.56]], virola: true },
  cyl: { h: 116, w: 42, prof: [[0, 0.92], [0.05, 1], [0.95, 1], [1, 0.97]], bands: true },
  cup: { h: 112, w: 48, prof: [[0, 0.72], [0.05, 0.76], [1, 1]] },
};

function profAt(prof, t) {
  for (let k = 1; k < prof.length; k++) {
    const [t1, w1] = prof[k];
    const [t0, w0] = prof[k - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      const e = u * u * (3 - 2 * u);
      return w0 + (w1 - w0) * e;
    }
  }
  return prof[prof.length - 1][1];
}

// Mate parado, visto de costado: calabaza, boca con yerba, virola y bombilla con pico.
function chalkMate(ctx, r, sil, straws) {
  const S = CHALK_MATES[sil] || CHALK_MATES.round;
  const cx = 128;
  const base = 236;
  const top = base - S.h;
  const half = (t) => S.w * profAt(S.prof, t);
  const left = [];
  const right = [];
  for (let k = 0; k <= 30; k++) {
    const t = k / 30;
    const y = base - t * S.h;
    left.push([cx - half(t), y]);
    right.push([cx + half(t), y]);
  }
  // contorno: costado izquierdo, base redondeada y costado derecho
  chalkStroke(ctx, left, r);
  chalkStroke(ctx, right, r);
  const bw = half(0);
  const bottom = [];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI * (k / 12);
    bottom.push([cx - Math.cos(a) * bw, base + Math.sin(a) * 6]);
  }
  chalkStroke(ctx, bottom, r);
  // boca (elipse) y la yerba asomando en montañita
  const mw = half(1);
  const mouth = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    mouth.push([cx + Math.cos(a) * mw, top + Math.sin(a) * 7]);
  }
  chalkStroke(ctx, mouth, r);
  const mound = [];
  for (let k = 0; k <= 12; k++) {
    const u = k / 12;
    mound.push([cx - mw * 0.85 + u * mw * 1.7, top - 2 - Math.sin(u * Math.PI) * 11 + (u > 0.5 ? (u - 0.5) * 8 : 0)]);
  }
  chalkStroke(ctx, mound, r, 3);
  ctx.save();
  ctx.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    const x = cx - mw * 0.6 + r() * mw * 1.1;
    const y = top - 3 - r() * 8;
    chalkStroke(ctx, [[x, y], [x + 3, y - 2]], r, 1);
  }
  ctx.restore();
  // virola: una banda de metal abajo de la boca
  if (S.virola) {
    const t = 0.9;
    const y = base - t * S.h;
    const w = half(t);
    chalkStroke(ctx, [[cx - w, y], [cx - w * 0.4, y + 4], [cx + w * 0.4, y + 4], [cx + w, y]], r, 3);
  }
  // guardas de los mates de lata o madera
  if (S.bands) {
    for (const t of [0.22, 0.78]) {
      const y = base - t * S.h;
      chalkStroke(ctx, [[cx - S.w, y], [cx + S.w, y]], r, 2);
      const zig = [];
      for (let k = 0; k <= 8; k++) zig.push([cx - S.w + (k / 8) * S.w * 2, y + (k % 2 ? 8 : 2)]);
      chalkStroke(ctx, zig, r, 1);
    }
  }
  // sombreado a la izquierda
  ctx.save();
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 9; k++) {
    const t = 0.12 + k * 0.075;
    const y = base - t * S.h;
    const x0 = cx - half(t) + 6;
    chalkStroke(ctx, [[x0, y], [x0 + 12, y - 10]], r, 1);
  }
  ctx.restore();
  // bombilla: sale de la yerba, sube inclinada y termina en el pico doblado
  for (let k = 0; k < straws; k++) {
    const off = k * 12 - (straws - 1) * 6;
    const sx = cx + mw * 0.25 + off;
    const sy = top - 6;
    const ang = 1.2;
    // que la punta no se salga del dibujo
    const len = Math.max(48, (sy - 22) / Math.sin(ang));
    const ex = sx + Math.cos(ang) * len;
    const ey = sy - Math.sin(ang) * len;
    ctx.save();
    ctx.lineWidth = 4;
    chalkStroke(ctx, [[sx, sy], [ex, ey]], r, 4);
    chalkStroke(ctx, [[ex, ey], [ex + 7, ey - 7], [ex + 18, ey - 9]], r, 4);
    ctx.restore();
  }
}

// Facón criollo: hoja larga con punta, guarda en S y cabo con virolas.
function chalkKnife(ctx, r) {
  const bx = 40;
  const by = 222;
  const ang = -0.62;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const P = (a, b) => [bx + ux * a * 0.84 + nx * b, by + uy * a * 0.84 + ny * b];
  // cabo
  chalkStroke(ctx, [P(0, -9), P(70, -10), P(70, 10), P(0, 9), P(0, -9)], r);
  for (const a of [14, 34, 54]) chalkStroke(ctx, [P(a, -11), P(a, 11)], r, 2);
  // guarda en S
  chalkStroke(ctx, [P(74, -26), P(70, -18), P(76, 0), P(70, 18), P(74, 26)], r);
  // hoja con lomo recto y filo que termina en punta
  chalkStroke(ctx, [P(78, -8), P(250, -8), P(290, 2)], r);
  chalkStroke(ctx, [P(78, 9), P(240, 9), P(290, 2)], r);
  ctx.save();
  ctx.lineWidth = 1.5;
  chalkStroke(ctx, [P(90, -2), P(235, -2)], r, 1);
  ctx.restore();
}

// Bomba de yerba: paquete atado con piolín y mecha.
function chalkBomb(ctx, r) {
  const cx = 138;
  const cy = 150;
  chalkStroke(ctx, [[cx - 50, cy - 60], [cx + 50, cy - 60], [cx + 54, cy + 70], [cx - 54, cy + 70], [cx - 50, cy - 60]], r);
  chalkStroke(ctx, [[cx - 52, cy], [cx + 52, cy]], r, 2);
  chalkStroke(ctx, [[cx, cy - 60], [cx, cy + 70]], r, 2);
  chalkStroke(ctx, [[cx, cy - 60], [cx + 8, cy - 84], [cx + 26, cy - 96]], r, 3);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.25;
    chalkStroke(ctx, [[cx + 26, cy - 96], [cx + 26 + Math.cos(a) * 16, cy - 96 + Math.sin(a) * 16]], r, 1);
  }
}

// Dibujo de tiza del arma en la pared: el mate a la izquierda y a la derecha
// el precio con el nombre abajo.
export function chalkTexture(weapon, price) {
  const c = canvas(512, 256);
  const ctx = c.getContext('2d');
  const r = rng(price + weapon.name.length * 31);
  ctx.strokeStyle = 'rgba(240,238,228,0.6)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const sil = weapon.chalk || 'round';
  if (sil === 'knife') chalkKnife(ctx, r);
  else if (sil === 'bomb') chalkBomb(ctx, r);
  else chalkMate(ctx, r, sil, weapon.chalkStraws || 1);
  // precio grande y el nombre en letra chica
  ctx.fillStyle = 'rgba(240,238,228,0.8)';
  ctx.font = 'bold 64px "Special Elite", monospace';
  ctx.fillText(String(price), 280, 140);
  let size = 26;
  ctx.font = `${size}px "Special Elite", monospace`;
  while (ctx.measureText(weapon.name).width > 222 && size > 14) {
    size -= 1;
    ctx.font = `${size}px "Special Elite", monospace`;
  }
  ctx.fillStyle = 'rgba(240,238,228,0.6)';
  ctx.fillText(weapon.name, 280, 186);
  chalkStroke(ctx, [[280, 198], [280 + Math.min(222, ctx.measureText(weapon.name).width), 200]], r, 1);
  return toTexture(c, { repeat: false });
}

// Etiqueta de paquete de yerba (perk). Frente del paquete gigante.
// Cada etiqueta se pinta una sola vez (al cambiar de mapa o reiniciar se
// vuelve a usar el mismo canvas, con una textura nueva).
const labels = new Map();
export const PERK_WEAR = (perk) => wearKey(512, 1024, perk.cost % 97, 0.3);
export function perkLabel(perk) {
  let c = labels.get(perk);
  if (!c) labels.set(perk, (c = paintPerkLabel(perk)));
  return toTexture(c, { repeat: false });
}

function paintPerkLabel(perk) {
  const W = 512;
  const H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const L = perk.label;
  ctx.fillStyle = L.bg;
  ctx.fillRect(0, 0, W, H);
  // guardas y bandas
  ctx.fillStyle = L.band;
  ctx.fillRect(0, H * 0.62, W, H * 0.16);
  ctx.fillStyle = L.accent;
  ctx.fillRect(0, H * 0.62, W, 10);
  ctx.fillRect(0, H * 0.78 - 10, W, 10);
  // hojas de yerba
  ctx.fillStyle = L.leaf;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(W / 2 + Math.cos(i) * 150, H * 0.47 + Math.sin(i * 2) * 60);
    ctx.rotate(i * 1.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, 60, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // emblema: el medallón del perk (el mismo del HUD, ui/perkIcons) con un aro
  // del color del paquete
  ctx.fillStyle = L.accent;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.47, 108, 0, Math.PI * 2);
  ctx.fill();
  drawPerkIcon(ctx, perk, W / 2, H * 0.47, 98);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // marca
  ctx.fillStyle = L.brandColor || L.text;
  ctx.font = `italic bold ${L.brandSize || 92}px Georgia, serif`;
  ctx.save();
  ctx.translate(W / 2, H * 0.16);
  ctx.rotate(-0.06);
  ctx.lineWidth = 10;
  ctx.strokeStyle = L.stroke || 'rgba(0,0,0,0.35)';
  ctx.strokeText(L.brand, 0, 0);
  ctx.fillText(L.brand, 0, 0);
  ctx.restore();
  ctx.font = 'bold 28px "Special Elite", monospace';
  ctx.fillStyle = L.text;
  ctx.fillText(L.tagline, W / 2, H * 0.26);
  // nombre del perk en la banda
  ctx.fillStyle = L.bandText;
  ctx.font = `bold ${perk.name.length > 12 ? 50 : 62}px Impact, "Arial Black", sans-serif`;
  ctx.fillText(perk.name.toUpperCase(), W / 2, H * 0.7);
  ctx.font = '26px "Special Elite", monospace';
  ctx.fillStyle = L.text;
  ctx.fillText('YERBA MATE ELABORADA CON PALO', W / 2, H * 0.83);
  ctx.font = 'bold 40px "Special Elite", monospace';
  ctx.fillText(`1 kg  ·  $${perk.cost}`, W / 2, H * 0.9);
  wear(ctx, W, H, perk.cost % 97, 0.3);
  return c;
}

function softDot() {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

// Atlas de calcos: [agujero de bala | salpicadura de sangre | quemadura].
function decalAtlas() {
  const c = canvas(384, 128);
  const ctx = c.getContext('2d');
  const r = rng(4);
  // agujero
  let g = ctx.createRadialGradient(64, 64, 2, 64, 64, 40);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.25, 'rgba(20,16,12,0.95)');
  g.addColorStop(0.5, 'rgba(40,32,24,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // sangre
  ctx.fillStyle = 'rgba(90,4,2,0.9)';
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 40;
    ctx.beginPath();
    ctx.arc(192 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + r() * 16 * (1 - d / 50), 0, Math.PI * 2);
    ctx.fill();
  }
  // quemadura
  g = ctx.createRadialGradient(320, 64, 4, 320, 64, 62);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.6, 'rgba(20,16,12,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(256, 0, 128, 128);
  return c;
}

// Cara de la taza de café burlona de la caja misteriosa.
function coffeeFace() {
  const c = canvas(256, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ede2';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#1b1210';
  // cejas malvadas
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#1b1210';
  ctx.beginPath();
  ctx.moveTo(78, 28);
  ctx.lineTo(116, 44);
  ctx.moveTo(178, 28);
  ctx.lineTo(140, 44);
  ctx.stroke();
  for (const x of [100, 156]) {
    ctx.beginPath();
    ctx.ellipse(x, 58, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(103, 53, 4, 0, Math.PI * 2);
  ctx.arc(159, 53, 4, 0, Math.PI * 2);
  ctx.fill();
  // sonrisa enorme
  ctx.fillStyle = '#5a0f0f';
  ctx.beginPath();
  ctx.moveTo(80, 82);
  ctx.quadraticCurveTo(128, 130, 176, 82);
  ctx.quadraticCurveTo(128, 100, 80, 82);
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) ctx.fillRect(92 + i * 13, 86, 10, 8);
  return c;
}

function questionMark() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.font = 'bold 110px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(200,240,255,1)';
  ctx.fillText('?', 64, 70);
  return c;
}

// Camuflaje del Pack-a-Pava: remolinos fluorescentes que se desplazan.
function papCamo() {
  const W = 256;
  return paint(W, W, (x, y) => {
    const n = N.fbm(x / 32, y / 32, 4, W / 32);
    const m = N.fbm(x / 16 + 30, y / 16, 3, W / 16);
    const band = Math.sin((n * 6 + m * 2) * Math.PI) * 0.5 + 0.5;
    const hue = (n * 1.4 + m * 0.6) % 1;
    const [r, g, b] = hsl(hue, 0.95, 0.45 + band * 0.25);
    return [r, g, b];
  });
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

function yerbaTop() {
  return paint(128, 128, (x, y) => {
    const n = N.fbm(x / 6, y / 6, 4, 128 / 6);
    const s = N.noise(x / 1.5, y / 1.5);
    const col = mix([74, 96, 34], [150, 160, 80], n * 0.8 + (s > 0.8 ? 0.3 : 0));
    return shade(col, 0.8 + s * 0.3);
  });
}

function leather() {
  return paint(256, 256, (x, y) => {
    const n = N.fbm(x / 10, y / 10, 5, 256 / 10);
    const c = shade([92, 52, 28], 0.65 + n * 0.5);
    if ((y % 64 < 2 || y % 64 > 61) && x % 10 < 5) return [200, 190, 160];
    return c;
  });
}

function gourd() {
  return paint(256, 256, (x, y) => {
    const n = N.fbm(x / 18, y / 40, 4, 256 / 18);
    const spots = N.fbm(x / 8 + 40, y / 8, 3, 32);
    let c = shade([128, 92, 48], 0.7 + n * 0.45);
    if (spots > 0.7) c = shade(c, 0.7);
    return c;
  });
}

function woodCarved() {
  return paint(256, 256, (x, y) => {
    const ring = Math.sin((y / 256) * Math.PI * 12 + N.fbm(x / 30, y / 30, 3, 256 / 30) * 6) * 0.5 + 0.5;
    return shade([150, 92, 50], 0.6 + ring * 0.4);
  });
}

// Las texturas de todos los mapas: [nombre, pintor, opciones de toTexture].
// Se pintan en otros hilos al abrir el juego (core/texturePool.js); las que no
// llegan se pintan acá. El '?' usa una letra del sistema: va siempre acá.
const BASE = [
  ['plasterGreen', () => plaster({ base: 0xcfc2a4, band: 0x3f6a4c, seed: 1 })],
  ['plasterBlue', () => plaster({ base: 0xc9c0ab, band: 0x3a5a78, seed: 2 })],
  ['plasterWhite', () => plaster({ base: 0xe4ddcc, band: 0x6c2a22, seed: 3 })],
  ['plasterOffice', () => plaster({ base: 0xb9a07a, band: 0x4a3322, seed: 4 })],
  ['brick', () => bricks({ seed: 5 })],
  ['brickSoot', () => bricks({ seed: 6, soot: 0.85, tint: 0x8a3c26 })],
  ['concreteWall', () => plaster({ base: 0x8a877e, band: 0x5b5d52, seed: 7, under: 0x5e5a52, bricks: false })],
  ['planks', () => planks({ seed: 8 })],
  ['planksDark', () => planks({ seed: 9, base: 0x4a3322, width: 80, dark: 0.8 })],
  ['parquet', () => planks({ seed: 10, base: 0x7a4a2a, width: 42, weather: 0.2 })],
  ['dirt', () => dirt({ seed: 11 })],
  ['dirtDark', () => dirt({ seed: 12, base: 0x5e2e1c, dark: 0.75 })],
  ['concrete', () => concrete({ seed: 13 })],
  ['calcareo', () => calcareo({ seed: 14 })],
  ['terracotta', () => terracotta({ seed: 15 })],
  ['corrugated', () => corrugated({ seed: 16 })],
  ['metal', () => metal({ seed: 17 })],
  ['metalGreen', () => metal({ seed: 18, base: 0x3f5a44 })],
  ['burlap', () => burlap({ seed: 19 })],
  ['wool', () => wool()],
  ['skin', () => skinTex()],
  ['board', () => boardTex({ seed: 20 })],
  ['grime', () => grime()],
  ['face', () => zombieFace(), { repeat: false }],
  ['zcloth', () => zombieCloth()],
  ['zpants', () => zombiePants()],
  ['zskin', () => zombieSkin()],
  ['dot', () => softDot(), { repeat: false, srgb: false }],
  ['decals', () => decalAtlas(), { repeat: false }],
  ['coffeeFace', () => coffeeFace(), { repeat: false }],
  ['question', () => questionMark(), { repeat: false }],
  ['camo', () => papCamo()],
  ['yerba', () => yerbaTop()],
  ['leather', () => leather()],
  ['gourd', () => gourd()],
  ['woodCarved', () => woodCarved()],
  ['ground', () => dirt({ seed: 21, base: 0x6a3420, dark: 0.7 })],
];
export const BASE_NAMES = BASE.map((b) => b[0]).filter((n) => n !== 'question');

// Las de los mapas (World.js: penalTextures, farmTextures). También salen de
// los workers del arranque (core/texturePool.js) y quedan esperando en PRE
// hasta que se arma el mapa; si no llegaron, se pintan acá.
const EXTRA = {
  grass41: () => grass({ seed: 41 }),
  adobe: () => plaster({ base: 0xb49a76, band: 0x7a4428, seed: 42, under: 0x7a5a3c, bricks: false }),
  barn: () => planks({ seed: 43, base: 0x8e3424, width: 56, dark: 0.9, weather: 1.2 }),
  fence: () => planks({ seed: 44, base: 0x6e6252, width: 64, dark: 0.85, weather: 1.2 }),
  corn: () => cornCard(),
  stoneWall: () => stoneBlocks({ seed: 61 }),
  cellWall: () => cellWall({ seed: 62 }),
  whitewash: () => plaster({ base: 0xd8d2c2, band: 0x8a3a2a, seed: 63, under: 0x6e6860, bricks: false }),
  damero: () => damero({ seed: 64 }),
  azulejo: () => azulejo({ seed: 65 }),
  rock: () => rock({ seed: 66 }),
  grass67: () => grass({ seed: 67 }),
};
export const MAP_SETS = {
  farm: ['grass41', 'adobe', 'barn', 'fence', 'corn'],
  penal: ['stoneWall', 'cellWall', 'whitewash', 'damero', 'azulejo', 'rock', 'grass67'],
};
const PRE = new Map();
export const putPre = (name, c) => PRE.set(name, c);
export function takePre(name) {
  const c = PRE.get(name);
  if (c) PRE.delete(name);
  return c || null;
}
const pre = (name) => takePre(name) || EXTRA[name]();

// Pinta una de la lista o de los mapas (para el worker).
export function paintBase(name) {
  const b = BASE.find((x) => x[0] === name);
  return b ? b[1]() : EXTRA[name]?.() || null;
}

// pre: { nombre: canvas } ya pintadas en otro hilo.
export function buildTextures(pre) {
  const T = {};
  for (const [name, fn, opts] of BASE) T[name] = toTexture(pre?.[name] || fn(), opts);
  return T;
}

// ---------------- la granja ----------------
// Pasto seco de fin de verano, con matas y tierra que asoma.
function grass({ seed }) {
  const r = rng(seed);
  const c = paint(512, 512, (x, y) => {
    const n = N.fbm(x / 40 + seed, y / 40, 5, 512 / 40);
    const m = N.fbm(x / 7 + 30, y / 7, 3, 512 / 7);
    let col = mix([62, 72, 34], [118, 104, 52], N.fbm(x / 120 + 9, y / 120, 3, 512 / 120));
    col = shade(col, 0.7 + n * 0.45 + (m - 0.5) * 0.25);
    const bare = N.fbm(x / 70 + 300, y / 70, 3, 512 / 70);
    if (bare > 0.64) col = mix(col, [96, 66, 40], Math.min(0.8, (bare - 0.64) * 3));
    return col;
  });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 2400; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const l = 3 + r() * 7;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    ctx.strokeStyle = `rgba(${90 + r() * 90},${100 + r() * 70},${40 + r() * 30},0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  c.relief = { detail: 0.5 };
  return c;
}

// Una planta de maíz (fondo transparente): caña, hojas caídas, la espiga
// arriba y un choclo. Se usa en tarjetas cruzadas instanciadas.
function cornCard() {
  const W = 128;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const r = rng(77);
  const stalk = (x0, lean, h, tone) => {
    ctx.strokeStyle = `rgb(${120 * tone},${118 * tone},${56 * tone})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, H);
    ctx.quadraticCurveTo(x0 + lean * 0.4, H - h * 0.5, x0 + lean, H - h);
    ctx.stroke();
    // hojas: largas, que salen y se doblan hacia abajo
    for (let i = 0; i < 7; i++) {
      const k = 0.18 + i * 0.11;
      const px = x0 + lean * k * k;
      const py = H - h * k;
      const side = i % 2 ? 1 : -1;
      const len = 34 + r() * 26 - i * 2;
      const g = 0.75 + r() * 0.35;
      ctx.fillStyle = `rgb(${(96 + r() * 40) * g * tone},${(104 + r() * 30) * g * tone},${40 * g * tone})`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + side * len * 0.6, py - 16, px + side * len, py + 10 + r() * 14);
      ctx.quadraticCurveTo(px + side * len * 0.55, py - 6, px, py + 6);
      ctx.fill();
    }
    // choclo con la barba
    const cy = H - h * 0.55;
    ctx.fillStyle = `rgb(${150 * tone},${140 * tone},${70 * tone})`;
    ctx.beginPath();
    ctx.ellipse(x0 + lean * 0.3 + 6, cy, 5, 15, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgb(${130 * tone},${70 * tone},${40 * tone})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + lean * 0.3 + 8, cy - 14);
      ctx.lineTo(x0 + lean * 0.3 + 10 + i * 2, cy - 22 - r() * 6);
      ctx.stroke();
    }
    // espiga
    ctx.strokeStyle = `rgb(${190 * tone},${160 * tone},${90 * tone})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + lean, H - h);
      ctx.lineTo(x0 + lean + (i - 2.5) * 5, H - h - 14 - r() * 10);
      ctx.stroke();
    }
  };
  stalk(52, -6, 236, 0.85);
  stalk(78, 8, 220, 1);
  return c;
}

// Las texturas de la granja se pintan recién cuando se arma ese mapa.
export function farmTextures(T) {
  // (el penal también arma su pasto: se mira el adobe, que es solo de la granja)
  if (T.adobe) return T;
  // (lo pintado sale de los workers del arranque si ya llegó: EXTRA, pre)
  T.grass ||= toTexture(pre('grass41'));
  T.adobe = toTexture(pre('adobe'));
  T.barn = toTexture(pre('barn'));
  T.fence = toTexture(pre('fence'));
  T.corn = toTexture(pre('corn'), { repeat: false });
  return T;
}

// ---------------- el penal ----------------
// Sillería de piedra gris: bloques desparejos con juntas hundidas y verdín abajo.
function stoneBlocks({ seed, base = 0x8a857a }) {
  const W = 512;
  const H = 512;
  const rows = 8;
  const rh = H / rows;
  const r = rng(seed);
  const rowsOff = [];
  const widths = [];
  // cada hilada suma justo W (así la textura se repite sin costura)
  for (let j = 0; j < rows; j++) {
    rowsOff.push(r() * W);
    const ws = [];
    let x = 0;
    while (x < W) {
      const w = 70 + r() * 70;
      ws.push({ x0: x, x1: x + w, t: 0.75 + r() * 0.4 });
      x += w;
    }
    const k = W / x;
    for (const q of ws) {
      q.x0 *= k;
      q.x1 *= k;
    }
    widths.push(ws);
  }
  const b = hex(base);
  // altura en px de textura (256 por metro), para fx/Surfaces
  const Hh = new Float32Array(W * H);
  const c = paint(W, H, (x, y) => {
    const j = Math.floor(y / rh);
    const ly = y - j * rh;
    const xx = (x + rowsOff[j]) % W;
    const blk = widths[j].find((q) => xx >= q.x0 && xx < q.x1) || widths[j][0];
    const lx = xx - blk.x0;
    const n = N.fbm(x / 26 + seed, y / 26, 4, W / 26);
    const f = N.noise(x / 3, y / 3);
    let col = shade(b, blk.t * (0.72 + n * 0.45 + (f - 0.5) * 0.15));
    // cara de piedra labrada a maza: ondulada, con el canto roto a golpes
    const edge = Math.min(lx, blk.x1 - blk.x0 - lx, ly, rh - ly);
    let h = 2 + (blk.t - 0.95) * 3 + (n - 0.5) * 3 + (f - 0.5) * 0.6;
    const wear = 3 + n * 6;
    if (edge < 3) {
      col = shade([70, 66, 60], 0.7 + n * 0.3);
      h = -3 + n;
    } else {
      if (edge < wear) h -= (1 - (edge - 3) / (wear - 3)) ** 2 * 2.5;
      if (edge < 12 && N.noise(x / 8 + seed * 5, y / 8, 64) > 0.66) {
        h -= 2;
        col = shade(col, 1.12);
      } else if (edge < 6) col = shade(col, 0.78);
    }
    Hh[y * W + x] = h;
    // verdín y humedad cerca del piso
    const fromBottom = (H - y) / H;
    const moss = N.fbm(x / 40 + 300, y / 40, 3, W / 40);
    if (fromBottom < 0.25 && moss > 0.5) col = mix(col, [58, 70, 44], Math.min(0.6, (0.25 - fromBottom) * 3 * (moss - 0.4)));
    return col;
  });
  // relieve (fx/Surfaces): la altura de arriba y un poco del grano del color
  c.relief = { H: Hh, detail: 0.2, depth: 0.03, ao: 1.3, aoBlur: 5 };
  return c;
}

// Pared de pabellón: revoque pintado, verde institucional abajo y crema arriba,
// descascarado, con rayas de presos contando días.
function cellWall({ seed }) {
  const c = plaster({ base: 0xc8c2a8, band: 0x4a6a58, seed, soot: 0.25 });
  const ctx = c.getContext('2d');
  const r = rng(seed + 9);
  ctx.strokeStyle = 'rgba(40,34,30,0.55)';
  ctx.lineWidth = 1.4;
  for (let g = 0; g < 5; g++) {
    const x0 = 30 + r() * 440;
    const y0 = 220 + r() * 120;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(x0 + k * 6, y0);
      ctx.lineTo(x0 + k * 6 + (r() - 0.5) * 2, y0 + 18);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0 - 3, y0 + 14);
    ctx.lineTo(x0 + 28, y0 + 3);
    ctx.stroke();
  }
  return c;
}

// Baldosas en damero, blancas y negras, gastadas por los pasos.
function damero({ seed }) {
  const S = 512;
  const t = S / 8;
  const c = paint(S, S, (x, y) => {
    const i = Math.floor(x / t);
    const j = Math.floor(y / t);
    const lx = x - i * t;
    const ly = y - j * t;
    const n = N.fbm(x / 30 + seed, y / 30, 4, S / 30);
    if (lx < 2 || ly < 2) return shade([90, 86, 80], 0.6 + n * 0.3);
    const white = (i + j) % 2 === 0;
    const col = white ? [206, 200, 186] : [34, 32, 30];
    return shade(col, 0.72 + n * 0.4 + (N.noise(x / 2, y / 2) - 0.5) * 0.1);
  });
  // relieve: solo la junta (lo blanco y lo negro están al mismo nivel)
  // encerado y gastado: brilla la baldosa, no la junta
  c.relief = { detail: 0.03, h: (x, y) => tileH(x % t, y % t, t, 2, 2), rough: (x, y) => (x % t < 2 || y % t < 2 ? 0.9 : 0.32) };
  return c;
}

// Azulejos blancos chicos (duchas, enfermería), con juntas oscuras y óxido.
function azulejo({ seed }) {
  const S = 512;
  const t = S / 16;
  const c = paint(S, S, (x, y) => {
    const lx = x % t;
    const ly = y % t;
    const n = N.fbm(x / 36 + seed, y / 36, 4, S / 36);
    if (lx < 2 || ly < 2) return shade([96, 92, 84], 0.6 + n * 0.4);
    let col = shade([214, 216, 206], 0.82 + n * 0.22);
    const rust = N.fbm(x / 60 + 70, y / 25, 3, S / 60);
    if (rust > 0.62) col = mix(col, [120, 70, 40], Math.min(0.55, (rust - 0.62) * 2.5));
    return col;
  });
  // relieve: el azulejo esmaltado tiene el canto redondeado (la pieza, 0.35
  // como en Baja: con 0.16 un cuarto entero de azulejo encandilaba desde Media)
  c.relief = { detail: 0.05, h: (x, y) => tileH(x % t, y % t, t, 2, 3), rough: (x, y) => (x % t < 2 || y % t < 2 ? 0.9 : 0.35) };
  return c;
}

// Roca de la barranca: gris con vetas y liquen.
function rock({ seed }) {
  const c = paint(512, 512, (x, y) => {
    const n = N.fbm(x / 50 + seed, y / 50, 5, 512 / 50);
    const v = N.fbm(x / 8 + 20, y / 30, 3, 512 / 8);
    let col = shade([112, 104, 94], 0.6 + n * 0.55 + (v - 0.5) * 0.2);
    const l = N.fbm(x / 20 + 90, y / 20, 3, 512 / 20);
    if (l > 0.66) col = mix(col, [110, 118, 70], (l - 0.66) * 2);
    return col;
  });
  c.relief = { detail: 0.8, blur: 5 };
  return c;
}

// Las texturas del penal se pintan recién cuando se arma ese mapa.
export function penalTextures(T) {
  if (T.stoneWall) return T;
  // (lo pintado sale de los workers del arranque si ya llegó: EXTRA, pre)
  T.stoneWall = toTexture(pre('stoneWall'));
  T.cellWall = toTexture(pre('cellWall'));
  T.whitewash = toTexture(pre('whitewash'));
  T.damero = toTexture(pre('damero'));
  T.azulejo = toTexture(pre('azulejo'));
  T.rock = toTexture(pre('rock'));
  T.grass = T.grass || toTexture(pre('grass67'));
  return T;
}
