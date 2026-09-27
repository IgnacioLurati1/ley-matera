import * as THREE from 'three';

// Haces de luz por las ventanas: un volumen de verdad, no planos cruzados (de
// costado se veían los rectángulos encimados). Cada haz es la caja que barre la
// abertura siguiendo el rayo de luz (la abertura corrida por la dirección: un
// paralelepípedo). En el fragment se recorre el tramo de la vista que queda
// adentro (10 pasos) y se suma la niebla iluminada: los bordes se esfuman más
// lejos de la ventana, cada tabla clavada deja su sombra y el piso la corta.
// Donde toca el piso queda el charco de luz, con las mismas rayas de las
// tablas, y adentro flotan motas de polvo que solo brillan donde hay luz.
// Cuando los zombies arrancan una tabla entra más luz.
//
// Todo pasa en las coordenadas de la caja: x e y en la abertura (-0,5..0,5),
// z a lo largo del rayo (0 en la ventana, 1 donde el borde de arriba llega al piso).
// Sirve también para los vitrales (su color) y los rosetones (abertura redonda,
// con los rayos de piedra como tablas fijas): los del castillo, en castleRooms.

// pasos por pixel según la calidad (en Rendimiento no se dibuja: fx/Ambience)
const STEPS = { perf: 4, low: 4, medium: 6, high: 8, ultra: 10, epic: 10 };
const MOTES = 48;
const MAXB = 6;

// Las tablas y la abertura, en metros sobre el plano de la ventana.
const COMMON = /* glsl */ `
uniform vec4 uBoards[${MAXB}];
uniform vec2 uSize;
uniform float uRound;
// tope suave: lo tenue queda igual y lo fuerte se aplana antes de 0,55, así ni
// parado adentro del haz ni con un relámpago encandila
vec3 shaftCap(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  float t = m < 0.25 ? m : 0.25 + 0.3 * (1.0 - exp((0.25 - m) / 0.3));
  return c * (t / max(m, 1e-4));
}
float shaftLight(vec3 l) {
  // la penumbra crece lejos de la ventana
  float pen = 0.015 + 0.09 * clamp(l.z, 0.0, 1.0);
  vec2 q = l.xy * uSize;
  vec2 e = uSize * 0.5 - abs(q);
  float k = smoothstep(-pen, pen, e.x) * smoothstep(-pen, pen, e.y);
  if (uRound > 0.5) k = smoothstep(-pen, pen, uSize.x * 0.5 - length(q));
  for (int i = 0; i < ${MAXB}; i++) {
    vec4 b = uBoards[i];
    float d = abs(-q.x * b.y + (q.y - b.x) * b.z);
    k *= 1.0 - b.w * (1.0 - smoothstep(0.085 - pen, 0.085 + pen, d));
  }
  return k;
}
`;

const beamVert = /* glsl */ `
varying vec3 vL;
void main() {
  vL = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const beamFrag = /* glsl */ `
