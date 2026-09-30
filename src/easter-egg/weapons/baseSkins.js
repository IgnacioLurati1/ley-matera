import * as THREE from 'three';
import { fbm, hash } from './camoPaint';

// Las caras de los mates de siempre (sin camuflaje), al día con el resto del
// juego: relieve (normal map), brillo que cambia por partes (roughness map) y
// oclusión en lo hondo (aoMap), todo pintado acá, sin descargar nada.
//  · La calabaza: repintada, con las fibras de arriba abajo, los poros, las
//    partes curadas más oscuras y lisas (de tanto agarrarla) y algún raspón.
//  · La madera y el cuero: el relieve sale de su propia textura (las vetas y
//    el graneado quedan hundidos donde son oscuros).
//  · Los metales (virolas, bombillas, latas, cuchillos): cepillado fino a lo
//    largo, y manchas de dedos y rayones que cambian el brillo.
//  · Plástico y silicona: la piel de naranja del molde y los raspones.
//  · Loza: el esmalte con el craquelado. Asta y hueso: los anillos de
//    crecimiento. Vidrio: las huellas.
// La rugosidad va relativa (el mapa la multiplica: ~0,8 en promedio, de 0,55
// lo lustrado a 1 lo manchado), así cada material conserva la suya.
// La llama viewmodels.mats() una sola vez (los lienzos quedan cacheados).

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// cresta de un ruido: 1 en las líneas donde cruza el medio (grietas, rayas)
const ridge = (n) => 1 - Math.abs(2 * n - 1);

// Rayones: segmentos rectos y cortos, al azar (con semilla), en uv. `ang`:
// hacia dónde van (en radianes) y cuánto se abren. Devuelve f(u, v) → 0-1
// (1 sobre el rayón), con la vuelta en u.
function scratches(seed, n, { len = [0.03, 0.12], ang = [0, Math.PI], width = 0.0025 } = {}) {
  const S = [];
  for (let i = 0; i < n; i++) {
    const cx = hash(i, 1, seed);
    const cy = hash(i, 2, seed);
    const a = ang[0] + (hash(i, 3, seed) - 0.5) * ang[1];
    const l = len[0] + hash(i, 4, seed) * (len[1] - len[0]);
    const dx = Math.cos(a) * l * 0.5;
    const dy = Math.sin(a) * l * 0.5;
    S.push({ x0: cx - dx, y0: cy - dy, x1: cx + dx, y1: cy + dy, w: width * (0.6 + hash(i, 5, seed) * 0.8), k: 0.5 + hash(i, 6, seed) * 0.5 });
  }
  return (u, v) => {
    let best = 0;
    for (const q of S) {
      for (const off of [-1, 0, 1]) {
        const x = u + off;
        if (x < Math.min(q.x0, q.x1) - q.w || x > Math.max(q.x0, q.x1) + q.w || v < Math.min(q.y0, q.y1) - q.w || v > Math.max(q.y0, q.y1) + q.w) continue;
        const ex = q.x1 - q.x0;
        const ey = q.y1 - q.y0;
        const t = clamp(((x - q.x0) * ex + (v - q.y0) * ey) / (ex * ex + ey * ey));
        const d = Math.hypot(x - q.x0 - ex * t, v - q.y0 - ey * t);
        if (d < q.w) best = Math.max(best, (1 - d / q.w) * q.k);
      }
    }
    return best;
  };
}

// Pinta un juego: fn(u, v, x, y) → { c: [r, g, b] (0-255, opcional), h (alto
// 0-1), r (rugosidad relativa) }. Devuelve { map, normal, orm }.
function bakeSet(w, h, fn, { color = false, scale = 1, ao = 1 } = {}) {
  const n = w * h;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  let canvas = null;
  let img = null;
  if (color) {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    img = canvas.getContext('2d').createImageData(w, h);
  }
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const o = fn((x + 0.5) / w, (y + 0.5) / h, x, y);
      H[i] = o.h;
      R[i] = o.r;
      if (img) {
        const j = i * 4;
        img.data[j] = clamp(o.c[0], 0, 255);
        img.data[j + 1] = clamp(o.c[1], 0, 255);
        img.data[j + 2] = clamp(o.c[2], 0, 255);
        img.data[j + 3] = 255;
      }
    }
  }
  if (img) canvas.getContext('2d').putImageData(img, 0, 0);
  return finish(H, R, w, h, { scale, ao, canvas });
}

