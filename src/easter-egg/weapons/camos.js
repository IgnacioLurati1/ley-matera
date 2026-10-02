import * as THREE from 'three';
import { WEAPONS, ELEM_INFO } from '../config/weapons';
import * as P from '../core/progress';
import { isKnight } from '../core/eggs';
import { PAINT, PAINT_PAP, fbm, hash } from './camoPaint';

// Camuflajes de los mates (como los de Black Ops): se desbloquean subiendo de
// nivel (core/progress.js) y se eligen en la armería (ui/Armory.js), uno por
// mate. Van solo en los mates comunes (los especiales tienen su propia cara) y
// el mate lo lleva hasta que pasa por el Pack-a-Pava: ahí toma el camuflaje del
// Pack-a-Pava de ese mapa (PAP_CAMO), teñido del elemento en la segunda mejora.
//
// Los básicos son una textura con relieve. Los animados (y todos los del
// Pack-a-Pava) comparten un único shader (el de MeshStandardMaterial con un
// agregado): nebulosa que fluye, chispas que titilan, una franja de brillo
// que recorre el mate y la textura que se prende. Cada uno lo mueve con sus
// valores (FX), así que no suman programas nuevos que compilar.

// tier: 'basic' (textura), 'animated' (se mueve), 'prestige' (por prestigio,
// también se mueven). `level`/`prestige` es el rango que lo desbloquea
// (P.unlocked); los de prestigio piden nivel 1 de ese prestigio.
export const CAMOS = [
  { id: 'cuero', name: 'Cuero Crudo', level: 2, tier: 'basic', desc: 'Cuero sin curtir, con las manchas de cuando se secó al sol.' },
  { id: 'algarrobo', name: 'Algarrobo', level: 4, tier: 'basic', desc: 'Madera colorada del monte, con sus nudos.' },
  { id: 'yerba', name: 'Yerba Canchada', level: 6, tier: 'basic', desc: 'Hoja y palo, como sale del molino.' },
  { id: 'tiento', name: 'Tiento Trenzado', level: 8, tier: 'basic', desc: 'Tientos claros y oscuros trenzados a mano.' },
  { id: 'poncho', name: 'Poncho Salteño', level: 10, tier: 'basic', desc: 'Colorado con la franja negra, por Güemes.' },
  { id: 'carpincho', name: 'Carpincho', level: 12, tier: 'basic', desc: 'Cuero de carpincho, con los poros de a tres.' },
  { id: 'guarda', name: 'Guarda Pampa', level: 14, tier: 'basic', desc: 'Rombos escalonados de un tejido pampa.' },
  { id: 'palosanto', name: 'Palo Santo', level: 16, tier: 'basic', desc: 'Madera verde del Chaco, con vetas amarillas.' },
  { id: 'overo', name: 'Pingo Overo', level: 18, tier: 'basic', desc: 'El pelaje de un overo alazán.' },
  { id: 'calcareo', name: 'Calcáreo', level: 20, tier: 'basic', desc: 'Las baldosas del patio de la abuela.' },
  { id: 'vibora', name: 'Yarará', level: 22, tier: 'basic', desc: 'Escamas y manchas de yarará. Mejor ni tocarlo.' },
  { id: 'alpaca', name: 'Alpaca Repujada', level: 24, tier: 'basic', desc: 'Plata cincelada con volutas y flores.' },
  { id: 'tatu', name: 'Tatú Carreta', level: 26, tier: 'basic', desc: 'Las placas del caparazón del tatú.' },
  { id: 'nanduti', name: 'Ñandutí', level: 28, tier: 'basic', desc: 'Ruedas de encaje paraguayo de todos los colores.' },
  { id: 'cobre', name: 'Cobre Martillado', level: 30, tier: 'basic', desc: 'Cobre a golpe de martillo, con algo de verdín.' },
  { id: 'fileteado', name: 'Fileteado Porteño', level: 33, tier: 'basic', desc: 'Volutas, hojas de acanto y perlitas, a pincel.' },
  { id: 'plata', name: 'Plata y Niel', level: 36, tier: 'basic', desc: 'Filigrana de plata sobre negro de niel.' },
  { id: 'fogon', name: 'Fogón', level: 39, tier: 'animated', desc: 'Carbón con las grietas encendidas y chispas que suben.' },
  { id: 'ibera', name: 'Aguas del Iberá', level: 42, tier: 'animated', desc: 'Reflejos de la laguna que no paran de moverse.' },
  { id: 'fatuo', name: 'Luz Mala', level: 45, tier: 'animated', desc: 'Fuegos fatuos verdes que rondan entre las cruces.' },
  { id: 'mandinga', name: 'Mandinga', level: 48, tier: 'animated', desc: 'Fuego de la Salamanca subiendo por las venas.' },
  { id: 'animas', name: 'Oro de las Ánimas', level: 50, tier: 'animated', desc: 'Oro labrado que brilla solo, con destellos de las ánimas.' },
  { id: 'yerbaoscura', name: 'Yerba Oscura', level: 55, tier: 'animated', desc: 'La materia oscura del mate: galaxias violetas y hojitas que brillan.' },
  { id: 'cruzdelsur', name: 'Cruz del Sur', level: 1, prestige: 1, tier: 'prestige', desc: 'El cielo del campo con la Cruz del Sur titilando.' },
  { id: 'pampero', name: 'Pampero', level: 1, prestige: 3, tier: 'prestige', desc: 'Nubarrones y relámpagos de tormenta.' },
  { id: 'soldemayo', name: 'Sol de Mayo', level: 1, prestige: 5, tier: 'prestige', desc: 'Oro con soles de rayos rectos y flamígeros.' },
  { id: 'materia', name: 'Materia Matera', level: 1, prestige: 10, tier: 'prestige', desc: 'Todos los colores a la vez. El que lo tiene, ya lo vio todo.' },
  { id: 'diamante', name: 'Diamante Criollo', level: 100, prestige: P.MASTER, tier: 'prestige', desc: 'Facetas de cristal que tiran arcoíris. Solo para Maestros.' },
];
export const CAMO_BY_ID = Object.fromEntries(CAMOS.map((c) => [c.id, c]));

