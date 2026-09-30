import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { makePose, solvePose } from '../entities/skeleton';
import { PLAYER_START } from '../config/map';
import { buildChiqui, chiquiGiggle } from '../world/Chiqui';
import { crewIds } from './cineCrew';

// Los guiones de las cinemáticas de entrada (ui/Intro.js), uno por mapa.
// Cada guion arma lo suyo (escondido) y devuelve:
//  · title / place: el nombre del mapa y la línea de abajo;
//  · shots: las tomas en orden. d: segundos. cam / look: recorrido de la
//    cámara y a dónde mira (puntos; con más de dos, curva). fn: cámara a
//    mano. black: pantalla negra. fadeIn / fadeOut: fundidos. fog: niebla
//    (1 = la de siempre). fov. where: el sello de abajo. wake: la última,
//    que termina en los ojos del jugador. enter / tick: lo que pasa.
//  · cues: [segundo, acción] (carteles, sonidos); o, en cada toma, at:
//    [segundo de la toma, acción].
//  · start / tick / stop / warm / dispose.
// La historia: un hombre (Francisco, aunque nadie lo sabe) trae a los gauchos
// al molino sin decir una palabra; en la tapera hay que hacer una yerba más
// fuerte; en el penal, recuperar el mate; en la torre, bajar a la Voz.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

// ---------------- muñecos ----------------
// Un gaucho de la escena: el mismo muñeco que los compañeros de la red
// (net/Avatars), pero con la pose puesta a mano cada cuadro.
function puppet(people, id) {
  people.add({ id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false });
  const a = people.list.get(id);
  a.P = makePose();
  a.group.visible = false;
  a.hand.visible = false;
  return a;
}

// Pone la pose `a.P` en (x, z) mirando hacia `yaw` (el frente del muñeco es +z).
function place(a, x, z, yaw) {
  solvePose(a.mats, x, z, yaw, 1, a.P);
  for (const m of a.parts) {
    m.matrix.copy(a.mats[m.part]);
    m.matrixWorldNeedsUpdate = true;
  }
  a.hand.matrix.copy(a.mats[6]);
  a.hand.matrixWorldNeedsUpdate = true;
  for (const e of a.extras) {
    e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
    e.obj.matrixWorldNeedsUpdate = true;
  }
}

// Arriba del pecho de uno tirado boca arriba (el frente del torso mira al cielo).
function chestAt(a, out) {
  return out.set(0, 0.03, 0.22).applyMatrix4(a.mats[1]);
}

// Dónde queda la mano (punta del antebrazo): 5 la izquierda del muñeco, 6 la derecha.
function handAt(a, part, out) {
  return out.set(0, -0.19, 0).applyMatrix4(a.mats[part]);
}

function stand(P) {
  Object.assign(P, { rootY: 0, rootPitch: 0, rootRoll: 0, hipY: 0.93, torsoP: 0.04, torsoY: 0, torsoR: 0, headP: 0, headY: 0, headR: 0, shLp: -0.08, shLr: 0.1, shRp: -0.08, shRr: -0.1, elL: -0.2, elR: -0.2, hipLp: 0, hipLr: 0, hipRp: 0, hipRr: 0, knL: 0.05, knR: 0.05 });
}

// Caminar de persona (no de muerto): brazos al costado, paso tranquilo.
function walk(P, ph, k = 1) {
  const s = Math.sin(ph);
  stand(P);
  P.hipY = 0.93 + Math.abs(Math.cos(ph)) * 0.02 * k;
  P.torsoY = s * 0.08 * k;
  P.torsoR = s * 0.03 * k;
  P.hipLp = s * 0.42 * k;
  P.hipRp = -s * 0.42 * k;
  P.knL = 0.06 + Math.max(0, Math.sin(ph + 1.4)) * 0.62 * k;
  P.knR = 0.06 + Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * 0.62 * k;
  P.shLp = -s * 0.32 * k;
  P.shRp = s * 0.32 * k;
}

// Tirado boca arriba: el frente (la cara) mira al cielo y la cabeza va hacia -z del muñeco.
function lie(P, t = 0) {
  stand(P);
  P.rootPitch = -Math.PI / 2 + 0.04;
  P.rootY = 0.13;
  P.headY = 0.35 + Math.sin(t * 0.7) * 0.03;
  P.shLp = 0.1;
  P.shLr = 0.28;
  P.shRp = 0.05;
  P.shRr = -0.35;
  P.elL = -0.3;
  P.elR = -0.15;
  P.hipLr = 0.06;
  P.hipRr = -0.08;
  P.knL = 0.15;
  P.knR = 0.05;
}

// Pone un muñeco tirado con la cabeza en (hx, hz) y los pies hacia `yaw`.
function lieAt(a, hx, hz, yaw, t) {
  lie(a.P, t);
  place(a, hx + Math.sin(yaw) * 1.66, hz + Math.cos(yaw) * 1.66, yaw);
}

// La linterna de Francisco: fierro, vidrio que brilla, la llama y el charco
// de luz en el piso. La luz de verdad es un destello prestado de fx (no se
// agregan luces).
function buildLantern(g) {
  const T = g.textures;
  const root = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2.2), transparent: true, opacity: 0.85 });
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.17, 10, 1, true), glass);
  box.position.y = -0.14;
  root.add(box);
  for (const y of [-0.05, -0.23]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(y > -0.1 ? 0.05 : 0.09, 0.09, 0.03, 10), iron);
    cap.position.y = y;
    root.add(cap);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 12), iron);
  ring.position.y = 0.01;
  root.add(ring);
  const add = (color, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
    s.scale.setScalar(scale);
    s.position.y = -0.14;
    root.add(s);
    return s;
  };
  const flame = add(0xffc070, 0.22, 1);
  const halo = add(0xff9a40, 1.8, 0.35);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.dot, color: 0xff9a50, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.32 }));
  pool.scale.setScalar(4.5);
  root.visible = false;
  pool.visible = false;
  g.scene.add(root);
  g.scene.add(pool);
  return { root, pool, flame, halo, glass, on: 1 };
}

// El mate que te deja sobre el pecho.
function buildMate(g) {
  const gr = new THREE.Group();
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a6038, map: g.textures.gourd || null, roughness: 0.7 }));
  gourd.scale.set(1, 1.15, 1);
  gr.add(gourd);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }));
  straw.position.set(0.02, 0.08, 0);
  straw.rotation.z = -0.25;
  gr.add(straw);
  // un brillo tibio para que se vea en lo oscuro
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
  glow.scale.setScalar(0.4);
  glow.position.y = 0.03;
  gr.add(glow);
  gr.scale.setScalar(1.25);
  gr.visible = false;
  g.scene.add(gr);
  return gr;
}

// ---------------- música y ruidos ----------------
// Un colchón de viento (ruido grave filtrado) por el canal de la cinemática.
function wind(I, dur, { gain = 0.22, freq = 320, attack = 2.5 } = {}) {
  const a = I.g.audio;
  a.noise(I.bus, { t: a.now, dur, type: 'bandpass', freq, freqEnd: freq * 0.7, q: 0.6, gain, attack, brown: true });
}

// Una nota grave sostenida (el zumbido de fondo).
function drone(I, dur, midi, { gain = 0.05, type = 'sine', attack = 2 } = {}) {
  const a = I.g.audio;
  const f = 440 * 2 ** ((midi - 69) / 12);
  a.hold(I.bus, { t: a.now, dur, type, freq: f, gain, attack, release: 2 });
  a.hold(I.bus, { t: a.now, dur, type, freq: f * 1.5, gain: gain * 0.35, attack, release: 2, detune: 6 });
}

// Golpe grave (entra el título, algo se rompe).
function boom(I, gain = 0.7) {
  const a = I.g.audio;
  const t = a.now;
  a.tone(I.bus, { t, dur: 1.8, freq: 62, freqEnd: 28, gain });
  a.noise(I.bus, { t, dur: 1.4, freq: 260, freqEnd: 50, q: 0.7, gain: gain * 0.6, brown: true });
}

