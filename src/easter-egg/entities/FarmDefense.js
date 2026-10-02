import * as THREE from 'three';
import { EE, ZONES, PROPS, DOORS } from '../config/map';
import { zombieHealth } from '../config/rules';
import { mesh, cylGeo } from '../world/props';
import Navigation from '../world/Navigation';

// La defensa del yerbal (la granja). Cada 10 rondas la ronda entera es una
// horda que viene con el Cuervo a romper las cinco parcelas de los tablones:
// una por cada planta que se corta con la Hoz de la Muerte.
//  - Las tranqueras tapiadas de los tablones se quedan sin tablas y no se
//    pueden volver a clavar: los muertos entran derecho (los jugadores siguen
//    sin poder pasar por ahí). La tranquera del patio se abre sola.
//  - De cuatro brocales de piedra suben torres con un mate gigante que les
//    tira agua hirviendo por la bombilla. Tiran solas, pero se quedan sin agua
//    y hay que cebarlas (mantener F).
//  - Los muertos van a romper las parcelas, salvo que tengan a alguien medio
//    cerca: ahí lo prefieren a él. El Cuervo se tira en picada sobre ellas.
//  - Siempre toca una durante el easter egg: si se llega a la cosecha antes de
//    la ronda 10, se hace ahí mismo y la de la 10 ya no viene.
//  - Suena el banjo (una vez, no da la vuelta) y se apaga cuando termina.
//  - La defensa termina con la ronda (toda la horda y el Cuervo muertos). Cada
//    parcela que aguanta da puntos a todos y deja un power-up. La que se
//    pierde tarda 5 rondas en volver a crecer: si su planta todavía no estaba
//    cosechada, ese paso del easter egg espera.
// En línea lo simula el anfitrión (muertos, torres, daño); los invitados ven
// el estado que les manda y cada tiro de las torres.

const REGROW = 5;
const PLOT_HITS = 34; // manotazos que aguanta una parcela (un jugador)
const AGGRO_IN = 5.5; // a esta distancia prefieren al jugador antes que la parcela
const AGGRO_OUT = 8.5; // y lo siguen hasta que se aleja esto
const APPROACH = 1.0; // radio donde se paran a romper
const STAKE_R = 0.9;
const TOWER_RANGE = 14.5;
const CROW_RANGE = 20;
const TOWER_CD = 0.8;
const TOWER_SHOTS = 20; // tiros por cebada
const SINK = 3.95; // lo que baja la torre adentro del brocal
const HEAD_Y = 2.76;
const MOUTH_Y = 1.02;
const BOMB_LEN = 1.38;
const REWARD = 250;
const CROW_DELAY = 14;
// perfil del mate gigante (radio, altura)
const GOURD = [[0, 0], [0.22, 0.02], [0.42, 0.12], [0.54, 0.3], [0.56, 0.48], [0.5, 0.68], [0.4, 0.84], [0.33, 0.95], [0.31, 1.02], [0.34, 1.06]];
const LEAF_OK = new THREE.Color(0x2e4a22);
const LEAF_WILT = new THREE.Color(0x5e4c1e);
const LEAF_YOUNG = new THREE.Color(0x4f8a2e);
const WATER_FULL = new THREE.Color(0x5ad8ff);
const WATER_EMPTY = new THREE.Color(0xff3a1a);

