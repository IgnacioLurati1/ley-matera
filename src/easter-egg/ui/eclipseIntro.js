import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { cineClip, gauchoClip, poseCineClip, whenGaucho } from '../net/gauchoSkin';
import { gilVincha } from '../net/gilLook';
import { EE, ISLANDS, PLAYER_START } from '../config/maps/eclipse';
import { ECLIPSE_DIR } from '../world/eclipseSky';
import CineHorde from './cineHorde';
import { makeDome, setSky, buildFacon } from './eclipseCineSets';
import { assetUrl } from '../../lib/assets';

// La entrada de Eclipse Matero: "El cielo se raja" (guion: scratchpad
// eclipse/CINEMATICAS.md §1). La registra ui/introShots.js (SCRIPTS.eclipse)
// y la corre ui/Intro.js. Segundos después de "El ciclo se ha roto" (el final
// de Mate no Numa donde el Gil se niega):
//  1. el algarrobo, el facón clavado con la cinta colorada y los cuatro (el
//     Gil, Benito, Cirilo, Anacleto) parados en silencio;
//  2. el cielo de la noche del estero se raja como un vidrio y se cae: atrás
//     está el cielo roto de Eclipse;
//  3. el claro se desprende y sube (la cámara baja), un anillo de polvo; los
//     cuatro, cada uno a su manera: el Gil se planta, Benito se tira al piso,
//     Cirilo se sacude el polvo, Anacleto se agarra el sombrero;
//  4. alrededor, los otros mundos salen de las nubes violetas, cada uno con su
//     sonido;
//  5. arriba, el sol (el oro de Francisco: su sombrero se dibuja un instante en
//     la luz) y la luna negra del Chiquitijuein chocan: empieza el eclipse;
//  6. del piso salen, por las grietas, los primeros desgarrados de ojos violetas;
//     los cuatro se miran;
//  7. los cuatro levantan los mates. "Esto lo rompí yo. Lo arreglo yo." El
//     nombre del mapa y te despertás.
// Nada de coordenadas fijas del claro: el algarrobo, el fogón y la isla salen
// del config (EE, ISLANDS.centro) cuando se arma. Todo sale del segundo de la
// entrada (sin estado): en línea, en la carga y al saltar se ve lo mismo. La
// canción (core/music 'intro-eclipse': 32 s de silencio y la pelea) entra con
// el choque del sol y la luna. Sin luces nuevas.

