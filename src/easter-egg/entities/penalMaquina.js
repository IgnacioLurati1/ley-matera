import * as THREE from 'three';
import { tierOf } from '../config/weapons';
import { zombieHealth, maxAlive, SPEEDS } from '../config/rules';
import { mesh, boxGeo, cylGeo, compactGroup } from '../world/props';
import { buildMaquina, maquinaSpin, hellTracer } from '../weapons/maquinaModel';

// La Máquina de Muerte del penal: la otra versión de la Bombilla Gut, hecha
// Gatling (config/weapons.js `gutmuerte`). Es una búsqueda aparte: no pide
// ningún paso de "Los Tres Gauchos" y el arma no le sirve al easter egg.
//  1. El tambor de seis caños está en el armero de la guardia (el pabellón,
//     entre el pizarrón y el depósito de pertenencias): la cerradura es
//     eléctrica (un rayo desde el gaucho life), y recién toma el rayo después
//     del primer motín (el del easter egg o el de la ronda 10). Arriba,
//     clavado, el plano.
//  2. La manivela la trae el Alcaide colgada: cuando cae, queda en el piso.
//  3. La cinta de bombillas se llena con las que quedan clavadas en los
//     muertos: CINTA_NEED bajas con la Bombilla Gut (la de cualquiera).
//  4. Con las tres piezas y una Bombilla Gut en la mano se monta en la cureña
//     de los yerbales: cae un rayo, la máquina se prende fuego y la horda
//     viene corriendo por el yerbal. Hay que darle manivela (F mantenida): tira
//     para donde mira el que la maneja, sin parar (no se traba), y mientras
//     tanto un aro de fuego alrededor de la cureña revienta a los que llegan:
//     el que da manivela no recibe daño. Con las bajas que pide revienta una
//     ola de fuego que barre el yerbal y queda lista: se la lleva el que la
//     montó. (El usuario, 2026-10-07: que sea épico y no una tarea laboriosa
//     en la que te morís fácil.)
// Después de la primera, la cureña le convierte la Bombilla Gut a cualquiera.
// El estado lo lleva el anfitrión (va en el de PenalEgg, `mq`); lo que cada
// uno hace con su bombilla lo hace en su compu y avisa (`pee`, a: 'mq').

// dónde van (x, z) y para dónde miran
const ARMERO = { pos: [37.55, 30.03], rot: 0 };
// (en el claro del medio de los yerbales, al lado de las bolsas, mirando al este)
const MOUNT = { pos: [60.4, 68.25], dir: [1, 0] };
export const CINTA_NEED = 25;
const CRANK_NEED = 30;
const CRANK_PER = 10;
// la que está montada: hasta dónde gira, cada cuánto tira, hasta dónde llega
const ARC = 1.15;
// (2026-10-07: más rápida, como la de la mano; el calor la frena igual)
const RPM = 1100;
const RANGE = 34;
// el calor solo se ve (el tambor al rojo): ya no la traba
const HEAT_UP = 0.19;
const HEAT_DOWN = 0.32;
// el aro de fuego (radio) y la ola del final (radio)
const RING = 2.7;
const NOVA = 18;
const PLAN = 'Plano: Bombilla Gut + tambor (este armero: después del primer motín, con electricidad) + manivela (la trae el Alcaide) + cinta (25 bajas con la Gut). Se monta en la cureña de los yerbales.';
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const hitTmp = { point: new THREE.Vector3(), normal: new THREE.Vector3() };

