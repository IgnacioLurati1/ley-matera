import * as THREE from 'three';
import Arena from './Arena';
import { mesh, cylGeo, boxGeo, mergeByMaterial } from './props';
import { EE } from '../config/map';
import { buildCarcel } from './cerroCarcel';
import GilHeld, { HELD_HOME } from './gilHeld';
import { soulGeometry, soulMaterial, SOUL_TIME } from './soulLook';
import { warmObject } from '../fx/ghostMat';
import { PENAL_CARCEL } from '../core/music';

// El Cerro del Espinillo: la punta de la isla, arriba de la capilla del penal.
// Cuando el mate supremo queda armado en el espinillo aparece el Gauchito Gil,
// que resultó ser el carcelero de las almas del penal. La pelea tiene dos fases
// (lo pidió el usuario el 2026-09-28):
//  1. En el cerro, hasta el 70% de la vida: el Gaucho juega con sus cadenas.
//     La tira y al que agarra lo trae de un tirón (entities/bossMoves.js
//     chainThrow, como el Alcaide), la revolea a la altura de las rodillas
//     alrededor suyo (el molinete: hay que saltarla) y llueven cadenas del
//     cielo. Sus devotos (los presos) lo protegen cuando llama. Sin bolas de
//     fuego (eran las del Mandinga).
//  2. Con el 70% se revela el carcelero y los arrastra a todos a su cárcel, La
//     Cárcel de las Almas (world/cerroCarcel.js): colgada en la tormenta arriba
//     del río y más grande que el cerro. Todo colorado y más rápido; recién acá
//     encadena a uno a una estaca a la espalda (el gancho), el molinete da dos
//     vueltas y la lluvia de cadenas es más seguida. Cuando cae, las almas de
//     las celdas se sueltan y lo agarran; él se resiste y, con un pantallazo
//     blanco, se lleva a todos de vuelta al cerro (world/gilHeld.js), donde
//     queda de rodillas y sigue el final (ui/PenalCinematic.js).
// El anfitrión decide el traslado ('gil2') y la vuelta ('gilBack') y avisa por
// 'bfx' (entities/bossMoves.js se los pasa a onBfx).

// con esta parte de la vida se los lleva a la cárcel
const SHIFT_AT = 0.7;
// el molinete: cuánto avisa el aro del piso, entre vuelta y vuelta, y cuánto pega
const SWEEP_WARN = 1.05;
const SWEEP_GAP = 0.8;
const SWEEP_DMG = 40;
const SWEEP_LINKS = 64;
// (saltando, los pies tienen que estar por lo menos a esta altura del piso)
const SWEEP_JUMP = 0.3;
// cuando cae: cuándo vuelven al cerro (las almas lo agarran y él se los lleva
// con el pantallazo blanco: world/gilHeld.js), y cuánto se miran las almas del
// cerro antes del final
const HOME_AT = HELD_HOME;
const HOME_WATCH = 6;

const tmpV = new THREE.Vector3();

export default class Cerro extends Arena {
  constructor(game) {
    super(game, { ...EE.arena });
    // A: la arena en la que se pelea ahora (el cerro o la cárcel)
    this.A1 = this.A;
    this.A2 = { ...EE.arena2 };
    this.stage = 1;
    this.sweepS = null;
    // cuando cae en la cárcel: las almas lo agarran (world/gilHeld.js)
    this.held = new GilHeld(game);
  }

  setup() {
    super.setup();
    this.name = 'El Cerro del Espinillo';
    this.sub = 'Donde lo colgaron... o eso dicen';
    this.bossName = 'El Gauchito Gil';
    this.bossHp = 230000;
    this.wards = [0.8, 0.55, 0.3];
    // (no corre: camina; el paso le da hasta ~4,3 m/s, entities/skins/gil.js)
    this.speeds = [3.3, 3.8, 4.2];
    this.rainColor = 0xff2020;
    this.fireColor = 0xff3020;
    this.rainBoom = [1, 0.15, 0.1];
    this.weatherName = 'storm';
    // las cadenas del cielo caen desde que le sacan el primer 10%
    this.rainFrom = 0.9;
    // (el cerro es chico: círculos más chicos; en la cárcel, 2,1)
    this.rainR = 1.5;
    this.lines = {
      greet: ['gil', 'Cien años cuidé este penal... ¿y ahora vienen a soltarme los presos? Nadie sale sin mi permiso.'],
      rain: '¡Caen cadenas del cielo! Salí de los círculos.',
      ward: 'Los devotos lo protegen: ¡liquidá a los presos para que se le caiga el escudo!',
      unward: '¡Se le cayó la protección! Ahora, dale.',
      summon: 'El Gauchito llama a sus presos...',
      sweep: '¡Gil revolea la cadena! Saltala cuando pase.',
    };
  }

  bossOpts() {
    const [x, z] = EE.altar;
    return { at: new THREE.Vector3(x + 0.4, this.A.y || 0, z - 2.6), mandinga: true, kind: 'gil', hp: this.bossHp };
  }

