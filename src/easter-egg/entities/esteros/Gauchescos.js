import * as THREE from 'three';
import { EE } from '../../config/map';
import { GZ, GZ_LADDER, GZ_SHOTS } from '../../config/gauchescos';
import { WEAPONS } from '../../config/weapons';
import { PLAYER } from '../../config/rules';
import ZombieHands from './gzHands';
import '../../ui/gauchescos.css';

// Zombies gauchescos (el usuario, 2026-10-13): el Convertido de Black Ops 2
// en Mate no Numa. Se elige en el menú como el Challenge de la torre (config/map.js
// MAP_MODES); se juega en línea, de a dos o más. Hace de easter egg (g.ee) y
// queda en g.gz para los pocos lugares que lo miran (Zombies, Avatars,
// Player, Game).
//  · Al arrancar todos son zombis, cada uno en un lugar de la lista
//    (config/maps/esteros.js gauchescos()), y la cura flota en la isleta. El
//    primero que la toca es el humano.
//  · El humano tira con el mate de la escalera (config/gauchescos.js) en el
//    que quedó: cada zombi que baja lo pasa al siguiente.
//  · El zombi que le pega al humano pasa a ser el humano (sigue desde SU
//    mate) y el que era humano queda zombi, guardando el suyo. El humano nuevo
//    aparece en el lugar de la lista más lejos de los demás (el usuario, por el
//    coordinador: "para evitar morir instantáneamente"), con un fundido.
//  · Los zombis son jugadores: solo zarpazos, más rápidos que el humano y
//    cruzan la paja como el Luisón. En primera persona, manos de zombi
//    (entities/esteros/gzHands.js); los demás los ven con el cuerpo y los
//    andares de los muertos de siempre (un lugar del pool de Zombies que no
//    piensa: lo mueve este archivo con lo que manda su compu).
//  · El zombi que cae vuelve a los GZ.respawn s en el lugar más lejos del humano.
//  · Gana el primero que llega al último mate o, a los GZ.time s, el que más
//    avanzó (empate: más bajas). Pantalla con el orden y a volver al menú.
// En línea lo decide el anfitrión (la cura, las conversiones, las bajas, el
// reloj y los lugares) y lo manda entero ('pee' {gz}); cada uno avisa lo suyo
// (su zarpazo que pegó, su baja). Nada se guarda.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const SKIP_CORN = { skip: 'corn' };
// los lugares del pool que son jugadores (para el aspecto: uno por jugador)
const PUPPET_ID = 0x7f00;
// el zombi que vuelve sale de la tierra (s); quieto mientras tanto
const RISE = 1.2;
// el caído queda tirado y después se hunde
const SINK_AT = 1.8;
const SINK = 1.0;
// el fundido del que aparece en otro lugar (sale, se mueve, entra)
const TP_OUT = 0.3;
const TP_IN = 0.6;
// a cuánto se toma la cura (m)
const CURE_R = 1.4;
// la cura: altura y vaivén
const CURE_Y = 1.15;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

export default class Gauchescos {
  constructor(game) {
    this.g = game;
    game.gz = this;
    // (lo que los demás esperan de un easter egg: acá no hay pasos)
    this.step = 0;
    this.scene = null;
    this.fight = false;
    this.startPoints = 0;
    const C = EE.gz;
    const W = game.world;
    this.spots = C.spots.map(([x, z]) => new THREE.Vector3(x, W.floorAt(x, z, 2), z));
    this.curePos = new THREE.Vector3(C.cure[0], W.floorAt(C.cure[0], C.cure[1], 2), C.cure[1]);
    // lo que decide el anfitrión
    this.phase = 'wait';
    this.human = -1;
    this.left = GZ.time;
    this.P = new Map();
    this.winner = -1;
    this.board = null;
    // lo de esta compu
    this.role = null;
    this.puppets = new Map();
    this.seenTp = new Map();
    this.pend = new Map();
    this.tp = null;
    this.deadMe = false;
    this.riseT = 0;
    this.swingT = -1;
    this.swingCd = 0;
    this.swingHit = false;
    this.started = false;
    this.syncT = 0;
    this.hands = new ZombieHands(game);
    this.buildCure();
    this.buildHud();
    // la paja tapa la vista pero no los tiros (si no, el zombi metido en el
    // pajonal era invulnerable y llegaba al humano siempre)
    for (const b of game.world.boxes) if (b.kind === 'corn') b.shoot = false;
    // la luz prendida y todo abierto: no hay nada que comprar
    game.world.setPower(true);
    game.interact.setPowerVisuals(true);
  }

  // ---------------- para los demás archivos ----------------
  // ¿soy zombi? (Game: sin mates ni compras; Player: más rápido y por la paja)
  get zombie() {
    return this.role === 'zombie';
  }
  get speedMul() {
    return this.role === 'zombie' ? GZ.zombieSpeed : 1;
  }
  get coll() {
    return this.role === 'zombie' ? SKIP_CORN : undefined;
  }
  // nadie se lastima con nada (el zarpazo convierte; los tiros, bajas)
  safe() {
    return true;
  }
  noTarget() {
    return true;
  }
  // net/Avatars: el gaucho de un jugador que es zombi (o que está apareciendo
  // en otro lado) no se dibuja
  hideAvatar(a, r) {
    const id = r.id;
    if (!this.P.has(id)) return false;
    if (id !== this.human || this.pend.has(id)) {
      a.group.visible = false;
      a.tag.visible = false;
      return true;
    }
    return false;
  }

  myId() {
    return this.g.net?.id ?? 0;
  }
  ids() {
    const g = this.g;
    return g.net ? [this.myId(), ...g.net.remote.keys()] : [0];
  }
  nameOf(id) {
    const g = this.g;
    return g.net ? g.net.nameOf(id) : 'Vos';
  }
  posOf(id) {
    const g = this.g;
    if (id === this.myId()) return g.player.pos;
    return g.net?.remote.get(id)?.pos || null;
  }
  isHost() {
    return !this.g.net?.guest;
  }

