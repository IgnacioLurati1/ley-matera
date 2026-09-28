import * as THREE from 'three';
import { EE, TOWER, DOORS } from '../config/map';
import { toTexture } from '../core/textures';
import { WEAPONS } from '../config/weapons';
import { VM } from '../weapons/viewmodels';
import { buildNovaDisplay, animateNova } from '../weapons/Supernova';
import { warmScene } from '../ui/cineWarm';
import ChallengeEvents from './challengeEvents';
import ChallengeHeaven from './challengeHeaven';
import ChallengeHouse from './challengeHouse';
import Mateendrache from '../world/Mateendrache';
import { streamSong } from '../world/SongEgg';
import { animateMeme } from '../weapons/memeMate';

// El Challenge de la torre (Revelaciones Materas en modo Challenge; los datos
// en config/maps/torre.js challenge()). Hace de easter egg (g.ee) pero no hay
// historia: nadie habla, salvo los minijefes. Lo que agrega:
//  · El altar de la Supernova en la cima (piso 15): se compra y se recarga
//    todas las veces que haga falta (weapons/Supernova.js).
//  · La Bombilla del Remolino en el medio de la planta baja: como los pisos no
//    tienen centro, el que se cae va a parar al fondo; la bombilla lo chupa
//    por adentro de la torre y lo escupe cinco pisos abajo del más alto que ya
//    abrieron (el resto se sube a pie, peleando), salvo con la cima abierta,
//    que lo deja arriba de todo. Cuanto más sube, más cara (tope en la cima).
//    (Caerse de muy arriba mata: es parte del Challenge, lo pidió el usuario.)
//  · Muertos más rápidos y más bravos de entrada, más por ronda y más a la vez
//    (Rounds llama a tuneRound; Zombies, a tuneZombie; las primeras 5 rondas
//    corren como en el juego normal), especiales desde la ronda 5 y
//    minijefes cada dos rondas desde la 5 (de a dos desde la 11).
//  · Los eventos del remolino (entities/challengeEvents.js): casi todas las
//    rondas desde la 3, la mayoría malos y locos, alguno bueno.
//    A veces (20%) te escupe en la casita escondida (entities/challengeHouse.js)
//    y al rato te deja adonde ibas.
//  · El primero que compra la Supernova hace sonar "Warriors" para todos.
//  · El Mateendrache del castillo da vueltas alrededor de la torre (de adorno,
//    callado).
//  · El "buyable ending": la pared dorada de la cima. Pagada entre todos, salen
//    los guardianes del cielo (uno de cada minijefe del juego, de a uno, y el
//    Cuervo con el primero); cuando cae el último baja la escalera al cielo;
//    cuando suben todos, el Cielo de los Mates (entities/challengeHeaven.js) y
//    fin de la partida.
// En línea, el anfitrión decide las rondas, los eventos, la plata de la
// escalera y cuándo se sube; cada uno mueve a su jugador.

const START_POINTS = 1500;
// la canción de la Supernova (la primera compra, para todos)
const WARRIORS = { url: '/assets/sotano/musica/reto-torre.mp3', name: 'Warriors · Imagine Dragons', gain: 0.72 };
// la chance de que la bombilla te mande a la casita
const HOUSE_CHANCE = 0.2;
// la Bombilla: chupar, subir y escupir (segundos)
const SUCK = 0.55;
const SPIT = 0.65;
// Los guardianes del cielo: uno de cada minijefe de a pie (hay un solo jefe de
// a pie a la vez: sale el siguiente cuando el anterior ya cayó), más el Cuervo
// de la granja, que vuela aparte y sale con el primero.
const GUARDIANS = ['capataz', 'alcaide', 'caballero', 'sargento'];
// la vida de un jefe de al menos esta ronda (aunque paguen temprano)
const GUARD_ROUND = 15;
// el siguiente sale cuando el cuerpo del anterior ya lleva este rato en el piso
const GUARD_CORPSE = 6.5;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (k) => k * k * (3 - 2 * k);

export default class TowerChallenge {
  constructor(game) {
    this.g = game;
    this.M = game.world.M;
    this.T = game.world.tower;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // (lo que los demás esperan de un easter egg: acá no hay pasos)
    this.step = 0;
    this.scene = null;
    this.fight = false;
    this.startPoints = START_POINTS;
    this.flight = null;
    this.bombCd = 0;
    // la escalera al cielo: lo juntado, si ya bajó y si ya subieron
    this.bank = 0;
    this.stair = false;
    this.cielo = false;
    this.costNet = 0;
    // los guardianes (anfitrión: la cola; todos: cuántos quedan, -1 sin empezar)
    this.guard = null;
    this.guardLeft = -1;
    // sin el Chiquitijuein espiando desde la explanada (es un personaje)
    this.T.sightings?.dispose?.();
    this.T.sightings = null;
    this.warriors = false;
    this.song = null;
    this.ev = new ChallengeEvents(this);
    this.heaven = new ChallengeHeaven(game);
    this.house = new ChallengeHouse(this);
    this.buildDragon();
    this.buildAltar();
    this.buildBombilla();
    this.buildGate();
    this.buildHud();
    this.register();
    this.hookBossClimb();
  }