// ---------------- El Molino ----------------
// Misiones, 1911. Un hombre con sombrero claro y una linterna arrastra a un
// gaucho desmayado por el patio del secadero. Adentro del galpón lo deja con
// los demás, le pone un mate en la mano y lo mira: dos ojos de oro debajo del
// ala. No dice nada. Se va a lo oscuro y la linterna se apaga. Después, el
// molino: el barbacuá que todavía arde, la capilla y el cementerio. Y te
// despertás.
function molino(g, I) {
  const people = new Avatars(g, null);
  const F = puppet(people, 430);
  // Francisco (el de la torre): poncho claro, faja de oro, sombrero de paja vieja
  F.M.poncho.color.set(0x9a8a6a);
  F.M.band.color.set(0xd8a830);
  F.M.hat.color.set(0x8a7448);
  F.M.skin.color.set(0x9a7a60);
  const eyeBase = new THREE.Color(0x120c08);
  // (sin pasarse de 1 en rojo y verde: en calidad baja, sin bloom, se vería blanco)
  const eyeGold = new THREE.Color(0xffa818).multiplyScalar(1.3);
  // los gauchos: vos y los compañeros (un muñeco de cada uno, más el que arrastra)
  const bodies = [0, 1, 2, 3, 4].map((id) => puppet(people, 440 + id));
  const dragged = puppet(people, 450);
  const lamp = buildLantern(g);
  const mate = buildMate(g);
  const H = new THREE.Vector3(PLAYER_START.x, 0, PLAYER_START.z);
  // de dónde a dónde lo arrastra (el patio, hasta la puerta del galpón)
  const D0 = new THREE.Vector3(21.5, 0, 26.4);
  const D1 = new THREE.Vector3(14.1, 0, 30.1);
  const TUMBA = new THREE.Vector3(62.3, 0, 23.8);
  // el final del castillo (CastleEnding): los gauchos duermen en el patio, al
  // lado de un fueguito, y Francisco llega de lo oscuro y se lleva a uno
  const FIRE = new THREE.Vector3(D0.x + 2.5, 0, D0.z + 0.7);
  const COME = new THREE.Vector3(D0.x + 5.5, 0, D0.z - 6);
  const OVER = new THREE.Vector3(D0.x - 0.2, 0, D0.z - 0.9);
  const coals = new THREE.Group();
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.95, emissive: 0x401004, emissiveIntensity: 0.6 });
    for (let k = 0; k < 4; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6), wood);
      log.rotation.set(Math.PI / 2 - 0.25, (k / 4) * Math.PI * 2, 0);
      log.position.set(Math.cos((k / 4) * Math.PI * 2) * 0.12, 0.08, Math.sin((k / 4) * Math.PI * 2) * 0.12);
      coals.add(log);
    }
    for (const [c, sc, op] of [[0xff5a18, 0.55, 0.9], [0xff9a40, 1.8, 0.28]]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: op }));
      s.scale.setScalar(sc);
      s.position.y = 0.12;
      coals.add(s);
    }
    coals.position.copy(FIRE);
    coals.visible = false;
    g.scene.add(coals);
  }
  const st = { mode: 'off', t: 0, ph: 0, eye: 0, lampOn: 1, ids: [0], me: 0, gone: false };
  let light = null;

  // los gauchos tirados en fila, con la cabeza hacia el fondo del galpón
  const layBodies = (t) => {
    const n = st.ids.length;
    st.ids.forEach((id, i) => {
      const b = bodies[i];
      const own = id === st.me;
      b.group.visible = !(own && (st.mode === 'wake' || st.mode === 'look'));
      lieAt(b, H.x + (i - (n - 1) / 2) * 0.95 * (n > 1 ? 1 : 0), H.z, 0, t + i);
    });
  };
  const myBody = () => bodies[Math.max(0, st.ids.indexOf(st.me))];
  // dormidos en el patio: el tuyo con la cabeza donde arranca el arrastre y
  // los pies hacia el fuego; los demás, al lado
  // (siempre los cuatro caballeros, aunque se juegue con menos)
  const sleepBodies = (t) => {
    const mine = Math.max(0, st.ids.indexOf(st.me));
    const n = Math.min(bodies.length, Math.max(4, st.ids.length));
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.group.visible = true;
      const k = i === mine ? 0 : i < mine ? i + 1 : i;
      lieAt(b, D0.x + k * 0.35, D0.z + k * 1.05, Math.PI / 2 - k * 0.12, t * 0.5 + i);
    }
  };

  // el color del poncho de cada uno (el de la partida; siempre cuatro)
  const dress = () => {
    st.ids = crewIds(g);
    st.me = g.net ? g.net.id : 0;
    st.ids.forEach((id, i) => {
      const own = people.materials(id);
      bodies[i].M.poncho.color.copy(own.poncho.color);
      if (id === st.me) dragged.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
    });
    bodies.forEach((b, i) => (b.group.visible = i < st.ids.length));
  };

  const lampAt = (x, y, z) => {
    lamp.root.position.set(x, y, z);
    lamp.pool.position.set(x, 0.03, z);
    if (light) light.light.position.set(x, y + 0.1, z);
  };
  const lampShow = (on) => {
    lamp.root.visible = on;
    lamp.pool.visible = on;
  };

  // (es la primera del juego: fundidos largos, a negro entre toma y toma)
  const heart = (I) => {
    g.audio.heartbeat();
    g.audio.tone(I.bus, { t: g.audio.now, dur: 3.4, freq: 98, freqEnd: 92, gain: 0.08, attack: 0.7, type: 'triangle' });
  };
  const shots = [
    { d: 3.4, black: true, at: [[0.8, (I) => I.card('Misiones, 1911.', { d: 2.3 })]] },
    // 1 · el patio: te arrastra hasta el galpón
    {
      d: 8.5,
      fadeIn: 2.4,
      fadeOut: 1.4,
      fog: 0.85,
      enter: () => (st.mode = 'drag'),
      at: [[2.2, (I) => I.card('No recordás tu nombre.', { low: true, d: 3.6 })]],
      // de costado, acompañándolo: se ve cómo arrastra el cuerpo
      fn: (I, t, u, cam) => {
        const at = tmpV.lerpVectors(D0, D1, u);
        const dx = (D1.x - D0.x) / D0.distanceTo(D1);
        const dz = (D1.z - D0.z) / D0.distanceTo(D1);
        // (a mitad de camino se arrima: a 4,3 m la cámara pasaba por adentro del pozo)
        const side = 4.3 - 1.8 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.28) / 0.7))) ** 2;
        cam.position.set(at.x - dz * side + dx * lerp(1.6, 0.4, u), 0.62, at.z + dx * side + dz * lerp(1.6, 0.4, u));
        cam.lookAt(tmpW.set(at.x - dx * 0.5, 0.75, at.z - dz * 0.5));
      },
    },
    // 2 · el galpón: te deja con los demás y te pone un mate en el pecho
    {
      d: 6.6,
      fadeIn: 1.6,
      fadeOut: 0.5,
      enter: () => (st.mode = 'kneel'),
      at: [[2.4, (I) => I.card('Ni cómo llegaste hasta acá.', { low: true, d: 3.6 })]],
      cam: [[9.5, 0.9, 42.5], [9.9, 0.85, 42.1]],
      look: [[12.1, 0.45, 41.1], [12.0, 0.45, 41.1]],
      ease: 'lin',
    },
    // 3 · desde el piso: se para arriba tuyo y le brillan los ojos
    {
      d: 4.4,
      fadeIn: 0.9,
      enter: () => (st.mode = 'look'),
      at: [[1.8, heart], [2.55, () => g.audio.heartbeat()]],
      // (tus ojos: tu muñeco no se ve en esta)
      fn: (I, t, u, cam) => {
        cam.position.set(H.x + 0.04, 0.32, H.z + 0.12);
        cam.lookAt(tmpV.set(H.x, lerp(1.25, 1.6, smooth(u)), H.z - 0.62));
      },
      fov: [50, 42],
    },
    // 4 · se va a lo oscuro y la linterna se apaga
    {
      d: 5,
      fadeOut: 1.8,
      enter: () => (st.mode = 'leave'),
      cam: [[13.9, 0.6, 43.7], [13.8, 0.6, 43.6]],
      look: [[10.5, 1.1, 38.6], [9.4, 1.1, 37.6]],
    },
    { d: 3.4, black: true, enter: () => (st.mode = 'off'), at: [[0.6, (I) => I.card('Pero alguien sí sabe.', { d: 2.3 })]] },
    // 5 · el molino desde arriba (el nombre del mapa)
    {
      d: 6.6,
      fadeIn: 2.2,
      fadeOut: 0.9,
      fog: 0.55,
      at: [
        [1, (I) => {
          I.title(true);
          boom(I, 0.5);
        }],
        [5.2, (I) => I.title(false)],
      ],
      cam: [[14, 1.6, 29.5], [12, 5.5, 26], [9, 12, 21]],
      look: [[22, 2.5, 24], [30, 3, 24], [44, 4, 24]],
      ease: 'soft',
    },
    // 6 · el barbacuá
    {
      d: 4.8,
      fadeIn: 1.1,
      fadeOut: 0.9,
      where: 'El Barbacuá',
      at: [[0.9, (I) => I.card('El molino no muele hace años. Pero el fuego sigue prendido.', { low: true, d: 3.2 })]],
      cam: [[43.5, 1.3, 29.5], [41.8, 1.15, 27.6]],
      look: [[38.5, 0.8, 23.5], [38.5, 0.9, 23.3]],
      ease: 'lin',
    },
    // 7 · la capilla
    {
      d: 4.8,
      fadeIn: 1.1,
      fadeOut: 0.9,
      where: 'La Capilla',
      at: [[0.9, (I) => I.card('En la capilla, las velas no se apagan nunca.', { low: true, d: 3.2 })]],
      cam: [[51, 1.7, 30], [51, 1.55, 25.8]],
      look: [[51, 1.2, 19], [51, 1.25, 19]],
      ease: 'lin',
    },
    // 8 · el cementerio: una tumba se abre
    {
      d: 5.6,
      fadeIn: 1.1,
      fadeOut: 1.6,
      fog: 0.8,
      where: 'El Cementerio de los Peones',
      at: [[0.9, (I) => I.card('Y cuando cae la noche, los peones vuelven de la tierra.', { low: true, d: 4 })]],
      cam: [[58.2, 0.6, 30.2], [60.2, 0.78, 28.2]],
      look: [[65.5, 0.6, 22], [64, 0.7, 23]],
      ease: 'lin',
    },
    // 9 · te despertás en el galpón
    {
      d: 5.8,
      wake: true,
      wakeAt: 3,
      enter: () => {
        st.mode = 'wake';
        I.lid(1);
      },
      fn: (I, t, u, cam) => {
        cam.position.set(H.x, 0.28, H.z + 0.05);
        cam.lookAt(tmpV.set(H.x + 0.3, 3, H.z + 1.1));
      },
      tick: (I, t) => {
        // un rato con los ojos cerrados, dos parpadeos lentos y se abren
        const k = t < 0.9 ? 1 : t < 1.5 ? 1 - ((t - 0.9) / 0.6) * 0.7 : t < 1.9 ? 0.3 + ((t - 1.5) / 0.4) * 0.7 : t < 2.9 ? 1 - (t - 1.9) / 1 : 0;
        I.lid(clamp01(k));
        // con los ojos cerrados, los compañeros ya están parados
        if (t > 1.8 && !st.stood) {
          st.stood = true;
          bodies.forEach((b) => (b.group.visible = false));
          if (g.net?.avatars) g.net.avatars.root.visible = true;
        }
      },
    },
  ];

  const cues = [
    [0.1, (I) => {
      wind(I, 60, { gain: 0.3, attack: 3 });
      drone(I, 30, 33, { gain: 0.06, attack: 3 });
    }],
  ];

  let fl = 0;
  return {
    title: 'El Molino',
    place: 'Molino yerbatero Santa Ana · Misiones, 1911',
    hideTeam: true,
    fov: 52,
    shots,
    cues,
    start() {
      dress();
      st.mode = 'off';
      st.stood = false;
      st.eye = 0;
      st.lampOn = 1;
      st.gone = false;
      st.cracked = false;
      F.group.visible = false;
      dragged.group.visible = false;
      mate.visible = false;
      lampShow(false);
      // la luz de la linterna: un destello de fx que se queda prendido
      light = g.fx.flashes?.[g.fx.flashes.length - 1] || null;
    },
    tick(I, dt, t) {
      const m = st.mode;
      const s = I.S.shots[I.shotI];
      const lt = t - s.t0;
      F.group.visible = m === 'drag' || m === 'kneel' || m === 'look' || (m === 'leave' && !st.gone) || m === 'sleep' || m === 'take';
      dragged.group.visible = m === 'drag';
      const lying = m === 'kneel' || m === 'look' || m === 'leave' || m === 'wake';
      const asleep = m === 'sleep' || m === 'take';
      coals.visible = asleep;
      if (asleep) sleepBodies(t);
      else if (lying && !st.stood) layBodies(t);
      else if (!lying) bodies.forEach((b) => (b.group.visible = false));
      mate.visible = (m === 'kneel' && lt > 3) || m === 'look' || m === 'leave' || (m === 'wake' && !st.stood);
      if (m === 'drag') {
        // camina despacio, encorvado, tirando del poncho con la derecha
        const u = clamp01(lt / s.d);
        tmpV.lerpVectors(D0, D1, u);
        const yaw = Math.atan2(D1.x - D0.x, D1.z - D0.z);
        st.ph += dt * 4.2;
        walk(F.P, st.ph, 0.8);
        F.P.torsoP = 0.3;
        F.P.headP = -0.15;
        F.P.shRp = 0.62;
        F.P.shRr = -0.12;
        F.P.elR = -0.1;
        F.P.shLp = -0.55;
        F.P.shLr = 0.3;
        F.P.elL = -0.9;
        place(F, tmpV.x, tmpV.z, yaw);
        F.group.userData.at = tmpV.clone();
        // el cuerpo, medio levantado, con la cabeza en la mano de él
        const hand = handAt(F, 6, tmpW);
        const lift = Math.max(0.35, hand.y - 0.08);
        lie(dragged.P, t);
        dragged.P.rootPitch = -Math.acos(clamp01(lift / 1.62));
        dragged.P.rootY = 0.05;
        dragged.P.headP = 0.5;
        dragged.P.shLp = -0.35;
        dragged.P.shRp = -0.35;
        const byaw = yaw + Math.PI;
        place(dragged, 0, 0, byaw);
        const head = tmpU.set(0, 0.12, 0).applyMatrix4(dragged.mats[2]);
        place(dragged, hand.x - head.x, hand.z - head.z, byaw);
        // pasos y el cuerpo que se arrastra por la tierra
        if (Math.floor(st.ph / Math.PI) !== st.step) {
          st.step = Math.floor(st.ph / Math.PI);
          g.audio.footstep('dirt', 0.9);
          g.audio.noise(I.bus, { t: g.audio.now, dur: 0.55, type: 'bandpass', freq: 380, q: 0.8, gain: 0.16, attack: 0.1 });
          if (Math.random() < 0.5) g.fx.dust(tmpU.set(tmpV.x - Math.sin(yaw) * 1.8, 0.05, tmpV.z - Math.cos(yaw) * 1.8), { x: 0, y: 1, z: 0 }, [0.4, 0.3, 0.22], 2);
        }
        handAt(F, 5, tmpU);
        lampAt(tmpU.x, tmpU.y - 0.02, tmpU.z);
        lampShow(true);
      } else if (m === 'kneel' || m === 'look' || m === 'leave') {
        const head = tmpU.set(H.x, 0, H.z);
        if (m === 'kneel') {
          // arrodillado en tu cabecera: estira la mano y te deja el mate
          const reach = smooth(clamp01((lt - 1.6) / 1.2)) * (1 - smooth(clamp01((lt - 3.6) / 1.2)));
          stand(F.P);
          F.P.hipY = 0.52;
          F.P.torsoP = 0.35 + reach * 0.3;
          F.P.headP = 0.45;
          F.P.hipLp = -1.45;
          F.P.knL = 1.55;
          F.P.hipRp = 0.1;
          F.P.knR = 1.75;
          F.P.shRp = -0.55 - reach * 0.75;
          F.P.elR = -0.5 + reach * 0.35;
          F.P.shLp = -0.4;
          F.P.shLr = 0.35;
          F.P.elL = -0.8;
          place(F, head.x - 0.1, head.z - 0.55, 0);
          if (lt > 3 && !st.gave) {
            st.gave = true;
            const p = myBody();
            chestAt(p, tmpW);
            g.fx.sparkle(tmpW.setY(tmpW.y + 0.05), [1, 0.85, 0.45], 16, 0.3);
            g.audio.tone(I.bus, { t: g.audio.now, dur: 1.4, freq: 1320, gain: 0.05, attack: 0.02 });
          }
        } else if (m === 'look') {
          // parado arriba tuyo, mirándote
          stand(F.P);
          const up = smooth(clamp01(lt / 1.1));
          F.P.hipY = lerp(0.6, 0.93, up);
          F.P.torsoP = lerp(0.5, 0.12, up);
          F.P.headP = 0.62;
          // la linterna cuelga al costado, baja: la cara queda en sombra y se ven los ojos
          F.P.shLp = 0.12;
          F.P.shLr = 0.32;
          F.P.elL = -0.1;
          place(F, head.x, head.z - 0.72, 0);
          st.eye = smooth(clamp01((lt - 1.3) / 0.9));
        } else {
          // se da vuelta y se va hacia lo oscuro
          if (!st.leaveFrom) st.leaveFrom = new THREE.Vector3(head.x, 0, head.z - 0.72);
          const u = clamp01(lt / 3.3);
          const to = tmpW.set(8.6, 0, 37.2);
          const at = tmpV.lerpVectors(st.leaveFrom, to, u);
          st.ph += dt * 4.6;
          walk(F.P, st.ph, 0.9);
          F.P.shLp = -0.4;
          F.P.shLr = 0.3;
          F.P.elL = -0.85;
          place(F, at.x, at.z, Math.atan2(to.x - st.leaveFrom.x, to.z - st.leaveFrom.z));
          st.eye = Math.max(0, 1 - lt * 1.5);
          if (lt > 3.1 && !st.gone) {
            // la linterna se apaga y no queda nadie: un poco de polvo de oro
            st.gone = true;
            g.fx.sparkle(tmpU.set(at.x, 1.2, at.z), [1, 0.8, 0.35], 40, 1.2);
            g.audio.noise(I.bus, { t: g.audio.now, dur: 0.5, type: 'highpass', freq: 2500, gain: 0.12 });
          }
        }
        // la mano del mate: el de tu muñeco, en su mano
        const p = myBody();
        chestAt(p, tmpW);
        mate.position.copy(tmpW);
        mate.rotation.set(0, 0, 0.2);
        handAt(F, 5, tmpU);
        lampAt(tmpU.x, tmpU.y - 0.02, tmpU.z);
        lampShow(!st.gone);
      } else if (asleep) {
        if (m === 'sleep') {
          // llega de lo oscuro, despacio, con la linterna
          const u = smooth(clamp01(lt / 5.4));
          const at = tmpV.lerpVectors(COME, OVER, u);
          if (u < 1) {
            st.ph += dt * 4.2;
            walk(F.P, st.ph, 0.85);
          } else stand(F.P);
          F.P.shLp = -0.45;
          F.P.shLr = 0.3;
          F.P.elL = -0.9;
          place(F, at.x, at.z, Math.atan2(OVER.x - COME.x, OVER.z - COME.z));
          st.eye = 0;
        } else {
          // parado arriba tuyo: te mira, le brillan los ojos y se agacha a agarrarte
          const down = smooth(clamp01((lt - 2.5) / 1.3));
          stand(F.P);
          F.P.hipY = lerp(0.93, 0.56, down);
          F.P.torsoP = lerp(0.18, 0.62, down);
          F.P.headP = 0.62;
          F.P.hipLp = -1.2 * down;
          F.P.knL = 1.4 * down;
          F.P.hipRp = 0.1 * down;
          F.P.knR = 1.6 * down;
          F.P.shRp = lerp(-0.1, -1.25, down);
          F.P.elR = lerp(-0.2, -0.3, down);
          F.P.shLp = 0.12;
          F.P.shLr = 0.32;
          F.P.elL = -0.1;
          place(F, OVER.x, OVER.z, Math.atan2(D0.x - OVER.x, D0.z - OVER.z));
          st.eye = smooth(clamp01((lt - 0.8) / 0.9));
        }
        handAt(F, 5, tmpU);
        lampAt(tmpU.x, tmpU.y - 0.02, tmpU.z);
        lampShow(true);
        // el fueguito se está apagando
        const c = coals.children;
        c[4].material.opacity = 0.75 + Math.sin(t * 9) * 0.12;
        c[5].material.opacity = 0.22 + Math.sin(t * 5.3) * 0.05;
      } else lampShow(false);
      // los ojos de oro
      F.M.eye.color.copy(eyeBase).lerp(eyeGold, st.eye);
      // la llama tiembla
      fl += dt;
      const flick = 0.85 + Math.sin(fl * 17) * 0.06 + Math.sin(fl * 7.3) * 0.08;
      lamp.flame.scale.setScalar(0.22 * flick);
      lamp.halo.material.opacity = 0.32 * flick;
      lamp.pool.material.opacity = 0.3 * flick;
      if (light) {
        const on = lamp.root.visible;
        light.life = on ? 1 : 0;
        light.max = 1;
        light.peak = on ? (m === 'look' || m === 'take' ? 2.2 : 7) * flick : 0;
        light.light.color.setHex(0xffa04a);
        light.light.distance = 8;
      }
      // el cementerio: la tierra de una tumba se abre
      if (s.where === 'El Cementerio de los Peones' && lt > 2.8 && !st.cracked) {
        st.cracked = true;
        g.fx.dirt(tmpU.set(TUMBA.x, 0.1, TUMBA.z), 26);
        g.audio.rise?.();
        boom(I, 0.4);
        I.shake(1);
      }
    },
    stop() {
      for (const a of [F, dragged, ...bodies]) a.group.visible = false;
      coals.visible = false;
      lampShow(false);
      mate.visible = false;
      if (light) light.life = 0;
      light = null;
      st.leaveFrom = null;
      st.gave = false;
    },
    // en la carga: todos a la vista donde van a estar
    warm(I, on) {
      if (on) {
        dress();
        st.mode = 'kneel';
        layBodies(0);
        stand(F.P);
        place(F, H.x, H.z - 0.7, 0);
        F.group.visible = true;
        dragged.group.visible = true;
        lie(dragged.P, 0);
        place(dragged, D0.x, D0.z, 0);
        lampAt(H.x + 0.4, 0.8, H.z - 0.6);
        lampShow(true);
        mate.visible = true;
        mate.position.set(H.x + 0.3, 0.2, H.z + 0.4);
      } else {
        st.mode = 'off';
        for (const a of [F, dragged, ...bodies]) a.group.visible = false;
        lampShow(false);
        mate.visible = false;
      }
    },
    dispose() {
      people.dispose();
      lamp.root.removeFromParent();
      lamp.pool.removeFromParent();
      mate.removeFromParent();
      coals.removeFromParent();
    },
    // El final del castillo (CastleEnding): Francisco se lleva a uno de los que
    // duermen en el patio y después el arrastre de siempre (solo esa toma).
    ending: () => [
      {
        d: 6.4,
        fadeIn: 2.2,
        fog: 0.8,
        enter: () => (st.mode = 'sleep'),
        at: [[1.4, (I) => I.card('Cuatro gauchos duermen al lado del fuego. No se acuerdan de nada.', { low: true, d: 4.2 })]],
        fn: (I, t, u, cam) => {
          cam.position.set(D0.x - 3.2, 0.85, D0.z + 3.8);
          cam.lookAt(tmpV.set(D0.x + lerp(2.2, 0.5, smooth(u)), 0.55, D0.z - lerp(2.4, 0.7, smooth(u))));
        },
      },
      {
        d: 4.8,
        fadeOut: 1,
        enter: () => (st.mode = 'take'),
        at: [[1.5, heart]],
        fn: (I, t, u, cam) => {
          cam.position.set(D0.x - 0.6, 0.32, D0.z + 0.95);
          cam.lookAt(tmpV.set(D0.x - 0.2, lerp(1.45, 1.3, smooth(u)), D0.z - 0.9));
        },
        fov: [52, 46],
      },
      // el arrastre, pero la cámara pasa por arriba de la pila de tablas (no a través)
      {
        ...shots[1],
        fn: (I, t, u, cam) => {
          shots[1].fn(I, t, u, cam);
          const p = cam.position;
          let up = 0;
          for (const b of g.world.boxes) {
            if (b.active === false || b.kind !== 'prop' || b.y1 > 1.6 || b.y0 > p.y + 0.3) continue;
            const d = Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.z0 - p.z, 0, p.z - b.z1));
            if (d < 1.4) up = Math.max(up, smooth(1 - d / 1.4) * (b.y1 + 0.4 - p.y));
          }
          p.y += up;
        },
      },
    ],
  };
}

