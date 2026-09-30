import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { ghostMaterial, GHOST_TIME } from '../fx/ghostMat';
import VidaHuecos from './vidaHuecos';

// Modo gaucho life (el "afterlife" del penal). Se arranca la partida así, se
// entra con X gastando una carga (3 jugando solo, 1 en cooperativo; se
// recupera una cada 5 rondas) y, si te quedan cargas, al caer entrás solo y
// tu cuerpo queda tirado esperándote. Mientras dura sos un alma azul: los
// muertos no te ven, te movés más rápido y con clic tirás electricidad que
// prende las máquinas, abre las rejas con cerradura eléctrica y lo que haya
// en el mapa que la necesite (el easter egg suma lo suyo). Manteniendo F
// volvés a tu cuerpo; si se te acaba la energía, volvés solo.
//
// En línea cada uno maneja su propia alma; lo que toca el rayo lo decide el
// anfitrión (el invitado le pide el golpe) y los cuerpos se ven en todas las compus.

const ENERGY_SECS = 48;
const SHOT_COST = 0.03;
const SHOT_CD = 0.32;
const RANGE = 36;
const REGAIN_EVERY = 5;
const HOLD_BACK = 0.9;
const BODY_ID = 200;
const COLOR = 0x5ab8ff;
// dónde va el mate del alma (donde va el de verdad: Weapons HIP)
const GHOST_AT = new THREE.Vector3(0.19, -0.17, -0.4);

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export default class GauchoLife {
  constructor(game) {
    this.g = game;
    this.targets = [];
    this.active = false;
    this.energy = 1;
    this.max = 3;
    this.charges = 3;
    this.body = null;
    this.cd = 0;
    this.holdT = 0;
    this.bodies = new Avatars(game, null);
    this.buildHand();
    this.buildGhostMate();
    this.buildAura();
    // los huecos de las paredes y los tableros de las rejas eléctricas
    this.huecos = new VidaHuecos(game, this);
    this.collectTargets();
    this.reset();
  }

  // ---------------- lo que se ve ----------------
  // La mano del alma: azul, medio transparente, con chispas entre los dedos.
  buildHand() {
    const w = this.g.weapons;
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a7ac8, emissive: COLOR, emissiveIntensity: 1.3, transparent: true, opacity: 0.62, roughness: 0.4, depthWrite: false });
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), mat);
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.06, 3, 6), mat);
      f.position.set(-0.028 + i * 0.019, 0.005, -0.075);
      f.rotation.x = -Math.PI / 2 + 0.35 + i * 0.05;
      hand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.045, 3, 6), mat);
    thumb.position.set(-0.05, 0, -0.02);
    thumb.rotation.set(-Math.PI / 2, 0, 0.9);
    hand.add(thumb);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.3, 10), mat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = 0.19;
    hand.add(arm);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: COLOR, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 }));
    glow.scale.setScalar(0.16);
    glow.position.set(0, 0.02, -0.1);
    hand.add(glow);
    const light = new THREE.PointLight(COLOR, 0, 1.2, 2);
    light.position.set(0, 0.05, -0.1);
    hand.add(light);
    const parts = hand.children.filter((o) => o.isMesh);
    hand.position.set(0.21, -0.2, -0.42);
    hand.rotation.set(0.25, 0.2, -0.3);
    hand.visible = false;
    w.vmScene.add(hand);
    this.hand = { root: hand, glow, light, mat, parts };
  }

  // El mate del alma: una copia del que tenés en la mano hecha de luz azul
  // (fx/ghostMat.js), en lugar de la mano sola. Comparte las formas con el de
  // verdad (ya subidas a la placa) y el material es uno solo, compilado desde
  // que arranca el mapa: entrar al gaucho life no traba.
  buildGhostMate() {
    const w = this.g.weapons;
    this.ghostMat = ghostMaterial({ color: 0x2f7cff, rim: 0xd8f4ff, base: 0.16, rimK: 1.5, far: 50, wave: 0.0012, on: 1 });
    // (escribe profundidad y se dibuja de adelante para atrás: se ve solo la
    // cara de adelante; si no, las capas de un mate complicado se suman y encandila)
    this.ghostMat.depthWrite = true;
    const root = new THREE.Group();
    root.visible = false;
    this.hand.root.add(root);
    // (un puntito detrás de la cámara, siempre dibujado: el programa ya existe)
    const warm = new THREE.Mesh(new THREE.SphereGeometry(0.001, 4, 3), this.ghostMat);
    warm.position.set(0, 0, 1);
    warm.frustumCulled = false;
    w.vmScene.add(warm);
    this.ghost = { root, warm, key: null, muzzle: null };
    // la pose de reposo de cada mate, tomada ahora (recién armados): el de la
    // mano puede estar a mitad de una animación (cebando, inspeccionando) y la
    // copia saldría con la bombilla torcida
    this.rest = new Map();
    for (const [key, m] of w.models) this.rest.set(key, this.pose(m.root));
  }

  // Posición, giro, escala y si se ve, de cada pieza, por su camino desde la
  // raíz ("0/2/1": así lo que se le agrega después, como el fogonazo, no corre nada).
  pose(root) {
    const out = new Map();
    const walk = (o, path) => {
      out.set(path, [o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.visible]);
      o.children.forEach((c, i) => walk(c, `${path}/${i}`));
    };
    walk(root, '0');
    return out;
  }

  // Arma la copia del mate que tenés ahora (si cambió desde la última vez).
  dressGhost() {
    const w = this.g.weapons;
    const G = this.ghost;
    const h = this.hand;
    const s = w.slot;
    const key = s ? `${s.id}|${s.up}` : null;
    if (key !== G.key) {
      G.key = key;
      G.root.clear();
      G.muzzle = null;
      const m = key ? w.models.get(key) : null;
      if (m?.root && m.muzzle) {
        try {
          if (!m.muzzle.name) m.muzzle.name = 'mdu-muzzle';
          const c = m.root.clone(true);
          // (en reposo, no como esté ahora en la mano)
          const rest = this.rest.get(key);
          if (rest) {
            const walk = (o, path) => {
              const r = rest.get(path);
              if (r) {
                o.position.copy(r[0]);
                o.quaternion.copy(r[1]);
                o.scale.copy(r[2]);
                o.visible = r[3];
              }
              o.children.forEach((ch, i) => walk(ch, `${path}/${i}`));
            };
            walk(c, '0');
          }
          const drop = [];
          c.traverse((o) => {
            if (o.isLight) drop.push(o);
            else if (o.isSprite || o.isPoints || o.isLine) o.visible = false;
            else if (o.isMesh) {
              o.material = this.ghostMat;
              o.castShadow = false;
              o.frustumCulled = false;
            }
          });
          for (const o of drop) o.removeFromParent();
          G.root.add(c);
          G.muzzle = c.getObjectByName(m.muzzle.name) || null;
          // de adelante para atrás (la cámara mira a -z)
          G.root.position.copy(GHOST_AT);
          G.root.updateMatrixWorld(true);
          const meshes = [];
          c.traverse((o) => {
            if (o.isMesh) meshes.push([o, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).z]);
          });
          meshes.sort((a, b) => b[1] - a[1]).forEach(([o], i) => (o.renderOrder = 10 + i));
          G.root.position.set(0, 0, 0);
        } catch {
          G.root.clear();
          G.muzzle = null;
        }
      }
    }
    // con el mate, la mano sola no va y el chisporroteo sale de la bombilla
    const on = !!G.muzzle;
    for (const p of h.parts) p.visible = !on;
    G.root.visible = on;
    const at = on ? G.muzzle : h.root;
    if (h.glow.parent !== at) {
      at.add(h.glow);
      at.add(h.light);
    }
    h.glow.position.set(0, on ? 0.01 : 0.02, on ? 0 : -0.1);
    h.light.position.set(0, on ? 0.02 : 0.05, on ? 0 : -0.1);
    h.glow.scale.setScalar(on ? 0.1 : 0.16);
  }

  // Resplandor alrededor del cuerpo que queda tirado (lo ven todos).
  buildAura() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: COLOR, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.scale.setScalar(1.8);
    s.visible = false;
    this.g.scene.add(s);
    this.aura = s;
  }

  // ---------------- a qué le pega el rayo ----------------
  // Cada objetivo: { pos, r, on() -> ¿todavía sirve?, hit() -> lo hace el anfitrión }.
  // Se registran en el mismo orden en todas las compus (así el invitado puede pedir por número).
  addTarget(t) {
    t.i = this.targets.length;
    this.targets.push(t);
    return t;
  }

  collectTargets() {
    const I = this.g.interact;
    for (const it of I.list) {
      if (it.kind === 'perk') {
        const m = it.machine;
        this.addTarget({ pos: it.pos.clone().setY(it.pos.y + 0.6), r: 0.9, on: () => !m.powered && !m.gone, hit: () => I.powerMachine(m) });
      } else if (it.kind === 'pap') {
        const pap = I.pap;
        this.addTarget({ pos: it.pos.clone().setY(it.pos.y + 0.6), r: 1.1, on: () => !pap.powered, hit: () => I.powerMachine(pap) });
      } else if (it.kind === 'door' && it.door.def.kind === 'vida' && !this.huecos.hasPanel(it.door)) {
        const door = it.door;
        this.addTarget({ pos: it.pos.clone().setY(it.pos.y + 0.1), r: 0.9, on: () => !door.open, hit: () => I.openDoor(door) });
      }
    }
    // los tableros (del otro lado de cada hueco)
    for (const t of this.huecos.targets()) this.addTarget(t);
  }

  // ---------------- partida ----------------
  reset() {
    const g = this.g;
    if (this.active) this.leave(true);
    this.max = g.net && g.net.net.count > 1 ? 1 : 3;
    this.charges = this.max;
    this.energy = 1;
    this.body = null;
    this.lastRound = 0;
    for (const id of [...this.bodies.list.keys()]) this.bodies.remove(id);
    this.hud();
  }

  // Al arrancar la partida se empieza como alma (sin gastar carga).
  startRun() {
    this.reset();
    this.enter({ free: true });
    // (las teclas ya están en el cartel del gaucho life: acá solo para qué sirve)
    this.g.hud.subtitle('Gaucho life: tu rayo prende las máquinas.', 4);
  }

  // Cada 5 rondas se recupera una carga.
  onRound(n) {
    if (n - this.lastRound >= REGAIN_EVERY && n > 1) {
      this.lastRound = n;
      if (this.charges < this.max) {
        this.charges++;
        this.g.hud.toast('Recuperaste una carga de gaucho life');
        this.hud();
      }
    }
  }

  // X: entrar gastando una carga.
  tryEnter() {
    const g = this.g;
    const p = g.player;
    if (this.active || !p.alive || p.downed || g.arena?.active || g.state !== 'playing') return;
    if (this.charges <= 0) {
      g.hud.subtitle('No te quedan cargas de gaucho life (se recupera una cada 5 rondas).', 3);
      g.audio.deny();
      return;
    }
    this.charges--;
    this.enter({});
  }

  // Caíste: si hay cargas, en vez de quedar tirado entrás al gaucho life.
  // Devuelve true si lo tomó.
  onDown() {
    if (this.active || this.charges <= 0 || this.g.arena?.active) return false;
    this.charges--;
    this.enter({ downed: true });
    return true;
  }

  enter({ free = false, downed = false }) {
    const g = this.g;
    const p = g.player;
    this.active = true;
    this.energy = 1;
    this.cd = 0.3;
    this.holdT = 0;
    this.shareT = 1;
    this.dressGhost();
    // el cuerpo queda apoyado en el piso (al arrancar la partida todavía no bajó)
    const fy = g.world.floorAt(p.pos.x, p.pos.z, p.pos.y);
    this.body = { x: p.pos.x, y: Math.max(p.pos.y, fy), z: p.pos.z, yaw: p.yaw, downed };
    p.ghost = true;
    p.health = p.maxHealth;
    this.showBody(g.net?.id || 0, this.body);
    const b = this.body;
    g.net?.share('vida', { id: g.net.id, on: 1, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(2) });
    g.post?.flash(0.35);
    g.audio.tesla(p.pos.clone().setY(p.pos.y + 1));
    g.audio.setCritical?.(false);
    g.hud.setDowned(null);
    // (lo que quedó escrito de antes de salir del cuerpo: acá no se toca nada)
    g.hud.setHint(null);
    if (!free) g.hud.subtitle(downed ? 'Caíste... pero tu alma sigue: volvé a tu cuerpo para levantarte.' : 'Gaucho life: los muertos no te ven.', 4);
    this.hud();
  }

  // Volver al cuerpo (a donde quedó tirado).
  leave(silent = false) {
    const g = this.g;
    const p = g.player;
    if (!this.active) return;
    this.active = false;
    this.huecos.cancel();
    p.ghost = false;
    const b = this.body;
    if (b) {
      p.pos.set(b.x, b.y, b.z);
      p.vel.set(0, 0, 0);
      p.yaw = b.yaw;
      if (b.downed || p.downed) {
        p.downed = false;
        p.alive = true;
        p.health = p.maxHealth;
        g.onPlayerRevived();
      }
    }
    // un ratito sin que te toquen, para ubicarte
    p.guardT = g.time + 1.3;
    this.hideBody(g.net?.id || 0);
    this.body = null;
    this.hand.root.visible = false;
    g.hud.setHint(null);
    g.hud.setHold(null);
    g.net?.share('vida', { id: g.net.id, on: 0 });
    if (!silent) {
      g.post?.flash(0.25);
      g.audio.whoosh?.(p.pos);
    }
    this.hud();
  }

  showBody(id, b) {
    const bid = BODY_ID + id;
    const had = this.bodies.list.get(bid);
    // ya estaba en el mismo lugar: no se rearma
    if (had && had.r.pos.distanceToSquared(new THREE.Vector3(b.x, b.y, b.z)) < 0.01) return;
    this.bodies.remove(bid);
    this.bodies.add({ id: bid, name: '', noTag: true, corpse: true, pos: new THREE.Vector3(b.x, b.y, b.z), yaw: b.yaw, pitch: 0, speed: 0 });
    if (id === (this.g.net?.id || 0)) {
      this.aura.position.set(b.x, b.y + 0.3, b.z);
      this.aura.visible = true;
    }
  }

  hideBody(id) {
    this.bodies.remove(BODY_ID + id);
    if (id === (this.g.net?.id || 0)) this.aura.visible = false;
  }

  // Un compañero entró o salió del gaucho life.
  applyRemote(m) {
    if (m.on) this.showBody(m.id, m);
    else this.hideBody(m.id);
  }

  // ---------------- cada cuadro ----------------
  update(dt, input) {
    const g = this.g;
    GHOST_TIME.value = g.time;
    this.bodies.update(dt);
    this.huecos.update(dt, input);
    if (this.aura.visible) this.aura.material.opacity = 0.35 + Math.sin(g.time * 3) * 0.15;
    // en línea es una carga por jugador y solo, tres: también si alguien entra
    // (o se va) con la partida empezada, y para el que entra tarde
    const max = g.net && g.net.net.count > 1 ? 1 : 3;
    if (max !== this.max) {
      this.max = max;
      this.charges = Math.min(this.charges, max);
      this.hud();
    }
    if (!this.active) return;
    // en línea se repite dónde quedó el cuerpo (para el que entró tarde o arrancó después)
    if (g.net) {
      this.shareT = (this.shareT ?? 1) - dt;
      if (this.shareT <= 0) {
        this.shareT = 4;
        const b = this.body;
        g.net.share('vida', { id: g.net.id, on: 1, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(2) });
      }
    }
    const p = g.player;
    // la energía se va gastando
    this.energy -= dt / ENERGY_SECS;
    if (this.energy <= 0) {
      this.energy = 0;
      g.hud.subtitle('Se te acabó la energía: tu alma vuelve al cuerpo.', 3);
      this.leave();
      return;
    }
    // mantener F: volver
    if (input.key('KeyF')) {
      this.holdT += dt;
      g.hud.setHold(Math.min(1, this.holdT / HOLD_BACK));
      if (this.holdT >= HOLD_BACK) {
        this.leave();
        return;
      }
    } else {
      this.holdT = 0;
      g.hud.setHold(null);
    }
    // el rayo
    this.cd -= dt;
    if (input.mouse.leftPressed && this.cd <= 0 && !g.menuOpen) this.fire();
    // la mano y su chisporroteo
    const h = this.hand;
    h.root.visible = p.alive;
    const bob = p.moving ? Math.sin(p.bobPhase * 2) * 0.006 : 0;
    const kick = Math.max(0, this.cd);
    if (this.ghost.muzzle) {
      // el mate del alma: donde va el de verdad, flotando un poco y con el
      // tironcito para arriba de cada rayo
      h.root.position.set(GHOST_AT.x, GHOST_AT.y + bob + Math.sin(g.time * 2) * 0.005, GHOST_AT.z + kick * 0.1);
      h.root.rotation.set(kick * 0.5, Math.sin(g.time * 0.9) * 0.03, Math.sin(g.time * 1.3) * 0.025);
    } else {
      h.root.position.set(0.21, -0.2 + bob + Math.sin(g.time * 2) * 0.004, -0.42 + kick * 0.12);
      h.root.rotation.set(0.25, 0.2, -0.3);
    }
    h.glow.material.opacity = 0.55 + Math.sin(g.time * 23) * 0.2 + Math.random() * 0.2;
    h.light.intensity = 0.6 + Math.random() * 0.4 + Math.max(0, this.cd) * 8;
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.hud();
    }
    if (Math.random() < dt * 6) g.fx.electric(tmpV.set(p.pos.x + (Math.random() - 0.5) * 0.6, p.pos.y + 0.3 + Math.random() * 1.4, p.pos.z + (Math.random() - 0.5) * 0.6), 2);
  }

  fire() {
    const g = this.g;
    this.cd = SHOT_CD;
    this.energy = Math.max(0.001, this.energy - SHOT_COST);
    const cam = g.camera;
    const o = tmpV.copy(cam.position);
    const d = tmpD.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let tEnd = g.world.raycast(o, d, RANGE);
    if (!Number.isFinite(tEnd)) tEnd = RANGE;
    // el objetivo más cercano que cruza el rayo (antes de la pared)
    let best = null;
    let bestT = tEnd + 0.8;
    for (const t of this.targets) {
      if (!t.on()) continue;
      tmpP.subVectors(t.pos, o);
      const s = tmpP.dot(d);
      if (s < 0 || s > bestT) continue;
      const miss = tmpP.addScaledVector(d, -s).length();
      if (miss > t.r) continue;
      best = t;
      bestT = s;
    }
    // los muertos que agarra quedan atontados
    let zt = Infinity;
    let zHit = null;
    if (!best) {
      const hits = g.zombies.raycast(o, d, tEnd);
      if (hits?.length) {
        zHit = hits[0].z;
        zt = hits[0].t;
      }
    }
    const end = o.clone().addScaledVector(d, best ? bestT : Math.min(tEnd, zt));
    // (sale de la punta de la bombilla del mate del alma: la escena de la mano
    // está en el espacio de la cámara)
    const from = new THREE.Vector3(0.21, -0.2, -0.5);
    if (this.ghost.muzzle && this.ghost.root.visible) {
      this.hand.root.updateMatrixWorld(true);
      this.ghost.muzzle.getWorldPosition(from);
    }
    from.applyQuaternion(cam.quaternion).add(cam.position);
    this.bolt(from, end);
    g.net?.share('bolt', { a: [+from.x.toFixed(2), +from.y.toFixed(2), +from.z.toFixed(2)], b: [+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)] });
    if (best) {
      if (g.net?.guest) g.net.net.send({ t: 'vidahit', i: best.i });
      else best.hit();
      g.fx.electric(end, 20);
      g.fx.flash(end, COLOR, 40, 0.4, 10);
    } else if (zHit) this.stun(zHit);
  }

  bolt(a, b) {
    const g = this.g;
    g.fx.lightning(a, b, COLOR, 0.22);
    g.fx.electric(b, 8);
    g.audio.zap(b);
    g.audio.thunderCrack?.(b, { dur: 0.6, gain: 0.45 });
  }

  stun(z) {
    const g = this.g;
    if (z.pombero || z.crow) return;
    if (g.net?.guest) {
      g.net.reportHit?.(z, 40, { type: 'vida', zone: 'torso', noPoints: true });
      return;
    }
    z.slowT = Math.max(z.slowT || 0, 2.5);
    g.zombies.damage(z, 40, { type: 'vida', noPoints: true, point: z.pos.clone().setY((z.baseY || 0) + 1.2) });
  }

  // El invitado pide que el rayo le pegue a algo (lo decide el anfitrión).
  remoteHit(i) {
    const t = this.targets[i];
    if (t?.on()) t.hit();
  }

  hud() {
    const g = this.g;
    g.hud.setVida?.({ charges: this.charges, max: this.max, energy: this.active ? this.energy : null });
  }

  dispose() {
    this.hand.root.removeFromParent();
    this.ghost.warm.removeFromParent();
    this.ghostMat.dispose();
    this.aura.removeFromParent();
    this.bodies.dispose();
    this.huecos.dispose();
    this.g.hud.setVida?.(null);
  }
}
