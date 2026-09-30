import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { MAP_ID } from '../config/map';
import { TRACKS } from '../core/music';

// La canción de la pelea de cada mapa (core/music.js). El castillo tiene la
// suya en la Gran Guerra.
const SONG = { molino: 'jefe-molino', granja: 'jefe-granja', penal: 'jefe-penal', torre: 'jefe-torre' };
// cuánto tarda en aparecer el jefe (el golpe de la canción cae ahí)
const BOSS_IN = 3.2;

// La Salamanca: la arena del final, lejos del molino. La Voz de Arriba manda
// acá a todos cuando el sombrero del Capataz vuelve a su tumba y el cementerio
// se calma; adentro espera el Mandinga.
// Tiene su propio ritmo: bolas de fuego, lluvia de fuego marcada en el piso,
// oleadas de peones (mientras quedan peones, el diablo está protegido por el
// fuego) y munición que cae cada tanto. Si lo vencés, termina la partida.

export const ARENA = { x: 115, z: 25, r: 15 };
const BOSS_HP = 180000;
const WARDS = [0.75, 0.5, 0.25]; // se protege y llama peones
const WARD_MAX = 30; // si no terminan con los peones, igual se le cae el fuego
const RAIN_R = 1.8;
const RAIN_DELAY = 1.4;
const RAIN_DMG = 60;
const FIRE_SPEED = 19;

const tmpV = new THREE.Vector3();

export default class Arena {
  constructor(game, A = ARENA) {
    this.g = game;
    this.A = A;
    this.setup();
    this.active = false;
    this.phase = 'off';
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.fireballs = [];
    this.rain = [];
    this.ward = false;
    this.build();
  }

  // Lo propio de cada final (la Salamanca acá; el Prado de la granja lo cambia).
  setup() {
    this.name = 'La Salamanca';
    this.sub = 'Donde el diablo enseña a payar';
    this.bossName = 'El Mandinga';
    this.bossHp = BOSS_HP;
    this.wards = WARDS;
    this.wardMax = WARD_MAX;
    this.rainR = RAIN_R;
    this.rainDelay = RAIN_DELAY;
    this.rainDmg = RAIN_DMG;
    // la lluvia de fuego empieza con esta parte de la vida (el cerro, de entrada)
    this.rainFrom = 0.66;
    this.fireSpeed = FIRE_SPEED;
    // velocidad del jefe: con más de la mitad de vida, menos de la mitad, menos de un cuarto
    // (de entrada ya no se lo deja atrás caminando para atrás)
    this.speeds = [3.7, 4.4, 4.9];
    // las columnas de adentro de la arena: tapan las bolas de fuego y, si el
    // jefe embiste contra una, queda atontado (contra el borde, no). Las arma
    // cada arena en build(): { x, z, r, h (alto), what (cómo se llama) }
    this.cols = [];
    // los muros de fuego que parten la arena: solo el Mandinga
    this.fireCols = this.constructor === Arena;
    this.rainColor = 0xff3a0a;
    this.fireColor = 0xff6a1a;
    this.weatherName = 'blood';
    this.lines = {
      greet: ['anunciador', '¿Así que te mandaron a vos a buscar al viejo? Vení nomás, que en la Salamanca se paga con el alma.'],
      rain: '¡Llueve fuego! Salí de los círculos.',
      ward: 'El Mandinga se cubre de fuego: ¡liquidá a los peones para bajarle el escudo!',
      unward: '¡Se le cayó el fuego! Ahora, dale.',
      summon: 'El Mandinga llama a sus peones...',
    };
  }

  // El jefe del final.
  bossOpts() {
    return { at: new THREE.Vector3(this.A.x, 0, this.A.z - 3), mandinga: true, hp: this.bossHp };
  }

