import * as THREE from 'three';

// Los efectos de la descarga de Electric Cherry (weapons/electricCherry.js):
//  · rayos de verdad: quebrados por desplazamiento de puntos medios, con
//    ramas que se abren, núcleo blanco y halo azul, y que "re-golpean" (se
//    rearman varias veces en lo que duran, como un rayo real que titila);
//  · la onda eléctrica que se abre por el piso, con filamentos;
//  · los rayos que corren a ras del piso desde los pies;
//  · el chisporroteo que les queda encima a los que alcanzó (pequeños arcos
//    que saltan alrededor del cuerpo);
//  · al que recarga, un destello azul en los bordes de la pantalla.
// Todo en una malla de tiras (una llamada de dibujo) y un disco para la onda.
// Se arma una vez por partida (Interactables, donde hay la máquina) y se deja
// dibujado en cero para que el shader se compile en la carga.

const MAX = 1400;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpCol = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// el destello de la pantalla (uno solo, sirve para todas las partidas)
let flashEl = null;

// El perfil de la tira: el hilo blanco del medio y el halo azul que se apaga.
function arcTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(4, 64);
  for (let y = 0; y < 64; y++) {
    const d = Math.abs(y - 31.5) / 31.5;
    const core = Math.exp(-(d * d) / 0.006);
    const halo = Math.exp(-(d * d) / 0.12) * 0.55;
    const r = Math.min(255, (core * 1 + halo * 0.35) * 255);
    const gg = Math.min(255, (core * 1 + halo * 0.65) * 255);
    const b = Math.min(255, (core * 1 + halo * 1) * 255);
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RING_VS = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// La onda del piso: el frente brillante que se abre, los filamentos que salen
// del centro (ruido angular que corre para afuera) y todo se apaga al final.
const RING_FS = /* glsl */ `
  uniform float uT;
  uniform float uSeed;
  uniform float uK;
  varying vec2 vP;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float r = length(vP);
    if (r > 1.0 || uK <= 0.0) discard;
    float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
    float front = sqrt(uT);
    float fade = 1.0 - smoothstep(0.55, 1.0, uT);
    // el frente, quebrado
    float wob = (noise(vec2(a * 40.0 + uSeed, uT * 20.0)) - 0.5) * 0.06;
    float rim = exp(-pow((r - front - wob) / 0.022, 2.0));
    // los filamentos: vetas angulares finas que se mueven y se cortan
    float ang = a * 34.0 + uSeed;
    float n1 = noise(vec2(ang, r * 5.0 - uT * 14.0));
    float n2 = noise(vec2(ang * 2.3 + 7.0, r * 9.0 + uT * 9.0));
    float fil = pow(1.0 - abs(n1 - 0.5) * 2.0, 18.0) * smoothstep(0.4, 0.8, n2);
    float inside = step(r, front) * (0.35 + 0.65 * r / max(front, 0.01));
    // el resplandor tenue adentro
    float glow = exp(-r * r * 3.0) * 0.15 * (1.0 - uT);
    float v = (rim * 0.75 + fil * inside * 1.1 + glow) * fade * uK;
    vec3 col = mix(vec3(0.2, 0.5, 1.0), vec3(0.75, 0.9, 1.0), clamp(rim * 0.7 + fil * 0.4, 0.0, 1.0));
    // (suma: AdditiveBlending usa el alfa como factor)
    gl_FragColor = vec4(col * v, 1.0);
  }
`;

// Un rayo de a hasta b: desplazamiento de puntos medios (depth niveles) con
// ramas. Devuelve la lista de tramos [a, b, ancho, brillo].
function boltPath(a, b, { depth = 5, spread = 0.28, branch = 0.35, width = 0.16, bright = 1, flat = false }, out) {
  const pts = [a.clone(), b.clone()];
  let disp = a.distanceTo(b) * spread;
  for (let d = 0; d < depth; d++) {
    for (let i = pts.length - 1; i > 0; i--) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const mid = tmpA.addVectors(p0, p1).multiplyScalar(0.5);
      const dir = tmpB.subVectors(p1, p0).normalize();
      // un desvío perpendicular al tramo (a ras del piso: solo de costado)
      const perp = flat ? tmpC.crossVectors(dir, UP).normalize() : tmpC.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(dir).normalize();
      const off = (Math.random() - 0.5) * 2 * disp;
      pts.splice(i, 0, mid.clone().addScaledVector(perp, off));
    }
    disp *= 0.52;
  }
  for (let i = 1; i < pts.length; i++) {
    out.push([pts[i - 1], pts[i], width, bright]);
    // una rama: sale para un costado y se abre (más finita y más tenue)
    if (branch > 0 && i > 2 && i < pts.length - 3 && Math.random() < branch / pts.length * 6) {
      const from = pts[i];
      const rest = pts[pts.length - 1];
      const dir = tmpB.subVectors(rest, from);
      const len = dir.length() * (0.25 + Math.random() * 0.35);
      dir.normalize();
      const side = tmpC.set(Math.random() - 0.5, flat ? 0 : Math.random() - 0.3, Math.random() - 0.5).normalize();
      const end = from.clone().addScaledVector(dir.lerp(side, 0.55).normalize(), len);
      if (flat) end.y = from.y;
      boltPath(from, end, { depth: Math.max(2, depth - 2), spread: spread * 1.1, branch: 0, width: width * 0.55, bright: bright * 0.6, flat }, out);
    }
  }
  return out;
}

