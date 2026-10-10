// (primero: este módulo lee globalThis.__mduEclipse al cargarse, y en el
// paquete publicado el orden de carga lo da quién importa a quién. Sin esta
// línea la marca se ponía después y Eclipse no aparecía)
import '../core/eclipseFlag';
import * as THREE from 'three';
import { PERKS } from '../config/perks';
import { VM } from './viewmodels';
import { drawPerkIcon } from '../ui/perkIcons';

// Los mates de los perks: el que aparece en la mano cuando se toma uno. Cada
// perk tiene el suyo, con la pinta de su paquete de yerba (config/perks, label)
// y lo que hace el perk: el acorazado del Taragüerno, el de loza con la cruz
// del Rosamorte, el cohete de aluminio del Rapidito, el de la cartuchera y dos
// bombillas del Doble Cruz, el barrilito con herradura y un mate de más del
// Mulanda, el de plástico berreta con cinta y pajita del Nadarias (que no hace
// nada), la bomba de la Flopa, el de escamas y colmillos del Baldragón y el
// marinero del Nadadito. Se ve de muy cerca y todo el tiempo: calabaza con pared
// de adentro, virola cerrada (la vieja no tenía cara de adentro y parecía una
// arandela flotando), yerba, bombilla y la faja con la marca.
// Weapons.prebuild los arma una vez por partida (así compila sus shaders
// en la carga) y Weapons.drink pone el del perk en la mano.

// ---------------- piezas ----------------
const TAU = Math.PI * 2;
// Los dedos de la mano (VM.cupHand) abrazan el mate del lado de -z (ángulo π
// en onSurface): ahí abajo no va nada que sobresalga, así no lo atraviesan.
const FINGERS = (a, y) => y < 0.056 && Math.abs(((((a - Math.PI) % TAU) + TAU + Math.PI) % TAU) - Math.PI) < 0.95;
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0, ...o });

// Los lienzos se pintan una sola vez (las texturas y los materiales se arman
// en cada partida, que tiene los suyos).
const canvases = new Map();
function canvasOf(key, w, h, paint) {
  let c = canvases.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    canvases.set(key, c);
  }
  return c;
}
function texOf(key, w, h, paint, { srgb = true, rx = 1, ry = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvasOf(key, w, h, paint));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

// Azar con semilla (cada mate sale igual siempre).
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// El perfil del cuerpo: una curva suave por los puntos de control, en tramos
// parejos (así las texturas no se estiran donde el perfil tenía pocos puntos).
function profile(ctrl, n = 30) {
  const pts = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n);
  pts[0].set(0, ctrl[0][1]);
  return pts.map((p) => [Math.max(0, p.x), p.y]);
}

// Cuerpo con pared de adentro (del borde hasta abajo de la yerba): sin ella, al
// mirar la boca se ve a través del costado de atrás.
function body(pts, mat, seg = 40) {
  const m = VM.lathe(pts, mat, seg);
  const [r, y] = pts[pts.length - 1];
  m.add(VM.lathe([[r, y], [r - 0.0025, y], [r - 0.0025, y - 0.03]], mat, seg));
  return m;
}

// La virola: un anillo cerrado (cara de afuera, labio, cara de adentro).
function virola(top, mat, h = 0.012, lip = 0.004) {
  return VM.lathe(
    [
      [top.r - 0.001, top.y - h],
      [top.r + lip - 0.001, top.y - h],
      [top.r + lip, top.y - h / 2],
      [top.r + lip - 0.001, top.y + 0.002],
      [top.r - 0.001, top.y + 0.002],
      [top.r - 0.001, top.y - h],
    ],
    mat,
    40,
  );
}

// Una faja que sigue la panza (de y0 a y1), apenas despegada.
function band(rAt, y0, y1, mat, off = 0.0007, seg = 64) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = y0 + ((y1 - y0) * i) / 10;
    pts.push([rAt(y) + off, y]);
  }
  return VM.lathe(pts, mat, seg);
}

// Una tira vertical sobre el cuerpo (de a0 a a0 + da), de y0 a y1.
function strip(rAt, a0, da, y0, y1, mat, off = 0.0006, seg = 6) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = y0 + ((y1 - y0) * i) / 16;
    pts.push(new THREE.Vector2(rAt(y) + off, y));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, seg, a0, da), mat);
}

// Algo pegado a la panza: a la altura y y en el ángulo a (0 = +z), con su +z
// para afuera y acostado según la pendiente del perfil.
function onSurface(obj, rAt, a, y, lift = 0) {
  const r = rAt(y) + lift;
  const slope = (rAt(y + 0.002) - rAt(y - 0.002)) / 0.004;
  obj.rotation.order = 'YXZ';
  obj.rotation.y = a;
  obj.rotation.x = Math.atan(slope);
  obj.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
  return obj;
}

const flat = (shape, depth, mat, bevel = 0) => {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  return new THREE.Mesh(geo, mat);
};

function heartShape(s) {
  const h = new THREE.Shape();
  h.moveTo(0, -s * 0.95);
  h.bezierCurveTo(s * 0.25, -s * 0.62, s, -s * 0.22, s, s * 0.3);
  h.bezierCurveTo(s, s * 0.82, s * 0.42, s * 1.02, 0, s * 0.56);
  h.bezierCurveTo(-s * 0.42, s * 1.02, -s, s * 0.82, -s, s * 0.3);
  h.bezierCurveTo(-s, -s * 0.22, -s * 0.25, -s * 0.62, 0, -s * 0.95);
  return h;
}

function starShape(s, n = 5, inner = 0.45) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? s * inner : s;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return sh;
}

// Cruz griega (la de la ambulancia).
function crossShape(s, w = 0.34) {
  const a = s * w;
  const sh = new THREE.Shape();
  sh.moveTo(-a, s);
  for (const [x, y] of [[a, s], [a, a], [s, a], [s, -a], [a, -a], [a, -s], [-a, -s], [-a, -a], [-s, -a], [-s, a], [-a, a]]) sh.lineTo(x, y);
  return sh;
}

// Cruz de brazos abiertos (✠, la del Doble Cruz).
function patteeShape(s) {
  const sh = new THREE.Shape();
  const n = s * 0.16;
  const w = s * 0.5;
  sh.moveTo(-n, n);
  const arm = (ax, ay) => {
    // de la esquina del centro, abre hasta la punta y vuelve
    const px = -ay;
    const py = ax;
    sh.lineTo(ax * s + px * w, ay * s + py * w);
    sh.quadraticCurveTo(ax * s * 0.86, ay * s * 0.86, ax * s - px * w, ay * s - py * w);
    sh.lineTo(ax * n - px * n, ay * n - py * n);
  };
  sh.moveTo(n, n);
  arm(0, 1);
  arm(-1, 0);
  arm(0, -1);
  arm(1, 0);
  return sh;
}

// ---------------- arriba de la yerba ----------------
// En el sorbo el mate se ve desde arriba: la boca y la yerba es lo que más se
// mira. Cada uno le pone lo suyo (la altura de la lomita: VM.yerba).
const yerbaY = (top) => top.y - 0.003;

// Palitos de la yerba con palo, tirados arriba.
function sticks(g, top, n, seed) {
  const r = rng(seed);
  const mat = std({ color: 0x8c7448, roughness: 0.9 });
  for (let k = 0; k < n; k++) {
    const len = 0.008 + r() * 0.01;
    const s = VM.cyl(0.0009, 0.0009, len, mat, 5);
    const a = r() * TAU;
    const d = r() * top.r * 0.55;
    s.position.set(Math.sin(a) * d, yerbaY(top) + 0.0006, Math.cos(a) * d);
    s.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.3, r() * TAU, 0, 'YXZ');
    g.add(s);
  }
}

// Brasitas o chispas sobre la yerba (brillan solas).
function sparks(g, top, n, color, seed, size = 0.0009) {
  const r = rng(seed);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false });
  const geo = new THREE.SphereGeometry(size, 6, 4);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(geo, mat);
    const a = r() * TAU;
    const d = Math.sqrt(r()) * top.r * 0.8;
    m.position.set(Math.sin(a) * d, yerbaY(top) + 0.0004 + r() * 0.001, Math.cos(a) * d);
    m.scale.setScalar(0.6 + r() * 0.8);
    g.add(m);
  }
}

