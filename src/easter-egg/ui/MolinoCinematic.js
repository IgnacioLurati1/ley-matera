import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { getMats } from '../weapons/viewmodels';
import { ARENA } from '../world/Arena';
import { warmScene } from './cineWarm';
import { crewIds, personaOf, PERSONA_T } from './cineCrew';
import { cineClip, poseCineClip, gauchoClip, cineSnap, headProp, FACE_EYES } from '../net/gauchoSkin';
import { preloadBossSkin, skinBoneAt } from '../entities/bossSkin';
import { assetUrl } from '../../lib/assets';
import MolinoCinematicClassic from './MolinoCinematicClassic';
import { makeFist } from './alcaideFist';

// Final del molino, en la Salamanca con el Mandinga hecho cenizas, con los
// cuatro gauchos de la cuadrilla (ui/cineCrew.js: cada uno con su carácter)
// animados a mano en Blender (C:/Users/ignac/Tools/mdu-blender molino_clips.py
// -> modelos/gaucho/cine-molino-fin.json). La Voz de Arriba avisa que hace
// falta una yerba especial; Martín Fierro (el ánima) entra caminando, se
// presenta, le pide el Mate de Oro al tuyo, se toma un buen sorbo y se lo
// devuelve... y el Alcaide del penal aparece de un rayo, viene caminando
// sobrado, se lo arranca de la mano, se ríe y desaparece. La Voz cierra: antes
// de recuperarlo van a tener que crear una yerba más poderosa.
// Cada uno a su manera: el Valiente de brazos cruzados y a los puños; el
// Miedoso se santigua, se agacha ante el fantasma y reza; el Canchero se pone
// los anteojos de sol por el brillo del ánima y se ceba su propio mate como si
// nada mientras le roban el de oro; el Viejo resopla, se rasca la cabeza,
// trastabilla con el rayo y al final cae de rodillas.
// En línea: la misma escena para todos (con el reloj de verdad), cada uno ve
// que el mate lo tenía el suyo (en la punta, del lado de donde viene el Alcaide).
// Se puede saltear con Esc, Espacio o clic.
// globalThis.__mduBlend = false: la de antes, en primera persona
// (ui/MolinoCinematicClassic.js).

const FIERRO_ID = 401;
const CREW_ID = 460;
const WALK = 1.25;
// el Alcaide no corre (el usuario): camina sobrado, el paso al ritmo de lo que avanza
const ALC_WALK = 1.6;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const MATE_HAND = new THREE.Vector3(0, -0.2, 0.06);
// la boca en la malla del gaucho (net/gauchoSkin FACE.mouthY; adelante, la cara)
const FACE_MOUTH_Y = 160.6;
const FACE_MOUTH_Z = 16;
// la punta de la bombilla respecto de la base: la del Mate de Oro (goldMate) y
// la del mate de piezas del Canchero (más o menos); cuánto se inclina como mucho
const GOLD_TIP = new THREE.Vector3(0.035, 0.285, 0);
const OWN_TIP = new THREE.Vector3(0.03, 0.22, 0);
const SIP_MAX = 0.6;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpI = new THREE.Matrix4();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
// (el yaw de Avatars mira hacia -z con yaw 0: de un punto hacia otro)
const faceTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));
// gira de a poco hacia want: k por segundo, nunca más de max rad/s
function turn(cur, want, dt, k, max = 3) {
  let d = want - cur;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  const s = d * Math.min(1, dt * k);
  return cur + Math.sign(s) * Math.min(Math.abs(s), max * dt);
}

// los clips: se bajan al empezar la pelea del Mandinga (MolinoCinematic se arma
// con el juego) o al arrancar
let CLIPS = null;
let loading = null;
export function prefetchMolinoClips() {
  if (globalThis.__mduBlend === false) return Promise.resolve();
  loading ||= fetch(assetUrl('/assets/sotano/modelos/gaucho/cine-molino-fin.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

// Los anteojos de sol del Canchero: aviador, negros, con patillas doradas (en
// la malla del gaucho: headProp; también el muerto, ui/deathPose.js).
export function buildShades() {
  const root = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.7, roughness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.3 });
  const E = FACE_EYES;
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.1, 0.4, 20).rotateX(Math.PI / 2), glass);
    lens.scale.y = 0.85;
    lens.position.set(E.x + sx * (E.half + 0.4), E.y - 1.3, 17.3);
    root.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 13), gold);
    arm.position.set(E.x + sx * (E.half + 4), E.y - 0.4, 11);
    root.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2 * E.half - 6, 0.5, 0.45), gold);
  bridge.position.set(E.x, E.y + 0.6, 17.4);
  root.add(bridge);
  return root;
}

// Cómo reacciona cada carácter a cada cosa: [clip de una vez, el que queda, cuándo pasa al que queda]
const REACT = {
  // terminó la pelea y habla la Voz
  voz: { valiente: [null, 'crossArms'], miedoso: ['santiguar', 'pray', 2.0], canchero: [null, 'cool'], viejo: [null, 'winded'] },
  // aparece el fantasma (el Canchero: los anteojos, aparte)
  ghost: { valiente: [null, 'fists'], miedoso: ['duck', 'cower', 1.5], canchero: ['dust', 'cool', 1.9], viejo: [null, 'scratchHead'] },
  // escucha a Fierro
  listen: { valiente: [null, 'crossArms'], miedoso: [null, 'cower'], canchero: [null, 'cool'], viejo: [null, 'scratchHead'] },
  // el rayo del Alcaide
  thief: { valiente: [null, 'fists'], miedoso: ['duck', 'cower', 1.5], canchero: [null, 'sipOwn'], viejo: ['stagger', 'winded', 1.45] },
  // se lo llevó
  gone: { valiente: [null, 'shakeFist'], miedoso: ['santiguar', 'pray', 2.0], canchero: [null, 'sipOwn'], viejo: ['kneelDown', 'kneelHold', 1.0] },
};

