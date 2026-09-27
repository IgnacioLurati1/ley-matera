import * as THREE from 'three';
import { makePose, solvePose, PART_COUNT } from '../entities/skeleton';
import { swimPose } from '../entities/zombieGaits';
import { shieldModel } from '../world/shieldModels';

// Los otros jugadores: un gaucho con sombrero, cara con bigote, poncho de
// color que se bambolea al moverse y su mate en la mano, animado con el mismo
// esqueleto que los zombies. Arriba lleva el nombre.

const PONCHOS = [0xa8231c, 0x1e5aa8, 0x1f7a3a, 0xc9a02a, 0x6a2a8a];
// la silueta de cada compañero a través de las paredes (el color de su poncho, más vivo)
const XRAY = [0xff5a48, 0x5aa8ff, 0x5ae07a, 0xffd24a, 0xc070ff];
// lo que tarda en desangrarse un caído (Player: bleed)
const BLEED = 30;
const tmpRot = new THREE.Matrix4();
const tmpEul = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const SHIELD_TILT = new THREE.Matrix4().makeRotationX(0.12).multiply(new THREE.Matrix4().makeRotationY(Math.PI));

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
    // compañeros de partida: la misma malla de un solo color, dibujada solo
    // donde algo la tapa (así se los ve a través de las paredes, como en el original)
    let xray = null;
    const xparts = [];
    if (this.team) {
      xray = new THREE.MeshBasicMaterial({ color: XRAY[r.id % XRAY.length], transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
      for (const m of [...parts, hat.children[0], crown, cape]) {
        const x = new THREE.Mesh(m.geometry, xray);
        x.matrixAutoUpdate = false;
        x.renderOrder = 9;
        x.visible = false;
        m.add(x);
        xparts.push(x);
      }
    }
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
    this.list.set(r.id, { r, group, parts, hand, tag, fake, M, extras, poncho: ponchoAt, sway: new THREE.Vector2(), lastYaw: r.yaw, mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()), name: r.name, xray, xparts, xk: 0 });
  }

  // El escudo armado colgado en la espalda (del torso, mirando para atrás,
  // con la parte de abajo un poco separada por el poncho). Se arma la primera
  // vez que hace falta; si se rompe, se esconde.
  backShield(a, on) {
    a.shieldOn = on;
    if (on && !a.shield) {
      const s = shieldModel(this.g.world.M, this.g.mapId);
      s.traverse((o) => {
        o.castShadow = false;
      });
      s.matrixAutoUpdate = false;
      a.group.add(s);
      const off = new THREE.Matrix4().makeTranslation(0, -0.02, -0.2 - s.userData.back * 0.9).multiply(SHIELD_TILT).multiply(new THREE.Matrix4().makeScale(0.9, 0.9, 0.9));
      a.extras.push({ obj: s, part: 1, off });
      s.matrix.multiplyMatrices(a.mats[1], off);
      a.shield = s;
    }
    if (a.shield) a.shield.visible = on;
  }

  // El color del poncho de un compañero (el estero: cada jugador es un
  // personaje; Gil va de colorado).
  restyle(id, hex) {
    const a = this.list.get(id);
    if (a) a.M.poncho.color.set(hex).multiplyScalar(1.7);
  }

  // Los muñecos de los compañeros de la partida (no los de las cinemáticas,
  // los gauchos del mapa ni el cuerpo del final, que usan esta misma clase).
  get team() {
    return !!this.s && this.s.avatars === this;
  }

  // La silueta aparece de a poco cuando algo tapa al compañero (se mira
  // unas veces por segundo si hay pared entre la cámara y su pecho).
  updateXray(a, dt) {
    const g = this.g;
    const r = a.r;
    a.losT = (a.losT || 0) - dt;
    if (a.losT <= 0) {
      a.losT = 0.12;
      const cam = g.camera.position;
      tmpP.set(r.pos.x, (r.pos.y || 0) + (r.downed ? 0.35 : 1.1), r.pos.z);
      tmpD.subVectors(tmpP, cam);
      const len = tmpD.length();
      a.hidden = len > 0.5 && g.world.raycast(cam, tmpD.divideScalar(len), len - 0.3) !== Infinity;
    }
    a.xk += ((a.hidden ? 1 : 0) - a.xk) * Math.min(1, dt * 8);
    const on = a.xk > 0.02;
    if (on !== !!a.xOn) {
      a.xOn = on;
      for (const x of a.xparts) x.visible = on;
    }
    a.xray.opacity = 0.55 * a.xk;
  }

  // Los compañeros caídos: dónde va el ícono de reanimar en la pantalla
  // (arriba del cuerpo; si queda fuera de vista, en el borde, apuntando).
  revives() {
    const g = this.g;
    const cam = g.camera;
    const W = innerWidth;
    const H = innerHeight;
    // margen: que entren el ícono, el nombre y los metros
    const M = 60;
    const out = [];
    cam.updateMatrixWorld();
    for (const a of this.list.values()) {
      const r = a.r;
      if (!r.downed || r.dead) {
        a.downAt = null;
        a.near = false;
        continue;
      }
      a.downAt ??= g.time;
      // de cerca no hace falta (ya lo dice el cartel de "Mantené [F]") y lo tapaba;
      // (un poco de margen para que no parpadee justo en el borde)
      const dist = g.player.pos.distanceTo(r.pos);
      a.near = dist < (a.near ? 3.4 : 3);
      if (a.near) continue;
      tmpP.set(r.pos.x, (r.pos.y || 0) + 1.3, r.pos.z);
      tmpD.copy(tmpP).applyMatrix4(cam.matrixWorldInverse);
      const front = tmpD.z < -0.05;
      let x = 0;
      let y = 0;
      let edge = !front;
      if (front) {
        tmpP.project(cam);
        x = (tmpP.x * 0.5 + 0.5) * W;
        y = (-tmpP.y * 0.5 + 0.5) * H;
        edge = x < M || x > W - M || y < M || y > H - M;
      }
      let ang = 0;
      if (edge) {
        // hacia dónde está, desde el centro de la pantalla (si está atrás, abajo)
        let dx = front ? x - W / 2 : tmpD.x;
        let dy = front ? y - H / 2 : 0;
        if (Math.abs(dx) + Math.abs(dy) < 1e-4) dy = 1;
        const s = Math.min((W / 2 - M) / Math.max(1e-6, Math.abs(dx)), (H / 2 - M) / Math.max(1e-6, Math.abs(dy)));
        x = W / 2 + dx * s;
        // (sin bajar a las esquinas de abajo: ahí están los puntos y las perks)
        y = Math.min(H / 2 + dy * s, H * 0.58);
        ang = Math.atan2(dy, dx);
      }
      out.push({ id: r.id, name: r.name || '', x, y, edge, ang, dist, k: Math.min(1, (g.time - a.downAt) / BLEED) });
    }
    return out;
  }

  remove(id) {
    const a = this.list.get(id);
    if (!a) return;
    a.group.removeFromParent();
    a.tag.material.map.dispose();
    a.tag.material.dispose();
    for (const m of Object.values(a.M)) m.dispose();
    a.xray?.dispose();
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
        P.rootY = (g.world.levels ? r.pos.y || 0 : 0) + 0.02;
        P.rootFwd = 0;
      } else if (r.swim >= 2) {
        // nadando (entities/swim.js): en la superficie pataleando con el mate
        // en alto para que no se moje; buceando, acostado dando brazadas
        const F = a.fake;
        F.baseY = 0;
        F.scale = 1;
        F.wetY = r.pos.y + (r.swim === 3 ? 1.2 : 1.32);
        swimPose(F, P, g.time, r.swim);
        if (r.swim === 2) {
          P.shRp = -1.9;
          P.shRr = 0.2;
          P.elR = -1.2;
        }
      } else {
        P.rootFwd = 0;
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
      // (las cinemáticas pueden poner su pose: levantar el mate, arrodillarse)
      r.poseFn?.(P);
      const fw = P.rootFwd || 0;
      solvePose(a.mats, r.pos.x + Math.sin(r.yaw + Math.PI) * fw, r.pos.z + Math.cos(r.yaw + Math.PI) * fw, r.yaw + Math.PI, 1, P);
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
      a.hand.visible = !r.downed && !r.dead && !r.corpse && !r.ghost;
      // (el alma de gaucho life no lo lleva)
      const shield = !!r.shield && !r.ghost;
      if (shield !== !!a.shieldOn) this.backShield(a, shield);
      // en gaucho life el compañero se ve como un alma azul
      if (!!r.ghost !== !!a.ghost) {
        a.ghost = !!r.ghost;
        for (const m of Object.values(a.M)) {
          m.transparent = a.ghost;
          m.opacity = a.ghost ? 0.42 : 1;
          m.depthWrite = !a.ghost;
          if (m.emissive) m.emissive.set(a.ghost ? 0x2a70c8 : 0x000000);
          m.needsUpdate = true;
        }
      }
      a.tag.position.set(r.pos.x, r.pos.y + (r.downed ? 0.9 : 2.05), r.pos.z);
      const d = a.tag.position.distanceTo(g.camera.position);
      a.tag.material.opacity = d > 34 ? 0 : 0.95;
      // de cerca se achica (a 2 m tapaba media pantalla); de 8 m para allá, el de siempre
      const k = Math.min(1, Math.max(0.3, d / 8));
      a.tag.scale.set(1.2 * k, 0.3 * k, 1);
      a.tag.material.color.setRGB(1, r.downed ? 0.4 : 1, r.downed ? 0.4 : 1);
      if (a.xray) this.updateXray(a, dt);
      // caído: el nombre ya va con el ícono de reanimar
      if (this.team) a.tag.visible = !r.downed;
    }
    if (this.team) g.hud.setRevives(this.revives());
  }

  dispose() {
    if (this.team) this.g.hud.setRevives([]);
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
