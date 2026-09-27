import * as THREE from 'three';
import CastleCine, { smooth, lerp, uprightMate } from './castleCine';
import Avatars from '../net/Avatars';
import { useMap } from '../config/map';
import { path } from './Intro';

// El final de todo (Der Mateendrache, el último mapa). Arranca en la isla del
// Éter, con el Chiquitijuein recién deshecho:
//  1. Silencio. Las sombras coloradas suben al cielo; el dragón se posa.
//  2. Aparece el ánima de Martín Fierro en una columna de luz.
//  3. Cuenta lo que viene: al Chiquitijuein no se lo mata, se esconde en la
//     memoria; el universo tiene que empezar de nuevo; van a olvidar todo y
//     vivir como leyendas que nadie conoce; él va a ser un recuerdo que todos
//     tienen y nadie entiende de dónde viene.
//  4. Los cuatro caballeros de la luz se dan vuelta: tienen los ponchos de
//     los jugadores. Siempre fueron ellos.
//  5. "Nosotros, los cuatro caballeros, nos alzaremos una vez más."
//  6. Una luz blanca se come la isla, los pedazos de los mundos y el cielo.
//  7. Y todo vuelve a empezar: el molino, de noche. Los cuatro duermen en el
//     patio al lado del fuego; Francisco llega de lo oscuro, se para arriba
//     de uno y se lo lleva arrastrando al galpón (la toma de la entrada).
//  8. Negro: lo que les dicen los cuatro caballeros, uno por uno, despacio.
//     El que habla aparece en su forma de caballero de la luz, solo en lo
//     oscuro; al final, los cuatro juntos. Fin.
// Es la cinemática de la victoria del castillo (Game.win): pasa con el juego
// terminado y la mueve sola. En línea la ve cada uno en su compu.

const tmpV = new THREE.Vector3();
const KNIGHT_GLOW = [0xff6a1a, 0x8affb8, 0xffe45a, 0x9adcff];

export default class CastleEnding extends CastleCine {
  constructor(root, game) {
    super(game, { drive: true, kind: 'castillo' });
    void root;
  }

