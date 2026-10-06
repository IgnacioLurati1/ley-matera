import * as THREE from 'three';
import Arena from './Arena';
import { DECOR } from './castleDecor';
import { buildChiqui, chiquiGiggle, chiquiGlitch, chiquiAnchor, chiquiEmber, chiquiMeta } from './Chiqui';
import Avatars from '../net/Avatars';
import { ELEMENTS, ELEM_COLOR, ELEM_RGB, ELEM_NAME, isHost, rayHit, announce } from '../entities/castle/common';
import { streamSong } from './SongEgg';
import { PLAYER } from '../config/rules';
import DragonFire from '../fx/DragonFire';
import { buildFragments, floatingRocks, FRAGMENTS } from './eterFragments';
import { warmScene } from '../ui/cineWarm';
import { sleepHidden } from './castleLean';
import CastleClips, { personaLetter } from '../ui/castleClips';
import { flightShot, flightShotsEnd } from './flightShots';

// La Gran Guerra: la pelea final contra el Chiquitijuein, en el Éter.
//  · El vuelo: después del juramento, el Mateendrache sale de la cumbre con
//    todos en el lomo (se ve desde arriba del dragón), da una vuelta sobre el
//    castillo y se mete en el remolino de tormenta. Adentro de las nubes se
//    cambia de mundo: el castillo se saca de la memoria y aparece el Éter.
//  · El Éter: una isla de roca flotando en un cielo de tormenta, rodeada de
//    pedazos de los cuatro mapas (el molino, el establo de la tapera, el
//    penal y la punta de la torre). En la isla, los cuatro altares.
//  · El coloso: el Chiquitijuein en su forma verdadera sube de las nubes,
//    enorme. Tira manotazos que largan una onda (hay que saltarla), rayos de
//    los ojos (círculos en el piso), bolas de fuego y rocas, y llama hordas.
//    Tiene cuatro gemas en el poncho, una por elemento: cada una se rompe con
//    su mate de la luz (tres tiros cargados; los comunes, de a poco).
//  · El duende: sin gemas el coloso se deshace y queda el Chiquitijuein de
//    verdad, chiquito, corriendo por la isla. Deja trampas de yerba maldita,
//    tira bolas de fuego y dos veces se hace cinco (espejitos: el de verdad
//    deja brasas donde pisa). En el medio de la isla está el cuerno del
//    Mateendrache (mantener F): el dragón se tira en picada y lo marea.
//  · El caos: sin vida se mete en un remolino en el medio y el Éter se rompe
//    (rayos, yerba que cae del cielo, pedazos de los mapas que se estrellan
//    con sus muertos, la gravedad que se va). Parándose en los cuatro altares
//    se prenden; cada uno trae a su caballero de la luz de antes, y con los
//    cuatro lo sacan del remolino y lo sujetan: el golpe final.
// El dragón pelea del lado de los jugadores: pasadas echando fuego sobre los
// muertos y, con el cuerno, la embestida contra el duende.
// Lo lleva el anfitrión; todo lo que se ve viaja como {gg: ...} por 'ee'.

// la isla, lejos del castillo (afuera de la grilla del mapa)
const A0 = { x: -170, y: 140, z: 50, r: 22 };
const COL = { dz: -38, dy: -12, scale: 36 };
const GEM_HP = 3;
const GNOME_HP = 13000;
// el duende: a qué vida se hace cinco, el cuerno del dragón (cada cuánto se
// puede soplar y cuánto lo marea) y las trampas de yerba
const TRICK_AT = [0.7, 0.4];
const HORN_CD = 16;
const STUN_SECS = 6;
// cuánto le entra: sin la embestida del dragón casi nada (el cuerno es casi
// obligatorio); mareado, de más
const STUN_DMG = 2.5;
const BARE_DMG = 0.12;
// cuánto se aparta el dragón (su medio) de lo que esquiva: las alas y la cola
// llegan a ~11 m del medio (con 8 las alas rozaban el ala del sombrero)
const DRAGON_CLEAR = 13;
// la embestida: sube, se para en el aire rugiendo, se tira y se va (segundos)
const DIVE = { climb: 1.3, hold: 0.75, fall: 0.6, out: 1.8 };
const DIVE_HIT = DIVE.climb + DIVE.hold + DIVE.fall;
const MINE_R = 1.2;
// el caos: los altares se prenden parado adentro del círculo; la vida del
// golpe final
const ALTAR_R = 2.3;
// (con 3 s se prendía de pasada: hay que plantarse en el círculo con el caos encima)
const ALTAR_SECS = 8;
// (+50%: pedido del usuario, que dure un poco más el placer de recagarlo a tiros)
const FINAL_HP = 5400;
const FLIGHT = { up: 12, white: 13.4, land: 21.5, end: 22.8 };
// el temazo de la Gran Guerra: arranca cuando el dragón sale de la tormenta al Éter
const SONG = { url: '/assets/sotano/guerra-castillo.mp3', name: 'Not Ready To Die' };
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const dS = new THREE.Vector3();
const dT = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Dónde van las gemas en el poncho del duende (sus medidas, antes de agrandarlo).
const GEMS = { viento: [0, 0.66, 0.24], fuego: [-0.1, 0.53, 0.25], rayo: [0.1, 0.53, 0.25], hielo: [0, 0.4, 0.27] };
const KNIGHT_NAMES = { fuego: 'El Caballero del Fuego', viento: 'El Caballero del Viento', rayo: 'El Caballero del Rayo', hielo: 'El Caballero del Hielo' };

export default class GranGuerra extends Arena {
  constructor(game) {
    super(game, { ...A0 });
  }

  setup() {
    super.setup();
    this.name = 'La Gran Guerra';
    this.sub = 'El Éter, donde se juntan todos los mundos';
    this.bossName = 'El Chiquitijuein';
    this.rainColor = 0xff2a10;
    this.fireColor = 0xff3a1a;
    this.rainBoom = [1, 0.15, 0.1];
    this.rainDmg = 45;
    this.rainR = 2.2;
    this.fireSpeed = 16;
    this.weatherName = 'eter';
    this.lines = {
      greet: ['anunciador', ''],
      rain: '¡Los ojos del Chiquitijuein! Salí de los círculos colorados.',
      ward: '',
      unward: '',
      summon: 'El Chiquitijuein llama a sus muertos...',
    };
  }

  // Lo único que se arma con el mapa: las luces (sumarlas después recompila todo)
  // y lo que usa la base (el escudo, los círculos). La isla se arma en el vuelo.
  build() {
    this.lights = [0, 1].map((k) => {
      const l = new THREE.PointLight(k ? 0xff4a2a : 0x9a7aff, 0, 60, 1.4);
      l.position.set(this.A.x + (k ? 8 : -8), this.A.y + 7, this.A.z + (k ? -6 : 6));
      this.g.scene.add(l);
      // (no cuenta como luz mientras está apagada: World.adoptLight)
      return this.g.world.adoptLight(l);
    });
    this.cineLight = null;
    this.wardMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.braziers = [];
    this.built = false;
    this.shown = false;
    this.flightOn = false;
    this.phase = 'off';
    // el cuerno del Mateendrache, adelante del medio de la isla (la F se arma
    // con el mapa: así tiene el mismo número en todas las compus)
    this.hornPos = new THREE.Vector3(this.A.x, this.A.y + 1.1, this.A.z + 6);
    this.hornCd = 0;
    this.g.interact?.add({
      kind: 'ee',
      local: true,
      wide: true,
      holdTime: 1.1,
      pos: this.hornPos,
      radius: 2.4,
      prompt: () => this.hornPrompt(),
      cost: () => 0,
      use: () => this.hornUse(),
    });
  }

  // ================= el vuelo =================
  // (anfitrión) arranca para todos
  begin() {
    const g = this.g;
    if (this.flightOn || this.active) return;
    g.net?.event('ee', { gg: 'begin' });
    this.flightStart();
  }

  flightStart() {
    const g = this.g;
    if (this.flightOn) return;
    this.flightOn = true;
    // (en todas las compus: el dragón lo maneja la arena desde acá)
    if (g.ee.dragon) g.ee.dragon.mode = 'war';
    const D = g.ee.dragonModel;
    this.D = D;
    D.root.visible = true;
    D.setPose('fly', 1.2);
    D.eyes = 1;
    const p0 = D.root.position.clone();
    // primera parte: de la cumbre, una vuelta alrededor del castillo (mirándolo)
    // y arriba, al remolino de tormenta que se abrió al noroeste
    // (primero sube derecho: yendo de una a (64, 52, 8) pasaba por la nieve
    // de los techos de al lado de la cumbre)
    this.path1 = new THREE.CatmullRomCurve3([p0, p0.clone().add(new THREE.Vector3(1, 13, -1)), new THREE.Vector3(66, 64, 6), new THREE.Vector3(86, 62, 30), new THREE.Vector3(84, 66, 64), new THREE.Vector3(52, 70, 86), new THREE.Vector3(18, 72, 66), new THREE.Vector3(8, 82, 30), new THREE.Vector3(14, 104, -8), new THREE.Vector3(-4, 134, -44)], false, 'centripetal');
    this.focus1 = new THREE.Vector3(52, 30, 42);
    const A = this.A;
    this.path2 = this.flightPath2();
    this.focus2 = new THREE.Vector3(A.x, A.y + 4, A.z + COL.dz * 0.5);
    this.buildPortal();
    this.ft = 0;
    this.rideQ = null;
    this.buildOverlay();
    // arranca en blanco y se aclara (el salto de la vista del jugador al lomo
    // del dragón no se ve; antes el fundido iba de 0 a 0 y no tapaba nada)
    // (más corto y sin llegar al blanco entero: después de la jura con su
    // cámara la pantalla quedaba casi blanca; globalThis.__mduNoJuraCine, como antes)
    const w0 = globalThis.__mduNoJuraCine === true ? 1 : 0.8;
    this.ov.now = w0;
    this.ov.fade.style.opacity = String(w0);
    this.fadeTo(0, w0 < 1 ? 0.7 : 1.1);
    g.hud.show(false);
    g.weapons.vmRoot.visible = false;
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    g.ee.scene = { update: (dt) => this.flightUpdate(dt), kind: 'flight' };
    // el Éter se arma ya (escondido) y sus shaders se compilan en segundo
    // plano mientras vuela sobre el castillo: armado y compilado al entrar,
    // el juego se trababa unos 3 segundos (siete materiales nuevos con todas
    // las luces, de golpe)
    this.buildWorld();
    // (con el relieve de fx/Surfaces ya puesto: lo pone la revisada de PostFX
    // cada tanto y, si no, se compilaba la variante sin relieve, que no sirve)
    g.post?.sweep?.();
    warmScene(g);
    g.ee.cueva?.whistle(1.4);
    g.audio.bossArrive();
  }

  // La segunda parte del vuelo: sale de las nubes lejos de la isla, la rodea
  // (lejos de los pedazos de los mapas) y pasa rasante.
  flightPath2() {
    const A = this.A;
    return new THREE.CatmullRomCurve3([new THREE.Vector3(A.x + 30, A.y + 46, A.z + 150), new THREE.Vector3(A.x + 10, A.y + 26, A.z + 92), new THREE.Vector3(A.x - 30, A.y + 16, A.z + 50), new THREE.Vector3(A.x - 40, A.y + 12, A.z), new THREE.Vector3(A.x - 15, A.y + 8, A.z - 26), new THREE.Vector3(A.x + 14, A.y + 5, A.z - 6), new THREE.Vector3(A.x + 2, A.y + 3, A.z + 14)], false, 'centripetal');
  }

  buildOverlay() {
    const el = document.createElement('div');
    el.className = 'mdu-gg';
    el.innerHTML = '<i class="mdu-gg__fade"></i><i class="mdu-gg__bar"></i><i class="mdu-gg__bar mdu-gg__bar--b"></i><h1 class="mdu-gg__title">La Gran Guerra</h1><p class="mdu-gg__sub">El Éter</p>';
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40';
    const fade = el.querySelector('.mdu-gg__fade');
    fade.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0';
    for (const [i, b] of [...el.querySelectorAll('.mdu-gg__bar')].entries()) b.style.cssText = `position:absolute;left:0;right:0;height:9vh;background:#000;${i ? 'bottom:0' : 'top:0'}`;
    const title = el.querySelector('.mdu-gg__title');
    title.style.cssText = 'position:absolute;left:0;right:0;top:38%;text-align:center;margin:0;font:700 clamp(34px,6vw,84px)/1 Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#f3e2b0;text-shadow:0 0 30px #ff5a2a,0 0 70px #7a2aff;opacity:0;transition:opacity 1.2s';
    const sub = el.querySelector('.mdu-gg__sub');
    sub.style.cssText = 'position:absolute;left:0;right:0;top:calc(38% + clamp(44px,7vw,96px));text-align:center;margin:0;font:italic 400 clamp(16px,2vw,24px)/1 Georgia,serif;color:#d8c8ff;opacity:0;transition:opacity 1.2s';
    this.g.root.appendChild(el);
    this.ov = { el, fade, title, sub, color: '#fff', from: 0, to: 0, t0: 0, d: 0.01, now: 0 };
  }

  fadeTo(v, secs, color) {
    const O = this.ov;
    if (!O) return;
    if (color) O.fade.style.background = color;
    O.from = O.now;
    O.to = v;
    O.t0 = this.ft ?? 0;
    O.d = Math.max(0.01, secs);
  }

  flightUpdate(dt) {
    const g = this.g;
    this.ft += dt;
    const t = this.ft;
    const D = this.D;
    // el fundido
    const O = this.ov;
    if (O) {
      const k = clamp01((t - O.t0) / O.d);
      O.now = O.from + (O.to - O.from) * k;
      O.fade.style.opacity = O.now.toFixed(3);
    }
    if (t < FLIGHT.white) {
      // arriba del dragón: de la cumbre, sobre el castillo y al remolino
      const u = smooth(clamp01(t / FLIGHT.white));
      // mira el castillo mientras lo rodea; después, adelante y arriba
      this.rideAlong(this.path1, u, dt, this.focus1, 0.55 * (1 - smooth(clamp01((u - 0.62) / 0.15))));
      this.updatePortal(dt, t);
      if (t > FLIGHT.up) {
        // se mete en la tormenta: blanco
        if (!this.whiteOn) {
          this.whiteOn = true;
          this.fadeTo(1, FLIGHT.white - FLIGHT.up, '#fff');
          g.audio.thunder?.(g.camera.position.clone());
        }
        g.fx.addShake(0.08);
      }
      if (Math.random() < dt * 1.5 && g.weather) g.weather.flash = Math.max(g.weather.flash || 0, 0.5);
    } else {
      if (!this.swapped) this.swap();
      const u = smooth(clamp01((t - FLIGHT.white) / (FLIGHT.land - FLIGHT.white)));
      this.rideAlong(this.path2, u, dt, this.focus2, 0.35 * smooth(clamp01(u / 0.4)) * (1 - smooth(clamp01((u - 0.7) / 0.3))));
      if (!this.outOn) {
        this.outOn = true;
        this.fadeTo(0, 1.4, '#fff');
        // saliendo de la tormenta, el Éter y el temazo (en cada compu en el mismo momento del vuelo)
        this.playSong();
        g.later(0.8, () => {
          if (this.ov) this.ov.title.style.opacity = '1';
          if (this.ov) this.ov.sub.style.opacity = '1';
        });
        g.later(5.2, () => {
          if (this.ov) this.ov.title.style.opacity = '0';
          if (this.ov) this.ov.sub.style.opacity = '0';
        });
      }
      if (t > FLIGHT.land && !this.landOn) {
        this.landOn = true;
        this.fadeTo(1, FLIGHT.end - FLIGHT.land, '#000');
      }
      if (t >= FLIGHT.end) this.flightEnd();
    }
    // (las tomas de afuera, apagadas: world/flightShots.js, __mduFlightShots)
    if (this.flightOn) flightShot(this, t, dt);
    D.update(dt);
    return true;
  }