const FILES = ['cine-castillo.json', 'cine-luison.json', 'cine-esteros.json', 'cine-medias.json'];
let CLIPS = null;
let LOAD = null;
function loadClips() {
  LOAD ||= Promise.all(
    FILES.map((f) =>
      fetch(assetUrl(`/assets/sotano/modelos/gaucho/${f}`))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  ).then((all) => {
    const C = {};
    for (const J of all) if (J) for (const [k, c] of Object.entries(J.clips)) C[k] ||= cineClip(c);
    CLIPS = C;
  });
  return LOAD;
}
const clipOf = (n) => CLIPS?.[n] || gauchoClip(n);

// el Gil y los tres (los del estero: entities/EclipseEgg CAST), con su carácter
const CAST = [
  { key: 'gil', persona: 'valiente', color: 0xb01c14 },
  { key: 'benito', persona: 'miedoso', color: 0x7a5a2a },
  { key: 'cirilo', persona: 'canchero', color: 0x2a3a7a },
  { key: 'anacleto', persona: 'viejo', color: 0x3a6a2a },
];
const LINE = 'Esto lo rompí yo. Lo arreglo yo.';
// cuándo pasa cada cosa (segundos de la entrada)
const T = { crack: 7.4, fall: 9.4, lift: 12.5, react: 12.8, worlds: 20.5, sky: 32.5, hit: 34.2, pulse: 37.4, ground: 40.5, raise: 50.6, black: 54.7, title: 55.0 };

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const win = (t, a, b) => smooth(clamp01((t - a) / (b - a)));
const turnTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------------- las grietas del piso ----------------
const CRACK_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const CRACK_FRAG = `
uniform float uK;
uniform float uT;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = abs(p.y - 0.22 * sin(p.x * 6.0 + uSeed) - 0.07 * sin(p.x * 19.0 + uSeed * 3.0));
  float b = abs(p.y + 0.35 - 0.5 * p.x - 0.06 * sin(p.x * 23.0 + uSeed)) + step(p.x, 0.0) * 9.0;
  float d = min(a, b);
  float w = 0.04 * (1.0 - abs(p.x));
  float core = 1.0 - smoothstep(0.0, w, d);
  float glow = exp(-d * 9.0) * (1.0 - smoothstep(0.7, 1.0, abs(p.x)));
  float fl = 0.8 + 0.2 * sin(uT * 6.0 + p.x * 4.0);
  vec3 c = vec3(0.55, 0.12, 0.9) * glow * 0.9 + vec3(1.0, 0.75, 1.0) * core * 1.6;
  gl_FragColor = vec4(c * uK * fl, 1.0);
}`;

// ---------------- el sombrero de Francisco en la luz ----------------
function hatTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  // (la silueta negra sola no se veía contra el cielo oscuro: lleva un borde de
  // oro con resplandor, como recortada contra el sol)
  const path = () => {
    x.beginPath();
    x.ellipse(128, 86, 118, 16, 0, 0, Math.PI * 2);
    x.moveTo(72, 86);
    x.bezierCurveTo(74, 40, 90, 26, 128, 26);
    x.bezierCurveTo(166, 26, 182, 40, 184, 86);
    x.closePath();
  };
  x.shadowColor = '#ffc860';
  x.shadowBlur = 14;
  x.strokeStyle = '#ffd070';
  x.lineWidth = 5;
  path();
  x.stroke();
  x.shadowBlur = 0;
  x.fillStyle = '#060308';
  path();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function eclipse(g, I) {
  const w = g.world;
  loadClips();
  if (globalThis.__mduNoCrewClipsEarly !== true) whenGaucho(() => gauchoClip('idle'));
  // ---------------- dónde (del config de ahora) ----------------
  const isl = ISLANDS.centro;
  const fy = (x, z) => w.floorAt(x, z);
  const A = new THREE.Vector3(EE.algarrobo?.[0] ?? isl.center[0], 0, EE.algarrobo?.[1] ?? isl.center[1]);
  A.y = fy(A.x, A.z);
  const Fg = new THREE.Vector3(EE.fogon?.[0] ?? PLAYER_START.x, 0, EE.fogon?.[1] ?? PLAYER_START.z);
  const C = new THREE.Vector3(isl.center[0], isl.y, isl.center[1]);
  const R = Math.max(isl.box[2] - isl.box[0], isl.box[3] - isl.box[1]) * 0.5;
  // de qué lado del algarrobo se paran: el que tiene piso parejo y libre
  // (primero hacia el fogón, después dando la vuelta)
  const d0 = new THREE.Vector3(Fg.x - A.x, 0, Fg.z - A.z);
  if (d0.lengthSq() < 0.01) d0.set(C.x - A.x, 0, C.z - A.z);
  if (d0.lengthSq() < 0.01) d0.set(0, 0, 1);
  d0.normalize();
  const probe = new THREE.Vector3();
  const free = (x, z) => {
    const y = fy(x, z);
    if (!(Math.abs(y - A.y) < 0.6)) return false;
    probe.set(x, y, z);
    w.collide(probe, 0.35, y + 0.1, y + 1.8);
    return Math.hypot(probe.x - x, probe.z - z) < 1e-3;
  };
  // (los cuatro, el facón, las grietas y donde se paran las cámaras bajas)
  const LAY = [[2.7, 0], [3.5, 1.25], [3.6, -1.3], [4.3, 0.35], [1.4, 0.35], [6.6, 2.0], [5.8, -2.3], [6.4, -0.9], [5.2, 0], [5.6, 0.9], [4.9, 1.9]];
  let dir = d0.clone();
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    const dd = d0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const pp = new THREE.Vector3(-dd.z, 0, dd.x);
    if (LAY.every(([b, s]) => free(A.x + dd.x * b + pp.x * s, A.z + dd.z * b + pp.z * s))) {
      dir = dd;
      break;
    }
  }
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const P = (b, s = 0, h = 0, out = new THREE.Vector3()) => {
    out.set(A.x + dir.x * b + perp.x * s, 0, A.z + dir.z * b + perp.z * s);
    // (afuera del claro, el piso es el vacío: a la altura del algarrobo)
    const y = fy(out.x, out.z);
    out.y = (Math.abs(y - A.y) < 3 ? y : A.y) + h;
    return out;
  };
  const arr = (v) => [v.x, v.y, v.z];

  // ---------------- los cuatro ----------------
  const people = new Avatars(g, null);
  const crew = CAST.map((c, i) => {
    const id = 470 + i;
    people.add({ id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false });
    const a = people.list.get(id);
    a.M.poncho.color.set(c.color).multiplyScalar(1.7);
    a.group.visible = false;
    a.hand.visible = false;
    return { ...c, i, a, ys: null };
  });
  // dónde se para cada uno (mirando al algarrobo) y qué hace
  const SPOT = [P(2.7, 0), P(3.5, 1.25), P(3.6, -1.3), P(4.3, 0.35)];
  // (el yaw de poseCineClip: hacia dónde mira, 0 es +z; como ui/introCrewB)
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const face = SPOT.map((s) => yawTo(s, A));
  const towards = (i, j) => yawTo(SPOT[i], SPOT[j]);
  // [segundo, clip, { loop, yaw, look, fade, mate }]
  const ACTS = [
    // el Gil: mira el facón; se planta; mira a los otros; levanta el mate
    [[0, 'gilStand', { loop: true, look: 0.35 }], [T.react, 'brace', { loop: true, fade: 0.3 }], [42.6, 'luGilAlert', { loop: true, fade: 0.5, yaw: towards(0, 2) }], [T.raise, 'raiseV', { fade: 0.4, mate: true }]],
    // Benito: nervioso; se tira al piso; mira a todos lados; levanta el mate
    [[0, 'nervous', { loop: true }], [T.react + 0.12, 'duck', { fade: 0.15 }], [14.6, 'cower', { loop: true, fade: 0.5 }], [42.9, 'luScaredAlert', { loop: true, fade: 0.4, yaw: towards(1, 0) }], [T.raise + 0.15, 'raiseM', { fade: 0.4, mate: true }]],
    // Cirilo: de brazos cruzados; se sacude el polvo; tranquilo; levanta el mate
    [[0, 'crossArms', { loop: true }], [T.react + 0.45, 'dust', { fade: 0.4 }], [15.2, 'cool', { loop: true, fade: 0.5 }], [43.3, 'luCoolAlert', { loop: true, fade: 0.5, yaw: towards(2, 0) }], [T.raise + 0.45, 'raiseC', { fade: 0.4, mate: true }]],
    // Anacleto: cansado; se agarra el sombrero; mira; levanta el mate (el último)
    [[0, 'chestHand', { loop: true }], [T.react + 0.7, 'handsOnHat', { loop: true, fade: 0.4 }], [43.8, 'luOldAlert', { loop: true, fade: 0.6, yaw: towards(3, 1) }], [T.raise + 0.7, 'raiseO', { fade: 0.5, mate: true }]],
  ];
  const poseOne = (c, t) => {
    const acts = ACTS[c.i];
    let k = 0;
    while (k + 1 < acts.length && acts[k + 1][0] <= t) k++;
    const at = (act, tt) => {
      const [t1, n1, oo = {}] = act;
      const c1 = clipOf(n1);
      const lt = Math.max(0, tt - t1) + (oo.loop ? c.i * 0.37 : 0);
      return { c: c1, t: oo.loop ? lt : Math.min(lt, c1?.dur ?? 0), loop: !!oo.loop };
    };
    const [ta, , o = {}] = acts[k];
    const cur = at(acts[k], t);
    if (!cur.c) return false;
    const yawOf = (oo) => oo.yaw ?? face[c.i];
    let yaw = yawOf(o);
    const opt = { loop: cur.loop, look: o.look || 0 };
    const fade = o.fade ?? 0.35;
    if (k > 0 && t - ta < fade) {
      const po = acts[k - 1][2] || {};
      const prev = at(acts[k - 1], t);
      if (prev.c) {
        const wk = smooth(clamp01((t - ta) / fade));
        opt.from = prev;
        opt.w = wk;
        yaw = turnTo(yawOf(po), yaw, wk);
      }
    }
    // (el mate: en la palma cuando lo levanta; si no, escondido)
    c.a.hand.visible = !!o.mate;
    const s = SPOT[c.i];
    return poseCineClip(c.a, cur.c, cur.t, s.x, s.y, s.z, yaw, opt);
  };
  const mateUp = (c) => {
    const a = c.a;
    const mate = a.hand.children[0];
    if (!mate || !a.gs?.on || !a.hand.visible) return;
    const B = a.gs.bones;
    B.RightHand.getWorldPosition(tmpV);
    B.RightForeArm.getWorldPosition(tmpW);
    tmpW.subVectors(tmpV, tmpW).normalize();
    tmpV.addScaledVector(tmpW, 0.07);
    tmpV.y += 0.04;
    a.hand.updateWorldMatrix(true, false);
    a.hand.worldToLocal(mate.position.copy(tmpV));
    mate.quaternion.copy(a.hand.getWorldQuaternion(new THREE.Quaternion()).invert());
  };
  let crewOn = false;
  const poseCrew = (t, on) => {
    crewOn = on;
    for (const c of crew) {
      const ok = on && !!CLIPS && poseOne(c, t);
      c.a.group.visible = !!ok;
      if (ok) {
        a_hands(c);
        if (c.key === 'gil') gilVincha(c.a);
        if (!c.dim && c.a.gs?.mat) {
          c.dim = true;
          c.a.gs.mat.color.setScalar(0.78);
        }
      }
    }
  };
  const a_hands = (c) => {
    if (c.a.hand.visible) mateUp(c);
    if (c.a.gun) c.a.gun.visible = false;
  };

  // ---------------- el facón, el cielo de antes, el polvo, las grietas ----------------
  const facon = buildFacon();
  P(1.45, 0.25, 0, facon.position);
  facon.rotation.set(0.1, Math.atan2(dir.x, dir.z) + 0.4, -0.08);
  facon.visible = false;
  g.scene.add(facon);
  // el cielo de la noche del estero (luna llena): se raja y se cae
  const dome = makeDome();
  setSky(dome, 'noche', null, new THREE.Vector3(0.38, 0.42, -0.82).normalize());
  dome.visible = false;
  g.scene.add(dome);
  // el anillo de polvo del claro que se desprende
  const dust = [];
  const dustG = new THREE.Group();
  for (let k = 0; k < 28; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot, color: 0x8a7a68, transparent: true, depthWrite: false, opacity: 0 }));
    const a = (k / 28) * Math.PI * 2;
    s.userData = { a, r: R * (0.95 + 0.12 * Math.sin(k * 3.3)) };
    dustG.add(s);
    dust.push(s);
  }
  dustG.visible = false;
  g.scene.add(dustG);
  // las grietas del piso, entre la cámara y los cuatro
  const cracks = [];
  const crackG = new THREE.Group();
  for (const [b, s, rot, sz] of [[4.9, -1.4, 0.3, 2.2], [5.5, 0.9, -0.5, 2.4], [4.7, 1.9, 1.2, 1.8], [5.8, -0.2, 0.9, 2.0]]) {
    const U = { uK: { value: 0 }, uT: { value: 0 }, uSeed: { value: b * 3.1 } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * 0.5).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    P(b, s, 0.02, m.position);
    m.rotation.y = Math.atan2(dir.x, dir.z) + rot;
    crackG.add(m);
    cracks.push({ m, U, b, s });
  }
  crackG.visible = false;
  g.scene.add(crackG);
  // el sombrero de Francisco, recortado contra el sol un instante
  const hat = new THREE.Sprite(new THREE.SpriteMaterial({ map: hatTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false }));
  hat.scale.set(24, 12, 1);
  hat.visible = false;
  g.scene.add(hat);
  // los desgarrados que salen de las grietas (títeres: ui/cineHorde)
  let horde = null;
  const rise = [];
  const makeHorde = () => {
    if (horde || !g.zombies?.meshes) return;
    horde = new CineHorde(g, 6);
    for (const [k, c] of cracks.entries()) {
      for (const ds of k % 2 ? [-0.5] : [0.4, -0.6]) {
        const x = P(c.b + 0.1, c.s + ds);
        const p = horde.spawn(x.x, x.z, Math.atan2(SPOT[0].x - x.x, SPOT[0].z - x.z), { state: 'lurk' });
        if (!p) continue;
        p.floorY = x.y;
        p.t0 = T.ground + 1.0 + rise.length * 0.9;
        rise.push(p);
      }
    }
  };
  const poseHorde = (t, on) => {
    if (!horde) return;
    horde.root.visible = on;
    if (!on) return;
    for (const p of rise) {
      const k = win(t, p.t0, p.t0 + 4.5);
      // (medio afuera: salen hasta la cintura, con los brazos y la cabeza; no enteros)
      p.baseY = p.floorY - 1.75 + 0.8 * k;
      p.hidden = k <= 0.01 ? 0xffffffff : 0;
    }
  };

  // ---------------- el sonido ----------------
  const A_ = () => g.audio;
  const wind = (dur, gain = 0.14) => {
    const a = A_();
    if (!a?.ctx) return;
    a.noise(I.bus, { t: a.now, dur, type: 'bandpass', freq: 300, freqEnd: 220, q: 0.6, gain, attack: 2.5, brown: true });
  };
  const boom = (gain = 0.6) => {
    const a = A_();
    if (!a?.ctx) return;
    a.tone(I.bus, { t: a.now, dur: 1.8, freq: 62, freqEnd: 28, gain });
    a.noise(I.bus, { t: a.now, dur: 1.4, freq: 260, freqEnd: 50, q: 0.7, gain: gain * 0.6, brown: true });
  };
  const glass = () => {
    const a = A_();
    if (!a?.ctx) return;
    for (let i = 0; i < 9; i++) a.noise(I.bus, { t: a.now + i * 0.05 + Math.random() * 0.03, dur: 0.07, type: 'highpass', freq: 2800 + i * 280, q: 1.2, gain: 0.3, attack: 0.002 });
    a.tone(I.bus, { t: a.now, dur: 2.4, type: 'sine', freq: 1760, freqEnd: 1700, gain: 0.04, attack: 0.01 });
  };
  const rumble = (dur) => {
    const a = A_();
    if (!a?.ctx) return;
    a.noise(I.bus, { t: a.now, dur, type: 'lowpass', freq: 160, freqEnd: 90, gain: 0.5, attack: 0.3, brown: true });
  };
  const chord = (notes, dur = 2.4, gain = 0.05) => {
    const a = A_();
    if (!a?.ctx || !a.choir) return;
    a.choir(I.bus, a.now, notes, { dur, gain });
  };
  const bell = (n) => {
    const a = A_();
    if (a?.ctx && a.bell) a.bell(I.bus, a.now, n, { gain: 0.08, dur: 4 });
  };

  // ---------------- las tomas ----------------
  const head = (i) => SPOT[i].clone().setY(SPOT[i].y + 1.55);
  const mid = new THREE.Vector3();
  for (const s of SPOT) mid.add(s);
  mid.multiplyScalar(0.25);
  const out = new THREE.Vector3(A.x - C.x, 0, A.z - C.z);
  if (out.lengthSq() < 0.01) out.copy(dir).negate();
  out.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  const OUT = C.clone().addScaledVector(out, R + 30);
  const sky = (h) => C.clone().add(new THREE.Vector3(0, h, 0));
  const eclAt = (from, out2) => out2.copy(ECLIPSE_DIR).multiplyScalar(120).add(from);
  const skyCam = A.clone().add(new THREE.Vector3(0, 2.0, 0)).addScaledVector(dir, 5);
  const shots = [
    // 1 · el algarrobo, el facón y los cuatro, en silencio
    { d: 6.6, fadeIn: 2.5, fog: 0.8, cam: [arr(P(6.8, 2.1, 1.75)), arr(P(6.4, 1.9, 1.7))], look: [arr(P(2.2, 0.2, 1.05)), arr(P(2.1, 0.2, 1.0))], ease: 'lin', fov: 48 },
    // 2 · el cielo se raja como un vidrio
    { d: 5.9, cam: [arr(P(4.6, -0.6, 1.0)), arr(P(4.5, -0.6, 0.95))], look: [arr(P(0.5, 0, 9)), arr(P(0.2, 0, 15))], ease: 'out', fov: 60 },
    // 3 · el claro se desprende y sube (de afuera: la cámara baja)
    { d: 4.2, fog: 0.7, cam: [[OUT.x, C.y + 8, OUT.z], [OUT.x, C.y - 6, OUT.z]], look: [arr(sky(1)), arr(sky(3))], ease: 'inout', fov: 52 },
    // 3b · los cuatro, cada uno a su manera
    { d: 3.8, cam: [arr(P(5.9, -2.4, 1.6)), arr(P(5.6, -2.2, 1.55))], look: [arr(mid.clone().setY(mid.y + 1.0)), arr(mid.clone().setY(mid.y + 0.95))], ease: 'lin', fov: 46 },
    // 4 · alrededor salen los otros mundos de las nubes
    {
      d: 12,
      fog: 1,
      fov: 50,
      fn: (I2, lt, u, cam) => {
        const a0 = Math.atan2(out.z, out.x) + 0.6;
        const a = a0 + smooth(u) * 2.6;
        cam.position.copy(C).add(tmpV.set(Math.cos(a) * R * 0.6, 22 + u * 4, Math.sin(a) * R * 0.6));
        cam.lookAt(tmpW.set(C.x + Math.cos(a) * 130, C.y + 6 - u * 4, C.z + Math.sin(a) * 130));
      },
    },
    // 5 · arriba: el sol de oro y la luna negra chocan
    {
      d: 8,
      fov: 38,
      fn: (I2, lt, u, cam) => {
        cam.position.copy(skyCam);
        cam.lookAt(eclAt(skyCam, tmpW));
      },
    },
    // 6 · del piso salen los desgarrados; los cuatro se miran
    // (alto: a ras del piso la paja del claro tapaba todo)
    { d: 10.1, cam: [arr(P(7.4, -2.5, 1.65)), arr(P(7.0, -2.2, 1.55))], look: [arr(P(4.4, 0.1, 0.45)), arr(P(3.9, 0.1, 0.75))], ease: 'lin', fov: 54 },
    // 7 · los cuatro levantan los mates (de frente)
    { d: 4.4, cam: [arr(P(0.95, 0.35, 1.2)), arr(P(1.05, 0.3, 1.25))], look: [arr(P(3.5, 0.1, 1.45)), arr(P(3.5, 0.1, 1.55))], ease: 'lin', fov: 52 },
    // el nombre, en negro
    { d: 1.6, black: true },
    // 8 · te despertás en el claro
    {
      d: 4.6,
      fadeIn: 1.0,
      wake: true,
      wakeAt: 0.9,
      enter: () => {
        if (g.net?.avatars) g.net.avatars.root.visible = true;
      },
      cam: [[PLAYER_START.x + 3, fy(PLAYER_START.x, PLAYER_START.z) + 4.5, PLAYER_START.z + 3], [PLAYER_START.x + 1.2, fy(PLAYER_START.x, PLAYER_START.z) + 2.4, PLAYER_START.z + 1.2]],
      look: [[PLAYER_START.x - 2, fy(PLAYER_START.x, PLAYER_START.z) + 1.2, PLAYER_START.z - 2], [PLAYER_START.x - 2, fy(PLAYER_START.x, PLAYER_START.z) + 1.4, PLAYER_START.z - 2]],
    },
  ];
  const cues = [
    [0.1, () => wind(40, 0.13)],
    [T.crack, () => {
      glass();
      I.shake(0.25);
    }],
    [T.fall, () => {
      glass();
      boom(0.55);
      I.shake(0.6);
      if (g.audio?.thunder) g.audio.thunder(g.camera.position.clone().add(new THREE.Vector3(0, 40, 0)), true);
    }],
    [T.lift, () => {
      rumble(8);
      boom(0.7);
      I.shake(0.9);
    }],
    [T.lift + 3.5, () => I.shake(0.5)],
    // cada mundo con su sonido: la campana del molino, el viento de La Tapera,
    // el trueno del penal, el coro de la torre, el cuerno del castillo, el clarín del Monumento
    [T.worlds + 1.2, () => bell(67)],
    [T.worlds + 3.2, () => wind(4, 0.18)],
    [T.worlds + 5.0, () => g.audio?.thunder?.(g.camera.position.clone().add(new THREE.Vector3(60, 30, 0)), false)],
    [T.worlds + 7.0, () => chord([62, 66, 69], 2.6, 0.04)],
    [T.worlds + 8.8, () => chord([50, 57], 2.2, 0.05)],
    [T.worlds + 10.4, () => g.audio?.bugle?.(g.camera.position.clone().add(new THREE.Vector3(-40, 0, 40)))],
    [T.hit, () => w.eclipse?.set?.(0.45, 3.2)],
    [T.pulse, () => {
      w.eclipse?.pulse?.(1.2);
      boom(0.9);
      I.shake(1.2);
    }],
    [T.ground + 0.8, () => {
      rumble(5);
      I.shake(0.35);
    }],
    [T.raise + 0.6, () => {
      I.card(LINE, { low: true, d: 3.4 });
      g.audio?.say?.(LINE, 'gil', { cine: true });
    }],
    [T.black, () => I.dark(1, 0.3)],
    [T.title, () => {
      I.title(true);
      boom(0.5);
    }],
    [T.title + 0.4, () => I.dark(0, 0.01)],
    [T.title + 2.6, () => I.title(false)],
  ];

  // ---------------- cada cuadro (todo sale del segundo t) ----------------
  // el sobre del cielo de Eclipse: las grietas, de 0 (la noche sana) a 1
  let skyK = 0;
  let wrapped = null;
  const wrapSky = (on) => {
    const s = w.sky;
    if (!s) return;
    if (on && !wrapped) {
      wrapped = { prev: s.onBeforeRender };
      s.onBeforeRender = (...a) => {
        wrapped.prev?.(...a);
        s.material.uniforms.uCrack.value *= skyK;
      };
    } else if (!on && wrapped) {
      s.onBeforeRender = wrapped.prev;
      wrapped = null;
    }
  };
  const frame = (t, dt) => {
    // el cielo de antes: entero hasta que se raja; se cae y queda el roto
    const fall = win(t, T.fall, T.fall + 1.5);
    dome.visible = t < T.fall + 1.6;
    const U = dome.userData.U;
    U.uOpacity.value = 1 - fall;
    U.uCrack.value = win(t, T.crack, T.crack + 0.6);
    skyK = win(t, T.crack, T.fall + 1.5);
    // el claro sube: el anillo de polvo
    dustG.visible = t > T.lift - 0.2 && t < T.lift + 8;
    if (dustG.visible) {
      const k = clamp01((t - T.lift) / 6);
      for (const s of dust) {
        const d = s.userData;
        const r = d.r + k * 8;
        s.position.set(C.x + Math.cos(d.a) * r, C.y - 0.5 - k * 3, C.z + Math.sin(d.a) * r);
        s.scale.setScalar(4 + k * 6);
        s.material.opacity = 0.45 * Math.sin(Math.PI * clamp01(k * 1.2));
      }
    }
    // el sombrero de Francisco en el sol
    hat.visible = t > T.sky && t < T.hit + 0.6;
    if (hat.visible) {
      eclAt(g.camera.position, hat.position);
      hat.position.addScaledVector(ECLIPSE_DIR, 130);
      hat.material.opacity = Math.sin(Math.PI * clamp01((t - T.sky - 0.3) / 2.4));
    }
    // las grietas del piso y los que salen
    crackG.visible = t > T.ground && t < T.black + 0.5;
    for (const c of cracks) {
      c.U.uK.value = win(t, T.ground + 0.6, T.ground + 1.6);
      c.U.uT.value = t;
    }
    poseHorde(t, t > T.ground && t < T.black + 0.5);
    if (horde) horde.update(dt, t), horde.render();
    facon.visible = t < T.black;
    poseCrew(t, t < T.black + 0.2);
  };
  const show = (on) => {
    facon.visible = on;
    if (!on) {
      dome.visible = false;
      dustG.visible = false;
      crackG.visible = false;
      hat.visible = false;
      if (horde) horde.root.visible = false;
      for (const c of crew) c.a.group.visible = false;
    }
  };

  return {
    title: 'Eclipse Matero',
    place: 'El Claro del Algarrobo · Corrientes, 1877',
    hideTeam: true,
    fov: 50,
    shots,
    cues,
    start() {
      makeHorde();
      wrapSky(true);
      // (el sol y la luna todavía no se tocan: chocan a los 34 s)
      w.eclipse?.set?.(0, 0);
    },
    tick(I2, dt, t) {
      frame(t, dt);
    },
    stop() {
      show(false);
      wrapSky(false);
      w.eclipse?.set?.(0.45, 0);
    },
    // en la carga: todos a la vista donde van a estar
    warm(I2, on) {
      makeHorde();
      if (on) {
        frame(T.raise + 1, 0);
        crackG.visible = true;
        dome.visible = true;
        for (const c of crew) c.a.group.visible = true;
        if (horde) horde.root.visible = true;
      } else show(false);
    },
    dispose() {
      wrapSky(false);
      people.dispose();
      horde?.dispose();
      for (const o of [facon, dome, dustG, crackG, hat]) o.removeFromParent();
    },
  };
}
