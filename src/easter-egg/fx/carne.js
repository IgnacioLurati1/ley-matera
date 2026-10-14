import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// La carne que vuela (el usuario aprobó, 2026-10-12, "mejor sensación al
// matar"): los pedazos de la cabeza que revienta (core/sentirTiro.js) y lo que
// antes eran las esferas grises de Effects.gib (la cabeza que vuela de un tiro
// o del facón). Una sola malla instanciada (un dibujo para todos los pedazos),
// con forma de pedazo irregular y una textura de carne mojada hecha en un
// canvas: rojo oscuro, vetas, grasa y hueso. Chocan con las paredes, rebotan en
// el piso, quedan tirados y se achican antes de irse (nunca desaparecen de golpe).
// Sin sombra propia: a ese tamaño no se ve y es un dibujo menos por luz.

const MAX = 32;
// cuánto duran (s) y en cuánto se achican al final
const LIFE = 5;
const SHRINK = 0.6;
const GRAV = 9.8;

let shared = null;

// azar con semilla: la forma del pedazo y la textura salen siempre iguales
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// un pedazo: una esfera abollada (radio 1; cada pedazo se escala distinto)
function chunkGeo() {
  let geo = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const r = rng(7);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  // tres abolladuras grandes y ruido chico: que no se lea como una pelota
  const bumps = [0, 1, 2].map(() => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1 + (r() - 0.5) * 0.22;
    for (const b of bumps) k -= Math.max(0, v.dot(b) - 0.55) * 0.5;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function meatTex() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const r = rng(31);
  x.fillStyle = '#6a0d0e';
  x.fillRect(0, 0, S, S);
  // manchado: muchas manchas blandas de rojos distintos (que no se lea a rayas)
  const reds = ['#9a2222', '#b5302e', '#7a1416', '#c44a42', '#5a0c0c', '#8d1a1a'];
  for (let i = 0; i < 140; i++) {
    const px = r() * S;
    const py = r() * S;
    const rad = 4 + r() * 12;
    const gr = x.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, reds[Math.floor(r() * reds.length)]);
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    x.globalAlpha = 0.35 + r() * 0.3;
    x.fillStyle = gr;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  // fibras finas, casi todas para el mismo lado
  for (let i = 0; i < 60; i++) {
    const px = r() * S;
    const py = r() * S;
    const a = 0.3 + (r() - 0.5) * 0.5;
    const l = 8 + r() * 18;
    x.globalAlpha = 0.25 + r() * 0.25;
    x.strokeStyle = r() < 0.5 ? '#c04440' : '#3a0505';
    x.lineWidth = 0.6 + r() * 0.8;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  // unas vetas de grasa, finitas y alargadas
  for (let i = 0; i < 7; i++) {
    x.globalAlpha = 0.35 + r() * 0.25;
    x.fillStyle = '#d8b49a';
    x.beginPath();
    x.ellipse(r() * S, r() * S, 3 + r() * 6, 0.8 + r() * 1.2, 0.3 + (r() - 0.5) * 0.6, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export default class Carne {
  constructor(g) {
    this.g = g;
    // (la geometría y el material sirven para todos los mapas: se arman una vez)
    shared ||= {
      geo: chunkGeo(),
      // mojada pero no de plástico: medio áspera (el reflejo del ambiente le da el brillo)
      mat: new THREE.MeshStandardMaterial({ map: meatTex(), roughness: 0.55, metalness: 0 }),
    };
    const m = new THREE.InstancedMesh(shared.geo, shared.mat, MAX);
    m.count = 1;
    m.setMatrixAt(0, ZERO);
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    m.visible = false;
    g.scene.add(m);
    // (se compila en la carga con el resto de lo escondido: ui/Arrival warmWorld)
    if (g.world) (g.world.warmHidden ||= []).push(m);
    this.mesh = m;
    this.list = [];
    this.next = 0;
  }

  // Un pedazo desde p con velocidad vel. size: el radio en metros (la cabeza
  // entera que vuela, ~0,1; los pedazos de la que revienta, 0,03 a 0,07).
  // seed: la forma y el giro (sin seed, al azar).
  lanzar(p, vel, size = 0.1, seed = null) {
    const r = seed == null ? Math.random : rng(seed);
    let P = this.list.find((x) => x.life <= 0);
    if (!P) {
      if (this.list.length < MAX) this.list.push((P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), sc: new THREE.Vector3(), life: 0 }));
      else {
        // el más viejo deja su lugar
        P = this.list[this.next];
        this.next = (this.next + 1) % MAX;
      }
    }
    const w = this.g.world;
    P.pos.copy(p);
    P.vel.copy(vel);
    P.rot.set(r() * 6.3, r() * 6.3, r() * 6.3);
    P.spin.set((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14);
    P.sc.set(size * (0.8 + r() * 0.5), size * (0.6 + r() * 0.4), size * (0.8 + r() * 0.5));
    P.floor = w?.floorAt ? Math.min(p.y, w.floorAt(p.x, p.z, p.y + 0.2)) : 0;
    P.life = LIFE + r() * 1.5;
    P.drip = 0;
    P.rest = false;
    return true;
  }

  update(dt) {
    const L = this.list;
    const w = this.g.world;
    const fx = this.g.fx;
    let n = 0;
    for (const P of L) {
      if (P.life <= 0) continue;
      P.life -= dt;
      if (!P.rest) {
        P.vel.y -= GRAV * dt;
        P.pos.addScaledVector(P.vel, dt);
        // las paredes: lo empujan afuera y le frenan lo que iba de costado
        if (w?.collide) {
          V.copy(P.pos);
          w.collide(P.pos, P.sc.x, P.pos.y - P.sc.y, P.pos.y + P.sc.y);
          if (V.x !== P.pos.x || V.z !== P.pos.z) {
            P.vel.x *= -0.25;
            P.vel.z *= -0.25;
          }
        }
        const fy = P.floor + P.sc.y * 0.7;
        if (P.pos.y < fy) {
          P.pos.y = fy;
          // rebota poco (es blando) y se queda
          P.vel.y = Math.abs(P.vel.y) > 1.2 ? -P.vel.y * 0.22 : 0;
          P.vel.x *= 0.45;
          P.vel.z *= 0.45;
          P.spin.multiplyScalar(0.4);
          if (P.vel.y === 0 && Math.hypot(P.vel.x, P.vel.z) < 0.25) P.rest = true;
        }
        P.rot.x += P.spin.x * dt;
        P.rot.y += P.spin.y * dt;
        P.rot.z += P.spin.z * dt;
        // en el aire va soltando alguna gota
        P.drip -= dt;
        if (P.drip <= 0 && fx?.alpha && P.pos.y > fy + 0.05) {
          P.drip = 0.07;
          fx.alpha.spawn(P.pos.x, P.pos.y, P.pos.z, P.vel.x * 0.2, -0.3, P.vel.z * 0.2, { color: [0.32, 0.01, 0.01], size: 0.03, life: 0.45, gravity: 9, drag: 1 });
        }
      }
      const k = P.life < SHRINK ? Math.max(0.01, P.life / SHRINK) : 1;
      E.set(P.rot.x, P.rot.y, P.rot.z);
      Q.setFromEuler(E);
      M.compose(P.pos, Q, V.copy(P.sc).multiplyScalar(k));
      this.mesh.setMatrixAt(n++, M);
    }
    this.mesh.count = Math.max(1, n);
    if (!n) this.mesh.setMatrixAt(0, ZERO);
    this.mesh.visible = n > 0;
    if (n || this.was) this.mesh.instanceMatrix.needsUpdate = true;
    this.was = n > 0;
  }

  clear() {
    for (const P of this.list) P.life = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose?.();
  }
}
