import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeSet } from './baseSkins';
import { fbm, hash } from './camoPaint';
import { VM, getMats } from './viewmodels';

// Los accesorios de la armería mejorada, puestos sobre el mate (core/armas.js
// dice cuáles lleva). Cada uno va en una parte del mate (bombilla, pico,
// virola, yerba, cuerpo) y se arma con la forma de ese mate: viewmodels
// buildMate (y nuevosMates finish) deja mate.userData.fit (el radio a cada
// altura, la boca y hasta dónde suben los dedos), la virola, la yerba y, en
// las guampas, el eje curvo. Lo que el mate tiene pegado al costado (el
// cargador del 47, el tambor, la manija de la taza, la dinamita) se mide acá
// (escanear) y las fajas lo esquivan. Así nada atraviesa la mano ni el mate.
// Texturas pintadas acá (relieve, brillo por partes), como weapons/baseSkins.js,
// y cada material se pinta recién la primera vez que se usa.
//
// ponerAccesorios(m, ids, T, { armeria }):
//   - en la mano (Weapons.modelOf) quedan puestos y fundidos (una malla por
//     material: pocas llamadas de dibujo);
//   - en la armería (ui/Armory) quedan sueltos, escondidos, para entrar y salir
//     con su animación: m.acc[id] = { nodes, hides, entra }.
// 'lanzapava' (no es un accesorio: el especialista del Mate 47) cuelga abajo
// de la bombilla; weapons/lanzapava.js lo maneja.

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
const V2 = (n) => new THREE.Vector2(n, n);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- texturas ----------------
const SETS = {};
const baked = (k, fn) => SETS[k] || (SETS[k] = fn());
// (otra copia de las mismas texturas, para repetirlas distinto)
function twin(S, x = 1, y = 1) {
  const c = (t) => {
    if (!t) return null;
    const n = t.clone();
    n.repeat.set(x, y);
    n.needsUpdate = true;
    return n;
  };
  return { map: c(S.map), normal: c(S.normal), orm: c(S.orm) };
}
function pbr(name, S, { n = 1, ao = 0.8, ...o } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: S.map || null, normalMap: S.normal, normalScale: V2(n), roughnessMap: S.orm, aoMap: S.orm, aoMapIntensity: ao, roughness: 1, ...o });
  m.name = `acc:${name}`;
  return m;
}
// celdas que se repiten (martillado, poros, escamas de zinc): distancia al
// punto más cercano (d1), al segundo (d2) y un número propio de la celda
function voro(u, v, n, s) {
  const x = u * n;
  const y = v * n;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const wx = ((cx % n) + n) % n;
      const wy = ((cy % n) + n) % n;
      const d = Math.hypot(cx + hash(wx, wy, s) - x, cy + hash(wx, wy, s + 7) - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(wx, wy, s + 13);
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}
// costuras: puntadas a lo largo de u en las alturas v0 (0 a 1)
function puntadas(u, v, rows, n = 70) {
  let s = 0;
  for (const r of rows) s = Math.max(s, smooth(0.035, 0.012, Math.abs(v - r)) * smooth(0.36, 0.3, Math.abs(frac(u * n) - 0.5)));
  return s;
}

// Oro o alpaca cincelados: guardas de hojitas en espiral entre filetes, el
// fondo picado (mate) y lo alto lustrado.
const cincelSet = () =>
  baked('cincel', () =>
    bakeSet(256, 256, (u, v) => {
      const band = frac(v * 2);
      const fil = smooth(0.06, 0.02, Math.abs(band - 0.04)) + smooth(0.06, 0.02, Math.abs(band - 0.96));
      const vine = Math.abs(Math.sin((u * 3 + Math.sin(band * Math.PI * 2) * 0.12 + band * 1.5) * Math.PI * 2));
      const leaf = smooth(0.35, 0.15, vine) * smooth(0.1, 0.2, band) * smooth(0.9, 0.8, band);
      const pick = fbm(u, v, 96, 96, 2, 501);
      const h = 0.55 + fil * 0.45 + leaf * 0.35 - (1 - leaf) * (1 - fil) * pick * 0.25;
      return { h, r: leaf || fil > 0.5 ? 0.55 : 0.6 + pick * 0.5 };
    }, { scale: 1.2, ao: 0.7 }),
  );
// alpaca o cobre martillados: hoyitos de martillo, cada uno con su brillo
const martilloSet = () =>
  baked('martillo', () =>
    bakeSet(128, 128, (u, v) => {
      const c = voro(u, v, 9, 41);
      const dent = smooth(0, 0.75, c.d1);
      return { h: dent * 0.55 + fbm(u, v, 32, 32, 2, 42) * 0.06, r: 0.28 + (1 - dent) * 0.1 + c.id * 0.08 };
    }, { scale: 1.3, ao: 0.35 }),
  );
// metal pulido: rayitas finas alrededor
const lisoSet = () =>
  baked('liso', () =>
    bakeSet(64, 256, (u, v) => {
      const s = fbm(u, v, 2, 160, 2, 51);
      return { h: s * 0.1, r: 0.16 + s * 0.12 };
    }, { scale: 0.7, ao: 0.15 }),
  );
// bronce: grano, y el verdín en lo hondo
const bronceSet = () =>
  baked('bronce', () =>
    bakeSet(128, 128, (u, v) => {
      const g = fbm(u, v, 24, 24, 3, 61);
      const pat = smooth(0.58, 0.78, fbm(u, v, 6, 6, 3, 62)) * (1 - g);
      const k = 0.82 + g * 0.3;
      const c = [190 * k, 130 * k, 64 * k].map((x, i) => x + ([74, 124, 98][i] - x) * pat * 0.45);
      return { c, h: g * 0.45 - pat * 0.25, r: 0.3 + pat * 0.4 + g * 0.08 };
    }, { color: true, scale: 1.2, ao: 0.6 }),
  );
// hierro pavonado: manchado, entre azul y negro
const hierroSet = () =>
  baked('hierro', () =>
    bakeSet(128, 128, (u, v) => {
      const g = fbm(u, v, 16, 16, 3, 71);
      const s = fbm(u, v, 64, 64, 2, 72);
      return { h: g * 0.25 + s * 0.1, r: 0.34 + g * 0.22 };
    }, { scale: 1, ao: 0.4 }),
  );
// asta negra lustrada: vetas ámbar a lo largo
const astaSet = () =>
  baked('asta', () =>
    bakeSet(128, 128, (u, v) => {
      const s = fbm(u, v, 40, 2, 3, 81);
      const vet = smooth(0.52, 0.78, s);
      const k = 0.85 + fbm(u, v, 8, 8, 2, 82) * 0.3;
      return { c: [(26 + vet * 92) * k, (19 + vet * 58) * k, (14 + vet * 26) * k], h: s * 0.2, r: 0.2 + (1 - vet) * 0.06 };
    }, { color: true, scale: 0.8, ao: 0.4 }),
  );
// hueso: veta a lo largo y poritos
const huesoSet = () =>
  baked('hueso', () =>
    bakeSet(128, 128, (u, v) => {
      const g = fbm(u, v, 6, 30, 3, 91);
      const pore = smooth(0.13, 0.05, voro(u, v, 16, 92).d1);
      const k = 0.88 + g * 0.16 - pore * 0.3;
      return { c: [228 * k, 214 * k, 184 * k], h: g * 0.3 - pore * 0.35, r: 0.5 + pore * 0.3 };
    }, { color: true, scale: 1, ao: 0.6 }),
  );
// caña tacuara: fibras a lo largo, verde amarillento
const tacuaraSet = () =>
  baked('tacuara', () =>
    bakeSet(128, 128, (u, v) => {
      const f = fbm(u, v, 64, 3, 3, 101);
      const m = fbm(u, v, 4, 4, 2, 102);
      const k = 0.82 + f * 0.3;
      return { c: [(196 - m * 30) * k, (178 - m * 10) * k, (92 + m * 12) * k], h: f * 0.35, r: 0.4 + f * 0.15 };
    }, { color: true, scale: 1, ao: 0.4 }),
  );
// los cueros (u alrededor, v de abajo arriba): crudo (traslúcido, manchado),
// carpincho (poros de a tres y una costura al costado), vaqueta (lisa, con
// pespunte claro) y suela (oscura, cosida en los bordes)
const CUEROS = {
  crudo: { c: [216, 184, 128], seed: 111 },
  carpincho: { c: [142, 84, 46], seed: 121 },
  vaqueta: { c: [130, 78, 42], seed: 131 },
  cuero: { c: [94, 58, 32], seed: 141 },
};
const cueroSet = (k) =>
  baked(`cuero-${k}`, () => {
    const C = CUEROS[k];
    return bakeSet(256, 64, (u, v) => {
      const g = fbm(u, v, 24, 6, 3, C.seed);
      const fine = fbm(u, v, 96, 24, 2, C.seed + 1);
      let h = g * 0.25 + fine * 0.15;
      let kk = 0.84 + g * 0.22;
      let r = 0.62 + fine * 0.2;
      let thread = 0;
      if (k === 'crudo') {
        const vein = smooth(0.06, 0, Math.abs(fbm(u, v, 6, 2, 3, 113) - 0.5));
        kk += (fbm(u, v, 8, 3, 3, 114) - 0.5) * 0.35 - vein * 0.25;
        r = 0.5 + fine * 0.2;
      } else if (k === 'carpincho') {
        // los poros del carpincho van de a tres, en filas
        const c = voro(u * 3, v, 7, 122);
        const pore = smooth(0.12, 0.05, c.d1) + smooth(0.1, 0.04, Math.abs(c.d2 - c.d1 - 0.12)) * 0.2;
        h -= pore * 0.45;
        kk -= pore * 0.3;
        thread = smooth(0.012, 0.004, Math.abs(u - 0.75)) * smooth(0.36, 0.3, Math.abs(frac(v * 9) - 0.5));
      } else thread = puntadas(u, v, [0.14, 0.86]);
      const c = C.c.map((x) => x * kk);
      const t = [228, 208, 168];
      return { c: c.map((x, i) => x + (t[i] - x) * thread), h: h + thread * 0.5 - smooth(0.06, 0.02, Math.min(v, 1 - v)) * 0.1, r: r - thread * 0.15 };
    }, { color: true, scale: 1.3, ao: 0.8 });
  });
// tiento trenzado: cuatro tientos de cuero que se cruzan en espiga, con el
// canto más claro (gastado) y lo hondo oscuro
const trenzaSet = () =>
  baked('trenza', () =>
    bakeSet(256, 128, (u, v) => {
      const x = frac(u * 16);
      const s = frac(v * 1.5 + Math.abs(x - 0.5) * 1.1 + (Math.floor(u * 16) % 2) * 0.5);
      const strand = Math.sin(s * Math.PI);
      const gap = smooth(0.18, 0.02, Math.min(s, 1 - s));
      const vein = fbm(u, v, 64, 8, 3, 611);
      const id = hash(Math.floor(u * 16), Math.floor(v * 1.5 + Math.abs(x - 0.5) * 1.1), 613);
      const k = 0.75 + strand * 0.35 + (id - 0.5) * 0.18 + (vein - 0.5) * 0.15 - gap * 0.5;
      return { c: [150 * k, 96 * k, 58 * k], h: strand * 0.8 - gap * 0.4 + vein * 0.1, r: 0.7 + gap * 0.25 - strand * 0.12 };
    }, { color: true, scale: 1.6, ao: 0.9 }),
  );
// chapa galvanizada: las escamas del zinc, cada una con su brillo
const chapaSet = () =>
  baked('chapa', () =>
    bakeSet(128, 128, (u, v) => {
      const c = voro(u, v, 5, 151);
      const edge = smooth(0.06, 0.0, c.d2 - c.d1);
      return { h: c.id * 0.2 - edge * 0.15, r: 0.28 + c.id * 0.25 };
    }, { scale: 0.6, ao: 0.3 }),
  );
// rejilla: chapita perforada (el filtro fino a la vista)
const rejillaSet = () =>
  baked('rejilla', () =>
    bakeSet(128, 128, (u, v) => {
      const d = Math.hypot(frac(u * 12) - 0.5, frac(v * 8) - 0.5);
      const hole = smooth(0.3, 0.22, d);
      const k = 1 - hole * 0.82;
      return { c: [228 * k, 230 * k, 234 * k], h: 0.6 - hole * 0.6, r: 0.22 + hole * 0.6 };
    }, { color: true, scale: 1.4, ao: 0.8 }),
  );
// la guarda pampa: rombos escalonados encadenados entre dos filetes
const grecaSet = () =>
  baked('greca', () =>
    bakeSet(128, 64, (u, v) => {
      const x = Math.abs(u - 0.5) * 2;
      const y = Math.abs(v - 0.5) * 2.4;
      // (en escalones, como la guarda tejida)
      const d = Math.round((x + y) * 7) / 7;
      const line = smooth(0.16, 0.06, Math.abs(d - 0.72)) + smooth(0.14, 0.05, Math.abs(d - 0.3));
      const fil = smooth(0.07, 0.025, Math.abs(v - 0.07)) + smooth(0.07, 0.025, Math.abs(v - 0.93));
      const dot = smooth(0.12, 0.06, d);
      const pick = fbm(u, v, 48, 24, 2, 161);
      const raised = Math.min(1, line + fil + dot);
      return { h: 0.3 + raised * 0.6 - (1 - raised) * pick * 0.15, r: raised > 0.5 ? 0.2 : 0.42 + pick * 0.2 };
    }, { scale: 1.6, ao: 0.9 }),
  );
// cordón: dos hilos retorcidos
const cordonSet = () =>
  baked('cordon', () =>
    bakeSet(256, 32, (u, v) => {
      const s = Math.sin((u * 48 + v) * TAU);
      return { h: 0.5 + s * 0.5, r: 0.2 + (1 - s) * 0.1 };
    }, { scale: 1.4, ao: 0.7 }),
  );
// hojas: verde, con la vena del medio y las de los costados
const hojaSet = (seca) =>
  baked(`hoja-${seca ? 1 : 0}`, () =>
    bakeSet(64, 128, (u, v) => {
      const mid = smooth(0.06, 0, Math.abs(u - 0.5));
      const side = smooth(0.08, 0, Math.abs(frac(v * 7 - Math.abs(u - 0.5) * 1.4) - 0.5) - 0.42) * (1 - mid);
      const g = fbm(u, v, 8, 16, 2, seca ? 171 : 172);
      const k = 0.82 + g * 0.3 + mid * 0.25;
      const c = seca ? [96 * k, 92 * k, 46 * k] : [78 * k, 128 * k, 50 * k];
      return { c, h: 0.5 - mid * 0.3 - side * 0.15 + g * 0.1, r: 0.6 + g * 0.2 };
    }, { color: true, scale: 1, ao: 0.4 }),
  );
// el grano de la yerba (fino o grueso)
const granoSet = (grueso) =>
  baked(`grano-${grueso ? 1 : 0}`, () =>
    bakeSet(128, 128, (u, v) => {
      const g = fbm(u, v, grueso ? 18 : 40, grueso ? 18 : 40, 3, grueso ? 711 : 701);
      const hoja = smooth(0.62, 0.7, fbm(u, v, grueso ? 8 : 14, grueso ? 8 : 14, 2, 702));
      return { h: g * 0.7 + hoja * (grueso ? 0.6 : 0.4), r: 0.9 + (g - 0.5) * 0.1 };
    }, { scale: grueso ? 1.8 : 1.4, ao: 0.8 }),
  );
// los palitos: rama de yerba seca, clarita, con las fibras a lo largo
const fibraSet = () =>
  baked('fibra', () =>
    bakeSet(64, 128, (u, v) => {
      const f = fbm(u, v, 24, 3, 3, 801);
      const nudo = smooth(0.8, 0.9, fbm(u, v, 3, 6, 2, 802));
      const k = 0.85 + (f - 0.5) * 0.35 - nudo * 0.25;
      return { c: [214 * k, 186 * k, 128 * k], h: f * 0.6 - nudo * 0.3, r: 0.8 + nudo * 0.15 };
    }, { color: true, scale: 1.2, ao: 0.5 }),
  );

// ---------------- materiales ----------------
// Cada uno se pinta la primera vez que se pide (mats(T).bronce).
const yerbaMat = (T, name, color, grueso = false, n = 1.3) => {
  const S = twin(granoSet(grueso), 1, 1);
  const m = new THREE.MeshStandardMaterial({ map: T.yerba || null, color, roughness: 1, normalMap: S.normal, normalScale: V2(n), aoMap: S.orm, aoMapIntensity: 0.8 });
  m.name = `acc:${name}`;
  return m;
};
const RECETAS = {
  oro: () => pbr('oro', twin(cincelSet(), 1, 6), { color: 0xffc23c, metalness: 1, roughness: 0.32, n: 0.9, ao: 0.7 }),
  alpacaCincel: () => pbr('alpacaCincel', twin(cincelSet(), 5, 1), { color: 0xe2e6ea, metalness: 1, roughness: 0.34, n: 0.9, ao: 0.7 }),
  alpaca: () => pbr('alpaca', twin(martilloSet(), 2, 5), { color: 0xd6dbdf, metalness: 1, n: 0.6, ao: 0.4 }),
  cobre: () => pbr('cobre', twin(martilloSet(), 2, 3), { color: 0xd8875a, metalness: 1, n: 0.6, ao: 0.4 }),
  alpacaLisa: () => pbr('alpacaLisa', twin(lisoSet(), 1, 2), { color: 0xe4e8eb, metalness: 1, ao: 0.2 }),
  plata: () => pbr('plata', twin(lisoSet(), 1, 2), { color: 0xf4f5f7, metalness: 1, roughness: 0.85, ao: 0.2 }),
  bronce: () => pbr('bronce', twin(bronceSet(), 2, 3), { metalness: 1, n: 0.8 }),
  hierro: () => pbr('hierro', twin(hierroSet(), 2, 3), { color: 0x56606e, metalness: 0.85, n: 0.6, ao: 0.4 }),
  asta: () => pbr('asta', twin(astaSet(), 1, 1), { n: 0.5, ao: 0.4 }),
  hueso: () => pbr('hueso', twin(huesoSet(), 1, 1), { n: 0.8, ao: 0.6 }),
  tacuara: () => pbr('tacuara', twin(tacuaraSet(), 1, 3), { n: 0.8, ao: 0.4 }),
  crudo: () => pbr('crudo', twin(cueroSet('crudo'), 2, 1), { n: 1 }),
  carpincho: () => pbr('carpincho', twin(cueroSet('carpincho'), 1, 1), { n: 1.2 }),
  vaqueta: () => pbr('vaqueta', twin(cueroSet('vaqueta'), 2, 1), { n: 0.9 }),
  cuero: () => pbr('cuero', twin(cueroSet('cuero'), 2, 1), { n: 1 }),
  tiento: () => pbr('tiento', twin(trenzaSet(), 1, 1), { n: 1.2, ao: 0.9, roughness: 0.85 }),
  // (el tiento finito de las lazadas, la manija y las costuras: la trenza más chica)
  tientoFino: () => pbr('tientoFino', twin(trenzaSet(), 0.5, 1), { n: 1, ao: 0.6, roughness: 0.85 }),
  chapa: () => pbr('chapa', twin(chapaSet(), 1, 1), { color: 0xc6cacd, metalness: 0.85, n: 0.4, ao: 0.3, side: THREE.DoubleSide }),
  rejilla: () => pbr('rejilla', twin(rejillaSet(), 2, 1), { metalness: 1, n: 1.2, roughness: 0.9 }),
  greca: () => pbr('greca', twin(grecaSet(), 9, 1), { color: 0xdde2e6, metalness: 1, n: 1.4, ao: 0.9 }),
  cordon: () => pbr('cordon', twin(cordonSet(), 1, 1), { color: 0xeff1f3, metalness: 1, n: 1.3, ao: 0.6 }),
  hoja: () => pbr('hoja', twin(hojaSet(false), 1, 1), { side: THREE.DoubleSide, n: 0.8, ao: 0.4 }),
  hojaSeca: () => pbr('hojaSeca', twin(hojaSet(true), 1, 1), { side: THREE.DoubleSide, n: 0.8, ao: 0.4 }),
  palo: () => pbr('palo', twin(fibraSet(), 1, 1), { n: 1, ao: 0.5, roughness: 0.85 }),
  flor: () => Object.assign(new THREE.MeshStandardMaterial({ color: 0xeee0f6, roughness: 0.75 }), { name: 'acc:flor' }),
  // los granitos de pólvora: negros, con un brillo apenas
  polvora: () => Object.assign(new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.28, metalness: 0.3, emissive: 0x3a1404, emissiveIntensity: 0.7 }), { name: 'acc:polvora' }),
  // las yerbas (con la textura de la yerba de siempre, teñida, y su grano)
  yerba: (T) => yerbaMat(T, 'yerba', 0xc6dc8a),
  barbacua: (T) => yerbaMat(T, 'barbacua', 0x8c9358),
  gruesa: (T) => yerbaMat(T, 'gruesa', 0xbcd07c, true, 1.6),
  despalada: (T) => yerbaMat(T, 'despalada', 0xdcefa6, false, 0.8),
  estacionada: (T) => yerbaMat(T, 'estacionada', 0xd8cd82, true, 1.3),
  kilo: (T) => yerbaMat(T, 'kilo', 0xb6cf78),
  compactada: (T) => yerbaMat(T, 'compactada', 0x84985a, false, 0.9),
  prensada: (T) => yerbaMat(T, 'prensada', 0x9aac64, true, 1.1),
};
let MAT = null;
function mats(T) {
  if (MAT) return MAT;
  MAT = {};
  for (const [k, fn] of Object.entries(RECETAS)) {
    Object.defineProperty(MAT, k, {
      configurable: true,
      enumerable: true,
      get() {
        const v = fn(T);
        Object.defineProperty(MAT, k, { value: v, enumerable: true });
        return v;
      },
    });
  }
  return MAT;
}
export const accMats = (T) => mats(T);

