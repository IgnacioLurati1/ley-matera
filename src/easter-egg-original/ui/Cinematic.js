// Cinemática del final: el Abuelo cuenta su historia (y los mates de cada
// época) en cuadros pintados en canvas, con voz y texto. Termina revelando
// quién es. Se puede saltear con Esc o clic.

const W = 960;
const H = 540;

const SLIDES = [
  {
    paint: pampa,
    text: 'Aquí me pongo a cantar, al compás de la vigüela... Así empezaba mi historia, m\'hijo, hace ya más de cien años.',
  },
  {
    paint: fogon,
    text: 'En mis tiempos el mate era de calabaza, curada con grasa, y la bombilla de alpaca pasaba de mano en mano alrededor del fogón.',
  },
  {
    paint: mates,
    text: 'En la frontera cebábamos en guampa de toro, en las pulperías en porongo, y el patrón lo tomaba en plata labrada, como si el mate supiera de clases.',
  },
  {
    paint: salamanca,
    text: 'Una noche el Mandinga me desafió a payar. Me jugué el alma a que nadie cebaba mejor que un gaucho... y él hizo trampa: me enfrió el agua.',
  },
  {
    paint: molino,
    text: 'Me escondí en este molino con otro nombre. Me dijeron Abuelo. Y el diablo mandó a sus peones muertos a buscarme, noche tras noche.',
  },
  {
    paint: retrato,
    text: 'Mi nombre es Martín Fierro. Y gracias a vos, esta noche, por fin, puedo tomarme un mate en paz.',
    reveal: true,
  },
];

export default class Cinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'mdu-cine';
    this.el.innerHTML = '<canvas width="960" height="540"></canvas><p class="mdu-cine__text"></p><h1 class="mdu-cine__name"></h1><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.textEl = this.el.querySelector('.mdu-cine__text');
    this.nameEl = this.el.querySelector('.mdu-cine__name');
    this.nameEl.textContent = 'Martín Fierro';
    this.timers = [];
  }

  play(onDone) {
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    requestAnimationFrame(() => this.el.classList.add('is-on'));
    this.g.audio.chamame();
    this.show(0);
  }

  show(i) {
    if (this.done) return;
    if (i >= SLIDES.length) {
      this.later(1.5, () => this.end());
      return;
    }
    const s = SLIDES[i];
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    s.paint(ctx);
    this.canvas.classList.remove('is-pan');
    void this.canvas.offsetWidth;
    this.canvas.classList.add('is-pan');
    const dur = this.g.audio.say(s.text, 'abuelo');
    // el texto aparece al ritmo de la voz
    this.textEl.textContent = '';
    const total = Math.max(1, dur * 0.9);
    let n = 0;
    const step = () => {
      if (this.done) return;
      n++;
      this.textEl.textContent = s.text.slice(0, Math.ceil((n / (total * 30)) * s.text.length));
      if (n < total * 30) this.timers.push(setTimeout(step, 1000 / 30));
    };
    step();
    if (s.reveal) this.later(dur * 0.35, () => this.nameEl.classList.add('is-on'));
    this.later(Math.max(6, dur + 1.6), () => this.show(i + 1));
  }

  end() {
    if (this.done) return;
    this.nameEl.classList.remove('is-on');
    this.textEl.textContent = '';
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8d8b0';
    ctx.textAlign = 'center';
    ctx.font = '72px Creepster, "Special Elite", serif';
    ctx.fillText('FIN', W / 2, H / 2 - 20);
    ctx.font = '26px "Special Elite", Georgia, serif';
    ctx.fillText('Mate der Untoten · gracias por jugar', W / 2, H / 2 + 40);
    this.later(4, () => this.finish());
  }

  later(secs, fn) {
    this.timers.push(setTimeout(fn, secs * 1000));
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const t of this.timers) clearTimeout(t);
    window.removeEventListener('keydown', this.onKey);
    try {
      speechSynthesis.cancel();
    } catch {
      /* */
    }
    this.el.classList.remove('is-on');
    setTimeout(() => this.el.remove(), 600);
    this.onDone?.();
  }
}