// El del Pack-a-Pava de cada mapa.
export const PAP_CAMO = {
  molino: { name: 'Fluo del Molino', desc: 'El de siempre: remolinos fluorescentes que no se quedan quietos.' },
  granja: { name: 'Cosecha Maldita', desc: 'Hojas del yerbal con venas de oro que laten.' },
  penal: { name: 'Ánimas en Pena', desc: 'Piedra del penal y almas celestes que suben.' },
  esteros: { name: 'Cintas del Gauchito', desc: 'Cintas coloradas al viento y brasas de velas.' },
  torre: { name: 'Remolino Cósmico', desc: 'Una galaxia que da vueltas alrededor del mate.' },
  castillo: { name: 'Éter Andino', desc: 'Hielo de la cordillera, auroras y chakanas de oro.' },
  monumento: { name: 'Celeste y Blanco', desc: 'Las franjas al viento, soles de oro y la llama votiva.' },
};

// Cómo se ve cada uno, además de lo que traen sus texturas (camoPaint.js: el
// relieve, la rugosidad y el metal de cada capa). cc: laca (clearcoat) y qué
// tan lisa; sheen: el brillo de la tela o el pelo; depth: profundidad de lo
// de adentro, [nebulosa, chispas, la textura misma, cuánto se ve la de
// adentro] (la galaxia de la Yerba Oscura se ve dentro de la calabaza).
const LOOK = {
  cuero: { sheen: 0.2, sheenColor: 0xffe8c8 },
  algarrobo: { cc: 0.6, ccr: 0.25 },
  yerba: {},
  tiento: { sheen: 0.2, sheenColor: 0xffe0b0 },
  poncho: { sheen: 0.45, sheenColor: 0xd04838, sheenRough: 0.6 },
  carpincho: { sheen: 0.15 },
  guarda: { sheen: 0.7, sheenColor: 0xffe6c8, sheenRough: 0.6 },
  palosanto: { cc: 0.85, ccr: 0.14 },
  overo: { sheen: 0.6, sheenColor: 0xfff2e0, sheenRough: 0.45 },
  calcareo: { cc: 0.6, ccr: 0.1 },
  vibora: { cc: 0.45, ccr: 0.2 },
  alpaca: {},
  tatu: { cc: 0.2, ccr: 0.35 },
  nanduti: { sheen: 0.7, sheenColor: 0xffffff, sheenRough: 0.5 },
  cobre: {},
  fileteado: { cc: 1, ccr: 0.05 },
  plata: { cc: 0.3, ccr: 0.1 },
  fogon: {},
  ibera: { cc: 1, ccr: 0.03, depth: [0.05, 0.08, 0.02, 0.5] },
  fatuo: { cc: 0.5, ccr: 0.2, depth: [0.05, 0.07] },
  mandinga: { cc: 0.3, ccr: 0.3, depth: [0.03, 0.05] },
  animas: { cc: 0.4, ccr: 0.1 },
  yerbaoscura: { cc: 1, ccr: 0.04, depth: [0.07, 0.11, 0.04, 0.75] },
  cruzdelsur: { cc: 1, ccr: 0.05, depth: [0.05, 0.04, 0.03, 0.6] },
  pampero: { depth: [0.04, 0.02] },
  soldemayo: { cc: 0.5, ccr: 0.1 },
  materia: { cc: 1, ccr: 0.03, depth: [0.07, 0.11, 0.04, 0.7] },
  diamante: { cc: 1, ccr: 0.02, depth: [0.02, 0.06] },
  pap_molino: { cc: 0.6, ccr: 0.15 },
  pap_granja: { cc: 0.3, ccr: 0.3, depth: [0.03, 0.04] },
  pap_penal: { depth: [0.05, 0.05] },
  pap_esteros: { sheen: 0.5, sheenColor: 0xffb080, sheenRough: 0.5 },
  pap_torre: { cc: 1, ccr: 0.05, depth: [0.06, 0.1, 0.035, 0.6] },
  pap_castillo: { cc: 1, ccr: 0.05, depth: [0.05, 0.05] },
};

