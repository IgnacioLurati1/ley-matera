import * as THREE from 'three';
import { ZONES, EE } from '../../config/map';
import { ISLANDS } from '../../config/maps/eclipse';
import { QStep, Marker, Pickup, HoldZone, glowMate, glowOrb, players, playerAt, dist2, islaAt, myId } from './common';

// Los siete pasos de las islas de "El Primer Mate" (entities/EclipseEgg.js):
// cada uno deja un ingrediente del mate o abre algo. En cualquier orden.
//  · molino: la Brasa (las velas de la capilla, prendidas con ánimas)
//  · tapera: la Yerba (la Yerba Madre, defendida y cortada con el Desgarrador)
//  · penal: la Bombilla (la celda de las siete rayas; solo el Gil la abre)
//  · castillo: el Agua (los cuatro juran en los altares; la fuente se deshiela)
//  · centro: la Calabaza (el Gil la saca del fondo de la laguna)
//  · torre: el cañón de Obligado contra el eclipse (fuerza el Desgarro Cósmico
//    y trae la totalidad que pide el temple)
//  · monumento: el Sable (la Llama abre un portal; los cuatro gauchos lo alcanzan)
// Textos cortos: qué + dónde. Lo decide el anfitrión; viaja por 'pee' (k 'eq').

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = (k) => ZONES[k].y;

// ---------------- la Brasa (molino) ----------------
// Siete velas apagadas en la capilla. Cada muerto que cae en la isla del molino
// suelta un ánima que va al jugador más cercano; con un ánima encima, pasar al
// lado de una vela apagada la prende. Con las siete, la Brasa en el altar.
const VELAS = [[32.5, 105.5], [32.5, 111], [36.5, 105], [36.5, 111.5], [40.5, 105.5], [40.5, 111], [33.2, 108.5]];
export class Brasa extends QStep {
  constructor(ee) {
    super(ee, 'brasa');
    const g = this.g;
    const y = Y('E');
    this.st = { on: 1, done: 0, lit: 0, carry: {} };
    this.velas = VELAS.map(([x, z]) => {
      const m = new Marker(g, V(x, y, z), 0xffb060, 0.35);
      m.set(false);
      this.marks.push(m);
      return m;
    });
    // las ánimas sueltas, volando hacia alguien
    this.orbs = [];
    this.orbGeo = glowOrb(0x9fd8ff, 0.12);
    this.pick = new Pickup(g, glowOrb(0xff8030, 0.16), V(33.2, y, 108.5), { text: 'agarrar la Brasa' });
    this.pick.onTake = () => this.send({ a: 'take', id: myId(g) });
    this.live.push(this.pick);
    this.mine = 0;
  }

  // (el anfitrión) un muerto cayó: si fue en el molino, suelta un ánima
  onKill(z) {
    if (this.st.done || !this.host || this.st.lit >= VELAS.length) return;
    if (islaAt(this.g, z.pos) !== 'molino') return;
    // (no más de una ánima por jugador en el aire o encima)
    const P = players(this.g);
    let best = null;
    let bd = 1e9;
    for (const p of P) {
      if (p.downed || this.st.carry[p.id] || this.orbs.some((o) => o.to === p.id)) continue;
      const d = dist2(p.pos, z.pos);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    this.send({ a: 'orb', x: +z.pos.x.toFixed(1), y: +(z.pos.y + 1).toFixed(1), z: +z.pos.z.toFixed(1), to: best.id });
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'orb') {
      const o = this.orbGeo.clone();
      o.position.set(m.x, m.y, m.z);
      g.scene.add(o);
      this.orbs.push({ o, to: m.to, t: 0 });
    } else if (m.a === 'carry') {
      this.st.carry[m.id] = 1;
      if (m.id === myId(g)) g.hud.subtitle('Un ánima. Llevala a una vela apagada de la capilla.', 3.5);
    } else if (m.a === 'lit') {
      this.st.lit = m.n;
      delete this.st.carry[m.id];
      const v = this.velas[m.i];
      v.set(true);
      v.pulse();
      g.fx.sparkle(v.root.position.clone().add(V(0, 0.6, 0)), [1, 0.7, 0.35], 10, 0.4);
      g.audio?.purchase?.();
      if (this.st.lit >= VELAS.length) {
        this.pick.show(true);
        g.hud.subtitle('Las velas arden. La Brasa, en el altar de la capilla.', 4);
      }
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.ee.got('brasa', m.id);
    }
  }

