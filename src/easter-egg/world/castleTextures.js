import * as THREE from 'three';
import { makeNoise, rng } from '../core/noise';
import { toTexture } from '../core/textures';
import { pavedSnow } from './castleWeathering';

// Texturas del castillo del Mateendrache (se pintan recién cuando se arma ese
// mapa): la sillería de granito, la nieve, las lajas de los salones, el hielo
// de la gruta, la roca de la cueva y la pizarra de los techos. Las paredes
// repiten cada 2 m de ancho y 3,6 m de alto (GeoBuilder.wall); los pisos, cada 2 m.

const N = makeNoise(611);
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Ruido que repite justo en los S px de la textura: la escala (`px`, cuántos
// pixeles mide una celda) se redondea para que entren períodos enteros; si no,
// queda una costura en cada borde (y el relieve la marca todavía más).
const per = (S, px) => Math.max(1, Math.round(S / px));
const fbmS = (S, x, y, px, oct, off = 0) => {
  const k = per(S, px);
  return N.fbm((x * k) / S + off, (y * k) / S, oct, k);
};
const noiseS = (S, x, y, px, off = 0) => {
  const k = per(S, px);
  return N.noise((x * k) / S + off, (y * k) / S, k);
};

function paint(w, h, fn) {
  const c = document.createElement('canvas');
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

// Cada textura trae su relieve (`c.relief`, lo usa fx/Surfaces para el mapa de
// normales desde Media para arriba): la altura de cada pixel sacada del mismo
// dibujo (no del brillo), así las juntas y los cantos quedan donde tienen que
// estar. En la piedra, las lajas, el revoque y la roca va en px de textura
// (256 px = 1 m: una junta de 2 cm son 5 px) y sale con su pendiente de verdad;
// la nieve, el hielo y la pizarra van de 0 a 1 con `scale` (son más lisos). Se
// llena al pintar con lo que ya se calculó para el color (sin ruido de más); el
// grano fino lo suma Surfaces con `detail`. `depth` (metros, parallax de cerca
// en Ultra y Épica) va en las que tienen juntas hondas; `ao`/`aoBlur`, cuánto
// oscurece lo hundido con la luz ambiente; `rough` (rugosidad por pixel) solo
// donde brilla distinto: el hielo liso y sus grietas, la laja y su junta, la nieve.

// Sillería: hiladas de bloques grandes de granito gris, cada uno con su tono,
// juntas hundidas y el canto gastado. `rows` hiladas en los 3,6 m de la textura.
function ashlar({ seed, base = 0x86878a, rows = 4, frost = 0 }) {
  const S = 512;
  const rh = S / rows;
  const r = rng(seed);
  // cada hilada: dos o tres bloques que suman justo el ancho (así repite sin
  // costura), corrida al azar para que las juntas no queden en fila. La
  // textura mide 2 m: 256 px por metro de ancho; 0,9 m de alto por hilada.
  const rowsOff = [];
  const blocks = [];
  for (let j = 0; j < rows; j++) {
    rowsOff.push(Math.floor(r() * S));
    const k = r() < 0.35 ? 3 : 2;
    const wts = Array.from({ length: k }, () => 0.75 + r() * 0.5);
    const sum = wts.reduce((a, b) => a + b, 0);
    const list = [];
    let x = 0;
    for (let i = 0; i < k; i++) {
      const x1 = i === k - 1 ? S : Math.round(x + (wts[i] / sum) * S);
      // tono, veta y cómo quedó asentada la cara (inclinada o abombada)
      list.push({ x0: x, x1, t: 0.84 + r() * 0.24, hue: r(), tx: r() * 2 - 1, ty: r() * 2 - 1, bulge: 0.5 + r() * 0.6 });
      x = x1;
    }
    blocks.push(list);
  }
  const at = (x, y) => {
    const j = Math.floor(y / rh);
    const ly = y - j * rh;
    const xx = (x + rowsOff[j]) % S;
    let blk = blocks[j][0];
    for (const q of blocks[j]) if (xx >= q.x0) blk = q;
    const lx = xx - blk.x0;
    const e = Math.min(lx, blk.x1 - blk.x0 - lx, ly, rh - ly);
    const wob = noiseS(S, x, y, 9, 50) * 3;
    return { ly, lx, blk, e, wob };
  };
  const b = hex(base);
  const warm = [128, 124, 116];
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { ly, lx, blk, e, wob } = at(x, y);
    const n = fbmS(S, x, y, 22, 4, seed);
    const grain = noiseS(S, x, y, 2.2, seed * 3);
    // los golpes en el canto: saltaduras de piedra fresca, más clara
    const chip = e < 12 && noiseS(S, x, y, 8, seed * 5) > 0.66;
    H[y * S + x] = ashlarH(ly, lx, blk, e, wob, n, rh, chip) + (grain - 0.5) * 0.4;
    let col = mix(b, warm, blk.hue * 0.35);
    col = shade(col, blk.t * (0.7 + n * 0.5 + (grain - 0.5) * 0.18));
    // el canto de cada bloque: gastado y un poco más oscuro; la junta, hundida
    if (e < 2.2 + wob * 0.5) col = shade([88, 86, 84], 0.8 + n * 0.25);
    else if (chip) col = shade(col, 1.12);
    else if (e < 7 + wob) col = shade(col, 0.86 + (e - 2.2) * 0.025);
    // liquen amarillento y manchas de humedad
    const l = fbmS(S, x, y, 30, 3, 200);
    if (l > 0.64) col = mix(col, [150, 146, 96], Math.min(0.4, (l - 0.64) * 2.2));
    // escarcha: blanca abajo y en las juntas de arriba de cada bloque
    if (frost) {
      const f = fbmS(S, x, y, 16, 3, 90);
      const top = ly < 12 ? (12 - ly) / 12 : 0;
      const k = Math.min(1, frost * (top * 0.8 + Math.max(0, f - 0.55) * 1.6));
      col = mix(col, [226, 234, 242], k);
      // la escarcha rellena lo hundido
      H[y * S + x] += k * Math.max(0, 1.5 - H[y * S + x]) * 0.7;
    }
    return col;
  });
  c.relief = { H, detail: 0.2, depth: 0.035, ao: 1.3, aoBlur: 5 };
  return c;
}
// en px de textura (256 por metro)
function ashlarH(ly, lx, blk, e, wob, n, rh, chip) {
  const jw = 2.2 + wob * 0.5;
  // la junta: el mortero 2 cm más adentro
  if (e < jw) return -3 + wob * 0.3;
  // la cara: labrada a maza, inclinada y abombada distinto en cada bloque
  const u = lx / (blk.x1 - blk.x0) - 0.5;
  const v = ly / rh - 0.5;
  let h = 2 + 1.6 * (u * blk.tx + v * blk.ty) - 3 * blk.bulge * (u * u + v * v) + (n - 0.5) * 3;
  // el canto redondeado por siglos de viento (más o menos según el bloque)
  const wear = 3 + n * 6;
  const t = e - jw;
  if (t < wear) h -= (1 - t / wear) ** 2 * 2.5;
  if (chip) h -= 2;
  return h;
}

