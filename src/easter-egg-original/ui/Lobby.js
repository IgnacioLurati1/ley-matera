import Net, { MAX_PLAYERS } from '../net/Net';

// Pantalla para jugar de a varios. Con "código de sala" (si el sitio trae
// dónde encontrarse) alcanza con pasarle 5 letras a los amigos. Si no hay
// nada de eso, queda el modo manual: el anfitrión copia un código largo y el
// invitado le devuelve otro.

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export default class Lobby {
  constructor(root, game, menus) {
    this.g = game;
    this.menus = menus;
    this.el = h(`<div class="mdu-menu mdu-menu--solid" data-screen="online"><div class="mdu-panel mdu-lobby">
      <h2 class="mdu-h2">Jugar con amigos</h2>
      <p class="mdu-tag">Hasta ${MAX_PLAYERS} materos en la misma partida. Uno hace de anfitrión: su compu maneja el molino.</p>
      <label class="mdu-field">Tu nombre <input type="text" maxlength="12" data-name></label>
      <div class="mdu-list" data-menu>
        <button class="mdu-btn" data-act="create">Crear sala</button>
        <button class="mdu-btn" data-act="join">Unirme a una sala</button>
        <button class="mdu-btn" data-act="back">Volver</button>
      </div>
      <div class="mdu-lobby__join" data-join hidden>
        <label class="mdu-field">Código de la sala <input type="text" maxlength="8" data-code></label>
        <div class="mdu-list">
          <button class="mdu-btn" data-act="enter">Entrar</button>
          <button class="mdu-btn" data-act="cancel">Cancelar</button>
        </div>
      </div>
      <div class="mdu-lobby__room" data-room hidden>
        <p class="mdu-lobby__code">Código: <b data-codeout></b></p>
        <ul class="mdu-lobby__players" data-players></ul>
        <div class="mdu-list">
          <button class="mdu-btn" data-act="start" hidden>Empezar la partida</button>
          <button class="mdu-btn" data-act="leave">Salir de la sala</button>
        </div>
      </div>
      <div class="mdu-lobby__manual" data-manual hidden>
        <p class="mdu-small" data-manual-help></p>
        <textarea data-out readonly rows="3"></textarea>
        <button class="mdu-btn mdu-btn--small" data-act="copy">Copiar mi código</button>
        <textarea data-in rows="3" placeholder="Pegá acá el código del otro"></textarea>
        <button class="mdu-btn mdu-btn--small" data-act="paste">Conectar</button>
      </div>
      <p class="mdu-small" data-status></p>
    </div></div>`);
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act);
    });
    this.nameInput = this.el.querySelector('[data-name]');
    this.nameInput.value = localStorage.getItem('lm-zombies-name') || `Matero ${Math.floor(Math.random() * 90 + 10)}`;
    this.statusEl = this.el.querySelector('[data-status]');
  }

  get name() {
    const v = this.nameInput.value.trim() || 'Matero';
    localStorage.setItem('lm-zombies-name', v);
    return v;
  }

  show() {
    this.section('menu');
    this.status(this.g.signal ? '' : 'Este sitio no tiene salas por código: se usa el modo manual (copiar y pegar).');
  }

  section(which) {
    for (const k of ['menu', 'join', 'room', 'manual']) {
      const el = this.el.querySelector(`[data-${k}]`);
      if (el) el.hidden = k !== which;
    }
  }

  status(text) {
    this.statusEl.textContent = text || '';
  }

  async act(a) {
    const g = this.g;
    try {
      if (a === 'back') {
        this.menus.show('title');
        return;
      }
      if (a === 'cancel') {
        this.section('menu');
        return;
      }
      if (a === 'create') {
        this.net = new Net({ role: 'host', signal: g.signal, name: this.name });
        this.net.onStatus = (t) => this.status(t);
        this.net.onPlayers = (list) => this.renderPlayers(list);
        const code = await this.net.startHost();
        g.attachNet(this.net);
        this.section('room');
        this.el.querySelector('[data-codeout]').textContent = code;
        this.el.querySelector('[data-act="start"]').hidden = false;
        this.renderPlayers([...this.net.players.values()]);
        if (!g.signal) {
          this.section('manual');
          this.el.querySelector('[data-manual-help]').textContent = '1) Copiá tu código y mandáselo al que se une. 2) Pegá acá abajo el código que te devuelve.';
          this.el.querySelector('[data-out]').value = await this.net.hostManualOffer();
        }
        return;
      }
      if (a === 'join') {
        if (!g.signal) {
          this.net = new Net({ role: 'guest', name: this.name });
          this.section('manual');
          this.el.querySelector('[data-manual-help]').textContent = '1) Pegá el código del anfitrión y tocá Conectar. 2) Copiá tu código y devolvéselo.';
          this.el.querySelector('[data-out]').value = '';
          return;
        }
        this.section('join');
        return;
      }
      if (a === 'enter') {
        const code = this.el.querySelector('[data-code]').value.trim().toUpperCase();
        if (!code) return;
        this.status('Conectando...');
        this.net = new Net({ role: 'guest', signal: g.signal, name: this.name });
        this.net.onStatus = (t) => this.status(t);
        this.net.onPlayers = (list) => this.renderPlayers(list);
        await this.net.joinRoom(code);
        g.attachNet(this.net);
        this.section('room');
        this.el.querySelector('[data-codeout]').textContent = code;
        this.status('Listo. Esperando que el anfitrión arranque...');
        return;
      }
      if (a === 'copy') {
        const out = this.el.querySelector('[data-out]');
        out.select();
        try {
          await navigator.clipboard.writeText(out.value);
          this.status('Código copiado.');
        } catch {
          this.status('Copialo a mano (Ctrl+C).');
        }
        return;
      }
      if (a === 'paste') {
        const code = this.el.querySelector('[data-in]').value.trim();
        if (!code) return;
        if (this.net.host) {
          this.status('Conectando...');
          await this.net.hostManualAccept(code, 'Invitado');
          this.section('room');
          this.el.querySelector('[data-codeout]').textContent = 'manual';
          this.el.querySelector('[data-act="start"]').hidden = false;
          this.status('Conectado.');
        } else {
          const answer = await this.net.guestManualAnswer(code);
          this.el.querySelector('[data-out]').value = answer;
          this.status('Copiá tu código y mandáselo al anfitrión.');
          await this.net.waitingOpen;
          this.g.attachNet(this.net);
          this.section('room');
          this.el.querySelector('[data-codeout]').textContent = 'manual';
          this.status('Conectado. Esperando que arranque la partida...');
        }
        return;
      }
      if (a === 'start') {
        this.menus.show(null);
        g.startGame();
        return;
      }
      if (a === 'leave') {
        this.net?.close();
        this.net = null;
        g.net = null;
        this.section('menu');
        this.status('Saliste de la sala.');
      }
    } catch (e) {
      this.status(e?.message || 'No se pudo conectar');
    }
  }

  renderPlayers(list) {
    const ul = this.el.querySelector('[data-players]');
    ul.innerHTML = (list || []).map((p) => `<li>${p.name}${p.id === 0 ? ' (anfitrión)' : ''}</li>`).join('');
  }
}