// Los valores del shader. flow: [escala u, escala v, velocidad u, velocidad v]
// (las escalas enteras para que empalme; velocidad v negativa: sube). neb:
// [desde, hasta] del umbral de la nebulosa. band: [dir u, dir v, velocidad,
// filo]. pulse: [velocidad, cuánto]. mapGlow: cuánto se prende la textura
// (sq: solo lo más claro: grietas, runas, estrellas pintadas). ridge: nebulosa en hilos (reflejos de agua) en vez
// de nubes. hue: arcoíris que corre. flash: la textura relampaguea.
const FX0 = {
  deep: 0x000000,
  deepK: 0,
  glow: 0x000000,
  glow2: 0x000000,
  glowI: 0,
  neb: [0.5, 0.85],
  warp: 0.3,
  ridge: 0,
  flow1: [1, 1, 0.01, 0.02],
  flow2: [2, 1, -0.02, 0.01],
  spark: 0xffffff,
  sparkI: 0,
  sparkUv: [4, 2, 0, 0],
  band: [1, 0.5, 0.2, 6],
  bandC: 0xffffff,
  bandI: 0,
  mapGlow: 0,
  sq: 0,
  hue: 0,
  pulse: [2, 0],
  flash: 0,
  scroll: null,
};
const FX = {
  fogon: { glow: 0xff5a10, glow2: 0xffa030, glowI: 0.7, neb: [0.6, 0.92], warp: 0.4, flow1: [1, 1, 0, -0.02], flow2: [2, 1, 0.005, -0.05], spark: 0xffa040, sparkI: 3, sparkUv: [4, 2, 0.004, -0.18], mapGlow: 3.2, sq: 1, pulse: [6.3, 0.22] },
  ibera: { deep: 0x02202a, deepK: 0.2, glow: 0x7ff6ff, glow2: 0xc0fff0, glowI: 1.1, neb: [0.45, 0.85], warp: 0.5, ridge: 1, flow1: [1, 1, 0.02, 0.015], flow2: [2, 1, -0.03, 0.02], sparkI: 1.5, sparkUv: [4, 2, 0.01, 0] },
  fatuo: { deepK: 0.3, glow: 0x49ff6a, glow2: 0x9dffc4, glowI: 2.2, neb: [0.66, 0.82], warp: 0.6, flow1: [1, 1, 0.012, -0.008], flow2: [1, 1, -0.02, -0.03], spark: 0x7aff9a, sparkI: 2, sparkUv: [4, 2, 0, -0.03], mapGlow: 1.2, sq: 1, pulse: [2.2, 0.35] },
  mandinga: { deep: 0x100000, deepK: 0.4, glow: 0xff2008, glow2: 0xff7a10, glowI: 1.8, neb: [0.5, 0.85], warp: 0.7, ridge: 0.3, flow1: [1, 1, 0, -0.06], flow2: [2, 1, 0, -0.14], spark: 0xffb040, sparkI: 3, sparkUv: [4, 2, 0, -0.25], mapGlow: 1.5, sq: 1, pulse: [4, 0.2] },
  animas: { glow: 0x9fd8ff, glow2: 0xffffff, glowI: 0.6, neb: [0.7, 0.9], flow1: [1, 1, 0.01, -0.03], flow2: [2, 1, 0, -0.05], band: [1, 0.5, 0.35, 10], bandC: 0xfff0c0, bandI: 2.2, sparkI: 3.5, mapGlow: 0.15 },
  yerbaoscura: { glow: 0x8a2cff, glow2: 0x2a6cff, glowI: 2.4, neb: [0.52, 0.9], warp: 0.9, ridge: 0.25, flow1: [1, 1, 0.015, 0.01], flow2: [2, 1, -0.025, 0.012], spark: 0xd8ffb0, sparkI: 4, sparkUv: [4, 2, 0.004, 0.002], band: [1, 0.5, 0.12, 8], bandC: 0xb060ff, bandI: 0.6, mapGlow: 0.6, sq: 1, pulse: [1.3, 0.15] },
  cruzdelsur: { glow: 0x3a6cff, glow2: 0x9ab8ff, glowI: 0.5, neb: [0.6, 0.95], flow1: [1, 1, 0.004, 0.002], flow2: [2, 1, -0.006, 0.003], sparkI: 3, mapGlow: 1.3, sq: 1, pulse: [1.5, 0.12] },
  pampero: { glow: 0x6a7890, glow2: 0xa0b0c8, glowI: 0.3, neb: [0.5, 0.9], warp: 0.6, flow1: [1, 1, 0.05, 0.01], flow2: [2, 1, 0.09, 0.02], mapGlow: 2.5, sq: 1, flash: 1 },
  soldemayo: { glow: 0xffc040, glow2: 0xfff0a0, glowI: 0.4, neb: [0.72, 0.92], band: [1, 0.5, 0.3, 12], bandC: 0xfff4d0, bandI: 2.4, sparkI: 2.5, mapGlow: 0.35, sq: 1, pulse: [2, 0.3] },
  materia: { glow: 0xff40ff, glow2: 0x40c0ff, glowI: 2.6, neb: [0.5, 0.88], warp: 1, flow1: [1, 1, 0.02, 0.012], flow2: [2, 1, -0.03, 0.018], hue: 0.08, sparkI: 4.5, band: [1, 0.5, 0.18, 10], bandI: 1.2, mapGlow: 0.5, sq: 1 },
  diamante: { glow: 0xbfe8ff, glow2: 0xffffff, glowI: 0.35, neb: [0.75, 0.95], hue: 0.05, sparkI: 6, sparkUv: [6, 3, 0, 0], band: [1, 0.5, 0.25, 14], bandI: 1, mapGlow: 0.25 },
  pap_molino: { mapGlow: 0.82, pulse: [3, 0.3], scroll: [0.05, 0.03] },
  pap_granja: { glow: 0x6aff2a, glow2: 0xffd030, glowI: 1.6, neb: [0.55, 0.88], warp: 0.6, flow1: [1, 1, 0.02, -0.01], flow2: [2, 1, -0.02, -0.03], band: [1, 0.5, 0.25, 8], bandC: 0xffc830, bandI: 1.2, spark: 0xfff080, sparkI: 2.5, mapGlow: 0.9, sq: 1 },
  pap_penal: { glow: 0x40e8ff, glow2: 0xc8f8ff, glowI: 2, neb: [0.6, 0.86], warp: 0.7, flow1: [1, 1, 0, -0.03], flow2: [1, 1, 0.01, -0.07], spark: 0xa8f0ff, sparkI: 3, sparkUv: [4, 2, 0, -0.05], mapGlow: 0.9, sq: 1, pulse: [2.4, 0.25] },
  pap_esteros: { glow: 0xff2a10, glow2: 0xffa020, glowI: 1.4, neb: [0.55, 0.88], warp: 0.5, flow1: [1, 1, 0.035, 0], flow2: [2, 1, 0.06, 0.005], spark: 0xffd070, sparkI: 3, sparkUv: [4, 2, 0, -0.04], mapGlow: 0.7, sq: 1, band: [1, 0.5, 0.2, 8], bandC: 0xff4020, bandI: 0.8, pulse: [3.5, 0.2] },
  pap_torre: { glow: 0xa040ff, glow2: 0xff8a30, glowI: 1.6, neb: [0.55, 0.9], warp: 1, flow1: [1, 1, 0.04, 0], flow2: [2, 1, 0.07, 0.01], sparkI: 4, mapGlow: 0.9, band: [1, 0.5, 0.15, 10], bandC: 0xffa040, bandI: 0.6 },
  pap_castillo: { glow: 0x30ffd0, glow2: 0xff50e0, glowI: 1.6, neb: [0.52, 0.86], warp: 0.8, ridge: 0.6, flow1: [1, 1, 0.03, 0.005], flow2: [2, 1, -0.02, 0.01], mapGlow: 0.6, sq: 1, band: [1, 0.5, 0.2, 10], bandC: 0xfff0b0, bandI: 0.8, sparkI: 2 },
};