// ---------------- piezas ----------------
// Junta las mallas del grupo en una por material (en el espacio del grupo).
function fundir(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const list = byMat.get(o.material) || [];
    list.push(geo);
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, list] of byMat) out.add(new THREE.Mesh(mergeGeometries(list), mat));
  out.position.copy(group.position);
  out.quaternion.copy(group.quaternion);
  out.scale.copy(group.scale);
  return out;
}
const lathe = (pts, mat, seg = 24, a0 = 0, al = TAU) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, a0, al), mat);
const mesh = (geo, mat, p, r) => {
  const o = new THREE.Mesh(geo, mat);
  if (p) o.position.copy(p);
  if (r) o.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
  return o;
};
// un tubo por puntos (tientos, lazadas, resortes)
const tubo = (pts, r, mat, seg = 48, rs = 6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs), mat);
// anillo (toro) acostado alrededor del eje y
function aro(R, t, mat, y = 0, rs = 6, ts = 32) {
  const o = new THREE.Mesh(new THREE.TorusGeometry(R, t, rs, ts), mat);
  o.rotation.x = Math.PI / 2;
  o.position.y = y;
  return o;
}
// remaches alrededor del eje y
function remaches(g, n, R, y, r, mat, a0 = 0) {
  const geo = new THREE.SphereGeometry(r, 8, 5, 0, TAU, 0, Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const s = new THREE.Mesh(geo, mat);
    s.position.set(Math.sin(a) * R, y, Math.cos(a) * R);
    s.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(Math.sin(a), 0, Math.cos(a)));
    g.add(s);
  }
}

