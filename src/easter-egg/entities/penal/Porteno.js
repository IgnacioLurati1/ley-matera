import * as THREE from 'three';
import { EE, MAP_MODES } from '../../config/map';
import { PZ, PZ_PONCHOS, ponchoCss, copsFor, copsCap } from '../../config/porteno';
import { MAX_PLAYERS } from '../../net/Net';
import { KNIFE_MOVES, hozPose } from '../../weapons/Weapons';
import PzTareas from './pzTareas';
import PzEncierro, { visitTimes } from './pzEncierro';
import PzCuerpos, { faconOn, faconK } from './pzCuerpos';
import PzSabotaje from './pzSabotaje';
import { cineSnap } from '../../net/gauchoSkin';
import '../../ui/porteno.css';

// Porteño encubierto (el usuario, 2026-10-13): el Among Us de los primeros
// tiempos en Mate of the Dead. Se elige en el menú como Zombies gauchescos en
// los esteros (config/map.js MAP_MODES); en línea, de 4 a 10. Hace de easter
// egg (g.ee) y queda en g.pz para los pocos lugares que lo miran (Game,
// Avatars, Net, Lobby).
//  · Gauchos y uno o más policías disfrazados de gaucho (la sala elige
//    cuántos: config/porteno.js copsFor). Cada uno ve su papel al arrancar; los
//    policías se ven entre ellos con el nombre en rojo.
//  · Los gauchos hacen tareas por el penal (entities/penal/pzTareas.js) y
//    llenan la barra común. Los policías tienen las suyas de mentira.
//  · Nadie tiene mates ni armas. El policía mata con el facón de cerca, de
//    una, con espera; el facón se ve solo durante el tajo (en primera persona
//    y en su muñeco). El muerto queda tirado (pzCuerpos.js) y pasa a
//    espectador: mira libre o sigue a otro, no vota y no lo ve nadie.
//  · Un cuerpo reportado (F) o el botón rojo del medio del pabellón arman el
//    encierro (pzEncierro.js): todos a las celdas, se vota (el debate va por
//    Discord) y al más votado lo visita el Alcaide y le da un porrazo.
//  · Ganan los gauchos con la barra llena o si votan a todos los policías;
//    gana la policía cuando quedan tantos policías como gauchos.
// En línea lo decide el anfitrión (papeles, muertes, votos, barra) y manda el
// estado ('pee' {pz}); el papel, las tareas y la espera del facón van solo al
// que le tocan (net.to: nadie sabe quién es el policía mirando lo que le llega).
// Nada se guarda.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const KP = new Float32Array(7);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
// el tajo en el muñeco que ven los demás: lo que dura el de primera persona (así el golpe cae cuando cae el muerto)
const STAB_3P = 0.55;
// a cuánto se ve el tajo de otro (el anfitrión se lo manda solo a esos)
const SEE_STAB = 30;
// el mínimo y cuántos policías, solo para las pruebas
const minPlayers = () => (globalThis.__mduPorteñoMin > 0 ? globalThis.__mduPorteñoMin : PZ.minPlayers);

export default class Porteno {
  constructor(game) {
    this.g = game;
    game.pz = this;
    // (lo que los demás esperan de un easter egg: acá no hay pasos)
    this.step = 0;
    this.scene = null;
    this.fight = false;
    this.startPoints = 0;
    const W = game.world;
    this.spots = EE.pz.spots.map(([x, z]) => new THREE.Vector3(x, W.floorAt(x, z, 5.5), z));
    this.btnPos = new THREE.Vector3(EE.pz.button[0], W.floorAt(EE.pz.button[0], EE.pz.button[1], 5.5), EE.pz.button[1]);
    // lo que decide el anfitrión (y manda a todos)
    this.phase = 'wait';
    this.P = new Map();
    this.bar = [0, 0];
    // (usuario 10-13: las dos opciones de la sala, las elige el anfitrión y llegan
    // a todos en el estado. bar: 'now' sube al terminar cada tarea, 'enc' solo al
    // empezar cada encierro; rv: 1 dice "X era/no era policía", 0 solo "X fue encerrado".)
    this.opts = { bar: 'now', rv: 1 };
    this.barSeen = [0, 0];
    this.btnT = PZ.buttonWait;
    this.meet = null;
    this.meetLeft = 0;
    this.meetT = 0;
    this.corpses = [];
    this.endInfo = null;
    this.syncT = 0;
    // lo del anfitrión que no sale de su compu
    this.H = { roles: new Map(), tasks: new Map(), cd: new Map(), votes: new Map(), settled: new Set(), privT: 0 };
    // lo de esta compu (el papel llega solo acá)
    this.role = null;
    this.mates = [];
    this.cd = 0;
    this.myVote = null;
    this.deadMe = false;
    this.started = false;
    this.seenTp = -1;
    this.stabs = new Map();
    this.swingT = -1;
    this.swingMove = 'tajo';
    this.follow = -1;
    this.tareas = new PzTareas(this);
    this.cuerpos = new PzCuerpos(game);
    this.enc = new PzEncierro(this);
    // (usuario 10-13) los sabotajes del policía y la telesilla gratis
    // (entities/penal/pzSabotaje.js)
    this.sab = new PzSabotaje(this);
    this.buildButton();
    this.buildHud();
    // la luz prendida y todo abierto: no hay nada que comprar
    game.world.setPower(true);
    game.interact.setPowerVisuals(true);
  }

  // ---------------- para los demás archivos ----------------
  myId() {
    return this.g.net?.id ?? 0;
  }
  // (los de la sala: la lista de la sala, no los muñecos que ya llegaron —al
  // arrancar, los de los invitados todavía no se movieron)
  ids() {
    const g = this.g;
    if (!g.net) return [0];
    return [...new Set([this.myId(), ...(g.net.net?.players?.keys() || []), ...g.net.remote.keys()])];
  }
  nameOf(id) {
    const g = this.g;
    return g.net ? g.net.nameOf(id) : 'Vos';
  }
  posOf(id) {
    const g = this.g;
    if (id === this.myId()) return g.player.pos;
    return g.net?.remote.get(id)?.pos || null;
  }
  isHost() {
    return !this.g.net?.guest;
  }
  // (Player/Zombies: nadie se lastima con nada)
  safe() {
    return true;
  }
  noTarget() {
    return true;
  }
  alive(id = this.myId()) {
    const s = this.P.get(id);
    return !!s && !!s.alive && !!s.inGame;
  }
  // un compañero policía (solo lo sabe otro policía)
  isMate(id) {
    return this.role === 'cop' && (id === this.myId() || this.mates.includes(id));
  }
  canVote() {
    return this.meet?.st === 'vote' && this.alive() && this.myVote == null;
  }
  inScene() {
    return !!this.scene;
  }

  // net/Avatars (los muñecos de la partida): los muertos y los espectadores no
  // se ven; en el encierro, tampoco (están los presos de las celdas); la mano
  // vacía para todos.
  avatar(a, r) {
    if (!a.people?.team) return false;
    const s = this.P.get(r.id);
    // (en el encierro, recién bajo el negro: antes se veían desaparecer)
    if (!s || !s.alive || !s.inGame || (this.scene && this.enc.setup)) {
      a.group.visible = false;
      a.tag.visible = false;
      return true;
    }
    this.g.net?.wpn?.delete(r.id);
    return false;
  }
  // (usuario 10-13) El poncho de cada uno en este modo: uno de los 10 de
  // PZ_PONCHOS, el que repartió el anfitrión (null antes de arrancar: el de siempre).
  ponchoOf(id) {
    const s = this.P.get(id);
    return s && s.col != null ? PZ_PONCHOS[s.col % PZ_PONCHOS.length] : null;
  }

