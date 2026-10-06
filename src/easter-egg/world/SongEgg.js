import * as THREE from 'three';
import { assetUrl } from '../../lib/assets';
import { mergeByMaterial, compactGroup } from './props';

// Easter eggs musicales: tres cosas escondidas por el mapa; cuando el equipo
// encuentra las tres, suena una canción para todos. Son fáciles a propósito:
// se ven, tienen su cartelito y cualquiera puede encontrar cualquiera.
//   penal  → tres guitarras criollas olvidadas (comedor, patio, muelle): se
//            rasguean y suena "Canción para mate".
//   granja → tres escarapelas clavadas en las paredes de La Tapera (cocina,
//            galpón, atahona): se juntan y suena el himno.
//   torre  → tres amplificadores de guitarra (piso 2, 8 y 13): se les sube
//            el volumen y suena "Carry On".
//   castillo → tres anchos de espadas (el as de espadas del truco) en el gran
//            salón, la cocina y la bodega: se levantan y suena "Ace of Spades".
//   esteros → tres verduleras (acordeones de chamamé) en la barraca del
//            obraje, el rancho del pescador y la sala de la casona: se les abre el
//            fuelle y suena "Kilómetro 11".
// En línea lo lleva el anfitrión con el evento 'ee' ({ song }).
// Para sumar otro mapa: una entrada en SONGS (spots [x, z, giro, y?] apoyados o
// wall { cell, face, y? } en la pared), un método con el modelo (model) y otro
// con el sonido al tocarlo (sound: (out, t) => ...), y en el easter egg del mapa
// new SongEgg(game, id) con su update / applyRemote({ song }) / dispose.

// Mi, La, Re, Sol, Si, Mi (acorde de Mi menor, rasgueado)
const STRUM = [82.4, 123.5, 164.8, 196, 246.9, 329.6];

export const SONGS = {
  penal: {
    url: '/assets/sotano/secreto-penal.mp3',
    name: 'Canción para mate',
    prompt: 'rasguear la guitarra',
    // [x, z, giro]: la altura la da lo que haya abajo (mesa, piso)
    spots: [
      [36.4, 48.5, 0.35], // arriba de la mesa larga del comedor
      [60.4, 52.4, 0.08], // olvidada arriba del banco de piedra del patio de recreo (en el piso, el mástil atravesaba el banco)
      [29.5, 76.4, 1.9], // en el muelle, al lado de los cajones (más cerca se metía adentro de uno)
    ],
    model: 'guitar',
    sound: 'strum',
    spark: [1, 0.85, 0.5],
  },
  granja: {
    url: '/assets/sotano/secreto-granja.mp3',
    name: 'Himno',
    prompt: 'agarrar la escarapela',
    // clavadas en la pared: { cell, face } como las demás cosas de pared, a 1,7 m
    wall: [
      { cell: [30, 53], face: [0, -1] }, // cocina del rancho, pared del dormitorio
      { cell: [52, 55], face: [-1, 0] }, // galpón, pared del corral
      { cell: [15, 48], face: [-1, 0] }, // atahona, pared de la cocina
    ],
    model: 'escarapela',
    sound: 'chime',
    spark: [0.6, 0.85, 1],
    take: true,
  },
  torre: {
    url: '/assets/sotano/secreto-torre.mp3',
    name: 'Carry On',
    prompt: 'subir el volumen',
    // [x, z, giro, y del piso]: la torre necesita saber de qué piso (yOf(n) = (n - 1) * 4)
    spots: [
      [36.8, 35.3, -Math.PI / 2, 4], // piso 2: arriba de la mesa larga
      [38.2, 30.6, -Math.PI / 2, 28], // piso 8: contra la pared este, mirando al hueco
      [35.8, 39.6, Math.PI, 48], // piso 13: al lado del altar
    ],
    model: 'amp',
    sound: 'power',
    spark: [1, 0.45, 0.2],
  },
  castillo: {
    url: '/assets/sotano/secreto-castillo.mp3',
    name: 'Ace of Spades',
    prompt: 'levantar el ancho de espadas',
    spots: [
      [49.15, 41.25, 0.3, 28], // gran salón: en la punta de la mesa del banquete
      [63.5, 56.4, -0.5, 24], // cocina: arriba del barril del rincón
      [70.8, 66.6, 1.1, 20], // bodega: arriba del barril, al lado de los toneles
    ],
    model: 'naipe',
    sound: 'galope',
    spark: [0.7, 0.8, 1],
    take: true,
  },
  esteros: {
    url: '/assets/sotano/secreto-esteros.mp3',
    name: 'Kilómetro 11',
    prompt: 'abrir el fuelle de la verdulera',
    spots: [
      [43.2, 7.75, 0.4, 2], // la barraca del obraje: arriba de la mesa de los hacheros
      [60.6, 30.65, 0.7, 2], // la pesquería: en un rincón del rancho del pescador (sobre pilotes)
      [70.5, 10.35, 0.15, 2], // la sala de la casona: en la alfombra, entre los sillones
    ],
    model: 'verdulera',
    sound: 'fuelle',
    spark: [1, 0.55, 0.45],
  },
};

