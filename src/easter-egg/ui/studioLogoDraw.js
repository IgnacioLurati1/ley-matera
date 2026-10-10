// El dibujo del logo de Luta Studios, cuadro por cuadro, en un lienzo 2D.
// Es una función pura del tiempo: paint(ctx, t) dibuja cómo se ve el logo a
// los t ms de haber aparecido. La usa ui/studioLogoWorker.js (en otro hilo,
// así no depende del hilo del juego) y, si el navegador no puede, el propio
// ui/StudioLogo.js.
//
// Qué se ve: se traza una L (baja el palo, sale el pie, un destello cuando
// queda armada); la L se corre a la izquierda y una línea de luz va
// destapando U, T y Λ a su derecha; se tiende un renglón fino debajo y
// aparece STUDIOS de punta a punta; pasa un brillo por las letras; se apaga.

// Todo en ms desde que aparece
export const T = {
  stem: 300, // el palo de la L baja
  stemMs: 400,
  foot: 720, // el pie de la L sale del palo, cuando el palo ya llego abajo
  footMs: 320,
  land: 1040, // la L queda armada: el destello (y el golpe)
  slide: 1500, // la L se corre y la luz destapa UTΛ
  slideMs: 850,
  rule: 2200, // el renglón fino (700)
  studios: 2400, // STUDIOS, letra por letra (55 entre una y otra, 520 cada una)
  sweep: 3300, // el brillo que cruza las letras (750)
  leave: 4300, // el logo se apaga (450)
  out: 4800, // el negro se va y queda la pantalla de carga
  outMs: 600,
};
// Lo que dura todo, hasta que se termina de ir
export const LOGO_MS = T.out + T.outMs;

// Las letras, a mano (100 de alto, trazo de 12): geométricas y finas, la A
// sin travesaño
const STROKE = 12;
const GAP = 22;
const L_W = 52;
const GLYPHS = [
  { w: 68, d: 'M0 0H12V66A22 22 0 0 0 56 66V0H68V66A34 34 0 0 1 0 66Z' },
  { w: 64, d: 'M0 0H64V12H38V100H26V12H0Z' },
  { w: 78, d: 'M0 100L33 0H45L78 100H65L39 21.2L13 100Z' },
];
const WORD = L_W + GLYPHS.reduce((a, g) => a + GAP + g.w, 0);
// (un blanco apenas apagado: el brillo que cruza las letras las lleva a blanco)
const INK = '#e4e0d8';
const SOFT = 'rgba(255, 248, 236, 0.26)';

// curva de Bézier de CSS (x1, y1, x2, y2) → f(x)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 6; i++) {
      const fx = ((ax * u + bx) * u + cx) * u - x;
      const d = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(d) < 1e-6) break;
      u -= fx / d;
    }
    return ((ay * u + by) * u + cy) * u;
  };
}
const trace = bezier(0.3, 0, 0.2, 1);
const glide = bezier(0.7, 0, 0.2, 1);
const settle = bezier(0.2, 0.7, 0.2, 1);
const inOut = bezier(0.45, 0, 0.55, 1);
const seg = (t, a, d) => Math.min(1, Math.max(0, (t - a) / d));

// Las medidas para una ventana de vw x vh (en píxeles de CSS): el alto de
// las letras y la caja del lienzo, centrada.
export function logoLayout(vw, vh) {
  const H = Math.round(Math.min(vw, vh) * 0.115);
  const k = H / 100;
  const wordW = WORD * k;
  const bw = Math.ceil(wordW + 1.8 * H);
  const bh = Math.ceil(3.06 * H);
  return { H, k, wordW, bw, bh, left: Math.round((vw - bw) / 2), top: Math.round((vh - bh) / 2) };
}

