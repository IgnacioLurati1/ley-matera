// Los íconos de los perks, dibujados (no letras de una fuente, que salían
// distintas en cada compu y no se entendían). Siguen la idea de los de Black
// Ops 3: un medallón del color del perk con el símbolo claro adentro, y el
// símbolo del original llevado al mate:
//  · Taragüerno (Juggernog): el escudo con la cruz y una bala que lo atraviesa.
//  · Rosamorte (Quick Revive): uno que se levanta de la tumba.
//  · Rapidito (Speed Cola): el cargador con el rayo, volando.
//  · Doble Cruz (Double Tap): dos balas con el estallido atrás.
//  · Mulanda (Mule Kick): tres mates, el tercero apenas (el de más).
//  · Nadarias (Deadshot): la calavera con la mira... corrida (no hace nada).
//  · Flopa Hermanos (PhD Flopper): uno que se tira de panza y revienta todo.
//  · Baldragón (Aliento Dragónico): la cabeza del dragón largando fuego.
//  · Nadadito (Acuanauta): la escafandra con burbujas sobre las olas.
//  · Chisporé (Electric Cherry): las dos cerezas con el rayo atrás.
//  · Extremaunión (Dying Wish): el corazón con la aureola y el latido que vuelve.
//  · Maleza Gaucha (Maizaster): los ojos que espían entre la paja seca.
//  · Trotadora (Stamin-Up): la alpargata con alas, a la carrera.
// Los usan el medallón del HUD (perkIconURL), el emblema del paquete de la
// máquina (core/textures perkLabel) y la faja del mate (weapons/perkMates).
// Todo en unidades del radio: el símbolo cabe en un círculo de radio ~0.66.
import { PERKS } from '../config/perks';

const FG = '#fff4e2';
const INK = 'rgba(20,10,5,0.55)';
const BRASS = '#f2c14e';

const idOf = (p) => (typeof p === 'string' ? p : Object.keys(PERKS).find((k) => PERKS[k] === p));

// Colores del medallón: el del perk (el de la máquina en Black Ops), no el del paquete.
function tones(id) {
  const c = PERKS[id]?.color || '#777777';
  return { base: c, dark: mix(c, '#000000', 0.55), light: mix(c, '#ffffff', 0.45) };
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// Relleno claro con borde oscuro (se lee sobre cualquier color).
function solid(ctx, path, fill = FG, w = 0.06) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
  ctx.fillStyle = fill;
  ctx.fill(path);
}

// Trazo grueso claro con borde oscuro.
function line(ctx, path, w, color = FG) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = w + 0.07;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke(path);
}

function poly(pts, close = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}

