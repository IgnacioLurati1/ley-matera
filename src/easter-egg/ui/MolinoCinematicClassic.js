import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { solvePose } from '../entities/skeleton';
import { buildMate, getMats } from '../weapons/viewmodels';
import { ARENA } from '../world/Arena';
import { warmScene } from './cineWarm';

// (El final de antes, en primera persona: queda con globalThis.__mduBlend =
// false o si los clips de Blender no bajaron; ui/MolinoCinematic.js.)
// Final del molino, adentro del juego (en la Salamanca, con el Mandinga hecho
// cenizas). La Voz de Arriba avisa que hace falta una yerba especial; el
// Abuelo entra caminando, cuenta que es Martín Fierro, pide el Mate de Oro,
// se toma un buen sorbo y lo devuelve... y el Alcaide del penal aparece de un
// rayo, lo roba, se ríe y desaparece. La Voz cierra: antes de recuperarlo van
// a tener que crear una yerba más poderosa. Se puede saltear con Esc, Espacio
// o clic.

const FIERRO_ID = 401;
const WALK = 1.35;
const RUN = 5.5;
const MATE_HAND = new THREE.Vector3(0, -0.2, 0.06);
// la boca del Abuelo (en la cabeza) y cuánto se inclina el mate para el sorbo
const MOUTH = new THREE.Vector3(0, -0.03, 0.13);
const SIP_TILT = -0.45;
// dónde queda el mate "en tu mano", respecto de la cámara
const MATE_MINE = new THREE.Vector3(0.2, -0.24, -0.5);