// Nieve: casi blanca y apenas azulada, con ondas del viento, huellas
// borroneadas y puntitos que brillan.
function snowTex({ seed }) {
  const S = 512;
  const r = rng(seed);
  const sparkles = new Set();
  for (let i = 0; i < 900; i++) sparkles.add(Math.floor(r() * S) + Math.floor(r() * S) * S);
  const at = (x, y) => {
    const n = fbmS(S, x, y, 60, 5, seed);
    // las ondas del viento (una dirección con números enteros: repite justo)
    const ripple = Math.sin(((7 * x + 3 * y) / S) * Math.PI * 2 + n * 6) * 0.5 + 0.5;
    // pozos de huellas viejas
    const p = fbmS(S, x, y, 14, 3, 400);
    return { n, ripple, p };
  };
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { n, ripple, p } = at(x, y);
    H[y * S + x] = 0.45 + n * 0.3 + ripple * 0.18 - smooth(0.6, 0.78, p) * 0.3;
    // la costra que alisa el viento brilla un poco; lo pisado, nada
    Rg[y * S + x] = 0.6 + (1 - ripple) * 0.1 + n * 0.06 + smooth(0.6, 0.78, p) * 0.14;
    const fine = noiseS(S, x, y, 3, seed);
    let v = 0.84 + n * 0.14 + ripple * 0.075 + (fine - 0.5) * 0.05;
    if (p > 0.64) v -= (p - 0.64) * 0.8;
    let col = [clamp(212 * v), clamp(224 * v), clamp(240 * v)];
    if (sparkles.has(x + y * S)) col = [255, 255, 255];
    return col;
  });
  c.relief = { H, scale: 0.5, detail: 0, rough: Rg };
  return c;
}

