import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { canvasTex } from './penalProps';

// Muebles y telas del castillo del Mateendrache: estandartes con guarda
// pampa, los tapices de los cuatro caballeros de la luz, la mesa del
// banquete con el cordero, las armaduras con sombrero de ala ancha, la araña
// de guampas, los candelabros, el trono y el armero. Mismo formato que
// world/props.js; lo que va contra una pared mira hacia +z.

const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

const UP = new THREE.Vector3(0, 1, 0);
// Un palo (cilindro) de a hasta b.
function pole(g, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(cylGeo(r, r, d.length(), seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  g.add(m);
  return m;
}

// Los cuatro caballeros de la luz (y el color del Chiquitijuein).
export const KNIGHTS = {
  fuego: { name: 'EL CABALLERO DEL FUEGO', base: '#8e1d16', light: '#ff7a2a', glyph: 'fire' },
  viento: { name: 'EL CABALLERO DEL VIENTO', base: '#1d5a34', light: '#8affb8', glyph: 'wind' },
  rayo: { name: 'EL CABALLERO DEL RAYO', base: '#8a6a10', light: '#ffe45a', glyph: 'bolt' },
  hielo: { name: 'EL CABALLERO DEL HIELO', base: '#183e74', light: '#9adcff', glyph: 'ice' },
  sombra: { name: 'EL CHIQUITIJUEIN', base: '#141012', light: '#c01810', glyph: 'eyes' },
};

// ---------------- telas pintadas ----------------
// La guarda pampa: rombos escalonados en bandas (negro, blanco y el color).
export function guarda(ctx, x0, y0, w, h, fg, bg, accent) {
  ctx.fillStyle = bg;
  ctx.fillRect(x0, y0, w, h);
  const u = h / 6;
  for (let x = x0; x < x0 + w; x += u * 6) {
    // rombo escalonado: seis hileras, la del medio más ancha
    ctx.fillStyle = fg;
    for (let r = 0; r < 6; r++) {
      const wr = (r < 3 ? r + 1 : 6 - r) * 2 * u;
      ctx.fillRect(x + u * 3 - wr / 2, y0 + r * u, wr, u);
    }
    // el corazón del rombo, del color del caballero
    ctx.fillStyle = accent;
    ctx.fillRect(x + u * 2.5, y0 + u * 2, u, u * 2);
    // los ganchitos entre rombos
    ctx.fillStyle = fg;
    ctx.fillRect(x + u * 5.6, y0 + u * 1, u * 0.8, u * 0.5);
    ctx.fillRect(x + u * 5.6, y0 + u * 4.5, u * 0.8, u * 0.5);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x0, y0, w, u * 0.35);
  ctx.fillRect(x0, y0 + h - u * 0.35, w, u * 0.35);
}

// El símbolo de cada elemento.
export function glyph(ctx, kind, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.08;
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.25;
  ctx.beginPath();
  if (kind === 'fire') {
    ctx.moveTo(0, -s * 0.5);
    ctx.bezierCurveTo(s * 0.35, -s * 0.15, s * 0.4, s * 0.25, 0, s * 0.45);
    ctx.bezierCurveTo(-s * 0.4, s * 0.25, -s * 0.3, -s * 0.05, -s * 0.1, -s * 0.2);
    ctx.bezierCurveTo(-s * 0.05, 0, s * 0.05, -s * 0.2, 0, -s * 0.5);
    ctx.fill();
  } else if (kind === 'wind') {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, s * (0.14 + k * 0.13), k * 1.2, k * 1.2 + Math.PI * 1.35);
      ctx.stroke();
    }
  } else if (kind === 'bolt') {
    ctx.moveTo(s * 0.12, -s * 0.5);
    ctx.lineTo(-s * 0.22, s * 0.05);
    ctx.lineTo(0, s * 0.05);
    ctx.lineTo(-s * 0.12, s * 0.5);
    ctx.lineTo(s * 0.24, -s * 0.08);
    ctx.lineTo(0, -s * 0.08);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'ice') {
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k / 6) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s * 0.45);
      ctx.moveTo(0, -s * 0.28);
      ctx.lineTo(s * 0.1, -s * 0.36);
      ctx.moveTo(0, -s * 0.28);
      ctx.lineTo(-s * 0.1, -s * 0.36);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // los ojitos colorados del Chiquitijuein bajo el ala del sombrero
    ctx.fillStyle = '#050304';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.12, s * 0.5, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.2, -s * 0.45, s * 0.4, s * 0.35);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * s * 0.09, s * 0.04, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Estandarte (un poncho colgado): el color del caballero, dos guardas y su símbolo.
function bannerTex(kind) {
  const K = KNIGHTS[kind] || KNIGHTS.fuego;
  return canvasTex(`castleBanner_${kind}`, 128, 384, (ctx, w, h) => {
    ctx.fillStyle = K.base;
    ctx.fillRect(0, 0, w, h);
    // la trama de la lana
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, w, 1);
    }
    guarda(ctx, 0, 34, w, 36, '#0e0b0a', '#e8e0cc', K.light);
    guarda(ctx, 0, h - 96, w, 36, '#0e0b0a', '#e8e0cc', K.light);
    glyph(ctx, KNIGHTS[kind].glyph, w / 2, h * 0.45, 76, K.light);
    // los flecos
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 2; x < w; x += 6) ctx.fillRect(x, h - 22, 2, 22);
  });
}

// Tapiz de un caballero: la silueta de un gaucho con poncho y sombrero que
// levanta un mate encendido, con la guarda alrededor y su nombre abajo.
function tapestryTex(kind) {
  const K = KNIGHTS[kind] || KNIGHTS.fuego;
  return canvasTex(`castleTapiz_${kind}`, 256, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1410');
    g.addColorStop(0.6, K.base);
    g.addColorStop(1, '#120d0a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(0, y, w, 1);
    }
    // la cordillera de fondo
    ctx.fillStyle = 'rgba(230,232,240,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 250);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, 200 + Math.abs(Math.sin(x * 0.05) * 40) + (x % 48) * 0.4);
    ctx.lineTo(w, 250);
    ctx.fill();
    // el caballero (silueta): sombrero, poncho, piernas y el brazo en alto
    ctx.fillStyle = '#0c0908';
    const cx = w / 2;
    ctx.beginPath();
    ctx.ellipse(cx, 130, 44, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 18, 106, 36, 26);
    ctx.beginPath();
    ctx.moveTo(cx - 20, 150);
    ctx.lineTo(cx + 20, 150);
    ctx.lineTo(cx + 62, 262);
    ctx.lineTo(cx - 62, 262);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 26, 262, 18, 70);
    ctx.fillRect(cx + 8, 262, 18, 70);
    ctx.save();
    ctx.translate(cx + 26, 168);
    ctx.rotate(-0.9);
    ctx.fillRect(0, -7, 62, 14);
    ctx.restore();
    // la guarda del poncho
    guarda(ctx, cx - 58, 236, 116, 18, '#0c0908', K.light, '#e8e0cc');
    // el mate en alto, encendido
    glyph(ctx, K.glyph, cx + 64, 98, 58, K.light);
    // borde y nombre
    ctx.strokeStyle = '#d8c89a';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    guarda(ctx, 8, h - 52, w - 16, 26, '#0c0908', '#d8c89a', K.light);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(K.name, cx, 34);
  });
}

