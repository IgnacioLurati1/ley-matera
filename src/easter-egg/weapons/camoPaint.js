import { rng } from '../core/noise';

// Las texturas de los camuflajes (weapons/camos.js), pintadas en canvas: nada
// se descarga. Todas empalman de los dos lados: x da la vuelta al mate (la U
// del torno) y y va de la boca (arriba del canvas) al pie. Se pintan una sola
// vez y recién cuando hacen falta (la armería, o el camuflaje que lleva el
// mate en la partida).
//
// Además del color, cada una deja su relieve en canvas.camoRelief: la altura
// de cada capa (H: 0 lo más hondo, 1 lo que sobresale: la puntada, el
// cincelado, la pintura del filete), la rugosidad (R) y el metal (M) de cada
// pixel, con la fuerza del relieve (scale). camos.js arma con eso el normal
// map y el mapa de oclusión, rugosidad y metal.

export const W = 512;
export const H = 256;
const N = W * H;
const TAU = Math.PI * 2;

function canvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

const mod = (a, n) => ((a % n) + n) % n;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Ruido de valor que se repite cada px celdas a lo ancho y py a lo alto.
function vnoise(x, y, px, py, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = mod(xi, px);
  const y0 = mod(yi, py);
  const x1 = mod(xi + 1, px);
  const y1 = mod(yi + 1, py);
  const a = hash(x0, y0, s);
  const b = hash(x1, y0, s);
  const c = hash(x0, y1, s);
  const d = hash(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// fbm sobre (u, v) en [0, 1): cx por cy celdas en la primera octava.
export function fbm(u, v, cx, cy, oct = 4, s = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * cx, v * cy, cx, cy, s + o * 131);
    norm += amp;
    amp *= 0.5;
    cx *= 2;
    cy *= 2;
  }
  return sum / norm;
}

// Voronoi que empalma: [distancia al punto más cerca, al segundo, un número
// de la celda, y el centro de la celda (x, y en celdas)].
function voronoi(u, v, cx, cy, s = 0, jitter = 0.8) {
  const x = u * cx;
  const y = v * cy;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  let px1 = 0;
  let py1 = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = xi + i;
      const gy = yi + j;
      const hx = mod(gx, cx);
      const hy = mod(gy, cy);
      const px = gx + 0.5 + (hash(hx, hy, s) - 0.5) * jitter;
      const py = gy + 0.5 + (hash(hx, hy, s + 7) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(hx, hy, s + 13);
        px1 = px - x;
        py1 = py - y;
      } else if (d < d2) d2 = d;
    }
  }
  return [d1, d2, id, px1, py1];
}

// Pinta pixel por pixel: fn(u, v, x, y) devuelve [r, g, b] (0..255) y, si
// quiere, [.., altura, rugosidad, metal] (0..1). Lo que no devuelve sale de
// opt (rough, metal) o queda en la mitad (la altura).
function pixels(fn, opt = {}) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const Hh = new Float32Array(N);
  const R = new Float32Array(N);
  const M = new Float32Array(N);
  const r0 = opt.rough ?? 0.6;
  const m0 = opt.metal ?? 0;
  let i = 0;
  for (let y = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4, k++) {
      const p = fn((x + 0.5) / W, (y + 0.5) / H, x, y);
      d[i] = p[0];
      d[i + 1] = p[1];
      d[i + 2] = p[2];
      d[i + 3] = 255;
      Hh[k] = p[3] ?? 0.5;
      R[k] = p[4] ?? r0;
      M[k] = p[5] ?? m0;
    }
  }
  ctx.putImageData(img, 0, 0);
  c.camoRelief = { H: Hh, R, M, scale: opt.scale ?? 1, detail: opt.detail ?? 0.2, ao: opt.ao ?? 1 };
  return c;
}

// Un relieve (o una rugosidad, o un metal) dibujado con las mismas formas que
// el color, en grises: se arranca del gris `base` y cada forma se pinta con
// gray(altura). Devuelve los valores (0..1) de cada pixel.
const gray = (v) => {
  const g = Math.round(clamp(v) * 255);
  return `rgb(${g},${g},${g})`;
};
function layer(draw, base = 0.5) {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = gray(base);
  ctx.fillRect(0, 0, W, H);
  draw(ctx);
  const d = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(N);
  for (let k = 0, j = 0; k < N; k++, j += 4) out[k] = d[j] / 255;
  return out;
}
function relief(c, r) {
  const full = (v, d) => (v instanceof Float32Array ? v : new Float32Array(N).fill(v ?? d));
  c.camoRelief = { H: full(r.H, 0.5), R: full(r.R, 0.6), M: full(r.M, 0), scale: r.scale ?? 1, detail: r.detail ?? 0.2, ao: r.ao ?? 1 };
  return c;
}

// Dibuja lo mismo corrido un ancho y un alto para cada lado: lo que se sale
// por un borde entra por el otro (así empalma).
function wrapped(ctx, draw) {
  for (const ox of [-W, 0, W]) {
    for (const oy of [-H, 0, H]) {
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
  }
}

// ---------------- madera ----------------
// Veta de color y las canaletas de la fibra; los nudos, hundidos.
function wood(dark, light, knot, seed, rings, opt) {
  return pixels(
    (u, v) => {
      const w = fbm(u, v, 3, 2, 4, seed);
      const ring = 0.5 + 0.5 * Math.sin((u * rings + w * 2.6) * TAU);
      const fiber = vnoise(u * 320, v * 12, 320, 12, seed + 1);
      let c = mix(dark, light, Math.pow(ring, 1.5));
      c = shade(c, 0.82 + fiber * 0.3);
      const k = smooth(0.7, 0.86, fbm(u, v, 4, 2, 3, seed + 2));
      c = mix(c, knot, k * 0.75);
      const h = 0.55 + ring * 0.18 - smooth(0.35, 0.08, fiber) * 0.35 - k * 0.25;
      return [...c, h, opt.rough - ring * 0.08];
    },
    { scale: opt.scale ?? 0.8, detail: 0.15 },
  );
}

// ---------------- espirales (el fileteado, la alpaca) ----------------
// Espiral de afuera hacia adentro, que se va afinando. Devuelve los puntos
// [x, y, ancho]; el primero es la punta de afuera.
function spiral(cx, cy, R, a0, dir, w, turns = 1.6, n = 56) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + dir * t * Math.PI * 2 * turns;
    const r = R * (1 - t * 0.82);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, w * (1 - t * 0.62)]);
  }
  return pts;
}

// Un trazo de ancho variable con borde oscuro, color y un brillo corrido.
// En el relieve (h): el borde queda más bajo que el centro del trazo y el
// brillo arriba de todo (la pincelada tiene cuerpo).
function stroke3(ctx, pts, col, hi, edge = '#050505', h = null) {
  ctx.lineCap = 'round';
  const passes = h
    ? [
        [gray(h * 0.55), 1, 2.6, 0],
        [gray(h * 0.85), 1, 0, 0],
        [gray(h), 0.45, 0, 0],
      ]
    : [
        [edge, 1, 2.6, 0],
        [col, 1, 0, 0],
        [hi, 0.3, 0, -0.9],
      ];
  for (const [color, k, add, off] of passes) {
    ctx.strokeStyle = color;
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.lineWidth = pts[i][2] * k + add;
      ctx.beginPath();
      ctx.moveTo(pts[i][0] + off, pts[i][1] + off);
      ctx.lineTo(pts[i + 1][0] + off, pts[i + 1][1] + off);
      ctx.stroke();
    }
  }
}

