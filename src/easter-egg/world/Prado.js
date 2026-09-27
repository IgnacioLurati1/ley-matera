import * as THREE from 'three';
import Arena from './Arena';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from './props';
import { EE } from '../config/map';

// El Prado: el claro redondo en el maizal donde termina la granja. Se abre
// cuando la yerba está empaquetada; al ofrecerla en el centro sale de la
// tierra el Espantapájaros gigante. Por dentro es la misma pelea que la de la
// Salamanca (peones, escudo, lluvia y cosas que vuelan), con su propia ropa:
// calabazas prendidas fuego y una lluvia de plumas negras.

export default class Prado extends Arena {
  constructor(game) {
    super(game, { ...EE.arena });
  }

  setup() {
    super.setup();
    this.name = 'El Prado';
    this.sub = 'Donde la paja aprendió a odiar';
    this.bossName = 'El Espantapájaros';
    this.bossHp = 200000;
    // más lento que el Mandinga: es enorme y es de paja (igual, ya no se lo
    // deja atrás caminando para atrás)
    this.speeds = [3.1, 3.6, 4.1];
    this.rainColor = 0x8a3aff;
    this.fireColor = 0xff7a18;
    this.weatherName = 'fog';
    this.lines = {
      greet: ['espantapajaros', 'Cien años cuidando este maíz de los cuervos... y ahora vienen ustedes a robarme la cosecha.'],
      rain: '¡Llueven plumas! Salí de los círculos.',
      ward: 'Los cuervos lo cubren: ¡liquidá a los peones para que se vayan!',
      unward: '¡Se le fueron los cuervos! Ahora, dale.',
      summon: 'El Espantapájaros levanta a los muertos del maizal...',
    };
  }

  bossOpts() {
    return { at: new THREE.Vector3(this.A.x, 0, this.A.z - 3), mandinga: true, kind: 'scarecrow', hp: this.bossHp };
  }

