import * as THREE from 'three';
import { EE } from '../../config/map';
import { WEAPONS } from '../../config/weapons';
import Encierro from '../Encierro';
import { isHost, announce, toastAll, ring, players } from '../castle/common';
import { glint, pulse, pavaModel } from './common';

// "El Pacto", pasos 2 y 3: el poder.
//  2. El Liquidificador: la pava negra del fondo de la Laguna del Irupé
//     (bucear), las brasas de quebracho de la locomóvil del obraje (con la luz
//     prendida: se deja arriba del hogar, se calienta HEAT segundos y se la
//     vuelve a agarrar), el agua de luna (donde la luna pega en el agua, junto
//     a la pasarela: hay que quedarse MOON segundos abajo del rayo) y el altar
//     de la iglesia: la pava se deja ahí y la iglesia se cierra (encierro).
//     Cuando aguantan, cada uno saca su Liquidificador.
//     (2026-10-10, el usuario: los pasos del arma "se sienten medio flojitos":
//     las brasas, "3 segunditos con una animación de calentarse"; la luna,
//     "tenés que quedarte 5 segundos debajo suya (no se interrumpe con
//     zombies)" y que se vea: "yo medio me perdí en dónde era")
//  3. La creciente: la voz hace subir el agua la ronda siguiente (Rounds pide
//     takeFlood) y hay que hervirla con los Liquidificadores: cada muerto que
//     se cocina en el agua hirviendo es un alma para la voz. Las almas vuelan
//     a la laguna, donde se junta la luz (Ofrenda.js).
// Lo decide el anfitrión.

const RITUAL = 60;
// lo que tarda la pava en calentarse sobre las brasas, lo que hay que quedarse
// abajo del rayo de luna y el radio del rayo en el agua
const HEAT = 3;
const MOON = 5;
const MOON_R = 2.6;
const HOT = [1, 0.5, 0.15];
const tmpTo = new THREE.Vector3();

