import Net, { MAX_PLAYERS } from '../net/Net';
import { MAP_LIST, MAP_MODES } from '../config/map';
import { mapChip } from './MapSelect';
import { HORNS } from './PlayMenu';
import { pzLobby } from '../entities/penal/Porteno';

// (el rush de jefes en la sala: la corona del botón de ui/PlayMenu.js)
const CROWN = '<svg viewBox="0 0 24 24"><path d="M3 18 L4.6 7.5 L9 12 L12 4.5 L15 12 L19.4 7.5 L21 18 Z" fill="currentColor"/><rect x="3" y="19.2" width="18" height="2.2" fill="currentColor"/></svg>';

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
      <p class="mdu-tag">Hasta ${MAX_PLAYERS} materos en la misma partida. Uno hace de anfitrión: su compu maneja el mapa.</p>
      <label class="mdu-field">Tu nombre <input type="text" maxlength="12" autocomplete="off" spellcheck="false" data-name></label>
      <div class="mdu-list" data-menu>
        <button class="mdu-btn" data-act="create">Crear sala</button>
        <button class="mdu-btn" data-act="join">Unirme a una sala</button>
        <button class="mdu-btn" data-act="back">Volver</button>
      </div>
      <div class="mdu-lobby__join" data-join hidden>
        <label class="mdu-field">Código de la sala <input type="text" maxlength="8" autocomplete="off" spellcheck="false" data-code></label>
        <div class="mdu-list">
          <button class="mdu-btn" data-act="enter">Entrar</button>
          <button class="mdu-btn" data-act="cancel">Cancelar</button>
        </div>
      </div>
      <div class="mdu-lobby__room" data-room hidden>
        <p class="mdu-lobby__code">Código: <b data-codeout></b></p>
        <p class="mdu-lobby__map" data-mapout></p>
        <button class="mdu-rushpick mdu-lobby__rush" data-act="rushpick" aria-pressed="false" hidden><i aria-hidden="true">${CROWN}</i><span><b>Rush de jefes</b><small>Los seis, uno atrás del otro</small></span></button>
        <button class="mdu-rushpick mdu-rushpick--mayhem mdu-lobby__rush" data-act="mayhempick" aria-pressed="false" hidden><i aria-hidden="true">${HORNS}</i><span><b>Boss Rush Mayhem</b><small>Más bravos, sin grises</small></span></button>
        <div data-mappick hidden>${mapChip()}</div>
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
      if (b?.dataset.act === 'maps') this.menus.act('maps');
      else if (b) this.act(b.dataset.act);
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
    pzLobby(this);
    this.status(this.g.signal ? '' : 'Este sitio no tiene salas por código: se usa el modo manual (copiar y pegar).');
  }

  section(which) {
    for (const k of ['menu', 'join', 'room', 'manual']) {
      const el = this.el.querySelector(`[data-${k}]`);
      if (el) el.hidden = k !== which;
    }
    // "Empezar la partida" es solo del anfitrión (antes, el que había creado
    // una sala y se unió a otra lo seguía viendo)
    this.el.querySelector('[data-act="start"]').hidden = !this.net?.host;
  }

  // En la sala: el anfitrión elige el mapa; los invitados ven cuál es.
  syncMap() {
    const g = this.g;
    const m = MAP_LIST.find((x) => x.id === g.mapId);
    const out = this.el.querySelector('[data-mapout]');
    const md = g.modeNow !== 'story' ? MAP_MODES[g.mapId]?.find((x) => x.id === g.modeNow)?.name : '';
    if (out) out.textContent = m ? `Mapa: ${m.name}${md ? ` · ${md}` : ''}` : '';
    const pick = this.el.querySelector('[data-mappick]');
    if (pick) pick.hidden = !g.net?.host;
    // (Porteño encubierto: cuántos policías, entities/penal/Porteno.js)
    pzLobby(this);
    for (const b of this.el.querySelectorAll('[data-map]')) b.setAttribute('aria-pressed', String(b.dataset.map === g.mapId));
    // el rush de jefes (core/bossRush.js; el usuario, 2026-10-12: que la sala lo
    // muestre a todos): elegido por el anfitrión, en vez del mapa. El anfitrión
    // lo prende o lo apaga acá también; el invitado solo lo ve.
    const R = g.rush;
    const btn = this.el.querySelector('[data-act="rushpick"]');
    if (!R || !btn) return;
    const on = g.net?.guest ? R.roomPick : R.pick;
    // (el Boss Rush Mayhem, core/rushMayhem.js: el mismo rush con mayhemPick; uno u otro)
    const mh = !!on && !!(g.net?.guest ? R.roomMayhem : R.mayhemPick);
    btn.hidden = !(g.net?.host || (on && !mh));
    btn.disabled = !g.net?.host;
    btn.setAttribute('aria-pressed', String(!!on && !mh));
    const mbtn = this.el.querySelector('[data-act="mayhempick"]');
    if (mbtn) {
      mbtn.hidden = !(g.net?.host || mh);
      mbtn.disabled = !g.net?.host;
      mbtn.setAttribute('aria-pressed', String(mh));
    }
    if (out) out.hidden = !!on;
    if (pick && on) pick.hidden = true;
    R.sendPick();
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
        this.syncMap();
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
        // (sesión 1f, el usuario: "la primera vez que te unís a una sala se unen
        // dos personas a la vez". La primera búsqueda tarda —se piden los
        // servidores de puente y se abre el canal—: un segundo clic en Entrar
        // armaba otra conexión con otra tarjeta, el anfitrión le abría lugar a
        // las dos y la primera también llegaba a conectar. Ahora un solo intento
        // a la vez, y el anterior se cierra)
        if (this.joining) return;
        this.joining = true;
        try {
          if (this.net && !this.net.host && this.net !== g.net) this.net.close();
          this.status('Conectando...');
          this.net = new Net({ role: 'guest', signal: g.signal, name: this.name });
          this.net.onStatus = (t) => this.status(t);
          this.net.onPlayers = (list) => this.renderPlayers(list);
          await this.net.joinRoom(code);
          g.attachNet(this.net);
          this.section('room');
          this.el.querySelector('[data-codeout]').textContent = code;
          this.syncMap();
          this.status('Listo. Esperando que el anfitrión arranque...');
        } finally {
          this.joining = false;
        }
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
      if (a === 'rushpick') {
        if (!this.net?.host || !g.rush) return;
        g.rush.pick = !(g.rush.pick && !g.rush.mayhemPick);
        g.rush.mayhemPick = false;
        this.syncMap();
        return;
      }
      if (a === 'mayhempick') {
        if (!this.net?.host || !g.rush) return;
        const on = !(g.rush.pick && g.rush.mayhemPick);
        g.rush.pick = on;
        g.rush.mayhemPick = on;
        this.syncMap();
        return;
      }
      if (a === 'start') {
        if (!this.net?.host) return;
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
    pzLobby(this);
    // (el que llega se entera de si está elegido el rush de jefes)
    if (this.net?.host) this.g.rush?.sendPick?.();
  }
}
