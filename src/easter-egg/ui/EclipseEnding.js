import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import CineActors, { yawTo } from './cineActors';
import { cineClip, eyeSpots } from '../net/gauchoSkin';
import { gilVincha } from '../net/gilLook';
import { warmScene } from './cineWarm';
import { FEATURES } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';
import { toWorld, toLocal, hLoc } from '../world/eclipse/sanlorenzoCampo';
import { ECLIPSE_DIR } from '../world/eclipseSky';
import { sanMartin } from '../entities/skins/sanmartin';
import { Montura, addPerson } from '../entities/eclipse/montar';
import { Caballos } from '../entities/skins/caballo';
import { belgranoSkin, whenBelgrano } from '../entities/monumento/belgranoSkin';
import { makeRift } from './eclipseCineSable';
import { STAGE, at, makeDome, setSky, buildSets, buildPrimerMate, buildLantern, tickFlags } from './eclipseCineSets';
import { assetUrl } from '../../lib/assets';

// El final de Eclipse Matero: "Todo tiene una razón de ser" (guion en el
// scratchpad eclipse/CINEMATICAS.md §4). Lo arranca EclipseEgg.arenaWon() al
// ganar San Lorenzo (ee.scenes.ending, ui/eclipseScenes.js), en todas las
// compus a la vez; el reloj es el de ui/castleCine (en línea, el de verdad).
// Narra Martín Fierro (murmullos, SPEAKERS.fierro).
//  1. El campo de San Lorenzo al alba, con humo: el Gil con el Primer Mate en
//     las manos; San Martín a caballo lo mira, Belgrano a pie, los tres atrás.
//  2. El mate brilla y muestra lo que podría ser (el Gil viejo, en paz, con
//     los suyos: en sepia); el Gil cierra los ojos y lo apaga.
//  3. Se lo da a San Martín, que no lo toma: mira a Belgrano. Belgrano lo
//     toma y se lo da a los compañeros (Cirilo lo recibe).
//  4. Se despide: Benito llora, Cirilo cabecea con el mate, Anacleto le da la mano.
//  5. Un desgarro al estero de 1877; el Gil entra solo, de espaldas.
//  6. El estero de noche: camina hasta el algarrobo. No se ve la muerte: la
//     cinta colorada atada al facón; el sol entre las ramas.
//  7. El santuario del Gauchito: banderas, velas, botellas, gente de espaldas.
//  8. El universo se cose: las islas, las grietas que se cierran, el sol que
//     sale de atrás de la luna y se vuelve sol de verdad.
//  9. El fogón del camino, de noche: los cuatro de siempre toman mate (el Viejo
//     ceba, el Canchero cuenta, el Miedoso se ríe, el Valiente levanta el mate
//     hacia el santuario); se acuerdan: un destello de cada uno con su luz.
// 10. Fierro llega caminando desde lo oscuro y se vuelve el hombre de la
//     linterna; la revelación; apaga la linterna. Negro. La placa.
// Después: el logro y el fin de la partida (Game.win, sin otra cinemática).
// Todo se arma al empezar (escondido) y se compila (ui/cineWarm); luces: las
// del mundo con otros valores y dos fogonazos prestados de fx (el fuego y la
// linterna). globalThis.__mduNoEclipseFin: sin escena (el mapa se da por hecho).

const FILES = ['cine-eclipse-fin.json', 'cine-eclipse.json', 'cine-introA.json', 'cine-torre2.json'];
let CLIPS = null;
let LOAD = null;
export function loadFinClips() {
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
    return C;
  });
  return LOAD;
}