export default class MolinoCinematic {
  constructor(root, game) {
    if (globalThis.__mduBlend === false) return new MolinoCinematicClassic(root, game);
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'mdu-fcine mdu-fcine--molino';
    this.el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p><h2 class="mdu-fcine__name">Martín Fierro</h2><h1 class="mdu-fcine__title">Continuará...</h1><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
    this.shake = 0;
    // (en línea el reloj cuenta desde acá: la compu que se traba armando la
    // escena no arranca atrasada de las demás; como ui/FarmCinematic)
    this.wallAt = game.net ? performance.now() : 0;
    this.fov0 = game.camera.fov;
    prefetchMolinoClips();
    gauchoClip('walk');
    // (el Alcaide entra a los ~35 s: su cuerpo de verdad se baja ya)
    preloadBossSkin(game.zombies, 'alcaide');
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    requestAnimationFrame(() => this.el.classList.add('is-on'));
    const A = ARENA;
    const W = g.world;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    // el Mandinga se hace cenizas
    const b = g.zombies.boss;
    this.blast = b ? b.pos.clone() : new THREE.Vector3(A.x, 0, A.z - 4);
    if (b) {
      g.fx.explosion(tmpV.set(b.pos.x, 1.2, b.pos.z), 3.5, [1, 0.4, 0.1]);
      g.fx.flash(b.pos, 0xff5a1a, 120, 0.8, 24);
      g.zombies.removeBoss();
    }
    g.hud.setBossBar(null);
    g.post.flash(1.2);
    // el piso limpio para la escena: las quemaduras y la sangre de la pelea
    // (calcos transparentes) se dibujaban encima del fantasma de Fierro
    for (const D of g.fx.decals || []) {
      D.used = 0;
      D.next = 0;
      D.mesh.count = 0;
    }
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    g.weapons.vmRoot.visible = false;
    this.people = new Avatars(g, null);
    // los cuatro en un arco mirando al fondo de la cueva (-z); el tuyo, en la
    // punta (+x) y un paso adelante: de ese lado entra el Alcaide
    const ids = crewIds(g);
    const me = g.net ? g.net.id : 0;
    const mine = Math.max(0, ids.indexOf(me));
    this.C = new THREE.Vector3(A.x, 0, A.z + 3.2);
    this.C.y = W.floorAt(this.C.x, this.C.z);
    const order = [...ids.keys()].filter((i) => i !== mine).concat(mine);
    this.crew = ids.map((id, i) => {
      const j = order.indexOf(i);
      const s = j - (ids.length - 1) / 2;
      const x = this.C.x + s * 1.25;
      const z = this.C.z + Math.abs(s) * 0.4 - (i === mine ? 0.9 : 0);
      const r = { id: CREW_ID + i, name: '', noTag: true, pos: new THREE.Vector3(x, W.floorAt(x, z), z), yaw: 0, pitch: 0, speed: 0, moving: false, persona: personaOf(i), i };
      this.people.add(r);
      // el color del poncho es el de cada uno en la partida
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      return r;
    });
    this.holder = this.crew[mine];
    // Martín Fierro: el ánima de la capilla, de pie; aparece al fondo y camina hasta el tuyo
    const H = this.holder.pos;
    this.fierro = { id: FIERRO_ID, name: 'Martín Fierro', noTag: true, pos: new THREE.Vector3(A.x + 1.2, 0, A.z - 3.2), yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true, persona: 'fierro' };
    this.fierro.pos.y = W.floorAt(this.fierro.pos.x, this.fierro.pos.z);
    this.fierroGoal = new THREE.Vector3(H.x, 0, H.z - 1.2);
    this.fierroLight = g.arena?.cineLight || new THREE.PointLight(0x7ab8ff, 0, 7, 2);
    if (!this.fierroLight.parent) this.root.add(this.fierroLight);
    // (se arma ya, escondido; una pasada a la vista y queda vestido de ánima, transparente)
    this.fierro.dead = true;
    this.people.add(this.fierro);
    this.fierro.dead = false;
    this.people.update(0);
    this.fierro.dead = true;
    // el ánima se dibuja después de lo del piso y más sólida que la de la capilla
    this.people.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m.emissive || !m.transparent) continue;
        o.renderOrder = 4;
        m.opacity = 0.84;
        m.depthWrite = true;
      }
    });
    // el Mate de Oro: en la palma del tuyo
    this.mate = this.goldMate();
    this.root.add(this.mate);
    this.mateAt = 'holder';
    this.mateFrom = new THREE.Vector3();
    this.mateT = 1;
    this.mateDur = 1;
    this.alcaide = null;
    // los anteojos de sol del Canchero (el chiste del brillo del fantasma)
    this.shades = this.buildShades();
    this.shadesHand = new THREE.Group();
    this.shadesHand.matrixAutoUpdate = false;
    this.shadesHand.add(this.shades);
    this.shadesHand.visible = false;
    this.root.add(this.shadesHand);
    g.audio.setCine(true);
    g.audio.fanfare();
    for (const r of this.crew) this.react(r, 'voz', 0);
    this.script = this.buildScript();
    warmScene(g);
  }

  // El Mate de Oro suelto: calabaza de oro, virola, yerba y bombilla.
  goldMate() {
    const m = getMats(this.g.textures);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), m.gold);
    body.scale.set(1, 1.05, 1);
    body.position.y = 0.055;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 16), m.gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.105;
    g.add(rim);
    const yerba = new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 1 }));
    yerba.rotation.x = -Math.PI / 2;
    yerba.position.y = 0.104;
    g.add(yerba);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), m.gold);
    straw.position.set(0.012, 0.15, 0);
    straw.rotation.z = -0.2;
    g.add(straw);
    g.scale.setScalar(1.25);
    return g;
  }

  // ---------------- el guion ----------------
  buildScript() {
    const g = this.g;
    const cool = this.crew.find((r) => r.persona === 'canchero' && r !== this.holder);
    return [
      [0, () => {
        this.shotBlast();
        return 1.4;
      }],
      [0, () => {
        this.shotCrewUp(16);
        return this.say('entidad', 'Bien hecho, gauchitos. El Mandinga no vuelve a molestar... por un buen tiempo.');
      }],
      [0.5, () => {
        this.shotCrewSide(16);
        return this.say('entidad', 'Pero esto recién empieza. Van a tener que conseguir una yerba especial, de esas que no se venden en ningún almacén.');
      }],
      // aparece el fantasma: cada uno a su manera; el Canchero, por el brillo, los anteojos
      [0.6, () => {
        this.fierroIn();
        this.shotOverCrew(5);
        for (const r of this.crew) if (r !== this.holder && r !== cool) this.react(r, 'ghost', 0.2);
        if (cool) {
          const t0 = 0.9;
          // (los anteojos, solo en el penal y la torre: el usuario, 2026-10-04.
          // Acá el Canchero, de cerca, se ceba su mate como si nada mientras
          // aparece el fantasma; globalThis.__mduShadesAll: los anteojos)
          const shades = !!globalThis.__mduShadesAll;
          this.later(t0, () => {
            if (shades) {
              this.act(cool, 'shades', { fade: 0.4 });
              this.shadesT = this.t;
              this.shadesR = cool;
            } else this.act(cool, 'sipOwn', { loop: true, fade: 0.4, t: 0.4 });
          });
          this.later(t0 + 0.1, () => this.shotShades(cool, 2.4));
          if (shades) this.later(t0 + 2.2, () => this.act(cool, 'cool', { loop: true, fade: 0.3 }));
          this.later(t0 + 2.5, () => this.shotOverCrew(2));
        }
        this.later(cool ? 3.7 : 2.4, () => this.walkFierro());
        return cool ? 3.6 : 2.3;
      }],
      [0.1, () => {
        this.shotFierroWalk();
        return this.say('fierro', 'M\'hijo... ya es hora de que sepas quién soy.');
      }],
      [0.2, () => Math.max(0.2, this.fierroEta())],
      [0.3, () => {
        this.shotFierro();
        for (const r of this.crew) if (r !== this.holder) this.react(r, 'listen', 0.3);
        this.el.classList.add('is-name');
        this.later(6.5, () => this.el.classList.remove('is-name'));
        return this.say('fierro', 'Me llamo Martín Fierro. Hace más de cien años me jugué el alma con el Mandinga, y desde entonces no pude tomarme un mate en paz.');
      }],
      [0.4, () => {
        this.shotTwo();
        return this.say('fierro', 'A ver ese mate, m\'hijo...');
      }],
      // se lo alcanza el tuyo; Fierro lo recibe
      [0.1, () => {
        this.act(this.holder, 'giveGold', { fade: 0.3 });
        this.later(0.35, () => this.act(this.fierro, 'fierroTake', { fade: 0.3 }));
        this.later(0.6, () => this.moveMate('fierro', 0.4));
        this.later(1.3, () => this.act(this.holder, 'gilStand', { loop: true, fade: 0.4 }));
        return 1.7;
      }],
      // el sorbo
      [0, () => {
        this.shotSip();
        this.act(this.fierro, 'fierroSip', { fade: 0.25 });
        this.later(0.9, () => g.audio.sip());
        return 2.6;
      }],
      [0, () => {
        this.act(this.fierro, 'holdGold', { loop: true, fade: 0.35 });
        return this.say('fierro', '¡Ahhh! ¡Esto sí que es un mate!');
      }],
      [0.3, () => {
        this.shotTwo();
        this.act(this.fierro, 'fierroGive', { fade: 0.3 });
        this.later(0.35, () => this.act(this.holder, 'takeGold', { fade: 0.3 }));
        this.later(0.6, () => this.moveMate('holder', 0.4));
        this.later(1.65, () => this.act(this.holder, 'holdGold', { loop: true, fade: 0.4 }));
        this.later(1.3, () => this.act(this.fierro, 'fierroTalk', { loop: true, fade: 0.4 }));
        return this.say('fierro', 'Tomá, es tuyo. Cuidalo como a la vida.');
      }],
      // el Alcaide de un rayo, y viene caminando
      [0.7, () => {
        this.alcaideIn();
        this.shotThief();
        for (const r of this.crew) if (r !== this.holder) this.react(r, 'thief', 0.05);
        return 0.4;
      }],
      [0, () => Math.max(0, this.alcaideEta())],
      [0, () => {
        this.grab();
        this.shotAlcaide();
        return 0.8;
      }],
      [0, () => {
        g.audio.laugh(this.alcaide.z.pos.clone().setY(2));
        return 0.6;
      }],
      [0, () => this.say('alcaide', '¡Gracias por el mate, gauchito! Queda secuestrado por orden del Estado. ¡Ja!')],
      [0.2, () => {
        this.shotWide();
        return this.alcaideOut();
      }],
      [0.1, () => {
        this.shotFierroFront();
        this.act(this.fierro, 'fierroPoint', { loop: true, fade: 0.3 });
        for (const r of this.crew) this.react(r, 'gone', 0.2);
        return this.say('fierro', '¡Ladrón! ¡Ese es el Alcaide del penal de la isla!');
      }],
      [0.8, () => {
        this.shotCrewUp(12, true);
        this.act(this.fierro, 'fierroTalk', { loop: true, fade: 0.5 });
        return this.say('entidad', 'Tranquilos. Lo van a recuperar... pero antes van a tener que crear una yerba mucho más poderosa.');
      }],
      [0.8, () => {
        this.el.classList.add('is-title');
        return 2.8;
      }],
      [0, () => {
        this.el.classList.add('is-fade');
        return 2.2;
      }],
      [0, () => {
        this.finish();
        return 0;
      }],
    ];
  }

  later(secs, fn) {
    this.timers.push({ t: this.t + secs, fn });
  }

  say(who, text) {
    this.textEl.textContent = text;
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro');
    this.el.classList.toggle('is-alcaide', who === 'alcaide');
    return this.g.audio.say(text, who, { cine: true });
  }

  // ---------------- los cuerpos ----------------
  clipOf(name) {
    return CLIPS?.[name] || gauchoClip(name);
  }

  // Pasa a un clip desde la pose que tiene (cineSnap). o: loop, rate, t, fade;
  // cut: sin mezcla (aparece así: el fantasma).
  act(r, name, o = {}) {
    if (r.cc?.name === name && r.cc.loop && o.loop) return;
    const a = this.people.list.get(r.id);
    r.cc = { name, lt: o.t || 0, rate: o.rate ?? 1, loop: !!o.loop, fade: o.fade ?? 0.3, at: this.t, snap: a && !o.cut ? cineSnap(a) : null, live: !!o.cut };
  }

  // Cada uno a su manera y a su tiempo (ui/cineCrew PERSONA_T); el tuyo
  // sostiene el Mate de Oro hasta que se lo roban.
  react(r, beat, base = 0) {
    if (r === this.holder && !this.stolen) return this.act(r, 'holdGold', { loop: true, fade: 0.4 });
    const R = REACT[beat]?.[r.persona];
    if (!R) return;
    const [once, after, d] = R;
    const t0 = base + (PERSONA_T[r.persona]?.delay || 0) * 0.6;
    // (los que quedan en vuelta arrancan cada uno en otro punto: no van al unísono)
    if (once) {
      this.later(t0, () => this.act(r, once, { fade: 0.3 }));
      this.later(t0 + d, () => this.act(r, after, { loop: true, fade: 0.4, t: r.i * 0.7 }));
    } else this.later(t0, () => this.act(r, after, { loop: true, fade: 0.45, t: r.i * 0.7 }));
  }

  poseAll(dt) {
    const t = this.t;
    for (const r of [...this.crew, this.fierro]) {
      const S = r.cc;
      const a = this.people.list.get(r.id);
      if (!a) continue;
      // el mate de piezas: solo el del Canchero cuando se ceba el suyo
      const own = r.persona === 'canchero' && S?.name === 'sipOwn';
      if (a.gun) a.gun.visible = false;
      a.hand.visible = own;
      if (!S || !a.gs?.on) continue;
      const c = this.clipOf(S.name);
      if (!c) continue;
      // (el clip recién bajado: se mezcla desde la pose de ahora, no desde la de cuando se pidió)
      if (!S.live) {
        S.live = true;
        if (!S.snap || t - S.at > 0.05) {
          S.snap = cineSnap(a);
          S.at = t;
          S.fade = Math.max(S.fade, 0.3);
        }
      }
      S.lt += dt * S.rate;
      const o = { loop: S.loop };
      if (S.snap && t - S.at < S.fade) {
        o.snap = S.snap;
        o.sw = smooth(clamp01((t - S.at) / S.fade));
      }
      if (!poseCineClip(a, c, S.loop ? S.lt : Math.min(S.lt, c.dur), r.pos.x, r.pos.y, r.pos.z, r.yaw + Math.PI, o)) continue;
      a.hand.matrix.copy(a.mats[6]);
      a.hand.matrixWorldNeedsUpdate = true;
      if (own) this.seatOwn(r, a);
    }
  }

  // El mate del Canchero parado en su palma (arriba del puño, derecho; en el
  // sorbo, inclinado hacia la boca).
  seatOwn(r, a) {
    const m = a.hand.children[0];
    if (!m) return;
    this.palm(a.gs.bones, tmpV);
    tmpQ.setFromAxisAngle(UP, r.yaw + Math.PI * 1.5);
    this.sipTilt(a, tmpV, tmpQ, OWN_TIP);
    tmpM.compose(tmpV, tmpQ, ONE).premultiply(tmpI.copy(a.group.matrixWorld).multiply(a.hand.matrix).invert());
    tmpM.decompose(m.position, m.quaternion, m.scale);
  }

  // La boca del gaucho en el mundo (FACE_MOUTH: en la malla, como los anteojos).
  mouthOf(a, out) {
    const B = a.gs.bones;
    const sk = a.gs.mesh.skeleton;
    const hi = sk.bones.indexOf(B.Head);
    tmpM.copy(B.Head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(a.gs.mesh.bindMatrix);
    return out.set(FACE_EYES.x, FACE_MOUTH_Y, FACE_MOUTH_Z).applyMatrix4(tmpM);
  }

  // En el sorbo (la mano abajo de la boca, clips fierroSip/sipOwn) el mate se
  // inclina hasta que la punta de la bombilla llega a la boca; lejos de la boca,
  // derecho. base: donde se apoya; q: el giro derecho (se cambia); tip: la punta
  // de la bombilla respecto de la base, sin girar.
  sipTilt(a, base, q, tip) {
    const mouth = this.mouthOf(a, tmpA);
    const d = mouth.distanceTo(base);
    const w = clamp01((0.44 - d) / 0.1);
    if (w <= 0) return;
    tmpB.copy(tip).applyQuaternion(q).normalize();
    mouth.sub(base).normalize();
    const ang = Math.min(SIP_MAX, tmpB.angleTo(mouth)) * w;
    tmpU.crossVectors(tmpB, mouth);
    if (tmpU.lengthSq() < 1e-8) return;
    q.premultiply(tmpQ2.setFromAxisAngle(tmpU.normalize(), ang));
  }

  // Dónde se apoya algo en la palma de la derecha: un poco más allá de la
  // muñeca, hacia los dedos, y arriba.
  palm(B, out) {
    B.RightHand.getWorldPosition(out);
    B.RightForeArm.getWorldPosition(tmpU);
    tmpU.subVectors(out, tmpU).normalize();
    out.addScaledVector(tmpU, 0.07);
    out.y += 0.035;
    return out;
  }

  buildShades() {
    return buildShades();
  }

  // En la mano hasta que llegan a la cara (clip 'shades': salen del poncho a
  // los 0,55 s y a los 1,15 s ya están puestos), después colgados de la cabeza.
  updateShades() {
    const r = this.shadesR;
    if (!r || this.shadesOn) return;
    const a = this.people.list.get(r.id);
    if (!a?.gs?.on) return;
    const lt = this.t - this.shadesT;
    if (lt < 0.55) return;
    if (lt < 1.15) {
      const B = a.gs.bones;
      const hand = B.RightHand.getWorldPosition(tmpV);
      const sk = a.gs.mesh.skeleton;
      const hi = sk.bones.indexOf(B.Head);
      tmpM.copy(B.Head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(a.gs.mesh.bindMatrix);
      this.shadesHand.matrix.copy(tmpM);
      tmpW.set(FACE_EYES.x, FACE_EYES.y, 16.4).applyMatrix4(tmpM);
      this.shadesHand.matrix.premultiply(tmpI.makeTranslation(hand.x - tmpW.x, hand.y - tmpW.y, hand.z - tmpW.z));
      this.shadesHand.matrixWorldNeedsUpdate = true;
      this.shadesHand.visible = true;
      return;
    }
    this.shadesHand.visible = false;
    this.shadesHand.remove(this.shades);
    headProp(a, this.shades);
    this.shadesOn = true;
  }

  // ---------------- Martín Fierro ----------------
  fierroIn() {
    const g = this.g;
    this.fierro.dead = false;
    this.people.add(this.fierro);
    this.fierroOn = true;
    this.textEl.classList.remove('is-on');
    this.fierro.yaw = faceTo(this.fierro.pos, this.fierroGoal.x, this.fierroGoal.z);
    this.act(this.fierro, 'fierroTalk', { loop: true, cut: true });
    g.fx.sparkle(tmpV.copy(this.fierro.pos).setY(this.fierro.pos.y + 1), [0.6, 0.8, 1], 40, 1.2);
    g.audio.sting();
  }

  walkFierro() {
    const f = this.fierro;
    f.walk = { from: f.pos.clone(), to: this.fierroGoal.clone(), t: 0, dur: f.pos.distanceTo(this.fierroGoal) / WALK };
    this.act(f, 'walk', { loop: true, fade: 0.35, rate: 0 });
  }

  fierroEta() {
    const W = this.fierro.walk;
    return W ? W.dur - W.t : 0;
  }

  updateFierro(dt) {
    if (!this.fierroOn) return;
    const f = this.fierro;
    const M = f.walk;
    // (mirando al tuyo; con "¡Ladrón!", a donde se esfumó el Alcaide)
    const at = f.cc?.name === 'fierroPoint' && this.vanishAt ? this.vanishAt : this.holder.pos;
    let want = faceTo(f.pos, at.x, at.z);
    if (M) {
      M.t += dt;
      const k = clamp01(M.t / M.dur);
      const prev = tmpW.copy(f.pos);
      f.pos.lerpVectors(M.from, M.to, smooth(k));
      f.pos.y = this.g.world.floorAt(f.pos.x, f.pos.z);
      // (el paso al ritmo de lo que avanza: arranca y frena sin patinar)
      const v = dt > 0 ? Math.hypot(f.pos.x - prev.x, f.pos.z - prev.z) / dt : 0;
      const c = this.clipOf('walk');
      if (f.cc?.name === 'walk' && c?.speed) f.cc.rate = Math.min(2, v / c.speed);
      if (k < 0.9) want = faceTo(M.from, M.to.x, M.to.z);
      if (k >= 1) {
        f.walk = null;
        this.act(f, 'fierroTalk', { loop: true, fade: 0.45 });
      }
    }
    f.yaw = turn(f.yaw, want, dt, 3);
    this.fierroLight.intensity = 3;
    this.fierroLight.position.set(f.pos.x, f.pos.y + 2.7, f.pos.z + 0.9);
    if (Math.random() < 0.12) this.g.fx.sparkle(tmpW.set(f.pos.x, f.pos.y + 0.6 + Math.random() * 1.2, f.pos.z), [0.6, 0.8, 1], 1, 0.6);
  }

  // Los cuatro miran lo que pasa, cada uno a su ritmo.
  updateCrew(dt) {
    const A = this.alcaide;
    for (const r of this.crew) {
      let at = this.fierroOn ? this.fierro.pos : this.blast;
      if (A && A.state !== 'gone') at = A.z.pos;
      else if (A && this.vanishAt && !this.closing) at = this.vanishAt;
      const P = PERSONA_T[r.persona] || PERSONA_T.valiente;
      r.yaw = turn(r.yaw, faceTo(r.pos, at.x, at.z), dt, P.turn * 0.8, 2.5);
    }
  }

  // ---------------- el Alcaide ----------------
  alcaideIn() {
    const g = this.g;
    const Z = g.zombies;
    const z = Z.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.kind = 'alcaide';
    z.scale = 1.22;
    z.hatHp = 1;
    z.speedType = 'walk';
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.phase = 0;
    z.slot = 0;
    // (su cuerpo de verdad: caminando o parado revoleando la cadena; al agarrar, las piezas)
    z.state = 'chase';
    const H = this.holder.pos;
    z.pos.set(H.x + 3.6, 0, H.z - 1.7);
    z.pos.y = g.world.floorAt(z.pos.x, z.pos.z);
    z.baseY = z.pos.y;
    z.yaw = Math.atan2(H.x - z.pos.x, H.z - z.pos.z);
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('alcaide');
    Z.bossRig.rig.visible = true;
    Z.bossRig.hat.visible = true;
    this.alcaide = { z, goal: new THREE.Vector3(H.x + 0.95, z.pos.y, H.z - 0.5), back: new THREE.Vector3(H.x + 2.7, z.pos.y, H.z - 2.2), state: 'walk' };
    g.fx.lightning(new THREE.Vector3(z.pos.x, 24, z.pos.z), new THREE.Vector3(z.pos.x, 0.2, z.pos.z), 0xbfd8ff, 0.6);
    g.fx.explosion(tmpV.set(z.pos.x, 0.8, z.pos.z), 2.2, [0.6, 0.8, 1]);
    g.fx.flash(z.pos, 0x9ac8ff, 90, 0.6, 20);
    g.post.flash(0.8);
    g.audio.bossArrive();
    g.audio.thunder?.(z.pos);
    this.shake = 0.5;
  }

  alcaideEta() {
    const A = this.alcaide;
    return tmpV.subVectors(A.goal, A.z.pos).setY(0).length() / ALC_WALK + 0.15;
  }

  grab() {
    const g = this.g;
    this.alcaide.state = 'grab';
    this.alcaide.z.state = 'cine';
    // (le cierra la mano alrededor del mate: su modelo no tiene dedos,
    // ui/alcaideFist.js; globalThis.__mduNoFist: la mano abierta de antes)
    this.fist = null;
    this.fistK = 0;
    const S = window.__bossSkins?.alcaide;
    if (S?.state === 2 && S.root?.visible && !globalThis.__mduNoFist) {
      this.fist = makeFist(S, this.alcaideSide() + 'Hand', { flip: !!globalThis.__mduFistFlip });
      this.fist?.fitWorld(0.055 * this.mate.scale.x);
    }
    this.moveMate('alcaide', 0.3);
    this.stolen = true;
    this.act(this.holder, 'grabbed', { fade: 0.12 });
    this.later(1.15, () => this.react(this.holder, 'thief', 0));
    this.shake = 0.35;
    g.audio.powerupGrab();
  }

  // La mano del modelo del Alcaide más cerca de la que levanta el de piezas.
  alcaideSide() {
    const z = this.alcaide.z;
    tmpV.copy(MATE_HAND).applyMatrix4(z.mats[6]);
    let best = Infinity;
    let side = 'Right';
    for (const sd of ['Left', 'Right']) {
      if (!skinBoneAt(this.g.zombies, sd + 'Hand', tmpA)) continue;
      const d = tmpA.distanceTo(tmpV);
      if (d < best) {
        best = d;
        side = sd;
      }
    }
    return side;
  }

  alcaideOut() {
    const g = this.g;
    const z = this.alcaide.z;
    this.fist?.restore();
    this.fist = null;
    g.fx.lightning(new THREE.Vector3(z.pos.x, 24, z.pos.z), new THREE.Vector3(z.pos.x, 0.3, z.pos.z), 0xbfd8ff, 0.6);
    g.fx.explosion(tmpV.set(z.pos.x, z.pos.y + 1, z.pos.z), 2.6, [0.55, 0.75, 1]);
    for (let i = 0; i < 10; i++) g.fx.steam(tmpV.set(z.pos.x + (Math.random() - 0.5), z.pos.y + 0.3 + Math.random() * 2, z.pos.z + (Math.random() - 0.5)), 4, 1);
    g.post.flash(1);
    g.audio.thunder?.(z.pos);
    this.vanishAt = z.pos.clone();
    g.zombies.removeBoss();
    this.alcaide.state = 'gone';
    this.mate.visible = false;
    this.shake = 0.6;
    return 1.2;
  }

  updateAlcaide(dt) {
    const A = this.alcaide;
    if (!A || A.state === 'gone') return;
    const z = A.z;
    const Z = this.g.zombies;
    tmpV.subVectors(A.goal, z.pos).setY(0);
    const d = tmpV.length();
    const H = this.holder.pos;
    if (A.state === 'walk' && d > 0.05) {
      // (arranca de a poco y frena al llegar)
      A.v = Math.min(ALC_WALK, (A.v || 0) + dt * 3, d * 2.5 + 0.2);
      tmpV.multiplyScalar(Math.min(d, A.v * dt) / d);
      z.pos.add(tmpV);
      z.pos.y = z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z);
      z.yaw = Math.atan2(tmpV.x, tmpV.z);
      Z.poseGait(z, dt, 0.8, this.t);
    } else {
      z.yaw = Math.atan2(H.x - z.pos.x, H.z - z.pos.z);
      Z.poseIdle(z, this.t);
      if (A.state === 'grab') {
        // se aleja de espaldas, con el mate en alto
        A.raise = Math.min(1, (A.raise || 0) + dt * 1.5);
        if (A.raise > 0.5) {
          tmpV.subVectors(A.back, z.pos).setY(0);
          const db = tmpV.length();
          if (db > 0.05) z.pos.addScaledVector(tmpV, Math.min(db, 1.2 * dt) / db);
          z.pos.y = z.baseY = this.g.world.floorAt(z.pos.x, z.pos.z);
        }
        // los dedos se cierran alrededor del mate
        if (this.fist && this.fistK < 1) {
          this.fistK = Math.min(1, this.fistK + dt / 0.3);
          this.fist.set(smooth(this.fistK));
        }
        // (el brazo sin la cachiporra: la pieza 17 sigue al otro)
        z.P.shRp = -1.4 - A.raise * 1.3;
        z.P.elR = -0.3 + A.raise * 0.1;
        z.P.torsoP = 0.15;
        z.P.headP = -0.3 * A.raise;
      }
    }
    z.P.rootY = 0;
  }

  // ---------------- el mate ----------------
  moveMate(to, dur) {
    this.mateFrom.copy(this.mate.position);
    this.mateAt = to;
    this.mateT = 0;
    this.mateDur = dur;
  }

  // Dónde tiene que estar el mate según quién lo tiene (en la palma).
  mateTarget(out) {
    const who = this.mateAt === 'fierro' ? this.fierro : this.mateAt === 'holder' ? this.holder : null;
    if (who) {
      const a = this.people.list.get(who.id);
      if (a?.gs?.on) return this.palm(a.gs.bones, out);
      if (a) return out.copy(MATE_HAND).applyMatrix4(a.mats[6]);
    }
    if (this.mateAt === 'alcaide' && this.fist) return this.fist.center(out);
    if (this.mateAt === 'alcaide' && this.alcaide) {
      // la mano de piezas que lo agarra (la que levanta); con el cuerpo de
      // verdad, la suya más cerca de esa: el mate delante de la palma, mostrándoselo
      const z = this.alcaide.z;
      const Z = this.g.zombies;
      out.copy(MATE_HAND).applyMatrix4(z.mats[6]);
      let best = Infinity;
      for (const side of ['Left', 'Right']) {
        if (!skinBoneAt(Z, side + 'Hand', tmpA) || !skinBoneAt(Z, side + 'ForeArm', tmpU)) continue;
        const d = tmpA.distanceTo(out);
        if (d < best) {
          best = d;
          tmpU.subVectors(tmpA, tmpU).normalize();
          tmpB.copy(tmpA).addScaledVector(tmpU, 0.1);
          tmpU.set(this.holder.pos.x - z.pos.x, 0, this.holder.pos.z - z.pos.z).normalize();
          tmpB.addScaledVector(tmpU, 0.08).setY(tmpB.y - 0.03);
        }
      }
      return best < Infinity ? out.copy(tmpB) : out;
    }
    return out.copy(this.mate.position);
  }

  updateMate(dt) {
    if (!this.mate.visible) return;
    this.mateTarget(tmpW);
    this.mateT = Math.min(1, this.mateT + dt / this.mateDur);
    const s = smooth(this.mateT);
    if (this.mateT < 1) {
      this.mate.position.lerpVectors(this.mateFrom, tmpW, s);
      this.mate.position.y += Math.sin(s * Math.PI) * 0.08;
    } else this.mate.position.copy(tmpW);
    // derecho, la bombilla para el lado del que lo tiene (en el sorbo, a la boca)
    const who = this.mateAt === 'fierro' ? this.fierro : this.holder;
    tmpQ.setFromAxisAngle(UP, (who?.yaw || 0) + Math.PI * 1.5);
    const a = this.mateAt !== 'alcaide' && this.mateT >= 1 ? this.people.list.get(who.id) : null;
    if (a?.gs?.on) this.sipTilt(a, this.mate.position, tmpQ, GOLD_TIP);
    // en el puño del Alcaide: atravesado como lo agarra (la boca para arriba)
    if (this.mateAt === 'alcaide' && this.fist) {
      this.fist.axis(tmpU);
      if (tmpU.y < 0) tmpU.negate();
      tmpQ.setFromUnitVectors(UP, tmpU);
    }
    this.mate.quaternion.copy(tmpQ);
    if (Math.random() < 0.15) this.g.fx.sparkle(this.mate.position, [1, 0.85, 0.4], 1, 0.12);
  }

  // ---------------- tomas ----------------
  shot(dur, fn, fov = this.fov0) {
    this.cam = { t0: this.t, dur, fn };
    const cam = this.g.camera;
    if (fov && Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  // la explosión del Mandinga: de atrás de los cuatro, alto
  shotBlast() {
    const C = this.C;
    const B = this.blast;
    this.shot(3, (u) => {
      tmpV.set(C.x + 1.2 - 0.6 * u, C.y + 2.3, C.z + 4.4 - 0.4 * u);
      tmpW.set(B.x, C.y + 1.2, B.z);
    }, 55);
  }

  // los cuatro de frente, desde abajo: escuchan la Voz (al final, un poco de costado)
  shotCrewUp(dur, end = false) {
    const C = this.C;
    const x0 = end ? -1.4 : -0.6;
    this.shot(dur, (u) => {
      tmpV.set(C.x + x0 + 1.0 * u, C.y + 0.75, C.z - 3.9 + 0.25 * u);
      tmpW.set(C.x + (end ? 0.4 : 0.3), C.y + 1.5, C.z);
    }, 46);
  }

  // los cuatro de tres cuartos, desde el lado del Miedoso: un travelling lento
  shotCrewSide(dur) {
    const C = this.C;
    this.shot(dur, (u) => {
      tmpV.set(C.x - 3.3 + 0.5 * u, C.y + 1.45, C.z - 2.7 + 0.3 * u);
      tmpW.set(C.x + 0.25, C.y + 1.2, C.z);
    }, 50);
  }

  // por arriba de los hombros del grupo (entre dos sombreros): el fantasma al fondo
  shotOverCrew(dur) {
    const C = this.C;
    const F = this.fierro.pos;
    this.shot(dur, (u) => {
      tmpV.set(C.x - 0.35, C.y + 1.8, C.z + 2.2 - 0.3 * u);
      tmpW.set(F.x, F.y + 1.2, F.z);
    }, 42);
  }

  // los anteojos del Canchero, de cerca
  shotShades(r, dur) {
    const a = this.people.list.get(r.id);
    const h = a?.gs?.on ? a.gs.bones.Head.getWorldPosition(new THREE.Vector3()) : r.pos.clone().setY(r.pos.y + 1.6);
    const fx = -Math.sin(r.yaw);
    const fz = -Math.cos(r.yaw);
    this.shot(dur, (u) => {
      const k = 1.25 - 0.3 * u;
      tmpV.set(h.x + fx * k + fz * 0.25, h.y + 0.05, h.z + fz * k - fx * 0.25);
      tmpW.set(h.x, h.y + 0.16, h.z);
    }, 38);
  }

  // Fierro caminando, de costado, acompañándolo (del lado abierto, +x)
  shotFierroWalk() {
    const f = this.fierro;
    this.shot(30, () => {
      tmpV.set(f.pos.x + 3.4, f.pos.y + 1.35, f.pos.z + 1.0);
      tmpW.set(f.pos.x, f.pos.y + 1.2, f.pos.z + 0.4);
    }, 44);
  }

  // Fierro de tres cuartos, desde al lado del hombro del tuyo (a la altura de
  // los ojos): el tuyo queda apenas en el borde. (Antes, de atrás del tuyo, su
  // espalda oscura llenaba media pantalla y le tapaba la cara a Fierro.)
  shotFierro() {
    const f = this.fierro;
    const H = this.holder;
    this.shot(30, (u) => {
      const dx = f.pos.x - H.pos.x;
      const dz = f.pos.z - H.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      const b = 0.55 - 0.12 * u;
      const s = 1.25;
      tmpV.set(H.pos.x - (dx / L) * b - (dz / L) * s, H.pos.y + 1.5, H.pos.z - (dz / L) * b + (dx / L) * s);
      // (Fierro un poco a la derecha del medio: mira hacia la izquierda, al tuyo)
      tmpW.set(f.pos.x + (dz / L) * 0.18, f.pos.y + 1.47 - 0.03 * u, f.pos.z - (dx / L) * 0.18);
    }, 32);
  }

  // los dos de perfil, del lado abierto: el mate de mano en mano
  shotTwo() {
    const f = this.fierro;
    const H = this.holder;
    this.shot(30, (u) => {
      const mx = (f.pos.x + H.pos.x) / 2;
      const mz = (f.pos.z + H.pos.z) / 2;
      const dx = f.pos.x - H.pos.x;
      const dz = f.pos.z - H.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      tmpV.set(mx - (dz / L) * 2.5, H.pos.y + 1.3, mz + (dx / L) * 2.5 + 0.15 * u);
      tmpW.set(mx, H.pos.y + 1.15, mz);
    }, 40);
  }

  // el sorbo, de cerca: de tres cuartos, de su lado derecho (el de la mano del mate)
  shotSip() {
    const f = this.fierro;
    const H = this.holder.pos;
    const L = Math.hypot(H.x - f.pos.x, H.z - f.pos.z) || 1;
    const dx = (H.x - f.pos.x) / L;
    const dz = (H.z - f.pos.z) / L;
    this.shot(6, (u) => {
      const k = 1.15 - 0.12 * u;
      tmpV.set(f.pos.x + dx * k - dz * 0.95, f.pos.y + 1.55, f.pos.z + dz * k + dx * 0.95);
      tmpW.set(f.pos.x, f.pos.y + 1.45, f.pos.z);
    }, 36);
  }

  // abierta, de atrás del grupo: el rayo y el Alcaide que viene caminando
  shotThief() {
    const H = this.holder.pos;
    this.shot(4, (u) => {
      tmpV.set(H.x - 1.0, H.y + 1.9, H.z + 4.2);
      tmpW.set(H.x + 2.0 - 0.6 * u, H.y + 1.1, H.z - 0.9);
    }, 50);
  }

  // el Alcaide con el mate en alto, desde abajo (atrás y a la derecha del tuyo)
  shotAlcaide() {
    const z = this.alcaide.z;
    const H = this.holder.pos;
    // (el mate en alto entra en cuadro: arriba de la cabeza, ~3 m)
    this.shot(8, (u) => {
      tmpV.set(H.x + 0.4, H.y + 1.0, H.z + 1.9);
      tmpW.set(z.pos.x, z.pos.y + 2.2 + 0.1 * u, z.pos.z);
    }, 50);
  }

  // Fierro de tres cuartos desde el lado abierto (+x, donde no está la
  // cuadrilla): "¡Ladrón!", señalando a donde se esfumó el Alcaide
  shotFierroFront() {
    const f = this.fierro;
    const H = this.holder.pos;
    const L = Math.hypot(H.x - f.pos.x, H.z - f.pos.z) || 1;
    const dx = (H.x - f.pos.x) / L;
    const dz = (H.z - f.pos.z) / L;
    // (más de costado: los dos enteros en cuadro; antes el tuyo quedaba cortado
    // en primer plano, una espalda grande a la izquierda)
    // (de su lado abierto, casi de perfil y más atrás del tuyo: los de la
    // cuadrilla quedan chicos al fondo, no apilados en primer plano)
    this.shot(30, (u) => {
      const k = 0.75 - 0.1 * u;
      tmpV.set(f.pos.x + dx * k + dz * 2.9, f.pos.y + 1.4, f.pos.z + dz * k - dx * 2.9);
      tmpW.set(f.pos.x + dx * 0.35, f.pos.y + 1.25, f.pos.z + dz * 0.35);
    }, 44);
  }

  shotWide() {
    const C = this.C;
    this.shot(3, () => {
      tmpV.set(C.x + 0.5, C.y + 2.2, C.z + 5.5);
      tmpW.set(C.x + 2.6, C.y + 1.0, C.z - 2.0);
    }, 54);
  }

  // ---------------- cuadro a cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!this.script) return;
    // el reloj de la escena es el de verdad, no el dt con tope de Game.loop: en
    // línea, la compu que se traba no se atrasa de los demás. Solo, más de 1 s
    // es una pausa; en línea no hay pausa y una trabada de hasta 30 s cuenta
    // (el reloj; lo que se mueve, con 1 s a lo sumo)
    const now = performance.now();
    const w = (now - (this.wallAt || 0)) / 1000;
    this.wallAt = now;
    const tw = g.net ? (w >= 0.002 && w < 30 ? w : dt) : w > dt && w < 1 ? w : dt;
    this.t += tw;
    dt = Math.min(tw, 1);
    g.time += dt;
    g.weapons.vmRoot.visible = false;
    const t = this.t;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    while (this.script && this.step < this.script.length && t >= this.next + this.script[this.step][0]) {
      const [wait, fn] = this.script[this.step];
      const start = this.next + wait;
      this.step++;
      const dur = fn() || 0;
      // (en línea, una trabada no corre el resto del guion: ponerse al día)
      this.next = (g.net ? start : Math.max(start, t)) + dur;
    }
    if (!this.script) return;
    this.closing = this.step >= this.script.length - 4;
    this.updateFierro(dt);
    this.updateCrew(dt);
    this.updateAlcaide(dt);
    this.people.update(dt);
    this.poseAll(dt);
    this.updateShades();
    // (el jefe primero: el mate va en la mano de su cuerpo de este cuadro)
    g.zombies.render(dt);
    // (la palma del puño del Alcaide hacia el tuyo: que se vea el mate que le robó)
    if (this.fist && this.alcaide?.state === 'grab') this.fist.face(tmpA.copy(this.holder.pos).setY(this.holder.pos.y + 1.4), smooth(this.fistK));
    this.updateMate(dt);
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      const fy = g.world.floorAt(tmpV.x, tmpV.z);
      if (Number.isFinite(fy)) tmpV.y = Math.max(tmpV.y, fy + 0.4);
      this.shake = Math.max(0, this.shake - dt * 0.9);
      const s = this.shake * 0.08;
      cam.position.set(tmpV.x + (Math.random() - 0.5) * s, tmpV.y + (Math.random() - 0.5) * s, tmpV.z + (Math.random() - 0.5) * s);
      cam.lookAt(tmpW);
    }
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.script = null;
    window.removeEventListener('keydown', this.onKey);
    // se cortan sus voces (también los murmullos) y vuelven a hablar los demás
    this.g.audio.hush();
    this.g.audio.setCine(false);
    this.el.remove();
    const g = this.g;
    this.fist?.restore();
    this.fist = null;
    if (this.alcaide && this.alcaide.state !== 'gone') g.zombies.removeBoss();
    this.people?.dispose();
    this.root?.removeFromParent();
    if (this.fierroLight) this.fierroLight.intensity = 0;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (this.fov0 && g.camera.fov !== this.fov0) {
      g.camera.fov = this.fov0;
      g.camera.updateProjectionMatrix();
    }
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