// ---------------- La Tapera ----------------
// El atardecer en la chacra de los cuervos: el molino de viento contra el
// sol, el establo colorado, el yerbal de los tablones, el barbacuá, el
// espantapájaros de la huerta... y la cámara baja al patio, al lado del fogón.
function granja(g, I) {
  const shots = [
    { d: 5.2, fadeIn: 1.6, fog: 0.7, cam: [[68.6, 1.3, 59.6], [70.2, 1.7, 58.4]], look: [[75.1, 5.6, 49.4], [75.3, 5.1, 49.6]], ease: 'lin' },
    { d: 5.2, fadeIn: 0.5, fog: 0.75, where: 'El Establo', cam: [[33, 3.6, 40.5], [36, 3.9, 38.5]], look: [[60, 5.5, 27], [61, 5.2, 27]], ease: 'lin' },
    { d: 5.6, fadeIn: 0.5, fog: 0.75, where: 'Los Tablones', cam: [[8.5, 1.3, 12], [15, 1.25, 12]], look: [[24, 1.1, 12], [30, 1.3, 10]], ease: 'lin' },
    { d: 4.6, fadeIn: 0.5, fog: 0.8, where: 'El Barbacuá', cam: [[25.4, 3.1, 15], [27, 3.9, 12.8]], look: [[32.5, 3, 5], [32.5, 3.2, 5]], ease: 'lin' },
    { d: 4.8, fadeIn: 0.5, fadeOut: 0.4, fog: 0.9, where: 'La Huerta', cam: [[23.6, 1.55, 34.6], [22.9, 1.5, 33.6]], look: [[19.6, 1.75, 32], [19.6, 1.8, 32]], ease: 'lin', fov: [52, 44] },
    { d: 4.6, fadeIn: 0.6, wake: true, wakeAt: 0.4, fog: 0.9, cam: [[38, 6, 36.5], [38, 3.5, 33]], look: [[31, 0.5, 31], [31, 0.8, 31]] },
  ];
  const cues = [
    [0.1, (I) => {
      wind(I, 30, { gain: 0.2, freq: 380 });
      drone(I, 20, 40, { gain: 0.04 });
    }],
    [0.9, (I) => I.title(true)],
    [4, (I) => I.title(false)],
    [5.8, (I) => {
      I.card('El Alcaide se llevó el mate. Para recuperarlo hace falta una yerba más fuerte que ninguna.', { low: true, d: 4.4 });
      g.critters?.onNoise?.(new THREE.Vector3(29, 1, 22.5), 12);
      g.audio.caw(new THREE.Vector3(44, 3, 30), 3);
    }],
    [10.8, (I) => I.card('Crece acá, en un yerbal que nadie cosecha desde el 87.', { low: true, d: 4.6 })],
    [16.4, (I) => I.card('Hay que cortarla con la Hoz de la Muerte, secarla y molerla.', { low: true, d: 4 })],
    [21.1, (I) => {
      I.card('Y el que cuida este campo... no es un espantapájaros cualquiera.', { low: true, d: 4.2 });
      g.audio.crowScreech(new THREE.Vector3(19.6, 2, 32));
    }],
    [22.6, (I) => boom(I, 0.35)],
  ];
  return { title: 'La Tapera', place: 'Chacra de los Cuervos · Misiones, 1987', fov: 50, shots, cues };
}

