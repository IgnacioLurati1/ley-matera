import * as THREE from 'three';
import { TORRE } from './monumentoTorre';
import { PROP, COLS } from './monumentoPropileo';

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

export function buildLuces(w) {
  const T = w.T;
  const tStone = T.travertinoBig;
  const group = new THREE.Group();
  w.root.add(group);
  const list = [];
  const on = { value: 0 };
  // Un lavado: centro (x, y, z), ancho, alto, normal ('x' o 'z' con signo), color, fuerza
  const wash = (cx, y0, y1, cz, width, axis, sign, col, I, { fall = 1.6, edge = 0.08, off = 0.03 } = {}) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        tStone: { value: tStone },
        uCol: { value: new THREE.Color(col) },
        uI: { value: I },
        uOn: on,
        uY0: { value: y0 },
        uY1: { value: y1 },
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
    if (axis === 'x') {
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
  wash(Tr.x0, 11.4, yM, Tr.cz, Tr.z1 - Tr.z0 - 1.2, 'x', -1, warm, 1.25);
  wash(Tr.x1, 11.4, yM, Tr.cz, Tr.z1 - Tr.z0 - 1.2, 'x', 1, warm, 1.25);
  wash(Tr.cx, 11.4, yM, Tr.z0, Tr.x1 - Tr.x0 - 1.2, 'z', -1, warm, 1.1);
  wash(Tr.cx, 11.4, yM, Tr.z1, Tr.x1 - Tr.x0 - 1.2, 'z', 1, warm, 1.1);
  for (const z of [Tr.z0 + 1.3, Tr.z1 - 1.3]) {
    wash(Tr.x0 - 0.12, 11.4, yL, z, 0.6, 'x', -1, blue, 2.6, { fall: 0.6, edge: 0.2 });
    wash(Tr.x1 + 0.12, 11.4, yL, z, 0.6, 'x', 1, blue, 2.6, { fall: 0.6, edge: 0.2 });
  }
  for (const x of [Tr.x0 + 1.3, Tr.x1 - 1.3]) {
    wash(x, 11.4, yL, Tr.z0 - 0.12, 0.6, 'z', -1, blue, 2.6, { fall: 0.6, edge: 0.2 });
    wash(x, 11.4, yL, Tr.z1 + 0.12, 0.6, 'z', 1, blue, 2.6, { fall: 0.6, edge: 0.2 });
  }
  // el remate celeste
  wash(Tr.cx, yL, Tr.top, Tr.z0 - 0.45, Tr.x1 - Tr.x0 + 0.6, 'z', -1, blue, 1.6, { fall: 0.4, edge: 0.04 });
  wash(Tr.cx, yL, Tr.top, Tr.z1 + 0.45, Tr.x1 - Tr.x0 + 0.6, 'z', 1, blue, 1.6, { fall: 0.4, edge: 0.04 });
  wash(Tr.x0 - 0.45, yL, Tr.top, Tr.cz, Tr.z1 - Tr.z0 + 0.6, 'x', -1, blue, 1.6, { fall: 0.4, edge: 0.04 });
  wash(Tr.x1 + 0.45, yL, Tr.top, Tr.cz, Tr.z1 - Tr.z0 + 0.6, 'x', 1, blue, 1.6, { fall: 0.4, edge: 0.04 });
  // el cuerpo alto y el basamento (cálidos, desde los reflectores del piso)
  wash(69.5, 6.2, 11.4, 30.5, 15.6, 'x', -1, 0xffd9a8, 1.0, { fall: 1.0, edge: 0.03 });
  wash(82, 6.2, 11.4, 30.5, 15.6, 'x', 1, 0xffd9a8, 0.9, { fall: 1.0, edge: 0.03 });
  wash(66, 0.8, 6.2, 25.5, 9.0, 'x', -1, 0xffd9a8, 0.8, { fall: 1.2, edge: 0.02 });
  wash(66, 0.8, 6.2, 35.5, 9.0, 'x', -1, 0xffd9a8, 0.8, { fall: 1.2, edge: 0.02 });
  // el Propileo: las columnas de los frentes, bañadas de celeste desde el piso
  for (const [x, sign] of [[PROP.rows[0] - 0.38, -1], [PROP.rows[3] + 0.38, 1]]) {
    for (const z of COLS) wash(x, PROP.y + 0.22, 12.9, z, 0.42, 'x', sign, blue, 2.2, { fall: 0.8, edge: 0.12, off: 0.006 });
  }
  // los frisos (cálidos)
  wash(PROP.x1 + 0.05, 12.9, 14.3, 30, 27, 'x', 1, 0xffe0b8, 0.9, { fall: 0.8, edge: 0.02, off: 0.03 });
  wash(PROP.x0 - 0.05, 12.9, 14.3, 30, 27, 'x', -1, 0xffe0b8, 0.9, { fall: 0.8, edge: 0.02, off: 0.03 });
  // el Mirador prendido (la luz de adentro por las ventanas) y una luz de verdad ahí
  const mir = new THREE.PointLight(0x9ac8ff, 0, 14, 1.6);
  mir.position.set(Tr.cx, Tr.mir + 2.4, Tr.cz);
  w.scene.add(mir);
  w.mon.luces = {
    on: false,
    k: 0,
    list,
    set(v) {
      this.on = v;
    },
    update(dt) {
      const target = this.on ? 1 : 0;
      if (this.k === target) return;
      // los reflectores suben de a poco (5 s de abajo arriba)
      this.k = this.on ? Math.min(1, this.k + dt / 5) : Math.max(0, this.k - dt / 0.6);
      on.value = this.on ? this.k * 1.04 : this.k;
      mir.intensity = this.k * 6;
    },
  };
  group.visible = true;
}