// calm: sin movimiento (lo pide el sistema): el logo entero aparece y se va.
export function createLogoPainter(lay, dpr, calm = false) {
  const { H, k, wordW, bw, bh } = lay;
  const x0 = (bw - wordW) / 2;
  const y0 = 0.65 * H; // el tope de las letras
  const rest = (WORD - L_W) * k; // de la derecha de la L al final de la palabra
  const off = rest / 2; // lo que se corre la L: de centrada sola a su lugar
  const s = STROKE * k;
  const paths = GLYPHS.map((g) => new Path2D(g.d));
  const yRule = y0 + 1.26 * H;
  const yStudios = yRule + 0.3 * H;
  const font = `500 ${0.2 * H}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  const chars = [...'STUDIOS'];
  let slots = null; // dónde va cada letra de STUDIOS (de punta a punta de la palabra)
  let lastBack = -1;

  function paint(ctx, t, cw, ch) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.clearRect(0, 0, cw, ch);
    const gone = trace(seg(t, T.leave, 450));
    let alpha = 1 - gone;
    if (calm) alpha *= settle(seg(t, 150, 500));
    if (alpha <= 0.001) return;
    // se acerca muy de a poco, y al irse un poquito más
    const zoom = 0.965 + 0.035 * settle(seg(t, 150, T.leave - 150)) + 0.03 * gone;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, (dpr * bw * (1 - zoom)) / 2, (dpr * bh * (1 - zoom)) / 2);
    const glow = (color, r) => {
      ctx.shadowColor = color;
      ctx.shadowBlur = dpr * H * r;
    };

    // ---- la L
    const g = calm ? 1 : glide(seg(t, T.slide, T.slideMs));
    const lx = x0 + off * (1 - g);
    const p1 = calm ? 1 : trace(seg(t, T.stem, T.stemMs));
    const p2 = calm ? 1 : trace(seg(t, T.foot, T.footMs));
    // el destello al quedar armada
    const flash = calm || t < T.land ? 0 : Math.max(0, 1 - (t - T.land) / 560);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK;
    if (flash > 0) glow(`rgba(255, 250, 240, ${0.3 + 0.65 * flash})`, 0.09 + 0.36 * flash * flash);
    else glow(SOFT, 0.09);
    // el palo y el pie en un solo trazo (si van por separado, el brillo de uno
    // se pinta encima del otro y se ve la junta). El pie sale del borde
    // derecho del palo hacia la derecha.
    const fw = s + (L_W * k - s) * p2;
    const shape = new Path2D();
    if (p1 > 0) shape.rect(lx, y0, s, H * p1);
    if (p2 > 0) shape.rect(lx, y0 + H - s, fw, s);
    ctx.fill(shape);
    // la punta del trazo, encendida mientras dibuja (siempre adentro de lo ya
    // trazado; se apaga al llegar)
    if (!calm) {
      ctx.fillStyle = '#fff';
      glow('rgba(255, 252, 245, 0.95)', 0.2);
      const tip1 = Math.min(s * 0.35, H * p1);
      const tip2 = Math.min(s * 0.35, fw - s);
      const a1 = Math.min(1, (1 - p1) * 6);
      const a2 = Math.min(1, (1 - p2) * 6);
      if (p1 > 0 && a1 > 0) {
        ctx.globalAlpha = alpha * a1;
        ctx.fillRect(lx, y0 + H * p1 - tip1, s, tip1);
      }
      if (p2 > 0 && tip2 > 0 && a2 > 0) {
        ctx.globalAlpha = alpha * a2;
        ctx.fillRect(lx + fw - tip2, y0 + H - s, tip2, s);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = INK;
    }

    // ---- U, T y Λ: quietas al lado de la L, destapadas de izquierda a derecha
    if (g > 0) {
      const from = lx + L_W * k;
      const edge = from + g * rest + 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, y0 - H, edge - from, 3 * H);
      ctx.clip();
      glow(SOFT, 0.09);
      let x = lx + (L_W + GAP) * k;
      for (let i = 0; i < GLYPHS.length; i++) {
        ctx.save();
        ctx.translate(x, y0);
        ctx.scale(k, k);
        ctx.fill(paths[i]);
        ctx.restore();
        x += (GLYPHS[i].w + GAP) * k;
      }
      ctx.restore();
      // la línea de luz que las va destapando
      const lit = calm ? 0 : Math.pow(Math.sin(Math.PI * seg(t, T.slide, T.slideMs + 120)), 0.7);
      if (lit > 0.01) {
        ctx.globalAlpha = alpha * lit;
        ctx.fillStyle = '#fff';
        glow('rgba(255, 250, 240, 0.95)', 0.24);
        ctx.fillRect(edge - 1, y0 - 0.17 * H, Math.max(1.5, 0.014 * H), 1.34 * H);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = INK;
      }
    }

    // ---- el brillo que cruza las letras (solo sobre lo ya dibujado)
    const sw = calm ? 0 : seg(t, T.sweep, 750);
    if (sw > 0 && sw < 1) {
      const bx = x0 - 0.7 * H + (wordW + 1.4 * H) * inOut(sw);
      const band = ctx.createLinearGradient(bx - 0.55 * H, 0, bx + 0.55 * H, 0);
      band.addColorStop(0, 'rgba(255, 255, 255, 0)');
      band.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
      band.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = band;
      ctx.fillRect(bx - 0.55 * H, y0 - 0.3 * H, 1.1 * H, 1.6 * H);
      ctx.restore();
    }

    // ---- el renglón
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    const pr = calm ? 1 : settle(seg(t, T.rule, 700));
    if (pr > 0) {
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = INK;
      ctx.fillRect(x0, yRule, wordW * pr, Math.max(1, Math.round(0.012 * H)));
    }

    // ---- STUDIOS, de punta a punta de la palabra
    ctx.font = font;
    ctx.textBaseline = 'top';
    if (!slots) {
      const ws = chars.map((c) => ctx.measureText(c).width);
      const free = (wordW - ws.reduce((a, b) => a + b, 0)) / (chars.length - 1);
      let x = x0;
      slots = ws.map((w) => {
        const at = x;
        x += w + free;
        return at;
      });
    }
    ctx.fillStyle = '#bdb9b0';
    for (let i = 0; i < chars.length; i++) {
      const a = calm ? 1 : settle(seg(t, T.studios + i * 55, 520));
      if (a <= 0) continue;
      ctx.globalAlpha = alpha * a;
      // llegan un poco abiertas y de abajo
      const spread = (slots[i] - (x0 + wordW / 2)) * 0.1 * (1 - a);
      ctx.fillText(chars[i], slots[i] + spread, yStudios + 0.1 * H * (1 - a));
    }
  }

  // El negro de fondo (con un claro apenas en el centro), que al final se va.
  function paintBack(ctx, t, cw, ch) {
    const b = 1 - inOut(seg(t, T.out, T.outMs));
    if (b === lastBack) return;
    lastBack = b;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);
    if (b <= 0) return;
    ctx.globalAlpha = b;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    const g = ctx.createRadialGradient(cw / 2, ch * 0.48, 0, cw / 2, ch * 0.48, cw * 0.56);
    g.addColorStop(0, '#121213');
    g.addColorStop(0.6, '#070707');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  return { paint, paintBack };
}
