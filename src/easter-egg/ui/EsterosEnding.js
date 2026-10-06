import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import Avatars from '../net/Avatars';
import { EE } from '../config/map';
import { warmScene } from './cineWarm';
import { prefetchTrack } from '../core/music';
import { cineClip, poseCineClip, gauchoClip, cineSnap } from '../net/gauchoSkin';
import { PERSONA_T } from './cineCrew';
import { assetUrl } from '../../lib/assets';

// El final de "Mate no Numa" (El Pacto): cayó el Luisón y los cuatro quedan
// al pie del Algarrobo de los Colgados. La voz le habla a Gil (solo él la oye:
// los compañeros no reaccionan) y le pide sellar el pacto con sangre.
// Antes de elegir, un momento que la voz no ve: Gil solo, la mano en el pecho,
// lo que piensa para él (su lealtad no es entera).
// Gil decide (el jugador que es Gil; en línea, solo él), sin soltar el mouse:
//  · sellar el pacto (el canónico): va hasta Cirilo, que le convida un mate, y
//    lo mata a traición; Benito retrocede con las manos arriba y Gil lo alcanza;
//    Anacleto le ruega de rodillas. Queda ensangrentado; se guarda algo para él
//    (la hoja del códice, si la arrancó, o la cinta colorada del facón) y se
//    va a cosechar almas de gauchos. "El ciclo continúa".
//  · negarse: le apunta al árbol con el facón, los tres se le ponen al lado y
//    la voz se va con un trueno. Los cuatro se van juntos. "El ciclo se ha roto".
// Los cuerpos se mueven con clips animados a mano en Blender (scratchpad
// cine-esteros/esteros_clips.py -> modelos/gaucho/cine-esteros.json; el
// caminar y correr, los de siempre de net/gauchoSkin). Cada uno con su
// carácter (ui/cineCrew PERSONA): Gil el Valiente, Anacleto el Viejo (se
// cansa, le duele la espalda, ruega de rodillas), Cirilo el Canchero (el mate
// en la mano, no se entera de nada) y Benito el Miedoso (mira para todos lados,
// se agacha, se santigua). Cada cambio arranca de la pose que tiene (cineSnap):
// nada salta. Sin los clips (o con globalThis.__mduBlend = false), la versión
// de antes: ui/EsterosEndingClassic.js.

const CHOOSE_SECS = 30;
// dónde arranca a sonar la canción de la traición (antes, 0,38 s de nada)
const TRAICION_AT = 0.36;
const MATES = [
  { id: 901, key: 'anacleto', name: 'Anacleto', color: 0x3a6a2a, persona: 'viejo' },
  { id: 902, key: 'cirilo', name: 'Cirilo', color: 0x2a3a7a, persona: 'canchero' },
  { id: 903, key: 'benito', name: 'Benito', color: 0x7a5a2a, persona: 'miedoso' },
];
const GIL = { id: 900, key: 'gil', name: 'Antonio Gil', color: 0xb01c14, persona: 'valiente' };
const WHO = { entidad: 'La voz', gil: 'Gil', anacleto: 'Anacleto', cirilo: 'Cirilo', benito: 'Benito', secreto: 'Gil, para sí' };
const OPTS = ['kill', 'spare'];
// el golpe de cada puñalada (s desde que arranca el clip)
const HIT = 0.5;
// los clips que se mueven (la cadera termina en otro lado): al terminar, la
// persona queda donde quedó
const MOVERS = new Set(['retreat']);
// (de lo que cae al piso: cuánto antes queda tirado del todo)
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpI = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
// (el cuerpo no gira más de esto, rad/s: ~9° por cuadro a 30; con lo que gira
// la cadera al pasar de un clip a otro, no llega a los 20°)
const MAX_TURN = 4.5;
const turnCap = (a, b, dt) => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const lim = MAX_TURN * dt;
  return a + Math.max(-lim, Math.min(lim, d));
};
const ONE = new THREE.Vector3(1, 1, 1);
const tmpS = new THREE.Vector3();

const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
// (el yaw de Avatars mira hacia -z con yaw 0: de un punto hacia otro)
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;

// los clips: se bajan con el mapa (entities/EsterosEgg), antes del final
let CLIPS = null;
let loading = null;
export function prefetchEsterosClips() {
  loading ||= fetch(assetUrl('/assets/sotano/modelos/gaucho/cine-esteros.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
    })
    .catch(() => {});
  return loading;
}
export const esterosClipsReady = () => !!CLIPS && globalThis.__mduBlend !== false;

export default class EsterosEnding extends CastleCine {
  constructor(game, egg, { hoja = false } = {}) {
    super(game, { drive: false, kind: 'esteros' });
    this.egg = egg;
    this.hoja = hoja;
    this.choice = null;
    this.waiting = false;
    this.sel = 0;
    this.anims = [];
    this.dtNow = 0;
    this.flash = 0;
  }

