import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Navigation from '../world/Navigation';
import { RISERS, MAP_ID } from '../config/map';
import { POINTS, zombieHealth } from '../config/rules';
import { reachableSpot } from './reach';
import PomberoSkin from './pomberoSkin';

// El Pombero: duende del monte, petiso y peludo, con un sombrero de paja
// enorme y un silbido que se oye antes de verlo. Muy de vez en cuando, cuando
// cae un potenciador, aparece, lo agarra y sale corriendo a esconderse con él
// en algún pozo. Si lo liquidás antes de que se escape, el potenciador es tuyo.
//
// Para las armas es un "zombie" más (lo devuelven raycast e inRadius del grupo
// y el daño pasa por acá), pero no cuenta para la ronda. En línea lo simula el
// anfitrión y los invitados lo ven por la foto de cada cuadro.

export const POMBERO_ID = 0xfffe;
const CHANCE = 0.25; // por cada potenciador que cae
const COOLDOWN = 150; // segundos de juego entre una aparición y la otra
const RUN = 3.9;
const CARRY = 3.3;
const STATES = ['appear', 'toItem', 'flee', 'dead', 'watch'];
// Mate no Numa: muy de vez en cuando (una vez por partida; dos con más de un
// jugador) se queda agazapado en el pajonal, mirando: se le ven los ojos y
// poco más. Cuando alguien lo mira, se esconde. Sin cartel: que lo descubran.
const WATCH_FIRST = [180, 480]; // s de partida: la primera vez, al azar entre
const WATCH_GAP = [240, 540]; // y la segunda, después de la primera
const WATCH_MAX = 50; // si nadie lo ve, igual se va
const WATCH_SEEN = 0.2; // cuánto lo tienen que mirar para que se esconda (s)
const WATCH_ANG = 0.12; // la mirada: qué tan derecho (rad)
const WATCH_NEAR = 5; // más cerca que esto, se esconde aunque no lo miren

const tmpV = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const dirOut = { x: 0, z: 0 };

export default class Pombero {
  constructor(game) {
    this.g = game;
    this.nav = new Navigation(game.world);
    // lo que ven las armas
    this.z = { pombero: true, active: false, dead: false, boss: false, dog: false, id: POMBERO_ID, pos: new THREE.Vector3(), yaw: 0, scale: 1, hp: 1, maxHp: 1, hidden: 0 };
    this.state = 'off';
    this.t = 0;
    this.phase = 0;
    this.next = 60; // la primera vez, no antes del minuto
    this.item = null; // el potenciador que va a buscar
    this.carry = null; // { id, type, mesh } el que lleva
    this.escape = null;
    this.rig = this.build();
    this.rig.visible = false;
    // (escondido no se recorre cada cuadro: core/matrixCache.js mcSleep)
    this.rig.mcSleep = !(globalThis.__mduNoMerge || globalThis.__mduNo1d);
    game.scene.add(this.rig);
    // el cuerpo low poly (mientras baja, las piezas)
    this.skin = new PomberoSkin(this);
    this.clock = 0;
    this.watchLeft = MAP_ID === 'esteros' ? -1 : 0;
    this.watchAt = WATCH_FIRST[0] + Math.random() * (WATCH_FIRST[1] - WATCH_FIRST[0]);
    this.seenT = 0;
  }