// La espumita contra el borde (la del mate bien cebado).
function foam(g, top) {
  const f = VM.tor(top.r * 0.8, 0.0022, std({ color: 0xd8d8a8, roughness: 0.95 }), 6, 32);
  f.rotation.x = Math.PI / 2;
  f.scale.z = 0.5;
  f.position.y = yerbaY(top) - 0.001;
  g.add(f);
}

// ---------------- lienzos ----------------
// La faja de la marca: la marca y el glifo repetidos alrededor, con filetes.
function paintBand(L, perk, { bg = L.band, ink = L.bandText, rule = L.accent, brand = L.brand, font = 'italic bold', reps = 3, deco = null } = {}) {
  return (ctx, W, H) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rule;
    ctx.fillRect(0, 6, W, 7);
    ctx.fillRect(0, H - 13, W, 7);
    const seg = W / reps;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < reps; k++) {
      const cx = seg * (k + 0.5);
      ctx.fillStyle = ink;
      let size = 64;
      ctx.font = `${font} ${size}px Georgia, serif`;
      while (ctx.measureText(brand).width > seg * 0.66 && size > 30) {
        size -= 2;
        ctx.font = `${font} ${size}px Georgia, serif`;
      }
      ctx.fillText(brand, cx, H * 0.53);
      // entre marca y marca, el medallón del perk (el mismo del HUD)
      drawPerkIcon(ctx, perk, cx + seg / 2, H * 0.52, Math.min(30, H * 0.3));
      deco?.(ctx, cx, seg, H);
    }
  };
}

// Grano de pintura/desgaste encima de lo pintado.
function grain(ctx, W, H, r, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
}

// ---------------- cada mate ----------------
// Todos devuelven { g, rAt, top } y lo de arriba (virola, bombilla) que cambia.

// Taragüerno (Juggernog): el acorazado. Cuero rojo cosido en gajos, remaches de
// bronce, la faja crema y el corazón de oro en el escudo.
function jugg(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.026, 0.002], [0.042, 0.014], [0.05, 0.034], [0.049, 0.058], [0.043, 0.076], [0.035, 0.088], [0.031, 0.095], [0.032, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.032, y: 0.101 };
  const leather = (bump) => (ctx, W, H) => {
    const r = rng(11);
    ctx.fillStyle = bump ? '#808080' : '#7c1119';
    ctx.fillRect(0, 0, W, H);
    // el grano del cuero
    for (let i = 0; i < 5000; i++) {
      const v = r();
      ctx.fillStyle = bump ? `rgba(${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},0.12)` : `rgba(${v < 0.5 ? 30 : 160},${v < 0.5 ? 0 : 40},${v < 0.5 ? 4 : 40},0.18)`;
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, 0.6 + r() * 1.6, 0, TAU);
      ctx.fill();
    }
    // ocho gajos: la costura hundida y las puntadas claras cruzadas
    for (let k = 0; k < 8; k++) {
      const x = (k / 8) * W;
      ctx.fillStyle = bump ? '#303030' : '#3a060a';
      ctx.fillRect(x - 2, 0, 4, H);
      ctx.strokeStyle = bump ? '#e0e0e0' : '#e8d4b0';
      ctx.lineWidth = 2;
      for (let y = 4; y < H; y += 12) {
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y + 6);
        ctx.stroke();
      }
      // el cuero se oscurece contra la costura
      if (!bump) {
        const gr = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, 'rgba(20,0,0,0.35)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - 18, 0, 36, H);
      }
    }
  };
  const mat = std({ map: texOf('jugg-cuero', 512, 256, leather(false)), bumpMap: texOf('jugg-cuero-b', 512, 256, leather(true), { srgb: false }), bumpScale: 1.4, roughness: 0.62 });
  g.add(body(pts, mat));
  const brass = std({ color: 0xd8a441, metalness: 1, roughness: 0.3 });
  // faja crema con la marca en rojo y corazones de oro
  const bandTex = texOf('jugg-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.accent }));
  g.add(band(rAt, 0.04, 0.066, std({ map: bandTex, roughness: 0.55 }), 0.0009));
  for (const y of [0.04, 0.066]) {
    const t = VM.tor(rAt(y) + 0.0012, 0.0011, brass, 6, 64);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    g.add(t);
  }
  // dos filas de remaches
  const stud = new THREE.SphereGeometry(0.0021, 8, 6);
  for (const [y, n, a0] of [[0.02, 16, 0], [0.081, 14, 0.2]]) {
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU;
      if (FINGERS(a, y)) continue;
      const s = new THREE.Mesh(stud, brass);
      onSurface(s, rAt, a, y, 0.0004);
      g.add(s);
    }
  }
  // el escudo con el corazón (de los dos lados)
  const heart = heartShape(0.0052);
  const red = std({ color: 0xc8121c, roughness: 0.35, metalness: 0.2 });
  for (const a of [0.35, 0.35 + Math.PI]) {
    const shield = new THREE.Group();
    const disc = VM.cyl(0.0095, 0.0095, 0.0018, brass, 24);
    disc.rotation.x = Math.PI / 2;
    shield.add(disc);
    const rim = VM.tor(0.0095, 0.0008, brass, 6, 24);
    rim.position.z = 0.0009;
    shield.add(rim);
    const h = flat(heart, 0.0012, red, 0.0003);
    h.position.z = 0.0009;
    shield.add(h);
    onSurface(shield, rAt, a, 0.053, 0.0022);
    g.add(shield);
  }
  // el pie de bronce
  const foot = VM.tor(0.026, 0.0022, brass, 8, 40);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.003;
  g.add(foot);
  return { g, rAt, top, vir: [brass, 0.015, 0.0045], bomb: { mat: brass, thick: 1.15 }, extra: (gg) => gg.add(ringAt(top, 0.0072, brass)), topping: (gg) => sticks(gg, top, 7, 5) };
}

// Un cordón de bronce justo abajo del labio de la virola.
function ringAt(top, h, mat) {
  const t = VM.tor(top.r + 0.0042, 0.0009, mat, 6, 40);
  t.rotation.x = Math.PI / 2;
  t.position.y = top.y - h;
  return t;
}

// Rosamorte (Quick Revive): mate de loza blanca, pintado a mano: la cruz roja
// de la ambulancia, el filete celeste, la faja amarilla con el pulso del
// monitor y una curita pegada.
function revive(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.046, 0.034], [0.046, 0.056], [0.041, 0.074], [0.033, 0.087], [0.029, 0.094], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const loza = (ctx, W, H) => {
    const r = rng(23);
    ctx.fillStyle = '#f7f4ec';
    ctx.fillRect(0, 0, W, H);
    // craquelado finito del esmalte
    ctx.strokeStyle = 'rgba(120,110,90,0.18)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 60; i++) {
      let x = r() * W;
      let y = r() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // filete celeste de abajo, pintado a pincel
    ctx.fillStyle = perk.color;
    ctx.fillRect(0, H * 0.9, W, H * 0.03);
  };
  const mat = phys({ map: texOf('revive-loza', 512, 256, loza), color: 0xe8e2d6, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  g.add(body(pts, mat));
  const ecg = (ctx, cx, seg, H) => {
    // el pulso del monitor entre marca y marca
    ctx.strokeStyle = L.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const x0 = cx + seg * 0.36;
    const y = H * 0.55;
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 14, y);
    ctx.lineTo(x0 + 20, y - 26);
    ctx.lineTo(x0 + 28, y + 22);
    ctx.lineTo(x0 + 34, y);
    ctx.lineTo(x0 + 48, y);
    ctx.stroke();
  };
  const bandTex = texOf('revive-faja', 1024, 128, paintBand(L, perk, { bg: L.bg, ink: L.brandColor, rule: L.band, deco: ecg }));
  g.add(band(rAt, 0.03, 0.054, std({ map: bandTex, roughness: 0.4 }), 0.0006));
  // la cruz roja (tres, alrededor) con su borde blanco
  const cross = crossShape(0.0068);
  const crossOut = crossShape(0.0082);
  const red = phys({ color: 0xd11f26, roughness: 0.2, clearcoat: 1 });
  const white = phys({ color: 0xffffff, roughness: 0.2, clearcoat: 1 });
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Group();
    c.add(flat(crossOut, 0.0005, white));
    const inner = flat(cross, 0.0008, red, 0.0002);
    inner.position.z = 0.0004;
    c.add(inner);
    onSurface(c, rAt, (k / 3) * TAU + 0.5, 0.071, 0.0003);
    g.add(c);
  }
  // filete celeste bajo la virola
  const blue = phys({ color: perk.color, roughness: 0.25, clearcoat: 1 });
  const line = VM.tor(rAt(0.086) + 0.0003, 0.0008, blue, 6, 48);
  line.rotation.x = Math.PI / 2;
  line.position.y = 0.086;
  g.add(line);
  // la curita, cruzada sobre la panza de abajo
  const aid = new THREE.Group();
  const tape = texOf('revive-curita', 128, 48, (ctx, W, H) => {
    ctx.fillStyle = '#e8c49a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(150,100,60,0.35)';
    for (let x = 6; x < W; x += 9) for (let y = 6; y < H; y += 9) if (x < 40 || x > 88) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#f4e6d6';
    ctx.fillRect(44, 8, 40, H - 16);
  });
  const aidMat = std({ map: tape, roughness: 0.8 });
  aid.add(VM.box(0.024, 0.008, 0.0006, aidMat));
  onSurface(aid, rAt, 1.95, 0.02, 0.0004);
  aid.rotation.z = 0.5;
  g.add(aid);
  return { g, rAt, top, vir: [M.silver, 0.011, 0.0038], topping: (gg) => foam(gg, top) };
}