// ---------------- dónde va cada cosa ----------------
// La boca del mate: el padre (en las guampas, el grupo de la boca), la altura
// del borde y el radio.
function boca(m) {
  const fit = m.mate.userData.fit;
  const vir = m.mate.userData.virola || null;
  const yerba = m.yerba || m.mate.userData.te || null;
  const horn = !!m.mate.userData.hornTop;
  const parent = horn ? (vir || yerba)?.parent || m.mate : m.mate;
  return { parent, y: horn ? 0 : fit.top, r: fit.r, vir, yerba, horn };
}
// las bombillas de verdad del mate (caño, filtro, pico, anillo, ...): no el
// atado de cohetes del Explosivo
const esPaja = (b) => !!b?.children?.[0]?.geometry?.parameters?.height && !!b.children[2]?.isGroup;
const pajas = (m, todas = false) => (m.bombGroup?.children || []).filter((b) => esPaja(b) && (todas || !b.userData.acc));

// Lo que el mate tiene en el cuerpo, medido de verdad: para cada milímetro de
// altura y cada uno de 48 rumbos, hasta dónde llega (sin la mano, la bombilla
// ni la yerba). Así las fajas esquivan el cargador, el tambor, la manija o la
// dinamita, y pasan por arriba de los zunchos.
const NB = 48;
function escanear(m, T) {
  const mate = m.mate;
  if (mate.userData.scan) return mate.userData.scan;
  const fit = mate.userData.fit;
  const Mv = getMats(T);
  const hand = new Set([Mv.skin, Mv.nail, Mv.cuff, Mv.sleeve, Mv.glove]);
  const skip = new Set([m.bombGroup, m.yerba, mate.userData.te].filter(Boolean));
  const NS = Math.ceil(fit.top / 0.001) + 2;
  const rmax = new Float32Array(NS * NB);
  // (y lo más cerca del cuerpo que llega lo que sobresale: lo que flota lejos,
  // como las órbitas del Caótico, no estorba a una faja)
  const rin = new Float32Array(NS * NB).fill(Infinity);
  mate.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(mate.matrixWorld).invert();
  const mtx = new THREE.Matrix4();
  const P = [v3(0, 0, 0), v3(0, 0, 0), v3(0, 0, 0)];
  const X = [v3(0, 0, 0), v3(0, 0, 0), v3(0, 0, 0)];
  const binOf = (p) => Math.floor(frac(Math.atan2(p.x, p.z) / TAU) * NB) % NB;
  const walk = (o) => {
    if (skip.has(o) || o.userData.acc) return;
    if (o.isMesh && o.visible && !hand.has(o.material)) {
      mtx.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let k = 0; k < 3; k++) {
          P[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mtx);
          y0 = Math.min(y0, P[k].y);
          y1 = Math.max(y1, P[k].y);
        }
        const s0 = Math.max(0, Math.ceil(y0 / 0.001));
        const s1 = Math.min(NS - 1, Math.floor(y1 / 0.001));
        // (en cada milímetro, el corte de verdad del triángulo: así un costado
        // inclinado no parece más ancho de lo que es)
        for (let s = s0; s <= s1; s++) {
          const ys = s * 0.001;
          let c = 0;
          for (let e = 0; e < 3 && c < 2; e++) {
            const p = P[e];
            const q = P[(e + 1) % 3];
            if ((p.y - ys) * (q.y - ys) > 0 || Math.abs(q.y - p.y) < 1e-9) continue;
            X[c++].lerpVectors(p, q, (ys - p.y) / (q.y - p.y));
          }
          if (!c) continue;
          const r0 = Math.hypot(X[0].x, X[0].z);
          const r1 = c > 1 ? Math.hypot(X[1].x, X[1].z) : r0;
          const rr = Math.max(r0, r1);
          const rA = fit.rAt(ys) + 0.0035;
          const near = rr > rA ? (Math.min(r0, r1) <= rA ? rA : Math.min(r0, r1)) : Infinity;
          const b0 = binOf(X[0]);
          const b1 = c > 1 ? binOf(X[1]) : b0;
          // los rumbos entre los dos puntos, por el lado corto
          let d = (b1 - b0 + NB) % NB;
          let from = b0;
          if (d > NB / 2) {
            from = b1;
            d = NB - d;
          }
          for (let k = 0; k <= d; k++) {
            const j = s * NB + ((from + k) % NB);
            if (rr > rmax[j]) rmax[j] = rr;
            if (near < rin[j]) rin[j] = near;
          }
        }
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(mate);
  // lo de arriba de todo: la virola (o la boca de la guampa), que las fajas no pisan
  let topY = fit.top - 0.016;
  const vir = mate.userData.virola;
  if (vir && !mate.userData.hornTop) {
    vir.geometry.computeBoundingBox();
    topY = Math.min(topY, vir.geometry.boundingBox.min.y + vir.position.y - 0.002);
  }
  if (mate.userData.hornTop) topY = fit.top - 0.03;
  return (mate.userData.scan = { rmax, rin, NS, topY, ring: null });
}

// La ventana de altura w para una faja: arriba de los dedos, abajo de la
// virola, donde el cuerpo esté más liso. Devuelve { y0, y1, ym, R(y), arcos }
// (los arcos libres: [desde, largo] en el ángulo del torno).
function ventana(m, T, w, { lejos = 0 } = {}) {
  const fit = m.mate.userData.fit;
  const S = escanear(m, T);
  const horn = !!m.mate.userData.hornPath;
  const OB = 0.0035;
  // (lo que sobresale en ese rumbo; si flota a más de 1,2 cm del cuerpo, no cuenta)
  const raw = (s, b) => {
    const e = S.rmax[s * NB + b] - fit.rAt(s * 0.001);
    return e <= OB || S.rin[s * NB + b] < fit.rAt(s * 0.001) + 0.012 ? e : 0;
  };
  // (lo que da casi toda la vuelta, como un zuncho, no estorba: la faja pasa por arriba)
  const ring =
    S.ring ||
    (S.ring = Array.from({ length: S.NS }, (_, s) => {
      let c = 0;
      for (let b = 0; b < NB; b++) if (raw(s, b) > OB) c++;
      return c > NB * 0.6;
    }));
  const blk = (s, b) => !horn && !ring[s] && raw(s, b) > OB;
  const exc = (s, b) => (horn ? 0 : clamp(raw(s, b), 0, 0.007));
  const sl = (y) => clamp(Math.round(y / 0.001), 0, S.NS - 1);
  const lo = fit.hand + 0.003 + lejos;
  const hi = S.topY - w;
  let best = null;
  for (let ya = lo; ya <= hi + 1e-6; ya += 0.001) {
    let worst = 0;
    let blocked = 0;
    for (let s = sl(ya); s <= sl(ya + w); s++) {
      for (let b = 0; b < NB; b++) {
        if (blk(s, b)) blocked++;
        else worst = Math.max(worst, exc(s, b));
      }
    }
    const cost = worst * 3000 + blocked * 0.02 + (ya - lo) * 2;
    if (!best || cost < best.cost) best = { cost, ya };
  }
  const y0 = best ? best.ya : Math.max(fit.top * 0.3, hi);
  const y1 = y0 + w;
  const bl = new Array(NB).fill(false);
  for (let s = sl(y0); s <= sl(y1); s++) for (let b = 0; b < NB; b++) if (blk(s, b)) bl[b] = true;
  // lo que sobresale del cuerpo en cada altura (fuera de lo que estorba), un
  // poco suavizado: la faja pasa por arriba
  const exS = (y) => {
    let e = 0;
    for (let s = sl(y - 0.004); s <= sl(y + 0.004); s++) {
      const f = 1 - Math.abs(s * 0.001 - y) / 0.0045;
      for (let b = 0; b < NB; b++) if (!bl[b]) e = Math.max(e, exc(s, b) * f);
    }
    return e;
  };
  let worst = 0;
  for (let s = sl(y0); s <= sl(y1); s++) for (let b = 0; b < NB; b++) if (!bl[b]) worst = Math.max(worst, exc(s, b));
  // (un rumbo de margen a cada lado de lo que estorba)
  const blkA = bl.map((x, i) => x || bl[(i + 1) % NB] || bl[(i + NB - 1) % NB]);
  const arcos = [];
  if (!blkA.some(Boolean)) arcos.push([0, TAU]);
  else {
    const start = blkA.indexOf(true);
    let run = null;
    for (let k = 1; k <= NB; k++) {
      const b = (start + k) % NB;
      if (!blkA[b]) {
        if (!run) run = [b, 0];
        run[1]++;
      } else if (run) {
        if (run[1] >= 2) arcos.push([(run[0] / NB) * TAU, (run[1] / NB) * TAU]);
        run = null;
      }
    }
  }
  return { y0, y1, ym: (y0 + y1) / 2, w, arcos, worst, R: (y) => fit.rAt(y) + exS(y) + 0.0006 };
}
// El lugar de la faja en el mate: en las guampas, sobre el eje curvo (centro
// y giro); en los demás, derecho.
function asentar(m, g, ym) {
  const path = m.mate.userData.hornPath;
  if (!path) {
    g.position.set(0, ym, 0);
    return;
  }
  const len = path.points[path.points.length - 1].y;
  const t = clamp(ym / len);
  g.position.copy(path.getPointAt(t));
  const tg = path.getTangentAt(t);
  g.rotation.set(0, 0, -Math.atan2(tg.x, tg.y));
}
// El rumbo libre más cercano al que se ve en la mano (atrás a la izquierda).
const VISTO = -1.0;
function rumbo(V, want = VISTO) {
  let best = want;
  let d = Infinity;
  for (const [a0, al] of V.arcos) {
    for (let k = 0.15; k <= 0.85; k += 0.05) {
      const a = a0 + al * k;
      const dd = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
      if (dd < d) {
        d = dd;
        best = a;
      }
    }
  }
  return best;
}
const enRumbo = (a, R, y) => v3(Math.sin(a) * R, y, Math.cos(a) * R);
// La faja: torneada siguiendo el mate (en el espacio de la faja: y de -w/2 a
// w/2), abultada en el medio; en arcos si algo estorba. La textura no se estira
// en los arcos.
// (g.add() sin nada avisa en la consola)
const addAll = (g, list) => list.length && g.add(...list);
function faja(V, mat, { bulge = 0.0024, n = 8, w = V.w, dy = 0, lift = 0 } = {}) {
  const out = [];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const yl = -w / 2 + w * t + dy;
    pts.push(new THREE.Vector2(V.R(V.ym + yl) + lift + Math.sin(t * Math.PI) * bulge, yl));
  }
  for (const [a0, al] of V.arcos) {
    const geo = new THREE.LatheGeometry(pts, Math.max(6, Math.round((48 * al) / TAU)), a0, al);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (a0 + uv.getX(i) * al) / TAU);
    out.push(new THREE.Mesh(geo, mat));
  }
  return out;
}

