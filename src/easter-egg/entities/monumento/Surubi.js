import * as THREE from 'three';
import { EE } from '../../config/map';

// El Surubí del Paraná: el minijefe del Monumento. Un bagre pintado de cinco
// metros que sale del agua (el río, los espejos del Pasaje o una boca de
// tormenta), se arrastra por tierra persiguiendo, muerde, latiguea con los
// bigotes (al que agarra lo arrastra hasta la boca: la cadena del Alcaide,
// entities/bossMoves.js) y se tira de panza para adelante.
//
// Para el juego es un jefe más (Zombies: kind 'surubi', se mueve, pelea y se
// sincroniza como los otros); acá va el cuerpo: el de piezas queda escondido
// y se dibuja el pez, que sigue al jefe (posición, rumbo y estado). Su golpe
// es propio (hitTest: esferas a lo largo del cuerpo; la cabeza vale doble).
// También la vuelta del Pack-a-Pava: emergeWithPava() lo saca en el muelle
// con la pava en la boca; a media vida la escupe y se zambulle.

const LEN = 6.4;
const SEG = 18;
const RING = 14;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// El cuero del surubí pintado: lomo gris oliva con manchas negras redondas y
// barras oscuras, los costados más claros y la panza blanca (u: la vuelta,
// v: de la cabeza a la cola).
function skinTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 512, 0);
  // u = 0 la panza, 0,5 el lomo, 1 la panza otra vez
  grd.addColorStop(0, '#e8e4d6');
  grd.addColorStop(0.18, '#d4cfbc');
  grd.addColorStop(0.3, '#7a7a68');
  grd.addColorStop(0.5, '#4a4c40');
  grd.addColorStop(0.7, '#7a7a68');
  grd.addColorStop(0.82, '#d4cfbc');
  grd.addColorStop(1, '#e8e4d6');
  x.fillStyle = grd;
  x.fillRect(0, 0, 512, 256);
  let s = 77;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // las barras verticales (de lomo hacia los costados)
  x.fillStyle = 'rgba(20,22,18,0.55)';
  for (let k = 0; k < 9; k++) {
    const v = 30 + k * 24 + r() * 6;
    x.beginPath();
    x.ellipse(256, v, 120 + r() * 30, 4 + r() * 3, 0, 0, Math.PI * 2);
    x.fill();
  }
  // las manchas
  for (let k = 0; k < 260; k++) {
    const u = 120 + r() * 272;
    const v = r() * 256;
    const rr = 2 + r() * 6;
    x.fillStyle = `rgba(16,16,14,${0.55 + r() * 0.35})`;
    x.beginPath();
    x.arc(u, v, rr, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// El ancho y el alto del cuerpo a lo largo (0 la trompa, 1 la cola).
const W = (v) => (v < 0.06 ? 0.55 + v * 5 : v < 0.25 ? 0.85 : 0.85 * Math.pow(1 - (v - 0.25) / 0.75, 0.9) + 0.06);
const H = (v) => (v < 0.06 ? 0.3 + v * 4 : v < 0.3 ? 0.55 + (v - 0.06) * 0.4 : 0.64 * Math.pow(1 - (v - 0.3) / 0.7, 0.8) + 0.05);

export default class Surubi {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    this.root.visible = false;
    g.scene.add(this.root);
    this.build();
    this.spine = Array.from({ length: SEG + 1 }, (_, i) => ({ p: new THREE.Vector3(), yaw: 0 }));
    this.mouth = 0;
    this.lash = 0;
    this.t = 0;
    this.pavaCb = null;
  }

  // ---------------- el cuerpo ----------------
  build() {
    const skin = new THREE.MeshStandardMaterial({ map: skinTexture(), roughness: 0.42, metalness: 0.05, flatShading: true });
    this.skinMat = skin;
    // la malla del cuerpo: anillos a lo largo (se deforman cada cuadro)
    const pos = [];
    const uv = [];
    const idx = [];
    for (let j = 0; j <= SEG; j++) {
      for (let i = 0; i <= RING; i++) {
        pos.push(0, 0, 0);
        uv.push(i / RING, j / SEG);
      }
    }
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < RING; i++) {
        const a = j * (RING + 1) + i;
        const b = a + RING + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.bodyGeo = geo;
    this.body = new THREE.Mesh(geo, skin);
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    this.root.add(this.body);
    // la boca (adentro oscuro), los ojos, los bigotes y las aletas
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a0e0c, roughness: 0.6 });
    const fin = new THREE.MeshStandardMaterial({ color: 0x5a5a4a, roughness: 0.55, side: THREE.DoubleSide, transparent: true, opacity: 0.92, flatShading: true });
    this.finMat = fin;
    const eye = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc030, emissiveIntensity: 1.4, roughness: 0.2 });
    this.head = new THREE.Group();
    this.root.add(this.head);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x4e5044, roughness: 0.45, flatShading: true });
    const chin = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.5, flatShading: true });
    const jawU = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.75, 0.6, 0.95), headMat);
    jawU.position.set(0, 0.04, 0.0);
    this.head.add(jawU);
    this.jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.68, 0.52, 0.9), chin);
    this.head.add(this.jaw);
    this.maw = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).scale(1.15, 0.5, 1), dark);
    this.maw.position.set(0, 0.0, 0.36);
    this.head.add(this.maw);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eye);
      e.position.set(s * 0.62, 0.24, 0.0);
      this.head.add(e);
    }
    // los bigotes: dos largos (de la mandíbula de arriba) y cuatro cortos (del mentón)
    this.barbels = [];
    const bgeo = new THREE.CylinderGeometry(0.018, 0.035, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const mk = (x, y, z, len, segs, yaw) => {
      const chain = [];
      let parent = this.head;
      for (let k = 0; k < segs; k++) {
        const m = new THREE.Mesh(bgeo, skin);
        m.scale.set(1 - k * 0.12, 1 - k * 0.12, len / segs);
        if (k === 0) m.position.set(x, y, z);
        else m.position.set(0, 0, 1);
        m.rotation.y = k === 0 ? yaw : 0;
        parent.add(m);
        chain.push(m);
        parent = m;
      }
      this.barbels.push({ chain, yaw, len });
    };
    mk(-0.8, 0.08, 0.2, 2.4, 6, -0.9);
    mk(0.8, 0.08, 0.2, 2.4, 6, 0.9);
    for (const [x, yaw] of [[-0.34, -0.35], [-0.12, -0.1], [0.12, 0.1], [0.34, 0.35]]) mk(x, -0.22, 0.3, 0.8, 3, yaw);
    // las aletas (se ponen en el lomo y los costados al deformar el cuerpo)
    const tri = (a, b, c) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b, c]);
      g.computeVertexNormals();
      return g;
    };
    this.fins = {
      dorsal: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.25), new THREE.Vector3(0, 0.55, -0.05), new THREE.Vector3(0, 0, -0.45)), fin),
      adiposa: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0.2, -0.1), new THREE.Vector3(0, 0, -0.5)), fin),
      pecL: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.15), new THREE.Vector3(0.75, -0.08, -0.3), new THREE.Vector3(0, 0, -0.25)), fin),
      pecR: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.15), new THREE.Vector3(-0.75, -0.08, -0.3), new THREE.Vector3(0, 0, -0.25)), fin),
      colaA: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0.75, -0.75), new THREE.Vector3(0, 0.05, -0.35)), fin),
      colaB: new THREE.Mesh(tri(new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, -0.6, -0.7), new THREE.Vector3(0, -0.05, -0.35)), fin),
    };
    for (const f of Object.values(this.fins)) {
      f.scale.setScalar(1.6);
      f.castShadow = true;
      this.root.add(f);
    }
    // la pava en la boca (la vuelta del Pack-a-Pava)
    const al = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 });
    this.pava = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.7, 0.15], [0.68, 0.55], [0.45, 0.85], [0.18, 0.95], [0.2, 1.02]].map(([r, y]) => new THREE.Vector2(r * 0.4, y * 0.4)), 16), al);
    this.pava.position.set(0, -0.1, 0.32);
    this.pava.rotation.x = 1.2;
    this.pava.visible = false;
    this.head.add(this.pava);
  }

  // ---------------- cada cuadro ----------------
  get boss() {
    const b = this.g.zombies?.boss;
    return b && b.kind === 'surubi' ? b : null;
  }

  update(dt) {
    const g = this.g;
    const z = this.boss;
    this.root.visible = !!z;
    if (!z) return;
    // el cuerpo de piezas no se dibuja (ni su sombra redonda)
    const R = g.zombies.bossRig;
    if (R?.rig) R.rig.visible = false;
    this.t += dt;
    const t = this.t;
    const st = z.state;
    const moving = st === 'chase' || st === 'toLock' || st === 'charge';
    const speed = moving ? (st === 'charge' ? 3 : 1) : 0.15;
    // la boca: abierta mordiendo, rugiendo y llamando
    const open = st === 'slam' ? Math.min(1, z.stateT * 3) * (z.stateT < 0.9 ? 1 : Math.max(0, 1 - (z.stateT - 0.9) * 3)) : st === 'intro' || st === 'enrage' || st === 'summon' ? 0.9 : st === 'whipWind' ? 0.5 : z.dead ? 0.6 : 0.08 + Math.sin(t * 1.3) * 0.04;
    this.mouth += (open - this.mouth) * Math.min(1, dt * 10);
    // el latigazo de los bigotes
    const lash = st === 'whipWind' ? 0.6 : st === 'whip' ? 1 : 0;
    this.lash += (lash - this.lash) * Math.min(1, dt * 8);
    // el emerger: sube del agua/del piso (intro)
    const rise = st === 'intro' ? Math.min(1, z.stateT / 1.4) : 1;
    // la columna: de la cabeza (z.pos, rumbo z.yaw) hacia atrás, ondulando
    const y0 = (z.baseY ?? z.pos.y ?? 0) - (1 - rise) * 1.2;
    const sp = this.spine;
    const hy = z.yaw;
    let px = z.pos.x;
    let pz = z.pos.z;
    let yaw = hy;
    const step = LEN / SEG;
    for (let j = 0; j <= SEG; j++) {
      const v = j / SEG;
      // la onda del arrastre: más fuerte hacia la cola
      const wave = Math.sin(t * (moving ? 7 * speed : 1.5) - v * 7) * (0.12 + v * 0.55) * (moving ? 1 : 0.35);
      const bend = j === 0 ? 0 : wave * 0.35;
      yaw += bend * (j === 0 ? 0 : 0.18);
      const s = sp[j];
      s.yaw = yaw + wave * 0.5;
      s.p.set(px, y0 + H(v) * 1.15, pz);
      // muerto: de costado
      px -= Math.sin(yaw) * step;
      pz -= Math.cos(yaw) * step;
      yaw += (hy - yaw) * 0.05;
    }
    // la malla del cuerpo
    const P = this.bodyGeo.attributes.position;
    const roll = z.dead ? Math.min(1.4, (z.corpseT || 0) * 2) : Math.sin(t * 7) * 0.05 * speed;
    for (let j = 0; j <= SEG; j++) {
      const v = j / SEG;
      const s = sp[j];
      const w = W(v) * 0.95;
      const h = H(v) * 1.3;
      const cy = Math.cos(s.yaw);
      const sy = Math.sin(s.yaw);
      for (let i = 0; i <= RING; i++) {
        const a = (i / RING) * Math.PI * 2;
        // la sección: chata abajo (la panza), redonda arriba; la cabeza más chata
        let lx = Math.sin(a) * w;
        let ly = -Math.cos(a) * h * (Math.cos(a) > 0 ? 0.55 : 1);
        if (j <= 1) ly *= 0.85;
        // rolido
        const rx = lx * Math.cos(roll) - ly * Math.sin(roll);
        const ry = lx * Math.sin(roll) + ly * Math.cos(roll);
        lx = rx;
        ly = ry;
        P.setXYZ(j * (RING + 1) + i, s.p.x + lx * cy, s.p.y + ly, s.p.z - lx * sy);
      }
    }
    P.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    this.bodyGeo.computeBoundingSphere();
    // la cabeza va adelante del primer anillo, con la boca que se abre
    const h0 = sp[0];
    this.head.position.set(h0.p.x + Math.sin(hy) * 0.32, h0.p.y - 0.08, h0.p.z + Math.cos(hy) * 0.32);
    this.head.rotation.set(-this.mouth * 0.25, hy, z.dead ? roll : 0);
    this.jaw.rotation.x = this.mouth * 0.7;
    this.maw.scale.set(1, 0.2 + this.mouth * 1.6, 1);
    // los bigotes: ondean y en el latigazo se estiran adelante
    for (const B of this.barbels) {
      B.chain.forEach((m, k) => {
        const wv = Math.sin(t * 3 + k * 0.8 + B.yaw * 3) * 0.25;
        m.rotation.x = this.lash > 0.1 ? -0.05 * k * (1 - this.lash) : 0.25 + wv * 0.4;
        m.rotation.y = (k === 0 ? B.yaw * (1 - this.lash * 0.85) : wv * 0.5 * (1 - this.lash));
        if (B.len > 1) m.scale.z = (B.len / B.chain.length) * (1 + this.lash * 2.2);
      });
    }
    // las aletas, a su anillo
    const at = (j, ox, oy, yawExtra, f) => {
      const s = sp[j];
      f.position.set(s.p.x + Math.cos(s.yaw) * ox, s.p.y + oy, s.p.z - Math.sin(s.yaw) * ox);
      f.rotation.set(0, s.yaw + yawExtra, z.dead ? roll : 0);
    };
    at(4, 0, H(4 / SEG) * 1.05, 0, this.fins.dorsal);
    at(12, 0, H(12 / SEG) * 1.1, 0, this.fins.adiposa);
    at(3, 0.55, -0.25, 0, this.fins.pecL);
    at(3, -0.55, -0.25, 0, this.fins.pecR);
    this.fins.pecL.rotation.z = -0.2 + Math.sin(t * 4) * 0.25 * speed;
    this.fins.pecR.rotation.z = 0.2 - Math.sin(t * 4) * 0.25 * speed;
    at(SEG, 0, 0, Math.sin(t * 7 * speed) * 0.4, this.fins.colaA);
    at(SEG, 0, 0, Math.sin(t * 7 * speed) * 0.4, this.fins.colaB);
    this.pava.visible = !!z.pava;
    // la vuelta del Pack-a-Pava: a media vida escupe la pava y se zambulle
    if (z.pava && !z.dead && z.hp < z.maxHp * 0.5 && !g.net?.guest) this.spitPava(z);
  }

  // ---------------- el golpe (los tiros) ----------------
  // Esferas a lo largo del cuerpo; la cabeza (las dos primeras) es 'head'.
  hitTest(o, d, maxT) {
    const z = this.boss;
    if (!z || z.dead) return null;
    let best = null;
    for (let j = 0; j <= SEG; j += 2) {
      const s = this.spine[j];
      const v = j / SEG;
      const r = Math.max(0.35, W(v) * 0.95);
      tmpV.subVectors(s.p, o);
      const along = tmpV.dot(d);
      if (along < 0 || along > maxT) continue;
      const perp2 = tmpV.lengthSq() - along * along;
      if (perp2 > r * r) continue;
      const tt = along - Math.sqrt(r * r - perp2);
      if (!best || tt < best.t) best = { z, t: Math.max(0, tt), zone: j <= 2 ? 'head' : 'torso' };
    }
    return best;
  }

  // ---------------- dónde sale ----------------
  // El agua más cercana al jugador con camino abierto: la orilla de la
  // Costanera, el estanque del Pasaje o el espejo del sur; si no, una boca de
  // tormenta de las calles (sale del desagüe).
  spotNear(p) {
    const g = this.g;
    const cands = [];
    if (g.activeZones.has('H')) for (let z = 8; z <= 52; z += 4) cands.push([112.3, z, 'rio']);
    if (g.activeZones.has('E')) {
      for (let x = 7; x <= 17; x += 3) cands.push([x, 27.3, 'pozo']);
      for (let x = 7; x <= 17; x += 4) cands.push([x, 36.5, 'espejo']);
    }
    let best = null;
    let bd = Infinity;
    for (const [x, z, k] of cands) {
      const d = g.nav.distAt(x, z);
      if (!Number.isFinite(d)) continue;
      const s = Math.abs(d - 14);
      if (s < bd) {
        bd = s;
        best = [x, z, k];
      }
    }
    if (!best) return null;
    return { at: new THREE.Vector3(best[0], g.world.floorAt(best[0], best[1]), best[1]), kind: best[2] };
  }

  // Al aparecer: el chapuzón (o el estallido del desagüe).
  emergeFx(z) {
    const g = this.g;
    const p = tmpW.set(z.pos.x, (z.baseY || 0) + 0.3, z.pos.z);
    for (let k = 0; k < 4; k++) g.fx.steam(p, 6, 1.2);
    g.water?.splash?.(Math.max(113.2, z.pos.x + 1.2), z.pos.z, 3);
    g.fx.dirt?.(p, 22);
    g.audio.growl?.(p.clone().setY(p.y + 1), 'boss');
  }

  // ---------------- la vuelta del Pack-a-Pava ----------------
  emergeWithPava(cb) {
    const g = this.g;
    if (g.zombies.boss) {
      // (ya hay un jefe en la cancha: se suelta y hay que volver a pescar)
      g.hud.subtitle('Se soltó. Hay demasiado lío arriba: probá de nuevo.', 3);
      g.later?.(0.1, () => g.papq?.termas?.onFish?.('cut'));
      return;
    }
    const [cx, cz] = EE.cana;
    const at = new THREE.Vector3(cx - 2.2, g.world.floorAt(cx - 2.2, cz), cz + 2.5);
    const z = g.zombies.spawnBoss(g.rounds.round, { at, kind: 'surubi' });
    if (!z) return cb();
    z.pava = true;
    // con la pava en la boca, menos vida (es para sacarla, no para matarlo)
    z.maxHp *= 0.55;
    z.hp = z.maxHp;
    this.pavaCb = cb;
  }

  spitPava(z) {
    const g = this.g;
    z.pava = false;
    const cb = this.pavaCb;
    this.pavaCb = null;
    g.fx.steam(z.pos.clone().setY((z.baseY || 0) + 0.8), 12, 0.6);
    g.audio.growl?.(z.pos.clone().setY((z.baseY || 0) + 1), 'boss');
    // se vuelve al agua (sin morir: no da el premio del jefe)
    g.later?.(0.4, () => {
      if (g.zombies.boss === z) {
        g.water?.splash?.(113.6, z.pos.z, 3);
        g.zombies.removeBoss();
        g.hud.setBossBar?.(null);
      }
    });
    cb?.();
  }

  dispose() {
    this.root.removeFromParent();
    this.bodyGeo.dispose();
  }
}
