import * as THREE from 'three';
import { POWERUP, POINTS } from '../config/rules';
import { getMats } from '../weapons/viewmodels';
import { pickupModel } from '../weapons/Especiales';
import { faconPickup } from '../weapons/Facon';
import { MAP_ID, FEATURES } from '../config/map';
import { WEAPONS } from '../config/weapons';

// Power-ups de BO1: munición máxima (un termo), muerte instantánea (calavera),
// puntos dobles, kaboom, carpintero y liquidación (caja a $10). Además cada
// mapa tiene el suyo (SPECIAL): en la granja la Máquina de Muerte, una
// bombilla gigante para el que la agarra; en la torre el Admin Mate; en el
// penal el Farol de las Ánimas...

const TYPES = ['maxammo', 'insta', 'double', 'nuke', 'carpenter', 'firesale'];
const NAMES = {
  maxammo: '¡Munición máxima!',
  insta: '¡Muerte instantánea!',
  double: '¡Puntos dobles!',
  nuke: '¡Kaboom!',
  carpenter: '¡Carpintero!',
  firesale: '¡Liquidación!',
  muerte: '¡Máquina de muerte!',
  admin: '¡Admin Mate!',
  almas: '¡Farol de las Ánimas!',
  piedra: '¡Piedra de molino!',
  dragon: '¡Mate Dragón!',
  facon: '¡Facón Relámpago!',
  clarin: '¡Toque de Clarín!',
  // los del Challenge de la torre (FEATURES.pups)
  infinito: '¡Balas infinitas!',
  botas: '¡Botas de potro!',
};
// El potenciador propio de cada mapa. Entra en la bolsa solo si ya tiene
// nombre (NAMES): así uno a medio hacer no sale vacío.
const SPECIAL = { granja: 'muerte', molino: 'piedra', penal: 'almas', torre: 'admin', castillo: 'dragon', esteros: 'facon', monumento: 'clarin' };
// Los personales: un arma que dura unos segundos, solo para el que lo agarra
// ([id del arma, segundos]). Su tiempo se ve en el HUD con la misma clave.
const PERSONAL = {
  muerte: ['bombillon', 30],
  admin: ['adminmate', 12],
  almas: ['farol', 15],
  piedra: ['piedra', 20],
  dragon: ['dragon', 25],
  facon: ['facon', 25],
};

export default class Powerups {
  constructor(game) {
    this.g = game;
    this.items = [];
    this.active = { insta: 0, double: 0, firesale: 0, infinito: 0, botas: 0, clarin: 0 };
    for (const k of Object.keys(PERSONAL)) this.active[k] = 0;
    this.bag = [];
    this.nextScore = POWERUP.firstThreshold;
    this.increment = POWERUP.firstThreshold;
    this.dropsThisRound = 0;
    this.glowTex = game.textures.dot;
  }

  newRound() {
    this.dropsThisRound = 0;
  }