function bezierPts(p0, p1, p2, p3, w0, w1, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    const x = s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0];
    const y = s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1];
    // más gruesa en el medio
    pts.push([x, y, w0 + (w1 - w0) * Math.sin(t * Math.PI)]);
  }
  return pts;
}

// Una hoja de acanto: gota rellena con degradé, borde negro y la nervadura
// (en el relieve: la hoja abombada y la nervadura hundida).
function leaf(ctx, x, y, len, wid, ang, c0, c1, h = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.9, len, 0);
    ctx.bezierCurveTo(len * 0.75, wid * 0.6, len * 0.3, wid * 0.9, 0, 0);
  };
  shape();
  if (h) {
    ctx.fillStyle = gray(h);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = gray(h * 0.6);
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#050505';
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid * 0.25, len * 0.9, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = h ? gray(h * 0.7) : 'rgba(255,255,220,0.7)';
  ctx.stroke();
  ctx.restore();
}

// Voronoi de facetas: cada celda un plano inclinado a su gusto (cristal, hielo).
function facet(u, v, cx, cy, s, tilt) {
  const [d1, d2, id, px, py] = voronoi(u, v, cx, cy, s, 1);
  const a = (hash(Math.floor(id * 1e6), 1, s) - 0.5) * tilt;
  const b = (hash(Math.floor(id * 1e6), 2, s) - 0.5) * tilt;
  return { d1, d2, id, h: 0.5 + a * px + b * py, edge: smooth(0, 0.04, d2 - d1) };
}

