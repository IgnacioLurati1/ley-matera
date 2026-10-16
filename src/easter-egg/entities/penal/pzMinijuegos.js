// Porteño encubierto: las tareas como minijuegos en 2D, al estilo Among Us (el
// usuario, 2026-10-16: "quiero minijuegos de verdad pero en 2D como Among Us,
// llegás y tenés que hacer alguna tarea de cebar mate, moler yerba o algo así").
// Se llega a la tarea (entities/penal/pzTareas.js), se aprieta F y se abre un
// panel con su juego; se hace con el mouse. El mouse no se suelta (como el menú
// de sabotaje del policía, pzSabotaje): el movimiento mueve un cursor propio y
// el juego no se pausa. Mientras tanto el jugador queda quieto (g.menuOpen) y
// el policía lo puede matar. Esc (o la X) lo deja sin hacer; morir, el encierro
// o el final lo cierran. Terminado: un "¡Listo!" y la tarea cuenta como antes
// (pzTareas.terminar → Porteno.taskDone). El policía hace las suyas igual.
// Uno por tarea (config/maps/penal.js porteno() tasks); "Cosechar yerba" tiene
// dos pasos: juntar las hojas y molerlas en el mortero.
// globalThis.__mduTareasViejas = true: mantener F, como antes.

const W = 640;
const H = 480;
const INK = '#1b130d';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const ease = (k) => 1 - (1 - k) * (1 - k);

