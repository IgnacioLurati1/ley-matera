import * as THREE from 'three';
import { ZONES } from '../config/map';
import { zombieHealth } from '../config/rules';

// La Luz Mala: una luz verdosa que flota de noche y marca dónde hay algo
// enterrado. Muy de vez en cuando aparece en alguna parte del molino; cuando
// te acercás se escapa (atraviesa paredes, así que hay que darle la vuelta),
// y después de unos saltos se hunde en la tierra. Ahí se cava: puede salir
// plata, un perk, munición... o la maldición (se levantan muertos alrededor).
//
// En línea la maneja el anfitrión: les avisa a los demás adónde va (todos la
// mueven igual) y decide qué sale cuando alguien cava.

const MIN_ROUND = 3;
const CHANCE = 0.3; // por ronda
const HOPS = 4;
const NEAR = 4.2; // a esta distancia se escapa
const SPEED = 5.5;
const IDLE_LIFE = 55; // si nadie la sigue, se apaga
const DIG_TIME = 2.2;
const REWARDS = [
  { id: 'points', w: 35 },
  { id: 'perk', w: 25 },
  { id: 'ammo', w: 20 },
  { id: 'curse', w: 20 },
];

const tmpV = new THREE.Vector3();

export default class LuzMala {
  constructor(game) {
    this.g = game;
    this.state = 'off'; // off | idle | hop | sink | buried
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.hops = 0;
    this.t = 0;
    this.orb = this.buildOrb();
    this.mound = this.buildMound();
    this.item = game.interact.add({
      kind: 'luzmala',
      pos: new THREE.Vector3(),
      radius: 1.9,
      hold: true,
      holdTime: DIG_TIME,
      prompt: () => (this.state === 'buried' ? { text: 'cavar donde se hundió la Luz Mala', hold: true, noCost: true } : null),
      cost: () => 0,
      use: () => {
        const r = this.dig();
        if (!r) return false;
        this.applyReward(r);
        return true;
      },
    });
  }

