import * as THREE from 'three';
import { EE } from '../config/map';
import Avatars from '../net/Avatars';
import { buildVoz, updateVoz } from './voz';
import { warmScene } from './cineWarm';
import { crewIds } from './cineCrew';
import { scarecrowProp, scarecrowPose, scarecrowFallEnd } from '../entities/skins/scarecrow';
import { preloadBossSkin } from '../entities/bossSkin';
import { prefetchTrack } from '../core/music';

// Final de La Tapera, adentro del juego, en el Prado. El Espantapájaros queda
// de rodillas, levanta la cabeza al cielo y dice lo que nadie entiende todavía:
// que en cien años no cuidaba el maíz de los cuervos... sino de ella. Se
// prende fuego, le salen los cuervos del pecho y se desarma en una pila de
// paja que arde. Los segadores (vos y los compañeros, con la Hoz de la Muerte)
// miran para arriba: baja la Voz de Arriba (la misma del penal y la torre),
// el paquete de yerba sube por su luz y ella agradece. En un primer plano se
// le escapa, un instante, el ojo colorado. Se va; un último cuervo se posa en
// el ombú y la cámara sube hasta ver toda la chacra. Se puede saltear con
// Esc, Espacio o clic. (Reemplaza al de antes, una sola toma; 2026-09-28.)

const ME = 450;
const WHO = { espantapajaros: 'El Espantapájaros', entidad: 'La Voz de Arriba' };
// cuánto tarda el paquete en subir hasta la Voz
const PACK_UP = 4.2;
// la Voz: de dónde baja y dónde se queda (sobre la piedra)
const VOZ_TOP = 48;
const VOZ_Y = 10.5;
// los cuervos que le salen del pecho (los del Prado y copias)
const CROWS = 16;
// el Espantapájaros: de rodillas vencido, mirando al cielo, en cruz mientras
// arde y cayéndose para adelante (después se hunde en la paja)
const POSE = {
  kneel: { hipY: 0.5, torsoP: 0.55, torsoR: 0.05, headP: 0.6, shLp: -0.15, shRp: -0.2, shLr: 0.55, shRr: -0.55, elL: -0.2, elR: -0.25 },
  look: { hipY: 0.55, torsoP: 0.12, torsoR: 0, headP: -0.75, shLp: -0.2, shRp: -0.2, shLr: 0.9, shRr: -0.9, elL: -0.1, elR: -0.1 },
  cross: { hipY: 0.56, torsoP: -0.18, torsoR: 0, headP: -0.95, shLp: -0.1, shRp: -0.1, shLr: 1.4, shRr: -1.4, elL: -0.05, elR: -0.05 },
  fall: { hipY: 0.45, torsoP: 1.2, torsoR: 0.14, headP: 0.75, shLp: 0.15, shRp: 0.1, shLr: 0.35, shRr: -0.35, elL: -0.2, elR: -0.2 },
};
// las partes del cuerpo por donde se prende (cadera, torso, cabeza, brazos, manos)
const FIRE_PARTS = [1, 2, 0, 3, 4, 5, 6];
// la pila de paja donde se hunde: un poco más grande (tapa al gigante tirado)
const PILE_K = 1.35;
// la caída de boca (skins/scarecrow.js, 1,05 s y el rebote) y, ya tirado, se
// hunde: cuándo empieza y cuánto tarda (s desde que se cae); la pila crece
// desde que pega en el piso
const SINK_AT = 1.5;
const SINK_DUR = 2.2;
const PILE_AT = 0.95;
// "...su camino todavía sigue": el final de la canción de la entrada (la que
// usa la intro de La Tapera, intro-granja.mp3, 26,9 s): desde la última frase
// (a 103 bpm, 8 tiempos) hasta el golpe del final, que cae con la placa
// (pedido del usuario 2026-10-01)
const SONG_AT = 16.3;
const EMBER = new THREE.Color(0xff5a10);
const CHAR = new THREE.Color(0x1a120c);

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpC = new THREE.Color();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const lerp = (a, b, u) => a + (b - a) * u;
const faceTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));