// Rapidito (Speed Cola): el cohete. Aluminio cepillado, alto y finito, franjas
// de carrera azul y roja, aletas verdes abajo y la faja con las flechas.
function speed(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.02, 0.002], [0.032, 0.01], [0.039, 0.028], [0.04, 0.05], [0.037, 0.072], [0.031, 0.091], [0.027, 0.103], [0.029, 0.109]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.029, y: 0.109 };
  const brushed = (ctx, W, H) => {
    const r = rng(37);
    ctx.fillStyle = '#b8bec4';
    ctx.fillRect(0, 0, W, H);
    // el cepillado va alrededor (a lo largo de u)
    for (let i = 0; i < 900; i++) {
      const v = 150 + r() * 105;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
      ctx.fillRect(r() * W, r() * H, 20 + r() * 160, 1);
    }
  };
  const alu = std({ map: texOf('speed-alu', 256, 256, brushed), color: 0xe8ecf0, metalness: 1, roughness: 0.3 });
  g.add(body(pts, alu));
  // franjas de carrera, de abajo a la boca (azul con filete rojo), de los dos lados
  const blue = std({ color: L.band, roughness: 0.3, metalness: 0.3 });
  const red = std({ color: L.accent, roughness: 0.3, metalness: 0.3 });
  for (const a of [0, Math.PI]) {
    g.add(strip(rAt, a - 0.13, 0.26, 0.004, 0.092, blue, 0.0006));
    g.add(strip(rAt, a + 0.14, 0.05, 0.004, 0.092, red, 0.0006));
    g.add(strip(rAt, a - 0.19, 0.05, 0.004, 0.092, red, 0.0006));
  }
  const chevrons = (ctx, cx, seg, H) => {
    ctx.fillStyle = L.accent;
    for (let k = 0; k < 3; k++) {
      const x = cx - seg * 0.47 + k * 16;
      ctx.beginPath();
      ctx.moveTo(x, H * 0.3);
      ctx.lineTo(x + 12, H * 0.52);
      ctx.lineTo(x, H * 0.74);
      ctx.lineTo(x + 6, H * 0.74);
      ctx.lineTo(x + 18, H * 0.52);
      ctx.lineTo(x + 6, H * 0.3);
      ctx.fill();
    }
  };
  const bandTex = texOf('speed-faja', 1024, 128, paintBand(L, perk, { bg: L.bg, ink: L.brandColor, rule: L.band, deco: chevrons }));
  g.add(band(rAt, 0.046, 0.068, std({ map: bandTex, roughness: 0.35, metalness: 0.1 }), 0.0012));
  // tres aletas verdes (lejos de los dedos, que abrazan del otro lado)
  const green = std({ color: perk.color, metalness: 0.6, roughness: 0.3 });
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.017, -0.007);
  fin.quadraticCurveTo(0.013, 0.014, 0, 0.036);
  fin.lineTo(0, 0);
  for (const a of [0, 1.9, -1.9]) {
    const f = flat(fin, 0.0014, green, 0.0003);
    // la aleta sale para afuera: su plano es el del radio (x) y el alto (y)
    const holder = new THREE.Group();
    f.position.z = -0.0007;
    holder.add(f);
    const y = 0.012;
    holder.position.set(Math.sin(a) * rAt(y) * 0.92, y, Math.cos(a) * rAt(y) * 0.92);
    holder.rotation.y = a - Math.PI / 2;
    g.add(holder);
  }
  return { g, rAt, top, vir: [std({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 }), 0.012, 0.0035], bomb: { thick: 0.9 }, topping: (gg) => foam(gg, top) };
}

// Doble Cruz (Double Tap): verde laqueado, la cartuchera con balas de bronce
// alrededor de la panza, la faja con las cruces y dos bombillas.
function doubletap(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.046, 0.034], [0.046, 0.056], [0.041, 0.074], [0.033, 0.087], [0.03, 0.095], [0.032, 0.102]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.032, y: 0.102 };
  const mat = phys({ map: T.gourd, color: 0x2c7a48, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  g.add(body(pts, mat));
  // la cartuchera: correa de cuero con presillas y diez balas paradas
  const leather = std({ color: 0x5a3418, roughness: 0.7 });
  g.add(band(rAt, 0.017, 0.031, leather, 0.0012));
  const brass = std({ color: 0xd9a84a, metalness: 1, roughness: 0.28 });
  const copper = std({ color: 0xc0703a, metalness: 1, roughness: 0.3 });
  const caseGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.019, 12);
  const rimGeo = new THREE.CylinderGeometry(0.0036, 0.0036, 0.0014, 12);
  const tipGeo = new THREE.SphereGeometry(0.0032, 12, 8, 0, TAU, 0, Math.PI / 2).scale(1, 2, 1);
  const loopGeo = new THREE.BoxGeometry(0.009, 0.006, 0.0022);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.15;
    if (FINGERS(a, 0.027)) continue;
    const bullet = new THREE.Group();
    const c = new THREE.Mesh(caseGeo, brass);
    bullet.add(c);
    const rim = new THREE.Mesh(rimGeo, brass);
    rim.position.y = -0.0095;
    bullet.add(rim);
    const tip = new THREE.Mesh(tipGeo, copper);
    tip.position.y = 0.0095;
    bullet.add(tip);
    onSurface(bullet, rAt, a, 0.027, 0.0046);
    g.add(bullet);
    const loop = new THREE.Mesh(loopGeo, leather);
    onSurface(loop, rAt, a, 0.024, 0.0068);
    g.add(loop);
  }
  const crosses = (ctx, cx, seg, H) => {
    ctx.fillStyle = L.accent;
    ctx.font = 'bold 50px Georgia, serif';
    ctx.fillText('✠', cx - seg * 0.4, H * 0.54);
  };
  const bandTex = texOf('dt-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.accent, deco: crosses }));
  g.add(band(rAt, 0.047, 0.07, std({ map: bandTex, roughness: 0.5 }), 0.0008));
  // las dos cruces de bronce arriba de la faja
  const pattee = patteeShape(0.0062);
  for (const a of [0.9, 0.9 + Math.PI]) {
    const c = flat(pattee, 0.0012, std({ color: L.accent, roughness: 0.35, metalness: 0.4 }), 0.0003);
    onSurface(c, rAt, a, 0.079, 0.0004);
    g.add(c);
  }
  return { g, rAt, top, vir: [std({ color: perk.color, metalness: 1, roughness: 0.25 }), 0.012, 0.004], bomb: { count: 2, spread: 0.016, len: 0.185 } };
}