// ---------------- Mate of the Dead ----------------
// La isla del penal en medio del río, de noche: el faro, una torre de
// guardia, el pabellón, la oficina del Alcaide (la caja fuerte), el cerro
// del espinillo con un rayo... y adentro, tu alma.
function penal(g, I) {
  const hideHand = () => {
    if (g.vida?.hand) g.vida.hand.root.visible = false;
  };
  const shots = [
    { d: 5.6, fadeIn: 1.6, fog: 0.6, cam: [[29, 1.4, 101], [26.5, 2.2, 99.5]], look: [[17, 6.5, 97], [17.5, 8, 97]], ease: 'lin' },
    { d: 5, fadeIn: 0.5, fog: 0.65, where: 'Los Yerbales de la Leva', cam: [[60.5, 1.4, 63.5], [59, 2.2, 65.5]], look: [[53.6, 7, 72], [53.6, 8.5, 72]], ease: 'lin' },
    { d: 5, fadeIn: 0.5, where: 'El Pabellón B', cam: [[34, 5.6, 35], [40, 5.8, 35]], look: [[58, 5.2, 35], [58, 5.4, 35]], ease: 'lin' },
    { d: 4.2, fadeIn: 0.5, where: 'La Oficina del Alcaide', cam: [[48, 9.8, 22], [51.8, 9.6, 19.6]], look: [[55.5, 8.8, 16.4], [55.5, 8.7, 16.4]], ease: 'lin' },
    { d: 4.6, fadeIn: 0.5, fadeOut: 0.4, fog: 0.7, where: 'El Cerro del Espinillo', cam: [[73, 14.4, 25.5], [75, 15, 23.5]], look: [[82.5, 13.6, 18.5], [83.5, 14.5, 17.5]], ease: 'lin' },
    { d: 5, fadeIn: 0.6, wake: true, wakeAt: 0.6, cam: [[36, 8.5, 35], [40, 6.5, 35]], look: [[46, 5, 35], [46, 5, 35]] },
  ];
  const strike = (I, x, y, z) => {
    const top = new THREE.Vector3(x + 6, y + 40, z - 4);
    g.fx.lightning(top, new THREE.Vector3(x, y, z), 0xd8c8ff, 0.5);
    g.audio.thunder(new THREE.Vector3(x, y, z));
    if (g.weather) g.weather.flash = 1;
    g.post?.flash?.(0.6);
    I.shake(0.8);
  };
  const cues = [
    [0.1, (I) => {
      wind(I, 30, { gain: 0.16, freq: 260 });
      // el río: agua que corre
      g.audio.noise(I.bus, { t: g.audio.now, dur: 12, type: 'bandpass', freq: 900, q: 0.5, gain: 0.08, attack: 2 });
      drone(I, 24, 38, { gain: 0.045 });
    }],
    [0.9, (I) => I.title(true)],
    [2.6, (I) => {
      g.audio.thunder(new THREE.Vector3(20, 30, 90));
      if (g.weather) g.weather.flash = 1;
    }],
    [4.4, (I) => I.title(false)],
    [6, (I) => I.card('El mate que te robaron está en este penal, en la caja fuerte del Alcaide.', { low: true, d: 4.4 })],
    [11, (I) => I.card('Tres gauchos presos saben cómo llegar a él.', { low: true, d: 4.2 })],
    [16, (I) => I.card('Liberalos. De a uno.', { low: true, d: 3.4 })],
    [20.4, (I) => strike(I, 86.3, 13, 15.2)],
    [20.6, (I) => I.card('Del penal nadie sale vivo...', { low: true, d: 3.6 })],
    [24.8, (I) => {
      I.card('...pero las almas sí.', { low: true, d: 3.6 });
      g.audio.choir(I.bus, g.audio.now, [50, 57, 62, 65], { dur: 2.4, gain: 0.04, attack: 0.8, release: 1.2 });
    }],
  ];
  return {
    title: 'Mate of the Dead',
    place: 'Penal de la Isla del Ceibo · Corrientes, 1878',
    fov: 52,
    shots,
    cues,
    tick: hideHand,
  };
}

