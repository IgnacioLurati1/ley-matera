import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Arena from './Arena';
import { mesh, cylGeo, boxGeo } from './props';
import { toTexture } from '../core/textures';
import { EE } from '../config/map';
import { maxAlive } from '../config/rules';

// El Infierno Matero: la caverna adonde caen los que subieron la escalera
// divina. Queda lejos de la torre (al este), encerrada en roca, con ríos de
// mate cocido hirviendo, calabazas gigantes prendidas fuego y un trono de oro.
// Ahí espera la Voz, que resultó ser un hombre: Francisco, el yerbatero que
// subió a la torre hace cien años buscando el mate que no se termina nunca.
// La pelea va por etapas (las decide el anfitrión y las avisa a todos):
//  p1. La Voz: bolas de yerba de oro, sus muertos que lo protegen y golpes al
//      piso que largan una onda dorada (hay que saltarla).
//  r1. Con el 70% sube flotando al trono y queda intocable: cuatro calabazas
//      doradas le dan fuerza. Rompiéndolas a tiros se viene abajo, atontado.
//  p2. Toma del mate supremo: brilla de oro, va más rápido, rayos, remolino
//      que arrastra, bichos de todos los mapas, ondas dobles... y el mate
//      cocido sube desde la orilla (quema).
//  r2. Con el 35% flota en el medio con las ánimas de la torre dando vueltas
//      (hay que liberarlas a tiros) mientras el rayo de la bombilla barre el
//      piso (hay que saltarlo).
//  p3. Francisco, el Eterno: desaparece y aparece al lado de alguno, golpea,
//      todo más rápido. Hasta que cae.

const RITUAL1 = 0.7;
const RITUAL2 = 0.35;
// de los seis braseros, los cuatro que le dan fuerza en el primer ritual
const GOURDS = [0, 2, 3, 5];
const WISPS = 4;
const WAVE_SPEED = 8.5;
const WAVE_DMG = 30;
const BEAM_SPEED = 0.62;
const BEAM_WARM = 2.6;
const BEAM_DMG = 40;
// hasta dónde entra el mate cocido desde la orilla
const FLOOD_IN = 4.2;
const FLOOD_TICK = 0.35;
const FLOOD_DMG = 8;
const WARD_MAX = 30;
const GOLD = [1, 0.82, 0.35];
const NAMES = { p1: 'Francisco', r1: 'Francisco', p2: 'Francisco, el del Mate Supremo', r2: 'Francisco, el del Mate Supremo', p3: 'Francisco, el Eterno' };
const SPEEDS = { p1: 3.4, r1: 3.4, p2: 4.4, r2: 4.4, p3: 5.2 };
// el color de las luces de la caverna en cada etapa
const LIGHTS = {
  p1: [0xff4a14, 0xff4a14, 0xffc050],
  r1: [0xffa020, 0xff6a14, 0xffd060],
  p2: [0xffb030, 0xff6a14, 0xffe080],
  r2: [0x7ab8ff, 0xff6a14, 0xffd060],
  p3: [0xff2a0a, 0xc81a0a, 0xffa030],
};

// El mate cocido hirviendo (el río de la orilla y lo que sube en la p2): el
// mismo código para los dos, así comparten el programa.
const BOIL_VS = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const BOIL_FS = `
  varying vec2 vP; uniform float uInner, uTime, uK;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
  void main(){
    float d = length(vP);
    if (d < uInner) discard;
    float n = vn(vP * 1.3 + vec2(uTime * 0.4, -uTime * 0.3)) * 0.6 + vn(vP * 3.1 - uTime * 0.7) * 0.4;
    float bub = smoothstep(0.74, 0.92, vn(vP * 5.0 + uTime * 1.6));
    float edge = smoothstep(uInner + 0.6, uInner, d);
    vec3 col = mix(vec3(0.14, 0.05, 0.01), vec3(0.66, 0.26, 0.05), n) + vec3(0.85, 0.42, 0.12) * (bub * 0.5 + edge * 0.45);
    gl_FragColor = vec4(col, uK);
  }`;
