import * as THREE from 'three';
import { assetUrl } from '../../../lib/assets';
import { mesh, boxGeo } from '../../world/props';
import { songOn } from '../../world/SongEgg';
import { prefetchTrack } from '../../core/music';
import { isHost, announce } from '../castle/common';
import { MAT, glint, pulse } from './common';

// El baile del estero (easter egg de Mate no Numa): bajo la enramada del
// campamento hay un tocadiscos tirado entre los recados, sin disco. El disco
// está tirado en algún lugar del estero (uno de SPOTS, al azar en cada
// partida, con un brillito). Con el disco puesto y dándole cuerda
// (manteniendo F) suena: del suelo de la isleta salen nueve muertos
// en formación y bailan Thriller (Mixamo, 4 partes, pasadas al esqueleto de
// piezas: public/assets/sotano/modelos/zombies/baile.json); los demás muertos
// se quedan quietos mirando y no salen más mientras dura. Al final se caen
// todos, cada uno se lleva una propina y queda un potenciador. Si los matan a
// los nueve antes, la canción se corta de golpe y Francisco se ofende (sin
// propina). Una vez por partida, sin jefe vivo ni otra canción sonando.
//
// El reloj del baile es la canción (Music.time), así los pasos van con la
// música en cada compu. El anfitrión decide (los muertos, dónde y cuándo) y
// manda 'ee' { thr }; los invitados ponen la misma canción y cada uno
// dibuja el baile con su reloj (las posiciones llegan con los muertos).
// Estados de los muertos: 'dance' (bailan) y 'danceWatch' (miran), en
// entities/Zombies.js (think y updateRemote) y net/Session.js STATES.

const TRACK = 'baile-esteros';
const DATA = '/assets/sotano/modelos/zombies/baile.json';
// el tocadiscos, tirado bajo la enramada, y el centro de la formación (mira al tocadiscos)
const DISC = [35.4, 37.3];
// dónde puede estar el disco (uno por partida): junto a la carreta del obraje,
// la mesa de la pesquería, las cruces de la laguna y la cruz de la reducción
const SPOTS = [
  [37.2, 15.6],
  [72.6, 41.6],
  [37.4, 63.4],
  [17.2, 35.0],
];
const FORM = [41.2, 43.4];
// la formación: 3 x 3, y cuánto del recorrido del baile hacen (la isleta es chica)
const GAP = 1.35;
const TRAVEL = 0.45;
// salen del suelo a estos segundos de la canción (escalonados) y tardan RISE
const RISE_AT = 0.6;
const RISE = 1.7;
// el principio del baile entra de a poco
const BLEND = 0.5;
// cuánto después del último paso se caen todos, y la propina de cada jugador
const FALL_AFTER = 1.1;
const TIP = 1000;
const HIP = 0.93;

const tmpV = new THREE.Vector3();