// Mulanda (Mule Kick): el barrilito de duelas con zunchos de hierro, la
// herradura clavada, la faja de cuero y, colgando, un mate más chiquito.
function mule(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.034, 0.0005], [0.037, 0.005], [0.042, 0.028], [0.044, 0.052], [0.042, 0.076], [0.037, 0.097], [0.035, 0.102]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.035, y: 0.102 };
  const staves = (ctx, W, H) => {
    const r = rng(51);
    const n = 14;
    for (let k = 0; k < n; k++) {
      const x0 = (k / n) * W;
      const w = W / n;
      const base = 120 + r() * 50;
      ctx.fillStyle = `rgb(${base},${base * 0.62},${base * 0.36})`;
      ctx.fillRect(x0, 0, w, H);
      // la veta de cada duela
      for (let i = 0; i < 26; i++) {
        const d = r() * 40;
        ctx.strokeStyle = `rgba(${60 + d},${34 + d * 0.5},${16},0.35)`;
        ctx.lineWidth = 1 + r() * 1.5;
        const xx = x0 + r() * w;
        ctx.beginPath();
        ctx.moveTo(xx, 0);
        ctx.bezierCurveTo(xx + (r() - 0.5) * 8, H * 0.3, xx + (r() - 0.5) * 8, H * 0.7, xx + (r() - 0.5) * 6, H);
        ctx.stroke();
      }
      // la junta entre duelas
      ctx.fillStyle = 'rgba(30,16,6,0.85)';
      ctx.fillRect(x0, 0, 2, H);
    }
  };
  const wood = std({ map: texOf('mule-duelas', 512, 256, staves), roughness: 0.7 });
  g.add(body(pts, wood));
  const iron = std({ color: 0x3a3632, metalness: 0.8, roughness: 0.45 });
  for (const y of [0.01, 0.092]) {
    g.add(band(rAt, y - 0.004, y + 0.004, iron, 0.0012, 48));
    // los remaches del zuncho
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 6, 4), iron);
      onSurface(s, rAt, (k / 10) * TAU, y, 0.0016);
      g.add(s);
    }
  }
  // la faja: cuero marrón con la marca en crema y una hojita verde
  const leaf = (ctx, cx, seg, H) => {
    ctx.fillStyle = L.accent;
    ctx.beginPath();
    ctx.ellipse(cx - seg * 0.4, H * 0.52, 16, 7, -0.5, 0, TAU);
    ctx.fill();
  };
  const bandTex = texOf('mule-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.accent, deco: leaf }));
  g.add(band(rAt, 0.041, 0.064, std({ map: bandTex, roughness: 0.75 }), 0.0014));
  // la herradura clavada (de los dos lados), con sus clavos
  for (const a of [0.4, 0.4 + Math.PI]) {
    const shoe = new THREE.Group();
    // abierta para arriba (la de la suerte): el arco centrado abajo
    const arc = VM.tor(0.0078, 0.0017, iron, 6, 20, Math.PI * 1.35);
    arc.rotation.z = -Math.PI / 2 - Math.PI * 0.675;
    shoe.add(arc);
    for (let k = 0; k < 6; k++) {
      const t = -Math.PI / 2 - Math.PI * 0.55 + (k / 5) * Math.PI * 1.1;
      const nail = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0012, 0.0012), std({ color: 0x9a9690, metalness: 1, roughness: 0.3 }));
      nail.position.set(Math.cos(t) * 0.0078, Math.sin(t) * 0.0078, 0.0015);
      shoe.add(nail);
    }
    onSurface(shoe, rAt, a, 0.078, 0.0018);
    g.add(shoe);
  }
  // el mate de más: chiquito, colgando de un tiento del lado de afuera
  const charm = new THREE.Group();
  const mini = profile([[0, 0], [0.006, 0.0005], [0.0095, 0.004], [0.011, 0.01], [0.0098, 0.016], [0.0075, 0.02], [0.0072, 0.022]], 16);
  charm.add(VM.lathe(mini, M.gourd, 16));
  const mv = VM.tor(0.0075, 0.0009, M.silver, 6, 16);
  mv.rotation.x = Math.PI / 2;
  mv.position.y = 0.0215;
  charm.add(mv);
  const straw = VM.cyl(0.0008, 0.0008, 0.018, M.silver, 6);
  straw.position.set(0.002, 0.029, 0);
  straw.rotation.z = -0.3;
  charm.add(straw);
  const cordMat = std({ color: 0x6b4a2a, roughness: 0.9 });
  const cord = VM.cyl(0.0007, 0.0007, 0.026, cordMat, 5);
  cord.position.y = 0.035;
  charm.add(cord);
  charm.position.set(-(rAt(0.07) + 0.012), 0.047, 0.004);
  charm.rotation.z = 0.12;
  g.add(charm);
  // el tiento sale del zuncho de arriba
  const tie = VM.tor(0.003, 0.0008, cordMat, 5, 12);
  tie.position.set(-(rAt(0.092) + 0.002), 0.093, 0.004);
  tie.rotation.y = Math.PI / 2;
  g.add(tie);
  return { g, rAt, top, vir: [iron, 0.011, 0.004], bomb: { mat: std({ color: 0xc9b98f, metalness: 1, roughness: 0.35 }) }, topping: (gg) => sticks(gg, top, 9, 17) };
}

