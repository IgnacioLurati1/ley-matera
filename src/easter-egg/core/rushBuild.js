// El armado del rush de jefes: lo que hacen en la pelea las cartas nuevas
// (core/rushCards.js: MEJORAS, RAROS, HABILIDADES). El usuario, 2026-10-12:
// "crear nuevos tipos de cards, como por ejemplo tankear 1 hit mas, mas daño
// por bala, etc. [...] Capaz hasta meter habilidades o algo asi".
//
// Cada uno lleva el suyo en su compu (g.rush.build) y se arma al empezar cada
// jefe (bossRush.loadout → set). Los ganchos, de una línea, en lo de siempre:
// - el daño (Zombies.damage → hit): solo lo que pega el jugador de esta compu.
//   El invitado lo multiplica antes de mandarle el tiro al anfitrión (Session
//   reportHit), así los números son los mismos en cualquier lado. Al duende
//   del castillo, GranGuerra.hitGnome → gnomo.
// - las bajas (Zombies.kill → alMorir): las propias se cobran acá; las de un
//   invitado, el anfitrión se las avisa ('rush' 'baja') y las cobra él.
// - la vida (Player.damage → blocks): cada uno recibe sus golpes en su compu.
// - recarga, cadencia, retroceso, correr, curarse y bombas: Player.reloadMult,
//   Weapons.fire, Player.update, Weapons.maxAmmo.
// - la habilidad (tecla 'habilidad', core/controls.js): la usa cada uno y los
//   demás ven el efecto ('rush' 'fx'). El Rebencazo y el Viento Zonda empujan
//   muertos: eso lo hace el anfitrión (los muertos son de él).
//
// globalThis.__mduRushViejo = true: sin nada de esto (core/rushCards.js no las reparte).
import * as THREE from 'three';
import { MEJORAS, RAROS, HABILIDADES, HAB_CD_MIN, TOPE, sumaMej } from './rushCards';
import { keyLabel } from './controls';
import { PLAYER } from '../config/rules';
import { RUSH_ICONS } from '../ui/rushIcons';
// (las dos prismáticas que se usan con su tecla: el Heredero del caos y el Resurgir del mate)
import RushPrisma from './rushPrisma';

// ---- los números (para ajustar; los de cada carta están en core/rushCards.js) ----
// Cuero de vaca: cada cuánto vuelve un golpe aguantado (de a uno)
const CUERO_CD = 30;
// Siete vidas: intocable después de salvarte
const GATO_GUARD = 2;
// el Pique: intocable mientras dura (y un poco más)
const PIQUE_GUARD = 0.35;
// la Cañita voladora: radio, daño (lo que tenía el muerto que explotó; a un
// jefe, como mucho BOOM_JEFE) y no más de una cada BOOM_GAP s (que no se encadenen sin fin)
const BOOM_R = 3.6;
const BOOM_K = 0.8;
const BOOM_MIN = 400;
const BOOM_JEFE = 1500;
const BOOM_GAP = 0.25;
// el Rebencazo (y el Viento Zonda): el daño a cada muerto (parte de su vida) y a un jefe
const REB_K = 0.45;
const REB_MIN = 150;
const REB_JEFE = 1500;
// cuánto tarda el empujón en recorrer su distancia
const REB_T = 0.3;
// la Humareda: cuánto queda la nube
const HUMO_T = 6.5;

// los tipos de daño que no se tocan (la bomba atómica, el Juicio, quemarse, las trampas)
const NO_MULT = new Set(['nuke', 'juicio', 'burn', 'vida', 'trapfire']);
const SND_DIR = '/assets/sotano/sfx/rush/';
// tomas de ElevenLabs (sound-generation, 2026-10-12; scratchpad opt/jefes/snd: gen.py, proc.py)
const SONIDOS = ['pique', 'rebencazo', 'humareda', 'paye', 'cuero', 'heredero', 'resurgir'];

