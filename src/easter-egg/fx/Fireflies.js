import * as THREE from 'three';

// Luciérnagas: lo que se puede agarrar (piezas del escudo, partes de algo,
// llaves...) no lleva un halo grande ni un haz: unos puntitos de luz le dan
// vueltas despacio y se prenden y apagan de a uno. Son sutiles: se ven si uno
// mira con atención.
// fireflies() devuelve un Object3D que reemplaza al sprite de brillo: se
// ubica, se esconde y se agrega igual, y material.opacity y material.color
// siguen andando (la intensidad y el color del enjambre). Todas las de una
// escena van en un solo THREE.Points: una llamada de dibujo.

const MAX = 256;
const tmp = new THREE.Vector3();

// ¿Se ve? (visible hasta la escena, y colgado de ella)
function shown(o, scene) {
  for (; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === scene) return true;
  }
  return false;
}

function bank(g) {
  const S = g.fireflyBank;
  if (S && S.scene === g.scene) return S;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: 0.085, map: g.textures.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  const B = { scene: g.scene, geo, pos, col, list: [], last: null };
  // se mueven justo antes de dibujarse (sin tocar el bucle del juego)
  pts.onBeforeRender = () => step(g, B);
  g.scene.add(pts);
  g.fireflyBank = B;
  return B;
}

function step(g, B) {
  const t = g.time || 0;
  if (t === B.last) return;
  B.last = t;
  const { pos, col } = B;
  let n = 0;
  for (const A of B.list) {
    if (n >= MAX) break;
    if (!shown(A, B.scene)) continue;
    A.getWorldPosition(tmp);
    // la opacidad del sprite que reemplaza hace de intensidad
    const k = Math.min(1.4, Math.max(0.45, A.material.opacity / 0.6));
    const c = A.material.color;
    for (let j = 0; j < A.count && n < MAX; j++, n++) {
      const s = A.seed + j * 1.73;
      const a = t * (0.3 + (j % 3) * 0.11) * (j % 2 ? 1 : -1) + s * 2.1;
      const r = A.r * (0.55 + 0.45 * Math.sin(t * 0.23 + s));
      pos[n * 3] = tmp.x + Math.cos(a) * r;
      pos[n * 3 + 1] = tmp.y + Math.sin(t * 0.47 + s * 1.3) * A.r * 0.55;
      pos[n * 3 + 2] = tmp.z + Math.sin(a) * r;
      // se prende suave y se apaga: cada una a su ritmo
      const on = Math.max(0, Math.sin(t * (0.8 + (j % 4) * 0.21) + s * 3.1));
      const b = on * on * on * k * 0.85;
      col[n * 3] = c.r * b;
      col[n * 3 + 1] = c.g * b;
      col[n * 3 + 2] = c.b * b;
    }
  }
  B.geo.setDrawRange(0, n);
  B.geo.attributes.position.needsUpdate = true;
  B.geo.attributes.color.needsUpdate = true;
}

// size: el tamaño del brillo que había (más grande, más luciérnagas y más lejos).
export function fireflies(g, color = 0xffe2a0, size = 1, opacity = 0.8) {
  const B = bank(g);
  const A = new THREE.Object3D();
  A.material = { opacity, color: new THREE.Color(color) };
  A.r = 0.16 + Math.min(2.5, size) * 0.14;
  A.count = size >= 2 ? 7 : size >= 1.2 ? 6 : 4;
  A.seed = Math.random() * 100;
  B.list.push(A);
  return A;
}