  build() {
    const g = this.g;
    const arena = g.arena;
    const A = arena?.A || { x: -170, y: 140, z: 50, r: 22 };
    this.A = A;
    this.C = new THREE.Vector3(A.x, A.y, A.z);
    // lo de la pelea se va
    if (arena) {
      if (arena.knights) arena.knights.root.visible = false;
      if (arena.gnome) arena.gnome.root.visible = false;
      // (el coloso ya se deshizo al aparecer el de verdad; si no, se va igual)
      if (arena.col) {
        arena.col.dissolve = 1;
        arena.col.root.visible = false;
        if (arena.col.smoke) arena.col.smoke.visible = false;
      }
      for (const M of arena.marks || []) M.mesh?.removeFromParent();
      arena.marks = [];
      // (las grietas del caos: su borde quemado se veía a través de los cuerpos)
      if (arena.cracks) arena.cracks.visible = false;
      arena.chaosK = 0;
    }
    // el piso queda limpio para la escena: las quemaduras del dragón y la sangre
    // de la pelea (calcos transparentes) se dibujaban encima de los caballeros
    // y de Fierro, que son medio transparentes (como en el final del molino)
    for (const D of g.fx.decals || []) {
      D.used = 0;
      D.next = 0;
      D.mesh.count = 0;
    }
    for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // los muñecos: Fierro y los cuatro caballeros (con los ponchos de los jugadores)
    this.people = new Avatars(g, null);
    const F = { id: 9, name: 'Martín Fierro', pos: new THREE.Vector3(A.x, A.y - 60, A.z + 1.5), yaw: Math.PI, pitch: 0.1, speed: 0, moving: false };
    this.people.add(F);
    this.fierro = F;
    const fa = this.people.list.get(9);
    for (const m of Object.values(fa.M)) {
      m.transparent = true;
      m.opacity = 0;
      m.depthWrite = false;
      if (m.emissive) {
        m.emissive.set(0xffb060);
        m.emissiveIntensity = 0.5;
      }
    }
    fa.M.poncho.color.set(0x9a2a1a);
    this.fierroM = fa.M;
    this.knights = [0, 1, 2, 3].map((id, i) => {
      const x = A.x + [-4.6, -1.6, 1.6, 4.6][i];
      const z = A.z + [6.2, 7.4, 7.4, 6.2][i];
      const r = { id, name: '', noTag: true, pos: new THREE.Vector3(x, A.y, z), yaw: 0, pitch: 0.05, speed: 0, moving: false };
      this.people.add(r);
      const a = this.people.list.get(id);
      for (const m of Object.values(a.M)) {
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(KNIGHT_GLOW[i]);
          m.emissiveIntensity = 1.1;
        }
      }
      if (a.tag) a.tag.visible = false;
      // "nos alzaremos una vez más": el mate en alto
      r.poseFn = (P) => {
        const k = smooth(this.raise || 0);
        if (k <= 0) return;
        P.shRp = lerp(P.shRp, -2.85, k);
        P.elR = lerp(P.elR, -0.12, k);
      };
      return { r, M: a.M, glow: KNIGHT_GLOW[i] };
    });
    this.reveal = 0;
    this.fierroK = 0;
    // la columna de luz de Fierro
    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.6, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.pillar.position.set(A.x, A.y + 30, A.z + 1.5);
    this.root.add(this.pillar);
    // los ojitos colorados que se van al cielo (el recuerdo)
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      e.scale.setScalar(1.6);
      e.userData.s = s;
      this.root.add(e);
      return e;
    });
    // la luz blanca del final
    this.nova = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
    this.nova.position.copy(this.C).setY(A.y + 2);
    this.nova.visible = false;
    this.root.add(this.nova);
    // el dragón se posa atrás, mirando
    const D = g.ee?.dragonModel;
    this.D = D;
    if (D) {
      D.root.visible = true;
      D.root.position.set(A.x + 9, A.y + 18, A.z - 12);
      D.root.rotation.set(0, -2.4, 0);
      D.setPose('fly', 0.1);
      this.dragonLand = { t: 0, from: D.root.position.clone(), to: new THREE.Vector3(A.x + 9, A.y, A.z - 10) };
    }
    const C = this.C;
    const L = LINES;
    // la música de la escena va por su propio canal
    const au = g.audio;
    const bus = au.ctx ? au.out({ gain: 1, reverb: 0.6, bus: au.music }) : null;
    const choir = (t, notes, o) => bus && au.choir(bus, au.now + t, notes, o);
    const bell = (t, n, o) => bus && au.bell(bus, au.now + t, n, o);
    return [
      // 1. silencio: la isla de lejos, las sombras que suben
      [0, () => {
        choir(0.3, [45, 52, 57, 60], { dur: 9, gain: 0.05, attack: 3, release: 4 });
        this.shot(9, (u, lt, pos, look) => {
          const a = 2.2 + u * 0.7;
          pos.set(C.x + Math.cos(a) * lerp(34, 26, u), C.y + lerp(12, 7, u), C.z + Math.sin(a) * lerp(34, 26, u));
          look.set(C.x, C.y + 2, C.z);
        });
        return 8.5;
      }],
      // 2. aparece Fierro en la columna de luz
      [0, () => {
        this.fierroOn = true;
        this.shot(7, (u, lt, pos, look) => {
          pos.set(C.x + 0.5, C.y + 1.7, C.z + lerp(10, 6.5, smooth(u)));
          look.set(C.x, C.y + lerp(4, 1.6, smooth(Math.min(1, u * 1.6))), C.z + 1.5);
        });
        return 3.2;
      }],
      [0, () => this.say('fierro', L[0])],
      // 3. lo que viene
      [0.3, () => {
        this.shot(30, (u, lt, pos, look) => {
          pos.set(C.x + lerp(1.2, 0.5, u), C.y + 1.65, C.z + lerp(4.3, 3.4, u));
          look.set(C.x, C.y + 1.55, C.z + 1.5);
        });
        return this.say('fierro', L[1]);
      }],
      [0.3, () => {
        // el cielo: los pedazos de los mundos se van hacia el remolino
        this.pull = 0.001;
        this.shot(14, (u, lt, pos, look) => {
          pos.set(C.x - 3, C.y + 1.5, C.z + 8);
          look.set(C.x + lerp(-10, 10, u), C.y + lerp(20, 34, u), C.z - 40);
        });
        return this.say('fierro', L[2]);
      }],
      [0.3, () => {
        this.shot(14, (u, lt, pos, look) => {
          pos.set(C.x + lerp(-3, 3, u), C.y + 1.7, C.z + 10.5);
          look.set(C.x, C.y + 1.4, C.z + 2);
        });
        return this.say('fierro', L[3]);
      }],
      [0.3, () => {
        // el recuerdo: dos ojitos colorados que se pierden en el cielo
        this.memory = 0.001;
        this.shot(12, (u, lt, pos, look) => {
          pos.set(C.x, C.y + 1.6, C.z + 5);
          look.set(C.x, C.y + lerp(12, 40, smooth(u)), C.z - lerp(20, 80, smooth(u)));
        });
        return this.say('fierro', L[4]);
      }],
      // 4. los caballeros se dan vuelta: son ellos
      [0.4, () => {
        this.turn = 0.001;
        // (al costado de Fierro, afuera de su columna: por el medio se metía adentro de él)
        this.shot(14, (u, lt, pos, look) => {
          pos.set(C.x + lerp(-2.7, -2.1, u), C.y + 1.45, C.z + lerp(0.6, 1.3, u));
          look.set(C.x - 0.3, C.y + 1.3, C.z + 7);
        });
        return this.say('fierro', L[5]);
      }],
      [0.2, () => this.say('fierro', L[6])],
      // 5. todos juntos
      [0.3, () => {
        this.quiet();
        this.shot(9, (u, lt, pos, look) => {
          const a = 1.6 + u * 0.5;
          pos.set(C.x + Math.cos(a) * 12, C.y + lerp(3, 5, u), C.z + Math.sin(a) * 12);
          look.set(C.x, C.y + 1.4, C.z + 4);
        });
        choir(0, [45, 57, 61, 64, 69], { dur: 8, gain: 0.07, attack: 1.5, release: 3 });
        bell(0.6, 45, { gain: 0.2, dur: 6 });
        this.card(L[7], 7.5);
        this.later(1.2, () => (this.raise = 0.001));
        return 8.5;
      }],
      // 6. la luz blanca
      [0, () => {
        this.nova.visible = true;
        this.novaT = 0;
        this.shot(7, (u, lt, pos, look) => {
          pos.set(C.x, C.y + lerp(6, 40, smooth(u)), C.z + lerp(16, 30, u));
          look.set(C.x, C.y, C.z);
        });
        this.later(4.5, () => this.white(true));
        return 7.5;
      }],
      // 7. y todo vuelve a empezar
      [0, () => {
        this.card('Y todo vuelve a empezar...', 4);
        return 3.2;
      }],
      [0, () => this.toMolino()],
      // 8. negro: lo que les dicen los cuatro caballeros
      [0.2, () => this.knightsWord()],
      [0, () => {
        this.title('Fin');
        // (más abajo: el título grande lo pisaba)
        this.cardEl.style.top = '62%';
        this.card('Der Mateendrache · Gracias por jugar', 6);
        return 6.5;
      }],
    ];
  }

  // (el final va despacio: cada frase de Fierro queda un rato más para leerla)
  say(who, text) {
    return super.say(who, text) + 1.2;
  }

  // El molino, de noche, la entrada de siempre: cuatro gauchos que no se acuerdan de nada.
  toMolino() {
    const g = this.g;
    const stats = g.stats;
    this.cam = null;
    this.cleanup();
    // (la escena en curso no se tira: es esta)
    g.cine = null;
    g.mapId = 'molino';
    g.buildScene();
    g.cine = this;
    g.stats = stats;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.white(false);
    this.el.querySelectorAll('.mdu-fcine__bar').forEach((b) => {
      b.style.opacity = '0';
    });
    const I = g.intro;
    if (!I?.S) return 1;
    // no la entrada entera: los que duermen, Francisco que se lleva a uno y el arrastre
    const shots = I.S.ending?.();
    if (shots) {
      let t = 0;
      for (const s of shots) {
        s.t0 = t;
        t += s.d;
        if (s.cam && !s.camAt) s.camAt = path(s.cam);
        if (s.look && !s.lookAt) s.lookAt = path(s.look);
      }
      I.S.shots = shots;
      I.total = t;
      I.cues = (I.S.cues || []).slice().sort((a, b) => a[0] - b[0]);
    }
    I.play();
    this.intro = I;
    // a negro justo antes de que termine (si no, entre la entrada y el negro se ve el patio)
    this.later(Math.max(0, I.total - 0.35), () => {
      const f = this.el.querySelector('.mdu-fcine__fade');
      if (f) f.style.transition = 'opacity 0.3s';
      this.fade(true);
    });
    return I.total + 0.5;
  }

  // En negro, uno por uno, del color de cada uno: lo que les dejan los cuatro
  // caballeros (con su voz). El que habla aparece en su forma de caballero de
  // la luz, solo en lo oscuro, y levanta el mate despacio; al final, los
  // cuatro juntos. Cada frase queda 3 segundos más que antes para leerla.
  knightsWord() {
    const g = this.g;
    // (la entrada del molino ya terminó: this.intro queda, así tick no toca lo del castillo)
    this.fade(true);
    const fadeEl = this.el.querySelector('.mdu-fcine__fade');
    if (fadeEl) fadeEl.style.transition = `opacity ${WORD_FADE}s`;
    // (el cartel y el título van arriba del negro; el cartel, abajo del caballero)
    this.cardEl.style.zIndex = '3';
    this.titleEl.style.zIndex = '3';
    this.cardEl.style.top = '80%';
    // (lo que quedó de la entrada del molino: el cartel de saltar se veía arriba)
    for (const e of g.root.querySelectorAll('.mdu-intro')) e.remove();
    this.buildVoid();
    const au = g.audio;
    // la canción de los caballeros (core/music.js): sigue en la pantalla del
    // final; con ella el coro calla y las campanas bajan
    const scored = g.music?.play('cine-castillo-caballeros', { while: (G) => G.state === 'won' });
    const bus = au.ctx ? au.out({ gain: scored ? 0.55 : 1, reverb: 0.7, bus: au.music }) : null;
    let t = 1.2;
    for (const [i, text] of WORD) {
      // lo que tardaba antes (a la velocidad de la voz) y 3 segundos más para leerla
      const d = Math.max(3.6, text.length * 0.075) + 3;
      if (bus && !scored) this.later(t, () => au.choir(bus, au.now + 0.3, i >= 0 ? [45, 52, 57, [64, 60, 64, 69][i]] : [45, 52, 57, 61, 64], { dur: d + 3, gain: i >= 0 ? 0.03 : 0.045, attack: 2.5, release: 3 }));
      this.later(t, () => this.showKnight(i, d + WORD_FADE + 0.3));
      this.later(t + 0.3, () => {
        this.wordCard(i, text, d);
        if (bus) au.bell(bus, au.now, i >= 0 ? [57, 60, 64, 69][i] : 45, { gain: i >= 0 ? 0.06 : 0.14, dur: 4 });
        if (i >= 0) au.say(text, KNIGHT_VOICE[i], { cine: true });
      });
      // se apaga el caballero y queda un momento en negro antes del siguiente
      this.later(t + 0.3 + d, () => this.fade(true));
      t += 0.3 + d + WORD_FADE + 0.2;
    }
    this.later(t - 1, () => {
      this.cardEl.style.color = '';
      this.cam = null;
      this.hideVoid();
    });
    return t + 0.2;
  }

  // Se apaga el vacío y vuelve la niebla del molino.
  hideVoid() {
    const V = this.void;
    if (!V) return;
    V.root.visible = false;
    for (const K of V.knights) {
      K.on = false;
      K.k = 0;
      for (const m of Object.values(K.M)) m.visible = false;
      K.glow.visible = false;
      K.halo.visible = false;
    }
    const W = this.g.weather;
    if (W && V.fog0 != null) W.cur.fog = V.fog0;
    V.fog0 = null;
  }

  noFog() {
    const g = this.g;
    if (g.weather) g.weather.cur.fog = 0;
    if (g.scene.fog) g.scene.fog.density = 0;
  }

  // El vacío donde hablan los caballeros: lejos del molino (arriba, en el
  // cielo), una esfera negra alrededor y los cuatro en su forma de caballero
  // de la luz (el poncho y el brillo de su elemento, como en la visión de
  // Fierro), cada uno con la luz de su mate en la mano.
  buildVoid() {
    const g = this.g;
    const O = new THREE.Vector3(0, 420, 0);
    const root = new THREE.Group();
    root.position.copy(O);
    this.root.add(root);
    // (con profundidad: tapa el cielo y todo lo de afuera)
    const dark = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false }));
    root.add(dark);
    const people = new Avatars(g, null);
    const knights = KNIGHT_GLOW.map((c, i) => {
      const id = 40 + i;
      const r = { id, name: '', noTag: true, pos: O.clone(), yaw: 0, pitch: 0.05, speed: 0, moving: false };
      people.add(r);
      const av = people.list.get(id);
      for (const m of Object.values(av.M)) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(c);
          m.emissiveIntensity = 0.5;
        }
      }
      av.M.poncho.color.set(c);
      if (av.tag) av.tag.visible = false;
      const K = { r, av, M: av.M, c, k: 0, on: false, lift: 0 };
      r.poseFn = (P) => {
        if (K.lift <= 0) return;
        const u = smooth(K.lift);
        P.shRp = lerp(P.shRp, -2.85, u);
        P.elR = lerp(P.elR, -0.12, u);
        P.headP = lerp(P.headP, 0.22, u);
      };
      // la luz del mate en la mano y el resplandor de atrás
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      glow.scale.setScalar(0.7);
      this.root.add(glow);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      halo.scale.set(3.4, 4.6, 1);
      this.root.add(halo);
      K.glow = glow;
      K.halo = halo;
      return K;
    });
    root.visible = false;
    // sin niebla mientras hablan: a esa altura la sombra de la luna no llega y
    // la bruma iluminada (fx/Epic, VolPass) ponía todo el negro gris. (El clima
    // la vuelve a poner cada cuadro: se le cambia el valor de base, como en la
    // entrada del molino.)
    const fog0 = g.weather ? g.weather.cur.fog : null;
    this.void = { root, O, people, knights, row: false, fog0 };
    this.noFog();
  }

  // Aparece el que habla (i: 0-3; -1: los cuatro en fila) y la cámara se le acerca despacio.
  showKnight(i, secs) {
    const V = this.void;
    if (!V) return;
    const O = V.O;
    const row = i < 0;
    V.knights.forEach((K, n) => {
      K.on = row || n === i;
      K.k = 0;
      K.lift = 0;
      K.r.pos.set(O.x + (row ? [-2.4, -0.8, 0.8, 2.4][n] : 0), O.y, O.z + (row ? [0.3, 0, 0, 0.3][n] : 0));
      // (mira a la cámara, un poquito de costado)
      K.r.yaw = row ? [0.12, 0.04, -0.04, -0.12][n] : 0.1;
    });
    V.root.visible = true;
    V.row = row;
    this.shot(secs, (u, lt, pos, look) => {
      const k = smooth(u);
      if (row) {
        pos.set(O.x + lerp(-0.6, 0.6, u), O.y + lerp(1.7, 1.55, k), O.z + lerp(8.2, 7, k));
        look.set(O.x, O.y + 1.25, O.z);
      } else {
        pos.set(O.x + lerp(0.9, 0.45, k), O.y + lerp(1.45, 1.6, k), O.z + lerp(4.4, 3.1, k));
        look.set(O.x, O.y + lerp(1.3, 1.45, k), O.z);
      }
    });
    this.fade(false);
  }

  // El cartel de lo que dice: el nombre chiquito arriba y la frase, del color de cada uno.
  wordCard(i, text, secs) {
    const el = this.cardEl;
    el.textContent = '';
    const b = document.createElement('span');
    b.textContent = i >= 0 ? KNIGHT_NAME[i] : 'Los cuatro caballeros';
    b.style.cssText = 'display:block;margin-bottom:.35em;font:600 clamp(11px,1.1vw,14px)/1.2 Georgia,serif;font-style:normal;letter-spacing:.3em;text-transform:uppercase;opacity:.75';
    el.append(b, document.createTextNode(text));
    el.style.color = i >= 0 ? KNIGHT_CSS[i] : '#f3e6c8';
    el.style.opacity = '1';
    this.wordTok = (this.wordTok || 0) + 1;
    const token = this.wordTok;
    this.later(secs, () => {
      if (this.wordTok === token) el.style.opacity = '0';
    });
  }

  // Los caballeros del vacío: aparecen de a poco, levantan el mate y brillan.
  voidTick(dt) {
    const V = this.void;
    if (!V?.root.visible) return;
    const g = this.g;
    const t = this.t;
    V.people.update(dt);
    for (const K of V.knights) uprightMate(K.av, smooth(K.lift), K.r.yaw);
    this.noFog();
    V.knights.forEach((K, n) => {
      K.k = K.on ? Math.min(1, K.k + dt / 0.8) : Math.max(0, K.k - dt / 0.8);
      if (K.on && K.k > 0.5) K.lift = Math.min(1, K.lift + dt / 3.2);
      const vis = K.k > 0.001;
      for (const m of Object.values(K.M)) {
        m.opacity = K.k * (0.82 + Math.sin(t * 2.3 + n) * 0.06);
        m.visible = vis;
      }
      K.glow.visible = vis;
      K.halo.visible = vis;
      if (!vis) return;
      // (la mano recién puesta: la del dibujo se actualiza recién al dibujar)
      K.glow.position.setFromMatrixPosition(K.av.mats[6]);
      K.glow.material.opacity = K.k * (0.35 + K.lift * 0.65) * (0.85 + Math.sin(t * 7 + n) * 0.15);
      K.glow.scale.setScalar(0.5 + K.lift * 0.7);
      K.halo.position.set(K.r.pos.x, K.r.pos.y + 1.2, K.r.pos.z - 0.6);
      K.halo.material.opacity = K.k * (V.row ? 0.22 : 0.32) * (0.9 + Math.sin(t * 1.3 + n) * 0.1);
      // chispitas de su color que suben
      if (Math.random() < dt * (V.row ? 5 : 12)) g.fx.sparkle(tmpV.set(K.r.pos.x + (Math.random() - 0.5) * 1.1, K.r.pos.y + Math.random() * 1.9, K.r.pos.z + (Math.random() - 0.5) * 0.6), KNIGHT_RGB[n], 1, 0.25);
    });
  }

  tick(dt) {
    const g = this.g;
    // la entrada del molino se mueve sola (ella pone la cámara)
    if (this.intro) {
      if (this.intro.active) this.intro.update(dt);
      else this.voidTick(dt);
      return;
    }
    const C = this.C;
    this.people?.update(dt);
    if (this.people) for (const K of this.knights) uprightMate(this.people.list.get(K.r.id), smooth(this.raise || 0), K.r.yaw);
    // Fierro aparece de a poco en su columna
    if (this.fierroOn) {
      this.fierroK = Math.min(1, this.fierroK + dt / 2.5);
      this.fierro.pos.set(C.x, C.y, C.z + 1.5);
      for (const m of Object.values(this.fierroM)) m.opacity = this.fierroK * (0.72 + Math.sin(g.time * 2.1) * 0.06);
      this.pillar.material.opacity = (1 - this.fierroK * 0.6) * 0.25 * this.fierroK + 0.04;
    }
    // los caballeros (los jugadores) miran a Fierro mientras les habla; cuando
    // se sabe quiénes son dejan de ser ánimas, y al final levantan el mate
    if (this.raise) this.raise = Math.min(1, this.raise + dt / 1.4);
    for (const K of this.knights) {
      const want = Math.atan2(-(C.x - K.r.pos.x), -(C.z + 1.5 - K.r.pos.z));
      let d = want - K.r.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      K.r.yaw += d * Math.min(1, dt * 1.5);
    }
    if (this.turn) {
      this.turn = Math.min(1, this.turn + dt / 4);
      for (const K of this.knights) {
        for (const m of Object.values(K.M)) {
          m.opacity = lerp(0.5, 1, this.turn);
          if (this.turn >= 1) {
            m.transparent = false;
            m.depthWrite = true;
          }
          if (m.emissive) m.emissiveIntensity = lerp(1.1, 0.05, this.turn);
        }
      }
    }
    // el dragón baja y se posa
    const DL = this.dragonLand;
    if (DL && this.D) {
      DL.t = Math.min(1, DL.t + dt / 5);
      this.D.root.position.lerpVectors(DL.from, DL.to, smooth(DL.t));
      if (DL.t > 0.75 && this.D.pose === 'fly') this.D.setPose('stand', 1.5);
      this.D.update(dt);
    }
    // las sombras coloradas que suben
    if (this.t < 10 && Math.random() < 0.6) {
      g.fx.alpha.spawn(C.x + (Math.random() - 0.5) * 8, C.y + Math.random() * 2, C.z + (Math.random() - 0.5) * 8, (Math.random() - 0.5), 2.5, (Math.random() - 0.5), { color: [0.25, 0.02, 0.02], size: 0.6, size1: 2.2, life: 3, alpha: 0.5, drag: 0.2 });
    }
    // los pedazos de los mundos se van al remolino
    const arena = g.arena;
    if (this.pull && arena?.fragments) {
      this.pull = Math.min(1, this.pull + dt / 20);
      for (const f of arena.fragments) {
        f.position.lerp(tmpV.set(C.x, C.y + 150, C.z - 60), dt * 0.08 * this.pull);
        f.scale.setScalar(Math.max(0.05, 1 - this.pull * 0.7));
      }
    }
    // el recuerdo
    if (this.memory) {
      this.memory = Math.min(1, this.memory + dt / 10);
      const k = this.memory;
      for (const e of this.eyes) {
        e.position.set(C.x + e.userData.s * lerp(0.6, 0.15, k), C.y + lerp(14, 42, smooth(k)), C.z - lerp(22, 82, smooth(k)));
        e.material.opacity = Math.sin(k * Math.PI) * 0.9 * (Math.sin(g.time * 3) > -0.9 ? 1 : 0);
        e.scale.setScalar(lerp(1.6, 0.4, k));
      }
    }
    // la luz blanca crece y se come todo
    if (this.nova.visible) {
      this.novaT += dt;
      const k = smooth(Math.min(1, this.novaT / 6));
      this.nova.scale.setScalar(0.5 + k * 70);
      this.nova.material.opacity = Math.min(1, 0.2 + k);
      this.shake = Math.max(this.shake, 0.3 * k);
    }
  }

  cleanup() {
    this.people?.dispose?.();
    this.people?.root.removeFromParent();
    this.people = null;
    if (this.void) {
      this.hideVoid();
      this.void.people.dispose?.();
      this.void.people.root.removeFromParent();
      for (const K of this.void.knights) {
        K.glow.removeFromParent();
        K.halo.removeFromParent();
      }
      this.void = null;
    }
  }

  finish() {
    const g = this.g;
    if (this.done) return;
    if (this.intro?.active) this.intro.finish?.();
    // el menú del final es el del castillo (el mapa que se ganó), aunque atrás
    // ya esté el molino
    g.mapId = 'castillo';
    useMap('castillo');
    super.finish();
  }
}

