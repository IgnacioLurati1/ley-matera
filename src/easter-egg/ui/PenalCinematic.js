import * as THREE from 'three';
import { EE } from '../config/map';
import Avatars from '../net/Avatars';
import { buildVoz, updateVoz } from './voz';
import { warmScene } from './cineWarm';
import { PENAL_PEACE, PENAL_FROM } from '../core/music';

// Final del penal, adentro del juego, en el Cerro del Espinillo. El Gauchito
// Gil queda de rodillas junto al espinillo. Las almas del penal suben al
// cielo, y los tres presos (ya ánimas) se despiden y se van con ellas. Un
// paneo por el altar (el mate supremo y la yerba dorada). El Gil levanta la
// cabeza para avisar quién es la voz que los guió... y un rayo lo parte a
// mitad de la frase. La Voz de Arriba baja, se lleva el mate supremo,
// se pone colorada y se va. Se puede saltear con Esc, Espacio o clic.

const ME = 420;
const ANIMAS = [
  { id: 431, at: [2.9, 1.3] },
  { id: 432, at: [3.5, -0.2] },
  { id: 433, at: [2.2, 2.6] },
];
// lo que alcanza a decir el Gil antes del rayo
const CUT_LINE = 'No es buena. ¡No le den el mate! Esa voz es de';
const WHO = { gil: 'El Gauchito Gil', entidad: 'La Voz de Arriba', anacleto: 'Anacleto', benito: 'Benito' };

// El Gil de rodillas: cómo va cambiando (vencido, hablando, el rayo, ceniza).
const GIL_POSE = {
  down: { hipY: 0.52, torsoP: 0.6, torsoR: 0.08, headP: 0.5, shLp: -0.1, shRp: -0.55, shLr: 0.25, shRr: -0.3, elL: -0.2, elR: -1 },
  // habla estirando la mano izquierda (con la derecha sigue agarrando el facón)
  talk: { hipY: 0.55, torsoP: 0.22, torsoR: 0, headP: -0.12, shLp: -1.3, shRp: -0.5, shLr: 0.05, shRr: -0.3, elL: -0.2, elR: -0.9 },
  struck: { hipY: 0.62, torsoP: -0.5, torsoR: 0, headP: -0.75, shLp: -2.5, shRp: -2.5, shLr: 0.75, shRr: -0.75, elL: -0.15, elR: -0.15 },
  ash: { hipY: 0.45, torsoP: 1.15, torsoR: 0.1, headP: 0.7, shLp: 0.1, shRp: 0.1, shLr: 0.35, shRr: -0.35, elL: -0.2, elR: -0.2 },
};
const CHAR = new THREE.Color(0x141110);

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const faceTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));