  // Fogatas alrededor del claro (lo demás del borde está en decor()).
  build() {
    const M = this.g.world.M;
    const { x, z, r } = this.A;
    // la luz de la Entidad en la cinemática del final (ui/FarmCinematic.js):
    // existe desde que se arma el mapa, apagada. Sumar una en medio de la
    // partida recompila todos los shaders (en Épico congelaba unos 13 s).
    this.cineLight = new THREE.PointLight(0xc8a0ff, 0, 45, 1.4);
    this.g.scene.add(this.cineLight);
    this.braziers = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const bx = x + Math.cos(a) * (r - 0.6);
      const bz = z + Math.sin(a) * (r - 0.6);
      for (let k = 0; k < 4; k++) this.root.add(mesh(cylGeo(0.07, 0.08, 1, 6), M.log, bx, 0.18, bz, Math.PI / 2 - 0.4, (k / 4) * Math.PI, 0));
      this.root.add(mesh(cylGeo(0.35, 0.4, 0.05, 10), M.fireGlow, bx, 0.04, bz));
      this.braziers.push(new THREE.Vector3(bx, 0.35, bz));
    }
    this.lights = [0, 1].map((k) => {
      const l = new THREE.PointLight(0xff7a2a, 0, 26, 1.6);
      l.position.set(x + (k ? 4 : -4), 3.5, z);
      this.g.scene.add(l);
      return l;
    });
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x3a1a5a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    // cuervos que dan vueltas alrededor del espantapájaros mientras lo cubren
    this.flock = [];
    const crowMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4 });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      c.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6).scale(0.8, 0.7, 1.6), crowMat));
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.18).translate(s * 0.22, 0, 0), crowMat);
        c.add(w);
      }
      c.visible = false;
      this.g.scene.add(c);
      this.flock.push({ obj: c, a: (i / 10) * Math.PI * 2, h: 2 + Math.random() * 3, rad: 1.6 + Math.random() * 1.4, sp: 1.5 + Math.random() });
    }
    // el cuervo que marca a quién va cuando se mete bajo tierra
    this.markCrow = this.flock[0].obj.clone();
    this.markCrow.scale.setScalar(2.2);
    this.markCrow.visible = false;
    this.g.scene.add(this.markCrow);
    this.markV = new THREE.Vector3();
    // fardos de pasto en el claro: tapan las calabazas y, si el Espantapájaros
    // embiste contra uno, queda atontado
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x + Math.cos(a) * 5.5;
      const cz = z + Math.sin(a) * 5.5;
      this.root.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), M.hay, cx, 0.75, cz, Math.PI / 2, 0, a));
      this.cols.push({ x: cx, z: cz, r: 0.85, h: 1.5, what: 'el fardo' });
    }
    this.decor();
  }

  start() {
    super.start();
    this.digT = 12;
  }

  // (anfitrión) Cada tanto se mete bajo tierra y el cuervo marca a uno
  // (entities/bossMoves.js: sale de abajo donde estaba parado ese).
  update(dt) {
    super.update(dt);
    const g = this.g;
    if (!this.active || g.net?.guest || this.phase !== 'fight') return;
    const b = g.zombies.boss;
    if (!b || b.dead || b.kind !== 'scarecrow' || this.ward || b.state !== 'chase') return;
    this.digT = (this.digT ?? 12) - dt;
    if (this.digT > 0) return;
    this.digT = b.hp / b.maxHp < 0.5 ? 15 : 20;
    const M = g.zombies.moves;
    const list = M.standing();
    if (list.length) M.startBurrow(b, M.idOf(list[Math.floor(Math.random() * list.length)]));
  }

  // El claro embrujado al atardecer: espantapájaros con cuervos, antorchas,
  // zapallos, alambrados caídos, niebla baja y el ombú podrido atrás, de donde
  // salió el Espantapájaros. Todo pegado al maizal (la pelea es en el medio y
  // nada de esto choca) y fundido en pocas mallas. No suma luces: lo que
  // brilla es emisivo y el fuego es el de las fogatas.
  decor() {
    const M = this.g.world.M;
    const { x, z, r } = this.A;
    let seed = 23;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tmp = new THREE.Group();
    const put = (to, geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, s = null) => {
      const m = mesh(geo, mat, px, py, pz, rx, ry, rz);
      if (s) m.scale.set(...s);
      to.add(m);
      return m;
    };
    // un lugar en el borde, de frente al centro (+z mira al medio)
    const spot = (a, d) => {
      const o = new THREE.Group();
      o.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
      o.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      tmp.add(o);
      return o;
    };
    const crowMat = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.55 });
    const rotten = new THREE.MeshStandardMaterial({ color: 0x5e4a24, roughness: 0.95 });
    const hollow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8a3aff, emissiveIntensity: 1.4 });
    const sph = new THREE.SphereGeometry(1, 10, 8);
    const lo = new THREE.SphereGeometry(1, 7, 5);
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const cone = new THREE.ConeGeometry(1, 1, 5);
    const tri = new THREE.ConeGeometry(1, 1, 3);
    const up = new THREE.Vector3(0, 1, 0);

    // cuervo posado, mirando a +z
    const crow = (to, px, py, pz, yaw, s = 1) => {
      const c = new THREE.Group();
      c.position.set(px, py, pz);
      c.rotation.y = yaw;
      c.scale.setScalar(s);
      to.add(c);
      put(c, lo, crowMat, 0, 0.11, 0, -0.35, 0, 0, [0.08, 0.085, 0.15]);
      put(c, lo, crowMat, 0, 0.2, 0.11, 0, 0, 0, [0.058, 0.058, 0.065]);
      put(c, cone, crowMat, 0, 0.19, 0.2, Math.PI / 2, 0, 0, [0.022, 0.09, 0.022]);
      put(c, boxGeo(0.09, 0.015, 0.17), crowMat, 0, 0.07, -0.18, -0.55, 0, 0);
      for (const sx of [-1, 1]) {
        put(c, lo, crowMat, sx * 0.05, 0.11, -0.03, -0.3, sx * 0.1, 0, [0.03, 0.07, 0.15]);
        put(c, cylGeo(0.006, 0.006, 0.07, 3), crowMat, sx * 0.025, 0.02, 0.01);
      }
    };

    // espantapájaros viejos en su cruz, de frente al claro
    const shirts = [M.redCloth, M.sack, M.whiteCloth, M.redCloth, M.sack];
    [3.91, 6.1, 0.6, 2.17, 2.94].forEach((a, i) => {
      const o = spot(a, r - 0.1);
      const b = new THREE.Group();
      b.rotation.set((rnd() - 0.5) * 0.14, 0, (rnd() - 0.5) * 0.2);
      o.add(b);
      const shirt = shirts[i];
      put(b, cylGeo(0.055, 0.075, 2.75, 6), M.log, 0, 1.2, 0);
      put(b, cylGeo(0.04, 0.045, 1.6, 6), M.log, 0, 1.78, 0, 0, 0, Math.PI / 2);
      put(b, cylGeo(0.21, 0.27, 0.7, 8), shirt, 0, 1.5, 0, 0, 0, 0, [1, 1, 0.7]);
      for (const sx of [-1, 1]) {
        put(b, cylGeo(0.08, 0.1, 0.5, 7), shirt, sx * 0.43, 1.78, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 4; k++) put(b, cone, M.straw, sx * (0.72 + rnd() * 0.06), 1.74 + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.1, 0, 0, -sx * (1.2 + rnd() * 0.8), [0.03, 0.22, 0.03]);
        // una pierna de la bombacha, colgando vacía
        put(b, cylGeo(0.07, 0.085, 0.6, 6), M.sack, sx * 0.1, 0.88, 0, 0, 0, sx * 0.08);
        // trapos colgando de la manga
        put(b, new THREE.PlaneGeometry(0.16, 0.42), M.redCloth, sx * (0.3 + rnd() * 0.25), 1.56, 0.09, 0.1, 0, (rnd() - 0.5) * 0.3);
      }
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        put(b, cone, M.straw, Math.cos(t) * 0.2, 1.1, Math.sin(t) * 0.14, Math.PI + Math.sin(t) * 0.3, 0, -Math.cos(t) * 0.3, [0.035, 0.24, 0.035]);
      }
      // cabeza de arpillera: ojos de brasa (o botones) y la boca cosida
      put(b, cylGeo(0.05, 0.06, 0.14, 6), M.rope, 0, 1.9, 0);
      put(b, sph, M.sack, 0, 2.08, 0, 0, 0, 0, [0.18, 0.21, 0.17]);
      for (const sx of [-1, 1]) put(b, lo, i % 2 ? M.black : M.fireGlow, sx * 0.065, 2.12, 0.15, 0, 0, 0, [0.028, 0.028, 0.015]);
      put(b, boxGeo(0.12, 0.012, 0.01), M.black, 0, 2.0, 0.152);
      const hat = new THREE.Group();
      hat.position.set(0.02, 2.25, -0.01);
      hat.rotation.set(-0.18 + rnd() * 0.1, rnd() * 3, (rnd() - 0.5) * 0.24);
      b.add(hat);
      put(hat, cylGeo(0.32, 0.34, 0.025, 12), M.straw, 0, 0, 0);
      put(hat, cylGeo(0.13, 0.16, 0.17, 10), M.straw, 0, 0.09, 0);
      put(hat, cylGeo(0.162, 0.162, 0.04, 10), M.black, 0, 0.03, 0);
      // los cuervos que ya no le tienen miedo
      if (i !== 2) crow(b, (i % 2 ? -1 : 1) * (0.5 + rnd() * 0.12), 1.86, 0, (rnd() - 0.5) * 2.4, 1.3);
      if (i === 1 || i === 4) crow(b, 0, 2.43, 0.03, (rnd() - 0.5) * 2, 1.2);
    });

    // antorchas de tacuara: su fuego se suma al de las fogatas (braziers)
    const torches = [];
    for (const a of [4.29, 5.13, 1.38, 3.73]) {
      const o = spot(a, r - 0.05);
      const t = new THREE.Group();
      t.rotation.set(0.08 + rnd() * 0.06, 0, (rnd() - 0.5) * 0.12);
      o.add(t);
      put(t, cylGeo(0.035, 0.05, 2.4, 6), M.log, 0, 1.05, 0);
      for (const y of [0.55, 1.15, 1.7]) put(t, cylGeo(0.043, 0.043, 0.03, 6), M.log, 0, y, 0);
      put(t, cylGeo(0.05, 0.05, 0.06, 6), M.rope, 0, 2.08, 0);
      put(t, cylGeo(0.085, 0.06, 0.2, 7), M.sack, 0, 2.2, 0);
      put(t, cylGeo(0.08, 0.085, 0.03, 7), M.fireGlow, 0, 2.31, 0);
      const f = new THREE.Object3D();
      f.position.set(0, 2.4, 0);
      t.add(f);
      torches.push(f);
    }

    // piedras alrededor de las fogatas
    for (const b of this.braziers) {
      for (let k = 0; k < 7; k++) {
        const t = (k / 7) * Math.PI * 2 + rnd() * 0.3;
        const s = 0.1 + rnd() * 0.07;
        put(tmp, ico, M.stone, b.x + Math.cos(t) * 0.52, s * 0.4, b.z + Math.sin(t) * 0.52, rnd() * 3, rnd() * 3, 0, [s, s * 0.8, s]);
      }
    }

    // zapallos secos (algunos podridos, tres tallados con brasa adentro) y porongos
    const pumpGeo = new THREE.SphereGeometry(1, 16, 10);
    const pp = pumpGeo.attributes.position;
    const bulge = (px, py, pz) => {
      const f = 1 + 0.08 * Math.cos(Math.atan2(pz, px) * 8);
      const rxz = Math.hypot(px, pz);
      return [px * f, py * 0.7 - Math.sign(py) * 0.25 * (1 - rxz) ** 2, pz * f];
    };
    for (let i = 0; i < pp.count; i++) pp.setXYZ(i, ...bulge(pp.getX(i), pp.getY(i), pp.getZ(i)));
    pumpGeo.computeVertexNormals();
    const gourdGeo = new THREE.LatheGeometry(
      [[0, 0], [0.12, 0.02], [0.17, 0.1], [0.16, 0.2], [0.09, 0.28], [0.065, 0.34], [0.08, 0.42], [0.07, 0.5], [0.03, 0.55], [0, 0.56]].map(([u, v]) => new THREE.Vector2(u, v)),
      10,
    );
    let lit = 0;
    const pumpkin = (a, d, s, lantern = false) => {
      const o = spot(a, d);
      const m = put(o, pumpGeo, !lantern && rnd() < 0.3 ? rotten : M.pumpkin, 0, s * 0.5, 0, (rnd() - 0.5) * 0.3, lantern ? (rnd() - 0.5) * 0.4 : rnd() * 6, (rnd() - 0.5) * 0.3, [s, s, s]);
      put(o, cylGeo(0.035, 0.06, 0.2, 5), M.log, 0, s * 0.95 + 0.07, 0, (rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6);
      if (!lantern) return;
      // la cara tallada: la brasa de adentro asoma por los cortes
      for (const [fx, fy, w, h, rot] of [[-0.34, 0.25, 0.22, 0.2, 0], [0.34, 0.25, 0.22, 0.2, 0], [0, 0.05, 0.1, 0.1, Math.PI], [0, -0.25, 0.44, 0.1, 0]]) {
        const u = new THREE.Vector3(fx, fy, 0);
        u.z = Math.sqrt(Math.max(0, 1 - u.x * u.x - u.y * u.y));
        const [sx, sy, sz] = bulge(u.x, u.y, u.z);
        put(m, rot || fy > 0 ? tri : lo, M.fireGlow, sx, sy, sz * 0.97, Math.PI / 2, 0, rot, fy > 0 || rot ? [w, 0.12, h] : [w, h, 0.12]);
      }
    };
    const gourd = (a, d) => {
      const o = spot(a, d);
      const lying = rnd() < 0.5;
      put(o, gourdGeo, M.gourd, (rnd() - 0.5) * 0.3, lying ? 0.15 : 0, 0, lying ? Math.PI / 2 : 0, 0, lying ? 0 : (rnd() - 0.5) * 0.2, [1, 1, 1]).rotation.y = rnd() * 6;
    };
    for (const [a, n] of [[3.91, 3], [6.1, 2], [0.6, 3], [2.17, 2], [2.94, 3], [1.15, 4], [2.42, 3], [3.5, 2], [4.05, 3], [5.9, 3], [0.3, 2]]) {
      for (let k = 0; k < n; k++) {
        const aa = a + (rnd() - 0.5) * 0.22;
        const d = r - 0.2 + rnd() * 0.6;
        if (rnd() < 0.2) gourd(aa, d);
        else pumpkin(aa, d, 0.2 + rnd() * 0.14, lit < 3 && k === 0 && (a === 0.6 || a === 2.94 || a === 4.05) && ++lit > 0);
      }
    }

    // alambrados de palo caídos: postes chuecos, tablas que faltan o cuelgan
    const posts = [];
    const fence = (a0, a1) => {
      const d = r + 0.25;
      const n = Math.max(2, Math.round(((a1 - a0) * d) / 1.8));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n + (rnd() - 0.5) * 0.02;
        if (i > 0 && i < n && rnd() < 0.15) {
          prev = null;
          continue;
        }
        const h = 1.0 + rnd() * 0.3;
        const cur = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, h };
        put(tmp, cylGeo(0.06, 0.075, 1, 6), M.fenceDark, cur.x, h / 2 - 0.05, cur.z, (rnd() - 0.5) * 0.2, rnd() * 3, (rnd() - 0.5) * 0.2, [1, h, 1]);
        posts.push(cur);
        if (prev) {
          const dx = cur.x - prev.x;
          const dz = cur.z - prev.z;
          const L = Math.hypot(dx, dz);
          for (const y of [0.42, 0.85]) {
            const k = rnd();
            if (k < 0.2) continue;
            if (k < 0.4) {
              // quebrada: cuelga de un poste con la punta en el piso
              const back = rnd() < 0.5;
              const from = back ? cur : prev;
              const l = L * (0.45 + rnd() * 0.2);
              const g = new THREE.Group();
              g.position.set(from.x, y, from.z);
              g.rotation.y = back ? Math.atan2(dz, -dx) : Math.atan2(-dz, dx);
              const tilt = new THREE.Group();
              tilt.rotation.z = -Math.asin(Math.min(0.95, (y - 0.03) / l));
              g.add(tilt);
              put(tilt, boxGeo(1, 0.1, 0.035), M.fenceDark, l / 2, 0, 0, 0, 0, 0, [l, 1, 1]);
              tmp.add(g);
              continue;
            }
            put(tmp, boxGeo(1, 0.1, 0.035), M.fenceDark, (prev.x + cur.x) / 2, y + (rnd() - 0.5) * 0.05, (prev.z + cur.z) / 2, 0, Math.atan2(-dz, dx), (rnd() - 0.5) * 0.06, [L + 0.15, 1, 1]);
          }
        }
        prev = cur;
      }
    };
    fence(0.75, 1.3);
    fence(1.9, 2.45);
    fence(2.65, 3.6);
    fence(5.75, 6.45);
    for (const k of [2, 7]) {
      const p = posts[k % posts.length];
      crow(tmp, p.x, p.h - 0.05, p.z, rnd() * 6, 1.3);
    }

    // el ombú podrido, atrás a la derecha del jefe, pasando el maizal
    const oa = 5.31;
    const tx = x + Math.cos(oa) * (r + 3.6);
    const tz = z + Math.sin(oa) * (r + 3.6);
    const toC = Math.atan2(z - tz, x - tx);
    put(tmp, new THREE.CylinderGeometry(1.05, 1.6, 5.6, 14), M.bark, tx, 2.7, tz, 0, rnd(), 0);
    put(tmp, ico, M.bark, tx, 5.45, tz, 0, rnd(), 0, [1.1, 0.5, 1.1]);
    // contrafuertes (dejan libre el hueco que mira al claro)
    for (let i = 0; i < 7; i++) {
      const t = toC + 0.5 + (i / 6) * (Math.PI * 2 - 1);
      put(tmp, cone, M.bark, tx + Math.cos(t) * 1.35, 1.4, tz + Math.sin(t) * 1.35, -Math.sin(t) * 0.25, 0, Math.cos(t) * 0.25, [0.6 + rnd() * 0.2, 3.6 + rnd(), 0.45]);
    }
    // el hueco de donde salió: negro, con una brasa violeta adentro
    const hole = new THREE.Group();
    hole.position.set(tx + Math.cos(toC) * 1.2, 3.7, tz + Math.sin(toC) * 1.2);
    hole.rotation.y = Math.atan2(Math.cos(toC), Math.sin(toC));
    const lean = new THREE.Group();
    lean.rotation.x = -0.1;
    hole.add(lean);
    put(lean, lo, M.black, 0, 0, 0.01, 0, 0, 0, [0.45, 0.95, 0.05]);
    put(lean, lo, hollow, 0, -0.1, 0.03, 0, 0, 0, [0.16, 0.5, 0.04]);
    put(lean, new THREE.TorusGeometry(1, 0.14, 5, 16), M.bark, 0, 0, 0.02, 0, 0, 0, [0.5, 1, 1]);
    tmp.add(hole);
    // las ramas peladas: gajos torcidos que se abren y se afinan
    const perches = [];
    const dv = new THREE.Vector3();
    const seg = (a, b, r0, r1) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 6), M.bark);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(up, dv.copy(b).sub(a).normalize());
      tmp.add(m);
      if (r1 > 0.05) {
        const j = new THREE.Mesh(ico, M.bark);
        j.position.copy(b);
        j.scale.setScalar(r1 * 1.1);
        tmp.add(j);
      }
    };
    const limb = (p, dir, len, rad, depth) => {
      let cur = p.clone();
      const d = dir.clone();
      for (let s = 0; s < 3; s++) {
        d.x += (rnd() - 0.5) * 0.45;
        d.z += (rnd() - 0.5) * 0.45;
        d.y += (rnd() - 0.5) * 0.3 - 0.06 * depth;
        d.normalize();
        const nxt = cur.clone().addScaledVector(d, len / 3);
        const r1 = rad * (1 - (s + 1) * 0.12);
        seg(cur, nxt, rad * (1 - s * 0.12), r1);
        if (depth > 0 && Math.abs(d.y) < 0.5 && r1 > 0.07) perches.push({ p: cur.clone().lerp(nxt, 0.5).setY((cur.y + nxt.y) / 2 + r1), yaw: Math.atan2(d.x, d.z) });
        cur = nxt;
      }
      if (depth < 2) {
        for (let i = 0; i < (depth ? 2 : 3); i++) {
          const nd = d.clone();
          nd.x += (rnd() - 0.5) * 1.2;
          nd.z += (rnd() - 0.5) * 1.2;
          nd.y += 0.1 + (rnd() - 0.5) * 0.5;
          limb(cur, nd.normalize(), len * (0.55 + rnd() * 0.2), rad * 0.58, depth + 1);
        }
        return;
      }
      for (let i = 0; i < 3; i++) {
        const nd = d.clone();
        nd.x += (rnd() - 0.5) * 1.4;
        nd.z += (rnd() - 0.5) * 1.4;
        nd.y += (rnd() - 0.3) * 0.8;
        nd.normalize();
        const tl = 0.5 + rnd() * 0.5;
        const m = new THREE.Mesh(cone, M.bark);
        m.position.copy(cur).addScaledVector(nd, tl / 2);
        m.quaternion.setFromUnitVectors(up, nd);
        m.scale.set(0.025, tl, 0.025);
        tmp.add(m);
      }
    };
    for (let i = 0; i < 6; i++) {
      // las dos primeras se estiran sobre el claro, las otras se abren para atrás
      const t = i < 2 ? toC + (i ? 0.4 : -0.4) : toC + 0.9 + ((i - 2) / 4) * (Math.PI * 2 - 1.8) + (rnd() - 0.5) * 0.3;
      const el = i < 2 ? 0.45 : 0.7 + rnd() * 0.35;
      const dir = new THREE.Vector3(Math.cos(t) * Math.cos(el), Math.sin(el), Math.sin(t) * Math.cos(el));
      limb(new THREE.Vector3(tx + Math.cos(t) * 0.55, 5.1, tz + Math.sin(t) * 0.55), dir, i < 2 ? 4.5 : 4 + rnd() * 1.5, 0.5, 0);
    }
    for (let i = 0, n = 0; i < perches.length && n < 8; i++) {
      const p = perches[(i * 7) % perches.length];
      if (p.p.y < 5) continue;
      crow(tmp, p.p.x, p.p.y, p.p.z, p.yaw + (rnd() - 0.5) * 2, 1.6);
      n++;
    }
    // raíces que asoman en el borde del claro
    for (const a of [5.2, 5.4, 5.56]) {
      const o = spot(a, r + 0.2 + rnd() * 0.3);
      put(o, new THREE.TorusGeometry(0.7 + rnd() * 0.4, 0.13 + rnd() * 0.05, 5, 10, Math.PI), M.bark, 0, -0.15, 0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.6, 0);
    }

    // todo a su lugar en el mundo y fundido por material
    tmp.updateMatrixWorld(true);
    for (const f of torches) this.braziers.push(f.getWorldPosition(new THREE.Vector3()));
    const parts = [];
    tmp.traverse((o) => o.isMesh && parts.push(o));
    for (const o of parts) {
      o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
      this.root.add(o);
    }
    mergeByMaterial(this.root);

    // el piso: paja aplastada en anillos (algo giró acá), fogatas chamuscadas y plumas
    const S = 1024;
    const R = r + 0.5;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const P = (dx, dz) => [((dx / R + 1) / 2) * S, ((dz / R + 1) / 2) * S];
    c.lineCap = 'round';
    for (const [r0, r1] of [[1.6, 2.3], [4.6, 5.1], [7.2, 8.6]]) {
      for (let i = 0, n = Math.round(r1 * 300); i < n; i++) {
        const t = rnd() * Math.PI * 2;
        const rr = r0 + rnd() * (r1 - r0);
        const [px, py] = P(Math.cos(t) * rr, Math.sin(t) * rr);
        const len = 6 + rnd() * 14;
        const dir = t + Math.PI / 2 + 0.25;
        c.strokeStyle = `rgba(${(180 + rnd() * 35) | 0},${(150 + rnd() * 35) | 0},${(88 + rnd() * 25) | 0},${0.07 + rnd() * 0.16})`;
        c.lineWidth = 1 + rnd() * 1.8;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(dir) * len, py + Math.sin(dir) * len);
        c.stroke();
      }
    }
    const pxm = S / (2 * R);
    for (const b of this.braziers.slice(0, 8)) {
      const [px, py] = P(b.x - x, b.z - z);
      const gr = c.createRadialGradient(px, py, 0, px, py, 1.4 * pxm);
      gr.addColorStop(0, 'rgba(15,8,4,0.7)');
      gr.addColorStop(1, 'rgba(15,8,4,0)');
      c.fillStyle = gr;
      c.fillRect(px - 1.4 * pxm, py - 1.4 * pxm, 2.8 * pxm, 2.8 * pxm);
    }
    c.fillStyle = 'rgba(12,12,16,0.85)';
    for (let i = 0; i < 90; i++) {
      const t = rnd() * Math.PI * 2;
      const [px, py] = P(Math.cos(t) * rnd() * r, Math.sin(t) * rnd() * r);
      c.beginPath();
      c.ellipse(px, py, (0.12 + rnd() * 0.1) * pxm, 0.03 * pxm, rnd() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    floor.position.set(x, 0.012, z);
    floor.receiveShadow = true;
    this.root.add(floor);

    // niebla baja que se junta contra el maizal (dos capas que giran despacio)
    const mc = document.createElement('canvas');
    mc.width = mc.height = 512;
    const m2 = mc.getContext('2d');
    for (let i = 0; i < 260; i++) {
      const t = rnd() * Math.PI * 2;
      const rr = 0.55 + Math.sqrt(rnd()) * 0.45;
      const px = 256 + Math.cos(t) * rr * 256;
      const py = 256 + Math.sin(t) * rr * 256;
      const s = 18 + rnd() * 40;
      const k = Math.min(1, Math.max(0, (rr - 0.62) / 0.25));
      const gr = m2.createRadialGradient(px, py, 0, px, py, s);
      gr.addColorStop(0, `rgba(255,255,255,${0.09 * k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      m2.fillStyle = gr;
      m2.fillRect(px - s, py - s, s * 2, s * 2);
    }
    const mtex = new THREE.CanvasTexture(mc);
    const mistMat = new THREE.MeshBasicMaterial({ color: 0x9a92b4, map: mtex, transparent: true, opacity: 0.45, depthWrite: false });
    const mistGeo = new THREE.RingGeometry(r * 0.55, r + 1.8, 48, 1).rotateX(-Math.PI / 2);
    this.mist = [0.16, 0.45].map((h, i) => {
      const m = new THREE.Mesh(mistGeo, mistMat);
      m.position.set(x, h, z);
      m.rotation.y = i * 1.7;
      m.scale.setScalar(1 + i * 0.06);
      this.root.add(m);
      return m;
    });
  }

  // Calabazas prendidas fuego en vez de bolas de fuego.
  fireballMesh() {
    if (!this.pumpkinMat) {
      this.pumpkinMat = new THREE.MeshStandardMaterial({ color: 0xd8641a, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.6 });
      this.pumpkinGeo = new THREE.SphereGeometry(0.3, 12, 8).scale(1.2, 0.85, 1.2);
    }
    const m = new THREE.Mesh(this.pumpkinGeo, this.pumpkinMat);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 5), this.g.world.M.log);
    stem.position.y = 0.3;
    m.add(stem);
    return m;
  }

  updateShared(dt) {
    super.updateShared(dt);
    // el cuervo de la marca: da vueltas arriba del marcado
    const mk = this.g.zombies.moves.markAt(this.markV);
    this.markCrow.visible = !!mk;
    if (mk) {
      this.markA = (this.markA || 0) + dt * 2.4;
      this.markCrow.position.set(mk.x + Math.cos(this.markA) * 1.8, mk.y + 3.4 + Math.sin(this.g.time * 3) * 0.2, mk.z + Math.sin(this.markA) * 1.8);
      this.markCrow.rotation.y = -this.markA;
      const flap = Math.sin(this.g.time * 16) * 0.7;
      this.markCrow.children[1].rotation.z = flap;
      this.markCrow.children[2].rotation.z = -flap;
    }
    if (this.mist) {
      this.mist[0].rotation.y += dt * 0.025;
      this.mist[1].rotation.y -= dt * 0.018;
    }
    // la bandada que lo cubre
    const b = this.g.zombies.boss;
    const on = this.ward && b && !b.dead;
    for (const c of this.flock) {
      c.obj.visible = !!on;
      if (!on) continue;
      c.a += dt * c.sp;
      const s = b.scale || 2;
      c.obj.position.set(b.pos.x + Math.cos(c.a) * c.rad * s * 0.6, c.h * s * 0.4, b.pos.z + Math.sin(c.a) * c.rad * s * 0.6);
      c.obj.rotation.y = -c.a;
      const flap = Math.sin(this.g.time * 18 + c.a * 3) * 0.7;
      c.obj.children[1].rotation.z = flap;
      c.obj.children[2].rotation.z = -flap;
    }
  }

  dispose() {
    super.dispose();
    for (const c of this.flock || []) c.obj.removeFromParent();
    this.markCrow?.removeFromParent();
  }
}