const LINES = {
  start: 'Vienen por el yerbal. Sin esas plantas no hay yerba... y sin yerba no hay camino. Defiéndanlas.',
  again: 'Otra vez vienen por el yerbal. Ya saben... el agua de las torres, y el Cuervo.',
  lost: 'Perdieron una planta. La tierra va a tardar en devolverla.',
  saved: 'El yerbal sigue en pie. Así me gusta.',
  regrow: 'La planta volvió a crecer. No la desperdicien.',
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpCol = new THREE.Color();
const m4 = new THREE.Matrix4();
const q0 = new THREE.Quaternion();
const sv = new THREE.Vector3();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export default class FarmDefense {
  constructor(game, ee) {
    this.g = game;
    this.ee = ee;
    this.D = EE.defense;
    this.every = this.D.every || 10;
    this.active = false;
    // zonas de donde salen los muertos mientras dura (Zombies.pickSpawner)
    this.zones = null;
    this.round = 0;
    this.crowT = 0;
    // la defensa adelantada (forceEarly): ya se hizo, falta arrancarla con la
    // ronda que viene, y cuál de las de siempre se saltea
    this.forced = false;
    this.early = false;
    this.skipRound = 0;
    this.goalObj = { i: 0, x: 0, z: 0, d: 0, nav: null };
    this.cand = [];
    this.syncT = 0;
    this.dirty = false;
    this.hudT = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.M = game.world.M;
    this.buildPlots();
    this.towers = this.D.towers.map(([x, z], i) => this.buildTower(i, x, z));
    this.navs = this.plots.map(() => null);
    this.windows = game.barriers.windows.filter((w) => w.zone === this.D.zone).map((w) => w.i);
    this.register();
    this.buildHud();
  }

  // ---------------- las parcelas ----------------
  // Un cantero de tierra removida con estacas e hilo alrededor de cada planta
  // del easter egg, y cuatro plantines. Todo instanciado (son cinco).
  buildPlots() {
    const M = this.M;
    const world = this.g.world;
    const n = EE.plants.length;
    const STAKES = 10;
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const inst = (geo, mat, count, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.castShadow = shadow;
      im.receiveShadow = true;
      this.root.add(im);
      return im;
    };
    const stakes = inst(cylGeo(0.022, 0.03, 0.36, 5), M.wood, n * STAKES);
    const twine = inst(new THREE.TorusGeometry(STAKE_R, 0.008, 4, 40).rotateX(Math.PI / 2), M.rope, n, false);
    const soil = inst(cylGeo(0.84, 0.9, 0.05, 18), M.dirtDark, n, false);
    this.burnt = inst(cylGeo(0.8, 0.8, 0.012, 16), new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 }), n, false);
    this.stems = inst(cylGeo(0.018, 0.028, 0.3, 5), M.bark, n * 4);
    this.leaves = inst(new THREE.IcosahedronGeometry(1, 1), this.leafMat, n * 8);
    this.leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.plots = EE.plants.map(([x, z], i) => {
      const y = world.floorAt(x, z);
      for (let k = 0; k < STAKES; k++) {
        const a = (k / STAKES) * Math.PI * 2;
        stakes.setMatrixAt(i * STAKES + k, m4.compose(sv.set(x + Math.cos(a) * STAKE_R, y + 0.18, z + Math.sin(a) * STAKE_R), q0, tmpA.set(1, 1, 1)));
      }
      twine.setMatrixAt(i, m4.makeTranslation(x, y + 0.29, z));
      soil.setMatrixAt(i, m4.makeTranslation(x, y + 0.025, z));
      // los plantines: dónde está cada uno y sus hojas (relativas al pie)
      const young = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4 + i;
        young.push({ x: x + Math.cos(a) * 0.52, z: z + Math.sin(a) * 0.52, leaves: [[0.05, 0.34, 0.03, 0.17], [-0.05, 0.42, -0.04, 0.14]] });
      }
      // la marca en el piso y la luz de arriba mientras dura la defensa
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x6aff7a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.38, 40).rotateX(-Math.PI / 2), ringMat);
      ring.position.set(x, y + 0.05, z);
      ring.renderOrder = 2;
      ring.visible = false;
      this.root.add(ring);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0x6aff7a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.85);
      glow.position.set(x, y + 2.7, z);
      glow.visible = false;
      this.root.add(glow);
      return { i, x, y, z, hp: 1, regrow: 0, startUp: true, young, ring, glow, hitT: 0, alertT: 0, peckT: 0, rustleT: 0, load: 0, key: '', ap: null, name: this.D.names?.[i] || `la parcela ${i + 1}` };
    });
    for (const im of [stakes, twine, soil]) im.instanceMatrix.needsUpdate = true;
    for (const p of this.plots) this.showPlot(p, true);
  }

  isDown(p) {
    return p.regrow > 0;
  }

  // Para el easter egg: la planta i está volviendo a crecer (no se puede cortar).
  down(i) {
    const p = this.plots[i];
    return !!p && p.regrow > 0;
  }

  // Las plantas que faltan cortar están volviendo a crecer (FarmEgg.harvestWaiting).
  waiting() {
    return this.ee.harvestWaiting();
  }

  // No se cosecha mientras dura la defensa, ni mientras está por venir la del
  // paso de la cosecha (forceEarly): primero se defiende, después se corta
  // (el usuario, 2026-09-29). Los invitados lo reciben del anfitrión (state().l).
  harvestLock() {
    if (this.g.net?.guest) return !!this.lockRemote;
    return this.active || this.early || !!this.pending;
  }

  // (anfitrión) Se llegó al paso de la cosecha: ¿va a venir la defensa
  // adelantada? Entonces desde ya no se corta nada.
  expectEarly() {
    const R = this.g.rounds;
    if (this.forced || this.active || this.g.net?.guest || !R || R.round >= this.every) return false;
    this.pending = true;
    this.sync(true);
    return true;
  }

  // Cómo se ve la parcela: plantines (marchitos, rotos o rebrotando) y el quemado.
  showPlot(p, force = false) {
    const down = this.isDown(p);
    const grow = down ? 1 - p.regrow / REGROW : 1;
    const shake = p.hitT > 0 ? p.hitT : 0;
    const key = down ? `d${p.regrow}` : `u${Math.round(p.hp * 20)}${shake > 0 ? 's' : ''}`;
    if (!force && key === p.key && !shake) return;
    p.key = key;
    const k = down ? 0.12 + grow * 0.5 : 0.45 + 0.55 * p.hp;
    const col = down ? LEAF_YOUNG : tmpCol.copy(LEAF_WILT).lerp(LEAF_OK, Math.min(1, p.hp * 1.4));
    p.young.forEach((y, j) => {
      const jx = shake ? (Math.random() - 0.5) * 0.08 * shake : 0;
      const jz = shake ? (Math.random() - 0.5) * 0.08 * shake : 0;
      this.stems.setMatrixAt(p.i * 4 + j, m4.compose(sv.set(y.x + jx, p.y + 0.15 * k, y.z + jz), q0, tmpA.set(1, k, 1)));
      y.leaves.forEach(([lx, ly, lz, s], h) => {
        const idx = p.i * 8 + j * 2 + h;
        this.leaves.setMatrixAt(idx, m4.compose(sv.set(y.x + lx * k + jx * 2, p.y + ly * k, y.z + lz * k + jz * 2), q0, tmpA.set(s * k, s * k * 0.9, s * k)));
        this.leaves.setColorAt(idx, col);
      });
    });
    this.burnt.setMatrixAt(p.i, down && p.regrow >= 2 ? m4.makeTranslation(p.x, p.y + 0.056, p.z) : zero);
    this.stems.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.burnt.instanceMatrix.needsUpdate = true;
    // la planta del easter egg (si todavía no la cortaron) crece y se achica con la parcela
    const plant = this.ee.plants?.[p.i];
    if (plant && !this.ee.harvested[p.i]) plant.g.scale.setScalar(down ? 0.1 + grow * 0.55 : 0.6 + 0.4 * p.hp);
    else if (plant) plant.g.scale.setScalar(1);
  }

  // ---------------- las torres ----------------
  // Un brocal de piedra (siempre está) y la torre que sube de adentro: columna
  // con zunchos, una plataforma que gira y el mate gigante con la bombilla de caño.
  buildTower(i, x, z) {
    const M = this.M;
    const world = this.g.world;
    const y = world.floorAt(x, z);
    const base = new THREE.Group();
    base.position.set(x, y, z);
    base.add(mesh(cylGeo(0.78, 0.86, 0.5, 14), M.stone, 0, 0.25, 0));
    base.add(mesh(cylGeo(0.82, 0.82, 0.07, 14), M.stoneDark, 0, 0.53, 0));
    const lid = mesh(cylGeo(0.6, 0.6, 0.05, 14), M.iron, 0, 0.56, 0);
    base.add(lid);
    // la marca del mate en la tapa
    lid.add(mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 18).rotateX(Math.PI / 2), M.brass, 0, 0.03, 0));
    this.root.add(base);
    world.addBox([x - 0.86, y, z - 0.86, x + 0.86, y + 0.58, z + 0.86], { kind: 'prop' });

    const rise = new THREE.Group();
    rise.position.set(x, y - SINK, z);
    rise.visible = false;
    rise.add(mesh(cylGeo(0.44, 0.52, 2.62, 12), M.stone, 0, 1.31, 0));
    for (const hy of [0.55, 1.45, 2.3]) rise.add(mesh(new THREE.TorusGeometry(0.52 - hy * 0.03, 0.035, 6, 20).rotateX(Math.PI / 2), M.iron, 0, hy, 0));
    // el termo atado a la columna
    rise.add(mesh(cylGeo(0.09, 0.09, 0.55, 10), M.termo, 0.5, 1.8, 0.1));
    rise.add(mesh(cylGeo(0.06, 0.08, 0.1, 10), M.metal, 0.5, 2.12, 0.1));
    rise.add(mesh(cylGeo(0.62, 0.52, 0.16, 14), M.woodDark, 0, 2.68, 0));
    const head = new THREE.Group();
    head.position.y = HEAD_Y;
    rise.add(head);
    const gourd = mesh(new THREE.LatheGeometry(GOURD.map(([r, h]) => new THREE.Vector2(r, h)), 20), M.gourd);
    head.add(gourd);
    head.add(mesh(new THREE.TorusGeometry(0.33, 0.04, 8, 24).rotateX(Math.PI / 2), M.brass, 0, 1.05, 0));
    head.add(mesh(cylGeo(0.3, 0.3, 0.05, 18), M.yerbaBranch, 0, 0.99, 0));
    // el anillo que muestra el agua (celeste lleno, rojo vacío)
    const waterMat = new THREE.MeshBasicMaterial({ color: WATER_FULL.clone(), toneMapped: false });
    head.add(mesh(new THREE.TorusGeometry(0.565, 0.028, 6, 32).rotateX(Math.PI / 2), waterMat, 0, 0.48, 0));
    // la bombilla: el caño que apunta (a lo largo de +z)
    const bomb = new THREE.Group();
    bomb.position.y = MOUTH_Y;
    head.add(bomb);
    bomb.add(mesh(cylGeo(0.05, 0.055, 1.55, 10).clone().rotateX(Math.PI / 2).translate(0, 0, 0.58), M.silver));
    for (const bz of [0.55, 0.85]) bomb.add(mesh(new THREE.TorusGeometry(0.062, 0.018, 6, 14), M.brass, 0, 0, bz));
    bomb.add(mesh(cylGeo(0.075, 0.055, 0.14, 10).clone().rotateX(Math.PI / 2), M.brass, 0, 0, BOMB_LEN - 0.03));
    const muzzleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xbfeaff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    muzzleGlow.scale.setScalar(0.9);
    muzzleGlow.position.z = BOMB_LEN + 0.1;
    bomb.add(muzzleGlow);
    this.root.add(rise);
    const yaw0 = Math.atan2(21 - x, 13 - z);
    return { i, x, y, z, base, lid, rise, head, bomb, waterMat, muzzleGlow, up: 0, upShown: 0, water: 1, cd: 0, pick: 0, target: null, yaw: yaw0, pitch: 0.4, aimYaw: yaw0, aimPitch: 0.4, flash: 0, dryT: 0, said: false };
  }

  // La punta de la bombilla (en metros del mundo).
  muzzle(t, out) {
    const cp = Math.cos(t.pitch);
    return out.set(t.x + Math.sin(t.yaw) * cp * BOMB_LEN, t.y + HEAD_Y + MOUTH_Y + Math.sin(t.pitch) * BOMB_LEN, t.z + Math.cos(t.yaw) * cp * BOMB_LEN);
  }

  aimPoint(z, out) {
    if (z.crow) return out.copy(z.pos);
    const h = z.dog ? 0.8 : z.crawler ? 0.35 : 1.15 * (z.scale || 1);
    return out.set(z.pos.x, (z.baseY || 0) + h, z.pos.z);
  }

  aimAt(t, p) {
    const px = t.x;
    const py = t.y + HEAD_Y + MOUTH_Y;
    const pz = t.z;
    t.aimYaw = Math.atan2(p.x - px, p.z - pz);
    t.aimPitch = Math.max(-0.7, Math.min(1.2, Math.atan2(p.y - py, Math.hypot(p.x - px, p.z - pz))));
  }

  // A quién le tira: al que está más cerca de romper una parcela (el Cuervo
  // posado arriba de una va primero), con línea libre desde la bombilla.
  pickTarget(t) {
    const g = this.g;
    const cand = this.cand;
    cand.length = 0;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || (z.state === 'rise' && z.stateT < 0.6)) continue;
      const d = Math.hypot(z.pos.x - t.x, z.pos.z - t.z);
      if (d > TOWER_RANGE) continue;
      let threat = 30;
      for (const p of this.plots) if (!this.isDown(p)) threat = Math.min(threat, Math.hypot(p.x - z.pos.x, p.z - z.pos.z));
      cand.push({ z, s: threat + d * 0.4 });
    }
    const crow = g.crow?.z;
    if (crow?.active && !crow.dead) {
      const d = crow.pos.distanceTo(tmpA.set(t.x, t.y + HEAD_Y, t.z));
      if (d < CROW_RANGE) cand.push({ z: crow, s: g.crow.state === 'perch' ? 3 + d * 0.1 : 14 + d * 0.3 });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.s - b.s);
    const from = this.muzzle(t, tmpA);
    for (let k = 0; k < cand.length && k < 4; k++) {
      if (g.world.clear(from, this.aimPoint(cand[k].z, tmpB))) return cand[k].z;
    }
    return null;
  }

  // El chorro de agua hirviendo (se ve en todos).
  shotFx(t, to) {
    const g = this.g;
    const a = this.muzzle(t, tmpA);
    g.fx.beam(a, to, { color: 0xbfeaff, width: 0.07, life: 0.12 });
    g.fx.waterJet(a, to, false);
    g.fx.steam(to, 5, 0.5);
    g.fx.steam(a, 2, 0.15);
    t.flash = 1;
    this.sfx('shot', a);
  }

  // Tiro de una torre (anfitrión): el chorro, el daño y el aviso a los invitados.
  fire(t, target, to) {
    const g = this.g;
    this.shotFx(t, to);
    g.net?.event('ee', { dfs: [t.i, +to.x.toFixed(2), +to.y.toFixed(2), +to.z.toFixed(2)] });
    const dmg = Math.max(260, zombieHealth(this.round || g.rounds.round) * 0.36);
    const dir = tmpC.subVectors(to, tmpA).normalize().clone();
    const wasDead = target.dead;
    // al Cuervo le hacen cosquillas: esa pelea es de los jugadores
    if (target.crow) g.zombies.damage(target, 120, { type: 'bullet', noPoints: true, point: to.clone(), dir, zone: 'torso' });
    else g.zombies.damage(target, dmg, { type: 'scald', noPoints: true, point: to.clone(), dir, zone: 'torso' });
    // las bajas de las torres no son de nadie
    if (!target.crow && !wasDead && target.dead) g.stats.kills = Math.max(0, g.stats.kills - 1);
  }

  // Tiro que manda el anfitrión (invitados).
  remoteShot([i, x, y, z]) {
    const t = this.towers[i];
    if (!t) return;
    const to = tmpB.set(x, y, z).clone();
    this.aimAt(t, to);
    t.yaw = t.aimYaw;
    t.pitch = t.aimPitch;
    this.shotFx(t, to);
  }

  updateTower(t, dt) {
    t.cd -= dt;
    t.pick -= dt;
    if (t.target && (!t.target.active || t.target.dead)) t.target = null;
    if (t.pick <= 0) {
      t.pick = 0.2;
      t.target = this.pickTarget(t);
    }
    if (!t.target) return;
    const to = this.aimPoint(t.target, tmpB);
    this.aimAt(t, to);
    if (t.water <= 0) {
      // sin agua: avisa una vez por vaciada
      if (!t.said) {
        t.said = true;
        this.ee.announce('Una torre de mate se quedó sin agua. Cebala (mantené F al lado del brocal).', 3.5);
      }
      return;
    }
    if (t.cd > 0 || Math.abs(wrap(t.aimYaw - t.yaw)) > 0.22) return;
    t.cd = TOWER_CD;
    t.water = Math.max(0, t.water - 1 / TOWER_SHOTS);
    this.dirty = true;
    this.fire(t, t.target, to.clone());
  }

  // Cebar la torre (cada vez que se mantiene F). Lo decide el anfitrión.
  cebar(i) {
    const t = this.towers[i];
    if (!t || !this.active || t.water >= 0.99) return false;
    t.water = Math.min(1, t.water + 0.1);
    t.said = false;
    this.pourFx(t);
    this.dirty = true;
    return true;
  }

  pourFx(t) {
    const g = this.g;
    const mouth = tmpA.set(t.x, t.y + HEAD_Y + MOUTH_Y + 0.05, t.z);
    g.fx.waterJet(tmpB.set(t.x + 0.35, mouth.y + 0.75, t.z + 0.2), mouth, false);
    if (Math.random() < 0.5) g.fx.steam(mouth, 1, 0.2);
    this.sfx('pour', mouth);
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    for (const t of this.towers) {
      g.interact.add({
        kind: 'ee',
        hold: true,
        local: true,
        pos: new THREE.Vector3(t.x, t.y + 1, t.z),
        radius: 2.3,
        prompt: () => {
          if (!this.active || t.upShown < 0.9 || t.water >= 0.99) return null;
          return { text: `cebar la torre de mate (${Math.round(t.water * 100)}%)`, hold: true, noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (!this.active || t.water >= 0.99) return false;
          // de invitado se le pide al anfitrión (sin el ruido de compra de cada toque)
          if (g.net?.guest) {
            g.net.net.send({ t: 'pee', a: 'ceba', i: t.i });
            this.pourFx(t);
            return true;
          }
          return this.cebar(t.i);
        },
      });
    }
  }

  // ---------------- los muertos ----------------
  // Adónde va un muerto (Zombies.chase): a su parcela, o null si tiene a alguien
  // medio cerca (o si ya no queda ninguna en pie).
  goal(z, target, distP) {
    if (z.dog || z.boss) return null;
    const g = this.g;
    if (z.dfId !== z.id) {
      z.dfId = z.id;
      z.dfPlot = -1;
      z.dfAggro = false;
      z.dfT = 0;
    }
    const close = !!target && distP < (z.dfAggro ? AGGRO_OUT : AGGRO_IN) && Math.abs((target.pos.y || 0) - (z.baseY || 0)) < 1.6;
    z.dfAggro = close;
    if (close) return null;
    let p = z.dfPlot >= 0 ? this.plots[z.dfPlot] : null;
    if (!p || this.isDown(p) || g.time > z.dfT) {
      p = this.choosePlot(z);
      z.dfPlot = p ? p.i : -1;
      z.dfT = g.time + 3 + Math.random() * 2;
    }
    if (!p) return null;
    const ap = this.approaches(p);
    const [ax, az] = ap[z.id % ap.length];
    const G = this.goalObj;
    G.i = p.i;
    G.x = ax;
    G.z = az;
    // se paran en el cantero (o donde los deje la planta de al lado)
    G.d = Math.min(Math.hypot(ax - z.pos.x, az - z.pos.z) + 0.6, Math.hypot(p.x - z.pos.x, p.z - z.pos.z) - 0.35);
    G.nav = this.navFor(p);
    return G;
  }

  choosePlot(z) {
    let best = null;
    let bs = Infinity;
    for (const p of this.plots) {
      if (this.isDown(p)) continue;
      const d = this.navFor(p).distAt(z.pos.x, z.pos.z);
      const s = (Number.isFinite(d) ? d : Math.hypot(p.x - z.pos.x, p.z - z.pos.z) + 30) + p.load * 2.5 + Math.random() * 3;
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  navFor(p) {
    let n = this.navs[p.i];
    if (!n) n = this.navs[p.i] = new Navigation(this.g.world);
    n.update(p.x, p.z);
    return n;
  }

  // Los lugares alrededor del cantero donde se puede parar alguien.
  approaches(p) {
    if (p.ap) return p.ap;
    const nav = this.g.nav;
    p.ap = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = p.x + Math.cos(a) * APPROACH;
      const z = p.z + Math.sin(a) * APPROACH;
      if (!nav.blocked(Math.floor(x), Math.floor(z))) p.ap.push([x, z]);
    }
    if (!p.ap.length) p.ap.push([p.x, p.z]);
    return p.ap;
  }

  // Un manotazo a la parcela (anfitrión).
  zombieHit(G) {
    this.hurt(this.plots[G.i], 1 / this.hitsMax());
  }

  hitsMax() {
    return PLOT_HITS * (1 + (this.ee.players() - 1) * 0.35);
  }

  hurt(p, amount) {
    const g = this.g;
    if (!p || this.isDown(p) || !this.active) return;
    p.hp = Math.max(0, p.hp - amount);
    p.hitT = 0.35;
    this.leafFx(p);
    this.dirty = true;
    if (p.hp <= 0) {
      this.destroy(p);
      return;
    }
    // un aviso por parcela cada tanto (y no más de uno a la vez)
    if (g.time > p.alertT && g.time > (this.alertT || 0)) {
      p.alertT = g.time + 10;
      this.alertT = g.time + 4;
      this.ee.announce(`¡Están rompiendo ${p.name}!`, 2.5);
    }
  }

  leafFx(p) {
    const g = this.g;
    for (let k = 0; k < 5; k++) {
      g.fx.alpha.spawn(p.x + (Math.random() - 0.5) * 1.2, p.y + 0.3 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, { color: [0.2 + Math.random() * 0.2, 0.35 + Math.random() * 0.15, 0.1], size: 0.05, size1: 0.03, life: 0.9, gravity: 4, alpha: 0.9 });
    }
    if (g.time > p.rustleT) {
      p.rustleT = g.time + 0.18;
      this.sfx('rustle', tmpA.set(p.x, p.y + 0.5, p.z));
    }
  }

  destroy(p) {
    const g = this.g;
    p.hp = 0;
    p.regrow = REGROW;
    this.dirty = true;
    this.brokeFx(p);
    const lostPlant = !this.ee.harvested[p.i];
    this.ee.announce(lostPlant ? `Rompieron ${p.name}: la planta tarda ${REGROW} rondas en volver a crecer.` : `Rompieron ${p.name}.`, 3.5, true);
    if (lostPlant && g.world.power && !this.saidLost) {
      this.saidLost = true;
      this.ee.voice(LINES.lost, 1.2);
    }
    if (this.plots.every((q) => this.isDown(q)) && !this.saidAll) {
      this.saidAll = true;
      g.later(2, () => this.ee.announce('Se perdió el yerbal entero. Ahora vienen por ustedes.', 3.5, true));
    }
    this.sync(true);
  }

  brokeFx(p) {
    const g = this.g;
    const at = tmpA.set(p.x, p.y + 0.4, p.z);
    g.fx.yerbaPuff(at);
    g.fx.dirt(tmpB.set(p.x, p.y, p.z), 14);
    g.fx.dust(tmpB.set(p.x, p.y + 0.2, p.z), { x: 0, y: 1, z: 0 }, [0.3, 0.26, 0.2], 10);
    this.sfx('crunch', at);
  }

  // El Cuervo elige una parcela para tirarse en picada.
  crowPlot() {
    const alive = this.plots.filter((p) => !this.isDown(p));
    if (!alive.length) return null;
    // la que tiene menos jugadores cerca
    let best = null;
    let bs = -Infinity;
    for (const p of alive) {
      const d = this.nearestPlayerDist(p.x, p.z);
      const s = Math.min(d, 20) + Math.random() * 6;
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  nearestPlayerDist(x, z) {
    const g = this.g;
    let d = g.player.canBeHit() ? Math.hypot(g.player.pos.x - x, g.player.pos.z - z) : Infinity;
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) d = Math.min(d, Math.hypot(r.pos.x - x, r.pos.z - z));
    return d;
  }

  // La picada del Cuervo le pega fuerte a la parcela.
  crowHit(i) {
    const p = this.plots[i];
    if (!p) return;
    this.hurt(p, 0.2);
    this.g.fx.addShake(0.15);
  }

  // Posado arriba de la parcela, picotea.
  crowPeck(i, dt) {
    const p = this.plots[i];
    if (!p) return;
    p.peckT += dt;
    if (p.peckT > 0.55) {
      p.peckT = 0;
      this.hurt(p, 2 / this.hitsMax());
    }
  }

  // Mientras dura la defensa la ronda no termina sin el Cuervo (Rounds.update).
  get holding() {
    const c = this.g.crow?.z;
    return this.active && (this.crowT > 0 || (!!c?.active && !c.dead));
  }

  // ---------------- rondas ----------------
  // Cada ronda nueva (anfitrión): rebrotan las parcelas rotas y, cada 10, la defensa.
  onRound(R) {
    const g = this.g;
    for (const p of this.plots) {
      if (p.regrow > 0) {
        p.regrow--;
        if (p.regrow === 0) {
          p.hp = 1;
          this.regrown(p);
        }
      }
    }
    this.dirty = true;
    const due = R.round >= this.every && R.round % this.every === 0 && R.round !== this.skipRound;
    if ((due || (this.early && !R.dogs)) && !this.ee.fight && g.state === 'playing') {
      this.early = false;
      this.start(R);
    }
    this.sync(true);
  }

  // Se llegó al paso de cosechar (anfitrión). La defensa tiene que tocar
  // durante el easter egg: si todavía no hubo ninguna (antes de la ronda 10),
  // se hace ahora, en esta misma ronda, y la de la 10 ya no viene.
  forceEarly() {
    const g = this.g;
    const R = g.rounds;
    this.pending = false;
    if (this.forced || this.active || g.net?.guest || !R || R.round >= this.every) return;
    this.forced = true;
    this.skipRound = this.every;
    // (en el descanso o con la tropilla suelta: arranca con la ronda que viene)
    if (R.state === 'active' && !R.dogs && !this.ee.fight && g.state === 'playing') this.start(R);
    else this.early = true;
  }

  // El banjo de la defensa: una sola vez (si la ronda dura más, se termina
  // solo) y cuando la defensa termina se apaga de a poco.
  music() {
    this.g.music?.play('defensa-granja', { fadeIn: 0.5, while: (G) => this.active && (G.state === 'playing' || G.state === 'paused') });
  }

  regrown(p) {
    const g = this.g;
    const plant = this.ee.needed(this.ee.plants[p.i]);
    this.ee.announce(plant && this.ee.papDone ? `Volvió a crecer ${p.name}: la planta ya se puede cortar.` : `Volvió a crecer ${p.name}.`, 3.5);
    g.fx.sparkle(tmpA.set(p.x, p.y + 0.6, p.z), [0.5, 1, 0.5], 16, 0.8);
    if (plant && this.ee.papDone && g.world.power) this.ee.voice(LINES.regrow, 1);
  }

  start(R) {
    const g = this.g;
    this.active = true;
    this.round = R.round;
    this.zones = new Set([this.D.zone]);
    this.saidLost = false;
    this.saidAll = false;
    // la horda: un poco más de muertos, de a montones, y el Cuervo con ellos
    // (con más jugadores, todavía más: +25% y 4 más a la vez por cada otro;
    // pedido del usuario 2026-10-01)
    const extra = Math.max(0, this.ee.players() - 1);
    R.total = R.toSpawn = Math.round(R.total * (1.15 + extra * 0.25));
    R.capBonus = (R.capBonus || 0) + extra * 4;
    R.delay = Math.max(0.25, R.delay * 0.5);
    R.spawnT = 6;
    R.bossPending = false;
    this.crowT = CROW_DELAY;
    for (const p of this.plots) {
      p.startUp = !this.isDown(p);
      p.hp = this.isDown(p) ? 0 : 1;
      p.alertT = 0;
    }
    for (const t of this.towers) {
      t.water = 1;
      t.said = false;
      t.cd = 1;
    }
    this.setLock(true);
    // las tablas de las tranqueras de los tablones saltan
    this.windows.forEach((wi, k) => {
      for (let b = 0; b < 6; b++) g.later(0.5 + k * 0.08 + b * 0.11, () => g.barriers.tear(wi));
    });
    // la tranquera del patio a los tablones se abre sola
    const gate = g.interact.list.find((x) => x.kind === 'door' && x.door.def.id === this.D.gate);
    const opened = gate && !gate.door.open;
    if (opened) g.later(1.5, () => g.interact.openDoor(gate.door));
    this.ee.announce(`¡Defensa del yerbal! La horda y el Cuervo vienen por las parcelas.${opened ? ' La tranquera del patio se abrió sola.' : ''}`, 5, true);
    g.later(3.5, () => this.ee.announce('De los brocales suben las torres de mate. Tiran solas, pero hay que cebarlas (mantené F).', 4));
    if (g.world.power) this.ee.voice(this.round > this.every ? LINES.again : LINES.start, 2);
    g.audio.bossArrive();
    this.music();
    this.dirty = true;
    this.sync(true);
  }

  // La ronda terminó (anfitrión): premio por cada parcela que aguantó.
  onRoundEnd() {
    if (this.active) this.finish();
  }

  finish() {
    const g = this.g;
    this.active = false;
    this.zones = null;
    this.crowT = 0;
    this.setLock(false);
    // las tablas vuelven a su lugar
    this.windows.forEach((wi, k) => {
      for (let b = 0; b < 6; b++) g.later(1 + k * 0.1 + b * 0.14, () => g.barriers.repair(wi));
    });
    const counted = this.plots.filter((p) => p.startUp);
    const saved = counted.filter((p) => !this.isDown(p)).map((p) => p.i);
    const res = [saved.length, counted.length];
    this.reward(res);
    g.net?.event('ee', { dfr: res });
    saved.forEach((i, k) => {
      const p = this.plots[i];
      g.later(1.2 + k * 0.45, () => g.powerups.drop(new THREE.Vector3(p.x + 1.2, p.y, p.z), true));
    });
    if (g.world.power && saved.length === counted.length && counted.length) this.ee.voice(LINES.saved, 2.5);
    // (en el paso de la cosecha: ahora sí se corta)
    this.ee.defenseOver?.();
    this.dirty = true;
    this.sync(true);
  }

  // El premio (cada uno suma sus puntos).
  reward([n, of]) {
    const g = this.g;
    if (n > 0) g.addPoints(REWARD * n, null, true);
    g.hud.toast(n && n === of ? `¡Yerbal intacto! +${REWARD * n} y un power-up por parcela` : n ? `Aguantaron ${n} de ${of} parcelas: +${REWARD * n} y un power-up por cada una` : 'Se perdió el yerbal: sin premio');
    g.audio.sting();
  }

  setLock(on) {
    this.g.barriers.locked = on ? new Set(this.windows) : null;
  }

  // ---------------- red ----------------
  state() {
    return { a: this.active ? 1 : 0, l: this.harvestLock() ? 1 : 0, r: this.round, c: this.crowT > 0 ? 1 : 0, p: this.plots.map((p) => [Math.round(p.hp * 100), p.regrow, p.startUp ? 1 : 0]), w: this.towers.map((t) => Math.round(t.water * 100)) };
  }

  applyRemote(s) {
    const was = this.active;
    this.active = !!s.a;
    this.lockRemote = !!s.l;
    this.round = s.r || 0;
    this.crowT = s.c ? 1 : 0;
    s.p?.forEach(([hp, rg, su], i) => {
      const p = this.plots[i];
      if (!p) return;
      const nh = hp / 100;
      if (!rg && nh < p.hp - 0.001) {
        p.hitT = 0.35;
        this.leafFx(p);
      }
      if (rg && !p.regrow && rg === REGROW) this.brokeFx(p);
      p.hp = nh;
      p.regrow = rg;
      p.startUp = !!su;
    });
    s.w?.forEach((w, i) => {
      const t = this.towers[i];
      if (t) t.water = w / 100;
    });
    if (this.active !== was) {
      this.setLock(this.active);
      if (this.active) this.music();
    }
  }

  sync(force = false) {
    const g = this.g;
    if (!g.net?.host || (!force && !this.dirty)) return;
    this.dirty = false;
    this.syncT = 0.25;
    g.net.event('ee', { df: this.state() });
  }

  // Un invitado cebó una torre ('pee').
  onGuest(m) {
    if (m.a === 'ceba') this.cebar(m.i | 0);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    if (host && this.active) {
      // el Cuervo llega con la horda
      if (this.crowT > 0) {
        this.crowT -= dt;
        if (this.crowT <= 0) {
          this.crowT = 0;
          g.crow?.spawn(this.round);
          this.dirty = true;
        }
      }
      for (const p of this.plots) p.load = 0;
      for (const z of g.zombies.pool) if (z.active && !z.dead && z.dfId === z.id && z.dfPlot >= 0 && !z.dfAggro) this.plots[z.dfPlot].load++;
      for (const t of this.towers) if (t.upShown > 0.95) this.updateTower(t, dt);
      this.syncT -= dt;
      if (this.syncT <= 0) this.sync();
    }
    // las torres suben y bajan, apuntan y muestran el agua (en todos)
    for (const t of this.towers) this.showTower(t, dt);
    for (const p of this.plots) {
      if (p.hitT > 0) p.hitT = Math.max(0, p.hitT - dt);
      this.showPlot(p);
      this.showMarker(p, dt);
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.updateHud();
    }
  }

  showTower(t, dt) {
    const g = this.g;
    t.up = this.active ? 1 : 0;
    const prev = t.upShown;
    t.upShown = Math.max(0, Math.min(1, t.upShown + (t.up ? dt / 2.4 : -dt / 2)));
    if (t.upShown !== prev && (prev === 0 || prev === 1)) {
      this.sfx('rise', tmpA.set(t.x, t.y + 0.6, t.z));
      if (Math.hypot(g.player.pos.x - t.x, g.player.pos.z - t.z) < 14) g.fx.addShake(0.12);
    }
    const k = t.upShown;
    const e = k * k * (3 - 2 * k);
    t.rise.visible = k > 0.001;
    t.rise.position.y = t.y - SINK * (1 - e);
    // la tapa se corre y el polvo sale mientras se mueve
    t.lid.position.x = Math.min(1, k * 3) * 0.95;
    t.lid.rotation.z = Math.min(1, k * 3) * -0.35;
    if (k > 0 && k < 1 && Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      g.fx.dust(tmpA.set(t.x + Math.cos(a) * 0.8, t.y + 0.6, t.z + Math.sin(a) * 0.8), { x: Math.cos(a), y: 0.8, z: Math.sin(a) }, [0.4, 0.35, 0.28], 2);
    }
    if (!t.rise.visible) return;
    // sin objetivo, barre despacio
    if (!t.target && g.net?.guest !== true) t.aimYaw += dt * 0.25;
    t.yaw += Math.max(-dt * 6, Math.min(dt * 6, wrap(t.aimYaw - t.yaw)));
    t.pitch += (t.aimPitch - t.pitch) * Math.min(1, dt * 8);
    t.head.rotation.y = t.yaw;
    t.bomb.rotation.x = -t.pitch;
    // el agua que le queda
    const w = t.water;
    const blink = w <= 0 ? 0.5 + 0.5 * Math.sin(g.time * 10) : 1;
    // de celeste (llena) a amarillo y rojo (vacía)
    t.waterMat.color.setHSL(0.53 * Math.min(1, w * 1.15), 1, 0.55).multiplyScalar(1.5 * blink);
    t.flash = Math.max(0, t.flash - dt * 7);
    t.muzzleGlow.material.opacity = t.flash * 0.9;
    // vapor del mate caliente
    if (w > 0 && Math.random() < dt * 2.5) g.fx.steam(tmpA.set(t.x, t.y + HEAD_Y + MOUTH_Y + 0.1, t.z), 1, 0.3);
  }

  showMarker(p, dt) {
    const g = this.g;
    const on = this.active && p.startUp;
    p.mk = (p.mk || 0) + ((on ? 1 : 0) - (p.mk || 0)) * Math.min(1, dt * 3);
    const vis = p.mk > 0.01;
    p.ring.visible = vis;
    p.glow.visible = vis;
    if (!vis) return;
    const down = this.isDown(p);
    const c = down ? tmpCol.setRGB(0.5, 0.08, 0.04) : tmpCol.setHSL((p.hp * 110) / 360, 0.85, 0.5);
    p.ring.material.color.copy(c);
    p.glow.material.color.copy(c);
    const pulse = p.hitT > 0 ? 0.35 + Math.sin(g.time * 30) * 0.2 : 0;
    p.ring.material.opacity = p.mk * ((down ? 0.25 : 0.45) + Math.sin(g.time * 3 + p.i) * 0.1 + pulse);
    p.glow.material.opacity = p.mk * ((down ? 0.3 : 0.7) + pulse);
  }

  // ---------------- el cartel de la defensa ----------------
  // Un mapita de los tablones: las parcelas (de verde a rojo), las torres con
  // su agua, los jugadores y los muertos que andan adentro.
  buildHud() {
    const g = this.g;
    if (!g.hud?.root) return;
    if (!document.getElementById('mdu-dfn-css')) {
      const st = document.createElement('style');
      st.id = 'mdu-dfn-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const B = this.D.map;
    const S = 4.6;
    this.hs = { B, S };
    const sx = (x) => ((x - B.x0) * S).toFixed(1);
    const sz = (z) => ((z - B.z0) * S).toFixed(1);
    const W = ((B.x1 - B.x0) * S).toFixed(0);
    const H = ((B.z1 - B.z0) * S).toFixed(0);
    let svg = '';
    for (const k of [this.D.zone, 'Y']) {
      for (const r of ZONES[k]?.rects || []) svg += `<rect x="${sx(r[0])}" y="${sz(r[1])}" width="${((r[2] - r[0] + 1) * S).toFixed(1)}" height="${((r[3] - r[1] + 1) * S).toFixed(1)}" class="${k === 'Y' ? 'dk' : 'fl'}"/>`;
    }
    for (const pr of PROPS) {
      if (pr.type !== 'yerbal') continue;
      const L = pr.len || 5;
      svg += `<line x1="${sx(pr.pos[0] - L / 2)}" y1="${sz(pr.pos[1])}" x2="${sx(pr.pos[0] + L / 2)}" y2="${sz(pr.pos[1])}" class="rw"/>`;
    }
    const gate = DOORS.find((d) => d.id === this.D.gate);
    if (gate) for (const [cx, cz] of gate.cells) svg += `<rect x="${sx(cx)}" y="${sz(cz)}" width="${S}" height="${S}" class="gt"/>`;
    for (const t of this.towers) svg += `<g transform="translate(${sx(t.x)} ${sz(t.z)})"><rect x="-4" y="-4" width="8" height="8" class="tw"/><rect x="5" y="-4" width="3" height="8" class="wb"/><rect x="5" y="4" width="3" height="0" class="wf"/></g>`;
    for (const p of this.plots) svg += `<g transform="translate(${sx(p.x)} ${sz(p.z)})"><circle r="5.2" class="pl"/><path d="M-3-3L3 3M3-3L-3 3" class="px"/></g>`;
    svg += '<g class="zs"></g><g class="ps"></g><circle r="4" class="cr"/>';
    const el = document.createElement('div');
    el.className = 'mdu-dfn';
    el.innerHTML = `<b>Defensa del yerbal</b><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${svg}</svg><span></span>`;
    g.hud.root.appendChild(el);
    this.hud = {
      el,
      plots: [...el.querySelectorAll('circle.pl')],
      xs: [...el.querySelectorAll('path.px')],
      water: [...el.querySelectorAll('rect.wf')],
      zs: el.querySelector('g.zs'),
      ps: el.querySelector('g.ps'),
      crow: el.querySelector('circle.cr'),
      text: el.querySelector('span'),
      dots: [],
      pdots: [],
    };
  }

  updateHud() {
    const h = this.hud;
    if (!h) return;
    const on = this.active;
    h.el.classList.toggle('is-on', on);
    if (!on) return;
    const g = this.g;
    const { B, S } = this.hs;
    const inMap = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
    const sx = (x) => (x - B.x0) * S;
    const sz = (z) => (z - B.z0) * S;
    this.plots.forEach((p, i) => {
      const down = this.isDown(p);
      const c = h.plots[i];
      c.style.fill = down ? '#3a2a20' : `hsl(${Math.round(p.hp * 110)} 80% 45%)`;
      c.classList.toggle('hit', p.hitT > 0);
      h.xs[i].style.display = down ? '' : 'none';
    });
    this.towers.forEach((t, i) => {
      const r = h.water[i];
      r.setAttribute('y', (4 - 8 * t.water).toFixed(1));
      r.setAttribute('height', (8 * t.water).toFixed(1));
      r.style.fill = t.water <= 0 ? '#ff3a1a' : t.water < 0.3 ? '#ffa040' : '#5ad8ff';
    });
    // los muertos que andan por los tablones
    let k = 0;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || !inMap(z.pos.x, z.pos.z)) continue;
      let d = h.dots[k];
      if (!d) {
        d = h.dots[k] = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d.setAttribute('r', '1.7');
        h.zs.appendChild(d);
      }
      d.setAttribute('cx', sx(z.pos.x).toFixed(1));
      d.setAttribute('cy', sz(z.pos.z).toFixed(1));
      d.style.display = '';
      k++;
      if (k >= 48) break;
    }
    for (let j = k; j < h.dots.length; j++) h.dots[j].style.display = 'none';
    // los jugadores (vos en dorado)
    const list = [g.player];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) list.push(r);
    let n = 0;
    for (const p of list) {
      if (!inMap(p.pos.x, p.pos.z)) continue;
      let d = h.pdots[n];
      if (!d) {
        d = h.pdots[n] = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d.setAttribute('r', '2.8');
        h.ps.appendChild(d);
      }
      d.setAttribute('cx', sx(p.pos.x).toFixed(1));
      d.setAttribute('cy', sz(p.pos.z).toFixed(1));
      d.setAttribute('class', p === g.player ? 'me' : 'mate');
      d.style.display = '';
      n++;
    }
    for (let j = n; j < h.pdots.length; j++) h.pdots[j].style.display = 'none';
    const c = g.crow?.z;
    const crowIn = c?.active && !c.dead && inMap(c.pos.x, c.pos.z);
    h.crow.style.display = crowIn ? '' : 'none';
    if (crowIn) {
      h.crow.setAttribute('cx', sx(c.pos.x).toFixed(1));
      h.crow.setAttribute('cy', sz(c.pos.z).toFixed(1));
    }
    const counted = this.plots.filter((p) => p.startUp);
    const up = counted.filter((p) => !this.isDown(p)).length;
    const txt = `Parcelas en pie: ${up} de ${counted.length}${this.crowT > 0 ? ' · el Cuervo está llegando' : ''}`;
    if (h.text.textContent !== txt) h.text.textContent = txt;
  }

  // ---------------- sonidos ----------------
  sfx(kind, pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    if (kind === 'shot') {
      const o = a.out({ pos, gain: 0.55, reverb: 0.25 });
      a.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 1500, freqEnd: 600, q: 1.1, gain: 0.55 });
      a.tone(o, { t, dur: 0.14, type: 'sine', freq: 150, freqEnd: 65, gain: 0.4 });
    } else if (kind === 'rise') {
      const o = a.out({ pos, gain: 0.9, reverb: 0.5, ref: 4 });
      a.noise(o, { t, dur: 2.4, freq: 260, freqEnd: 90, gain: 0.7, brown: true, attack: 0.3 });
      a.tone(o, { t, dur: 2.2, type: 'sawtooth', freq: 48, freqEnd: 38, gain: 0.1 });
    } else if (kind === 'pour') {
      const o = a.out({ pos, gain: 0.4, reverb: 0.1 });
      a.noise(o, { t, dur: 0.16, type: 'bandpass', freq: 900 + Math.random() * 500, q: 3, gain: 0.5 });
    } else if (kind === 'rustle') {
      const o = a.out({ pos, gain: 0.5, reverb: 0.1 });
      a.noise(o, { t, dur: 0.12, type: 'highpass', freq: 2600, gain: 0.35 });
    } else if (kind === 'crunch') {
      const o = a.out({ pos, gain: 0.9, reverb: 0.3 });
      a.noise(o, { t, dur: 0.5, freq: 900, freqEnd: 150, gain: 0.8, brown: true });
      a.noise(o, { t, dur: 0.3, type: 'highpass', freq: 2200, gain: 0.3 });
    }
  }

  dispose() {
    this.setLock(false);
    this.hud?.el.remove();
    this.hud = null;
  }
}

