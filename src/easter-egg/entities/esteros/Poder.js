import * as THREE from 'three';
import { EE } from '../../config/map';
import { WEAPONS } from '../../config/weapons';
import Encierro from '../Encierro';
import { isHost, announce, toastAll } from '../castle/common';
import { glint, pulse, pavaModel } from './common';

// "El Pacto", pasos 2 y 3: el poder.
//  2. El Liquidificador: la pava negra del fondo de la Laguna del Irupé
//     (bucear), las brasas de quebracho de la locomóvil del obraje (con la luz
//     prendida), el agua de luna (donde la luna pega en el agua, junto a la
//     pasarela) y el altar de la iglesia: la pava se deja ahí y la iglesia se
//     cierra (encierro). Cuando aguantan, cada uno saca su Liquidificador.
//  3. La creciente: la voz hace subir el agua la ronda siguiente (Rounds pide
//     takeFlood) y hay que hervirla con los Liquidificadores: cada muerto que
//     se cocina en el agua hirviendo es un alma para la voz. Las almas vuelan
//     a la laguna, donde se junta la luz (Ofrenda.js).
// Lo decide el anfitrión.

const RITUAL = 60;
const tmpTo = new THREE.Vector3();

export default class Poder {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // la pava: lagoon, held, brasas, luna, altar (esperando a todos), ritual, ready
    this.pava = 'lagoon';
    this.ritualT = 0;
    // las almas de la creciente
    this.souls = 0;
    this.wisps = [];
    this.enc = new Encierro(g, { zone: 'E2', color: 0x9ad8ff, place: 'la iglesia de la Reducción' });
    this.build();
    this.register();
  }

  floor(x, z, y) {
    return this.g.world.floorAt(x, z, y);
  }

  need() {
    return 10 + 4 * (this.egg.players() - 1);
  }

  // ---------------- lo que se ve ----------------
  build() {
    const g = this.g;
    // la pava hundida
    const [px, pz] = EE.pava;
    this.sunk = pavaModel();
    this.sunk.position.set(px, this.floor(px, pz) + 0.02, pz);
    this.sunk.rotation.set(0.5, 0.8, 0.3);
    this.sunkGlint = glint(g, 0x9affc8, 0.9);
    this.sunkGlint.position.set(px, this.floor(px, pz) + 0.3, pz);
    this.root.add(this.sunk, this.sunkGlint);
    // la del altar (la misma pava, ya embrujada)
    const [ax, az] = EE.altar;
    this.altarPava = pavaModel(true);
    this.altarPava.position.set(ax, this.floor(ax, az) + 1.02, az);
    this.altarPava.visible = false;
    this.altarGlow = glint(g, 0x9affc8, 1.8);
    this.altarGlow.position.set(ax, this.floor(ax, az) + 1.25, az);
    this.altarGlow.visible = false;
    this.root.add(this.altarPava, this.altarGlow);
    // el rayo de luna sobre el agua: un cono de luz fría que baja del cielo
    const [lx, lz] = EE.luna;
    const geo = new THREE.CylinderGeometry(0.5, 1.4, 22, 20, 12, true);
    const pa = geo.attributes.position;
    const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const h = (pa.getY(i) + 11) / 22;
      const a = Math.min(1, h * 5) * (1 - h) ** 1.4;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xb8d8ff, vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.beam.position.set(lx, 11 - 0.3, lz);
    this.beam.rotation.z = 0.12;
    this.beam.visible = false;
    this.beamGlint = glint(g, 0xd0e8ff, 2.4);
    this.beamGlint.position.set(lx, 0.3, lz);
    this.beamGlint.visible = false;
    this.root.add(this.beam, this.beamGlint);
    // las almas que vuelan a la laguna
    this.wispMat = new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xb8ffd8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.sync();
  }

  sync() {
    this.sunk.visible = this.pava === 'lagoon';
    const onAltar = this.pava === 'altar' || this.pava === 'ritual' || this.pava === 'ready';
    this.altarPava.visible = onAltar;
    this.altarGlow.visible = this.pava === 'ritual' || this.pava === 'ready';
    this.beam.visible = this.beamGlint.visible = this.pava === 'brasas';
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    const E = this.egg;
    const on = () => E.step === 2;
    // la pava del fondo
    const [px, pz] = EE.pava;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(px, this.floor(px, pz) + 0.3, pz),
      radius: 2.6,
      wide: true,
      prompt: () => {
        if (this.pava !== 'lagoon') return null;
        if (E.step < 2) return { text: 'Una pava negra hundida en el barro. Todavía no: primero la voz quiere el saber (El Pacto, paso 1: al hueco del algarrobo)', noCost: true, info: true };
        if (!on()) return null;
        if (!g.player.underwater) return { text: 'La pava está en el fondo de la laguna: sumergite (C o Ctrl) para sacarla', noCost: true, info: true };
        return { text: 'sacar la pava negra del fondo', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on() || this.pava !== 'lagoon') return false;
        this.pava = 'held';
        announce(g, 'Una pava negra, helada aunque estuvo en el barro. Las brasas del obraje, en la locomóvil.', 5);
        this.changed();
        return true;
      },
    });
    // las brasas de la locomóvil
    const [bx, bz] = EE.brasas;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(bx, this.floor(bx, bz) + 1.1, bz),
      radius: 2.2,
      prompt: () => {
        if (!on() || this.pava !== 'held') return null;
        if (!g.world.power) return { text: 'La caldera de la locomóvil está fría: prendé la luz del obraje', noCost: true, info: true };
        return { text: 'poner la pava sobre las brasas de quebracho', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on() || this.pava !== 'held' || !g.world.power) return false;
        this.pava = 'brasas';
        g.fx.sparkle(new THREE.Vector3(bx, this.floor(bx, bz) + 1.2, bz), [1, 0.5, 0.15], 30, 1.4);
        announce(g, 'La pava se calentó y no hierve: está vacía. Le falta agua de luna, donde la luna pega en el agua, junto a la pasarela.', 6);
        this.changed();
        return true;
      },
    });
    // el agua de luna
    const [lx, lz] = EE.luna;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(lx, 0.6, lz),
      radius: 2.4,
      wide: true,
      prompt: () => (on() && this.pava === 'brasas' ? { text: 'llenar la pava con agua de luna', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!on() || this.pava !== 'brasas') return false;
        this.pava = 'luna';
        g.fx.sparkle(new THREE.Vector3(lx, 0.4, lz), [0.7, 0.85, 1], 40, 1.8);
        announce(g, 'El agua de luna chilla en la pava caliente. Al altar de la iglesia, en la Reducción.', 5);
        this.changed();
        return true;
      },
    });
    // el altar
    const [ax, az] = EE.altar;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(ax, this.floor(ax, az) + 1.1, az),
      radius: 2.3,
      prompt: () => {
        if (!on()) return null;
        if (this.pava === 'luna' || this.pava === 'altar') {
          const miss = this.enc.missingText();
          return miss ? { text: miss, noCost: true, info: true } : { text: 'dejar la pava en el altar', noCost: true };
        }
        if (this.pava === 'ritual') return { text: `El altar hierve: aguanten ${Math.max(0, Math.ceil(RITUAL - this.ritualT))} s`, noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (!on() || (this.pava !== 'luna' && this.pava !== 'altar')) return false;
        if (this.enc.missing().length) return false;
        this.startRitual();
        return true;
      },
    });
    // el Liquidificador: cada uno saca el suyo del altar (lo de cada uno)
    I.add({
      kind: 'ee',
      local: true,
      pos: new THREE.Vector3(ax, this.floor(ax, az) + 1.1, az),
      radius: 2.3,
      prompt: () => (this.pava === 'ready' && WEAPONS.liquidificador && !g.weapons.has('liquidificador') ? { text: 'agarrar el Liquidificador', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.pava !== 'ready' || !WEAPONS.liquidificador || g.weapons.has('liquidificador')) return false;
        g.weapons.give('liquidificador');
        g.hud.toast('Liquidificador: hierve lo que toca. El agua también... y a vos con ella.');
        return true;
      },
    });
  }

  // (anfitrión) La pava en el altar: la iglesia se cierra.
  startRitual() {
    const g = this.g;
    this.pava = 'ritual';
    this.ritualT = 0;
    this.enc.start();
    announce(g, `¡La iglesia se cerró! La pava hierve en el altar: aguanten ${RITUAL} segundos.`, 5, true);
    this.changed();
  }

  // (anfitrión) Aguantaron: la pava es el Liquidificador.
  finishRitual() {
    const g = this.g;
    this.pava = 'ready';
    this.enc.stop();
    const [ax, az] = EE.altar;
    g.fx.explosion(new THREE.Vector3(ax, this.floor(ax, az) + 1.3, az), 1.6, [0.6, 1, 0.8]);
    toastAll(g, 'El Liquidificador está en el altar: cada uno saca el suyo');
    g.hud.achievement?.('Liquidificador', 'La pava de la laguna hierve con agua de luna');
    this.egg.onLiquid();
    this.changed();
  }

  // ---------------- la creciente ----------------
  // (anfitrión) ¿La ronda que viene tiene que ser de creciente?
  wantFlood() {
    return this.egg.step === 3 && this.souls < this.need();
  }

  // (anfitrión) Un muerto se cocinó en el agua hirviendo.
  onBoilKill(pos) {
    if (this.egg.step !== 3 || !this.g.rounds.flood || this.souls >= this.need()) return;
    this.souls++;
    this.wisp(pos);
    this.g.net?.event('ee', { wi: [+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1)], sl: this.souls });
    if (this.souls >= this.need()) this.egg.onSouls();
    else if (this.souls % 4 === 0) announce(this.g, `Almas para la voz: ${this.souls} de ${this.need()}`, 2.5);
  }

  // Un alma que vuela hasta la luz de la laguna.
  wisp(pos) {
    const s = new THREE.Sprite(this.wispMat);
    s.scale.setScalar(0.7);
    s.position.copy(pos);
    this.root.add(s);
    const [ox, oz] = EE.orbe;
    this.wisps.push({ s, from: pos.clone().setY(pos.y + 0.6), to: new THREE.Vector3(ox, (this.g.water?.level ?? 0) + 1, oz), t: 0, dur: 1.6 + pos.distanceTo(tmpTo.set(ox, 0, oz)) * 0.04 });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // (el brillo del fondo, solo cuando es su paso)
    this.sunkGlint.visible = this.pava === 'lagoon' && this.egg.step === 2;
    if (this.sunkGlint.visible) pulse(this.sunkGlint, t, 0.4, 0.3, 1.8);
    if (this.beam.visible) {
      this.beam.material.opacity = 0.24 + Math.sin(t * 0.8) * 0.05;
      pulse(this.beamGlint, t, 0.35, 0.15, 1.2);
      this.beamGlint.position.y = (g.water?.level ?? 0) + 0.15;
    }
    if (this.altarGlow.visible) {
      pulse(this.altarGlow, t, 0.5, 0.25, this.pava === 'ritual' ? 6 : 2);
      if (Math.random() < dt * 5) g.fx.steam?.(this.altarGlow.position, 1, 0.3);
    }
    // las almas en vuelo
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.t += dt / w.dur;
      const k = Math.min(1, w.t);
      w.s.position.lerpVectors(w.from, w.to, k);
      w.s.position.y += Math.sin(k * Math.PI) * 5;
      w.s.material.opacity = 1 - k * 0.3;
      if (k >= 1) {
        w.s.removeFromParent();
        this.wisps.splice(i, 1);
      }
    }
    this.enc.update(dt);
    if (!isHost(g) || this.pava !== 'ritual') return;
    this.ritualT += dt;
    this.enc.spawns(dt, 1.4);
    if (this.ritualT >= RITUAL) this.finishRitual();
  }

  line() {
    const p = this.pava;
    if (p === 'lagoon') return { main: 'La pava del fondo de la laguna', sub: 'Algo brilla en lo más hondo de la Laguna del Irupé: hay que bucear' };
    if (p === 'held') return { main: 'Las brasas de quebracho', sub: this.g.world.power ? 'La locomóvil del Obraje tiene brasas: la pava encima' : 'La locomóvil del Obraje: primero hay que prender la luz (la caldera)' };
    if (p === 'brasas') return { main: 'El agua de luna', sub: 'Donde la luna pega en el agua, al lado de la pasarela de la laguna' };
    if (p === 'luna' || p === 'altar') return { main: 'El altar de la iglesia', sub: 'La pava en el altar de la Reducción, todos adentro de la iglesia (se cierra)' };
    if (p === 'ritual') return { main: 'La iglesia cerrada', sub: 'La pava hierve en el altar: aguanten', count: `${Math.max(0, Math.ceil(RITUAL - this.ritualT))} s` };
    return null;
  }

  changed() {
    this.sync();
    this.egg.netSync();
  }

  state() {
    return { pv: this.pava, rt: +this.ritualT.toFixed(1), so: this.souls };
  }

  apply(m) {
    if (m.wi) {
      this.wisp(tmpTo.set(m.wi[0], m.wi[1], m.wi[2]).clone());
      this.souls = m.sl ?? this.souls;
      return;
    }
    const was = this.pava;
    if (m.pv) this.pava = m.pv;
    if (m.rt != null) this.ritualT = m.rt;
    if (m.so != null) this.souls = m.so;
    // la cortina de la iglesia, también en las compus de los invitados
    if (was !== 'ritual' && this.pava === 'ritual') this.enc.start();
    if (was === 'ritual' && this.pava !== 'ritual') this.enc.stop();
    this.sync();
  }

  dispose() {
    this.enc.dispose();
    this.root.removeFromParent();
  }
}