  refresh() {
    for (let i = 0; i < this.velas.length; i++) this.velas[i].set(i < this.st.lit);
    this.pick.show(this.st.lit >= VELAS.length && !this.st.done);
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.g;
    // las ánimas vuelan a su jugador
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const ob = this.orbs[i];
      ob.t += dt;
      const p = playerAt(g, ob.to);
      if (!p || ob.t > 12) {
        ob.o.removeFromParent();
        this.orbs.splice(i, 1);
        continue;
      }
      const tgt = V(p.x, p.y + 1.3, p.z);
      ob.o.position.lerp(tgt, Math.min(1, dt * 2.2));
      if (ob.o.position.distanceTo(tgt) < 0.5) {
        ob.o.removeFromParent();
        this.orbs.splice(i, 1);
        if (this.host) this.send({ a: 'carry', id: ob.to });
      }
    }
    if (!this.host || this.st.done) return;
    // el que lleva un ánima prende la vela que toca
    for (const p of players(g)) {
      if (!this.st.carry[p.id]) continue;
      for (let i = 0; i < VELAS.length; i++) {
        if (this.velas[i].want) continue;
        const [x, z] = VELAS[i];
        if (Math.hypot(p.pos.x - x, p.pos.z - z) < 1.4 && Math.abs(p.pos.y - Y('E')) < 2) {
          this.send({ a: 'lit', i, n: this.st.lit + 1, id: p.id });
          break;
        }
      }
    }
  }

  dispose() {
    super.dispose();
    for (const ob of this.orbs) ob.o.removeFromParent();
  }
}

// ---------------- la Yerba (tapera) ----------------
// La Yerba Madre, en el maizal. Con el Desgarrador en la mano se la despierta
// (F): brilla, y hay que aguantar a su lado hasta que madure; después, tres
// tajos de la guadaña la cortan y deja la Yerba.
const YERBA = V(48.5, 12, 255.5);
const YERBA_HOLD = 45;
export class Yerba extends QStep {
  constructor(ee) {
    super(ee, 'yerba');
    const g = this.g;
    this.st = { on: 1, done: 0, phase: 0, cuts: 0 };
    this.mark = new Marker(g, YERBA, 0x60ff90, 0.9);
    this.mark.set(true);
    this.marks.push(this.mark);
    // la planta: un arbusto de hojas verdes que brilla al despertar
    const grp = new THREE.Group();
    const leafM = new THREE.MeshStandardMaterial({ color: 0x2f7a2a, roughness: 0.8, emissive: 0x2fff70, emissiveIntensity: 0 });
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), leafM);
      const a = (i / 9) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35);
      leaf.rotation.set(0.5 * Math.cos(a), 0, -0.5 * Math.sin(a));
      grp.add(leaf);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }));
    trunk.position.y = 0.3;
    grp.add(trunk);
    grp.position.copy(YERBA);
    g.scene.add(grp);
    this.plant = grp;
    this.leafM = leafM;
    this.hold = new HoldZone(g, YERBA, 7, YERBA_HOLD);
    this.pick = new Pickup(g, glowMate(0x60ff90), YERBA.clone(), { text: 'agarrar la Yerba' });
    this.pick.onTake = () => this.send({ a: 'take', id: myId(g) });
    this.live.push(this.pick);
    this.it = g.interact.add({
      kind: 'eclipse-yerba',
      pos: YERBA.clone().add(V(0, 1, 0)),
      radius: 2.2,
      prompt: () => (this.st.phase === 0 && !this.st.done ? (g.weapons.slot?.id === 'desgarrador' ? { text: 'despertar la Yerba Madre', noCost: true } : { text: 'Necesita el Desgarrador', noCost: true, info: true }) : null),
      cost: () => 0,
      use: () => {
        if (this.st.phase !== 0 || g.weapons.slot?.id !== 'desgarrador') return false;
        this.send({ a: 'wake' });
        return true;
      },
    });
    this.unlisten = null;
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'wake') {
      this.st.phase = 1;
      this.hold.k = 0;
      g.hud.subtitle('La Yerba Madre despierta. Aguantá a su lado hasta que madure.', 4);
      this.mark.pulse();
    } else if (m.a === 'ripe') {
      this.st.phase = 2;
      g.hud.subtitle('Maduró. Cortala con el Desgarrador: tres tajos.', 4);
    } else if (m.a === 'cut') {
      this.st.cuts = m.n;
      this.mark.pulse();
      g.fx.sparkle(YERBA.clone().add(V(0, 0.8, 0)), [0.5, 1, 0.6], 12, 0.5);
      if (this.st.cuts >= 3) {
        this.st.phase = 3;
        this.plant.visible = false;
        this.pick.show(true);
      }
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.mark.set(false);
      this.ee.got('yerba', m.id);
    }
  }

  refresh() {
    this.plant.visible = this.st.phase < 3;
    this.pick.show(this.st.phase === 3 && !this.st.done);
    this.mark.set(!this.st.done);
  }

  // un tajo del Desgarrador (del jugador local) cerca de la planta
  onCut(ev) {
    if (this.st.phase !== 2 || this.st.done) return;
    const d = dist2(ev.o, YERBA);
    if (d > (ev.range || 3) + 0.6) return;
    // (que mire hacia la planta)
    const dx = YERBA.x - ev.o.x;
    const dz = YERBA.z - ev.o.z;
    if ((dx * ev.fwd.x + dz * ev.fwd.z) / Math.max(d, 0.01) < 0.3) return;
    this.send({ a: 'cut', n: this.st.cuts + 1 });
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.g;
    const k = this.st.phase === 1 ? this.hold.k : this.st.phase >= 2 ? 1 : 0;
    this.leafM.emissiveIntensity = k * (0.5 + 0.3 * Math.sin(t * 3));
    if (this.st.phase === 1) {
      if (this.host && this.hold.update(dt)) this.send({ a: 'ripe' });
      else if (!this.host) this.hold.update(dt);
      if (this.hold.inside && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) g.hud.setHint?.(`La Yerba madura: ${Math.ceil((1 - this.hold.k) * YERBA_HOLD)} s`);
    }
  }

  dispose() {
    super.dispose();
    this.plant.removeFromParent();
  }
}

