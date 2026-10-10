import * as THREE from 'three';

// Texturas de piso y de roca en alta para Eclipse Matero (grafica-v3, 2d).
// El usuario: "mejorar la calidad de las texturas de los suelos y de las
// cosas que sostienen islas (en otros mapas no se ven y quedaron de baja
// calidad, pero acá se ven todo el tiempo)". Las de core/textures.js son de
// 512 px cada 2 a 4 m. Acá, solo en Eclipse y de Alta para arriba: la misma
// textura agrandada a 1024 con detalle nuevo pintado encima a esa resolución
// (briznas, piedritas, grietas, poros, líquenes, brillitos de la nieve) y su
// altura propia (lo que sobresale y lo que se hunde), que fx/Surfaces vuelve
// normal map y cavidad (parallax solo en la roca: en los pisos de celdas de
// Levels el parallax salta en la junta de dos cuadros y marca la grilla). Se pintan una sola vez por sesión (caché) y
// la original queda como estaba para los otros mapas: la nueva es otra
// textura (con map.userData.tileAs = la original, para que fx/Tiling y
// fx/Detail la traten igual). globalThis.__mduNoEclTex: las de siempre.

const S = 1024;
const cache = new Map();
export const texStats = { ms: 0, n: 0, bytes: 0 };

const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

// qué se le pinta a cada una: [tipo, semilla, relieve de color, alto]
const KIND = {
  grass: ['grass', 11, 0.35],
  dirt: ['dirt', 12, 0.4],
  dirtDark: ['dirt', 13, 0.4],
  ground: ['dirt', 14, 0.4],
  rock: ['rock', 15, 0.5],
  caveRock: ['rock', 16, 0.5],
  snow: ['snow', 17, 0.25],
  concrete: ['concrete', 18, 0.35],
  flagstone: ['flag', 19, 0.3],
};

// Dibuja fn(x, y) y, si toca un borde, también del otro lado (la textura se repite).
function wrap(fn, x, y, r) {
  for (const ox of [0, x < r ? S : x > S - r ? -S : null]) {
    if (ox === null) continue;
    for (const oy of [0, y < r ? S : y > S - r ? -S : null]) {
      if (oy === null) continue;
      fn(x + ox, y + oy);
    }
  }
}