// el Gil y sus tres compañeros (entities/EclipseEgg CAST): el Valiente es el Gil
const CAST = { valiente: 0xb01c14, miedoso: 0x7a5a2a, canchero: 0x2a3a7a, viejo: 0x3a6a2a };
// los cuatro de siempre cuando fueron caballeros (entities/castle/common)
const ELEM = { valiente: 0xff6a1a, miedoso: 0x8affb8, canchero: 0xffe45a, viejo: 0x9adcff };
const L = {
  todo: 'Hay hombres que tienen todo en la mano.',
  sueltan: 'Y lo sueltan.',
  todos: 'Lo que es de todos no lo guarda uno.',
  volvio: 'Volvió a donde lo esperaban. Sabía a qué.',
  gente: 'A los que dan la vida por otros, la gente no los deja morir.',
  cose: 'Y lo roto se cose, si alguien pone el cuerpo.',
  caballeros: 'Fueron caballeros. Ahora toman mate. Es lo mismo.',
  razon: 'Todo en esta vida tiene una razón de ser.',
  rev1: 'El primer mate se lo dejó sobre el pecho el hombre de la linterna. Eso dicen.',
  rev2: 'Lo que no dicen es que ese hombre cambia. Que alguien tiene que cargar a los dormidos hasta el primer mate, siempre.',
  rev3: 'Y que a Francisco, antes de Francisco, lo llamaban de otra manera.',
  placa: 'Mientras alguien le cebe un mate a otro, la luz no se apaga.',
};
// cómo se ve cada decorado: la luz del mundo (la del eclipse, la hemisférica,
// la ambiente) y la niebla, con otros valores
const LOOKS = {
  estero: { sky: 'noche', dir: [0.38, 0.42, -0.82], sun: 0xa8c0f0, sunI: 1.1, hs: 0x34506e, hg: 0x141820, hI: 0.75, amb: 0x2a3448, ambI: 0.4, fog: 0x0b121c, fogD: 0.012 },
  manana: { sky: 'manana', dir: [-0.31, 0.83, -0.45], sun: 0xffe8c8, sunI: 1.9, hs: 0x8aaad8, hg: 0x4a4030, hI: 0.95, amb: 0x606060, ambI: 0.35, fog: 0xc8d4e0, fogD: 0.004 },
  tarde: { sky: 'tarde', dir: [0.55, 0.22, -0.8], sun: 0xffb070, sunI: 1.6, hs: 0x8a7a9a, hg: 0x4a3020, hI: 0.7, amb: 0x504040, ambI: 0.3, fog: 0xc08060, fogD: 0.006 },
  fogon: { sky: 'noche', dir: [-0.3, 0.5, 0.8], sun: 0x8090c0, sunI: 0.55, hs: 0x24304a, hg: 0x100c0a, hI: 0.55, amb: 0x1a2028, ambI: 0.3, fog: 0x05070c, fogD: 0.012 },
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export default class EclipseEnding extends CastleCine {
  constructor(ee) {
    super(ee.g, { drive: false, kind: 'eclipse' });
    this.ee = ee;
    loadFinClips();
  }

  // Habla Fierro: el texto se va solo un rato después de la voz.
  say(who, text) {
    const d = super.say(who, text);
    this.later(d + 1.6, () => {
      if (this.textEl.textContent === text) this.quiet();
    });
    return d;
  }

  // ---------------- dónde ----------------
  // El campo: el de San Lorenzo si está a la vista (la arena), si no el del decorado.
  F(u, v, h = 0, out = new THREE.Vector3()) {
    if (this.campo) toWorld(u, v, null, out);
    else at('campo', u, v, out);
    out.y += h;
    return out;
  }
  S(k, x, z, h = 0, out = new THREE.Vector3()) {
    at(k, x, z, out);
    out.y += h;
    return out;
  }
  floorAt(x, z) {
    if (Math.abs(x - STAGE.x) < 230 && Math.abs(z - STAGE.z) < 140) return STAGE.y;
    if (this.campo) {
      toLocal(x, z, tmpU);
      return hLoc(tmpU.u, tmpU.v);
    }
    return this.g.world.floorAt(x, z);
  }
  // un paso del guion: lo que pasa a tantos segundos de su hora programada (en
  // línea, una compu trabada no corre el resto)
  at(secs, fn) {
    this.timers.push({ t: (this.stepAt ?? this.t) + secs, fn });
  }
  cut(dur, p0, p1, l0, l1, fov = 50) {
    this.setFov(fov);
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(p0, p1, k);
      look.lerpVectors(l0, l1, k);
    });
  }

  // ---------------- el armado ----------------
  build() {
    const g = this.g;
    const ee = this.ee;
    const w = g.world;
    const ar = ee.arena;
    this.dt = 1 / 30;
    // el campo de San Lorenzo, si la arena está puesta
    this.campo = !!(ar?.built && ar.top?.parent);
    this.islands = ar?.islands || w.root;
    // lo de la partida, fuera de cuadro
    if (g.zombies?.root) g.zombies.root.visible = false;
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    if (ar?.actors) ar.actors.visible = false;
    g.music?.stop?.(3);
    // el fin de la partida (Game.win) sin otra cinemática después: como el estero
    this.hookWin();
    // los decorados y el cielo
    this.sets = buildSets(g);
    this.root.add(this.sets.root);
    this.dome = makeDome();
    this.root.add(this.dome);
    // (el que pone la luz y la niebla de cada decorado: se dibuja primero)
    // (en el onBeforeRender de la escena: three lo llama antes de armar las luces
    // del cuadro; el mundo y el clima las vuelven a poner en su update)
    const sc = g.scene;
    this.sceneBR = sc.onBeforeRender;
    sc.onBeforeRender = (...a) => {
      this.sceneBR?.apply(sc, a);
      if (!this.done) this.applyLook();
    };
    // la luz que se ve del eclipse en el cielo de Eclipse: se cierra al coserse
    if (w.sky && !w.sky.userData.finWrap) {
      const prev = w.sky.onBeforeRender;
      w.sky.userData.finWrap = prev;
      w.sky.onBeforeRender = (...a) => {
        prev?.(...a);
        const u = w.sky.material.uniforms;
        if (this.crackK != null) u.uCrack.value *= this.crackK;
        if (this.nightK != null) u.uNight.value = this.nightK;
      };
    }
    this.buildCast();
    this.mate = buildPrimerMate(g);
    this.root.add(this.mate);
    this.lamp = buildLantern(g);
    this.root.add(this.lamp.root);
    this.rift = makeRift('estero');
    this.root.add(this.rift.root);
    this.buildSmoke();
    // los fogonazos prestados (el fuego y la linterna)
    const fl = g.fx?.flashes || [];
    this.fireL = fl[fl.length - 1] || null;
    this.lampL = fl[fl.length - 2] || null;
    const m = w.moon;
    this.base0 = {
      moon: m ? { c: m.color.clone(), i: m.intensity, p: m.position.clone(), tp: m.target.position.clone() } : null,
      hemi: w.hemi ? { c: w.hemi.color.clone(), gc: w.hemi.groundColor.clone(), i: w.hemi.intensity } : null,
      amb: w.ambient ? { c: w.ambient.color.clone(), i: w.ambient.intensity } : null,
      fog: g.scene.fog ? { c: g.scene.fog.color.clone(), d: g.scene.fog.density } : null,
    };
    this.mode('negro');
    this.fade(true);
    warmScene(g);
    return this.script0();
  }

  hookWin() {
    const g = this.g;
    const win0 = g.win;
    this.unhook = () => {
      if (g.win === wrap) g.win = win0;
    };
    const wrap = (info) => {
      this.unhook();
      // (si llega el del anfitrión con la escena andando: termina acá, sin más)
      if (!this.done) {
        this.onDone = null;
        this.finish();
      }
      // (Game.win ya va derecho a la pantalla de victoria con FEATURES.egg
      // 'primermate': sin prender el estero a escondidas)
      return win0.call(g, info);
    };
    g.win = wrap;
  }

  buildCast() {
    const g = this.g;
    const patch = (C) => {
      const base = C.clipOf.bind(C);
      C.clipOf = (n) => CLIPS?.[n] || base(n);
      return C;
    };
    const fl = (x, z) => this.floorAt(x, z);
    // el Gil y los tres (los del crew, con los ponchos de Eclipse)
    const A = (this.A = patch(new CineActors(g, { base: 560, floor: fl, parent: this.root })));
    for (const r of A.list) {
      r.a.M.poncho.color.set(CAST[r.persona]).multiplyScalar(1.7);
      r.mate = false;
    }
    this.gil = A.by.valiente;
    this.benito = A.by.miedoso;
    this.cirilo = A.by.canchero;
    this.anacleto = A.by.viejo;
    // Belgrano (el del Monumento: el modelo de Meshy sobre las piezas)
    const br = { id: 466, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false };
    const ba = addPerson(A.people, br, (a) => belgranoSkin(a));
    br.poseFn = (P) => this.belPose(P);
    // (sólido, como en San Lorenzo: en el Monumento es un ánima que aparece;
    // y más oscuro: con el sol del eclipse la textura clara se quemaba)
    whenBelgrano(() => {
      const m = ba.M.belgrano;
      if (!m) return;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.color.setScalar(0.62);
      m.needsUpdate = true;
    });
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 });
    ba.M.coat = coat;
    ba.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === ba.M.hat || o.material === ba.M.band) o.visible = false;
      if (o.material === ba.M.poncho) o.material = coat;
    });
    for (const q of ba.parts || []) if (q.material === ba.M.poncho) q.material = coat;
    this.bel = { r: br, a: ba, arm: 0, cur: {} };
    // San Martín a caballo (entities/eclipse/montar)
    this.horses = new Caballos(g, { parent: this.root });
    this.horse = this.horses.add({ x: 0, y: 0, z: 0, yaw: 0, gait: 'parado' });
    const sa = sanMartin(A.people, { id: 470, pos: new THREE.Vector3(), yaw: 0, sable: 'corvo' });
    this.sm = { a: sa, r: sa.r, head: 0, look: 0 };
    this.mont = new Montura(sa, this.horse, { brazos: 'riendas' });
    const mp = sa.r.poseFn;
    sa.r.poseFn = (P) => {
      mp(P);
      P.headY = (P.headY || 0) + this.sm.head + this.sm.look;
    };
    // la gente del santuario, de espaldas
    const S = (this.Sx = patch(new CineActors(g, { base: 600, floor: fl, parent: this.root })));
    for (let k = 0; k < 4; k++) {
      const r = { id: 610 + k, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'gente' };
      S.people.add(r);
      r.a = S.people.list.get(r.id);
      r.mate = false;
      S.list.push(r);
    }
    for (const r of S.list) r.mate = false;
    // los cuatro de siempre en el fogón, Fierro (el ánima) y el hombre de la linterna
    const B = (this.B = patch(new CineActors(g, { base: 580, floor: fl, parent: this.root })));
    for (const r of B.list) r.mate = false;
    const add = (id, o = {}) => {
      const r = { id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'fierro', ...o };
      B.people.add(r);
      r.a = B.people.list.get(id);
      r.mate = false;
      B.list.push(r);
      return r;
    };
    this.fierro = add(905, { ghost: true, dead: true });
    this.fierro.a.M.poncho.color.set(0x5a7ab0).multiplyScalar(1.7);
    this.gold = add(906, { dead: true });
    const M = this.gold.a.M;
    M.poncho.color.set(0x9a6c1e);
    M.band.color.set(0xd8a830);
    M.hat.color.set(0x3a2e22);
    M.skin.color.set(0x2a2018);
    for (const C of [A, S, B]) C.show(false);
  }

  // el humo bajo del campo: manchas grises que se arrastran
  buildSmoke() {
    const g = this.g;
    const grp = new THREE.Group();
    this.smoke = [];
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot, color: 0x9a9088, transparent: true, depthWrite: false, opacity: 0.12 }));
      s.userData = { u: 17 + (k % 7) * 4.5, v: -14 + (k % 5) * 7 + Math.floor(k / 7) * 3, s: 7 + (k % 4) * 2, ph: k * 1.3 };
      grp.add(s);
      this.smoke.push(s);
    }
    this.root.add(grp);
    this.smokeG = grp;
  }

  // ---------------- los decorados ----------------
  // negro | campo | vision | estero | manana | santuario | islas | fogon
  mode(k) {
    const g = this.g;
    const w = g.world;
    const ar = this.ee.arena;
    this.modeK = k;
    const stage = ['vision', 'estero', 'manana', 'santuario', 'fogon'].includes(k) || (k === 'campo' && !this.campo);
    this.sets.root.visible = stage;
    this.dome.visible = stage || k === 'islas';
    this.domeK = k === 'islas' ? 0 : 1;
    if (w.sky) w.sky.visible = !stage;
    if (ar?.top) ar.top.visible = k === 'campo' && this.campo;
    const isl = this.islands;
    if (k === 'islas') {
      if (!isl.parent) g.scene.add(isl);
      isl.visible = true;
    } else if (isl) isl.visible = false;
    this.smokeG.visible = k === 'campo';
    const look = k === 'campo' && !this.campo ? 'alba' : k === 'vision' ? 'manana' : k === 'santuario' ? 'tarde' : k === 'estero' ? 'noche' : k === 'manana' ? 'manana' : k === 'fogon' ? 'noche' : 'alba';
    const L0 = LOOKS[k === 'vision' ? 'manana' : k === 'santuario' ? 'tarde' : k];
    const sd = V3(...(L0?.dir || [ECLIPSE_DIR.x, ECLIPSE_DIR.y, ECLIPSE_DIR.z])).normalize();
    setSky(this.dome, look, k === 'islas' ? ECLIPSE_DIR : sd, V3(0.38, 0.42, -0.82).normalize());
    this.A.show(k === 'campo' || k === 'vision' || k === 'estero');
    this.Sx.show(k === 'santuario');
    this.B.show(k === 'fogon');
    this.lookCfg = L0 || null;
    // (las islas y el campo: la luz de antes)
    if (!L0 && this.base0) this.restoreLook();
    // la sombra: sobre el decorado que se ve
    const m = w.moon;
    if (m && stage) {
      const c = k === 'vision' ? 'fogon' : k === 'manana' ? 'estero' : k === 'campo' ? 'campo' : k;
      at(c, 0, 0, tmpV);
      m.target.position.copy(tmpV);
      m.target.updateMatrixWorld();
      const sc = m.shadow.camera;
      sc.left = sc.bottom = -26;
      sc.right = sc.top = 26;
      sc.near = 1;
      sc.far = 260;
      sc.updateProjectionMatrix();
    }
    this.applyLook();
  }

  // La luz y la niebla del decorado que se ve (cada cuadro, antes de dibujar:
  // el mundo y el clima las vuelven a poner en su update).
  applyLook() {
    const g = this.g;
    const w = g.world;
    const L0 = this.lookCfg;
    if (!L0) {
      if (this.modeK === 'campo' && this.campo && this.base0?.moon && w.moon) {
        w.moon.intensity = this.base0.moon.i * 0.68;
        if (w.hemi && this.base0.hemi) w.hemi.intensity = this.base0.hemi.i * 0.8;
      }
      return;
    }
    const m = w.moon;
    if (m) {
      m.color.set(L0.sun);
      m.intensity = L0.sunI;
      tmpV.set(...L0.dir).normalize();
      m.position.copy(m.target.position).addScaledVector(tmpV, 120);
      if (m.shadow) m.shadow.needsUpdate = true;
    }
    if (w.hemi) {
      w.hemi.color.set(L0.hs);
      w.hemi.groundColor.set(L0.hg);
      w.hemi.intensity = L0.hI;
    }
    if (w.ambient) {
      w.ambient.color.set(L0.amb);
      w.ambient.intensity = L0.ambI;
    }
    const f = g.scene.fog;
    if (f) {
      f.color.set(L0.fog);
      if (f.density != null) f.density = L0.fogD;
    }
    g.renderer.shadowMap.needsUpdate = true;
  }

  restoreLook() {
    const g = this.g;
    const w = g.world;
    const B0 = this.base0;
    const m = w.moon;
    if (m && B0.moon) {
      m.color.copy(B0.moon.c);
      m.intensity = B0.moon.i;
      m.position.copy(B0.moon.p);
      m.target.position.copy(B0.moon.tp);
      m.target.updateMatrixWorld();
    }
    if (w.hemi && B0.hemi) {
      w.hemi.color.copy(B0.hemi.c);
      w.hemi.groundColor.copy(B0.hemi.gc);
      w.hemi.intensity = B0.hemi.i;
    }
    if (w.ambient && B0.amb) {
      w.ambient.color.copy(B0.amb.c);
      w.ambient.intensity = B0.amb.i;
    }
    if (g.scene.fog && B0.fog) {
      g.scene.fog.color.copy(B0.fog.c);
      g.scene.fog.density = B0.fog.d;
    }
  }

  // un tronco del fogón, en el mundo
  seatW(i) {
    const s = this.sets.seats[i];
    return new THREE.Vector3(STAGE.x + s.x, STAGE.y, STAGE.z + s.z);
  }

  // ---------------- los cuerpos ----------------
  // pone a uno en (pos) mirando a (to) con un clip
  put(C, r, pos, to, clip, o = {}) {
    r.pos.copy(pos);
    r.pos.y = this.floorAt(pos.x, pos.z);
    if (to) r.yaw = yawTo(r.pos, to);
    r.mv = null;
    r.turn = null;
    r.dead = false;
    C.act(r, clip, { loop: true, fade: 0.01, ...o });
  }

  belPose(P) {
    const b = this.bel;
    const t = this.t;
    const T = { headP: 0.05, torsoP: 0.03 * Math.sin(t * 1.6), torsoR: 0.035 * Math.sin(t * 0.55), headY: 0.07 * Math.sin(t * 0.37 + 1), shLp: -0.1, shLr: 0.12, elL: -0.34, elR: -0.26, shRp: -0.06, shRr: -0.1 };
    if (b.arm === 2) {
      T.shRp = -1.1;
      T.shRr = 0.15;
      T.elR = -0.55;
    }
    const k = Math.min(1, (this.dt || 0.016) * 4.5);
    for (const key of Object.keys(T)) {
      const c = b.cur[key] ?? T[key];
      b.cur[key] = c + (T[key] - c) * k;
      P[key] = b.cur[key];
    }
  }

  // el Primer Mate: entre las dos manos, en la palma, en la mano de Belgrano, o escondido
  placeMate() {
    const o = this.mateAt;
    const m = this.mate;
    m.visible = !!o && this.A.people.root.visible;
    if (!m.visible) return;
    if (o.kind === 'two') {
      const B = o.r.a?.gs?.bones;
      if (!B) return (m.visible = false);
      B.LeftHand.getWorldPosition(tmpV);
      B.RightHand.getWorldPosition(tmpW);
      tmpV.add(tmpW).multiplyScalar(0.5);
      // (un poco adelante de las muñecas, en el hueco de las palmas)
      tmpU.set(-Math.sin(o.r.yaw), 0, -Math.cos(o.r.yaw));
      tmpV.addScaledVector(tmpU, 0.06);
      tmpV.y += 0.02;
      m.position.copy(tmpV);
      m.quaternion.setFromAxisAngle(UP, o.r.yaw);
    } else if (o.kind === 'palm') {
      const B = o.r.a?.gs?.bones;
      if (!B) return (m.visible = false);
      B.RightHand.getWorldPosition(tmpV);
      B.RightForeArm.getWorldPosition(tmpW);
      tmpW.subVectors(tmpV, tmpW).normalize();
      tmpV.addScaledVector(tmpW, 0.07);
      tmpV.y += 0.03;
      m.position.copy(tmpV);
      m.quaternion.setFromAxisAngle(UP, o.r.yaw);
    } else if (o.kind === 'part') {
      tmpV.set(0, -0.2, 0).applyMatrix4(o.a.mats[6]);
      m.position.copy(tmpV).add(tmpW.set(0, 0.02, 0));
      m.quaternion.identity();
    }
  }

  // ---------------- el guion ----------------
  script0() {
    const g = this.g;
    const A = this.A;
    const gil = this.gil;
    const ben = this.benito;
    const cir = this.cirilo;
    const ana = this.anacleto;
    const bel = this.bel;
    const sm = this.sm;
    const F = (u, v, h) => this.F(u, v, h);
    const S = (k, x, z, h) => this.S(k, x, z, h);
    // dónde está cada uno en el campo (u hacia el río y el sol que sale, v de costado)
    const GIL0 = F(8, 0);
    const SMH = F(13.6, 1.2);
    const BEL0 = F(11.8, -2.6);
    const BEN0 = F(5.2, -1.5);
    const CIR0 = F(4.7, 0.3);
    const ANA0 = F(5.3, 1.9);
    const placeCampo = () => {
      this.put(A, gil, GIL0, F(12, 0.2), 'gilMateHold');
      this.put(A, ben, BEN0, GIL0, 'cower');
      this.put(A, cir, CIR0, GIL0, 'crossArms');
      this.put(A, ana, ANA0, GIL0, 'winded');
      bel.r.pos.copy(BEL0);
      bel.r.yaw = yawTo(BEL0, GIL0);
      const h = this.horse;
      h.pos.copy(SMH);
      h.groundY = SMH.y;
      h.yaw = Math.atan2(GIL0.x - SMH.x, GIL0.z - SMH.z);
      h.speed = 0;
      this.mateAt = { kind: 'two', r: gil };
    };
    const steps = [];
    const step = (fn) => steps.push([0, fn]);

    // 1. El campo de San Lorenzo al alba, con humo
    step(() => {
      this.mode('campo');
      placeCampo();
      // (El Eclipse cayó: el disco se corre del sol, las grietas casi se apagan)
      this.g.world.eclipse?.set?.(0.08, 0);
      this.crackK = 0.45;
      this.nightK = null;
      // (los cuerpos aparecen ya puestos, con el negro todavía: sin el salto de la
      // primera pose)
      A.show(false);
      this.at(0.6, () => this.modeK === 'campo' && A.show(true));
      this.wind(14);
      this.at(0.4, () => this.fade(false));
      this.cut(10, F(1.2, -5.4, 1.85), F(2.6, -4.6, 1.75), F(9.6, 0.2, 1.25), F(9.8, 0.3, 1.3), 46);
      this.at(2.2, () => this.say('fierro', L.todo));
      return 10;
    });
    // 2. El mate brilla: lo que podría ser (el Gil viejo, en paz, con los suyos)
    step(() => {
      this.cut(1.8, F(9.1, 0.35, 1.32), F(8.95, 0.3, 1.28), F(8.36, 0, 1.12), F(8.36, 0, 1.12), 34);
      this.glowTo = 1;
      this.at(1.6, () => {
        this.whiteEl.style.transition = 'opacity 0.5s';
        this.white(true);
      });
      this.at(2.2, () => {
        // la visión: en el fogón, de día, en sepia: viejos y juntos
        this.mode('vision');
        g.renderer.domElement.style.filter = 'sepia(0.85) brightness(1.05) contrast(0.95)';
        const fire = S('fogon', 0, 0);
        const sit = (r, i, clip) => this.put(A, r, this.seatW(i), fire, clip);
        sit(gil, 0, 'sitMate');
        sit(ana, 1, 'sitTalk');
        sit(ben, 2, 'sitLaugh');
        sit(cir, 3, 'sitTalk');
        gil.mate = true;
        this.mateAt = null;
        this.white(false);
        this.shot(5.2, (u, lt, pos, look) => {
          const a = 0.0 + u * 0.28;
          pos.copy(fire).add(tmpV.set(Math.cos(a) * 4.3, 1.75, Math.sin(a) * 4.3));
          look.copy(fire).setY(fire.y + 0.75);
        });
      });
      this.at(7.0, () => this.white(true));
      this.at(7.5, () => {
        g.renderer.domElement.style.filter = '';
        gil.mate = false;
        this.mode('campo');
        placeCampo();
        this.white(false);
        // la cara del Gil: cierra los ojos y apaga el mate
        this.cut(7.5, F(9.45, 0.4, 1.6), F(9.3, 0.35, 1.58), F(8.0, 0.0, 1.45), F(8.0, 0.0, 1.38), 32);
      });
      this.at(8.6, () => {
        gil.a.faint = 1;
        this.glowTo = 0;
      });
      this.at(11.6, () => this.say('fierro', L.sueltan));
      return 15;
    });
    // 3. Se lo da a San Martín, que mira a Belgrano; Belgrano se lo da a los compañeros
    step(() => {
      gil.a.faint = 0;
      this.cut(6.5, F(10.2, -4.2, 1.5), F(10.6, -3.9, 1.55), F(11.6, 0.4, 1.45), F(12.4, 0.8, 1.7), 46);
      this.at(0.3, () => {
        this.mateAt = { kind: 'palm', r: gil };
        A.walkTo(gil, F(11.9, 0.7), 2.6, 'offer', { loop: false, fade: 0.3 });
      });
      this.at(3.6, () => (this.smLook = 1));
      this.at(4.2, () => (this.smShake = this.t));
      this.at(5.6, () => (this.smLook = -1));
      this.at(6.5, () => {
        this.say('fierro', L.todos);
        this.cut(8.5, F(8.4, -5.6, 1.6), F(8.1, -5.3, 1.6), F(10.6, -1.6, 1.25), F(7.6, -0.4, 1.2), 46);
        A.turnTo(gil, BEL0, 0.7);
        A.act(gil, 'idle', { loop: true, fade: 0.3 });
      });
      this.at(7.3, () => A.walkTo(gil, F(11.3, -1.9), 1.3, 'offer', { loop: false, fade: 0.3 }));
      this.at(9.0, () => (bel.arm = 2));
      this.at(9.6, () => {
        this.mateAt = { kind: 'part', a: bel.a };
        A.act(gil, 'chestHand', { loop: true, fade: 0.5 });
      });
      // Belgrano camina hasta los compañeros y se lo da a Cirilo, que se adelanta
      this.at(10.2, () => {
        bel.walk = { from: bel.r.pos.clone(), to: F(6.6, 0.0), t: 0, d: 2.4 };
      });
      this.at(11.3, () => A.walkTo(cir, F(5.4, 0.15), 0.9, 'receive', { loop: false, fade: 0.3 }));
      this.at(13.2, () => (this.mateAt = { kind: 'palm', r: cir }));
      this.at(13.6, () => (bel.arm = 0));
      this.at(14.3, () => A.act(cir, 'cebar', { loop: true, fade: 0.5 }));
      return 15;
    });
    // 4. Se despide de los tres
    step(() => {
      this.cut(4.2, F(2.4, 0.9, 1.6), F(2.6, 0.7, 1.6), F(9, -0.8, 1.3), F(7, -1.0, 1.3), 46);
      A.walkTo(gil, F(6.0, -1.5), 3.8, 'chestHand', { loop: true, fade: 0.5 });
      this.at(4.2, () => {
        this.cut(3, F(7.25, -2.15, 1.7), F(7.15, -2.1, 1.68), F(5.2, -1.5, 1.45), F(5.2, -1.5, 1.42), 40);
        A.act(ben, 'sob', { loop: true, fade: 0.5 });
      });
      this.at(7.2, () => {
        A.walkTo(gil, F(6.0, 0.25), 1.4, 'chestHand', { loop: true, fade: 0.5 });
        this.cut(2.6, F(7.25, -0.4, 1.7), F(7.15, -0.35, 1.68), F(5.4, 0.15, 1.45), F(5.4, 0.15, 1.42), 40);
      });
      this.at(8.9, () => A.act(cir, 'cool', { loop: true, fade: 0.5 }));
      this.at(9.8, () => {
        A.walkTo(gil, F(5.92, 1.9), 1.4, 'idle', { loop: true, fade: 0.4 });
        this.cut(4.4, F(5.6, 4.6, 1.6), F(5.7, 4.4, 1.6), F(5.6, 1.9, 1.2), F(5.6, 1.9, 1.2), 40);
      });
      this.at(11.3, () => {
        A.turnTo(gil, ANA0, 0.4);
        A.act(gil, 'shake', { fade: 0.3 });
        A.turnTo(ana, F(5.92, 1.9), 0.4);
        A.act(ana, 'shake', { fade: 0.3 });
      });
      return 14.2;
    });
    // 5. El desgarro al estero de 1877: el Gil entra solo
    step(() => {
      const RP = F(10.2, 1.2);
      const rr = this.rift.root;
      rr.position.copy(RP);
      rr.rotation.y = Math.atan2(ANA0.x - RP.x, ANA0.z - RP.z);
      rr.visible = true;
      this.riftOpen = { t: this.stepAt ?? this.t };
      this.sfx('tear', RP);
      this.cut(8.5, F(2.6, 1.3, 1.62), F(3.0, 1.25, 1.62), F(9.5, 1.2, 1.5), F(10.0, 1.2, 1.6), 46);
      this.at(1.4, () => {
        A.turnTo(gil, RP, 0.8);
        A.act(gil, 'walk', { loop: true, fade: 0.3, rate: 0.4 });
      });
      this.at(2.2, () => A.walkPath(gil, [RP.clone(), F(11.6, 1.2)], 0.95, 'idle', { loop: true }));
      this.at(1.8, () => this.say('fierro', L.volvio));
      this.at(2.6, () => A.act(ben, 'chestHand', { loop: true, fade: 0.6 }));
      this.at(3.4, () => A.act(ana, 'brimBow', { fade: 0.5 }));
      this.at(6.2, () => {
        gil.dead = true;
        this.mateAt = { kind: 'palm', r: cir };
      });
      this.at(6.9, () => (this.riftClose = this.t));
      return 8.5;
    });
    // 6. El estero de noche: hasta el algarrobo
    step(() => {
      this.mode('estero');
      this.rift.root.visible = false;
      this.mateAt = null;
      for (const r of [ben, cir, ana]) r.dead = true;
      this.put(A, gil, S('estero', -7.5, 4.8), S('estero', 0, 0), 'walk', { rate: 0 });
      A.walkPath(gil, [S('estero', -1.6, 1.4)], 1.05, 'idle', { loop: true });
      this.wind(18, 0.1);
      this.cut(6.4, S('estero', -11, 7.2, 1.7), S('estero', -9.4, 6.0, 1.75), S('estero', -3, 2, 1.6), S('estero', 0, 0, 2.6), 46);
      return 6.4;
    });
    // 7. La cinta colorada en el facón; el sol entre las ramas
    step(() => {
      this.gil.dead = true;
      this.mode('manana');
      // (la luz de la mañana por detrás de la cámara: con el sol de la toma de
      // las ramas, el facón quedaba a contraluz, negro)
      this.lookCfg = { ...LOOKS.manana, dir: [0.6, 0.5, 0.55] };
      const fc = this.sets.parts.facon;
      const fp = fc.getWorldPosition(new THREE.Vector3());
      this.cut(5, fp.clone().add(V3(0.42, 0.26, 0.34)), fp.clone().add(V3(0.36, 0.24, 0.29)), fp.clone().add(V3(0, 0.19, 0)), fp.clone().add(V3(0, 0.2, 0)), 34);
      this.at(5, () => {
        this.lookCfg = LOOKS.manana;
        const tp = S('estero', 0, 0);
        this.shot(5.2, (u, lt, pos, look) => {
          pos.copy(tp).add(tmpV.set(1.6 + u * 0.2, 0.6, 1.8 - u * 0.2));
          look.copy(tp).add(tmpV.set(-0.6, 6.5, -1.4));
        });
        this.setFov(58);
      });
      this.at(9.4, () => this.fade(true));
      return 10.4;
    });
    // 8. El santuario del Gauchito
    step(() => {
      this.mode('santuario');
      const SX = this.Sx;
      // (dos grupos, con el pasillo en el medio: se ven la capillita y las velas)
      const spots = [[-2.3, 3.3], [-1.35, 3.65], [1.4, 3.6], [2.35, 3.25], [-2.0, 4.65], [-0.85, 4.95], [0.95, 4.85], [2.05, 4.45]];
      const clips = ['pray', 'chestHand', 'idle', 'pray', 'idle', 'chestHand', 'pray', 'idle'];
      SX.list.forEach((r, i) => this.put(SX, r, S('santuario', spots[i][0], spots[i][1]), S('santuario', spots[i][0] * 0.4, 0), clips[i], { t: i * 0.7 }));
      this.at(0.3, () => this.fade(false));
      this.cut(14, S('santuario', 0.4, 9.6, 2.35), S('santuario', 0.1, 7.6, 2.05), S('santuario', 0, 0, 0.75), S('santuario', 0, 0, 0.85), 44);
      this.at(1.8, () => this.say('fierro', L.gente));
      this.at(0.2, () => g.music?.play?.('cine-eclipse-final', { fadeIn: 4, while: (G) => G.ee?.scene?.cine === this }));
      return 14;
    });
    // 9. El universo se cose
    step(() => {
      this.whiteEl.style.transition = 'opacity 0.4s';
      this.white(true);
      this.at(0.45, () => {
        this.mode('islas');
        this.white(false);
        this.whiteEl.style.transition = 'opacity 2.5s';
        const I = ISLANDS.centro;
        const C = V3(I.center[0], I.y, I.center[1]);
        this.shot(27, (u, lt, pos, look) => {
          const a = 0.8 + u * 0.6;
          const r = lerp(95, 70, smooth(u));
          pos.copy(C).add(tmpV.set(Math.cos(a) * r, lerp(70, 44, smooth(u)), Math.sin(a) * r));
          look.copy(C).add(tmpV.set(0, lerp(6, 18, smooth(u)), 0));
        });
        this.setFov(55);
        this.g.world.eclipse?.set?.(0, 12);
        this.sew = { t: this.t };
      });
      this.at(2.0, () => g.music?.cur?.song?.level?.(1.0, 4));
      this.at(5.2, () => this.say('fierro', L.cose));
      this.at(18.5, () => {
        g.fx?.flash?.(tmpV.copy(ECLIPSE_DIR).multiplyScalar(200).add(g.camera.position), 0xffe0a0, 60, 1.2, 400);
        this.whiteEl.style.transition = 'opacity 1.2s';
        this.white(true);
      });
      this.at(19.8, () => this.white(false));
      this.at(23, () => g.music?.stop?.(5));
      this.at(26.4, () => this.fade(true));
      return 27.6;
    });
    // 10. El fogón del camino, de noche: los cuatro de siempre
    step(() => {
      this.mode('fogon');
      this.crackK = null;
      const B = this.B;
      const by = B.by;
      const fire = S('fogon', 0, 0);
      const seat = (i) => this.seatW(i);
      // (el Valiente mira al santuario: está del lado del camino)
      this.put(B, by.valiente, seat(0), fire, 'sitMate');
      this.put(B, by.viejo, seat(1), fire, 'sitMate', { t: 1.1 });
      this.put(B, by.canchero, seat(2), fire, 'sitTalk');
      this.put(B, by.miedoso, seat(3), fire, 'sitLaugh');
      by.viejo.mate = true;
      this.fireOn = true;
      this.at(0.4, () => this.fade(false));
      this.cut(6, S('fogon', -4.2, 3.4, 1.9), S('fogon', -3.7, 2.9, 1.75), S('fogon', 0, 0, 0.7), S('fogon', 0.5, 0, 0.75), 48);
      this.at(6, () => {
        const c = seat(2).add(seat(3)).multiplyScalar(0.5);
        this.cut(6.5, fire.clone().add(V3(0.2, 1.1, -0.1)).lerp(c, -0.45), fire.clone().add(V3(0.1, 1.05, 0)).lerp(c, -0.5), c.clone().setY(fire.y + 0.95), c.clone().setY(fire.y + 1.0), 42);
      });
      this.at(7.2, () => this.say('fierro', L.caballeros));
      // el Viejo le pasa el mate al Valiente
      this.at(12.5, () => {
        const v = seat(0);
        this.cut(7.5, v.clone().add(V3(-1.2, 1.25, 1.4)), v.clone().add(V3(-1.0, 1.2, 1.2)), v.clone().add(V3(0.6, 0.85, -0.6)), S('fogon', 6.4, -2.4, 0.8), 40);
      });
      this.at(13.4, () => {
        by.viejo.mate = false;
        by.valiente.mate = true;
      });
      this.at(15.0, () => {
        B.turnTo(by.valiente, S('fogon', 6.6, -2.4), 1.2);
        B.act(by.valiente, 'sitRaise', { fade: 0.4 });
      });
      // se acuerdan: un destello de cada uno con su luz de caballero
      const flashes = ['valiente', 'miedoso', 'canchero', 'viejo'];
      flashes.forEach((p, i) => {
        const t0 = 20 + i * 2.1;
        this.at(t0, () => {
          this.whiteEl.style.transition = 'opacity 0.12s';
          this.white(true);
        });
        this.at(t0 + 0.14, () => {
          this.white(false);
          this.memory = { p, t: this.t };
          const r = by[p];
          const h = r.pos.clone().setY(r.pos.y + 1.05);
          const fw = tmpV.subVectors(fire, r.pos).setY(0).normalize();
          const cam = h.clone().addScaledVector(fw, 1.25).add(V3(0, 0.25, 0));
          this.cut(1.9, cam, cam.clone().addScaledVector(fw, -0.25), h.clone().setY(h.y + 0.25), h.clone().setY(h.y + 0.3), 38);
        });
      });
      this.at(28.6, () => {
        this.memory = null;
        this.whiteEl.style.transition = 'opacity 0.3s';
        this.white(true);
      });
      this.at(28.9, () => {
        this.white(false);
        this.cut(6, S('fogon', -5.0, 4.2, 2.3), S('fogon', -4.6, 3.8, 2.2), S('fogon', -1.5, -0.8, 0.8), S('fogon', -2.5, -1.2, 0.9), 46);
        B.act(by.valiente, 'sitMate', { loop: true, fade: 0.5 });
      });
      return 35;
    });
    // 11. Fierro llega desde lo oscuro y se vuelve el hombre de la linterna
    step(() => {
      const B = this.B;
      const fz = this.fierro;
      const gd = this.gold;
      const from = S('fogon', -8.2, -2.6);
      const to = S('fogon', -3.3, -1.25);
      const cam = S('fogon', -1.3, -0.5, 1.2);
      this.put(B, fz, from, to, 'walk', { rate: 0 });
      B.walkPath(fz, [to], 0.52, 'fStand', { loop: true });
      this.g.fx?.sparkle?.(from.clone().setY(from.y + 1.1), [0.6, 0.75, 1], 24, 0.8);
      this.shot(24, (u, lt, pos, look) => {
        pos.lerpVectors(cam, S('fogon', -1.7, -0.62, 1.32), smooth(u));
        const hp = (fz.dead ? gd : fz).pos;
        look.set(hp.x, hp.y + 1.35, hp.z);
      });
      this.setFov(40);
      this.at(1.6, () => this.say('fierro', L.razon));
      // se vuelve el hombre de la linterna (en el mismo paso)
      this.at(8.2, () => {
        const p = fz.pos.clone();
        g.fx?.flash?.(p.clone().setY(p.y + 1.3), 0xffc060, 40, 0.8, 10);
        g.fx?.sparkle?.(p.clone().setY(p.y + 1.2), [1, 0.8, 0.35], 40, 1.0);
        this.whiteEl.style.transition = 'opacity 0.25s';
        this.white(true);
        const left = Math.hypot(to.x - p.x, to.z - p.z);
        fz.dead = true;
        fz.mv = null;
        this.put(B, gd, p, to, 'walk', { rate: 0 });
        if (left > 0.05) B.walkPath(gd, [to], 0.5, 'lanternStand', { loop: true });
        else B.act(gd, 'lanternStand', { loop: true, fade: 0.4 });
        this.lampOn = 1;
      });
      this.at(8.5, () => this.white(false));
      return 24;
    });
    // 12. La revelación (de cerca) y apaga la linterna
    step(() => {
      const B = this.B;
      const gd = this.gold;
      if (!gd.mv) B.act(gd, 'lanternStand', { loop: true, fade: 0.5 });
      const h = gd.pos.clone().setY(gd.pos.y + 1.6);
      const fw = V3(-Math.sin(gd.yaw), 0, -Math.cos(gd.yaw));
      this.cut(21, h.clone().addScaledVector(fw, 1.45).add(V3(0, -0.04, 0)), h.clone().addScaledVector(fw, 1.15).add(V3(0, -0.03, 0)), h, h.clone().add(V3(0, 0.01, 0)), 30);
      this.at(1.2, () => this.say('fierro', L.rev1));
      this.at(6.6, () => this.say('fierro', L.rev2));
      this.at(14.4, () => this.say('fierro', L.rev3));
      this.at(21, () => {
        B.act(gd, 'lanternOut', { fade: 0.3 });
        this.cut(4.5, h.clone().addScaledVector(fw, 1.9).add(V3(0, -0.35, 0)), h.clone().addScaledVector(fw, 1.8).add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.35, 0)), 36);
        this.quiet();
      });
      this.at(22.8, () => {
        this.lampOn = 0;
        this.fireDim = 1;
        this.sfx('out', gd.pos);
      });
      this.at(23.6, () => this.fade(true));
      return 25.5;
    });
    // 13. La placa
    step(() => {
      this.cardEl.style.zIndex = '6';
      this.card(L.placa, 6.5);
      return 8;
    });
    return steps;
  }

  // ---------------- cada cuadro ----------------
  tick(dt, t) {
    const g = this.g;
    this.dt = dt;
    const A = this.A;
    // Belgrano camina (de piezas: Avatars le mueve las piernas)
    const b = this.bel;
    if (b.walk) {
      const W = b.walk;
      W.t += dt;
      const k = Math.min(1, W.t / W.d);
      const prev = tmpW.copy(b.r.pos);
      b.r.pos.lerpVectors(W.from, W.to, smooth(k));
      b.r.pos.y = this.floorAt(b.r.pos.x, b.r.pos.z);
      const v = dt > 0 ? prev.distanceTo(b.r.pos) / dt : 0;
      b.r.moving = v > 0.05;
      b.r.speed = v;
      if (v > 0.05) b.r.yaw = yawTo(prev, b.r.pos);
      if (k >= 1) {
        b.walk = null;
        b.r.moving = false;
        b.r.speed = 0;
        b.r.yaw = yawTo(b.r.pos, this.cirilo.pos);
      }
    }
    // San Martín: mira al Gil, niega con la cabeza, mira a Belgrano
    const sm = this.sm;
    const want = this.smLook === -1 ? -0.55 : this.smLook === 1 ? 0.1 : 0;
    sm.look += (want - sm.look) * Math.min(1, dt * 2.5);
    sm.head = this.smShake != null ? 0.32 * Math.sin((this.t - this.smShake) * 9) * Math.max(0, 1 - (this.t - this.smShake) / 1.3) : 0;
    this.horses.update(dt);
    this.mont.update(dt);
    // los cuerpos
    for (const C of [A, this.Sx, this.B]) if (C.people.root.visible) C.tick(dt);
    for (const a of [b.a, sm.a]) if (a?.hand) a.hand.visible = false;
    gilVincha(this.gil.a);
    this.goldLook();
    this.placeMate();
    // el brillo del mate
    const mg = this.mate.userData;
    this.glowK = (this.glowK || 0) + ((this.glowTo || 0) - (this.glowK || 0)) * Math.min(1, dt * 1.6);
    mg.glow.material.opacity = this.glowK * 0.9;
    mg.glow.scale.setScalar(0.32 + this.glowK * 0.9 + 0.04 * Math.sin(t * 5));
    mg.gourd.material.emissiveIntensity = this.glowK * 0.9;
    // el desgarro
    const R = this.rift;
    R.tick(dt, g.camera);
    if (this.riftOpen && this.riftClose == null) {
      const k = (this.t - this.riftOpen.t) / 1.6;
      R.U.uCrack.value = Math.min(1, Math.max(0, k * 3));
      R.U.uOpen.value = 1 - (1 - smooth(clamp01(k - 0.3))) ** 2;
    }
    if (this.riftClose != null) {
      const k = (this.t - this.riftClose) / 0.9;
      R.U.uOpen.value = Math.max(0, 1 - smooth(Math.min(1, k)));
      R.U.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1.05 && R.root.visible && this.modeK === 'campo') {
        R.root.visible = false;
        const p = tmpV.copy(R.root.position).setY(R.root.position.y + 1.5);
        g.fx?.flash?.(p, 0xff9ce8, 34, 0.45, 12);
        g.fx?.sparkle?.(p, [1, 0.6, 0.95], 24, 0.6);
        this.sfx('close', R.root.position);
      }
    }
    // la cinta del facón y las banderas
    tickFlags(t);
    for (const tl of this.sets.parts.facon.userData.tails) tl.rotation.set(0.25 + 0.12 * Math.sin(t * 2.1 + tl.userData.len * 9), 0, 0.15 * Math.sin(t * 1.7 + tl.userData.len * 5));
    for (const f of this.sets.flames) f.scale.setScalar(f.userData.base * (0.85 + 0.15 * Math.sin(t * 13 + f.position.x * 7)));
    // el humo del campo
    if (this.smokeG.visible) {
      for (const s of this.smoke) {
        const d = s.userData;
        this.F(d.u + ((t * 0.25 + d.ph * 3) % 12) - 6, d.v, 1.2 + 0.5 * Math.sin(t * 0.3 + d.ph), s.position);
        s.scale.setScalar(d.s);
      }
    }
    // el cielo de Eclipse se cose: las grietas se cierran y se aclara; el alba entra encima
    if (this.sew) {
      const k = this.t - this.sew.t;
      this.crackK = 1 - smooth(clamp01((k - 3) / 11));
      // (la noche se queda: al aclarar los ocho cielos se mezclaban en un marrón;
      // el alba entra como un domo pintado encima, antes)
      this.nightK = 1;
      this.dome.userData.U.uOpacity.value = smooth(clamp01((k - 9) / 9));
      this.dome.userData.U.uSunK.value = 1.4 * smooth(clamp01((k - 15) / 6));
    } else if (this.dome.visible) this.dome.userData.U.uOpacity.value = 1;
    // el fuego y la linterna: dos fogonazos prestados, prendidos mientras se ven
    this.fireTick(t, dt);
    // los recuerdos: el que se acuerda brilla con la luz de su elemento
    for (const r of this.B.list) {
      const u = r.a?.M?.gaucho?.userData.life?.uFill;
      if (!u) continue;
      if (this.memory?.p === r.persona) u.value.set(ELEM[r.persona]).multiplyScalar(0.75);
      else if (this.fireOn && r.persona !== 'fierro') u.value.setRGB(0.06, 0.03, 0.01);
      else u.value.setRGB(0, 0, 0);
    }
  }

  fireTick(t, dt) {
    const g = this.g;
    const fire = this.sets.fire;
    const on = this.fireOn && this.modeK === 'fogon';
    this.fireK = (this.fireK ?? 1) + ((this.fireDim ? 0.25 : 1) - (this.fireK ?? 1)) * Math.min(1, dt * 1.5);
    const flick = 0.85 + 0.1 * Math.sin(t * 17) + 0.08 * Math.sin(t * 7.3);
    for (const s of fire.children) {
      s.scale.setScalar(s.userData.base * (0.8 + 0.25 * Math.sin(t * 9 + s.userData.ph)) * this.fireK);
      s.position.y = 0.15 + s.userData.ph * 0.05 + 0.04 * Math.sin(t * 6 + s.userData.ph);
    }
    const FL = this.fireL;
    if (FL) {
      if (on) {
        fire.getWorldPosition(tmpV);
        FL.life = 1;
        FL.max = 1;
        FL.peak = 9 * flick * this.fireK;
        FL.light.color.setHex(0xff8a3a);
        FL.light.distance = 13;
        FL.light.position.set(tmpV.x, tmpV.y + 0.6, tmpV.z);
      } else if (this.fireWas) FL.life = 0;
    }
    this.fireWas = on;
    // la linterna, en la mano izquierda del hombre dorado
    const lp = this.lamp;
    const gd = this.gold;
    const lon = !!this.lampOn && !gd.dead && !!gd.a?.gs?.on && this.modeK === 'fogon';
    this.lampK = (this.lampK || 0) + ((lon ? 1 : 0) - (this.lampK || 0)) * Math.min(1, dt * (lon ? 3 : 6));
    lp.root.visible = !gd.dead && !!gd.a?.gs?.on && this.modeK === 'fogon';
    if (lp.root.visible) {
      gd.a.gs.bones.LeftHand.getWorldPosition(tmpV);
      lp.root.position.set(tmpV.x, tmpV.y - 0.05, tmpV.z);
      const k = this.lampK * (0.9 + 0.1 * Math.sin(t * 15));
      lp.flame.scale.setScalar(0.22 * k);
      lp.halo.material.opacity = 0.35 * k;
      lp.glass.opacity = 0.2 + 0.65 * this.lampK;
    }
    const LL = this.lampL;
    if (LL) {
      if (lp.root.visible && this.lampK > 0.02) {
        LL.life = 1;
        LL.max = 1;
        LL.peak = 1.5 * this.lampK;
        LL.light.color.setHex(0xffa04a);
        LL.light.distance = 5;
        // (un poco adelante: pegada a la tela la quemaba en blanco)
        LL.light.position.copy(lp.root.position).add(tmpW.set(-Math.sin(gd.yaw) * 0.35, 0.15, -Math.cos(gd.yaw) * 0.35));
        this.lampWas = true;
      } else if (this.lampWas) {
        LL.life = 0;
        this.lampWas = false;
      }
    }
  }

  // el hombre de la linterna: oscuro, el poncho de oro gastado y los ojos de oro
  // (el del molino: ui/introShots goldGaucho)
  goldLook() {
    const a = this.gold.a;
    const G = a?.gs;
    if (!G?.on || a.goldOn) return;
    a.goldOn = true;
    G.mat.color.setScalar(0.32);
    a.M.poncho.color.set(0x9a6c1e).multiplyScalar(1.7 / 0.32);
    const eye = new THREE.Color(0xffa818).multiplyScalar(1.3);
    a.M.eye.color.copy(eye);
    for (const o of eyeSpots(G, a.M.eye.color)) {
      const sm = new THREE.SpriteMaterial({ map: this.g.textures?.dot, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.32, toneMapped: false });
      sm.color = a.M.eye.color;
      const sp = new THREE.Sprite(sm);
      const ws = 1 / o.getWorldScale(tmpV).x;
      sp.scale.setScalar(0.06 * ws);
      sp.frustumCulled = false;
      o.add(sp);
    }
  }

  // ---------------- el sonido ----------------
  wind(dur, gain = 0.16) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = (this.bus ||= A.out({ gain: 1, reverb: 0.5, bus: A.music }));
    A.noise(o, { t: A.now, dur, type: 'bandpass', freq: 300, freqEnd: 220, q: 0.6, gain, attack: 2.5, brown: true });
  }
  sfx(kind, p) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(p).setY(p.y + 1.4).clone(), gain: 1, reverb: 0.7, ref: 7 });
    const t = A.now;
    if (kind === 'tear') {
      A.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 320, freqEnd: 2600, q: 1.6, gain: 0.55, attack: 0.04 });
      A.tone(o, { t, dur: 1.8, type: 'sawtooth', freq: 62, freqEnd: 36, gain: 0.22, attack: 0.05 });
    } else if (kind === 'close') {
      A.noise(o, { t, dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 120, gain: 0.6, attack: 0.01 });
      A.tone(o, { t: t + 0.55, dur: 0.9, type: 'sine', freq: 95, freqEnd: 30, gain: 0.55, attack: 0.004 });
    } else if (kind === 'out') {
      A.noise(o, { t, dur: 0.5, type: 'highpass', freq: 2500, gain: 0.12 });
    }
  }

  cleanup() {
    const g = this.g;
    const w = g.world;
    g.renderer.domElement.style.filter = '';
    if (this.sceneBR !== undefined) g.scene.onBeforeRender = this.sceneBR || (() => {});
    if (w.sky?.userData.finWrap !== undefined) {
      w.sky.onBeforeRender = w.sky.userData.finWrap;
      delete w.sky.userData.finWrap;
    }
    if (w.sky) w.sky.visible = true;
    if (this.fireL) this.fireL.life = 0;
    if (this.lampL) this.lampL.life = 0;
    for (const C of [this.A, this.Sx, this.B]) C?.dispose();
    this.horses?.dispose();
    this.rift?.dispose();
    if (g.zombies?.root) g.zombies.root.visible = true;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
  }
}
