import * as THREE from 'three';
import { makeNoise, rng } from './noise';

// Texturas procedurales pintadas en canvas: no se descarga ninguna imagen.

const N = makeNoise(115);

function canvas(w, h) {
  const c = document.createElement('canvas');
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
function plaster({ base, band, seed, soot = 0 }) {
  const W = 512;
  const H = 512;
  const b = hex(base);
  const bd = band == null ? null : hex(band);
  const bandTop = H * (1 - 1 / 3.6);
  const c = paint(W, H, (x, y) => {
    const n = N.fbm(x / 64 + seed, y / 64, 5, 8);
    const s = N.fbm(x / 22 + 40 + seed, y / 22, 3, 512 / 22);
    let col = shade(b, 0.84 + n * 0.24);
    // manchas de humedad
    const damp = N.fbm(x / 110 + seed * 3, y / 90 + 7, 3, 512 / 110);
    if (damp > 0.6) col = mix(col, shade(b, 0.72), Math.min(1, (damp - 0.6) * 3));
    if (bd && y > bandTop) {
      const peel = N.fbm(x / 30 + 90 + seed, y / 30, 4, 512 / 30);
      col = peel > 0.66 ? shade(b, 0.7 + s * 0.2) : shade(bd, 0.75 + n * 0.35);
      if (Math.abs(y - bandTop) < 2) col = shade(col, 0.6);
    }
    // mugre cerca del piso y hollín arriba
    const fromBottom = (H - y) / H;
    if (fromBottom < 0.12) col = shade(col, 0.55 + fromBottom * 3.7);
    if (soot) col = shade(col, 1 - soot * Math.max(0, 1 - y / (H * 0.6)) * (0.6 + n * 0.5));
    return col;
  });
  cracks(c.getContext('2d'), W, H, 14, seed * 7 + 3);
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
  return paint(W, H, (x, y) => {
    const row = Math.floor(y / rh);
    const off = row % 2 ? bw / 2 : 0;
    const cx = (x + off) % W;
    const col = Math.floor(cx / bw);
    const lx = cx - col * bw;
    const ly = y - row * rh;
    const n = N.fbm(x / 20 + seed, y / 20, 4, W / 20);
    let c;
    if (lx < 3 || ly < 3) c = shade(mortar, 0.7 + n * 0.4);
    else {
      const t = tints[(row * cols + col) % tints.length];
      c = shade(base, t * (0.8 + n * 0.35));
      if (N.noise(x / 3, y / 3) > 0.83) c = shade(c, 0.7);
    }
    const fromBottom = (H - y) / H;
    if (fromBottom < 0.1) c = shade(c, 0.6 + fromBottom * 4);
    if (soot) {
      const k = N.fbm(x / 70 + 30, y / 70, 3, W / 70);
      c = shade(c, 1 - soot * (0.4 + k * 0.6) * Math.max(0.15, 1 - y / H));
    }
    return c;
  });
}

function planks({ seed, base = 0x6b4a2e, width = 64, dark = 1 }) {
  const W = 512;
  const H = 512;
  const r = rng(seed);
  const n = W / width;
  const pl = [];
  for (let i = 0; i < n; i++) pl.push({ t: 0.7 + r() * 0.5, joint: r() * H, off: r() * 100 });
  const b = hex(base);
  const c = paint(W, H, (x, y) => {
    const i = Math.floor(x / width);
    const p = pl[i];
    const lx = x - i * width;
    const grain = N.fbm((x + p.off) / 6, y / 90 + p.off, 4, W / 6);
    const knot = N.noise(x / 14 + p.off, y / 14);
    let col = shade(b, p.t * (0.72 + grain * 0.5) * dark);
    if (knot > 0.86) col = shade(col, 0.65);
    if (lx < 2 || lx > width - 2) col = shade(col, 0.35);
    const jy = Math.abs(y - p.joint);
    if (jy < 1.5) col = shade(col, 0.35);
    // clavos
    if ((Math.abs(lx - 8) < 1.6 || Math.abs(lx - width + 8) < 1.6) && Math.abs(jy - 6) < 1.6) col = [40, 38, 36];
    return col;
  });
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
  return c;
}

function terracotta({ seed }) {
  const S = 512;
  const t = S / 8;
  const r = rng(seed);
  const tones = [];
  for (let i = 0; i < 64; i++) tones.push(0.75 + r() * 0.35);
  return paint(S, S, (x, y) => {
    const i = Math.floor(x / t);
    const j = Math.floor(y / t);
    const lx = x - i * t;
    const ly = y - j * t;
    const n = N.fbm(x / 16 + seed, y / 16, 4, S / 16);
    if (lx < 3 || ly < 3) return shade([120, 110, 95], 0.6 + n * 0.3);
    return shade([150, 70, 44], tones[j * 8 + i] * (0.75 + n * 0.4));
  });
}

// Desgaste y suciedad general sobre un canvas ya pintado.
function wear(ctx, w, h, seed, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const n = N.fbm(x / 50 + seed, y / 50, 4, w / 50);
      const k = 1 - amount * n * 0.9 - (N.noise(x / 2, y / 2) - 0.5) * 0.08;
      d[i] = clamp(d[i] * k);
      d[i + 1] = clamp(d[i + 1] * k);
      d[i + 2] = clamp(d[i + 2] * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function corrugated({ seed }) {
  return paint(256, 256, (x, y) => {
    const wave = Math.sin((x / 256) * Math.PI * 16);
    const n = N.fbm(x / 30 + seed, y / 30, 4, 256 / 30);
    let col = shade([128, 130, 128], 0.75 + wave * 0.18 + n * 0.25);
    const rust = N.fbm(x / 40 + 70, y / 25, 4, 256 / 40);
    if (rust > 0.55) col = mix(col, [120, 58, 26], Math.min(1, (rust - 0.55) * 3));
    return col;
  });
}

function metal({ seed, base = 0x5d6164 }) {
  const b = hex(base);
  return paint(256, 256, (x, y) => {
    const n = N.fbm(x / 24 + seed, y / 24, 4, 256 / 24);
    const brushed = N.noise(x / 60, y * 2) * 0.1;
    let col = shade(b, 0.75 + n * 0.3 + brushed);
    const rust = N.fbm(x / 34 + 20, y / 34, 4, 256 / 34);
    if (rust > 0.6) col = mix(col, [110, 55, 25], Math.min(1, (rust - 0.6) * 3.5));
    if (x % 128 < 2 || y % 128 < 2) col = shade(col, 0.5);
    return col;
  });
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

// Dibujo de tiza del arma en la pared (con precio).
export function chalkTexture(weapon, price) {
  const c = canvas(512, 256);
  const ctx = c.getContext('2d');
  const r = rng(price + weapon.name.length * 31);
  ctx.strokeStyle = 'rgba(240,238,228,0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const sil = weapon.chalk || 'round';
  // mate inclinado: calabaza a la izquierda, bombilla apuntando a la derecha
  const cx = 170;
  const cy = 130;
  const shapes = {
    round: { rx: 62, ry: 70 },
    tall: { rx: 50, ry: 84 },
    cyl: { rx: 48, ry: 72 },
    big: { rx: 80, ry: 82 },
    cup: { rx: 56, ry: 64 },
  };
  const s = shapes[sil] || shapes.round;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    let rx = s.rx;
    if (sil === 'cyl' || sil === 'cup') rx *= 0.85 + 0.15 * Math.abs(Math.cos(a));
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * s.ry]);
  }
  chalkStroke(ctx, pts, r);
  // boca / virola
  chalkStroke(ctx, [[cx + s.rx * 0.6, cy - s.ry * 0.75], [cx + s.rx * 0.95, cy - s.ry * 0.1]], r);
  // bombilla (dos si es de doble caño)
  const straws = weapon.chalkStraws || 1;
  for (let k = 0; k < straws; k++) {
    const oy = k * 16 - (straws - 1) * 8;
    chalkStroke(ctx, [[cx + s.rx * 0.5, cy - s.ry * 0.35 + oy], [470, cy - 40 + oy], [490, cy - 48 + oy]], r, 5);
  }
  // sombreado
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const y = cy - s.ry * 0.3 + i * 8;
    chalkStroke(ctx, [[cx - s.rx * 0.5, y], [cx - s.rx * 0.2, y + 14]], r, 1);
  }
  ctx.font = 'bold 44px "Special Elite", monospace';
  ctx.fillStyle = 'rgba(240,238,228,0.75)';
  ctx.fillText(String(price), 300, 225);
  return toTexture(c, { repeat: false });
}