// ---------------- Revelaciones Materas ----------------
// La torre en el ojo del remolino: la cámara la rodea desde abajo, sube en
// espiral por afuera hasta la cima, mira el ojo de la Voz entre las nubes y
// se deja caer hasta la planta baja, donde estás vos.
function torre(g, I) {
  const C = new THREE.Vector3(30, 0, 30);
  const orbit = (a, r, y, out) => out.set(C.x + Math.sin(a) * r, y, C.z + Math.cos(a) * r);
  const eye = () => g.world.tower?.eye?.position || tmpU.set(30, 124, 30);
  const shots = [
    {
      d: 6,
      fadeIn: 1.6,
      fog: 0.5,
      fn: (I, t, u, cam) => {
        const e = smooth(u);
        orbit(0.3 + e * 0.6, 23, lerp(2.4, 5, e), cam.position);
        cam.lookAt(tmpV.set(C.x, lerp(22, 30, e), C.z));
      },
    },
    {
      d: 7,
      fog: 0.5,
      fn: (I, t, u, cam) => {
        const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        orbit(0.9 + e * 2.1, lerp(23.5, 22, e), lerp(5, 54, e), cam.position);
        cam.lookAt(tmpV.set(C.x, lerp(30, 60, e), C.z));
      },
    },
    {
      d: 5,
      fog: 0.5,
      fn: (I, t, u, cam) => {
        const e = smooth(u);
        cam.position.set(lerp(38.5, 36, e), lerp(58.4, 59.2, e), lerp(38.5, 36, e));
        cam.lookAt(tmpV.copy(eye()).lerp(tmpW.set(30, 90, 30), 0.15 - e * 0.15));
      },
    },
    {
      d: 4.4,
      fog: 0.55,
      fn: (I, t, u, cam) => {
        const e = u * u;
        cam.position.set(C.x, lerp(62, 3.2, e), lerp(52, 50, e));
        cam.lookAt(tmpV.set(C.x, lerp(64, 3, Math.min(1, e * 1.15)), C.z));
      },
    },
    { d: 4.2, wake: true, wakeAt: 0, fog: 0.8, cam: [[30, 3.2, 50], [30, 2.2, 46]], look: [[30, 3, 30], [30, 1.8, 36]] },
  ];
  const cues = [
    [0.1, (I) => {
      wind(I, 28, { gain: 0.34, freq: 240, attack: 3 });
      drone(I, 26, 38, { gain: 0.05, type: 'triangle' });
    }],
    [0.4, () => g.audio.torreStart(g.audio.now + 0.1)],
    [0.9, (I) => I.title(true)],
    [4.8, (I) => I.title(false)],
    [6.6, (I) => I.card('Todo este tiempo, la Voz te estuvo usando.', { low: true, d: 5 })],
    [13.2, (I) => {
      I.card('Ahora tiene el mate supremo, en el ojo del remolino.', { low: true, d: 4 });
      g.audio.choir(I.bus, g.audio.now, [45, 57, 61, 64], { dur: 2.2, gain: 0.05, attack: 0.6, release: 1 });
      g.audio.bell(I.bus, g.audio.now + 0.2, 45, { gain: 0.16, dur: 4 });
    }],
    [14.4, (I) => {
      const E = eye();
      g.fx.lightning(E.clone(), E.clone().add(tmpV.set(16, -40, 6)), 0xe8d0ff, 0.6);
      g.fx.lightning(E.clone(), E.clone().add(tmpV.set(-12, -44, -8)), 0xc8a0ff, 0.6);
      g.audio.thunder(new THREE.Vector3(34, 70, 34));
      if (g.weather) g.weather.flash = 1;
      I.shake(0.7);
    }],
    [18.1, (I) => {
      I.card('Quince pisos. Y arriba de todo, te espera.', { low: true, d: 4 });
      g.audio.whoosh?.(g.camera.position.clone());
      g.audio.noise(I.bus, { t: g.audio.now, dur: 4.2, type: 'bandpass', freq: 400, freqEnd: 1800, q: 0.8, gain: 0.25, attack: 3 });
    }],
  ];
  return { title: 'Revelaciones Materas', place: 'La torre del fin del mundo', fov: 55, shots, cues };
}

// ---------------- Revelaciones Materas: el Challenge ----------------
// Sin personajes ni historia: la cámara mira el pozo desde arriba de la cima
// (todos los pisos sin centro, la bombilla de oro por el medio), pasa por el
// altar de la Supernova y se tira de cabeza por el agujero hasta la planta baja.
function torreReto(g, I) {
  const C = new THREE.Vector3(30, 0, 30);
  const shots = [
    {
      d: 4.2,
      fadeIn: 1.2,
      fog: 0.45,
      fn: (I, t, u, cam) => {
        const e = smooth(u);
        const a = 0.2 + e * 0.9;
        cam.position.set(C.x + Math.sin(a) * 2.4, lerp(77, 70, e), C.z + Math.cos(a) * 2.4);
        cam.lookAt(tmpV.set(C.x, 8, C.z));
      },
    },
    {
      d: 3.6,
      fog: 0.5,
      fn: (I, t, u, cam) => {
        const e = smooth(u);
        const a = lerp(-0.75, 0.6, e);
        cam.position.set(33.5 + Math.sin(a) * 3.3, 57.9, 18.8 + Math.cos(a) * 3.3);
        cam.lookAt(tmpV.set(33.5, 57.3, 18.8));
      },
    },
    {
      d: 4.4,
      fog: 0.55,
      fn: (I, t, u, cam) => {
        const e = u * u;
        const y = lerp(63, 2.9, e);
        cam.position.set(32.3, y, 28.1);
        cam.lookAt(tmpV.set(30.2, y - 14, 30.6));
      },
    },
    // (debajo de la losa del piso 2: antes arrancaba arriba y la cruzaba)
    { d: 3.6, wake: true, wakeAt: 0.3, fog: 0.8, cam: [[30.4, 2.9, 33.5], [30, 2.4, 40]], look: [[30, 0.8, 30], [30, 1.8, 36]] },
  ];
  const cues = [
    [0.1, (I) => {
      wind(I, 16, { gain: 0.34, freq: 260, attack: 2 });
      drone(I, 15, 36, { gain: 0.05, type: 'sawtooth' });
    }],
    [0.4, () => g.audio.torreStart(g.audio.now + 0.1)],
    [0.8, (I) => I.title(true)],
    [3.8, (I) => I.title(false)],
    [4.4, (I) => I.card('Arriba de todo, la Supernova.', { low: true, d: 3.2 })],
    [7.9, (I) => {
      I.card('Los pisos no tienen centro: si te caés, caés hasta el fondo.', { low: true, d: 4.2 });
      g.audio.whoosh?.(g.camera.position.clone());
      g.audio.noise(I.bus, { t: g.audio.now, dur: 4.4, type: 'bandpass', freq: 300, freqEnd: 2200, q: 0.8, gain: 0.28, attack: 3.4 });
    }],
    [12.3, (I) => I.card('Sin historia. Sin ayuda. Aguantá.', { low: true, d: 3 })],
  ];
  return { title: 'Revelaciones Materas', place: 'Challenge', fov: 58, shots, cues };
}