  // ---------------- la cura ----------------
  // Un frasquito de agua bendita del estero, verde y dorado, que flota a la
  // altura del pecho dando vueltas despacio, con un halo y un haz de luz que
  // sube (se ve de lejos) y un tintineo cada tanto.
  buildCure() {
    const g = this.g;
    const root = new THREE.Group();
    root.position.copy(this.curePos);
    root.visible = false;
    g.scene.add(root);
    this.cure = root;
    const vial = new THREE.Group();
    root.add(vial);
    this.vial = vial;
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8d8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
    const liquid = new THREE.MeshStandardMaterial({ color: 0x6dff8a, emissive: 0x3cff6a, emissiveIntensity: 1.6, roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.8, roughness: 0.3, emissive: 0x4a3008, emissiveIntensity: 0.6 });
    const cork = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 });
    const prof = [[0, 0], [0.11, 0.01], [0.13, 0.08], [0.12, 0.2], [0.06, 0.27], [0.045, 0.34], [0.05, 0.37]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), glass);
    vial.add(body);
    const inner = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(0, 4).map((v) => new THREE.Vector2(v.x * 0.86, v.y * 0.95 + 0.005)), 16), liquid);
    vial.add(inner);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 12), cork);
    cap.position.y = 0.39;
    vial.add(cap);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.012, 8, 24), gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.12;
    vial.add(band);
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 18), gold);
    neck.rotation.x = Math.PI / 2;
    neck.position.y = 0.34;
    vial.add(neck);
    vial.position.y = CURE_Y - 0.18;
    vial.scale.setScalar(1.6);
    // el halo (siempre mirando a la cámara) y el haz
    const dot = g.textures.dot;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x7dffa0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(1.1);
    this.halo.position.y = CURE_Y;
    root.add(this.halo);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x5aff86, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 14, 12, 1, true), beamMat);
    this.beam.position.y = 7;
    root.add(this.beam);
    // el círculo en el piso
    const ringMat = new THREE.MeshBasicMaterial({ map: dot, color: 0x5aff86, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), ringMat);
    this.ring.position.y = 0.06;
    root.add(this.ring);
    this.cureK = 0;
    this.cureOut = -1;
    this.chimeT = 0.5;
  }

  // Dónde está ahora (da vueltas despacio alrededor de su lugar).
  cureNow(out) {
    const t = this.g.time;
    return out.set(this.curePos.x + Math.sin(t * 0.35) * 0.4, this.curePos.y + CURE_Y, this.curePos.z + Math.cos(t * 0.35) * 0.4);
  }

  updateCure(dt) {
    const g = this.g;
    const want = this.phase === 'cure';
    if (want && this.cureOut < 0) this.cureK = Math.min(1, this.cureK + dt / 1.1);
    const root = this.cure;
    // al tomarla: se achica y se va hacia el que la tomó
    if (this.cureOut >= 0) {
      this.cureOut += dt;
      const k = clamp01(this.cureOut / 0.45);
      this.cureK = 1 - k;
      if (k >= 1) {
        this.cureOut = -1;
        this.cureK = 0;
      }
    } else if (!want) this.cureK = Math.max(0, this.cureK - dt / 0.5);
    root.visible = this.cureK > 0.001;
    if (!root.visible) return;
    const t = g.time;
    const e = smooth(this.cureK);
    this.cureNow(tmpV);
    root.position.set(tmpV.x, this.curePos.y, tmpV.z);
    // (entra subiendo de la tierra; sale achicándose)
    this.vial.position.y = CURE_Y - 0.18 + Math.sin(t * 1.8) * 0.08 - (1 - e) * 0.8;
    this.vial.rotation.y += dt * 1.1;
    this.vial.rotation.z = Math.sin(t * 1.3) * 0.12;
    this.vial.scale.setScalar(1.6 * Math.max(0.05, e));
    this.halo.position.y = this.vial.position.y + 0.3;
    // (de cerca el halo y el haz se apagan: tapaban la pantalla)
    const near = clamp01((g.camera.position.distanceTo(tmpV) - 1.5) / 5);
    this.halo.material.opacity = (0.45 + Math.sin(t * 3.2) * 0.12) * e * (0.35 + 0.65 * near);
    this.halo.scale.setScalar(1.05 + Math.sin(t * 3.2) * 0.1);
    this.beam.material.opacity = (0.16 + Math.sin(t * 2) * 0.04) * e * near;
    this.ring.material.opacity = (0.3 + Math.sin(t * 2.5) * 0.08) * e;
    this.ring.scale.setScalar(0.9 + Math.sin(t * 2.5) * 0.08);
    // el tintineo (se oye de dónde viene)
    if (this.phase === 'cure' && this.cureOut < 0) {
      this.chimeT -= dt;
      if (this.chimeT <= 0) {
        this.chimeT = 2.2;
        const A = g.audio;
        if (A?.out) {
          const o = A.out({ pos: tmpV, reverb: 0.4, gain: 0.9 });
          A.bell(o, A.now, 88, { gain: 0.07, dur: 1.6 });
          A.bell(o, A.now + 0.12, 95, { gain: 0.05, dur: 1.4 });
        }
      }
    }
    if (Math.random() < dt * 10) g.fx.sparkle(tmpW.copy(tmpV).setY(tmpV.y + 0.2), [0.5, 1, 0.6], 1, 0.5);
  }

  // ---------------- el panel ----------------
  buildHud() {
    const g = this.g;
    const el = document.createElement('div');
    el.className = 'mdu-gz';
    el.innerHTML = '<div class="mdu-gz__clock"></div><div class="mdu-gz__who"></div><div class="mdu-gz__me"><span class="mdu-gz__k">Tu mate</span><b></b><em></em></div>';
    g.hud.root.appendChild(el);
    g.hud.root.classList.add('is-gz');
    this.hudEl = el;
    this.hudKey = '';
    const veil = document.createElement('div');
    veil.className = 'mdu-gz-veil';
    g.hud.root.appendChild(veil);
    this.veil = veil;
  }

  // El velo de la pantalla: un color y hacia qué opacidad, en cuánto.
  setVeil(color, to, secs) {
    const v = this.veil;
    v.style.transition = `opacity ${secs}s ease`;
    if (color) v.style.background = color;
    v.style.opacity = String(to);
  }

  updateHud() {
    const g = this.g;
    const me = this.myId();
    const s = this.P.get(me);
    const lv = s ? s.lv : 0;
    const secs = Math.max(0, Math.ceil(this.left));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const who = this.phase === 'cure' ? 'La cura' : this.human === me ? 'Sos el humano' : this.human >= 0 ? `Humano: ${this.nameOf(this.human)}` : '';
    const id = GZ_LADDER[Math.min(lv, GZ_LADDER.length - 1)];
    const key = `${clock}|${who}|${lv}|${this.role}|${this.phase}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const el = this.hudEl;
    el.hidden = this.phase === 'wait' || this.phase === 'end';
    el.querySelector('.mdu-gz__clock').textContent = clock;
    el.classList.toggle('is-low', secs <= 30);
    const w = el.querySelector('.mdu-gz__who');
    w.textContent = who;
    w.classList.toggle('is-me', this.human === me);
    el.querySelector('.mdu-gz__me b').textContent = WEAPONS[id]?.name || id;
    el.querySelector('.mdu-gz__me em').textContent = `${lv + 1}/${GZ_LADDER.length}`;
    el.classList.toggle('is-zombie', this.role === 'zombie');
    g.hud.root.classList.toggle('is-gz-z', this.role === 'zombie' || this.phase === 'end');
  }

  // ---------------- el anfitrión ----------------
  hostStart() {
    const ids = this.ids();
    // (otra partida: el salto de lugar sigue contando, así cada uno se va al suyo)
    const prevTp = new Map([...this.P].map(([id, s]) => [id, s.tp || 0]));
    this.P.clear();
    this.phase = 'cure';
    this.human = -1;
    this.left = GZ.time;
    this.winner = -1;
    this.board = null;
    // cada uno en un lugar distinto, todos más o menos igual de lejos de la cura
    const c = this.curePos;
    const order = this.spots.map((p, i) => ({ i, d: Math.hypot(p.x - c.x, p.z - c.z) })).filter((o) => o.d > 12).sort((a, b) => a.d - b.d);
    const used = [];
    for (const id of ids) {
      // el primero libre lejos de los ya elegidos
      let pick = order.find((o) => !used.includes(o.i) && used.every((u) => this.spots[u].distanceTo(this.spots[o.i]) > 14)) || order.find((o) => !used.includes(o.i)) || order[0];
      used.push(pick.i);
      this.P.set(id, { lv: 0, k: 0, dead: 0, tp: (prevTp.get(id) || 0) + 1, spot: pick.i, until: 0 });
    }
    this.share({ k: 'start' });
  }

  // El lugar de la lista más lejos de los demás (de todos, o solo del humano).
  farSpot(id, onlyHuman = false) {
    const others = [];
    for (const o of this.P.keys()) {
      if (o === id) continue;
      if (onlyHuman && o !== this.human) continue;
      const p = this.posOf(o);
      if (p) others.push(p);
    }
    if (!others.length) return Math.floor(Math.random() * this.spots.length);
    let best = 0;
    let bestD = -1;
    this.spots.forEach((s, i) => {
      let d = Infinity;
      for (const p of others) d = Math.min(d, Math.hypot(p.x - s.x, p.z - s.z));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  teleport(id, spot) {
    const s = this.P.get(id);
    if (!s) return;
    s.tp++;
    s.spot = spot;
    s.until = this.g.time + TP_OUT + TP_IN + 0.4;
  }

  inTransit(id) {
    const s = this.P.get(id);
    return !s || this.g.time < s.until;
  }

  hostTick(dt) {
    const g = this.g;
    // los que entran tarde (zombis, lejos del humano) y los que se van
    const ids = this.ids();
    let changed = false;
    for (const id of ids) {
      if (this.P.has(id)) continue;
      this.P.set(id, { lv: 0, k: 0, dead: 0, tp: 0, spot: 0, until: 0 });
      this.teleport(id, this.farSpot(id, true));
      changed = true;
    }
    for (const id of [...this.P.keys()]) {
      if (ids.includes(id)) continue;
      this.P.delete(id);
      changed = true;
      // (se fue el humano: vuelve la cura)
      if (id === this.human && this.phase === 'play') {
        this.human = -1;
        this.phase = 'cure';
      }
    }
    if (this.phase === 'cure' || this.phase === 'play') {
      this.left -= dt;
      if (this.left <= 0) {
        this.left = 0;
        this.finish(-1);
        return;
      }
    }
    // la cura: el primero que la toca
    if (this.phase === 'cure') {
      this.cureNow(tmpV);
      for (const id of ids) {
        const s = this.P.get(id);
        const p = this.posOf(id);
        if (!s || !p || s.dead || this.inTransit(id)) continue;
        if (Math.hypot(p.x - tmpV.x, p.z - tmpV.z) < CURE_R && Math.abs(p.y + 1 - tmpV.y) < 2) {
          this.human = id;
          this.phase = 'play';
          if (GZ.cureTp) this.teleport(id, this.farSpot(id));
          this.share({ k: 'cure', by: id });
          return;
        }
      }
    }
    // los zombis caídos vuelven, lejos del humano
    for (const [id, s] of this.P) {
      if (!s.dead) continue;
      s.dead -= dt;
      if (s.dead <= 0) {
        s.dead = 0;
        this.teleport(id, this.farSpot(id, true));
        changed = true;
      }
    }
    this.syncT -= dt;
    if (changed || this.syncT <= 0) this.share(null);
  }

  // (anfitrión) Un zarpazo de `by` le llegó a `v`.
  hostHit(by, v) {
    if (this.phase !== 'play' || v !== this.human || by === v) return;
    const a = this.P.get(by);
    if (!a || a.dead || this.inTransit(by) || this.inTransit(v)) return;
    const pa = this.posOf(by);
    const pv = this.posOf(v);
    if (!pa || !pv || Math.hypot(pa.x - pv.x, pa.z - pv.z) > GZ.reach + GZ.lag || Math.abs(pa.y - pv.y) > 2.5) return;
    this.human = by;
    this.teleport(by, this.farSpot(by));
    this.share({ k: 'conv', h: by, z: v });
  }

  // (anfitrión) El humano `by` bajó al zombi `v`.
  hostKill(by, v) {
    if (this.phase !== 'play' || by !== this.human || v === by) return;
    const z = this.P.get(v);
    const h = this.P.get(by);
    if (!z || !h || z.dead || this.inTransit(v)) return;
    z.dead = GZ.respawn;
    h.lv = Math.min(GZ_LADDER.length - 1, h.lv + 1);
    h.k++;
    if (h.lv >= GZ_LADDER.length - 1) {
      this.finish(by, { k: 'kill', v, by });
      return;
    }
    this.share({ k: 'kill', v, by });
  }

  // (anfitrión) Se terminó: el que llegó al último mate o, por tiempo, el que más avanzó.
  finish(winner, fx = null) {
    const list = [...this.P.entries()].map(([id, s]) => ({ id, lv: s.lv, k: s.k }));
    list.sort((a, b) => b.lv - a.lv || b.k - a.k);
    if (winner < 0 && list.length) {
      const [a, b] = list;
      winner = b && a.lv === b.lv && a.k === b.k ? -1 : a.id;
    }
    this.phase = 'end';
    this.winner = winner;
    this.board = list.map((x) => ({ ...x, name: this.nameOf(x.id) }));
    this.share(fx ? { ...fx, end: 1 } : { k: 'end' });
  }

  pack() {
    return {
      ph: this.phase,
      h: this.human,
      t: +this.left.toFixed(2),
      w: this.winner,
      p: [...this.P.entries()].map(([id, s]) => [id, s.lv, s.k, s.dead > 0 ? 1 : 0, s.tp, s.spot]),
      b: this.phase === 'end' ? this.board : undefined,
    };
  }

  // (anfitrión) Manda el estado (y lo que pasó) y lo aplica acá.
  share(fx) {
    this.syncT = 1;
    const st = this.pack();
    this.apply(st, fx);
    this.g.net?.event('pee', { gz: st, fx: fx || undefined });
  }

  // Lo que un jugador le avisa al anfitrión (o el anfitrión a sí mismo).
  send(a, data = {}) {
    const g = this.g;
    if (!g.net?.guest) this.onGuest({ a, ...data }, this.myId());
    else g.net.net.send({ t: 'pee', a, ...data });
  }

  onGuest(m, from) {
    if (m.a === 'hit') this.hostHit(from, m.v);
    else if (m.a === 'kill') this.hostKill(from, m.v);
    else if (m.a === 'sw') {
      // (el zarpazo, para que lo vean los demás)
      this.fxSwing(from);
      this.g.net?.event('pee', { fx: { k: 'sw', id: from } });
    }
  }

  // ---------------- todos ----------------
  applyRemote(m) {
    if (m.gz) this.apply(m.gz, m.fx);
    else if (m.fx) this.applyFx(m.fx);
  }

  fullState() {
    return { gz: this.pack() };
  }

  apply(st, fx) {
    const g = this.g;
    const me = this.myId();
    const wasHuman = this.human;
    if (!this.isHost()) {
      // (el reloj: corrige de a poco; un salto grande, de una)
      this.left = Math.abs(st.t - this.left) > 2 || st.ph !== this.phase ? st.t : this.left + (st.t - this.left) * 0.3;
      this.phase = st.ph;
      this.human = st.h;
      this.winner = st.w;
      const seen = new Set();
      for (const [id, lv, k, dead, tp, spot] of st.p) {
        seen.add(id);
        const s = this.P.get(id) || {};
        Object.assign(s, { lv, k, dead, tp, spot });
        this.P.set(id, s);
      }
      for (const id of [...this.P.keys()]) if (!seen.has(id)) this.P.delete(id);
      if (st.b) this.board = st.b;
    }
    // los que aparecen en otro lugar (el propio, con el fundido: myTp)
    for (const [id, s] of this.P) {
      if (id === me || this.seenTp.get(id) === s.tp) continue;
      this.seenTp.set(id, s.tp);
      const spot = this.spots[s.spot];
      if (spot) this.pend.set(id, { spot, t0: g.time });
    }
    for (const id of [...this.seenTp.keys()]) if (!this.P.has(id)) this.seenTp.delete(id);
    if (fx) this.applyFx(fx, wasHuman);
    // (otra partida: se va el cartel del final en cada compu)
    if (this.phase !== 'end' && this.endEl) this.hideEnd();
    // el papel de esta compu
    this.setRole(this.human === me ? 'human' : 'zombie');
    // muerto yo
    const ms = this.P.get(me);
    if (ms && !!ms.dead !== this.deadMe) this.setDeadMe(!!ms.dead);
    // el mate del humano según su escalera
    if (this.role === 'human' && ms && ms.lv !== this.lvEquipped) this.equip(ms.lv);
    if (this.phase === 'end' && !this.endEl) this.showEnd();
  }

  // El propio: ir al lugar que mandó el anfitrión (ya jugando: antes, la
  // partida nueva lo devolvía al comienzo).
  myTp() {
    const g = this.g;
    const me = this.myId();
    const s = this.P.get(me);
    if (!s || g.state !== 'playing' || this.seenTp.get(me) === s.tp) return;
    this.seenTp.set(me, s.tp);
    const spot = this.spots[s.spot];
    if (spot) this.startTp(spot, me === this.human ? 'human' : 'rise');
  }

  applyFx(fx, wasHuman = this.human) {
    const g = this.g;
    const me = this.myId();
    switch (fx.k) {
      case 'start':
        g.audio?.sting?.();
        break;
      case 'cure': {
        this.cureOut = 0;
        this.cureNow(tmpV);
        g.fx.flash(tmpV, 0x7dffa0, 6, 0.5, 14);
        for (let i = 0; i < 3; i++) g.fx.sparkle(tmpV, [0.6, 1, 0.7], 6, 0.8);
        if (fx.by === me) g.audio?.powerupGrab?.();
        else g.audio?.powerupSpawn?.(tmpV.clone());
        break;
      }
      case 'conv': {
        // el que era humano queda zombi donde está; el que pegó se va lejos
        // (las nubes que tapan los cambios las pone puppetsTick)
        const pz = this.posOf(fx.z);
        if (fx.z === me) {
          this.setVeil('radial-gradient(circle, rgba(120,0,0,0.25), rgba(90,0,0,0.85))', 0.85, 0.05);
          setTimeout(() => this.setVeil(null, 0, 0.9), 120);
          g.fx.addShake?.(0.8);
          g.audio?.hitThump?.(1.4);
          if (pz) g.audio?.growl?.(tmpV.copy(pz).setY(pz.y + 1.5), 'scream');
        } else if (fx.h === me) {
          g.audio?.sting?.();
        }
        break;
      }
      case 'kill': {
        const z = this.puppets.get(fx.v);
        if (z && !z.dead) this.puppetDie(z);
        if (fx.by === me && GZ_LADDER[(this.P.get(me)?.lv ?? 0)]) g.audio?.powerupGrab?.();
        break;
      }
      case 'sw':
        if (fx.id !== me) this.fxSwing(fx.id);
        break;
      default:
        break;
    }
    if (fx.end) this.applyFx({ k: 'end' });
  }

  // Una nube que tapa el cambio (el humano que queda zombi, el zombi que se
  // cura, el que aparece en otro lado).
  puff(p, color) {
    const g = this.g;
    const c = new THREE.Color(color);
    const A = g.fx.alpha;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.45;
      A?.spawn(p.x + Math.cos(a) * r, p.y + 0.1 + Math.random() * 1.8, p.z + Math.sin(a) * r, Math.cos(a) * 0.8, 0.4 + Math.random() * 0.8, Math.sin(a) * 0.8, {
        color: [c.r * (0.8 + Math.random() * 0.3), c.g * (0.8 + Math.random() * 0.3), c.b * (0.8 + Math.random() * 0.3)],
        size: 0.45 + Math.random() * 0.25,
        size1: 0.95,
        life: 0.6 + Math.random() * 0.3,
        alpha: 0.6,
        drag: 2.2,
      });
    }
    g.fx.flash(tmpV.copy(p).setY(p.y + 1), color, 2, 0.3, 7);
    g.audio?.whoosh?.(tmpV.clone());
  }

  // ---------------- el papel de esta compu ----------------
  setRole(role) {
    if (role === this.role) return;
    const was = this.role;
    this.role = role;
    const g = this.g;
    const W = g.weapons;
    if (role === 'zombie') {
      this.stow();
      this.lvEquipped = -1;
      this.hands.show(true);
    } else {
      this.hands.show(false);
      this.swingT = -1;
      const s = this.P.get(this.myId());
      this.equip(s ? s.lv : 0);
    }
    if (was === null && W) W.updateHud();
  }

  // Sin mates en la mano (el zombi): se esconde todo lo de primera persona.
  stow() {
    const W = this.g.weapons;
    if (!W) return;
    W.adsT = 0;
    W.ads = false;
    W.state = 'idle';
    W.temp = null;
    W.holder.visible = false;
    if (W.holder2) W.holder2.visible = false;
    for (const k of ['knife', 'knifePlata', 'nade', 'pavaVm']) if (W[k]) W[k].visible = false;
    if (W.vmFlash) W.vmFlash.intensity = 0;
    W.pourSnd?.stop?.();
  }

  // El mate de la escalera en el que quedó (`lv`), con el cargador lleno.
  equip(lv) {
    const W = this.g.weapons;
    if (!W) return;
    const id = GZ_LADDER[Math.min(lv, GZ_LADDER.length - 1)];
    const st = W.statsOf(id, 0);
    W.temp = null;
    W.slots = [{ id, up: 0, mag: st.mag, reserve: st.reserve }];
    W.cur = 0;
    W.startRaise();
    this.lvEquipped = lv;
  }

  setDeadMe(dead) {
    this.deadMe = dead;
    const g = this.g;
    if (dead) {
      this.freezeAt(g.player.pos);
      this.hands.show(false);
      this.setVeil('radial-gradient(circle, rgba(60,0,0,0.55), rgba(10,0,0,0.95))', 0.92, 0.7);
      g.audio?.hitThump?.(1.2);
      g.fx.addShake?.(0.5);
    }
  }

  freezeAt(p) {
    this.frozen = (this.frozen || new THREE.Vector3()).copy(p);
    this.hookRide();
  }

  unfreeze() {
    this.frozen = null;
  }

  // Player.update llama a player.ride después de moverse y chocar (y antes de
  // la cámara): acá se queda quieto el que está apareciendo o caído, y el
  // zombi, que pasa por la paja, no se mete en el monte de atrás ni se va
  // del mapa (antes de esto, derecho por el pajonal salía del estero).
  hookRide() {
    const P = this.g.player;
    this.rideFn ||= () => this.ride();
    if (P.ride === this.rideFn) return;
    P.ride = this.rideFn;
  }

  ride() {
    const P = this.g.player;
    if (this.frozen) {
      P.pos.copy(this.frozen);
      P.vel.set(0, 0, 0);
      return;
    }
    const zs = this.g.zombies;
    // (el usuario, 2026-10-14: "las puertas no se pueden atravesar aunque
    // aparezcan abiertas". Esto frenaba a todos, también al humano, en las
    // celdas de puerta: Zombies.cellKind las cuenta como pared, abiertas o no.
    // Ahora las puertas abiertas se pasan: cellOk. Al humano la paja y las
    // paredes ya lo frenan solas; esto le queda para no irse del mapa por el agua.
    // globalThis.__mduConvPuertasViejo = true: como antes)
    const viejo = globalThis.__mduConvPuertasViejo === true;
    const ok = viejo ? (x, z) => zs.cellKind(x, z) <= 1 : (x, z) => this.cellOk(x, z);
    const L = this.lastGood || (this.lastGood = P.pos.clone());
    if (ok(P.pos.x, P.pos.z)) {
      L.copy(P.pos);
      return;
    }
    // (se desliza por el borde: primero se prueba quedarse en una sola dirección)
    if (ok(P.pos.x, L.z)) {
      P.pos.z = L.z;
      P.vel.z = 0;
    } else if (ok(L.x, P.pos.z)) {
      P.pos.x = L.x;
      P.vel.x = 0;
    } else {
      P.pos.x = L.x;
      P.pos.z = L.z;
      P.vel.x = 0;
      P.vel.z = 0;
    }
  }

  // ¿Se puede pisar (x, z)? El piso y la paja (Zombies.cellKind 0 y 1; al
  // humano la paja ya lo frena al chocar),
  // las puertas abiertas y, de lo de afuera, la paja y el río que quedan
  // adentro del mapa (innerMask); el pajonal que bordea todo el mapa sigue
  // frenando (el usuario, 2026-10-14: "los zombies no pueden atravesar el pasto
  // alto que está dentro del mapa (no me refiero el que bordea todo...)" y "zonas
  // como el río que el zombie no puede avanzar y se queda bugueado").
  // globalThis.__mduConvPajaViejo = true: lo de afuera frena entero, como antes.
  cellOk(x, z) {
    const w = this.g.world;
    if (this.g.zombies.cellKind(x, z) <= 1) return true;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return false;
    const i = w.idx(cx, cz);
    // (world/World.js CELL: 3 la puerta, 0 afuera)
    if (w.grid[i] === 3) return !!w.doorOpen[w.doorAt[i]];
    return w.grid[i] === 0 && globalThis.__mduConvPajaViejo !== true && this.innerMask()[i] === 1;
  }

  // Lo de afuera (paja y agua sin zona) que queda adentro del mapa: lo que
  // tiene zonas o paja para los cuatro lados, y los pasillos angostos (hasta 4
  // celdas) entre eso. Lo que da derecho al borde del mapa es el pajonal que lo
  // bordea todo (y el riacho al norte del puente, que se va del mapa).
  innerMask() {
    if (this.inner) return this.inner;
    const w = this.g.world;
    const W = w.W;
    const H = w.H;
    const out = (x, z) => w.grid[w.idx(x, z)] === 0;
    const M = new Uint8Array(W * H);
    const hits = (x, z, dx, dz) => {
      for (x += dx, z += dz; x >= 0 && z >= 0 && x < W && z < H; x += dx, z += dz) if (!out(x, z)) return true;
      return false;
    };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (out(x, z) && hits(x, z, -1, 0) && hits(x, z, 1, 0) && hits(x, z, 0, -1) && hits(x, z, 0, 1)) M[w.idx(x, z)] = 1;
    const near = (x, z, dx, dz) => {
      for (let k = 1; k <= 4; k++) {
        x += dx;
        z += dz;
        if (x < 0 || z < 0 || x >= W || z >= H) return false;
        if (!out(x, z) || M[w.idx(x, z)]) return true;
      }
      return false;
    };
    const F = M.slice();
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (!out(x, z) || M[w.idx(x, z)]) continue;
        if ((near(x, z, 0, -1) && near(x, z, 0, 1)) || (near(x, z, -1, 0) && near(x, z, 1, 0))) F[w.idx(x, z)] = 1;
      }
    }
    this.inner = F;
    return F;
  }

  // Ir a `spot` con el fundido (kind 'human': de blanco; 'rise': sale de la tierra).
  startTp(spot, kind) {
    this.tp = { t: 0, spot, kind, moved: false };
    this.freezeAt(this.g.player.pos);
    if (kind === 'human') this.setVeil('#f4fff0', 1, TP_OUT);
    else this.setVeil(this.deadMe ? null : '#060806', 1, TP_OUT * 0.6);
  }

  tpTick(dt) {
    const T = this.tp;
    if (!T) return;
    const g = this.g;
    const p = g.player;
    T.t += dt;
    if (!T.moved && T.t >= TP_OUT) {
      T.moved = true;
      p.pos.copy(T.spot);
      p.vel.set(0, 0, 0);
      p.airTop = T.spot.y;
      p.onGround = true;
      // mirando hacia donde hay lugar (y si se puede, hacia el medio del mapa)
      p.yaw = this.openYaw(T.spot);
      p.pitch = 0;
      this.freezeAt(T.spot);
      if (T.kind === 'rise') {
        this.deadMe = false;
        this.riseT = RISE;
        g.fx.dirt(T.spot);
        g.audio?.rise?.(T.spot.clone());
        this.hands.show(true);
      } else {
        this.puffSoon = 0.05;
      }
      this.setVeil(null, 0, TP_IN);
    }
    if (T.moved && T.t >= TP_OUT + (T.kind === 'rise' ? RISE : 0.15)) {
      this.tp = null;
      if (!this.deadMe) this.unfreeze();
    }
  }

  // Para dónde mirar al aparecer: lo más abierto, mejor si da al medio del mapa.
  openYaw(at) {
    const W = this.g.world;
    const o = tmpV.set(at.x, at.y + 1.5, at.z);
    const c = Math.atan2(-(42 - at.x), -(42 - at.z));
    let best = c;
    let bestS = -Infinity;
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      const d = Math.min(14, W.raycast(o, tmpW.set(-Math.sin(yaw), 0, -Math.cos(yaw)), 14));
      const s = d + 3 * Math.cos(yaw - c);
      if (s > bestS) {
        bestS = s;
        best = yaw;
      }
    }
    return best;
  }

  // ---------------- el zarpazo ----------------
  clawTick(dt, input) {
    const g = this.g;
    this.swingCd -= dt;
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (!this.swingHit && this.swingT >= GZ.hitAt) {
        this.swingHit = true;
        this.tryHit();
      }
      if (this.swingT >= GZ.swing) this.swingT = -1;
    }
    const can = this.role === 'zombie' && !this.deadMe && !this.tp && g.state === 'playing' && !g.menuOpen && this.phase !== 'end';
    if (!can || !input) return;
    if ((input.mouse.left || input.hit('KeyV')) && this.swingCd <= 0) {
      this.swingT = 0;
      this.swingHit = false;
      this.swingCd = GZ.swing;
      this.hands.swing();
      g.audio?.swish?.(false, 1.1);
      this.send('sw');
    }
  }

  tryHit() {
    const g = this.g;
    const me = this.myId();
    if (this.phase !== 'play' || this.human < 0 || this.human === me) return;
    const r = g.net?.remote.get(this.human);
    if (!r || this.pend.has(this.human)) return;
    const p = g.player.pos;
    const dx = r.pos.x - p.x;
    const dz = r.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > GZ.reach || Math.abs(r.pos.y - p.y) > 1.7) return;
    const fx = -Math.sin(g.player.yaw);
    const fz = -Math.cos(g.player.yaw);
    if (d > 0.6 && (dx * fx + dz * fz) / d < 0.35) return;
    // (una pared en el medio no deja)
    const eye = tmpV.set(p.x, p.y + 1.3, p.z);
    const dir = tmpW.set(r.pos.x, r.pos.y + 1.1, r.pos.z).sub(eye);
    const len = dir.length();
    if (len > 0.3 && g.world.raycast(eye, dir.divideScalar(len), len) < len - 0.25) return;
    this.hands.blood();
    g.audio?.squish?.(tmpV.set(r.pos.x, r.pos.y + 1.2, r.pos.z));
    this.send('hit', { v: this.human });
  }

  // ---------------- los zombis de los demás ----------------
  // Un lugar del pool de Zombies con el cuerpo de un muerto (el aspecto, fijo
  // por jugador), que no piensa: lo mueve puppetTick con lo que manda su compu.
  mkPuppet(id) {
    const zs = this.g.zombies;
    const z = zs.freeSlot();
    if (!z) return null;
    z.active = true;
    z.dead = false;
    z.gz = id;
    z.id = PUPPET_ID + id * 7 + 3;
    z.hp = GZ.zombieHp;
    z.maxHp = GZ.zombieHp;
    z.phase = Math.random() * 10;
    z.hidden = 0;
    z.static = false;
    z.attackT = 0;
    z.stateT = 0;
    z.twitchT = 2;
    z.twitch = 0;
    z.corpseT = 0;
    z.crawler = false;
    z.dog = false;
    z.horse = false;
    z.yac = false;
    z.level = 0;
    z.burnT = 0;
    z.window = -1;
    z.speedType = 'run';
    z.speed = 0;
    z.state = 'chase';
    z.deathFrom = null;
    z.P.rootPitch = 0;
    z.P.rootRoll = 0;
    z.P.rootY = 0;
    zs.lookOf(z);
    zs.paint(z);
    z.gzScale = z.scale;
    z.gzIn = 0;
    z.gzOut = -1;
    this.puppets.set(id, z);
    return z;
  }

  freePuppet(id) {
    const z = this.puppets.get(id);
    if (!z) return;
    this.puppets.delete(id);
    z.gz = undefined;
    this.g.zombies.free(z);
  }

  setPuppetState(z, s) {
    if (z.state === s) return;
    z.state = s;
    z.stateT = 0;
    z.attackT = 0;
  }

  puppetDie(z, dir = null) {
    if (z.dead) return;
    z.dead = true;
    z.gzDeadAt = this.g.time;
    z.state = 'dead';
    z.stateT = 0;
    z.corpseT = 0;
    z.deathFrom = null;
    z.deathBack = dir ? dir.x * Math.sin(z.yaw) + dir.z * Math.cos(z.yaw) < 0 : Math.random() < 0.5;
    z.static = false;
    this.g.audio?.growl?.(tmpV.set(z.pos.x, z.pos.y + 1.4, z.pos.z), 'attack');
  }

  // (el humano) Los zarpazos de los demás se ven en su zombi.
  fxSwing(id) {
    const z = this.puppets.get(id);
    if (!z || z.dead || z.state === 'rise') return;
    this.setPuppetState(z, 'attack');
    z.gzSwing = GZ.swing + 0.15;
    this.g.audio?.growl?.(tmpV.set(z.pos.x, z.pos.y + 1.5, z.pos.z), 'attack');
  }

  puppetsTick(dt) {
    const g = this.g;
    const zs = g.zombies;
    const me = this.myId();
    const t = g.time;
    for (const [id, s] of this.P) {
      if (id === me) continue;
      const r = g.net?.remote.get(id);
      const zombie = id !== this.human;
      let z = this.puppets.get(id);
      const pend = this.pend.get(id);
      // apareciendo en otro lado: cuando su gaucho o su zombi ya llegó
      if (pend && r && (r.pos.distanceTo(pend.spot) < 2.5 || t - pend.t0 > 3)) {
        this.pend.delete(id);
        if (!zombie) this.puff(pend.spot, 0xcfe8b0);
      }
      if (!zombie || !r) {
        // ya no es zombi: el cuerpo se va en la nube
        if (z && z.gzOut < 0 && !z.dead) z.gzOut = 0;
        if (z && (z.dead || z.gzOut >= 0)) this.puppetOut(z, dt);
        continue;
      }
      if (!z) {
        // (muerto y ya hundido: hasta que vuelva)
        if (s.dead) continue;
        z = this.mkPuppet(id);
        if (!z) continue;
        if (pend) {
          // sale de la tierra en su lugar
          z.pos.copy(pend.spot);
          z.baseY = pend.spot.y;
          this.setPuppetState(z, 'rise');
          g.fx.dirt(pend.spot);
          g.audio?.rise?.(pend.spot.clone());
        } else {
          // (el humano que queda zombi: entra en la nube)
          z.gzIn = 0.001;
          z.pos.set(r.pos.x, g.world.floorAt(r.pos.x, r.pos.z, r.pos.y + 0.5), r.pos.z);
          z.baseY = z.pos.y;
        }
        z.yaw = r.yaw + Math.PI;
      } else if (pend && !z.dead && z.state !== 'rise' && pend.t0 > (z.gzRiseAt || -1)) {
        // vuelve a salir en otro lugar (no debería pasar sin morir, pero por las dudas)
        z.pos.copy(pend.spot);
        z.baseY = pend.spot.y;
        z.gzRiseAt = pend.t0;
        this.setPuppetState(z, 'rise');
      }
      if (s.dead && !z.dead) this.puppetDie(z);
      // (una baja que el anfitrión no aceptó: vuelve)
      if (!s.dead && z.dead && t - (z.gzDeadAt || 0) > 1 && !pend) {
        this.freePuppet(id);
        continue;
      }
      this.puppetTick(z, r, dt, t);
    }
    for (const id of [...this.puppets.keys()]) if (!this.P.has(id)) this.freePuppet(id);
    for (const id of [...this.pend.keys()]) if (!this.P.has(id)) this.pend.delete(id);
  }

  puppetOut(z, dt) {
    const g = this.g;
    if (z.dead) {
      // tirado, después se hunde
      z.stateT += dt;
      z.corpseT += dt;
      g.zombies.poseDeath(z);
      if (z.corpseT > SINK_AT) {
        z.static = false;
        z.solvedOnce = false;
        z.baseY -= dt * (1.1 / SINK);
      }
      if (z.corpseT > SINK_AT + SINK) this.freePuppet(z.gz);
      return;
    }
    if (z.gzOut === 0) this.puff(z.pos, 0xcfe8b0);
    z.gzOut += dt;
    z.scale = z.gzScale * (1 - 0.55 * smooth(clamp01(z.gzOut / 0.3)));
    if (z.gzOut > 0.3) this.freePuppet(z.gz);
  }

  puppetTick(z, r, dt, t) {
    const g = this.g;
    const zs = g.zombies;
    z.stateT += dt;
    if (z.dead) {
      this.puppetOut(z, dt);
      return;
    }
    // entra en la nube (el humano que quedó zombi)
    if (z.gzIn > 0) {
      if (z.gzIn === 0.001) this.puff(z.pos, 0x3a5a28);
      z.gzIn += dt;
      z.scale = z.gzScale * (0.55 + 0.45 * smooth(clamp01(z.gzIn / 0.35)));
      if (z.gzIn > 0.35) {
        z.gzIn = 0;
        z.scale = z.gzScale;
      }
    }
    if (z.state === 'rise') {
      const k = clamp01(z.stateT / RISE);
      z.P.rootY = -1.75 * (1 - k * (2 - k));
      zs.poseRise(z, t);
      if (k >= 1) {
        z.P.rootY = 0;
        this.setPuppetState(z, 'chase');
      }
      z.yaw = r.yaw + Math.PI;
      return;
    }
    const ox = z.pos.x;
    const oz = z.pos.z;
    // (esperando que su compu lo traiga al lugar nuevo: quieto)
    if (!this.pend.has(z.gz)) {
      z.pos.x = r.pos.x;
      z.pos.z = r.pos.z;
    }
    z.baseY = g.world.floorAt(z.pos.x, z.pos.z, (r.pos.y || 0) + 0.5);
    z.pos.y = z.baseY;
    // Para dónde mira el cuerpo (el usuario, 2026-10-14: "¿puede ser que el
    // zombie no tenga animación de correr?"). Corre con la corrida de los
    // muertos, pero el cuerpo miraba para donde mira la cámara del jugador: en
    // diagonal o de costado (W+D, D) las piernas iban para un lado y el cuerpo
    // para el otro, y patinaba sin apoyar nunca un pie. Andando, ahora mira para
    // donde va, como los muertos; quieto o despacio, para donde mira el jugador.
    // globalThis.__mduConvCorreViejo = true: como antes
    let face = r.yaw + Math.PI;
    if (globalThis.__mduConvCorreViejo !== true && dt > 0) {
      const jump = Math.hypot(z.pos.x - ox, z.pos.z - oz);
      const k = Math.min(1, dt * 10);
      if (jump < 1.5) {
        z.gzVx = (z.gzVx || 0) + ((z.pos.x - ox) / dt - (z.gzVx || 0)) * k;
        z.gzVz = (z.gzVz || 0) + ((z.pos.z - oz) / dt - (z.gzVz || 0)) * k;
      }
      if ((r.speed || 0) > 1.2 && Math.hypot(z.gzVx, z.gzVz) > 0.8) face = Math.atan2(z.gzVx, z.gzVz);
    }
    let d = face - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += d * Math.min(1, dt * 14);
    const sp = r.speed || 0;
    if (z.state === 'attack') {
      z.gzSwing -= dt;
      z.attackT = Math.min(0.94, z.attackT + dt * (0.95 / GZ.swing));
      zs.poseAttack(z, t);
      if (z.gzSwing <= 0) this.setPuppetState(z, 'chase');
      return;
    }
    z.speedType = sp > PLAYER.sprint * 0.97 ? 'sprint' : sp > 3.2 ? 'run' : 'walk';
    if (sp < 0.35) zs.poseIdle(z, t);
    else zs.poseGait(z, dt, sp, t);
  }

  // (Zombies.raycast los encuentra como a cualquier muerto; el daño viene acá:
  // Zombies.damage y kill) La baja la ve al toque el que tira; la confirma el anfitrión.
  damage(z, amount, info = {}) {
    const g = this.g;
    g.zombies.lastPoints = 0;
    if (!z.active || z.dead || this.role !== 'human' || this.phase !== 'play' || !(amount > 0)) return false;
    // (saliendo de la tierra no se lo puede bajar)
    if (z.state === 'rise' || this.pend.has(z.gz)) return false;
    // (lo que no lo ve no le pega: la paja de por medio; shotBlocked)
    if (this.shotBlocked(z, info.point)) return false;
    // El tope por disparo (el usuario, 2026-10-14: "el humano ganaba siempre
    // porque el zombie moría muy rápido, por eso forzar 3 o 4 tiros por arma"):
    // un disparo le saca como mucho 1/n de la vida (GZ_SHOTS: las automáticas 4,
    // las de a un tiro y las fuertes 3), cabeza incluida. Los perdigones de un
    // disparo y una explosión llegan en el mismo cuadro: suman juntos contra el
    // mismo tope. globalThis.__mduConvTopeViejo = true: el daño de siempre
    if (globalThis.__mduConvTopeViejo !== true) {
      const n = info.type === 'knife' ? GZ.shotsElse : GZ_SHOTS[g.weapons?.slot?.id] ?? GZ.shotsElse;
      if (z.gzShotT !== g.time) {
        z.gzShotT = g.time;
        z.gzShotLeft = Math.ceil(z.maxHp / n);
      }
      amount = Math.min(amount, z.gzShotLeft);
      z.gzShotLeft -= amount;
    }
    z.hp -= amount;
    if (info.point) g.zombies.bleed(z, info.point, info.dir ? tmpV.copy(info.dir).multiplyScalar(0.6) : { x: 0, y: 0.5, z: 0 }, info.zone === 'head' ? 14 : 8);
    if (z.hp > 0) return true;
    this.puppetDie(z, info.dir);
    this.send('kill', { v: z.gz });
    return true;
  }

  // ¿La paja tapa al zombi `z` para el humano? (el usuario, 2026-10-14: "el
  // humano disparaba al azar para todos lados y mataba todos los zombies del
  // mapa": en este modo la paja no frena las balas, y tirando para cualquier
  // lado se bajaba a los que estaban escondidos adentro del pajonal, sin verlos.)
  // Se mide cuánta paja hay entre los ojos del humano y el golpe (`at`, o el
  // pecho): más de GZ.grassSee m, no le pega. Lo que vuela por arriba de la
  // paja (desde la galería de la Casona) sí. Las paredes ya frenan solas.
  // globalThis.__mduConvVistaViejo = true: como antes
  shotBlocked(z, at = null) {
    if (globalThis.__mduConvVistaViejo === true || this.role !== 'human') return false;
    const g = this.g;
    const w = g.world;
    const P = g.player;
    const ex = P.pos.x;
    const ey = P.pos.y + (P.eye || 1.6);
    const ez = P.pos.z;
    const e = z.mats?.[1]?.elements;
    const tx = at ? at.x : e ? e[12] : z.pos.x;
    const ty = at ? at.y : e ? e[13] : z.pos.y + 1.1;
    const tz = at ? at.z : e ? e[14] : z.pos.z;
    const len = Math.hypot(tx - ex, ty - ey, tz - ez);
    const STEP = 0.25;
    let grass = 0;
    for (let s = 0.3; s < len; s += STEP) {
      const k = s / len;
      const x = ex + (tx - ex) * k;
      const y = ey + (ty - ey) * k;
      const zz = ez + (tz - ez) * k;
      const cx = Math.floor(x);
      const cz = Math.floor(zz);
      if (!w.inside(cx, cz)) continue;
      const i = w.idx(cx, cz);
      // (la paja: las celdas de pajonal con caja y el pajonal suelto de afuera; el agua abierta no)
      const corn = g.zombies.cellKind(x, zz) === 1;
      if (!corn && !(w.grid[i] === 0 && (w.waterDepth?.(x, zz) || 0) < 0.3)) continue;
      if (y > w.floorAt(x, zz, y) + GZ.grassH) continue;
      grass += STEP;
      if (grass > GZ.grassSee) return true;
    }
    return false;
  }

  // ¿Más lejos que el alcance del mate? (Zombies.raycast, solo los tiros
  // derechos: antes llegaban hasta 1,6 veces el alcance; mismo interruptor)
  outOfRange(t) {
    if (globalThis.__mduConvVistaViejo === true || this.role !== 'human') return false;
    const st = this.g.weapons?.stats;
    return !!st && st.kind === 'hitscan' && st.range > 0 && t > st.range;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const playing = g.state === 'playing';
    if (playing && !this.started) {
      this.started = true;
      // (todo abierto y sin muertos de la computadora; la reja de la cripta sigue)
      for (const it of g.interact.list) if (it.kind === 'door' && !it.door.open && !it.door.def.locked) g.interact.openDoor(it.door, true);
      if (this.isHost()) this.hostStart();
      this.hookRide();
    }
    // sin rondas
    if (g.rounds && g.rounds.state !== 'remote' && g.rounds.state !== 'off') g.rounds.state = 'off';
    if (playing && this.phase !== 'end') {
      if (this.isHost()) this.hostTick(dt);
      else if (this.phase === 'cure' || this.phase === 'play') this.left = Math.max(0, this.left - dt);
    }
    this.myTp();
    const p = g.player;
    // el zombi corre sin cansarse
    if (this.role === 'zombie') p.stamina = PLAYER.stamina * 2;
    // nadie se ahoga ni queda tirado (el ahogo no pasa por safe(): entities/swim.js)
    if (p.breathS != null && p.breathS < 0.2) p.breathS = 0.2;
    if (p.downed && playing) p.revive();
    this.tpTick(dt);
    if (this.riseT > 0) this.riseT -= dt;
    if (this.puffSoon > 0) {
      this.puffSoon -= dt;
      if (this.puffSoon <= 0) g.fx.flash(tmpV.copy(p.pos).setY(p.pos.y + 1), 0xeaffd8, 2, 0.4, 6);
    }
    this.clawTick(dt, playing && !g.menuOpen ? g.input : null);
    this.hands.update(dt, this.swingT);
    if (playing || this.phase === 'end') this.puppetsTick(dt);
    this.updateCure(dt);
    this.updateHud();
  }

  // ---------------- el final ----------------
  showEnd() {
    const g = this.g;
    const me = this.myId();
    const list = this.board || [];
    const wname = this.winner >= 0 ? (this.winner === me ? 'Ganaste' : `Ganó ${list.find((x) => x.id === this.winner)?.name || this.nameOf(this.winner)}`) : 'Empate';
    const top = list[0];
    const last = GZ_LADDER.length - 1;
    const sub = top && top.lv >= last ? `Llegó ${this.winner === me ? 'al' : 'al'} ${WEAPONS[GZ_LADDER[last]]?.name}` : 'Se terminó el tiempo';
    // (el anfitrión arranca otra con los mismos; el usuario, 2026-10-13)
    const again = this.isHost();
    const el = document.createElement('div');
    el.className = 'mdu-gzend';
    el.innerHTML = `<div class="mdu-gzend__card"><p class="mdu-gzend__k">Zombies gauchescos</p><h2>${wname}</h2><p class="mdu-gzend__sub">${sub}</p><ol>${list
      .map((x, i) => `<li class="${x.id === me ? 'is-me' : ''}${x.id === this.winner ? ' is-win' : ''}" style="--i:${i}"><b>${i + 1}</b><span>${esc(x.name)}</span><em>${esc(WEAPONS[GZ_LADDER[x.lv]]?.name || '')} · ${x.lv + 1}/${GZ_LADDER.length}</em><i>${x.k} ${x.k === 1 ? 'baja' : 'bajas'}</i></li>`)
      .join('')}</ol><div class="mdu-gzend__btns">${again ? '<button class="mdu-btn" data-gzagain>Otra partida</button>' : ''}<button class="mdu-btn" data-gzback>Volver al menú</button></div></div>`;
    g.hud.root.appendChild(el);
    this.endEl = el;
    el.querySelector('[data-gzback]').addEventListener('click', () => this.back());
    el.querySelector('[data-gzagain]')?.addEventListener('click', () => this.again());
    // la partida queda quieta y el mouse suelto para el botón
    this.unfreeze();
    this.hands.show(false);
    // (sin el mate ni la munición detrás del cartel)
    this.stow();
    g.hud.root.classList.add('is-gz-z');
    this.setVeil('rgba(4,6,4,0.55)', 1, 0.8);
    g.state = 'over';
    g.paused = true;
    g.input.unlock();
    g.menus.showClick?.(false);
    g.audio?.fanfare?.();
  }

  // (anfitrión) Otra partida con los mismos: todos zombis otra vez, la cura de nuevo.
  again() {
    if (!this.isHost() || this.phase !== 'end') return;
    this.hostStart();
  }

  // Se va el cartel del final y se sigue jugando (otra partida).
  hideEnd() {
    const g = this.g;
    this.endEl?.remove();
    this.endEl = null;
    this.setVeil(null, 0, 0.6);
    this.lvEquipped = -1;
    if (this.role === 'zombie') this.hands.show(true);
    g.state = 'playing';
    g.paused = false;
    g.last = performance.now();
    // (el mouse: el anfitrión acaba de hacer clic; los demás, con un clic)
    if (this.isHost()) g.input.lock();
    else g.menus.showClick?.(true);
  }

  back() {
    const g = this.g;
    this.endEl?.remove();
    this.endEl = null;
    g.leaveRoom();
  }

  // ---------------- lo que no hay (la interfaz de los easter eggs) ----------------
  onShot() {}
  onExplosion() {}
  onPower() {}
  onZone() {}
  onKill() {}
  dropHat() {}
  onPhdLand() {}
  sceneCam() {
    return false;
  }
  announce(text, secs = 3) {
    if (text) this.g.hud.subtitle(text, secs);
  }
  debugFinal() {}
  players() {
    return this.ids().length;
  }
  isGil() {
    return false;
  }

  dispose() {
    const g = this.g;
    for (const id of [...this.puppets.keys()]) this.freePuppet(id);
    this.hands.dispose();
    this.cure.removeFromParent();
    this.hudEl?.remove();
    this.veil?.remove();
    this.endEl?.remove();
    g.hud.root.classList.remove('is-gz', 'is-gz-z');
    if (g.player && g.player.ride === this.rideFn) g.player.ride = null;
    if (g.gz === this) g.gz = null;
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// (Game.startGame) Se juega en línea, de a GZ.minPlayers o más: con menos no
// arranca y lo dice corto en el menú donde se apretó.
export function gzBlockStart(g) {
  if (g.modeNow !== 'gauchescos' || g.net?.guest) return false;
  const n = g.net ? g.net.net.count : 1;
  if (n >= GZ.minPlayers) return false;
  const msg = `Mínimo ${GZ.minPlayers} jugadores`;
  if (g.net && g.menus?.lobby?.status) {
    // (usuario 10-13, el mismo arreglo de Porteño, pzBlockStart: la sala ya se
    // había escondido al apretar Empezar; vuelve, con el aviso)
    if (g.state === 'title' && !g.menus.current) g.menus.show('online');
    g.menus.lobby.status(msg);
  } else {
    const scr = g.menus?.screens?.[g.menus.current];
    if (scr) {
      let p = scr.querySelector('.mdu-gz-note');
      if (!p) {
        p = document.createElement('p');
        p.className = 'mdu-gz-note';
        // (abajo de Solo y Con amigos; si no, al final de la pantalla)
        const near = scr.querySelector('.mdu-play');
        if (near) near.after(p);
        else scr.appendChild(p);
      }
      p.textContent = msg;
      p.classList.remove('is-on');
      void p.offsetWidth;
      p.classList.add('is-on');
    }
  }
  g.audio?.deny?.();
  return true;
}
