import * as THREE from 'three';
import { DOORS, WALL_BUYS, PERK_SPOTS, POWER, PAP, BOX_SPOTS, BOX_START, MAP_ID, FEATURES } from '../config/map';
import { WEAPONS, BOX_POOL, GRENADE, BOWIE, weaponStats, tierOf, maxTier, PAP_COST, ELEM_INFO } from '../config/weapons';
import { PERKS } from '../config/perks';
import { LOCK_COST } from '../config/rules';
import { chalkTexture, perkLabel, toTexture } from '../core/textures';
import { buildMate, buildKnife, buildGrenade, getMats } from '../weapons/viewmodels';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from './props';
import { buildBoxSkin } from './BoxSkins';
import { buildPerkMachine, MACHINE } from './perkMachines';
import { cherryFx } from '../fx/cherryFx';

// Palanca de la luz: ángulo apagada (para abajo) y prendida (para arriba).
const LEVER_OFF = Math.PI - 0.6;
const LEVER_ON = 0.6;
import { DOOR_H } from './World';
import { cornMesh } from './Farm';
import { buildDrawbridge } from './castleBridge';

// ¿Sale en la caja de este mapa? (`only`: los de un mapa solo; el Challenge de
// la torre pone los de todos los mapas, menos los especiales de otro: FEATURES.boxAll)
const inBox = (w) => !w.only || w.only.includes(MAP_ID) || (!!FEATURES.boxAll && !FEATURES.boxAll.skip.includes(w.id));