export default class CherryFx {
  constructor(g) {
    this.g = g;
    const mat = new THREE.MeshBasicMaterial({ map: arcTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    // (una tira invisible, así el shader se compila al cargar)
    this.mesh.setMatrixAt(0, tmpM.makeScale(0.001, 0.001, 0.001));
    this.mesh.count = 1;
    g.scene.add(this.mesh);
    // las ondas del piso (hasta tres a la vez)
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 }, uSeed: { value: 0 }, uK: { value: 0 } },
          vertexShader: RING_VS,
          fragmentShader: RING_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          fog: false,
        }),
      );
      // acostado en el piso (vP: la posición del plano, de -1 a 1)
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(0.001);
      m.frustumCulled = false;
      m.renderOrder = 6;
      g.scene.add(m);
      this.rings.push({ m, t: 1, dur: 0.5 });
    }
    // los rayos vivos: { from, to (o getter), life, max, every, next, opts, segs }
    this.bolts = [];
  }

  // Un rayo que dura `life` y se rearma cada `every` segundos. to: un punto o
  // una función que lo da (para seguir a un muerto que se mueve).
  bolt(from, to, life, opts = {}, every = 0.045) {
    const B = { from: from.clone(), to, life, max: life, every, next: 0, opts, segs: [] };
    this.bolts.push(B);
    return B;
  }

  // La onda del piso en `at`, de radio R, fuerza k.
  ring(at, R, k) {
    const r = this.rings.find((x) => x.t >= 1) || this.rings.reduce((a, b) => (a.t > b.t ? a : b));
    r.t = 0;
    r.dur = 0.5 + 0.15 * k;
    r.m.position.set(at.x, at.y + 0.06, at.z);
    r.m.scale.setScalar(R);
    r.m.material.uniforms.uSeed.value = Math.random() * 100;
    r.m.material.uniforms.uK.value = 0.45 + 0.45 * k;
  }

  // El destello azul en los bordes de la pantalla (solo al que recarga).
  screenFlash(k) {
    // (adentro del contenedor del juego, arriba del lienzo y abajo del HUD)
    const host = this.g.renderer?.domElement?.parentElement || document.body;
    if (!flashEl || flashEl.parentElement !== host) {
      flashEl?.remove();
      flashEl = document.createElement('div');
      flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;opacity:0;background:radial-gradient(ellipse at center, rgba(120,190,255,0) 58%, rgba(90,170,255,0.35) 88%, rgba(150,210,255,0.6) 100%)';
      host.appendChild(flashEl);
    }
    const el = flashEl;
    el.style.transition = 'none';
    el.style.opacity = String(0.3 + 0.35 * k);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.45s ease-out';
      el.style.opacity = '0';
    });
  }

  update(dt, camera) {
    for (const r of this.rings) {
      if (r.t >= 1) {
        r.m.material.uniforms.uK.value = 0;
        continue;
      }
      r.t = Math.min(1, r.t + dt / r.dur);
      r.m.material.uniforms.uT.value = r.t;
      if (r.t >= 1) r.m.scale.setScalar(0.001);
    }
    const m = this.mesh;
    let n = 0;
    const cam = camera.position;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const B = this.bolts[i];
      B.life -= dt;
      if (B.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      B.next -= dt;
      if (B.next <= 0) {
        B.next = B.every * (0.7 + Math.random() * 0.6);
        const to = typeof B.to === 'function' ? B.to() : B.to;
        if (!to) {
          B.life = 0;
          continue;
        }
        B.segs.length = 0;
        boltPath(B.from, to, B.opts, B.segs);
        // un titileo: cada golpe con otro brillo
        B.flick = 0.55 + Math.random() * 0.7;
      }
      const k = Math.min(1, (B.life / B.max) * 1.6) * B.flick;
      for (const [a, b, w, br] of B.segs) {
        if (n >= MAX) break;
        const dir = tmpA.subVectors(b, a);
        const len = dir.length();
        if (len < 1e-4) continue;
        dir.divideScalar(len);
        const mid = tmpB.addVectors(a, b).multiplyScalar(0.5);
        const toCam = tmpC.subVectors(cam, mid).normalize();
        const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
        const normal = new THREE.Vector3().crossVectors(side, dir);
        // (un poco más largo que el tramo, así las uniones no se ven cortadas)
        tmpM.makeBasis(dir.multiplyScalar(len + w * 0.3), side.multiplyScalar(w), normal);
        tmpM.setPosition(mid);
        m.setMatrixAt(n, tmpM);
        m.setColorAt(n, tmpCol.setScalar(k * br));
        n++;
      }
    }
    if (!n) {
      m.setMatrixAt(0, tmpM.makeScale(0.001, 0.001, 0.001));
      m.setColorAt(0, tmpCol.setScalar(0));
      n = 1;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
    for (const r of this.rings) {
      r.m.geometry.dispose();
      r.m.material.dispose();
    }
  }
}

// La de esta partida (se arma la primera vez; Interactables la arma al cargar
// donde está la máquina, así no traba al primer uso).
export function cherryFx(g) {
  if (!g.fx) return null;
  if (!g.fx.cherry || g.fx.cherry.g !== g || !g.fx.cherry.mesh.parent) g.fx.cherry = new CherryFx(g);
  return g.fx.cherry;
}