// Nadarias (Deadshot Daiquiri, que no hace nada): mate de plástico berreta,
// amarillo chillón y medio chueco, la calcomanía pegada torcida con el sol, la
// cinta gris tapando una rajadura, la etiqueta del precio y de bombilla... una pajita.
function deadshot(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.028, 0.001], [0.034, 0.008], [0.039, 0.04], [0.039, 0.07], [0.036, 0.094], [0.036, 0.1]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.036, y: 0.1 };
  const plastic = phys({ color: L.bg, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const b = body(pts, plastic, 28);
  b.scale.set(1.04, 1, 0.97);
  g.add(b);
  // la costura del molde, de arriba abajo
  g.add(strip(rAt, Math.PI / 2 - 0.012, 0.024, 0.002, 0.099, plastic, 0.0005));
  // la calcomanía: azul con la marca en blanco y el sol rojo, pegada torcida
  const sun = (ctx, cx, seg, H) => {
    const x = cx - seg * 0.38;
    const y = H * 0.52;
    ctx.fillStyle = L.accent;
    for (let k = 0; k < 16; k++) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((k / 16) * TAU);
      ctx.fillRect(12, -2, 12, 4);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, TAU);
    ctx.fill();
  };
  const sticker = texOf('ds-calco', 1024, 128, paintBand(L, perk, { bg: L.band, ink: '#ffffff', rule: L.accent, reps: 2, deco: sun }));
  const cal = strip((y) => rAt(y) * 1.04, 0.3, TAU * 0.62, 0.042, 0.066, std({ map: sticker, roughness: 0.3 }), 0.0012, 40);
  cal.rotation.z = 0.07;
  g.add(cal);
  // la cinta gris sobre la rajadura (con la punta despegada)
  const tapeTex = texOf('ds-cinta', 256, 64, (ctx, W, H) => {
    const r = rng(71);
    ctx.fillStyle = '#9a9c9e';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(60,60,60,0.25)';
    for (let x = 0; x < W; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 4, H);
      ctx.stroke();
    }
    grain(ctx, W, H, r, 400, 0.25, true);
    // los bordes rotos
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < W; x += 6) {
      ctx.fillRect(x, 0, 3, 2 + r() * 3);
      ctx.fillRect(x, H - 2 - r() * 3, 3, 5);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  const tapeMat = std({ map: tapeTex, roughness: 0.55, metalness: 0.2, transparent: true, alphaTest: 0.5 });
  const tape = new THREE.Mesh(
    new THREE.LatheGeometry(
      Array.from({ length: 5 }, (_, i) => {
        const y = 0.016 + (0.01 * i) / 4;
        return new THREE.Vector2(rAt(y) * 1.04 + 0.0012, y);
      }),
      20,
      2.1,
      1.5,
    ),
    tapeMat,
  );
  tape.rotation.z = -0.1;
  g.add(tape);
  // la rajadura que asoma abajo de la cinta
  const crack = VM.box(0.0006, 0.012, 0.0006, std({ color: 0x6a5a10, roughness: 0.8 }));
  onSurface(crack, (y) => rAt(y) * 1.04, 2.75, 0.03, 0.0002);
  crack.rotation.z = 0.3;
  g.add(crack);
  // la etiqueta del precio, blanca con letras rojas
  const price = texOf('ds-precio', 128, 64, (ctx, W, H) => {
    ctx.fillStyle = '#fbfbf6';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d82320';
    ctx.font = 'bold 34px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${perk.cost}`, W / 2, H / 2 + 2);
  });
  const tag = VM.box(0.014, 0.007, 0.0004, std({ map: price, roughness: 0.6 }));
  onSurface(tag, (y) => rAt(y) * 1.04, 3.6, 0.082, 0.0008);
  tag.rotation.z = -0.15;
  g.add(tag);
  // la pajita: rayada roja y blanca
  const straw = texOf('ds-pajita', 64, 256, (ctx, W, H) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = L.accent;
    for (let y = -W; y < H + W; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + W * 0.6);
      ctx.lineTo(W, y + W * 0.6 + 10);
      ctx.lineTo(0, y + 10);
      ctx.fill();
    }
  });
  const strawMat = std({ map: straw, roughness: 0.35 });
  // ni yerba tiene: mate cocido de saquito, con el hilo y la etiqueta colgando
  const topping = (gg) => {
    const tea = new THREE.Mesh(new THREE.CircleGeometry(top.r * 0.95, 32).rotateX(-Math.PI / 2), phys({ color: 0x6a3c14, roughness: 0.05, clearcoat: 1 }));
    tea.position.y = top.y - 0.007;
    gg.add(tea);
    const bag = VM.box(0.016, 0.0022, 0.019, M.teabag || std({ color: 0xe8dcc0, roughness: 0.9 }));
    bag.position.set(-0.008, tea.position.y + 0.0008, -0.004);
    bag.rotation.set(0.12, 0.5, 0.05);
    gg.add(bag);
    const thread = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.012, tea.position.y + 0.002, -0.009), new THREE.Vector3(-0.024, top.y + 0.004, -0.02), new THREE.Vector3(-0.031, top.y + 0.001, -0.026), new THREE.Vector3(-0.036, top.y - 0.02, -0.03)]);
    gg.add(new THREE.Mesh(new THREE.TubeGeometry(thread, 16, 0.0003, 4), std({ color: 0xf0ece0, roughness: 1 })));
    const label = texOf('ds-etiqueta', 64, 64, (ctx, W, H) => {
      ctx.fillStyle = L.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = L.band;
      ctx.fillRect(0, H * 0.35, W, H * 0.3);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Nadarias', W / 2, H / 2 + 1);
    });
    const tagT = VM.box(0.011, 0.011, 0.0005, std({ map: label, roughness: 0.8 }));
    tagT.position.set(-0.0375, top.y - 0.026, -0.032);
    tagT.rotation.set(0.1, 0.75, 0.08);
    gg.add(tagT);
  };
  return { g, rAt, top, vir: [plastic, 0.008, 0.003], bomb: { mat: strawMat, thick: 1.5, bend: 0.25 }, noYerba: true, topping };
}

// Flopa Hermanos (PhD Flopper): la bomba. Redonda y negra violácea, laqueada,
// estrellas rosas, la faja dorada, el cuello con remaches y la mecha prendida.
function phd(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.048, 0.033], [0.049, 0.052], [0.044, 0.071], [0.034, 0.084], [0.027, 0.09], [0.027, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.027, y: 0.101 };
  const lacquer = phys({ color: 0x2b1442, roughness: 0.25, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  g.add(body(pts, lacquer));
  const gold = std({ color: L.band, metalness: 1, roughness: 0.28 });
  const stars = (ctx, cx, seg, H) => {
    ctx.fillStyle = L.accent;
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText('★', cx - seg * 0.42, H * 0.54);
  };
  const bandTex = texOf('phd-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.bandText, deco: stars }));
  g.add(band(rAt, 0.041, 0.063, std({ map: bandTex, roughness: 0.3, metalness: 0.5 }), 0.0008));
  // estrellas rosas sueltas por la panza
  const pink = std({ color: L.accent, roughness: 0.3, emissive: L.accent, emissiveIntensity: 0.25 });
  const star = starShape(0.0045);
  const r = rng(91);
  for (let k = 0; k < 7; k++) {
    const y = k % 2 ? 0.024 + r() * 0.01 : 0.071 + r() * 0.006;
    const s = flat(star, 0.0006, pink, 0.0002);
    onSurface(s, rAt, (k / 7) * TAU + r() * 0.4, y, 0.0003);
    s.rotation.z = r() * TAU;
    s.scale.setScalar(0.7 + r() * 0.5);
    g.add(s);
  }
  // el cuello de la bomba: collar dorado con remaches
  g.add(band(rAt, 0.085, 0.093, gold, 0.0015, 48));
  for (let k = 0; k < 12; k++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 6, 4), gold);
    onSurface(s, rAt, (k / 12) * TAU, 0.089, 0.0022);
    g.add(s);
  }
  // la mecha: sale del hombro, se enrosca y chispea en la punta
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.036, 0.074, -0.004), new THREE.Vector3(-0.047, 0.084, -0.006), new THREE.Vector3(-0.051, 0.097, 0.002), new THREE.Vector3(-0.045, 0.107, 0.008)]);
  const fuse = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0018, 6), std({ color: 0x8a7650, roughness: 0.9 }));
  g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(3), toneMapped: false }));
  spark.position.copy(curve.getPoint(1));
  g.add(spark);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.accent).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(spark.position);
  g.add(halo);
  return { g, rAt, top, vir: [gold, 0.01, 0.0035], bomb: { mat: gold }, topping: (gg) => sparks(gg, top, 16, L.accent, 7, 0.0007) };
}

