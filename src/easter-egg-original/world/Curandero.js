import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { ATTIC } from './Attic';

// La mesa del curandero, arriba en el altillo, y las tres piezas del Mate del
// Chiquitijuein. Las piezas son del equipo (cualquiera las junta) y están a la
// vista, con un haz de luz verde que se ve de lejos. El mate lo tiene uno solo
// a la vez: si el que lo tiene se muere, se puede volver a armar.

const PARTS = [
  { id: 'calabaza', name: 'Calabaza de la Salamanca', pos: [48.6, 0.03, 28.4] },
  { id: 'bombilla', name: 'Bombilla del finado', pos: [30.5, 0.03, 37] },
  { id: 'yerba', name: 'Yerba de luna llena', pos: [46.4, 0.03, 40.8] },
];
const BENCH = { x: 48.5, z: 45.1 };
const CRAFT_TIME = 1.4;
export const LUZ_WEAPON = 'luzmala';

const tmpV = new THREE.Vector3();

export default class Curandero {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.parts = {};
    this.claim = null; // a quién se le dio recién (hasta que llegue su aviso)
    this.buildParts();
    this.buildBench();
  }

  mats() {
    if (this.M) return this.M;
    const T = this.g.textures;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
    this.M = {
      gourd: std({ map: T.gourd, color: 0x5a3a24 }),
      silver: std({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }),
      yerba: std({ map: T.yerba, color: 0xb8e890, emissive: 0x2a6a1a, emissiveIntensity: 0.8 }),
      cloth: std({ color: 0x3a1a2a }),
      wood: std({ map: T.planksDark, color: 0x8a6a50 }),
      candle: std({ color: 0xefe6cc }),
      jar: new THREE.MeshStandardMaterial({ color: 0x9ae07a, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x1a5a14, emissiveIntensity: 0.6 }),
      bone: std({ color: 0xd8ccb0 }),
      flame: new THREE.SpriteMaterial({ map: T.dot, color: 0xffb060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      halo: new THREE.SpriteMaterial({ map: T.dot, color: 0x8aff6a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }),
    };
    return this.M;
  }

  // ---------------- piezas ----------------
  buildParts() {
    const g = this.g;
    const M = this.mats();
    for (const def of PARTS) {
      const obj = new THREE.Group();
      obj.position.set(...def.pos);
      if (def.id === 'calabaza') {
        const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M.gourd);
        gourd.scale.set(1, 1.15, 1);
        gourd.position.y = 0.15;
        obj.add(gourd);
        obj.add(mesh(cylGeo(0.06, 0.07, 0.03, 14), M.silver, 0, 0.3, 0));
      } else if (def.id === 'bombilla') {
        obj.add(mesh(cylGeo(0.008, 0.008, 0.28, 8), M.silver, 0, 0.03, 0, 0, 0, Math.PI / 2));
        obj.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), M.silver, 0.14, 0.03, 0));
      } else {
        // bolsita de yerba que brilla un poco
        obj.add(mesh(boxGeo(0.2, 0.26, 0.12), M.yerba, 0, 0.13, 0));
      }
      this.root.add(obj);
      const fx = new THREE.Group();
      fx.position.set(...def.pos);
      const halo = new THREE.Sprite(M.halo);
      halo.scale.setScalar(1.2);
      halo.position.y = 0.25;
      fx.add(halo);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, 3.4, 10, 1, true), g.activities.partBeamMat().clone());
      beam.material.color.set(0x7aff5a);
      beam.position.y = 1.7;
      fx.add(beam);
      this.root.add(fx);
      const part = { def, obj, fx, beam, taken: false };
      this.parts[def.id] = part;
      g.interact.add({
        kind: 'lmpart',
        pos: new THREE.Vector3(def.pos[0], def.pos[1] + 0.3, def.pos[2]),
        radius: 1.8,
        prompt: () => (part.taken ? null : { text: `agarrar ${def.name.toLowerCase()} (pieza del Mate del Chiquitijuein)`, noCost: true }),
        cost: () => 0,
        use: () => {
          if (part.taken) return false;
          this.takePart(def.id);
          return true;
        },
      });
    }
  }

  takePart(id, remote = false) {
    const g = this.g;
    const part = this.parts[id];
    if (!part || part.taken) return;
    part.taken = true;
    part.obj.visible = false;
    part.fx.visible = false;
    g.audio.shell();
    if (!remote) g.net?.event('lmpart', { id });
    const got = this.got();
    g.hud.toast(`Pieza del Mate del Chiquitijuein: ${got} de ${PARTS.length}`);
    if (got === PARTS.length) g.hud.subtitle('Tenés todo para el Mate del Chiquitijuein. Armalo en la mesa del curandero, arriba en el altillo de la oficina.', 5);
  }

  got() {
    return Object.values(this.parts).filter((p) => p.taken).length;
  }

  // ---------------- mesa ----------------
  buildBench() {
    const g = this.g;
    const M = this.mats();
    const y = ATTIC.y;
    const b = new THREE.Group();
    b.position.set(BENCH.x, y, BENCH.z);
    b.add(mesh(boxGeo(1.8, 0.07, 0.7), M.wood, 0, 0.86, 0));
    for (const [a, c] of [[-0.82, -0.28], [0.82, -0.28], [-0.82, 0.28], [0.82, 0.28]]) b.add(mesh(boxGeo(0.07, 0.86, 0.07), M.wood, a, 0.43, c));
    // mantel oscuro, frascos verdes, velas, huesitos
    b.add(mesh(boxGeo(1.2, 0.01, 0.6), M.cloth, -0.1, 0.9, 0));
    for (const [x, h] of [[-0.7, 0.22], [-0.52, 0.16], [0.72, 0.26]]) b.add(mesh(cylGeo(0.06, 0.06, h, 12), M.jar, x, 0.9 + h / 2, -0.18));
    this.flames = [];
    for (const [x, zz, h] of [[-0.3, 0.2, 0.18], [0.35, 0.18, 0.24], [0.55, -0.2, 0.14]]) {
      b.add(mesh(cylGeo(0.018, 0.02, h, 8), M.candle, x, 0.9 + h / 2, zz));
      const f = new THREE.Sprite(M.flame);
      f.position.set(x, 0.9 + h + 0.03, zz);
      f.scale.setScalar(0.07);
      b.add(f);
      this.flames.push(f);
    }
    b.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), M.bone, 0.05, 0.96, -0.15));
    // el mate armado a medias en el centro: se completa cuando están las piezas
    this.proto = new THREE.Group();
    this.proto.position.set(0.05, 0.92, 0.05);
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), M.gourd);
    gourd.scale.set(1, 1.15, 1);
    gourd.position.y = 0.07;
    this.proto.add(gourd);
    this.protoGlow = new THREE.Sprite(M.halo);
    this.protoGlow.scale.setScalar(0.5);
    this.protoGlow.position.y = 0.16;
    this.proto.add(this.protoGlow);
    b.add(this.proto);
    this.root.add(b);
    g.world.addBox([BENCH.x - 0.95, y, BENCH.z - 0.4, BENCH.x + 0.95, y + 0.95, BENCH.z + 0.4], { kind: 'prop' });
    g.interact.add({
      kind: 'lmbench',
      pos: new THREE.Vector3(BENCH.x, y + 1.1, BENCH.z),
      radius: 2.2,
      hold: true,
      holdTime: CRAFT_TIME,
      prompt: () => {
        const who = this.holder();
        if (who === 'me') return null;
        if (who) return { text: `El Mate del Chiquitijuein lo tiene ${who}`, noCost: true, info: true };
        const missing = PARTS.length - this.got();
        if (missing) return { text: `Mesa del curandero: ${missing === 1 ? 'falta 1 pieza' : `faltan ${missing} piezas`} del Mate del Chiquitijuein`, noCost: true, info: true };
        return { text: 'armar el Mate del Chiquitijuein', noCost: true, hold: true };
      },
      cost: () => (this.available() ? 0 : 1),
      use: () => {
        if (!this.claimFor(this.g.net?.id ?? 0)) return false;
        this.craftFx();
        g.weapons.give(LUZ_WEAPON);
        g.hud.achievement('Mate del Chiquitijuein', 'Lo armaste en la mesa del curandero');
        return true;
      },
    });
  }

  craftFx() {
    const g = this.g;
    const p = tmpV.set(BENCH.x, ATTIC.y + 1.1, BENCH.z);
    g.fx.flash(p, 0x8aff6a, 30, 0.4, 8);
    g.fx.sparkle(p, [0.6, 1, 0.4], 14, 0.5);
    g.audio.powerupGrab();
  }

  // Quién lo tiene: 'me', el nombre de otro, o null si está libre.
  holder() {
    const g = this.g;
    if (g.weapons?.hasLuz?.()) return 'me';
    if (g.net) {
      for (const r of g.net.remote.values()) {
        if (!r.hasLuz || r.dead) continue;
        // ya llegó su aviso: de acá en más manda eso
        if (this.claim?.id === r.id) this.claim = null;
        return r.name;
      }
      const c = this.claim;
      if (c && g.time < c.until && !g.net.remote.get(c.id)?.dead) return c.id === g.net.id ? 'me' : g.net.nameOf(c.id);
    }
    return null;
  }

  available() {
    return this.got() === PARTS.length && !this.holder();
  }

  // El anfitrión (o el solitario) entrega el mate: uno solo a la vez.
  claimFor(id) {
    if (!this.available()) return false;
    this.claim = { id, until: this.g.time + 4 };
    this.g.net?.event('lmcraft', { id });
    return true;
  }

  update(dt) {
    const g = this.g;
    const pulse = 0.75 + Math.sin(g.time * 3.3) * 0.25;
    const M = this.mats();
    M.halo.opacity = 0.5 + pulse * 0.4;
    for (const p of Object.values(this.parts)) {
      if (p.taken) continue;
      p.beam.material.opacity = 0.2 + pulse * 0.15;
      p.obj.rotation.y += dt * 0.7;
      if (Math.random() < dt * 5) g.fx.sparkle(tmpV.set(p.def.pos[0], p.def.pos[1] + 0.3, p.def.pos[2]), [0.6, 1, 0.45], 1, 0.35);
    }
    for (const f of this.flames) f.scale.setScalar(0.06 + Math.random() * 0.02);
    // el mate de la mesa brilla más cuantas más piezas hay
    this.protoGlow.scale.setScalar(0.2 + this.got() * 0.18);
    this.proto.visible = !this.holder();
    g.hud.setCraft(Object.values(this.parts).map((p) => p.taken));
  }
}
