import './titleIntro.css';

// La entrada del menú principal, una sola vez al terminar de cargar el juego:
// el negro de la carga se abre como un ojo que despierta (entreabre, parpadea
// y se abre, con la vista borrosa y roja al principio), la cámara mira al
// cielo y baja de a poco hasta su vuelta de siempre, cae un rayo, el nombre
// aparece letra por letra (blanco por el rayo, después colorado) y el resto
// del menú entra de a uno. Cualquier tecla o clic la termina de golpe (el clic
// igual aprieta el botón que tocó).
// Game.init: cover() antes de mostrar el título, play() con el título ya
// puesto; Game.titleCam: cam(). (En las pruebas automáticas no corre, así las
// fotos y las mediciones del título no cambian: se la pide con
// window.__mduTitleIntro = true.)

// Todo en ms desde play()
const EYES = 250; // empiezan a abrirse los ojos (dura 1,5 s)
const BOLT = 1700; // el rayo
const LETTERS = 1750; // la primera letra
const STEP = 45; // entre letra y letra
const TYPE = 2300; // la frase de abajo, a máquina
const UI = 2600; // lo demás del menú
const UI_STEP = 70;
const CAM_FROM = 1000; // la cámara empieza a bajar del cielo...
const CAM_TO = 4700; // ...y llega a su vuelta de siempre
const END = 5200;
// cuánto mira para arriba con los ojos recién abiertos (radianes)
const PITCH = 0.62;
// la tapa del negro de la carga: lo que tarda en irse el cartel y la barra
const COVER_MS = 380;

const later = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Las letras sueltas de la entrada (inline-block) pierden el interletrado de
// la fuente: al terminar, con el texto corrido de nuevo, el nombre se
// achicaba un poco (hasta 3 px por letra; el usuario lo notó). Se mide dónde
// cae cada letra en el texto corrido y se acomoda cada una a ese lugar.
// (globalThis.__mduNoTitleKern: como antes)
function textSpots(h1) {
  const tn = h1.firstChild;
  if (!tn || tn.nodeType !== 3 || h1.childNodes.length !== 1) return null;
  const out = [];
  const rg = document.createRange();
  for (let i = 0; i < tn.length; i++) {
    if (/\s/.test(tn.data[i])) continue;
    rg.setStart(tn, i);
    rg.setEnd(tn, i + 1);
    const b = rg.getBoundingClientRect();
    out.push({ x: b.left, y: b.top });
  }
  return out;
}

function fitLetters(h1, spots) {
  const ls = [...h1.querySelectorAll('.mdu-ti-l')];
  if (!spots || spots.length !== ls.length) return;
  // (quietas mientras se miden: la animación las corre de lugar)
  for (const l of ls) l.style.animation = 'none';
  // cada letra, a la misma distancia de la primera de su renglón que en el
  // texto corrido (así no importa si el renglón está centrado)
  let first = 0;
  for (let i = 0; i < ls.length; i++) {
    if (Math.abs(spots[i].y - spots[first].y) > 2) first = i;
    if (i === first) continue;
    const a = ls[first].getBoundingClientRect();
    const b = ls[i].getBoundingClientRect();
    if (Math.abs(b.top - a.top) > b.height / 2) continue;
    const dx = spots[i].x - spots[first].x - (b.left - a.left);
    if (Math.abs(dx) > 0.05) ls[i].style.marginLeft = `${dx}px`;
  }
  for (const l of ls) l.style.animation = '';
}

export default class TitleIntro {
  constructor(g) {
    this.g = g;
    this.on = false;
    this.active = false;
  }

  static wanted() {
    if (typeof window === 'undefined') return false;
    if (window.__mduTitleIntro === false) return false;
    if (navigator.webdriver && !window.__mduTitleIntro) return false;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch {
      /* sin matchMedia: va igual */
    }
    return true;
  }

  // Antes de mostrar el título: se va el cartel de la carga y queda todo negro
  // (los ojos cerrados).
  async cover() {
    if (!TitleIntro.wanted()) return;
    this.g.menus.loading?.classList.add('is-out');
    await later(COVER_MS);
    this.mount();
  }

  // El negro de los ojos cerrados, arriba de todo.
  mount() {
    const g = this.g;
    this.on = true;
    const el = document.createElement('div');
    el.className = `mdu-tintro${g.settings?.calmFx ? ' is-calm' : ''}`;
    el.innerHTML = '<i class="mdu-tintro__blur"></i><i class="mdu-tintro__veil"></i><i class="mdu-tintro__eye"></i><i class="mdu-tintro__flash"></i>';
    el.style.setProperty('--eyes', `${EYES}ms`);
    el.style.setProperty('--bolt', `${BOLT}ms`);
    g.root.appendChild(el);
    this.el = el;
  }

