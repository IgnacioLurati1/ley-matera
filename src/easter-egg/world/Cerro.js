import * as THREE from 'three';
import Arena from './Arena';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, cylGeo, boxGeo, mergeByMaterial } from './props';
import { EE } from '../config/map';

// El Cerro del Espinillo: la punta de la isla, arriba de la capilla del penal.
// Cuando el mate supremo queda armado en el espinillo aparece el Gauchito Gil,
// que resultó ser el carcelero de las almas del penal. Es parte del mapa (no
// hay que viajar a ningún lado) y la pelea tiene dos fases:
//  1. El Gaucho: facón, rebencazos, embestidas y sus devotos (los presos) que
//     lo protegen cuando llama.
//  2. Con la mitad de la vida se revela el carcelero: todo colorado, más
//     rápido, llueven cadenas del cielo y tira calaveras de fuego de a tres.

export default class Cerro extends Arena {
  constructor(game) {
    super(game, { ...EE.arena });
  }

  setup() {
    super.setup();
    this.name = 'El Cerro del Espinillo';
    this.sub = 'Donde lo colgaron... o eso dicen';
    this.bossName = 'El Gauchito Gil';
    this.bossHp = 230000;
    this.wards = [0.8, 0.55, 0.3];
    this.speeds = [3.6, 4.4, 5];
    this.rainColor = 0xff2020;
    this.fireColor = 0xff3020;
    this.rainBoom = [1, 0.15, 0.1];
    this.weatherName = 'storm';
    this.lines = {
      greet: ['gil', 'Cien años cuidé este penal... ¿y ahora vienen a soltarme los presos? Nadie sale sin mi permiso.'],
      rain: '¡Caen cadenas del cielo! Salí de los círculos.',
      ward: 'Los devotos lo protegen: ¡liquidá a los presos para que se le caiga el escudo!',
      unward: '¡Se le cayó la protección! Ahora, dale.',
      summon: 'El Gauchito llama a sus presos...',
    };
  }

  bossOpts() {
    const [x, z] = EE.altar;
    return { at: new THREE.Vector3(x + 0.4, this.A.y || 0, z - 2.6), mandinga: true, kind: 'gil', hp: this.bossHp };
  }

  // El cerro es parte del mapa: acá solo van las velas de las promesas y el escudo.
  build() {
    const M = this.g.world.M;
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
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    // las cadenas que caen sobre cada círculo (segunda fase)
    this.chainGeo = new THREE.TorusGeometry(0.1, 0.025, 5, 10);
    this.chainMat = M.iron;
    // tres capillitas del Gauchito adentro del cerro: tapan las calaveras y,
    // si Gil embiste contra una, queda atontado
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
    this.decor();
  }

  // Las almas del penal encadenadas alrededor del cerro: figuras azuladas
  // (una sola malla instanciada, aditiva) de rodillas contra la baranda, con
  // cadenas a estacas de hierro; cintas coloradas en postes, un anillo rojo en
  // el piso y velitas. Todo en el borde, sin choques ni luces. Cuando cae el
  // Gauchito (el carcelero) las almas se sueltan y suben.
  decor() {
    const M = this.g.world.M;
    const { x, z, r } = this.A;
    const y = this.A.y || 0;
    let seed = 31;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const at = (a, d) => [x + Math.cos(a) * d, z + Math.sin(a) * d];
    const face = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
    // la entrada (oeste) y las banderas del mapa quedan libres
    const busy = [Math.PI, 3.88, 5.54, 0.745, 2.42];
    const near = (a, list, w) => list.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w);

