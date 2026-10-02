import * as THREE from 'three';
import { ACT } from '../config/map';
import { mesh, boxGeo, cylGeo } from './props';
import { shieldModel } from './shieldModels';
import { upgradeShield } from './shieldUpModels';
import { buildGorriti, updateGorriti, gorritiKillFx } from './shieldGorriti';
import { sfxClang, sfxGrind, sfxSizzle, sfxQuench, sfxClack, sfxSteam, sfxFlame, sfxUpgrade } from './shieldSfx';
import '../ui/shieldUp.css';

// La mejora del escudo (una vez por equipo: después la mesa de trabajo da los
// mejorados). Cada mapa la hace a su manera (ACT.shield.up.kind):
//  · press (molino): el escudo en la prensa de la Sala de Máquinas, con luz;
//    remacha mientras no haya muertos encima (si llegan, se atasca).
//  · fence (granja): colgado del Boyero Eléctrico; cada muerto de la trampa
//    le carga una bombita.
//  · temper (penal): colgado en las Duchas Hirvientes hasta que queda al rojo;
//    se lleva así hasta el agua del Muelle antes de que se enfríe.
//  · skull (esteros): tocar el cráneo de yacaré de la Pesquería con el escudo;
//    cada muerto a escudazos cerca le prende un diente.
//  · pava (torre): de tapa de la pava sobre el fogón del piso 9; cuando silba,
//    se ceba (tres veces), con alguien cerca para que no se apague.
//  · forge (castillo): el escudo adelante sobre las Brasas de la Liza hasta el
//    rojo y tres escudazos en el yunque de la Herrería antes de que se enfríe.
//  · gorriti (monumento): el escudo en las manos del canónigo Gorriti (Pasaje
//    Juramento); 8 muertos a escudazos cerca antes de la tercera campanada
//    de la Catedral (world/shieldGorriti).
// Lo que hace el mejorado (prop): push, zap, chain, bite, steam, blazon, rebote.
// En línea decide el anfitrión (pedidos 'sup' y eventos 'sup' de net/Session).

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const HOT = new THREE.Color(1, 0.3, 0.05);

const DESC = {
  push: 'Empuja al que le pega',
  zap: 'Electrocuta al que le pega',
  chain: 'Encadena al que le pega',
  bite: 'El escudazo muerde',
  steam: 'Larga vapor cuando le pegan',
  blazon: 'Cinco golpes cargan una llamarada',
  rebote: 'Le devuelve el golpe al que le pega',
};

// materiales propios de la mejora (uno por sesión)
const MATS = new Map();
const mat = (k, make) => {
  if (!MATS.has(k)) MATS.set(k, make());
  return MATS.get(k);
};

// Los materiales de un modelo, propios (para que brille solo ese); devuelve
// los de metal, que son los que se ponen al rojo.
export function ownMats(obj) {
  const hot = [];
  const seen = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    let m = seen.get(o.material);
    if (!m) {
      m = o.material.clone();
      seen.set(o.material, m);
      if (m.isMeshStandardMaterial && (m.metalness >= 0.25 || m.emissiveIntensity < 1)) hot.push(m);
    }
    o.material = m;
  });
  return hot;
}

export function setHeat(mats, h, t = 0, gain = 1) {
  const k = h <= 0 ? 0 : h * (2 + Math.sin(t * 9) * 0.25) * gain;
  for (const m of mats) {
    if (!m.emissive) continue;
    m.emissive.copy(HOT);
    m.emissiveIntensity = k;
  }
}

export default class ShieldUpgrade {
  constructor(g, act) {
    this.g = g;
    this.act = act;
    this.U = ACT.shield?.up || null;
    this.done = false;
    this.st = { stage: 'idle', p: 0, n: 0, jam: false, h: 0, c: 0, by: -1 };
    this.chains = [];
    this.bleeds = [];
    this.flying = [];
    this.sendT = 0;
    this.fxT = 0;
    if (!this.U) return;
    this.M = g.world.M;
    this.root = new THREE.Group();
    act.root.add(this.root);
    const k = this.U.kind;
    if (k === 'press') this.buildPress();
    else if (k === 'fence') this.buildFence();
    else if (k === 'temper') this.buildTemper();
    else if (k === 'skull') this.buildSkull();
    else if (k === 'pava') this.buildPava();
    else if (k === 'gorriti') buildGorriti(this);
  }

  get kind() {
    return this.U?.kind;
  }

  myId() {
    return this.g.net ? this.g.net.id : 0;
  }

  isHost() {
    return !this.g.net || this.g.net.host;
  }

  floorY(x, z, y) {
    return y ?? this.g.world.floorAt(x, z);
  }

  trap() {
    return this.U?.trap ? this.act.traps.find((t) => t.def.id === this.U.trap) : null;
  }

  // El escudo de la estación: el común con lo de la mejora escondido, que se
  // va viendo a medida que avanza (show(k)); up() lo termina.
  stationShield(parent) {
    const M = this.M;
    const s = shieldModel(M, this.g.mapId);
    const n0 = s.children.length;
    upgradeShield(s, M, this.g.mapId);
    const extra = s.children.slice(n0);
    const hot = ownMats(s);
    const S = {
      obj: s,
      extra,
      hot,
      show: (k) => extra.forEach((o, i) => (o.visible = i < Math.round(k * extra.length))),
    };
    S.show(0);
    parent.add(s);
    return S;
  }

  // ---------------- en línea ----------------
  hookNet() {
    const g = this.g;
    if (!g.net || this.netHooked === g.net) return;
    this.netHooked = g.net;
    g.net.net.on('sup', (m, from) => {
      if (g.net?.host) this.onRequest(m, from);
    });
  }

  // Pedido (al anfitrión, o a uno mismo jugando solo).
  ask(m) {
    const g = this.g;
    if (this.isHost()) this.onRequest(m, this.myId());
    else g.net.net.send({ t: 'sup', ...m });
  }

  // Aviso del anfitrión a todos (y a uno mismo). Ojo: sin campos t ni e.
  tell(m) {
    this.onEvent(m);
    this.g.net?.event('sup', m);
  }

  // ¿Ese jugador tiene escudo? (el anfitrión mira la bandera de los invitados)
  hasShield(id) {
    const g = this.g;
    if (id === this.myId()) return !!g.player.shield;
    return !!g.net?.remote.get(id)?.shield;
  }

  onRequest(m, from) {
    const g = this.g;
    const st = this.st;
    switch (m.k) {
      case 'place': {
        if (this.done || st.stage !== 'idle' || !this.hasShield(from)) return;
        const stage = { press: 'work', fence: 'hung', temper: 'hung', skull: 'hunt', gorriti: 'hunt', pava: 'boil' }[this.kind];
        if (!stage) return;
        if (this.kind === 'press' && !g.world.power) return;
        this.tell({ k: 'st', stage, p: 0, n: 0, h: 0, c: 0, jam: false, by: from, ev: 'place' });
        return;
      }
      case 'take': {
        if (st.stage === 'ready') this.tell({ k: 'st', stage: 'idle', p: 0, n: 0, h: 0, c: 0, jam: false, by: from, ev: 'take', up: 1 });
        else if (st.stage === 'hot') this.tell({ k: 'st', stage: 'idle', p: 0, n: 0, h: 0, c: 0, jam: false, by: from, ev: 'take', hot: 1 });
        return;
      }
      case 'cebar': {
        if (this.kind !== 'pava' || st.stage !== 'boil' || st.h < 1) return;
        const c = st.c + 1;
        if (c >= (this.U.need || 3)) {
          this.tell({ k: 'st', stage: 'ready', h: 0, c, ev: 'cebar' });
          this.tell({ k: 'done', by: from, give: 0 });
        } else this.tell({ k: 'st', stage: 'boil', h: 0, c, ev: 'cebar' });
        return;
      }
      // el penal y el castillo: lo termina cada uno con su escudo
      case 'done':
        this.tell({ k: 'done', by: from, give: 1 });
        return;
      case 'fx':
        this.applyFx(m.zi, m.fx, m, from);
        return;
      default:
    }
  }

