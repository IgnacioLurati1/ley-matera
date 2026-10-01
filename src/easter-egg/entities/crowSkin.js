import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../lib/assets';

// El Cuervo con cuerpo de verdad: un modelo de Meshy (malla y textura) con un
// esqueleto armado por código (tools: el bake del cuervo), en lugar de las
// piezas de entities/Crow.js. Las piezas siguen calculando todo (Crow.animate:
// el aleteo, el planeo, la picada, posado, la cabeza que mira, el pico) y
// acá se copia esa pose a los huesos: el cuerpo, cuello y cabeza, el pico,
// cada ala en cuatro tramos (brazo, antebrazo, mano, puntas), la cola en
// abanico (dos mitades) y las patas. Mientras baja el modelo se ven las
// piezas. window.__crowSkinOff = true deja ver las piezas.
//
// El GLB: public/assets/sotano/modelos/cuervo/modelo.glb, mirando a +z, en el
// tamaño de las piezas (userData.crow: medidas y el reposo de las alas).

const URL = '/assets/sotano/modelos/cuervo/modelo.glb';
// posado: cuánto dobla muslo, caña y pie (rad) y a qué altura queda el medio del cuerpo
const CROUCH = [0.5, 1.1, 0.6];
const PERCH_Y = 2.05;
// los ojos (m): la bolita encendida sobre el ojo de la textura y el brillo de encima
const EYE_R = 0.055;
const EYE_GLOW = 0.28;
// de noche, contra el cielo oscuro: un borde de luz del azul violáceo del
// brillo de las plumas (fresnel), según lo oscura que esté la niebla
const RIM = new THREE.Color(0x4a46b8);
const RIM_POW = 3.6;
const RIM_K = 0.4;
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

export default class CrowSkin {
  constructor(crow) {
    this.crow = crow;
    this.state = 0;
    new GLTFLoader().load(
      assetUrl(URL),
      (gltf) => this.ready(gltf),
      undefined,
      () => {
        this.state = 3;
      },
    );
  }