  // El remolino de tormenta en el cielo del castillo: la puerta al Éter.
  buildPortal() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const portal = new THREE.Mesh(new THREE.CircleGeometry(46, 64), mat);
    portal.position.set(-12, 150, -62);
    portal.lookAt(20, 90, 20);
    portal.frustumCulled = false;
    this.g.scene.add(portal);
    this.portal = portal;
  }

  updatePortal(dt, t) {
    const P = this.portal;
    if (!P) return;
    const u = P.material.uniforms;
    u.uTime.value = t;
    u.uK.value = Math.min(1, u.uK.value + dt / 3);
    if (Math.random() < dt * 2.5) {
      const a = Math.random() * Math.PI * 2;
      const from = P.position.clone().add(tmpV.set(Math.cos(a) * 30, Math.sin(a) * 30, 0));
      this.g.fx.lightning(from, P.position.clone(), 0xd8b8ff, 0.25);
    }
  }

  // El dragón por el recorrido y la cámara en el lomo, mirando para adelante
  // (y, con `k`, un poco hacia `focus`).
  rideAlong(curve, u, dt, focus = null, k = 0) {
    const g = this.g;
    const D = this.D;
    const p = curve.getPoint(Math.min(0.999, u));
    const ahead = curve.getPoint(Math.min(1, u + 0.02));
    const ahead2 = curve.getPoint(Math.min(1, u + 0.04));
    D.root.position.copy(p);
    const dir = tmpV.subVectors(ahead, p);
    // cuánto va de costado (subiendo derecho casi no se inclina)
    const flat = clamp01(Math.hypot(dir.x, dir.z) / Math.max(1e-6, dir.length()) / 0.5);
    if (this.rideYaw == null) this.rideYaw = D.root.rotation.y;
    // el rumbo: hacia un punto más adelante del recorrido (subiendo derecho la
    // tangente no dice para dónde va, y al despegar de la cumbre giraba de
    // golpe), y girando a lo sumo ~80 grados por segundo
    const far = curve.getPoint(Math.min(1, u + 0.06));
    const hx = far.x - p.x;
    const hz = far.z - p.z;
    const yaw = Math.hypot(hx, hz) > 0.5 ? Math.atan2(hx, hz) : this.rideYaw;
    let dy = yaw - this.rideYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.rideYaw += THREE.MathUtils.clamp(dy * Math.min(1, dt * 2.5), -1.4 * dt, 1.4 * dt);
    // se inclina hacia adentro de las curvas y planea: aletea poco, así las
    // alas no le pasan por la cara al que va arriba
    let turn = Math.atan2(ahead2.x - ahead.x, ahead2.z - ahead.z) - Math.atan2(dir.x, dir.z);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const bank = THREE.MathUtils.clamp(-turn * 4, -0.35, 0.35) * flat;
    this.rideBank = (this.rideBank ?? 0) + (bank - (this.rideBank ?? 0)) * Math.min(1, dt * 2);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6, -0.5, 0.5);
    D.root.quaternion.setFromEuler(dE.set(pitch, this.rideYaw, this.rideBank, 'YXZ'));
    D.flapK = 0.35;
    D.root.updateMatrixWorld(true);
    // la cámara: en la cruz, adelante de las alas (sobre los hombros, cuando
    // miraba de costado el castillo, el ala de ese lado le tapaba media
    // pantalla), mirando por encima de la cabeza
    const cam = g.camera;
    const seat = tmpW.set(0, 4.6, 2.4).applyMatrix4(D.root.matrixWorld);
    cam.position.copy(seat);
    // adelante, por el rumbo (no por la curva: subiendo derecho miraba el
    // cielo) y sin mirar muy para arriba ni muy para abajo
    const lp = THREE.MathUtils.clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.45, 0.2);
    const look = D.head.getWorldPosition(new THREE.Vector3()).add(tmpW.set(Math.sin(this.rideYaw) * Math.cos(lp), Math.sin(lp), Math.cos(this.rideYaw) * Math.cos(lp)).multiplyScalar(30));
    look.y -= 3;
    // el foco: de costado pesa entero; atrás se apaga (antes, al pasar el foco
    // por atrás, la mirada saltaba de un ala a la otra)
    if (focus && k > 0) {
      let fo = Math.atan2(focus.x - cam.position.x, focus.z - cam.position.z) - this.rideYaw;
      while (fo > Math.PI) fo -= Math.PI * 2;
      while (fo < -Math.PI) fo += Math.PI * 2;
      look.lerp(focus, k * smooth(clamp01((Math.cos(fo) + 0.9) / 0.5)));
    }
    // (sin mirar muy de costado: más allá de unos 35 grados se mira por encima
    // del ala y el ala tapa media pantalla)
    const fx = look.x - cam.position.x;
    const fz = look.z - cam.position.z;
    let off = Math.atan2(fx, fz) - this.rideYaw;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    if (Math.abs(off) > 0.6) {
      const a = this.rideYaw + Math.sign(off) * 0.6;
      const h = Math.hypot(fx, fz);
      look.x = cam.position.x + Math.sin(a) * h;
      look.z = cam.position.z + Math.cos(a) * h;
    }
    // la mirada llega de a poco (sin tirones cuando la curva o el foco cambian
    // rápido: al despegar de la cumbre giraba de golpe)
    tmpM.lookAt(cam.position, look, cam.up);
    tmpQ.setFromRotationMatrix(tmpM);
    // (y nunca a más de ~70 grados por segundo, arrancando y frenando suave)
    if (!this.rideQ) {
      this.rideQ = tmpQ.clone();
      this.rideW = 0;
    } else {
      const want = Math.min(1.2, this.rideQ.angleTo(tmpQ) * 2.5);
      this.rideW += THREE.MathUtils.clamp(want - this.rideW, -2.5 * dt, 2.5 * dt);
      this.rideQ.rotateTowards(tmpQ, this.rideW * dt);
    }
    cam.quaternion.copy(this.rideQ);
    cam.updateMatrixWorld();
  }

  flightEnd() {
    const g = this.g;
    if (!this.flightOn) return;
    this.flightOn = false;
    flightShotsEnd(this);
    this.D.flapK = 1;
    this.rideYaw = null;
    this.rideQ = null;
    this.portal?.removeFromParent();
    this.portal?.geometry.dispose();
    this.portal = null;
    g.ee.scene = null;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    g.hud.show(true);
    this.fadeTo(0, 1.2, '#000');
    g.later(1.4, () => {
      this.ov?.el.remove();
      this.ov = null;
    });
    this.start();
  }

  // ================= el cambio de mundo =================
  // Adentro de las nubes: el castillo se va de la memoria y aparece el Éter.
  swap() {
    const g = this.g;
    this.swapped = true;
    // (la mirada arranca de nuevo en el Éter: no gira desde la del castillo)
    this.rideQ = null;
    const w = g.world;
    // el castillo: afuera (las geometrías se liberan; los materiales se reusan)
    w.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    w.root.removeFromParent();
    for (const o of [g.interact?.root, g.barriers?.root, g.critters?.root, g.activities?.root, g.papq?.root, g.luz?.root, g.decor?.root]) if (o) o.visible = false;
    const E = g.ee;
    for (const q of Object.values(E.quests || {})) q.root.visible = false;
    if (E.cueva) E.cueva.root.visible = false;
    if (E.vanguardia) E.vanguardia.root.visible = false;
    if (E.npc) E.npc.root.visible = false;
    if (E.fierroGlow) E.fierroGlow.visible = false;
    // (lo escondido del castillo no se recorre durante la guerra)
    sleepHidden(g.interact?.root, g.barriers?.root, g.critters?.root, g.activities?.root, g.papq?.root, g.luz?.root, g.decor?.root, E.cueva?.root, E.vanguardia?.root, E.npc?.root, ...Object.values(E.quests || {}).map((q) => q.root));
    // los muertos que quedaban, afuera
    if (isHost(g)) {
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      if (g.zombies.boss) g.zombies.removeBoss();
    }
    this.buildWorld();
    this.showWorld();
    this.installWorld();
    g.weather?.set(this.weatherName, false);
    g.renderer.shadowMap.needsUpdate = true;
  }

  // Las funciones del mundo, para que se pueda caminar y tirar en la isla.
  installWorld() {
    const g = this.g;
    const w = g.world;
    const A = this.A;
    const base = { floorAt: w.floorAt, raycast: w.raycast, surfaceAt: w.surfaceAt };
    this.base = base;
    const inIsle = (x, z) => Math.hypot(x - A.x, z - A.z) < A.r + 1.5;
    // (alrededor de la isla, el vacío; lejos, lo que había)
    w.floorAt = (x, z, y) => (inIsle(x, z) ? A.y : Math.hypot(x - A.x, z - A.z) < A.r + 60 ? A.y - 300 : base.floorAt.call(w, x, z, y));
    w.surfaceAt = (x, z) => (inIsle(x, z) ? 'snow' : base.surfaceAt.call(w, x, z));
    w.raycast = (o, d, maxT, hit = {}) => {
      let best = maxT;
      let kind = null;
      const n = tmpN.set(0, 1, 0);
      // el piso de la isla
      if (d.y < -1e-6) {
        const t = (A.y - o.y) / d.y;
        if (t > 0 && t < best) {
          const px = o.x + d.x * t;
          const pz = o.z + d.z * t;
          if (inIsle(px, pz)) {
            best = t;
            kind = 'floor';
          }
        }
      }
      // las columnas y los altares de la isla, y el cuerpo del coloso
      for (const S of this.solids) {
        const t = raySphereT(o, d, S.c, S.r);
        if (t >= 0 && t < best) {
          best = t;
          kind = S.kind;
          n.set(o.x + d.x * t - S.c.x, o.y + d.y * t - S.c.y, o.z + d.z * t - S.c.z).normalize();
        }
      }
      if (!kind) return Infinity;
      hit.t = best;
      hit.box = kind;
      hit.normal = hit.normal || new THREE.Vector3();
      hit.normal.copy(n);
      hit.point = hit.point || new THREE.Vector3();
      hit.point.set(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
      return best;
    };
  }

  // ================= el Éter =================
  buildWorld() {
    if (this.built) return;
    this.built = true;
    const g = this.g;
    const M = g.world.M;
    const A = this.A;
    this.solids = [];
    // la isla: arriba lajas y nieve (buildFloor), abajo roca en punta
    this.buildFloor();
    const underG = new THREE.ConeGeometry(A.r + 1.6, 34, 40, 8, true);
    const up = underG.attributes.position;
    for (let i = 0; i < up.count; i++) {
      const y = up.getY(i);
      const a = Math.atan2(up.getZ(i), up.getX(i));
      const k = 1 + Math.sin(a * 9 + y * 0.3) * 0.08 + Math.sin(a * 23) * 0.04;
      up.setX(i, up.getX(i) * k);
      up.setZ(i, up.getZ(i) * k);
    }
    underG.computeVertexNormals();
    const under = new THREE.Mesh(underG, M.caveRock || M.stoneDark);
    under.rotation.x = Math.PI;
    under.position.set(A.x, A.y - 17.05, A.z);
    this.root.add(under);
    // el filo de nieve del borde
    const rim = new THREE.Mesh(new THREE.TorusGeometry(A.r + 1.3, 0.5, 6, 64).rotateX(Math.PI / 2), M.snowCap || M.snow || M.ground);
    rim.position.set(A.x, A.y - 0.3, A.z);
    rim.scale.y = 0.6;
    this.root.add(rim);
    // las columnas rotas (en ronda) y los cuatro altares; ninguna columna
    // delante de donde aparecen los jugadores ni del borde que da al coloso
    const st = M.castleStone || M.stone;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 10 + 0.3;
      const d = A.r - 3.2;
      const x = A.x + Math.cos(a) * d;
      const z = A.z + Math.sin(a) * d;
      const h = 2 + ((k * 7) % 5) * 0.9;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 10), st);
      col.position.set(x, A.y + h / 2, z);
      col.rotation.z = ((k % 3) - 1) * 0.06;
      this.root.add(col);
      this.solids.push({ c: new THREE.Vector3(x, A.y + h / 2, z), r: 0.7, kind: 'column' });
      g.world.addBox?.([x - 0.6, A.y, z - 0.6, x + 0.6, A.y + h, z + 0.6], { kind: 'prop' });
    }
    this.altarSpots = {};
    ELEMENTS.forEach((el, i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = A.x + Math.cos(a) * 12;
      const z = A.z + Math.sin(a) * 12;
      const res = DECOR.altarMate(M, { kind: el });
      res.obj.position.set(x, A.y, z);
      this.root.add(res.obj);
      this.altarSpots[el] = [x, z];
      this.solids.push({ c: new THREE.Vector3(x, A.y + 0.8, z), r: 0.9, kind: 'altar' });
    });
    this.buildHorn();
    this.buildAltarRings();
    this.buildCracks();
    this.buildSky();
    this.buildFragments();
    this.buildColossus();
    this.braziers = [];
  }

  // Al entrar al Éter: se ve la isla y los altares se mudan a ella.
  showWorld() {
    if (this.shown) return;
    this.shown = true;
    this.root.visible = true;
    this.g.ee.altares?.relocate(this.altarSpots, this.A.y);
  }

  // El piso de la isla: una plaza de lajas en el medio (con su cordón de
  // piedra y nieve que se le metió en los rincones) y nieve alrededor, con
  // montoncitos contra el borde. Las texturas van a escala, como los pisos del
  // castillo (una vuelta cada 2 m): con las UV del círculo entero la nieve
  // quedaba estirada veinte veces y se veía lisa, sin relieve.
  buildFloor() {
    const M = this.g.world.M;
    const A = this.A;
    const R = A.r + 1.5;
    const PLAZA = 15;
    // (en el plano: se levanta con h(r, a) y se acuesta al final)
    const disc = (geo, h) => {
      const p = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i);
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        // el borde se desgrana
        if (r > A.r - 1) {
          const k = 1 + Math.sin(a * 11) * 0.03 + Math.sin(a * 5 + 1) * 0.04;
          x *= k;
          y *= k;
        }
        p.setXYZ(i, x, y, h ? h(r, a) : 0);
        uv.setXY(i, x / 2, y / 2);
      }
      geo.rotateX(-Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    };
    // la nieve: pareja cerca de la plaza, amontonada contra el borde
    const drift = (r, a) => {
      const e = clamp01((r - (A.r - 2.4)) / 2.4);
      return smooth(e) * (0.16 + Math.sin(a * 6 + 1.3) * 0.07 + Math.sin(a * 17) * 0.03) + Math.sin(a * 23 + r * 1.7) * Math.sin(r * 2.3) * 0.015;
    };
    const snow = new THREE.Mesh(disc(new THREE.RingGeometry(PLAZA - 0.3, R, 160, 14), drift), M.snow || M.ground);
    snow.position.set(A.x, A.y, A.z);
    snow.receiveShadow = true;
    this.root.add(snow);
    const plaza = new THREE.Mesh(disc(new THREE.CircleGeometry(PLAZA, 120)), M.flagstone || M.stoneStep || M.snow);
    plaza.position.set(A.x, A.y + 0.012, A.z);
    plaza.receiveShadow = true;
    this.root.add(plaza);
    // el cordón de piedra alrededor de la plaza (tapa la unión con la nieve)
    const curbG = new THREE.TorusGeometry(PLAZA, 0.26, 4, 180);
    const cu = curbG.attributes.uv;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, (cu.getX(i) * Math.PI * 2 * PLAZA) / 2, cu.getY(i) * 0.5);
    curbG.rotateX(Math.PI / 2);
    curbG.scale(1, 0.4, 1);
    const curb = new THREE.Mesh(curbG, M.castleStone || M.stone);
    curb.position.set(A.x, A.y + 0.02, A.z);
    curb.receiveShadow = true;
    this.root.add(curb);
    // nieve que se metió en la plaza, contra el cordón
    const blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.snowCap || M.snow, 16);
    let seed = 91;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rnd() * 0.3;
      const d = PLAZA - 0.6 - rnd() * 0.8;
      tmpM.compose(tmpV.set(A.x + Math.cos(a) * d, A.y, A.z + Math.sin(a) * d), tmpQ.setFromAxisAngle(UP, -a), tmpW.set(0.5 + rnd() * 0.8, 0.05 + rnd() * 0.04, 1 + rnd() * 1.4));
      blobs.setMatrixAt(k, tmpM);
    }
    blobs.receiveShadow = true;
    this.root.add(blobs);
  }

  // El cuerno del Mateendrache: un cuerno de hueso enroscado con anillos de
  // oro, sobre un pedestal de piedra (brilla cuando se puede soplar).
  buildHorn() {
    const g = this.g;
    const M = g.world.M;
    const hp = this.hornPos;
    const grp = new THREE.Group();
    grp.position.set(hp.x, this.A.y, hp.z);
    this.root.add(grp);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.85, 8), M.castleStone || M.stone);
    ped.position.y = 0.42;
    grp.add(ped);
    this.solids.push({ c: new THREE.Vector3(hp.x, this.A.y + 0.5, hp.z), r: 0.55, kind: 'altar' });
    const bone = new THREE.MeshStandardMaterial({ color: 0xe6d8b8, roughness: 0.55 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc8963a, metalness: 0.85, roughness: 0.3 });
    // la curva del cuerno: de la boquilla (finita) a la campana (ancha)
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, 0.02, -0.1), new THREE.Vector3(0.3, 0.3, -0.05), new THREE.Vector3(-0.02, 0.4, 0), new THREE.Vector3(-0.32, 0.26, 0.06), new THREE.Vector3(-0.46, 0.02, 0.12)]);
    const TS = 40;
    const RS = 12;
    const tube = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const tp = tube.attributes.position;
    const pt = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) {
      const u = i / TS;
      curve.getPointAt(u, pt);
      const r = 0.028 + u * u * 0.15;
      for (let j = 0; j <= RS; j++) {
        const k = i * (RS + 1) + j;
        tp.setXYZ(k, pt.x + (tp.getX(k) - pt.x) * r, pt.y + (tp.getY(k) - pt.y) * r, pt.z + (tp.getZ(k) - pt.z) * r);
      }
    }
    tube.computeVertexNormals();
    const horn = new THREE.Group();
    horn.position.y = 0.88;
    grp.add(horn);
    horn.add(new THREE.Mesh(tube, bone));
    // los anillos de oro y el borde de la campana
    for (const u of [0.12, 0.42, 0.7, 1]) {
      curve.getPointAt(u, pt);
      const tan = curve.getTangentAt(u);
      const r = 0.028 + u * u * 0.15;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, u === 1 ? 0.018 : 0.012, 6, 20), gold);
      ring.position.copy(pt);
      ring.lookAt(pt.clone().add(tan));
      horn.add(ring);
    }
    // el resplandor de cuando está listo
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffc860, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    glow.position.y = 1.2;
    glow.scale.setScalar(1.8);
    grp.add(glow);
    this.horn = { grp, horn, glow, blow: 0 };
  }

  // Los círculos de los altares (la tercera parte): se llenan con alguien
  // parado adentro; prendido, el altar larga una columna de luz y un rayo al
  // remolino del duende.
  buildAltarRings() {
    const A = this.A;
    const add = (col, o = 0.6) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pillarG = new THREE.CylinderGeometry(0.45, 0.9, 34, 16, 1, true);
    const beamG = new THREE.CylinderGeometry(0.1, 0.16, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.altRings = ELEMENTS.map((el) => {
      const [x, z] = this.altarSpots[el];
      const col = new THREE.Color(ELEM_COLOR[el]).multiplyScalar(1.6);
      const grp = new THREE.Group();
      grp.position.set(x, A.y + 0.05, z);
      grp.visible = false;
      this.root.add(grp);
      const ring = new THREE.Mesh(this.rainGeo, add(col));
      ring.scale.setScalar(ALTAR_R);
      const fill = new THREE.Mesh(this.rainFill, add(col, 0.28));
      fill.scale.setScalar(0.01);
      const pillar = new THREE.Mesh(pillarG, add(col, 0));
      pillar.material.side = THREE.DoubleSide;
      pillar.position.y = 17;
      pillar.visible = false;
      grp.add(ring, fill, pillar);
      const beam = new THREE.Mesh(beamG, add(col, 0.8));
      beam.position.set(x, A.y + 1.7, z);
      beam.visible = false;
      this.root.add(beam);
      return { el, grp, ring, fill, pillar, beam };
    });
  }

  // Las grietas del caos: rajaduras oscuras que salen del medio de la isla con
  // brasa adentro (una textura transparente arriba de la nieve).
  buildCracks() {
    const A = this.A;
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d');
    x.lineCap = 'round';
    x.lineJoin = 'round';
    let seed = 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // primero las líneas (cada rajadura con sus ramas), después se dibujan
    const lines = [];
    const crack = (px, py, a, len, w, depth) => {
      const pts = [[px, py]];
      let cx = px;
      let cy = py;
      const steps = Math.max(3, Math.round(len / 18));
      for (let k = 0; k < steps; k++) {
        a += (r() - 0.5) * 0.8;
        cx += Math.cos(a) * (len / steps);
        cy += Math.sin(a) * (len / steps);
        pts.push([cx, cy]);
        if (depth < 2 && r() < 0.22) crack(cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.45, w * 0.6, depth + 1);
      }
      lines.push({ pts, w });
    };
    for (let k = 0; k < 11; k++) crack(S / 2, S / 2, (k / 11) * Math.PI * 2 + r() * 0.4, S * (0.3 + r() * 0.2), 1, 0);
    // (tres pasadas: el resplandor, el borde quemado y la brasa del medio)
    const pass = (w, color, blur) => {
      x.strokeStyle = color;
      x.shadowColor = '#ff4a10';
      x.shadowBlur = blur;
      for (const L of lines) {
        x.beginPath();
        x.moveTo(...L.pts[0]);
        for (const q of L.pts) x.lineTo(...q);
        x.lineWidth = Math.max(1, w * L.w);
        x.stroke();
      }
    };
    pass(12, 'rgba(255, 80, 20, 0.28)', 14);
    pass(5, '#1a0804', 0);
    pass(2.4, '#ffb050', 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.g.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(A.r + 1.2, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.position.set(A.x, A.y + 0.03, A.z);
    m.visible = false;
    this.root.add(m);
    this.cracks = m;
  }

  // El cielo del Éter: un remolino de tormenta violeta con el ojo dorado arriba,
  // y un mar de nubes abajo.
  buildSky() {
    const A = this.A;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uChaos: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 48, 24), mat);
    sky.position.set(A.x, A.y, A.z);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.root.add(sky);
    this.sky = sky;
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const clouds = new THREE.Mesh(new THREE.CircleGeometry(340, 64).rotateX(-Math.PI / 2), cloudMat);
    clouds.position.set(A.x, A.y - 46, A.z);
    this.root.add(clouds);
    this.clouds = clouds;
  }

  // Los pedazos de los mapas, flotando sobre rocas alrededor de la isla
  // (world/eterFragments.js: una maqueta de cada uno).
  buildFragments() {
    const g = this.g;
    const A = this.A;
    this.fragments = buildFragments(g);
    // lejos (a unos 64 m, afuera de las vueltas y las pasadas del dragón), con
    // el frente hacia la isla y el borde de la roca prendido del color de cada mapa
    this.fragments.forEach((f) => {
      const F = f.userData.frag;
      f.position.set(A.x + F.at[0], A.y + F.at[1], A.z + F.at[2]);
      f.userData.y0 = f.position.y;
      f.userData.ph = F.at[0] * 0.37;
      f.rotation.y = Math.atan2(A.x - f.position.x, A.z - f.position.z);
      f.scale.setScalar(1.15);
      const cone = f.children[0];
      const rim = new THREE.Mesh(cone.geometry, rimMaterial(F.rim));
      rim.position.copy(cone.position);
      rim.rotation.copy(cone.rotation);
      rim.scale.setScalar(1.04);
      rim.renderOrder = 3;
      f.add(rim);
      this.root.add(f);
    });
    // piedras sueltas que flotan (nunca en el camino del dragón ni en un pedazo)
    this.root.add(floatingRocks(g.world.M, A, (p, r) => this.rockBlocked(p, r)));
  }

  // ¿Una piedra que flota en p (radio r) molestaría? Lejos del camino con que
  // el dragón llega al Éter, de por donde vuela en la pelea y de los pedazos.
  rockBlocked(p, r) {
    const A = this.A;
    if (Math.hypot(p.x - A.x, p.z - A.z) < 50 + r) return true;
    this.flightPts ||= this.flightPath2().getSpacedPoints(80);
    for (const q of this.flightPts) if (q.distanceTo(p) < r + 12) return true;
    for (const f of this.fragments) if (f.position.distanceTo(p) < r + 16) return true;
    return false;
  }

  // El coloso: el duende del Chiquitijuein, agrandado, con las cuatro gemas
  // en el poncho y una columna de humo negro que le sale de abajo.
  buildColossus() {
    const g = this.g;
    const A = this.A;
    const rig = buildChiqui(g.textures);
    const C = rig.root;
    // (agrandado 36 veces el poncho negro quedaba liso: la guarda brilla como
    // brasa; la textura de lo que brilla tiene el mismo dibujo que la del poncho)
    // (el mismo dibujo que la textura del poncho, 64x128, pintado a 4x: con 36
    // de escala una línea de un pixel se veía como un collar de cuentas)
    const ember = document.createElement('canvas');
    ember.width = 256;
    ember.height = 512;
    const ex = ember.getContext('2d');
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, 256, 512);
    ex.fillStyle = '#ff3a12';
    ex.fillRect(0, 392, 256, 20);
    ex.fillRect(0, 460, 256, 20);
    ex.fillStyle = '#ffa030';
    for (let i = 0; i < 256; i += 32) {
      ex.beginPath();
      ex.moveTo(i, 448);
      ex.lineTo(i + 16, 420);
      ex.lineTo(i + 32, 448);
      ex.fill();
    }
    // y grietas de fuego que bajan del cuello: quebradas, con alguna rama, más
    // finas abajo; primero el halo ancho y oscuro y encima el filo encendido
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cracks = [];
    for (const x0 of [22, 70, 104, 150, 196, 236]) {
      const pts = [[x0 + (rnd() - 0.5) * 16, 0]];
      const end = 250 + rnd() * 120;
      for (let y = 14 + rnd() * 10; y < end; y += 12 + rnd() * 16) {
        const [px] = pts[pts.length - 1];
        pts.push([px + (rnd() - 0.5) * 22, y]);
      }
      cracks.push(pts);
      // una rama que sale de costado y se corta
      const at = 2 + Math.floor(rnd() * (pts.length - 4));
      const br = [pts[at]];
      const dir = rnd() < 0.5 ? -1 : 1;
      for (let j = 0; j < 4; j++) {
        const [px, py] = br[br.length - 1];
        br.push([px + dir * (6 + rnd() * 10), py + 8 + rnd() * 14]);
      }
      cracks.push(br);
    }
    ex.lineJoin = 'round';
    ex.lineCap = 'round';
    for (const [w, color] of [[9, 'rgba(120, 14, 4, 0.55)'], [4, '#d8300e'], [1.6, '#ffb050']]) {
      ex.strokeStyle = color;
      for (const pts of cracks) {
        // (se afinan hacia la punta: cada tramo un poco más fino)
        for (let i = 1; i < pts.length; i++) {
          ex.lineWidth = w * (1 - (0.7 * i) / pts.length);
          ex.beginPath();
          ex.moveTo(pts[i - 1][0], pts[i - 1][1]);
          ex.lineTo(pts[i][0], pts[i][1]);
          ex.stroke();
        }
      }
    }
    const emberTex = new THREE.CanvasTexture(ember);
    emberTex.colorSpace = THREE.SRGBColorSpace;
    C.traverse((o) => {
      const m = o.material;
      // (el cuerpo de verdad comparte el material con los otros: lo suyo va en skinColossus)
      if (!o.isMesh || !m?.map || !m.emissive || o.userData.chiquiSkin) return;
      m.emissive.set(0xffffff);
      m.emissiveMap = emberTex;
      m.emissiveIntensity = 1.6;
    });
    C.scale.setScalar(COL.scale);
    C.position.set(A.x, A.y + COL.dy, A.z + COL.dz);
    C.visible = false;
    this.root.add(C);
    this.col = { rig, root: C, rise: 0, lean: 0, glitch: 0, slamT: -1, dissolve: 0 };
    // la columna de humo
    const smoke = new THREE.Mesh(new THREE.CylinderGeometry(9, 2, 40, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x080406, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    smoke.position.set(A.x, A.y + COL.dy - 20, A.z + COL.dz);
    smoke.visible = false;
    this.root.add(smoke);
    this.col.smoke = smoke;
    // las gemas
    this.gems = ELEMENTS.map((el) => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ELEM_COLOR[el]).multiplyScalar(1.8), toneMapped: false });
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), mat);
      m.scale.set(1, 1.4, 0.6);
      m.position.set(...GEMS[el]);
      C.add(m);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: ELEM_COLOR[el], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
      s.scale.setScalar(0.14);
      s.position.copy(m.position).setZ(m.position.z + 0.01);
      C.add(s);
      return { el, mesh: m, glow: s, col: new THREE.Color(ELEM_COLOR[el]), hp: GEM_HP, pos: new THREE.Vector3(), lastWind: -9, shake: 0 };
    });
    // el cuerpo, para que los tiros y las bolas le peguen
    this.colSolids = [
      { local: new THREE.Vector3(0, 0.5, 0.02), r: 0.27, kind: 'coloso' },
      { local: new THREE.Vector3(0, 0.88, 0), r: 0.17, kind: 'coloso' },
    ].map((s) => ({ ...s, c: new THREE.Vector3(), r: s.r * COL.scale }));
    // con el cuerpo de verdad: se mueve con clips (no camina: el manotazo, los
    // hechizos, el grito), la piel con brasas y las gemas cosidas al pecho
    rig.auto = false;
    rig.idle = 'taunt';
    rig.onSkin(() => this.skinColossus());
    // el duende chiquito (para la última parte)
    const gn = buildChiqui(g.textures);
    // (parado, varía los gestos: world/Chiqui.js idleMix)
    gn.vary = true;
    gn.root.scale.setScalar(1.3);
    gn.root.visible = false;
    this.root.add(gn.root);
    this.gnome = { rig: gn, root: gn.root, pos: new THREE.Vector3(A.x, A.y, A.z), target: null, hp: GNOME_HP, max: GNOME_HP, blinkT: 6, net: null, pinned: false, stun: 0, cower: 0, mineT: 3, throwT: 4, trickN: 0, grow: 0 };
    // las estrellitas del mareo (encima del sombrero)
    const stars = new THREE.Group();
    stars.position.y = 1.08;
    stars.visible = false;
    gn.root.add(stars);
    for (let k = 0; k < 4; k++) {
      const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffe070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      st.scale.setScalar(0.1);
      stars.add(st);
    }
    this.gnome.stars = stars;
    // los espejitos: cuatro duendes de mentira
    this.fakes = [0, 1, 2, 3].map(() => {
      const r = buildChiqui(g.textures);
      r.root.scale.setScalar(1.3);
      r.root.visible = false;
      this.root.add(r.root);
      return { rig: r, root: r.root, pos: new THREE.Vector3(), target: null, alive: false, net: null, solid: { c: new THREE.Vector3(), r: 0.75, kind: 'gnome' } };
    });
    // el remolino del caos: una bola de viento negro y colorado alrededor del duende
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 } }, vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.shield.visible = false;
    this.root.add(this.shield);
    this.shieldSolid = { c: new THREE.Vector3(), r: 2.6, kind: 'shield' };
    // las trampas de yerba (se arman con el coloso: no se compila nada en la pelea)
    this.mineGeo = new THREE.ConeGeometry(0.34, 0.24, 9, 1);
    this.mineMat = new THREE.MeshStandardMaterial({ color: 0x2c3a12, roughness: 1, emissive: 0xff2a10, emissiveIntensity: 0.5 });
    this.mineRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a14).multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    // los cuatro caballeros de la luz de antes (ánimas)
    this.knights = new Avatars(g, null);
    this.knightIds = ELEMENTS.map((el, i) => {
      const id = 600 + i;
      // (sin cartel con el nombre: el cartel cortaba los nombres largos)
      this.knights.add({ id, name: KNIGHT_NAMES[el], noTag: true, pos: new THREE.Vector3(A.x, A.y - 50, A.z), yaw: 0, pitch: 0, speed: 0, moving: false });
      const a = this.knights.list.get(id);
      for (const m of Object.values(a.M)) {
        m.transparent = true;
        m.opacity = 0.55;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(ELEM_COLOR[el]);
          m.emissiveIntensity = 1.2;
        }
      }
      a.M.poncho.color.set(ELEM_COLOR[el]);
      return id;
    });
    this.knights.root.visible = false;
  }

  // El coloso con el cuerpo de verdad: grietas de fuego en la piel, las gemas
  // colgadas del pecho (siguen al cuerpo cuando se agacha) y el cuerpo medido
  // de nuevo (el modelo es más angosto que el de piezas).
  skinColossus() {
    const C = this.col;
    C.ember = chiquiEmber(C.rig);
    const meta = chiquiMeta();
    const BONE = { viento: 'Spine01', fuego: 'Spine01', rayo: 'Spine01', hielo: 'Spine02' };
    for (const G of this.gems) {
      const p = meta?.gems?.[G.el];
      if (!p) continue;
      const a = chiquiAnchor(C.rig, BONE[G.el], p);
      a.add(G.mesh, G.glow);
      G.base = [0, 0, 0.012];
      G.mesh.position.set(0, 0, 0.012);
      G.glow.position.set(0, 0, 0.024);
    }
    this.colSolids[0].local.set(0, 0.46, 0.02);
    this.colSolids[0].r = 0.2 * COL.scale;
    this.colSolids[1].local.set(0, 0.84, 0.02);
    this.colSolids[1].r = 0.19 * COL.scale;
    // el ala del sombrero (el dragón la esquiva): altura y radio
    this.colBrim = [0.86, 0.3];
  }

  // Mira al jugador. Con el cuerpo de verdad, corriendo mira adonde va y la
  // cabeza sigue al jugador (hasta donde da el cuello).
  faceGnome(F, p, dt) {
    const toP = Math.atan2(p.x - F.pos.x, p.z - F.pos.z);
    const R = F.rig;
    if (!R.skin) {
      F.root.rotation.set(0, toP, 0);
      return;
    }
    F.lastPos ||= F.pos.clone();
    const dx = F.pos.x - F.lastPos.x;
    const dz = F.pos.z - F.lastPos.z;
    F.lastPos.copy(F.pos);
    const sp = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const moving = sp > 0.8 && sp < 30;
    if (moving) F.moveYaw = Math.atan2(dx, dz);
    F.runK = (F.runK || 0) + ((moving ? 1 : 0) - (F.runK || 0)) * Math.min(1, dt * 6);
    const want = F.runK > 0.5 && F.moveYaw != null ? F.moveYaw : toP;
    F.yaw = F.yaw == null ? want : F.yaw + wrapPi(want - F.yaw) * Math.min(1, dt * 10);
    F.root.rotation.set(0, F.yaw, 0);
    R.head.rotation.set(0, Math.max(-1.1, Math.min(1.1, wrapPi(toP - F.yaw))), 0);
  }

  // La lluvia de fuego (en todas las compus): el coloso levanta la mano al cielo.
  spawnRain(flat) {
    super.spawnRain(flat);
    if (this.stage === 'gems' && !this.col.rig.one) this.col.rig.act('cast');
  }

  // Una bola de fuego (en todas las compus): si sale del duende, la tira con
  // la mano (el anfitrión ya la arrancó antes: acá solo los invitados).
  spawnFireball(from, vel) {
    super.spawnFireball(from, vel);
    const N = this.gnome;
    if (N?.root.visible && N.rig.one?.name !== 'throw' && from.distanceTo(N.pos) < 2.5) N.rig.act('throw', { at: (chiquiMeta()?.clips.throw.key ?? 0.5) - 0.1 });
  }

  // ================= la pelea =================
  start() {
    const g = this.g;
    // (si llega el aviso del anfitrión en pleno vuelo, el vuelo termina y arranca)
    if (this.flightOn) return this.flightEnd();
    if (this.active) return undefined;
    if (!this.swapped) this.swap();
    super.start();
    if (g.ee.dragon) g.ee.dragon.mode = 'war';
    this.D ||= g.ee.dragonModel;
    this.phase = isHost(g) ? 'rise' : 'guest';
    this.stage = 'rise';
    this.t = 0;
    this.col.root.visible = true;
    this.col.smoke.visible = true;
    this.col.rise = 0;
    for (const l of this.lights) l.intensity = 30;
    this.cd = { slam: 9, rain: 14, fire: 6, meteor: 18, horde: 4, strafe: 10 };
    this.waves = [];
    this.meteors = [];
    this.marks = [];
    this.dragonT = 0;
    this.strafe = null;
    this.mines = [];
    this.trick = null;
    this.hornCd = 0;
    this.floatT = 0;
    this.chaosK = 0;
    this.skyFlash = 0;
    g.hud.location(this.name, this.sub);
    if (this.song) g.hud.toast(`♪ ${SONG.name}`);
    // (lo dice el anfitrión y les llega a todos: el que entra tarde, en el
    // caos, no tiene que leer lo de las gemas)
    if (isHost(g)) announce(g, '¡El Chiquitijuein en su forma verdadera! Rompan las gemas del poncho de a una: solo se rompe la que brilla, con el mate de la luz de su color.', 6, true);
    chiquiGiggle(g.audio, { pos: this.col.root.position.clone().setY(this.A.y + 15), gain: 2.2, ref: 40, pitch: 0.55 });
    // (el invitado que llega tarde o termina el vuelo después: le pide al
    // anfitrión cómo va la pelea, que no la manda sola cada tanto)
    if (!isHost(g)) g.net?.net.send({ t: 'pee', a: 'gg', k: 'sync' });
    return undefined;
  }

  // El que entra con la pelea empezada (net/Session.applyFullState): la etapa
  // del anfitrión ya; lo demás (gemas, vida, altares) llega con el 'st'.
  lateJoin(stage) {
    if (stage && stage !== this.stage) this.setStage(stage);
  }

  // (lo usa la base: acá el jefe es el coloso, no un muerto)
  spawnBoss() {}

  standing() {
    return super.standing();
  }

  // ---------------- los tiros de los jugadores ----------------
  onShot(o, d, maxT) {
    if (!this.active) return;
    const g = this.g;
    // (los mates de la luz avisan por onElemental: esto es para las balas)
    if (this.stage === 'gems' && g.weapons.stats?.kind !== 'elemental') {
      for (const G of this.gems) {
        if (G.hp <= 0) continue;
        if (rayHit(o, d, maxT + 60, G.pos, 1.6) >= 0) {
          G.shake = 0.5;
          if (!this.bulletSaid || g.time - this.bulletSaid > 8) {
            this.bulletSaid = g.time;
            g.hud.subtitle('Las balas no le hacen nada: solo el mate de la luz de su color.', 2.5);
          }
          return;
        }
      }
    }
    if (this.stage === 'gnome' || this.stage === 'pin') {
      // (el tiro frena en la esfera del duende, antes de su centro; con los
      // espejitos, pega en el primero que encuentra)
      let best = -1;
      let bt = rayHit(o, d, maxT + 0.8, this.gnomeCenter(tmpV), this.gnomeR());
      if (bt >= 0) best = 'real';
      else bt = Infinity;
      if (this.trick) {
        this.fakes.forEach((F, i) => {
          if (!F.alive) return;
          const t = rayHit(o, d, maxT + 0.8, tmpW.copy(F.pos).setY(F.pos.y + 0.7), 0.6);
          if (t >= 0 && t < bt) {
            bt = t;
            best = i;
          }
        });
      }
      if (best === 'real') this.hitGnome(160);
      else if (best !== -1) this.hitFake(best);
    }
    if (this.stage === 'chaos' && rayHit(o, d, maxT + 3, this.shieldSolid.c, this.shieldSolid.r) >= 0) this.shieldHit();
  }

  // Dónde le pegan al duende (crece en el caos y queda más grande sujetado).
  gnomeCenter(out) {
    const s = this.gnome.root.scale.x;
    return out.copy(this.gnome.pos).setY(this.gnome.pos.y + 0.54 * s);
  }

  gnomeR() {
    return 0.46 * this.gnome.root.scale.x;
  }

  // Un tiro al remolino: no le entra nada (chispas y el aviso).
  shieldHit() {
    const g = this.g;
    if (g.time - (this.shieldHitT ?? -9) < 0.12) return;
    this.shieldHitT = g.time;
    const c = this.shieldSolid.c;
    g.fx.sparkle(tmpW.set(c.x + (Math.random() - 0.5) * 3, c.y + (Math.random() - 0.5) * 3, c.z + (Math.random() - 0.5) * 3), [1, 0.25, 0.1], 5, 0.4);
    if (!this.shieldSaid || g.time - this.shieldSaid > 9) {
      this.shieldSaid = g.time;
      g.hud.subtitle('Adentro del remolino no le entra nada: prendan los cuatro altares.', 3);
    }
  }

  // El soplido del Zonda sin cargar: la gema del viento, si le llega el cono.
  onBlast(o, d, range, angle) {
    if (!this.active) return;
    if (this.stage === 'gnome' || this.stage === 'pin') {
      const inCone = (c) => {
        const to = tmpV.copy(c).sub(o);
        const len = to.length();
        return len < range && to.dot(d) / (len || 1) > Math.cos(angle + 0.1) ? len : -1;
      };
      const len = inCone(this.gnomeCenter(tmpW));
      if (len >= 0) this.hitGnome(len < range * 0.6 ? 420 : 240);
      if (this.trick) {
        this.fakes.forEach((F, i) => {
          if (F.alive && inCone(tmpW.copy(F.pos).setY(F.pos.y + 0.7)) >= 0) this.hitFake(i);
        });
      }
      return;
    }
    if (this.stage !== 'gems') return;
    const G = this.gems[ELEMENTS.indexOf('viento')];
    if (G.hp <= 0) return;
    const to = tmpV.subVectors(G.pos, o);
    const len = to.length();
    if (len > range + 3 || to.dot(d) / (len || 1) < Math.cos(angle + 0.15)) return;
    this.onElemental('viento', G.pos.clone(), false);
  }

  // ¿El tiro de un mate de la luz reventó sobre la gema? Las gemas van cosidas
  // al poncho, adentro de la esfera del cuerpo (colSolids): la bola de fuego,
  // el rayo y las agujas revientan contra la esfera, varios metros adelante de
  // la gema, y nunca contaba. Delante del coloso cuenta lo de costado y lo
  // alto, no lo hondo.
  gemNear(G, pos, r) {
    const d = (this.gemD ||= new THREE.Vector3()).subVectors(pos, G.pos);
    const fw = (this.gemF ||= new THREE.Vector3()).set(0, 0, 1).applyQuaternion(this.col.root.quaternion);
    const depth = d.dot(fw);
    if (depth > -2 && depth < 12) d.addScaledVector(fw, -depth);
    return d.length() < r;
  }

  onElemental(el, pos, charged) {
    if (!this.active) return;
    const g = this.g;
    if (this.stage === 'gems') {
      const i = ELEMENTS.indexOf(el);
      const G = this.gems[i];
      if (G.hp <= 0) return;
      let near = this.gemNear(G, pos, charged ? 5 : 3);
      // el remolino no llega: sube por el borde de la isla que da al coloso
      if (el === 'viento' && charged && !near) {
        const edgeZ = this.A.z - this.A.r + 5;
        near = pos.z < edgeZ && Math.abs(pos.x - this.A.x) < 12 && g.time - G.lastWind > 2.2;
        if (near) G.lastWind = g.time;
      }
      // solo se rompe la que brilla: a las otras no les entra nada
      const A = this.gems[this.gemOn];
      if (i !== this.gemOn) {
        if (near) G.shake = 0.4;
        if (A && (near || this.gemNear(A, pos, charged ? 5 : 3)) && (!this.dimSaid || g.time - this.dimSaid > 6)) {
          this.dimSaid = g.time;
          g.hud.subtitle(`Esa no: solo se rompe la que brilla, la del ${ELEM_NAME[A.el]} (con ${ELEM_NAME[A.el]}, el mate del ${A.el}).`, 3);
        }
        return;
      }
      if (!near) return;
      const v = charged ? 1 : 0.25;
      this.gemFx(i, charged);
      g.hud.hitmarker(charged);
      if (isHost(g)) this.hitGem(i, v);
      else g.net.net.send({ t: 'pee', a: 'gg', k: 'gem', i, v });
      return;
    }
    if (this.stage === 'gnome' || this.stage === 'pin') {
      if (this.trick) {
        this.fakes.forEach((F, i) => {
          if (F.alive && pos.distanceTo(F.pos) < (charged ? 4 : 2.2)) this.hitFake(i);
        });
      }
      if (pos.distanceTo(this.gnome.pos) >= (charged ? 5 : 2.5) + (this.gnome.root.scale.x - 1.3) * 0.5) return;
      // el remolino avisa cada cuarto de segundo: pega de a un golpe por vez
      if (el === 'viento' && charged) {
        if (g.time - (this.windGnomeT ?? -9) < 0.8) return;
        this.windGnomeT = g.time;
      }
      this.hitGnome(charged ? 900 : 260);
    }
    if (this.stage === 'chaos' && pos.distanceTo(this.shieldSolid.c) < this.shieldSolid.r + 2) this.shieldHit();
  }

  onExplosion(pos, r) {
    if (!this.active || (this.stage !== 'gnome' && this.stage !== 'pin')) return;
    if (this.trick) {
      this.fakes.forEach((F, i) => {
        if (F.alive && pos.distanceTo(F.pos) < r + 0.6) this.hitFake(i);
      });
    }
    if (pos.distanceTo(this.gnome.pos) < r + 0.6) this.hitGnome(500);
  }

  hitGnome(n) {
    const g = this.g;
    g.hud.hitmarker(false);
    g.fx.sparkle(tmpV.copy(this.gnome.pos).setY(this.gnome.pos.y + 0.7), [1, 0.2, 0.1], 6, 0.3);
    if (isHost(g)) this.damageGnome(n);
    else g.net.net.send({ t: 'pee', a: 'gg', k: 'gn', n });
  }

  // (anfitrión)
  hitGem(i, v) {
    const g = this.g;
    const G = this.gems[i];
    if (this.stage !== 'gems' || G.hp <= 0 || i !== this.gemOn) return;
    G.hp = Math.max(0, G.hp - Math.max(0, Math.min(1, v)));
    if (G.hp > 0) {
      this.sync();
      return;
    }
    // se rompió
    this.send({ gg: 'break', i });
    this.breakGem(i);
    const left = this.gems.filter((x) => x.hp > 0).length;
    // y arranca a brillar otra
    this.gemOn = this.nextGem();
    const N = this.gems[this.gemOn];
    announce(g, left ? `¡Se rompió la gema del ${ELEM_NAME[G.el]}! Ahora brilla la del ${ELEM_NAME[N.el]}: ${left > 1 ? `quedan ${left}` : 'es la última'}.` : '¡Las cuatro gemas! El coloso se deshace...', 4, true);
    if (left) this.horde(Math.round((6 + (4 - left) * 2) * this.team(0.5)));
    else g.later(2.5, () => this.startGnome());
    this.sync();
  }

  // (anfitrión) la gema que brilla ahora: una de las que quedan, al azar
  nextGem() {
    const left = [];
    this.gems.forEach((G, i) => {
      if (G.hp > 0) left.push(i);
    });
    return left.length ? left[Math.floor(Math.random() * left.length)] : -1;
  }

  // ================= el temazo =================
  // Suena una sola vez por partida en cada compu: el que entra tarde la agarra
  // por donde va (sg: segundos desde que arrancó en el anfitrión). Con la M se
  // calla para siempre; mientras suena, el viento de fondo baja.
  playSong(at = 0) {
    const g = this.g;
    if (this.songCued) return;
    this.songCued = true;
    this.songT0 = g.time - at;
    this.song = streamSong(
      g,
      SONG.url,
      () => {
        this.song = null;
        this.duck(false);
      },
      { at },
    );
    if (!this.song) return;
    // (en el vuelo no hay HUD: el cartel sale al empezar la pelea)
    if (this.active) g.hud.toast(`♪ ${SONG.name}`);
    this.duck(true);
  }

  // La canción se apaga de a poco (el golpe final, el cierre).
  fadeSong(secs) {
    if (!this.song) return;
    this.song.fade(secs);
    this.song = null;
    this.duck(false);
  }

  duck(on) {
    const A = this.g.audio;
    A.amb?.out.gain.setTargetAtTime(on ? 0.12 : 0.5, A.now, 1.2);
  }

  // ================= red =================
  send(m) {
    this.g.net?.event('ee', m);
  }

  sync() {
    const g = this.g;
    if (!isHost(g)) return;
    const sg = this.songT0 != null ? +(g.time - this.songT0).toFixed(1) : undefined;
    const N = this.gnome;
    this.send({
      gg: 'st',
      gems: this.gems.map((G) => +G.hp.toFixed(2)),
      go: this.gemOn,
      stage: this.stage,
      ghp: Math.round(N.hp),
      gm: this.gemMax,
      nm: Math.round(N.max),
      sg,
      hc: +this.hornCd.toFixed(1),
      sn: +N.stun.toFixed(1),
      al: this.altProg?.map((v) => +v.toFixed(2)),
      lit: this.altLit?.map(Number),
    });
  }

  // Cuántos juegan: 1 solo, y f más por cada uno que se suma.
  team(f) {
    const g = this.g;
    return 1 + ((g.net ? g.net.net.count : 1) - 1) * f;
  }

  // Lo que manda el anfitrión (CastleEgg.applyRemote le pasa todo lo 'gg').
  onNet(m) {
    // (el que todavía no está en la pelea, entrando a la sala o en el vuelo,
    // no tiene la isla armada: lo de la pelea le llega con el 'st' al arrancar)
    if (!this.active && m.gg !== 'begin') return;
    switch (m.gg) {
      case 'begin':
        this.flightStart();
        break;
      case 'st':
        // (el que entró con la pelea empezada: la canción por donde va)
        if (m.sg != null && !this.songCued && this.active) this.playSong(m.sg + 0.3);
        m.gems?.forEach((hp, i) => {
          const G = this.gems[i];
          G.hp = hp;
          // (las que ya se rompieron antes de que entrara)
          if (hp <= 0 && G.mesh.visible) G.mesh.visible = G.glow.visible = false;
        });
        if (m.go != null) this.gemOn = m.go;
        if (m.stage && m.stage !== this.stage) this.setStage(m.stage);
        this.gemMax = m.gm || this.gemMax;
        this.gnome.max = m.nm || this.gnome.max;
        this.gnome.hp = m.ghp ?? this.gnome.hp;
        if (m.hc != null) this.hornCd = m.hc;
        if (m.sn != null) this.gnome.stun = m.sn;
        if (m.al) this.altProg = m.al.slice(0, 4);
        // (el que entra tarde: los altares que ya estaban prendidos, sin carteles)
        m.lit?.forEach((v, i) => {
          if (v && !this.altLit?.[i]) this.litFx(i, false, true);
        });
        break;
      case 'break':
        this.breakGem(m.i);
        break;
      case 'mine':
        this.addMine(m.x, m.z);
        break;
      case 'trick':
        this.trickFx(m.p);
        break;
      case 'trickEnd':
        this.trickEndFx();
        break;
      case 'pop':
        if (this.fakes[m.i]?.alive) this.popFx(this.fakes[m.i]);
        break;
      case 'horn':
        this.hornFx();
        break;
      case 'stun':
        this.stunFx(m.s);
        break;
      case 'alt':
        if (m.v) this.altProg = m.v.slice(0, 4);
        break;
      case 'lit':
        this.litFx(m.i, !!m.h);
        break;
      case 'zap':
        this.zapFx(m.i, new THREE.Vector3(...m.p));
        break;
      case 'atk':
        this.attackFx(m);
        break;
      case 'gpos':
        this.gnome.net = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
        m.f?.forEach((v, k) => {
          const F = this.fakes[k >> 1];
          if (!F) return;
          F.net ||= F.pos.clone();
          if (k % 2) F.net.z = v;
          else F.net.x = v;
        });
        break;
      case 'blink':
        this.blinkFx(new THREE.Vector3(...m.a), new THREE.Vector3(...m.b));
        break;
      case 'strafe':
        this.startStrafe(new THREE.Vector3(...m.at), !!m.dive);
        break;
      case 'dead':
        this.gnomeDeath();
        break;
      default:
        break;
    }
  }

  // Lo que manda un invitado (sus tiros a las gemas y al duende).
  onGuestHit(m) {
    if (m.k === 'gem' && m.i >= 0 && m.i < 4) this.hitGem(m.i, +m.v || 0);
    else if (m.k === 'gn') this.damageGnome(Math.max(0, Math.min(1200, +m.n || 0)));
    else if (m.k === 'fake' && m.i >= 0 && m.i < 4) this.popFakeHost(m.i | 0);
    else if (m.k === 'kill') this.juicio();
    else if (m.k === 'sync' && this.active) this.sync();
  }

  // (anfitrión) El Juicio del Mate Supremo (weapons/Supremo.js): se termina la
  // guerra de un golpe. Si el duende todavía no salió, sale y cae.
  juicio() {
    const g = this.g;
    if (!isHost(g) || !this.active || this.phase === 'won' || !this.gnome) return false;
    if (!this.gnome.root.visible) this.gnomeAppear();
    this.gnome.hp = 0;
    this.send({ gg: 'dead' });
    this.gnomeDeath();
    return true;
  }

  setStage(st) {
    const prev = this.stage;
    this.stage = st;
    // (el que entra tarde a la segunda parte o después: el duende ya estaba)
    if ((st === 'gnome' || st === 'chaos' || st === 'pin') && !this.gnome.root.visible) this.gnomeAppear();
    if (st === 'chaos' && prev !== 'chaos') this.chaosFx();
    if (st === 'pin' && prev !== 'pin') this.pinFx();
    if (st === 'gems') this.col.rise = Math.max(this.col.rise, 0.99);
  }

  // ================= efectos que ven todos =================
  // Le pegaron a una gema: tiembla, larga astillas de su color, cruje y el
  // coloso se queja (con el tiro cargado, más).
  gemFx(i, big = false) {
    const g = this.g;
    const G = this.gems[i];
    G.shake = 1;
    G.flash = 1;
    g.fx.sparkle(G.pos, ELEM_RGB[G.el], big ? 40 : 20, big ? 2.4 : 1.5);
    g.fx.flash(G.pos, ELEM_COLOR[G.el], big ? 26 : 12, big ? 0.35 : 0.18, 30);
    const a = g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: G.pos, reverb: 0.6, gain: big ? 1.3 : 0.7, ref: 30 });
    const t = a.now;
    a.noise(o, { t, dur: 0.25, type: 'highpass', freq: 2600, gain: 0.7 });
    for (let k = 0; k < (big ? 7 : 4); k++) a.tone(o, { t: t + k * 0.03, dur: 0.5, type: 'triangle', freq: 1800 + Math.random() * 2600, gain: 0.08 });
    a.tone(o, { t, dur: 0.6, freq: big ? 70 : 110, freqEnd: 35, gain: big ? 0.9 : 0.4 });
    if (big) {
      this.col.glitch = Math.max(this.col.glitch, 0.35);
      chiquiGlitch(a, 0.45);
      if (!this.col.rig.one) this.col.rig.act('hit');
    }
  }

  breakGem(i) {
    const g = this.g;
    const G = this.gems[i];
    G.hp = 0;
    G.mesh.visible = false;
    G.glow.visible = false;
    g.fx.explosion(G.pos.clone(), 8, ELEM_RGB[G.el]);
    g.fx.flash(G.pos, ELEM_COLOR[G.el], 40, 1, 60);
    g.post?.flash(0.5);
    this.col.glitch = 1.2;
    this.col.rig.act('scream');
    chiquiGlitch(g.audio, 0.9);
    g.fx.addShake(0.6);
  }

  // Un ataque del coloso (el anfitrión lo elige; todos lo ven y cada uno se cuida).
  attackFx(m) {
    const g = this.g;
    const A = this.A;
    if (m.k === 'slam') {
      const at = new THREE.Vector3(m.x, A.y, m.z);
      this.marks.push({ at, r: 3, t: 0, dur: 2.2, color: 0xff2a10, then: () => this.slamHit(at) });
      this.col.slamT = 0;
      // (el cuerpo de verdad: el clip del manotazo, con la mano en el piso cuando pega)
      const key = chiquiMeta()?.clips.slam.key ?? 1.65;
      this.col.rig.act('slam', { delay: Math.max(0, 2.2 - key), at: Math.max(0, key - 2.2) });
    } else if (m.k === 'meteor') {
      const at = new THREE.Vector3(m.x, A.y, m.z);
      // (en el caos cae yerba prendida fuego del cielo: más chica y más seguido)
      const sky = !!m.sky;
      const from = sky ? at.clone().add(tmpV.set((Math.random() - 0.5) * 26, 46, (Math.random() - 0.5) * 26)) : this.col.root.position.clone().add(tmpV.set(-8, 34, 6));
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sky ? 0.9 : 1.6, 0), sky ? this.yerbaRockMat() : g.world.M.caveRock || g.world.M.stoneDark);
      rock.position.copy(from);
      this.root.add(rock);
      const r = sky ? 3 : 4.2;
      if (!sky && !this.col.rig.one) this.col.rig.act('cast');
      this.meteors.push({ rock, from, at, t: 0, dur: sky ? 2.2 : 2.6, r, dmg: sky ? 40 : 70, arc: sky ? 4 : 14 });
      this.marks.push({ at, r, t: 0, dur: sky ? 2.2 : 2.6, color: sky ? 0x8aff3a : 0xff7a1a });
    } else if (m.k === 'bolt') {
      const at = new THREE.Vector3(m.x, A.y, m.z);
      this.marks.push({ at, r: 1.9, t: 0, dur: 1.1, color: 0x8ad0ff, then: () => this.boltHit(at) });
    } else if (m.k === 'crash') {
      this.crashFx(m.i);
    } else if (m.k === 'float') {
      this.floatT = m.s;
      g.post?.flash(0.4);
      g.audio.sting();
      const a = g.audio;
      if (a.ctx) {
        const o = a.out({ reverb: 0.8, gain: 0.8 });
        a.tone(o, { dur: 2.6, type: 'sine', freq: 180, freqEnd: 900, gain: 0.35, attack: 0.6 });
        a.tone(o, { dur: 2.6, type: 'sine', freq: 182, freqEnd: 905, gain: 0.25, attack: 0.6, detune: 12 });
      }
    }
  }

  yerbaRockMat() {
    this.yerbaMat ||= new THREE.MeshStandardMaterial({ color: 0x3a4a14, roughness: 1, emissive: 0xff5a10, emissiveIntensity: 0.8 });
    return this.yerbaMat;
  }

  // El rayo del caos: cae donde avisó el círculo celeste (y le pega a
  // cualquiera: muertos también).
  boltHit(at) {
    const g = this.g;
    g.fx.lightning(tmpV.set(at.x + (Math.random() - 0.5) * 5, at.y + 42, at.z + (Math.random() - 0.5) * 5), at.clone().setY(at.y + 0.1), 0xbfe6ff, 0.3);
    g.fx.flash(at, 0xbfe6ff, 30, 0.25, 40);
    g.fx.explosion(at.clone().setY(at.y + 0.3), 1.2, [0.6, 0.8, 1]);
    this.skyFlash = 1;
    g.audio.thunder?.(at);
    const p = g.player.pos;
    if (g.player.canBeHit() && Math.hypot(p.x - at.x, p.z - at.z) < 1.9) g.player.damage(25, at);
    if (isHost(g)) for (const { z } of g.zombies.inRadius(at, 2.2)) g.zombies.damage(z, z.maxHp + 1, { type: 'lightning', point: tmpW.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), noPoints: true });
  }

  // Un pedazo de un mapa se estrella contra el borde de la isla (del lado de
  // donde flota) y de adentro salen sus muertos.
  crashFx(i) {
    const g = this.g;
    const A = this.A;
    const F = this.fragments[i];
    if (!F) return;
    const a = Math.atan2(F.position.z - A.z, F.position.x - A.x) + (i % 2 ? 0.35 : -0.35);
    const at = new THREE.Vector3(A.x + Math.cos(a) * (A.r - 3.5), A.y, A.z + Math.sin(a) * (A.r - 3.5));
    const from = F.position.clone().add(tmpV.set(0, 8, 0));
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.3, 1), g.world.M.caveRock || g.world.M.stoneDark);
    rock.scale.set(1, 0.8, 1.2);
    rock.position.copy(from);
    this.root.add(rock);
    // (los pedazos están a unos 50 m: con 3,2 s la piedra flotaba)
    this.meteors.push({ rock, from, at, t: 0, dur: 2.6, r: 4.6, dmg: 45, arc: 13, crash: i });
    this.marks.push({ at, r: 4.6, t: 0, dur: 2.6, color: 0xffb040 });
    F.userData.shake = 2;
    g.audio.growl?.(tmpV.set(A.x, A.y + 3, A.z), 'boss');
  }

  slamHit(at) {
    const g = this.g;
    g.fx.explosion(at.clone().setY(at.y + 0.5), 4, [0.6, 0.1, 0.1]);
    g.fx.dust(at.clone().setY(at.y + 0.2), UP, [0.4, 0.35, 0.4], 30);
    g.fx.addShake(0.7);
    g.audio.bossSlam?.(at);
    this.waves.push({ at: at.clone(), r: 0.5, hit: false });
    const p = g.player.pos;
    if (g.player.canBeHit() && Math.hypot(p.x - at.x, p.z - at.z) < 3.2) g.player.damage(50, at);
  }

  meteorHit(at, r = 4.2, dmg = 70) {
    const g = this.g;
    g.fx.explosion(at.clone().setY(at.y + 0.6), r * 1.2, [1, 0.45, 0.15]);
    g.fx.fire(at.clone().setY(at.y + 0.3), r * 0.5, 20);
    g.fx.addShake(r > 4 ? 0.6 : 0.35);
    g.audio.explosion(at, r > 4 ? 1 : 0.7);
    const p = g.player.pos;
    if (g.player.canBeHit() && Math.hypot(p.x - at.x, p.z - at.z) < r) g.player.damage(dmg, at, true);
  }

  // ================= el duende =================
  // (anfitrión)
  startGnome() {
    const g = this.g;
    if (this.stage === 'gnome') return;
    this.setStage('gnome');
    const more = 1 + ((g.net ? g.net.net.count : 1) - 1) * 0.6;
    this.gnome.max = GNOME_HP * more;
    this.gnome.hp = this.gnome.max;
    this.hornCd = 8;
    this.sync();
    announce(g, '¡Ahí está el de verdad! Chiquito y rápido. El cuerno del medio llama al dragón (mantener F).', 6, true);
  }

  gnomeAppear() {
    const g = this.g;
    const A = this.A;
    this.col.dissolve = 0.001;
    this.col.rig.act('scream');
    const N = this.gnome;
    N.pos.set(A.x, A.y, A.z - 6);
    N.root.visible = true;
    g.fx.explosion(N.pos.clone().setY(N.pos.y + 1), 3, [1, 0.15, 0.1]);
    chiquiGiggle(g.audio, { pos: N.pos, gain: 1.4, ref: 12 });
  }

  // (anfitrión)
  damageGnome(n) {
    const g = this.g;
    const N = this.gnome;
    if ((this.stage !== 'gnome' && this.stage !== 'pin') || N.hp <= 0 || !(n > 0)) return;
    // (mientras llegan los caballeros no se le saca: el golpe final es de todos juntos)
    if (this.stage === 'pin' && g.time - (this.pinT ?? -9) < 1.2) return;
    // mareado le entra de más; si no, casi nada (hay que llamar al dragón)
    if (this.stage === 'gnome') {
      n *= N.stun > 0 ? STUN_DMG : BARE_DMG;
      if (N.stun <= 0 && g.time - (this.bareHintT ?? -99) > 18) {
        this.bareHintT = g.time;
        announce(g, this.hornCd > 0 ? `Casi no le entran los tiros. El cuerno del medio de la isla vuelve a sonar en ${Math.ceil(this.hornCd)} s: el dragón lo marea.` : 'Casi no le entran los tiros: soplen el cuerno del medio de la isla (mantener F). El dragón lo marea y ahí sí le entra.', 4);
      }
    }
    N.hp -= n;
    if (this.trick) this.trick.dmg += n;
    if (this.stage === 'gnome') {
      // se hace cinco (dos veces); si está mareado, cuando se le pase
      const k = N.trickN || 0;
      if (k < TRICK_AT.length && N.hp <= N.max * TRICK_AT[k] && N.hp > 0) {
        N.trickN = k + 1;
        N.trickDue = true;
      }
      if (N.hp <= 0) {
        this.startChaos();
        return;
      }
    } else if (N.hp <= 0) {
      this.send({ gg: 'dead' });
      this.gnomeDeath();
      return;
    }
    this.syncT = (this.syncT || 0) + 1;
    if (this.syncT % 4 === 0) this.sync();
  }

  // Los caballeros de antes aparecen alrededor y lo sujetan con cadenas de luz.
  pinFx() {
    const g = this.g;
    const N = this.gnome;
    // el remolino revienta y el duende cae al piso
    if (this.shield.visible) {
      const c = this.shieldSolid.c;
      g.fx.explosion(c.clone(), 6, [0.9, 0.15, 0.1]);
      for (let k = 0; k < 4; k++) g.fx.lightning(c.clone(), c.clone().add(tmpV.set((Math.random() - 0.5) * 16, (Math.random() - 0.3) * 8, (Math.random() - 0.5) * 16)), 0xff5a3a, 0.35);
      g.fx.addShake(1);
      chiquiGlitch(g.audio, 1);
      g.audio.thunder?.(c);
    }
    this.shield.visible = false;
    N.pos.set(this.A.x, this.A.y, this.A.z);
    N.net = N.pos.clone();
    for (const R of this.altRings || []) R.beam.visible = false;
    this.song?.level?.(1.5, 2);
    this.knights.root.visible = true;
    this.knightIds.forEach((id, i) => {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rec = this.knightRec(id);
      rec.pos.copy(N.pos).add(tmpV.set(Math.cos(ang) * 3.2, 0, Math.sin(ang) * 3.2));
      rec.yaw = Math.atan2(-(N.pos.x - rec.pos.x), -(N.pos.z - rec.pos.z));
      g.fx.explosion(rec.pos.clone().setY(rec.pos.y + 1), 1.5, ELEM_RGB[ELEMENTS[i]]);
    });
    g.post?.flash(0.8);
  }

  knightRec(id) {
    return this.knights.list.get(id).r;
  }

  // Los caballeros con los clips de Blender (ui/castleClips, cada uno con su
  // carácter): con su altar prendido, el mate en alto (el rayo al remolino);
  // sujetando al duende, tiran de la cadena de luz (kPin). Sin mate en la mano
  // (el de siempre quedaba torcido con el brazo arriba). Va igual en todas las
  // compus: sale de la etapa y de los altares, que están sincronizados.
  // globalThis.__mduBlend = false: la pose de piezas de antes.
  knightClips(dt) {
    if (globalThis.__mduBlend === false) return;
    const C = (this.kClips ||= new CastleClips());
    this.knightIds.forEach((id, i) => {
      const a = this.knights.list.get(id);
      const want = this.stage === 'pin' ? 'kPin' : this.altLit?.[i] ? `raise${personaLetter(i)}` : null;
      if (want && C.act(a.r, [a], want, { fade: 0.6, t: i * 0.37 })) a.hand.visible = false;
      else if (!want && a.r.cc) {
        C.release(a.r, 0.6, [a]);
        a.hand.visible = true;
      }
    });
    C.update(dt);
  }

  // De dónde sale lo que tira un caballero: la mano del mate (con los clips) o el pecho.
  knightFrom(i, out) {
    const a = this.knights.list.get(this.knightIds[i]);
    if (a?.r.cc && a.gs?.on) return a.gs.bones.RightHand.getWorldPosition(out);
    return out.copy(a.r.pos).setY(a.r.pos.y + 1.45);
  }

  gnomeDeath() {
    const g = this.g;
    if (this.phase === 'won') return;
    this.phase = 'won';
    this.stage = 'dead';
    const N = this.gnome;
    g.hud.setBossBar(null);
    g.fx.explosion(N.pos.clone().setY(N.pos.y + 1), 6, [1, 0.2, 0.1]);
    g.fx.flash(N.pos, 0xffffff, 80, 1.5, 60);
    g.post?.flash(1.4);
    chiquiGlitch(g.audio, 1.2);
    // el temazo acompaña el golpe final y se va apagando con el cierre
    this.fadeSong(6);
    N.root.visible = false;
    this.shield.visible = false;
    this.floatT = 0;
    for (const M of this.mines || []) M.grp.removeFromParent();
    this.mines = [];
    for (const z of g.zombies.pool) if (z.active && !z.dead && isHost(g)) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    g.later(3, () => g.ee.playEnding?.());
  }

  blinkFx(a, b) {
    const g = this.g;
    g.fx.explosion(a.clone().setY(a.y + 0.6), 1.2, [0.1, 0.02, 0.02]);
    g.fx.explosion(b.clone().setY(b.y + 0.6), 1.2, [0.1, 0.02, 0.02]);
    chiquiGiggle(g.audio, { pos: b, gain: 0.9, ref: 10 });
    this.gnome.pos.copy(b);
    this.gnome.net = b.clone();
  }

  // ================= el dragón =================
  // Las pasadas: baja sobre los muertos y va quemando el piso por delante; la
  // embestida (el cuerno): sube por detrás del duende, se para en el aire
  // rugiendo, se tira en picada echando fuego y se estrella contra él. Lo
  // hacen igual todas las compus (mismo mensaje, mismo reloj); lo que pega lo
  // cuenta el anfitrión.
  startStrafe(at, dive = false) {
    const A = this.A;
    const from = this.D.root.position.clone();
    const dir = new THREE.Vector3().subVectors(at, from).setY(0).normalize();
    this.rejoin = null;
    // (la salida no se va más allá de 36 m del medio: más afuera flotan los pedazos)
    const inside = (v) => {
      const d = Math.hypot(v.x - A.x, v.z - A.z);
      if (d > 36) v.set(A.x + ((v.x - A.x) / d) * 36, v.y, A.z + ((v.z - A.z) / d) * 36);
      return v;
    };
    if (dive) {
      const top = at.clone().addScaledVector(dir, -26).setY(A.y + 24);
      // se estrella contra él: la cabeza llega al duende y el cuerpo queda
      // atrás (antes iba con el medio del cuerpo al duende y seguía de largo:
      // le pasaba por adentro); después rebota para atrás y para un costado
      const aim = at.clone().setY(A.y + 1.2);
      const v = aim.clone().sub(top).normalize();
      const D = this.D;
      const head = D ? THREE.MathUtils.clamp(D.mouthPos(dS).distanceTo(D.root.position), 3, 9) : 5;
      const hit = aim.clone().addScaledVector(v, -head);
      hit.y = Math.max(hit.y, A.y + 2.4);
      // (el costado sale de dónde pega: igual en todas las compus)
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.floor(Math.abs(at.x) * 10) % 2 ? 1 : -1);
      this.strafe = {
        dive: true,
        t: 0,
        at,
        dir,
        from,
        mid: from.clone().lerp(top, 0.5).setY(Math.max(from.y, top.y) + 5),
        top,
        hit,
        low: hit.clone().addScaledVector(dir, -4).addScaledVector(side, 4).setY(A.y + 8),
        out: inside(at.clone().addScaledVector(dir, -12).addScaledVector(side, 24).setY(A.y + 20)),
      };
      dragonWhistle(this.g);
      return;
    }
    const low = at.clone().setY(A.y + 5);
    const out = inside(at.clone().addScaledVector(dir, 30).setY(A.y + 16));
    this.strafe = { curve: new THREE.CatmullRomCurve3([from, low.clone().addScaledVector(dir, -12), low, out]), t: 0, at, dir };
  }

  // Dónde está en la embestida (p) y qué hace; devuelve si escupe.
  diveStep(S, dt, p) {
    const g = this.g;
    S.t += dt;
    const t = S.t;
    const c1 = DIVE.climb;
    const c2 = c1 + DIVE.hold;
    S.flap = 1;
    S.rear = 0;
    if (t < c1) {
      // sube por detrás del duende, aleteando fuerte
      bezier(S.from, S.mid, S.top, smooth(t / c1), p);
      S.flap = 1.9;
      return false;
    }
    if (t < c2) {
      // arriba: se para en el aire, se levanta y ruge
      const u = (t - c1) / DIVE.hold;
      p.copy(S.top);
      p.y += Math.sin(u * Math.PI) * 1.2;
      S.rear = Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - smooth(Math.max(0, u - 0.7) / 0.3));
      S.flap = 1.4;
      if (!S.roared) {
        S.roared = true;
        this.fire.roar(S.top);
        g.fx.addShake(0.2);
      }
      return false;
    }
    if (t < DIVE_HIT) {
      // la picada: cada vez más rápido, echando fuego adelante
      const u = (t - c2) / DIVE.fall;
      p.lerpVectors(S.top, S.hit, u * u);
      S.flap = 0.35;
      if (!S.fell) {
        S.fell = true;
        this.fire.whoosh(S.hit, DIVE.fall);
      }
      // el viento: rayas que quedan atrás
      const k = this.fire.low() ? 30 : 90;
      const back = tmpV.subVectors(S.top, S.hit).normalize();
      for (let n = this.fire.emit('streak', dt * k * (0.3 + u)); n > 0; n--) {
        const a = dP2.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 9).add(p);
        g.fx.beam(a, dP3.copy(a).addScaledVector(back, 4 + u * 6), { color: 0xcfe0ff, width: 0.05, life: 0.1 });
      }
      return u > 0.1 && u < 0.85;
    }
    if (!S.hitDone) {
      S.hitDone = true;
      this.diveHit(S);
    }
    // rebota y se va para arriba
    const u = Math.min(1, (t - DIVE_HIT) / DIVE.out);
    bezier(S.hit, S.low, S.out, 1 - (1 - u) * (1 - u), p);
    S.flap = 1.5;
    return false;
  }

  // El golpe de la embestida (en todas las compus; lo que pega lo cuenta el anfitrión).
  diveHit(S) {
    const g = this.g;
    const A = this.A;
    const at = S.at;
    this.fire.slam(dP2.set(at.x, A.y, at.z));
    this.gnomeHop = 0.7;
    if (!isHost(g)) return;
    for (const { z } of g.zombies.inRadius(at, 7)) {
      const d = tmpW.set(z.pos.x - at.x, 0.6, z.pos.z - at.z).normalize();
      g.zombies.damage(z, z.boss ? 600 : z.maxHp + 1, { type: 'explosive', dir: { x: d.x, y: d.y, z: d.z }, point: tmpV.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), noPoints: true });
    }
    // si el duende estaba donde pegó, queda mareado
    const N = this.gnome;
    if (this.stage === 'gnome' && Math.hypot(N.pos.x - at.x, N.pos.z - at.z) < 6) {
      this.send({ gg: 'stun', s: STUN_SECS });
      this.stunFx(STUN_SECS);
      if (this.trick) this.endTrick();
      this.sync();
    }
  }

  // El dragón se corre de lo que tiene adelante (el cuerpo y la cabeza del
  // coloso, el duende, los pedazos de los mapas): de a poco, así no salta. Con
  // las alas abiertas ocupa unos 6 m para cada lado.
  steer(p, dt, S) {
    const want = dS.set(0, 0, 0);
    const push = (c, r) => {
      dT.subVectors(p, c);
      const d = dT.length();
      if (d >= r) return;
      if (d < 1e-3) dT.set(0, 1, 0);
      else dT.multiplyScalar(1 / d);
      want.addScaledVector(dT, r - d);
    };
    const C = this.col;
    if (C?.root.visible) {
      for (const s of this.colSolids || []) push(s.c, s.r + DRAGON_CLEAR);
      // el ala del sombrero: un disco de 15 m arriba de la cabeza. Por abajo
      // del ala se le pasaba por adentro: se lo rodea por afuera, de frente
      const hc = dT.set(0, this.colBrim?.[0] ?? 0.96, 0).applyMatrix4(C.root.matrixWorld);
      const R = (this.colBrim?.[1] ?? 0.42) * C.root.scale.x + DRAGON_CLEAR;
      const dx = p.x - hc.x;
      const dz = p.z - hc.z;
      const dh = Math.hypot(dx, dz);
      if (dh < R && p.y > hc.y - 4 - DRAGON_CLEAR) {
        const k = dh > 1e-3 ? (R - dh) / dh : 0;
        want.x += dx * k;
        want.z += dz * k + (dh > 1e-3 ? 0 : R);
      }
    }
    const N = this.gnome;
    if (N?.root.visible && !S?.dive) push(this.gnomeCenter(dT.clone()), 10);
    for (const f of this.fragments || []) push(f.position, 22);
    // (nunca por debajo del piso de la isla)
    if (p.y + want.y < this.A.y + 2) want.y = this.A.y + 2 - p.y;
    this.dOff ||= new THREE.Vector3();
    this.dOff.lerp(want, 1 - Math.exp(-dt * 6));
    p.add(this.dOff);
  }

  // Terminó una pasada: vuelve a la ronda de a poco, para el lado que venía.
  endStrafe(p) {
    const A = this.A;
    this.strafe = null;
    this.D.look(null);
    this.dragonT = Math.atan2(p.z - A.z, p.x - A.x);
    const v = this.dVel || new THREE.Vector3();
    this.orbDir = -Math.sin(this.dragonT) * v.x + Math.cos(this.dragonT) * v.z >= 0 ? 1 : -1;
    this.rejoin = { t: 0, from: p.clone(), vel: v.clone() };
  }

  updateDragon(dt) {
    const g = this.g;
    const D = this.D;
    const A = this.A;
    if (!D) return;
    D.root.visible = true;
    this.fire ||= g.ee.dragon?.fire || new DragonFire(g, D);
    const S = this.strafe;
    const p = dP;
    let spit = false;
    if (S?.dive) spit = this.diveStep(S, dt, p);
    else if (S) {
      S.t += dt / 4;
      const u = Math.min(0.999, S.t);
      S.curve.getPoint(u, p);
      spit = u > 0.26 && u < 0.66;
    } else {
      // da vueltas alrededor de la isla (más adentro que los pedazos de los mapas)
      this.dragonT += dt * 0.18 * (this.orbDir || 1);
      const a = this.dragonT;
      p.set(A.x + Math.cos(a) * 34, A.y + 17 + Math.sin(a * 3) * 3, A.z + Math.sin(a) * 34);
      const R = this.rejoin;
      if (R) {
        // (sigue un poco con el envión que traía y se acomoda en la ronda)
        R.t += dt;
        const k = smooth(Math.min(1, R.t / 2.2));
        p.lerp(dP2.copy(R.from).addScaledVector(R.vel, R.t * (1 - k * 0.5)), 1 - k);
        if (k >= 1) this.rejoin = null;
      }
    }
    // no atraviesa al coloso, al duende ni a los pedazos de los mapas
    this.steer(p, dt, S);
    // hacia dónde mira: para donde va, inclinado en las curvas y con la nariz
    // para abajo en la picada (para arriba cuando se para a rugir)
    if (!this.dPrev) {
      this.dPrev = p.clone();
      this.dVel = new THREE.Vector3();
      this.dYaw = D.root.rotation.y;
      this.dPitch = 0;
      this.dRoll = 0;
    }
    this.dVel.subVectors(p, this.dPrev).divideScalar(Math.max(dt, 1e-3));
    this.dPrev.copy(p);
    const v = this.dVel;
    const hs = Math.hypot(v.x, v.z);
    let yawRate = 0;
    if (hs > 0.5) {
      let dy = Math.atan2(v.x, v.z) - this.dYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const step = dy * Math.min(1, dt * 6);
      this.dYaw += step;
      yawRate = step / Math.max(dt, 1e-3);
    }
    const rear = S?.dive ? S.rear : 0;
    const pitch = THREE.MathUtils.clamp(-Math.atan2(v.y, Math.max(hs, 1)), -1.1, 1.1) - rear * 0.9;
    this.dPitch += (pitch - this.dPitch) * Math.min(1, dt * 5);
    const roll = THREE.MathUtils.clamp(-yawRate * 1.8, -0.7, 0.7);
    this.dRoll += (roll - this.dRoll) * Math.min(1, dt * 3);
    D.root.position.copy(p);
    D.root.quaternion.setFromEuler(dE.set(this.dPitch, this.dYaw, this.dRoll, 'YXZ'));
    if (D.pose !== 'fly') D.setPose('fly', 0.6);
    D.update(dt * (S?.dive ? S.flap : 1));
    D.open(spit || rear > 0.3 ? 1 : 0);
    // el fuego: de la boca al piso, un poco por delante (en la picada, al duende)
    if (spit) {
      D.root.updateMatrixWorld(true);
      const m = D.mouthPos(dP3);
      const f = S.dive ? dP2.set(S.at.x, A.y, S.at.z) : dP2.set(m.x + S.dir.x * 6, A.y, m.z + S.dir.z * 6);
      const onIsle = Math.hypot(f.x - A.x, f.z - A.z) < A.r + 0.5;
      if (!S.looked) {
        S.looked = true;
        D.look(S.at);
      }
      if (onIsle) {
        this.fire.breathe(m, f, dt, true);
        if (isHost(g) && (S.tick = (S.tick || 0) - dt) <= 0) {
          S.tick = 0.2;
          for (const { z } of g.zombies.inRadius(f, 3.4)) g.zombies.damage(z, z.boss ? 320 : z.maxHp * 0.7 + 1, { type: z.boss ? 'scald' : 'burn', point: tmpV.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), noPoints: true });
        }
      } else this.fire.breathe(m, f.sub(m).setLength(14).add(m), dt, false);
    }
    if (S && S.t >= (S.dive ? DIVE_HIT + DIVE.out : 1)) this.endStrafe(p);
    this.fire.update(dt);
    // el duende, al que le pegó: salta y se da vuelta en el aire
    if (this.gnomeHop > 0) {
      this.gnomeHop = Math.max(0, this.gnomeHop - dt);
      const u = 1 - this.gnomeHop / 0.7;
      const N = this.gnome;
      N.root.position.y += Math.sin(u * Math.PI) * 1.6;
      N.root.rotation.x += u * Math.PI * 2;
    }
  }

  // ================= cada cuadro =================
  update(dt) {
    const g = this.g;
    // (armado ya desde el despegue, pero hasta entrar al Éter no corre nada)
    if (!this.shown) return;
    const t = g.time;
    const U = this.sky.material.uniforms;
    U.uTime.value = t;
    this.clouds.material.uniforms.uTime.value = t;
    // el cielo y el mar de nubes van con la cámara: si no, lo lejano queda más
    // allá del fondo de la cámara (400 m) y se ve un agujero negro redondo
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.clouds.position.set(cam.x, this.A.y - 46, cam.z);
    // el caos: el cielo se pone colorado, la isla se raja, todo tiembla
    const wild = this.stage === 'chaos' || this.stage === 'pin';
    this.chaosK = wild ? Math.min(1, (this.chaosK || 0) + dt / 3) : Math.max(0, (this.chaosK || 0) - dt / 4);
    this.skyFlash = Math.max(0, (this.skyFlash || 0) - dt * 3);
    U.uChaos.value = this.chaosK;
    U.uFlash.value = this.skyFlash;
    for (const f of this.fragments) {
      const sh = (f.userData.shake = Math.max(0, (f.userData.shake || 0) - dt));
      f.position.y = f.userData.y0 + Math.sin(t * (0.3 + this.chaosK * 0.5) + f.userData.ph) * (1.5 + this.chaosK * 2.5) + (sh > 0 ? (Math.random() - 0.5) * sh * 0.6 : 0);
      f.rotation.y += dt * (0.03 + this.chaosK * 0.08);
      f.rotation.z = Math.sin(t * 0.7 + f.userData.ph) * 0.06 * this.chaosK;
      f.userData.tick?.(dt, t);
    }
    if (this.cracks) {
      this.cracks.visible = this.chaosK > 0;
      this.cracks.material.opacity = this.chaosK * (0.6 + Math.sin(t * 5) * 0.15 + Math.sin(t * 13) * 0.1);
    }
    if (!this.active) return;
    this.t += dt;
    // nadie se cae de la isla
    const A = this.A;
    const clamp = (p, rad) => {
      const dx = p.x - A.x;
      const dz = p.z - A.z;
      const d = Math.hypot(dx, dz);
      const max = A.r - rad;
      if (d > max) {
        p.x = A.x + (dx / d) * max;
        p.z = A.z + (dz / d) * max;
      }
    };
    clamp(g.player.pos, 0.5);
    if (isHost(g)) for (const z of g.zombies.pool) if (z.active) clamp(z.pos, 0.4);
    // las columnas y los altares no se atraviesan (ni el remolino del caos)
    for (const S of this.solids) {
      if (S.kind !== 'column' && S.kind !== 'altar' && S.kind !== 'shield') continue;
      const r = S.kind === 'shield' ? 2.2 : S.r;
      pushOut(g.player.pos, S.c, r + 0.35);
      if (isHost(g)) for (const z of g.zombies.pool) if (z.active) pushOut(z.pos, S.c, r + 0.3);
    }
    for (const l of this.lights) l.intensity = 26 + Math.sin(t * 3 + l.position.x) * 6 + this.chaosK * (10 + Math.random() * 14) + this.skyFlash * 40;
    if (wild && Math.random() < 0.12) g.fx.addShake(0.03 + this.chaosK * 0.03);
    // sin gravedad: el Éter te sostiene (los saltos duran una eternidad)
    if (this.floatT > 0) {
      this.floatT -= dt;
      if (!g.player.onGround) g.player.vel.y += PLAYER.gravity * 0.62 * dt;
      if (Math.random() < 0.5) g.fx.sparkle(tmpV.set(g.player.pos.x + (Math.random() - 0.5) * 8, g.player.pos.y + Math.random() * 3, g.player.pos.z + (Math.random() - 0.5) * 8), [0.7, 0.6, 1], 1, 0.3);
    }
    this.hornCd = Math.max(0, this.hornCd - dt);
    this.updateHorn(dt, t);
    this.updateMines(dt);
    this.updateAltars(dt, t);
    if (this.knights.root.visible) {
      this.knights.update(dt);
      this.knightClips(dt);
    }
    this.updateColossus(dt, t);
    this.updateMarks(dt);
    this.updateWaves(dt);
    this.updateMeteors(dt);
    this.updateGnome(dt, t);
    this.updateDragon(dt);
    this.updateShared(dt);
    // la barra del jefe
    if (this.stage === 'gems') g.hud.setBossBar('El Chiquitijuein', this.gems.reduce((s, G) => s + G.hp, 0) / ((this.gemMax || GEM_HP) * 4));
    else if (this.stage === 'gnome') g.hud.setBossBar(this.gnome.stun > 0 ? 'El Chiquitijuein (aturdido)' : 'El Chiquitijuein',Math.max(0, this.gnome.hp / this.gnome.max));
    else if (this.stage === 'chaos') g.hud.setBossBar('El Chiquitijuein (en el remolino)', 1 - (this.altProg || [0, 0, 0, 0]).reduce((s, v) => s + v, 0) / 4);
    else if (this.stage === 'pin') g.hud.setBossBar('El Chiquitijuein (sujetado)', Math.max(0, this.gnome.hp / this.gnome.max));
    if (isHost(g)) this.think(dt);
  }

  // (anfitrión) qué hace el coloso
  think(dt) {
    const g = this.g;
    const C = this.cd;
    if (this.stage === 'rise') {
      if (this.col.rise >= 1) {
        // de a una gema (la que brilla), la misma vida que solo; con más de dos
        // jugadores aguantan un golpe más
        this.gemMax = GEM_HP + ((g.net ? g.net.net.count : 1) > 2 ? 1 : 0);
        for (const G of this.gems) G.hp = this.gemMax;
        this.gemOn = this.nextGem();
        this.setStage('gems');
        this.sync();
      }
      return;
    }
    // el dragón cada tanto hace una pasada sobre los muertos (en el caos, seguido)
    C.strafe -= dt;
    if (C.strafe <= 0 && !this.strafe) {
      C.strafe = this.stage === 'chaos' || this.stage === 'pin' ? 6 + Math.random() * 3 : 12 + Math.random() * 6;
      let best = null;
      let bn = 2;
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead) continue;
        const n = g.zombies.inRadius(z.pos, 4).length;
        if (n >= bn) {
          bn = n;
          best = z;
        }
      }
      if (best) {
        const at = new THREE.Vector3(best.pos.x, this.A.y, best.pos.z);
        this.send({ gg: 'strafe', at: at.toArray().map((v) => +v.toFixed(1)) });
        this.startStrafe(at);
      }
    }
    // la horda de siempre
    C.horde -= dt;
    const alive = g.zombies.pool.filter((z) => z.active && !z.dead).length;
    if (C.horde <= 0) {
      C.horde = this.stage === 'gems' ? 16 : this.stage === 'chaos' ? 9 : 12;
      const k = this.team(0.5);
      if (alive < (this.stage === 'chaos' ? 14 : 10) * k) this.horde(Math.round((this.stage === 'gems' ? 6 : 8) * k));
    }
    if (this.stage === 'chaos' || this.stage === 'pin') this.thinkChaos(dt, alive);
    if (this.stage !== 'gems') return;
    const targets = this.standing();
    if (!targets.length) return;
    const pick = () => {
      const p = targets[Math.floor(Math.random() * targets.length)];
      return [p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2];
    };
    const broken = this.gems.filter((G) => G.hp <= 0).length;
    C.slam -= dt;
    if (C.slam <= 0) {
      C.slam = 9 - broken;
      const [x, z] = pick();
      const m = { gg: 'atk', k: 'slam', x: +x.toFixed(1), z: +z.toFixed(1) };
      this.send(m);
      this.attackFx(m);
    }
    C.rain -= dt;
    if (C.rain <= 0) {
      C.rain = 12 - broken * 1.5;
      this.fireRain();
    }
    C.fire -= dt;
    if (C.fire <= 0) {
      C.fire = 5 - broken * 0.6;
      const eye = this.eyePos(tmpV).clone();
      this.fireball(eye, broken >= 2 ? 3 : 1);
    }
    C.meteor -= dt;
    if (C.meteor <= 0) {
      C.meteor = 16 - broken * 2;
      const [x, z] = pick();
      const m = { gg: 'atk', k: 'meteor', x: +x.toFixed(1), z: +z.toFixed(1) };
      this.send(m);
      this.attackFx(m);
    }
  }

  eyePos(out) {
    const S = this.col.rig.skin;
    if (S) return S.eyes[0].getWorldPosition(out).add(S.eyes[1].getWorldPosition(tmpW)).multiplyScalar(0.5);
    return out.set(0, 0.87, 0.14).applyMatrix4(this.col.root.matrixWorld);
  }

  // (anfitrión) muertos que trepan por el borde de la isla (o que salen de
  // donde se estrelló un pedazo)
  horde(n, at = null) {
    const g = this.g;
    const A = this.A;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = at ? new THREE.Vector3(at.x + Math.cos(a) * (0.8 + Math.random() * 2.2), A.y, at.z + Math.sin(a) * (0.8 + Math.random() * 2.2)) : new THREE.Vector3(A.x + Math.cos(a) * (A.r - 1.5), A.y, A.z + Math.sin(a) * (A.r - 1.5));
      g.later(i * 0.35, () => {
        if (this.phase !== 'won') g.zombies.spawn(Math.max(20, g.rounds.round), 2600, p);
      });
    }
  }

  updateColossus(dt, t) {
    const C = this.col;
    const root = C.root;
    const g = this.g;
    const A = this.A;
    // sube de las nubes
    if (C.rise < 1) {
      C.rise = Math.min(1, C.rise + dt / 4.5);
      if (Math.random() < 0.3) g.fx.addShake(0.05);
    }
    const riseY = (1 - smooth(C.rise)) * -45;
    C.glitch = Math.max(0, C.glitch - dt);
    const gl = C.glitch > 0 ? (Math.random() - 0.5) * C.glitch * 2 : 0;
    // se deshace (la última parte)
    if (C.dissolve > 0) C.dissolve = Math.min(1, C.dissolve + dt / 3);
    const dis = C.dissolve;
    root.visible = dis < 1;
    C.smoke.visible = dis < 1;
    root.position.set(A.x + gl, A.y + COL.dy + riseY - dis * 30, A.z + COL.dz);
    root.scale.setScalar(COL.scale * (1 - dis * 0.6));
    // (rompiéndole las gemas, quieto entre ataque y ataque: parado en un cuadro
    // del de parado, sin gestos y casi sin hamacarse; si no, la gema que
    // brilla no paraba de moverse y no se le podía pegar)
    const still = this.stage === 'gems' && !globalThis.__mduColSway;
    C.rig.idle = still ? 'idle' : 'taunt';
    C.rig.still = still ? 0 : null;
    const sw = still ? 0.25 : 1;
    root.rotation.set(Math.sin(t * 0.4) * 0.03 * sw, Math.sin(t * 0.25) * 0.08 * sw, Math.sin(t * 0.33) * 0.02 * sw);
    // el manotazo: levanta el brazo y lo baja
    if (C.slamT >= 0) {
      C.slamT += dt;
      const k = C.slamT;
      const arm = C.rig.arms[0];
      arm.rotation.x = k < 1.6 ? -smooth(k / 1.6) * 2.4 : -2.4 + smooth(Math.min(1, (k - 1.6) / 0.35)) * 1.7;
      if (k > 3) {
        arm.rotation.x = 0;
        C.slamT = -1;
      }
    }
    C.rig.update(dt, t);
    for (const G of C.rig.glows) G.scale.setScalar(0.06 + Math.sin(t * 7) * 0.01);
    if (C.ember) C.ember.value = 0.85 + Math.sin(t * 2.3) * 0.25 + C.glitch * 0.8;
    root.updateMatrixWorld(true);
    // las gemas y el cuerpo (para los tiros)
    for (const G of this.gems) {
      G.mesh.getWorldPosition(G.pos);
      G.shake = Math.max(0, G.shake - dt * 2);
      G.flash = Math.max(0, (G.flash || 0) - dt * 3);
      G.mesh.rotation.y = t * 1.5;
      // el golpe la sacude y la infla; rajada, titila cada vez más rápido
      const [bx, by, bz] = G.base || GEMS[G.el];
      G.mesh.position.set(bx + (Math.random() - 0.5) * 0.008 * G.shake, by + (Math.random() - 0.5) * 0.008 * G.shake, bz);
      G.mesh.scale.set(1 + G.flash * 0.5, 1.4 + G.flash * 0.7, 0.6 + G.flash * 0.3);
      const hurt = 1 - clamp01(G.hp / (this.gemMax || GEM_HP));
      const flick = hurt > 0.01 ? Math.sin(t * (6 + hurt * 22)) * hurt * 0.25 : 0;
      // en la pelea brilla fuerte solo la que se puede romper; las otras, apagadas
      const on = this.stage === 'gems' && G === this.gems[this.gemOn];
      const dim = this.stage === 'gems' && !on;
      G.mesh.material.color.copy(G.col).multiplyScalar(on ? 2.6 + Math.sin(t * 5) * 0.4 : dim ? 0.45 : 1.8);
      G.glow.material.opacity = G.hp > 0 ? (dim ? 0.16 : on ? 0.9 + Math.sin(t * 5) * 0.1 : 0.6 + Math.sin(t * 4) * 0.15) + G.shake * 0.5 + flick : 0;
      G.glow.scale.setScalar((on ? 0.24 + Math.sin(t * 5) * 0.03 : dim ? 0.08 : 0.14) * (1 + G.flash * 1.2));
    }
    this.solids = this.solids.filter((s) => s.kind !== 'coloso' && s.kind !== 'gnome' && s.kind !== 'shield');
    if (root.visible && dis === 0) {
      for (const s of this.colSolids) {
        s.c.copy(s.local).applyMatrix4(root.matrixWorld);
        this.solids.push(s);
      }
    }
    // el duende también frena los tiros (las bolas de fuego, las agujas y el
    // rayo revientan contra él: si no, lo atravesaban sin tocarlo)
    const N = this.gnome;
    if (N.root.visible && (this.stage === 'gnome' || this.stage === 'pin')) {
      N.solid ||= { c: new THREE.Vector3(), r: 0.75, kind: 'gnome' };
      this.gnomeCenter(N.solid.c);
      N.solid.r = this.gnomeR() + 0.15;
      this.solids.push(N.solid);
    }
    if (this.trick) {
      for (const F of this.fakes) {
        if (!F.alive) continue;
        F.solid.c.copy(F.pos).setY(F.pos.y + 0.7);
        this.solids.push(F.solid);
      }
    }
    if (this.shield.visible) this.solids.push(this.shieldSolid);
    // humo que le sube de abajo
    if (root.visible && Math.random() < 0.6) {
      const p = root.position;
      g.fx.alpha.spawn(p.x + (Math.random() - 0.5) * 14, p.y - 4 + Math.random() * 6, p.z + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, { color: [0.05, 0.02, 0.03], size: 3, size1: 8, life: 3, alpha: 0.5, drag: 0.3 });
    }
  }

  // Los círculos que avisan dónde va a pegar (y lo que pasa al terminar).
  updateMarks(dt) {
    const g = this.g;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const M = this.marks[i];
      if (!M.mesh) {
        M.mesh = new THREE.Mesh(this.rainGeo, new THREE.MeshBasicMaterial({ color: M.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        M.mesh.position.copy(M.at).setY(M.at.y + 0.06);
        M.mesh.scale.setScalar(M.r);
        g.scene.add(M.mesh);
      }
      M.t += dt;
      const k = M.t / M.dur;
      M.mesh.material.opacity = (0.4 + k * 0.5) * (0.7 + Math.sin(g.time * 18) * 0.3);
      if (k >= 1) {
        M.then?.();
        M.mesh.removeFromParent();
        M.mesh.material.dispose();
        this.marks.splice(i, 1);
      }
    }
  }

  // La onda del manotazo: un anillo que crece por el piso (hay que saltarlo).
  updateWaves(dt) {
    const g = this.g;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const W = this.waves[i];
      if (!W.mesh) {
        W.mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.25, 0.12).multiplyScalar(2), toneMapped: false, transparent: true }));
        g.scene.add(W.mesh);
      }
      W.r += dt * 9;
      W.mesh.position.set(W.at.x, this.A.y + 0.25, W.at.z);
      W.mesh.scale.set(W.r, 3, W.r);
      W.mesh.material.opacity = Math.max(0, 1 - W.r / 26);
      const p = g.player.pos;
      const d = Math.hypot(p.x - W.at.x, p.z - W.at.z);
      if (!W.hit && Math.abs(d - W.r) < 0.7 && g.player.onGround && g.player.canBeHit()) {
        W.hit = true;
        g.player.damage(30, W.at);
      }
      if (W.r > 26) {
        W.mesh.removeFromParent();
        W.mesh.geometry.dispose();
        W.mesh.material.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  updateMeteors(dt) {
    const g = this.g;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const R = this.meteors[i];
      R.t += dt;
      const k = Math.min(1, R.t / R.dur);
      R.rock.position.lerpVectors(R.from, R.at, k);
      R.rock.position.y += Math.sin(k * Math.PI) * (R.arc ?? 14);
      R.rock.rotation.x += dt * 3;
      R.rock.rotation.z += dt * 2;
      if (Math.random() < 0.8) g.fx.fire(R.rock.position, R.crash != null ? 1.6 : 0.8, 2);
      if (k >= 1) {
        this.meteorHit(R.at, R.r, R.dmg);
        // el pedazo que se estrelló: sacudón grande y sus muertos
        if (R.crash != null) {
          g.fx.addShake(1.2);
          g.fx.dust(R.at.clone().setY(R.at.y + 0.3), UP, [0.35, 0.3, 0.3], 40);
          g.post?.flash(0.5);
          if (isHost(g) && this.phase !== 'won') this.horde(Math.round(6 * this.team(0.5)), R.at);
        }
        R.rock.removeFromParent();
        R.rock.geometry.dispose();
        this.meteors.splice(i, 1);
      }
    }
  }

  updateGnome(dt, t) {
    const g = this.g;
    const N = this.gnome;
    if (!N.root.visible) return;
    const A = this.A;
    N.stun = Math.max(0, N.stun - dt);
    N.cower = Math.max(0, N.cower - dt);
    if (this.stage === 'chaos') {
      this.updateVortex(dt, t);
      return;
    }
    const randSpot = (min) => {
      const a = Math.random() * Math.PI * 2;
      const d = min + Math.random() * (A.r - 3 - min);
      return new THREE.Vector3(A.x + Math.cos(a) * d, A.y, A.z + Math.sin(a) * d);
    };
    if (isHost(g) && this.stage === 'gnome') {
      if (N.trickDue && !this.trick && N.stun <= 0 && N.cower <= 0) {
        N.trickDue = false;
        this.startTrick();
      }
      // mareado o muerto de miedo (viene el dragón), no se mueve
      if (N.stun <= 0 && N.cower <= 0) {
        // corre de un lado al otro, lejos de los jugadores, y cada tanto se esfuma
        if (!N.target || N.pos.distanceTo(N.target) < 0.6) N.target = randSpot(0);
        const dir = tmpV.subVectors(N.target, N.pos).setY(0);
        const len = dir.length();
        // (tirando la bola se queda quieto: no la tira corriendo)
        if (N.throwHold > 0) N.throwHold -= dt;
        else N.pos.addScaledVector(dir.normalize(), Math.min(len, 5.2 * dt));
        if (!this.trick) {
          N.blinkT -= dt;
          if (N.blinkT <= 0) {
            N.blinkT = 5 + Math.random() * 3;
            const b = randSpot(4);
            const from = N.pos.clone();
            this.send({ gg: 'blink', a: from.toArray().map((v) => +v.toFixed(1)), b: b.toArray().map((v) => +v.toFixed(1)) });
            this.blinkFx(from, b);
            N.target = null;
          }
          // la yerba maldita donde pisa
          N.mineT -= dt;
          if (N.mineT <= 0) {
            N.mineT = 2.2 + Math.random() * 1.2;
            if (this.mines.length < 6) this.dropMine();
          }
        }
        // bolas de fuego de la mano
        N.throwT -= dt;
        // (el cuerpo de verdad: arranca el tiro antes, así la suelta cuando sale)
        const lead = chiquiMeta()?.clips.throw.key ?? 0.5;
        if (N.throwT <= lead && N.throwT + dt > lead) {
          N.rig.act('throw');
          N.throwHold = lead + 0.45;
        }
        if (N.throwT <= 0) {
          N.throwT = 3 + Math.random() * 1.8;
          this.fireball(N.pos.clone().setY(N.pos.y + 1.2), 1);
        }
      }
      if (this.trick) {
        const T = this.trick;
        T.t += dt;
        for (const F of this.fakes) {
          if (!F.alive) continue;
          if (!F.target || F.pos.distanceTo(F.target) < 0.6) F.target = randSpot(0);
          const dir = tmpV.subVectors(F.target, F.pos).setY(0);
          const len = dir.length();
          F.pos.addScaledVector(dir.normalize(), Math.min(len, 4.8 * dt));
        }
        // lo encontraron (le pegaron bastante al de verdad) o se le pasó el tiempo
        if (T.t > 16 || T.dmg > N.max * 0.06) this.endTrick(T.dmg > N.max * 0.06);
      }
      N.sendT = (N.sendT || 0) - dt;
      if (N.sendT <= 0) {
        N.sendT = 0.15;
        const m = { gg: 'gpos', p: N.pos.toArray().map((v) => +v.toFixed(2)) };
        if (this.trick) m.f = this.fakes.flatMap((F) => [+F.pos.x.toFixed(2), +F.pos.z.toFixed(2)]);
        this.send(m);
      }
    } else if (!isHost(g)) {
      if (N.net) N.pos.lerp(N.net, Math.min(1, dt * 8));
      for (const F of this.fakes) if (F.alive && F.net) F.pos.lerp(F.net, Math.min(1, dt * 8));
    }
    // (del caos al piso: vuelve a su tamaño, un poco más grande sujetado)
    const want = this.stage === 'pin' ? 1.7 : 1.3;
    const s = N.root.scale.x + (want - N.root.scale.x) * Math.min(1, dt * 3);
    N.root.scale.setScalar(s);
    N.root.position.copy(N.pos);
    const p = g.player.pos;
    this.faceGnome(N, p, dt);
    // mareado se agarra la cabeza, con miedo se echa atrás, sujetado lo sacude la luz
    N.rig.mode = N.stun > 0 ? 'dizzy' : N.cower > 0 ? 'scared' : this.stage === 'pin' ? 'zap' : null;
    // mareado: se tambalea y las estrellitas le dan vueltas; con miedo, tiembla
    N.stars.visible = N.stun > 0;
    if (N.stun > 0) {
      N.root.rotation.y = t * 2.4;
      N.root.rotation.z = Math.sin(t * 5) * 0.18;
      N.stars.children.forEach((st, k) => {
        const a = t * 4 + (k / 4) * Math.PI * 2;
        st.position.set(Math.cos(a) * 0.22, Math.sin(t * 6 + k) * 0.03, Math.sin(a) * 0.22);
      });
    } else if (N.cower > 0) N.root.position.x += (Math.random() - 0.5) * 0.06;
    N.rig.update(dt, t);
    // los espejitos: miran igual que él; el de verdad deja brasas donde pisa
    if (this.trick) {
      for (const F of this.fakes) {
        if (!F.alive) continue;
        F.root.position.copy(F.pos);
        this.faceGnome(F, p, dt);
        F.rig.update(dt, t);
      }
      N.emberT = (N.emberT || 0) - dt;
      if (N.emberT <= 0) {
        N.emberT = 0.11;
        g.fx.fire(tmpV.set(N.pos.x + (Math.random() - 0.5) * 0.2, A.y + 0.04, N.pos.z + (Math.random() - 0.5) * 0.2), 0.08, 1);
      }
    }
    // sujetado: las cadenas de luz de los cuatro caballeros
    if (this.stage === 'pin') {
      this.knightIds.forEach((id, i) => {
        if (Math.random() < 0.5) g.fx.lightning(this.knightFrom(i, new THREE.Vector3()), N.pos.clone().setY(N.pos.y + 0.6), ELEM_COLOR[ELEMENTS[i]], 0.1);
      });
    }
  }

  // ================= el cuerno del dragón =================
  hornPrompt() {
    if (!this.active || this.stage !== 'gnome') return null;
    if (this.hornCd > 0) return { text: `El cuerno del Mateendrache: el dragón vuelve en ${Math.ceil(this.hornCd)} s`, noCost: true, info: true };
    return { text: 'soplar el cuerno: el Mateendrache se tira en picada sobre el Chiquitijuein', noCost: true, hold: true };
  }

  // (anfitrión; el invitado lo pide con la F)
  hornUse() {
    const g = this.g;
    if (!isHost(g) || !this.active || this.stage !== 'gnome' || this.hornCd > 0) return false;
    this.hornCd = HORN_CD;
    this.send({ gg: 'horn' });
    this.hornFx();
    // el dragón baja en picada adonde está el duende, que se queda duro del susto
    const N = this.gnome;
    N.cower = DIVE_HIT + 0.3;
    const at = new THREE.Vector3(N.pos.x, this.A.y, N.pos.z);
    this.send({ gg: 'strafe', at: at.toArray().map((v) => +v.toFixed(1)), dive: 1 });
    this.startStrafe(at, true);
    this.sync();
    return true;
  }

  // El cuerno suena en todas las compus: "buuu... ¡BUUUUU!" (y el dragón contesta).
  hornFx() {
    const g = this.g;
    this.horn.blow = 1;
    this.hornCd = Math.max(this.hornCd, HORN_CD - 0.5);
    g.fx.flash(this.hornPos, 0xffd08a, 18, 0.6, 30);
    g.fx.addShake(0.25);
    const a = g.audio;
    if (!a.ctx) return;
    const t = a.now;
    const o = a.out({ pos: this.hornPos, reverb: 0.9, gain: 1.6, ref: 30 });
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(1300, t + 0.5);
    f.frequency.linearRampToValueAtTime(700, t + 1);
    f.frequency.linearRampToValueAtTime(1700, t + 1.4);
    f.frequency.linearRampToValueAtTime(420, t + 3.3);
    f.connect(o);
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = a.ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    lfo.start(t);
    lfo.stop(t + 3.5);
    for (const [f0, t0, dur, gn] of [
      [73.4, 0, 1, 0.22],
      [110, 0.95, 2.4, 0.3],
    ]) {
      for (const [mul, det, k] of [
        [1, -7, 1],
        [1, 7, 1],
        [2, 0, 0.35],
      ]) {
        const { o: osc } = a.tone(f, { t: t + t0, dur, type: 'sawtooth', freq: f0 * mul, detune: det, gain: gn * k, attack: 0.18 });
        lg.connect(osc.detune);
      }
    }
    a.noise(f, { t, dur: 3.3, type: 'bandpass', freq: 500, q: 0.8, gain: 0.06, attack: 0.3 });
  }

  updateHorn(dt, t) {
    const H = this.horn;
    if (!H) return;
    H.blow = Math.max(0, H.blow - dt * 0.8);
    const ready = this.stage === 'gnome' && this.hornCd <= 0;
    H.glow.material.opacity = ready ? 0.45 + Math.sin(t * 4) * 0.2 : H.blow * 0.8;
    H.horn.position.x = H.blow > 0 ? (Math.random() - 0.5) * 0.02 * H.blow : 0;
  }

  stunFx(s) {
    const g = this.g;
    const N = this.gnome;
    N.stun = s;
    N.cower = 0;
    g.fx.explosion(N.pos.clone().setY(N.pos.y + 0.8), 2, [1, 0.9, 0.6]);
    g.fx.addShake(0.4);
    chiquiGlitch(g.audio, 0.7);
    g.audio.sting();
  }

  // ================= las trampas de yerba maldita =================
  // (anfitrión) una donde pisó
  dropMine() {
    const N = this.gnome;
    const m = { gg: 'mine', x: +N.pos.x.toFixed(1), z: +N.pos.z.toFixed(1) };
    this.send(m);
    this.addMine(m.x, m.z);
  }

  addMine(x, z) {
    const g = this.g;
    const grp = new THREE.Group();
    grp.position.set(x, this.A.y, z);
    const mound = new THREE.Mesh(this.mineGeo, this.mineMat);
    mound.position.y = 0.1;
    mound.rotation.y = Math.random() * 3;
    const ring = new THREE.Mesh(this.rainGeo, this.mineRingMat);
    ring.scale.setScalar(MINE_R);
    ring.position.y = 0.05;
    grp.add(mound, ring);
    this.root.add(grp);
    this.mines.push({ grp, t: 0, x, z });
    g.fx.dust(tmpV.set(x, this.A.y + 0.2, z), UP, [0.2, 0.3, 0.1], 8);
  }

  // Revienta la que pisa cualquiera (cada compu ve lo mismo); el daño es de
  // cada uno. Las viejas se apagan solas.
  updateMines(dt) {
    const g = this.g;
    if (!this.mines.length) return;
    this.mineRingMat.opacity = 0.35 + Math.sin(g.time * 9) * 0.2;
    const who = this.standing();
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const M = this.mines[i];
      M.t += dt;
      const old = M.t > 16;
      let boom = old;
      if (M.t > 0.8 && !boom) for (const p of who) if (Math.hypot(p.x - M.x, p.z - M.z) < MINE_R * 0.85 && p.y < this.A.y + 0.6) boom = true;
      if (!boom) continue;
      const at = tmpW.set(M.x, this.A.y + 0.3, M.z);
      g.fx.explosion(at, old ? 0.8 : 2, [0.5, 0.9, 0.2]);
      g.fx.fire(at, 0.8, old ? 2 : 6);
      g.audio.explosion(at, old ? 0.25 : 0.6);
      M.grp.removeFromParent();
      this.mines.splice(i, 1);
      const p = g.player.pos;
      if (!old && g.player.canBeHit() && Math.hypot(p.x - M.x, p.z - M.z) < MINE_R + 0.4) {
        g.player.damage(30, at);
        g.player.vel.y = Math.max(g.player.vel.y, 5.5);
      }
    }
  }

  // ================= los espejitos =================
  // (anfitrión) se hace cinco: él salta a otro lado y aparecen cuatro de mentira
  startTrick() {
    const A = this.A;
    const spot = () => {
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * (A.r - 7);
      return [+(A.x + Math.cos(a) * d).toFixed(1), +(A.z + Math.sin(a) * d).toFixed(1)];
    };
    const m = { gg: 'trick', p: [0, 1, 2, 3, 4].flatMap(spot) };
    this.send(m);
    this.trickFx(m.p);
  }

  trickFx(flat) {
    const g = this.g;
    const N = this.gnome;
    const from = N.pos.clone();
    g.fx.explosion(from.clone().setY(from.y + 0.7), 2.2, [0.08, 0.02, 0.03]);
    N.pos.set(flat[0], this.A.y, flat[1]);
    N.net = N.pos.clone();
    N.target = null;
    this.fakes.forEach((F, k) => {
      F.pos.set(flat[2 + k * 2], this.A.y, flat[3 + k * 2]);
      F.net = null;
      F.target = null;
      F.alive = true;
      F.root.visible = true;
      F.root.position.copy(F.pos);
      g.fx.explosion(F.pos.clone().setY(this.A.y + 0.7), 1.2, [0.08, 0.02, 0.03]);
    });
    this.trick = { t: 0, dmg: 0 };
    chiquiGiggle(g.audio, { pos: from, gain: 1.8, ref: 16, echo: 0.8 });
    announce(g, '¡Se hizo cinco! El de verdad deja brasas donde pisa; los otros revientan en humo.', 5, true);
  }

  // (anfitrión) se le terminó el truco
  endTrick(found = false) {
    if (!this.trick) return;
    this.send({ gg: 'trickEnd' });
    this.trickEndFx();
  }

  trickEndFx() {
    if (!this.trick) return;
    this.trick = null;
    for (const F of this.fakes) if (F.alive) this.popFx(F, false);
  }

  popFx(F, loud = true) {
    const g = this.g;
    F.alive = false;
    F.root.visible = false;
    g.fx.explosion(F.pos.clone().setY(F.pos.y + 0.7), 1.6, [0.06, 0.02, 0.03]);
    g.fx.dust(F.pos.clone().setY(F.pos.y + 0.4), UP, [0.08, 0.05, 0.06], 14);
    if (loud) chiquiGiggle(g.audio, { pos: F.pos, gain: 1, ref: 10, pitch: 1.3 });
  }

  // Un tiro a un espejito (lo ve el que tiró; el anfitrión decide).
  hitFake(i) {
    const g = this.g;
    const F = this.fakes[i];
    if (!F?.alive) return;
    this.popFx(F);
    g.hud.hitmarker(false);
    if (isHost(g)) this.popFakeHost(i);
    else g.net.net.send({ t: 'pee', a: 'gg', k: 'fake', i });
  }

  // (anfitrión) el de mentira revienta y deja un muerto en su lugar
  popFakeHost(i) {
    const g = this.g;
    const F = this.fakes[i];
    if (!this.trick || !F) return;
    if (F.alive) this.popFx(F);
    this.send({ gg: 'pop', i });
    if (this.phase !== 'won') g.zombies.spawn(Math.max(20, g.rounds.round), 2600, F.pos.clone());
    if (!this.fakes.some((x) => x.alive)) this.endTrick(true);
  }

  // ================= el caos =================
  // (anfitrión) sin vida se mete en el remolino y el Éter se rompe
  startChaos() {
    const g = this.g;
    const N = this.gnome;
    this.endTrick();
    N.hp = 1;
    N.trickDue = false;
    this.setStage('chaos');
    this.chaosT = 0;
    this.helpT = 0;
    Object.assign(this.cd, { bolt: 3, sky: 5, strafe: 3, horde: 4 });
    // (uno por pedazo, cada 14 s)
    this.crashes = FRAGMENTS.map((F, k) => 4 + k * 14);
    this.floats = [15, 47];
    this.sync();
  }

  chaosFx() {
    const g = this.g;
    const N = this.gnome;
    const A = this.A;
    this.trickEndFx();
    this.altProg ||= [0, 0, 0, 0];
    this.altLit ||= [false, false, false, false];
    N.stun = 0;
    N.cower = 0;
    N.grow = 0;
    const from = N.pos.clone();
    N.pos.set(A.x, A.y, A.z);
    N.net = N.pos.clone();
    for (const M of this.mines) M.grp.removeFromParent();
    this.mines = [];
    g.fx.explosion(from.setY(from.y + 0.8), 3, [0.9, 0.1, 0.1]);
    g.post?.flash(1);
    g.fx.addShake(1.2);
    chiquiGlitch(g.audio, 1.2);
    chiquiGiggle(g.audio, { pos: N.pos, gain: 2.4, ref: 30, pitch: 0.7, echo: 0.9 });
    this.shield.visible = true;
    for (const R of this.altRings) R.grp.visible = true;
    this.song?.level?.(1.3, 3);
    announce(g, '¡No se deja! Se metió en un remolino y el Éter se rompe. Párense en los cuatro altares: cada uno trae a su caballero.', 7, true);
  }

  // (anfitrión) rayos, yerba del cielo, pedazos, gravedad, y los altares
  thinkChaos(dt, alive) {
    const g = this.g;
    const C = this.cd;
    const A = this.A;
    const spot = (near) => {
      const targets = this.standing();
      if (near && targets.length) {
        const p = targets[Math.floor(Math.random() * targets.length)];
        return [p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3];
      }
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * (A.r - 1.5);
      return [A.x + Math.cos(a) * d, A.z + Math.sin(a) * d];
    };
    const atk = (k, near, extra = {}) => {
      const [x, z] = spot(near);
      const m = { gg: 'atk', k, x: +x.toFixed(1), z: +z.toFixed(1), ...extra };
      this.send(m);
      this.attackFx(m);
    };
    // los caballeros prendidos les tiran rayos a los muertos
    this.zapT = (this.zapT || 0) - dt;
    if (this.zapT <= 0 && alive) {
      this.zapT = 0.9;
      this.knightIds.forEach((id, i) => {
        if (!this.altLit?.[i]) return;
        const r = this.knightRec(id).pos;
        let best = null;
        let bd = 16;
        for (const z of g.zombies.pool) {
          if (!z.active || z.dead) continue;
          const d = Math.hypot(z.pos.x - r.x, z.pos.z - r.z);
          if (d < bd) {
            bd = d;
            best = z;
          }
        }
        if (!best) return;
        const p = [+best.pos.x.toFixed(1), +((best.pos.y || A.y) + 1).toFixed(1), +best.pos.z.toFixed(1)];
        this.send({ gg: 'zap', i, p });
        this.zapFx(i, new THREE.Vector3(...p));
        g.zombies.damage(best, best.maxHp + 1, { type: 'lightning', point: tmpV.set(...p), noPoints: true });
      });
    }
    if (this.stage !== 'chaos') return;
    this.chaosT += dt;
    if (this.crashes.length && this.chaosT >= this.crashes[0]) {
      this.crashes.shift();
      const m = { gg: 'atk', k: 'crash', i: FRAGMENTS.length - 1 - this.crashes.length };
      this.send(m);
      this.attackFx(m);
    }
    if (this.floats.length && this.chaosT >= this.floats[0]) {
      this.floats.shift();
      const m = { gg: 'atk', k: 'float', s: 7 };
      this.send(m);
      this.attackFx(m);
    }
    C.bolt -= dt;
    if (C.bolt <= 0) {
      C.bolt = 0.75 + Math.random() * 0.7;
      atk('bolt', Math.random() < 0.45);
    }
    C.sky -= dt;
    if (C.sky <= 0) {
      C.sky = 2.4 + Math.random() * 1.6;
      atk('meteor', Math.random() < 0.5, { sky: 1 });
    }
    // los altares: se llenan con alguien adentro y se vacían despacio
    const who = this.standing();
    let changed = false;
    ELEMENTS.forEach((el, i) => {
      if (this.altLit[i]) return;
      const [x, z] = this.altarSpots[el];
      const on = who.some((p) => Math.hypot(p.x - x, p.z - z) < ALTAR_R);
      const v0 = this.altProg[i];
      this.altProg[i] = on ? Math.min(1, v0 + dt / ALTAR_SECS) : Math.max(0, v0 - dt * 0.12);
      if (this.altProg[i] !== v0) changed = true;
      if (this.altProg[i] >= 1) this.lightAltar(i);
    });
    if (changed && (this.altSendT = (this.altSendT || 0) - dt) <= 0) {
      this.altSendT = 0.3;
      this.send({ gg: 'alt', v: this.altProg.map((v) => +v.toFixed(2)) });
    }
    // (antes, si pasaba mucho sin que se prendiera ninguno, un caballero
    // prendía el suyo solo: ahora los cuatro los tienen que prender ellos)
  }

  // (anfitrión)
  lightAltar(i, helped = false) {
    const g = this.g;
    if (this.altLit[i] || this.stage !== 'chaos') return;
    this.send({ gg: 'lit', i, h: helped ? 1 : 0 });
    this.litFx(i, helped);
    this.helpT = 0;
    if (this.altLit.every(Boolean)) g.later(1.6, () => this.startPin());
    this.sync();
  }

  // Un altar prendido: columna de luz, el rayo al remolino y su caballero.
  litFx(i, helped = false, quiet = false) {
    const g = this.g;
    this.altProg ||= [0, 0, 0, 0];
    this.altLit ||= [false, false, false, false];
    if (this.altLit[i]) return;
    this.altLit[i] = true;
    this.altProg[i] = 1;
    const el = ELEMENTS[i];
    const [x, z] = this.altarSpots[el];
    const R = this.altRings[i];
    R.grp.visible = true;
    R.pillar.visible = true;
    R.beam.visible = true;
    // el caballero, entre el altar y el medio (sujetado ya está al lado del duende)
    const A = this.A;
    const rec = this.knightRec(this.knightIds[i]);
    if (this.stage !== 'pin') {
      const dx = A.x - x;
      const dz = A.z - z;
      const d = Math.hypot(dx, dz) || 1;
      // (corrido al costado del rayo que va del altar al remolino: parado en el
      // medio, el rayo le pasaba por la cara y no se lo veía)
      rec.pos.set(x + (dx / d) * 1.9 - (dz / d) * 1.2, A.y, z + (dz / d) * 1.9 + (dx / d) * 1.2);
      rec.yaw = Math.atan2(-(A.x - rec.pos.x), -(A.z - rec.pos.z));
    }
    this.knights.root.visible = true;
    if (quiet) return;
    const at = new THREE.Vector3(x, A.y, z);
    g.fx.lightning(at.clone().setY(A.y + 40), at.clone().setY(A.y + 1), ELEM_COLOR[el], 0.4);
    g.fx.explosion(at.clone().setY(A.y + 1.2), 3, ELEM_RGB[el]);
    g.fx.flash(at, ELEM_COLOR[el], 40, 0.8, 50);
    g.fx.explosion(rec.pos.clone().setY(A.y + 1), 1.5, ELEM_RGB[el]);
    g.fx.addShake(0.5);
    const a = g.audio;
    if (a.ctx) {
      const o = a.out({ pos: at, reverb: 0.9, gain: 1.2, ref: 30 });
      const t = a.now;
      for (const [k, f] of [196, 247, 294, 392].entries()) a.tone(o, { t: t + k * 0.07, dur: 2.2, type: 'triangle', freq: f * (1 + i * 0.125), gain: 0.14, attack: 0.02 });
      a.thunder?.(at);
    }
    const left = this.altLit.filter((v) => !v).length;
    const who = helped ? `${KNIGHT_NAMES[el]} lo prendió solo. ` : '';
    announce(g, left ? `¡El altar del ${ELEM_NAME[el]}! ${who}Vuelve ${KNIGHT_NAMES[el]}. Quedan ${left}.` : '¡Los cuatro altares! Los caballeros lo sacan del remolino...', 4, true);
  }

  // (anfitrión) con los cuatro prendidos: el golpe final
  startPin() {
    const g = this.g;
    if (this.stage !== 'chaos') return;
    const N = this.gnome;
    N.max = Math.round(FINAL_HP * this.team(0.6));
    N.hp = N.max;
    this.pinT = g.time;
    this.setStage('pin');
    this.sync();
    announce(g, '¡Los cuatro caballeros de la luz lo tienen agarrado! ¡El golpe final!', 5, true);
  }

  zapFx(i, p) {
    const g = this.g;
    g.fx.lightning(this.knightFrom(i, tmpV), p, ELEM_COLOR[ELEMENTS[i]], 0.2);
    g.fx.sparkle(p, ELEM_RGB[ELEMENTS[i]], 6, 0.5);
  }

  // Los círculos y las columnas de los altares (se ven igual en todas las compus).
  updateAltars(dt, t) {
    if (!this.altRings || !this.altProg) return;
    const wild = this.stage === 'chaos';
    const c = this.shieldSolid.c;
    this.altRings.forEach((R, i) => {
      if (!R.grp.visible) return;
      const lit = this.altLit[i];
      const v = this.altProg[i] || 0;
      R.fill.scale.setScalar(Math.max(0.01, v * ALTAR_R));
      R.fill.material.opacity = lit ? 0.35 : 0.2 + v * 0.3;
      R.ring.material.opacity = lit ? 0.9 : 0.4 + Math.sin(t * 6 + i) * 0.2;
      R.pillar.material.opacity = lit ? 0.22 + Math.sin(t * 3 + i) * 0.06 : 0;
      // el rayo al remolino (sujetado ya no hace falta)
      R.beam.visible = lit && wild;
      if (R.beam.visible) {
        R.beam.lookAt(c);
        R.beam.scale.set(1 + Math.sin(t * 20 + i) * 0.3, 1 + Math.sin(t * 17 + i) * 0.3, R.beam.position.distanceTo(c) - 2.2);
      }
    });
    if (this.stage === 'dead') for (const R of this.altRings) R.grp.visible = false;
  }

  // El duende en el remolino: crece, flota en el medio y da vueltas.
  updateVortex(dt, t) {
    const N = this.gnome;
    const A = this.A;
    N.grow = Math.min(1, N.grow + dt / 1.6);
    const k = smooth(N.grow);
    const s = 1.3 + k * 1.7;
    N.root.scale.setScalar(s * (1 + (Math.random() - 0.5) * 0.03));
    const lit = (this.altLit || []).filter(Boolean).length;
    // (con cada altar prendido el remolino aprieta: se sacude más)
    const jit = 0.03 + lit * 0.03;
    N.root.position.set(A.x + (Math.random() - 0.5) * jit, A.y + k * 1.4 + Math.sin(t * 1.3) * 0.25, A.z + (Math.random() - 0.5) * jit);
    N.root.rotation.set(Math.sin(t * 2) * 0.08, t * (0.8 + lit * 0.5), 0);
    N.stars.visible = false;
    // (el cuerpo de verdad: lo sacude el remolino)
    N.rig.mode = 'zap';
    N.rig.head.rotation.set(0, 0, 0);
    N.rig.update(dt, t);
    const c = this.shieldSolid.c.copy(N.root.position).setY(N.root.position.y + 0.55 * s);
    this.shield.position.copy(c);
    this.shield.scale.setScalar(this.shieldSolid.r * (1 + Math.sin(t * 3) * 0.03));
    this.shield.rotation.y += dt * (2 + lit);
    const U = this.shield.material.uniforms;
    U.uTime.value = t;
    U.uK.value = Math.min(1, U.uK.value + dt) * (1 + lit * 0.15);
    if (Math.random() < 0.3) this.g.fx.alpha.spawn(c.x + (Math.random() - 0.5) * 5, A.y + 0.2, c.z + (Math.random() - 0.5) * 5, 0, 2.5, 0, { color: [0.12, 0.02, 0.03], size: 1, size1: 3, life: 1.4, alpha: 0.5, drag: 0.4 });
  }

  // Lo que dice el cartel de arriba en cada parte de la pelea.
  objective() {
    if (!this.active) return null;
    if (this.stage === 'gems' || this.stage === 'rise') {
      const A = this.stage === 'gems' ? this.gems[this.gemOn] : null;
      const sub = A ? `Rompan la gema que brilla en el poncho, la del ${ELEM_NAME[A.el]}: con ${ELEM_NAME[A.el]}, el mate del ${A.el}` : this.stage === 'gems' ? 'El coloso se deshace...' : 'Rompan las gemas del poncho de a una: solo se rompe la que brilla';
      return { main: 'La Gran Guerra', sub, count: `${this.gems.filter((G) => G.hp <= 0).length}/4` };
    }
    if (this.stage === 'gnome') return { main: 'El Chiquitijuein', sub: this.trick ? 'Se hizo cinco: el de verdad deja brasas donde pisa' : 'Soplen el cuerno del medio de la isla (mantener F): el dragón lo marea y recién ahí le entran los tiros' };
    if (this.stage === 'chaos') return { main: 'El Éter se rompe', sub: 'Párense en los altares para prenderlos', count: `${(this.altLit || []).filter(Boolean).length}/4` };
    if (this.stage === 'pin') return { main: 'El golpe final', sub: 'Los caballeros lo tienen agarrado: ¡denle con todo!' };
    return null;
  }

  // (pruebas, anfitrión) saltar a una parte de la pelea
  debugStage(st) {
    const g = this.g;
    if (!isHost(g) || !this.active) return;
    if (this.stage === 'rise' || this.stage === 'gems') {
      this.col.rise = 1;
      this.gems.forEach((G, i) => {
        if (G.hp <= 0) return;
        this.send({ gg: 'break', i });
        this.breakGem(i);
      });
      this.startGnome();
    }
    if ((st === 'chaos' || st === 'pin') && this.stage === 'gnome') this.startChaos();
    if (st === 'pin' && this.stage === 'chaos') {
      this.altLit.forEach((v, i) => {
        if (!v) this.lightAltar(i);
      });
    }
  }

  dispose() {
    this.song?.stop();
    this.song = null;
    for (const l of this.lights) l.removeFromParent();
    this.wardMesh.removeFromParent();
    this.ov?.el.remove();
    this.root.removeFromParent();
    this.knights?.root.removeFromParent();
    for (const c of this.rain || []) c.group.removeFromParent();
    for (const f of this.fireballs || []) f.mesh.removeFromParent();
    for (const M of this.marks || []) M.mesh?.removeFromParent();
    for (const W of this.waves || []) W.mesh?.removeFromParent();
    if (this.floatT > 0) this.floatT = 0;
  }
}