// ---------------- la Bombilla (penal) ----------------
// La celda de las siete rayas, en el pabellón: la reja la abre solo el Gil
// (mantener F); adentro, las cadenas se cortan con un arma blanca (F, tres
// veces) y queda la Bombilla.
const CELDA = V(136.5, 4, 300.5);
export class Bombilla extends QStep {
  constructor(ee) {
    super(ee, 'bombilla');
    const g = this.g;
    this.st = { on: 1, done: 0, open: 0, cuts: 0 };
    this.mark = new Marker(g, CELDA, 0xc0c0ff, 0.8);
    this.mark.set(true);
    this.marks.push(this.mark);
    this.pick = new Pickup(g, glowMate(0xc0c0ff), CELDA.clone(), { text: 'agarrar la Bombilla' });
    this.pick.onTake = () => this.send({ a: 'take', id: myId(g) });
    this.live.push(this.pick);
    this.it = g.interact.add({
      kind: 'eclipse-celda',
      pos: CELDA.clone().add(V(0, 1, 0)),
      radius: 2.2,
      prompt: () => {
        if (this.st.done) return null;
        if (!this.st.open) return this.ee.isGil() ? { text: 'abrir la celda de las siete rayas', noCost: true, hold: true } : { text: 'Solo el Gil abre lo que el Gil cerró', noCost: true, info: true };
        if (this.st.cuts < 3) return g.weapons.slot?.melee || ['desgarrador', 'sable', 'hoz', 'facon'].includes(g.weapons.slot?.id) ? { text: 'cortar las cadenas', noCost: true, hold: true } : { text: 'Necesita un filo', noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      holdTime: 2.2,
      use: () => {
        if (this.st.done) return false;
        if (!this.st.open) {
          if (!this.ee.isGil()) return false;
          this.send({ a: 'open' });
          return true;
        }
        if (this.st.cuts < 3) {
          this.send({ a: 'cut', n: this.st.cuts + 1 });
          return true;
        }
        return false;
      },
    });
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'open') {
      this.st.open = 1;
      this.mark.pulse();
      g.audio?.door?.(CELDA, true);
      g.hud.subtitle('La celda se abre. Las cadenas, con un filo.', 3.5);
    } else if (m.a === 'cut') {
      this.st.cuts = m.n;
      this.mark.pulse();
      g.fx.sparkle(CELDA.clone().add(V(0, 0.8, 0)), [0.8, 0.8, 1], 8, 0.4);
      if (this.st.cuts >= 3) this.pick.show(true);
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.mark.set(false);
      this.ee.got('bombilla', m.id);
    }
  }

  refresh() {
    this.pick.show(this.st.cuts >= 3 && !this.st.done);
    this.mark.set(!this.st.done);
  }
}

// ---------------- el Agua (castillo) ----------------
// Cuatro altares en el patio de armas, uno por naturaleza. Cada uno se jura
// manteniendo F; cada jura trae un encierro corto que hay que aguantar al pie
// del altar. Con los cuatro, la fuente se deshiela y deja el Agua.
const ALTARES = [
  { id: 'fuego', pos: V(150.5, 56, 36.5), col: 0xff6a30, name: 'el que ataca primero' },
  { id: 'viento', pos: V(165.5, 56, 36.5), col: 0xa0ffd0, name: 'el que tiene miedo' },
  { id: 'rayo', pos: V(150.5, 56, 43.5), col: 0xffe060, name: 'el que espera' },
  { id: 'hielo', pos: V(165.5, 56, 43.5), col: 0x80c0ff, name: 'el que aguanta' },
];
const FUENTE = V(157.5, 56, 40);
// (el objeto del Agua, al pie de la fuente, no adentro de la estatua)
const AGUA_AT = V(157.5, 56, 43.2);
const JURA_HOLD = 25;
export class Agua extends QStep {
  constructor(ee) {
    super(ee, 'agua');
    const g = this.g;
    this.st = { on: 1, done: 0, sworn: 0, cur: -1 };
    this.alt = ALTARES.map((a, i) => {
      const m = new Marker(g, a.pos, a.col, 0.7);
      m.set(true);
      this.marks.push(m);
      const it = g.interact.add({
        kind: 'eclipse-altar',
        pos: a.pos.clone().add(V(0, 1, 0)),
        radius: 2,
        prompt: () => (this.st.done || this.st.sworn & (1 << i) || this.st.cur >= 0 ? null : { text: `jurar como ${a.name}`, noCost: true, hold: true }),
        cost: () => 0,
        holdTime: 2,
        use: () => {
          if (this.st.done || this.st.sworn & (1 << i) || this.st.cur >= 0) return false;
          this.send({ a: 'jura', i });
          return true;
        },
      });
      return { m, it, hold: new HoldZone(g, a.pos, 6, JURA_HOLD) };
    });
    this.fm = new Marker(g, FUENTE, 0x80d0ff, 1.1);
    this.marks.push(this.fm);
    this.pick = new Pickup(g, glowMate(0x80d0ff), AGUA_AT.clone(), { text: 'agarrar el Agua', radius: 2 });
    this.pick.onTake = () => this.send({ a: 'take', id: myId(g) });
    this.live.push(this.pick);
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'jura') {
      this.st.cur = m.i;
      this.alt[m.i].hold.k = 0;
      this.alt[m.i].m.pulse();
      g.hud.subtitle(`Juraste como ${ALTARES[m.i].name}. Aguantá al pie del altar.`, 4);
      this.ee.horde?.(JURA_HOLD);
    } else if (m.a === 'sworn') {
      this.st.sworn |= 1 << m.i;
      this.st.cur = -1;
      this.alt[m.i].m.set(false);
      g.fx.sparkle(ALTARES[m.i].pos.clone().add(V(0, 1.2, 0)), [1, 0.9, 0.6], 14, 0.6);
      g.audio?.purchase?.();
      if (this.st.sworn === 15) {
        this.fm.set(true);
        this.pick.show(true);
        g.hud.subtitle('Los cuatro juraron. La fuente se deshiela: el Agua.', 4);
      } else g.hud.subtitle('Un altar más jurado.', 2.5);
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.fm.set(false);
      this.ee.got('agua', m.id);
    }
  }