  // El cerro es parte del mapa: acá solo van las velas de las promesas y el escudo.
  build() {
    const M = this.g.world.M;
    // (el cerro: las almas, las velas y las luces quedan acá aunque se pelee en la cárcel)
    this.home = this.A;
    const { x, z, r } = this.A;
    const y = this.A.y || 0;
    this.braziers = [];
    // botellas de agua y velas coloradas en ronda (las promesas)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const bx = x + Math.cos(a) * (r - 1.1);
      const bz = z + Math.sin(a) * (r - 1.1);
      this.root.add(mesh(cylGeo(0.05, 0.05, 0.3, 6), M.redPaint, bx, y + 0.15, bz));
      this.root.add(mesh(cylGeo(0.06, 0.06, 0.28, 8), M.glass, bx + 0.2, y + 0.14, bz + 0.1));
      this.braziers.push(new THREE.Vector3(bx, y + 0.35, bz));
    }
    this.lights = [0, 1].map((k) => {
      const l = new THREE.PointLight(0xff3a2a, 0, 28, 1.6);
      l.position.set(x + (k ? 4 : -4), y + 3.5, z);
      this.g.scene.add(l);
      return l;
    });
    this.lightHome = this.lights.map((l) => l.position.clone());
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    // las cadenas que caen sobre cada círculo
    this.chainGeo = new THREE.TorusGeometry(0.1, 0.025, 5, 10);
    this.chainMat = M.iron;
    // el molinete: el aro que avisa en el piso y la cadena que gira
    this.sweepRing = new THREE.Mesh(this.rainGeo, new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sweepRing.visible = false;
    this.g.scene.add(this.sweepRing);
    this.sweepChain = new THREE.InstancedMesh(new THREE.TorusGeometry(0.09, 0.024, 4, 8), M.iron, SWEEP_LINKS);
    this.sweepChain.visible = false;
    this.sweepChain.frustumCulled = false;
    this.g.scene.add(this.sweepChain);
    // tres capillitas del Gauchito adentro del cerro: tapan y, si Gil embiste
    // contra una, queda atontado
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const cx = x + Math.cos(a) * 4.3;
      const cz = z + Math.sin(a) * 4.3;
      const face = Math.atan2(x - cx, z - cz);
      this.root.add(mesh(boxGeo(0.9, 1.1, 0.7), M.redPaint, cx, y + 0.55, cz, 0, face, 0));
      this.root.add(mesh(boxGeo(1.05, 0.12, 0.85), M.woodDark, cx, y + 1.16, cz, 0, face, 0));
      this.root.add(mesh(cylGeo(0.05, 0.05, 0.2, 6), M.candle, cx + Math.sin(face) * 0.4, y + 0.3, cz + Math.cos(face) * 0.4));
      this.cols.push({ x: cx, z: cz, r: 0.7, h: 1.25, what: 'la capillita' });
    }
    this.cols1 = this.cols;
    this.decor();
  }

  // Las almas del penal encadenadas alrededor del cerro: figuras azuladas
  // (una sola malla instanciada, aditiva) de rodillas contra la baranda, con
  // cadenas a estacas de hierro; cintas coloradas en postes, un anillo rojo en
  // el piso y velitas. Todo en el borde, sin choques ni luces. Cuando cae el
  // Gauchito (el carcelero) las almas se sueltan y suben.
  decor() {
    const M = this.g.world.M;
    const { x, z, r } = this.home;
    const y = this.home.y || 0;
    let seed = 31;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const at = (a, d) => [x + Math.cos(a) * d, z + Math.sin(a) * d];
    const face = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
    // la entrada (oeste) y las banderas del mapa quedan libres
    const busy = [Math.PI, 3.88, 5.54, 0.745, 2.42];
    const near = (a, list, w) => list.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w);

    // ---- las almas: arrodilladas mirando al centro, con las manos atadas adelante ----
    // (el cuerpo y el brillo de ánima: world/soulLook.js)
    const soulGeo = soulGeometry('kneel');
    const angles = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.12;
      if (!near(a, busy, 0.3)) angles.push(a + (rnd() - 0.5) * 0.08);
    }
    this.souls = new THREE.InstancedMesh(soulGeo, soulMaterial({ top: 1.38, tail: 0.4 }), angles.length);
    this.souls.frustumCulled = false;
    this.soulData = angles.map((a) => {
      const [sx, sz] = at(a, r + 0.45);
      return { a, x: sx, z: sz, yaw: face(a) + (rnd() - 0.5) * 0.3, s: 1.15 + rnd() * 0.25, ph: rnd() * 6.28, rise: 0.6 + rnd() * 0.8 };
    });
    this.root.add(this.souls);
    this.freed = false;
    this.freeT = 0;

    // ---- cadenas: de las muñecas a una estaca de hierro clavada adelante ----
    const tmp = [];
    const links = [];
    for (const s of this.soulData) {
      const fx = -Math.cos(s.a);
      const fz = -Math.sin(s.a);
      const wrist = new THREE.Vector3(s.x + fx * 0.36 * s.s, y + 0.72 * s.s, s.z + fz * 0.36 * s.s);
      const [kx, kz] = at(s.a, r - 0.35);
      const stake = new THREE.Vector3(kx, y + 0.34, kz);
      tmp.push(mesh(cylGeo(0.03, 0.035, 0.5, 6), M.iron, kx, y + 0.18, kz, (rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25));
      tmp.push(mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 10), M.iron, kx, y + 0.36, kz, Math.PI / 2, 0, 0));
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const p = new THREE.Vector3().lerpVectors(wrist, stake, t);
        p.y -= Math.sin(t * Math.PI) * 0.16;
        links.push({ p, ry: face(s.a), twist: i % 2 ? Math.PI / 2 : 0, fall: 0 });
      }
    }
    this.links = new THREE.InstancedMesh(new THREE.TorusGeometry(0.038, 0.01, 4, 8).rotateY(Math.PI / 2), M.iron, links.length);
    this.linkData = links;
    this.placeLinks(0);
    this.root.add(this.links);

    // ---- postes con cintas coloradas (las promesas) ----
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.35;
      if (near(a, busy, 0.25)) continue;
      const [px, pz] = at(a, r + 0.15);
      const h = 1.3 + rnd() * 0.4;
      tmp.push(mesh(cylGeo(0.045, 0.06, h, 6), M.log, px, y + h / 2 - 0.05, pz, (rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12));
      for (let k = 0; k < 4; k++) {
        const len = 0.45 + rnd() * 0.45;
        const t = rnd() * Math.PI * 2;
        tmp.push(mesh(new THREE.PlaneGeometry(0.07, len).translate(0, -len / 2, 0), M.redCloth, px + Math.cos(t) * 0.06, y + h - 0.12 - k * 0.07, pz + Math.sin(t) * 0.06, (rnd() - 0.5) * 0.5, t, (rnd() - 0.5) * 0.5));
      }
    }

    // ---- velitas: los cuerpos se funden, los fuegos son un solo Points ----
    const flames = [];
    for (let i = 0; i < 44; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r - 0.15 + rnd() * 0.5;
      const h = 0.08 + rnd() * 0.12;
      if (near(a, [Math.PI], 0.4)) continue;
      const [cx, cz] = at(a, d);
      tmp.push(mesh(cylGeo(0.022, 0.024, h, 6), i % 3 ? M.redPaint : M.candle, cx, y + h / 2, cz));
      flames.push(cx, y + h + 0.035, cz);
    }
    for (const o of tmp) this.root.add(o);
    mergeByMaterial(this.root, [this.souls, this.links]);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(flames, 3));
    this.flameCol = new Float32Array(flames.length);
    fg.setAttribute('color', new THREE.BufferAttribute(this.flameCol, 3));
    this.candles = new THREE.Points(fg, new THREE.PointsMaterial({ map: this.g.textures.dot, size: 0.3, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.candles.frustumCulled = false;
    this.root.add(this.candles);

    // ---- el anillo colorado en el piso (brilla, se suma a la luz) ----
    const S = 1024;
    const R = r + 1.2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const px = (m) => (m / R) * (S / 2);
    const mid = S / 2;
    for (const [rad, w, cs] of [[r - 0.15, 26, 'rgba(160,10,4,0.35)'], [r - 0.15, 7, 'rgba(255,40,20,0.8)'], [r - 0.55, 2.5, 'rgba(255,60,30,0.55)']]) {
      ctx.strokeStyle = cs;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(mid, mid, px(rad), 0, Math.PI * 2);
      ctx.stroke();
    }
    // chorreadas hacia adentro
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = px(r - 0.15);
      const len = px(0.2 + rnd() * 0.9);
      ctx.strokeStyle = `rgba(255,${(30 + rnd() * 40) | 0},15,${0.25 + rnd() * 0.4})`;
      ctx.lineWidth = 1.5 + rnd() * 3;
      ctx.beginPath();
      ctx.moveTo(mid + Math.cos(a) * r0, mid + Math.sin(a) * r0);
      const b = a + (rnd() - 0.5) * 0.08;
      ctx.lineTo(mid + Math.cos(b) * (r0 - len), mid + Math.sin(b) * (r0 - len));
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // el aro tiene uv planares sobre su radio de afuera, igual que el canvas
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 2, R, 96, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(0.9, 0.5, 0.5) }),
    );
    ring.position.set(x, y + 0.025, z);
    this.root.add(ring);
    this.updateSouls(0);
  }

  // Las cadenas (se caen al piso cuando las almas se sueltan).
  placeLinks(dt) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const y = (this.home.y || 0) + 0.02;
    for (let i = 0; i < this.linkData.length; i++) {
      const L = this.linkData[i];
      if (this.freed) L.fall = Math.min(1, L.fall + dt * 2.5);
      p.copy(L.p);
      p.y += (y - p.y) * L.fall * L.fall;
      e.set(L.fall * 1.4, L.ry, L.twist * (1 - L.fall));
      m4.compose(p, q.setFromEuler(e), one);
      this.links.setMatrixAt(i, m4);
    }
    this.links.instanceMatrix.needsUpdate = true;
  }

  // Las almas se mecen; sueltas, suben y se apagan. Las velitas titilan.
  updateSouls(dt) {
    if (!this.souls) return;
    const t = this.g.time;
    SOUL_TIME.value = t;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const c = new THREE.Color();
    const y = this.home.y || 0;
    if (this.freed) this.freeT += dt;
    // (sueltas, suben despacio: se las ve irse un rato antes del final)
    const k = this.freed ? Math.min(1, this.freeT / 5.5) : 0;
    for (let i = 0; i < this.soulData.length; i++) {
      const s = this.soulData[i];
      const lift = this.freed ? this.freeT * this.freeT * 0.38 * s.rise + this.freeT * 0.3 : 0;
      p.set(s.x, y + Math.sin(t * 1.3 + s.ph) * 0.04 + lift, s.z);
      // de rodillas y agachadas; al soltarse se enderezan y miran para arriba
      e.set(0.12 + Math.sin(t * 0.9 + s.ph) * 0.05 - k * 0.5, s.yaw, Math.sin(t * 0.7 + s.ph) * 0.04);
      s3.setScalar(s.s * (1 + k * 0.2));
      m4.compose(p, q.setFromEuler(e), s3);
      this.souls.setMatrixAt(i, m4);
      const glow = (0.85 + Math.sin(t * 2.3 + s.ph) * 0.15) * (this.freed ? Math.max(0, 1 - k) * (1 + (1 - k) * 0.8) : 1);
      this.souls.setColorAt(i, c.setScalar(glow));
      if (this.freed && k < 0.9 && Math.random() < dt * 6) this.g.fx.add.spawn(p.x, p.y + 0.8, p.z, (Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4, { color: [0.35, 0.65, 1], size: 0.2, size1: 0.02, life: 1.3, gravity: 0 });
    }
    this.souls.instanceMatrix.needsUpdate = true;
    if (this.souls.instanceColor) this.souls.instanceColor.needsUpdate = true;
    if (this.freed && this.freeT < 1) this.placeLinks(dt);
    const fc = this.flameCol;
    for (let i = 0; i < fc.length; i += 3) {
      const f = 0.7 + Math.sin(t * 13 + i * 1.7) * 0.15 + Math.sin(t * 29 + i) * 0.1;
      fc[i] = f;
      fc[i + 1] = f * 0.55;
      fc[i + 2] = f * 0.18;
    }
    this.candles.geometry.attributes.color.needsUpdate = true;
  }

  // Se sueltan las almas (cayó el carcelero).
  freeSouls() {
    if (!this.souls || this.freed) return;
    this.freed = true;
    this.freeT = 0;
    const g = this.g;
    const y = this.home.y || 0;
    for (const s of this.soulData) {
      g.fx.sparkle(new THREE.Vector3(s.x, y + 1, s.z), [0.5, 0.8, 1], 6, 0.4);
      for (let i = 0; i < 5; i++) g.fx.add.spawn(s.x, y + 0.8, s.z, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2, { color: [0.35, 0.65, 1], size: 0.22, size1: 0.04, life: 2.5, gravity: -1 });
    }
    g.audio.chain?.(new THREE.Vector3(this.home.x, y + 1, this.home.z));
  }

  start() {
    const g = this.g;
    // (siempre se empieza en el cerro)
    if (this.installed) this.uninstall();
    this.held.stop();
    this.stage = 1;
    this.A = this.A1;
    this.cols = this.cols1;
    this.name = 'El Cerro del Espinillo';
    this.rainR = 1.5;
    if (this.braziersHome) this.braziers = this.braziersHome;
    this.homing = false;
    this.lights.forEach((l, i) => l.position.copy(this.lightHome[i]));
    super.start();
    this.bindCd = 8;
    this.phase2 = false;
    this.glowK = 0;
    this.setGlow(0);
    this.sawBoss = false;
    this.endSweep();
    this.sweepSeen = false;
    if (this.freed) {
      this.freed = false;
      for (const L of this.linkData) L.fall = 0;
      this.placeLinks(0);
    }
    // la cárcel se arma ya (escondida) y se compila: así el traslado no traba
    if (!this.carcel) this.carcel = buildCarcel(g, this.A2);
    this.carcel.reset();
    this.carcel.root.visible = true;
    warmObject(g, this.carcel.root);
    this.carcel.root.visible = false;
  }

  updateShared(dt) {
    super.updateShared(dt);
    const g = this.g;
    // el invitado no pasa por onBossDead: se entera de que cayó mirando al jefe
    const b = g.zombies.boss;
    if (b && b.kind === 'gil' && !b.dead) this.sawBoss = true;
    else if (this.sawBoss && (!b || b.dead)) {
      // (en la cárcel se sueltan las de las celdas y lo agarran; las del cerro,
      // a la vuelta)
      if (this.stage === 2) this.goHome();
      else if (this.stage === 1 || this.stage === 'shift') {
        // (cayó en medio del traslado: nadie se va a la cárcel)
        if (this.stage === 'shift') {
          this.stage = 1;
          this.black(0, 0.6);
        }
        this.freeSouls();
      }
    }
    this.updateSouls(dt);
    this.updateSweep(dt);
    if (this.carcel?.root.visible) this.carcel.update(dt, g.time);
    this.held.update(dt);
  }

  // En la segunda fase la ropa del Gauchito se prende colorada.
  setGlow(k) {
    const BM = this.g.zombies.bossMats;
    if (!BM) return;
    for (const m of [BM.skin, BM.cloth, BM.poncho]) {
      m.emissive?.set(0xff1a0a);
      if (m.emissive) m.emissiveIntensity = k;
    }
  }

  // Cadenas: cada círculo recibe una que cae del cielo.
  spawnRain(flat) {
    super.spawnRain(flat);
    for (const c of this.rain.slice(-flat.length / 2)) {
      const ch = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const link = new THREE.Mesh(this.chainGeo, this.chainMat);
        link.position.y = i * 0.17;
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        ch.add(link);
      }
      ch.position.set(c.group.position.x, c.group.position.y + 14, c.group.position.z);
      this.g.scene.add(ch);
      c.chain = ch;
    }
  }

  updateRain(dt) {
    for (const c of this.rain) {
      if (!c.chain) continue;
      const k = Math.min(1, c.t / this.rainDelay);
      c.chain.position.y = c.group.position.y + 14 * (1 - k * k);
      c.chain.rotation.y += dt * 4;
    }
    const before = new Set(this.rain);
    super.updateRain(dt);
    for (const c of before) if (!this.rain.includes(c)) c.chain?.removeFromParent();
  }

  clearRain() {
    for (const c of this.rain) {
      c.group.removeFromParent();
      c.chain?.removeFromParent();
    }
    this.rain = [];
  }

  update(dt) {
    super.update(dt);
    const g = this.g;
    if (!this.active) return;
    const b = g.zombies.boss;
    const host = !g.net?.guest;
    const gil = b && !b.dead && b.kind === 'gil';
    // (anfitrión) con el 70% se los lleva a todos a la cárcel
    if (host && gil && this.stage === 1 && this.phase === 'fight' && b.hp / b.maxHp < SHIFT_AT) {
      this.beginShift();
      g.net?.event('bfx', { k: 'gil2' });
    }
    // (anfitrión) en la cárcel encadena a uno a una estaca (el gancho: entities/bossMoves.js)
    if (host && gil && this.stage === 2 && this.phase === 'fight') {
      this.bindCd -= dt;
      const M = g.zombies.moves;
      if (this.bindCd <= 0 && b.state === 'chase') {
        const list = M.standing();
        if (list.length && M.bindMark(M.idOf(list[Math.floor(Math.random() * list.length)]))) this.bindCd = b.hp / b.maxHp < 0.35 ? 10 : 13;
      }
    }
    // se va prendiendo de a poco (agarrado por las almas, lo que brilla lo pone gilHeld)
    this.glowK = (this.glowK || 0) + ((this.phase2 ? 1.2 : 0) - (this.glowK || 0)) * Math.min(1, dt * 2);
    if (!this.held.active) this.setGlow(this.glowK * (0.8 + Math.sin(g.time * 6) * 0.2));
    if (this.phase2 && gil && Math.random() < dt * 20) g.fx.fire(tmpV.set(b.pos.x + (Math.random() - 0.5), (b.baseY || 0) + Math.random() * 3.4, b.pos.z + (Math.random() - 0.5)), 0.25, 1);
    if (this.stage === 1) for (const p of this.braziers) if (Math.random() < 0.25) g.fx.fire(p, 0.08, 1);
    // relámpagos colorados alrededor de la cárcel
    if (this.stage === 2 && Math.random() < dt * 0.3) {
      const A = this.A2;
      const a = Math.random() * Math.PI * 2;
      const d = A.r + 8 + Math.random() * 20;
      const at = new THREE.Vector3(A.x + Math.cos(a) * d, A.y + 34, A.z + Math.sin(a) * d);
      g.fx.lightning(at, new THREE.Vector3(at.x + (Math.random() - 0.5) * 6, A.y - 20, at.z + (Math.random() - 0.5) * 6), 0xff3a2a, 0.35);
      g.post?.flash(0.25);
    }
  }

  // (anfitrión) Sin bolas de fuego: al que tiene cerca le revolea la cadena
  // (el molinete). La que tira de lejos la decide Zombies (whipWind → chainThrow).
  ranged(b, k) {
    const R = this.stage === 2 ? 7 : 5.5;
    const near = this.standing().some((p) => Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < R);
    if (!near || this.sweepS) {
      this.fireT = 0.8;
      return;
    }
    this.fireT = this.stage === 2 ? (k < 0.35 ? 3.4 : 4.4) : 5.5;
    this.sweep(b, this.stage === 2 && k < 0.45 ? 2 : 1);
  }

  // ---------------- el molinete ----------------
  // Gil revolea la cadena alrededor suyo a la altura de las rodillas: un aro
  // colorado en el piso avisa hasta dónde llega y cuándo; al pasar, al que no
  // saltó le pega. En la cárcel, con poca vida, da dos vueltas seguidas.
  sweep(b, n) {
    const m = { k: 'gsweep', r: this.stage === 2 ? 6.5 : 5.2, n };
    this.startSweep(m);
    this.g.net?.event('bfx', m);
    this.g.zombies.setState(b, 'summon');
  }

  startSweep(m) {
    const g = this.g;
    this.sweepS = { r: m.r, n: m.n, t: 0, hits: 0, sw: -1 };
    this.sweepRing.visible = true;
    if (!this.sweepSeen) {
      this.sweepSeen = true;
      g.hud.subtitle(this.lines.sweep, 3, 'boss');
    }
    const b = g.zombies.boss;
    if (b) g.audio.chain(tmpV.set(b.pos.x, (b.baseY || 0) + 1, b.pos.z));
  }

  endSweep() {
    this.sweepS = null;
    if (this.sweepRing) this.sweepRing.visible = false;
    if (this.sweepChain) this.sweepChain.visible = false;
  }

  updateSweep(dt) {
    const S = this.sweepS;
    if (!S) return;
    const g = this.g;
    const b = g.zombies.boss;
    if (!b || b.dead || !this.active || this.stage === 'shift') return this.endSweep();
    S.t += dt;
    const last = SWEEP_WARN + (S.n - 1) * SWEEP_GAP;
    if (S.t > last + 0.3) return this.endSweep();
    const cx = b.pos.x;
    const cz = b.pos.z;
    const cy = b.baseY || 0;
    const i = Math.min(S.hits, S.n - 1);
    const next = SWEEP_WARN + i * SWEEP_GAP;
    // el aro del piso: más fuerte cuanto más cerca del golpe
    const ramp = Math.max(0, 1 - Math.max(0, next - S.t) / SWEEP_WARN);
    this.sweepRing.position.set(cx, cy + 0.07, cz);
    this.sweepRing.scale.setScalar(S.r);
    this.sweepRing.material.opacity = (0.22 + ramp * 0.65) * (0.75 + Math.sin(g.time * 22) * 0.25);
    // la cadena: sale de la mano y barre (se ve desde un poco antes de pegar)
    const u = (S.t - (next - 0.42)) / 0.62;
    if (u > 0 && u < 1) {
      if (S.sw !== i) {
        S.sw = i;
        g.audio.whoosh(tmpV.set(cx, cy + 0.6, cz));
      }
      this.placeSweep(cx, cy, cz, 0.9 + (S.r - 0.9) * Math.min(1, u * 1.7), g.time * 15);
      this.sweepChain.visible = true;
    } else this.sweepChain.visible = false;
    // pega: cada compu se fija en su jugador (el que saltó, zafa)
    if (S.hits < S.n && S.t >= next) {
      S.hits++;
      const p = g.player;
      const floor = g.world.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
      if (p.canBeHit() && Math.hypot(p.pos.x - cx, p.pos.z - cz) < S.r + 0.35 && p.pos.y - floor < SWEEP_JUMP) {
        p.damage(SWEEP_DMG, b.pos);
        g.fx.addShake(0.35);
        g.audio.chain(p.pos);
      }
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        g.fx.dust(tmpV.set(cx + Math.cos(a) * S.r, cy + 0.12, cz + Math.sin(a) * S.r), { x: Math.cos(a), y: 0.5, z: Math.sin(a) }, [0.4, 0.34, 0.28], 3);
      }
    }
  }

  // La cadena del molinete: una línea de eslabones del jefe hacia afuera,
  // curvada hacia atrás (el revoleo) y a la altura de las rodillas.
  placeSweep(cx, cy, cz, len, spin) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < SWEEP_LINKS; i++) {
      const f = (i + 0.5) / SWEEP_LINKS;
      const a = spin - f * f * 0.9;
      const d = 0.7 + (len - 0.7) * f;
      p.set(cx + Math.cos(a) * d, cy + 1.1 - f * 0.6 + Math.sin(spin * 2 + f * 9) * 0.04, cz + Math.sin(a) * d);
      // el eslabón mira a lo largo de la cadena (el aro, girado un cuarto uno sí y uno no)
      e.set(i % 2 ? Math.PI / 2 : 0, -a, 0, 'YXZ');
      m4.compose(p, q.setFromEuler(e), one);
      this.sweepChain.setMatrixAt(i, m4);
    }
    this.sweepChain.instanceMatrix.needsUpdate = true;
  }

  // ---------------- el traslado a la cárcel ----------------
  // (todos) Gil ruge, las cadenas agarran a cada uno y, en negro, aparecen en la cárcel.
  beginShift() {
    if (this.stage !== 1) return;
    const g = this.g;
    const host = !g.net?.guest;
    this.stage = 'shift';
    if (host) this.phase = 'shift';
    // (mientras tanto no le entra nada: se ve el escudo)
    this.ward = true;
    this.endSweep();
    this.clearRain();
    const b = g.zombies.boss;
    if (b) {
      const by = b.baseY || 0;
      g.fx.lightning(new THREE.Vector3(b.pos.x, by + 22, b.pos.z), new THREE.Vector3(b.pos.x, by + 2, b.pos.z), 0xff3a2a, 0.9);
      if (host) g.zombies.setState(b, 'intro');
    }
    // una cadena colorada del cielo a cada uno
    for (const p of this.standing()) g.fx.lightning(new THREE.Vector3(p.x, p.y + 18, p.z), new THREE.Vector3(p.x, p.y + 0.4, p.z), 0xff2a1a, 0.6);
    g.post?.flash(1);
    g.fx.addShake(0.6);
    g.audio.bossArrive();
    g.audio.thunder?.(null, true);
    g.audio.chain(g.player.pos);
    // la canción salta al corte: la parte fuerte entra justo con la llegada a la cárcel
    if (g.music?.is('jefe-penal')) g.music.jumpTo(PENAL_CARCEL.at, PENAL_CARCEL.loop);
    if (host) {
      for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
      g.say('gil', '¿Se creen que este cerro es mi cárcel? Vengan... les voy a mostrar dónde guardo a los que no suelto.', 'boss');
    }
    g.hud.subtitle('¡El Gauchito Gil los arrastra con sus cadenas!', 3, 'boss');
    g.later(1.7, () => this.stage === 'shift' && this.black(1, 0.4));
    g.later(2.2, () => this.enterCarcel());
  }

  // (net/Session, el que entra con la pelea empezada) Si el anfitrión ya está
  // en la cárcel (o yendo), va derecho para allá.
  lateJoin(stage) {
    if (stage !== 2 && stage !== 'shift') return;
    this.stage = 'shift';
    this.enterCarcel();
  }

  enterCarcel() {
    const g = this.g;
    if (this.stage !== 'shift' || !this.active) return;
    const host = !g.net?.guest;
    const A = this.A2;
    this.stage = 2;
    this.A = A;
    this.name = 'La Cárcel de las Almas';
    this.cols = this.carcel.cols;
    this.braziersHome = this.braziers;
    this.braziers = [];
    this.phase2 = true;
    this.rainDelay = 1.25;
    this.rainR = 2.1;
    this.install();
    this.carcel.root.visible = true;
    this.lights.forEach((l, i) => l.position.copy(this.carcel.lights[i]));
    this.placePlayer(A);
    this.ward = false;
    this.wardMesh.visible = false;
    if (host) {
      const b = g.zombies.boss;
      if (b && !b.dead) {
        b.pos.set(A.x, A.y, A.z - 6);
        b.baseY = A.y;
        b.yaw = 0;
        g.zombies.setState(b, 'intro');
      }
      this.phase = 'fight';
      this.fireT = 4;
      this.rainT = 6;
      this.bindCd = 7;
      this.ammoT = Math.min(this.ammoT, 12);
      g.say('gil', '¿Creían que yo era un santo? Las banderas coloradas son la sangre de los que encerré. Nadie sale de mi cárcel... ni vivos, ni muertos.', 'boss');
    }
    this.weatherNow('carcel');
    g.hud.location('La Cárcel de las Almas', 'Donde el Gauchito guarda lo que no suelta');
    g.hud.subtitle('¡El Gauchito Gil se revela: es el carcelero de las almas!', 4, 'boss');
    g.renderer.shadowMap.needsUpdate = true;
    g.later(0.3, () => this.black(0, 0.8));
    g.later(0.5, () => {
      if (this.stage !== 2) return;
      g.fx.lightning(new THREE.Vector3(A.x, A.y + 30, A.z - 6), new THREE.Vector3(A.x, A.y + 2, A.z - 6), 0xff3a2a, 0.8);
      g.audio.thunder?.(null, true);
    });
  }

  // Cada uno a su lugar, del lado de enfrente del jefe (como al llegar al cerro).
  placePlayer(A) {
    const g = this.g;
    const P = g.player;
    // (el que estaba de alma vuelve a su cuerpo antes de viajar)
    if (g.vida?.active) g.vida.leave(true);
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    const slot = ids.indexOf(g.net ? g.net.id : 0);
    P.pos.set(A.x + (slot - (ids.length - 1) / 2) * 1.6, A.y, A.z + A.r - 3);
    P.vel.set(0, 0, 0);
    P.yaw = 0;
    P.pitch = 0;
    P.onGround = true;
    // (sin golpe de caída: de la cárcel al cerro son 46 m)
    P.airTop = A.y;
    P.lungeT = 0;
  }

  // El piso de la cárcel para caminar, tirar y nadar (no hay agua allá arriba);
  // afuera del redondel, el vacío. Lejos, lo de siempre.
  install() {
    const w = this.g.world;
    const A = this.A2;
    const over = this.carcel.over;
    const base = { floorAt: w.floorAt, waterDepth: w.waterDepth, surfaceAt: w.surfaceAt, raycast: w.raycast };
    this.base = base;
    this.installed = true;
    // (hasta 12 m afuera del redondel: más lejos empieza la costa del mapa)
    const near = (x, z) => Math.hypot(x - A.x, z - A.z) < A.r + 12;
    w.floorAt = (x, z, y) => (over(x, z) ? A.y : near(x, z) ? A.y - 300 : base.floorAt.call(w, x, z, y));
    w.waterDepth = (x, z, y) => (near(x, z) ? 0 : base.waterDepth?.call(w, x, z, y) ?? 0);
    w.surfaceAt = (x, z) => (over(x, z) ? 'concrete' : base.surfaceAt.call(w, x, z));
    // el piso y el aro de barrotes (las celdas): que los tiros peguen ahí
    const R0 = A.r + 1;
    const TOP = A.y + 9.3;
    const nrm = new THREE.Vector3();
    w.raycast = (o, d, maxT, hit = {}) => {
      if (!near(o.x, o.z)) return base.raycast.call(w, o, d, maxT, hit);
      let best = maxT;
      let kind = null;
      if (d.y < -1e-6 && o.y > A.y) {
        const t = (A.y - o.y) / d.y;
        if (t < best && over(o.x + d.x * t, o.z + d.z * t)) {
          best = t;
          kind = 'floor';
          nrm.set(0, 1, 0);
        }
      }
      // (de adentro hacia afuera: la salida del cilindro de los barrotes)
      const ox = o.x - A.x;
      const oz = o.z - A.z;
      const a = d.x * d.x + d.z * d.z;
      if (a > 1e-8 && ox * ox + oz * oz < R0 * R0) {
        const bq = ox * d.x + oz * d.z;
        const c = ox * ox + oz * oz - R0 * R0;
        const t = (-bq + Math.sqrt(bq * bq - a * c)) / a;
        const py = o.y + d.y * t;
        if (t > 0 && t < best && py > A.y && py < TOP) {
          best = t;
          kind = 'wall';
          nrm.set(-(ox + d.x * t), 0, -(oz + d.z * t)).normalize();
        }
      }
      if (!kind) return Infinity;
      hit.t = best;
      hit.box = kind;
      hit.normal = hit.normal || new THREE.Vector3();
      hit.normal.copy(nrm);
      hit.point = hit.point || new THREE.Vector3();
      hit.point.set(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
      return best;
    };
  }

  uninstall() {
    if (!this.installed) return;
    const w = this.g.world;
    Object.assign(w, this.base);
    this.installed = false;
  }

  // El clima de una (se cambia en negro: sin los 12 s de transición de Weather).
  weatherNow(name) {
    const W = this.g.weather;
    if (!W) return;
    W.set(name, false);
    const T = W.S?.[name];
    if (!T || !W.cur) return;
    for (const k of ['rain', 'storm', 'fog', 'wind', 'cloud', 'mist', 'blood']) W.cur[k] = T[k];
    W.fogColor?.set(T.fogColor);
  }

  // Negro de pantalla completa (encima del HUD) que entra o sale.
  black(on, secs) {
    const g = this.g;
    if (!this.blackEl) {
      const el = document.createElement('i');
      el.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:60;transition:none';
      this.blackEl = el;
    }
    const el = this.blackEl;
    if (!el.isConnected) g.root.appendChild(el);
    void el.offsetWidth;
    el.style.transition = `opacity ${secs}s`;
    el.style.opacity = on ? '1' : '0';
  }

  // Lo que avisa el anfitrión (entities/bossMoves.js onNet → acá).
  onBfx(m) {
    super.onBfx(m);
    if (m.k === 'gil2') this.beginShift();
    else if (m.k === 'gsweep') this.startSweep(m);
    else if (m.k === 'gilBack') this.goHome();
  }

  // ---------------- el final ----------------
  onBossDead() {
    const g = this.g;
    // (por las dudas: si cae en el cerro, el final de siempre)
    if (this.stage !== 2) {
      // (las cadenas de la lluvia y el aro del molinete: Arena no los conoce y
      // quedaban colgados, congelados en la cinemática)
      this.clearRain();
      this.endSweep();
      // (cayó en medio del traslado: ya no se va a la cárcel y vuelve la imagen)
      if (this.stage === 'shift') {
        this.stage = 1;
        this.black(0, 0.6);
      }
      super.onBossDead();
      this.setGlow(0);
      this.freeSouls();
      return;
    }
    this.phase = 'won';
    this.setWard(false);
    this.clearRain();
    this.endSweep();
    g.hud.setBossBar(null);
    for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    this.setGlow(0);
    g.post.flash(1.2);
    g.net?.event('bfx', { k: 'gilBack' });
    this.goHome();
    g.later(HOME_AT + HOME_WATCH, () => g.win());
  }

  // (todos) Las almas de las celdas lo agarran y, con el pantallazo blanco,
  // todos vuelven al cerro (world/gilHeld.js).
  goHome() {
    if (this.homing) return;
    this.homing = true;
    const g = this.g;
    this.endSweep();
    this.held.start(this.carcel, this.A2);
    // (sin el Gil a la vista no hay blanco: en negro, como antes)
    if (!this.held.active) g.later(HOME_AT - 0.7, () => this.black(1, 0.6));
    g.later(HOME_AT, () => this.backHome());
  }

  backHome() {
    const g = this.g;
    if (this.stage !== 2) return;
    this.stage = 'home';
    this.A = this.A1;
    this.name = 'El Cerro del Espinillo';
    this.cols = this.cols1;
    if (this.braziersHome) this.braziers = this.braziersHome;
    this.uninstall();
    this.carcel.root.visible = false;
    this.lights.forEach((l, i) => l.position.copy(this.lightHome[i]));
    this.placePlayer(this.A1);
    this.weatherNow(this.weatherName);
    g.hud.location(this.name, '');
    this.freeSouls();
    g.renderer.shadowMap.needsUpdate = true;
    // él, de rodillas al lado del altar: donde lo arma el final (ui/PenalCinematic.js)
    const [ax, az] = EE.altar;
    const G = new THREE.Vector3(ax - 2.3, 0, az + 0.4);
    G.y = g.world.floorAt(G.x, G.z);
    this.held.goHome(G, Math.atan2(ax + 0.3 - G.x, az + 3.9 - G.z));
    // (si no está el blanco, como antes: se abre el negro)
    if (!this.held.active) this.black(0, 0.9);
  }

  dispose() {
    super.dispose();
    this.held.stop();
    this.uninstall();
    this.clearRain();
    this.setGlow(0);
    this.sweepRing.removeFromParent();
    this.sweepChain.removeFromParent();
    this.carcel?.root.removeFromParent();
    this.blackEl?.remove();
  }
}
