import * as THREE from 'three';

// Lo que solo se ve desde el gaucho life (el penal): el mate del alma en la
// mano, las calaveras de la Bombilla Gut y los rastros de los presos muertos.
// Un resplandor azul de ánima, más fuerte en el borde (fresnel), con franjas
// que suben, un parpadeo y un temblor. Es aditivo: no tapa nada, no tira
// sombra y no va al G-buffer de Épica (es un ShaderMaterial).
//
// Para que prenderlo no trabe: los objetos quedan siempre "a la vista" para
// three y con uOn en 0 el vértice sale de la pantalla (no pinta nada). Así el
// shader se compila con el mapa y el alma solo mueve un número. Todos los
// materiales de acá comparten el mismo programa (mismo código).

// el reloj de todos (lo mueve GauchoLife cada cuadro)
export const GHOST_TIME = { value: 0 };

const VERT = /* glsl */ `
uniform float uOn, uTime, uWave;
varying vec3 vN, vV;
varying vec2 vUv;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // el temblor de ánima: se ondula de a poco
  wp.x += sin(wp.y * 3.1 + uTime * 1.7) * uWave;
  wp.z += cos(wp.y * 2.7 + uTime * 1.3) * uWave;
  vY = wp.y;
  vUv = uv;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
  // apagado: fuera de la pantalla (del otro lado del plano lejano)
  if (uOn < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

// (divisiones con piso: en la placa del usuario isnan no anda y un NaN acá
// se desparrama por todo el postproceso)
const FRAG = /* glsl */ `
uniform float uOn, uTime, uBase, uRim, uFar, uDecal, uMarks;
uniform vec3 uColor, uRimColor;
uniform sampler2D map;
varying vec3 vN, vV;
varying vec2 vUv;
varying float vY;
void main() {
  float d = length(vV);
  vec3 v = vV / max(d, 1e-4);
  vec3 n = vN / max(length(vN), 1e-4);
  float fr = 1.0 - abs(dot(n, v));
  fr *= fr;
  float band = 0.5 + 0.5 * sin(vY * 9.0 - uTime * 2.2);
  float flick = 0.86 + 0.14 * sin(uTime * 13.0 + vY * 2.0) * sin(uTime * 7.3);
  float far = 1.0 - smoothstep(uFar * 0.6, uFar, d);
  vec3 col = uColor * uBase * (0.55 + 0.45 * band) + uRimColor * (fr * uRim);
  // los dibujos (letras, manos, pisadas): la forma sale de la textura
  if (uDecal > 0.5) {
    float a = texture2D(map, vUv).r;
    col = (uColor * uBase * (0.7 + 0.3 * band) + uRimColor * a * 0.35) * a;
  }
  // (aditivo: el alfa escala lo que suma; la calavera va con mezcla normal:
  // hueso translúcido y las cuencas oscuras, marcadas con uv.x = 2)
  float body = 1.0;
  if (uMarks > 0.5) {
    if (vUv.x > 1.5) {
      col = vec3(0.0);
      body = 0.9;
    } else body = clamp(0.4 + fr * 0.55, 0.0, 1.0);
  }
  gl_FragColor = vec4(max(col, vec3(0.0)) * flick, far * uOn * body);
}`;

let BLANK = null;
function blank() {
  if (!BLANK) {
    BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    BLANK.needsUpdate = true;
  }
  return BLANK;
}

// on: un { value } compartido (todo lo del mapa se prende junto) o un número.
export function ghostMaterial({ color = 0x3a8cff, rim = 0xcff0ff, base = 0.2, rimK = 1.5, far = 60, wave = 0.012, on = 0, map = null, side = THREE.FrontSide, marks = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOn: typeof on === 'object' ? on : { value: on },
      uTime: GHOST_TIME,
      uWave: { value: wave },
      uBase: { value: base },
      uRim: { value: rimK },
      uFar: { value: far },
      uDecal: { value: map ? 1 : 0 },
      uMarks: { value: marks ? 1 : 0 },
      uColor: { value: new THREE.Color(color) },
      uRimColor: { value: new THREE.Color(rim) },
      map: { value: map || blank() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: marks,
    blending: marks ? THREE.NormalBlending : THREE.AdditiveBlending,
    side,
  });
}

// Compila ya (en segundo plano si se puede) lo de un objeto, con las luces de
// la escena donde va a vivir: lo escondido también (three recorre todo).
// Contra el buffer del postproceso, como las cinemáticas (ui/cineWarm.js).
export function warmObject(g, obj, scene = g.scene, camera = g.camera) {
  const R = g.renderer;
  if (!R?.compile || !obj) return;
  const prev = R.getRenderTarget();
  R.setRenderTarget(g.post?.composer?.renderTarget1 || prev);
  try {
    if (R.compileAsync) R.compileAsync(obj, camera, scene).catch(() => {});
    else R.compile(obj, camera, scene);
  } catch {
    /* si falla, se compila la primera vez que se ve */
  } finally {
    R.setRenderTarget(prev);
  }
}
