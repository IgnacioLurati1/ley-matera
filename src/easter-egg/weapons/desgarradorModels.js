import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// El Desgarrador Cósmico, en piezas (weapons/Desgarrador.js lo arma en la mano,
// en el muñeco de los compañeros y en la guadaña espectral que se tira; el
// mapa, en la caja y en la misión del temple). Una guadaña de verdad, en metros.
//  · El Desgarrador Cósmico: asta de ébano con vetas violetas que laten, dos
//    empuñaduras de cuero morado, la cabeza con su collar y sus colmillos, la
//    hoja de doble curva con el lomo dentado y una segunda hoja chica atrás,
//    las dos con el cosmos ADENTRO (una nebulosa que se mueve y, por delante,
//    estrellas que corren a otra velocidad: se ve hondo), el filo violeta que
//    respira, un eclipse chico en la unión, el contrapeso de abajo (un cristal
//    en su jaula) y esquirlas de espacio roto que flotan alrededor de la hoja.
//  · El Desgarrador del Eclipse (la mejorada) se reconoce de un vistazo: la
//    hoja más larga y ancha con el filo de oro y violeta, el eclipse grande
//    (un disco negro tapando un sol de oro: corona, rayos y su halo), runas de
//    oro que laten en el asta, los herrajes de oro, la luna creciente arriba,
//    la media luna de contrapeso abajo y el doble de esquirlas, de oro y violeta.
//  · Con la Furia (tintMats 'furia'): todo en neón, la corona encendida y
//    rayos que chisporrotean por la hoja (bolts).
// La hoja va en el plano x-y: el asta sube por +y desde la empuñadura de la
// mano derecha (el origen); la hoja sale hacia +x y se curva hacia abajo; el
// filo es el borde de adentro (el de abajo).

export const SHAFT_L = 1.55;
// de la punta de abajo a cada mano: la derecha atrás, cerca del regatón, y la
// izquierda adelante, hacia la hoja (v3: las dos manos se ven en el asta; antes
// la izquierda iba atrás, fuera de cuadro; globalThis.__mduDesgOldGrip: como antes)
const OLD_GRIP = globalThis.__mduDesgOldGrip === true;
const GRIP_R = OLD_GRIP ? 0.42 : 0.3;
const GRIP_L = OLD_GRIP ? 0.14 : 0.8;
// (en el modelo: el origen es la mano derecha)
export const GRIP_L_Y = GRIP_L - GRIP_R;
export const MID_Y = SHAFT_L / 2 - GRIP_R;
export const TOP_Y = SHAFT_L - GRIP_R;
export const BUTT_Y = -GRIP_R;
const R_BOT = 0.0185;
const R_TOP = 0.0165;
export const SHAFT_R = 0.018;
// el cuero de las empuñaduras: más grueso que el asta (el puño lo abraza)
const GRIP_T = OLD_GRIP ? 0.0042 : 0.0075;
const BLADE_T = 0.008;
const BEVEL_T = 0.0025;
// la cara de la hoja (donde van la nebulosa y el filo)
const FACE_Z = BLADE_T / 2 + BEVEL_T;
// el eclipse, en la unión de la hoja y el asta
const JOINT = new THREE.Vector3(0.006, TOP_Y - 0.075, 0);

const rr = (y) => R_BOT + (R_TOP - R_BOT) * ((y - BUTT_Y) / SHAFT_L);
// el radio del cuero donde agarra cada mano (las manos de primera persona lo abrazan)
export const GRIP_RAD = [rr(0) + GRIP_T + 0.0004, rr(GRIP_L_Y) + GRIP_T + 0.0004];

// ---------------- las hojas ----------------
// Cada hoja: de dónde nace, el largo, el ancho y hacia dónde va en cada punto
// th(u) (u de 0 a 1). La grande tiene doble curva: primero sube apenas y
// después se cuelga en gancho; el lomo lleva dientes cerca del asta
// (teeth: [desde, hasta, cuántos, alto]).
const MAIN = [
  { base: new THREE.Vector2(-0.014, TOP_Y - 0.05), len: 0.98, width: 0.165, th: (u) => 0.3 + 0.55 * u - 2.45 * u ** 2.5, teeth: [0.06, 0.4, 6, 0.016] },
  { base: new THREE.Vector2(-0.014, TOP_Y - 0.05), len: 1.12, width: 0.19, th: (u) => 0.34 + 0.6 * u - 2.6 * u ** 2.5, teeth: [0.05, 0.44, 7, 0.019] },
];
// la hoja chica de atrás (al otro lado del asta), en gancho para arriba
const BACK = [
  { base: new THREE.Vector2(0.012, TOP_Y - 0.085), len: 0.3, width: 0.07, th: (u) => Math.PI - 0.2 - 1.2 * u },
  { base: new THREE.Vector2(0.012, TOP_Y - 0.085), len: 0.4, width: 0.085, th: (u) => Math.PI - 0.15 - 1.35 * u },
];
const FINE = 240;
function curve(S, wPow = 0.62) {
  const pts = [];
  let x = S.base.x;
  let y = S.base.y;
  const ds = S.len / FINE;
  for (let i = 0; i <= FINE; i++) {
    const u = i / FINE;
    const th = S.th(u);
    const w = S.width * Math.pow(Math.max(0, 1 - u), wPow) * (1 + 0.15 * Math.sin(Math.PI * u));
    pts.push({ x, y, th, w, u });
    x += Math.cos(th) * ds;
    y += Math.sin(th) * ds;
  }
  return pts;
}
const CURVES = [0, 1].map((up) => ({ main: curve(MAIN[up]), back: curve(BACK[up], 0.8) }));
// los dientes del lomo (en dientes de sierra, inclinados hacia la punta)
function tooth(S, u) {
  if (!S.teeth) return 0;
  const [u0, u1, n, A] = S.teeth;
  if (u < u0 || u > u1) return 0;
  const f = (u - u0) / (u1 - u0);
  const k = f * n;
  return A * (k - Math.floor(k)) * Math.sqrt(Math.sin(Math.PI * f));
}
// (el lomo y el filo en u, para la estela y la punta)
const spineAt = (p, out) => out.set(p.x, p.y, 0);
const edgeAt = (p, out, into = 1) => out.set(p.x + Math.sin(p.th) * p.w * into, p.y - Math.cos(p.th) * p.w * into, 0);
const at = (L, u) => L[Math.max(0, Math.min(FINE, Math.round(u * FINE)))];
// El filo de la hoja grande en u (0 la base, 1 la punta), en el modelo.
export function bladeEdge(u, out = new THREE.Vector3(), into = 1, up = 0) {
  return edgeAt(at(CURVES[up ? 1 : 0].main, u), out, into);
}
export function bladeSpine(u, out = new THREE.Vector3(), up = 0) {
  return spineAt(at(CURVES[up ? 1 : 0].main, u), out);
}