// Las canciones sonando: la pausa del juego suspende el contexto de audio y
// con eso se frenan (y siguen al volver), así no se adelantan en silencio.
const live = new Set();
// cómo cortar cada una: con la M el jugador las silencia (solo para él)
const cuts = new Set();
// todas las que suenan (de acá, de las escenas, de la Gran Guerra): suena una
// sola a la vez, la que arranca apaga a las otras (con Alt+I y Alt+K quedaban
// dos sonando juntas)
const songs = new Set();
let watched = null;

export const songOn = () => cuts.size > 0;

export function silenceSongs() {
  for (const cut of [...cuts]) cut();
}
function followPause(ctx) {
  if (watched === ctx) return;
  watched = ctx;
  ctx.addEventListener('statechange', () => {
    for (const el of live) {
      if (ctx.state === 'running') el.play().catch(() => {});
      else el.pause();
    }
  });
}

// Hace sonar un mp3 de /public por el bus de la música (con su volumen), de a
// poco (streaming, sin decodificarlo entero). Devuelve { el, stop, fade, level }
// o null. at: desde qué segundo (el que entra tarde a una canción que ya suena);
// fade(secs): se apaga de a poco y termina (sin avisar onEnd); level(v, secs):
// la sube o la baja sin cortarla (1 = normal). gain: con qué volumen arranca;
// cut: false para la música de las escenas (core/music.js), que la M no corta.
export function streamSong(g, url, onEnd, { at = 0, gain = 1, cut: cuttable = true } = {}) {
  const A = g.audio;
  if (!A?.ctx) return null;
  followPause(A.ctx);
  // (la que sonaba se apaga en un segundo y le avisa a quien la puso)
  for (const s of [...songs]) {
    songs.delete(s);
    s.fade(1);
    s.onEnd?.();
  }
  let el = null;
  let src = null;
  let vol = null;
  let cut = null;
  let fadeT = null;
  let me = null;
  const stop = () => {
    songs.delete(me);
    cuts.delete(cut);
    live.delete(el);
    clearTimeout(fadeT);
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    try {
      src?.disconnect();
      vol?.disconnect();
    } catch {
      /* ya estaba suelta */
    }
    el = null;
    src = null;
    vol = null;
  };
  const fade = (secs = 2) => {
    if (!vol) return;
    vol.gain.setTargetAtTime(0.0001, A.now, Math.max(0.05, secs / 4));
    clearTimeout(fadeT);
    fadeT = setTimeout(stop, secs * 1000 + 200);
  };
  const level = (v, secs = 1) => {
    if (vol && fadeT == null) vol.gain.setTargetAtTime(v, A.now, Math.max(0.05, secs / 4));
  };
  try {
    el = new Audio(assetUrl(url));
    el.preload = 'auto';
    if (at > 0) el.addEventListener('loadedmetadata', () => el && at < (el.duration || 0) - 1 && (el.currentTime = at), { once: true });
    src = A.ctx.createMediaElementSource(el);
    vol = A.ctx.createGain();
    vol.gain.value = gain;
    src.connect(vol).connect(A.music);
    live.add(el);
    me = { fade, onEnd };
    songs.add(me);
    // silenciada con la M: para el que la tenía es como si hubiera terminado
    cut = () => {
      stop();
      onEnd?.();
    };
    if (cuttable) cuts.add(cut);
    el.addEventListener('ended', () => {
      stop();
      onEnd?.();
    });
    el.play().catch(() => {
      stop();
      onEnd?.();
    });
  } catch {
    stop();
    return null;
  }
  return { get el() { return el; }, stop, fade, level };
}

const tmpV = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const restRay = new THREE.Raycaster();

