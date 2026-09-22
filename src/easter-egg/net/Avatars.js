import * as THREE from 'three';
import { makePose, solvePose, PART_COUNT } from '../entities/skeleton';

// Los otros jugadores: un gaucho con poncho de color, boina y su mate en la
// mano, animado con el mismo esqueleto que los zombies. Arriba lleva el nombre.

const PONCHOS = [0xa8231c, 0x1e5aa8, 0x1f7a3a, 0xc9a02a];

export default class Avatars {
  constructor(game, session) {
    this.g = game;
    this.s = session;
    this.list = new Map();
    this.root = new THREE.Group();
    game.scene.add(this.root);
  }

  materials(id) {
    const T = this.g.textures;
    const c = PONCHOS[id % PONCHOS.length];
    const std = (color, map) => new THREE.MeshStandardMaterial({ color, map: map || null, roughness: 0.85 });
    return {
      // piel sana: la textura de los zombies (manchada) no va en los vivos
      skin: std(0xd29a74),
      poncho: std(c, T.burlap),
      pants: std(0x3a3a34, T.zpants),
      boots: std(0x241a12),
      hat: std(0x2a2620),
      mate: std(0x8a6038, T.gourd),
      metal: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }),
    };
  }

  add(r) {
    if (this.list.has(r.id)) return;
    const G = this.g.zombies.geo;
    const M = this.materials(r.id);
    const group = new THREE.Group();
    const parts = [];
    const put = (geo, mat, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      m.part = i;
      parts.push(m);
      group.add(m);
    };
    put(G.pelvis, M.pants, 0);
    put(G.torso, M.poncho, 1);
    put(G.head, M.skin, 2);
    put(G.uarm, M.poncho, 3);
    put(G.uarm, M.poncho, 4);
    put(G.farm, M.skin, 5);
    put(G.farm, M.skin, 6);
    put(G.thigh, M.pants, 7);
    put(G.thigh, M.pants, 8);
    put(G.shin, M.pants, 9);
    put(G.shin, M.pants, 10);
    put(G.foot, M.boots, 11);
    put(G.foot, M.boots, 12);
    // la boina ya viene corrida hacia arriba: va pegada a la cabeza (parte 2),
    // no al hueco del sombrero (13), que la dejaba flotando
    put(G.boina, M.hat, 2);
    // el mate en la mano derecha
    const mate = new THREE.Group();
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.mate);
    gourd.scale.set(1, 1.15, 1);
    mate.add(gourd);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6), M.metal);
    straw.position.set(0.02, 0.08, 0);
    straw.rotation.z = -0.25;
    mate.add(straw);
    const hand = new THREE.Object3D();
    hand.add(mate);
    mate.position.set(0, -0.2, 0.06);
    hand.matrixAutoUpdate = false;
    group.add(hand);
    // cartelito con el nombre
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(r.name || 'Jugador'), transparent: true, depthTest: false, sizeAttenuation: true }));
    tag.scale.set(1.2, 0.3, 1);
    tag.renderOrder = 10;
    tag.visible = !r.noTag;
    group.add(tag);
    this.root.add(group);
    const fake = {
      P: makePose(),
      phase: Math.random() * 6,
      speedType: 'walk',
      limp: 0,
      headTilt: 0,
      armOff: 0,
      slot: r.id,
      scale: 1,
    };
    this.list.set(r.id, { r, group, parts, hand, tag, fake, M, mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()), name: r.name });
  }

  remove(id) {
    const a = this.list.get(id);
    if (!a) return;
    a.group.removeFromParent();
    a.tag.material.map.dispose();
    a.tag.material.dispose();
    for (const m of Object.values(a.M)) m.dispose();
    this.list.delete(id);
  }

  // El mundo se rearmó (partida nueva): los muñecos pasan a la escena nueva,
  // con las mallas de los zombies nuevos.
  rebuild() {
    const rs = [...this.list.values()].map((a) => a.r);
    for (const id of [...this.list.keys()]) this.remove(id);
    this.root.removeFromParent();
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    for (const r of rs) this.add(r);
  }

  update(dt) {
    const g = this.g;
    for (const a of this.list.values()) {
      const r = a.r;
      const P = a.fake.P;
      if (a.name !== r.name && r.name) {
        a.name = r.name;
        a.tag.material.map.dispose();
        a.tag.material.map = nameTexture(r.name);
      }
      // los que esperan la próxima ronda no se ven (como en el original)
      a.group.visible = !r.dead || !!r.corpse;
      if (!a.group.visible) continue;
      // pose: caminando, quieto o caído
      if (r.downed || r.dead || r.corpse) {
        g.zombies.poseCrawl(a.fake, dt * (r.corpse || r.dead ? 0 : 0.6));
        P.rootPitch = 1.3;
        P.rootY = 0.02;
      } else {
        P.rootPitch = 0;
        P.rootY = Math.max(0, r.pos.y);
        a.fake.speedType = r.speed > 5 ? 'run' : 'walk';
        if (r.moving || r.speed > 0.4) g.zombies.poseGait(a.fake, dt, Math.max(1, r.speed), g.time);
        else g.zombies.poseIdle(a.fake, g.time);
        // parado como gaucho: brazos abajo y el mate adelante
        P.torsoP = r.crouch ? 0.55 : 0.05;
        P.hipY = r.crouch ? 0.62 : 0.93;
        P.headP = -r.pitch * 0.5;
        P.shRp = -0.55;
        P.elR = -1.25;
        P.shLp = -0.25 + (r.moving ? Math.sin(a.fake.phase) * 0.35 : 0);
        P.elL = -0.35;
      }
      solvePose(a.mats, r.pos.x, r.pos.z, r.yaw + Math.PI, 1, P);
      for (const m of a.parts) {
        m.matrix.copy(a.mats[m.part]);
        m.matrixWorldNeedsUpdate = true;
      }
      a.hand.matrix.copy(a.mats[6]);
      a.hand.matrixWorldNeedsUpdate = true;
      a.hand.visible = !r.downed && !r.dead && !r.corpse;
      a.tag.position.set(r.pos.x, r.pos.y + (r.downed ? 0.9 : 2.05), r.pos.z);
      const d = a.tag.position.distanceTo(g.camera.position);
      a.tag.material.opacity = d > 34 ? 0 : 0.95;
      a.tag.material.color.setRGB(1, r.downed ? 0.4 : 1, r.downed ? 0.4 : 1);
    }
  }

  dispose() {
    for (const id of [...this.list.keys()]) this.remove(id);
    this.root.removeFromParent();
  }
}

function nameTexture(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Special Elite", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = '#f0e6cc';
  ctx.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
