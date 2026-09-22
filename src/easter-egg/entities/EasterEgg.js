import * as THREE from 'three';
import { EE } from '../config/map';
import { PERK_ORDER } from '../config/perks';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { getMats } from '../weapons/viewmodels';

// Easter egg "La Ronda del Abuelo" (~10 minutos):
//  1. Prender la luz: aparece el fantasma del Abuelo en la capilla.
//  2. Bajar de un tiro su calabaza, arriba de todo en el almacén.
//  3. Subir el balde del aljibe del patio: ahí está la bombilla.
//  4. Prender el barbacuá y matar 12 zombies cerca para secar la yerba.
//  5. Calentar el agua en el fogón de la oficina y cortarla entre 75 y 85 °C.
//  6. Cebarle el mate al Abuelo.

const LINES = {
  dark: 'Está todo oscuro, m\'hijo... Prendé la luz en la sala de máquinas.',
  intro: 'Hace ciento quince años que no tomo un mate como la gente. Me falta la calabaza, la bombilla, la yerba y el agua a punto.',
  calabaza: 'Mi calabaza quedó arriba de todo en el almacén. Bajala de un tiro, no te vas a subir.',
  bombilla: 'La bombilla se me cayó al aljibe del patio. Subí el balde, despacito.',
  yerba: 'La yerba se seca en el barbacuá... con almas, como se hacía antes.',
  agua: 'El agua va al fogón de la oficina. ¡Nunca hervida! Entre setenta y cinco y ochenta y cinco grados.',
  ready: '¡Ahora sí! Cebame uno, m\'hijo.',
  done: '¡Eso es un mate! Andá, que yo me quedo acá tranquilo.',
  hat: 'Una cosa más, m\'hijo. Traeme el sombrero del Capataz. Cuando lo tenga en la mano, te llevo a donde empezó todo.',
  gotHat: '¡Ese es el sombrero! Dámelo, que te muestro de dónde vengo.',
  go: 'Agarrate fuerte. Allá abajo te espera el que me persigue hace un siglo.',
};

export default class EasterEgg {
  constructor(game) {
    this.g = game;
    this.items = { calabaza: false, bombilla: false, yerba: false, agua: false };
    this.calabazaState = 'shelf';
    this.bucketT = 0;
    this.kiln = 'idle';
    this.souls = 0;
    this.hearth = 'idle';
    this.temp = 20;
    this.done = false;
    this.talkT = 0;
    this.started = null;
    this.hasHat = false;
    this.arenaGone = false;
    this.hatObj = null;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.buildAbuelo();
    this.buildCalabaza();
    this.buildHearth();
    this.register();
  }