// ---------------- Der Mateendrache ----------------
// La Cordillera de los Andes, de noche. Martín Fierro cuenta (con la voz y
// los carteles) que se viene la Gran Guerra: el Chiquitijuein juntó almas en
// todos los mapas y ahora viene por todo; hace mucho cuatro caballeros lo
// bajaron de su trono con los mates de la luz, que duermen en este castillo.
// La cámara pasa por el patio y la fuente del dragón, el trono vacío (donde
// brillan dos ojitos colorados), los tapices de los caballeros, las tumbas de
// la cumbre y la cueva donde duerme el Mateendrache. Y te despertás en el patio.
function castillo(g, I) {
  const chiqui = buildChiqui(g.textures);
  chiqui.root.scale.setScalar(1.3);
  chiqui.root.position.set(51.5, 32.55, 21.65);
  chiqui.root.visible = false;
  g.scene.add(chiqui.root);
  const say = (text) => g.audio.say(text, 'fierro', { cine: true });
  const shots = [
    { d: 7, fadeIn: 1.8, fog: 0.45, cam: [[20, 96, 150], [36, 86, 128]], look: [[52, 36, 34], [52, 38, 34]], ease: 'lin' },
    { d: 5.2, fadeIn: 0.5, fog: 0.7, where: 'El Patio de Armas', cam: [[57.5, 26.8, 61.5], [55.2, 26.2, 59.6]], look: [[52, 26.4, 56.2], [52, 26.8, 56.2]], ease: 'lin' },
    {
      d: 5.4,
      fadeIn: 0.5,
      where: 'La Sala del Trono',
      cam: [[51.5, 33.8, 30], [51.5, 33.4, 26.2]],
      look: [[51.5, 33.4, 21.4], [51.5, 33.2, 21.4]],
      ease: 'lin',
      enter: () => {
        chiqui.root.visible = false;
      },
      at: [
        [2.4, () => {
          chiqui.root.visible = true;
          chiquiGiggle(g.audio, { pos: chiqui.root.position, gain: 0.9, ref: 8 });
        }],
        [4.2, () => {
          chiqui.root.visible = false;
        }],
      ],
    },
    { d: 5.4, fadeIn: 0.5, where: 'El Gran Salón', cam: [[43.4, 30.1, 42.4], [46.6, 30.1, 42.2]], look: [[57.6, 30.8, 33.4], [59.6, 30.8, 33.4]], ease: 'lin' },
    { d: 5.2, fadeIn: 0.5, fog: 0.6, where: 'La Cumbre de los Caballeros', cam: [[44.5, 41.9, 17.4], [57.5, 41.9, 17.4]], look: [[46.5, 40.8, 11], [56.5, 40.8, 11]], ease: 'lin' },
    {
      d: 5.4,
      fadeIn: 0.5,
      fadeOut: 0.4,
      where: 'La Cueva del Mateendrache',
      cam: [[95.5, 16.2, 36], [93.5, 15.4, 33]],
      look: [[89.5, 13, 24.5], [89.5, 12.8, 24.5]],
      ease: 'lin',
      enter: () => {
        if (g.ee?.dragon) g.ee.dragon.forceShow = true;
      },
    },
    {
      d: 5.4,
      fadeIn: 0.6,
      wake: true,
      wakeAt: 0.8,
      // adentro del patio, bajando sobre el que se despierta (la barbacana
      // está justo atrás: arrancar ahí metía la cámara en su techo)
      cam: [[52, 29.6, 61.3], [52, 26.4, 60.8]],
      look: [[52, 26.6, 50], [52, 25.8, 50]],
      enter: () => {
        if (g.ee?.dragon) g.ee.dragon.forceShow = false;
      },
    },
  ];
  const cues = [
    [0.1, (I) => {
      wind(I, 40, { gain: 0.3, freq: 230, attack: 3 });
      drone(I, 36, 38, { gain: 0.05, type: 'triangle' });
    }],
    [0.9, (I) => {
      I.title(true);
      boom(I, 0.6);
    }],
    [5.2, (I) => I.title(false)],
    [6.2, (I) => {
      I.card('Se viene la Gran Guerra.', { low: true, d: 3.4 });
      say('Se viene la Gran Guerra, paisanos.');
    }],
    [10.2, (I) => {
      I.card('El Chiquitijuein juntó almas en el molino, en la tapera, en el penal y en la torre.', { low: true, d: 5 });
      say('El Chiquitijuein juntó almas en el molino, en la tapera, en el penal y en la torre.');
    }],
    [16.4, (I) => {
      I.card('Ahora viene por todo.', { low: true, d: 3.4 });
      say('Ahora viene por todo.');
      g.audio.choir(I.bus, g.audio.now, [45, 52, 57, 60], { dur: 2.6, gain: 0.045, attack: 0.8, release: 1.4 });
    }],
    [20.8, (I) => {
      I.card('Hace mucho, cuatro caballeros lo bajaron de ese trono con los mates de la luz.', { low: true, d: 5 });
      say('Hace mucho, cuatro caballeros lo bajaron de ese trono... con los mates de la luz.');
    }],
    [26.2, (I) => {
      I.card('Los mates duermen en este castillo. Despiértenlos.', { low: true, d: 4.6 });
      say('Los mates duermen en este castillo. Despiértenlos.');
      g.audio.bell(I.bus, g.audio.now + 0.3, 45, { gain: 0.14, dur: 4 });
    }],
    [31.4, (I) => {
      I.card('Y álcense con ellos.', { low: true, d: 3.6 });
      say('Y álcense con ellos.');
      g.ee?.cueva?.whistle?.(0.5);
    }],
  ];
  return {
    title: 'Der Mateendrache',
    place: 'Castillo del Mateendrache · Cordillera de los Andes',
    fov: 52,
    shots,
    cues,
    warm: (I, on) => {
      chiqui.root.visible = on;
      if (g.ee?.dragon) g.ee.dragon.forceShow = on;
    },
    tick: (I, dt) => chiqui.update(dt, g.time),
    stop: () => {
      chiqui.root.visible = false;
      if (g.ee?.dragon) g.ee.dragon.forceShow = false;
    },
    dispose: () => chiqui.root.removeFromParent(),
  };
}

// ---------------- Mate no Numa ----------------
// Corrientes, 1877. Luna llena sobre la Laguna del Irupé. Una canoa cruza el
// agua a botador: sentados, Benito, Cirilo y Anacleto; atrás, parado, Antonio
// Gil empuja con la vara. En medio del estero algo lo llama por su nombre (la
// voz nunca se ve: un susurro que sale del pajonal) y solo él se da vuelta.
// Llegan a la orilla. Atrás, en el agua, flota el quepí de uno de la partida
// que los venía siguiendo... y se hunde. Y te despertás en la isleta, al lado
// del fogón.
// (sale del pajonal del sureste y cruza la laguna hasta la orilla de la zona D)
// (por el norte del árbol muerto de 54, 72)
const CANOE_PATH = [[61.5, 77], [57.5, 71], [52, 68.8], [47.5, 66], [44.6, 63.4]];
// cuándo sale y cuándo llega (segundos de la cinemática)
const CANOE_T0 = 8;
const CANOE_DUR = 22.5;
// quién va dónde (z local de la canoa: + es la proa) y el color de cada poncho
const CREW = [
  { key: 'benito', color: 0x7a5a2a, z: 1.05 },
  { key: 'cirilo', color: 0x2a3a7a, z: 0.3 },
  { key: 'anacleto', color: 0x3a6a2a, z: -0.45 },
  { key: 'gil', color: 0xb01c14, z: -1.45 },
];
// el quepí de la partida, en la laguna detrás de la canoa
const KEPI = new THREE.Vector3(48.6, 0, 69.9);

