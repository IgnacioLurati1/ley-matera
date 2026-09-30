import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EE } from '../config/map';
import { PLAYER } from '../config/rules';
import { mesh, boxGeo, cylGeo } from './props';
import { sides, archSpans, depthIn, sidePoint, alongOf, swirl, inTower, sndWindLoop, sndSlam, sndCreak } from '../entities/towerKit';

// Los Postigos (la torre, modo historia): la trampa de la torre. En tres pisos
// (EE.postigos) las tres arcadas de un lado están cerradas con postigos
// grandes, trabados por afuera con una tranca. La palanca ($COST) levanta las
// trancas, los postigos se abren de golpe y el remolino chupa para afuera todo
// lo que está de ese lado del piso: los muertos salen volando por los arcos y
// se pierden en el viento; a los jugadores los arrastra hacia la baranda (no
// lastima, pero agachado se aguanta mejor). Después se vuelven a cerrar.
// También vuelan las chapas del escombro de la escalera del piso 12
// (world/towerDebris.js 'viento').
// En línea: el anfitrión la abre ('pee' post) y mueve a los muertos; cada uno
// sufre su arrastre.

const COST = 1000;
// levantar trancas, abrirse, soplar, cerrarse (s desde la palanca)
const LIFT = 0.5;
const OPEN = 0.95;
const WIND = 17;
const CLOSE = 18.6;
const COOL = 35;
// hasta dónde chupa (m desde la cara de la arcada)
const DEPTH = 6.8;
const LEAF_H = 2.72;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const rnd = () => Math.random() - 0.5;
const easeOut = (k) => 1 - (1 - k) ** 3;