  // ---------------- el lugar y los cuatro ----------------
  build() {
    const g = this.g;
    const w = g.world;
    const [hx, hz] = EE.hueco;
    // el árbol al este; los cuatro en lo seco, del lado oeste (entre el
    // tronco y el pajonal hay 4 m: las cámaras no salen de ahí)
    this.H = this.egg.huecoPos?.clone() || new THREE.Vector3(hx + 0.35, w.floorAt(hx, hz) + 1.25, hz);
    const at = (x, z) => new THREE.Vector3(x, w.floorAt(x, z), z);
    this.at = at;
    // (Anacleto y Benito un poco más abiertos: las tomas de la traición los
    // dejan afuera del primer plano)
    this.spots = { gil: at(10.1, 10.9), anacleto: at(8.2, 12.9), cirilo: at(7.6, 10.5), benito: at(8.3, 8.3) };
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // (sin máquinas, tizas ni cajas en cuadro: la escena es del árbol)
    this.hidInteract = g.interact.root.visible;
    g.interact.root.visible = false;
    // la escena es de los cuatro: sin el cuerpo del Luisón ni muertos quietos
    if (g.zombies.boss?.dead) g.zombies.removeBoss();
    for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
    // (ni la sangre de la pelea, los charcos ni lo que quedaba volando)
    g.fx.clearAll();
    g.weapons.clearProjectiles();
    g.weapons.clearStuck();
    this.npc = new Avatars(g, null);
    this.people = {};
    for (const P of [GIL, ...MATES]) {
      const pos = this.spots[P.key].clone();
      const r = { id: P.id, name: P.name, noTag: true, pos, yaw: 0, pitch: 0, speed: 0, crouch: false, moving: false };
      this.npc.add(r);
      const a = this.npc.list.get(P.id);
      a.M.poncho.color.set(P.color).multiplyScalar(1.7);
      this.people[P.key] = { key: P.key, r, a, persona: P.persona, cc: null, mv: null };
    }
    this.face('gil', this.H);
    for (const m of MATES) this.face(m.key, this.spots.gil);
    // el mate: solo Cirilo, que ceba (los otros no tienen nada en la mano)
    for (const m of ['anacleto', 'benito']) this.people[m].a.hand.children[0].visible = false;
    this.buildKnife();
    // la luz fría del hueco (la voz está ahí, pero nunca se la ve): la del
    // mapa, que ya está desde el principio (ver cineWarm); si no, una propia
    this.hl = this.egg.cineLight || new THREE.PointLight(0x9ad8c8, 0, 9, 1.6);
    this.hl.position.copy(this.H);
    if (!this.hl.parent) this.root.add(this.hl);
    // el fogonazo colorado de cada golpe
    this.redEl = document.createElement('i');
    this.redEl.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,rgba(140,0,0,.2),rgba(60,0,0,.85));opacity:0;pointer-events:none';
    this.el.insertBefore(this.redEl, this.el.querySelector('.mdu-fcine__fade'));
    this.buildChoice();
    // los cuatro, el facón y lo que se vuelve a ver del estero: compilado ya,
    // en segundo plano (el relieve de Surfaces primero, si no se recompila)
    // (de noche en el pajonal no se veían las caras: la escena, más expuesta)
    this.expo0 = g.renderer.toneMappingExposure;
    g.renderer.toneMappingExposure = this.expo0 * 1.45;
    g.post?.sweep?.();
    warmScene(g);
    // (la canción de la traición entra justo con la puñalada: ya bajada)
    prefetchTrack('cine-esteros-traicion');
    // (el caminar y correr de siempre: que bajen ya)
    gauchoClip('walk');
    return this.script0();
  }

  // El facón de Gil: el cabo en el puño y la hoja saliendo para adelante del
  // puño; una cinta colorada atada al cabo (la que después va a ser suya).
  buildKnife() {
    const gil = this.people.gil.a;
    gil.hand.children[0].visible = false;
    const knife = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 1, roughness: 0.22 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.7 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.13, 8), wood);
    knife.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.022), steel);
    guard.position.y = -0.072;
    knife.add(guard);
    const shape = new THREE.Shape();
    shape.moveTo(-0.016, 0);
    shape.lineTo(0.017, 0);
    shape.lineTo(0.013, -0.27);
    shape.lineTo(-0.002, -0.33);
    shape.lineTo(-0.016, -0.25);
    shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }).translate(0, 0, -0.003), steel);
    blade.position.y = -0.08;
    knife.add(blade);
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22).translate(0, -0.11, 0), new THREE.MeshStandardMaterial({ color: 0xc01010, roughness: 0.8, side: THREE.DoubleSide }));
    ribbon.position.set(0.01, 0.06, 0.012);
    ribbon.rotation.set(0.5, 0.2, 0.25);
    knife.add(ribbon);
    knife.position.set(0, -0.2, 0.03);
    knife.visible = false;
    gil.hand.add(knife);
    this.knife = knife;
    this.bladeMat = steel;
  }

  // ---------------- los cuerpos ----------------
  // Pasa a un clip (los de Blender o los de siempre), desde la pose que tiene.
  // o: loop, rate, t (por dónde arranca), look (rad), fade (s).
  act(key, name, o = {}) {
    const p = this.people[key];
    const prev = p.cc;
    // (un clip que se mueve terminó: queda donde quedó la cadera)
    if (prev && MOVERS.has(prev.name)) this.settle(p, prev);
    p.cc = { name, lt: o.t || 0, rate: o.rate ?? 1, loop: !!o.loop, look: o.look || 0, fade: o.fade ?? 0.3, at: this.t, snap: cineSnap(p.a) };
  }

  settle(p, cc) {
    const c = this.clipOf(cc.name);
    if (!c) return;
    const n = c.n - 1;
    const h = c.hips;
    tmpV.set(h[n * 3] - h[0], 0, h[n * 3 + 2] - h[2]).applyAxisAngle(UP, p.r.yaw + Math.PI);
    p.r.pos.add(tmpV);
    p.r.pos.y = this.g.world.floorAt(p.r.pos.x, p.r.pos.z);
  }

  clipOf(name) {
    return CLIPS?.[name] || gauchoClip(name);
  }

  // Camina (o corre) hasta (x, z) en dur s, con el paso al ritmo de lo que
  // avanza; then: el clip al llegar (y sus opciones).
  walkTo(key, x, z, dur, { run = false, then = null, thenO = {} } = {}) {
    const p = this.people[key];
    const to = this.at(x, z);
    p.mv = { from: p.r.pos.clone(), to, dur, t: 0, then, thenO };
    this.act(key, run ? 'run' : 'walk', { loop: true, fade: 0.4, rate: 0 });
    return to;
  }

  // Un punto a d m de otra persona, del lado de donde viene `from`.
  near(key, from, d) {
    const q = this.people[key].r.pos;
    const f = this.people[from].r.pos;
    tmpV.subVectors(f, q).setY(0).normalize().multiplyScalar(d).add(q);
    return [tmpV.x, tmpV.z];
  }

  moveTick(p, dt) {
    const M = p.mv;
    if (!M) return;
    M.t += dt;
    const k = Math.min(1, M.t / M.dur);
    const prev = tmpW.copy(p.r.pos);
    p.r.pos.lerpVectors(M.from, M.to, smooth(k));
    p.r.pos.y = this.g.world.floorAt(p.r.pos.x, p.r.pos.z);
    const v = dt > 0 ? Math.hypot(p.r.pos.x - prev.x, p.r.pos.z - prev.z) / dt : 0;
    const c = p.cc && this.clipOf(p.cc.name);
    if (c?.speed) p.cc.rate = Math.min(2.2, v / c.speed);
    if (k < 0.97) p.r.yaw = turnCap(p.r.yaw, angLerp(p.r.yaw, yawTo(M.from, M.to), Math.min(1, dt * 4)), dt);
    if (k >= 1) {
      p.mv = null;
      this.act(p.key, M.then || 'gilStand', { loop: true, fade: 0.35, ...M.thenO });
    }
  }

  face(key, target) {
    const r = this.people[key].r;
    r.yaw = yawTo(r.pos, target);
  }

  // Se da vuelta hacia algo, a su ritmo (el Viejo, despacio; el Miedoso, de golpe).
  turn(key, target, dur = null) {
    const p = this.people[key];
    const r = p.r;
    const y0 = r.yaw;
    const y1 = yawTo(r.pos, target);
    const dy = Math.abs(Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0)));
    // (el giro más rápido de smooth es 1,5 veces el promedio: no más de MAX_TURN)
    const d = Math.max(dur ?? 0.9 / (PERSONA_T[p.persona]?.turn || 2) + 0.15, (dy * 1.5) / MAX_TURN);
    this.anim(d, (k) => (r.yaw = angLerp(y0, y1, smooth(k))));
  }

  // Algo que pasa en el tiempo: fn(k) de 0 a 1.
  anim(dur, fn, done) {
    this.anims.push({ t: 0, dur, fn, done });
  }

  head(key, up = 1.55) {
    return this.people[key].r.pos.clone().setY(this.people[key].r.pos.y + up);
  }

  // Habla alguien: el nombre arriba y el color de cada uno.
  say(who, text) {
    const d = super.say(who, text);
    this.label(who, text);
    return d;
  }

  // Lo que Gil piensa (no se oye: la voz tampoco lo oye).
  think(text) {
    const el = this.textEl;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    this.label('secreto', text);
    return text.length * 0.07 + 1.4;
  }

  label(who, text) {
    this.textEl.innerHTML = `<span class="mdu-fcine__who">${WHO[who] || ''}</span>`;
    this.textEl.append(text);
    this.el.classList.toggle('is-voz', who === 'entidad');
    this.el.classList.toggle('is-gil', who === 'gil');
    this.el.classList.toggle('is-secreto', who === 'secreto');
    this.el.classList.toggle('is-fierro', false);
  }

  // Una toma que mira a un punto desde otro (con un desliz de a -> b).
  glide(dur, a, b, lookA, lookB = lookA) {
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(a, b, k);
      look.lerpVectors(lookA, lookB, k);
    });
  }

  // Una toma que sigue a alguien (el punto se recalcula cada cuadro).
  follow(dur, a, b, fn) {
    this.shot(dur, (u, lt, pos, look) => {
      pos.lerpVectors(a, b, smooth(u));
      look.copy(fn());
    });
  }

  // Un punto a la altura del suelo del claro (x, z) con y relativa al de Gil.
  pt(x, z, up) {
    return new THREE.Vector3(x, this.spots.gil.y + up, z);
  }

  // Latidos (solo en esta compu, sin lugar).
  heart(n = 3) {
    const A = this.g.audio;
    if (!A?.out || !A.tone) return;
    try {
      const o = A.out({ gain: 0.8 });
      for (let i = 0; i < n; i++) {
        const t = A.now + i * 0.85;
        A.tone(o, { t, dur: 0.16, type: 'sine', freq: 62, freqEnd: 40, gain: 0.7, attack: 0.004, release: 0.14 });
        A.tone(o, { t: t + 0.22, dur: 0.14, type: 'sine', freq: 55, freqEnd: 38, gain: 0.45, attack: 0.004, release: 0.12 });
      }
    } catch {
      /* sin audio */
    }
  }

  // ---------------- el guion ----------------
  script0() {
    const S = this.spots;
    const H = this.H;
    // (el medio de los cuatro: la primera toma los ve a todos, desde arriba del pajonal)
    const mid = S.gil.clone().add(S.anacleto).add(S.cirilo).add(S.benito).multiplyScalar(0.25);
    return [
      [0, () => {
        this.fade(false);
        this.glide(9, this.pt(11.2, 14.6, 2.4), this.pt(11.0, 14.0, 2.25), mid.clone().setY(mid.y + 0.9), mid.clone().lerp(H, 0.35).setY(mid.y + 1.1));
        // después de la pelea, cada uno a su manera: Gil resopla, el Viejo con
        // las manos en las rodillas, Cirilo ya ceba, Benito mira para todos lados
        this.act('gil', 'gilTired', { loop: true, fade: 0.01 });
        this.act('anacleto', 'winded', { loop: true, fade: 0.01, t: 0.7 });
        this.act('cirilo', 'cebar', { loop: true, fade: 0.01, t: 0.4 });
        this.act('benito', 'nervous', { loop: true, fade: 0.01, t: 1.2 });
        return 0.8;
      }],
      [0, () => {
        // (el Viejo se endereza a medias, con la mano en la espalda)
        this.later(1.6, () => this.act('anacleto', 'stretch', { loop: true, fade: 0.8 }));
        return this.say('anacleto', 'Se terminó, Antonio. El bicho está muerto.');
      }],
      [0.2, () => this.say('cirilo', 'Vamos al fogón. Hay mate, y hay que secarse antes de que amanezca.')],
      [0.2, () => this.say('benito', '¿Y la voz, Antonio? Esa que oías... ¿se fue?')],
      [0.3, () => {
        // Gil mira el árbol; el hueco se prende
        this.quiet();
        this.hlOn = true;
        this.glide(7, this.head('gil', 1.5).add(tmpV.set(-1.6, 0.1, 1.2)), this.head('gil', 1.5).add(tmpV.set(-1.1, 0, 0.7)), H, H);
        this.act('gil', 'gilStand', { loop: true, fade: 0.9, look: 0.12 });
        return 1.6;
      }],
      [0, () => this.say('entidad', 'Bien hecho, Antonio. Casi terminamos.')],
      [0.2, () => this.say('entidad', 'Tus compañeros vieron demasiado. Oyeron cosas. Saben dónde está el hueco.')],
      [0.2, () => {
        // (Cirilo, que no oye nada, sigue con su mate)
        this.glide(9, this.pt(9.45, 11.45, 1.6), this.pt(9.25, 11.15, 1.55), this.head('cirilo', 1.2));
        return this.say('entidad', 'Un pacto se sella con sangre. La de ellos. Tres almas de gaucho, y el poder es tuyo.');
      }],
      // lo que la voz no ve: la luz del hueco se apaga un momento y Gil,
      // solo, se lleva la mano al pecho
      [0.4, () => {
        this.quiet();
        this.hlOn = false;
        this.g.audio.hush?.();
        const chest = this.head('gil', 1.3);
        this.glide(7, this.pt(11.1, 11.9, 1.5), this.pt(10.9, 11.6, 1.42), chest, this.head('gil', 1.45));
        this.act('gil', 'gilHeart', { loop: true, fade: 0.8 });
        this.heart(4);
        return 1.6;
      }],
      [0, () => this.think('Te voy a dar lo que pedís. Pero hay algo que no te voy a dar nunca.')],
      [0.3, () => {
        this.act('gil', 'gilStand', { loop: true, fade: 0.8, look: 0.1 });
        this.hlOn = true;
        this.glide(4, this.head('gil', 1.5).add(tmpV.set(-1.4, 0.1, 1)), this.head('gil', 1.5).add(tmpV.set(-1.2, 0, 0.8)), H, H);
        return this.say('entidad', '¿Antonio? Te estoy esperando.');
      }],
      [0.2, () => {
        // la decisión: la escena espera a Gil
        this.quiet();
        this.glide(CHOOSE_SECS + 10, this.pt(10.7, 13.4, 1.75), this.pt(9.6, 13.5, 1.8), this.head('gil', 1.5));
        this.openChoice();
        return 9999;
      }],
    ];
  }

  // ---- los golpes ----
  // Gil le pega a `victim` con el clip `clip` (stabOver: de arriba; stabThrust:
  // de punta); el golpe llega a los HIT s.
  strike(victim, clip) {
    this.knife.visible = true;
    // (se da vuelta rápido pero sin latigazo: el cuerpo entero no gira más de ~15° por cuadro)
    this.turn('gil', this.people[victim].r.pos, 0.45);
    this.act('gil', clip, { fade: 0.22 });
    this.later(HIT, () => this.hit(victim));
    this.later(1.15, () => this.act('gil', 'gilBloody', { loop: true, fade: 0.5 }));
    return 1.2;
  }

  hit(victim) {
    const g = this.g;
    const r = this.people[victim].r;
    const G = this.people.gil.r;
    const chest = r.pos.clone().setY(r.pos.y + 1.25);
    const dir = tmpW.copy(r.pos).sub(G.pos).setY(0.2).normalize();
    g.fx.blood?.(chest, dir, 20, 1.4);
    g.audio.knife?.(true);
    // la canción de la traición entra con la primera puñalada (no al elegir)
    this.betrayalSong();
    this.flash = 1;
    this.shake = 0.45;
    // el golpe lo dobla: las manos a la panza y se le cae el mate
    this.dropMate(victim);
    this.turn(victim, G.pos, 0.2);
    this.act(victim, 'hitDouble', { fade: 0.08 });
  }

  // Cae de rodillas y de cara al barro (queda ahí, con su sangre).
  collapse(victim, wait = 0.5) {
    const r = this.people[victim].r;
    this.later(wait, () => this.act(victim, 'fallFace', { fade: 0.15 }));
    this.later(wait + 1.5, () => this.act(victim, 'deadFace', { loop: true, fade: 0.2 }));
    this.later(wait + 1.3, () => {
      const f = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
      this.g.fx.decal?.(1, { x: r.pos.x + f.x * 1.1, y: r.pos.y + 0.02, z: r.pos.z + f.z * 1.1 }, { x: 0, y: 1, z: 0 }, 1.3);
    });
  }

  // Sellar el pacto: los mata a traición (el canónico).
  scriptKill() {
    const P = this.people;
    return [
      // Gil va hasta Cirilo, que le convida un mate
      [0.2, () => {
        const [x, z] = this.near('cirilo', 'gil', 0.82);
        this.walkTo('gil', x, z, 1.7, { then: 'gilStand', thenO: { look: 0 } });
        this.later(0.9, () => this.act('cirilo', 'offer', { fade: 0.3 }));
        // (del lado sur, de perfil: Gil cruza de derecha a izquierda)
        this.glide(6.5, this.pt(9.7, 8.4, 1.6), this.pt(9.4, 8.7, 1.5), this.pt(8.6, 10.7, 1.35), this.pt(8.2, 10.6, 1.3));
        return 1.8;
      }],
      [0, () => this.say('cirilo', 'Tomá, Antonio. Uno para el camino.')],
      [0.1, () => this.say('gil', 'Gracias, hermano.')],
      // de perfil: el facón sale de abajo del poncho
      [0.2, () => {
        this.quiet();
        // de perfil (del sur): el facón sube y baja a la vista
        const c = P.cirilo.r.pos.clone().lerp(P.gil.r.pos, 0.5);
        this.glide(3.2, this.pt(c.x + 1.2, c.z - 2.0, 1.5), this.pt(c.x + 1.0, c.z - 1.8, 1.45), this.pt(c.x, c.z, 1.3));
        // (los otros dos todavía no entienden)
        return this.strike('cirilo', 'stabOver');
      }],
      [0, () => {
        this.collapse('cirilo', 0.2);
        // el Viejo trastabilla del susto; Benito ya está con las manos arriba
        this.later(0.1, () => {
          this.turn('anacleto', P.gil.r.pos);
          this.act('anacleto', 'stagger', { fade: 0.2 });
        });
        this.later(1.6, () => this.act('anacleto', 'winded', { loop: true, fade: 0.5 }));
        return 1.4;
      }],
      // Benito no entiende y retrocede con las manos arriba
      [0, () => {
        this.turn('benito', P.gil.r.pos, 0.3);
        this.act('benito', 'retreat', { fade: 0.2 });
        this.later(1.45, () => this.act('benito', 'cowerUp', { loop: true, fade: 0.3 }));
        const b = P.benito.r.pos;
        this.glide(3.6, this.pt(b.x + 2.6, b.z - 0.3, 1.55), this.pt(b.x + 2.4, b.z - 0.1, 1.5), this.head('benito', 1.35));
        return this.say('benito', '¿Antonio...? ¿Qué hacés, Antonio?');
      }],
      // Gil se le tira encima
      [0.05, () => {
        this.quiet();
        const [x, z] = this.near('benito', 'gil', 0.85);
        const b = P.benito.r.pos;
        this.glide(2.8, this.pt(b.x + 2.9, b.z - 0.9, 1.25), this.pt(b.x + 2.7, b.z - 0.7, 1.2), this.pt(b.x + 0.5, b.z + 0.4, 1.1));
        // (la punta sale al llegar y la sangre en el cuadro del golpe: antes el
        // 'gilBloody' del final de la corrida tapaba la estocada y la sangre
        // salía 0,4 s después de que llegaba, con el facón ya lejos. El clip
        // arranca a 0,22 s: el golpe, a los 0,5 del clip.
        // globalThis.__mduNoBenitoFix: como antes)
        if (globalThis.__mduNoBenitoFix) {
          this.walkTo('gil', x, z, 0.85, { run: true, then: 'gilBloody' });
          this.later(0.82, () => this.strike('benito', 'stabThrust'));
          return 2;
        }
        this.walkTo('gil', x, z, 0.85, { run: true, then: 'stabThrust', thenO: { loop: false, fade: 0.1, t: 0.22 } });
        // (medido en el juego: la punta llega al pecho 0,36 s después de llegar)
        this.later(0.85 + 0.36, () => this.hit('benito'));
        this.later(0.85 + 0.9, () => this.act('gil', 'gilBloody', { loop: true, fade: 0.5 }));
        return 2;
      }],
      [0, () => {
        this.collapse('benito', 0.2);
        return 1.6;
      }],
      // Anacleto cae de rodillas y le ruega
      [0, () => {
        this.turn('anacleto', P.gil.r.pos, 0.6);
        this.act('anacleto', 'kneelBeg', { fade: 0.3 });
        this.later(1.0, () => this.act('anacleto', 'kneelBegHold', { loop: true, fade: 0.25 }));
        this.glide(5, this.pt(8.35, 11.25, 1.2), this.pt(8.3, 11.45, 1.15), this.head('anacleto', 1.0), this.head('anacleto', 0.9));
        return 0.9;
      }],
      [0, () => this.say('anacleto', '¡Antonio! ¡No! Nosotros te seguimos... desde la guerra...')],
      // Gil camina hasta él; levanta el facón... y a oscuras
      [0.1, () => {
        this.quiet();
        // (por arriba de Anacleto, que no tape el cuadro)
        this.follow(2.8, this.pt(9.7, 14.3, 2.3), this.pt(9.5, 14.2, 2.4), () => this.head('gil', 1.3));
        const [x, z] = this.near('anacleto', 'gil', 0.9);
        this.walkTo('gil', x, z, 2, { then: 'raiseKnife', thenO: { fade: 0.4 } });
        this.later(2.0, () => this.turn('gil', P.anacleto.r.pos, 0.45));
        return 2.6;
      }],
      [0, () => {
        this.fade(true);
        this.later(0.7, () => {
          this.g.audio.knife?.(true);
          this.flash = 1;
          // (en lo negro, pero de a poco: sin saltos)
          this.act('anacleto', 'deadFace', { loop: true, fade: 0.6 });
          this.act('gil', 'gilBloody', { loop: true, fade: 0.6 });
          const r = P.anacleto.r;
          const f = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
          this.g.fx.decal?.(1, { x: r.pos.x + f.x * 1.1, y: r.pos.y + 0.02, z: r.pos.z + f.z * 1.1 }, { x: 0, y: 1, z: 0 }, 1.4);
          this.bloody();
        });
        return 1.9;
      }],
      // Gil solo, ensangrentado, entre los tres
      [0, () => {
        this.fade(false);
        this.turn('gil', this.H, 1.4);
        const g0 = this.head('gil', 1.2);
        // (del lado del árbol: de más al sur se metía en cuadro el farol colorado del claro)
        this.glide(10, this.pt(11.35, 9.1, 2.2), this.pt(11.45, 9.4, 2.5), this.pt(8.7, 10.4, 0.5), g0);
        return 1.6;
      }],
      [0, () => this.say('entidad', 'Ahora sí. Sos mío, Antonio.')],
      [0.3, () => this.say('gil', 'Soy tuyo.')],
      // y otra vez lo que la voz no ve
      [0.4, () => {
        this.quiet();
        this.hlOn = false;
        const g0 = this.head('gil', 1.25);
        this.glide(7, this.pt(10.2, 11, 1.5), this.pt(10, 11.1, 1.45), g0, this.head('gil', 1.35));
        // la hoja, contra el pecho; la cinta: limpia el facón en el poncho
        if (this.hoja) this.act('gil', 'gilHeart', { loop: true, fade: 0.7 });
        else {
          this.act('gil', 'wipeKnife', { fade: 0.5 });
          this.later(2.2, () => this.act('gil', 'gilBloody', { loop: true, fade: 0.4 }));
        }
        this.heart(3);
        return 1.2;
      }],
      [0, () => {
        this.card(this.hoja ? 'Contra el pecho, la hoja del códice. La voz no lo sabe.' : 'En el cabo del facón, una cinta colorada. La voz no la ve.', 5.5);
        return this.think(this.hoja ? 'Esta hoja no te la doy.' : 'Esta cinta no te la doy.') + 3.6;
      }],
      [0, () => {
        this.quiet();
        this.act('gil', 'gilStand', { loop: true, fade: 0.8, look: 0.1 });
        this.hlOn = true;
        const g0 = this.head('gil', 1.2);
        this.glide(9, this.pt(9.9, 13.3, 1.6), this.pt(10.9, 14.6, 2.5), g0, g0.clone().setY(g0.y + 0.4));
        return this.say('entidad', 'Hay muchas almas de gaucho para cosechar. Empezá por las de tus amigos. Guardalas bien... que yo las voy a pedir.');
      }],
      [0.6, () => {
        this.quiet();
        this.hlOn = false;
        this.fade(true);
        return 2.4;
      }],
      [0, () => {
        this.title('El ciclo continúa');
        return 6;
      }],
    ];
  }

  // Negarse: los cuatro juntos echan a la voz.
  scriptSpare() {
    const S = this.spots;
    const P = this.people;
    const gy = S.gil.y;
    return [
      // Gil le apunta al hueco con el facón
      [0.2, () => {
        this.knife.visible = true;
        this.turn('gil', this.H, 0.6);
        this.act('gil', 'pointKnife', { loop: true, fade: 0.5 });
        this.glide(5, this.pt(10.5, 12.6, 1.65), this.pt(10.4, 12.4, 1.6), this.head('gil', 1.5));
        return 0.7;
      }],
      [0, () => this.say('gil', 'No. Ellos no.')],
      [0.2, () => {
        this.glide(5, this.head('gil', 1.8).add(tmpV.set(-1.2, 0.1, 0.7)), this.head('gil', 1.8).add(tmpV.set(-1.4, 0.2, 0.4)), this.H);
        this.hlBoost = 0.4;
        return this.say('entidad', '¿No? Antonio... no sabés lo que estás rechazando.');
      }],
      // los compañeros se le ponen al lado, cada uno a su modo: el Viejo
      // despacio, Cirilo guarda el mate y va tranquilo, Benito duda y después corre
      [0.2, () => {
        this.hlBoost = 0;
        this.walkTo('anacleto', 9.5, 12.2, 2.6, { then: 'stretch' });
        // (el Canchero se toma lo que queda de un trago y revolea el mate)
        this.act('cirilo', 'chug', { fade: 0.3 });
        this.later(1.45, () => this.tossMate('cirilo'));
        this.later(2.2, () => this.walkTo('cirilo', 9.5, 9.7, 1.4, { then: 'cool' }));
        this.later(0.2, () => this.turn('benito', this.spots.gil, 0.25));
        this.later(1.1, () => this.walkTo('benito', 9.5, 8.6, 1.1, { run: true, then: 'cower' }));
        for (const [k, d] of [['anacleto', 2.7], ['cirilo', 3.7], ['benito', 2.3]]) this.later(d, () => this.turn(k, this.H));
        const mid = S.gil.clone().setY(gy + 1.2);
        // (de costado, del lado del árbol: los cuatro en fila frente al hueco)
        this.glide(9, this.pt(12.2, 8.6, 1.8), this.pt(12.0, 8.9, 1.75), this.pt(9.6, 10.6, 1.2), this.pt(9.7, 10.6, 1.2));
        return 3.7;
      }],
      [0, () => {
        this.act('anacleto', 'shakeFist', { loop: true, fade: 0.5 });
        return this.say('anacleto', 'No sé con quién hablás, Antonio. Pero si es contra vos, es contra nosotros.');
      }],
      [0.2, () => {
        // (el Miedoso grita valiente... y se santigua por las dudas)
        this.later(1.4, () => this.act('benito', 'santiguar', { fade: 0.3 }));
        this.later(3.4, () => this.act('benito', 'pray', { loop: true, fade: 0.3 }));
        return this.say('benito', '¡Que se vaya a cantarle a otro árbol!');
      }],
      [0.3, () => {
        this.act('gil', 'knifeUp', { loop: true, fade: 0.35 });
        this.hlBoost = 1;
        this.shake = 1.2;
        this.g.audio.thunder?.(this.H);
        // el trueno: Benito se agacha, el Viejo trastabilla, Cirilo ni se mueve
        this.later(0.1, () => this.act('benito', 'duck', { fade: 0.22 }));
        this.later(1.7, () => this.act('benito', 'cower', { loop: true, fade: 0.4 }));
        this.later(0.25, () => this.act('anacleto', 'stagger', { fade: 0.22 }));
        this.later(1.8, () => this.act('anacleto', 'winded', { loop: true, fade: 0.4 }));
        this.later(0.6, () => this.act('cirilo', 'dust', { fade: 0.3 }));
        this.later(2.2, () => this.act('cirilo', 'cool', { loop: true, fade: 0.3 }));
        this.glide(6, this.pt(7.3, 10.6, 2), this.pt(7.2, 10.9, 2.4), this.H);
        return this.say('entidad', '¡Esto no termina acá, Antonio! ¡Nada termina nunca!');
      }],
      [0.2, () => {
        this.hlOn = false;
        this.hlBoost = 0;
        this.white(true);
        this.later(0.3, () => {
          if (this.egg.huecoGlow) this.egg.huecoGlow.visible = false;
        });
        this.later(1.6, () => this.white(false));
        return 2.4;
      }],
      [0, () => {
        this.act('gil', 'gilStand', { loop: true, fade: 0.6 });
        this.knife.visible = false;
        this.act('anacleto', 'stretch', { loop: true, fade: 0.6 });
        // (del lado del árbol, sin nadie adelante: los cuatro)
        const mid = new THREE.Vector3(9.6, gy + 1.2, 10.6);
        this.glide(6, this.pt(11.4, 10.0, 1.65), this.pt(11.25, 10.3, 1.6), mid, mid);
        return this.say('cirilo', 'Se fue. ¿Se fue? El árbol está... callado.');
      }],
      [0.3, () => this.say('gil', 'Vamos al fogón, muchachos. Esta noche no me hace falta nadie más.')],
      // se van los cuatro juntos, al norte, y el árbol queda a oscuras
      [0.2, () => {
        this.quiet();
        // (cada uno por su carril, sin cruzarse: el que va adelante sigue
        // adelante y a los costados; antes Gil pasaba por adentro de Cirilo y
        // de Benito, a 11 cm. Simulado y medido en el juego: nunca a menos de
        // ~0,9 m. globalThis.__mduNoFogonLanes: como antes)
        if (globalThis.__mduNoFogonLanes) {
          this.walkTo('gil', 10.2, 6.3, 5.5);
          this.later(0.3, () => this.walkTo('cirilo', 11, 6.6, 5.4, { then: 'cool' }));
          this.later(0.9, () => this.walkTo('anacleto', 9.4, 6.9, 5.6, { then: 'stretch' }));
          this.later(1.4, () => this.walkTo('benito', 10.4, 7.4, 3.6, { then: 'nervous' }));
        } else {
          this.walkTo('gil', 11.0, 7.4, 4.6);
          this.later(0.3, () => this.walkTo('cirilo', 10.3, 6.5, 4.2, { then: 'cool' }));
          // (el Viejo, despacio, atrás; el Miedoso, que iba adelante, casi corriendo)
          this.later(0.9, () => this.walkTo('anacleto', 9.4, 7.6, 5.4, { then: 'stretch' }));
          this.later(0.6, () => this.walkTo('benito', 9.3, 6.0, 3.2, { then: 'nervous' }));
        }
        this.follow(8, this.pt(10.6, 13.4, 2.4), this.pt(11.0, 14.5, 2.6), () => this.head('gil', 1).lerp(this.head('benito', 1), 0.5));
        return 5;
      }],
      [0, () => {
        this.fade(true);
        return 2.4;
      }],
      [0, () => {
        this.title('El ciclo se ha roto');
        return 6;
      }],
    ];
  }

  // Gil queda manchado: el poncho oscuro de sangre, las manos y el facón.
  bloody() {
    const a = this.people.gil.a;
    a.M.poncho.color.set(0x3a0404).multiplyScalar(1.7);
    a.M.skin.color.set(0x9a3a2a);
    if (a.M.gaucho) a.M.gaucho.color?.multiplyScalar?.(0.9);
    this.bladeMat.color.set(0x7a1010);
    this.bladeMat.metalness = 0.6;
  }

  // ---------------- la decisión ----------------
  // Sin soltar el mouse ni pausar: 1/2 eligen directo; mover el mouse, la
  // rueda o A/D (flechas) cambian la marcada, y clic, Enter o F la confirman.
  // (Si el mouse no está trabado, los botones también se pueden tocar.)
  buildChoice() {
    const el = document.createElement('div');
    el.className = 'mdu-pacto';
    el.hidden = true;
    const gil = this.egg.isGil();
    el.innerHTML = gil
      ? '<p class="mdu-pacto__q">La voz espera. ¿Qué hace Gil?</p>' +
        '<div class="mdu-pacto__opts"><button data-c="kill"><b>1</b> Sellar el pacto<small>Tres almas de gaucho. Las de ellos.</small></button>' +
        '<button data-c="spare"><b>2</b> Negarse<small>Los cuatro, contra la voz.</small></button></div>' +
        '<p class="mdu-pacto__hint">Mové el mouse (o A / D) para marcar · clic o F para elegir · 1 / 2 directo</p><i class="mdu-pacto__t"></i>'
      : '<p class="mdu-pacto__q">Gil mira el árbol en silencio. Está decidiendo algo.</p><i class="mdu-pacto__t"></i>';
    this.el.appendChild(el);
    this.choiceEl = el;
    this.timeEl = el.querySelector('.mdu-pacto__t');
    this.btns = [...el.querySelectorAll('button')];
    this.btns.forEach((b, i) => {
      b.addEventListener('click', () => this.pick(b.dataset.c));
      b.addEventListener('mouseenter', () => this.mark(i));
    });
    const mine = () => this.waiting && this.egg.isGil() && !this.picked;
    this.onPickKey = (e) => {
      if (!mine()) return;
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.pick('kill');
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.pick('spare');
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.mark(0);
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.mark(1);
      else if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'Space') this.pick(OPTS[this.sel]);
    };
    this.onPickMove = (e) => {
      if (!mine() || !document.pointerLockElement) return;
      this.dx = Math.max(-120, Math.min(120, (this.dx || 0) + e.movementX));
      if (this.dx < -60) this.mark(0);
      else if (this.dx > 60) this.mark(1);
    };
    this.onPickWheel = (e) => {
      if (mine()) this.mark(e.deltaY > 0 ? 1 : 0);
    };
    this.onPickDown = (e) => {
      if (mine() && e.button === 0 && document.pointerLockElement) this.pick(OPTS[this.sel]);
    };
    window.addEventListener('keydown', this.onPickKey);
    document.addEventListener('mousemove', this.onPickMove);
    window.addEventListener('wheel', this.onPickWheel, { passive: true });
    document.addEventListener('mousedown', this.onPickDown);
  }

  mark(i) {
    this.sel = i;
    this.dx = i ? 60 : -60;
    this.btns?.forEach((b, k) => b.classList.toggle('is-sel', k === i));
  }

  openChoice() {
    this.waiting = true;
    this.waitT = 0;
    this.choiceEl.hidden = false;
    this.mark(0);
  }

  // Gil eligió en esta compu: lo manda (el anfitrión lo reparte).
  pick(c) {
    if (!this.waiting || this.picked) return;
    this.picked = true;
    this.egg.choose(c);
  }

  // La elección llega (a todos): sigue la rama.
  choose(c) {
    if (this.choice) return;
    this.choice = c === 'spare' ? 'spare' : 'kill';
    this.waiting = false;
    this.choiceEl.hidden = true;
    const rest = this.choice === 'kill' ? this.scriptKill() : this.scriptSpare();
    this.script = this.script.slice(0, this.step).concat(rest);
    this.next = this.t;
  }

  // Saltar: antes de elegir, hasta la decisión; después, al final.
  skip() {
    if (this.waiting) return;
    if (!this.choice) {
      const i = this.script.length - 1;
      if (this.step < i) {
        this.step = i;
        this.next = this.t;
        this.quiet();
        this.cardEl.style.opacity = '0';
        this.act('gil', 'gilStand', { loop: true, fade: 0.4, look: 0.1 });
        this.hlOn = true;
      }
      return;
    }
    this.finish();
  }

  // Sellar el pacto: la canción de la traición (core/music.js), que sigue en
  // la pantalla del final. Arranca justo en la puñalada a Cirilo: su primer
  // golpe suena a los TRAICION_AT s (lo de antes es silencio).
  betrayalSong() {
    if (this.songOn || this.choice !== 'kill') return;
    this.songOn = true;
    this.g.music?.play('cine-esteros-traicion', { at: TRAICION_AT, while: (G) => G.state === 'won' || !!G.ee?.scene });
  }

  finish() {
    if (this.done) return;
    // (si se corta antes de elegir, vale el canónico)
    const choice = this.choice || 'kill';
    // (salteada antes de la puñalada: igual suena en la pantalla del final)
    if (choice === 'kill') {
      this.choice = 'kill';
      this.betrayalSong();
    }
    const cb = this.onDone;
    this.onDone = () => cb?.(choice);
    super.finish();
  }

  tick(dt, t) {
    const g = this.g;
    this.dtNow = dt;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    for (const p of Object.values(this.people)) this.moveTick(p, dt);
    this.npc.update(dt);
    this.poseAll(dt);
    // el hueco: una luz fría que late cuando la voz habla
    const want = this.hlOn ? 2.2 + Math.sin(t * 2.4) * 0.6 + (this.hlBoost || 0) * 8 : 0;
    this.hl.intensity = lerp(this.hl.intensity, want, Math.min(1, dt * 3));
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.6);
    this.redEl.style.opacity = String(this.flash * 0.8);
    if (this.waiting) {
      this.waitT += dt;
      const left = Math.max(0, CHOOSE_SECS - this.waitT);
      this.timeEl.style.transform = `scaleX(${left / CHOOSE_SECS})`;
      // se acabó el tiempo: vale el canónico (lo manda Gil; si Gil no está, el anfitrión)
      if (left <= 0 && this.egg.isGil()) this.pick('kill');
      if (this.waitT > CHOOSE_SECS + 8 && !g.net?.guest) this.egg.choose('kill');
    }
  }

  // Cada uno con su clip (después de Avatars, que arma la pose de piezas): el
  // cuerpo, las piezas desde los huesos, el facón y el mate de Cirilo en la mano.
  poseAll(dt) {
    const t = this.t;
    for (const p of Object.values(this.people)) {
      const S = p.cc;
      const a = p.a;
      if (!S || !a.gs?.on) continue;
      const c = this.clipOf(S.name);
      if (!c) continue;
      // (si los clips de siempre bajaron recién: desde la pose de piezas que tenía)
      if (!S.snap) {
        S.snap = cineSnap(a);
        S.at = t;
        S.fade = Math.max(S.fade, 0.3);
      }
      S.lt += dt * S.rate;
      const o = { loop: S.loop, look: S.look };
      if (S.snap && t - S.at < S.fade) {
        o.snap = S.snap;
        o.sw = smooth(Math.min(1, (t - S.at) / S.fade));
      }
      const r = p.r;
      if (!poseCineClip(a, c, S.loop ? S.lt : Math.min(S.lt, c.dur), r.pos.x, r.pos.y, r.pos.z, r.yaw + Math.PI, o)) continue;
      // las piezas (y lo que cuelga de la mano: el facón, el mate) al cuerpo nuevo
      a.mats[6].decompose(tmpV, tmpQ, tmpS);
      a.hand.matrix.compose(tmpV, tmpQ, ONE);
      a.hand.matrixWorldNeedsUpdate = true;
      if (a.gun) a.gun.visible = false;
      if (p.key === 'cirilo') this.holdMate(p);
    }
  }

  // El mate de Cirilo parado en su mano (la palma arriba, el antebrazo casi
  // horizontal en los clips): arriba del puño, derecho, con la bombilla para
  // su lado (o para el otro, si lo convida).
  holdMate(p) {
    const a = p.a;
    const mate = a.hand.children[0];
    if (!mate?.visible) return;
    const B = a.gs.bones;
    B.RightHand.getWorldPosition(tmpV);
    B.RightForeArm.getWorldPosition(tmpW);
    tmpW.subVectors(tmpV, tmpW).normalize();
    tmpV.addScaledVector(tmpW, 0.07);
    tmpV.y += 0.04;
    tmpQ.setFromAxisAngle(UP, p.r.yaw + (p.cc?.name === 'offer' ? Math.PI / 2 : Math.PI * 1.5));
    tmpM.compose(tmpV, tmpQ, ONE).premultiply(tmpI.copy(a.group.matrixWorld).multiply(a.hand.matrix).invert());
    tmpM.decompose(mate.position, mate.quaternion, mate.scale);
  }

  // Revolea el mate por arriba del hombro: sale de la mano, da vueltas en el
  // aire y cae atrás, en el pasto.
  tossMate(key) {
    const p = this.people[key];
    const m = p.a.hand.children[0];
    if (!m?.visible) return;
    m.updateWorldMatrix(true, false);
    const c = m.clone();
    m.visible = false;
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.root.add(c);
    const from = c.position.clone();
    const back = tmpV.set(Math.sin(p.r.yaw), 0, Math.cos(p.r.yaw)).multiplyScalar(3.2);
    const to = from.clone().add(back).add(tmpW.set(-Math.cos(p.r.yaw), 0, Math.sin(p.r.yaw)).multiplyScalar(0.8));
    to.y = this.g.world.floorAt(to.x, to.z) + 0.05;
    const q0 = c.quaternion.clone();
    const spin = new THREE.Vector3(Math.cos(p.r.yaw), 0, -Math.sin(p.r.yaw));
    this.anim(1.0, (k) => {
      c.position.lerpVectors(from, to, k);
      c.position.y = lerp(from.y, to.y, k) + 4 * 1.3 * k * (1 - k);
      c.quaternion.copy(q0).premultiply(tmpQ.setFromAxisAngle(spin, k * Math.PI * 3.2));
    });
  }

  // Suelta el mate: cae al barro y queda ahí.
  dropMate(key) {
    const m = this.people[key].a.hand.children[0];
    if (!m?.visible) return;
    m.updateWorldMatrix(true, false);
    const c = m.clone();
    m.visible = false;
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.root.add(c);
    const y0 = c.position.y;
    const y1 = this.g.world.floorAt(c.position.x, c.position.z) + 0.05;
    const q0 = c.quaternion.clone();
    const q1 = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.45));
    this.anim(0.45, (k) => {
      c.position.y = lerp(y0, y1, k * k);
      c.quaternion.slerpQuaternions(q0, q1, k);
    });
  }

  cleanup() {
    const g = this.g;
    if (this.expo0 != null) g.renderer.toneMappingExposure = this.expo0;
    window.removeEventListener('keydown', this.onPickKey);
    document.removeEventListener('mousemove', this.onPickMove);
    window.removeEventListener('wheel', this.onPickWheel);
    document.removeEventListener('mousedown', this.onPickDown);
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (this.hidInteract !== undefined) g.interact.root.visible = this.hidInteract;
    this.npc.dispose();
    // (la luz del hueco es del mapa: queda, apagada)
    if (this.hl === this.egg.cineLight) this.hl.intensity = 0;
  }
}