// ---------------- los camuflajes ----------------
export const PAINT = {
  // cuero crudo: claro, con manchas más oscuras (y más lisas) donde se
  // transparenta, arrugas y poros
  cuero: () =>
    pixels(
      (u, v) => {
        const n = fbm(u, v, 6, 3, 5, 1);
        const m = smooth(0.56, 0.8, fbm(u, v, 3, 2, 3, 2));
        let c = mix([176, 138, 94], [226, 200, 156], n);
        c = mix(c, [128, 88, 54], m * 0.55);
        c = shade(c, 0.9 + vnoise(u * 180, v * 90, 180, 90, 3) * 0.14);
        const pore = vnoise(u * 256, v * 128, 256, 128, 4) > 0.83;
        if (pore) c = shade(c, 0.78);
        const wrinkle = 1 - Math.abs(fbm(u, v, 12, 6, 3, 5) * 2 - 1);
        const h = 0.5 + (n - 0.5) * 0.3 - Math.pow(wrinkle, 6) * 0.35 - (pore ? 0.3 : 0);
        return [...c, h, 0.74 - m * 0.18];
      },
      { scale: 1.1 },
    ),

  algarrobo: () => wood([86, 36, 18], [166, 88, 46], [52, 20, 10], 11, 11, { rough: 0.5 }),

  // yerba canchada: hojitas partidas y palitos sobre verde oscuro, cada uno
  // arriba del otro
  yerba: () => {
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a3814';
    ctx.fillRect(0, 0, W, H);
    const r = rng(71);
    const cols = ['#5c7a28', '#7f963a', '#48621e', '#a0a856', '#6b8a2c', '#3a5218', '#8c9a44'];
    const bits = [];
    for (let i = 0; i < 900; i++) {
      const n = 4 + Math.floor(r() * 3);
      const rad = 3 + r() * 8;
      const rot = r() * TAU;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU;
        const rr = rad * (0.5 + r() * 0.6);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      bits.push({ x: r() * W, y: r() * H, pts, col: cols[Math.floor(r() * cols.length)], h: 0.35 + (i / 900) * 0.5 });
    }
    const sticks = [];
    for (let i = 0; i < 90; i++) sticks.push({ x: r() * W, y: r() * H, a: r() * TAU, l: 8 + r() * 16, w: 1.6 + r() * 1.4, col: r() < 0.5 ? '#c8b47a' : '#a89058' });
    const draw = (ctx, hmode) => {
      for (const b of bits) {
        ctx.fillStyle = hmode ? gray(b.h) : b.col;
        ctx.beginPath();
        b.pts.forEach(([x, y], k) => (k ? ctx.lineTo(b.x + x, b.y + y) : ctx.moveTo(b.x + x, b.y + y)));
        ctx.fill();
      }
      for (const s of sticks) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.fillStyle = hmode ? gray(1) : s.col;
        ctx.fillRect(-s.l / 2, -s.w / 2, s.l, s.w);
        ctx.restore();
      }
    };
    wrapped(ctx, () => draw(ctx, false));
    return relief(c, { H: layer((l) => wrapped(l, () => draw(l, true)), 0.1), R: 0.85, scale: 1.4, detail: 0.1 });
  },

  // tiento trenzado: tientos claros y oscuros que van por arriba y por abajo
  tiento: () =>
    pixels(
      (u, v) => {
        const a = u * 20 + v * 8;
        const b = u * 20 - v * 8;
        const ia = Math.floor(a);
        const ib = Math.floor(b);
        const fa = a - ia;
        const fb = b - ib;
        const onA = ((ia + ib) & 1) === 0;
        const across = Math.sin((onA ? fa : fb) * Math.PI);
        const along = Math.sin((onA ? fb : fa) * Math.PI);
        const light = ((onA ? ia : ib) & 1) === 0;
        let c = light ? [214, 184, 136] : [112, 64, 34];
        c = shade(c, (0.3 + 0.7 * Math.sqrt(across)) * (0.72 + 0.28 * along));
        const grain = vnoise(u * 200, v * 100, 200, 100, 21);
        c = shade(c, 0.9 + grain * 0.16);
        const h = Math.sqrt(across) * (0.55 + 0.45 * along) + grain * 0.04;
        return [...c, h, light ? 0.5 : 0.6];
      },
      { scale: 1.6, ao: 1.4 },
    ),

  // poncho salteño: colorado con la franja negra, de lana tejida
  poncho: () =>
    pixels(
      (u, v, x, y) => {
        const wool = fbm(u, v, 96, 48, 3, 31);
        const inB = (a, b) => v > a && v < b;
        let c = [150, 22, 26];
        if (inB(0.6, 0.8) || inB(0.54, 0.565) || inB(0.835, 0.86)) c = [22, 16, 16];
        const weave = 0.5 + 0.5 * Math.sin(((x % 4) / 4) * TAU) * Math.sin(((y % 4) / 4) * TAU + ((x >> 2) & 1) * Math.PI);
        return [...shade(c, 0.78 + wool * 0.4), 0.35 + weave * 0.35 + wool * 0.3, 0.95];
      },
      { scale: 0.9, detail: 0.1 },
    ),

  // carpincho: cuero curtido con los poros de a tres
  carpincho: () => {
    const base = new Float32Array(N);
    const c = pixels((u, v) => {
      const n = fbm(u, v, 5, 3, 5, 41);
      const col = mix([132, 84, 46], [184, 128, 78], n);
      return [...shade(col, 0.9 + vnoise(u * 160, v * 80, 160, 80, 42) * 0.15), 0.5 + (n - 0.5) * 0.3];
    });
    base.set(c.camoRelief.H);
    const ctx = c.getContext('2d');
    const r = rng(43);
    const pores = [];
    const nx = 40;
    const ny = 20;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = (i + 0.5 + (r() - 0.5) * 0.6) * (W / nx);
        const cy = (j + 0.5 + (r() - 0.5) * 0.6) * (H / ny);
        const rot = r() * TAU;
        for (let k = 0; k < 3; k++) {
          const a = rot + (k * TAU) / 3;
          pores.push([cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6, 1.1 + r() * 0.5]);
        }
      }
    }
    const draw = (l) =>
      wrapped(l, () => {
        l.beginPath();
        for (const [x, y, rr] of pores) {
          l.moveTo(x + rr, y);
          l.arc(x, y, rr, 0, TAU);
        }
        l.fill();
      });
    ctx.fillStyle = 'rgba(40, 20, 8, 0.75)';
    draw(ctx);
    const holes = layer((l) => {
      l.fillStyle = gray(0);
      draw(l);
    }, 1);
    for (let k = 0; k < N; k++) base[k] *= 0.35 + 0.65 * holes[k];
    return relief(c, { H: base, R: 0.6, scale: 1.4 });
  },

  // guarda pampa: rombos escalonados, dientes y ribetes colorados, tejido
  guarda: () =>
    pixels(
      (u, v, x, y) => {
        const RED = [150, 26, 22];
        const CREAM = [226, 208, 172];
        const BLACK = [26, 20, 18];
        const edge = Math.min(v, 1 - v);
        let c;
        if (edge < 0.07) c = RED;
        else if (edge < 0.1) c = CREAM;
        else if (edge < 0.17) {
          const t = (edge - 0.1) / 0.07;
          const f = (u * 32) % 1;
          c = Math.abs(f - 0.5) * 2 < 1 - t ? CREAM : BLACK;
        } else {
          const my = (v - 0.17) / 0.66;
          const mx = (u * 7) % 1;
          const qx = Math.floor(Math.abs(mx - 0.5) * 2 * 7) / 7;
          const qy = Math.floor(Math.abs(my - 0.5) * 2 * 7) / 7;
          const d = qx + qy;
          if (d < 1) {
            const ring = Math.floor(d * 5);
            c = ring === 0 ? RED : ring % 2 ? CREAM : BLACK;
          } else c = BLACK;
        }
        const weave = (x + y) % 2 ? 0.95 : 1;
        const thread = Math.sin(((x % 3) / 3) * Math.PI) * 0.5 + Math.sin(((y % 3) / 3) * Math.PI) * 0.5;
        // lo de color (lana teñida) sobresale apenas del fondo negro
        const lift = c === BLACK ? 0 : 0.15;
        return [...shade(c, (0.9 + 0.1 * vnoise(u * 256, v * 128, 256, 128, 51)) * weave), 0.3 + thread * 0.4 + lift, 0.95];
      },
      { scale: 0.8, detail: 0.1 },
    ),

  palosanto: () => {
    const c = wood([58, 70, 34], [140, 146, 70], [34, 44, 22], 61, 9, { rough: 0.35 });
    const ctx = c.getContext('2d');
    // vetas amarillas del palo santo
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        const k = smooth(0.6, 0.8, fbm(x / W, y / H, 6, 2, 3, 64)) * 0.5;
        d[i] += (190 - d[i]) * k;
        d[i + 1] += (176 - d[i + 1]) * k;
        d[i + 2] += (84 - d[i + 2]) * k;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  },

  // pingo overo: manchones blancos sobre alazán, con el pelo
  overo: () =>
    pixels(
      (u, v) => {
        const p = smooth(0.5, 0.53, fbm(u, v, 3, 2, 5, 61));
        const hair = vnoise(u * 300, v * 30, 300, 30, 62);
        const c = mix([120, 60, 28], [236, 230, 218], p);
        return [...shade(c, 0.84 + hair * 0.24), 0.3 + hair * 0.6, 0.72 + p * 0.1];
      },
      { scale: 0.9, detail: 0.1 },
    ),

  // calcáreo: baldosas con la roseta y los cuartos de círculo en las
  // esquinas, pulidas, con el bisel y la junta hundida
  calcareo: () =>
    pixels(
      (u, v) => {
        const X = u * 8;
        const Y = v * 4;
        const cx = X - Math.floor(X) - 0.5;
        const cy = Y - Math.floor(Y) - 0.5;
        const ax = Math.abs(cx);
        const ay = Math.abs(cy);
        const r = Math.hypot(cx, cy);
        const th = Math.atan2(cy, cx);
        let c = [226, 214, 186];
        const corner = Math.hypot(0.5 - ax, 0.5 - ay);
        if (corner < 0.2) c = [198, 128, 52];
        else if (corner < 0.24) c = [30, 28, 26];
        const dia = ax + ay;
        if (dia > 0.33 && dia < 0.37) c = [40, 84, 62];
        if (r < 0.26 * (0.55 + 0.45 * Math.abs(Math.cos(th * 2)))) c = [156, 48, 38];
        if (r < 0.07) c = [198, 128, 52];
        const m = Math.max(ax, ay);
        const grout = m > 0.485;
        if (grout) c = [120, 116, 108];
        const wear = fbm(u, v, 16, 8, 3, 71);
        return [...shade(c, 0.9 + wear * 0.14), grout ? 0 : 0.35 + 0.6 * smooth(0.485, 0.45, m) + wear * 0.05, grout ? 0.95 : 0.2 + wear * 0.15];
      },
      { scale: 1.2, ao: 1.6 },
    ),

  // yarará: escamas abombadas y las manchas en forma de riñón con borde claro
  vibora: () =>
    pixels(
      (u, v) => {
        const row = Math.floor(v * 32);
        const sx = u * 48 + (row & 1) * 0.5;
        const fx = sx - Math.floor(sx) - 0.5;
        const fy = v * 32 - row - 0.5;
        const scale = Math.max(0, 1 - Math.min(1, Math.hypot(fx * 1.1, fy * 1.3) * 1.6));
        const X = u * 6;
        const Y = v * 4;
        const iy = Math.floor(Y);
        let d = 9;
        for (let rr = iy - 1; rr <= iy + 1; rr++) {
          const o = (mod(rr, 4) & 1) * 0.5;
          const ix = Math.floor(X - o);
          for (let k = ix - 1; k <= ix + 1; k++) d = Math.min(d, Math.hypot((X - (k + o + 0.5)) / 0.9, (Y - (rr + 0.5)) / 0.6));
        }
        let c = [170, 140, 96];
        if (d < 0.5) c = [214, 196, 150];
        if (d < 0.45) c = [58, 36, 20];
        if (d < 0.25) c = [120, 84, 52];
        return [...shade(c, 0.62 + 0.45 * Math.sqrt(scale)), Math.sqrt(scale), 0.3 + (1 - scale) * 0.45];
      },
      { scale: 1.5, ao: 1.4 },
    ),

  // alpaca repujada: plata cincelada con volutas, flores en relieve y el
  // graneado de fondo (lo alto, pulido; el fondo, mate)
  alpaca: () => {
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9ccd3';
    ctx.fillRect(0, 0, W, H);
    const r = rng(91);
    const dots = [];
    for (let i = 0; i < 5000; i++) dots.push([r() * W, r() * H]);
    const draw = (ctx, hm) => {
      ctx.fillStyle = hm ? gray(0.3) : 'rgba(70, 72, 82, 0.45)';
      for (const [x, y] of dots) ctx.fillRect(x, y, 1.2, 1.2);
      const engrave = (pts) => {
        const passes = hm
          ? [[gray(0.05), 3.2, 0]]
          : [
              ['rgba(40,42,50,0.9)', 3.2, 0],
              ['rgba(255,255,255,0.8)', 1.1, -1.1],
            ];
        for (const [col, wd, off] of passes) {
          ctx.strokeStyle = col;
          ctx.lineWidth = wd;
          ctx.lineCap = 'round';
          ctx.beginPath();
          pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + off, y + off) : ctx.moveTo(x + off, y + off)));
          ctx.stroke();
        }
      };
      const motif = (ox, oy) => {
        const cx = ox + 64;
        const cy = oy + 64;
        // la flor del medio, en relieve
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          ctx.save();
          ctx.translate(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, 0, 10, 4.2, 0, 0, TAU);
          ctx.fillStyle = hm ? gray(1) : '#eceef3';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = hm ? gray(0.15) : 'rgba(40,42,50,0.9)';
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, TAU);
        ctx.fillStyle = hm ? gray(1) : '#f6f7fa';
        ctx.fill();
        ctx.stroke();
        // cuatro volutas hacia las esquinas, con hojitas
        for (let k = 0; k < 4; k++) {
          const a = Math.PI / 4 + (k * Math.PI) / 2;
          const ex = cx + Math.cos(a) * 42;
          const ey = cy + Math.sin(a) * 42;
          engrave(spiral(ex, ey, 17, a + Math.PI, k % 2 ? 1 : -1, 1, 1.4));
          const mx = cx + Math.cos(a) * 26;
          const my = cy + Math.sin(a) * 26;
          for (const s of [-1, 1]) {
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(a + s * 0.9);
            ctx.beginPath();
            ctx.ellipse(6, 0, 7, 2.6, 0, 0, TAU);
            ctx.fillStyle = hm ? gray(0.9) : '#e4e6ec';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = hm ? gray(0.2) : 'rgba(40,42,50,0.85)';
            ctx.stroke();
            ctx.restore();
          }
        }
      };
      wrapped(ctx, () => {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) motif(i * 128, j * 128);
      });
    };
    draw(ctx, false);
    const h = layer((l) => draw(l, true), 0.55);
    const rough = new Float32Array(N);
    for (let k = 0; k < N; k++) rough[k] = h[k] > 0.8 ? 0.16 : h[k] < 0.4 ? 0.55 : 0.34;
    return relief(c, { H: h, R: rough, M: 1, scale: 1.6, ao: 1.5, detail: 0.05 });
  },

  // tatú carreta: fajas de placas abombadas, cada una tapando la de abajo
  tatu: () =>
    pixels(
      (u, v) => {
        const B = v * 8;
        const bi = Math.floor(B);
        const bf = B - bi;
        const X = u * 36 + (bi & 1) * 0.5;
        const xi = Math.floor(X);
        const xf = X - xi;
        const e = Math.min(xf, 1 - xf) * 2;
        const k = smooth(0, 0.3, e) * (0.55 + 0.45 * smooth(0, 0.35, bf)) * (1 - 0.35 * smooth(0.8, 1, bf));
        const tone = hash(mod(xi, 36), bi & 7, 91);
        let c = mix([108, 92, 76], [170, 150, 124], tone * 0.6 + 0.2);
        c = shade(c, 0.35 + 0.65 * k);
        const g = vnoise(u * 200, v * 100, 200, 100, 92);
        return [...shade(c, 0.92 + 0.14 * g), k * 0.9 + g * 0.05 + (1 - bf) * 0.1, 0.5 + (1 - k) * 0.3];
      },
      { scale: 1.6, ao: 1.5 },
    ),

  // ñandutí: ruedas de encaje de colores sobre el tul oscuro (los hilos, en relieve)
  nanduti: () => {
    const c = canvas();
    const ctx = c.getContext('2d');
    const COLS = ['#ff3d8b', '#ffd23a', '#35d0ff', '#5ce05a', '#ff8a2a', '#b86bff'];
    const draw = (ctx, hm) => {
      ctx.strokeStyle = hm ? gray(0.3) : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }
      const wheel = (cx, cy, R, off) => {
        const rings = Math.max(2, Math.round(R / 9.5));
        ctx.strokeStyle = hm ? gray(0.6) : 'rgba(244,236,216,0.7)';
        ctx.lineWidth = 0.8;
        const spokes = R > 30 ? 48 : 24;
        for (let k = 0; k < spokes; k++) {
          const a = (k / spokes) * TAU;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.stroke();
        }
        for (let k = 0; k < rings; k++) {
          const rk = 9 + (k * (R - 12)) / Math.max(1, rings - 1);
          const n = 10 + k * 6;
          ctx.fillStyle = hm ? gray(0.85) : COLS[(k + off) % COLS.length];
          for (let s = 0; s < n; s++) {
            const a = (s / n) * TAU;
            const b = ((s + 0.5) / n) * TAU;
            const e = ((s + 1) / n) * TAU;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (rk - 3), cy + Math.sin(a) * (rk - 3));
            ctx.lineTo(cx + Math.cos(b) * (rk + 4), cy + Math.sin(b) * (rk + 4));
            ctx.lineTo(cx + Math.cos(e) * (rk - 3), cy + Math.sin(e) * (rk - 3));
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, TAU);
        ctx.fillStyle = hm ? gray(1) : COLS[off % COLS.length];
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, TAU);
        ctx.fillStyle = hm ? gray(1) : '#fff';
        ctx.fill();
      };
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) wheel(64 + i * 128, 64 + j * 128, 56, i + j * 3);
      wrapped(ctx, () => {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) wheel(i * 128, j * 128, 18, i + j + 2);
      });
    };
    ctx.fillStyle = '#1c1024';
    ctx.fillRect(0, 0, W, H);
    draw(ctx, false);
    return relief(c, { H: layer((l) => draw(l, true), 0.05), R: 0.8, scale: 1.3, ao: 1.6, detail: 0.05 });
  },

  // cobre martillado: los golpes del martillo (hondos) y algo de verdín (mate, sin brillo de metal)
  cobre: () =>
    pixels(
      (u, v) => {
        const [d1, d2, id] = voronoi(u, v, 22, 11, 81, 0.85);
        const dimple = Math.min(1, d1 / 0.7);
        const rim = smooth(0, 0.12, d2 - d1);
        let c = mix([150, 72, 40], [232, 150, 98], 1 - dimple * dimple * 0.85);
        c = shade(c, 0.75 + 0.25 * rim + id * 0.12);
        const g = smooth(0.68, 0.85, fbm(u, v, 5, 3, 4, 82));
        c = mix(c, [64, 120, 96], g * 0.45);
        return [...c, 0.25 + Math.pow(dimple, 0.7) * 0.75, 0.26 + g * 0.55, 1 - g * 0.9];
      },
      { scale: 1.3, detail: 0.05 },
    ),

  // fileteado porteño: volutas, hojas de acanto y perlitas pintadas a pincel
  // (con cuerpo) sobre negro laqueado
  fileteado: () => {
    const c = canvas();
    const ctx = c.getContext('2d');
    const SCHEMES = [
      { main: '#d62b2b', hi: '#ffc0b0', small: '#f2c230', smallHi: '#fff4c0' },
      { main: '#2b6fd6', hi: '#c0e0ff', small: '#f2c230', smallHi: '#fff4c0' },
    ];
    const draw = (ctx, hm) => {
      const tile = (ox, oy, flip, s) => {
        ctx.save();
        ctx.translate(ox + (flip ? 128 : 0), oy);
        if (flip) ctx.scale(-1, 1);
        const h = hm ? 0.85 : null;
        // el tallo en S que une las dos volutas grandes
        stroke3(ctx, bezierPts([34, 32], [72, 18], [56, 110], [94, 96], 5, 8), s.main, s.hi, '#050505', h);
        stroke3(ctx, spiral(34, 52, 20, -Math.PI / 2, -1, 7), s.main, s.hi, '#050505', h);
        stroke3(ctx, spiral(94, 76, 20, Math.PI / 2, -1, 7), s.main, s.hi, '#050505', h);
        leaf(ctx, 62, 64, 34, 10, -0.75, '#1f7a36', '#b8e04a', hm ? 0.7 : null);
        leaf(ctx, 66, 64, 34, 10, Math.PI - 0.75, '#1f7a36', '#b8e04a', hm ? 0.7 : null);
        stroke3(ctx, spiral(16, 108, 10, 0, 1, 4), s.small, s.smallHi, '#050505', hm ? 0.75 : null);
        stroke3(ctx, spiral(112, 20, 10, Math.PI, 1, 4), s.small, s.smallHi, '#050505', hm ? 0.75 : null);
        ctx.fillStyle = hm ? gray(1) : '#f4f0e6';
        for (const [x, y] of [
          [100, 44],
          [108, 50],
          [114, 58],
          [28, 84],
          [20, 78],
          [14, 70],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, 2.2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      };
      for (let i = -1; i <= 4; i++) for (let j = -1; j <= 2; j++) tile(i * 128, j * 128, mod(i + j, 2) === 1, SCHEMES[mod(i, 2)]);
      // los filetes del borde, arriba y abajo
      for (const y of [5, H - 5]) {
        ctx.fillStyle = hm ? gray(0.6) : '#f2c230';
        ctx.fillRect(0, y - 3, W, 1.4);
        ctx.fillStyle = hm ? gray(0.7) : '#f4f0e6';
        ctx.fillRect(0, y + 1, W, 2.2);
      }
    };
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, W, H);
    draw(ctx, false);
    return relief(c, { H: layer((l) => draw(l, true), 0.1), R: 0.4, scale: 1.2, ao: 1.3, detail: 0.05 });
  },

  // plata y niel: filigrana de plata en relieve sobre el negro del niel (hundido y mate)
  plata: () => {
    const c = pixels((u, v) => shade([22, 22, 26], 0.8 + fbm(u, v, 12, 6, 3, 97) * 0.4));
    const ctx = c.getContext('2d');
    const draw = (ctx, hm) => {
      const ring = (x, y, r) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
      };
      const motif = (ox, oy) => {
        const cx = ox + 64;
        const cy = oy + 64;
        for (const [col, w] of hm
          ? [
              [gray(0.7), 5.5],
              [gray(1), 2.6],
            ]
          : [
              ['#6e7178', 5.5],
              ['#e3e6ec', 2.6],
            ]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ring(cx, cy, 60);
          ring(cx, cy, 30);
          for (let k = 0; k < 4; k++) ring(cx + Math.cos((k * Math.PI) / 2) * 30, cy + Math.sin((k * Math.PI) / 2) * 30, 30);
        }
        ctx.fillStyle = hm ? gray(1) : '#f2f4f8';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, TAU);
        ctx.fill();
      };
      wrapped(ctx, () => {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) motif(i * 128, j * 128);
      });
    };
    draw(ctx, false);
    const h = layer((l) => draw(l, true), 0.15);
    const rough = new Float32Array(N);
    const metal = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const s = smooth(0.4, 0.8, h[k]);
      rough[k] = 0.5 - s * 0.32;
      metal[k] = 0.25 + s * 0.75;
    }
    return relief(c, { H: h, R: rough, M: metal, scale: 1.4, ao: 1.4, detail: 0.05 });
  },

  // ---------------- animados (weapons/camos.js los hace moverse) ----------------
  // brasas: carbón con las grietas encendidas (hondas)
  fogon: () =>
    pixels(
      (u, v) => {
        const [d1, d2] = voronoi(u, v, 14, 7, 101, 0.9);
        const crack = 1 - smooth(0, 0.07, d2 - d1);
        const n = fbm(u, v, 6, 3, 4, 102);
        let c = mix([22, 18, 16], [60, 50, 44], n);
        c = mix(c, [255, 120, 30], crack * (0.6 + 0.4 * n));
        c = mix(c, [150, 40, 10], smooth(0.1, 0.0, d1) * 0.6);
        return [...c, 0.75 - crack * 0.7 + (n - 0.5) * 0.3, 0.9];
      },
      { scale: 1.4, ao: 1.3 },
    ),

  // aguas del Iberá: verde agua profundo; los reflejos (hondos) los pone el shader
  ibera: () =>
    pixels(
      (u, v) => {
        const n = fbm(u, v, 4, 2, 4, 111);
        const rip = fbm(u, v, 10, 5, 3, 112);
        return [...mix([6, 40, 52], [22, 100, 112], n), 0.5 + (rip - 0.5) * 0.25, 0.06];
      },
      { scale: 0.6, detail: 0 },
    ),

  // luz mala: barro negro de estero con cruces verdes talladas
  fatuo: () => {
    const c = pixels((u, v) => {
      const n = fbm(u, v, 5, 3, 5, 121);
      const m = fbm(u, v, 2, 1, 3, 122);
      const col = mix([6, 14, 8], [26, 44, 24], n);
      return [...mix(col, [2, 4, 2], smooth(0.5, 0.7, m)), 0.45 + (n - 0.5) * 0.5, 0.55 - m * 0.3];
    });
    const H0 = c.camoRelief.H;
    const ctx = c.getContext('2d');
    const r = rng(123);
    const crosses = [];
    for (let i = 0; i < 14; i++) crosses.push([r() * W, 30 + r() * (H - 60), 7 + r() * 6]);
    const draw = (l) =>
      wrapped(l, () => {
        for (const [x, y, s] of crosses) {
          l.beginPath();
          l.moveTo(x, y - s);
          l.lineTo(x, y + s * 1.3);
          l.moveTo(x - s * 0.7, y);
          l.lineTo(x + s * 0.7, y);
          l.stroke();
        }
      });
    ctx.strokeStyle = 'rgba(120, 255, 150, 0.9)';
    ctx.lineWidth = 2;
    draw(ctx);
    const cut = layer((l) => {
      l.strokeStyle = gray(0);
      l.lineWidth = 3;
      draw(l);
    }, 1);
    for (let k = 0; k < N; k++) H0[k] *= 0.3 + 0.7 * cut[k];
    return relief(c, { ...c.camoRelief, H: H0, scale: 1.3 });
  },

  // mandinga: roca negra y roja partida por venas de fuego hundidas
  mandinga: () =>
    pixels(
      (u, v) => {
        const [d1, d2] = voronoi(u, v, 10, 5, 131, 1);
        const vein = 1 - smooth(0, 0.05, d2 - d1);
        const n = fbm(u, v, 4, 2, 4, 132);
        const c = mix([14, 4, 4], [48, 8, 6], n);
        return [...mix(c, [255, 40, 10], Math.min(1, vein * (0.6 + n))), 0.8 - vein * 0.7 + (n - 0.5) * 0.25 + d1 * 0.1, 0.45 + vein * 0.4];
      },
      { scale: 1.5, ao: 1.4 },
    ),

  // oro de las ánimas: oro labrado, con cruces grabadas
  animas: () => {
    const c = pixels((u, v) => {
      const n = fbm(u, v, 6, 3, 4, 141);
      return [...shade([214, 166, 64], 0.78 + n * 0.35), 0.6 + (n - 0.5) * 0.2, 0.2 + n * 0.1, 1];
    });
    const H0 = c.camoRelief.H;
    const ctx = c.getContext('2d');
    const draw = (l, hm) =>
      wrapped(l, () => {
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 4; j++) {
            const x = 21 + i * 42.67 + (j & 1) * 21;
            const y = 32 + j * 64;
            for (const [col, w, o] of hm
              ? [[gray(0), 3, 0]]
              : [
                  ['rgba(90,50,10,0.85)', 3, 0],
                  ['rgba(255,240,190,0.8)', 1, -1],
                ]) {
              l.strokeStyle = col;
              l.lineWidth = w;
              l.beginPath();
              l.moveTo(x + o, y - 11 + o);
              l.lineTo(x + o, y + 13 + o);
              l.moveTo(x - 7 + o, y - 3 + o);
              l.lineTo(x + 7 + o, y - 3 + o);
              l.stroke();
            }
          }
        }
      });
    draw(ctx, false);
    const cut = layer((l) => draw(l, true), 1);
    for (let k = 0; k < N; k++) H0[k] *= 0.2 + 0.8 * cut[k];
    return relief(c, { ...c.camoRelief, H: H0, scale: 1.4, ao: 1.4, detail: 0.05 });
  },

  // yerba oscura: la materia oscura del mate, con hojitas de yerba que
  // brillan en la superficie (lo de adentro lo pone el shader, en profundidad)
  yerbaoscura: () => {
    const c = pixels((u, v) => {
      const n = fbm(u, v, 4, 2, 5, 151);
      const m = fbm(u, v, 8, 4, 3, 152);
      const col = mix([4, 2, 10], [30, 10, 48], Math.pow(n, 1.6));
      return mix(col, [60, 20, 90], smooth(0.65, 0.9, m) * 0.5);
    });
    const ctx = c.getContext('2d');
    const r = rng(153);
    const flakes = [];
    for (let i = 0; i < 420; i++) flakes.push([r() * W, r() * H, 1 + r() * 2.2, r() * TAU, r() < 0.6 ? '#a8e040' : '#f0f080']);
    const draw = (l, hm) =>
      wrapped(l, () => {
        for (const [x, y, s, a, col] of flakes) {
          l.save();
          l.translate(x, y);
          l.rotate(a);
          l.fillStyle = hm ? gray(1) : col;
          l.fillRect(-s, -s * 0.5, s * 2, s);
          l.restore();
        }
      });
    draw(ctx, false);
    return relief(c, { H: layer((l) => draw(l, true), 0.4), R: 0.12, scale: 0.8, detail: 0 });
  },

  // ---------------- los de prestigio ----------------
  // cruz del sur: cielo de campo con la vía láctea y la cruz, dos veces
  cruzdelsur: () => {
    const c = pixels((u, v) => {
      const n = fbm(u, v, 4, 2, 5, 161);
      const band = Math.exp(-Math.pow(((u + v) % 1) - 0.5, 2) / 0.02);
      let col = mix([4, 8, 26], [14, 24, 62], n);
      col = mix(col, [70, 80, 130], band * n * 0.7);
      return col;
    });
    const ctx = c.getContext('2d');
    const r = rng(162);
    const star = (x, y, s, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.25, `rgba(200,220,255,${a * 0.5})`);
      g.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
    };
    const field = [];
    for (let i = 0; i < 600; i++) field.push([r() * W, r() * H, 0.4 + r() * 0.8, 0.3 + r() * 0.7]);
    wrapped(ctx, () => {
      for (const [x, y, s, a] of field) star(x, y, s, a);
    });
    for (const ox of [128, 384]) {
      for (const [x, y, s] of [
        [0, -44, 3.2],
        [0, 46, 3.6],
        [-30, 4, 2.8],
        [26, -8, 2.4],
        [12, 18, 1.4],
      ])
        star(ox + x, 128 + y, s, 1);
    }
    return relief(c, { H: 0.5, R: 0.15, scale: 0.4, detail: 0 });
  },

  // pampero: nubarrones con rayos pintados (el shader los hace relampaguear)
  pampero: () => {
    const c = pixels(
      (u, v) => {
        const n = fbm(u, v, 3, 2, 6, 171);
        return [...mix([18, 22, 32], [96, 102, 118], Math.pow(n, 1.3)), n * 0.8, 0.7];
      },
      { scale: 0.7 },
    );
    const ctx = c.getContext('2d');
    const r = rng(172);
    const bolts = [];
    const bolt = (x, y, len, w) => {
      const pts = [[x, y]];
      for (let k = 0; k < len; k++) {
        x += (r() - 0.5) * 22;
        y += 7 + r() * 9;
        pts.push([x, y]);
        if (w > 1 && r() < 0.2) bolt(x, y, Math.floor(len * 0.5), w * 0.55);
      }
      bolts.push({ pts, w });
    };
    for (let k = 0; k < 4; k++) bolt(40 + k * 128 + r() * 50, -4, 20, 2.6);
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#9ad8ff';
    wrapped(ctx, () => {
      for (const [col, k, blur] of [
        ['rgba(120,190,255,0.6)', 2.4, 10],
        ['#f0f8ff', 0.8, 4],
      ]) {
        ctx.strokeStyle = col;
        ctx.shadowBlur = blur;
        for (const { pts, w } of bolts) {
          ctx.lineWidth = w * k;
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
      }
    });
    ctx.shadowBlur = 0;
    return c;
  },

  // sol de mayo: oro con soles repujados (rayos rectos y flamígeros) y guilloché
  soldemayo: () => {
    const c = pixels((u, v) => {
      const g = 0.5 + 0.5 * Math.sin((v * 40 + 0.4 * Math.sin(u * 16 * TAU)) * TAU);
      return [...shade([220, 170, 60], 0.72 + g * 0.2 + fbm(u, v, 8, 4, 3, 181) * 0.14), 0.3 + g * 0.2, 0.3, 1];
    });
    const H0 = c.camoRelief.H;
    const ctx = c.getContext('2d');
    const sun = (ctx, cx, cy, hm) => {
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * TAU;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = hm ? gray(0.85) : '#ffe08a';
        ctx.strokeStyle = hm ? gray(0.6) : 'rgba(110,60,10,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (k % 2) {
          ctx.moveTo(20, -3);
          ctx.lineTo(50, 0);
          ctx.lineTo(20, 3);
        } else {
          // flamígero: ondulado
          ctx.moveTo(20, -3);
          for (let s = 0; s <= 8; s++) ctx.lineTo(20 + s * 3.6, Math.sin(s * 1.6) * 3 * (1 - s / 9) - 1);
          for (let s = 8; s >= 0; s--) ctx.lineTo(20 + s * 3.6, Math.sin(s * 1.6) * 3 * (1 - s / 9) + 1);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (hm) {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 19);
        g.addColorStop(0, gray(1));
        g.addColorStop(1, gray(0.8));
        ctx.fillStyle = g;
      } else {
        const g = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 19);
        g.addColorStop(0, '#fff2b0');
        g.addColorStop(1, '#d8962a');
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = hm ? gray(0.55) : 'rgba(110,60,10,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // la cara (hundida)
      ctx.fillStyle = hm ? gray(0.55) : 'rgba(110,60,10,0.9)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * 6, cy - 3, 2.4, 1.4, 0, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy + 4, 6, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx - 1.5, cy + 2);
      ctx.lineTo(cx + 1, cy + 2);
      ctx.stroke();
    };
    wrapped(ctx, () => {
      for (let i = 0; i < 4; i++) sun(ctx, 64 + i * 128, 128, false);
    });
    const suns = layer((l) => {
      wrapped(l, () => {
        for (let i = 0; i < 4; i++) sun(l, 64 + i * 128, 128, true);
      });
    }, 0);
    for (let k = 0; k < N; k++) H0[k] = Math.max(H0[k], suns[k]);
    return relief(c, { ...c.camoRelief, H: H0, scale: 1.5, ao: 1.4, detail: 0.05 });
  },

  // materia matera: negro con polvo de colores (el shader le pone el arcoíris, adentro)
  materia: () => {
    const c = pixels((u, v) => mix([2, 2, 6], [20, 14, 34], fbm(u, v, 4, 2, 5, 191)));
    const ctx = c.getContext('2d');
    const r = rng(192);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 500; i++) {
      ctx.globalAlpha = 0.3 + r() * 0.7;
      ctx.fillRect(r() * W, r() * H, 1.3, 1.3);
    }
    ctx.globalAlpha = 1;
    return relief(c, { H: 0.5, R: 0.1, scale: 0.3, detail: 0 });
  },

  // diamante criollo: facetas de cristal, cada una un plano con su inclinación
  diamante: () =>
    pixels(
      (u, v) => {
        const f = facet(u, v, 12, 6, 201, 1.4);
        const tint = hash(Math.floor(f.id * 1000), 0, 202);
        // (con la laca y el reflejo ya brilla: el cristal en sí, más oscuro y
        // con color, así se leen las facetas)
        let c = mix([45, 60, 105], [220, 232, 250], 0.15 + f.id * 0.8);
        c = mix(c, tint < 0.5 ? [150, 115, 255] : [105, 205, 255], 0.3);
        return [...shade(c, 0.65 + 0.35 * f.edge), f.h - (1 - f.edge) * 0.2, 0.03 + (1 - f.edge) * 0.3];
      },
      { scale: 1.8, detail: 0 },
    ),
};

