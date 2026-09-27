import * as THREE from 'three';
import { DOORS, WALL_BUYS, PERK_SPOTS, POWER, PAP, BOX_SPOTS, BOX_START, ZONES } from '../config/map';
import { WEAPONS, BOX_POOL, GRENADE, BOWIE, weaponStats, tierOf, maxTier, PAP_COST, ELEM_INFO } from '../config/weapons';
import { PERKS } from '../config/perks';
import { LOCK_COST } from '../config/rules';
import { chalkTexture, perkLabel, toTexture } from '../core/textures';
import { buildMate, buildKnife, getMats } from '../weapons/viewmodels';
import { mesh, boxGeo, cylGeo } from './props';
import { DOOR_H } from './World';

// Cuánto le convidás a un compañero por apretada.
const SHARE = 500;

// Todo lo que se usa con F: puertas, dibujos de tiza, perks (paquetes de
// yerba gigantes), caja misteriosa, Pack-a-Pava, la palanca de la luz y las
// barreras. También los candados que pone el Capataz.

const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export default class Interactables {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.animations = [];
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.M = game.world.M;
    this.buildDoors();
    this.buildWallBuys();
    this.buildPerks();
    this.buildPower();
    this.buildPap();
    this.buildBox();
    this.buildRepair();
    this.current = null;
    this.holdT = 0;
  }

  add(it) {
    it.radius = it.radius || 1.8;
    it.index = this.list.length;
    this.list.push(it);
    return it;
  }

  anchor(cell, face, depth = 0) {
    return this.g.world.wallAnchor(cell, face, depth);
  }

  // ---------------- puertas ----------------
  buildDoors() {
    const M = this.M;
    DOORS.forEach((d, i) => {
      const xs = d.cells.map((c) => c[0]);
      const zs = d.cells.map((c) => c[1]);
      const horizontal = zs[0] === zs[1];
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs) + 1) / 2;
      const width = d.cells.length;
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);
      group.rotation.y = horizontal ? 0 : Math.PI / 2;
      const pieces = [];
      if (d.kind === 'door') {
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group();
          hinge.position.set((s * width) / 2, 0, 0);
          const panel = mesh(boxGeo(width / 2 - 0.02, DOOR_H - 0.05, 0.1), M.woodDark, (-s * width) / 4, DOOR_H / 2, 0);
          hinge.add(panel);
          for (const y of [0.5, 1.4, 2.2]) hinge.add(mesh(boxGeo(width / 2 - 0.1, 0.12, 0.13), M.wood, (-s * width) / 4, y, 0));
          hinge.add(mesh(boxGeo(0.04, 0.2, 0.16), M.iron, -s * 0.1, 1.2, 0));
          hinge.add(mesh(boxGeo(0.12, 0.08, 0.14), M.iron, -s * (width / 2 - 0.1), 1.25, 0));
          group.add(hinge);
          pieces.push({ obj: hinge, side: s });
        }
      } else {
        // escombros: tablas, bolsas, barriles y una mesa dada vuelta
        const r = mulberry(i * 91);
        const items = [];
        for (let k = 0; k < 7; k++) {
          const w = 1.4 + r() * 0.8;
          items.push(mesh(boxGeo(w, 0.06, 0.18), M.wood, (r() - 0.5) * 1.2, 0.3 + r() * 1.9, (r() - 0.5) * 0.4, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, (r() - 0.5) * 1.4));
        }
        for (let k = 0; k < 4; k++) items.push(mesh(boxGeo(0.6, 0.35, 0.45), M.sackYerba, (r() - 0.5) * 1.4, 0.18 + (k > 1 ? 0.35 : 0), (r() - 0.5) * 0.3, 0, r(), 0));
        items.push(mesh(cylGeo(0.3, 0.3, 0.9, 12), M.drumRed, 0.6, 0.45, 0.1));
        items.push(mesh(boxGeo(1.6, 0.06, 0.9), M.woodDark, -0.2, 1.1, 0.2, 1.3, 0, 0.2));
        for (const m of items) {
          group.add(m);
          pieces.push({ obj: m, vel: new THREE.Vector3((r() - 0.5) * 3, 3 + r() * 4, (r() - 0.5) * 3), spin: new THREE.Vector3(r() * 6, r() * 6, r() * 6) });
        }
      }
      this.root.add(group);
      const door = { def: d, index: i, group, pieces, open: false };
      this.add({
        kind: 'door',
        door,
        pos: new THREE.Vector3(cx, 1.2, cz),
        radius: 2.6,
        wide: true,
        prompt: () => (door.open ? null : `abrir ${d.kind === 'debris' ? 'los escombros' : 'la puerta'}`),
        cost: () => d.cost,
        use: () => this.openDoor(door),
      });
    });
  }

  openDoor(door) {
    const g = this.g;
    if (door.open) return;
    g.net?.event('door', { i: door.index });
    door.open = true;
    g.world.openDoor(door.index);
    for (const z of door.def.zones) g.activateZone(z);
    g.audio.door(door.group.position, door.def.kind === 'debris');
    const start = g.time;
    this.animations.push((t, dt) => {
      const k = Math.min(1, (t - start) / (door.def.kind === 'debris' ? 1.3 : 0.9));
      for (const p of door.pieces) {
        if (door.def.kind === 'door') p.obj.rotation.y = p.side * -1.75 * easeOut(k);
        else {
          const tt = t - start;
          p.obj.position.addScaledVector(p.vel, dt);
          p.vel.y -= 9 * dt;
          p.obj.rotation.x += p.spin.x * dt;
          p.obj.rotation.y += p.spin.y * dt;
          p.obj.scale.setScalar(Math.max(0.001, 1 - tt / 1.3));
        }
      }
      if (door.def.kind === 'debris' && k >= 1) door.group.visible = false;
      return k < 1;
    });
    g.fx.dust(door.group.position.clone().setY(1), UP, [0.45, 0.4, 0.35], 16);
  }

  // ---------------- dibujos de tiza ----------------
  buildWallBuys() {
    for (const wb of WALL_BUYS) {
      const isNade = wb.weapon === 'granadas';
      const isBowie = wb.weapon === 'bowie';
      const cost = isNade ? GRENADE.wall : isBowie ? BOWIE.cost : WEAPONS[wb.weapon].wall;
      const w = isNade ? { name: 'Bombas de yerba', chalk: 'bomb' } : isBowie ? { name: BOWIE.name, chalk: 'knife' } : WEAPONS[wb.weapon];
      const a = this.anchor(wb.cell, wb.face, 0.01);
      const wallWeapon = isNade || isBowie ? null : wb.weapon;
      const tex = chalkTexture(w, cost);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
      plane.position.set(a.x, 1.55, a.z);
      plane.rotation.y = a.rot;
      this.root.add(plane);
      let shown = null;
      const g = this.g;
      // la primera compra deja el mate (o el facón) "colgado" sobre el dibujo
      const show = () => {
        if (shown || isNade) return;
        shown = isBowie ? buildKnife(g.textures, 'plata') : buildMate(wb.weapon, false, g.textures).root;
        shown.scale.setScalar(isBowie ? 3 : 3.2);
        shown.position.set(a.x + wb.face[0] * 0.12, 1.55, a.z + wb.face[1] * 0.12);
        shown.rotation.set(0, a.rot + Math.PI / 2, isBowie ? -1.1 : 0.2);
        this.root.add(shown);
      };
      this.add({
        kind: 'wallbuy',
        weapon: wallWeapon,
        isNade,
        bowie: isBowie,
        show,
        pos: new THREE.Vector3(a.x, 1.5, a.z),
        radius: 1.9,
        prompt: () => {
          if (isNade) return g.weapons.grenades >= GRENADE.max ? null : 'comprar bombas de yerba';
          if (isBowie) return g.weapons.bowie ? null : `comprar el ${BOWIE.name}`;
          if (g.weapons.has(wb.weapon)) return 'comprar munición';
          // con las manos llenas se cambia el mate que tenés en la mano
          if (g.weapons.full) return `cambiar tu ${g.weapons.currentName} por el ${w.name}`;
          return `comprar ${w.name}`;
        },
        cost: () => {
          if (isNade || isBowie) return cost;
          const s = g.weapons.slots.find((x) => x.id === wb.weapon);
          if (s) return s.up ? 4500 : Math.round(cost / 2);
          return cost;
        },
        use: () => {
          if (isNade) {
            g.weapons.grenades = GRENADE.max;
            g.weapons.updateHud();
            return true;
          }
          if (isBowie) {
            if (g.weapons.bowie) return false;
            g.weapons.giveBowie();
            show();
            return true;
          }
          if (g.weapons.has(wb.weapon)) return g.weapons.refillAmmo(wb.weapon);
          g.weapons.give(wb.weapon);
          show();
          return true;
        },
      });
    }
  }

  // ---------------- perks ----------------
  buildPerks() {
    const g = this.g;
    this.perkMachines = [];
    for (const spot of PERK_SPOTS) {
      const perk = PERKS[spot.perk];
      const D = 0.8;
      const a = this.anchor(spot.cell, spot.face, D / 2 + 0.02);
      const group = new THREE.Group();
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.rot;
      const label = perkLabel(perk);
      const side = new THREE.MeshStandardMaterial({ color: perk.label.bg, roughness: 0.55 });
      const front = new THREE.MeshStandardMaterial({ map: label, roughness: 0.5, emissive: 0xffffff, emissiveMap: label, emissiveIntensity: 0.05 });
      const W = 1.15;
      const H = 2.1;
      // paquete: caja con la cara frontal impresa y el cierre doblado arriba
      const pack = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [side, side, side, side, front, side]);
      pack.position.y = H / 2;
      pack.castShadow = pack.receiveShadow = true;
      group.add(pack);
      const fold = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.18, D * 0.35), side);
      fold.position.set(0, H + 0.06, 0);
      fold.rotation.x = 0.25;
      group.add(fold);
      // bandeja donde "sale" el mate
      const tray = mesh(boxGeo(0.5, 0.06, 0.2), this.M.metal, 0, 0.1, D / 2 + 0.08);
      group.add(tray);
      const slot = mesh(boxGeo(0.46, 0.2, 0.02), this.M.black, 0, 0.24, D / 2 + 0.005);
      group.add(slot);
      // cartel luminoso arriba
      const sign = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(perk.color), emissiveIntensity: 0.1 }));
      sign.position.set(0, H + 0.32, 0.05);
      group.add(sign);
      const bulbs = [];
      for (let k = 0; k < 6; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe6a0, emissiveIntensity: 0 }));
        b.position.set(-W / 2 + 0.1 + k * ((W - 0.2) / 5), H + 0.46, 0.05);
        group.add(b);
        bulbs.push(b);
      }
      this.root.add(group);
      const cellFront = new THREE.Vector3(a.x + spot.face[0] * (D / 2 + 0.8), 0, a.z + spot.face[1] * (D / 2 + 0.8));
      const [bx, bz] = [a.x, a.z];
      const half = spot.face[0] !== 0 ? [D / 2, W / 2] : [W / 2, D / 2];
      g.world.addBox([bx - half[0], 0, bz - half[1], bx + half[0], H + 0.3, bz + half[1]], { kind: 'machine' });
      const machine = { perk: spot.perk, group, sign, bulbs, front, gone: false, jingleT: 20 + Math.random() * 40 };
      this.perkMachines.push(machine);
      const it = this.add({
        kind: 'perk',
        lockable: true,
        pos: new THREE.Vector3(a.x, 1.2, a.z),
        front: cellFront,
        radius: 2.1,
        machine,
        prompt: () => {
          if (machine.gone) return null;
          if (g.player.perks.has(spot.perk)) return null;
          if (!g.world.power && spot.perk !== 'revive') return { text: 'Primero hay que encender la luz', noCost: true };
          return `tomar ${perk.name}`;
        },
        // Rosamorte sale barato solo cuando jugás solo (como en el original)
        cost: () => (spot.perk === 'revive' && !g.net?.remote.size ? perk.soloCost : perk.cost),
        use: () => {
          if (!g.world.power && spot.perk !== 'revive') return false;
          if (g.weapons.state === 'drink') return false;
          g.audio.perkJingle(spot.perk, it.pos);
          g.weapons.drink(perk.color, () => {
            g.player.givePerk(spot.perk);
            const coop = g.net?.remote.size && perk.coopDesc;
            g.hud.subtitle(`${perk.name}: ${coop ? perk.coopDesc : perk.desc}`, 3);
            if (spot.perk === 'revive' && !coop && g.player.reviveUses >= 2) {
              // tercera y última: la máquina se va
              machine.gone = true;
              this.g.later(2.5, () => {
                machine.group.visible = false;
                g.fx.explosion(machine.group.position.clone().setY(1), 1.5, [0.5, 0.8, 1]);
              });
            }
          });
          return true;
        },
      });
    }
  }

  // ---------------- palanca de la luz ----------------
  buildPower() {
    const g = this.g;
    const a = this.anchor(POWER.cell, POWER.face, 0.1);
    const group = new THREE.Group();
    group.position.set(a.x, 0, a.z);
    group.rotation.y = a.rot;
    group.add(mesh(boxGeo(0.9, 1.2, 0.2), this.M.metalGreen, 0, 1.5, 0));
    group.add(mesh(boxGeo(0.7, 0.2, 0.05), this.M.black, 0, 2.2, 0.1));
    const lever = new THREE.Group();
    lever.position.set(0, 1.45, 0.14);
    lever.add(mesh(cylGeo(0.025, 0.025, 0.55, 8), this.M.iron, 0, 0.27, 0));
    lever.add(mesh(cylGeo(0.05, 0.05, 0.14, 10), this.M.redPaint, 0, 0.56, 0, 0, 0, Math.PI / 2));
    lever.rotation.x = 0.6;
    group.add(lever);
    // cables que suben al techo
    for (const x of [-0.3, 0, 0.3]) group.add(mesh(cylGeo(0.03, 0.03, 1.6, 6), this.M.black, x, 2.9, -0.02));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 }));
    lamp.position.set(0.32, 1.95, 0.12);
    group.add(lamp);
    this.root.add(group);
    this.powerLever = { lever, lamp };
    this.add({
      kind: 'power',
      pos: new THREE.Vector3(a.x, 1.5, a.z),
      radius: 1.8,
      prompt: () => (g.world.power ? null : { text: 'encender la luz', noCost: true }),
      cost: () => 0,
      use: () => {
        if (g.world.power) return false;
        const start = g.time;
        this.animations.push((t) => {
          const k = Math.min(1, (t - start) / 0.5);
          lever.rotation.x = 0.6 - k * 1.2;
          return k < 1;
        });
        lamp.material.emissive.set(0x20ff40);
        g.turnOnPower();
        return true;
      },
    });
  }

  setPowerVisuals(on) {
    for (const m of this.perkMachines) {
      m.sign.material.emissiveIntensity = on ? 2.2 : m.perk === 'revive' ? 1.2 : 0.1;
      m.front.emissiveIntensity = on ? 0.35 : 0.05;
    }
    if (this.pap) this.pap.glow.material.emissiveIntensity = on ? 2.5 : 0;
  }

  // ---------------- Pack-a-Pava ----------------
  buildPap() {
    const g = this.g;
    const M = this.M;
    const mats = getMats(g.textures);
    const D = 1.1;
    const a = this.anchor(PAP.cell, PAP.face, D / 2 + 0.02);
    const px = a.x + (PAP.face[1] !== 0 ? 0.5 : 0);
    const pz = a.z + (PAP.face[0] !== 0 ? 0.5 : 0);
    const group = new THREE.Group();
    group.position.set(px, 0, pz);
    group.rotation.y = a.rot;
    // gabinete
    group.add(mesh(boxGeo(1.9, 1.2, D), M.metalGreen, 0, 0.6, 0));
    group.add(mesh(boxGeo(2.0, 0.1, D + 0.1), M.brass, 0, 1.25, 0));
    group.add(mesh(boxGeo(0.9, 0.35, 0.05), M.black, 0, 0.85, D / 2 + 0.01));
    // pava gigante
    const kettle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.7, 0.15], [0.68, 0.55], [0.45, 0.85], [0.18, 0.95], [0.2, 1.02]].map(([r, y]) => new THREE.Vector2(r, y)), 28), mats.aluminium);
    kettle.position.y = 1.3;
    kettle.castShadow = true;
    group.add(kettle);
    const spout = mesh(cylGeo(0.06, 0.16, 0.8, 12), mats.aluminium, 0, 1.75, 0.62, 1.0, 0, 0);
    group.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 20, Math.PI), M.iron);
    handle.position.set(0, 2.3, 0);
    handle.rotation.y = Math.PI / 2;
    group.add(handle);
    // manómetros y caños
    for (const x of [-0.7, 0.7]) {
      group.add(mesh(cylGeo(0.09, 0.09, 0.05, 16), M.brass, x, 0.95, D / 2 + 0.03, Math.PI / 2, 0, 0));
      group.add(mesh(cylGeo(0.05, 0.05, 1.8, 8), M.copper, x * 1.2, 1.9, -D / 2 + 0.1));
    }
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xc060ff, emissiveIntensity: 0 }));
    glow.position.set(0, 0.62, D / 2 + 0.02);
    group.add(glow);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ map: this.papSign(), transparent: true }));
    label.position.set(0, 0.3, D / 2 + 0.012);
    group.add(label);
    this.root.add(group);
    const half = PAP.face[0] !== 0 ? [D / 2, 1] : [1, D / 2];
    g.world.addBox([px - half[0], 0, pz - half[1], px + half[0], 2.4, pz + half[1]], { kind: 'machine' });
    const front = new THREE.Vector3(px + PAP.face[0] * 1.5, 0, pz + PAP.face[1] * 1.5);
    const pap = { group, glow, state: 'idle', t: 0, entry: null, model: null, kettle, spoutTip: new THREE.Vector3() };
    this.pap = pap;
    const slotPos = new THREE.Vector3(px + PAP.face[0] * (D / 2 + 0.25), 0.85, pz + PAP.face[1] * (D / 2 + 0.25));
    pap.slotPos = slotPos;
    pap.face = new THREE.Vector3(PAP.face[0], 0, PAP.face[1]);
    this.add({
      kind: 'pap',
      lockable: true,
      pos: new THREE.Vector3(px, 1.2, pz),
      front,
      radius: 2.4,
      prompt: () => {
        if (!g.world.power) return { text: 'El Pack-a-Pava necesita luz', noCost: true };
        if (pap.state === 'working' || pap.entry?.remote !== undefined) return null;
        if (pap.state === 'ready') return { text: `agarrar ${weaponStats(pap.entry.id, pap.tier).name}`, noCost: true };
        const s = g.weapons.slot;
        if (!s || !WEAPONS[s.id].pap) return null;
        const tier = tierOf(s.up);
        if (tier >= maxTier(s.id)) return { text: tier >= 2 ? 'Ese mate ya tiene las dos mejoras' : 'Ese mate ya está mejorado', noCost: true };
        const what = tier ? `segunda mejora de ${weaponStats(s.id, 1).name}: ${ELEM_INFO[WEAPONS[s.id].pap.elem].desc}` : `mejorar ${WEAPONS[s.id].name}`;
        if (g.activities?.freePap) return { text: `${what} gratis (regalo de las ánimas)`, noCost: true };
        return what;
      },
      cost: () => {
        if (pap.state === 'ready' || g.activities?.freePap) return 0;
        const s = g.weapons.slot;
        return PAP_COST[Math.min(1, s ? tierOf(s.up) : 0)];
      },
      use: () => {
        if (!g.world.power) return false;
        if (pap.entry?.remote !== undefined) return false;
        if (pap.state === 'ready') {
          g.weapons.give(pap.entry.id, pap.tier);
          this.clearPap();
          return true;
        }
        if (pap.state !== 'idle') return false;
        const s = g.weapons.slot;
        if (!s || tierOf(s.up) >= maxTier(s.id)) return false;
        pap.tier = tierOf(s.up) + 1;
        pap.entry = g.weapons.take();
        if (g.activities) g.activities.freePap = false;
        pap.state = 'working';
        pap.t = 0;
        pap.model = buildMate(pap.entry.id, pap.entry.up, g.textures).root;
        pap.model.scale.setScalar(2.4);
        pap.model.position.copy(slotPos);
        pap.model.rotation.y = a.rot + Math.PI / 2;
        this.root.add(pap.model);
        pap.slotPos = slotPos;
        pap.face = new THREE.Vector3(PAP.face[0], 0, PAP.face[1]);
        g.audio.pap(slotPos);
        return true;
      },
    });
  }

  papSign() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a0f22';
    ctx.fillRect(0, 0, 512, 96);
    ctx.font = 'bold 54px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8c8ff';
    ctx.shadowColor = '#b050ff';
    ctx.shadowBlur = 16;
    ctx.fillText(`PACK-A-PAVA · $${PAP_COST[0]}`, 256, 50);
    return toTexture(c, { repeat: false });
  }

  clearPap() {
    const pap = this.pap;
    pap.model?.removeFromParent();
    pap.model = null;
    pap.entry = null;
    pap.state = 'idle';
  }

  updatePap(dt) {
    const g = this.g;
    const pap = this.pap;
    if (pap.state === 'idle') return;
    pap.t += dt;
    if (pap.state === 'working') {
      // el mate entra a la máquina, humea y sale mejorado
      const k = Math.min(1, pap.t / 0.8);
      pap.model.position.copy(pap.slotPos).addScaledVector(pap.face, -k * 0.5);
      pap.model.scale.setScalar(2.4 * (1 - k * 0.8));
      pap.kettle.position.x = Math.sin(pap.t * 40) * 0.015;
      if (Math.random() < 0.5) {
        pap.kettle.getWorldPosition(tmpV);
        g.fx.steam(tmpV.add(new THREE.Vector3(0, 1.1, 0)), 2, 0.2);
      }
      if (pap.t > 3.4) {
        pap.model.removeFromParent();
        pap.model = buildMate(pap.entry.id, pap.tier, g.textures).root;
        pap.model.scale.setScalar(2.4);
        pap.model.rotation.y = this.anchor(PAP.cell, PAP.face).rot + Math.PI / 2;
        this.root.add(pap.model);
        pap.state = 'ready';
        pap.t = 0;
        pap.kettle.position.x = 0;
        g.fx.sparkle(pap.slotPos, [0.9, 0.5, 1], 30, 0.6);
      }
    } else if (pap.state === 'ready') {
      const k = Math.min(1, pap.t / 0.6);
      pap.model.position.copy(pap.slotPos).addScaledVector(pap.face, k * 0.2);
      pap.model.position.y = pap.slotPos.y + Math.sin(g.time * 3) * 0.03;
      if (Math.random() < 0.3) g.fx.sparkle(pap.model.position, [0.9, 0.5, 1], 1, 0.3);
      if (pap.entry.remote !== undefined && pap.t > 2.5) this.clearPap();
      else if (pap.t > 12) {
        g.hud.subtitle('El Pack-a-Pava se quedó con tu mate. Nunca lo dejes esperando.', 3);
        this.clearPap();
      }
    }
  }

  // ---------------- caja misteriosa ----------------
  buildBox() {
    const g = this.g;
    const M = this.M;
    const mats = getMats(g.textures);
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: g.textures.planks, color: 0xd8b890, roughness: 0.8 });
    const qMat = new THREE.MeshBasicMaterial({ map: g.textures.question, transparent: true, color: new THREE.Color(0x9fd8ff).multiplyScalar(1.6), toneMapped: false, depthWrite: false });
    group.add(mesh(boxGeo(1.7, 0.55, 0.8), wood, 0, 0.28, 0));
    for (const x of [-0.84, 0.84]) group.add(mesh(boxGeo(0.05, 0.57, 0.82), M.iron, x, 0.28, 0));
    for (const s of [-1, 1]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), qMat);
      q.position.set(s * 0.45, 0.3, 0.405);
      group.add(q);
    }
    const lid = new THREE.Group();
    lid.position.set(0, 0.56, -0.4);
    const lidMesh = mesh(boxGeo(1.72, 0.1, 0.82), wood, 0, 0.05, 0.4);
    lid.add(lidMesh);
    const lq = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), qMat);
    lq.rotation.x = -Math.PI / 2;
    lq.position.set(0, 0.105, 0.4);
    lid.add(lq);
    group.add(lid);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.5;
    group.add(inner);
    // haz de luz que marca dónde está la caja
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 20;
    this.root.add(group);
    this.root.add(beam);
    // taza de café burlona
    const cup = new THREE.Group();
    const faceTex = g.textures.coffeeFace;
    const cupMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.3 });
    const cupBody = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.12, 0], [0.14, 0.03], [0.16, 0.25], [0.17, 0.28]].map(([r, y]) => new THREE.Vector2(r, y)), 28), cupMat);
    cupBody.rotation.y = -Math.PI / 2;
    cup.add(cupBody);
    const handleCup = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 16), mats.ceramic);
    handleCup.position.set(0.17, 0.14, 0);
    cup.add(handleCup);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.155, 24), new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.1 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.26;
    cup.add(coffee);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.03, 24), mats.ceramic);
    cup.add(saucer);
    cup.visible = false;
    this.root.add(cup);

    const box = {
      group,
      lid,
      inner,
      beam,
      cup,
      qMat,
      spot: BOX_START[Math.floor(Math.random() * BOX_START.length)],
      state: 'closed',
      t: 0,
      uses: 0,
      offer: null,
      model: null,
      locked: false,
      models: new Map(),
    };
    this.box = box;
    this.placeBox(box.spot);
    const it = this.add({
      kind: 'box',
      lockable: true,
      pos: new THREE.Vector3(),
      front: new THREE.Vector3(),
      radius: 2.1,
      prompt: () => {
        if (box.state === 'closed') return 'abrir la Caja Misteriosa';
        if (box.state === 'offer') {
          const name = WEAPONS[box.offer].name;
          if (g.weapons.full && WEAPONS[box.offer].kind !== 'tactical') return { text: `cambiar tu ${g.weapons.currentName} por el ${name}`, noCost: true };
          return { text: `agarrar ${name}`, noCost: true };
        }
        return null;
      },
      cost: () => (box.state === 'offer' ? 0 : g.powerups.active.firesale ? 10 : 950),
      use: () => {
        if (box.state === 'closed') return this.openBox();
        if (box.state === 'offer') {
          g.weapons.give(box.offer);
          box.model?.removeFromParent();
          box.model = null;
          this.closeBox();
          return true;
        }
        return false;
      },
    });
    this.boxIt = it;
    this.placeBox(box.spot);
  }

  placeBox(i) {
    const box = this.box;
    const spot = BOX_SPOTS[i];
    box.spot = i;
    const a = this.anchor(spot.cell, spot.face, 0.45);
    const lat = spot.face[1] !== 0 ? [0.5, 0] : [0, 0.5];
    const x = a.x + lat[0];
    const z = a.z + lat[1];
    box.group.position.set(x, 0, z);
    box.group.rotation.y = a.rot;
    box.beam.position.set(x, 20, z);
    box.center = new THREE.Vector3(x, 0, z);
    box.face = new THREE.Vector3(spot.face[0], 0, spot.face[1]);
    if (this.boxIt) {
      this.boxIt.pos.set(x, 0.8, z);
      this.boxIt.front.set(x + spot.face[0] * 1.3, 0, z + spot.face[1] * 1.3);
    }
    if (box.collider) box.collider.active = false;
    const half = spot.face[0] !== 0 ? [0.4, 0.85] : [0.85, 0.4];
    box.collider = this.g.world.addBox([x - half[0], 0, z - half[1], x + half[0], 0.6, z + half[1]], { kind: 'box' });
  }

  // El invitado se lleva el mate que ofrece la caja.
  takeBoxWeapon() {
    const box = this.box;
    box.model?.removeFromParent();
    box.model = null;
    this.closeBox();
  }

  // Mejora el mate de un invitado (el anfitrión no lo tiene en la mano).
  startPapFor(weaponId, playerId, tier = 1) {
    const g = this.g;
    const pap = this.pap;
    if (pap.state !== 'idle') return false;
    pap.entry = { id: weaponId, up: tier - 1, remote: playerId };
    pap.tier = tier;
    pap.state = 'working';
    pap.t = 0;
    pap.model = buildMate(weaponId, tier - 1, g.textures).root;
    pap.model.scale.setScalar(2.4);
    pap.model.position.copy(pap.slotPos);
    pap.model.rotation.y = this.anchor(PAP.cell, PAP.face).rot + Math.PI / 2;
    this.root.add(pap.model);
    g.audio.pap(pap.slotPos);
    g.net?.event('pap', { s: 'working', w: weaponId, up: tier });
    return true;
  }

  applyRemoteBox(m) {
    const box = this.box;
    if (m.spot !== undefined && m.spot !== box.spot) this.placeBox(m.spot);
    if (m.s === 'spinning' && box.state !== 'spinning') {
      box.state = 'spinning';
      box.t = 0;
      box.coffee = !!m.coffee;
      box.offer = m.w || box.offer;
      box.pool = m.pool ? m.pool.map((id) => ({ id })) : BOX_POOL;
      box.nextSwap = 0;
      this.g.audio.boxOpen(box.center);
    } else if (m.s === 'closing') {
      box.model?.removeFromParent();
      box.model = null;
      this.closeBox();
    } else if (m.s) box.state = m.s;
  }

  applyRemotePap(m) {
    const pap = this.pap;
    if (m.s === 'working' && pap.state === 'idle') this.startPapFor(m.w, -1, m.up || 1);
  }

  openBox() {
    const g = this.g;
    const box = this.box;
    box.state = 'spinning';
    box.t = 0;
    box.uses++;
    box.taker = null; // si la abrió un invitado, lo anota el anfitrión después
    g.audio.boxOpen(box.center);
    // la taza de café aparece a partir del 4to uso (no en fire sale)
    const coffeeChance = box.uses >= 4 && !g.powerups.active.firesale ? 0.18 + (box.uses - 4) * 0.03 : 0;
    box.coffee = Math.random() < coffeeChance;
    const pool = BOX_POOL.filter((w) => !g.weapons.has(w.id) && !(w.id === 'pava' && g.weapons.tactical));
    let total = pool.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    box.offer = pool[pool.length - 1].id;
    for (const w of pool) {
      r -= w.weight;
      if (r <= 0) {
        box.offer = w.id;
        break;
      }
    }
    box.pool = pool;
    box.nextSwap = 0;
    g.net?.event('box', { s: 'spinning', w: box.offer, coffee: box.coffee, pool: pool.map((w) => w.id), spot: box.spot });
    return true;
  }

  closeBox() {
    const box = this.box;
    box.state = 'closing';
    box.t = 0;
    box.offer = null;
    this.g.net?.event('box', { s: 'closing' });
  }

  boxModel(id) {
    const box = this.box;
    let m = box.models.get(id);
    if (!m) {
      m = buildMate(id, false, this.g.textures).root;
      m.scale.setScalar(2.6);
      box.models.set(id, m);
    }
    return m;
  }

  updateBox(dt) {
    const g = this.g;
    const box = this.box;
    box.t += dt;
    const lidOpen = (k) => {
      box.lid.rotation.x = -1.7 * k;
      box.inner.material.opacity = k * 0.8;
    };
    box.beam.material.opacity = 0.1 + Math.sin(g.time * 2) * 0.03;
    box.qMat.color.setRGB(0.6, 0.85, 1).multiplyScalar(1.2 + Math.sin(g.time * 3) * 0.4);
    switch (box.state) {
      case 'spinning': {
        lidOpen(Math.min(1, box.t / 0.4));
        const k = Math.min(1, box.t / 4.2);
        if (box.t > 0.3) {
          box.nextSwap -= dt;
          if (box.nextSwap <= 0 && k < 1) {
            box.nextSwap = 0.06 + k * k * 0.35;
            const pick = box.pool[Math.floor(Math.random() * box.pool.length)].id;
            this.showBoxModel(pick);
          }
          if (box.model) {
            box.model.position.copy(box.center).add(new THREE.Vector3(0, 0.5 + k * 0.5, 0));
            box.model.rotation.y = box.group.rotation.y + Math.PI / 2 + Math.sin(g.time * 2) * 0.1;
          }
        }
        if (k >= 1) {
          if (box.coffee) {
            box.model?.removeFromParent();
            box.model = null;
            box.state = 'coffee';
            box.t = 0;
            box.cup.visible = true;
            box.cup.position.copy(box.center).add(new THREE.Vector3(0, 0.6, 0));
            box.cup.rotation.y = box.group.rotation.y;
            g.audio.laugh(box.center);
            g.hud.subtitle('¿Café? ¿En serio? La caja se muda.', 3);
          } else {
            this.showBoxModel(box.offer);
            box.state = 'offer';
            box.t = 0;
          }
        }
        break;
      }
      case 'offer': {
        if (box.model) box.model.position.y = box.center.y + 1.0 + Math.sin(g.time * 2.5) * 0.03 - Math.max(0, box.t - 9) * 0.15;
        if (box.t > 12) {
          box.model?.removeFromParent();
          box.model = null;
          this.closeBox();
        }
        break;
      }
      case 'closing':
        lidOpen(Math.max(0, 1 - box.t / 0.5));
        if (box.t > 0.5) box.state = 'closed';
        break;
      case 'coffee': {
        // la taza sube riéndose, la caja tiembla y se va volando
        const k = box.t;
        box.cup.position.y = box.center.y + 0.6 + Math.min(1, k) * 0.9;
        box.cup.rotation.y += dt * 2;
        box.cup.rotation.z = Math.sin(k * 20) * 0.15;
        if (k > 2) {
          box.cup.visible = false;
          box.group.position.y = (k - 2) * (k - 2) * 3;
          box.group.rotation.z = Math.sin(k * 30) * 0.1 * (k - 2);
          if (Math.random() < 0.4) g.fx.sparkle(box.group.position, [0.6, 0.85, 1], 3, 1);
        }
        if (k > 1.2 && !box.refunded) {
          box.refunded = true;
          // la plata vuelve al que la abrió (en línea puede ser un invitado)
          if (g.powerups.active.firesale) {
            // en fire sale no se devuelve nada
          } else if (box.taker != null && g.net?.host && box.taker !== g.net.id) g.net.givePts(box.taker, 950);
          else g.addPoints(950, null, true);
          g.audio.whoosh(box.center);
        }
        if (k > 4.5) {
          box.group.visible = false;
          box.beam.visible = false;
          box.collider.active = false;
          box.state = 'away';
          box.t = 0;
          box.refunded = false;
        }
        break;
      }
      case 'away': {
        if (box.t > 5) {
          const options = BOX_SPOTS.map((_, i) => i).filter((i) => i !== box.spot);
          const next = options[Math.floor(Math.random() * options.length)];
          box.group.visible = true;
          box.beam.visible = true;
          box.group.position.y = 0;
          box.group.rotation.z = 0;
          lidOpen(0);
          box.uses = 0;
          this.placeBox(next);
          box.state = 'closed';
          g.net?.event('box', { s: 'closed', spot: next });
          g.fx.flash(box.center, 0x9fd8ff, 40, 0.5, 12);
          g.hud.subtitle(`La caja apareció en ${ZONES[BOX_SPOTS[next].zone].name}.`, 3);
        }
        break;
      }
      default:
        break;
    }
  }

  showBoxModel(id) {
    const box = this.box;
    box.model?.removeFromParent();
    box.model = this.boxModel(id);
    box.model.position.copy(box.center).add(new THREE.Vector3(0, 0.6, 0));
    box.model.rotation.y = box.group.rotation.y + Math.PI / 2;
    this.root.add(box.model);
  }

  // ---------------- barreras ----------------
  buildRepair() {
    const g = this.g;
    for (const w of g.barriers.windows) {
      this.add({
        kind: 'repair',
        hold: true,
        pos: new THREE.Vector3(w.int.x + w.out.x * 0.6, 1.2, w.int.z + w.out.z * 0.6),
        radius: 1.9,
        window: w,
        prompt: () => (g.barriers.count(w.i) < 6 ? { text: 'reconstruir la barrera', hold: true, noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (g.barriers.count(w.i) >= 6) return false;
          if (g.barriers.repair(w.i)) g.addPoints(10, null, false, 'board');
          return true;
        },
      });
    }
  }

  // ---------------- candados del Capataz ----------------
  lockTarget(from) {
    let best = null;
    let bd = 13;
    for (const it of this.list) {
      if (!it.lockable || it.locked) continue;
      if (it.kind === 'box' && (this.box.state === 'away' || this.box.state === 'coffee')) continue;
      if (it.kind === 'perk' && it.machine.gone) continue;
      const d = it.pos.distanceTo(from);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  lock(it) {
    if (it.locked) return;
    it.locked = true;
    const g = this.g;
    const chain = new THREE.Group();
    const iron = this.M.iron;
    for (let i = 0; i < 12; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), iron);
      link.position.set(-0.6 + i * 0.11, 1.0 + Math.sin(i * 0.5) * 0.12, 0);
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      chain.add(link);
    }
    const padlock = mesh(boxGeo(0.16, 0.18, 0.08), this.M.brass, 0, 0.88, 0.02);
    chain.add(padlock);
    chain.position.copy(it.pos).setY(0);
    const toFront = new THREE.Vector3().subVectors(it.front, it.pos).setY(0).normalize();
    chain.position.addScaledVector(toFront, 0.62);
    chain.rotation.y = Math.atan2(toFront.x, toFront.z);
    this.root.add(chain);
    it.lockMesh = chain;
    g.hud.subtitle('El Capataz clausuró una máquina.', 2.5, 'boss');
    if (Math.random() < 0.6) g.say('capataz', Math.random() < 0.5 ? 'Clausurado. Por vago.' : 'Esta máquina queda cerrada hasta nuevo aviso.');
  }

  unlock(it) {
    it.locked = false;
    it.lockMesh?.removeFromParent();
    it.lockMesh = null;
    this.g.audio.chain(it.pos);
  }

  // ---------------- actualización ----------------
  update(dt, input) {
    const g = this.g;
    for (let i = this.animations.length - 1; i >= 0; i--) if (!this.animations[i](g.time, dt)) this.animations.splice(i, 1);
    this.updateBox(dt);
    this.updatePap(dt);
    // jingles de las máquinas cuando estás cerca
    for (const m of this.perkMachines) {
      if (m.gone) continue;
      m.jingleT -= dt;
      const d = m.group.position.distanceTo(g.player.pos);
      if (m.jingleT <= 0 && d < 9 && (g.world.power || m.perk === 'revive')) {
        m.jingleT = 45 + Math.random() * 60;
        g.audio.perkJingle(m.perk, m.group.position.clone().setY(2));
      }
      const on = g.world.power || m.perk === 'revive';
      m.bulbs.forEach((b, k) => {
        b.material.emissiveIntensity = on ? (Math.floor(g.time * 4 + k) % 3 === 0 ? 3 : 0.6) : 0;
      });
    }

    if (!g.player.alive || g.player.downed) {
      this.setCurrent(null);
      return;
    }
    // levantar a un compañero caído tiene prioridad
    if (g.net && this.reviveCheck(dt, input)) return;
    // qué hay adelante del jugador
    const cam = g.camera;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null;
    let bestScore = -Infinity;
    for (const it of this.list) {
      const dx = it.pos.x - g.player.pos.x;
      const dz = it.pos.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (d || 1) / Math.max(0.3, Math.hypot(fwd.x, fwd.z));
      if (d > 0.8 && dot < (it.wide ? 0.1 : 0.35)) continue;
      const pr = it.locked ? 'lock' : it.prompt();
      if (!pr) continue;
      const score = dot * 2 - d;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.setCurrent(best);
    if (!best) {
      this.holdT = 0;
      // en línea, mirando a un compañero: convidarle plata
      if (g.net && this.shareCheck(dt, input, fwd)) return;
      g.hud.setHold(null);
      return;
    }
    if (best.locked) {
      if (input.hit('KeyF')) {
        if (g.spend(LOCK_COST)) this.unlock(best);
        else g.audio.deny();
      }
      return;
    }
    const pr0 = best.prompt();
    if (best.hold || (typeof pr0 === 'object' && pr0?.hold)) {
      // las compras que se mantienen arrancan de cero; reconstruir es casi al toque
      const need = best.holdTime ?? 0.55;
      if (input.key('KeyF')) {
        this.holdT += dt;
        g.hud.setHold(best.holdTime ? Math.min(1, this.holdT / need) : null);
        if (this.holdT > need) {
          this.holdT = 0;
          if (g.net?.guest) {
            g.net.requestUse(best.index);
            return;
          }
          const cost = best.cost();
          if (cost > 0) {
            if (g.points < cost) {
              g.audio.deny();
              g.hud.flashPoints();
              return;
            }
            if (best.use() !== false) {
              g.spend(cost);
              g.audio.purchase();
            }
          } else best.use();
        }
      } else {
        this.holdT = best.holdTime ? 0 : 0.45;
        g.hud.setHold(null);
      }
      return;
    }
    g.hud.setHold(null);
    if (input.hit('KeyF')) {
      const cost = best.cost();
      const pr = best.prompt();
      // de invitado, lo del mapa lo decide el anfitrión (salvo lo que es de cada uno)
      if (g.net?.guest && !best.local) {
        if (typeof pr === 'object' && pr?.info) return;
        // munición llena: no se cobra una recarga que no hace falta
        if (best.kind === 'wallbuy' && best.weapon && g.weapons.ammoFull(best.weapon)) {
          g.audio.deny();
          return;
        }
        if (cost > 0 && g.points < cost) {
          g.audio.deny();
          g.hud.flashPoints();
          return;
        }
        g.net.requestUse(best.index, best.kind === 'pap' ? { w: g.weapons.slot?.id, up: tierOf(g.weapons.slot?.up) } : {});
        return;
      }
      if (typeof pr === 'object' && pr?.noCost && cost === 0) {
        if (best.use()) g.audio.purchase();
        else g.audio.deny();
        return;
      }
      if (typeof pr === 'object' && pr?.noCost && cost !== 0) {
        g.audio.deny();
        return;
      }
      if (g.points < cost) {
        g.audio.deny();
        g.hud.flashPoints();
        return;
      }
      if (best.use() !== false) {
        g.spend(cost);
        if (cost > 0) g.audio.purchase();
      } else g.audio.deny();
    }
  }

  // Compañero en pie justo adelante: manteniendo F le convidás plata (para
  // que el que quedó corto pueda abrir una puerta o comprarse un perk).
  shareCheck(dt, input, fwd) {
    const g = this.g;
    let best = null;
    for (const r of g.net.remote.values()) {
      if (r.downed || r.dead) continue;
      const dx = r.pos.x - g.player.pos.x;
      const dz = r.pos.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 || d < 0.05) continue;
      if ((dx * fwd.x + dz * fwd.z) / d / Math.max(0.3, Math.hypot(fwd.x, fwd.z)) < 0.85) continue;
      best = r;
      break;
    }
    if (!best) {
      this.shareT = 0;
      return false;
    }
    g.hud.setHint(`Mantené [F] para convidarle ${SHARE} a ${best.name}`);
    if (!input.key('KeyF')) {
      this.shareT = 0;
      this.shareLock = false;
      g.hud.setHold(null);
      return true;
    }
    // una vez por apretada (para no vaciarte la cuenta sin querer)
    if (this.shareLock) return true;
    this.shareT = (this.shareT || 0) + dt;
    g.hud.setHold(Math.min(1, this.shareT / 0.8));
    if (this.shareT < 0.8) return true;
    this.shareT = 0;
    this.shareLock = true;
    g.hud.setHold(null);
    if (!g.spend(SHARE)) {
      g.audio.deny();
      g.hud.flashPoints();
      return true;
    }
    g.net.giftPoints(best.id, SHARE);
    g.audio.purchase();
    g.hud.subtitle(`Le convidaste ${SHARE} a ${best.name}.`, 2.5);
    return true;
  }

  // Compañero caído cerca: se lo levanta manteniendo F.
  reviveCheck(dt, input) {
    const g = this.g;
    let best = null;
    let bd = 2.4;
    for (const r of g.net.remote.values()) {
      if (!r.downed || r.dead) continue;
      const d = Math.hypot(r.pos.x - g.player.pos.x, r.pos.z - g.player.pos.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) {
      this.reviveT = 0;
      return false;
    }
    g.hud.setHint(`Mantené [F] para levantar a ${best.name}`);
    this.current = null;
    // con Rosamorte se levanta al doble de rápido (como en el original)
    const need = g.player.perks.has('revive') ? 1.75 : 3.5;
    if (input.key('KeyF')) {
      this.reviveT = (this.reviveT || 0) + dt;
      g.hud.setHold(Math.min(1, this.reviveT / need));
      if (this.reviveT >= need) {
        this.reviveT = 0;
        g.hud.setHold(null);
        g.net.net.send({ t: 'revive', id: best.id });
        g.net.credit(g.net.id, 'revives');
        best.downed = false;
        g.audio.powerupGrab();
        g.hud.subtitle(`Levantaste a ${best.name}.`, 3);
      }
    } else {
      this.reviveT = 0;
      g.hud.setHold(null);
    }
    return true;
  }

  setCurrent(it) {
    const g = this.g;
    if (!it) {
      g.hud.setHint(null);
      this.current = null;
      return;
    }
    this.current = it;
    if (it.locked) {
      g.hud.setHint(`Presioná [F] para quitar el candado del Capataz [Costo: ${LOCK_COST}]`);
      return;
    }
    const pr = it.prompt();
    if (!pr) return g.hud.setHint(null);
    if (typeof pr === 'object') {
      if (pr.noCost && !pr.hold && !pr.info && it.cost() === 0) return g.hud.setHint(`Presioná [F] para ${pr.text}`);
      if (pr.hold) return g.hud.setHint(`Mantené [F] para ${pr.text}${it.cost() > 0 ? ` [Costo: ${it.cost()}]` : ''}`);
      return g.hud.setHint(pr.text);
    }
    g.hud.setHint(`Presioná [F] para ${pr} [Costo: ${it.cost()}]`);
  }

  reset() {
    // se usa rehaciendo el juego completo; ver Game.newGame
  }
}

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
