import * as THREE from 'three';

// La piel del Rayo Matero Mark III mejorado (Mark III Remolino Eterno): cada
// mate con la suya, en vez del camuflaje común del Pack-a-Pava.
//  - el derecho (el del remolino): obsidiana con brazos de galaxia violetas
//    que se enroscan alrededor del mate y se ponen naranjas en el medio, como
//    el disco de un agujero negro.
//  - el izquierdo (el del rayo): azul noche con rayos celestes que suben
//    ramificándose por la calabaza.
// Los dos con estrellitas. Las texturas se dibujan una sola vez (canvas) y
// siguen las UV del torno: x alrededor del mate, y a lo alto. La costura
// (x = 0) queda de frente a la cara, así que todo empalma de punta a punta.
const W = 512;
const H = 256;
let cache = null;

export function mk3Skin() {
  if (cache) return cache;
  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const mat = (map, rough) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: rough, metalness: 0.35, side: THREE.DoubleSide });
  cache = { remolino: mat(tex(remolinoCanvas()), 0.25), rayo: mat(tex(rayoCanvas()), 0.2) };
  return cache;
}

// Sorteo con semilla: la piel sale igual cada vez que se arma el mate.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stars(ctx, rand, n, color) {
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = rand() < 0.15 ? 1.4 : 0.7;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5 + rand() * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Obsidiana con dos brazos en espiral: a lo alto se van corriendo alrededor
// del mate (por eso en el torno quedan enroscados).
function remolinoCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // dos brazos (u * 2 empalma en la costura), torcidos con la altura
      const ph = u * 2 + v * 1.35 + 0.06 * Math.sin((u * 3 + v * 2) * Math.PI * 2);
      const f = ph - Math.floor(ph);
      const arm = Math.exp(-((f - 0.5) ** 2) / 0.018);
      const core = arm ** 7;
      // polvo tenue entre los brazos
      const dust = 0.12 * (0.5 + 0.5 * Math.sin((u * 8 - v * 5) * Math.PI * 2));
      const r = 10 + 120 * arm + 190 * core + 20 * dust;
      const g = 5 + 25 * arm + 120 * core + 6 * dust;
      const b = 18 + 170 * arm + 10 * core + 30 * dust;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, g);
      d[i + 2] = Math.min(255, b);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  stars(ctx, rng(31), 140, '#f4ecff');
  return c;
}

// Azul noche con rayos celestes que suben desde el pie y se abren en ramas.
function rayoCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1630');
  bg.addColorStop(1, '#040814');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const rand = rng(77);
  stars(ctx, rand, 90, '#dff6ff');
  // un rayo: pasos quebrados hacia arriba; a veces larga una rama
  const bolts = [];
  const bolt = (x, y, dir, len, w) => {
    const pts = [[x, y]];
    for (let k = 0; k < len; k++) {
      x += (rand() - 0.5) * 26 + dir * 6;
      y -= 8 + rand() * 12;
      pts.push([x, y]);
      if (w > 1 && rand() < 0.18) bolt(x, y, rand() < 0.5 ? -1 : 1, Math.floor(len * 0.5), w * 0.6);
      if (y < 0) break;
    }
    bolts.push({ pts, w });
  };
  for (let k = 0; k < 5; k++) bolt((k + rand() * 0.6) * (W / 5), H + 4, 0, 18, 3);
  // cada trazo tres veces (corrido un ancho a cada lado) para que empalme
  const stroke = (color, width, blur) => {
    ctx.strokeStyle = color;
    ctx.shadowColor = '#3ff0ff';
    ctx.shadowBlur = blur;
    ctx.lineJoin = 'round';
    for (const { pts, w } of bolts) {
      ctx.lineWidth = width * w;
      for (const off of [-W, 0, W]) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + off, y) : ctx.moveTo(x + off, y)));
        ctx.stroke();
      }
    }
  };
  stroke('rgba(40,200,255,0.55)', 2.4, 14);
  stroke('#bff8ff', 0.8, 6);
  ctx.shadowBlur = 0;
  return c;
}
