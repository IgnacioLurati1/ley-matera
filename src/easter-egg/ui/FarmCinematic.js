import * as THREE from 'three';
import { EE } from '../config/map';

// Final de la granja, adentro del juego: con el Espantapájaros tirado en el
// prado, la Entidad baja del cielo (un ojo de luz rodeado de anillos), el
// paquete de yerba sube desde la piedra hasta ella y habla: gracias... pero el
// camino sigue. Se puede saltear con Esc, Espacio o clic.

const LINES = [
  [3.5, 'Gracias. Hacía cien años que nadie me traía yerba de esta tierra.'],
  [10.5, 'Con esto alcanza para esta noche. Pero no se confundan...'],
  [15, '...su camino todavía sigue.'],
];
const END = 21;

export default class FarmCinematic {
  constructor(root, game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'mdu-fcine';
    this.el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p><h1 class="mdu-fcine__title">El camino sigue</h1><i class="mdu-fcine__fade"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('.mdu-fcine__text');
    this.t = 0;
    this.said = 0;
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.finish());
    requestAnimationFrame(() => this.el.classList.add('is-on'));
    const [ax, az] = EE.altar.pos;
    this.altar = new THREE.Vector3(ax, 0.9, az);
    this.entity = this.buildEntity();
    this.entity.position.set(ax, 34, az);
    g.scene.add(this.entity);
    // el paquete que sube (una copia del que quedó en la piedra)
    const src = g.ee.altarPack;
    this.pack = src ? src.clone() : new THREE.Group();
    this.pack.position.copy(this.altar);
    this.pack.visible = true;
    if (src) src.visible = false;
    g.scene.add(this.pack);
    this.yaw0 = g.player.yaw;
    // sin el mate (o la hoz) en la mano
    g.weapons.vmRoot.visible = false;
    g.hud.setBossBar(null);
    // se callan todos para darle lugar a la escena
    g.audio.setCine(true);
    g.audio.fanfare();
  }

  // La Entidad: un ojo blanco-violeta, anillos que giran y rayos hacia abajo.
  buildEntity() {
    const g = new THREE.Group();
    const glow = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 1.3, 0.05 + i * 0.015, 8, 64), glow(i === 1 ? 0xffb84a : 0x9a6aff, 1.1));
      ring.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      g.add(ring);
      this.rings.push(ring);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), glow(0xf0e0ff, 1.6));
    g.add(eye);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1a0a2a }));
    iris.position.set(0, -0.35, 0.75);
    g.add(iris);
    this.iris = iris;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xb88aff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    halo.scale.setScalar(16);
    g.add(halo);
    this.halo = halo;
    // columna de luz hasta el piso
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.5, 40, 24, 1, true).translate(0, -20, 0), glow(0xc8a0ff, 0.5));
    beam.material.opacity = 0.18;
    g.add(beam);
    this.beamMesh = beam;
    // la luz ya está en la escena desde que se armó el mapa (world/Prado.js):
    // acá se prende y sigue a la Entidad (una nueva recompilaría todo)
    const light = this.g.arena?.cineLight;
    if (light) light.intensity = 60;
    this.light = light || null;
    return g;
  }

  update(dt) {
    const g = this.g;
    if (!this.entity) return;
    this.t += dt;
    g.time += dt;
    // sin el mate en la mano (el cuadro en que arranca, el juego lo vuelve a prender)
    g.weapons.vmRoot.visible = false;
    const t = this.t;
    const e = this.entity;
    // baja del cielo y se queda flotando
    const k = Math.min(1, t / 6);
    const ease = 1 - (1 - k) ** 3;
    e.position.y = 34 - ease * 25 + Math.sin(t * 0.8) * 0.3;
    this.light?.position.copy(e.position);
    this.rings.forEach((r, i) => {
      r.rotation.x += dt * (0.3 + i * 0.2);
      r.rotation.y += dt * (0.2 - i * 0.1);
    });
    this.halo.material.opacity = 0.6 + Math.sin(t * 2) * 0.15;
    // la yerba sube desde la piedra
    if (t > 6 && this.pack.visible) {
      const u = Math.min(1, (t - 6) / 4);
      const s = u * u * (3 - 2 * u);
      this.pack.position.lerpVectors(this.altar, e.position, s);
      this.pack.rotation.y += dt * 3;
      if (Math.random() < 0.6) g.fx.sparkle(this.pack.position, [0.8, 0.9, 0.6], 2, 0.3);
      if (u >= 1) {
        this.pack.visible = false;
        g.post.flash(1.2);
        g.audio.powerupGrab();
        g.fx.sparkle(e.position, [1, 0.85, 0.5], 60, 2);
      }
    }
    // cámara: da vueltas alrededor de la piedra mirando hacia arriba
    const cam = g.camera;
    const a = this.yaw0 + t * 0.12;
    const rad = 7 - Math.min(2, t * 0.12);
    cam.position.set(this.altar.x + Math.sin(a) * rad, 1.4 + Math.min(2.5, t * 0.15), this.altar.z + Math.cos(a) * rad);
    const look = new THREE.Vector3().lerpVectors(this.altar, e.position, t < 6 ? 0.25 + k * 0.35 : 0.55);
    cam.lookAt(look);
    // el ojo te mira
    this.iris.position.set(0, -0.35, 0.75).applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(cam.position.x - e.position.x, cam.position.z - e.position.z));
    // lo que dice
    while (this.said < LINES.length && t >= LINES[this.said][0]) {
      const text = LINES[this.said][1];
      this.textEl.textContent = text;
      this.textEl.classList.remove('is-on');
      void this.textEl.offsetWidth;
      this.textEl.classList.add('is-on');
      g.audio.say(text, 'entidad', { cine: true });
      this.said++;
    }
    if (t > 16.5) this.el.classList.add('is-title');
    if (t > 19) this.el.classList.add('is-fade');
    g.fx.update(dt, cam);
    g.world.update(dt, g.time);
    if (t > END) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('keydown', this.onKey);
    // se cortan sus voces (también los murmullos) y vuelven a hablar los demás
    this.g.audio.hush();
    this.g.audio.setCine(false);
    this.el.remove();
    this.entity?.removeFromParent();
    this.pack?.removeFromParent();
    if (this.light) this.light.intensity = 0;
    this.entity = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}