// Lajas: piedras chatas irregulares (Voronoi) con juntas de tierra.
function flagstones({ seed, base = 0x8a8278 }) {
  const S = 512;
  const r = rng(seed);
  // un punto por casilla de una grilla de 5x5, corrido al azar; cada pixel
  // mira solo las 9 casillas de alrededor (y se repite en los bordes: sin costura)
  const G = 5;
  const C = S / G;
  const pts = [];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const a = r() * Math.PI * 2;
      pts.push([(i + 0.2 + r() * 0.6) * C, (j + 0.2 + r() * 0.6) * C, 0.75 + r() * 0.35, Math.cos(a), Math.sin(a), 0.3 + r() * 0.7]);
    }
  }
  const at = (x, y) => {
    let d1 = Infinity;
    let d2 = Infinity;
    let best = null;
    let cx = 0;
    let cy = 0;
    const ci = Math.floor(x / C);
    const cj = Math.floor(y / C);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        const p = pts[((j + G) % G) * G + ((i + G) % G)];
        const px = p[0] + Math.floor(i / G) * S;
        const py = p[1] + Math.floor(j / G) * S;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = p;
          cx = px;
          cy = py;
        } else if (d < d2) d2 = d;
      }
    }
    return { edge: Math.sqrt(d2) - Math.sqrt(d1), p: best, dx: (x - cx) / C, dy: (y - cy) / C };
  };
  const b = hex(base);
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { edge, p, dx, dy } = at(x, y);
    const n = fbmS(S, x, y, 26, 4, seed);
    // cada laja asentada un poco torcida y gastada al medio; las juntas de
    // tierra, 1 cm abajo (en px de textura)
    const t = Math.min(1, Math.max(0, (edge - 4) / 8));
    const face = 1.5 + 1.2 * (dx * p[3] + dy * p[4]) * p[5] + (n - 0.5) * 2;
    H[y * S + x] = edge < 4 ? -2.5 : face - (1 - t) * (1 - t) * (face + 1);
    // la laja gastada por los pasos brilla apenas; la junta de tierra, nada
    Rg[y * S + x] = edge < 5 ? 0.95 : 0.64 + (1 - n) * 0.12 + (1 - t) * 0.1;
    let col = shade(b, p[2] * (0.72 + n * 0.42));
    if (edge < 5) col = shade([58, 52, 46], 0.7 + n * 0.4);
    else if (edge < 10) col = shade(col, 0.82);
    return col;
  });
  c.relief = { H, detail: 0.25, depth: 0.02, rough: Rg, ao: 1.3, aoBlur: 4 };
  return c;
}

// Hielo de glaciar: azul profundo con vetas blancas, burbujas y grietas.
function iceTex({ seed }) {
  const S = 512;
  const at = (x, y) => {
    const n = fbmS(S, x, y, 128, 4, seed);
    // las capas del glaciar: siete por textura, bien onduladas
    const band = Math.sin((y / S) * Math.PI * 2 * 7 + n * 7) * 0.5 + 0.5;
    const crack = Math.abs(fbmS(S, x, y, 64, 3, 90) - 0.5);
    return { n, band, crack };
  };
  const H = new Float32Array(S * S);
  const Rg = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { n, band, crack } = at(x, y);
    // liso como vidrio, un poco empañado en las vetas claras; las grietas, ásperas
    Rg[y * S + x] = 0.06 + n * 0.08 + (1 - smooth(0.003, 0.014, crack)) * 0.35;
    // liso y ondulado, con las grietas marcadas
    H[y * S + x] = 0.55 + n * 0.25 + band * 0.03 - (1 - smooth(0.003, 0.014, crack)) * 0.3;
    const deep = [52, 112, 150];
    const pale = [150, 198, 222];
    let col = mix(deep, pale, Math.min(1, n * 0.75 + band * 0.12));
    // las grietas: finas y apenas más claras (muy marcadas parecían dibujadas)
    if (crack < 0.006) col = mix(col, [200, 228, 244], 0.32 * (1 - crack / 0.006));
    const fine = noiseS(S, x, y, 6, 30);
    return shade(col, 0.94 + fine * 0.1);
  });
  c.relief = { H, scale: 0.4, detail: 0.05, rough: Rg };
  return c;
}

