import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from '../../world/props';

// La taba, en el palenque: la cancha de arena con la raya, y la taba (el hueso)
// que se tira pagando. Cae de "suerte" (se cobra el doble), de "culo" (se
// pierde) o, muy de vez en cuando, queda parada (cinco veces). Cada uno juega
// con su plata.

const AT = [29.2, 63.2];
const COST = 500;
const FLY = 1.1;

export default class Taba {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    const M = g.world.M;
    const [x, z] = AT;
    const y = g.world.floorAt(x, z);
    this.y = y;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    // la cancha: arena apisonada con la raya de tiro y el "hoyo" del fondo
    const sand = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 });
    root.add(mesh(boxGeo(1.3, 0.04, 3.2), sand, 0, 0.02, 0));
    root.add(mesh(boxGeo(1.3, 0.045, 0.05), M.clothWhite || M.snowCap, 0, 0.025, 1.2));
    root.add(mesh(boxGeo(1.3, 0.1, 0.08), M.woodDark || M.wood, 0, 0.05, -1.62));
    for (const s of [-1, 1]) root.add(mesh(boxGeo(0.06, 0.08, 3.2), M.woodDark || M.wood, s * 0.68, 0.04, 0));
    // el cartel
    const sign = new THREE.Group();
    sign.position.set(0.9, 0, 1.4);
    sign.add(mesh(cylGeo(0.04, 0.04, 1.2, 6), M.woodDark || M.wood, 0, 0.6, 0));
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const cx = c.getContext('2d');
    cx.fillStyle = '#3a2618';
    cx.fillRect(0, 0, 128, 64);
    cx.fillStyle = '#e8d8b0';
    cx.font = 'bold 26px Georgia, serif';
    cx.textAlign = 'center';
    cx.fillText('TABA', 64, 28);
    cx.font = 'bold 18px Georgia, serif';
    cx.fillText(`$${COST}`, 64, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    sign.add(mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }), 0, 1.25, 0));
    root.add(sign);
    // la taba: un hueso con una cara cóncava (la suerte) y un canto
    this.bone = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.6 });
    const b = mesh(new THREE.CapsuleGeometry(0.035, 0.07, 4, 8), boneMat, 0, 0, 0, 0, 0, Math.PI / 2);
    b.scale.set(1, 1, 0.75);
    this.bone.add(b);
    this.bone.add(mesh(boxGeo(0.06, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a1a10, roughness: 0.5 }), 0, 0.03, 0));
    this.bone.position.set(0, 0.06, -1.3);
    root.add(this.bone);
    egg.root.add(root);
    this.root = root;
    this.fly = null;
    g.interact.add({
      kind: 'taba',
      local: true,
      pos: new THREE.Vector3(x, y + 1, z + 1.6),
      radius: 1.8,
      prompt: () => (this.fly ? null : 'tirar la taba'),
      cost: () => (this.fly ? 0 : COST),
      use: () => this.toss(),
    });
  }

  toss() {
    if (this.fly) return false;
    const r = Math.random();
    // la casa gana apenas: 4% parada (x5) y 39% suerte (x2) dan 0,98 por
    // tirada, así la taba no es una máquina de hacer puntos
    const res = r < 0.04 ? 'parada' : r < 0.43 ? 'suerte' : 'culo';
    this.fly = { t: 0, res, spin: 8 + Math.random() * 6 };
    return true;
  }

  land() {
    const g = this.g;
    const f = this.fly;
    const a = g.audio;
    if (a?.out) {
      const o = a.out({ pos: this.root.position, gain: 0.5, reverb: 0.2 });
      a.tone(o, { t: a.now, dur: 0.08, freq: 220, freqEnd: 120, gain: 0.3 });
      a.noise(o, { t: a.now, dur: 0.1, type: 'lowpass', freq: 900, gain: 0.3, brown: true });
    }
    g.fx.dirt?.(this.bone.getWorldPosition(new THREE.Vector3()), 3);
    if (f.res === 'suerte') {
      g.addPoints(COST * 2, null, true);
      g.hud.subtitle('¡Suerte! La taba cayó con la panza para arriba: cobrás el doble.', 3);
    } else if (f.res === 'parada') {
      g.addPoints(COST * 5, null, true);
      g.hud.subtitle('¡¿Parada?! La taba quedó de canto: cobrás cinco veces.', 3.5);
      g.hud.achievement?.('Tabero', 'La taba quedó parada');
    } else g.hud.subtitle('¡Culo! La taba cayó al revés: perdiste.', 3);
    g.later(1.6, () => {
      this.bone.position.set(0, 0.06, -1.3);
      this.bone.rotation.set(0, 0, 0);
      this.fly = null;
    });
  }

  update(dt) {
    const f = this.fly;
    if (!f || f.t >= 1) return;
    f.t = Math.min(1, f.t + dt / FLY);
    const u = f.t;
    // de la raya al fondo, en arco, dando vueltas
    this.bone.position.set(Math.sin(u * 5) * 0.08, 0.06 + Math.sin(u * Math.PI) * 1.1, 1.1 - u * 2.4);
    this.bone.rotation.set(u * f.spin, u * 2, 0);
    if (f.t >= 1) {
      // cómo quedó: de suerte (la marca arriba), de culo (abajo) o parada
      this.bone.rotation.set(f.res === 'culo' ? Math.PI : 0, 0.4, f.res === 'parada' ? Math.PI / 2 : 0);
      this.bone.position.y = f.res === 'parada' ? 0.1 : 0.06;
      this.land();
    }
  }
}