// Materiales de tela, con la cara de atrás también (se ven de los dos lados).
const clothCache = new Map();
function clothMat(key, tex) {
  let m = clothCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
    clothCache.set(key, m);
  }
  return m;
}

// Una tela que cuelga con ondas (plano con los vértices corridos).
function hangingCloth(w, h, mat, waves = 3, depth = 0.05) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = (h / 2 - y) / h;
    pos.setZ(i, Math.sin((x / w) * Math.PI * waves) * depth * (0.3 + k));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

let GOLD = null;
function goldMat() {
  if (!GOLD) GOLD = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: 0.35, metalness: 0.9 });
  return GOLD;
}
let ARMOR = null;
function armorMat() {
  if (!ARMOR) ARMOR = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.32, metalness: 0.95 });
  return ARMOR;
}
let HIDE = null;
// Cuero de vaca overo (blanco y negro): para el trono y las alfombras.
function hideMat() {
  if (!HIDE) {
    const tex = canvasTex('castleHide', 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#16110e';
      for (const [x, y, r] of [[30, 34, 22], [88, 50, 26], [54, 98, 20], [110, 110, 14], [12, 92, 12]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, x * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    HIDE = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
  }
  return HIDE;
}
let WAX = null;
function waxMat() {
  if (!WAX) WAX = new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
  return WAX;
}
let GLOW = null;
// La llamita de una vela (brilla sola, no necesita luz propia).
function candleGlow() {
  if (!GLOW) GLOW = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2.2), toneMapped: false });
  return GLOW;
}
function candle(g, x, y, z, h = 0.18) {
  C(g, 0.022, 0.024, h, waxMat(), x, y + h / 2, z, 0, 0, 0, 6);
  const f = mesh(new THREE.SphereGeometry(0.018, 6, 5), candleGlow(), x, y + h + 0.03, z);
  f.scale.set(1, 1.8, 1);
  f.castShadow = false;
  g.add(f);
}