// ¿Este mate puede llevar camuflaje? (los especiales, los de un rato y las
// pavas no; el Meme tiene su propia cara y la Bombilla Gut es el arma
// especial de Mate of the Dead). El Porongo del Caballero sí, pero recién
// cuando lo tiene (el super easter egg; en desarrollo también con la prueba
// de Alt+O, core/eggs isKnight): hasta ahí, en la armería es un lugar secreto.
const NO_CAMO = new Set(['meme', 'gut']);
export const KNIGHT = 'caballero';
export const knightEarned = () => isKnight();
export function camoable(id) {
  const w = WEAPONS[id];
  return !!w && !w.special && !w.temp && w.kind !== 'tactical' && !NO_CAMO.has(id);
}
export const CAMOABLE = Object.keys(WEAPONS).filter(camoable);

export const camoUnlocked = (c) => !!c && P.unlocked(c);

// El camuflaje que lleva este mate (sin mejorar): el elegido, si ya está desbloqueado.
export function camoFor(id) {
  if (!camoable(id) || (id === KNIGHT && !knightEarned())) return null;
  const c = CAMO_BY_ID[P.camoOf(id)];
  return camoUnlocked(c) ? c.id : null;
}

// ---------------- texturas ----------------
const canvases = new Map();
// El canvas de un camuflaje (la armería lo usa de muestra). Se pinta la primera vez.
export function camoCanvas(id) {
  if (!canvases.has(id)) canvases.set(id, PAINT[id]?.() || null);
  return canvases.get(id);
}
export function papCanvas(mapId, T) {
  if (mapId === 'molino') return T?.camo?.image || null;
  const k = `pap_${mapId}`;
  if (!canvases.has(k)) canvases.set(k, PAINT_PAP[mapId]?.() || null);
  return canvases.get(k);
}

