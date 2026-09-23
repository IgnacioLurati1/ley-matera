import { createPeer, makeOffer, makeAnswer, acceptAnswer, waitOpen, packCode, unpackCode } from './rtc';

// Sala de hasta 5 jugadores. La compu del anfitrión es el "servidor": simula
// todo y les manda el estado a los demás. Para encontrarse hay dos caminos:
//   · con código de sala corto, si el sitio trae un canal de encuentro
//     (`signal`, lo pone la tienda con Supabase);
//   · sin nada de eso: el anfitrión copia un código largo y el invitado le
//     devuelve otro (copiar y pegar por WhatsApp).
// Una vez conectados, los datos van directo de una compu a la otra.

export const MAX_PLAYERS = 5;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Los nombres llegan de otras compus: se dejan cortos y sin caracteres de HTML.
export function cleanName(name, fallback = 'Matero') {
  const s = String(name ?? '')
    .replace(/[<>&"'`]/g, '')
    .trim()
    .slice(0, 12);
  return s || fallback;
}

export function randomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export default class Net {
  constructor({ role, signal, code, name }) {
    this.role = role; // 'host' | 'guest'
    this.signal = signal || null;
    this.code = code || null;
    this.name = cleanName(name, 'Jugador');
    this.peers = new Map(); // id -> peer (en el anfitrión); en el invitado: 'host'
    this.handlers = new Map();
    this.players = new Map(); // id -> { id, name, ping }
    this.id = role === 'host' ? 0 : -1;
    this.nextId = 1;
    this.onPlayers = null;
    this.onStatus = null;
    this.closed = false;
  }

  get host() {
    return this.role === 'host';
  }

  get guest() {
    return this.role === 'guest';
  }

  get count() {
    return this.host ? this.peers.size + 1 : this.players.size;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
    // lo que llegó antes de que la partida escuchara (ej. el estado del mundo
    // al entrar a una partida ya empezada) se entrega ahora
    const early = this.early?.filter((e) => e.msg.t === type);
    if (!early?.length) return;
    this.early = this.early.filter((e) => e.msg.t !== type);
    for (const e of early) fn(e.msg, e.from);
  }

  status(text) {
    this.onStatus?.(text);
  }

  // ---------------- anfitrión ----------------
  // Abre la sala y queda esperando invitados.
  async startHost() {
    this.code = this.code || randomCode();
    this.players.set(0, { id: 0, name: this.name });
    if (!this.signal) return this.code;
    await this.signal.open(this.code, (msg) => this.onSignal(msg));
    this.status(`Sala ${this.code} abierta. Esperando jugadores...`);
    return this.code;
  }

  async onSignal(msg) {
    if (!this.host) return;
    // los saludos vienen sin destinatario; las respuestas, dirigidas a la sala
    if (msg.t === 'answer' && msg.to !== this.code) return;
    if (msg.t === 'hello') {
      if (this.peers.size + 1 >= MAX_PLAYERS) {
        this.signal.send({ t: 'full', to: msg.from });
        return;
      }
      const id = this.nextId++;
      const peer = createPeer();
      const offer = await makeOffer(peer);
      this.attach(peer, id, msg.name);
      this.pending = this.pending || new Map();
      this.pending.set(msg.from, { peer, id });
      this.signal.send({ t: 'offer', to: msg.from, from: this.code, id, sdp: offer.sdp, type: offer.type });
    } else if (msg.t === 'answer') {
      const p = this.pending?.get(msg.from);
      if (!p) return;
      this.pending.delete(msg.from);
      await acceptAnswer(p.peer, { type: msg.type, sdp: msg.sdp });
      waitOpen(p.peer).catch(() => p.peer.close());
    }
  }

  // Conecta a un invitado por código largo (sin canal de encuentro).
  async hostManualOffer() {
    const id = this.nextId++;
    const peer = createPeer();
    const offer = await makeOffer(peer);
    this.manual = { peer, id };
    return packCode(offer);
  }

  async hostManualAccept(code, name = 'Invitado') {
    const { peer, id } = this.manual || {};
    if (!peer) throw new Error('Primero creá el código');
    await acceptAnswer(peer, await unpackCode(code));
    this.attach(peer, id, name);
    await waitOpen(peer);
    this.manual = null;
    return id;
  }

  attach(peer, id, name) {
    peer.id = id;
    this.peers.set(id, peer);
    this.players.set(id, { id, name: cleanName(name, `Jugador ${id + 1}`) });
    peer.onMessage = (data) => this.receive(id, data);
    peer.onClose = () => {
      if (this.peers.get(id) !== peer) return;
      this.peers.delete(id);
      this.players.delete(id);
      this.handlers.get('leave')?.({ id });
      this.broadcast({ t: 'players', list: [...this.players.values()] });
      this.onPlayers?.([...this.players.values()]);
      this.status(`Se fue ${name || 'un jugador'}`);
    };
    // apenas abre el canal, se le manda el estado inicial
    waitOpen(peer)
      .then(() => {
        this.handlers.get('join')?.({ id, peer });
        this.broadcast({ t: 'players', list: [...this.players.values()] });
        this.onPlayers?.([...this.players.values()]);
        this.status(`Se unió ${this.players.get(id)?.name}`);
      })
      .catch(() => peer.close());
  }

  // ---------------- invitado ----------------
  async joinRoom(code) {
    this.code = code.trim().toUpperCase();
    if (!this.signal) throw new Error('Este sitio no tiene salas por código');
    const mine = randomCode(6);
    this.myTag = mine;
    const peer = createPeer();
    peer.onMessage = (data) => this.receive(0, data);
    peer.onClose = () => this.handlers.get('hostgone')?.();
    this.peer = peer;
    const done = new Promise((resolve, reject) => {
      this.resolveJoin = resolve;
      this.rejectJoin = reject;
      setTimeout(() => reject(new Error('No contestó ninguna sala con ese código')), 15000);
    });
    await this.signal.open(this.code, async (msg) => {
      if (msg.to !== mine) return;
      if (msg.t === 'full') this.rejectJoin?.(new Error('La sala está llena'));
      if (msg.t !== 'offer') return;
      this.id = msg.id;
      const answer = await makeAnswer(peer, { type: msg.type, sdp: msg.sdp });
      this.signal.send({ t: 'answer', to: this.code, from: mine, sdp: answer.sdp, type: answer.type });
      waitOpen(peer).then(() => this.resolveJoin?.(peer), (e) => this.rejectJoin?.(e));
    });
    this.status('Buscando la sala...');
    this.signal.send({ t: 'hello', from: mine, name: this.name });
    await done;
    this.status('Conectado');
    return peer;
  }

  // Invitado por código largo: genera su respuesta a partir del código del anfitrión.
  async guestManualAnswer(code) {
    const peer = createPeer();
    peer.onMessage = (data) => this.receive(0, data);
    peer.onClose = () => this.handlers.get('hostgone')?.();
    this.peer = peer;
    const answer = await makeAnswer(peer, await unpackCode(code));
    this.waitingOpen = waitOpen(peer);
    return packCode(answer);
  }

  // ---------------- mensajes ----------------
  receive(from, data) {
    if (typeof data !== 'string') {
      this.handlers.get('snapshot')?.(data, from);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.t === 'players' && this.guest && Array.isArray(msg.list)) {
      const list = msg.list.map((p) => ({ id: p.id | 0, name: cleanName(p.name, `Jugador ${(p.id | 0) + 1}`) }));
      this.players = new Map(list.map((p) => [p.id, p]));
      this.onPlayers?.(list);
      return;
    }
    // el invitado se presenta (en el modo manual el anfitrión no sabe cómo se llama)
    if (msg.t === 'name' && this.host) {
      const p = this.players.get(from);
      if (!p) return;
      p.name = cleanName(msg.name, p.name);
      const list = [...this.players.values()];
      this.broadcast({ t: 'players', list });
      this.onPlayers?.(list);
      return;
    }
    const h = this.handlers.get(msg.t);
    if (h) h(msg, from);
    else if (this.guest) {
      this.early = this.early || [];
      if (this.early.length < 64) this.early.push({ msg, from });
    }
  }

  send(msg) {
    if (this.guest) this.peer?.send(msg);
    else this.broadcast(msg);
  }

  // A todos menos a `except`.
  broadcast(msg, except = -1) {
    const s = JSON.stringify(msg);
    for (const [id, p] of this.peers) if (id !== except) p.send(s);
  }

  to(id, msg) {
    this.peers.get(id)?.send(msg);
  }

  sendFast(buf, except = -1) {
    if (this.guest) this.peer?.sendFast(buf);
    else for (const [id, p] of this.peers) if (id !== except) p.sendFast(buf);
  }

  close() {
    this.closed = true;
    for (const p of this.peers.values()) p.close();
    this.peer?.close();
    this.signal?.close?.();
  }
}
