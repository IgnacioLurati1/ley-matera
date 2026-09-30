import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { toTexture } from '../core/textures';
import { sndSlam, sndArc, inTower } from '../entities/towerKit';

// Los escombros de la torre que no se pagan (modo historia; config/maps/torre.js
// DOORS `open`). Cada uno muestra qué hay que hacer, sin cartel largo:
//  · 'soga': una carga de bolsas de yerba colgada de una soga arriba del
//    escombro, con el nudo que brilla. Un tiro al nudo y la carga cae encima.
//  · 'polvora': un barril de pólvora metido en el escombro, con la mecha que
//    chisporrotea. Un tiro (o una explosión cerca) y vuela todo (lastima a los
//    que están cerca, salvo con PhD).
//  · 'almas': una losa de piedra con runas y un círculo violeta en el piso;
//    cada muerto que cae adentro del círculo prende una runa. Con todas
//    prendidas, la losa se parte.
//  · 'viento': chapas sueltas atadas en la escalera, que tiemblan con el
//    viento. Cuando se abren los postigos de ese piso (world/towerShutters.js)
//    el remolino se las lleva.
// El anfitrión decide y abre la puerta (Interactables.openDoor, que la manda);
// lo que se ve va por 'pee' deb.

const ALMAS_NEED = 10;
const ALMAS_R = 3.3;
const rnd = () => Math.random() - 0.5;