export default class Poder {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // la pava: lagoon, held, heating (sobre las brasas), hot (lista para
    // agarrarla), brasas (caliente, en la mano), luna, altar (esperando a
    // todos), ritual, ready
    this.pava = 'lagoon';
    this.ritualT = 0;
    this.heatT = 0;
    this.lunaT = 0;
    this.lunaSend = 0;
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
    const geo = new THREE.CylinderGeometry(0.9, MOON_R, 22, 24, 12, true);
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
    // (para que se encuentre: el núcleo del rayo, el anillo de donde hay que
    // pararse —se llena mientras carga— y una mancha de luz alta que se ve por
    // encima del pajonal desde la senda y desde la pasarela)
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.7, 22, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8f2ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.beamCore.position.copy(this.beam.position);
    this.beamCore.rotation.z = 0.12;
    this.beamRing = ring(MOON_R, 0xcfe4ff, 0.16);
    this.beamFill = ring(MOON_R, 0xe8f2ff, 0.6);
    this.beamHigh = glint(g, 0xd0e8ff, 7);
    this.beamHigh.position.set(lx - 0.8, 7, lz);
    this.beamHigh.material.fog = false;
    this.beamExtra = [this.beamCore, this.beamRing, this.beamFill, this.beamHigh];
    for (const o of this.beamExtra) o.visible = false;
    this.root.add(this.beam, this.beamGlint, ...this.beamExtra);
    // la pava calentándose arriba del hogar de la locomóvil, con su brasa
    const [hx, hz, hh] = EE.brasasPava;
    this.hotAt = new THREE.Vector3(hx, this.floor(hx, hz) + hh, hz);
    this.hotPava = pavaModel();
    this.hotPava.position.copy(this.hotAt);
    this.hotPava.rotation.y = 0.9;
    this.hotGlow = glint(g, 0xff7a2a, 1.2);
    this.hotGlow.position.copy(this.hotAt).setY(this.hotAt.y + 0.12);
    this.hotFlame = glint(g, 0xffd060, 0.8);
    this.hotPava.visible = this.hotGlow.visible = this.hotFlame.visible = false;
    this.root.add(this.hotPava, this.hotGlow, this.hotFlame);
    this.beamFlash = 0;
    // las almas que vuelan a la laguna
    this.wispMat = new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xb8ffd8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.sync();
  }

  sync() {
    const was = this.shown;
    this.shown = this.pava;
    if (was && was !== this.pava) this.flair(was, this.pava);
    this.sunk.visible = this.pava === 'lagoon';
    const onAltar = this.pava === 'altar' || this.pava === 'ritual' || this.pava === 'ready';
    this.altarPava.visible = onAltar;
    this.altarGlow.visible = this.pava === 'ritual' || this.pava === 'ready';
    // (el rayo ya se ve con la pava lista sobre las brasas: se sabe adónde sigue)
    const moon = this.pava === 'brasas' || this.pava === 'hot';
    this.beam.visible = this.beamGlint.visible = moon;
    for (const o of this.beamExtra) o.visible = moon;
    this.hotPava.visible = this.hotGlow.visible = this.hotFlame.visible = this.pava === 'heating' || this.pava === 'hot';
  }

  // Lo que se ve y se oye cuando la pava pasa de un momento al otro, en todas
  // las compus (el usuario, 2026-10-10: los pasos de la pava "se vieron medio
  // planos": que sean vistosos).
  flair(was, now) {
    const g = this.g;
    const lv = g.water?.level ?? 0;
    const GREEN = [0.6, 1, 0.8];
    const MOONC = [0.7, 0.85, 1];
    if (now === 'held' && was === 'lagoon') {
      // sale del barro: un fogonazo verde abajo del agua y el agua que salta arriba
      const [px, pz] = EE.pava;
      g.fx.explosion(new THREE.Vector3(px, this.floor(px, pz) + 0.4, pz), 1.4, GREEN);
      g.fx.sparkle(new THREE.Vector3(px, lv + 0.3, pz), GREEN, 40, 1.6);
      g.water?.splash?.(px, pz, 1.8);
      g.audio.sting?.();
    } else if (now === 'heating') {
      g.fx.explosion(this.hotAt.clone(), 0.7, HOT);
      g.fx.sparkle(this.hotAt, HOT, 40, 1.2);
    } else if (now === 'hot') {
      // lista: larga vapor y silba
      g.fx.steam?.(this.hotAt.clone().setY(this.hotAt.y + 0.3), 10, 0.35);
      g.fx.explosion(this.hotAt.clone().setY(this.hotAt.y + 0.2), 0.8, [1, 0.8, 0.5]);
      g.audio.kettle?.(this.hotAt.clone(), 1.4);
    } else if (now === 'brasas') {
      g.fx.sparkle(this.hotAt, HOT, 30, 1);
      // (el rayo de luna pega un fogonazo: ahí sigue)
      this.beamFlash = 1;
    } else if (now === 'luna') {
      // llena: el rayo revienta en el agua
      const [lx, lz] = EE.luna;
      g.fx.explosion(new THREE.Vector3(lx, lv + 0.6, lz), 2.4, MOONC);
      g.fx.sparkle(new THREE.Vector3(lx, lv + 1.2, lz), MOONC, 60, 2.6);
      g.water?.splash?.(lx, lz, 2.2);
    } else if (now === 'ritual') {
      const [ax, az] = EE.altar;
      g.fx.explosion(new THREE.Vector3(ax, this.floor(ax, az) + 1.3, az), 1.2, GREEN);
    }
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
        if (!on()) return null;
        if (this.pava === 'heating') return { text: 'La pava se calienta sobre las brasas...', noCost: true, info: true };
        if (this.pava === 'hot') return { text: 'agarrar la pava caliente', noCost: true };
        if (this.pava !== 'held') return null;
        if (!g.world.power) return { text: 'La caldera de la locomóvil está fría: prendé la luz del obraje', noCost: true, info: true };
        return { text: 'poner la pava sobre las brasas de quebracho', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!on()) return false;
        // caliente: se la vuelve a agarrar (no hace falta haberse quedado)
        if (this.pava === 'hot') {
          this.pava = 'brasas';
          this.lunaT = 0;
          announce(g, 'Agua de luna: el rayo sobre la laguna, junto a la pasarela', 5);
          this.changed();
          return true;
        }
        if (this.pava !== 'held' || !g.world.power) return false;
        this.pava = 'heating';
        this.heatT = 0;
        g.fx.sparkle(this.hotAt, HOT, 30, 1.4);
        this.changed();
        return true;
      },
    });
    // el agua de luna: no se toca nada, hay que quedarse abajo del rayo
    const [lx, lz] = EE.luna;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(lx, 0.6, lz),
      radius: MOON_R,
      wide: true,
      prompt: () => (on() && this.pava === 'brasas' ? { text: `La pava se llena de agua de luna: quedate ${Math.max(1, Math.ceil(MOON - this.lunaT))} s`, noCost: true, info: true } : null),
      cost: () => 0,
      use: () => false,
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
    announce(g, '', 5, true);
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
    return this.egg.step === 3 && this.egg.cruces.done && this.souls < this.need();
  }

  // (anfitrión) Un muerto se cocinó en el agua hirviendo.
  onBoilKill(pos) {
    if (this.egg.step !== 3 || !this.egg.cruces.done || !this.g.rounds.flood || this.souls >= this.need()) return;
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
      // (más fuerte mientras carga)
      const k = this.pava === 'brasas' ? Math.min(1, this.lunaT / MOON) : 0;
      const lv = (g.water?.level ?? 0) + 0.06;
      this.beamFlash = Math.max(0, this.beamFlash - dt * 0.9);
      const fl = this.beamFlash;
      this.beam.material.opacity = 0.36 + k * 0.25 + fl * 0.4 + Math.sin(t * (0.8 + k * 6)) * 0.05;
      this.beamCore.material.opacity = 0.3 + k * 0.4 + fl * 0.5 + Math.sin(t * 1.7) * 0.06;
      this.beamCore.scale.set(1 + k * 1.2 + fl * 2, 1, 1 + k * 1.2 + fl * 2);
      pulse(this.beamGlint, t, 0.5, 0.2, 1.2);
      this.beamGlint.position.y = lv + 0.1;
      this.beamRing.position.set(EE.luna[0], lv, EE.luna[1]);
      this.beamRing.material.opacity = 0.6 + Math.sin(t * 2.4) * 0.2;
      this.beamFill.position.set(EE.luna[0], lv - 0.01, EE.luna[1]);
      this.beamFill.scale.setScalar(Math.max(0.02, k));
      this.beamFill.material.opacity = k > 0 ? 0.35 + k * 0.3 : 0;
      pulse(this.beamHigh, t, 0.3, 0.08, 0.9);
      if (k > 0 && k < 1 && Math.random() < dt * 14) g.fx.sparkle(tmpTo.set(EE.luna[0] + (Math.random() - 0.5) * 3, lv + Math.random() * 1.6, EE.luna[1] + (Math.random() - 0.5) * 3), [0.75, 0.88, 1], 1, 0.5);
    }
    // la pava sobre las brasas: la brasa crece, saltan chispas y al final larga vapor
    if (this.hotPava.visible) {
      if (this.pava === 'heating' && !isHost(g)) this.heatT = Math.min(HEAT, this.heatT + dt);
      const k = this.pava === 'hot' ? 1 : Math.min(1, this.heatT / HEAT);
      this.hotGlow.scale.setScalar(0.8 + k * 1.8);
      this.hotGlow.material.opacity = 0.35 + k * 0.5 + Math.sin(t * (6 + k * 10)) * 0.12;
      this.hotPava.position.y = this.hotAt.y + (this.pava === 'heating' ? Math.sin(t * 34) * 0.006 * k : 0);
      // (la llama que le lame el fondo)
      this.hotFlame.position.set(this.hotAt.x + Math.sin(t * 23) * 0.05, this.hotAt.y - 0.02 + Math.abs(Math.sin(t * 17)) * 0.1 * (0.4 + k), this.hotAt.z + Math.cos(t * 19) * 0.05);
      this.hotFlame.scale.setScalar(0.5 + k * 0.9 + Math.sin(t * 31) * 0.15);
      this.hotFlame.material.opacity = 0.6 + Math.sin(t * 27) * 0.25;
      if (Math.random() < dt * (5 + k * 12)) g.fx.sparkle(this.hotAt, HOT, 1, 0.5);
      if (k >= 1 && Math.random() < dt * 5) g.fx.steam?.(tmpTo.copy(this.hotAt).setY(this.hotAt.y + 0.3), 1, 0.2);
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
    if (isHost(g) && this.egg.step === 2) this.warm(dt);
    if (!isHost(g) || this.pava !== 'ritual') return;
    this.ritualT += dt;
    this.enc.spawns(dt, 1.4);
    if (this.ritualT >= RITUAL) this.finishRitual();
  }

  // (anfitrión) La pava que se calienta sola y la que se llena abajo del rayo.
  warm(dt) {
    const g = this.g;
    if (this.pava === 'heating') {
      this.heatT += dt;
      if (this.heatT >= HEAT) {
        this.pava = 'hot';
        this.changed();
      }
      return;
    }
    if (this.pava !== 'brasas') return;
    // alguien de pie abajo del rayo (que le peguen no lo corta; si sale, espera)
    const [lx, lz] = EE.luna;
    let under = false;
    for (const p of players(g)) if (!(p.me ? g.player.downed : p.downed) && Math.hypot(p.pos.x - lx, p.pos.z - lz) < MOON_R) under = true;
    if (!under) return;
    this.lunaT += dt;
    if (this.lunaT >= MOON) {
      this.pava = 'luna';
      g.fx.sparkle(new THREE.Vector3(lx, (g.water?.level ?? 0) + 0.4, lz), [0.7, 0.85, 1], 40, 1.8);
      announce(g, 'Al altar de la iglesia de la Reducción', 4, true);
      this.changed();
      return;
    }
    // (el avance, a los invitados, dos veces por segundo)
    this.lunaSend -= dt;
    if (this.lunaSend <= 0) {
      this.lunaSend = 0.5;
      g.net?.event('ee', { lq: +this.lunaT.toFixed(1) });
    }
  }

  line() {
    const p = this.pava;
    if (p === 'lagoon') return { main: 'La pava del fondo de la laguna', sub: 'Algo brilla en lo más hondo de la Laguna del Irupé: hay que bucear' };
    if (p === 'held') return { main: 'Las brasas de quebracho', sub: this.g.world.power ? 'La locomóvil del Obraje tiene brasas: la pava encima' : 'La locomóvil del Obraje: primero hay que prender la luz (la caldera)' };
    if (p === 'heating') return { main: 'Las brasas de quebracho', sub: 'La pava se calienta sobre la locomóvil del Obraje' };
    if (p === 'hot') return { main: 'La pava está caliente', sub: 'Agarrala de la locomóvil del Obraje' };
    if (p === 'brasas') return { main: 'El agua de luna', sub: 'Abajo del rayo de luna, en la laguna al lado de la pasarela: quedate hasta que se llene' };
    if (p === 'luna' || p === 'altar') return { main: 'El altar de la iglesia', sub: 'La pava en el altar de la Reducción, todos adentro de la iglesia (se cierra)' };
    if (p === 'ritual') return { main: 'La iglesia cerrada', sub: 'La pava hierve en el altar: aguanten', count: `${Math.max(0, Math.ceil(RITUAL - this.ritualT))} s` };
    return null;
  }

  changed() {
    this.sync();
    this.egg.netSync();
  }

  state() {
    return { pv: this.pava, rt: +this.ritualT.toFixed(1), so: this.souls, lt: +this.lunaT.toFixed(1) };
  }

  apply(m) {
    if (m.wi) {
      this.wisp(tmpTo.set(m.wi[0], m.wi[1], m.wi[2]).clone());
      this.souls = m.sl ?? this.souls;
      return;
    }
    if (m.lq != null) {
      this.lunaT = m.lq;
      return;
    }
    const was = this.pava;
    if (m.pv) this.pava = m.pv;
    if (m.lt != null) this.lunaT = m.lt;
    // (la pava recién puesta sobre las brasas: el invitado la ve calentarse desde cero)
    if (was !== 'heating' && this.pava === 'heating') this.heatT = 0;
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
