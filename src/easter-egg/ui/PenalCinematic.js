import * as THREE from 'three';
import { EE } from '../config/map';
import Avatars from '../net/Avatars';
import { buildVoz, updateVoz } from './voz';
import { warmScene } from './cineWarm';
import { PENAL_PEACE, PENAL_FROM } from '../core/music';
import { buildSupremoDisplay, animateSupremoDisplay } from '../weapons/Supremo';
import { SIX, flareTexture } from '../weapons/supremoFx';
import { arm, leg } from '../entities/zombieGaits';
import { solvePose, PART_COUNT } from '../entities/skeleton';
import { crewIds, glowFront, personaOf, PERSONA_T } from './cineCrew';
import { preloadBossSkin } from '../entities/bossSkin';
import { cineClip, poseCineClip, gauchoClip, cineSnap, headProp, FACE_EYES } from '../net/gauchoSkin';
import { assetUrl } from '../../lib/assets';

// Final del penal, adentro del juego, en el Cerro del Espinillo. El Gauchito
// Gil queda de rodillas junto al espinillo. Las almas del penal suben al
// cielo, y los tres presos (ya ánimas) se despiden y se van con ellas. Un
// paneo por el altar (el mate supremo y la yerba dorada). El Gil levanta la
// cabeza para avisar quién es la voz que los guió... y un rayo lo parte a
// mitad de la frase. La Voz de Arriba baja y se lo roba: su luz violeta
// agarra el mate, que se resiste, le arranca los seis colores uno por uno
// (suben en espiral por la luz hasta el ojo) y, apagado, se lo chupa de un
// tirón. (Lo del despertar, con el sello y el Juicio, es de cuando se arma:
// entities/penalForge.js.) La Voz se pone colorada y se va. Los cuatro
// gauchos (siempre cuatro: ui/cineCrew.js) terminan en el río. Se puede
// saltear con Esc, Espacio o clic.

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
  // (el brazo bajo y el antebrazo adelante: con el brazo levantado se le abría el poncho)
  talk: { hipY: 0.55, torsoP: 0.22, torsoR: 0, headP: -0.12, shLp: -0.5, shRp: -0.5, shLr: 0.12, shRr: -0.3, elL: -1.05, elR: -0.9 },
  struck: { hipY: 0.62, torsoP: -0.5, torsoR: 0, headP: -0.75, shLp: -2.5, shRp: -2.5, shLr: -0.6, shRr: 0.6, elL: -0.15, elR: -0.15 },
  ash: { hipY: 0.45, torsoP: 1.15, torsoR: 0.1, headP: 0.7, shLp: 0.1, shRp: 0.1, shLr: 0.1, shRr: -0.1, elL: -0.2, elR: -0.2 },
};
const CHAR = new THREE.Color(0x141110);
const TAU = Math.PI * 2;
// el rayo de la Voz al irse los tira del cerro al río: dónde caen (agua honda
// al este del barranco), de dónde arrancan a nadar y dónde salen (la playita)
const LAND = [99.2, 16.2];
const FLY = 1.8;
const FLY_H = 7.5;
const SWIM = [98.8, 19.8];
const SHORE = [95.8, 23.4];
// la toma de arriba termina mirando el medio del mapa
const MID = new THREE.Vector3(49, 0, 62);
// el robo: cuánto se resiste el mate, cada cuánto sale una reliquia, cuánto
// tarda en subir hasta el ojo y el brillo del mate en la piedra (su tamaño)
const GRAB = 3;
const RELIC_GAP = 0.42;
const RELIC_UP = 0.95;
const DRAIN = RELIC_GAP * 5 + RELIC_UP;
const GLOW = 1.4;
const VIOLET = new THREE.Color(0x9a6aff);
const GOLD = new THREE.Color(0xffc84a);
const SIX_RGB = SIX.map((c) => {
  const x = new THREE.Color(c);
  return [x.r, x.g, x.b];
});

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpMat = new THREE.Matrix4();
const tmpMat2 = new THREE.Matrix4();
// (la pose de prueba de los que están acostados: lieFit)
const LIE_MATS = Array.from({ length: PART_COUNT }, () => new THREE.Matrix4());
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const rnd = () => Math.random() - 0.5;
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
    // (en línea el reloj cuenta desde acá, como ui/FarmCinematic: la compu que
    // se traba armando la escena no arranca atrasada; antes se perdía lo que
    // tardaba el primer cuadro, 0,3 s entre dos compus)
    this.wallAt = g.net && globalThis.__mduNoCineSync !== true ? performance.now() : 0;
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
    // los efectos del Mate Supremo (weapons/supremoFx.js, ya compilados): lo
    // que quedaba de un Juicio en la mano se apaga, y la escena usa su sol
    g.weapons?.supremo?.clear?.();
    this.SF = g.weapons?.supremo?.fx || null;
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
    // ni el haz de la caja (desde arriba del penal quedaba como una barra verde)
    this.boxBeams = [g.interact?.box, ...(g.interact?.saleBoxes || [])].map((b) => b?.beam).filter((b) => b?.visible);
    for (const b of this.boxBeams) b.visible = false;
    // dónde está cada uno: el Gil a un costado del altar y los gauchos enfrente
    const gx = ax - 2.3;
    const gz = az + 0.4;
    this.G = new THREE.Vector3(gx, W.floorAt(gx, gz), gz);
    this.C = new THREE.Vector3(ax + 0.3, A.y, az + 3.9);
    this.people = new Avatars(g, null);
    this.buildGauchos();
    // (los anteojos del Canchero se arman ya, escondidos: se compilan con el resto)
    this.shades = this.buildShades();
    this.shadesHand = new THREE.Group();
    this.shadesHand.add(this.shades);
    this.shadesHand.visible = false;
    this.root.add(this.shadesHand);
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
    // los gauchos con movimientos animados a mano en Blender (el sobresalto del
    // rayo, taparse de la luz, salir despedidos, desplomarse en la playa:
    // C:/Users/ignac/Tools/mdu-blender penal_clips.py); el agua y el gateo, con
    // los clips de siempre (net/gauchoSkin). globalThis.__mduBlend = false: como antes.
    this.PC = null;
    if (globalThis.__mduBlend !== false) {
      fetch(assetUrl('/assets/sotano/modelos/gaucho/cine-penal.json'))
        .then((r) => r.json())
        .then((J) => {
          const C = {};
          for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
          this.PC = C;
        })
        .catch(() => {});
    }
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
  // Los gauchos: vos y los compañeros (siempre cuatro), en ronda frente al altar.
  buildGauchos() {
    const g = this.g;
    const ids = crewIds(g);
    this.gauchos = ids.map((id, i) => {
      const s = i - (ids.length - 1) / 2;
      const x = this.C.x + s * 1.15;
      const z = this.C.z + Math.abs(s) * 0.35;
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(x, g.world.floorAt(x, z), z), yaw: 0, pitch: 0, speed: 0, moving: false, crouch: false, persona: personaOf(i) };
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
    // (su cuerpo de verdad ya vino con la pelea; si se entra directo al final, se baja ya)
    preloadBossSkin(Z, 'gil');
    Z.dressBoss('gil');
    Z.bossRig.rig.visible = true;
    this.gil = z;
    this.gilPose = 'down';
    this.gilK = { ...GIL_POSE.down };
    // (la muerte en la pelea ya lo dejó en gDown, en este mismo lugar y rumbo:
    // entities/skins/gil.js S.downT. Sigue desde ese cuadro, sin salto al cortar.
    // globalThis.__mduNoGilDeathCine = true: desde el principio, como antes)
    const SK = window.__bossSkins?.gil;
    this.downAt = globalThis.__mduNoGilDeathCine !== true && SK?.downT != null ? SK.downT : 0;
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
    // el Mate Supremo de verdad (weapons/Supremo.js), donde estaba el del
    // altar (los de la piedra se esconden)
    for (const o of [src?.altarMate, src?.altarBomb, src?.altarSup]) if (o) o.visible = false;
    this.sup = buildSupremoDisplay(g.textures, 0.3);
    this.sup.position.y = -0.08;
    this.mate.add(this.sup);
    this.mateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffc84a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.mateGlow.scale.setScalar(GLOW);
    this.mate.add(this.mateGlow);
    this.glowSize = GLOW;
    this.mate.position.copy(base);
    this.mateBase = base.clone();
    this.root.add(this.mate);
    // las seis luces que la Voz le arranca (una por reliquia): se arman ya,
    // escondidas, para que se compilen con el resto
    const spr = (map, c, k) => new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(c).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    this.comets = SIX.map((c) => {
      const o = new THREE.Group();
      const glow = spr(g.textures.dot, c, 2);
      glow.scale.setScalar(0.9);
      const star = spr(flareTexture(), c, 2.4);
      star.scale.setScalar(1.3);
      o.add(glow, star);
      o.visible = false;
      this.root.add(o);
      return { o, star, from: new THREE.Vector3(), t0: 0, a0: 0, done: false };
    });
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
    this.yerbaBoost = 0;
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
        // (si las del cerro no se habían soltado, se sueltan ahora)
        g.arena?.freeSouls?.();
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
        // (en línea, por el reloj de la escena, que es el mismo en todas: la
        // canción de cada compu va distinta y el Gil hablaba 2 s antes en una)
        const mt = this.scored && !(g.net && globalThis.__mduNoCineSync !== true) && g.music.is('cine-penal-final') ? g.music.time() : -1;
        // (la mitad de antes: el usuario lo encontró largo; la canción se va
        // cuando el Gil levanta la cabeza, antes de que termine la calma)
        const d = (this.scored ? Math.max(5, PENAL_PEACE - (mt >= 0 ? mt : this.t + PENAL_FROM) - 1.2) : 4.6) / 2;
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
      [0.3, () => {
        this.urgent = this.t;
        const d = this.say('gil', CUT_LINE, { cut: true });
        // (en "Esa voz es de—" levanta la mano hacia el cielo: el último tercio)
        this.pointT = this.t + Math.max(1, d * 0.66);
        return d;
      }],
      // el rayo lo parte a mitad de la frase
      [0, () => {
        this.strike();
        // con los clips de Blender del Gil, de cerca: el rayo, cómo se arquea y
        // cómo se desarma hasta hundirse en la ceniza; recién ahí las caras
        // (sin canción en este tramo: alargar el paso no corre nada; en línea
        // la duración es la misma en todas las compus)
        if (this.gilClips()) {
          this.shotStrike(3.1);
          if (this.PC) this.later(3.1, () => this.shotFaces(2));
          return 5.1;
        }
        this.shotBolt();
        // (los gauchos se sobresaltan: de frente, si están los clips de Blender)
        if (this.PC) this.later(1.5, () => this.shotFaces(2.3));
        return 3.8;
      }],
      // la Voz baja
      [0, () => {
        this.voiceIn();
        this.shotVoice();
        return 3;
      }],
      [0, () => {
        if (this.PC) this.shotFaces(3.2, true);
        return this.say('entidad', 'Pobre Gil. Siempre habló de más.');
      }],
      // el robo: la luz de la Voz se vuelve violeta y agarra el mate, que se resiste
      [0.3, () => {
        this.grab();
        this.shotGrab();
        return GRAB;
      }],
      // le arranca los seis colores, uno por uno: suben en espiral hasta el ojo
      [0, () => {
        this.drain();
        this.shotDrain();
        return DRAIN + 0.5;
      }],
      [0, () => this.say('entidad', 'Cien años esperándolo...')],
      // apagado, sale disparado para arriba
      [0.2, () => {
        this.mateUp(1.5);
        this.shotYank();
        return 1.5;
      }],
      [0, () => {
        this.absorb();
        this.shotEye();
        return 1;
      }],
      [0, () => this.say('entidad', 'Gracias, gauchos sucios. Gracias por ser tan ignorantes.')],
      [0.3, () => this.say('entidad', 'El mate supremo es mío.')],
      // se va y, al irse, larga un rayo que los tira del cerro al río
      [0.2, () => {
        this.voiceOut();
        this.shotBlast();
        return 1;
      }],
      [0, () => {
        this.blast();
        return FLY + 0.4;
      }],
      // a duras penas en el agua
      [0, () => {
        this.shotStruggle();
        return 2.8;
      }],
      [0, () => {
        this.black(1, 0.35);
        return 0.45;
      }],
      // y llegan a la orilla, arrastrándose
      [0, () => {
        this.toShore();
        this.black(0, 0.6);
        this.shotShore();
        return 7.4;
      }],
      // de arriba: el penal entero, y ellos tirados en la playita
      [0, () => {
        this.shotAerial();
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
    const d = this.g.audio.say(text, who, { cine: true, cut });
    this.whoEl.textContent = WHO[who] || '';
    this.span.textContent = '';
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-gil', who === 'gil');
    this.el.classList.toggle('is-anima', who === 'anacleto' || who === 'benito');
    this.sub = { text, t0: this.t, rev: Math.max(0.5, cut ? d * 0.95 : Math.min(d * 0.85, text.length * 0.045)), k: -1 };
    // (cortada: lo que sigue entra un pelito antes de que termine, así le
    // muerde la última sílaba en vez de dejar un silencio)
    return cut ? Math.max(0.5, d - 0.05) : d;
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
    // cada uno a su manera (ui/cineCrew PERSONA): el Valiente levanta los
    // puños, el Miedoso se agacha y queda temblando, el Canchero apenas pega un
    // respingo y se sacude el polvo, el Viejo trastabilla
    const REACT = { valiente: ['flinch', 'fists', 1.2], miedoso: ['duck', 'cower', 1.5], canchero: ['dust', 'cool', 1.9], viejo: ['stagger', 'winded', 1.45] };
    for (const r of this.gauchos) {
      const [a, b, d] = REACT[r.persona] || REACT.valiente;
      const t0 = (PERSONA_T[r.persona]?.delay || 0) * 0.35;
      this.later(t0, () => this.act(r, a, { fade: 0.28 }));
      this.later(t0 + d, () => this.act(r, b, { loop: true, fade: 0.4 }));
    }
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
    // el Valiente le muestra el puño, el Miedoso se santigua y reza, el
    // Canchero se pone los anteojos de sol, el Viejo cae de rodillas
    for (const r of this.gauchos) {
      const t0 = 0.3 + (PERSONA_T[r.persona]?.delay || 0) * 1.4;
      if (r.persona === 'miedoso') {
        this.later(t0, () => this.act(r, 'santiguar', { fade: 0.4 }));
        this.later(t0 + 2, () => this.act(r, 'pray', { loop: true, fade: 0.3 }));
      } else if (r.persona === 'canchero') {
        this.later(t0, () => {
          this.act(r, 'shades', { fade: 0.4 });
          this.shadesT = this.t;
          this.shadesR = r;
        });
        // el chiste se ve de cerca: los saca del poncho y se los pone
        this.later(t0 + 0.1, () => this.shotShades(r, 2.75 - t0));
        this.later(t0 + 2.2, () => this.act(r, 'cool', { loop: true, fade: 0.3 }));
      } else if (r.persona === 'viejo') {
        this.later(t0, () => this.act(r, 'kneelDown', { fade: 0.4 }));
        this.later(t0 + 1, () => this.act(r, 'kneelHold', { loop: true, fade: 0.2 }));
      } else this.later(t0, () => this.act(r, 'fistUp', { loop: true, fade: 0.5 }));
    }
  }

  // ---------------- el robo del mate supremo ----------------
  // (no es el despertar de cuando se arma, entities/penalForge.js: acá el
  // mate no muestra nada, se lo sacan)
  // La luz de la Voz se pone violeta y lo agarra: el mate se levanta a los
  // tirones, como si no quisiera irse, y lo envuelven hilos de rayo violeta.
  grab() {
    const g = this.g;
    this.steal = { stage: 'grab', t0: this.t, arcT: 0, drained: 0 };
    this.voz.beamOn = true;
    this.voz.beam.material.color.copy(VIOLET).multiplyScalar(0.8);
    this.look = 'mate';
    this.say('entidad', 'Miren lo que armaron.');
    // un zumbido que baja, algo que chupa y el metal que cruje
    const A = g.audio;
    try {
      const o = A.out({ pos: this.mate.position.clone(), gain: 0.9, reverb: 0.8, ref: 6 });
      const t = A.now;
      A.tone(o, { t, dur: GRAB + DRAIN, type: 'sawtooth', freq: 98, freqEnd: 46, gain: 0.05, attack: 0.8 });
      A.tone(o, { t, dur: GRAB + DRAIN, freq: 62, freqEnd: 41, gain: 0.22, attack: 0.6 });
      A.noise(o, { t, dur: GRAB, type: 'bandpass', freq: 2600, freqEnd: 500, q: 1.4, gain: 0.2, attack: 0.5 });
      for (let i = 0; i < 4; i++) A.tone(o, { t: t + 0.4 + i * 0.62, dur: 0.35, type: 'triangle', freq: 330 - i * 30, freqEnd: 250 - i * 25, gain: 0.05, attack: 0.02 });
    } catch {
      /* sin sonido */
    }
  }

  // Le arranca los colores: cada reliquia se suelta del mate y sube en
  // espiral por la luz hasta el ojo (updateSteal).
  drain() {
    const S = this.steal;
    if (!S) return;
    S.stage = 'drain';
    S.t1 = this.t;
    this.textEl.classList.remove('is-on');
    this.look = 'sky';
    this.comets.forEach((C, i) => {
      C.t0 = this.t + i * RELIC_GAP;
      C.a0 = (i / 6) * TAU;
      C.done = false;
      C.out = false;
    });
  }

  // Una reliquia se suelta del mate: su luz sale y la reliquia se apaga.
  relicOut(C, i) {
    const g = this.g;
    const rel = this.sup.sup?.relics?.[i];
    this.mate.updateMatrixWorld(true);
    if (rel) {
      rel.getWorldPosition(C.from);
      rel.visible = false;
    } else C.from.copy(this.mate.position);
    C.out = true;
    C.o.position.copy(C.from);
    C.o.visible = true;
    g.fx.sparkle(C.from, SIX_RGB[i], 14, 0.5);
    // un tirón del mate hacia abajo (todavía se resiste)
    this.jerk = this.t;
    try {
      const A = g.audio;
      const o = A.out({ pos: C.from.clone(), gain: 0.7, reverb: 0.9, ref: 5 });
      A.tone(o, { dur: RELIC_UP, type: 'sine', freq: 330 + i * 70, freqEnd: (330 + i * 70) * 2.6, gain: 0.07, attack: 0.05 });
    } catch {
      /* sin sonido */
    }
  }

  // Llega al ojo: el ojo se prende de ese color.
  relicIn(C, i) {
    const g = this.g;
    const E = this.voz.root.position;
    C.done = true;
    C.o.visible = false;
    this.steal.drained++;
    g.fx.flash(E, SIX[i], 50, 0.45, 24);
    g.fx.sparkle(E, SIX_RGB[i], 30, 1.4);
    this.voz.beam.material.color.set(SIX[i]).multiplyScalar(1.2);
    try {
      const A = g.audio;
      const o = A.out({ gain: 0.6, reverb: 1.1, bus: A.music });
      A.bell(o, A.now, [74, 76, 79, 81, 83, 86][i], { gain: 0.06, dur: 3 });
    } catch {
      /* sin sonido */
    }
  }

  // El mate mientras se lo roban (hasta que sale disparado: updateVoz).
  updateSteal(dt) {
    const S = this.steal;
    const g = this.g;
    const t = this.t;
    const E = this.voz.root.position;
    const M = this.mate.position;
    const B = this.mateBase;
    const k = S.drained / 6;
    let lift;
    let o;
    if (S.stage === 'grab') {
      const u = clamp01((t - S.t0) / GRAB);
      // sube y lo vuelve a tironear para abajo (se resiste)
      const tug = Math.max(0, Math.sin(t * 5.3)) ** 3;
      lift = 0.6 * smooth(u) - 0.2 * tug * (1 - u * 0.5);
      o = { speed: 2 + u * 3, open: 0.3 + u * 0.5, lift: u, kick: 0.5 + tug * 0.8 };
      if (Math.random() < dt * 5) g.fx.dust(tmpV.set(B.x + rnd() * 0.9, B.y - 0.06, B.z + rnd() * 0.6), { x: 0, y: 1, z: 0 }, [0.5, 0.45, 0.35], 2);
    } else {
      // colgado de la luz; cada reliquia que sale es un tirón
      const j = this.jerk != null ? Math.max(0, 1 - (t - this.jerk) / 0.35) : 0;
      lift = 0.6 + (1 - k) * Math.sin(t * 2.1) * 0.05 - j * 0.12 + k * 0.25;
      o = { speed: 5 * (1 - k) + 0.6, open: 0.8 * (1 - k), lift: 1 - k * 0.6, kick: j * 1.2 };
    }
    const jit = 0.025 * (1 - k * 0.7);
    M.set(B.x + rnd() * jit, B.y + lift + rnd() * jit, B.z + rnd() * jit);
    this.mate.rotation.y += dt * (1.5 + (1 - k) * 2.5);
    animateSupremoDisplay(this.sup, dt, g.time, o);
    // el sol de la boca se va apagando con cada color que pierde
    this.sup.sup?.star?.scale.setScalar(Math.max(0.15, 1 - k * 0.85));
    // el brillo del oro al violeta, cada vez más chico
    this.glowSize = GLOW * (1 - k * 0.45) * (0.92 + Math.sin(t * 9) * 0.08);
    this.mateGlow.material.color.copy(GOLD).lerp(VIOLET, k);
    this.mateGlow.material.opacity = 0.75 - k * 0.35;
    // la luz del mate (la misma del Gil, que ya no está)
    const L = this.warmLight;
    L.color.copy(GOLD).lerp(VIOLET, k);
    L.position.copy(M).setY(M.y + 0.3);
    L.intensity += (6 - k * 3 - L.intensity) * Math.min(1, dt * 3);
    // hilos de rayo violeta que bajan por la luz y lo envuelven
    S.arcT -= dt;
    if (S.arcT <= 0) {
      S.arcT = 0.08 + Math.random() * 0.1;
      const h = 1.2 + Math.random() * 2.8;
      g.fx.lightning(tmpV.set(M.x + rnd() * 0.5, M.y + h, M.z + rnd() * 0.5), tmpW.set(M.x + rnd() * 0.25, M.y + rnd() * 0.2, M.z + rnd() * 0.25), Math.random() < 0.5 ? 0xc8a0ff : 0x8a3aff, 0.22 + Math.random() * 0.12);
    }
    if (Math.random() < 0.5) g.fx.sparkle(M, S.stage === 'grab' ? [1, 0.85, 0.4] : [0.7, 0.55, 1], 1, 0.3);
    // la luz vuelve a violeta después de cada color
    this.voz.beam.material.color.lerp(tmpC.copy(VIOLET).multiplyScalar(0.8), Math.min(1, dt * 3));
    // las reliquias que suben: en espiral alrededor de la luz, cada vez más rápido
    if (S.stage !== 'drain') return;
    for (const [i, C] of this.comets.entries()) {
      if (C.done || t < C.t0) continue;
      if (!C.out) this.relicOut(C, i);
      const u = clamp01((t - C.t0) / RELIC_UP);
      const e = u * u * (1.6 - 0.6 * u);
      const r = 0.7 * (1 - e) + 0.12;
      const a = C.a0 + e * TAU * 1.6;
      const p = C.o.position;
      p.set(C.from.x + (E.x - C.from.x) * e + Math.cos(a) * r, C.from.y + (E.y - 1 - C.from.y) * e, C.from.z + (E.z - C.from.z) * e + Math.sin(a) * r);
      C.star.material.rotation = t * (i % 2 ? 1.5 : -1.5);
      g.fx.add.spawn(p.x, p.y, p.z, rnd() * 0.3, -0.4 - Math.random() * 0.4, rnd() * 0.3, { color: SIX_RGB[i], size: 0.22, size1: 0, life: 0.55 });
      if (u >= 1) this.relicIn(C, i);
    }
  }

  // La ceniza del Gil se la lleva el viento del tirón.
  updateAsh() {
    if (this.ashGo == null || this.ash.scale.x <= 0.01) return;
    const g = this.g;
    const u = clamp01((this.t - this.ashGo) / 1.4);
    const a = 1 - u;
    this.ash.scale.set(0.9 * a + 0.001, 0.3 * a + 0.001, 0.75 * a + 0.001);
    tmpU.set(this.G.x - this.A.x, 0, this.G.z - this.A.z).normalize();
    if (u < 1) for (let i = 0; i < 3; i++) g.fx.alpha.spawn(this.G.x + rnd(), this.G.y + 0.2 + Math.random() * 0.4, this.G.z + rnd(), tmpU.x * (4 + Math.random() * 3), 0.6 + Math.random(), tmpU.z * (4 + Math.random() * 3), { color: [0.14, 0.13, 0.12], size: 0.4, size1: 1.2, life: 1.8, alpha: 0.5, drag: 0.6 });
  }

  // Apagado, el mate sale disparado por la luz hasta el ojo: el tirón levanta
  // viento (los gauchos se cubren y se vuela la ceniza del Gil; el facón queda).
  mateUp(dur) {
    const g = this.g;
    this.mateT = this.t;
    this.mateDur = dur;
    this.mateEnd = this.t + dur;
    this.mateBase.copy(this.mate.position);
    this.voz.beamOn = true;
    g.audio.whoosh?.(this.mate.position);
    g.audio.thunderCrack?.(null, { dur: 0.8, gain: 0.35 });
    g.fx.dust(tmpV.copy(this.A).setY(this.A.y + 0.9), { x: 0, y: 1, z: 0 }, [0.5, 0.45, 0.35], 24);
    g.fx.flash(this.mate.position, 0x9a6aff, 40, 0.4, 16);
    this.shake = Math.max(this.shake, 0.5);
    for (const r of this.gauchos) r.crouch = true;
    this.later(1.4, () => {
      for (const r of this.gauchos) r.crouch = false;
    });
    this.ashGo = this.t;
  }

  // Se lo traga: fogonazo, y la Voz se pone colorada.
  absorb() {
    const g = this.g;
    const E = this.voz.root.position;
    this.mateT = null;
    this.mate.visible = false;
    this.voz.beamOn = false;
    this.evilT = this.t;
    g.post.flash(0.6);
    g.fx.sparkle(E, [1, 0.8, 0.4], 70, 2.2);
    g.fx.flash(E, 0xff5a3a, 120, 0.8, 30);
    g.audio.powerupGrab();
    g.audio.bossArrive?.();
    this.voiceLight.color.set(0xff5a6a);
    // el poder del mate le entra al ojo: un sol, y rayos de los seis colores que se le escapan
    this.SF?.sun(E, 0, 1.6, false, 0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.random() * 0.5;
      g.fx.lightning(E, tmpV.set(E.x + Math.cos(a) * 16, E.y - 5 - Math.random() * 5, E.z + Math.sin(a) * 16), SIX[i], 0.5);
    }
    g.audio.thunderCrack?.(null, { dur: 1, gain: 0.55, big: true });
    this.shake = Math.max(this.shake, 0.6);
  }

  voiceOut() {
    const g = this.g;
    this.outT = this.t;
    this.textEl.classList.remove('is-on');
    g.audio.whoosh?.(this.voz.root.position);
    this.look = 'sky';
  }

  // Al irse, la Voz larga un rayo colorado sobre el cerro: la explosión
  // levanta a los gauchos y los tira por el barranco al río (updateFall).
  blast() {
    const g = this.g;
    const E = this.voz.root.position;
    const A = this.A;
    const n = this.gauchos.length;
    const c = new THREE.Vector3();
    for (const r of this.gauchos) c.add(r.pos);
    c.divideScalar(n || 1);
    // (del lado de atrás: la explosión los empuja hacia el río)
    const dir = tmpU.set(LAND[0] - c.x, 0, LAND[1] - c.z).normalize();
    const hit = new THREE.Vector3(c.x - dir.x * 1.6, A.y + 0.1, c.z - dir.z * 1.6);
    g.fx.lightning(E, hit, 0xff3a2a, 0.9);
    g.fx.lightning(tmpV.copy(E).add(tmpW.set(1.5, 0, -1)), hit, 0xff8a6a, 0.7);
    this.later(0.12, () => g.fx.lightning(E, hit, 0xffffff, 0.5));
    g.fx.explosion(tmpV.copy(hit).setY(hit.y + 0.6), 3.4, [1, 0.35, 0.2]);
    g.fx.electric(hit, 40);
    g.fx.flash(hit, 0xff5a3a, 160, 0.9, 30);
    g.fx.dust(hit, { x: 0, y: 1, z: 0 }, [0.4, 0.33, 0.25], 30);
    g.post.flash(0.7);
    if (g.weather) g.weather.flash = 1;
    g.audio.thunder?.(hit, true);
    g.audio.explosion(hit, 1.6);
    g.audio.bossSlam?.(hit);
    this.shake = 1.8;
    const level = g.water ? g.water.level : -0.55;
    this.fall = {
      t0: this.t,
      list: this.gauchos.map((r, i) => {
        const s = i - (n - 1) / 2;
        r.crouch = false;
        return { r, i, s, from: r.pos.clone(), to: new THREE.Vector3(LAND[0] + s * 1.3, level, LAND[1] + s * 0.5), T: FLY + Math.random() * 0.2, delay: i * 0.06, phase: 'fly', spinA: 0 };
      }),
    };
    for (const f of this.fall.list) f.r.poseFn = (P) => this.tumble(f, P);
    this.later(0.4, () => this.shotFlight());
  }

  // Cuánto tiene que subir el arco del vuelo para pasar por arriba del cerro
  // y del borde del barranco (con 0,6 m de aire), sin tocar el piso nunca.
  flyArc(f) {
    const W = this.g.world;
    let need = FLY_H;
    for (let i = 1; i <= 40; i++) {
      const u = (i / 40) * 0.92;
      const x = f.from.x + (f.to.x - f.from.x) * u;
      const z = f.from.z + (f.to.z - f.from.z) * u;
      const fy = W.floorAt(x, z);
      if (!Number.isFinite(fy)) continue;
      const base = f.from.y + (f.to.y - f.from.y) * u;
      need = Math.max(need, (fy + 0.6 - base) / (4 * u * (1 - u)));
    }
    return need;
  }

  // Volando: una vuelta carnero (alrededor de la cadera) que termina parado,
  // así caen de pie al agua; braceando con los brazos abiertos y pataleando.
  // (arm/leg de zombieGaits: `out` positivo es hacia afuera; antes iban
  // hacia adentro y los brazos se cruzaban a través de la cabeza)
  tumble(f, P) {
    const t = this.t;
    const a = f.spinA;
    P.rootPitch = a;
    P.rootRoll = Math.sin(t * 3 + f.i) * 0.15;
    P.rootFwd = -0.93 * Math.sin(a);
    P.rootY = f.r.pos.y + 0.93 - 0.93 * Math.cos(a);
    P.hipY = 0.93;
    P.torsoP = 0.1;
    P.torsoR = 0;
    P.headP = -0.2;
    const w = t * 7 + f.i * 1.3;
    arm(P, 0, -1.9 + Math.sin(w) * 0.8, 0.9 + Math.sin(w * 0.7) * 0.25, -0.35 - Math.max(0, Math.sin(w)) * 0.5);
    arm(P, 1, -1.9 + Math.sin(w + 2.2) * 0.8, 0.9 + Math.cos(w * 0.8) * 0.25, -0.35 - Math.max(0, Math.sin(w + 2.2)) * 0.5);
    leg(P, 0, -0.45 + Math.sin(w * 1.2) * 0.45, 0.12, 0.5 + Math.max(0, Math.sin(w * 1.2 + 1)) * 0.6);
    leg(P, 1, -0.45 - Math.sin(w * 1.2) * 0.45, 0.12, 0.5 + Math.max(0, -Math.sin(w * 1.2 + 1)) * 0.6);
  }

  // En el agua: manotean para arriba y para afuera, de a uno (se agarran del
  // aire), tragan agua y sacan la cabeza.
  flail(f, P) {
    const w = this.t * 6.5 + f.i * 1.7;
    arm(P, 0, -2.3 + Math.sin(w) * 0.7, 0.55 + Math.sin(w * 0.5) * 0.15, -0.45 - Math.max(0, Math.sin(w)) * 0.6);
    arm(P, 1, -2.3 + Math.sin(w + 2.4) * 0.7, 0.55 + Math.cos(w * 0.5) * 0.15, -0.45 - Math.max(0, Math.sin(w + 2.4)) * 0.6);
    P.headP = -0.55;
  }

  // Acostados (arrastrándose al salir del agua o tirados en la playita): el
  // cuerpo va a lo largo de la pendiente y nunca abajo del piso. La playa sube
  // ~23° y tiene escalones: con el cuerpo derecho, las manos y la cabeza
  // (1,4 m adelante) se metían en la arena. Se mide el piso adelante y atrás
  // (los pies) y se inclina lo que sube (de a poco: en un escalón la pendiente
  // salta); después se arma la pose de prueba y se levanta lo justo para que
  // ninguna parte quede adentro (las piernas del que se arrastra van más bajas
  // que la cadera). float: no más abajo que eso (en lo bajito, la espalda a
  // flor de agua).
  lieFit(f, P, float = null) {
    const r = f.r;
    const fx = -Math.sin(r.yaw);
    const fz = -Math.cos(r.yaw);
    const h = (d) => this.ground(r.pos.x + fx * d, r.pos.z + fz * d) ?? r.pos.y;
    const hF = h(1.4);
    const hB = h(-0.7);
    const a = Math.atan2(hF - hB, 2.1);
    f.pa = f.pa == null ? a : f.pa + (a - f.pa) * Math.min(1, (this.dt || 0) * 4);
    const s = Math.tan(f.pa);
    const y0 = Math.max(h(0), hB + 0.7 * s, hF - 1.4 * s) + 0.03;
    P.rootPitch = 1.3 - f.pa;
    P.rootFwd = 0;
    P.rootY = y0;
    solvePose(LIE_MATS, r.pos.x, r.pos.z, r.yaw + Math.PI, 1, P);
    let need = 0;
    for (let k = 0; k <= 12; k++) {
      tmpU.setFromMatrixPosition(LIE_MATS[k]);
      const gy = this.ground(tmpU.x, tmpU.z);
      if (gy != null) need = Math.max(need, gy + 0.05 - tmpU.y);
    }
    // (sube enseguida; baja despacio, para que no salte con cada brazada)
    f.lift = need >= (f.lift || 0) ? need : f.lift + (need - f.lift) * Math.min(1, (this.dt || 0) * 3);
    P.rootY = Math.max(y0 + f.lift, float ?? -Infinity);
  }

  // El piso de verdad: en el agua, floorAt da la superficie; acá, la arena del fondo.
  // (el terreno como se ve, liso: el de fx/Water, el promedio de las esquinas
  // de las celdas. floorAt va por celda, a escalones de medio metro, y al salir
  // del agua los subía de a saltos: pedido del usuario 2026-10-01)
  ground(x, z) {
    const Wa = this.g.water;
    const gy = Wa?.groundFn?.(x, z);
    if (Number.isFinite(gy)) return gy;
    const d = Wa ? Wa.depthAt(x, z) : 0;
    if (d > 0) return Wa.level - d;
    const y = this.g.world.floorAt(x, z);
    return Number.isFinite(y) ? y : null;
  }

  // Del corte en negro: ya cerca de la orilla, nadando a lo que da.
  toShore() {
    const F = this.fall;
    if (!F) return;
    for (const f of F.list) {
      const r = f.r;
      f.phase = 'swim';
      f.ws = this.t + f.i * 0.25;
      r.cc = null;
      r.pos.set(SWIM[0] + f.s * 1.3, 0, SWIM[1] + f.s * 0.3 - (f.i % 2) * 0.7);
      f.end = new THREE.Vector3(SHORE[0] + f.s * 1.3, 0, SHORE[1] + f.s * 0.3);
      r.poseFn = null;
      // (nadan con el clip de nado de los compañeros, net/gauchoSkin: el de
      // antes era la pose vieja; pedido del usuario 2026-10-01)
      r.swim = 2;
      r.clips = true;
      r.downed = false;
      r.corpse = false;
      r.yaw = faceTo(r.pos, f.end.x, f.end.z);
    }
    this.g.audio.gasp?.();
  }

  // Los gauchos después del rayo: vuelan, caen al agua, luchan por no
  // hundirse, nadan a la orilla y salen arrastrándose.
  updateFall(dt) {
    const F = this.fall;
    if (!F) return;
    const g = this.g;
    const t = this.t;
    const Wa = g.water;
    const W = g.world;
    const surf = (x, z) => (Wa ? Wa.heightAt(x, z) : -0.55);
    for (const f of F.list) {
      const r = f.r;
      const p = r.pos;
      if (f.phase === 'fly') {
        const u = clamp01((t - F.t0 - f.delay) / f.T);
        p.lerpVectors(f.from, f.to, u);
        // (el barranco: el arco ya sale alto para pasar por arriba del borde;
        // antes iban pegados al piso del cerro y al pasar el borde caían 4 m de golpe)
        if (f.arcH == null) f.arcH = this.flyArc(f);
        p.y = f.from.y + (f.to.y - f.from.y) * u + 4 * f.arcH * u * (1 - u);
        f.vy = ((f.to.y - f.from.y) + 4 * f.arcH * (1 - 2 * u)) / f.T;
        f.spinA = TAU * smooth(u);
        // (con los clips de Blender el giro lo pone 'blown'; cambiar r.yaw acá
        // los giraba de golpe antes de salir despedidos)
        if (!this.PC) r.yaw = faceTo(p, f.to.x, f.to.z);
        // despedido de espaldas: mira al cerro de donde vino el rayo
        if (u > 0 && !f.ccFly) {
          f.ccFly = true;
          this.act(r, 'blown', { rate: 1.8 / f.T, yaw: Math.atan2(f.from.x - f.to.x, f.from.z - f.to.z), fade: 0.22 });
        }
        if (u >= 1) {
          f.phase = 'water';
          f.wt = t;
          r.swim = 2;
          this.act(r, 'tread', { loop: true, fade: 0.5, t: f.i * 0.6, look: 0.35 });
          r.poseFn = (P) => this.flail(f, P);
          Wa?.splash(p.x, p.z, 2.4);
          this.shake = Math.max(this.shake, 0.3);
        }
      } else if (f.phase === 'water') {
        const k = t - f.wt;
        // se hunden del golpe y salen (con la velocidad con que cayeron: antes
        // bajaban 3 m de golpe); después cada tanto se los traga una ola
        const dip = Math.max(0, Math.sin(k * 2.3 + f.i * 1.7)) ** 6 * 0.8 * clamp01(k - 1);
        tmpV.set(SHORE[0] - p.x, 0, SHORE[1] - p.z);
        const d = tmpV.length();
        if (d > 0.1) p.addScaledVector(tmpV.divideScalar(d), dt * 0.3);
        // (lo que traían de la caída se frena en el agua, no de golpe)
        f.hv ??= new THREE.Vector3(f.to.x - f.from.x, 0, f.to.z - f.from.z).divideScalar(f.T);
        p.addScaledVector(f.hv, dt);
        f.hv.multiplyScalar(Math.exp(-dt * 4));
        const rest = surf(p.x, p.z) - 1.32 - dip + Math.sin(k * 3 + f.i) * 0.07;
        f.wy ??= p.y;
        f.wv ??= Math.max(-9, f.vy ?? -6);
        const h = Math.min(dt, 1 / 30);
        f.wv += (-26 * (f.wy - rest) - 7 * f.wv) * h;
        f.wy += f.wv * h;
        p.y = f.wy;
        r.yaw = faceTo(p, SHORE[0], SHORE[1]);
        if (k > 0.7 && !f.gasped) {
          f.gasped = true;
          if (f.i === 0) g.audio.gasp?.();
        }
        if (Math.random() < dt * 3) Wa?.splash(p.x + rnd() * 0.6, p.z + rnd() * 0.6, 0.35, { sound: Math.random() < 0.25 });
      } else if (f.phase === 'swim') {
        if (t < f.ws) {
          // (a la altura de cuando nadan: al arrancar subían 12 cm de golpe)
          p.y = surf(p.x, p.z) - 1.2 + Math.sin(t * 5 + f.i) * 0.05;
          continue;
        }
        tmpV.set(f.end.x - p.x, 0, f.end.z - p.z);
        const d = tmpV.length();
        // (brazadas cansadas: a los tirones)
        const v = 1.1 * (0.55 + 0.45 * Math.max(0, Math.sin(t * 5 + f.i)));
        if (d > 0.05) p.addScaledVector(tmpV.divideScalar(d), Math.min(d, dt * v));
        p.y = surf(p.x, p.z) - 1.2 + Math.sin(t * 5 + f.i) * 0.05;
        r.yaw = faceTo(p, f.end.x, f.end.z);
        if (Math.random() < dt * 2.5) Wa?.splash(p.x + rnd() * 0.5, p.z + rnd() * 0.5, 0.25, { sound: Math.random() < 0.3 });
        // hace pie: sale arrastrándose (antes de que las brazadas y las
        // patadas toquen el fondo: mirando también adelante, que es más bajito)
        const deep = (x, z) => (Wa ? Wa.depthAt(x, z) : 0);
        if (deep(p.x, p.z) < 0.9 || deep(p.x - Math.sin(r.yaw), p.z - Math.cos(r.yaw)) < 0.6) {
          f.phase = 'crawl';
          // gatea (el clip de los compañeros, al paso de lo que avanza)
          this.act(r, 'crawl', { loop: true, fade: 0.7, rate: 1.3, slope: f, t: f.i * 0.4 });
          r.swim = 0;
          r.clips = false;
          r.downed = true;
          r.poseFn = (P) => this.lieFit(f, P, deep(r.pos.x, r.pos.z) > 0 ? surf(r.pos.x, r.pos.z) - 0.3 : null);
        }
      } else if (f.phase === 'crawl') {
        tmpV.set(f.end.x - p.x, 0, f.end.z - p.z);
        const d = tmpV.length();
        if (d > 0.05) p.addScaledVector(tmpV.divideScalar(d), Math.min(d, dt * 0.65));
        p.y = this.ground(p.x, p.z) ?? p.y;
        if (Math.random() < dt * 2 && (Wa ? Wa.depthAt(p.x, p.z) : 0) > 0.05) Wa?.splash(p.x + rnd() * 0.5, p.z + rnd() * 0.5, 0.2, { sound: Math.random() < 0.3 });
        if (d <= 0.06) {
          // y ahí quedan, tirados, respirando fuerte
          f.phase = 'rest';
          r.corpse = true;
          // el Viejo queda en cuatro patas tosiendo, el Canchero se sienta (con
          // los anteojos puestos), los otros se desploman
          if (r.persona === 'viejo') this.act(r, 'allFours', { loop: true, fade: 0.5, slope: f });
          else if (r.persona === 'canchero') this.act(r, 'sitRest', { loop: true, fade: 0.9, slope: f });
          else {
            this.act(r, 'collapse', { fade: 0.25, slope: f });
            this.later(1.5, () => this.act(r, 'rest', { loop: true, fade: 0.3, slope: f, t: f.i * 0.5 }));
          }
          r.poseFn = (P) => {
            P.torsoP += Math.sin(this.t * 2.6 + f.i) * 0.05;
            this.lieFit(f, P);
          };
        }
      }
    }
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
  shotYerba(d = 2.3) {
    const A = this.A;
    // (la segunda mitad del paneo de antes: termina en el mismo cuadro)
    // (más atrás y mirando entre el altar y el Gil: el vencido de rodillas entra
    // entero, del sombrero a las rodillas; a 2,3 m le cortaba la cabeza)
    const G = this.G;
    this.shot(d, (u) => {
      const a = -0.45 + (0.5 + smooth(u) * 0.5) * 1.35;
      tmpV.set(A.x + Math.sin(a) * 3.5, A.y + 1.65 - u * 0.15, A.z + Math.cos(a) * 3.5);
      tmpW.set(A.x + (G.x - A.x) * 0.43, A.y + 1.45, A.z + (G.z - A.z) * 0.43);
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

  // ¿El Gil va con los clips de Blender? (entities/skins/gil.js los carga)
  gilClips() {
    return globalThis.__mduBlend !== false && !!window.__bossSkins?.gil?.cineGil;
  }

  // El rayo, de cerca: un poco de costado y desde abajo, entero en el cuadro (es
  // un gigante de rodillas), acercándose despacio; al final baja con él.
  shotStrike(dur) {
    const G = this.G;
    const d = tmpU.set(this.C.x - G.x, 0, this.C.z - G.z).normalize().clone();
    const side = new THREE.Vector3(d.z, 0, -d.x);
    this.shot(dur, (u) => {
      const e = smooth(u);
      const k = 5.2 - 0.9 * e;
      tmpV.set(G.x + d.x * k + side.x * 1.6, G.y + 1.5 - 0.3 * e, G.z + d.z * k + side.z * 1.6);
      tmpW.set(G.x, G.y + 1.75 - 0.7 * smooth(clamp01((u - 0.45) / 0.55)), G.z);
    }, 50);
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

  // De frente a los gauchos, a la altura del pecho: cómo reaccionan (el rayo,
  // la luz de la Voz). up: mirando un poco desde abajo, con el cielo atrás.
  shotFaces(dur, up = false) {
    const C = this.C;
    const n = this.gauchos.length;
    const c = new THREE.Vector3();
    for (const r of this.gauchos) c.add(r.pos);
    c.divideScalar(n || 1);
    // (del lado de adonde miran: el altar y el Gil)
    const d = tmpU.set(this.A.x - c.x, 0, this.A.z - c.z).normalize().clone();
    const side = new THREE.Vector3(d.z, 0, -d.x);
    this.shot(dur, (u) => {
      const k = (up ? 3.1 : 3.7) - 0.35 * u;
      tmpV.set(c.x + d.x * k + side.x * (0.5 - 0.3 * u), c.y + (up ? 0.85 : 1.3), c.z + d.z * k + side.z * (0.5 - 0.3 * u));
      tmpW.set(c.x, c.y + (up ? 1.55 : 1.25), c.z);
    }, 42);
  }

  // De cerca, la cara del Canchero (se pone los anteojos de sol).
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

  // Desde atrás de los gauchos, mirando para arriba: la Voz baja.
  shotVoice() {
    const A = this.A;
    this.shot(8, () => {
      tmpV.set(A.x + 1.5, A.y + 1.2, A.z + 6.4);
      tmpW.lerpVectors(tmpU.set(A.x, A.y + 1.4, A.z), this.voz.root.position, 0.8);
    });
  }

  // El robo, de cerca y desde abajo (del lado de los gauchos): el mate se
  // resiste en la piedra y la luz violeta baja de arriba del cuadro.
  shotGrab() {
    const A = this.A;
    this.shot(GRAB + 0.4, (u) => {
      const e = smooth(u);
      const m = this.mate.position;
      tmpV.set(A.x + 1.25 - e * 0.25, A.y + 0.8 + e * 0.1, A.z + 2.1 - e * 0.4);
      tmpW.set(m.x, m.y + 0.3 + e * 0.5, m.z);
    }, 44);
  }

  // Atrás de los gauchos (que miran para arriba), de lejos: en el mismo
  // cuadro el mate abajo, la luz y el ojo arriba; los colores suben por la luz.
  shotDrain() {
    const A = this.A;
    const E = this.voz.root.position;
    // (a ~11 m del ojo: más cerca, los anillos y el halo llenan el cuadro)
    this.shot(9, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 3.5 - e * 0.5, A.y + 2.6, A.z + 8 - e * 0.6);
      tmpW.lerpVectors(this.mate.position, E, 0.34);
    }, 64);
  }

  // El tirón: la cámara se queda abajo y lo sigue mientras sube hasta el ojo.
  shotYank() {
    const A = this.A;
    this.shot(1.8, () => {
      tmpV.set(A.x + 1.9, A.y + 1, A.z + 3);
      tmpW.copy(this.mate.visible ? this.mate.position : this.voz.root.position);
    }, 55);
  }

  shotEye() {
    const A = this.A;
    this.shot(14, (u) => {
      const e = smooth(u);
      tmpV.set(A.x + 3 - e * 0.8, A.y + 5.6 + e * 0.6, A.z + 10 - e * 2);
      tmpW.copy(this.voz.root.position);
    }, 40);
  }

  // Desde atrás de los gauchos, mirando al barranco y al río: el rayo.
  shotBlast() {
    const A = this.A;
    this.shot(3, (u) => {
      const e = smooth(u);
      tmpV.set(A.x - 5 - e * 0.5, A.y + 3.4 + e * 0.6, A.z + 10.5 + e * 0.5);
      tmpW.set(A.x + 5, A.y + 3 - e * 2, A.z + 1);
    }, 58);
  }

  // Dónde están los gauchos (el medio de todos, a la altura del pecho).
  fallCenter(out) {
    out.set(0, 0, 0);
    const list = this.fall?.list || [];
    for (const f of list) out.add(f.r.pos);
    out.divideScalar(list.length || 1);
    out.y += 0.9;
    return out;
  }

  // Volando por el barranco hasta el agua, desde la costa.
  shotFlight() {
    this.shot(FLY + 0.6, (u) => {
      this.fallCenter(tmpW);
      tmpV.set(95 - u, 6 - u * 3, 27.5 - u * 1.5);
    }, 55);
  }

  // A ras del agua, meciéndose con las olas: tragan agua y manotean.
  shotStruggle() {
    const lv = this.g.water ? this.g.water.level : -0.55;
    this.shot(2.8, (u) => {
      this.fallCenter(tmpW);
      tmpW.y = lv + 0.3;
      tmpV.set(102 - u * 0.4, lv + 0.5 + Math.sin(this.t * 1.7) * 0.08, 19.8 - u * 0.3);
    }, 50);
  }

  // De costado, en la playita: vienen nadando y salen arrastrándose.
  shotShore() {
    const fy = this.g.world.floorAt(92.2, 21.2);
    const y0 = Number.isFinite(fy) ? fy : 0;
    // (sigue a los que vienen: más arriba que los juncos)
    this.shot(7.4, (u) => {
      const e = smooth(u);
      tmpV.set(92.2 + e * 0.3, y0 + 1.6 - e * 0.5, 21.2 + e * 0.5);
      this.fallCenter(tmpW);
      tmpW.y = Math.max(-0.3, tmpW.y - 0.6);
    }, 50);
  }

  // De arriba: sube desde la playita hasta ver el penal entero, con menos
  // niebla, y amanece (el día del mundo: world.dayCur).
  shotAerial() {
    this.shot(8.2, (u) => {
      const e = smooth(u);
      tmpV.set(96 + e * 16, 5 + e * 62, 27 + e * 70);
      tmpW.set(SHORE[0], -0.3, SHORE[1]).lerp(MID, smooth(clamp01(u * 1.3)));
      this.fogMul = 1 - e * 0.8;
      this.dawnK = e * 0.45;
    }, 55);
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
    // línea, la compu que se traba no se atrasa de los demás ni de la música.
    // Solo, un salto de más de 3 s es una pausa; en línea no hay pausa y una
    // trabada de hasta 30 s cuenta. Llamadas seguidas, sin cuadro en el medio:
    // una prueba que la adelanta.
    const now = performance.now();
    const w = (now - (this.wallAt || 0)) / 1000;
    this.wallAt = now;
    this.t += w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    this.dt = dt;
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
      // (en línea, una trabada no corre el resto del guion: cada compu se traba
      // distinto y el anfitrión terminaba 5-7 s después; se pone al día)
      this.next = (g.net && globalThis.__mduNoCineSync !== true ? start : Math.max(start, t)) + dur;
    }
    if (!this.script) return;
    this.updateSouls(dt);
    this.updateAnimas(dt);
    this.updateGauchos();
    this.updateGil(dt);
    this.updateYerba(dt);
    this.updateAsh();
    this.updateFall(dt);
    this.updateVoz(dt);
    // los efectos del Mate Supremo (su reloj corre en Weapons, que ahora no anda)
    this.SF?.update(dt, g.time);
    // las almas del cerro (world/Cerro.js) siguen subiendo hasta irse: el
    // cerro ya no se actualiza y quedaban congeladas en el aire toda la escena
    g.arena?.updateSouls?.(dt);
    for (const p of g.arena?.braziers || []) if (Math.random() < 0.25) g.fx.fire(p, 0.08, 1);
    this.people.update(dt);
    this.poseGauchos(dt);
    this.updateShades();
    // la cámara de la toma, con el temblor encima (nunca abajo del pasto)
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      C.fn(clamp01(lt / C.dur), lt);
      const fy = g.world.floorAt(tmpV.x, tmpV.z);
      if (Number.isFinite(fy)) tmpV.y = Math.max(tmpV.y, fy + 0.4);
      // (ni abajo del agua)
      const Wa = g.water;
      if (Wa && Wa.depthAt(tmpV.x, tmpV.z) > 0) tmpV.y = Math.max(tmpV.y, Wa.heightAt(tmpV.x, tmpV.z) + 0.25);
      this.shake = Math.max(0, this.shake - dt * 0.8);
      const s = this.shake * 0.08;
      cam.position.set(tmpV.x + (Math.random() - 0.5) * s, tmpV.y + (Math.random() - 0.5) * s, tmpV.z + (Math.random() - 0.5) * s);
      cam.lookAt(tmpW);
    }
    // el brillo del mate, del lado de la cámara (centrado en el mate, la
    // piedra le cortaba la mitad de abajo en línea recta)
    if (this.mate.visible) glowFront(this.mateGlow, this.mate, cam.position, this.glowSize);
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
    // (el amanecer de la toma de arriba)
    const W = g.world;
    if (this.dawnK != null && W.updateDay) {
      W.daylight = W.dayCur = this.dawnK;
      W.updateDay(0);
    }
    g.world.update(dt, g.time);
    g.weather?.update?.(dt);
    // (la toma de arriba: menos niebla, para que se vea el mapa entero)
    if (this.fogMul < 1 && g.scene.fog) g.scene.fog.density *= this.fogMul;
  }

  // Un gaucho pasa a un clip (los de Blender o los de siempre), mezclándose
  // con el anterior `fade` segundos. o: loop, rate, t (por dónde arranca),
  // yaw (fijo; si no, el de r), look (rad), slope (f de la caída: se inclina
  // con la pendiente de la playa).
  act(r, name, o = {}) {
    if (!this.PC) return;
    // (desde la pose que tiene ahora, sea cual sea: sin saltos al cambiar)
    const snap = cineSnap(this.people.list.get(r.id));
    r.cc = { name, t0: this.t - (o.t || 0) / (o.rate || 1), loop: !!o.loop, rate: o.rate || 1, yaw: o.yaw, look: o.look || 0, slope: o.slope || null, fade: o.fade ?? 0.25, at: this.t, snap };
  }

  // Los anteojos de sol del Canchero (los saca del poncho y se los pone): en la
  // mano hasta que llegan a la cara, después colgados de la cabeza.
  buildShades() {
    const root = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.7, roughness: 0.12 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.3 });
    const E = FACE_EYES;
    for (const sx of [-1, 1]) {
      // (grandes, de aviador: que se lean desde lejos)
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

  updateShades() {
    const r = this.shadesR;
    if (!r || this.shadesOn) return;
    const a = this.people.list.get(r.id);
    if (!a?.gs?.on) return;
    const lt = this.t - this.shadesT;
    // (sale del bolsillo a los 0,55 s; a los 1,15 s ya está en la cara)
    if (lt < 0.55) return;
    if (lt < 1.15) {
      // en la mano, ya derechos como van en la cara (de cerca no se nota el cambio)
      const B = a.gs.bones;
      const head = B.Head;
      const hand = B.RightHand.getWorldPosition(tmpV);
      const sk = a.gs.mesh.skeleton;
      const hi = sk.bones.indexOf(head);
      tmpMat.copy(head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(a.gs.mesh.bindMatrix);
      this.shadesHand.matrixAutoUpdate = false;
      this.shadesHand.matrix.copy(tmpMat);
      // corre el centro de los lentes a la mano
      tmpW.set(FACE_EYES.x, FACE_EYES.y, 16.4).applyMatrix4(tmpMat);
      this.shadesHand.matrix.premultiply(tmpMat2.makeTranslation(hand.x - tmpW.x, hand.y - tmpW.y, hand.z - tmpW.z));
      this.shadesHand.matrixWorldNeedsUpdate = true;
      this.shadesHand.visible = true;
      return;
    }
    this.shadesHand.visible = false;
    this.shadesHand.remove(this.shades);
    headProp(a, this.shades);
    this.shadesOn = true;
  }

  clipOf(name) {
    return this.PC?.[name] || gauchoClip(name);
  }

  poseGauchos(dt) {
    if (!this.PC) return;
    const t = this.t;
    for (const r of this.gauchos) {
      const S = r.cc;
      const a = this.people.list.get(r.id);
      // el mate: con las manos ocupadas (el rayo, la luz, el vuelo, el agua, la
      // playa) no está; si no, quedaba donde lo dejaba la pose de antes,
      // volando, o daba vueltas con la brazada del nado (el usuario 2026-10-03)
      if (a && (S || this.fall)) {
        if (a.gun) a.gun.visible = false;
        a.hand.visible = false;
      }
      if (!S) continue;
      const c = this.clipOf(S.name);
      if (!a || !c) continue;
      const lt = (t - S.t0) * S.rate;
      const o = { loop: S.loop, look: S.look };
      if (S.snap && t - S.at < S.fade) {
        o.snap = S.snap;
        o.sw = smooth(clamp01((t - S.at) / S.fade));
      }
      // en la playa: el cuerpo a lo largo de la pendiente (lo que mide lieFit)
      if (S.slope) {
        const fx = -Math.sin(r.yaw);
        const fz = -Math.cos(r.yaw);
        const h = (d) => this.ground(r.pos.x + fx * d, r.pos.z + fz * d) ?? r.pos.y;
        const want = Math.atan2(h(0.9) - h(-0.6), 1.5);
        S.pa = S.pa == null ? want : S.pa + (want - S.pa) * Math.min(1, (dt || 0) * 4);
        o.tilt = -S.pa;
      }
      const yaw = S.yaw ?? (r.yaw || 0) + Math.PI;
      poseCineClip(a, c, S.loop ? lt : Math.min(lt, c.dur), r.pos.x, r.pos.y, r.pos.z, yaw, o);
    }
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
    // (después del rayo los maneja updateFall)
    if (this.fall) return;
    const look = this.look;
    const at = look === 'gil' && !this.gilGone ? this.G : look === 'animas' ? tmpU.set(this.A.x + 2.8, 0, this.A.z + 1.2) : this.A;
    // (cada uno a su tiempo y a su ritmo: ui/cineCrew PERSONA_T; antes se
    // daban vuelta todos juntos, "una mente colmena")
    const key = `${at.x.toFixed(1)},${at.z.toFixed(1)}`;
    if (key !== this.lookKey) {
      this.lookKey = key;
      this.lookT = this.t;
    }
    for (const r of this.gauchos) {
      const P = PERSONA_T[r.persona] || PERSONA_T.valiente;
      if (!r.at || this.t - this.lookT >= P.delay) r.at = (r.at || new THREE.Vector3()).copy(at);
      const k = Math.min(1, (this.dt || 0) * P.turn);
      // (de a poco: cuando se moría el Gil daban vuelta de golpe hacia el altar)
      let d = faceTo(r.pos, r.at.x, r.at.z) - r.yaw;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      r.yaw += r.yawSet ? d * k : d;
      r.yawSet = true;
      const want = look === 'sky' ? 0.9 : look === 'mate' ? 0.45 : look === 'animas' && this.animaT != null ? 0.6 : 0;
      r.pitch += (want - r.pitch) * 0.05;
    }
  }

  // El Gil con los clips de Blender (entities/skins/gil.js pick lo pregunta
  // cada cuadro): vencido, levanta la cabeza y habla, ruega, señala el cielo,
  // el rayo y se desarma. Cada paso desde la pose que tenía (las capas de
  // entities/bossSkin.js se funden). null: las poses de piezas de antes.
  gilWant(S) {
    if (globalThis.__mduBlend === false || this.gilGone) return null;
    const C = S.clips;
    if (!C.gDown) return null;
    const t = this.t;
    const at = (k, lt, loop = false) => ({ key: k, t: loop ? lt % C[k].dur : Math.max(0, Math.min(lt, C[k].dur - 1e-3)) });
    const hit = this.gilHit != null ? t - this.gilHit : -1;
    if (hit >= 0) return hit < 0.9 ? at('gStruck', hit) : at('gCrumble', hit - 0.9);
    if (this.pointT != null && t >= this.pointT) return at('gPoint', t - this.pointT);
    if (this.urgent != null && t >= this.urgent) return at('gUrge', t - this.urgent);
    if (this.gilPose === 'talk') {
      this.talkT ??= t;
      const lt = t - this.talkT;
      return lt < C.gRaise.dur ? at('gRaise', lt) : at('gTalk', lt - C.gRaise.dur, true);
    }
    return at('gDown', t + (this.downAt || 0), true);
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
      if (this.gilPose === 'talk') {
        // habla: gesticula con la izquierda al ritmo de la frase, cabecea y
        // mira a uno y a otro; en "¡No le den el mate!" se inclina, estira la
        // mano y se quiere levantar (antes quedaba quieto toda la frase)
        this.talkT ??= t;
        const lt = t - this.talkT;
        const urg = this.urgent != null ? smooth(clamp01((t - this.urgent) / 0.6)) : 0;
        // (pocos gestos, lentos: la mano abierta que acompaña la frase, sin aletear)
        const beat = 0.5 - 0.5 * Math.cos(Math.min(1, lt / 1.2) * Math.PI) * (0.6 + 0.4 * Math.cos(lt * 1.6));
        P.shLp += -0.12 * beat - 0.25 * urg;
        P.elL += 0.15 * beat + 0.3 * urg;
        P.torsoP += 0.04 * beat + 0.16 * urg;
        P.headP += 0.03 * Math.sin(lt * 2.4) + 0.08 * urg;
        P.headY = 0.22 * Math.sin(lt * 0.45) * (1 - urg);
        P.torsoY = 0.08 * Math.sin(lt * 0.45) * (1 - urg);
        P.hipY += 0.06 * urg;
        P.shRp -= 0.12 * urg;
      }
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
      // (con los clips de Blender el cuerpo de verdad va por la altura del jefe)
      if (globalThis.__mduBlend !== false && window.__bossSkins?.gil?.cineGil) z.baseY = this.G.y + P.rootY;
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
  updateYerba(dt) {
    const t = this.t;
    // (con el Juicio se enciende y se va apagando)
    this.yerbaBoost = Math.max(0, this.yerbaBoost - dt * 1.2);
    this.yerba.traverse((m) => {
      if (m.isMesh && m.material.emissive) m.material.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.25 + this.yerbaBoost;
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
      // (de un tirón: arranca despacio y llega de golpe)
      const u = clamp01((t - this.mateT) / this.mateDur);
      const s = u * u * u;
      const m = this.mate.position;
      m.lerpVectors(this.mateBase, tmpV.copy(E).setY(E.y - 1.4), s);
      this.mate.rotation.y += dt * (3 + u * 14);
      animateSupremoDisplay(this.sup, dt, g.time, { speed: 1 + u * 3, open: 0, lift: 0.4 });
      // la estela violeta
      for (let i = 0; i < 3; i++) g.fx.add.spawn(m.x + rnd() * 0.2, m.y - Math.random() * 0.4, m.z + rnd() * 0.2, rnd() * 0.4, -1 - Math.random() * 2, rnd() * 0.4, { color: [0.6, 0.42, 1], size: 0.18, size1: 0, life: 0.5 });
      this.warmLight.color.copy(VIOLET);
      this.warmLight.intensity = 3;
      this.warmLight.position.copy(m).setY(m.y + 0.3);
    } else if (this.mate.visible) {
      // (mientras se lo roban: updateSteal)
      if (this.steal) this.updateSteal(dt);
      else {
        this.mate.rotation.y += dt * 0.6;
        animateSupremoDisplay(this.sup, dt, g.time);
        this.mateGlow.material.opacity = 0.55 + Math.sin(t * 3) * 0.15;
      }
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
    // los efectos del Supremo que quedaban (si se salteó a la mitad)
    this.SF?.clear();
    // (rayos, chispas y haces: sin esto quedan congelados atrás del menú si se saltea)
    g.fx.clearAll();
    g.fx.update(0, g.camera);
    this.root?.removeFromParent();
    this.root = null;
    if (this.dawnK != null && g.world?.updateDay) {
      g.world.daylight = g.world.dayCur = 0;
      g.world.updateDay(0);
    }
    if (this.voiceLight) this.voiceLight.intensity = 0;
    if (this.warmLight) this.warmLight.intensity = 0;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (g.ee?.npc) g.ee.npc.root.visible = true;
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
