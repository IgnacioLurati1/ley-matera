import * as THREE from 'three';
import SliceWalk from './sliceWalk';

// Partículas (sangre, chispas, polvo, vapor, fuego, escarcha, almas),
// haces (trazadoras, rayos), calcos en paredes, luces de destello y restos.

const PVERT = `
attribute float size; attribute float alpha; attribute vec3 color;
varying vec3 vColor; varying float vAlpha;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(0.05, -mv.z);
  vColor = color; vAlpha = alpha;
}`;
const PFRAG_ADD = `
uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
void main(){ float a = texture2D(map, gl_PointCoord).a * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vColor * a, a); }`;
const PFRAG_ALPHA = `
uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
void main(){ float a = texture2D(map, gl_PointCoord).a * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(vColor, a); }`;

class ParticlePool {
  constructor(max, map, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.bounce = new Uint8Array(max);
    // piso de cada partícula (en el penal no todo cae al nivel 0)
    this.floor = new Float32Array(max);
    this.floorAt = null;
    this.attract = new Array(max).fill(null);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setAttribute('size', this.aSize);
    g.setAttribute('alpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.uniforms = { map: { value: map }, uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PVERT,
      fragmentShader: additive ? PFRAG_ADD : PFRAG_ALPHA,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    if (additive) {
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
    }
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(x, y, z, vx, vy, vz, { color = [1, 1, 1], size = 0.1, size1, life = 1, alpha = 1, gravity = 0, drag = 0, bounce = 0, attract = null }) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color[0];
    this.col[i * 3 + 1] = color[1];
    this.col[i * 3 + 2] = color[2];
    this.s0[i] = size;
    this.s1[i] = size1 ?? size;
    this.size[i] = size;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.bounce[i] = bounce;
    this.floor[i] = this.floorAt ? this.floorAt(x, z, y) : 0;
    this.attract[i] = attract;
  }

  kill(i) {
    const last = --this.count;
    if (i === last) return;
    const c3 = (a) => {
      a[i * 3] = a[last * 3];
      a[i * 3 + 1] = a[last * 3 + 1];
      a[i * 3 + 2] = a[last * 3 + 2];
    };
    c3(this.pos);
    c3(this.vel);
    c3(this.col);
    for (const a of [this.size, this.alpha, this.life, this.maxLife, this.s0, this.s1, this.a0, this.grav, this.drag, this.bounce, this.floor]) a[i] = a[last];
    this.attract[i] = this.attract[last];
  }

  update(dt) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const k = 1 - this.life[i] / this.maxLife[i];
      const j = i * 3;
      const at = this.attract[i];
      if (at) {
        // almas: vuelan hacia un punto
        const dx = at.x - this.pos[j];
        const dy = at.y - this.pos[j + 1];
        const dz = at.z - this.pos[j + 2];
        const d = Math.hypot(dx, dy, dz) || 1;
        const sp = 7;
        this.vel[j] += ((dx / d) * sp - this.vel[j]) * Math.min(1, dt * 3);
        this.vel[j + 1] += ((dy / d) * sp - this.vel[j + 1]) * Math.min(1, dt * 3);
        this.vel[j + 2] += ((dz / d) * sp - this.vel[j + 2]) * Math.min(1, dt * 3);
        if (d < 0.3) {
          this.kill(i);
          continue;
        }
      }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= dr;
      this.vel[j + 1] = this.vel[j + 1] * dr - this.grav[i] * dt;
      this.vel[j + 2] *= dr;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < this.floor[i] + 0.02) {
        this.pos[j + 1] = this.floor[i] + 0.02;
        if (this.bounce[i]) this.vel[j + 1] *= -0.3;
        else this.vel[j + 1] = 0;
        this.vel[j] *= 0.6;
        this.vel[j + 2] *= 0.6;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9);
    }
    this.points.geometry.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const tmpR = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
// objetos de la escena por llamada al rehacer lowFlats (fx/sliceWalk.js)
const FLATS_N = 300;
const decalRay = new THREE.Raycaster();

