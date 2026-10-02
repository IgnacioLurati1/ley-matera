import * as THREE from 'three';
import { EE, TOWER } from '../config/map';
import Avatars from '../net/Avatars';
import { buildChiqui, chiquiGiggle, chiquiGlitch, chiquiTap } from '../world/Chiqui';
import { groundY } from '../world/Llano';
import { warmScene } from './cineWarm';
import { crewIds, glowFront } from './cineCrew';
import { buildSupremoDisplay, animateSupremoDisplay } from '../weapons/Supremo';
import { skinBoneAt, preloadBossSkin } from '../entities/bossSkin';

// Final de la torre (el modo historia; el del Challenge es otro:
// entities/challengeHeaven.js), adentro del juego. Rehecho el 2026-09-29 (el
// usuario: "quedó media vieja a comparación de otras"). Las tomas:
//  1. El Infierno Matero después de la pelea: el mate supremo tirado en la
//     lava y, atrás, Francisco de rodillas. Los cuatro gauchos salen del vapor.
//  2. Lo que tenía adentro no lo quiere soltar: los ojos se le ponen
//     colorados (el mismo destello de la Voz en el penal y en La Tapera), se
//     retuerce y la aureola se le quiebra, cae y se hace pedazos. Una chispa
//     colorada se escapa para arriba. Le quedan los ojos de un hombre.
//  3. Cuenta su trato: subió buscando el mate que no se termina nunca, se lo
//     dieron a cambio de las almas... y no era para él: se lo cuidaba a él.
//  4. Tiembla la caverna (caen piedras; los gauchos se agachan): viene el
//     Chiquitijuein. Levanta el mate con las dos manos y se lo da a uno de los
//     gauchos: que lo protejan con sus vidas. Mira para arriba y se deshace en
//     polvo de oro, de los pies a la cabeza.
//  5. El ánima de Martín Fierro: Francisco no era malo. Un remolino azul se
//     los lleva a la cima de la torre (ahí entra la canción de la torre).
//  6. El remolino se calma después de cien años y amanece; los gauchos van
//     hasta las almenas y el que tiene el mate lo levanta al sol. Fierro: el
//     Chiquitijuein ya sabe dónde está el mate; lo van a enfrentar juntos. Y,
//     solo, para él (el secreto): "Cuatro... como la otra vez." (los cuatro
//     caballeros de luz de Der Mateendrache).
//  7. Lejos, traída por el viento, una risita. En el llano, algo chiquito con
//     ojos colorados mira la torre, da vuelta la cabeza, se ríe... y en un
//     parpadeo lo tenés encima. Negro. "Continuará..."
// Se puede saltear con Esc, Espacio o clic. Solo usa las luces que ya existen
// (world/Tower.js cineLights, las de la caverna y la luna): sumar una en medio
// de la escena recompila todo.