// (el silbido de la pava del dragón cuando se tira en picada)
// (vectores del dragón: no se pisan con los tmp de las demás partes)
const dP = new THREE.Vector3();
const dP2 = new THREE.Vector3();
const dP3 = new THREE.Vector3();
const dE = new THREE.Euler();

// Punto de una curva de tres puntos (a, b de control, c) en u.
function bezier(a, b, c, u, out) {
  const k = 1 - u;
  return out.set(k * k * a.x + 2 * k * u * b.x + u * u * c.x, k * k * a.y + 2 * k * u * b.y + u * u * c.y, k * k * a.z + 2 * k * u * b.z + u * u * c.z);
}

// El borde de la roca de un pedazo de mapa, prendido de su color (así se lee
// contra el cielo de tormenta).
function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.4) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = mat3(modelMatrix) * normal;
        vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN + vec3(1e-5)), normalize(vV + vec3(1e-5))));
        f = pow(clamp(f, 0.0, 1.0), 3.0);
        gl_FragColor = vec4(uColor * f, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function dragonWhistle(g) {
  g.ee?.cueva?.whistle?.(1.3);
}

const tmpN = new THREE.Vector3();

// Empuja un punto afuera de un círculo (en el piso).
function pushOut(p, c, r) {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-4) return;
  p.x = c.x + (dx / d) * r;
  p.z = c.z + (dz / d) * r;
}