// el brazo derecho del Abuelo: quieto, estirado hacia vos y llevando el mate a la boca
const POSE = {
  rest: { sh: -0.55, rr: -0.1, el: -1.25, head: 0 },
  reach: { sh: -1.3, rr: -0.1, el: -0.35, head: 0 },
  sip: { sh: -0.65, rr: -0.95, el: -1.6, head: 0.25 },
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export { POSE };

export default class MolinoCinematicClassic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'mdu-fcine mdu-fcine--molino';
    this.el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p><h2 class="mdu-fcine__name">Martín Fierro</h2><h1 class="mdu-fcine__title">Continuará...</h1><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    requestAnimationFrame(() => this.el.classList.add('is-on'));
    const A = ARENA;
    // el que mira: parado frente al fondo de la cueva
    this.eye = new THREE.Vector3(A.x, 1.62, A.z + 5);
    this.look = new THREE.Vector3(A.x, 1.3, A.z - 4);
    this.lookGoal = this.look.clone();
    this.root = new THREE.Group();
    g.scene.add(this.root);
    // el Mandinga se hace cenizas
    const b = g.zombies.boss;
    if (b) {
      g.fx.explosion(tmpV.set(b.pos.x, 1.2, b.pos.z), 3.5, [1, 0.4, 0.1]);
      g.fx.flash(b.pos, 0xff5a1a, 120, 0.8, 24);
      g.zombies.removeBoss();
    }
    g.hud.setBossBar(null);
    g.post.flash(1.2);
    // el piso queda limpio para la escena: las quemaduras y la sangre de la
    // pelea (calcos transparentes) se dibujaban encima del fantasma de Fierro
    for (const D of g.fx.decals || []) {
      D.used = 0;
      D.next = 0;
      D.mesh.count = 0;
    }
    // los compañeros no se ven: la escena es la misma para todos
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    g.weapons.vmRoot.visible = false;
    // el Abuelo (Martín Fierro): el mismo fantasma azul de la capilla, ahora de pie
    this.people = new Avatars(g, null);
    this.fierro = { id: FIERRO_ID, name: 'Martín Fierro', noTag: true, pos: new THREE.Vector3(A.x + 0.7, 0, A.z - 5), yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true };
    this.fierroGoal = new THREE.Vector3(A.x + 0.12, 0, this.eye.z - 1.3);
    // su luz ya está en la escena (ver cineWarm); si no, una propia
    this.fierroLight = g.arena?.cineLight || new THREE.PointLight(0x7ab8ff, 0, 7, 2);
    if (!this.fierroLight.parent) this.root.add(this.fierroLight);
    // Fierro se arma ya (escondido) para que no haya que compilarlo cuando entra
    this.fierro.dead = true;
    this.people.add(this.fierro);
    // (una pasada con él a la vista: así ya queda vestido de ánima, transparente)
    this.fierro.dead = false;
    this.people.update(0);
    this.fierro.dead = true;
    // el ánima (transparente) se dibuja después de lo del piso
    // y más sólido que el fantasma de la capilla: con 0,42 las grietas del
    // piso se veían a través de las piernas
    this.people.root.traverse((o) => {
      if (!o.isMesh) return;
      o.renderOrder = 4;
      for (const m of [].concat(o.material)) {
        if (!m.emissive || !m.transparent) continue;
        m.opacity = 0.84;
        m.depthWrite = true;
      }
    });
    // el Mate de Oro: en tu mano (con tu mano, como cuando jugás) y el que
    // pasa de mano en mano
    const vm = buildMate('oro', 0, g.textures).mate;
    vm.removeFromParent();
    this.mateVM = vm;
    this.root.add(vm);
    this.mate = this.goldMate();
    this.mate.visible = false;
    this.root.add(this.mate);
    this.mateAt = 'me';
    this.mateFrom = new THREE.Vector3();
    this.mateT = 1;
    this.mateDur = 1;
    // el Alcaide: el cuerpo de jefe, vestido de alcaide
    this.alcaide = null;
    // se callan todos para darle lugar a la escena
    g.audio.setCine(true);
    g.audio.fanfare();
    this.script = this.buildScript();
    warmScene(g);
  }

  // El Mate de Oro suelto: calabaza de oro, virola, yerba y bombilla.
  goldMate() {
    const m = getMats(this.g.textures);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), m.gold);
    body.scale.set(1, 1.05, 1);
    body.position.y = 0.055;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 16), m.gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.105;
    g.add(rim);
    const yerba = new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 1 }));
    yerba.rotation.x = -Math.PI / 2;
    yerba.position.y = 0.104;
    g.add(yerba);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), m.gold);
    straw.position.set(0.012, 0.15, 0);
    straw.rotation.z = -0.2;
    g.add(straw);
    g.scale.setScalar(1.5);
    return g;
  }

  // Los pasos, uno detrás del otro: [espera antes, acción que devuelve cuánto dura].
  buildScript() {
    const g = this.g;
    return [
      [1.2, () => this.say('entidad', 'Bien hecho, gauchitos. El Mandinga no vuelve a molestar... por un buen tiempo.')],
      [0.5, () => this.say('entidad', 'Pero esto recién empieza. Van a tener que conseguir una yerba especial, de esas que no se venden en ningún almacén.')],
      [0.8, () => this.fierroIn()],
      [0.2, () => this.say('fierro', 'M\'hijo... ya es hora de que sepas quién soy.')],
      [0.2, () => Math.max(0, this.fierroEta())],
      [0.3, () => {
        this.el.classList.add('is-name');
        this.later(6.5, () => this.el.classList.remove('is-name'));
        return this.say('fierro', 'Me llamo Martín Fierro. Hace más de cien años me jugué el alma con el Mandinga, y desde entonces no pude tomarme un mate en paz.');
      }],
      [0.4, () => this.say('fierro', 'A ver ese mate, m\'hijo...')],
      [0.1, () => {
        this.pose = 'reach';
        this.moveMate('fierro', 0.9);
        return 1.1;
      }],
      [0.1, () => {
        this.pose = 'sip';
        this.later(0.5, () => g.audio.sip());
        return 2.4;
      }],
      [0.1, () => {
        this.pose = null;
        return this.say('fierro', '¡Ahhh! ¡Esto sí que es un mate!');
      }],
      [0.3, () => {
        this.pose = 'reach';
        this.moveMate('me', 0.9);
        this.later(1.1, () => {
          this.pose = null;
        });
        return this.say('fierro', 'Tomá, es tuyo. Cuidalo como a la vida.');
      }],
      [0.7, () => this.alcaideIn()],
      [0, () => Math.max(0, this.alcaideEta())],
      [0, () => {
        this.grab();
        return 0.5;
      }],
      [0, () => {
        g.audio.laugh(this.alcaide.z.pos.clone().setY(2));
        return 0.7;
      }],
      [0, () => this.say('alcaide', '¡Gracias por el mate, gauchito! Queda secuestrado por orden del Estado. ¡Ja!')],
      [0.2, () => this.alcaideOut()],
      [0.1, () => this.say('fierro', '¡Ladrón! ¡Ese es el Alcaide del penal de la isla!')],
      [0.8, () => this.say('entidad', 'Tranquilos. Lo van a recuperar... pero antes van a tener que crear una yerba mucho más poderosa.')],
      [0.8, () => {
        this.el.classList.add('is-title');
        return 2.8;
      }],
      [0, () => {
        this.el.classList.add('is-fade');
        return 2.2;
      }],
      [0, () => {
        this.finish();
        return 0;
      }],
    ];
  }

  later(secs, fn) {
    this.timers.push({ t: this.t + secs, fn });
  }

  // Habla un personaje: subtítulo con su color y voz (o murmullos).
  say(who, text) {
    this.textEl.textContent = text;
    this.textEl.classList.remove('is-on');
    void this.textEl.offsetWidth;
    this.textEl.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro');
    this.el.classList.toggle('is-alcaide', who === 'alcaide');
    return this.g.audio.say(text, who, { cine: true });
  }

  // ---------------- Martín Fierro ----------------
  fierroIn() {
    const g = this.g;
    this.fierro.dead = false;
    this.people.add(this.fierro);
    this.fierroOn = true;
    g.fx.sparkle(tmpV.copy(this.fierro.pos).setY(1), [0.6, 0.8, 1], 40, 1.2);
    g.audio.sting();
    return 0.6;
  }

  fierroEta() {
    return this.fierro.pos.distanceTo(this.fierroGoal) / WALK;
  }

  updateFierro(dt) {
    if (!this.fierroOn) return;
    const f = this.fierro;
    tmpV.subVectors(this.fierroGoal, f.pos).setY(0);
    const d = tmpV.length();
    if (d > 0.03) {
      tmpV.multiplyScalar(Math.min(d, WALK * dt) / d);
      f.pos.add(tmpV);
      f.moving = true;
      f.speed = WALK;
    } else {
      f.moving = false;
      f.speed = 0;
    }
    // siempre mirando al que mira
    f.yaw = Math.atan2(-(this.eye.x - f.pos.x), -(this.eye.z - f.pos.z));
    f.pitch = -0.1;
    this.fierroLight.intensity = 3;
    this.fierroLight.position.set(f.pos.x, 2.7, f.pos.z - 0.9);
    if (Math.random() < 0.12) this.g.fx.sparkle(tmpW.set(f.pos.x, 0.6 + Math.random() * 1.2, f.pos.z), [0.6, 0.8, 1], 1, 0.6);
  }

  // Después de la pose de siempre: el brazo que agarra el mate o lo lleva a la boca.
  poseFierro() {
    const a = this.people.list.get(FIERRO_ID);
    if (!a) return;
    const want = this.pose === 'reach' ? POSE.reach : this.pose === 'sip' ? POSE.sip : POSE.rest;
    const k = this.poseK || (this.poseK = { ...POSE.rest });
    for (const key of Object.keys(k)) k[key] += (want[key] - k[key]) * 0.12;
    const P = a.fake.P;
    P.shRp = k.sh;
    P.shRr = k.rr;
    P.elR = k.el;
    P.headP -= k.head;
    const r = a.r;
    solvePose(a.mats, r.pos.x, r.pos.z, r.yaw + Math.PI, 1, P);
    for (const m of a.parts) {
      m.matrix.copy(a.mats[m.part]);
      m.matrixWorldNeedsUpdate = true;
    }
    for (const e of a.extras) {
      e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
      e.obj.matrixWorldNeedsUpdate = true;
    }
    this.fierroHand = a.mats[6];
    this.fierroHead = a.mats[2];
  }

  // ---------------- el Alcaide ----------------
  alcaideIn() {
    const g = this.g;
    const Z = g.zombies;
    const z = Z.makeZombie(-1);
    z.boss = true;
    z.active = true;
    z.kind = 'alcaide';
    z.scale = 1.22;
    z.hatHp = 1;
    z.speedType = 'run';
    z.limp = 0;
    z.headTilt = 0;
    z.armOff = 0;
    z.phase = 0;
    z.slot = 0;
    z.baseY = 0;
    z.pos.set(this.eye.x - 6.5, 0, this.eye.z - 2.8);
    z.hp = z.maxHp = 1;
    Z.boss = z;
    Z.dressBoss('alcaide');
    Z.bossRig.rig.visible = true;
    Z.bossRig.hat.visible = true;
    this.alcaide = { z, goal: new THREE.Vector3(this.eye.x - 0.9, 0, this.eye.z - 1.2), back: new THREE.Vector3(this.eye.x - 1.6, 0, this.eye.z - 3.1), state: 'run' };
    g.fx.lightning(new THREE.Vector3(z.pos.x, 24, z.pos.z), new THREE.Vector3(z.pos.x, 0.2, z.pos.z), 0xbfd8ff, 0.6);
    g.fx.explosion(tmpV.set(z.pos.x, 0.8, z.pos.z), 2.2, [0.6, 0.8, 1]);
    g.fx.flash(z.pos, 0x9ac8ff, 90, 0.6, 20);
    g.post.flash(0.8);
    g.audio.bossArrive();
    g.audio.thunder?.(z.pos);
    g.fx.addShake?.(0.3);
    return 0.3;
  }

  alcaideEta() {
    const A = this.alcaide;
    return A.z.pos.distanceTo(A.goal) / RUN;
  }

  grab() {
    const g = this.g;
    this.alcaide.state = 'grab';
    this.moveMate('alcaide', 0.25);
    g.fx.addShake?.(0.25);
    g.audio.powerupGrab();
  }

  alcaideOut() {
    const g = this.g;
    const z = this.alcaide.z;
    g.fx.lightning(new THREE.Vector3(z.pos.x, 24, z.pos.z), new THREE.Vector3(z.pos.x, 0.3, z.pos.z), 0xbfd8ff, 0.6);
    g.fx.explosion(tmpV.set(z.pos.x, 1, z.pos.z), 2.6, [0.55, 0.75, 1]);
    for (let i = 0; i < 10; i++) g.fx.steam(tmpV.set(z.pos.x + (Math.random() - 0.5), 0.3 + Math.random() * 2, z.pos.z + (Math.random() - 0.5)), 4, 1);
    g.post.flash(1);
    g.audio.thunder?.(z.pos);
    g.zombies.removeBoss();
    this.alcaide.state = 'gone';
    this.stolen = true;
    this.mate.visible = false;
    this.mateVM.visible = false;
    return 1.2;
  }

  updateAlcaide(dt) {
    const A = this.alcaide;
    if (!A || A.state === 'gone') return;
    const g = this.g;
    const z = A.z;
    const Z = g.zombies;
    tmpV.subVectors(A.goal, z.pos).setY(0);
    const d = tmpV.length();
    if (A.state === 'run' && d > 0.05) {
      tmpV.multiplyScalar(Math.min(d, RUN * dt) / d);
      z.pos.add(tmpV);
      z.yaw = Math.atan2(tmpV.x, tmpV.z);
      Z.poseGait(z, dt, 1.6, this.t);
    } else {
      // mirando al que mira, con el mate en alto
      z.yaw = Math.atan2(this.eye.x - z.pos.x, this.eye.z - z.pos.z);
      Z.poseIdle(z, this.t);
      if (A.state === 'grab') {
        // se aleja de espaldas, con el mate en alto
        A.raise = Math.min(1, (A.raise || 0) + dt * 1.5);
        if (A.raise > 0.5) {
          tmpV.subVectors(A.back, z.pos).setY(0);
          const db = tmpV.length();
          if (db > 0.05) z.pos.addScaledVector(tmpV, Math.min(db, 1.4 * dt) / db);
        }
        z.P.shLp = -1.4 - A.raise * 1.3;
        z.P.elL = -0.3 + A.raise * 0.1;
        z.P.torsoP = 0.15;
        z.P.headP = -0.3 * A.raise;
      }
    }
    z.P.rootY = 0;
  }

  // ---------------- el mate ----------------
  moveMate(to, dur) {
    this.mateFrom.copy(this.mateVM.visible ? this.mateVM.position : this.mate.position);
    this.mateAt = to;
    this.mateT = 0;
    this.mateDur = dur;
  }

  // Dónde tiene que estar el mate según quién lo tiene.
  mateTarget(out) {
    const cam = this.g.camera;
    if (this.mateAt === 'me') return out.copy(MATE_MINE).applyQuaternion(cam.quaternion).add(cam.position);
    if (this.mateAt === 'fierro' && this.pose === 'sip' && this.fierroHead) {
      // la bombilla en la boca: el mate un poco abajo y adelante, inclinado hacia él
      out.copy(MOUTH).applyMatrix4(this.fierroHead);
      tmpV.set(this.eye.x - this.fierro.pos.x, 0, this.eye.z - this.fierro.pos.z).normalize();
      return out.addScaledVector(tmpV, 0.12).setY(out.y - 0.25);
    }
    if (this.mateAt === 'fierro' && this.fierroHand) return out.copy(MATE_HAND).applyMatrix4(this.fierroHand);
    if (this.mateAt === 'alcaide' && this.alcaide) return out.copy(MATE_HAND).applyMatrix4(this.alcaide.z.mats[5]);
    return out.copy(this.mate.position);
  }

  updateMate(dt) {
    if (this.stolen) return;
    const cam = this.g.camera;
    this.mateTarget(tmpW);
    this.mateT = Math.min(1, this.mateT + dt / this.mateDur);
    // en tu mano se ve el de siempre (con la mano); si no, el suelto
    const mine = this.mateAt === 'me' && this.mateT >= 1;
    this.mateVM.visible = mine;
    this.mate.visible = !mine;
    const obj = mine ? this.mateVM : this.mate;
    const s = this.mateT * this.mateT * (3 - 2 * this.mateT);
    if (this.mateT < 1) {
      obj.position.lerpVectors(this.mateFrom, tmpW, s);
      obj.position.y += Math.sin(s * Math.PI) * 0.12;
    } else if (this.mateAt === 'fierro') obj.position.lerp(tmpW, Math.min(1, dt * 8));
    else obj.position.copy(tmpW);
    // derecho, con la boca hacia la cámara (en el sorbo, inclinado hacia el Abuelo)
    this.tilt = (this.tilt || 0) + ((this.mateAt === 'fierro' && this.pose === 'sip' ? SIP_TILT : 0) - (this.tilt || 0)) * Math.min(1, dt * 6);
    obj.rotation.set(this.tilt, Math.atan2(cam.position.x - obj.position.x, cam.position.z - obj.position.z), 0, 'YXZ');
    if (Math.random() < 0.15) this.g.fx.sparkle(obj.position, [1, 0.85, 0.4], 1, 0.12);
  }

  // ---------------- cámara y cuadro a cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!this.script) return;
    this.t += dt;
    g.time += dt;
    g.weapons.vmRoot.visible = false;
    const t = this.t;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    // el guion: cada paso arranca cuando termina el anterior (más su espera)
    while (this.script && this.step < this.script.length && t >= this.next + this.script[this.step][0]) {
      const [wait, fn] = this.script[this.step];
      const start = this.next + wait;
      this.step++;
      const dur = fn() || 0;
      this.next = Math.max(start, t) + dur;
    }
    if (!this.script) return;
    this.updateFierro(dt);
    this.updateAlcaide(dt);
    this.people.update(dt);
    if (this.fierroOn) this.poseFierro();
    // a quién mira la cámara
    const al = this.alcaide && this.alcaide.state !== 'gone' ? this.alcaide.z : null;
    if (al) this.lookGoal.set(al.pos.x, 1.75, al.pos.z);
    else if (this.fierroOn) this.lookGoal.set(this.fierro.pos.x, 1.45, this.fierro.pos.z);
    this.look.lerp(this.lookGoal, Math.min(1, dt * (al ? 5 : 1.6)));
    const cam = g.camera;
    cam.position.set(this.eye.x + Math.sin(t * 0.4) * 0.05, this.eye.y + Math.sin(t * 0.9) * 0.02, this.eye.z);
    cam.lookAt(this.look);
    this.updateMate(dt);
    g.zombies.render();
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.script = null;
    window.removeEventListener('keydown', this.onKey);
    // se cortan sus voces (también los murmullos) y vuelven a hablar los demás
    this.g.audio.hush();
    this.g.audio.setCine(false);
    this.el.remove();
    const g = this.g;
    if (this.alcaide && this.alcaide.state !== 'gone') g.zombies.removeBoss();
    this.people?.dispose();
    this.root?.removeFromParent();
    if (this.fierroLight) this.fierroLight.intensity = 0;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
