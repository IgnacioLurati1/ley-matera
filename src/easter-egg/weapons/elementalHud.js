import '../ui/elemCharge.css';

// El aro de carga de los mates de la luz templados (weapons/Elementales.js),
// alrededor de la mira: un aro de segmentos que se llena con el color del
// mate, las marcas del elemento (llamas, rulos de viento, rayos, agujas de
// hielo) que vienen de lejos y se cierran sobre el aro, y el borde de la
// pantalla que se tiñe. Cargado: el aro late y gira, las marcas se clavan y
// aparece el nombre del tiro. Al soltar cargado revienta para afuera; si no
// llegó, se apaga para adentro. Sin cargas suficientes: el aro gris y el aviso.
// Los estilos están en ui/elemCharge.css.

const NAME = { fuego: 'Erupción', viento: 'Remolino', rayo: 'Ojo de la tormenta', hielo: 'Ventisca' };
// el color de la mira mientras carga
const CROSS = { fuego: '#ffa54a', viento: '#8dffcc', rayo: '#ffe66a', hielo: '#a8e2ff' };
// las marcas: cuántas y su dibujo (en 20×24, la base abajo contra el aro y la punta afuera)
const MARKS = {
  fuego: {
    n: 6,
    svg: '<path fill="currentColor" d="M10 .5C11.5 5 16.5 8.5 16.5 14.5 16.5 19.5 13.5 23.5 10 23.5S3.5 19.5 3.5 14.5C3.5 11 5.5 8.8 7.2 6.8 7.4 9.4 8.4 10.8 9.6 11.4 9 7.8 9.2 4 10 .5Z"/><path fill="#fff" opacity=".85" d="M10 11C11 13.5 13 15 13 18 13 20.5 11.7 22 10 22S7 20.5 7 18.5C7 16 9 14.5 10 11Z"/>',
  },
  viento: {
    n: 3,
    svg: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 23C10 16 4 14.5 4 9.5 4 5 7.8 2.2 11.5 2.6 15 3 16.6 6.4 14.6 8.8 12.9 10.8 9.9 10 10.1 7.6"/><path d="M15.2 21C15.2 18 17.2 16.2 18.6 15.4" opacity=".7"/></g>',
  },
  rayo: {
    n: 4,
    svg: '<path fill="currentColor" stroke="#fff" stroke-width=".9" stroke-linejoin="round" d="M12.5.5 3.5 13.5H9L6.5 23.5 16.5 9.5H11L14 .5Z"/>',
  },
  hielo: {
    n: 6,
    svg: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 23.5V3M10 8.5 6 4.5M10 8.5 14 4.5M10 14.5 5.5 10M10 14.5 14.5 10"/></g><path fill="#fff" d="M10 0 12 3 10 6 8 3Z"/>',
  },
};
// cuánto gira el anillo de marcas (grados por segundo): sin carga / cargado
const SPIN = { fuego: [14, 44], viento: [70, 520], rayo: [0, 0], hielo: [10, 34] };

export default class ElemHud {
  constructor(g) {
    this.g = g;
    this.el = null;
    this.state = 'off';
    this.elem = null;
    this.k = 0;
    this.spin = 0;
    this.outT = 0;
    this.zapT = 0;
    this.zap = 0;
  }

  // (se arma la primera vez que hace falta: el HUD puede no estar todavía)
  build() {
    const root = this.g.hud?.root;
    if (!root) return false;
    if (this.el?.isConnected) return true;
    const el = document.createElement('div');
    el.className = 'mdu-elc';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="mdu-elc__glow"></div><div class="mdu-elc__seg mdu-elc__track"></div>' +
      '<div class="mdu-elc__halo"><div class="mdu-elc__seg mdu-elc__fill"></div></div>' +
      '<div class="mdu-elc__head"><i></i></div><div class="mdu-elc__marks"></div>' +
      '<div class="mdu-elc__ping"></div><b class="mdu-elc__name"></b>';
    const edge = document.createElement('div');
    edge.className = 'mdu-elc-edge';
    edge.setAttribute('aria-hidden', 'true');
    // (el borde, abajo de todo lo del HUD; el aro, arriba)
    root.prepend(edge);
    root.appendChild(el);
    this.el = el;
    this.edge = edge;
    this.root = root;
    this.marks = el.querySelector('.mdu-elc__marks');
    this.name = el.querySelector('.mdu-elc__name');
    this.elem = null;
    return true;
  }