// ---------------- cuadros ----------------
function sky(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.7, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function grain(ctx, k = 0.06) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * k;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Gaucho a caballo recortado contra el atardecer.
function pampa(ctx) {
  sky(ctx, '#2a1030', '#e8703a');
  ctx.fillStyle = 'rgba(255,220,150,0.9)';
  ctx.beginPath();
  ctx.arc(700, 360, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#140a08';
  ctx.fillRect(0, 380, W, H);
  // pastos
  for (let x = 0; x < W; x += 6) ctx.fillRect(x, 372 + Math.sin(x) * 4, 2, 12 + (x % 5) * 2);
  // caballo y jinete
  ctx.save();
  ctx.translate(360, 380);
  ctx.beginPath();
  ctx.ellipse(0, -70, 80, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(60, -85);
  ctx.lineTo(110, -140);
  ctx.lineTo(130, -130);
  ctx.lineTo(90, -70);
  ctx.fill();
  for (const x of [-60, -40, 40, 60]) ctx.fillRect(x, -50, 10, 50);
  ctx.fillRect(-90, -80, 14, 50);
  ctx.beginPath();
  ctx.ellipse(-5, -130, 22, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-5, -176, 42, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-20, -200, 30, 26);
  // guitarra en la espalda
  ctx.beginPath();
  ctx.ellipse(-30, -120, 14, 20, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  grain(ctx);
}

// Fogón con la calabaza y la pava.
function fogon(ctx) {
  sky(ctx, '#05060c', '#1a0e08');
  const g = ctx.createRadialGradient(480, 420, 10, 480, 420, 380);
  g.addColorStop(0, 'rgba(255,150,60,0.8)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // llamas
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#ffb040' : '#ff6020';
    ctx.beginPath();
    ctx.moveTo(420 + i * 14, 470);
    ctx.quadraticCurveTo(430 + i * 14, 380 - (i % 3) * 30, 448 + i * 12, 470);
    ctx.fill();
  }
  // calabaza con bombilla
  ctx.fillStyle = '#6a4424';
  ctx.beginPath();
  ctx.ellipse(250, 400, 60, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(248, 290, 8, 90);
  ctx.fillStyle = '#4a6a2a';
  ctx.beginPath();
  ctx.ellipse(250, 340, 42, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // pava sobre las brasas
  ctx.fillStyle = '#8a8a8a';
  ctx.beginPath();
  ctx.ellipse(700, 420, 70, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(760, 380, 60, 12);
  grain(ctx);
}

// Los mates de cada época, en fila.
function mates(ctx) {
  sky(ctx, '#1a120c', '#3a2618');
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(0, 400, W, H);
  const draw = (x, kind) => {
    ctx.save();
    ctx.translate(x, 400);
    if (kind === 'guampa') {
      ctx.fillStyle = '#d8c49a';
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.quadraticCurveTo(-60, -120, 20, -200);
      ctx.lineTo(50, -190);
      ctx.quadraticCurveTo(0, -110, 30, 0);
      ctx.fill();
    } else if (kind === 'porongo') {
      ctx.fillStyle = '#7a5a34';
      ctx.beginPath();
      ctx.ellipse(0, -60, 55, 60, 0, 0, Math.PI * 2);
      ctx.ellipse(0, -150, 32, 45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath();
      ctx.moveTo(-50, 0);
      ctx.lineTo(50, 0);
      ctx.lineTo(35, -30);
      ctx.fill();
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.ellipse(0, -100, 55, 70, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b8923a';
      ctx.fillRect(-45, -170, 90, 14);
    }
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(kind === 'guampa' ? 30 : 6, kind === 'porongo' ? -260 : -250, 7, 110);
    ctx.restore();
  };
  draw(220, 'guampa');
  draw(480, 'porongo');
  draw(740, 'plata');
  ctx.fillStyle = 'rgba(232,216,176,0.8)';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('guampa · porongo · plata labrada', W / 2, 470);
  grain(ctx);
}

// La Salamanca: la cueva roja y el diablo.
function salamanca(ctx) {
  sky(ctx, '#1a0202', '#5a0a04');
  const g = ctx.createRadialGradient(480, 330, 20, 480, 330, 300);
  g.addColorStop(0, 'rgba(255,90,20,0.9)');
  g.addColorStop(1, 'rgba(120,10,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0a0202';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.quadraticCurveTo(480, -80, W, H);
  ctx.lineTo(W, 0);
  ctx.lineTo(0, 0);
  ctx.fill();
  // el Mandinga
  ctx.save();
  ctx.translate(480, 500);
  ctx.beginPath();
  ctx.moveTo(-110, 0);
  ctx.quadraticCurveTo(0, -260, 110, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -250, 40, 0, Math.PI * 2);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 20, -280);
    ctx.quadraticCurveTo(s * 60, -320, s * 50, -360);
    ctx.lineTo(s * 30, -285);
    ctx.fill();
  }
  ctx.fillStyle = '#ffcc40';
  ctx.beginPath();
  ctx.arc(-14, -252, 5, 0, Math.PI * 2);
  ctx.arc(14, -252, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  grain(ctx, 0.08);
}

// El molino de noche, con la luna.
function molino(ctx) {
  sky(ctx, '#040612', '#1a1a2a');
  ctx.fillStyle = 'rgba(220,230,255,0.9)';
  ctx.beginPath();
  ctx.arc(220, 120, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 420, W, H);
  ctx.fillRect(360, 240, 360, 190);
  ctx.beginPath();
  ctx.moveTo(340, 245);
  ctx.lineTo(540, 170);
  ctx.lineTo(740, 245);
  ctx.fill();
  ctx.fillRect(640, 150, 40, 100);
  ctx.fillStyle = '#ffb050';
  for (const [x, y] of [[420, 300], [520, 300], [620, 330]]) ctx.fillRect(x, y, 26, 34);
  // siluetas de peones muertos
  ctx.fillStyle = '#0c0a0a';
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 130 + (i % 2) * 30;
    ctx.beginPath();
    ctx.ellipse(x, 420, 16, 40, 0.1 * (i % 3 - 1), 0, Math.PI * 2);
    ctx.arc(x, 368, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx);
}

// El retrato: sombrero, poncho, barba y la guitarra.
function retrato(ctx) {
  const g = ctx.createRadialGradient(480, 260, 30, 480, 280, 460);
  g.addColorStop(0, '#6a4a2a');
  g.addColorStop(1, '#120a04');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#b8923a';
  ctx.lineWidth = 14;
  ctx.strokeRect(250, 30, 460, 480);
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.moveTo(300, 510);
  ctx.quadraticCurveTo(480, 250, 660, 510);
  ctx.fill();
  // cara curtida, barba tupida, bigote y cejas pobladas
  ctx.fillStyle = '#b08a68';
  ctx.beginPath();
  ctx.ellipse(480, 215, 66, 86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.moveTo(414, 215);
  ctx.quadraticCurveTo(418, 330, 480, 345);
  ctx.quadraticCurveTo(542, 330, 546, 215);
  ctx.quadraticCurveTo(530, 262, 480, 268);
  ctx.quadraticCurveTo(430, 262, 414, 215);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(438, 252);
  ctx.quadraticCurveTo(480, 232, 522, 252);
  ctx.quadraticCurveTo(480, 246, 438, 252);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#2a1a10';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(480 + s * 14, 186);
    ctx.lineTo(480 + s * 46, 180);
    ctx.stroke();
    ctx.fillStyle = '#1a100a';
    ctx.beginPath();
    ctx.ellipse(480 + s * 28, 200, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#9a7456';
  ctx.beginPath();
  ctx.moveTo(480, 200);
  ctx.lineTo(470, 235);
  ctx.lineTo(490, 235);
  ctx.fill();
  // sombrero de ala ancha
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.ellipse(480, 138, 135, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(418, 72, 124, 68);
  // poncho con guarda
  ctx.fillStyle = '#7a1a12';
  ctx.beginPath();
  ctx.moveTo(330, 510);
  ctx.lineTo(480, 330);
  ctx.lineTo(630, 510);
  ctx.fill();
  ctx.fillStyle = '#e8d8b0';
  for (let i = 0; i < 8; i++) ctx.fillRect(345 + i * 36, 480, 18, 8);
  grain(ctx, 0.05);
}
