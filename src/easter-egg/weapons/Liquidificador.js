import * as THREE from 'three';
import { WEAPONS, weaponStats } from '../config/weapons';
import { VM, VM_POSE, registerMate } from './viewmodels';

// La Liquidificador (la maravilla de los esteros; sale del easter egg): una
// pava tiznada que hierve sola, con una luz verdosa que se escapa por las
// rajaduras, la juntura de la tapa y el pico. Cada tiro es una bola de agua
// hirviendo que vuela en arco y revienta donde toca:
//  · a los muertos del reventón los derrite: se desploman en un charco de barro
//    que burbujea, con los huesos saltando y mucho vapor;
//  · si cae en el agua (fx/Water.js) la hace hervir unos segundos, y el agua que
//    hierve quema a todo bicho que esté adentro: muertos y yacarés (a los
//    jugadores no: ni al que la tiró). Al easter egg le avisa el anfitrión:
//    g.ee.onBoil(pos, radio) cada vez que arranca a hervir y
//    g.ee.onBoilKill(z, pos) por cada muerto que se cocina en el agua.
// Con el Pack-a-Pava (Liquidificador del Más Allá) la luz se pone azul, el
// reventón y el hervor son más grandes y cada reventón suelta tres gotas que
// revientan de nuevo.
// Weapons (weapons/Weapons.js) le pasa cada tiro (fire), cada cuadro (update)
// y el final (clear). En línea: los demás ven cada bola como un "fantasma"
// (mismos efectos, sin daño) y el hervor les llega aparte (ghost), así el agua
// hierve igual en todos; cada uno se quema solo a sí mismo y a los muertos los
// cocina el anfitrión.
// Para darla: g.weapons.give('liquidificador') (con 1, ya mejorada).

const GLOW = 0xb4ffd8;
const GLOW_UP = 0x9ad0ff;
// charcos y huesos a la vez (los más viejos se van antes)
const MAX_PUDDLES = 14;
const MAX_BONES = 40;
const MAX_RINGS = 6;
// cada cuánto quema el agua hirviendo (segundos)
const TICK = 0.2;
// cuándo saltan los huesos del derretido (el muerto tarda 1,6 s en escurrirse)
const BONES_AT = 1.25;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const bump = (k, at, w) => Math.max(0, 1 - Math.abs(k - at) / w);
const hitTmp = {};
const near = [];
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const rnd = () => Math.random() - 0.5;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
// jefes y compañía: no se derriten, se escaldan (daño fijo)
const tough = (z) => z.boss || z.pombero || z.crow || z.mandinga;

const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());

// ---------------- texturas ----------------
// El hierro tiznado: hollín, chorreaduras de óxido y rajaduras (oscuras en el
// color, encendidas en el emisivo: por ahí se escapa la luz de adentro).
function sootTextures() {
  return once('soot', () => {
    const S = 256;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      return c;
    };
    const cc = mk();
    const ce = mk();
    const x = cc.getContext('2d');
    const y = ce.getContext('2d');
    x.fillStyle = '#1c1915';
    x.fillRect(0, 0, S, S);
    y.fillStyle = '#000';
    y.fillRect(0, 0, S, S);
    let seed = 11;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // manchas de hollín más claras y más oscuras
    for (let i = 0; i < 60; i++) {
      const px = r() * S;
      const py = r() * S;
      const rad = 8 + r() * 30;
      const gr = x.createRadialGradient(px, py, 0, px, py, rad);
      const v = r() < 0.5 ? '8,7,6' : '52,46,40';
      gr.addColorStop(0, `rgba(${v},0.35)`);
      gr.addColorStop(1, `rgba(${v},0)`);
      x.fillStyle = gr;
      x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 2200; i++) {
      const v = (14 + r() * 42) | 0;
      x.fillStyle = `rgba(${v},${(v * 0.92) | 0},${(v * 0.8) | 0},${0.3 + r() * 0.5})`;
      x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    // chorreaduras de óxido (la v del torno va de abajo para arriba)
    for (let i = 0; i < 16; i++) {
      x.fillStyle = `rgba(96,54,28,${0.12 + r() * 0.2})`;
      x.fillRect(r() * S, r() * S * 0.6, 1.5 + r() * 2.5, 20 + r() * 70);
    }
    // rajaduras: caminos quebrados
    for (let i = 0; i < 10; i++) {
      let px = r() * S;
      let py = r() * S;
      let a = r() * Math.PI * 2;
      const pts = [[px, py]];
      for (let j = 0; j < 11; j++) {
        a += (r() - 0.5) * 1.4;
        px += Math.cos(a) * (5 + r() * 9);
        py += Math.sin(a) * (5 + r() * 9);
        pts.push([px, py]);
      }
      const path = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
      };
      x.strokeStyle = 'rgba(0,0,0,0.9)';
      x.lineWidth = 2.4;
      path(x);
      x.stroke();
      y.strokeStyle = 'rgba(255,255,255,0.16)';
      y.lineWidth = 7;
      path(y);
      y.stroke();
      y.strokeStyle = '#fff';
      y.lineWidth = 1.3;
      path(y);
      y.stroke();
    }
    const tex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    return { map: tex(cc), glow: tex(ce) };
  });
}

// El charco del derretido: barro verdinegro de borde irregular con burbujas.
function sludgeTextures() {
  return once('sludge', () => {
    const S = 128;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      return c;
    };
    const cc = mk();
    const ce = mk();
    const x = cc.getContext('2d');
    const y = ce.getContext('2d');
    y.fillStyle = '#000';
    y.fillRect(0, 0, S, S);
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // manchones que se pisan: el borde queda irregular
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 30;
      const px = 64 + Math.cos(a) * d;
      const py = 64 + Math.sin(a) * d;
      const rad = 14 + r() * 22;
      const gr = x.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, 'rgba(34,40,20,0.95)');
      gr.addColorStop(0.6, 'rgba(30,34,18,0.8)');
      gr.addColorStop(1, 'rgba(24,26,14,0)');
      x.fillStyle = gr;
      x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // burbujas: anillitos claros; en el emisivo, el brillo de adentro
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 34;
      const px = 64 + Math.cos(a) * d;
      const py = 64 + Math.sin(a) * d;
      const rad = 1.2 + r() * 3.5;
      x.strokeStyle = `rgba(150,170,110,${0.4 + r() * 0.4})`;
      x.lineWidth = 1;
      x.beginPath();
      x.arc(px, py, rad, 0, Math.PI * 2);
      x.stroke();
      const gr = y.createRadialGradient(px, py, 0, px, py, rad * 2.2);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      y.fillStyle = gr;
      y.fillRect(px - rad * 3, py - rad * 3, rad * 6, rad * 6);
    }
    const gr = y.createRadialGradient(64, 64, 0, 64, 64, 40);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    y.fillStyle = gr;
    y.fillRect(0, 0, S, S);
    const tex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: tex(cc), glow: tex(ce) };
  });
}

// ---------------- la pava en la mano ----------------
// perfil del cuerpo (radio, altura) y de la tapa
const BODY = [[0, 0], [0.036, 0], [0.046, 0.003], [0.053, 0.013], [0.056, 0.028], [0.054, 0.045], [0.046, 0.06], [0.035, 0.07], [0.028, 0.074], [0.027, 0.078]];
const LID = [[0.0285, 0.077], [0.03, 0.079], [0.027, 0.084], [0.017, 0.089], [0.008, 0.091], [0, 0.092]];

