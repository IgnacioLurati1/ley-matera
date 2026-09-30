import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import Avatars from '../net/Avatars';
import { EE } from '../config/map';
import { warmScene } from './cineWarm';
import { prefetchTrack } from '../core/music';

// El final de "Mate no Numa" (El Pacto): cayó el Luisón y los cuatro quedan
// al pie del Algarrobo de los Colgados. La voz le habla a Gil (solo él la oye:
// los compañeros no reaccionan) y le pide sellar el pacto con sangre.
// Antes de elegir, un momento que la voz no ve: Gil solo, la mano en el pecho,
// lo que piensa para él (su lealtad no es entera).
// Gil decide (el jugador que es Gil; en línea, solo él), sin soltar el mouse:
//  · sellar el pacto (el canónico): se da vuelta y los mata a traición, uno
//    por uno (Cirilo con el mate en la mano, Benito que retrocede, Anacleto
//    de rodillas). Queda ensangrentado; se guarda algo para él (la hoja del
//    códice, si la arrancó, o la cinta colorada del facón) y se va a cosechar
//    almas de gauchos. "El ciclo continúa".
//  · negarse: le apunta al árbol con el facón, los tres se le ponen al lado y
//    la voz se va con un trueno. Los cuatro se van juntos. "El ciclo se ha roto".
// Los compañeros de la escena son siempre tres (Anacleto, Cirilo y Benito),
// juegue quien juegue. Pasa adentro del juego (EsterosEgg.scene). Todo lo que
// hacen es una pose que se mezcla de a poco (pose/anim), nunca un salto.