const boilMat = (inner, k) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uInner: { value: inner }, uTime: { value: 0 }, uK: { value: k } }, vertexShader: BOIL_VS, fragmentShader: BOIL_FS });

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export default class Infierno extends Arena {
  constructor(game) {
    super(game, { ...EE.arena });
  }

  setup() {
    super.setup();
    this.name = 'El Infierno Matero';
    this.sub = 'Donde la yerba arde para siempre';
    this.bossName = 'Francisco';
    this.bossHp = 260000;
    // los muertos que lo protegen (entre ritual y ritual)
    this.wards = [0.86, 0.52, 0.18];
    this.speeds = [3.4, 4.4, 5.2];
    this.rainColor = 0xffc040;
    this.fireColor = 0xffc860;
    this.rainBoom = [1, 0.8, 0.35];
    this.rainDmg = 55;
    this.weatherName = 'blood';
    this.lines = {
      greet: ['francisco', 'Me llamo Francisco. Hace cien años subí esa torre buscando el mate que no se termina nunca... y lo encontré. No se lo voy a dar a nadie.'],
      rain: '¡Caen rayos! Salí de los círculos dorados.',
      ward: 'Los muertos de Francisco lo protegen: ¡liquidalos para que se le caiga el escudo!',
      unward: '¡Se le cayó la protección! Ahora, dale.',
      summon: 'Francisco llama a sus muertos...',
    };
    this.stage = 'p1';
  }

  bossOpts() {
    return { at: new THREE.Vector3(this.A.x, this.A.y || 0, this.A.z - 4), mandinga: true, kind: 'francisco', hp: this.bossHp };
  }

  build() {
    const g = this.g;
    const M = g.world.M;
    const { x, z, r } = this.A;
    const y = this.A.y || 0;
    // piso de roca volcánica con grietas de brasa
    const lava = lavaTextures();
    const floorMat = new THREE.MeshStandardMaterial({ map: lava.map, emissiveMap: lava.glow, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r + 1.5, 48).rotateX(-Math.PI / 2), floorMat);
    floor.position.set(x, y + 0.01, z);
    floor.receiveShadow = true;
    this.root.add(floor);
    this.lavaMat = floorMat;
    // paredes y bóveda de la caverna (no se ve nada de afuera)
    const rock = new THREE.MeshStandardMaterial({ map: g.textures.concrete, bumpMap: g.textures.concrete, bumpScale: 3, color: 0x5a2a20, roughness: 0.95, side: THREE.DoubleSide });
    const wallGeo = new THREE.CylinderGeometry(r + 1.5, r + 3, 12, 48, 4, true);
    const pos = wallGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + Math.sin(a * 7 + pos.getY(i)) * 0.06 + Math.sin(a * 17 + pos.getY(i) * 2) * 0.03;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    wallGeo.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeo, rock);
    wall.position.set(x, y + 6, z);
    this.root.add(wall);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r + 3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), rock);
    dome.position.set(x, y + 12, z);
    dome.scale.y = 0.5;
    this.root.add(dome);
    this.rockMat = rock;
    // estalactitas
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * (r - 1);
      const h = 1 + Math.random() * 2.5;
      this.root.add(mesh(new THREE.ConeGeometry(0.25 + Math.random() * 0.3, h, 6), rock, x + Math.cos(a) * d, y + 14 - h / 2 - Math.random(), z + Math.sin(a) * d, Math.PI, 0, 0));
    }
    // el río de mate cocido hirviendo alrededor, hasta el pie de la pared
    const riverMat = boilMat(r - 0.2, 1);
    const river = new THREE.Mesh(new THREE.RingGeometry(r - 0.2, r + 3.4, 72), riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(x, y + 0.03, z);
    this.root.add(river);
    this.riverMat = riverMat;
    // calabazas gigantes prendidas fuego (los braseros)
    this.braziers = [];
    this.gourds = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const bx = x + Math.cos(a) * (r - 1.8);
      const bz = z + Math.sin(a) * (r - 1.8);
      const gourd = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.5, 0.05], [0.8, 0.5], [0.75, 1.0], [0.45, 1.35], [0.4, 1.45]].map(([rr, yy]) => new THREE.Vector2(rr, yy)), 16), M.gourd || M.wood);
      gourd.position.set(bx, y, bz);
      this.root.add(gourd);
      const top = mesh(cylGeo(0.36, 0.36, 0.05, 12), M.fireGlow, bx, y + 1.42, bz);
      this.root.add(top);
      // la bombilla gigante, clavada
      const straw = mesh(cylGeo(0.05, 0.05, 1.6, 6), M.silver || M.metal, bx + 0.2, y + 1.9, bz, 0, 0, -0.3);
      this.root.add(straw);
      const fire = new THREE.Vector3(bx, y + 1.5, bz);
      this.braziers.push(fire);
      this.gourds.push({ i, body: gourd, top, straw, fire, pos: new THREE.Vector3(bx, y + 0.75, bz), hits: 0, broken: false });
      g.world.addBox([bx - 0.8, y, bz - 0.8, bx + 0.8, y + 1.5, bz + 0.8], { kind: 'prop' });
    }
    // el trono de Francisco: una calabaza de oro partida al medio
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc84a, roughness: 0.25, metalness: 1, emissive: 0x4a2a00, emissiveIntensity: 0.5 });
    const tx = x;
    const tz = z - r + 2.2;
    const throne = this.throneModel(rock, gold);
    throne.position.set(tx, y, tz);
    this.root.add(throne);
    g.world.addBox([tx - 1.3, y, tz - 1.2, tx + 1.3, y + 1.6, tz + 0.9], { kind: 'prop' });
    // dónde flota en cada ritual y dónde cae después
    this.floatAt = {
      r1: { pos: new THREE.Vector3(tx, y + 3.4, tz - 0.1), land: new THREE.Vector3(tx, y, tz + 2.6) },
      r2: { pos: new THREE.Vector3(x, y + 4.4, z), land: new THREE.Vector3(x, y, z) },
    };
    // luces del infierno
    this.lights = [0, 1, 2].map((k) => {
      const l = new THREE.PointLight(k === 2 ? 0xffc050 : 0xff4a14, 0, 32, 1.5);
      const a = (k / 3) * Math.PI * 2;
      l.position.set(x + Math.cos(a) * 5, y + 5, z + Math.sin(a) * 5);
      g.scene.add(l);
      return l;
    });
    // el escudo y los círculos de los rayos (como en la Salamanca)
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.buildFight();
    this.decor(rock, gold);
    this.root.updateMatrixWorld(true);
  }

  // El trono de Francisco: un mate de oro gigante sobre dos escalones de roca,
  // cebado (la yerba en montañita hasta la boca) y con la bombilla de cetro
  // clavada en el medio de la yerba. Antes estaba partido adelante y se veía
  // la yerba cortada y el pie de la bombilla, que salía por la pared.
  throneModel(rock, gold) {
    const G = new THREE.Group();
    G.add(mesh(boxGeo(2.7, 0.3, 2.1), rock, 0, 0.15, -0.1));
    G.add(mesh(boxGeo(2.2, 0.25, 1.7), rock, 0, 0.42, -0.2));
    // la calabaza entera: la boca se dobla para adentro y baja hasta la yerba
    const prof = [[0.5, 0], [1.0, 0.16], [1.28, 0.6], [1.3, 1.15], [1.08, 1.62], [0.74, 1.95], [0.62, 2.08], [0.66, 2.2], [0.61, 2.24], [0.56, 2.12]];
    const SEGS = 48;
    const body = new THREE.LatheGeometry(prof.map(([rr, yy]) => new THREE.Vector2(rr, yy)), SEGS);
    // gajos apenas marcados en la panza (el oro brilla distinto en cada uno)
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const py = pos.getY(i);
      const k = 1 + 0.022 * Math.cos(Math.atan2(pz, px) * 12) * Math.sin(Math.PI * Math.min(1, py / 1.95));
      pos.setX(i, px * k);
      pos.setZ(i, pz * k);
    }
    body.computeVertexNormals();
    // la costura del torno: la primera y la última columna con la misma normal
    const nor = body.attributes.normal;
    const P = prof.length;
    for (let j = 0; j < P; j++) {
      const i0 = j;
      const i1 = SEGS * P + j;
      const nx = nor.getX(i0) + nor.getX(i1);
      const ny = nor.getY(i0) + nor.getY(i1);
      const nz = nor.getZ(i0) + nor.getZ(i1);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i0, nx / l, ny / l, nz / l);
      nor.setXYZ(i1, nx / l, ny / l, nz / l);
    }
    const cup = new THREE.Group();
    const satin = gold.clone();
    satin.roughness = 0.42;
    // (y casi sin reflejo de pantalla: las calaveras salían como manchas rayadas)
    satin.userData.reflRough = 0.85;
    cup.add(new THREE.Mesh(body, satin));
    // virolas: la de la boca, dos en la panza y el pie
    for (const [yy, rr, th] of [[2.2, 0.68, 0.04], [1.15, 1.35, 0.035], [0.6, 1.33, 0.035], [0.05, 0.62, 0.05]]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(rr, th, 8, 48), gold);
      band.rotation.x = -Math.PI / 2;
      band.position.y = yy;
      cup.add(band);
    }
    // la yerba en montañita, un poco más alta del lado de atrás (como cuando se ceba)
    const yerba = new THREE.MeshStandardMaterial({ map: this.g.textures.yerba || null, color: 0x9aa860, roughness: 1 });
    const mound = new THREE.LatheGeometry([[0.59, 2.13], [0.52, 2.22], [0.38, 2.3], [0.18, 2.35], [0.001, 2.36]].map(([rr, yy]) => new THREE.Vector2(rr, yy)), 32);
    const hill = mesh(mound, yerba, 0, 0, 0);
    hill.rotation.x = -0.08;
    cup.add(hill);
    cup.position.set(0, 0.55, -0.3);
    G.add(cup);
    // la bombilla de cetro: sale del medio de la yerba, torcida hacia un costado
    // y para atrás (no le pasa por el cuerpo a Francisco cuando flota arriba)
    const L = 1.55;
    const bomb = new THREE.Group();
    bomb.add(mesh(cylGeo(0.07, 0.07, L + 0.35, 12), gold, 0, (L - 0.35) / 2, 0));
    // el anillo de la bombilla y el pico doblado
    bomb.add(mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 16).rotateX(Math.PI / 2), gold, 0, L - 0.28, 0));
    bomb.add(mesh(cylGeo(0.07, 0.05, 0.45, 12), gold, 0.16, L + 0.13, 0, 0, 0, -0.9));
    bomb.position.set(0, 0.55 + 2.33, -0.3);
    bomb.rotation.set(-0.18, 0, -0.42);
    G.add(bomb);
    // calaveras a los pies
    const bone = new THREE.MeshStandardMaterial({ color: 0xc8bca0, roughness: 0.7 });
    const dark = this.g.world.M.black;
    for (let i = 0; i < 6; i++) {
      const sk = new THREE.Group();
      sk.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), bone, 0, 0.12, 0));
      sk.add(mesh(boxGeo(0.14, 0.07, 0.1), bone, 0, 0.03, 0.05));
      for (const s of [-1, 1]) sk.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), dark, s * 0.045, 0.13, 0.11));
      const a = -1.1 + i * 0.44;
      sk.position.set(Math.sin(a) * 1.45, i % 2 ? 0.3 : 0.55, 0.75 + Math.cos(a) * 0.2);
      sk.rotation.set(0, a * 0.5 + (i % 3) * 0.3, (i % 2) * 0.3);
      G.add(sk);
    }
    return G;
  }

  // La caverna: estalagmitas que salen del mate cocido, bombillas gigantes
  // clavadas en la orilla, montones de yerba quemada y cadenas del techo.
  decor(rock, gold) {
    const { x, z, r } = this.A;
    const y = this.A.y || 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const rocks = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + rnd(-0.1, 0.1);
      const d = r + rnd(1.9, 3.1);
      const h = rnd(1.2, 4.2);
      rocks.push(new THREE.ConeGeometry(rnd(0.3, 0.7), h, 7).translate(x + Math.cos(a) * d, y + h / 2 - 0.1, z + Math.sin(a) * d));
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = r + rnd(2.2, 3.2);
      rocks.push(new THREE.DodecahedronGeometry(rnd(0.35, 0.8), 0).scale(1, 0.6, 1).translate(x + Math.cos(a) * d, y + 0.15, z + Math.sin(a) * d));
    }
    this.root.add(new THREE.Mesh(mergeGeometries(rocks.map((q) => q.toNonIndexed())), rock));
    // bombillas de los mates que se tragó el infierno, clavadas torcidas
    const silver = [];
    const tips = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.55;
      const d = r + rnd(0.9, 1.5);
      const h = rnd(2.6, 4.2);
      const lean = rnd(-0.35, 0.35);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * d, y + h / 2 - 0.3, z + Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, a, rnd(0.1, 0.3) * (i % 2 ? 1 : -1))), new THREE.Vector3(1, 1, 1));
      silver.push(new THREE.CylinderGeometry(0.06, 0.06, h, 8).applyMatrix4(m));
      tips.push(new THREE.CylinderGeometry(0.06, 0.045, 0.35, 8).translate(0, h / 2 + 0.17, 0).rotateZ(-0.6).applyMatrix4(m));
    }
    this.root.add(new THREE.Mesh(mergeGeometries(silver.map((q) => q.toNonIndexed())), this.g.world.M.silver || gold));
    this.root.add(new THREE.Mesh(mergeGeometries(tips.map((q) => q.toNonIndexed())), gold));
    // montones de yerba quemada contra la pared
    const heaps = [];
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = r + rnd(2.4, 3.2);
      heaps.push(new THREE.SphereGeometry(rnd(0.7, 1.3), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.5, 1).translate(x + Math.cos(a) * d, y, z + Math.sin(a) * d));
    }
    this.root.add(new THREE.Mesh(mergeGeometries(heaps.map((q) => q.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x1e2210, roughness: 1 })));
    // cadenas que cuelgan de la bóveda
    const links = [];
    for (let c = 0; c < 8; c++) {
      const a = (c / 8) * Math.PI * 2 + 0.2;
      const d = r - rnd(1, 4);
      const n = Math.floor(rnd(14, 26));
      for (let k = 0; k < n; k++) {
        links.push(new THREE.TorusGeometry(0.1, 0.025, 4, 8).rotateY(k % 2 ? Math.PI / 2 : 0).translate(x + Math.cos(a) * d, y + 13.5 - k * 0.17, z + Math.sin(a) * d));
      }
      // y un gancho al final
      links.push(new THREE.TorusGeometry(0.16, 0.03, 5, 10, Math.PI * 1.3).rotateZ(Math.PI).translate(x + Math.cos(a) * d, y + 13.5 - n * 0.17 - 0.12, z + Math.sin(a) * d));
    }
    const chains = new THREE.Mesh(mergeGeometries(links.map((q) => q.toNonIndexed())), this.g.world.M.iron);
    // gira apenas alrededor del centro (se mecen)
    chains.position.set(x, 0, z);
    chains.geometry.translate(-x, 0, -z);
    this.root.add(chains);
    this.chainsDecor = chains;
  }

  // Lo de las etapas: los hilos de oro de las calabazas, las ánimas, el rayo
  // de la bombilla, el mate cocido que sube y las ondas de los golpes.
  buildFight() {
    const g = this.g;
    const { x, z, r } = this.A;
    const y = this.A.y || 0;
    const linkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const linkGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.links = GOURDS.map(() => {
      const m = new THREE.Mesh(linkGeo, linkMat);
      m.visible = false;
      this.root.add(m);
      return m;
    });
    // el hilo que baja de Francisco al piso en el segundo ritual (de ahí sale el rayo)
    this.stem = new THREE.Mesh(linkGeo, linkMat);
    this.stem.visible = false;
    this.root.add(this.stem);
    this.gourdGlow = GOURDS.map((gi) => {
      const s = glowSprite(g, 0xffc040, 2.4);
      s.position.copy(this.gourds[gi].fire);
      s.visible = false;
      this.root.add(s);
      return s;
    });
    // las ánimas de la torre
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8f0ff).multiplyScalar(2), toneMapped: false });
    const coreGeo = new THREE.SphereGeometry(0.17, 10, 8);
    this.wisps = [];
    for (let i = 0; i < WISPS; i++) {
      const grp = new THREE.Group();
      const halo = glowSprite(g, 0x9ad8ff, 1.7);
      grp.add(halo, new THREE.Mesh(coreGeo, coreMat));
      grp.visible = false;
      this.root.add(grp);
      this.wisps.push({ grp, halo, hits: 0, free: false, up: 0 });
    }
    // el rayo de la bombilla: dos brazos de oro que barren el piso desde el medio
    const beamGeo = new THREE.BoxGeometry(r, 0.18, 0.14).translate(r / 2 + 0.4, 0, 0);
    this.sweepMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd060).multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.sweep = new THREE.Group();
    this.sweep.position.set(x, y + 0.34, z);
    for (const s of [0, Math.PI]) {
      const m = new THREE.Mesh(beamGeo, this.sweepMat);
      m.rotation.y = s;
      this.sweep.add(m);
    }
    this.sweep.visible = false;
    this.root.add(this.sweep);
    // el mate cocido que sube desde la orilla: hierve, con espuma en el borde
    this.floodMat = boilMat(r + 2, 0);
    const flood = new THREE.Mesh(new THREE.CircleGeometry(r + 1.6, 72), this.floodMat);
    flood.rotation.x = -Math.PI / 2;
    flood.position.set(x, y + 0.05, z);
    flood.visible = false;
    this.root.add(flood);
    this.flood = flood;
    // la onda del golpe: un anillo bajo que se abre
    this.waveGeo = new THREE.CylinderGeometry(1, 1, 0.6, 72, 1, true).translate(0, 0.3, 0);
    this.waves = [];
  }

  start() {
    const g = this.g;
    super.start();
    this.stage = 'p1';
    this.bossName = NAMES.p1;
    this.phase2 = false;
    this.rT = 0;
    this.pullT = 0;
    this.pullCd = 9;
    this.specialT = 12;
    this.slamCd = 7;
    this.blinkCd = 6;
    this.glowK = 0;
    this.floodK = 0;
    this.floodGoal = 0;
    this.floodT = 0;
    this.sweepA = 0;
    this.sweepCd = 0;
    this.hitSyncT = 0;
    this.said = {};
    this.need = 1;
    for (const G of this.gourds) this.restoreGourd(G);
    this.braziers = this.gourds.map((G) => G.fire);
    for (const w of this.wisps) {
      w.hits = 0;
      w.free = false;
      w.up = 0;
      w.grp.visible = false;
    }
    for (const w of this.waves) w.m.removeFromParent();
    this.waves = [];
    g.player.airTop = g.player.pos.y;
    g.player.guardT = g.time + 3;
    if (!g.net?.guest) {
      g.activateZone('INF');
      // Fierro no puede entrar, pero se lo escucha
      g.later(9, () => this.active && this.phase === 'fight' && g.say('fierro', '¡Muchachos! No puedo bajar, pero los escucho. ¡Denle, que no está solo el que pelea con amigos!', 'npc'));
    }
  }

  // ---------------- red ----------------
  send(m) {
    if (this.g.net?.host) this.g.net.event('pee', { inf: m });
  }

  // Lo que avisa el anfitrión (lo recibe el invitado por TowerEgg).
  onNet(m) {
    if (m.st) this.setStage(m.st, m.n);
    if (m.sa !== undefined && this.stage === 'r2') this.sweepA = m.sa;
    if (m.h) m.h.forEach((n, i) => this.applyGourd(i, n));
    if (m.wh) m.wh.forEach((n, i) => this.applyWisp(i, n));
    if (m.w) this.spawnWave(m.w[0], m.w[1]);
    if (m.bl) this.blinkFx(...m.bl);
    if (m.land) this.landFx(m.land[0], m.land[1]);
  }

  // Un invitado le pegó a una calabaza o a un ánima.
  onGuestHit(m) {
    this.applyHit(m.k, m.i | 0, Math.max(1, Math.min(8, m.n | 0)));
  }

  // ---------------- etapas ----------------
  setStage(st, need) {
    if (this.stage === st) return;
    this.stage = st;
    this.bossName = NAMES[st];
    this.rT = 0;
    if (need) this.need = need;
    if (st === 'r1') for (const gi of GOURDS) this.gourds[gi].hits = 0;
    if (st === 'r2') {
      this.sweepA = Math.random() * Math.PI * 2;
      for (const w of this.wisps) {
        w.hits = 0;
        w.free = false;
        w.up = 0;
      }
    }
    // desde que toma del mate supremo: rayos más grandes y rápidos, y el mate
    // cocido sube desde la orilla (y ya no baja)
    if (st === 'p2' || st === 'r2' || st === 'p3') {
      this.phase2 = true;
      this.floodGoal = 1;
      this.fireSpeed = 24;
      this.rainDelay = 1.2;
      this.rainR = st === 'p3' ? 2.5 : 2.2;
    }
  }

  // Lo que le queda por hacer a cada uno (lo muestra el cartel del objetivo).
  // Corto: { main, sub, count } (lo arma TowerEgg.setObjective).
  objective() {
    if (!this.active || this.phase === 'won') return null;
    const left = (list) => list.filter(Boolean).length;
    switch (this.stage) {
      case 'r1':
        return { main: 'Rompé las calabazas doradas', sub: 'Le dan fuerza a Francisco, que flota intocable', count: `Quedan ${left(GOURDS.map((gi) => !this.gourds[gi].broken))}` };
      case 'p2':
        return { main: 'Bajale la vida a Francisco', sub: 'No pises la orilla: el mate cocido quema' };
      case 'r2':
        return { main: 'Liberá a tiros las ánimas', sub: 'Saltá el rayo de la bombilla cuando pase', count: `Quedan ${left(this.wisps.map((w) => !w.free))}` };
      case 'p3':
        return { main: 'Terminá a Francisco, el Eterno', sub: 'Saltá las ondas cuando golpea el piso' };
      default:
        return { main: 'Bajale la vida a Francisco', sub: 'Saltá la onda dorada cuando golpea el piso' };
    }
  }

  // El anfitrión: sube a flotar y queda intocable.
  startRitual(st) {
    const g = this.g;
    const b = this.boss;
    const players = g.rounds?.players || 1;
    const need = st === 'r1' ? 24 + 10 * (players - 1) : 12 + 5 * (players - 1);
    const F = this.floatAt[st];
    this.blinkFx(b.pos.x, b.pos.z, F.pos.x, F.pos.z);
    this.setStage(st, need);
    this.send({ st, n: need });
    g.zombies.setState(b, 'fall');
    b.pos.copy(F.pos);
    b.baseY = this.A.y || 0;
    // el escudo no se cae solo mientras dure el ritual
    this.waveUntil = Infinity;
    this.wardMax = Infinity;
    this.setWard(true);
    this.ritFireT = 2.5;
    this.ritRainT = 6;
    this.spawnT = 1.2;
    g.post?.flash(0.9);
    g.audio.bossArrive();
    g.fx.addShake(0.4);
    if (st === 'r1') {
      g.say('francisco', '¿Me quieren bajar? Mientras ardan las calabazas del Infierno, nadie me puede tocar.', 'boss');
      g.later(5.5, () => g.say('fierro', '¡Las calabazas doradas, paisanos! Rómpanlas a tiros y se viene abajo.', 'npc'));
    } else {
      g.say('francisco', 'Cien años juntando almas en esa torre... ¡Ahora me protegen a mí!', 'boss');
      g.later(5, () => g.say('fierro', 'Las ánimas de los que no llegaron arriba. ¡Libérenlas a tiros! Y el rayo de la bombilla, sáltenlo.', 'npc'));
    }
  }

  // Rotas las calabazas (o libres las ánimas): se viene abajo, atontado.
  endRitual(next) {
    const g = this.g;
    const b = this.boss;
    const F = this.floatAt[this.stage];
    b.pos.set(F.land.x, this.A.y || 0, F.land.z);
    b.baseY = this.A.y || 0;
    b.P.rootY = 0;
    g.zombies.setState(b, 'stunned');
    // un rato largo atontado: es el momento de darle
    b.stateT = -3.8;
    this.wardMax = WARD_MAX;
    this.waveUntil = 0;
    this.setWard(false);
    this.landFx(F.land.x, F.land.z);
    this.send({ land: [+F.land.x.toFixed(2), +F.land.z.toFixed(2)] });
    this.shout('¡Francisco se vino abajo! Está atontado: ¡ahora es cuando!');
    g.powerups.bag.push('maxammo');
    g.powerups.drop(tmpV.set(this.A.x + (Math.random() - 0.5) * 6, this.A.y || 0, this.A.z + 3 + Math.random() * 3).clone(), true);
    this.setStage(next);
    this.send({ st: next });
    this.slamCd = 8;
    this.blinkCd = 7;
    if (next === 'p2') {
      g.later(4.5, () => {
        if (!this.active || b.dead) return;
        g.post?.flash(1.2);
        g.fx.sparkle(new THREE.Vector3(b.pos.x, (b.baseY || 0) + 3, b.pos.z), [1, 0.85, 0.3], 80, 2);
        g.audio.bossArrive();
        g.say('francisco', '¿Creen que me pueden ganar? Tengo el mate que no se termina nunca. Un sorbo... y soy eterno.', 'boss');
        this.shout('¡Francisco tomó del mate supremo!');
      });
      g.later(11, () => this.active && g.say('fierro', '¡Ojo, que sube el mate cocido! No se queden en la orilla.', 'npc'));
    } else {
      g.later(4.5, () => {
        if (!this.active || b.dead) return;
        g.post?.flash(1.4);
        g.audio.bossArrive();
        g.say('francisco', '¡Basta! Si el mate no es mío... no va a ser de nadie.', 'boss');
        this.shout('¡Francisco, el Eterno!');
      });
    }
  }

  // ---------------- lo que se rompe a tiros ----------------
  // ¿Ya empezó la pelea? (en el invitado la fase es 'guest')
  fighting() {
    return this.active && (this.phase === 'fight' || this.phase === 'guest');
  }

  onShot(o, d, maxT) {
    if (!this.fighting()) return;
    if (this.stage === 'r1') {
      for (const gi of GOURDS) {
        const G = this.gourds[gi];
        if (G.broken) continue;
        const t = rayHitSphere(o, d, G.pos, 0.95);
        if (t !== null && t <= maxT + 0.4) this.hitTarget('g', gi, 1, tmpW.copy(o).addScaledVector(d, t));
      }
    } else if (this.stage === 'r2') {
      this.wisps.forEach((w, i) => {
        if (w.free) return;
        const t = rayHitSphere(o, d, w.grp.position, 0.6);
        if (t !== null && t <= maxT + 0.4) this.hitTarget('w', i, 1, tmpW.copy(o).addScaledVector(d, t));
      });
    }
  }

  onExplosion(pos, radius) {
    if (!this.fighting()) return;
    if (this.stage === 'r1') {
      for (const gi of GOURDS) {
        const G = this.gourds[gi];
        if (!G.broken && G.pos.distanceTo(pos) < radius + 0.8) this.hitTarget('g', gi, 5, null);
      }
    } else if (this.stage === 'r2') {
      this.wisps.forEach((w, i) => {
        if (!w.free && w.grp.position.distanceTo(pos) < radius + 0.5) this.hitTarget('w', i, 3, null);
      });
    }
  }

  hitTarget(k, i, n, point) {
    const g = this.g;
    g.hud.hitmarker(false);
    g.audio.hitmarker(false);
    if (point) g.fx.sparks(point, 0.7, { x: 0, y: 1, z: 0 }, k === 'g' ? [1, 0.8, 0.3] : [0.6, 0.85, 1]);
    if (g.net?.guest) {
      g.net.net.send({ t: 'pee', a: 'inf', k, i, n });
      return;
    }
    this.applyHit(k, i, n);
  }

  // El anfitrión cuenta los golpes y avisa.
  applyHit(k, i, n) {
    if (k === 'g') {
      const G = this.gourds[i];
      if (this.stage !== 'r1' || !G || G.broken || !GOURDS.includes(i)) return;
      this.applyGourd(i, G.hits + n);
      if (G.broken) {
        const left = GOURDS.filter((gi) => !this.gourds[gi].broken).length;
        if (left) this.shout(`¡Calabaza rota! Quedan ${left}.`);
      }
    } else if (k === 'w') {
      const w = this.wisps[i];
      if (this.stage !== 'r2' || !w || w.free) return;
      this.applyWisp(i, w.hits + n);
      if (w.free) {
        const left = this.wisps.filter((x) => !x.free).length;
        if (left) this.shout(`¡Un ánima libre! Quedan ${left}.`);
      }
    }
    this.hitDirty = true;
  }

  applyGourd(i, hits) {
    const G = this.gourds[i];
    if (!G) return;
    G.hits = hits;
    if (!G.broken && GOURDS.includes(i) && hits >= this.need && (this.stage === 'r1' || this.g.net?.guest)) this.breakGourd(G);
  }

  applyWisp(i, hits) {
    const w = this.wisps[i];
    if (!w) return;
    w.hits = hits;
    if (!w.free && hits >= this.need && (this.stage === 'r2' || this.g.net?.guest)) this.freeWisp(w);
  }

  breakGourd(G) {
    const g = this.g;
    G.broken = true;
    g.fx.explosion(tmpV.copy(G.pos).setY(G.pos.y + 0.4), 2.4, GOLD);
    g.fx.sparkle(tmpV.copy(G.fire), [1, 0.85, 0.4], 50, 1.4);
    g.fx.flash(G.fire, 0xffc050, 90, 0.5, 18);
    g.audio.explosion(G.fire, 0.9);
    g.audio.shatter?.(G.fire);
    g.fx.addShake(0.3);
    // la calabaza queda partida y apagada
    G.body.scale.set(1.08, 0.42, 1.08);
    G.body.rotation.set(0.35, Math.random() * 3, 0.2);
    G.top.visible = false;
    G.straw.rotation.z = -1.3;
    G.straw.position.y = (this.A.y || 0) + 0.35;
    this.braziers = this.gourds.filter((x) => !x.broken).map((x) => x.fire);
  }

  restoreGourd(G) {
    G.broken = false;
    G.hits = 0;
    G.body.scale.set(1, 1, 1);
    G.body.rotation.set(0, 0, 0);
    G.top.visible = true;
    G.straw.rotation.set(0, 0, -0.3);
    G.straw.position.y = (this.A.y || 0) + 1.9;
  }

  freeWisp(w) {
    const g = this.g;
    w.free = true;
    const p = w.grp.position;
    g.fx.sparkle(p, [0.7, 0.9, 1], 40, 0.9);
    g.fx.flash(p, 0x9ad8ff, 60, 0.5, 14);
    g.audio.powerupGrab?.();
    // el ánima le devuelve el aliento al que está más cerca (cada compu se fija si es el suyo)
    let near = null;
    for (const q of this.standing()) if (!near || q.distanceToSquared(p) < near.distanceToSquared(p)) near = q;
    if (!near) return;
    const mine = near === g.player.pos;
    g.fx.soul(p.clone(), mine ? g.camera.position.clone().setY(g.camera.position.y - 0.4) : near.clone().setY(near.y + 1.2));
    if (mine) g.player.health = g.player.maxHealth;
  }

  // ---------------- golpes, ondas y saltos ----------------
  // Golpea el piso: a los 0.75 s sale la onda (y a veces otra atrás).
  slam(b, n = 1) {
    const g = this.g;
    g.zombies.setState(b, 'slam');
    b.attackHit = false;
    g.later(0.75, () => {
      if (!this.active || b.dead || this.phase !== 'fight') return;
      for (let k = 0; k < n; k++) {
        g.later(k * 0.6, () => {
          if (!this.active || b.dead) return;
          const x = b.pos.x + Math.sin(b.yaw) * 1.2;
          const z = b.pos.z + Math.cos(b.yaw) * 1.2;
          this.spawnWave(x, z);
          this.send({ w: [+x.toFixed(2), +z.toFixed(2)] });
        });
      }
    });
    if (!this.said.wave) {
      this.said.wave = true;
      g.later(1.4, () => g.say('fierro', '¡Cuando golpea el piso sale una onda! ¡Sáltenla!', 'npc'));
    }
  }

  spawnWave(x, z) {
    const g = this.g;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc850).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(this.waveGeo, mat);
    m.position.set(x, (this.A.y || 0) + 0.02, z);
    m.scale.set(0.4, 1, 0.4);
    this.root.add(m);
    this.waves.push({ m, r: 0.4, x, z, hit: false });
    g.audio.bossSlam(tmpV.set(x, (this.A.y || 0) + 0.5, z));
    g.fx.dust(tmpV.set(x, (this.A.y || 0) + 0.1, z), { x: 0, y: 1, z: 0 }, [0.8, 0.6, 0.3], 18);
    g.fx.addShake(0.35);
  }

  // ¿El jugador de esta compu está pisando el piso? (en el aire, la onda y el rayo pasan de largo)
  grounded() {
    const p = this.g.player;
    return p.canBeHit() && p.onGround && p.pos.y - (this.A.y || 0) < 0.3;
  }

  updateWaves(dt) {
    const g = this.g;
    const pp = g.player.pos;
    const max = this.A.r + 2;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += WAVE_SPEED * dt;
      const k = w.r / max;
      w.m.scale.set(w.r, 1 - k * 0.6, w.r);
      w.m.material.opacity = 0.95 * (1 - k * k);
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        g.fx.sparkle(tmpV.set(w.x + Math.cos(a) * w.r, (this.A.y || 0) + 0.2, w.z + Math.sin(a) * w.r), [1, 0.8, 0.35], 1, 0.15);
      }
      if (!w.hit && this.grounded()) {
        const dx = pp.x - w.x;
        const dz = pp.z - w.z;
        const d = Math.hypot(dx, dz);
        if (Math.abs(d - w.r) < 0.5) {
          w.hit = true;
          g.player.damage(WAVE_DMG, tmpV.set(w.x, 1, w.z));
          g.player.vel.y = 5;
          g.player.vel.x += (dx / (d || 1)) * 4;
          g.player.vel.z += (dz / (d || 1)) * 4;
          g.player.onGround = false;
          g.fx.addShake(0.4);
          if (!this.said.waveHit) {
            this.said.waveHit = true;
            g.hud.subtitle('¡La onda te agarró! Saltá (Espacio) justo cuando llega.', 3);
          }
        }
      }
      if (w.r > max) {
        w.m.removeFromParent();
        w.m.material.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  // Desaparece en polvo de oro y aparece en otro lado.
  blinkFx(x0, z0, x1, z1) {
    const g = this.g;
    const y = this.A.y || 0;
    g.fx.sparkle(tmpV.set(x0, y + 1.6, z0), [1, 0.85, 0.4], 45, 1.1);
    g.fx.explosion(tmpV.set(x0, y + 1, z0), 1.4, GOLD);
    g.fx.sparkle(tmpV.set(x1, y + 1.6, z1), [1, 0.85, 0.4], 45, 1.1);
    g.fx.lightning(new THREE.Vector3(x1, y + 13, z1), new THREE.Vector3(x1, y + 0.2, z1), 0xffe8a0, 0.35);
    g.audio.whoosh?.(tmpV.set(x1, y + 1.5, z1));
    g.audio.thunderCrack?.(tmpV.set(x1, y + 1.5, z1), { dur: 1.4, gain: 0.8 });
  }

  landFx(x, z) {
    const g = this.g;
    const y = this.A.y || 0;
    g.fx.explosion(tmpV.set(x, y + 0.5, z), 3, GOLD);
    g.fx.dust(tmpV.set(x, y + 0.1, z), { x: 0, y: 1, z: 0 }, [0.6, 0.45, 0.3], 30);
    g.audio.bossSlam(tmpV.set(x, y + 1, z));
    g.audio.explosion(tmpV.set(x, y + 1, z), 1.2);
    g.fx.addShake(0.8);
    g.post?.flash(0.6);
  }

  // El remolino: arrastra al jugador hacia Francisco (cada uno lo siente en su compu).
  pull(secs) {
    this.pullT = secs;
    this.g.audio.whoosh?.(this.g.camera.position);
  }

  // Un aviso para todos.
  shout(text) {
    const g = this.g;
    g.hud.subtitle(text, 3.5, 'boss');
    g.net?.event('sub', { x: text, d: 3.5, k: 'boss' });
  }

  // Los que protegen a Francisco (y el escudo) según la etapa.
  setWard(on) {
    const saved = this.lines.ward;
    if (this.stage === 'r1') this.lines.ward = 'Las calabazas doradas le dan fuerza: ¡rompelas a tiros!';
    else if (this.stage === 'r2') this.lines.ward = 'Las ánimas de la torre lo protegen: ¡liberalas a tiros!';
    super.setWard(on);
    this.lines.ward = saved;
  }

  // Bolas de yerba de oro: de a tres desde que tomó del mate supremo.
  fireball(from, spread = 1) {
    super.fireball(from, this.phase2 ? Math.max(3, spread) : spread);
  }

  // Rayos: un círculo dorado y, cuando revienta, el rayo que baja de la bóveda.
  updateRain(dt) {
    const g = this.g;
    for (const c of this.rain) {
      if (c.t + dt >= this.rainDelay && !c.bolt) {
        c.bolt = true;
        const p = c.group.position;
        g.fx.lightning(new THREE.Vector3(p.x, p.y + 13, p.z), new THREE.Vector3(p.x, p.y + 0.1, p.z), 0xffe8a0, 0.35);
        g.audio.thunderCrack?.(p, { dur: 1, gain: 0.6 });
      }
    }
    super.updateRain(dt);
  }

  // Francisco brilla de oro desde que toma del mate supremo.
  setGlow(k) {
    const BM = this.g.zombies.bossMats;
    if (!BM) return;
    for (const m of [BM.skin, BM.cloth, BM.poncho]) {
      m.emissive?.set(this.stage === 'p3' ? 0xff7010 : 0xffa820);
      // la camisa blanca prendida de naranja parecía el torso desnudo: brilla menos
      if (m.emissive) m.emissiveIntensity = m === BM.cloth ? k * 0.55 : k;
    }
  }

  update(dt) {
    super.update(dt);
    const g = this.g;
    if (!this.active) return;
    const t = g.time;
    this.rT += dt;
    this.lavaMat.emissiveIntensity = (this.stage === 'p3' ? 1.5 : 1) + Math.sin(t * 1.3) * 0.25;
    this.riverTick(dt, t);
    const cols = LIGHTS[this.stage] || LIGHTS.p1;
    this.lights.forEach((l, i) => l.color.lerp(tmpC.set(cols[i]), Math.min(1, dt * 2)));
    const b = g.zombies.boss;
    // el escudo sigue a Francisco aunque flote
    if (b && b.state === 'fall' && this.wardMesh.visible) this.wardMesh.position.y += b.P.rootY;
    this.updateFlood(dt);
    this.updateWaves(dt);
    this.updateRitualFx(dt, b);
    // el remolino: arrastra al jugador hacia Francisco
    if (this.pullT > 0) {
      this.pullT -= dt;
      if (b && !b.dead && g.player.canBeHit()) {
        const dx = b.pos.x - g.player.pos.x;
        const dz = b.pos.z - g.player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.2) {
          g.player.pos.x += (dx / d) * 3.6 * dt;
          g.player.pos.z += (dz / d) * 3.6 * dt;
        }
      }
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        g.fx.sparkle(new THREE.Vector3(this.A.x + Math.cos(a) * 8, 0.5 + Math.random() * 3, this.A.z + Math.sin(a) * 8), [1, 0.85, 0.4], 2, 0.6);
      }
    }
    const ph2 = this.phase2 && b && !b.dead;
    this.glowK += ((ph2 ? (this.stage === 'p3' ? 1.6 : 1.2) : 0) - this.glowK) * Math.min(1, dt * 2);
    this.setGlow(this.glowK * (0.8 + Math.sin(t * 6) * 0.2));
    if (g.net?.guest || !b || b.dead || b.kind !== 'francisco' || this.phase !== 'fight') return;
    this.fight(dt, b);
  }

  // ---------------- lo que decide el anfitrión ----------------
  fight(dt, b) {
    const g = this.g;
    const k = b.hp / b.maxHp;
    b.speed = SPEEDS[this.stage];
    // cómo van las calabazas o las ánimas (a los invitados, cada tanto)
    this.hitSyncT -= dt;
    if (this.hitDirty && this.hitSyncT <= 0) {
      this.hitSyncT = 0.3;
      this.hitDirty = false;
      if (this.stage === 'r1') this.send({ h: this.gourds.map((G) => G.hits) });
      else if (this.stage === 'r2') this.send({ wh: this.wisps.map((w) => w.hits) });
    }
    switch (this.stage) {
      case 'p1':
        if (k < RITUAL1) {
          this.startRitual('r1');
          return;
        }
        this.slams(dt, b, 10, 1);
        break;
      case 'r1':
        this.ritual(dt, b);
        if (GOURDS.every((gi) => this.gourds[gi].broken)) {
          this.send({ h: this.gourds.map((G) => G.hits) });
          this.endRitual('p2');
        }
        return;
      case 'p2':
        if (k < RITUAL2) {
          this.startRitual('r2');
          return;
        }
        this.slams(dt, b, 8.5, 2);
        this.pulls(dt, b);
        this.specials(dt);
        break;
      case 'r2':
        this.ritual(dt, b);
        // el rayo de la bombilla: el mismo ángulo en todas las compus (cada uno se cuida del suyo)
        this.sweepSyncT = (this.sweepSyncT ?? 0) - dt;
        if (this.sweepSyncT <= 0) {
          this.sweepSyncT = 1.5;
          this.send({ sa: +this.sweepA.toFixed(3) });
        }
        if (this.wisps.every((w) => w.free)) {
          this.send({ wh: this.wisps.map((w) => w.hits) });
          this.endRitual('p3');
        }
        return;
      case 'p3':
        this.blinks(dt, b);
        this.pulls(dt, b);
        this.specials(dt);
        if (k < 0.1 && !this.said.last) {
          this.said.last = true;
          g.say('francisco', 'No... no puede ser. ¡El mate es mío! ¡Es mío!', 'boss');
          this.shout('¡A Francisco le queda un suspiro!');
        }
        break;
      default:
        break;
    }
  }

  slams(dt, b, cd, n) {
    this.slamCd -= dt;
    if (this.slamCd > 0 || b.state !== 'chase') return;
    const near = this.standing().some((p) => Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < 16);
    if (!near) return;
    this.slamCd = cd + Math.random() * 3;
    this.slam(b, n);
  }

  pulls(dt, b) {
    this.pullCd -= dt;
    if (this.pullCd <= 0 && b.state === 'chase') {
      this.pullCd = 11 + Math.random() * 4;
      this.pull(2.6);
      this.g.net?.event('pee', { pull: 2.6 });
    }
  }

  // carpinchos y caballos de todos los mapas
  specials(dt) {
    const g = this.g;
    this.specialT -= dt;
    if (this.specialT > 0) return;
    this.specialT = this.stage === 'p3' ? 12 : 15;
    const n = 2 + Math.min(4, (g.rounds?.players || 1) - 1);
    this.shout('¡Francisco llama a los bichos de todos los mapas!');
    for (let i = 0; i < n; i++) g.later(i * 0.5, () => g.zombies.spawnDog(1800, i % 2 ? 'horse' : 'dog'));
  }

  // El Eterno: desaparece y aparece al lado de alguno, y golpea.
  blinks(dt, b) {
    this.blinkCd -= dt;
    if (this.blinkCd > 0 || b.state !== 'chase') return;
    const list = this.standing();
    if (!list.length) return;
    this.blinkCd = 7 + Math.random() * 3;
    const tp = list[Math.floor(Math.random() * list.length)];
    const a = Math.random() * Math.PI * 2;
    let nx = tp.x + Math.cos(a) * 4.2;
    let nz = tp.z + Math.sin(a) * 4.2;
    // adentro, lejos del mate cocido
    const dx = nx - this.A.x;
    const dz = nz - this.A.z;
    const d = Math.hypot(dx, dz);
    const max = this.A.r - FLOOD_IN - 1.2;
    if (d > max) {
      nx = this.A.x + (dx / d) * max;
      nz = this.A.z + (dz / d) * max;
    }
    this.blinkFx(b.pos.x, b.pos.z, nx, nz);
    this.send({ bl: [+b.pos.x.toFixed(2), +b.pos.z.toFixed(2), +nx.toFixed(2), +nz.toFixed(2)] });
    b.pos.x = nx;
    b.pos.z = nz;
    b.yaw = Math.atan2(tp.x - nx, tp.z - nz);
    this.slam(b, 1);
  }

  // Mientras flota: tira bolas de oro, rayos y manda muertos.
  ritual(dt, b) {
    const g = this.g;
    const F = this.floatAt[this.stage];
    const t = g.time;
    b.pos.set(F.pos.x, F.pos.y + Math.sin(t * 1.6) * 0.15, F.pos.z);
    b.baseY = this.A.y || 0;
    g.zombies.poseClimb(b, 0.85);
    b.P.rootY = b.pos.y - b.baseY;
    const tp = g.nearestPlayer(b.pos.x, b.pos.z, 0);
    if (tp) b.yaw = Math.atan2(tp.pos.x - b.pos.x, tp.pos.z - b.pos.z);
    this.ritFireT -= dt;
    if (this.ritFireT <= 0) {
      this.ritFireT = this.stage === 'r2' ? 2.6 : 3.2;
      this.fireball(tmpV.set(b.pos.x + Math.sin(b.yaw) * 0.8, b.pos.y + 2.2, b.pos.z + Math.cos(b.yaw) * 0.8).clone(), this.stage === 'r2' ? 3 : 1);
    }
    // en el primero los rayos van por cuenta del ritual (en el segundo ya caen solos)
    if (this.stage === 'r1') {
      this.ritRainT -= dt;
      if (this.ritRainT <= 0) {
        this.ritRainT = 9;
        this.fireRain();
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const players = g.rounds?.players || 1;
      this.spawnT = 1.7 / Math.sqrt(players);
      if (g.zombies.alive < maxAlive(players)) {
        const a = Math.random() * Math.PI * 2;
        const d = this.stage === 'r2' ? this.A.r - FLOOD_IN - 1.5 : this.A.r - 3;
        g.zombies.spawn(15, 3000, new THREE.Vector3(this.A.x + Math.cos(a) * d, this.A.y || 0, this.A.z + Math.sin(a) * d));
      }
    }
  }

  // ---------------- lo que se ve igual en todas las compus ----------------
  updateFlood(dt) {
    const g = this.g;
    this.floodK += (this.floodGoal - this.floodK) * Math.min(1, dt * 0.35);
    const k = this.floodK;
    this.flood.visible = k > 0.01;
    if (!this.flood.visible) return;
    const r = this.A.r;
    const inner = r + 1.6 - (FLOOD_IN + 1.6) * k;
    const U = this.floodMat.uniforms;
    U.uInner.value = inner;
    U.uTime.value = g.time;
    U.uK.value = Math.min(1, k * 3) * 0.92;
    if (Math.random() < k * 0.8) {
      const a = Math.random() * Math.PI * 2;
      const d = inner + Math.random() * (r - inner);
      g.fx.steam(tmpV.set(this.A.x + Math.cos(a) * d, (this.A.y || 0) + 0.1, this.A.z + Math.sin(a) * d), 1, 0.3);
    }
    // quema al que la pisa
    this.floodT -= dt;
    const pp = g.player.pos;
    const d = Math.hypot(pp.x - this.A.x, pp.z - this.A.z);
    if (k > 0.3 && d > inner + 0.2 && this.grounded() && this.floodT <= 0) {
      this.floodT = FLOOD_TICK;
      g.player.damage(FLOOD_DMG, tmpV.set(this.A.x, 1, this.A.z));
      g.fx.steam(tmpV.set(pp.x, pp.y + 0.2, pp.z), 3, 0.3);
    }
  }

  updateRitualFx(dt, b) {
    const g = this.g;
    const t = g.time;
    // (siempre booleano: three.js solo esconde con visible === false)
    const alive = !!(b && !b.dead && this.fighting());
    const r1 = alive && this.stage === 'r1';
    const r2 = alive && this.stage === 'r2';
    // el pecho de Francisco (flotando o no)
    const chest = b ? tmpW.set(b.pos.x, (b.baseY || 0) + (b.state === 'fall' ? b.P.rootY : 0) + 1.9, b.pos.z) : null;
    GOURDS.forEach((gi, k) => {
      const G = this.gourds[gi];
      const on = r1 && !G.broken;
      const L = this.links[k];
      const S = this.gourdGlow[k];
      L.visible = on;
      S.visible = on;
      if (!on) return;
      // cuanto más golpeada, más titila
      const hurt = Math.min(1, G.hits / Math.max(1, this.need));
      S.material.opacity = 0.55 + Math.sin(t * (5 + hurt * 20)) * (0.15 + hurt * 0.2);
      S.scale.setScalar(2.4 - hurt * 0.9);
      stretch(L, G.fire, chest, 0.05 + Math.sin(t * 9 + k) * 0.015);
      if (Math.random() < 0.5) g.fx.fire(G.fire, 0.35, 1);
      if (Math.random() < 0.15) g.fx.sparkle(tmpV.lerpVectors(G.fire, chest, Math.random()), [1, 0.85, 0.4], 1, 0.1);
    });
    // las ánimas dan vueltas alrededor de Francisco
    this.wisps.forEach((w, i) => {
      if (w.free) {
        // se van para arriba y se apagan
        if (w.grp.visible) {
          w.up += dt;
          w.grp.position.y += dt * 4;
          w.halo.material.opacity = Math.max(0, 0.9 - w.up);
          if (w.up > 1) w.grp.visible = false;
        }
        return;
      }
      w.grp.visible = r2;
      if (!r2) return;
      const dir = i % 2 ? -1 : 1;
      const a = (i / WISPS) * Math.PI * 2 + dir * this.rT * 0.45;
      const rad = 7.2 + Math.sin(this.rT * 0.7 + i * 1.7) * 1.4;
      w.grp.position.set(this.A.x + Math.cos(a) * rad, (this.A.y || 0) + 1.7 + Math.sin(this.rT * 1.3 + i) * 0.6, this.A.z + Math.sin(a) * rad);
      const hurt = Math.min(1, w.hits / Math.max(1, this.need));
      w.halo.material.opacity = 0.75 + Math.sin(t * (4 + hurt * 16) + i) * 0.2;
      if (Math.random() < 0.25) g.fx.sparkle(w.grp.position, [0.6, 0.85, 1], 1, 0.2);
    });
    // el hilo de Francisco al piso y el rayo de la bombilla
    this.stem.visible = r2;
    if (r2) stretch(this.stem, tmpV.set(this.A.x, (this.A.y || 0) + 0.3, this.A.z), chest, 0.09);
    this.updateSweep(dt, r2);
  }

  // El rayo de la bombilla: al principio avisa (finito y apagado), después barre.
  updateSweep(dt, on) {
    const g = this.g;
    this.sweep.visible = on;
    if (!on) return;
    const hot = this.rT > BEAM_WARM;
    const prev = this.sweepA;
    this.sweepA += BEAM_SPEED * dt * (hot ? 1 : 0.35);
    this.sweep.rotation.y = -this.sweepA;
    this.sweepMat.opacity = hot ? 0.85 + Math.sin(g.time * 30) * 0.1 : 0.15 + (this.rT / BEAM_WARM) * 0.25;
    this.sweep.scale.set(1, hot ? 1 : 0.4, hot ? 1 : 0.4);
    if (hot && Math.random() < 0.7) {
      const s = Math.random() < 0.5 ? 0 : Math.PI;
      const d = 1 + Math.random() * (this.A.r - 1);
      g.fx.sparkle(tmpV.set(this.A.x + Math.cos(this.sweepA + s) * d, (this.A.y || 0) + 0.35, this.A.z + Math.sin(this.sweepA + s) * d), [1, 0.85, 0.4], 1, 0.1);
    }
    this.sweepCd -= dt;
    if (!hot || this.sweepCd > 0 || !this.grounded()) return;
    const pp = g.player.pos;
    const dx = pp.x - this.A.x;
    const dz = pp.z - this.A.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.9 || d > this.A.r) return;
    const ap = Math.atan2(dz, dx);
    const width = 0.4 / d;
    for (const s of [0, Math.PI]) {
      const now = angDiff(ap, this.sweepA + s);
      const before = angDiff(ap, prev + s);
      // lo tocó o lo cruzó entre un cuadro y el otro
      if (Math.abs(now) < width || (Math.sign(now) !== Math.sign(before) && Math.abs(now) < 0.5)) {
        this.sweepCd = 0.8;
        g.player.damage(BEAM_DMG, tmpV.set(this.A.x, 0.3, this.A.z));
        g.player.vel.y = 4.5;
        g.player.vel.x += (dx / d) * 3;
        g.player.vel.z += (dz / d) * 3;
        g.player.onGround = false;
        g.fx.sparks(tmpV.set(pp.x, pp.y + 0.3, pp.z), 1, { x: 0, y: 1, z: 0 }, [1, 0.8, 0.3]);
        if (!this.said.beam) {
          this.said.beam = true;
          g.hud.subtitle('¡El rayo de la bombilla! Saltalo (Espacio) cuando pase.', 3);
        }
        break;
      }
    }
  }

  // Durante el final (con el juego quieto) la caverna sigue viva: la lava, el
  // río y el mate cocido hierven y las calabazas que quedan siguen ardiendo.
  ambient(dt) {
    const g = this.g;
    const t = g.time;
    this.lavaMat.emissiveIntensity = 1 + Math.sin(t * 1.3) * 0.25;
    this.riverTick(dt, t);
    this.floodMat.uniforms.uTime.value = t;
    for (const b of this.braziers) if (Math.random() < 0.4) g.fx.fire(b, 0.5, 1);
    for (const l of this.lights) l.intensity = 30 + Math.sin(t * 11 + l.position.x) * 5;
  }

  // El río hierve y larga vapor; las cadenas del techo se mecen.
  riverTick(dt, t) {
    const g = this.g;
    this.riverMat.uniforms.uTime.value = t;
    if (Math.random() < dt * 5) {
      const a = Math.random() * Math.PI * 2;
      const d = this.A.r + 0.3 + Math.random() * 2.6;
      g.fx.steam(tmpV.set(this.A.x + Math.cos(a) * d, (this.A.y || 0) + 0.1, this.A.z + Math.sin(a) * d), 1, 0.3);
    }
    if (this.chainsDecor) this.chainsDecor.rotation.y = Math.sin(t * 0.3) * 0.02;
  }

  onBossDead() {
    super.onBossDead();
    this.phase2 = false;
    this.pullT = 0;
    this.floodGoal = 0;
    this.setGlow(0);
    for (const w of this.waves) w.m.removeFromParent();
    this.waves = [];
  }

  dispose() {
    super.dispose();
    this.setGlow(0);
    for (const w of this.waves) w.m.removeFromParent();
  }
}