  ready(gltf) {
    const C = this.crow;
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const bones = {};
    root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.userData?.crow) this.meta = o.userData.crow;
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        this.mat = o.material;
      }
    });
    this.bones = bones;
    // el borde de noche (uniform: el programa es uno solo, prendido o apagado)
    this.rimU = { value: new THREE.Color(0) };
    if (this.mat) {
      this.mat.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = this.rimU;
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uRim * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), ${RIM_POW.toFixed(2)});`);
      };
      this.mat.customProgramCacheKey = () => 'crowSkinRim';
      this.mat.needsUpdate = true;
    }
    this.rest = Object.fromEntries(Object.entries(bones).map(([n, b]) => [n, b.quaternion.clone()]));
    // los ojos: los de las piezas (el mismo material: brillan más al apuntar)
    const eyeG = new THREE.SphereGeometry(1, 10, 8);
    for (const n of ['eyeA', 'eyeB']) {
      const o = root.getObjectByName(n);
      if (!o) continue;
      const ws = 1 / o.getWorldScale(new THREE.Vector3()).x;
      const m = new THREE.Mesh(eyeG, C.eyeMat);
      m.scale.setScalar(EYE_R * ws);
      o.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: C.g.textures.dot, color: 0xff3a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
      glow.scale.setScalar(EYE_GLOW * ws);
      o.add(glow);
    }
    this.root = root;
    C.rig.add(root);
    this.perchY = PERCH_Y;
    this.state = 2;
  }

  // Cada cuadro, después de Crow.animate (que dejó la pose en las piezas y en crow.pose).
  update(dt = 1 / 60) {
    const C = this.crow;
    if (this.state !== 2) return;
    const off = !!window.__crowSkinOff;
    this.root.visible = !off;
    C.body.visible = off;
    if (off) return;
    const P = C.pose;
    if (!P) return;
    // cuánto borde: la niebla (o el cielo) oscura es noche; al atardecer, nada
    // (el color es lineal: la torre de noche da ~0,003, el atardecer de la granja ~0,09)
    const sc = C.g.scene;
    const f = sc.fog?.color || (sc.background?.isColor ? sc.background : null);
    const L = f ? f.r * 0.3 + f.g * 0.5 + f.b * 0.2 : 0.3;
    const night = Math.max(0, Math.min(1, (0.03 - L) / 0.02));
    this.nightK = (this.nightK ?? night) + (night - (this.nightK ?? night)) * Math.min(1, dt * 2);
    this.rimU.value.copy(RIM).multiplyScalar(this.nightK * RIM_K);
    const B = this.bones;
    dt = Math.min(0.1, dt);
    const set = (n, fn) => {
      const b = B[n];
      if (!b) return;
      b.quaternion.copy(this.rest[n]);
      fn(b);
    };
    // (los giros van en el espacio del padre, sobre el reposo; los ejes del
    // bake: cada hueso sale con el mismo marco que el modelo, +z adelante)
    const pre = (b, ax, a) => b.quaternion.premultiply(qa.setFromAxisAngle(ax, a));
    // el modelo está parado en el aire (el cuerpo levantado pitch0): volando
    // se nivela; posado queda así, casi derecho
    const st = C.state;
    const fly = st === 'perch' || st === 'dead' ? 0 : 1;
    this.fk = (this.fk ?? fly) + (fly - (this.fk ?? fly)) * Math.min(1, dt * 4);
    const lift = this.meta.pitch0 * this.fk;
    set('root', (b) => {
      pre(b, AX, P.pitch * (0.5 + this.fk * 0.5) + lift);
      pre(b, AZ, P.roll);
    });
    // la cabeza mira adelante aunque el cuerpo se nivele (y al que persigue)
    const hr = C.head.rotation;
    set('neck', (b) => {
      pre(b, AY, hr.y * 0.4);
      pre(b, AX, -lift * 0.45);
    });
    set('head', (b) => {
      pre(b, AY, hr.y * 0.6);
      pre(b, AX, (hr.x - 0.25) - lift * 0.55);
    });
    // (el pico de Meshy está cerrado: se abre poco, si no se rompe)
    set('jaw', (b) => pre(b, AX, Math.min(0.2, C.jaw.rotation.x * 0.35)));
    // las alas: el de +x (s = 1) y el de -x
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      set('arm' + side, (b) => {
        pre(b, AY, -s * P.sweep * 0.6);
        pre(b, AZ, s * P.shoulder);
      });
      set('fore' + side, (b) => {
        pre(b, AY, -s * P.sweep * 0.35);
        pre(b, AZ, s * P.hand * 0.35);
      });
      set('hand' + side, (b) => {
        pre(b, AY, -s * P.sweep * 0.35);
        pre(b, AZ, s * P.hand * 0.65);
      });
      // las puntas se abren como dedos (para atrás) y se cierran plegadas
      set('tip' + side, (b) => pre(b, AY, -s * (P.open - 0.8) * 0.35));
    }
    // la cola: sube y baja, y se abre en abanico
    const fan = (P.fan - 1) * 0.35;
    set('tail', (b) => pre(b, AX, -C.tail.rotation.x));
    set('tailL', (b) => pre(b, AY, fan));
    set('tailR', (b) => pre(b, AY, -fan));
    // las patas: recogidas para atrás volando; posado, agachado (las patas del
    // modelo son más largas que las de las piezas: dobladas, el cuerpo queda a perchY)
    const tuck = Math.min(1, C.legs.rotation.x / 1.3);
    const crouch = (1 - tuck) * (1 - this.fk);
    for (const side of ['L', 'R']) {
      set('leg' + side, (b) => pre(b, AX, tuck * 0.9 - crouch * CROUCH[0]));
      set('shin' + side, (b) => pre(b, AX, tuck * 0.5 + crouch * CROUCH[1]));
      set('foot' + side, (b) => pre(b, AX, tuck * 0.6 - crouch * CROUCH[2]));
    }
  }
}