  // ---------------- el altar de la Supernova ----------------
  // Un pedestal de mármol con capitel de oro contra el pilar norte de la cima;
  // arriba flota la Supernova grande, girando, con un haz de luz que sube al
  // ojo de la tormenta y un anillo de runas en el piso.
  buildAltar() {
    const g = this.g;
    const A = EE.altar;
    const x = A.cell[0] + 0.5 + A.face[0] * 1.3;
    const z = A.cell[1] + 0.5 + A.face[1] * 1.3;
    const y = A.y;
    this.altarPos = new THREE.Vector3(x, y, z);
    const M = this.M;
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    this.root.add(grp);
    const marble = M.marble || M.towerStone;
    const gold = M.gold || M.brass || M.metal;
    const add = (geo, mat, py, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = py;
      m.castShadow = shadow;
      m.receiveShadow = true;
      grp.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(1.05, 0.16, 1.05), marble, 0.08);
    add(new THREE.BoxGeometry(0.82, 0.1, 0.82), marble, 0.21);
    add(new THREE.CylinderGeometry(0.24, 0.3, 0.86, 16), marble, 0.69);
    for (const py of [0.3, 1.08]) add(new THREE.TorusGeometry(0.29, 0.03, 6, 24).rotateX(Math.PI / 2), gold, py);
    add(new THREE.BoxGeometry(0.72, 0.1, 0.72), gold, 1.17);
    add(new THREE.CylinderGeometry(0.3, 0.36, 0.06, 20), marble, 1.25);
    // la Supernova grande, flotando
    const nova = buildNovaDisplay(g.weapons.T, 0);
    nova.scale.setScalar(4.2);
    nova.position.y = 1.5;
    grp.add(nova);
    this.nova = nova;
    // el haz que sube y el anillo del piso (sin luces nuevas: ver ui/cineWarm.js)
    const add2 = (color, o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 26, 20, 1, true).translate(0, 13, 0), add2(0x9a7aff, 0.12));
    beam.position.y = 1.3;
    beam.userData.reflect = false;
    grp.add(beam);
    this.beam = beam;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 48).rotateX(-Math.PI / 2), add2(0x33e8ff, 0.5));
    ring.position.y = 0.02;
    grp.add(ring);
    this.altarRing = ring;
    // el cartel en el pilar: SUPERNOVA MATERA
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    sign.position.set(A.cell[0] + 0.5 + A.face[0] * 0.53, y + 2.35, A.cell[1] + 0.5 + A.face[1] * 0.53);
    sign.rotation.y = Math.atan2(A.face[0], A.face[1]);
    this.root.add(sign);
    g.world.addBox([x - 0.52, y, z - 0.52, x + 0.52, y + 1.3, z + 0.52], { kind: 'prop' });
  }

  // ---------------- la Bombilla del Remolino ----------------
  // Un mate gigante hundido en la rosa de la planta baja y su bombilla de oro,
  // que sube por el medio de la torre hasta la cima (pasa justo por los
  // agujeros). Anillos de luz en cada piso.
  buildBombilla() {
    const g = this.g;
    const B = EE.bombilla;
    const [bx, bz] = B.pos;
    this.bombPos = new THREE.Vector3(bx, B.y, bz);
    const VMM = VM.mats(g.weapons.T);
    const grp = new THREE.Group();
    grp.position.copy(this.bombPos);
    this.root.add(grp);
    const gold = this.M.gold || VMM.gold;
    // el mate: una calabaza grande (el perfil de los mates de la mano, agrandado)
    const prof = VM.PROFILES.calabaza;
    const mate = VM.lathe(prof, VMM.gourd, 28);
    mate.scale.set(24, 13, 24);
    mate.castShadow = true;
    mate.receiveShadow = true;
    grp.add(mate);
    const top = VM.topOf(prof);
    const rimY = top.y * 13;
    const vir = new THREE.Mesh(new THREE.TorusGeometry(top.r * 24 + 0.02, 0.06, 8, 40).rotateX(Math.PI / 2), gold);
    vir.position.y = rimY;
    grp.add(vir);
    // la yerba de adentro, con un brillo verde donde entra la bombilla
    const yerba = new THREE.Mesh(new THREE.CircleGeometry(top.r * 24 - 0.04, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4e6a2a, roughness: 1 }));
    yerba.position.y = rimY - 0.12;
    grp.add(yerba);
    // la bombilla: un caño de oro hasta arriba de la cima, con su pico doblado
    const topY = TOWER.fh * TOWER.floors + 3;
    const R = 0.16;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(R, R, topY - rimY + 0.6, 16, 1, true).translate(0, (topY - rimY + 0.6) / 2 + rimY - 0.6, 0), gold);
    grp.add(pipe);
    const filter = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    filter.rotation.x = Math.PI;
    filter.position.y = rimY - 0.08;
    grp.add(filter);
    const bend = new THREE.Group();
    bend.position.y = topY;
    bend.rotation.z = 0.6;
    const pico = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R, 1.4, 16).translate(0, 0.7, 0), gold);
    bend.add(pico);
    grp.add(bend);
    // anillos de luz a la altura de cada piso (los que suben al usarla)
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc850).multiplyScalar(1.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.bombRings = [];
    for (let n = 1; n <= TOWER.floors; n++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.035, 6, 24).rotateX(Math.PI / 2), glowMat);
      r.position.y = TOWER.fh * (n - 1) + 1.6;
      grp.add(r);
      this.bombRings.push(r);
    }
    this.bombGlow = glowMat;
    // (se choca con el mate, no con la bombilla: por el medio caen los tiros y los muertos)
    const rr = Math.max(...prof.map((q) => q[0])) * 24 * 0.95;
    g.world.addBox([bx - rr, B.y, bz - rr, bx + rr, B.y + rimY, bz + rr], { kind: 'prop' });
  }

  // El piso más alto al que se llega (las escaleras abiertas de abajo para arriba).
  topFloor() {
    const open = this.g.world.doorOpen || [];
    let n = 1;
    while (n - 1 < DOORS.length && open[n - 1]) n++;
    return n;
  }

  // Adónde sube la bombilla: cinco pisos abajo del más alto abierto (hay que
  // subir el resto a pie), o a la cima si ya está abierta. 0: todavía a ningún lado.
  bombDest() {
    const n = this.topFloor();
    if (n >= TOWER.floors) return TOWER.floors;
    const d = n - EE.bombilla.below;
    return d >= 2 ? d : 0;
  }

  // Lo que cuesta subir al piso d: tanto por piso, con tope (lo que sale la cima).
  bombCost(d) {
    const B = EE.bombilla;
    return d >= TOWER.floors ? B.top : Math.min(B.top, B.perFloor * (d - 1));
  }

  // Dónde escupe la bombilla en el piso n: en el anillo, del lado que haya losa
  // libre. `safe`: el lugar con los muertos más lejos (volver de la casita).
  landingSpot(n, safe = false) {
    const T = this.T;
    const y = TOWER.fh * (n - 1);
    const spots = [[30, 22.5], [37.5, 30], [30, 37.5], [22.5, 30], [37.5, 22.5], [37.5, 37.5], [22.5, 37.5], [22.5, 22.5]];
    const ok = spots.filter(([x, z]) => {
      const l = T.layerAt(Math.floor(x), Math.floor(z), y + 0.2, x, z);
      if (l !== n - 1) return false;
      const k = l * T.WH + Math.floor(z) * T.W + Math.floor(x);
      return !T.blocked?.[k] && Math.abs(T.floorAt(x, z, y + 0.2) - y) < 0.05;
    });
    let pick = ok.length ? ok[Math.floor(Math.random() * ok.length)] : spots[0];
    if (safe && ok.length > 1) {
      // distancia² al muerto más cercano de ese piso, para cada lugar
      const near = ok.map((s) => {
        let d = Infinity;
        for (const z of this.g.zombies.pool) {
          if (!z.active || z.dead || Math.abs(z.pos.y - y) > TOWER.fh * 0.6) continue;
          d = Math.min(d, (z.pos.x - s[0]) ** 2 + (z.pos.z - s[1]) ** 2);
        }
        return d;
      });
      // al azar entre los que no tienen a nadie a 10 m; si no hay, el más despejado
      const clear = ok.filter((s, i) => near[i] > 100);
      pick = clear.length ? clear[Math.floor(Math.random() * clear.length)] : ok[near.indexOf(Math.max(...near))];
    }
    return new THREE.Vector3(pick[0], y, pick[1]);
  }

  startFlight() {
    const g = this.g;
    const p = g.player;
    if (this.flight || p.ride || !p.alive || p.downed || this.bombCd > 0) return false;
    const n = this.bombDest();
    if (!n) return false;
    const land = this.landingSpot(n, true);
    this.bombCd = EE.bombilla.cd;
    this.slurp(this.bombPos);
    g.net?.share('pee', { sorbo: 1 });
    // a veces, en vez de subir, a la casita escondida (y después adonde ibas)
    if (Math.random() < HOUSE_CHANCE) {
      this.house.enter(n, land);
      return true;
    }
    this.flight = { t: 0, from: p.pos.clone(), n, land, rise: 0.9 + n * 0.1, top: land.y + 2.4, spun: false };
    p.ride = (dt) => this.flightStep(dt);
    return true;
  }

  // Alt+Q (solo, de prueba): a la casita; después vuelve al piso donde estabas.
  debugHouse() {
    const g = this.g;
    const p = g.player;
    if (p.ride || !p.alive || p.downed) return;
    const n = Math.max(1, Math.min(TOWER.floors, Math.round(p.pos.y / TOWER.fh) + 1));
    this.house.enter(n, p.pos.clone(), true);
  }

  // ---------------- el Mateendrache ----------------
  // El dragón del castillo, volando en círculos alrededor de la torre (entre
  // la torre y el remolino), subiendo y bajando. No hace nada ni hace ruido.
  buildDragon() {
    const d = new Mateendrache(this.g);
    d.setPose('fly', 0.01);
    d.root.scale.setScalar(1.15);
    this.root.add(d.root);
    this.dragon = d;
    this.dragonT = Math.random() * 60;
    this.dragonAcc = 0;
  }

  updateDragon(dt) {
    const d = this.dragon;
    if (!d) return;
    this.dragonT += dt;
    const t = this.dragonT;
    const a = t * 0.16;
    const r = 24 + Math.sin(t * 0.13) * 2.5;
    const y = 38 + Math.sin(t * 0.21) * 15;
    const vy = Math.cos(t * 0.21) * 15 * 0.21;
    d.root.position.set(TOWER.cx + Math.cos(a) * r, y, TOWER.cz + Math.sin(a) * r);
    // mirando para donde va (el modelo mira a +z), inclinado para adentro
    d.root.rotation.set(-Math.atan2(vy, r * 0.16) * 0.8, Math.atan2(-Math.sin(a), Math.cos(a)), 0, 'YXZ');
    d.root.rotateZ(-0.28);
    // (la animación del cuerpo y las alas, a medio ritmo: es de adorno)
    this.dragonAcc += dt;
    if (this.dragonAcc >= 1 / 30) {
      d.update(this.dragonAcc);
      this.dragonAcc = 0;
    }
  }

  // ---------------- Warriors ----------------
  // La primera Supernova de la partida: suena para todos (lo decide el anfitrión).
  firstNova() {
    const g = this.g;
    if (this.warriors) return;
    if (g.net?.guest) {
      g.net.net.send({ t: 'pee', a: 'nova1' });
      return;
    }
    this.playWarriors();
    g.net?.event('pee', { warriors: 1 });
  }

  playWarriors() {
    const g = this.g;
    if (this.warriors) return;
    this.warriors = true;
    // (ya en la escena final no arranca: llegó tarde el aviso)
    if (this.cielo || g.state === 'won') return;
    this.song = streamSong(g, WARRIORS.url, () => (this.song = null), { gain: WARRIORS.gain });
    if (this.song) g.hud.toast(`♪ ${WARRIORS.name}`);
  }

  stopWarriors(fade = 1.5) {
    const s = this.song;
    this.song = null;
    if (!s) return;
    if (s.fade) s.fade(fade);
    else s.stop?.();
  }

  // Cada cuadro del viaje: chupa hasta el mate, sube por la bombilla y escupe al anillo.
  flightStep(dt) {
    const g = this.g;
    const p = g.player;
    const F = this.flight;
    if (!F) {
      p.ride = null;
      return;
    }
    F.t += dt;
    const c = this.bombPos;
    const base = tmpV.set(c.x, c.y + 0.9, c.z);
    if (F.t < SUCK) {
      const k = smooth(F.t / SUCK);
      p.pos.lerpVectors(F.from, base, k);
    } else if (F.t < SUCK + F.rise) {
      const k = (F.t - SUCK) / F.rise;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      p.pos.set(c.x, base.y + (F.top - base.y) * e, c.z);
      // chispas de oro alrededor mientras sube
      if (Math.random() < 0.8) g.fx.sparkle(tmpW.set(c.x + (Math.random() - 0.5) * 0.8, p.pos.y - 0.5, c.z + (Math.random() - 0.5) * 0.8), [1, 0.8, 0.35], 2, 0.4);
      g.fx.addShake(dt * 0.8);
    } else {
      if (!F.spun) {
        F.spun = true;
        g.audio.whoosh?.(p.pos.clone());
      }
      const k = Math.min(1, (F.t - SUCK - F.rise) / SPIT);
      const top = tmpW.set(c.x, F.top, c.z);
      p.pos.lerpVectors(top, F.land, smooth(k));
      p.pos.y += Math.sin(k * Math.PI) * 1.1;
      if (k >= 1) {
        p.pos.copy(F.land);
        this.endFlight(true);
        return;
      }
    }
    p.vel.set(0, 0, 0);
    p.onGround = false;
    p.airTop = p.pos.y;
  }

  endFlight(landed) {
    const g = this.g;
    const p = g.player;
    const F = this.flight;
    this.flight = null;
    if (p.ride) p.ride = null;
    p.airTop = p.pos.y;
    if (landed && F) {
      g.fx.dust?.(p.pos.clone(), { x: 0, y: 1, z: 0 }, [0.8, 0.7, 0.45], 10);
      g.audio.land?.();
    }
  }

  // El sorbo: un chupón largo y un glu-glu que sube.
  slurp(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: pos.clone().setY(pos.y + 1), gain: 0.9, reverb: 0.4, ref: 5 });
    A.noise(o, { dur: 0.9, type: 'bandpass', freq: 500, freqEnd: 2600, q: 1.4, gain: 0.5, attack: 0.05 });
    for (let s = 0; s < 0.8; s += 0.09 + Math.random() * 0.05) A.noise(o, { t: A.now + s, dur: 0.06, type: 'bandpass', freq: 300 + s * 900, q: 6, gain: 0.5 });
    A.tone(o, { dur: 1.1, freq: 90, freqEnd: 360, gain: 0.12, attack: 0.1 });
  }

  // ---------------- la escalera al cielo ----------------
  // La pared dorada del "buyable ending" (como la de la historia).
  buildGate() {
    const def = EE.ending;
    const a = this.g.world.wallAnchor(def.cell, def.face, 0.03);
    const y = def.y;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    this.gateCtx = c.getContext('2d');
    this.gateTex = toTexture(c, { repeat: false });
    this.drawGate(this.endingCost());
    const mat = new THREE.MeshStandardMaterial({ map: this.gateTex, roughness: 0.35, metalness: 0.7, emissive: 0xffb030, emissiveMap: this.gateTex, emissiveIntensity: 0.3 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
    panel.position.set(a.x, y + 1.55, a.z);
    panel.rotation.y = a.rot;
    this.root.add(panel);
    this.gateMat = mat;
    this.gatePos = new THREE.Vector3(a.x, y + 1.4, a.z);
  }

  // Lo que cuesta: 40.000 solo y 20.000 más por cada jugador de más (lo decide
  // el anfitrión con los que hay; el invitado usa el que le mandó).
  endingCost() {
    const g = this.g;
    if (g.net?.guest && this.costNet) return this.costNet;
    const n = Math.max(1, Math.min(4, g.net ? g.net.net.count : 1));
    return EE.ending.cost + (EE.ending.perPlayer || 0) * (n - 1);
  }

  drawGate(cost) {
    this.drawnCost = cost;
    const ctx = this.gateCtx;
    const grd = ctx.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#fff0b0');
    grd.addColorStop(0.5, '#d8a030');
    grd.addColorStop(1, '#8a5a10');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 12;
    ctx.strokeRect(14, 14, 484, 484);
    ctx.fillStyle = '#3a2408';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.fillText('BUYABLE', 256, 150);
    ctx.fillText('ENDING', 256, 215);
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillText('la escalera al cielo', 256, 280);
    ctx.font = 'bold 64px Impact, "Arial Black", sans-serif';
    ctx.fillText(`$${cost.toLocaleString('es-AR')}`, 256, 390);
    ctx.font = '22px Georgia, serif';
    ctx.fillText('se aporta entre todos', 256, 432);
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText(`${EE.ending.cost.toLocaleString('es-AR')} solo · +${(EE.ending.perPlayer || 0).toLocaleString('es-AR')} por jugador`, 256, 462);
    this.gateTex.needsUpdate = true;
  }

  // (anfitrión) Plata para la escalera; lo que sobra vuelve al que lo puso.
  deposit(n, from) {
    const cost = this.endingCost();
    const take = !this.paid() ? Math.max(0, Math.min(n, cost - this.bank)) : 0;
    if (n > take) this.refund(n - take, from);
    if (take <= 0) return;
    this.bank += take;
    const who = this.g.net ? `${this.g.net.nameOf(from)} aportó` : 'Aportaste';
    this.announce(`${who} ${take.toLocaleString('es-AR')} a la escalera al cielo (${this.bank.toLocaleString('es-AR')} de ${cost.toLocaleString('es-AR')}).`, 3.5);
    if (this.bank >= cost) this.paidUp();
    this.netSync();
  }

  // ¿Ya está paga? (con los guardianes todavía en pie, o la escalera ya bajó)
  paid() {
    return this.stair || !!this.guard || this.guardLeft >= 0;
  }

  // (anfitrión) Juntaron la plata: baja la escalera y salen los guardianes,
  // que los persiguen escalera arriba (bossClimb).
  paidUp() {
    const g = this.g;
    if (this.paid()) return;
    this.guard = { left: [...GUARDIANS], cur: null, t: 2.5, crow: false };
    this.guardLeft = GUARDIANS.length + (g.crow ? 1 : 0);
    // (mientras tanto, ni el jefe de la ronda ni la noche de minijefes)
    g.rounds.bossPending = false;
    this.ev.bossLeft = 0;
    this.openStair();
    this.announce('¡Se abrió el cielo! Pero salen los guardianes: uno de cada minijefe, y los siguen escalera arriba. ¡Suban todos!', 5.5, true);
  }

  // (anfitrión, cada cuadro) Los guardianes de a uno; el Cuervo con el primero.
  // Si ya hay alguien en la escalera, el siguiente sale ahí mismo, atrás.
  stepGuard(dt) {
    const g = this.g;
    const G = this.guard;
    const Z = g.zombies;
    const round = Math.max(GUARD_ROUND, g.rounds.round);
    const b = Z.boss;
    const curUp = !!G.cur && !G.cur.dead && b === G.cur;
    if (!curUp && G.left.length) {
      // el más atrasado de los que suben (para salirle de atrás)
      let low = Infinity;
      for (const pl of this.climbers()) low = Math.min(low, this.stairU(pl.pos));
      const climbing = Number.isFinite(low);
      // esperar a que el anterior (o el jefe que anduviera) caiga y quede un
      // rato en el piso (en la escalera, menos: los vienen persiguiendo)
      const busy = b && (!b.dead || (b.corpseT || 0) < (climbing ? 2 : GUARD_CORPSE));
      G.t = busy ? Math.max(G.t, 0.3) : G.t - dt;
      if (G.t <= 0) {
        if (b) Z.removeBoss();
        const u = climbing ? Math.max(0.03, low - 0.25) : -1;
        G.cur = Z.spawnBoss(round, { kind: G.left.shift(), at: u >= 0 ? this.stairPoint(u, new THREE.Vector3()) : undefined });
        if (u >= 0) G.cur.climbU = u;
        G.t = 0.3;
        g.post?.flash(0.35);
        // el Cuervo sale con el primero (si ya andaba uno volando, cuenta ese)
        if (!G.crow) {
          G.crow = true;
          g.crow?.spawn(round);
        }
      }
    }
    const crowUp = !!g.crow?.z.active && !g.crow.z.dead;
    const left = G.left.length + (G.cur && !G.cur.dead && Z.boss === G.cur ? 1 : 0) + (crowUp || (!G.crow && g.crow) ? 1 : 0);
    if (left !== this.guardLeft) {
      // (cayó uno: cuántos faltan)
      if (left > 0 && left < this.guardLeft) this.announce(`Quedan ${left} ${left > 1 ? 'guardianes' : 'guardián'} del cielo.`, 2.5);
      else if (!left) this.announce('¡Cayeron todos los guardianes del cielo!', 3, true);
      this.guardLeft = left;
      this.netSync();
    }
    if (!left) this.guard = null;
  }

  // ---------------- los jefes en la escalera al cielo ----------------
  // Los jefes no saben caminar la espiral (la recta al jugador se sale de los
  // escalones y se frenan en el borde): mientras alguien sube, el jefe que lo
  // persigue va por la espiral misma, hasta un paso atrás de él. Reemplaza el
  // moveBoss de Zombies solo en el Challenge (anfitrión).
  stairBase() {
    return TOWER.fh * (TOWER.floors - 1);
  }

  stairPoint(u, out) {
    const S = TOWER.sky;
    const a = S.a0 + u * Math.PI * 2;
    const rm = (S.r0 + S.r1) / 2;
    return out.set(TOWER.cx + Math.cos(a) * rm, this.stairBase() + u * S.pitch + 0.06, TOWER.cz + Math.sin(a) * rm);
  }

  // En qué vuelta de la espiral está algo (u: 0 abajo, S.turns arriba), o -1.
  stairU(p) {
    const S = TOWER.sky;
    const base = this.stairBase();
    const r = Math.hypot(p.x - TOWER.cx, p.z - TOWER.cz);
    if (!this.stair || r < S.r0 - 0.6 || r > S.r1 + 0.6 || p.y < base + 0.25) return -1;
    let a = Math.atan2(p.z - TOWER.cz, p.x - TOWER.cx) - S.a0;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const f = a / (Math.PI * 2);
    const u = f + Math.round((p.y - base - 0.06) / S.pitch - f);
    return u < 0 || u > S.turns + 0.1 ? -1 : u;
  }

  // Los jugadores de pie que van por la escalera.
  climbers() {
    const g = this.g;
    const list = g.player.alive && !g.player.downed && this.stairU(g.player.pos) >= 0 ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && this.stairU(r.pos) >= 0) list.push(r);
    return list;
  }

  hookBossClimb() {
    const Z = this.g.zombies;
    if (this.moveBossOrig || !Z?.moveBoss) return;
    this.moveBossOrig = Z.moveBoss;
    const orig = Z.moveBoss.bind(Z);
    Z.moveBoss = (z, mx, mz, speed, dt, t) => (this.bossClimb(z, mx, mz, speed, dt, t) ? undefined : orig(z, mx, mz, speed, dt, t));
  }

  // true si lo movió acá (por la escalera); si no, sigue el moveBoss de siempre.
  bossClimb(z, mx, mz, speed, dt, t) {
    const g = this.g;
    const Z = g.zombies;
    if (!this.stair || g.net?.guest) return false;
    const S = TOWER.sky;
    const tgt = g.nearestPlayer(z.pos.x, z.pos.z, z.baseY);
    const tu = tgt ? this.stairU(tgt.pos) : -1;
    if (z.climbU == null) {
      if (tu < 0) return false;
      // abajo todavía: al pie de la escalera y ahí se sube
      const e = this.stairPoint(0.03, tmpV);
      const d = Math.hypot(e.x - z.pos.x, e.z - z.pos.z);
      if (d < 1.4 && Math.abs((z.baseY || 0) - this.stairBase()) < 1) z.climbU = 0.03;
      else if (d < 14) {
        this.moveBossOrig.call(Z, z, (e.x - z.pos.x) / d, (e.z - z.pos.z) / d, speed, dt, t);
        return true;
      } else return false;
    }
    // en la escalera: hasta un paso atrás del que persigue (o de vuelta abajo)
    const rm = (S.r0 + S.r1) / 2;
    const goal = tu >= 0 ? tu - 0.035 : -0.1;
    const du = (speed * 1.1 * dt) / (Math.PI * 2 * rm);
    const prev = z.climbU;
    z.climbU = Math.min(S.turns, prev + Math.max(-du, Math.min(du, goal - prev)));
    if (z.climbU <= 0.02 && goal < 0.02) {
      // se bajó: sigue por el piso
      z.climbU = undefined;
      return false;
    }
    this.stairPoint(z.climbU, tmpV);
    z.pos.x = tmpV.x;
    z.pos.z = tmpV.z;
    z.pos.y = z.baseY = tmpV.y;
    // mira para donde va (o al jugador, si lo tiene encima)
    const a = S.a0 + z.climbU * Math.PI * 2;
    const s = z.climbU >= prev ? 1 : -1;
    const near = tgt && Math.hypot(tgt.pos.x - z.pos.x, tgt.pos.z - z.pos.z) < 3;
    Z.turn(z, near ? Math.atan2(tgt.pos.x - z.pos.x, tgt.pos.z - z.pos.z) : Math.atan2(-Math.sin(a) * s, Math.cos(a) * s), 5, dt);
    Z.poseGait(z, dt, (Math.abs(z.climbU - prev) * Math.PI * 2 * rm) / Math.max(dt, 1e-3), t);
    return true;
  }

  refund(n, from) {
    const g = this.g;
    if (!g.net || from === this.myId()) this.gotRefund(n);
    else g.net.net.to(from, { t: 'ev', e: 'pee', refund: n });
  }

  gotRefund(n) {
    this.g.receivePoints(n);
    this.g.hud.subtitle(`La escalera ya estaba paga: te devolvieron ${n.toLocaleString('es-AR')}.`, 3);
  }

  // Pagada: se abre el cielo de oro y baja la escalera (world/Tower.js).
  openStair(quiet = false) {
    const g = this.g;
    if (this.stair) return;
    this.stair = true;
    this.T.skyOpenK = 1;
    this.T.setSky('open');
    this.addStairBoxes();
    // el cielo de arriba ya queda compilado para cuando suban (sin trabar)
    warmScene(g);
    if (quiet) return;
    g.post?.flash(0.8);
    g.audio.fanfare?.();
    g.audio.thunder?.(null, true);
    g.hud.toast?.('¡Baja la escalera al cielo!');
    g.hud.achievement('Buyable Ending', 'Pagaron la escalera al cielo');
    g.hud.subtitle('¡Se abrió el cielo! Suban la escalera de oro... todos juntos.', 5, 'boss');
    if (!g.net?.guest) this.netSync();
  }

  // Los escalones más bajos frenan al que pasa por abajo (como en la historia).
  addStairBoxes() {
    if (this.stairBoxes) return;
    const T = TOWER;
    const S = T.sky;
    const base = T.fh * (T.floors - 1);
    this.stairBoxes = [];
    for (let u = 0.08; u < 0.28; u += 0.035) {
      const h = u * S.pitch;
      const a = S.a0 + u * Math.PI * 2;
      const rm = (S.r0 + S.r1) / 2;
      const x = T.cx + Math.cos(a) * rm;
      const z = T.cz + Math.sin(a) * rm;
      this.stairBoxes.push(this.g.world.addBox([x - 0.8, base, z - 0.8, x + 0.8, base + h - 0.5, z + 0.8], { kind: 'ground', shoot: false }));
    }
  }

  // (anfitrión) Cuando están todos arriba de la escalera: al cielo.
  checkClimb() {
    const g = this.g;
    const top = TOWER.fh * (TOWER.floors - 1) + TOWER.sky.breakAt;
    const list = g.player.alive && !g.player.downed ? [g.player.pos] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r.pos);
    if (list.length && list.every((p) => p.y > top)) this.startHeaven();
    else if (list.some((p) => p.y > top) && !this.waitSaid) {
      this.waitSaid = true;
      this.announce('La escalera tiembla... esperá a que suban todos.', 3);
    }
  }

  startHeaven() {
    const g = this.g;
    if (this.cielo) return;
    this.cielo = true;
    this.netSync();
    g.net?.event('pee', { cielo: 1 });
    this.playHeaven();
  }

  playHeaven() {
    const g = this.g;
    if (this.scene) return;
    this.cielo = true;
    // "Warriors" se va con la escena final (seguía sonando encima de la cinemática)
    this.stopWarriors(2);
    if (this.flight) this.endFlight(false);
    this.scene = this.heaven;
    this.heaven.play(() => {
      this.scene = null;
      g.stats.easterEgg = true;
      if (!g.net?.guest) g.win();
    });
  }

  // (Game.win) La partida terminó: si la escena seguía (el invitado), se limpia.
  onWin() {
    this.stopWarriors(1.5);
    this.heaven.abort();
    this.scene = null;
  }

  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('pee', { st: this.endState() });
  }

  endState() {
    return { b: this.bank, c: this.endingCost(), o: this.stair ? 1 : 0, h: this.cielo ? 1 : 0, w: this.warriors ? 1 : 0, j: this.guardLeft };
  }

  applyEnd(st) {
    this.bank = st.b | 0;
    if (Number.isFinite(st.j)) this.guardLeft = st.j;
    // (el que entra tarde no escucha la canción desde el medio)
    if (st.w) this.warriors = true;
    if (st.c) this.costNet = st.c | 0;
    if (st.o && !this.stair) this.openStair(!!st.h);
  }

  // ---------------- lo que se usa ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    const A = EE.altar;
    const B = EE.bombilla;
    // el altar: cada uno compra la suya (y la recarga)
    I.add({
      kind: 'ee',
      local: true,
      pos: this.altarPos,
      radius: 2.3,
      prompt: () => {
        const W = g.weapons;
        if (!W.has('supernova')) return `agarrar la ${WEAPONS.supernova.name}`;
        if (W.ammoFull('supernova')) return { text: 'La Supernova ya está llena', noCost: true, info: true };
        return 'recargar la Supernova';
      },
      cost: () => (!g.weapons.has('supernova') ? A.cost : g.weapons.ammoFull('supernova') ? 0 : A.ammo),
      use: () => {
        const W = g.weapons;
        if (W.has('supernova')) {
          if (!W.refillAmmo('supernova')) return false;
          return true;
        }
        W.give('supernova', 0);
        g.hud.subtitle('¡La Supernova Matera! Clic izquierdo: rayo estelar. Clic derecho: Big Bang.', 5);
        this.firstNova();
        g.fx.flash(this.altarPos.clone().setY(this.altarPos.y + 1.6), 0x9a7aff, 20, 0.5, 10);
        return true;
      },
    });
    // la bombilla del medio de la planta baja
    I.add({
      kind: 'ee',
      local: true,
      pos: this.bombPos.clone().setY(this.bombPos.y + 0.8),
      radius: 2.6,
      prompt: () => {
        if (this.flight) return null;
        const n = this.bombDest();
        if (!n) return { text: `La Bombilla del Remolino: te sube cinco pisos abajo del más alto que hayan abierto (a la cima, si está abierta). Abran hasta el piso ${B.below + 2}`, noCost: true, info: true };
        if (this.bombCd > 0) return { text: `La Bombilla del Remolino está cargando (${Math.ceil(this.bombCd)} s)`, noCost: true, info: true };
        return n >= TOWER.floors ? 'sorber la Bombilla del Remolino (te escupe en la cima)' : `sorber la Bombilla del Remolino (te escupe en el piso ${n})`;
      },
      cost: () => {
        const n = this.bombDest();
        return this.flight || !n || this.bombCd > 0 ? 0 : this.bombCost(n);
      },
      use: () => this.startFlight(),
    });
    // la pared dorada: cada uno aporta lo suyo
    I.add({
      kind: 'ee',
      local: true,
      pos: this.gatePos,
      radius: 2.4,
      prompt: () => {
        if (this.stair) return this.cielo ? null : { text: 'La escalera al cielo ya bajó: súbanla todos', noCost: true, info: true };
        if (this.paid()) return { text: `Pagada: la escalera baja cuando caigan los guardianes${this.guardLeft > 0 ? ` (quedan ${this.guardLeft})` : ''}`, noCost: true, info: true };
        const left = Math.max(0, this.endingCost() - this.bank);
        if (g.points <= 0) return { text: `Escalera al cielo: faltan ${left.toLocaleString('es-AR')} (no tenés plata para aportar)`, noCost: true, info: true };
        return { text: `aportar ${Math.min(left, g.points).toLocaleString('es-AR')} a la escalera al cielo (faltan ${left.toLocaleString('es-AR')})`, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.paid()) return false;
        const n = Math.min(this.endingCost() - this.bank, g.points);
        if (n <= 0 || !g.spend(n)) return false;
        g.audio.purchase();
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'deposit', n });
        else this.deposit(n, this.myId());
        return true;
      },
    });
  }

  // ---------------- el panel de arriba ----------------
  buildHud() {
    const el = document.createElement('div');
    el.className = 'mdu-obj mdu-obj--reto';
    this.g.hud.root.appendChild(el);
    this.objEl = el;
    this.objKey = '';
  }

  updateHud() {
    const g = this.g;
    const L = this.ev.list;
    const has = g.weapons?.has('supernova');
    let main;
    let sub;
    if (this.stair) {
      main = this.cielo ? 'Al cielo' : 'Suban la escalera al cielo';
      sub = !this.cielo && this.guardLeft > 0 ? `Todos juntos: los guardianes los siguen (${this.guardLeft === 1 ? 'queda 1' : `quedan ${this.guardLeft}`})` : 'Todos juntos, hasta arriba de la escalera de oro';
    } else if (L.length) {
      main = L.map((id) => this.ev.name(id)).join(' + ');
      sub = L.length > 1 ? 'Doble evento del remolino' : this.ev.sub(L[0]);
    } else {
      main = 'Sin evento esta ronda';
      sub = has ? 'Clic derecho con la Supernova: Big Bang' : 'La Supernova espera arriba de todo (piso 15)';
    }
    const cost = this.endingCost();
    const bank = !this.paid() && this.bank > 0 ? ` · Escalera: ${this.bank.toLocaleString('es-AR')} / ${cost.toLocaleString('es-AR')}` : '';
    const key = `${main}|${sub}|${this.topFloor()}|${bank}`;
    if (key === this.objKey) return;
    this.objKey = key;
    this.objEl.innerHTML = `<header><span>Challenge</span><em class="mdu-obj__tag">Piso abierto: ${this.topFloor()}</em></header><p>${main}</p><small>${sub}${bank}</small>`;
    const guard = this.guardLeft > 0 && this.stair && !this.cielo;
    this.objEl.classList.toggle('is-event', (!!L.length && !this.stair) || guard);
    this.objEl.classList.toggle('is-good', !guard && !!L.length && this.ev.kind(L[0]) === 'bien');
  }

  // ---------------- las rondas ----------------
  // (anfitrión, Rounds.nextRound) Más muertos, más seguido, especiales, jefes
  // y el evento de la ronda (entities/challengeEvents.js).
  tuneRound(R) {
    const n = R.round;
    const players = R.players || 1;
    R.total = Math.round(R.total * 1.3);
    R.toSpawn = R.total;
    R.delay = Math.max(0.06, R.delay * 0.55);
    R.capBonus = 6 + (players - 1) * 2;
    // (2026-09-27: especiales y minijefes recién desde la 5, pedido del usuario)
    R.specials = n >= 5 ? Math.floor((1 + n / 3) * (1 + (players - 1) * 0.5)) : 0;
    R.bossPending = n >= 5 && (n % 2 === 1 || n >= 11);
    R.bothFrom = 11;
    this.ev.tuneRound(R);
    // con los guardianes del cielo en pie, ni el jefe de la ronda ni la noche de minijefes
    if (this.guard) {
      R.bossPending = false;
      this.ev.bossLeft = 0;
    }
  }

  // (anfitrión, Zombies.spawn) Rápidos de entrada y con el zarpazo más ligero.
  tuneZombie(z, round) {
    this.ev.tuneZombie(z, round);
  }

  // (anfitrión, Zombies.kill)
  onKill(z) {
    this.ev.onKill(z);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // el altar y la bombilla
    if (this.nova) {
      animateNova(this.nova.userData.nova, this.nova.userData.spin, dt, t, 0);
      this.nova.rotation.y += dt * 0.6;
      this.nova.position.y = 1.5 + Math.sin(t * 1.4) * 0.08;
      this.beam.material.opacity = 0.1 + Math.sin(t * 2.2) * 0.03;
      this.altarRing.rotation.y += dt * 0.4;
      this.altarRing.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    }
    this.bombCd = Math.max(0, this.bombCd - dt);
    // los anillos de la bombilla suben como una ola (más rápido si alguien la usa)
    const fast = this.flight ? 4 : 1;
    this.bombRings.forEach((r, i) => {
      const k = 0.5 + 0.5 * Math.sin(t * 2.4 * fast - i * 0.7);
      r.scale.setScalar(0.9 + k * 0.35);
    });
    this.bombGlow.opacity = 0.55 + Math.sin(t * 3) * 0.15 + (this.flight ? 0.3 : 0);
    const p = g.player;
    this.ev.update(dt);
    this.updateDragon(dt);
    animateMeme(g.weapons, dt);
    // la pared dorada: el precio con los que hay y el brillo mientras se puede pagar
    const cost = this.endingCost();
    if (cost !== this.drawnCost) {
      this.drawGate(cost);
      if (!g.net?.guest) this.netSync();
    }
    this.gateMat.emissiveIntensity = !this.paid() ? 0.45 + Math.sin(t * 3) * 0.2 : 0.15;
    if (!this.paid() && !g.net?.guest && this.bank >= cost && cost > 0) this.paidUp();
    if (this.guard && !g.net?.guest && g.state === 'playing' && !this.cielo) this.stepGuard(dt);
    if (this.stair && !this.cielo && !g.net?.guest && !this.scene && g.state === 'playing') this.checkClimb();
    // si se murió o lo levantaron en medio del viaje, se corta
    if (this.flight && (!p.alive || p.downed)) this.endFlight(false);
    this.updateHud();
  }

  // ---------------- lo que no hay (la interfaz de los easter eggs) ----------------
  onShot() {}
  onExplosion() {}
  onPower() {}
  onZone() {}
  dropHat() {}
  onPhdLand() {}
  // La cámara del Cielo de los Mates (la llama Game mientras hay escena).
  sceneCam(dt) {
    return this.scene ? this.scene.update(dt) : false;
  }
  announce(text, secs = 3, sting = false) {
    const g = this.g;
    g.hud.subtitle(text, secs);
    if (sting) g.audio.sting();
    g.net?.event('sub', { x: text, d: secs, s: sting ? 1 : 0 });
  }

  // Alt+K (solo, de prueba): a la cima, al lado del altar.
  debugFinal() {
    const g = this.g;
    const a = this.altarPos;
    g.player.pos.set(a.x, a.y, a.z + 2.2);
    g.player.vel.set(0, 0, 0);
    g.player.airTop = a.y;
    for (let n = 1; n <= TOWER.floors; n++) g.activateZone(`P${n}`);
  }

  // ---------------- red ----------------
  myId() {
    return this.g.net?.id ?? 0;
  }

  // El remolino del Mark III: lo ven todos y el anfitrión arrastra a los muertos.
  shareVortex(v) {
    const g = this.g;
    if (!g.net) return;
    v.by = this.myId();
    if (g.net.guest) g.net.net.send({ t: 'pee', a: 'vx', vx: v });
    else g.net.event('pee', { vx: v });
  }

  onGuest(m, from) {
    if (m.a === 'nova1') {
      if (!this.warriors) {
        this.playWarriors();
        this.g.net.event('pee', { warriors: 1 });
      }
      return;
    }
    if (m.a === 'deposit' && Number.isFinite(m.n) && m.n > 0) {
      this.deposit(Math.floor(m.n), from);
      return;
    }
    if (m.a === 'vx' && Array.isArray(m.vx?.p) && Array.isArray(m.vx?.v)) {
      m.vx.by = from;
      this.g.weapons.spawnNetVortex(m.vx);
      this.g.net.event('pee', { vx: m.vx });
    }
  }

  fullState() {
    return { rt: this.ev.state(), st: this.endState() };
  }

  applyRemote(m) {
    const g = this.g;
    if (m.vx) {
      if (m.vx.by !== this.myId()) g.weapons.spawnNetVortex(m.vx);
      return;
    }
    if (m.st) this.applyEnd(m.st);
    if (m.refund) {
      this.gotRefund(m.refund | 0);
      return;
    }
    if (m.cielo) {
      this.playHeaven();
      return;
    }
    if (m.warriors) {
      this.playWarriors();
      return;
    }
    if (this.ev.applyRemote(m)) return;
    if (m.sorbo) this.slurp(this.bombPos);
  }

  dispose() {
    const p = this.g.player;
    if (this.flight && p?.ride) p.ride = null;
    this.flight = null;
    if (this.moveBossOrig && this.g.zombies) this.g.zombies.moveBoss = this.moveBossOrig;
    this.moveBossOrig = null;
    this.ev.dispose();
    this.heaven.dispose();
    this.house.dispose();
    this.dragon?.dispose?.();
    this.song?.fade?.(0.8);
    this.song = null;
    this.objEl?.remove();
    this.root.removeFromParent();
  }
}

// El cartel del altar: letras de oro sobre la piedra.
function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 144;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(160, 120, 255, 0.9)';
  x.shadowBlur = 18;
  x.fillStyle = '#ffd47a';
  x.font = 'bold 64px Cinzel, Georgia, serif';
  x.fillText('SUPERNOVA', 256, 58);
  x.shadowBlur = 8;
  x.font = '28px Cinzel, Georgia, serif';
  x.fillStyle = '#c8b8ff';
  x.fillText('✦  MATERA  ✦', 256, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
