import * as THREE from 'three';
import { PROPS } from '../../config/map';
import { mesh, cylGeo } from '../../world/props';

// El juego de la sortija, en el palenque: la sortija cuelga del arco y se
// hamaca con el viento. Con F arranca la vuelta: cinco aciertos en veinte
// segundos, y cada acierto la hamaca más rápido. El premio: puntos y el logro
// de Sortijero (una vez por partida). Cada uno juega por su cuenta.

const GOAL = 5;
const TIME = 20;
const PRIZE = 1500;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export default class Sortija {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    const def = PROPS.find((p) => p.type === 'sortija');
    this.on = false;
    if (!def) return;
    const [x, z] = def.pos;
    const y = g.world.floorAt(x, z);
    this.rot = def.rot || 0;
    // el hilo y la sortija, que se hamacan desde el travesaño
    this.pivot = new THREE.Group();
    this.pivot.position.set(x, y + 3.25, z);
    this.pivot.rotation.y = this.rot;
    const M = g.world.M;
    this.pivot.add(mesh(cylGeo(0.004, 0.004, 0.5, 4), M.rope || M.wood, 0, -0.25, 0));
    this.ring = mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16), new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.25, metalness: 0.95, emissive: 0x3a2a00, emissiveIntensity: 0.5 }), 0, -0.56, 0);
    this.pivot.add(this.ring);
    egg.root.add(this.pivot);
    this.phase = 0;
    this.speed = 1.2;
    this.amp = 0.35;
    this.hits = 0;
    this.t = 0;
    this.won = false;
    this.hideT = 0;
    g.interact.add({
      kind: 'sortija',
      local: true,
      pos: new THREE.Vector3(x, y + 1.2, z + 1.5),
      radius: 2.6,
      prompt: () => {
        if (this.on) return { text: `Sortija: ${this.hits} de ${GOAL} · quedan ${Math.ceil(this.t)} s`, noCost: true, info: true };
        return { text: `jugar a la sortija (${GOAL} tiros a la sortija en ${TIME} s)`, noCost: true };
      },
      cost: () => 0,
      use: () => this.start(),
    });
  }

  start() {
    if (this.on) return false;
    this.on = true;
    this.hits = 0;
    this.t = TIME;
    this.speed = 1.6;
    this.amp = 0.45;
    this.g.hud.subtitle('¡Juego de la sortija! Pegale a la sortija que cuelga del arco.', 3);
    return true;
  }

  onShot(o, d, maxT) {
    if (!this.on || this.hideT > 0 || !this.ring) return;
    const c = this.ring.getWorldPosition(tmpV);
    const t = tmpV2.subVectors(c, o).dot(d);
    if (t < 0 || t > maxT + 0.3) return;
    if (tmpV2.copy(o).addScaledVector(d, t).distanceTo(c) > 0.13) return;
    const g = this.g;
    this.hits++;
    g.fx.sparkle?.(c, [1, 0.85, 0.3], 10, 0.3);
    const a = g.audio;
    if (a?.out) {
      const out = a.out({ pos: c, gain: 0.6, reverb: 0.3 });
      a.tone(out, { t: a.now, dur: 0.5, type: 'sine', freq: 1568, gain: 0.12 });
      a.tone(out, { t: a.now, dur: 0.4, type: 'sine', freq: 2349, gain: 0.06 });
    }
    // se va y vuelve, cada vez más loca
    this.hideT = 0.7;
    this.ring.visible = false;
    this.speed += 0.35;
    this.amp = Math.min(0.9, this.amp + 0.08);
    if (this.hits >= GOAL) this.finish(true);
  }

  finish(ok) {
    const g = this.g;
    this.on = false;
    this.speed = 1.2;
    this.amp = 0.35;
    if (!ok) {
      g.hud.subtitle(`¡Casi! ${this.hits} de ${GOAL}. Probá de nuevo.`, 3);
      return;
    }
    if (this.won) {
      g.hud.subtitle('¡Otra vez la sortija! Ya sos el mejor del palenque.', 3);
      return;
    }
    this.won = true;
    g.addPoints(PRIZE, null, true);
    g.hud.achievement('Sortijero', 'Sacaste la sortija cinco veces seguidas');
  }

  update(dt) {
    if (!this.pivot) return;
    this.phase += dt * this.speed * 2;
    this.pivot.rotation.x = Math.sin(this.phase) * this.amp;
    this.pivot.rotation.z = Math.sin(this.phase * 0.7) * this.amp * 0.3;
    if (this.hideT > 0) {
      this.hideT -= dt;
      if (this.hideT <= 0) this.ring.visible = true;
    }
    if (this.on) {
      this.t -= dt;
      if (this.t <= 0) this.finish(false);
    }
  }
}