export default class SongEgg {
  constructor(game, id) {
    this.g = game;
    this.C = SONGS[id];
    this.root = new THREE.Group();
    game.scene.add(this.root);
    const n = (this.C.spots || this.C.wall).length;
    this.found = Array.from({ length: n }, () => false);
    // (el invitado espera que el anfitrión se la anote)
    this.pending = new Set();
    this.playing = false;
    this.song = null;
    this.build();
  }

  get total() {
    return this.found.length;
  }

  // Altura de lo que hay justo abajo (una mesa, el piso del muelle). Recién
  // sirve en el primer update: antes la utilería no está en la escena.
  restY(x, z, y0) {
    const g = this.g;
    g.scene.updateMatrixWorld();
    restRay.set(tmpV.set(x, y0 + 1.4, z), DOWN);
    restRay.far = 3;
    const solids = [];
    g.scene.traverseVisible((o) => {
      if (o.isMesh && !o.material?.transparent && o.parent?.parent !== this.root) solids.push(o);
    });
    // (alguna malla degenerada da distancia NaN y desordena la lista: el más
    // cercano se busca a mano)
    let hit = null;
    for (const h of restRay.intersectObjects(solids, false)) if (Number.isFinite(h.distance) && (!hit || h.distance < hit.distance)) hit = h;
    return hit ? hit.point.y : y0;
  }