function pavaMats(T, up) {
  return once(`pava${up ? 1 : 0}`, () => {
    const { map, glow } = sootTextures();
    const col = up ? GLOW_UP : GLOW;
    const soot = new THREE.MeshStandardMaterial({ map, roughness: 0.58, metalness: 0.55, emissiveMap: glow, emissive: col, emissiveIntensity: 0.6 });
    return {
      // mejorada: el cuerpo lleva el camuflaje del Pack-a-Pava; la tapa sigue tiznada
      body: up ? VM.mats(T).camo : soot,
      soot,
      rim: new THREE.MeshStandardMaterial({ color: 0x2c2723, roughness: 0.38, metalness: 0.85 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.6), toneMapped: false }),
      // guante de cuero chamuscado (la pava quema)
      glove: new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 0.92 }),
      // el agua que hierve adentro (se ve por la mirilla) y la resistencia de cobre
      brew: new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.9), toneMapped: false }),
      coil: new THREE.MeshStandardMaterial({ color: 0x7a3a18, roughness: 0.45, metalness: 0.75, emissive: col, emissiveIntensity: 0.2 }),
      stream: new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.5), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      dial: new THREE.MeshBasicMaterial({ map: dialTexture() }),
      col,
    };
  });
}

// La esfera del manómetro: marcas, la zona colorada y "PRESIÓN".
function dialTexture() {
  return once('dial', () => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#e8dcc0';
    x.beginPath();
    x.arc(64, 64, 63, 0, Math.PI * 2);
    x.fill();
    // de -125° a +125°, con lo último en colorado
    const a0 = Math.PI / 2 + (35 * Math.PI) / 180;
    const span = (290 * Math.PI) / 180;
    x.lineWidth = 9;
    x.strokeStyle = '#a3261c';
    x.beginPath();
    x.arc(64, 64, 48, a0 + span * 0.8, a0 + span);
    x.stroke();
    x.strokeStyle = '#1c1812';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (span * i) / 10;
      const r0 = i % 5 === 0 ? 38 : 44;
      x.lineWidth = i % 5 === 0 ? 4 : 2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
      x.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
      x.stroke();
    }
    x.fillStyle = '#1c1812';
    x.font = 'bold 15px serif';
    x.textAlign = 'center';
    x.fillText('PRESIÓN', 64, 96);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// El porongo (la calabaza del agua) con el que se carga: el cuerpo de torno y
// el cuello curvo (así vuelca sin darlo vuelta del todo).
const PORONGO = [[0, 0], [0.02, 0.002], [0.036, 0.012], [0.044, 0.03], [0.04, 0.05], [0.028, 0.066], [0.021, 0.076], [0.024, 0.088], [0.023, 0.1], [0.016, 0.11], [0.0115, 0.114], [0, 0.114]];
const PORONGO_NECK = [[0, 0.108, 0], [0.002, 0.122, 0], [0.011, 0.134, 0], [0.026, 0.14, 0]];

// Tubo que se afina a lo largo de una curva (el pico).
function taperTube(pts, r0, r1, mat, seg = 14, rs = 10) {
  const path = new THREE.CatmullRomCurve3(pts);
  const frames = path.computeFrenetFrames(seg, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = path.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rs; j++) {
      const a = i * (rs + 1) + j;
      const b = a + rs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { mesh: new THREE.Mesh(g, mat), path };
}

function buildPava(up, T) {
  const M = VM.mats(T);
  const P = pavaMats(T, up);
  const mate = new THREE.Group();
  // la pava va girada: el pico sale hacia la izquierda, que se vea de perfil
  // (la mano no gira: el cuerpo es redondo)
  const kettle = new THREE.Group();
  kettle.rotation.y = 0.85;
  mate.add(kettle);
  kettle.add(VM.lathe(BODY, P.body, 28));
  // flejes: el del fondo y el de la cintura
  for (const [y, r] of [[0.004, 0.047], [0.045, 0.0545]]) {
    const t = VM.tor(r, 0.0022, P.rim, 6, 32);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    kettle.add(t);
  }
  // la tapa, con la bisagra atrás (se abre al cargarla)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.078, 0.028);
  kettle.add(lidPivot);
  const lid = VM.lathe(LID, P.soot, 24);
  lid.position.set(0, -0.078, -0.028);
  lidPivot.add(lid);
  const knob = VM.sph(0.0072, P.glow, 10, 8);
  knob.position.set(0, 0.0955 - 0.078, -0.028);
  lidPivot.add(knob);
  // la juntura de la tapa: una línea de luz
  const seam = VM.tor(0.0287, 0.0011, P.glow, 4, 32);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.0776;
  kettle.add(seam);
  // el pico: sale de abajo, adelante, y sube
  const spout = taperTube([new THREE.Vector3(0, 0.022, -0.044), new THREE.Vector3(0, 0.036, -0.068), new THREE.Vector3(0, 0.058, -0.088), new THREE.Vector3(0, 0.08, -0.1)], 0.012, 0.0062, P.body);
  kettle.add(spout.mesh);
  const end = spout.path.getPointAt(1);
  const tan = spout.path.getTangentAt(1).normalize();
  const lip = VM.tor(0.0064, 0.0016, P.rim, 6, 16);
  lip.quaternion.setFromUnitVectors(Z_AXIS, tan);
  lip.position.copy(end);
  kettle.add(lip);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0056, 14), P.glow);
  hole.quaternion.setFromUnitVectors(Z_AXIS, tan);
  hole.position.copy(end).addScaledVector(tan, -0.0008);
  kettle.add(hole);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(end).addScaledVector(tan, 0.006);
  kettle.add(muzzle);
  // el resplandor del pico (se ve de cualquier lado)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: new THREE.Color(P.col).multiplyScalar(1.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.7 }));
  halo.position.copy(end).addScaledVector(tan, 0.004);
  halo.scale.setScalar(0.028);
  kettle.add(halo);
  // el asa: un arco de adelante para atrás por arriba de la tapa, con mango de madera
  const handle = VM.tor(0.042, 0.0032, P.rim, 6, 20, Math.PI);
  handle.rotation.y = Math.PI / 2;
  handle.position.y = 0.062;
  kettle.add(handle);
  const grip = VM.cyl(0.0068, 0.0068, 0.04, M.woodDark, 10);
  grip.rotation.x = Math.PI / 2;
  grip.position.y = 0.104;
  kettle.add(grip);
  for (const s of [-1, 1]) {
    const rv = VM.sph(0.004, P.rim, 8, 6);
    rv.position.set(0, 0.062, s * 0.044);
    kettle.add(rv);
  }
  // la mano (con guante) la sostiene desde abajo, como a un mate
  mate.add(VM.cupHand({ ...M, skin: P.glove, nail: P.glove }, (y) => VM.profileRadius(BODY, y), 0.074));
  // (el costado de la pava que ve el jugador, en el espacio de la pava: el pico
  // sale hacia la izquierda y un poco para atrás)
  const face = new THREE.Vector3(-0.964, 0, 0.267);
  const onBody = (dir, y, out = 0) => dir.clone().multiplyScalar(VM.profileRadius(BODY, y) + out).setY(y);
  // la resistencia de cobre enroscada abajo (se prende al tirar y al hervir)
  const helix = [];
  for (let i = 0; i <= 96; i++) {
    const u = i / 96;
    const a = u * Math.PI * 2 * 3.5;
    const y = 0.009 + u * 0.024;
    const r = VM.profileRadius(BODY, y) + 0.0022;
    helix.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  kettle.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 140, 0.0016, 6), P.coil));
  // la mirilla: un ojo de buey de bronce con el agua que hierve adentro
  const port = new THREE.Group();
  port.position.copy(onBody(face, 0.03, -0.0012));
  port.quaternion.setFromUnitVectors(Z_AXIS, face);
  kettle.add(port);
  port.add(VM.tor(0.0158, 0.0026, M.bronze, 8, 28));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rv = VM.sph(0.0017, M.bronze, 6, 4);
    rv.position.set(Math.cos(a) * 0.0158, Math.sin(a) * 0.0158, 0.0022);
    port.add(rv);
  }
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.0152, 24), P.brew);
  brew.position.z = -0.0008;
  port.add(brew);
  const bubbles = [];
  for (let i = 0; i < 8; i++) {
    const b = VM.sph(0.0012 + (i % 3) * 0.0007, P.glow, 6, 4);
    b.userData.ph = i / 8;
    b.userData.x = (((i * 37) % 11) / 11 - 0.5) * 0.02;
    b.userData.v = 0.7 + ((i * 13) % 7) / 10;
    port.add(b);
    bubbles.push(b);
  }
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0152, 24), M.glass);
  glass.position.z = 0.0012;
  port.add(glass);
  // el manómetro arriba, más hacia el asa: la aguja marca las cargas que quedan
  const gDir = face.clone().applyAxisAngle(Y_AXIS, 0.62);
  const gauge = new THREE.Group();
  gauge.position.copy(onBody(gDir, 0.052, 0.006));
  gauge.quaternion.setFromUnitVectors(Z_AXIS, gDir.clone().setY(0.55).normalize());
  kettle.add(gauge);
  const stem = VM.cyl(0.003, 0.003, 0.009, M.bronze, 8);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = -0.005;
  gauge.add(stem);
  const bezel = VM.cyl(0.0112, 0.0112, 0.004, M.bronze, 20);
  bezel.rotation.x = Math.PI / 2;
  gauge.add(bezel);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.0098, 24), P.dial);
  dial.position.z = 0.0021;
  gauge.add(dial);
  const needle = new THREE.Group();
  needle.position.z = 0.0026;
  gauge.add(needle);
  const nd = VM.box(0.0011, 0.0082, 0.0005, M.red);
  nd.position.y = 0.0036;
  needle.add(nd);
  needle.add(VM.sph(0.0014, M.dark, 6, 4));
  const cover = new THREE.Mesh(new THREE.CircleGeometry(0.0098, 24), M.glass);
  cover.position.z = 0.0032;
  gauge.add(cover);
  // el porongo para cargarla, en la otra mano (aparece solo al recargar)
  const porongo = new THREE.Group();
  porongo.visible = false;
  porongo.scale.setScalar(0.8);
  porongo.add(VM.lathe(PORONGO, M.gourd, 22));
  const nk = taperTube(PORONGO_NECK.map((p) => new THREE.Vector3(...p)), 0.012, 0.0092, M.gourd, 12, 12);
  porongo.add(nk.mesh);
  const nEnd = nk.path.getPointAt(1);
  const nTan = nk.path.getTangentAt(1).normalize();
  const strap = VM.tor(0.0222, 0.0026, M.leather, 6, 22);
  strap.rotation.x = Math.PI / 2;
  strap.position.y = 0.076;
  porongo.add(strap);
  const lipP = VM.tor(0.0094, 0.0019, M.leather, 6, 16);
  lipP.quaternion.setFromUnitVectors(Z_AXIS, nTan);
  lipP.position.copy(nEnd);
  porongo.add(lipP);
  // (la mano del lado de afuera; el brazo, pensado para cuando está volcado:
  // sale por la izquierda de la pantalla, no por arriba)
  porongo.add(VM.wrapHand({ ...M, skin: P.glove, nail: P.glove }, { radius: 0.041, y0: 0.006, side: Math.PI, dir: 1, arm: new THREE.Vector3(0.22, -0.92, -0.1), scale: 1.05 }));
  const neck = new THREE.Object3D();
  neck.position.copy(nEnd).addScaledVector(nTan, 0.004);
  porongo.add(neck);
  mate.add(porongo);
  // el chorro del porongo a la boca de la pava
  const streamGeo = new THREE.CylinderGeometry(1, 0.7, 1, 8, 1, true);
  streamGeo.translate(0, 0.5, 0);
  const stream = new THREE.Mesh(streamGeo, P.stream);
  stream.visible = false;
  mate.add(stream);
  // el vapor que sale del pico y de la tapa
  const steam = [0, 1, 2, 3, 4, 5].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xd8e6e0, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.ph = i / 6;
    s.userData.spout = i % 2 === 0;
    kettle.add(s);
    return s;
  });
  // la boca para el chorro del termo al cargarla
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 0.086, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(0.92 * VM_POSE.scale);
  // un poco más arriba y al medio que un mate (es más ancha)
  tilt.position.set(-0.012, 0.014, 0);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return {
    root: tilt,
    muzzle,
    anim: { spin: [], glow: [hole], wobble: null },
    upgraded: !!up,
    tip,
    mouth,
    mate,
    bombGroup: null,
    yerba: null,
    pava: { lidPivot, knob, steam, halo, soot: P.soot, end: end.clone(), tan: tan.clone(), mat: P, bubbles, needle, porongo, neck, stream, mouth, base: mate.position.clone() },
  };
}

