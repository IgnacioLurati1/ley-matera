import * as THREE from 'three';
import { WINDOWS } from '../config/map';

// Ambiente: halos y conos de luz bajo las lámparas, polvo flotando en el aire
// y haces de luna que entran por las ventanas. Todo aditivo y barato; con la
// calidad baja no se dibuja.

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
    // haces de luna por las ventanas: bajan en diagonal hacia adentro
    const moonMat = new THREE.MeshBasicMaterial({ map: fade, color: 0x9ab4e8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.1 });
    this.shafts = [];
    for (const w of WINDOWS) {
      const [cx, cz] = w.cell;
      const [ox, oz] = w.out;
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2).translate(0, -1.6, 0), moonMat);
      // arranca en la ventana y baja hacia adentro
      shaft.position.set(cx + 0.5 - ox * 0.5, 2.3, cz + 0.5 - oz * 0.5);
      shaft.rotation.set(0, Math.atan2(-ox, -oz), 0);
      shaft.rotateX(-0.75);
      this.root.add(shaft);
      this.shafts.push(shaft);
    }
    this.moonMat = moonMat;
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
    const on = g.settings.quality !== 'low';
    this.root.visible = on;
    if (!on) return;
    // halos y conos siguen a cada lámpara (titilan y se apagan con la luz)
    for (const l of this.lamps) {
      const k = Math.min(1, l.e.light.intensity / (l.e.base || 1));
      l.halo.material.opacity = (l.candle ? 0.45 : 0.55) * k;
      if (l.cone) l.cone.material.opacity = 0.05 * k;
    }
    // la luna se ve menos con nubes o tormenta
    const moonK = g.world.moon ? Math.min(1, g.world.moon.intensity / 0.9) : 1;
    this.moonMat.opacity = 0.09 * moonK;
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
