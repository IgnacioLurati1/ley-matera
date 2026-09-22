// Conexión directa entre navegadores (WebRTC). No hay servidor de juego: la
// compu del anfitrión simula todo y los demás se conectan a ella.
// Dos canales: uno confiable y ordenado para los avisos importantes (compras,
// puertas, rondas) y otro rápido que puede perder paquetes para las posiciones.

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// Espera a que termine de juntar los caminos de red para mandar todo junto
// (así el código de conexión es uno solo y no hace falta ir y venir).
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 2500);
  });
}

export function createPeer() {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const peer = {
    pc,
    reliable: null,
    fast: null,
    onMessage: null,
    onClose: null,
    closed: false,
    send(obj) {
      const c = peer.reliable;
      if (c?.readyState === 'open') c.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    },
    sendFast(buf) {
      const c = peer.fast;
      if (c?.readyState === 'open') {
        try {
          c.send(buf);
        } catch {
          /* se llenó el buffer: el próximo paquete lo reemplaza */
        }
      }
    },
    close() {
      if (peer.closed) return;
      peer.closed = true;
      try {
        pc.close();
      } catch {
        /* ya estaba cerrada */
      }
      peer.onClose?.();
    },
  };
  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) peer.close();
  });
  return peer;
}

function wire(peer, chan) {
  if (chan.label === 'fast') {
    chan.binaryType = 'arraybuffer';
    peer.fast = chan;
  } else peer.reliable = chan;
  chan.addEventListener('message', (e) => peer.onMessage?.(e.data));
  chan.addEventListener('close', () => peer.close());
}

// Lado anfitrión: crea los canales y devuelve la oferta.
export async function makeOffer(peer) {
  wire(peer, peer.pc.createDataChannel('main', { ordered: true }));
  wire(peer, peer.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  await gathered(peer.pc);
  return peer.pc.localDescription;
}

// Lado invitado: contesta la oferta del anfitrión.
export async function makeAnswer(peer, offer) {
  peer.pc.addEventListener('datachannel', (e) => wire(peer, e.channel));
  await peer.pc.setRemoteDescription(offer);
  const answer = await peer.pc.createAnswer();
  await peer.pc.setLocalDescription(answer);
  await gathered(peer.pc);
  return peer.pc.localDescription;
}

export async function acceptAnswer(peer, answer) {
  await peer.pc.setRemoteDescription(answer);
}

// Espera a que los dos canales estén abiertos (o se corta).
export function waitOpen(peer, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const check = () => {
      if (peer.closed) return reject(new Error('Se cortó la conexión'));
      if (peer.reliable?.readyState === 'open' && peer.fast?.readyState === 'open') return resolve(peer);
      if (Date.now() - t0 > timeout) return reject(new Error('No se pudo conectar'));
      return setTimeout(check, 120);
    };
    check();
  });
}

// ---------------- códigos ----------------
// El SDP se comprime y se pasa a base64 para que el código sea manejable
// cuando no hay dónde dejarlo (modo sin servidor, copiar y pegar).
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function packCode(desc) {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return `r${b64(bytes)}`;
  const cs = new CompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return `z${b64(new Uint8Array(buf))}`;
}

export async function unpackCode(code) {
  const body = unb64(code.slice(1).trim());
  let bytes = body;
  if (code[0] === 'z') {
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([body]).stream().pipeThrough(ds)).arrayBuffer();
    bytes = new Uint8Array(buf);
  }
  const { t, s } = JSON.parse(new TextDecoder().decode(bytes));
  return { type: t, sdp: s };
}