// La canoa del estero: casco de tronco, angosta y chata, con el piso de
// tablas (tapa el agua de adentro), dos bancos y el farol en la proa.
function buildCanoe(g) {
  const T = g.textures;
  const root = new THREE.Group();
  const L = 4.4;
  const B = 0.82;
  const D = 0.34;
  const NL = 24;
  const NR = 10;
  // ancho, alto de la borda y hondura en cada corte (u de 0 a 1, de popa a proa)
  const cut = (u) => ({ w: Math.pow(Math.sin(Math.PI * u), 0.5), rim: 0.2 + 0.14 * (2 * u - 1) ** 4 });
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= NL; i++) {
    const u = i / NL;
    const { w, rim } = cut(u);
    for (let j = 0; j <= NR; j++) {
      const a = -Math.PI / 2 + (j / NR) * Math.PI;
      pos.push(Math.sin(a) * B * 0.5 * w, rim - D * Math.cos(a) * (0.4 + 0.6 * w), (u - 0.5) * L);
      uv.push(u * 4, j / NR);
    }
  }
  for (let i = 0; i < NL; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j;
      const b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const wood = new THREE.MeshStandardMaterial({ map: T.planksDark || null, color: 0x9a8062, roughness: 0.62, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ map: T.planksDark || null, color: 0x5a4a38, roughness: 0.8 });
  const hull = new THREE.Mesh(geo, wood);
  hull.castShadow = true;
  root.add(hull);
  // el piso de tablas: el contorno del casco a 5 cm del agua
  const H = 0.05;
  const left = [];
  const right = [];
  for (let i = 0; i <= NL; i++) {
    const u = i / NL;
    const { w, rim } = cut(u);
    const c = (rim - H) / (D * (0.4 + 0.6 * w));
    if (c >= 1 || w < 0.05) continue;
    const x = Math.sin(Math.acos(c)) * B * 0.5 * w * 0.97;
    const z = (u - 0.5) * L;
    left.push([x, z]);
    right.push([-x, z]);
  }
  const shape = new THREE.Shape();
  const ring = [...left, ...right.reverse()];
  ring.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), dark);
  floor.position.y = H;
  root.add(floor);
  // los bancos
  for (const z of [0.95, 0.2, -0.55]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.2), dark);
    b.position.set(0, 0.19, z);
    root.add(b);
  }
  // el palo del farol, en la proa
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.75, 6), dark);
  post.position.set(0, 0.5, 1.72);
  post.rotation.x = 0.35;
  root.add(post);
  root.visible = false;
  g.scene.add(root);
  return root;
}

// La vara del botador (el largo va hacia +y desde el pie).
function buildPole() {
  const geo = new THREE.CylinderGeometry(0.02, 0.027, 3.6, 6).translate(0, 1.8, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.8 }));
  m.castShadow = true;
  m.visible = false;
  return m;
}

// El quepí de un soldado de la partida: paño azul, la franja colorada y la visera.
function buildKepi() {
  const gr = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x1c2640, roughness: 0.85 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.4 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 14), blue);
  crown.position.y = 0.06;
  crown.rotation.x = -0.12;
  gr.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 14), red);
  band.position.y = 0.02;
  gr.add(band);
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 12, 1, false, -Math.PI / 2, Math.PI), black);
  visor.position.set(0, 0.008, 0.035);
  visor.rotation.x = 0.18;
  gr.add(visor);
  gr.scale.setScalar(1.25);
  gr.visible = false;
  return gr;
}

// Sentado en el banco con las rodillas arriba y las manos en las rodillas.
function sit(P, t, i) {
  stand(P);
  P.hipY = 0.3;
  P.hipLp = -1.95;
  P.hipRp = -1.85;
  P.knL = 2;
  P.knR = 1.9;
  P.torsoP = 0.14 + Math.sin(t * 0.8 + i) * 0.02;
  P.headP = -0.05;
  P.headY = Math.sin(t * 0.23 + i * 2.1) * 0.35;
  P.shLp = -0.75;
  P.shRp = -0.7;
  P.shLr = 0.12;
  P.shRr = -0.12;
  P.elL = -0.85;
  P.elR = -0.8;
}