// El relieve a partir de una textura que ya existe (su luminancia: lo oscuro, hondo).
function fromMap(tex, fn, opts = {}) {
  const src = tex?.image;
  if (!src?.getContext) return null;
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  return bakeSet(w, h, (u, v, x, y) => {
    const j = (y * w + x) * 4;
    const L = (d[j] * 0.2126 + d[j + 1] * 0.7152 + d[j + 2] * 0.0722) / 255;
    return fn(u, v, L);
  }, opts);
}

function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + ((i + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * k;
      s += src[o + ((x + r + 1) % w)] - src[o + ((x - r + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[((i + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * k;
      s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x];
    }
  }
  return out;
}

// Normal (Sobel con vuelta), y oclusión (lo más hondo que lo de alrededor) +
// rugosidad en una sola textura (rojo y verde, como las leen aoMap y roughnessMap).
// El lienzo va de arriba hacia abajo y la textura sube en v: la fila y del
// lienzo es la fila h-1-y de los datos (como weapons/camos.js).
function finish(H, R, w, h, { scale, ao, canvas }) {
  const n = w * h;
  const nd = new Uint8Array(n * 4);
  const od = new Uint8Array(n * 4);
  const k = (6 * scale) / 8;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (H[i] < lo) lo = H[i];
    if (H[i] > hi) hi = H[i];
  }
  const B = blur(H, w, h, 3);
  const kao = ao / (hi - lo || 1);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w;
    const y0 = y * w;
    const yp = ((y + 1) % h) * w;
    let j = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, j += 4) {
      const xm = x > 0 ? x - 1 : w - 1;
      const xp = x < w - 1 ? x + 1 : 0;
      const dx = H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp] - (H[ym + xm] + 2 * H[y0 + xm] + H[yp + xm]);
      const dy = H[yp + xm] + 2 * H[yp + x] + H[yp + xp] - (H[ym + xm] + 2 * H[ym + x] + H[ym + xp]);
      const nx = -dx * k;
      const ny = dy * k;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nd[j] = (nx * l + 1) * 127.5 + 0.5;
      nd[j + 1] = (ny * l + 1) * 127.5 + 0.5;
      nd[j + 2] = (l + 1) * 127.5 + 0.5;
      nd[j + 3] = 255;
      const i = y0 + x;
      od[j] = (1 - Math.min(0.6, Math.max(0, B[i] - H[i]) * kao)) * 255 + 0.5;
      od[j + 1] = clamp(R[i], 0.05, 1) * 255 + 0.5;
      od[j + 2] = 0;
      od[j + 3] = 255;
    }
  }
  const data = (arr) => {
    const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  let map = null;
  if (canvas) {
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
  }
  return { map, normal: data(nd), orm: data(od) };
}

// ---------------- los juegos ----------------
// Calabaza curada (u da la vuelta, v de la boca al pie).
function gourd() {
  const PORE = { cx: 150, cy: 64 };
  const gScr = scratches(14, 26, { len: [0.02, 0.07], ang: [0.4, 1.4], width: 0.004 });
  return bakeSet(
    512,
    256,
    (u, v) => {
      const base = fbm(u, v, 6, 3, 4, 11);
      // fibras de arriba abajo (cambian rápido a lo ancho)
      const fib = fbm(u, v, 110, 3, 3, 12);
      // las partes curadas: más oscuras, rojizas y lisas
      const patch = smooth(0.52, 0.72, fbm(u, v, 4, 2, 4, 13));
      // la parte de abajo, lustrada de tanto agarrarla
      const grip = smooth(0.45, 0.95, v);
      // los poros: un puntito en algunas celdas
      const px = u * PORE.cx;
      const py = v * PORE.cy;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      let pore = 0;
      if (hash(cx % PORE.cx, cy, 17) < 0.13) {
        const ox = cx + 0.25 + hash(cx, cy, 18) * 0.5;
        const oy = cy + 0.25 + hash(cx, cy, 19) * 0.5;
        const d = Math.hypot((px - ox) * 1.1, py - oy);
        pore = 1 - smooth(0.08, 0.26, d);
      }
      // raspones finitos
      const scr = gScr(u, v);
      const tone = 0.86 + base * 0.26 + (fib - 0.5) * 0.14;
      let r = 150 * tone;
      let g = 106 * tone;
      let b = 56 * tone;
      r *= 1 - patch * 0.3;
      g *= 1 - patch * 0.38;
      b *= 1 - patch * 0.46;
      r *= 1 - pore * 0.3;
      g *= 1 - pore * 0.34;
      b *= 1 - pore * 0.34;
      r += scr * 38;
      g += scr * 30;
      b += scr * 20;
      return {
        c: [r, g, b],
        h: 0.5 + (base - 0.5) * 0.5 + (fib - 0.5) * 0.3 - pore * 0.34 - scr * 0.12,
        r: 0.86 - patch * 0.16 - grip * 0.12 + pore * 0.14 + (fib - 0.5) * 0.08,
      };
    },
    { color: true, scale: 1.3, ao: 1 },
  );
}

// Metal cepillado: rayitas a lo largo (v), manchas de dedos y algún rayón.
function brushed() {
  const scr = scratches(23, 40, { len: [0.03, 0.14], ang: [0.2, 1.2], width: 0.0035 });
  return bakeSet(256, 256, (u, v) => {
    const line = fbm(u, v, 160, 3, 3, 21);
    const smudge = smooth(0.5, 0.78, fbm(u, v, 3, 3, 4, 22));
    const sc = scr(u, v);
    return { h: line * 0.45 - sc * 0.3, r: 0.68 + (line - 0.5) * 0.14 + smudge * 0.3 + sc * 0.12 };
  }, { scale: 0.9, ao: 0 });
}

// Plástico de molde: piel de naranja y raspones.
function plastic() {
  const scr = scratches(33, 22, { len: [0.02, 0.09], ang: [0.3, 2], width: 0.003 });
  return bakeSet(256, 256, (u, v) => {
    const peel = fbm(u, v, 64, 64, 2, 31);
    const scuff = smooth(0.55, 0.8, fbm(u, v, 5, 5, 4, 32));
    const sc = scr(u, v);
    return { h: peel * 0.18 - sc * 0.25, r: 0.72 + (peel - 0.5) * 0.08 + scuff * 0.24 + sc * 0.15 };
  }, { scale: 0.9, ao: 0.3 });
}

// Loza esmaltada con el craquelado (el color también: las grietas se tiñen).
function ceramic() {
  return bakeSet(256, 256, (u, v) => {
    const crack = Math.max(smooth(0.955, 0.99, ridge(fbm(u, v, 7, 7, 3, 41))), smooth(0.97, 0.995, ridge(fbm(u, v, 15, 15, 2, 42))) * 0.7);
    const wave = fbm(u, v, 5, 5, 3, 43);
    const k = 255 * (1 - crack * 0.22);
    return { c: [k, k * 0.98, k * 0.95], h: wave * 0.25 - crack * 0.5, r: 0.7 + (wave - 0.5) * 0.15 + crack * 0.3 };
  }, { color: true, scale: 1, ao: 0.6 });
}

// Asta y hueso: anillos de crecimiento y las fibras a lo largo.
function horn() {
  return bakeSet(256, 256, (u, v) => {
    const warp = fbm(u, v, 3, 3, 3, 51);
    const ring = 0.5 + 0.5 * Math.sin((v * 22 + warp * 3) * Math.PI * 2);
    const fib = fbm(u, v, 90, 4, 3, 52);
    return { h: ring * 0.35 + fib * 0.25, r: 0.72 + (1 - ring) * 0.14 + (fib - 0.5) * 0.1 };
  }, { scale: 1, ao: 0.5 });
}

// Vidrio: casi liso, con unas huellas de dedos (anillos finitos en manchas ovaladas).
function glass() {
  const prints = [[0.2, 0.62], [0.37, 0.72], [0.63, 0.35], [0.82, 0.58]];
  return bakeSet(256, 256, (u, v) => {
    let f = 0;
    for (const [cx, cy] of prints) {
      const dx = Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx)) * 2.2;
      const dy = (v - cy) * 1.4;
      const d = Math.hypot(dx, dy);
      if (d < 0.12) f = Math.max(f, (1 - smooth(0.06, 0.12, d)) * (0.55 + 0.45 * Math.sin(d * 420)));
    }
    const wave = fbm(u, v, 4, 4, 3, 61);
    return { h: wave * 0.4, r: 0.18 + f * 0.8 };
  }, { scale: 0.5, ao: 0 });
}

