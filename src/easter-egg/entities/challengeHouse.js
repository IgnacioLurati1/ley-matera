import * as THREE from 'three';
import { WEAPONS } from '../config/weapons';
import { buildChiqui } from '../world/Chiqui';

// La casita escondida del Challenge de la torre: a veces (20%) la Bombilla del
// Remolino, en vez de subirte, te escupe acá. Es un cuartito cerrado debajo de
// la explanada, con una escultura del Chiquitijuein y el Mate Meme en la
// pared (weapons/memeMate.js). Al rato la bombilla te va a buscar y te deja en
// el piso adonde ibas. Alt+Q (solo, de prueba) te trae directo.
// La torre no tiene piso debajo del cero, así que mientras estás acá el
// jugador va "montado" (player.ride): queda a esta altura y adentro de las
// paredes. Todo con materiales sin luces (matcap): acá abajo no llega ninguna.

export const HOUSE = { x: 30, y: -40, z: -14, w: 6, d: 5, h: 2.8 };
// lo que dura la visita (s) y la de prueba (Alt+Q)
const STAY = 14;
const STAY_DEBUG = 10;
// al volver: segundos en que los muertos no te tocan (y se abren)
const GUARD = 3;
const MEME = { cost: 1250, ammo: 600 };

function matcapTex(hi, mid, lo) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S * 0.38, S * 0.32, 1, S * 0.5, S * 0.5, S * 0.5);
  g.addColorStop(0, hi);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, lo);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// El dibujo de tiza del Mate Meme en la pared (como las compras de pared).
function chalkTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = '#1a1a1a';
  x.fillRect(0, 0, 512, 384);
  x.strokeStyle = 'rgba(240,240,230,0.9)';
  x.fillStyle = 'rgba(240,240,230,0.92)';
  x.lineWidth = 6;
  x.lineCap = 'round';
  // el mate: la calabaza, la bombilla y los anteojos pixelados
  x.beginPath();
  x.ellipse(256, 200, 92, 104, 0, 0.35, Math.PI * 2 - 0.35 + Math.PI * 0.3);
  x.stroke();
  x.beginPath();
  x.moveTo(300, 110);
  x.lineTo(360, 30);
  x.lineTo(392, 34);
  x.stroke();
  for (let i = 0; i < 12; i++) x.fillRect(196 + i * 10, 176, 9, 9);
  for (const [ox, w] of [[204, 4], [262, 4]]) for (let j = 1; j < 3; j++) x.fillRect(ox + (j - 1) * 10, 176 + j * 10, w * 10 - (j - 1) * 20, 9);
  x.beginPath();
  x.arc(256, 238, 30, 0.2, Math.PI - 0.2);
  x.stroke();
  x.font = 'bold 44px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.fillText('MATE MEME', 256, 348);
  x.font = 'bold 32px Impact, "Arial Black", sans-serif';
  x.fillText(`$${MEME.cost.toLocaleString('es-AR')}`, 112, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class ChallengeHouse {
  constructor(ch) {
    this.ch = ch;
    this.g = ch.g;
    this.visit = null;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.build();
    this.register();
  }

  build() {
    const g = this.g;
    const T = g.textures;
    const H = HOUSE;
    const cap = (a, b, c, map) => new THREE.MeshMatcapMaterial({ matcap: matcapTex(a, b, c), map: map || null, fog: false });
    const M = {
      wall: cap('#fff6e8', '#d8c8b0', '#7a6a58', T.adobe || T.whitewash || T.stoneWall),
      floor: cap('#f0d8b0', '#a07850', '#3a2a18', T.planks),
      beam: cap('#c89a6a', '#7a5030', '#2a1a0a', T.planks),
      stone: cap('#ffffff', '#b8b4ac', '#4a4844'),
      gold: cap('#fff4c0', '#e0a830', '#5a3a08'),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(2), toneMapped: false, fog: false }),
    };
    const grp = new THREE.Group();
    grp.position.set(H.x, H.y, H.z);
    this.root.add(grp);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      grp.add(m);
      return m;
    };
    const t = 0.2;
    box(H.w + t * 2, t, H.d + t * 2, M.floor, 0, -t / 2, 0);
    box(H.w + t * 2, t, H.d + t * 2, M.wall, 0, H.h + t / 2, 0);
    box(t, H.h, H.d, M.wall, -H.w / 2 - t / 2, H.h / 2, 0);
    box(t, H.h, H.d, M.wall, H.w / 2 + t / 2, H.h / 2, 0);
    box(H.w, H.h, t, M.wall, 0, H.h / 2, -H.d / 2 - t / 2);
    box(H.w, H.h, t, M.wall, 0, H.h / 2, H.d / 2 + t / 2);
    // vigas del techo y una puerta que no abre (está cerrada de afuera)
    for (const x of [-1.8, 0, 1.8]) box(0.16, 0.18, H.d, M.beam, x, H.h - 0.09, 0);
    box(0.95, 2.05, 0.06, M.beam, 1.9, 1.025, H.d / 2 - 0.03);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.gold);
    knob.position.set(1.55, 1, H.d / 2 - 0.08);
    grp.add(knob);
    // la lamparita (sin luz de verdad: brilla sola)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.glow);
    bulb.position.set(0, H.h - 0.45, 0);
    grp.add(bulb);
    const wire = box(0.01, 0.3, 0.01, M.beam, 0, H.h - 0.25, 0);
    wire.material = M.beam;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.55 }));
    halo.scale.setScalar(1.4);
    halo.position.copy(bulb.position);
    grp.add(halo);
    // la escultura del Chiquitijuein, de mármol, en su pedestal
    box(0.9, 0.9, 0.9, M.stone, -1.6, 0.45, -1.4);
    box(1.02, 0.08, 1.02, M.gold, -1.6, 0.94, -1.4);
    const chiqui = buildChiqui(T);
    chiqui.root.traverse((o) => {
      if (o.isMesh) o.material = M.stone;
      if (o.isSprite) o.visible = false;
    });
    chiqui.root.scale.setScalar(1.35);
    chiqui.root.position.set(-1.6, 0.98, -1.4);
    chiqui.root.rotation.y = 0.6;
    grp.add(chiqui.root);
    // el cartelito del pedestal
    const plate = document.createElement('canvas');
    plate.width = 256;
    plate.height = 64;
    const px = plate.getContext('2d');
    px.fillStyle = '#e6c46a';
    px.fillRect(0, 0, 256, 64);
    px.fillStyle = '#3a2408';
    px.font = 'italic bold 20px Georgia, serif';
    px.textAlign = 'center';
    px.fillText('Al Chiquitijuein,', 128, 27);
    px.fillText('que todo lo ve', 128, 51);
    const ptex = new THREE.CanvasTexture(plate);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshBasicMaterial({ map: ptex, fog: false }));
    pm.position.set(-1.6, 0.6, -0.94);
    grp.add(pm);
    // el Mate Meme de tiza en la pared de enfrente
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.125), new THREE.MeshBasicMaterial({ map: chalkTexture(), fog: false }));
    chalk.position.set(1.2, 1.45, -H.d / 2 + 0.01);
    grp.add(chalk);
    this.buyPos = new THREE.Vector3(H.x + 1.2, H.y + 1.1, H.z - H.d / 2 + 0.6);
    this.spawn = new THREE.Vector3(H.x - 0.4, H.y, H.z + 1.2);
    this.root.visible = true;
  }

  register() {
    const g = this.g;
    g.interact.add({
      kind: 'ee',
      local: true,
      pos: this.buyPos,
      radius: 1.8,
      prompt: () => {
        const W = g.weapons;
        if (!W.has('meme')) return `comprar el ${WEAPONS.meme.name}`;
        if (W.ammoFull('meme')) return { text: 'El Mate Meme ya está lleno', noCost: true, info: true };
        return 'munición del Mate Meme';
      },
      cost: () => (!g.weapons.has('meme') ? MEME.cost : g.weapons.ammoFull('meme') ? 0 : MEME.ammo),
      use: () => {
        const W = g.weapons;
        if (W.has('meme')) return !!W.refillAmmo('meme');
        W.give('meme', 0);
        return true;
      },
    });
  }

  // Adentro: la visita dura `secs` y después la bombilla te deja en `land` (piso n).
  enter(n, land, debug = false) {
    const g = this.g;
    const p = g.player;
    this.visit = { t: 0, dur: debug ? STAY_DEBUG : STAY, n, land: land.clone(), warned: false };
    p.pos.copy(this.spawn);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
    p.pitch = 0;
    p.airTop = p.pos.y;
    p.ride = (dt) => this.step(dt);
    // mientras estás acá los muertos no te buscan (si no, se amontonan justo
    // arriba y al volver te comen). ghost viaja en línea: el anfitrión también
    // deja de mandarlos por el invitado.
    p.ghost = true;
    g.post?.flash(0.7);
    g.fx.addShake(0.4);
    if (debug) g.hud.subtitle('Modo prueba: la casita escondida.', 4, 'boss');
  }

  // Cada cuadro adentro: a la altura de la casita y sin salir de las paredes.
  step(dt) {
    const g = this.g;
    const p = g.player;
    const V = this.visit;
    if (!V) {
      p.ride = null;
      return;
    }
    const H = HOUSE;
    V.t += dt;
    p.pos.y = H.y;
    p.vel.y = 0;
    p.onGround = true;
    p.airTop = H.y;
    const r = 0.35;
    p.pos.x = Math.max(H.x - H.w / 2 + r, Math.min(H.x + H.w / 2 - r, p.pos.x));
    p.pos.z = Math.max(H.z - H.d / 2 + r, Math.min(H.z + H.d / 2 - r, p.pos.z));
    // (la escultura en su pedestal no se atraviesa)
    const sx = H.x - 1.6;
    const sz = H.z - 1.4;
    const dx = p.pos.x - sx;
    const dz = p.pos.z - sz;
    if (Math.abs(dx) < 0.45 + r && Math.abs(dz) < 0.45 + r) {
      if (Math.abs(dx) > Math.abs(dz)) p.pos.x = sx + Math.sign(dx || 1) * (0.45 + r);
      else p.pos.z = sz + Math.sign(dz || 1) * (0.45 + r);
    }
    if (!V.warned && V.dur - V.t < 5) {
      V.warned = true;
      this.ch.slurp(this.spawn);
    }
    if (V.t >= V.dur || !p.alive || p.downed) this.leave();
  }

  leave() {
    const g = this.g;
    const p = g.player;
    const V = this.visit;
    this.visit = null;
    if (p.ride) p.ride = null;
    p.ghost = false;
    if (!V) return;
    // el lugar del piso más lejos de los muertos, y unos segundos de gracia
    // (sin blanco, los que estén cerca se abren solos: Zombies.chase)
    p.pos.copy(this.ch.landingSpot(V.n, true) || V.land);
    p.vel.set(0, 0, 0);
    p.airTop = p.pos.y;
    if (p.alive && !p.downed) p.guardT = g.time + GUARD;
    g.post?.flash(0.6);
    g.audio.whoosh?.(p.pos.clone());
  }

  dispose() {
    const p = this.g.player;
    if (this.visit && p) {
      p.ride = null;
      p.ghost = false;
    }
    this.visit = null;
    this.root.removeFromParent();
  }
}