export default class PenalCinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    // (a la vista desde el primer cuadro: arranca en negro)
    this.el.className = 'mdu-fcine mdu-fcine--penal is-on';
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
    this.shake = 0;
    this.soulAcc = 0;
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    // la canción (core/music.js), desde PENAL_FROM: la calma (las almas, los
    // presos, el altar) se estira hasta que se termina, cuando el Gil quiere hablar
    this.scored = !!g.music?.play('cine-penal-final', { at: PENAL_FROM, fadeIn: PENAL_FROM ? 0.8 : 0.15, while: (G) => G.state === 'won' && !this.done });
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    // arranca en negro y se abre sobre el cerro
    this.black(1, 0);
    const [ax, az] = EE.altar;
    const W = g.world;
    this.A = new THREE.Vector3(ax, W.floorAt(ax, az), az);
    const A = this.A;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.fov0 = g.camera.fov;
    // el jefe de verdad se va: en su lugar, el Gil de rodillas
    if (g.zombies.boss) g.zombies.removeBoss();
    g.hud.setBossBar(null);
    g.weapons.vmRoot.visible = false;
    g.menus?.showClick?.(false);
    // los compañeros de la red, los presos de las celdas y lo que quedó tirado no se ven
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    if (g.ee?.npc) g.ee.npc.root.visible = false;
    if (g.ee?.altarGlow) g.ee.altarGlow.visible = false;
    if (g.ee?.beam) g.ee.beam.visible = false;
    for (const it of g.powerups?.items || []) it.mesh.visible = false;
    // dónde está cada uno: el Gil a un costado del altar y los gauchos enfrente
    const gx = ax - 2.3;
    const gz = az + 0.4;
    this.G = new THREE.Vector3(gx, W.floorAt(gx, gz), gz);
    this.C = new THREE.Vector3(ax + 0.3, A.y, az + 3.9);
    this.people = new Avatars(g, null);
    this.buildGauchos();
    this.buildAnimas();
    this.buildGil();
    this.buildAltar();
    this.voz = buildVoz(g.textures, { beam: 40 });
    this.voz.root.position.set(ax, A.y + 45, az);
    this.voz.root.visible = false;
    this.root.add(this.voz.root);
    // las luces del cerro ya existen (sumar luces en medio de la escena recompila todo)
    const L = g.arena?.lights || [];
    this.voiceLight = this.light(L[0], 0xc8a0ff, 0, 45, 1.4);
    this.warmLight = this.light(L[1], 0xff3a2a, 7, 10, 2);
    this.warmLight.position.set(this.G.x + 1.2, this.G.y + 2.4, this.G.z + 1.6);
    this.look = 'gil';
    // (sin la musiquita de victoria: acá entra directo la canción)
    g.audio.setCine(true);
    if (!this.scored) g.audio.fanfare();
    this.script = this.buildScript();
    // todo lo que va a aparecer se compila ya, en segundo plano
    warmScene(g);
  }

  // Una luz de la escena (ya creada con el mapa) o, si no hay, una propia.
  light(L, color, intensity, distance, decay) {
    const l = L || new THREE.PointLight(color, intensity, distance, decay);
    l.color.set(color);
    l.intensity = intensity;
    l.distance = distance;
    l.decay = decay;
    if (!l.parent) this.root.add(l);
    return l;
  }

  // ---------------- los que actúan ----------------
  // Los gauchos: vos y los compañeros, en ronda frente al altar.
  buildGauchos() {
    const g = this.g;
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    this.gauchos = ids.map((id, i) => {
      const s = i - (ids.length - 1) / 2;
      const x = this.C.x + s * 1.15;
      const z = this.C.z + Math.abs(s) * 0.35;
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(x, g.world.floorAt(x, z), z), yaw: 0, pitch: 0, speed: 0, moving: false, crouch: false };
      this.people.add(r);
      // el color del poncho es el de cada uno en la partida
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      return r;
    });
  }

  // Anacleto, Cirilo y Benito, ya ánimas: se arman ya (escondidos) y aparecen después.
  buildAnimas() {
    const g = this.g;
    this.animas = ANIMAS.map((d) => {
      const x = this.A.x + d.at[0];
      const z = this.A.z + d.at[1];
      const y = g.world.floorAt(x, z);
      const r = { id: d.id, name: '', noTag: true, pos: new THREE.Vector3(x, y, z), base: y, yaw: faceTo({ x, z }, this.C.x, this.C.z), pitch: 0, speed: 0, moving: false, ghost: true, dead: true };
      this.people.add(r);
      // (una pasada a la vista: así ya quedan vestidos de ánima, transparentes)
      r.dead = false;
      return r;
    });
    this.people.update(0);
    for (const r of this.animas) r.dead = true;
  }

  // El Gil: el mismo cuerpo del jefe, de rodillas, con su facón.
  buildGil() {
    const g = this.g;
    const Z = g.zombies;
    const z = Z.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.kind = 'gil';
    z.scale = 1.85;
    z.hatHp = 1;
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.phase = 0;
    z.slot = 0;
    z.pos.copy(this.G);
    z.baseY = this.G.y;
    z.yaw = Math.atan2(this.C.x - this.G.x, this.C.z - this.G.z);
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('gil');
    Z.bossRig.rig.visible = true;
    this.gil = z;
    this.gilPose = 'down';
    this.gilK = { ...GIL_POSE.down };
    // todavía colorado de la segunda fase: se le va apagando
    this.gilGlow = 0.8;
    // lo que queda: un montón de ceniza y el facón clavado
    const ash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 1 }));
    ash.scale.set(0.001, 0.001, 0.001);
    ash.position.copy(this.G);
    this.root.add(ash);
    this.ash = ash;
    const facon = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 1, roughness: 0.3 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.012), steel);
    blade.position.y = 0.1;
    facon.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.03), new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.35 }));
    guard.position.y = 0.41;
    facon.add(guard);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.8 }));
    handle.position.y = 0.52;
    facon.add(handle);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.004), new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.8 }));
    ribbon.position.set(0.04, 0.4, 0);
    ribbon.rotation.z = 0.5;
    facon.add(ribbon);
    facon.position.set(this.G.x + 0.35, this.G.y, this.G.z + 0.35);
    facon.rotation.set(0.15, 0.6, -0.2);
    facon.visible = false;
    this.root.add(facon);
    this.facon = facon;
  }

  // Lo del altar: el mate supremo (mate dorado y bombilla) y la yerba dorada.
  buildAltar() {
    const g = this.g;
    const src = g.ee;
    const A = this.A;
    this.mate = new THREE.Group();
    const base = new THREE.Vector3(A.x, A.y + 1, A.z);
    for (const o of [src?.altarMate, src?.altarBomb]) {
      if (!o) continue;
      const c = o.clone();
      c.position.sub(base);
      c.visible = true;
      this.mate.add(c);
      o.visible = false;
    }
    this.mateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffc84a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.mateGlow.scale.setScalar(1.4);
    this.mate.add(this.mateGlow);
    this.mate.position.copy(base);
    this.mateBase = base.clone();
    this.root.add(this.mate);
    // la yerba dorada (una copia de la que pusieron en la piedra)
    const y = src?.altarYerba;
    this.yerba = y ? y.clone() : new THREE.Group();
    this.yerba.visible = true;
    if (y) {
      this.yerba.position.copy(y.position);
      // su propio material: el brillo sube sin tocar el del altar
      this.yerba.traverse((m) => {
        if (m.isMesh) m.material = m.material.clone();
      });
      y.visible = false;
    } else this.yerba.position.set(A.x - 0.45, A.y + 1.08, A.z);
    this.root.add(this.yerba);
  }

  // ---------------- el guion ----------------
  // Los pasos, uno detrás del otro: [espera antes, acción que devuelve cuánto dura].
  buildScript() {
    const g = this.g;
    return [
      [0, () => {
        this.black(0, 1.4);
        this.shotOpen();
        return this.scored ? 4 : 3.2;
      }],
      // las almas del penal suben al cielo
      [0, () => {
        this.soulsOn = true;
        if (!this.scored) this.soulChord();
        this.shotSouls();
        g.weather?.set?.('drizzle', false);
        return this.scored ? 2.6 : 2.4;
      }],
      [0, () => this.say('anacleto', '¡Miren! Las almas del penal... ¡se van todas!')],
      // los tres presos, ya ánimas, se despiden
      [0.3, () => {
        this.animasIn();
        this.shotAnimas();
        return this.scored ? 3.2 : 1.3;
      }],
      [0, () => this.say('benito', 'Cien años presos del Gil. Gracias, paisanos... por fin vamos a descansar.')],
      [0.2, () => {
        this.animasUp();
        return this.scored ? 6.5 : 3;
      }],
      // paneo por el altar: el mate supremo y la yerba dorada
      [0, () => {
        this.soulsOn = false;
        this.look = 'altar';
        this.textEl.classList.remove('is-on');
        // (con la canción: lo que falta para que se termine, menos lo que tarda el Gil en levantar la cabeza)
        // (por el reloj de la canción: con pocos cuadros el de la escena atrasa)
        const mt = this.scored && g.music.is('cine-penal-final') ? g.music.time() : -1;
        const d = this.scored ? Math.max(5, PENAL_PEACE - (mt >= 0 ? mt : this.t + PENAL_FROM) - 1.2) : 4.6;
        this.shotYerba(d);
        return d;
      }],
      // el Gil levanta la cabeza (se acabó la paz: la canción se va)
      [0.1, () => {
        if (this.scored) g.music.stop(1.6);
        this.look = 'gil';
        this.gilPose = 'talk';
        this.shotGil();
        return 1.1;
      }],
      [0, () => this.say('gil', 'Esperen, gauchos... Esa voz que los fue guiando hasta acá...')],
      [0.3, () => this.say('gil', CUT_LINE, { cut: true })],
      // el rayo lo parte a mitad de la frase
      [0, () => {
        this.strike();
        this.shotBolt();
        return 3.8;
      }],
      // la Voz baja
      [0, () => {
        this.voiceIn();
        this.shotVoice();
        return 3;
      }],
      [0, () => this.say('entidad', 'Pobre Gil. Siempre habló de más.')],
      [0.3, () => {
        this.mateUp(4.8);
        this.shotMate();
        return 0.5;
      }],
      [0, () => this.say('entidad', 'Gracias por armarlo, gauchitos. Hacía cien años que lo buscaba.')],
      [0, () => Math.max(0, this.mateEnd - this.t)],
      [0, () => {
        this.absorb();
        this.shotEye();
        return 1;
      }],
      [0, () => this.say('entidad', 'El mate supremo es mío. Siempre lo fue.')],
      [0.4, () => this.say('entidad', 'Ya tengo lo que vine a buscar. No me sigan.')],
      [0.3, () => {
        this.voiceOut();
        this.shotEnd();
        return 2.4;
      }],
      [0, () => {
        this.el.classList.add('is-title');
        return 3.4;
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

  // Habla un personaje: su nombre arriba, el subtítulo que va apareciendo al
  // ritmo de la voz y su color. `cut`: el texto se completa justo cuando
  // termina (lo que sigue lo interrumpe).
  say(who, text, { cut = false } = {}) {
    const d = this.g.audio.say(text, who, { cine: true });
    this.whoEl.textContent = WHO[who] || '';
    this.span.textContent = '';
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-gil', who === 'gil');
    this.el.classList.toggle('is-anima', who === 'anacleto' || who === 'benito');
    this.sub = { text, t0: this.t, rev: Math.max(0.5, cut ? d * 0.95 : Math.min(d * 0.85, text.length * 0.045)), k: -1 };
    return d;
  }

  // El negro de los cortes (fade: segundos para irse o volver; 0 = de golpe).
  black(v, fade = 0) {
    this.blackEl.style.transition = fade ? `opacity ${fade}s` : 'none';
    this.blackEl.style.opacity = String(v);
  }

  // Todo blanco un instante (el rayo).
  whiteout() {
    this.flashEl.classList.add('is-on');
    this.later(0.12, () => this.flashEl.classList.remove('is-on'));
  }

  // Un coro y campanas mientras suben las almas.
  soulChord() {
    const A = this.g.audio;
    try {
      const t = A.now;
      const o = A.out({ gain: 0.7, reverb: 1, bus: A.music });
      A.choir(o, t, [62, 66, 69, 74], { dur: 5, gain: 0.035, attack: 1.4, release: 2.5 });
      A.bell(o, t + 0.3, 74, { gain: 0.1, dur: 6 });
      A.bell(o, t + 2.1, 81, { gain: 0.07, dur: 6 });
    } catch {
      /* sin música */
    }
  }

  animasIn() {
    const g = this.g;
    g.audio.sting();
    for (const r of this.animas) {
      r.dead = false;
      g.fx.sparkle(tmpV.copy(r.pos).setY(r.pos.y + 1), [0.6, 0.8, 1], 40, 1.2);
    }
    g.fx.flash(tmpV.set(this.A.x + 2.8, this.A.y + 1.2, this.A.z + 1.2), 0x7ab8ff, 60, 0.6, 12);
    this.look = 'animas';
  }

  animasUp() {
    this.animaT = this.t;
    this.g.audio.whoosh?.(this.animas[0].pos);
  }

  // El rayo de la Voz: corta al Gil (y su frase) de golpe.
  strike() {
    const g = this.g;
    // lo que quedaba de la frase se corta, y el subtítulo con ella
    g.audio.hush();
    if (this.sub) {
      this.sub.k = this.sub.text.length;
      this.span.textContent = this.sub.text + '—';
      this.sub = null;
    }
    this.later(1, () => this.textEl.classList.remove('is-on'));
    const G = this.G;
    const top = new THREE.Vector3(G.x, G.y + 45, G.z);
    const hit = new THREE.Vector3(G.x, G.y + 1.8, G.z);
    g.fx.lightning(top, hit, 0xfff0ff, 0.9);
    g.fx.lightning(top.clone().add(tmpV.set(2, 0, -1)), hit, 0xc8a0ff, 0.7);
    this.later(0.14, () => g.fx.lightning(top, hit, 0xffffff, 0.5));
    g.fx.explosion(tmpV.set(G.x, G.y + 0.8, G.z), 2.6, [0.85, 0.65, 1]);
    g.fx.electric(hit, 40);
    g.fx.flash(hit, 0xe0d0ff, 140, 0.9, 30);
    g.post.flash(1.6);
    this.whiteout();
    if (g.weather) g.weather.flash = 1;
    // el rayo que lo mata: el trueno intenso (uno solo; los grabados ya retumban)
    g.audio.thunder?.(hit, true);
    g.audio.explosion(hit, 1.4);
    g.audio.bossSlam?.(hit);
    this.shake = 1.2;
    this.gilPose = 'struck';
    this.gilHit = this.t;
    this.gil.hatHp = 0;
    this.warmLight.color.set(0xffe0c0);
    this.warmLight.intensity = 30;
    this.look = 'gil';
  }

  voiceIn() {
    const g = this.g;
    this.voz.root.visible = true;
    this.voiceT = this.t;
    this.voiceLight.intensity = 0;
    g.audio.sting();
    g.audio.whoosh?.(this.voz.root.position);
    if (g.weather) g.weather.flash = 1;
    this.look = 'sky';
  }

  // El mate supremo sube desde la piedra hasta el ojo.
  mateUp(dur) {
    this.mateT = this.t;
    this.mateDur = dur;
    this.mateEnd = this.t + dur;
    this.voz.beamOn = true;
    this.g.audio.whoosh?.(this.mate.position);
  }

  // Se lo traga: fogonazo, y la Voz se pone colorada.
  absorb() {
    const g = this.g;
    const E = this.voz.root.position;
    this.mateT = null;
    this.mate.visible = false;
    this.voz.beamOn = false;
    this.evilT = this.t;
    g.post.flash(1.2);
    g.fx.sparkle(E, [1, 0.8, 0.4], 70, 2.2);
    g.fx.flash(E, 0xff5a3a, 120, 0.8, 30);
    g.audio.powerupGrab();
    g.audio.bossArrive?.();
    this.voiceLight.color.set(0xff5a6a);
  }

  voiceOut() {
    const g = this.g;
    this.outT = this.t;
    g.audio.whoosh?.(this.voz.root.position);
    this.later(0.9, () => {
      g.post.flash(0.8);
      g.audio.thunder?.(this.voz.root.position);
      if (g.weather) g.weather.flash = 1;
      g.weather?.set?.('clear', false);
    });
    this.look = 'altar';
  }

  // ---------------- tomas (dónde está la cámara) ----------------
  shot(dur, fn, fov = this.fov0) {
    this.cam = { t0: this.t, dur, fn };
    this.setFov(fov);
  }

  shotOpen() {
    const A = this.A;
    this.shot(this.scored ? 5 : 6, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 6 - e * 1.8, A.y + 4.4 - e * 1.6, A.z + 8.8 - e * 2.2);
      tmpW.set(A.x - 0.9, A.y + 1.2, A.z + 0.6);
    });
  }

  // Desde la punta del cerro, mirando el penal: las almas suben de todos lados.
  shotSouls() {
    const A = this.A;
    this.shot(this.scored ? 7 : 8, (u) => {
      const e = smooth(u);
      tmpV.set(A.x - 4, A.y + 4.2 + e * 0.6, A.z + 4.5);
      tmpW.set(52, A.y - 7 + e * 26, 50);
    });
  }

  shotAnimas() {
    const A = this.A;
    this.shot(this.scored ? 15 : 12, (u) => {
      const up = this.animaT != null ? Math.min(4, (this.t - this.animaT) * 1.4) : 0;
      tmpV.set(A.x + 4.6 - u * 0.3, A.y + 1.8, A.z + 4.4 - u * 0.3);
      tmpW.set(A.x + 2.6, A.y + 1.3 + up, A.z + 0.9);
    });
  }

  // Paneo lento alrededor del altar, de izquierda a derecha.
  shotYerba(d = 4.6) {
    const A = this.A;
    this.shot(d, (u) => {
      const a = -0.45 + smooth(u) * 1.35;
      tmpV.set(A.x + Math.sin(a) * 2.3, A.y + 1.55 - u * 0.15, A.z + Math.cos(a) * 2.3);
      tmpW.set(A.x - 0.2, A.y + 1.05, A.z);
    }, 50);
  }

  // Primer plano del Gil, desde abajo (es enorme aunque esté de rodillas).
  shotGil() {
    const G = this.G;
    const d = tmpU.set(this.C.x - G.x, 0, this.C.z - G.z).normalize().clone();
    const side = new THREE.Vector3(d.z, 0, -d.x);
    this.shot(14, (u) => {
      const k = 4.4 - u * 0.6;
      tmpV.set(G.x + d.x * k + side.x * 1.1, G.y + 1.5, G.z + d.z * k + side.z * 1.1);
      tmpW.set(G.x, G.y + 2.25, G.z);
    }, 45);
  }

  shotBolt() {
    const G = this.G;
    const d = tmpU.set(this.C.x - G.x, 0, this.C.z - G.z).normalize().clone();
    const side = new THREE.Vector3(d.z, 0, -d.x);
    this.shot(3.8, (u) => {
      tmpV.set(G.x + d.x * 6.2 - side.x * 2.2, G.y + 2.4, G.z + d.z * 6.2 - side.z * 2.2);
      tmpW.set(G.x, G.y + 1.6 + u * 1.2, G.z);
    });
  }

  // Desde atrás de los gauchos, mirando para arriba: la Voz baja.
  shotVoice() {
    const A = this.A;
    this.shot(8, () => {
      tmpV.set(A.x + 1.5, A.y + 1.2, A.z + 6.4);
      tmpW.lerpVectors(tmpU.set(A.x, A.y + 1.4, A.z), this.voz.root.position, 0.8);
    });
  }

  shotMate() {
    this.shot(8, (u, t) => {
      const m = this.mate.visible ? this.mate.position : this.voz.root.position;
      const a = 0.8 + t * 0.3;
      tmpV.set(m.x + Math.sin(a) * 2.6, m.y - 0.5, m.z + Math.cos(a) * 2.6);
      tmpW.copy(m);
    });
  }

  shotEye() {
    const A = this.A;
    this.shot(14, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 3 - e * 0.8, A.y + 5.6 + e * 0.6, A.z + 10 - e * 2);
      tmpW.copy(this.voz.root.position);
    }, 40);
  }

  shotEnd() {
    const A = this.A;
    this.shot(10, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 2.5 + e * 5, A.y + 2 + e * 9, A.z + 7 + e * 8);
      tmpW.set(A.x, A.y + 1 + e * 2.5, A.z);
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
    if (g.vida?.hand) g.vida.hand.root.visible = false;
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
    this.updateSouls(dt);
    this.updateAnimas(dt);
    this.updateGauchos();
    this.updateGil(dt);
    this.updateYerba();
    this.updateVoz(dt);
    for (const p of g.arena?.braziers || []) if (Math.random() < 0.25) g.fx.fire(p, 0.08, 1);
    this.people.update(dt);
    // la cámara de la toma, con el temblor encima (nunca abajo del pasto)
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      const fy = g.world.floorAt(tmpV.x, tmpV.z);
      if (Number.isFinite(fy)) tmpV.y = Math.max(tmpV.y, fy + 0.4);
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
  }

  // Las almas del penal: suben de todo el mapa hacia el cielo.
  updateSouls(dt) {
    if (!this.soulsOn) return;
    const g = this.g;
    this.soulAcc += dt * 240;
    while (this.soulAcc >= 1) {
      this.soulAcc--;
      const x = 6 + Math.random() * 72;
      const z = 8 + Math.random() * 84;
      const fy = g.world.floorAt(x, z);
      const y = (Number.isFinite(fy) ? fy : 0) + 0.3 + Math.random() * 2;
      g.fx.add.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 4 + Math.random() * 3, (Math.random() - 0.5) * 0.6, { color: [0.55, 0.85, 1], size: 0.35 + Math.random() * 0.45, size1: 0.1, life: 5 + Math.random() * 2 });
    }
    // y alrededor del cerro, las de los devotos que llamó el Gil
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4;
      g.fx.add.spawn(this.A.x + Math.cos(a) * r, this.A.y + 0.2, this.A.z + Math.sin(a) * r, 0, 2.5 + Math.random() * 2, 0, { color: [0.6, 0.85, 1], size: 0.18, size1: 0.05, life: 3 });
    }
  }

  updateAnimas(dt) {
    const t = this.t;
    for (const [i, r] of this.animas.entries()) {
      if (r.dead) continue;
      if (this.animaT != null) {
        const u = Math.max(0, t - this.animaT - i * 0.35);
        r.pos.y = r.base + u * u * 0.9;
        r.pitch = 0.5;
        if (Math.random() < 0.5) this.g.fx.sparkle(tmpV.copy(r.pos).setY(r.pos.y + 0.2 + Math.random() * 1.6), [0.6, 0.8, 1], 1, 0.6);
        if (r.pos.y > r.base + 9) {
          r.dead = true;
          this.people.remove(r.id);
        }
      } else if (Math.random() < dt * 6) this.g.fx.sparkle(tmpV.copy(r.pos).setY(r.pos.y + 0.4 + Math.random() * 1.4), [0.6, 0.8, 1], 1, 0.5);
    }
  }

  // Los gauchos miran lo que pasa (y para arriba cuando baja la Voz).
  updateGauchos() {
    const look = this.look;
    const at = look === 'gil' && !this.gilGone ? this.G : look === 'animas' ? tmpU.set(this.A.x + 2.8, 0, this.A.z + 1.2) : this.A;
    for (const r of this.gauchos) {
      r.yaw = faceTo(r.pos, at.x, at.z);
      const want = look === 'sky' ? 0.9 : look === 'animas' && this.animaT != null ? 0.6 : 0;
      r.pitch += (want - r.pitch) * 0.05;
    }
  }

  updateGil(dt) {
    const z = this.gil;
    if (this.gilGone) return;
    const g = this.g;
    const t = this.t;
    const Z = g.zombies;
    const BM = Z.bossMats;
    const mats = BM ? [BM.skin, BM.cloth, BM.poncho] : [];
    const hit = this.gilHit != null ? t - this.gilHit : -1;
    if (hit > 0.9 && this.gilPose === 'struck') this.gilPose = 'ash';
    const want = GIL_POSE[this.gilPose];
    const rate = this.gilPose === 'struck' ? 14 : this.gilPose === 'ash' ? 2.5 : 3;
    const K = this.gilK;
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
    if (hit < 0) {
      // respira vencido; se le apaga lo colorado de la segunda fase
      P.torsoP += Math.sin(t * 2.2) * 0.03;
      this.gilGlow = Math.max(0, this.gilGlow - dt * 0.25);
      for (const m of mats) if (m.emissive) {
        m.emissive.set(0xff1a0a);
        m.emissiveIntensity = this.gilGlow;
      }
      if (Math.random() < dt * 3) g.fx.steam(tmpV.set(z.pos.x, this.G.y + 1 + Math.random() * 1.5, z.pos.z), 1, 0.5);
    } else if (hit < 0.9) {
      // el rayo lo sacude entero, al rojo blanco
      for (const k of ['torsoP', 'headP', 'shLp', 'shRp']) P[k] += (Math.random() - 0.5) * 0.3;
      for (const m of mats) if (m.emissive) {
        m.emissive.set(0xffe8c0);
        m.emissiveIntensity = 2 + Math.random() * 2;
      }
      Z.bossRig.eyeMat?.color.setRGB(4, 4, 4);
      if (Math.random() < 0.6) g.fx.electric(tmpV.set(z.pos.x, this.G.y + 0.5 + Math.random() * 2.5, z.pos.z), 3);
    } else {
      // se carboniza y se desarma en ceniza
      const c = clamp01((hit - 0.9) / 0.8);
      for (const m of mats) {
        m.color.lerp(CHAR, c * 0.2);
        // brasas que se apagan enseguida: mientras se hunde ya se ve negro
        if (m.emissive) {
          m.emissive.set(0xc02808);
          m.emissiveIntensity = Math.max(0, 0.7 - (hit - 0.9) * 0.55) * (0.5 + Math.random() * 0.5);
        }
      }
      Z.bossRig.eyeMat?.color.setRGB(0, 0, 0);
      const k = clamp01((hit - 1.4) / 2.2);
      P.rootY = -Math.pow(k, 1.5) * 2.4;
      z.scale = 1.85 * (1 - 0.35 * k);
      const a = smooth(clamp01((hit - 1.2) / 2));
      this.ash.scale.set(0.9 * a + 0.001, 0.3 * a + 0.001, 0.75 * a + 0.001);
      if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x + (Math.random() - 0.5) * 0.8, this.G.y + 0.2 + Math.random() * 1.4 * (1 - k), z.pos.z + (Math.random() - 0.5) * 0.8), 0.3, 1);
      if (Math.random() < 0.6) g.fx.alpha.spawn(z.pos.x + (Math.random() - 0.5) * 0.8, this.G.y + 0.4 + Math.random(), z.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, { color: [0.12, 0.11, 0.1], size: 0.5, size1: 1.4, life: 2.6, alpha: 0.55 });
      this.warmLight.color.set(0xff5a1a);
      this.warmLight.intensity = Math.max(3, this.warmLight.intensity - dt * 20);
      if (hit > 3.6) {
        this.gilGone = true;
        Z.removeBoss();
        this.facon.visible = true;
        g.fx.dust(tmpV.set(this.G.x, this.G.y + 0.1, this.G.z), { x: 0, y: 1, z: 0 }, [0.15, 0.14, 0.13], 24);
      }
    }
  }

  // La yerba dorada en la piedra: brilla despacio y suelta alguna chispa.
  updateYerba() {
    const t = this.t;
    this.yerba.traverse((m) => {
      if (m.isMesh && m.material.emissive) m.material.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.25;
    });
    if (Math.random() < 0.15) this.g.fx.sparkle(this.yerba.position, [1, 0.85, 0.4], 1, 0.3);
  }

  // La Voz: baja del cielo, el mate sube por su luz, se pone colorada y se va.
  updateVoz(dt) {
    const V = this.voz;
    if (!V.root.visible) return;
    const g = this.g;
    const t = this.t;
    const A = this.A;
    const E = V.root.position;
    if (this.outT != null) {
      const u = t - this.outT;
      E.y += u * u * dt * 40;
      this.voiceLight.intensity = Math.max(0, this.voiceLight.intensity - dt * 30);
    } else {
      const k = clamp01((t - this.voiceT) / 4);
      E.y = A.y + 45 - (1 - (1 - k) ** 3) * 35.5 + Math.sin(t * 0.8) * 0.3;
      this.voiceLight.intensity = Math.min(60, this.voiceLight.intensity + dt * 30);
    }
    this.voiceLight.position.set(E.x, E.y - 1.5, E.z);
    V.evil = this.evilT != null ? smooth(clamp01((t - this.evilT) / 1.4)) : 0;
    updateVoz(V, dt, t, g.camera.position);
    // la columna de luz mientras sube el mate
    const B = V.beam.material;
    B.opacity = V.beamOn ? Math.min(0.2, B.opacity + dt * 0.25) : Math.max(0, B.opacity - dt * 0.3);
    // el mate supremo
    if (this.mateT != null) {
      const u = clamp01((t - this.mateT) / this.mateDur);
      const s = smooth(u);
      const m = this.mate.position;
      m.lerpVectors(this.mateBase, tmpV.copy(E).setY(E.y - 1.4), s);
      m.x += Math.sin(u * Math.PI * 4) * 0.35 * (1 - u);
      m.z += Math.cos(u * Math.PI * 4) * 0.35 * (1 - u);
      this.mate.rotation.y += dt * (2 + u * 4);
      if (Math.random() < 0.7) g.fx.sparkle(m, [1, 0.85, 0.4], 2, 0.3);
      this.warmLight.color.set(0xffc050);
      this.warmLight.intensity = 5;
      this.warmLight.position.copy(m).setY(m.y + 0.4);
    } else if (this.mate.visible) {
      this.mate.rotation.y += dt * 0.6;
      this.mateGlow.material.opacity = 0.55 + Math.sin(t * 3) * 0.15;
    } else if (this.gilGone) this.warmLight.intensity = Math.max(0, this.warmLight.intensity - dt * 4);
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
    if (this.gil && Z.boss === this.gil) Z.removeBoss();
    // el cuerpo del jefe vuelve a como estaba (por si hay otra partida)
    for (const m of Z.bossMats ? [Z.bossMats.skin, Z.bossMats.cloth, Z.bossMats.poncho] : []) if (m.emissive) m.emissiveIntensity = 0;
    Z.dressBoss?.('gil');
    this.people?.dispose();
    this.root?.removeFromParent();
    this.root = null;
    if (this.voiceLight) this.voiceLight.intensity = 0;
    if (this.warmLight) this.warmLight.intensity = 0;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (g.ee?.npc) g.ee.npc.root.visible = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