// La silueta (lomo de ida, filo de vuelta) como Shape; inS/inE: cuánto se mete
// de cada borde; u0..u1 el tramo; S: con sus dientes.
function crescentShape(L, inS = 0, inE = 0, u0 = 0, u1 = 1, S = null) {
  const a = [];
  const b = [];
  for (const p of L) {
    if (p.u < u0 - 1e-6 || p.u > u1 + 1e-6) continue;
    const nx = Math.sin(p.th);
    const ny = -Math.cos(p.th);
    const w = Math.max(0, p.w - inS - inE);
    const t = S ? tooth(S, p.u) : 0;
    a.push(new THREE.Vector2(p.x + nx * (inS - t), p.y + ny * (inS - t)));
    b.push(new THREE.Vector2(p.x + nx * (inS + w), p.y + ny * (inS + w)));
  }
  b.reverse();
  return new THREE.Shape([...a, ...b]);
}

// Una tira entre dos curvas (para el filo y la veta del lomo), parada en la cara z.
function stripGeo(L, from, to, u0, u1, z) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (const p of L) {
    if (p.u < u0 || p.u > u1) continue;
    const nx = Math.sin(p.th);
    const ny = -Math.cos(p.th);
    const a = from(p);
    const b = to(p);
    pos.push(p.x + nx * a, p.y + ny * a, z, p.x + nx * b, p.y + ny * b, z);
    uv.push(p.u, 0, p.u, 1);
  }
  const n = pos.length / 6;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Un tubo que se afina (r de 0 a 1 por el largo) por los puntos dados.