// ---------------- bombillas ----------------
// Una bombilla nueva en lugar de cada una de las de siempre: la misma, con
// otro largo, grosor y material, otro filtro y sus adornos. o: { mat, largo,
// grueso, chata, filtro, adornos(nb, ctx), picoMat }.
function bombillaNueva(m, M, id, o) {
  const out = { nodes: [], hides: [], entra: 'desliza' };
  if (!m.bombGroup) return cucharita(m, M, id, o, out);
  const list = pajas(m);
  if (!list.length) return atado(m, M, id, o, out);
  const mat = M[o.mat];
  const K = o.largo || 1;
  const G = o.grueso || 1;
  for (const b of list) {
    const [tube, fil, pico, ring, ...extra] = b.children;
    const len = tube.geometry.parameters.height;
    const r = tube.geometry.parameters.radiusTop;
    fil.geometry.computeBoundingBox();
    const RF = Math.max(fil.geometry.boundingBox.max.x, r * 1.6);
    const nb = b.clone();
    nb.userData.acc = id;
    const [t2, f2, p2, r2, ...x2] = nb.children;
    t2.scale.set(G * (o.chata || 1), K, G / (o.chata || 1));
    t2.position.y = (len * K) / 2;
    p2.position.y = len * K;
    p2.scale.set(G, 1, G);
    r2.position.y = len * K * 0.72;
    r2.scale.setScalar(G);
    // (lo que va pegado: el anillo del Rayo, la mira del Torpedo, las aletas del Campanario)
    // se corre entero, sin separarse: la lente de la mira del Torpedo quedaba
    // volando con la bombilla larga (el usuario, 2026-10-13). El codo va al
    // quiebre.
    const pegado = extra.filter((e) => !e.userData.codo);
    const ancla = pegado.length ? pegado.reduce((s, e) => s + e.position.y, 0) / pegado.length : 0;
    x2.forEach((x, i) => {
      // (lo que gira o late en la de siempre, también en la nueva: los aros del Caótico)
      for (const k of ['spin', 'glow']) if (m.anim?.[k]?.includes(extra[i])) m.anim[k].push(x);
      x.position.y = extra[i].userData.codo ? extra[i].position.y * K : extra[i].position.y + ancla * (K - 1);
      if (Math.abs(x.position.z) > 1e-4) x.position.z += Math.sign(x.position.z) * r * (G - 1);
      else x.scale.multiplyScalar(G);
    });
    for (const x of [t2, r2]) x.material = mat;
    p2.traverse((x) => x.isMesh && (x.material = M[o.picoMat || o.mat]));
    // el filtro
    f2.geometry = filtro(o.filtro, r * G, RF);
    f2.material = mat;
    const orn = new THREE.Group();
    if (o.filtro === 'resorte') {
      // el resorte enrollado a la vista sobre la yerba
      const pts = [];
      const R = r * G * 1.9;
      for (let i = 0; i <= 160; i++) {
        const t = i / 160;
        const a = t * TAU * 9;
        pts.push(v3(Math.sin(a) * R, 0.016 + t * 0.038, Math.cos(a) * R));
      }
      orn.add(tubo(pts, 0.0009, mat, 220, 5));
    } else if (o.filtro === 'rejilla') {
      // las tapitas de la rejilla
      orn.add(aro(r * G * 1.9, 0.0011, mat, -RF * 0.04, 6, 20), aro(r * G * 1.9, 0.0011, mat, -RF * 0.86, 6, 20));
    }
    o.adornos?.(orn, { r: r * G, len: len * K, M, mat, RF });
    if (orn.children.length) nb.add(fundir(orn));
    m.bombGroup.add(nb);
    out.nodes.push(nb);
    out.hides.push(b);
    if (!out.muzzle) {
      let tip = null;
      p2.traverse((x) => {
        if (!x.isMesh && x !== p2 && !tip) tip = x;
      });
      out.muzzle = tip;
    }
  }
  return out;
}
// Los filtros: la pera de siempre (viewmodels filtroGeo), la cuchara chata,
// la rejilla a la vista y el doble escalonado. Nunca más grande que el de antes.
function filtro(kind, r, R) {
  if (kind === 'cuchara') return VM.filtroGeo(r, R).scale(1.18, 1.05, 0.42);
  if (kind === 'resorte') return VM.filtroGeo(r, R * 0.78);
  if (kind === 'rejilla') {
    const g = new THREE.CylinderGeometry(r * 1.85, r * 1.85, R * 0.82, 16, 1, false);
    g.translate(0, -R * 0.45, 0);
    return mergeGeometries([g.toNonIndexed(), new THREE.LatheGeometry([new THREE.Vector2(r, 0.003), new THREE.Vector2(r * 1.85, -R * 0.04)], 16).toNonIndexed()]);
  }
  if (kind === 'doble') {
    const a = VM.filtroGeo(r, R * 0.82).toNonIndexed();
    const b = VM.filtroGeo(r, R * 0.6).translate(0, R * 0.95, 0).toNonIndexed();
    return mergeGeometries([a, b]);
  }
  return VM.filtroGeo(r, R);
}
// adornos que se repiten: virolitas, anillos de bolitas, nudos de caña, zunchos
function virolita(g, r, y, mat, w = 0.009, k = 1.45) {
  g.add(lathe([[r * 1.02, y - w], [r * (k - 0.03), y - w * 0.8], [r * k, y], [r * (k - 0.03), y + w * 0.8], [r * 1.02, y + w]], mat, 16));
}
function bolitas(g, r, y, mat, n = 14) {
  const geo = new THREE.SphereGeometry(r * 0.3, 6, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.add(mesh(geo, mat, v3(Math.cos(a) * r * 1.05, y, Math.sin(a) * r * 1.05)));
  }
}
// El Cocido no tiene bombilla: la de la armería es una cucharita metida en la taza.
function cucharita(m, M, id, o, out) {
  const g = new THREE.Group();
  g.userData.acc = id;
  const parts = new THREE.Group();
  const mat = M[o.mat];
  const r = 0.0028;
  const L = 0.13;
  parts.add(mesh(new THREE.CylinderGeometry(r, r * 1.2, L, 8), mat, v3(0, L / 2, 0)));
  // la paleta de la cuchara, abajo (adentro del té)
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 8, 0, TAU, 0, Math.PI / 2), mat);
  bowl.scale.set(1, 0.5, 1.4);
  bowl.rotation.x = Math.PI;
  parts.add(bowl);
  o.adornos?.(parts, { r, len: L, M, mat, RF: 0.011, cuchara: true });
  const f = fundir(parts);
  g.add(f);
  // (del lado de la izquierda, lejos de la manija y del hilo del saquito)
  g.position.set(-0.016, 0.045, 0.004);
  g.rotation.set(0.12, 0, 0.42);
  m.mate.add(g);
  out.nodes.push(g);
  return out;
}
// El Explosivo: su "bombilla" es el atado de cuatro cohetes. Los adornos van
// alrededor del atado (en su espacio: a lo largo de y).
function atado(m, M, id, o, out) {
  const pod = m.bombGroup.children[0];
  if (!pod) return out;
  const g = new THREE.Group();
  g.userData.acc = id;
  const parts = new THREE.Group();
  o.atado?.(parts, M);
  if (!parts.children.length) return out;
  g.add(fundir(parts));
  pod.add(g);
  out.nodes.push(g);
  return out;
}
const L_ATADO = 0.2;
const SP_ATADO = 0.0106;
const TR_ATADO = 0.0085;
const TUBOS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];

const BOMBILLAS = {
  // la misma bombilla, un 22% más larga, de oro cincelado, con dos anillos de
  // bolitas y una virolita labrada
  bombillaLarga: {
    mat: 'oro',
    largo: 1.22,
    adornos(g, { r, len, mat }) {
      bolitas(g, r, len * 0.3, mat);
      bolitas(g, r, len * 0.52, mat);
      virolita(g, r, len * 0.41, mat);
      const knob = mesh(new THREE.SphereGeometry(r * 1.45, 10, 8), mat, v3(0, len * 0.985, 0));
      knob.scale.y = 0.7;
      g.add(knob);
    },
  },
  // alpaca pulida con el resorte enrollado a la vista sobre la yerba
  bombillaResorte: { mat: 'alpacaLisa', filtro: 'resorte' },
  // ancha y chata, de alpaca martillada, con el filtro de cuchara
  bombillaCuchara: { mat: 'alpaca', chata: 1.35, filtro: 'cuchara', adornos: (g, { r, len, mat }) => virolita(g, r * 1.2, len * 0.62, mat, 0.006, 1.3) },
  // caña con los nudos marcados y las puntas de bronce
  bombillaTacuara: {
    mat: 'tacuara',
    largo: 1.18,
    grueso: 1.3,
    picoMat: 'bronce',
    adornos(g, { r, len, M }) {
      for (let y = 0.05; y < len - 0.02; y += 0.046) {
        g.add(lathe([[r * 0.99, y - 0.004], [r * 1.12, y - 0.0012], [r * 1.16, y], [r * 1.12, y + 0.0012], [r * 0.99, y + 0.004]], M.tacuara, 14));
      }
      g.add(lathe([[r * 1.0, len - 0.014], [r * 1.18, len - 0.012], [r * 1.18, len - 0.001], [r * 1.0, len]], M.bronce, 14));
      g.add(lathe([[r * 1.0, 0.012], [r * 1.18, 0.014], [r * 1.18, 0.026], [r * 1.0, 0.028]], M.bronce, 14));
    },
  },
  // pulida espejo, con dos anillos finitos
  bombillaAlpaca: { mat: 'alpacaLisa', adornos: (g, { r, len, mat }) => [0.5, 0.6].forEach((k) => g.add(aro(r * 1.12, r * 0.22, mat, len * k, 6, 18))) },
  // larga, con dos virolitas cinceladas
  bombillaLargaAlpaca: {
    mat: 'alpacaLisa',
    largo: 1.18,
    adornos(g, { r, len, M }) {
      virolita(g, r, len * 0.34, M.alpacaCincel, 0.008, 1.5);
      virolita(g, r, len * 0.62, M.alpacaCincel, 0.008, 1.5);
    },
  },
  // el filtro de rejilla a la vista
  bombillaFiltro: { mat: 'alpacaLisa', filtro: 'rejilla' },
  // doble grosor, de hierro pavonado
  bombillaGruesa: { mat: 'hierro', largo: 1.12, grueso: 1.32, adornos: (g, { r, len, M }) => [0.3, 0.86].forEach((k) => virolita(g, r, len * k, M.hierro, 0.006, 1.22)) },
  // dos filtros escalonados
  bombillaFiltroDoble: { mat: 'alpaca', filtro: 'doble' },
  // larga, de plata lisa con la punta de oro
  bombillaPlata: { mat: 'plata', largo: 1.2, picoMat: 'oro', adornos: (g, { r, len, M }) => g.add(aro(r * 1.12, r * 0.28, M.oro, len * 0.97, 6, 18)) },
  // con la boca acampanada de cobre
  bombillaBocaAncha: {
    mat: 'cobre',
    adornos(g, { r, len, M, cuchara }) {
      if (cuchara) return;
      // (la campana: en el espacio de la bombilla, donde empieza el pico)
      g.add(lathe([[r * 1.0, len - 0.012], [r * 1.25, len - 0.004], [r * 1.9, len + 0.0005], [r * 1.55, len + 0.0012], [r * 1.0, len - 0.006]], M.cobre, 18));
    },
    atado(g, M) {
      for (const [ix, iz] of TUBOS) {
        const b = lathe([[TR_ATADO * 0.98, -0.008], [TR_ATADO * 1.25, -0.002], [TR_ATADO * 1.55, 0.004], [TR_ATADO * 1.62, 0.006], [TR_ATADO * 0.98, 0.001]], M.cobre, 18);
        b.position.set(ix * SP_ATADO, L_ATADO, iz * SP_ATADO);
        g.add(b);
      }
    },
  },
  // con zunchos de hierro remachados
  bombillaReforzada: {
    mat: 'alpaca',
    adornos(g, { r, len, M }) {
      for (const k of [0.32, 0.55, 0.8]) {
        g.add(lathe([[r * 1.02, len * k - 0.004], [r * 1.42, len * k - 0.0035], [r * 1.45, len * k], [r * 1.42, len * k + 0.0035], [r * 1.02, len * k + 0.004]], M.hierro, 16));
        remaches(g, 3, r * 1.44, len * k, r * 0.28, M.hierro);
      }
    },
    atado(g, M) {
      const R = SP_ATADO * 1.414 + TR_ATADO;
      for (const k of [0.12, 0.55, 0.95]) {
        g.add(lathe([[R + 0.0004, L_ATADO * k - 0.004], [R + 0.0018, L_ATADO * k - 0.0034], [R + 0.002, L_ATADO * k], [R + 0.0018, L_ATADO * k + 0.0034], [R + 0.0004, L_ATADO * k + 0.004]], M.hierro, 30));
        remaches(g, 6, R + 0.002, L_ATADO * k, 0.0011, M.hierro, 0.4);
      }
    },
  },
};

