import * as THREE from 'three';

// Las almas del penal que se ven con los ojos de siempre (la Cárcel de las
// Almas y el Cerro del Espinillo): el cuerpo de un ánima, con la cabeza, los
// hombros y un torso que se afina en una cola de humo, y el material que brilla
// en el borde (fresnel), con franjas que suben, un parpadeo y la cola que se
// mece. Se dibujan de a muchas (InstancedMesh): el brillo de cada una va en su
// color de instancia (setColorAt con un gris: 0 apagada, 1 normal, más es más).
// Aditivo: no tapa nada, no tira sombra y no va al G-buffer de Épica (es un
// ShaderMaterial). Lo pidió el usuario el 2026-09-29 (las de antes eran unos
// maniquíes con pollera de cono).

const VERT = /* glsl */ `
uniform float uTime, uTail;
varying vec3 vN, vV;
varying float vLY, vPh, vGlow;
void main() {
  vec3 p = position;
#ifdef USE_INSTANCING
  mat4 im = instanceMatrix;
#else
  mat4 im = mat4(1.0);
#endif
  // (cada una con su fase: sale de dónde está)
  float ph = im[3].x * 1.7 + im[3].z * 2.3;
  // la cola se mece, más cuanto más abajo
  float k = clamp(1.0 - p.y / max(uTail, 0.01), 0.0, 1.0);
  k *= k;
  p.x += sin(uTime * 2.6 + ph + p.y * 5.0) * 0.13 * k;
  p.z += cos(uTime * 2.1 + ph + p.y * 4.0) * 0.09 * k;
  // y los brazos flotan apenas
  p.y += sin(uTime * 1.9 + ph + p.x * 6.0) * 0.012;
  vec4 wp = modelMatrix * im * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * normal;
  vLY = position.y;
  vPh = ph;
#ifdef USE_INSTANCING_COLOR
  vGlow = instanceColor.r;
#else
  vGlow = 1.0;
#endif
  gl_Position = projectionMatrix * mv;
}`;

// (divisiones con piso: en la placa del usuario isnan no anda y un NaN acá
// se desparrama por todo el postproceso)
const FRAG = /* glsl */ `
uniform float uTime, uTop, uTail;
uniform vec3 uColor, uRim;
varying vec3 vN, vV;
varying float vLY, vPh, vGlow;
void main() {
  vec3 v = vV / max(length(vV), 1e-4);
  vec3 n = vN / max(length(vN), 1e-4);
  float fr = 1.0 - abs(dot(n, v));
  fr *= fr;
  float h = clamp(vLY / max(uTop, 0.01), 0.0, 1.0);
  // las franjas que suben y unas vetas finas en la cola
  float band = 0.5 + 0.5 * sin(vLY * 10.0 - uTime * 2.4 + vPh);
  float vein = 0.5 + 0.5 * sin(vLY * 27.0 + uTime * 3.3 + vPh * 2.0);
  float tail = clamp(1.0 - vLY / max(uTail, 0.01), 0.0, 1.0);
  // la punta de la cola se deshace
  float fade = smoothstep(-0.02, 0.4, h) * (1.0 - tail * 0.45 * vein);
  float flick = 0.88 + 0.12 * sin(uTime * 11.0 + vPh) * sin(uTime * 6.3 + vLY * 2.0);
  vec3 col = uColor * (0.15 + 0.18 * band) + uRim * (fr * 1.1);
  // la cara y los hombros, más prendidos
  col += uRim * 0.3 * smoothstep(0.78, 1.0, h);
  gl_FragColor = vec4(max(col, vec3(0.0)), clamp(fade * flick * vGlow, 0.0, 4.0));
}`;

// top: la altura de la cabeza (local); tail: hasta dónde llega la cola
export function soulMaterial({ top = 1.78, tail = 0.95, color = 0x5ab0ff, rim = 0xc8ecff } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: SOUL_TIME,
      uTop: { value: top },
      uTail: { value: tail },
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// el reloj de todas (lo mueve quien las tiene, cada cuadro)
export const SOUL_TIME = { value: 0 };

// Un tubo que se afina: pasa por pts (Vector3) con el radio rad(u), u de 0 a 1.
function taper(pts, rad, { seg = 20, radial = 12 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [];
  const nrm = [];
  const idx = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let j = 0; j <= seg; j++) {
    const u = j / seg;
    curve.getPointAt(u, P);
    const r = rad(u);
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      N.copy(fr.normals[j]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[j], Math.sin(a)).normalize();
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nrm.push(N.x, N.y, N.z);
    }
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// curva de radio por tramos (u, r): lineal entre puntos
const prof = (list) => (u) => {
  for (let i = 1; i < list.length; i++) {
    if (u <= list[i][0]) {
      const [u0, r0] = list[i - 1];
      const [u1, r1] = list[i];
      const k = (u - u0) / Math.max(1e-5, u1 - u0);
      return r0 + (r1 - r0) * k * k * (3 - 2 * k);
    }
  }
  return list[list.length - 1][1];
};

function sphere(r, x, y, z) {
  const g = new THREE.SphereGeometry(r, 14, 10).toNonIndexed();
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return g;
}

function merge(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

// El cuerpo de un ánima (mira hacia +z):
//  'stand': parada, flotando, con las manos para adelante y arriba (a los
//   barrotes de su celda, o a lo que agarra); la cabeza a 1,63.
//  'kneel': de rodillas, agachada, con las muñecas juntas adelante (0, 0,72,
//   0,36: ahí la ata la cadena del cerro); la cabeza a 1,24.
export function soulGeometry(kind = 'stand') {
  const parts = [];
  if (kind === 'kneel') {
    parts.push(sphere(0.12, 0, 1.24, 0.07));
    parts.push(
      taper(
        [V(0, 1.14, 0.05), V(0, 0.98, 0.03), V(0, 0.7, -0.02), V(0, 0.4, 0), V(0, 0.16, -0.2), V(0.02, 0.06, -0.52)],
        prof([[0, 0.08], [0.12, 0.18], [0.35, 0.17], [0.55, 0.2], [0.78, 0.1], [1, 0.005]]),
        { seg: 24 },
      ),
    );
    for (const s of [-1, 1]) {
      parts.push(taper([V(s * 0.15, 1.03, 0.02), V(s * 0.13, 0.86, 0.18), V(s * 0.05, 0.73, 0.35)], prof([[0, 0.05], [1, 0.032]]), { seg: 8, radial: 8 }));
      parts.push(sphere(0.042, s * 0.045, 0.72, 0.37));
    }
  } else {
    parts.push(sphere(0.135, 0, 1.63, 0.03));
    parts.push(
      taper(
        [V(0, 1.52, 0.02), V(0, 1.3, 0.01), V(0, 0.98, -0.02), V(0, 0.62, -0.05), V(0.02, 0.28, -0.12), V(0.05, -0.08, -0.24)],
        prof([[0, 0.09], [0.12, 0.21], [0.3, 0.19], [0.55, 0.15], [0.8, 0.08], [1, 0.005]]),
        { seg: 24 },
      ),
    );
    for (const s of [-1, 1]) {
      parts.push(taper([V(s * 0.19, 1.4, 0.0), V(s * 0.2, 1.43, 0.2), V(s * 0.15, 1.5, 0.42)], prof([[0, 0.055], [1, 0.033]]), { seg: 8, radial: 8 }));
      parts.push(sphere(0.045, s * 0.15, 1.51, 0.44));
    }
  }
  return merge(parts);
}