// Baldragón (Aliento Dragónico): calabaza de escamas rojo oscuro con brasas
// entre escama y escama, colmillos de hueso alrededor de la boca, dos cuernos
// y la faja dorada con llamas.
function dragon(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.046, 0.034], [0.046, 0.056], [0.041, 0.074], [0.033, 0.087], [0.029, 0.094], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const scales = (glow) => (ctx, W, H) => {
    ctx.fillStyle = glow ? '#000' : '#1a0302';
    ctx.fillRect(0, 0, W, H);
    const r = rng(113);
    const cols = 24;
    const rows = 14;
    const sw = W / cols;
    const sh = H / rows;
    for (let j = rows; j >= -1; j--) {
      for (let i = -1; i <= cols; i++) {
        const x = (i + (j % 2) * 0.5) * sw;
        const y = j * sh;
        const v = r();
        if (glow) {
          // la brasa asoma por el borde de abajo de cada escama
          ctx.fillStyle = `rgba(255,${90 + v * 60},20,${0.35 + v * 0.4})`;
          ctx.beginPath();
          ctx.ellipse(x, y + sh * 0.95, sw * 0.5, sh * 0.35, 0, 0, Math.PI);
          ctx.fill();
          ctx.fillStyle = '#000';
        } else {
          const gr = ctx.createRadialGradient(x, y + sh * 0.2, 1, x, y + sh * 0.5, sw * 0.8);
          gr.addColorStop(0, `rgb(${150 + v * 50},${24 + v * 20},${12})`);
          gr.addColorStop(0.7, `rgb(${90 + v * 30},${10},${6})`);
          gr.addColorStop(1, '#2a0403');
          ctx.fillStyle = gr;
        }
        ctx.beginPath();
        ctx.moveTo(x - sw * 0.52, y);
        ctx.quadraticCurveTo(x - sw * 0.5, y + sh * 1.1, x, y + sh * 1.25);
        ctx.quadraticCurveTo(x + sw * 0.5, y + sh * 1.1, x + sw * 0.52, y);
        ctx.fill();
        if (!glow) {
          ctx.strokeStyle = 'rgba(255,140,90,0.25)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }
  };
  const mat = std({
    map: texOf('dr-escamas', 512, 256, scales(false)),
    bumpMap: texOf('dr-escamas', 512, 256, scales(false), { srgb: false }),
    bumpScale: 2,
    emissiveMap: texOf('dr-brasas', 512, 256, scales(true)),
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.3,
  });
  g.add(body(pts, mat));
  const gold = std({ color: 0xe8b640, metalness: 1, roughness: 0.25 });
  const flames = (ctx, cx, seg, H) => {
    const x = cx - seg * 0.42;
    const base = H * 0.8;
    for (const [dx, h, w] of [[-13, 34, 8], [13, 34, 8], [0, 54, 11]]) {
      const gr = ctx.createLinearGradient(0, base, 0, base - h);
      gr.addColorStop(0, '#b01a06');
      gr.addColorStop(0.55, L.accent);
      gr.addColorStop(1, '#ffd24a');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x + dx, base);
      ctx.bezierCurveTo(x + dx - w * 1.4, base - h * 0.2, x + dx - w * 0.3, base - h * 0.6, x + dx + w * 0.25, base - h);
      ctx.bezierCurveTo(x + dx + w * 0.3, base - h * 0.55, x + dx + w * 1.4, base - h * 0.25, x + dx, base);
      ctx.fill();
    }
  };
  const bandTex = texOf('dr-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.bandText, deco: flames }));
  g.add(band(rAt, 0.036, 0.058, std({ map: bandTex, roughness: 0.3, metalness: 0.6 }), 0.0012));
  // colmillos de hueso alrededor de la boca, alternando grandes y chicos
  const bone = std({ color: 0xeee2c4, roughness: 0.45 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const big = k % 2 === 0;
    const h = big ? 0.009 : 0.0055;
    const fang = VM.cyl(0, big ? 0.0022 : 0.0016, h, bone, 8);
    const rr = top.r + 0.0032;
    fang.position.set(Math.sin(a) * rr, top.y + h / 2 - 0.001, Math.cos(a) * rr);
    // apenas para afuera
    fang.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
    g.add(fang);
  }
  // dos cuernos curvos que salen de los hombros para atrás
  for (const s of [-1, 1]) {
    const pts3 = [new THREE.Vector3(s * 0.034, 0.078, 0), new THREE.Vector3(s * 0.05, 0.086, -0.006), new THREE.Vector3(s * 0.058, 0.1, -0.016), new THREE.Vector3(s * 0.055, 0.114, -0.028)];
    const curve = new THREE.CatmullRomCurve3(pts3);
    // un tubo que se afina: anillos cada vez más chicos
    for (let k = 0; k < 8; k++) {
      const u0 = k / 8;
      const u1 = (k + 1) / 8;
      const a = curve.getPoint(u0);
      const b = curve.getPoint(u1);
      const seg = VM.cyl(0.0048 * (1 - u1 * 0.85), 0.0048 * (1 - u0 * 0.85), a.distanceTo(b) * 1.05, k < 5 ? bone : std({ color: 0x3a2a20, roughness: 0.5 }), 10);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(seg);
    }
    // el anillo de oro en la base del cuerno
    const ring = VM.tor(0.0048, 0.0011, gold, 6, 16);
    const a = curve.getPoint(0.12);
    ring.position.copy(a);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(0.12));
    g.add(ring);
  }
  return { g, rAt, top, vir: [gold, 0.012, 0.004], bomb: { mat: gold }, topping: (gg) => sparks(gg, top, 22, 0xff6a18, 29) };
}

// Nadadito (Acuanauta): el marinero. Loza a rayas azul y blanca, mojada, con
// gotas, el cabo enroscado en el cuello y el ancla roja.
function aqua(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.046, 0.034], [0.046, 0.056], [0.041, 0.074], [0.033, 0.087], [0.029, 0.094], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const stripes = (ctx, W, H) => {
    ctx.fillStyle = '#f6f3ea';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = L.band;
    for (let k = 0; k < 9; k++) ctx.fillRect(0, (k / 9) * H, W, H / 18);
  };
  const mat = phys({ map: texOf('aq-rayas', 64, 256, stripes), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  g.add(body(pts, mat));
  const wave = (ctx, cx, seg, H) => {
    ctx.strokeStyle = L.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const x0 = cx - seg * 0.47;
    for (let k = 0; k <= 24; k++) ctx.lineTo(x0 + k * 2, H * 0.53 + Math.sin(k * 0.8) * 7);
    ctx.stroke();
  };
  const bandTex = texOf('aq-faja', 1024, 128, paintBand(L, perk, { bg: L.bg, ink: L.brandColor, rule: L.accent, deco: wave }));
  g.add(band(rAt, 0.036, 0.058, phys({ map: bandTex, roughness: 0.25, clearcoat: 1 }), 0.0009));
  // el ancla (de los dos lados)
  const red = phys({ color: L.accent, roughness: 0.3, clearcoat: 1 });
  for (const a of [0.6, 0.6 + Math.PI]) {
    const an = new THREE.Group();
    const ring = VM.tor(0.0022, 0.0007, red, 6, 14);
    ring.position.y = 0.0082;
    an.add(ring);
    an.add(VM.box(0.0014, 0.0135, 0.001, red));
    const stock = VM.box(0.0082, 0.0012, 0.001, red);
    stock.position.y = 0.0046;
    an.add(stock);
    const arms = VM.tor(0.0055, 0.0008, red, 6, 16, Math.PI);
    arms.rotation.z = Math.PI;
    arms.position.y = -0.0012;
    an.add(arms);
    for (const s of [-1, 1]) {
      const fluke = VM.cyl(0, 0.0014, 0.0032, red, 6);
      fluke.position.set(s * 0.0055, -0.0006, 0);
      fluke.rotation.z = s * 0.6;
      an.add(fluke);
    }
    onSurface(an, rAt, a, 0.073, 0.0012);
    g.add(an);
  }
  // el cabo enroscado en el cuello: tres vueltas de soga torcida
  const ropeTex = texOf('aq-soga', 256, 32, (ctx, W, H) => {
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(90,64,30,0.8)';
    ctx.lineWidth = 3;
    for (let x = -H; x < W + H; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
  });
  const rope = std({ map: ropeTex, roughness: 0.9 });
  rope.map.repeat.set(24, 1);
  const turns = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    const a = u * TAU * 2.6;
    const y = 0.079 + u * 0.009;
    const rr = rAt(y) + 0.0024;
    turns.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(turns), 180, 0.0019, 6), rope));
  // gotas de agua por toda la panza
  const drop = phys({ color: 0xeaf6ff, roughness: 0.02, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false });
  const dg = new THREE.SphereGeometry(0.0016, 10, 6, 0, TAU, 0, Math.PI / 2);
  const r = rng(131);
  for (let k = 0; k < 26; k++) {
    const d = new THREE.Mesh(dg, drop);
    const y = 0.008 + r() * 0.07;
    onSurface(d, rAt, r() * TAU, y, -0.0002);
    d.rotation.x += Math.PI / 2;
    d.scale.set(0.6 + r() * 0.8, 0.5, 0.7 + r() * 1.2);
    g.add(d);
  }
  // el agua arriba de la yerba (recién servida) con burbujitas
  const water = new THREE.Mesh(new THREE.CircleGeometry(top.r * 0.9, 32).rotateX(-Math.PI / 2), phys({ color: 0x9ccfe0, roughness: 0.02, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false }));
  water.position.y = yerbaY(top) + 0.0012;
  const bub = new THREE.SphereGeometry(0.0011, 8, 6);
  const bm = phys({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.6, clearcoat: 1, depthWrite: false });
  const topping = (gg) => {
    gg.add(water);
    const rr = rng(47);
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(bub, bm);
      const a = rr() * TAU;
      const d = top.r * (0.3 + rr() * 0.5);
      m.position.set(Math.sin(a) * d, water.position.y, Math.cos(a) * d);
      m.scale.setScalar(0.6 + rr());
      gg.add(m);
    }
  };
  return { g, rAt, top, vir: [M.silver, 0.012, 0.004], topping };
}