export const DECOR = {
  // Estandarte colgado de la pared (kind: fuego, viento, rayo, hielo, sombra).
  estandarte(M, o) {
    const g = new THREE.Group();
    const w = o.w || 1.1;
    const h = o.h || 3.2;
    const y = o.y0 ?? 1.3;
    const cloth = hangingCloth(w, h, clothMat(`b_${o.kind}`, bannerTex(o.kind || 'fuego')), 2, 0.04);
    cloth.position.set(0, y + h / 2, 0.08);
    g.add(cloth);
    // la vara de arriba con sus puntas de bronce
    C(g, 0.03, 0.03, w + 0.3, M.woodDark || M.wood, 0, y + h + 0.03, 0.08, 0, 0, Math.PI / 2, 8);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), goldMat(), s * (w / 2 + 0.17), y + h + 0.03, 0.08));
    B(g, 0.05, 0.25, 0.1, M.iron, 0, y + h + 0.1, 0.03);
    return { obj: g, boxes: [] };
  },

  // Tapiz grande de uno de los cuatro caballeros de la luz.
  tapiz(M, o) {
    const g = new THREE.Group();
    const w = o.w || 2.4;
    const h = o.h || 3.6;
    const y = o.y0 ?? 1.2;
    const cloth = hangingCloth(w, h, clothMat(`t_${o.kind}`, tapestryTex(o.kind || 'fuego')), 3, 0.03);
    cloth.position.set(0, y + h / 2, 0.06);
    g.add(cloth);
    C(g, 0.045, 0.045, w + 0.4, M.woodDark || M.wood, 0, y + h + 0.04, 0.06, 0, 0, Math.PI / 2, 8);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), goldMat(), s * (w / 2 + 0.22), y + h + 0.04, 0.06));
    return { obj: g, boxes: [] };
  },

  // La mesa del banquete: tablones de algarrobo, bancos, el cordero en su
  // fuente, pan, jarras de vino, guampas y mates; velas en el medio.
  mesaBanquete(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 6;
    const wood = M.woodDark || M.wood;
    B(g, L, 0.1, 1.2, wood, 0, 0.82, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.14, 0.78, 0.14, wood, sx * (L / 2 - 0.3), 0.39, sz * 0.45);
    B(g, L - 0.6, 0.08, 0.1, wood, 0, 0.25, 0);
    for (const sz of [-1, 1]) {
      B(g, L, 0.08, 0.36, wood, 0, 0.46, sz * 0.95);
      for (const sx of [-1, 0, 1]) B(g, 0.1, 0.44, 0.3, wood, sx * (L / 2 - 0.4), 0.22, sz * 0.95);
    }
    // el cordero patagónico, entero, en la fuente del medio
    const meat = new THREE.MeshStandardMaterial({ color: 0x7a3a1c, roughness: 0.55 });
    B(g, 1.1, 0.04, 0.6, M.metal || M.iron, 0, 0.89, 0);
    const lamb = mesh(new THREE.CapsuleGeometry(0.16, 0.55, 4, 10), meat, 0, 1.02, 0, 0, 0, Math.PI / 2);
    lamb.scale.set(1, 1, 0.8);
    g.add(lamb);
    for (const s of [-1, 1]) g.add(mesh(new THREE.CapsuleGeometry(0.045, 0.3, 3, 6), meat, s * 0.3, 0.97, 0.16, 0.4, 0, Math.PI / 2 + s * 0.3));
    // velas, pan, jarras, guampas y mates a lo largo
    for (let k = 0; k < Math.floor(L / 1.3); k++) {
      const x = -L / 2 + 0.7 + k * 1.3 + (r() - 0.5) * 0.2;
      if (Math.abs(x) < 0.7) continue;
      candle(g, x, 0.87, (r() - 0.5) * 0.2, 0.14 + r() * 0.1);
      for (const sz of [-1, 1]) {
        // plato de peltre
        C(g, 0.13, 0.11, 0.02, M.silver || M.metal, x + 0.35, 0.88, sz * 0.36, 0, 0, 0, 12);
        const kind = r();
        if (kind < 0.4) {
          // guampa (vaso de cuerno)
          C(g, 0.04, 0.03, 0.16, M.bone || M.candle || M.wood, x + 0.1, 0.95, sz * 0.25, 0.2, 0, 0, 8);
        } else if (kind < 0.7) {
          C(g, 0.035, 0.028, 0.08, M.gourd || M.wood, x + 0.12, 0.91, sz * 0.26, 0, 0, 0, 8);
          C(g, 0.004, 0.004, 0.14, M.silver || M.metal, x + 0.14, 0.99, sz * 0.26, 0, 0, 0.3, 4);
        } else {
          // jarra de vino (malbec)
          C(g, 0.06, 0.07, 0.2, M.redPaint || M.drumRed, x + 0.1, 0.97, sz * 0.2, 0, 0, 0, 10);
        }
      }
      // pan
      g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc08a4a, roughness: 0.9 }), x - 0.3, 0.9, (r() - 0.5) * 0.3));
    }
    return { obj: g, boxes: [[-L / 2, 0, -0.6, L / 2, 1.0, 0.6], [-L / 2, 0, -1.15, L / 2, 0.5, -0.75], [-L / 2, 0, 0.75, L / 2, 0.5, 1.15]] };
  },

  // Armadura de caballero con sombrero de ala ancha, el poncho en los hombros
  // y la tacuara (lanza) al costado. kind: el color del poncho.
  armadura(M, o) {
    const g = new THREE.Group();
    const steel = armorMat();
    const K = KNIGHTS[o.kind] || KNIGHTS.sombra;
    const poncho = new THREE.MeshStandardMaterial({ color: new THREE.Color(K.base), roughness: 0.95, side: THREE.DoubleSide });
    // pedestal de piedra
    B(g, 0.8, 0.2, 0.7, M.castleStone || M.stone, 0, 0.1, 0);
    // piernas (grebas y escarpes)
    for (const s of [-1, 1]) {
      C(g, 0.075, 0.065, 0.55, steel, s * 0.13, 0.5, 0, 0, 0, 0, 10);
      C(g, 0.085, 0.075, 0.5, steel, s * 0.13, 1.02, 0, 0, 0, 0, 10);
      B(g, 0.13, 0.08, 0.26, steel, s * 0.13, 0.24, 0.05);
      g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), steel, s * 0.13, 0.76, 0.03));
    }
    // el peto y la espalda
    const chest = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 12), steel, 0, 1.55, 0);
    chest.scale.set(1.15, 1, 0.8);
    g.add(chest);
    C(g, 0.21, 0.19, 0.2, steel, 0, 1.2, 0, 0, 0, 0, 12);
    // hombreras, brazos y guanteletes
    for (const s of [-1, 1]) {
      const sh = mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, s * 0.28, 1.8, 0);
      g.add(sh);
      C(g, 0.06, 0.055, 0.34, steel, s * 0.32, 1.55, 0.02, 0, 0, s * 0.12, 8);
      C(g, 0.055, 0.05, 0.3, steel, s * 0.34, 1.26, 0.08, -0.5, 0, 0, 8);
      B(g, 0.09, 0.1, 0.11, steel, s * 0.35, 1.12, 0.17);
    }
    // el yelmo con la visera y el sombrero de ala ancha encima
    const helm = mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.3, 12), steel, 0, 2.05, 0);
    g.add(helm);
    g.add(mesh(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 2.2, 0));
    B(g, 0.16, 0.02, 0.02, M.black, 0, 2.08, 0.135);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x1e1612, roughness: 0.9 });
    C(g, 0.36, 0.36, 0.025, hatMat, 0, 2.3, 0, 0.05, 0, 0, 20);
    C(g, 0.15, 0.16, 0.14, hatMat, 0, 2.38, 0, 0.05, 0, 0, 14);
    C(g, 0.162, 0.162, 0.03, new THREE.MeshStandardMaterial({ color: new THREE.Color(K.light).multiplyScalar(0.5), roughness: 0.8 }), 0, 2.33, 0, 0.05, 0, 0, 14);
    // el poncho sobre los hombros (dos paños)
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.PlaneGeometry(0.34, 0.7, 1, 3), poncho, s * 0.2, 1.52, 0.02 * s, 0, s * 0.35, s * 0.18);
      g.add(p);
    }
    const back = mesh(new THREE.PlaneGeometry(0.62, 0.9, 1, 1), poncho, 0, 1.45, -0.17, 0.1, 0, 0);
    g.add(back);
    // la tacuara con su banderola
    C(g, 0.02, 0.025, 3.2, M.woodDark || M.wood, 0.45, 1.6, -0.05, 0, 0, 0.03, 6);
    const tip = mesh(new THREE.ConeGeometry(0.04, 0.3, 6), steel, 0.5, 3.35, -0.05);
    g.add(tip);
    const flag = mesh(new THREE.PlaneGeometry(0.4, 0.22), poncho, 0.66, 3.0, -0.05);
    g.add(flag);
    return { obj: g, boxes: [[-0.4, 0, -0.35, 0.55, 2.4, 0.35]] };
  },

  // Candelabro de hierro de pie, con siete velas.
  candelabro(M) {
    const g = new THREE.Group();
    C(g, 0.2, 0.26, 0.06, M.iron, 0, 0.03, 0, 0, 0, 0, 10);
    C(g, 0.025, 0.03, 1.6, M.iron, 0, 0.83, 0, 0, 0, 0, 8);
    const ring = mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 20), M.iron, 0, 1.62, 0, Math.PI / 2, 0, 0);
    g.add(ring);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      C(g, 0.012, 0.012, 0.28, M.iron, Math.cos(a) * 0.14, 1.62, Math.sin(a) * 0.14, 0, -a, Math.PI / 2, 5);
      C(g, 0.035, 0.03, 0.03, M.iron, Math.cos(a) * 0.28, 1.64, Math.sin(a) * 0.28, 0, 0, 0, 8);
      candle(g, Math.cos(a) * 0.28, 1.655, Math.sin(a) * 0.28, 0.16);
    }
    candle(g, 0, 1.64, 0, 0.22);
    // (el choque, del ancho del pie y no de la corona de velas)
    return { obj: g, boxes: [[-0.2, 0, -0.2, 0.2, 1.9, 0.2]] };
  },

  // La araña de guampas: una rueda de carreta colgada de cadenas, con cuernos
  // de vaca y velas. top: altura del techo sobre el piso.
  arana(M, o) {
    const g = new THREE.Group();
    const top = o.top || 10;
    const y = o.hang ?? top - 3.4;
    const wood = M.woodDark || M.wood;
    const wheel = mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 28), wood, 0, y, 0, Math.PI / 2, 0, 0);
    g.add(wheel);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      C(g, 0.03, 0.03, 1.1, wood, Math.cos(a) * 0.55, y, Math.sin(a) * 0.55, 0, -a, Math.PI / 2, 5);
    }
    C(g, 0.12, 0.12, 0.16, wood, 0, y, 0, 0, 0, 0, 10);
    const horn = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.45 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const hx = Math.cos(a) * 1.1;
      const hz = Math.sin(a) * 1.1;
      const hn = mesh(new THREE.ConeGeometry(0.06, 0.42, 8), horn, hx * 1.08, y + 0.18, hz * 1.08, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(hn);
      if (k % 2 === 0) candle(g, hx, y + 0.07, hz, 0.16);
    }
    // cadenas hasta el techo (de la rueda al gancho del medio)
    const up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const from = new THREE.Vector3(Math.cos(a) * 0.9, y, Math.sin(a) * 0.9);
      const to = new THREE.Vector3(0, y + 1.2, 0);
      const d = to.clone().sub(from);
      const ch = mesh(cylGeo(0.012, 0.012, d.length(), 4), M.iron, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      ch.quaternion.setFromUnitVectors(up, d.normalize());
      g.add(ch);
    }
    C(g, 0.015, 0.015, top - y - 1.2, M.iron, 0, (top + y + 1.2) / 2, 0, 0, 0, 0, 4);
    return { obj: g, boxes: [] };
  },

  // El trono: piedra y madera oscura, apoyabrazos con cabezas de dragón,
  // respaldo alto con un mate tallado y un cuero overo en el asiento; arriba
  // de una tarima de dos escalones.
  trono(M) {
    const g = new THREE.Group();
    const st = M.castleStone || M.stone;
    const dark = M.castleStoneDark || st;
    const wood = M.woodDark || M.wood;
    // el estrado: tres escalones de piedra
    B(g, 4.6, 0.2, 3.3, dark, 0, 0.1, 0.25);
    B(g, 3.8, 0.2, 2.7, st, 0, 0.3, 0.12);
    B(g, 3, 0.2, 2.1, dark, 0, 0.5, 0);
    for (const [w, d, y] of [[4.64, 3.34, 0.2], [3.84, 2.74, 0.4], [3.04, 2.14, 0.6]]) B(g, w, 0.03, d, goldMat(), 0, y - 0.01, y === 0.2 ? 0.25 : y === 0.4 ? 0.12 : 0);
    // atrás, el paño negro con los ojitos colorados del Chiquitijuein
    const cloth = hangingCloth(2.8, 5.2, clothMat('castleBanner_sombra', bannerTex('sombra')), 3, 0.06);
    cloth.position.set(0, 6.3, -1.05);
    g.add(cloth);
    C(g, 0.035, 0.035, 3.3, goldMat(), 0, 6.32, -1.05, 0, 0, Math.PI / 2, 8);
    // el asiento y el respaldo alto, en punta, con los bordes de oro
    B(g, 1.45, 0.5, 1.1, wood, 0, 0.85, 0);
    B(g, 1.5, 0.06, 1.15, goldMat(), 0, 1.12, 0);
    const back = new THREE.Shape();
    back.moveTo(-0.72, 0);
    back.lineTo(0.72, 0);
    back.lineTo(0.72, 2.7);
    back.quadraticCurveTo(0.7, 3.4, 0, 4.1);
    back.quadraticCurveTo(-0.7, 3.4, -0.72, 2.7);
    back.closePath();
    const backG = new THREE.ExtrudeGeometry(back, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    const backM = mesh(backG, wood, 0, 0.6, -0.58);
    g.add(backM);
    // el marco dorado del respaldo
    const frame = new THREE.Shape();
    frame.moveTo(-0.64, 0.1);
    frame.lineTo(0.64, 0.1);
    frame.lineTo(0.64, 2.66);
    frame.quadraticCurveTo(0.62, 3.3, 0, 3.92);
    frame.quadraticCurveTo(-0.62, 3.3, -0.64, 2.66);
    frame.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.52, 0.22);
    hole.lineTo(0.52, 0.22);
    hole.lineTo(0.52, 2.6);
    hole.quadraticCurveTo(0.5, 3.18, 0, 3.72);
    hole.quadraticCurveTo(-0.5, 3.18, -0.52, 2.6);
    hole.closePath();
    frame.holes.push(hole);
    // (apenas delante de la cara del respaldo: pegado a la misma altura titilaba)
    g.add(mesh(new THREE.ShapeGeometry(frame, 12), goldMat(), 0, 0.6, -0.285));
    // el mate de oro y la bombilla arriba del respaldo, y el dragón chiquito
    // (medio mate en relieve, todo por delante del respaldo: antes se hundía en la madera)
    const gourd = mesh(new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.82), goldMat(), 0, 3.5, -0.13);
    gourd.scale.set(1, 1.15, 0.5);
    gourd.material = gourd.material.clone();
    gourd.material.side = THREE.DoubleSide;
    g.add(gourd);
    const rim = mesh(new THREE.TorusGeometry(0.16, 0.024, 6, 18), goldMat(), 0, 3.79, -0.13, Math.PI / 2, 0, 0);
    rim.scale.set(1, 0.5, 1);
    g.add(rim);
    C(g, 0.022, 0.022, 0.6, goldMat(), 0.12, 3.98, -0.13, 0, 0, -0.35, 6);
    // apoyabrazos con cabeza de dragón (una boca abierta)
    for (const s of [-1, 1]) {
      B(g, 0.22, 0.6, 1, wood, s * 0.8, 1.2, 0.02);
      B(g, 0.26, 0.05, 1.04, goldMat(), s * 0.8, 1.52, 0.02);
      const head = new THREE.Group();
      head.position.set(s * 0.8, 1.6, 0.56);
      head.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.32), goldMat(), 0, 0, 0.05));
      head.add(mesh(new THREE.BoxGeometry(0.2, 0.07, 0.28), goldMat(), 0, -0.11, 0.1, 0.35, 0, 0));
      head.add(mesh(new THREE.ConeGeometry(0.03, 0.18, 5), goldMat(), -0.07, 0.14, -0.05, -0.5, 0, 0));
      head.add(mesh(new THREE.ConeGeometry(0.03, 0.18, 5), goldMat(), 0.07, 0.14, -0.05, -0.5, 0, 0));
      g.add(head);
      // dos columnitas de piedra a los costados del estrado, con brasas
      C(g, 0.16, 0.2, 1.6, st, s * 1.95, 0.8, 0.9, 0, 0, 0, 10);
      C(g, 0.28, 0.14, 0.2, M.iron, s * 1.95, 1.7, 0.9, 0, 0, 0, 12);
      C(g, 0.25, 0.25, 0.03, M.fireGlow || goldMat(), s * 1.95, 1.8, 0.9, 0, 0, 0, 12);
    }
    // el cuero overo del asiento
    const hide = mesh(new THREE.PlaneGeometry(1.3, 1.7), hideMat(), 0, 1.16, -0.05, -Math.PI / 2 + 0.25, 0, 0);
    g.add(hide);
    return { obj: g, boxes: [[-2.3, 0, -1.2, 2.3, 0.6, 1.9], [-1, 0, -0.8, 1, 4.7, 0.6]] };
  },

  // Armero: tacuaras, facones colgados, boleadoras y el lazo enrollado.
  armero(M, o, r) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const steel = armorMat();
    B(g, 2.2, 0.12, 0.12, wood, 0, 0.35, 0.1);
    B(g, 2.2, 0.12, 0.12, wood, 0, 1.9, 0.1);
    for (const s of [-1, 1]) B(g, 0.12, 2.2, 0.12, wood, s * 1.05, 1.1, 0.1);
    for (let k = 0; k < 6; k++) {
      const x = -0.85 + k * 0.34;
      C(g, 0.018, 0.022, 2.6, wood, x, 1.35, 0.14, (r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.05, 5);
      g.add(mesh(new THREE.ConeGeometry(0.035, 0.26, 5), steel, x, 2.78, 0.14));
    }
    // facones colgados
    for (let k = 0; k < 3; k++) {
      const x = -0.6 + k * 0.6;
      B(g, 0.04, 0.34, 0.01, steel, x, 1.2, 0.2);
      B(g, 0.05, 0.12, 0.04, M.leather || wood, x, 1.43, 0.2);
    }
    // boleadoras: tres piedras forradas con sus tientos
    for (let k = 0; k < 3; k++) {
      const x = 0.6 + (k - 1) * 0.12;
      g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), M.leather || wood, x, 0.7 - k * 0.08, 0.22));
      C(g, 0.006, 0.006, 0.7, M.rope || wood, x, 1.05 - k * 0.04, 0.2, 0, 0, (k - 1) * 0.1, 4);
    }
    // el lazo enrollado
    g.add(mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 20), M.rope || M.leather || wood, -0.55, 0.75, 0.22));
    return { obj: g, boxes: [[-1.15, 0, 0, 1.15, 2.2, 0.35]] };
  },

  // Farol de hierro sobre un poste (afuera): vidrio que brilla.
  farol(M) {
    const g = new THREE.Group();
    C(g, 0.06, 0.08, 2.6, M.iron, 0, 1.3, 0, 0, 0, 0, 8);
    B(g, 0.3, 0.05, 0.3, M.iron, 0, 2.62, 0);
    const glass = new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffb050, emissiveIntensity: 1.8 });
    B(g, 0.22, 0.34, 0.22, glass, 0, 2.82, 0);
    const cap = mesh(new THREE.ConeGeometry(0.22, 0.2, 4), M.iron, 0, 3.08, 0, 0, Math.PI / 4, 0);
    g.add(cap);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.12, 4), M.snowCap || M.clothWhite, 0, 3.14, 0, 0, Math.PI / 4, 0));
    return { obj: g, boxes: [[-0.12, 0, -0.12, 0.12, 2.6, 0.12]] };
  },

  // Vitral de la capilla: un ventanal de punta con vidrios de colores y el
  // símbolo de un caballero; brilla solo (entra la luna).
  vitral(M, o) {
    const g = new THREE.Group();
    const w = o.w || 1.4;
    const h = o.h || 3.4;
    const y = o.y0 ?? 1.6;
    const K = KNIGHTS[o.kind] || KNIGHTS.fuego;
    const tex = canvasTex(`castleVitral_${o.kind}`, 128, 320, (ctx, cw, ch) => {
      ctx.fillStyle = '#0a0808';
      ctx.fillRect(0, 0, cw, ch);
      // los vidrios: teselas de colores con el plomo oscuro entre medio
      const cols = [K.base, K.light, '#2a3a6a', '#d8c060', '#6a1a1a', '#e8e0d0'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let yy = 0; yy < ch; yy += 18) {
        for (let xx = 0; xx < cw; xx += 20) {
          ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
          ctx.globalAlpha = 0.55 + rnd() * 0.35;
          ctx.fillRect(xx + 2, yy + 2, 16 + rnd() * 4, 14 + rnd() * 3);
        }
      }
      ctx.globalAlpha = 1;
      glyph(ctx, K.glyph, cw / 2, ch * 0.42, 70, K.light);
      ctx.strokeStyle = '#0a0808';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, cw - 6, ch - 6);
    });
    const glass = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.3 });
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h - w / 2);
    shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
    const geo = new THREE.ShapeGeometry(shape, 12);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
    g.add(mesh(geo, glass, 0, y, 0.04));
    // el marco de piedra
    const st = M.castleStone || M.stone;
    B(g, 0.16, h - w / 2, 0.16, st, -w / 2 - 0.08, y + (h - w / 2) / 2, 0.06);
    B(g, 0.16, h - w / 2, 0.16, st, w / 2 + 0.08, y + (h - w / 2) / 2, 0.06);
    B(g, w + 0.4, 0.16, 0.2, st, 0, y - 0.08, 0.08);
    return { obj: g, boxes: [] };
  },

  // Atril con la crónica abierta (en la biblioteca).
  atril(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    C(g, 0.18, 0.24, 0.08, wood, 0, 0.04, 0, 0, 0, 0, 8);
    C(g, 0.05, 0.06, 1.05, wood, 0, 0.56, 0, 0, 0, 0, 8);
    B(g, 0.6, 0.05, 0.45, wood, 0, 1.12, 0, -0.45, 0, 0);
    const page = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, emissive: 0x3a2a14, emissiveIntensity: 0.25 });
    for (const s of [-1, 1]) B(g, 0.26, 0.02, 0.36, page, s * 0.14, 1.16, 0.02, -0.45, 0, s * -0.08);
    return { obj: g, boxes: [[-0.3, 0, -0.25, 0.3, 1.2, 0.25]] };
  },

  // Altar de un mate de la luz (kind: fuego, viento, rayo, hielo): pedestal
  // octogonal de tres escalones con la pileta de bronce arriba, el símbolo del
  // caballero en las cuatro caras y lo suyo en las esquinas: braseros de
  // hierro, varas con cóndores, pararrayos de cobre o agujas de hielo. El mate
  // que flota, las llamas y los brillos los pone entities/castle/Altares.js.
  altarMate(M, o) {
    const g = new THREE.Group();
    const st = M.castleStone || M.stone;
    const kind = o.kind || 'fuego';
    const oct = (r0, r1, h, mt, y) => g.add(mesh(new THREE.CylinderGeometry(r0, r1, h, 8), mt, 0, y, 0, 0, Math.PI / 8, 0));
    oct(1.02, 1.08, 0.14, st, 0.07);
    oct(0.84, 0.9, 0.14, st, 0.21);
    oct(0.6, 0.66, 0.12, st, 0.34);
    oct(0.34, 0.4, 0.95, st, 0.87);
    oct(0.6, 0.36, 0.2, st, 1.44);
    oct(0.46, 0.5, 0.04, M.iron, 1.55);
    g.add(mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 24).rotateX(Math.PI / 2), goldMat(), 0, 1.55, 0));
    // el símbolo tallado (brilla más cuando el mate está en su altar)
    const gm = altarGlyph(kind);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      g.add(mesh(new THREE.PlaneGeometry(0.3, 0.3), gm, Math.sin(a) * 0.356, 0.9, Math.cos(a) * 0.356, 0, a, 0));
    }
    // las esquinas
    const boxes = [[-0.72, 0, -0.72, 0.72, 1.6, 0.72]];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.sin(a) * 1.3;
      const z = Math.cos(a) * 1.3;
      if (kind === 'fuego') {
        // brasero de tres patas con el cuenco lleno de carbón
        for (let p = 0; p < 3; p++) {
          const b = a + (p / 3) * Math.PI * 2;
          C(g, 0.02, 0.025, 1.12, M.iron, x + Math.sin(b) * 0.12, 0.55, z + Math.cos(b) * 0.12, Math.cos(b) * 0.12, 0, -Math.sin(b) * 0.12, 5);
        }
        C(g, 0.22, 0.1, 0.16, M.iron, x, 1.14, z, 0, 0, 0, 10);
        C(g, 0.2, 0.2, 0.03, M.fireGlow, x, 1.2, z, 0, 0, 0, 10);
      } else if (kind === 'viento') {
        // vara de coihue con un cóndor de chapa y dos cintas atadas
        C(g, 0.035, 0.045, 2.1, M.woodDark || M.wood, x, 1.05, z, 0, 0, 0, 6);
        const wing = new THREE.Shape();
        wing.moveTo(0, 0);
        wing.lineTo(-0.34, 0.06);
        wing.lineTo(-0.24, 0.1);
        wing.lineTo(-0.06, 0.07);
        wing.lineTo(0, 0.14);
        wing.lineTo(0.06, 0.07);
        wing.lineTo(0.24, 0.1);
        wing.lineTo(0.34, 0.06);
        wing.closePath();
        g.add(mesh(new THREE.ShapeGeometry(wing), goldMat(), x, 2.1, z, 0, a, 0));
        C(g, 0.05, 0.05, 0.06, goldMat(), x, 1.62, z, 0, 0, 0, 8);
      } else if (kind === 'rayo') {
        // pararrayos: vara de cobre con la bobina y la bocha arriba
        C(g, 0.025, 0.04, 2.2, M.copper, x, 1.1, z, 0, 0, 0, 6);
        for (let c = 0; c < 6; c++) g.add(mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 12).rotateX(Math.PI / 2), M.copper, x, 1.3 + c * 0.05, z));
        g.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), M.brass, x, 2.24, z));
        C(g, 0.12, 0.16, 0.12, st, x, 0.06, z, 0, 0, 0, 8);
      } else {
        // un racimo de cristales de hielo (seis caras y la punta): uno alto al
        // medio y los chicos abiertos para afuera, con escarcha al pie
        for (const [d, t, r, h, tilt] of [[0, 0, 0.19, 1.75, 0.05], [0.2, 0.9, 0.12, 0.95, 0.4], [0.19, 2.6, 0.1, 0.7, 0.5], [0.17, 4.3, 0.08, 0.5, 0.6], [0.24, 5.4, 0.06, 0.34, 0.75]]) {
          const ang = a + t;
          const px = x + Math.sin(ang) * d;
          const pz = z + Math.cos(ang) * d;
          g.add(mesh(crystalGeo(r, h, t), iceSpike(), px, -0.03, pz, Math.cos(ang) * tilt, 0, -Math.sin(ang) * tilt));
        }
        const foot = mesh(new THREE.SphereGeometry(0.32, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.snowCap || M.snow, x, 0, z);
        foot.scale.y = 0.22;
        g.add(foot);
      }
      boxes.push([x - 0.2, 0, z - 0.2, x + 0.2, 1.3, z + 0.2]);
    }
    return { obj: g, boxes };
  },

  // Rosetón de la capilla: vitral redondo con doce pétalos de colores, el
  // mate de oro en el medio y la piedra calada encima. Mira hacia +z; y0 es la
  // altura del centro sobre el piso.
  roseton(M, o) {
    const g = new THREE.Group();
    const R = o.r || 1.5;
    const y = o.y0 ?? 7;
    const st = M.castleStone || M.stone;
    const glass = new THREE.MeshBasicMaterial({ map: roseTex(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.15), toneMapped: false });
    g.add(mesh(new THREE.CircleGeometry(R, 48), glass, 0, y, 0.03));
    g.add(mesh(new THREE.TorusGeometry(R, 0.14, 8, 48), st, 0, y, 0.06));
    g.add(mesh(new THREE.TorusGeometry(R + 0.22, 0.09, 6, 48), st, 0, y, 0.04));
    g.add(mesh(new THREE.TorusGeometry(R * 0.32, 0.06, 6, 24), st, 0, y, 0.07));
    // la piedra calada: rayos del centro al borde
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const bar = mesh(new THREE.BoxGeometry(0.06, R * 0.68, 0.06), st, Math.sin(a) * R * 0.66, y + Math.cos(a) * R * 0.66, 0.07, 0, 0, -a);
      g.add(bar);
    }
    return { obj: g, boxes: [] };
  },

  // Alfombra de pasillo: colorada, con guarda pampa en los bordes largos y
  // flecos en las puntas. Va a lo largo de z (girarla con rot).
  alfombra(M, o) {
    const w = o.w || 1.5;
    const len = o.len || 5;
    const tex = carpetTex().clone();
    tex.needsUpdate = true;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, Math.max(1, Math.round(len / 2.5)));
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const g = new THREE.Group();
    g.add(mesh(new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2), mat, 0, 0.012, 0));
    // los flecos de las puntas
    const fr = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 1 });
    for (const s of [-1, 1]) {
      for (let k = 0; k < 14; k++) B(g, 0.02, 0.006, 0.14, fr, -w / 2 + 0.06 + (k * (w - 0.12)) / 13, 0.012, s * (len / 2 + 0.06));
    }
    return { obj: g, boxes: [] };
  },

  // Pendón colgado de una viga: el poncho de un caballero, de los dos lados.
  // top: a qué altura cuelga (sobre el piso); h: el largo.
  pendon(M, o) {
    const g = new THREE.Group();
    const w = o.w || 1.1;
    const h = o.h || 4.2;
    const top = o.top || 8;
    C(g, 0.03, 0.03, w + 0.3, goldMat(), 0, top, 0, 0, 0, Math.PI / 2, 8);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), goldMat(), s * (w / 2 + 0.15), top, 0));
    const cloth = hangingCloth(w, h, clothMat(`castleBanner_${o.kind}`, bannerTex(o.kind)), 2, 0.04);
    cloth.position.set(0, top - 0.02, 0);
    g.add(cloth);
    // las cuerdas hasta la viga
    for (const s of [-1, 1]) C(g, 0.008, 0.008, 0.5, M.rope, s * w * 0.4, top + 0.25, 0, 0, 0, s * 0.2, 4);
    return { obj: g, boxes: [] };
  },

  // Leña apilada contra una pared, con nieve arriba.
  lena(M, o) {
    const g = new THREE.Group();
    const len = o.len || 1.6;
    const log = M.log || M.wood;
    let k = 0;
    for (const [row, n] of [[0, 5], [1, 4], [2, 3]]) {
      for (let i = 0; i < n; i++) {
        const x = 0;
        const y = 0.12 + row * 0.21;
        const z = (i - (n - 1) / 2) * 0.24;
        const m = mesh(cylGeo(0.12, 0.12, len, 9), log, x, y, z, 0, 0, Math.PI / 2);
        m.rotation.x = (k++ % 3) * 0.7;
        g.add(m);
      }
    }
    const snow = mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.snowCap || M.clothWhite, 0, 0.52, 0);
    snow.scale.set(len * 0.95, 0.22, 0.75);
    g.add(snow);
    g.rotation.y = Math.PI / 2;
    const wrap = new THREE.Group();
    wrap.add(g);
    return { obj: wrap, boxes: [[-len / 2 - 0.05, 0, -0.5, len / 2 + 0.05, 0.7, 0.5]] };
  },

  // Trineo de madera con los patines curvos y un poco de nieve.
  trineo(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    for (const s of [-1, 1]) {
      const runner = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 10, Math.PI * 0.6), M.iron);
      runner.position.set(s * 0.32, 0.22, 0.72);
      runner.rotation.set(0, Math.PI / 2, Math.PI * 1.2);
      g.add(runner);
      B(g, 0.05, 0.05, 1.5, M.iron, s * 0.32, 0.03, -0.05);
      for (const z of [-0.6, 0, 0.5]) B(g, 0.05, 0.28, 0.05, wood, s * 0.32, 0.17, z);
    }
    for (let k = 0; k < 6; k++) B(g, 0.8, 0.04, 0.14, wood, 0, 0.32, -0.65 + k * 0.24);
    B(g, 0.75, 0.05, 0.5, M.snowCap || M.clothWhite, 0, 0.36, -0.2);
    return { obj: g, boxes: [[-0.45, 0, -0.85, 0.45, 0.45, 0.95]] };
  },

  // Muñeco de nieve gaucho: sombrero, poncho colorado, un mate en la mano.
  munecoNieve(M) {
    const g = new THREE.Group();
    const snow = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.85 });
    const coal = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.7 });
    g.add(mesh(new THREE.SphereGeometry(0.6, 18, 14), snow, 0, 0.52, 0));
    g.add(mesh(new THREE.SphereGeometry(0.44, 18, 14), snow, 0, 1.28, 0));
    g.add(mesh(new THREE.SphereGeometry(0.3, 16, 12), snow, 0, 1.86, 0));
    // el poncho: una capa con la guarda
    const poncho = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.58, 0.55, 18, 1, true), clothMat('castleBanner_fuego', bannerTex('fuego')));
    poncho.position.y = 1.36;
    g.add(poncho);
    // el sombrero
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), coal, 0, 2.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.2, 16), coal, 0, 2.21, 0));
    // la cara: ojos de carbón, nariz de zanahoria y una sonrisa de piedritas
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), coal, s * 0.1, 1.94, 0.26));
    g.add(mesh(new THREE.ConeGeometry(0.04, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0xe06a14, roughness: 0.6 }), 0, 1.86, 0.4, Math.PI / 2, 0, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 4 - 0.5) * 1.1;
      g.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), coal, Math.sin(a) * 0.13, 1.76 - Math.cos(a) * 0.03 + 0.03, 0.25));
    }
    // los brazos de rama: el izquierdo cuelga y el derecho levanta el mate
    // (la punta de la rama queda en x 1.07, y 1.65: ahí mismo va el mate,
    // apoyado en dos ramitas como dedos; antes el brazo bajaba y el mate
    // quedaba flotando)
    C(g, 0.02, 0.03, 0.8, M.woodDark || M.wood, -0.72, 1.45, 0, 0, 0, -1.05, 5);
    C(g, 0.02, 0.03, 0.8, M.woodDark || M.wood, 0.72, 1.45, 0, 0, 0, -1.05, 5);
    for (const a of [-0.5, 0.6]) C(g, 0.008, 0.012, 0.16, M.woodDark || M.wood, 1.1, 1.67, 0.04, a, 0, -0.4, 4);
    const mate = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.6 }), 1.1, 1.75, 0.04);
    mate.scale.set(1, 1.2, 1);
    g.add(mate);
    C(g, 0.008, 0.008, 0.22, M.silver || M.iron, 1.12, 1.9, 0.04, 0, 0, -0.3, 5);
    return { obj: g, boxes: [[-0.6, 0, -0.6, 0.6, 2.2, 0.6]] };
  },

  // El erke del temple: la caña larga con el pabellón de guampa, apuntando al
  // cielo desde un trípode de palos atados. Soplándolo arranca el encierro del
  // temple (Altares.js). La boquilla mira hacia +z.
  erke(M, o) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const K = KNIGHTS[o.kind] || KNIGHTS.fuego;
    const mouth = new THREE.Vector3(0, 1.3, 0.34);
    const top = new THREE.Vector3(0, 3.05, -0.72);
    const dir = new THREE.Vector3().subVectors(top, mouth);
    const len = dir.length();
    dir.normalize();
    const along = (t) => new THREE.Vector3().copy(mouth).addScaledVector(dir, len * t);
    // el trípode, atado justo abajo de la boquilla
    const joint = along(0.1);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      pole(g, new THREE.Vector3(Math.sin(a) * 0.42, 0, 0.12 + Math.cos(a) * 0.42), joint, 0.024, wood);
    }
    g.add(mesh(new THREE.TorusGeometry(0.045, 0.018, 5, 10), M.rope, joint.x, joint.y, joint.z, Math.PI / 2 - 0.55, 0, 0));
    // la caña con fajas de lana del caballero
    pole(g, mouth, top, 0.026, wool(0x9a8456), 8);
    const band = wool(K.light);
    for (let k = 0; k < 5; k++) pole(g, along(0.22 + k * 0.14), along(0.25 + k * 0.14), 0.034, band, 8);
    // el pabellón de guampa en la punta
    const horn = mesh(new THREE.LatheGeometry([[0.028, 0], [0.034, 0.12], [0.056, 0.26], [0.1, 0.36], [0.17, 0.42], [0.18, 0.44]].map(([r, y]) => new THREE.Vector2(r, y)), 14), hornMat(), top.x, top.y, top.z);
    horn.quaternion.setFromUnitVectors(UP, dir);
    g.add(horn);
    // la boquilla de bronce
    pole(g, along(-0.03), mouth, 0.03, M.brass, 8);
    return { obj: g, boxes: [[-0.42, 0, -0.35, 0.42, 1.35, 0.55]] };
  },
};