const off = () => globalThis.__mduRushViejo === true;
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default class RushBuild {
  constructor(g) {
    this.g = g;
    this.el = null;
    this.prisma = new RushPrisma(this);
    this.reset();
  }

  // Todo neutro (fuera del rush, o al salir).
  reset() {
    this.on = false;
    this.v = {};
    this.raros = new Set();
    this.hab = null;
    this.cd = 0;
    this.readyAt = 0;
    this.cueroMax = 0;
    this.cuero = 0;
    this.cueroAt = 0;
    this.gatoUsed = false;
    this.payeT = 0;
    this.guardT = 0;
    this.kills = 0;
    this.boomAt = -9;
    this.dash = null;
    this.shoves = [];
    this.fxs = [];
    this.wasReady = true;
    this.prisma.reset();
    this.hudSync(true);
  }

  // (bossRush.loadout, al empezar cada jefe) Lo del mazo, con todo cargado.
  set(D) {
    const g = this.g;
    this.reset();
    if (off() || !D) return;
    this.on = true;
    const sum = (id) => Math.min(sumaMej(D, id), TOPE[id] ?? Infinity);
    for (const id of Object.keys(MEJORAS)) this.v[id] = sum(id);
    for (const x of D.mej || []) if (RAROS[x.id]) this.raros.add(x.id);
    this.prisma.set(D, this.raros);
    this.hab = HABILIDADES[D.hab] ? D.hab : null;
    if (this.hab) this.cd = HABILIDADES[this.hab].cd * Math.max(HAB_CD_MIN, 1 - (D.habUp || 0));
    this.readyAt = g.time;
    this.cueroMax = this.v.cuero | 0;
    this.cuero = this.cueroMax;
    // el Pacto con el Mandinga: la mitad de la vida (por el chambergo: Player
    // lo mantiene en el Juggernog, al caer y al volver)
    const P = g.player;
    if (this.raros.has('pacto')) P.setHat((P.hatHp || 0) - Math.round(P.maxHealth * RAROS.pacto.vida));
    this.loadSounds();
    this.hudSync(true);
  }

  // ---------------- los ganchos ----------------
  get reload() {
    return this.on ? Math.max(0.4, 1 - (this.v.cebador || 0)) : 1;
  }
  get rate() {
    return this.on ? 1 + (this.v.dedo || 0) : 1;
  }
  get recoil() {
    return this.on ? Math.max(0.2, 1 - (this.v.pulso || 0)) : 1;
  }
  get speed() {
    return this.on ? 1 + (this.v.alpargata || 0) : 1;
  }
  get regen() {
    return this.on ? 1 + (this.v.cocido || 0) : 1;
  }
  get granadas() {
    return this.on ? this.v.bolsa | 0 : 0;
  }

  // ¿Este golpe es del jugador de esta compu?
  mine(info) {
    return info.by == null || info.by === this.g.net?.id;
  }

  // (Zombies.damage) El daño de un golpe propio, con lo apilado.
  hit(z, amount, info) {
    if (!this.on || !this.mine(info)) return amount;
    const type = info.type || 'bullet';
    if (NO_MULT.has(type)) return amount;
    let k = 1 + (this.v.polvora || 0);
    if (info.zone === 'head') k += this.v.bocho || 0;
    if (z?.boss) k += this.v.domador || 0;
    if (type === 'knife') k += this.v.afilar || 0;
    k *= this.rare(type);
    return amount * k;
  }

  // (GranGuerra.hitGnome) El duende del castillo no es un muerto: lo mismo, como jefe.
  gnomo(n) {
    if (!this.on) return n;
    return n * (1 + (this.v.polvora || 0) + (this.v.domador || 0)) * this.rare('bullet');
  }

  // Lo de las prismáticas que pega más.
  rare(type) {
    const g = this.g;
    let k = 1;
    if (this.raros.has('pacto')) k *= 1 + RAROS.pacto.dmg;
    if (this.raros.has('sangre')) {
      const P = g.player;
      k *= 1 + RAROS.sangre.max * clamp01(1 - P.health / (P.maxHealth || 1));
    }
    // (la última del cargador: Weapons.fire ya la descontó)
    const s = g.weapons?.slot;
    if (this.raros.has('ultima') && (type === 'bullet' || type === 'gut') && s && !s.temp && s.mag === 0) k *= RAROS.ultima.k;
    return k;
  }

  // (Player.damage, antes de restar) true: el golpe no te toca.
  blocks(amount, from, explosion) {
    if (!this.on) return false;
    const g = this.g;
    const P = g.player;
    if (this.payeT > g.time || this.guardT > g.time) {
      g.fx.sparkle(tmpV.set(P.pos.x, P.pos.y + 1.2, P.pos.z), [1, 0.85, 0.3], 4, 0.8);
      return true;
    }
    if (this.cuero > 0 && amount > 0) {
      this.cuero--;
      if (this.cueroAt <= g.time) this.cueroAt = g.time + CUERO_CD;
      this.sound('cuero', 0.9);
      this.flash('is-cuero');
      g.fx.addShake(explosion ? 0.3 : 0.15);
      this.hudSync(true);
      return true;
    }
    // Siete vidas: el golpe que te tumbaba te deja con 1
    if (this.raros.has('gato') && !this.gatoUsed && amount >= P.health) {
      this.gatoUsed = true;
      P.health = 1;
      P.lastHit = g.time;
      this.guardT = g.time + GATO_GUARD;
      this.sound('paye', 0.8, 0.8);
      this.flash('is-gato');
      return true;
    }
    return false;
  }

  // (Zombies.kill, cualquier muerte) Las bajas propias se cobran; las de un
  // invitado, el anfitrión se las avisa.
  alMorir(z, info, type) {
    const g = this.g;
    if (!g.rush?.on || off() || type === 'nuke' || type === 'juicio') return;
    const p = z.pos;
    const y = (z.baseY ?? p.y) || 0;
    if (this.mine(info)) {
      this.onKill(p.x, y, p.z, z.maxHp || 0, !!z.boss);
      return;
    }
    if (g.net?.host && info.by != null) g.net.net?.to?.(info.by, { t: 'ev', e: 'rush', a: 'baja', x: +p.x.toFixed(2), y: +y.toFixed(2), z: +p.z.toFixed(2), m: Math.round(z.maxHp || 0), b: z.boss ? 1 : 0 });
  }

  // (invitado) El anfitrión avisa una baja suya.
  onBaja(m) {
    if (!this.g.net?.guest) return;
    this.onKill(+m.x || 0, +m.y || 0, +m.z || 0, +m.m || 0, !!m.b);
  }

  onKill(x, y, z, maxHp, boss) {
    if (!this.on) return;
    const g = this.g;
    const P = g.player;
    if (!P.alive || P.downed) return;
    // Achuras: vida
    if (this.v.achuras) P.health = Math.min(P.maxHealth, P.health + this.v.achuras);
    // Otra vuelta: balas a la reserva del que tenés en la mano
    const W = g.weapons;
    const s = W?.slot;
    if (this.v.vuelta && s && !s.temp) {
      const st = W.statsOf(s.id, s.up);
      if (st?.reserve > 0 && st.mag > 0) {
        s.reserve = Math.min(st.reserve, (s.reserve || 0) + Math.max(1, Math.round(st.mag * this.v.vuelta)));
        W.updateHud?.();
      }
    }
    // Cañita voladora: la baja explota
    if (this.v.canita && !boss && g.time - this.boomAt > BOOM_GAP && Math.random() < this.v.canita) {
      this.boomAt = g.time;
      this.boom(x, y, z, Math.max(BOOM_MIN, maxHp * BOOM_K));
    }
    // Viento Zonda: cada tantas bajas, un ventarrón alrededor
    if (this.raros.has('zonda') && ++this.kills % RAROS.zonda.n === 0) this.cast('zonda');
  }

  // La baja que explota (el daño lo pone quien la causó; lo ven todos).
  boom(x, y, z, dmg) {
    const g = this.g;
    const at = new THREE.Vector3(x, y + 1, z);
    this.fxBoom(at);
    for (const { z: zz } of g.zombies.inRadius(at, BOOM_R)) {
      const point = new THREE.Vector3(zz.pos.x, (zz.baseY || 0) + 1, zz.pos.z);
      const dir = new THREE.Vector3(zz.pos.x - x, 0.4, zz.pos.z - z).normalize();
      g.zombies.damage(zz, zz.boss ? Math.min(dmg, BOOM_JEFE) : dmg, { type: 'explosive', zone: 'torso', point, dir });
    }
    this.share({ k: 'boom', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
  }

  // ---------------- la habilidad ----------------
  get ready() {
    return !!this.hab && this.g.time >= this.readyAt;
  }

  // (bossRush.update, jugando) La tecla, las recargas y los efectos que duran.
  update(dt) {
    const g = this.g;
    if (this.on) {
      const P = g.player;
      if (this.hab && g.input.hit('KeyY') && !g.input.key('AltLeft') && this.ready && P.alive && !P.downed && !P.ghost && !g.intro?.active && !g.ee?.scene) {
        this.readyAt = g.time + this.cd;
        this.cast(this.hab);
        this.pop();
      }
      // el cuero vuelve de a uno
      if (this.cuero < this.cueroMax && this.cueroAt && g.time >= this.cueroAt) {
        this.cuero++;
        this.cueroAt = this.cuero < this.cueroMax ? g.time + CUERO_CD : 0;
        this.hudSync(true);
      }
      // la recarga terminó: el medallón late y un toque
      const r = this.ready;
      if (r && !this.wasReady) this.onReady();
      this.wasReady = r;
      this.tickDash(dt);
      this.prisma.update();
    }
    this.tickShoves(dt);
    this.tickFx(dt);
    this.prisma.tick(dt);
    this.hudSync();
  }

  // Usar (la propia, o la del Viento Zonda que sale sola).
  cast(k) {
    const g = this.g;
    const P = g.player;
    const id = g.net ? g.net.id : 0;
    const at = P.pos;
    if (k === 'pique') {
      // para donde vas (o para adelante)
      const I = g.input;
      const f = (I.key('KeyW') ? 1 : 0) - (I.key('KeyS') ? 1 : 0);
      const r = (I.key('KeyD') ? 1 : 0) - (I.key('KeyA') ? 1 : 0);
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      const dir = new THREE.Vector3(fx * (f || (r ? 0 : 1)) + Math.cos(P.yaw) * r, 0, fz * (f || (r ? 0 : 1)) - Math.sin(P.yaw) * r).normalize();
      const H = HABILIDADES.pique;
      this.dash = { dir, left: H.dist, v: H.dist / H.dur, t: 0 };
      this.guardT = Math.max(this.guardT, g.time + H.dur + PIQUE_GUARD);
      this.sound('pique', 0.95);
      this.flash('is-pique');
      this.share({ k, x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2), dx: +dir.x.toFixed(2), dz: +dir.z.toFixed(2) });
    } else if (k === 'rebencazo' || k === 'zonda') {
      this.fxPush(k, at.x, at.y, at.z, true);
      this.share({ k, x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) });
      if (!g.net?.guest) this.push(at.x, at.y, at.z, id);
    } else if (k === 'humareda') {
      const s = HABILIDADES.humareda.secs;
      // (como la humita: no te ven ni te tocan; en línea, el anfitrión lo
      // sabe por el mismo aviso: entities/Empanadas.js 'unseen')
      P.guardT = Math.max(P.guardT || 0, g.time + s);
      g.net?.share('emp', { k: 'unseen', id: g.net.id, s });
      this.fxHumo(at.x, at.y, at.z, true);
      this.flash('is-humo', s);
      this.share({ k, x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) });
    } else if (k === 'paye') {
      const s = HABILIDADES.paye.secs;
      this.payeT = g.time + s;
      this.sound('paye', 1);
      this.flash('is-paye', s);
      this.fxs.push({ k: 'aura', id, until: g.time + s, me: true });
      this.share({ k, s });
    }
  }

  // El pique: de a pasitos, chocando con lo de siempre (y sin tirarse de un borde).
  tickDash(dt) {
    const D = this.dash;
    if (!D) return;
    const g = this.g;
    const P = g.player;
    let go = Math.min(D.left, D.v * dt);
    D.left -= go;
    D.t += dt;
    while (go > 1e-4) {
      const s = Math.min(0.2, go);
      go -= s;
      const nx = P.pos.x + D.dir.x * s;
      const nz = P.pos.z + D.dir.z * s;
      if (g.world.floorAt(nx, nz, P.pos.y + 0.5) < P.pos.y - 1.2) {
        D.left = 0;
        break;
      }
      P.pos.x = nx;
      P.pos.z = nz;
      g.world.collide(P.pos, PLAYER.radius, P.pos.y + 0.05, P.pos.y + 1.7);
    }
    if (Math.random() < 0.8) this.puff(P.pos.x, P.pos.y, P.pos.z, 2);
    if (D.left <= 0 || D.t > 0.6) this.dash = null;
  }

  // (anfitrión o solo) El empujón: daño y para atrás, desde ese punto. by: quién.
  push(x, y, z, by) {
    const g = this.g;
    const H = HABILIDADES.rebencazo;
    const at = tmpV.set(x, y + 1, z);
    const remote = g.net && by !== g.net.id;
    for (const { z: zz, d } of g.zombies.inRadius(at, H.r)) {
      if (zz.dead || Math.abs((zz.baseY || zz.pos.y || 0) - y) > 2) continue;
      const dx = zz.pos.x - x;
      const dz = zz.pos.z - z;
      const l = Math.hypot(dx, dz) || 1;
      const dir = new THREE.Vector3(dx / l, 0.3, dz / l);
      const point = new THREE.Vector3(zz.pos.x, (zz.baseY || 0) + 1.2, zz.pos.z);
      const dmg = zz.boss ? REB_JEFE : Math.max(REB_MIN, (zz.maxHp || 0) * REB_K);
      g.zombies.damage(zz, dmg, { type: 'bash', zone: 'torso', point, dir, by: remote ? by : undefined, noPoints: remote || undefined });
      // (los jefes no se mueven: sus peleas cuentan con dónde están)
      if (!zz.dead && !zz.boss && (zz.state === 'chase' || zz.state === 'attack')) {
        this.shoves.push({ z: zz, dx: dx / l, dz: dz / l, left: H.push * (1 - (d / H.r) * 0.4), t: 0 });
      }
    }
  }

  tickShoves(dt) {
    const g = this.g;
    if (!this.shoves.length) return;
    for (const S of this.shoves) {
      const z = S.z;
      S.t += dt;
      if (!z.active || z.dead) {
        S.left = 0;
        continue;
      }
      let go = Math.min(S.left, (S.left / Math.max(0.05, REB_T - S.t + dt)) * dt);
      S.left -= go;
      const by = z.baseY || 0;
      while (go > 1e-4) {
        const s = Math.min(0.25, go);
        go -= s;
        const nx = z.pos.x + S.dx * s;
        const nz = z.pos.z + S.dz * s;
        if (g.world.floorAt(nx, nz, by + 0.5) < by - 1) {
          S.left = 0;
          break;
        }
        z.pos.x = nx;
        z.pos.z = nz;
        g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
      }
      // (mirando a quien lo empujó, para que se vea que se va de espaldas)
      z.yaw = Math.atan2(-S.dx, -S.dz);
      z.mcDirty = true;
      if (Math.random() < 0.5) this.puff(z.pos.x, by, z.pos.z, 1);
    }
    this.shoves = this.shoves.filter((S) => S.left > 0.01 && S.t < REB_T + 0.3);
  }

  // ---------------- lo que se ve (y en línea, lo ven todos) ----------------
  share(m) {
    this.g.net?.share('rush', { a: 'fx', id: this.g.net.id, ...m });
  }

  // (bossRush.onNet) El efecto de otro jugador.
  onFx(m) {
    const g = this.g;
    if (m.id === g.net?.id) return;
    const x = +m.x || 0;
    const y = +m.y || 0;
    const z = +m.z || 0;
    if (m.k === 'pique') {
      for (let i = 0; i < 6; i++) this.puff(x + (+m.dx || 0) * i, y, z + (+m.dz || 0) * i, 3);
      this.sound('pique', 0.7, 1, new THREE.Vector3(x, y + 1, z));
    } else if (m.k === 'rebencazo' || m.k === 'zonda') {
      this.fxPush(m.k, x, y, z, false);
      if (g.net?.host) this.push(x, y, z, m.id | 0);
    } else if (m.k === 'humareda') this.fxHumo(x, y, z, false);
    else if (m.k === 'paye') {
      this.fxs.push({ k: 'aura', id: m.id | 0, until: g.time + Math.min(10, +m.s || 4) });
      const r = g.net?.remote.get(m.id | 0);
      if (r?.pos) this.sound('paye', 0.7, 1, new THREE.Vector3(r.pos.x, r.pos.y + 1, r.pos.z));
    } else if (m.k === 'boom') this.fxBoom(new THREE.Vector3(x, y + 1, z));
    else if (m.k === 'heredero' || m.k === 'herFin') this.prisma.onFx(m);
  }

  // la onda del rebenque (un anillo de polvo y chispas que se abre) o el ventarrón
  fxPush(k, x, y, z, me) {
    const g = this.g;
    const F = g.fx;
    const zonda = k === 'zonda';
    const n = 56;
    // (el propio: el anillo arranca más lejos y más bajo, si no tapa la cámara de blanco)
    const r0 = me ? 1.3 : 0.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const v = (zonda ? 12 : 15) + Math.random() * 3;
      // el anillo (de adelante para atrás: se ve abrirse desde los pies)
      F.add.spawn(x + c * r0, y + (me ? 0.12 : 0.35), z + s * r0, c * v, 0.4, s * v, { color: zonda ? [0.9, 0.82, 0.6] : [1, 0.86, 0.5], size: me ? 0.14 : 0.22, size1: 0.04, life: 0.45, drag: 4 });
      F.alpha.spawn(x + c * 0.8, y + 0.15, z + s * 0.8, c * v * 0.55, 0.6 + Math.random(), s * v * 0.55, { color: [0.5, 0.44, 0.36], size: 0.3, size1: 1.6, life: 0.9 + Math.random() * 0.4, alpha: 0.35, drag: 2.5, gravity: -0.2 });
      // el ventarrón: remolinos que suben
      if (zonda && i % 3 === 0) F.alpha.spawn(x + c * 1.5, y + 0.3, z + s * 1.5, -s * 6 + c * 3, 2 + Math.random() * 2, c * 6 + s * 3, { color: [0.8, 0.72, 0.52], size: 0.15, size1: 0.9, life: 1.2, alpha: 0.3, drag: 1.5 });
    }
    F.flash(tmpV.set(x, y + (me ? 0.3 : 1), z), zonda ? 0xe8d8a8 : 0xffd080, me ? 7 : 12, 0.25, 9);
    const p = me ? null : tmpV.set(x, y + 1, z).clone();
    this.sound('rebencazo', zonda ? 0.7 : 1, zonda ? 0.8 : 1, p);
    g.audio.bossSlam?.(tmpD.set(x, y + 0.5, z).clone());
    if (me) g.fx.addShake(0.35);
  }

  // la nube de la humareda (queda un rato donde se tiró)
  fxHumo(x, y, z, me) {
    const g = this.g;
    for (let i = 0; i < 60; i++) this.smoke(x, y, z, 2.6, 1.8);
    this.fxs.push({ k: 'humo', x, y, z, until: g.time + HUMO_T, t: 0 });
    this.sound('humareda', 1, 1, me ? null : new THREE.Vector3(x, y + 1, z));
  }

  // (sale de un anillo alrededor y se abre: el que la tiró ve a través, los
  // de afuera ven una nube; adentro no queda todo blanco)
  smoke(x, y, z, r, up) {
    const a = Math.random() * Math.PI * 2;
    const d = 1.2 + Math.random() * (r - 1.2);
    const gray = 0.55 + Math.random() * 0.2;
    this.g.fx.alpha.spawn(x + Math.cos(a) * d, y + 0.1 + Math.random() * up, z + Math.sin(a) * d, Math.cos(a) * 1.2, 0.25 + Math.random() * 0.5, Math.sin(a) * 1.2, {
      color: [gray, gray, gray * 1.02],
      size: 0.7,
      size1: 2.2 + Math.random() * 1.2,
      life: 3 + Math.random() * 2,
      alpha: 0.42,
      drag: 1.4,
      gravity: -0.05,
    });
  }

  fxBoom(at) {
    const g = this.g;
    g.fx.explosion(at, 2.6, [1, 0.6, 0.25]);
    // (los chispazos de colores de una cañita)
    for (const c of [[1, 0.3, 0.2], [0.3, 0.8, 1], [1, 0.9, 0.3]]) g.fx.sparks(at, 1.2, { x: 0, y: 1.4, z: 0 }, c);
    g.audio.explosion?.(at.clone(), 0.7);
  }

  puff(x, y, z, n) {
    this.g.fx.dust(tmpD.set(x, y + 0.1, z), { x: 0, y: 0.6, z: 0 }, [0.55, 0.48, 0.38], n);
  }

  tickFx(dt) {
    const g = this.g;
    if (!this.fxs.length) return;
    for (const f of this.fxs) {
      if (f.k === 'humo') {
        f.t += dt;
        // (sigue saliendo humo los primeros segundos; después se va solo)
        if (g.time < f.until - 2.5 && Math.random() < 0.5) this.smoke(f.x, f.y, f.z, 3, 1.4);
      } else if (f.k === 'aura') {
        // el payé: un brillo dorado alrededor del cuerpo
        const pos = f.me ? g.player.pos : g.net?.remote.get(f.id)?.pos;
        if (!pos) continue;
        for (let i = 0; i < (f.me ? 2 : 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const r = f.me ? 0.7 + Math.random() * 0.4 : 0.45 + Math.random() * 0.2;
          g.fx.add.spawn(pos.x + Math.cos(a) * r, pos.y + 0.1 + Math.random() * 1.7, pos.z + Math.sin(a) * r, 0, 0.6 + Math.random() * 0.5, 0, { color: [1, 0.82, 0.3], size: f.me ? 0.07 : 0.1, size1: 0, life: 0.7 });
        }
        // (el de un compañero: además un aro dorado a los pies, que se vea de lejos)
        if (!f.me && Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          g.fx.add.spawn(pos.x + Math.cos(a) * 0.7, pos.y + 0.08, pos.z + Math.sin(a) * 0.7, -Math.sin(a) * 1.5, 0.2, Math.cos(a) * 1.5, { color: [1, 0.75, 0.25], size: 0.16, size1: 0.02, life: 0.6 });
        }
      }
    }
    this.fxs = this.fxs.filter((f) => g.time < f.until);
  }

  // ---------------- sonido ----------------
  loadSounds() {
    const a = this.g.audio;
    if (!a?.ctx || a.mduRush) return;
    a.mduRush = { buf: {} };
    for (const id of SONIDOS) {
      fetch(SND_DIR + id + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => a.ctx.decodeAudioData(ab))
        .then((b) => {
          a.mduRush.buf[id] = b;
        })
        .catch(() => {});
    }
  }

  sound(id, gain = 1, rate = 1, pos = null) {
    const a = this.g.audio;
    const buf = a?.mduRush?.buf[id];
    if (!buf) return;
    a.playBuffer(buf, { pos, gain: gain * 0.9, reverb: 0.15, rate, ref: 4 });
  }

  // la habilidad volvió: un toque corto (sintetizado: no tapa nada)
  onReady() {
    const a = this.g.audio;
    this.el?.querySelector('.mdu-hab')?.classList.remove('is-pop');
    const m = this.el?.querySelector('.mdu-hab');
    if (m) {
      m.classList.remove('is-back');
      void m.offsetWidth;
      m.classList.add('is-back');
    }
    if (!a?.ctx) return;
    const o = a.out({ gain: 0.25, reverb: 0.1 });
    a.tone(o, { dur: 0.12, freq: 880, freqEnd: 1320, gain: 0.5 });
  }

  // ---------------- el HUD ----------------
  // El medallón de la habilidad (con su tecla y el aro de la recarga) y los
  // golpes del cuero, a la derecha de la empanada; y el velo de cada efecto.
  build() {
    const H = this.g.hud;
    if (!H?.root) return null;
    let el = H.root.querySelector('.mdu-rbhud');
    if (!el) {
      el = document.createElement('div');
      el.className = 'mdu-rbhud';
      // (en fila con el de la habilidad, los de las prismáticas con tecla: core/rushPrisma.js)
      el.innerHTML = '<div class="mdu-cuero"></div><div class="mdu-rbrow"><div class="mdu-hab"><i class="mdu-hab__ring"></i><span class="mdu-hab__art"></span><kbd class="mdu-hab__key"></kbd></div></div>';
      H.root.appendChild(el);
      const fx = document.createElement('div');
      fx.className = 'mdu-rbfx';
      H.root.appendChild(fx);
      // a la altura de la empanada (arriba de lo de abajo a la izquierda, que crece y achica)
      const bl = H.root.querySelector('.mdu-bl');
      if (bl && window.ResizeObserver) {
        el.__ro = new ResizeObserver(() => {
          const r = bl.getBoundingClientRect();
          const rr = H.root.getBoundingClientRect();
          if (r.height) el.style.bottom = `${Math.round(rr.bottom - r.top + 18)}px`;
        });
        el.__ro.observe(bl);
      }
    }
    this.el = el;
    this.fxEl = H.root.querySelector('.mdu-rbfx');
    return el;
  }

  hudSync(force = false) {
    const g = this.g;
    if (!this.el && !this.on) return;
    const el = this.el || this.build();
    if (!el) return;
    const k = this.hab ? clamp01(1 - (this.readyAt - g.time) / (this.cd || 1)) : 0;
    // (los medallones del Heredero y el Resurgir: core/rushPrisma.js; true si hay alguno)
    const pv = this.prisma.hud(el, force);
    const key = `${this.on}|${this.hab}|${Math.round(k * 50)}|${this.cuero}/${this.cueroMax}|${pv}`;
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    const m = el.querySelector('.mdu-hab');
    const show = this.on && !!this.hab;
    el.classList.toggle('is-on', this.on && (show || this.cueroMax > 0 || pv));
    m.classList.toggle('is-on', show);
    if (show) {
      if (m.dataset.id !== this.hab) {
        m.dataset.id = this.hab;
        m.querySelector('.mdu-hab__art').innerHTML = RUSH_ICONS[this.hab] || '';
        m.title = HABILIDADES[this.hab].name;
      }
      m.style.setProperty('--k', k.toFixed(3));
      m.classList.toggle('is-ready', k >= 1);
      m.querySelector('.mdu-hab__key').textContent = keyLabel('habilidad');
    }
    const c = el.querySelector('.mdu-cuero');
    if (c.childElementCount !== this.cueroMax) c.innerHTML = '<i></i>'.repeat(this.cueroMax);
    [...c.children].forEach((x, i) => x.classList.toggle('is-off', i >= this.cuero));
  }

  // el medallón salta al usar
  pop() {
    const m = this.el?.querySelector('.mdu-hab');
    if (!m) return;
    m.classList.remove('is-pop', 'is-back');
    void m.offsetWidth;
    m.classList.add('is-pop');
    this.hudSync(true);
  }

  // el velo de la pantalla (s: cuánto dura; sin s, un golpe)
  flash(cls, s = 0) {
    const el = this.fxEl || (this.build(), this.fxEl);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.style.setProperty('--s', `${Math.max(0.4, s)}s`);
    clearTimeout(this['t_' + cls]);
    this['t_' + cls] = setTimeout(() => el.classList.remove(cls), Math.max(0.4, s) * 1000 + 450);
  }
}