const CSS = `
.mdu-dfn { position: absolute; left: 24px; top: 190px; display: none; padding: 8px 10px 6px; background: rgba(24, 14, 6, 0.62); border: 1px solid rgba(232, 190, 120, 0.45); border-radius: 3px; font-family: 'Rye', 'Special Elite', serif; color: #f4ddb0; text-shadow: 0 1px 2px #000; pointer-events: none; }
.mdu-dfn.is-on { display: block; }
.mdu-dfn b { display: block; font-weight: normal; font-size: 15px; letter-spacing: 1px; text-align: center; margin-bottom: 5px; color: #ffd08a; }
.mdu-dfn svg { display: block; }
.mdu-dfn span { display: block; font-size: 12px; text-align: center; margin-top: 4px; }
.mdu-dfn .fl { fill: rgba(120, 90, 50, 0.35); }
.mdu-dfn .dk { fill: rgba(90, 60, 30, 0.5); }
.mdu-dfn .rw { stroke: rgba(70, 120, 50, 0.7); stroke-width: 2.4; }
.mdu-dfn .gt { fill: rgba(255, 210, 120, 0.8); }
.mdu-dfn .tw { fill: #8a8070; stroke: #2a2018; stroke-width: 1; }
.mdu-dfn .wb { fill: rgba(0, 0, 0, 0.6); }
.mdu-dfn .pl { stroke: #1a1008; stroke-width: 1.2; }
.mdu-dfn .pl.hit { stroke: #fff; stroke-width: 2; }
.mdu-dfn .px { stroke: #ff5a3a; stroke-width: 1.6; }
.mdu-dfn .zs circle { fill: #ff3a2a; }
.mdu-dfn .ps .me { fill: #ffd34a; stroke: #000; stroke-width: 0.8; }
.mdu-dfn .ps .mate { fill: #7ad0ff; stroke: #000; stroke-width: 0.8; }
.mdu-dfn .cr { fill: #6a2a9a; stroke: #e0b0ff; stroke-width: 1; }
`;