// La placa de la lápida de un caballero: el símbolo (que brilla apenas) y el
// nombre tallado abajo.
const PLATES = new Map();
export function tombPlate(kind) {
  if (!PLATES.has(kind)) {
    const K = KNIGHTS[kind] || KNIGHTS.fuego;
    const tex = canvasTex(`castleTomb_${kind}`, 256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      glyph(ctx, K.glyph, w / 2, h * 0.36, 120, K.light);
      ctx.fillStyle = 'rgba(30,26,22,0.85)';
      ctx.font = 'bold 20px Georgia, serif';
      ctx.textAlign = 'center';
      const words = K.name.replace('EL CABALLERO ', '').split(' ');
      ctx.fillText('EL CABALLERO', w / 2, h * 0.76);
      ctx.fillText(words.join(' '), w / 2, h * 0.86);
    });
    PLATES.set(kind, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, emissive: new THREE.Color(K.light), emissiveMap: tex, emissiveIntensity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  }
  return PLATES.get(kind);
}

// El vitral redondo: pétalos de vidrios de colores, las líneas de plomo y el
// mate de oro en el medio, sobre azul.
let ROSE = null;
function roseTex() {
  if (ROSE) return ROSE;
  ROSE = canvasTex('castleRose', 256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#8e1d16', '#1d5a34', '#c8a020', '#183e74', '#6a1a6a', '#d8c060'];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // los pétalos, cada uno de teselas
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2;
      const a1 = ((k + 1) / 12) * Math.PI * 2;
      for (let rr = 44; rr < 124; rr += 16) {
        for (let s = 0; s < 3; s++) {
          const b0 = a0 + ((a1 - a0) * s) / 3;
          const b1 = a0 + ((a1 - a0) * (s + 1)) / 3;
          ctx.fillStyle = cols[(k + Math.floor(rnd() * 3)) % cols.length];
          ctx.globalAlpha = 0.65 + rnd() * 0.35;
          ctx.beginPath();
          ctx.arc(cx, cy, rr + 14, b0, b1);
          ctx.arc(cx, cy, rr + 1, b1, b0, true);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    // el medallón: azul con el mate de oro
    ctx.fillStyle = '#1a3a7a';
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b840';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 16, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 9, cy - 16, 18, 6);
    ctx.strokeStyle = '#e8e0d0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 8);
    ctx.lineTo(cx + 14, cy - 30);
    ctx.stroke();
    // el plomo
    ctx.strokeStyle = '#0a0808';
    ctx.lineWidth = 3;
    for (let rr = 44; rr <= 124; rr += 16) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  return ROSE;
}

// La alfombra de pasillo: lana colorada, guarda pampa a los costados y
// rombos en el medio.
let CARPET = null;
function carpetTex() {
  if (CARPET) return CARPET;
  CARPET = canvasTex('castleCarpet', 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a100c';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,200,160,0.05)';
      ctx.fillRect(0, y, w, 1);
    }
    ctx.save();
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
    guarda(ctx, 0, 0, h, 18, '#0e0b0a', '#e8e0cc', '#c8281a');
    ctx.restore();
    ctx.save();
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    guarda(ctx, 0, 0, h, 18, '#0e0b0a', '#e8e0cc', '#c8281a');
    ctx.restore();
    for (let y = 32; y < h; y += 64) {
      ctx.fillStyle = '#c89a3a';
      ctx.beginPath();
      ctx.moveTo(w / 2, y - 22);
      ctx.lineTo(w / 2 + 22, y);
      ctx.lineTo(w / 2, y + 22);
      ctx.lineTo(w / 2 - 22, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a100c';
      ctx.fillRect(w / 2 - 6, y - 6, 12, 12);
    }
  });
  return CARPET;
}

// El símbolo del caballero para las caras del altar (una por elemento; el
// altar le cambia el brillo según el mate esté o no).
const GLYPHS = new Map();
export function altarGlyph(kind) {
  if (!GLYPHS.has(kind)) {
    const K = KNIGHTS[kind] || KNIGHTS.fuego;
    const tex = canvasTex(`castleAltarGlyph_${kind}`, 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = K.light;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      glyph(ctx, K.glyph, w / 2, h / 2, w * 0.66, K.light);
    });
    GLYPHS.set(kind, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.35, 0.35, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  }
  return GLYPHS.get(kind);
}

let SPIKE = null;
function iceSpike() {
  // facetado (cada cara agarra la luz distinto), azul por dentro
  if (!SPIKE) SPIKE = new THREE.MeshStandardMaterial({ color: 0x86c2e4, roughness: 0.06, metalness: 0.25, emissive: 0x123e62, emissiveIntensity: 0.6, flatShading: true });
  return SPIKE;
}
// Un cristal de hielo: prisma de seis caras apenas más ancho arriba de la
// base y la punta; `turn` lo gira sobre su eje para que no queden iguales.
function crystalGeo(r, h, turn = 0) {
  const pts = [[0, 0], [r * 0.86, 0], [r, h * 0.1], [r * 0.94, h * 0.72], [r * 0.3, h * 0.93], [0, h]].map(([u, v]) => new THREE.Vector2(u, v));
  return new THREE.LatheGeometry(pts, 6).rotateY(turn);
}
let HORN = null;
function hornMat() {
  if (!HORN) HORN = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.45, side: THREE.DoubleSide });
  return HORN;
}
const WOOL = new Map();
function wool(color) {
  if (!WOOL.has(color)) WOOL.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  return WOOL.get(color);
}