// ---------------- picos ----------------
// El pico nuevo va adentro del grupo del pico de cada bombilla (la de siempre
// y las de la armería): se ve el de la bombilla que esté puesta.
function picoNuevo(m, M, id, o) {
  const out = { nodes: [], hides: [], entra: 'enrosca' };
  if (!m.bombGroup) return picoTaza(m, M, id, o, out);
  const list = pajas(m, true);
  if (!list.length) {
    // el atado de cohetes del Explosivo
    const pod = m.bombGroup.children[0];
    if (!pod || !o.atado) return out;
    const g = new THREE.Group();
    g.userData.acc = id;
    const parts = new THREE.Group();
    o.atado(parts, M);
    g.add(fundir(parts));
    pod.add(g);
    out.nodes.push(g);
    return out;
  }
  for (const b of list) {
    const pg = b.children[2];
    const p = pg.children.find((x) => x.isMesh && !x.userData.acc);
    if (!p) continue;
    const r = p.geometry.parameters.radiusBottom;
    const sign = Math.sign(pg.rotation.x) || -1;
    const g = new THREE.Group();
    g.userData.acc = id;
    const parts = new THREE.Group();
    const L = o.forma(parts, { r, sign, M });
    g.add(fundir(parts));
    const tip = new THREE.Object3D();
    tip.position.copy(L);
    g.add(tip);
    pg.add(g);
    out.nodes.push(g);
    out.hides.push(p);
    // (la punta nueva: la de la bombilla de la armería, si hay una)
    if (!out.muzzle || b.userData.acc) out.muzzle = tip;
  }
  return out;
}
// Un caño que se angosta, doblado para el mismo lado que el pico.
function canio(r0, r1, L, bend, sign, mat, { flat = 0, seg = 10 } = {}) {
  const geo = new THREE.CylinderGeometry(r1, r0, L, seg, 8, false);
  geo.translate(0, L / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / L;
    pos.setX(i, pos.getX(i) * (1 + flat * t * 1.2));
    pos.setZ(i, pos.getZ(i) * (1 - flat * t * 0.6) + sign * bend * t * t);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const PICOS = {
  // más curvo y largo, de bronce, con una virolita estriada
  picoLoro: { forma: (g, { r, sign, M }) => loro(g, r, sign, M.bronce, M.bronce) },
  picoLoroAlpaca: { forma: (g, { r, sign, M }) => loro(g, r, sign, M.alpacaLisa, M.alpacaLisa) },
  // boca de pato, con dos remaches
  picoChato: {
    forma(g, { r, sign, M }) {
      g.add(canio(r, r * 0.95, 0.032, 0.002, sign, M.bronce, { flat: 0.8 }));
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r * 0.32, 8, 5), M.bronce, v3(s * r * 1.35, 0.022, sign * 0.0009)));
      return v3(0, 0.034, sign * 0.002);
    },
  },
  // con la ranura de silbato y un anillito de bronce
  picoSilbador: {
    forma(g, { r, sign, M }) {
      g.add(canio(r, r * 0.85, 0.031, 0.0015, sign, M.alpacaLisa));
      g.add(mesh(new THREE.BoxGeometry(r * 0.95, 0.0055, r * 0.6), M.hierro, v3(0, 0.017, -sign * r * 0.62)));
      g.add(mesh(new THREE.BoxGeometry(r * 0.95, 0.0016, r * 0.5), M.alpacaLisa, v3(0, 0.0205, -sign * r * 0.78), [-sign * 0.5, 0, 0]));
      g.add(aro(r * 1.08, r * 0.26, M.bronce, 0.008, 6, 16));
      return v3(0, 0.033, sign * 0.0015);
    },
  },
  // grueso, de bronce, con tres ranuras (de los dos lados)
  picoCompensador: {
    forma(g, { r, sign, M }) {
      g.add(canio(r * 1.4, r * 1.4, 0.027, 0, sign, M.bronce, { seg: 14 }));
      g.add(lathe([[r * 1.4, 0.027], [r * 1.25, 0.029], [r * 0.6, 0.029]], M.bronce, 14));
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(r * 1.6, 0.0022, r * 0.5), M.hierro, v3(0, 0.009 + i * 0.006, s * r * 1.22)));
      return v3(0, 0.03, 0);
    },
  },
  // corto y pesado, de bronce, con el canto achaflanado
  picoMacizo: {
    forma(g, { r, M }) {
      g.add(lathe([[r * 0.95, 0], [r * 1.7, 0.003], [r * 1.72, 0.013], [r * 1.25, 0.019], [r * 0.7, 0.0205], [r * 0.5, 0.0205]], M.bronce, 16));
      g.add(aro(r * 1.72, r * 0.18, M.bronce, 0.008, 5, 18));
      return v3(0, 0.022, 0);
    },
  },
  // de asta negra con anillo de plata
  picoAsta: {
    forma(g, { r, sign, M }) {
      g.add(canio(r * 1.15, r * 0.9, 0.031, 0.0018, sign, M.asta, { seg: 12 }));
      g.add(aro(r * 1.18, r * 0.3, M.plata, 0.002, 6, 16));
      return v3(0, 0.033, sign * 0.0018);
    },
  },
  // con aletas de chapa
  picoCohete: {
    forma(g, { r, sign, M }) {
      g.add(canio(r, r * 0.75, 0.03, 0.001, sign, M.chapa));
      aletas(g, r, 0.002, 0.016, 0.006, M.chapa);
      return v3(0, 0.032, sign * 0.001);
    },
    // (el atado: cuatro aletas grandes entre los cohetes, adelante)
    atado(g, M) {
      const R = SP_ATADO * 1.414 + TR_ATADO;
      const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.012, 0.004), new THREE.Vector2(0.012, 0.016), new THREE.Vector2(0, 0.03)]);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0008, bevelEnabled: false });
      geo.translate(0, 0, -0.0004);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * TAU;
        const f = new THREE.Mesh(geo, M.chapa);
        f.position.set(Math.sin(a) * (R - 0.002), L_ATADO - 0.05, Math.cos(a) * (R - 0.002));
        f.rotation.y = a - Math.PI / 2;
        g.add(f);
      }
    },
  },
};
function loro(g, r, sign, mat, ring) {
  g.add(canio(r, r * 0.8, 0.038, 0.009, sign, mat));
  // la virolita estriada
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([r * (1.18 + (i % 2) * 0.12), 0.001 + i * 0.0008]);
  g.add(lathe([[r * 0.98, 0], ...pts, [r * 0.98, 0.0075]], ring, 16));
  return v3(0, 0.038, sign * 0.009);
}
// aletas de chapa alrededor del eje y (triangulitos)
function aletas(g, r, y0, h, out, mat) {
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(out, 0.002), new THREE.Vector2(out, h * 0.45), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0006, bevelEnabled: false });
  geo.translate(0, 0, -0.0003);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const f = new THREE.Mesh(geo, mat);
    f.position.set(Math.sin(a) * r * 0.9, y0, Math.cos(a) * r * 0.9);
    f.rotation.y = a - Math.PI / 2;
    g.add(f);
  }
}
// El Cocido: el pico va en el borde de la taza, del lado de la izquierda.
function picoTaza(m, M, id, o, out) {
  const fit = m.mate.userData.fit;
  const g = new THREE.Group();
  g.userData.acc = id;
  const parts = new THREE.Group();
  const r = 0.006;
  const sign = -1;
  o.forma(parts, { r, sign, M });
  g.add(fundir(parts));
  g.position.set(-fit.r - 0.001, fit.top - 0.012, 0);
  g.rotation.set(0, 0, 0.95);
  m.mate.add(g);
  out.nodes.push(g);
  return out;
}