// Roca de la cueva: oscura, en capas, con vetas de cuarzo.
function caveRockTex({ seed, base = 0x4a4642 }) {
  const S = 512;
  const b = hex(base);
  const at = (x, y) => {
    const n = fbmS(S, x, y, 48, 5, seed);
    // nueve estratos por textura, torcidos
    const strata = Math.sin((y / S) * Math.PI * 2 * 9 + fbmS(S, x, y, 90, 3, 7) * 9) * 0.5 + 0.5;
    const q = Math.abs(fbmS(S, x, y, 60, 3, 300) - 0.5);
    return { n, strata, q };
  };
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { n, strata, q } = at(x, y);
    // la roca bien despareja; los estratos salen en escalones y el cuarzo,
    // más duro, sobresale (en px de textura)
    H[y * S + x] = (n - 0.5) * 10 + smooth(0.35, 0.65, strata) * 3 + (1 - smooth(0.004, 0.018, q)) * 1.2;
    let col = shade(b, 0.6 + n * 0.6 + strata * 0.12);
    if (q < 0.01) col = mix(col, [190, 186, 170], 0.6);
    return col;
  });
  c.relief = { H, detail: 0.3, depth: 0.04, ao: 1.4, aoBlur: 6 };
  return c;
}

// Revoque de cal de los salones (sin guardas: las paredes son altas y la
// textura se repite para arriba), con marcas de la llana y la piedra que
// asoma donde se descascaró.
function plasterTex({ seed }) {
  const S = 512;
  const at = (x, y) => {
    const n = fbmS(S, x, y, 70, 4, seed);
    // la llana: trazos más largos que altos (el mismo período, tres veces en alto)
    const k = per(S, 18);
    const tr = N.fbm((x * k) / S + 40, (y * k * 3) / S, 3, k);
    // donde se cayó el revoque: manchones de un palmo (más chicos parecían huellas)
    const peel = fbmS(S, x, y, 96, 4, 300);
    return { n, tr, peel };
  };
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { n, tr, peel } = at(x, y);
    const g = noiseS(S, x, y, 3, seed + 7);
    // la capa de revoque (2 cm, 5 px de textura) con los trazos de la llana y
    // su grano; donde se cayó, la piedra de abajo, áspera
    const wall = 5 + (tr - 0.5) * 1.2 + (n - 0.5) * 0.6 + (g - 0.5) * 0.5;
    const stone = 2.4 + (tr - 0.5) * 0.8 + (g - 0.5) * 1.2;
    // (el escalón en una banda angosta daba un canto oscuro, como contorno)
    H[y * S + x] = wall + (stone - wall) * smooth(0.71, 0.79, peel);
    let col = shade([222, 214, 196], 0.86 + n * 0.14 + (tr - 0.5) * 0.06);
    // la piedra que asoma, entera y con su grano: si se mezclaba de a poco el
    // manchón tenía el color del revoque y solo se leía el canto
    const rock = shade([158, 150, 138], 0.78 + g * 0.3 + (n - 0.5) * 0.2);
    return mix(col, rock, smooth(0.745, 0.775, peel));
  });
  // (con la altura entera el revoque salía grumoso, tipo gotelé: a 0,6 es cal a la llana)
  c.relief = { H, scale: 0.6, detail: 0.2, depth: 0.022, ao: 1.3, aoBlur: 4 };
  return c;
}

