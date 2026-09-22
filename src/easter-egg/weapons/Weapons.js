import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WEAPONS, weaponStats, tierOf, KNIFE, GRENADE, BOWIE } from '../config/weapons';
import { buildMate, buildTermo, buildKnife, buildGrenade, buildPerkMate, muzzleTexture, getMats, VM_POSE } from './viewmodels';

// Armas: inventario, disparo (balas, proyectiles, rayos en cadena, conos),
// recarga (= cebar con el termo), cuchillo, granadas, pava silbadora y todas
// las animaciones de la vista en primera persona.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpV3 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const DRINK_DIP = 0.2;
const DRINK_DIR = new THREE.Vector3(-0.55, 0.25, 0.8).normalize();
const DRINK_MOUTH = new THREE.Vector3(0.0, -0.078, -0.07);
const hitTmp = {};
const HIP = new THREE.Vector3(0.19, -0.17, -0.4);
const ADS = new THREE.Vector3(0.0, -0.1, -0.29);
const SPRINT = new THREE.Vector3(0.12, -0.24, -0.32);
// inspeccionar: el mate se acerca al centro para mirarlo de cerca
const INSPECT = new THREE.Vector3(0.04, -0.11, -0.3);

export default class Weapons {
  constructor(game) {
    this.g = game;
    const T = game.textures;
    this.T = T;
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight(0x9aa8c8, 0x302418, 1.4);
    this.vmScene.add(this.vmHemi);
    this.vmKey = new THREE.DirectionalLight(0xffe2c0, 1.4);
    this.vmKey.position.set(0.6, 1, 0.4);
    this.vmScene.add(this.vmKey);
    this.vmFlash = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.vmScene.add(this.vmFlash);
    this.vmRoot = new THREE.Group();
    // reflejos para que los metales (virolas, bombillas) brillen
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.vmScene.environment = this.envMap;
    this.vmScene.environmentIntensity = 0.4;
    this.vmScene.add(this.vmRoot);
    this.holder = new THREE.Group();
    this.vmRoot.add(this.holder);

    this.termo = buildTermo(T);
    this.termo.root.visible = false;
    this.vmRoot.add(this.termo.root);
    this.vmRoot.add(this.termo.stream);
    this.spoutLocal = this.termo.spoutTip.position.clone();
    // vapor que sale de la yerba mientras se ceba
    this.puffs = [];
    const puffMat = new THREE.SpriteMaterial({ map: T.dot, color: 0xdde4ea, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.visible = false;
      this.vmRoot.add(s);
      this.puffs.push({ s, life: 0, vel: new THREE.Vector3() });
    }
    this.puffT = 0;
    this.knife = buildKnife(T);
    this.knife.visible = false;
    this.vmRoot.add(this.knife);
    this.knifePlata = buildKnife(T, 'plata');
    this.knifePlata.visible = false;
    this.vmRoot.add(this.knifePlata);
    this.nade = buildGrenade(T);
    this.nade.visible = false;
    this.vmRoot.add(this.nade);
    this.pavaVm = buildGrenade(T, 'pava');
    this.pavaVm.visible = false;
    this.vmRoot.add(this.pavaVm);
    this.perkMate = null;

    const mt = muzzleTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.08);
    this.flash.visible = false;
    this.models = new Map();
    this.projectiles = [];
    this.projGeo = new THREE.SphereGeometry(1, 10, 8);
    this.pose = { pos: HIP.clone(), rot: new THREE.Euler() };
    this.tuning = { HIP, ADS, SPRINT, VM_POSE };
    this.reset();
  }

  reset() {
    this.slots = [{ id: 'porongo', up: 0, mag: 8, reserve: 32 }];
    this.cur = 0;
    this.grenades = 2;
    this.tactical = null;
    this.state = 'raise';
    this.stateT = 0;
    this.fireCd = 0;
    this.adsT = 0;
    this.bloom = 0;
    this.recoilKick = 0;
    this.sway = new THREE.Vector2();
    this.shellsLeft = 0;
    this.burst = 0;
    this.lastStand = null;
    this.bowie = false;
    this.clearProjectiles();
    this.equipModel();
    this.updateHud();
  }

  get maxSlots() {
    return this.g.player.perks.has('mule') ? 3 : 2;
  }

  get slot() {
    return this.slots[this.cur];
  }

  get stats() {
    const s = this.slot;
    return s ? weaponStats(s.id, s.up) : null;
  }

  // Manos llenas: comprar otro mate reemplaza el que tenés en la mano.
  get full() {
    return this.slots.length >= this.maxSlots;
  }

  get currentName() {
    const s = this.slot;
    if (!s) return 'mate';
    return s.up ? weaponStats(s.id, s.up).name : WEAPONS[s.id].name;
  }

  has(id) {
    return this.slots.some((s) => s.id === id);
  }

  // Agrega un arma (o recarga munición si ya la tenés).
  give(id, up = 0) {
    up = tierOf(up);
    const w = WEAPONS[id];
    if (w.kind === 'tactical') {
      this.tactical = { id, count: w.count };
      this.updateHud();
      return 'tactical';
    }
    const st = weaponStats(id, up);
    const existing = this.slots.findIndex((s) => s.id === id);
    if (existing >= 0) {
      const s = this.slots[existing];
      s.up = Math.max(up, tierOf(s.up));
      const full = weaponStats(id, s.up);
      s.mag = full.mag;
      s.reserve = full.reserve;
      if (existing !== this.cur) this.switchTo(existing);
      else {
        this.equipModel();
        this.updateHud();
      }
      return 'ammo';
    }
    const entry = { id, up, mag: st.mag, reserve: st.reserve };
    if (this.slots.length < this.maxSlots) {
      this.slots.push(entry);
      this.switchTo(this.slots.length - 1);
      return 'new';
    }
    this.slots[this.cur] = entry;
    this.startRaise();
    return 'replaced';
  }

  // Saca el arma actual (para el Pack-a-Pava). Devuelve la entrada.
  take() {
    const s = this.slots.splice(this.cur, 1)[0];
    this.cur = Math.max(0, Math.min(this.cur, this.slots.length - 1));
    if (this.slots.length) this.startRaise();
    else {
      this.state = 'empty';
      this.holder.clear();
    }
    this.updateHud();
    return s;
  }

