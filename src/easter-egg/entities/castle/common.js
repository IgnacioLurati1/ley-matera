import * as THREE from 'three';
import { ZONES } from '../../config/map';

// Cosas que usan todas las partes del easter egg del castillo.

export const ELEMENTS = ['fuego', 'viento', 'rayo', 'hielo'];
// qué mate sale de cada elemento
export const MATE_OF = { fuego: 'pillan', viento: 'zonda', rayo: 'illapa', hielo: 'penitente' };
export const ELEM_OF = { pillan: 'fuego', zonda: 'viento', illapa: 'rayo', penitente: 'hielo' };
export const ELEM_NAME = { fuego: 'Pillán', viento: 'Zonda', rayo: 'Illapa', hielo: 'Penitente' };
export const ELEM_COLOR = { fuego: 0xff6a1a, viento: 0x8affb8, rayo: 0xffe45a, hielo: 0x9adcff };
export const ELEM_RGB = { fuego: [1, 0.5, 0.15], viento: [0.6, 1, 0.75], rayo: [1, 0.92, 0.45], hielo: [0.66, 0.88, 1] };

// Brillo redondo (sprite aditivo).
export function glow(T, color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
  s.scale.setScalar(size);
  return s;
}

// Anillo en el piso (marca de lugar), aditivo.
export function ring(r, color, width = 0.22) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - width, r, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  m.renderOrder = 2;
  return m;
}

// Jugadores vivos: el local y los de la red (con id, pos y nombre).
export function players(g) {
  const list = [];
  if (g.player.alive) list.push({ id: g.net?.id ?? 0, pos: g.player.pos, me: true, name: 'vos' });
  if (g.net) for (const r of g.net.remote.values()) if (!r.dead) list.push({ id: r.id, pos: r.pos, me: false, name: r.name || g.net.nameOf(r.id), downed: r.downed });
  return list;
}

// La posición de un jugador por id (el local o uno de la red).
export function playerPos(g, id) {
  if ((g.net?.id ?? 0) === id) return g.player.pos;
  return g.net?.remote.get(id)?.pos || null;
}

export function myId(g) {
  return g.net?.id ?? 0;
}

export function isHost(g) {
  return !g.net?.guest;
}

// Un cartel en pantalla para todos (el anfitrión lo reparte).
export function announce(g, text, secs = 3, sting = false) {
  g.hud.subtitle(text, secs);
  if (sting) g.audio.sting();
  g.net?.event('sub', { x: text, d: secs, s: sting ? 1 : 0 });
}

export function toastAll(g, text) {
  g.hud.toast(text);
  g.audio.sting();
  g.net?.event('toast', { x: text });
}

// ¿El tiro (origen, dirección, largo) pasa por la esfera c/r? Devuelve la
// distancia o -1.
const tmpR = new THREE.Vector3();
export function rayHit(o, d, maxT, c, r) {
  tmpR.subVectors(c, o);
  const t = tmpR.dot(d);
  if (t < 0 || t > maxT + r) return -1;
  const d2 = tmpR.lengthSq() - t * t;
  return d2 <= r * r ? t : -1;
}

// Un blanco (veleta, campana, aguja) cuenta una vez por disparo: la escopeta
// manda un tiro por perdigón y la ráfaga pega varias veces seguidas. true si
// este golpe cuenta.
export function firstHit(g, last, i, gap = 0.3) {
  if (g.time - (last[i] ?? -99) < gap) return false;
  last[i] = g.time;
  return true;
}

// Celdas de piso libres de una zona (para lo que anda suelto por ahí).
export function freeCells(w, zone) {
  const zi = w.zoneKeys.indexOf(zone);
  const list = [];
  for (let i = 0; i < w.zone.length; i++) if (w.zone[i] === zi && !w.navBlock[i]) list.push(i);
  return list;
}

// El lugar (la zona) donde está un punto, para los carteles y las pistas: "el Palenque".
export function placeOf(g, p) {
  const w = g.world;
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  if (!w.inside(x, z)) return '';
  const k = w.zone[w.idx(x, z)];
  const Z = k >= 0 ? ZONES[w.zoneKeys[k]] : null;
  return Z ? Z.name.charAt(0).toLowerCase() + Z.name.slice(1) : '';
}

// "de" + el lugar, con la contracción: "del Palenque", "de la Caballeriza".
export const deP = (p) => (p.startsWith('el ') ? `del ${p.slice(3)}` : `de ${p}`);

// El jugador (local o de la red) que tiene cierto id, con su estado.
export function playerById(g, id) {
  return players(g).find((p) => p.id === id) || null;
}

// ¿Está caído (o muerto, o se fue)?
export function isDown(g, id) {
  const p = playerById(g, id);
  if (!p) return true;
  return p.me ? g.player.downed : !!p.downed;
}