// ---------------- virolas ----------------
// La virola nueva tapa la de siempre: un poco más ancha, con su textura de
// frente (la cara de afuera tiene su propio mapeo, así la guarda no se estira)
// y sus adornos. o: { mat, alto, extra(g, ctx) }.
function virolaNueva(m, M, id, o) {
  const out = { nodes: [], hides: [], entra: 'baja' };
  const B = boca(m);
  const { r, y } = B;
  const h = o.alto || 0.014;
  const R0 = r + 0.0036;
  const R1 = r + 0.0052;
  const top = y + 0.0024;
  const g = new THREE.Group();
  g.userData.acc = id;
  const parts = new THREE.Group();
  const mat = M[o.mat];
  const face = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    face.push([R0 + (R1 - R0) * Math.sin(t * Math.PI) * 0.9, y - h + (h + 0.0024) * t]);
  }
  parts.add(lathe(face, mat, 40));
  parts.add(lathe([[R0, top], [R0 - 0.0012, top + 0.0007], [r - 0.0008, top + 0.0005], [r - 0.0013, top - 0.001], [r - 0.0013, y - h], [R0, y - h]], o.borde ? M[o.borde] : mat, 40));
  o.extra?.(parts, { r, y, h, R0, R1, top, M, mat });
  g.add(fundir(parts));
  B.parent.add(g);
  out.nodes.push(g);
  if (B.vir) out.hides.push(B.vir);
  return out;
}
// el sol de mayo cincelado (de oro), de frente
function sol(g, R, y, M, a = 0.4) {
  const s = new THREE.Group();
  s.add(mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.001, 18), M.oro, null, [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * TAU;
    const L = k % 2 ? 0.0018 : 0.0028;
    const ray = mesh(new THREE.BoxGeometry(0.0007, L, 0.0006), M.oro, v3(Math.sin(t) * (0.0034 + L / 2), Math.cos(t) * (0.0034 + L / 2), 0));
    ray.rotation.z = -t;
    s.add(ray);
  }
  s.position.copy(enRumbo(a, R + 0.0003, y));
  s.rotation.y = a;
  g.add(s);
}
// la mira de hueso: un postecito con muesca en V (adelante) o el alza de dos
// puntas (atrás), parada sobre el borde
function mira(g, r, top, M, alza) {
  const a = alza ? 0 : Math.PI;
  const z = Math.cos(a) * (r + 0.0012);
  const base = mesh(new THREE.BoxGeometry(0.008, 0.0024, 0.004), M.hueso, v3(0, top + 0.0011, z));
  g.add(base);
  if (alza) {
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.0022, 0.0062, 0.0028), M.hueso, v3(s * 0.0026, top + 0.0052, z)));
  } else {
    const post = mesh(new THREE.BoxGeometry(0.0022, 0.0068, 0.0026), M.hueso, v3(0, top + 0.0055, z));
    g.add(post);
    g.add(mesh(new THREE.SphereGeometry(0.0011, 8, 6), M.hueso, v3(0, top + 0.0092, z)));
  }
}
const VIROLAS = {
  // alta, de alpaca con la guarda pampa y un filete de bronce
  virolaPampa: { mat: 'greca', borde: 'alpacaLisa', alto: 0.02, extra: (g, { R1, y, h, M }) => g.add(aro(R1 - 0.0006, 0.0008, M.bronce, y - h * 0.82, 5, 48)) },
  // de asta negra pulida con canto de plata
  virolaAsta: { mat: 'asta', alto: 0.014, extra: (g, { R0, top, M }) => g.add(aro(R0 - 0.0008, 0.0011, M.plata, top - 0.0004, 6, 48)) },
  // angosta, de plata, con borde de cordón
  virolaPlata: { mat: 'plata', alto: 0.008, extra: (g, { R0, top, M }) => g.add(aro(R0 - 0.0004, 0.0013, M.cordon, top - 0.0003, 8, 64)) },
  // ancha, cincelada, con un sol de mayo de oro de frente
  virolaSol: { mat: 'alpacaCincel', alto: 0.02, extra: (g, { R1, y, h, M }) => sol(g, R1, y - h / 2 + 0.001, M) },
  // con una mira de hueso tallado adelante
  virolaHueso: { mat: 'alpacaLisa', alto: 0.014, extra: (g, { r, top, M }) => mira(g, r, top, M, false) },
  // ancha, con remaches
  virolaAncha: { mat: 'alpaca', alto: 0.024, extra: (g, { R1, y, h, M }) => remaches(g, 14, R1 - 0.0004, y - h / 2 + 0.001, 0.0011, M.alpacaLisa) },
  // con el alza de hueso atrás
  virolaAlza: { mat: 'alpacaLisa', alto: 0.014, extra: (g, { r, top, M }) => mira(g, r, top, M, true) },
  // con hojas de acanto cinceladas
  virolaAcanto: { mat: 'alpacaCincel', alto: 0.018 },
  // de bronce con remaches
  virolaBronce: { mat: 'bronce', alto: 0.016, extra: (g, { R1, y, h, M }) => remaches(g, 10, R1 - 0.0005, y - h / 2 + 0.001, 0.0012, M.hierro, 0.3) },
};

// ---------------- yerbas ----------------
// El montón de yerba: un domo rugoso que no se sale de la boca, con lo suyo
// encima (palitos, hojas, flores, granitos, panes). o: { mat, alto, rug,
// pozo, cosas(g, ctx) }.
function yerbaNueva(m, M, id, o) {
  const out = { nodes: [], hides: [], entra: 'crece' };
  const fit = m.mate.userData.fit;
  const y0 = m.yerba || m.mate.userData.te;
  if (!fit || !y0) return out;
  const te = y0 === m.mate.userData.te;
  const R = te ? 0.036 : Math.min(fit.r * 0.95, fit.r - 0.0019);
  // (el remolino del Caótico y las brasas de la Llamarada no se tapan: la
  // yerba de la armería queda alrededor, un aro que baja hasta el efecto, y
  // el efecto sigue a la vista; el usuario, 2026-10-13)
  const efecto = !!y0.userData.efecto;
  const R0 = R * 0.74;
  const g = new THREE.Group();
  g.userData.acc = id;
  g.position.copy(y0.position);
  // (con efecto, el aro es bajo, apenas un borde: desde la mano el remolino
  // se ve de costado y un aro alto lo tapaba)
  const alto = efecto ? Math.min(o.alto ?? 0.012, 0.0045) : o.alto ?? 0.012;
  const rug = o.rug ?? 1;
  const hAt = (x, y) => {
    const d2 = (x * x + y * y) / (R * R);
    // (con efecto: el aro sube desde el borde de adentro y baja contra la pared)
    const forma = efecto ? Math.pow(Math.max(0, Math.sin(clamp((Math.sqrt(d2) * R - R0) / (R - R0)) * Math.PI)), 0.8) * 0.7 : Math.pow(Math.max(0, 1 - d2), 0.7);
    let h = forma * alto + 0.0016 + (Math.sin(x * 520) * Math.cos(y * 470) * 0.0011 + Math.sin(x * 260 + y * 300) * 0.0008) * rug;
    // la marca de la cuchara (la compactada)
    if (o.pozo) h -= Math.exp(-(((x + R * 0.3) / (R * 0.32)) ** 2 + ((y - R * 0.2) / (R * 0.22)) ** 2)) * o.pozo;
    return h;
  };
  const geo = efecto ? new THREE.RingGeometry(R0, R, 40, 4) : new THREE.CircleGeometry(R, 40, 0, TAU);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, hAt(x, y));
    uv.setXY(i, x / R / 2 + 0.5, y / R / 2 + 0.5);
  }
  geo.computeVertexNormals();
  const heap = new THREE.Mesh(geo, M[o.mat]);
  heap.rotation.x = -Math.PI / 2;
  g.add(heap);
  // (en el espacio del grupo: x, el alto del montón ahí, z; lejos de la bombilla)
  const sup = (x, z) => hAt(x, -z);
  const libre = (x, z, d = 0.011) => Math.hypot(x, z - 0.006) > d && (!efecto || Math.hypot(x, z) > R * 0.8);
  if (o.cosas) {
    const things = new THREE.Group();
    o.cosas(things, { R, sup, libre, M });
    if (things.children.length) g.add(fundir(things));
  }
  y0.parent.add(g);
  out.nodes.push(g);
  if (!efecto) out.hides.push(y0);
  out.yerba = g;
  return out;
}
// Cosas sueltas sobre el montón: n al azar (con semilla), acostadas sobre la
// curva o paradas, lejos de la bombilla.
function esparcir(g, { R, sup, libre }, n, seed, make, { dMin = 0.12, dMax = 0.75, lejos = 0.011, sep = 0 } = {}) {
  let k = 0;
  // (sep: distancia mínima entre centros, para que no se apilen)
  const puestos = [];
  for (let i = 0; i < n * 5 && k < n; i++) {
    const a = hash(i, 1, seed) * TAU;
    const d = (dMin + hash(i, 2, seed) * (dMax - dMin)) * R;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!libre(x, z, lejos)) continue;
    if (sep && puestos.some(([px, pz]) => Math.hypot(px - x, pz - z) < sep)) continue;
    const o = make(k, i, a);
    if (!o) continue;
    o.position.x = x;
    o.position.z = z;
    const L = o.userData.tumbado;
    if (L) {
      // (acostado sobre la curva del montón: las dos puntas apoyan, ninguna
      // queda en el aire; el usuario, 2026-10-13: "vuelan los pedacitos")
      const d = v3(0, 1, 0).applyQuaternion(o.quaternion);
      const h0 = sup(x - (d.x * L) / 2, z - (d.z * L) / 2);
      const h1 = sup(x + (d.x * L) / 2, z + (d.z * L) / 2);
      o.quaternion.setFromUnitVectors(v3(0, 1, 0), d.setY((h1 - h0) / L).normalize());
      o.position.y = (h0 + h1) / 2;
    } else o.position.y += sup(x, z);
    puestos.push([x, z]);
    g.add(o);
    k++;
  }
}
const palito = (M, len, rr, a, up, seed, i) => {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), M.palo);
  s.scale.set(rr, len, rr);
  if (up) s.rotation.set(0.5, hash(i, 5, seed) * TAU, 0, 'YXZ');
  else {
    const tw = (hash(i, 5, seed) - 0.5) * 0.5;
    s.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(-Math.sin(a + tw), 0, Math.cos(a + tw)));
    s.userData.tumbado = len;
  }
  s.position.y = up ? len * 0.2 : rr * 0.5;
  return s;
};
// una hojita acostada (un plano curvado, con su vena)
function hojita(mat, L, W, seed, i) {
  const geo = new THREE.PlaneGeometry(W, L, 2, 6);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const y = pos.getY(k) / L + 0.5;
    // la forma de lanza y un poco de curva
    pos.setX(k, x * Math.sin(Math.PI * clamp(y * 0.95 + 0.03)));
    pos.setZ(k, Math.abs(x) * 0.25 + Math.sin(y * Math.PI) * 0.0012);
  }
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, mat);
  o.rotation.set(-Math.PI / 2 + 0.08, 0, hash(i, 7, seed) * TAU, 'XZY');
  o.position.y = 0.0006;
  return o;
}
const YERBAS = {
  // la yerba asoma en montañita sobre la boca, más verde, con palitos encima
  yerbaColmada: {
    mat: 'yerba',
    alto: 0.021,
    cosas(g, c) {
      // (todos acostados y separados: parados o apilados se veían volando;
      // el usuario, 2026-10-13)
      esparcir(g, c, 10, 91, (k, i, a) => palito(c.M, 0.006 + hash(i, 3, 91) * 0.006, 0.0007 + hash(i, 4, 91) * 0.0004, a, false, 91, i), { dMin: 0.15, dMax: 0.6, sep: 0.0075, lejos: 0.016 });
    },
  },
  // ahumada, oscura, con hojas enteras
  yerbaBarbacua: { mat: 'barbacua', alto: 0.012, cosas: (g, c) => esparcir(g, c, 7, 93, (k, i) => hojita(c.M.hojaSeca, 0.007 + hash(i, 3, 93) * 0.004, 0.004, 93, i)) },
  // gruesa: granos grandes y hojas que asoman
  yerbaGruesa: {
    mat: 'gruesa',
    alto: 0.014,
    rug: 1.8,
    cosas(g, c) {
      esparcir(g, c, 16, 95, (k, i) => {
        const s = 0.0016 + hash(i, 3, 95) * 0.0014;
        const o = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), c.M.gruesa);
        o.rotation.set(hash(i, 4, 95) * 3, hash(i, 5, 95) * 3, 0);
        o.position.y = s * 0.3;
        return o;
      }, { dMax: 0.85 });
      esparcir(g, c, 5, 96, (k, i) => hojita(c.M.hoja, 0.006, 0.0035, 96, i));
    },
  },
  // ramitas de peperina con florcitas
  yerbaPeperina: {
    mat: 'yerba',
    alto: 0.011,
    cosas(g, c) {
      esparcir(g, c, 3, 97, (k, i, a) => {
        const sp = new THREE.Group();
        const L = 0.014;
        const dir = v3(-Math.sin(a + 0.4), 0.18, Math.cos(a + 0.4)).normalize();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0006, L, 5), c.M.palo);
        stem.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
        stem.position.copy(dir).multiplyScalar(L / 2);
        sp.add(stem);
        for (let j = 0; j < 4; j++) {
          const p = dir.clone().multiplyScalar(L * (0.25 + j * 0.22));
          for (const s of [-1, 1]) {
            const lf = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 6, 4), c.M.hoja);
            lf.scale.set(1, 0.3, 0.55);
            lf.position.copy(p).add(v3(s * 0.0016 * Math.cos(a), 0.0004, s * 0.0016 * Math.sin(a)));
            sp.add(lf);
          }
        }
        // las florcitas, en la punta
        for (let j = 0; j < 5; j++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 6, 4), c.M.flor);
          f.position.copy(dir).multiplyScalar(L * 0.95).add(v3((hash(j, 1, i) - 0.5) * 0.003, 0.0008 + hash(j, 2, i) * 0.0012, (hash(j, 3, i) - 0.5) * 0.003));
          sp.add(f);
        }
        sp.position.y = 0.0005;
        return sp;
      }, { dMin: 0.2, dMax: 0.55 });
    },
  },
  // fina, pareja y verde clara
  yerbaDespalada: { mat: 'despalada', alto: 0.006, rug: 0.35 },
  // hojas de cedrón largas, cruzadas encima
  yerbaCedron: { mat: 'yerba', alto: 0.01, cosas: (g, c) => esparcir(g, c, 4, 99, (k, i) => hojita(c.M.hoja, 0.017 + hash(i, 3, 99) * 0.004, 0.0042, 99, i), { dMin: 0.15, dMax: 0.45, lejos: 0.014 }) },
  // con palos largos cruzados
  yerbaPalo: { mat: 'yerba', alto: 0.011, cosas: (g, c) => esparcir(g, c, 6, 101, (k, i, a) => palito(c.M, 0.016 + hash(i, 3, 101) * 0.009, 0.0009 + hash(i, 4, 101) * 0.0004, a + 0.9, false, 101, i), { dMin: 0.2, dMax: 0.55 }) },
  // dorada, seca, más suelta
  yerbaEstacionada: { mat: 'estacionada', alto: 0.013, rug: 1.5, cosas: (g, c) => esparcir(g, c, 6, 103, (k, i) => hojita(c.M.hojaSeca, 0.005, 0.0032, 103, i)) },
  // colmada hasta pasar el borde
  yerbaKilo: { mat: 'kilo', alto: 0.03, rug: 1.3 },
  // apisonada, oscura, con la marca de la cuchara
  yerbaCompactada: { mat: 'compactada', alto: 0.004, rug: 0.4, pozo: 0.0035 },
  // con granitos de pólvora que brillan apenas
  yerbaPolvora: {
    mat: 'yerba',
    alto: 0.011,
    cosas(g, c) {
      const geo = new THREE.OctahedronGeometry(0.0009, 0);
      esparcir(g, c, 34, 105, (k, i) => {
        const o = new THREE.Mesh(geo, c.M.polvora);
        o.rotation.set(hash(i, 4, 105) * 3, hash(i, 5, 105) * 3, 0);
        o.position.y = 0.0004;
        return o;
      }, { dMin: 0.05, dMax: 0.9, lejos: 0.009 });
    },
  },
  // en panes prensados
  yerbaPrensada: {
    mat: 'prensada',
    alto: 0.006,
    cosas(g, c) {
      esparcir(g, c, 3, 107, (k, i, a) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.004, 0.008), c.M.prensada);
        o.rotation.set((hash(i, 4, 107) - 0.5) * 0.3, a, (hash(i, 5, 107) - 0.5) * 0.3);
        o.position.y = 0.0016;
        return o;
      }, { dMin: 0.35, dMax: 0.5, lejos: 0.016 });
    },
  },
};

