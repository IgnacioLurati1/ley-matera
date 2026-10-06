import * as THREE from 'three';
import { EE } from '../../config/map';
import { compactGroup } from '../../world/props';

// La Escuadra Realista (el evento de cada 10 rondas del Monumento: 10, 20,
// 30...). Como el 27 de febrero de 1812, los bergantines del rey suben por el
// Paraná: se ponen enfrente de la costanera y cañonean la orilla (cada bala
// marca dónde va a caer con un círculo colorado en el piso), y los botes
// desembarcan la horda por la costanera y el muelle.
//  - La Batería Libertad responde: el cañón de la punta del Parque se carga
//    y se dispara manteniendo F; apunta solo al bergantín más cerca. Tres
//    cañonazos hunden uno.
//  - Si se hunden los tres: el botín de la escuadra (munición llena, puntos
//    para todos y un potenciador al pie de la Batería). Si no, cuando cae la
//    horda la escuadra se va río abajo.
// En línea lo lleva el anfitrión y lo cuenta por 'pee' (k: 'arm'); cada compu
// dibuja los barcos con el mismo reloj y se cuida su propio jugador de las balas.
// Además (el usuario, 2026-10-05): la escuadra sube sí o sí mientras se lleva
// la Bandera al mástil (forFlag, desde Bandera.js) y desaparece al izarla,
// antes de la escena de Belgrano (vanish); y los cascos chocan: no se los
// atraviesa nadando, ni los muertos (collide). __mduNoArmadaFlag /
// __mduNoShipCollide: como antes.

const EVERY = 10;
const SHIPS = 3;
const SHIP_HP = 3;
const SAIL_T = 14;
// dónde echa el ancla cada uno (x en el río, z frente a la costanera)
const ANCHOR = [[138, 14], [146, 31], [139, 48]];
const START_Z = 175;
const VOLLEY = [7.5, 10.5];
const FLIGHT = 1.7;
const BLAST_R = 2.8;
const BLAST_DMG = 55;
const CANNON_RELOAD = 4.5;
const CANNON_FLIGHT = 1.3;
const REWARD_PTS = 1500;
const WATER = -5.2;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const isHost = (g) => !g.net || g.net.host;
const ease = (k) => 1 - (1 - k) * (1 - k) * (1 - k);

// Un bergantín: el casco negro con la franja de las troneras, la cubierta,
// los dos palos con sus velas cuadradas, el bauprés y la bandera del rey en
// la popa. El eje largo es z (navega por el río), la proa hacia -z.
function shipModel(M) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.8 });
  const band = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.6 });
  const wood = M.woodDark || M.wood;
  const sail = new THREE.MeshStandardMaterial({ color: 0xdcd2b8, roughness: 0.95, side: THREE.DoubleSide });
  const flagTex = (() => {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#b4141e';
    x.fillRect(0, 0, 96, 64);
    x.fillStyle = '#f2c018';
    x.fillRect(0, 16, 96, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const flag = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 });
  // el casco: la planta con la proa en punta, levantada 3,2 m (la mitad abajo del agua)
  const L = 22;
  const B = 3.1;
  const sh = new THREE.Shape();
  sh.moveTo(-B, L / 2);
  sh.lineTo(B, L / 2);
  sh.lineTo(B, -L / 2 + 5);
  sh.quadraticCurveTo(B * 0.7, -L / 2 + 1, 0, -L / 2 - 1.6);
  sh.quadraticCurveTo(-B * 0.7, -L / 2 + 1, -B, -L / 2 + 5);
  sh.closePath();
  const hg = new THREE.ExtrudeGeometry(sh, { depth: 4.2, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, -1.6, 0);
  // (la planta: x = manga, y del dibujo = largo; al rotar queda en z)
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    g.add(m);
    return m;
  };
  add(hg, hull);
  // la franja dorada y las troneras (cuadraditos negros a los costados)
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.5, L - 4), band, s * (B + 0.02), 1.6, 1.2);
    for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(0.08, 0.32, 0.42), hull, s * (B + 0.05), 1.62, -6 + k * 2.4);
  }
  // el castillo de popa y la baranda
  add(new THREE.BoxGeometry(B * 2 - 0.2, 1.1, 5), hull, 0, 3.15, L / 2 - 2.6);
  add(new THREE.BoxGeometry(0.4, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffb050, emissiveIntensity: 2.4 }), 0, 3.6, L / 2 + 0.05);
  // los palos, las vergas y las velas
  for (const [z, h] of [[-3.5, 17], [4.5, 15.5]]) {
    add(new THREE.CylinderGeometry(0.16, 0.24, h, 8), wood, 0, 2.6 + h / 2, z);
    for (const [y, w] of [[h * 0.42, 9], [h * 0.7, 7], [h * 0.92, 4.6]]) {
      add(new THREE.CylinderGeometry(0.08, 0.08, w, 6), wood, 0, 2.6 + y, z, 0, 0, Math.PI / 2);
      const sg = new THREE.PlaneGeometry(w * 0.92, h * 0.24, 6, 3);
      const p = sg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, -Math.cos((p.getX(i) / (w * 0.46)) * Math.PI * 0.5) * 0.7 - (0.5 - p.getY(i) / (h * 0.24)) * 0.2);
      sg.computeVertexNormals();
      add(sg, sail, 0, 2.6 + y - h * 0.13, z - 0.3);
    }
  }
  // el bauprés y la bandera del rey en la popa (rojo, amarillo, rojo)
  add(new THREE.CylinderGeometry(0.1, 0.14, 8, 6), wood, 0, 3.2, -L / 2 - 3.2, Math.PI / 2 - 0.35);
  add(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), wood, 0, 5.6, L / 2 - 0.6);
  add(new THREE.PlaneGeometry(2.2, 1.4), flag, 0, 6.8, L / 2 + 0.6, 0, Math.PI / 2);
  compactGroup(g);
  return g;
}