export default class FarmCinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    // (a la vista desde el primer cuadro: arranca en negro)
    this.el.className = 'mdu-fcine mdu-fcine--granja is-on';
    this.el.innerHTML =
      '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><i class="mdu-fcine__black"></i><p class="mdu-fcine__text"><b class="mdu-fcine__who"></b><span></span></p><h1 class="mdu-fcine__title">El camino sigue</h1><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.whoEl = this.el.querySelector('.mdu-fcine__who');
    this.span = this.el.querySelector('.mdu-fcine__text span');
    this.blackEl = this.el.querySelector('.mdu-fcine__black');
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
    this.shake = 0;
    this.fogMul = 1;
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    this.black(1, 0);
    const [ax, az] = EE.altar.pos;
    const Ar = EE.arena;
    // la piedra, el Espantapájaros (entre la piedra y el ombú) y la fila de los segadores
    this.A = new THREE.Vector3(ax, 0.88, az);
    this.S = new THREE.Vector3(Ar.x, 0, Ar.z - 4.4);
    this.yaw0 = Math.atan2(this.A.x - this.S.x, this.A.z - this.S.z);
    // el Espantapájaros sigue donde cayó en la pelea, de rodillas como quedó: el
    // final arranca ahí, sin saltar de lugar (las primeras décimas, en negro, el
    // títere se acomoda a la cadera y al frente del muerto: updateScarecrow)
    const dead = g.zombies.boss?.kind === 'scarecrow' ? g.zombies.boss : null;
    this.deadPose = dead ? scarecrowPose() : null;
    if (dead) {
      this.S.set(dead.pos.x, 0, dead.pos.z);
      // (hacia donde mira el cuerpo caído: la muerte lo gira)
      this.yaw0 = this.deadPose?.yaw ?? dead.yaw;
    }
    this.rig = this.pickRig();
    this.PZ = az + 5.5;
    // el ombú podrido del Prado (world/Prado.js decor: a 5,31 rad, pasando el
    // maizal) y el hueco de donde salió el Espantapájaros, que mira al claro:
    // ahí vuelve el último cuervo
    const oa = 5.31;
    const tx = Ar.x + Math.cos(oa) * (Ar.r + 3.6);
    const tz = Ar.z + Math.sin(oa) * (Ar.r + 3.6);
    const toC = Math.atan2(Ar.z - tz, Ar.x - tx);
    this.toC = new THREE.Vector3(Math.cos(toC), 0, Math.sin(toC));
    this.O = new THREE.Vector3(tx + Math.cos(toC) * 1.2, 3.7, tz + Math.sin(toC) * 1.2);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.fov0 = g.camera.fov;
    g.hud.setBossBar(null);
    g.weapons.vmRoot.visible = false;
    g.menus?.showClick?.(false);
    // los compañeros de la red y lo que quedaba tirado no se ven (están en la escena)
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    for (const it of g.powerups?.items || []) it.mesh.visible = false;
    this.boxBeams = [g.interact?.box, ...(g.interact?.saleBoxes || [])].map((b) => b?.beam).filter((b) => b?.visible);
    for (const b of this.boxBeams) b.visible = false;
    // (ni la luz que guía los pasos del easter egg: quedaba parada sobre la
    // piedra; se esconde en cada cuadro, update)
    this.buildScarecrow();
    this.buildCrows();
    this.people = new Avatars(g, null);
    // (los segadores aparecen con su toma: si el Espantapájaros cayó cerca de
    // la fila, antes le tapaban las primeras tomas)
    this.people.root.visible = false;
    this.buildReapers();
    // el paquete que sube (una copia del que quedó en la piedra)
    const src = g.ee?.altarPack;
    this.pack = src ? src.clone() : new THREE.Group();
    this.pack.position.copy(this.A);
    this.pack.visible = true;
    if (src) src.visible = false;
    this.root.add(this.pack);
    // la pila de paja donde se desarma (crece mientras se hunde)
    const M = g.world.M;
    this.pile = new THREE.Group();
    this.pile.add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.1, 12).translate(0, 0.55, 0), M.hay));
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 7).translate(0, 0.35, 0), M.hay);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
      s.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      this.pile.add(s);
    }
    this.pile.position.copy(this.S);
    this.pile.scale.setScalar(0.001);
    this.root.add(this.pile);
    // la Voz de Arriba (ui/voz.js), con su columna de luz
    this.voz = buildVoz(g.textures, { beam: 40 });
    this.voz.root.position.set(ax, VOZ_TOP, az);
    this.voz.root.visible = false;
    this.root.add(this.voz.root);
    // (los colores de los anillos: se encienden dorados un momento cuando llega la yerba)
    this.ringBase = this.voz.rings.map((r) => r.userData.base.clone());
    // las luces del Prado ya existen (sumar una en medio de la escena recompila
    // todo): la de la Voz y una de las dos de la pelea para el fuego
    const P = g.arena;
    this.lights0 = [P?.cineLight, ...(P?.lights || [])].filter(Boolean).map((l) => ({ l, i: l.intensity, c: l.color.getHex(), p: l.position.clone() }));
    this.voiceLight = P?.cineLight || null;
    if (this.voiceLight) this.voiceLight.intensity = 0;
    this.fireLight = P?.lights?.[0] || null;
    if (this.fireLight) {
      this.fireLight.color.set(0xff6a1a);
      this.fireLight.intensity = 6;
      this.rigPt(this.fireLight.position, 0, 2.4, 1.6);
    }
    if (P?.lights?.[1]) P.lights[1].intensity = 10;
    // el viento del prado y el crepitar del fuego (salidas propias)
    const A = g.audio;
    this.windOut = A.out({ gain: 0.7, reverb: 0.4 });
    A.noise(this.windOut, { t: A.now, dur: 70, type: 'bandpass', freq: 360, q: 0.6, gain: 0.12, attack: 2.5, brown: true });
    this.fireOut = A.out({ pos: this.S.clone().setY(1.5), gain: 0.9, reverb: 0.3, ref: 5 });
    this.look = 'fire';
    g.audio.setCine(true);
    this.script = this.buildScript();
    prefetchTrack('intro-granja');
    // todo lo que va a aparecer se compila ya, en segundo plano
    warmScene(g);
  }

  // ---------------- los que actúan ----------------
  // El Espantapájaros: el jefe de verdad se va y queda un títere igual,
  // de rodillas donde lo vencieron.
  buildScarecrow() {
    const g = this.g;
    const Z = g.zombies;
    // (el cuerpo de verdad, si la escena llega sin la pelea: que baje ya)
    preloadBossSkin(Z, 'scarecrow');
    if (Z.boss) Z.removeBoss();
    const z = Z.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.kind = 'scarecrow';
    z.scale = 2.7;
    z.hatHp = 1;
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.phase = 0;
    z.slot = 0;
    z.pos.copy(this.S);
    z.baseY = 0;
    z.yaw = this.yaw0;
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('scarecrow');
    const R = Z.bossRig;
    R.rig.visible = true;
    this.sc = z;
    this.scPose = 'kneel';
    this.scK = { ...POSE.kneel };
    this.burn = 0;
    // el cuervo que tiene en el hombro (sale volando primero) y la horquilla
    this.rigCrow = R.parts[1].children.find((o) => o.visible && Math.abs(o.position.x + 0.22) < 0.01 && Math.abs(o.position.y - 0.33) < 0.01) || null;
    this.rigFork = R.parts[17].children.find((o) => o.visible) || null;
  }

  // Los cuervos: los del Prado (los que lo cubrían en la pelea) y copias
  // (mismas mallas: no se compila nada).
  buildCrows() {
    const flock = this.g.arena?.flock || [];
    this.crows = [];
    if (!flock.length) return;
    for (let i = 0; i < CROWS; i++) {
      const src = flock[i % flock.length].obj;
      const obj = i < flock.length ? src : src.clone();
      if (obj.parent !== this.root) {
        this.flockBack ||= [];
        if (i < flock.length) this.flockBack.push({ obj, parent: obj.parent });
        this.root.add(obj);
      }
      obj.visible = false;
      obj.scale.setScalar(0.9 + Math.random() * 0.35);
      // (salen para el lado de la piedra y del ombú: la cámara de costado los ve irse)
      this.crows.push({ obj, a: -1.6 + (i / (CROWS - 1)) * 3.2 + (Math.random() - 0.5) * 0.3, w: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5), up: 3 + Math.random() * 2.4, out: 1.4 + Math.random() * 1.2, ph: Math.random() * 6, delay: Math.random() * 0.8 });
    }
    // el último, el que se posa en el ombú: una copia del del hombro (tiene cabeza y pico)
    const src = this.rigCrow;
    if (src) {
      this.last = src.clone();
      // (con el cuerpo de verdad, el de piezas está en una capa que no se dibuja)
      this.last.traverse((o) => o.layers.set(0));
      this.last.scale.setScalar(4);
      this.last.visible = false;
      this.root.add(this.last);
    }
  }

  // Los segadores: vos y los compañeros (siempre cuatro) en fila frente a la piedra, con su hoz.
  buildReapers() {
    const g = this.g;
    const ids = crewIds(g);
    this.reapers = ids.map((id, i) => {
      const s = i - (ids.length - 1) / 2;
      const x = this.A.x + s * 1.3;
      const z = this.PZ + Math.abs(s) * 0.4;
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(x, g.world.floorAt(x, z), z), yaw: 0, pitch: -0.7, speed: 0, moving: false, crouch: false };
      r.yaw = faceTo(r.pos, this.A.x, this.A.z - 2);
      this.people.add(r);
      const a = this.people.list.get(r.id);
      // el color del poncho es el de cada uno en la partida
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      // la Hoz de la Muerte en la mano (el modelo ya armado de la partida; si no está, el mate de siempre)
      // (la de oro si el equipo tiene el bastón del Yasy)
      this.people.setGun(a, 'hoz', 1, this.g.player?.baston ? 'oro' : '');
      // la hoz baja y la cabeza mira lo que pasa (arriba, cuando baja la Voz)
      r.poseFn = (P) => {
        P.shRp = -0.45;
        P.shRr = -0.12;
        P.elR = -0.55;
        P.shLp = -0.2;
        P.shLr = 0.1;
        P.elL = -0.3;
        P.headP = r.headP ?? 0;
      };
      r.headP = 0.1;
      return r;
    });
  }

  // ---------------- el guion ----------------
  // Cada paso: [espera, fn]; fn devuelve cuánto dura.
  buildScript() {
    const g = this.g;
    return [
      [0, () => {
        this.black(0, 1.6);
        this.shotKneel();
        g.audio.caw(tmpV.copy(this.O), 2);
        return 3.6;
      }],
      // el secreto: no cuidaba el maíz de los cuervos
      [0, () => {
        this.scPose = 'look';
        return this.say('espantapajaros', 'Cien años cuidando este maíz...') + 0.2;
      }],
      [1.2, () => this.say('espantapajaros', '...de ella.', { secret: true }) + 0.9],
      // arde: se prende la paja, le salen los cuervos del pecho y se desarma
      [0, () => {
        this.hideText();
        this.ignite();
        this.shotBurn();
        return 2.3;
      }],
      [0, () => {
        this.burst();
        return 2.7;
      }],
      [0, () => {
        this.collapse();
        // (se cae de boca y después se hunde: SINK_AT + SINK_DUR)
        return 4;
      }],
      // los segadores miran la pila... y arriba se abre una luz
      [0, () => {
        this.look = 'pile';
        this.shotReapers();
        return 3.8;
      }],
      [0, () => {
        this.look = 'sky';
        this.skyGlow();
        return 2.6;
      }],
      // baja la Voz
      [0, () => {
        this.voiceIn();
        this.shotVoiceDown();
        return 4.8;
      }],
      [0, () => this.say('entidad', 'Gracias. Hacía cien años que nadie me traía yerba de esta tierra.') + 0.5],
      // la cosecha sube por la luz
      [0, () => {
        this.hideText();
        this.packUp();
        this.shotPack();
        return PACK_UP + 1.4;
      }],
      // la mirada: se le escapa el ojo colorado
      [0, () => {
        this.look = 'voz';
        this.shotEye();
        return 0.8;
      }],
      [0, () => {
        const d = this.say('entidad', 'Con esto alcanza para esta noche. Pero no se confundan...');
        this.later(d + 0.35, () => this.flicker());
        return d + 1.5;
      }],
      // se va; el último cuervo se posa en el ombú
      [0, () => {
        this.hideText();
        this.voiceOut();
        this.crowIn();
        this.shotOmbu();
        return 4.2;
      }],
      // la grúa: toda la chacra de noche
      [0, () => {
        this.look = 'sky';
        this.shotCrane();
        this.say('entidad', '...su camino todavía sigue.');
        g.music?.play('intro-granja', { at: SONG_AT, fadeIn: 0.2, while: (G) => G.state === 'won' && !this.done });
        this.later(4.4, () => {
          this.hideText();
          this.el.classList.add('is-title');
        });
        // (el golpe del final de la canción, a los 9,6 s, con la placa a oscuras)
        this.later(8.4, () => this.el.classList.add('is-fade'));
        return 10.6;
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

  // Habla un personaje: su nombre arriba y el subtítulo que va apareciendo al
  // ritmo de la voz. secret: más bajo y con otro color (lo que no se entiende todavía).
  say(who, text, { secret = false } = {}) {
    const d = this.g.audio.say(text, who, { cine: true });
    this.whoEl.textContent = WHO[who] || '';
    this.span.textContent = '';
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-espanta', who === 'espantapajaros' && !secret);
    this.el.classList.toggle('is-secreto', secret);
    this.sub = { text, t0: this.t, rev: Math.max(0.5, Math.min(d * 0.85, text.length * 0.05)), k: -1 };
    return d;
  }

  hideText() {
    this.textEl.classList.remove('is-on');
    this.el.classList.remove('is-secreto', 'is-espanta');
    this.sub = null;
  }

  // El negro de los cortes (fade: segundos para irse o volver; 0 = de golpe).
  black(v, fade = 0) {
    this.blackEl.style.transition = fade ? `opacity ${fade}s` : 'none';
    this.blackEl.style.opacity = String(v);
  }

  // Se prende la paja: de a poco, por todas partes.
  ignite() {
    const g = this.g;
    this.burnT = this.t;
    this.scPose = 'cross';
    // (la luz del fuego, frente a él donde quedó)
    if (this.fireLight) this.rigPt(this.fireLight.position, 0, 2.4, 1.6);
    g.audio.explosion(tmpV.copy(this.S).setY(2), 0.35);
    g.fx.flash(tmpV.copy(this.S).setY(2.4), 0xff6a1a, 40, 0.5, 14);
  }

  // Le salen los cuervos del pecho: primero el del hombro, después todos.
  burst() {
    const g = this.g;
    this.burstT = this.t;
    const R = g.zombies.bossRig;
    R.parts[1].getWorldPosition(this.chest = new THREE.Vector3());
    // (el pecho del cuerpo de verdad, si lo tiene: el de piezas queda un poco corrido)
    const SP = scarecrowPose();
    if (SP) this.chest.copy(SP.chest);
    // (el del hombro, primero: solo el de piezas lo tiene; el cuerpo de verdad
    // ya no lleva cuervo en el hombro)
    if (this.rigCrow && !SP) this.rigCrow.getWorldPosition(tmpV);
    else tmpV.copy(this.chest);
    if (this.rigCrow) this.rigCrow.visible = false;
    for (const [i, c] of this.crows.entries()) {
      c.from = i === 0 ? tmpV.clone() : this.chest.clone().add(tmpU.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6));
      c.obj.visible = true;
      c.obj.position.copy(c.from);
    }
    g.audio.bigCaw(this.chest, 3);
    g.audio.caw(this.chest, 5);
    for (let i = 0; i < 4; i++) this.later(i * 0.35, () => g.audio.wingFlap(this.chest, 1.4));
    g.fx.sparkle(this.chest, [1, 0.5, 0.15], 40, 1.4);
    this.shake = Math.max(this.shake, 0.6);
  }

  // Se cae para adelante, suelta la horquilla y se hunde en la paja que arde.
  collapse() {
    const g = this.g;
    this.fallT = this.t;
    this.scPose = 'fall';
    // la pila, donde queda tirado: debajo del pecho cuando termina de caerse de
    // boca (se hunde ahí mismo, no al lado)
    const end = scarecrowFallEnd();
    if (end) this.pile.position.set(end.x, 0, end.z);
    if (this.rigFork) {
      // (la del cuerpo de verdad, si lo tiene: esa es la que se ve)
      const src = scarecrowProp('fork') || this.rigFork;
      src.getWorldPosition(tmpV);
      const f = src.clone();
      f.traverse((o) => o.layers.set(0));
      this.rigFork.visible = false;
      f.scale.setScalar(src === this.rigFork ? 2.7 : src.getWorldScale(tmpU).x);
      // (a su lado, girada con él)
      const yaw = this.sc?.yaw ?? this.yaw0;
      this.rigPt(f.position, 1.8, 0.08, 0.9, yaw, 1);
      f.rotation.set(Math.PI / 2, 0, 0.6);
      f.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      this.root.add(f);
    }
    g.audio.explosion(tmpV.copy(this.S).setY(1), 0.25);
  }

  // Arriba se abre una luz entre las nubes.
  skyGlow() {
    const g = this.g;
    this.voz.root.visible = true;
    this.voz.root.position.set(this.A.x, VOZ_TOP, this.A.z);
    this.voiceT = null;
    g.audio.whoosh?.(tmpV.set(this.A.x, 30, this.A.z));
    if (g.weather) g.weather.flash = 0.5;
  }

  // Baja la Voz: un coro, campanas y la columna de luz sobre la piedra.
  voiceIn() {
    const g = this.g;
    const A = g.audio;
    this.voiceT = this.t;
    this.voz.beamOn = true;
    try {
      const t = A.now;
      const o = A.out({ gain: 0.7, reverb: 1, bus: A.music });
      A.choir(o, t, [57, 64, 69, 72], { dur: 6, gain: 0.035, attack: 1.8, release: 2.5 });
      A.bell(o, t + 0.4, 69, { gain: 0.1, dur: 6 });
      A.bell(o, t + 2.6, 76, { gain: 0.07, dur: 6 });
    } catch {
      /* sin música */
    }
  }

  packUp() {
    this.packT = this.t;
    this.g.audio.whoosh?.(this.A);
  }

  // Un instante, el ojo colorado (como en el penal y la torre).
  flicker() {
    const g = this.g;
    this.evilT = this.t;
    const A = g.audio;
    try {
      const o = A.out({ gain: 0.6, reverb: 0.8, bus: A.music });
      A.tone(o, { t: A.now, dur: 0.5, type: 'triangle', freq: 1480, freqEnd: 1395, gain: 0.03, attack: 0.01 });
      A.tone(o, { t: A.now, dur: 0.5, type: 'triangle', freq: 1047, freqEnd: 988, gain: 0.03, attack: 0.01 });
    } catch {
      /* */
    }
  }

  // Se va para arriba (y la columna se apaga).
  voiceOut() {
    this.outT = this.t;
    this.voz.beamOn = false;
    this.g.audio.whoosh?.(this.voz.root.position);
  }

  // El último cuervo baja al ombú.
  crowIn() {
    if (!this.last) return;
    this.lastT = this.t;
    this.last.visible = true;
    this.g.audio.caw(tmpV.copy(this.O), 1);
  }

  // ---------------- las tomas ----------------
  // tmpV: dónde está la cámara; tmpW: adónde mira.
  shot(dur, fn, fov = this.fov0) {
    this.cam = { t0: this.t, dur, fn };
    this.setFov(fov);
  }

  // Un punto alrededor del Espantapájaros con las tomas giradas (x, z pensados
  // con él mirando a la piedra, +z, como cuando el final lo ponía siempre ahí).
  rigPt(out, x, y, z, rot = this.rig, k = this.rigK ?? 1) {
    const c = Math.cos(rot) * k;
    const s = Math.sin(rot) * k;
    return out.set(this.S.x + x * c + z * s, y, this.S.z - x * s + z * c);
  }

  // Las tomas que lo miran giran con él (cae donde cae en la pelea): el giro
  // que deja las cámaras en el claro (el maizal arranca unos 3 m antes del borde
  // de la pelea), sin un fardo adelante; si no hay, el de al lado; y si cayó
  // contra el maizal, las cámaras un poco más cerca.
  pickRig() {
    const g = this.g;
    const Ar = EE.arena;
    const S = this.S;
    // (los fardos; los segadores todavía no están)
    const cols = g.arena?.cols || [];
    // [x, y, z de la cámara, alto adonde mira]: el principio y el final de las dos tomas
    const cams = [[3.2, 0.85, 6.4, 2.6], [2, 1.05, 4.8, 3.5], [-6.2, 2.1, 5.4, 2.2], [-6.7, 3.9, 6, 2.2]];
    const ok = (rot, k) =>
      cams.every(([x, y, z, ty]) => {
        const c = this.rigPt(tmpV, x, y, z, rot, k);
        if (Math.hypot(c.x - Ar.x, c.z - Ar.z) > Ar.r - 3) return false;
        for (const o of cols) {
          for (let u = 0; u <= 1.001; u += 0.1) {
            const py = c.y + (ty - c.y) * u;
            if (py < (o.h ?? 1.5) + 0.2 && Math.hypot(c.x + (S.x - c.x) * u - o.x, c.z + (S.z - c.z) * u - o.z) < o.r + 0.3) return false;
          }
        }
        return g.world.clear(c, tmpW.set(S.x, ty, S.z));
      });
    for (const k of [1, 0.75, 0.55]) {
      for (const d of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
        if (!ok(this.yaw0 + d, k)) continue;
        this.rigK = k;
        return this.yaw0 + d;
      }
    }
    this.rigK = 1;
    return this.yaw0;
  }

  // Abajo, acercándose de costado: el gigante de rodillas con las fogatas atrás.
  shotKneel() {
    const S = this.S;
    this.shot(8.5, (u) => {
      const e = smooth(u);
      this.rigPt(tmpV, 3.2 - e * 1.2, 0.85 + e * 0.2, 6.4 - e * 1.6);
      // (con las cámaras más cerca, contra el maizal, mira más abajo: si no queda cortado)
      tmpW.set(S.x, (2.6 + e * 0.9) * (0.45 + 0.55 * (this.rigK ?? 1)), S.z);
    }, 48);
  }

  // De costado: arde y la cámara sube con los cuervos.
  shotBurn() {
    const S = this.S;
    this.shot(9.2, (u) => {
      const e = smooth(u);
      this.rigPt(tmpV, -6.2 - e * 0.5, 2.1 + e * 1.8, 5.4 + e * 0.6);
      const b = this.burstT != null ? this.t - this.burstT : -1;
      const up = b < 0 ? 0 : smooth(clamp01(b / 1.6)) * (1 - smooth(clamp01((b - 1.9) / 1.2)));
      tmpW.set(S.x, 2.2 + up * 8, S.z);
    }, 52);
  }

  // Detrás de los segadores: la pila que arde y el paquete en la piedra.
  shotReapers() {
    const A = this.A;
    this.people.root.visible = true;
    // (por encima de los sombreros y más atrás: son cuatro y el de la punta
    // quedaba pegado a la cámara, tapando la pila)
    this.shot(6.6, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 1.6 - e * 0.3, 2.3 - e * 0.1, this.PZ + 3.4 - e * 0.4);
      const up = this.look === 'sky' ? smooth(clamp01((this.t - this.cam.t0 - 3.8) / 2)) : 0;
      // (entre la piedra y la pila, donde haya caído)
      const P = this.pile.position;
      tmpW.set(A.x + (P.x - A.x) * 0.37 - 0.6, 1.2 + up * 5, A.z + (P.z - A.z) * 0.37 - up * 1);
    }, 50);
  }

  // Desde el piso junto a la piedra mirando para arriba; después se abre.
  shotVoiceDown() {
    const A = this.A;
    const E = this.voz.root.position;
    this.shot(10.5, (u) => {
      const k = smooth(clamp01((u - 0.45) / 0.55));
      tmpV.set(A.x + lerp(1.7, 3, k), lerp(0.45, 1.7, k), A.z + lerp(2.3, 7.4, k));
      tmpW.set(E.x, lerp(E.y, E.y * 0.55, k), E.z);
    }, 58);
  }

  // Siguiendo el paquete que sube por la luz.
  shotPack() {
    const A = this.A;
    const E = this.voz.root.position;
    this.shot(PACK_UP + 1.6, (u) => {
      const p = this.pack.position;
      // (la cámara no sube hasta el ojo: de cerca se quema de blanco)
      tmpV.set(A.x + 2.6, Math.min(4.6, Math.max(1.3, p.y * 0.8 + 0.4)), A.z + 3.4);
      tmpW.copy(p).lerp(E, smooth(clamp01((u - 0.7) / 0.3)));
    }, 46);
  }

  // Primer plano del ojo.
  shotEye() {
    const A = this.A;
    const E = this.voz.root.position;
    this.shot(8, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 2.6 - e * 0.6, VOZ_Y - 5 + e * 0.4, A.z + 12.5 - e * 2);
      tmpW.copy(E);
    }, 36);
  }

  // Desde el claro, el hueco del ombú de donde salió el Espantapájaros: el
  // último cuervo se posa en el borde, mira a cámara y se mete adentro.
  shotOmbu() {
    const O = this.O;
    const d = this.toC;
    this.shot(4.6, (u) => {
      const e = smooth(u);
      const k = 3.9 - e * 0.7;
      tmpV.set(O.x + d.x * k + d.z * 0.7, O.y + 0.55, O.z + d.z * k - d.x * 0.7);
      tmpW.set(O.x, O.y - 0.45, O.z);
    }, 42);
  }

  // Sube desde los segadores hasta ver la chacra entera, de noche.
  shotCrane() {
    const A = this.A;
    this.shot(9.6, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 1 + e * 11, 2 + e * 40, this.PZ + 2.2 + e * 16);
      tmpW.set(A.x, 2.2, A.z - 1).lerp(tmpU.set(40, 0, 38), smooth(clamp01(u * 1.2)));
      this.fogMul = 1 - smooth(clamp01(u * 1.8)) * 0.85;
    }, 54);
  }

  setFov(f) {
    const cam = this.g.camera;
    if (!f || Math.abs(cam.fov - f) < 0.01) return;
    cam.fov = f;
    cam.updateProjectionMatrix();
  }

  // ---------------- cuadro a cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!this.script) return;
    // el reloj de la escena es el de verdad, no el dt con tope de Game.loop: en
    // línea, la compu que se traba no se atrasa de los demás ni de la canción.
    // Solo, un salto de más de 3 s es una pausa; en línea no hay pausa y una
    // trabada de hasta 30 s cuenta. Llamadas seguidas, sin cuadro en el medio:
    // una prueba que la adelanta.
    const now = performance.now();
    const w = (now - (this.wallAt || 0)) / 1000;
    this.wallAt = now;
    this.t += w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    g.time += dt;
    g.weapons.vmRoot.visible = false;
    if (g.ee?.beam) g.ee.beam.visible = false;
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
    this.updateScarecrow(dt);
    this.updateFire(dt);
    this.updateCrows(dt);
    this.updateReapers();
    this.updateVoz(dt);
    for (const p of g.arena?.braziers || []) if (Math.random() < 0.25) g.fx.fire(p, 0.08, 1);
    this.people.update(dt);
    // la cámara de la toma, con el temblor encima (nunca abajo del piso)
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      const fy = g.world.floorAt(tmpV.x, tmpV.z);
      if (Number.isFinite(fy)) tmpV.y = Math.max(tmpV.y, fy + 0.35);
      this.shake = Math.max(0, this.shake - dt * 0.8);
      const s = this.shake * 0.08;
      cam.position.set(tmpV.x + (Math.random() - 0.5) * s, tmpV.y + (Math.random() - 0.5) * s, tmpV.z + (Math.random() - 0.5) * s);
      cam.lookAt(tmpW);
    }
    // el subtítulo, letra por letra
    const sub = this.sub;
    if (sub) {
      const k = Math.min(sub.text.length, Math.floor(((t - sub.t0) / sub.rev) * sub.text.length));
      if (k !== sub.k) {
        sub.k = k;
        this.span.textContent = sub.text.slice(0, k);
      }
    }
    // el oído va con la cámara
    g.audio.setListener(cam.position, tmpU.set(0, 0, -1).applyQuaternion(cam.quaternion));
    g.zombies.render();
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
    g.weather?.update?.(dt);
    // (la toma de arriba: menos niebla, para que se vea la chacra)
    if (this.fogMul < 1 && g.scene.fog?.density) g.scene.fog.density *= this.fogMul;
  }

  // El Espantapájaros: de rodillas, mira al cielo, en cruz mientras arde, se
  // cae para adelante y se hunde en la paja.
  updateScarecrow(dt) {
    const z = this.sc;
    if (!z || this.scGone) return;
    const g = this.g;
    const t = this.t;
    const want = POSE[this.scPose];
    const rate = this.scPose === 'fall' ? 2.6 : this.scPose === 'cross' ? 3.5 : 1.6;
    const K = this.scK;
    for (const key of Object.keys(want)) K[key] += (want[key] - K[key]) * Math.min(1, dt * rate);
    const P = z.P;
    Object.assign(P, K);
    P.rootY = 0;
    P.rootPitch = 0;
    P.rootRoll = 0;
    P.torsoY = 0;
    P.headY = 0;
    P.headR = 0;
    P.hipLp = 0.05;
    P.hipRp = -0.05;
    P.hipLr = 0;
    P.hipRr = 0;
    P.knL = 1.55;
    P.knR = 1.6;
    // respira vencido (y tiembla mientras arde)
    P.torsoP += Math.sin(t * 1.9) * 0.025;
    if (this.burnT != null) for (const k of ['torsoP', 'headP', 'shLr', 'shRr']) P[k] += (Math.random() - 0.5) * 0.05 * this.burn;
    // las primeras décimas (en negro): el títere justo donde y como quedó el
    // muerto de la pelea (girar sobre su lugar corre la cadera: se corrige al
    // cuadro siguiente)
    if (this.deadPose && t < 0.4) {
      const now = scarecrowPose();
      if (now?.who === z) {
        const d = this.deadPose.yaw - now.yaw;
        z.yaw += Math.atan2(Math.sin(d), Math.cos(d));
        z.pos.x += this.deadPose.hips.x - now.hips.x;
        z.pos.z += this.deadPose.hips.z - now.hips.z;
        this.S.set(z.pos.x, 0, z.pos.z);
        if (this.fallT == null) this.pile.position.copy(this.S);
      }
    }
    if (this.fallT != null) {
      const k = clamp01((t - this.fallT - SINK_AT) / SINK_DUR);
      P.rootY = -Math.pow(k, 1.4) * 3.2;
      this.pile.scale.setScalar(Math.max(0.001, smooth(clamp01((t - this.fallT - PILE_AT) / 1.8))) * PILE_K);
      if (k >= 1) {
        this.scGone = true;
        g.zombies.bossRig.rig.visible = false;
      }
    }
  }

  // La paja que arde: sube de a poco, se pone al rojo y después se carboniza.
  updateFire(dt) {
    if (this.burnT == null) return;
    const g = this.g;
    const t = this.t;
    const Z = g.zombies;
    this.burn = Math.min(1, (t - this.burnT) / 1.6);
    const char = this.fallT != null ? clamp01((t - this.fallT) / 3) : 0;
    const BM = Z.bossMats;
    for (const m of BM ? [BM.skin, BM.cloth, BM.poncho] : []) {
      if (m.emissive) {
        m.emissive.copy(EMBER);
        m.emissiveIntensity = this.burn * (0.9 + Math.random() * 0.5) * (1 - char * 0.6);
      }
      if (char > 0) m.color.lerp(CHAR, char * 0.05);
    }
    // el fuego sale de todo el cuerpo (el de verdad, si lo tiene: el de piezas
    // no se cae con él) y después, de la pila
    const R = Z.bossRig;
    if (!this.scGone) {
      const SP = scarecrowPose();
      const pts = SP?.pts || FIRE_PARTS.map((i) => R.parts[i].getWorldPosition(new THREE.Vector3()));
      for (const p of pts) {
        if (Math.random() > dt * 22 * this.burn) continue;
        g.fx.fire(p, 0.35, 2);
      }
      if (Math.random() < dt * 8 * this.burn) {
        if (SP) tmpV.copy(SP.chest);
        else R.parts[1].getWorldPosition(tmpV);
        g.fx.steam(tmpV.setY(tmpV.y + 1.2), 2, 0.8);
      }
    }
    const pk = this.pile.scale.x / PILE_K;
    const PP = this.pile.position;
    if (pk > 0.1) {
      const fade = this.voiceT != null ? 0.45 : 1;
      if (Math.random() < dt * 48 * pk * fade) g.fx.fire(tmpV.copy(PP).add(tmpU.set((Math.random() - 0.5) * 2.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 2.6)), 0.4, 2);
      if (Math.random() < dt * 5 * pk) g.fx.steam(tmpV.copy(PP).setY(1.4), 2, 1);
    }
    if (this.fireLight) {
      this.fireLight.intensity = (this.voiceT != null ? 8 : 18) * Math.max(this.burn, pk) * (0.8 + Math.random() * 0.4);
      // (sobre lo que arde: el cuerpo y después la pila)
      if (this.fallT != null) this.fireLight.position.set(PP.x, 2.4, PP.z);
    }
    // el crepitar: ya caído, se apaga de a poco en unos segundos
    const A = g.audio;
    const hush = this.fallT != null ? 1 - smooth(clamp01((t - this.fallT - 1.5) / 2.5)) : 1;
    if (hush < 0.02) return;
    if (Math.random() < dt * 16 * Math.max(this.burn * (1 - char * 0.5), pk * 0.5)) {
      A.noise(this.fireOut, { t: A.now, dur: 0.02 + Math.random() * 0.05, type: 'bandpass', freq: 1500 + Math.random() * 3000, q: 1.2, gain: (0.25 + Math.random() * 0.3) * hush });
    }
    if (Math.random() < dt * 2 * this.burn * (1 - char)) A.noise(this.fireOut, { t: A.now, dur: 0.5, type: 'lowpass', freq: 500, freqEnd: 180, gain: 0.35 * hush, brown: true, attack: 0.08 });
  }

  // Los cuervos del pecho: en espiral para arriba, cada uno por su lado.
  updateCrows(dt) {
    const t = this.t;
    if (this.burstT != null) {
      const b = t - this.burstT;
      for (const c of this.crows) {
        if (!c.obj.visible) continue;
        const k = Math.max(0, b - c.delay * 0.4);
        const a = c.a + c.w * k;
        const r = 0.3 + k * c.out + k * k * 0.3;
        c.obj.position.set(c.from.x + Math.cos(a) * r, c.from.y + k * c.up + k * k * 0.9, c.from.z + Math.sin(a) * r);
        c.obj.rotation.set(-0.35, -a - Math.sign(c.w) * Math.PI / 2, 0);
        const f = Math.sin(t * 24 + c.ph) * 0.9;
        const w = c.obj.children;
        if (w[1]) w[1].rotation.z = f;
        if (w[2]) w[2].rotation.z = -f;
        if (k > 6) c.obj.visible = false;
      }
    }
    // el último baja al borde del hueco del ombú, mira a la cámara y se mete
    // adentro (de donde salió el Espantapájaros)
    if (this.lastT != null && this.last?.visible) {
      const L = this.last;
      const O = this.O;
      const d = this.toC;
      const lt = t - this.lastT;
      const k = clamp01(lt / 1.3);
      const e = smooth(k);
      // el borde de abajo del hueco, un poco para afuera
      tmpV.set(O.x + d.x * 0.35, O.y - 0.82, O.z + d.z * 0.35);
      L.position.set(tmpV.x + d.x * 3 * (1 - e) - d.z * 2 * (1 - e), tmpV.y + 3.2 * (1 - e) * (1 - e), tmpV.z + d.z * 3 * (1 - e) + d.x * 2 * (1 - e));
      const cam = this.g.camera.position;
      const toCam = Math.atan2(cam.x - L.position.x, cam.z - L.position.z);
      L.rotation.set(0, k < 1 ? toCam - 1.2 * (1 - e) : toCam + Math.sin(t * 1.3) * 0.12, 0);
      // se da vuelta y se mete en el hueco (y adentro brilla la brasa violeta)
      const inK = clamp01((lt - 3) / 0.5);
      if (inK > 0) {
        L.rotation.y = toCam + Math.PI * smooth(Math.min(1, inK * 2));
        L.position.addScaledVector(d, -0.7 * inK).setY(L.position.y + 0.25 * Math.sin(inK * Math.PI));
        L.scale.setScalar(4 * (1 - inK * 0.5));
        if (inK >= 1) {
          L.visible = false;
          this.g.fx.flash(tmpV.copy(O), 0x8a3aff, 8, 0.5, 6);
          this.g.audio.caw(tmpV.copy(O), 1);
        }
      }
    }
  }

  // Los segadores miran lo que pasa (y para arriba cuando baja la Voz).
  updateReapers() {
    const look = this.look;
    const want = look === 'sky' || look === 'voz' ? -0.85 : look === 'pile' ? 0.2 : 0.05;
    for (const r of this.reapers) {
      const at = look === 'pile' || look === 'fire' ? this.pile.position : this.A;
      r.yaw = faceTo(r.pos, at.x, at.z);
      r.headP += (want - r.headP) * 0.04;
    }
  }

  updateVoz(dt) {
    const V = this.voz;
    if (!V.root.visible) return;
    const g = this.g;
    const t = this.t;
    const A = this.A;
    const E = V.root.position;
    if (this.outT != null) {
      // se va para arriba cada vez más rápido y queda como una estrella
      const u = t - this.outT;
      E.y += (4 + u * u * 22) * dt;
      V.root.scale.setScalar(Math.max(0.25, 1 - u * 0.15));
      if (this.voiceLight) this.voiceLight.intensity = Math.max(0, this.voiceLight.intensity - dt * 25);
    } else if (this.voiceT != null) {
      const k = clamp01((t - this.voiceT) / 4.2);
      E.y = VOZ_TOP - (1 - (1 - k) ** 3) * (VOZ_TOP - VOZ_Y) + Math.sin(t * 0.8) * 0.3;
      if (this.voiceLight) this.voiceLight.intensity = Math.min(60, this.voiceLight.intensity + dt * 30);
    } else {
      // (se asoma: una luz entre las nubes)
      E.y = VOZ_TOP + Math.sin(t * 0.8) * 0.3;
      if (this.voiceLight) this.voiceLight.intensity = Math.min(12, this.voiceLight.intensity + dt * 8);
    }
    if (this.voiceLight) this.voiceLight.position.set(E.x, E.y - 1.5, E.z);
    // el ojo colorado: un instante y vuelve (solo en el primer plano)
    const ev = this.evilT != null ? t - this.evilT : -1;
    V.evil = ev < 0 ? 0 : ev < 0.08 ? ev / 0.08 : Math.max(0, 1 - (ev - 0.55) / 0.3);
    updateVoz(V, dt, t, g.camera.position);
    // (de cerca, el halo, los anillos y el ojo tapaban todo de blanco con el
    // brillo del postproceso: se achican y se apagan un poco)
    const near = g.camera.position.distanceTo(E);
    const hk = clamp01((near - 6) / 16);
    V.halo.material.opacity *= 0.15 + hk * 0.85;
    V.halo.scale.setScalar(16 * (0.35 + hk * 0.65));
    const dim = 0.4 + hk * 0.6;
    for (const r of V.rings) r.material.color.multiplyScalar(dim);
    V.core.material.color.multiplyScalar(0.55 + hk * 0.45);
    // los anillos dorados un momento después de que llega la yerba
    if (this.flareT != null) {
      const k = clamp01(1 - (t - this.flareT) / 1.8);
      V.rings.forEach((r, i) => r.userData.base.copy(this.ringBase[i]).lerp(tmpC.setRGB(1.5, 1.1, 0.45), k));
    }
    // la columna de luz mientras sube la yerba
    const B = V.beam.material;
    B.opacity = V.beamOn ? Math.min(0.2, B.opacity + dt * 0.2) : Math.max(0, B.opacity - dt * 0.35);
    // el paquete: sube girando por la columna; al llegar, el fogonazo
    if (this.packT != null && this.pack.visible) {
      const u = clamp01((t - this.packT) / PACK_UP);
      const s = smooth(u);
      const p = this.pack.position;
      p.lerpVectors(A, tmpV.copy(E).setY(E.y - 1.2), s);
      p.x += Math.sin(u * Math.PI * 3) * 0.3 * (1 - u);
      p.z += Math.cos(u * Math.PI * 3) * 0.3 * (1 - u);
      this.pack.rotation.y += dt * (2 + u * 5);
      if (Math.random() < 0.8) g.fx.sparkle(p, [0.75, 0.95, 0.45], 2, 0.35);
      if (u >= 1) {
        this.pack.visible = false;
        g.post?.flash?.(0.8);
        g.audio.powerupGrab();
        g.fx.sparkle(E, [1, 0.85, 0.5], 70, 2.2);
        // (los anillos se encienden dorados: updateVoz los tiñe desde su color base)
        this.flareT = t;
        this.shake = Math.max(this.shake, 0.35);
      }
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.script = null;
    window.removeEventListener('keydown', this.onKey);
    const g = this.g;
    // se cortan sus voces (también los murmullos) y vuelven a hablar los demás
    g.audio.hush();
    g.audio.setCine(false);
    this.el.remove();
    this.setFov(this.fov0);
    const Z = g.zombies;
    if (this.sc && Z.boss === this.sc) Z.removeBoss();
    // el cuerpo del jefe vuelve a como estaba (colores, el cuervo, la horquilla)
    for (const m of Z.bossMats ? [Z.bossMats.skin, Z.bossMats.cloth, Z.bossMats.poncho] : []) if (m.emissive) m.emissiveIntensity = 0;
    Z.dressBoss?.('scarecrow');
    this.people?.dispose();
    // los cuervos del Prado vuelven a su lugar (escondidos)
    for (const { obj, parent } of this.flockBack || []) {
      obj.visible = false;
      obj.scale.setScalar(1);
      parent?.add(obj);
    }
    g.fx.clearAll();
    g.fx.update(0, g.camera);
    this.root?.removeFromParent();
    this.root = null;
    for (const s of this.lights0 || []) {
      s.l.intensity = s.i;
      s.l.color.setHex(s.c);
      s.l.position.copy(s.p);
    }
    try {
      this.windOut?.disconnect();
      this.fireOut?.disconnect();
    } catch {
      /* ya estaban sueltas */
    }
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    for (const b of this.boxBeams || []) b.visible = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