// lo que les dicen los cuatro caballeros al final, en negro (-1: los cuatro)
const KNIGHT_CSS = ['#ff9a5a', '#9affc4', '#ffe870', '#a8e2ff'];
const KNIGHT_NAME = ['El Caballero del Fuego', 'El Caballero del Viento', 'El Caballero del Rayo', 'El Caballero del Hielo'];
const KNIGHT_RGB = [[1, 0.5, 0.15], [0.6, 1, 0.75], [1, 0.92, 0.45], [0.66, 0.88, 1]];
// (segundos del fundido de cada caballero)
const WORD_FADE = 0.8;
const KNIGHT_VOICE = ['caballeroFuego', 'caballeroViento', 'caballeroRayo', 'caballeroHielo'];
const WORD = [
  [0, 'Aunque no te acuerdes de nada, el fuego sigue prendido adentro tuyo.'],
  [1, 'Seguí para adelante, aunque el viento sople en contra.'],
  [2, 'Y si tenés miedo, hacé ruido. Que el trueno sea tuyo.'],
  [3, 'Aguantá firme. El que aguanta, gana.'],
  [-1, 'Mientras alguien le cebe un mate a otro, la luz no se apaga.'],
];

const LINES = [
  'Lo lograron, paisanos. Lo lograron.',
  'Pero al Chiquitijuein no se lo mata. Se esconde donde nadie lo puede sacar... en la memoria.',
  'Por eso este universo tiene que empezar de nuevo. El molino, la tapera, el penal, la torre, este castillo... todo.',
  'Van a olvidar lo que pasó. Pero van a vivir como leyendas que nadie conoce.',
  'Y él va a ser un recuerdo. Uno que todos tienen... pero que nadie entiende de dónde viene.',
  'Ustedes ya fueron caballeros una vez, hace mucho. Por eso los mates de la luz los reconocieron.',
  'Y cuando la historia vuelva a necesitarlos...',
  'Nosotros, los cuatro caballeros, nos alzaremos una vez más.',
];
