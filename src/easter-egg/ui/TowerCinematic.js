import * as THREE from 'three';
import { EE, TOWER } from '../config/map';
import Avatars from '../net/Avatars';
import { solvePose } from '../entities/skeleton';
import { buildChiqui, chiquiGiggle, chiquiGlitch, chiquiTap } from '../world/Chiqui';
import { groundY } from '../world/Llano';
import { warmScene } from './cineWarm';

// Final de la torre (y de toda la historia, por ahora), adentro del juego.
// Son varias tomas, una detrás de la otra:
//  1. El Infierno Matero después de la pelea: Francisco de rodillas, con
//     grietas de oro, y los gauchos alrededor. Un fogonazo de oro y vuelve a
//     ser el de antes (el de la entrada del molino), dorado.
//  2. Cuenta su trato (el mate que no se termina a cambio de las almas) y
//     que el mate no era para él: se lo cuidaba al Chiquitijuein.
//  3. Tiembla la caverna, caen piedras y rayos: el Chiquitijuein se acerca.
//  4. Levanta el mate supremo y se lo da a los gauchos: que lo protejan con
//     sus vidas. Se deshace en polvo de oro.
//  5. Aparece el ánima de Martín Fierro y se los lleva (un remolino azul y
//     un fogonazo blanco) a la cima de la torre.
//  6. El remolino se calma después de cien años: amanece.
//  7. Fierro: al Chiquitijuein lo van a enfrentar juntos. A lo lejos, en la
//     explanada del llano, algo chiquito con ojos colorados mira la torre. Da
//     unos pasitos, da vuelta la cabeza (el cuerpo no), se ríe... y en un
//     parpadeo lo tenés encima. Negro. Cuando vuelve la imagen no está: solo
//     quedan sus pisadas, que terminan donde estaba la cámara.
//  8. Continuará...
// Se puede saltear con Esc, Espacio o clic.

const FIERRO = 411;
// Francisco vencido: tamaño de persona (las tomas de la escena están hechas a esa altura)
const FRAN_SCALE = 1.05;
// Francisco de vuelta en su forma dorada (el muñeco de la entrada del molino)
const FRAN_GOLD = 412;
const ME = 420;
// dónde está el Chiquitijuein: la explanada del llano, al norte de la torre
// (TOWER recién existe cuando se elige el mapa)
const CHIQUI = new THREE.Vector3();
// la toma del Chiquitijuein (segundos desde que aparece): corta a ras del
// piso, camina, se para, da vuelta la cabeza, sonríe, se ríe, se acerca de a
// saltos, negro, vuelve la imagen sin él y termina
const CHIQ = { cut: 3.4, stop: 5.9, turn: 6.4, grin: 7.6, laugh: 7.9, glitch: 9.1, black: 9.5, back: 10.7, end: 12.6 };

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
// Mirar a un punto (los muñecos tienen el frente al revés que la cámara)
const faceTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));