  onEvent(m) {
    const g = this.g;
    const st = this.st;
    const me = this.myId();
    if (m.k === 'st') {
      const prev = st.stage;
      for (const key of ['stage', 'p', 'n', 'h', 'c', 'jam', 'by']) if (m[key] !== undefined) st[key] = m[key];
      if (m.ev === 'place') {
        // el que lo puso se queda sin escudo (el de la estación es ese; el
        // cráneo solo se toca)
        if (m.by === me && this.kind !== 'skull' && this.kind !== 'gorriti') {
          g.player.shield = null;
          g.hud.setShield(null);
        }
        this.onPlace();
      } else if (m.ev === 'take') {
        this.onTake();
        if (m.by === me) {
          if (m.hot) this.giveHot('temper');
          else this.act.equipShield(true);
        }
      } else if (m.ev === 'cebar') this.onCebar();
      if (prev !== st.stage && st.stage === 'ready') this.onReady();
      if (prev !== st.stage && st.stage === 'hot') this.onHot();
    } else if (m.k === 'done') {
      const first = !this.done;
      this.done = true;
      if (first) {
        sfxUpgrade(g.audio);
        g.hud.achievement(this.U.name, DESC[this.U.prop] || '');
        this.act.benchUp?.();
      }
      if (m.give && m.by === me) this.act.equipShield(true);
    } else if (m.k === 'bash') {
      // el escudazo de un compañero: se ve en su muñeco (net/Avatars)
      const a = g.net?.avatars?.list.get(m.id);
      if (a) a.bashT = g.time;
    } else if (m.k === 'kill') this.onKillFx(m);
    else if (m.k === 'zv') this.fxVisual(m);
  }

  fullState() {
    return this.U ? { done: this.done ? 1 : 0, ...this.st } : null;
  }

  applyFull(s) {
    if (!s || !this.U) return;
    const was = this.st.stage;
    for (const key of ['stage', 'p', 'n', 'h', 'c', 'jam', 'by']) if (s[key] !== undefined) this.st[key] = s[key];
    if (s.done && !this.done) {
      this.done = true;
      this.act.benchUp?.();
    }
    if (was === 'idle' && this.st.stage !== 'idle') this.onPlace();
    if (this.st.stage === 'ready') this.onReady(true);
  }

  // ---------------- lo común de las estaciones ----------------
  stationItem(pos, radius, prompt, use, extra = {}) {
    const g = this.g;
    g.interact.add({
      kind: 'supstation',
      local: true,
      pos,
      radius,
      prompt,
      cost: () => {
        const p = prompt();
        return p && !p.info ? 0 : 1;
      },
      use,
      ...extra,
    });
  }

  // lo que dice la estación cuando está quieta
  idlePrompt(text, needPower = false) {
    const g = this.g;
    if (this.done) return null;
    if (needPower && !g.world.power) return { text: 'Necesita electricidad', noCost: true, info: true };
    if (!g.player.shield) return { text: 'Necesita un escudo', noCost: true, info: true };
    return { text, noCost: true };
  }

  onPlace() {
    const S = this.station;
    if (!S) return;
    S.obj.visible = true;
    S.show(0);
    setHeat(S.hot, 0);
    const at = this.stationPos;
    if (at) this.g.audio.boardRepair?.(at);
  }

  onTake() {
    const S = this.station;
    if (S) S.obj.visible = false;
    this.lift = null;
  }

  onReady(quiet = false) {
    const g = this.g;
    const S = this.station;
    if (S) {
      S.obj.visible = true;
      S.show(1);
      this.readyT = quiet ? 3 : 0;
    }
    if (quiet) return;
    const at = this.stationPos;
    if (!at) return;
    g.fx.flash(at.clone().setY(at.y + 0.6), 0xffd28a, 30, 0.4, 10);
    g.fx.steam(at, 16, 0.8);
    g.fx.sparks(at, 3, { x: 0, y: 1, z: 0 });
    sfxClang(g.audio, at, 1.2);
  }