// Etiqueta de paquete de yerba (perk). Frente del paquete gigante.
export function perkLabel(perk) {
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
  // emblema circular
  ctx.fillStyle = L.accent;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.47, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = L.bg;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.47, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = L.text;
  ctx.font = 'bold 110px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(perk.glyph, W / 2, H * 0.475);
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
  return toTexture(c, { repeat: false });
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

export function buildTextures() {
  const T = {};
  const t = (name, c, opts) => {
    T[name] = toTexture(c, opts);
  };
  t('plasterGreen', plaster({ base: 0xcfc2a4, band: 0x3f6a4c, seed: 1 }));
  t('plasterBlue', plaster({ base: 0xc9c0ab, band: 0x3a5a78, seed: 2 }));
  t('plasterWhite', plaster({ base: 0xe4ddcc, band: 0x6c2a22, seed: 3 }));
  t('plasterOffice', plaster({ base: 0xb9a07a, band: 0x4a3322, seed: 4 }));
  t('brick', bricks({ seed: 5 }));
  t('brickSoot', bricks({ seed: 6, soot: 0.85, tint: 0x8a3c26 }));
  t('concreteWall', plaster({ base: 0x8a877e, band: 0x5b5d52, seed: 7 }));
  t('planks', planks({ seed: 8 }));
  t('planksDark', planks({ seed: 9, base: 0x4a3322, width: 80, dark: 0.8 }));
  t('parquet', planks({ seed: 10, base: 0x7a4a2a, width: 42 }));
  t('dirt', dirt({ seed: 11 }));
  t('dirtDark', dirt({ seed: 12, base: 0x5e2e1c, dark: 0.75 }));
  t('concrete', concrete({ seed: 13 }));
  t('calcareo', calcareo({ seed: 14 }));
  t('terracotta', terracotta({ seed: 15 }));
  t('corrugated', corrugated({ seed: 16 }));
  t('metal', metal({ seed: 17 }));
  t('metalGreen', metal({ seed: 18, base: 0x3f5a44 }));
  t('burlap', burlap({ seed: 19 }));
  t('wool', wool());
  t('skin', skinTex());
  t('board', boardTex({ seed: 20 }));
  t('grime', grime());
  t('face', zombieFace(), { repeat: false });
  t('zcloth', zombieCloth());
  t('zpants', zombiePants());
  t('zskin', zombieSkin());
  t('dot', softDot(), { repeat: false, srgb: false });
  t('decals', decalAtlas(), { repeat: false });
  t('coffeeFace', coffeeFace(), { repeat: false });
  t('question', questionMark(), { repeat: false });
  t('camo', papCamo());
  t('yerba', yerbaTop());
  t('leather', leather());
  t('gourd', gourd());
  t('woodCarved', woodCarved());
  t('ground', dirt({ seed: 21, base: 0x6a3420, dark: 0.7 }));
  return T;
}
