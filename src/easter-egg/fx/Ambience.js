import * as THREE from 'three';
import { FEATURES } from '../config/map';
import { SILL, HEAD } from '../world/World';
import { windowBeams } from './Shafts';

// Ambiente: halos y conos de luz bajo las lámparas, polvo flotando en el aire
// y haces de luna que entran por las ventanas (fx/Shafts). Todo aditivo y
// barato; en Rendimiento no se dibuja.

const DUST = 360;
const BOX = { x: 16, y: 3.2, z: 16 };

// degradé vertical: fuerte arriba, nada abajo (para conos y haces)
function fadeTexture(top = 1, bottom = 0) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, `rgba(255,255,255,${top})`);
  grd.addColorStop(1, `rgba(255,255,255,${bottom})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export default class Ambience {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    const T = game.textures;
    const fade = fadeTexture();
    // lámparas del mapa
    this.lamps = [];
    for (const e of game.world.lights) {
      const [x, y, z] = e.def.pos;
      const candle = e.def.kind === 'candle';
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: e.def.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      halo.position.set(x, y, z);
      halo.scale.setScalar(candle ? 0.7 : 1.5);
      this.root.add(halo);
      let cone = null;
      if (!candle && !e.def.kind) {
        cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.5, 2.6, 20, 1, true).translate(0, -1.3, 0),
          new THREE.MeshBasicMaterial({ map: fade, color: e.def.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
        );
        cone.position.set(x, y + 0.05, z);
        this.root.add(cone);
      }
      this.lamps.push({ e, halo, cone, candle });
    }
    // haces de luna por las ventanas de los zombies que miran a la luna,
    // pasando entre las tablas (el castillo junta los suyos en castleRooms:
    // todas las ventanas de las salas, los vitrales y el rosetón)
    this.beams = null;
    const moon = game.world.moonDir;
    if (FEATURES.castle) {
      const items = game.world.shaftItems || [];
      for (const it of items) {
        if (it.cell) it.win = game.barriers?.windows.find((bw) => bw.def.cell[0] === it.cell[0] && bw.def.cell[1] === it.cell[1]) || null;
      }
      if (items.length) {
        this.beams = windowBeams(items);
        this.root.add(this.beams.root);
      }
    } else if (moon && game.barriers) {
      const ray = moon.clone().negate();
      const items = [];
      for (const bw of game.barriers.windows) {
        // en el alambrado no hay ventana por donde entre la luna
        if (bw.low) continue;
        const n = bw.out.clone().negate();
        if (-n.x * moon.x - n.z * moon.z <= 0.1) continue;
        // el rayo de la luna, un poco más hacia adentro (rasante a la pared se pierde)
        const dir = new THREE.Vector3(ray.x, 0, ray.z).normalize().lerp(n, 0.35).normalize().multiplyScalar(Math.hypot(ray.x, ray.z)).setY(ray.y);
        const c = bw.center.clone().addScaledVector(n, 0.42).setY(bw.fy + (SILL + HEAD) / 2);
        items.push({ c, n, w: 0.92, h: HEAD - SILL, dir, fy: bw.fy, win: bw });
      }
      if (items.length) {
        this.beams = windowBeams(items);
        this.root.add(this.beams.root);
      }
    }
    // polvo que flota alrededor del jugador
    const pos = new Float32Array(DUST * 3);
    this.vel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX.x;
      pos[i * 3 + 1] = Math.random() * BOX.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.06;
      this.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.03;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: T.dot, color: 0xffe2b8, size: 0.028, sizeAttenuation: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
    this.center = new THREE.Vector3();
  }

  update(dt) {
    const g = this.g;
    // (Personalizada: Game.tier('amb'))
    const q = g.tier?.('amb') ?? g.settings.quality;
    const on = q !== 'perf';
    this.root.visible = on;
    if (!on) return;
    // halos y conos siguen a cada lámpara (titilan y se apagan con la luz)
    for (const l of this.lamps) {
      const k = Math.min(1, l.e.light.intensity / (l.e.base || 1));
      l.halo.material.opacity = (l.candle ? 0.45 : 0.55) * k;
      if (l.cone) l.cone.material.opacity = 0.05 * k;
    }
    // la luna se ve menos con nubes o de día; roja con la luna de sangre y el
    // relámpago la prende de golpe
    if (this.beams) {
      const U = this.beams.U;
      const wth = g.weather?.cur;
      const cloud = wth ? wth.cloud : 0.15;
      const blood = wth ? wth.blood : 0;
      U.uTime.value = g.time;
      U.uK.value = (1 - cloud * 0.7) * (1 - (g.world.dayCur || 0)) + (g.weather?.flash || 0) * 2;
      U.uColor.value.setRGB(0.55 + blood * 0.4, 0.65 - blood * 0.45, 0.95 - blood * 0.7);
      if (this.beamQ !== q) {
        this.beamQ = q;
        this.beams.setQuality(this.beamQ);
      }
      this.beams.update(dt, g.camera);
    }
    // el polvo acompaña al jugador: lo que sale de la caja entra por el otro lado
    const p = g.player.pos;
    const a = this.dust.geometry.attributes.position;
    const arr = a.array;
    const cx = p.x;
    const cz = p.z;
    const by = p.y;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3;
      arr[j] += this.vel[j] * dt + Math.sin(g.time * 0.3 + i) * 0.002;
      arr[j + 1] += this.vel[j + 1] * dt;
      arr[j + 2] += this.vel[j + 2] * dt;
      if (arr[j] < cx - BOX.x / 2) arr[j] += BOX.x;
      else if (arr[j] > cx + BOX.x / 2) arr[j] -= BOX.x;
      if (arr[j + 2] < cz - BOX.z / 2) arr[j + 2] += BOX.z;
      else if (arr[j + 2] > cz + BOX.z / 2) arr[j + 2] -= BOX.z;
      if (arr[j + 1] < by) arr[j + 1] += BOX.y;
      else if (arr[j + 1] > by + BOX.y) arr[j + 1] -= BOX.y;
    }
    a.needsUpdate = true;
  }
}