registerMate('liquidificador', (up, T) => buildPava(up, T));

// ---------------- lo que vuela y lo que queda ----------------
function boltMats(g, up) {
  return once(`bolt${up ? 1 : 0}`, () => {
    const col = up ? GLOW_UP : GLOW;
    const add = (k, o = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    return {
      core: add(2.6),
      halo: add(1.1, 0.55),
      sprite: new THREE.SpriteMaterial({ map: g.textures.dot, color: new THREE.Color(col).multiplyScalar(1.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.7 }),
    };
  });
}
const ballGeo = () => once('ballGeo', () => new THREE.SphereGeometry(1, 12, 9));
const puddleGeo = () => once('puddleGeo', () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
const ringGeo = () => once('ringGeo', () => new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2));

function puddleMat(up) {
  const base = once(`puddle${up ? 1 : 0}`, () => {
    const { map, glow } = sludgeTextures();
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: up ? GLOW_UP : GLOW, emissiveIntensity: 1, roughness: 0.22, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return m;
  });
  return base.clone();
}

// Los huesos que saltan del charco: calavera, huesos largos y costillas (un
// InstancedMesh de cada uno: tres llamadas de dibujo para todos).
function boneMeshes(g) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6ccb0, roughness: 0.6, emissive: 0x0c1c12 });
  const skull = new THREE.SphereGeometry(0.1, 10, 8);
  skull.scale(1, 0.88, 1.18);
  const geos = [skull, new THREE.CapsuleGeometry(0.02, 0.3, 3, 6).rotateZ(Math.PI / 2), new THREE.TorusGeometry(0.11, 0.012, 4, 10, Math.PI * 0.9)];
  return geos.map((geo) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX_BONES);
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.userData.reflect = false;
    g.scene.add(m);
    return m;
  });
}