  // Empieza a cargar (low: se mantiene el clic pero no alcanzan las cargas).
  start(elem, low = false) {
    if (!this.build()) return;
    const { el, edge } = this;
    if (this.elem !== elem) {
      const M = MARKS[elem];
      this.marks.style.setProperty('--n', String(M.n));
      this.marks.innerHTML = Array.from({ length: M.n }, (_, i) => `<i style="--i:${i}"><svg viewBox="0 0 20 24">${M.svg}</svg></i>`).join('');
      el.dataset.el = edge.dataset.el = elem;
      this.elem = elem;
    }
    this.name.textContent = low ? 'Sin cargas' : NAME[elem];
    this.state = low ? 'low' : 'charge';
    this.k = 0;
    this.spin = elem === 'rayo' ? 45 : 0;
    this.play('is-in');
    el.classList.toggle('is-low', low);
    el.classList.add('is-on');
    edge.classList.remove('is-full', 'is-out', 'is-fizzle');
    edge.classList.toggle('is-on', !low);
    if (!low) {
      this.root.classList.add('is-elc');
      this.root.style.setProperty('--elc-c', CROSS[elem]);
    }
    this.write();
  }

  // La carga se llenó.
  full() {
    if (this.state !== 'charge') return;
    this.state = 'full';
    this.play('is-full');
    this.edge.classList.add('is-full');
  }

  // Soltó el clic: cargado revienta para afuera; si no llegó, se apaga.
  release(full) {
    if (this.state === 'off' || this.state === 'out' || !this.el) return;
    this.state = 'out';
    this.outT = full ? 0.46 : 0.23;
    const cls = full ? 'is-out' : 'is-fizzle';
    this.play(cls);
    this.edge.classList.remove('is-full', 'is-out', 'is-fizzle');
    void this.edge.offsetWidth;
    this.edge.classList.add(cls);
    this.root.classList.remove('is-elc');
  }

  // Se cortó (cambió de arma, recarga, corre...): se apaga.
  cancel() {
    this.release(false);
  }

  hide() {
    this.state = 'off';
    if (!this.el) return;
    this.el.classList.remove('is-on', 'is-in', 'is-out', 'is-fizzle', 'is-full', 'is-low');
    this.edge.classList.remove('is-on', 'is-full', 'is-out', 'is-fizzle');
    this.root.classList.remove('is-elc');
  }

  // Cambia la animación del aro (sacar la clase y volverla a poner la arranca de nuevo).
  play(cls) {
    const el = this.el;
    el.classList.remove('is-in', 'is-out', 'is-fizzle', 'is-full');
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // Cada cuadro (k: la carga, 0 a 1).
  update(dt, k) {
    if (this.state === 'off') return;
    if (this.state === 'out') {
      this.outT -= dt;
      if (this.outT <= 0) this.hide();
      return;
    }
    if (this.state === 'low') return;
    this.k += (k - this.k) * Math.min(1, dt * 22);
    const [s0, s1] = SPIN[this.elem];
    const full = this.state === 'full';
    this.spin = (this.spin + dt * (full ? s1 : s0 + (s1 - s0) * this.k * this.k)) % 360;
    // el Illapa: las marcas saltan de lugar y el borde titila, como relámpagos
    if (this.elem === 'rayo') {
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 0.05 + Math.random() * 0.09;
        this.zap = (Math.random() - 0.5) * (4 + this.k * 16);
        this.edge.style.setProperty('--fl', (0.55 + Math.random() * 0.7).toFixed(2));
      }
      this.spin = 45 + this.zap;
    }
    this.write();
  }

  write() {
    const k = this.k;
    const e = 1 - (1 - k) ** 3;
    const s = this.el.style;
    s.setProperty('--k', k.toFixed(3));
    s.setProperty('--e', e.toFixed(3));
    s.setProperty('--spin', `${this.spin.toFixed(1)}deg`);
    this.edge.style.setProperty('--k', k.toFixed(3));
    this.root.style.setProperty('--elc-k', k.toFixed(3));
  }
}