// ---------------- cuerpo ----------------
// Fajas, fundas y manijas: en la ventana libre del cuerpo (ventana), con lo
// suyo de frente (rumbo). o.arma(parts, V, ctx) arma en el espacio de la faja.
function cuerpoNuevo(m, M, id, o) {
  const out = { nodes: [], hides: [], entra: 'ciñe' };
  const fit = m.mate.userData.fit;
  if (!fit) return out;
  const T = o.T;
  const S = escanear(m, T);
  // (las fundas toman todo lo que hay entre los dedos y la virola)
  const w = o.funda ? clamp(S.topY - fit.hand - 0.004, 0.014, 0.05) : o.ancho || 0.015;
  let V = ventana(m, T, w);
  // (si cae arriba de un zuncho, se prueba más angosta entre los zunchos)
  if (!o.funda && V.worst > 0.0015) {
    for (const k of [0.75, 0.55]) {
      const V2 = ventana(m, T, w * k);
      if (V2.worst < V.worst - 0.0005) V = V2;
      if (V.worst <= 0.0015) break;
    }
  }
  const g = new THREE.Group();
  g.userData.acc = id;
  const parts = new THREE.Group();
  o.arma(parts, V, { M, m });
  if (!parts.children.length) return out;
  g.add(fundir(parts));
  asentar(m, g, V.ym);
  m.mate.add(g);
  out.nodes.push(g);
  return out;
}
const CUERPOS = {
  // una faja de tiento en espiga apretada al mate, con su botón de tiento y
  // dos puntas que cuelgan
  tiento: {
    ancho: 0.015,
    arma(g, V, { M }) {
      addAll(g, faja(V, M.tiento, { bulge: 0.0026 }));
      for (const y of [-V.w / 2 + 0.0008, V.w / 2 - 0.0008]) addAll(g, faja(V, M.tientoFino, { w: 0.0022, dy: y, bulge: 0.0012, n: 4, lift: 0.0006 }));
      const a = rumbo(V);
      const rk = V.R(V.ym) + 0.0036;
      const knot = mesh(new THREE.SphereGeometry(0.0042, 10, 8), M.tiento, enRumbo(a, rk, 0));
      knot.scale.set(1, 1.15, 0.75);
      knot.rotation.y = a;
      g.add(knot);
      for (const s of [-1, 1]) {
        const aa = a + s * 0.07;
        const tail = mesh(new THREE.BoxGeometry(0.0022, 0.012, 0.0009), M.tiento, enRumbo(aa, V.R(V.ym - 0.008) + 0.0028, -0.0075));
        tail.rotation.set(0, aa, s * 0.18);
        g.add(tail);
      }
    },
  },
  // funda de carpincho hasta media altura, con el canto enrollado
  fundaCarpincho: {
    funda: true,
    arma(g, V, { M }) {
      addAll(g, faja(V, M.carpincho, { bulge: 0.0009, n: 12 }));
      for (const s of [-1, 1]) addAll(g, faja(V, M.carpincho, { w: 0.0026, dy: s * (V.w / 2 - 0.0013), bulge: 0.0014, n: 4, lift: 0.0005 }));
    },
  },
  // lonja ancha de cuero crudo con tientos cruzados en X
  lonjaCruda: {
    ancho: 0.022,
    arma(g, V, { M }) {
      addAll(g, faja(V, M.crudo, { bulge: 0.0015 }));
      const a = rumbo(V);
      const R = V.R(V.ym) + 0.0026;
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push(enRumbo(a + (t - 0.5) * 0.5 * s, R + Math.sin(t * Math.PI) * 0.0006, (t - 0.5) * V.w * 0.86));
        }
        g.add(tubo(pts, 0.0011, M.tientoFino, 24, 5));
      }
    },
  },
  // asa de tiento trenzado del lado de afuera
  manijaTiento: {
    ancho: 0.03,
    arma(g, V, { M }) {
      const a = rumbo(V, -Math.PI / 2);
      addAll(g, faja(V, M.tientoFino, { w: 0.003, dy: -V.w / 2 + 0.0015, bulge: 0.0012, n: 4 }));
      addAll(g, faja(V, M.tientoFino, { w: 0.003, dy: V.w / 2 - 0.0015, bulge: 0.0012, n: 4 }));
      const R = V.R(V.ym) + 0.0018;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const out = Math.sin(t * Math.PI) * 0.016;
        pts.push(enRumbo(a, R + out, (t - 0.5) * (V.w - 0.003)));
      }
      g.add(tubo(pts, 0.0024, M.tiento, 32, 7));
    },
  },
  // faja de cuero cosida con tiento en zigzag
  tientoCosido: {
    ancho: 0.016,
    arma(g, V, { M }) {
      addAll(g, faja(V, M.cuero, { bulge: 0.0016 }));
      for (const [a0, al] of V.arcos) {
        const pts = [];
        const n = Math.max(4, Math.round((al / TAU) * 40));
        for (let i = 0; i <= n; i++) {
          const a = a0 + (al * i) / n;
          const yl = (i % 2 ? 1 : -1) * V.w * 0.3;
          pts.push(enRumbo(a, V.R(V.ym + yl) + 0.0019, yl));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), n * 6, 0.0008, 4), M.tientoFino));
      }
    },
  },
  // funda de vaqueta lisa con pespunte claro
  fundaVaqueta: {
    funda: true,
    arma: (g, V, { M }) => addAll(g, faja(V, M.vaqueta, { bulge: 0.0008, n: 12 })),
  },
  // tres tientos paralelos con un pasador de plata
  fajaTiento: {
    ancho: 0.016,
    arma(g, V, { M }) {
      for (const k of [-1, 0, 1]) addAll(g, faja(V, M.tiento, { w: V.w * 0.27, dy: k * V.w * 0.33, bulge: 0.0016, n: 5 }));
      const a = rumbo(V);
      const p = mesh(new THREE.BoxGeometry(0.0062, V.w + 0.002, 0.0022), M.plata, enRumbo(a, V.R(V.ym) + 0.0028, 0));
      p.rotation.y = a;
      g.add(p);
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.0009, 8, 6), M.plata, enRumbo(a, V.R(V.ym) + 0.004, s * V.w * 0.36)));
    },
  },
  // faja de cuero con hebilla de hierro
  fajaHebilla: {
    ancho: 0.014,
    arma(g, V, { M }) {
      addAll(g, faja(V, M.cuero, { bulge: 0.0014 }));
      const a = rumbo(V);
      const R = V.R(V.ym) + 0.0026;
      const hb = new THREE.Group();
      const W = 0.012;
      const H = V.w + 0.004;
      for (const [x, y, w, h] of [[0, H / 2, W, 0.0016], [0, -H / 2, W, 0.0016], [-W / 2, 0, 0.0016, H], [W / 2, 0, 0.0016, H]]) hb.add(mesh(new THREE.BoxGeometry(w, h, 0.0016), M.hierro, v3(x, y, 0)));
      hb.add(mesh(new THREE.BoxGeometry(0.0011, 0.0011, W * 0.9), M.hierro, v3(-W * 0.05, 0, 0.0004), [0, Math.PI / 2, 0]));
      hb.position.copy(enRumbo(a, R, 0));
      hb.rotation.y = a;
      g.add(hb);
      // la punta de la correa que sobra, pasada
      const tip = mesh(new THREE.BoxGeometry(0.012, V.w * 0.9, 0.0014), M.cuero, enRumbo(a + 0.22, R - 0.0004, 0));
      tip.rotation.y = a + 0.22;
      g.add(tip);
    },
  },
  // faja de cuero liso con costura
  fajaCuero: { ancho: 0.016, arma: (g, V, { M }) => addAll(g, faja(V, M.cuero, { bulge: 0.0016 })) },
};