uniform mat4 uInv;
uniform mat4 uBox;
uniform vec3 uColor;
uniform vec4 uTint;
uniform float uK;
uniform float uTime;
uniform float uFloor;
uniform float uDens;
varying vec3 vL;
${COMMON}
void main() {
  // la vista, en coordenadas de la caja (sin componentes en cero: nada de inf/NaN)
  vec3 ro = (uInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = vL - ro;
  rd += step(abs(rd), vec3(1e-6)) * 1e-6;
  vec3 inv = 1.0 / rd;
  vec3 a = (vec3(-0.5, -0.5, 0.0) - ro) * inv;
  vec3 b = (vec3(0.5, 0.5, 1.0) - ro) * inv;
  vec3 tn = min(a, b);
  vec3 tf = max(a, b);
  float s0 = max(max(tn.x, tn.y), max(tn.z, 0.0));
  float s1 = min(min(tf.x, tf.y), tf.z);
  if (s1 <= s0) discard;
  vec3 l0 = ro + rd * s0;
  vec3 l1 = ro + rd * s1;
  vec3 w0 = (uBox * vec4(l0, 1.0)).xyz;
  vec3 w1 = (uBox * vec4(l1, 1.0)).xyz;
  float len = distance(w0, w1);
  // los pasos, corridos distinto en cada pixel (sin bandas)
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float acc = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float f = (float(i) + j) / float(STEPS);
    vec3 l = mix(l0, l1, f);
    vec3 wp = mix(w0, w1, f);
    // entra fuerte, se va apagando y el piso lo corta. Sin la profundidad de la
    // escena la niebla se suma también adentro de lo que está en el haz (los
    // bancos brillaban como cajas de color): se esfuma en el metro de abajo,
    // donde están los muebles (el charco ya marca dónde pega), y pegado a la
    // cámara (parado adentro no lava toda la pantalla)
    float along = smoothstep(0.0, 0.05, l.z) * (1.0 - 0.55 * l.z) * smoothstep(uFloor, uFloor + 1.1, wp.y) * smoothstep(0.2, 1.6, distance(wp, cameraPosition));
    // la niebla no es pareja: jirones que se mueven despacio
    float wisp = 0.72 + 0.28 * sin(wp.x * 2.1 + wp.y * 1.3 - uTime * 0.35) * sin(wp.z * 1.7 - wp.y * 2.2 + uTime * 0.27);
    acc += shaftLight(l) * along * wisp;
  }
  vec3 col = mix(uColor, uTint.rgb, uTint.a) * uK * uDens * (acc / float(STEPS)) * min(len, 4.0);
  gl_FragColor = vec4(shaftCap(max(col, 0.0)), 1.0);
}`;

// el charco en el piso: el punto se lleva a la caja y se mira la misma luz
const poolVert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const poolFrag = /* glsl */ `
uniform mat4 uInv;
uniform vec3 uColor;
uniform vec4 uTint;
uniform float uK;
uniform float uPool;
varying vec3 vW;
${COMMON}
void main() {
  vec3 l = (uInv * vec4(vW, 1.0)).xyz;
  float k = shaftLight(l) * smoothstep(0.0, 0.05, l.z) * (1.0 - 0.45 * clamp(l.z, 0.0, 1.0));
  gl_FragColor = vec4(shaftCap(max(mix(uColor, uTint.rgb, uTint.a) * uK * uPool * k, 0.0)), 1.0);
}`;

// las motas: cada una tiene su lugar en la caja y deriva despacio (dando la vuelta)
const moteVert = /* glsl */ `
uniform mat4 uBox;
uniform float uTime;
uniform float uFloor;
attribute vec4 seed;
varying float vB;
${COMMON}
void main() {
  vec3 l = seed.xyz;
  l.xy = fract(l.xy + vec2(sin(uTime * 0.05 + seed.w * 6.28), cos(uTime * 0.04 + seed.w * 4.1)) * 0.25 + uTime * vec2(0.004, -0.012)) - 0.5;
  l.z = fract(l.z + uTime * 0.006 * (0.5 + seed.w));
  vec4 wp = uBox * vec4(l, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vB = shaftLight(l) * smoothstep(uFloor + 0.05, uFloor + 0.25, wp.y) * (1.0 - l.z * 0.6) * (0.5 + 0.5 * sin(uTime * (0.7 + seed.w) + seed.w * 40.0));
  gl_PointSize = clamp(26.0 * (0.5 + seed.w) / max(-mv.z, 0.1), 1.0, 6.0);
}`;

const moteFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec4 uTint;
uniform float uK;
varying float vB;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.1, 0.5, length(d));
  gl_FragColor = vec4(mix(uColor, uTint.rgb, uTint.a) * min(uK, 1.2) * vB * a * 0.6, 1.0);
}`;

// Las tablas de una ventana de Barriers, en el plano del haz (alto y giro).
function boardsOf(win, c, side) {
  if (!win) return [];
  const ax = new THREE.Vector3();
  return win.boards.slice(0, MAXB).map((b) => {
    ax.set(1, 0, 0).applyQuaternion(b.quat);
    const roll = Math.atan2(ax.y, ax.dot(side));
    return { b, y: b.pos.y - c.y, s: Math.sin(roll), c: Math.cos(roll) };
  });
}

// items: [{ c (centro de la abertura, en el plano de las tablas), n (horizontal,
// hacia adentro), w, h (metros), dir (el rayo, hacia adentro y abajo), fy (piso),
// win (la ventana de Barriers, para las sombras de las tablas; o null) }]
// y opcionales: tint (THREE.Color, el vidrio: reemplaza el color de la luna),
// k (cuánto más fuerte), round (abertura redonda, diámetro w) y bars ([{ y, roll }]:
// parteluces fijos, como tablas que nunca se caen)
export function windowBeams(items, { color = 0x9ab4e8, dens = 0.45, pool = 0.35 } = {}) {
  const root = new THREE.Group();
  const U = { uTime: { value: 0 }, uK: { value: 1 }, uColor: { value: new THREE.Color(color) } };
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
  const beams = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const it of items) {
    const side = new THREE.Vector3(-it.n.z, 0, it.n.x);
    const dir = it.dir.clone().normalize();
    // el largo: hasta que el borde de arriba toca el piso
    const top = it.c.y + it.h / 2 - it.fy;
    const L = top / Math.max(0.2, -dir.y);
    const M = new THREE.Matrix4().makeBasis(side.clone().multiplyScalar(it.w), up.clone().multiplyScalar(it.h), dir.clone().multiplyScalar(L)).setPosition(it.c);
    const inv = M.clone().invert();
    const bl = boardsOf(it.win, it.c, side);
    const bars = (it.bars || []).slice(0, MAXB).map((b) => ({ y: b.y, s: Math.sin(b.roll), c: Math.cos(b.roll) }));
    const src = bl.length ? bl : bars;
    const boards = Array.from({ length: MAXB }, (_, i) => new THREE.Vector4(src[i]?.y || 0, src[i]?.s || 0, src[i]?.c ?? 1, bl.length ? 0 : +(i < bars.length)));
    const tint = it.tint ? new THREE.Vector4(it.tint.r, it.tint.g, it.tint.b, 1) : new THREE.Vector4(1, 1, 1, 0);
    const k = it.k ?? 1;
    const own = {
      uInv: { value: inv },
      uBox: { value: M },
      uFloor: { value: it.fy },
      uBoards: { value: boards },
      uSize: { value: new THREE.Vector2(it.w, it.h) },
      uRound: { value: it.round ? 1 : 0 },
      uTint: { value: tint },
    };
    const mk = (vertexShader, fragmentShader, extra = {}) =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, ...own, ...extra },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    const beam = new THREE.Mesh(box, mk(beamVert, beamFrag, { uDens: { value: dens * k } }));
    beam.material.defines = { STEPS: STEPS.high };
    beam.matrixAutoUpdate = false;
    // (con la caja torcida la esfera de three no la envuelve: cerca del borde
    // de la pantalla desaparecía; el costo de no recortarla son 36 vértices)
    beam.frustumCulled = false;
    beam.matrix.copy(M);
    beam.renderOrder = 6;
    root.add(beam);
    // el charco: la abertura proyectada al piso por el rayo (un paralelogramo), un poco más grande
    const pts = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([u, v]) => {
      const p = new THREE.Vector3(u * 1.2, v * 1.1, 0).applyMatrix4(M);
      return p.addScaledVector(dir, (p.y - it.fy) / Math.max(0.2, -dir.y)).setY(it.fy + 0.01);
    });
    const pg = new THREE.BufferGeometry().setFromPoints(pts);
    pg.setIndex([0, 1, 2, 0, 2, 3]);
    const pm = mk(poolVert, poolFrag, { uPool: { value: pool * k } });
    pm.side = THREE.DoubleSide;
    pm.polygonOffset = true;
    pm.polygonOffsetFactor = -2;
    pm.polygonOffsetUnits = -2;
    const poolMesh = new THREE.Mesh(pg, pm);
    poolMesh.renderOrder = 5;
    root.add(poolMesh);
    // las motas
    const seeds = new Float32Array(MOTES * 4);
    for (let i = 0; i < MOTES; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const motes = new THREE.Points(mg, mk(moteVert, moteFrag));
    motes.frustumCulled = false;
    motes.renderOrder = 7;
    root.add(motes);
    beams.push({ beam, inv, bl, boards, inside: false });
  }
  const cam = new THREE.Vector3();
  return {
    root,
    U,
    setQuality(q) {
      const n = STEPS[q] ?? STEPS.medium;
      for (const B of beams) {
        if (B.beam.material.defines.STEPS === n) continue;
        B.beam.material.defines.STEPS = n;
        B.beam.material.needsUpdate = true;
      }
    },
    // tablas (de a poco, así la luz no salta) y de qué lado se dibuja la caja
    update(dt, camera) {
      const k = Math.min(1, dt * 6);
      camera.getWorldPosition(cam);
      for (const B of beams) {
        for (let i = 0; i < B.bl.length; i++) {
          const st = B.bl[i].b.state;
          const on = st === 'on' || st === 'repair' ? 1 : 0;
          B.boards[i].w += (on - B.boards[i].w) * k;
        }
        // con la cámara adentro de la caja se dibujan las caras de atrás, sin
        // mirar la profundidad: la cara de abajo queda bajo el piso y el piso la
        // tapaba (parado en el charco se veía un hueco cuadrado sin luz). Lo de
        // abajo del piso ya lo apaga el shader (uFloor).
        const l = cam.clone().applyMatrix4(B.inv);
        const inside = Math.abs(l.x) < 0.52 && Math.abs(l.y) < 0.52 && l.z > -0.02 && l.z < 1.02;
        if (inside !== B.inside) {
          B.inside = inside;
          B.beam.material.side = inside ? THREE.BackSide : THREE.FrontSide;
          B.beam.material.depthTest = !inside;
          B.beam.material.needsUpdate = true;
        }
      }
    },
    dispose() {
      box.dispose();
      root.traverse((o) => {
        if (o.isMesh || o.isPoints) {
          if (o.geometry !== box) o.geometry.dispose();
          o.material.dispose();
        }
      });
    },
  };
}