// Cuánto le convidás a un compañero por apretada.
const SHARE = 500;
// La caja misteriosa: separada de la pared y con la tapa que no pasa de la
// vertical (abierta del todo se metía en la pared, sobre todo el baúl del
// castillo, que tiene la tapa de medio tambor y se queda en 1.12). Las demás
// abren un poco más, así los mates que salen no la traspasan; el mate además
// sube un poco adelantado (MODEL_FWD), lejos de la tapa.
const BOX_OFF = 0.58;
const LID_OPEN = FEATURES.castle ? 1.12 : 1.32;
const MODEL_FWD = 0.12;

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

  // Altura del piso delante de una pared (en los mapas con pisos a distintas alturas).
  // (y: la altura que trae la definición; la torre la tiene porque repite la planta en cada piso)
  floorNear(cell, face, y) {
    if (y != null) return y;
    return this.g.world.floorAt(cell[0] + 0.5 + face[0], cell[1] + 0.5 + face[1]);
  }

  // En el penal las máquinas no andan con la luz: cada una se prende con la
  // electricidad del gaucho life.
  get shockPower() {
    return !!FEATURES.vida;
  }

  machineOn(m) {
    return this.shockPower ? !!m.powered : this.g.world.power;
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
      const world = this.g.world;
      const fy = d.y ?? (world.levels ? world.fy[world.idx(d.cells[0][0], d.cells[0][1])] : 0);
      const group = new THREE.Group();
      group.position.set(cx, fy, cz);
      group.rotation.y = horizontal ? 0 : Math.PI / 2;
      const pieces = [];
      if (d.kind === 'gate') {
        // tranquera de dos hojas: travesaños, la diagonal y el poste de cada lado
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group();
          hinge.position.set((s * width) / 2, 0, 0);
          const w = width / 2 - 0.04;
          for (const y of [0.25, 0.65, 1.05, 1.42]) hinge.add(mesh(boxGeo(w, 0.09, 0.05), M.fence || M.wood, (-s * w) / 2, y, 0));
          for (const x of [0.06, w - 0.06]) hinge.add(mesh(boxGeo(0.08, 1.35, 0.06), M.fenceDark || M.woodDark, -s * x, 0.82, 0));
          hinge.add(mesh(boxGeo(0.07, Math.hypot(w, 1.1), 0.05), M.fence || M.wood, (-s * w) / 2, 0.84, 0.01, 0, 0, s * Math.atan2(w, 1.1)));
          // (una malla por material: eran 7 piezas por hoja, una llamada de dibujo cada una)
          mergeByMaterial(hinge);
          group.add(hinge);
          group.add(mesh(boxGeo(0.16, 1.6, 0.16), M.fenceDark || M.woodDark, (s * width) / 2, 0.8, 0));
          pieces.push({ obj: hinge, side: s });
        }
      } else if (d.kind === 'corn') {
        // una pared de maíz: se abre cuando el easter egg lo pide
        const pts = [];
        for (let k = 0; k < 14; k++) pts.push([(Math.random() - 0.5) * width, (Math.random() - 0.5) * 0.9, 0.95 + Math.random() * 0.2]);
        const corn = cornMesh(this.g.world, pts);
        group.add(corn);
        pieces.push({ obj: corn, vel: new THREE.Vector3(0, -1.2, 0), spin: new THREE.Vector3(0, 0, 0) });
      } else if (FEATURES.castle && (d.kind === 'door' || d.kind === 'reja')) {
        // el castillo: arco de piedra con dovelas y hojas de tablones con
        // herrajes que abren hacia la segunda zona, pegadas a la cara de la
        // pared (no atraviesan el vano); la reja es un rastrillo que sube
        const zOf = (x, z) => (world.inside(x, z) ? world.zoneKeys[world.zone[world.idx(x, z)]] : null);
        const [c0x, c0z] = d.cells[0];
        const side = horizontal ? (zOf(c0x, c0z + 1) === d.zones[1] ? 1 : -1) : zOf(c0x + 1, c0z) === d.zones[1] ? 1 : -1;
        castleDoor(M, group, pieces, width, side, d.kind === 'reja');
      } else if (d.kind === 'reja' || d.kind === 'vida') {
        // reja de hierro que corre para un costado (la de gaucho life tiene una cerradura que chisporrotea)
        const slide = new THREE.Group();
        const bars = M.bars || M.iron;
        const nb = Math.round(width / 0.16);
        for (let k = 0; k <= nb; k++) slide.add(mesh(boxGeo(0.035, DOOR_H - 0.08, 0.035), bars, -width / 2 + (k * width) / nb, DOOR_H / 2, 0));
        for (const y of [0.18, 1.3, DOOR_H - 0.12]) slide.add(mesh(boxGeo(width, 0.07, 0.06), bars, 0, y, 0));
        if (d.kind === 'vida') {
          const lock = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.14), new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0x3ab0ff, emissiveIntensity: 1.4, roughness: 0.4 }));
          lock.position.set(0, 1.3, 0.06);
          slide.add(lock);
          d.lockGlow = lock;
        }
        group.add(slide);
        pieces.push({ obj: slide, side: 1, slide: width });
      } else if (d.kind === 'cerro') {
        // el portón de la capilla al cerro: madera vieja, cintas coloradas y un candado enorme
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group();
          hinge.position.set((s * width) / 2, 0, 0);
          hinge.add(mesh(boxGeo(width / 2 - 0.02, DOOR_H - 0.05, 0.12), M.woodDark, (-s * width) / 4, DOOR_H / 2, 0));
          for (const y of [0.4, 1.35, 2.3]) hinge.add(mesh(boxGeo(width / 2 - 0.08, 0.1, 0.15), M.iron, (-s * width) / 4, y, 0));
          for (let k = 0; k < 3; k++) hinge.add(mesh(boxGeo(0.06, 0.5, 0.01), M.redCloth || M.redPaint, -s * (0.15 + k * 0.25), 1.8 - k * 0.1, 0.08, 0, 0, (k - 1) * 0.3));
          group.add(hinge);
          pieces.push({ obj: hinge, side: s });
        }
        const padlock = mesh(boxGeo(0.22, 0.26, 0.1), M.brass, 0, 1.25, 0.1);
        group.add(padlock);
        pieces.push({ obj: padlock, drop: true });
      } else if (d.kind === 'hielo') {
        // una pared de hielo de mil inviernos (el castillo: se derrite con el
        // easter egg): bloques con vetas y grietas y, del otro lado, dos ojos
        // tibios que respiran despacio (el dragón duerme en la cueva)
        const ice = new THREE.Group();
        const W = width + 0.3;
        const H = DOOR_H + 0.4;
        const tex = iceWallTex();
        const mat = new THREE.MeshStandardMaterial({ color: 0x9fd0ee, map: tex, roughness: 0.06, metalness: 0.1, emissive: 0x1a4a70, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 });
        const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.08, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, transparent: true, opacity: 0.94 });
        ice.add(mesh(boxGeo(W, H, 0.6), [mat, mat, mat, mat, face, face], 0, H / 2, 0));
        // los bloques que sobresalen, por los bordes (el medio queda limpio para los ojos)
        const r = mulberry(i * 37 + 5);
        for (let k = 0; k < 8; k++) {
          const bw = 0.35 + r() * 0.4;
          const bh = 0.5 + r() * 1.1;
          const side = k % 4;
          const bx = side < 2 ? (side ? 1 : -1) * (W / 2 - bw / 2 - r() * 0.1) : (r() - 0.5) * (W - bw);
          const by = side === 2 ? bh / 2 : side === 3 ? H - bh / 2 : bh / 2 + r() * (H - bh);
          const bz = (k < 4 ? 1 : -1) * (0.27 + r() * 0.1);
          ice.add(mesh(boxGeo(bw, bh, 0.26), mat, bx, by, bz, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5, (r() - 0.5) * 0.35));
        }
        for (let k = 0; k < 9; k++) ice.add(mesh(new THREE.ConeGeometry(0.12 + (k % 3) * 0.08, 0.5 + (k % 4) * 0.3, 5), mat, -width / 2 + (k / 8) * width, 0.2, 0.45 + (k % 2) * 0.1, 0.3, k, 0.2));
        // los ojos: dos brillos que asoman por las dos caras del hielo
        const eyeMat = new THREE.MeshBasicMaterial({ map: eyeGlowTex(), color: 0xff8a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        for (const sz of [-1, 1]) {
          for (const sx of [-1, 1]) {
            const e = mesh(new THREE.PlaneGeometry(0.5, 0.3), eyeMat, sx * 0.34, 1.9, sz * 0.32);
            e.rotation.z = sx * 0.2;
            e.renderOrder = 6;
            ice.add(e);
          }
        }
        // respira (y cada tanto parpadea)
        ice.children[0].onBeforeRender = () => {
          const t = performance.now() / 1000;
          eyeMat.opacity = Math.sin(t * 1.3) > 0.985 ? 0.05 : 0.45 + Math.sin(t * 0.9) * 0.2;
        };
        group.add(ice);
        pieces.push({ obj: ice, melt: true });
      } else if (d.kind === 'puente') {
        // el puente levadizo de la barbacana (lo baja el torno del Pack-a-Pava)
        buildDrawbridge(this.g, M, group, pieces, width);
      } else if (d.kind === 'door') {
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
        pos: new THREE.Vector3(cx, fy + 1.2, cz),
        radius: 2.6,
        wide: true,
        prompt: () => {
          if (door.open || d.locked) return null;
          if (d.kind === 'vida') return { text: 'Cerradura eléctrica: se abre con la electricidad del gaucho life', noCost: true, info: true };
          return `abrir ${d.kind === 'debris' ? 'los escombros' : d.kind === 'gate' ? 'la tranquera' : d.kind === 'reja' ? 'la reja' : 'la puerta'}`;
        },
        cost: () => this.doorCost(d),
        use: () => (d.locked || d.kind === 'vida' ? false : this.openDoor(door)),
      });
    });
  }

  // Precio de una puerta según cuántos juegan: con más de dos sale un poco
  // más (+10% por cada uno de más). Las que traen `perPlayer` (las escaleras
  // de la torre) suben eso por cada jugador que no sea el primero.
  doorCost(d) {
    if (!d.cost) return 0;
    const n = this.g.net ? this.g.net.net.count : 1;
    const k = d.perPlayer != null ? 1 + d.perPlayer * (n - 1) : 1 + 0.1 * Math.max(0, n - 2);
    return Math.round((d.cost * k) / 50) * 50;
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
      const k = Math.min(1, (t - start) / (door.def.kind === 'debris' ? 1.3 : door.def.kind === 'hielo' ? 2.6 : door.def.kind === 'puente' ? 1.5 : 0.9));
      for (const p of door.pieces) {
        // (las hojas y el rastrillo del castillo)
        if (p.swing != null) {
          p.obj.rotation.y = p.swing * easeOut(k);
          continue;
        }
        if (p.lift != null) {
          p.obj.position.y = p.lift * easeOut(k);
          continue;
        }
        if (p.drop) {
          p.obj.position.y = 1.25 - easeOut(k) * 1.2;
          p.obj.visible = k < 1;
        } else if (p.slide) p.obj.position.x = p.slide * 0.96 * easeOut(k);
        else if (door.def.kind === 'door' || door.def.kind === 'gate' || door.def.kind === 'cerro') p.obj.rotation.y = p.side * -1.75 * easeOut(k);
        else if (door.def.kind === 'corn') {
          // el maíz se agacha y se abre para los costados
          p.obj.scale.set(1 + k * 0.6, Math.max(0.02, 1 - easeOut(k)), 1);
        }
        else if (p.melt) {
          // el hielo se derrite de arriba para abajo
          p.obj.scale.set(1 - k * 0.2, Math.max(0.02, 1 - easeOut(k)), 1 - k * 0.3);
          p.obj.visible = k < 1;
        } else if (p.fall) {
          // el puente levadizo cae de golpe (castleBridge)
          p.fall(k);
        } else if (door.def.kind === 'debris') {
          const tt = t - start;
          p.obj.position.addScaledVector(p.vel, dt);
          p.vel.y -= 9 * dt;
          p.obj.rotation.x += p.spin.x * dt;
          p.obj.rotation.y += p.spin.y * dt;
          p.obj.scale.setScalar(Math.max(0.001, 1 - tt / 1.3));
        }
      }
      if ((door.def.kind === 'debris' || door.def.kind === 'corn') && k >= 1) door.group.visible = false;
      return k < 1;
    });
    g.fx.dust(door.group.position.clone().setY(door.group.position.y + 1), UP, [0.45, 0.4, 0.35], 16);
    if (door.def.lockGlow) door.def.lockGlow.material.emissiveIntensity = 0;
  }

  // ---------------- dibujos de tiza ----------------
  buildWallBuys() {
    for (const wb of WALL_BUYS) {
      const isNade = wb.weapon === 'granadas';
      const isBowie = wb.weapon === 'bowie';
      const cost = isNade ? GRENADE.wall : isBowie ? BOWIE.cost : WEAPONS[wb.weapon].wall;
      const w = isNade ? { name: 'Bombas de yerba', chalk: 'bomb' } : isBowie ? { name: BOWIE.name, chalk: 'knife' } : WEAPONS[wb.weapon];
      const a = this.anchor(wb.cell, wb.face, 0.01);
      // (slide: corrido a lo largo de la pared, en metros, hacia +x o +z; como las perks)
      if (wb.slide) {
        if (wb.face[0]) a.z += wb.slide;
        else a.x += wb.slide;
      }
      const fy = this.floorNear(wb.cell, wb.face, wb.y);
      const wallWeapon = isNade || isBowie ? null : wb.weapon;
      const tex = chalkTexture(w, cost);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
      plane.position.set(a.x, fy + 1.55, a.z);
      plane.rotation.y = a.rot;
      this.root.add(plane);
      const g = this.g;
      // la primera compra deja el mate (o el facón) "colgado" sobre el dibujo;
      // se arma desde ya, escondido, para que sus shaders se compilen en la
      // carga (armarlo al comprar trababa el juego)
      const shown = isNade ? null : isBowie ? buildKnife(g.textures, 'plata') : buildMate(wb.weapon, false, g.textures).root;
      if (shown) {
        shown.scale.setScalar(isBowie ? 3 : 3.2);
        shown.position.set(a.x + wb.face[0] * 0.12, fy + 1.55, a.z + wb.face[1] * 0.12);
        shown.rotation.set(0, a.rot + Math.PI / 2, isBowie ? -1.1 : 0.2);
        shown.visible = false;
        this.root.add(shown);
      }
      const show = () => {
        if (shown) shown.visible = true;
      };
      this.add({
        kind: 'wallbuy',
        weapon: wallWeapon,
        isNade,
        bowie: isBowie,
        show,
        pos: new THREE.Vector3(a.x, fy + 1.5, a.z),
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
      // (out: más despegada de la pared, para quedar delante de un zócalo)
      const a = this.anchor(spot.cell, spot.face, D / 2 + 0.02 + (spot.out || 0));
      // (slide: corrida a lo largo de la pared, en metros, hacia +x o +z; para
      // despegarla de una esquina sin cambiarla de celda)
      if (spot.slide) {
        if (spot.face[0]) a.z += spot.slide;
        else a.x += spot.slide;
      }
      const fy = this.floorNear(spot.cell, spot.face, spot.y);
      const group = new THREE.Group();
      group.position.set(a.x, fy, a.z);
      group.rotation.y = a.rot;
      // la máquina: cada perk con su forma (world/perkMachines.js), todas con
      // el paquete de yerba al frente y en la misma caja de siempre
      const built = buildPerkMachine(spot.perk, perk, perkLabel(perk));
      group.add(built.group);
      const { sign, bulbs, front } = built;
      const { W, H } = MACHINE;
      this.root.add(group);
      const cellFront = new THREE.Vector3(a.x + spot.face[0] * (D / 2 + 0.8), fy, a.z + spot.face[1] * (D / 2 + 0.8));
      const [bx, bz] = [a.x, a.z];
      const half = spot.face[0] !== 0 ? [D / 2, W / 2] : [W / 2, D / 2];
      g.world.addBox([bx - half[0], fy, bz - half[1], bx + half[0], fy + H + 0.3, bz + half[1]], { kind: 'machine' });
      const machine = { perk: spot.perk, group, sign, bulbs, front, anim: built.anim, gone: false, powered: false, jingleT: 20 + Math.random() * 40 };
      // (Electric Cherry: sus rayos se arman ya, así el shader se compila en la carga)
      if (spot.perk === 'cherry') cherryFx(g);
      this.perkMachines.push(machine);
      const it = this.add({
        kind: 'perk',
        lockable: true,
        floorY: fy,
        pos: new THREE.Vector3(a.x, fy + 1.2, a.z),
        front: cellFront,
        radius: 2.1,
        machine,
        prompt: () => {
          if (machine.gone) return null;
          if (g.player.perks.has(spot.perk)) return null;
          if (this.shockPower && !machine.powered) return { text: 'La máquina no tiene corriente: dale electricidad desde el gaucho life', noCost: true, info: true };
          if (!this.shockPower && !g.world.power && spot.perk !== 'revive') return { text: 'Primero hay que encender la luz', noCost: true };
          return `tomar ${perk.name}`;
        },
        // Rosamorte sale barato solo cuando jugás solo (como en el original)
        cost: () => (spot.perk === 'revive' && !g.net?.remote.size ? perk.soloCost : perk.cost),
        use: () => {
          if (this.shockPower ? !machine.powered : !g.world.power && spot.perk !== 'revive') return false;
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
                g.fx.explosion(machine.group.position.clone().setY(machine.group.position.y + 1), 1.5, [0.5, 0.8, 1]);
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
    const fy = this.floorNear(POWER.cell, POWER.face, POWER.y);
    const group = new THREE.Group();
    group.position.set(a.x, fy, a.z);
    group.rotation.y = a.rot;
    group.add(mesh(boxGeo(0.9, 1.2, 0.2), this.M.metalGreen, 0, 1.5, 0));
    group.add(mesh(boxGeo(0.7, 0.2, 0.05), this.M.black, 0, 2.2, 0.1));
    const lever = new THREE.Group();
    lever.position.set(0, 1.45, 0.14);
    lever.add(mesh(cylGeo(0.025, 0.025, 0.55, 8), this.M.iron, 0, 0.27, 0));
    lever.add(mesh(cylGeo(0.05, 0.05, 0.14, 10), this.M.redPaint, 0, 0.56, 0, 0, 0, Math.PI / 2));
    // apagada: para abajo; al prenderla sube por adelante (nunca hacia la pared)
    lever.rotation.x = LEVER_OFF;
    group.add(lever);
    // cables que suben al techo
    for (const x of [-0.3, 0, 0.3]) group.add(mesh(cylGeo(0.03, 0.03, 1.6, 6), this.M.black, x, 2.9, -0.02));
    // (al aire libre, sin pared atrás: va clavada en un poste con su cruceta
    // y los cables llegan hasta los aisladores)
    if (POWER.post) {
      const wood = this.M.woodDark || this.M.wood;
      const post = new THREE.Group();
      post.add(mesh(boxGeo(0.24, 4.1, 0.24), wood, 0, 2.05, -0.23));
      post.add(mesh(boxGeo(1.3, 0.14, 0.14), wood, 0, 3.72, -0.23));
      post.add(mesh(boxGeo(0.07, 0.8, 0.07), wood, 0.34, 3.32, -0.23, 0, 0, 0.9));
      for (const x of [-0.3, 0, 0.3]) post.add(mesh(cylGeo(0.045, 0.06, 0.12, 8), this.M.candle, x, 3.85, -0.02));
      for (const y of [1.0, 1.95]) post.add(mesh(boxGeo(0.34, 0.05, 0.3), this.M.iron, 0, y, -0.2));
      mergeByMaterial(post);
      group.add(post);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 }));
    lamp.position.set(0.32, 1.95, 0.12);
    group.add(lamp);
    this.root.add(group);
    this.powerLever = { lever, lamp };
    this.add({
      kind: 'power',
      pos: new THREE.Vector3(a.x, fy + 1.5, a.z),
      radius: 1.8,
      prompt: () => (g.world.power ? null : { text: 'encender la luz', noCost: true }),
      cost: () => 0,
      use: () => {
        if (g.world.power) return false;
        const start = g.time;
        this.animations.push((t) => {
          const k = Math.min(1, (t - start) / 0.5);
          lever.rotation.x = LEVER_OFF + (LEVER_ON - LEVER_OFF) * k;
          return k < 1;
        });
        lamp.material.emissive.set(0x20ff40);
        this.powerLever.moving = true;
        g.turnOnPower();
        return true;
      },
    });
  }

  setPowerVisuals(on) {
    // (a los invitados la luz se les prende sin tocar la palanca)
    const pl = this.powerLever?.lever;
    if (on && pl && !this.powerLever.moving) pl.rotation.x = LEVER_ON;
    for (const m of this.perkMachines) {
      const lit = this.shockPower ? m.powered : on;
      m.sign.material.emissiveIntensity = lit ? 2.2 : m.perk === 'revive' && !this.shockPower ? 1.2 : 0.1;
      m.front.emissiveIntensity = lit ? 0.35 : 0.05;
    }
    if (this.pap) this.pap.glow.material.emissiveIntensity = (this.shockPower ? this.pap.powered : on) ? 2.5 : 0;
  }

  // Una máquina recibió la electricidad del gaucho life (lo decide el anfitrión).
  powerMachine(m, remote = false) {
    if (m.powered) return false;
    m.powered = true;
    const g = this.g;
    if (!remote) g.net?.event('shockm', { p: m.perk || 'pap' });
    this.setPowerVisuals(g.world.power);
    const at = m.group.position.clone().setY(m.group.position.y + 1.6);
    g.fx.electric?.(at, 18);
    g.audio.powerOn?.(at);
    return true;
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
    const fy = this.floorNear(PAP.cell, PAP.face, PAP.y);
    const group = new THREE.Group();
    group.position.set(px, fy, pz);
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
    g.world.addBox([px - half[0], fy, pz - half[1], px + half[0], fy + 2.4, pz + half[1]], { kind: 'machine' });
    const front = new THREE.Vector3(px + PAP.face[0] * 1.5, fy, pz + PAP.face[1] * 1.5);
    const pap = { group, glow, state: 'idle', t: 0, entry: null, model: null, kettle, spoutTip: new THREE.Vector3(), powered: false };
    this.pap = pap;
    const slotPos = new THREE.Vector3(px + PAP.face[0] * (D / 2 + 0.25), fy + 0.85, pz + PAP.face[1] * (D / 2 + 0.25));
    pap.slotPos = slotPos;
    pap.face = new THREE.Vector3(PAP.face[0], 0, PAP.face[1]);
    this.add({
      kind: 'pap',
      lockable: true,
      floorY: fy,
      pos: new THREE.Vector3(px, fy + 1.2, pz),
      front,
      radius: 2.4,
      prompt: () => {
        // mientras no esté preparada habla el paso previo (world/PapQuest.js)
        if (g.papq && !g.papq.done) return null;
        if (!this.machineOn(pap)) return { text: this.shockPower ? 'El Pack-a-Pava no tiene corriente' : 'El Pack-a-Pava necesita luz', noCost: true };
        if (pap.state === 'working' || pap.entry?.remote !== undefined) return null;
        if (pap.state === 'ready') return { text: `agarrar ${weaponStats(pap.entry.id, pap.tier).name}`, noCost: true };
        const s = g.weapons.slot;
        // (los mates de la luz del castillo se templan en su altar, no acá)
        if (!s || !WEAPONS[s.id].pap || WEAPONS[s.id].altar) return null;
        // el Mate de la Luz Mala: primero hay que cargarlo pegándole a la Luz Mala
        if (WEAPONS[s.id].papLuz && !s.up && !s.lit) return { text: 'El Mate de la Luz Mala no agarra la mejora: cuando aparezca la Luz Mala (la luz verde que anda suelta), dispárale con él para que brille', noCost: true, info: true };
        // la hoz: la primera vez es con ritual; después se convierte gratis
        if (s.id === 'hoz' && !s.up) {
          if (pap.ritual) return null;
          // antes de la forja la hoja tiene que tomar sangre (entities/FarmEgg.js)
          const wait = !g.ee?.papDone && g.ee?.hozWait?.();
          if (wait) return { text: wait, noCost: true, info: true };
          const miss = !g.ee?.papDone && g.ee?.papMissing?.();
          if (miss) return { text: miss, noCost: true, info: true };
          return { text: g.ee?.papDone ? 'convertir tu hoz en la Hoz de la Muerte' : 'poner la hoz en el Pack-a-Pava (ritual)', noCost: true };
        }
        const tier = tierOf(s.up);
        if (tier >= maxTier(s.id)) return { text: tier >= 2 ? 'Ese mate ya tiene las dos mejoras' : 'Ese mate ya está mejorado', noCost: true };
        const what = tier ? `segunda mejora de ${weaponStats(s.id, 1).name}: ${ELEM_INFO[WEAPONS[s.id].pap.elem].desc}` : `mejorar ${WEAPONS[s.id].name}`;
        if (g.activities?.freePap) return { text: `${what} gratis (regalo de las ánimas)`, noCost: true };
        return what;
      },
      cost: () => {
        if (pap.state === 'ready' || g.activities?.freePap) return 0;
        const s = g.weapons.slot;
        if (s?.id === 'hoz') return 0;
        return PAP_COST[Math.min(1, s ? tierOf(s.up) : 0)];
      },
      use: () => {
        if (g.papq && !g.papq.done) return false;
        if (!this.machineOn(pap)) return false;
        if (pap.entry?.remote !== undefined) return false;
        if (pap.state === 'ready') {
          g.weapons.give(pap.entry.id, pap.tier);
          this.clearPap();
          return true;
        }
        if (pap.state !== 'idle') return false;
        const s = g.weapons.slot;
        if (!s || s.temp || tierOf(s.up) >= maxTier(s.id) || WEAPONS[s.id].altar) return false;
        if (WEAPONS[s.id].papLuz && !s.up && !s.lit) return false;
        // el ritual de la hoz es un encierro: sin todos ahí no arranca
        if (s.id === 'hoz' && !g.ee?.papDone && (g.ee?.hozWait?.() || g.ee?.papMissing?.())) return false;
        pap.tier = tierOf(s.up) + 1;
        // la hoz entra al ritual: la máquina la tiene hasta que termine
        pap.ritual = s.id === 'hoz' && !g.ee?.papDone;
        pap.entry = g.weapons.take();
        if (pap.ritual) {
          g.ee.startPapRitual(g.net?.id ?? 0);
          g.net?.event('pap', { s: 'working', w: 'hoz', up: 1 });
        }
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
      // durante el ritual la máquina no suelta la hoz
      if (pap.ritual) {
        if (g.ee?.papDone) pap.ritual = false;
        else pap.t = Math.min(pap.t, 3);
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
    // cada mapa tiene su cajón (world/BoxSkins.js): mismas medidas, otra pinta y otra luz
    const skin = buildBoxSkin(g, M, MAP_ID);
    const { group, lid, inner, qMat } = skin;
    // haz de luz que marca dónde está la caja: fuerte arriba y se va disipando
    // al bajar hacia ella (así no parece que atraviesa el techo y se la choca)
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.6, 40, 16, 24, true);
    const bp = beamGeo.attributes.position;
    const bc = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const h = bp.getY(i) + 20;
      bc[i * 3] = bc[i * 3 + 1] = bc[i * 3 + 2] = Math.min(1, Math.max(0, (h - 1.5) / 12.5)) ** 2 * Math.min(1, (40 - h) / 6);
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: skin.beam, vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
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
      glow: skin.glow,
      glowHex: skin.glowHex,
      glowMats: skin.glowMats,
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
    // los mates que pueden salir, armados desde ya (escondidos) para que sus
    // shaders se compilen en la carga y la caja no trabe al girar
    for (const w of BOX_POOL) {
      if (!inBox(w)) continue;
      const m = this.boxModel(w.id);
      m.visible = false;
      this.root.add(m);
    }
    this.buildSaleBoxes();
  }

  // Liquidación: una caja en cada lugar posible mientras dura. Son copias
  // (misma malla y materiales); al usar una, la caja de verdad se muda ahí y
  // se abre. Cuando termina, la caja vuelve a donde estaba antes.
  buildSaleBoxes() {
    const g = this.g;
    const box = this.box;
    this.saleHome = null;
    this.saleBoxes = BOX_SPOTS.map((spot, i) => {
      const a = this.anchor(spot.cell, spot.face, BOX_OFF);
      const lat = spot.face[1] !== 0 ? [0.5, 0] : [0, 0.5];
      const x = a.x + lat[0];
      const z = a.z + lat[1];
      const fy = this.floorNear(spot.cell, spot.face, spot.y);
      const group = box.group.clone();
      group.position.set(x, fy, z);
      group.rotation.set(0, a.rot, 0);
      group.visible = false;
      const beam = box.beam.clone();
      beam.position.set(x, fy + 20, z);
      beam.visible = false;
      this.root.add(group, beam);
      const half = spot.face[0] !== 0 ? [0.4, 0.85] : [0.85, 0.4];
      const collider = g.world.addBox([x - half[0], fy, z - half[1], x + half[0], fy + 0.6, z + half[1]], { kind: 'box' });
      collider.active = false;
      const sale = { i, group, beam, collider };
      this.add({
        kind: 'salebox',
        pos: new THREE.Vector3(x, fy + 0.8, z),
        front: new THREE.Vector3(x + spot.face[0] * 1.3, fy, z + spot.face[1] * 1.3),
        floorY: fy,
        radius: 2.1,
        prompt: () => (group.visible && box.state === 'closed' ? 'abrir la Caja Misteriosa' : null),
        cost: () => 10,
        use: () => {
          if (!group.visible || box.state !== 'closed' || box.spot === i) return false;
          this.placeBox(i);
          return this.openBox();
        },
      });
      return sale;
    });
  }

  updateSaleBoxes() {
    const g = this.g;
    const box = this.box;
    const sale = g.powerups.active.firesale > 0;
    if (sale && this.saleHome == null) this.saleHome = box.spot;
    // terminó: la caja vuelve a su lugar (cuando nadie la está usando)
    if (!sale && this.saleHome != null && box.state === 'closed') {
      if (!g.net?.guest && box.spot !== this.saleHome) {
        this.placeBox(this.saleHome);
        g.net?.event('box', { spot: this.saleHome });
      }
      this.saleHome = null;
    }
    for (const s of this.saleBoxes) {
      const on = sale && s.i !== box.spot;
      if (s.group.visible === on) continue;
      s.group.visible = on;
      s.beam.visible = on;
      s.collider.active = on;
      if (on) g.fx.flash(s.group.position, box.glowHex, 20, 0.4, 8);
    }
  }

  placeBox(i) {
    const box = this.box;
    const spot = BOX_SPOTS[i];
    box.spot = i;
    const a = this.anchor(spot.cell, spot.face, BOX_OFF);
    const lat = spot.face[1] !== 0 ? [0.5, 0] : [0, 0.5];
    const x = a.x + lat[0];
    const z = a.z + lat[1];
    const fy = this.floorNear(spot.cell, spot.face, spot.y);
    box.group.position.set(x, fy, z);
    box.group.rotation.y = a.rot;
    box.beam.position.set(x, fy + 20, z);
    box.center = new THREE.Vector3(x, fy, z);
    box.face = new THREE.Vector3(spot.face[0], 0, spot.face[1]);
    if (this.boxIt) {
      this.boxIt.pos.set(x, fy + 0.8, z);
      this.boxIt.front.set(x + spot.face[0] * 1.3, fy, z + spot.face[1] * 1.3);
      this.boxIt.floorY = fy;
    }
    if (box.collider) box.collider.active = false;
    const half = spot.face[0] !== 0 ? [0.4, 0.85] : [0.85, 0.4];
    box.collider = this.g.world.addBox([x - half[0], fy, z - half[1], x + half[0], fy + 0.6, z + half[1]], { kind: 'box' });
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
    if (weaponId === 'hoz' && !g.ee?.papDone && g.ee?.hozWait?.()) return false;
    pap.entry = { id: weaponId, up: tier - 1, remote: playerId };
    pap.tier = tier;
    pap.ritual = weaponId === 'hoz' && !g.ee?.papDone;
    // la hoz de un invitado: arranca el ritual (lo lleva el anfitrión)
    if (pap.ritual && playerId >= 0 && !g.net?.guest) g.ee.startPapRitual(playerId);
    pap.state = 'working';
    pap.t = 0;
    pap.model = buildMate(weaponId, tier - 1, g.textures).root;
    pap.model.scale.setScalar(2.4);
    pap.model.position.copy(pap.slotPos);
    pap.model.rotation.y = this.anchor(PAP.cell, PAP.face).rot + Math.PI / 2;
    this.root.add(pap.model);
    g.audio.pap(pap.slotPos);
    g.net?.event('pap', { s: 'working', w: weaponId, up: tier });
    return pap.ritual ? 'ritual' : true;
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
    const pool = BOX_POOL.filter((w) => inBox(w) && !g.weapons.has(w.id) && !(w.id === 'pava' && g.weapons.tactical?.id === 'pava') && !(w.id === 'gut' && g.weapons.has('gutacida')));
    // el easter egg puede pedir más de algún mate (el Tronador para el barbacuá)
    const weight = (w) => w.weight * (g.ee?.boxBoost?.(w.id) || 1);
    let total = pool.reduce((s, w) => s + weight(w), 0);
    let r = Math.random() * total;
    box.offer = pool[pool.length - 1].id;
    for (const w of pool) {
      r -= weight(w);
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
      // (la pava no es un mate: se muestra la pava de verdad)
      m = id === 'pava' ? buildGrenade(this.g.textures, 'pava') : buildMate(id, false, this.g.textures).root;
      m.scale.setScalar(2.6);
      box.models.set(id, m);
    }
    return m;
  }

  updateBox(dt) {
    const g = this.g;
    const box = this.box;
    box.t += dt;
    this.updateSaleBoxes();
    const lidOpen = (k) => {
      box.lid.rotation.x = -LID_OPEN * k;
      box.inner.material.opacity = k * 0.8;
    };
    box.beam.material.opacity = 0.15 + Math.sin(g.time * 2) * 0.04;
    const pulse = 1.2 + Math.sin(g.time * 3) * 0.4;
    for (const m of box.glowMats) m.color.copy(box.glow).multiplyScalar(pulse);
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
            box.model.position.copy(box.center).add(new THREE.Vector3(0, 0.5 + k * 0.5, MODEL_FWD).applyQuaternion(box.group.quaternion).setY(0.5 + k * 0.5));
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
          if (Math.random() < 0.4) g.fx.sparkle(box.group.position, [box.glow.r, box.glow.g, box.glow.b], 3, 1);
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
          g.fx.flash(box.center, box.glowHex, 40, 0.5, 12);
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
    box.model.visible = true;
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
        pos: new THREE.Vector3(w.int.x + w.out.x * 0.6, (w.int.y || 0) + 1.2, w.int.z + w.out.z * 0.6),
        radius: 1.9,
        window: w,
        // (en la defensa del yerbal las tranqueras de los tablones no se pueden clavar)
        prompt: () => (g.barriers.count(w.i) < 6 && !g.barriers.locked?.has(w.i) ? { text: 'reconstruir la barrera', hold: true, noCost: true } : null),
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
    chain.position.copy(it.pos).setY(it.floorY || 0);
    const toFront = new THREE.Vector3().subVectors(it.front, it.pos).setY(0).normalize();
    chain.position.addScaledVector(toFront, 0.62);
    chain.rotation.y = Math.atan2(toFront.x, toFront.z);
    this.root.add(chain);
    it.lockMesh = chain;
    const alc = g.zombies.boss?.kind === 'alcaide';
    g.hud.subtitle(alc ? 'El Alcaide clausuró una máquina.' : 'El Capataz clausuró una máquina.', 2.5, 'boss');
    if (alc) {
      if (Math.random() < 0.6) g.say('alcaide', Math.random() < 0.5 ? 'Clausurado por orden del señor alcaide. Andá a quejarte al Cabildo.' : 'Esto queda precintado. Acá los gauchos no se sirven solos.');
    } else if (Math.random() < 0.6) g.say('capataz', Math.random() < 0.5 ? 'Clausurado. Por vago.' : 'Esta máquina queda cerrada hasta nuevo aviso.');
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
      const on = this.shockPower ? m.powered : g.world.power || m.perk === 'revive';
      if (m.jingleT <= 0 && d < 9 && on) {
        m.jingleT = 45 + Math.random() * 60;
        g.audio.perkJingle(m.perk, m.group.position.clone().setY(m.group.position.y + 2));
      }
      m.bulbs.forEach((b, k) => {
        b.material.emissiveIntensity = on ? (Math.floor(g.time * 4 + k) % 3 === 0 ? 3 : 0.6) : 0;
      });
      // lo que se mueve (la hélice, la sirena, el corazón...): solo de cerca
      if (m.anim && d < 22) m.anim(g.time, dt, on);
    }

    // tomando un perk no se toca nada hasta terminar (si no, el mate queda en la pantalla)
    if (!g.player.alive || g.player.downed || g.weapons.state === 'drink') {
      this.setCurrent(null);
      this.holdT = 0;
      g.hud.setHold(null);
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
      if (g.world.levels && Math.abs(it.pos.y - g.player.pos.y - 1.1) > 2.2) continue;
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

// La puerta del castillo, en el espacio de la puerta (x a lo ancho, z
// atraviesa la pared de 1 m, y desde el piso). side: hacia dónde abre (+z o -z).
// Arco rebajado si el vano es ancho; el tímpano de piedra rellena las esquinas.
function castleDoor(M, group, pieces, W, side, reja) {
  const H = DOOR_H;
  const rise = Math.min(W / 2, 0.85);
  const R = (rise * rise + (W / 2) * (W / 2)) / (2 * rise);
  const cy = H - R;
  const archY = (x) => cy + Math.sqrt(Math.max(0, R * R - x * x));
  const ys = archY(W / 2);
  const a0 = Math.asin(Math.min(1, W / 2 / R));
  const stone = M.stoneStep || M.castleStone;
  const frame = new THREE.Group();
  // el tímpano: rectángulo menos el arco, macizo de cara a cara
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, ys);
  sh.lineTo(-W / 2, H + 0.02);
  sh.lineTo(W / 2, H + 0.02);
  sh.lineTo(W / 2, ys);
  sh.absarc(0, cy, R, Math.PI / 2 - a0, Math.PI / 2 + a0, false);
  const tym = new THREE.ExtrudeGeometry(sh, { depth: 0.98, bevelEnabled: false, curveSegments: 16 });
  tym.translate(0, 0, -0.49);
  frame.add(mesh(tym, stone));
  // las dovelas en las dos caras (y la clave más grande), y las jambas
  const n = W > 2.5 ? 11 : 9;
  for (const fz of [-1, 1]) {
    const z = fz * 0.53;
    for (let k = 0; k < n; k++) {
      const a = Math.PI / 2 + a0 - ((k + 0.5) / n) * 2 * a0;
      const key = k === (n - 1) / 2;
      const rr = R + (key ? 0.2 : 0.16);
      const v = mesh(boxGeo(((2 * a0 * R) / n) * 0.93, key ? 0.52 : 0.36, 0.1), stone, Math.cos(a) * rr, cy + Math.sin(a) * rr, z);
      v.rotation.z = a - Math.PI / 2;
      frame.add(v);
    }
    for (const sx of [-1, 1]) {
      frame.add(mesh(boxGeo(0.3, ys + 0.02, 0.1), stone, sx * (W / 2 + 0.15), (ys + 0.02) / 2, z));
      // la imposta (donde arranca el arco)
      frame.add(mesh(boxGeo(0.4, 0.1, 0.16), stone, sx * (W / 2 + 0.15), ys, z));
      // el guardacantón de abajo
      frame.add(mesh(boxGeo(0.36, 0.3, 0.14), stone, sx * (W / 2 + 0.15), 0.15, z));
    }
  }
  mergeByMaterial(frame);
  group.add(frame);
  if (reja) {
    // el rastrillo: barrotes cuadrados, travesaños y puntas abajo; sube adentro de la pared
    const grate = new THREE.Group();
    const iron = M.bars || M.iron;
    const nb = Math.round(W / 0.2);
    for (let k = 0; k <= nb; k++) {
      const x = -W / 2 + 0.08 + ((W - 0.16) * k) / nb;
      grate.add(mesh(boxGeo(0.05, H + 0.2, 0.05), iron, x, (H + 0.2) / 2 + 0.12, 0));
      grate.add(mesh(new THREE.ConeGeometry(0.04, 0.16, 4), iron, x, 0.06, 0, Math.PI, 0, 0));
    }
    for (let y = 0.5; y < H + 0.2; y += 0.42) grate.add(mesh(boxGeo(W - 0.06, 0.06, 0.07), iron, 0, y, 0));
    mergeByMaterial(grate);
    group.add(grate);
    pieces.push({ obj: grate, lift: H + 0.35 });
    return;
  }
  // dos hojas: cada una con la curva del arco arriba, bisagra en la cara de la pared
  const T = 0.1;
  const hz = side * (0.5 - T / 2 - 0.02);
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set((sx * W) / 2, 0, hz);
    const leaf = new THREE.Group();
    // (en coordenadas de la puerta y después corrido a la bisagra)
    const ls = new THREE.Shape();
    const e = (sx * W) / 2;
    const gap = sx * 0.006;
    ls.moveTo(e, 0.02);
    ls.lineTo(gap, 0.02);
    ls.lineTo(gap, archY(0) - 0.03);
    const steps = 10;
    for (let k = 1; k <= steps; k++) {
      const x = gap + ((e - gap) * k) / steps;
      ls.lineTo(x, archY(x) - 0.03);
    }
    ls.lineTo(e, 0.02);
    const lg = new THREE.ExtrudeGeometry(ls, { depth: T, bevelEnabled: false });
    lg.translate(-e, 0, -T / 2);
    leaf.add(mesh(lg, M.woodDark));
    // los herrajes: tres bandas con su punta, clavos y la argolla
    const L = W / 2 - 0.05;
    for (const y of [0.35, 1.25, Math.min(2.1, ys + 0.2)]) {
      for (const f of [-1, 1]) {
        leaf.add(mesh(boxGeo(L * 0.82, 0.08, 0.02), M.iron, -sx * L * 0.41, y, f * (T / 2 + 0.01)));
        leaf.add(mesh(boxGeo(0.12, 0.14, 0.02), M.iron, -sx * L * 0.84, y, f * (T / 2 + 0.01), 0, 0, Math.PI / 4));
        for (let c = 0; c < 4; c++) leaf.add(mesh(boxGeo(0.035, 0.035, 0.03), M.iron, -sx * (0.12 + c * L * 0.22), y + 0.07, f * (T / 2 + 0.02)));
      }
    }
    for (const f of [-1, 1]) leaf.add(mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 14), M.iron, -sx * (L - 0.12), 1.15, f * (T / 2 + 0.03)));
    mergeByMaterial(leaf);
    hinge.add(leaf);
    group.add(hinge);
    // abre 88 grados hacia `side`
    pieces.push({ obj: hinge, swing: side * sx * 1.54 });
  }
}

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

// La cara de la pared de hielo de la cueva: celeste, con vetas hondas, una
// sombra en el medio (algo duerme del otro lado) y grietas blancas.
function iceWallTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#d8f0ff');
  gr.addColorStop(1, '#86bce2');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const r = mulberry(77);
  for (let k = 0; k < 40; k++) {
    x.fillStyle = `rgba(40,110,170,${0.05 + r() * 0.12})`;
    x.beginPath();
    x.ellipse(r() * 256, r() * 256, 10 + r() * 40, 6 + r() * 25, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  const sh = x.createRadialGradient(128, 100, 8, 128, 115, 95);
  sh.addColorStop(0, 'rgba(8,18,36,0.6)');
  sh.addColorStop(1, 'rgba(8,18,36,0)');
  x.fillStyle = sh;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 1.2;
  for (let k = 0; k < 14; k++) {
    let px = r() * 256;
    let py = r() * 256;
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 5; s++) {
      px += (r() - 0.5) * 50;
      py += (r() - 0.5) * 50;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Un brillo redondo (para los ojos detrás del hielo).
function eyeGlowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.35, 'rgba(255,150,60,0.8)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
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