  // ---------------- molino: la remachadora ----------------
  // Una remachadora de pórtico: el puente corre sobre dos rieles, el carro
  // corre por el puente y el martinete baja a clavar cada remache del escudo,
  // uno por uno (el borde, los flejes y al final el centro). El avance lo
  // manda el anfitrión (st.p); acá se anima el golpe de cada remache.
  buildPress() {
    const g = this.g;
    const M = this.M;
    const U = this.U;
    const [x, z] = U.pos;
    const y = this.floorY(x, z, U.y);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = U.rot || 0;
    this.root.add(grp);
    const paint = M.metalGreen || M.iron;
    // el banco y la cama de hierro
    grp.add(mesh(boxGeo(1.3, 0.56, 0.95), paint, 0, 0.28, 0));
    grp.add(mesh(boxGeo(1.36, 0.05, 1.0), M.iron, 0, 0.03, 0));
    grp.add(mesh(boxGeo(1.1, 0.06, 0.86), M.metal, 0, 0.59, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(mesh(cylGeo(0.018, 0.018, 0.02, 8), M.brass, sx * 0.5, 0.63, sz * 0.38));
    // las cuatro columnas y los dos rieles de arriba
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        grp.add(mesh(cylGeo(0.04, 0.05, 1.36, 10), M.iron, sx * 0.6, 1.3, sz * 0.43));
        grp.add(mesh(boxGeo(0.12, 0.05, 0.12), M.brass, sx * 0.6, 0.64, sz * 0.43));
      }
    }
    for (const sz of [-1, 1]) grp.add(mesh(boxGeo(1.32, 0.07, 0.09), M.iron, 0, 2.0, sz * 0.43));
    // el puente (corre en x), el carro (corre en z) y el martinete
    const bridge = new THREE.Group();
    bridge.position.y = 2.0;
    bridge.add(mesh(boxGeo(0.12, 0.1, 0.96), paint, 0, 0.07, 0));
    for (const sz of [-1, 1]) bridge.add(mesh(cylGeo(0.04, 0.04, 0.14, 10), M.brass, 0, 0.02, sz * 0.43, 0, 0, Math.PI / 2));
    const carriage = new THREE.Group();
    carriage.add(mesh(boxGeo(0.2, 0.16, 0.18), M.iron, 0, 0.02, 0));
    carriage.add(mesh(cylGeo(0.06, 0.06, 0.14, 12), M.copper, 0, 0.17, 0));
    carriage.add(mesh(cylGeo(0.065, 0.065, 0.02, 12), M.brass, 0, 0.25, 0));
    bridge.add(carriage);
    const hammer = new THREE.Group();
    hammer.add(mesh(cylGeo(0.022, 0.022, 0.62, 8), M.metal, 0, -0.37, 0));
    hammer.add(mesh(cylGeo(0.05, 0.05, 0.11, 12), M.iron, 0, -0.72, 0));
    hammer.add(mesh(cylGeo(0.014, 0.02, 0.05, 8), M.brass, 0, -0.8, 0));
    carriage.add(hammer);
    grp.add(bridge);
    // el manómetro en la columna de adelante y la lamparita arriba
    const gauge = new THREE.Group();
    gauge.position.set(0.6, 1.45, 0.49);
    gauge.add(mesh(cylGeo(0.11, 0.11, 0.05, 20), M.brass, 0, 0, 0, Math.PI / 2, 0, 0));
    gauge.add(mesh(cylGeo(0.095, 0.095, 0.01, 20), M.clothWhite || M.paper, 0, 0, 0.026, Math.PI / 2, 0, 0));
    const needle = new THREE.Group();
    needle.position.z = 0.034;
    needle.add(mesh(boxGeo(0.01, 0.08, 0.006), M.redPaint, 0, 0.035, 0));
    gauge.add(needle);
    grp.add(gauge);
    const lampMat = mat('pressLamp', () => new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x30ff40, emissiveIntensity: 0 }));
    const lamp = mesh(new THREE.SphereGeometry(0.04, 8, 6), lampMat.clone(), -0.6, 2.07, 0.43);
    grp.add(lamp);
    // el escudo acostado en la cama
    const holder = new THREE.Group();
    holder.position.y = 0.62;
    holder.rotation.x = -Math.PI / 2;
    grp.add(holder);
    const S = this.stationShield(holder);
    S.obj.position.z = S.obj.userData.back || 0.05;
    S.obj.visible = false;
    this.station = S;
    // cada remache con su material (se pone al rojo el recién clavado) y a
    // dónde tiene que ir el martinete (en el marco de la máquina)
    grp.updateMatrixWorld(true);
    const rivets = (S.obj.userData.hot || []).filter((o) => o.isMesh).map((o) => {
      o.material = o.material.clone();
      const w = o.getWorldPosition(new THREE.Vector3());
      grp.worldToLocal(w);
      return { o, x: w.x, z: w.z, top: w.y + 0.016, heat: 0 };
    });
    // lo demás de la mejora aparece cuando le toca (el aro al empezar, cada
    // fleje con sus remaches, el centro al final)
    const others = [];
    let before = 0;
    for (const o of S.extra) {
      if (rivets.some((r) => r.o === o)) before++;
      else others.push({ o, at: before });
    }
    const tip0 = 2.0 - 0.825;
    this.press = { grp, bridge, carriage, hammer, needle, lamp, rivets, others, tip0, done: 0, phase: 'move', t: 0, drop: 0, grindT: 0 };
    this.stationPos = new THREE.Vector3(x, y + 0.8, z);
    const c = Math.cos(U.rot || 0);
    const hw = Math.abs(c) > 0.5 ? 0.7 : 0.52;
    const hd = Math.abs(c) > 0.5 ? 0.52 : 0.7;
    g.world.addBox([x - hw, y, z - hd, x + hw, y + 2.2, z + hd], { kind: 'prop' });
    this.stationItem(
      new THREE.Vector3(x, y + 1.1, z),
      2.3,
      () => {
        const st = this.st;
        if (st.stage === 'work') return { text: st.jam ? '¡Atascada!' : `Remachando ${Math.round(st.p * 100)}%`, noCost: true, info: true };
        if (st.stage === 'ready') return { text: 'agarrar el escudo', noCost: true };
        return this.idlePrompt('poner el escudo en la prensa', true);
      },
      () => this.useStation(),
    );
  }

  useStation() {
    const st = this.st;
    const g = this.g;
    if (st.stage === 'ready' || st.stage === 'hot') {
      this.ask({ k: 'take' });
      return true;
    }
    if (st.stage !== 'idle' || this.done || !g.player.shield) return false;
    if (this.kind === 'press' && !g.world.power) return false;
    this.ask({ k: 'place' });
    return true;
  }

  updatePress(dt) {
    const g = this.g;
    const st = this.st;
    const P = this.press;
    const at = this.stationPos;
    // anfitrión: avanza si no hay muertos encima de la prensa
    if (this.isHost() && st.stage === 'work') {
      let jam = false;
      for (const { z } of g.zombies.inRadius(at, 2.6)) {
        if (!z.dead && Math.abs((z.pos.y || 0) - (at.y - 0.8)) < 1.5) {
          jam = true;
          break;
        }
      }
      if (!jam) st.p = Math.min(1, st.p + dt / (this.U.secs || 40));
      this.sendT -= dt;
      if (st.p >= 1) {
        this.tell({ k: 'st', stage: 'ready', p: 1, jam: false });
        this.tell({ k: 'done', by: st.by, give: 0 });
      } else if (jam !== st.jam || this.sendT <= 0) {
        this.sendT = 0.5;
        this.tell({ k: 'st', p: +st.p.toFixed(3), jam });
      }
    }
    const work = st.stage === 'work';
    const ready = st.stage === 'ready';
    const R = P.rivets;
    const N = R.length || 1;
    // cuántos remaches tendría que haber clavados
    if (st.stage === 'idle') P.done = 0;
    const goal = ready ? R.length : work ? Math.min(R.length, Math.floor(st.p * N + 0.001)) : 0;
    // (si se atrasó mucho, por ejemplo al entrar tarde, se ponen de una)
    if (goal - P.done > 3) P.done = goal - 1;
    // a dónde va el martinete: el remache que sigue (o a casa)
    const next = work && P.done < R.length ? R[P.done] : null;
    const tx = next ? next.x : 0;
    const tz = next ? next.z : -0.3;
    const jam = work && st.jam;
    if (!jam) {
      const k = Math.min(1, dt * 6);
      const mv = (cur, to) => cur + Math.max(-dt * 1.4, Math.min(dt * 1.4, (to - cur) * k));
      P.bridge.position.x = mv(P.bridge.position.x, tx);
      P.carriage.position.z = mv(P.carriage.position.z, tz);
    } else {
      // trabado: tiembla, rechina y larga chispas coloradas
      P.bridge.position.x += Math.sin(g.time * 47) * 0.002;
      P.grindT -= dt;
      if (P.grindT <= 0) {
        P.grindT = 0.7;
        sfxGrind(g.audio, at);
        P.carriage.getWorldPosition(tmpV);
        g.fx.sparks(tmpV, 1, { x: 0, y: -1, z: 0 }, [1, 0.25, 0.1]);
      }
    }
    const arrived = !!next && Math.abs(P.bridge.position.x - tx) < 0.01 && Math.abs(P.carriage.position.z - tz) < 0.01;
    // el golpe: baja de un saque, clava y sube
    P.t += dt;
    if (P.phase === 'move' && arrived && goal > P.done && !jam) {
      P.phase = 'down';
      P.t = 0;
    }
    const reach = next ? P.tip0 - next.top : 0.3;
    if (P.phase === 'down') {
      P.drop = Math.min(1, P.t / 0.08);
      if (P.drop >= 1) {
        const r = R[P.done];
        r.o.visible = true;
        r.heat = 1;
        P.done++;
        P.phase = 'up';
        P.t = 0;
        r.o.getWorldPosition(tmpV);
        g.fx.sparks(tmpV, 1.6, { x: 0, y: 1, z: 0 }, [1, 0.7, 0.3]);
        if (Math.random() < 0.5) g.fx.steam(tmpV, 1, 0.2);
        if (g.player.pos.distanceTo(at) < 6) g.fx.addShake(0.035);
        sfxClang(g.audio, tmpV.clone(), 0.7);
      }
    } else if (P.phase === 'up') {
      P.drop = Math.max(0, 1 - P.t / 0.18);
      if (P.drop <= 0) P.phase = 'move';
    } else P.drop = 0;
    P.hammer.position.y = -reach * P.drop + (work && !jam && arrived && P.phase === 'move' ? Math.sin(g.time * 30) * 0.004 : 0);
    // lo que se ve del escudo: los remaches clavados (el recién puesto, al
    // rojo) y el resto cuando le toca
    if (this.station.obj.visible) {
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        r.o.visible = ready || i < P.done;
        r.heat = Math.max(0, r.heat - dt * 0.7);
        setHeat([r.o.material], r.heat, g.time, 0.7);
      }
      for (const o of P.others) o.o.visible = ready || (work && P.done >= o.at && o.at < R.length);
      this.readyT = (this.readyT || 0) + dt;
      if (ready) setHeat(this.station.hot, Math.max(0, 1 - this.readyT / 3), g.time, 0.45);
    }
    P.needle.rotation.z = 2.2 - st.p * 4.4;
    const lampK = work ? (jam ? (Math.sin(g.time * 18) > 0 ? 3 : 0.2) : Math.sin(g.time * 4) > 0 ? 2 : 0.6) : ready ? 2 : 0;
    P.lamp.material.emissive.set(jam ? 0xff2010 : ready ? 0xffb030 : 0x30ff40);
    P.lamp.material.emissiveIntensity = lampK;
  }

  // ---------------- granja: el Boyero Eléctrico ----------------
  buildFence() {
    const g = this.g;
    const M = this.M;
    const U = this.U;
    const [x, z] = U.pos;
    const y = this.floorY(x, z, U.y);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = U.rot || 0;
    this.root.add(grp);
    // colgado de un poste del boyero (de donde salen los arcos): el gancho,
    // las vueltas de alambre al poste y el tablero de bombitas de arriba
    grp.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 12, Math.PI), M.metal, 0, 1.52, 0.02));
    for (const y of [1.5, 1.9]) grp.add(mesh(new THREE.TorusGeometry(0.075, 0.007, 5, 14), M.metal, 0, y, -0.14, Math.PI / 2, 0, 0));
    const board = new THREE.Group();
    board.position.set(0, 1.97, 0);
    board.add(mesh(boxGeo(0.9, 0.34, 0.05), M.woodDark, 0, 0, -0.02));
    board.add(mesh(boxGeo(0.12, 0.12, 0.12), M.iron, 0, 0, -0.1));
    const bulbMat = mat('fenceBulb', () => new THREE.MeshStandardMaterial({ color: 0x8aa8c8, roughness: 0.2, transparent: true, opacity: 0.85, emissive: 0x5ab8ff, emissiveIntensity: 0 }));
    const need = U.need || 10;
    const bulbs = [];
    for (let i = 0; i < need; i++) {
      const b = mesh(new THREE.SphereGeometry(0.035, 10, 8), bulbMat.clone(), -0.34 + (i % 5) * 0.17, 0.07 - Math.floor(i / 5) * 0.14, 0.04);
      board.add(b);
      board.add(mesh(cylGeo(0.018, 0.018, 0.03, 6), M.brass, b.position.x, b.position.y, 0.01, Math.PI / 2, 0, 0));
      bulbs.push(b);
    }
    grp.add(board);
    const holder = new THREE.Group();
    holder.position.set(0, 1.18, 0.04);
    grp.add(holder);
    const S = this.stationShield(holder);
    S.obj.visible = false;
    this.station = S;
    this.fence = { grp, bulbs, arcT: 0 };
    this.stationPos = new THREE.Vector3(x, y + 1.18, z);
    // (se usa desde afuera del alambrado: el lado al que mira el escudo)
    const face = new THREE.Vector3(Math.sin(U.rot || 0), 0, Math.cos(U.rot || 0));
    this.stationItem(
      new THREE.Vector3(x + face.x * 0.6, y + 1.1, z + face.z * 0.6),
      2.1,
      () => {
        const st = this.st;
        if (st.stage === 'hung') return { text: `${st.n}/${need}`, noCost: true, info: true };
        if (st.stage === 'ready') return { text: 'agarrar el escudo', noCost: true };
        return this.idlePrompt('colgar el escudo en el boyero');
      },
      () => this.useStation(),
    );
  }

  updateFence(dt) {
    const g = this.g;
    const st = this.st;
    const F = this.fence;
    const trap = this.trap();
    const on = trap?.state === 'on';
    F.bulbs.forEach((b, i) => {
      const lit = i < st.n || st.stage === 'ready';
      b.material.emissiveIntensity = lit ? (st.stage === 'ready' ? 1.5 + Math.sin(g.time * 12 + i) * 1.2 : 2.2) : 0;
    });
    if (st.stage === 'hung' || st.stage === 'ready') this.station.show(st.stage === 'ready' ? 1 : st.n / (this.U.need || 10));
    // (anfitrión) el escudo colgado con la corriente prendida llama a los
    // muertos al alambre, como la pava: si no, solo pasaban los de una
    // ventana y cargarlo costaba varias vueltas de la trampa
    const lures = g.lures;
    if (lures && this.isHost()) {
      const i = lures.findIndex((l) => l.src === this);
      if (on && st.stage === 'hung' && trap.def.rect) {
        const [x0, z0, x1, z1] = trap.def.rect;
        if (i < 0) lures.push({ src: this, pos: new THREE.Vector3((x0 + x1) / 2, this.stationPos.y - 1.18, (z0 + z1) / 2) });
      } else if (i >= 0) lures.splice(i, 1);
    }
    // con la trampa prendida, el alambre le larga chispas al escudo colgado
    if (on && st.stage === 'hung' && trap.posts) {
      F.arcT -= dt;
      if (F.arcT <= 0) {
        F.arcT = 0.12 + Math.random() * 0.15;
        const p = trap.posts[Math.random() < 0.5 ? 0 : 1];
        g.fx.lightning(tmpV.set(p.x, p.y + 1.1 + Math.random() * 0.6, p.z).clone(), this.stationPos.clone(), 0x9ad0ff, 0.07);
      }
    }
    if (st.stage === 'ready' && this.station.obj.visible && Math.random() < dt * 4) g.fx.electric(this.stationPos, 2);
  }

  // ---------------- penal: las duchas y el muelle ----------------
  buildTemper() {
    const g = this.g;
    const M = this.M;
    const U = this.U;
    const [x, z] = U.pos;
    const y = this.floorY(x, z, U.y);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = U.rot || 0;
    this.root.add(grp);
    // el caño de la ducha del techo con una cadena y el gancho
    grp.add(mesh(cylGeo(0.03, 0.03, 0.8, 8), M.copper, 0, 2.55, 0, 0, 0, Math.PI / 2));
    for (let i = 0; i < 5; i++) grp.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 10), M.iron, 0, 2.47 - i * 0.07, 0, 0, i % 2 ? Math.PI / 2 : 0, 0));
    grp.add(mesh(new THREE.TorusGeometry(0.05, 0.01, 5, 12, Math.PI * 1.4), M.iron, 0, 2.1, 0));
    const holder = new THREE.Group();
    holder.position.set(0, 1.72, 0);
    grp.add(holder);
    const S = this.stationShield(holder);
    S.obj.visible = false;
    // (el que cuelga es el común: al rojo se lleva así)
    S.show(0);
    this.station = S;
    this.stationPos = new THREE.Vector3(x, y + 1.72, z);
    this.stationItem(
      new THREE.Vector3(x, y + 1.3, z),
      2.3,
      () => {
        const st = this.st;
        if (st.stage === 'hung') {
          const trap = this.trap();
          if (trap?.state !== 'on') return { text: 'Necesita agua hirviendo', noCost: true, info: true };
          return { text: `Calentando ${Math.round(st.h * 100)}%`, noCost: true, info: true };
        }
        if (st.stage === 'hot') return { text: 'agarrar el escudo al rojo', noCost: true };
        return this.idlePrompt('colgar el escudo en la ducha');
      },
      () => this.useStation(),
    );
    // en la punta del muelle: la bita donde se hunde
    const [dx, dz] = U.dunk;
    const dy = this.floorY(dx, dz, U.dunkY);
    const bita = new THREE.Group();
    bita.position.set(dx, dy, dz);
    bita.add(mesh(cylGeo(0.12, 0.14, 0.45, 12), M.iron, 0, 0.22, 0));
    bita.add(mesh(cylGeo(0.17, 0.17, 0.05, 12), M.iron, 0, 0.46, 0));
    bita.add(mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), M.rope || M.leather, 0, 0.2, 0, Math.PI / 2, 0, 0));
    this.root.add(bita);
    this.dunkPos = new THREE.Vector3(dx, dy + 0.3, dz);
    this.stationItem(
      new THREE.Vector3(dx, dy + 1.1, dz),
      2.6,
      () => (g.player.shield?.hot?.kind === 'temper' ? { text: 'hundir el escudo', noCost: true } : null),
      () => this.dunk(),
      { wide: true },
    );
  }

  updateTemper(dt) {
    const g = this.g;
    const st = this.st;
    const trap = this.trap();
    const on = trap?.state === 'on';
    if (this.isHost() && st.stage === 'hung') {
      st.h = on ? Math.min(1, st.h + dt / 5) : Math.max(0, st.h - dt / 25);
      this.sendT -= dt;
      if (st.h >= 1) this.tell({ k: 'st', stage: 'hot', h: 1 });
      else if (this.sendT <= 0) {
        this.sendT = 0.5;
        this.tell({ k: 'st', h: +st.h.toFixed(3) });
      }
    }
    const S = this.station;
    if (S.obj.visible) {
      const h = st.stage === 'hot' ? 1 : st.h;
      // (con más brillo que esto se veía blanco, no al rojo)
      setHeat(S.hot, h, g.time, 0.5);
      S.obj.rotation.z = Math.sin(g.time * 1.3) * 0.05;
      if (on && Math.random() < dt * 6) g.fx.steam(this.stationPos, 2, 0.4);
      if (h > 0.5 && Math.random() < dt * 3 * h) g.fx.sparks(this.stationPos, 0.4, { x: 0, y: 1, z: 0 }, [1, 0.5, 0.15]);
      this.sizzleT = (this.sizzleT || 0) - dt;
      if (h > 0.3 && this.sizzleT <= 0) {
        this.sizzleT = 0.8;
        sfxSizzle(g.audio, this.stationPos, 0.9, h);
      }
    }
  }

  onHot() {
    const g = this.g;
    if (!this.stationPos) return;
    g.fx.flash(this.stationPos, 0xff6a2a, 20, 0.35, 8);
    sfxSizzle(g.audio, this.stationPos, 1.4, 1.4);
  }

  // Me llevo el escudo al rojo (el penal) o se me puso al rojo (el castillo).
  giveHot(kind) {
    const g = this.g;
    if (kind === 'temper') this.act.equipShield(false);
    const s = g.player.shield;
    if (!s) return;
    s.hot = { kind, until: g.time + (this.U.secs || 40), strikes: 0 };
    s.heat = 1;
    g.hud.subtitle(kind === 'temper' ? '¡Al rojo! Al agua del Muelle.' : '¡Al rojo! Al yunque de la Herrería.', 3.5);
  }

  dunk() {
    const g = this.g;
    const s = g.player.shield;
    if (s?.hot?.kind !== 'temper') return false;
    s.hot = null;
    s.heat = 0;
    const at = this.dunkPos;
    sfxQuench(g.audio, at);
    for (let i = 0; i < 6; i++) g.fx.steam(tmpV.set(at.x + (Math.random() - 0.5), at.y + i * 0.3, at.z + (Math.random() - 0.5)).clone(), 6, 0.9);
    g.fx.waterJet?.(at.clone().setY(at.y - 0.6), at.clone().setY(at.y + 1.6));
    g.fx.flash(at, 0xbfe0ff, 16, 0.3, 8);
    g.fx.addShake(0.15);
    this.ask({ k: 'done' });
    return true;
  }

  // El escudo al rojo que llevo: se enfría con el tiempo.
  updateHot(dt) {
    const g = this.g;
    const s = g.player.shield;
    if (!s) return;
    if (s.hot) {
      const left = s.hot.until - g.time;
      g.hud.setShieldTag?.(`${Math.max(0, Math.ceil(left))} s`);
      this.hotT = (this.hotT || 0) - dt;
      if (this.hotT <= 0) {
        this.hotT = 0.25;
        const p = tmpV.set(g.player.pos.x, g.player.pos.y + 1.1, g.player.pos.z);
        g.fx.steam(p, 1, 0.3);
      }
      if (left <= 0) {
        s.hot = null;
        g.hud.subtitle('Se enfrió.', 2.5);
        sfxSteam(g.audio, null, 0.6);
      }
    } else g.hud.setShieldTag?.(null);
    // (el calor se ve en la mano: weapons/shieldHand lee s.heat)
    const want = s.hot ? 1 : Math.max(0, (s.heat || 0) - dt / 6);
    s.heat = s.hot ? 1 : this.kind === 'forge' ? s.heat || 0 : want;
  }

  // ---------------- esteros: el cráneo de la Pesquería ----------------
  buildSkull() {
    const g = this.g;
    const M = this.M;
    const U = this.U;
    const [x, z] = U.pos;
    const y = this.floorY(x, z, U.y);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = U.rot || 0;
    this.root.add(grp);
    // el secadero de redes: dos horcones y el travesaño, con la red colgando
    for (const s of [-1, 1]) grp.add(mesh(cylGeo(0.07, 0.09, 2.6, 8), M.log || M.woodDark, s * 1.1, 1.3, 0, 0, 0, s * 0.06));
    grp.add(mesh(cylGeo(0.06, 0.06, 2.5, 8), M.log || M.woodDark, 0, 2.5, 0, 0, 0, Math.PI / 2));
    const net = new THREE.Group();
    for (let i = 0; i < 9; i++) net.add(mesh(boxGeo(0.012, 1.4, 0.012), M.rope || M.sack, -0.95 + i * 0.24, 1.75, -0.05, 0, 0, Math.sin(i) * 0.04));
    for (let j = 0; j < 6; j++) net.add(mesh(boxGeo(2.0, 0.012, 0.012), M.rope || M.sack, 0, 1.1 + j * 0.24, -0.05));
    grp.add(net);
    // el cráneo del yacaré viejo, colgado al medio
    const bone = mat('skullBone', () => new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.65 }));
    // (de perfil: el hocico largo para el costado, así se lee de lejos)
    const skull = new THREE.Group();
    skull.position.set(-0.25, 1.5, 0.14);
    skull.rotation.set(0.25, Math.PI / 2, 0);
    skull.scale.setScalar(1.35);
    const head = mesh(new THREE.SphereGeometry(0.2, 12, 8), bone, 0, 0, 0);
    head.scale.set(1.2, 0.7, 1);
    skull.add(head);
    // el hocico largo, que se afina hacia la punta
    const snout = mesh(cylGeo(0.05, 0.11, 0.66, 8), bone, 0, -0.03, 0.38, Math.PI / 2, 0, 0);
    snout.scale.set(1.25, 1, 0.55);
    skull.add(snout);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.08, 0.05);
    jaw.add(mesh(boxGeo(0.24, 0.05, 0.64), bone, 0, 0, 0.3));
    skull.add(jaw);
    const eyeMat = mat('skullEye', () => new THREE.MeshBasicMaterial({ color: 0x0a120a, toneMapped: false }));
    const eyes = [-1, 1].map((s) => {
      const e = mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat.clone(), s * 0.11, 0.08, 0.1);
      skull.add(e);
      return e;
    });
    const toothMat = mat('skullTooth', () => new THREE.MeshStandardMaterial({ color: 0xe8dfc4, roughness: 0.4, emissive: 0x6aff8a, emissiveIntensity: 0 }));
    const need = U.need || 8;
    const teeth = [];
    for (let i = 0; i < need; i++) {
      const s = i % 2 ? 1 : -1;
      const t = mesh(new THREE.ConeGeometry(0.018, 0.07, 6), toothMat.clone(), s * 0.11, -0.08, 0.15 + Math.floor(i / 2) * 0.13, Math.PI, 0, 0);
      skull.add(t);
      teeth.push(t);
    }
    grp.add(skull);
    this.skull = { grp, skull, jaw, eyes, teeth, snap: 0 };
    this.stationPos = new THREE.Vector3();
    skull.updateMatrixWorld(true);
    grp.updateMatrixWorld(true);
    skull.getWorldPosition(this.stationPos);
    this.huntPos = new THREE.Vector3(x, y, z);
    g.world.addBox([x - 1.2, y, z - 0.2, x + 1.2, y + 2.6, z + 0.2], { kind: 'prop' });
    this.stationItem(
      new THREE.Vector3(x + Math.sin(U.rot || 0) * 0.5, y + 1.2, z + Math.cos(U.rot || 0) * 0.5),
      2.3,
      () => {
        const st = this.st;
        if (st.stage === 'hunt' && !this.done) return { text: `${st.n}/${need}`, noCost: true, info: true };
        return this.idlePrompt('tocar el cráneo con el escudo');
      },
      () => {
        if (this.st.stage !== 'idle' || this.done || !g.player.shield) return false;
        this.ask({ k: 'place' });
        return true;
      },
    );
  }

  updateSkull(dt) {
    const g = this.g;
    const st = this.st;
    const S = this.skull;
    const hunt = st.stage === 'hunt' && !this.done;
    S.snap = Math.max(0, S.snap - dt * 5);
    const open = hunt ? 0.25 + Math.sin(g.time * 2) * 0.05 : 0.08;
    S.jaw.rotation.x = open * (1 - S.snap);
    const eye = hunt ? 0.6 + Math.sin(g.time * 3) * 0.3 : this.done ? 0 : 0.05;
    for (const e of S.eyes) e.material.color.setRGB(0.25 * eye, 1.6 * eye, 0.45 * eye);
    S.teeth.forEach((t, i) => {
      t.material.emissiveIntensity = i < st.n || this.done ? (this.done ? 0.3 : 1.6) : 0;
    });
    S.skull.rotation.z = Math.sin(g.time * 0.9) * 0.04;
    // los huesos que vuelan de los muertos al cráneo
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / 0.7;
      const k = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, this.stationPos, k);
      f.obj.position.y += Math.sin(k * Math.PI) * 1.4;
      f.obj.rotation.x += dt * 14;
      f.obj.rotation.y += dt * 9;
      if (k >= 1) {
        f.obj.removeFromParent();
        this.flying.splice(i, 1);
        S.snap = 1;
        sfxClack(g.audio, this.stationPos);
        g.fx.sparkle(this.stationPos, [0.4, 1, 0.55], 6, 0.4);
        g.fx.flash(this.stationPos, 0x6aff8a, 8, 0.2, 6);
      }
    }
  }

  // ---------------- torre: la pava del fogón ----------------
  buildPava() {
    const g = this.g;
    const M = this.M;
    const U = this.U;
    const [x, z] = U.pos;
    const y = this.floorY(x, z, U.y);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = U.rot || 0;
    this.root.add(grp);
    // el trípode de hierro y la cadena
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      grp.add(mesh(cylGeo(0.022, 0.022, 1.9, 6), M.iron, Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45, Math.sin(a) * 0.24, 0, -Math.cos(a) * 0.24));
    }
    for (let i = 0; i < 4; i++) grp.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 5, 10), M.iron, 0, 1.72 - i * 0.055, 0, 0, i % 2 ? Math.PI / 2 : 0, 0));
    // la pava grande, tiznada
    const pava = new THREE.Group();
    pava.position.y = 0.95;
    const body = mesh(new THREE.SphereGeometry(0.34, 18, 12), M.black || M.iron, 0, 0, 0);
    body.scale.set(1, 0.72, 1);
    pava.add(body);
    pava.add(mesh(cylGeo(0.3, 0.34, 0.08, 18), M.black || M.iron, 0, 0.2, 0));
    const spout = new THREE.Group();
    spout.position.set(0.3, 0.02, 0);
    spout.rotation.z = -0.85;
    spout.add(mesh(cylGeo(0.035, 0.065, 0.36, 10), M.black || M.iron, 0, 0.18, 0));
    const vent = new THREE.Object3D();
    vent.position.y = 0.38;
    spout.add(vent);
    pava.add(spout);
    pava.add(mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 20, Math.PI), M.iron, 0, 0.26, 0, 0, Math.PI / 2, 0));
    grp.add(pava);
    // la tapa: el escudo, acostado arriba
    const lid = new THREE.Group();
    lid.position.y = 1.2;
    grp.add(lid);
    const holder = new THREE.Group();
    holder.rotation.x = -Math.PI / 2;
    holder.scale.setScalar(1.05);
    lid.add(holder);
    const S = this.stationShield(holder);
    S.obj.visible = false;
    this.station = S;
    this.pava = { grp, pava, lid, vent, fireT: 0, rattleT: 0, whistle: 0, pop: 0 };
    g.world.addBox([x - 0.5, y, z - 0.5, x + 0.5, y + 1.6, z + 0.5], { kind: 'prop' });
    this.stationPos = new THREE.Vector3(x, y + 1.25, z);
    this.stationItem(
      new THREE.Vector3(x, y + 1.1, z),
      2.4,
      () => {
        const st = this.st;
        const need = this.U.need || 3;
        if (st.stage === 'boil') {
          if (st.h >= 1) return { text: 'cebar', noCost: true, hold: true };
          return { text: `${st.c}/${need}`, noCost: true, info: true };
        }
        if (st.stage === 'ready') return { text: 'agarrar el escudo', noCost: true };
        return this.idlePrompt('tapar la pava con el escudo');
      },
      () => {
        const st = this.st;
        if (st.stage === 'boil' && st.h >= 1) {
          this.ask({ k: 'cebar' });
          return true;
        }
        return this.useStation();
      },
      { holdTime: 1.2 },
    );
  }

  updatePava(dt) {
    const g = this.g;
    const st = this.st;
    const P = this.pava;
    const at = this.stationPos;
    if (this.isHost() && st.stage === 'boil' && st.h < 1) {
      // hierve si hay alguien cerca cuidando el fuego
      let near = false;
      for (const pl of this.players()) {
        if (Math.hypot(pl.pos.x - at.x, pl.pos.z - at.z) < 4.5 && Math.abs(pl.pos.y - (at.y - 1.25)) < 2) near = true;
      }
      st.h = near ? Math.min(1, st.h + dt / (this.U.secs || 9)) : Math.max(0, st.h - dt / 30);
      this.sendT -= dt;
      if (st.h >= 1 || this.sendT <= 0) {
        this.sendT = 0.5;
        this.tell({ k: 'st', h: +st.h.toFixed(3) });
      }
    }
    const boil = st.stage === 'boil';
    const h = boil ? st.h : 0;
    // el fuego abajo
    if (boil || st.stage === 'ready') {
      P.fireT -= dt;
      if (P.fireT <= 0) {
        P.fireT = 0.06;
        g.fx.fire(tmpV.set(at.x + (Math.random() - 0.5) * 0.4, at.y - 1.15, at.z + (Math.random() - 0.5) * 0.4), 0.3, 1);
      }
    }
    // vapor del pico y la tapa que baila
    if (boil && h > 0.15 && Math.random() < dt * 14 * h) {
      P.vent.getWorldPosition(tmpV2);
      g.fx.steam(tmpV2, 1, 0.15 + h * 0.3);
    }
    const rattle = boil && h > 0.6 ? (h - 0.6) / 0.4 : 0;
    P.lid.rotation.x = Math.sin(g.time * 31) * 0.05 * rattle;
    P.lid.rotation.z = Math.cos(g.time * 27) * 0.05 * rattle;
    P.pop = Math.max(0, P.pop - dt);
    const popK = P.pop > 0 ? Math.sin((1 - P.pop / 1.2) * Math.PI) : 0;
    P.lid.position.y = 1.2 + rattle * Math.abs(Math.sin(g.time * 23)) * 0.02 + popK * 1.1;
    this.station.obj.parent.rotation.z = P.pop > 0 ? (1 - P.pop / 1.2) * Math.PI * 4 : 0;
    if (rattle > 0) {
      P.rattleT -= dt;
      if (P.rattleT <= 0) {
        P.rattleT = 0.12 + Math.random() * 0.1;
        sfxClang(g.audio, at, 0.15);
      }
    }
    // el silbido: mientras está lista para cebar
    const whistle = boil && h >= 1;
    if (whistle && !P.whistling) {
      P.whistling = true;
      P.whistleT = 0;
    }
    if (!whistle) P.whistling = false;
    if (P.whistling) {
      P.whistleT -= dt;
      if (P.whistleT <= 0) {
        P.whistleT = 1.4;
        g.audio.kettle?.(at, 1.5);
      }
    }
    if (this.station.obj.visible) this.station.show(st.stage === 'ready' ? 1 : st.c / (this.U.need || 3));
  }

  onCebar() {
    const g = this.g;
    const at = this.stationPos;
    if (!at) return;
    for (let i = 0; i < 5; i++) g.fx.steam(tmpV.set(at.x, at.y + i * 0.25, at.z).clone(), 5, 0.6);
    sfxSteam(g.audio, at, 1.3);
    g.audio.pour?.(0.8);
    if (this.st.stage === 'ready') this.pava.pop = 1.2;
  }

  // ---------------- castillo: las brasas y el yunque ----------------
  updateForge(dt) {
    const g = this.g;
    const s = g.player.shield;
    if (!s || s.up || this.done) return;
    if (s.hot) return;
    const trap = this.trap();
    const p = g.player;
    let heating = false;
    if (trap?.state === 'on' && p.shieldFront) {
      const [x0, z0, x1, z1] = trap.def.rect;
      const fx = p.pos.x - Math.sin(p.yaw) * 0.9;
      const fz = p.pos.z - Math.cos(p.yaw) * 0.9;
      heating = fx > x0 - 0.4 && fx < x1 + 0.4 && fz > z0 - 0.4 && fz < z1 + 0.4;
    }
    if (heating) {
      s.heat = Math.min(1, (s.heat || 0) + dt / 3.5);
      this.emberT = (this.emberT || 0) - dt;
      if (this.emberT <= 0) {
        this.emberT = 0.1;
        g.fx.sparks(tmpV.set(p.pos.x - Math.sin(p.yaw) * 0.8, p.pos.y + 0.9, p.pos.z - Math.cos(p.yaw) * 0.8), 0.5, { x: 0, y: 1, z: 0 }, [1, 0.5, 0.15]);
      }
      this.sizzleT = (this.sizzleT || 0) - dt;
      if (this.sizzleT <= 0) {
        this.sizzleT = 0.7;
        sfxSizzle(g.audio, null, 0.8, 0.5 + s.heat);
      }
      if (s.heat >= 1) this.giveHot('forge');
    } else s.heat = Math.max(0, (s.heat || 0) - dt / 8);
  }

  // Un escudazo (weapons/shieldHand): el yunque del castillo.
  onBash(origin, fwd) {
    const g = this.g;
    if (this.kind !== 'forge') return false;
    const [ax, az] = this.U.anvil;
    const dx = ax - origin.x;
    const dz = az - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > 2 || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.35) return false;
    const ay = g.world.floorAt(ax, az, origin.y) + 0.8;
    const at = tmpV.set(ax, ay, az).clone();
    const s = g.player.shield;
    const hot = s?.hot?.kind === 'forge';
    sfxClang(g.audio, at, hot ? 1.4 : 0.8);
    g.fx.sparks(at, hot ? 4 : 1.2, { x: -fwd.x, y: 1.2, z: -fwd.z }, [1, 0.65, 0.25]);
    if (!hot) return true;
    s.hot.strikes++;
    g.fx.flash(at, 0xff8a3a, 22, 0.25, 9);
    g.fx.addShake(0.2);
    if (s.hot.strikes >= 3) {
      s.hot = null;
      s.heat = 0;
      g.fx.steam(at, 14, 0.7);
      this.ask({ k: 'done' });
    }
    return true;
  }

  // ---------------- lo que va a matar ----------------
  // Un muerto (Zombies.kill, en el anfitrión): el boyero y el cráneo.
  onKill(z, info = {}) {
    if (!this.U || !this.isHost()) return;
    const st = this.st;
    if (this.kind === 'fence' && st.stage === 'hung' && info.type === 'chain') {
      const trap = this.trap();
      if (!trap) return;
      const [x0, z0, x1, z1] = trap.def.rect;
      if (z.pos.x < x0 - 0.5 || z.pos.x > x1 + 0.5 || z.pos.z < z0 - 0.5 || z.pos.z > z1 + 0.5) return;
      const n = st.n + 1;
      const need = this.U.need || 10;
      this.tell({ k: 'kill', n, x: +z.pos.x.toFixed(2), y: +((z.pos.y || 0) + 1).toFixed(2), z: +z.pos.z.toFixed(2) });
      if (n >= need) {
        this.tell({ k: 'st', stage: 'ready', n });
        this.tell({ k: 'done', by: st.by, give: 0 });
      } else this.tell({ k: 'st', n });
    } else if ((this.kind === 'skull' || this.kind === 'gorriti') && st.stage === 'hunt' && !this.done && info.type === 'bash') {
      const H = this.huntPos;
      if (Math.hypot(z.pos.x - H.x, z.pos.z - H.z) > (this.U.r || 10)) return;
      const n = st.n + 1;
      const need = this.U.need || 8;
      this.tell({ k: 'kill', n, x: +z.pos.x.toFixed(2), y: +((z.pos.y || 0) + 1).toFixed(2), z: +z.pos.z.toFixed(2) });
      this.tell({ k: 'st', n });
      if (n >= need) this.tell({ k: 'done', by: info.by ?? this.myId(), give: 1 });
    }
  }

  onKillFx(m) {
    const g = this.g;
    this.st.n = m.n;
    const from = new THREE.Vector3(m.x, m.y, m.z);
    if (this.kind === 'fence') {
      g.fx.lightning(from, this.stationPos.clone(), 0xbfe4ff, 0.25);
      g.fx.flash(this.stationPos, 0x8ac8ff, 14, 0.2, 8);
      g.audio.zap?.(this.stationPos);
    } else if (this.kind === 'skull') {
      const bone = mat('flyBone', () => new THREE.MeshStandardMaterial({ color: 0xe0d4b4, roughness: 0.5, emissive: 0x3aff6a, emissiveIntensity: 0.6 }));
      const obj = mesh(boxGeo(0.12, 0.03, 0.08), bone, 0, 0, 0);
      obj.castShadow = false;
      this.root.add(obj);
      this.flying.push({ obj, from, t: 0 });
      g.fx.sparkle(from, [0.4, 1, 0.55], 4, 0.3);
    } else if (this.kind === 'gorriti') gorritiKillFx(this, from);
  }

  // ---------------- lo que hace el escudo mejorado ----------------
  players() {
    const g = this.g;
    const out = [];
    if (g.player.alive && !g.player.downed) out.push({ id: this.myId(), pos: g.player.pos });
    for (const r of g.net?.remote?.values() || []) if (!r.dead && !r.downed && r.pos) out.push({ id: r.id, pos: r.pos });
    return out;
  }

  // El escudo frenó un golpe (Activities.shieldHit): src es el zombie que pegó
  // (el de esta compu; el invitado lo manda por su número).
  onBlock(from, src) {
    const g = this.g;
    const s = g.player.shield;
    if (!s?.up || !this.U) return;
    const zi = src && !src.boss ? src.id & 0xffff : null;
    const p = g.player.pos;
    const dx = (from?.x ?? p.x) - p.x;
    const dz = (from?.z ?? p.z) - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const at = tmpV.set(p.x + (dx / d) * 0.6, p.y + 1.1, p.z + (dz / d) * 0.6);
    switch (this.U.prop) {
      case 'push':
        if (zi != null) this.fx(zi, 'push', { dx: +(dx / d).toFixed(2), dz: +(dz / d).toFixed(2) });
        g.fx.sparks(at, 1, { x: dx / d, y: 0.4, z: dz / d });
        break;
      case 'zap':
        if (zi != null) this.fx(zi, 'zap');
        if (from) g.fx.lightning(at.clone(), new THREE.Vector3(from.x, p.y + 1.2, from.z), 0x9ad0ff, 0.15);
        g.audio.zap?.(at);
        break;
      case 'chain':
        if (zi != null) this.fx(zi, 'chain');
        break;
      case 'rebote':
        if (zi != null) this.fx(zi, 'rebote', { dx: +(dx / d).toFixed(2), dz: +(dz / d).toFixed(2) });
        g.fx.flash(at, 0x9cd0ff, 12, 0.18, 6);
        g.fx.sparkle(at, [0.6, 0.85, 1], 8, 0.5);
        sfxClang(g.audio, at.clone(), 0.6);
        break;
      case 'steam': {
        if ((s.steamT || 0) > g.time) break;
        s.steamT = g.time + 5;
        const dir = { dx: +(dx / d).toFixed(2), dz: +(dz / d).toFixed(2) };
        this.steamJet(p.x, p.y, p.z, dir.dx, dir.dz);
        this.fx(null, 'steam', { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ...dir });
        break;
      }
      case 'blazon':
        s.charge = Math.min(5, (s.charge || 0) + 1);
        if (s.charge === 5) {
          sfxFlame(g.audio, null);
          g.hud.toast('¡Llamarada lista!');
        }
        break;
      default:
    }
  }

  // Un escudazo le pegó a un zombie (weapons/shieldHand, en esta compu).
  onBashHit(z, fwd) {
    const g = this.g;
    const s = g.player.shield;
    const zi = z.boss ? null : z.id & 0xffff;
    if (zi != null) this.fx(zi, 'shove', { dx: +fwd.x.toFixed(2), dz: +fwd.z.toFixed(2) });
    if (s?.up && this.U?.prop === 'bite' && zi != null) this.fx(zi, 'bleed');
  }

  bashMult() {
    const s = this.g.player.shield;
    return s?.up && this.U?.prop === 'bite' ? 3 : 1;
  }

  // El escudazo con la llamarada cargada (el castillo).
  bashFlame(p, fwd) {
    const g = this.g;
    const s = g.player.shield;
    if (!s?.up || this.U?.prop !== 'blazon' || (s.charge || 0) < 5) return;
    s.charge = 0;
    this.flameJet(p.x, p.y, p.z, fwd.x, fwd.z);
    this.fx(null, 'flame', { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), dx: +fwd.x.toFixed(2), dz: +fwd.z.toFixed(2) });
  }

  steamJet(x, y, z, dx, dz) {
    const g = this.g;
    for (let i = 0; i < 7; i++) {
      const k = 0.4 + i * 0.5;
      g.fx.steam(tmpV.set(x + dx * k, y + 1.1, z + dz * k).clone(), 4, 0.25 + i * 0.08);
    }
    sfxSteam(g.audio, tmpV.set(x + dx, y + 1.2, z + dz).clone(), 1.2);
    g.audio.kettle?.(tmpV.set(x, y + 1.2, z).clone(), 0.5);
  }

  flameJet(x, y, z, dx, dz) {
    const g = this.g;
    for (let i = 0; i < 9; i++) {
      const k = 0.5 + i * 0.45;
      g.fx.fire(tmpV.set(x + dx * k, y + 1.1, z + dz * k).clone(), 0.2 + i * 0.07, 3);
    }
    g.fx.flash(tmpV.set(x + dx * 1.5, y + 1.2, z + dz * 1.5).clone(), 0xff7a2a, 30, 0.3, 10);
    sfxFlame(g.audio, tmpV.set(x + dx, y + 1.2, z + dz).clone());
  }

  // Un efecto sobre un zombie (o el vapor/la llamarada): lo aplica el anfitrión.
  fx(zi, e, d = {}) {
    const g = this.g;
    if (this.isHost()) this.applyFx(zi, e, d, this.myId());
    else g.net.net.send({ t: 'sup', k: 'fx', zi, fx: e, ...d });
  }

  findZ(zi) {
    const g = this.g;
    if (zi == null) return null;
    if (g.net) return g.net.findZombie(zi);
    for (const z of g.zombies.pool) if (z.active && (z.id & 0xffff) === zi) return z;
    return null;
  }

  // daño con los puntos para el que corresponde (como el fuego de Zombies)
  hurtZ(z, dmg, info, by) {
    const g = this.g;
    const remote = g.net?.host && by != null && by !== g.net.id;
    g.zombies.damage(z, dmg, { ...info, by, noPoints: remote });
    if (remote && g.zombies.lastPoints) g.net.pts.set(by, (g.net.pts.get(by) || 0) + g.zombies.lastPoints);
  }

  // ¿Se lo puede sacudir? (los perros, los jefes y los de las ventanas no)
  canReel(z) {
    return z && !z.dead && !z.boss && !z.dog && (z.state === 'chase' || z.state === 'attack' || z.state === 'reel');
  }

  reel(z, secs, vx = 0, vz = 0, state = 'reel') {
    this.g.zombies.setState(z, state);
    z.reelT = secs;
    z.reelV = { x: vx, z: vz };
  }

  applyFx(zi, e, d, by) {
    const g = this.g;
    const z = this.findZ(zi);
    switch (e) {
      case 'shove':
        if (this.canReel(z)) this.reel(z, 0.45, (d.dx || 0) * 3.2, (d.dz || 0) * 3.2);
        break;
      case 'push':
        if (this.canReel(z)) {
          this.reel(z, 0.95, (d.dx || 0) * 5.5, (d.dz || 0) * 5.5);
          this.tell({ k: 'zv', zi, fx: 'push' });
        }
        break;
      case 'rebote':
        // el golpe vuelve: lo tira para atrás y le duele lo que pegó
        if (!z || z.dead) break;
        this.hurtZ(z, 150 + z.maxHp * 0.06, { type: 'bullet', zone: 'torso', point: tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z).clone() }, by);
        if (this.canReel(z)) this.reel(z, 1.0, (d.dx || 0) * 6.5, (d.dz || 0) * 6.5);
        this.tell({ k: 'zv', zi, fx: 'rebote' });
        break;
      case 'zap':
        if (!z || z.dead) break;
        this.hurtZ(z, 120 + z.maxHp * 0.05, { type: 'bullet', zone: 'torso', zap: true, point: tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z).clone() }, by);
        if (this.canReel(z)) this.reel(z, 1.1, 0, 0, 'zapped');
        this.tell({ k: 'zv', zi, fx: 'zap' });
        break;
      case 'chain':
        if (!z || z.dead) break;
        z.chainT = z.boss ? 1.5 : 3;
        if (!this.chains.some((c) => c.z === z)) this.chains.push({ z, zi, t: z.chainT, host: true });
        this.tell({ k: 'zv', zi, fx: 'chain', s: z.chainT });
        break;
      case 'bleed':
        if (!z || z.dead) break;
        this.bleeds = this.bleeds.filter((b) => b.z !== z);
        this.bleeds.push({ z, zi, t: 3, tick: 0.5, by, host: true });
        this.tell({ k: 'zv', zi, fx: 'bleed' });
        break;
      case 'steam':
      case 'flame': {
        const flame = e === 'flame';
        const r = flame ? 4.5 : 3.8;
        const o = tmpV2.set(d.x, d.y, d.z);
        for (const { z: zz, d: dist } of g.zombies.inRadius(o, r)) {
          if (zz.dead || Math.abs((zz.pos.y || 0) - o.y) > 1.8) continue;
          const dot = ((zz.pos.x - o.x) * d.dx + (zz.pos.z - o.z) * d.dz) / (dist || 1);
          if (dot < (flame ? 0.5 : 0.6)) continue;
          const pt = new THREE.Vector3(zz.pos.x, (zz.baseY || 0) + 1.2, zz.pos.z);
          if (flame) {
            this.hurtZ(zz, 400 + zz.maxHp * 0.2, { type: 'bullet', zone: 'torso', elem: 'fire', point: pt }, by);
            if (!zz.dead && !zz.boss) {
              zz.burnT = 3;
              zz.burnBy = by;
            }
          } else {
            this.hurtZ(zz, 250 + zz.maxHp * 0.12, { type: 'scald', zone: 'torso', point: pt }, by);
            if (this.canReel(zz)) this.reel(zz, 0.6, d.dx * 3, d.dz * 3);
          }
        }
        // los demás lo ven (el que lo largó ya lo vio)
        this.tell({ k: 'zv', fx: e, x: d.x, y: d.y, z: d.z, dx: d.dx, dz: d.dz, by });
        break;
      }
      default:
    }
  }

  // Lo que se ve de los efectos en todas las compus.
  fxVisual(m) {
    const g = this.g;
    if ((m.fx === 'steam' || m.fx === 'flame') && m.by === this.myId()) return;
    if (m.fx === 'steam') return this.steamJet(m.x, m.y, m.z, m.dx, m.dz);
    if (m.fx === 'flame') return this.flameJet(m.x, m.y, m.z, m.dx, m.dz);
    const z = this.findZ(m.zi);
    if (!z) return;
    const at = tmpV.set(z.pos.x, (z.baseY || 0) + 1.1, z.pos.z);
    if (m.fx === 'push') {
      g.fx.dust?.(at, { x: 0, y: 1, z: 0 }, [0.5, 0.45, 0.4], 6);
      sfxClang(g.audio, at.clone(), 0.35);
    } else if (m.fx === 'rebote') {
      g.fx.sparkle(at, [0.6, 0.85, 1], 10, 0.6);
      g.fx.flash(at, 0x9cd0ff, 10, 0.2, 6);
    } else if (m.fx === 'zap') g.fx.electric(at, 12);
    else if (m.fx === 'chain') {
      if (!this.chains.some((c) => c.z === z && c.fx)) this.chains.push({ z, zi: m.zi, t: m.s || 3, fx: this.chainFx() });
      else this.chains.find((c) => c.z === z && c.fx).t = m.s || 3;
      g.audio.chain?.(at.clone());
    } else if (m.fx === 'bleed') {
      if (!this.bleeds.some((b) => b.z === z && !b.host)) this.bleeds.push({ z, zi: m.zi, t: 3, tick: 0, drips: true });
      g.fx.blood(at, { x: 0, y: 0.6, z: 0 }, 14, 1.2);
    }
  }

  // los grilletes de ánima que se le prenden a los tobillos y la cadena al piso
  chainFx() {
    const m = mat('chainGhost', () => new THREE.MeshBasicMaterial({ color: 0x7ab8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const grp = new THREE.Group();
    const ring = new THREE.TorusGeometry(0.1, 0.018, 5, 14);
    const link = new THREE.TorusGeometry(0.035, 0.009, 4, 8);
    for (const s of [-1, 1]) grp.add(mesh(ring, m, s * 0.12, 0.15, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) grp.add(mesh(link, m, 0.05 * Math.sin(i), 0.12, -0.08 - i * 0.07, 0, i % 2 ? Math.PI / 2 : 0, 0));
    grp.traverse((o) => {
      o.castShadow = false;
    });
    this.root.add(grp);
    return grp;
  }

  updateEffects(dt) {
    const g = this.g;
    for (let i = this.chains.length - 1; i >= 0; i--) {
      const c = this.chains[i];
      c.t -= dt;
      const z = c.z;
      const gone = !z.active || z.dead || c.t <= 0;
      if (c.host) {
        if (gone) z.chainT = 0;
        else z.chainT = c.t;
      }
      if (c.fx) {
        c.fx.visible = !gone;
        if (!gone) {
          c.fx.position.set(z.pos.x, z.baseY || 0, z.pos.z);
          c.fx.rotation.y = z.yaw || 0;
          c.fx.children[0].material.opacity = Math.min(0.75, c.t * 0.6);
        }
      }
      if (gone) {
        c.fx?.removeFromParent();
        this.chains.splice(i, 1);
      }
    }
    for (let i = this.bleeds.length - 1; i >= 0; i--) {
      const b = this.bleeds[i];
      b.t -= dt;
      const z = b.z;
      if (!z.active || z.dead || b.t <= 0) {
        this.bleeds.splice(i, 1);
        continue;
      }
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick = 0.5;
        const pt = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.1, z.pos.z);
        if (b.host) this.hurtZ(z, 40 + z.maxHp * 0.04, { type: 'bullet', zone: 'torso', point: pt }, b.by);
        g.fx.blood(pt, { x: 0, y: -0.3, z: 0 }, 5, 0.8);
        if (Math.random() < 0.6) g.fx.decal?.(1, { x: z.pos.x, y: (z.baseY || 0) + 0.02, z: z.pos.z }, { x: 0, y: 1, z: 0 }, 0.3 + Math.random() * 0.2);
      }
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.U) return;
    this.hookNet();
    const k = this.kind;
    if (k === 'press') this.updatePress(dt);
    else if (k === 'fence') this.updateFence(dt);
    else if (k === 'temper') this.updateTemper(dt);
    else if (k === 'skull') this.updateSkull(dt);
    else if (k === 'pava') this.updatePava(dt);
    else if (k === 'forge') this.updateForge(dt);
    else if (k === 'gorriti') updateGorriti(this, dt);
    this.updateHot(dt);
    this.updateEffects(dt);
  }

  dispose() {
    for (const c of this.chains) c.fx?.removeFromParent();
    this.chains = [];
    this.bleeds = [];
  }
}

function smooth(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