  refresh() {
    for (let i = 0; i < 4; i++) this.alt[i].m.set(!(this.st.sworn & (1 << i)));
    this.fm.set(this.st.sworn === 15 && !this.st.done);
    this.pick.show(this.st.sworn === 15 && !this.st.done);
  }

  update(dt, t) {
    super.update(dt, t);
    const i = this.st.cur;
    if (i < 0) return;
    const A = this.alt[i];
    const hit = A.hold.update(dt);
    if (A.hold.inside && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.g.hud.setHint?.(`La jura: ${Math.ceil((1 - A.hold.k) * JURA_HOLD)} s`);
    if (hit && this.host) this.send({ a: 'sworn', i });
  }
}

// ---------------- la Calabaza (centro) ----------------
// Lo que el Gil se guardó está en el fondo de la laguna. Tres marcas, una por
// vez, muestran dónde cavar; el Gil cava (mantener F) y en la tercera aparece
// la Calabaza, el Primer Mate vacío.
const CAVAS = [V(166.5, 28.3, 182.5), V(173.5, 28.3, 181.5), V(170.5, 28.3, 189.5)];
export class Calabaza extends QStep {
  constructor(ee) {
    super(ee, 'calabaza');
    const g = this.g;
    this.st = { on: 1, done: 0, dug: 0 };
    this.marks2 = CAVAS.map((p) => {
      const m = new Marker(g, p, 0xffd080, 0.6);
      this.marks.push(m);
      return m;
    });
    this.marks2[0].set(true);
    this.pick = new Pickup(g, glowMate(0xffd080), CAVAS[2].clone(), { text: 'agarrar la Calabaza' });
    this.pick.onTake = () => this.send({ a: 'take', id: myId(g) });
    this.live.push(this.pick);
    this.its = CAVAS.map((p, i) =>
      g.interact.add({
        kind: 'eclipse-cava',
        pos: p.clone().add(V(0, 0.6, 0)),
        radius: 1.8,
        prompt: () => (this.st.done || this.st.dug !== i ? null : this.ee.isGil() ? { text: 'cavar', noCost: true, hold: true } : { text: 'Solo el Gil sabe dónde', noCost: true, info: true }),
        cost: () => 0,
        holdTime: 3.5,
        use: () => {
          if (this.st.done || this.st.dug !== i || !this.ee.isGil()) return false;
          this.send({ a: 'dig', i });
          return true;
        },
      }),
    );
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'dig') {
      this.st.dug = m.i + 1;
      this.marks2[m.i].set(false);
      g.fx.sparkle(CAVAS[m.i].clone().add(V(0, 0.5, 0)), [0.8, 0.6, 0.3], 10, 0.6);
      if (this.st.dug < 3) {
        this.marks2[this.st.dug].set(true);
        g.hud.subtitle('Nada. Otra marca en el fondo de la laguna.', 3);
      } else {
        this.pick.show(true);
        g.hud.subtitle('La Calabaza: el Primer Mate, vacío.', 4);
      }
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.ee.got('calabaza', m.id);
    }
  }