function paintHi(src, kind, seed) {
  const r = rng(seed * 7919 + 1);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, S, S);
  // la altura: gris medio y lo que se pinta encima
  const hc = document.createElement('canvas');
  hc.width = hc.height = S;
  const hx = hc.getContext('2d');
  hx.fillStyle = 'rgb(128,128,128)';
  hx.fillRect(0, 0, S, S);
  const line = (g, pts, wd, col) => {
    g.strokeStyle = col;
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  const crack = (n, len, col, depth) => {
    for (let k = 0; k < n; k++) {
      let px = r() * S;
      let py = r() * S;
      let a = r() * Math.PI * 2;
      const pts = [px, py];
      const L = len * (0.5 + r());
      for (let s = 0; s < 8; s++) {
        a += (r() - 0.5) * 1.1;
        px += (Math.cos(a) * L) / 8;
        py += (Math.sin(a) * L) / 8;
        pts.push(px, py);
      }
      const wd = 0.8 + r() * 1.4;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const P = pts.map((v, i) => v + (i % 2 ? oy : ox));
        line(x, P, wd, col);
        line(hx, P, wd + 1, `rgb(${depth},${depth},${depth})`);
      }
    }
  };
  x.lineCap = hx.lineCap = 'round';
  if (kind === 'grass') {
    // briznas: cortas, en todas direcciones pero más paradas, de dos tonos
    for (let k = 0; k < 14000; k++) {
      const px = r() * S;
      const py = r() * S;
      const L = 3 + r() * 9;
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
      const ex = Math.cos(a) * L;
      const ey = Math.sin(a) * L;
      const light = r() < 0.45;
      const col = light ? `rgba(${150 + r() * 50},${160 + r() * 40},${70 + r() * 30},0.32)` : `rgba(${20 + r() * 20},${45 + r() * 25},${12 + r() * 12},0.38)`;
      wrap((qx, qy) => {
        line(x, [qx, qy, qx + ex, qy + ey], 1 + r() * 0.8, col);
        line(hx, [qx, qy, qx + ex, qy + ey], 1.6, light ? 'rgba(220,220,220,0.5)' : 'rgba(150,150,150,0.4)');
      }, px, py, 14);
    }
    // tierra que asoma entre las matas
    for (let k = 0; k < 260; k++) {
      const px = r() * S;
      const py = r() * S;
      const rr = 3 + r() * 9;
      wrap((qx, qy) => {
        x.fillStyle = `rgba(${70 + r() * 30},${52 + r() * 20},${30 + r() * 15},0.35)`;
        x.beginPath();
        x.ellipse(qx, qy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        x.fill();
        hx.fillStyle = 'rgba(60,60,60,0.35)';
        hx.beginPath();
        hx.ellipse(qx, qy, rr, rr * 0.7, 0, 0, Math.PI * 2);
        hx.fill();
      }, px, py, 12);
    }
  } else if (kind === 'dirt' || kind === 'rock') {
    const rock = kind === 'rock';
    // piedritas con su lado de sombra (la luz arriba a la izquierda)
    const n = rock ? 900 : 3200;
    for (let k = 0; k < n; k++) {
      const px = r() * S;
      const py = r() * S;
      const rr = (rock ? 2 : 1.2) + r() * (rock ? 7 : 4.5) * (r() < 0.1 ? 2 : 1);
      const ang = r() * 3;
      const tone = 0.75 + r() * 0.6;
      wrap((qx, qy) => {
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.beginPath();
        x.ellipse(qx + rr * 0.35, qy + rr * 0.35, rr, rr * 0.7, ang, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = `rgba(${Math.round(120 * tone)},${Math.round(108 * tone)},${Math.round(96 * tone)},0.55)`;
        x.beginPath();
        x.ellipse(qx, qy, rr, rr * 0.7, ang, 0, Math.PI * 2);
        x.fill();
        const gr = hx.createRadialGradient(qx, qy, 0, qx, qy, rr);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(160,160,160,0)');
        hx.fillStyle = gr;
        hx.beginPath();
        hx.ellipse(qx, qy, rr, rr * 0.7, ang, 0, Math.PI * 2);
        hx.fill();
      }, px, py, 12);
    }
    crack(rock ? 70 : 28, rock ? 120 : 60, 'rgba(15,10,8,0.55)', 20);
    if (rock) {
      // líquenes y manchas de humedad
      for (let k = 0; k < 500; k++) {
        const px = r() * S;
        const py = r() * S;
        const rr = 2 + r() * 6;
        const lich = r() < 0.5;
        wrap((qx, qy) => {
          x.fillStyle = lich ? `rgba(${110 + r() * 40},${120 + r() * 30},${60 + r() * 20},0.22)` : 'rgba(10,12,14,0.18)';
          x.beginPath();
          x.arc(qx, qy, rr, 0, Math.PI * 2);
          x.fill();
        }, px, py, 10);
      }
    }
  } else if (kind === 'snow') {
    for (let k = 0; k < 300; k++) {
      const px = r() * S;
      const py = r() * S;
      const rr = 10 + r() * 40;
      wrap((qx, qy) => {
        const gr = hx.createRadialGradient(qx, qy, 0, qx, qy, rr);
        const v = r() < 0.5 ? 200 : 70;
        gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
        gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        hx.fillStyle = gr;
        hx.fillRect(qx - rr, qy - rr, rr * 2, rr * 2);
        x.fillStyle = v > 128 ? 'rgba(255,255,255,0.06)' : 'rgba(120,140,170,0.08)';
        x.beginPath();
        x.arc(qx, qy, rr * 0.7, 0, Math.PI * 2);
        x.fill();
      }, px, py, 50);
    }
    // huellas y cristalitos
    for (let k = 0; k < 2500; k++) {
      x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
      x.fillRect(r() * S, r() * S, 1, 1);
    }
  } else if (kind === 'concrete' || kind === 'flag') {
    for (let k = 0; k < 7000; k++) {
      const px = r() * S;
      const py = r() * S;
      const dark = r() < 0.6;
      const rr = 0.6 + r() * (dark ? 1.4 : 2.2);
      x.fillStyle = dark ? 'rgba(20,18,16,0.45)' : 'rgba(210,205,195,0.3)';
      x.beginPath();
      x.arc(px, py, rr, 0, Math.PI * 2);
      x.fill();
      hx.fillStyle = dark ? 'rgba(40,40,40,0.8)' : 'rgba(200,200,200,0.6)';
      hx.beginPath();
      hx.arc(px, py, rr, 0, Math.PI * 2);
      hx.fill();
    }
    crack(kind === 'flag' ? 20 : 35, 90, 'rgba(25,22,20,0.5)', 30);
  }
  // grano fino en todo (a 1024: lo que la de 512 no tiene)
  const id = x.getImageData(0, 0, S, S);
  const d = id.data;
  const hd = hx.getImageData(0, 0, S, S).data;
  const H = new Float32Array(S * S);
  let s = seed * 104729 + 7;
  for (let i = 0, j = 0; i < S * S; i++, j += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = ((s >> 8) & 255) / 255 - 0.5;
    const k = 1 + n * 0.09;
    d[j] = Math.min(255, d[j] * k);
    d[j + 1] = Math.min(255, d[j + 1] * k);
    d[j + 2] = Math.min(255, d[j + 2] * k);
    H[i] = (hd[j] / 255 - 0.5) * 1.6 + n * 0.12;
  }
  x.putImageData(id, 0, 0);
  return { c, H };
}

// La versión en alta de la textura de color `orig` (key: su nombre en T), o null.
export function hiTex(orig, key) {
  if (!orig?.image || globalThis.__mduNoEclTex === true) return null;
  const K = KIND[key];
  if (!K) return null;
  if (cache.has(orig)) return cache.get(orig);
  const t0 = performance.now();
  const img = orig.image;
  // (la imagen de 512 de la textura; si vino de un worker es un canvas igual)
  if (!(img.width > 0) || img.width >= S) return null;
  const { c, H } = paintHi(img, K[0], K[1]);
  c.relief = { H, detail: K[2], blur: 2, depth: key === 'rock' || key === 'caveRock' ? 0.03 : 0, ao: 1.35, aoBlur: 5 };
  const t = orig.clone();
  t.source = new THREE.Source(c);
  t.userData = { ...orig.userData, tileAs: orig };
  t.anisotropy = Math.max(orig.anisotropy || 1, 8);
  t.needsUpdate = true;
  cache.set(orig, t);
  texStats.ms += performance.now() - t0;
  texStats.n++;
  // color + normal + cavidad/rugosidad, con sus mipmaps (lo que agrega a la placa)
  texStats.bytes += S * S * (4 + 4 + 2) * 1.33;
  return t;
}

// Le pone las texturas en alta a los materiales de piso, barranco y roca del
// mundo (solo los de esta lista; los otros mapas siguen con las suyas).
export function upgradeFloors(w) {
  const q = w.g?.settings?.quality;
  if (globalThis.__mduNoEclTex === true || !['high', 'ultra', 'epic'].includes(q)) return null;
  const T = w.T;
  const done = new Map();
  for (const [k, m] of Object.entries(w.M || {})) {
    const map = m?.map;
    if (!map) continue;
    const key = Object.keys(KIND).find((n) => T[n] === map);
    if (!key) continue;
    // (solo pisos y barrancos: lo de la lista de materiales de piso de Eclipse)
    if (!FLOOR_MATS.has(k)) continue;
    let hi = done.get(map);
    if (hi === undefined) {
      hi = hiTex(map, key);
      done.set(map, hi);
    }
    if (hi) m.map = hi;
  }
  return done;
}
export const FLOOR_MATS = new Set(['grass', 'dirt', 'dirtDark', 'ground', 'rock', 'caveRock', 'caveFloor', 'snow', 'concrete', 'stone', 'flagstone', 'flagstoneDark']);
