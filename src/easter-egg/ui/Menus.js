import Lobby from './Lobby';

// Menús: carga, título, controles, opciones, pausa, sala en línea y fin del juego.

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const CONTROLS = [
  ['W A S D', 'Moverse'],
  ['Mouse', 'Mirar · clic izquierdo dispara · derecho apunta'],
  ['Shift', 'Correr'],
  ['Espacio', 'Saltar'],
  ['C', 'Agacharse'],
  ['R', 'Cebar (recargar)'],
  ['F', 'Comprar, abrir, usar · mantener para reconstruir barreras'],
  ['V', 'Facón (cuchillo)'],
  ['G', 'Bomba de yerba'],
  ['T / 4', 'Pava silbadora'],
  ['1 2 3 / Q / rueda', 'Cambiar de mate'],
  ['Esc', 'Pausa'],
];

export default class Menus {
  constructor(root, game) {
    this.g = game;
    this.root = root;
    this.loading = h('<div class="mdu-loading"><div><div class="mdu-title" style="font-size:64px">Mate der Untoten</div><p class="mdu-tag" data-l>Preparando el molino…</p><b><i></i></b></div></div>');
    root.appendChild(this.loading);
    this.screens = {};
    this.build();
    this.grain = h('<div class="mdu-grain"></div>');
    root.appendChild(this.grain);
    this.click = h('<div class="mdu-click">Hacé clic para seguir jugando</div>');
    root.appendChild(this.click);
  }

  progress(k, text) {
    this.loading.querySelector('i').style.width = `${Math.round(k * 100)}%`;
    if (text) this.loading.querySelector('[data-l]').textContent = text;
  }

  hideLoading() {
    this.loading.remove();
  }