  pick() {
    if (!this.bag.length) {
      const sp = SPECIAL[MAP_ID];
      this.bag = sp && NAMES[sp] ? [...TYPES, sp] : [...TYPES];
      // (el Challenge de la torre suma los suyos: balas infinitas y botas)
      for (const k of FEATURES.pups || []) if (NAMES[k]) this.bag.push(k);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    const type = this.bag.pop();
    // (el Challenge: en lugar del Admin Mate puede salir el especial de cualquier mapa, él incluido)
    if (FEATURES.anySpecial && type === SPECIAL[MAP_ID]) {
      const all = Object.values(SPECIAL).filter((k) => NAMES[k] && PERSONAL[k]);
      return all[Math.floor(Math.random() * all.length)];
    }
    return type;
  }

  onKill(pos) {
    const g = this.g;
    if (this.dropsThisRound >= POWERUP.maxPerRound) return;
    if (g.stats.earned >= this.nextScore) {
      this.increment *= POWERUP.growth;
      this.nextScore = g.stats.earned + this.increment;
      this.drop(pos);
    } else if (Math.random() < POWERUP.randomChance) this.drop(pos);
  }

  drop(pos, force = false, forcedType = null) {
    const g = this.g;
    if (!force) this.dropsThisRound++;
    // no dejarlo afuera del mapa (zombies que mueren en la ventana)
    const zone = g.world.zoneAt(pos.x, pos.z);
    const p = pos.clone();
    if (!zone) {
      p.set(g.player.pos.x + (Math.random() - 0.5) * 2, g.player.pos.y, g.player.pos.z + (Math.random() - 0.5) * 2);
    }
    // en el piso donde cayó (abajo o en el altillo)
    p.y = g.world.floorAt(p.x, p.z, p.y || 0);
    const type = forcedType || this.pick();
    const mesh = this.model(type);
    mesh.position.set(p.x, p.y + 1, p.z);
    g.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    glow.scale.setScalar(1.6);
    mesh.add(glow);
    const id = (this.nextId = (this.nextId || 0) + 1);
    const item = { id, type, mesh, t: 0, pos: p };
    this.items.push(item);
    g.audio.powerupSpawn(mesh.position);
    g.net?.event('pup', { id, type, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    // muy de vez en cuando, el Pombero viene a llevárselo
    g.pombero?.onDrop(item);
  }

  // Power-up que aparece o se levanta en otra compu.
  applyRemote(m) {
    if (m.take) {
      const i = this.items.findIndex((x) => x.id === m.id);
      if (i >= 0) this.remove(i);
      // lo personal (la Máquina de Muerte) es solo para el que lo agarró
      this.applyEffect(m.type, m.by != null && m.by === this.g.net?.id, m.by != null);
      return;
    }
    const g = this.g;
    const mesh = this.model(m.type);
    mesh.position.set(m.x, (m.y || 0) + 1, m.z);
    g.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    glow.scale.setScalar(1.6);
    mesh.add(glow);
    // (age: el que entra tarde lo recibe con los segundos que ya lleva en el piso)
    this.items.push({ id: m.id, type: m.type, mesh, t: Number.isFinite(m.age) ? m.age : 0, pos: new THREE.Vector3(m.x, m.y || 0, m.z) });
    g.audio.powerupSpawn(mesh.position);
  }

  // Los mates de los potenciadores personales que pueden salir en este mapa
  // (Weapons.warmFx arma su modelo al cargar: el Farol de las Ánimas trababa al agarrarlo).
  personalWeapons() {
    const ks = FEATURES.anySpecial ? Object.values(SPECIAL) : [SPECIAL[MAP_ID]];
    return ks.filter((k) => k && NAMES[k] && PERSONAL[k]).map((k) => PERSONAL[k][0]);
  }

  // Uno de cada potenciador (con su brillo), para compilar sus materiales al
  // cargar el mapa (ui/Arrival compile): el Farol de las Ánimas trababa el
  // juego la primera vez que aparecía.
  warmGroup() {
    const grp = new THREE.Group();
    for (const type of Object.keys(NAMES)) {
      try {
        grp.add(this.model(type));
      } catch {
        /* uno a medio hacer: se compila cuando salga */
      }
    }
    grp.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 })));
    return grp;
  }

  model(type) {
    const M = getMats(this.g.textures);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 });
    const g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    switch (type) {
      case 'maxammo':
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16), M.termo);
        add(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 16), M.steel, 0, 0.29);
        add(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 10), M.steel, 0, 0.36, 0.04, 0.4);
        // la manija: parada, saliendo del costado opuesto al pico
        add(new THREE.TorusGeometry(0.12, 0.02, 6, 14, Math.PI), M.dark, 0, 0.03, -0.12, 0, -Math.PI / 2, Math.PI / 2);
        break;
      case 'insta': {
        add(new THREE.SphereGeometry(0.2, 16, 12), gold, 0, 0.05);
        add(new THREE.BoxGeometry(0.2, 0.12, 0.16), gold, 0, -0.15, 0.03);
        const eye = new THREE.MeshBasicMaterial({ color: 0x000000 });
        add(new THREE.SphereGeometry(0.055, 8, 6), eye, -0.075, 0.07, 0.16);
        add(new THREE.SphereGeometry(0.055, 8, 6), eye, 0.075, 0.07, 0.16);
        break;
      }
      case 'double': {
        for (const x of [-0.14, 0.14]) add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), gold, x, 0, 0, Math.PI / 2, 0, 0);
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        ctx.font = 'bold 90px Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#5a3a00';
        ctx.fillText('x2', 64, 68);
        const tex = new THREE.CanvasTexture(c);
        // (propia de este drop: remove la libera)
        tex.userData.pup = true;
        const face = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        for (const x of [-0.14, 0.14]) add(new THREE.PlaneGeometry(0.28, 0.28), face, x, 0, 0.03);
        break;
      }
      case 'nuke':
        add(new THREE.SphereGeometry(0.22, 16, 12), M.dark);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), M.steel, 0, 0.23);
        add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), M.teabag, 0.03, 0.32, 0, 0, 0, -0.4);
        break;
      case 'clarin': {
        add(new THREE.TorusGeometry(0.13, 0.018, 8, 24), gold, 0, 0, 0);
        add(new THREE.TorusGeometry(0.09, 0.016, 8, 20), gold, 0.02, 0, 0.02);
        add(new THREE.CylinderGeometry(0.11, 0.02, 0.26, 18, 1, true), gold, 0.2, 0.06, 0, 0, 0, Math.PI / 2 + 0.25);
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), gold, -0.18, -0.02, 0, 0, 0, Math.PI / 2);
        // el cordón celeste y blanco con su borla
        add(new THREE.TorusGeometry(0.15, 0.008, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x74acdf }), 0, -0.1, 0, 0, 0, Math.PI);
        add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf4f2ec }), 0, -0.26, 0);
        break;
      }
      case 'carpenter':
        add(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 8), M.wood, 0, 0, 0, 0, 0, 0.5);
        add(new THREE.BoxGeometry(0.25, 0.08, 0.08), M.steel, -0.11, 0.2, 0, 0, 0, 0.5);
        break;
      case 'muerte': {
        // una bombilla gigante de seis caños, dorada
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          add(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8), M.steel, Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05);
        }
        add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16), gold, 0, -0.26);
        add(new THREE.TorusGeometry(0.065, 0.012, 6, 16), gold, 0, 0.2, 0, Math.PI / 2, 0, 0);
        g.rotation.z = 0.5;
        break;
      }
      case 'admin': {
        // dos pistolones de oro cruzados (el Mate Eagle, uno por mano)
        for (const s of [-1, 1]) {
          const p = new THREE.Group();
          const part = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            p.add(m);
          };
          part(new THREE.BoxGeometry(0.07, 0.07, 0.36), gold, 0, 0.05, -0.06);
          part(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 14), gold, 0, 0.05, 0.1);
          part(new THREE.BoxGeometry(0.05, 0.16, 0.07), M.dark, 0, -0.07, 0.12);
          p.rotation.set(0, s * 0.6, s * 0.35);
          p.position.x = s * 0.06;
          g.add(p);
        }
        break;
      }
      case 'almas': {
        // el Farol de las Ánimas: de hierro, colgando de su cadena, con el corazón verde
        const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.75, roughness: 0.42 });
        const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.85, roughness: 0.35 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          add(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 6), iron, Math.cos(a) * 0.12, -0.02, Math.sin(a) * 0.12);
        }
        add(new THREE.CylinderGeometry(0.04, 0.2, 0.08, 6), iron, 0, 0.17, 0, 0, Math.PI / 6, 0);
        add(new THREE.CylinderGeometry(0.15, 0.13, 0.04, 6), iron, 0, -0.19, 0, 0, Math.PI / 6, 0);
        add(new THREE.ConeGeometry(0.03, 0.06, 6), brass, 0, -0.24, 0, Math.PI, 0, 0);
        add(new THREE.SphereGeometry(0.025, 10, 8), brass, 0, 0.22);
        for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.022, 0.006, 5, 12), iron, 0, 0.26 + i * 0.035, 0, 0, i % 2 ? Math.PI / 2 : 0, 0);
        add(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x9affb8, roughness: 0.02, transparent: true, opacity: 0.2, depthWrite: false }), 0, -0.02);
        add(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9affb0).multiplyScalar(2.2), toneMapped: false }), 0, -0.02);
        break;
      }
      // la Piedra de Molino (una piedra de moler chiquita) y el Mate Dragón (weapons/Especiales.js)
      case 'piedra':
      case 'dragon':
        g.add(pickupModel(type));
        break;
      // el Facón Relámpago (weapons/Facon.js)
      case 'facon':
        g.add(faconPickup());
        break;
      case 'infinito': {
        // un infinito de oro con dos balas cruzadas adelante
        add(new THREE.TorusKnotGeometry(0.13, 0.035, 64, 8, 2, 1), gold).scale.set(1.25, 0.7, 0.5);
        for (const s of [-1, 1]) {
          const bullet = new THREE.Group();
          bullet.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10), M.steel));
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 10), gold);
          tip.position.y = 0.095;
          bullet.add(tip);
          bullet.position.set(s * 0.05, -0.02, 0.1);
          bullet.rotation.z = s * 0.5;
          g.add(bullet);
        }
        break;
      }
      case 'botas': {
        // una bota de potro con su espuela y dos alitas
        const leather = new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.55 });
        add(new THREE.CylinderGeometry(0.075, 0.085, 0.3, 14), leather, 0, 0.06);
        add(new THREE.BoxGeometry(0.13, 0.08, 0.26), leather, 0, -0.1, 0.06);
        add(new THREE.TorusGeometry(0.05, 0.008, 6, 14), gold, 0, -0.08, -0.1, 0, Math.PI / 2, 0);
        const wing = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide, emissive: 0x333333 });
        for (const s of [-1, 1]) add(new THREE.PlaneGeometry(0.2, 0.1), wing, s * 0.13, 0.12, -0.02, 0, s * 0.5, s * 0.4);
        break;
      }
      case 'firesale': {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 80;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#f2e6c8';
        ctx.fillRect(0, 0, 128, 80);
        ctx.fillStyle = '#b3151d';
        ctx.font = 'bold 50px Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$10', 64, 58);
        const tex = new THREE.CanvasTexture(c);
        tex.userData.pup = true;
        const tag = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
        add(new THREE.BoxGeometry(0.4, 0.25, 0.02), tag);
        add(new THREE.TorusGeometry(0.03, 0.006, 6, 12), M.steel, -0.17, 0.08, 0);
        break;
      }
      default:
        break;
    }
    return g;
  }

  update(dt) {
    const g = this.g;
    for (const k of Object.keys(this.active)) {
      if (this.active[k] > 0) {
        this.active[k] = Math.max(0, this.active[k] - dt);
      }
    }
    g.hud.setPowerups(this.active);
    // balas infinitas: el cargador del que está en la mano no baja
    if (this.active.infinito > 0) {
      const W = g.weapons;
      const s = W.slot;
      const st = W.stats;
      if (s && st && !s.temp && WEAPONS[s.id]?.kind !== 'melee' && s.mag < st.mag) {
        s.mag = st.mag;
        W.updateHud();
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 1.8;
      it.mesh.position.y = it.pos.y + 1 + Math.sin(it.t * 2.5) * 0.08;
      const left = POWERUP.lifetime - it.t;
      it.mesh.visible = left > 6 || Math.floor(it.t * (left < 3 ? 8 : 4)) % 2 === 0;
      if (Math.random() < 0.2) g.fx.sparkle(it.mesh.position, [0.4, 1, 0.5], 1, 0.6);
      const dx = g.player.pos.x - it.mesh.position.x;
      const dz = g.player.pos.z - it.mesh.position.z;
      // (en una cinemática no se agarra nada: se agarra cuando vuelve el control)
      if (dx * dx + dz * dz < 1.44 && g.player.alive && Math.abs(g.player.pos.y - it.pos.y) < 1.5 && !g.intro?.active && !g.ee?.scene) {
        if (g.net?.guest) {
          // el anfitrión confirma: el efecto es para todos
          g.net.net.send({ t: 'pupget', id: it.id });
          this.remove(i);
          continue;
        }
        this.apply(it.type, it.id);
        this.remove(i);
        continue;
      }
      if (left <= 0) this.remove(i);
    }
  }

  remove(i) {
    const it = this.items[i];
    it.mesh.removeFromParent();
    // cada drop arma geometrías nuevas (y el x2 y el $10, su textura): se
    // liberan de la placa. Los materiales no (son compartidos o los junta el
    // GC; liberarlos recompilaría el shader en el próximo drop). El sprite del
    // brillo usa la geometría compartida de todos los sprites: esa no.
    it.mesh.traverse((o) => {
      if (!o.isSprite) o.geometry?.dispose();
      const t = o.material?.map;
      if (t?.userData?.pup) t.dispose();
    });
    this.items.splice(i, 1);
  }

  // by: quién lo agarró (en línea; el anfitrión lo resuelve).
  apply(type, id, by = null) {
    const g = this.g;
    const who = by ?? g.net?.id ?? 0;
    g.net?.event('pup', { id, type, take: true, by: who });
    this.applyEffect(type, !g.net || who === g.net.id, true);
  }

  // El efecto en sí (los globales los comparte todo el mundo).
  // local: es de este jugador (el que lo agarró). known: se sabe quién fue.
  applyEffect(type, local, known = false) {
    const g = this.g;
    g.audio.powerupGrab();
    if (local) g.audio.announce(NAMES[type]);
    // los personales (la Máquina de Muerte...) son de uno solo: los demás apenas se enteran
    const own = PERSONAL[type];
    if (own) {
      if (!known || local) {
        g.hud.toast(NAMES[type]);
        // uno nuevo reemplaza al que tenía en la mano
        this.endPersonal();
        this.active[type] = own[1];
        g.weapons.giveTemp(own[0], own[1]);
      }
      return;
    }
    g.hud.toast(NAMES[type]);
    switch (type) {
      case 'maxammo':
        g.weapons.maxAmmo();
        break;
      case 'insta':
        this.active.insta = POWERUP.duration;
        break;
      case 'double':
        this.active.double = POWERUP.duration;
        break;
      case 'nuke':
        if (!g.net?.guest) g.zombies.nuke();
        g.post.flash(1);
        g.later(0.3, () => g.addPoints(POINTS.nuke, null, true));
        break;
      case 'carpenter':
        // (en todas las compus: si no, los invitados seguían viendo las
        // ventanas vacías; las trabadas de la defensa del yerbal ya les llegan)
        g.barriers.repairAll();
        g.later(1.5, () => g.addPoints(POINTS.carpenter, null, true));
        break;
      case 'firesale':
        this.active.firesale = POWERUP.duration;
        break;
      // el Monumento: el toque de clarín de los Granaderos. Los muertos se
      // cuadran (quietos, firmes) 6 s y todo lo que les pega hace el doble
      // (entities/Zombies.js mira active.clarin)
      case 'clarin':
        this.active.clarin = 6;
        g.audio.bugle(g.camera.position.clone());
        g.post?.flash?.(0.35);
        break;
      case 'infinito':
        this.active.infinito = POWERUP.duration;
        break;
      case 'botas':
        this.active.botas = POWERUP.duration;
        break;
      default:
        break;
    }
  }

  // Se terminó (o se cambió) el arma del personal: se apaga su tiempo en el HUD.
  endPersonal() {
    for (const k of Object.keys(PERSONAL)) this.active[k] = 0;
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this.remove(i);
  }
}