  mats() {
    if (this.M) return this.M;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.55, ...o });
    this.M = {
      top: std({ color: 0xd6a15e, roughness: 0.45 }),
      side: std({ color: 0x6a3a1c, roughness: 0.4 }),
      neck: std({ color: 0x3a2414 }),
      dark: std({ color: 0x120c08, roughness: 0.9 }),
      string: std({ color: 0xe8e2d0, metalness: 0.6, roughness: 0.3 }),
      peg: std({ color: 0xd8c690, metalness: 0.7, roughness: 0.3 }),
      celeste: std({ color: 0x74acdf, roughness: 0.7 }),
      blanco: std({ color: 0xf4f2ec, roughness: 0.7 }),
      pin: std({ color: 0xc8c8c0, metalness: 0.8, roughness: 0.3 }),
    };
    return this.M;
  }

  // Guitarra criolla acostada boca arriba (largo total ~1 m, a lo largo de +x).
  guitar() {
    const M = this.mats();
    const g = new THREE.Group();
    const bout = (r, x) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 28), M.side);
      m.position.set(x, 0.045, 0);
      g.add(m);
      const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.985, 28), M.top);
      top.rotation.x = -Math.PI / 2;
      top.position.set(x, 0.0905, 0);
      g.add(top);
    };
    bout(0.19, -0.22);
    bout(0.15, 0.04);
    // cintura: une las dos curvas
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.24), M.side);
    waist.position.set(-0.09, 0.045, 0);
    g.add(waist);
    const waistTop = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.235), M.top);
    waistTop.rotation.x = -Math.PI / 2;
    waistTop.position.set(-0.09, 0.0906, 0);
    g.add(waistTop);
    // boca, puente y diapasón
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), M.dark);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(-0.02, 0.0915, 0);
    g.add(hole);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.13), M.neck);
    bridge.position.set(-0.3, 0.097, 0);
    g.add(bridge);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.055), M.neck);
    neck.position.set(0.37, 0.075, 0);
    g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.022, 0.075), M.neck);
    head.position.set(0.68, 0.07, 0);
    head.rotation.z = -0.2;
    g.add(head);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6), M.peg);
        peg.rotation.x = Math.PI / 2;
        peg.position.set(0.63 + k * 0.045, 0.08 - k * 0.009, s * 0.05);
        g.add(peg);
      }
    }
    // cuerdas: del puente a la cejuela
    for (let k = 0; k < 6; k++) {
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.002, 0.002), M.string);
      str.position.set(0.15, 0.1, (k - 2.5) * 0.009);
      g.add(str);
    }
    return g;
  }

  // Escarapela celeste y blanca con sus dos cintitas, mirando a +z (clavada en la pared).
  escarapela() {
    const M = this.mats();
    const g = new THREE.Group();
    const ring = (r0, r1, mat, z) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28), mat);
      m.position.z = z;
      g.add(m);
    };
    // frunce de afuera (con dientecitos), blanco y el centro celeste
    const pleat = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), M.celeste);
    pleat.position.z = 0.004;
    g.add(pleat);
    ring(0.045, 0.072, M.blanco, 0.008);
    const center = new THREE.Mesh(new THREE.CircleGeometry(0.046, 20), M.celeste);
    center.position.z = 0.01;
    g.add(center);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.13), s < 0 ? M.celeste : M.blanco);
      tail.position.set(s * 0.028, -0.1, 0.002);
      tail.rotation.z = s * 0.25;
      g.add(tail);
    }
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.pin);
    pin.position.z = 0.014;
    g.add(pin);
    return g;
  }

  build() {
    const g = this.g;
    const C = this.C;
    const make = () => this[C.model]();
    const places = C.spots
      ? C.spots.map(([x, z, rot, y0 = 8]) => ({ x, y: g.world.floorAt(x, z, y0), z, rot, rest: true }))
      : C.wall.map((w) => {
          const a = g.world.wallAnchor(w.cell, w.face, 0.01);
          const fy = g.world.floorAt(w.cell[0] + 0.5 + w.face[0], w.cell[1] + 0.5 + w.face[1], w.y);
          return { x: a.x, y: fy + 1.7, z: a.z, rot: a.rot, floor: fy };
        });
    this.items = places.map((p, i) => {
      const obj = make();
      // (una malla por material: la guitarra eran 22 pedazos; la verdulera abre
      // el fuelle, queda como está)
      if (!obj.userData.play && !globalThis.__mduNoMerge) compactGroup(obj);
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = p.rot;
      this.root.add(obj);
      const it = g.interact.add({
        kind: 'song',
        pos: new THREE.Vector3(p.x, p.rest ? p.y + 0.3 : p.y, p.z),
        floorY: p.rest ? p.y : p.floor,
        radius: 1.6,
        prompt: () => (this.found[i] || this.pending.has(i) ? null : { text: C.prompt, noCost: true }),
        cost: () => 0,
        use: () => this.touch(i),
      });
      return { obj, it, rest: !!p.rest, pos: new THREE.Vector3(p.x, p.y + (p.rest ? 0.1 : 0), p.z) };
    });
  }

  // Lo de arriba de una mesa, apoyado en ella (una sola vez, con la utilería puesta).
  settle() {
    this.settled = true;
    for (const I of this.items) {
      if (!I.rest) continue;
      const y = this.restY(I.obj.position.x, I.obj.position.z, I.obj.position.y);
      I.obj.position.y = y;
      I.it.pos.y = y + 0.3;
      I.it.floorY = y;
      I.pos.y = y + 0.1;
    }
  }

  // Encontró una (el invitado se la pasa al anfitrión).
  touch(i) {
    const g = this.g;
    if (this.found[i] || this.pending.has(i)) return false;
    this.feedback(i);
    if (g.net?.guest) {
      this.pending.add(i);
      g.net.share('ee', { song: { hit: i } });
      return true;
    }
    this.mark(i);
    return true;
  }

  // El sonido y el brillo de cada una (y la escarapela se va a la mano).
  feedback(i) {
    const g = this.g;
    const A = g.audio;
    const I = this.items[i];
    g.fx.sparkle(I.pos, this.C.spark || [1, 0.9, 0.6], 6, 0.4);
    if (this.C.take) I.obj.visible = false;
    // (la verdulera abre y cierra el fuelle)
    if (I.obj.userData.play) I.playT = 0;
    if (!A?.ctx) return;
    const out = A.out({ pos: I.pos, gain: 0.9, reverb: 0.35 });
    this[this.C.sound]?.(out, A.now);
  }

  // Rasgueo de la guitarra.
  strum(out, t) {
    const A = this.g.audio;
    STRUM.forEach((f, k) => {
      A.tone(out, { t: t + k * 0.03, dur: 2.2, freq: f, gain: 0.09, attack: 0.004, type: 'triangle' });
      A.tone(out, { t: t + k * 0.03, dur: 0.9, freq: f * 2, gain: 0.03, attack: 0.003, type: 'sine' });
    });
  }

  // Campanita de tres notas que sube (una por cada escarapela encontrada).
  chime(out, t) {
    const A = this.g.audio;
    const n = this.found.filter(Boolean).length + this.pending.size;
    [523.3, 659.3, 784].slice(0, Math.max(1, Math.min(3, n + 1))).forEach((f, k) => {
      A.tone(out, { t: t + k * 0.12, dur: 1.1, freq: f, gain: 0.08, attack: 0.004, type: 'sine' });
      A.tone(out, { t: t + k * 0.12, dur: 0.5, freq: f * 3, gain: 0.02, attack: 0.002, type: 'sine' });
    });
  }

  // Amplificador de guitarra (~0,5 m) mirando a +z: el mueble forrado, la
  // tela de la parrilla, el panel dorado con perillas, la manija y las esquineras.
  amp() {
    const g = new THREE.Group();
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
    const tolex = std({ color: 0x141414, roughness: 0.85 });
    const cloth = std({ color: 0x2a2622, roughness: 1 });
    const gold = std({ color: 0xc8a24a, metalness: 0.8, roughness: 0.35 });
    const knob = std({ color: 0x0c0c0c, roughness: 0.4 });
    const metal = std({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.3 });
    const W = 0.52;
    const H = 0.44;
    const D = 0.26;
    const box = (w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      g.add(b);
      return b;
    };
    box(W, H, D, tolex, 0, H / 2, 0);
    // la parrilla con sus rayitas
    box(W - 0.06, H - 0.14, 0.01, cloth, 0, (H - 0.1) / 2, D / 2 + 0.004);
    for (let k = 0; k < 7; k++) box(W - 0.07, 0.004, 0.004, std({ color: 0x3a342c }), 0, 0.05 + k * 0.04, D / 2 + 0.01);
    // el panel de arriba con las perillas y la luz
    box(W - 0.04, 0.07, 0.012, gold, 0, H - 0.05, D / 2 + 0.005);
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.02, 10), knob);
      p.rotation.x = Math.PI / 2;
      p.position.set(-0.19 + k * 0.065, H - 0.05, D / 2 + 0.02);
      g.add(p);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a10 }));
    led.position.set(0.23, H - 0.05, D / 2 + 0.015);
    g.add(led);
    // el logo, la manija y las esquineras
    box(0.12, 0.03, 0.006, metal, -0.16, H - 0.13, D / 2 + 0.01);
    box(0.2, 0.025, 0.04, tolex, 0, H + 0.015, 0);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) box(0.035, 0.035, 0.035, metal, sx * (W / 2 - 0.01), sy ? H - 0.01 : 0.01, sz * (D / 2 - 0.01));
    return g;
  }

  // El ancho de espadas de la baraja española, boca arriba (un poco más grande
  // que uno de verdad, para que se vea).
  naipe() {
    if (!this.cardMat) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 192;
      const x = c.getContext('2d');
      x.fillStyle = '#f2ead6';
      x.fillRect(0, 0, 128, 192);
      // el marco con los dos cortes de las espadas
      x.strokeStyle = '#2a4a8a';
      x.lineWidth = 3;
      x.strokeRect(8, 8, 112, 176);
      x.fillStyle = '#f2ead6';
      for (const [px, py] of [[40, 4], [72, 4], [40, 178], [72, 178]]) x.fillRect(px, py, 16, 10);
      // la espada: la hoja para abajo, la cruz colorada, el puño azul y el pomo dorado
      x.save();
      x.translate(64, 96);
      x.rotate(-0.25);
      x.fillStyle = '#9ab0c8';
      x.beginPath();
      x.moveTo(-7, -8);
      x.lineTo(7, -8);
      x.lineTo(4, 58);
      x.lineTo(0, 70);
      x.lineTo(-4, 58);
      x.closePath();
      x.fill();
      x.strokeStyle = '#5a6a80';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(0, -6);
      x.lineTo(0, 62);
      x.stroke();
      x.fillStyle = '#c0282a';
      x.fillRect(-26, -16, 52, 8);
      x.fillStyle = '#e0b040';
      x.fillRect(-28, -17, 6, 10);
      x.fillRect(22, -17, 6, 10);
      x.fillStyle = '#23408a';
      x.fillRect(-5, -44, 10, 28);
      x.fillStyle = '#e0b040';
      x.beginPath();
      x.arc(0, -50, 8, 0, Math.PI * 2);
      x.fill();
      x.restore();
      // el número en las puntas
      x.fillStyle = '#c0282a';
      x.font = 'bold 22px Georgia, serif';
      x.fillText('1', 14, 34);
      x.save();
      x.translate(114, 158);
      x.rotate(Math.PI);
      x.fillText('1', 0, 0);
      x.restore();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.cardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 });
    }
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.225).rotateX(-Math.PI / 2), this.cardMat);
    face.position.y = 0.005;
    g.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.003, 0.225), this.mats().blanco);
    back.position.y = 0.002;
    g.add(back);
    return g;
  }

  // El naipe contra la mesa y el bajo galopando, con distorsión (una nota más
  // arriba por cada ancho encontrado).
  galope(out, t) {
    const A = this.g.audio;
    const n = this.found.filter(Boolean).length + this.pending.size;
    A.noise?.(out, { t, dur: 0.05, type: 'highpass', freq: 2500, gain: 0.25 });
    const f = [55, 65.4, 73.4][Math.min(2, n)];
    for (let k = 0; k < 4; k++) {
      A.tone(out, { t: t + 0.08 + k * 0.11, dur: 0.1, freq: f, gain: 0.08, attack: 0.003, type: 'sawtooth' });
      A.tone(out, { t: t + 0.08 + k * 0.11, dur: 0.1, freq: f * 2, gain: 0.04, attack: 0.003, type: 'square' });
    }
  }

  // Un power chord con distorsión (uno más agudo por cada amplificador encontrado).
  power(out, t) {
    const A = this.g.audio;
    const n = this.found.filter(Boolean).length + this.pending.size;
    const root = [82.4, 98, 110][Math.min(2, n)];
    for (const [f, gain] of [[root, 0.07], [root * 1.5, 0.05], [root * 2, 0.04]]) {
      A.tone(out, { t, dur: 1.1, freq: f, gain, attack: 0.004, type: 'sawtooth' });
      A.tone(out, { t: t + 0.004, dur: 1, freq: f * 1.006, gain: gain * 0.6, attack: 0.004, type: 'square' });
    }
  }

  // Verdulera de chamamé (~0,36 m) parada sobre su canto, el frente a +z: la
  // caja de los botones a +x (rejilla cromada, dos hileras de botones), la de
  // los bajos a -x con su correa y el fuelle negro de pliegues en el medio
  // (con cinta clara y esquineros). userData.play(k) abre y cierra el fuelle.
  verdulera() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
    this.accM ||= {
      red: std({ color: 0x8a1212, roughness: 0.28, metalness: 0.15 }),
      black: std({ color: 0x151313, roughness: 0.85 }),
      cream: std({ color: 0xe6d8b8, roughness: 0.7 }),
      chrome: std({ color: 0xd4d4d4, metalness: 0.9, roughness: 0.25 }),
      pearl: std({ color: 0xf4eee2, roughness: 0.3 }),
      leather: std({ color: 0x4a2a14, roughness: 0.85 }),
    };
    const M = this.accM;
    const H = 0.34;
    const D = 0.17;
    const W = 0.23;
    const box = (grp, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      grp.add(b);
    };
    const btn = (grp, x, y, z, alongX) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 8), M.pearl);
      if (alongX) b.rotation.z = Math.PI / 2;
      else b.rotation.x = Math.PI / 2;
      b.position.set(x, y, z);
      grp.add(b);
    };
    const end = (w) => {
      const e = new THREE.Group();
      box(e, w, H, D, M.red, 0, H / 2, 0);
      for (const y of [0.006, H - 0.006]) box(e, w + 0.004, 0.012, D + 0.004, M.chrome, 0, y, 0);
      return e;
    };
    const g = new THREE.Group();
    const treble = end(0.07);
    box(treble, 0.05, 0.2, 0.004, M.chrome, 0, 0.19, D / 2 + 0.002);
    for (let k = 0; k < 5; k++) box(treble, 0.04, 0.006, 0.003, M.black, 0, 0.12 + k * 0.035, D / 2 + 0.0045);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 10; k++) btn(treble, row ? 0.013 : -0.013, 0.05 + k * 0.026 + row * 0.013, -D / 2 - 0.005, false);
    mergeByMaterial(treble);
    const bass = end(0.06);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) btn(bass, -0.036, 0.21 + k * 0.026, -0.045 + r * 0.026, true);
    box(bass, 0.006, 0.26, 0.045, M.leather, -0.034, 0.16, 0.045);
    box(bass, 0.008, 0.02, 0.03, M.chrome, -0.038, 0.1, 0.045);
    mergeByMaterial(bass);
    const bel = new THREE.Group();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + ((k + 0.5) * W) / n;
      box(bel, 0.011, H - 0.01, D - 0.004, M.black, x, H / 2, 0);
      if (k < n - 1) box(bel, W / n - 0.01, H - 0.035, D - 0.03, M.black, x + W / (2 * n), H / 2, 0);
      for (const y of [0.008, H - 0.008]) box(bel, 0.012, 0.006, D - 0.002, M.cream, x, y, 0);
      for (const s of [-1, 1]) {
        box(bel, 0.012, H - 0.03, 0.004, M.cream, x, H / 2, s * (D / 2 - 0.001));
        for (const y of [0.012, H - 0.012]) box(bel, 0.014, 0.016, 0.016, M.chrome, x, y, s * (D / 2 - 0.008));
      }
    }
    mergeByMaterial(bel);
    g.add(treble, bass, bel);
    const rest = (s) => {
      bel.scale.x = s;
      treble.position.x = (W * s) / 2 + 0.035;
      bass.position.x = -(W * s) / 2 - 0.03;
    };
    rest(1);
    g.userData.play = (k) => rest(1 + 0.45 * Math.sin(Math.PI * Math.min(1, k)));
    return g;
  }

  // Un acorde de chamamé con el aire del fuelle (La, Re y Mi: uno por cada
  // verdulera encontrada), en el ritmo de "chan... chan-chan".
  fuelle(out, t) {
    const A = this.g.audio;
    const n = this.found.filter(Boolean).length + this.pending.size;
    const root = [110, 146.8, 164.8][Math.min(2, n)];
    A.noise?.(out, { t, dur: 0.4, type: 'bandpass', freq: 700, q: 0.8, gain: 0.05, attack: 0.08 });
    for (const [at, dur] of [[0.03, 0.33], [0.39, 0.16], [0.57, 1.1]]) {
      for (const [m, gain] of [[2, 0.03], [2.52, 0.022], [3, 0.022], [4, 0.018]]) {
        for (const detune of [-9, 9]) A.tone(out, { t: t + at, dur, freq: root * m, gain, attack: 0.05, type: 'sawtooth', detune });
      }
      A.tone(out, { t: t + at, dur, freq: root, gain: 0.05, attack: 0.03, type: 'square' });
    }
  }

  // Solo el anfitrión (o jugando solo): anota y avisa a todos.
  mark(i) {
    const g = this.g;
    this.found[i] = true;
    g.net?.event('ee', { song: { f: this.found.map((v) => (v ? 1 : 0)) } });
    this.progress(this.found.filter(Boolean).length);
  }

  progress(n) {
    const g = this.g;
    if (n < this.total) {
      g.hud.toast(`♪ ${n} de ${this.total}`);
      return;
    }
    this.play();
  }

  applyRemote(s) {
    const g = this.g;
    if (s.hit !== undefined) {
      // un invitado encontró una: la anota el anfitrión (que se la reparte a todos)
      if (!g.net?.guest && !this.found[s.hit]) {
        this.feedback(s.hit);
        this.mark(s.hit);
      }
      return;
    }
    if (s.f) {
      const was = this.found;
      const before = was.filter(Boolean).length;
      const next = s.f.map(Boolean);
      // la que tocó otro (o yo, que la usa el anfitrión): suena y brilla acá también
      next.forEach((v, i) => v && !was[i] && !this.pending.has(i) && this.feedback(i));
      this.found = next;
      if (this.C.take) this.found.forEach((v, i) => v && (this.items[i].obj.visible = false));
      this.pending.clear();
      const n = this.found.filter(Boolean).length;
      if (n > before) this.progress(n);
    }
  }

  // La canción: se escucha de a poco (streaming) por el bus de la música.
  play() {
    const g = this.g;
    const A = g.audio;
    if (this.playing || !A?.ctx) return;
    this.playing = true;
    g.hud.toast(`♪ ${this.C.name}`);
    this.song = streamSong(g, this.C.url, () => {
      this.playing = false;
      this.song = null;
    });
    if (!this.song) this.playing = false;
  }

  get el() {
    return this.song?.el || null;
  }

  stop() {
    this.playing = false;
    this.song?.stop();
    this.song = null;
  }

  update(dt = 0.016) {
    if (!this.settled) this.settle();
    for (const I of this.items) {
      if (I.playT == null) continue;
      I.playT += dt;
      I.obj.userData.play(I.playT / 1.6);
      if (I.playT > 1.6) I.playT = null;
    }
  }

  dispose() {
    this.stop();
    this.root.removeFromParent();
  }
}