  // Pinta un muñeco (de la partida o un preso de pzCuerpos) con su poncho y su
  // nombre en ese color. Devuelve false si todavía no hay color.
  paint(a, id, name, mate = false) {
    const hex = this.ponchoOf(id);
    if (hex == null || !a) return false;
    if (a.pzCol !== hex) {
      a.pzCol = hex;
      a.M.poncho.color.set(hex).multiplyScalar(1.7);
    }
    if (a.tag && name) {
      const key = `${name}|${hex}|${mate ? 1 : 0}`;
      if (a.pzTagKey !== key || a.tag.material.map !== a.pzTagMap) {
        a.tag.material.map?.dispose();
        a.pzTagMap = tagTexture(name, ponchoCss(hex, 0.3), mate);
        a.tag.material.map = a.pzTagMap;
        a.tag.material.needsUpdate = true;
        a.pzTagKey = key;
      }
    }
    return true;
  }

  avatarLate(a, r) {
    if (!a.people?.team) return;
    a.hand.visible = false;
    if (a.gun) a.gun.visible = false;
    // el nombre: tapado por las paredes (no se ve a nadie a través), en rojo los compañeros policías
    if (!a.pzTag) {
      a.pzTag = true;
      a.tag.material.depthTest = true;
      a.tag.material.needsUpdate = true;
    }
    const red = this.isMate(r.id);
    // (10-13: con la partida empezada, el poncho y el nombre en el color de cada
    // uno; el compañero policía, con el nombre rodeado de rojo)
    if (this.paint(a, r.id, r.name, red)) a.tag.material.color.setRGB(1, 1, 1);
    else a.tag.material.color.setRGB(1, red ? 0.32 : 1, red ? 0.26 : 1);
    // sin la silueta de compañero a través de las paredes
    if (a.xray) {
      a.xray.opacity = 0;
      if (a.xOn) {
        a.xOn = false;
        for (const x of a.xparts) x.visible = false;
      }
    }
    const st = this.stabs.get(r.id);
    const k = st ? faconK((performance.now() - st) / 1000, STAB_3P) : 0;
    if (st && k <= 0 && performance.now() - st > STAB_3P * 1000) this.stabs.delete(r.id);
    faconOn(a, k);
    // (el extintor del incendio, en la mano: pzSabotaje)
    this.sab?.avatarLate(a, r);
  }