  refresh() {
    for (let i = 0; i < 3; i++) this.marks2[i].set(i === this.st.dug && !this.st.done);
    this.pick.show(this.st.dug >= 3 && !this.st.done);
  }
}

// ---------------- el cañón de Obligado (torre) ----------------
// En la cima: cargar el cañón (mantener F) y dispararlo contra el eclipse. El
// cielo se cierra (totalidad) y, si todavía no pasó, llega el Desgarro Cósmico.
const CANON = V(280.5, 52, 62.5);
export class Canon extends QStep {
  constructor(ee) {
    super(ee, 'canon');
    const g = this.g;
    this.st = { on: 1, done: 0, loaded: 0 };
    this.mark = new Marker(g, CANON, 0xffe080, 0.8);
    this.mark.set(true);
    this.marks.push(this.mark);
    this.it = g.interact.add({
      kind: 'eclipse-canon',
      pos: CANON.clone().add(V(0, 1, 0)),
      radius: 2.4,
      prompt: () => (this.st.done ? null : !this.st.loaded ? { text: 'cargar el cañón', noCost: true, hold: true } : { text: 'disparar al eclipse', noCost: true }),
      cost: () => 0,
      holdTime: 3,
      use: () => {
        if (this.st.done) return false;
        this.send({ a: this.st.loaded ? 'fire' : 'load' });
        return true;
      },
    });
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'load') {
      this.st.loaded = 1;
      this.mark.pulse();
      g.hud.subtitle('Cargado. Apuntá al eclipse y disparalo.', 3);
    } else if (m.a === 'fire') {
      this.st.done = 1;
      this.mark.set(false);
      g.fx.addShake?.(0.5);
      g.fx.flash?.(CANON.clone().add(V(0, 1.5, 0)), [1, 0.85, 0.5], 6, 0.5, 30);
      g.audio?.explosion?.(CANON);
      // el cielo: a la totalidad, con el estallido
      g.world.eclipse?.set?.(1, 4);
      setTimeout(() => g.world.eclipse?.pulse?.(), 3800);
      g.hud.subtitle('El cañón de Obligado pega en el cielo. Se hace de noche cerrada.', 4);
      this.ee.got('canon', m.id ?? null);
      this.ee.onTotality();
    }
  }

  refresh() {
    this.mark.set(!this.st.done);
  }
}