// ---------------- a los materiales ----------------
let SETS = null;
function sets(T) {
  if (SETS) return SETS;
  SETS = {
    gourd: gourd(),
    brushed: brushed(),
    plastic: plastic(),
    ceramic: ceramic(),
    horn: horn(),
    glass: glass(),
    // la madera tallada y el cuero: el relieve de su propia textura
    wood: fromMap(T.woodCarved, (u, v, L) => {
      const grain = fbm(u, v, 6, 70, 3, 71);
      return { h: L * 0.8 + grain * 0.25, r: 0.7 + (1 - L) * 0.25 + (grain - 0.5) * 0.1 };
    }, { scale: 1.4, ao: 0.8 }),
    leather: fromMap(T.leather, (u, v, L) => {
      const peb = fbm(u, v, 40, 40, 3, 81);
      const crease = smooth(0.96, 0.99, ridge(fbm(u, v, 6, 9, 3, 82)));
      return { h: L * 0.5 + peb * 0.4 - crease * 0.4, r: 0.75 + (peb - 0.5) * 0.2 + crease * 0.15 };
    }, { scale: 1.5, ao: 0.8 }),
  };
  return SETS;
}

// El juego S al material m: normal, oclusión y rugosidad (relativa: se sube
// la del material para que el promedio del mapa, ~0,8, deje la misma).
function wear(m, S, { normal = 1, map = false, aoK = 0.8, rough = true } = {}) {
  if (!m || !S) return;
  if (map && S.map) m.map = S.map;
  m.normalMap = S.normal;
  m.normalScale = new THREE.Vector2(normal, normal);
  if (aoK > 0) {
    m.aoMap = S.orm;
    m.aoMapIntensity = aoK;
  }
  if (rough) {
    m.roughnessMap = S.orm;
    m.roughness = Math.min(1, m.roughness / 0.8);
  }
  m.needsUpdate = true;
}

