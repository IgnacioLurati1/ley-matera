import './loadscreen.css';

// Pantalla de carga al entrar a un mapa, estilo Black Ops 2: la postal del
// mapa, su nombre, un consejo, quién ya cargó y la barra. Cuando todos están
// listos se va a negro y el juego arranca con un fundido desde negro.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export default class LoadScreen {
  constructor(root) {
    this.root = root;
    this.el = null;
  }

  // { name, sub, image, tip, quick }: quick = cambio de mapa en el título (sin consejo ni jugadores)
  open({ name, sub = '', image = null, tip = '', quick = false }) {
    this.close();
    const el = h(`<div class="mdu-arrive${quick ? ' is-quick' : ''}" role="status" aria-live="polite">
      <div class="mdu-arrive__bg"></div>
      <div class="mdu-arrive__grid">
        <figure class="mdu-postal">
          <div class="mdu-postal__img"></div>
          <figcaption><span>Saludos desde</span><b>${esc(name)}</b></figcaption>
          <div class="mdu-postal__stamp" aria-hidden="true"><span>Correo Matero</span><b>1</b></div>
          <div class="mdu-postal__mark" aria-hidden="true"><span>ROSARIO</span></div>
        </figure>
        <div class="mdu-arrive__info">
          <h2 class="mdu-arrive__map">${esc(name)}</h2>
          <p class="mdu-arrive__sub">${esc(sub)}</p>
          ${tip ? `<p class="mdu-arrive__tip">${esc(tip)}</p>` : ''}
          <ul class="mdu-arrive__players" hidden></ul>
        </div>
      </div>
      <div class="mdu-arrive__foot">
        <p class="mdu-arrive__status"></p>
        <div class="mdu-arrive__bar"><i></i></div>
      </div>
      <div class="mdu-arrive__black"></div>
    </div>`);
    this.el = el;
    this.setImage(image);
    this.root.appendChild(el);
    return this;
  }

  setImage(src) {
    if (!this.el || !src) return;
    const url = `url("${src}")`;
    this.el.querySelector('.mdu-postal__img').style.backgroundImage = url;
    this.el.querySelector('.mdu-arrive__bg').style.backgroundImage = url;
    this.el.classList.add('has-image');
  }

  progress(k, text) {
    if (!this.el) return;
    this.el.querySelector('.mdu-arrive__bar i').style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`;
    if (text != null) this.el.querySelector('.mdu-arrive__status').textContent = text;
  }

  // [{ name, ready, me }]
  players(list) {
    if (!this.el) return;
    const ul = this.el.querySelector('.mdu-arrive__players');
    ul.hidden = !list || list.length < 2;
    if (ul.hidden) return;
    ul.innerHTML = list
      .map((p) => `<li class="${p.ready ? 'is-ready' : ''}${p.me ? ' is-me' : ''}"><b>${esc(p.name)}</b><span>${p.ready ? 'Listo' : 'Cargando…'}</span></li>`)
      .join('');
  }

  // Todos listos: la pantalla se va a negro.
  toBlack() {
    this.el?.classList.add('is-black');
  }

  // El juego ya arrancó debajo: se destapa desde negro y se saca.
  reveal(ms = 1800) {
    const el = this.el;
    if (!el) return;
    el.classList.add('is-black', 'is-open');
    el.style.setProperty('--reveal', `${ms}ms`);
    // un cuadro para que el navegador tome el negro antes de destaparlo
    requestAnimationFrame(() => el.classList.add('is-revealing'));
    this.el = null;
    setTimeout(() => el.remove(), ms + 120);
  }

  // Cambio de mapa en el título: la pantalla se desvanece entera.
  fadeOut(ms = 450) {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.style.pointerEvents = 'none';
    el.style.transition = `opacity ${ms}ms ease-out`;
    requestAnimationFrame(() => {
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), ms + 120);
  }

  close() {
    this.el?.remove();
    this.el = null;
  }

  get isOpen() {
    return !!this.el;
  }
}