const FIERRO = 411;
const ME = 420;
const WHO = { francisco: 'Francisco', fierro: 'Martín Fierro' };
// Francisco vencido: tamaño de persona (las tomas están hechas a esa altura)
const FRAN_SCALE = 1.05;
// el mate supremo: el alto del cuerpo, en metros
const MATE_H = 0.3;
// dónde está el Chiquitijuein: la explanada del llano, al norte de la torre
// (TOWER recién existe cuando se elige el mapa)
const CHIQUI = new THREE.Vector3();
// la toma del Chiquitijuein (segundos desde que aparece): corta a ras del
// piso, camina, se para, da vuelta la cabeza, sonríe, se ríe, se acerca de a
// saltos y negro
const CHIQ = { cut: 3.4, stop: 5.9, turn: 6.4, grin: 7.6, laugh: 7.9, glitch: 9.1, black: 9.5, end: 11.4 };
// el sol del amanecer, desde la cima: hacia el este, apenas sobre el horizonte
const SUN = new THREE.Vector3(1, 0, 0.14).normalize();
// Francisco de rodillas: cómo va cambiando (hipY: sentado sobre los talones)
const FP = {
  // vencido, encorvado, las manos en los muslos
  down: { hipY: 0.5, torsoP: 0.55, headP: 0.5, shLp: -0.3, shRp: -0.3, shLr: 0.14, shRr: -0.14, elL: -0.55, elR: -0.55 },
  // se retuerce: lo que tenía adentro no lo quiere soltar
  fight: { hipY: 0.56, torsoP: -0.3, headP: -0.7, shLp: -0.25, shRp: -0.25, shLr: 0.8, shRr: -0.8, elL: -1.2, elR: -1.2 },
  // libre: derecho, mirando a los gauchos
  free: { hipY: 0.53, torsoP: 0.14, headP: -0.1, shLp: -0.2, shRp: -0.2, shLr: 0.1, shRr: -0.1, elL: -0.4, elR: -0.4 },
  // hablando: la mano derecha acompaña
  talk: { hipY: 0.53, torsoP: 0.08, headP: -0.14, shLp: -0.2, shRp: -0.95, shLr: 0.1, shRr: -0.25, elL: -0.4, elR: -0.85 },
  // mira el mate, en el piso delante de él
  look: { hipY: 0.5, torsoP: 0.42, headP: 0.6, shLp: -0.3, shRp: -0.3, shLr: 0.1, shRr: -0.1, elL: -0.5, elR: -0.5 },
  // se agacha a levantarlo con las dos manos
  reach: { hipY: 0.46, torsoP: 1.05, headP: 0.25, shLp: -0.8, shRp: -0.8, shLr: -0.14, shRr: 0.14, elL: -0.12, elR: -0.12 },
  // lo tiene contra el pecho
  hold: { hipY: 0.53, torsoP: 0.08, headP: 0.35, shLp: -0.6, shRp: -0.6, shLr: -0.34, shRr: 0.34, elL: -1.4, elR: -1.4 },
  // lo ofrece con los brazos estirados
  offer: { hipY: 0.54, torsoP: 0.22, headP: -0.12, shLp: -1.6, shRp: -1.6, shLr: -0.2, shRr: 0.2, elL: -0.35, elR: -0.35 },
  // en paz: mira para arriba, los brazos apenas abiertos
  peace: { hipY: 0.55, torsoP: -0.1, headP: -0.62, shLp: -0.35, shRp: -0.35, shLr: -0.4, shRr: 0.4, elL: -0.25, elR: -0.25 },
};
// el orden en que se deshace (pies, piernas, cadera, manos, brazos, torso, cabeza)
const CRUMBLE = [[11, 12], [9, 10], [7, 8], [0], [5, 6], [3, 4], [1, 16, 17], [2, 13, 14, 15]];
const GOLDS = [[1, 0.86, 0.45], [1, 0.72, 0.28], [1, 0.95, 0.7]];

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const HAND = new THREE.Vector3(0, -0.17, 0);

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const rnd = () => Math.random() - 0.5;
// Mirar a un punto (los muñecos tienen el frente al revés que la cámara)
const faceTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));
const angTo = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export default class TowerCinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    // (a la vista desde el primer cuadro: arranca en negro)
    this.el.className = 'mdu-fcine mdu-fcine--torre is-on';
    this.el.innerHTML =
      '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><i class="mdu-fcine__black"></i><p class="mdu-fcine__text"><b class="mdu-fcine__who"></b><span></span></p><h1 class="mdu-fcine__title">Continuará...</h1><i class="mdu-fcine__flash"></i><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.whoEl = this.el.querySelector('.mdu-fcine__who');
    this.span = this.el.querySelector('.mdu-fcine__text span');
    this.blackEl = this.el.querySelector('.mdu-fcine__black');
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
    this.black(1, 0);
    const A = EE.arena;
    this.A = new THREE.Vector3(A.x, A.y || 0, A.z);
    this.top = EE.canon.y;
    const [sx, sz] = TOWER.llano.spot;
    CHIQUI.set(sx, groundY(sx, sz), sz);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    // (desde Alt+I se llega sin la caída: la caverna todavía no estaba a la vista)
    const ar = g.arena;
    if (ar?.root) ar.root.visible = true;
    if (ar?.weatherName && g.weather?.name !== ar.weatherName) g.weather?.set?.(ar.weatherName, false);
    if (g.zombies.boss) g.zombies.removeBoss();
    g.hud.setBossBar(null);
    g.weapons.vmRoot.visible = false;
    g.menus?.showClick?.(false);
    this.fov0 = g.camera.fov;
    // los compañeros de la red no se ven: en la escena van todos juntos
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // ni el ánima del easter egg (la escena tiene su propio Fierro) ni lo que quedó tirado
    if (g.ee?.npc) g.ee.npc.root.visible = false;
    if (g.ee?.fierroGlow) g.ee.fierroGlow.visible = false;
    for (const it of g.powerups?.items || []) it.mesh.visible = false;
    this.boxBeams = [g.interact?.box, ...(g.interact?.saleBoxes || [])].map((b) => b?.beam).filter((b) => b?.visible);
    for (const b of this.boxBeams) b.visible = false;
    this.people = new Avatars(g, null);
    // Francisco, de rodillas en el medio de la caverna, mirando al sur (+z)
    this.F = new THREE.Vector3(A.x, this.A.y, A.z - 1.5);
    this.buildFran();
    this.buildGauchos();
    // el mate supremo, tirado delante de él (se le cayó en la pelea)
    this.mate = this.buildMate();
    this.mateAt = 'floor';
    this.mate.position.set(this.F.x - 0.05, this.A.y + 0.13, this.F.z + 0.7);
    this.mate.rotation.set(0.25, 0.6, 1.35);
    this.root.add(this.mate);
    // las luces ya están en la escena desde que se armó la torre (ver cineWarm)
    const spare = g.world.tower?.cineLights || [];
    this.mateLight = this.light(spare[0], 0xffc050, 1, 4);
    this.fierroLight = this.light(spare[1], 0x7ab8ff, 0, 8);
    this.buildFierro();
    // el Chiquitijuein, escondido hasta el final
    this.chiq = buildChiqui(g.textures);
    this.chiq.root.visible = false;
    this.root.add(this.chiq.root);
    this.buildSun();
    // (la luna: de mañana alumbra desde el sol; finish la devuelve)
    const moon = g.world.moon;
    if (moon) this.moon0 = { c: moon.color.getHex(), i: moon.intensity, p: moon.position.clone() };
    // el fondo de la caverna: un rumor grave (y arriba, el viento)
    const au = g.audio;
    au.setCine(true);
    if (au.ctx) {
      this.bedOut = au.out({ gain: 0.8, reverb: 0.6 });
      au.noise(this.bedOut, { t: au.now, dur: 70, type: 'lowpass', freq: 140, q: 0.5, gain: 0.3, attack: 2, brown: true });
    }
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

  // ---------------- los que actúan ----------------
  // Francisco: el cuerpo del jefe (el de la pelea), de rodillas. La aureola se
  // le va a quebrar y los ojos (los de todos los jefes: se devuelven en finish)
  // van a cambiar.
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
    z.pos.copy(this.F);
    z.baseY = this.A.y;
    z.yaw = 0;
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('francisco');
    preloadBossSkin(Z, 'francisco');
    const R = Z.bossRig;
    R.rig.visible = true;
    for (const p of R.parts) if (p) p.visible = true;
    this.franZ = z;
    this.fp = 'down';
    this.fk = { ...FP.down };
    // la aureola (el torito de oro de radio 0,17 colgado de la cabeza)
    this.halo = R.parts[2].children.find((o) => o.isGroup && o.children[0]?.geometry?.parameters?.radius === 0.17) || null;
    this.eyeGold = R.eyeMat.color.clone();
  }

  franMats() {
    const BM = this.g.zombies.bossMats;
    return BM ? [BM.skin, BM.cloth, BM.poncho] : [];
  }

  // Los gauchos: vos y los compañeros (siempre cuatro). Vos, el segundo de la
  // fila (así el que recibe el mate queda en el medio). Salen del vapor.
  buildGauchos() {
    const g = this.g;
    const me = g.net?.id ?? 0;
    const ids = crewIds(g).filter((id) => id !== me);
    ids.splice(1, 0, me);
    this.gauchos = ids.map((id, i) => {
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, crouch: false };
      this.people.add(r);
      // el color del poncho es el de cada uno en la partida
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      r.a = a;
      r.slot = i - (ids.length - 1) / 2;
      r.headP = 0;
      r.arms = null;
      r.poseFn = (P) => this.gauchoPose(r, P);
      return r;
    });
    this.lead = this.gauchos[1];
    // la fila frente a Francisco (en un arco) y de dónde salen (del vapor, atrás)
    for (const r of this.gauchos) {
      const s = r.slot;
      r.home = new THREE.Vector3(this.F.x + s * 1.2, this.A.y, this.F.z + 2.9 + Math.abs(s) * 0.4);
      r.pos.set(r.home.x + s * 0.6, this.A.y, r.home.z + 5.2 + Math.abs(s) * 0.7 + (s > 0 ? 0.5 : 0));
      r.yaw = faceTo(r.pos, r.home.x, r.home.z);
    }
    this.look = this.F;
  }

  // Los brazos y la cabeza de cada gaucho (encima de la pose de siempre).
  gauchoPose(r, P) {
    P.headP = r.headP;
    if (r.arms === 'hold') {
      // el mate supremo con las dos manos, a la altura del pecho
      P.shRp = -0.7;
      P.shRr = 0.3;
      P.elR = -1.15;
      P.shLp = -0.7;
      P.shLr = -0.3;
      P.elL = -1.15;
    } else if (r.arms === 'take') {
      // estira los brazos para recibirlo
      P.shRp = -1.25;
      P.shRr = 0.22;
      P.elR = -0.45;
      P.shLp = -1.25;
      P.shLr = -0.22;
      P.elL = -0.45;
    } else if (r.arms === 'raise') {
      // lo levanta al sol
      P.shRp = -2.75;
      P.shRr = 0.18;
      P.elR = -0.25;
      P.shLp = -2.75;
      P.shLr = -0.18;
      P.elL = -0.25;
      P.torsoP = -0.08;
    }
  }

  // Martín Fierro: el ánima (azul, transparente); se arma ya, escondido.
  buildFierro() {
    const f = { id: FIERRO, name: 'Martín Fierro', noTag: true, pos: new THREE.Vector3(this.F.x - 0.35, this.A.y, this.F.z - 0.25), yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true, dead: true };
    this.fierro = f;
    this.people.add(f);
    // (una pasada con él a la vista: así ya queda vestido de ánima, transparente)
    f.dead = false;
    this.people.update(0);
    f.dead = true;
    f.arm = 0;
    f.armTo = 0;
    f.headP = 0;
    f.poseFn = (P) => {
      const k = f.arm;
      if (k > 0.01) {
        P.shRp = -0.55 - k * 2.3;
        P.shRr = -0.1 - k * 0.2;
        P.elR = -1.25 + k * 1.1;
      }
      P.headP = f.headP;
    };
  }

  // El mate supremo: el de verdad (weapons/Supremo.js) y su brillo.
  buildMate() {
    const gr = new THREE.Group();
    this.sup = buildSupremoDisplay(this.g.textures, MATE_H);
    gr.add(this.sup);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffc84a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }));
    glow.scale.setScalar(0.5);
    glow.position.y = MATE_H * 0.5;
    gr.add(glow);
    this.mateGlow = glow;
    return gr;
  }

  // El sol del amanecer (sprites: no es una luz, no recompila nada), escondido
  // hasta la cima.
  buildSun() {
    const T = this.g.textures;
    const mk = (color, size, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity }));
      s.scale.setScalar(size);
      s.visible = false;
      this.root.add(s);
      return s;
    };
    this.sunHalo = mk(0xff9a50, 90, 0.4);
    this.sunCore = mk(0xfff0c8, 26, 1);
  }

  // ---------------- el guion ----------------
  // Cada paso: [espera, fn]; fn devuelve cuánto dura.
  buildScript() {
    const g = this.g;
    return [
      // el mate tirado en la lava y, atrás, Francisco vencido
      [0, () => {
        this.black(0, 1.8);
        this.shotMate();
        this.later(1.4, () => this.rumble(0.5));
        return 4.4;
      }],
      // los gauchos salen del vapor
      [0, () => {
        for (const r of this.gauchos) this.walkTo(r, r.home, 1.25, (Math.abs(r.slot) - 0.5) * 0.35);
        this.shotOver();
        return 5.4;
      }],
      // lo que tenía adentro no lo quiere soltar
      [0, () => {
        this.possess();
        this.shotFace();
        return 3.3;
      }],
      [0, () => {
        this.breakHalo();
        return 2.6;
      }],
      [0, () => {
        this.fp = 'free';
        this.shotFree();
        return this.say('francisco', 'Gracias... Hacía cien años que no veía con mis propios ojos.') + 0.3;
      }],
      // el trato
      [0, () => {
        this.fp = 'talk';
        this.shotTwo();
        return this.say('francisco', 'Subí esta torre buscando el mate que no se termina nunca.') + 0.2;
      }],
      [0, () => {
        this.shotReverse();
        return this.say('francisco', 'Y me lo dieron... a cambio de las almas de todos los gauchos.') + 0.3;
      }],
      [0, () => {
        this.fp = 'look';
        this.shotLook();
        return this.say('francisco', 'Pero ese mate no era para mí. Yo nomás se lo cuidaba... a él.') + 0.4;
      }],
      // tiembla todo: viene
      [0, () => {
        this.fp = 'free';
        this.quake(1.3);
        this.shotQuake();
        for (const r of this.gauchos) {
          this.later(0.3 + Math.random() * 0.4, () => (r.crouch = true));
          this.later(3.4 + Math.random() * 0.5, () => (r.crouch = false));
        }
        this.lookUp = true;
        this.later(3.6, () => (this.lookUp = false));
        return this.say('francisco', 'El Chiquitijuein. Viene de más allá del remolino... y viene por el mate.') + 0.5;
      }],
      // lo levanta con las dos manos
      [0, () => {
        this.hideText();
        this.fp = 'reach';
        this.shotPick();
        this.later(1.25, () => this.grabMate());
        this.later(1.45, () => (this.fp = 'hold'));
        return 2.2;
      }],
      [0, () => this.say('francisco', 'No puede caer en sus manos.') + 0.2],
      // y se lo da al del medio
      [0, () => {
        this.fp = 'offer';
        this.walkTo(this.lead, tmpV.set(this.F.x, this.A.y, this.F.z + 1.55), 0.9);
        this.later(1.3, () => (this.lead.arms = 'take'));
        this.shotHand();
        this.later(2.1, () => this.passMate());
        const d = this.say('francisco', 'Protéjanlo... con sus vidas.');
        return Math.max(d, 3.4) + 0.8;
      }],
      // se deshace en polvo de oro
      [0, () => {
        this.hideText();
        this.fp = 'peace';
        this.ascend();
        this.shotAscend();
        return 6.6;
      }],
      // Fierro, donde estaba Francisco
      [0.2, () => {
        this.fierroIn();
        this.shotFierro();
        return 1.2;
      }],
      [0, () => this.say('fierro', 'Ya pasó, muchachos.') + 0.2],
      [0, () => {
        this.shotFierroGroup();
        return this.say('fierro', 'Francisco no era malo. Se perdió buscando un mate que no se termina nunca... como tantos.') + 0.3;
      }],
      [0, () => this.say('fierro', 'Agarren fuerte ese mate. Nos vamos de acá.') + 0.1],
      [0, () => {
        this.hideText();
        this.portal();
        this.shotPortal();
        return 3.6;
      }],
      // la cima: todavía en la tormenta; el remolino se calma (sin canción: pelado)
      [0, () => {
        this.toTop();
        this.shotArrive();
        return 4.6;
      }],
      [0, () => {
        this.shotCalm();
        this.fierro.armTo = 0.55;
        this.later(3.2, () => (this.fierro.armTo = 0));
        return this.say('fierro', 'Miren. Cien años girando... y el remolino por fin se calma.') + 1.4;
      }],
      // hasta las almenas; el del mate lo levanta al sol
      [0, () => {
        this.hideText();
        for (const r of this.gauchos) this.walkTo(r, r.wall, 1.1, Math.abs(r.slot) * 0.2);
        this.walkTo(this.fierro, this.fierro.wall, 1, 0.6);
        this.look = this.sunAt;
        this.shotDawn();
        this.later(3.9, () => this.raiseMate());
        return 7.4;
      }],
      [0, () => {
        this.lead.arms = 'hold';
        this.look = this.fierro.pos;
        this.shotFierroTop();
        return this.say('fierro', 'Pero esto no terminó. El Chiquitijuein ya sabe dónde está el mate.') + 0.2;
      }],
      [0, () => {
        this.shotTopReverse();
        return this.say('fierro', 'Y cuando venga... lo vamos a enfrentar juntos.') + 0.6;
      }],
      // el secreto (lo dice para él): los cuatro de antes
      [0, () => {
        this.hideText();
        this.look = this.sunAt;
        g.music?.stop(4.5);
        this.fierro.north = true;
        this.shotSecret();
        this.later(1.3, () => this.say('fierro', 'Cuatro... como la otra vez.', { secret: true }));
        // lejos, traída por el viento, una risita
        this.later(4.6, () => chiquiGiggle(g.audio, { gain: 0.4, pan: -0.75, echo: 0.8, pitch: 0.94 }));
        return 6.2;
      }],
      [0.2, () => {
        this.hideText();
        this.chiquiIn();
        this.shotHorizon();
        return CHIQ.end;
      }],
      // (sigue el negro, callado: el cartel solo)
      [0.3, () => {
        this.el.classList.add('is-title');
        return 4.6;
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

  // Habla un personaje: su nombre arriba y el subtítulo que va apareciendo al
  // ritmo de la voz. secret: más bajo y con otro color (lo que dice para él).
  say(who, text, { secret = false } = {}) {
    const d = this.g.audio.say(text, who, { cine: true });
    this.whoEl.textContent = WHO[who] || '';
    this.span.textContent = '';
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro' && !secret);
    this.el.classList.toggle('is-fran', who === 'francisco');
    this.el.classList.toggle('is-secreto', secret);
    this.sub = { text, t0: this.t, rev: Math.max(0.5, Math.min(d * 0.85, text.length * 0.05)), k: -1 };
    return d;
  }

  hideText() {
    this.textEl.classList.remove('is-on');
    this.el.classList.remove('is-secreto');
    this.sub = null;
  }

  // El negro de los cortes (fade: segundos para irse o volver; 0 = de golpe).
  black(v, fade = 0) {
    this.blackEl.style.transition = fade ? `opacity ${fade}s` : 'none';
    this.blackEl.style.opacity = String(v);
  }

  // Alguien camina hasta `to` (a `speed` m/s), después de `delay` segundos.
  walkTo(r, to, speed = 1.2, delay = 0) {
    r.goal = to.clone();
    r.walk = speed;
    r.walkT = this.t + Math.max(0, delay);
  }

  // Arriba, la tormenta: un trueno ahogado por la roca y la luz que se cuela.
  rumble(k = 1) {
    const g = this.g;
    g.audio.thunder?.(tmpV.set(this.A.x + rnd() * 20, this.A.y + 30, this.A.z + rnd() * 20));
    if (g.weather) g.weather.flash = Math.max(g.weather.flash || 0, 0.35 * k);
    this.shake = Math.max(this.shake, 0.12 * k);
    // del techo cae tierra
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 2 + Math.random() * 8;
      this.dustFall(this.A.x + Math.cos(a) * d, this.A.z + Math.sin(a) * d);
    }
  }

  dustFall(x, z) {
    const g = this.g;
    for (let i = 0; i < 6; i++) g.fx.alpha?.spawn(x + rnd() * 0.4, this.A.y + 11 + Math.random(), z + rnd() * 0.4, rnd() * 0.2, -1 - Math.random(), rnd() * 0.2, { color: [0.3, 0.2, 0.16], size: 0.12, size1: 0.3, life: 2.2, gravity: 2, alpha: 0.7 });
  }

  // Los ojos se le ponen colorados (el destello de la Voz) y se retuerce.
  possess() {
    const g = this.g;
    this.fp = 'fight';
    this.possT = this.t;
    this.shake = Math.max(this.shake, 0.3);
    const A = g.audio;
    try {
      const o = A.out({ pos: tmpV.copy(this.F).setY(1.2), gain: 0.9, reverb: 0.7 });
      A.tone(o, { t: A.now, dur: 2.6, type: 'sawtooth', freq: 58, freqEnd: 44, gain: 0.16, attack: 0.3 });
      A.noise(o, { t: A.now, dur: 2.8, type: 'bandpass', freq: 380, freqEnd: 140, q: 2, gain: 0.3, attack: 0.4 });
      // el mismo acorde del ojo colorado de la Voz (penal, La Tapera)
      const m = A.out({ gain: 0.6, reverb: 0.8, bus: A.music });
      for (const at of [0.2, 1.1, 1.9]) {
        A.tone(m, { t: A.now + at, dur: 0.45, type: 'triangle', freq: 1480, freqEnd: 1395, gain: 0.025, attack: 0.01 });
        A.tone(m, { t: A.now + at, dur: 0.45, type: 'triangle', freq: 1047, freqEnd: 988, gain: 0.025, attack: 0.01 });
      }
    } catch {
      /* sin sonido */
    }
  }

  // La aureola se quiebra y se cae; se le va lo colorado de los ojos y una
  // chispa colorada se escapa para arriba. Queda un hombre.
  breakHalo() {
    const g = this.g;
    this.possT = null;
    this.freeT = this.t;
    this.fp = 'down';
    this.later(0.9, () => (this.fp = 'free'));
    // (vuelven a ser los de antes: dorados y mansos, como en la entrada del molino)
    this.g.zombies.bossRig.eyeMat.color.copy(this.eyeGold).multiplyScalar(0.4);
    const h = this.halo;
    if (h) {
      h.updateWorldMatrix(true, false);
      const c = h.clone();
      h.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      h.visible = false;
      this.root.add(c);
      this.haloFall = { o: c, v: new THREE.Vector3(0.2, 1.5, 0.55), spin: new THREE.Vector3(3.2, 0.8, 2.2) };
      this.haloAt = c.position.clone();
    }
    const head = this.franHead(tmpA);
    g.fx.flash(tmpV.copy(head), 0xffc050, 60, 0.4, 8);
    g.post?.flash(0.4);
    // la chispa colorada: sube derecho y se pierde en el techo
    this.wispT = this.t;
    this.wisp = head.clone();
    const A = g.audio;
    try {
      const o = A.out({ pos: head.clone(), gain: 1, reverb: 0.7 });
      A.tone(o, { t: A.now, dur: 0.9, type: 'triangle', freq: 2350, freqEnd: 2200, gain: 0.08, attack: 0.002 });
      A.tone(o, { t: A.now, dur: 0.7, type: 'triangle', freq: 3130, gain: 0.05, attack: 0.002 });
      A.noise(o, { t: A.now, dur: 0.25, type: 'highpass', freq: 3000, gain: 0.35 });
      const bus = A.out({ gain: 1, reverb: 0.6, bus: A.music });
      A.bell(bus, A.now + 0.2, 69, { gain: 0.08, dur: 4 });
      A.choir(bus, A.now + 0.3, [57, 64, 69, 73], { dur: 2.6, gain: 0.04, attack: 0.3, release: 2 });
    } catch {
      /* sin sonido */
    }
    // (casi no se oye)
    this.later(0.5, () => chiquiGiggle(g.audio, { whisper: true, gain: 0.18, echo: 0.9, pitch: 1.1 }));
  }

  // La caverna tiembla: la cámara se sacude y caen piedras de la bóveda.
  quake(k) {
    const g = this.g;
    this.shake = Math.max(this.shake, k * 0.6);
    this.rumble(1.2);
    g.audio.bossSlam?.(tmpV.set(this.A.x, 4, this.A.z));
    const n = Math.round(4 + k * 5);
    for (let i = 0; i < n; i++) {
      this.later(i * 0.32 + Math.random() * 0.3, () => {
        const a = i % 3 ? Math.PI / 2 + rnd() * 1.8 : Math.random() * Math.PI * 2;
        const d = 4 + Math.random() * 6.5;
        const s = 0.22 + Math.random() * 0.32;
        const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 4, 6), this.g.arena?.rockMat || this.g.world.M.stone);
        m.rotation.x = Math.PI;
        m.position.set(this.A.x + Math.cos(a) * d, this.A.y + 12, this.A.z + Math.sin(a) * d);
        this.root.add(m);
        this.rocks.push({ m, v: 0 });
        this.dustFall(m.position.x, m.position.z);
      });
    }
  }

  // Francisco lo levanta del piso.
  grabMate() {
    this.mateAt = 'fran';
    this.mateUpT = this.t;
    this.mateQ0 = this.mate.quaternion.clone();
    this.g.audio.whoosh?.(this.mate.position);
    this.g.fx.sparkle(this.mate.position, [1, 0.85, 0.4], 18, 0.3);
  }

  // Pasa de sus manos a las del gaucho del medio.
  passMate() {
    this.mateAt = 'pass';
    this.passT = this.t;
    this.passFrom = this.mate.position.clone();
    const a = this.lead.a;
    a.hand.children[0].visible = false;
    try {
      const A = this.g.audio;
      const o = A.out({ gain: 0.8, reverb: 0.8, bus: A.music });
      A.bell(o, A.now, 76, { gain: 0.06, dur: 4 });
    } catch {
      /* */
    }
  }

  // El del mate lo levanta al sol: los anillos se prenden.
  raiseMate() {
    this.lead.arms = 'raise';
    this.flareT = this.t + 0.6;
    const g = this.g;
    this.later(0.6, () => {
      g.fx.sparkle(this.mate.position, [1, 0.9, 0.5], 50, 0.8);
      g.post?.flash(0.25);
      try {
        const A = g.audio;
        const o = A.out({ gain: 0.7, reverb: 1, bus: A.music });
        A.bell(o, A.now, 81, { gain: 0.05, dur: 5 });
      } catch {
        /* */
      }
    });
  }

  // Mira para arriba, se prende de oro y se deshace de los pies a la cabeza.
  ascend() {
    const g = this.g;
    this.ascT = this.t;
    this.crumbled = 0;
    g.audio.whoosh?.(this.F);
    try {
      const A = g.audio;
      const o = A.out({ gain: 0.8, reverb: 1, bus: A.music });
      A.choir(o, A.now + 0.4, [57, 64, 69, 72, 76], { dur: 6, gain: 0.04, attack: 2.2, release: 2.5 });
      A.bell(o, A.now + 2.2, 69, { gain: 0.08, dur: 6 });
      A.bell(o, A.now + 5.4, 76, { gain: 0.06, dur: 6 });
    } catch {
      /* */
    }
  }

  fierroIn() {
    const g = this.g;
    const f = this.fierro;
    f.dead = false;
    this.fierroOn = true;
    f.yaw = faceTo(f.pos, this.lead.pos.x, this.lead.pos.z);
    g.fx.sparkle(tmpV.copy(f.pos).setY(f.pos.y + 1), [0.6, 0.8, 1], 60, 1.2);
    g.fx.flash(tmpV.copy(f.pos).setY(f.pos.y + 1.2), 0x7ab8ff, 80, 0.6, 14);
    g.post?.flash(0.4);
    g.audio.sting();
    this.look = f.pos;
  }

  // Fierro levanta el brazo: un remolino azul alrededor de todos y un fogonazo.
  portal() {
    const g = this.g;
    this.fierro.armTo = 1;
    this.portalT = 0;
    this.portalC = this.groupCenter(new THREE.Vector3());
    g.audio.whoosh?.(this.fierro.pos);
    try {
      const A = g.audio;
      const o = A.out({ pos: this.portalC.clone().setY(1.5), gain: 1, reverb: 0.5 });
      A.noise(o, { t: A.now, dur: 3, type: 'bandpass', freq: 300, freqEnd: 1400, q: 0.8, gain: 0.35, attack: 1.5 });
    } catch {
      /* */
    }
    this.later(3.05, () => {
      this.flashEl.classList.add('is-on');
      g.audio.powerupGrab?.();
      g.audio.thunder?.(this.fierro.pos);
    });
  }

  // A la cima de la torre, todavía en la tormenta; el remolino empieza a calmarse.
  toTop() {
    const g = this.g;
    this.atTop = true;
    this.portalT = null;
    this.fierro.armTo = 0;
    this.fierro.arm = 0;
    this.look = null;
    const y = this.top;
    const T = TOWER;
    // llegan al este del cañón y después van hasta las almenas, mirando al sol
    this.S = new THREE.Vector3(T.cx + 4.6, y, T.cz + 0.4);
    this.P = new THREE.Vector3(T.cx + 8.3, y, T.cz + 0.4);
    this.sunAt = new THREE.Vector3(T.cx, y, T.cz).addScaledVector(SUN, 170);
    for (const r of this.gauchos) {
      const s = r.slot;
      r.pos.set(this.S.x - Math.abs(s) * 0.35, y, this.S.z + s * 1.15);
      r.wall = new THREE.Vector3(this.P.x - Math.abs(s) * 0.25, y, this.P.z + s * 1.05);
      r.goal = null;
      r.moving = false;
      r.speed = 0;
      r.yaw = faceTo(r.pos, this.sunAt.x, this.sunAt.z);
      r.headP = 0;
      // (llegan agachados, del golpe)
      r.crouch = true;
      this.later(0.9 + Math.random() * 0.5, () => (r.crouch = false));
    }
    this.lead.arms = 'hold';
    const f = this.fierro;
    f.pos.set(this.S.x - 1.6, y, this.S.z - 2.6);
    f.wall = new THREE.Vector3(this.P.x - 2.8, y, this.P.z - 3.8);
    f.yaw = faceTo(f.pos, this.S.x, this.S.z);
    f.goal = null;
    this.mateAt = 'lead';
    this.rocks.forEach((r) => r.m.removeFromParent());
    this.rocks = [];
    this.haloFall?.o.removeFromParent();
    this.haloFall = null;
    this.shake = 0;
    const Tw = g.world.tower;
    if (Tw) {
      Tw.setSky('hidden');
      Tw.skyOpenK = 0;
    }
    // la tormenta de arriba se va: sin lluvia y sin lo colorado del Infierno
    const W = g.weather;
    W?.set?.('clear', false);
    if (W?.cur) {
      W.cur.rain = 0;
      W.cur.storm = 0;
      W.cur.blood = 0;
    }
    // el sol, abajo del horizonte todavía
    this.sunHalo.visible = true;
    this.sunCore.visible = true;
    this.dawn = 0;
    g.fx.sparkle(tmpV.copy(this.S).setY(y + 1), [0.6, 0.8, 1], 60, 1.6);
    g.fx.flash(tmpV.copy(this.S).setY(y + 1.4), 0x7ab8ff, 60, 0.6, 12);
    this.later(0.25, () => this.flashEl.classList.remove('is-on'));
    try {
      const A = g.audio;
      this.windOut = A.out({ gain: 0.8, reverb: 0.3 });
      A.noise(this.windOut, { t: A.now, dur: 60, type: 'bandpass', freq: 420, q: 0.6, gain: 0.2, attack: 0.5, brown: true });
      this.bedOut?.gain?.setTargetAtTime?.(0, A.now, 0.4);
    } catch {
      /* */
    }
  }

  chiquiIn() {
    const C = this.chiq;
    const o = C.root;
    o.visible = true;
    o.position.copy(CHIQUI);
    o.rotation.y = Math.atan2(TOWER.cx - CHIQUI.x, TOWER.cz - CHIQUI.z);
    C.head.rotation.set(0, 0, 0);
    C.eyeK = 1;
    this.chiqui = { t: 0, steps: 0, stop: null, stage: 0, headTo: null };
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
      // (con el cuerpo de verdad, paso parejo mirando adelante: el clip de
      // caminar ya tiene su paso y el tironeo de las piezas lo hacía bailar)
      const face = o.rotation.y;
      const v = C.skin ? 0.2 : 0.34 * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.5)));
      o.position.x += Math.sin(face) * dt * v;
      o.position.z += Math.cos(face) * dt * v;
      o.position.y = groundY(o.position.x, o.position.z) + (C.skin ? 0 : Math.abs(Math.sin(t * 5.5)) * 0.03);
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
    // da vuelta la cabeza (el cuerpo no) hasta mirarte por arriba del hombro;
    // con el cuerpo de verdad se da vuelta entero (la cabeza sola, media vuelta, quedaba rara)
    if (t > CHIQ.turn && S.stage < 2) {
      if (S.headTo === null) {
        let a = Math.atan2(cam.x - o.position.x, cam.z - o.position.z) - o.rotation.y;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        S.headTo = a;
        S.yaw0 = o.rotation.y;
      }
      const k = smooth(clamp01((t - CHIQ.turn) / 1.3));
      if (C.skin) o.rotation.y = S.yaw0 + S.headTo * k;
      else C.head.rotation.y = S.headTo * k;
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
      this.hop(0, 0.72);
      this.shake = Math.max(this.shake, 0.25);
    }
    // negro de golpe, pegado a la cara, y silencio total (después del negro
    // sale el "Continuará...", callado)
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

  // ---------------- dónde está cada cosa ----------------
  // La cabeza de Francisco (la del cuerpo del jefe; si ya no está, donde estaba).
  franHead(out) {
    const z = this.franZ;
    if (z?.mats) return out.setFromMatrixPosition(z.mats[2]);
    return out.copy(this.F).setY(this.F.y + 1.25);
  }

  // Entre las dos manos (mats: las del esqueleto), un poco más abajo: ahí va
  // el mate (el cuerpo queda entre las palmas).
  handsAt(mats, out) {
    tmpA.copy(HAND).applyMatrix4(mats[5]);
    tmpB.copy(HAND).applyMatrix4(mats[6]);
    return out.addVectors(tmpA, tmpB).multiplyScalar(0.5).setY((tmpA.y + tmpB.y) * 0.5 - MATE_H * 0.45);
  }

  // Lo mismo con el cuerpo de verdad de Francisco (si se ve): el medio de las
  // palmas (un poco más allá de las muñecas). null si no está.
  skinHands(out) {
    const Z = this.g.zombies;
    const a = skinBoneAt(Z, 'LeftHand', tmpA);
    const b = skinBoneAt(Z, 'RightHand', tmpB);
    const fa = skinBoneAt(Z, 'LeftForeArm', tmpC);
    const fb = skinBoneAt(Z, 'RightForeArm', tmpD);
    if (!a || !b || !fa || !fb) return null;
    a.lerp(fa, -0.3);
    b.lerp(fb, -0.3);
    return out.addVectors(a, b).multiplyScalar(0.5).setY((a.y + b.y) * 0.5 - MATE_H * 0.3);
  }

  groupCenter(out) {
    out.set(0, 0, 0);
    for (const r of this.gauchos) out.add(r.pos);
    return out.multiplyScalar(1 / this.gauchos.length);
  }

  // ---------------- las tomas ----------------
  // tmpV: dónde está la cámara; tmpW: adónde mira.
  shot(dur, fn, fov = this.fov0) {
    this.cam = { t0: this.t, dur, fn };
    this.setFov(fov);
  }

  // A ras de la lava: el mate tirado y, atrás, Francisco.
  shotMate() {
    const F = this.F;
    const y = this.A.y;
    this.shot(4.6, (u) => {
      const e = smooth(u);
      tmpV.set(F.x + 1.05 - e * 0.3, y + 0.32 + e * 0.12, F.z + 3.3 - e * 0.45);
      tmpW.copy(this.mate.position).lerp(this.franHead(tmpU), 0.35 + smooth(clamp01((u - 0.4) / 0.6)) * 0.45);
    }, 42);
  }

  // Por encima del hombro de Francisco: los gauchos salen del vapor.
  shotOver() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5.6, (u) => {
      const e = smooth(u);
      tmpV.set(F.x - 1.15 + e * 0.25, y + 1.9 - e * 0.15, F.z - 1.7 + e * 0.2);
      tmpW.set(F.x + 0.2, y + 1.05, F.z + 4.6 - e * 1.4);
    }, 50);
  }

  // Su cara, de cerca: los ojos, la aureola que se quiebra.
  shotFace() {
    const F = this.F;
    this.shot(6.8, (u) => {
      const e = smooth(u);
      const h = this.franHead(tmpU);
      tmpV.set(F.x + 0.55 - e * 0.1, h.y + 0.05 + e * 0.05, F.z + 1.55 - e * 0.25);
      tmpW.copy(h).setY(h.y + 0.04);
      // (se le cae la aureola: la cámara la acompaña un poco y vuelve a él)
      if (this.freeT != null && this.haloAt) {
        const f = this.t - this.freeT;
        const k = smooth(clamp01(f / 0.4)) * (1 - smooth(clamp01((f - 0.9) / 0.7)));
        tmpW.lerp(this.haloAt, k * 0.3);
      }
    }, 36);
  }

  // Libre: de rodillas, derecho, y los pedazos de la aureola en el piso.
  shotFree() {
    const F = this.F;
    const y = this.A.y;
    this.shot(6, (u) => {
      tmpV.set(F.x - 1.05 + u * 0.15, y + 0.95 + u * 0.05, F.z + 2.05 - u * 0.2);
      tmpW.set(F.x - 0.05, y + 0.92, F.z);
    }, 42);
  }

  // Los dos lados: Francisco hablando y los gauchos escuchando.
  shotTwo() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5, (u) => {
      tmpV.set(F.x + 3.6 - u * 0.3, y + 1.35, F.z + 1.5 + u * 0.1);
      tmpW.set(F.x - 0.1, y + 1.0, F.z + 1.5);
    }, 50);
  }

  // Por encima de su hombro: las caras de los gauchos.
  shotReverse() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5.2, (u) => {
      tmpV.set(F.x + 0.6, y + 1.38, F.z - 0.55 - u * 0.1);
      tmpW.set(F.x - 0.25, y + 1.45, F.z + 3.3);
    }, 44);
  }

  // Mira el mate: el mate abajo, su cara arriba.
  shotLook() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5.6, (u) => {
      const e = smooth(u);
      tmpV.set(F.x - 1.9 + e * 0.2, y + 0.85, F.z + 2 - e * 0.15);
      tmpW.copy(this.mate.position).lerp(this.franHead(tmpU), 0.6);
    }, 46);
  }

  // Bajo, entre Francisco y ellos: los gauchos se agachan y miran la bóveda,
  // que se viene abajo detrás.
  shotQuake() {
    const F = this.F;
    const y = this.A.y;
    this.shot(6, (u) => {
      tmpV.set(F.x + 0.9 - u * 0.2, y + 0.45, F.z + 1.2);
      tmpW.set(F.x - 0.35, y + 1.5 + smooth(u) * 1.2, F.z + 3.8);
    }, 60);
  }

  // De perfil, cerca: lo levanta con las dos manos.
  shotPick() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5.2, (u) => {
      const e = smooth(u);
      tmpV.set(F.x + 2.5 - e * 0.2, y + 0.95 + e * 0.2, F.z + 1.35);
      tmpW.set(F.x, y + 0.7 + e * 0.25, F.z + 0.35).lerp(this.mate.position, 0.35);
    }, 46);
  }

  // De perfil, entre los dos: pasa de sus manos a las del gaucho.
  shotHand() {
    const F = this.F;
    const y = this.A.y;
    this.shot(5, (u) => {
      const e = smooth(u);
      tmpV.set(F.x - 2.6 + e * 0.3, y + 1.2, F.z + 0.95 + e * 0.1);
      tmpW.set(F.x, y + 1.0, F.z + 0.85);
    }, 46);
  }

  // Se deshace: la cámara sube con el polvo de oro hasta la bóveda.
  shotAscend() {
    const F = this.F;
    const y = this.A.y;
    this.shot(6.6, (u) => {
      const up = smooth(clamp01((u - 0.5) / 0.5));
      tmpV.set(F.x + 2 - u * 0.3, y + 1 + up * 0.5, F.z + 2.3 - u * 0.2);
      tmpW.set(F.x, y + 1 + up * 1.6, F.z);
    }, 48);
  }

  // Fierro aparece donde estaba Francisco (del sudoeste: los gauchos quedan afuera).
  shotFierro() {
    const f = this.fierro.pos;
    this.shot(4.2, (u) => {
      tmpV.set(f.x - 1.6 + u * 0.12, f.y + 1.55, f.z + 1.4 - u * 0.1);
      tmpW.set(f.x, f.y + 1.3, f.z);
    }, 46);
  }

  // Detrás de Fierro: los cuatro y el mate.
  shotFierroGroup() {
    const f = this.fierro.pos;
    const c = this.groupCenter(new THREE.Vector3());
    this.shot(11, (u) => {
      const e = smooth(u);
      tmpV.set(f.x - 1.1 - e * 0.3, f.y + 1.75, f.z - 1.5 + e * 0.2);
      tmpW.set(c.x, f.y + 1.1, c.z);
    }, 48);
  }

  // Alrededor de todos, subiendo, mientras gira el remolino.
  shotPortal() {
    const c = this.portalC;
    this.shot(3.6, (u) => {
      const a = 0.6 + u * 1.5;
      const r = 6 - u * 1.8;
      tmpV.set(c.x + Math.sin(a) * r, c.y + 3.6 + u * 3, c.z + Math.cos(a) * r);
      tmpW.set(c.x, c.y + 1, c.z);
    }, 54);
  }

  // En la cima, todavía en la tormenta: bajo, y la cámara sube.
  shotArrive() {
    const S = this.S;
    this.shot(5, (u) => {
      const e = smooth(u);
      tmpV.set(S.x - 4.4 - e * 0.8, S.y + 0.6 + e * 1.6, S.z + 3.6 + e * 1.2);
      tmpW.set(S.x + 0.5, S.y + 1.15 + e * 0.4, S.z);
    }, 52);
  }

  // Grúa grande alrededor de la cima: el remolino se deshace y aparece el llano.
  shotCalm() {
    const T = TOWER;
    const c = new THREE.Vector3(T.cx + 2, this.top, T.cz);
    this.shot(10, (u) => {
      const e = smooth(u);
      const a = -2.25 + e * 0.9;
      const r = 17 + e * 9;
      tmpV.set(c.x + Math.cos(a) * r, c.y + 4 + e * 10, c.z + Math.sin(a) * r);
      tmpW.set(c.x + 2, c.y + 1 - e * 3, c.z);
    }, 56);
  }

  // Detrás de ellos, contra el sol: van hasta las almenas y levantan el mate.
  shotDawn() {
    const S = this.S;
    this.shot(7.4, (u) => {
      const e = smooth(u);
      tmpV.set(S.x - 3.3 + e * 1.6, S.y + 1.15 + e * 0.2, S.z - 0.9 + e * 0.35);
      tmpW.set(S.x + 12, S.y + 2.4 + e * 0.6, S.z + 0.8);
    }, 50);
  }

  // Fierro solo, con el llano atrás (de ahí va a venir).
  shotFierroTop() {
    const f = this.fierro.pos;
    this.shot(10, (u) => {
      tmpV.set(f.x + 0.45 - u * 0.1, f.y + 1.45, f.z + 2.9 - u * 0.25);
      tmpW.set(f.x - 0.45, f.y + 1.35, f.z);
    }, 42);
  }

  // Por encima del hombro de Fierro: los cuatro en las almenas, contra el sol.
  shotTopReverse() {
    const f = this.fierro.pos;
    const c = this.groupCenter(new THREE.Vector3());
    this.shot(6, (u) => {
      tmpV.set(f.x - 1.3, f.y + 1.72, f.z - 0.5 + u * 0.1);
      tmpW.set(c.x, c.y + 1.2, c.z);
    }, 44);
  }

  // Fierro solo, de cerca, dándose vuelta para el llano (ellos, atrás, al sol).
  shotSecret() {
    const f = this.fierro.pos;
    this.shot(6.4, (u) => {
      tmpV.set(f.x + 0.9 - u * 0.08, f.y + 1.6, f.z - 1.5 + u * 0.1);
      tmpW.set(f.x + 0.2, f.y + 1.45, f.z + 1.5);
    }, 40);
  }

  // El llano: desde afuera de las almenas del norte (desde el medio de la
  // cima no se ve el piso de abajo) la cámara se acerca de golpe (zoom) a la
  // explanada: algo chiquito en el medio de la ronda de apachetas. Corta a ras
  // del piso, detrás de él, con la torre enorme adelante. Cuando da vuelta la
  // cabeza la cámara lo busca, y lo sigue en cada salto hasta tenerlo encima.
  shotHorizon() {
    const from = new THREE.Vector3(TOWER.cx - 1, this.top + 2.6, TOWER.z0 - 2.5);
    const low = new THREE.Vector3(CHIQUI.x + 1.3, CHIQUI.y + 0.5, CHIQUI.z - 2.6);
    const look = new THREE.Vector3();
    this.shot(CHIQ.end, (u, t) => {
      const o = this.chiq.root;
      if (t < CHIQ.cut) {
        tmpV.copy(from);
        tmpW.set(CHIQUI.x, CHIQUI.y + 0.6, CHIQUI.z);
        const z = smooth(clamp01((t - 0.9) / 2));
        this.setFov(this.fov0 + (11 - this.fov0) * z);
        if (z > 0 && z < 1) tmpV.y += Math.sin(t * 40) * 0.004;
        return;
      }
      this.setFov(46);
      const k = Math.min(t, CHIQ.stop) - CHIQ.cut;
      tmpV.set(low.x - k * 0.04, low.y, low.z + k * 0.16);
      tmpW.set(TOWER.cx + 1.5, 7 + k * 1.2, TOWER.cz);
      if (o.visible || t > CHIQ.glitch) look.copy(o.position).setY(o.position.y + 0.8);
      tmpW.lerp(look, smooth(clamp01((t - CHIQ.turn) / 1.4)));
    });
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
    if (!this.atTop) {
      // abajo la tormenta se oye (ahogada) y se cuela su luz
      if (Math.random() < dt * 0.16) this.rumble(0.6);
      g.arena?.ambient?.(dt);
    } else this.updateTop(dt);
    this.updateWalkers(dt);
    this.updateFran(dt);
    // el cuerpo del jefe se arma con los muertos
    if (this.franZ) g.zombies.render();
    this.updateFierro(dt);
    this.people.update(dt);
    this.updateMate(dt);
    this.updateHalo(dt);
    this.updateRocks(dt);
    this.updateChiqui(dt);
    // la cámara de la toma, con el temblor encima (nunca abajo del piso)
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      if (!this.chiqui) tmpV.y = Math.max(tmpV.y, (this.atTop ? this.top : this.A.y) + 0.25);
      this.shake = Math.max(0, this.shake - dt * 0.5);
      const s = this.shake * 0.07;
      cam.position.set(tmpV.x + rnd() * s, tmpV.y + rnd() * s, tmpV.z + rnd() * s);
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
    // el oído va con la cámara (si no, todo se oye desde donde terminó la pelea)
    g.audio.setListener(cam.position, tmpU.set(0, 0, -1).applyQuaternion(cam.quaternion));
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
    g.weather?.update?.(dt);
    // (el clima pisa la niebla: en la cima se la vuelve a levantar)
    if (this.atTop && g.scene.fog && this.fogD) g.scene.fog.density = this.fogD;
  }

  // Los que caminan (los gauchos y Fierro) y adónde miran los que no.
  updateWalkers(dt) {
    const t = this.t;
    const list = this.fierroOn ? [...this.gauchos, this.fierro] : this.gauchos;
    for (const r of list) {
      if (r.goal && t >= r.walkT) {
        tmpU.subVectors(r.goal, r.pos).setY(0);
        const d = tmpU.length();
        if (d < 0.04) {
          r.goal = null;
          r.moving = false;
          r.speed = 0;
        } else {
          const step = Math.min(d, r.walk * dt * (d < 0.4 ? 0.6 : 1));
          r.pos.addScaledVector(tmpU, step / d);
          r.moving = true;
          r.speed = r.walk;
          r.yaw = angTo(r.yaw, faceTo(r.pos, r.goal.x, r.goal.z), Math.min(1, dt * 8));
          continue;
        }
      }
      if (r === this.fierro) continue;
      // mirando al que habla (o al sol, o adonde caen las piedras)
      const L = this.look;
      if (L) r.yaw = angTo(r.yaw, faceTo(r.pos, L.x, L.z), Math.min(1, dt * 3));
      let want = 0.05;
      if (this.lookUp) want = r.crouch ? -1.25 : -0.8;
      else if (L === this.F) want = 0.28;
      else if (L === this.sunAt) want = -0.12;
      if (r.arms === 'raise') want = -0.5;
      r.headP += (want - r.headP) * Math.min(1, dt * 3);
    }
  }

  // Francisco: la pose de rodillas (va de una a otra de a poco), las grietas
  // de oro que laten y, al final, se deshace.
  updateFran(dt) {
    const z = this.franZ;
    if (!z) return;
    const g = this.g;
    const t = this.t;
    const want = FP[this.fp];
    const K = this.fk;
    const rate = this.fp === 'fight' ? 4 : this.fp === 'reach' || this.fp === 'offer' ? 3 : 2.2;
    for (const key of Object.keys(want)) K[key] += (want[key] - K[key]) * Math.min(1, dt * rate);
    const P = z.P;
    Object.assign(P, K);
    P.rootY = 0;
    P.rootPitch = 0;
    P.rootRoll = 0;
    P.torsoY = 0;
    P.torsoR = 0;
    P.headY = 0;
    P.headR = 0;
    P.hipLp = 0.05;
    P.hipRp = -0.05;
    P.hipLr = 0;
    P.hipRr = 0;
    P.knL = 1.55;
    P.knR = 1.6;
    // respira cansado (y tiembla mientras pelea con lo de adentro)
    P.torsoP += Math.sin(t * 2.1) * 0.025;
    if (this.fp === 'talk') P.elR += Math.sin(t * 2.6) * 0.18;
    if (this.possT != null) for (const k of ['torsoP', 'headP', 'headY', 'shLr', 'shRr', 'torsoR']) P[k] += rnd() * 0.12;
    // las grietas: oro que late; coloradas mientras pelea; al irse, oro fuerte
    const mats = this.franMats();
    let glow = 0.05 + Math.max(0, Math.sin(t * 2.4)) * 0.12;
    let col = 0xffa020;
    if (this.possT != null) {
      col = 0xff2a10;
      glow = 0.35 + Math.random() * 0.35;
    } else if (this.freeT != null && this.ascT == null) glow *= Math.max(0.25, 1 - (t - this.freeT) / 2);
    if (this.ascT != null) glow = 0.08 + smooth(clamp01((t - this.ascT) / 2.2)) * 0.8;
    for (const m of mats) {
      if (!m.emissive) continue;
      m.emissive.set(col);
      m.emissiveIntensity = glow;
    }
    // los ojos: dorados; peleando, destellos colorados (el ojo de la Voz)
    const eye = g.zombies.bossRig.eyeMat;
    if (this.possT != null) {
      const u = t - this.possT;
      const on = u > 0.2 && (u % 0.85 < 0.45 || u > 2.3);
      eye.color.set(on ? 0xff2010 : 0x000000).multiplyScalar(on ? 4 : 1);
      if (!on) eye.color.copy(this.eyeGold);
    }
    // la chispa colorada que se le escapó: sube derecho hasta la bóveda
    if (this.wisp) {
      const u = t - this.wispT;
      this.wisp.y += dt * (2 + u * 6);
      g.fx.add.spawn(this.wisp.x + rnd() * 0.04, this.wisp.y, this.wisp.z + rnd() * 0.04, 0, 0.4, 0, { color: [1, 0.12, 0.05], size: 0.07, size1: 0, life: 0.35 });
      if (this.wisp.y > this.A.y + 12) this.wisp = null;
    }
    if (this.ascT != null) this.crumble(t - this.ascT, dt);
  }

  // Se deshace en polvo de oro de los pies a la cabeza; del pecho sube el alma.
  crumble(u, dt) {
    const g = this.g;
    const z = this.franZ;
    const R = g.zombies.bossRig;
    const T0 = 2.4;
    const GAP = 0.34;
    // chispas de oro de todo el cuerpo (cada vez más)
    const k = smooth(clamp01(u / T0));
    for (let i = 0; i < 18; i++) {
      if (Math.random() > dt * 30 * k) continue;
      const j = Math.floor(Math.random() * 13);
      if (!R.parts[j]?.visible) continue;
      tmpV.setFromMatrixPosition(z.mats[j]);
      g.fx.add.spawn(tmpV.x + rnd() * 0.2, tmpV.y + rnd() * 0.2, tmpV.z + rnd() * 0.2, rnd() * 0.3, 0.2 + Math.random() * 0.4, rnd() * 0.3, { color: GOLDS[i % 3], size: 0.06 + Math.random() * 0.04, size1: 0, life: 1.4 + Math.random(), gravity: -(1.5 + Math.random() * 1.5), drag: 0.4 });
    }
    // pieza por pieza
    while (this.crumbled < CRUMBLE.length && u >= T0 + this.crumbled * GAP) {
      const list = CRUMBLE[this.crumbled++];
      for (const i of list) {
        const p = R.parts[i];
        if (!p) continue;
        p.visible = false;
        if (i > 12) continue;
        tmpV.setFromMatrixPosition(z.mats[i]);
        for (let n = 0; n < 14; n++) {
          g.fx.add.spawn(tmpV.x + rnd() * 0.25, tmpV.y + rnd() * 0.25, tmpV.z + rnd() * 0.25, rnd() * 0.6, 0.3 + Math.random() * 0.8, rnd() * 0.6, { color: GOLDS[n % 3], size: 0.08 + Math.random() * 0.05, size1: 0, life: 1.6 + Math.random() * 1.2, gravity: -(1.2 + Math.random() * 2), drag: 0.35 });
        }
        g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, 0, 0.1, 0, { color: [1, 0.95, 0.8], size: 0.45, size1: 0.1, life: 0.35, drag: 4 });
      }
      if (this.crumbled === CRUMBLE.length) {
        // la aureola de la cabeza se va con él
        if (this.halo) this.halo.visible = false;
        const h = this.franHead(tmpA);
        g.fx.flash(tmpV.copy(h), 0xffc050, 90, 0.7, 14);
        g.post?.flash(0.35);
        for (let n = 0; n < 24; n++) g.fx.add.spawn(h.x + rnd() * 0.15, h.y, h.z + rnd() * 0.15, rnd() * 0.3, 3 + Math.random() * 4, rnd() * 0.3, { color: [1, 0.97, 0.88], size: 0.12, size1: 0.02, life: 1 + Math.random() * 0.6, gravity: -2, drag: 0.4 });
        this.later(0.05, () => this.dropFran());
      }
    }
  }

  // Se va Francisco (se deshizo, o la escena ya no pasa en la caverna).
  dropFran() {
    const Z = this.g.zombies;
    if (this.franZ && Z.boss === this.franZ) Z.removeBoss();
    this.franZ = null;
    for (const m of this.franMats()) if (m.emissive) m.emissiveIntensity = 0;
  }

  updateFierro(dt) {
    const f = this.fierro;
    f.arm += (f.armTo - f.arm) * Math.min(1, dt * 3);
    if (!this.fierroOn) return;
    const t = this.t;
    this.fierroLight.intensity = 3;
    this.fierroLight.position.set(f.pos.x, f.pos.y + 2.7, f.pos.z + 0.6);
    if (Math.random() < 0.12) this.g.fx.sparkle(tmpW.set(f.pos.x, f.pos.y + 0.6 + Math.random() * 1.2, f.pos.z), [0.6, 0.8, 1], 1, 0.6);
    // mira a los gauchos (en el secreto, solo, para el llano: de ahí viene)
    if (!f.goal) {
      const c = f.north ? tmpU.set(f.pos.x - 2, 0, f.pos.z - 10) : this.groupCenter(tmpU);
      f.yaw = angTo(f.yaw, faceTo(f.pos, c.x, c.z), Math.min(1, dt * (f.north ? 1.2 : 2)));
    }
    // el remolino azul
    if (this.portalT != null) {
      this.portalT += dt;
      const c = this.portalC;
      for (let i = 0; i < 14; i++) {
        const a = t * 4 + (i / 14) * Math.PI * 2;
        const r = 3.6 - Math.min(2.3, this.portalT * 0.75);
        this.g.fx.sparkle(tmpV.set(c.x + Math.cos(a) * r, c.y + 0.2 + ((t * 2 + i * 0.37) % 3.2), c.z + Math.sin(a) * r), [0.6, 0.8, 1], 1, 0.12);
      }
      if (Math.random() < dt * 20) this.g.fx.add.spawn(c.x + rnd() * 5, c.y + 0.1, c.z + rnd() * 5, 0, 2 + Math.random() * 3, 0, { color: [0.55, 0.75, 1], size: 0.09, size1: 0, life: 1.2, gravity: -1 });
    }
  }

  // El mate supremo: tirado, en las manos de Francisco, pasando, en las del gaucho.
  updateMate(dt) {
    const m = this.mate;
    const t = this.t;
    const g = this.g;
    let speed = 1;
    if (this.mateAt === 'fran' && this.franZ) {
      // (con el cuerpo de verdad, entre sus manos: entities/bossSkin.js)
      if (!this.skinHands(tmpV)) this.handsAt(this.franZ.mats, tmpV);
      const k = smooth(clamp01((t - this.mateUpT) / 0.6));
      m.position.lerp(tmpV, k < 1 ? 0.35 : 1);
      m.quaternion.slerpQuaternions(this.mateQ0, tmpQ.setFromAxisAngle(tmpU.set(0, 1, 0), 0), k);
      speed = 2;
    } else if (this.mateAt === 'pass') {
      const k = smooth(clamp01((t - this.passT) / 1.1));
      this.handsAt(this.lead.a.mats, tmpV);
      m.position.lerpVectors(this.passFrom, tmpV, k);
      m.position.y += Math.sin(k * Math.PI) * 0.12;
      speed = 3;
      if (k >= 1) {
        this.mateAt = 'lead';
        this.lead.arms = 'hold';
        g.fx.sparkle(m.position, [1, 0.85, 0.4], 30, 0.4);
      }
    } else if (this.mateAt === 'lead') {
      this.handsAt(this.lead.a.mats, m.position);
      m.quaternion.setFromAxisAngle(tmpU.set(0, 1, 0), this.lead.yaw + Math.PI);
    }
    if (this.mateAt !== 'floor') m.position.y = Math.max(m.position.y, (this.atTop ? this.top : this.A.y) + 0.02);
    // al sol: los anillos y el brillo se encienden un momento
    const flare = this.flareT != null ? Math.max(0, 1 - Math.abs(t - this.flareT - 0.8) / 1.6) : 0;
    // (de cerca, con el brillo del postproceso, el mate y su luz quemaban todo
    // de blanco: poquito de los dos, y menos cuanto más cerca está la cámara)
    const near = clamp01((m.position.distanceTo(g.camera.position) - 0.8) / 3);
    this.mateGlow.material.opacity = (0.22 + Math.sin(t * 3) * 0.06) * (0.4 + near * 0.6) * (1 + flare * 2);
    glowFront(this.mateGlow, m, g.camera.position, 0.5 + flare * 1.2, 0.4);
    animateSupremoDisplay(this.sup, dt, g.time, { speed: speed + flare * 2, open: flare });
    this.mateLight.intensity = (this.mateAt === 'floor' ? 0.7 : 1) + flare * 4;
    this.mateLight.position.copy(m.position).setY(m.position.y + 0.35);
    if (Math.random() < 0.25 + flare) g.fx.sparkle(tmpV.copy(m.position).setY(m.position.y + MATE_H * 0.5), [1, 0.85, 0.4], 1, 0.2);
  }

  // La aureola quebrada: cae dando vueltas y se hace pedazos contra el piso.
  updateHalo(dt) {
    const H = this.haloFall;
    if (!H) return;
    const o = H.o;
    H.v.y -= 6 * dt;
    o.position.addScaledVector(H.v, dt);
    this.haloAt.copy(o.position);
    o.rotation.x += H.spin.x * dt;
    o.rotation.y += H.spin.y * dt;
    o.rotation.z += H.spin.z * dt;
    if (o.position.y > this.A.y + 0.05) return;
    const g = this.g;
    o.position.y = this.A.y + 0.05;
    this.haloFall = null;
    o.removeFromParent();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      g.fx.add.spawn(o.position.x, o.position.y + 0.05, o.position.z, Math.cos(a) * (1 + Math.random() * 1.5), 1 + Math.random() * 1.5, Math.sin(a) * (1 + Math.random() * 1.5), { color: GOLDS[i % 3], size: 0.06, size1: 0, life: 0.6 + Math.random() * 0.4, gravity: 7, bounce: 0.3 });
    }
    g.fx.flash(tmpV.copy(o.position).setY(o.position.y + 0.3), 0xffd070, 20, 0.3, 5);
    try {
      const A = g.audio;
      const out = A.out({ pos: o.position.clone(), gain: 1, reverb: 0.5 });
      A.noise(out, { t: A.now, dur: 0.35, type: 'highpass', freq: 2600, gain: 0.5 });
      for (const f of [1980, 2640, 3350]) A.tone(out, { t: A.now + Math.random() * 0.05, dur: 0.5, type: 'triangle', freq: f, gain: 0.05, attack: 0.002 });
    } catch {
      /* */
    }
  }

  updateRocks(dt) {
    const g = this.g;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.v += 22 * dt;
      r.m.position.y -= r.v * dt;
      if (r.m.position.y < this.A.y + 0.4) {
        g.fx.dust(tmpV.set(r.m.position.x, this.A.y + 0.1, r.m.position.z), { x: 0, y: 1, z: 0 }, [0.4, 0.28, 0.22], 14);
        g.fx.explosion(tmpV.set(r.m.position.x, this.A.y + 0.3, r.m.position.z), 0.9, [1, 0.5, 0.2]);
        g.audio.explosion(r.m.position, 0.4);
        this.shake = Math.max(this.shake, 0.3);
        r.m.removeFromParent();
        this.rocks.splice(i, 1);
      }
    }
  }

  // Lo de la cima: el remolino se apaga de a poco, la tormenta se abre y amanece.
  updateTop(dt) {
    const g = this.g;
    const T = g.world.tower;
    this.calm = Math.min(1, (this.calm || 0) + dt / 16);
    const k = smooth(this.calm);
    if (T) {
      for (const m of T.vortex || []) {
        const U = m.material.uniforms;
        U.uAlpha.value *= Math.max(0, 1 - dt * 0.3);
        U.uSpeed.value *= Math.max(0, 1 - dt * 0.25);
      }
      if (T.debris) T.debris.visible = k < 0.7;
      if (T.storm) T.storm.scale.setScalar(Math.max(0.001, 1 - k * 0.97));
      if (T.eye) T.eye.visible = false;
    }
    // amanece: el cielo, la luz de la luna que pasa a ser la del sol y el sol
    this.dawn = Math.min(1, (this.dawn || 0) + dt / 20);
    const d = smooth(this.dawn);
    const W = g.world;
    W.daylight = W.dayCur = d * 0.62;
    const sky = W.sky?.material?.uniforms;
    if (sky?.uDay) sky.uDay.value = W.dayCur;
    const c = tmpU.set(TOWER.cx, this.top, TOWER.cz);
    const sy = -0.05 + d * 0.16;
    tmpV.copy(SUN).setY(sy).normalize();
    this.sunCore.position.copy(c).addScaledVector(tmpV, 170);
    this.sunHalo.position.copy(this.sunCore.position);
    // (se ve cuando el remolino ya no lo tapa)
    this.sunCore.material.opacity = clamp01((this.calm - 0.2) * 2.5);
    this.sunHalo.material.opacity = clamp01((this.calm - 0.1) * 2) * (0.18 + d * 0.22);
    if (this.sunAt) this.sunAt.copy(this.sunCore.position);
    const moon = W.moon;
    if (moon && this.moon0) {
      moon.color.set(0x9fb4ff).lerp(tmpW.set(1, 0.78, 0.55), d);
      moon.intensity = this.moon0.i * (0.8 + d * 0.6);
      moon.position.copy(moon.target.position).addScaledVector(tmpV.setY(Math.max(0.25, sy + 0.2)).normalize(), 60);
      this.shadowT = (this.shadowT || 0) - dt;
      if (this.shadowT <= 0) {
        this.shadowT = 0.5;
        g.renderer.shadowMap.needsUpdate = true;
      }
    }
    // el viento se apaga con el remolino
    if (this.windOut?.gain) this.windOut.gain.value = 0.8 * (1 - k * 0.8);
    // la niebla del remolino se levanta: se ve el llano (y mucho más mientras
    // dura la toma del Chiquitijuein)
    this.fogD = this.chiqui ? 0.005 : 0.034 + (0.012 - 0.034) * k;
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
    // (vuelve el sonido que se cortó en el negro del final)
    if (this.master0 != null) {
      const au = g.audio;
      au.master.gain.cancelScheduledValues(au.ctx.currentTime);
      au.master.gain.value = this.master0;
      this.master0 = null;
    }
    try {
      this.bedOut?.disconnect();
      this.windOut?.disconnect();
    } catch {
      /* ya estaban sueltas */
    }
    this.el.remove();
    if (this.fov0) this.setFov(this.fov0);
    this.dropFran();
    // el cuerpo de los jefes vuelve a como estaba (las piezas, la aureola, los ojos)
    const Z = g.zombies;
    for (const p of Z.bossRig?.parts || []) if (p) p.visible = true;
    Z.dressBoss?.('francisco');
    this.people?.dispose();
    this.root?.removeFromParent();
    this.root = null;
    if (this.mateLight) this.mateLight.intensity = 0;
    if (this.fierroLight) this.fierroLight.intensity = 0;
    const moon = g.world.moon;
    if (moon && this.moon0) {
      moon.color.setHex(this.moon0.c);
      moon.intensity = this.moon0.i;
      moon.position.copy(this.moon0.p);
      g.renderer.shadowMap.needsUpdate = true;
    }
    g.fx.clearAll?.();
    if (g.world.tower?.llano) g.world.tower.llano.caveOff = false;
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