// Chisporé (Electric Cherry): el de loza rojo cereza, brillante, con la faja
// azul de los rayos, dos cerezas colgando del borde y chispas azules arriba.
function cherry(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.039, 0.014], [0.047, 0.036], [0.046, 0.058], [0.04, 0.076], [0.032, 0.088], [0.029, 0.095], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  g.add(body(pts, phys({ color: 0xb3142a, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 })));
  const bolt = (ctx, cx, seg, H) => {
    ctx.fillStyle = L.accent;
    ctx.beginPath();
    const x = cx - seg * 0.42;
    [[x + 10, 22], [x - 2, 66], [x + 8, 66], [x - 4, 108], [x + 20, 56], [x + 10, 56], [x + 20, 22]].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.fill();
  };
  const bandTex = texOf('ch-faja', 1024, 128, paintBand(L, perk, { bg: L.bg, ink: L.brandColor, rule: L.accent, deco: bolt }));
  g.add(band(rAt, 0.036, 0.058, phys({ map: bandTex, roughness: 0.25, clearcoat: 1 }), 0.0009));
  // las dos cerezas colgando del borde, del lado de afuera
  const red = phys({ color: 0xd8233a, roughness: 0.15, clearcoat: 1 });
  const stem = std({ color: 0x5f7f26, roughness: 0.6 });
  const ch = new THREE.Group();
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 14, 10), red);
    c.position.set(s * 0.0055, -0.016, 0.004);
    ch.add(c);
    const st = VM.cyl(0.0006, 0.0006, 0.018, stem, 6);
    st.position.set(s * 0.0028, -0.008, 0.002);
    st.rotation.z = s * 0.35;
    ch.add(st);
  }
  onSurface(ch, rAt, 0.4, 0.094, 0.002);
  g.add(ch);
  return { g, rAt, top, vir: [M.silver, 0.012, 0.004], topping: (gg) => sparks(gg, top, 18, 0x56c8ff, 71) };
}

// Dying Wish (Extremaunión): de loza negra laqueada como el ataúd de la
// máquina, la faja de luto con la marca en oro, el corazón rojo al frente y
// la aureola de oro que cuelga del borde; arriba, brasitas rojas que laten.
function wish(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.039, 0.013], [0.047, 0.035], [0.046, 0.058], [0.04, 0.076], [0.032, 0.088], [0.029, 0.095], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const gold = std({ color: 0xd4ac48, metalness: 1, roughness: 0.28 });
  g.add(body(pts, phys({ color: 0x141012, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 })));
  const bandTex = texOf('dw-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bg, rule: L.accent }));
  g.add(band(rAt, 0.028, 0.05, phys({ map: bandTex, roughness: 0.3, clearcoat: 1 }), 0.0009));
  // el corazón rojo arriba de la faja, al frente (lejos de los dedos)
  const heart = flat(heartShape(0.0075), 0.002, phys({ color: 0xd0142e, emissive: 0x4a000c, roughness: 0.2, clearcoat: 1 }), 0.0006);
  heart.geometry.center();
  onSurface(heart, rAt, 0.35, 0.066, 0.0012);
  g.add(heart);
  // la aureola: un aro de oro colgado de la virola, inclinado para afuera
  const halo = VM.tor(0.009, 0.0012, gold, 6, 24);
  halo.position.set(Math.sin(-0.5) * (top.r + 0.006), top.y - 0.012, Math.cos(-0.5) * (top.r + 0.006));
  halo.rotation.set(0.35, -0.5, 0, 'YXZ');
  g.add(halo);
  return { g, rAt, top, vir: [gold, 0.012, 0.004], bomb: { mat: gold }, topping: (gg) => sparks(gg, top, 14, 0xff2a44, 83) };
}

// Maizaster (Maleza Gaucha): un choclo ahuecado hecho mate, con los granos
// (alguno colorado, de maíz criollo) y las hojas de chala seca que lo abrazan
// desde abajo y se abren arriba; la faja de la marca y, arriba de la yerba,
// unos pochoclos.
function maiz(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.02, 0.002], [0.035, 0.012], [0.043, 0.03], [0.045, 0.05], [0.042, 0.07], [0.035, 0.086], [0.03, 0.095], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const kernels = texOf('mz-granos', 512, 256, (ctx, W, H) => {
    const r = rng(311);
    ctx.fillStyle = '#5a3208';
    ctx.fillRect(0, 0, W, H);
    const cols = 18;
    const rows = 13;
    const cw = W / cols;
    const rh = H / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // (las filas corridas medio grano, como en el choclo)
        const x = (i + (j % 2) * 0.5) * cw;
        const y = j * rh;
        const red = r() < 0.05;
        const k = 0.85 + r() * 0.25;
        const gr = ctx.createRadialGradient(x + cw * 0.4, y + rh * 0.35, 1, x + cw / 2, y + rh / 2, cw * 0.62);
        gr.addColorStop(0, red ? '#e0524a' : `rgb(${255 * k},${226 * k},${128 * k})`);
        gr.addColorStop(0.55, red ? '#a3202a' : `rgb(${236 * k},${170 * k},${40 * k})`);
        gr.addColorStop(1, red ? '#5a0c14' : `rgb(${170 * k},${104 * k},${16 * k})`);
        ctx.fillStyle = gr;
        for (const dx of [0, -W]) {
          ctx.beginPath();
          ctx.roundRect(x + dx + 1.5, y + 1.5, cw - 3, rh - 3, 5);
          ctx.fill();
        }
      }
    }
  });
  g.add(body(pts, phys({ map: kernels, bumpMap: kernels, bumpScale: 1.4, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 })));
  // la chala: hojas secas que suben pegadas y se abren arriba (fuera de donde van los dedos)
  const chala = texOf('mz-chala', 128, 256, (ctx, W, H) => {
    const r = rng(313);
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#e9dcb0');
    gr.addColorStop(1, '#b89a5c');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = r() * W;
      ctx.strokeStyle = `rgba(${90 + r() * 40},${64 + r() * 30},${30},${0.2 + r() * 0.3})`;
      ctx.lineWidth = 0.6 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (r() - 0.5) * 6, H);
      ctx.stroke();
    }
  });
  const huskMat = std({ map: chala, roughness: 0.85, side: THREE.DoubleSide });
  for (const [a, h] of [[0, 0.066], [0.9, 0.058], [-0.9, 0.062], [1.72, 0.05], [-1.72, 0.054]]) {
    const hp = [];
    for (let i = 0; i <= 12; i++) {
      const y = 0.004 + (h * i) / 12;
      const u = i / 12;
      hp.push(new THREE.Vector2(rAt(y) + 0.0012 + u * u * u * 0.011, y));
    }
    g.add(new THREE.Mesh(new THREE.LatheGeometry(hp, 8, a - 0.4, 0.8), huskMat));
  }
  const bandTex = texOf('mz-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.bg }));
  g.add(band(rAt, 0.071, 0.087, std({ map: bandTex, roughness: 0.6 }), 0.0009));
  // los pochoclos arriba de la yerba
  const pop = std({ color: 0xf7f0dc, roughness: 0.8 });
  const popcorn = (gg) => {
    const r = rng(317);
    for (let k = 0; k < 6; k++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * top.r * 0.6;
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0022 + r() * 0.0012, 7, 5), pop);
        b.position.set((r() - 0.5) * 0.004, r() * 0.003, (r() - 0.5) * 0.004);
        c.add(b);
      }
      c.position.set(Math.sin(a) * d, yerbaY(top) + 0.0015, Math.cos(a) * d);
      gg.add(c);
    }
  };
  return { g, rAt, top, vir: [std({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.45 }), 0.011, 0.004], topping: popcorn };
}