  build() {
    const M = this.g.world.M;
    const { x, z, r } = this.A;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r + 1, 48), M.dirtDark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.01, z);
    floor.receiveShadow = true;
    this.root.add(floor);
    // paredes de piedra de la cueva (suben hasta meterse en el techo: el
    // anillo del techo sube hacia afuera y con 9 m quedaba un hueco al cielo)
    const WALL_TOP = 11.8;
    const wallGeo = new THREE.CylinderGeometry(r + 1.2, r + 2.5, WALL_TOP, 40, 4, true);
    const pos = wallGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + Math.sin(a * 7 + pos.getY(i)) * 0.05 + Math.sin(a * 17) * 0.03;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    wallGeo.computeVertexNormals();
    const rock = new THREE.MeshStandardMaterial({ map: this.g.textures.concrete, bumpMap: this.g.textures.concrete, bumpScale: 3, color: 0x6a5048, roughness: 0.95, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(wallGeo, rock);
    wall.position.set(x, WALL_TOP / 2, z);
    this.root.add(wall);
    // braseros en círculo
    this.braziers = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = x + Math.cos(a) * (r - 2.5);
      const bz = z + Math.sin(a) * (r - 2.5);
      this.root.add(mesh(cylGeo(0.3, 0.4, 1.0, 10), M.stone, bx, 0.5, bz));
      this.root.add(mesh(cylGeo(0.5, 0.3, 0.3, 12), M.iron, bx, 1.15, bz));
      this.root.add(mesh(cylGeo(0.42, 0.42, 0.05, 12), M.fireGlow, bx, 1.29, bz));
      this.braziers.push(new THREE.Vector3(bx, 1.3, bz));
    }
    // cruces de gauchos y huesos
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.4;
      const d = r - 1.2 - (i % 2) * 0.6;
      const cx = x + Math.cos(a) * d;
      const cz = z + Math.sin(a) * d;
      this.root.add(mesh(boxGeo(0.08, 1.2, 0.08), M.woodDark, cx, 0.6, cz, 0, a, (i % 3 - 1) * 0.12));
      this.root.add(mesh(boxGeo(0.5, 0.08, 0.08), M.woodDark, cx, 0.9, cz, 0, a + Math.PI / 2, 0));
    }
    // luces del fuego (siempre existen; se encienden al entrar)
    this.lights = [0, 1].map((k) => {
      const l = new THREE.PointLight(0xff5a1a, 0, 30, 1.6);
      l.position.set(x + (k ? 5 : -5), 4, z);
      this.g.scene.add(l);
      return l;
    });
    // la del ánima de Fierro en el final: también existe desde el principio
    // (sumar una luz en medio de la cinemática recompila todos los shaders)
    this.cineLight = new THREE.PointLight(0x7ab8ff, 0, 7, 2);
    this.g.scene.add(this.cineLight);
    // el escudo de fuego del Mandinga y los círculos de la lluvia de fuego
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.decor(rock);
    this.columns(rock);
    this.buildFireCols();
    this.root.updateMatrixWorld(true);
  }

  // Cuatro estalagmitas gordas adentro de la cueva (cubren y atontan).
  columns(rock) {
    const { x, z } = this.A;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x + Math.cos(a) * 7.5;
      const cz = z + Math.sin(a) * 7.5;
      const h = 3.4 + (k % 2) * 0.8;
      this.root.add(mesh(new THREE.CylinderGeometry(0.35, 0.95, h, 9), rock, cx, h / 2, cz, 0, k, 0));
      this.root.add(mesh(new THREE.ConeGeometry(0.4, 1.2, 8), rock, cx, h + 0.55, cz, 0, k * 2, 0));
      this.cols.push({ x: cx, z: cz, r: 0.85, h: h + 1, what: 'la estalagmita' });
    }
  }

  // ¿Hay una columna a menos de rad de p? (tall: contando su alto, para lo
  // que vuela: por arriba de una capillita la bola de fuego pasa)
  colHit(p, rad = 0, tall = false) {
    for (const c of this.cols) {
      if (tall && p.y > (this.A.y || 0) + (c.h ?? 4)) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + rad) return c;
    }
    return null;
  }

  // La bola de fuego que frena una columna: revienta contra su cara (no
  // adentro, donde no se veía) con chispas, pedazos, un fogonazo y un golpe,
  // y la primera vez se avisa.
  colBlock(c, p) {
    const g = this.g;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    const at = new THREE.Vector3(c.x + (dx / d) * (c.r + 0.05), p.y, c.z + (dz / d) * (c.r + 0.05));
    const out = { x: dx / d, y: 0.5, z: dz / d };
    g.fx.explosion(at, 1.5, this.rainBoom || [1, 0.45, 0.15]);
    g.fx.sparks(at, 1.4, out, [1, 0.7, 0.3]);
    g.fx.dust(at, out, [0.4, 0.34, 0.28], 14);
    g.fx.fire(at, 0.4, 6);
    g.fx.flash(at, this.fireColor, 30, 0.2, 9);
    g.audio.explosion(at, 0.7);
    g.audio.bossSlam(at);
    if (g.player.pos.distanceTo(at) < 6) g.fx.addShake(0.15);
  }

  // Nadie atraviesa las columnas.
  pushOut(p, rad) {
    for (const c of this.cols) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + rad;
      if (d >= min) continue;
      const k = d > 1e-4 ? min / d : 0;
      p.x = c.x + (d > 1e-4 ? dx * k : min);
      p.z = c.z + (d > 1e-4 ? dz * k : 0);
    }
  }

  // ---------------- los muros de fuego (el Mandinga) ----------------
  // Una franja marcada de lado a lado de la arena; al rato se prende un muro
  // de fuego que quema al que queda adentro. Con poca vida, dos en cruz.
  buildFireCols() {
    this.fcols = [];
    if (!this.fireCols) return;
    const base = this.g.zombies.tele.line;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), base.material.clone());
      m.material.color.set(0xff3a0a);
      m.visible = false;
      m.renderOrder = 2;
      this.g.scene.add(m);
      this.fcols.push({ m, t: -1, a: 0, x: 0, z: 0 });
    }
    this.colT = 10;
    this.colBurnT = 0;
  }

  // (todos) a: ángulos; (x, z): por dónde pasan.
  spawnFireCols(list, x, z) {
    list.forEach((a, i) => {
      const F = this.fcols[i];
      if (!F) return;
      Object.assign(F, { t: 0, a, x, z });
      F.m.visible = true;
      F.m.position.set(x, (this.A.y || 0) + 0.06, z);
      F.m.rotation.y = a;
    });
    this.g.audio.growl(new THREE.Vector3(this.A.x, (this.A.y || 0) + 3, this.A.z), 'boss');
  }

  updateFireCols(dt) {
    if (!this.fcols?.length) return;
    const g = this.g;
    const WARM = 1.6;
    const BURN = 4.5;
    const L = this.A.r * 2 + 2;
    const pp = g.player.pos;
    let hot = false;
    for (const F of this.fcols) {
      if (F.t < 0) continue;
      F.t += dt;
      const burning = F.t > WARM;
      if (F.t > WARM + BURN || !this.active) {
        F.t = -1;
        F.m.visible = false;
        continue;
      }
      const pulse = 0.6 + Math.sin(g.time * 16) * 0.4;
      F.m.scale.set(burning ? 1.8 : 0.9, 1, L);
      F.m.material.opacity = burning ? 0.85 : (0.25 + (F.t / WARM) * 0.5) * pulse;
      const dx = Math.sin(F.a);
      const dz = Math.cos(F.a);
      if (burning) {
        if (F.t - dt <= WARM) g.audio.explosion(new THREE.Vector3(F.x, (this.A.y || 0) + 1, F.z), 0.8);
        for (let k = 0; k < 3; k++) {
          const u = (Math.random() - 0.5) * L;
          const px = F.x + dx * u;
          const pz = F.z + dz * u;
          if (Math.hypot(px - this.A.x, pz - this.A.z) < this.A.r) g.fx.fire(tmpV.set(px, (this.A.y || 0) + 0.2 + Math.random() * 1.5, pz), 0.5, 1);
        }
        // ¿el de esta compu está adentro del muro?
        const ox = pp.x - F.x;
        const oz = pp.z - F.z;
        if (Math.abs(ox * dz - oz * dx) < 1) hot = true;
      }
    }
    this.colBurnT -= dt;
    if (hot && g.player.canBeHit() && this.colBurnT <= 0) {
      this.colBurnT = 0.5;
      g.player.damage(20, tmpV.set(pp.x, pp.y, pp.z));
    }
  }

  // (anfitrión) Cada tanto, desde que le queda el 80%.
  fireColTick(dt, k) {
    if (!this.fcols?.length || k > 0.8) return;
    this.colT -= dt;
    if (this.colT > 0 || this.fcols.some((F) => F.t >= 0)) return;
    this.colT = k < 0.33 ? 10 : 13;
    const a = Math.random() * Math.PI;
    const list = k < 0.33 ? [a, a + Math.PI / 2] : [a];
    const r = Math.random() * 2.5;
    const b = Math.random() * Math.PI * 2;
    const x = +(this.A.x + Math.cos(b) * r).toFixed(2);
    const z = +(this.A.z + Math.sin(b) * r).toFixed(2);
    const as = list.map((v) => +v.toFixed(3));
    this.spawnFireCols(as, x, z);
    this.g.net?.event('bfx', { k: 'fcol', a: as, x, z });
  }

  // Lo que avisa el anfitrión para esta arena (entities/bossMoves.js).
  onBfx(m) {
    if (m.k === 'fcol') this.spawnFireCols(m.a, m.x, m.z);
  }

  // Lo que hace cueva a la Salamanca: el piso rajado con brasas abajo, las
  // estalagmitas contra la pared, el techo de piedra con estalactitas y un
  // agujero al cielo, y al fondo el trono del Mandinga (calavera de chivo,
  // velas, la guitarra con la que enseña a payar y calaveras).
  decor(rock) {
    const M = this.g.world.M;
    const { x, z, r } = this.A;
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // las grietas que brillan (se suman a la luz, sobre el piso)
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 512);
    ctx.lineCap = 'round';
    const crack = (x0, y0, a, len, w) => {
      let px = x0;
      let py = y0;
      for (let k = 0; k < len; k++) {
        a += (rnd() - 0.5) * 0.9;
        const nx = px + Math.cos(a) * 9;
        const ny = py + Math.sin(a) * 9;
        for (const [lw, col] of [[w * 3.2, 'rgba(255,60,10,0.18)'], [w, 'rgba(255,120,30,0.9)'], [w * 0.4, 'rgba(255,220,120,1)']]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
        px = nx;
        py = ny;
        if (rnd() < 0.08 && w > 1.2) crack(px, py, a + (rnd() < 0.5 ? 1 : -1) * 0.9, len * 0.4, w * 0.6);
      }
    };
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
      crack(256 + Math.cos(a) * 40, 256 + Math.sin(a) * 40, a, 16 + rnd() * 10, 2.6);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const cracks = new THREE.Mesh(
      new THREE.CircleGeometry(r + 1, 48),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.3, 1.1, 1) }),
    );
    cracks.rotation.x = -Math.PI / 2;
    cracks.position.set(x, 0.02, z);
    this.root.add(cracks);
    // estalagmitas y piedras caídas contra la pared
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + rnd() * 0.2;
      const d = r + 0.2 + rnd() * 0.8;
      const h = 1.2 + rnd() * 3.2;
      const geo = new THREE.ConeGeometry(0.35 + rnd() * 0.45, h, 7, 3);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 + (rnd() - 0.5) * 0.25));
      geo.computeVertexNormals();
      this.root.add(mesh(geo, rock, x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d, (rnd() - 0.5) * 0.15, rnd() * 3, (rnd() - 0.5) * 0.15));
      if (k % 3 === 0) {
        const s = 0.3 + rnd() * 0.5;
        this.root.add(mesh(new THREE.DodecahedronGeometry(s, 0), rock, x + Math.cos(a + 0.12) * (r - 0.4), s * 0.6, z + Math.sin(a + 0.12) * (r - 0.4), rnd() * 3, rnd() * 3, 0));
      }
    }
    // el techo: un anillo de piedra con el agujero al cielo y estalactitas
    const roofGeo = new THREE.RingGeometry(r - 6.5, r + 3, 48, 3);
    const rp = roofGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const px = rp.getX(i);
      const py = rp.getY(i);
      const rr = Math.hypot(px, py);
      if (rr < r - 6) {
        const a = Math.atan2(py, px);
        const k = 1 + Math.sin(a * 5) * 0.12 + Math.sin(a * 13 + 1) * 0.06;
        rp.setXY(i, px * k, py * k);
      }
      rp.setZ(i, (rr - (r - 6.5)) * -0.25 + rnd() * 0.3);
    }
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, rock);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(x, 8.6, z);
    this.root.add(roof);
    for (let k = 0; k < 34; k++) {
      const a = rnd() * Math.PI * 2;
      const d = r - 6 + rnd() * 7.5;
      const h = 0.6 + rnd() * 2.2;
      // (el anillo sube hacia afuera: la punta de arriba queda metida en la roca;
      // antes bajaba y las de afuera quedaban colgando en el aire)
      // (la base queda arriba del techo, que tiene hasta 0,3 m de relieve)
      this.root.add(mesh(new THREE.ConeGeometry(0.12 + rnd() * 0.25, h + 0.35, 6), rock, x + Math.cos(a) * d, 8.95 + (d - (r - 6.5)) * 0.25 - (h + 0.35) / 2, z + Math.sin(a) * d, Math.PI, 0, 0));
    }
    // el trono del Mandinga, al fondo (mirando al centro)
    const throne = new THREE.Group();
    throne.position.set(x, 0, z - r + 1.6);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1a16, roughness: 0.6, metalness: 0.2 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.7 });
    const velvet = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, roughness: 0.9 });
    throne.add(mesh(boxGeo(2.6, 0.5, 1.8), rock, 0, 0.25, 0));
    throne.add(mesh(boxGeo(1.4, 0.6, 1.0), dark, 0, 0.8, 0.1));
    throne.add(mesh(boxGeo(1.2, 0.12, 0.9), velvet, 0, 1.16, 0.12));
    throne.add(mesh(boxGeo(1.6, 3.2, 0.35), dark, 0, 1.9, -0.45));
    throne.add(mesh(boxGeo(1.2, 2.2, 0.06), velvet, 0, 2.0, -0.26));
    for (const s of [-1, 1]) {
      throne.add(mesh(boxGeo(0.25, 0.7, 1.0), dark, s * 0.72, 1.05, 0.1));
      // los cuernos de arriba, curvos
      let a = -s * 0.4;
      let hx = s * 0.55;
      let hy = 3.5;
      let rr = 0.18;
      for (let k = 0; k < 5; k++) {
        throne.add(mesh(cylGeo(rr * 0.75, rr, 0.45, 8), dark, hx, hy, -0.45, 0, 0, a));
        hx += -Math.sin(a) * 0.42;
        hy += Math.cos(a) * 0.42;
        a -= s * 0.32;
        rr *= 0.78;
      }
      // velas negras en los apoyabrazos
      throne.add(mesh(cylGeo(0.05, 0.06, 0.3, 8), dark, s * 0.72, 1.55, 0.35));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), M.fireGlow);
      flame.position.set(s * 0.72, 1.76, 0.35);
      throne.add(flame);
    }
    // la calavera de chivo arriba del respaldo
    const skull = new THREE.Group();
    skull.position.set(0, 3.55, -0.3);
    skull.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10).scale(1, 1.15, 0.9), bone));
    skull.add(mesh(new THREE.ConeGeometry(0.16, 0.42, 8), bone, 0, -0.32, 0.08, Math.PI + 0.2, 0, 0));
    for (const s of [-1, 1]) {
      skull.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), M.fireGlow, s * 0.1, 0.02, 0.2));
      skull.add(mesh(new THREE.ConeGeometry(0.07, 0.6, 8), dark, s * 0.25, 0.3, -0.05, 0.3, 0, -s * 0.9));
    }
    throne.add(skull);
    // la guitarra apoyada al costado
    const guitar = new THREE.Group();
    guitar.position.set(1.25, 0.55, 0.6);
    guitar.rotation.set(0, -0.5, 0.35);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a3a1c, roughness: 0.5 });
    guitar.add(mesh(cylGeo(0.26, 0.26, 0.1, 18), wood, 0, 0, 0, Math.PI / 2, 0, 0));
    guitar.add(mesh(cylGeo(0.2, 0.2, 0.1, 18), wood, 0, 0.36, 0, Math.PI / 2, 0, 0));
    guitar.add(mesh(new THREE.CircleGeometry(0.07, 14), new THREE.MeshBasicMaterial({ color: 0x0a0604 }), 0, 0.2, 0.052));
    guitar.add(mesh(boxGeo(0.07, 0.75, 0.04), dark, 0, 0.9, 0));
    throne.add(guitar);
    // calaveras al pie del trono
    for (let k = 0; k < 7; k++) {
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.95, 1.1), bone);
      sk.position.set(-1.1 + rnd() * 2.2, 0.55 + (k > 4 ? 0.18 : 0), 0.55 + rnd() * 0.3);
      sk.rotation.set(rnd(), rnd() * 3, 0);
      throne.add(sk);
    }
    throne.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.root.add(throne);
    // dos braseros altos a los lados del trono (echan fuego como los otros)
    for (const s of [-1, 1]) {
      const bx = x + s * 2.3;
      const bz = z - r + 2.2;
      this.root.add(mesh(cylGeo(0.25, 0.35, 1.8, 10), rock, bx, 0.9, bz));
      this.root.add(mesh(cylGeo(0.55, 0.3, 0.35, 12), M.iron, bx, 1.95, bz));
      this.root.add(mesh(cylGeo(0.46, 0.46, 0.05, 12), M.fireGlow, bx, 2.1, bz));
      this.braziers.push(new THREE.Vector3(bx, 2.12, bz));
    }
  }

  // Llegada: se limpia el molino y te trae acá.
  start() {
    const g = this.g;
    const guest = !!g.net?.guest;
    if (!this.active && !guest) g.net?.event('arena');
    this.active = true;
    this.phase = guest ? 'guest' : 'intro';
    this.t = 0;
    this.root.visible = true;
    for (const l of this.lights) l.intensity = 40;
    if (!guest) {
      g.rounds.state = 'arena';
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      if (g.zombies.boss) g.zombies.removeBoss();
    }
    g.lures.length = 0;
    g.post.flash(1.6);
    g.audio.bossArrive();
    const song = SONG[MAP_ID];
    // (si ya suena, la dejó andando la escena de antes: la caída al Infierno de la torre)
    if (song && !g.music?.is(song)) g.music?.hit(song, BOSS_IN, { while: () => this.active && this.phase !== 'won' && (g.state === 'playing' || g.state === 'paused') });
    g.weather.set(this.weatherName, false);
    g.crow?.remove();
    // cada uno en su lugar (en línea no aparecen todos encimados)
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    const slot = ids.indexOf(g.net ? g.net.id : 0);
    g.player.pos.set(this.A.x + (slot - (ids.length - 1) / 2) * 1.6, this.A.y || 0, this.A.z + this.A.r - 3);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = 0;
    g.player.pitch = 0;
    // al final van todos: el que estaba caído o mirando vuelve a pelear
    if (!g.player.alive || g.player.downed) {
      g.player.revive();
      g.player.eye = 1.62;
      g.hud.setSpectate(null);
      g.hud.setDowned(null);
    }
    g.player.health = g.player.maxHealth;
    g.weapons.maxAmmo();
    g.hud.location(this.name, this.sub);
    this.summoned = [];
    this.ammoT = 25;
    this.fireT = 5;
    this.rainT = 8;
    this.colT = 10;
    this.setWard(false);
    if (!guest) this.waitBoss(song);
  }

  // (anfitrión) El jefe aparece cuando la canción llega a su golpe (así calza
  // aunque la canción tarde en cargar o vengan pocos cuadros); sin canción o
  // sin golpe marcado, a los BOSS_IN segundos.
  waitBoss(song, t0 = this.g.time) {
    const g = this.g;
    if (!this.active || this.phase !== 'intro') return;
    const boom = TRACKS[song]?.boom;
    const M = g.music;
    const on = boom != null && !!M?.is(song);
    const waited = g.time - t0;
    if (on ? M.time() >= boom - 0.05 || waited > BOSS_IN + 4 : waited >= BOSS_IN) {
      this.spawnBoss();
      return;
    }
    g.later(on ? 0.02 : Math.max(0.02, BOSS_IN - waited), () => this.waitBoss(song, t0));
  }

  spawnBoss() {
    const g = this.g;
    const opts = this.bossOpts();
    const boss = g.zombies.spawnBoss(99, opts);
    this.boss = boss;
    this.phase = 'fight';
    g.fx.lightning(new THREE.Vector3(opts.at.x, 20, opts.at.z), new THREE.Vector3(opts.at.x, 0.2, opts.at.z), 0xff8a5a, 0.6);
    g.later(1.2, () => g.say(this.lines.greet[0], this.lines.greet[1], 'boss'));
  }

  // El jefe cayó: se termina todo.
  onBossDead() {
    const g = this.g;
    this.phase = 'won';
    this.setWard(false);
    for (const c of this.rain) c.group.removeFromParent();
    this.rain = [];
    g.hud.setBossBar(null);
    for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    for (const f of this.fireballs) f.mesh.removeFromParent();
    this.fireballs = [];
    for (const F of this.fcols || []) {
      F.t = -1;
      F.m.visible = false;
    }
    g.post.flash(1.2);
    g.later(4, () => g.win());
  }

  // El anfitrión elige a quién (a cualquiera de los que están en pie) y avisa:
  // todos la ven volar y cada uno se fija si le pega a él.
  // Posiciones de los que están en pie (el local y los de la red). Al
  // escondido en una mata del Maizaster no le apunta (entities/maizaster.js).
  standing() {
    const g = this.g;
    const list = [];
    if (g.player.canBeHit() && !g.player.maizIn) list.push(g.player.pos);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && !r.maizIn) list.push(r.pos);
    return list;
  }

  // spread: cuántas en abanico (1 = una sola, derecho al jugador).
  // (en co-op, una para cada uno: antes iba una sola a uno al azar y con más
  // jugadores cada uno recibía menos)
  fireball(from, spread = 1) {
    const g = this.g;
    for (const tp of this.standing()) {
      const aim = new THREE.Vector3(tp.x, tp.y + 1.5, tp.z).sub(from).normalize();
      for (let i = 0; i < spread; i++) {
        const vel = aim.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (i - (spread - 1) / 2) * 0.22).multiplyScalar(this.fireSpeed);
        this.spawnFireball(from, vel);
        g.net?.event('fireball', { x: +from.x.toFixed(2), y: +from.y.toFixed(2), z: +from.z.toFixed(2), vx: +vel.x.toFixed(2), vy: +vel.y.toFixed(2), vz: +vel.z.toFixed(2) });
      }
    }
  }

  // ---------------- lluvia de fuego ----------------
  // Un círculo debajo de cada uno y algunos sueltos; explotan al rato.
  fireRain() {
    const g = this.g;
    const pts = [];
    for (const p of this.standing()) pts.push([p.x + (Math.random() - 0.5) * 1.2, p.z + (Math.random() - 0.5) * 1.2]);
    const extra = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * (this.A.r - 2);
      pts.push([this.A.x + Math.cos(a) * d, this.A.z + Math.sin(a) * d]);
    }
    const flat = pts.flatMap(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
    this.spawnRain(flat);
    g.net?.event('frain', { p: flat });
  }

  spawnRain(flat) {
    const g = this.g;
    for (let i = 0; i < flat.length; i += 2) {
      const group = new THREE.Group();
      group.position.set(flat[i], (this.A.y || 0) + 0.05, flat[i + 1]);
      group.scale.setScalar(this.rainR);
      const mat = new THREE.MeshBasicMaterial({ color: this.rainColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const ring = new THREE.Mesh(this.rainGeo, mat);
      const fill = new THREE.Mesh(this.rainFill, mat.clone());
      fill.scale.setScalar(0.01);
      group.add(ring, fill);
      g.scene.add(group);
      this.rain.push({ group, ring, fill, t: 0 });
    }
    g.audio.growl(tmpV.set(this.A.x, (this.A.y || 0) + 3, this.A.z), 'boss');
  }

  updateRain(dt) {
    const g = this.g;
    const pulse = 0.7 + Math.sin(g.time * 20) * 0.3;
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const c = this.rain[i];
      c.t += dt;
      const k = Math.min(1, c.t / this.rainDelay);
      c.ring.material.opacity = (0.35 + k * 0.5) * pulse;
      c.fill.material.opacity = 0.25 * k;
      c.fill.scale.setScalar(Math.max(0.01, k));
      if (c.t < this.rainDelay) continue;
      // estalla: cada uno se fija si lo agarró a él
      const p = c.group.position;
      g.fx.explosion(tmpV.set(p.x, p.y + 0.35, p.z), this.rainR, this.rainBoom || [1, 0.4, 0.1]);
      g.fx.fire(tmpV.set(p.x, p.y + 0.25, p.z), this.rainR * 0.6, 8);
      g.audio.explosion(p, 0.35);
      const pp = g.player.pos;
      if (g.player.canBeHit() && Math.hypot(pp.x - p.x, pp.z - p.z) < this.rainR) g.player.damage(this.rainDmg, p);
      c.group.removeFromParent();
      c.ring.material.dispose();
      c.fill.material.dispose();
      this.rain.splice(i, 1);
    }
  }

  // ---------------- el escudo de fuego ----------------
  setWard(on) {
    const g = this.g;
    if (this.ward === on) return;
    this.ward = on;
    this.wardT = 0;
    if (!g.net?.guest) g.net?.event('ward', { on: on ? 1 : 0 });
    if (on) g.hud.subtitle(this.lines.ward, 4, 'boss');
    else if (this.phase === 'fight') {
      g.audio.chain(tmpV.set(this.A.x, 2, this.A.z));
    }
  }

  // El escudo y la lluvia se ven igual en todas las compus.
  updateShared(dt) {
    const g = this.g;
    const b = g.zombies.boss;
    const show = this.ward && b && !b.dead;
    this.wardMesh.visible = !!show;
    if (show) {
      const s = b.scale || 2;
      this.wardMesh.position.set(b.pos.x, (b.baseY || 0) + 0.95 * s, b.pos.z);
      this.wardMesh.scale.set(0.8 * s, 1.05 * s, 0.8 * s);
      this.wardMesh.material.opacity = 0.14 + Math.sin(g.time * 9) * 0.05;
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2;
        g.fx.fire(tmpV.set(b.pos.x + Math.cos(a) * 1.2, (b.baseY || 0) + 0.3 + Math.random() * 3, b.pos.z + Math.sin(a) * 1.2), 0.3, 1);
      }
    }
    this.updateRain(dt);
    this.updateFireballs(dt);
    this.updateFireCols(dt);
  }

  spawnFireball(from, vel) {
    const g = this.g;
    const mesh = this.fireballMesh();
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.fireballs.push({ mesh, vel: vel.clone(), t: 0, from: from.clone() });
    g.audio.launcher(from);
  }

  fireballMesh() {
    this.fireMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(this.fireColor).multiplyScalar(3), toneMapped: false });
    return new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), this.fireMat);
  }

  // Las bolas de fuego vuelan igual en todas las compus; cada uno se cuida la suya.
  updateFireballs(dt) {
    const g = this.g;
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += dt * 7;
      f.mesh.rotation.z += dt * 4;
      if (Math.random() < 0.8) g.fx.fire(f.mesh.position, 0.2, 1);
      const hit = g.player.canBeHit() && f.mesh.position.distanceTo(g.camera.position) < 0.9;
      const col = this.colHit(f.mesh.position, 0.25, true);
      if (hit || col || f.t > 4 || f.mesh.position.y < (this.A.y || 0) + 0.1) {
        if (hit) g.player.damage(45, f.from);
        if (col && !hit) this.colBlock(col, f.mesh.position);
        else {
          g.fx.explosion(f.mesh.position, 1.2, [1, 0.45, 0.15]);
          g.audio.explosion(f.mesh.position, 0.5);
        }
        f.mesh.removeFromParent();
        this.fireballs.splice(i, 1);
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    if (g.net?.guest) {
      // el invitado solo se queda adentro del círculo y ve el fuego
      const dx = g.player.pos.x - this.A.x;
      const dz = g.player.pos.z - this.A.z;
      const d = Math.hypot(dx, dz);
      if (d > this.A.r - 0.5) {
        g.player.pos.x = this.A.x + (dx / d) * (this.A.r - 0.5);
        g.player.pos.z = this.A.z + (dz / d) * (this.A.r - 0.5);
      }
      this.pushOut(g.player.pos, 0.4);
      for (const b of this.braziers) if (Math.random() < 0.5) g.fx.fire(b, 0.5, 1);
      for (const l of this.lights) l.intensity = 34 + Math.sin(this.t * 11 + l.position.x) * 6;
      this.updateShared(dt);
      return;
    }
    // nadie sale del círculo
    const clamp = (p, rad) => {
      const dx = p.x - this.A.x;
      const dz = p.z - this.A.z;
      const d = Math.hypot(dx, dz);
      const max = this.A.r - rad;
      if (d > max) {
        p.x = this.A.x + (dx / d) * max;
        p.z = this.A.z + (dz / d) * max;
      }
    };
    clamp(g.player.pos, 0.5);
    for (const z of g.zombies.pool) if (z.active) clamp(z.pos, 0.4);
    if (g.zombies.boss) clamp(g.zombies.boss.pos, 1);
    this.pushOut(g.player.pos, 0.4);
    for (const z of g.zombies.pool) if (z.active) this.pushOut(z.pos, 0.35);
    if (g.zombies.boss) this.pushOut(g.zombies.boss.pos, 0.6);
    for (const b of this.braziers) if (Math.random() < 0.5) g.fx.fire(b, 0.5, 1);
    for (const l of this.lights) l.intensity = 34 + Math.sin(this.t * 11 + l.position.x) * 6 + Math.random() * 4;

    if (this.phase === 'fight' && this.boss) {
      const b = this.boss;
      const k = b.hp / b.maxHp;
      g.hud.setBossBar(this.ward ? `${this.bossName} (protegido)` : this.bossName, k);
      // al 75, 50 y 25%: se cubre de fuego y llama peones; el fuego se cae
      // cuando no queda ningún peón (o al rato, para que no se trabe)
      this.wards.forEach((th, i) => {
        if (k < th && !this.summoned.includes(th)) {
          this.summoned.push(th);
          const n = 6 + i * 2 + Math.min(4, (g.rounds?.players || 1) - 1) * 2;
          this.wave(n);
          this.waveUntil = this.t + n * 0.4 + 1;
          this.setWard(true);
        }
      });
      if (this.ward) {
        this.wardT += dt;
        const left = g.zombies.pool.some((z) => z.active && !z.dead);
        if ((!left && this.t > this.waveUntil) || this.wardT > this.wardMax) this.setWard(false);
      }
      // cada vez más rápido
      b.speed = k < 0.25 ? this.speeds[2] : k < 0.5 ? this.speeds[1] : this.speeds[0];
      // el ataque a distancia (cada arena el suyo: ranged)
      this.fireT -= dt;
      if (this.fireT <= 0 && !b.dead && b.state === 'chase') this.ranged(b, k);
      this.fireColTick(dt, k);
      // lluvia de fuego cuando le quedan dos tercios
      if (k < this.rainFrom) {
        this.rainT -= dt;
        if (this.rainT <= 0 && !b.dead) {
          this.rainT = k < 0.33 ? 6 : 9;
          this.fireRain();
        }
      }
      // munición del más allá
      this.ammoT -= dt;
      if (this.ammoT <= 0) {
        this.ammoT = 40;
        g.powerups.bag.push('maxammo');
        g.powerups.drop(new THREE.Vector3(this.A.x + (Math.random() - 0.5) * 12, this.A.y || 0, this.A.z + (Math.random() - 0.5) * 12), true);
      }
    }
    this.updateShared(dt);
  }

  // (anfitrión) Bolas de fuego a distancia: de a dos en la segunda mitad, en
  // abanico al final. Pone cuándo va la próxima (fireT).
  ranged(b, k) {
    const g = this.g;
    this.fireT = k < 0.25 ? 1.9 : k < 0.5 ? 2.4 : 3.6;
    const n = k < 0.25 ? 3 : 1;
    const hand = tmpV.set(b.pos.x + Math.sin(b.yaw) * 0.8, (b.baseY || 0) + 2.6, b.pos.z + Math.cos(b.yaw) * 0.8).clone();
    this.fireball(hand, n);
    if (k < 0.5) g.later(0.35, () => !b.dead && this.fireball(hand, n));
  }

  wave(n) {
    const g = this.g;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const p = new THREE.Vector3(this.A.x + Math.cos(a) * (this.A.r - 4), 0, this.A.z + Math.sin(a) * (this.A.r - 4));
      g.later(i * 0.4, () => g.zombies.spawn(15, 3000, p));
    }
  }

  dispose() {
    for (const l of this.lights) l.removeFromParent();
    this.cineLight?.removeFromParent();
    for (const f of this.fireballs) f.mesh.removeFromParent();
    for (const c of this.rain) c.group.removeFromParent();
    this.wardMesh.removeFromParent();
    for (const F of this.fcols || []) F.m.removeFromParent();
  }
}
