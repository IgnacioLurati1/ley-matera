import * as THREE from 'three';

// Los efectos del Mate Supremo (weapons/Supremo.js), armados de entrada y
// reciclados. Viven escondidos en el grupo de los mates (weapons.warm): la
// carga compila sus shaders y el primer tiro no traba.
//  · sun: un sol que revienta (rayos que giran, la estrella, el halo y el
//    anillo de choque), donde pega el rayo y en la punta de la bombilla.
//  · pillar: la columna de luz que baja del cielo sobre un muerto (el Juicio).
//  · sigil: el sello de los seis soles en el piso (la carga del Juicio y el
//    aura que va con el que lo tiene en la mano).
//  · wave: la ola del Juicio (el anillo del piso, la muralla de luz que barre
//    el mapa y la cáscara de luz).

// los seis easter eggs, un color por mapa (en el orden del juego)
export const SIX = [0x7fd4ff, 0x8cff6a, 0x5affe0, 0xb784ff, 0xff7a2e, 0xe6ff6a];
export const PAL = [
  { gold: 0xffc640, white: 0xfff3d6, hot: 0xffb040, star: 0xfff8e8, halo: 0xffa826, ring: 0xffe08a },
  { gold: 0xffe0a0, white: 0xffffff, hot: 0xff8ad8, star: 0xffffff, halo: 0xff6ac0, ring: 0x9af0ff },
];

const SUNS = 14;
const PILLARS = 40;
const WAVES = 3;
const PILLAR_H = 38;

const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());
const canvasTex = (S, draw) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// El sol: un disco blanco y dieciséis rayos finitos (largos y cortos).
export function raysTexture() {
  return once('rays', () =>
    canvasTex(256, (x, S) => {
      const c = S / 2;
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const L = i % 2 ? S * 0.3 : S * 0.48;
        const w = i % 2 ? 0.05 : 0.075;
        x.save();
        x.translate(c, c);
        x.rotate(a);
        const g = x.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, -S * w * 0.5);
        x.lineTo(L, 0);
        x.lineTo(0, S * w * 0.5);
        x.closePath();
        x.fill();
        x.restore();
      }
      const d = x.createRadialGradient(c, c, 0, c, c, S * 0.2);
      d.addColorStop(0, 'rgba(255,255,255,1)');
      d.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      d.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = d;
      x.fillRect(0, 0, S, S);
    }),
  );
}