function star(cx, cy, n, r0, r1, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

// Una bala parada (o girada): vaina, cuello y punta ojival.
function bullet(len = 1, w = 0.2) {
  const p = new Path2D();
  const h = w / 2;
  p.moveTo(-h, len * 0.5);
  p.lineTo(-h, -len * 0.08);
  p.quadraticCurveTo(-h, -len * 0.42, 0, -len * 0.5);
  p.quadraticCurveTo(h, -len * 0.42, h, -len * 0.08);
  p.lineTo(h, len * 0.5);
  p.closePath();
  return p;
}

// La calabacita del mate con la bombilla.
function gourd(ctx, x, y, s, alpha, outline = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha *= alpha;
  const b = new Path2D();
  b.moveTo(-0.24, -0.2);
  b.bezierCurveTo(-0.52, -0.05, -0.5, 0.52, 0, 0.54);
  b.bezierCurveTo(0.5, 0.52, 0.52, -0.05, 0.24, -0.2);
  b.closePath();
  const rim = new Path2D();
  rim.rect(-0.27, -0.3, 0.54, 0.12);
  const bomb = new Path2D();
  bomb.moveTo(0.08, -0.26);
  bomb.lineTo(0.3, -0.72);
  bomb.lineTo(0.42, -0.72);
  if (outline) {
    ctx.setLineDash([0.09, 0.07]);
    line(ctx, b, 0.07);
    line(ctx, rim, 0.06);
    ctx.setLineDash([]);
  } else {
    solid(ctx, b);
    solid(ctx, rim, BRASS);
    line(ctx, bomb, 0.07, BRASS);
  }
  ctx.restore();
}

const SYMBOLS = {
  jugg(ctx, T) {
    const s = new Path2D();
    s.moveTo(-0.46, -0.52);
    s.lineTo(0.46, -0.52);
    s.lineTo(0.46, -0.02);
    s.quadraticCurveTo(0.44, 0.42, 0, 0.64);
    s.quadraticCurveTo(-0.44, 0.42, -0.46, -0.02);
    s.closePath();
    solid(ctx, s);
    // la cruz, calada
    ctx.fillStyle = T.base;
    ctx.fillRect(-0.085, -0.42, 0.17, 0.9);
    ctx.fillRect(-0.34, -0.2, 0.68, 0.16);
    // la bala que lo atraviesa
    ctx.save();
    ctx.rotate(Math.PI / 4);
    solid(ctx, bullet(1.34, 0.19), BRASS, 0.07);
    ctx.fillStyle = INK;
    ctx.fillRect(-0.095, 0.3, 0.19, 0.035);
    ctx.restore();
  },
  revive(ctx) {
    // la tumba (la losa corrida) y el que sale con los brazos arriba
    const slab = poly([[-0.56, 0.24], [0.56, 0.24], [0.5, 0.42], [-0.5, 0.42]]);
    const body = new Path2D();
    body.moveTo(0, -0.18);
    body.lineTo(0, 0.22);
    const arms = new Path2D();
    arms.moveTo(-0.36, -0.5);
    arms.lineTo(-0.1, -0.14);
    arms.lineTo(0.1, -0.14);
    arms.lineTo(0.36, -0.5);
    line(ctx, arms, 0.12);
    line(ctx, body, 0.22);
    const head = new Path2D();
    head.arc(0, -0.35, 0.13, 0, Math.PI * 2);
    solid(ctx, head);
    solid(ctx, slab);
    // el hoyo abajo de la losa y la cruz que lo cura
    ctx.fillStyle = INK;
    ctx.fillRect(-0.4, 0.42, 0.8, 0.08);
    const cross = new Path2D();
    cross.moveTo(0.44, -0.12);
    cross.lineTo(0.44, 0.1);
    cross.moveTo(0.33, -0.01);
    cross.lineTo(0.55, -0.01);
    line(ctx, cross, 0.08, BRASS);
  },
  speed(ctx, T) {
    // las rayas de la velocidad
    const lines = new Path2D();
    for (const [y, x0] of [[-0.3, -0.62], [-0.04, -0.66], [0.22, -0.58]]) {
      lines.moveTo(x0, y);
      lines.lineTo(x0 + 0.26, y);
    }
    line(ctx, lines, 0.07);
    // el cargador curvo
    const mag = poly([[-0.08, -0.56], [0.3, -0.56], [0.3, -0.2], [0.22, 0.16], [0.06, 0.54], [-0.3, 0.44], [-0.16, 0.12], [-0.08, -0.22]]);
    solid(ctx, mag);
    ctx.fillStyle = INK;
    ctx.fillRect(-0.1, -0.5, 0.42, 0.05);
    // el rayo, calado
    ctx.fillStyle = T.base;
    ctx.fill(poly([[0.16, -0.4], [-0.04, -0.02], [0.08, -0.02], [-0.06, 0.36], [0.2, -0.08], [0.08, -0.08], [0.22, -0.4]]));
  },
  doubletap(ctx) {
    // el estallido (rojo, para que las balas de bronce resalten) y las dos balas
    solid(ctx, star(0, 0.08, 11, 0.66, 0.42, 0.2), '#d8432f');
    for (const x of [-0.19, 0.19]) {
      ctx.save();
      ctx.translate(x, -0.02);
      ctx.rotate(x * 0.45);
      solid(ctx, bullet(1.04, 0.27), BRASS, 0.08);
      ctx.fillStyle = INK;
      ctx.fillRect(-0.135, 0.2, 0.27, 0.04);
      ctx.restore();
    }
  },
  mule(ctx) {
    // el tercer mate (el de más) apenas: en contorno
    gourd(ctx, -0.36, 0.08, 0.74, 1);
    gourd(ctx, 0.02, -0.06, 0.74, 0.85);
    gourd(ctx, 0.4, 0.08, 0.74, 1, true);
  },
  deadshot(ctx) {
    const skull = new Path2D();
    skull.arc(-0.04, -0.12, 0.36, Math.PI * 0.8, Math.PI * 2.2);
    skull.lineTo(0.2, 0.3);
    skull.lineTo(-0.28, 0.3);
    skull.closePath();
    solid(ctx, skull);
    ctx.fillStyle = INK;
    for (const x of [-0.18, 0.1]) {
      ctx.beginPath();
      ctx.ellipse(x, -0.06, 0.1, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fill(poly([[-0.04, 0.06], [-0.1, 0.16], [0.02, 0.16]]));
    for (let k = 0; k < 4; k++) ctx.fillRect(-0.21 + k * 0.11, 0.22, 0.04, 0.09);
    // la mira, corrida para un costado
    const m = new Path2D();
    m.arc(0.2, -0.24, 0.3, 0, Math.PI * 2);
    for (const [a, b] of [[[0.2, -0.64], [0.2, -0.44]], [[0.2, -0.04], [0.2, 0.16]], [[-0.2, -0.24], [0, -0.24]], [[0.4, -0.24], [0.6, -0.24]]]) {
      m.moveTo(...a);
      m.lineTo(...b);
    }
    line(ctx, m, 0.07, '#e8453c');
  },
  phd(ctx) {
    // el estallido abajo
    solid(ctx, star(0, 0.46, 9, 0.44, 0.24, -Math.PI / 2), BRASS);
    // el que se tira de panza, con los brazos adelante
    const body = new Path2D();
    body.moveTo(-0.26, -0.12);
    body.lineTo(0.24, -0.02);
    const limbs = new Path2D();
    limbs.moveTo(-0.24, -0.14);
    limbs.lineTo(-0.6, -0.3);
    limbs.moveTo(0.22, -0.02);
    limbs.lineTo(0.56, -0.2);
    limbs.moveTo(0.22, 0);
    limbs.lineTo(0.52, 0.12);
    line(ctx, limbs, 0.1);
    line(ctx, body, 0.22);
    const head = new Path2D();
    head.arc(-0.38, -0.02, 0.12, 0, Math.PI * 2);
    solid(ctx, head);
    // las rayas de la caída
    const fall = new Path2D();
    for (const x of [-0.14, 0.08, 0.3]) {
      fall.moveTo(x, -0.62);
      fall.lineTo(x, -0.38);
    }
    line(ctx, fall, 0.06);
  },
  dragon(ctx, T) {
    // el fuego que sale de la boca
    const fire = new Path2D();
    fire.moveTo(-0.14, 0.06);
    fire.bezierCurveTo(-0.4, -0.12, -0.52, -0.02, -0.66, -0.2);
    fire.bezierCurveTo(-0.58, 0.02, -0.66, 0.1, -0.7, 0.18);
    fire.bezierCurveTo(-0.52, 0.14, -0.52, 0.3, -0.62, 0.42);
    fire.bezierCurveTo(-0.4, 0.34, -0.3, 0.3, -0.14, 0.16);
    fire.closePath();
    solid(ctx, fire, '#ffd24a');
    // la cabeza de perfil, con el cuerno y la cresta
    const head = poly([[-0.2, 0.02], [-0.12, -0.12], [0.06, -0.22], [0.2, -0.26], [0.5, -0.6], [0.36, -0.2], [0.5, -0.08], [0.56, 0.5], [0.24, 0.5], [0.1, 0.24], [-0.16, 0.2], [-0.06, 0.1]]);
    solid(ctx, head);
    ctx.fillStyle = T.base;
    ctx.beginPath();
    ctx.ellipse(0.12, -0.1, 0.07, 0.045, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // los dientes
    ctx.fillStyle = INK;
    ctx.fill(poly([[-0.12, 0.08], [-0.08, 0.14], [-0.04, 0.08]]));
    ctx.fill(poly([[0, 0.1], [0.04, 0.16], [0.08, 0.1]]));
  },
  cherry(ctx) {
    // el rayo atrás
    solid(ctx, poly([[0.14, -0.66], [-0.2, -0.08], [0.02, -0.08], [-0.16, 0.52], [0.3, -0.18], [0.08, -0.18], [0.3, -0.66]]), '#ffd84a', 0.06);
    // los cabitos que se juntan arriba, con la hojita
    const stems = new Path2D();
    stems.moveTo(-0.24, 0.12);
    stems.quadraticCurveTo(-0.22, -0.3, 0.06, -0.5);
    stems.moveTo(0.26, 0.18);
    stems.quadraticCurveTo(0.24, -0.2, 0.06, -0.5);
    line(ctx, stems, 0.06, '#6b8f2a');
    const leaf = new Path2D();
    leaf.moveTo(0.06, -0.5);
    leaf.quadraticCurveTo(0.3, -0.66, 0.46, -0.5);
    leaf.quadraticCurveTo(0.26, -0.4, 0.06, -0.5);
    solid(ctx, leaf, '#7fb236', 0.05);
    // las dos cerezas, con su brillo
    for (const [x, y] of [[-0.25, 0.3], [0.25, 0.36]]) {
      const c = new Path2D();
      c.arc(x, y, 0.24, 0, Math.PI * 2);
      solid(ctx, c, '#d8233a', 0.07);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(x - 0.08, y - 0.09, 0.06, 0.035, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  aqua(ctx, T) {
    // las olas
    const waves = new Path2D();
    for (const y of [0.44, 0.6]) {
      waves.moveTo(-0.56, y);
      for (let k = 0; k < 4; k++) waves.quadraticCurveTo(-0.42 + k * 0.28, y - 0.1, -0.28 + k * 0.28, y);
    }
    line(ctx, waves, 0.07);
    // la escafandra con el visor
    const helm = new Path2D();
    helm.arc(0, -0.1, 0.4, 0, Math.PI * 2);
    solid(ctx, helm, BRASS);
    ctx.fillRect(-0.34, 0.2, 0.68, 0.12);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.strokeRect(-0.34, 0.2, 0.68, 0.12);
    const port = new Path2D();
    port.arc(0, -0.1, 0.22, 0, Math.PI * 2);
    solid(ctx, port, T.dark);
    const bars = new Path2D();
    bars.moveTo(-0.22, -0.1);
    bars.lineTo(0.22, -0.1);
    bars.moveTo(0, -0.32);
    bars.lineTo(0, 0.12);
    line(ctx, bars, 0.04, BRASS);
    // las burbujas
    for (const [x, y, r] of [[0.46, -0.42, 0.07], [0.56, -0.58, 0.05], [0.44, -0.66, 0.035]]) {
      const b = new Path2D();
      b.arc(x, y, r, 0, Math.PI * 2);
      line(ctx, b, 0.035);
    }
  },
  wish(ctx, T) {
    // la aureola del que ya se iba
    const halo = new Path2D();
    halo.ellipse(0, -0.5, 0.3, 0.09, 0, 0, Math.PI * 2);
    line(ctx, halo, 0.06, BRASS);
    // el corazón
    const heart = new Path2D();
    heart.moveTo(0, 0.5);
    heart.bezierCurveTo(-0.2, 0.34, -0.52, 0.12, -0.5, -0.1);
    heart.bezierCurveTo(-0.48, -0.32, -0.18, -0.36, 0, -0.16);
    heart.bezierCurveTo(0.18, -0.36, 0.48, -0.32, 0.5, -0.1);
    heart.bezierCurveTo(0.52, 0.12, 0.2, 0.34, 0, 0.5);
    heart.closePath();
    solid(ctx, heart, FG, 0.07);
    // el latido que vuelve: la línea chata que de golpe pega el salto
    const ecg = poly([[-0.66, 0.06], [-0.3, 0.06], [-0.2, -0.02], [-0.12, 0.06], [-0.04, 0.06], [0.04, -0.46], [0.14, 0.4], [0.22, 0.06], [0.66, 0.06]], false);
    line(ctx, ecg, 0.08, T.base);
  },
  maiz(ctx, T) {
    // los ojos que espían desde el pastizal...
    for (const x of [-0.21, 0.21]) {
      const e = new Path2D();
      e.moveTo(x - 0.18, -0.12);
      e.quadraticCurveTo(x, -0.3, x + 0.18, -0.12);
      e.quadraticCurveTo(x, 0.04, x - 0.18, -0.12);
      e.closePath();
      solid(ctx, e, FG, 0.06);
      ctx.fillStyle = '#1a1008';
      ctx.beginPath();
      ctx.arc(x + 0.04, -0.13, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    // ...tapados a medias por las hojas de paja seca (siluetas con filo claro)
    ctx.lineJoin = 'round';
    for (const [x, lean, h, w] of [[-0.56, -0.12, 0.92, 0.07], [-0.36, 0.04, 1.22, 0.085], [-0.02, -0.07, 0.86, 0.09], [0.27, 0.16, 1.26, 0.085], [0.5, 0.05, 0.94, 0.07]]) {
      const b = new Path2D();
      b.moveTo(x - w, 0.68);
      b.quadraticCurveTo(x - w * 0.5 + lean * 0.3, 0.68 - h * 0.55, x + lean, 0.68 - h);
      b.quadraticCurveTo(x + w * 0.5 + lean * 0.3, 0.68 - h * 0.55, x + w, 0.68);
      b.closePath();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = FG;
      ctx.stroke(b);
      ctx.fillStyle = T.dark;
      ctx.fill(b);
    }
    // el penacho de la cortadera en la punta de la más alta
    const pl = new Path2D();
    pl.ellipse(0.43, -0.6, 0.07, 0.17, 0.2, 0, Math.PI * 2);
    solid(ctx, pl, FG, 0.04);
  },
  stamin(ctx, T) {
    // las rayas de la corrida, atrás
    for (const [y, x0] of [[0.2, -0.7], [0.38, -0.74], [0.56, -0.6]]) {
      const l = new Path2D();
      l.moveTo(x0, y);
      l.lineTo(x0 + 0.26, y);
      line(ctx, l, 0.07);
    }
    ctx.save();
    ctx.translate(0.1, 0.08);
    ctx.rotate(-0.26);
    ctx.scale(1.06, 1.06);
    // la alpargata: la lona...
    const up = new Path2D();
    up.moveTo(-0.5, 0.3);
    up.lineTo(-0.47, -0.1);
    up.quadraticCurveTo(-0.3, -0.03, -0.12, -0.08);
    up.quadraticCurveTo(0.2, -0.02, 0.42, 0.13);
    up.quadraticCurveTo(0.6, 0.21, 0.57, 0.3);
    up.closePath();
    solid(ctx, up, FG, 0.07);
    // ...con la costura de la puntera
    const seam = new Path2D();
    seam.moveTo(0.16, 0.3);
    seam.quadraticCurveTo(0.18, 0.08, 0.3, 0.06);
    line(ctx, seam, 0.035, T.base);
    // el ala en el tobillo: cuatro plumas que se abren para atrás y arriba
    for (const [a, len] of [[-1.95, 0.5], [-2.25, 0.46], [-2.55, 0.4], [-2.85, 0.32]]) {
      const f = new Path2D();
      const bx = -0.28;
      const by = 0.08;
      const tx = bx + Math.cos(a) * len;
      const ty = by + Math.sin(a) * len;
      const nx = -Math.sin(a) * 0.1;
      const ny = Math.cos(a) * 0.1;
      f.moveTo(bx, by);
      f.quadraticCurveTo((bx + tx) / 2 + nx, (by + ty) / 2 + ny, tx, ty);
      f.quadraticCurveTo((bx + tx) / 2 - nx * 0.25, (by + ty) / 2 - ny * 0.25, bx, by);
      f.closePath();
      solid(ctx, f, FG, 0.06);
    }
    // ...y la suela de yute trenzado
    const sole = new Path2D();
    sole.roundRect(-0.54, 0.27, 1.14, 0.15, 0.07);
    solid(ctx, sole, BRASS, 0.06);
    ctx.save();
    ctx.clip(sole);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.025;
    for (let x = -0.56; x < 0.62; x += 0.09) {
      ctx.beginPath();
      ctx.moveTo(x, 0.42);
      ctx.lineTo(x + 0.07, 0.27);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  },
};

// Dibuja el ícono del perk (id o el objeto de config/perks) centrado en cx,cy
// con radio r. medallion: el disco de color con aro (si no, solo el símbolo).
export function drawPerkIcon(ctx, perk, cx, cy, r, { medallion = true } = {}) {
  const id = idOf(perk);
  const T = tones(id);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r, r);
  if (medallion) {
    // aro oscuro, filete claro y el disco con luz de arriba a la izquierda
    ctx.fillStyle = '#120c08';
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.light;
    ctx.beginPath();
    ctx.arc(0, 0, 0.93, 0, Math.PI * 2);
    ctx.fill();
    const gr = ctx.createRadialGradient(-0.3, -0.35, 0.05, 0, 0, 0.9);
    gr.addColorStop(0, T.light);
    gr.addColorStop(0.45, T.base);
    gr.addColorStop(1, T.dark);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 0.87, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  if (medallion) ctx.scale(0.86, 0.86);
  (SYMBOLS[id] || SYMBOLS.jugg)(ctx, T);
  ctx.restore();
  if (medallion) {
    // el brillo del vidrio arriba
    const sh = ctx.createLinearGradient(0, -0.9, 0, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, -0.42, 0.66, 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// El medallón como imagen (para el HUD): una por perk y tamaño.
const urls = new Map();
export function perkIconURL(perk, px = 128) {
  const id = idOf(perk);
  const key = `${id}:${px}`;
  if (!urls.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    drawPerkIcon(c.getContext('2d'), id, px / 2, px / 2, px / 2 - 1);
    urls.set(key, c.toDataURL('image/png'));
  }
  return urls.get(key);
}