export default class Thriller {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.used = false;
    this.phase = 'idle';
    this.list = [];
    this.data = null;
    this.t0 = 0;
    this.fell = false;
    this.facing = Math.atan2(DISC[0] - FORM[0], DISC[1] - FORM[1]);
    // el disco: dónde está (el anfitrión lo sortea; al invitado le llega) y si ya lo encontraron
    this.spotI = isHost(game) ? Math.floor(Math.random() * SPOTS.length) : -1;
    this.found = false;
    game.thriller = this;
    fetch(assetUrl(DATA))
      .then((r) => r.json())
      .then((d) => this.load(d))
      .catch(() => {});
    this.build();
    this.register();
  }

  load(d) {
    const raw = atob(d.data);
    const n = raw.length >> 1;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      a[i] = (v > 32767 ? v - 65536 : v) / d.k;
    }
    const K = {};
    d.keys.forEach((k, i) => (K[k] = i));
    this.data = { ...d, a, K, nk: d.keys.length };
  }

  // ---------------- el tocadiscos ----------------
  build() {
    const g = this.g;
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.8, roughness: 0.35 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const root = new THREE.Group();
    root.add(mesh(boxGeo(0.36, 0.16, 0.36), MAT.wood(), 0, 0.08, 0));
    const disc = new THREE.Group();
    disc.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20), black, 0, 0, 0));
    disc.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.014, 10), MAT.ribbon(), 0, 0.001, 0));
    disc.position.set(0, 0.17, 0);
    // (sin disco hasta que lo traigan)
    disc.visible = false;
    root.add(disc);
    // la manivela y el brazo
    root.add(mesh(boxGeo(0.02, 0.02, 0.12), brass, 0.19, 0.08, 0, 0, 0, 0));
    root.add(mesh(boxGeo(0.025, 0.06, 0.025), brass, 0.25, 0.1, 0.05));
    root.add(mesh(boxGeo(0.02, 0.02, 0.2), brass, 0.12, 0.2, -0.04, 0, 0.5, 0));
    // la bocina: el caño que sube y la campana
    root.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8), brass, 0.12, 0.3, -0.12, 0.35, 0, 0));
    const horn = mesh(new THREE.CylinderGeometry(0.22, 0.03, 0.42, 14, 1, true), brass, 0.12, 0.55, -0.02, -0.9, 0, 0);
    horn.material = brass.clone();
    horn.material.side = THREE.DoubleSide;
    root.add(horn);
    // tirado entre los recados: de costado y medio hundido
    const [x, z] = DISC;
    root.position.set(x, g.world.floorAt(x, z) - 0.03, z);
    root.rotation.set(0.12, 2.1, -0.18);
    root.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.scene.add(root);
    this.root = root;
    this.disc = disc;
    // el disco suelto, apoyado de canto contra algo, con un brillito
    const rec = new THREE.Group();
    rec.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20), black, 0, 0, 0));
    rec.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 10), MAT.ribbon(), 0, 0.001, 0));
    rec.rotation.set(1.2, 0.4, 0);
    this.shine = glint(g, 0xfff0c0, 0.55);
    this.shine.position.y = 0.05;
    rec.add(this.shine);
    rec.visible = false;
    g.scene.add(rec);
    this.rec = rec;
    this.placeRecord();
  }

  // El disco en su lugar (cuando se sabe cuál es y mientras no lo agarren).
  placeRecord() {
    const g = this.g;
    const at = SPOTS[this.spotI];
    this.rec.visible = !!at && !this.found && !this.used;
    if (!at) return;
    this.rec.position.set(at[0], g.world.floorAt(at[0], at[1]) + 0.14, at[1]);
    if (this.recIt) this.recIt.pos.copy(this.rec.position);
  }

  register() {
    const g = this.g;
    this.it = g.interact.add({
      kind: 'ee',
      pos: this.root.position.clone().add(tmpV.set(0, 0.4, 0)),
      radius: 1.6,
      prompt: () => {
        if (this.used || this.active) return null;
        if (!this.found) return { text: 'Le falta el disco', noCost: true, info: true };
        return this.canStart() ? { text: 'poner el disco y darle cuerda', noCost: true, hold: true } : null;
      },
      cost: () => 0,
      use: () => this.start(),
    });
    this.recIt = g.interact.add({
      kind: 'ee',
      pos: this.rec.position.clone(),
      radius: 1.5,
      prompt: () => (this.rec.visible ? { text: 'agarrar el disco', noCost: true } : null),
      cost: () => 0,
      use: () => this.pick(),
    });
  }

  // (anfitrión) Alguien agarró el disco.
  pick() {
    const g = this.g;
    if (!isHost(g) || this.found || this.used || this.spotI < 0) return false;
    this.found = true;
    this.placeRecord();
    announce(g, 'Un disco de pasta', 3);
    g.ee?.netSync?.();
    return true;
  }

  state() {
    return { i: this.spotI, f: this.found ? 1 : 0, u: this.used ? 1 : 0 };
  }

  apply(st) {
    this.spotI = st.i ?? this.spotI;
    this.found = !!st.f;
    if (st.u) this.used = true;
    this.placeRecord();
  }

  // Se puede: una vez, jugando, sin jefe vivo, sin escena y sin otra canción.
  canStart() {
    const g = this.g;
    if (this.used || this.active || !this.found || !this.data || g.state !== 'playing') return false;
    const b = g.zombies?.boss;
    if ((b && !b.dead) || g.arena?.active || g.ee?.scene || g.intro?.active || songOn()) return false;
    return true;
  }

  // ---------------- arranca (anfitrión) ----------------
  start() {
    const g = this.g;
    if (!isHost(g) || !this.canStart()) return false;
    this.begin();
    g.net?.event('ee', { thr: { a: 'go' } });
    // los que ya andaban: se quedan mirando
    const Z = g.zombies;
    for (const z of Z.pool) {
      if (!z.active || z.dead || z.boss || z.dog || z.crawler) continue;
      Z.setState(z, 'danceWatch');
    }
    // los nueve que bailan salen del suelo en su lugar
    const R = g.rounds;
    const spots = this.spots();
    this.list = [];
    for (const [i, s] of spots.entries()) {
      const at = new THREE.Vector3(s.x, g.world.floorAt(s.x, s.z), s.z);
      if (!Z.spawn(R?.round || 1, R?.health || 150, at)) continue;
      const z = Z.pool.find((q) => q.active && q.id === Z.idc);
      if (!z) continue;
      z.pos.copy(at);
      z.yaw = this.facing;
      Z.setState(z, 'dance');
      z.thr = { i, x: s.x, z: s.z };
      z.P.rootY = -1.75;
      this.list.push(z);
    }
    R?.holdSpawns?.(8);
    return true;
  }

  // Los dos lados: el disco, la canción y el reloj.
  begin() {
    const g = this.g;
    this.used = true;
    this.active = true;
    this.fell = false;
    this.disc.visible = true;
    this.rec.visible = false;
    this.phase = 'gather';
    this.t0 = g.time;
    g.music.play(TRACK, { while: (G) => this.active && (G.state === 'playing' || G.state === 'paused') });
  }

  // Dónde va cada uno (en el piso, 3 filas de 3 mirando al tocadiscos).
  spots() {
    const out = [];
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const dx = (col - 1) * GAP;
        const dz = (1 - row) * GAP;
        out.push({ x: FORM[0] + dx * c + dz * s, z: FORM[1] - dx * s + dz * c });
      }
    }
    return out;
  }

  // Por dónde va la canción (s); sin la canción, el reloj de la partida.
  clock() {
    const g = this.g;
    if (!this.active && !this.fell) return 0;
    const m = g.music;
    if (m?.is(TRACK)) {
      const t = m.time();
      if (t >= 0) return t;
    }
    return g.time - this.t0;
  }

  center() {
    return tmpV.set(FORM[0], this.g.world.floorAt(FORM[0], FORM[1]), FORM[1]);
  }

  spot() {
    return { x: DISC[0], z: DISC[1] };
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    // (la canción, bajada de antes: cuando se acercan al campamento)
    if (!this.pre && !this.used && g.player && Math.hypot(g.player.pos.x - DISC[0], g.player.pos.z - DISC[1]) < 14) {
      this.pre = true;
      prefetchTrack(TRACK);
    }
    if (this.rec.visible) pulse(this.shine, g.time, 0.5, 0.3, 2.6);
    if (this.active) this.disc.rotation.y -= dt * 8;
    if (!this.active) return;
    const t = this.clock();
    const D = this.data;
    if (D) this.phase = t < D.parts[0].at ? 'gather' : t < D.end ? 'dance' : 'end';
    if (!isHost(g)) return;
    g.rounds?.holdSpawns?.(3);
    // se terminó la partida (o la canción se cortó de golpe)
    if (g.state !== 'playing' && g.state !== 'paused') return this.finish(false);
    // los mataron a los nueve: se corta la música de golpe
    if (this.list.length && this.list.every((z) => !z.active || z.dead || z.state !== 'dance')) return this.cut();
    if (D && t >= D.end + FALL_AFTER) this.finish(true);
  }

  // (anfitrión) Se caen todos: la propina para cada uno y un potenciador.
  finish(fall) {
    const g = this.g;
    if (!this.active) return;
    this.active = false;
    this.fell = fall;
    this.phase = 'done';
    const Z = g.zombies;
    for (const z of Z.pool) {
      if (!z.active || z.dead || (z.state !== 'dance' && z.state !== 'danceWatch')) continue;
      if (fall) Z.kill(z, { type: 'bullet', noPoints: true });
      else Z.setState(z, 'chase');
    }
    this.list = [];
    g.music.stop(2.5);
    if (!fall) return;
    g.net?.event('ee', { thr: { a: 'end' } });
    this.tip();
    g.powerups?.drop(this.center().clone().add(tmpV.set(0, 0.5, 0)).clone(), true);
  }

  tip() {
    const g = this.g;
    g.addPoints?.(TIP);
    g.audio?.purchase?.();
  }

  // (anfitrión) Los mataron a todos mientras bailaban: la canción se corta, los
  // que miraban vuelven a atacar y Francisco se ofende. Sin propina.
  cut() {
    const g = this.g;
    // (de golpe: la que apaga finish, de a poco, ya no la encuentra)
    g.music.stop(0);
    this.finish(false);
    g.net?.event('ee', { thr: { a: 'cut' } });
    g.say('francisco', 'Qué falta de respeto...');
  }

  applyRemote(m) {
    if (m.a === 'cut' && this.active) {
      this.active = false;
      this.phase = 'done';
      this.g.music.stop(0);
      return;
    }
    if (m.a === 'go') this.begin();
    else if (m.a === 'end' && this.active) {
      this.active = false;
      this.fell = true;
      this.phase = 'done';
      this.g.music.stop(2.5);
      this.tip();
    }
  }

  // ---------------- los muertos ----------------
  // (anfitrión) Un muerto en 'dance' o 'danceWatch' (Zombies.think).
  step(z, dt, t) {
    const Z = this.g.zombies;
    if (!this.active) {
      Z.setState(z, 'chase');
      return;
    }
    if (z.state === 'danceWatch') {
      this.watch(z, dt, t);
      return;
    }
    this.pose(z, dt, t, true);
  }

  // (invitado) La pose (las posiciones llegan del anfitrión).
  poseRemote(z, dt, t) {
    if (z.state === 'danceWatch') this.g.zombies.poseIdle(z, t);
    else this.pose(z, dt, t, false);
  }

  // Los que miran: quietos, hamacándose, de cara al baile.
  watch(z, dt, t) {
    const Z = this.g.zombies;
    Z.poseIdle(z, t);
    const c = this.center();
    Z.turn(z, Math.atan2(c.x - z.pos.x, c.z - z.pos.z), 3, dt);
  }

  // Un cuadro del baile (los ángulos de las piezas y, en el anfitrión, el lugar).
  pose(z, dt, t, host) {
    const Z = this.g.zombies;
    const D = this.data;
    const P = z.P;
    const s = this.clock();
    if (!D) {
      Z.poseIdle(z, t);
      return;
    }
    const first = D.parts[0].at;
    // antes del baile: sale del suelo y espera hamacándose
    if (s < first) {
      const k = Math.min(1, Math.max(0, (s - RISE_AT - (z.thr?.i || 0) * 0.12) / RISE));
      if (k < 1) {
        Z.poseRise(z, t);
        P.rootY = -1.75 * (1 - k * (2 - k)) * (z.scale || 1);
        if (k > 0 && Math.random() < 0.3) this.g.fx.dirt(z.pos, 1);
      } else {
        Z.poseIdle(z, t);
        P.rootY = 0;
      }
      if (host) z.yaw = this.facing;
      z.danceIn = 0;
      return;
    }
    // el cuadro (entre las partes: de la última de una a la primera de la otra)
    const f = this.frame(s);
    const sc = z.scale || 1;
    const A = D.a;
    const nk = D.nk;
    const K = D.K;
    const i0 = f.f0 * nk;
    const i1 = f.f1 * nk;
    const al = f.al;
    const v = (k) => A[i0 + K[k]] + (A[i1 + K[k]] - A[i0 + K[k]]) * al;
    // (entra de a poco desde lo que estaba haciendo)
    z.danceIn = Math.min(1, (z.danceIn || 0) + dt / BLEND);
    const e = z.danceIn;
    const set = (k, val) => {
      P[k] = e >= 1 ? val : (P[k] || 0) + (val - (P[k] || 0)) * e;
    };
    for (const k of ['rootPitch', 'rootRoll', 'torsoP', 'torsoY', 'torsoR', 'headP', 'headY', 'headR', 'shLp', 'shLy', 'shLr', 'elL', 'shRp', 'shRy', 'shRr', 'elR', 'hipLp', 'hipLy', 'hipLr', 'knL', 'hipRp', 'hipRy', 'hipRr', 'knR']) set(k, v(k));
    P.hipY = HIP;
    P.rootFwd = 0;
    P.yawOff = 0;
    set('rootY', v('ry') * sc);
    if (!host) return;
    // el lugar: su puesto más el recorrido del baile (achicado), girado hacia el tocadiscos
    const dx = (v('rx') - D.center[0]) * TRAVEL * sc;
    const dz = (v('rz') - D.center[1]) * TRAVEL * sc;
    const c = Math.cos(this.facing);
    const sn = Math.sin(this.facing);
    const x = (z.thr?.x ?? z.pos.x) + dx * c + dz * sn;
    const zz = (z.thr?.z ?? z.pos.z) - dx * sn + dz * c;
    if (z.thr) {
      z.pos.x = x;
      z.pos.z = zz;
      const W = this.g.world;
      if (W.levels) z.pos.y = z.baseY = W.floorAt(x, zz, z.baseY);
    }
    z.yaw = this.facing + v('yaw');
  }

  // El cuadro del baile para el segundo s de la canción: { f0, f1, al }.
  frame(s) {
    const D = this.data;
    const P = D.parts;
    let i = 0;
    while (i < P.length - 1 && s >= P[i + 1].at) i++;
    const p = P[i];
    const local = (s - p.at) * D.fps;
    const last = p.from + p.n - 1;
    if (local <= 0) return { f0: p.from, f1: p.from, al: 0 };
    if (local < p.n - 1) {
      const f0 = p.from + Math.floor(local);
      return { f0, f1: Math.min(last, f0 + 1), al: local - Math.floor(local) };
    }
    // terminada esta parte: hasta la próxima, de su último cuadro al primero de la otra
    const q = P[i + 1];
    if (!q) return { f0: last, f1: last, al: 0 };
    const endAt = p.at + (p.n - 1) / D.fps;
    const k = Math.min(1, Math.max(0, (s - endAt) / Math.max(0.05, q.at - endAt)));
    return { f0: last, f1: q.from, al: k * k * (3 - 2 * k) };
  }

  dispose() {
    this.root?.removeFromParent();
    this.rec?.removeFromParent();
    if (this.g.thriller === this) this.g.thriller = null;
  }
}