// ---------------- los del Pack-a-Pava de cada mapa ----------------
export const PAINT_PAP = {
  // La Tapera: hojas del yerbal (abombadas) con la vena de oro (hundida)
  granja: () => {
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e1c0a';
    ctx.fillRect(0, 0, W, H);
    const r = rng(301);
    const cols = ['#1f3a12', '#2c5018', '#3d6a20', '#264a14'];
    const leaves = [];
    for (let i = 0; i < 420; i++) leaves.push([r() * W, r() * H, 10 + r() * 12, 4 + r() * 4, r() * TAU, cols[Math.floor(r() * cols.length)], 0.4 + (i / 420) * 0.5]);
    const draw = (ctx, hm) =>
      wrapped(ctx, () => {
        for (const [x, y, l, w, a, col, h] of leaves) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(-l, 0);
          ctx.quadraticCurveTo(0, -w * 1.4, l, 0);
          ctx.quadraticCurveTo(0, w * 1.4, -l, 0);
          ctx.fillStyle = hm ? gray(h) : col;
          ctx.fill();
          ctx.strokeStyle = hm ? gray(h - 0.2) : 'rgba(240,190,50,0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-l * 0.9, 0);
          ctx.lineTo(l * 0.9, 0);
          ctx.stroke();
          ctx.restore();
        }
      });
    draw(ctx, false);
    const veins = layer((l) => {
      wrapped(l, () => {
        for (const [x, y, len, , a] of leaves) {
          l.save();
          l.translate(x, y);
          l.rotate(a);
          l.strokeStyle = gray(1);
          l.lineWidth = 1;
          l.beginPath();
          l.moveTo(-len * 0.9, 0);
          l.lineTo(len * 0.9, 0);
          l.stroke();
          l.restore();
        }
      });
    }, 0);
    return relief(c, { H: layer((l) => draw(l, true), 0.1), R: 0.5, M: veins, scale: 1.3, detail: 0.05 });
  },
  // el penal: piedra de pizarra, juntas hondas y cruces talladas
  penal: () => {
    const c = pixels(
      (u, v) => {
        const [d1, d2] = voronoi(u, v, 8, 4, 311, 0.9);
        const joint = smooth(0, 0.05, d2 - d1);
        const n = fbm(u, v, 6, 3, 4, 312);
        return [...shade(mix([28, 34, 44], [70, 80, 96], n), 0.55 + 0.45 * joint), 0.15 + joint * 0.6 + n * 0.2 + d1 * 0.05, 0.75];
      },
      { scale: 1.4, ao: 1.5 },
    );
    const H0 = c.camoRelief.H;
    const ctx = c.getContext('2d');
    const draw = (l) =>
      wrapped(l, () => {
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 3; j++) {
            const x = 32 + i * 64 + (j & 1) * 32;
            const y = 44 + j * 84;
            l.beginPath();
            l.moveTo(x, y - 10);
            l.lineTo(x, y + 14);
            l.moveTo(x - 7, y - 2);
            l.lineTo(x + 7, y - 2);
            l.stroke();
          }
        }
      });
    ctx.strokeStyle = 'rgba(127, 232, 255, 0.9)';
    ctx.lineWidth = 2;
    draw(ctx);
    const cut = layer((l) => {
      l.strokeStyle = gray(0);
      l.lineWidth = 3;
      draw(l);
    }, 1);
    for (let k = 0; k < N; k++) H0[k] *= 0.3 + 0.7 * cut[k];
    return c;
  },
  // la torre: una galaxia con dos brazos que se enroscan alrededor del mate
  torre: () => {
    const c = pixels((u, v) => {
      const ph = u * 2 + v + 0.06 * Math.sin((u * 3 + v * 2) * TAU);
      const f = ph - Math.floor(ph);
      const arm = Math.exp(-((f - 0.5) ** 2) / 0.02);
      const core = arm ** 7;
      const dust = 0.12 * (0.5 + 0.5 * Math.sin((u * 8 - v * 5) * TAU));
      return [10 + 120 * arm + 190 * core + 20 * dust, 5 + 25 * arm + 120 * core + 6 * dust, 18 + 170 * arm + 10 * core + 30 * dust, 0.5, 0.15, 0.3];
    });
    const ctx = c.getContext('2d');
    const r = rng(321);
    ctx.fillStyle = '#f4ecff';
    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.4 + r() * 0.6;
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, r() < 0.15 ? 1.4 : 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  },
  // el castillo: hielo de glaciar en facetas con chakanas de oro en relieve
  castillo: () => {
    const c = pixels((u, v) => {
      const f = facet(u, v, 10, 5, 331, 0.7);
      const n = fbm(u, v, 4, 2, 4, 332);
      // (hielo de glaciar, no blanco: si no, con la luz del mapa se quemaba)
      return [...shade(mix([40, 84, 128], [128, 176, 214], n), 0.75 + 0.25 * f.edge + f.d1 * 0.1), f.h * 0.6 + 0.1, 0.08];
    });
    const H0 = c.camoRelief.H;
    const ctx = c.getContext('2d');
    // la chakana: la cruz escalonada andina (el contorno)
    const S = [
      [-1, -3],
      [1, -3],
      [1, -2],
      [2, -2],
      [2, -1],
      [3, -1],
      [3, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 3],
      [-1, 3],
      [-1, 2],
      [-2, 2],
      [-2, 1],
      [-3, 1],
      [-3, -1],
      [-2, -1],
      [-2, -2],
      [-1, -2],
    ];
    const draw = (l, passes) =>
      wrapped(l, () => {
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 2; j++) {
            const cx = 42 + i * 85.33 + (j & 1) * 42;
            const cy = 64 + j * 128;
            for (const [col, w] of passes) {
              l.strokeStyle = col;
              l.lineWidth = w;
              l.beginPath();
              S.forEach(([x, y], k) => (k ? l.lineTo(cx + x * 7, cy + y * 7) : l.moveTo(cx + x * 7, cy + y * 7)));
              l.closePath();
              l.stroke();
              l.beginPath();
              l.arc(cx, cy, 5, 0, TAU);
              l.stroke();
            }
          }
        }
      });
    draw(ctx, [
      ['rgba(90,60,10,0.8)', 4],
      ['#ffcc40', 2],
    ]);
    const runes = layer((l) => draw(l, [[gray(1), 3]]), 0);
    const rough = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      H0[k] = Math.max(H0[k], runes[k]);
      rough[k] = 0.08 + runes[k] * 0.2;
    }
    return relief(c, { H: H0, R: rough, M: runes, scale: 1.3, detail: 0.05 });
  },
  // los esteros: cintas coloradas al viento (con sus pliegues) y el filete de oro
  esteros: () =>
    pixels(
      (u, v) => {
        const s = v * 5 + 0.08 * Math.sin(u * 4 * TAU) + 0.03 * Math.sin(u * 11 * TAU);
        const f = s - Math.floor(s);
        const k = Math.sin(f * Math.PI);
        let c = mix([110, 6, 10], [236, 44, 32], Math.pow(k, 0.7));
        const gold = f < 0.04 || f > 0.96;
        if (gold) c = [240, 190, 70];
        return [...shade(c, 0.9 + fbm(u, v, 32, 16, 2, 341) * 0.18), gold ? 0.35 : 0.15 + k * 0.8, gold ? 0.25 : 0.38, gold ? 1 : 0];
      },
      { scale: 1.3 },
    ),
  // el Monumento: franjas celestes y blancas que flamean, con soles de oro de
  // 32 rayos (rectos y flamígeros) y un borde de llama votiva en las juntas
  monumento: () =>
    pixels(
      (u, v) => {
        const s = v * 3 + 0.07 * Math.sin(u * 3 * TAU + v * 2) + 0.025 * Math.sin(u * 11 * TAU);
        const band = ((Math.floor(s) % 3) + 3) % 3;
        const f = s - Math.floor(s);
        const shine = Math.pow(Math.sin(f * Math.PI), 0.5);
        let c = band === 1 ? mix([214, 220, 228], [250, 250, 246], shine) : mix([60, 120, 180], [130, 190, 238], shine);
        // la junta entre franjas: un hilo de llama
        const edge = f < 0.035 || f > 0.965;
        if (edge) c = [255, 170, 60];
        // los soles: en una grilla corrida, en la franja blanca
        const gu = u * 6 + (Math.floor(v * 3) % 2) * 0.5;
        const gv = v * 3;
        const cu = gu - Math.floor(gu) - 0.5;
        const cv = gv - Math.floor(gv) - 0.5;
        const r = Math.hypot(cu, cv * 0.5);
        const a = Math.atan2(cv, cu);
        const ray = Math.abs(Math.sin(a * 16));
        let gold = 0;
        if (band === 1 && r < 0.11) gold = 1;
        else if (band === 1 && r < 0.2 && ray > 0.55 + (r - 0.11) * 3) gold = 0.8;
        if (gold) c = mix(c, [246, 186, 30], gold);
        const n = fbm(u, v, 32, 16, 2, 1812) * 0.14;
        return [...shade(c, 0.92 + n), gold ? 0.75 : edge ? 0.6 : 0.25 + shine * 0.3, gold ? 0.22 : 0.32, gold ? 1 : edge ? 0.4 : 0.05];
      },
      { scale: 1.2 },
    ),
};
