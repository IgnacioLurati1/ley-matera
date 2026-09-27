import * as THREE from 'three';
import { makePose, solvePose, PART_COUNT } from '../entities/skeleton';

// Los otros jugadores: un gaucho con sombrero, cara con bigote, poncho de
// color que se bambolea al moverse y su mate en la mano, animado con el mismo
// esqueleto que los zombies. Arriba lleva el nombre.

const PONCHOS = [0xa8231c, 0x1e5aa8, 0x1f7a3a, 0xc9a02a, 0x6a2a8a];
const tmpRot = new THREE.Matrix4();
const tmpEul = new THREE.Euler();

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
      // la textura de arpillera oscurece: el color base va más vivo
      poncho: std(new THREE.Color(c).multiplyScalar(1.7), T.burlap),
      pants: std(0x3a3a34, T.zpants),
      boots: std(0x241a12),
      hat: std(0x2a2620),
      band: std(0x8a1a14),
      hair: std(0x1e1712),
      eye: new THREE.MeshBasicMaterial({ color: 0x120c08 }),
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
    // cosas pegadas a un hueso con un desplazamiento propio (sombrero, cara, poncho)
    const extras = [];
    const attach = (obj, part, x, y, z) => {
      obj.matrixAutoUpdate = false;
      group.add(obj);
      extras.push({ obj, part, off: new THREE.Matrix4().makeTranslation(x, y, z) });
      return obj;
    };
    // sombrero de ala ancha con cinta colorada
    const hat = new THREE.Group();
    hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 20), M.hat));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.11, 16), M.hat);
    crown.position.y = 0.06;
    hat.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.024, 16), M.band);
    band.position.y = 0.02;
    hat.add(band);
    attach(hat, 2, 0, 0.125, -0.005);
    // cara: ojos, nariz, bigote y pelo en la nuca
    const face = new THREE.Group();
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), M.eye);
      eye.position.set(s * 0.045, 0.025, 0.12);
      face.add(eye);
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.02), M.hair);
      mus.position.set(s * 0.028, -0.03, 0.125);
      mus.rotation.z = s * -0.25;
      face.add(mus);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.035), M.skin);
    nose.position.set(0, 0, 0.13);
    face.add(nose);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), M.hair);
    hair.position.set(0, 0.07, -0.115);
    face.add(hair);
    attach(face, 2, 0, 0, 0);
    // poncho: cuelga de los hombros y se bambolea (el pivote queda en el cuello)
    const poncho = new THREE.Group();
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.36, 0.5, 14, 1, true), M.poncho);
    cape.material.side = THREE.DoubleSide;
    cape.position.y = -0.25;
    cape.scale.set(1, 1, 0.72);
    poncho.add(cape);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), M.poncho);
    collar.rotation.x = Math.PI / 2;
    poncho.add(collar);
    const ponchoAt = attach(poncho, 1, 0, 0.27, 0);
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
    this.list.set(r.id, { r, group, parts, hand, tag, fake, M, extras, poncho: ponchoAt, sway: new THREE.Vector2(), lastYaw: r.yaw, mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()), name: r.name });
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
      // el poncho se queda atrás al correr y se abre al girar
      let dy = r.yaw - a.lastYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.lastYaw = r.yaw;
      const turn = dt > 0 ? dy / dt : 0;
      const tx = -Math.min(0.5, (r.speed || 0) * 0.08) + Math.sin(g.time * 3 + r.id) * 0.03;
      const tz = Math.max(-0.35, Math.min(0.35, -turn * 0.08));
      a.sway.x += (tx - a.sway.x) * Math.min(1, dt * 6);
      a.sway.y += (tz - a.sway.y) * Math.min(1, dt * 6);
      for (const e of a.extras) {
        e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
        if (e.obj === a.poncho) e.obj.matrix.multiply(tmpRot.makeRotationFromEuler(tmpEul.set(a.sway.x, 0, a.sway.y)));
        e.obj.matrixWorldNeedsUpdate = true;
      }
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