  // Al perder Mule Kick se pierde el tercer mate.
  trimSlots() {
    while (this.slots.length > this.maxSlots) this.slots.pop();
    if (this.cur >= this.slots.length) this.cur = this.slots.length - 1;
    this.startRaise();
  }

  maxAmmo() {
    for (const s of this.slots) s.reserve = weaponStats(s.id, s.up).reserve;
    this.grenades = GRENADE.max;
    this.updateHud();
  }

  // ¿Ya tiene toda la munición? (para no cobrar una recarga que no hace falta)
  ammoFull(id) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return false;
    const st = weaponStats(id, s.up);
    return s.reserve >= st.reserve && s.mag >= st.mag;
  }

  // Facón de Plata comprado en la pared: se desenvaina para mostrarlo.
  giveBowie() {
    this.bowie = true;
    this.startKnife();
    this.g.hud.subtitle(`${BOWIE.name}: los liquida de un tajo hasta la ronda ${BOWIE.oneHitUntil}.`, 4);
  }

  refillAmmo(id) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return false;
    const st = weaponStats(id, s.up);
    if (s.reserve >= st.reserve && s.mag >= st.mag) return false;
    s.reserve = st.reserve;
    this.updateHud();
    return true;
  }

  switchTo(i) {
    if (i === this.cur && this.state !== 'empty') {
      this.equipModel();
      this.updateHud();
      return;
    }
    this.cur = i;
    this.startRaise();
  }

  startRaise() {
    this.state = 'raise';
    this.stateT = 0;
    this.pourSnd?.stop();
    this.equipModel();
    this.updateHud();
  }

  equipModel() {
    this.holder.clear();
    const s = this.slot;
    if (!s) return;
    const key = `${s.id}|${s.up}`;
    let m = this.models.get(key);
    if (!m) {
      m = buildMate(s.id, s.up, this.T);
      this.models.set(key, m);
    }
    this.model = m;
    this.holder.add(m.root);
    m.muzzle.add(this.flash);
  }

  updateHud() {
    const s = this.slot;
    const st = this.stats;
    this.g.hud?.setWeapon(st ? { name: st.upgraded ? st.name : WEAPONS[s.id].name, mag: s.mag, reserve: s.reserve, upgraded: s.up, desc: WEAPONS[s.id].desc } : null);
    this.g.hud?.setGrenades(this.grenades, this.tactical?.count || 0);
  }

  get busy() {
    return ['reload', 'knife', 'throw', 'drink', 'raise', 'lower', 'empty'].includes(this.state) && !(this.state === 'reload' && this.stats?.shellReload);
  }

  // ---------------- entrada ----------------
  update(dt, input) {
    const g = this.g;
    const p = g.player;
    this.stateT += dt;
    this.fireCd -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 1.6);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9);
    const st = this.stats;
    const canAct = p.alive && !g.paused;

    // ADS
    const wantAds = canAct && input.mouse.right && !p.sprinting && this.state !== 'drink' && this.state !== 'knife' && st;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    this.ads = this.adsT > 0.6;

    switch (this.state) {
      case 'raise':
        if (this.stateT > 0.35) this.state = 'idle';
        break;
      case 'reload':
        if (st.shellReload) {
          const per = st.reload * p.reloadMult;
          if (this.stateT > per) {
            this.stateT = 0;
            const s = this.slot;
            if (s.reserve > 0 && s.mag < st.mag) {
              s.mag++;
              s.reserve--;
              g.audio.shell();
              this.updateHud();
            }
            if (s.mag >= st.mag || s.reserve <= 0) {
              this.state = 'idle';
              g.audio.mech(g.audio.now, [0, 0.12]);
            }
          }
          if (input.mouse.leftPressed && this.slot.mag > 0) this.state = 'idle';
        } else if (this.stateT >= this.reloadTime) {
          const s = this.slot;
          const need = st.mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
          this.state = 'idle';
          this.updateHud();
        }
        break;
      case 'knife':
        if (this.stateT > 0.22 && !this.knifeHit) this.knifeStrike();
        if (this.stateT > KNIFE.time) this.state = 'idle';
        break;
      case 'throw':
        if (this.stateT > 0.28 && !this.thrown) this.throwItem();
        if (this.stateT > 0.65) this.state = 'idle';
        break;
      case 'inspect':
        // correr lo corta
        if (p.sprinting) this.state = 'idle';
        break;
      case 'drink':
        if (this.stateT > this.drinkTime) {
          this.perkMate?.removeFromParent();
          this.perkMate = null;
          this.drinkDone?.();
          this.startRaise();
        }
        break;
      default:
        break;
    }

    if (canAct && st && this.state !== 'empty') this.handleInput(input, st, p);
    this.updateProjectiles(dt);
    this.animate(dt, input, st);
  }

  handleInput(input, st, p) {
    const g = this.g;
    // inspeccionar (E): se corta con E de nuevo, disparando o haciendo cualquier otra cosa
    if (this.state === 'inspect') {
      const again = input.hit('KeyE');
      const other = input.mouse.left || input.mouse.right || input.mouse.wheel || ['KeyR', 'KeyV', 'KeyG', 'KeyT', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].some((k) => input.hit(k));
      if (!again && !other) return;
      this.state = 'idle';
      if (again) return;
    } else if (input.hit('KeyE') && this.state === 'idle' && !p.sprinting && !this.ads) {
      this.state = 'inspect';
      this.stateT = 0;
      return;
    }
    // cambiar de arma
    const count = this.slots.length;
    let next = -1;
    if (input.hit('Digit1')) next = 0;
    if (input.hit('Digit2')) next = 1;
    if (input.hit('Digit3')) next = 2;
    if (input.mouse.wheel || input.hit('KeyQ')) next = (this.cur + (input.mouse.wheel < 0 ? -1 : 1) + count) % count;
    if (next >= 0 && next < count && next !== this.cur && !['knife', 'throw', 'drink'].includes(this.state)) {
      this.switchTo(next);
      return;
    }
    if (input.hit('KeyV') && !['knife', 'throw', 'drink'].includes(this.state)) {
      this.startKnife();
      return;
    }
    if (input.hit('KeyG') && this.grenades > 0 && !this.busyHard()) {
      this.startThrow('frag');
      return;
    }
    if ((input.hit('KeyT') || input.hit('Digit4')) && this.tactical?.count > 0 && !this.busyHard()) {
      this.startThrow('pava');
      return;
    }
    const s = this.slot;
    if (input.hit('KeyR') && this.state === 'idle' && s.mag < st.mag && s.reserve > 0) {
      this.startReload(st);
      return;
    }
    if (this.state !== 'idle' && !(this.state === 'reload' && st.shellReload)) return;
    if (p.sprinting) return;
    const trigger = st.auto ? input.mouse.left : input.mouse.leftPressed || (this.buffered && input.mouse.left);
    if (!st.auto && input.mouse.leftPressed && this.fireCd > 0) this.buffered = true;
    if (!trigger || this.fireCd > 0) return;
    this.buffered = false;
    if (s.mag <= 0) {
      if (input.mouse.leftPressed) g.audio.empty();
      if (s.reserve > 0) this.startReload(st);
      return;
    }
    this.state = 'idle';
    this.fire(st);
  }

  busyHard() {
    return ['knife', 'throw', 'drink', 'raise'].includes(this.state);
  }

  startReload(st) {
    const g = this.g;
    this.state = 'reload';
    this.stateT = 0;
    this.reloadTime = st.reload * g.player.reloadMult;
    if (!st.shellReload) this.pourSnd = g.audio.pour(this.reloadTime);
    else g.audio.mech(g.audio.now, [0]);
  }

  startKnife() {
    this.pourSnd?.stop();
    this.state = 'knife';
    this.stateT = 0;
    this.knifeHit = false;
    this.g.audio.knife(false);
  }

  knifeStrike() {
    const g = this.g;
    this.knifeHit = true;
    const cam = g.camera;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    fwd.normalize();
    let best = null;
    let bestD = Infinity;
    for (const { z, d } of g.zombies.inRadius(g.player.pos, KNIFE.lunge)) {
      const dx = z.pos.x - g.player.pos.x;
      const dz = z.pos.z - g.player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx / len) * fwd.x + (dz / len) * fwd.z < 0.55) continue;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    if (!best) return;
    // estocada: te acerca un poco si está a tiro de lunge
    if (bestD > KNIFE.range) {
      g.player.lunge(best.pos, bestD - 0.9);
    }
    const point = tmpV2.set(best.pos.x, 1.3 * best.scale, best.pos.z);
    // con el Facón de Plata se liquida de un tajo (y casi siempre vuela la cabeza)
    let dmg = KNIFE.damage;
    if (this.bowie) dmg = g.rounds.round <= BOWIE.oneHitUntil ? 1e9 : KNIFE.damage * BOWIE.mult;
    g.zombies.damage(best, dmg, { type: 'knife', zone: 'torso', point, dir: fwd.clone(), decap: this.bowie ? Math.random() < 0.85 : Math.random() < 0.3 });
    g.audio.knife(true);
    g.fx.addShake(0.08);
  }

  startThrow(kind) {
    this.pourSnd?.stop();
    this.state = 'throw';
    this.stateT = 0;
    this.thrown = false;
    this.throwKind = kind;
  }

  throwItem() {
    const g = this.g;
    this.thrown = true;
    const cam = g.camera;
    const dir = tmpV.set(0, 0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const pos = tmpV2.copy(cam.position).addScaledVector(dir, 0.5);
    if (this.throwKind === 'frag') {
      this.grenades--;
      this.spawnProjectile({ kind: 'grenade', pos, vel: dir.clone().multiplyScalar(15), gravity: 12, fuse: GRENADE.fuse, bounce: true, mesh: buildGrenade(this.T) });
    } else {
      this.tactical.count--;
      this.spawnProjectile({ kind: 'pava', pos, vel: dir.clone().multiplyScalar(11), gravity: 12, fuse: 8, bounce: true, mesh: buildGrenade(this.T, 'pava') });
      if (this.tactical.count <= 0) this.tactical = null;
    }
    this.updateHud();
  }

  // Tomar un perk: el arma baja y aparece un mate cebado con esa yerba.
  drink(color, onDone) {
    this.pourSnd?.stop();
    this.state = 'drink';
    this.stateT = 0;
    this.drinkTime = 2.3;
    this.drinkDone = onDone;
    const pm = buildPerkMate(this.T, color);
    this.perkMate = pm.root;
    this.perkTip = pm.tip;
    // orientación final: la bombilla cruza en diagonal desde abajo a la derecha hasta la boca
    this.perkQ = new THREE.Quaternion().setFromUnitVectors(pm.strawDir, DRINK_DIR);
    // girarlo alrededor de la bombilla para que la boca del mate quede para arriba (no se ve la yerba de frente)
    let best = -Infinity;
    let bestQ = this.perkQ.clone();
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const q = new THREE.Quaternion().setFromAxisAngle(DRINK_DIR, a).multiply(this.perkQ);
      const up = tmpV.set(0, 1, 0).applyQuaternion(q);
      const score = up.y - up.z * 0.6;
      if (score > best) {
        best = score;
        bestQ = q;
      }
    }
    this.perkQ = bestQ;
    this.perkQ0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, -0.4, -0.2));
    // el mate se ubica respecto del cuerpo; como la mirada baja, este marco sube
    if (!this.drinkFrame) {
      this.drinkFrame = new THREE.Group();
      this.vmRoot.add(this.drinkFrame);
    }
    this.drinkFrame.add(this.perkMate);
    this.g.later(0.6, () => this.g.audio.sip());
  }

  // ---------------- disparo ----------------
  fire(st) {
    const g = this.g;
    const p = g.player;
    const s = this.slot;
    const rateMult = p.perks.has('doubletap') ? 1.33 : 1;
    this.fireCd = 60 / st.rpm / rateMult;
    s.mag--;
    this.updateHud();
    g.audio.shot(st.sound, null, st.upgraded);
    g.stats.shots++;
    const cam = g.camera;
    const origin = cam.position;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const muzzle = this.muzzleWorld(new THREE.Vector3());

    // dispersión
    let spread = st.spread || 0;
    if (this.ads) spread = st.adsSpread ?? spread * 0.18;
    if (p.moving) spread *= 1.5;
    if (p.crouching) spread *= 0.75;
    if (!p.onGround) spread *= 2;
    spread += this.bloom * (this.ads ? 0.3 : 1) * 0.04;
    if (st.wobble) spread += Math.sin(g.time * 13) * 0.02;

    const kick = st.recoil * (this.ads ? 0.6 : 1) * (p.crouching ? 0.8 : 1);
    p.addRecoil(kick * 0.35, (Math.random() - 0.5) * kick * 0.25);
    this.recoilKick = Math.min(1.5, this.recoilKick + kick * 6 + 0.3);
    this.bloom = Math.min(1, this.bloom + st.recoil * 2);
    this.flashT = 0.05;
    if (!st.special || st.kind === 'projectile') {
      g.fx.flash(muzzle, st.kind === 'projectile' && st.projectile?.glow ? st.projectile.color : 0xffb060, 8, 0.06, 7);
    }

    switch (st.kind) {
      case 'hitscan':
        for (let i = 0; i < (st.pellets || 1); i++) this.hitscan(st, origin, fwd, muzzle, spread, i);
        break;
      case 'projectile':
        this.fireProjectile(st, origin, fwd, muzzle, spread);
        break;
      case 'bolt':
        this.fireBolt(st, origin, fwd, muzzle);
        break;
      case 'chain':
        this.fireChain(st, origin, fwd, muzzle);
        break;
      case 'freeze':
        this.fireCone(st, origin, fwd, muzzle, 'freeze');
        break;
      case 'blast':
        this.fireCone(st, origin, fwd, muzzle, 'blast');
        break;
      case 'stream':
        this.fireStream(st, origin, fwd, muzzle);
        break;
      default:
        break;
    }
    // los tiros espantan a los cuervos del patio
    if (st.sound !== 'stream' || Math.random() < 0.1) g.critters?.onNoise(muzzle);
    // en línea: los demás ven y escuchan el disparo
    if (g.net) {
      const end = tmpV2.copy(muzzle).addScaledVector(fwd, Math.min(st.range, 40));
      g.net.sendShot(muzzle, end, st.sound, st.upgraded);
    }
    // recarga automática al vaciar
    if (s.mag <= 0 && s.reserve > 0) this.g.later(0.2, () => this.state === 'idle' && this.slot === s && this.startReload(this.stats));
  }

  muzzleWorld(out) {
    // posición de la punta de la bombilla (en el espacio de la cámara) pasada al mundo
    this.model.muzzle.getWorldPosition(out);
    return this.g.camera.localToWorld(out);
  }

  randomDir(fwd, spread, out) {
    out.copy(fwd);
    if (spread <= 0) return out;
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const up = Math.abs(fwd.y) > 0.99 ? tmpV2.set(1, 0, 0) : tmpV2.set(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const u = new THREE.Vector3().crossVectors(right, fwd);
    out.addScaledVector(right, Math.cos(a) * r).addScaledVector(u, Math.sin(a) * r).normalize();
    return out;
  }

  hitscan(st, origin, fwd, muzzle, spread, pellet) {
    const g = this.g;
    const dir = this.randomDir(fwd, spread, new THREE.Vector3());
    const range = st.range * 1.6;
    const wallT = g.world.raycast(origin, dir, range, hitTmp);
    const maxT = Math.min(wallT, range);
    const hits = g.zombies.raycast(origin, dir, maxT);
    let pen = st.pen || 1;
    let dmgMult = 1;
    let endT = maxT;
    let hitAny = false;
    for (const h of hits) {
      if (pen <= 0) break;
      const point = new THREE.Vector3().copy(origin).addScaledVector(dir, h.t);
      const falloff = h.t > st.range ? 0.55 : 1;
      let mult = 1;
      if (h.zone === 'head') mult = st.headMult;
      else if (h.zone === 'neck') mult = Math.max(1, st.headMult * 0.5);
      g.zombies.damage(h.z, st.damage * mult * falloff * dmgMult, { type: 'bullet', zone: h.zone, arm: h.arm, point, dir, burn: st.burn, elem: st.elem });
      if (st.explosive) this.explode(point, st.explosive.radius, st.explosive.damage, { color: [0.6, 1, 0.4], elem: st.elem });
      if (!hitAny) {
        g.hud.hitmarker(h.zone === 'head');
        g.audio.hitmarker(h.zone === 'head');
      }
      hitAny = true;
      dmgMult *= 0.75;
      endT = h.t;
      pen--;
    }
    // la bala siguió de largo hasta una pared
    if (pen > 0 && Number.isFinite(wallT) && wallT <= range) {
      endT = wallT;
      g.fx.impact(hitTmp);
      if (st.explosive && !hitAny) this.explode(hitTmp.point, st.explosive.radius, st.explosive.damage, { color: [0.6, 1, 0.4], elem: st.elem });
    }
    if (pen > 0) {
      g.ee.onShot(origin, dir, Math.min(endT, range));
      g.secrets?.onShot(origin, dir, Math.min(endT, range));
    }
    if (pellet < 2) {
      const end = new THREE.Vector3().copy(origin).addScaledVector(dir, Math.min(endT, 80));
      g.fx.tracer(muzzle, end, st.upgraded ? 0xffa0ff : 0xfff0c8);
    }
  }

  // Punto al que apunta la mira (para que los proyectiles converjan ahí).
  aimPoint(origin, dir, range) {
    const g = this.g;
    const t = g.world.raycast(origin, dir, range, hitTmp);
    const hits = g.zombies.raycast(origin, dir, Math.min(t, range));
    const tt = hits.length ? hits[0].t : Math.min(t, range);
    return new THREE.Vector3().copy(origin).addScaledVector(dir, tt);
  }

  fireProjectile(st, origin, fwd, muzzle, spread) {
    const P = st.projectile;
    const dir = this.randomDir(fwd, spread * 0.5, new THREE.Vector3());
    const target = this.aimPoint(origin, dir, st.range);
    const vel = target.sub(muzzle).normalize().multiplyScalar(P.speed);
    let mesh;
    if (P.teabag) {
      mesh = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.015), new THREE.MeshStandardMaterial({ color: P.color, roughness: 1 }));
      mesh.add(bag);
    } else {
      mesh = new THREE.Mesh(this.projGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(P.color).multiplyScalar(P.glow ? 3 : 1.5), toneMapped: false }));
      mesh.scale.setScalar(P.size * 0.6);
    }
    this.spawnProjectile({ kind: 'shot', pos: muzzle.clone(), vel, gravity: P.gravity, P, st, mesh, life: 4 });
  }

  fireBolt(st, origin, fwd, muzzle) {
    const B = st.bolt;
    const target = this.aimPoint(origin, fwd, st.range);
    const vel = target.sub(muzzle).normalize().multiplyScalar(B.speed);
    const mesh = new THREE.Group();
    const M = getMats(this.T);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), M.silver);
    tube.rotation.x = Math.PI / 2;
    mesh.add(tube);
    if (st.upgraded) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M.glowGreen);
      glow.position.z = 0.12;
      mesh.add(glow);
    }
    this.spawnProjectile({ kind: 'bolt', pos: muzzle.clone(), vel, gravity: 2, B, st, mesh, life: 6 });
  }

  fireChain(st, origin, fwd, muzzle) {
    const g = this.g;
    const C = st.chain;
    let first = null;
    let bestScore = Infinity;
    for (const { z, d } of g.zombies.inRadius(origin, st.range)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1.1 * z.scale - origin.y, z.pos.z - origin.z);
      const len = tmpV2.length();
      const dot = tmpV2.dot(fwd) / (len || 1);
      if (dot < 0.97) continue;
      const score = d * (1.5 - dot);
      if (score < bestScore && g.world.clear(origin, tmpV.set(z.pos.x, z.pos.y + 1.1 * z.scale, z.pos.z))) {
        bestScore = score;
        first = z;
      }
    }
    g.fx.flash(muzzle, 0x9ac8ff, 30, 0.3, 10);
    if (!first) {
      const end = this.aimPoint(origin, fwd, st.range);
      g.fx.lightning(muzzle, end);
      return;
    }
    const visited = new Set([first]);
    let prev = muzzle.clone();
    let cur = first;
    for (let i = 0; i < C.targets && cur; i++) {
      const target = cur;
      const at = new THREE.Vector3(target.pos.x, target.pos.y + 1.1 * target.scale, target.pos.z);
      const from = prev.clone();
      this.g.later(i * 0.07, () => {
        g.fx.lightning(from, at);
        g.fx.electric(at, 12);
        g.audio.zap(at);
        g.zombies.damage(target, 1e9, { type: 'chain', point: at });
      });
      prev = at;
      let next = null;
      let nd = C.hop;
      for (const { z } of g.zombies.inRadius(at, C.hop)) {
        if (visited.has(z)) continue;
        const d = z.pos.distanceTo(target.pos);
        if (d < nd && g.world.clear(at, tmpV.set(z.pos.x, 1.1, z.pos.z))) {
          nd = d;
          next = z;
        }
      }
      if (next) visited.add(next);
      cur = next;
    }
  }

  // Bombilla del Diablo: un chorro de agua hirviendo que atraviesa a todos los que toca.
  fireStream(st, origin, fwd, muzzle) {
    const g = this.g;
    const range = st.range;
    const wallT = g.world.raycast(origin, fwd, range, hitTmp);
    const maxT = Math.min(wallT, range);
    const R = st.stream?.radius || 0.7;
    const end = new THREE.Vector3().copy(origin).addScaledVector(fwd, maxT);
    let hit = false;
    for (const { z } of g.zombies.inRadius(origin, maxT + 1.5)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1 * z.scale - origin.y, z.pos.z - origin.z);
      const along = tmpV2.dot(fwd);
      if (along < 0.2 || along > maxT + 0.5) continue;
      const perp = tmpV2.addScaledVector(fwd, -along).length();
      if (perp > R + 0.35) continue;
      const point = new THREE.Vector3().copy(origin).addScaledVector(fwd, along);
      g.zombies.damage(z, st.damage, { type: 'scald', point, dir: fwd.clone() });
      hit = true;
    }
    if (hit) g.hud.hitmarker(false);
    g.fx.waterJet(muzzle, end, st.upgraded);
    g.ee.onShot(origin, fwd, maxT);
    g.secrets?.onShot(origin, fwd, maxT);
  }

  fireCone(st, origin, fwd, muzzle, type) {
    const g = this.g;
    const C = st.cone;
    const cos = Math.cos(C.angle);
    if (type === 'freeze') g.fx.frostCone(muzzle, fwd, st.range);
    else {
      g.fx.blastCone(muzzle, fwd, st.range);
      g.fx.addShake(0.5);
    }
    const list = [];
    for (const { z, d } of g.zombies.inRadius(origin, st.range)) {
      tmpV2.set(z.pos.x - origin.x, z.pos.y + 1 - origin.y, z.pos.z - origin.z);
      const len = tmpV2.length() || 1;
      if (tmpV2.dot(fwd) / len < cos && d > 1.5) continue;
      if (!g.world.clear(origin, tmpV.set(z.pos.x, 1.1, z.pos.z))) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    for (const { z } of list.slice(0, C.targets)) {
      const dir = new THREE.Vector3(z.pos.x - origin.x, 0, z.pos.z - origin.z).normalize();
      g.zombies.damage(z, 1e9, { type, dir, point: new THREE.Vector3(z.pos.x, 1.2, z.pos.z) });
    }
  }

  // ---------------- proyectiles ----------------
  spawnProjectile(p) {
    p.pos = p.pos.clone();
    p.prev = p.pos.clone();
    p.t = 0;
    p.life = p.life ?? 10;
    p.stuck = null;
    p.resting = false;
    if (p.mesh) {
      this.g.scene.add(p.mesh);
      p.mesh.position.copy(p.pos);
    }
    this.projectiles.push(p);
  }

  clearProjectiles() {
    for (const p of this.projectiles || []) p.mesh?.removeFromParent();
    this.projectiles = [];
    if (this.g.lures) this.g.lures.length = 0;
  }

  updateProjectiles(dt) {
    const g = this.g;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.fuse !== undefined && p.t >= p.fuse && p.kind !== 'shot') {
        this.detonate(p);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.t > p.life && p.kind === 'shot') {
        p.mesh?.removeFromParent();
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.stuck) {
        if (p.stuck.z && p.stuck.z.active) {
          p.pos.set(p.stuck.z.pos.x, 1.1 * p.stuck.z.scale, p.stuck.z.pos.z);
        }
        p.mesh.position.copy(p.pos);
        if (p.B?.lure) this.setLure(p, p.pos);
        if (p.t >= p.stuck.until) {
          this.boltBoom(p);
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      if (p.resting) {
        if (p.kind === 'pava') {
          this.setLure(p, p.pos);
          if (Math.random() < 0.3) g.fx.steam(tmpV.copy(p.pos).add(tmpV2.set(0, 0.12, 0)), 1, 0.05);
          p.mesh.rotation.z = Math.sin(p.t * 30) * 0.05;
        }
        continue;
      }
      p.prev.copy(p.pos);
      p.vel.y -= (p.gravity || 0) * dt;
      p.pos.addScaledVector(p.vel, dt);
      // trayecto de este cuadro contra paredes y zombies
      const seg = tmpV.subVectors(p.pos, p.prev);
      const len = seg.length();
      if (len > 1e-5) {
        const dir = seg.clone().divideScalar(len);
        const wallT = g.world.raycast(p.prev, dir, len, hitTmp);
        const zh = p.kind === 'grenade' || p.kind === 'pava' ? [] : g.zombies.raycast(p.prev, dir, Math.min(wallT, len));
        if (zh.length) {
          const h = zh[0];
          const point = p.prev.clone().addScaledVector(dir, h.t);
          if (this.onProjectileHit(p, point, dir, h)) {
            this.projectiles.splice(i, 1);
            continue;
          }
        } else if (Number.isFinite(wallT)) {
          const point = hitTmp.point.clone();
          if (p.bounce) {
            // rebote
            const n = hitTmp.normal;
            p.pos.copy(point).addScaledVector(n, 0.05);
            const vn = p.vel.dot(n);
            p.vel.addScaledVector(n, -1.6 * vn).multiplyScalar(0.55);
            if (n.y > 0.7 && p.vel.length() < 1.2) {
              p.resting = true;
              p.pos.y = Math.max(p.pos.y, 0.05);
              if (p.kind === 'pava') {
                g.audio.kettle(p.pos, Math.max(1, p.fuse - p.t));
                p.mesh.rotation.set(0, Math.random() * 6, 0);
              }
            } else g.audio.shell();
          } else if (this.onProjectileHit(p, point, dir, null)) {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.kind === 'bolt' || p.P?.teabag) {
          p.mesh.lookAt(tmpV2.copy(p.pos).add(p.vel));
          if (p.P?.teabag) p.mesh.rotation.z += dt * 12;
        } else if (p.kind === 'grenade' || p.kind === 'pava') {
          p.mesh.rotation.x += dt * 8;
          p.mesh.rotation.y += dt * 5;
        }
      }
      // estela
      if (p.P?.glow) g.fx.sparkle(p.pos, colorArr(p.P.color), 2, 0.05);
      else if (p.P?.trail) g.fx.sparkle(p.pos, colorArr(p.P.trail), 1, 0.03);
      if (p.pos.y < -2) {
        p.mesh?.removeFromParent();
        this.projectiles.splice(i, 1);
      }
    }
    // los señuelos vencidos se borran solos en Game
  }

  setLure(p, pos) {
    const lures = this.g.lures;
    let l = lures.find((x) => x.src === p);
    if (!l) {
      l = { src: p, pos: pos.clone() };
      lures.push(l);
    }
    l.pos.copy(pos);
  }

  removeLure(p) {
    const lures = this.g.lures;
    const i = lures.findIndex((x) => x.src === p);
    if (i >= 0) lures.splice(i, 1);
  }

  // Devuelve true si el proyectil terminó.
  onProjectileHit(p, point, dir, zhit) {
    const g = this.g;
    if (p.kind === 'bolt') {
      p.stuck = { z: zhit ? zhit.z : null, until: p.t + p.B.fuse };
      p.pos.copy(point);
      if (zhit) g.fx.blood(point, dir, 6);
      else g.fx.sparks(point, 0.5, hitTmp.normal || { x: 0, y: 1, z: 0 });
      g.audio.shell();
      return false;
    }
    const P = p.P;
    const st = p.st;
    if (zhit) {
      const type = st.id === 'oro' ? 'yerba' : 'explosive';
      g.zombies.damage(zhit.z, P.damage * (zhit.zone === 'head' ? st.headMult || 1 : 1), { type: P.radius > 0 ? type : 'bullet', zone: zhit.zone, point, dir, elem: st.elem });
      g.hud.hitmarker(zhit.zone === 'head');
    }
    if (P.radius > 0) {
      const color = colorArr(P.color);
      this.explode(point, P.radius, P.splash ?? P.damage, { color, selfDamage: P.selfDamage ?? (st.id === 'porongo' ? 35 : 0), skip: zhit?.z, type: st.id === 'oro' ? 'yerba' : 'explosive', big: P.glow ? 0.6 : 1, elem: st.elem });
    } else if (!zhit && hitTmp.normal) {
      g.fx.impact({ point, normal: hitTmp.normal });
    }
    p.mesh?.removeFromParent();
    return true;
  }

  boltBoom(p) {
    this.removeLure(p);
    p.mesh?.removeFromParent();
    this.explode(p.pos, p.B.radius, p.B.damage, { color: p.st.upgraded ? [0.5, 1, 0.4] : [1, 0.55, 0.2], selfDamage: 60, elem: p.st.elem });
  }

  detonate(p) {
    const g = this.g;
    p.mesh?.removeFromParent();
    if (p.kind === 'pava') {
      this.removeLure(p);
      this.explode(p.pos, 6, 2500, { selfDamage: 0 });
      g.fx.steam(p.pos, 20, 1.2);
    } else if (p.kind === 'grenade') {
      this.explode(p.pos, GRENADE.radius, GRENADE.damage + g.rounds.round * 40, { selfDamage: 75 });
    }
  }

  // Explosión con daño decreciente y línea de visión.
  explode(pos, radius, damage, { color = [1, 0.55, 0.2], selfDamage = 0, skip = null, type = 'explosive', big = 1, elem } = {}) {
    const g = this.g;
    g.fx.explosion(pos, radius * big, color);
    g.audio.explosion(pos, big);
    g.critters?.onNoise(pos, 22);
    const from = tmpV.copy(pos).add(tmpV2.set(0, 0.4, 0));
    for (const { z, d } of g.zombies.inRadius(pos, radius)) {
      if (z === skip) continue;
      if (!g.world.clear(from, new THREE.Vector3(z.pos.x, 1, z.pos.z))) continue;
      const k = 1 - (d / radius) * 0.6;
      const dir = new THREE.Vector3(z.pos.x - pos.x, 0.3, z.pos.z - pos.z).normalize();
      g.zombies.damage(z, damage * k, { type, dir, point: new THREE.Vector3(z.pos.x, 1, z.pos.z), elem });
    }
    const pd = g.player.pos.distanceTo(pos);
    if (selfDamage > 0 && pd < radius * 0.8 && g.world.clear(from, g.camera.position)) {
      g.player.damage(selfDamage * (1 - pd / radius), pos, true);
    }
    g.ee.onExplosion(pos, radius);
    g.secrets?.onExplosion(pos, radius);
  }

  // ---------------- animación de la vista ----------------
  animate(dt, input, st) {
    const g = this.g;
    const p = g.player;
    const pose = this.pose;
    const ads = this.adsT;
    const sprint = p.sprinting && this.state !== 'reload' ? 1 : 0;
    this.sprintT = (this.sprintT || 0) + (sprint - (this.sprintT || 0)) * Math.min(1, dt * 8);
    const sp = this.sprintT;

    // al apuntar, la punta de la bombilla queda justo debajo de la mira
    const tip = this.model?.tip;
    const ads3 = tip ? tmpV2.set(-tip.x, -0.018 - tip.y, -0.3 - tip.z) : ADS;
    const target = tmpV.copy(HIP).lerp(ads3, ads).lerp(SPRINT, sp);
    let rx = sp * -0.35;
    let ry = sp * 0.7;
    let rz = sp * 0.35;

    // balanceo al caminar
    const bobAmp = (p.moving && p.onGround ? 1 : 0) * (1 - ads * 0.85) * (1 + sp * 1.2);
    const bp = p.bobPhase;
    target.x += Math.cos(bp) * 0.011 * bobAmp;
    target.y += -Math.abs(Math.sin(bp)) * 0.012 * bobAmp;
    rz += Math.cos(bp) * 0.02 * bobAmp;
    // respiración
    target.y += Math.sin(g.time * 1.6) * 0.0025 * (1 - ads);
    // inercia del mouse
    this.sway.x += (-input.mouse.dx * 0.00025 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (input.mouse.dy * 0.00025 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-0.03, 0.03);
    target.x += this.sway.x * (1 - ads * 0.7);
    target.y += this.sway.y * (1 - ads * 0.7);
    ry += this.sway.x * 1.5;
    rx += this.sway.y * 1.5;
    // retroceso
    const rk = this.recoilKick;
    target.z += rk * 0.025;
    rx += rk * 0.09;
    // agacharse / caer
    target.y -= p.landKick * 0.04;

    // estados
    const t = this.stateT;
    this.knife.visible = false;
    this.knifePlata.visible = false;
    this.nade.visible = false;
    this.pavaVm.visible = false;
    this.holder.visible = this.state !== 'empty';
    let lower = 0;
    if (this.state === 'raise') lower = 1 - Math.min(1, t / 0.35);
    let pour = null;
    if (this.state === 'reload' && st && !st.shellReload) {
      // cebar: el mate se acerca y muestra la boca; el termo se la busca
      const k = Math.min(1, t / this.reloadTime);
      const tilt = smooth(clamp01(k / 0.2)) * (1 - smooth(clamp01((k - 0.84) / 0.16)));
      rz += tilt * 0.36;
      rx += tilt * 0.34;
      ry -= tilt * 0.12;
      target.x -= tilt * 0.06;
      target.y += tilt * 0.035;
      target.z += tilt * 0.03;
      pour = k;
    }
    if (this.state === 'reload' && st?.shellReload) {
      const k = (t / (st.reload * p.reloadMult)) % 1;
      rx += Math.sin(k * Math.PI) * 0.25;
      target.y -= Math.sin(k * Math.PI) * 0.02;
    }
    if (this.state === 'knife') {
      lower = 0.6;
      const k = Math.min(1, t / KNIFE.time);
      const kn = this.bowie ? this.knifePlata : this.knife;
      kn.visible = true;
      const sw = smooth(Math.min(1, k / 0.45));
      kn.position.set(0.25 - sw * 0.4, -0.12 + Math.sin(sw * Math.PI) * 0.06, -0.36 - Math.sin(sw * Math.PI) * 0.08);
      kn.rotation.set(-1.2 + sw * 0.4, 0.3, -1.4 + sw * 1.8);
    }
    if (this.state === 'throw') {
      lower = 0.7;
      const k = Math.min(1, t / 0.6);
      const obj = this.throwKind === 'pava' ? this.pavaVm : this.nade;
      obj.visible = !this.thrown;
      obj.position.set(0.12 - k * 0.05, -0.12 + Math.sin(k * Math.PI) * 0.1, -0.3 - k * 0.2);
      obj.rotation.set(-k * 2, 0, 0);
    }
    if (this.state === 'drink' && this.perkMate) {
      // tomar: la punta de la bombilla va a la boca, tres sorbos y el ruidito final
      lower = 1;
      const D = this.drinkTime;
      const k = smooth(clamp01((t - 0.15) / 0.45)) * (1 - smooth(clamp01((t - (D - 0.5)) / 0.45)));
      const pm = this.perkMate;
      this.viewDip = k * DRINK_DIP;
      this.drinkFrame.rotation.x = this.viewDip;
      pm.quaternion.slerpQuaternions(this.perkQ0, this.perkQ, k);
      const sip = k > 0.95 && t < 1.9 ? Math.max(0, Math.sin(((t - 0.62) * Math.PI * 2) / 0.28)) * 0.006 : 0;
      const local = tmpV2.copy(this.perkTip).applyQuaternion(pm.quaternion);
      // la punta de la bombilla va a la boca (justo debajo del borde de la pantalla)
      pm.position.copy(DRINK_MOUTH).sub(local).addScaledVector(DRINK_DIR, -sip);
      pm.position.x += (1 - k) * 0.12;
      pm.position.y -= (1 - k) * 0.25;
    } else this.viewDip = Math.max(0, (this.viewDip || 0) - dt * 2);
    // inspeccionar: lo trae al centro, inclina la boca para ver la yerba y lo
    // va girando despacio para mostrar la calabaza y la virola
    const insp = this.state === 'inspect' ? smooth(clamp01(t / 0.4)) : 0;
    this.inspK = (this.inspK || 0) + (insp - (this.inspK || 0)) * Math.min(1, dt * 12);
    const ik = this.inspK;
    if (ik > 0.001) {
      const c = Math.max(0, t - 0.4);
      target.lerp(INSPECT, ik);
      rx += ik * (0.62 + Math.sin(c * 1.05) * 0.16);
      ry += ik * (Math.sin(c * 0.7) * 0.85 - 0.2);
      rz += ik * (0.25 + Math.sin(c * 0.55 + 1) * 0.22);
    }
    const bg = this.model?.bombGroup;
    if (bg) bg.rotation.y = ik * Math.sin(Math.max(0, t - 0.6) * 1.6) * 0.9;
    if (this.state === 'empty') lower = 1;
    target.y -= lower * 0.35;
    rx -= lower * 0.5;

    pose.pos.lerp(target, Math.min(1, dt * 18));
    this.holder.position.copy(pose.pos);
    this.holder.rotation.set(rx, ry, rz);
    this.animatePour(pour, dt);

    // fogonazo
    this.flashT = (this.flashT || 0) - dt;
    this.flash.visible = this.flashT > 0 && !st?.special;
    if (this.flash.visible) {
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.scale.setScalar(0.05 + Math.random() * 0.05);
    }
    this.vmFlash.intensity = this.flashT > 0 ? 3 : 0;
    if (this.vmFlash.intensity > 0) this.model.muzzle.getWorldPosition(this.vmFlash.position);

    // animaciones propias del arma
    const m = this.model;
    if (m) {
      for (const s of m.anim.spin) s.rotation.z += dt * (this.state === 'idle' ? 2 : 8);
      for (const gl of m.anim.glow) gl.scale.setScalar(0.85 + Math.sin(g.time * 8) * 0.15 + (this.flashT > 0 ? 0.5 : 0));
      if (m.anim.wobble) m.anim.wobble.rotation.z = Math.sin(g.time * 9) * 0.06 + this.sway.x * 3;
    }
    if (m?.upgraded || this.slots.some((s) => s.up)) {
      const camo = getMats(this.T).camo;
      camo.map.offset.x = (g.time * 0.05) % 1;
      camo.map.offset.y = (g.time * 0.03) % 1;
      camo.emissiveIntensity = 0.7 + Math.sin(g.time * 3) * 0.25;
    }
    // la luz de la vista sigue un poco la del lugar
    const lvl = g.lightLevel ?? 1;
    this.vmHemi.intensity = 0.6 + lvl * 1.0;
    this.vmKey.intensity = 0.4 + lvl * 1.1;
  }

  // El termo busca la boca del mate: se ubica para que el pico quede arriba de
  // la yerba, se inclina y el chorro cae justo adentro (con vapor).
  animatePour(k, dt) {
    const T = this.termo;
    const tr = T.root;
    if (k === null || !this.model?.mouth) {
      tr.visible = false;
      T.stream.visible = false;
    } else {
      this.holder.updateMatrixWorld(true);
      const mouth = this.model.mouth.getWorldPosition(tmpV3);
      const enter = smooth(clamp01((k - 0.03) / 0.2));
      const leave = smooth(clamp01((k - 0.8) / 0.17));
      const tip = smooth(clamp01((k - 0.14) / 0.16)) * (1 - smooth(clamp01((k - 0.72) / 0.12)));
      const g = this.g;
      tr.visible = k > 0.03 && k < 0.97;
      tr.rotation.set(0.12, -0.3, -0.4 - tip * 1.52 + Math.sin(g.time * 7) * 0.025 * tip);
      const local = tmpV2.copy(this.spoutLocal).applyEuler(tr.rotation);
      tr.position.copy(mouth).add(tmpV.set(-0.018, 0.065 + (1 - tip) * 0.05, 0.004)).sub(local);
      const away = 1 - enter + leave;
      tr.position.x -= away * 0.24;
      tr.position.y -= away * 0.32;
      tr.position.z += away * 0.06;
      const pouring = tip > 0.9 && k < 0.74;
      T.stream.visible = pouring;
      if (pouring) {
        tr.updateMatrixWorld(true);
        const a = T.spoutTip.getWorldPosition(tmpV);
        const d = tmpV2.subVectors(mouth, a);
        const len = d.length();
        T.stream.position.copy(a);
        T.stream.quaternion.setFromUnitVectors(DOWN, d.normalize());
        const w = 1 + Math.sin(g.time * 47) * 0.12;
        T.stream.scale.set(w, len, w);
        this.puffT -= dt;
        if (this.puffT <= 0) {
          this.puffT = 0.09;
          const p = this.puffs.find((x) => x.life <= 0);
          if (p) {
            p.life = 0.9;
            p.s.position.copy(mouth).add(tmpV.set((Math.random() - 0.5) * 0.02, 0.005, (Math.random() - 0.5) * 0.02));
            p.vel.set((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.03, (Math.random() - 0.5) * 0.02);
            p.s.visible = true;
          }
        }
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.vel, dt);
      const a = Math.max(0, p.life / 0.9);
      p.s.material.opacity = a * (1 - a) * 1.1;
      p.s.scale.setScalar(0.012 + (1 - a) * 0.05);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  // Tamaño de la mira (para el HUD).
  get crosshair() {
    const st = this.stats;
    if (!st) return 0;
    const p = this.g.player;
    let s = st.spread || 0.02;
    if (p.moving) s *= 1.5;
    if (p.crouching) s *= 0.75;
    if (!p.onGround) s *= 2;
    s += this.bloom * 0.04;
    return s * (1 - this.adsT);
  }
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function colorArr(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export { tmpQ, HIP };