export default class TowerShutters {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.geo = this.leafGeo();
    this.list = (EE.postigos || []).map((def, i) => this.build(def, i));
  }

  // La hoja: tablas verticales con marco, travesaños y la diagonal; los
  // herrajes aparte. (Ancho en +x desde la bisagra, alto en +y.)
  leafGeo() {
    const w = 2;
    const wood = [];
    const iron = [];
    for (let k = 0; k < 8; k++) wood.push(new THREE.BoxGeometry(w / 8 - 0.012, LEAF_H, 0.06).translate((k + 0.5) * (w / 8), LEAF_H / 2, 0));
    for (const y of [0.3, LEAF_H / 2, LEAF_H - 0.3]) wood.push(new THREE.BoxGeometry(w - 0.1, 0.16, 0.05).translate(w / 2, y, -0.05));
    const diag = Math.hypot(w - 0.2, LEAF_H / 2 - 0.4);
    wood.push(new THREE.BoxGeometry(diag, 0.13, 0.05).rotateZ(Math.atan2(LEAF_H / 2 - 0.4, w - 0.2)).translate(w / 2, LEAF_H * 0.25 + 0.05, -0.05));
    wood.push(new THREE.BoxGeometry(diag, 0.13, 0.05).rotateZ(Math.atan2(LEAF_H / 2 - 0.4, w - 0.2)).translate(w / 2, LEAF_H * 0.75 - 0.05, -0.05));
    for (const y of [0.3, LEAF_H - 0.3]) {
      iron.push(new THREE.BoxGeometry(0.8, 0.07, 0.02).translate(0.4, y, 0.04));
      iron.push(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).translate(0.02, y, 0.0));
    }
    iron.push(new THREE.TorusGeometry(0.08, 0.014, 6, 14).translate(w - 0.25, LEAF_H / 2, 0.06));
    return { wood: mergeGeometries(wood), iron: mergeGeometries(iron) };
  }

  build(def, i) {
    const g = this.g;
    const M = g.world.M;
    const s = def.side;
    const S = sides()[s];
    const y = this.T.yOf(def.n - 1);
    const woodMat = new THREE.MeshStandardMaterial({ map: M.woodDark.map, color: 0x8a6c48, roughness: 0.9 });
    const leaves = [];
    const bars = [];
    // girar la hoja: su ancho (+x) va a lo largo del lado, y abre hacia afuera
    const baseRot = S.along === 'x' ? 0 : -Math.PI / 2;
    for (const [a0, a1] of archSpans()) {
      for (const [end, sgn] of [[a0, 1], [a1, -1]]) {
        const hinge = new THREE.Group();
        sidePoint(s, end, -1.03, y + 0.1, tmpV);
        hinge.position.copy(tmpV);
        const leaf = new THREE.Group();
        leaf.add(new THREE.Mesh(this.geo.wood, woodMat), new THREE.Mesh(this.geo.iron, M.iron));
        leaf.children.forEach((m) => {
          m.castShadow = true;
          m.receiveShadow = true;
        });
        // (la de la punta abre al revés: se da vuelta)
        leaf.scale.x = sgn;
        leaf.scale.z = sgn;
        hinge.add(leaf);
        hinge.rotation.y = baseRot;
        this.root.add(hinge);
        // (sgn: para qué lado cierra; para qué lado abre: SIDE_OUT)
        leaves.push({ hinge, sgn, base: baseRot, ph: Math.random() * 6 });
      }
      // la tranca de afuera, en sus dos soportes
      const mid = (a0 + a1) / 2;
      sidePoint(s, mid, -1.12, y + 1.45, tmpV);
      const bar = new THREE.Group();
      bar.position.copy(tmpV);
      bar.rotation.y = baseRot;
      const beam = mesh(boxGeo(a1 - a0 + 0.5, 0.16, 0.12), M.woodDark, 0, 0, 0);
      bar.add(beam);
      this.root.add(bar);
      bars.push(bar);
      for (const e of [a0 - 0.1, a1 + 0.1]) {
        sidePoint(s, e, -1.09, y + 1.45, tmpV);
        const br = mesh(boxGeo(0.12, 0.3, 0.14), M.iron, tmpV.x, tmpV.y - 0.06, tmpV.z, 0, baseRot, 0);
        this.root.add(br);
      }
    }
    // la palanca, con su cartel
    const L = def.lever;
    const a = g.world.wallAnchor(L.cell, L.face, 0.08);
    const grp = new THREE.Group();
    grp.position.set(a.x, L.y, a.z);
    grp.rotation.y = a.rot;
    grp.add(mesh(boxGeo(0.55, 0.75, 0.14), M.woodDark, 0, 1.4, 0));
    const lever = new THREE.Group();
    lever.position.set(0, 1.35, 0.09);
    lever.add(mesh(cylGeo(0.02, 0.02, 0.36, 8), M.iron, 0, 0.18, 0));
    lever.add(mesh(cylGeo(0.04, 0.04, 0.12, 10), M.redPaint, 0, 0.37, 0, 0, 0, Math.PI / 2));
    lever.rotation.x = Math.PI - 0.5;
    grp.add(lever);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x002030, emissive: 0x40c8ff, emissiveIntensity: 1.5 }));
    lamp.position.set(0.18, 1.68, 0.08);
    grp.add(lamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ map: signTex(), roughness: 1 }));
    sign.position.set(0, 1.9, 0.075);
    grp.add(sign);
    this.root.add(grp);
    const trap = { i, def, s, y, leaves, bars, lever, lamp, state: 'idle', t: 0, by: null, snd: null, center: sidePoint(s, 30, 3, y + 1.4) };
    g.interact.add({
      kind: 'trap',
      pos: new THREE.Vector3(a.x, L.y + 1.3, a.z),
      radius: 1.9,
      prompt: () => {
        if (trap.state === 'idle') return `abrir ${def.name}`;
        if (trap.state === 'cool') return { text: 'Recién se cerraron', noCost: true, info: true };
        return null;
      },
      // (al invitado le llega la respuesta después del aviso: recién abierta, igual cuesta)
      cost: () => (trap.state === 'idle' || (trap.state === 'on' && trap.t < 2) ? COST : 1),
      use: () => {
        if (trap.state !== 'idle') return false;
        const by = g.net?.useFrom ?? g.net?.id ?? null;
        this.fire(trap, by);
        g.net?.event('pee', { post: i + 1 });
        return true;
      },
    });
    return trap;
  }

  fire(trap, by = null) {
    const g = this.g;
    if (trap.state !== 'idle') return;
    trap.state = 'on';
    trap.t = 0;
    trap.by = by;
    trap.took = new Map();
    trap.lever.rotation.x = 0.5;
    trap.lamp.material.emissive.set(0x20ff40);
    sndCreak(g, trap.center, 0.6);
    g.audio.chain?.(trap.center);
    // las chapas de la escalera de este piso (si las hay)
    this.ee.debris?.onPostigos?.(trap.def.n);
  }

  applyRemote(m) {
    const trap = this.list[(m.post | 0) - 1];
    if (trap) this.fire(trap);
  }

  fullState() {
    return this.list.map((t) => (t.state === 'idle' ? 0 : 1));
  }

  update(dt) {
    const g = this.g;
    const t0 = g.time;
    for (const trap of this.list) {
      if (trap.state === 'cool') {
        trap.t -= dt;
        if (trap.t <= 0) {
          trap.state = 'idle';
          trap.lever.rotation.x = Math.PI - 0.5;
          trap.lamp.material.emissive.set(0x40c8ff);
        }
        continue;
      }
      if (trap.state !== 'on') continue;
      const prev = trap.t;
      trap.t += dt;
      const t = trap.t;
      // las trancas suben
      const lift = Math.min(1, t / LIFT) * (t < CLOSE ? 1 : Math.max(0, 1 - (t - CLOSE) / 0.4));
      for (const b of trap.bars) b.position.y = trap.y + 1.45 + lift * 0.9;
      // las hojas: se abren de golpe, se sacuden con el viento y se cierran
      let open = 0;
      if (t > LIFT) open = easeOut(Math.min(1, (t - LIFT) / (OPEN - LIFT)));
      if (t > WIND) open = 1 - Math.min(1, (t - WIND) / (CLOSE - WIND)) ** 2;
      const blowing = t > OPEN * 0.8 && t < WIND;
      for (const L of trap.leaves) {
        const flap = blowing ? Math.sin(t0 * 7 + L.ph) * 0.07 + Math.sin(t0 * 2.3 + L.ph) * 0.05 : 0;
        // 0 cerrada; abierta queda casi pegada a la fachada (2.75 rad)
        L.hinge.rotation.y = L.base + L.sgn * SIDE_OUT[trap.s] * (open * 2.7 + flap);
      }
      if (prev < LIFT && t >= LIFT) {
        sndSlam(g, trap.center, 1.3);
        g.fx.addShake(this.near(trap) ? 0.35 : 0);
        for (const [a0, a1] of archSpans()) {
          sidePoint(trap.s, (a0 + a1) / 2, 0.3, trap.y + 1.2, tmpV);
          g.fx.dust(tmpV.clone(), { x: sides()[trap.s].n[0], y: 0.3, z: sides()[trap.s].n[1] }, [0.5, 0.48, 0.44], 14);
        }
        trap.snd = sndWindLoop(g, trap.center, 1.15, { whistle: 1500 });
      }
      if (blowing) this.suck(trap, dt);
      if (prev < WIND && t >= WIND) {
        trap.snd?.stop(1.4);
        trap.snd = null;
        sndCreak(g, trap.center, 1.4);
      }
      if (prev < CLOSE && t >= CLOSE) sndSlam(g, trap.center, 1);
      if (t >= CLOSE + 0.4) {
        trap.state = 'cool';
        trap.t = COOL;
        trap.lamp.material.emissive.set(0xffa010);
        for (const b of trap.bars) b.position.y = trap.y + 1.45;
      }
    }
  }

  // ¿El jugador está en el piso de esa trampa?
  near(trap) {
    const p = this.g.player.pos;
    return inTower(p.x, p.z) && Math.abs(p.y - trap.y) < 1.5;
  }

  inStrip(trap, x, z, y) {
    return Math.abs(y - trap.y) < 1.2 && inTower(x, z) && depthIn(trap.s, x, z) < DEPTH;
  }

  // Lo que chupa el remolino: los muertos, el jugador y lo que vuela.
  suck(trap, dt) {
    const g = this.g;
    const s = trap.s;
    const S = sides()[s];
    // el jugador (cada uno el suyo)
    const p = g.player;
    if (p.alive && !p.downed && !p.ride && this.inStrip(trap, p.pos.x, p.pos.z, p.pos.y)) {
      const d = depthIn(s, p.pos.x, p.pos.z);
      const k = (1 - d / DEPTH) * 0.6 + 0.4;
      const sp = 2.4 * k * (p.crouching ? 0.3 : p.onGround ? 1 : 1.3) * dt;
      p.pos.x -= S.n[0] * sp;
      p.pos.z -= S.n[1] * sp;
      g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
      g.fx.addShake(dt * 0.35);
    }
    // los muertos (anfitrión)
    if (!g.net?.guest) {
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || !this.inStrip(trap, z.pos.x, z.pos.z, z.baseY || 0)) continue;
        if (!['chase', 'attack', 'rise', 'stairs'].includes(z.state)) continue;
        const held = (trap.took.get(z.id) || 0) + dt;
        trap.took.set(z.id, held);
        const d = depthIn(s, z.pos.x, z.pos.z);
        if (z.boss) {
          // al jefe lo arrastra un poco nomás
          z.pos.x -= S.n[0] * 0.9 * dt;
          z.pos.z -= S.n[1] * 0.9 * dt;
          continue;
        }
        // hacia el arco más cercano
        const a = alongOf(s, z.pos.x, z.pos.z);
        let best = archSpans()[0];
        for (const sp of archSpans()) if (Math.abs((sp[0] + sp[1]) / 2 - a) < Math.abs((best[0] + best[1]) / 2 - a)) best = sp;
        const ca = Math.max(best[0] + 0.6, Math.min(best[1] - 0.6, a));
        sidePoint(s, ca, -0.5, 0, tmpV);
        const dx = tmpV.x - z.pos.x;
        const dz = tmpV.z - z.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        const sp = (2.5 + held * 7) * dt;
        z.pos.x += (dx / dd) * Math.min(dd, sp);
        z.pos.z += (dz / dd) * Math.min(dd, sp);
        z.yaw += dt * held * 4;
        // (se inclina como si lo arrancaran del piso)
        if (Math.random() < 0.3) g.fx.alpha.spawn(z.pos.x + rnd() * 0.4, (z.baseY || 0) + 0.1, z.pos.z + rnd() * 0.4, -S.n[0] * 3, 0.5, -S.n[1] * 3, { color: [0.45, 0.42, 0.36], size: 0.06, size1: 0.2, life: 0.5, alpha: 0.5 });
        if ((d < 1.2 && a > best[0] + 0.2 && a < best[1] - 0.2) || held > 2.3) this.ee.flyers.suckOut(z, s, { by: trap.by });
      }
    }
    // lo que vuela: polvo, yerba y papeles que corren a los arcos y se pierden afuera
    if (!this.near(trap)) return;
    for (const [a0, a1] of archSpans()) {
      for (let i = 0; i < 2; i++) {
        const a = a0 + Math.random() * (a1 - a0);
        const d = 0.5 + Math.random() * DEPTH;
        sidePoint(s, a + rnd() * 3, d, trap.y + 0.15 + Math.random() * 2.2, tmpV);
        sidePoint(s, a, -3, tmpV.y + 0.6, tmpW);
        tmpW.sub(tmpV).normalize().multiplyScalar(7 + Math.random() * 8);
        if (Math.random() < 0.6) g.fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, tmpW.x, tmpW.y, tmpW.z, { color: Math.random() < 0.5 ? [0.5, 0.47, 0.4] : [0.36, 0.46, 0.2], size: 0.04 + Math.random() * 0.05, size1: 0.12, life: 1.2, alpha: 0.55 });
        else g.fx.beam(tmpV, tmpW.multiplyScalar(0.35).add(tmpV), { color: 0x7d8ea6, width: 0.02, life: 0.1 });
      }
      // afuera: se lo lleva el giro
      sidePoint(s, a0 + Math.random() * (a1 - a0), -2, trap.y + 0.5 + Math.random() * 2.5, tmpV);
      swirl(tmpV.x, tmpV.z, tmpW).multiplyScalar(14);
      g.fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, tmpW.x - S.n[0] * 6, 1 + Math.random() * 2, tmpW.z - S.n[1] * 6, { color: [0.55, 0.55, 0.55], size: 0.08, size1: 0.3, life: 1.4, alpha: 0.35 });
    }
  }

  dispose() {
    for (const t of this.list) t.snd?.stop(0.2);
    this.root.removeFromParent();
  }
}

// Para qué lado gira la hoja (según el lado) para abrirse hacia afuera.
const SIDE_OUT = [1, 1, -1, -1];

function signTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 100;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c3a5a';
  ctx.fillRect(0, 0, 256, 100);
  ctx.fillStyle = '#e8f0f8';
  ctx.font = 'bold 32px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¡VIENTO!', 128, 44);
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(`$${COST} · POSTIGOS`, 128, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
