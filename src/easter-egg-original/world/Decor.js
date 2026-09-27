import * as THREE from 'three';
import { rng } from '../core/noise';
import { mesh, boxGeo, cylGeo, rotateBox } from './props';
import { CELL } from './World';
import { ZONES, DOORS, WINDOWS, WALL_H, LIGHTS } from '../config/map';
import { buildAtlas, cellUV, ATLAS, OVERLAY } from './decorAtlas';

// Ambientación: carteles, herramientas, repisas, cañerías, muebles nuevos,
// basura en el piso, telarañas, haces de luna por las ventanas y polvo en el
// aire. Casi todo es estático y se fusiona por material con el resto del mapa.

const WALL_POOLS = {
  A: [['poster', 3], ['shelf', 2], ['tools', 2], ['rope', 1], ['lantern', 1], ['conduit', 1], ['blood', 1]],
  B: [['posterOld', 3], ['tools', 2], ['blood', 1.5], ['lantern', 1], ['rope', 1]],
  C: [['ad', 4], ['shelf', 3], ['clock', 1], ['chalk', 1], ['calendar', 1], ['blood', 0.5]],
  D: [['tools', 4], ['rope', 1], ['blood', 1.5], ['posterOld', 1]],
  E: [['santo', 2], ['cross', 2], ['sconce', 3], ['blood', 1]],
  F: [['panel', 3], ['warning', 2], ['conduit', 2], ['tools', 1], ['blood', 0.5]],
  G: [['poster', 2], ['tools', 2], ['rope', 2], ['conduit', 1], ['blood', 1]],
  H: [['frame', 3], ['clock', 1], ['calendar', 1], ['shelf', 2], ['blood', 0.5]],
};

// Muebles agregados a cada habitación: [tipo, x, z, rotación].
const FURNITURE = [
  ['workbench', 15.6, 33.55, 0],
  ['wheelbarrow', 13.2, 44.2, 0.4],
  ['chairs', 18.3, 36.6, 0.3],
  ['clothesline', 19.5, 29.6, 0],
  ['logs', 4.9, 25, Math.PI / 2],
  ['doghouse', 28.3, 22.3, -Math.PI / 2],
  ['pump', 26.8, 30.4, 0],
  ['vitrina', 31.5, 33.55, 0],
  ['pickles', 23, 35, 0],
  ['branches', 41.6, 30.3, 0],
  ['candelabro', 48.2, 19.3, 0],
  ['candelabro', 53.8, 19.3, 0],
  ['statue', 54.3, 18.75, 0],
  ['confesionario', 48.1, 29.9, Math.PI / 2],
  ['workbench', 41, 15.45, Math.PI],
  ['cylinders', 54.2, 12, 0],
  ['spool', 47.2, 5.3, 0],
  ['bascula', 20, 6.6, 0],
  ['handtruck', 27.6, 12.3, 0.5],
  ['rug', 48.5, 37.2, 0],
  ['coatrack', 54.3, 33.7, 0],
  ['safe', 43.2, 44.9, Math.PI],
  ['liquor', 45.8, 33.55, 0],
  ['globe', 45.4, 37.6, 0],
  ['grandclock', 52.6, 33.45, 0],
];

const tmpV = new THREE.Vector3();

