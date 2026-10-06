import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TORRE, miradorRas } from './monumentoTorre';
import { PROP, COLS } from './monumentoPropileo';
import { WALL_BUYS } from '../config/map';

// La iluminación del Monumento de noche: los reflectores que pintan la Torre
// (las caras de blanco tibio, de abajo hacia arriba, y las esquinas de
// celeste), el cuerpo alto y la Proa de luz cálida, las columnas del Propileo
// bañadas de celeste y el Mirador prendido arriba. No son luces de verdad:
// son "lavados" sobre la piedra (un plano pegado a cada cara que suma la luz
// multiplicada por el color del travertino), así cuestan casi nada. Sin
// corriente está todo apagado; al darla se prenden de abajo hacia arriba,
// como los reflectores que arrancan (w.mon.luces.set(true)).

const VS = `
  varying vec3 vW;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FS = `
  uniform sampler2D tStone;
  uniform vec3 uCol;
  uniform float uI;
  uniform float uOn;
  uniform float uY0;
  uniform float uY1;
  uniform float uAxis;
  uniform float uFall;
  uniform float uEdge;
  varying vec3 vW;
  varying vec2 vUv;
  void main(){
    // el encendido sube: lo que está por arriba de la línea todavía no prendió
    float h = (vW.y - uY0) / max(0.01, uY1 - uY0);
    if (h > uOn) discard;
    // la luz del reflector: más fuerte abajo, se abre y se apaga arriba
    float g = mix(1.0, 0.25, pow(clamp(h, 0.0, 1.0), uFall));
    float e = smoothstep(0.0, uEdge, vUv.x) * smoothstep(1.0, 1.0 - uEdge, vUv.x) * smoothstep(0.0, 0.03, vUv.y);
    vec2 suv = uAxis > 0.5 ? vec2(vW.z, vW.y) * 0.5 : vec2(vW.x, vW.y) * 0.5;
    vec3 stone = texture2D(tStone, suv).rgb;
    vec3 c = uCol * stone * g * e * uI;
    // el borde de lo que se va prendiendo brilla un poco más
    c *= 1.0 + smoothstep(uOn - 0.04, uOn, h) * 0.6 * step(uOn, 0.999);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Los lavados juntos: el mismo dibujo que FS, con lo de cada uno por vértice.
const VS_ALL = `
  attribute vec3 aCol;
  attribute vec4 aP;
  attribute vec2 aQ;
  varying vec3 vW;
  varying vec2 vUv;
  varying vec3 vCol;
  varying vec4 vP;
  varying vec2 vQ;
  void main(){
    vUv = uv;
    vCol = aCol;
    vP = aP;
    vQ = aQ;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FS_ALL = `
  uniform sampler2D tStone;
  uniform float uOn;
  uniform vec3 uHoleA[8];
  uniform vec3 uHoleB[8];
  varying vec3 vW;
  varying vec2 vUv;
  varying vec3 vCol;
  varying vec4 vP;
  varying vec2 vQ;
  void main(){
    float h = (vW.y - vP.y) / max(0.01, vP.z - vP.y);
    if (h > uOn) discard;
    // (los pizarrones de las armas de pared: el lavado no pasa por delante; a
    // 3 mm de la pizarra, de lejos titilaban con ella y la tiza)
    for (int i = 0; i < 8; i++) if (all(greaterThan(vW, uHoleA[i])) && all(lessThan(vW, uHoleB[i]))) discard;
    float g = mix(1.0, 0.25, pow(clamp(h, 0.0, 1.0), vQ.x));
    float e = smoothstep(0.0, vQ.y, vUv.x) * smoothstep(1.0, 1.0 - vQ.y, vUv.x) * smoothstep(0.0, 0.03, vUv.y);
    vec2 suv = vP.w > 0.5 ? vec2(vW.z, vW.y) * 0.5 : vec2(vW.x, vW.y) * 0.5;
    vec3 stone = texture2D(tStone, suv).rgb;
    vec3 c = vCol * stone * g * e * vP.x;
    c *= 1.0 + smoothstep(uOn - 0.04, uOn, h) * 0.6 * step(uOn, 0.999);
    gl_FragColor = vec4(c, 1.0);
  }`;

function mergeWashes(list, on, tStone, holes) {
  const geos = list.map((m) => {
    m.updateMatrix();
    const U = m.material.uniforms;
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const p = new Float32Array(n * 4);
    const q = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      col.set([U.uCol.value.r, U.uCol.value.g, U.uCol.value.b], i * 3);
      p.set([U.uI.value, U.uY0.value, U.uY1.value, U.uAxis.value], i * 4);
      q.set([U.uFall.value, U.uEdge.value], i * 2);
    }
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aP', new THREE.BufferAttribute(p, 4));
    g.setAttribute('aQ', new THREE.BufferAttribute(q, 2));
    g.deleteAttribute('normal');
    return g;
  });
  const geo = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS_ALL,
    fragmentShader: FS_ALL,
    uniforms: { tStone: { value: tStone }, uOn: on, uHoleA: { value: holes.a }, uHoleB: { value: holes.b } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.userData.reflect = false;
  // (al armar el mapa se ven los dos, así core/sizeCull anota los sueltos como
  // antes; el primer update deja uno)
  return m;
}

export function buildLuces(w) {
  const T = w.T;
  const tStone = T.travertinoBig;
  const group = new THREE.Group();
  w.root.add(group);
  const list = [];
  const on = { value: 0 };
  // Un lavado: centro (x, y, z), ancho, alto, normal ('x' o 'z' con signo), color, fuerza
  // (top: hasta dónde llega la luz que se apaga para arriba, si no es el borde de arriba del lavado)
  const wash = (cx, y0, y1, cz, width, axis, sign, col, I, { fall = 1.6, edge = 0.08, off = 0.03, base = y0, top = y1 } = {}) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        tStone: { value: tStone },
        uCol: { value: new THREE.Color(col) },
        uI: { value: I },
        uOn: on,
        uY0: { value: base },
        uY1: { value: top },
        uAxis: { value: axis === 'x' ? 1 : 0 },
        uFall: { value: fall },
        uEdge: { value: edge },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(width, y1 - y0);
    const m = new THREE.Mesh(geo, mat);
    if (typeof axis === 'number') {
      // una cara en diagonal (axis: el giro en y de su normal)
      m.position.set(cx + Math.sin(axis) * off, (y0 + y1) / 2, cz + Math.cos(axis) * off);
      m.rotation.y = axis;
    } else if (axis === 'x') {
      m.position.set(cx + sign * off, (y0 + y1) / 2, cz);
      m.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      m.position.set(cx, (y0 + y1) / 2, cz + sign * off);
      m.rotation.y = sign > 0 ? 0 : Math.PI;
    }
    m.renderOrder = 2;
    m.userData.reflect = false;
    group.add(m);
    list.push(m);
    return m;
  };
  const Tr = TORRE;
  const warm = 0xfff0d8;
  const blue = 0x4aa8ff;
  // la Torre: las cuatro caras de blanco tibio y las fajas de las esquinas celestes
  const yM = Tr.mir;
  const yL = Tr.lint + 0.4;
  // La Torre entera, de abajo arriba (globalThis.__mduNoTorreLuz: como antes,
  // con el Mirador a oscuras, el remate como una placa celeste en el aire y
  // las estatuas negras): la luz de las caras se apaga recién arriba del todo
  // (antes llegaba al Mirador casi apagada) y sigue por el antepecho, los
  // parantes y el dintel del Mirador; el remate, celeste, escalón por escalón
  // sobre su piedra (el lavado de antes flotaba 25 cm adelante, contra el cielo).
  const fix = globalThis.__mduNoTorreLuz !== true;
  const G = fix ? { base: 11.4, top: 60 } : {};
  wash(Tr.x0, 11.4, yM, Tr.cz, Tr.z1 - Tr.z0 - 1.2, 'x', -1, warm, 1.25, G);
  wash(Tr.x1, 11.4, yM, Tr.cz, Tr.z1 - Tr.z0 - 1.2, 'x', 1, warm, 1.25, G);
  wash(Tr.cx, 11.4, yM, Tr.z0, Tr.x1 - Tr.x0 - 1.2, 'z', -1, warm, 1.1, G);
  wash(Tr.cx, 11.4, yM, Tr.z1, Tr.x1 - Tr.x0 - 1.2, 'z', 1, warm, 1.1, G);
  // (las fajas celestes, hasta donde llega la piedra de la faja: más arriba
  // el lavado quedaba delante de las ventanas del Mirador)
  const yF = fix ? Tr.mir - 1.2 : yL;
  for (const z of [Tr.z0 + 1.3, Tr.z1 - 1.3]) {
    wash(Tr.x0 - 0.12, 11.4, yF, z, 0.6, 'x', -1, blue, 2.6, { fall: 0.6, edge: 0.2 });
    wash(Tr.x1 + 0.12, 11.4, yF, z, 0.6, 'x', 1, blue, 2.6, { fall: 0.6, edge: 0.2 });
  }
  for (const x of [Tr.x0 + 1.3, Tr.x1 - 1.3]) {
    wash(x, 11.4, yF, Tr.z0 - 0.12, 0.6, 'z', -1, blue, 2.6, { fall: 0.6, edge: 0.2 });
    wash(x, 11.4, yF, Tr.z1 + 0.12, 0.6, 'z', 1, blue, 2.6, { fall: 0.6, edge: 0.2 });
  }
  if (fix) {
    // el Mirador: el antepecho y el dintel corridos, y los parantes entre las ventanas
    const sill = Tr.mir + 1.05;
    // (con el remate nuevo, liso, el dintel es parte del remate: lo lava abajo)
    const nuevo = globalThis.__mduNoRemate !== true;
    // (con el Mirador a ras de la Torre, las esquinas ochavadas: los lavados
    // de las caras no llegan a la ochava, que va celeste como la del remate)
    const ras = miradorRas();
    const cc = ras ? Tr.chamfer : 0;
    for (const [y0, y1] of nuevo ? [[Tr.mir - 0.01, sill]] : [[Tr.mir - 0.01, sill], [Tr.lint, yL]]) {
      wash(Tr.x0, y0, y1, Tr.cz, Tr.z1 - Tr.z0 - 2 * cc, 'x', -1, warm, 1.25, { ...G, edge: 0.02 });
      wash(Tr.x1, y0, y1, Tr.cz, Tr.z1 - Tr.z0 - 2 * cc, 'x', 1, warm, 1.25, { ...G, edge: 0.02 });
      wash(Tr.cx, y0, y1, Tr.z0, Tr.x1 - Tr.x0 - 2 * cc, 'z', -1, warm, 1.1, { ...G, edge: 0.02 });
      wash(Tr.cx, y0, y1, Tr.z1, Tr.x1 - Tr.x0 - 2 * cc, 'z', 1, warm, 1.1, { ...G, edge: 0.02 });
    }
    const piersZ = [];
    for (let i = 0; i <= 4; i++) {
      const z = Tr.z0 + (i * (Tr.z1 - Tr.z0)) / 4;
      if (ras && i === 0) piersZ.push([Tr.z0 + cc, Tr.z0 + 1]);
      else if (ras && i === 4) piersZ.push([Tr.z1 - 1, Tr.z1 - cc]);
      else piersZ.push([Math.max(Tr.z0, z - 0.35), Math.min(Tr.z1, z + 0.35)]);
    }
    for (const [a, b] of piersZ) {
      wash(Tr.x0, sill, Tr.lint, (a + b) / 2, b - a, 'x', -1, warm, 1.25, { ...G, edge: 0.05 });
      wash(Tr.x1, sill, Tr.lint, (a + b) / 2, b - a, 'x', 1, warm, 1.25, { ...G, edge: 0.05 });
    }
    for (const [a, b] of [[Tr.x0 + cc, Tr.x0 + 1], [Tr.cx - 0.35, Tr.cx + 0.35], [Tr.x1 - 1, Tr.x1 - cc]]) {
      wash((a + b) / 2, sill, Tr.lint, Tr.z0, b - a, 'z', -1, warm, 1.1, { ...G, edge: 0.05 });
      wash((a + b) / 2, sill, Tr.lint, Tr.z1, b - a, 'z', 1, warm, 1.1, { ...G, edge: 0.05 });
    }
    if (nuevo) {
      // el remate liso: las caras de blanco tibio hasta la losa, las ochavas
      // celestes (en la Torre de verdad las esquinas van celestes hasta arriba)
      // y la losa del coronamiento
      const c = Tr.chamfer;
      const yR = Tr.remate;
      wash(Tr.x0, Tr.lint, yR, Tr.cz, Tr.z1 - Tr.z0 - 2 * c, 'x', -1, warm, 1.25, { ...G, edge: 0.03 });
      wash(Tr.x1, Tr.lint, yR, Tr.cz, Tr.z1 - Tr.z0 - 2 * c, 'x', 1, warm, 1.25, { ...G, edge: 0.03 });
      wash(Tr.cx, Tr.lint, yR, Tr.z0, Tr.x1 - Tr.x0 - 2 * c, 'z', -1, warm, 1.1, { ...G, edge: 0.03 });
      wash(Tr.cx, Tr.lint, yR, Tr.z1, Tr.x1 - Tr.x0 - 2 * c, 'z', 1, warm, 1.1, { ...G, edge: 0.03 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = (sx < 0 ? Tr.x0 : Tr.x1) - (sx * c) / 2;
        const cz = (sz < 0 ? Tr.z0 : Tr.z1) - (sz * c) / 2;
        // (a ras: la ochava sube desde el piso del Mirador)
        const yC = ras ? Tr.mir - 0.01 : Tr.lint;
        wash(cx, yC, yR, cz, c * Math.SQRT2, Math.atan2(sx, sz), 0, blue, 2.6, { fall: 0.6, edge: 0.15, base: yC - 2 });
      }
      for (const [ax, sg, wd, cx, cz] of [['x', -1, Tr.z1 - Tr.z0, Tr.x0 - 0.07, Tr.cz], ['x', 1, Tr.z1 - Tr.z0, Tr.x1 + 0.07, Tr.cz], ['z', -1, Tr.x1 - Tr.x0, Tr.cx, Tr.z0 - 0.07], ['z', 1, Tr.x1 - Tr.x0, Tr.cx, Tr.z1 + 0.07]]) {
        wash(cx, yR, Tr.roof, cz, wd - 2 * c, ax, sg, warm, 1.0, { fall: 1.0, edge: 0.03, off: 0.01 });
      }
    }
    // el remate escalonado (los cuerpos de monumentoTorre buildMirador: el
    // primero sale 20 cm, los otros dos entran 0,6 y 1,4)
    let y = yL;
    for (const [d, h] of nuevo ? [] : [[-0.2, 0.9], [0.6, 1.1], [1.4, 0.8]]) {
      const wx = Tr.x1 - Tr.x0 - 2 * d;
      const wz = Tr.z1 - Tr.z0 - 2 * d;
      const o = { fall: 0.5, edge: 0.03, base: y - 0.6, top: y + h };
      wash(Tr.cx, y, y + h, Tr.z0 + d, wx, 'z', -1, blue, 1.9, o);
      wash(Tr.cx, y, y + h, Tr.z1 - d, wx, 'z', 1, blue, 1.9, o);
      wash(Tr.x0 + d, y, y + h, Tr.cz, wz, 'x', -1, blue, 1.9, o);
      wash(Tr.x1 - d, y, y + h, Tr.cz, wz, 'x', 1, blue, 1.9, o);
      y += h;
    }
  } else {
    // el remate celeste
    wash(Tr.cx, yL, Tr.top, Tr.z0 - 0.45, Tr.x1 - Tr.x0 + 0.6, 'z', -1, blue, 1.6, { fall: 0.4, edge: 0.04 });
    wash(Tr.cx, yL, Tr.top, Tr.z1 + 0.45, Tr.x1 - Tr.x0 + 0.6, 'z', 1, blue, 1.6, { fall: 0.4, edge: 0.04 });
    wash(Tr.x0 - 0.45, yL, Tr.top, Tr.cz, Tr.z1 - Tr.z0 + 0.6, 'x', -1, blue, 1.6, { fall: 0.4, edge: 0.04 });
    wash(Tr.x1 + 0.45, yL, Tr.top, Tr.cz, Tr.z1 - Tr.z0 + 0.6, 'x', 1, blue, 1.6, { fall: 0.4, edge: 0.04 });
  }
  // el cuerpo alto y el basamento (cálidos, desde los reflectores del piso)
  wash(69.5, 6.2, 11.4, 30.5, 15.6, 'x', -1, 0xffd9a8, 1.0, { fall: 1.0, edge: 0.03 });
  wash(82, 6.2, 11.4, 30.5, 15.6, 'x', 1, 0xffd9a8, 0.9, { fall: 1.0, edge: 0.03 });
  // la cara del basamento al atrio: de a paños entre las puertas de la Cripta y
  // el nicho (un lavado entero quedaba como una cortina de luz en el vano de
  // las puertas abiertas)
  for (const [z0, z1, y0] of [[24, 28.4, 0.8], [32.6, 37, 0.8], [20, 21, 0.8], [40, 41, 0.8], [21, 24, 3.5], [37, 40, 3.5], [28.4, 32.6, 5.6]]) {
    // (antes iba pegado a la piedra, 3 mm, detrás de los pizarrones de las
    // compras de pared, que si no quedaban lavados; a 36 m, desde el Propileo,
    // titilaba con la piedra en rayas. Ahora a 3 cm, con los huecos de los
    // pizarrones en el shader. __mduNoWashHoles: como antes)
    const offA = globalThis.__mduNoWashHoles === true ? 0.003 : 0.03;
    wash(66, y0, 6.2, (z0 + z1) / 2, z1 - z0, 'x', -1, 0xffd9a8, 0.8, { fall: 1.2, edge: 0.02, base: 0.8, off: offA });
  }
  // el nicho de la Madre Patria: el fondo (con el abanico de la bóveda, lo de
  // afuera del arco lo tapa la pared) y el frente del pedestal
  if (fix) {
    // (a 3 cm del fondo y del pedestal: a 4 mm, desde el Propileo titilaban)
    wash(66.85, 1.1, 5.6, 30.5, 4.2, 'x', -1, 0xffd9a8, 1.1, { fall: 1.0, edge: 0.03, base: 0.8, off: 0.03 });
    wash(66.05, 0.8, 1.4, 30.5, 2.6, 'x', -1, 0xffd9a8, 1.0, { fall: 1.0, edge: 0.03, off: 0.03 });
  }
  // el Propileo: las columnas de los frentes, bañadas de celeste desde el piso
  for (const [x, sign] of [[PROP.rows[0] - 0.38, -1], [PROP.rows[3] + 0.38, 1]]) {
    for (const z of COLS) wash(x, PROP.y + 0.22, 12.9, z, 0.42, 'x', sign, blue, 2.2, { fall: 0.8, edge: 0.12, off: 0.006 });
  }
  // los frisos (cálidos)
  wash(PROP.x1 + 0.05, 12.9, 14.3, 30, 27, 'x', 1, 0xffe0b8, 0.9, { fall: 0.8, edge: 0.02, off: 0.03 });
  wash(PROP.x0 - 0.05, 12.9, 14.3, 30, 27, 'x', -1, 0xffe0b8, 0.9, { fall: 0.8, edge: 0.02, off: 0.03 });
  // todos los lavados en una sola malla (eran ~50 dibujos): suman luz, así que
  // el orden no cambia nada; lo de cada uno va por vértice. Los sueltos quedan
  // armados y escondidos: globalThis.__mduNoLavados
  // los huecos de los pizarrones de las armas de pared (como los arma
  // world/Monumento.js buildPizarrones; globalThis.__mduNoWashHoles: sin huecos)
  const holes = { a: [], b: [] };
  for (const wb of globalThis.__mduNoWashHoles === true ? [] : WALL_BUYS) {
    if (holes.a.length >= 6) break;
    const a = w.wallAnchor(wb.cell, wb.face, 0);
    if (wb.slide) {
      if (wb.face[0]) a.z += wb.slide;
      else a.x += wb.slide;
    }
    const fy = w.floorAt(wb.cell[0] + 0.5 + wb.face[0] * 1.2, wb.cell[1] + 0.5 + wb.face[1] * 1.2);
    const along = [Math.abs(wb.face[1]), Math.abs(wb.face[0])];
    const hw = 0.98;
    holes.a.push(new THREE.Vector3(a.x - along[0] * hw - 0.06, fy + 0.96, a.z - along[1] * hw - 0.06));
    holes.b.push(new THREE.Vector3(a.x + along[0] * hw + 0.06, fy + 2.1, a.z + along[1] * hw + 0.06));
  }
  // y los frisos del Propileo con la frase del Himno (se iluminan solos:
  // monumentoPropileo frieze; con el lavado delante no se leían)
  if (globalThis.__mduNoFrisoLuz !== true) {
    const zf = (PROP.z0 + PROP.z1) / 2;
    const hl = (PROP.z1 - PROP.z0 - 2.2) / 2 + 0.05;
    const hh = ((PROP.z1 - PROP.z0 - 2.2) * 160) / 4096 / 2 + 0.03;
    for (const x of [PROP.x1 + 0.066, PROP.x0 - 0.066]) {
      holes.a.push(new THREE.Vector3(x - 0.06, 12.9 + 0.75 - hh, zf - hl));
      holes.b.push(new THREE.Vector3(x + 0.06, 12.9 + 0.75 + hh, zf + hl));
    }
  }
  while (holes.a.length < 8) {
    holes.a.push(new THREE.Vector3(1e6, 1e6, 1e6));
    holes.b.push(new THREE.Vector3(1e6, 1e6, 1e6));
  }
  const one = mergeWashes(list, on, tStone, holes);
  group.add(one);
  // el Mirador prendido (la luz de adentro por las ventanas) y una luz de verdad ahí
  const mir = new THREE.PointLight(0x9ac8ff, 0, 14, 1.6);
  // (a un metro del techo: con el remate nuevo el techo del Mirador baja a 47)
  mir.position.set(Tr.cx, Tr.mir + (globalThis.__mduNoRemate === true ? 2.4 : 2.0), Tr.cz);
  w.scene.add(mir);
  w.mon.luces = {
    on: false,
    k: 0,
    list,
    set(v) {
      this.on = v;
    },
    // de una (sin subir de a poco): el fondo del menú de título
    now(v) {
      this.on = v;
      this.k = v ? 1 : 0;
      on.value = v ? 1.04 : 0;
      mir.intensity = this.k * 6;
      this.statues();
    },
    // las estatuas bañadas (world/monumentoTextures.js bronzeLit, marbleLit)
    statues() {
      if (w.M.bronzeLit) w.M.bronzeLit.emissiveIntensity = this.k * 1.7;
      if (w.M.marbleLit) w.M.marbleLit.emissiveIntensity = this.k * 0.32;
      // (las rosetas de la Torre: monumentoTorre buildFuste)
      for (const m of w.mon.litMats || []) m.emissiveIntensity = this.k * (m.userData.litK ?? 1.4);
    },
    update(dt) {
      const mg = globalThis.__mduNoLavados !== true;
      if (mg !== this.merged) {
        this.merged = mg;
        one.visible = mg;
        for (const m of list) m.visible = !mg;
      }
      const target = this.on ? 1 : 0;
      if (this.k === target) return;
      // los reflectores suben de a poco (5 s de abajo arriba)
      this.k = this.on ? Math.min(1, this.k + dt / 5) : Math.max(0, this.k - dt / 0.6);
      on.value = this.on ? this.k * 1.04 : this.k;
      mir.intensity = this.k * 6;
      this.statues();
    },
  };
  group.visible = true;
}