    // ---- las almas: arrodilladas mirando al centro, con las manos atadas adelante ----
    const parts = [];
    const put = (geo, px, py, pz, rx = 0, ry = 0, rz = 0) => {
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
      parts.push(geo);
    };
    put(new THREE.SphereGeometry(0.12, 10, 8), 0, 1.24, 0.06);
    put(new THREE.CapsuleGeometry(0.15, 0.36, 4, 8), 0, 0.92, 0, 0.22);
    // la túnica de rodillas y la cola de humo
    put(new THREE.ConeGeometry(0.32, 0.62, 10, 1, true), 0, 0.42, -0.02);
    put(new THREE.ConeGeometry(0.2, 0.55, 8), 0, 0.1, -0.22, Math.PI - 0.5);
    // brazos para adelante, las muñecas juntas (ahí va la cadena)
    for (const s of [-1, 1]) put(new THREE.CapsuleGeometry(0.045, 0.34, 3, 6), s * 0.11, 0.93, 0.2, 1.05, 0, s * 0.35);
    const flat = parts.map((g) => {
      const f = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(f.attributes)) if (k !== 'position') f.deleteAttribute(k);
      return f;
    });
    const soulGeo = mergeGeometries(flat);
    parts.forEach((g) => g.dispose());
    // más brillo arriba (la cabeza) y se apaga hacia el piso
    const sp = soulGeo.attributes.position;
    const col = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const k = Math.max(0, Math.min(1, sp.getY(i) / 1.3));
      const v = 0.12 + 0.88 * k * k;
      col[i * 3] = v * 0.7;
      col[i * 3 + 1] = v * 0.9;
      col[i * 3 + 2] = v;
    }
    soulGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const angles = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.12;
      if (!near(a, busy, 0.3)) angles.push(a + (rnd() - 0.5) * 0.08);
    }
    this.souls = new THREE.InstancedMesh(
      soulGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0x5ab4ff).multiplyScalar(1.5), transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      angles.length,
    );
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
    const y = (this.A.y || 0) + 0.02;
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
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const c = new THREE.Color();
    const y = this.A.y || 0;
    if (this.freed) this.freeT += dt;
    const k = this.freed ? Math.min(1, this.freeT / 3.5) : 0;
    for (let i = 0; i < this.soulData.length; i++) {
      const s = this.soulData[i];
      const lift = this.freed ? this.freeT * this.freeT * 0.9 * s.rise : 0;
      p.set(s.x, y + Math.sin(t * 1.3 + s.ph) * 0.04 + lift, s.z);
      // de rodillas y agachadas; al soltarse se enderezan y miran para arriba
      e.set(0.12 + Math.sin(t * 0.9 + s.ph) * 0.05 - k * 0.5, s.yaw, Math.sin(t * 0.7 + s.ph) * 0.04);
      s3.setScalar(s.s * (1 + k * 0.2));
      m4.compose(p, q.setFromEuler(e), s3);
      this.souls.setMatrixAt(i, m4);
      const glow = (0.85 + Math.sin(t * 2.3 + s.ph) * 0.15) * (this.freed ? Math.max(0, 1 - k) * (1 + (1 - k) * 0.8) : 1);
      this.souls.setColorAt(i, c.setScalar(glow));
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
    const y = this.A.y || 0;
    for (const s of this.soulData) {
      g.fx.sparkle(new THREE.Vector3(s.x, y + 1, s.z), [0.5, 0.8, 1], 6, 0.4);
      for (let i = 0; i < 5; i++) g.fx.add.spawn(s.x, y + 0.8, s.z, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2, { color: [0.35, 0.65, 1], size: 0.22, size1: 0.04, life: 2.5, gravity: -1 });
    }
    g.audio.chain?.(new THREE.Vector3(this.A.x, y + 1, this.A.z));
  }

  start() {
    super.start();
    this.bindCd = 6;
    this.phase2 = false;
    this.setGlow(0);
    this.sawBoss = false;
    if (this.freed) {
      this.freed = false;
      for (const L of this.linkData) L.fall = 0;
      this.placeLinks(0);
    }
  }

  updateShared(dt) {
    super.updateShared(dt);
    // el invitado no pasa por onBossDead: se entera de que cayó mirando al jefe
    const b = this.g.zombies.boss;
    if (b && b.kind === 'gil' && !b.dead) this.sawBoss = true;
    else if (this.sawBoss && (!b || b.dead)) this.freeSouls();
    this.updateSouls(dt);
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
    if (!this.phase2) return;
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

  update(dt) {
    super.update(dt);
    const g = this.g;
    if (!this.active) return;
    const b = g.zombies.boss;
    // la segunda fase: el carcelero
    if (b && !b.dead && b.kind === 'gil' && !this.phase2 && b.hp / b.maxHp < 0.5) {
      this.phase2 = true;
      this.fireSpeed = 22;
      this.rainDelay = 1.25;
      this.rainR = 2.1;
      g.post?.flash(1);
      g.fx.lightning(new THREE.Vector3(b.pos.x, (b.baseY || 0) + 20, b.pos.z), new THREE.Vector3(b.pos.x, (b.baseY || 0) + 2, b.pos.z), 0xff3a2a, 0.8);
      g.audio.bossArrive();
      g.audio.thunder?.(null, true);
      if (!g.net?.guest) {
        g.say('gil', '¿Creían que yo era un santo? Las banderas coloradas son la sangre de los que encerré. Nadie sale de mi cárcel... ni vivos, ni muertos.', 'boss');
        g.net?.event('sub', { x: '¡El Gauchito Gil se revela: es el carcelero de las almas!', d: 4, s: 1 });
      }
      g.hud.subtitle('¡El Gauchito Gil se revela: es el carcelero de las almas!', 4, 'boss');
    }
    // (anfitrión) con el 80% encadena a uno a una estaca (entities/bossMoves.js)
    if (!g.net?.guest && this.phase === 'fight' && b && !b.dead && b.kind === 'gil' && b.hp / b.maxHp < 0.8) {
      this.bindCd = (this.bindCd ?? 6) - dt;
      const M = g.zombies.moves;
      if (this.bindCd <= 0 && b.state === 'chase') {
        const list = M.standing();
        if (list.length && M.bindMark(M.idOf(list[Math.floor(Math.random() * list.length)]))) this.bindCd = this.phase2 ? 12 : 16;
      }
    }
    // se va prendiendo de a poco
    this.glowK = (this.glowK || 0) + ((this.phase2 ? 1.2 : 0) - (this.glowK || 0)) * Math.min(1, dt * 2);
    this.setGlow(this.glowK * (0.8 + Math.sin(g.time * 6) * 0.2));
    if (this.phase2 && b && !b.dead && Math.random() < dt * 20) g.fx.fire(new THREE.Vector3(b.pos.x + (Math.random() - 0.5), (b.baseY || 0) + Math.random() * 3.4, b.pos.z + (Math.random() - 0.5)), 0.25, 1);
    for (const p of this.braziers) if (Math.random() < 0.25) g.fx.fire(p, 0.08, 1);
  }

  // Calavera de fuego en vez de bola (segunda fase).
  fireballMesh() {
    if (!this.phase2) return super.fireballMesh();
    if (!this.skullMat) {
      this.skullMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a1a).multiplyScalar(3), toneMapped: false });
      this.skullGeo = new THREE.SphereGeometry(0.3, 12, 8).scale(1, 1.1, 1.15);
    }
    const m = new THREE.Mesh(this.skullGeo, this.skullMat);
    for (const s of [-1, 1]) m.add(mesh(boxGeo(0.08, 0.08, 0.04), this.g.world.M.black, s * 0.1, 0.04, 0.31));
    return m;
  }

  onBossDead() {
    super.onBossDead();
    this.setGlow(0);
    this.freeSouls();
  }

  dispose() {
    super.dispose();
    for (const c of this.rain) c.chain?.removeFromParent();
    this.setGlow(0);
  }
}