export default class Armada {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'armada';
    g.scene.add(this.root);
    // on: 0 nada, 1 en curso; t: segundos desde que arrancó (todas las compus)
    this.st = { on: 0, t: 0, hp: [], done: 0, won: 0 };
    this.ships = [];
    this.balls = [];
    this.marks = [];
    this.last = 0;
    this.reload = [0, 0];
    this.nextVolley = [];
    this.buildCannon();
  }

  get M() {
    return this.g.world.M;
  }

  // (ojo: `active` no, que Zombies lo lee como el de la defensa del yerbal)
  get running() {
    return this.st.on === 1;
  }

  // (las rondas: no frena el fin de la ronda; la horda sí)
  get holding() {
    return false;
  }

  onRound(R) {
    if (!isHost(this.g) || this.st.on) return;
    if (R.round % EVERY === 0 && !this.ee.scene) this.send({ a: 'start', r: R.round });
  }

  onRoundEnd() {
    if (!isHost(this.g) || this.st.on !== 1) return;
    // (con la Bandera en camino al mástil, la escuadra no se va al terminar la ronda)
    if (this.flagWalk()) return;
    this.send({ a: 'end', won: this.st.hp.every((h) => h <= 0) ? 1 : 0 });
  }

  // Durante la escuadra la mitad de la horda desembarca por la costanera y el
  // muelle (si esa parte ya está abierta).
  spawnAt() {
    const g = this.g;
    if (this.st.on !== 1 || Math.random() < 0.5 || !g.activeZones?.has('H')) return null;
    const wins = g.barriers?.windows.filter((w) => w.zone === 'H') || [];
    if (!wins.length) return null;
    return { kind: 'window', w: wins[Math.floor(Math.random() * wins.length)] };
  }

  // ¿Se está llevando la Bandera al mástil (o izándola)?
  flagWalk() {
    const B = this.ee.bnd?.st;
    return !globalThis.__mduNoArmadaFlag && !!B && !B.done && (B.flag === 'held' || B.flag === 'floor' || B.flag === 'mast');
  }

  // La Bandera salió de la costurera: la escuadra sube por el río (sí o sí).
  forFlag() {
    if (globalThis.__mduNoArmadaFlag || !isHost(this.g) || this.st.on === 1) return;
    this.send({ a: 'start', flag: 1 });
  }

  // Izada la Bandera: la escuadra desaparece (antes de la escena de Belgrano).
  // En todas las compus (Bandera.apply 'up' → MonumentoEgg.onBanderaIzada).
  vanish() {
    if (globalThis.__mduNoArmadaFlag) return;
    this.st.on = 0;
    for (const s of this.ships) s.obj.removeFromParent();
    this.ships = [];
    for (const b of this.balls) b.ball.removeFromParent();
    this.balls.length = 0;
    for (const m of this.marks) {
      m.mesh.removeFromParent();
      m.mesh.material.dispose();
    }
    this.marks.length = 0;
  }

  // ---------------- la Batería Libertad ----------------
  buildCannon() {
    const g = this.g;
    const [bx, bz] = EE.bateria;
    this.gun = g.world.mon?.bateria?.[0] || null;
    const gz = this.gun ? this.gun.position.z : bz - 0.3;
    const y = g.world.floorAt(bx, gz);
    this.gunIt = g.interact.add({
      kind: 'canonArmada',
      pos: new THREE.Vector3(bx - 0.4, y + 1.0, gz),
      floorY: y,
      radius: 1.9,
      holdTime: 0.5,
      prompt: () => {
        if (this.st.on !== 1) return null;
        if (!this.ships.some((s) => s.alive)) return null;
        if (this.reload[0] > 0) return { text: 'cargando el cañón…', noCost: true, info: true };
        return { text: 'disparar a la escuadra', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        if (this.st.on !== 1 || this.reload[0] > 0) return false;
        if (isHost(g)) this.fire();
        return true;
      },
    });
  }

  // El cañón de la Batería: al bergantín vivo más cerca.
  fire() {
    let best = -1;
    let bd = Infinity;
    const [bx, bz] = EE.bateria;
    this.ships.forEach((s, i) => {
      if (!s.alive) return;
      const d = Math.hypot(s.pos.x - bx, s.pos.z - bz);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return;
    this.send({ a: 'shot', i: best });
  }

  // ---------------- la red ----------------
  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'arm', ...m });
  }

  apply(m) {
    const g = this.g;
    switch (m.a) {
      case 'start':
        this.start(false, !!m.flag);
        break;
      case 'ball':
        this.launch(m.i, m.x, m.y, m.z);
        break;
      case 'shot':
        this.shoot(m.i);
        break;
      case 'hit':
        this.hitShip(m.i, m.hp);
        break;
      case 'end':
        this.finish(m.won);
        break;
      default:
    }
    void g;
  }

  state() {
    return { on: this.st.on, t: +this.st.t.toFixed(2), hp: [...this.st.hp], won: this.st.won };
  }

  applyFull(s) {
    if (!s || !s.on) return;
    if (!this.st.on) this.start(true);
    this.st.t = s.t || 0;
    s.hp?.forEach((h, i) => {
      this.st.hp[i] = h;
      if (h <= 0 && this.ships[i]) {
        this.ships[i].alive = false;
        this.ships[i].obj.visible = false;
      }
    });
  }

  // ---------------- el evento ----------------
  start(quiet = false, flag = false) {
    const g = this.g;
    this.st.on = 1;
    this.st.t = 0;
    this.st.won = 0;
    this.st.hp = Array.from({ length: SHIPS }, () => SHIP_HP);
    this.ships.forEach((s) => s.obj.removeFromParent());
    this.ships = ANCHOR.map(([x, z], i) => {
      const obj = shipModel(this.M);
      obj.position.set(x, WATER, START_Z + i * 18);
      this.root.add(obj);
      return { obj, pos: obj.position, anchor: new THREE.Vector3(x, WATER, z), alive: true, sink: 0, phase: i * 1.7, kick: 0 };
    });
    this.nextVolley = this.ships.map((_, i) => SAIL_T + 2 + i * 2.5);
    this.reload = [0, 0];
    if (quiet) return;
    g.hud.subtitle?.(flag ? '¡La escuadra realista viene por la Bandera!' : '¡La escuadra realista sube por el Paraná!', 4);
    g.audio.bugle?.(tmpV.set(102, -1, 9));
    // dos cañonazos lejos, río abajo: ya vienen
    g.later?.(1.2, () => g.audio.explosion?.(tmpV.set(150, WATER, 120), 0.6));
    g.later?.(2.4, () => g.audio.explosion?.(tmpV.set(156, WATER, 140), 0.6));
  }

  finish(won) {
    const g = this.g;
    if (this.st.on !== 1) return;
    this.st.on = 0;
    this.st.won = won ? 1 : 0;
    for (const m of this.marks) m.mesh.removeFromParent();
    this.marks.length = 0;
    if (won) {
      g.hud.subtitle?.('¡La escuadra se hundió! El botín, al pie de la Batería.', 4);
      g.addPoints?.(REWARD_PTS, null, true);
      // (munición llena para cada uno: refillAll no existía, no hacía nada)
      g.weapons?.maxAmmo?.();
      if (isHost(g)) g.powerups?.drop(tmpV.set(EE.bateria[0] - 1.5, g.world.floorAt(EE.bateria[0] - 1.5, EE.bateria[1]), EE.bateria[1] + 1.5).clone(), true, 'maxammo');
      g.hud.achievement?.('La Batería Libertad', 'Hundiste la escuadra del rey');
    } else {
      g.hud.subtitle?.('La escuadra se vuelve río abajo… por ahora.', 3.5);
      for (const s of this.ships) if (s.alive) s.leaving = 0.001;
    }
  }

  // Una bala de un bergantín hacia (x, y, z): vuela, y cae donde avisó el círculo.
  launch(i, x, y, z) {
    const g = this.g;
    const s = this.ships[i];
    if (!s) return;
    const from = s.pos.clone().add(tmpV.set(-3.2, 3.8, (Math.random() - 0.5) * 8));
    const to = new THREE.Vector3(x, y, z);
    const ball = new THREE.Mesh(this.ballGeo || (this.ballGeo = new THREE.SphereGeometry(0.16, 8, 6)), this.M.iron);
    ball.position.copy(from);
    this.root.add(ball);
    this.balls.push({ ball, from, to, t: 0 });
    // el fogonazo del costado del barco
    g.fx.flash(from, 0xffb060, 40, 0.3, 30);
    g.fx.smoke?.(from, 6) ?? g.fx.steam(from, 8, 0.8);
    s.kick = 1;
    const A = g.audio;
    if (A?.ctx) {
      const o = A.out({ pos: from, gain: 1.4, reverb: 0.9, ref: 14 });
      A.noise(o, { t: A.now, dur: 1.6, type: 'lowpass', freq: 420, freqEnd: 80, gain: 0.9, attack: 0.003, brown: true });
      A.tone(o, { t: A.now, dur: 0.7, type: 'sine', freq: 55, freqEnd: 28, gain: 0.5 });
    }
    // el círculo colorado donde va a caer
    const mk = new THREE.Mesh(this.markGeo || (this.markGeo = new THREE.RingGeometry(0.2, BLAST_R, 32).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    mk.position.set(x, y + 0.05, z);
    mk.renderOrder = 4;
    this.root.add(mk);
    this.marks.push({ mesh: mk, t: 0 });
  }

  // La bala llegó: explota, lastima a los muertos (lo decide el anfitrión) y
  // cada compu se fija si a su jugador le tocó.
  impact(at) {
    const g = this.g;
    g.fx.explosion(at, BLAST_R, [1, 0.55, 0.2]);
    g.audio.explosion?.(at.clone(), 1);
    g.fx.addShake?.(Math.max(0, 0.6 - g.player.pos.distanceTo(at) * 0.04));
    if (isHost(g)) {
      // (a los muertos les duele, pero no los barre: la horda la tienen que bajar ustedes)
      for (const n of g.zombies.inRadius(at, BLAST_R + 0.4, [])) g.zombies.damage(n.z, 300 + (g.rounds?.round || 10) * 15, { type: 'explosive', noPoints: true, pos: at });
    }
    const P = g.player;
    const d = Math.hypot(P.pos.x - at.x, P.pos.z - at.z);
    if (P.alive && !P.downed && d < BLAST_R && Math.abs(P.pos.y - at.y) < 2) P.damage(BLAST_DMG * (1 - d / (BLAST_R * 1.6)), at.clone(), false);
  }

  // El cañón de la Batería tira: el humo, el estampido y la bala que vuela al barco.
  shoot(i) {
    const g = this.g;
    this.reload[0] = CANNON_RELOAD;
    const c = this.gun;
    const muzzle = c ? c.localToWorld(tmpV.set(0, 0.7, -2.1)) : tmpV.set(EE.bateria[0] + 1.2, -1.9, EE.bateria[1]);
    g.audio.explosion?.(muzzle.clone(), 1.2);
    g.fx.explosion(muzzle.clone(), 1.2, [1, 0.6, 0.25]);
    g.fx.flash(muzzle.clone(), 0xffb060, 30, 0.25, 30);
    g.fx.addShake?.(0.35);
    if (c) c.userData.kick = 1;
    const s = this.ships[i];
    if (!s) return;
    const ball = new THREE.Mesh(this.ballGeo || (this.ballGeo = new THREE.SphereGeometry(0.16, 8, 6)), this.M.iron);
    ball.position.copy(muzzle);
    this.root.add(ball);
    this.balls.push({ ball, from: muzzle.clone(), to: s.pos.clone().add(tmpV2.set(0, 2.6, 0)), t: 0, ship: i, ours: true });
  }

  hitShip(i, hp) {
    const g = this.g;
    const s = this.ships[i];
    if (!s) return;
    this.st.hp[i] = hp;
    const at = s.pos.clone().add(tmpV.set(0, 2.5, 0));
    g.fx.explosion(at, 3, [1, 0.5, 0.15]);
    g.audio.explosion?.(at.clone(), 1.4);
    g.water?.splash?.(s.pos.x - 3, s.pos.z, 3);
    if (hp <= 0 && s.alive) {
      s.alive = false;
      s.sink = 0.001;
      g.hud.subtitle?.(this.st.hp.every((h) => h <= 0) ? '¡Se hundió el último bergantín!' : '¡Un bergantín se hunde!', 3);
      g.audio.bugle?.(tmpV.set(102, -1, 9));
      if (isHost(g) && this.st.hp.every((h) => h <= 0)) this.send({ a: 'end', won: 1 });
    }
  }

  update(dt) {
    const g = this.g;
    this.reload[0] = Math.max(0, this.reload[0] - dt);
    // el cañón de la Batería que retrocede
    if (this.gun?.userData.kick > 0) {
      this.gun.userData.kick = Math.max(0, this.gun.userData.kick - dt * 3);
      const tube = this.gun.getObjectByName('tubo');
      if (tube) tube.position.z = -0.5 + this.gun.userData.kick * 0.3;
    }
    // las balas en el aire
    for (let k = this.balls.length - 1; k >= 0; k--) {
      const b = this.balls[k];
      b.t += dt / (b.ours ? CANNON_FLIGHT : FLIGHT);
      const t = Math.min(1, b.t);
      b.ball.position.lerpVectors(b.from, b.to, t);
      b.ball.position.y += Math.sin(t * Math.PI) * (b.ours ? 9 : 7);
      if (Math.random() < dt * 30) g.fx.steam?.(b.ball.position, 1, 0.1);
      if (t >= 1) {
        b.ball.removeFromParent();
        this.balls.splice(k, 1);
        if (b.ours) {
          if (isHost(g) && this.ships[b.ship]?.alive) this.send({ a: 'hit', i: b.ship, hp: Math.max(0, (this.st.hp[b.ship] ?? SHIP_HP) - 1) });
        } else this.impact(b.to);
      }
    }
    // los círculos de aviso: se prenden hasta que cae la bala
    for (let k = this.marks.length - 1; k >= 0; k--) {
      const m = this.marks[k];
      m.t += dt;
      m.mesh.material.opacity = Math.min(0.85, m.t / FLIGHT) * (0.6 + 0.4 * Math.sin(m.t * 18));
      m.mesh.scale.setScalar(0.4 + 0.6 * Math.min(1, m.t / FLIGHT));
      if (m.t > FLIGHT + 0.15) {
        m.mesh.removeFromParent();
        m.mesh.material.dispose();
        this.marks.splice(k, 1);
      }
    }
    // los barcos: llegan, echan el ancla y se mecen; hundidos, se van al fondo
    const T = (this.st.t += dt);
    for (const s of this.ships) {
      const o = s.obj;
      if (s.sink > 0) {
        s.sink += dt / 7;
        o.rotation.z = Math.min(0.5, s.sink * 0.9);
        o.rotation.x = s.sink * 0.25;
        o.position.y = WATER - s.sink * 9;
        if (Math.random() < dt * 8) g.fx.steam?.(tmpV.copy(o.position).setY(WATER + 0.3), 3, 2);
        if (s.sink >= 1) o.visible = false;
        continue;
      }
      if (s.leaving > 0) {
        s.leaving += dt;
        o.position.z += dt * 4;
        if (s.leaving > 30) o.visible = false;
        continue;
      }
      if (!s.alive) continue;
      const k = Math.min(1, T / SAIL_T);
      o.position.x = s.anchor.x;
      o.position.z = s.anchor.z + (START_Z + this.ships.indexOf(s) * 18 - s.anchor.z) * (1 - ease(k));
      o.position.y = WATER + Math.sin(T * 0.8 + s.phase) * 0.12;
      o.rotation.z = Math.sin(T * 0.6 + s.phase) * 0.03 - s.kick * 0.05;
      o.rotation.x = Math.sin(T * 0.45 + s.phase) * 0.02;
      s.kick = Math.max(0, s.kick - dt * 2);
    }
    this.collide();
    if (this.st.on !== 1 || !isHost(g)) return;
    // las andanadas: cada barco anclado tira dos o tres balas cerca de alguien que esté afuera
    this.ships.forEach((s, i) => {
      if (!s.alive || T < this.nextVolley[i]) return;
      this.nextVolley[i] = T + VOLLEY[0] + Math.random() * (VOLLEY[1] - VOLLEY[0]);
      const targets = this.targets();
      if (!targets.length) return;
      const n = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const p = targets[Math.floor(Math.random() * targets.length)];
        const a = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * 4.5;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (!g.world.inside(Math.floor(x), Math.floor(z))) continue;
        const y = g.world.floorAt(x, z, p.y + 1);
        g.later?.(k * 0.45, () => this.st.on === 1 && this.send({ a: 'ball', i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) }));
      }
    });
  }

  // Los cascos chocan: el jugador que nada (cada compu el suyo) y los muertos
  // (el anfitrión) no los atraviesan. El casco: 22 m de eslora (proa a -z, en
  // punta los últimos 6,6 m) y 6,2 de manga, de 1,6 abajo del agua a 2,6 arriba.
  collide() {
    if (globalThis.__mduNoShipCollide || !this.ships.length) return;
    const g = this.g;
    const push = (p, r, vel) => {
      for (const s of this.ships) {
        if (!s.obj.visible || s.sink > 0.25) continue;
        const o = s.obj.position;
        if (p.y > o.y + 2.6 || p.y < o.y - 3.2) continue;
        const lx = p.x - o.x;
        const lz = p.z - o.z;
        if (lz > 11 + r || lz < -12.6 - r) continue;
        // la manga en ese punto (la proa se angosta)
        const hw = (lz > -6 ? 3.1 : 3.1 * Math.max(0, (lz + 12.6) / 6.6)) + r;
        if (Math.abs(lx) >= hw) continue;
        // por donde menos le falta: de costado, por la popa o por la proa
        const px = hw - Math.abs(lx);
        const pzB = 11 + r - lz;
        const pzF = lz + 12.6 + r;
        if (px <= pzB && px <= pzF) {
          p.x = o.x + Math.sign(lx || 1) * hw;
          if (vel) vel.x = 0;
        } else if (pzB < pzF) {
          p.z = o.z + 11 + r;
          if (vel) vel.z = Math.max(0, vel.z);
        } else {
          p.z = o.z - 12.6 - r;
          if (vel) vel.z = Math.min(0, vel.z);
        }
      }
    };
    const P = g.player;
    if (P.alive) push(P.pos, 0.45, P.vel);
    if (isHost(g)) for (const z of g.zombies.pool) if (z.active && !z.dead) push(z.pos, 0.4, null);
  }

  // A quién se le apunta: los que están al aire libre del lado del río (la
  // Proa, el Parque, la costanera, el Patio), no adentro ni en el Mirador.
  targets() {
    const g = this.g;
    const out = [];
    const ok = (p) => p && p.x > 55 && p.y < 20 && !this.indoor(p);
    if (g.player.alive && ok(g.player.pos)) out.push(g.player.pos);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && ok(r.pos)) out.push(r.pos);
    return out;
  }

  indoor(p) {
    const w = this.g.world;
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    if (!w.inside(cx, cz)) return false;
    const k = w.zoneKeys?.[w.zone[w.idx(cx, cz)]];
    return k === 'D' || k === 'F';
  }

  dispose() {
    this.root.removeFromParent();
  }
}