export default class Decor {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.M = game.world.M;
    this.r = rng(9173);
    this.atlas = buildAtlas();
    this.posterMat = new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 0.95 });
    this.overlayMat = new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.extra = this.makeMaterials();
    this.blocked = this.collectBlocked();
    this.wallDecor();
    this.pipes();
    this.furniture();
    this.clutter();
    this.ceiling();
    this.shafts();
    this.moteT = 0;
  }

  makeMaterials() {
    const T = this.g.textures;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
    return {
      bottleGreen: std({ color: 0x2a5a2a, roughness: 0.15, metalness: 0.1 }),
      bottleBrown: std({ color: 0x5a3212, roughness: 0.15, metalness: 0.1 }),
      jarGlass: std({ color: 0xa8c0b0, roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }),
      tin: std({ color: 0x8a8a84, metalness: 0.8, roughness: 0.4 }),
      tinRed: std({ color: 0x9a2a1a, metalness: 0.5, roughness: 0.5 }),
      bone: std({ color: 0xd8ccb0, roughness: 0.8 }),
      cloth: std({ map: T.burlap, color: 0x8a3a2a, roughness: 1 }),
      clothBlue: std({ map: T.burlap, color: 0x3a4a7a, roughness: 1 }),
      rug: std({ map: T.burlap, color: 0x7a2418, roughness: 1 }),
      ceramic: std({ color: 0xe8e0d0, roughness: 0.3 }),
      gold: std({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 }),
      yerbaPile: std({ map: T.yerba, color: 0xb0b890, roughness: 1 }),
      stained: new THREE.MeshStandardMaterial({ map: stainedGlass(), emissiveMap: stainedGlass(), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.3 }),
      flameGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2), toneMapped: false }),
    };
  }

  // Lugares que no se tapan: puertas, ventanas y todo lo que se usa con F.
  collectBlocked() {
    const pts = [];
    for (const it of this.g.interact.list) pts.push([it.pos.x, it.pos.z]);
    for (const d of DOORS) for (const [x, z] of d.cells) pts.push([x + 0.5, z + 0.5]);
    for (const w of WINDOWS) pts.push([w.cell[0] + 0.5, w.cell[1] + 0.5]);
    return pts;
  }

  isFree(x, z, r = 1.3) {
    for (const [px, pz] of this.blocked) if (Math.hypot(px - x, pz - z) < r) return false;
    return true;
  }

  add(obj) {
    this.world.addStatic(obj);
  }

  // Plano con una celda del atlas.
  atlasPlane(k, w, h) {
    const geo = new THREE.PlaneGeometry(w, h);
    const { u0, u1, v0, v1 } = cellUV(k);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return new THREE.Mesh(geo, OVERLAY.has(k) ? this.overlayMat : this.posterMat);
  }

  // ---------------- paredes ----------------
  wallDecor() {
    const w = this.world;
    const seen = new Set();
    for (const key of Object.keys(ZONES)) {
      const [x0, z0, x1, z1] = ZONES[key].rect;
      const pool = WALL_POOLS[key];
      const total = pool.reduce((s, [, wt]) => s + wt, 0);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const wx = x + dx;
            const wz = z + dz;
            if (w.type(wx, wz) !== CELL.WALL) continue;
            const id = `${wx},${wz},${dx},${dz}`;
            if (seen.has(id)) continue;
            seen.add(id);
            if (this.r() > 0.78) continue;
            const face = [-dx, -dz];
            const a = w.wallAnchor([wx, wz], face, 0.005);
            if (!this.isFree(a.x, a.z)) continue;
            // no tapar muebles altos contra la pared
            if (w.cellBoxes[w.idx(x, z)].some((b) => b.active && b.y1 > 1.3 && (b.kind === 'prop' || b.kind === 'machine'))) continue;
            let r = this.r() * total;
            let kind = pool[0][0];
            for (const [k, wt] of pool) {
              r -= wt;
              if (r <= 0) {
                kind = k;
                break;
              }
            }
            const g = new THREE.Group();
            g.position.set(a.x, 0, a.z);
            g.rotation.y = a.rot;
            this.wallItem(kind, g, key);
            this.add(g);
          }
        }
      }
    }
  }

  wallItem(kind, g, zone) {
    const M = this.M;
    const X = this.extra;
    const r = this.r;
    const jit = () => (r() - 0.5) * 0.25;
    switch (kind) {
      case 'poster':
      case 'posterOld': {
        const k = [ATLAS.tareferos, ATLAS.horario, ATLAS.prohibido, ATLAS.calendario, ATLAS.carpincho][Math.floor(r() * 5)];
        const p = this.atlasPlane(k, 0.8, 1.08);
        p.position.set(jit(), 1.6 + r() * 0.15, 0.012);
        p.rotation.z = (r() - 0.5) * 0.08;
        g.add(p);
        break;
      }
      case 'ad': {
        const k = [ATLAS.carpincho, ATLAS.tranquera, ATLAS.nanduti][Math.floor(r() * 3)];
        const p = this.atlasPlane(k, 1.0, 1.0);
        p.position.set(jit(), 1.75, 0.012);
        g.add(p);
        break;
      }
      case 'calendar': {
        const p = this.atlasPlane(ATLAS.calendario, 0.5, 0.5);
        p.position.set(jit(), 1.55, 0.012);
        g.add(p);
        break;
      }
      case 'chalk': {
        g.add(mesh(boxGeo(1.0, 0.9, 0.03), M.woodDark, 0, 1.55, 0.015));
        const p = this.atlasPlane(ATLAS.pizarron, 0.96, 0.86);
        p.position.set(0, 1.55, 0.032);
        g.add(p);
        break;
      }
      case 'santo':
      case 'frame': {
        const k = zone === 'E' ? ATLAS.santo : [ATLAS.patron, ATLAS.plano, ATLAS.santo][Math.floor(r() * 3)];
        const big = k === ATLAS.patron ? 1.25 : 1;
        g.add(mesh(boxGeo(0.62 * big, 0.8 * big, 0.04), X.gold, 0, 1.7, 0.02));
        const p = this.atlasPlane(k, 0.54 * big, 0.72 * big);
        p.position.set(0, 1.7, 0.042);
        g.add(p);
        break;
      }
      case 'warning': {
        const p = this.atlasPlane(ATLAS.peligro, 0.45, 0.45);
        p.position.set(jit(), 1.7, 0.012);
        g.add(p);
        break;
      }
      case 'blood': {
        const k = [ATLAS.nosalgan, ATLAS.nolava, ATLAS.manos, ATLAS.manos][Math.floor(r() * 4)];
        const p = this.atlasPlane(k, 1.2, 1.2);
        p.position.set(jit(), k === ATLAS.manos ? 1.1 : 1.65, 0.01);
        g.add(p);
        break;
      }
      case 'shelf': {
        g.add(mesh(boxGeo(0.95, 0.035, 0.26), M.woodDark, 0, 1.45, 0.13));
        for (const x of [-0.36, 0.36]) g.add(mesh(boxGeo(0.03, 0.2, 0.03), M.iron, x, 1.35, 0.12, 0.7, 0, 0));
        let x = -0.4 + r() * 0.05;
        while (x < 0.42) {
          const t = r();
          if (t < 0.3) {
            const h = 0.18 + r() * 0.08;
            g.add(mesh(cylGeo(0.035, 0.035, h, 10), r() < 0.5 ? X.bottleGreen : X.bottleBrown, x, 1.468 + h / 2, 0.12));
            g.add(mesh(cylGeo(0.012, 0.018, 0.07, 8), r() < 0.5 ? X.bottleGreen : X.bottleBrown, x, 1.468 + h + 0.035, 0.12));
            x += 0.09;
          } else if (t < 0.6) {
            g.add(mesh(cylGeo(0.05, 0.05, 0.13, 12), X.jarGlass, x, 1.535, 0.12));
            g.add(mesh(cylGeo(0.04, 0.04, 0.1, 10), X.yerbaPile, x, 1.52, 0.12));
            x += 0.12;
          } else if (t < 0.85) {
            g.add(mesh(cylGeo(0.045, 0.045, 0.12, 12), r() < 0.5 ? X.tin : X.tinRed, x, 1.528, 0.12));
            x += 0.11;
          } else {
            g.add(mesh(boxGeo(0.05, 0.22, 0.17), [M.packRed, M.packGreen, M.leather][Math.floor(r() * 3)], x, 1.578, 0.12, 0, 0, (r() - 0.5) * 0.3));
            x += 0.07;
          }
        }
        break;
      }
      case 'tools': {
        g.add(mesh(boxGeo(1.0, 0.06, 0.05), M.woodDark, 0, 1.9, 0.03));
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) {
          const x = -0.35 + i * 0.35 + (r() - 0.5) * 0.08;
          const t = r();
          g.add(mesh(cylGeo(0.012, 0.012, 0.06, 6), M.iron, x, 1.9, 0.07, Math.PI / 2, 0, 0));
          const tool = new THREE.Group();
          tool.position.set(x, 1.88, 0.08);
          tool.rotation.z = (r() - 0.5) * 0.25;
          if (t < 0.35) {
            // pala
            tool.add(mesh(cylGeo(0.018, 0.018, 1.2, 6), M.log, 0, -0.6, 0));
            tool.add(mesh(boxGeo(0.24, 0.3, 0.02), M.metal, 0, -1.3, 0));
          } else if (t < 0.65) {
            // rastrillo
            tool.add(mesh(cylGeo(0.016, 0.016, 1.3, 6), M.log, 0, -0.65, 0));
            tool.add(mesh(boxGeo(0.4, 0.04, 0.03), M.iron, 0, -1.3, 0));
            for (let k = 0; k < 7; k++) tool.add(mesh(boxGeo(0.012, 0.09, 0.012), M.iron, -0.18 + k * 0.06, -1.36, 0.01));
          } else {
            // machete de tarefero
            tool.add(mesh(boxGeo(0.05, 0.14, 0.03), M.woodDark, 0, -0.08, 0));
            tool.add(mesh(boxGeo(0.07, 0.5, 0.006), M.metal, 0, -0.4, 0));
          }
          g.add(tool);
        }
        break;
      }
      case 'rope': {
        g.add(mesh(cylGeo(0.015, 0.015, 0.1, 6), M.iron, 0, 1.85, 0.05, Math.PI / 2, 0, 0));
        for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.2 - i * 0.012, 0.022, 6, 18), M.rope, (r() - 0.5) * 0.03, 1.66, 0.06 + i * 0.03));
        break;
      }
      case 'lantern': {
        g.add(mesh(boxGeo(0.04, 0.04, 0.3), M.iron, 0, 2.1, 0.15));
        g.add(mesh(cylGeo(0.06, 0.07, 0.16, 8), M.glassLamp, 0, 1.92, 0.28));
        g.add(mesh(cylGeo(0.02, 0.08, 0.06, 8), M.iron, 0, 2.03, 0.28));
        break;
      }
      case 'conduit': {
        g.add(mesh(cylGeo(0.022, 0.022, WALL_H - 1.6, 6), M.metal, 0.1, (WALL_H + 1.6) / 2, 0.03));
        g.add(mesh(boxGeo(0.2, 0.26, 0.09), M.metal, 0.1, 1.5, 0.045));
        g.add(mesh(boxGeo(0.05, 0.08, 0.03), M.black, 0.1, 1.5, 0.1));
        break;
      }
      case 'panel': {
        g.add(mesh(boxGeo(0.8, 1.0, 0.2), M.metalGreen, 0, 1.45, 0.1));
        for (let i = 0; i < 3; i++) {
          g.add(mesh(cylGeo(0.07, 0.07, 0.03, 16), M.brass, -0.25 + i * 0.25, 1.7, 0.21, Math.PI / 2, 0, 0));
          g.add(mesh(cylGeo(0.058, 0.058, 0.01, 16), X.ceramic, -0.25 + i * 0.25, 1.7, 0.228, Math.PI / 2, 0, 0));
          g.add(mesh(boxGeo(0.006, 0.05, 0.004), M.black, -0.25 + i * 0.25, 1.715, 0.235, 0, 0, (r() - 0.5) * 2));
        }
        for (let i = 0; i < 4; i++) g.add(mesh(cylGeo(0.02, 0.02, 0.04, 8), i % 2 ? M.redPaint : M.glassLampOff, -0.3 + i * 0.2, 1.3, 0.21, Math.PI / 2, 0, 0));
        g.add(mesh(cylGeo(0.03, 0.03, WALL_H - 1.95, 6), M.black, 0.3, (WALL_H + 1.95) / 2, 0.1));
        break;
      }
      case 'clock': {
        g.add(mesh(cylGeo(0.2, 0.2, 0.06, 24), M.woodDark, 0, 2.0, 0.03, Math.PI / 2, 0, 0));
        g.add(mesh(cylGeo(0.17, 0.17, 0.01, 24), X.ceramic, 0, 2.0, 0.065, Math.PI / 2, 0, 0));
        g.add(mesh(boxGeo(0.012, 0.12, 0.006), M.black, 0, 2.05, 0.072, 0, 0, 0.6));
        g.add(mesh(boxGeo(0.01, 0.15, 0.006), M.black, 0, 2.06, 0.074, 0, 0, -2.2));
        break;
      }
      case 'cross': {
        g.add(mesh(boxGeo(0.07, 0.6, 0.04), M.woodDark, 0, 1.9, 0.02));
        g.add(mesh(boxGeo(0.34, 0.07, 0.04), M.woodDark, 0, 2.02, 0.02));
        break;
      }
      case 'sconce': {
        g.add(mesh(boxGeo(0.12, 0.2, 0.03), M.brass, 0, 1.7, 0.015));
        g.add(mesh(boxGeo(0.03, 0.03, 0.14), M.brass, 0, 1.64, 0.08));
        g.add(mesh(cylGeo(0.025, 0.025, 0.14, 8), M.candle, 0, 1.72, 0.15));
        g.add(mesh(new THREE.ConeGeometry(0.016, 0.05, 6), X.flameGlow, 0, 1.815, 0.15));
        // vitral arriba
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.1), X.stained);
        glass.position.set(0, 2.75, 0.012);
        if (this.r() < 0.6) g.add(glass);
        break;
      }
      default:
        break;
    }
  }

  // Cañerías corridas a lo largo de las paredes de las naves (máquinas y acopio).
  pipes() {
    const w = this.world;
    const M = this.M;
    for (const key of ['F', 'G']) {
      const [x0, z0, x1, z1] = ZONES[key].rect;
      const runs = [
        { y: 3.15, off: 0.1, r: 0.06, mat: M.metal },
        { y: 2.95, off: 0.19, r: 0.04, mat: key === 'F' ? M.copper : M.metal },
      ];
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const t = w.type(x + dx, z + dz);
            if (t !== CELL.WALL && t !== CELL.DOOR && t !== CELL.WINDOW) continue;
            const a = w.wallAnchor([x + dx, z + dz], [-dx, -dz], 0);
            const g = new THREE.Group();
            g.position.set(a.x, 0, a.z);
            g.rotation.y = a.rot;
            for (const run of runs) g.add(mesh(cylGeo(run.r, run.r, 1.0, 8), run.mat, 0, run.y, run.off, 0, 0, Math.PI / 2));
            if ((x + z) % 3 === 0) g.add(mesh(boxGeo(0.05, 0.4, 0.05), M.iron, 0, 3.05, 0.1));
            this.add(g);
          }
        }
      }
    }
  }

  // ---------------- muebles ----------------
  furniture() {
    for (const [type, x, z, rot] of FURNITURE) {
      const make = this[`f_${type}`];
      if (!make) continue;
      const g = new THREE.Group();
      const boxes = make.call(this, g) || [];
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      g.updateMatrixWorld(true);
      for (const b of boxes) this.world.addBox(rotateBox(b, x, z, rot), { kind: 'prop' });
      this.add(g);
    }
  }

  f_workbench(g) {
    const M = this.M;
    g.add(mesh(boxGeo(2.0, 0.08, 0.7), M.wood, 0, 0.88, 0));
    for (const [a, b] of [[-0.92, -0.3], [0.92, -0.3], [-0.92, 0.3], [0.92, 0.3]]) g.add(mesh(boxGeo(0.08, 0.88, 0.08), M.woodDark, a, 0.44, b));
    g.add(mesh(boxGeo(1.9, 0.04, 0.6), M.woodDark, 0, 0.25, 0));
    // morsa, martillo, frascos de clavos
    g.add(mesh(boxGeo(0.18, 0.12, 0.14), M.iron, 0.75, 0.98, -0.2));
    g.add(mesh(cylGeo(0.012, 0.012, 0.3, 6), M.log, -0.3, 0.935, 0.1, 0, 0, Math.PI / 2));
    g.add(mesh(boxGeo(0.12, 0.05, 0.04), M.iron, -0.17, 0.935, 0.1));
    for (let i = 0; i < 3; i++) g.add(mesh(cylGeo(0.04, 0.04, 0.1, 10), this.extra.jarGlass, -0.7 + i * 0.12, 0.97, -0.2));
    return [[-1.02, 0, -0.38, 1.02, 0.95, 0.38]];
  }

  f_wheelbarrow(g) {
    const M = this.M;
    g.add(mesh(boxGeo(0.7, 0.28, 0.55), M.metal, 0, 0.5, 0, 0.12, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 14), M.tire, 0, 0.2, 0.42, 0, Math.PI / 2, 0));
    for (const x of [-0.25, 0.25]) g.add(mesh(cylGeo(0.02, 0.02, 1.1, 6), M.log, x, 0.45, -0.25, 1.35, 0, 0));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.2, 10), this.extra.yerbaPile, 0, 0.72, 0));
    return [[-0.4, 0, -0.75, 0.4, 0.7, 0.6]];
  }

  f_chairs(g) {
    const M = this.M;
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      c.position.y = i * 0.28;
      c.rotation.y = i * 0.15;
      c.add(mesh(boxGeo(0.45, 0.05, 0.45), M.wood, 0, 0.46, 0));
      for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) c.add(mesh(boxGeo(0.04, 0.46, 0.04), M.wood, a, 0.23, b));
      c.add(mesh(boxGeo(0.45, 0.45, 0.04), M.wood, 0, 0.72, -0.2));
      g.add(c);
    }
    return [[-0.3, 0, -0.3, 0.3, 1.5, 0.3]];
  }

  f_clothesline(g) {
    const M = this.M;
    const X = this.extra;
    for (const x of [-2.4, 2.4]) g.add(mesh(cylGeo(0.05, 0.06, 2.1, 6), M.log, x, 1.05, 0));
    g.add(mesh(cylGeo(0.006, 0.006, 4.8, 4), M.rope, 0, 1.95, 0, 0, 0, Math.PI / 2));
    // ponchos y trapos colgados
    [[-1.4, X.cloth, 0.9], [0.1, X.clothBlue, 0.7], [1.4, X.cloth, 0.6]].forEach(([x, mat, h]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, h, 4, 4), mat);
      const pos = p.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 5) * 0.04 + Math.sin(pos.getY(i) * 7) * 0.02);
      p.geometry.computeVertexNormals();
      p.material = mat;
      p.material.side = THREE.DoubleSide;
      p.position.set(x, 1.95 - h / 2, 0);
      g.add(p);
    });
    return [[-2.5, 0, -0.1, -2.3, 2, 0.1], [2.3, 0, -0.1, 2.5, 2, 0.1]];
  }

  f_logs(g) {
    const M = this.M;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6 - row; i++) g.add(mesh(cylGeo(0.12, 0.12, 1.4, 7), M.log, (i - (5 - row) / 2) * 0.25, 0.12 + row * 0.21, 0, Math.PI / 2, 0, 0));
    }
    return [[-0.8, 0, -0.72, 0.8, 0.7, 0.72]];
  }

  f_doghouse(g) {
    const M = this.M;
    g.add(mesh(boxGeo(0.9, 0.7, 1.0), M.wood, 0, 0.35, 0));
    g.add(mesh(boxGeo(0.6, 0.06, 1.1), M.roofTin, -0.22, 0.85, 0, 0, 0, 0.7));
    g.add(mesh(boxGeo(0.6, 0.06, 1.1), M.roofTin, 0.22, 0.85, 0, 0, 0, -0.7));
    g.add(mesh(boxGeo(0.34, 0.4, 0.02), M.black, 0, 0.3, 0.51));
    g.add(mesh(cylGeo(0.14, 0.11, 0.07, 12), M.metal, 0.3, 0.035, 0.75));
    return [[-0.47, 0, -0.52, 0.47, 1, 0.52]];
  }

  f_pump(g) {
    const M = this.M;
    g.add(mesh(cylGeo(0.09, 0.12, 1.0, 10), M.metalGreen, 0, 0.5, 0));
    g.add(mesh(cylGeo(0.03, 0.04, 0.3, 8), M.metalGreen, 0, 0.82, 0.18, Math.PI / 2 - 0.3, 0, 0));
    g.add(mesh(cylGeo(0.018, 0.018, 0.7, 6), M.iron, 0, 1.12, -0.2, 0.9, 0, 0));
    g.add(mesh(cylGeo(0.25, 0.22, 0.3, 14), M.metal, 0, 0.15, 0.45));
    return [[-0.2, 0, -0.2, 0.2, 1.1, 0.72]];
  }

  f_vitrina(g) {
    const M = this.M;
    const X = this.extra;
    g.add(mesh(boxGeo(1.9, 0.8, 0.55), M.woodDark, 0, 0.4, 0));
    g.add(mesh(boxGeo(1.9, 0.5, 0.5), X.jarGlass, 0, 1.05, 0));
    for (let i = 0; i < 6; i++) g.add(mesh(cylGeo(0.05, 0.05, 0.2, 10), i % 2 ? X.bottleGreen : X.bottleBrown, -0.7 + i * 0.28, 0.9, 0));
    g.add(mesh(boxGeo(1.92, 0.04, 0.57), M.wood, 0, 1.32, 0));
    return [[-0.97, 0, -0.3, 0.97, 1.35, 0.3]];
  }

  f_pickles(g) {
    const M = this.M;
    const X = this.extra;
    for (const [x, z] of [[0, 0], [0.62, 0.1], [0.3, 0.6]]) {
      g.add(mesh(cylGeo(0.28, 0.3, 0.85, 14), M.wood, x, 0.425, z));
      for (const y of [0.15, 0.7]) g.add(mesh(cylGeo(0.3, 0.31, 0.04, 14), M.iron, x, y, z));
      g.add(mesh(cylGeo(0.26, 0.26, 0.02, 14), X.yerbaPile, x, 0.85, z));
    }
    return [[-0.32, 0, -0.32, 0.95, 0.9, 0.92]];
  }

  f_branches(g) {
    const M = this.M;
    for (let i = 0; i < 9; i++) g.add(mesh(cylGeo(0.03, 0.05, 1.8, 5), M.log, (this.r() - 0.5) * 0.6, 0.08 + i * 0.05, (this.r() - 0.5) * 0.4, Math.PI / 2 + (this.r() - 0.5) * 0.3, (this.r() - 0.5) * 0.4, 0));
    g.add(mesh(boxGeo(1.4, 0.3, 0.8), M.yerbaBranch, 0, 0.45, 0));
    return [[-0.9, 0, -0.5, 0.9, 0.65, 0.5]];
  }

  f_candelabro(g) {
    const M = this.M;
    g.add(mesh(cylGeo(0.18, 0.22, 0.05, 12), M.brass, 0, 0.025, 0));
    g.add(mesh(cylGeo(0.025, 0.035, 1.3, 8), M.brass, 0, 0.67, 0));
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 18), M.brass, 0, 1.32, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(cylGeo(0.018, 0.018, 0.16, 8), M.candle, Math.cos(a) * 0.2, 1.4, Math.sin(a) * 0.2));
      g.add(mesh(new THREE.ConeGeometry(0.013, 0.04, 6), this.extra.flameGlow, Math.cos(a) * 0.2, 1.5, Math.sin(a) * 0.2));
    }
    return [[-0.2, 0, -0.2, 0.2, 1.5, 0.2]];
  }

  f_statue(g) {
    const M = this.M;
    const X = this.extra;
    g.add(mesh(boxGeo(0.5, 0.9, 0.5), M.stone, 0, 0.45, 0));
    g.add(mesh(new THREE.ConeGeometry(0.22, 1.0, 12), X.clothBlue, 0, 1.4, 0));
    g.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), X.ceramic, 0, 1.97, 0));
    g.add(mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20), X.gold, 0, 2.08, -0.05));
    return [[-0.26, 0, -0.26, 0.26, 2, 0.26]];
  }

  f_confesionario(g) {
    const M = this.M;
    g.add(mesh(boxGeo(1.4, 2.2, 0.9), M.woodDark, 0, 1.1, 0));
    g.add(mesh(boxGeo(0.5, 1.5, 0.02), this.extra.cloth, -0.35, 1.2, 0.46));
    g.add(mesh(boxGeo(0.02, 1.9, 0.9), M.wood, 0, 1.05, 0.02));
    return [[-0.72, 0, -0.47, 0.72, 2.2, 0.47]];
  }

  f_cylinders(g) {
    const M = this.M;
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * 0.35 - 0.17;
      const z = Math.floor(i / 2) * 0.35 - 0.17;
      g.add(mesh(cylGeo(0.14, 0.14, 1.3, 12), i % 2 ? M.redPaint : M.metalGreen, x, 0.65, z));
      g.add(mesh(cylGeo(0.05, 0.1, 0.1, 10), M.brass, x, 1.35, z));
    }
    return [[-0.35, 0, -0.35, 0.35, 1.4, 0.35]];
  }

  f_spool(g) {
    const M = this.M;
    for (const z of [-0.3, 0.3]) g.add(mesh(cylGeo(0.5, 0.5, 0.05, 18), M.wood, 0, 0.5, z, Math.PI / 2, 0, 0));
    g.add(mesh(cylGeo(0.36, 0.36, 0.56, 16), M.black, 0, 0.5, 0, Math.PI / 2, 0, 0));
    return [[-0.5, 0, -0.35, 0.5, 1, 0.35]];
  }

  f_bascula(g) {
    const M = this.M;
    g.add(mesh(boxGeo(2.0, 0.12, 1.4), M.iron, 0, 0.06, 0));
    g.add(mesh(boxGeo(1.9, 0.02, 1.3), M.wood, 0, 0.13, 0));
    g.add(mesh(boxGeo(0.12, 1.4, 0.12), M.metalGreen, -0.95, 0.7, -0.6));
    g.add(mesh(boxGeo(0.8, 0.06, 0.06), M.brass, -0.6, 1.3, -0.6));
    for (let i = 0; i < 3; i++) g.add(mesh(cylGeo(0.07, 0.07, 0.08, 10), M.iron, -0.3 - i * 0.18, 0.18, -0.4));
    for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(0.9, 0.45, 0.6), M.sackYerba, 0.3, 0.36 + i * 0.45, 0.2, 0, i * 0.3, 0));
    return [[-1.02, 0, -0.72, 1.02, 1.1, 0.72]];
  }

  f_handtruck(g) {
    const M = this.M;
    for (const x of [-0.2, 0.2]) g.add(mesh(cylGeo(0.02, 0.02, 1.3, 6), M.iron, x, 0.7, 0, -0.35, 0, 0));
    g.add(mesh(boxGeo(0.45, 0.03, 0.3), M.iron, 0, 0.05, 0.18));
    for (const x of [-0.25, 0.25]) g.add(mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12), M.tire, x, 0.13, 0.05, 0, Math.PI / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), M.sackYerba, 0, 0.3, 0.12));
    return [[-0.3, 0, -0.3, 0.3, 1.2, 0.4]];
  }

  f_rug(g) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0), this.extra.rug);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.006;
    g.add(p);
    return [];
  }

  f_coatrack(g) {
    const M = this.M;
    g.add(mesh(cylGeo(0.025, 0.03, 1.8, 8), M.woodDark, 0, 0.9, 0));
    g.add(mesh(cylGeo(0.2, 0.22, 0.04, 10), M.woodDark, 0, 0.02, 0));
    // sombrero y poncho colgados
    g.add(mesh(cylGeo(0.22, 0.22, 0.02, 16), M.leather, 0.05, 1.82, 0));
    g.add(mesh(cylGeo(0.11, 0.12, 0.1, 14), M.leather, 0.05, 1.88, 0));
    const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10, 1, true), this.extra.cloth);
    poncho.material.side = THREE.DoubleSide;
    poncho.position.set(0, 1.28, 0);
    g.add(poncho);
    return [[-0.2, 0, -0.2, 0.2, 1.9, 0.2]];
  }

  f_safe(g) {
    const M = this.M;
    g.add(mesh(boxGeo(0.7, 0.85, 0.65), M.iron, 0, 0.425, 0));
    g.add(mesh(cylGeo(0.08, 0.08, 0.03, 16), M.brass, 0.1, 0.5, 0.33, Math.PI / 2, 0, 0));
    g.add(mesh(boxGeo(0.04, 0.2, 0.04), M.brass, -0.2, 0.45, 0.34));
    return [[-0.36, 0, -0.34, 0.36, 0.86, 0.34]];
  }

  f_liquor(g) {
    const M = this.M;
    const X = this.extra;
    g.add(mesh(boxGeo(1.0, 1.6, 0.45), M.woodDark, 0, 0.8, 0));
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 5; i++) {
        const mat = [X.bottleGreen, X.bottleBrown, X.jarGlass][(i + s) % 3];
        g.add(mesh(cylGeo(0.035, 0.035, 0.24, 10), mat, -0.36 + i * 0.18, 0.62 + s * 0.42, 0.18));
      }
    }
    return [[-0.52, 0, -0.24, 0.52, 1.6, 0.24]];
  }

  f_globe(g) {
    const M = this.M;
    g.add(mesh(cylGeo(0.18, 0.22, 0.05, 12), M.woodDark, 0, 0.025, 0));
    g.add(mesh(cylGeo(0.03, 0.03, 0.8, 8), M.woodDark, 0, 0.45, 0));
    g.add(mesh(new THREE.SphereGeometry(0.22, 18, 12), this.extra.clothBlue, 0, 1.0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.24, 0.01, 6, 24, Math.PI), M.brass, 0, 1.0, 0, 0, 0, 0.4));
    return [[-0.24, 0, -0.24, 0.24, 1.25, 0.24]];
  }

  f_grandclock(g) {
    const M = this.M;
    const X = this.extra;
    g.add(mesh(boxGeo(0.5, 2.1, 0.35), M.woodDark, 0, 1.05, 0));
    g.add(mesh(cylGeo(0.17, 0.17, 0.02, 20), X.ceramic, 0, 1.75, 0.18, Math.PI / 2, 0, 0));
    g.add(mesh(boxGeo(0.01, 0.12, 0.006), M.black, 0, 1.79, 0.195, 0, 0, 0.3));
    g.add(mesh(cylGeo(0.08, 0.08, 0.01, 16), X.gold, 0, 0.9, 0.18, Math.PI / 2, 0, 0));
    return [[-0.26, 0, -0.18, 0.26, 2.1, 0.18]];
  }

  // ---------------- piso ----------------
  clutter() {
    const w = this.world;
    const M = this.M;
    const X = this.extra;
    const r = this.r;
    for (const key of Object.keys(ZONES)) {
      const [x0, z0, x1, z1] = ZONES[key].rect;
      const n = Math.floor(((x1 - x0 + 1) * (z1 - z0 + 1)) / 9);
      for (let i = 0; i < n; i++) {
        // cerca de las paredes, donde se junta la mugre
        let x = x0 + r() * (x1 - x0 + 1);
        let z = z0 + r() * (z1 - z0 + 1);
        if (r() < 0.7) {
          if (r() < 0.5) x = r() < 0.5 ? x0 + r() * 1.3 : x1 + 1 - r() * 1.3;
          else z = r() < 0.5 ? z0 + r() * 1.3 : z1 + 1 - r() * 1.3;
        }
        if (w.navBlock[w.idx(Math.floor(x), Math.floor(z))] || !this.isFree(x, z, 1.1)) continue;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = r() * Math.PI * 2;
        const t = r();
        const outdoor = ZONES[key].outdoor;
        if (t < 0.22 && !outdoor) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), M.paper);
          p.rotation.x = -Math.PI / 2;
          p.position.y = 0.006;
          g.add(p);
          if (r() < 0.5) {
            const p2 = p.clone();
            p2.position.set(0.1, 0.008, 0.08);
            p2.rotation.z = 0.7;
            g.add(p2);
          }
        } else if (t < 0.38) {
          g.add(mesh(boxGeo(0.9 + r() * 0.5, 0.03, 0.12), M.wood, 0, 0.018, 0, 0, 0, (r() - 0.5) * 0.1));
        } else if (t < 0.5) {
          g.add(mesh(cylGeo(0.035, 0.035, 0.24, 8), r() < 0.5 ? X.bottleGreen : X.bottleBrown, 0, 0.035, 0, 0, 0, Math.PI / 2));
        } else if (t < 0.6) {
          g.add(mesh(cylGeo(0.045, 0.045, 0.12, 10), r() < 0.5 ? X.tin : X.tinRed, 0, 0.06, 0));
        } else if (t < 0.72) {
          const rag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), r() < 0.5 ? X.cloth : M.sack);
          rag.scale.set(1.2, 0.18, 0.9);
          rag.position.y = 0.03;
          g.add(rag);
        } else if (t < 0.86) {
          g.add(mesh(new THREE.ConeGeometry(0.3 + r() * 0.2, 0.14, 10), X.yerbaPile, 0, 0.07, 0));
        } else if (t < 0.95) {
          for (let k = 0; k < 4; k++) g.add(mesh(boxGeo(0.21, 0.07, 0.1), M.redPaint, (r() - 0.5) * 0.5, 0.035 + (k > 2 ? 0.07 : 0), (r() - 0.5) * 0.5, 0, r() * 3, 0));
        } else {
          // calavera y huesos
          g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), X.bone, 0, 0.09, 0));
          g.add(mesh(boxGeo(0.12, 0.06, 0.1), X.bone, 0, 0.03, 0.06));
          for (let k = 0; k < 3; k++) g.add(mesh(cylGeo(0.02, 0.025, 0.35, 6), X.bone, (r() - 0.5) * 0.5, 0.025, (r() - 0.5) * 0.5, 0, r() * 3, Math.PI / 2));
        }
        this.add(g);
      }
    }
  }

  // ---------------- techo: telarañas y cosas colgadas ----------------
  ceiling() {
    const M = this.M;
    const r = this.r;
    const H = WALL_H;
    for (const key of Object.keys(ZONES)) {
      const Z = ZONES[key];
      if (Z.outdoor) continue;
      const [x0, z0, x1, z1] = Z.rect;
      const corners = [[x0, z0, 1, 1], [x1 + 1, z0, -1, 1], [x0, z1 + 1, 1, -1], [x1 + 1, z1 + 1, -1, -1]];
      for (const [cx, cz, sx, sz] of corners) {
        if (r() < 0.2) continue;
        const s = 0.9 + r() * 0.6;
        const web = this.atlasPlane(ATLAS.telarana, s, s);
        // en diagonal cruzando la esquina, colgando del techo
        web.position.set(cx + sx * s * 0.36, H - s * 0.5, cz + sz * s * 0.36);
        web.rotation.y = Math.atan2(sx, sz) + Math.PI;
        web.material = this.overlayMat;
        const g = new THREE.Group();
        g.add(web);
        this.add(g);
      }
      // cosas colgando de las vigas
      const n = Math.floor(((x1 - x0) * (z1 - z0)) / 30);
      for (let i = 0; i < n; i++) {
        const x = x0 + 1 + r() * (x1 - x0 - 1);
        const z = z0 + 1 + r() * (z1 - z0 - 1);
        if (LIGHTS.some((L) => Math.hypot(L.pos[0] - x, L.pos[2] - z) < 1.5)) continue;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        if (key === 'D' || key === 'C') {
          // atados de yerba secándose / salames del almacén
          const len = 0.5 + r() * 0.4;
          g.add(mesh(cylGeo(0.005, 0.005, H - 2.2 - len * 0.5, 4), M.rope, 0, (H + 2.2 + len * 0.5) / 2, 0));
          if (key === 'D') g.add(mesh(new THREE.ConeGeometry(0.18, len, 7), M.yerbaBranch, 0, H - (H - 2.2 - len * 0.5) - len / 2, 0, Math.PI, 0, 0));
          else for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CapsuleGeometry(0.04, 0.3, 3, 6), M.redPaint, (k - 1) * 0.08, 2.05, 0));
        } else if (key === 'F' || key === 'G') {
          // cadenas con gancho
          const len = 0.8 + r() * 0.9;
          for (let k = 0; k < len / 0.09; k++) g.add(mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 8), M.iron, 0, H - 0.05 - k * 0.09, 0, 0, k % 2 ? Math.PI / 2 : 0, 0));
          g.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10, Math.PI * 1.3), M.iron, 0, H - len - 0.12, 0, 0, 0, Math.PI));
        } else {
          continue;
        }
        this.add(g);
      }
    }
  }

  // ---------------- haces de luna por las ventanas ----------------
  shafts() {
    const moon = this.world.moonDir.clone();
    const ray = moon.clone().negate().normalize();
    const geos = [];
    for (const w of WINDOWS) {
      const [ox, oz] = w.out;
      // solo las ventanas que miran a la luna (norte y oeste)
      if (ox * moon.x + oz * moon.z <= 0.1) continue;
      const cx = w.cell[0] + 0.5 - ox * 0.45;
      const cz = w.cell[1] + 0.5 - oz * 0.45;
      const len = 5.5;
      // dos planos cruzados a lo largo del rayo
      for (let k = 0; k < 2; k++) {
        const geo = new THREE.PlaneGeometry(len, k ? 1.0 : 1.3, 8, 1);
        geo.translate(len / 2, 0, 0);
        const m = new THREE.Mesh(geo);
        m.position.set(cx, 1.65, cz);
        // eje x del plano sobre el rayo
        const x = ray.clone();
        const side = new THREE.Vector3(-oz, 0, ox);
        const up = k ? new THREE.Vector3().crossVectors(x, side).normalize() : side.clone();
        const z = new THREE.Vector3().crossVectors(x, up).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
        m.updateMatrix();
        geos.push(geo.applyMatrix4(m.matrix));
      }
    }
    if (!geos.length) return;
    const geo = mergeAll(geos);
    this.shaftU = { uTime: { value: 0 }, uK: { value: 1 }, uColor: { value: new THREE.Color(0.55, 0.65, 0.95) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.shaftU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uK; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          float along = vUv.x;
          float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float a = smoothstep(0.0, 0.12, along) * (1.0 - along) * smoothstep(0.0, 0.6, across);
          // motas de polvo que brillan dentro del haz
          vec3 cell = floor(vW * 18.0 + vec3(0.0, uTime * 0.6, 0.0));
          float mote = step(0.985, h(cell)) * 0.8;
          gl_FragColor = vec4(uColor * (a * 0.075 + mote * a) * uK, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 6;
    m.frustumCulled = false;
    this.world.root.add(m);
  }

  update(dt) {
    const g = this.g;
    if (this.shaftU) {
      this.shaftU.uTime.value = g.time;
      const wth = g.weather?.cur;
      const cloud = wth ? wth.cloud : 0.15;
      const blood = wth ? wth.blood : 0;
      this.shaftU.uK.value = (1 - cloud * 0.7) + (g.weather?.flash || 0) * 4;
      this.shaftU.uColor.value.setRGB(0.55 + blood * 0.4, 0.65 - blood * 0.45, 0.95 - blood * 0.7);
    }
    // polvo flotando cerca del jugador bajo techo
    if (!g.player) return;
    this.moteT -= dt;
    if (this.moteT > 0) return;
    this.moteT = 0.08;
    const p = g.player.pos;
    const zone = this.world.zoneAt(p.x, p.z);
    if (!zone || ZONES[zone].outdoor) return;
    const x = p.x + (Math.random() - 0.5) * 9;
    const z = p.z + (Math.random() - 0.5) * 9;
    tmpV.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.4) * 0.05, (Math.random() - 0.5) * 0.08);
    g.fx.add.spawn(x, 0.4 + Math.random() * 2.6, z, tmpV.x, tmpV.y, tmpV.z, { color: [0.55, 0.48, 0.38], size: 0.014, life: 5 + Math.random() * 3, alpha: 0.55 });
  }
}

function mergeAll(list) {
  const pos = [];
  const uv = [];
  for (const g of list) {
    const gi = g.index ? g.toNonIndexed() : g;
    pos.push(...gi.attributes.position.array);
    uv.push(...gi.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

// Vitral: paños de colores con plomo negro.
function stainedGlass() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  const r = rng(77);
  const cols = ['#b02020', '#2040a0', '#d0a020', '#207040', '#8030a0'];
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x, y, 32, 32);
    }
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  for (let x = 0; x <= 128; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