  // ---------------- modelos ----------------
  buildAbuelo() {
    const M = this.g.world.M;
    const [x, z] = EE.abuelo.pos;
    const chair = new THREE.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = 0;
    // mecedora
    const rocker = new THREE.Group();
    for (const s of [-0.28, 0.28]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 20, 0.9), M.woodDark);
      arc.rotation.set(0, Math.PI / 2, Math.PI + 1.12);
      arc.position.set(s, 0.9, 0.05);
      rocker.add(arc);
      rocker.add(mesh(boxGeo(0.04, 0.45, 0.04), M.woodDark, s, 0.3, 0.2));
      rocker.add(mesh(boxGeo(0.04, 1.0, 0.04), M.woodDark, s, 0.55, -0.22, -0.15));
      rocker.add(mesh(boxGeo(0.04, 0.04, 0.45), M.woodDark, s, 0.7, 0.02));
    }
    rocker.add(mesh(boxGeo(0.6, 0.05, 0.45), M.woodDark, 0, 0.5, 0));
    for (let i = 0; i < 5; i++) rocker.add(mesh(boxGeo(0.03, 0.55, 0.02), M.woodDark, -0.2 + i * 0.1, 0.8, -0.27, -0.15));
    rocker.add(mesh(boxGeo(0.6, 0.06, 0.04), M.woodDark, 0, 1.08, -0.31, -0.15));
    // fantasma sentado
    const ghost = new THREE.MeshStandardMaterial({ color: 0xa8d8ff, emissive: 0x4a88d0, emissiveIntensity: 1.8, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.5 });
    this.ghostMat = ghost;
    const body = new THREE.Group();
    body.add(mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 10), ghost, 0, 0.88, -0.05, -0.12));
    body.add(mesh(new THREE.SphereGeometry(0.14, 14, 10), ghost, 0, 1.35, 0.0));
    body.add(mesh(cylGeo(0.16, 0.15, 0.05, 14), ghost, 0, 1.47, -0.01, -0.15));
    // bigote y poncho
    body.add(mesh(boxGeo(0.12, 0.025, 0.03), ghost, 0, 1.3, 0.13));
    body.add(mesh(boxGeo(0.55, 0.45, 0.35), ghost, 0, 0.95, 0.0, -0.1));
    for (const s of [-0.1, 0.1]) {
      body.add(mesh(new THREE.CapsuleGeometry(0.07, 0.35, 3, 8), ghost, s, 0.55, 0.22, Math.PI / 2));
      body.add(mesh(new THREE.CapsuleGeometry(0.06, 0.35, 3, 8), ghost, s, 0.3, 0.42));
    }
    body.add(mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8), ghost, 0.25, 0.95, 0.12, 1.1, 0, 0.3));
    body.visible = false;
    rocker.add(body);
    chair.add(rocker);
    this.root.add(chair);
    this.g.world.addBox([x - 0.4, 0, z - 0.45, x + 0.4, 1.2, z + 0.5], { kind: 'prop' });
    this.chair = { group: chair, rocker, body };
    this.abueloPos = new THREE.Vector3(x, 1.2, z);
    // luz fantasmal
    this.ghostLight = new THREE.PointLight(0x7ab8ff, 0, 6, 2);
    this.ghostLight.position.set(x, 1.6, z + 0.3);
    this.root.add(this.ghostLight);
  }

  buildCalabaza() {
    const mats = getMats(this.g.textures);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), mats.gourd);
    body.scale.set(1, 0.95, 1);
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16), mats.gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    g.add(rim);
    const [x, , z] = EE.calabaza.pos;
    g.position.set(x, 2.06, z);
    this.root.add(g);
    this.calabaza = g;
    this.calabazaVel = new THREE.Vector3();
  }

  buildHearth() {
    const M = this.g.world.M;
    const mats = getMats(this.g.textures);
    const a = this.g.world.wallAnchor(EE.hearth.cell, EE.hearth.face, 0.45);
    const g = new THREE.Group();
    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.rot;
    g.add(mesh(boxGeo(1.4, 0.9, 0.9), M.brickSoot, 0, 0.45, 0));
    g.add(mesh(boxGeo(1.5, 0.08, 1.0), M.stone, 0, 0.94, 0));
    g.add(mesh(boxGeo(0.5, 0.35, 0.05), M.black, 0, 0.45, 0.45));
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4a10, emissiveIntensity: 0.4 }));
    coals.position.set(0, 0.32, 0.47);
    g.add(coals);
    const pava = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.15, 0.05], [0.14, 0.16], [0.08, 0.22], [0.03, 0.24]].map(([r, y]) => new THREE.Vector2(r, y)), 20), mats.aluminium);
    pava.add(body);
    pava.add(mesh(cylGeo(0.015, 0.035, 0.2, 8), mats.aluminium, 0, 0.1, 0.17, 1.0, 0, 0));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI), M.iron);
    handle.position.y = 0.24;
    pava.add(handle);
    pava.position.set(0.2, 0.98, 0);
    g.add(pava);
    this.root.add(g);
    this.g.world.addBox([a.x - 0.75, 0, a.z - 0.5, a.x + 0.75, 1.0, a.z + 0.5], { kind: 'prop' });
    this.hearthObj = { group: g, coals, pava, pos: new THREE.Vector3(a.x, 1.2, a.z), front: new THREE.Vector3(a.x + EE.hearth.face[0] * 1.2, 0, a.z + EE.hearth.face[1] * 1.2) };
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    const kilnPos = new THREE.Vector3(EE.kiln.pos[0], 1.2, EE.kiln.pos[1]);
    this.kilnTarget = new THREE.Vector3(EE.kiln.pos[0], 0.6, EE.kiln.pos[1] - 0.6);
    const wellPos = new THREE.Vector3(EE.well.pos[0], 1, EE.well.pos[1]);

    I.add({
      kind: 'ee',
      pos: this.abueloPos,
      radius: 2.4,
      prompt: () => {
        if (!g.world.power || this.arenaGone) return null;
        if (this.done) return this.hasHat ? { text: 'darle el sombrero del Capataz al Abuelo', noCost: true } : null;
        const all = Object.values(this.items).every(Boolean);
        return all ? { text: 'cebarle un mate al Abuelo', noCost: true } : null;
      },
      cost: () => 0,
      use: () => {
        if (this.done) {
          if (!this.hasHat || this.arenaGone) return false;
          this.giveHat();
          return true;
        }
        if (!Object.values(this.items).every(Boolean)) return false;
        this.complete();
        return true;
      },
    });
    this.calabazaIt = I.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 1.6,
      prompt: () => (this.calabazaState === 'floor' ? { text: 'agarrar la calabaza del Abuelo', noCost: true } : null),
      cost: () => 0,
      use: () => {
        this.calabazaState = 'taken';
        this.calabaza.visible = false;
        this.gain('calabaza', 'Calabaza del Abuelo');
        return true;
      },
    });
    I.add({
      kind: 'ee',
      hold: true,
      pos: wellPos,
      radius: 2,
      prompt: () => (g.world.power && !this.items.bombilla ? { text: 'subir el balde del aljibe', hold: true, noCost: true } : null),
      cost: () => 0,
      use: () => {
        this.bucketT += 0.55;
        g.audio.chain(wellPos);
        if (this.bucketT >= 3) {
          this.gain('bombilla', 'Bombilla de alpaca');
          g.fx.sparkle(wellPos, [0.9, 0.95, 1], 20, 0.5);
        }
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: kilnPos,
      radius: 2.6,
      prompt: () => {
        if (!g.world.power || this.items.yerba) return null;
        if (this.kiln === 'idle') return { text: 'cargar el barbacuá con yerba', noCost: true };
        if (this.kiln === 'ready') return { text: 'sacar la yerba seca', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.kiln === 'idle') {
          this.kiln = 'souls';
          g.hud.subtitle('El barbacuá está hambriento. Matá zombies cerca del fuego.', 3.5);
          g.audio.sting();
          return true;
        }
        if (this.kiln === 'ready') {
          this.kiln = 'done';
          this.gain('yerba', 'Yerba del barbacuá');
          return true;
        }
        return false;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.hearthObj.pos,
      front: this.hearthObj.front,
      radius: 2.2,
      prompt: () => {
        if (!g.world.power || this.items.agua) return null;
        if (this.hearth === 'idle') return { text: 'poner la pava en el fogón', noCost: true };
        if (this.hearth === 'heating') return { text: `sacar la pava (${Math.round(this.temp)} °C)`, noCost: true };
        if (this.hearth === 'cooldown') return { text: 'La pava se está enfriando...', noCost: true, info: true };
        return null;
      },
      cost: () => (this.hearth === 'cooldown' ? 1 : 0),
      use: () => {
        if (this.hearth === 'idle') {
          this.hearth = 'heating';
          this.temp = 20;
          this.hearthObj.coals.material.emissiveIntensity = 3;
          return true;
        }
        if (this.hearth === 'heating') {
          if (this.temp >= 75 && this.temp <= 85) {
            this.hearth = 'done';
            this.hearthObj.coals.material.emissiveIntensity = 0.4;
            this.gain('agua', `Agua a ${Math.round(this.temp)} °C`);
          } else if (this.temp < 75) {
            g.hud.subtitle(`Todavía está fría: ${Math.round(this.temp)} °C.`, 2);
            this.fail('fría');
          } else this.fail('hervida');
          return true;
        }
        return false;
      },
    });
  }

  fail(kind) {
    const g = this.g;
    this.hearth = 'cooldown';
    this.coolT = kind === 'hervida' ? 15 : 3;
    this.hearthObj.coals.material.emissiveIntensity = 0.4;
    if (kind === 'hervida') {
      g.hud.subtitle('¡La hervistes! Así no se ceba. Esperá que se enfríe.', 3);
      g.audio.laugh(this.hearthObj.pos);
    }
  }

  gain(key, label) {
    const g = this.g;
    if (this.items[key]) return;
    this.items[key] = true;
    this.netSync();
    g.hud.setInventory(this.items);
    g.hud.toast(`Conseguiste: ${label}`);
    g.audio.sting();
    const missing = Object.entries(this.items).filter(([, v]) => !v).length;
    if (!missing) g.hud.subtitle('Tenés todo. Andá a la capilla a cebarle al Abuelo.', 3.5);
  }

  // ---------------- ganchos del juego ----------------
  onPower() {
    const g = this.g;
    this.started = g.time;
    this.chair.body.visible = true;
    this.ghostLight.intensity = 4;
    g.later(4, () => g.hud.subtitle('Se escucha una mecedora en la capilla...', 3));
    if (g.world.zoneAt(g.player.pos.x, g.player.pos.z) === 'E') this.onZone('E');
  }

  // Abrir cualquier puerta que dé a la capilla: el Abuelo saluda igual.
  // Estado del easter egg que manda el anfitrión (modo invitado).
  applyRemote(m) {
    const g = this.g;
    if (m.calabaza && this.calabazaState === 'shelf') this.dropCalabaza(new THREE.Vector3(0, 0, 1));
    if (m.calabaza === 'taken') {
      this.calabazaState = 'taken';
      this.calabaza.visible = false;
    }
    if (m.items) {
      this.items = { ...this.items, ...m.items };
      g.hud.setInventory(this.items);
    }
    if (m.kiln) this.kiln = m.kiln;
    if (m.hearth) this.hearth = m.hearth;
    if (m.done && !this.done) {
      this.done = true;
      g.hud.setInventory(null);
    }
    if (m.hat) this.dropHat(new THREE.Vector3(m.hat[0], 0, m.hat[1]));
    if (m.hatTaken && this.hatObj) this.hatObj.visible = false;
  }

  netSync() {
    this.g.net?.event('ee', { items: this.items, kiln: this.kiln, hearth: this.hearth, done: this.done, calabaza: this.calabazaState === 'taken' ? 'taken' : null });
  }

  onZone(k) {
    const g = this.g;
    if (k !== 'E' || !g.world.power || this.arenaGone) return;
    this.talkT = 6;
    g.later(1.6, () => {
      if (this.arenaGone) return;
      this.talkT = Math.max(2, g.say('abuelo', this.nextLine()) + 18);
    });
  }

  onShot(origin, dir, maxT) {
    if (this.calabazaState !== 'shelf' || !this.g.world.power) return;
    const p = this.calabaza.position;
    const v = new THREE.Vector3().subVectors(p, origin);
    const t = v.dot(dir);
    if (t < 0 || t > maxT + 0.3) return;
    const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
    if (closest.distanceTo(p) < 0.16) this.dropCalabaza(dir);
  }

  onExplosion(pos, radius) {
    if (this.calabazaState === 'shelf' && this.g.world.power && pos.distanceTo(this.calabaza.position) < radius * 0.6) this.dropCalabaza(new THREE.Vector3(0, 0, 1));
  }

  dropCalabaza(dir) {
    this.calabazaState = 'falling';
    this.calabazaVel.set(dir.x * 1.5, 1.5, dir.z * 1.5);
    this.g.audio.shell();
    this.g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 12, 0.3);
  }

  onKill(z) {
    if (this.kiln !== 'souls') return;
    const d = Math.hypot(z.pos.x - EE.kiln.pos[0], z.pos.z - EE.kiln.pos[1]);
    if (d > 9) return;
    this.g.fx.soul(z.pos, this.kilnTarget);
    this.souls++;
    if (this.souls >= 12) {
      this.kiln = 'ready';
      this.g.hud.subtitle('La yerba está seca. Sacala del barbacuá.', 3);
      this.g.audio.sting();
    }
  }

  complete() {
    const g = this.g;
    this.done = true;
    g.later(0.1, () => this.netSync());
    const secs = Math.round(g.time - (this.started ?? g.time));
    g.audio.fanfare();
    g.say('abuelo', LINES.done);
    g.post.flash(1.5);
    g.zombies.nuke();
    g.zombies.setEyeColor(0x39a8ff);
    for (const id of PERK_ORDER) if (!g.player.perks.has(id)) g.player.givePerk(id);
    g.weapons.give('oro');
    g.hud.setInventory(null);
    g.hud.achievement('La Ronda del Abuelo', `Easter egg completado en ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    g.stats.easterEgg = true;
    // el Abuelo con su mate
    const mats = getMats(g.textures);
    const mate = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mats.gold);
    mate.position.set(0.32, 0.95, 0.3);
    this.chair.rocker.add(mate);
    // lo que sigue: el sombrero del Capataz
    this.talkT = 40;
    g.later(8, () => {
      g.say('abuelo', this.hasHat ? LINES.gotHat : LINES.hat);
      if (!this.hasHat) g.hud.subtitle('El Capataz aparece cada 5 rondas. Cuando caiga, agarrá su sombrero.', 5);
    });
  }

  // El Capataz pierde el sombrero al caer: queda tirado brillando.
  dropHat(pos) {
    const g = this.g;
    if (this.hasHat || this.arenaGone) return;
    if (!g.net?.guest) g.net?.event('ee', { hat: [+pos.x.toFixed(2), +pos.z.toFixed(2)] });
    if (!this.hatObj) {
      const M = g.world.M;
      const hat = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
      hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), mat));
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.2, 16), mat);
      crown.position.y = 0.1;
      hat.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.04, 16), M.redPaint);
      band.position.y = 0.04;
      hat.add(band);
      this.root.add(hat);
      this.hatObj = hat;
      this.hatIt = g.interact.add({
        kind: 'ee',
        pos: new THREE.Vector3(),
        radius: 1.8,
        prompt: () => (this.hatObj?.visible ? { text: 'agarrar el sombrero del Capataz', noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (!this.hatObj?.visible) return false;
          this.hatObj.visible = false;
          this.hasHat = true;
          g.hud.toast('Conseguiste: Sombrero del Capataz');
          g.audio.sting();
          if (this.done) g.hud.subtitle('Llevale el sombrero al Abuelo, en la capilla.', 4);
          return true;
        },
      });
    }
    // si cayó fuera del mapa (en una ventana), queda donde estás vos
    const zone = g.world.zoneAt(pos.x, pos.z);
    const p = zone ? pos : g.player.pos;
    this.hatObj.position.set(p.x, 0.03, p.z);
    this.hatObj.rotation.set(0.1, Math.random() * 6, 0.05);
    this.hatObj.visible = true;
    this.hatIt.pos.set(p.x, 0.5, p.z);
  }

  giveHat() {
    const g = this.g;
    this.hasHat = false;
    this.arenaGone = true;
    g.say('abuelo', LINES.go);
    g.post.flash(0.6);
    g.later(4.5, () => g.arena.start());
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    // mecedora
    if (g.world.power) {
      this.chair.rocker.rotation.x = Math.sin(t * 1.4) * 0.12;
      this.ghostMat.opacity = 0.35 + Math.sin(t * 2.3) * 0.08;
      if (Math.random() < 0.05) g.fx.sparkle(this.abueloPos, [0.6, 0.8, 1], 1, 0.8);
      // charla cuando te acercás
      this.talkT -= dt;
      const d = g.player.pos.distanceTo(this.abueloPos.clone().setY(0));
      if (d < 7 && this.talkT <= 0 && !this.arenaGone) {
        this.talkT = 25;
        const line = this.nextLine();
        this.talkT = Math.max(this.talkT, g.say('abuelo', line) + 18);
      }
    }
    // brillo de la calabaza en el estante
    if (this.calabazaState === 'shelf' && g.world.power && Math.floor(t * 1.2) % 3 === 0 && Math.random() < 0.3) {
      g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 1, 0.15);
    }
    if (this.calabazaState === 'falling' && !g.net?.guest) {
      this.calabazaVel.y -= 9.8 * dt;
      this.calabaza.position.addScaledVector(this.calabazaVel, dt);
      this.calabaza.rotation.x += dt * 8;
      if (this.calabaza.position.y <= 0.07) {
        this.calabaza.position.y = 0.07;
        this.calabazaState = 'floor';
        this.calabazaIt.pos.copy(this.calabaza.position).setY(0.6);
        g.audio.land();
      }
    }
    if (this.calabazaState === 'floor' && Math.random() < 0.1) g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 1, 0.2);
    if (this.hatObj?.visible && Math.random() < 0.15) g.fx.sparkle(this.hatObj.position, [1, 0.5, 0.3], 1, 0.4);
    // fogón (lo lleva el anfitrión; el invitado solo ve el vapor)
    if (this.hearth === 'heating' && g.net?.guest) {
      if (Math.random() < 0.3) {
        const p = new THREE.Vector3();
        this.hearthObj.pava.getWorldPosition(p);
        g.fx.steam(p.add(new THREE.Vector3(0, 0.3, 0)), 1, 0.1);
      }
    } else if (this.hearth === 'heating') {
      this.temp += dt * 6.2;
      if (Math.random() < this.temp / 200) {
        const p = new THREE.Vector3();
        this.hearthObj.pava.getWorldPosition(p);
        g.fx.steam(p.add(new THREE.Vector3(0, 0.3, 0)), 1, 0.1);
      }
      if (this.temp >= 98) {
        this.temp = 100;
        this.fail('hervida');
      }
    } else if (this.hearth === 'cooldown') {
      this.coolT -= dt;
      if (this.coolT <= 0) this.hearth = 'idle';
    }
    // barbacuá cargándose
    if (this.kiln === 'souls' && Math.random() < 0.3) g.fx.fire(this.kilnTarget, 0.5, 1);
  }

  nextLine() {
    if (this.done) return this.hasHat ? LINES.gotHat : LINES.hat;
    if (!this.introDone) {
      this.introDone = true;
      return LINES.intro;
    }
    const it = this.items;
    if (!it.calabaza) return LINES.calabaza;
    if (!it.bombilla) return LINES.bombilla;
    if (!it.yerba) return LINES.yerba;
    if (!it.agua) return LINES.agua;
    return LINES.ready;
  }
}

export { LINES };