  // ---------------- el botón rojo ----------------
  // Un pedestal de hierro con una caja de madera y el botón colorado arriba,
  // con su tapa de bronce (en el medio del pabellón). El botón late despacio.
  buildButton() {
    const g = this.g;
    const p = this.btnPos;
    const root = new THREE.Group();
    root.position.copy(p);
    const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.8, roughness: 0.45 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.9, roughness: 0.35 });
    this.btnMat = new THREE.MeshStandardMaterial({ color: 0xd01a12, emissive: 0xff2010, emissiveIntensity: 0.6, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 16), iron);
    base.position.y = 0.04;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 10), iron);
    post.position.y = 0.48;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), wood);
    box.position.y = 0.96;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 20), brass);
    plate.position.y = 1.06;
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.btnMat);
    btn.scale.y = 0.62;
    btn.position.y = 1.07;
    this.btnTop = btn;
    for (const m of [base, post, box, plate, btn]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    g.scene.add(root);
    this.btnRoot = root;
    // (el halo colorado: de lejos se ve dónde está)
    this.btnHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xff3020, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.btnHalo.position.set(0, 1.12, 0);
    this.btnHalo.scale.setScalar(0.7);
    root.add(this.btnHalo);
    g.world.addBox([p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + 1.15, p.z + 0.3], { kind: 'prop' });
    this.btnPress = 0;
  }

  updateButton(dt) {
    const t = this.g.time;
    const ready = this.phase === 'play' && this.btnT <= 0;
    const k = ready ? 0.55 + Math.sin(t * 3.2) * 0.35 : 0.15;
    this.btnMat.emissiveIntensity += (k - this.btnMat.emissiveIntensity) * Math.min(1, dt * 6);
    this.btnHalo.material.opacity = 0.12 + this.btnMat.emissiveIntensity * 0.35;
    // apretado: se hunde y vuelve
    this.btnPress = Math.max(0, this.btnPress - dt * 2.5);
    this.btnTop.position.y = 1.07 - Math.sin(Math.min(1, this.btnPress) * Math.PI) * 0.035;
  }

  // ---------------- el panel ----------------
  buildHud() {
    const g = this.g;
    const el = document.createElement('div');
    el.className = 'mdu-pz';
    el.innerHTML = `<div class="mdu-pz__bar"><span>Tareas</span><b><i></i></b></div>
      <div class="mdu-pz__list"><p class="mdu-pz__role"></p><ul></ul></div>
      <div class="mdu-pz__knife"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l9-9 1.6 1.6L4.6 21.6z" fill="currentColor"/><path d="M12 11l7.5-7.5c.8 2.6.2 5.2-1.6 7L13.6 12.6z" fill="currentColor" opacity=".85"/></svg><b></b></div>
      <div class="mdu-pz__spec"></div>`;
    g.hud.root.appendChild(el);
    g.hud.root.classList.add('is-pz');
    this.hudEl = el;
    this.hudKey = '';
    const veil = document.createElement('div');
    veil.className = 'mdu-pz-veil';
    g.hud.root.appendChild(veil);
    this.veil = veil;
  }

  setVeil(color, to, secs) {
    const v = this.veil;
    v.style.transition = `opacity ${secs}s ease`;
    if (color) v.style.background = color;
    v.style.opacity = String(to);
  }

  updateHud() {
    const g = this.g;
    const el = this.hudEl;
    const [done, total] = this.barSeen;
    const k = total > 0 ? Math.min(1, done / total) : 0;
    const cd = Math.max(0, Math.ceil(this.cd));
    const f = this.follow >= 0 ? this.nameOf(this.follow) : '';
    const list = this.tareas.mine.map((m) => `${m.i}${m.done ? 1 : 0}`).join(',');
    const key = `${this.phase}|${k.toFixed(3)}|${this.role}|${list}|${cd}|${this.deadMe}|${f}|${!!this.scene}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    el.hidden = this.phase === 'wait' || this.phase === 'end';
    el.classList.toggle('is-meet', !!this.scene);
    el.classList.toggle('is-dead', this.deadMe);
    el.querySelector('.mdu-pz__bar i').style.width = `${(k * 100).toFixed(1)}%`;
    const cop = this.role === 'cop';
    el.classList.toggle('is-cop', cop);
    el.querySelector('.mdu-pz__role').textContent = this.deadMe ? 'Espectador' : cop ? 'Policía · para disimular' : this.role ? 'Gaucho · tus tareas' : '';
    const S = this.tareas.st;
    el.querySelector('.mdu-pz__list ul').innerHTML = this.deadMe
      ? ''
      : this.tareas.mine.map((m) => `<li class="${m.done ? 'is-done' : ''}"><b>${S[m.i].name}</b><span>${S[m.i].where}</span></li>`).join('');
    const kn = el.querySelector('.mdu-pz__knife');
    kn.hidden = !cop || this.deadMe;
    kn.classList.toggle('is-ready', cd <= 0);
    kn.querySelector('b').textContent = cd > 0 ? `${cd}` : 'Listo';
    const sp = el.querySelector('.mdu-pz__spec');
    sp.hidden = !this.deadMe || !!this.scene;
    sp.innerHTML = f ? `Siguiendo a <b>${esc(f)}</b><small>[Clic] Otro · [Espacio] Libre</small>` : 'Espectador<small>[Clic] Seguir a alguien</small>';
    g.hud.root.classList.toggle('is-pz-meet', !!this.scene);
  }

  // El papel al arrancar: un cartel en el medio que entra y se va solo.
  roleCard() {
    const g = this.g;
    this.cardEl?.remove();
    const cop = this.role === 'cop';
    const el = document.createElement('div');
    el.className = `mdu-pzrole${cop ? ' is-cop' : ''}`;
    const mates = cop && this.mates.length ? `<p class="mdu-pzrole__mates">Con ${this.mates.map((id) => `<b>${esc(this.nameOf(id))}</b>`).join(' y ')}</p>` : '';
    el.innerHTML = `<p class="mdu-pzrole__k">Porteño encubierto</p><h2>${cop ? 'Sos policía' : 'Sos gaucho'}</h2><p class="mdu-pzrole__sub">${cop ? 'Que no te descubran' : `Hacé tus tareas. ${this.copsN > 1 ? `Hay ${this.copsN} policías` : 'Hay un policía'} entre ustedes`}</p>${mates}`;
    g.hud.root.appendChild(el);
    this.cardEl = el;
    setTimeout(() => el.classList.add('is-out'), 3600);
    setTimeout(() => el.remove(), 4400);
    if (cop) g.audio?.hitThump?.(0.9);
    g.audio?.sting?.();
  }

  // Una línea grande en el medio (la revelación del encierro).
  bigLine(text, cls = '') {
    const g = this.g;
    const el = document.createElement('div');
    el.className = `mdu-pzline ${cls}`;
    el.textContent = text;
    g.hud.root.appendChild(el);
    setTimeout(() => el.classList.add('is-out'), 2400);
    setTimeout(() => el.remove(), 3100);
  }

  // ---------------- el anfitrión ----------------
  hostStart() {
    const H = this.H;
    const ids = this.ids();
    const pick = globalThis.__mduPorteñoPolicias > 0 ? globalThis.__mduPorteñoPolicias : this.g.pzCops || 'auto';
    const n = ids.length;
    const cops = globalThis.__mduPorteñoPolicias > 0 ? Math.min(n - 1, pick) : copsFor(n, pick);
    // (otra partida: el salto de lugar sigue contando)
    const prevTp = new Map([...this.P].map(([id, s]) => [id, s.tp || 0]));
    this.P.clear();
    H.roles.clear();
    H.tasks.clear();
    H.cd.clear();
    H.votes.clear();
    H.settled.clear();
    const order = shuffle([...ids]);
    order.forEach((id, i) => H.roles.set(id, i < cops ? 'cop' : 'gaucho'));
    const spots = shuffle(this.spots.map((_, i) => i));
    // (un poncho distinto por jugador, por orden de llegada: config/porteno PZ_PONCHOS)
    const byId = [...ids].sort((a, b) => a - b);
    ids.forEach((id, i) => {
      this.P.set(id, { alive: 1, inGame: 1, tp: (prevTp.get(id) || 0) + 1, spot: spots[i % spots.length], btn: 0, col: byId.indexOf(id) % PZ_PONCHOS.length });
      const list = shuffle(this.tareas.st.map((_, k) => k)).slice(0, PZ.tasks);
      H.tasks.set(id, { list, done: new Set() });
      if (H.roles.get(id) === 'cop') H.cd.set(id, PZ.firstCd);
    });
    this.phase = 'play';
    this.opts = { bar: this.g.pzBar === 'enc' ? 'enc' : 'now', rv: this.g.pzReveal === false ? 0 : 1 };
    this.bar = [0, (n - cops) * PZ.tasks];
    this.barSeen = [...this.bar];
    this.btnT = PZ.buttonWait;
    this.meet = null;
    this.corpses = [];
    this.endInfo = null;
    this.copsN = cops;
    this.sab?.reset();
    this.share({ k: 'start', n: cops });
    for (const id of ids) this.sendPriv(id);
  }

  // Lo de cada uno, solo a él: el papel, los compañeros policías, sus tareas y la espera del facón.
  sendPriv(id) {
    const H = this.H;
    const role = H.roles.get(id);
    if (!role) return;
    const T = H.tasks.get(id);
    const data = {
      r: role,
      m: role === 'cop' ? [...H.roles].filter(([o, r]) => r === 'cop' && o !== id).map(([o]) => o) : [],
      t: T ? T.list : [],
      d: T ? [...T.done] : [],
      c: role === 'cop' ? +(H.cd.get(id) || 0).toFixed(2) : 0,
      n: [...H.roles.values()].filter((r) => r === 'cop').length,
      // (la espera de los sabotajes: solo a los policías)
      sw: role === 'cop' ? this.sab?.privCd() : undefined,
    };
    if (id === this.myId()) this.applyPriv(data);
    else this.g.net?.net.to(id, { t: 'ev', e: 'pee', pzp: data });
  }

  hostTick(dt) {
    const H = this.H;
    const ids = this.ids();
    let changed = false;
    // los que entran tarde (miran) y los que se van
    for (const id of ids) {
      if (this.P.has(id)) continue;
      // (el que entra tarde: el primer poncho libre)
      const used = new Set([...this.P.values()].map((s) => s.col));
      let col = 0;
      while (used.has(col) && col < PZ_PONCHOS.length - 1) col++;
      this.P.set(id, { alive: 0, inGame: 0, tp: 0, spot: 0, btn: 1, col });
      changed = true;
    }
    let gone = false;
    for (const id of [...this.P.keys()]) {
      if (ids.includes(id)) continue;
      const s = this.P.get(id);
      this.P.delete(id);
      gone = true;
      // (sus tareas pendientes ya no cuentan)
      if (H.roles.get(id) === 'gaucho' && s.alive) this.settle(id);
      H.roles.delete(id);
      H.votes.delete(id);
      changed = true;
    }
    if (this.phase === 'play') {
      this.btnT = Math.max(0, this.btnT - dt);
      for (const [id, c] of H.cd) if (c > 0) H.cd.set(id, Math.max(0, c - dt));
      if (changed && this.checkWin(gone ? 'salieron' : null)) return;
    } else if (this.phase === 'meet') {
      if (changed) {
        // (alguien se fue en el medio: los votos de los que quedan)
        this.meet.voted = this.meet.voted.filter((id) => this.P.has(id));
      }
      if (this.hostMeet(dt)) return;
    }
    // lo de cada uno, de nuevo cada tanto (por si se perdió al cargar)
    H.privT -= dt;
    if (H.privT <= 0 && this.phase !== 'wait') {
      H.privT = 2.5;
      for (const id of ids) this.sendPriv(id);
    }
    this.syncT -= dt;
    if (changed || this.syncT <= 0) this.share(null);
  }

  // (anfitrión) Las tareas pendientes de un gaucho que ya no juega salen de la
  // barra (cuando su muerte es pública: en el encierro, o si se va).
  settle(id) {
    const H = this.H;
    if (H.settled.has(id) || H.roles.get(id) !== 'gaucho') return;
    H.settled.add(id);
    const T = H.tasks.get(id);
    const left = T ? PZ.tasks - T.done.size : PZ.tasks;
    this.bar[1] = Math.max(this.bar[0], this.bar[1] - left);
  }

  aliveBy(role) {
    let n = 0;
    for (const [id, s] of this.P) if (s.alive && s.inGame && this.H.roles.get(id) === role) n++;
    return n;
  }

  // (anfitrión) ¿Se terminó? Devuelve true si terminó.
  checkWin(why = null) {
    if (this.phase === 'end') return true;
    const cops = this.aliveBy('cop');
    const gauchos = this.aliveBy('gaucho');
    if (cops === 0) return this.finish('g', why || 'voto');
    if (cops >= gauchos) return this.finish('p', 'muertes');
    if (this.bar[1] > 0 && this.bar[0] >= this.bar[1]) return this.finish('g', 'tareas');
    return false;
  }

  finish(win, why) {
    const H = this.H;
    this.phase = 'end';
    this.meet = null;
    this.endInfo = {
      w: win,
      y: why,
      b: [...this.P].filter(([, s]) => s.inGame).map(([id, s]) => [id, this.nameOf(id), H.roles.get(id) === 'cop' ? 1 : 0, s.alive ? 1 : 0]),
    };
    this.share({ k: 'end' });
    return true;
  }

  // (anfitrión) Una tarea hecha: suma si es de un gaucho vivo y es suya.
  hostTask(id, i) {
    const H = this.H;
    const T = H.tasks.get(id);
    if (this.phase !== 'play' || !T || !T.list.includes(i) || T.done.has(i) || !this.alive(id)) return;
    T.done.add(i);
    if (H.roles.get(id) !== 'gaucho') return;
    this.bar[0]++;
    // (la victoria por barra se mira acá, con la barra de verdad, también con la
    // opción "En los encierros": como en Among Us, la última tarea termina la
    // partida en el momento; lo que espera al encierro es solo lo que se muestra)
    if (this.checkWin()) return;
    this.share({ k: 'task' });
  }

  // (anfitrión) Un policía tajeó: lo ven los que lo tienen a la vista.
  hostStab(id) {
    if (this.H.roles.get(id) !== 'cop' || !this.alive(id)) return;
    const pa = this.posOf(id);
    if (!pa) return;
    const W = this.g.world;
    for (const o of this.ids()) {
      if (o === id) continue;
      const po = this.posOf(o);
      if (!po) continue;
      const d = Math.hypot(po.x - pa.x, po.z - pa.z);
      if (d > SEE_STAB) continue;
      // (con una pared en el medio, no se ve)
      const eye = tmpV.set(po.x, po.y + 1.6, po.z);
      const dir = tmpW.set(pa.x, pa.y + 1.3, pa.z).sub(eye);
      const len = dir.length();
      if (len > 0.5 && W.raycast(eye, dir.divideScalar(len), len) < len - 0.4) continue;
      if (o === this.myId()) this.applyFx({ k: 'stab', id });
      else this.g.net?.net.to(o, { t: 'ev', e: 'pee', fx: { k: 'stab', id } });
    }
  }

  // (anfitrión) El tajo de `by` le llegó a `v`.
  hostKill(by, v) {
    const H = this.H;
    if (this.phase !== 'play' || H.roles.get(by) !== 'cop' || H.roles.get(v) !== 'gaucho' || !this.alive(by) || !this.alive(v)) return;
    if ((H.cd.get(by) || 0) > 0.05) return;
    const pa = this.posOf(by);
    const pv = this.posOf(v);
    if (!pa || !pv || Math.hypot(pa.x - pv.x, pa.z - pv.z) > PZ.reach + PZ.lag || Math.abs(pa.y - pv.y) > 2) return;
    this.P.get(v).alive = 0;
    H.cd.set(by, PZ.killCd);
    this.sendPriv(by);
    const r = v === this.myId() ? { yaw: this.g.player.yaw } : this.g.net?.remote.get(v);
    const yaw = r?.yaw || 0;
    this.corpses.push([v, +pv.x.toFixed(2), +pv.y.toFixed(2), +pv.z.toFixed(2), +yaw.toFixed(3)]);
    this.share({ k: 'kill', v, x: pv.x, y: pv.y, z: pv.z, yaw, dx: pv.x - pa.x, dz: pv.z - pa.z });
    this.checkWin();
  }

  // (anfitrión) Reporte de un cuerpo o el botón.
  hostReport(by, body) {
    if (this.phase !== 'play' || !this.alive(by)) return;
    const c = this.corpses.find((x) => x[0] === body);
    const p = this.posOf(by);
    if (!c || !p || Math.hypot(p.x - c[1], p.z - c[3]) > PZ.reportR + PZ.lag) return;
    this.startMeet('rep', by, body);
  }
  hostButton(by) {
    const s = this.P.get(by);
    const p = this.posOf(by);
    if (this.phase !== 'play' || !this.alive(by) || s.btn || this.btnT > 0 || !p) return;
    // (con el incendio no anda, como en Among Us con un sabotaje grave)
    if (this.sab?.fireOn() || this.sab?.burning()) return;
    if (Math.hypot(p.x - this.btnPos.x, p.z - this.btnPos.z) > PZ.buttonR + PZ.lag) return;
    s.btn = 1;
    this.startMeet('btn', by, -1);
  }

  startMeet(kind, by, body) {
    const H = this.H;
    this.phase = 'meet';
    H.votes.clear();
    // las muertes ya son públicas: sus tareas pendientes salen de la barra
    for (const [id, s] of this.P) if (s.inGame && !s.alive) this.settle(id);
    // (opción "En los encierros": la barra que se ve se pone al día recién acá)
    this.barSeen = [...this.bar];
    // cada vivo a una celda (si son más que las celdas, de a dos)
    const alive = [...this.P].filter(([, s]) => s.alive && s.inGame).map(([id]) => id);
    const n = Math.max(1, this.enc.count);
    const order = shuffle(this.enc.cells.map((_, i) => i));
    const cells = alive.map((id, i) => [id, order[i % n]]);
    this.meet = { kind, by, body, st: 'gather', left: PZ.gather, cells, voted: [], counts: null, skip: 0, out: -1, vis: null, cp: -1 };
    this.share({ k: 'meet' });
  }

  // (anfitrión) Los pasos del encierro. Devuelve true si terminó la partida.
  hostMeet(dt) {
    const m = this.meet;
    const H = this.H;
    m.left -= dt;
    if (m.st === 'vote') {
      const alive = [...this.P].filter(([, s]) => s.alive && s.inGame).map(([id]) => id);
      if (alive.every((id) => H.votes.has(id)) && m.left > PZ.voteAll) {
        m.left = PZ.voteAll;
        this.share(null);
      }
    }
    if (m.left > 0) return false;
    if (m.st === 'gather') {
      m.st = 'vote';
      m.left = PZ.vote;
    } else if (m.st === 'vote') {
      // cuántos votos tuvo cada uno; va el que tiene más, si son más que los de Saltear y no hay empate
      const counts = new Map();
      let skip = 0;
      for (const [, v] of H.votes) {
        if (v < 0) skip++;
        else counts.set(v, (counts.get(v) || 0) + 1);
      }
      const list = [...counts].sort((a, b) => b[1] - a[1]);
      const top = list[0];
      const out = top && top[1] > skip && !(list[1] && list[1][1] === top[1]) ? top[0] : -1;
      m.counts = list;
      m.skip = skip;
      m.out = out;
      m.st = 'result';
      m.left = PZ.result;
    } else if (m.st === 'result') {
      const cell = m.cells.find(([id]) => id === m.out);
      if (m.out >= 0 && cell && this.alive(m.out)) {
        m.vis = { v: m.out, ci: cell[1], ...this.enc.pickStart(cell[1]) };
        m.st = 'visit';
        m.left = visitTimes(m.vis.walk).END;
      } else {
        m.st = 'back';
        m.left = PZ.back;
      }
    } else if (m.st === 'visit') {
      // ¿se terminó con el porrazo?
      if (this.checkWin()) return true;
      m.st = 'back';
      m.left = PZ.back;
    } else if (m.st === 'back') {
      this.endMeet();
      return false;
    }
    this.share({ k: 'step' });
    return false;
  }

  // (anfitrión) El porrazo del Alcaide (pzEncierro.hostAlcaide, en su segundo).
  hostHit(v) {
    const m = this.meet;
    if (!m || m.st !== 'visit' || !this.P.get(v)) return;
    this.P.get(v).alive = 0;
    m.cp = this.H.roles.get(v) === 'cop' ? 1 : 0;
    this.settle(v);
    this.share({ k: 'hit', v });
  }

  endMeet() {
    const H = this.H;
    // (alguien se fue en el medio del encierro: ¿quedó terminada?)
    if (this.checkWin('salieron')) return;
    this.phase = 'play';
    this.meet = null;
    this.corpses = [];
    this.btnT = PZ.buttonWait;
    for (const id of H.cd.keys()) H.cd.set(id, PZ.killCd);
    this.share({ k: 'back' });
    for (const [id, r] of H.roles) if (r === 'cop') this.sendPriv(id);
  }

  hostVote(by, v) {
    const m = this.meet;
    const H = this.H;
    if (!m || m.st !== 'vote' || !this.alive(by) || H.votes.has(by)) return;
    if (v >= 0 && !this.alive(v)) return;
    H.votes.set(by, v < 0 ? -1 : v);
    m.voted.push(by);
    this.share({ k: 'voted', id: by });
  }

  pack() {
    const m = this.meet;
    // (la barra que se manda es la que se ve: con "En los encierros" no viaja la de
    // verdad; al final, llena como quedó)
    if (this.opts.bar !== 'enc' || this.phase === 'end') this.barSeen = [...this.bar];
    // (sin revelar, ningún invitado recibe si el votado era policía)
    const cp = this.opts.rv ? m?.cp : -1;
    return {
      ph: this.phase,
      b: this.barSeen,
      o: this.opts,
      bt: +this.btnT.toFixed(2),
      p: [...this.P].map(([id, s]) => [id, s.alive, s.inGame, s.tp, s.spot, s.btn, s.col]),
      c: this.corpses,
      m: m ? { k: m.kind, by: m.by, bd: m.body, st: m.st, l: +m.left.toFixed(2), c: m.cells, v: m.voted, n: m.counts, s: m.skip, o: m.out, vi: m.vis, cp } : null,
      e: this.endInfo,
    };
  }

  // (anfitrión) Manda el estado (y lo que pasó) y lo aplica acá.
  share(fx) {
    this.syncT = 1;
    const st = this.pack();
    this.apply(st, fx);
    this.g.net?.event('pee', { pz: st, fx: fx || undefined });
  }

  // Lo que un jugador le avisa al anfitrión (o el anfitrión a sí mismo).
  send(a, data = {}) {
    const g = this.g;
    if (!g.net?.guest) this.onGuest({ a, ...data }, this.myId());
    else g.net.net.send({ t: 'pee', a, ...data });
  }

  onGuest(m, from) {
    if (this.sab?.onGuest(m, from)) return;
    if (m.a === 'task') this.hostTask(from, m.i | 0);
    else if (m.a === 'stab') this.hostStab(from);
    else if (m.a === 'kill') this.hostKill(from, m.v | 0);
    else if (m.a === 'rep') this.hostReport(from, m.b | 0);
    else if (m.a === 'btn') this.hostButton(from);
    else if (m.a === 'vote') this.hostVote(from, m.v | 0);
  }

  // ---------------- todos ----------------
  applyRemote(m) {
    this.sab?.applyRemote(m);
    if (m.pzp) this.applyPriv(m.pzp);
    if (m.pz) this.apply(m.pz, m.fx);
    else if (m.fx) this.applyFx(m.fx);
  }

  fullState() {
    return { pz: this.pack(), pzs: this.sab?.pack() };
  }

  // Lo mío (el papel, las tareas, la espera del facón).
  applyPriv(d) {
    const was = this.role;
    this.role = d.r;
    this.mates = d.m || [];
    this.copsN = d.n || 1;
    this.cd = d.c || 0;
    this.sab?.setCd(d.sw);
    this.tareas.setList(d.t || [], d.d || []);
    if (!was && this.started && this.phase === 'play') this.roleCard();
    else if (!was) this.cardPending = true;
  }

  apply(st, fx) {
    const g = this.g;
    const me = this.myId();
    // (el paso que ya se armó en esta compu: el anfitrión cambia this.meet antes de mandarlo)
    const wasStep = this.curStep || null;
    if (!this.isHost()) {
      this.phase = st.ph;
      this.bar = st.b;
      this.barSeen = st.b;
      if (st.o) this.opts = st.o;
      this.btnT = st.bt;
      const seen = new Set();
      for (const [id, alive, inGame, tp, spot, btn, col] of st.p) {
        seen.add(id);
        const s = this.P.get(id) || {};
        Object.assign(s, { alive, inGame, tp, spot, btn, col });
        this.P.set(id, s);
      }
      for (const id of [...this.P.keys()]) if (!seen.has(id)) this.P.delete(id);
      this.corpses = st.c || [];
      const M = st.m;
      if (M) {
        const old = this.meet;
        this.meet = { kind: M.k, by: M.by, body: M.bd, st: M.st, left: M.l, cells: M.c, voted: M.v, counts: M.n, skip: M.s, out: M.o, vis: M.vi, cp: M.cp };
        // (el reloj: corrige de a poco; un salto grande o un paso nuevo, de una)
        this.meetLeft = !old || old.st !== M.st || Math.abs(M.l - this.meetLeft) > 1.5 ? M.l : this.meetLeft + (M.l - this.meetLeft) * 0.3;
      } else this.meet = null;
      this.endInfo = st.e;
    } else this.meetLeft = this.meet?.left ?? 0;
    // una partida nueva: todo de cero en esta compu
    if (fx?.k === 'start') this.newGame(fx);
    // el encierro: cada paso, en todas las compus
    const step = this.meet?.st || null;
    this.curStep = step;
    if (step && step !== wasStep) this.enterStep(step, wasStep);
    if (!step && wasStep) this.leaveMeet();
    if (fx) this.applyFx(fx);
    // los cuerpos tirados (en el juego; en el encierro los maneja pzEncierro)
    if (this.phase === 'play') this.syncCorpses();
    // muerto yo
    const ms = this.P.get(me);
    const dead = !!ms && (!ms.alive || !ms.inGame) && this.phase !== 'wait';
    if (dead !== this.deadMe && !(this.scene && dead)) this.setDeadMe(dead);
    // el final (si fue por una muerte, después de verlo caer)
    if (this.phase === 'end' && !this.endEl && !this.endT) {
      const late = performance.now() - (this.killAt || -1e9) < 2500;
      this.endT = setTimeout(() => {
        this.endT = null;
        if (this.phase === 'end' && !this.endEl) this.showEnd();
      }, late ? 1700 : 0);
    }
    if (this.phase !== 'end' && this.endT) {
      clearTimeout(this.endT);
      this.endT = null;
    }
    if (this.phase !== 'end' && this.endEl) this.hideEnd();
  }

  newGame(fx) {
    this.myVote = null;
    this.follow = -1;
    this.tareas.reset();
    this.cuerpos.clear();
    this.enc.end();
    this.scene = null;
    this.copsN = fx.n || 1;
    if (this.deadMe) this.setDeadMe(false);
    this.unfreeze();
    this.seenTp = -1;
    if (!this.isHost()) this.sab?.reset();
    // (el papel llega aparte: sendPriv)
    this.role = null;
    this.mates = [];
  }

  syncCorpses() {
    const want = new Set(this.corpses.map((c) => c[0]));
    for (const c of this.corpses) {
      if (this.cuerpos.has(c[0])) continue;
      // (uno que no se vio caer: entra tarde o se perdió el aviso; ya tirado)
      const r = this.cuerpos.fall(c[0], tmpV.set(c[1], c[2], c[3]), c[4]);
      const b = this.cuerpos.list.get(c[0]);
      if (b) b.t = 9;
      void r;
    }
    for (const d of this.cuerpos.dead()) if (!want.has(d.id) && !this.scene) this.cuerpos.remove(d.id);
  }

  applyFx(fx) {
    const g = this.g;
    const me = this.myId();
    switch (fx.k) {
      case 'start':
        break;
      case 'kill': {
        // el muerto cae desde la pose que tenía (si se lo veía)
        const a = g.net?.avatars?.list.get(fx.v);
        const snap = a && a.group.visible ? cineSnapOf(a) : null;
        this.cuerpos.fall(fx.v, tmpV.set(fx.x, fx.y, fx.z), fx.yaw || 0, snap);
        this.killAt = performance.now();
        g.fx.blood(tmpW.set(fx.x, fx.y + 1.3, fx.z), { x: (fx.dx || 0) * 0.3, y: 0.3, z: (fx.dz || 0) * 0.3 }, 12);
        g.audio?.squish?.(tmpW.clone());
        if (fx.v === me) this.killedMe();
        break;
      }
      case 'stab': {
        // (el tajo de un policía que esta compu tiene a la vista)
        const r = g.net?.remote.get(fx.id);
        if (r) {
          r.act = { a: 'stab', d: STAB_3P, k: null, t: performance.now() };
          this.stabs.set(fx.id, performance.now());
          g.audio?.swish?.(false, 1);
        }
        break;
      }
      case 'task':
        break;
      case 'voted':
        if (fx.id !== me) g.audio?.click?.();
        break;
      case 'hit':
        this.enc.hit(fx.v);
        break;
      case 'meet': {
        // el aviso: la sirena del penal y el fundido (pzEncierro 'gather')
        g.audio?.sting?.();
        g.fx.addShake?.(0.2);
        break;
      }
      case 'end':
        break;
      default:
        break;
    }
  }

  // ---------------- el encierro (todas las compus) ----------------
  enterStep(step, was) {
    const g = this.g;
    if (!was) {
      // empieza: es una escena (Game no mueve al jugador; la cámara es de pzEncierro)
      this.scene = { pz: true, cine: { wantFov: 64, skip: () => {} } };
      this.meetT = 0;
      this.swingT = -1;
      this.myVote = null;
      g.hud.setHint(null);
      g.hud.setHold(null);
      this.follow = -1;
    }
    if (step === 'vote') this.myVote = null;
    this.enc.enter(step, this.meet);
  }

  leaveMeet() {
    const g = this.g;
    this.enc.end();
    this.scene = null;
    this.unfreeze();
    this.myVote = null;
    this.setVeil(null, 0, 0.6);
    // el mouse: con un clic
    if (g.state === 'playing' && !g.input.locked) g.menus.showClick?.(true);
  }

  sceneCam(dt) {
    if (!this.scene) return false;
    // (la isla quemándose: la toma es de pzSabotaje)
    if (this.scene.sab) return this.sab?.cam(dt) ?? false;
    this.enc.sceneCam(dt);
    return true;
  }

  vote(v) {
    if (!this.canVote()) return;
    this.myVote = v;
    this.send('vote', { v });
    this.g.audio?.powerupGrab?.();
  }

  reveal() {
    const m = this.meet;
    if (!m || m.out < 0) return;
    // (opción de la sala "Revelar al votado: No": solo quién fue)
    if (!this.opts.rv) return this.bigLine(`${this.nameOf(m.out)} fue encerrado`);
    const was = m.cp === 1;
    this.bigLine(`${this.nameOf(m.out)} ${was ? 'era' : 'no era'} policía`, was ? 'is-cop' : '');
  }

  // ---------------- mi muerte y el espectador ----------------
  killedMe() {
    const g = this.g;
    this.setVeil('radial-gradient(circle, rgba(140,0,0,0.3), rgba(60,0,0,0.92))', 0.95, 0.06);
    g.fx.addShake?.(0.9);
    g.audio?.hitThump?.(1.6);
    setTimeout(() => this.setVeil('#000', 1, 0.5), 260);
    setTimeout(() => this.setVeil(null, 0, 1.2), 1500);
  }

  setDeadMe(dead) {
    this.deadMe = dead;
    this.follow = -1;
    if (!dead) this.unfreeze();
    this.g.hud.setHint(null);
    this.g.hud.setHold(null);
  }

  freezeAt(p) {
    this.frozen = (this.frozen || new THREE.Vector3()).copy(p);
    this.hookRide();
  }

  unfreeze() {
    this.frozen = null;
  }

  // Player.update llama a player.ride después de moverse y chocar: quieto el
  // que está en el encierro (o apareciendo); el espectador que sigue a otro, en él.
  hookRide() {
    const P = this.g.player;
    this.rideFn ||= () => this.ride();
    if (P.ride === this.rideFn) return;
    P.ride = this.rideFn;
  }

  ride() {
    const P = this.g.player;
    // (sentado en un bote del incendio: lo lleva el bote, pzBotes)
    if (!this.frozen && this.sab?.ride()) return;
    if (this.frozen) {
      P.pos.copy(this.frozen);
      P.vel.set(0, 0, 0);
      return;
    }
    if (this.follow >= 0) {
      const r = this.g.net?.remote.get(this.follow);
      if (r) {
        P.pos.copy(r.pos);
        P.vel.set(0, 0, 0);
      }
    }
  }

  // El espectador: clic sigue al próximo vivo; Espacio vuelve a mirar libre.
  specTick(input) {
    if (!input) return;
    const g = this.g;
    const live = this.ids().filter((id) => id !== this.myId() && this.alive(id));
    if (this.follow >= 0 && !live.includes(this.follow)) this.follow = -1;
    if (input.hit('Mouse0') || (input.mouse.left && !this.wasLeft)) {
      if (live.length) {
        const i = live.indexOf(this.follow);
        this.follow = live[(i + 1) % live.length];
        this.hookRide();
      }
    }
    this.wasLeft = input.mouse.left;
    if (input.hit('Space') && this.follow >= 0) this.follow = -1;
  }

  // Siguiendo a otro: la cámara atrás de él (con el mouse se gira alrededor).
  followCam() {
    const g = this.g;
    const r = g.net?.remote.get(this.follow);
    if (!r) return;
    const P = g.player;
    const cam = g.camera;
    P.pitch = Math.max(-0.9, Math.min(0.6, P.pitch));
    const tgt = tmpV.set(r.pos.x, (r.pos.y || 0) + 1.55, r.pos.z);
    const back = tmpW.set(Math.sin(P.yaw) * Math.cos(P.pitch), -Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
    const hit = g.world.raycast(tgt, back, 3.2);
    const dist = Math.max(0.4, Math.min(3.2, hit - 0.3));
    cam.position.copy(tgt).addScaledVector(back, dist);
    cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  }

  // ---------------- el facón (el policía) ----------------
  knifeTick(dt, input, wdt = dt) {
    const g = this.g;
    const W = g.weapons;
    this.cd = Math.max(0, this.cd - wdt);
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (!this.swingHit && this.swingT >= PZ.hitAt) {
        this.swingHit = true;
        this.tryKill();
      }
      if (this.swingT >= PZ.swing) this.swingT = -1;
    }
    const kn = W?.knife;
    if (kn) {
      if (this.swingT >= 0) {
        // el tajo de siempre (weapons/Weapons.js KNIFE_MOVES), entrando de abajo y volviendo a guardarse
        const k = Math.min(1, this.swingT / PZ.swing);
        hozPose((KNIFE_MOVES[this.swingMove] || KNIFE_MOVES.tajo).keys, k, KP);
        const inK = smooth(clamp01(k / 0.16));
        const outK = smooth(clamp01((1 - k) / 0.2));
        kn.visible = true;
        kn.position.set(KP[0], KP[1] - 0.42 * (1 - Math.min(inK, outK)), KP[2]);
        kn.rotation.set(KP[3], KP[4], KP[5]);
      } else kn.visible = false;
    }
    const can = this.role === 'cop' && !this.deadMe && this.phase === 'play' && !this.scene && g.state === 'playing' && !g.menuOpen;
    if (!can || !input) return;
    // (con el extintor en la mano el clic es el chorro; el facón sigue con la V)
    if (((input.mouse.left && !this.sab?.holding()) || input.hit('KeyV')) && this.swingT < 0 && this.cd <= 0) {
      this.swingT = 0;
      this.swingHit = false;
      this.swingMove = this.swingMove === 'tajo' ? 'reves' : 'tajo';
      g.audio?.knife?.(false);
      this.send('stab');
    }
  }

  // ¿A quién le llegó el tajo? Al gaucho vivo más cerca adelante, sin pared en el medio.
  tryKill() {
    const g = this.g;
    if (this.cd > 0 || this.phase !== 'play') return;
    const p = g.player.pos;
    const fx = -Math.sin(g.player.yaw);
    const fz = -Math.cos(g.player.yaw);
    let best = -1;
    let bestD = Infinity;
    for (const [id, r] of g.net?.remote || []) {
      if (!this.alive(id) || this.isMate(id)) continue;
      const dx = r.pos.x - p.x;
      const dz = r.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > PZ.reach || Math.abs(r.pos.y - p.y) > 1.7) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < 0.4) continue;
      const eye = tmpV.set(p.x, p.y + 1.3, p.z);
      const dir = tmpW.set(r.pos.x, r.pos.y + 1.1, r.pos.z).sub(eye);
      const len = dir.length();
      if (len > 0.3 && g.world.raycast(eye, dir.divideScalar(len), len) < len - 0.25) continue;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best < 0) return;
    g.audio?.knife?.(true);
    g.fx.addShake?.(0.1);
    this.send('kill', { v: best });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const playing = g.state === 'playing';
    if (playing && !this.started) {
      this.started = true;
      // (todo abierto y sin muertos de la computadora)
      for (const it of g.interact.list) if (it.kind === 'door' && !it.door.open && !it.door.def.locked) g.interact.openDoor(it.door, true);
      this.stowAll();
      if (this.isHost()) this.hostStart();
      this.hookRide();
    }
    // sin rondas
    if (g.rounds && g.rounds.state !== 'remote' && g.rounds.state !== 'off') g.rounds.state = 'off';
    // (los relojes del modo van con la hora de verdad, no con el cuadro: una
    // compu que se traba no estira el encierro ni la visita de las demás)
    const now = performance.now();
    const wdt = this.wallAt ? Math.min(0.5, Math.max(0, (now - this.wallAt) / 1000)) : dt;
    this.wallAt = now;
    if (playing && this.phase !== 'end' && this.phase !== 'wait' && this.isHost()) this.hostTick(wdt);
    else if (!this.isHost()) this.meetLeft = Math.max(0, this.meetLeft - wdt);
    if (this.scene) this.meetT += wdt;
    // el lugar de cada uno (al arrancar): fundido y al pabellón
    this.myTp();
    if (this.cardPending && playing && this.role && this.phase === 'play') {
      this.cardPending = false;
      this.roleCard();
    }
    const p = g.player;
    // nadie se ahoga ni queda tirado
    if (p.breathS != null && p.breathS < 0.2) p.breathS = 0.2;
    if (p.downed && playing) p.revive();
    // sin mates ni nada en la mano (por si algo los volvió a sacar)
    if (g.weapons?.slots?.length) this.stowAll();
    const input = playing && !g.menuOpen && !this.scene ? g.input : null;
    // las tareas, el reporte y el botón (los avisos de abajo, uno a la vez)
    const can = !this.deadMe && this.phase === 'play' && !this.scene && playing;
    this.tareas.update(dt, can ? input : null, can);
    this.prompts(can ? input : null);
    this.knifeTick(dt, input, wdt);
    this.sab?.update(dt, wdt, input);
    if (this.deadMe && !this.scene) {
      this.specTick(input);
      if (this.follow >= 0) this.followCam();
    }
    if (this.scene && !this.scene.sab) {
      this.enc.update(wdt);
      // en el encierro, cada uno queda parado en su lugar del pabellón (adonde vuelve)
      if (this.meet && this.enc.setup && !this.frozen) this.goHome();
    }
    this.cuerpos.update(dt);
    this.updateButton(dt);
    this.updateHud();
  }

  // Sin mates en la mano: nadie tiene armas en este modo (los slots vacíos: los
  // demás ven el muñeco con la mano vacía, Session 'wpn').
  stowAll() {
    const W = this.g.weapons;
    if (!W) return;
    W.slots = [];
    W.cur = 0;
    W.temp = null;
    W.adsT = 0;
    W.ads = false;
    W.state = 'idle';
    W.holder.visible = false;
    if (W.holder2) W.holder2.visible = false;
    for (const k of ['knifePlata', 'nade', 'pavaVm']) if (W[k]) W[k].visible = false;
    if (W.knife && this.swingT < 0) W.knife.visible = false;
    if (W.vmFlash) W.vmFlash.intensity = 0;
    W.pourSnd?.stop?.();
    W.grenades = 0;
    W.tactical = null;
  }

  // Al pabellón, a mi lugar (bajo el negro del encierro) y quieto hasta la vuelta.
  goHome() {
    const s = this.P.get(this.myId());
    const spot = s && this.spots[s.spot];
    const P = this.g.player;
    if (spot && this.alive()) {
      P.pos.copy(spot);
      P.yaw = this.faceButton(spot);
      P.pitch = 0;
    }
    this.freezeAt(P.pos);
  }

  faceButton(at) {
    return Math.atan2(-(this.btnPos.x - at.x), -(this.btnPos.z - at.z));
  }

  // Arranque (y otra partida): fundido a negro, a mi lugar del pabellón, y se aclara.
  myTp() {
    const g = this.g;
    const s = this.P.get(this.myId());
    if (!s || g.state !== 'playing' || this.seenTp === s.tp || this.scene) return;
    this.seenTp = s.tp;
    const spot = this.spots[s.spot];
    if (!spot) return;
    this.setVeil('#000', 1, 0.25);
    this.freezeAt(g.player.pos);
    setTimeout(() => {
      const P = g.player;
      P.pos.copy(spot);
      P.vel.set(0, 0, 0);
      P.yaw = this.faceButton(spot);
      P.pitch = 0;
      this.freezeAt(spot);
      this.setVeil(null, 0, 0.7);
      setTimeout(() => !this.scene && this.unfreeze(), 450);
    }, 300);
  }

  // Los avisos de abajo: reportar un cuerpo o el botón (las tareas, pzTareas).
  prompts(input) {
    const g = this.g;
    if (!input) {
      if (this.prompted) g.hud.setHint(null);
      this.prompted = false;
      return;
    }
    const P = g.player;
    const p = P.pos;
    let text = null;
    let act = null;
    // un cuerpo cerca, mirándolo
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    for (const c of this.corpses) {
      const dx = c[1] - p.x;
      const dz = c[3] - p.z;
      const d = Math.hypot(dx, dz);
      if (d > PZ.reportR || Math.abs(c[2] - p.y) > 1.6) continue;
      if (d > 0.7 && (dx * fx + dz * fz) / d < 0.2) continue;
      text = '[F] Reportar';
      act = () => this.send('rep', { b: c[0] });
      break;
    }
    if (!text && Math.hypot(this.btnPos.x - p.x, this.btnPos.z - p.z) < PZ.buttonR && Math.abs(this.btnPos.y - p.y) < 1.5) {
      const s = this.P.get(this.myId());
      if (s?.btn) text = 'Ya usaste el botón';
      else if (this.sab?.fireOn()) text = 'Hay incendio';
      else if (this.btnT > 0) text = `El botón, en ${Math.ceil(this.btnT)} s`;
      else {
        text = '[F] Encierro';
        act = () => {
          this.btnPress = 1;
          g.audio?.click?.();
          this.send('btn');
        };
      }
    }
    // los botes, los extintores y la telesilla (pzSabotaje)
    if (!text && this.sab) {
      const s = this.sab.prompt(p);
      if (s) {
        text = s.text;
        act = s.act;
      }
    }
    if (text) {
      g.hud.setHint(text);
      this.prompted = true;
      if (act && input.hit('KeyF')) act();
    } else if (this.prompted) {
      // (si las tareas no pusieron el suyo)
      if (!this.tareas.hinted) g.hud.setHint(null);
      this.prompted = false;
    }
  }

  // Una tarea mía, terminada (pzTareas): al anfitrión.
  taskDone(i) {
    this.send('task', { i });
  }

  // ---------------- el final ----------------
  showEnd() {
    const g = this.g;
    const me = this.myId();
    const E = this.endInfo || { w: 'g', y: 'tareas', b: [] };
    const won = E.w === 'g';
    const cops = E.b.filter((x) => x[2]);
    const why = { tareas: 'Las tareas, completas', voto: cops.length > 1 ? 'Los votaron a todos' : 'Lo votaron', muertes: 'Quedaron muy pocos gauchos', salieron: 'Se fue la policía', isla: 'La isla ardió' }[E.y] || '';
    const copsTxt = cops.length ? `${cops.length > 1 ? 'Los policías eran' : 'El policía era'} ${cops.map((x) => `<b>${esc(x[1])}</b>`).join(' y ')}` : '';
    // (el anfitrión arranca otra con los mismos, como en Zombies gauchescos)
    const again = this.isHost();
    const el = document.createElement('div');
    el.className = `mdu-gzend mdu-pzend${won ? '' : ' is-cops'}`;
    el.innerHTML = `<div class="mdu-gzend__card"><p class="mdu-gzend__k">Porteño encubierto</p><h2>${won ? 'Ganan los gauchos' : 'Gana la policía'}</h2><p class="mdu-gzend__sub">${why}</p><p class="mdu-pzend__cops">${copsTxt}</p><ol>${E.b
      .map((x, i) => `<li class="${x[0] === me ? 'is-me' : ''}${x[2] ? ' is-cop' : ''}${x[3] ? '' : ' is-dead'}" style="--i:${i}"><b>${x[2] ? 'Policía' : 'Gaucho'}</b><span>${esc(x[1])}</span><em>${x[3] ? 'Vivo' : 'Muerto'}</em><i></i></li>`)
      .join('')}</ol><div class="mdu-gzend__btns">${again ? '<button class="mdu-btn" data-gzagain>Otra partida</button>' : ''}<button class="mdu-btn" data-gzback>Volver al menú</button></div></div>`;
    g.hud.root.appendChild(el);
    this.endEl = el;
    el.querySelector('[data-gzback]').addEventListener('click', () => this.back());
    el.querySelector('[data-gzagain]')?.addEventListener('click', () => this.again());
    this.enc.end();
    this.scene = null;
    this.unfreeze();
    this.swingT = -1;
    this.tareas.update(0, null, false);
    g.hud.setHint(null);
    this.setVeil('rgba(4,4,6,0.55)', 1, 0.8);
    g.state = 'over';
    g.paused = true;
    g.input.unlock();
    g.menus.showClick?.(false);
    g.audio?.fanfare?.();
  }

  // (anfitrión) Otra partida con los mismos: papeles nuevos.
  again() {
    if (!this.isHost() || this.phase !== 'end') return;
    this.hostStart();
  }

  hideEnd() {
    const g = this.g;
    this.endEl?.remove();
    this.endEl = null;
    this.setVeil(null, 0, 0.6);
    g.state = 'playing';
    g.paused = false;
    g.last = performance.now();
    if (this.isHost()) g.input.lock();
    else g.menus.showClick?.(true);
  }

  back() {
    const g = this.g;
    this.endEl?.remove();
    this.endEl = null;
    g.leaveRoom();
  }

  // ---------------- lo que no hay (la interfaz de los easter eggs) ----------------
  onShot() {}
  onExplosion() {}
  onPower() {}
  onZone() {}
  onKill() {}
  dropHat() {}
  onPhdLand() {}
  announce(text, secs = 3) {
    if (text) this.g.hud.subtitle(text, secs);
  }
  debugFinal() {}
  players() {
    return this.ids().length;
  }
  isGil() {
    return false;
  }

  dispose() {
    const g = this.g;
    this.enc.dispose();
    this.sab?.dispose();
    this.cuerpos.dispose();
    this.tareas.dispose();
    this.btnRoot?.removeFromParent();
    this.hudEl?.remove();
    this.veil?.remove();
    this.endEl?.remove();
    this.cardEl?.remove();
    g.hud.root.classList.remove('is-pz', 'is-pz-meet');
    if (g.player && g.player.ride === this.rideFn) g.player.ride = null;
    if (g.pz === this) g.pz = null;
  }
}

function cineSnapOf(a) {
  return a?.gs?.on ? cineSnap(a) : null;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// (Game.attachNet) Cuántos entran a la sala: en este modo, hasta 10.
export function pzCap(g) {
  return g.modeNow === 'porteno' ? PZ.maxPlayers : MAX_PLAYERS;
}

// (Game.startGame) Se juega en línea, de 4 a 10: con menos no arranca y lo
// dice corto en la sala (o en el menú donde se apretó). Y si la sala quedó
// con más de los que admite otro modo, tampoco.
export function pzBlockStart(g) {
  if (g.net?.guest) return false;
  const n = g.net ? g.net.net.count : 1;
  let msg = null;
  if (g.modeNow === 'porteno' && n < minPlayers()) msg = `Mínimo ${minPlayers()} jugadores`;
  else if (g.modeNow !== 'porteno' && n > MAX_PLAYERS) msg = `Máximo ${MAX_PLAYERS} jugadores en este modo`;
  if (!msg) return false;
  if (g.net && g.menus?.lobby?.status) {
    // (la sala ya se había escondido al apretar Empezar: vuelve, con el aviso)
    if (g.state === 'title' && !g.menus.current) g.menus.show('online');
    g.menus.lobby.status(msg);
  }
  else {
    const scr = g.menus?.screens?.[g.menus.current];
    if (scr) {
      let p = scr.querySelector('.mdu-gz-note');
      if (!p) {
        p = document.createElement('p');
        p.className = 'mdu-gz-note';
        const near = scr.querySelector('.mdu-play');
        if (near) near.after(p);
        else scr.appendChild(p);
      }
      p.textContent = msg;
      p.classList.remove('is-on');
      void p.offsetWidth;
      p.classList.add('is-on');
    }
  }
  g.audio?.deny?.();
  return true;
}

// El nombre arriba de la cabeza en el color de su poncho (como nameTexture de
// net/Avatars); el de un compañero policía, rodeado de rojo.
function tagTexture(name, fill, mate) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Special Elite", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (mate) {
    ctx.lineWidth = 13;
    ctx.strokeStyle = 'rgba(214, 38, 26, 0.95)';
    ctx.strokeText(name, 128, 34);
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = fill;
  ctx.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// (ui/Lobby.js) En la sala, con este modo elegido: cuántos policías (el
// anfitrión elige; Automático: 1 de 4 a 6, 2 de 7 en adelante; nunca más del
// tope de Among Us, y si se pide más, la sala lo avisa).
export function pzLobby(L) {
  const g = L.g;
  // (el cartel de arriba: cuántos entran, según el modo)
  const tag = L.el.querySelector('.mdu-tag');
  if (tag) tag.textContent = `Hasta ${pzCap(g)} materos en la misma partida. Uno hace de anfitrión: su compu maneja el mapa.`;
  const room = L.el.querySelector('[data-room]');
  if (!room) return;
  let el = room.querySelector('.mdu-pzcops');
  const on = g.modeNow === 'porteno' && !!g.net?.host && MAP_MODES.penal?.some((m) => m.id === 'porteno');
  // (usuario 10-13: dos opciones más, debajo de los policías, también solo del
  // anfitrión: la barra de tareas y si se revela al votado; llegan a todos en el
  // estado del modo, Porteno.opts)
  const rows = [...room.querySelectorAll('.mdu-pzcops')];
  if (!el) {
    if (!on) return;
    const row = (key, label, vals) => {
      const r = document.createElement('div');
      r.className = 'mdu-pzcops';
      r.innerHTML = `<span>${label}</span><div>${vals.map(([v, t]) => `<button data-pz${key}="${v}">${t}</button>`).join('')}</div>${key === 'cops' ? '<small></small>' : ''}`;
      rows.push(r);
      return r;
    };
    el = row('cops', 'Policías', ['auto', 1, 2, 3].map((v) => [v, v === 'auto' ? 'Automático' : v]));
    const rb = row('bar', 'Barra de tareas', [['now', 'Al instante'], ['enc', 'En los encierros']]);
    const rr = row('rv', 'Revelar al votado', [['1', 'Sí'], ['0', 'No']]);
    room.querySelector('[data-mappick]')?.after(el, rb, rr);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pzcops]');
      if (!b) return;
      const v = b.dataset.pzcops;
      g.pzCops = v === 'auto' ? 'auto' : Number(v);
      pzLobby(L);
    });
    rb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pzbar]');
      if (!b) return;
      g.pzBar = b.dataset.pzbar;
      pzLobby(L);
    });
    rr.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pzrv]');
      if (!b) return;
      g.pzReveal = b.dataset.pzrv === '1';
      pzLobby(L);
    });
  }
  for (const r of rows) r.hidden = !on;
  if (!on) return;
  for (const b of room.querySelectorAll('[data-pzbar]')) b.setAttribute('aria-pressed', String((g.pzBar === 'enc' ? 'enc' : 'now') === b.dataset.pzbar));
  for (const b of room.querySelectorAll('[data-pzrv]')) b.setAttribute('aria-pressed', String((g.pzReveal === false ? '0' : '1') === b.dataset.pzrv));
  const pick = g.pzCops || 'auto';
  for (const b of el.querySelectorAll('[data-pzcops]')) b.setAttribute('aria-pressed', String(String(pick) === b.dataset.pzcops));
  const n = g.net?.net?.count || 1;
  const real = copsFor(n, pick);
  el.querySelector('small').textContent = pick !== 'auto' && pick > copsCap(n) ? `Con ${n} jugadores, ${real} ${real > 1 ? 'policías' : 'policía'}` : '';
}