  buildOrb() {
    const g = this.g;
    const root = new THREE.Group();
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xc8ff7a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    glow.scale.setScalar(1.6);
    root.add(glow);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaffc0).multiplyScalar(2.5), toneMapped: false }));
    root.add(core);
    const light = new THREE.PointLight(0xb8ff70, 0, 9, 1.6);
    root.add(light);
    root.visible = false;
    g.scene.add(root);
    this.glow = glow;
    this.light = light;
    return root;
  }

  buildMound() {
    const g = this.g;
    const root = new THREE.Group();
    const dirt = new THREE.MeshStandardMaterial({ color: 0x4a3524, map: g.textures.dirtDark || g.textures.dirt || null, roughness: 1 });
    const hill = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), dirt);
    hill.receiveShadow = true;
    root.add(hill);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: g.textures.dot, color: 0x9cff5a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35 }),
    );
    glow.scale.set(1.4, 0.6, 1);
    glow.position.y = 0.2;
    root.add(glow);
    this.moundGlow = glow;
    root.visible = false;
    g.scene.add(root);
    return root;
  }

  // ---------------- aparición (solitario o anfitrión) ----------------
  onRound(round) {
    const g = this.g;
    if (g.net?.guest || round < MIN_ROUND || this.state !== 'off') return;
    if (Math.random() > CHANCE) return;
    g.later(8 + Math.random() * 14, () => this.spawn());
  }

  spawn() {
    const g = this.g;
    if (this.state !== 'off' || g.state !== 'playing') return false;
    const p = this.pickPoint(null, 12, 22);
    if (!p) return false;
    this.hops = 0;
    this.begin(p.x, p.z);
    g.net?.event('luz', { a: 'spawn', x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
    return true;
  }

  begin(x, z) {
    const g = this.g;
    this.pos.set(x, 1.6, z);
    this.target.copy(this.pos);
    this.setState('idle');
    this.orb.visible = true;
    this.mound.visible = false;
    g.hud.subtitle('Allá, entre las sombras... una luz verde. La Luz Mala marca dónde hay algo enterrado.', 4.5);
    g.audio.whoosh?.(this.pos);
  }

  // Un lugar caminable en una zona abierta, lejos de los jugadores.
  pickPoint(from, dmin, dmax) {
    const g = this.g;
    const players = this.players();
    for (let i = 0; i < 60; i++) {
      const zones = [...g.activeZones];
      const zn = ZONES[zones[Math.floor(Math.random() * zones.length)]];
      if (!zn) continue;
      const [x0, z0, x1, z1] = zn.rect;
      const x = x0 + 1 + Math.random() * (x1 - x0 - 2);
      const z = z0 + 1 + Math.random() * (z1 - z0 - 2);
      if (g.nav.blocked(Math.floor(x), Math.floor(z))) continue;
      const near = players.reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - x, p.pos.z - z)), Infinity);
      if (near < 7) continue;
      const ref = from || players[0]?.pos;
      if (ref) {
        const d = Math.hypot(ref.x - x, ref.z - z);
        if (d < dmin || d > dmax) continue;
      }
      return { x, z };
    }
    return null;
  }

  players() {
    const g = this.g;
    const list = g.player.alive && !g.player.downed ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r);
    return list;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    if (this.state === 'off') return;
    this.t += dt;
    const host = !g.net?.guest;
    if (this.state === 'idle') {
      if (host) {
        const near = this.players().some((p) => Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < NEAR);
        if (near) this.flee();
        else if (this.t > IDLE_LIFE) this.fade(true);
      }
    } else if (this.state === 'hop') {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (d <= step) {
        this.pos.x = this.target.x;
        this.pos.z = this.target.z;
        this.setState('idle');
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
    } else if (this.state === 'sink') {
      this.pos.y = Math.max(0.1, 1.6 - this.t * 1.1);
      if (this.t > 1.4) this.bury();
    } else if (this.state === 'buried') {
      this.moundGlow.material.opacity = 0.25 + Math.sin(g.time * 3) * 0.12;
      if (Math.random() < 0.1) g.fx.sparkle(tmpV.set(this.pos.x, 0.3, this.pos.z), [0.6, 1, 0.4], 1, 0.4);
      return;
    }
    // la luz tiembla, sube y baja, y deja chispitas
    const flick = 0.8 + Math.sin(g.time * 17) * 0.1 + Math.sin(g.time * 5.3) * 0.1;
    const bob = this.state === 'sink' ? 0 : Math.sin(g.time * 1.7) * 0.18;
    this.orb.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.glow.material.opacity = 0.75 * flick;
    this.glow.scale.setScalar(1.3 + flick * 0.5);
    this.light.intensity = 3.2 * flick;
    if (Math.random() < 0.35) g.fx.sparkle(this.orb.position, [0.7, 1, 0.45], 1, 0.3);
  }

  // Se escapa a otro lado, o después de varios saltos se hunde.
  flee() {
    const g = this.g;
    this.hops++;
    if (this.hops > HOPS) {
      this.setState('sink');
      g.net?.event('luz', { a: 'sink', x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2) });
      return;
    }
    const p = this.pickPoint(this.pos, 7, 16) || this.pickPoint(this.pos, 4, 30);
    if (!p) {
      this.fade(true);
      return;
    }
    this.target.set(p.x, 1.6, p.z);
    this.setState('hop');
    g.audio.whoosh?.(this.pos);
    g.net?.event('luz', { a: 'go', x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
  }

  bury() {
    const g = this.g;
    this.setState('buried');
    this.orb.visible = false;
    this.light.intensity = 0;
    this.mound.position.set(this.pos.x, 0, this.pos.z);
    this.mound.visible = true;
    this.item.pos.set(this.pos.x, 0.8, this.pos.z);
    g.fx.dirt(tmpV.set(this.pos.x, 0.1, this.pos.z), 12);
    g.hud.subtitle('Se hundió en la tierra. Algo hay enterrado ahí.', 3.5);
  }

  fade(tell) {
    const g = this.g;
    this.setState('off');
    this.orb.visible = false;
    this.light.intensity = 0;
    this.mound.visible = false;
    if (tell) {
      g.hud.subtitle('La Luz Mala se apagó.', 2.5);
      g.net?.event('luz', { a: 'gone' });
    }
  }

  // ---------------- cavar ----------------
  // Decide qué sale (solitario o anfitrión); se lo lleva el que cavó.
  dig() {
    const g = this.g;
    if (this.state !== 'buried') return null;
    const total = REWARDS.reduce((n, r) => n + r.w, 0);
    let roll = Math.random() * total;
    const r = REWARDS.find((x) => (roll -= x.w) <= 0) || REWARDS[0];
    const round = g.rounds?.round || 1;
    const res = { id: r.id, n: r.id === 'points' ? 1500 + round * 150 : r.id === 'curse' ? 500 : 0 };
    this.fade(false);
    g.fx.dirt(tmpV.set(this.pos.x, 0.2, this.pos.z), 20);
    g.net?.event('luz', { a: 'dug' });
    if (r.id === 'curse') {
      // se levantan muertos alrededor del pozo
      const V = THREE.Vector3;
      const n = 3 + Math.min(3, Math.floor(round / 4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const at = new V(this.pos.x + Math.cos(a) * 2.6, 0, this.pos.z + Math.sin(a) * 2.6);
        if (g.nav.blocked(Math.floor(at.x), Math.floor(at.z))) at.set(this.pos.x, 0, this.pos.z);
        g.later(0.3 + i * 0.25, () => g.zombies.spawn(round, zombieHealth(round), at));
      }
    }
    return res;
  }

  // Lo que le toca al que cavó (en su compu).
  applyReward(r) {
    const g = this.g;
    g.audio.powerupGrab();
    if (!this.dugOnce) {
      this.dugOnce = true;
      g.hud.achievement('Luz Mala', 'La seguiste hasta donde se hundió');
    }
    if (r.id === 'points') {
      g.addPoints(r.n, null, true);
      g.hud.subtitle(`¡Un tarro con monedas viejas! +${r.n}`, 3);
    } else if (r.id === 'perk') {
      g.hud.subtitle('Una botellita de caña con un perk adentro.', 3);
      g.activities.applyGift('perk');
    } else if (r.id === 'ammo') {
      g.hud.subtitle('Un cajón de munición y una pava silbadora.', 3);
      g.activities.applyGift('ammo');
    } else if (r.id === 'curse') {
      g.addPoints(r.n, null, true);
      g.hud.subtitle('¡Era una tumba! Se levantan los muertos...', 3, 'boss');
      g.audio.sting();
    }
  }

  // ---------------- en línea (invitado) ----------------
  applyEvent(m) {
    if (m.a === 'spawn') {
      this.hops = 0;
      this.begin(m.x, m.z);
    } else if (m.a === 'go') {
      if (this.state === 'off') this.begin(this.pos.x || m.x, this.pos.z || m.z);
      this.target.set(m.x, 1.6, m.z);
      this.setState('hop');
      this.g.audio.whoosh?.(this.pos);
    } else if (m.a === 'sink') {
      this.pos.x = m.x;
      this.pos.z = m.z;
      this.setState('sink');
    } else if (m.a === 'gone') this.fade(true);
    else if (m.a === 'dug') {
      this.g.fx.dirt(tmpV.set(this.pos.x, 0.2, this.pos.z), 20);
      this.fade(false);
    }
  }
}