// Stamin-Up (Trotadora): el mate zapatilla de correr. Pintado de amarillo a
// naranja, la lengüeta con los cordones cruzados adelante, la muñequera de
// toalla con la marca y dos alitas de oro a los costados (las del medallón).
function stamin(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.037, 0.012], [0.044, 0.032], [0.044, 0.055], [0.04, 0.073], [0.033, 0.087], [0.029, 0.095], [0.031, 0.102]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.102 };
  const paint = texOf('st-pintura', 256, 256, (ctx, W, H) => {
    const r = rng(401);
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#ffd23a');
    gr.addColorStop(0.55, '#f7a21c');
    gr.addColorStop(1, '#d9640e');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    // las rayas de velocidad que cruzan en diagonal
    ctx.fillStyle = 'rgba(255,246,224,0.55)';
    for (let k = 0; k < 4; k++) {
      const x = W * (0.12 + k * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, H * 0.62);
      ctx.lineTo(x + 70, H * 0.62);
      ctx.lineTo(x + 52, H * 0.7);
      ctx.lineTo(x - 18, H * 0.7);
      ctx.fill();
    }
    grain(ctx, W, H, r, 900, 0.12);
  });
  g.add(body(pts, phys({ map: paint, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 })));
  // la lengüeta con los ojalitos y los cordones cruzados (adelante, lejos de los dedos)
  const laces = texOf('st-cordones', 128, 256, (ctx, W, H) => {
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(W * 0.22, 0, W * 0.56, H);
    const rows = 5;
    const ys = Array.from({ length: rows }, (_, i) => H * (0.14 + (i * 0.72) / (rows - 1)));
    ctx.lineCap = 'round';
    for (let i = 0; i < rows - 1; i++) {
      for (const [x0, x1] of [[0.16, 0.84], [0.84, 0.16]]) {
        ctx.strokeStyle = '#8a5a2a';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(W * x0, ys[i]);
        ctx.lineTo(W * x1, ys[i + 1]);
        ctx.stroke();
        ctx.strokeStyle = '#fff6e6';
        ctx.lineWidth = 11;
        ctx.stroke();
      }
    }
    for (const y of ys) {
      for (const x of [0.16, 0.84]) {
        ctx.fillStyle = '#c8ccd2';
        ctx.beginPath();
        ctx.arc(W * x, y, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(W * x, y, 4.5, 0, TAU);
        ctx.fill();
      }
    }
  });
  g.add(strip(rAt, -0.36, 0.72, 0.014, 0.058, std({ map: laces, bumpMap: laces, bumpScale: 0.6, roughness: 0.8 }), 0.0011, 10));
  // la muñequera de toalla, con la marca
  const terry = texOf('st-faja', 1024, 128, (ctx, W, H) => {
    const r = rng(409);
    const stripes = (c, cx, seg, h) => {
      c.fillStyle = L.bg;
      c.fillRect(cx + seg * 0.42, h * 0.22, 6, h * 0.56);
      c.fillRect(cx + seg * 0.42 + 10, h * 0.22, 6, h * 0.56);
    };
    paintBand(L, perk, { bg: '#fbf6ea', ink: L.bg, rule: L.bg, deco: stripes })(ctx, W, H);
    // el rizo de la toalla
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,90,60,0.14)';
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, 0.8 + r() * 1.4, 0, TAU);
      ctx.fill();
    }
  });
  g.add(band(rAt, 0.064, 0.085, std({ map: terry, bumpMap: terry, bumpScale: 1.2, roughness: 0.95 }), 0.0022));
  // las alitas de oro, a los costados (tres plumas cada una, para atrás y arriba)
  const gold = std({ color: 0xf2c14e, metalness: 0.85, roughness: 0.28 });
  for (const a of [Math.PI / 2 + 0.25, -Math.PI / 2 - 0.25]) {
    const holder = new THREE.Group();
    const y = 0.07;
    for (const [rz, len, w] of [[0.55, 0.03, 0.0065], [0.95, 0.026, 0.006], [1.35, 0.02, 0.0055]]) {
      const f = new THREE.Shape();
      f.moveTo(0, 0);
      f.quadraticCurveTo(len * 0.5, w, len, 0);
      f.quadraticCurveTo(len * 0.5, -w * 0.6, 0, 0);
      const m = flat(f, 0.0012, gold, 0.0003);
      m.position.z = -0.0006;
      m.rotation.z = rz;
      holder.add(m);
    }
    holder.position.set(Math.sin(a) * rAt(y) * 0.96, y, Math.cos(a) * rAt(y) * 0.96);
    holder.rotation.y = a - Math.PI / 2;
    g.add(holder);
  }
  return { g, rAt, top, vir: [std({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 }), 0.012, 0.004] };
}

// Cualquier otro perk: la calabaza del color del perk, con la faja de su nombre.
// Catalizador Caótico (CaoSé, solo Eclipse): de obsidiana negra laqueada, la
// faja oro con la marca, al frente el eclipse (la luna negra con su aro de oro)
// y una grieta violeta que sube por la panza; arriba, chispas violetas.
function catal(T, M, perk) {
  const L = perk.label;
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.039, 0.013], [0.047, 0.035], [0.046, 0.058], [0.04, 0.076], [0.032, 0.088], [0.029, 0.095], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  const gold = std({ color: 0xd8a842, metalness: 1, roughness: 0.28 });
  g.add(body(pts, phys({ color: 0x0e0a16, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 })));
  const bandTex = texOf('cs-faja', 1024, 128, paintBand(L, perk, { bg: L.band, ink: L.bandText, rule: L.accent }));
  g.add(band(rAt, 0.026, 0.048, phys({ map: bandTex, roughness: 0.3, clearcoat: 1 }), 0.0009));
  // el eclipse al frente, arriba de la faja (lejos de los dedos)
  const ecl = new THREE.Group();
  const ring = VM.tor(0.0075, 0.0011, gold, 6, 24);
  ecl.add(ring);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.0068, 20), std({ color: 0x030205, roughness: 0.4 }));
  moon.position.z = 0.0004;
  ecl.add(moon);
  onSurface(ecl, rAt, 0.35, 0.064, 0.0012);
  g.add(ecl);
  // la grieta violeta que sube por la panza, del otro lado
  const glowV = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa45cff).multiplyScalar(1.8), toneMapped: false });
  for (const [a, y0, y1] of [[-0.55, 0.012, 0.03], [-0.45, 0.03, 0.05], [-0.6, 0.05, 0.07]]) {
    const s = strip(rAt, a, 0.05, y0, y1, glowV, 0.0008, 2);
    g.add(s);
  }
  return { g, rAt, top, vir: [gold, 0.012, 0.004], bomb: { mat: gold }, topping: (gg) => sparks(gg, top, 16, 0xb070ff, 97) };
}

function generic(T, M, perk) {
  const g = new THREE.Group();
  const pts = profile([[0, 0], [0.022, 0.002], [0.038, 0.013], [0.046, 0.034], [0.046, 0.056], [0.041, 0.074], [0.033, 0.087], [0.029, 0.094], [0.031, 0.101]]);
  const rAt = (y) => VM.profileRadius(pts, y);
  const top = { r: 0.031, y: 0.101 };
  g.add(body(pts, std({ color: perk.color, roughness: 0.5, map: T.gourd })));
  return { g, rAt, top, vir: [M.silver, 0.012, 0.004] };
}

const BUILDERS = { jugg, revive, speed, doubletap, mule, deadshot, phd, dragon, aqua, cherry, wish, maiz, stamin, ...(globalThis.__mduEclipse === true ? { catal } : {}) };

// Arma el mate de un perk (o uno genérico del color, si no hay perk).
// Devuelve { root, tip, strawDir } como el de siempre (Weapons.drink).
export function buildPerkMateFor(T, perkId, color) {
  const M = VM.mats(T);
  const perk = PERKS[perkId] || { color: color || '#8a6a3a', glyph: '', label: {} };
  const build = BUILDERS[perkId] || generic;
  const P = build(T, M, perk);
  const g = P.g;
  const [vm, vh, lip] = P.vir;
  g.add(virola(P.top, vm, vh, lip));
  P.extra?.(g);
  if (!P.noYerba) g.add(VM.yerba(P.top.r, P.top.y, M));
  P.topping?.(g);
  const b = VM.bombilla({ len: 0.19, tilt: -0.78, ...(P.bomb || {}) }, M, P.top.y);
  g.add(b.group);
  g.add(VM.cupHand(M, P.rAt, P.top.y));
  g.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  b.tips[0].getWorldPosition(tip);
  const base = new THREE.Vector3();
  b.straws[0].getWorldPosition(base);
  return { root: g, tip, strawDir: tip.clone().sub(base).normalize() };
}

export const PERK_MATE_IDS = Object.keys(BUILDERS);
