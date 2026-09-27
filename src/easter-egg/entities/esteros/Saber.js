import * as THREE from 'three';
import { EE } from '../../config/map';
import { mesh, boxGeo } from '../../world/props';
import { isHost, announce, rayHit, firstHit } from '../castle/common';
import { MAT, glint, pulse, keyModel, bookModel, papersModel, featherModel, freeBoss } from './common';

// "El Pacto", paso 1: el saber. La voz le pide a Gil lo que saben los muertos
// del estero, y se deja en el hueco del algarrobo (EsterosEgg):
//  · el códice de los padres: la llave de la reja de la cripta está en el
//    fondo de la laguna (bucear); la cripta está inundada y el cofre, abajo.
//    Gil (solo él) puede arrancarle una hoja y guardársela: la voz no se entera.
//  · los papeles del coronel: la caja fuerte del despacho de la casona. La
//    llave la tiene el Sargento de la partida, que aparece al tocar la caja.
//  · las plumas de tres urutaú: parados en palos secos, quietos como ramas.
//    Se los encuentra por el canto (y los ojos que brillan cuando cantan); un
//    tiro los espanta y dejan caer una pluma.
// Lo decide el anfitrión; el estado viaja en state()/apply().

const tmpV = new THREE.Vector3();

// El canto del urutaú: cuatro o cinco notas que bajan, tristes, con temblor
// (como un llanto). Lo usan también los del ambiente (fx/NightSounds.js).
export function urutauCall(g, pos, gain = 1) {
  const A = g.audio;
  if (!A?.ctx) return;
  const o = A.out({ pos, reverb: 0.7, gain: 0.55 * gain, ref: 9 });
  const n = 4 + Math.floor(Math.random() * 2);
  let t = A.now + 0.05;
  let f = 880 + Math.random() * 60;
  for (let k = 0; k < n; k++) {
    const dur = k === 0 ? 1.1 : 0.55 + Math.random() * 0.2;
    const tone = A.tone(o, { t, dur, type: 'sine', freq: f, freqEnd: f * 0.93, gain: 0.22, attack: 0.08, release: dur * 0.95 });
    // el temblor de la voz
    const lfo = A.ctx.createOscillator();
    const lg = A.ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = f * 0.012;
    lfo.connect(lg).connect(tone.o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    A.tone(o, { t, dur, type: 'triangle', freq: f * 2, freqEnd: f * 1.86, gain: 0.025, attack: 0.1, release: dur * 0.9 });
    t += dur + 0.12;
    f *= 0.86;
  }
}

export default class Saber {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // la reja: la llave está en la laguna (lagoon), en manos (held) o ya se abrió (open)
    this.reja = 'lagoon';
    // el cofre de la cripta y el códice (none: en el cofre, held, given)
    this.cofre = false;
    this.codice = 'none';
    this.hoja = false;
    // la caja fuerte: closed, sargento (salió a buscarlo), open; la llave
    // (none, floor, held, used) y dónde cayó
    this.caja = 'closed';
    this.llave = 'none';
    this.llavePos = null;
    this.papeles = 'none';
    // los urutaú: 0 parado, 1 la pluma cayendo, 2 la pluma en el piso, 3 agarrada
    this.uru = [0, 0, 0];
    this.plumas = 'none';
    this.callT = [4, 11, 17];
    this.eyeT = [0, 0, 0];
    this.fallT = [0, 0, 0];
    this.build();
    this.register();
  }

  floor(x, z, y) {
    return this.g.world.floorAt(x, z, y);
  }

  // ---------------- lo que se ve ----------------
  build() {
    const g = this.g;
    // la llave de la reja, en el barro del fondo
    const [kx, kz] = EE.llaveReja;
    this.keyObj = keyModel();
    this.keyObj.position.set(kx, this.floor(kx, kz) + 0.05, kz);
    this.keyObj.rotation.set(Math.PI / 2, 0, 0.7);
    this.keyGlint = glint(g, 0xbfe8ff, 0.8);
    this.keyGlint.position.set(kx, this.floor(kx, kz) + 0.2, kz);
    this.root.add(this.keyObj, this.keyGlint);
    // el cofre de la cripta (con la tapa en su bisagra) y el códice adentro
    const [cx, cz] = EE.cofre;
    const cy = this.floor(cx, cz, -2);
    const chest = new THREE.Group();
    chest.position.set(cx, cy, cz);
    chest.add(mesh(boxGeo(0.8, 0.42, 0.5), MAT.wood(), 0, 0.21, 0));
    for (const x of [-0.3, 0.3]) chest.add(mesh(boxGeo(0.05, 0.44, 0.52), MAT.rust(), x, 0.22, 0));
    const lid = new THREE.Group();
    lid.position.set(0, 0.42, -0.25);
    lid.add(mesh(boxGeo(0.8, 0.1, 0.5), MAT.wood(), 0, 0.05, 0.25));
    for (const x of [-0.3, 0.3]) lid.add(mesh(boxGeo(0.05, 0.12, 0.52), MAT.rust(), x, 0.05, 0.25));
    chest.add(lid);
    this.book = bookModel();
    this.book.position.set(0, 0.3, 0.02);
    chest.add(this.book);
    this.chest = chest;
    this.lid = lid;
    this.chestGlint = glint(g, 0xffe0a0, 0.7);
    this.chestGlint.position.set(cx, cy + 0.7, cz);
    this.root.add(chest, this.chestGlint);
    // la caja fuerte del coronel y los papeles adentro
    const [sx, sz] = EE.caja;
    const sy = this.floor(sx, sz, 4.2);
    const safe = new THREE.Group();
    safe.position.set(sx, sy, sz);
    safe.rotation.y = Math.PI;
    safe.add(mesh(boxGeo(0.62, 0.66, 0.55), MAT.iron(), 0, 0.33, 0));
    const door = new THREE.Group();
    door.position.set(-0.31, 0, 0.28);
    door.add(mesh(boxGeo(0.6, 0.62, 0.04), MAT.iron(), 0.3, 0.33, 0.02));
    door.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), MAT.rust(), 0.3, 0.4, 0.05, Math.PI / 2, 0, 0));
    safe.add(door);
    this.papersObj = papersModel();
    this.papersObj.position.set(0, 0.12, 0.02);
    safe.add(this.papersObj);
    this.safe = safe;
    this.safeDoor = door;
    this.root.add(safe);
    // la llave de la caja (la suelta el Sargento)
    this.key2 = keyModel();
    this.key2.visible = false;
    this.key2Glint = glint(g, 0xffd070, 0.8);
    this.key2Glint.visible = false;
    this.root.add(this.key2, this.key2Glint);
    // los urutaú: un palo seco con el pájaro arriba (como un pedazo de rama)
    this.birds = EE.urutau.map(([x, z, h]) => {
      const y0 = this.floor(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y0, z);
      const post = mesh(new THREE.CylinderGeometry(0.07, 0.13, h, 6).translate(0, h / 2, 0), g.world.M.bark, 0, 0, 0, 0.05, 0, 0.04);
      grp.add(post);
      // una rama rota de costado
      grp.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 5), g.world.M.bark, 0.25, h * 0.7, 0, 0, 0, -0.9));
      const bird = new THREE.Group();
      bird.position.set(0.02, h, 0);
      // el cuerpo parado y estirado para arriba, con la cabeza chata (parece la punta del palo)
      const body = mesh(new THREE.SphereGeometry(0.1, 8, 6), MAT.bird(), 0, 0.2, 0);
      body.scale.set(0.95, 2.3, 0.8);
      bird.add(body);
      const head = mesh(new THREE.SphereGeometry(0.075, 8, 6), MAT.bird(), 0, 0.43, 0.02);
      head.scale.set(1.1, 0.8, 1);
      bird.add(head);
      bird.add(mesh(boxGeo(0.035, 0.012, 0.05), MAT.bird(), 0, 0.46, 0.08));
      // los ojos grandes y amarillos (solo brillan cuando canta)
      const eyes = [];
      for (const ex of [-0.035, 0.035]) {
        const e = mesh(new THREE.SphereGeometry(0.02, 6, 5), MAT.eye(), ex, 0.44, 0.075);
        e.visible = false;
        bird.add(e);
        eyes.push(e);
      }
      bird.rotation.x = -0.18;
      grp.add(bird);
      const feather = featherModel();
      feather.visible = false;
      this.root.add(grp, feather);
      const fg = glint(g, 0xe8e0d0, 0.6);
      fg.visible = false;
      this.root.add(fg);
      return { grp, bird, eyes, feather, fg, top: new THREE.Vector3(x + 0.02, y0 + h + 0.3, z), ground: new THREE.Vector3(x + 0.35, y0 + 0.04, z + 0.25) };
    });
    this.sync();
  }

  // Lo que se ve según el estado (también al entrar tarde).
  sync() {
    this.keyObj.visible = this.reja === 'lagoon';
    const open = this.cofre;
    this.lid.rotation.x = open ? -1.7 : 0;
    this.book.visible = this.codice === 'none';
    this.chestGlint.visible = this.codice === 'none';
    this.safeDoor.rotation.y = this.caja === 'open' ? -1.9 : 0;
    this.papersObj.visible = this.papeles === 'none';
    const k2 = this.llave === 'floor' && this.llavePos;
    this.key2.visible = this.key2Glint.visible = !!k2;
    if (k2) {
      this.key2.position.set(this.llavePos[0], this.llavePos[1] + 0.03, this.llavePos[2]);
      this.key2.rotation.set(Math.PI / 2, 0, 0.4);
      this.key2Glint.position.set(this.llavePos[0], this.llavePos[1] + 0.25, this.llavePos[2]);
    }
    this.birds.forEach((b, i) => {
      b.bird.visible = this.uru[i] === 0;
      b.feather.visible = this.uru[i] === 1 || this.uru[i] === 2;
      b.fg.visible = this.uru[i] === 2;
      if (this.uru[i] === 2) {
        b.feather.position.copy(b.ground);
        b.feather.rotation.set(-Math.PI / 2, 0, 0.6);
        b.fg.position.copy(b.ground).setY(b.ground.y + 0.2);
      }
    });
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    const on = () => this.egg.step === 1;
    const E = this.egg;
    // la llave de la reja: en el fondo de la laguna
    const [kx, kz] = EE.llaveReja;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(kx, this.floor(kx, kz) + 0.3, kz),
      radius: 2.6,
      wide: true,
      prompt: () => {
        if (this.reja !== 'lagoon') return null;
        if (E.step < 1) return { text: 'Una llave oxidada en el barro del fondo. Todavía no: primero la voz del Algarrobo de los Colgados tiene que llamar a Gil', noCost: true, info: true };
        if (!on()) return null;
        if (!g.player.underwater) return { text: 'La llave está en el fondo de la laguna: sumergite (C o Ctrl) para agarrarla', noCost: true, info: true };
        return { text: 'agarrar la llave oxidada', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on() || this.reja !== 'lagoon') return false;
        this.reja = 'held';
        announce(g, 'Una llave vieja, de reja. En la Reducción hay una cripta cerrada con una reja.', 4);
        this.changed();
        return true;
      },
    });
    // la reja de la cripta (la puerta 14)
    const rejaIt = I.list.find((x) => x.kind === 'door' && x.door?.def.id === 14);
    if (rejaIt) {
      I.add({
        kind: 'ee',
        pos: rejaIt.pos.clone(),
        radius: 2.2,
        prompt: () => {
          if (rejaIt.door.open) return null;
          if (this.reja === 'held') return { text: 'abrir la reja de la cripta con la llave', noCost: true };
          return { text: on() ? 'La reja de la cripta tiene un candado viejo. La llave... ¿dónde?' : 'Una reja con candado. Abajo se oye agua.', noCost: true, info: true };
        },
        cost: () => 0,
        use: () => {
          if (this.reja !== 'held' || rejaIt.door.open) return false;
          this.reja = 'open';
          I.openDoor(rejaIt.door);
          announce(g, 'La reja cedió. La cripta está inundada: hay que bucear.', 4);
          this.changed();
          return true;
        },
      });
    }
    // el cofre: abrirlo (buceando) y sacar el códice
    const [cx, cz] = EE.cofre;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(cx, this.floor(cx, cz, -2) + 0.5, cz),
      radius: 2.3,
      wide: true,
      prompt: () => {
        if (this.codice !== 'none') return null;
        if (!on()) return { text: E.step < 1 ? 'Un cofre de los padres, bajo el agua. Todavía no: primero la voz del Algarrobo de los Colgados tiene que llamar a Gil' : 'Un cofre de los padres, bajo el agua', noCost: true, info: true };
        if (!g.player.underwater) return { text: 'El cofre está en el fondo de la cripta: sumergite (C o Ctrl) para abrirlo', noCost: true, info: true };
        return { text: this.cofre ? 'sacar el códice de los padres' : 'abrir el cofre de los padres', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on() || this.codice !== 'none') return false;
        if (!this.cofre) {
          this.cofre = true;
          g.audio.door(this.chest.position, false);
        } else {
          this.codice = 'held';
          announce(g, 'El códice de los padres de la Reducción. Al hueco del algarrobo.', 4);
          // Gil puede guardarse una hoja (se lo avisa solo a él)
          E.whisperGil('hoja');
        }
        this.changed();
        return true;
      },
    });
    // la hoja que Gil se guarda (solo lo ve Gil, mientras tengan el códice)
    I.add({
      kind: 'ee',
      local: true,
      wide: true,
      pos: new THREE.Vector3(cx, this.floor(cx, cz, -2) + 0.5, cz),
      radius: 2.4,
      prompt: () => (this.codice === 'held' && !this.hoja && E.isGil() ? { text: 'arrancar una hoja del códice y guardártela (la voz no tiene por qué saberlo todo)', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.hoja || !E.isGil()) return false;
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'hoja' });
        else this.tearPage();
        g.hud.subtitle('Guardaste una hoja adentro del poncho. Nadie lo vio.', 3.5);
        return true;
      },
    });
    // la caja fuerte del coronel
    const [sx, sz] = EE.caja;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(sx, this.floor(sx, sz, 4.2) + 0.6, sz),
      radius: 2,
      prompt: () => {
        if (this.papeles !== 'none') return null;
        if (this.caja === 'open') return { text: 'sacar los papeles del coronel', noCost: true };
        if (this.llave === 'held') return { text: 'abrir la caja fuerte del coronel', noCost: true };
        if (!on()) return { text: 'La caja fuerte del coronel', noCost: true, info: true };
        if (this.caja === 'sargento') return { text: 'La llave la tiene el Sargento de la partida', noCost: true, info: true };
        return { text: 'forzar la caja fuerte del coronel', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on() || this.papeles !== 'none') return false;
        if (this.caja === 'open') {
          this.papeles = 'held';
          announce(g, 'Los papeles del coronel: nombres, fechas, desertores. Al hueco del algarrobo.', 4);
        } else if (this.llave === 'held') {
          this.caja = 'open';
          this.llave = 'used';
          g.audio.door(this.safe.position, false);
        } else if (this.caja === 'closed') this.callSargento();
        else return false;
        this.changed();
        return true;
      },
    });
    // la llave que suelta el Sargento
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 1.9,
      prompt: () => (this.llave === 'floor' ? { text: 'agarrar la llave del Sargento', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.llave !== 'floor') return false;
        this.llave = 'held';
        announce(g, 'La llave de la caja fuerte del coronel. El despacho, arriba en la casona.', 4);
        this.changed();
        return true;
      },
    });
    this.key2It = I.list[I.list.length - 1];
    // las plumas en el piso
    this.birds.forEach((b, i) => {
      I.add({
        kind: 'ee',
        pos: b.ground.clone().setY(b.ground.y + 0.3),
        radius: 1.8,
        prompt: () => (this.uru[i] === 2 ? { text: 'agarrar la pluma del urutaú', noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (this.uru[i] !== 2) return false;
          this.uru[i] = 3;
          const n = this.uru.filter((u) => u === 3).length;
          announce(g, n < 3 ? `Una pluma de urutaú (${n}/3). Los otros siguen llorando en algún lado.` : 'Las tres plumas de urutaú. Al hueco del algarrobo.', 4);
          this.changed();
          return true;
        },
      });
    });
  }

  // (anfitrión) Tocaron la caja: sale el Sargento de la partida, por el patio.
  callSargento() {
    const g = this.g;
    this.caja = 'sargento';
    // si el Sargento ya anda suelto (el de la ronda), la llave la tiene él
    if (!freeBoss(g)) {
      announce(g, 'Cerrada con llave. La llave la tiene el Sargento de la partida, que anda afuera.', 5, true);
      return;
    }
    announce(g, 'Cerrada con llave. Afuera, alguien grita órdenes... ¡El Sargento de la partida!', 5, true);
    g.zombies.spawnBoss(Math.max(8, g.rounds.round), { at: new THREE.Vector3(72.5, this.floor(72.5, 21.5), 21.5), kind: 'sargento' });
  }

  tearPage() {
    this.hoja = true;
    this.changed();
  }

  // (anfitrión) Se murió un jefe: si era el Sargento (el de la caja o el de la
  // ronda, es el mismo), suelta la llave.
  onBossDeath(pos, z) {
    if (this.caja === 'open' || this.llave !== 'none') return;
    if (this.caja !== 'sargento' && z?.kind !== 'sargento') return;
    this.llave = 'floor';
    const y = this.g.world.floorAt(pos.x, pos.z, pos.y);
    this.llavePos = [pos.x, y, pos.z];
    announce(this.g, 'Al Sargento se le cayó una llave.', 3.5);
    this.changed();
  }

  // Un tiro: ¿le pegó a un urutaú? (cada compu el suyo; el invitado avisa)
  onShot(o, d, maxT) {
    if (this.egg.step !== 1) return;
    this.birds.forEach((b, i) => {
      if (this.uru[i] !== 0) return;
      if (rayHit(o, d, maxT, tmpV.copy(b.top).setY(b.top.y - 0.05), 0.42) < 0) return;
      if (!firstHit(this.g, (this.shotT ??= []), i, 1)) return;
      if (isHost(this.g)) this.scare(i);
      else this.g.net.net.send({ t: 'pee', a: 'uru', i });
    });
  }

  // (anfitrión) El urutaú se espanta y se le cae una pluma.
  scare(i) {
    if (this.uru[i] !== 0) return;
    this.uru[i] = 1;
    this.fallT[i] = 0;
    this.puff(i);
    this.changed();
  }

  puff(i) {
    const g = this.g;
    const b = this.birds[i];
    g.fx.sparkle(b.top, [0.55, 0.5, 0.42], 26, 1.4);
    g.audio.featherFwip?.(b.top);
  }

  // ¿Qué tienen en las manos para dejar en el hueco?
  held() {
    const list = [];
    if (this.codice === 'held') list.push('codice');
    if (this.papeles === 'held') list.push('papeles');
    if (this.plumas === 'none' && this.uru.every((u) => u === 3)) list.push('plumas');
    return list;
  }

  // (anfitrión) Lo dejan en el hueco del algarrobo.
  give(list) {
    for (const k of list) {
      if (k === 'codice') this.codice = 'given';
      if (k === 'papeles') this.papeles = 'given';
      if (k === 'plumas') this.plumas = 'given';
    }
    this.changed();
  }

  done() {
    return this.codice === 'given' && this.papeles === 'given' && this.plumas === 'given';
  }

  // El cartel: qué falta del saber y dónde.
  lines() {
    const plumas = this.uru.filter((u) => u === 3).length;
    const list = [];
    const codice =
      this.codice === 'given' ? '' : this.codice === 'held' ? 'al hueco del algarrobo' : this.reja === 'lagoon' ? 'la reja de la cripta: su llave brilla en el fondo de la Laguna del Irupé' : this.reja === 'held' ? 'abrir la reja de la cripta, en la iglesia de la Reducción' : 'bucear en la cripta inundada de la Reducción';
    list.push(['El códice de los padres', codice, this.codice === 'given']);
    const papeles =
      this.papeles === 'given' ? '' : this.papeles === 'held' ? 'al hueco del algarrobo' : this.caja === 'open' ? 'en la caja fuerte abierta, en el despacho de la casona' : this.llave === 'held' ? 'abrir la caja fuerte del despacho, en la casona' : this.llave === 'floor' ? 'la llave quedó donde cayó el Sargento' : this.caja === 'sargento' ? 'la llave la tiene el Sargento de la partida' : 'la caja fuerte del despacho, arriba en la Casona del Coronel';
    list.push(['Los papeles del coronel', papeles, this.papeles === 'given']);
    const uru = this.plumas === 'given' ? '' : plumas === 3 ? 'al hueco del algarrobo' : `${plumas}/3 · se los oye llorar; parecen ramas secas, un tiro los espanta`;
    list.push(['Las plumas de los urutaú', uru, this.plumas === 'given']);
    return list;
  }

  changed() {
    this.sync();
    this.egg.netSync();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // (el brillo del fondo, solo cuando es su paso: antes confundía)
    this.keyGlint.visible = this.reja === 'lagoon' && this.egg.step === 1;
    if (this.keyGlint.visible) pulse(this.keyGlint, t, 0.5, 0.3, 2.4);
    if (this.chestGlint.visible) pulse(this.chestGlint, t, 0.35, 0.25, 2);
    if (this.key2Glint.visible) {
      pulse(this.key2Glint, t);
      this.key2It.pos.set(this.llavePos[0], this.llavePos[1] + 0.3, this.llavePos[2]);
    }
    const on = this.egg.step === 1;
    this.birds.forEach((b, i) => {
      // el canto (cada compu el suyo; los ojos se prenden mientras canta)
      if (this.uru[i] === 0 && on) {
        this.callT[i] -= dt;
        if (this.callT[i] <= 0) {
          this.callT[i] = 16 + Math.random() * 10;
          this.eyeT[i] = 3.2;
          if (g.camera.position.distanceTo(b.top) < 60) urutauCall(g, b.top);
        }
      }
      this.eyeT[i] = Math.max(0, this.eyeT[i] - dt);
      for (const e of b.eyes) e.visible = this.eyeT[i] > 0 || (on && Math.sin(t * 0.7 + i * 2) > 0.985);
      // la pluma cae meciéndose
      if (this.uru[i] === 1) {
        this.fallT[i] += dt;
        const k = Math.min(1, this.fallT[i] / 3);
        b.feather.position.lerpVectors(b.top, b.ground, k);
        b.feather.position.x += Math.sin(this.fallT[i] * 4) * 0.35 * (1 - k);
        b.feather.rotation.set(Math.sin(this.fallT[i] * 4) * 0.8, this.fallT[i], 0);
        if (k >= 1 && isHost(g)) {
          this.uru[i] = 2;
          this.changed();
        }
      }
      if (b.fg.visible) pulse(b.fg, t + i, 0.4, 0.3, 2.6);
    });
  }

  // ---------------- red ----------------
  state() {
    return { rj: this.reja, cf: this.cofre ? 1 : 0, cd: this.codice, hj: this.hoja ? 1 : 0, cj: this.caja, ll: this.llave, lp: this.llavePos, pp: this.papeles, ur: this.uru, pl: this.plumas };
  }

  apply(m) {
    // los urutaú que se espantaron recién (el humo de plumas, en todas las compus)
    if (m.ur) m.ur.forEach((u, i) => {
      if (this.uru[i] === 0 && u >= 1) {
        this.puff(i);
        this.fallT[i] = 0;
      }
    });
    Object.assign(this, {
      reja: m.rj ?? this.reja,
      cofre: m.cf != null ? !!m.cf : this.cofre,
      codice: m.cd ?? this.codice,
      hoja: m.hj != null ? !!m.hj : this.hoja,
      caja: m.cj ?? this.caja,
      llave: m.ll ?? this.llave,
      llavePos: m.lp ?? this.llavePos,
      papeles: m.pp ?? this.papeles,
      uru: m.ur ?? this.uru,
      plumas: m.pl ?? this.plumas,
    });
    this.sync();
  }

  onGuest(m, from) {
    if (m.a === 'uru') this.scare(m.i);
    else if (m.a === 'hoja' && this.egg.isGil(from) && this.codice === 'held') this.tearPage();
  }

  dispose() {
    this.root.removeFromParent();
  }
}