const CHOOSE_SECS = 30;
// dónde arranca a sonar la canción de la traición (antes, 0,38 s de nada)
const TRAICION_AT = 0.36;
const MATES = [
  { id: 901, key: 'anacleto', name: 'Anacleto', color: 0x3a6a2a },
  { id: 902, key: 'cirilo', name: 'Cirilo', color: 0x2a3a7a },
  { id: 903, key: 'benito', name: 'Benito', color: 0x7a5a2a },
];
const GIL = { id: 900, key: 'gil', name: 'Antonio Gil', color: 0xb01c14 };
const WHO = { entidad: 'La voz', gil: 'Gil', anacleto: 'Anacleto', cirilo: 'Cirilo', benito: 'Benito', secreto: 'Gil, para sí' };
const OPTS = ['kill', 'spare'];
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpI = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
// (el yaw de Avatars mira hacia -z con yaw 0: de un punto hacia otro)
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;

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
    this.spots = { gil: at(10.1, 10.9), anacleto: at(8, 12.6), cirilo: at(7.6, 10.5), benito: at(8.1, 8.6) };
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
      const person = { r, a, pose: { v: {}, want: {}, speed: 6 } };
      r.poseFn = (Q) => this.applyPose(person.pose, Q);
      this.people[P.key] = person;
    }
    this.face('gil', this.H);
    for (const m of MATES) this.face(m.key, this.spots.gil);
    this.buildKnife();
    // Gil sin el mate: el brazo derecho cae al costado (no apunta a nada)
    this.rest = { shRp: -0.22, elR: -0.35 };
    this.pose('gil', this.rest, 20);
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
    g.post?.sweep?.();
    warmScene(g);
    // (la canción de la traición entra justo con la puñalada: ya bajada)
    prefetchTrack('cine-esteros-traicion');
    return this.script0();
  }

  // El facón de Gil: el cabo en el puño (el antebrazo termina a 0.2 del codo)
  // y la hoja saliendo para adelante del puño; una cinta colorada atada al
  // cabo (la que después va a ser suya).
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
    // la hoja: ancha en el lomo y en punta
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

  // ---------------- poses que se mezclan ----------------
  // Pone partes de la pose de alguien (null las suelta); cada frame se van
  // acercando a lo pedido (speed: qué tan rápido).
  pose(key, fields, speed = 6) {
    const S = this.people[key].pose;
    S.speed = speed;
    for (const [f, v] of Object.entries(fields)) {
      if (v === null) delete S.want[f];
      else S.want[f] = v;
    }
  }

  // Suelta toda la pose pedida (vuelve de a poco a la de siempre).
  unpose(key, speed = 4) {
    const S = this.people[key].pose;
    S.speed = speed;
    S.want = {};
  }

  // (Avatars: después de la pose de siempre, esta encima)
  applyPose(S, Q) {
    const k = Math.min(1, this.dtNow * S.speed);
    for (const f of Object.keys(S.v)) {
      const base = Q[f] ?? 0;
      const goal = f in S.want ? S.want[f] : base;
      S.v[f] += (goal - S.v[f]) * k;
      Q[f] = S.v[f];
      if (!(f in S.want) && Math.abs(S.v[f] - base) < 0.005) delete S.v[f];
    }
    for (const f of Object.keys(S.want)) if (!(f in S.v)) S.v[f] = Q[f] ?? 0;
  }

  // Algo que pasa en el tiempo: fn(k) de 0 a 1.
  anim(dur, fn, done) {
    this.anims.push({ t: 0, dur, fn, done });
  }

  face(key, target) {
    const r = this.people[key].r;
    r.yaw = yawTo(r.pos, target);
  }

  turn(key, target, dur = 0.5) {
    const r = this.people[key].r;
    const y0 = r.yaw;
    const y1 = yawTo(r.pos, target);
    this.anim(dur, (k) => (r.yaw = angLerp(y0, y1, smooth(k))));
  }

  // Camina (o corre) hasta un punto; look: mirando a otro lado (retroceder).
  walk(key, x, z, dur, look = null) {
    const r = this.people[key].r;
    const from = r.pos.clone();
    const to = this.at(x, z);
    const d = from.distanceTo(to);
    r.moving = true;
    r.speed = Math.min(6.5, (d / dur) * 1.1);
    const y0 = r.yaw;
    this.anim(
      dur,
      (k) => {
        r.pos.lerpVectors(from, to, smooth(k));
        r.pos.y = this.g.world.floorAt(r.pos.x, r.pos.z);
        r.yaw = angLerp(y0, yawTo(look ? r.pos : from, look || to), Math.min(1, k * 4));
      },
      () => {
        r.moving = false;
        r.speed = 0;
      },
    );
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
  // (no se llama cam: this.cam es la toma de CastleCine)
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
    const mid = S.gil.clone().lerp(S.cirilo, 0.5);
    return [
      [0, () => {
        this.fade(false);
        this.glide(9, this.pt(7.9, 14.3, 1.9), this.pt(8.6, 14, 1.7), mid.clone().setY(mid.y + 1.2), H.clone().setY(H.y - 0.2));
        // Cirilo ceba, Benito se sacude el barro
        this.pose('cirilo', { shRp: -1.1, elR: -1.2, headP: 0.15 }, 3);
        return 0.8;
      }],
      [0, () => this.say('anacleto', 'Se terminó, Antonio. El bicho está muerto.')],
      [0.2, () => this.say('cirilo', 'Vamos al fogón. Hay mate, y hay que secarse antes de que amanezca.')],
      [0.2, () => this.say('benito', '¿Y la voz, Antonio? Esa que oías... ¿se fue?')],
      [0.3, () => {
        // Gil mira el árbol; el hueco se prende
        this.quiet();
        this.hlOn = true;
        this.glide(7, this.head('gil', 1.5).add(tmpV.set(-1.6, 0.1, 1.2)), this.head('gil', 1.5).add(tmpV.set(-1.1, 0, 0.7)), H, H);
        this.pose('gil', { headP: -0.12 }, 2);
        return 1.6;
      }],
      [0, () => this.say('entidad', 'Bien hecho, Antonio. Casi terminamos.')],
      [0.2, () => this.say('entidad', 'Tus compañeros vieron demasiado. Oyeron cosas. Saben dónde está el hueco.')],
      [0.2, () => {
        this.glide(9, this.pt(11.1, 8, 1.8), this.pt(11, 12.7, 1.7), this.head('cirilo', 1.2));
        this.pose('cirilo', { shRp: null, elR: null, headP: null }, 3);
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
        this.pose('gil', { headP: 0.35, shLp: -0.6, shLr: 0.42, elL: -2.25, torsoP: 0.1 }, 2.5);
        this.heart(4);
        return 1.6;
      }],
      [0, () => this.think('Te voy a dar lo que pedís. Pero hay algo que no te voy a dar nunca.')],
      [0.3, () => {
        this.unpose('gil', 2.5);
        this.pose('gil', { ...this.rest, headP: -0.1 }, 2.5);
        this.hlOn = true;
        this.glide(4, this.head('gil', 1.5).add(tmpV.set(-1.4, 0.1, 1)), this.head('gil', 1.5).add(tmpV.set(-1.2, 0, 0.8)), H, H);
        return this.say('entidad', '¿Antonio? Te estoy esperando.');
      }],
      [0.2, () => {
        // la decisión: la escena espera a Gil
        this.quiet();
        this.glide(CHOOSE_SECS + 10, this.pt(11.3, 12.5, 1.7), this.pt(11.1, 9.2, 1.8), this.head('gil', 1.5));
        this.openChoice();
        return 9999;
      }],
    ];
  }

  // ---- los golpes ----
  // Gil levanta el facón y lo clava: el golpe llega a los 0.5 s. over: de
  // arriba (si no, de punta, a la altura del pecho).
  strike(victim, over = true) {
    this.knife.visible = true;
    this.turn('gil', this.people[victim].r.pos, 0.25);
    this.pose('gil', over ? { shRp: -2.75, shRr: -0.15, elR: -0.7, torsoP: -0.12, headP: 0.05 } : { shRp: -0.75, shRr: 0, elR: -1.9, torsoP: -0.05, torsoY: 0.35 }, 11);
    this.later(0.36, () => this.pose('gil', over ? { shRp: -1.05, elR: -0.1, torsoP: 0.42, torsoY: -0.15, headP: 0.2 } : { shRp: -1.5, elR: -0.05, torsoP: 0.3, torsoY: -0.3, headP: 0.1 }, 24));
    this.later(0.5, () => this.hit(victim));
    this.later(1.05, () => this.pose('gil', { shRp: -0.8, shRr: null, elR: -0.7, torsoP: 0.12, torsoY: 0, headP: 0.12 }, 4));
    return 1.1;
  }

  hit(victim) {
    const g = this.g;
    const p = this.people[victim];
    const r = p.r;
    const G = this.people.gil.r;
    const chest = r.pos.clone().setY(r.pos.y + 1.25);
    const dir = tmpW.copy(r.pos).sub(G.pos).setY(0.2).normalize();
    g.fx.blood?.(chest, dir, 20, 1.4);
    g.audio.knife?.(true);
    // la canción de la traición entra con la primera puñalada (no al elegir)
    this.betrayalSong();
    this.flash = 1;
    this.shake = 0.45;
    // el golpe lo dobla: la mano al pecho y se le cae el mate
    this.dropMate(victim);
    this.pose(victim, { torsoP: 0.55, headP: 0.4, shLp: -1, shLr: 0.5, elL: -1.9, shRp: -0.8, elR: -1.4, hipY: 0.86 }, 14);
  }

  // Cae: de rodillas y de cara al barro (queda ahí, con su sangre).
  collapse(victim, wait = 0.5) {
    const r = this.people[victim].r;
    this.later(wait, () => this.pose(victim, { hipY: 0.5, knL: 1.55, knR: 1.5, hipLp: -0.05, hipRp: 0.05, torsoP: 0.35 }, 7));
    this.later(wait + 0.6, () => this.pose(victim, { rootPitch: 1.45, rootY: r.pos.y + 0.13, hipY: 0.93, knL: 0.15, knR: 0.3, hipLp: 0, hipRp: 0, torsoP: 0.08, headP: -0.25, shLp: -2.5, shLr: 0.2, elL: -0.3, shRp: -0.4, elR: -0.3 }, 4.5));
    this.later(wait + 1.3, () => {
      const f = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
      this.g.fx.decal?.(1, { x: r.pos.x + f.x * 1.1, y: r.pos.y + 0.02, z: r.pos.z + f.z * 1.1 }, { x: 0, y: 1, z: 0 }, 1.3);
    });
  }

  // Muerto de una (lo que pasó a oscuras).
  lie(victim) {
    const r = this.people[victim].r;
    const S = this.people[victim].pose;
    S.want = { rootPitch: 1.45, rootY: r.pos.y + 0.13, hipY: 0.93, knL: 0.15, knR: 0.3, torsoP: 0.08, headP: -0.25, shLp: -2.5, shRp: -0.4, elL: -0.3, elR: -0.3 };
    S.v = { ...S.want };
    this.people[victim].a.hand.children[0].visible = false;
    const f = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
    this.g.fx.decal?.(1, { x: r.pos.x + f.x * 1.1, y: r.pos.y + 0.02, z: r.pos.z + f.z * 1.1 }, { x: 0, y: 1, z: 0 }, 1.4);
  }

  // Sellar el pacto: los mata a traición (el canónico).
  scriptKill() {
    const P = this.people;
    return [
      // Cirilo le trae un mate; Gil se da vuelta
      [0.2, () => {
        this.walk('cirilo', 9.05, 10.75, 1.3);
        this.pose('cirilo', { shRp: -1.3, elR: -0.35 }, 3);
        P.cirilo.offer = true;
        this.turn('gil', this.at(9.05, 10.75), 0.9);
        this.glide(6.5, this.pt(9.2, 13.1, 1.6), this.pt(9.6, 12.7, 1.5), this.pt(9.6, 10.85, 1.35));
        return 1.4;
      }],
      [0, () => this.say('cirilo', 'Tomá, Antonio. Uno para el camino.')],
      [0.1, () => {
        this.pose('gil', { shLp: -1.05, elL: -0.5 }, 4);
        return this.say('gil', 'Gracias, hermano.');
      }],
      // de perfil: el facón sale de abajo del poncho
      [0.2, () => {
        this.quiet();
        this.glide(3.2, this.pt(9.55, 12.6, 1.45), this.pt(9.5, 12.3, 1.4), this.pt(9.55, 10.8, 1.3));
        this.pose('gil', { shLp: null, elL: null }, 4);
        return this.strike('cirilo', true);
      }],
      [0, () => {
        this.collapse('cirilo', 0.4);
        return 1.5;
      }],
      // Benito no entiende y retrocede con las manos arriba
      [0, () => {
        this.glide(3.2, this.pt(10.6, 8.2, 1.55), this.pt(10.5, 8.45, 1.5), this.head('benito', 1.35));
        this.pose('benito', { shLp: -2.4, shRp: -2.4, elL: -0.5, elR: -0.5, headP: -0.05, torsoP: -0.1 }, 6);
        this.dropMate('benito');
        this.walk('benito', 8.5, 7.5, 1.8, P.gil.r.pos);
        return this.say('benito', '¿Antonio...? ¿Qué hacés, Antonio?');
      }],
      // Gil se le tira encima
      [0.05, () => {
        this.quiet();
        this.glide(2.8, this.pt(11.3, 7.6, 1.25), this.pt(11.1, 7.9, 1.2), this.pt(8.9, 7.9, 1.1));
        this.walk('gil', 9.2, 8.2, 0.55);
        this.later(0.5, () => this.strike('benito', false));
        return 1.6;
      }],
      [0, () => {
        this.collapse('benito', 0.3);
        return 1.6;
      }],
      // Anacleto cae de rodillas y le ruega
      [0, () => {
        this.face('anacleto', P.gil.r.pos);
        this.pose('anacleto', { hipY: 0.52, knL: 1.55, knR: 1.55, shLp: -1.35, shRp: -1.35, elL: -0.25, elR: -0.25, headP: -0.35 }, 5);
        this.dropMate('anacleto');
        this.glide(5, this.pt(8.35, 11.25, 1.2), this.pt(8.3, 11.45, 1.15), this.head('anacleto', 1.0), this.head('anacleto', 0.95));
        return 0.6;
      }],
      [0, () => this.say('anacleto', '¡Antonio! ¡No! Nosotros te seguimos... desde la guerra...')],
      // Gil camina hasta él; levanta el facón... y a oscuras
      [0.1, () => {
        this.quiet();
        this.follow(2.6, this.pt(9.3, 13.6, 1.9), this.pt(9.1, 13.5, 2), () => this.head('gil', 1.3));
        this.walk('gil', 8.35, 11.55, 1.8);
        this.later(1.9, () => this.pose('gil', { shRp: -2.8, elR: -0.7, torsoP: -0.12 }, 9));
        return 2.3;
      }],
      [0, () => {
        this.fade(true);
        this.later(0.7, () => {
          this.g.audio.knife?.(true);
          this.flash = 1;
          this.lie('anacleto');
          this.pose('gil', { shRp: -0.8, elR: -0.7, torsoP: 0.15 }, 5);
          this.bloody();
        });
        return 1.9;
      }],
      // Gil solo, ensangrentado, entre los tres
      [0, () => {
        this.fade(false);
        this.face('gil', this.H);
        const g0 = this.head('gil', 1.2);
        this.glide(10, this.pt(11, 9, 2.4), this.pt(11.2, 9.6, 2.9), this.pt(8.7, 10.4, 0.5), g0);
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
        this.pose('gil', { headP: 0.35, shLp: -0.6, shLr: 0.42, elL: -2.25, torsoP: 0.1 }, 2.5);
        this.heart(3);
        return 1.2;
      }],
      [0, () => {
        this.card(this.hoja ? 'Contra el pecho, adentro del poncho, Gil aprieta la hoja que le arrancó al códice. La voz no lo sabe.' : 'Gil limpia el facón en el poncho. En el cabo, atada, una cinta colorada. La voz no la ve.', 5.5);
        return this.think(this.hoja ? 'Esta hoja no te la doy.' : 'Esta cinta no te la doy.') + 3.6;
      }],
      [0, () => {
        this.quiet();
        this.unpose('gil', 2);
        this.hlOn = true;
        const g0 = this.head('gil', 1.2);
        this.glide(9, this.pt(9.9, 13.3, 1.6), this.pt(7.4, 15.8, 6.8), g0, g0.clone().setY(g0.y + 0.6));
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
    const gy = S.gil.y;
    return [
      // Gil le apunta al hueco con el facón
      [0.2, () => {
        this.knife.visible = true;
        this.turn('gil', this.H, 0.4);
        this.glide(5, this.pt(11.2, 11.5, 1.65), this.pt(11.15, 11.3, 1.6), this.head('gil', 1.5));
        this.pose('gil', { shRp: -1.5, shRr: 0.05, elR: -0.08, headP: -0.05 }, 4);
        return 0.7;
      }],
      [0, () => this.say('gil', 'No. Ellos no.')],
      [0.2, () => {
        this.glide(5, this.head('gil', 1.8).add(tmpV.set(-1.2, 0.1, 0.7)), this.head('gil', 1.8).add(tmpV.set(-1.4, 0.2, 0.4)), this.H);
        this.hlBoost = 0.4;
        return this.say('entidad', '¿No? Antonio... no sabés lo que estás rechazando.');
      }],
      // los compañeros se le ponen al lado, mirando el árbol
      [0.2, () => {
        this.hlBoost = 0;
        for (const [k, x, z, d] of [['anacleto', 9.5, 12.2, 1.6], ['cirilo', 9.5, 9.7, 1.3], ['benito', 9.5, 8.6, 1.5]]) {
          this.walk(k, x, z, d);
          this.later(d + 0.05, () => this.turn(k, this.H, 0.4));
        }
        const mid = S.gil.clone().setY(gy + 1.2);
        this.glide(9, this.pt(11.3, 8.4, 1.5), this.pt(11.5, 13.2, 1.6), mid, mid);
        return 2.2;
      }],
      [0, () => this.say('anacleto', 'No sé con quién hablás, Antonio. Pero si es contra vos, es contra nosotros.')],
      [0.2, () => this.say('benito', '¡Que se vaya a cantarle a otro árbol!')],
      [0.3, () => {
        for (const k of ['anacleto', 'cirilo', 'benito']) this.pose(k, { shRp: -2.6, elR: -0.15, shLp: -0.3, headP: -0.15 }, 5);
        this.pose('gil', { shRp: -2.7, elR: -0.1 }, 5);
        this.hlBoost = 1;
        this.shake = 1.2;
        this.g.audio.thunder?.(this.H);
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
        for (const k of ['gil', 'anacleto', 'cirilo', 'benito']) this.unpose(k, 3);
        this.knife.visible = false;
        const mid = S.gil.clone().setY(gy + 1.3);
        this.glide(6, this.pt(11.2, 12.6, 1.6), this.pt(11, 12.9, 1.7), mid, mid);
        return this.say('cirilo', 'Se fue. ¿Se fue? El árbol está... callado.');
      }],
      [0.3, () => this.say('gil', 'Vamos al fogón, muchachos. Esta noche no me hace falta nadie más.')],
      // se van los cuatro juntos, al norte, y el árbol queda a oscuras
      [0.2, () => {
        this.quiet();
        for (const [k, x, z] of [['gil', 10.2, 6.3], ['anacleto', 9.4, 6.9], ['cirilo', 11, 6.6], ['benito', 10.4, 7.4]]) this.walk(k, x, z, 5.5);
        this.follow(8, this.pt(9.8, 12.6, 1.7), this.pt(8.2, 14.2, 4.2), () => this.head('gil', 1).lerp(this.head('benito', 1), 0.5));
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
        this.unpose('gil', 8);
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
    this.npc.update(dt);
    for (const m of MATES) this.holdMate(this.people[m.key]);
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

  // El mate parado en la mano. La mano sigue al antebrazo, que casi nunca
  // está vertical, y el mate quedaba acostado o boca abajo: acá se lo pone
  // derecho arriba del puño, con la bombilla para el lado del que lo tiene
  // (o para el otro, si lo está convidando).
  holdMate(p) {
    const hand = p.a.hand;
    const mate = hand.children[0];
    if (!mate?.visible) return;
    const at = tmpV.set(0, -0.2, 0).applyMatrix4(hand.matrix);
    at.y += 0.1;
    tmpQ.setFromAxisAngle(UP, p.r.yaw + (p.offer ? Math.PI / 2 : Math.PI * 1.5));
    tmpM.compose(at, tmpQ, ONE).premultiply(tmpI.copy(hand.matrix).invert());
    tmpM.decompose(mate.position, mate.quaternion, mate.scale);
  }

  // Suelta el mate: cae al barro y queda ahí (el que levanta las manos, el
  // que ruega, el que recibe el golpe).
  dropMate(key) {
    const m = this.people[key].a.hand.children[0];
    if (!m.visible) return;
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