  // Con el título ya puesto: arranca todo.
  play() {
    if (!this.on) return;
    const g = this.g;
    const s = g.menus.screens.title;
    const panel = s.querySelector('.mdu-panel');
    const h1 = panel.querySelector('.mdu-title');
    this.active = true;
    this.t0 = performance.now();
    this.screen = s;
    // (si se llegó con un clic, el navegador ya deja sonar: el trueno)
    g.audio?.resume();

    // el nombre, letra por letra (cada una cae con un giro distinto)
    this.h1 = h1;
    this.text = h1.textContent;
    const spots = textSpots(h1);
    h1.textContent = '';
    let i = 0;
    this.text.split(' ').forEach((word, w) => {
      if (w) h1.append(' ');
      const ws = document.createElement('span');
      ws.className = 'mdu-ti-word';
      for (const ch of word) {
        const l = document.createElement('span');
        l.className = 'mdu-ti-l';
        l.textContent = ch;
        l.style.setProperty('--d', `${LETTERS + i * STEP}ms`);
        l.style.setProperty('--r', `${(Math.random() * 2 - 1) * 14}deg`);
        l.style.setProperty('--x', `${(Math.random() * 2 - 1) * 0.25}em`);
        ws.append(l);
        i++;
      }
      h1.append(ws);
    });
    h1.style.setProperty('--flicker', `${LETTERS + i * STEP + 420}ms`);

    // lo demás: la frase a máquina y el resto de a uno (los botones, uno por uno)
    this.items = [];
    let d = UI;
    for (const el of panel.children) {
      if (el === h1) continue;
      if (el.classList.contains('mdu-tag')) {
        el.classList.add('mdu-ti-type');
        el.style.setProperty('--d', `${TYPE}ms`);
        this.items.push(el);
        continue;
      }
      for (const it of el.classList.contains('mdu-list') ? el.children : [el]) {
        it.classList.add('mdu-ti-in');
        it.style.setProperty('--d', `${d}ms`);
        this.items.push(it);
        d += UI_STEP;
      }
    }
    s.classList.add('is-intro');
    if (globalThis.__mduNoTitleKern !== true) fitLetters(h1, spots);
    this.el?.classList.add('is-on');

    // el rayo: el cielo y el mapa se alumbran, y el trueno (si hay sonido)
    this.boltT = setTimeout(() => this.bolt(), BOLT);
    this.endT = setTimeout(() => this.finish(), END);
    // cualquier tecla o clic la termina
    this.skip = () => this.finish();
    window.addEventListener('keydown', this.skip, true);
    window.addEventListener('pointerdown', this.skip, true);
    const tick = () => {
      if (!this.active) return;
      // se fue del título (a jugar, a la sala) o cambió de mapa: se termina
      if (g.state !== 'title' || g.arrival?.switching || g.menus.current !== 'title') return this.finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  bolt() {
    const g = this.g;
    if (!this.active || g.state !== 'title') return;
    const w = g.weather;
    // dos destellos seguidos, como los de la tormenta (world/Weather.js)
    if (w?.bolt) w.pulses = [{ t: 0, k: 1 }, { t: 0.16, k: 0.55 }, { t: 0.42, k: 0.35 }];
    else if (w && 'flash' in w) w.flash = 1;
    const a = g.audio;
    // (sin un clic antes el navegador no deja sonar: sin trueno, que si no
    // quedaba en cola y sonaba con el primer clic)
    if (a?.ctx?.state === 'running') a.playThunder?.('trueno-medio-1', { gain: 1.1, bus: a.music, when: 0.12 });
  }

  // La cámara del título mira para arriba y baja de a poco (después de lookAt).
  cam(c) {
    if (!this.active) return;
    const e = performance.now() - this.t0;
    const k = ease(Math.min(1, Math.max(0, (e - CAM_FROM) / (CAM_TO - CAM_FROM))));
    const a = 1 - k;
    if (a <= 0) return;
    c.rotateX(PITCH * a);
    c.rotateZ(0.05 * a * Math.sin(e * 0.0011));
  }

  // Todo a como queda el menú (al terminar, con una tecla o un clic, o si se
  // fue del título).
  finish() {
    if (!this.on) return;
    this.on = false;
    this.active = false;
    clearTimeout(this.boltT);
    clearTimeout(this.endT);
    if (this.skip) {
      window.removeEventListener('keydown', this.skip, true);
      window.removeEventListener('pointerdown', this.skip, true);
    }
    this.el?.remove();
    this.el = null;
    this.g.menus.loading?.classList.remove('is-out');
    if (this.h1) {
      this.h1.textContent = this.text;
      this.h1.style.removeProperty('--flicker');
    }
    for (const it of this.items || []) {
      it.classList.remove('mdu-ti-in', 'mdu-ti-type');
      it.style.removeProperty('--d');
    }
    this.screen?.classList.remove('is-intro');
  }
}