export default class TowerCinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'mdu-fcine mdu-fcine--torre';
    this.el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p><h2 class="mdu-fcine__name"></h2><h1 class="mdu-fcine__title">Continuará...</h1><i class="mdu-fcine__flash"></i><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    // el negro de golpe de la toma del Chiquitijuein
    this.blackEl = document.createElement('i');
    this.blackEl.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:none';
    this.el.insertBefore(this.blackEl, this.el.querySelector('.mdu-fcine__text'));
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.titleEl = this.el.querySelector('.mdu-fcine__title');
    this.nameEl = this.el.querySelector('.mdu-fcine__name');
    this.flashEl = this.el.querySelector('.mdu-fcine__flash');
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
    this.rocks = [];
    this.shake = 0;
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
    const A = EE.arena;
    this.A = new THREE.Vector3(A.x, A.y || 0, A.z);
    this.top = EE.canon.y;
    const [sx, sz] = TOWER.llano.spot;
    CHIQUI.set(sx, groundY(sx, sz), sz);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    if (g.zombies.boss) {
      const b = g.zombies.boss;
      g.fx.sparkle(tmpV.set(b.pos.x, (b.baseY || 0) + 1.5, b.pos.z), [1, 0.85, 0.4], 60, 1.2);
      g.zombies.removeBoss();
    }
    g.hud.setBossBar(null);
    g.weapons.vmRoot.visible = false;
    this.fov0 = g.camera.fov;
    // los compañeros de la red no se ven: en la escena van todos juntos
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // ni el ánima del easter egg (la escena tiene su propio Fierro) ni lo que quedó tirado
    if (g.ee?.npc) g.ee.npc.root.visible = false;
    if (g.ee?.fierroGlow) g.ee.fierroGlow.visible = false;
    for (const it of g.powerups?.items || []) it.mesh.visible = false;
    this.people = new Avatars(g, null);
    // Francisco, de rodillas en el medio de la caverna: el mismo cuerpo del jefe
    this.fran = { pos: new THREE.Vector3(A.x, 0, A.z - 2) };
    this.buildFran();
    this.buildFranGold();
    this.franFade = 1;
    // los gauchos: vos y los compañeros, en fila frente a Francisco
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    this.gauchos = ids.map((id, i) => {
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, crouch: false };
      this.people.add(r);
      // el color del poncho es el de cada uno en la partida
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      r.slot = i - (ids.length - 1) / 2;
      return r;
    });
    this.placeGauchos(new THREE.Vector3(A.x, 0, A.z + 2.3), A.x, A.z - 2);
    // el mate supremo, tirado al lado de Francisco
    this.mate = this.buildMate();
    this.mate.position.set(A.x + 0.7, 0.2, A.z - 1.5);
    this.root.add(this.mate);
    this.mateGoal = null;
    // las luces ya están en la escena desde que se armó la torre (ver cineWarm)
    const spare = g.world.tower?.cineLights || [];
    this.mateLight = this.light(spare[0], 0xffc050, 4, 6);
    // Martín Fierro (aparece después, pero se arma ya, escondido) y su luz
    this.fierro = { id: FIERRO, name: 'Martín Fierro', noTag: true, pos: new THREE.Vector3(A.x, 0, A.z - 1.6), yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true, dead: true };
    this.people.add(this.fierro);
    // (una pasada con él a la vista: así ya queda vestido de ánima, transparente)
    this.fierro.dead = false;
    this.people.update(0);
    this.fierro.dead = true;
    this.fierroLight = this.light(spare[1], 0x7ab8ff, 0, 8);
    // el Chiquitijuein, escondido hasta el final, y sus pisadas
    this.chiq = buildChiqui(g.textures);
    this.chiq.root.visible = false;
    this.root.add(this.chiq.root);
    this.buildPrints();
    g.weather?.set?.('storm', false);
    // se callan todos para darle lugar a la escena
    g.audio.setCine(true);
    g.audio.fanfare();
    this.script = this.buildScript();
    // todo lo que va a aparecer se compila ya, en segundo plano
    warmScene(g);
  }

  // Una luz de la escena (ya creada con el mapa) o, si no hay, una propia.
  light(L, color, intensity, distance) {
    const l = L || new THREE.PointLight(color, intensity, distance, 2);
    l.color.set(color);
    l.intensity = intensity;
    l.distance = distance;
    l.decay = 2;
    if (!l.parent) this.root.add(l);
    return l;
  }

  // El mate supremo: una calabaza de oro que brilla.
  buildMate() {
    const gr = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc84a, roughness: 0.2, metalness: 1, emissive: 0x5a3a00, emissiveIntensity: 0.8 });
    gr.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.1, 0.01], [0.16, 0.1], [0.16, 0.2], [0.11, 0.3], [0.09, 0.33]].map(([r, y]) => new THREE.Vector2(r, y)), 20), gold));
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8), gold);
    straw.position.set(0.04, 0.42, 0);
    straw.rotation.z = -0.3;
    gr.add(straw);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffc84a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    glow.scale.setScalar(0.8);
    glow.position.y = 0.2;
    gr.add(glow);
    this.mateGlow = glow;
    return gr;
  }

  // Las pisadas del Chiquitijuein: chiquitas, coloradas, que se apagan solas.
  buildPrints() {
    const geo = new THREE.CircleGeometry(0.03, 8).rotateX(-Math.PI / 2);
    geo.scale(1, 1, 1.7);
    this.printMat = new THREE.MeshBasicMaterial({ color: 0xff3018, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.prints = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(geo, this.printMat);
      m.visible = false;
      this.root.add(m);
      this.prints.push(m);
    }
  }

  // Pisadas de a hasta b (alternando pie izquierdo y derecho).
  stepPrints(a, b, from) {
    const d = tmpU.copy(b).sub(a).setY(0);
    const len = d.length();
    const n = Math.min(this.prints.length - from, Math.max(1, Math.floor(len / 0.2)));
    const yaw = Math.atan2(d.x, d.z);
    for (let k = 0; k < n; k++) {
      const m = this.prints[from + k];
      const u = (k + 0.5) / n;
      const side = k % 2 ? 1 : -1;
      const x = a.x + (b.x - a.x) * u + Math.cos(yaw) * side * 0.06;
      const z = a.z + (b.z - a.z) * u - Math.sin(yaw) * side * 0.06;
      m.position.set(x, groundY(x, z) + 0.05, z);
      m.rotation.y = yaw;
      m.visible = true;
    }
    return from + n;
  }

  // Los pasos, uno detrás del otro: [espera antes, acción que devuelve cuánto dura].
  buildScript() {
    const g = this.g;
    return [
      [0.3, () => {
        this.shotWide();
        this.later(1.2, () => this.goldIn());
        return 3.4;
      }],
      [0, () => this.say('francisco', 'Esperen... ¿escuchan eso? El viento cambió.')],
      [0.3, () => {
        this.shotFran();
        return this.say('francisco', 'Hace cien años hice un trato. Me dieron el mate que no se termina nunca... a cambio de las almas de todos los gauchos.');
      }],
      [0.2, () => this.say('francisco', 'Pero ese mate no era para mí. Yo nomás se lo cuidaba... a él.')],
      [0.3, () => {
        this.quake(1.2);
        this.shotQuake();
        return this.say('francisco', 'El Chiquitijuein. Viene de más allá del remolino... y viene por el mate.');
      }],
      [0.2, () => {
        this.quake(0.5);
        this.pose = 'raise';
        this.moveMate(tmpV.set(this.A.x, 1.55, this.A.z - 1.25), 2.2);
        this.shotMate();
        return this.say('francisco', 'El mate supremo. No puede caer en sus manos.');
      }],
      [0.2, () => {
        this.moveMate(tmpV.set(this.A.x, 1.35, this.A.z + 1.1), 2.6);
        this.shotShoulder();
        return this.say('francisco', 'Protéjanlo... con sus vidas.');
      }],
      [0.3, () => {
        this.pose = null;
        this.dissolve();
        this.shotDissolve();
        return 4.4;
      }],
      [0.8, () => {
        this.fierroIn();
        this.shotFierro();
        return 1.4;
      }],
      [0, () => this.say('fierro', 'Tranquilos, muchachos. Ya pasó.')],
      [0.2, () => this.say('fierro', 'Francisco no era malo. Se perdió buscando un mate que no se termina nunca... como tantos.')],
      [0.2, () => this.say('fierro', 'Agarren fuerte ese mate. Nos vamos de acá.')],
      [0.2, () => {
        this.portal();
        this.shotPortal();
        return 3.6;
      }],
      [0, () => {
        this.toTop();
        this.shotCrane();
        return 3;
      }],
      [0, () => this.say('fierro', 'Miren. Cien años girando... y el remolino por fin se calma.')],
      [0.4, () => {
        this.shotSky();
        return 5;
      }],
      [0.2, () => {
        this.shotFierroTop();
        // lejos, traída por el viento, una risita
        this.later(3.3, () => chiquiGiggle(g.audio, { gain: 0.4, pan: 0.75, echo: 0.8, pitch: 0.94 }));
        return this.say('fierro', 'Pero esto no terminó. El Chiquitijuein ya sabe dónde está el mate.');
      }],
      [0.2, () => this.say('fierro', 'Y cuando venga... lo vamos a enfrentar juntos. Todos.')],
      [0.5, () => {
        this.chiquiIn();
        this.shotHorizon();
        return CHIQ.end;
      }],
      // (sigue el negro, callado: el cartel solo, sin la voz de Fierro)
      [0.3, () => {
        this.textEl.classList.remove('is-on');
        this.el.classList.add('is-title');
        return 4.2;
      }],
      [1.2, () => {
        this.nameEl.textContent = 'Gracias por jugar, paisanos';
        this.el.classList.add('is-name');
        return 3.8;
      }],
      [0, () => {
        this.el.classList.add('is-fade');
        return 2.4;
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

  // Habla un personaje: subtítulo con su color y voz (o murmullos).
  say(who, text) {
    this.textEl.textContent = text;
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro');
    this.el.classList.toggle('is-fran', who === 'francisco');
    return this.g.audio.say(text, who, { cine: true });
  }

  // ---------------- los que actúan ----------------
  placeGauchos(center, lookX, lookZ) {
    for (const r of this.gauchos) {
      // en un arco suave, mirando al que habla
      const s = r.slot;
      r.pos.set(center.x + s * 1.15, center.y, center.z + Math.abs(s) * 0.35);
      r.yaw = faceTo(r.pos, lookX + s * 0.3, lookZ);
    }
  }

  moveMate(to, dur) {
    this.mateFrom = this.mate.position.clone();
    this.mateGoal = to.clone();
    this.mateT = 0;
    this.mateDur = dur;
  }

  // La caverna tiembla: la cámara se sacude y caen piedras de la bóveda.
  quake(k) {
    const g = this.g;
    this.shake = Math.max(this.shake, k);
    g.audio.thunder?.(tmpV.set(this.A.x, 8, this.A.z));
    g.audio.bossSlam?.(tmpV.set(this.A.x, 4, this.A.z));
    const n = Math.round(4 + k * 5);
    for (let i = 0; i < n; i++) {
      this.later(i * 0.35 + Math.random() * 0.3, () => {
        const a = Math.random() * Math.PI * 2;
        const d = 3 + Math.random() * 9;
        const s = 0.25 + Math.random() * 0.35;
        const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 4, 6), this.g.arena?.rockMat || this.g.world.M.stone);
        m.rotation.x = Math.PI;
        m.position.set(this.A.x + Math.cos(a) * d, 12, this.A.z + Math.sin(a) * d);
        this.root.add(m);
        this.rocks.push({ m, v: 0 });
      });
    }
  }

  dissolve() {
    const g = this.g;
    this.dissolving = true;
    g.audio.whoosh?.(this.fran.pos);
    g.audio.sting();
  }

  fierroIn() {
    const g = this.g;
    this.fierro.dead = false;
    this.people.add(this.fierro);
    this.fierroOn = true;
    this.fierro.yaw = faceTo(this.fierro.pos, this.A.x, this.A.z + 2.3);
    g.fx.sparkle(tmpV.copy(this.fierro.pos).setY(1), [0.6, 0.8, 1], 60, 1.2);
    g.fx.flash(tmpV.copy(this.fierro.pos).setY(1.2), 0x7ab8ff, 80, 0.6, 14);
    g.post?.flash(0.5);
    g.audio.sting();
  }

  // Fierro levanta el brazo: un remolino azul alrededor de todos y un fogonazo.
  portal() {
    const g = this.g;
    this.pose = 'portal';
    this.portalT = 0;
    g.audio.whoosh?.(this.fierro.pos);
    this.later(2.6, () => {
      this.flashEl.classList.add('is-on');
      g.audio.powerupGrab?.();
      g.audio.thunder?.(this.fierro.pos);
    });
  }

  // A la cima de la torre: el remolino se calma y amanece.
  toTop() {
    const g = this.g;
    this.atTop = true;
    this.portalT = null;
    this.pose = null;
    const y = this.top;
    this.placeGauchos(new THREE.Vector3(TOWER.cx, y, TOWER.cz + 5.6), TOWER.cx, TOWER.cz - 6);
    this.fierro.pos.set(TOWER.cx + 2.2, y, TOWER.cz + 3.4);
    this.fierro.yaw = faceTo(this.fierro.pos, TOWER.cx, TOWER.cz + 5.6);
    this.mateGoal = null;
    this.mate.position.set(TOWER.cx, y + 1.4, TOWER.cz + 4.5);
    this.dropFran();
    this.goldR.dead = true;
    this.goldGlow.visible = false;
    this.rocks.forEach((r) => r.m.removeFromParent());
    this.rocks = [];
    this.shake = 0;
    const T = g.world.tower;
    if (T) {
      T.setSky('hidden');
      T.skyOpenK = 0;
    }
    g.weather?.set?.('clear', false);
    // la lluvia para enseguida (el resto del clima se acomoda de a poco)
    if (g.weather?.cur) {
      g.weather.cur.rain = 0.1;
      g.weather.cur.storm = 0;
    }
    g.world.setDaylight?.(0.6);
    this.later(0.25, () => this.flashEl.classList.remove('is-on'));
  }

  chiquiIn() {
    const C = this.chiq;
    const o = C.root;
    o.visible = true;
    o.position.copy(CHIQUI);
    o.rotation.y = Math.atan2(TOWER.cx - CHIQUI.x, TOWER.cz - CHIQUI.z);
    C.head.rotation.set(0, 0, 0);
    C.eyeK = 1;
    this.chiqui = { t: 0, steps: 0, start: CHIQUI.clone(), stop: null, near: null, stage: 0, headTo: null };
  }

  // El negro de golpe (fade: segundos para irse o volver; 0 = de golpe).
  black(v, fade = 0) {
    this.blackEl.style.transition = fade ? `opacity ${fade}s` : 'none';
    this.blackEl.style.opacity = String(v);
  }

  // Lo pone entre donde se paró y la cámara (frac) o pegado a ella (dist).
  hop(frac, dist = 0) {
    const S = this.chiqui;
    const o = this.chiq.root;
    const cam = this.g.camera.position;
    const from = S.stop || o.position;
    tmpU.set(cam.x - from.x, 0, cam.z - from.z);
    const L = tmpU.length();
    tmpU.multiplyScalar((dist ? L - dist : L * frac) / Math.max(0.01, L));
    o.position.set(from.x + tmpU.x, 0, from.z + tmpU.z);
    o.position.y = groundY(o.position.x, o.position.z);
    o.rotation.y = Math.atan2(cam.x - o.position.x, cam.z - o.position.z);
    this.chiq.head.rotation.set(0, 0, 0);
    o.visible = true;
    this.black(0);
    return o.position.clone();
  }

  // La toma del Chiquitijuein, cuadro a cuadro (los tiempos están en CHIQ).
  updateChiqui(dt) {
    const S = this.chiqui;
    if (!S) return;
    const g = this.g;
    const C = this.chiq;
    const o = C.root;
    const t = (S.t += dt);
    C.update(dt, this.t);
    const cam = g.camera.position;
    // de lejos los ojos se tienen que ver; de cerca, apenas dos chispas (del
    // mismo tamaño en pantalla, esté donde esté)
    const d = o.position.distanceTo(cam);
    for (const gl of C.glows) gl.scale.setScalar(t > CHIQ.cut ? Math.min(0.09, 0.02 + d * 0.011) * (0.8 + C.eyeK * 0.2) : 0.24);
    C.halo.material.opacity = t > CHIQ.cut ? 0 : 0.45 + Math.sin(t * 3) * 0.1;
    if (t > CHIQ.cut && t < CHIQ.stop) {
      // pasitos rengos hacia la torre; la bombilla golpea el piso cada dos
      const face = o.rotation.y;
      const v = 0.34 * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.5)));
      o.position.x += Math.sin(face) * dt * v;
      o.position.z += Math.cos(face) * dt * v;
      o.position.y = groundY(o.position.x, o.position.z) + Math.abs(Math.sin(t * 5.5)) * 0.03;
      C.arms[0].rotation.x = Math.sin(t * 5.5) * 0.25;
      const step = Math.floor(t * 1.75);
      if (step !== S.steps) {
        S.steps = step;
        g.audio.footstep?.('dirt', 0.25);
        if (step % 2) chiquiTap(g.audio, 0.6);
      }
    } else if (t >= CHIQ.stop && !S.stop) {
      // se para; no se oye nada
      S.stop = o.position.clone();
      o.position.y = groundY(o.position.x, o.position.z);
      C.arms[0].rotation.x = 0;
    }
    // da vuelta la cabeza (el cuerpo no) hasta mirarte por arriba del hombro
    if (t > CHIQ.turn && S.stage < 2) {
      if (S.headTo === null) {
        let a = Math.atan2(cam.x - o.position.x, cam.z - o.position.z) - o.rotation.y;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        S.headTo = a;
      }
      const k = smooth(clamp01((t - CHIQ.turn) / 1.3));
      C.head.rotation.y = S.headTo * k;
      C.eyeK = 1 + k * 1.3;
    }
    // sonríe... y se ríe
    C.toothMat.opacity = t > CHIQ.grin && t < CHIQ.black ? clamp01((t - CHIQ.grin) / 0.35) : 0;
    if (t > CHIQ.laugh && S.stage < 1) {
      S.stage = 1;
      chiquiGiggle(g.audio, { gain: 1.2, echo: 0.55 });
    }
    // de a saltos: se va y aparece cada vez más cerca (con estática)
    const G0 = CHIQ.glitch;
    if (t > G0 && S.stage < 2) {
      S.stage = 2;
      o.visible = false;
      this.black(1);
      chiquiGlitch(g.audio);
    }
    if (t > G0 + 0.06 && S.stage < 3) {
      S.stage = 3;
      this.hop(0.55);
    }
    if (t > G0 + 0.2 && S.stage < 4) {
      S.stage = 4;
      o.visible = false;
      this.black(1);
      chiquiGlitch(g.audio, 0.8);
    }
    if (t > G0 + 0.26 && S.stage < 5) {
      S.stage = 5;
      S.near = this.hop(0, 0.72);
      this.shake = Math.max(this.shake, 0.25);
    }
    // negro de golpe, pegado a la cara, y silencio total: ya no vuelve la
    // imagen (después del negro sale el "Continuará...", callado)
    if (t > CHIQ.black && S.stage < 6) {
      S.stage = 6;
      o.visible = false;
      this.black(1);
      this.silence();
    }
  }

  // Silencio total (el negro del final): se corta todo lo que suena; finish lo devuelve.
  silence() {
    const au = this.g.audio;
    if (!au.ctx || this.master0 != null) return;
    this.master0 = au.master.gain.value;
    au.hush();
    au.master.gain.setTargetAtTime(0, au.ctx.currentTime, 0.015);
  }

  // ---------------- tomas (dónde está la cámara) ----------------
  shot(dur, fn) {
    this.cam = { t0: this.t, dur, fn };
  }

  shotWide() {
    const A = this.A;
    this.shot(7, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 7.5 - e * 3.2, 5.4 - e * 2.8, A.z + 8 - e * 3.6);
      tmpW.set(A.x, 0.9, A.z - 1.4);
    });
  }

  shotFran() {
    const F = this.fran.pos;
    this.shot(11, (u) => {
      tmpV.set(F.x + 0.9 - u * 0.5, 0.85 + u * 0.1, F.z + 1.7 - u * 0.3);
      tmpW.set(F.x, 1.05, F.z);
    });
  }

  shotQuake() {
    const A = this.A;
    this.shot(6, (u) => {
      tmpV.set(A.x - 4.2 + u * 0.8, 2 + u * 0.3, A.z + 1.6);
      tmpW.set(A.x, 1.2 + u * 1.5, A.z - 1.6);
    });
  }

  shotMate() {
    this.shot(5, (u, t) => {
      const m = this.mate.position;
      const a = 0.4 + t * 0.35;
      tmpV.set(m.x + Math.sin(a) * 1.9, m.y + 0.25, m.z + Math.cos(a) * 1.9);
      tmpW.copy(m);
    });
  }

  shotShoulder() {
    const A = this.A;
    this.shot(5, (u) => {
      tmpV.set(A.x + 1.1 - u * 0.4, 1.95, A.z + 4.4 - u * 0.4);
      tmpW.lerpVectors(tmpV.clone().set(A.x, 1.2, A.z - 2), this.mate.position, 0.7);
    });
  }

  shotDissolve() {
    const F = this.fran.pos;
    this.shot(4.4, (u) => {
      tmpV.set(F.x + 1.6 - u * 0.5, 1.3 + u * 0.4, F.z + 2.4 - u * 0.6);
      tmpW.set(F.x, 1 + u * 1.2, F.z);
    });
  }

  shotFierro() {
    const f = this.fierro.pos;
    this.shot(16, (u) => {
      tmpV.set(f.x + 1.5 - u * 0.4, 1.65, f.z + 2.6 - u * 0.5);
      tmpW.set(f.x, 1.42, f.z);
    });
  }

  shotPortal() {
    const A = this.A;
    this.shot(3.6, (u) => {
      const a = 0.6 + u * 1.4;
      tmpV.set(A.x + Math.sin(a) * (6 - u * 2), 4.5 + u * 2.5, A.z + 1 + Math.cos(a) * (6 - u * 2));
      tmpW.set(A.x, 1, A.z + 1);
    });
  }

  // En la cima: la cámara sube desde abajo de las almenas y los descubre.
  shotCrane() {
    const c = new THREE.Vector3(TOWER.cx, this.top, TOWER.cz + 5);
    this.shot(8, (u) => {
      const e = smooth(u);
      tmpV.set(c.x + 7 - e * 2, c.y + 1.4 + e * 2.6, c.z + 8.5 - e * 2);
      tmpW.set(c.x, c.y + 1.3, c.z - 0.6);
    });
  }

  shotSky() {
    const c = new THREE.Vector3(TOWER.cx, this.top, TOWER.cz + 5);
    this.shot(5, (u) => {
      const e = smooth(u);
      tmpV.set(c.x + 3.2, c.y + 1.5, c.z + 4.5);
      tmpW.set(c.x - 2 * e, c.y + 1.3 + e * 30, c.z - 4 - e * 30);
    });
  }

  shotFierroTop() {
    const f = this.fierro.pos;
    this.shot(12, (u) => {
      tmpV.set(f.x - 1.2 + u * 0.3, f.y + 1.62, f.z + 2.3 - u * 0.3);
      tmpW.set(f.x, f.y + 1.45, f.z);
    });
  }

  // El llano: desde afuera de las almenas del norte (desde el medio de la
  // cima no se ve el piso de abajo) la cámara se acerca de golpe (zoom) a la
  // explanada: algo chiquito en el medio de la ronda de apachetas. Corta a ras
  // del piso, detrás de él, con la torre enorme adelante. Cuando da vuelta la
  // cabeza la cámara lo busca, y lo sigue en cada salto hasta tenerlo encima.
  shotHorizon() {
    this.textEl.classList.remove('is-on');
    const from = new THREE.Vector3(TOWER.cx - 1, this.top + 2.6, TOWER.z0 - 2.5);
    const low = new THREE.Vector3(CHIQUI.x + 1.3, CHIQUI.y + 0.5, CHIQUI.z - 2.6);
    const look = new THREE.Vector3();
    this.shot(CHIQ.end, (u, t) => {
      const o = this.chiq.root;
      if (t < CHIQ.cut) {
        tmpV.copy(from);
        tmpW.set(CHIQUI.x, CHIQUI.y + 0.6, CHIQUI.z);
        const z = smooth(clamp01((t - 0.9) / 2));
        this.setFov(this.fov0 + (6 - this.fov0) * z);
        if (z > 0 && z < 1) tmpV.y += Math.sin(t * 40) * 0.004;
        return;
      }
      this.setFov(46);
      const k = Math.min(t, CHIQ.stop) - CHIQ.cut;
      tmpV.set(low.x - k * 0.04, low.y, low.z + k * 0.16);
      tmpW.set(TOWER.cx + 1.5, 7 + k * 1.2, TOWER.cz);
      // la cara (o, cuando vuelve la imagen, el piso donde terminan las pisadas)
      const S = this.chiqui;
      if (t > CHIQ.back && S?.trail) look.copy(S.trail);
      else if (o.visible || t > CHIQ.glitch) look.copy(o.position).setY(o.position.y + 0.8);
      tmpW.lerp(look, smooth(clamp01((t - CHIQ.turn) / 1.4)));
    });
  }

  shotEnd() {
    const c = new THREE.Vector3(TOWER.cx, this.top, TOWER.cz + 5);
    this.setFov(this.fov0);
    this.shot(14, (u) => {
      const a = -0.5 + u * 0.5;
      tmpV.set(c.x + Math.sin(a) * (8 + u * 6), c.y + 2.5 + u * 5, c.z + Math.cos(a) * (8 + u * 6));
      tmpW.set(c.x, c.y + 1.2 + u * 4, c.z - 1);
    });
  }

  setFov(f) {
    const cam = this.g.camera;
    if (Math.abs(cam.fov - f) < 0.01) return;
    cam.fov = f;
    cam.updateProjectionMatrix();
  }

  // Francisco: el cuerpo del jefe (con su ropa de la pelea), de rodillas y
  // mirando a los gauchos; las grietas de oro son el emissive de su ropa.
  buildFran() {
    const Z = this.g.zombies;
    const z = Z.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.kind = 'francisco';
    z.scale = FRAN_SCALE;
    z.hatHp = 1;
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.phase = 0;
    z.slot = 0;
    z.pos.copy(this.fran.pos);
    z.baseY = 0;
    z.yaw = 0;
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('francisco');
    Z.bossRig.rig.visible = true;
    this.franZ = z;
  }

  franMats() {
    const BM = this.g.zombies.bossMats;
    return BM ? [BM.skin, BM.cloth, BM.poncho] : [];
  }

  // Francisco vencido vuelve a ser el de antes: el mismo muñeco de la entrada
  // del molino (poncho claro, faja de oro, sombrero de paja vieja, ojos de oro),
  // con un brillo dorado. Se arma ya, escondido (así se compila con la escena).
  buildFranGold() {
    const p = this.fran.pos;
    const r = { id: FRAN_GOLD, name: '', noTag: true, pos: p.clone(), yaw: faceTo(p, this.A.x, this.A.z + 2.3), pitch: 0, speed: 0, moving: false, dead: true };
    this.people.add(r);
    const a = this.people.list.get(FRAN_GOLD);
    a.hand.visible = false;
    a.M.poncho.color.set(0x9a8a6a);
    a.M.band.color.set(0xd8a830);
    a.M.hat.color.set(0x8a7448);
    a.M.skin.color.set(0x9a7a60);
    a.M.eye.color.set(0xffa818).multiplyScalar(1.3);
    for (const m of Object.values(a.M)) {
      m.transparent = true;
      if (m.emissive) m.emissive.set(0xffa020);
    }
    r.poseFn = (P) => this.franPose(P);
    this.goldR = r;
    this.goldM = a.M;
    this.goldK = 0;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffc050, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    glow.scale.setScalar(2.2);
    glow.position.set(p.x, 0.95, p.z);
    this.root.add(glow);
    this.goldGlow = glow;
  }

  // El fogonazo de oro: se le cae lo del Infierno y queda el Francisco de antes.
  goldIn() {
    const g = this.g;
    const p = this.fran.pos;
    this.dropFran();
    this.goldR.dead = false;
    this.goldK = 1;
    g.fx.sparkle(tmpV.set(p.x, 1, p.z), [1, 0.85, 0.4], 80, 1.3);
    g.fx.flash(tmpV.set(p.x, 1.2, p.z), 0xffc050, 90, 0.7, 14);
    g.post?.flash(0.55);
    const au = g.audio;
    const bus = au.ctx ? au.out({ gain: 1, reverb: 0.6, bus: au.music }) : null;
    if (bus) {
      au.bell(bus, au.now, 69, { gain: 0.1, dur: 4 });
      au.choir(bus, au.now + 0.05, [57, 64, 69, 73], { dur: 2.6, gain: 0.05, attack: 0.25, release: 2 });
    }
  }

  // Se va Francisco (se deshizo, o la escena ya no pasa en la caverna).
  dropFran() {
    const Z = this.g.zombies;
    if (this.franZ && Z.boss === this.franZ) Z.removeBoss();
    this.franZ = null;
    for (const m of this.franMats()) if (m.emissive) m.emissiveIntensity = 0;
  }

  // ---------------- cuadro a cuadro ----------------
  // Después de la pose de siempre: Fierro con el brazo en alto.
  repose(id, fn) {
    const a = this.people.list.get(id);
    if (!a) return;
    const P = a.fake.P;
    fn(P);
    const r = a.r;
    solvePose(a.mats, r.pos.x, r.pos.z, r.yaw + Math.PI, 1, P);
    for (const m of a.parts) {
      m.matrix.copy(a.mats[m.part]);
      m.matrixWorldNeedsUpdate = true;
    }
    for (const e of a.extras) {
      e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
      e.obj.matrixWorldNeedsUpdate = true;
    }
    a.hand.matrix.copy(a.mats[6]);
    a.hand.matrixWorldNeedsUpdate = true;
  }

  // De rodillas, encorvado; levanta los brazos para ofrecer el mate (la misma
  // pose para el cuerpo del jefe y para el Francisco dorado). Al deshacerse sube.
  franPose(P) {
    const k = this.franRaise || 0;
    P.rootY = (1 - this.franFade) * 0.5;
    P.rootPitch = 0;
    P.rootRoll = 0;
    P.torsoY = 0;
    P.torsoR = 0;
    P.headY = 0;
    P.headR = 0;
    P.hipY = 0.52;
    P.hipLp = 0.05;
    P.hipRp = -0.05;
    P.hipLr = 0;
    P.hipRr = 0;
    P.knL = 1.55;
    P.knR = 1.6;
    P.torsoP = 0.42 - k * 0.45;
    P.headP = 0.35 - k * 0.75 + Math.sin(this.t * 1.3) * 0.03;
    P.shLp = -0.15 - k * 1.5;
    P.shRp = -0.15 - k * 1.5;
    P.shLr = 0.12;
    P.shRr = -0.12;
    P.elL = -0.25 - k * 0.3;
    P.elR = -0.25 - k * 0.3;
  }

  updateFran(dt) {
    const t = this.t;
    this.franRaise = (this.franRaise || 0) + ((this.pose === 'raise' ? 1 : 0) - (this.franRaise || 0)) * Math.min(1, dt * 2.5);
    // vencido, con el cuerpo de la pelea: las grietas de oro laten
    const z = this.franZ;
    if (z) {
      this.franPose(z.P);
      const glow = 0.06 + Math.max(0, Math.sin(t * 2.4)) * 0.16;
      for (const m of this.franMats()) if (m.emissive) {
        m.emissive.set(0xffa020);
        m.emissiveIntensity = glow;
      }
    }
    // el Francisco dorado: brilla fuerte al volver y después late suave; al
    // deshacerse se vuelve luz, se hace transparente y sube en chispas
    const r = this.goldR;
    if (!r || r.dead) return;
    this.goldK = Math.max(0, this.goldK - dt / 1.6);
    const fade = this.franFade;
    const glow = this.dissolving ? 0.7 + (1 - fade) * 1.5 : 0.22 + Math.max(0, Math.sin(t * 2.4)) * 0.12 + this.goldK * 1.4;
    for (const m of Object.values(this.goldM)) {
      if (m.emissive) m.emissiveIntensity = glow;
      m.opacity = fade;
    }
    this.goldGlow.material.opacity = (0.28 + Math.sin(t * 2.1) * 0.05 + this.goldK * 0.5) * fade;
    this.goldGlow.position.y = 0.95 + (1 - fade) * 0.5;
    if (this.dissolving) {
      this.franFade = Math.max(0, fade - dt / 3.2);
      const p = this.fran.pos;
      for (let i = 0; i < 4; i++) {
        const h = Math.random() * 3 * this.franFade + (1 - this.franFade) * 2.5;
        const ang = t * 3 + Math.random() * 6;
        this.g.fx.sparkle(tmpV.set(p.x + Math.cos(ang) * 0.6, h, p.z + Math.sin(ang) * 0.6), [1, 0.85, 0.4], 1, 0.15);
      }
      if (this.franFade <= 0) {
        r.dead = true;
        this.goldGlow.visible = false;
        this.dissolving = false;
        this.g.fx.flash(tmpV.set(p.x, 1.2, p.z), 0xffc050, 90, 0.6, 16);
      }
    }
  }

  updateFierro(dt) {
    if (!this.fierroOn) return;
    const f = this.fierro;
    const t = this.t;
    this.fierroLight.intensity = 3;
    this.fierroLight.position.set(f.pos.x, f.pos.y + 2.7, f.pos.z + 0.6);
    if (Math.random() < 0.12) this.g.fx.sparkle(tmpW.set(f.pos.x, f.pos.y + 0.6 + Math.random() * 1.2, f.pos.z), [0.6, 0.8, 1], 1, 0.6);
    const up = this.pose === 'portal' ? 1 : 0;
    this.fierroUp = (this.fierroUp || 0) + (up - (this.fierroUp || 0)) * Math.min(1, dt * 3);
    const k = this.fierroUp;
    if (k > 0.01) {
      this.repose(FIERRO, (P) => {
        P.shRp = -0.55 - k * 2.3;
        P.shRr = -0.1 - k * 0.2;
        P.elR = -1.25 + k * 1.1;
        P.headP -= k * 0.3;
      });
    }
    // el remolino azul
    if (this.portalT != null) {
      this.portalT += dt;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = t * 4 + (i / n) * Math.PI * 2;
        const r = 3.6 - Math.min(2.2, this.portalT * 0.7);
        this.g.fx.sparkle(tmpV.set(this.A.x + Math.cos(a) * r, 0.2 + ((t * 2 + i * 0.37) % 2.8), this.A.z + 1 + Math.sin(a) * r), [0.6, 0.8, 1], 1, 0.12);
      }
    }
  }

  updateMate(dt) {
    const m = this.mate;
    const t = this.t;
    m.rotation.y += dt * 1.4;
    if (this.mateGoal) {
      this.mateT = Math.min(1, this.mateT + dt / this.mateDur);
      const s = smooth(this.mateT);
      m.position.lerpVectors(this.mateFrom, this.mateGoal, s);
      m.position.y += Math.sin(s * Math.PI) * 0.35;
      if (this.mateT >= 1) {
        this.mateFrom.copy(this.mateGoal);
        m.position.y += Math.sin(t * 2) * 0.04;
      }
    }
    this.mateGlow.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
    this.mateLight.position.copy(m.position).setY(m.position.y + 0.3);
    if (Math.random() < 0.3) this.g.fx.sparkle(m.position, [1, 0.85, 0.4], 1, 0.2);
  }

  updateRocks(dt) {
    const g = this.g;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.v += 22 * dt;
      r.m.position.y -= r.v * dt;
      if (r.m.position.y < 0.4) {
        g.fx.dust(tmpV.set(r.m.position.x, 0.1, r.m.position.z), { x: 0, y: 1, z: 0 }, [0.4, 0.28, 0.22], 14);
        g.fx.explosion(tmpV.set(r.m.position.x, 0.3, r.m.position.z), 0.9, [1, 0.5, 0.2]);
        g.audio.explosion(r.m.position, 0.4);
        this.shake = Math.max(this.shake, 0.35);
        r.m.removeFromParent();
        this.rocks.splice(i, 1);
      }
    }
  }

  // Lo de la cima: el remolino se apaga de a poco, la tormenta se abre y amanece.
  updateTop(dt) {
    const g = this.g;
    const T = g.world.tower;
    this.calm = Math.min(1, (this.calm || 0) + dt / 14);
    const k = smooth(this.calm);
    if (T) {
      for (const m of T.vortex || []) {
        const U = m.material.uniforms;
        U.uAlpha.value *= Math.max(0, 1 - dt * 0.35);
        U.uSpeed.value *= Math.max(0, 1 - dt * 0.3);
      }
      if (T.debris) T.debris.visible = k < 0.7;
      if (T.storm) T.storm.scale.setScalar(Math.max(0.001, 1 - k * 0.97));
      if (T.eye) T.eye.visible = false;
    }
    // la niebla del remolino se levanta: se ve el llano (y mucho más mientras
    // dura la toma del Chiquitijuein)
    this.fogD = this.chiqui && this.chiqui.t < CHIQ.end ? 0.005 : 0.034 + (0.011 - 0.034) * k;
    this.updateChiqui(dt);
  }

  update(dt) {
    const g = this.g;
    if (!this.script) return;
    this.t += dt;
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
    // el guion: cada paso arranca cuando termina el anterior (más su espera)
    while (this.script && this.step < this.script.length && t >= this.next + this.script[this.step][0]) {
      const [wait, fn] = this.script[this.step];
      const start = this.next + wait;
      this.step++;
      const dur = fn() || 0;
      this.next = Math.max(start, t) + dur;
    }
    if (!this.script) return;
    // abajo, la tormenta se oye y se ve: cada vez más rayos
    if (!this.atTop) {
      if (Math.random() < dt * (this.shake > 0.2 ? 1.6 : 0.35)) this.bolt();
      g.arena?.ambient?.(dt);
    } else this.updateTop(dt);
    this.people.update(dt);
    this.updateFran(dt);
    // el cuerpo del jefe se arma con los muertos
    if (this.franZ) g.zombies.render();
    this.updateFierro(dt);
    this.updateMate(dt);
    this.updateRocks(dt);
    // los gauchos miran al que habla (o al mate)
    const look = this.fierroOn ? this.fierro.pos : this.fran.pos;
    for (const r of this.gauchos) r.yaw = faceTo(r.pos, look.x, look.z);
    // la cámara de la toma, con el temblor encima
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      this.shake = Math.max(0, this.shake - dt * 0.35);
      const s = this.shake * 0.06;
      cam.position.set(tmpV.x + (Math.random() - 0.5) * s, tmpV.y + (Math.random() - 0.5) * s, tmpV.z + (Math.random() - 0.5) * s);
      cam.lookAt(tmpW);
    }
    // el oído va con la cámara (si no, todo se oye desde donde terminó la pelea)
    g.audio.setListener(cam.position, tmpU.set(0, 0, -1).applyQuaternion(cam.quaternion));
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
    g.weather?.update?.(dt);
    // (el clima pisa la niebla: en la cima se la vuelve a levantar)
    if (this.atTop && g.scene.fog && this.fogD) g.scene.fog.density = this.fogD;
  }

  // Un rayo de la tormenta (se ve y se oye adentro de la caverna).
  bolt() {
    const g = this.g;
    const a = Math.random() * Math.PI * 2;
    const d = 2 + Math.random() * 9;
    const p = new THREE.Vector3(this.A.x + Math.cos(a) * d, 0, this.A.z + Math.sin(a) * d);
    g.fx.lightning(p.clone().setY(13), p.clone().setY(0.1), 0xe8e0ff, 0.4);
    g.post?.flash(0.3);
    if (g.weather) g.weather.flash = 1;
    g.audio.thunder?.(p);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.script = null;
    window.removeEventListener('keydown', this.onKey);
    // se cortan sus voces (también los murmullos) y vuelven a hablar los demás
    this.g.audio.hush();
    this.g.audio.setCine(false);
    // (vuelve el sonido que se cortó en el negro del final)
    if (this.master0 != null) {
      const au = this.g.audio;
      au.master.gain.cancelScheduledValues(au.ctx.currentTime);
      au.master.gain.value = this.master0;
      this.master0 = null;
    }
    this.el.remove();
    const g = this.g;
    if (this.fov0) this.setFov(this.fov0);
    this.dropFran();
    this.people?.dispose();
    this.root?.removeFromParent();
    this.root = null;
    if (this.mateLight) this.mateLight.intensity = 0;
    if (this.fierroLight) this.fierroLight.intensity = 0;
    if (g.world.tower?.llano) g.world.tower.llano.caveOff = false;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