const textures = new Map();
function texOf(key, canvas) {
  if (!textures.has(key)) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    textures.set(key, t);
  }
  return textures.get(key);
}
function papTexture(mapId, T) {
  // (el del molino es la textura de siempre, core/textures.js papCamo)
  if (mapId === 'molino' && T?.camo) return T.camo;
  return texOf(`pap_${mapId}`, papCanvas(mapId, T));
}

// ---------------- el relieve ----------------
// Del relieve de cada canvas (camoPaint.js, canvas.camoRelief) salen dos
// texturas: el normal map y la de oclusión, rugosidad y metal (rojo, verde y
// azul, como las leen aoMap, roughnessMap y metalnessMap). A la altura se le
// suma el grano fino del color (lo claro un poco más alto). La oclusión es la
// cavidad: lo que queda más hondo que lo de alrededor (la puntada, la junta,
// el cincelado) recibe menos luz. Mismo cálculo que fx/Surfaces.js.
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + ((i + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * k;
      const a = x + r + 1;
      const b = x - r;
      s += src[o + (a < w ? a : a - w)] - src[o + (b >= 0 ? b : b + w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[((i + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * k;
      const a = y + r + 1;
      const b = y - r;
      s += tmp[(a < h ? a : a - h) * w + x] - tmp[(b >= 0 ? b : b + h) * w + x];
    }
  }
  return out;
}

const baked = new WeakMap(); // canvas → { n, orm, w, h }
function bake(img) {
  if (baked.has(img)) return baked.get(img);
  const w = img.width;
  const h = img.height;
  const n = w * h;
  // (el del molino, que no trae relieve: solo el grano, y lo demás parejo)
  const R = img.camoRelief || { scale: 0.7, detail: 0.35, ao: 0.8, rough: 0.3, metal: 0.3 };
  const H = new Float32Array(n);
  if (R.H) H.set(R.H);
  else H.fill(0.5);
  const det = R.detail ?? 0.2;
  if (det > 0) {
    const d = img.getContext('2d').getImageData(0, 0, w, h).data;
    const L = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = (d[j] * 0.2126 + d[j + 1] * 0.7152 + d[j + 2] * 0.0722) / 255;
    const B = boxBlur(L, w, h, 2);
    for (let i = 0; i < n; i++) H[i] += (L[i] - B[i]) * det * 4;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (H[i] < lo) lo = H[i];
    if (H[i] > hi) hi = H[i];
  }
  // Sobel con vuelta. El canvas va de arriba hacia abajo y la textura sube
  // en v: la fila y del canvas es la fila h-1-y de los datos.
  const nd = new Uint8Array(n * 4);
  const k = (6 * (R.scale ?? 1)) / 8;
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
    }
  }
  const Bc = boxBlur(H, w, h, 4);
  const kao = (R.ao ?? 1) / (hi - lo || 1);
  const od = new Uint8Array(n * 4);
  for (let y = 0, i = 0; y < h; y++) {
    let j = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, i++, j += 4) {
      od[j] = (1 - Math.min(0.65, Math.max(0, Bc[i] - H[i]) * kao)) * 255 + 0.5;
      od[j + 1] = Math.min(1, Math.max(0.02, R.R ? R.R[i] : R.rough ?? 0.6)) * 255 + 0.5;
      od[j + 2] = Math.min(1, Math.max(0, R.M ? R.M[i] : R.metal ?? 0)) * 255 + 0.5;
      od[j + 3] = 255;
    }
  }
  const out = { n: nd, orm: od, w, h };
  baked.set(img, out);
  return out;
}

// Una textura de datos con el mismo repeat y corrimiento que el color (los
// mismos objetos: el del molino se corre y lo suyo lo sigue).
function linked(map, data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.repeat = map.repeat;
  t.offset = map.offset;
  t.center = map.center;
  t.needsUpdate = true;
  return t;
}
const reliefs = new WeakMap(); // textura de color → { normal, orm }
function reliefOf(map) {
  let r = reliefs.get(map);
  if (!r) {
    const b = bake(map.image);
    r = { normal: linked(map, b.n, b.w, b.h), orm: linked(map, b.orm, b.w, b.h) };
    reliefs.set(map, r);
  }
  return r;
}

// La textura compartida del shader: R nubes, G hilos (reflejos), B estrellitas
// sueltas y A la fase de cada estrellita (para que no titilen todas juntas).
let DATA = null;
function dataTexture() {
  if (DATA) return DATA;
  const S = 256;
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const v = (y + 0.5) / S;
      const i = (y * S + x) * 4;
      d[i] = fbm(u, v, 4, 4, 5, 201) * 255;
      const r = fbm(u, v, 5, 5, 4, 202);
      d[i + 1] = Math.pow(1 - Math.abs(r * 2 - 1), 3) * 255;
      const cx = Math.floor(x / 8);
      const cy = Math.floor(y / 8);
      const h = hash(cx, cy, 203);
      const sx = cx * 8 + 1.5 + hash(cx, cy, 204) * 5;
      const sy = cy * 8 + 1.5 + hash(cx, cy, 205) * 5;
      const dd = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      d[i + 2] = h > 0.62 ? Math.max(0, 1 - dd / 1.8) ** 2 * 255 * (0.5 + h * 0.5) : 0;
      d[i + 3] = hash(cx, cy, 206) * 255;
    }
  }
  DATA = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  DATA.wrapS = DATA.wrapT = THREE.RepeatWrapping;
  DATA.magFilter = THREE.LinearFilter;
  DATA.minFilter = THREE.LinearMipmapLinearFilter;
  DATA.generateMipmaps = true;
  DATA.needsUpdate = true;
  return DATA;
}

