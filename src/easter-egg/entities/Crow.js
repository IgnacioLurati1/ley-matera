import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POINTS, bossHealth, bossScale, zombieHealth } from '../config/rules';
import { MAP_ID, MAP_W, MAP_H, SKY } from '../config/map';
import CrowSkin from './crowSkin';

// El Cuervo: el jefe de la granja (lo que es el Capataz en el molino). Llega
// cada cinco rondas volando desde el maizal, da vueltas arriba de los
// jugadores, se queda quieto para escupir abanicos de plumas y cada tanto se
// tira en picada: si esquivás la picada queda un rato en el piso, aturdido,
// y ahí es cuando más le entra. Adentro de los galpones no llega.
//
// Para las armas es un "zombie" más (Zombies.raycast / inRadius / damage lo
// incluyen). En línea lo simula el anfitrión; los invitados lo ven por la
// foto de cada cuadro y las plumas llegan como evento (cada uno se fija si
// le pegan a él).

export const CROW_ID = 0xfffd;
const STATES = ['arrive', 'circle', 'aim', 'dive', 'perch', 'climb', 'dead'];
const CIRCLE_H = 9;
const CIRCLE_R = 8;
const FEATHER_SPEED = 21;
const FEATHER_DMG = 25;
const DIVE_DMG = 55;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export default class Crow {
  constructor(game) {
    this.g = game;
    this.z = { crow: true, active: false, dead: false, boss: true, dog: false, id: CROW_ID, pos: new THREE.Vector3(), yaw: 0, scale: 1, hp: 1, maxHp: 1, hidden: 0 };
    this.state = 'off';
    this.t = 0;
    this.feathers = [];
    this.rig = this.build();
    this.rig.visible = false;
    game.scene.add(this.rig);
    this.vel = new THREE.Vector3();
    this.orbit = 0;
  }

  // ---------------- modelo ----------------
  // Un cuervo enorme (casi seis metros de ala a ala): cuerpo ahusado, collar
  // de plumas erizadas, pico grueso que se abre al graznar, alas de dos
  // tramos con las plumas largas de la punta abiertas como dedos, cola en
  // abanico y garras que se esconden al volar. Negro con brillo azulado.
  build() {
    const black = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.3, metalness: 0.35, emissive: 0x07040d });
    const sheen = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.25, metalness: 0.5, emissive: 0x0a0718, side: THREE.DoubleSide });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.35, metalness: 0.2 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a10).multiplyScalar(3), toneMapped: false });
    const S = 2;
    this.S = S;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    this.body = body;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // pluma: rombo largo y chato (la base en el origen, apunta a +x)
    const feather = (len, wid) => new THREE.ConeGeometry(wid, len, 4).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0).scale(1, 0.12, 1);
    // cobertoras: filas de plumas cortas encimadas sobre el ala, apuntando atrás
    // (todas juntas en una sola malla)
    const coverts = (n, rows, step, len, x0, z0) => {
      const list = [];
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < n; i++) {
          // redondeadas, como escamas (las de rombo parecían púas)
          const l = len - row * 0.08 * S;
          const f = new THREE.SphereGeometry(1, 8, 4).scale(0.085 * S, 0.018 * S, l / 2).translate(0, 0, -l / 2).rotateY(0.1 - i * 0.02);
          list.push(f.translate(x0 + i * step + row * step * 0.5, (0.046 - row * 0.006) * S, z0 - row * 0.14 * S));
        }
      }
      return mergeGeometries(list.map((q) => q.toNonIndexed()));
    };
    // cuerpo ahusado (torno) apuntando a +z
    const prof = [[0, -0.95], [0.16, -0.8], [0.34, -0.45], [0.44, -0.05], [0.42, 0.3], [0.32, 0.58], [0.2, 0.76], [0, 0.86]].map(([r, y]) => new THREE.Vector2(r * S, y * S));
    add(body, new THREE.LatheGeometry(prof, 18).rotateX(Math.PI / 2).scale(0.95, 0.85, 1), black);
    // collar de plumas erizadas
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      add(body, feather(0.45 * S, 0.07 * S), sheen, Math.cos(a) * 0.22 * S, 0.1 * S + Math.sin(a) * 0.18 * S, 0.52 * S, 0, Math.PI / 2 + 0.35, a).scale.set(1, 1, 1);
    }
    // cabeza, pico (con la parte de abajo que se abre) y ojos
    this.head = new THREE.Group();
    this.head.position.set(0, 0.22 * S, 0.86 * S);
    body.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.27 * S, 16, 12).scale(0.9, 0.9, 1.15), black);
    add(this.head, new THREE.ConeGeometry(0.1 * S, 0.52 * S, 8).rotateX(Math.PI / 2).scale(0.8, 1, 1), beakMat, 0, 0.02 * S, 0.5 * S, 0.12, 0, 0);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.05 * S, 0.24 * S);
    this.head.add(this.jaw);
    add(this.jaw, new THREE.ConeGeometry(0.075 * S, 0.4 * S, 8).rotateX(Math.PI / 2).scale(0.75, 0.6, 1), beakMat, 0, -0.01 * S, 0.2 * S);
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.05 * S, 10, 8), this.eyeMat, s * 0.18 * S, 0.07 * S, 0.15 * S);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xff3a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      glow.scale.setScalar(0.45 * S);
      glow.position.set(s * 0.2 * S, 0.07 * S, 0.17 * S);
      this.head.add(glow);
    }
    // cola en abanico
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.05 * S, -0.8 * S);
    body.add(this.tail);
    this.tailFeathers = [];
    for (let i = 0; i < 9; i++) {
      const f = add(this.tail, feather(0.9 * S, 0.1 * S), sheen, 0, 0, 0, 0, Math.PI / 2 + (i - 4) * 0.1, 0);
      this.tailFeathers.push({ f, base: (i - 4) * 0.1 });
    }
    // alas: brazo (con cobertoras y secundarias) y mano (con las primarias)
    this.wings = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3 * S, 0.14 * S, 0.12 * S);
      shoulder.scale.x = s;
      body.add(shoulder);
      // el brazo: perfil redondeado (no una tabla) tapado de plumas cobertoras
      add(shoulder, new THREE.CapsuleGeometry(0.2 * S, 0.75 * S, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.22, 1.25).translate(0.55 * S, 0, 0.06 * S), black);
      add(shoulder, coverts(7, 2, 0.15 * S, 0.34 * S, 0.08 * S, 0.2 * S), sheen);
      const secondaries = [];
      for (let i = 0; i < 7; i++) {
        const f = add(shoulder, feather(0.6 * S, 0.11 * S), sheen, 0.1 * S + i * 0.15 * S, -0.01 * S, -0.18 * S, 0, Math.PI / 2 - 0.08 * i + 0.2, 0);
        secondaries.push(f);
      }
      const hand = new THREE.Group();
      hand.position.set(1.08 * S, 0, 0);
      shoulder.add(hand);
      add(hand, new THREE.CapsuleGeometry(0.17 * S, 0.45 * S, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.2, 1.2).translate(0.33 * S, 0, 0.02 * S), black);
      add(hand, coverts(5, 1, 0.13 * S, 0.3 * S, 0.02 * S, 0.14 * S), sheen);
      const primaries = [];
      for (let i = 0; i < 7; i++) {
        const f = add(hand, feather(1.05 * S - i * 0.05 * S, 0.1 * S), sheen, 0.55 * S, 0, (0.14 - i * 0.07) * S, 0, 0, 0);
        primaries.push({ f, base: 0.3 - i * 0.16 });
      }
      this.wings.push({ s, shoulder, hand, primaries, secondaries });
    }
    // patas con garras: estiradas al posarse, recogidas volando
    this.legs = new THREE.Group();
    this.legs.position.set(0, -0.35 * S, 0.05 * S);
    body.add(this.legs);
    for (const s of [-1, 1]) {
      add(this.legs, new THREE.CylinderGeometry(0.035 * S, 0.045 * S, 0.5 * S, 6), beakMat, s * 0.16 * S, -0.25 * S, 0);
      for (const a of [-0.45, 0, 0.45, Math.PI]) add(this.legs, new THREE.ConeGeometry(0.025 * S, 0.24 * S, 5).rotateX(Math.PI / 2).translate(0, 0, 0.12 * S), clawMat, s * 0.16 * S, -0.5 * S, 0, 0.3, a, 0);
    }
    this.featherMat = new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.4, emissive: 0x2a0a4a, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    this.featherGeo = feather(0.55, 0.07).rotateY(-Math.PI / 2);
    return root;
  }

  // ---------------- llegada ----------------
  spawn(round) {
    const g = this.g;
    if (this.z.active) return false;
    const z = this.z;
    const players = g.rounds?.players || 1;
    z.maxHp = Math.max(4000, Math.max(bossHealth(round) * 0.7, zombieHealth(round) * 10)) * bossScale(players);
    z.hp = z.maxHp;
    z.active = true;
    z.dead = false;
    // aparece lejos, del lado del maizal, alto
    const a = Math.random() * Math.PI * 2;
    z.pos.set((SKY.center?.[0] ?? MAP_W / 2) + Math.cos(a) * 60, 22, (SKY.center?.[1] ?? MAP_H / 2) + Math.sin(a) * 60);
    this.vel.set(0, 0, 0);
    this.setState('arrive');
    this.shootCd = 3;
    this.diveCd = 8;
    this.divePlot = null;
    this.rig.visible = true;
    // el cuerpo de verdad (entities/crowSkin.js): baja la primera vez que viene
    // (por ahora solo en La Tapera: en la torre sigue el de piezas)
    if (MAP_ID === 'granja') this.skin ||= new CrowSkin(this);
    g.audio.bossSfx('crow');
    return true;
  }

  // Se va sin morir (la pelea final lo espanta).
  remove() {
    const z = this.z;
    z.active = false;
    z.dead = false;
    this.state = 'off';
    this.rig.visible = false;
    for (const f of this.feathers) f.mesh.removeFromParent();
    this.feathers = [];
    this.g.hud.setBossBar(null);
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    this.t = 0;
    if (s === prev) return;
    const a = this.g.audio;
    if (s === 'dive') a.crowScreech(this.z.pos);
    else if (s === 'aim') this.caw(2);
    else if (s === 'dead') {
      this.caw(4);
      a.crowScreech(this.z.pos);
    }
    // (al llegar suena solo el grabado, audio.bossSfx('crow'): el chillido y
    // los graznidos sintetizados de encima sonaban a 8 bits, pedido del usuario)
  }

  // A qué altura queda el medio del cuerpo posado (el de verdad tiene las patas
  // más largas que el de piezas: entities/crowSkin.js)
  perchY() {
    return this.skin?.perchY || 1.1;
  }

  // El jugador de pie más cercano.
  target() {
    const z = this.z;
    return this.g.nearestPlayer(z.pos.x, z.pos.z, z.pos.y - 2);
  }

  // ¿Está a cielo abierto (lo puede ver y alcanzar desde arriba)?
  exposed(p) {
    const w = this.g.world;
    // en la torre: pegado a las arcadas o en la cima
    if (w.tower) return w.tower.exposed(p.pos);
    return !w.isIndoorCell(Math.floor(p.pos.x), Math.floor(p.pos.z));
  }

  // ---------------- cerebro (anfitrión) ----------------
  update(dt) {
    const g = this.g;
    this.updateFeathers(dt);
    if (!this.z.active) return;
    this.t += dt;
    if (g.net?.guest) {
      this.follow(dt);
      this.animate(dt);
      return;
    }
    const z = this.z;
    const tgt = this.target();
    if (!z.dead) g.hud.setBossBar('El Cuervo', Math.max(0, z.hp / z.maxHp));
    // la torre: da vueltas por afuera de la torre, a la altura del piso del que persigue
    const T = g.world.tower;
    if (tgt) this.baseY = tgt.pos.y || 0;
    const base = T ? this.baseY || 0 : 0;
    const CH = T ? base + 2.4 : CIRCLE_H;
    const oc = T ? { x: T.T.cx, z: T.T.cz } : tgt ? tgt.pos : g.player.pos;
    const OR = T ? 18 : CIRCLE_R;
    const face = (x, zz, rate) => {
      let d = Math.atan2(x - z.pos.x, zz - z.pos.z) - z.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      z.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
    };
    const fly = (tx, ty, tz, speed) => {
      tmpV.set(tx - z.pos.x, ty - z.pos.y, tz - z.pos.z);
      const d = tmpV.length();
      if (d > 0.01) tmpV.multiplyScalar(Math.min(speed, d / Math.max(dt, 1e-3)) / d);
      this.vel.lerp(tmpV, Math.min(1, dt * 3));
      z.pos.addScaledVector(this.vel, dt);
      return d;
    };
    switch (this.state) {
      case 'arrive': {
        const p = tgt ? tgt.pos : g.player.pos;
        let ax = p.x;
        let az = p.z;
        if (T) {
          const a = Math.atan2(z.pos.z - oc.z, z.pos.x - oc.x);
          ax = oc.x + Math.cos(a) * OR;
          az = oc.z + Math.sin(a) * OR;
        }
        const d = fly(ax, CH, az, 14);
        face(p.x, p.z, 3);
        if (d < (T ? 2.5 : CIRCLE_R + 2)) {
          this.setState('circle');
          this.orbit = Math.atan2(z.pos.z - oc.z, z.pos.x - oc.x);
        }
        break;
      }
      case 'circle': {
        if (!tgt) {
          fly(z.pos.x + Math.cos(this.orbit) * 2, CH + 3, z.pos.z + Math.sin(this.orbit) * 2, 5);
          break;
        }
        this.orbit += dt * 0.55;
        const cx = oc.x + Math.cos(this.orbit) * OR;
        const cz = oc.z + Math.sin(this.orbit) * OR;
        fly(cx, CH + Math.sin(this.t * 0.8) * 0.8, cz, 9);
        face(z.pos.x + this.vel.x, z.pos.z + this.vel.z, 4);
        this.shootCd -= dt;
        this.diveCd -= dt;
        const seen = this.exposed(tgt) && g.world.clear(tmpV2.copy(z.pos), tmpV.set(tgt.pos.x, (tgt.pos.y || 0) + 1.5, tgt.pos.z));
        // la defensa del yerbal (granja): una picada sí y otra no va sobre una
        // parcela (todas, si no ve a nadie)
        if (this.diveCd <= 0 && g.defense?.active && (!seen || (this.plotTurn = !this.plotTurn))) {
          const plot = g.defense.crowPlot();
          if (plot) {
            this.diveCd = (z.hp < z.maxHp * 0.5 ? 7 : 10) + Math.random() * 3;
            this.diveAt = new THREE.Vector3(plot.x, plot.y + this.perchY(), plot.z);
            this.divePlot = plot.i;
            this.setState('dive');
            // (en la forja de la hoz va al techo del establo: entities/FarmEgg.js)
            break;
          }
        }
        if (!seen) break;
        if (this.diveCd <= 0) {
          this.diveCd = (z.hp < z.maxHp * 0.5 ? 7 : 10) + Math.random() * 3;
          this.divePlot = null;
          this.diveAt = new THREE.Vector3(tgt.pos.x, (tgt.pos.y || 0) + this.perchY(), tgt.pos.z);
          this.setState('dive');
        } else if (this.shootCd <= 0) {
          this.shootCd = (z.hp < z.maxHp * 0.5 ? 3.2 : 4.5) + Math.random() * 1.5;
          this.setState('aim');
          this.volleys = z.hp < z.maxHp * 0.5 ? 3 : 2;
        }
        break;
      }
      case 'aim': {
        // se queda quieto en el aire, abre las alas y escupe plumas en abanico
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
        z.pos.addScaledVector(this.vel, dt);
        if (tgt) face(tgt.pos.x, tgt.pos.z, 5);
        if (this.t > 0.8 && this.volleys > 0 && tgt) {
          this.volleys--;
          this.t = 0.35;
          this.volley(tgt);
        }
        if (this.volleys <= 0 && this.t > 0.9) this.setState('circle');
        break;
      }
      case 'dive': {
        const p = this.diveAt;
        if (this.t < 0.6) {
          // toma aire antes de tirarse
          this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
          z.pos.y += dt * 2;
          face(p.x, p.z, 6);
          break;
        }
        const d = fly(p.x, p.y, p.z, 19);
        face(p.x, p.z, 8);
        // atropella a los que agarra en la bajada
        this.hitPlayers(1.7, DIVE_DMG);
        // (el techo del establo en la forja de la granja queda más alto de lo que
        // vuela: por la altura sola se "posaría" en el aire lejos de ahí)
        if (d < 0.8 || (z.pos.y < p.y + 0.2 && Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < 2)) {
          this.setState('perch');
          z.pos.y = p.y;
          this.vel.set(0, 0, 0);
          if (this.divePlot != null) g.defense?.crowHit(this.divePlot);
          g.fx.dust(tmpV.set(z.pos.x, p.y - 1, z.pos.z), { x: 0, y: 1, z: 0 }, [0.4, 0.35, 0.3], 14);
          g.fx.addShake(0.3);
          g.audio.bossSlam(tmpV.set(z.pos.x, p.y - 0.6, z.pos.z));
        }
        break;
      }
      case 'perch':
        if (tgt) face(tgt.pos.x, tgt.pos.z, 2);
        // si lo tenés encima, picotea
        if (this.t > 0.6 && Math.random() < dt * 1.5) this.hitPlayers(2.2, 30);
        // posado sobre una parcela, la picotea
        if (this.divePlot != null) g.defense?.crowPeck(this.divePlot, dt);
        if (this.t > 2.6) {
          this.divePlot = null;
          this.setState('climb');
          this.caw(2);
        }
        break;
      case 'climb': {
        const p = tgt ? tgt.pos : z.pos;
        if (T) {
          // vuelve a salir por la arcada más cercana
          const a = Math.atan2(z.pos.z - oc.z, z.pos.x - oc.x);
          fly(oc.x + Math.cos(a) * OR, CH + 1, oc.z + Math.sin(a) * OR, 10);
        } else fly(z.pos.x + (z.pos.x - p.x) * 0.5, CIRCLE_H + 1, z.pos.z + (z.pos.z - p.z) * 0.5, 10);
        if (this.t > (T ? 2.4 : 1.6) || (!T && z.pos.y > CIRCLE_H - 0.5)) {
          this.setState('circle');
          this.orbit = tgt ? Math.atan2(z.pos.z - oc.z, z.pos.x - oc.x) : 0;
        }
        break;
      }
      case 'dead': {
        // cae dando vueltas y se deshace en plumas
        const fl = (T ? g.world.floorAt(z.pos.x, z.pos.z, z.pos.y) : 0) + 0.6;
        if (z.pos.y > fl) {
          this.vel.y -= 14 * dt;
          z.pos.addScaledVector(this.vel, dt);
          z.yaw += dt * 8;
          if (z.pos.y <= fl) {
            z.pos.y = fl;
            g.fx.dust(tmpV.set(z.pos.x, fl - 0.5, z.pos.z), { x: 0, y: 1, z: 0 }, [0.1, 0.1, 0.12], 30);
            g.fx.addShake(0.4);
          }
        }
        if (this.t > 4) this.remove();
        break;
      }
      default:
        break;
    }
    this.animate(dt);
  }

  // Le pega a los que están cerca (picada o picotazo).
  hitPlayers(radius, dmg) {
    const g = this.g;
    const z = this.z;
    this.hitSet ||= new Set();
    if (this.state !== this.hitState) {
      this.hitSet.clear();
      this.hitState = this.state;
    }
    const list = g.player.canBeHit() ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost) list.push(r);
    for (const p of list) {
      if (this.hitSet.has(p)) continue;
      const dy = Math.abs((p.pos.y || 0) + 1 - z.pos.y);
      if (Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) > radius || dy > 2) continue;
      this.hitSet.add(p);
      g.damagePlayer(p, dmg, z.pos);
    }
  }

  // Abanico de plumas hacia el objetivo (todos las ven volar).
  volley(tgt) {
    const g = this.g;
    const z = this.z;
    const from = tmpV2.set(z.pos.x + Math.sin(z.yaw) * 1.4, z.pos.y + 0.3, z.pos.z + Math.cos(z.yaw) * 1.4).clone();
    const aim = new THREE.Vector3(tgt.pos.x - from.x, (tgt.pos.y || 0) + 1.3 - from.y, tgt.pos.z - from.z).normalize();
    const n = 5;
    const list = [];
    for (let i = 0; i < n; i++) {
      const v = aim.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (i - (n - 1) / 2) * 0.13).multiplyScalar(FEATHER_SPEED);
      list.push(+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2));
    }
    this.spawnFeathers(from, list);
    g.net?.event('feather', { x: +from.x.toFixed(2), y: +from.y.toFixed(2), z: +from.z.toFixed(2), v: list });
  }

  spawnFeathers(from, list) {
    const g = this.g;
    for (let i = 0; i < list.length; i += 3) {
      const mesh = new THREE.Mesh(this.featherGeo, this.featherMat);
      mesh.position.copy(from);
      const vel = new THREE.Vector3(list[i], list[i + 1], list[i + 2]);
      mesh.lookAt(tmpV.copy(from).add(vel));
      g.scene.add(mesh);
      this.feathers.push({ mesh, vel, t: 0, from: from.clone() });
    }
    g.audio.featherFwip(from);
  }

  // Las plumas vuelan igual en todas las compus: cada uno se fija si le pegan.
  updateFeathers(dt) {
    const g = this.g;
    for (let i = this.feathers.length - 1; i >= 0; i--) {
      const f = this.feathers[i];
      f.t += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      if (Math.random() < 0.5) g.fx.sparkle(f.mesh.position, [0.45, 0.25, 0.7], 1, 0.05);
      const hit = g.player.canBeHit() && f.mesh.position.distanceTo(g.camera.position) < 0.75;
      const wall = f.t > 0.05 && Math.random() < 0.5 && !g.world.clear(tmpV.copy(f.mesh.position).addScaledVector(f.vel, -dt), f.mesh.position);
      if (hit || wall || f.t > 3 || f.mesh.position.y < 0.05) {
        if (hit) g.player.damage(FEATHER_DMG, f.from);
        g.fx.sparks(f.mesh.position, 0.4, { x: 0, y: 1, z: 0 }, [0.3, 0.2, 0.4]);
        f.mesh.removeFromParent();
        this.feathers.splice(i, 1);
      }
    }
  }

  // ---------------- daño ----------------
  hitTest(o, d, maxT) {
    const z = this.z;
    if (!z.active || z.dead) return null;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const head = sphereHit(o, d, z.pos.x + fx * 1.75, z.pos.y + 0.45, z.pos.z + fz * 1.75, 0.6, maxT);
    const body = sphereHit(o, d, z.pos.x, z.pos.y, z.pos.z, 1.15, maxT);
    // las alas abiertas también reciben
    const wingR = this.state === 'dive' ? null : sphereHit(o, d, z.pos.x + fz * 2.3, z.pos.y + 0.3, z.pos.z - fx * 2.3, 1, maxT);
    const wingL = this.state === 'dive' ? null : sphereHit(o, d, z.pos.x - fz * 2.3, z.pos.y + 0.3, z.pos.z + fx * 2.3, 1, maxT);
    let best = null;
    for (const [t, zone] of [[head, 'head'], [body, 'torso'], [wingR, 'torso'], [wingL, 'torso']]) {
      if (t !== null && (!best || t < best.t)) best = { z, t, zone };
    }
    return best;
  }

  damage(amount, info = {}) {
    const g = this.g;
    const z = this.z;
    if (!z.active || z.dead) return false;
    const type = info.type || 'bullet';
    if (type === 'nuke') return false;
    let dmg = amount;
    if (['chain', 'freeze', 'blast'].includes(type)) dmg = 2500;
    if (type === 'scald') dmg = 320;
    if (info.zone === 'head') dmg *= 1.4;
    // tirado en el piso le entra más
    if (this.state === 'perch') dmg *= 1.6;
    // ni la hoz ni el oro lo bajan de un golpe
    dmg = Math.min(dmg, 1600);
    z.hp -= dmg;
    if (info.point) g.fx.sparks(info.point, 0.5, info.dir ? { x: -info.dir.x, y: 0.4, z: -info.dir.z } : { x: 0, y: 1, z: 0 }, [0.15, 0.15, 0.2]);
    if (z.hp > 0) {
      g.zombies.lastPoints = POINTS.hit;
      if (!info.noPoints) g.addPoints(POINTS.hit, info.point);
      if (Math.random() < 0.06) this.caw(1);
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
    this.vel.set(this.vel.x * 0.3, 2, this.vel.z * 0.3);
    g.zombies.lastPoints = POINTS.boss;
    if (!info.noPoints) g.addPoints(POINTS.boss, info.point);
    if (info.by != null && g.net?.host && info.by !== g.net.id) g.net.creditKill(info.by, type, info.zone);
    else g.stats.kills++;
    g.audio.sting();
    g.hud.setBossBar(null);
    g.fx.explosion(tmpV.set(z.pos.x, z.pos.y, z.pos.z), 2.5, [0.15, 0.1, 0.2]);
    const at = new THREE.Vector3(z.pos.x, g.world.tower ? g.world.floorAt(z.pos.x, z.pos.z, z.pos.y) : 0, z.pos.z);
    g.later(1.2, () => g.powerups.drop(at, true));
    g.ee?.onCrowDead?.(at);
  }

  // ---------------- animación ----------------
  animate(dt) {
    const g = this.g;
    const z = this.z;
    const r = this.rig;
    r.visible = z.active;
    if (!z.active) return;
    r.position.copy(z.pos);
    // se inclina en las curvas (según cuánto gira)
    const turn = this.lastYaw == null ? 0 : wrap(z.yaw - this.lastYaw) / Math.max(dt, 1e-3);
    this.lastYaw = z.yaw;
    this.bank = (this.bank || 0) + (Math.max(-0.7, Math.min(0.7, -turn * 0.35)) - (this.bank || 0)) * Math.min(1, dt * 3);
    r.rotation.set(0, z.yaw, 0);
    const st = this.state;
    const flying = st === 'arrive' || st === 'circle' || st === 'climb' || st === 'aim';
    this.flap = (this.flap || 0) + dt * (st === 'aim' ? 7.5 : st === 'climb' || st === 'arrive' ? 6.5 : 4.2);
    const ph = this.flap;
    // planea de a ratos (alas quietas y abiertas)
    const glide = st === 'circle' && Math.sin(this.t * 0.55) > 0.25;
    this.glideK = (this.glideK || 0) + ((glide ? 1 : 0) - (this.glideK || 0)) * Math.min(1, dt * 3);
    const gk = this.glideK;
    const down = Math.sin(ph);
    let shoulder = (0.12 + down * 0.7) * (1 - gk) + 0.08 * gk;
    let hand = (-0.15 - Math.max(0, -Math.cos(ph)) * 0.75) * (1 - gk) + 0.12 * gk;
    let sweep = 0;
    let spread = 1;
    let pitch = 0;
    let roll = this.bank;
    let bob = flying ? -down * 0.12 * (1 - gk) : 0;
    this.legs.rotation.x = 1.3;
    this.legs.visible = true;
    if (st === 'dive' && this.t > 0.6) {
      // picada: alas plegadas hacia atrás, cabeza abajo
      shoulder = -0.25;
      hand = -1.1;
      sweep = 0.9;
      spread = 0.2;
      pitch = 0.75;
      roll = 0;
    } else if (st === 'dive') {
      // toma aire: alas bien arriba
      shoulder = 1.1;
      hand = 0.2;
      pitch = -0.3;
    } else if (st === 'perch') {
      shoulder = -0.05 + Math.sin(this.t * 16) * 0.05;
      hand = -1.4;
      sweep = 1;
      spread = 0.1;
      pitch = -0.25;
      roll = 0;
      bob = 0;
      this.legs.rotation.x = 0;
    } else if (st === 'dead') {
      shoulder = 0.9;
      hand = 0.1;
      roll = Math.min(1.6, this.t * 2.5);
    } else if (st === 'aim') {
      // se para en el aire: cuerpo derecho y aletea fuerte
      pitch = -0.55;
      roll = 0;
    }
    r.position.y += bob;
    // (la pose, también para el cuerpo de verdad: entities/crowSkin.js)
    const open = spread * (0.6 + Math.max(0, down) * 0.5 * (1 - gk) + gk * 0.4);
    const fan = st === 'dive' ? 0.3 : st === 'perch' ? 0.5 : 1 + gk * 0.4;
    this.pose = { shoulder, hand, sweep, spread, pitch, roll, open, fan };
    this.body.rotation.set(pitch, 0, roll);
    for (const w of this.wings) {
      // el ala izquierda está espejada: el giro del hombro lleva el signo; el de la mano no
      w.shoulder.rotation.set(0, w.s * sweep * 0.6, w.s * shoulder);
      w.hand.rotation.set(0, sweep * 0.7, hand);
      // las primarias se abren como dedos al bajar el ala
      for (const p of w.primaries) p.f.rotation.y = p.base * open;
    }
    for (const t of this.tailFeathers) t.f.rotation.y = Math.PI / 2 + t.base * fan;
    this.tail.rotation.x = st === 'dive' ? 0.25 : Math.sin(ph * 0.5) * 0.06 + pitch * -0.3;
    // la cabeza mira al que tiene más cerca; el pico se abre al graznar
    const tgt = g.net?.guest ? g.player : this.target();
    if (tgt && st !== 'dead') {
      const a = wrap(Math.atan2(tgt.pos.x - z.pos.x, tgt.pos.z - z.pos.z) - z.yaw);
      this.head.rotation.y += (Math.max(-0.9, Math.min(0.9, a)) - this.head.rotation.y) * Math.min(1, dt * 5);
      this.head.rotation.x = st === 'dive' ? 0.3 : 0.25;
    }
    this.cawOpen = Math.max(0, (this.cawOpen || 0) - dt * 2.5);
    this.jaw.rotation.x = Math.min(0.55, this.cawOpen * 0.7);
    // los ojos brillan más al apuntar o antes de tirarse
    const hot = st === 'aim' || (st === 'dive' && this.t < 0.6);
    this.eyeMat.color.setRGB(1, hot ? 0.35 : 0.16, 0.06).multiplyScalar(hot ? 4.5 : 3);
    // el cuerpo de verdad copia la pose de las piezas (si ya bajó)
    this.skin?.update(dt);
    // sonido: un aletazo por cada bajada del ala; graznidos de vez en cuando
    if (flying && gk < 0.5) {
      const d = Math.sin(ph) < 0;
      if (d && !this.flapDown) g.audio.wingFlap(z.pos, st === 'aim' ? 1.2 : 0.8);
      this.flapDown = d;
    }
    this.cawT = (this.cawT ?? 2) - dt;
    if (this.cawT <= 0 && st !== 'dead') {
      this.cawT = 2.6 + Math.random() * 3.5;
      this.caw(1 + Math.floor(Math.random() * 2));
    }
    // se le caen plumas
    if (flying && Math.random() < dt * 1.5) {
      g.fx.alpha.spawn(z.pos.x + (Math.random() - 0.5) * 2, z.pos.y, z.pos.z + (Math.random() - 0.5) * 2, 0, -0.6, 0, { color: [0.06, 0.06, 0.09], size: 0.14, life: 3, alpha: 0.9, gravity: 0.25, drag: 0.6 });
    }
  }

  caw(n = 1) {
    this.g.audio.bigCaw(this.z.pos, n);
    this.cawOpen = 0.7 + n * 0.4;
  }

  // ---------------- en línea ----------------
  snapshot() {
    const z = this.z;
    if (!z.active) return null;
    return { x: z.pos.x, y: z.pos.y, z: z.pos.z, yaw: z.yaw, st: STATES.indexOf(this.state) + 1, hp: Math.max(0, z.hp / z.maxHp) };
  }

  applyRemote(s) {
    const g = this.g;
    const z = this.z;
    if (!s) {
      if (z.active) this.remove();
      return;
    }
    const st = STATES[s.st - 1] || 'circle';
    if (!z.active) {
      z.active = true;
      z.pos.set(s.x, s.y, s.z);
      z.yaw = s.yaw;
      this.rig.visible = true;
      if (MAP_ID === 'granja') this.skin ||= new CrowSkin(this);
      this.state = 'off';
      // (el invitado también lo oye llegar; no si entra con el Cuervo ya peleando)
      if (st === 'arrive') g.audio.bossSfx('crow');
    }
    if (st !== this.state) this.setState(st);
    z.dead = st === 'dead';
    z.hp = s.hp;
    z.maxHp = 1;
    this.remote = s;
    g.hud.setBossBar(z.dead ? null : 'El Cuervo', s.hp);
  }

  follow(dt) {
    const s = this.remote;
    if (!s) return;
    const z = this.z;
    const k = Math.min(1, dt * 10);
    z.pos.x += (s.x - z.pos.x) * k;
    z.pos.y += (s.y - z.pos.y) * k;
    z.pos.z += (s.z - z.pos.z) * k;
    let d = s.yaw - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += d * k;
  }

  dispose() {
    for (const f of this.feathers) f.mesh.removeFromParent();
    this.feathers = [];
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

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