// El papel del plano: el tambor de frente, la manivela y la cinta, a tinta.
function planTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#d8c9a0';
  x.fillRect(0, 0, 256, 192);
  x.strokeStyle = '#2a2018';
  x.fillStyle = '#2a2018';
  x.lineWidth = 2;
  x.strokeRect(6, 6, 244, 180);
  x.font = 'bold 19px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('MÁQUINA DE MUERTE', 128, 30);
  x.lineWidth = 2.5;
  x.beginPath();
  x.arc(70, 104, 40, 0, Math.PI * 2);
  x.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath();
    x.arc(70 + Math.cos(a) * 25, 104 + Math.sin(a) * 25, 8, 0, Math.PI * 2);
    x.stroke();
  }
  x.beginPath();
  x.moveTo(150, 80);
  x.lineTo(196, 80);
  x.lineTo(196, 112);
  x.lineTo(226, 112);
  x.stroke();
  for (let i = 0; i < 7; i++) x.fillRect(146 + i * 13, 140, 5, 22);
  x.font = '13px Georgia, serif';
  x.fillText('tambor', 70, 166);
  x.fillText('manivela', 190, 70);
  x.fillText('cinta', 190, 178);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class PenalMaquina {
  constructor(game, egg) {
    this.g = game;
    this.egg = egg;
    this.M = game.world.M;
    // (anfitrión) el armero abierto, el tambor y la manivela en la mano del
    // equipo, las bajas de la cinta, la que está montada y si ya salió una
    this.open = false;
    this.tambor = false;
    this.man = 'none';
    this.manPos = new THREE.Vector3();
    this.cinta = 0;
    // { by, up, state: crank | ready, kills, need }
    this.bench = null;
    this.done = false;
    // lo del que da manivela (en su compu)
    this.heat = 0;
    this.jam = 0;
    this.spinK = 0;
    this.fireCd = 0;
    this.shotN = 0;
    this.cranking = false;
    this.spawnT = 2;
    this.openK = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.buildArmero();
    this.buildManivela();
    this.buildMount();
    this.register();
  }

  myId() {
    return this.egg.myId();
  }

  floor(x, z) {
    return this.g.world.floorAt(x, z);
  }

  // ---------------- lo que se ve ----------------
  // El armero: un armario de fierro con la puerta de reja, la cerradura
  // eléctrica y el tambor adentro. Al costado, el plano clavado en la pared.
  buildArmero() {
    const M = this.M;
    const iron = M.iron;
    const [x, z] = ARMERO.pos;
    const y = this.floor(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ARMERO.rot;
    const body = new THREE.Group();
    // fondo, costados, techo y piso (abierto adelante, hacia +z)
    body.add(mesh(boxGeo(1.1, 2, 0.06), iron, 0, 1, 0.03));
    for (const s of [-1, 1]) body.add(mesh(boxGeo(0.06, 2, 0.5), iron, s * 0.52, 1, 0.25));
    for (const yy of [0.03, 1.97]) body.add(mesh(boxGeo(1.1, 0.06, 0.5), iron, 0, yy, 0.25));
    body.add(mesh(boxGeo(0.98, 0.04, 0.42), M.woodDark || iron, 0, 0.9, 0.25));
    // dos fusiles viejos de adorno en el estante de arriba
    for (const s of [-0.28, 0.3]) body.add(mesh(cylGeo(0.018, 0.022, 0.95, 6), M.woodDark || iron, s, 1.42, 0.14, 0, 0, s * 0.12));
    g.add(body);
    compactGroup(body);
    // la puerta de reja: gira sobre el canto izquierdo
    const door = new THREE.Group();
    door.position.set(-0.52, 0, 0.5);
    for (let i = 0; i <= 6; i++) door.add(mesh(cylGeo(0.014, 0.014, 1.9, 6), iron, 0.05 + i * 0.157, 1, 0));
    for (const yy of [0.08, 1, 1.92]) door.add(mesh(boxGeo(1.04, 0.05, 0.03), iron, 0.52, yy, 0));
    compactGroup(door);
    g.add(door);
    this.armDoor = door;
    // la cerradura eléctrica (prendida mientras está cerrado)
    this.lockMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ab8ff).multiplyScalar(1.6), toneMapped: false });
    const lock = mesh(boxGeo(0.14, 0.2, 0.08), iron, 0.58, 1.05, 0.52);
    g.add(lock);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), this.lockMat);
    led.position.set(0.58, 1.1, 0.57);
    g.add(led);
    this.lockLed = led;
    // el tambor, acostado en el estante
    const drum = new THREE.Group();
    drum.position.set(0, 1.06, 0.25);
    drum.rotation.z = Math.PI / 2;
    const silver = M.metal || iron;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      drum.add(mesh(cylGeo(0.022, 0.022, 0.78, 8), silver, Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075));
    }
    for (const yy of [-0.3, 0.05, 0.33]) drum.add(mesh(cylGeo(0.105, 0.105, 0.03, 16), M.brass || iron, 0, yy, 0));
    compactGroup(drum);
    g.add(drum);
    this.drumObj = drum;
    this.drumGlow = this.egg.glowSprite(0xffc070, 0.9);
    this.drumGlow.position.set(0, 1.06, 0.3);
    this.drumGlow.visible = false;
    g.add(this.drumGlow);
    // el plano, clavado en la pared arriba del armero
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ map: planTexture(), color: 0x9a9080 }));
    plan.position.set(0, 2.33, 0.03);
    plan.rotation.z = -0.04;
    g.add(plan);
    this.root.add(g);
    g.updateMatrixWorld(true);
    this.armero = g;
    this.armPos = new THREE.Vector3(0, 1.1, 0.75).applyMatrix4(g.matrixWorld);
    this.lockPos = new THREE.Vector3(0.58, 1.05, 0.56).applyMatrix4(g.matrixWorld);
    // (lo que ocupa, para chocar y para que los muertos no lo pisen)
    const a = new THREE.Vector3(-0.56, 0, 0).applyMatrix4(g.matrixWorld);
    const b = new THREE.Vector3(0.56, 0, 0.52).applyMatrix4(g.matrixWorld);
    this.g.world.addBox([Math.min(a.x, b.x), y, Math.min(a.z, b.z), Math.max(a.x, b.x), y + 2, Math.max(a.z, b.z)], { kind: 'prop' });
  }

  // La manivela que larga el Alcaide (escondida hasta que cae).
  buildManivela() {
    const M = this.M;
    const g = new THREE.Group();
    g.add(mesh(cylGeo(0.02, 0.02, 0.16, 8), M.iron, 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(boxGeo(0.03, 0.26, 0.04), M.iron, 0.08, 0.11, 0));
    g.add(mesh(cylGeo(0.028, 0.028, 0.16, 8), M.wood || M.iron, 0.16, 0.24, 0, 0, 0, Math.PI / 2));
    compactGroup(g);
    g.visible = false;
    this.root.add(g);
    this.manObj = g;
    this.manGlow = this.egg.glowSprite(0xffc070, 1.1);
    this.manGlow.visible = false;
    this.root.add(this.manGlow);
  }

  // La cureña (dos ruedas, el eje, la cola) y la máquina arriba, escondida
  // hasta que alguien la monta. El grupo mira para -z; `aim` gira con la mira.
  buildMount() {
    const M = this.M;
    const g = this.g;
    const wood = M.woodDark || M.wood;
    const [x, z] = MOUNT.pos;
    const y = this.floor(x, z);
    const yaw = Math.atan2(-MOUNT.dir[0], -MOUNT.dir[1]);
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.rotation.y = yaw;
    const fixed = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(s * 0.66, 0.56, 0.1);
      w.rotation.y = Math.PI / 2;
      w.add(mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 20), wood));
      w.add(mesh(new THREE.TorusGeometry(0.56, 0.018, 4, 20), M.iron));
      for (let i = 0; i < 4; i++) w.add(mesh(boxGeo(1.02, 0.05, 0.05), wood, 0, 0, 0, 0, 0, (i / 4) * Math.PI));
      w.add(mesh(cylGeo(0.09, 0.09, 0.16, 10), M.iron, 0, 0, 0, Math.PI / 2, 0, 0));
      fixed.add(w);
    }
    fixed.add(mesh(cylGeo(0.05, 0.05, 1.4, 8), M.iron, 0, 0.56, 0.1, 0, 0, Math.PI / 2));
    // la cola, del eje al piso, y el cajón de las bombillas
    fixed.add(mesh(boxGeo(0.16, 0.14, 1.9), wood, 0, 0.3, 1.0, 0.3, 0, 0));
    fixed.add(mesh(boxGeo(0.5, 0.14, 0.4), wood, 0, 0.62, 0.1));
    fixed.add(mesh(cylGeo(0.06, 0.08, 0.42, 8), M.iron, 0, 0.88, 0.1));
    fixed.add(mesh(boxGeo(0.42, 0.26, 0.3), wood, 0.34, 0.2, 1.25, 0, 0.3, 0));
    compactGroup(fixed);
    c.add(fixed);
    // la máquina (el modelo de la mano, sin la mano, a tamaño de cureña)
    const aim = new THREE.Group();
    aim.position.set(0, 1.16, 0.1);
    const m = buildMaquina(false, g.textures, false);
    m.root.scale.setScalar(1.9);
    m.root.position.set(0.065, 0.03, 0);
    m.root.traverse((o) => {
      o.castShadow = false;
    });
    compactGroup(m.maq.drum);
    compactGroup(m.maq.crank);
    for (const part of [m.maq.drum, m.maq.crank, m.maq.hot]) part.traverse((o) => (o.userData.dynamic = true));
    compactGroup(m.root);
    aim.add(m.root);
    aim.visible = false;
    c.add(aim);
    this.root.add(c);
    c.updateMatrixWorld(true);
    this.mount = c;
    this.aim = aim;
    this.gun = m;
    this.mountYaw = yaw;
    this.mountPos = new THREE.Vector3(x, y, z);
    // desde dónde se le da manivela: atrás, a la derecha de la cola
    this.crankPos = new THREE.Vector3(0.35, 1.15, 0.75).applyMatrix4(c.matrixWorld);
    this.gunTop = new THREE.Vector3(0, 1.5, 0).applyMatrix4(c.matrixWorld);
    this.glow = this.egg.glowSprite(0xff5a2a, 1.6);
    this.glow.position.copy(this.gunTop);
    this.glow.visible = false;
    this.root.add(this.glow);
    g.world.addBox([x - 0.75, y, z - 0.75, x + 0.75, y + 1.2, z + 0.75], { kind: 'prop' });
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    // el armero: abierto, el tambor; si no, el plano que tiene clavado arriba
    // (dice qué hace falta y que la cerradura es eléctrica)
    I.add({
      kind: 'ee',
      local: true,
      pos: this.armPos,
      radius: 2.1,
      prompt: () => {
        if (this.open && !this.tambor) return { text: 'agarrar: Tambor de seis caños', noCost: true };
        return this.done ? null : { text: 'leer el plano', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.open && !this.tambor) {
          if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'mq', op: 'tambor' });
          else this.takeTambor();
          return true;
        }
        if (this.done) return false;
        g.hud.subtitle(PLAN, 9);
        return true;
      },
    });
    // la manivela en el piso
    I.add({
      kind: 'ee',
      local: true,
      pos: this.manPos,
      radius: 1.9,
      prompt: () => (this.man === 'ground' ? { text: 'agarrar: Manivela', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.man !== 'ground') return false;
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'mq', op: 'man' });
        else this.takeManivela();
        return true;
      },
    });
    // la cureña: montarla, darle manivela, llevársela
    this.mountIt = I.add({
      kind: 'ee',
      local: true,
      wide: true,
      // (nunca "se cumple" la F mantenida: la manivela la lee update)
      holdTime: 1e9,
      pos: this.crankPos,
      radius: 2,
      prompt: () => this.mountPrompt(),
      cost: () => 0,
      use: () => this.mountUse(),
    });
    // el rayo del gaucho life abre el armero
    g.vida?.addTarget({ pos: this.lockPos, r: 0.9, on: () => !this.open && this.unlocked(), hit: () => this.openArmero() });
  }

  // La cerradura recién tiene corriente después del primer motín.
  unlocked() {
    const M = this.egg.motin;
    return !!M && M.count > 0 && !M.active;
  }

  // Qué falta para montarla (lo que se lee en la cureña).
  missing() {
    const out = [];
    if (!this.tambor) out.push('tambor');
    if (this.man !== 'held') out.push('manivela');
    if (this.cinta < CINTA_NEED) out.push(`cinta ${this.cinta}/${CINTA_NEED}`);
    return out;
  }

  mountPrompt() {
    const w = this.g.weapons;
    const B = this.bench;
    if (this.egg.fight) return null;
    if (B) {
      if (B.state === 'crank') return { text: `dar manivela (${B.kills}/${B.need})`, hold: true, noCost: true };
      return B.by === this.myId() ? { text: 'agarrar la Máquina de Muerte', noCost: true } : null;
    }
    if (w.has('gutmuerte')) return null;
    if (this.done) return w.has('gut') ? { text: 'convertir tu Bombilla Gut en Máquina de Muerte', noCost: true } : { text: 'Cureña: traé una Bombilla Gut', noCost: true, info: true };
    const miss = this.missing();
    if (miss.length) return { text: `Cureña: falta ${miss.join(', ')}`, noCost: true, info: true };
    if (!w.has('gut')) return { text: 'Cureña: traé una Bombilla Gut', noCost: true, info: true };
    return { text: 'montar la Máquina de Muerte', noCost: true };
  }

  mountUse() {
    const g = this.g;
    const w = g.weapons;
    const B = this.bench;
    if (this.egg.fight) return false;
    if (B) {
      if (B.state !== 'ready' || B.by !== this.myId()) return false;
      w.give('gutmuerte', B.up || 0);
      g.audio.powerupGrab();
      if (g.net?.guest) {
        this.bench = null;
        g.net.net.send({ t: 'pee', a: 'mq', op: 'take' });
      } else this.take(this.myId());
      return true;
    }
    if (w.has('gutmuerte') || !w.has('gut')) return false;
    const up = tierOf(w.slots.find((s) => s.id === 'gut')?.up);
    if (this.done) {
      w.drop('gut');
      w.give('gutmuerte', up);
      g.audio.powerupGrab();
      return true;
    }
    if (this.missing().length) return false;
    w.drop('gut');
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'mq', op: 'mount', up });
    else this.mountGun(this.myId(), up);
    return true;
  }

  // ---------------- (anfitrión) lo que pasa ----------------
  openArmero() {
    const g = this.g;
    if (this.open) return;
    this.open = true;
    g.audio.door(this.armPos, false);
    g.fx.electric(this.lockPos, 22);
    this.egg.netSync();
  }

  takeTambor() {
    if (!this.open || this.tambor) return;
    this.tambor = true;
    this.egg.toastAll('Conseguiste: Tambor de seis caños');
    this.egg.netSync();
  }

  // Cae un Alcaide: si la manivela todavía no salió, queda donde cayó.
  onBossDeath(pos, z) {
    if (this.g.net?.guest || z?.kind !== 'alcaide' || this.man !== 'none') return;
    this.man = 'ground';
    this.manPos.set(pos.x, this.g.world.floorAt(pos.x, pos.z, pos.y + 1) + 0.9, pos.z);
    this.egg.announce('', 3, true);
    this.egg.netSync();
  }

  takeManivela() {
    if (this.man !== 'ground') return;
    this.man = 'held';
    this.egg.toastAll('Conseguiste: Manivela');
    this.egg.netSync();
  }

  // Cada muerto que cae (lo llama PenalEgg.onKill, en el anfitrión): los de la
  // Bombilla Gut llenan la cinta; los de la máquina montada, la cuenta.
  onKill(z, info) {
    const g = this.g;
    if (g.net?.guest || z.boss) return;
    const type = info?.type;
    if (type === 'gut' && this.cinta < CINTA_NEED && !this.done && !this.bench) {
      this.cinta++;
      if (this.cinta >= CINTA_NEED) {
        this.egg.toastAll('Conseguiste: Cinta de bombillas');
        this.egg.netSync();
      } else if (this.cinta % 2 === 0) this.egg.netSync();
    }
    const B = this.bench;
    if ((type === 'maq' || info?.ring) && B?.state === 'crank') {
      B.kills++;
      g.fx.soul(z.pos, this.gunTop, [1, 0.45, 0.2]);
      g.net?.event('pee', { mqs: [+z.pos.x.toFixed(1), +z.pos.y.toFixed(1), +z.pos.z.toFixed(1)] });
      if (B.kills >= B.need) this.finish();
      else if (B.kills % 3 === 0) this.egg.netSync();
    }
  }

  mountGun(by, up) {
    const g = this.g;
    if (this.bench || this.done || this.missing().length) return;
    const n = this.egg.players();
    this.bench = { by, up: tierOf(up), state: 'crank', kills: 0, need: CRANK_NEED + CRANK_PER * (n - 1) };
    this.spawnT = 2.2;
    this.egg.announce('', 3, true);
    this.egg.netSync();
  }

  // ¿Lo cuida la máquina? (el que le da manivela: Player.damage por PenalEgg.safe)
  protects(p) {
    return !!this.cranking && p === this.g.player && this.bench?.state === 'crank';
  }

  // ¿Alguien le está dando manivela? (yo, o un compañero que manda para dónde apunta)
  cranked() {
    const R = this.remoteAim;
    return !!this.cranking || (!!R && this.g.time - R.t < 0.4);
  }

  // Se monta (en todas las compus, cuando el estado lo dice): el rayo que cae
  // en la cureña, el trueno y la máquina que se prende fuego.
  ignite() {
    const g = this.g;
    const T = this.gunTop;
    g.fx.lightning(tmpV.set(T.x - 3, T.y + 30, T.z + 2), T, 0xff7a30, 0.5);
    g.fx.lightning(tmpA.set(T.x + 2, T.y + 28, T.z - 3), T, 0xffd060, 0.4);
    g.fx.flash(T, 0xff6a20, 80, 0.9, 18);
    g.post?.flash?.(0.35);
    if (g.weather) g.weather.flash = 1;
    g.audio.thunder?.(T.clone(), true);
    g.audio.bossArrive?.();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 5;
      g.fx.add.spawn(T.x, T.y, T.z, Math.cos(a) * v, 2 + Math.random() * 5, Math.sin(a) * v, { color: [1, 0.45 + Math.random() * 0.3, 0.1], size: 0.12, size1: 0, life: 0.6 + Math.random() * 0.5, drag: 1.5 });
    }
  }

  // El aro de fuego alrededor de la cureña (lo ven todos): una vuelta de llamas cada tanto.
  ringFx() {
    const g = this.g;
    const P = this.mountPos;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
      const x = P.x + Math.cos(a) * RING;
      const z = P.z + Math.sin(a) * RING;
      g.fx.add.spawn(x, P.y + 0.1, z, Math.cos(a) * 0.4, 1.6 + Math.random() * 1.6, Math.sin(a) * 0.4, { color: [1, 0.4 + Math.random() * 0.35, 0.08], size: 0.22, size1: 0.02, life: 0.55 + Math.random() * 0.3, drag: 1 });
    }
  }

  // (anfitrión) El aro revienta a los muertos que llegan a la cureña (cuentan).
  ringKills() {
    const g = this.g;
    const P = this.mountPos;
    for (const { z } of g.zombies.inRadius(P, RING + 0.4)) {
      if (z.boss || z.dead || !z.active) continue;
      const d = tmpD.set(z.pos.x - P.x, 0, z.pos.z - P.z).normalize();
      g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 0.6, 6);
      g.zombies.damage(z, (z.maxHp || 1000) * 3 + 1000, { type: 'blast', hell: true, ring: true, dir: d.clone(), point: tmpV.clone() });
    }
  }

  // La ola de fuego del final (en todas las compus): barre el yerbal; los
  // muertos que alcanza los revienta el anfitrión.
  nova() {
    const g = this.g;
    const P = this.mountPos;
    g.fx.flash(this.gunTop, 0xff7a30, 140, 1.2, 30);
    g.post?.flash?.(0.5);
    if (g.weather) g.weather.flash = 1;
    g.audio.thunder?.(this.gunTop.clone(), true);
    g.audio.sting();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const v = 9 + Math.random() * 6;
      g.fx.add.spawn(P.x, P.y + 0.4 + Math.random() * 0.6, P.z, Math.cos(a) * v, 0.6 + Math.random(), Math.sin(a) * v, { color: [1, 0.4 + Math.random() * 0.4, 0.08], size: 0.35, size1: 0.05, life: 1.1 + Math.random() * 0.4, drag: 0.6 });
    }
    if (g.net?.guest) return;
    for (const { z, d } of g.zombies.inRadius(P, NOVA)) {
      if (z.boss || z.dead || !z.active) continue;
      g.later(d / 14, () => {
        if (!z.active || z.dead) return;
        const dir = new THREE.Vector3(z.pos.x - P.x, 0, z.pos.z - P.z).normalize();
        g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), 0.6, 6);
        g.zombies.damage(z, (z.maxHp || 1000) * 3 + 1000, { type: 'blast', hell: true, dir, point: tmpV.clone() });
      });
    }
  }

  finish() {
    const g = this.g;
    const B = this.bench;
    if (!B || B.state !== 'crank') return;
    B.state = 'ready';
    this.done = true;
    this.egg.announce('', 3, true);
    g.hud.achievement('Máquina de Muerte', 'Le diste manivela en los yerbales');
    this.egg.netSync();
  }

  take(by) {
    if (this.bench?.state !== 'ready' || this.bench.by !== by) return;
    this.bench = null;
    this.egg.netSync();
  }

  // (anfitrión) Mientras está montada, vienen corriendo por el yerbal: casi
  // todos de frente a la máquina, alguno de atrás.
  spawns(dt) {
    const g = this.g;
    const n = this.egg.players();
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    // (la horda: seguida, todos de frente y corriendo; nadie por la espalda)
    this.spawnT = 0.6 / Math.sqrt(n);
    if (g.zombies.alive >= maxAlive(n) || !this.someoneNear(14)) return;
    const fx = MOUNT.dir[0];
    const fz = MOUNT.dir[1];
    for (let i = 0; i < 10; i++) {
      const d = 9 + Math.random() * 7;
      const a = (Math.random() - 0.5) * 1.5;
      const x = this.mountPos.x + (fx * Math.cos(a) - fz * Math.sin(a)) * d;
      const z = this.mountPos.z + (fz * Math.cos(a) + fx * Math.sin(a)) * d;
      if (g.nav.blocked(Math.floor(x), Math.floor(z)) || !Number.isFinite(g.nav.distAt(x, z))) continue;
      if (Math.abs(g.world.floorAt(x, z, this.mountPos.y + 1) - this.mountPos.y) > 0.6) continue;
      const round = Math.max(4, g.rounds.round);
      g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, 0, z));
      const z0 = g.zombies.pool.find((q) => q.active && q.id === g.zombies.idc);
      if (z0 && !z0.dead) {
        z0.speedType = 'sprint';
        z0.speed = SPEEDS.sprint * (0.9 + Math.random() * 0.15);
      }
      break;
    }
  }

  someoneNear(r) {
    const g = this.g;
    const P = this.mountPos;
    if (g.player.alive && Math.hypot(g.player.pos.x - P.x, g.player.pos.z - P.z) < r) return true;
    if (g.net) for (const q of g.net.remote.values()) if (!q.dead && Math.hypot(q.pos.x - P.x, q.pos.z - P.z) < r) return true;
    return false;
  }

  // ---------------- el que da manivela (en su compu) ----------------
  crankStep(dt) {
    const g = this.g;
    const p = g.player;
    const B = this.bench;
    const I = g.interact;
    const near = Math.hypot(p.pos.x - this.crankPos.x, p.pos.z - this.crankPos.z) < 2.2;
    const able = B?.state === 'crank' && g.state === 'playing' && p.alive && !p.downed && !g.vida?.active && near && g.input.key('KeyF') && !this.egg.scene;
    // (arranca mirando la manivela; después alcanza con no soltar la F ni irse)
    const hold = able && (this.cranking || I.current === this.mountIt);
    this.cranking = hold;
    const firing = hold;
    // (la que maneja otro: gira y apunta como le dice él, sin ruidos acá: sus
    // tiros llegan como los de cualquiera)
    const R = this.remoteAim;
    const remote = !hold && !!R && g.time - R.t < 0.35;
    this.spinK = maquinaSpin(this.gun.maq, dt, null, this.spinK, firing || remote, remote ? null : g, this.heat);
    if (remote) {
      const k = Math.min(1, dt * 14);
      this.aim.rotation.set(this.aim.rotation.x + (R.p - this.aim.rotation.x) * k, this.aim.rotation.y + (R.y - this.aim.rotation.y) * k, 0, 'YXZ');
    }
    if (!firing) {
      this.heat = Math.max(0, this.heat - dt * HEAT_DOWN);
      this.fireCd = 0;
      return;
    }
    // la mira: la máquina apunta a lo que tiene el jugador en la cruz (el
    // primer muerto o la primera pared de su mirada; ella está más adelante y
    // más abajo que los ojos: tirando paralelo, erraba por medio metro), hasta
    // donde gira la cureña
    const cam = g.camera;
    tmpD.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let reach = Math.min(g.world.raycast(cam.position, tmpD, RANGE, hitTmp), RANGE);
    for (const h of g.zombies.raycast(cam.position, tmpD, reach)) if (h.t < reach) reach = h.t;
    tmpV.copy(cam.position).addScaledVector(tmpD, Math.max(4, reach));
    this.aim.getWorldPosition(tmpA);
    tmpV.sub(tmpA);
    let yaw = Math.atan2(-tmpV.x, -tmpV.z) - this.mountYaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    yaw = Math.max(-ARC, Math.min(ARC, yaw));
    const pitch = Math.max(-0.3, Math.min(0.35, Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z))));
    this.aim.rotation.set(pitch, yaw, 0, 'YXZ');
    this.sendAim(yaw, pitch);
    this.heat = Math.min(1, this.heat + dt * HEAT_UP);
    if (this.spinK < 1) return;
    this.fireCd -= dt;
    let n = 0;
    while (this.fireCd <= 0 && n++ < 3) {
      this.fireCd += 60 / RPM;
      this.shoot();
    }
  }

  // Un tiro de la máquina montada: sale de su boca, para donde apunta.
  shoot() {
    const g = this.g;
    this.aim.updateMatrixWorld(true);
    const muzzle = this.gun.muzzle.getWorldPosition(tmpA);
    const dir = tmpD.set(0, 0, -1).transformDirection(this.aim.matrixWorld);
    dir.x += (Math.random() - 0.5) * 0.035;
    dir.y += (Math.random() - 0.5) * 0.025;
    dir.z += (Math.random() - 0.5) * 0.035;
    dir.normalize();
    const wallT = g.world.raycast(muzzle, dir, RANGE, hitTmp);
    const maxT = Math.min(wallT, RANGE);
    let endT = maxT;
    let pen = 2;
    let first = true;
    for (const h of g.zombies.raycast(muzzle, dir, maxT)) {
      if (pen-- <= 0) break;
      const point = new THREE.Vector3().copy(muzzle).addScaledVector(dir, h.t);
      // tres tiros voltean a cualquiera, en la ronda que sea (a los jefes, lo de siempre)
      const dmg = h.z.boss ? 700 : Math.max(700, (h.z.maxHp || 0) * 0.36) * (h.zone === 'head' ? 1.5 : 1);
      g.zombies.damage(h.z, dmg, { type: 'maq', zone: h.zone, arm: h.arm, point, dir: dir.clone(), pup: 0.4, hell: true });
      if (this.shotN % 3 === 0) g.fx.sparks(point, 3, { x: -dir.x * 0.5, y: 0.6, z: -dir.z * 0.5 }, [1, 0.45, 0.1]);
      if (first) g.hud.hitmarker(h.zone === 'head');
      first = false;
      if (pen <= 0) endT = h.t;
    }
    this.shotN++;
    const end = tmpV.copy(muzzle).addScaledVector(dir, endT);
    // las balas del infierno: trazo de fuego y brasas que salen de la boca
    if (this.shotN % 2 === 0) hellTracer(g, muzzle, end, false);
    if (this.shotN % 3 === 0) g.fx.flash(muzzle, 0xff7a20, 3, 0.04, 5);
    if (this.shotN % 2 === 0) g.fx.add.spawn(muzzle.x, muzzle.y, muzzle.z, dir.x * 5 + (Math.random() - 0.5), dir.y * 5 + Math.random(), dir.z * 5 + (Math.random() - 0.5), { color: [1, 0.5, 0.1], size: 0.06, size1: 0, life: 0.3, drag: 2 });
    g.audio.shot('gatling', null, false);
    g.fx.addShake?.(0.035);
    g.net?.sendShot(muzzle, end, 'gatling', false);
  }

  // ---------------- red ----------------
  // Para dónde apunta la que manejo (diez veces por segundo): los demás la ven girar.
  sendAim(y, p) {
    const g = this.g;
    if (!g.net || g.time - (this.aimSent || 0) < 0.1) return;
    this.aimSent = g.time;
    const a = [+y.toFixed(2), +p.toFixed(2)];
    if (g.net.guest) g.net.net.send({ t: 'pee', a: 'mq', op: 'aim', y: a[0], p: a[1] });
    else g.net.event('pee', { mqa: [...a, this.myId()] });
  }

  // La de otro: [yaw, pitch, quién].
  onAim(m) {
    if (!Array.isArray(m) || m[2] === this.myId()) return;
    this.remoteAim = { y: +m[0] || 0, p: +m[1] || 0, t: this.g.time };
  }

  onGuest(m, from) {
    if (m.op === 'aim') {
      this.onAim([m.y, m.p, from]);
      this.g.net?.event('pee', { mqa: [+m.y || 0, +m.p || 0, from] });
      return;
    }
    if (m.op === 'tambor') this.takeTambor();
    else if (m.op === 'man') this.takeManivela();
    else if (m.op === 'mount') this.mountGun(from, m.up);
    else if (m.op === 'take') this.take(from);
  }

  netState() {
    const B = this.bench;
    return { o: this.open ? 1 : 0, t: this.tambor ? 1 : 0, m: this.man, mp: this.manPos.toArray().map((v) => +v.toFixed(2)), c: this.cinta, d: this.done ? 1 : 0, b: B ? [B.by, B.up, B.state, B.kills, B.need] : null };
  }

  applyState(s) {
    if (!s) return;
    this.open = !!s.o;
    this.tambor = !!s.t;
    if (s.m) this.man = s.m;
    if (Array.isArray(s.mp)) this.manPos.fromArray(s.mp);
    this.cinta = s.c | 0;
    this.done = !!s.d;
    this.bench = s.b ? { by: s.b[0], up: s.b[1], state: s.b[2], kills: s.b[3], need: s.b[4] } : null;
  }

  // (invitado) un alma que va a la máquina
  soul(p) {
    this.g.fx.soul(tmpV.set(p[0], p[1], p[2]), this.gunTop, [1, 0.45, 0.2]);
    if (this.bench) this.bench.kills = Math.min(this.bench.need, this.bench.kills + 1);
  }

  // lo que va en la lista de piezas (Tab)
  inv() {
    const used = this.done || !!this.bench;
    return { tambor: this.tambor && !used, manivela: this.man === 'held' && !used, cinta: this.cinta >= CINTA_NEED && !used };
  }

  // El contador de arriba: las bajas dándole manivela o la cinta que se va llenando.
  hudText() {
    const B = this.bench;
    if (B?.state === 'crank') return `<span>Máquina de Muerte</span><b>${B.kills} / ${B.need}</b>`;
    if (!B && !this.done && this.cinta > 0 && this.cinta < CINTA_NEED) return `<span>Cinta de bombillas</span><b>${this.cinta} / ${CINTA_NEED}</b>`;
    return null;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    const B = this.bench;
    // el armero
    this.openK += ((this.open ? 1 : 0) - this.openK) * Math.min(1, dt * 2.5);
    this.armDoor.rotation.y = -this.openK * 1.9;
    this.lockLed.visible = !this.open && this.unlocked();
    if (this.lockLed.visible) this.lockMat.color.setHex(0x5ab8ff).multiplyScalar(1.1 + Math.sin(t * 5) * 0.5);
    this.drumObj.visible = !this.tambor;
    this.drumGlow.visible = this.open && !this.tambor;
    if (this.drumGlow.visible) this.drumGlow.material.opacity = 0.35 + Math.sin(t * 4) * 0.15;
    // la manivela en el piso
    const onGround = this.man === 'ground';
    this.manObj.visible = this.manGlow.visible = onGround;
    if (onGround) {
      this.manObj.position.copy(this.manPos).setY(this.manPos.y + Math.sin(t * 2.2) * 0.06);
      this.manObj.rotation.set(0.3, t * 1.6, 0);
      this.manGlow.position.copy(this.manPos);
      this.manGlow.material.opacity = 0.5 + Math.sin(t * 4) * 0.2;
    }
    // la cureña
    this.aim.visible = !!B;
    this.glow.visible = B?.state === 'ready';
    if (this.glow.visible) this.glow.material.opacity = 0.45 + Math.sin(t * 4) * 0.2;
    // al montarla, el rayo; al terminar, la ola de fuego (en todas las compus, por el estado)
    const st = B?.state || null;
    if (st !== this.lastSt) {
      if (st === 'crank' && this.lastSt == null) this.ignite();
      if (st === 'ready' && this.lastSt === 'crank') this.nova();
      this.lastSt = st;
    }
    if (B) {
      this.crankStep(dt);
      if (B.state === 'crank') {
        // el aro de fuego, mientras alguien le da manivela
        if (this.cranked()) {
          this.ringT = (this.ringT || 0) - dt;
          if (this.ringT <= 0) {
            this.ringT = 0.35;
            this.ringFx();
          }
          if (!g.net?.guest) this.ringKills();
        }
        if (!g.net?.guest) {
          this.spawns(dt);
          // el que la montó se fue de la partida: queda para el que siga
          if (g.net && B.by !== this.myId() && !g.net.remote.has(B.by)) B.by = this.myId();
        }
        // (el avance en la barrita de la F; la pone después de world/Interactables.
        // Y el mate de la mano, abajo: las dos manos están en la manivela)
        if (this.cranking) {
          g.hud.setHold(B.kills / B.need);
          if (g.weapons.holder) g.weapons.holder.visible = false;
        }
      } else if (!g.net?.guest && g.net && B.by !== this.myId() && !g.net.remote.has(B.by)) {
        B.by = this.myId();
        this.egg.netSync();
      }
    } else this.cranking = false;
  }

  // Alt+V (solo): todo listo para montarla, parado en la cureña.
  debug() {
    const g = this.g;
    this.open = true;
    this.tambor = true;
    this.man = 'held';
    this.cinta = CINTA_NEED;
    if (!g.weapons.has('gut')) g.weapons.give('gut');
    for (const it of g.interact.list) if (it.kind === 'door' && !it.door.open && !it.door.def.open && it.door.def.kind !== 'cerro') g.interact.openDoor(it.door);
    const b = tmpV.set(0.35, 0, 1.7).applyMatrix4(this.mount.matrixWorld);
    g.player.pos.set(b.x, this.mountPos.y + 0.05, b.z);
    g.player.yaw = this.mountYaw;
    g.player.pitch = 0;
    g.activateZone?.(g.world.zoneAt(b.x, b.z, this.mountPos.y));
  }

  dispose() {
    this.root.removeFromParent();
  }
}