// ---------------- el shader ----------------
// Todos los camuflajes (los básicos, los animados y los del Pack-a-Pava) son
// el mismo material: MeshPhysicalMaterial con su normal map, su textura de
// oclusión/rugosidad/metal, laca y brillo de tela (siempre un poquito, para
// que el programa sea uno solo) y este agregado, que en los básicos no hace
// nada: nebulosa que fluye, chispas que titilan, una franja de brillo que
// recorre el mate, la textura que se prende y lo de adentro, más hondo
// (parallax: se corre con la vista, como si se viera a través de la laca).
const TIME = { value: 0 };
const HEAD = /* glsl */ `
uniform float cT;
uniform sampler2D cData;
uniform vec3 cDeep;
uniform vec3 cGlow;
uniform vec3 cGlow2;
uniform vec3 cSpark;
uniform vec3 cBandC;
uniform vec4 cFlow1;
uniform vec4 cFlow2;
uniform vec4 cSparkUv;
uniform vec4 cBand;
uniform vec4 cNeb;
uniform vec4 cK;
uniform vec4 cX;
uniform vec4 cM;
uniform vec4 cTint;
uniform vec4 cDepth;
vec3 cRainbow(float h) { return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
// hacia dónde se corre lo de adentro: la vista en el plano de la textura
// (u, v), sacada de las derivadas (no hay tangentes). Con la normal suave del
// vértice, no la de cada triángulo: con esa, cada cara del torno corría lo de
// adentro distinto y el mate se veía troceado en rectángulos.
vec2 cPar(vec2 uv) {
  vec3 p = -vViewPosition;
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 du1 = dFdx(uv);
  vec2 du2 = dFdy(uv);
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(vViewPosition);
  vec3 T = cross(dp2, N) * du1.x + cross(N, dp1) * du2.x;
  vec3 B = cross(dp2, N) * du1.y + cross(N, dp1) * du2.y;
  T -= N * dot(N, T);
  B -= N * dot(N, B);
  float lt = length(T);
  float lb = length(B);
  if (lt < 1e-12 || lb < 1e-12) return vec2(0.0);
  return vec2(dot(V, T) / lt, dot(V, B) / lb) / max(dot(V, N), 0.35);
}
`;
const BODY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec2 cu = vMapUv;
  vec2 pv = cDepth.x + cDepth.y + cDepth.z > 0.0 ? cPar(cu) : vec2(0.0);
  vec4 c1 = texture2D(cData, (cu - pv * cDepth.x) * cFlow1.xy + cFlow1.zw * cT);
  vec4 c2 = texture2D(cData, (cu - pv * cDepth.x * 1.5) * cFlow2.xy + cFlow2.zw * cT + (c1.rg - 0.5) * cNeb.z);
  float neb = smoothstep(cNeb.x, cNeb.y, mix(c2.r, c2.g, cM.y) * 0.7 + c1.g * 0.3);
  vec3 glow = mix(cGlow, cGlow2, clamp(c1.r * 1.6 - 0.3, 0.0, 1.0));
  if (cX.x != 0.0) glow = cRainbow(cu.x + cu.y * 0.5 + cT * cX.x + c2.r) * max(max(glow.r, glow.g), glow.b) * 1.3;
  glow = mix(glow, cTint.rgb * 1.4, cTint.a * 0.75);
  float pulse = 1.0 + cX.z * sin(cT * cX.y);
  vec4 c3 = texture2D(cData, (cu - pv * cDepth.y) * cSparkUv.xy + cSparkUv.zw * cT);
  float tw = 0.5 + 0.5 * sin(cT * 4.0 + c3.a * 6.28318);
  float bp = fract(dot(cu, cBand.xy) - cT * cBand.z);
  float band = pow(max(0.0, 1.0 - abs(bp - 0.5) * 2.0), cBand.w);
  vec3 bandC = cX.x != 0.0 ? cRainbow(bp + cT * 0.1) * 1.4 : cBandC;
  float flash = 1.0;
  if (cX.w > 0.0) flash = fract(sin(floor(cT * 9.0) * 12.9898) * 43758.5453) > 0.88 ? 4.0 : 0.25;
  // lo de adentro: la misma textura, más honda
  if (cDepth.w > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, cu - pv * cDepth.z).rgb * diffuse, cDepth.w);
  vec3 tex = diffuseColor.rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  tex = mix(tex, lum * cTint.rgb * 2.2, cTint.a);
  diffuseColor.rgb = mix(tex, cDeep, neb * cNeb.w);
  totalEmissiveRadiance = glow * neb * cK.x * pulse * (cX.w > 0.0 ? 0.5 + flash * 0.5 : 1.0)
    + cSpark * c3.b * tw * tw * cK.y
    + bandC * band * cK.z
    + mix(tex, tex * smoothstep(0.55, 0.95, max(max(tex.r, tex.g), tex.b)) * 2.2, cM.x) * cK.w * pulse * flash;
}
`;
const onCompile = (u) => (s) => {
  Object.assign(s.uniforms, u);
  s.fragmentShader = s.fragmentShader.replace('void main() {', `${HEAD}\nvoid main() {`).replace('#include <emissivemap_fragment>', BODY);
};

function uniforms() {
  const c = () => ({ value: new THREE.Color() });
  const v4 = () => ({ value: new THREE.Vector4() });
  return {
    cT: TIME,
    cData: { value: dataTexture() },
    cDeep: c(),
    cGlow: c(),
    cGlow2: c(),
    cSpark: c(),
    cBandC: c(),
    cFlow1: v4(),
    cFlow2: v4(),
    cSparkUv: v4(),
    cBand: v4(),
    cNeb: v4(),
    cK: v4(),
    cX: v4(),
    cM: v4(),
    cTint: v4(),
    cDepth: v4(),
  };
}

function applyFx(u, fx, look, tint = null) {
  const f = { ...FX0, ...fx };
  u.cDeep.value.set(f.deep);
  u.cGlow.value.set(f.glow);
  u.cGlow2.value.set(f.glow2);
  u.cSpark.value.set(f.spark);
  u.cBandC.value.set(f.bandC);
  u.cFlow1.value.set(...f.flow1);
  u.cFlow2.value.set(...f.flow2);
  u.cSparkUv.value.set(...f.sparkUv);
  u.cBand.value.set(f.band[0], f.band[1], f.band[2], Math.max(0.5, f.band[3]));
  u.cNeb.value.set(f.neb[0], f.neb[1], f.warp, f.deepK);
  u.cK.value.set(f.glowI, f.sparkI, f.bandI, f.mapGlow);
  u.cX.value.set(f.hue, f.pulse[0], f.pulse[1], f.flash);
  u.cM.value.set(f.sq, f.ridge, 0, 0);
  const d = look?.depth || [];
  u.cDepth.value.set(d[0] || 0, d[1] || 0, d[2] || 0, d[3] || 0);
  if (tint != null) {
    const t = new THREE.Color(tint);
    u.cTint.value.set(t.r, t.g, t.b, 0.65);
  } else u.cTint.value.set(1, 1, 1, 0);
}

// Lo de la laca y la tela, del LOOK (siempre un mínimo: así todos comparten programa).
function applyLook(m, look = {}, scale = 1) {
  m.clearcoat = Math.max(0.01, look.cc ?? 0);
  m.clearcoatRoughness = look.ccr ?? 0.2;
  m.sheen = Math.max(0.01, look.sheen ?? 0);
  m.sheenColor.set(look.sheenColor ?? 0xffffff);
  m.sheenRoughness = look.sheenRough ?? 0.5;
  m.normalScale.set(scale, scale);
}

function camoMat(map, look, fx, tint = null) {
  const r = reliefOf(map);
  const u = uniforms();
  applyFx(u, fx, look, tint);
  const m = new THREE.MeshPhysicalMaterial({
    map,
    normalMap: r.normal,
    aoMap: r.orm,
    aoMapIntensity: 1,
    roughnessMap: r.orm,
    metalnessMap: r.orm,
    roughness: 1,
    metalness: 1,
    side: THREE.DoubleSide,
  });
  applyLook(m, look);
  m.onBeforeCompile = onCompile(u);
  m.customProgramCacheKey = () => 'mdu-camo-2';
  m.userData.camo = u;
  return m;
}

// ---------------- materiales ----------------
const mats = new Map();
// El material de un camuflaje (uno por camuflaje, lo comparten todos los mates).
export function camoMaterial(id) {
  const c = CAMO_BY_ID[id];
  if (!c) return null;
  if (!mats.has(id)) {
    const m = camoMat(texOf(id, camoCanvas(id)), LOOK[id], FX[id]);
    m.name = `camo:${id}`;
    mats.set(id, m);
  }
  return mats.get(id);
}

// Los del Pack-a-Pava en la partida (MATS.camo y MATS.camo_<elemento> de
// weapons/viewmodels.js): son siempre los mismos materiales y setPapMap les
// cambia las texturas y los valores al mapa que se juega.
let papMap = 'molino';
const papMats = new Map();
export function papMaterial(T, elem = null) {
  const k = elem || '';
  if (!papMats.has(k)) {
    const m = camoMat(papTexture(papMap, T), LOOK[`pap_${papMap}`], FX[`pap_${papMap}`], elem ? ELEM_INFO[elem]?.color : null);
    m.name = `camo:pap${k ? `:${k}` : ''}`;
    papMats.set(k, m);
  }
  return papMats.get(k);
}
export function setPapMap(mapId, T) {
  if (!PAP_CAMO[mapId] || mapId === papMap) return;
  papMap = mapId;
  const look = LOOK[`pap_${mapId}`];
  const map = papTexture(mapId, T);
  const r = reliefOf(map);
  for (const [k, m] of papMats) {
    m.map = map;
    m.normalMap = r.normal;
    m.aoMap = m.roughnessMap = m.metalnessMap = r.orm;
    applyLook(m, look);
    applyFx(m.userData.camo, FX[`pap_${mapId}`], look, k ? ELEM_INFO[k]?.color : null);
  }
}
export const papMapNow = () => papMap;

// Para la armería: el del Pack-a-Pava de cualquier mapa, aparte de los de la partida.
const papShow = new Map();
export function papPreviewMaterial(mapId, T) {
  if (!PAP_CAMO[mapId]) return null;
  if (!papShow.has(mapId)) papShow.set(mapId, camoMat(papTexture(mapId, T), LOOK[`pap_${mapId}`], FX[`pap_${mapId}`]));
  return papShow.get(mapId);
}

// Cada cuadro (Weapons.update, y la armería): el reloj del shader y el
// corrimiento del camuflaje del molino. (el reloj da la vuelta cada 1000 s:
// las velocidades son de a milésimas, así que las texturas empalman)
export function tickCamos(t) {
  TIME.value = t % 1000;
  const tex = papMap === 'molino' && papMats.get('')?.map;
  if (tex) {
    tex.offset.x = (t * FX.pap_molino.scroll[0]) % 1;
    tex.offset.y = (t * FX.pap_molino.scroll[1]) % 1;
  }
}
// (la armería lo corre aunque la partida use otro mapa)
export function tickMolino(T, t) {
  if (!T?.camo) return;
  T.camo.offset.x = (t * FX.pap_molino.scroll[0]) % 1;
  T.camo.offset.y = (t * FX.pap_molino.scroll[1]) % 1;
}