export default class TowerDebris {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.M = this.g.world.M;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.list = this.g.interact.list.filter((it) => it.kind === 'door' && it.door.def.open).map((it, i) => this.build(it.door, i));
  }

  build(door, i) {
    const d = door.def;
    const gp = door.group.position;
    const fy = gp.y;
    const D = { i, door, kind: d.open, fy, pos: gp.clone(), done: false, t: 0 };
    const along = door.group.rotation.y === 0 ? 'x' : 'z';
    // de qué lado se llega (lejos de la escalera): el que da al piso
    D.front = this.front(door);
    D.wallIn = this.wallIn;
    if (D.kind === 'soga') this.buildSoga(D, along);
    else if (D.kind === 'polvora') this.buildPolvora(D);
    else if (D.kind === 'almas') this.buildAlmas(D);
    else if (D.kind === 'viento') this.buildViento(D, along);
    // lo que dice de cerca (dos o tres palabras)
    const text = { soga: 'Tirale a la soga', polvora: 'Pólvora: disparale de lejos', almas: 'Matá muertos en el círculo', viento: 'Abrí los postigos: palanca ¡VIENTO! enfrente' }[D.kind];
    this.g.interact.add({
      kind: 'ee',
      pos: gp.clone().setY(fy + 1.2),
      radius: 2.8,
      prompt: () => (D.done || door.open ? null : { text, noCost: true, info: true }),
      cost: () => 0,
      use: () => false,
    });
    return D;
  }

  // Un brillo (sprite aditivo) para que se note desde lejos.
  glow(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.scale.setScalar(size);
    this.root.add(s);
    return s;
  }

  // Hacia dónde queda el piso desde el escombro (la escalera sube para el otro lado).
  front(door) {
    const R = this.T.ramps.find((r) => door.def.cells.some(([x, z]) => x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3]));
    const dir = R?.dir || '+x';
    const v = { '+x': [-1, 0], '-x': [1, 0], '+z': [0, -1], '-z': [0, 1] }[dir];
    // (y hacia adentro desde la pared de la escalera)
    const n = [[0, 1], [-1, 0], [0, -1], [1, 0]][R?.side ?? 0];
    this.wallIn = new THREE.Vector3(n[0], 0, n[1]);
    return new THREE.Vector3(v[0], 0, v[1]);
  }

  // ---------------- la soga ----------------
  buildSoga(D, along) {
    const M = this.M;
    const { pos, fy } = D;
    const grp = new THREE.Group();
    grp.position.set(pos.x, fy, pos.z);
    grp.rotation.y = along === 'x' ? 0 : Math.PI / 2;
    // la viga de arriba (de pared a pared del pasillo de la escalera) y la roldana
    grp.add(mesh(boxGeo(2.6, 0.18, 0.2), M.woodDark, 0, 3.55, 0));
    grp.add(mesh(cylGeo(0.12, 0.12, 0.08, 12), M.iron, 0, 3.4, 0, Math.PI / 2, 0, 0));
    this.root.add(grp);
    // la carga: bolsas de yerba en un pallet, con eslingas
    const load = new THREE.Group();
    load.add(mesh(boxGeo(1.1, 0.12, 0.9), M.wood, 0, 0, 0));
    for (let k = 0; k < 4; k++) load.add(mesh(boxGeo(0.5, 0.3, 0.4), M.sackYerba, (k % 2 ? 0.26 : -0.26), 0.2 + (k > 1 ? 0.3 : 0), rnd() * 0.1, 0, rnd() * 0.4, 0));
    for (const s of [-1, 1]) load.add(mesh(boxGeo(0.03, 0.9, 0.03), M.rope, s * 0.45, 0.5, 0, 0, 0, -s * 0.45));
    load.position.set(pos.x, fy + 2.45, pos.z);
    this.root.add(load);
    const rope = mesh(cylGeo(0.022, 0.022, 1, 5), M.rope, pos.x, fy + 3.1, pos.z);
    rope.scale.y = 0.8;
    this.root.add(rope);
    const knot = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffc050, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    knot.scale.setScalar(0.55);
    knot.position.set(pos.x, fy + 3.2, pos.z);
    this.root.add(knot);
    const knotBall = mesh(new THREE.SphereGeometry(0.07, 8, 6), M.rope, pos.x, fy + 3.2, pos.z);
    this.root.add(knotBall);
    Object.assign(D, { load, rope, knot, knotBall, hit: knot.position.clone(), hitR: 0.3, vel: 0 });
  }

  // ---------------- la pólvora ----------------
  buildPolvora(D) {
    const M = this.M;
    const at = D.pos.clone().addScaledVector(D.front, 0.85);
    at.x += rnd() * 0.3;
    const keg = new THREE.Group();
    keg.position.set(at.x, D.fy, at.z);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = 'bold 34px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PÓLVORA', 128, 46);
    const tex = toTexture(c, { repeat: false });
    const body = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 });
    keg.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.86, 16, 1), [body, M.woodDark, M.woodDark], 0, 0.43, 0));
    for (const y of [0.1, 0.76]) keg.add(mesh(new THREE.TorusGeometry(0.345, 0.02, 5, 20), M.iron, 0, y, 0, Math.PI / 2, 0, 0));
    keg.add(mesh(new THREE.TorusGeometry(0.35, 0.03, 5, 20), M.redPaint, 0, 0.6, 0, Math.PI / 2, 0, 0));
    const fuse = mesh(cylGeo(0.012, 0.012, 0.28, 5), M.rope, 0.1, 0.98, 0, 0, 0, 0.5);
    keg.add(fuse);
    keg.rotation.y = Math.random() * 6;
    this.root.add(keg);
    const blink = this.glow(0xff5020, 1.1);
    blink.position.set(at.x, D.fy + 1.05, at.z);
    Object.assign(D, { keg, blink, hit: new THREE.Vector3(at.x, D.fy + 0.5, at.z), hitR: 0.5, spark: new THREE.Vector3(at.x, D.fy + 1.08, at.z) });
  }

  // ---------------- las ánimas ----------------
  buildAlmas(D) {
    const M = this.M;
    const g = this.g;
    const slabAt = D.pos.clone().addScaledVector(D.front, 0.7);
    const grp = new THREE.Group();
    grp.position.set(slabAt.x, D.fy, slabAt.z);
    grp.rotation.y = Math.atan2(D.front.x, D.front.z);
    const stone = M.towerStone || M.stone;
    grp.add(mesh(boxGeo(2.1, 2.3, 0.32), stone, 0, 1.15, 0));
    grp.add(mesh(boxGeo(2.3, 0.2, 0.42), stone, 0, 0.1, 0));
    // las runas: una por alma, en dos filas
    const runes = [];
    const runeGeo = new THREE.PlaneGeometry(0.26, 0.34);
    for (let k = 0; k < ALMAS_NEED; k++) {
      const mat = new THREE.MeshBasicMaterial({ map: runeTex(k), color: 0x7a58b0, transparent: true, depthWrite: false, toneMapped: false });
      const r = new THREE.Mesh(runeGeo, mat);
      r.position.set(-0.8 + (k % 5) * 0.4, 1.55 - Math.floor(k / 5) * 0.55, 0.165);
      grp.add(r);
      runes.push(mat);
    }
    // una calavera tallada arriba
    grp.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), M.bone || stone, 0, 2.0, 0.12));
    this.root.add(grp);
    // el círculo del piso
    // (adentro del piso: un poco hacia la entrada y lejos de la pared de la escalera)
    const c = D.pos.clone().addScaledVector(D.front, 1.5).addScaledVector(D.wallIn, 3);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xa060ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(ALMAS_R - 0.14, ALMAS_R, 64).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(c.x, D.fy + 0.04, c.z);
    ring.renderOrder = 2;
    this.root.add(ring);
    const halo = this.glow(0xa060ff, 2.6);
    halo.position.set(slabAt.x, D.fy + 1.4, slabAt.z);
    Object.assign(D, { slab: grp, runes, ring, ringMat, halo, center: c, count: 0, glowAt: new THREE.Vector3(slabAt.x, D.fy + 1.3, slabAt.z) });
    D.need = () => ALMAS_NEED + 3 * Math.max(0, (g.net ? g.net.net.count : 1) - 1);
  }

  // ---------------- las chapas ----------------
  buildViento(D, along) {
    const g = this.g;
    const mat = new THREE.MeshStandardMaterial({ map: g.textures.corrugated || null, color: 0x9aa0a6, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1.9, 0.9, 12, 1);
    // ondulada
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 9) * 0.03);
    geo.computeVertexNormals();
    const sheets = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      const off = D.front.clone().multiplyScalar(0.35 + (k % 2) * 0.15);
      m.position.set(D.pos.x + off.x, D.fy + 0.35 + k * 0.42, D.pos.z + off.z);
      m.rotation.set(-0.25 + rnd() * 0.2, (along === 'x' ? 0 : Math.PI / 2) + rnd() * 0.3, rnd() * 0.4);
      this.root.add(m);
      sheets.push({ m, base: m.position.clone(), rot: m.rotation.clone(), ph: Math.random() * 6, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    Object.assign(D, { sheets });
  }

  // ---------------- lo que pasa ----------------
  // Un tiro (del jugador de esta compu): ¿le pegó al nudo o al barril?
  onShot(o, d, maxT) {
    for (const D of this.list) {
      if (D.done || D.door.open || !D.hit) continue;
      const t = raySphere(o, d, D.hit, D.hitR);
      if (t !== null && t <= maxT + 0.3) this.trigger(D);
    }
  }

  onExplosion(pos, radius) {
    for (const D of this.list) {
      if (D.done || D.door.open || D.kind !== 'polvora') continue;
      if (D.hit.distanceTo(pos) < Math.max(2.2, radius * 0.7)) this.trigger(D);
    }
  }

  trigger(D) {
    const g = this.g;
    if (g.net?.guest) {
      g.net.net.send({ t: 'pee', a: 'deb', i: D.i });
      return;
    }
    this.fire(D);
  }

  // (anfitrión) Lo que pidió un invitado.
  onGuest(m) {
    const D = this.list[m.i | 0];
    if (D && (D.kind === 'soga' || D.kind === 'polvora')) this.fire(D);
  }

  // (anfitrión) Se suelta la soga o vuela la pólvora.
  fire(D) {
    const g = this.g;
    if (D.done || D.door.open) return;
    D.done = true;
    g.net?.event('pee', { deb: [D.i, 1] });
    this.show(D);
    const wait = D.kind === 'soga' ? 0.42 : 0.05;
    g.later(wait, () => {
      if (!D.door.open) g.interact.openDoor(D.door);
    });
    if (D.kind === 'polvora') {
      g.weapons.explode(D.hit.clone(), 4.6, 5000, { selfDamage: 70, big: 1.5, color: [1, 0.5, 0.15] });
    }
  }

  // Lo que se ve (en todas las compus).
  show(D) {
    const g = this.g;
    D.done = true;
    D.t = 0;
    if (D.kind === 'soga') {
      g.fx.sparks(D.hit, 1, { x: 0, y: -1, z: 0 }, [1, 0.8, 0.4]);
      g.audio.shell?.();
      D.knot.visible = false;
      D.knotBall.visible = false;
    } else if (D.kind === 'polvora') {
      D.keg.visible = false;
      D.blink.visible = false;
      // (el anfitrión ya la hizo explotar con daño; acá el invitado: humo, ruido y su propio golpe)
      if (g.net?.guest) {
        g.fx.explosion(D.hit, 4.6 * 1.5, [1, 0.5, 0.15]);
        g.audio.explosion(D.hit, 1.5);
        const pd = g.player.pos.distanceTo(D.hit);
        if (pd < 3.7) g.player.damage(70 * (1 - pd / 4.6), D.hit, true);
      }
      g.fx.addShake(0.6);
      g.post?.flash(0.3);
    } else if (D.kind === 'almas') {
      g.fx.explosion(D.glowAt, 2.5, [0.7, 0.4, 1]);
      g.fx.sparkle(D.glowAt, [0.8, 0.5, 1], 60, 2);
      g.audio.shatter?.(D.glowAt);
      g.post?.flash(0.25);
      D.slab.visible = false;
      D.ring.visible = false;
      D.halo.visible = false;
    } else if (D.kind === 'viento') {
      // las chapas se van volando hacia los postigos abiertos
      const trap = this.ee.shutters?.list.find((t) => t.def.n === this.T.levelOf(D.fy) + 1);
      const to = trap ? trap.center : D.pos;
      for (const S of D.sheets) {
        S.vel.subVectors(to, S.m.position).setY(0).normalize().multiplyScalar(9 + Math.random() * 4);
        S.vel.y = 2 + Math.random() * 2;
        S.spin.set(rnd() * 14, rnd() * 14, rnd() * 14);
        S.dly = Math.random() * 0.5;
      }
    }
  }

  // Los postigos de un piso se abrieron (todas las compus).
  onPostigos(n) {
    const g = this.g;
    for (const D of this.list) {
      if (D.kind !== 'viento' || D.done || D.door.open || this.T.levelOf(D.fy) + 1 !== n) continue;
      if (g.net?.guest) {
        // (la puerta la abre el anfitrión; las chapas se van igual)
        this.show(D);
        continue;
      }
      g.later(1.1, () => {
        if (D.done || D.door.open) return;
        D.done = true;
        g.net?.event('pee', { deb: [D.i, 1] });
        this.show(D);
        g.later(0.8, () => {
          if (!D.door.open) g.interact.openDoor(D.door);
        });
      });
    }
  }

  // (anfitrión) Un muerto que cayó: si cayó en el círculo de una losa, un alma.
  onKill(z) {
    const g = this.g;
    if (z.boss) return;
    for (const D of this.list) {
      if (D.kind !== 'almas' || D.done || D.door.open) continue;
      if (Math.abs((z.baseY || 0) - D.fy) > 1.2 || Math.hypot(z.pos.x - D.center.x, z.pos.z - D.center.z) > ALMAS_R) continue;
      D.count++;
      g.fx.soul(z.pos.clone().setY((z.baseY || 0) + 0.2), D.glowAt, [0.75, 0.45, 1]);
      if (D.count >= D.need()) {
        D.done = true;
        g.net?.event('pee', { deb: [D.i, 1] });
        g.later(1.2, () => {
          this.show(D);
          if (!D.door.open) g.interact.openDoor(D.door);
        });
      } else g.net?.event('pee', { deb: [D.i, 0, D.count, +z.pos.x.toFixed(1), +z.pos.z.toFixed(1)] });
      return;
    }
  }

  applyRemote(m) {
    const g = this.g;
    const [i, fire, count, x, z] = m.deb;
    const D = this.list[i];
    if (!D) return;
    if (fire) {
      if (D.done) return;
      if (D.kind === 'almas') {
        D.done = true;
        g.later(1.2, () => this.show(D));
      } else this.show(D);
      return;
    }
    if (count != null) {
      D.count = count;
      if (x != null) g.fx.soul(new THREE.Vector3(x, D.fy + 0.2, z), D.glowAt, [0.75, 0.45, 1]);
    }
  }

  fullState() {
    return this.list.map((D) => (D.kind === 'almas' ? D.count : D.done ? 1 : 0));
  }

  applyState(arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach((v, i) => {
      const D = this.list[i];
      if (D?.kind === 'almas') D.count = v | 0;
    });
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    for (const D of this.list) {
      // abierta sin haberse visto (el que entra tarde): se esconde todo; si
      // se vio, cuando terminó
      if (D.door.open && !D.gone) {
        if (!D.done) this.hide(D);
        else if ((D.t += dt) > 4) this.hide(D);
      }
      if (D.gone) continue;
      if (D.kind === 'soga') {
        if (!D.done) {
          D.load.rotation.y = Math.sin(t * 0.7) * 0.15;
          D.load.position.y = D.fy + 2.45 + Math.sin(t * 1.1) * 0.02;
          D.knot.material.opacity = 0.55 + Math.sin(t * 4) * 0.3;
        } else if (D.load.visible) {
          // cae y revienta contra el escombro
          D.vel += 14 * dt;
          D.load.position.y -= D.vel * dt;
          D.rope.position.y -= D.vel * dt;
          if (D.load.position.y < D.fy + 0.9) {
            D.load.visible = false;
            D.rope.visible = false;
            g.fx.yerbaPuff(D.load.position.clone());
            g.fx.dust(D.load.position.clone(), { x: 0, y: 1, z: 0 }, [0.45, 0.42, 0.36], 20);
            g.audio.bossSlam?.(D.load.position.clone());
            g.fx.addShake(0.25);
          }
        }
      } else if (D.kind === 'polvora' && !D.done) {
        // la mecha chisporrotea (y a veces suena)
        if (Math.random() < 0.5) g.fx.add.spawn(D.spark.x + rnd() * 0.04, D.spark.y, D.spark.z + rnd() * 0.04, rnd() * 1.2, 1 + Math.random(), rnd() * 1.2, { color: [1, 0.7, 0.3], size: 0.03, size1: 0, life: 0.35, gravity: 5 });
        if (Math.random() < dt * 0.6 && g.player.pos.distanceTo(D.spark) < 9) sndArc(g, D.spark, 0.15);
        D.blink.material.opacity = Math.sin(t * 7) > 0 ? 0.75 : 0.15;
      } else if (D.kind === 'almas' && !D.done) {
        const need = D.need();
        D.runes.forEach((m, k) => {
          const on = k < Math.round((D.count / need) * D.runes.length);
          m.color.setHex(on ? 0xe0b0ff : 0x7a58b0);
        });
        D.ringMat.opacity = 0.3 + Math.sin(t * 2.2) * 0.12;
        D.halo.material.opacity = 0.25 + (D.count / need) * 0.45 + Math.sin(t * 2.2) * 0.08;
        if (Math.random() < 0.3) {
          const a = Math.random() * Math.PI * 2;
          g.fx.add.spawn(D.center.x + Math.cos(a) * ALMAS_R, D.fy + 0.1, D.center.z + Math.sin(a) * ALMAS_R, 0, 0.5 + Math.random() * 0.5, 0, { color: [0.6, 0.35, 1], size: 0.08, size1: 0, life: 1.2 });
        }
      } else if (D.kind === 'viento') {
        for (const S of D.sheets) {
          if (!D.done) {
            // tiemblan con el viento de afuera (y se ve el aire que pasa)
            S.m.rotation.x = S.rot.x + Math.sin(t * 9 + S.ph) * 0.03 + Math.max(0, Math.sin(t * 0.7 + S.ph)) * 0.06;
            if (Math.random() < dt * 1.2) g.fx.alpha.spawn(S.m.position.x + rnd() * 1.6, S.m.position.y + rnd() * 0.4, S.m.position.z, rnd() * 0.5, 0.2, D.front.z * 2.5 + rnd(), { color: [0.62, 0.66, 0.72], size: 0.05, size1: 0.18, life: 1, alpha: 0.35 });
            continue;
          }
          if (S.dly > 0) {
            S.dly -= dt;
            S.m.rotation.x = S.rot.x + Math.sin(t * 30 + S.ph) * 0.2;
            continue;
          }
          if (!S.m.visible) continue;
          S.m.position.addScaledVector(S.vel, dt);
          S.vel.y += 1.5 * dt;
          S.m.rotation.x += S.spin.x * dt;
          S.m.rotation.y += S.spin.y * dt;
          S.m.rotation.z += S.spin.z * dt;
          if (!S.clang) {
            S.clang = true;
            sndSlam(g, S.m.position, 0.5);
          }
          if (!inTower(S.m.position.x, S.m.position.z) && S.m.position.distanceTo(D.pos) > 30) S.m.visible = false;
        }
      }
    }
  }

  hide(D) {
    D.gone = true;
    D.done = true;
    if (D.load) D.load.visible = D.rope.visible = D.knot.visible = D.knotBall.visible = false;
    if (D.keg) D.keg.visible = D.blink.visible = false;
    if (D.slab) D.slab.visible = D.ring.visible = D.halo.visible = false;
    if (D.sheets) for (const S of D.sheets) S.m.visible = false;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// Una runa violeta (distinta para cada alma).
function runeTex(k) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 84;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 6;
  let s = k * 977 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(32, 76);
  for (let i = 0; i < 3; i++) {
    const y = 16 + r() * 52;
    ctx.moveTo(32, y);
    ctx.lineTo(r() < 0.5 ? 10 : 54, y + (r() - 0.5) * 24);
  }
  ctx.stroke();
  return toTexture(c, { repeat: false });
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t < 0 ? null : t;
}