// Distancia a la que el rayo entra en la esfera (o -1).
function raySphereT(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? 0 : -1;
}

// ---------------- el remolino (la puerta al Éter) ----------------
const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PORTAL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uK;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  float sw = sin(a * 5.0 + r * 14.0 - uTime * 2.2) * 0.5 + 0.5;
  float sw2 = sin(a * 3.0 - r * 9.0 + uTime * 1.3) * 0.5 + 0.5;
  float ring = smoothstep(1.0, 0.55, r) * smoothstep(0.0, 0.25, r);
  vec3 col = mix(vec3(0.45, 0.2, 0.9), vec3(1.0, 0.75, 0.4), sw2) * (0.35 + sw * 0.9) * ring;
  col += vec3(1.0, 0.9, 0.7) * smoothstep(0.22, 0.0, r) * 1.5;
  gl_FragColor = vec4(col * uK, clamp(ring * uK, 0.0, 1.0));
}`;

// ---------------- el cielo del Éter ----------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}`;
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uChaos;
uniform float uFlash;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -1.0, 1.0);
  float ang = atan(d.z, d.x + 1e-5);
  float r = acos(up) / 3.14159;
  // un remolino que gira alrededor del ojo, arriba
  // (el ángulo va por un número entero de vueltas: si no, queda una costura
  // vertical donde atan salta de -pi a pi)
  float sw = ang * 2.0 + r * 9.0 - uTime * (0.06 + uChaos * 0.22);
  float n = fbm(vec2(cos(sw), sin(sw)) * 2.4 + vec2(r * 6.0, uTime * 0.02));
  float bands = smoothstep(0.35, 0.8, n);
  vec3 deep = vec3(0.04, 0.02, 0.08);
  vec3 violet = vec3(0.28, 0.1, 0.42);
  vec3 teal = vec3(0.06, 0.22, 0.3);
  vec3 col = mix(deep, mix(teal, violet, n), bands);
  // el ojo dorado del remolino
  float eye = smoothstep(0.16, 0.0, r);
  col += vec3(1.0, 0.72, 0.35) * eye * 1.6;
  col += vec3(0.8, 0.5, 0.9) * smoothstep(0.3, 0.1, r) * 0.25;
  // abajo, el resplandor de las nubes
  col = mix(col, vec3(0.25, 0.14, 0.3), smoothstep(0.55, 0.9, r) * 0.7);
  // el caos: el remolino se pone colorado como brasa y relampaguea
  vec3 blood = vec3(0.55, 0.06, 0.03);
  col = mix(col, col * 0.55 + blood * (0.35 + bands * 1.3), uChaos * 0.75);
  col += vec3(0.7, 0.8, 1.0) * uFlash * (0.25 + smoothstep(0.3, 0.9, n) * 0.9);
  gl_FragColor = vec4(clamp(col, 0.0, 4.0), 1.0);
}`;

// ---------------- el remolino del duende (la tercera parte) ----------------
const SHIELD_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FRAG = /* glsl */ `
uniform float uTime;
uniform float uK;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float sw = sin(vUv.x * 37.7 + vUv.y * 14.0 - uTime * 7.0) * 0.5 + 0.5;
  float sw2 = sin(vUv.x * 18.8 - vUv.y * 22.0 + uTime * 4.0) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.45, 0.02, 0.04), vec3(1.0, 0.35, 0.08), sw * sw2);
  float a = (0.12 + fres * 0.85) * (0.55 + sw * 0.45) * uK;
  gl_FragColor = vec4(col * a * 1.6, a);
}`;
const CLOUD_VERT = /* glsl */ `
varying vec2 vP;
varying vec2 vL;
void main() {
  // (el dibujo va pegado al mundo; el borde que se desvanece, a la cámara)
  vL = position.xz;
  vP = (modelMatrix * vec4(position, 1.0)).xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const CLOUD_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vP;
varying vec2 vL;
${NOISE}
void main() {
  vec2 p = vP * 0.012;
  float n = fbm(p + vec2(uTime * 0.01, uTime * 0.006));
  float m = fbm(p * 2.3 - vec2(uTime * 0.015, 0.0));
  float c = smoothstep(0.35, 0.75, n * 0.7 + m * 0.4);
  float edge = 1.0 - smoothstep(200.0, 340.0, length(vL));
  vec3 col = mix(vec3(0.12, 0.06, 0.16), vec3(0.55, 0.42, 0.6), c);
  gl_FragColor = vec4(col, clamp(c * 0.9 * edge + 0.1 * edge, 0.0, 1.0));
}`;