// azar con semilla: cada juego sale distinto cada vez, pero sin depender del cuadro
function azar(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fondo(c, top, bot) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
function trazo(c, w = 3, col = INK) {
  c.lineWidth = w;
  c.strokeStyle = col;
  c.stroke();
}
function circ(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}
function madera(c, x, y, w, h, base = '#8a5a32') {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, base);
  g.addColorStop(1, '#5a3618');
  c.fillStyle = g;
  c.fill();
}
function texto(c, s, x, y, size = 22, col = '#f5efe4', align = 'center') {
  c.font = `700 ${size}px "Archivo Black", "Arial Black", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.lineWidth = Math.max(3, size / 5);
  c.strokeStyle = INK;
  c.strokeText(s, x, y);
  c.fillStyle = col;
  c.fillText(s, x, y);
}
// una barra de avance abajo
function barra(c, k, col = '#7ad957') {
  rr(c, 170, H - 34, 300, 16, 8);
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fill();
  if (k > 0.001) {
    rr(c, 172, H - 32, 296 * clamp(k, 0, 1), 12, 6);
    c.fillStyle = col;
    c.fill();
  }
  rr(c, 170, H - 34, 300, 16, 8);
  trazo(c, 2.5);
}
// cuánto giró el cursor alrededor de (cx, cy) con el clic apretado (para revolver, moler, cerrar)
function giro(st, P, cx, cy, rMin, rMax) {
  const d = dist(P.x, P.y, cx, cy);
  if (!P.down || d < rMin || d > rMax) {
    st.last = null;
    return 0;
  }
  const a = Math.atan2(P.y - cy, P.x - cx);
  const da = st.last == null ? 0 : clamp(wrap(a - st.last), -0.7, 0.7);
  st.last = a;
  return da;
}
function humo(c, x, y, t, n = 3, col = 'rgba(255,255,255,0.18)') {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.4 + i / n) % 1;
    circ(c, x + Math.sin(t * 1.3 + i * 2) * 14 * k, y - k * 80, 10 + k * 22);
    c.fillStyle = col.replace('0.18', (0.22 * (1 - k)).toFixed(3));
    c.fill();
  }
}
function llama(c, x, y, s, t, i = 0) {
  const f = 1 + Math.sin(t * 11 + i * 1.7) * 0.08;
  const lay = [
    ['#ff6a1a', 1],
    ['#ffb23a', 0.68],
    ['#fff1b0', 0.36],
  ];
  for (const [col, k] of lay) {
    const w = 14 * s * k;
    const h = 46 * s * k * f;
    c.beginPath();
    c.moveTo(x - w, y);
    c.bezierCurveTo(x - w, y - h * 0.55, x - w * 0.2, y - h * 0.7, x + Math.sin(t * 7 + i) * 3 * s, y - h);
    c.bezierCurveTo(x + w * 0.2, y - h * 0.7, x + w, y - h * 0.55, x + w, y);
    c.quadraticCurveTo(x, y + w * 0.5, x - w, y);
    c.fillStyle = col;
    c.fill();
  }
}

// ---------------------------------------------------------------------------
// Los juegos: { titulo, ayuda, step(dt, P, M), draw(c, P, t), prog, done }
// P: el cursor { x, y, down, pressed, released }; M: el que los maneja (sonidos)
// ---------------------------------------------------------------------------

function olla(r) {
  const cx = 320;
  const cy = 250;
  const trozos = Array.from({ length: 14 }, () => ({ a: r() * TAU, d: 30 + r() * 140, s: 9 + r() * 9, col: ['#e2742c', '#e8d9a8', '#6b2f1c', '#8fbf4a'][Math.floor(r() * 4)] }));
  const st = { last: null, ang: 0 };
  return {
    titulo: 'Revolver el guiso',
    ayuda: 'Revolvé con el cucharón: tres vueltas',
    prog: 0,
    step(dt, P, M) {
      const da = giro(st, P, cx, cy, 30, 200);
      st.ang += da;
      this.prog = clamp(Math.abs(st.ang) / (3 * TAU), 0, 1);
      if (Math.abs(da) > 0.02) M.ruido('revolver', 0.18);
      if (this.prog >= 1) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#5a3a22', '#2c1a0e');
      // la mesa
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.03)';
        c.fillRect(0, i * 80, W, 80);
      }
      // la olla
      circ(c, cx, cy, 222);
      c.fillStyle = '#3b3b40';
      c.fill();
      trazo(c, 5);
      circ(c, cx, cy, 200);
      const gs = c.createRadialGradient(cx - 40, cy - 40, 20, cx, cy, 200);
      gs.addColorStop(0, '#c4692c');
      gs.addColorStop(1, '#6e2f12');
      c.fillStyle = gs;
      c.fill();
      trazo(c, 4);
      for (const q of trozos) {
        const a = q.a + st.ang * (0.5 + q.d / 400);
        const x = cx + Math.cos(a) * q.d;
        const y = cy + Math.sin(a) * q.d;
        circ(c, x, y, q.s);
        c.fillStyle = q.col;
        c.fill();
        trazo(c, 2);
      }
      // las asas
      for (const s of [-1, 1]) {
        rr(c, cx + s * 222 - 20, cy - 14, 40, 28, 10);
        c.fillStyle = '#2a2a2e';
        c.fill();
        trazo(c, 3);
      }
      humo(c, cx - 60, cy - 60, t, 3);
      humo(c, cx + 70, cy + 10, t + 1.3, 3);
      // el cucharón: de la mano al borde
      const hx = P.down && dist(P.x, P.y, cx, cy) < 200 ? P.x : cx + 80;
      const hy = P.down && dist(P.x, P.y, cx, cy) < 200 ? P.y : cy + 40;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx + 150, hy + 150);
      c.lineCap = 'round';
      trazo(c, 16, INK);
      trazo(c, 11, '#b07a42');
      c.lineCap = 'butt';
      c.beginPath();
      c.ellipse(hx, hy, 26, 20, 0.8, 0, TAU);
      c.fillStyle = '#c99158';
      c.fill();
      trazo(c, 3);
      // el avance, alrededor
      c.beginPath();
      c.arc(cx, cy, 214, -Math.PI / 2, -Math.PI / 2 + TAU * this.prog);
      trazo(c, 6, '#ffd36e');
    },
  };
}

function fogon() {
  const st = { fuego: 0.12, y: 0, prevY: 0, aire: [] };
  return {
    st,
    titulo: 'Avivar el fogón',
    ayuda: 'Bombeá el fuelle arriba y abajo',
    prog: 0,
    step(dt, P, M) {
      // el mango del fuelle sigue al cursor (con el clic) en su recorrido
      const yMin = 140;
      const yMax = 330;
      if (P.down && P.x < 300) st.y = clamp((P.y - yMin) / (yMax - yMin), 0, 1);
      else st.y = Math.max(0, st.y - dt * 1.5);
      const dy = st.y - st.prevY;
      if (dy > 0.01 && P.down) {
        // (unas cinco bombeadas enteras)
        st.fuego = Math.min(1, st.fuego + dy * 0.3);
        if (Math.random() < 0.6) st.aire.push({ x: 280, y: 330, vx: 260 + Math.random() * 80, vy: -20 + Math.random() * 40, life: 0.5 });
        M.ruido('fuelle', 0.25);
      }
      st.prevY = st.y;
      st.fuego = Math.max(0.05, st.fuego - dt * 0.04);
      for (const a of st.aire) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.life -= dt;
      }
      st.aire = st.aire.filter((a) => a.life > 0);
      // (lleno: el que baja de a poco no lo deja en 1 justo)
      this.prog = st.fuego >= 0.98 ? 1 : st.fuego;
      if (st.fuego >= 0.98) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#1b1430', '#3a1e12');
      // las piedras del fogón
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        c.beginPath();
        c.ellipse(450 + Math.cos(a) * 120, 360 + Math.sin(a) * -18 + 10, 30, 18, 0, 0, TAU);
        c.fillStyle = '#6d6a66';
        c.fill();
        trazo(c, 3);
      }
      // la leña
      for (const [x, a] of [
        [450, -0.4],
        [450, 0.4],
      ]) {
        c.save();
        c.translate(x, 345);
        c.rotate(a);
        rr(c, -80, -12, 160, 24, 10);
        madera(c, -80, -12, 160, 24);
        trazo(c, 3);
        c.restore();
      }
      // las llamas
      const f = st.fuego;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const glow = c.createRadialGradient(450, 300, 10, 450, 300, 220 * (0.4 + f));
      glow.addColorStop(0, `rgba(255,140,40,${0.45 * f})`);
      glow.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);
      c.restore();
      for (let i = 0; i < 5; i++) llama(c, 400 + i * 25, 345, 0.6 + f * 2.2 * (1 - Math.abs(i - 2) * 0.18), t, i);
      // el fuelle: dos tablas abisagradas en la punta, el cuero en el medio
      const ab = 0.15 + (1 - st.y) * 0.45;
      c.save();
      c.translate(280, 330);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-200, -40 - ab * 120);
      c.lineTo(-200, 40);
      c.closePath();
      c.fillStyle = '#7a4a2a';
      c.fill();
      trazo(c, 3);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(-210, s < 0 ? -50 - ab * 120 : 46);
        c.lineTo(-220, s < 0 ? -30 - ab * 120 : 30);
        c.closePath();
        c.fillStyle = '#b07a42';
        c.fill();
        trazo(c, 3);
      }
      rr(c, -6, -8, 40, 16, 6);
      c.fillStyle = '#9a9aa2';
      c.fill();
      trazo(c, 3);
      c.restore();
      // el mango que se mueve
      const my = 140 + st.y * 190;
      rr(c, 60, my - 14, 90, 28, 12);
      c.fillStyle = '#d7a96a';
      c.fill();
      trazo(c, 3);
      for (const a of st.aire) {
        circ(c, a.x, a.y, 5 + (0.5 - a.life) * 18);
        c.fillStyle = `rgba(255,255,255,${0.35 * a.life})`;
        c.fill();
      }
      // el medidor
      rr(c, 590, 80, 26, 300, 12);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fill();
      const g = c.createLinearGradient(0, 380, 0, 80);
      g.addColorStop(0, '#ff6a1a');
      g.addColorStop(1, '#fff1b0');
      rr(c, 593, 377 - 294 * f, 20, 294 * f, 10);
      c.fillStyle = g;
      c.fill();
      rr(c, 590, 80, 26, 300, 12);
      trazo(c, 3);
    },
  };
}

function mate() {
  const BAND = [0.7, 0.86];
  const st = { nivel: 0.06, bien: 0, sorbo: 0, lava: 0, echando: false, msg: '', msgT: 0 };
  return {
    titulo: 'Cebar el mate',
    ayuda: 'Mantené para echar agua; soltá entre las rayas',
    prog: 0,
    step(dt, P, M) {
      if (st.msgT > 0) st.msgT -= dt;
      if (st.sorbo > 0) {
        // alguien se lo toma: el agua baja
        st.sorbo -= dt;
        st.nivel = Math.max(0.06, st.nivel - dt * 1.1);
        if (st.sorbo <= 0) M.ruido('sorbo', 0, 0.8);
        st.echando = false;
        return;
      }
      if (st.lava > 0) {
        st.lava -= dt;
        st.nivel = Math.max(0.06, st.nivel - dt * 0.9);
        st.echando = false;
        return;
      }
      st.echando = P.down;
      if (P.down) {
        st.nivel += dt * 0.3;
        M.ruido('agua', 0.12);
        if (st.nivel > 0.95) {
          st.lava = 1;
          st.msg = '¡Lavaste el mate!';
          st.msgT = 1.2;
          M.mal();
        }
      }
      if (P.released && st.nivel > 0.12) {
        if (st.nivel >= BAND[0] && st.nivel <= BAND[1]) {
          st.bien++;
          st.sorbo = 0.9;
          st.msg = ['¡Rico!', '¡Otro!', '¡Ese!'][st.bien - 1] || '';
          st.msgT = 0.9;
          M.bien();
        }
      }
      this.prog = st.bien / 3;
      if (st.bien >= 3) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#e8d4ae', '#b98d5c');
      c.fillStyle = 'rgba(90,50,20,0.35)';
      c.fillRect(0, 360, W, 120);
      // el mate (cortado, para ver el agua)
      const mx = 250;
      const my = 300;
      c.save();
      c.beginPath();
      c.moveTo(mx - 90, my - 120);
      c.bezierCurveTo(mx - 150, my - 40, mx - 140, my + 80, mx, my + 90);
      c.bezierCurveTo(mx + 140, my + 80, mx + 150, my - 40, mx + 90, my - 120);
      c.closePath();
      c.fillStyle = '#6b3d1e';
      c.fill();
      c.clip();
      // la yerba y el agua
      const top = my + 85;
      const alto = 205;
      c.fillStyle = '#6f8f2c';
      c.fillRect(mx - 160, top - alto * 0.55, 320, alto * 0.55 + 10);
      const yw = top - alto * st.nivel;
      const gw = c.createLinearGradient(0, yw, 0, top);
      gw.addColorStop(0, 'rgba(120,160,70,0.85)');
      gw.addColorStop(1, 'rgba(70,100,30,0.9)');
      c.fillStyle = gw;
      c.fillRect(mx - 160, yw, 320, top - yw);
      // la montañita, al costado
      c.beginPath();
      c.moveTo(mx - 150, top - alto * 0.55);
      c.quadraticCurveTo(mx - 60, top - alto * 1.0, mx + 10, top - alto * 0.6);
      c.lineTo(mx - 150, top - alto * 0.6);
      c.fillStyle = '#86a83a';
      c.fill();
      // las rayas de lo justo
      for (const k of BAND) {
        c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(mx - 150, top - alto * k);
        c.lineTo(mx + 150, top - alto * k);
        trazo(c, 3, '#fff6c8');
        c.setLineDash([]);
      }
      c.restore();
      // el borde y la virola
      c.beginPath();
      c.moveTo(mx - 90, my - 120);
      c.bezierCurveTo(mx - 150, my - 40, mx - 140, my + 80, mx, my + 90);
      c.bezierCurveTo(mx + 140, my + 80, mx + 150, my - 40, mx + 90, my - 120);
      trazo(c, 5);
      rr(c, mx - 96, my - 132, 192, 20, 8);
      c.fillStyle = '#c9c9d2';
      c.fill();
      trazo(c, 3);
      // la bombilla
      c.save();
      c.translate(mx + 50, my - 30);
      c.rotate(0.35);
      rr(c, -6, -200, 12, 230, 6);
      c.fillStyle = '#d8d8e2';
      c.fill();
      trazo(c, 3);
      c.restore();
      // la pava: se inclina al echar
      const ang = st.echando ? -0.75 : -0.15;
      c.save();
      c.translate(500, 150);
      c.rotate(ang);
      rr(c, -70, -50, 140, 100, 30);
      const gp = c.createLinearGradient(-70, -50, 70, 50);
      gp.addColorStop(0, '#9aa0a8');
      gp.addColorStop(1, '#4a4e56');
      c.fillStyle = gp;
      c.fill();
      trazo(c, 4);
      c.beginPath();
      c.moveTo(-60, 0);
      c.lineTo(-130, -30);
      c.lineTo(-124, -42);
      c.lineTo(-56, -20);
      c.closePath();
      c.fillStyle = '#7d828a';
      c.fill();
      trazo(c, 3);
      c.beginPath();
      c.arc(0, -50, 40, Math.PI, 0);
      trazo(c, 8, INK);
      trazo(c, 4, '#2c2c30');
      c.restore();
      // el chorro
      if (st.echando) {
        const sx = 500 + Math.cos(ang) * -127 - Math.sin(ang) * -36;
        const sy = 150 + Math.sin(ang) * -127 + Math.cos(ang) * -36;
        c.beginPath();
        c.moveTo(sx, sy);
        c.quadraticCurveTo(sx - 40, sy + 20, mx + 30, my - 110);
        trazo(c, 7, 'rgba(200,230,255,0.85)');
        humo(c, mx + 40, my - 120, t, 2);
      }
      for (let i = 0; i < 3; i++) {
        circ(c, 470 + i * 36, 420, 13);
        c.fillStyle = i < st.bien ? '#7ad957' : 'rgba(0,0,0,0.25)';
        c.fill();
        trazo(c, 3);
      }
      if (st.msgT > 0) texto(c, st.msg, 470, 300, 30, st.lava > 0 ? '#ff6a5a' : '#ffe9a0');
    },
  };
}

// arrastrar cosas a su lugar (leña, remedios, llaves): piezas con from, to y forma
function arrastre(cfg) {
  const st = { agarra: null, dx: 0, dy: 0 };
  const P0 = cfg.piezas;
  for (const q of P0) {
    q.x = q.x0;
    q.y = q.y0;
  }
  return {
    titulo: cfg.titulo,
    ayuda: cfg.ayuda,
    prog: 0,
    piezas: P0,
    step(dt, P, M) {
      if (P.pressed && !st.agarra) {
        for (let i = P0.length - 1; i >= 0; i--) {
          const q = P0[i];
          if (!q.ok && dist(P.x, P.y, q.x, q.y) < (q.r || 34)) {
            st.agarra = q;
            st.dx = q.x - P.x;
            st.dy = q.y - P.y;
            P0.splice(i, 1);
            P0.push(q);
            M.ruido('agarra', 0, 0.6);
            break;
          }
        }
      }
      const q = st.agarra;
      if (q) {
        q.x = P.x + st.dx;
        q.y = P.y + st.dy;
        if (P.released || !P.down) {
          const dest = cfg.destino(q, P0);
          if (dest) {
            q.ok = true;
            q.tx = dest.x;
            q.ty = dest.y;
            M.bien();
          } else {
            q.vuelve = true;
            if (cfg.mal?.(q)) M.mal();
          }
          st.agarra = null;
        }
      }
      for (const p of P0) {
        if (p.ok) {
          p.x += (p.tx - p.x) * Math.min(1, dt * 14);
          p.y += (p.ty - p.y) * Math.min(1, dt * 14);
        } else if (p.vuelve && p !== st.agarra) {
          p.x += (p.x0 - p.x) * Math.min(1, dt * 10);
          p.y += (p.y0 - p.y) * Math.min(1, dt * 10);
          if (dist(p.x, p.y, p.x0, p.y0) < 1) p.vuelve = false;
        }
      }
      const n = cfg.cuantas ?? P0.length;
      this.prog = P0.filter((p) => p.ok).length / n;
      if (this.prog >= 1) this.done = true;
    },
    draw(c, P, t) {
      cfg.fondo(c, t, P0);
      for (const p of P0) cfg.pieza(c, p, p === st.agarra, t);
    },
  };
}

function lena(r) {
  const carro = { x: 450, y: 300, w: 230, h: 120 };
  const piezas = Array.from({ length: 5 }, (_, i) => ({ x0: 110 + (i % 3) * 52 + (i > 2 ? 26 : 0), y0: 360 - (i > 2 ? 46 : 0), a: (r() - 0.5) * 0.3, r: 40 }));
  let n = 0;
  return arrastre({
    titulo: 'Cargar leña',
    ayuda: 'Llevá los troncos a la carretilla',
    piezas,
    destino(q) {
      if (q.x > carro.x - carro.w / 2 && q.x < carro.x + carro.w / 2 && q.y > carro.y - carro.h && q.y < carro.y + 30) {
        const k = n++;
        return { x: carro.x - 70 + (k % 3) * 56, y: carro.y - 22 - Math.floor(k / 3) * 34 };
      }
      return null;
    },
    fondo(c) {
      fondo(c, '#7aa6c8', '#c9b07a');
      c.fillStyle = '#7d9b4a';
      c.fillRect(0, 300, W, 180);
      // la carretilla
      c.save();
      c.translate(carro.x, carro.y);
      c.beginPath();
      c.moveTo(-120, -60);
      c.lineTo(120, -60);
      c.lineTo(90, 40);
      c.lineTo(-90, 40);
      c.closePath();
      c.fillStyle = '#5f7f9a';
      c.fill();
      trazo(c, 4);
      circ(c, 0, 66, 28);
      c.fillStyle = '#2c2c30';
      c.fill();
      trazo(c, 4);
      c.beginPath();
      c.moveTo(110, -20);
      c.lineTo(190, 30);
      c.lineCap = 'round';
      trazo(c, 12, INK);
      trazo(c, 7, '#8a5a32');
      c.lineCap = 'butt';
      c.restore();
    },
    pieza(c, p) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      rr(c, -48, -16, 96, 32, 14);
      madera(c, -48, -16, 96, 32);
      trazo(c, 3);
      c.beginPath();
      c.ellipse(44, 0, 9, 15, 0, 0, TAU);
      c.fillStyle = '#d7a96a';
      c.fill();
      trazo(c, 2.5);
      circ(c, 44, 0, 4);
      trazo(c, 1.5, '#8a5a32');
      c.restore();
    },
  });
}

function yerba(r) {
  const bolsa = { x: 520, y: 330 };
  const rama = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    rama.push({ x0: 120 + t * 300 + (r() - 0.5) * 30, y0: 150 + Math.sin(t * 3) * 40 + (i % 2 ? 40 : -30), seca: i === 2 || i === 6 || i === 9, a: (r() - 0.5) * 1.2, r: 30 });
  }
  const juntar = arrastre({
    titulo: 'Cosechar yerba',
    ayuda: 'Juntá las hojas verdes en la bolsa',
    piezas: rama,
    cuantas: rama.filter((h) => !h.seca).length,
    destino(q) {
      if (!q.seca && dist(q.x, q.y, bolsa.x, bolsa.y - 20) < 80) return { x: bolsa.x + (Math.random() - 0.5) * 50, y: bolsa.y - 40 + (Math.random() - 0.5) * 20 };
      return null;
    },
    mal: (q) => q.seca && dist(q.x, q.y, bolsa.x, bolsa.y - 20) < 80,
    fondo(c) {
      fondo(c, '#9cc6e0', '#5f8a3c');
      // la planta de yerba
      c.beginPath();
      c.moveTo(80, 420);
      c.bezierCurveTo(160, 260, 300, 120, 460, 160);
      trazo(c, 14, INK);
      trazo(c, 9, '#6b4a2a');
      // la bolsa (la arpillera)
      c.beginPath();
      c.moveTo(bolsa.x - 70, bolsa.y - 60);
      c.lineTo(bolsa.x + 70, bolsa.y - 60);
      c.lineTo(bolsa.x + 90, bolsa.y + 90);
      c.lineTo(bolsa.x - 90, bolsa.y + 90);
      c.closePath();
      c.fillStyle = '#c9a66b';
      c.fill();
      trazo(c, 4);
      c.beginPath();
      c.ellipse(bolsa.x, bolsa.y - 60, 70, 16, 0, 0, TAU);
      c.fillStyle = '#5a4020';
      c.fill();
      trazo(c, 3);
    },
    pieza(c, p) {
      if (p.ok) return;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      c.beginPath();
      c.moveTo(-26, 0);
      c.quadraticCurveTo(0, -20, 26, 0);
      c.quadraticCurveTo(0, 20, -26, 0);
      c.fillStyle = p.seca ? '#9a7a3a' : '#4f9a2c';
      c.fill();
      trazo(c, 2.5);
      c.beginPath();
      c.moveTo(-22, 0);
      c.lineTo(22, 0);
      trazo(c, 1.5, p.seca ? '#5a4a20' : '#2f6a1a');
      c.restore();
    },
  });
  // el mortero: moler lo juntado
  const mo = { x: 320, y: 300 };
  const st = { last: null, ang: 0, paso: 0 };
  return {
    juntar,
    mo,
    titulo: 'Cosechar yerba',
    ayuda: juntar.ayuda,
    prog: 0,
    step(dt, P, M) {
      if (st.paso === 0) {
        juntar.step(dt, P, M);
        this.prog = juntar.prog * 0.5;
        if (juntar.done) {
          st.paso = 1;
          this.titulo = 'Moler la yerba';
          this.ayuda = 'Molé en el mortero: dos vueltas';
          M.bien();
        }
        return;
      }
      const da = giro(st, P, mo.x, mo.y - 30, 10, 130);
      st.ang += da;
      if (Math.abs(da) > 0.02) M.ruido('moler', 0.2);
      const k = clamp(Math.abs(st.ang) / (2 * TAU), 0, 1);
      this.prog = 0.5 + k * 0.5;
      if (k >= 1) this.done = true;
    },
    draw(c, P, t) {
      if (st.paso === 0) return juntar.draw(c, P, t);
      fondo(c, '#e8d4ae', '#b98d5c');
      const k = clamp(Math.abs(st.ang) / (2 * TAU), 0, 1);
      // el mortero de madera
      c.beginPath();
      c.ellipse(mo.x, mo.y - 30, 150, 46, 0, 0, TAU);
      c.fillStyle = '#5a3618';
      c.fill();
      trazo(c, 4);
      c.beginPath();
      c.moveTo(mo.x - 150, mo.y - 30);
      c.bezierCurveTo(mo.x - 140, mo.y + 110, mo.x + 140, mo.y + 110, mo.x + 150, mo.y - 30);
      c.fillStyle = '#8a5a32';
      c.fill();
      trazo(c, 4);
      // adentro: de hojas a yerba molida
      c.beginPath();
      c.ellipse(mo.x, mo.y - 26, 132, 36, 0, 0, TAU);
      c.fillStyle = k < 1 ? `rgb(${Math.round(79 + k * 60)},${Math.round(154 - k * 10)},${Math.round(44 + k * 20)})` : '#8fa64a';
      c.fill();
      for (let i = 0; i < 14 * (1 - k); i++) {
        const a = i * 2.4 + st.ang * 0.4;
        circ(c, mo.x + Math.cos(a) * 90, mo.y - 26 + Math.sin(a) * 22, 7);
        c.fillStyle = '#3f7a20';
        c.fill();
      }
      // el palo de moler, en la mano
      const px = P.down ? P.x : mo.x + 40;
      const py = P.down ? P.y : mo.y - 40;
      c.save();
      c.translate(px, py);
      c.rotate(-0.4);
      rr(c, -16, -170, 32, 180, 16);
      madera(c, -16, -170, 32, 180, '#b07a42');
      trazo(c, 3);
      c.restore();
    },
  };
}

function bote() {
  const poste = { x: 300, y: 250 };
  const paso = [
    { x: 230, y: 180 },
    { x: 370, y: 180 },
    { x: 230, y: 320 },
    { x: 370, y: 320 },
  ];
  const st = { k: 0, agarra: false, x: 540, y: 300, cuerda: [{ x: 600, y: 300 }], tira: false };
  return {
    titulo: 'Amarrar el bote',
    ayuda: 'Pasá la soga por los puntos alrededor del poste',
    prog: 0,
    step(dt, P, M) {
      if (P.pressed && dist(P.x, P.y, st.x, st.y) < 40) st.agarra = true;
      if (!P.down) st.agarra = false;
      if (st.agarra) {
        st.x = clamp(P.x, 30, W - 30);
        st.y = clamp(P.y, 60, H - 40);
        if (st.k < paso.length && dist(st.x, st.y, paso[st.k].x, paso[st.k].y) < 30) {
          st.cuerda.push({ ...paso[st.k] });
          st.k++;
          M.ruido('agarra', 0, 0.7);
          if (st.k === paso.length) st.tira = true;
        }
        if (st.tira && st.x > 520) this.done = true;
      }
      this.prog = (st.k + (st.tira ? clamp((st.x - 370) / 150, 0, 1) : 0)) / (paso.length + 1);
    },
    draw(c, P, t) {
      fondo(c, '#2f6f8f', '#173a52');
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.moveTo(0, 90 + i * 50 + Math.sin(t + i) * 4);
        for (let x = 0; x <= W; x += 40) c.lineTo(x, 90 + i * 50 + Math.sin(t * 1.5 + x / 60 + i) * 5);
        trazo(c, 2, 'rgba(255,255,255,0.12)');
      }
      // el muelle
      rr(c, 120, 120, 360, 260, 10);
      c.fillStyle = '#8a5a32';
      c.fill();
      trazo(c, 4);
      for (let i = 1; i < 8; i++) {
        c.beginPath();
        c.moveTo(120, 120 + i * 32.5);
        c.lineTo(480, 120 + i * 32.5);
        trazo(c, 2, 'rgba(0,0,0,0.3)');
      }
      // la proa del bote
      c.beginPath();
      c.moveTo(W, 230);
      c.quadraticCurveTo(560, 300, W, 380);
      c.fillStyle = '#b8462e';
      c.fill();
      trazo(c, 4);
      // el poste
      circ(c, poste.x, poste.y, 34);
      c.fillStyle = '#5a5a60';
      c.fill();
      trazo(c, 4);
      circ(c, poste.x, poste.y, 18);
      c.fillStyle = '#7a7a82';
      c.fill();
      trazo(c, 3);
      // los puntos que faltan
      for (let i = st.k; i < paso.length; i++) {
        c.setLineDash([6, 6]);
        circ(c, paso[i].x, paso[i].y, 22);
        trazo(c, 3, i === st.k ? '#ffe9a0' : 'rgba(255,255,255,0.3)');
        c.setLineDash([]);
        if (i === st.k) texto(c, String(i + 1), paso[i].x, paso[i].y, 18, '#ffe9a0');
      }
      // la soga
      c.beginPath();
      c.moveTo(st.cuerda[0].x, st.cuerda[0].y);
      for (const q of st.cuerda) c.lineTo(q.x, q.y);
      c.lineTo(st.x, st.y);
      c.lineJoin = 'round';
      trazo(c, 12, INK);
      trazo(c, 8, '#d8b66a');
      c.lineJoin = 'miter';
      circ(c, st.x, st.y, 12);
      c.fillStyle = '#e8c87a';
      c.fill();
      trazo(c, 3);
      if (st.tira) texto(c, '¡Tirá!', 560, 160, 30, '#ffe9a0');
    },
  };
}

function red(r) {
  const n = 7;
  const cx = 320;
  const cy = 240;
  const nudos = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + (r() - 0.5) * 0.3;
    const d = 90 + r() * 30;
    return { x: cx + Math.cos(a) * d * 1.3, y: cy + Math.sin(a) * d };
  });
  const st = { k: 0, tira: false };
  return {
    nudos,
    titulo: 'Remendar la red',
    ayuda: 'Uní los nudos en orden',
    prog: 0,
    step(dt, P, M) {
      const a = nudos[st.k];
      if (P.pressed && dist(P.x, P.y, a.x, a.y) < 24) st.tira = true;
      if (st.tira && !P.down) st.tira = false;
      if (st.tira) {
        const b = nudos[(st.k + 1) % n];
        if (dist(P.x, P.y, b.x, b.y) < 22) {
          st.k++;
          M.ruido('agarra', 0, 0.8);
          if (st.k >= n) this.done = true;
        }
      }
      this.prog = st.k / n;
    },
    draw(c, P, t) {
      fondo(c, '#cfd9df', '#8fa1ac');
      // la red: rombos, menos en el agujero
      c.save();
      for (let i = -12; i < 24; i++) {
        c.beginPath();
        for (let x = -40; x <= W + 40; x += 8) {
          const y = i * 36 + x * 0.55;
          const inHole = ((x - cx) / 1.3) ** 2 + (y - cy) ** 2 < 100 ** 2;
          if (inHole) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        trazo(c, 2.5, '#5a4a3a');
        c.beginPath();
        for (let x = -40; x <= W + 40; x += 8) {
          const y = i * 36 - x * 0.55 + 300;
          const inHole = ((x - cx) / 1.3) ** 2 + (y - cy) ** 2 < 100 ** 2;
          if (inHole) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        trazo(c, 2.5, '#5a4a3a');
      }
      c.restore();
      // lo cosido
      c.beginPath();
      for (let i = 0; i <= st.k && i < n + 1; i++) {
        const q = nudos[i % n];
        if (i === 0) c.moveTo(q.x, q.y);
        else c.lineTo(q.x, q.y);
      }
      trazo(c, 5, '#e8c87a');
      if (st.tira) {
        const q = nudos[st.k % n];
        c.beginPath();
        c.moveTo(q.x, q.y);
        c.lineTo(P.x, P.y);
        trazo(c, 4, 'rgba(232,200,122,0.8)');
      }
      nudos.forEach((q, i) => {
        circ(c, q.x, q.y, 14);
        c.fillStyle = i < st.k ? '#7ad957' : i === st.k % n ? '#ffe9a0' : '#f5efe4';
        c.fill();
        trazo(c, 3);
        texto(c, String(i + 1), q.x, q.y + 1, 14, INK);
      });
    },
  };
}

function tablero(r) {
  const cols = ['#e3262c', '#2f6fd8', '#f2c230', '#f2f2f2'];
  const der = [0, 1, 2, 3].sort(() => r() - 0.5);
  const ys = [120, 200, 280, 360];
  const st = { tira: -1, ok: [false, false, false, false] };
  return {
    der,
    ys,
    titulo: 'Arreglar el tablero',
    ayuda: 'Empalmá cada cable con su color',
    prog: 0,
    step(dt, P, M) {
      if (P.pressed) for (let i = 0; i < 4; i++) if (!st.ok[i] && dist(P.x, P.y, 96, ys[i]) < 26) st.tira = i;
      if (st.tira >= 0 && !P.down) {
        const j = der.indexOf(st.tira);
        if (dist(P.x, P.y, 544, ys[j]) < 30) {
          st.ok[st.tira] = true;
          M.bien();
          M.chispa = { x: 544, y: ys[j], t: 0.4 };
        } else M.ruido('agarra', 0, 0.5);
        st.tira = -1;
      }
      this.prog = st.ok.filter(Boolean).length / 4;
      if (this.prog >= 1) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#5a6068', '#3a3e44');
      rr(c, 40, 50, 560, 380, 18);
      c.fillStyle = '#6d747c';
      c.fill();
      trazo(c, 5);
      for (const [x, y] of [
        [62, 72],
        [578, 72],
        [62, 408],
        [578, 408],
      ]) {
        circ(c, x, y, 8);
        c.fillStyle = '#a0a6ae';
        c.fill();
        trazo(c, 2);
      }
      for (let i = 0; i < 4; i++) {
        // los cables de la izquierda
        rr(c, 40, ys[i] - 12, 60, 24, 6);
        c.fillStyle = cols[i];
        c.fill();
        trazo(c, 3);
        const j = der.indexOf(i);
        rr(c, 540, ys[j] - 12, 60, 24, 6);
        c.fillStyle = cols[i];
        c.fill();
        trazo(c, 3);
        const pin = (x, y) => {
          rr(c, x - 8, y - 8, 16, 16, 3);
          c.fillStyle = '#d8c070';
          c.fill();
          trazo(c, 2);
        };
        pin(100, ys[i]);
        pin(540, ys[j]);
        if (st.ok[i] || st.tira === i) {
          const ex = st.ok[i] ? 540 : P.x;
          const ey = st.ok[i] ? ys[j] : P.y;
          c.beginPath();
          c.moveTo(100, ys[i]);
          c.bezierCurveTo(260, ys[i], 380, ey, ex, ey);
          c.lineCap = 'round';
          trazo(c, 16, INK);
          trazo(c, 11, cols[i]);
          c.lineCap = 'butt';
        }
      }
    },
  };
}

function canillas() {
  const C = [160, 320, 480].map((x) => ({ x, y: 190, ang: 0, last: null, ok: false, gotas: [] }));
  return {
    titulo: 'Cerrar las canillas',
    ayuda: 'Girá cada llave hasta que deje de gotear',
    prog: 0,
    step(dt, P, M) {
      for (const q of C) {
        if (q.ok) continue;
        const da = giro(q, P, q.x, q.y, 6, 70);
        q.ang += da;
        if (Math.abs(da) > 0.02) M.ruido('canilla', 0.25);
        if (Math.abs(q.ang) >= TAU * 1.2) {
          q.ok = true;
          M.bien();
        }
        q.t = (q.t || 0) - dt;
        if (q.t <= 0) {
          q.t = 0.35 - Math.min(0.3, Math.abs(q.ang) / 20);
          q.gotas.push({ y: 0 });
        }
      }
      for (const q of C) {
        for (const d of q.gotas) d.y += dt * 320;
        q.gotas = q.gotas.filter((d) => d.y < 200);
      }
      this.prog = C.filter((q) => q.ok).length / C.length;
      if (this.prog >= 1) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#e9eef0', '#c4ced4');
      // los azulejos
      for (let y = 0; y < H; y += 40)
        for (let x = (y / 40) % 2 ? 20 : 0; x < W; x += 40) {
          c.strokeStyle = 'rgba(80,110,130,0.18)';
          c.lineWidth = 2;
          c.strokeRect(x, y, 40, 40);
        }
      c.fillStyle = '#9fb6c4';
      c.fillRect(0, 90, W, 26);
      for (const q of C) {
        // el caño y la canilla
        rr(c, q.x - 10, 100, 20, 70, 6);
        c.fillStyle = '#c7a24a';
        c.fill();
        trazo(c, 3);
        rr(c, q.x - 12, 220, 70, 24, 10);
        c.fillStyle = '#c7a24a';
        c.fill();
        trazo(c, 3);
        rr(c, q.x + 46, 220, 18, 40, 6);
        c.fillStyle = '#b08a3a';
        c.fill();
        trazo(c, 3);
        // la llave en cruz, girada
        c.save();
        c.translate(q.x, q.y);
        c.rotate(q.ang);
        for (let k = 0; k < 4; k++) {
          c.rotate(Math.PI / 2);
          rr(c, -9, -52, 18, 52, 9);
          c.fillStyle = '#d8b65a';
          c.fill();
          trazo(c, 3);
        }
        circ(c, 0, 0, 16);
        c.fillStyle = q.ok ? '#7ad957' : '#e3262c';
        c.fill();
        trazo(c, 3);
        c.restore();
        if (!q.ok)
          for (const d of q.gotas) {
            c.beginPath();
            c.ellipse(q.x + 55, 262 + d.y, 6, 9, 0, 0, TAU);
            c.fillStyle = 'rgba(70,140,220,0.8)';
            c.fill();
          }
      }
      // el balde
      rr(c, 60, 400, 520, 60, 12);
      c.fillStyle = '#6d8a9a';
      c.fill();
      trazo(c, 4);
    },
  };
}

function rejas() {
  const B = Array.from({ length: 6 }, (_, i) => ({ x: 120 + i * 80, g: 0 }));
  const st = { py: null };
  return {
    titulo: 'Engrasar las rejas',
    ayuda: 'Frotá el trapo arriba y abajo por cada barrote',
    prog: 0,
    step(dt, P, M) {
      if (P.down) {
        if (st.py != null) {
          const dy = Math.abs(P.y - st.py);
          for (const b of B) {
            if (b.g < 1 && Math.abs(P.x - b.x) < 22 && P.y > 70 && P.y < 420) {
              b.g = Math.min(1, b.g + dy / 900);
              if (dy > 1) M.ruido('frota', 0.15);
              if (b.g >= 1) M.bien();
            }
          }
        }
        st.py = P.y;
      } else st.py = null;
      this.prog = B.reduce((a, b) => a + b.g, 0) / B.length;
      if (B.every((b) => b.g >= 1)) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#7a7068', '#4a423c');
      for (let y = 0; y < H; y += 46)
        for (let x = (y / 46) % 2 ? 0 : 50; x < W; x += 100) {
          rr(c, x + 2, y + 2, 96, 42, 6);
          c.fillStyle = 'rgba(0,0,0,0.12)';
          c.fill();
        }
      rr(c, 70, 60, 500, 22, 6);
      c.fillStyle = '#3a3a3e';
      c.fill();
      trazo(c, 3);
      rr(c, 70, 410, 500, 22, 6);
      c.fillStyle = '#3a3a3e';
      c.fill();
      trazo(c, 3);
      for (const b of B) {
        const k = b.g;
        const col = `rgb(${Math.round(150 - k * 110)},${Math.round(80 - k * 40)},${Math.round(40 - k * 5)})`;
        rr(c, b.x - 12, 70, 24, 350, 10);
        c.fillStyle = col;
        c.fill();
        trazo(c, 3);
        if (k > 0.2) {
          rr(c, b.x - 6, 80, 5, 330, 3);
          c.fillStyle = `rgba(255,255,255,${0.35 * k})`;
          c.fill();
        }
        // óxido que queda
        for (let i = 0; i < 6 * (1 - k); i++) {
          circ(c, b.x + Math.sin(i * 3 + b.x) * 6, 110 + i * 50, 5);
          c.fillStyle = '#c0682a';
          c.fill();
        }
      }
      // el trapo con grasa
      c.save();
      c.translate(P.x, P.y);
      c.rotate(0.3);
      c.beginPath();
      c.moveTo(-26, -18);
      c.quadraticCurveTo(0, -30, 26, -16);
      c.quadraticCurveTo(34, 10, 18, 22);
      c.quadraticCurveTo(-10, 30, -24, 16);
      c.closePath();
      c.fillStyle = '#d7c49a';
      c.fill();
      trazo(c, 3);
      circ(c, 4, 4, 9);
      c.fillStyle = 'rgba(40,30,10,0.55)';
      c.fill();
      c.restore();
    },
  };
}

function remedios(r) {
  const tipos = ['frasco', 'botella', 'caja', 'gotero'];
  const huecos = tipos.map((tipo, i) => ({ tipo, x: 130 + i * 128, y: 150 }));
  const orden = [...tipos].sort(() => r() - 0.5);
  const piezas = orden.map((tipo, i) => ({ tipo, x0: 150 + i * 112 + (r() - 0.5) * 20, y0: 370 + (r() - 0.5) * 20, r: 44 }));
  const forma = (c, tipo, sil) => {
    const f = sil ? 'rgba(0,0,0,0.28)' : null;
    c.beginPath();
    if (tipo === 'frasco') {
      circ(c, 0, 10, 34);
      c.rect(-12, -46, 24, 26);
    } else if (tipo === 'botella') {
      rr(c, -20, -20, 40, 76, 10);
      c.rect(-9, -56, 18, 38);
    } else if (tipo === 'caja') {
      rr(c, -38, -22, 76, 50, 6);
    } else {
      rr(c, -16, -6, 32, 46, 8);
      c.ellipse(0, -18, 10, 14, 0, 0, TAU);
    }
    c.fillStyle = f || { frasco: '#5fa0d8', botella: '#8a4a1e', caja: '#f2f0ea', gotero: '#d89a2a' }[tipo];
    c.fill();
    if (!sil) trazo(c, 3);
    else {
      c.setLineDash([6, 6]);
      trazo(c, 2.5, 'rgba(255,255,255,0.5)');
      c.setLineDash([]);
    }
  };
  return arrastre({
    titulo: 'Ordenar los remedios',
    ayuda: 'Cada remedio en su lugar del estante',
    piezas,
    destino(q) {
      const h = huecos.find((h) => h.tipo === q.tipo && dist(q.x, q.y, h.x, h.y) < 55);
      return h ? { x: h.x, y: h.y } : null;
    },
    mal: (q) => huecos.some((h) => h.tipo !== q.tipo && dist(q.x, q.y, h.x, h.y) < 55),
    fondo(c) {
      fondo(c, '#e6ddc8', '#bfae8a');
      // el estante
      rr(c, 50, 215, 540, 22, 6);
      madera(c, 50, 215, 540, 22);
      trazo(c, 3);
      for (const h of huecos) {
        c.save();
        c.translate(h.x, h.y);
        forma(c, h.tipo, true);
        c.restore();
      }
      // la caja de abajo
      rr(c, 90, 320, 460, 130, 12);
      madera(c, 90, 320, 460, 130, '#9a6a3a');
      trazo(c, 4);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      rr(c, 270, 300, 100, 28, 6);
      c.fill();
      trazo(c, 2.5);
      texto(c, '+', 320, 314, 20, '#e3262c');
    },
    pieza(c, p) {
      c.save();
      c.translate(p.x, p.y);
      forma(c, p.tipo, false);
      c.restore();
    },
  });
}

function velas() {
  const V = Array.from({ length: 5 }, (_, i) => ({ x: 150 + i * 85, y: 250 - (i % 2) * 30, h: 70 + (i % 3) * 18, ok: false }));
  const caja = { x: 90, y: 400 };
  const st = { fosforo: false, prendido: false, dura: 0, rasca: 0, px: null };
  return {
    titulo: 'Prender las velas',
    ayuda: 'Rascá el fósforo en la caja y prendé cada vela',
    prog: 0,
    step(dt, P, M) {
      if (P.pressed && !st.fosforo && dist(P.x, P.y, caja.x, caja.y) < 60) {
        st.fosforo = true;
        st.prendido = false;
        st.rasca = 0;
      }
      if (!st.fosforo) return;
      // rascar: moverlo rápido sobre la lija de la caja
      if (!st.prendido && P.down && Math.abs(P.y - (caja.y - 30)) < 26 && Math.abs(P.x - caja.x) < 70 && st.px != null) {
        st.rasca += Math.abs(P.x - st.px);
        if (st.rasca > 160) {
          st.prendido = true;
          st.dura = 9;
          M.ruido('fosforo', 0, 1);
        }
      }
      st.px = P.x;
      if (st.prendido) {
        st.dura -= dt;
        for (const v of V) {
          if (!v.ok && dist(P.x, P.y - 34, v.x, v.y - v.h - 10) < 22) {
            v.ok = true;
            M.bien();
          }
        }
        if (st.dura <= 0) st.fosforo = false;
      }
      this.prog = V.filter((v) => v.ok).length / V.length;
      if (this.prog >= 1) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#3a2a40', '#1c1420');
      for (const v of V) {
        if (v.ok) {
          c.save();
          c.globalCompositeOperation = 'lighter';
          const g = c.createRadialGradient(v.x, v.y - v.h - 20, 2, v.x, v.y - v.h - 20, 90);
          g.addColorStop(0, 'rgba(255,190,90,0.45)');
          g.addColorStop(1, 'rgba(255,120,30,0)');
          c.fillStyle = g;
          c.fillRect(v.x - 100, v.y - v.h - 120, 200, 200);
          c.restore();
        }
      }
      // el candelabro
      rr(c, 90, 250, 460, 16, 6);
      c.fillStyle = '#b08a3a';
      c.fill();
      trazo(c, 3);
      for (const v of V) {
        rr(c, v.x - 16, v.y - v.h, 32, v.h, 6);
        c.fillStyle = '#f2ead2';
        c.fill();
        trazo(c, 3);
        c.beginPath();
        c.moveTo(v.x, v.y - v.h);
        c.lineTo(v.x, v.y - v.h - 10);
        trazo(c, 3);
        if (v.ok) llama(c, v.x, v.y - v.h - 8, 0.55, t, v.x);
      }
      // la caja de fósforos con su lija
      rr(c, caja.x - 70, caja.y - 40, 140, 60, 6);
      c.fillStyle = '#e3262c';
      c.fill();
      trazo(c, 3);
      rr(c, caja.x - 66, caja.y - 42, 132, 12, 3);
      c.fillStyle = '#5a3a22';
      c.fill();
      texto(c, 'FÓSFOROS', caja.x, caja.y - 8, 13, '#f5efe4');
      // el fósforo en la mano
      if (st.fosforo) {
        c.save();
        c.translate(P.x, P.y);
        c.rotate(-0.2);
        rr(c, -3, -30, 6, 44, 3);
        c.fillStyle = '#e8c87a';
        c.fill();
        trazo(c, 2);
        circ(c, 0, -32, 6);
        c.fillStyle = '#7a1a10';
        c.fill();
        trazo(c, 2);
        if (st.prendido) llama(c, 0, -34, 0.35 * clamp(st.dura / 3, 0.4, 1), t, 9);
        c.restore();
      }
    },
  };
}

function papeles(r) {
  const st = { n: 0, x: -300, caja: null, sello: [], mal: 0 };
  const nueva = () => {
    st.x = -320;
    st.caja = { x: 230 + r() * 180, y: 170 + r() * 160 };
    st.sello = [];
  };
  nueva();
  return {
    st,
    titulo: 'Sellar los papeles',
    ayuda: 'Sellá adentro del cuadro de APROBADO',
    prog: 0,
    step(dt, P, M) {
      st.mal = Math.max(0, st.mal - dt);
      const quiere = st.sello.length && st.sello[0].ok ? 900 : 320;
      st.x += (quiere - st.x) * Math.min(1, dt * 7);
      if (st.sello.length && st.sello[0].ok && st.x > 800) {
        st.n++;
        if (st.n >= 4) this.done = true;
        else nueva();
      }
      if (P.pressed && Math.abs(st.x - 320) < 20 && !(st.sello[0]?.ok)) {
        const bx = st.caja.x - 320 + st.x;
        const ok = Math.abs(P.x - bx) < 62 && Math.abs(P.y - st.caja.y) < 30;
        st.sello.push({ x: P.x - st.x, y: P.y, ok, a: (Math.random() - 0.5) * 0.3 });
        if (ok) {
          M.ruido('sello', 0, 1);
          st.sello = [st.sello[st.sello.length - 1]];
        } else {
          st.mal = 0.4;
          M.mal();
        }
      }
      this.prog = st.n / 4;
    },
    draw(c, P, t) {
      fondo(c, '#6b4428', '#3e2614');
      const sx = st.x + (st.mal ? Math.sin(t * 60) * 6 : 0);
      c.save();
      c.translate(sx - 320, 0);
      rr(c, 160, 60, 320, 380, 6);
      c.fillStyle = '#f4efe0';
      c.fill();
      trazo(c, 3);
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        c.moveTo(190, 110 + i * 34);
        c.lineTo(450 - (i % 3) * 40, 110 + i * 34);
        trazo(c, 3, 'rgba(60,60,80,0.25)');
      }
      texto(c, 'PENAL · ISLA', 320, 84, 16, '#3a3a50');
      rr(c, st.caja.x - 62, st.caja.y - 30, 124, 60, 4);
      c.setLineDash([7, 5]);
      trazo(c, 3, '#3a3a50');
      c.setLineDash([]);
      for (const s of st.sello) {
        c.save();
        c.translate(s.x + 320, s.y);
        c.rotate(s.a);
        rr(c, -58, -24, 116, 48, 6);
        trazo(c, 4, s.ok ? 'rgba(200,30,30,0.85)' : 'rgba(200,30,30,0.5)');
        c.font = '900 20px "Archivo Black", system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = s.ok ? 'rgba(200,30,30,0.85)' : 'rgba(200,30,30,0.5)';
        c.fillText('APROBADO', 0, 1);
        c.restore();
      }
      c.restore();
      // el sello en la mano
      c.save();
      c.translate(P.x, P.y - (P.down ? 0 : 14));
      rr(c, -40, -8, 80, 18, 4);
      c.fillStyle = '#5a2a1a';
      c.fill();
      trazo(c, 3);
      rr(c, -14, -60, 28, 52, 10);
      madera(c, -14, -60, 28, 52, '#b07a42');
      trazo(c, 3);
      circ(c, 0, -66, 16);
      madera(c, -16, -82, 32, 32, '#b07a42');
      trazo(c, 3);
      c.restore();
      for (let i = 0; i < 4; i++) {
        circ(c, 560 + (i % 2) * 34, 380 + Math.floor(i / 2) * 34, 12);
        c.fillStyle = i < st.n ? '#7ad957' : 'rgba(0,0,0,0.25)';
        c.fill();
        trazo(c, 3);
      }
    },
  };
}

function pesas() {
  const st = { k: 0, v: 0.9, dir: 1, reps: 0, alza: 0, cae: 0 };
  const zona = () => [0.62 + st.reps * 0.03, 0.82 - st.reps * 0.04];
  return {
    st,
    zona,
    titulo: 'Levantar las pesas',
    ayuda: 'Hacé clic cuando la marca esté en lo verde',
    prog: 0,
    step(dt, P, M) {
      st.alza = Math.max(0, st.alza - dt);
      st.cae = Math.max(0, st.cae - dt);
      if (st.alza > 0 || st.cae > 0) return;
      st.k += st.dir * st.v * dt * (1 + st.reps * 0.35);
      if (st.k > 1) {
        st.k = 1;
        st.dir = -1;
      } else if (st.k < 0) {
        st.k = 0;
        st.dir = 1;
      }
      if (P.pressed) {
        const [a, b] = zona();
        if (st.k >= a && st.k <= b) {
          st.reps++;
          st.alza = 0.8;
          M.bien();
        } else {
          st.cae = 0.6;
          M.mal();
        }
      }
      this.prog = st.reps / 3;
      if (st.reps >= 3 && st.alza <= 0.01) this.done = true;
      if (st.reps >= 3) this.done = true;
    },
    draw(c, P, t) {
      fondo(c, '#c9b48a', '#8a6a44');
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, 380, W, 100);
      // la barra con los discos (sube al acertar, tiembla al errar)
      const up = st.alza > 0 ? Math.sin((1 - st.alza / 0.8) * Math.PI) : 0;
      const y = 330 - up * 170 + (st.cae ? Math.sin(t * 50) * 5 : 0);
      rr(c, 90, y - 8, 400, 16, 8);
      c.fillStyle = '#9aa0a8';
      c.fill();
      trazo(c, 3);
      for (const x of [110, 150, 430, 470]) {
        rr(c, x - 16, y - 60, 32, 120, 8);
        c.fillStyle = '#2c2c30';
        c.fill();
        trazo(c, 3);
      }
      // el medidor de fuerza
      const [a, b] = zona();
      rr(c, 560, 60, 36, 340, 14);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fill();
      rr(c, 562, 400 - 340 * b, 32, 340 * (b - a), 6);
      c.fillStyle = '#7ad957';
      c.fill();
      rr(c, 560, 60, 36, 340, 14);
      trazo(c, 3);
      const my = 400 - 340 * st.k;
      c.beginPath();
      c.moveTo(548, my);
      c.lineTo(530, my - 12);
      c.lineTo(530, my + 12);
      c.closePath();
      c.fillStyle = '#ffe9a0';
      c.fill();
      trazo(c, 3);
      for (let i = 0; i < 3; i++) {
        circ(c, 60, 80 + i * 40, 13);
        c.fillStyle = i < st.reps ? '#7ad957' : 'rgba(0,0,0,0.25)';
        c.fill();
        trazo(c, 3);
      }
    },
  };
}

function grilletes(r) {
  const formas = ['circulo', 'cuadrado', 'triangulo', 'estrella'];
  const locks = formas.map((f, i) => ({ f, x: 110 + i * 140, y: 170, abre: 0 }));
  const orden = [...formas].sort(() => r() - 0.5);
  const piezas = orden.map((f, i) => ({ f, x0: 170 + i * 100, y0: 390, r: 36 }));
  const icono = (c, f, x, y, s, col) => {
    c.beginPath();
    if (f === 'circulo') c.arc(x, y, s, 0, TAU);
    else if (f === 'cuadrado') c.rect(x - s, y - s, s * 2, s * 2);
    else if (f === 'triangulo') {
      c.moveTo(x, y - s);
      c.lineTo(x + s, y + s * 0.8);
      c.lineTo(x - s, y + s * 0.8);
      c.closePath();
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr2 = i % 2 ? s * 0.45 : s;
        c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      c.closePath();
    }
    c.fillStyle = col;
    c.fill();
    trazo(c, 2);
  };
  const juego = arrastre({
    titulo: 'Revisar los grilletes',
    ayuda: 'Abrí cada candado con su llave',
    piezas,
    destino(q) {
      const l = locks.find((l) => l.f === q.f && dist(q.x, q.y, l.x, l.y + 40) < 60);
      if (!l) return null;
      l.abre = 0.01;
      return { x: l.x, y: l.y + 40 };
    },
    mal: (q) => locks.some((l) => l.f !== q.f && dist(q.x, q.y, l.x, l.y + 40) < 60),
    fondo(c) {
      fondo(c, '#6a6460', '#3a3430');
      for (const l of locks) {
        if (l.abre > 0) l.abre = Math.min(1, l.abre + 0.06);
        // la cadena
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.ellipse(l.x, 20 + i * 22, 9, 13, i % 2 ? 0 : Math.PI / 2, 0, TAU);
          trazo(c, 5, '#8a8a92');
        }
        // el arco del candado (sube al abrirse)
        c.beginPath();
        c.arc(l.x, l.y - 20 - l.abre * 20, 30, Math.PI, 0);
        trazo(c, 12, INK);
        trazo(c, 8, '#a8a8b0');
        rr(c, l.x - 44, l.y - 20, 88, 80, 12);
        c.fillStyle = '#c79a3a';
        c.fill();
        trazo(c, 4);
        icono(c, l.f, l.x, l.y + 12, 13, l.abre > 0 ? '#7ad957' : '#3a2a10');
      }
      rr(c, 120, 350, 400, 80, 30);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fill();
    },
    pieza(c, p) {
      if (p.ok) return;
      c.save();
      c.translate(p.x, p.y);
      circ(c, 0, -22, 18);
      c.fillStyle = '#c9c9d2';
      c.fill();
      trazo(c, 3);
      rr(c, -5, -6, 10, 46, 4);
      c.fillStyle = '#c9c9d2';
      c.fill();
      trazo(c, 3);
      icono(c, p.f, 0, -22, 8, '#3a2a10');
      c.restore();
    },
  });
  juego.locks = locks;
  return juego;
}

const JUEGOS = { olla, fogon, mate, lena, yerba, bote, red, tablero, canilla: canillas, reja: rejas, remedios, velas, papeles, pesas, grilletes };

export default class PzMinijuegos {
  constructor(g) {
    this.g = g;
    this.on = null;
    // (pruebas: { x, y, down } en lugar del mouse)
    this.fake = null;
  }

  static hay(id) {
    return !globalThis.__mduTareasViejas && !!JUEGOS[id];
  }

  build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'mdu-pzmini';
    el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(8,5,3,0.5);opacity:0;transition:opacity .18s;pointer-events:none';
    const cv = document.createElement('canvas');
    cv.width = W * 2;
    cv.height = H * 2;
    cv.style.cssText = 'width:min(86vw,112vh);aspect-ratio:4/3;max-height:86vh;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.6),0 0 0 3px #1b130d,0 0 0 6px rgba(233,181,92,.55);transform:scale(.96);transition:transform .18s';
    el.appendChild(cv);
    el.hidden = true;
    (this.g.hud?.root?.parentNode || document.body).appendChild(el);
    this.el = el;
    this.cv = cv;
    this.c = cv.getContext('2d');
  }

  abierto() {
    return !!this.on;
  }

  // S: la tarea (pzTareas.st[i]); listo(): cuando sale bien
  open(S, listo) {
    if (this.on || !JUEGOS[S.id]) return false;
    const g = this.g;
    this.build();
    const seed = (Math.random() * 1e9) | 0;
    this.game = JUEGOS[S.id](azar(seed));
    this.on = { S, listo, t: 0, fin: -1 };
    this.P = { x: W / 2, y: H / 2, down: false, pressed: false, released: false };
    this.prev = !!g.input?.mouse?.left;
    this.wasLocked = !!g.input?.locked;
    this.ruidoT = {};
    g.menuOpen = true;
    g.hud?.setHint?.(null);
    this.el.hidden = false;
    requestAnimationFrame(() => {
      if (!this.el) return;
      this.el.style.opacity = '1';
      this.cv.style.transform = 'scale(1)';
    });
    g.audio?.click?.();
    return true;
  }

  close(ok) {
    const on = this.on;
    if (!on) return;
    const g = this.g;
    this.on = null;
    g.menuOpen = false;
    this.el.style.opacity = '0';
    this.cv.style.transform = 'scale(.96)';
    setTimeout(() => {
      if (!this.on && this.el) this.el.hidden = true;
    }, 200);
    if (ok) on.listo?.();
  }

  // Cada cuadro (pzTareas.update). can: sigue pudiendo hacer tareas.
  update(dt, can) {
    const on = this.on;
    if (!on) return false;
    const g = this.g;
    const lost = this.wasLocked && !g.input?.locked && !this.fake;
    if (!can || lost) {
      this.close(false);
      if (lost && g.state === 'playing') g.menus?.showClick?.(true);
      return false;
    }
    const P = this.P;
    let down;
    if (this.fake) {
      P.x = this.fake.x;
      P.y = this.fake.y;
      down = !!this.fake.down;
    } else {
      const r = this.cv.getBoundingClientRect();
      const k = r.width > 0 ? W / r.width : 1;
      P.x = clamp(P.x + (g.input.mouse.dx || 0) * k, 4, W - 4);
      P.y = clamp(P.y + (g.input.mouse.dy || 0) * k, 4, H - 4);
      down = !!g.input.mouse.left;
    }
    P.pressed = down && !this.prev;
    P.released = !down && this.prev;
    P.down = down;
    this.prev = down;
    on.t += dt;
    // la X de arriba a la derecha
    if (P.pressed && dist(P.x, P.y, W - 28, 28) < 20) {
      this.close(false);
      return false;
    }
    if (on.fin < 0) {
      this.game.step(dt, P, this);
      if (this.game.done) {
        on.fin = 0;
        this.listo();
      }
    } else {
      on.fin += dt;
      if (on.fin > 0.75) {
        this.close(true);
        return false;
      }
    }
    this.draw();
    return true;
  }

  draw() {
    const c = this.c;
    const on = this.on;
    const P = this.P;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, W, H);
    this.game.draw(c, P, on.t);
    if (this.chispa) {
      this.chispa.t -= 1 / 60;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8 + on.t * 9;
        c.beginPath();
        c.moveTo(this.chispa.x, this.chispa.y);
        c.lineTo(this.chispa.x + Math.cos(a) * 26, this.chispa.y + Math.sin(a) * 26);
        trazo(c, 3, '#fff1b0');
      }
      if (this.chispa.t <= 0) this.chispa = null;
    }
    // arriba: el nombre y lo que hay que hacer
    c.fillStyle = 'rgba(14,10,8,0.72)';
    c.fillRect(0, 0, W, 54);
    texto(c, this.game.titulo, 20, 20, 20, '#f5efe4', 'left');
    c.font = '600 14px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillStyle = 'rgba(245,239,228,0.85)';
    c.fillText(this.game.ayuda, 20, 42);
    // la X
    circ(c, W - 28, 28, 16);
    c.fillStyle = dist(P.x, P.y, W - 28, 28) < 20 ? '#ff5a4a' : 'rgba(255,90,74,0.75)';
    c.fill();
    trazo(c, 3);
    c.beginPath();
    c.moveTo(W - 34, 22);
    c.lineTo(W - 22, 34);
    c.moveTo(W - 22, 22);
    c.lineTo(W - 34, 34);
    trazo(c, 3.5, '#fff');
    barra(c, this.game.prog);
    if (on.fin >= 0) {
      const k = ease(clamp(on.fin / 0.3, 0, 1));
      c.fillStyle = `rgba(20,40,10,${0.35 * k})`;
      c.fillRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      texto(c, '¡Listo!', 0, 0, 64, '#9ff07a');
      c.restore();
    }
    // el cursor: una mano
    c.save();
    c.translate(P.x, P.y);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, 22);
    c.lineTo(6, 17);
    c.lineTo(11, 27);
    c.lineTo(15, 25);
    c.lineTo(10, 15);
    c.lineTo(17, 15);
    c.closePath();
    c.fillStyle = P.down ? '#ffe9a0' : '#ffffff';
    c.fill();
    trazo(c, 2.5);
    c.restore();
  }

  // ---------------- sonidos (cortos, sintetizados) ----------------
  ruido(tipo, cada = 0, gain = 1) {
    const a = this.g.audio;
    if (!a?.ctx || !a.out) return;
    const now = a.now ?? a.ctx.currentTime;
    if (cada && now - (this.ruidoT[tipo] || 0) < cada) return;
    this.ruidoT[tipo] = now;
    const o = a.out({ gain: 0.35 * gain, reverb: 0.05 });
    const N = {
      revolver: ['lowpass', 700, 0.18],
      fuelle: ['bandpass', 500, 0.22],
      agua: ['highpass', 2500, 0.12],
      sorbo: ['bandpass', 900, 0.3],
      moler: ['bandpass', 1800, 0.15],
      canilla: ['bandpass', 2400, 0.08],
      frota: ['bandpass', 3000, 0.1],
      fosforo: ['highpass', 3500, 0.3],
      sello: ['lowpass', 400, 0.12],
      agarra: ['bandpass', 1500, 0.06],
    }[tipo] || ['bandpass', 1200, 0.08];
    a.noise?.(o, { dur: N[2], type: N[0], freq: N[1], gain: 0.6 });
  }

  bien() {
    const a = this.g.audio;
    if (!a?.ctx || !a.tone) return;
    const o = a.out({ gain: 0.25, reverb: 0.1 });
    a.tone(o, { dur: 0.12, freq: 880, freqEnd: 1320, gain: 0.5 });
  }

  mal() {
    const a = this.g.audio;
    if (!a?.ctx || !a.tone) return;
    const o = a.out({ gain: 0.25, reverb: 0.05 });
    a.tone(o, { dur: 0.18, freq: 220, freqEnd: 150, gain: 0.5 });
  }

  listo() {
    const a = this.g.audio;
    if (!a?.ctx || !a.tone) return;
    const o = a.out({ gain: 0.3, reverb: 0.15 });
    a.tone(o, { dur: 0.12, freq: 660, freqEnd: 660, gain: 0.5 });
    a.tone(o, { dur: 0.22, freq: 990, freqEnd: 1320, gain: 0.5, when: 0.1 });
  }

  dispose() {
    this.close(false);
    this.el?.remove();
    this.el = null;
  }
}