// ---------------- el Sable (monumento) ----------------
// Prender la Llama Votiva (con la luz) abre un desgarro al Monumento de
// siempre: nuestros cuatro gauchos le alcanzan el Sable de San Martín al Gil.
// (La escena de los cuatro, en ui/; mientras no esté, el sable aparece en la Llama.)
// (la Llama Votiva: donde dice el config, en el Propileo)
const LLAMA = V(EE.llama?.[0] ?? 265.5, ZONES.mB?.y ?? 26.2, EE.llama?.[1] ?? 241.5);
export class SableGil extends QStep {
  constructor(ee) {
    super(ee, 'sable');
    const g = this.g;
    this.st = { on: 1, done: 0, lit: 0 };
    this.mark = new Marker(g, LLAMA, 0xffc060, 0.9);
    this.mark.set(true);
    this.marks.push(this.mark);
    this.pick = new Pickup(g, glowOrb(0xdfe8ff, 0.14), LLAMA.clone().add(V(0, 1.3, 0)), { text: 'recibir el Sable', radius: 2.4 });
    this.pick.onTake = () => (this.ee.isGil() ? this.send({ a: 'take', id: myId(g) }) : g.hud.subtitle('El Sable es para el Gil.', 2.5));
    this.live.push(this.pick);
    this.it = g.interact.add({
      kind: 'eclipse-llama',
      pos: LLAMA.clone().add(V(0, 1, 0)),
      radius: 2.4,
      prompt: () => (this.st.done || this.st.lit ? null : g.world.power ? { text: 'prender la Llama Votiva', noCost: true, hold: true } : { text: 'Necesita electricidad', noCost: true, info: true }),
      cost: () => 0,
      holdTime: 2,
      use: () => {
        if (this.st.done || this.st.lit || !g.world.power) return false;
        this.send({ a: 'lit' });
        return true;
      },
    });
    this.fireT = 0;
    // la llama del pebetero (world/eclipse/monumento.js) empieza apagada
    if (g.world.eclipseArt?.llamaFire) g.world.eclipseArt.llamaFire.visible = false;
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'lit') {
      this.st.lit = 1;
      if (g.world.eclipseArt?.llamaFire) g.world.eclipseArt.llamaFire.visible = true;
      this.mark.pulse();
      g.hud.subtitle('La Llama abre un desgarro. Del otro lado, cuatro gauchos conocidos.', 4.5);
      this.ee.scenes?.sable?.(() => this.pick.show(true)) || this.pick.show(true);
    } else if (m.a === 'take') {
      this.pick.take();
      this.st.done = 1;
      this.mark.set(false);
      this.ee.got('sable', m.id);
    }
  }

  refresh() {
    this.pick.show(this.st.lit === 1 && !this.st.done);
    this.mark.set(!this.st.done);
    if (this.g.world.eclipseArt?.llamaFire) this.g.world.eclipseArt.llamaFire.visible = this.st.lit === 1;
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.st.lit && !this.g.world.eclipseArt?.llamaFire && (this.fireT -= dt) <= 0) {
      this.fireT = 0.12;
      this.g.fx.fire?.(LLAMA.clone().add(V(0, 0.4, 0)), 0.5, 1);
    }
  }
}

export const STEPS = { brasa: Brasa, yerba: Yerba, bombilla: Bombilla, agua: Agua, calabaza: Calabaza, canon: Canon, sable: SableGil };
export const ANCHORS = { velas: VELAS, yerba: YERBA, celda: CELDA, altares: ALTARES, fuente: FUENTE, cavas: CAVAS, canon: CANON, llama: LLAMA, islands: ISLANDS };