function taperTube(points, r0, r1, rs = 8) {
  const crv = new THREE.CatmullRomCurve3(points);
  const seg = Math.max(8, points.length * 2);
  const fr = crv.computeFrenetFrames(seg, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = crv.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      const n = fr.normals[i].clone().multiplyScalar(Math.cos(a)).add(fr.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rs; j++) {
      const a = i * (rs + 1) + j;
      const b = a + rs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// (para juntar: todas con los mismos atributos)
const clean = (g) => {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  return o;
};
const merge = (list) => mergeGeometries(list.map(clean));

// ---------------- las texturas ----------------
let TEX = null;
function wrapTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// (con su semilla: siempre la misma guadaña)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function textures() {
  if (TEX) return TEX;
  const R = rng(1877);
  const N = 256;
  // los dibujos se repiten en los bordes (la textura se repite sin costura)
  const tile = (f) => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(dx, dy);
  };
  const blob = (ctx, x, y, r, c0, c1) =>
    tile((dx, dy) => {
      const gr = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      ctx.fillStyle = gr;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  // la nebulosa: negro violeta con nubes grandes de violeta, magenta y azul
  // hondo (bien a la vista), vetas oscuras y estrellitas
  const nc = document.createElement('canvas');
  nc.width = nc.height = N;
  const n = nc.getContext('2d');
  n.fillStyle = '#07020d';
  n.fillRect(0, 0, N, N);
  n.globalCompositeOperation = 'lighter';
  const cols = ['122,44,255', '208,58,255', '42,70,255', '255,79,216', '120,40,230'];
  for (let i = 0; i < 52; i++) {
    const c = cols[i % cols.length];
    blob(n, R() * N, R() * N, 22 + R() * 80, `rgba(${c},${0.1 + R() * 0.18})`, `rgba(${c},0)`);
  }
  // (unos núcleos claros: el corazón de las nubes)
  for (let i = 0; i < 10; i++) blob(n, R() * N, R() * N, 6 + R() * 16, 'rgba(255,215,255,0.35)', 'rgba(255,160,255,0)');
  n.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 22; i++) blob(n, R() * N, R() * N, 10 + R() * 30, 'rgba(3,0,8,0.6)', 'rgba(3,0,8,0)');
  for (let i = 0; i < 190; i++) {
    const s = R();
    n.fillStyle = `rgba(${s > 0.8 ? '255,235,255' : '230,210,255'},${0.4 + s * 0.6})`;
    n.fillRect(R() * N, R() * N, s > 0.9 ? 2 : 1, s > 0.9 ? 2 : 1);
  }
  const nebula = wrapTex(nc);
  nebula.repeat.set(1.7, 1.7);
  // las estrellas de adelante (sobre negro: se suman)
  const sc = document.createElement('canvas');
  sc.width = sc.height = N;
  const s = sc.getContext('2d');
  s.fillStyle = '#000';
  s.fillRect(0, 0, N, N);
  for (let i = 0; i < 56; i++) {
    const x = R() * N;
    const y = R() * N;
    const r = 2 + R() * 5;
    const warm = R() < 0.3;
    blob(s, x, y, r, warm ? 'rgba(255,225,255,1)' : 'rgba(225,205,255,1)', 'rgba(0,0,0,0)');
    if (r > 5.2) {
      s.fillStyle = 'rgba(255,240,255,0.85)';
      s.fillRect(x - 7, y - 0.5, 14, 1);
      s.fillRect(x - 0.5, y - 7, 1, 14);
    }
  }
  const stars = wrapTex(sc);
  stars.repeat.set(3, 3);
  // el ébano: casi negro, con la veta fina
  const wc = document.createElement('canvas');
  wc.width = 64;
  wc.height = 256;
  const w = wc.getContext('2d');
  w.fillStyle = '#140e1a';
  w.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) {
    const x = R() * 64;
    w.strokeStyle = `rgba(${R() < 0.5 ? '40,28,52' : '8,5,12'},${0.4 + R() * 0.5})`;
    w.lineWidth = 0.6 + R() * 1.4;
    w.beginPath();
    w.moveTo(x, 0);
    w.bezierCurveTo(x + R() * 8 - 4, 90, x + R() * 8 - 4, 170, x + R() * 6 - 3, 256);
    w.stroke();
  }
  const wood = wrapTex(wc);
  wood.repeat.set(1, 3);
  // las vetas que laten (el brillo): grietas finas que suben; en la mejorada,
  // de oro y con runas (marcas de tres trazos) entre las grietas
  const veinCanvas = (runes) => {
    const vc = document.createElement('canvas');
    vc.width = 64;
    vc.height = 256;
    const v = vc.getContext('2d');
    v.fillStyle = '#000';
    v.fillRect(0, 0, 64, 256);
    v.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 7; i++) {
      let x = R() * 64;
      let y = R() * 256;
      v.lineWidth = 0.8 + R() * 0.9;
      v.beginPath();
      v.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += R() * 10 - 5;
        y += 6 + R() * 14;
        v.lineTo(x, y);
        if (R() < 0.25) {
          v.moveTo(x, y);
          v.lineTo(x + R() * 12 - 6, y + 6 + R() * 8);
          v.moveTo(x, y);
        }
      }
      v.stroke();
    }
    if (runes) {
      v.lineWidth = 1.6;
      for (let i = 0; i < 10; i++) {
        const x = 8 + R() * 48;
        const y = (i / 10) * 256 + 6;
        v.beginPath();
        v.moveTo(x, y);
        v.lineTo(x + 6, y + 8);
        v.lineTo(x, y + 16);
        v.moveTo(x + 3, y + 4);
        v.lineTo(x + 10, y + 4);
        v.stroke();
      }
    }
    const t = wrapTex(vc, false);
    t.repeat.set(1, 3);
    return t;
  };
  const veins = veinCanvas(false);
  const runes = veinCanvas(true);
  // el cuero de las empuñaduras: morado oscuro, envuelto en diagonal
  const lc = document.createElement('canvas');
  lc.width = 64;
  lc.height = 64;
  const l = lc.getContext('2d');
  l.fillStyle = '#2a1436';
  l.fillRect(0, 0, 64, 64);
  for (let i = -4; i < 10; i++) {
    l.strokeStyle = 'rgba(8,2,12,0.85)';
    l.lineWidth = 1.6;
    l.beginPath();
    l.moveTo(i * 10, 0);
    l.lineTo(i * 10 + 32, 64);
    l.stroke();
    l.strokeStyle = 'rgba(120,70,150,0.25)';
    l.lineWidth = 0.8;
    l.beginPath();
    l.moveTo(i * 10 + 2, 0);
    l.lineTo(i * 10 + 34, 64);
    l.stroke();
  }
  const leather = wrapTex(lc);
  leather.repeat.set(2, 1.5);
  // el halo del sol tapado (la mejorada): un resplandor de oro que se apaga
  // hacia afuera, con el anillo más claro junto al disco
  const hc = document.createElement('canvas');
  hc.width = hc.height = 128;
  const h = hc.getContext('2d');
  // (el medio, donde está el disco, vacío: si no, el resplandor lo llenaba y
  // el eclipse se veía un sol)
  const gr = h.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.3, 'rgba(255,240,210,0)');
  gr.addColorStop(0.37, 'rgba(255,235,200,0.9)');
  gr.addColorStop(0.44, 'rgba(255,190,90,0.5)');
  gr.addColorStop(0.7, 'rgba(255,140,40,0.14)');
  gr.addColorStop(1, 'rgba(255,120,30,0)');
  h.fillStyle = gr;
  h.fillRect(0, 0, 128, 128);
  // (y las lenguas de la corona)
  h.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + R() * 0.2;
    const len = 34 + R() * 26;
    h.strokeStyle = `rgba(255,200,120,${0.12 + R() * 0.12})`;
    h.lineWidth = 2 + R() * 3;
    h.beginPath();
    h.moveTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24);
    h.lineTo(64 + Math.cos(a) * len, 64 + Math.sin(a) * len);
    h.stroke();
  }
  const halo = new THREE.CanvasTexture(hc);
  halo.colorSpace = THREE.SRGBColorSpace;
  TEX = { nebula, stars, wood, veins, runes, leather, halo };
  return TEX;
}