// ---------------- el Lanzapava (especialista del Mate 47) ----------------
// Una pava de hierro colgada abajo de la bombilla, parada como en la hornalla:
// la manija en arco la abraza a la bombilla, el pico sale de abajo y apunta
// para adelante (es el caño del lanzagranadas) y la tapa con su perilla se
// abre al pasar a lanzapava (weapons/lanzapava.js). 'lanzapavaAbierta': la
// misma con la tapa abierta (la que ven los compañeros).
function lanzapava(m, M, id) {
  const out = { nodes: [], hides: [], entra: 'enrosca' };
  const b = pajas(m, true).find((x) => x.userData.acc) || pajas(m)[0];
  if (!b) return out;
  const [tube] = b.children;
  const len = tube.geometry.parameters.height * (tube.scale.y || 1);
  const r = tube.geometry.parameters.radiusTop * (tube.scale.x || 1);
  const g = new THREE.Group();
  g.userData.acc = id;
  g.name = 'lanzapava';
  // la pava, en su propio espacio (y para arriba, el pico para -z): se cuelga
  // abajo de la bombilla con su arriba mirando a la bombilla y el pico para
  // adelante (en la bombilla: y a lo largo, -z para abajo en la mano)
  const kettle = new THREE.Group();
  // (K: el tamaño; tl y rl, la bombilla vista desde la pava)
  const K = 1.3;
  const top = r + 0.0215 * K;
  const tl = top / K;
  const rl = r / K;
  kettle.position.set(0, len * 0.56, -top);
  kettle.rotation.x = Math.PI / 2;
  kettle.scale.setScalar(K);
  const parts = new THREE.Group();
  parts.add(lathe([[0, -0.0112], [0.0105, -0.0108], [0.0148, -0.0072], [0.0163, -0.0015], [0.0158, 0.0035], [0.0132, 0.0078], [0.0098, 0.0106], [0.0088, 0.0112], [0.0088, 0.0116]], M.hierro, 28));
  // el fondo y el filete de bronce de la panza
  parts.add(aro(0.0161, 0.0008, M.bronce, -0.0012, 6, 40));
  // el pico: sale de abajo adelante, sube y apunta para adelante
  const sp = [v3(0, -0.004, -0.0125), v3(0, -0.0015, -0.021), v3(0, 0.0035, -0.0285), v3(0, 0.0065, -0.0365)];
  parts.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 16, 0.0036, 10), M.hierro));
  parts.add(mesh(new THREE.TorusGeometry(0.0037, 0.0008, 6, 18), M.bronce, v3(0, 0.0063, -0.0358), [0, 0, 0]));
  // la manija: dos brazos de los costados que suben y abrazan la bombilla
  // (así la tapa del medio se puede abrir)
  for (const sx of [-1, 1]) {
    const arm = [v3(sx * 0.0128, 0.0075, 0), v3(sx * 0.0122, 0.0135, 0), v3(sx * (rl * 1.25 + 0.002), tl - 0.003, 0), v3(sx * rl * 1.18, tl, 0)];
    parts.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arm), 14, 0.0016, 6), M.hierro));
    parts.add(mesh(new THREE.SphereGeometry(0.0022, 8, 6), M.bronce, v3(sx * 0.0128, 0.0075, 0)));
  }
  parts.add(mesh(new THREE.TorusGeometry(rl * 1.18, 0.0013, 6, 18), M.hierro, v3(0, tl, 0)));
  parts.add(mesh(new THREE.TorusGeometry(rl * 1.18, 0.0011, 6, 18), M.hierro, v3(0, tl, 0.006)));
  kettle.add(fundir(parts));
  // la tapa, con su perilla: gira en el borde de atrás
  const lid = new THREE.Group();
  lid.name = 'lanzapava-tapa';
  lid.position.set(0, 0.0116, 0.0088);
  const lp = new THREE.Group();
  lp.add(lathe([[0, 0.0016], [0.006, 0.0013], [0.0092, 0.0002], [0.0092, -0.0004], [0, -0.0004]], M.hierro, 20));
  lp.add(mesh(new THREE.SphereGeometry(0.0021, 10, 8), M.bronce, v3(0, 0.0032, 0)));
  lp.position.z = -0.0088;
  lid.add(fundir(lp));
  if (id === 'lanzapavaAbierta') lid.rotation.x = 0.85;
  kettle.add(lid);
  const tip = new THREE.Object3D();
  tip.name = 'lanzapava-punta';
  tip.position.set(0, 0.0068, -0.0375);
  kettle.add(tip);
  g.add(kettle);
  b.add(g);
  out.nodes.push(g);
  out.lid = lid;
  out.tip = tip;
  return out;
}

// ---------------- la tabla ----------------
// id -> [quién lo arma, sus datos, en qué orden va (la bombilla antes que el
// pico: el pico se pone en las bombillas que haya)]
const BUILD = {};
for (const [id, o] of Object.entries(BOMBILLAS)) BUILD[id] = [bombillaNueva, o, 0];
for (const [id, o] of Object.entries(PICOS)) BUILD[id] = [picoNuevo, o, 1];
for (const [id, o] of Object.entries(VIROLAS)) BUILD[id] = [virolaNueva, o, 2];
for (const [id, o] of Object.entries(YERBAS)) BUILD[id] = [yerbaNueva, o, 3];
for (const [id, o] of Object.entries(CUERPOS)) BUILD[id] = [cuerpoNuevo, o, 4];
// (la misma manija con otro efecto: core/armas.js manijaTientoR)
BUILD.manijaTientoR = BUILD.manijaTiento;
BUILD.lanzapava = [lanzapava, {}, 5];
BUILD.lanzapavaAbierta = [lanzapava, {}, 5];
export const tieneModelo = (id) => !!BUILD[id];

// Pone los accesorios en el mate armado (m: lo que devuelve buildMate).
export function ponerAccesorios(m, ids, T, { armeria = false } = {}) {
  if (!m?.mate || !ids?.length) return m;
  const M = mats(T);
  m.acc = {};
  const list = ids.filter((id) => BUILD[id]).sort((a, b) => BUILD[a][2] - BUILD[b][2]);
  const pajasNuevas = [];
  for (const id of list) {
    const [fn, o] = BUILD[id];
    let a;
    try {
      a = fn(m, M, id, { ...o, T });
    } catch (e) {
      // (un accesorio que no se puede armar en este mate no rompe el mate)
      console.error('accesorio', id, e);
      continue;
    }
    m.acc[id] = a;
    for (const n of a.nodes) {
      n.traverse((x) => {
        if (x.isMesh) x.castShadow = armeria;
      });
      n.userData.base = { p: n.position.clone(), r: n.rotation.clone(), s: n.scale.clone() };
    }
    if (armeria) {
      // (en la armería: escondidos hasta que entran)
      for (const n of a.nodes) n.visible = false;
      continue;
    }
    for (const n of a.hides) n.visible = false;
    // la punta nueva (el fogonazo sale de acá); la punta para apuntar
    // (Weapons.animate: la punta queda bajo la mira) se queda donde estaba: así
    // el mate no se acerca a la cara al apuntar
    if (a.muzzle) m.muzzle = a.muzzle;
    // (la yerba nueva es la que se vuelca al cambiar la yerba de los Gemelos;
    // si no, Weapons.animateYerba volvía a prender la de siempre)
    if (a.yerba) m.yerba = a.yerba;
    if (fn === bombillaNueva) pajasNuevas.push(...a.nodes.filter(esPaja));
  }
  // (en la mano, al final de todo: la bombilla nueva en una malla por
  // material —caño, filtro, anillo y adornos juntos—; el pico queda aparte)
  if (!armeria) for (const n of pajasNuevas) compactar(n);
  return m;
}

// Junta las mallas sueltas de una bombilla (y las de sus adornos fundidos) por
// material, en el espacio de la bombilla. No toca el grupo del pico, lo que se
// mueve (userData.dynamic) ni lo que cuelga con nombre (el Lanzapava).
function compactar(b) {
  b.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
  const pico = b.children[2];
  const by = new Map();
  const take = (o) => {
    if (!o.isMesh || o.children.length || o.userData.dynamic || o.userData.acc || Array.isArray(o.material)) return;
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(o);
  };
  for (const c of b.children) {
    if (c === pico || c.userData.acc || c.name) continue;
    if (c.isMesh) take(c);
    else if (c.isGroup) for (const k of c.children) take(k);
  }
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (geo.index) geo = geo.toNonIndexed();
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      return geo;
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    // (el primero queda, con todo; los demás se van)
    const keep = list[0];
    keep.geometry = merged;
    keep.removeFromParent();
    keep.position.set(0, 0, 0);
    keep.rotation.set(0, 0, 0);
    keep.scale.set(1, 1, 1);
    b.add(keep);
    for (const o of list.slice(1)) o.removeFromParent();
  }
}

// ---------------- las animaciones de la armería ----------------
// k = 0 (afuera) a 1 (puesto). Mueve los nodos del accesorio y tapa lo del
// mate cuando termina de entrar. Si dos accesorios tapan lo mismo (uno sale y
// otro entra en la misma parte), manda el que más entró.
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const axisY = new THREE.Vector3();
function mover(o, entra, k) {
  const B = o.userData.base;
  // (la bombilla nueva entra cuando ya salió la de siempre: no se cruzan)
  const kk = entra === 'desliza' ? clamp((k - 0.45) / 0.55) : k;
  o.visible = kk > 0.001;
  if (!o.visible || !B) return;
  o.position.copy(B.p);
  o.rotation.copy(B.r);
  o.scale.copy(B.s);
  if (entra === 'desliza') {
    // baja de arriba, a lo largo de la bombilla, y se clava en la yerba
    axisY.set(0, 1, 0).applyEuler(B.r);
    o.position.addScaledVector(axisY, (1 - easeOut(kk)) * 0.11);
    o.scale.multiplyScalar(smooth(0, 0.4, kk));
  } else if (entra === 'crece') {
    // la yerba sube de adentro de la boca
    const e = easeBack(clamp(k));
    o.scale.set(B.s.x * (0.85 + 0.15 * k), B.s.y * Math.max(0.02, e), B.s.z * (0.85 + 0.15 * k));
  } else if (entra === 'enrosca') {
    // el pico llega de adelante girando y se enrosca
    const e = easeOut(k);
    axisY.set(0, 1, 0).applyEuler(B.r);
    o.position.addScaledVector(axisY, (1 - e) * 0.035);
    o.rotation.y = B.r.y + (1 - e) * 5;
    o.scale.multiplyScalar(smooth(0, 0.3, k));
  } else if (entra === 'baja') {
    // la virola cae de arriba girando y asienta con un rebote
    const e = easeBack(clamp(k));
    o.position.y = B.p.y + (1 - e) * 0.06;
    o.rotation.y = B.r.y + (1 - easeOut(k)) * 2.6;
    o.scale.multiplyScalar(0.9 + 0.1 * smooth(0, 1, k));
  } else {
    // la faja se ciñe: llega abierta y girando, y se aprieta al mate
    const e = easeOut(k);
    const sx = 1 + (1 - e) * 0.35;
    o.scale.set(B.s.x * sx, B.s.y * Math.max(0.02, easeBack(clamp(k))), B.s.z * sx);
    o.rotation.y = B.r.y + (1 - e) * 1.4;
  }
}
function ocultar(o, entra, k) {
  if (entra === 'desliza') {
    // la de siempre sale para arriba primero (y vuelve igual al sacar)
    const B = o.userData.hideBase || (o.userData.hideBase = { p: o.position.clone() });
    const t = clamp(k / 0.45);
    axisY.set(0, 1, 0).applyEuler(o.rotation);
    o.position.copy(B.p).addScaledVector(axisY, easeOut(t) * 0.11);
    o.visible = t < 0.999;
    o.scale.setScalar(1 - smooth(0.6, 1, t));
  } else if (entra === 'baja') o.visible = k < 0.9;
  else o.visible = k < 0.999;
}
export function animarAccesorios(list) {
  const hide = new Map();
  for (const [a, k] of list) {
    for (const o of a.nodes) mover(o, a.entra, k);
    for (const o of a.hides) {
      const h = hide.get(o);
      if (!h || k > h[0]) hide.set(o, [k, a.entra]);
    }
  }
  for (const [o, [k, entra]] of hide) ocultar(o, entra, k);
}
export const animarAccesorio = (a, k) => animarAccesorios([[a, k]]);