// Un destello de cuatro puntas.
export function flareTexture() {
  return once('flare', () =>
    canvasTex(128, (x, S) => {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.12, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
      x.globalCompositeOperation = 'lighter';
      for (const [w, h, a] of [[S, 5, 0], [5, S, 0], [S * 0.62, 3, Math.PI / 4], [S * 0.62, 3, -Math.PI / 4]]) {
        x.save();
        x.translate(S / 2, S / 2);
        x.rotate(a);
        const lg = x.createLinearGradient(-w / 2, 0, w / 2, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = lg;
        x.fillRect(-w / 2, -h / 2, w, h);
        x.restore();
      }
    }),
  );
}

function ringTexture() {
  return once('ring', () =>
    canvasTex(128, (x, S) => {
      const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.72, 'rgba(255,255,255,0.15)');
      g.addColorStop(0.86, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
    }),
  );
}

// El sello de los seis soles: dos círculos con runas, el hexagrama, un sol en
// el medio y los seis nudos de color (uno por mapa) en las puntas.
export function sigilTexture() {
  return once('sigil', () =>
    canvasTex(512, (x, S) => {
      const c = S / 2;
      x.translate(c, c);
      x.lineCap = 'round';
      const stroke = (w, a) => {
        x.lineWidth = w;
        x.strokeStyle = `rgba(255,236,190,${a})`;
      };
      const circle = (r) => {
        x.beginPath();
        x.arc(0, 0, r, 0, Math.PI * 2);
        x.stroke();
      };
      stroke(6, 0.95);
      circle(S * 0.47);
      stroke(2.5, 0.8);
      circle(S * 0.43);
      circle(S * 0.3);
      // las runas entre los dos círculos de afuera
      stroke(2.2, 0.85);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        x.save();
        x.rotate(a);
        x.translate(0, -S * 0.45);
        const k = (i * 7) % 5;
        x.beginPath();
        if (k === 0) {
          x.moveTo(-5, 5);
          x.lineTo(0, -6);
          x.lineTo(5, 5);
        } else if (k === 1) {
          x.moveTo(0, -6);
          x.lineTo(0, 6);
          x.moveTo(-5, 0);
          x.lineTo(5, -3);
        } else if (k === 2) {
          x.arc(0, 0, 4.5, 0.3, Math.PI * 1.7);
        } else if (k === 3) {
          x.moveTo(-5, -5);
          x.lineTo(5, 5);
          x.moveTo(5, -5);
          x.lineTo(0, 0);
        } else {
          x.moveTo(-4, 6);
          x.lineTo(-4, -6);
          x.lineTo(4, -2);
          x.lineTo(-4, 1);
        }
        x.stroke();
        x.restore();
      }
      // el hexagrama
      stroke(4, 0.9);
      for (const off of [0, Math.PI / 3]) {
        x.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(a) * S * 0.43;
          const py = Math.sin(a) * S * 0.43;
          if (i) x.lineTo(px, py);
          else x.moveTo(px, py);
        }
        x.stroke();
      }
      // el sol del medio con sus rayos
      stroke(3, 0.9);
      circle(S * 0.075);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath();
        x.moveTo(Math.cos(a) * S * 0.095, Math.sin(a) * S * 0.095);
        x.lineTo(Math.cos(a) * S * (i % 2 ? 0.15 : 0.19), Math.sin(a) * S * (i % 2 ? 0.15 : 0.19));
        x.stroke();
      }
      // los seis nudos de color en las puntas
      x.globalCompositeOperation = 'lighter';
      SIX.forEach((hex, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * S * 0.43;
        const py = Math.sin(a) * S * 0.43;
        const col = new THREE.Color(hex);
        const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
        const g = x.createRadialGradient(px, py, 0, px, py, S * 0.06);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, `rgba(${rgb},0.95)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(px - S * 0.06, py - S * 0.06, S * 0.12, S * 0.12);
      });
    }),
  );
}

// ---------------- shaders ----------------
const PILLAR_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
// (vUv.y: 0 abajo, 1 arriba; sin normalizar vectores nulos: un NaN en la
// placa AMD apaga la pantalla)
const PILLAR_FS = `
uniform float uK, uTime, uGrow, uDim; uniform vec3 uCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  float face = clamp(abs(dot(n, v)), 0.0, 1.0);
  float core = pow(face, 1.6);
  float y = vUv.y;
  // baja del cielo: lo de abajo aparece a medida que crece
  float reach = smoothstep(1.0 - uGrow - 0.04, 1.0 - uGrow + 0.02, y);
  float streaks = 0.65 + 0.35 * sin(vUv.x * 6.2832 * 7.0 + y * 40.0 - uTime * 22.0);
  float top = 1.0 - smoothstep(0.75, 1.0, y);
  vec3 col = mix(uCol, vec3(1.0, 0.98, 0.92), core * 0.7) * (1.0 + core * 1.5);
  float a = (0.25 + core * 0.95) * streaks * reach * top * (1.0 - uK);
  gl_FragColor = vec4(col * a * uDim, a);
}`;
const SHELL_FS = `
uniform float uK, uTime, uDim; uniform vec3 uA, uB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  float f = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
  float rim = f * f * f;
  float bands = 0.6 + 0.4 * sin(vUv.y * 60.0 - uTime * 6.0);
  vec3 col = mix(uA, uB, rim) * (0.5 + rim * 2.2) * bands;
  float a = (0.05 + rim * 0.9) * (1.0 - uK);
  gl_FragColor = vec4(col * a * uDim, a);
}`;
// la muralla de la ola: fuerte abajo, se apaga hacia arriba, con franjas que
// corren y un arcoíris suave alrededor (vUv.y: 1 arriba)
const BAND_FS = `
uniform float uK, uTime, uDim; uniform vec3 uA, uB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float low = 1.0 - vUv.y;
  float body = pow(low, 1.2);
  float edge = smoothstep(0.72, 1.0, low);
  float stripes = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 48.0 + uTime * 10.0);
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vUv.x * 6.0 + uTime * 0.5));
  vec3 col = mix(uB, uA, low) * (0.5 + edge * 1.1) + hue * 0.3 * body;
  float a = (body * (0.18 + 0.4 * stripes) + edge * 0.45) * (1.0 - uK);
  gl_FragColor = vec4(col * a * uDim, a);
}`;
const FLAT_FS = `
uniform float uK, uSpin; uniform vec3 uCol; uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec2 c = vUv - 0.5;
  float s = sin(uSpin), co = cos(uSpin);
  c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
  vec4 t = texture2D(uMap, c + 0.5);
  vec3 col = t.rgb * uCol;
  float a = t.a * (1.0 - uK);
  gl_FragColor = vec4(col * a, a);
}`;

const additive = (uniforms, fs, side = THREE.DoubleSide) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: PILLAR_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side, fog: false });
const sprite = (map, hex, k) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
const prep = (o) => {
  o.frustumCulled = false;
  o.renderOrder = 8;
  o.userData.reflect = false;
  return o;
};

// El color de un material de los de acá (uCol), por `dim` (1: el de siempre).
function dimCol(mat, dim = 1) {
  const u = mat?.uniforms?.uCol;
  if (!u) return;
  u.base ||= u.value.clone();
  u.value.copy(u.base).multiplyScalar(dim ?? 1);
}

export default class SupremoFx {
  // home: donde viven escondidos (weapons.warm); dot: el punto suave; game:
  // para la escena de ahora (las armas duran entre mapas y cada mapa arma su
  // escena nueva: guardar la del principio los dejaba en una escena vieja)
  constructor(home, dot, game) {
    this.home = home;
    this.game = game;
    this.TIME = { value: 0 };
    // ---- los soles ----
    this.suns = [];
    for (const up of [0, 1]) {
      const C = PAL[up];
      for (let i = 0; i < SUNS; i++) {
        const root = new THREE.Group();
        const rays = prep(sprite(raysTexture(), C.gold, 2.4));
        const star = prep(sprite(flareTexture(), C.star, 2.4));
        const halo = prep(sprite(dot, C.halo, 1.8));
        const ring = prep(sprite(ringTexture(), C.ring, 2.2));
        root.add(halo, rays, ring, star);
        home.add(root);
        this.suns.push({ up, root, rays, star, halo, ring, t: 0, life: 0.5, s: 1, busy: false, spin: 0, mini: false });
      }
    }
    // ---- las columnas del Juicio ----
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.flatGeo = flatGeo;
    this.pillars = [];
    for (let i = 0; i < PILLARS; i++) {
      const root = new THREE.Group();
      const mat = additive({ uK: { value: 0 }, uTime: this.TIME, uGrow: { value: 0 }, uDim: { value: 1 }, uCol: { value: new THREE.Color(SIX[i % 6]) } }, PILLAR_FS);
      const col = prep(new THREE.Mesh(colGeo, mat));
      const ringMat = additive({ uK: { value: 0 }, uSpin: { value: 0 }, uCol: { value: new THREE.Color(SIX[i % 6]).multiplyScalar(2) }, uMap: { value: ringTexture() } }, FLAT_FS);
      const ring = prep(new THREE.Mesh(flatGeo, ringMat));
      ring.position.y = 0.05;
      const tip = prep(sprite(flareTexture(), 0xffffff, 2.6));
      root.add(col, ring, tip);
      home.add(root);
      this.pillars.push({ root, col, ring, tip, t: 0, busy: false, w: 0.6 });
    }
    // ---- los sellos (el del Juicio y el aura) ----
    this.sigils = [];
    for (let i = 0; i < 3; i++) {
      const mat = additive({ uK: { value: 0 }, uSpin: { value: 0 }, uCol: { value: new THREE.Color(0xffd98a).multiplyScalar(1.6) }, uMap: { value: sigilTexture() } }, FLAT_FS);
      const mesh = prep(new THREE.Mesh(flatGeo, mat));
      home.add(mesh);
      this.sigils.push({ mesh, busy: false, t: 0 });
    }
    // ---- las olas del Juicio ----
    const shellGeo = new THREE.SphereGeometry(1, 40, 22);
    const bandGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
    this.waves = [];
    for (let i = 0; i < WAVES; i++) {
      const group = new THREE.Group();
      const shell = prep(new THREE.Mesh(shellGeo, additive({ uK: { value: 0 }, uTime: this.TIME, uDim: { value: 1 }, uA: { value: new THREE.Color(0xffb040) }, uB: { value: new THREE.Color(0xfff6dc) } }, SHELL_FS, THREE.FrontSide)));
      shell.position.y = 1;
      const ring = prep(new THREE.Mesh(flatGeo, additive({ uK: { value: 0 }, uSpin: { value: 0 }, uCol: { value: new THREE.Color(0xffd070).multiplyScalar(1.1) }, uMap: { value: ringTexture() } }, FLAT_FS)));
      ring.position.y = 0.06;
      const band = prep(new THREE.Mesh(bandGeo, additive({ uK: { value: 0 }, uTime: this.TIME, uDim: { value: 1 }, uA: { value: new THREE.Color(0xffd070) }, uB: { value: new THREE.Color(0xff9a30) } }, BAND_FS)));
      group.add(shell, ring, band);
      home.add(group);
      this.waves.push({ group, shell, ring, band, t: 0, R: 1, dur: 0.7, H: 0, busy: false });
    }
  }

  get scene() {
    return this.game.scene;
  }

  // ---------------- soles ----------------
  // Un sol en `at` (s: el tamaño; mini: solo la estrella y los rayos; life:
  // cuánto dura, si no el de siempre).
  // (dim: cuánto brillan los soles, las columnas, los sellos y las olas que
  // salen desde ahora; 1 el de siempre. Lo baja la escena del armado del
  // penal, entities/penalForge.js, y lo vuelve a 1 al terminar)
  sun(at, up, s = 1, mini = false, life = 0) {
    const list = this.suns.filter((x) => x.up === up);
    const it = list.find((x) => !x.busy) || list.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    it.busy = true;
    it.t = 0;
    it.s = s;
    it.mini = mini;
    it.life = life || (mini ? 0.24 : up ? 0.7 : 0.55);
    it.spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
    it.rays.material.rotation = Math.random() * Math.PI;
    it.star.material.rotation = Math.random() * Math.PI;
    it.root.position.copy(at);
    it.halo.visible = !mini;
    it.ring.visible = !mini;
    this.scene.add(it.root);
    this.applySun(it, 0);
  }

  applySun(it, k) {
    const s = it.s;
    const out = 1 - (1 - k) * (1 - k);
    const fade = (1 - k) * (this.dim ?? 1);
    it.rays.scale.setScalar(s * (1 + out * (it.mini ? 1.4 : 4.6)));
    it.rays.material.opacity = Math.min(1, fade * 1.3);
    it.star.scale.setScalar(s * (0.7 + out * (it.mini ? 1.2 : 3.4)));
    it.star.material.opacity = fade;
    it.halo.scale.setScalar(s * (1.2 + out * 5.5));
    it.halo.material.opacity = fade * 0.75;
    it.ring.scale.setScalar(s * (0.3 + out * 8));
    it.ring.material.opacity = fade * fade;
  }

  // ---------------- columnas ----------------
  // Una columna que baja del cielo sobre `at` (el piso del muerto).
  pillar(at, color, up, w = 0.6) {
    const it = this.pillars.find((x) => !x.busy) || this.pillars.reduce((a, b) => (a.t > b.t ? a : b));
    it.busy = true;
    it.t = 0;
    it.w = w * (up ? 1.3 : 1);
    it.root.position.copy(at);
    const c = new THREE.Color(color);
    const D = this.dim ?? 1;
    it.col.material.uniforms.uCol.value.copy(c).lerp(new THREE.Color(0xffe6a0), 0.25);
    it.col.material.uniforms.uDim.value = D;
    it.ring.material.uniforms.uCol.value.copy(c).multiplyScalar(2.2 * D);
    it.tip.material.color.copy(c).lerp(new THREE.Color(0xffffff), 0.6).multiplyScalar(2.4 * D);
    this.scene.add(it.root);
    this.applyPillar(it);
  }

  applyPillar(it) {
    const t = it.t;
    const grow = Math.min(1, t / 0.1);
    const fade = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.45);
    const w = it.w * (1 + (t < 0.15 ? (1 - t / 0.15) * 0.8 : 0)) * (1 - fade * 0.7);
    it.col.scale.set(w, PILLAR_H, w);
    const U = it.col.material.uniforms;
    U.uGrow.value = grow;
    U.uK.value = fade;
    const rk = Math.min(1, t / 0.5);
    it.ring.scale.setScalar(0.4 + (1 - (1 - rk) * (1 - rk)) * 5.5);
    it.ring.material.uniforms.uK.value = Math.min(1, t / 0.75);
    it.ring.material.uniforms.uSpin.value = t * 3;
    const hit = grow >= 1 ? Math.max(0, 1 - (t - 0.1) / 0.35) : 0;
    it.tip.visible = hit > 0;
    it.tip.position.y = 0.6;
    it.tip.scale.setScalar(1.5 + hit * 4.5);
    it.tip.material.opacity = hit;
  }

  // ---------------- sellos ----------------
  // Un sello nuevo (devuelve el objeto para moverlo; `release` lo suelta).
  sigil(at, R) {
    const it = this.sigils.find((x) => !x.busy) || this.sigils[0];
    it.busy = true;
    it.t = 0;
    it.mesh.position.copy(at);
    it.mesh.scale.setScalar(R * 2);
    it.mesh.material.uniforms.uK.value = 0;
    dimCol(it.mesh.material, this.dim);
    this.scene.add(it.mesh);
    return it;
  }

  release(it) {
    if (!it) return;
    it.busy = false;
    this.home.add(it.mesh);
  }

  // ---------------- olas ----------------
  // (H: el alto de la muralla que barre el piso; 0, sin muralla)
  wave(at, R, dur = 0.7, H = 0) {
    const it = this.waves.find((x) => !x.busy) || this.waves[0];
    it.busy = true;
    it.t = 0;
    it.R = R;
    it.dur = dur;
    it.H = H;
    it.band.visible = H > 0;
    for (const m of [it.shell, it.ring, it.band]) {
      dimCol(m?.material, this.dim);
      if (m?.material.uniforms?.uDim) m.material.uniforms.uDim.value = this.dim ?? 1;
    }
    it.group.position.copy(at);
    it.group.scale.setScalar(0.01);
    this.scene.add(it.group);
  }

  // ---------------- cada cuadro ----------------
  update(dt, time) {
    this.TIME.value = time;
    for (const it of this.suns) {
      if (!it.busy) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      it.rays.material.rotation += dt * it.spin * 0.5;
      it.star.material.rotation -= dt * it.spin * 0.2;
      this.applySun(it, k);
      if (k >= 1) {
        it.busy = false;
        this.home.add(it.root);
      }
    }
    for (const it of this.pillars) {
      if (!it.busy) continue;
      it.t += dt;
      this.applyPillar(it);
      if (it.t > 0.8) {
        it.busy = false;
        this.home.add(it.root);
      }
    }
    for (const it of this.waves) {
      if (!it.busy) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const r = Math.max(0.3, it.R * (1 - (1 - k) * (1 - k) * (1 - k)));
      it.group.scale.setScalar(1);
      it.shell.scale.setScalar(r * 0.9);
      it.ring.scale.setScalar(r * 2.1);
      const fade = Math.min(1, Math.max(0, (it.t - it.dur * 0.5) / (it.dur * 0.5 + 0.4)));
      it.shell.material.uniforms.uK.value = fade;
      it.ring.material.uniforms.uK.value = fade;
      if (it.H > 0) {
        it.band.scale.set(r, it.H * (1 - fade * 0.6), r);
        it.band.material.uniforms.uK.value = fade;
      }
      it.ring.material.uniforms.uSpin.value = it.t * 0.8;
      if (it.t > it.dur + 0.4) {
        it.busy = false;
        this.home.add(it.group);
      }
    }
  }

  clear() {
    for (const list of [this.suns, this.pillars, this.sigils]) {
      for (const it of list) {
        if (!it.busy) continue;
        it.busy = false;
        this.home.add(it.root || it.mesh);
      }
    }
    for (const it of this.waves) {
      if (!it.busy) continue;
      it.busy = false;
      this.home.add(it.group);
    }
  }
}