export default class Effects {
  constructor(game) {
    this.g = game;
    const T = game.textures;
    this.scene = game.scene;
    this.add = new ParticlePool(4000, T.dot, true);
    this.alpha = new ParticlePool(3000, T.dot, false);
    if (game.world?.levels) {
      const fa = (x, z, y) => Math.min(y, game.world.floorAt(x, z, y));
      this.add.floorAt = fa;
      this.alpha.floorAt = fa;
    }
    this.scene.add(this.add.points, this.alpha.points);

    // haces: un plano instanciado estirado entre dos puntos y girado a cámara
    const BMAX = 256;
    const bg = new THREE.PlaneGeometry(1, 1);
    const bt = this.beamTexture();
    const bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.beamMesh = new THREE.InstancedMesh(bg, bm, BMAX);
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamMesh.setColorAt(0, new THREE.Color());
    this.beamMesh.frustumCulled = false;
    this.beamMesh.count = 0;
    this.beamMesh.renderOrder = 6;
    this.scene.add(this.beamMesh);
    this.beams = [];
    this.BMAX = BMAX;

    // calcos: agujeros, sangre, quemaduras
    this.decals = [0, 1, 2].map((k) => {
      const tex = T.decals.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1 / 3, 1);
      tex.offset.set(k / 3, 0);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, 160);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return { mesh: m, next: 0, used: 0 };
    });

    // luces de destello reutilizables (cantidad fija para no recompilar shaders).
    // Una sola de verdad; las otras dos (cuando se pisan dos destellos, la
    // linterna de la intro) van con las de evento (World.adoptLight), con poco
    // peso: no le sacan su luz a un fuego de jefe
    this.flashes = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 12, 2);
      // (sin sombra de fuego, fx/Epic: salta de impacto en impacto y, tirando
      // sin parar al mismo lugar, pasaba por un fuego quieto; cada salto
      // rehacía lo quieto de su sombra, ~400 llamadas por cuadro)
      l.userData.noShadow = true;
      this.scene.add(l);
      if (i > 0) game.world?.adoptLight?.(l, 0.3);
      this.flashes.push({ light: l, life: 0, max: 1, peak: 0 });
    }

    // restos: cabezas que salen volando
    this.gibs = [];
    const gibGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const gibMat = new THREE.MeshStandardMaterial({ color: 0x7a7a68, map: T.grime, roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(gibGeo, gibMat);
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      this.gibs.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.gibNext = 0;
    this.shake = 0;
  }

  beamTexture() {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  resize(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.add.uniforms.uScale.value = s;
    this.alpha.uniforms.uScale.value = s;
  }

  // ---------------- emisores ----------------
  blood(p, dir, n = 10, big = 1) {
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 3 * big;
      this.alpha.spawn(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * 1.2) * s, (dir.y + Math.random() * 0.8) * s, (dir.z + (Math.random() - 0.5) * 1.2) * s, {
        color: [0.35 + Math.random() * 0.15, 0.01, 0.01],
        size: 0.04 + Math.random() * 0.06 * big,
        life: 0.5 + Math.random() * 0.5,
        gravity: 9,
        drag: 1,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.alpha.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6, {
        color: [0.3, 0.01, 0.01],
        size: 0.15 * big,
        size1: 0.5 * big,
        life: 0.5,
        alpha: 0.55,
        drag: 3,
      });
    }
  }

  sparks(p, n, dir, color = [1, 0.75, 0.35]) {
    for (let i = 0; i < 8 * n; i++) {
      const s = 2 + Math.random() * 5;
      this.add.spawn(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * 1.6) * s, (dir.y + (Math.random() - 0.3) * 1.6) * s, (dir.z + (Math.random() - 0.5) * 1.6) * s, {
        color,
        size: 0.03,
        size1: 0.01,
        life: 0.2 + Math.random() * 0.3,
        gravity: 9,
        bounce: 1,
      });
    }
  }

  dust(p, normal, color = [0.45, 0.4, 0.35], n = 5) {
    for (let i = 0; i < n; i++) {
      const s = 0.4 + Math.random() * 1.2;
      this.alpha.spawn(p.x, p.y, p.z, (normal.x + (Math.random() - 0.5)) * s, (normal.y + Math.random() * 0.6) * s, (normal.z + (Math.random() - 0.5)) * s, {
        color,
        size: 0.05,
        size1: 0.26,
        life: 0.5 + Math.random() * 0.4,
        alpha: 0.32,
        drag: 2.5,
        gravity: -0.3,
      });
    }
  }

  // Impacto contra pared/piso: polvo + chispitas + agujero.
  impact(hit) {
    // abajo del agua no hay polvo (el salpicón lo hace fx/Water)
    if (this.g.water?.under(hit.point)) return;
    const n = hit.normal;
    this.dust(hit.point, n, [0.2, 0.17, 0.14], 2);
    if (Math.random() < 0.5) this.sparks(hit.point, 0.4, n);
    // salpicón de agua/vapor del mate
    this.alpha.spawn(hit.point.x, hit.point.y, hit.point.z, n.x * 0.5, 0.4, n.z * 0.5, { color: [0.45, 0.47, 0.5], size: 0.04, size1: 0.18, life: 0.4, alpha: 0.18, drag: 2, gravity: -0.5 });
    this.decal(0, hit.point, n, 0.1 + Math.random() * 0.05);
  }

  // Chorro de agua hirviendo (Bombilla del Diablo): gotas a lo largo y vapor.
  waterJet(a, b, hot = false) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const n = Math.min(26, 6 + Math.floor(len * 1.6));
    const col = hot ? [1, 0.55, 0.45] : [0.8, 0.92, 1];
    for (let i = 0; i < n; i++) {
      const k = Math.random();
      this.add.spawn(a.x + dx * k + (Math.random() - 0.5) * 0.08, a.y + dy * k + (Math.random() - 0.5) * 0.08 - k * k * 0.25, a.z + dz * k + (Math.random() - 0.5) * 0.08, (dx / len) * 5, (dy / len) * 5, (dz / len) * 5, {
        color: col,
        size: 0.07 + k * 0.08,
        size1: 0.02,
        life: 0.22,
        gravity: 5,
        alpha: 0.7,
      });
    }
    for (let i = 0; i < 3; i++) {
      const k = 0.3 + Math.random() * 0.7;
      this.alpha.spawn(a.x + dx * k, a.y + dy * k, a.z + dz * k, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, { color: [0.75, 0.78, 0.8], size: 0.15, size1: 0.6, life: 0.9, alpha: 0.12, drag: 0.8 });
    }
    // salpicón al final
    this.add.spawn(b.x, b.y, b.z, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, { color: col, size: 0.1, size1: 0.02, life: 0.3, gravity: 6 });
  }

  steam(p, n = 3, spread = 0.3) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn(p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, {
        color: [0.5, 0.52, 0.55],
        size: 0.08,
        size1: 0.45,
        life: 1.1 + Math.random(),
        alpha: 0.16,
        drag: 0.8,
      });
    }
  }

  fire(p, spread = 0.6, n = 2) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread * 0.4, (Math.random() - 0.5) * 0.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.2, {
        color: [1, 0.45 + Math.random() * 0.25, 0.1],
        size: 0.35,
        size1: 0.05,
        life: 0.5 + Math.random() * 0.4,
        drag: 0.5,
      });
    }
    if (Math.random() < 0.15) this.add.spawn(p.x, p.y + 0.2, p.z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), { color: [1, 0.6, 0.2], size: 0.03, life: 1, gravity: 1 });
  }

  explosion(p, radius = 3, color = [1, 0.55, 0.2]) {
    const n = Math.floor(30 + radius * 12);
    for (let i = 0; i < n; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * radius * 2.5);
      this.add.spawn(p.x, p.y + 0.3, p.z, tmpV.x, tmpV.y, tmpV.z, {
        color,
        size: 0.5 + Math.random() * 0.6,
        size1: 0.1,
        life: 0.35 + Math.random() * 0.4,
        drag: 3,
      });
    }
    for (let i = 0; i < 18; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 2);
      this.alpha.spawn(p.x, p.y + 0.4, p.z, tmpV.x, tmpV.y + 0.5, tmpV.z, { color: [0.12, 0.11, 0.1], size: 0.6, size1: 2.4, life: 1.6 + Math.random(), alpha: 0.55, drag: 1.5, gravity: -0.4 });
    }
    this.sparks(p, 3, { x: 0, y: 1, z: 0 });
    this.flash(p, 0xff9040, 60 * Math.min(2, radius / 3), 0.35, 16);
    const fy = this.g.world?.levels ? this.g.world.floorAt(p.x, p.z, p.y) : 0;
    // en el agua: salpicón y sin quemadura en el fondo
    const wet = this.g.water?.blast(p, radius);
    if (!wet && (!this.g.world?.levels || p.y - fy < radius)) this.decal(2, { x: p.x, y: fy + 0.02, z: p.z }, { x: 0, y: 1, z: 0 }, radius * 0.9);
    this.addShake(0.4 * Math.min(2, radius / 3));
  }

  frost(p, n = 12) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + (Math.random() - 0.5) * 0.5, p.y + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, {
        color: [0.55, 0.85, 1],
        size: 0.08,
        size1: 0.02,
        life: 0.6 + Math.random() * 0.6,
        gravity: 1.5,
      });
    }
  }

  // Cono de escarcha que sale del tereré.
  frostCone(o, dir, range) {
    for (let i = 0; i < 70; i++) {
      const s = 4 + Math.random() * range;
      this.add.spawn(o.x, o.y, o.z, (dir.x + (Math.random() - 0.5) * 0.5) * s, (dir.y + (Math.random() - 0.5) * 0.4) * s, (dir.z + (Math.random() - 0.5) * 0.5) * s, {
        color: [0.6, 0.9, 1],
        size: 0.12,
        size1: 0.5,
        life: 0.5 + Math.random() * 0.3,
        alpha: 0.5,
        drag: 2.2,
      });
    }
  }

  blastCone(o, dir, range) {
    for (let i = 0; i < 90; i++) {
      const s = 6 + Math.random() * range * 1.5;
      this.alpha.spawn(o.x, o.y, o.z, (dir.x + (Math.random() - 0.5) * 0.9) * s, (dir.y + (Math.random() - 0.5) * 0.6) * s, (dir.z + (Math.random() - 0.5) * 0.9) * s, {
        color: [0.75, 0.78, 0.8],
        size: 0.2,
        size1: 1.4,
        life: 0.5 + Math.random() * 0.3,
        alpha: 0.35,
        drag: 3,
      });
    }
  }

  electric(p, n = 10) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 5, (Math.random() - 0.2) * 5, (Math.random() - 0.5) * 5, {
        color: [0.5, 0.75, 1],
        size: 0.05,
        size1: 0.01,
        life: 0.2 + Math.random() * 0.3,
        gravity: 3,
      });
    }
  }

  dirt(p, n = 16) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn(p.x + (Math.random() - 0.5) * 0.8, (p.y || 0) + 0.05, p.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 2, {
        color: [0.3, 0.14, 0.08],
        size: 0.06 + Math.random() * 0.08,
        life: 0.8 + Math.random() * 0.5,
        gravity: 9,
        bounce: 1,
      });
    }
    this.dust({ x: p.x, y: (p.y || 0) + 0.1, z: p.z }, { x: 0, y: 1, z: 0 }, [0.35, 0.18, 0.1], 6);
  }

  // (color: el de las almas de ese frasco; cada mapa tiene el suyo)
  soul(from, to, color = [1, 0.6, 0.25]) {
    for (let i = 0; i < 6; i++) {
      this.add.spawn(from.x, from.y + 1.2, from.z, (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3, {
        color,
        size: 0.18,
        size1: 0.08,
        life: 4,
        attract: to,
      });
    }
  }

  yerbaPuff(p) {
    for (let i = 0; i < 40; i++) {
      this.alpha.spawn(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * 1.7, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, {
        color: [0.35 + Math.random() * 0.2, 0.5 + Math.random() * 0.2, 0.15],
        size: 0.05,
        size1: 0.02,
        life: 1 + Math.random(),
        gravity: 4,
        bounce: 1,
      });
    }
    this.flash(p, 0xffd34a, 20, 0.3, 8);
  }

  sparkle(p, color = [1, 0.9, 0.4], n = 2, r = 0.5) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + (Math.random() - 0.5) * r, p.y + (Math.random() - 0.5) * r, p.z + (Math.random() - 0.5) * r, 0, 0.3 + Math.random() * 0.4, 0, { color, size: 0.06, size1: 0, life: 0.8 });
    }
  }

  // ---------------- haces ----------------
  beam(a, b, { color = 0xffffff, width = 0.03, life = 0.06, jitter = 0 } = {}) {
    if (this.beams.length >= this.BMAX) this.beams.shift();
    this.beams.push({ a: new THREE.Vector3().copy(a), b: new THREE.Vector3().copy(b), color: new THREE.Color(color), width, life, max: life, jitter });
  }

  tracer(a, b, color = 0xfff0c0) {
    this.beam(a, b, { color, width: 0.025, life: 0.05 });
  }

  // Rayo zigzagueante entre dos puntos (Wunder-Mate).
  lightning(a, b, color = 0x9ac8ff, life = 0.3) {
    const segs = 9;
    let prev = tmpA.copy(a);
    const dir = tmpB.subVectors(b, a);
    const len = dir.length();
    const pts = [];
    for (let i = 1; i <= segs; i++) {
      const p = new THREE.Vector3().copy(a).addScaledVector(dir, i / segs);
      if (i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * len * 0.08, (Math.random() - 0.5) * len * 0.08, (Math.random() - 0.5) * len * 0.08));
      pts.push(p);
    }
    prev = new THREE.Vector3().copy(a);
    for (const p of pts) {
      this.beam(prev, p, { color, width: 0.09, life });
      this.beam(prev, p, { color: 0xffffff, width: 0.025, life });
      prev = p;
    }
  }

  flash(p, color, intensity, life, dist = 12) {
    let f = this.flashes.find((x) => x.life <= 0) || this.flashes.reduce((a, b) => (a.life < b.life ? a : b));
    f.light.position.set(p.x, p.y + 0.3, p.z);
    f.light.color.set(color);
    f.light.distance = dist;
    f.peak = intensity;
    f.life = life;
    f.max = life;
  }

  decal(kind, p, n, size) {
    const D = this.decals[kind];
    const m = D.mesh;
    // en el piso, arriba de lo que tape el piso de la grilla (las tablas de un
    // muelle, una tarima): si no, de cerca el calco queda abajo y se ve de lejos nomás
    let py = p.y;
    if (n.y > 0.7) {
      const top = this.floorTop(p);
      if (top !== null && top > py) py = top;
    }
    tmpV.set(p.x + n.x * 0.005, py + n.y * 0.005, p.z + n.z * 0.005);
    tmpA.set(n.x, n.y, n.z);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpA);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2));
    tmpM.compose(tmpV, q, tmpB.set(size, size, size));
    m.setMatrixAt(D.next, tmpM);
    D.next = (D.next + 1) % 160;
    D.used = Math.min(160, D.used + 1);
    m.count = D.used;
    m.instanceMatrix.needsUpdate = true;
  }

  // Lo que puede quedar arriba del piso de la grilla (las tablas de un muelle,
  // una tarima): las mallas quietas y no tan grandes de la escena, con su caja.
  // Se arma la primera vez que hace falta y se rehace cada tanto y al cambiar
  // de mapa. (Las muy grandes, como el piso entero, son el piso de la grilla.)
  lowFlats() {
    const now = this.g.time || 0;
    const same = this.flats && this.flatsW === this.g.world && now >= this.flatsT;
    if (same && now - this.flatsT < 30) return this.flats;
    const root = this.g.scene;
    const add = (L) => (o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.material?.transparent || !o.geometry) return;
      const geo = o.geometry;
      const tris = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3;
      if (tris > 20000) return;
      L.push({ o, b: new THREE.Box3().setFromObject(o) });
    };
    // la vieja (pasaron 30 s): se rehace de a tajadas (fx/sliceWalk.js) y
    // mientras tanto sirve la de antes
    if (same && root) {
      const N = (this.flatsNext ||= []);
      if (!(this.flatsWalk ||= new SliceWalk()).step([root], add(N), FLATS_N)) return this.flats;
      this.flats = N;
      this.flatsNext = [];
      this.flatsT = now;
      this.tops = new Map();
      return N;
    }
    // la primera vez o en otro mapa: entera, ya
    this.flatsT = now;
    this.flatsW = this.g.world;
    this.tops = new Map();
    this.flatsWalk?.reset();
    this.flatsNext = [];
    const L = (this.flats = []);
    if (!root) return L;
    root.traverse(add(L));
    return L;
  }

  // La altura de lo que tapa el piso en (x, z), entre p.y y 25 cm arriba (null
  // si nada). Se guarda por pedacito de 25 cm (los props juntados por material
  // tienen miles de triángulos: el rayo cuesta, pero una vez por lugar).
  floorTop(p) {
    const L = this.lowFlats();
    const key = `${Math.floor(p.x * 4)},${Math.floor(p.z * 4)},${Math.round(p.y * 10)}`;
    if (this.tops.has(key)) return this.tops.get(key);
    // (cada rayo nuevo cuesta 5-7 ms en la torre: una explosión que mataba a 10
    // trababa el cuadro. Pocos por cuadro; los demás, en el piso de la grilla)
    if (!(this.topBudget > 0)) return null;
    this.topBudget--;
    let top = null;
    for (const { o, b } of L) {
      if (p.x < b.min.x || p.x > b.max.x || p.z < b.min.z || p.z > b.max.z || b.max.y < p.y - 0.02 || b.min.y > p.y + 0.25) continue;
      decalRay.set(tmpR.set(p.x, Math.min(b.max.y, p.y + 0.25) + 0.01, p.z), DOWN);
      decalRay.far = 0.3;
      for (const h of decalRay.intersectObject(o, false)) {
        if (h.point.y < p.y - 0.02) break;
        if (top === null || h.point.y > top) top = h.point.y;
        break;
      }
    }
    if (this.tops.size > 4000) this.tops.clear();
    this.tops.set(key, top);
    return top;
  }

  gib(p, vel) {
    const G = this.gibs[this.gibNext];
    this.gibNext = (this.gibNext + 1) % this.gibs.length;
    G.mesh.position.copy(p);
    G.floor = this.g.world?.levels ? Math.min(p.y, this.g.world.floorAt(p.x, p.z, p.y)) : 0;
    G.vel.copy(vel);
    G.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    G.life = 6;
    G.mesh.visible = true;
    G.mesh.scale.setScalar(1);
  }

  addShake(a) {
    this.shake = Math.min(1.2, this.shake + a);
  }

  clearAll() {
    this.add.count = 0;
    this.alpha.count = 0;
    this.beams.length = 0;
    for (const D of this.decals) {
      D.used = 0;
      D.next = 0;
      D.mesh.count = 0;
    }
    for (const G of this.gibs) G.mesh.visible = false;
  }

  update(dt, camera) {
    this.topBudget = 1;
    this.add.update(dt);
    this.alpha.update(dt);
    // haces
    const m = this.beamMesh;
    let n = 0;
    const camPos = camera.position;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const B = this.beams[i];
      B.life -= dt;
      if (B.life <= 0) {
        this.beams.splice(i, 1);
        continue;
      }
      const dir = tmpA.subVectors(B.b, B.a);
      const len = dir.length();
      dir.divideScalar(len || 1);
      const mid = tmpV.addVectors(B.a, B.b).multiplyScalar(0.5);
      const toCam = tmpB.subVectors(camPos, mid).normalize();
      const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
      const normal = new THREE.Vector3().crossVectors(side, dir);
      tmpM.makeBasis(dir.multiplyScalar(len), side.multiplyScalar(B.width), normal);
      tmpM.setPosition(mid);
      m.setMatrixAt(n, tmpM);
      const k = B.life / B.max;
      tmpC.copy(B.color).multiplyScalar(k);
      m.setColorAt(n, tmpC);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // destellos
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.light.intensity = Math.max(0, f.peak * (f.life / f.max));
      } else f.light.intensity = 0;
    }
    // restos
    for (const G of this.gibs) {
      if (G.life <= 0) continue;
      G.life -= dt;
      G.vel.y -= 9.8 * dt;
      G.mesh.position.addScaledVector(G.vel, dt);
      if (G.mesh.position.y < (G.floor || 0) + 0.1) {
        G.mesh.position.y = (G.floor || 0) + 0.1;
        G.vel.y *= -0.35;
        G.vel.x *= 0.7;
        G.vel.z *= 0.7;
        G.spin.multiplyScalar(0.7);
      }
      G.mesh.rotation.x += G.spin.x * dt;
      G.mesh.rotation.y += G.spin.y * dt;
      if (G.life < 1) G.mesh.scale.setScalar(Math.max(0.01, G.life));
      if (G.life <= 0) G.mesh.visible = false;
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    // la descarga de Electric Cherry (fx/cherryFx.js, solo donde está el perk)
    this.cherry?.update(dt, camera);
    // las matas del Maizaster (entities/maizaster.js, solo donde está el perk)
    this.maiz?.update(dt);
  }
}
