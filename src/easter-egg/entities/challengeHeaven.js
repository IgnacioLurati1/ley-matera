import * as THREE from 'three';
import { TOWER } from '../config/map';
import { VM } from '../weapons/viewmodels';
import { supremoBodyMaterial, supremoTime } from '../weapons/Supremo';
import { SIX } from '../weapons/supremoFx';

// El final del Challenge de la torre: el Cielo de los Mates. Se paga la
// escalera al cielo (entities/TowerChallenge.js), suben todos y la cámara se
// va para arriba: nubes, el Portón del Cielo Matero, mates con alitas que
// revolotean (uno se la pone de lleno contra la cámara), un termo con alas que
// ceba al Mate Supremo y el Mate Supremo que al final se sorbe al que llegó.
// Después, la pantalla del final.
// Todo con materiales sin luces (matcap y básicos): no depende de las luces
// del mapa ni suma ninguna (sumar luces recompila todo). Se arma escondido al
// cargar el mapa, bien arriba de la torre, adentro de una esfera de cielo que
// escribe profundidad y tapa lo de afuera (la tormenta, la torre).

const HY = 380;
// los tiempos de la escena (s): subir, salir de las nubes, ir al portón,
// cruzarlo, mirar al Supremo y el sorbo final (con aire entre plano y plano
// para mirar el cielo, como pidió el usuario)
const TL = { up: 1.45, rise: 6.4, glide: 12.4, thru: 16.2, hold: 17.4, slurp: 19.3, end: 19.8, doors: [8.6, 10], bonk: [9.6, 10.4], title: [2.2, 5.6] };
const CARDS = [
  [7, 'Acá el agua siempre está a 80°...'],
  [10.8, '...y nadie te lava la yerba.'],
  [13.8, 'Bienvenido. El mate es eterno... y ahora te toca cebar a vos.'],
];
// (el centro de la torre se toma al armar la escena: TOWER es del mapa elegido
// y en los otros mapas vale null, así que leerlo al cargar el archivo rompía el juego)
let CX = 0;
let CZ = 0;
let GATE_Z = 0;
let SUPREMO = null;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (k) => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Un matcap pintado a mano: luz arriba a la izquierda, el borde más oscuro.
function matcap(hi, mid, lo, rim = null) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S * 0.36, S * 0.32, S * 0.02, S * 0.5, S * 0.5, S * 0.5);
  g.addColorStop(0, hi);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, lo);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  if (rim) {
    const r = x.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(1, rim);
    x.fillStyle = r;
    x.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Un ala de plumas (blanca con el borde celeste), con transparencia.
function wingTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const len = 90 + k * 140;
    const y = 20 + k * 80;
    const g = x.createLinearGradient(0, y, len, y);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(240,248,255,0.95)');
    g.addColorStop(1, 'rgba(170,215,255,0.9)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, y - 10);
    x.quadraticCurveTo(len * 0.6, y - 16 - k * 6, len, y + 4);
    x.quadraticCurveTo(len * 0.55, y + 12, 0, y + 12);
    x.closePath();
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Rayos de sol para atrás del Mate Supremo.
function raysTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  for (let i = 0; i < 28; i++) {
    x.rotate((Math.PI * 2) / 28);
    const g = x.createLinearGradient(0, 0, S / 2, 0);
    g.addColorStop(0, 'rgba(255,240,190,0.9)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(S / 2, -S * (i % 2 ? 0.035 : 0.06));
    x.lineTo(S / 2, S * (i % 2 ? 0.035 : 0.06));
    x.closePath();
    x.fill();
  }
  const core = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
  core.addColorStop(0, 'rgba(255,250,230,1)');
  core.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = core;
  x.fillRect(-S / 2, -S / 2, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Un cartel de letras de oro.
function signTexture(lines, w = 1024, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const step = h / (lines.length + 0.4);
  lines.forEach(([text, size, color], i) => {
    x.font = `bold ${size}px Cinzel, Georgia, serif`;
    x.shadowColor = 'rgba(90, 140, 255, 0.85)';
    x.shadowBlur = 16;
    x.fillStyle = color || '#ffd66a';
    x.fillText(text, w / 2, step * (i + 0.7));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY_VS = `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
uniform float uTime;
varying vec3 vDir;
void main(){
  vec3 d = vDir / max(length(vDir), 1e-4);
  vec3 top = vec3(0.12, 0.36, 0.92);
  vec3 hor = vec3(0.98, 0.72, 0.42);
  vec3 low = vec3(0.86, 0.8, 0.9);
  vec3 col = d.y > 0.0 ? mix(hor, top, pow(d.y, 0.55)) : mix(hor, low, pow(-d.y, 0.5));
  vec3 sun = normalize(vec3(0.6, 0.42, -0.68));
  float s = max(dot(d, sun), 0.0);
  col += vec3(1.0, 0.82, 0.45) * (pow(s, 12.0) * 0.3 + pow(s, 220.0) * 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;

// El "ahhhh" celestial apenas se entra al cielo (el mp3 que pasó el usuario;
// con un poco más de reverb que lo normal). Se baja acá y no en core/audio.js.
const AHH = { url: '/assets/sotano/sfx/cielo-ahhh.mp3', gain: 0.95, reverb: 0.4 };

export default class ChallengeHeaven {
  constructor(g) {
    this.g = g;
    CX = TOWER.cx;
    CZ = TOWER.cz;
    GATE_Z = CZ + 8;
    SUPREMO = new THREE.Vector3(CX, HY - 1.5, CZ - 34);
    this.root = new THREE.Group();
    this.root.visible = false;
    g.scene.add(this.root);
    this.t = 0;
    this.on = false;
    this.done = null;
    this.build();
    this.loadAhh();
  }

  loadAhh() {
    const A = this.g.audio;
    if (!A?.ctx || this.ahh) return;
    fetch(AHH.url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => A.ctx.decodeAudioData(ab))
      .then((b) => {
        this.ahh = b;
      })
      .catch(() => {});
  }

  build() {
    const R = this.root;
    const noFog = { fog: false };
    const M = {
      gold: new THREE.MeshMatcapMaterial({ matcap: matcap('#fff8d0', '#f2b834', '#6a3c06', 'rgba(255,240,180,0.6)'), ...noFog }),
      cloud: new THREE.MeshMatcapMaterial({ matcap: matcap('#ffffff', '#ece4fa', '#a898cc'), ...noFog }),
      marble: new THREE.MeshMatcapMaterial({ matcap: matcap('#ffffff', '#efe8f6', '#a89ab8'), ...noFog }),
      gourd: new THREE.MeshMatcapMaterial({ matcap: matcap('#f0c888', '#a86a34', '#3a200c', 'rgba(255,220,160,0.4)'), ...noFog }),
      termo: new THREE.MeshMatcapMaterial({ matcap: matcap('#f4fbff', '#7a9cc4', '#1a2a44', 'rgba(210,235,255,0.6)'), ...noFog }),
      yerba: new THREE.MeshBasicMaterial({ color: 0x6a9a3a, ...noFog }),
      halo: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd870).multiplyScalar(2.2), toneMapped: false, ...noFog }),
      wing: new THREE.MeshBasicMaterial({ map: wingTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, ...noFog }),
      water: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe8ff).multiplyScalar(1.4), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, ...noFog }),
    };
    this.M = M;
    // el cielo: una esfera que escribe profundidad (tapa todo lo de afuera)
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(140, 40, 20),
      new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: true, fog: false }),
    );
    sky.position.set(CX, HY, CZ);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    R.add(sky);
    // el mar de nubes: bollos de algodón (una sola malla)
    const blobs = [];
    const puff = (x, y, z, s, n = 5) => {
      for (let i = 0; i < n; i++) blobs.push([x + (Math.random() - 0.5) * s * 1.6, y + Math.random() * s * 0.35, z + (Math.random() - 0.5) * s * 1.6, s * (0.55 + Math.random() * 0.6)]);
    };
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.sqrt(Math.random()) * 95;
      puff(CX + Math.cos(a) * r, HY - 8, CZ + Math.sin(a) * r, 4 + Math.random() * 3.5);
    }
    // el camino de nubes hasta el portón (por donde va la cámara)
    for (let z = CZ + 60; z > CZ - 30; z -= 4.5) puff(CX + (Math.random() - 0.5) * 5, HY - 6.2, z, 3.2, 3);
    // islitas que flotan más arriba (fuera del pasillo de la cámara)
    for (let i = 0; i < 14; i++) {
      const sx = Math.random() < 0.5 ? -1 : 1;
      puff(CX + sx * (16 + Math.random() * 50), HY + 14 + Math.random() * 26, CZ - 40 + Math.random() * 110, 2.5 + Math.random() * 3, 4);
    }
    const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), M.cloud, blobs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    blobs.forEach(([x, y, z, s], i) => cloud.setMatrixAt(i, m4.compose(tmpV.set(x, y, z), q, tmpW.set(s, s * 0.42, s))));
    cloud.frustumCulled = false;
    R.add(cloud);
    this.buildGate();
    this.buildSupremo();
    this.buildAngels();
  }

  // El Portón del Cielo Matero: dos columnas con un mate arriba, el arco de
  // oro con el cartel y las dos hojas de rejas que se abren.
  buildGate() {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(CX, HY - 2.2, GATE_Z);
    this.root.add(g);
    const prof = VM.PROFILES.calabaza;
    for (const sx of [-1, 1]) {
      const col = new THREE.Group();
      col.position.x = sx * 5.6;
      g.add(col);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), M.gold);
      base.position.y = 0.6;
      col.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 11, 20), M.marble);
      shaft.position.y = 6.7;
      col.add(shaft);
      for (const y of [1.6, 6.7, 11.8]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.16, 8, 28).rotateX(Math.PI / 2), M.gold);
        ring.position.y = y;
        col.add(ring);
      }
      // el capitel: un mate con su bombilla
      const mate = VM.lathe(prof, M.gourd, 24);
      mate.scale.setScalar(26);
      mate.position.y = 12.1;
      col.add(mate);
      const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), M.gold);
      bomb.position.set(0.35 * sx, 14.6, 0);
      bomb.rotation.z = -0.3 * sx;
      col.add(bomb);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.55, 14, 56, Math.PI), M.gold);
    arch.position.y = 12.9;
    g.add(arch);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), M.halo);
    halo.position.y = 19.4;
    g.add(halo);
    this.gateHalo = halo;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.6), new THREE.MeshBasicMaterial({ map: signTexture([['EL CIELO DE LOS MATES', 92]]), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    sign.position.set(0, 14.6, 0.7);
    g.add(sign);
    // el cartelito del costado (el récord se escribe al arrancar la escena)
    this.plaqueMat = new THREE.MeshBasicMaterial({ transparent: true, fog: false, toneMapped: false });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), this.plaqueMat);
    plaque.position.set(8.9, 3.4, 1.6);
    plaque.rotation.y = -0.45;
    g.add(plaque);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), M.gold);
    post.position.set(8.9, 1.2, 1.5);
    g.add(post);
    // las rejas: cada hoja gira en su columna
    this.doors = [];
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sx * 4.75, 0, 0);
      g.add(hinge);
      const leaf = new THREE.Group();
      leaf.position.x = -sx * 2.35;
      hinge.add(leaf);
      for (let i = 0; i < 7; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9, 8), M.gold);
        bar.position.set(-2.1 + i * 0.7, 4.5, 0);
        leaf.add(bar);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), M.gold);
        tip.position.set(-2.1 + i * 0.7, 9.2, 0);
        leaf.add(tip);
      }
      for (const y of [1.2, 4.6, 8.2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.16, 0.16), M.gold);
        rail.position.y = y;
        leaf.add(rail);
      }
      // una bombillita cruzada en cada hoja
      const medal = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.1, 8, 24), M.gold);
      medal.position.y = 5.8;
      leaf.add(medal);
      this.doors.push({ hinge, sx });
    }
  }

  // El Mate Supremo: una calabaza enorme con su yerba, la bombilla de oro, la
  // aureola y los rayos de sol atrás. Es el Mate Supremo de verdad
  // (weapons/Supremo.js): perla con vetas de oro vivo, la corona de puntas y
  // las seis reliquias de los easter eggs girando alrededor.
  buildSupremo() {
    const M = this.M;
    const g = new THREE.Group();
    g.position.copy(SUPREMO);
    this.root.add(g);
    const prof = VM.PROFILES.calabaza;
    const S = 150;
    const top = VM.topOf(prof);
    const mate = VM.lathe(prof, supremoBodyMaterial(), 40);
    mate.scale.setScalar(S);
    g.add(mate);
    const vir = new THREE.Mesh(new THREE.TorusGeometry(top.r * S + 0.1, 0.45, 12, 60).rotateX(Math.PI / 2), M.gold);
    vir.position.y = top.y * S;
    g.add(vir);
    // la corona de doce puntas de oro
    const spike = new THREE.ConeGeometry(0.42, 2.4, 6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = new THREE.Mesh(spike, M.gold);
      s.position.set(Math.cos(a) * (top.r * S + 0.2), top.y * S + 1.1, Math.sin(a) * (top.r * S + 0.2));
      s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      g.add(s);
    }
    // las seis reliquias en órbita (una por mapa) y su hilo de luz
    this.relicTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, 0, 0.18));
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.1, 6, 120).rotateX(Math.PI / 2), M.halo);
    orbit.quaternion.copy(this.relicTilt);
    orbit.position.y = 7.5;
    g.add(orbit);
    const gem = new THREE.IcosahedronGeometry(1.05, 0);
    this.relics = SIX.map((c) => {
      const r = new THREE.Group();
      r.add(new THREE.Mesh(gem, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), toneMapped: false, fog: false })));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures?.dot, color: new THREE.Color(c).multiplyScalar(0.9), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false, opacity: 0.55 }));
      glow.scale.setScalar(2.4);
      r.add(glow);
      g.add(r);
      return r;
    });
    const yerba = new THREE.Mesh(new THREE.CircleGeometry(top.r * S - 0.2, 40).rotateX(-Math.PI / 2), M.yerba);
    yerba.position.y = top.y * S - 0.5;
    g.add(yerba);
    // la bombilla: sale de la yerba, inclinada para la cámara
    const len = 14;
    const bomb = new THREE.Group();
    bomb.position.set(1.4, top.y * S - 1.5, 0.6);
    bomb.rotation.set(0.42, 0, -0.18);
    g.add(bomb);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 20).translate(0, len / 2, 0), M.gold);
    bomb.add(pipe);
    const filtro = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 12), M.gold);
    filtro.scale.y = 0.6;
    bomb.add(filtro);
    const pico = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 2.6, 20).translate(0, 1.3, 0), M.gold);
    pico.position.y = len;
    pico.rotation.x = 0.5;
    bomb.add(pico);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 8, 24).rotateX(Math.PI / 2), M.halo);
      r.position.y = 5 + i * 4;
      bomb.add(r);
    }
    // la punta: adonde se lo sorbe al final
    this.mouth = new THREE.Vector3(SUPREMO.x, SUPREMO.y + top.y * S - 1, SUPREMO.z);
    const tip = new THREE.Object3D();
    tip.position.set(0, len + 2.4, 1.3);
    bomb.add(tip);
    this.tip = tip;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.5, 12, 64).rotateX(Math.PI / 2), M.halo);
    halo.position.y = top.y * S + 9;
    g.add(halo);
    this.bigHalo = halo;
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshBasicMaterial({ map: raysTexture(), color: 0xffc860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3 }));
    rays.position.set(0, 9, -26);
    g.add(rays);
    this.rays = rays;
  }

  // Los mates con alitas (y el termo alado que ceba al Supremo).
  buildAngels() {
    const M = this.M;
    const prof = VM.PROFILES.calabaza;
    const wingGeo = new THREE.PlaneGeometry(1.5, 0.75).translate(0.75, 0, 0);
    const makeWings = (parent, y, s = 1) => {
      const ws = [];
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wingGeo, M.wing);
        w.scale.set(sx * s, s, s);
        w.position.set(sx * 0.35 * s, y, -0.1);
        parent.add(w);
        ws.push(w);
      }
      return ws;
    };
    this.angels = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const mate = VM.lathe(prof, M.gourd, 16);
      mate.scale.setScalar(11);
      mate.position.y = -0.55;
      g.add(mate);
      const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), M.gold);
      bomb.position.set(0.12, 0.7, 0);
      bomb.rotation.z = -0.35;
      g.add(bomb);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 24).rotateX(Math.PI / 2), M.halo);
      halo.position.y = 1.1;
      g.add(halo);
      const wings = makeWings(g, 0.1);
      this.root.add(g);
      // cada uno da vueltas a su manera; el 0 es el que se estrola contra la cámara
      this.angels.push({
        g,
        wings,
        r: 7 + Math.random() * 16,
        h: HY + 3 + Math.random() * 9,
        cz: GATE_Z - 6 + Math.random() * 20,
        speed: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5),
        ph: Math.random() * 6.28,
        flap: 8 + Math.random() * 5,
      });
    }
    // el termo con alas: vuela quieto al lado del Supremo, sirviendo
    const T = new THREE.Group();
    const termo = VM.lathe([[0, 0], [0.029, 0], [0.032, 0.005], [0.032, 0.196], [0.03, 0.204], [0.026, 0.224], [0.018, 0.236], [0.017, 0.246], [0, 0.262]], M.termo, 24);
    termo.scale.setScalar(12);
    termo.position.y = -1.5;
    T.add(termo);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 24).rotateX(Math.PI / 2), M.halo);
    halo.position.y = 2.2;
    T.add(halo);
    this.termoWings = makeWings(T, 0.3, 1.8);
    T.position.set(SUPREMO.x - 9, SUPREMO.y + 19, SUPREMO.z + 1);
    T.rotation.z = -1.05;
    this.root.add(T);
    this.termo = T;
    // el chorrito de agua (a 80°, claro) hasta la boca del Supremo
    const from = new THREE.Vector3(SUPREMO.x - 5.2, SUPREMO.y + 17.4, SUPREMO.z + 1);
    const to = new THREE.Vector3(SUPREMO.x - 2.5, SUPREMO.y + 14.4, SUPREMO.z + 0.5);
    const d = tmpV.subVectors(to, from);
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, d.length(), 10, 1, true), M.water);
    stream.position.copy(from).addScaledVector(d, 0.5);
    stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.root.add(stream);
    this.stream = stream;
  }

  // El cartelito con el récord de la partida.
  drawPlaque(round, team) {
    const old = this.plaqueMat.map;
    this.plaqueMat.map = signTexture(
      [
        ['Prohibido lavar la yerba', 44, '#ffe6a0'],
        ['Agua a 80°, siempre', 44, '#ffe6a0'],
        [`${team ? 'Llegaron' : 'Llegaste'} en la ronda ${round}`, 52, '#ffffff'],
      ],
      640,
      320,
    );
    this.plaqueMat.needsUpdate = true;
    old?.dispose();
  }

  // Arranca la escena (onDone: al terminar).
  play(onDone) {
    const g = this.g;
    this.done = onDone;
    this.t = 0;
    this.on = true;
    this.root.visible = true;
    this.said = 0;
    this.bonked = false;
    this.opened = false;
    this.slurped = false;
    this.start = g.camera.position.clone();
    this.lastCam = this.start.clone();
    this.startPitch = g.player.pitch;
    this.startYaw = g.player.yaw;
    this.drawPlaque(g.rounds.round, !!g.net);
    for (const d of this.doors) d.hinge.rotation.y = 0;
    const A = this.angels[0];
    A.bonk = null;
    // la pantalla: franjas, textos y el fogonazo blanco
    const el = document.createElement('div');
    el.className = 'mdu-fcine is-on mdu-fcine--mid mdu-cielo';
    el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><h2 class="mdu-cielo__title">El Cielo de los Mates</h2><p class="mdu-fcine__text"></p><b class="mdu-cielo__tonc">¡TONC!</b><i class="mdu-cielo__white"></i>';
    g.root.appendChild(el);
    this.el = el;
    this.text = el.querySelector('.mdu-fcine__text');
    this.title = el.querySelector('.mdu-cielo__title');
    this.tonc = el.querySelector('.mdu-cielo__tonc');
    this.white = el.querySelector('.mdu-cielo__white');
    g.hud.setBossBar?.(null);
    g.hud.show(false);
    if (g.weapons?.holder) g.weapons.holder.visible = false;
    if (g.weather?.rain) g.weather.rain.visible = false;
    this.choir(0, 5.5, [57, 61, 64, 69, 73]);
    if (this.ahh) g.audio.playBuffer(this.ahh, { gain: AHH.gain, reverb: AHH.reverb });
  }

  finish() {
    if (!this.on) return;
    this.on = false;
    this.el?.remove();
    this.el = null;
    const fn = this.done;
    this.done = null;
    fn?.();
  }

  // Si la partida terminó mientras tanto (el anfitrión ya ganó), se limpia.
  abort() {
    if (!this.on) return;
    this.on = false;
    this.done = null;
    this.el?.remove();
    this.el = null;
  }

  card(text) {
    const el = this.text;
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  // Cada cuadro (la llama Game en lugar de la cámara del jugador).
  update(dt) {
    if (!this.on) return false;
    const g = this.g;
    this.t += dt;
    const t = this.t;
    const cam = g.camera;
    // los textos
    while (this.said < CARDS.length && t >= CARDS[this.said][0]) this.card(CARDS[this.said++][1]);
    if (this.said >= 2) this.text.classList.toggle('is-on', t < CARDS[2][0] - 0.5 || t >= CARDS[2][0]);
    this.title.classList.toggle('is-on', t > TL.title[0] && t < TL.title[1]);
    // el fogonazo blanco: al subir, al llegar y al final
    const white = t < TL.up ? smooth(seg(t, 0.35, TL.up)) : t < TL.up + 1.2 ? 1 - smooth(seg(t, TL.up, TL.up + 1.05)) : smooth(seg(t, TL.slurp - 0.8, TL.slurp));
    this.white.style.opacity = white.toFixed(3);
    // lo que se mueve
    this.animate(dt, t);
    if (t < TL.up) {
      // sube despacio y después se dispara, mirando para arriba
      const k = seg(t, 0, TL.up);
      cam.position.set(this.start.x, this.start.y + k * k * 14, this.start.z);
      cam.rotation.set(this.startPitch + (1.25 - this.startPitch) * smooth(k), this.startYaw, 0, 'YXZ');
      if (Math.random() < 0.6) g.fx.sparkle(tmpV.set(this.start.x + (Math.random() - 0.5) * 2, this.start.y + k * k * 14 - 1, this.start.z + (Math.random() - 0.5) * 2), [1, 0.9, 0.55], 3, 0.8);
    } else if (t < TL.rise) {
      if (!this.harped) {
        this.harped = true;
        this.harp();
      }
      // sale de las nubes despacio, mirando alrededor
      const k = smooth(seg(t, TL.up, TL.rise));
      cam.position.set(CX + Math.sin(t * 0.5) * 1.2, HY - 9 + k * 12.5, CZ + 72 - k * 24);
      cam.lookAt(CX + Math.sin(t * 0.35) * 7 * (1 - k * 0.5), HY + 6 - (1 - k) * 4, GATE_Z);
    } else if (t < TL.glide) {
      // se acerca al portón
      const k = smooth(seg(t, TL.rise, TL.glide));
      cam.position.set(CX, HY + 3.5 - k * 0.3, CZ + 48 - k * 32);
      cam.lookAt(CX, HY + 5.5 - k * 1.5, GATE_Z - 10);
      if (t > TL.doors[0] && !this.opened) {
        this.opened = true;
        this.creak();
      }
    } else if (t < TL.thru) {
      // lo cruza y sube a ver al Mate Supremo
      const k = smooth(seg(t, TL.glide, TL.thru));
      cam.position.set(CX + Math.sin(k * Math.PI) * 2.5, HY + 3.2 + k * 12.8, CZ + 16 - k * 22);
      cam.lookAt(tmpV.lerpVectors(tmpW.set(CX, HY + 4, GATE_Z - 10), this.mouth, k));
      if (t > CARDS[2][0] && !this.chord2) {
        this.chord2 = true;
        this.choir(0, 3.4, [62, 66, 69, 74, 78]);
      }
    } else if (t < TL.hold) {
      // se queda mirándolo, dando la vuelta despacito (y la vista se va a la bombilla)
      const u = seg(t, TL.thru, TL.hold);
      cam.position.set(CX + Math.sin(u * 0.9) * 2.2, HY + 16 + u * 0.8, CZ - 6 + u * 0.4);
      cam.lookAt(tmpV.lerpVectors(this.mouth, this.tipWorld(), smooth(u)));
    } else {
      // el sorbo final: la bombilla se lo lleva
      if (!this.slurped) {
        this.slurped = true;
        this.slurp();
        this.from = this.lastCam.clone();
      }
      const k = seg(t, TL.hold, TL.slurp);
      const tip = this.tipWorld();
      cam.position.lerpVectors(this.from, tip, k * k * k);
      cam.lookAt(tip);
      g.fx.addShake(dt * 0.6 * k);
    }
    // el que se estrola contra la cámara    // el que se estrola contra la cámara
    this.bonk(t, cam);
    this.lastCam.copy(cam.position);
    if (t >= TL.end) this.finish();
    return true;
  }

  tipWorld() {
    this.root.updateMatrixWorld();
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  animate(dt, t) {
    this.gateHalo.rotation.y += dt * 0.8;
    // el Mate Supremo: las vetas se mueven y las reliquias giran
    supremoTime(this.g.time);
    this.relics.forEach((r, i) => {
      const a = t * 0.35 + (i / 6) * Math.PI * 2;
      r.position.set(Math.cos(a) * 10.5, Math.sin(t * 1.3 + i) * 0.4, Math.sin(a) * 10.5).applyQuaternion(this.relicTilt);
      r.position.y += 7.5;
      r.rotation.set(t * 0.7 + i, t * 1.1 + i, 0);
    });
    this.bigHalo.rotation.z = Math.sin(t * 0.7) * 0.06;
    this.bigHalo.position.y += Math.sin(t * 1.4) * dt * 0.4;
    this.rays.material.rotation = 0;
    this.rays.rotation.z += dt * 0.08;
    // las rejas se abren
    const o = smooth(seg(t, TL.doors[0], TL.doors[1]));
    for (const d of this.doors) d.hinge.rotation.y = d.sx * o * 1.75;
    // los angelitos
    for (let i = 0; i < this.angels.length; i++) {
      const A = this.angels[i];
      if (i === 0 && A.bonk) continue;
      const a = A.ph + t * A.speed;
      A.g.position.set(CX + Math.cos(a) * A.r, A.h + Math.sin(t * 1.3 + A.ph) * 0.6, A.cz + Math.sin(a) * A.r * 0.6);
      A.g.rotation.y = -a + (A.speed > 0 ? 0 : Math.PI);
      const f = Math.sin(t * A.flap + A.ph) * 0.7;
      A.wings[0].rotation.y = f;
      A.wings[1].rotation.y = -f;
    }
    const tf = Math.sin(t * 7) * 0.5;
    this.termoWings[0].rotation.y = tf;
    this.termoWings[1].rotation.y = -tf;
    this.termo.position.y += Math.sin(t * 2) * dt * 0.3;
    this.stream.material.opacity = 0.6 + Math.sin(t * 20) * 0.12;
    // chispas de oro alrededor de la cámara
    const g = this.g;
    if (t > TL.up && Math.random() < 0.7) {
      const c = g.camera.position;
      g.fx.add.spawn(c.x + (Math.random() - 0.5) * 14, c.y + (Math.random() - 0.5) * 6, c.z - 3 - Math.random() * 12, 0, 0.3 + Math.random() * 0.4, 0, { color: [1, 0.88, 0.5], size: 0.12, size1: 0, life: 1.6 });
    }
  }

  // El mate 0 viene derecho a la cámara y se la pone (TL.bonk): ¡TONC!
  bonk(t, cam) {
    const A = this.angels[0];
    if (t < TL.bonk[0]) return;
    if (!A.bonk) A.bonk = { from: A.g.position.clone(), hit: false };
    const B = A.bonk;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const face = tmpW.copy(cam.position).addScaledVector(fwd, 0.9);
    const f = Math.sin(t * 16) * 0.8;
    A.wings[0].rotation.y = f;
    A.wings[1].rotation.y = -f;
    if (t < TL.bonk[1]) {
      const k = seg(t, TL.bonk[0], TL.bonk[1]);
      A.g.position.lerpVectors(B.from, face, k * k);
      A.g.lookAt(cam.position);
      return;
    }
    if (!B.hit) {
      B.hit = true;
      B.at = face.clone();
      B.vel = new THREE.Vector3(2.5, 3, -2);
      this.g.fx.addShake(0.8);
      this.tonc.classList.add('is-on');
      this.sndBonk();
      this.g.fx.sparkle(face, [1, 0.95, 0.6], 16, 0.5);
    }
    // rebota, gira y se cae entre las nubes
    const dt = 1 / 60;
    B.vel.y -= 9 * dt;
    B.at.addScaledVector(B.vel, dt);
    A.g.position.copy(B.at);
    A.g.rotation.x += 0.25;
    A.g.rotation.z += 0.18;
    if (t > TL.bonk[1] + 1) this.tonc.classList.remove('is-on');
  }

  // ---------------- lo que se escucha ----------------
  choir(at, dur, notes) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.55, reverb: 0.9, bus: A.music });
    const t = A.now + at;
    notes.forEach((n, i) => {
      A.tone(o, { t: t + i * 0.06, dur, freq: midi(n), gain: 0.07, attack: 0.9, release: 1.5, detune: i % 2 ? 7 : -7 });
      A.tone(o, { t: t + i * 0.06, dur, type: 'triangle', freq: midi(n + 12), gain: 0.02, attack: 1.2, release: 1.5 });
    });
  }

  harp() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.5, reverb: 0.8, bus: A.music });
    const scale = [69, 71, 73, 76, 78, 81, 83, 85, 88, 90, 93, 95];
    scale.forEach((n, i) => A.tone(o, { t: A.now + i * 0.065, dur: 1.1, type: 'triangle', freq: midi(n), gain: 0.06, attack: 0.003 }));
  }

  creak() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.6, reverb: 0.7 });
    A.noise(o, { dur: 1.2, type: 'bandpass', freq: 380, freqEnd: 900, q: 9, gain: 0.25, attack: 0.1 });
    [81, 85, 88, 93].forEach((n, i) => A.tone(o, { t: A.now + 0.5 + i * 0.12, dur: 1.6, freq: midi(n), gain: 0.05, attack: 0.004 }));
  }

  sndBonk() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.9, reverb: 0.2 });
    A.tone(o, { dur: 0.22, freq: 420, freqEnd: 150, gain: 0.5, attack: 0.002 });
    A.tone(o, { dur: 0.35, type: 'triangle', freq: 900, freqEnd: 600, gain: 0.12, attack: 0.002 });
    A.noise(o, { dur: 0.05, type: 'bandpass', freq: 2400, q: 2, gain: 0.4 });
    // pajaritos que le dan vueltas a la cabeza
    for (let i = 0; i < 6; i++) A.tone(o, { t: A.now + 0.25 + i * 0.13, dur: 0.1, freq: 2600 + (i % 2) * 500, freqEnd: 3200, gain: 0.03 });
  }

  slurp() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 1, reverb: 0.5 });
    A.noise(o, { dur: 1.8, type: 'bandpass', freq: 300, freqEnd: 2800, q: 1.4, gain: 0.6, attack: 0.1 });
    for (let s = 0; s < 1.6; s += 0.08 + Math.random() * 0.05) A.noise(o, { t: A.now + s, dur: 0.06, type: 'bandpass', freq: 250 + s * 800, q: 6, gain: 0.55 });
    A.tone(o, { dur: 1.9, freq: 80, freqEnd: 420, gain: 0.16, attack: 0.2 });
    // y al final, un "ahhh" de satisfacción celestial
    this.choir(1.8, 1.6, [69, 73, 76, 81]);
  }

  dispose() {
    this.abort();
    this.root.removeFromParent();
  }
}