export function upgradeBaseMats(M, T) {
  const S = sets(T);
  // las calabazas (también las teñidas: la del Mark III, la de la Salamanca...)
  for (const k of ['gourd', 'gourdDark', 'gourdPale', 'gourdLuz', 'gourdEterna', 'hornBlack']) wear(M[k], S.gourd, { normal: 0.9, map: true });
  for (const k of ['wood', 'woodDark']) wear(M[k], S.wood, { normal: 0.9 });
  wear(M.leather, S.leather, { normal: 0.9 });
  for (const k of ['silver', 'silverDark', 'aluminium', 'steel', 'bronze', 'gold', 'copper', 'ironOld', 'dark', 'blade', 'bladeDark', 'red', 'termo']) wear(M[k], S.brushed, { normal: 0.35, aoK: 0 });
  for (const k of ['plastic', 'plasticWhite', 'silicone', 'lemon']) wear(M[k], S.plastic, { normal: 0.25, aoK: 0.3 });
  wear(M.ceramic, S.ceramic, { normal: 0.45, map: true, aoK: 0.6 });
  for (const k of ['horn', 'hornDark', 'bone']) wear(M[k], S.horn, { normal: 0.55 });
  wear(M.glass, S.glass, { normal: 0.12, aoK: 0 });
  if (M.glass) M.glass.roughness = 0.3;
}
