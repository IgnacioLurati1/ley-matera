import * as THREE from 'three';
import { ZONES } from '../../config/map';
import { SOMBRERO } from '../../config/maps/eclipse';
import { zombieHealth } from '../../config/rules';
import { isHost, myId, players, Pickup } from './common';
import { eclSfx } from '../../fx/eclipseSfx';
import { headProp } from '../../net/gauchoSkin';
import { buildChambergo, buildCinta, buildHebilla, buildFeather, buildCondor, buildCadenas, buildEstaca, buildPajonal, ESTACA_TOP } from './sombreroArt';

// El chambergo del matrero (2026-10-10): un sombrero para TODO el equipo. No
// se pierde al caer ni al volver, da 100 de vida de más (dos golpes) y se suma
// al Juggernog (Player.setHat). Cuatro pasos; los tres primeros, en cualquier
// orden (config/maps/eclipse: SOMBRERO):
//  1. La cinta — La Tapera: el pajonal que arde en el Corral, contra el galpón; con
//     seis muertos caídos ahí adentro, el último deja la cinta de cuero entre
//     las brasas.
//  2. La hebilla — el penal: la celda encadenada de los Calabozos. Se sacude
//     el candado y hay que aguantar 30 s adentro de los Calabozos mientras
//     salen muertos del piso (si no queda nadie adentro, se corta); las
//     cadenas ceden y la hebilla está en la celda.
//  3. La pluma — el Monumento: el cóndor que ronda arriba del Patio Cívico;
//     un tiro lo baja y la pluma cae planeando.
//  4. Con las tres: 100 muertos en la dimensión oscura (La Disformidad y los
//     jirones de las grietas: toda zona `dim` del config), con la cuenta a la
//     vista. Suena la confirmación (fx/eclipseSfx 'sombrero-listo') y el
//     chambergo aparece en la estaca del santuario del Gauchito, en La Loma
//     del Algarrobo: el que lo agarra se lo pone a todos.
// La estaca del santuario dice siempre qué falta y dónde. En los muñecos de
// los compañeros se ve puesto (net/gauchoSkin headProp); en primera persona no
// se dibuja nada. En línea decide el anfitrión ('pee' k 'somb').
// globalThis.__mduNoSombrero === true: no se arma nada.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = V(0, 1, 0);
// dónde va el chambergo en la malla del gaucho (cm): el eje de su sombrero de siempre
const HEAD = [-0.7, 180, 2.0];

const HINT = {
  ci: 'La cinta: matá en el pajonal que arde, La Tapera.',
  he: 'La hebilla: el candado de los Calabozos, el penal.',
  pl: 'La pluma: bajá al cóndor del Monumento.',
  dim: 'Matá 100 en La Disformidad.',
  hat: 'El chambergo te espera: santuario del Gauchito, La Loma.',
};
const NAME = { ci: 'La cinta', he: 'La hebilla', pl: 'La pluma' };

function rayHits(origin, dir, maxT, center, r) {
  const t = tmpV.subVectors(center, origin).dot(dir);
  if (t < 0 || t > maxT + r) return false;
  return tmpV2.copy(origin).addScaledVector(dir, t).distanceTo(center) < r;
}