  screen(name, html) {
    const s = h(`<div class="mdu-menu ${name === 'title' ? '' : 'mdu-menu--solid'}" data-screen="${name}"><div class="mdu-panel">${html}</div></div>`);
    this.root.appendChild(s);
    this.screens[name] = s;
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        this.g.audio?.resume();
        this.act(b.dataset.act);
      }
    });
    return s;
  }

  build() {
    this.screen(
      'title',
      `<h1 class="mdu-title">Mate der Untoten</h1>
       <p class="mdu-tag">Un juego escondido de Ley Matera · zombies por rondas</p>
       <div class="mdu-list">
         <button class="mdu-btn" data-act="play">Jugar</button>
         <button class="mdu-btn" data-act="online">Jugar con amigos</button>
         <button class="mdu-btn" data-act="controls">Controles</button>
         <button class="mdu-btn" data-act="options">Opciones</button>
         <button class="mdu-btn" data-act="exit">Volver a la tienda</button>
       </div>
       <p class="mdu-small" data-best></p>
       <div data-gpu></div>`,
    );
    this.screen(
      'controls',
      `<h2 class="mdu-h2">Controles</h2>
       <div class="mdu-keys">${CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
       <button class="mdu-btn" data-act="back">Volver</button>`,
    );
    this.screen(
      'options',
      `<h2 class="mdu-h2">Opciones</h2>
       <label class="mdu-field">Sensibilidad <input type="range" min="0.2" max="3" step="0.05" data-set="sensitivity"><output></output></label>
       <label class="mdu-field">Campo de visión <input type="range" min="60" max="100" step="1" data-set="fov"><output></output></label>
       <label class="mdu-field">Volumen general <input type="range" min="0" max="1" step="0.05" data-set="master"><output></output></label>
       <label class="mdu-field">Música <input type="range" min="0" max="1" step="0.05" data-set="music"><output></output></label>
       <label class="mdu-field">Efectos <input type="range" min="0" max="1" step="0.05" data-set="sfx"><output></output></label>
       <label class="mdu-field">Temblor de cámara <input type="range" min="0" max="1" step="0.05" data-set="shake"><output></output></label>
       <label class="mdu-field">Calidad <select data-set="quality"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option></select></label>
       <label class="mdu-field">Invertir mouse <input type="checkbox" data-set="invertY"></label>
       <label class="mdu-field">Voces <select data-set="voiceMode"><option value="auto">Automáticas</option><option value="natural">Naturales del navegador</option><option value="murmur">Murmullos</option><option value="off">Solo subtítulos</option></select></label>
       <p class="mdu-small" data-voice-note></p>
       <label class="mdu-field">Mostrar FPS <input type="checkbox" data-set="showFps"></label>
       <p class="mdu-small" data-gpu2></p>
       <button class="mdu-btn" data-act="back">Volver</button>`,
    );
    this.screen(
      'pause',
      `<h2 class="mdu-h2">Pausa</h2>
       <p class="mdu-small mdu-pause-note" data-pause-note hidden></p>
       <div class="mdu-list">
         <button class="mdu-btn" data-act="resume">Continuar</button>
         <button class="mdu-btn" data-act="options">Opciones</button>
         <button class="mdu-btn" data-act="controls">Controles</button>
         <button class="mdu-btn" data-act="restart">Empezar de nuevo</button>
         <button class="mdu-btn" data-act="leaveRoom" hidden>Salir de la sala</button>
         <button class="mdu-btn" data-act="exit">Salir a la tienda</button>
       </div>`,
    );
    this.screen(
      'over',
      `<h2 class="mdu-h2">Fin del juego</h2>
       <p class="mdu-survived" data-survived></p>
       <dl class="mdu-stats" data-stats></dl>
       <table class="mdu-board" data-board hidden></table>
       <p class="mdu-small mdu-pause-note" data-wait hidden></p>
       <div class="mdu-list">
         <button class="mdu-btn" data-act="restart">Jugar de nuevo</button>
         <button class="mdu-btn" data-act="leaveRoom" hidden>Salir de la sala</button>
         <button class="mdu-btn" data-act="exit">Salir a la tienda</button>
       </div>`,
    );
    this.lobby = new Lobby(this.root, this.g, this);
    this.screens.online = this.lobby.el;
    // opciones en vivo
    const opt = this.screens.options;
    opt.querySelectorAll('[data-set]').forEach((input) => {
      input.addEventListener('input', () => {
        const k = input.dataset.set;
        const v = input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : Number(input.value);
        this.g.setSetting(k, v);
        this.syncOutputs();
      });
    });
  }

  syncOptions() {
    const s = this.g.settings;
    const a = this.g.audio;
    const note = this.screens.options.querySelector('[data-voice-note]');
    if (note && a) {
      note.textContent = a.naturalVoice
        ? `Voz natural disponible: ${a.naturalVoice.name.replace(/Microsoft |Online |\(Natural\)| - .*/g, '').trim()}.`
        : 'Este navegador no trae voces naturales en castellano, así que los personajes murmuran (en Edge hay voces naturales).';
    }
    this.screens.options.querySelectorAll('[data-set]').forEach((input) => {
      const v = s[input.dataset.set];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v;
    });
    this.syncOutputs();
  }

  syncOutputs() {
    this.screens.options.querySelectorAll('input[type=range]').forEach((input) => {
      const out = input.nextElementSibling;
      const k = input.dataset.set;
      const v = Number(input.value);
      out.textContent = ['master', 'music', 'sfx', 'shake'].includes(k) ? `${Math.round(v * 100)}%` : k === 'fov' ? `${v}°` : v.toFixed(2);
    });
  }

  show(name) {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('is-on', k === name);
    this.current = name;
    this.root.scrollTop = 0;
    this.root.scrollLeft = 0;
    if (name === 'options') this.syncOptions();
    if (name) {
      const first = this.screens[name].querySelector('.mdu-btn:not([hidden])');
      first?.focus({ preventScroll: true });
    }
  }

  act(a) {
    const g = this.g;
    switch (a) {
      case 'play':
        g.startGame();
        break;
      case 'controls':
      case 'options':
        this.prev = this.current;
        this.show(a);
        break;
      case 'online':
        this.prev = this.current;
        this.lobby.show();
        this.show('online');
        break;
      case 'back':
        this.show(this.prev || 'title');
        break;
      case 'resume':
        g.resume();
        break;
      case 'restart':
        g.restart();
        break;
      case 'leaveRoom':
        g.leaveRoom(g.net?.host ? 'Cerraste la sala.' : 'Saliste de la sala.');
        break;
      case 'exit':
        g.exit();
        break;
      default:
        break;
    }
  }

  setTitleInfo({ best, gpu, integrated }) {
    const t = this.screens.title;
    t.querySelector('[data-best]').textContent = best ? `Tu récord: ronda ${best}` : 'Escribiste "easter egg"... ahora aguantá.';
    const warn = integrated
      ? `<div class="mdu-warn">Parece que el navegador está usando la placa de video integrada (${gpu}). Para usar la dedicada en Windows: Configuración › Sistema › Pantalla › Gráficos › elegí tu navegador › Alto rendimiento, y reiniciá el navegador.</div>`
      : '';
    t.querySelector('[data-gpu]').innerHTML = `${gpu ? `<p class="mdu-small" style="margin-top:6px">Placa de video: ${gpu}</p>` : ''}${warn}`;
    this.screens.options.querySelector('[data-gpu2]').textContent = gpu ? `Placa de video en uso: ${gpu}` : '';
  }

  // Qué se puede hacer en la pausa según cómo se esté jugando.
  setPauseMode(mode) {
    const s = this.screens.pause;
    const note = s.querySelector('[data-pause-note]');
    const btn = (a) => s.querySelector(`[data-act="${a}"]`);
    const notes = {
      solo: '',
      host: 'La partida quedó en pausa para todos.',
      guest: 'La partida sigue corriendo: los zombies no esperan.',
      hostPaused: 'El anfitrión pausó la partida. Sigue cuando vuelva.',
    };
    s.querySelector('.mdu-h2').textContent = mode === 'guest' ? 'Menú' : 'Pausa';
    note.textContent = notes[mode] || '';
    note.hidden = !note.textContent;
    btn('resume').hidden = mode === 'hostPaused';
    btn('resume').textContent = mode === 'guest' ? 'Volver al juego' : 'Continuar';
    btn('restart').hidden = mode === 'guest' || mode === 'hostPaused';
    btn('restart').textContent = mode === 'host' ? 'Empezar de nuevo (todos)' : 'Empezar de nuevo';
    btn('leaveRoom').hidden = mode === 'solo';
    btn('leaveRoom').textContent = mode === 'host' ? 'Cerrar la sala' : 'Salir de la sala';
  }

  // opts: { won, board (tabla del equipo), role: solo | host | guest, lost }
  gameOver(stats, best, { won = false, board = null, role = 'solo', lost = false } = {}) {
    const s = this.screens.over;
    const r = Math.max(1, stats.round);
    const team = role !== 'solo';
    s.querySelector('.mdu-h2').textContent = won ? '¡Victoria!' : lost ? 'Se cortó la conexión' : 'Fin del juego';
    s.querySelector('[data-survived]').textContent = won
      ? `${team ? 'Vencieron' : 'Venciste'} al Mandinga en la ronda ${r}. El Abuelo por fin toma mate en paz.`
      : lost
        ? `El anfitrión salió de la partida. Llegaste a la ronda ${r}.`
        : `${team ? 'Sobrevivieron' : 'Sobreviviste'} ${r} ${r === 1 ? 'ronda' : 'rondas'}${r >= best && r > 1 ? ' · ¡nuevo récord!' : ''}`;
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);
    const rows = [
      ['Zombies liquidados', stats.kills],
      ['Tiros a la cabeza', stats.headshots],
      ['Con el facón', stats.knifeKills],
      ['Puntos ganados', stats.earned.toLocaleString('es-AR')],
      ['Tiempo', `${mins}:${String(secs).padStart(2, '0')}`],
      ['La Ronda del Abuelo', stats.easterEgg ? 'Completada' : 'Pendiente'],
    ];
    s.querySelector('[data-stats]').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    // tabla del equipo
    const table = s.querySelector('[data-board]');
    table.hidden = !board || board.length < 2;
    if (!table.hidden) {
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      table.innerHTML = `<thead><tr><th>Matero</th><th>Bajas</th><th>Cabezas</th><th>Caídas</th><th>Levantó</th></tr></thead><tbody>${board
        .map((b) => `<tr><td>${esc(b.name)}</td><td>${b.kills}</td><td>${b.heads}</td><td>${b.downs}</td><td>${b.revives}</td></tr>`)
        .join('')}</tbody>`;
      const myId = this.g.net?.id;
      table.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-me', board[i].id === myId));
    }
    // botones: en línea solo el anfitrión arma otra partida (para todos)
    const btn = (a) => s.querySelector(`[data-act="${a}"]`);
    const wait = s.querySelector('[data-wait]');
    btn('restart').hidden = role === 'guest' || lost;
    btn('restart').textContent = role === 'host' ? 'Jugar de nuevo (todos)' : 'Jugar de nuevo';
    btn('leaveRoom').hidden = role === 'solo';
    btn('leaveRoom').textContent = role === 'host' ? 'Cerrar la sala' : lost ? 'Volver al título' : 'Salir de la sala';
    wait.hidden = role !== 'guest' || lost;
    wait.textContent = 'Esperando que el anfitrión arme otra partida…';
    this.show('over');
  }

  // Invitado mirando el final: el anfitrión cerró la sala.
  hostGone() {
    const s = this.screens.over;
    const wait = s.querySelector('[data-wait]');
    wait.hidden = false;
    wait.textContent = 'El anfitrión cerró la sala.';
    s.querySelector('[data-act="leaveRoom"]').textContent = 'Volver al título';
  }

  showClick(on) {
    this.click.classList.toggle('is-on', on);
  }
}