// Una columna de luz entre dos puntos (un cilindro estirado y girado).
function stretch(m, a, b, width) {
  const len = a.distanceTo(b);
  m.position.lerpVectors(a, b, 0.5);
  m.scale.set(width, len, width);
  m.quaternion.setFromUnitVectors(UP, tmpV.subVectors(b, a).normalize());
}

function glowSprite(g, color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
  s.scale.setScalar(size);
  return s;
}

// Diferencia entre dos ángulos, entre -π y π.
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function rayHitSphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t < 0 ? null : t;
}

// El piso de la caverna: costra de basalto partida en placas, con la brasa
// viva en las grietas. Las placas son un Voronoi con las semillas en una
// grilla que da la vuelta (la textura no tiene costuras); algunas juntas están
// soldadas (finitas y apagadas). La altura va en `relief` (en pixeles: la
// placa abombada y rugosa, el canto redondeado y la grieta honda) y de ahí
// fx/Surfaces arma el normal map y el parallax, como en los pisos del resto
// del juego. Se pinta una sola vez (tarda) y se reusa al volver a la torre.
let lavaCanvas = null;
function lavaCanvases() {
  if (lavaCanvas) return lavaCanvas;
  const S = 1024;
  let seed = 913;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (i, j) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // ruido de valor que da la vuelta cada P celdas (la grilla de azar, calculada una vez)
  const lattices = new Map();
  const lattice = (P) => {
    let L = lattices.get(P);
    if (!L) {
      L = new Float32Array(P * P);
      for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) L[j * P + i] = hash(i + P, j + 3 * P);
      lattices.set(P, L);
    }
    return L;
  };
  const vn = (x, y, P) => {
    const L = lattice(P);
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const i0 = ((i % P) + P) % P;
    const j0 = ((j % P) + P) % P;
    const i1 = (i0 + 1) % P;
    const j1 = (j0 + 1) % P;
    return (L[j0 * P + i0] * (1 - u) + L[j0 * P + i1] * u) * (1 - v) + (L[j1 * P + i0] * (1 - u) + L[j1 * P + i1] * u) * v;
  };
  const fbm = (x, y, P, oct) => {
    let s = 0;
    let a = 0.5;
    let n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * vn(x, y, P);
      n += a;
      x *= 2;
      y *= 2;
      P *= 2;
      a *= 0.5;
    }
    return s / n;
  };
  // Los ruidos suaves van en una grilla de a 4 pixeles (R x R) y se interpolan
  // fila por fila; en cada pixel eran más de medio segundo.
  const R = S / 4;
  const grid = (fn) => {
    const out = new Float32Array(R * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) out[j * R + i] = fn(i * 4, j * 4);
    return out;
  };
  const SM = [0, 0.15625, 0.5, 0.84375]; // smoothstep de 0, 1/4, 2/4, 3/4
  const row = (g, y, out, smooth) => {
    const j0 = y >> 2;
    const j1 = (j0 + 1) % R;
    const fv = smooth ? SM[y & 3] : (y & 3) / 4;
    for (let x = 0; x < S; x++) {
      const i0 = x >> 2;
      const i1 = (i0 + 1) % R;
      const fu = smooth ? SM[x & 3] : (x & 3) / 4;
      out[x] = (g[j0 * R + i0] * (1 - fu) + g[j0 * R + i1] * fu) * (1 - fv) + (g[j1 * R + i0] * (1 - fu) + g[j1 * R + i1] * fu) * fv;
    }
  };
  const fields = [
    grid((x, y) => fbm(x / 128, y / 128, 8, 3)), // deformación en x
    grid((x, y) => fbm(x / 128 + 5, y / 128 + 9, 8, 3)), // y en y
    grid((x, y) => fbm(x / 128, y / 128, 8, 4)), // manchones de ceniza
    grid((x, y) => fbm(x / 64 + 11, y / 64, 16, 2)), // ancho de las grietas
    grid((x, y) => fbm(x / 64 + 3, y / 64 + 21, 16, 2)), // dónde se cuartea la costra
  ];
  // el grano: ruido de 4 pixeles (la grilla de azar misma, suavizada)
  const grain = lattice(R);
  const rows = fields.map(() => new Float32Array(S));
  const grRow = new Float32Array(S);
  // Un Voronoi que da la vuelta: G x G semillas (una por celda, corrida al azar)
  const voronoi = (G, jit) => {
    const cell = S / G;
    const sx = new Float64Array(G * G);
    const sy = new Float64Array(G * G);
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        sx[j * G + i] = (i + (1 - jit) / 2 + rnd() * jit) * cell;
        sy[j * G + i] = (j + (1 - jit) / 2 + rnd() * jit) * cell;
      }
    }
    // (celda de -3 a G + 2: la que da la vuelta y cuánto se corre)
    const wrap = new Int32Array(G + 6);
    const off = new Float64Array(G + 6);
    for (let c = -3; c < G + 3; c++) {
      wrap[c + 3] = ((c % G) + G) % G;
      off[c + 3] = Math.floor(c / G) * S;
    }
    const V = { d1: 0, d2: 0, ax: 0, ay: 0, bx: 0, by: 0, k1: 0, k2: 0, e: 0 };
    V.at = (x, y) => {
      const ci = Math.floor(x / cell) + 3;
      const cj = Math.floor(y / cell) + 3;
      let d1 = 1e12;
      let d2 = 1e12;
      let ax = 0;
      let ay = 0;
      let bx = 0;
      let by = 0;
      let k1 = 0;
      let k2 = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const J = cj + dj;
        const rowK = wrap[J] * G;
        const oy = off[J];
        for (let di = -1; di <= 1; di++) {
          const I = ci + di;
          const k = rowK + wrap[I];
          const px = sx[k] + off[I];
          const py = sy[k] + oy;
          const d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < d1) {
            d2 = d1;
            bx = ax;
            by = ay;
            k2 = k1;
            d1 = d;
            ax = px;
            ay = py;
            k1 = k;
          } else if (d < d2) {
            d2 = d;
            bx = px;
            by = py;
            k2 = k;
          }
        }
      }
      V.ax = ax;
      V.ay = ay;
      V.k1 = k1;
      V.k2 = k2;
      // distancia al borde de la celda (a la mediatriz entre las dos semillas)
      V.e = (d2 - d1) / (2 * Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)));
      return V;
    };
    return V;
  };
  const G = 8;
  const plates = voronoi(G, 0.6);
  const fine = voronoi(24, 0.8);
  // cada placa, un poco inclinada para su lado
  const tiltX = new Float32Array(G * G);
  const tiltY = new Float32Array(G * G);
  for (let k = 0; k < G * G; k++) {
    tiltX[k] = (hash(k, 7) - 0.5) * 0.05;
    tiltY[k] = (hash(k, 13) - 0.5) * 0.05;
  }
  const col = new Uint8ClampedArray(S * S * 4);
  const glo = new Uint8ClampedArray(S * S * 4);
  const H = new Float32Array(S * S);
  const lip = 7;
  for (let y = 0; y < S; y++) {
    for (let f = 0; f < fields.length; f++) row(fields[f], y, rows[f], false);
    row(grain, y, grRow, true);
    const [rwx, rwy, rn, rw, rc] = rows;
    for (let x = 0; x < S; x++) {
      // el dominio deformado: las juntas no salen rectas (sin esto parecía un panal)
      const wx = x + (rwx[x] - 0.5) * 70;
      const wy = y + (rwy[x] - 0.5) * 70;
      const P = plates.at(wx, wy);
      const e = P.e;
      const k1 = P.k1;
      const open = hash(Math.min(k1, P.k2) + 101, Math.max(k1, P.k2) + 57) > 0.26;
      const wv = rw[x];
      const w = open ? 1.8 + 9 * wv * wv : 1.3;
      const n = rn[x];
      const gr = grRow[x];
      // la altura (pixeles): la placa abombada, inclinada y rugosa, el canto
      // redondeado y la grieta honda
      let top = 12 + 3 * Math.min(1, e / 60) + (n - 0.5) * 3 + (gr - 0.5) * 1.1 + (wx - P.ax) * tiltX[k1] + (wy - P.ay) * tiltY[k1];
      // las grietas finas de la costra (apagadas), solo en algunas partes
      const fc = e > 14 && rc[x] > 0.52 ? fine.at(x, y).e : 99;
      if (fc < 1.6) top -= 2.6 * (1 - fc / 1.6);
      const bottom = open ? 1 + gr : 8.5;
      let h = top;
      if (e < w) h = bottom;
      else if (e < w + lip) {
        const t = (e - w) / lip;
        h = bottom + (top - bottom) * t * t * (3 - 2 * t);
      }
      // poros de la costra (hundidos y oscuros)
      const pore = e > w + lip && gr > 0.83;
      if (pore) h -= 1.6;
      H[y * S + x] = h;
      // el basalto: oscuro, con manchas de ceniza y el grano
      let r = 30 + n * 26 + (gr - 0.5) * 16;
      let g = 21 + n * 16 + (gr - 0.5) * 10;
      let b = 18 + n * 12 + (gr - 0.5) * 8;
      const ash = Math.max(0, n - 0.62) * 3;
      r += ash * 30;
      g += ash * 26;
      b += ash * 24;
      let dim = pore ? 0.55 : 1;
      if (fc < 1.6) dim *= 1 - 0.6 * (1 - fc / 1.6);
      r *= dim;
      g *= dim;
      b *= dim;
      // el canto de la placa, colorado por el calor
      if (open) {
        const heat = Math.max(0, 1 - (e - w) / 18);
        const q = heat * heat;
        r += (120 - r) * q;
        g += (30 - g) * q;
        b += (8 - b) * q;
      }
      if (e < w) {
        r = open ? 150 : 14;
        g = open ? 48 : 10;
        b = open ? 10 : 8;
      }
      const o = (y * S + x) * 4;
      col[o] = r;
      col[o + 1] = g;
      col[o + 2] = b;
      col[o + 3] = 255;
      // la brasa (va al emissiveMap): blanca en el medio de la grieta, un halo afuera
      let gl = 0;
      if (open) gl = e < w ? 0.55 + 0.45 * (1 - e / w) : 0.3 * Math.exp(-(e - w) / 4);
      const hot = e < w ? 1 - e / w : 0;
      glo[o] = 255 * gl;
      glo[o + 1] = (70 + 170 * hot) * gl;
      glo[o + 2] = (10 + 150 * hot * hot) * gl;
      glo[o + 3] = 255;
    }
  }
  const make = (data) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    c.getContext('2d').putImageData(new ImageData(data, S, S), 0, 0);
    return c;
  };
  const map = make(col);
  map.relief = { H, detail: 0.25, blur: 2, depth: 0.05, ao: 1.35, aoBlur: 5 };
  lavaCanvas = { map, glow: make(glo) };
  return lavaCanvas;
}

function lavaTextures() {
  const C = lavaCanvases();
  const tex = (c, srgb) => {
    const t = toTexture(c, { srgb });
    t.repeat.set(3, 3);
    return t;
  };
  return { map: tex(C.map, true), glow: tex(C.glow, true) };
}