// ---------------- los materiales ----------------
// Juegos: 'vm' (la de la mano: la Furia y la ejecutora la tiñen), 'world' (la
// caja, el Pack-a-Pava, la misión) y los de los compañeros (copias de 'world',
// cada uno la suya: Desgarrador.avatarMats). Lo que brilla no se pasa de
// blanco (toneMapped false).
export const VIOLET = new THREE.Color(0.62, 0.3, 1);
export const GOLD = new THREE.Color(1, 0.7, 0.24);
const SETS = {};
function makeMats() {
  const T = textures();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, ...o });
  const glow = (o) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, ...o });
  const add = (o) => glow({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, forceSinglePass: true, ...o });
  const M = {
    blade: std({ color: 0x16101e, metalness: 1, roughness: 0.24 }),
    nebula: glow({ map: T.nebula, color: new THREE.Color(1.15, 1.05, 1.25), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    stars: add({ map: T.stars, color: new THREE.Color(1.1, 0.95, 1.25), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    edge: glow({ color: VIOLET.clone().multiplyScalar(1.8), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    edgeGold: glow({ color: GOLD.clone().multiplyScalar(1.6), polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
    shaft: std({ color: 0xffffff, map: T.wood, roughness: 0.42, metalness: 0.1, emissive: VIOLET.clone(), emissiveMap: T.veins, emissiveIntensity: 1 }),
    shaftUp: std({ color: 0xffffff, map: T.wood, roughness: 0.42, metalness: 0.1, emissive: GOLD.clone(), emissiveMap: T.runes, emissiveIntensity: 1.3 }),
    grip: std({ color: 0xffffff, map: T.leather, roughness: 0.78 }),
    metal: std({ color: 0x3a3448, metalness: 1, roughness: 0.32 }),
    gold: std({ color: 0xe8b04a, metalness: 1, roughness: 0.22, emissive: 0x6a3a00, emissiveIntensity: 0.35 }),
    // (el disco del eclipse: negro de verdad, sin reflejos que lo aclaren)
    disc: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    corona: glow({ color: new THREE.Color(0.75, 0.45, 1).multiplyScalar(2.4) }),
    coronaGold: glow({ color: GOLD.clone().multiplyScalar(1.35) }),
    halo: add({ map: T.halo, color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(0.42) }),
    crystal: std({ color: 0x8a4dff, roughness: 0.15, metalness: 0.2, emissive: new THREE.Color(0.55, 0.2, 1), emissiveIntensity: 1.5 }),
    shards: glow({ vertexColors: true }),
    bolts: add({ vertexColors: true }),
  };
  // (los colores de siempre, para volver después de la Furia o la ejecutora)
  M.base = {};
  for (const k of ['nebula', 'stars', 'edge', 'edgeGold', 'corona', 'coronaGold', 'halo', 'shards']) M.base[k] = M[k].color.clone();
  M.base.veins = M.shaft.emissiveIntensity;
  M.base.runes = M.shaftUp.emissiveIntensity;
  M.base.crystal = M.crystal.emissive.clone();
  return M;
}
export function cosmicMats(set = 'vm') {
  return (SETS[set] ||= makeMats());
}
// Una copia de los de 'world' (los mismos programas: no compila nada nuevo).
export function cloneMats() {
  const W = cosmicMats('world');
  const M = {};
  for (const k of Object.keys(W)) M[k] = k === 'base' ? W.base : W[k].clone();
  return M;
}

// Los reflejos del acero: el mapa de la sala de Weapons (como el sable).
const ENV_K = { blade: 0.6, metal: 0.8, gold: 0.9, shaft: 0.25, shaftUp: 0.25, crystal: 0.6 };
export function setCosmicEnv(envMap) {
  for (const M of Object.values(SETS)) {
    for (const [k, v] of Object.entries(ENV_K)) {
      if (M[k].envMap === envMap) continue;
      M[k].envMap = envMap;
      M[k].envMapIntensity = v;
      M[k].needsUpdate = true;
    }
  }
}

// Tiñe un juego: mode 'base' | 'furia' (neón, la corona encendida) | 'exec'
// (violeta y rosa, la ejecutora) | 'flare' (el destello al sacarla); k: cuánto
// (0..1); beat: el latido rápido (0..1); breath: la respiración lenta del filo
// (0..1, siempre).
const _c = new THREE.Color();
const NEON = new THREE.Color(0.9, 0.45, 1);
const HOT = new THREE.Color(1, 0.86, 0.6);
const PINK = new THREE.Color(1, 0.38, 0.78);
const PINKG = new THREE.Color(1, 0.62, 0.8);
const WHITE = new THREE.Color(1, 0.95, 1);
// (furia11) under 'divine': de la quieta divina de la del Eclipse hacia `mode`
// sin salto (concentrando la Furia: lo divino se va en 1 - k mientras entra el neón).
export function tintMats(M, mode, k = 1, beat = 0, breath = 0.5, under = null) {
  const B = M.base;
  // el filo y la corona respiran siempre (lento)
  const br = 0.78 + 0.36 * breath;
  M.nebula.color.copy(B.nebula).multiplyScalar(0.92 + 0.16 * breath);
  M.stars.color.copy(B.stars);
  M.edge.color.copy(B.edge).multiplyScalar(br);
  M.edgeGold.color.copy(B.edgeGold).multiplyScalar(br);
  M.corona.color.copy(B.corona).multiplyScalar(br);
  M.coronaGold.color.copy(B.coronaGold).multiplyScalar(0.85 + 0.25 * breath);
  M.halo.color.copy(B.halo).multiplyScalar(0.8 + 0.35 * breath);
  M.shards.color.copy(B.shards);
  M.shaft.emissiveIntensity = B.veins * (0.75 + 0.5 * breath);
  M.shaftUp.emissiveIntensity = B.runes * (0.75 + 0.5 * breath);
  M.crystal.emissive.copy(B.crystal);
  if (mode === 'base' || k <= 0) return;
  // (v3) la del Eclipse quieta: la corona y el halo prendidos, el cosmos más
  // vivo y el filo de oro que late (poder divino también en la mano)
  if (mode === 'divine' || under === 'divine') {
    const d = 0.75 + 0.5 * breath;
    // (cuánto de lo divino: entero, o lo que queda debajo del otro tinte)
    const wd = mode === 'divine' ? 1 : Math.max(0, 1 - k);
    const dv = (x) => 1 + (x - 1) * wd;
    M.coronaGold.color.multiplyScalar(dv(1.35 * d));
    M.halo.color.multiplyScalar(dv(1.7 * d));
    M.edgeGold.color.multiplyScalar(dv(1.1 + 0.25 * beat));
    M.nebula.color.multiplyScalar(dv(1.15));
    M.stars.color.multiplyScalar(dv(1.3));
    M.shaftUp.emissiveIntensity += 0.6 * d * wd;
    if (mode === 'divine') return;
  }
  if (mode === 'flare') {
    const f = 1 + 1.1 * k;
    for (const key of ['edge', 'edgeGold', 'corona', 'coronaGold', 'halo', 'shards']) M[key].color.multiplyScalar(f);
    M.shaftUp.emissiveIntensity += 2 * k;
    M.shaft.emissiveIntensity += 1.5 * k;
    return;
  }
  const C = mode === 'exec' ? PINK : NEON;
  const G = mode === 'exec' ? PINKG : HOT;
  const g = 1 + beat * 0.4;
  // (guadana5: con la Furia la hoja entera se lavaba en una mancha blanca con
  // el bloom: el cuerpo queda oscuro y profundo, el neón va en el filo.
  // globalThis.__mduDesgOldFuriaTint: como antes)
  const OLDF = globalThis.__mduDesgOldFuriaTint === true;
  M.nebula.color.lerp(_c.copy(C).multiplyScalar((OLDF ? 1.45 : 0.75) * g), k);
  M.stars.color.lerp(_c.copy(C).multiplyScalar((OLDF ? 1.8 : 1.5) * g), k);
  // (guadana5: el filo menos encendido: con el resplandor, la hoja era una
  // mancha de luz delante de la cara)
  const eK = OLDF ? 1 : 0.62;
  M.edge.color.lerp(_c.copy(C).multiplyScalar(2.6 * g * eK), k);
  M.edgeGold.color.lerp(_c.copy(G).multiplyScalar(1.9 * g * eK), k);
  M.corona.color.lerp(_c.copy(C).multiplyScalar(2.4 * g * eK), k);
  M.coronaGold.color.lerp(_c.copy(G).multiplyScalar(2.1 * g * eK), k);
  M.halo.color.lerp(_c.copy(NEON).multiplyScalar((OLDF ? 0.45 : 0.18) * g), k);
  M.shards.color.lerp(_c.copy(WHITE).multiplyScalar(1.4 * g), k);
  M.shaft.emissiveIntensity += k * (1.8 + beat);
  M.shaftUp.emissiveIntensity += k * (2.2 + beat);
  M.crystal.emissive.lerp(C, k);
}

// El cosmos de la hoja se mueve despacio (la nebulosa) y las estrellas más
// rápido (por delante: parece que la hoja es una ventana). Lo llama
// Desgarrador.update; rate sube con la Furia.
export function driftCosmos(dt, rate = 1) {
  const T = textures();
  T.nebula.offset.x = (T.nebula.offset.x + dt * 0.016 * rate) % 1;
  T.nebula.offset.y = (T.nebula.offset.y + dt * 0.007 * rate) % 1;
  T.stars.offset.x = (T.stars.offset.x + dt * 0.045 * rate) % 1;
  T.stars.offset.y = (T.stars.offset.y - dt * 0.022 * rate) % 1;
  T.halo.rotation = 0;
}

// ---------------- las esquirlas y los rayos ----------------
// Las esquirlas: pedacitos de espacio roto (oscuros por dentro, con el borde
// encendido) que flotan alrededor de la hoja, nacen en el asta y se van
// apagando hacia la punta, girando. Una geometría por variante, con las
// posiciones que se escriben cada cuadro (animScythe): la usan todas las
// guadañas de esa variante (la de la mano y las de los compañeros).
const SHARD_V = 6;
function shardSet(up) {
  const R = rng(up ? 77 : 33);
  const n = up ? 16 : 9;
  const list = [];
  for (let i = 0; i < n; i++) {
    const gold = up && i % 2 === 0;
    list.push({
      u0: R(),
      speed: 0.05 + R() * 0.05,
      side: R() < 0.55 ? 1 : -1,
      off: 0.025 + R() * 0.06,
      zoff: (R() < 0.5 ? -1 : 1) * (0.01 + R() * 0.05),
      size: (up ? 0.022 : 0.018) + R() * 0.02,
      spin: (R() < 0.5 ? -1 : 1) * (1 + R() * 2.5),
      tilt: R() * Math.PI,
      ph: R() * 6.28,
      jag: Array.from({ length: SHARD_V - 1 }, () => 0.45 + R() * 0.55),
      rim: gold ? [1.7, 1.15, 0.35] : [1.05, 0.55, 1.9],
    });
  }
  const pos = new Float32Array(n * SHARD_V * 3);
  const col = new Float32Array(n * SHARD_V * 3);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const b = i * SHARD_V;
    col.set([0.03, 0.0, 0.07], b * 3);
    for (let j = 1; j < SHARD_V; j++) col.set(list[i].rim, (b + j) * 3);
    for (let j = 1; j < SHARD_V; j++) idx.push(b, b + j, b + (j % (SHARD_V - 1)) + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.3, TOP_Y - 0.2, 0), 1.2);
  return { g, list, up };
}
// Los rayos de la Furia: cintas quebradas que saltan del filo al aire.
const BOLTS = 7;
const BOLT_P = 8;
function boltSet(up) {
  const pos = new Float32Array(BOLTS * BOLT_P * 2 * 3);
  const col = new Float32Array(BOLTS * BOLT_P * 2 * 3);
  const idx = [];
  for (let b = 0; b < BOLTS; b++) {
    const c = up && b % 2 ? [2.2, 1.6, 0.7] : [1.6, 1.0, 2.4];
    for (let i = 0; i < BOLT_P; i++) {
      const f = 1 - i / (BOLT_P - 1);
      const v = (b * BOLT_P + i) * 2;
      col.set([c[0] * (0.4 + f), c[1] * (0.4 + f), c[2] * (0.4 + f)], v * 3);
      col.set([c[0] * (0.4 + f), c[1] * (0.4 + f), c[2] * (0.4 + f)], (v + 1) * 3);
      if (i < BOLT_P - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.3, TOP_Y - 0.2, 0), 1.3);
  return { g, t: 0, up };
}
let FX = null;
function fxSets() {
  return (FX ||= { shards: [shardSet(0), shardSet(1)], bolts: [boltSet(0), boltSet(1)] });
}
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
// Mueve las esquirlas (siempre) y, si bolts, rehace los rayos cada tanto.
export function animScythe(time, dt, bolts = false) {
  const F = fxSets();
  // (guadana5: las esquirlas ya no se ven: no se mueven)
  for (const S of globalThis.__mduDesgOldBubbles === true ? F.shards : []) {
    const L = CURVES[S.up].main;
    const P = S.g.attributes.position.array;
    for (let i = 0; i < S.list.length; i++) {
      const s = S.list[i];
      const u = (((s.u0 + time * s.speed) % 1) + 1) % 1;
      const fade = Math.sin(Math.PI * u) ** 0.7;
      const p = at(L, 0.05 + u * 0.9);
      const nx = Math.sin(p.th);
      const ny = -Math.cos(p.th);
      // del lado del filo (afuera del filo) o del lomo (afuera del lomo)
      const d = s.side > 0 ? p.w + s.off : -s.off - 0.01;
      const bob = Math.sin(time * 1.7 + s.ph) * 0.012;
      const cx = p.x + nx * (d + bob);
      const cy = p.y + ny * (d + bob);
      const cz = s.zoff + Math.sin(time * 0.9 + s.ph) * 0.015;
      const b = i * SHARD_V * 3;
      P[b] = cx;
      P[b + 1] = cy;
      P[b + 2] = cz;
      const a0 = time * s.spin + s.ph;
      const ct = Math.cos(s.tilt + Math.sin(time * 0.6 + s.ph) * 0.6);
      const st = Math.sin(s.tilt + Math.sin(time * 0.6 + s.ph) * 0.6);
      for (let j = 1; j < SHARD_V; j++) {
        const a = a0 + (j / (SHARD_V - 1)) * Math.PI * 2;
        const r = s.size * fade * s.jag[j - 1];
        const lx = Math.cos(a) * r;
        const ly = Math.sin(a) * r;
        P[b + j * 3] = cx + lx;
        P[b + j * 3 + 1] = cy + ly * ct;
        P[b + j * 3 + 2] = cz + ly * st;
      }
    }
    S.g.attributes.position.needsUpdate = true;
  }
  if (!bolts) return;
  for (const B of F.bolts) {
    B.t -= dt;
    if (B.t > 0) continue;
    B.t = 0.05;
    const L = CURVES[B.up].main;
    const P = B.g.attributes.position.array;
    for (let b = 0; b < BOLTS; b++) {
      // del filo (o del lomo) hacia afuera, quebrado
      const u = 0.1 + Math.random() * 0.85;
      const p = at(L, u);
      const out = Math.random() < 0.7 ? 1 : -1;
      const nx = Math.sin(p.th) * out;
      const ny = -Math.cos(p.th) * out;
      const sx = out > 0 ? p.x + Math.sin(p.th) * p.w : p.x;
      const sy = out > 0 ? p.y - Math.cos(p.th) * p.w : p.y;
      const len = 0.06 + Math.random() * 0.16;
      const tx = Math.cos(p.th) * (Math.random() - 0.3) * 0.12;
      const ty = Math.sin(p.th) * (Math.random() - 0.3) * 0.12;
      const z0 = (Math.random() - 0.5) * 0.03;
      const w = 0.0025 + Math.random() * 0.002;
      for (let i = 0; i < BOLT_P; i++) {
        const f = i / (BOLT_P - 1);
        const j = i && i < BOLT_P - 1 ? (Math.random() - 0.5) * 0.035 : 0;
        _p.set(sx + nx * len * f + tx * f + -ny * j, sy + ny * len * f + ty * f + nx * j, z0 + (Math.random() - 0.5) * 0.02 * f);
        _n.set(-ny, nx, 0).multiplyScalar(w * (1 - f * 0.7));
        const v = (b * BOLT_P + i) * 6;
        P[v] = _p.x + _n.x;
        P[v + 1] = _p.y + _n.y;
        P[v + 2] = _p.z;
        P[v + 3] = _p.x - _n.x;
        P[v + 4] = _p.y - _n.y;
        P[v + 5] = _p.z;
      }
    }
    B.g.attributes.position.needsUpdate = true;
  }
}

// ---------------- las geometrías ----------------
// Por variante: { material: geometría juntada } (una malla por material).
const GEO = [null, null];
function geos(up) {
  if (GEO[up]) return GEO[up];
  const C = CURVES[up];
  const P = {};
  const put = (key, g) => (P[key] ||= []).push(g);
  const fit = up ? 'gold' : 'metal';
  // el asta (un poco más gruesa abajo) y las empuñaduras
  put(up ? 'shaftUp' : 'shaft', new THREE.CylinderGeometry(R_TOP, R_BOT, SHAFT_L, 14, 6, false).translate(0, BUTT_Y + SHAFT_L / 2, 0));
  for (const y of [0, GRIP_L_Y]) put('grip', new THREE.CylinderGeometry(rr(y) + GRIP_T, rr(y) + GRIP_T + 0.0004, 0.18, 14, 1, true).translate(0, y, 0));
  const ring = (y, r, t = 0.0032) => new THREE.TorusGeometry(r, t, 6, 18).rotateX(Math.PI / 2).translate(0, y, 0);
  for (const y of [0, GRIP_L_Y]) for (const s of [-1, 1]) put(fit, ring(y + s * 0.092, rr(y) + GRIP_T + 0.0013));
  // (la mejorada: tres bandas de oro por el asta)
  if (up) for (const y of [0.3, 0.55, 0.8]) put('gold', ring(y, rr(y) + 0.003, 0.0042));
  // la cabeza: el collar que abraza el asta, con sus anillos y cuatro colmillos para abajo
  put(fit, new THREE.CylinderGeometry(R_TOP + 0.008, R_TOP + 0.011, 0.17, 14).translate(0, TOP_Y - 0.115, 0));
  for (const y of [TOP_Y - 0.03, TOP_Y - 0.2]) put(fit, ring(y, R_TOP + 0.011, 0.0045));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    put(fit, new THREE.ConeGeometry(0.005, 0.06, 6).rotateX(Math.PI).translate(Math.cos(a) * (R_TOP + 0.012), TOP_Y - 0.235, Math.sin(a) * (R_TOP + 0.012)));
  }
  // la espiga: la planchuela que agarra la hoja
  put(fit, new THREE.BoxGeometry(0.07, 0.13, BLADE_T + 0.015).translate(0.01, TOP_Y - 0.1, 0));
  // la punta de arriba (la mejorada: con la luna creciente)
  put(fit, new THREE.ConeGeometry(R_TOP + 0.004, 0.16, 8).translate(0, TOP_Y + 0.08, 0));
  if (up) put('gold', new THREE.TorusGeometry(0.045, 0.0065, 6, 24, Math.PI * 1.3).rotateZ(-Math.PI * 0.15 - Math.PI / 2).translate(0.0, TOP_Y + 0.07, 0));
  put('crystal', new THREE.OctahedronGeometry(0.014, 0).scale(1, 1.5, 1).translate(0, TOP_Y + 0.015, 0));
  // el contrapeso de abajo: la copa, tres garras que agarran un cristal y el regatón
  put(fit, new THREE.CylinderGeometry(R_BOT + 0.007, R_BOT + 0.003, 0.05, 12).translate(0, BUTT_Y + 0.02, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    put(fit, new THREE.ConeGeometry(0.004, 0.1, 5).rotateZ(Math.PI).rotateX(0.12).rotateY(a).translate(Math.cos(a) * 0.017, BUTT_Y - 0.045, Math.sin(a) * 0.017));
  }
  put(fit, ring(BUTT_Y - 0.08, 0.021, 0.004));
  put('crystal', new THREE.OctahedronGeometry(0.027, 0).scale(1, 1.8, 1).translate(0, BUTT_Y - 0.06, 0));
  put(fit, new THREE.ConeGeometry(0.009, 0.08, 6).rotateX(Math.PI).translate(0, BUTT_Y - 0.15, 0));
  // (la mejorada: la media luna de contrapeso, de oro)
  if (up) {
    const spur = curve({ base: new THREE.Vector2(0.012, BUTT_Y + 0.03), len: 0.17, width: 0.04, th: (u) => -0.35 - 1.1 * u }, 0.9);
    put('gold', new THREE.ExtrudeGeometry(crescentShape(spur), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 1 }).translate(0, 0, -0.003));
  }
  // las hojas: el acero negro, con bisel (el filo afilado)
  const ext = { depth: BLADE_T, bevelEnabled: true, bevelThickness: BEVEL_T, bevelSize: 0.0032, bevelSegments: 2, curveSegments: 1 };
  put('blade', new THREE.ExtrudeGeometry(crescentShape(C.main, 0, 0, 0, 1, MAIN[up]), ext).translate(0, 0, -BLADE_T / 2));
  put('blade', new THREE.ExtrudeGeometry(crescentShape(C.back), { ...ext, bevelSize: 0.0022 }).translate(0, 0, -BLADE_T / 2));
  // el cosmos de adentro (las dos caras de las dos hojas), metido desde el lomo y el filo
  const inlay = (L, z, inS, inE, u1) => new THREE.ShapeGeometry(crescentShape(L, inS, inE, 0.03, u1), 1).translate(0, 0, z);
  for (const s of [1, -1]) {
    put('cosmos', inlay(C.main, s * (FACE_Z + 0.0004), 0.009, 0.014, 0.88));
    put('cosmos', inlay(C.back, s * (FACE_Z + 0.0004), 0.006, 0.01, 0.8));
  }
  // el filo encendido: una tira por cara y un tubito por el borde (se ve de
  // canto). La mejorada: de oro por afuera y violeta por dentro.
  const strips = (L, wE, inner) => {
    for (const s of [1, -1]) {
      const z = s * (FACE_Z + 0.0006);
      put(up ? 'edgeGold' : 'edge', stripGeo(L, (p) => p.w - Math.min(wE, p.w * 0.45), (p) => p.w, 0.02, 1, z));
      if (up && inner) put('edge', stripGeo(L, (p) => p.w - Math.min(wE + inner, p.w * 0.6), (p) => p.w - Math.min(wE, p.w * 0.45), 0.02, 1, z));
    }
    const ePts = [];
    for (let u = 0.03; u <= 0.996; u += 0.03) ePts.push(edgeAt(at(L, Math.min(0.996, u)), new THREE.Vector3(), 1.02));
    put(up ? 'edgeGold' : 'edge', taperTube(ePts, up ? 0.0032 : 0.0028, 0.0009, 6));
  };
  strips(C.main, up ? 0.009 : 0.012, 0.01);
  strips(C.back, 0.008, 0.006);
  // (la mejorada: una veta violeta por el lomo)
  if (up) for (const s of [1, -1]) put('edge', stripGeo(C.main, () => 0.007, () => 0.011, 0.45, 0.9, s * (FACE_Z + 0.0006)));
  // el eclipse en la unión: el disco negro; la común, con un anillo violeta;
  // la mejorada, grande, tapando un sol de oro: la corona, los rayos y el halo
  const DR = up ? 0.072 : 0.032;
  put('disc', new THREE.CylinderGeometry(DR, DR, 0.03, 40).rotateX(Math.PI / 2).translate(JOINT.x, JOINT.y, 0));
  if (!up) for (const s of [-1, 1]) put('corona', new THREE.TorusGeometry(DR + 0.003, 0.0035, 8, 40).translate(JOINT.x, JOINT.y, s * 0.012));
  else {
    for (const s of [-1, 1]) {
      put('coronaGold', new THREE.TorusGeometry(DR + 0.004, 0.0055, 8, 48).translate(JOINT.x, JOINT.y, s * 0.012));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.1;
        const len = i % 2 ? 0.032 : 0.06;
        put('coronaGold', new THREE.ConeGeometry(0.006, len, 5).translate(0, DR + 0.006 + len / 2, 0).rotateZ(a - Math.PI / 2).translate(JOINT.x, JOINT.y, s * 0.012));
      }
      // el anillo de diamante: un punto de luz en el borde del disco
      put('coronaGold', new THREE.SphereGeometry(0.011, 10, 8).translate(JOINT.x + Math.cos(0.8) * DR, JOINT.y + Math.sin(0.8) * DR, s * 0.014));
      put('halo', new THREE.PlaneGeometry(0.34, 0.34).translate(JOINT.x, JOINT.y, s * 0.012));
    }
  }
  const G = {};
  for (const [k, list] of Object.entries(P)) G[k] = merge(list);
  GEO[up] = G;
  return G;
}

// La guadaña armada (con los materiales del juego M): { group, tip, mid,
// bolts (la malla de los rayos de la Furia: escondida) }. tip / mid: la punta
// y la mitad del filo (la estela).
export function buildScythe(up = 0, M = cosmicMats('vm')) {
  up = up ? 1 : 0;
  const G = geos(up);
  const g = new THREE.Group();
  const add = (geo, mat, order = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    g.add(m);
    return m;
  };
  for (const k of ['shaft', 'shaftUp', 'grip', 'metal', 'gold', 'blade', 'edge', 'edgeGold', 'disc', 'corona', 'coronaGold', 'crystal']) if (G[k]) add(G[k], M[k]);
  add(G.cosmos, M.nebula);
  add(G.cosmos, M.stars, 3);
  if (G.halo) add(G.halo, M.halo, 4);
  const F = fxSets();
  // (guadana5: las esquirlas que flotaban alrededor de la hoja eran las
  // "burbujitas totalmente de más": escondidas. globalThis.__mduDesgOldBubbles: vuelven)
  const shardM = add(F.shards[up].g, M.shards);
  shardM.frustumCulled = false;
  shardM.visible = globalThis.__mduDesgOldBubbles === true;
  const bolts = add(F.bolts[up].g, M.bolts, 5);
  bolts.frustumCulled = false;
  bolts.visible = false;
  const tip = new THREE.Object3D();
  bladeEdge(0.995, tip.position, 0.5, up);
  // (la estela, de la punta a un poco antes: con la hoja grande, desde la
  // mitad era una sábana que tapaba media pantalla)
  const mid = new THREE.Object3D();
  bladeEdge(0.72, mid.position, 0.6, up);
  g.add(tip, mid);
  return { group: g, tip, mid, bolts };
}

// Una malla de los rayos de la Furia, a la vista (para compilarla en la carga).
export function boltsWarmMesh(M = cosmicMats('vm')) {
  const m = new THREE.Mesh(fxSets().bolts[1].g, M.bolts);
  m.frustumCulled = false;
  return m;
}

// La guadaña de tamaño real para el mundo (la caja, la misión, el muñeco de
// un compañero): el origen en la mano derecha, el asta para arriba (+y) y la
// hoja hacia +x. M: los materiales (los de 'world' si no viene).
export function desgarradorModel(up = 0, M = null) {
  const s = buildScythe(up, M || cosmicMats('world'));
  s.group.userData.cosmic = { tip: s.tip, mid: s.mid, bolts: s.bolts };
  s.group.name = up ? 'desgarradorEclipse' : 'desgarradorCosmico';
  // (v4) la del Eclipse de tamaño real (el muñeco de un compañero, la caja):
  // los aros de eclipse que giran en la cabeza, para que de lejos se lea otra
  // cosa que la común (globalThis.__mduNoDesgOrb: sin ellos)
  if (up && globalThis.__mduNoDesgOrb !== true) s.group.add(worldOrb());
  return s.group;
}
let WORB = null;
function worldOrb() {
  if (!WORB) {
    const add = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    WORB = { gold: add(new THREE.Color(1, 0.72, 0.3).multiplyScalar(1.5)), violet: add(new THREE.Color(0.6, 0.25, 1).multiplyScalar(1.3)), g1: new THREE.TorusGeometry(0.2, 0.007, 6, 56), g2: new THREE.TorusGeometry(0.165, 0.005, 6, 48) };
  }
  const o = new THREE.Group();
  o.position.set(0, TOP_Y + 0.02, 0);
  const a = new THREE.Mesh(WORB.g1, WORB.gold);
  const b = new THREE.Mesh(WORB.g2, WORB.violet);
  a.renderOrder = b.renderOrder = 5;
  o.add(a, b);
  // (gira sola al dibujarse)
  a.onBeforeRender = () => {
    const t = performance.now() / 1000;
    a.rotation.set(1.1 + Math.sin(t * 0.7) * 0.2, t * 1.4, 0);
    b.rotation.set(-0.6, -t * 2.1, 0.4);
    a.updateMatrixWorld();
    b.updateMatrixWorld();
  };
  return o;
}

// La de la caja misteriosa (world/Interactables boxModel la agranda x2,6 y la
// gira de frente): acostada a lo largo de la caja, la hoja arriba, a escala.
export function desgarradorBoxModel(up = 0) {
  const s = desgarradorModel(up);
  s.scale.setScalar(0.25);
  s.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.12);
  // (el medio del asta en el centro)
  s.position.set(0, 0, -MID_Y * 0.25);
  const o = new THREE.Group();
  o.add(s);
  o.name = 'desgarradorCaja';
  return o;
}

// La del Pack-a-Pava (o lo que la muestre en una máquina que agranda x2,4):
// acostada, del largo de un sable.
export function desgarradorPapModel(up = 0) {
  const s = desgarradorModel(up);
  s.scale.setScalar(0.62 / 2.4);
  s.rotation.z = Math.PI / 2;
  s.position.set((MID_Y * 0.62) / 2.4, 0, 0);
  const o = new THREE.Group();
  o.add(s);
  return o;
}

// Las piezas de la guadaña espectral (la que se tira): las hojas, los filos,
// el cosmos, el eclipse y medio asta. La arma desgarradorFx con sus materiales
// de luz (sumados): { hoja, cosmos, filo, asta, corona } -> geometrías.
const SPEC = [null, null];
export function spectralGeos(up = 0) {
  up = up ? 1 : 0;
  if (SPEC[up]) return SPEC[up];
  const G = geos(up);
  const asta = new THREE.CylinderGeometry(R_TOP * 1.2, R_TOP * 0.6, 0.62, 10, 1).translate(0, TOP_Y - 0.31, 0);
  SPEC[up] = { hoja: G.blade, cosmos: G.cosmos, filo: merge([G.edgeGold || G.edge, ...(up ? [G.edge] : [])]), asta, corona: up ? G.coronaGold : G.corona };
  return SPEC[up];
}
// el centro de giro de la espectral (cerca del medio de la hoja)
export function spectralCenter(up = 0) {
  const p = at(CURVES[up ? 1 : 0].main, 0.32);
  return new THREE.Vector3(p.x * 0.8, p.y - 0.05, 0);
}
// (la de la común; weapons/desgarradorFx.js)
export const SPECTRAL_CENTER = spectralCenter(0);