function esteros(g, I) {
  const people = new Avatars(g, null);
  const crew = CREW.map((c, i) => {
    const a = puppet(people, 460 + i);
    a.M.poncho.color.set(c.color).multiplyScalar(1.7);
    return { ...c, a };
  });
  const gil = crew[3].a;
  const canoe = buildCanoe(g);
  const pole = buildPole();
  g.scene.add(pole);
  const kepi = buildKepi();
  g.scene.add(kepi);
  const lamp = buildLantern(g);
  lamp.pool.visible = false;
  const curve = new THREE.CatmullRomCurve3(CANOE_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const lv = () => g.water?.level ?? 0;
  // dónde va la canoa a los T segundos (lo mismo en la toma y en la carga)
  const boat = { x: 0, z: 0, yaw: 0, dx: 0, dz: 1, speed: 0, y: 0 };
  const canoeAt = (T) => {
    const u = clamp01((T - CANOE_T0) / CANOE_DUR);
    // arranca un poco más rápido y llega despacio al vado
    const s = Math.min(1, u + 0.25 * u * (1 - u));
    curve.getPointAt(s, tmpV);
    curve.getTangentAt(s, tmpW);
    boat.x = tmpV.x;
    boat.z = tmpV.z;
    boat.dx = tmpW.x;
    boat.dz = tmpW.z;
    boat.yaw = Math.atan2(tmpW.x, tmpW.z);
    boat.speed = u >= 1 ? 0 : ((1.25 - 0.5 * u) * curve.getLength()) / CANOE_DUR;
    boat.y = lv() + Math.sin(T * 1.3) * 0.012;
    return boat;
  };
  // de la canoa al mundo: lx a la derecha del que mira a la proa, lz hacia la proa
  const local = (lx, lz, y, out) => {
    const s = Math.sin(boat.yaw);
    const c = Math.cos(boat.yaw);
    return out.set(boat.x + s * lz - c * lx, y, boat.z + c * lz + s * lx);
  };
  const st = { turn: 0, hold: false, plant: new THREE.Vector3(), plantT: -9, sunk: 0 };
  let light = null;

  // la vara: plantada en el fondo mientras empuja, afuera del agua cuando la trae
  const STROKE = 2.6;
  const poleFrom = new THREE.Vector3();
  const poseCrew = (T, dt) => {
    canoeAt(T);
    canoe.position.set(boat.x, boat.y, boat.z);
    canoe.rotation.set(Math.sin(T * 0.9) * 0.012, boat.yaw, Math.sin(T * 1.1 + 1) * 0.02);
    for (const [i, c] of crew.entries()) {
      local(0, c.z, 0, tmpU);
      if (c.key === 'gil') continue;
      sit(c.a.P, T, i);
      c.a.P.rootY = boat.y + 0.02;
      place(c.a, tmpU.x, tmpU.z, boat.yaw);
    }
    // Gil: parado atrás, empuja con la vara (o se queda quieto oyendo)
    const P = gil.P;
    stand(P);
    const ph = (T / STROKE) % 1;
    const push = st.hold || boat.speed === 0 ? 0.35 : ph < 0.62 ? smooth(ph / 0.62) : 1 - smooth((ph - 0.62) / 0.38);
    P.rootY = boat.y + 0.05;
    P.torsoP = 0.12 + push * 0.3;
    P.hipLp = -0.15;
    P.hipRp = 0.22;
    P.knL = 0.25;
    P.knR = 0.2;
    P.shRp = lerp(-0.9, -0.1, push);
    P.shRr = -0.3;
    P.elR = lerp(-0.6, -0.25, push);
    P.shLp = lerp(-1.2, -0.5, push);
    P.shLr = -0.3;
    P.elL = lerp(-1, -0.7, push);
    // se da vuelta hacia el pajonal (la voz)
    P.headY = st.turn * 1.05;
    P.torsoY = st.turn * 0.3;
    P.headP = -0.05 - st.turn * 0.08;
    local(0, crew[3].z, 0, tmpU);
    place(gil, tmpU.x, tmpU.z, boat.yaw);
    // el pie de la vara
    const hand = handAt(gil, 6, tmpW);
    if (boat.speed === 0 || st.hold) {
      // quieta, clavada al lado de la popa
      local(0.5, crew[3].z - 0.35, lv() - 1.2, poleFrom);
    } else if (ph < 0.62) {
      // la clava al empezar la empujada y ahí queda
      if (T - st.plantT > STROKE * 0.9 || T < st.plantT) {
        st.plantT = T - ph * STROKE;
        local(0.5, crew[3].z + 0.25, lv() - 1.2, st.plant);
        if (dt > 0 && g.water) g.water.splash(st.plant.x, st.plant.z, 0.22);
      }
      poleFrom.copy(st.plant);
    } else {
      // la saca y la lleva adelante (sale del agua a mitad de camino)
      const k = (ph - 0.62) / 0.38;
      local(0.5, crew[3].z + 0.25, lv() - 1.2, tmpU);
      poleFrom.lerpVectors(st.plant, tmpU, smooth(k));
      poleFrom.y += Math.sin(Math.PI * k) * 1.1;
    }
    tmpU.subVectors(hand, poleFrom).normalize();
    pole.position.copy(poleFrom);
    pole.quaternion.setFromUnitVectors(tmpV.set(0, 1, 0), tmpU);
    pole.visible = true;
    // el farol, colgado del palo de la proa
    local(0, 1.86, boat.y + 0.72, tmpU);
    lamp.root.position.copy(tmpU);
    if (light) light.light.position.set(tmpU.x, tmpU.y + 0.1, tmpU.z);
    // la estela de la canoa
    if (dt > 0 && boat.speed > 0.2) g.water?.wake?.(boat.x, boat.z, boat.dx, boat.dz, boat.speed, 2);
  };
  const show = (on) => {
    canoe.visible = on;
    pole.visible = on;
    lamp.root.visible = on;
    for (const c of crew) c.a.group.visible = on;
  };

  // la voz: nadie la ve. Un susurro que sale del pajonal y dice su nombre.
  const whisper = (I, gain = 1) => {
    const A = g.audio;
    local(-7, crew[3].z, 1, tmpU);
    const o = A.out({ pos: tmpU.clone(), gain: 0.9 * gain, reverb: 0.9, ref: 5 });
    const t = A.now;
    for (const [d, dur, f] of [[0, 0.24, 2300], [0.3, 0.18, 1700], [0.54, 0.46, 2050]]) {
      A.noise(o, { t: t + d, dur, type: 'bandpass', freq: f, freqEnd: f * 0.78, q: 6, gain: 0.55, attack: 0.05 });
      A.noise(o, { t: t + d, dur: dur * 1.2, type: 'lowpass', freq: 700, gain: 0.12, attack: 0.08, brown: true });
    }
    A.tone(I.bus, { t, dur: 3.2, type: 'triangle', freq: 110, freqEnd: 104, gain: 0.05 * gain, attack: 0.8 });
  };

  const shots = [
    { d: 3.2, black: true, at: [[0.6, (I) => I.card('Corrientes, 1877.', { d: 2.4 })]] },
    // 1 · la luna llena sobre la laguna, y lejos, el farol de una canoa
    {
      d: 7.5,
      fadeIn: 2,
      fadeOut: 0.5,
      fog: 0.5,
      cam: [[47.5, 0.8, 61.5], [48.6, 1.2, 63]],
      look: [[65, 5.2, 83], [66.5, 5.8, 84.5]],
      ease: 'lin',
    },
    // 2 · la canoa entre los irupés, de costado
    {
      d: 7,
      fadeIn: 0.6,
      fadeOut: 0.4,
      fog: 0.6,
      where: 'La Laguna del Irupé',
      at: [
        [0.8, (I) => I.card('Antonio Gil desertó de la partida del coronel.', { low: true, d: 3.2 })],
        [4.2, (I) => I.card('Con él escaparon Anacleto, Cirilo y Benito.', { low: true, d: 2.6 })],
      ],
      fn: (I, lt, u, cam) => {
        canoeAt(I.S.shots[2].t0 + lt);
        cam.position.set(lerp(47.6, 48.2, u), lerp(0.9, 1.05, u), lerp(71.6, 71.2, u));
        tmpW.set(boat.x, boat.y + 0.8, boat.z);
        cam.lookAt(tmpW);
      },
    },
    // 3 · Gil: algo lo llama desde el pajonal; se da vuelta. Los otros no oyen nada.
    {
      d: 6.5,
      fadeIn: 0.4,
      fadeOut: 0.5,
      enter: () => {
        st.turn = 0;
      },
      at: [
        [1, (I) => {
          st.hold = true;
          whisper(I);
        }],
        [1.5, (I) => I.card('En medio del estero, una voz lo llamó por su nombre.', { low: true, d: 3 })],
        [3.6, (I) => whisper(I, 0.6)],
        [4.7, (I) => I.card('Solo él la oyó.', { low: true, d: 1.6 })],
      ],
      tick: (I, lt, u, dt) => {
        st.turn += ((lt > 1.4 ? 1 : 0) - st.turn) * Math.min(1, dt * 2.2);
      },
      fn: (I, lt, u, cam) => {
        canoeAt(I.S.shots[3].t0 + lt);
        local(2.1, crew[3].z + lerp(1.8, 1.4, u), boat.y + 1.45, cam.position);
        local(0, crew[3].z + 0.2, boat.y + 1.35, tmpW);
        cam.lookAt(tmpW);
      },
      fov: [46, 40],
    },
    // 4 · llegan a la orilla (de ahí, a pie hasta el fogón)
    {
      d: 6.5,
      fadeIn: 0.5,
      fadeOut: 0.6,
      fog: 0.7,
      enter: () => {
        st.hold = false;
        st.turn = 0;
      },
      at: [[1, (I) => I.card('La partida del coronel los siguió hasta el agua.', { low: true, d: 3.6 })]],
      fn: (I, lt, u, cam) => {
        canoeAt(I.S.shots[4].t0 + lt);
        cam.position.set(lerp(40.8, 41.2, u), 1.55, lerp(61, 61.4, u));
        tmpW.set(boat.x, boat.y + 0.6, boat.z);
        cam.lookAt(tmpW);
      },
    },
    // 5 · el quepí de uno de ellos flota... y el agua se lo traga
    {
      d: 5,
      fadeIn: 0.5,
      fadeOut: 1,
      fog: 0.8,
      enter: () => (st.sunk = 0),
      at: [
        [2.6, (I) => {
          st.sunk = 1;
          g.water?.splash?.(KEPI.x, KEPI.z, 0.35);
          boom(I, 0.4);
          I.shake(0.3);
        }],
        [2.9, (I) => I.card('Ninguno salió.', { low: true, d: 1.9 })],
      ],
      // (de este lado: mirando al sureste el brillo de la luna en el agua lo tapaba)
      cam: [[50.4, 1.05, 68.1], [50.2, 0.9, 68.3]],
      look: [[KEPI.x, 0.05, KEPI.z], [KEPI.x, -0.05, KEPI.z]],
      ease: 'lin',
      fov: 42,
    },
    // 6 · te despertás en la isleta, al lado del fogón
    {
      d: 5,
      fadeIn: 0.8,
      wake: true,
      wakeAt: 1,
      fog: 0.9,
      enter: () => {
        show(false);
        if (g.net?.avatars) g.net.avatars.root.visible = true;
      },
      cam: [[45.5, 3.2, 49.5], [44, 2.2, 47]],
      look: [[40, 0.9, 41], [40.5, 1, 41.5]],
    },
  ];
  const cues = [
    [0.1, (I) => {
      wind(I, 40, { gain: 0.12, freq: 300, attack: 3 });
      drone(I, 38, 40, { gain: 0.04, attack: 3 });
    }],
    [4.4, (I) => I.title(true)],
    [9.2, (I) => I.title(false)],
  ];

  return {
    title: 'Mate no Numa',
    place: 'Esteros del Iberá · Corrientes, 1877',
    hideTeam: true,
    fov: 52,
    shots,
    cues,
    start() {
      st.turn = 0;
      st.hold = false;
      st.plantT = -9;
      st.sunk = 0;
      show(true);
      light = g.fx.flashes?.[g.fx.flashes.length - 1] || null;
    },
    tick(I, dt, t) {
      if (I.shotI < 6) poseCrew(t, dt);
      // el farol tiembla
      const flick = 0.85 + Math.sin(t * 17) * 0.06 + Math.sin(t * 7.3) * 0.08;
      lamp.flame.scale.setScalar(0.22 * flick);
      lamp.halo.material.opacity = 0.32 * flick;
      if (light) {
        const on = lamp.root.visible;
        light.life = on ? 1 : 0;
        light.max = 1;
        light.peak = on ? 5 * flick : 0;
        light.light.color.setHex(0xffa04a);
        light.light.distance = 7;
      }
      // el quepí: flota y cabecea (con burbujas); en la toma 5 el agua se lo traga
      const sink = st.sunk ? clamp01((t - I.S.shots[5].t0 - 2.6) / 0.7) : 0;
      kepi.position.set(KEPI.x, lv() + 0.01 + Math.sin(t * 1.7) * 0.012 - sink * 0.5, KEPI.z);
      kepi.rotation.set(0.35 + Math.sin(t * 1.3) * 0.08, 0.6, Math.sin(t * 1.1) * 0.1);
      kepi.visible = sink < 0.6 && I.shotI < 6;
      if (I.shotI === 5 && sink < 1 && g.fx && Math.random() < dt * (st.sunk ? 14 : 4)) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.4;
        const c = g.water?.lit || [0.5, 0.55, 0.6];
        g.fx.alpha.spawn(KEPI.x + Math.cos(a) * r, lv() - 0.05, KEPI.z + Math.sin(a) * r, 0, 0.5, 0, { color: c, size: 0.05, size1: 0.02, life: 0.3, alpha: 0.7 });
        g.water?.ripple?.(KEPI.x + Math.cos(a) * r, KEPI.z + Math.sin(a) * r, 0.25, 0.2);
      }
    },
    stop() {
      show(false);
      kepi.visible = false;
      if (light) light.life = 0;
      light = null;
    },
    // en la carga: todos a la vista donde van a estar
    warm(I, on) {
      show(on);
      kepi.visible = on;
      if (on) {
        poseCrew(14, 0);
        kepi.position.set(KEPI.x, lv(), KEPI.z);
      }
    },
    dispose() {
      people.dispose();
      for (const o of [canoe, pole, kepi, lamp.root, lamp.pool]) o.removeFromParent();
    },
  };
}

export const SCRIPTS = { molino, granja, penal, torre, torreReto, castillo, esteros };