export default class Sombrero {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    // ci: la cinta (0 arde, 1 cayó, 2 juntada); he: la hebilla (0 encadenada, 1
    // aguantando, 2 abierta, 3 juntada); pl: la pluma (0 el cóndor vuela, 1
    // cayó, 2 juntada); dim: los muertos de la Disformidad; hat: 0, 1 en la
    // estaca, 2 puesto
    this.st = { ci: 0, cn: 0, cx: 0, cz: 0, he: 0, pl: 0, px: 0, pz: 0, dim: 0, hat: 0 };
    this.on = globalThis.__mduNoSombrero !== true && !!SOMBRERO;
    this.t = 0;
    this.wt = 0;
    this.outT = 0;
    this.spawnT = 0;
    this.wearT = 0;
    this.fireT = 0;
    this.dimShow = 0;
    this.hudOn = false;
    this.loose = [];
    if (!this.on) return;
    this.build();
  }

  get host() {
    return isHost(this.g);
  }

  have3() {
    const s = this.st;
    return s.ci === 2 && s.he === 3 && s.pl === 2;
  }

  // qué falta ahora (lo dice la estaca del santuario y cada cosa al juntarla)
  hint() {
    const s = this.st;
    if (s.hat === 2) return null;
    if (s.hat === 1) return HINT.hat;
    if (s.ci < 2) return HINT.ci;
    if (s.he < 3) return HINT.he;
    if (s.pl < 2) return HINT.pl;
    return HINT.dim;
  }

  zoneOf(p) {
    return this.g.world.zoneAt?.(p.x, p.z, p.y) || null;
  }

  // ¿La dimensión oscura? La Disformidad y también los jirones de las grietas
  // (las zonas `dim` del config; Disformidad.isDim deja afuera los jirones
  // porque ahí no castiga, pero para las 100 del chambergo cuentan).
  isDark(p) {
    const k = this.zoneOf(p);
    return !!(k && ZONES[k]?.dim);
  }

  // ---------------- el armado (en la carga) ----------------
  build() {
    const g = this.g;
    const w = g.world;
    const C = SOMBRERO;
    this.root = new THREE.Group();
    this.root.name = 'eclipse:sombrero';
    g.scene.add(this.root);

    // 1. el pajonal que arde
    {
      const [x0, z0, x1, z1] = C.pajonal.rect;
      const y = w.floorAt((x0 + x1) / 2, (z0 + z1) / 2, 400);
      this.paj = buildPajonal(w, C.pajonal.rect, y);
      this.paj.y = y;
      this.paj.c = V((x0 + x1) / 2, y, (z0 + z1) / 2);
      this.paj.k = 1;
      this.root.add(this.paj.root);
      // el resplandor del fuego (una luz de evento: World.adoptLight; apagada no cuenta)
      this.paj.light = new THREE.PointLight(0xff6a20, 0, 14, 2);
      this.paj.light.position.set((x0 + x1) / 2, y + 1.3, (z0 + z1) / 2);
      g.scene.add(this.paj.light);
      w.adoptLight?.(this.paj.light, 1);
      this.pkCinta = new Pickup(g, buildCinta(), V(0, y, 0), { text: 'agarrar la cinta', col: 0xff5030 });
      this.pkCinta.it.use = () => this.take('ci');
    }

    // 2. la celda encadenada de los Calabozos
    {
      const [dx, dz] = C.celda.door;
      const y = w.floorAt(dx - 0.6, dz, 3);
      const K = buildCadenas(C.celda.w, 2.25);
      // (el vano corre a lo largo de z; el candado, del lado del pasillo)
      K.root.position.set(dx - 0.1, y, dz);
      K.root.rotation.y = -Math.PI / 2;
      this.root.add(K.root);
      this.cad = K;
      this.cadK = 0;
      this.cadPos = V(dx - 0.1, y + 1.2, dz);
      this.cadBox = w.addBox([dx - 0.14, y, dz - C.celda.w / 2, dx + 0.14, y + 2.6, dz + C.celda.w / 2], { kind: 'prop' });
      g.interact.add({
        kind: 'eclipse-somb-candado',
        pos: V(dx - 0.5, y + 1.2, dz),
        radius: 1.9,
        prompt: () => {
          const s = this.st;
          if (s.he === 0) return { text: 'sacudir el candado', noCost: true };
          if (s.he === 1) return { text: `Aguantá adentro: ${Math.max(0, Math.ceil(this.wt))} s`, noCost: true, info: true };
          return null;
        },
        cost: () => (this.st.he === 0 ? 0 : 1),
        use: () => {
          if (this.st.he !== 0) return false;
          this.ask({ a: 'shake' });
          return true;
        },
      });
      const [hx, hz] = C.celda.hebilla;
      this.pkHeb = new Pickup(g, buildHebilla(), V(hx, w.floorAt(hx, hz, 3), hz), { text: 'agarrar la hebilla', col: 0xffb060 });
      this.pkHeb.it.use = () => this.take('he');
    }

    // 3. el cóndor del Monumento
    {
      const [cx, cz] = C.condor.c;
      const y = w.floorAt(cx, cz, 400);
      this.bird = buildCondor();
      this.bird.c = V(cx, y + C.condor.h, cz);
      this.bird.pos = this.bird.root.position;
      this.bird.root.visible = false;
      this.bird.root.scale.setScalar(C.condor.s || 1);
      this.root.add(this.bird.root);
      this.birdCawT = 6;
      const f = new THREE.Group();
      const fe = buildFeather(0.6);
      fe.rotation.set(0.5, 0, 0.5);
      fe.position.y = -0.25;
      f.add(fe);
      this.pkPluma = new Pickup(g, f, V(cx, y, cz), { text: 'agarrar la pluma', col: 0xe8e4da });
      this.pkPluma.it.use = () => this.take('pl');
      // la pluma que cae planeando (después la reemplaza la de juntar)
      this.fall = { obj: new THREE.Group(), t: -1, from: V(), to: V(), sparkT: 0 };
      this.fall.obj.add(buildFeather(0.6));
      // (un brillo que la acompaña: negra contra el cielo de noche no se la veía caer)
      const fg = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot || null, color: 0xfff0d0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false }));
      fg.scale.setScalar(1.1);
      fg.position.y = 0.3;
      this.fall.obj.add(fg);
      this.fall.obj.visible = false;
      this.root.add(this.fall.obj);
    }

    // el final: la estaca del santuario del Gauchito
    {
      const [sx, sz] = C.santuario.pos;
      const y = w.floorAt(sx, sz, 400);
      const E = buildEstaca();
      E.position.set(sx, y, sz);
      E.rotation.y = C.santuario.rot || 0;
      this.root.add(E);
      const hat = buildChambergo();
      hat.scale.setScalar(0.01);
      hat.position.set(0, ESTACA_TOP - 0.11, 0);
      hat.rotation.set(0.1, 0.5, -0.12);
      hat.visible = false;
      E.add(hat);
      this.stake = { root: E, hat, pos: V(sx, y + ESTACA_TOP, sz) };
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot || null, color: 0xffd28a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
      glow.scale.setScalar(0.9);
      glow.position.set(0, ESTACA_TOP, 0);
      glow.visible = false;
      E.add(glow);
      this.stake.glow = glow;
      w.addBox([sx - 0.08, y, sz - 0.08, sx + 0.08, y + 1.3, sz + 0.08], { kind: 'prop' });
      g.interact.add({
        kind: 'eclipse-somb-estaca',
        pos: V(sx, y + 1.1, sz),
        radius: 2.2,
        prompt: () => {
          const s = this.st;
          if (s.hat === 2) return null;
          if (s.hat === 1) return { text: 'agarrar el chambergo del matrero', noCost: true };
          return { text: `El chambergo del matrero. ${this.hint()}`, noCost: true, info: true };
        },
        cost: () => (this.st.hat === 1 ? 0 : 1),
        use: () => {
          if (this.st.hat !== 1) return false;
          this.ask({ a: 'wear' });
          return true;
        },
      });
    }
    this.refresh(true);
  }

  // La F sobre una de las tres cosas. Mira el estado, no lo que se ve acá: la
  // F de un invitado la resuelve el anfitrión, y su pluma puede estar todavía
  // cayendo en su pantalla cuando en la del invitado ya está en el piso.
  take(w) {
    const s = this.st;
    if (!((w === 'ci' && s.ci === 1) || (w === 'he' && s.he === 2) || (w === 'pl' && s.pl === 1))) return false;
    this.ask({ a: 'take', w });
    return true;
  }

  // ---------------- la red ----------------
  // (anfitrión) lo decide y avisa
  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'somb', ...m });
  }

  // Pedido al anfitrión (o a uno mismo, solo). La F de un invitado sobre algo
  // del mapa ya llega acá en el anfitrión (net/Session applyRemoteUse: useFrom
  // dice quién fue); el tiro al cóndor es de cada compu y viaja por 'pee'.
  ask(m) {
    const g = this.g;
    if (this.host) this.onGuest(m, g.net?.useFrom ?? myId(g));
    else g.net?.net?.send({ t: 'pee', k: 'somb', ...m, from: myId(g) });
  }

  onGuest(m, from) {
    if (!this.on || !this.host) return;
    const s = this.st;
    if (m.a === 'take') {
      if (m.w === 'ci' && s.ci === 1) this.send({ a: 'got', w: 'ci', id: from });
      else if (m.w === 'he' && s.he === 2) this.send({ a: 'got', w: 'he', id: from });
      else if (m.w === 'pl' && s.pl === 1) this.send({ a: 'got', w: 'pl', id: from });
    } else if (m.a === 'shake') {
      if (s.he === 0) this.send({ a: 'wave' });
    } else if (m.a === 'hit') {
      if (s.pl !== 0) return;
      const [fx, fz] = this.landing(+m.x || 0, +m.z || 0);
      this.send({ a: 'bird', x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, fx, fz });
    } else if (m.a === 'wear') {
      if (s.hat === 1) this.send({ a: 'worn', id: from });
    }
  }

  apply(m) {
    if (!this.on) return;
    const g = this.g;
    const s = this.st;
    const near = (p, d) => Math.hypot(g.player.pos.x - p.x, g.player.pos.z - p.z) < d;
    if (m.a === 'pk') {
      s.cn = m.n;
      tmpV.set(m.x, this.paj.y + 0.2, m.z);
      for (let i = 0; i < 5; i++) g.fx.fire(tmpV, 0.9, 3);
      g.fx.sparks(tmpV, 2, UP, [1, 0.5, 0.15]);
    } else if (m.a === 'cinta') {
      s.ci = 1;
      s.cn = SOMBRERO.pajonal.need;
      s.cx = m.x;
      s.cz = m.z;
      this.dropCinta(false);
      if (near(this.paj.c, 40)) g.hud.subtitle('Algo quedó entre las brasas.', 3);
    } else if (m.a === 'got') {
      if (m.w === 'ci') {
        s.ci = 2;
        this.pkCinta.take();
      } else if (m.w === 'he') {
        s.he = 3;
        this.pkHeb.take();
      } else if (m.w === 'pl') {
        s.pl = 2;
        this.pkPluma.take();
      }
      g.audio.powerupGrab?.();
      const n = (s.ci === 2) + (s.he === 3) + (s.pl === 2);
      g.hud.toast(`${NAME[m.w]} del chambergo: ${n} de 3`);
      // (la confirmación de los 100, bajada con tiempo: suena en el momento)
      if (n === 3) eclSfx(g).load(['sombrero-listo']);
      const h = this.hint();
      if (h) g.later ? g.later(1.6, () => g.hud.subtitle(h, 4.5)) : g.hud.subtitle(h, 4.5);
    } else if (m.a === 'wave') {
      s.he = 1;
      this.wt = SOMBRERO.celda.secs;
      this.outT = 0;
      this.spawnT = 0.6;
      g.audio.chain?.(this.cadPos);
      this.cadShake = 0.6;
      if (near(this.cadPos, 40)) g.hud.subtitle('Aguantá adentro de los Calabozos.', 3.5);
    } else if (m.a === 'fail') {
      s.he = 0;
      this.wt = 0;
      if (near(this.cadPos, 60)) g.hud.subtitle('Saliste. El candado sigue cerrado.', 3);
    } else if (m.a === 'open') {
      s.he = 2;
      this.wt = 0;
      this.openCell(false);
      if (near(this.cadPos, 60)) g.hud.subtitle('Las cadenas ceden.', 3);
    } else if (m.a === 'bird') {
      s.pl = 1;
      s.px = m.fx;
      s.pz = m.fz;
      this.shootBird(V(m.x, m.y, m.z));
    } else if (m.a === 'dim') {
      s.dim = m.n;
      this.dimShow = 4;
      if (m.n % 25 === 0 && m.n < SOMBRERO.dim.need) g.hud.toast(`Chambergo: ${m.n} / ${SOMBRERO.dim.need}`);
    } else if (m.a === 'ready') {
      s.hat = 1;
      s.dim = SOMBRERO.dim.need;
      eclSfx(g).play('sombrero-listo', { gain: 1, reverb: 0.1 });
      g.hud.subtitle(HINT.hat, 6);
      this.refresh();
      g.fx.sparkle(this.stake.pos, [1, 0.85, 0.5], 20, 0.8);
    } else if (m.a === 'worn') {
      s.hat = 2;
      this.refresh();
      g.fx.flash(this.stake.pos, 0xffd28a, 26, 0.5, 12);
      g.fx.sparkle(this.stake.pos, [1, 0.85, 0.5], 26, 1);
      g.audio.sting?.();
      g.hud.achievement('El chambergo del matrero', 'Dos golpes más de aguante, para todos');
    }
  }

  state() {
    return this.on ? { sb: { ...this.st, wt: +this.wt.toFixed(1) } } : {};
  }

  applyFull(sb) {
    if (!this.on || !sb) return;
    for (const k of Object.keys(this.st)) if (sb[k] !== undefined) this.st[k] = sb[k];
    this.wt = sb.wt || 0;
    if (this.have3() && this.st.hat === 0) eclSfx(this.g).load(['sombrero-listo']);
    this.refresh(true);
  }

  // Lo que se ve, según el estado (también al entrar tarde: sin animaciones).
  refresh(quiet = false) {
    const g = this.g;
    const s = this.st;
    if (s.ci === 1) this.dropCinta(true);
    else this.pkCinta.show(false);
    if (quiet) this.paj.k = s.ci === 0 ? 1 : 0;
    if (s.ci === 2) this.pkCinta.taken = true;
    if (s.he >= 2) this.openCell(quiet);
    this.pkHeb.show(s.he === 2);
    if (s.he === 3) this.pkHeb.taken = true;
    if (s.pl === 1 && this.fall.t < 0) this.landFeather();
    if (s.pl !== 1) this.pkPluma.show(false);
    if (s.pl === 2) this.pkPluma.taken = true;
    this.stake.hat.visible = s.hat === 1;
    this.stake.glow.visible = s.hat === 1;
    g.player?.setHat?.(s.hat === 2 ? SOMBRERO.hp : 0);
    if (s.hat === 2) this.wearT = 0;
  }

  // ---------------- 1. el pajonal ----------------
  inPajonal(p, pad = 0.9) {
    const [x0, z0, x1, z1] = SOMBRERO.pajonal.rect;
    return p.x > x0 - pad && p.x < x1 + pad && p.z > z0 - pad && p.z < z1 + pad && Math.abs((p.y || 0) - this.paj.y) < 3;
  }

  dropCinta(quiet) {
    const g = this.g;
    const s = this.st;
    const P = this.pkCinta;
    P.base.set(s.cx, this.paj.y, s.cz);
    P.it.pos.set(s.cx, this.paj.y + 0.6, s.cz);
    P.light.position.set(s.cx, this.paj.y + 0.6, s.cz);
    P.obj.position.copy(P.base);
    P.show(true);
    if (!quiet) {
      tmpV.set(s.cx, this.paj.y + 0.4, s.cz);
      g.fx.flash(tmpV, 0xff5030, 20, 0.5, 10);
      g.fx.sparkle(tmpV, [1, 0.4, 0.2], 16, 0.8);
    }
  }

  // ---------------- 2. la celda ----------------
  openCell(quiet) {
    if (this.cadBox && this.cadBox.active !== false) {
      this.cadBox.active = false;
      // (el vano vuelve a ser paso para los muertos: si no, adentro de la celda no entraba ninguno)
      this.g.world.computeNavBlock?.();
    }
    if (quiet) this.cadK = 1;
    else if (this.cadK === 0) {
      this.cadK = 0.001;
      const g = this.g;
      g.audio.chain?.(this.cadPos);
      g.audio.door?.(this.cadPos, false);
      g.fx.sparks(this.cadPos, 3, UP);
    }
    this.pkHeb.show(this.st.he === 2);
  }

  // (anfitrión) un muerto que sale del piso del pasillo, lejos de los de adentro
  spawnWave() {
    const g = this.g;
    const C = SOMBRERO.celda;
    if (g.zombies.alive >= 22) return;
    const ps = players(g).filter((p) => !p.downed && this.zoneOf(p.pos) === C.zone);
    const far = C.spawns
      .map(([x, z]) => ({ x, z, d: ps.reduce((a, p) => Math.min(a, Math.hypot(p.pos.x - x, p.pos.z - z)), 99) }))
      .sort((a, b) => b.d - a.d);
    const sp = far[Math.random() < 0.65 ? 0 : 1] || far[0];
    if (!sp) return;
    const y = g.world.floorAt(sp.x, sp.z, 3);
    const round = Math.max(1, g.rounds?.round || 1);
    g.zombies.spawn(round, zombieHealth(round), V(sp.x + (Math.random() - 0.5) * 0.8, y, sp.z + (Math.random() - 0.5) * 1.6));
  }

  // ---------------- 3. el cóndor ----------------
  // dónde cae la pluma: debajo del cóndor si ahí hay piso del patio; si no, hacia el medio
  landing(x, z) {
    const g = this.g;
    const C = SOMBRERO.condor;
    const y0 = this.bird.c.y - C.h;
    for (const k of [1, 0.75, 0.5, 0.25, 0]) {
      const px = C.c[0] + (x - C.c[0]) * k;
      const pz = C.c[1] + (z - C.c[1]) * k;
      const fy = g.world.floorAt(px, pz, y0 + 3);
      const free = !(g.world.cellBoxes?.[g.world.idx(Math.floor(px), Math.floor(pz))] || []).some((b) => b.kind !== 'ground' && b.active !== false && b.y1 > fy + 0.1 && b.y0 < fy + 2);
      if (g.world.zoneAt?.(px, pz, fy) === C.zone && free) return [+px.toFixed(2), +pz.toFixed(2)];
    }
    return [C.c[0], C.c[1]];
  }

  shootBird(at) {
    const g = this.g;
    this.bird.root.visible = false;
    g.fx.sparkle(at, [0.9, 0.88, 0.8], 14, 1.2);
    g.audio.bigCaw?.(at, 1);
    g.audio.featherFwip?.(at);
    // plumas sueltas que se abren y caen
    for (let i = 0; i < 7; i++) {
      const o = buildFeather(0.3 + Math.random() * 0.15);
      o.position.copy(at);
      o.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.root.add(o);
      this.loose.push({ o, v: V((Math.random() - 0.5) * 5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 5), t: 0, w: V(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2) });
    }
    // la que sirve: baja planeando hasta el patio
    const s = this.st;
    const fy = g.world.floorAt(s.px, s.pz, at.y);
    this.fall.from.copy(at);
    this.fall.to.set(s.px, fy + 0.9, s.pz);
    this.fall.t = 0;
    this.fall.obj.visible = true;
    this.pkPluma.show(false);
  }

  // la pluma ya en el piso (lista para juntar)
  landFeather() {
    const g = this.g;
    const s = this.st;
    const P = this.pkPluma;
    const fy = g.world.floorAt(s.px, s.pz, this.bird.c.y);
    P.base.set(s.px, fy, s.pz);
    P.it.pos.set(s.px, fy + 0.6, s.pz);
    P.light.position.set(s.px, fy + 0.6, s.pz);
    P.obj.position.copy(P.base);
    this.fall.t = -1;
    this.fall.obj.visible = false;
    P.show(s.pl === 1);
  }

  // ---------------- los muertos ----------------
  onKill(z) {
    if (!this.on || !this.host || !z?.pos || z.boss || z.jinete) return;
    const s = this.st;
    if (s.ci === 0 && this.inPajonal(z.pos)) {
      const n = s.cn + 1;
      const [x0, z0, x1, z1] = SOMBRERO.pajonal.rect;
      const x = +Math.max(x0 + 0.4, Math.min(x1 - 0.4, z.pos.x)).toFixed(2);
      const zz = +Math.max(z0 + 0.4, Math.min(z1 - 0.4, z.pos.z)).toFixed(2);
      if (n >= SOMBRERO.pajonal.need) this.send({ a: 'cinta', x, z: zz });
      else this.send({ a: 'pk', n, x, z: zz });
    }
    if (s.hat === 0 && this.have3() && this.isDark(z.pos)) {
      const n = s.dim + 1;
      this.send({ a: 'dim', n });
      if (n >= SOMBRERO.dim.need) this.send({ a: 'ready' });
    }
  }

  // los tiros de esta compu: ¿le pegó al cóndor?
  onShot(origin, dir, maxT) {
    if (!this.on || this.st.pl !== 0 || !this.bird.root.visible) return;
    const p = this.bird.pos;
    if (!rayHits(origin, dir, maxT, p, 1.15 * (SOMBRERO.condor.s || 1))) return;
    this.ask({ a: 'hit', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    const s = this.st;
    const P = g.player;
    this.t += dt;
    const t = this.t;
    const cam = g.camera.position;

    // el pajonal: llamas, humo y su resplandor mientras arde y hay alguien
    // cerca; con la cinta caída se consume (quedan las matas quemadas y brasas)
    const pd = Math.hypot(cam.x - this.paj.c.x, cam.z - this.paj.c.z);
    const PJ = this.paj;
    const want = s.ci === 0 ? 1 : 0;
    PJ.k += (want - PJ.k) * Math.min(1, dt * (want ? 4 : 0.9));
    const burn = 0.16 + PJ.k * 0.84;
    PJ.root.visible = pd < 140;
    PJ.light.intensity = 0;
    if (PJ.root.visible) {
      const fl = 0.75 + 0.25 * Math.sin(t * 9.3) * Math.sin(t * 5.1 + 1.3);
      PJ.glow.material.opacity = 0.62 * burn * fl;
      PJ.mat.emissiveIntensity = 0.2 * burn * (0.7 + 0.3 * fl);
      PJ.mat.color.setRGB(0.16 + 0.62 * PJ.k, 0.13 + 0.51 * PJ.k, 0.1 + 0.31 * PJ.k);
      // (se achican desde el piso: la malla escala desde el cero del mundo)
      PJ.im.scale.y = 0.3 + 0.7 * PJ.k;
      PJ.im.position.y = (PJ.y - 0.05) * (1 - PJ.im.scale.y);
      PJ.emberMat.color.setRGB(0.6 + 0.4 * fl, 0.42 * fl, 0.08);
      if (pd < 60) PJ.light.intensity = (10 + 6 * fl) * burn;
      if (pd < 50 && g.fx?.add) {
        // (las llamas salen de las matas, de la mitad para arriba; el humo, de las puntas)
        this.fireT += dt * (pd < 25 ? 150 : 70) * (0.05 + PJ.k * 0.95);
        const R = Math.random;
        const hk = PJ.im.scale.y;
        while (this.fireT >= 1) {
          this.fireT -= 1;
          const sp = PJ.spots[Math.floor(R() * PJ.spots.length)];
          const fy = PJ.y + sp[2] * hk * (0.35 + R() * 0.65);
          g.fx.add.spawn(sp[0] + (R() - 0.5) * 0.4, fy, sp[1] + (R() - 0.5) * 0.4, (R() - 0.5) * 0.35, 1.2 + R() * 1.6, (R() - 0.5) * 0.35, { color: [1, 0.22 + R() * 0.22, 0.03], size: 0.42 + R() * 0.38, size1: 0.06, life: 0.45 + R() * 0.5, drag: 0.3 });
          if (R() < 0.08) g.fx.add.spawn(sp[0], fy + 0.3, sp[1], R() - 0.5, 2 + R() * 2.5, R() - 0.5, { color: [1, 0.6, 0.2], size: 0.04, life: 1.3, gravity: 0.8 });
          if (R() < 0.1) g.fx.alpha.spawn(sp[0], PJ.y + sp[2] * hk + 0.3, sp[1], (R() - 0.5) * 0.4, 1 + R() * 0.8, (R() - 0.5) * 0.4, { color: [0.2, 0.12, 0.08], size: 0.35, size1: 1.5, life: 2.2 + R() * 1.4, alpha: 0.22, drag: 0.45 });
        }
      }
    }
    this.pkCinta.update(dt, t);

    // la celda: las cadenas tiemblan con el candado y se caen al abrirse
    if (this.cadShake > 0) {
      this.cadShake -= dt;
      this.cad.root.rotation.x = Math.sin(t * 60) * 0.03 * Math.max(0, this.cadShake);
    } else this.cad.root.rotation.x = 0;
    if (this.cadK > 0 && this.cadK < 1) this.cadK = Math.min(1, this.cadK + dt * 1.8);
    if (this.cadK > 0) {
      // (se desploman: quedan en un montón en el umbral)
      const k = this.cadK * this.cadK;
      this.cad.chain.scale.y = 1 - k * 0.965;
      this.cad.lock.position.y = (2.25 * 0.5 + 0.06) * (1 - k) + 0.09 * k;
      this.cad.lock.rotation.x = k * 1.4;
    }
    if (s.he === 1) {
      this.wt = Math.max(0, this.wt - dt);
      if (this.host) {
        const C = SOMBRERO.celda;
        const inside = players(g).filter((p) => !p.downed && this.zoneOf(p.pos) === C.zone).length;
        this.outT = inside ? 0 : this.outT + dt;
        this.spawnT -= dt;
        if (this.spawnT <= 0 && inside) {
          this.spawnT = 1.7 / Math.sqrt(Math.max(1, inside));
          this.spawnWave();
        }
        if (this.outT > 3) this.send({ a: 'fail' });
        else if (this.wt <= 0) this.send({ a: 'open' });
      }
    }
    this.pkHeb.update(dt, t);

    // el cóndor: ronda planeando, con unos aletazos cada tanto
    const B = this.bird;
    const bd = Math.hypot(cam.x - B.c.x, cam.z - B.c.z);
    const fly = s.pl === 0 && bd < 170;
    B.root.visible = fly;
    if (fly) {
      const C = SOMBRERO.condor;
      const a = t * 0.5;
      B.pos.set(B.c.x + Math.sin(a) * C.r, B.c.y + Math.sin(t * 0.37) * 1.1, B.c.z + Math.cos(a) * C.r);
      B.root.rotation.set(0, a + Math.PI / 2, -0.22, 'YXZ');
      const burst = (t % 9) < 2.2;
      B.flap(burst ? Math.sin(t * 6.5) * 0.9 : 0.22 + Math.sin(t * 0.9) * 0.08);
      this.birdCawT -= dt;
      if (this.birdCawT <= 0 && bd < 60) {
        this.birdCawT = 14 + Math.random() * 10;
        g.audio.bigCaw?.(B.pos, 1);
      }
    }
    if (this.fall.t >= 0) {
      const F = this.fall;
      F.t += dt;
      const k = Math.min(1, F.t / 4.2);
      const e = k * k * (3 - 2 * k);
      F.obj.position.lerpVectors(F.from, F.to, e);
      F.obj.position.x += Math.sin(F.t * 2.3) * 0.9 * (1 - k);
      F.obj.position.z += Math.cos(F.t * 1.7) * 0.7 * (1 - k);
      F.obj.rotation.set(1.2 + Math.sin(F.t * 2.3) * 0.5, F.t * 1.4, Math.sin(F.t * 1.9) * 0.6);
      F.sparkT -= dt;
      if (F.sparkT <= 0) {
        F.sparkT = 0.12;
        g.fx.sparkle(F.obj.position, [1, 0.95, 0.8], 1, 0.25);
      }
      if (k >= 1) this.landFeather();
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const L = this.loose[i];
      L.t += dt;
      L.v.y -= dt * 2.2;
      L.v.multiplyScalar(1 - Math.min(1, dt * 1.2));
      L.o.position.addScaledVector(L.v, dt);
      L.o.rotation.x += L.w.x * dt;
      L.o.rotation.y += L.w.y * dt;
      L.o.rotation.z += L.w.z * dt;
      if (L.t > 2.6) {
        L.o.removeFromParent();
        this.loose.splice(i, 1);
      }
    }
    this.pkPluma.update(dt, t);

    // la estaca: el chambergo listo brilla
    if (s.hat === 1) {
      this.stake.glow.material.opacity = 0.2 + Math.sin(t * 2.6) * 0.07;
      if (Math.random() < dt * 3) g.fx.sparkle(this.stake.pos, [1, 0.85, 0.5], 1, 0.4);
    }

    // puesto: en la cabeza de los muñecos de los compañeros (cuando su modelo ya bajó)
    if (s.hat === 2) {
      this.wearT -= dt;
      if (this.wearT <= 0) {
        this.wearT = 1;
        this.wearAll();
      }
    }

    // la cuenta a la vista
    this.dimShow = Math.max(0, this.dimShow - dt);
    let hud = null;
    if (P && g.state === 'playing') {
      if (s.he === 1 && this.zoneOf(P.pos) === SOMBRERO.celda.zone) hud = `<span>Calabozos</span><b>${Math.ceil(this.wt)} s</b>`;
      else if (s.hat === 0 && this.have3() && (this.dimShow > 0 || this.isDark(P.pos))) hud = `<span>Chambergo</span><b>${s.dim} / ${SOMBRERO.dim.need}</b>`;
      else if (s.ci === 0 && s.cn > 0 && this.inPajonal(P.pos, 4)) hud = `<span>Pajonal</span><b>${s.cn} / ${SOMBRERO.pajonal.need}</b>`;
    }
    if (hud || this.hudOn) g.hud.setCraftText?.(hud);
    this.hudOn = !!hud;
  }

  wearAll() {
    const list = this.g.net?.avatars?.list;
    if (!list) return;
    for (const a of list.values()) this.wear(a);
  }

  // El chambergo en la cabeza de un muñeco (net/Avatars); null si su modelo todavía no bajó.
  wear(a) {
    if (!a || a.chambergo) return a?.chambergo || null;
    if (!a.gs?.on) return null;
    const hat = buildChambergo();
    hat.position.set(HEAD[0], HEAD[1], HEAD[2]);
    a.chambergo = headProp(a, hat);
    return a.chambergo;
  }

  dispose() {
    if (!this.on) return;
    this.root.removeFromParent();
    this.paj.light.removeFromParent();
    this.pkCinta.dispose();
    this.pkHeb.dispose();
    this.pkPluma.dispose();
    if (this.hudOn) this.g.hud?.setCraftText?.(null);
    const list = this.g.net?.avatars?.list;
    if (list) for (const a of list.values()) if (a.chambergo) {
      a.chambergo.removeFromParent();
      a.chambergo = null;
    }
  }
}