// Pizarra de los techos: tejas chatas de piedra oscura en hileras.
function slateTex({ seed }) {
  const S = 512;
  const rows = 10;
  const rh = S / rows;
  const tw = S / 10;
  const r = rng(seed);
  const tones = Array.from({ length: rows * 10 }, () => 0.75 + r() * 0.35);
  const at = (x, y) => {
    const j = Math.floor(y / rh);
    const off = j % 2 ? tw / 2 : 0;
    const i = Math.floor((x + off) / tw) % 10;
    const lx = (x + off) % tw;
    const ly = y - j * rh;
    return { j, i, lx, ly };
  };
  const H = new Float32Array(S * S);
  const c = paint(S, S, (x, y) => {
    const { j, i, lx, ly } = at(x, y);
    const n = fbmS(S, x, y, 30, 3, seed);
    // cada teja un poco más gruesa abajo (monta sobre la de la hilera siguiente)
    H[y * S + x] = lx < 2 || ly > rh - 3 ? 0.05 : 0.35 + (ly / rh) * 0.4 + (tones[j * 10 + i] - 0.9) * 0.4 + (n - 0.5) * 0.12;
    let col = shade([70, 74, 80], tones[j * 10 + i] * (0.75 + n * 0.4));
    if (ly > rh - 4 || lx < 2) col = shade(col, 0.55);
    return col;
  });
  c.relief = { H, scale: 0.9, detail: 0.2 };
  return c;
}

// Las texturas del castillo (una vez; si ya están, no se repintan).
export function castleTextures(T) {
  if (T.castleStone) return T;
  T.castleStone = toTexture(ashlar({ seed: 71 }));
  T.castleStoneFrost = toTexture(ashlar({ seed: 72, frost: 1 }));
  T.snow = toTexture(snowTex({ seed: 73 }));
  T.flagstone = toTexture(flagstones({ seed: 74 }));
  T.ice = toTexture(iceTex({ seed: 75 }));
  T.caveRock = toTexture(caveRockTex({ seed: 76 }));
  T.slate = toTexture(slateTex({ seed: 77 }));
  T.castlePlaster = toTexture(plasterTex({ seed: 78 }));
  return T;
}

// Los materiales del castillo. `std(map, o)` es el mismo ayudante de World.
export function castleMaterials(T, M, std) {
  castleTextures(T);
  M.castleStone = std(T.castleStone, { bump: 1.6 });
  M.castleStoneDark = std(T.castleStone, { c: 0x94908a, bump: 1.6 });
  M.castlePlaster = std(T.castlePlaster, { bump: 0.35 });
  M.castleStoneFrost = std(T.castleStoneFrost, { bump: 1.4 });
  // la piedra de los bordes, las escaleras y los cordones también es granito
  M.stoneWall = M.castleStoneFrost;
  M.stoneStep = std(T.castleStone, { c: 0xb4b0aa, bump: 1.2 });
  M.snow = std(T.snow, { c: 0xe2eaf4, r: 0.78, bump: 1.3 });
  M.flagstone = std(T.flagstone, { r: 0.75, bump: 1.1 });
  // tiznada: la herrería, la bodega y las mazmorras
  M.flagstoneDark = std(T.flagstone, { c: 0x9a948c, r: 0.8, bump: 1.1 });
  M.ice = std(T.ice, { r: 0.18, e: 0x0c2a40, ei: 0.6 });
  M.iceFloor = std(T.ice, { c: 0xdfefff, r: 0.12, e: 0x0a2236, ei: 0.4 });
  M.caveRock = std(T.caveRock, { bump: 1.8, side: THREE.FrontSide });
  M.caveFloor = std(T.caveRock, { c: 0x8a847c, bump: 1.4 });
  M.roofTop = std(T.slate, { r: 0.7, bump: 0.8 });
  M.slate = std(T.slate, { r: 0.65, bump: 0.8, side: THREE.DoubleSide });
  M.snowCap = std(T.snow, { c: 0xf4f8ff, r: 0.75 });
  // las lajas con nieve de arriba de las murallas (castleWeathering)
  pavedSnow(M, T, std);
  // la cara de afuera de las paredes y la tapa de los muros (con nieve)
  M.exterior = M.castleStone;
  M.wallTop = M.snowCap;
  return M;
}