  // ---------------- modelo ----------------
  // Petiso, panzón y todo peludo (mechones por todos lados), la cabezota con
  // narigón, orejas en punta, cejas tupidas, sonrisa de pícaro y barba larga;
  // manos grandes de dedos largos, los pies al revés (así no se le siguen las
  // huellas) y el sombrero de paja enorme y roto.
  build() {
    const T = this.g.textures;
    const fur = new THREE.MeshStandardMaterial({ color: 0x5a3c24, map: T.burlap || null, roughness: 1 });
    const furDark = new THREE.MeshStandardMaterial({ color: 0x3a2616, map: T.burlap || null, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a5e3c, map: T.skin || null, roughness: 0.8 });
    const beard = new THREE.MeshStandardMaterial({ color: 0x2e2014, map: T.burlap || null, roughness: 1 });
    const straw = new THREE.MeshStandardMaterial({ color: 0xd9b56a, map: T.burlap || null, roughness: 0.95, side: THREE.DoubleSide });
    const band = new THREE.MeshStandardMaterial({ color: 0x7a2418, roughness: 0.8 });
    const teeth = new THREE.MeshStandardMaterial({ color: 0xd8ccaa, roughness: 0.5 });
    const nails = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.4 });
    const mouthM = new THREE.MeshBasicMaterial({ color: 0x140806 });
    const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(2.2), toneMapped: false });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // mechones: conos cortos que salen de una superficie (todos en una malla)
    const tufts = (n, pick, len, wid) => {
      const geos = [];
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion();
      for (let k = 0; k < n; k++) {
        const { p, dir } = pick(k);
        const l = len * (0.7 + rnd() * 0.6);
        const gg = new THREE.ConeGeometry(wid * (0.7 + rnd() * 0.5), l, 4);
        gg.translate(0, l / 2, 0);
        // caen un poco (el pelo pesa)
        const d = dir.clone().add(new THREE.Vector3(0, -0.95, 0)).normalize();
        q.setFromUnitVectors(up, d);
        gg.applyQuaternion(q);
        gg.translate(p.x, p.y, p.z);
        geos.push(gg);
      }
      return mergeGeometries(geos);
    };
    const onEllipsoid = (c, r) => () => {
      const a = rnd() * Math.PI * 2;
      const y = rnd() * 1.6 - 0.8;
      const s = Math.sqrt(1 - y * y);
      const dir = new THREE.Vector3(Math.cos(a) * s, y, Math.sin(a) * s);
      return { p: new THREE.Vector3(c.x + dir.x * r.x, c.y + dir.y * r.y, c.z + dir.z * r.z), dir };
    };
    // piernas cortas y chuecas (cuelgan de la cadera) con los pies al revés
    const leg = (x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.4, 0);
      add(hip, new THREE.CapsuleGeometry(0.075, 0.2, 3, 8), fur, 0, -0.18, 0);
      hip.add(new THREE.Mesh(tufts(16, onEllipsoid(new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(0.08, 0.14, 0.08)), 0.08, 0.025), furDark));
      // el pie: el talón adelante y los dedos atrás
      add(hip, new THREE.SphereGeometry(0.075, 10, 8).scale(1, 0.55, 1.7), skin, 0, -0.37, -0.04);
      for (let k = 0; k < 4; k++) {
        const tx = (k - 1.5) * 0.034;
        add(hip, new THREE.SphereGeometry(0.022, 6, 5).scale(1, 0.8, 1.4), skin, tx, -0.385, -0.15 - Math.abs(k - 1.5) * -0.008);
        add(hip, new THREE.ConeGeometry(0.01, 0.03, 4), nails, tx, -0.39, -0.18, -Math.PI / 2, 0, 0);
      }
      body.add(hip);
      return hip;
    };
    this.legL = leg(0.1);
    this.legR = leg(-0.1);
    // panza peluda, con la panza pelada adelante
    add(body, new THREE.SphereGeometry(0.25, 16, 12).scale(1, 1.15, 0.9), fur, 0, 0.64, 0);
    add(body, new THREE.SphereGeometry(0.16, 12, 10).scale(1, 1.1, 0.7), skin, 0, 0.6, 0.12);
    body.add(new THREE.Mesh(tufts(70, (k) => {
      const f = onEllipsoid(new THREE.Vector3(0, 0.66, -0.01), new THREE.Vector3(0.25, 0.29, 0.225))();
      // adelante, en la panza, pelo corto
      if (f.dir.z > 0.55 && Math.abs(f.dir.x) < 0.5) f.p.z -= 0.02;
      return f;
    }, 0.11, 0.035), fur));
    // cabezota
    const head = new THREE.Group();
    head.position.set(0, 0.98, 0.02);
    body.add(head);
    add(head, new THREE.SphereGeometry(0.17, 18, 14).scale(1, 0.95, 0.95), skin, 0, 0, 0);
    // narigón colgante y los cachetes
    add(head, new THREE.SphereGeometry(0.058, 10, 8).scale(1, 1.1, 1.3), skin, 0, -0.03, 0.17);
    for (const s of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.06, 10, 8), skin, s * 0.08, -0.05, 0.1);
      // orejas en punta, grandes
      add(head, new THREE.ConeGeometry(0.05, 0.2, 6).scale(1, 1, 0.4), skin, s * 0.19, 0.04, -0.02, 0, 0, -s * 1.15);
      // ojos chicos y brillantes, hundidos bajo las cejas
      add(head, new THREE.SphereGeometry(0.03, 8, 6).scale(1.2, 0.8, 0.6), mouthM, s * 0.062, 0.045, 0.138);
      add(head, new THREE.SphereGeometry(0.022, 8, 6), eyes, s * 0.062, 0.045, 0.148);
      // cejas tupidas, levantadas de pícaro
      add(head, new THREE.ConeGeometry(0.03, 0.11, 5).scale(1, 1, 0.5), beard, s * 0.065, 0.09, 0.14, 0, 0, s * (Math.PI / 2 - 0.35));
    }
    // la sonrisa torcida con dientes
    add(head, new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI * 0.8), mouthM, 0, -0.06, 0.135, 0, 0, Math.PI * 1.1 + 0.15);
    for (let k = 0; k < 4; k++) add(head, new THREE.BoxGeometry(0.016, 0.02, 0.01), teeth, -0.03 + k * 0.022, -0.1 + Math.abs(k - 1.5) * 0.009, 0.14);
    // barba larga en mechones
    const bg = [];
    for (let k = 0; k < 11; k++) {
      const a = -1.2 + (k / 10) * 2.4;
      const l = 0.26 + rnd() * 0.14 - Math.abs(a) * 0.06;
      const gg = new THREE.ConeGeometry(0.035, l, 5).rotateX(Math.PI);
      gg.rotateZ((rnd() - 0.5) * 0.3 - a * 0.12);
      gg.translate(Math.sin(a) * 0.13, -0.08 - l / 2, Math.cos(a) * 0.12);
      bg.push(gg);
    }
    head.add(new THREE.Mesh(mergeGeometries(bg), beard));
    // pelo que asoma abajo del sombrero
    head.add(new THREE.Mesh(tufts(26, () => {
      const a = Math.PI * 0.3 + rnd() * Math.PI * 1.4;
      const dir = new THREE.Vector3(Math.sin(a), -0.2, Math.cos(a));
      return { p: new THREE.Vector3(Math.sin(a) * 0.16, 0.06, Math.cos(a) * 0.16), dir };
    }, 0.12, 0.03), beard));
    // el sombrero de paja, grandote y con el ala comida
    const hat = new THREE.Group();
    hat.position.set(0, 0.11, 0);
    hat.rotation.set(-0.06, 0, 0.1);
    const brimGeo = new THREE.CylinderGeometry(0.47, 0.5, 0.025, 30, 1);
    const bp = brimGeo.attributes.position;
    for (let k = 0; k < bp.count; k++) {
      const x = bp.getX(k);
      const z = bp.getZ(k);
      const r = Math.hypot(x, z);
      if (r < 0.4) continue;
      const a = Math.atan2(z, x);
      const f = 1 - (Math.sin(a * 7) * 0.5 + 0.5) * 0.06 - (Math.sin(a * 19 + 1) > 0.7 ? 0.08 : 0);
      bp.setXYZ(k, x * f, bp.getY(k) - (r - 0.4) * 0.12, z * f);
    }
    brimGeo.computeVertexNormals();
    add(hat, brimGeo, straw, 0, 0, 0);
    add(hat, new THREE.CylinderGeometry(0.14, 0.19, 0.2, 16), straw, 0, 0.11, 0);
    add(hat, new THREE.CylinderGeometry(0.192, 0.192, 0.04, 16), band, 0, 0.04, 0);
    hat.add(new THREE.Mesh(tufts(18, () => {
      const a = rnd() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a));
      return { p: new THREE.Vector3(Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44), dir };
    }, 0.08, 0.012), straw));
    head.add(hat);
    this.hat = hat;
    this.head = head;
    // brazos largos que llegan casi al piso (cuelgan del hombro), con manazas
    const arm = (x) => {
      const sh = new THREE.Group();
      sh.position.set(x, 0.8, 0);
      add(sh, new THREE.CapsuleGeometry(0.05, 0.42, 3, 8), fur, 0, -0.25, 0);
      sh.add(new THREE.Mesh(tufts(22, onEllipsoid(new THREE.Vector3(0, -0.22, 0), new THREE.Vector3(0.055, 0.22, 0.055)), 0.09, 0.022), furDark));
      add(sh, new THREE.SphereGeometry(0.06, 10, 8).scale(1, 1.1, 0.8), skin, 0, -0.52, 0);
      for (let k = 0; k < 4; k++) {
        const fx = (k - 1.5) * 0.026;
        add(sh, new THREE.CapsuleGeometry(0.013, 0.07, 2, 6), skin, fx, -0.6, 0.02, 0.35, 0, 0);
        add(sh, new THREE.ConeGeometry(0.009, 0.03, 4), nails, fx, -0.65, 0.045, 0.35 + Math.PI, 0, 0);
      }
      add(sh, new THREE.CapsuleGeometry(0.014, 0.05, 2, 6), skin, Math.sign(-x) * 0.05, -0.54, 0.04, 0.4, 0, Math.sign(-x) * 0.6);
      body.add(sh);
      return sh;
    };
    this.armL = arm(0.27);
    this.armR = arm(-0.27);
    // donde va el potenciador robado: arriba de la cabeza, entre las manos
    this.hold = new THREE.Group();
    this.hold.position.set(0, 1.55, 0.05);
    body.add(this.hold);
    this.body = body;
    return root;
  }

  // ---------------- aparición ----------------
  // Cae un potenciador (lo llama quien simula: en solitario o el anfitrión).
  onDrop(item) {
    const g = this.g;
    // arriba en el altillo no lo va a buscar
    if (g.net?.guest || this.z.active || g.time < this.next || (g.rounds?.round || 0) < 2 || item.pos.y > 1 || g.world.tower) return;
    if (Math.random() > CHANCE) return;
    this.next = g.time + COOLDOWN;
    g.later(1.5 + Math.random() * 2, () => this.spawn(item));
  }

  spawn(item) {
    const g = this.g;
    if (this.z.active || g.state !== 'playing' || !g.powerups.items.includes(item)) return false;
    // sale de un pozo que no esté ni muy cerca ni muy lejos del potenciador
    this.nav.update(item.pos.x, item.pos.z, true);
    const players = this.players();
    const spots = RISERS.filter((r) => g.activeZones.has(r.zone))
      .map((r) => ({ x: r.pos[0], z: r.pos[1], d: this.nav.distAt(r.pos[0], r.pos[1]) }))
      .filter((s) => s.d >= 9 && s.d <= 34 && players.every((p) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 6));
    if (!spots.length) return false;
    const s = spots[Math.floor(Math.random() * spots.length)];
    const z = this.z;
    const n = g.rounds?.players || 1;
    z.pos.set(s.x, g.world.floorAt(s.x, s.z), s.z);
    z.yaw = Math.atan2(item.pos.x - s.x, item.pos.z - s.z);
    z.hp = z.maxHp = Math.max(300, zombieHealth(g.rounds.round) * 1.2) * (1 + (n - 1) * 0.5);
    z.active = true;
    z.dead = false;
    this.item = item;
    this.setState('appear');
    this.appearFx();
    return true;
  }

  appearFx() {
    const g = this.g;
    g.fx.dirt(this.z.pos, 10);
    g.fx.yerbaPuff?.(this.z.pos);
    g.audio.pombero?.(tmpV.set(this.z.pos.x, this.z.pos.y + 1.2, this.z.pos.z));
  }

  players() {
    const g = this.g;
    const list = g.player.alive ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) list.push(r);
    return list;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    this.chkT = 0;
    this.chkX = this.z.pos.x;
    this.chkZ = this.z.pos.z;
    this.stuckN = 0;
    this.winT = 0;
    this.winX = this.z.pos.x;
    this.winZ = this.z.pos.z;
    this.sideT = 0;
  }

  // Los pozos para escaparse, del mejor al peor: lejos de todos los jugadores
  // y no tan lejos de él.
  escapes() {
    const g = this.g;
    const players = this.players();
    const list = [];
    for (const r of RISERS) {
      if (!g.activeZones.has(r.zone)) continue;
      const near = players.reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - r.pos[0], p.pos.z - r.pos[1])), Infinity);
      const here = Math.hypot(this.z.pos.x - r.pos[0], this.z.pos.z - r.pos[1]);
      if (here < 5) continue;
      list.push({ x: r.pos[0], z: r.pos[1], score: Math.min(near, 40) - here * 0.2 });
    }
    return list.sort((a, b) => b.score - a.score);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const z = this.z;
    // (el de Mate no Numa en el pajonal: lo decide quien simula)
    if (!g.net?.guest && this.watchLeft !== 0 && g.state === 'playing') {
      this.clock += dt;
      if (!z.active && this.clock > this.watchAt) this.tryWatch();
    }
    if (!z.active) {
      this.animate(dt);
      return;
    }
    this.t += dt;
    if (g.net?.guest) {
      this.follow(dt);
      this.animate(dt);
      return;
    }
    // trabado (contra una esquina, una baranda o el agua) tres segundos: se mete
    // en la tierra; si llevaba algo, lo suelta ahí (antes quedaba corriendo
    // contra la pared, a veces hacia un lado donde no había nada)
    if (this.state === 'toItem' || this.state === 'flee') {
      this.chkT += dt;
      if (this.chkT > 1.5) {
        const m = Math.hypot(z.pos.x - this.chkX, z.pos.z - this.chkZ);
        this.stuckN = m < 0.6 ? this.stuckN + 1 : 0;
        this.chkT = 0;
        this.chkX = z.pos.x;
        this.chkZ = z.pos.z;
        if (this.stuckN >= 2) {
          if (this.carry) {
            const at = reachableSpot(g, z.pos) || z.pos;
            const type = this.carry.type;
            this.dropCarry();
            g.powerups.drop(at, true, type);
          }
          this.vanish();
          this.animate(dt);
          return;
        }
      }
    }
    if (this.state === 'appear') {
      if (this.t > 0.8) this.setState('toItem');
    } else if (this.state === 'toItem') {
      const it = this.item;
      if (!it || !g.powerups.items.includes(it)) {
        // se lo ganaron de mano: se vuelve con las manos vacías
        this.item = null;
        this.flee();
      } else {
        this.move(dt, it.pos.x, it.pos.z, RUN);
        if (Math.hypot(it.pos.x - z.pos.x, it.pos.z - z.pos.z) < 0.9) this.grab(it);
      }
    } else if (this.state === 'flee') {
      this.move(dt, this.escape.x, this.escape.z, this.carry ? CARRY : RUN * 1.1);
      // con las manos vacías no tiene a qué ir: corre un poquito y se mete en la tierra
      if (Math.hypot(this.escape.x - z.pos.x, this.escape.z - z.pos.z) < 0.9 || this.t > (this.carry ? 45 : 2.5)) this.vanish();
    } else if (this.state === 'dead') {
      if (this.t > 3) this.hide();
    } else if (this.state === 'watch') {
      this.watchTick(dt);
    }
    this.animate(dt);
  }

  // ---------------- agazapado en el pajonal (Mate no Numa) ----------------
  tryWatch() {
    const g = this.g;
    if (this.watchLeft < 0) this.watchLeft = (g.rounds?.players || 1) > 1 ? 2 : 1;
    if (this.watchLeft <= 0) return;
    const spot = (g.rounds?.round || 0) >= 2 ? this.watchSpot() : null;
    if (!spot) {
      this.watchAt = this.clock + 20;
      return;
    }
    this.watchLeft--;
    this.watchAt = this.clock + WATCH_GAP[0] + Math.random() * (WATCH_GAP[1] - WATCH_GAP[0]);
    const z = this.z;
    z.pos.set(spot.x, g.world.floorAt(spot.x, spot.z), spot.z);
    z.yaw = spot.yaw;
    z.hp = z.maxHp = 1;
    z.active = true;
    z.dead = false;
    this.item = null;
    this.seenT = 0;
    this.setState('watch');
  }

  // Un lugar en el borde del pajonal, a la espalda o al costado de alguien (no
  // lo ve aparecer): la celda de paja y, del lado de él, una que se camina.
  watchSpot() {
    const g = this.g;
    const Z = g.zombies;
    const players = this.players();
    if (!players.length || !Z.cellKind) return null;
    const p = players[Math.floor(Math.random() * players.length)];
    const fx = -Math.sin(p.yaw || 0);
    const fz = -Math.cos(p.yaw || 0);
    for (let k = 0; k < 80; k++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 9 + Math.random() * 13;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      if (dx * fx + dz * fz > 0.2) continue;
      const x = p.pos.x + dx * d;
      const z = p.pos.z + dz * d;
      if (Z.cellKind(x, z) !== 1 || Z.cellKind(x - dx * 1.1, z - dz * 1.1) !== 0) continue;
      if (players.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 7)) continue;
      // (que se lo pueda ver: sin paja ni paredes en el medio)
      if (!this.openLine(p.pos.x, p.pos.y + 1.6, p.pos.z, x, z)) continue;
      return { x, z, yaw: Math.atan2(p.pos.x - x, p.pos.z - z) };
    }
    return null;
  }

  // ¿Se ve la cabeza desde ahí? Todo el camino por donde se camina (menos el
  // último metro, su mata) y sin nada sólido en el medio.
  openLine(ex, ey, ez, x, z) {
    const g = this.g;
    const Z = g.zombies;
    const dx = x - ex;
    const dz = z - ez;
    const d = Math.hypot(dx, dz);
    if (Z.cellKind(ex, ez) !== 0) return false;
    for (let t = 0.5; t < d - 1.3; t += 0.5) if (Z.cellKind(ex + (dx * t) / d, ez + (dz * t) / d) !== 0) return false;
    const k = Math.max(0, (d - 1.3) / d);
    return g.world.clear(tmpE.set(ex, ey, ez), tmpD.set(ex + dx * k, g.world.floorAt(x, z) + 0.6, ez + dz * k));
  }

  // Mira al que tiene más cerca; si alguien lo mira (o se le acerca), se esconde.
  watchTick(dt) {
    const g = this.g;
    const z = this.z;
    const head = tmpV.set(z.pos.x, z.pos.y + 0.6, z.pos.z);
    let seen = false;
    let near = Infinity;
    let face = null;
    for (const p of this.players()) {
      const local = p === g.player;
      const eye = local ? g.camera.position : tmpE.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
      const dx = head.x - eye.x;
      const dy = head.y - eye.y;
      const dz = head.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < near) {
        near = d;
        face = Math.atan2(-dx, -dz);
      }
      if (d < WATCH_NEAR) seen = true;
      if (d > 32 || !this.openLine(eye.x, eye.y, eye.z, z.pos.x, z.pos.z)) continue;
      let lx;
      let ly;
      let lz;
      if (local) {
        g.camera.getWorldDirection(tmpD);
        lx = tmpD.x;
        ly = tmpD.y;
        lz = tmpD.z;
      } else {
        const cp = Math.cos(p.pitch || 0);
        lx = -Math.sin(p.yaw || 0) * cp;
        ly = Math.sin(p.pitch || 0);
        lz = -Math.cos(p.yaw || 0) * cp;
      }
      if ((lx * dx + ly * dy + lz * dz) / d > Math.cos(WATCH_ANG)) seen = true;
    }
    if (face != null) {
      let dd = face - z.yaw;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      z.yaw += dd * Math.min(1, dt * 2);
    }
    this.seenT = seen ? this.seenT + dt : Math.max(0, this.seenT - dt);
    if (this.seenT > WATCH_SEEN || this.t > WATCH_MAX) {
      // se agacha y se va, con una risita bajita
      g.audio.laugh?.(tmpV.set(z.pos.x, z.pos.y + 0.5, z.pos.z));
      g.net?.event('pomb', { a: 'hid' });
      this.hide();
    }
  }

  move(dt, tx, tz, speed) {
    const g = this.g;
    const z = this.z;
    const dx = tx - z.pos.x;
    const dz = tz - z.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = dx / dist;
    let mz = dz / dist;
    // (va siempre por el campo de flujo: la línea de vista pasaba por arriba de
    // barandas, tranqueras y agua, y se quedaba trabado contra ellas)
    const clear = dist < 2;
    if (!clear && this.nav.direction(z.pos.x, z.pos.z, dirOut)) {
      mx = dirOut.x;
      mz = dirOut.z;
    }
    // trabado contra la punta de una baranda (el campo de flujo corta la
    // esquina): esquiva de costado un ratito, como los muertos
    if (this.sideT > 0) {
      this.sideT -= dt;
      const s = this.side;
      const ax = mx * 0.3 - mz * s;
      const az = mz * 0.3 + mx * s;
      const n = Math.hypot(ax, az) || 1;
      mx = ax / n;
      mz = az / n;
    }
    const px0 = z.pos.x;
    const pz0 = z.pos.z;
    let d = Math.atan2(mx, mz) - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += Math.max(-10 * dt, Math.min(10 * dt, d));
    z.pos.x += mx * speed * dt;
    z.pos.z += mz * speed * dt;
    // (sube escalones de hasta medio metro: en el estero va por el fondo del
    // agua y el borde de tierra de una pasarela le quedaba de pared; las
    // barandas empiezan más arriba y lo siguen frenando)
    g.world.collide(z.pos, 0.28, z.pos.y + 0.45, z.pos.y + 1.2);
    // (cada 0.4 s mira cuánto avanzó de verdad: contra la punta de la baranda
    // tiembla entre dos celdas, se mueve cada cuadro pero no llega a ningún lado)
    this.winT = (this.winT || 0) + dt;
    let stuck = false;
    if (this.winT >= 0.4) {
      stuck = Math.hypot(z.pos.x - (this.winX ?? px0), z.pos.z - (this.winZ ?? pz0)) < speed * this.winT * 0.25;
      this.winT = 0;
      this.winX = z.pos.x;
      this.winZ = z.pos.z;
    }
    if (stuck && !(this.sideT > 0)) {
      const w = g.world;
      const y0 = z.pos.y + 0.45;
      const lf = w.circleFree ? w.circleFree(z.pos.x - mz * 0.7, z.pos.z + mx * 0.7, 0.28, y0, z.pos.y + 1.2) : true;
      const rf = w.circleFree ? w.circleFree(z.pos.x + mz * 0.7, z.pos.z - mx * 0.7, 0.28, y0, z.pos.y + 1.2) : true;
      this.side = lf && !rf ? 1 : rf && !lf ? -1 : this.side ? -this.side : Math.random() < 0.5 ? 1 : -1;
      this.sideT = 0.5 + Math.random() * 0.3;
    }
    // en el penal sube y baja escaleras como cualquiera
    if (g.world.levels) z.pos.y = g.world.floorAt(z.pos.x, z.pos.z);
    this.speed = speed;
  }

  grab(it) {
    const g = this.g;
    const i = g.powerups.items.indexOf(it);
    if (i < 0) return;
    g.powerups.items.splice(i, 1);
    this.hold.add(it.mesh);
    it.mesh.position.set(0, 0, 0);
    it.mesh.visible = true;
    this.carry = { id: it.id, type: it.type, mesh: it.mesh };
    this.item = null;
    g.audio.laugh?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    g.net?.event('pomb', { a: 'grab', id: it.id, type: it.type });
    this.flee();
  }

  // Se escapa al mejor pozo al que se pueda llegar caminando (si ninguno, ahí mismo).
  flee() {
    const z = this.z;
    this.escape = null;
    for (const e of this.escapes().slice(0, 5)) {
      this.nav.update(e.x, e.z, true);
      if (Number.isFinite(this.nav.distAt(z.pos.x, z.pos.z))) {
        this.escape = e;
        break;
      }
    }
    if (!this.escape) this.escape = { x: z.pos.x, z: z.pos.z };
    this.setState('flee');
  }

  // Llegó al pozo: se mete y se lleva lo que tenga.
  vanish() {
    const g = this.g;
    this.appearFx();
    g.net?.event('pomb', { a: 'gone' });
    this.hide();
  }

  hide() {
    this.dropCarry();
    this.z.active = false;
    this.z.dead = false;
    this.state = 'off';
    this.rig.visible = false;
  }

  dropCarry() {
    if (!this.carry) return;
    this.carry.mesh.removeFromParent();
    this.carry = null;
  }

  // ---------------- daño ----------------
  hitTest(o, d, maxT) {
    const z = this.z;
    if (!z.active || z.dead || this.state === 'appear' || this.state === 'watch') return null;
    const s = this.rig.scale.x;
    const head = sphereHit(o, d, z.pos.x, z.pos.y + 1.02 * s, z.pos.z, 0.24 * s, maxT);
    const body = sphereHit(o, d, z.pos.x, z.pos.y + 0.58 * s, z.pos.z, 0.32 * s, maxT);
    if (head === null && body === null) return null;
    if (body === null || (head !== null && head < body)) return { z, t: head, zone: 'head' };
    return { z, t: body, zone: 'torso' };
  }

  damage(amount, info = {}) {
    const g = this.g;
    const z = this.z;
    if (!z.active || z.dead || this.state === 'appear' || this.state === 'watch') return false;
    const type = info.type || 'bullet';
    // el Kaboom no lo alcanza: es un duende, no un muerto
    if (type === 'nuke') return false;
    let dmg = amount;
    if (g.powerups.active.insta && type !== 'burn') dmg = z.hp + 1;
    if (['freeze', 'chain', 'blast'].includes(type)) dmg = Math.max(dmg, z.maxHp * 0.6);
    z.hp -= dmg;
    if (info.point && type !== 'freeze' && type !== 'chain') g.fx.blood(info.point, info.dir || { x: 0, y: 0.5, z: 0 }, 10);
    if (z.hp > 0) {
      g.zombies.lastPoints = POINTS.hit;
      if (!info.noPoints) g.addPoints(POINTS.hit, info.point);
      if (Math.random() < 0.3) g.audio.yelp?.(tmpV.set(z.pos.x, 1, z.pos.z));
      return true;
    }
    this.kill(info);
    return true;
  }

  kill(info = {}) {
    const g = this.g;
    const z = this.z;
    const type = info.type || 'bullet';
    z.dead = true;
    this.setState('dead');
    const pts = POINTS.kill + POINTS.head * 2;
    g.zombies.lastPoints = pts;
    if (!info.noPoints) g.addPoints(pts, info.point);
    if (info.by != null && g.net?.host && info.by !== g.net.id) g.net.creditKill(info.by, type, info.zone);
    else {
      g.stats.kills++;
      if (info.zone === 'head' && ['bullet', 'knife'].includes(type)) g.stats.headshots++;
      if (type === 'knife') g.stats.knifeKills++;
    }
    g.audio.yelp?.(tmpV.set(z.pos.x, 1, z.pos.z));
    g.net?.event('pomb', { a: 'drop' });
    if (this.carry) {
      // te lo da: el efecto sale para todos, como si lo hubieras agarrado
      const { id, type: pup } = this.carry;
      this.dropCarry();
      g.powerups.apply(pup, id);
    }
  }

  // ---------------- animación ----------------
  // Las piezas se mueven igual (el botín y los golpes las usan); si ya bajó el
  // modelo, se ve el modelo.
  animate(dt) {
    this.animateRig(dt);
    const on = this.skin?.update(dt);
    this.body.visible = !on;
  }

  animateRig(dt) {
    const z = this.z;
    const r = this.rig;
    r.visible = z.active;
    if (!z.active) return;
    const st = this.state;
    // (agazapado en el pajonal, sin el modelo: las piezas hundidas en las cañas)
    r.position.set(z.pos.x, z.pos.y - (st === 'watch' ? 0.6 : 0), z.pos.z);
    r.rotation.y = z.yaw;
    // saliendo del pozo: crece desde abajo
    const grow = st === 'appear' ? Math.min(1, this.t / 0.7) : 1;
    r.scale.setScalar(Math.max(0.05, grow));
    if (st === 'dead') {
      // se cae de espaldas y queda tieso
      const k = Math.min(1, this.t / 0.45);
      this.body.rotation.x = -1.45 * k;
      this.body.position.y = 0.12 * k;
      this.armL.rotation.x = this.armR.rotation.x = -2.4 * k;
      this.legL.rotation.x = this.legR.rotation.x = 0.4 * k;
      return;
    }
    const moving = st === 'toItem' || st === 'flee';
    // corre agachado, como quien se lleva algo
    this.body.rotation.x = moving ? 0.22 : 0;
    this.phase += dt * (moving ? 13 : 3);
    const sw = moving ? Math.sin(this.phase) : 0;
    this.legL.rotation.x = sw * 0.8;
    this.legR.rotation.x = -sw * 0.8;
    this.body.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.06 : 0;
    this.body.rotation.z = sw * 0.08;
    if (this.carry) {
      // brazos arriba sosteniendo el botín
      this.armL.rotation.x = this.armR.rotation.x = -2.9;
      this.armL.rotation.z = -0.35;
      this.armR.rotation.z = 0.35;
      this.carry.mesh.rotation.y += dt * 3;
    } else {
      this.armL.rotation.x = -sw * 0.9 - (moving ? 0.3 : 0);
      this.armR.rotation.x = sw * 0.9 - (moving ? 0.3 : 0);
      this.armL.rotation.z = this.armR.rotation.z = 0;
    }
    this.head.rotation.y = Math.sin(this.phase * 0.5) * 0.3;
    this.head.rotation.x = moving ? -0.18 : 0;
    // el sombrerazo se bambolea
    this.hat.rotation.z = 0.1 + Math.sin(this.phase) * (moving ? 0.1 : 0.03);
  }

  // ---------------- en línea ----------------
  // Lo que manda el anfitrión en cada foto (null = no hay Pombero).
  snapshot() {
    const z = this.z;
    if (!z.active) return null;
    return { x: z.pos.x, z: z.pos.z, yaw: z.yaw, st: STATES.indexOf(this.state) + 1 };
  }

  applyRemote(s) {
    const z = this.z;
    if (!s) {
      if (z.active) this.hide();
      return;
    }
    const st = STATES[s.st - 1] || 'toItem';
    if (!z.active) {
      z.active = true;
      z.pos.set(s.x, this.g.world.floorAt(s.x, s.z), s.z);
      z.yaw = s.yaw;
      this.setState(st);
      if (st === 'appear') this.appearFx();
    } else if (st !== this.state) this.setState(st);
    z.dead = st === 'dead';
    this.remote = s;
  }

  // El invitado lo acerca a la última posición que llegó.
  follow(dt) {
    const s = this.remote;
    if (!s) return;
    const z = this.z;
    const k = Math.min(1, dt * 12);
    z.pos.x += (s.x - z.pos.x) * k;
    z.pos.z += (s.z - z.pos.z) * k;
    if (this.g.world.levels) z.pos.y = this.g.world.floorAt(z.pos.x, z.pos.z);
    let d = s.yaw - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += d * k;
  }

  // Eventos del anfitrión: agarró un potenciador, lo soltó o se fue.
  applyEvent(m) {
    const g = this.g;
    if (m.a === 'grab') {
      const i = g.powerups.items.findIndex((x) => x.id === m.id);
      let mesh;
      if (i >= 0) {
        mesh = g.powerups.items[i].mesh;
        g.powerups.items.splice(i, 1);
      } else mesh = g.powerups.model(m.type);
      this.hold.add(mesh);
      mesh.position.set(0, 0, 0);
      this.carry = { id: m.id, type: m.type, mesh };
      g.audio.laugh?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    } else if (m.a === 'drop') {
      this.dropCarry();
      g.audio.yelp?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    } else if (m.a === 'gone') {
      this.appearFx();
      this.hide();
    } else if (m.a === 'hid') {
      // (el del pajonal: sin silbido ni tierra, una risita y ya no está)
      g.audio.laugh?.(tmpV.set(this.z.pos.x, this.z.pos.y + 0.5, this.z.pos.z));
      this.hide();
    }
  }

  dispose() {
    this.dropCarry();
    this.skin?.dispose();
    this.rig.removeFromParent();
  }
}

function sphereHit(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  if (t < 0 || t > maxT) return null;
  return t;
}