// ---------------- en uso ----------------
export default class Liquidificador {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.bolts = [];
    this.puddles = [];
    this.bones = [];
    this.rings = [];
    this.boneMesh = null;
    this.heatT = 0;
    this.toughN = 0;
    this.warnT = 0;
    this.burnSndT = 0;
    this.kick = 0;
    this.sceneRef = null;
  }

  // El vapor toma la luz del lugar (de noche, la de la luna; si no, blanco
  // brillaría solo) con un toque del verde de la pava.
  steamCol(k = 1) {
    const c = this.g.water?.lit || [0.6, 0.62, 0.66];
    return [Math.min(1, c[0] * 0.8 * k + 0.02), Math.min(1, c[1] * 0.8 * k + 0.035), Math.min(1, c[2] * 0.8 * k + 0.03)];
  }

  puff(p, n, spread, k = 1) {
    const col = this.steamCol(k);
    for (let i = 0; i < n; i++) {
      this.g.fx.alpha.spawn(p.x + rnd() * spread, p.y, p.z + rnd() * spread, rnd() * 0.3, 0.6 + Math.random() * 0.6, rnd() * 0.3, { color: col, size: 0.08, size1: 0.45, life: 1.1 + Math.random(), alpha: 0.16, drag: 0.8 });
    }
  }

  // ---------------- el tiro ----------------
  fire(st, origin, fwd, muzzle) {
    const g = this.g;
    const L = st.liquid;
    const target = this.w.aimPoint(origin, fwd, st.range);
    const d = target.sub(muzzle);
    const dist = d.length();
    const vel = d.normalize().multiplyScalar(L.speed);
    // va derecho a la mira: se levanta lo que el arco la va a bajar hasta ahí
    vel.y += 0.5 * L.gravity * (dist / L.speed);
    const up = st.upgraded ? 1 : 0;
    this.addBolt(muzzle.clone(), vel, up, 1, false, false);
    g.net?.share('liq', { k: 'b', m: r2(muzzle), v: r2(vel), u: up });
    g.fx.flash(muzzle, up ? GLOW_UP : GLOW, 6, 0.12, 6);
    // la bocanada de vapor, un poco adelante (pegada a la cámara tapa todo)
    const sc = this.steamCol();
    for (let i = 0; i < 4; i++) {
      g.fx.alpha.spawn(muzzle.x + fwd.x * 0.7, muzzle.y + fwd.y * 0.7, muzzle.z + fwd.z * 0.7, fwd.x * 1.5 + rnd() * 0.6, 0.5 + Math.random() * 0.6, fwd.z * 1.5 + rnd() * 0.6, { color: sc, size: 0.04, size1: 0.2, life: 0.5 + Math.random() * 0.3, alpha: 0.15, drag: 2 });
    }
    this.sndFire(null, up);
    this.kick = 1;
  }

  addBolt(pos, vel, up, scale, ghost, child) {
    const g = this.g;
    const M = boltMats(g, up);
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(ballGeo(), M.core);
    core.scale.setScalar(0.085 * scale);
    const halo = new THREE.Mesh(ballGeo(), M.halo);
    halo.scale.setScalar(0.16 * scale);
    const glow = new THREE.Sprite(M.sprite);
    glow.scale.setScalar(1.1 * scale);
    mesh.add(core, halo, glow);
    mesh.position.copy(pos);
    mesh.userData.reflect = false;
    g.scene.add(mesh);
    const L = weaponStats('liquidificador', up).liquid;
    this.bolts.push({ mesh, pos: mesh.position, prev: pos.clone(), vel: vel.clone(), t: 0, up, scale, ghost, child, L, lightT: 0 });
  }

  stepBolt(b, dt) {
    const g = this.g;
    b.t += dt;
    b.prev.copy(b.pos);
    b.vel.y -= b.L.gravity * dt;
    b.pos.addScaledVector(b.vel, dt);
    if (g.zombies.inRadius(b.pos, 0.45 * b.scale + 0.25, near).length) return this.burst(b, b.pos.clone());
    const seg = tmpV.subVectors(b.pos, b.prev);
    const len = seg.length();
    if (len > 1e-5) {
      const dir = seg.divideScalar(len);
      let wallT = g.world.raycast(b.prev, dir, len, hitTmp);
      if (!Number.isFinite(wallT)) wallT = Infinity;
      const zh = g.zombies.raycast(b.prev, dir, Math.min(wallT, len));
      const zt = zh.length ? zh[0].t : Infinity;
      const wt = g.water ? g.water.hitRay(b.prev, dir, Math.min(wallT, len)) : null;
      if (wt !== null && wt < zt) return this.burst(b, b.prev.clone().addScaledVector(dir, wt));
      if (zh.length) return this.burst(b, b.prev.clone().addScaledVector(dir, zt));
      if (wallT < len) return this.burst(b, hitTmp.point.clone().addScaledVector(hitTmp.normal, 0.12));
    }
    const fy = g.world.floorAt(b.pos.x, b.pos.z, b.prev.y);
    if (b.pos.y <= fy + 0.05) return this.burst(b, new THREE.Vector3(b.pos.x, fy + 0.08, b.pos.z));
    if (b.t > 3) return this.burst(b, b.pos.clone());
    // la estela: gotas que se desprenden y vapor
    const c3 = b.up ? [0.45, 0.72, 1] : [0.55, 1, 0.75];
    for (let i = 0; i < 2; i++) {
      const k = Math.random();
      g.fx.add.spawn(b.prev.x + (b.pos.x - b.prev.x) * k, b.prev.y + (b.pos.y - b.prev.y) * k, b.prev.z + (b.pos.z - b.prev.z) * k, rnd() * 1.2, rnd() * 1.2 + 0.3, rnd() * 1.2, { color: c3, size: 0.07 * b.scale, size1: 0.01, life: 0.35 + Math.random() * 0.2, gravity: 6 });
    }
    if (Math.random() < 0.7) g.fx.alpha.spawn(b.prev.x, b.prev.y, b.prev.z, rnd() * 0.3, 0.5, rnd() * 0.3, { color: this.steamCol(), size: 0.12 * b.scale, size1: 0.6 * b.scale, life: 0.8, alpha: 0.15, drag: 1.2, gravity: -0.3 });
    b.lightT -= dt;
    if (b.lightT <= 0) {
      b.lightT = 0.1;
      g.fx.flash(b.pos, b.up ? GLOW_UP : GLOW, 4 * b.scale, 0.14, 7);
    }
    b.mesh.scale.setScalar(1 + Math.sin(b.t * 40) * 0.1);
    return false;
  }

  // Revienta: gotas, vapor, el anillo, el agua que hierve y los muertos que se derriten.
  burst(b, at) {
    const g = this.g;
    const L = b.L;
    const R = L.radius * b.scale;
    b.mesh.removeFromParent();
    const col = b.up ? GLOW_UP : GLOW;
    const c3 = b.up ? [0.5, 0.75, 1] : [0.6, 1, 0.78];
    g.fx.flash(at, col, 26 * b.scale, 0.35, 14);
    const n = Math.round(46 * b.scale);
    for (let i = 0; i < n; i++) {
      tmpV.set(rnd(), Math.random() * 0.9 + 0.1, rnd()).normalize().multiplyScalar((2 + Math.random() * 5) * b.scale);
      g.fx.add.spawn(at.x, at.y + 0.1, at.z, tmpV.x, tmpV.y, tmpV.z, { color: c3, size: 0.06 + Math.random() * 0.06, size1: 0.01, life: 0.5 + Math.random() * 0.5, gravity: 9, bounce: 0.2 });
    }
    const sc = this.steamCol(1.2);
    for (let i = 0; i < 14 * b.scale; i++) {
      g.fx.alpha.spawn(at.x + rnd() * R * 0.6, at.y + 0.2, at.z + rnd() * R * 0.6, rnd() * 1.6, 0.8 + Math.random() * 1.2, rnd() * 1.6, { color: sc, size: 0.3, size1: 1.3 * b.scale, life: 1.4 + Math.random(), alpha: 0.18, drag: 1.4, gravity: -0.35 });
    }
    this.sndBurst(at, b.up, b.scale);
    const P = g.player;
    if (P?.pos) {
      const d = P.pos.distanceTo(at);
      if (d < 12) g.fx.addShake(0.25 * (1 - d / 12) * b.scale);
    }
    // en el agua: salpica y hierve (el hervor lo reparte el que tiró)
    const W = g.water;
    let ringY = g.world.floorAt(at.x, at.z, at.y + 0.3);
    if (W && W.depthAt(at.x, at.z) > 0.03 && at.y < W.level + 1.2) {
      W.splash(at.x, at.z, 1.3 * b.scale);
      ringY = Math.max(ringY, W.level);
      if (!b.ghost) this.boil(at.x, at.z, L.boil * (b.child ? 0.6 : 1), L.secs * (b.child ? 0.7 : 1));
    }
    if (Math.abs(at.y - ringY) < 1.5) this.addRing(at.x, ringY + 0.05, at.z, R * 1.2, col);
    // los muertos del reventón (que se vean desde el reventón) se derriten
    let hit = false;
    const list = g.zombies.inRadius(at, R, near).map((e) => e.z);
    const from = tmpO.set(at.x, at.y + 0.3, at.z).clone();
    for (const z of list) {
      tmpV2.set(z.pos.x, (z.pos.y || 0) + 1 * (z.scale || 1), z.pos.z);
      if (!g.world.clear(from, tmpV2)) continue;
      if (b.ghost) {
        if (!tough(z)) this.meltFx(z.pos, z.scale || 1, !!z.dog, b.up);
      } else {
        this.melt(z, at, b.up);
        hit = true;
      }
    }
    if (hit) g.hud.hitmarker(false);
    // (al que la tiró no lo quema: el usuario lo pidió así)
    // mejorada: tres gotas más que revientan de nuevo
    if (L.split && !b.child) {
      for (let i = 0; i < L.split; i++) {
        const a = (i / L.split) * Math.PI * 2 + Math.random();
        const s = 4 + Math.random() * 3;
        this.addBolt(tmpV.set(at.x, at.y + 0.3, at.z).clone(), new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 3, Math.sin(a) * s), b.up, 0.55, b.ghost, true);
      }
    }
    return true;
  }

  // Un muerto del reventón: los comunes se derriten; los jefes, escaldados.
  melt(z, at, up) {
    const g = this.g;
    const dir = new THREE.Vector3(z.pos.x - at.x, 0, z.pos.z - at.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    if (tough(z)) {
      g.zombies.damage(z, 2500, { type: 'scald', dir });
      return;
    }
    const pos = z.pos.clone();
    const k = z.scale || 1;
    const dog = !!z.dog;
    g.zombies.damage(z, 1e9, { type: 'melt', dir });
    this.meltFx(pos, k, dog, up);
  }

  // Lo que se ve al derretirse: el charco que burbujea, los huesos y el vapor.
  meltFx(pos, k, dog, up) {
    const g = this.g;
    const W = g.water;
    let y = g.world.floorAt(pos.x, pos.z, (pos.y || 0) + 0.5);
    let wet = false;
    if (W && W.depthAt(pos.x, pos.z) > 0.05 && W.level > y) {
      y = W.level;
      wet = true;
    }
    this.addPuddle(pos.x, y, pos.z, (dog ? 0.9 : 0.75) * k, wet, up);
    // los huesos saltan cuando el cuerpo ya se escurrió en el charco (el
    // muerto se derrite parado: Zombies.meltStep); el perro, enseguida
    const x = pos.x;
    const z = pos.z;
    const bones = () => {
      const nb = dog ? 3 : 5;
      for (let i = 0; i < nb; i++) this.addBone(i === 0 && !dog ? 0 : i < 3 ? 1 : 2, x, y + 0.3 * k, z, k, wet);
      this.puff(tmpV.set(x, y + 0.2, z), 6, 0.5 * k, 1.1);
    };
    if (dog) bones();
    else g.later(BONES_AT, bones);
    this.puff(tmpV.set(pos.x, y + 0.3, pos.z), 10, 0.7 * k, 1.2);
    const c3 = up ? [0.45, 0.7, 1] : [0.5, 1, 0.7];
    for (let i = 0; i < 14; i++) g.fx.add.spawn(pos.x + rnd() * 0.5, y + 0.4 + Math.random() * 1.2 * k, pos.z + rnd() * 0.5, rnd() * 2, 1 + Math.random() * 2, rnd() * 2, { color: c3, size: 0.05, size1: 0.01, life: 0.5 + Math.random() * 0.4, gravity: 7 });
    g.fx.flash(tmpV.set(pos.x, y + 0.8, pos.z), up ? GLOW_UP : GLOW, 6, 0.4, 6);
    this.sndMelt(tmpV.set(pos.x, y + 0.5, pos.z));
  }

  addPuddle(x, y, z, r, wet, up) {
    const g = this.g;
    if (this.puddles.length >= MAX_PUDDLES) this.dropPuddle(0);
    const m = new THREE.Mesh(puddleGeo(), puddleMat(up));
    m.position.set(x, y + (wet ? 0.012 : 0.02), z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.01);
    m.userData.reflect = false;
    g.scene.add(m);
    this.puddles.push({ m, x, z, y, t: 0, life: wet ? 5 : 8, r, wet, bubT: 0 });
  }

  dropPuddle(i) {
    const p = this.puddles[i];
    p.m.removeFromParent();
    p.m.material.dispose();
    this.puddles.splice(i, 1);
  }

  stepPuddle(p, dt) {
    const g = this.g;
    p.t += dt;
    const grow = smooth(p.t / 0.5);
    const fade = 1 - smooth((p.t - (p.life - 1.5)) / 1.5);
    // en el agua se va desparramando (y flota con las olas)
    p.m.scale.setScalar(Math.max(0.01, p.r * (0.3 + 0.7 * grow) * (p.wet ? 1 + p.t * 0.12 : 1)));
    if (p.wet && g.water) p.m.position.y = g.water.heightAt(p.x, p.z) + 0.012;
    p.m.material.opacity = 0.92 * fade;
    p.m.material.emissiveIntensity = (0.9 * Math.max(0, 1 - p.t / 3) + 0.12) * fade;
    // burbujas que revientan y un hilo de vapor
    p.bubT -= dt;
    if (p.bubT <= 0 && fade > 0.3) {
      p.bubT = 0.05 + Math.random() * 0.08 * (1 + p.t);
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * p.r * 0.7;
      const y = p.m.position.y;
      g.fx.add.spawn(p.x + Math.cos(a) * d, y + 0.02, p.z + Math.sin(a) * d, 0, 0.25, 0, { color: [0.3, 0.45, 0.24], size: 0.02, size1: 0.07, life: 0.25 });
      if (Math.random() < 0.3) this.puff(tmpV.set(p.x + Math.cos(a) * d, y + 0.05, p.z + Math.sin(a) * d), 1, 0.2);
    }
    return p.t >= p.life;
  }

  addBone(type, x, y, z, k, wet) {
    const g = this.g;
    if (!this.boneMesh || this.sceneRef !== g.scene) {
      this.boneMesh = boneMeshes(g);
      this.sceneRef = g.scene;
    }
    const same = this.bones.filter((b) => b.type === type);
    if (same.length >= MAX_BONES) this.bones.splice(this.bones.indexOf(same[0]), 1);
    const W = g.water;
    const floor = wet ? W.level : g.world.floorAt(x, z, y);
    const bed = wet ? W.level - W.depthAt(x, z) : floor;
    this.bones.push({
      type,
      pos: new THREE.Vector3(x + rnd() * 0.3, y, z + rnd() * 0.3),
      vel: new THREE.Vector3(rnd() * 3, 2.5 + Math.random() * 2.5, rnd() * 3),
      rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3(rnd() * 14, rnd() * 14, rnd() * 14),
      t: 0,
      life: 6 + Math.random() * 2,
      k: k * (0.85 + Math.random() * 0.3),
      floor,
      bed,
      wet,
      rest: false,
    });
  }

  stepBones(dt) {
    if (!this.boneMesh) return;
    const counts = [0, 0, 0];
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const b = this.bones[i];
      b.t += dt;
      if (b.t >= b.life) {
        this.bones.splice(i, 1);
        continue;
      }
      if (!b.rest) {
        b.vel.y -= 9.8 * dt;
        b.pos.addScaledVector(b.vel, dt);
        b.rot.addScaledVector(b.spin, dt);
        if (b.pos.y <= b.floor) {
          b.pos.y = b.floor;
          if (!b.wet && b.vel.y < -2) {
            b.vel.set(b.vel.x * 0.4, -b.vel.y * 0.3, b.vel.z * 0.4);
            b.spin.multiplyScalar(0.4);
          } else {
            // quedan acostados (la costilla, de canto no)
            b.rest = true;
            b.rot.set(b.type === 2 ? Math.PI / 2 : rnd() * 0.3, b.rot.y, rnd() * 0.3);
          }
        }
      } else if (b.wet) b.pos.y = Math.max(b.bed, b.pos.y - dt * 0.35);
      // al final se hunden en el barro
      if (!b.wet && b.t > b.life - 1.5) b.pos.y -= dt * 0.12;
      const s = b.k * Math.min(1, (b.life - b.t) / 0.8);
      tmpQ.setFromEuler(tmpE.set(b.rot.x, b.rot.y, b.rot.z));
      tmpM.compose(b.pos, tmpQ, tmpS.set(s, s, s));
      this.boneMesh[b.type].setMatrixAt(counts[b.type]++, tmpM);
    }
    for (let t = 0; t < 3; t++) {
      const m = this.boneMesh[t];
      m.count = counts[t];
      m.visible = counts[t] > 0;
      if (counts[t]) m.instanceMatrix.needsUpdate = true;
    }
  }

  addRing(x, y, z, r, col) {
    const g = this.g;
    if (this.rings.length >= MAX_RINGS) {
      const o = this.rings.shift();
      o.m.removeFromParent();
      o.m.material.dispose();
    }
    const m = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.userData.reflect = false;
    g.scene.add(m);
    this.rings.push({ m, t: 0, r });
  }

  // ---------------- el agua que hierve ----------------
  // Arranca a hervir acá (el que tiró) y se lo pasa a los demás.
  boil(x, z, r, secs) {
    const g = this.g;
    this.startBoil(x, z, r, secs);
    g.net?.share('liq', { k: 'boil', x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2), s: +secs.toFixed(1) });
  }

  startBoil(x, z, r, secs) {
    const g = this.g;
    const W = g.water;
    if (!W) return;
    W.boil(x, z, r, secs);
    this.sndBoilStart(tmpV.set(x, W.level, z));
    // el easter egg lo cuenta el anfitrión (o el que juega solo)
    if (!g.net?.guest) g.ee?.onBoil?.(new THREE.Vector3(x, W.level, z), r);
  }

  hotAt(p, above) {
    const W = this.g.water;
    if (W.depthAt(p.x, p.z) < 0.05 || (p.y || 0) > W.level + above) return 0;
    return W.heatAt(p.x, p.z);
  }

  // El agua hirviendo quema: a mí (cada uno se quema solo) y a los muertos (el anfitrión).
  heat(dt) {
    const g = this.g;
    const W = g.water;
    this.warnT -= dt;
    this.burnSndT -= dt;
    if (!W || !W.boils.length) return;
    this.heatT -= dt;
    if (this.heatT > 0) return;
    this.heatT = TICK;
    // (a los jugadores el agua que hierve no los quema: solo burbujea alrededor)
    const P = g.player;
    if (P?.pos && P.alive !== false && !P.downed) {
      const h = this.hotAt(P.pos, 0.35);
      if (h > 0.08) this.puff(tmpV.set(P.pos.x, W.level + 0.1, P.pos.z), 2, 0.6);
    }
    if (g.net?.guest) return;
    // los jefes se escaldan más despacio
    this.toughN = (this.toughN + 1) % 3;
    for (const z of g.zombies.pool) this.cook(z, W);
    if (g.zombies.boss) this.cook(g.zombies.boss, W);
  }

  cook(z, W) {
    if (!z.active || z.dead) return;
    const h = this.hotAt(z.pos, 0.4);
    if (h < 0.08) return;
    const g = this.g;
    if (tough(z)) {
      if (this.toughN === 0) g.zombies.damage(z, 2500, { type: 'scald', noPoints: true });
      return;
    }
    const pos = z.pos.clone();
    const k = z.scale || 1;
    const dog = !!z.dog;
    g.zombies.damage(z, (z.maxHp || 100) * (0.25 + h) + 40, { type: 'melt', noPoints: true });
    if (z.dead) {
      this.meltFx(pos, k, dog, false);
      g.net?.event('liq', { k: 'm', p: r2(pos), s: +k.toFixed(2), d: dog ? 1 : 0 });
      g.ee?.onBoilKill?.(z, pos);
    } else if (Math.random() < 0.5) this.puff(tmpV.set(z.pos.x, W.level + 0.2, z.pos.z), 2, 0.5);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) if (this.stepBolt(this.bolts[i], dt)) this.bolts.splice(i, 1);
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      if (this.stepPuddle(this.puddles[i], dt)) this.dropPuddle(i);
    }
    this.stepBones(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / 0.55;
      const k = Math.min(1, r.t);
      r.m.scale.setScalar(0.3 + (1 - (1 - k) * (1 - k)) * r.r);
      r.m.material.opacity = 1 - k;
      if (k >= 1) {
        r.m.removeFromParent();
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    this.heat(dt);
    this.animate(dt);
  }

  // La recarga (0 a 1): cuándo pasa cada cosa.
  //  · 0,03-0,12: se levanta la pava y salta la tapa con un chorro de vapor;
  //  · 0,08-0,26: entra la otra mano con el porongo; 0,26-0,6 lo vuelca (el
  //    chorro verde a la boca, la aguja del manómetro sube);
  //  · 0,6-0,74: el porongo se va; 0,7: la tapa se cierra de un golpe;
  //  · 0,76-0,97: hierve: tiembla toda, la tapa golpetea, silba y echa vapor.
  static reloadK(w) {
    return w.state === 'reload' && w.stats?.kind === 'liquid' ? Math.min(1, w.stateT / Math.max(0.1, w.reloadTime)) : -1;
  }

  // Lo que se mueve la pava en la mano al recargar (Weapons la suma a la pose):
  // [x, y, z, rx, ry, rz]
  reloadPose(k, t) {
    const up = smooth(k / 0.12) * (1 - smooth((k - 0.74) / 0.12));
    const slam = bump(k, 0.715, 0.03);
    const boil = smooth((k - 0.76) / 0.05) * (1 - smooth((k - 0.93) / 0.07));
    const o = this.poseOut || (this.poseOut = [0, 0, 0, 0, 0, 0]);
    o[0] = -0.045 * up + Math.sin(t * 57) * 0.0035 * boil;
    o[1] = 0.03 * up - 0.012 * slam + Math.sin(t * 43) * 0.003 * boil;
    o[2] = 0.02 * up;
    o[3] = 0.3 * up + slam * 0.06;
    o[4] = -0.12 * up;
    o[5] = 0.12 * up + Math.sin(t * 61) * 0.05 * boil;
    return o;
  }

  // La pava en la mano: late la luz, sale vapor, la mirilla burbujea, la aguja
  // marca la carga, la tapa baila al tirar y la recarga (ver reloadK).
  animate(dt) {
    const w = this.w;
    const m = w.model?.pava ? w.model : null;
    this.kick = Math.max(0, this.kick - dt * 3);
    if (!m) return;
    const P = m.pava;
    const M = P.mat;
    const t = this.g.time;
    const k = Liquidificador.reloadK(w);
    const rel = k >= 0;
    const open = rel ? smooth((k - 0.03) / 0.07) * (1 - smooth((k - 0.69) / 0.025)) : 0;
    const boil = rel ? smooth((k - 0.76) / 0.04) * (1 - smooth((k - 0.93) / 0.07)) : 0;
    // la tapa: al cerrarse rebota y al hervir golpetea
    const bounce = rel ? bump(k, 0.735, 0.03) * 0.3 : 0;
    const clatter = boil * Math.max(0, Math.sin(t * 38)) * 0.22;
    const rattle = this.kick > 0 ? Math.max(0, Math.sin(t * 60)) * this.kick * 0.18 : 0;
    P.lidPivot.rotation.x = -open * 1.3 - bounce - clatter - rattle;
    // el brillo: late, sube al tirar y a pleno cuando hierve
    const hot = this.kick + boil * 1.4;
    P.soot.emissiveIntensity = 0.45 + Math.sin(t * 2.1) * 0.12 + Math.sin(t * 7.3) * 0.05 + hot * 0.7;
    M.coil.emissiveIntensity = 0.15 + Math.max(0, Math.sin(t * 1.7)) * 0.1 + hot * 1.1;
    P.halo.material.opacity = 0.5 + Math.sin(t * 3.1) * 0.12 + this.kick * 0.4 + boil * 0.4;
    P.halo.scale.setScalar(0.026 + this.kick * 0.02 + boil * 0.02);
    // la mirilla: burbujas que suben (más rápido hirviendo)
    const speed = 0.5 + hot * 1.5;
    this.bubT = (this.bubT || 0) + dt * speed;
    for (const b of P.bubbles) {
      const u = (this.bubT * b.userData.v + b.userData.ph) % 1;
      b.position.set(b.userData.x + Math.sin(u * 9 + b.userData.ph * 20) * 0.0015, -0.013 + u * 0.026, 0);
      b.scale.setScalar(Math.sin(u * Math.PI) * (1 + hot * 0.4));
    }
    M.brewBase ||= new THREE.Color(M.col).multiplyScalar(0.9);
    M.brew.color.copy(M.brewBase).multiplyScalar(0.8 + Math.sin(t * 5) * 0.1 + hot * 0.6);
    // la aguja: las cargas que quedan (lleno queda justo antes de lo colorado);
    // al cargar sube con el agua y al hervir se pasa a lo colorado
    const st = w.stats;
    const full = st?.mag ? Math.min(1, (w.slot?.mag ?? st.mag) / st.mag) : 1;
    if (!rel) this.gaugeFrom = null;
    else if (this.gaugeFrom == null) this.gaugeFrom = full;
    const from = this.gaugeFrom ?? full;
    const want = rel ? from + (1 - from) * smooth((k - 0.28) / 0.34) + boil * (0.24 + Math.sin(t * 23) * 0.05) : full;
    this.gaugeV = (this.gaugeV ?? want) + (want - (this.gaugeV ?? want)) * Math.min(1, dt * 7) - this.kick * dt * 3;
    P.needle.rotation.z = 2.53 - Math.max(0, Math.min(1, this.gaugeV * 0.78)) * 5.06;
    // el porongo y el chorro
    const enter = rel ? smooth((k - 0.08) / 0.18) : 0;
    const leave = rel ? smooth((k - 0.6) / 0.14) : 1;
    const tip = rel ? smooth((k - 0.24) / 0.1) * (1 - smooth((k - 0.56) / 0.08)) : 0;
    const Pg = P.porongo;
    Pg.visible = rel && enter > 0.01 && leave < 0.99;
    let pouring = false;
    if (Pg.visible) {
      Pg.rotation.set(0.05, 0.15, -0.15 - tip * 1.25 + Math.sin(t * 6) * 0.03 * tip);
      // que el pico del porongo quede arriba de la boca de la pava (alto: se ve el chorro)
      const tgt = tmpA.copy(P.mouth.position).add(tmpB.set(-0.01, 0.06 + (1 - tip) * 0.05, -0.035));
      const nl = tmpB.copy(P.neck.position).multiplyScalar(Pg.scale.x).applyEuler(Pg.rotation);
      Pg.position.copy(tgt).sub(nl);
      const away = 1 - enter + leave;
      Pg.position.x -= away * 0.18;
      Pg.position.y -= away * 0.22;
      Pg.position.z += away * 0.04;
      pouring = tip > 0.88 && k < 0.585;
    }
    P.stream.visible = pouring;
    if (pouring) {
      Pg.updateMatrix();
      const a = tmpA.copy(P.neck.position).applyMatrix4(Pg.matrix);
      const b = tmpB.copy(P.mouth.position).setY(P.mouth.position.y - 0.012);
      const d = b.clone().sub(a);
      const len = d.length();
      P.stream.position.copy(a);
      P.stream.quaternion.setFromUnitVectors(Y_AXIS, d.divideScalar(len || 1));
      P.stream.scale.set(0.0042 + Math.sin(t * 40) * 0.0006, len, 0.0042);
      P.stream.material.opacity = 0.6 + Math.sin(t * 31) * 0.15;
    }
    // el vapor: del pico y de la tapa; al abrirla un chorro y al hervir, mucho
    const lidPuff = rel ? bump(k, 0.07, 0.05) : 0;
    for (const s of P.steam) {
      const u = (t * (s.userData.spout ? 0.8 + boil : 0.5 + boil * 0.8) + s.userData.ph) % 1;
      const o = s.userData.spout ? P.end : tmpV.set(0, 0.082, 0);
      s.position.set(o.x + Math.sin(u * 7 + s.userData.ph * 9) * 0.006, o.y + 0.004 + u * (0.05 + boil * 0.03), o.z + (s.userData.spout ? P.tan.z * u * 0.02 : 0));
      s.scale.setScalar((0.01 + u * 0.035) * (1 + boil * 0.8 + (s.userData.spout ? 0 : lidPuff * 1.5)));
      s.material.opacity = Math.min(0.8, Math.sin(u * Math.PI) * (s.userData.spout ? 0.3 : 0.16) * (1 + this.kick + boil * 2.2 + (s.userData.spout ? 0 : lidPuff * 3)));
    }
  }

  // Los ruidos de la recarga, en su tiempo (se cortan si se cancela).
  reloadSound(dur) {
    const A = this.g.audio;
    if (!A?.ctx) return null;
    const o = A.out({ gain: 0.85, reverb: 0.08 });
    const t0 = A.now;
    const at = (k) => t0 + dur * k;
    // la tapa salta y escupe vapor
    A.tone(o, { t: at(0.04), dur: 0.1, type: 'triangle', freq: 1250, freqEnd: 900, gain: 0.12 });
    A.noise(o, { t: at(0.04), dur: 0.05, type: 'bandpass', freq: 3200, q: 4, gain: 0.5 });
    A.noise(o, { t: at(0.05), dur: 0.55, type: 'highpass', freq: 3600, freqEnd: 2600, gain: 0.22, attack: 0.02 });
    // el agua del porongo: un chorro y el glu-glu
    A.noise(o, { t: at(0.27), dur: dur * 0.32, type: 'bandpass', freq: 1300, freqEnd: 900, q: 1.5, gain: 0.14, attack: 0.05 });
    for (let s = at(0.28); s < at(0.58); s += 0.09 + Math.random() * 0.07) A.noise(o, { t: s, dur: 0.07, type: 'bandpass', freq: 360 + Math.random() * 320, q: 6, gain: 0.55 });
    // la tapa se cierra de un golpe
    A.noise(o, { t: at(0.7), dur: 0.12, freq: 900, gain: 0.7 });
    A.tone(o, { t: at(0.7), dur: 0.1, freq: 190, freqEnd: 110, gain: 0.35 });
    A.tone(o, { t: at(0.7), dur: 0.4, type: 'triangle', freq: 2100, gain: 0.04 });
    // hierve: el borbotón, el golpeteo de la tapa y el silbido que sube
    A.noise(o, { t: at(0.76), dur: dur * 0.22, freq: 320, freqEnd: 180, gain: 0.5, brown: true, attack: 0.08 });
    for (let s = at(0.78); s < at(0.93); s += 0.05) A.noise(o, { t: s, dur: 0.03, type: 'bandpass', freq: 2400, q: 5, gain: 0.18 });
    A.tone(o, { t: at(0.83), dur: dur * 0.15, freq: 1700, freqEnd: 2600, gain: 0.06, attack: 0.08 });
    A.tone(o, { t: at(0.83), dur: dur * 0.15, freq: 1735, freqEnd: 2620, gain: 0.04, attack: 0.1 });
    return {
      stop: () => {
        try {
          o.gain.cancelScheduledValues(A.now);
          o.gain.setTargetAtTime(0, A.now, 0.02);
        } catch {
          /* ya terminó */
        }
      },
    };
  }

  // ---------------- en línea ----------------
  // La bola de otro jugador (solo se ve), su hervor (el agua hierve igual acá)
  // o un muerto que se cocinó en el agua del anfitrión.
  ghost(m) {
    if (m.k === 'b' && m.m && m.v) this.addBolt(new THREE.Vector3().fromArray(m.m), new THREE.Vector3().fromArray(m.v), m.u ? 1 : 0, 1, true, false);
    else if (m.k === 'boil') this.startBoil(m.x, m.z, m.r, m.s);
    else if (m.k === 'm' && m.p) this.meltFx(new THREE.Vector3().fromArray(m.p), m.s || 1, !!m.d, false);
  }

  clear() {
    for (const b of this.bolts) b.mesh.removeFromParent();
    this.bolts.length = 0;
    while (this.puddles.length) this.dropPuddle(0);
    for (const r of this.rings) {
      r.m.removeFromParent();
      r.m.material.dispose();
    }
    this.rings.length = 0;
    this.bones.length = 0;
    this.stepBones(0);
  }

  // ---------------- lo que se escucha ----------------
  // El tiro: el silbido de la pava (dos tonos que se pelean), el siseo y un golpe de agua.
  sndFire(pos, up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.8, reverb: 0.25 });
    const f = up ? 1850 : 2500;
    A.tone(o, { dur: 0.42, freq: f, freqEnd: f * 0.8, gain: 0.07, attack: 0.02 });
    A.tone(o, { dur: 0.42, freq: f * 1.018, freqEnd: f * 0.79, gain: 0.05, attack: 0.03 });
    A.noise(o, { dur: 0.32, type: 'highpass', freq: 3200, gain: 0.35, attack: 0.005 });
    A.tone(o, { dur: 0.16, freq: 190, freqEnd: 70, gain: 0.5 });
    A.noise(o, { t: A.now + 0.02, dur: 0.2, freq: 900, freqEnd: 250, gain: 0.4, brown: true });
  }

  // El reventón: chapuzón, siseo largo y un gemido grave (las almas que se cocinan).
  sndBurst(pos, up, k) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: pos.clone(), gain: Math.min(1, 0.6 + k * 0.4), reverb: 0.35, ref: 4 });
    A.noise(o, { dur: 0.35, freq: 1500, freqEnd: 280, gain: 0.8, attack: 0.004 });
    A.noise(o, { t: A.now + 0.05, dur: 1.1 * k, type: 'highpass', freq: 3800, freqEnd: 2600, gain: 0.35, attack: 0.02 });
    A.tone(o, { dur: 0.9, type: 'sawtooth', freq: up ? 70 : 92, freqEnd: up ? 48 : 60, gain: 0.08, attack: 0.05 });
    A.tone(o, { dur: 0.7, freq: up ? 520 : 440, freqEnd: up ? 300 : 260, gain: 0.05, attack: 0.08, detune: 12 });
  }

  // Derretirse: burbujeo espeso y un chasquido húmedo.
  sndMelt(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: pos.clone(), gain: 0.7, reverb: 0.2 });
    A.noise(o, { dur: 0.3, freq: 600, freqEnd: 180, gain: 0.6, brown: true, attack: 0.01 });
    for (let i = 0; i < 6; i++) A.noise(o, { t: A.now + 0.1 + i * (0.08 + Math.random() * 0.08), dur: 0.05 + Math.random() * 0.06, type: 'bandpass', freq: 250 + Math.random() * 450, freqEnd: 800, q: 5, gain: 0.7 });
    A.noise(o, { t: A.now + 0.05, dur: 0.9, type: 'highpass', freq: 3500, gain: 0.18, attack: 0.1 });
  }

  // El agua que arranca a hervir: un borbotón grave.
  sndBoilStart(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: pos.clone(), gain: 0.6, reverb: 0.3, ref: 4 });
    A.noise(o, { dur: 0.8, freq: 400, freqEnd: 120, gain: 0.6, brown: true, attack: 0.08 });
    A.tone(o, { dur: 0.6, freq: 110, freqEnd: 70, gain: 0.12, attack: 0.05 });
  }

  // Me estoy quemando: siseo sobre la piel.
  sndSizzle(h) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.3 + h * 0.4, reverb: 0.05 });
    A.noise(o, { dur: 0.3, type: 'highpass', freq: 4200, gain: 0.5, attack: 0.01 });
  }
}
