import * as THREE from 'three';
import { bladeEdge } from './desgarradorModels';

// v4: la presencia del Desgarrador del Eclipse (up = 1), siempre, no solo en
// la Furia (pedido del usuario: "la mejora es flojita, parece la guadaña con
// furia y ya está"; "el poder de la disformidad y la ruptura"):
//  · VoidBleed: la hoja sangra vacío. Gotas de negro con estrellas que se
//    sueltan del filo en la escena de la mano y quedan donde salieron: al
//    mover la guadaña dejan la estela negra.
//  · OrbitShards: esquirlas de eclipse que flotan y giran alrededor del que la
//    tiene (el propio y los compañeros; en el mundo).
// Todo armado en la carga (Desgarrador.wake) y escondido; sin luces.

const rnd = () => Math.random() - 0.5;
const _v = new THREE.Vector3();

// ---------------- la hoja que sangra vacío ----------------
const BLEED_N = 120;
const BLEED_VS = `
attribute float aAge; attribute float aSeed;
uniform float uScale;
varying float vAge; varying float vSeed;
void main(){
  vAge = aAge; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float star = step(0.7, aSeed);
  // (las gotas crecen al soltarse y se deshacen; las estrellas, chiquitas)
  float sz = mix(0.014 + 0.034 * aAge, 0.008, star) * (aAge < 0.0 ? 0.0 : 1.0);
  gl_PointSize = sz * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const BLEED_FS = `
varying float vAge; varying float vSeed;
void main(){
  if (vAge < 0.0 || vAge > 1.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float star = step(0.7, vSeed);
  float soft = 1.0 - smoothstep(0.55, 1.0, r);
  float life = (1.0 - vAge) * smoothstep(0.0, 0.08, vAge);
  // el vacío: negro con el borde violeta encendido (contra el cielo oscuro el
  // negro solo no se veía); las estrellas: oro y blanco
  vec3 voidC = mix(vec3(0.0, 0.0, 0.01), vec3(0.85, 0.35, 1.4), smoothstep(0.45, 0.85, r));
  vec3 starC = mix(vec3(1.4, 1.1, 0.6), vec3(1.3, 1.25, 1.4), fract(vSeed * 13.0));
  vec3 col = mix(voidC, starC, star);
  float a = mix(soft * 0.85, (1.0 - smoothstep(0.0, 1.0, r)), star) * life;
  gl_FragColor = vec4(col, a);
}`;
export class VoidBleed {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(BLEED_N * 3);
    this.age = new Float32Array(BLEED_N).fill(-1);
    this.seed = new Float32Array(BLEED_N);
    for (let i = 0; i < BLEED_N; i++) this.seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: BLEED_VS, fragmentShader: BLEED_FS, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new THREE.Points(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.vel = new Float32Array(BLEED_N * 3);
    this.life = new Float32Array(BLEED_N).fill(1);
    this.next = 0;
    this.acc = 0;
    this.live = 0;
  }

  // Para la carga (Weapons.warmFx): una copia a la vista con una gota.
  warmMesh() {
    const m = new THREE.Points(this.mesh.geometry, this.mat);
    m.frustumCulled = false;
    return m;
  }

  // m: la guadaña de la mano (Desgarrador: w.model.cosmic); on: la del Eclipse
  // en la mano y a la vista; rate: gotas por segundo; scale: el alto de la
  // pantalla en píxeles sobre 2·tan(fov/2) de la cámara de la mano.
  update(dt, m, on, rate, scale) {
    this.mat.uniforms.uScale.value = scale;
    if (on && m?.scy) {
      this.acc += dt * rate;
      m.scy.updateWorldMatrix(true, false);
      while (this.acc >= 1) {
        this.acc -= 1;
        const i = this.next;
        this.next = (this.next + 1) % BLEED_N;
        // del filo (más de la punta) o del lomo
        const u = 0.12 + Math.pow(Math.random(), 0.7) * 0.88;
        bladeEdge(u, _v, Math.random() < 0.7 ? 0.45 : 0.1, 1).applyMatrix4(m.scy.matrixWorld);
        this.pos[i * 3] = _v.x;
        this.pos[i * 3 + 1] = _v.y;
        this.pos[i * 3 + 2] = _v.z;
        // (gotean: caen un poco y se abren)
        this.vel[i * 3] = rnd() * 0.05;
        this.vel[i * 3 + 1] = -0.03 - Math.random() * 0.05;
        this.vel[i * 3 + 2] = rnd() * 0.05;
        this.age[i] = 0;
        this.life[i] = 0.45 + Math.random() * 0.5;
      }
    } else this.acc = 0;
    let live = 0;
    for (let i = 0; i < BLEED_N; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt / this.life[i];
      if (this.age[i] > 1) {
        this.age[i] = -1;
        continue;
      }
      live++;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.live = live;
    this.mesh.visible = live > 0;
    const G = this.mesh.geometry;
    G.attributes.position.needsUpdate = true;
    G.attributes.aAge.needsUpdate = true;
  }

  clear() {
    this.age.fill(-1);
    this.mesh.geometry.attributes.aAge.needsUpdate = true;
    this.mesh.visible = false;
    this.live = 0;
  }
}

// ---------------- las esquirlas que orbitan al jugador ----------------
const PER = 9;
const SLOTS = 4;
function shardGeo() {
  // una esquirla: un octaedro estirado y torcido, oro en las puntas, violeta en el medio
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(0.35, 1, 0.22);
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const tip = Math.abs(P.getY(i)) > 0.9;
    col.set(tip ? [1.5, 1.05, 0.45] : [0.45, 0.12, 0.9], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export class OrbitShards {
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(shardGeo(), this.mat, PER * SLOTS);
    this.mesh.frustumCulled = false;
    this.mesh.userData.reflect = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.k = new Float32Array(SLOTS);
    this.o = new THREE.Object3D();
    this.ph = Array.from({ length: PER }, (_, i) => ({ a: (i / PER) * Math.PI * 2, h: 0.35 + ((i * 0.37) % 1) * 1.55, r: 0.95 + ((i * 0.53) % 1) * 0.45, s: 0.035 + ((i * 0.71) % 1) * 0.03, w: 0.5 + ((i * 0.29) % 1) * 0.5 }));
  }

  // list: [{ pos (los pies), on }] hasta SLOTS (el primero, el propio)
  update(dt, time, list) {
    let n = 0;
    const o = this.o;
    for (let s = 0; s < SLOTS; s++) {
      const it = list[s];
      this.k[s] = Math.max(0, Math.min(1, this.k[s] + (it?.on ? dt * 1.5 : -dt * 3)));
      const k = this.k[s];
      if (k <= 0 || !it?.pos) continue;
      for (let i = 0; i < PER; i++) {
        const P = this.ph[i];
        const a = P.a + time * P.w * (i % 2 ? 1 : -1) * 0.7;
        const r = P.r * (0.6 + 0.4 * k);
        o.position.set(it.pos.x + Math.cos(a) * r, it.pos.y + P.h + Math.sin(time * 1.3 + i) * 0.08, it.pos.z + Math.sin(a) * r);
        o.rotation.set(time * (1 + P.w), a, time * 0.7 + i);
        o.scale.setScalar(P.s * k);
        o.updateMatrix();
        this.mesh.setMatrixAt(n++, o.matrix);
      }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Para la carga: una a la vista.
  // (instanciada, como la de verdad: es otro programa)
  warmMesh() {
    const m = new THREE.InstancedMesh(this.mesh.geometry, this.mat, 1);
    m.setMatrixAt(0, new THREE.Matrix4());
    m.frustumCulled = false;
    return m;
  }
}
