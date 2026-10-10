import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, boxGeo, cylGeo, rboxGeo, mergeByMaterial as mergeProps } from './props';

// (lo que cada máquina deja aparte al fusionar, porque se mueve: flatten no lo toca)
let kept = null;
function mergeByMaterial(group, keep = []) {
  kept?.push(...keep);
  return mergeProps(group, keep);
}

// Las máquinas de los perks: cada una con su forma, según lo que hace el perk
// (como en Black Ops, donde cada máquina es distinta), pero todas con el
// paquete de yerba gigante al frente (la etiqueta con la marca en joda:
// core/textures perkLabel). Todas entran en la misma caja que la máquina de
// antes, así caben en los mismos lugares de todos los mapas: 1.15 de ancho,
// 0.8 de fondo y hasta 2.6 de alto (el choque sigue siendo el de
// Interactables.buildPerks). El frente mira a +z.
//  · Taragüerno (Juggernog): la acorazada, chapas remachadas, hombreras y el
//    corazón que late en la corona.
//  · Rosamorte (Quick Revive): el botiquín de la guardia, con el monitor que
//    pita, la sirena que gira y las paletas del desfibrilador.
//  · Rapidito (Speed Cola): la turbina de aluminio, con aletas y la hélice.
//  · Doble Cruz (Double Tap): dos barriles con canillas y las canana de balas.
//  · Mulanda (Mule Kick): el establo con la cabeza de mula y la herradura.
//  · Nadarias (Deadshot): el exhibidor berreta de cartón, con cinta y el
//    blanco de dardos sin dardos (y las luces que fallan).
//  · Flopa Hermanos (PhD Flopper): la rockola con el trampolín y la bomba.
//  · Baldragón (Aliento Dragónico): la fragua de piedra con la cabeza del dragón.
//  · Nadadito (Acuanauta): el tanque de cobre con la escafandra y el ojo de
//    buey con burbujas.
//  · Chisporé (Electric Cherry): el tablero de alta tensión del penal, con la
//    llave de cuchilla y la escalera de Jacob arriba (el arco sube y se corta).
//  · Extremaunión (Dying Wish): el ataúd parado, laqueado y con filete de oro,
//    las velas, la jeringa de adrenalina clavada arriba y el relicario con el
//    corazón que late (tum-tum) bajo la aureola.
//  · Maleza Gaucha (Maizaster): la troje de maíz con los choclos entre las
//    tablas, el techito de paja, los atados de chala seca y, en el hastial,
//    dos ojos que miran desde lo oscuro (y parpadean).
//  · Trotadora (Stamin-Up): la cinta del gimnasio parada, con las cintas de
//    los costados que corren, las barandas con la toalla, la consola con el
//    reloj de km/h y la alpargata con alas girando arriba.
//  · CaoSé (Catalizador Caótico, solo Eclipse): el monolito de obsidiana
//    torcido, rajado de grietas violetas que titilan, los dos tubos del caldo
//    y arriba el eclipse: la luna negra con la corona de oro que gira, un aro
//    violeta torcido y tres esquirlas que orbitan.
// Devuelve { group, sign, bulbs, front, anim }: sign (lo que se prende con la
// luz), bulbs (los foquitos que titilan), front (el material de la etiqueta) y
// anim(t, dt, on) para lo que se mueve (solo corre con el jugador cerca).

export const MACHINE = { W: 1.15, D: 0.8, H: 2.1 };
const HALF_D = MACHINE.D / 2;
// la etiqueta del paquete: ancho, alto y centro
const LBL = { w: 0.8, h: 1.6, y: 1.16 };

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
const glow = (color, o = {}) => std({ color: 0x111111, emissive: new THREE.Color(color), emissiveIntensity: 0.1, ...o });

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sphere(r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) {
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

function torus(r, t, mat, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2, seg = 24) {
  return mesh(new THREE.TorusGeometry(r, t, 6, seg, arc), mat, x, y, z, rx, ry, rz);
}

// Una forma plana extruida (el rayo, la herradura...), parada de frente.
function shape(pts, depth, mat, x, y, z, s = 1) {
  const sh = new THREE.Shape();
  pts.forEach(([px, py], i) => (i ? sh.lineTo(px * s, py * s) : sh.moveTo(px * s, py * s)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, mat, x, y, z);
}

// Remaches en fila.
function rivets(g, mat, from, to, n, r = 0.022) {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    g.add(sphere(r, mat, from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k, 1, 1, 0.6, 6));
  }
}

// Los foquitos: esferitas que titilan (Interactables.update les cambia el brillo).
function bulbRow(g, pts, color = 0xffe6a0) {
  return pts.map(([x, y, z]) => {
    const b = sphere(0.032, std({ color: 0x222222, emissive: color, emissiveIntensity: 0 }), x, y, z, 1, 1, 1, 8);
    g.add(b);
    return b;
  });
}

function arc(n, cx, cy, z, r, a0, a1) {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  });
}

// Lo que tienen todas: la etiqueta del paquete (con su marco), la bandeja
// donde sale el mate y la ranura.
function common(g, label, { z = HALF_D, frame = null, frameW = 0.05, w = LBL.w, h = LBL.h, y = LBL.y } = {}) {
  const front = std({ map: label, roughness: 0.5, emissive: 0xffffff, emissiveMap: label, emissiveIntensity: 0.05 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), front);
  panel.position.set(0, y, z + 0.004);
  panel.receiveShadow = true;
  g.add(panel);
  if (frame) {
    g.add(mesh(boxGeo(w + frameW * 2, frameW, 0.04), frame, 0, y + h / 2 + frameW / 2, z));
    g.add(mesh(boxGeo(w + frameW * 2, frameW, 0.04), frame, 0, y - h / 2 - frameW / 2, z));
    g.add(mesh(boxGeo(frameW, h, 0.04), frame, -w / 2 - frameW / 2, y, z));
    g.add(mesh(boxGeo(frameW, h, 0.04), frame, w / 2 + frameW / 2, y, z));
  }
  const metal = std({ color: 0x8a8f96, metalness: 0.8, roughness: 0.35 });
  const black = std({ color: 0x0c0c0c, roughness: 0.9 });
  g.add(mesh(boxGeo(0.5, 0.06, 0.2), metal, 0, 0.1, HALF_D + 0.08));
  g.add(mesh(boxGeo(0.46, 0.16, 0.02), black, 0, 0.24, z + 0.006));
  return { front, panel };
}

// ---------------- una por perk ----------------
const BUILD = {
  jugg(g, P, label) {
    const paint = std({ color: 0x7c1512, metalness: 0.45, roughness: 0.45 });
    const steel = std({ color: 0x6e737a, metalness: 0.85, roughness: 0.4 });
    const dark = std({ color: 0x2a2b2e, metalness: 0.7, roughness: 0.55 });
    g.add(mesh(boxGeo(1.12, 0.14, 0.8), dark, 0, 0.07, 0));
    g.add(mesh(boxGeo(1.04, 1.9, 0.72), paint, 0, 1.09, 0));
    // las chapas de los costados, remachadas
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.04, 1.7, 0.6), steel, sx * 0.54, 1.1, 0));
      rivets(g, steel, [sx * 0.558, 0.3, 0.26], [sx * 0.558, 1.9, 0.26], 7);
      rivets(g, steel, [sx * 0.558, 0.3, -0.26], [sx * 0.558, 1.9, -0.26], 7);
    }
    const { front } = common(g, label, { z: 0.36, frame: steel, frameW: 0.07 });
    rivets(g, dark, [-0.44, 2.02, 0.4], [0.44, 2.02, 0.4], 8, 0.018);
    rivets(g, dark, [-0.44, 0.3, 0.4], [0.44, 0.3, 0.4], 8, 0.018);
    // las hombreras y la corona con el ojo de buey
    for (const sx of [-1, 1]) {
      g.add(sphere(0.3, steel, sx * 0.38, 2.04, 0, 0.9, 0.55, 1.15, 14));
      g.add(sphere(0.3, paint, sx * 0.38, 2.02, 0, 0.8, 0.5, 1.05, 14));
    }
    g.add(mesh(cylGeo(0.26, 0.3, 0.22, 16), dark, 0, 2.14, 0));
    g.add(torus(0.17, 0.035, steel, 0, 2.3, 0.2, 0, 0, 0, Math.PI * 2, 20));
    g.add(mesh(cylGeo(0.17, 0.17, 0.3, 16), dark, 0, 2.3, 0.06, Math.PI / 2));
    // el corazón (se prende con la luz y late)
    const heart = new THREE.Group();
    const hm = glow(0xff2a1a);
    heart.add(sphere(0.06, hm, -0.045, 0.02, 0, 1, 1, 0.7, 10));
    heart.add(sphere(0.06, hm, 0.045, 0.02, 0, 1, 1, 0.7, 10));
    heart.add(mesh(new THREE.ConeGeometry(0.085, 0.13, 10), hm, 0, -0.06, 0, Math.PI, 0, 0));
    heart.position.set(0, 2.3, 0.2);
    g.add(heart);
    const bulbs = bulbRow(g, arc(6, 0, 2.3, 0.2, 0.24, Math.PI * 0.15, Math.PI * 0.85), 0xffd0a0);
    mergeByMaterial(g, [heart, ...bulbs]);
    const sign = { material: hm };
    return { sign, bulbs, front, anim: (t, dt, on) => heart.scale.setScalar(on ? 1 + Math.max(0, Math.sin(t * 7.5)) ** 8 * 0.25 : 1) };
  },

  revive(g, P, label) {
    const enamel = std({ color: 0xeef2f3, roughness: 0.3 });
    const blue = std({ color: 0x2f8fd0, roughness: 0.35 });
    const red = std({ color: 0xc8261e, roughness: 0.4 });
    const dark = std({ color: 0x1b2328, roughness: 0.6 });
    g.add(mesh(rboxGeo(1.08, 2.02, 0.74, 0.08), enamel, 0, 1.01, 0));
    g.add(mesh(boxGeo(1.1, 0.3, 0.76), blue, 0, 0.15, 0));
    g.add(mesh(boxGeo(1.1, 0.06, 0.76), blue, 0, 1.98, 0));
    // las cruces de los costados
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.02, 0.36, 0.1), red, sx * 0.545, 1.35, 0));
      g.add(mesh(boxGeo(0.02, 0.1, 0.36), red, sx * 0.545, 1.35, 0));
    }
    const { front } = common(g, label, { z: 0.372, frame: blue, frameW: 0.04, h: 1.46, y: 1.08 });
    // el monitor cardíaco arriba de la etiqueta (la línea corre)
    const ecg = canvasTex(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#031a0c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#44ff88';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const pts = [[0, 34], [60, 34], [72, 26], [82, 34], [96, 34], [104, 8], [114, 58], [122, 34], [150, 34], [162, 28], [174, 34], [256, 34]];
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
    ecg.wrapS = THREE.RepeatWrapping;
    const scr = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: ecg, emissiveIntensity: 0.1, map: ecg });
    g.add(mesh(boxGeo(0.62, 0.3, 0.08), dark, 0, 1.94, 0.34));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.22), scr);
    screen.position.set(0, 1.94, 0.382);
    g.add(screen);
    // la sirena que gira arriba
    g.add(mesh(cylGeo(0.14, 0.16, 0.08, 16), dark, 0, 2.08, 0));
    const lamp = glow(0x3aa8ff, { transparent: true, opacity: 0.85 });
    g.add(mesh(cylGeo(0.11, 0.12, 0.2, 16), lamp, 0, 2.22, 0));
    g.add(sphere(0.11, lamp, 0, 2.32, 0, 1, 0.6, 1, 14));
    const beam = new THREE.Group();
    beam.position.set(0, 2.22, 0);
    beam.add(mesh(boxGeo(0.02, 0.14, 0.16), std({ color: 0xdfe8ff, metalness: 1, roughness: 0.1 }), 0, 0, 0.04));
    g.add(beam);
    // las paletas del desfibrilador colgadas del costado derecho
    for (const dz of [-0.14, 0.14]) {
      g.add(mesh(boxGeo(0.05, 0.2, 0.12), dark, 0.545, 1.25, dz));
      g.add(mesh(boxGeo(0.02, 0.06, 0.08), std({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.3 }), 0.555, 1.13, dz));
    }
    g.add(torus(0.12, 0.012, dark, 0.55, 1.46, 0, 0, Math.PI / 2, 0, Math.PI, 14));
    const bulbs = bulbRow(g, [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map((x) => [x, 2.05, 0.37]), 0xffffff);
    mergeByMaterial(g, [screen, beam, ...bulbs]);
    return {
      sign: { material: lamp },
      bulbs,
      front,
      anim: (t, dt, on) => {
        if (!on) return;
        ecg.offset.x = (t * 0.6) % 1;
        beam.rotation.y = t * 5;
        scr.emissiveIntensity = 1.2;
      },
    };
  },

  speed(g, P, label) {
    const alu = std({ color: 0xd8dde2, metalness: 1, roughness: 0.3 });
    const green = std({ color: 0x2e9a30, metalness: 0.3, roughness: 0.4 });
    const chrome = std({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 });
    const dark = std({ color: 0x1a1e22, metalness: 0.6, roughness: 0.5 });
    g.add(mesh(rboxGeo(1.02, 1.98, 0.7, 0.14), alu, 0, 1.03, -0.02));
    g.add(mesh(boxGeo(1.06, 0.1, 0.74), dark, 0, 0.05, -0.02));
    // franjas verdes y cromadas de los costados
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.03, 1.7, 0.16), green, sx * 0.515, 1.05, 0.12));
      g.add(mesh(boxGeo(0.03, 1.7, 0.03), chrome, sx * 0.52, 1.05, 0.02));
      // las aletas de atrás
      g.add(mesh(boxGeo(0.03, 0.62, 0.3), green, sx * 0.53, 0.42, -0.24, 0.25, 0, 0));
    }
    const { front } = common(g, label, { z: 0.335, frame: chrome, frameW: 0.035 });
    // la turbina arriba: el aro y la hélice
    g.add(mesh(cylGeo(0.27, 0.27, 0.2, 20, true), alu, 0, 2.28, 0.02, Math.PI / 2));
    g.add(torus(0.27, 0.035, chrome, 0, 2.28, 0.12, 0, 0, 0, Math.PI * 2, 24));
    g.add(mesh(cylGeo(0.12, 0.2, 0.2, 12), alu, 0, 2.08, 0.02));
    const fan = new THREE.Group();
    fan.position.set(0, 2.28, 0.08);
    for (let i = 0; i < 6; i++) fan.add(mesh(boxGeo(0.05, 0.25, 0.012), chrome, Math.sin((i / 6) * Math.PI * 2) * 0.13, Math.cos((i / 6) * Math.PI * 2) * 0.13, 0, 0.3, 0, (-i / 6) * Math.PI * 2));
    fan.add(sphere(0.05, green, 0, 0, 0.02, 1, 1, 0.6, 10));
    g.add(fan);
    // el rayo encendido (el cartel)
    const bolt = glow(0x59ff4a);
    g.add(shape([[0.06, 0.22], [-0.08, 0.0], [0.0, 0.0], [-0.06, -0.22], [0.1, 0.04], [0.02, 0.04], [0.12, 0.22]], 0.03, bolt, 0.44, 2.1, 0.3, 0.6));
    g.add(shape([[0.06, 0.22], [-0.08, 0.0], [0.0, 0.0], [-0.06, -0.22], [0.1, 0.04], [0.02, 0.04], [0.12, 0.22]], 0.03, bolt, -0.44, 2.1, 0.3, 0.6));
    const bulbs = bulbRow(g, arc(6, 0, 2.28, 0.15, 0.34, Math.PI * 1.15, Math.PI * 1.85), 0xc8ffb0);
    mergeByMaterial(g, [fan, ...bulbs]);
    return {
      sign: { material: bolt },
      bulbs,
      front,
      anim: (t, dt, on) => {
        fan.rotation.z -= dt * (on ? 16 : 0.4);
      },
    };
  },

  doubletap(g, P, label) {
    const wood = std({ color: 0x5a3418, roughness: 0.75 });
    const iron = std({ color: 0x3b3b3e, metalness: 0.8, roughness: 0.45 });
    const brass = std({ color: 0xc9a13c, metalness: 0.9, roughness: 0.3 });
    const green = std({ color: 0x1f6a3a, roughness: 0.5 });
    // los dos barriles, con sus zunchos
    for (const sx of [-1, 1]) {
      const x = sx * 0.29;
      g.add(mesh(cylGeo(0.26, 0.27, 2.0, 18), wood, x, 1.0, -0.06));
      for (const y of [0.18, 1.0, 1.82]) g.add(torus(0.272, 0.018, iron, x, y, -0.06, Math.PI / 2, 0, 0, Math.PI * 2, 20));
      g.add(mesh(cylGeo(0.24, 0.24, 0.03, 18), iron, x, 2.01, -0.06));
      // la canana de balas alrededor de la tapa
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.add(mesh(cylGeo(0.018, 0.018, 0.1, 6), brass, x + Math.cos(a) * 0.2, 2.08, -0.06 + Math.sin(a) * 0.2));
      }
    }
    // la tabla con la etiqueta, entre los dos
    g.add(mesh(boxGeo(0.92, 1.72, 0.05), green, 0, LBL.y, 0.3));
    const { front } = common(g, label, { z: 0.33, frame: brass, frameW: 0.03 });
    // las dos canillas abajo
    for (const sx of [-1, 1]) {
      g.add(mesh(cylGeo(0.03, 0.03, 0.16, 8), brass, sx * 0.18, 0.4, 0.4, Math.PI / 2));
      g.add(mesh(cylGeo(0.025, 0.02, 0.1, 8), brass, sx * 0.18, 0.34, 0.46));
      g.add(mesh(boxGeo(0.03, 0.1, 0.03), iron, sx * 0.18, 0.47, 0.46));
    }
    // arriba, las dos balas grandes cruzadas (el cartel)
    const neon = glow(0xffa21c);
    for (const sx of [-1, 1]) {
      const rz = sx * 0.55;
      g.add(mesh(cylGeo(0.05, 0.05, 0.3, 10), neon, sx * 0.06, 2.3, 0.05, 0, 0, rz));
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 10), neon, sx * 0.06 - Math.sin(rz) * 0.22, 2.3 + Math.cos(rz) * 0.22, 0.05, 0, 0, rz));
    }
    const bulbs = bulbRow(g, [[-0.42, 2.06, 0.16], [-0.29, 2.06, 0.2], [-0.16, 2.06, 0.16], [0.16, 2.06, 0.16], [0.29, 2.06, 0.2], [0.42, 2.06, 0.16]], 0xffc070);
    mergeByMaterial(g, bulbs);
    return { sign: { material: neon }, bulbs, front, anim: null };
  },

  mule(g, P, label) {
    const plank = std({ color: 0x8c6a3e, roughness: 0.8 });
    const trim = std({ color: 0x4e331a, roughness: 0.8 });
    const hide = std({ color: 0x6b5344, roughness: 0.85 });
    const leather = std({ color: 0x5b3a1e, roughness: 0.7 });
    const iron = std({ color: 0x4a4a4c, metalness: 0.8, roughness: 0.45 });
    // las tablas (con una rendija entre una y otra)
    for (let i = 0; i < 7; i++) g.add(mesh(boxGeo(0.145, 1.88, 0.7), plank, -0.45 + i * 0.15, 0.96, 0));
    g.add(mesh(boxGeo(1.08, 1.86, 0.66), trim, 0, 0.96, -0.02));
    for (const y of [0.1, 1.86]) g.add(mesh(boxGeo(1.12, 0.1, 0.74), trim, 0, y, 0));
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.08, 1.9, 0.74), trim, sx * 0.53, 0.96, 0));
    const { front } = common(g, label, { z: 0.36, frame: trim, frameW: 0.05, h: 1.4, y: 1.06 });
    // el techito a dos aguas
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.64, 0.05, 0.8), trim, sx * 0.28, 2.02, 0, 0, 0, -sx * 0.32));
    // la cabeza de la mula tallada, mirando al frente
    const head = new THREE.Group();
    const muzzle = std({ color: 0xd8cbb8, roughness: 0.85 });
    head.add(sphere(0.17, hide, 0, 0, 0, 0.85, 1, 1.25, 14));
    head.add(sphere(0.13, muzzle, 0, -0.12, 0.2, 0.85, 0.75, 0.95, 12));
    head.add(sphere(0.022, std({ color: 0x111111 }), -0.1, 0.05, 0.13, 1, 1, 1, 6));
    head.add(sphere(0.022, std({ color: 0x111111 }), 0.1, 0.05, 0.13, 1, 1, 1, 6));
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.ConeGeometry(0.055, 0.3, 8), hide, sx * 0.09, 0.24, -0.02, -0.15, 0, sx * -0.4));
      head.add(mesh(new THREE.ConeGeometry(0.03, 0.2, 6), muzzle, sx * 0.09, 0.22, 0.0, -0.15, 0, sx * -0.4));
    }
    // la crin
    for (let k = 0; k < 5; k++) head.add(mesh(boxGeo(0.04, 0.08, 0.06), trim, 0, 0.16 - k * 0.03, -0.08 - k * 0.06));
    head.position.set(0, 2.2, 0.16);
    head.rotation.x = 0.2;
    g.add(head);
    // la herradura encendida (el cartel)
    const shoe = glow(0x7cff5a);
    g.add(torus(0.12, 0.022, shoe, 0, 1.93, 0.39, 0, 0, Math.PI, Math.PI * 1.4, 18));
    // las alforjas con un mate asomando
    for (const sx of [-1, 1]) {
      g.add(mesh(rboxGeo(0.08, 0.34, 0.4, 0.03), leather, sx * 0.53, 1.0, 0.02));
      g.add(mesh(boxGeo(0.02, 0.5, 0.04), leather, sx * 0.535, 1.35, 0.02));
    }
    g.add(sphere(0.09, std({ color: 0x9a7038, roughness: 0.6 }), 0.52, 1.22, 0.1, 0.5, 1.1, 1, 10));
    g.add(mesh(cylGeo(0.006, 0.006, 0.2, 6), iron, 0.52, 1.33, 0.12, 0, 0, -0.2));
    // los farolitos de las esquinas
    const bulbs = bulbRow(g, [[-0.5, 1.95, 0.38], [-0.3, 1.99, 0.39], [-0.12, 2.02, 0.4], [0.12, 2.02, 0.4], [0.3, 1.99, 0.39], [0.5, 1.95, 0.38]], 0xffcf80);
    // (la cabeza: sus piezas se fusionan aparte)
    mergeByMaterial(head);
    mergeByMaterial(g, [head, ...bulbs]);
    return { sign: { material: shoe }, bulbs, front, anim: null };
  },

  deadshot(g, P, label) {
    const card = std({ color: 0xf2cb24, roughness: 0.95 });
    const cardB = std({ color: 0x1b3f8f, roughness: 0.95 });
    const tape = std({ color: 0xe8dcc0, roughness: 0.4, transparent: true, opacity: 0.75 });
    const brown = std({ color: 0x9b7a4a, roughness: 0.95 });
    // el exhibidor de cartón: la espalda, los costados y el zócalo, medio torcido
    const stand = new THREE.Group();
    stand.add(mesh(boxGeo(1.06, 2.02, 0.03), card, 0, 1.01, -0.36));
    for (const sx of [-1, 1]) stand.add(mesh(boxGeo(0.03, 2.0, 0.72), cardB, sx * 0.53, 1.0, 0));
    stand.add(mesh(boxGeo(1.06, 0.34, 0.72), cardB, 0, 0.17, 0));
    stand.add(mesh(boxGeo(1.0, 0.03, 0.68), brown, 0, 0.35, 0));
    stand.add(mesh(boxGeo(1.0, 1.62, 0.02), card, 0, 1.18, 0.33));
    // la cinta de embalar en las esquinas
    for (const [x, y, r] of [[-0.46, 1.9, 0.7], [0.47, 0.5, -0.6], [0.46, 1.88, -0.8], [-0.44, 0.46, 0.5]]) stand.add(mesh(boxGeo(0.3, 0.06, 0.005), tape, x, y, 0.345, 0, 0, r));
    stand.rotation.z = 0.025;
    g.add(stand);
    mergeByMaterial(stand);
    const { front, panel } = common(g, label, { z: 0.345, h: 1.5, y: 1.15 });
    panel.rotation.z = 0.025;
    // el blanco de dardos arriba, sin un dardo
    const dart = canvasTex(128, 128, (ctx, w) => {
      const rings = ['#1b3f8f', '#ffffff', '#d82320', '#ffffff', '#d82320'];
      rings.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(w / 2, w / 2, (w / 2) * (1 - i / rings.length), 0, Math.PI * 2);
        ctx.fill();
      });
    });
    g.add(mesh(cylGeo(0.26, 0.26, 0.04, 20), std({ map: dart, roughness: 0.8 }), 0.06, 2.3, 0.02, Math.PI / 2, 0, 0.12));
    g.add(mesh(boxGeo(0.04, 0.22, 0.04), brown, 0.06, 2.07, 0.02));
    // el centro rojo que se prende (cuando quiere)
    const eye = glow(0xff3020);
    const bull = sphere(0.035, eye, 0.06, 2.3, 0.05, 1, 1, 0.5, 10);
    g.add(bull);
    const bulbs = bulbRow(g, [[-0.44, 2.04, 0.32], [-0.26, 2.05, 0.32], [-0.1, 2.06, 0.32], [0.26, 2.07, 0.32], [0.44, 2.08, 0.32]], 0xfff0a0);
    mergeByMaterial(g, [stand, bull, ...bulbs]);
    // las luces que fallan: cada tanto se apagan de golpe
    let blink = 0;
    return {
      sign: { material: eye },
      bulbs,
      front,
      anim: (t, dt, on) => {
        if (!on) return;
        blink -= dt;
        if (blink < 0) blink = Math.random() < 0.15 ? -0.25 - Math.random() * 0.4 : 0.2 + Math.random() * 1.5;
        eye.emissiveIntensity = blink < 0 ? 0.05 : 2.2;
        for (const b of bulbs) if (blink < 0) b.material.emissiveIntensity = 0;
      },
    };
  },

  phd(g, P, label) {
    const purple = std({ color: 0x3a1a5e, roughness: 0.35, metalness: 0.2 });
    const chrome = std({ color: 0xf0eef6, metalness: 1, roughness: 0.15 });
    const wood = std({ color: 0xb58a4c, roughness: 0.7 });
    const black = std({ color: 0x141018, roughness: 0.5 });
    // la rockola: el cuerpo y el arco de arriba
    g.add(mesh(boxGeo(1.08, 1.72, 0.72), purple, 0, 0.86, 0));
    g.add(mesh(cylGeo(0.54, 0.54, 0.72, 24, false), purple, 0, 1.72, 0, Math.PI / 2, 0, 0));
    g.add(mesh(boxGeo(1.12, 0.08, 0.76), chrome, 0, 0.04, 0));
    const { front } = common(g, label, { z: 0.365, frame: chrome, frameW: 0.03, h: 1.34, y: 1.04 });
    // los tubos de neón del arco (el cartel)
    const neon = glow(0xff5ad0);
    g.add(torus(0.5, 0.025, neon, 0, 1.72, 0.37, 0, 0, 0, Math.PI, 28));
    g.add(torus(0.42, 0.02, glow(0xf2c230, { emissiveIntensity: 1.5 }), 0, 1.72, 0.37, 0, 0, 0, Math.PI, 26));
    for (const sx of [-1, 1]) g.add(mesh(cylGeo(0.025, 0.025, 1.6, 8), neon, sx * 0.52, 0.9, 0.37));
    // el trampolín arriba, con la bomba en la punta
    g.add(mesh(boxGeo(0.26, 0.04, 0.78), wood, 0.18, 2.28, 0.0, -0.08));
    g.add(mesh(boxGeo(0.06, 0.3, 0.06), chrome, 0.18, 2.12, -0.3));
    g.add(sphere(0.12, black, 0.18, 2.4, 0.24, 1, 1, 1, 14));
    g.add(mesh(cylGeo(0.03, 0.03, 0.05, 8), chrome, 0.18, 2.53, 0.24));
    const spark = sphere(0.025, glow(0xffd24a, { emissiveIntensity: 3 }), 0.2, 2.57, 0.26, 1, 1, 1, 6);
    g.add(spark);
    const bulbs = bulbRow(g, arc(6, 0, 1.72, 0.39, 0.46, Math.PI * 0.1, Math.PI * 0.9), 0xffe0ff);
    mergeByMaterial(g, [spark, ...bulbs]);
    return {
      sign: { material: neon },
      bulbs,
      front,
      anim: (t) => {
        spark.scale.setScalar(0.7 + Math.random() * 0.8);
        spark.position.y = 2.57 + Math.sin(t * 30) * 0.004;
      },
    };
  },

  dragon(g, P, label) {
    const stone = std({ color: 0x5c5650, roughness: 0.95 });
    const stoneD = std({ color: 0x3e3a36, roughness: 0.95 });
    const iron = std({ color: 0x2c2a28, metalness: 0.75, roughness: 0.55 });
    const scale = std({ color: 0x6b1a0c, metalness: 0.3, roughness: 0.5 });
    // la fragua: bloques de piedra
    for (let y = 0; y < 5; y++) {
      for (let i = 0; i < 2; i++) g.add(mesh(boxGeo(0.54, 0.38, 0.74), (y + i) % 2 ? stone : stoneD, -0.28 + i * 0.56 + (y % 2 ? 0.02 : -0.02), 0.2 + y * 0.39, 0));
    }
    for (const y of [0.55, 1.55]) g.add(mesh(boxGeo(1.16, 0.07, 0.7), iron, 0, y, 0));
    const { front } = common(g, label, { z: 0.375, frame: iron, frameW: 0.05, h: 1.36, y: 1.12 });
    // las escamas de los costados
    for (const sx of [-1, 1]) {
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) g.add(mesh(boxGeo(0.02, 0.14, 0.18), scale, sx * 0.56, 0.5 + r * 0.3, -0.22 + k * 0.22 + (r % 2) * 0.1, 0, 0, sx * 0.15));
    }
    // la cabeza del dragón arriba, con el hocico largo al frente, la boca
    // abierta (con la brasa adentro), los cuernos para atrás y la cresta
    const head = new THREE.Group();
    const horn = std({ color: 0xe8dcc0, roughness: 0.5 });
    head.add(mesh(rboxGeo(0.38, 0.26, 0.34, 0.06), scale, 0, 0.02, -0.08));
    head.add(mesh(rboxGeo(0.26, 0.12, 0.36, 0.04), scale, 0, 0.04, 0.24));
    head.add(mesh(rboxGeo(0.22, 0.06, 0.32, 0.02), scale, 0, -0.1, 0.2, 0.28, 0, 0));
    // las cejas y las narinas
    for (const sx of [-1, 1]) {
      head.add(mesh(boxGeo(0.12, 0.05, 0.14), iron, sx * 0.12, 0.16, 0.06, 0.25, 0, sx * 0.2));
      head.add(sphere(0.022, iron, sx * 0.06, 0.1, 0.42, 1, 0.6, 1, 6));
      head.add(mesh(new THREE.ConeGeometry(0.055, 0.42, 8), horn, sx * 0.14, 0.2, -0.26, -1.15, 0, sx * -0.25));
      for (let k = 0; k < 3; k++) head.add(mesh(new THREE.ConeGeometry(0.016, 0.06, 5), horn, sx * 0.09, -0.03, 0.3 + k * 0.05, Math.PI));
    }
    for (let k = 0; k < 4; k++) head.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 5), scale, 0, 0.17 - k * 0.02, -0.08 - k * 0.09, -0.5));
    head.position.set(0, 2.2, 0.0);
    g.add(head);
    mergeByMaterial(head);
    // los ojos y la boca (la brasa: el cartel)
    const ember = glow(0xff7a1a);
    for (const sx of [-1, 1]) g.add(sphere(0.03, ember, sx * 0.13, 2.28, 0.08, 1, 0.7, 0.8, 8));
    g.add(mesh(boxGeo(0.18, 0.05, 0.22), ember, 0, 2.16, 0.2, 0.14, 0, 0));
    const bulbs = bulbRow(g, [[-0.48, 1.92, 0.36], [-0.3, 1.92, 0.36], [-0.12, 1.92, 0.36], [0.12, 1.92, 0.36], [0.3, 1.92, 0.36], [0.48, 1.92, 0.36]], 0xff9a40);
    mergeByMaterial(g, [head, ...bulbs]);
    return {
      sign: { material: ember },
      bulbs,
      front,
      anim: (t, dt, on) => {
        if (on) ember.emissiveIntensity = 1.8 + Math.sin(t * 9) * 0.4 + Math.random() * 0.4;
      },
    };
  },

  cherry(g, P, label) {
    const steel = std({ color: 0x3c4a44, metalness: 0.6, roughness: 0.5 });
    const dark = std({ color: 0x1c2220, metalness: 0.6, roughness: 0.6 });
    const copper = std({ color: 0xc27a3a, metalness: 0.9, roughness: 0.3 });
    const porcelain = std({ color: 0xf1ede2, roughness: 0.2 });
    const red = std({ color: 0xc81f33, roughness: 0.35 });
    // el tablero de alta tensión, con la franja de peligro abajo
    g.add(mesh(rboxGeo(1.06, 1.9, 0.7, 0.04), steel, 0, 1.03, -0.02));
    const hazard = canvasTex(256, 32, (ctx, w, h) => {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#141414';
      for (let x = -h; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 14, h);
        ctx.lineTo(x + 14 + h, 0);
        ctx.lineTo(x + h, 0);
        ctx.fill();
      }
    });
    g.add(mesh(boxGeo(1.1, 0.16, 0.74), std({ map: hazard, roughness: 0.6 }), 0, 0.08, -0.02));
    const { front } = common(g, label, { z: 0.335, frame: dark, frameW: 0.04, h: 1.46, y: 1.1 });
    // el cartel de peligro del costado izquierdo
    const danger = canvasTex(128, 128, (ctx, w) => {
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.moveTo(w / 2, 8);
      ctx.lineTo(w - 6, w - 12);
      ctx.lineTo(6, w - 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      [[70, 34], [48, 74], [62, 74], [52, 104], [82, 62], [68, 62], [78, 34]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.fill();
    });
    const dPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), std({ map: danger, transparent: true, roughness: 0.6 }));
    dPlane.position.set(-0.535, 1.3, 0);
    dPlane.rotation.y = -Math.PI / 2;
    g.add(dPlane);
    // la llave de cuchilla del costado derecho: base, bornes de cobre y el mango rojo
    g.add(mesh(boxGeo(0.03, 0.5, 0.34), porcelain, 0.54, 1.25, 0.02));
    for (const dz of [-0.08, 0.08]) {
      g.add(mesh(boxGeo(0.03, 0.06, 0.04), copper, 0.56, 1.44, dz + 0.02));
      g.add(mesh(boxGeo(0.02, 0.36, 0.025), copper, 0.565, 1.3, dz + 0.02, 0, 0, 0.25));
    }
    g.add(mesh(cylGeo(0.022, 0.022, 0.2, 8), red, 0.555, 1.12, 0.02, Math.PI / 2, 0, 0));
    // arriba: los aisladores y la escalera de Jacob (dos cuernos de cobre abiertos en V)
    g.add(mesh(boxGeo(0.7, 0.08, 0.42), dark, 0, 2.02, 0.02));
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) g.add(mesh(cylGeo(0.06 - k * 0.006, 0.07 - k * 0.006, 0.05, 12), porcelain, sx * 0.14, 2.09 + k * 0.055, 0.04));
      g.add(mesh(cylGeo(0.012, 0.012, 0.44, 8), copper, sx * 0.2, 2.42, 0.04, 0, 0, -sx * 0.36));
    }
    // las cerezas colgando del frente del tablero
    for (const sx of [-1, 1]) g.add(sphere(0.055, red, sx * 0.065 + 0.36, 2.1, 0.28, 1, 1, 1, 12));
    g.add(mesh(cylGeo(0.006, 0.006, 0.12, 6), std({ color: 0x5f7f26 }), 0.36, 2.18, 0.28));
    // el arco que sube por los cuernos (el cartel: se prende con la luz)
    const arcM = glow(0x8fd8ff);
    const arcs = [];
    for (let k = 0; k < 4; k++) {
      const a = mesh(boxGeo(1, 0.018, 0.018), arcM, 0, 2.2, 0.04);
      a.castShadow = false;
      arcs.push(a);
      g.add(a);
    }
    const bulbs = bulbRow(g, [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map((x) => [x, 1.93, 0.33]), 0x9fdcff);
    mergeByMaterial(g, [dPlane, ...arcs, ...bulbs]);
    let rise = 0;
    return {
      sign: { material: arcM },
      bulbs,
      front,
      anim: (t, dt, on) => {
        // el arco sube, se estira y se corta abajo de nuevo (con la luz); sin luz, quieto abajo
        rise = on ? (rise + dt * 0.9) % 1 : 0;
        const y = 2.22 + rise * 0.34;
        const half = 0.07 + rise * 0.21;
        const pts = [[-half, y]];
        for (let k = 1; k < 4; k++) pts.push([-half + (k / 4) * half * 2, y + (on ? (Math.random() - 0.5) * 0.06 : 0)]);
        pts.push([half, y]);
        arcs.forEach((a, k) => {
          const [x0, y0] = pts[k];
          const [x1, y1] = pts[k + 1];
          a.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.04);
          a.scale.x = Math.hypot(x1 - x0, y1 - y0);
          a.rotation.z = Math.atan2(y1 - y0, x1 - x0);
          a.visible = on || k === 0;
        });
        if (on) arcM.emissiveIntensity = 2 + Math.random() * 2.5;
      },
    };
  },

  aqua(g, P, label) {
    const copper = std({ color: 0xb06a3a, metalness: 0.85, roughness: 0.35 });
    const brass = std({ color: 0xc9a13c, metalness: 0.9, roughness: 0.3 });
    const navy = std({ color: 0x1d5fae, roughness: 0.4 });
    const glass = std({ color: 0x0a1a24, metalness: 0.2, roughness: 0.05 });
    g.add(mesh(rboxGeo(1.06, 1.98, 0.72, 0.16), copper, 0, 0.99, 0));
    g.add(mesh(boxGeo(1.1, 0.12, 0.76), navy, 0, 0.06, 0));
    for (const y of [0.4, 1.95]) g.add(mesh(boxGeo(1.08, 0.04, 0.74), brass, 0, y, 0));
    const { front } = common(g, label, { z: 0.365, frame: brass, frameW: 0.04, h: 1.3, y: 1.07 });
    rivets(g, brass, [-0.5, 0.45, 0.37], [-0.5, 1.9, 0.37], 8, 0.018);
    rivets(g, brass, [0.5, 0.45, 0.37], [0.5, 1.9, 0.37], 8, 0.018);
    // la escafandra arriba: el casco, el cuello y los tres visores
    g.add(mesh(cylGeo(0.26, 0.32, 0.12, 18), brass, 0, 2.04, 0));
    g.add(sphere(0.27, copper, 0, 2.3, 0, 1, 1, 1, 18));
    g.add(torus(0.11, 0.025, brass, 0, 2.3, 0.26, 0, 0, 0, Math.PI * 2, 18));
    g.add(sphere(0.1, glass, 0, 2.3, 0.2, 1, 1, 0.8, 12));
    for (const sx of [-1, 1]) {
      g.add(torus(0.07, 0.02, brass, sx * 0.25, 2.3, 0.02, 0, sx * Math.PI / 2, 0, Math.PI * 2, 14));
      g.add(sphere(0.06, glass, sx * 0.24, 2.3, 0.02, 0.6, 1, 1, 10));
    }
    // el salvavidas colgado del costado
    const ringW = std({ color: 0xf2efe6, roughness: 0.6 });
    const ringR = std({ color: 0xd3262b, roughness: 0.6 });
    for (let i = 0; i < 4; i++) g.add(torus(0.2, 0.05, i % 2 ? ringR : ringW, 0.52, 1.1, 0, 0, Math.PI / 2, (i * Math.PI) / 2, Math.PI / 2, 8));
    // el ojo de buey con agua y burbujas (se prende con la luz: el cartel)
    const water = glow(0x2a8fd8);
    g.add(torus(0.1, 0.025, brass, 0, 1.87, 0.39, 0, 0, 0, Math.PI * 2, 18));
    g.add(mesh(cylGeo(0.1, 0.1, 0.02, 18), water, 0, 1.87, 0.385, Math.PI / 2));
    const bub = [];
    const bm = std({ color: 0xcfefff, emissive: 0x9fdfff, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 5; i++) {
      const b = sphere(0.012 + (i % 3) * 0.005, bm, -0.05 + i * 0.025, 1.8, 0.4, 1, 1, 1, 6);
      b.userData.k = i / 5;
      bub.push(b);
      g.add(b);
    }
    const bulbs = bulbRow(g, arc(6, 0, 2.3, 0.02, 0.3, Math.PI * 0.05, Math.PI * 0.95).map(([x, y]) => [x, y - 0.26, 0.24]), 0xbfe8ff);
    mergeByMaterial(g, [...bub, ...bulbs]);
    return {
      sign: { material: water },
      bulbs,
      front,
      anim: (t) => {
        for (const b of bub) {
          const k = (t * 0.35 + b.userData.k) % 1;
          b.position.y = 1.8 + k * 0.15;
          b.position.x = -0.05 + b.userData.k * 0.12 + Math.sin(t * 3 + b.userData.k * 9) * 0.008;
          b.visible = k < 0.92;
        }
      },
    };
  },

  wish(g, P, label) {
    const lacquer = std({ color: 0x141012, roughness: 0.22, metalness: 0.15 });
    const wine = std({ color: 0x3a0c16, roughness: 0.5 });
    const gold = std({ color: 0xc9a13c, metalness: 0.9, roughness: 0.3 });
    const marble = std({ color: 0x2c2729, roughness: 0.35, metalness: 0.05 });
    const wax = std({ color: 0xefe6d0, roughness: 0.7 });
    // la tarima de mármol y el ataúd parado (el perfil de seis lados, con los hombros anchos)
    g.add(mesh(boxGeo(1.12, 0.12, 0.78), marble, 0, 0.06, 0));
    const prof = [[-0.35, 0.12], [0.35, 0.12], [0.53, 1.55], [0.4, 2.06], [-0.4, 2.06], [-0.53, 1.55]];
    g.add(shape(prof, 0.62, lacquer, 0, 0, -0.02));
    g.add(shape(prof.map(([x, y]) => [x * 0.9, 0.12 + (y - 0.12) * 0.97 + 0.03]), 0.66, wine, 0, 0, -0.02));
    // el filete dorado de la tapa, por todo el borde
    for (let i = 0; i < prof.length; i++) {
      const [x0, y0] = prof[i];
      const [x1, y1] = prof[(i + 1) % prof.length];
      g.add(mesh(boxGeo(Math.hypot(x1 - x0, y1 - y0) + 0.03, 0.035, 0.04), gold, (x0 + x1) / 2, (y0 + y1) / 2, 0.3, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
    }
    const { front } = common(g, label, { z: 0.335, frame: gold, frameW: 0.03, w: 0.64, h: 1.24, y: 1.02 });
    // la cruz arriba de la etiqueta
    g.add(mesh(boxGeo(0.05, 0.24, 0.03), gold, 0, 1.86, 0.33));
    g.add(mesh(boxGeo(0.16, 0.05, 0.03), gold, 0, 1.9, 0.33));
    // las manijas de los costados
    // (pegadas al costado, que se abre hacia los hombros)
    for (const sx of [-1, 1]) for (const y of [0.7, 1.25]) g.add(mesh(cylGeo(0.018, 0.018, 0.3, 8), gold, sx * (0.38 + (y - 0.12) * 0.126), y, 0.12, Math.PI / 2, 0, 0));
    // la jeringa de adrenalina clavada arriba, al lado del relicario (el líquido rojo brilla)
    const juice = glow(0xff1a3a, { transparent: true, opacity: 0.9 });
    const syr = new THREE.Group();
    syr.add(mesh(cylGeo(0.045, 0.045, 0.36, 12), std({ color: 0xdfe8ee, roughness: 0.05, transparent: true, opacity: 0.45 }), 0, 0, 0));
    syr.add(mesh(cylGeo(0.036, 0.036, 0.26, 10), juice, 0, -0.04, 0));
    syr.add(mesh(cylGeo(0.008, 0.008, 0.22, 6), std({ color: 0xc8ccd0, metalness: 1, roughness: 0.2 }), 0, -0.29, 0));
    syr.add(mesh(cylGeo(0.012, 0.012, 0.16, 6), gold, 0, 0.26, 0));
    syr.add(mesh(boxGeo(0.14, 0.02, 0.06), gold, 0, 0.35, 0));
    syr.add(mesh(boxGeo(0.12, 0.02, 0.1), gold, 0, 0.17, 0));
    syr.position.set(0.33, 2.2, 0.06);
    syr.rotation.z = -0.35;
    mergeByMaterial(syr);
    g.add(syr);
    // el relicario de arriba: la base dorada, el vidrio y el corazón que late adentro
    g.add(mesh(cylGeo(0.17, 0.2, 0.06, 18), gold, 0, 2.09, 0.02));
    g.add(mesh(cylGeo(0.14, 0.14, 0.28, 18, true), std({ color: 0xcfe0e8, roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide }), 0, 2.26, 0.02));
    g.add(mesh(cylGeo(0.16, 0.16, 0.03, 18), gold, 0, 2.41, 0.02));
    const heart = new THREE.Group();
    const hm = glow(0xff1a3a);
    heart.add(sphere(0.05, hm, -0.036, 0.018, 0, 1, 1, 0.75, 10));
    heart.add(sphere(0.05, hm, 0.036, 0.018, 0, 1, 1, 0.75, 10));
    heart.add(mesh(new THREE.ConeGeometry(0.07, 0.11, 10), hm, 0, -0.05, 0, Math.PI, 0, 0));
    heart.position.set(0, 2.25, 0.02);
    g.add(heart);
    // la aureola que flota arriba de todo
    const halo = torus(0.12, 0.014, glow(0xffd66a, { emissiveIntensity: 1.2 }), 0, 2.53, 0.02, Math.PI / 2, 0, 0, Math.PI * 2, 28);
    g.add(halo);
    // las velas de los rincones (las llamitas son los foquitos)
    const flames = [];
    for (const sx of [-1, 1]) {
      g.add(mesh(cylGeo(0.035, 0.04, 0.26, 10), wax, sx * 0.48, 0.25, 0.28));
      g.add(mesh(cylGeo(0.06, 0.06, 0.02, 12), gold, sx * 0.48, 0.13, 0.28));
      flames.push([sx * 0.48, 0.41, 0.28]);
    }
    const bulbs = bulbRow(g, [...flames, [-0.3, 2.02, 0.31], [0.3, 2.02, 0.31]], 0xffb050);
    mergeByMaterial(g, [heart, halo, ...bulbs]);
    return {
      sign: { material: hm },
      bulbs,
      front,
      anim: (t, dt, on) => {
        // el latido de a dos (tum-tum) y la aureola que gira despacio
        const ph = (t * 1.3) % 1;
        const beat = Math.exp(-(((ph - 0.08) / 0.05) ** 2)) + 0.7 * Math.exp(-(((ph - 0.28) / 0.05) ** 2));
        heart.scale.setScalar(on ? 1 + beat * 0.28 : 0.9);
        if (on) hm.emissiveIntensity = 1.4 + beat * 2.4;
        halo.rotation.z = t * 0.8;
        halo.position.y = 2.53 + Math.sin(t * 1.7) * 0.015;
      },
    };
  },
  maiz(g, P, label) {
    const wood = std({ color: 0x6e4e30, roughness: 0.88 });
    const woodDark = std({ color: 0x3a2716, roughness: 0.92 });
    const straw = std({ map: strawTex(), color: 0xe6cc84, roughness: 0.95 });
    const husk = std({ color: 0xcdb070, roughness: 0.9, side: THREE.DoubleSide });
    const cob = std({ color: 0xe2a326, roughness: 0.5 });
    const cobDark = std({ color: 0xa8641a, roughness: 0.6 });
    // la tarima y la troje: cuatro postes, el fondo cerrado y los costados de
    // tablas con luz entre medio (adentro, la pila de choclos)
    g.add(mesh(boxGeo(1.12, 0.12, 0.78), woodDark, 0, 0.06, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(boxGeo(0.09, 1.96, 0.09), wood, sx * 0.5, 1.1, sz * 0.31));
    g.add(mesh(boxGeo(1.0, 1.9, 0.04), woodDark, 0, 1.07, -0.3));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) g.add(mesh(boxGeo(0.03, 0.11, 0.62), i % 3 ? wood : woodDark, sx * 0.5, 0.26 + i * 0.205, 0, 0, 0, (i % 2 ? 1 : -1) * 0.02));
      // los choclos apilados de punta (asoman entre las tablas)
      for (let row = 0; row < 8; row++) for (let k = 0; k < 3; k++) g.add(mesh(cylGeo(0.042, 0.036, 0.19, 8), (row + k) % 4 ? cob : cobDark, sx * 0.43, 0.3 + row * 0.2 + (k % 2) * 0.04, -0.2 + k * 0.2, Math.PI / 2, 0, 0));
    }
    const { front } = common(g, label, { z: 0.34, frame: wood, frameW: 0.05, w: 0.76, h: 1.46, y: 1.08 });
    // el techito de paja a dos aguas (la cumbrera de adelante hacia atrás)
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.7, 0.07, 0.86), straw, sx * 0.285, 2.25, 0, 0, 0, -sx * 0.6));
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) g.add(mesh(boxGeo(0.02, 0.1 + (i % 3) * 0.03, 0.12), straw, sx * 0.56, 2.02, -0.36 + i * 0.12, 0, 0, sx * 0.3));
    // el hastial de adelante: tablas oscuras con un hueco negro... y dos ojos que miran
    g.add(shape([[-0.5, 0], [0.5, 0], [0, 0.36]], 0.03, woodDark, 0, 2.06, 0.34));
    g.add(shape([[-0.2, 0], [0.2, 0], [0, 0.14]], 0.01, std({ color: 0x050302, roughness: 1 }), 0, 2.1, 0.36));
    const eyeMat = glow(0xffd24a);
    const eyes = new THREE.Group();
    for (const sx of [-1, 1]) eyes.add(sphere(0.022, eyeMat, sx * 0.055, 0, 0, 1.3, 0.8, 0.5, 8));
    eyes.position.set(0, 2.155, 0.366);
    g.add(eyes);
    // el sombrero de paja del espantapájaros, tirado arriba de la cumbrera
    const hat = new THREE.Group();
    hat.add(mesh(cylGeo(0.21, 0.21, 0.015, 18), straw, 0, 0, 0));
    hat.add(mesh(cylGeo(0.1, 0.12, 0.11, 14), straw, 0, 0.06, 0));
    hat.add(mesh(cylGeo(0.122, 0.122, 0.025, 14), std({ color: 0x7a2a12, roughness: 0.8 }), 0, 0.02, 0));
    hat.position.set(0.05, 2.47, -0.05);
    hat.rotation.set(0.08, 0.4, -0.12);
    mergeByMaterial(hat);
    g.add(hat);
    // los atados de chala seca en las esquinas de adelante (se mecen)
    const bundles = [];
    for (const sx of [-1, 1]) {
      const b = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 1.7 + ((i * 37) % 7) * 0.09;
        b.add(mesh(cylGeo(0.008, 0.013, h, 5), husk, Math.cos(a) * 0.035, h / 2, Math.sin(a) * 0.035, Math.sin(a) * 0.05, 0, -Math.cos(a) * 0.05));
      }
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.PlaneGeometry(0.05, 0.3).translate(0, -0.15, 0);
        const y = 0.9 + i * 0.17;
        b.add(mesh(leaf, husk, 0, y, 0, 0.3 + (i % 2) * 0.2, i * 2.1, (i % 2 ? 1 : -1) * 0.45));
      }
      b.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 12), std({ color: 0x5a3a1a, roughness: 0.9 }), 0, 0.95, 0, Math.PI / 2, 0, 0));
      b.position.set(sx * 0.52, 0.12, 0.33);
      b.rotation.z = -sx * 0.06;
      mergeByMaterial(b);
      g.add(b);
      bundles.push(b);
    }
    // los foquitos colgados del alero
    const bulbs = bulbRow(g, [-0.45, -0.25, 0.25, 0.45].map((x) => [x, 2.02 + (0.5 - Math.abs(x)) * 0.62, 0.43]), 0xffd890);
    mergeByMaterial(g, [eyes, hat, ...bundles, ...bulbs]);
    let blink = 3;
    return {
      sign: { material: eyeMat },
      bulbs,
      front,
      anim: (t, dt, on) => {
        // la chala que se mece; los ojos que parpadean y miran para los costados
        bundles.forEach((b, i) => {
          b.rotation.z = (i ? 0.06 : -0.06) + Math.sin(t * 1.3 + i * 1.7) * 0.035;
          b.rotation.x = Math.sin(t * 0.9 + i) * 0.02;
        });
        blink -= dt;
        if (blink < -0.14) blink = 2 + Math.random() * 4;
        eyes.scale.y = blink < 0 ? 0.1 : 1;
        eyes.position.x = Math.sin(t * 0.6) * 0.02;
        if (on) eyeMat.emissiveIntensity = 1.6 + Math.sin(t * 2.3) * 0.3;
      },
    };
  },
  catal(g, P, label) {
    const obsid = std({ color: 0x0d0a14, roughness: 0.22, metalness: 0.25 });
    const stone = std({ color: 0x1c1626, roughness: 0.85 });
    const gold = std({ color: 0xc99a3a, metalness: 0.9, roughness: 0.3 });
    const glass = std({ color: 0xd8c8ff, roughness: 0.05, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    // las grietas violetas: lo que se prende con la luz (y titila desparejo)
    const crackM = glow(0xa45cff);
    const brew = glow(0x8a3cff, { transparent: true, opacity: 0.85 });
    // la tarima de piedra negra y el monolito de obsidiana, torcido de un lado
    // (la disformidad): seis lados, el hombro izquierdo más alto
    g.add(mesh(boxGeo(1.12, 0.12, 0.78), stone, 0, 0.06, 0));
    const prof = [[-0.44, 0.12], [0.44, 0.12], [0.5, 1.2], [0.4, 1.98], [-0.36, 2.04], [-0.53, 1.35]];
    g.add(shape(prof, 0.6, obsid, 0, 0, -0.03));
    const { front } = common(g, label, { z: 0.275, frame: gold, frameW: 0.03, w: 0.66, h: 1.26, y: 1.0 });
    // las grietas: rajas chicas en las esquinas del frente y por los costados
    const crack = (pts, z, rx = 0, ry = 0) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        g.add(mesh(boxGeo(Math.hypot(x1 - x0, y1 - y0) + 0.01, 0.011, 0.008), crackM, (x0 + x1) / 2, (y0 + y1) / 2, z, rx, ry, Math.atan2(y1 - y0, x1 - x0)));
      }
    };
    crack([[-0.47, 1.76], [-0.4, 1.86], [-0.3, 1.82]], 0.275);
    crack([[0.43, 0.3], [0.38, 0.46], [0.42, 0.6], [0.36, 0.8]], 0.275);
    for (const sx of [-1, 1]) {
      const side = new THREE.Group();
      side.position.set(sx * 0.47, 0, 0);
      side.rotation.y = sx * Math.PI / 2;
      g.add(side);
      for (const [a, b] of [[[-0.2, 0.4], [-0.05, 0.62]], [[-0.05, 0.62], [0.12, 0.58]], [[0.12, 0.58], [0.22, 0.9]], [[0.22, 0.9], [0.08, 1.15]]]) {
        side.add(mesh(boxGeo(Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.01, 0.011, 0.008), crackM, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.012, 0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])));
      }
    }
    // los dos tubos del catalizador a los costados: el vidrio, el caldo violeta y las virolas de oro
    for (const sx of [-1, 1]) {
      g.add(mesh(cylGeo(0.06, 0.06, 1.1, 14, true), glass, sx * 0.43, 0.82, 0.34));
      g.add(mesh(cylGeo(0.048, 0.048, 0.75 + (sx > 0 ? 0.18 : 0), 12), brew, sx * 0.43, 0.27 + (0.75 + (sx > 0 ? 0.18 : 0)) / 2, 0.34));
      for (const y of [0.27, 1.37]) g.add(mesh(cylGeo(0.072, 0.072, 0.05, 14), gold, sx * 0.43, y, 0.34));
    }
    // arriba, el eclipse: la luna negra con la corona de oro detrás (gira) y un
    // aro violeta torcido que da vueltas alrededor
    const top = new THREE.Group();
    top.position.set(0, 2.28, 0.0);
    g.add(top);
    g.add(mesh(cylGeo(0.12, 0.18, 0.12, 8), gold, 0, 2.04, 0));
    const moon = sphere(0.17, std({ color: 0x050308, roughness: 0.35, metalness: 0.1 }), 0, 0, 0, 1, 1, 1, 20);
    top.add(moon);
    const coronaM = glow(0xffc65a, { emissiveIntensity: 1.1 });
    const corona = new THREE.Group();
    corona.add(torus(0.2, 0.018, coronaM, 0, 0, -0.02, 0, 0, 0, Math.PI * 2, 32));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = 0.07 + ((i * 5) % 3) * 0.03;
      corona.add(mesh(new THREE.ConeGeometry(0.02, len, 4), coronaM, Math.cos(a) * (0.22 + len / 2), Math.sin(a) * (0.22 + len / 2), -0.02, 0, 0, a - Math.PI / 2));
    }
    mergeByMaterial(corona);
    top.add(corona);
    const orbit = torus(0.25, 0.01, crackM, 0, 0, 0, 1.1, 0.4, 0, Math.PI * 2, 32);
    top.add(orbit);
    // tres esquirlas de obsidiana que flotan alrededor
    const shards = [];
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.OctahedronGeometry(0.045), obsid, 0, 0, 0);
      s.scale.set(0.7, 1.5, 0.7);
      top.add(s);
      shards.push(s);
    }
    // los foquitos violetas en el marco de la etiqueta
    const bulbs = bulbRow(g, [[-0.3, 0.34, 0.29], [0.3, 0.34, 0.29], [0.32, 1.69, 0.29]], 0xb070ff);
    mergeByMaterial(g, [top, ...bulbs]);
    let flick = 0;
    return {
      sign: { material: crackM },
      bulbs,
      front,
      anim: (t, dt, on) => {
        // la corona gira despacio, el aro torcido da vueltas, las esquirlas
        // orbitan a destiempo; las grietas laten desparejo (el caos)
        corona.rotation.z = t * 0.35;
        orbit.rotation.z = t * 1.3;
        shards.forEach((s, i) => {
          const a = t * (0.9 + i * 0.25) + i * 2.1;
          s.position.set(Math.cos(a) * 0.33, Math.sin(t * 1.7 + i) * 0.08, Math.sin(a) * 0.33);
          s.rotation.y = t * 2 + i;
        });
        top.position.y = 2.28 + Math.sin(t * 1.1) * 0.012;
        flick -= dt;
        if (flick <= 0) flick = 0.05 + Math.random() * 0.4;
        if (on) crackM.emissiveIntensity = flick < 0.06 ? 0.25 : 0.8 + Math.sin(t * 5.3) * 0.25;
      },
    };
  },
  stamin(g, P, label) {
    const paint = std({ color: 0xf2a81c, metalness: 0.35, roughness: 0.38 });
    const rubber = std({ color: 0x17181a, roughness: 0.92 });
    const chrome = std({ color: 0xeef0f2, metalness: 1, roughness: 0.15 });
    const foam = std({ color: 0x0e0e10, roughness: 0.75 });
    // el gabinete pintado, con los costados de goma
    g.add(mesh(rboxGeo(0.96, 1.92, 0.66, 0.08), paint, 0, 1.06, -0.02));
    g.add(mesh(boxGeo(1.1, 0.12, 0.76), rubber, 0, 0.06, -0.01));
    // las cintas de los costados: corren para abajo, como la de la trotadora
    const beltTex = canvasTex(64, 256, (ctx, w, h) => {
      ctx.fillStyle = '#1c1d20';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = '#34363b';
        ctx.fillRect(0, y, w, 5);
        ctx.fillStyle = '#0b0b0c';
        ctx.fillRect(0, y + 5, w, 2);
      }
    });
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(1, 3);
    const belt = std({ map: beltTex, roughness: 0.85 });
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.035, 1.62, 0.44), belt, sx * 0.505, 1.07, 0.0));
      for (const y of [0.24, 1.9]) g.add(mesh(cylGeo(0.05, 0.05, 0.5, 14), chrome, sx * 0.49, y, 0.0, Math.PI / 2));
    }
    const { front } = common(g, label, { z: 0.315, frame: chrome, frameW: 0.03, w: 0.78, h: 1.5, y: 1.08 });
    // las barandas de adelante, con los puños de goma, que suben a la consola
    for (const sx of [-1, 1]) {
      g.add(mesh(cylGeo(0.025, 0.025, 1.7, 10), chrome, sx * 0.47, 1.17, 0.36));
      g.add(mesh(cylGeo(0.036, 0.036, 0.42, 12), foam, sx * 0.47, 1.25, 0.36));
    }
    // la toalla colgada de la baranda izquierda
    const towel = std({ color: 0xf4f1ea, roughness: 0.95, side: THREE.DoubleSide });
    g.add(mesh(boxGeo(0.07, 0.44, 0.012), towel, -0.47, 1.7, 0.385, 0.06, 0, 0));
    g.add(mesh(boxGeo(0.07, 0.38, 0.012), towel, -0.47, 1.73, 0.335, -0.05, 0, 0));
    g.add(mesh(boxGeo(0.072, 0.025, 0.06), towel, -0.47, 1.93, 0.36));
    // la consola arriba, inclinada: el reloj de la velocidad y la fila de luces
    const con = new THREE.Group();
    con.position.set(0, 2.18, 0.12);
    con.rotation.x = 0.3;
    con.add(mesh(rboxGeo(1.0, 0.4, 0.14, 0.05), rubber, 0, 0, 0));
    const face = canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#101214';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h * 0.58);
      // las rayitas del reloj, la zona roja al final
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (1.15 + (i / 12) * 0.7);
        ctx.strokeStyle = i > 9 ? '#ff4a2a' : '#ffd23a';
        ctx.lineWidth = i % 3 ? 4 : 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 92, Math.sin(a) * 92);
        ctx.lineTo(Math.cos(a) * (i % 3 ? 76 : 66), Math.sin(a) * (i % 3 ? 76 : 66));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 34px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('km/h', 0, 46);
    });
    const dialMat = std({ color: 0x111111, map: face, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.1 });
    const dial = mesh(new THREE.CircleGeometry(0.15, 28), dialMat, 0, 0.0, 0.072);
    con.add(dial);
    con.add(torus(0.152, 0.012, chrome, 0, 0, 0.072, 0, 0, 0, Math.PI * 2, 28));
    const needle = new THREE.Group();
    needle.position.set(0, -0.012, 0.078);
    needle.add(mesh(boxGeo(0.012, 0.12, 0.006), std({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 0.6 }), 0, 0.055, 0));
    needle.add(mesh(cylGeo(0.016, 0.016, 0.012, 10), chrome, 0, 0, 0, Math.PI / 2));
    con.add(needle);
    // la pantallita roja de cada lado (el cartel: se prende con la luz)
    const led = glow(0xff5a1a);
    for (const sx of [-1, 1]) con.add(mesh(boxGeo(0.22, 0.09, 0.01), led, sx * 0.32, 0.05, 0.072));
    const bulbs = [];
    for (let i = 0; i < 6; i++) {
      const b = sphere(0.022, std({ color: 0x222222, emissive: i < 4 ? 0x7dff4a : 0xff4a2a, emissiveIntensity: 0 }), -0.42 + i * 0.05 + (i > 2 ? 0.59 : 0), -0.09, 0.074, 1, 1, 0.5, 8);
      con.add(b);
      bulbs.push(b);
    }
    g.add(con);
    // arriba de todo, la alpargata con alas (la del medallón), dando vueltas
    const shoe = new THREE.Group();
    const canvasWhite = std({ color: 0xfff4e2, roughness: 0.8 });
    const jute = std({ color: 0xc89a4a, roughness: 0.95 });
    const wingMat = std({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3 });
    shoe.add(shape([[-0.5, 0.3], [-0.47, -0.1], [-0.3, -0.06], [-0.12, -0.08], [0.1, -0.05], [0.28, 0.02], [0.42, 0.13], [0.55, 0.2], [0.57, 0.3]].map(([x, y]) => [x, -y]), 0.12, canvasWhite, 0, 0, 0, 0.32));
    shoe.add(mesh(rboxGeo(0.37, 0.05, 0.13, 0.02), jute, 0.012, -0.112, 0));
    for (const sz of [-1, 1]) {
      const wing = new THREE.Group();
      for (const [a, len] of [[2.05, 0.15], [2.4, 0.13], [2.75, 0.1]]) {
        const f = mesh(boxGeo(len, 0.035, 0.012), wingMat, Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, 0, 0, 0, a);
        wing.add(f);
      }
      wing.position.set(-0.12, 0.0, sz * 0.065);
      wing.rotation.y = sz * 0.35;
      shoe.add(wing);
    }
    shoe.position.set(0, 2.46, 0.0);
    mergeByMaterial(shoe);
    g.add(shoe);
    mergeByMaterial(g, [con, shoe]);
    let sp = 0;
    return {
      sign: { material: led },
      bulbs,
      front,
      anim: (t, dt, on) => {
        // la cinta corre, la aguja sube y baja con el trote y la alpargata gira
        sp += ((on ? 1 : 0.06) - sp) * Math.min(1, dt * 1.5);
        beltTex.offset.y += dt * sp * 1.6;
        needle.rotation.z = 0.95 - sp * (1.1 + Math.sin(t * 2.2) * 0.25 + Math.sin(t * 7.3) * 0.05);
        shoe.rotation.y = t * (0.4 + sp * 0.9);
        shoe.position.y = 2.46 + Math.abs(Math.sin(t * 4.2)) * 0.02 * sp;
      },
    };
  },
};

// La paja del techito: tallos dorados y grises apretados.
let strawCanvas = null;
function strawTex() {
  const t = canvasTex(128, 128, (ctx, w, h) => {
    if (!strawCanvas) {
      ctx.fillStyle = '#6a5430';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const v = 120 + Math.random() * 110;
        ctx.strokeStyle = `rgba(${v},${v * 0.84},${v * 0.5},0.85)`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 4, y + 10 + Math.random() * 16);
        ctx.stroke();
      }
      strawCanvas = ctx.canvas;
    } else ctx.drawImage(strawCanvas, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------- menos llamadas de dibujo ----------------
// Cada máquina tenía 14-30 mallas (una por material, más un foquito por malla)
// y con las sombras de Alta eran 35-55 dibujos por máquina. Dos arreglos:
//  · los foquitos: un InstancedMesh por grupo, el brillo de cada uno en su
//    color de instancia. Interactables y las anim siguen tocando
//    bulbs[k].material.emissiveIntensity (bulbs pasa a tener sustitutos).
//  · lo quieto sin textura: una sola malla con el color, la rugosidad, lo
//    metálico, el brillo y el reflejo de fx/Epic de cada pieza en los
//    vértices (mismo dibujo por píxel; Epic lo lee con userData.vRefl).

const BULB_GEO = new THREE.SphereGeometry(1, 8, 6);
let bulbMat = null;
function bulbMaterial() {
  if (bulbMat) return bulbMat;
  // (el color de instancia es el brillo: no tiñe el vidrio oscuro del foco)
  bulbMat = std({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 1 });
  bulbMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
  };
  bulbMat.customProgramCacheKey = () => 'perkBulb';
  return bulbMat;
}

function instanceBulbs(bulbs) {
  const byParent = new Map();
  bulbs.forEach((b, i) => {
    if (!b?.isMesh || !b.parent) return;
    if (!byParent.has(b.parent)) byParent.set(b.parent, []);
    byParent.get(b.parent).push(i);
  });
  const c = new THREE.Color();
  const sc = new THREE.Matrix4();
  for (const [parent, idx] of byParent) {
    const inst = new THREE.InstancedMesh(BULB_GEO, bulbMaterial(), idx.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    idx.forEach((i, n) => {
      const b = bulbs[i];
      b.updateMatrix();
      const r = b.geometry.parameters?.radius ?? 0.032;
      inst.setMatrixAt(n, sc.makeScale(r, r, r).premultiply(b.matrix));
      const base = b.material.emissive.clone();
      let k = b.material.emissiveIntensity;
      inst.setColorAt(n, c.copy(base).multiplyScalar(k));
      parent.remove(b);
      b.material.dispose();
      // el sustituto: el mismo emissiveIntensity de antes
      bulbs[i] = {
        material: {
          get emissiveIntensity() {
            return k;
          },
          set emissiveIntensity(v) {
            if (v === k) return;
            k = v;
            inst.setColorAt(n, c.copy(base).multiplyScalar(v));
            inst.instanceColor.needsUpdate = true;
          },
        },
      };
    });
    inst.computeBoundingSphere();
    parent.add(inst);
  }
}

// Qué tanto refleja un material en fx/Epic (su reflOf, de 0 a 15).
export function reflBucket(m) {
  const r = (1 - m.roughness) * (0.35 + 0.65 * (m.metalness || 0));
  return Math.round(Math.min(1, r / 0.8) * 15);
}

const PLAIN_OBC = THREE.Material.prototype.onBeforeCompile;
export function flattenable(m) {
  return (
    m?.type === 'MeshStandardMaterial' &&
    !m.map && !m.emissiveMap && !m.normalMap && !m.bumpMap && !m.roughnessMap && !m.metalnessMap && !m.alphaMap && !m.aoMap && !m.lightMap && !m.envMap && !m.displacementMap &&
    !m.transparent && m.opacity === 1 && !m.alphaTest && !m.vertexColors && !m.wireframe && m.visible && m.colorWrite && m.depthWrite && m.depthTest && !m.polygonOffset &&
    m.fog && m.toneMapped && m.blending === THREE.NormalBlending && m.onBeforeCompile === PLAIN_OBC && !Object.keys(m.userData).length
  );
}

const flatMats = new Map();
export function flatMaterial(side, flat, env) {
  const key = `${side}|${flat}|${env}`;
  let m = flatMats.get(key);
  if (m) return m;
  m = std({ color: 0xffffff, roughness: 1, metalness: 1, vertexColors: true, side, flatShading: flat, envMapIntensity: env });
  // (el reflejo de fx/Epic va por vértice: attribute refl)
  m.userData.vRefl = true;
  m.userData.reflRough = 1;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 pbr;\nattribute vec3 emi;\nvarying vec2 vPbr;\nvarying vec3 vEmi;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvPbr = pbr;\n\tvEmi = emi;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPbr;\nvarying vec3 vEmi;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor *= vPbr.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vEmi;');
  };
  m.customProgramCacheKey = () => 'perkFlat';
  flatMats.set(key, m);
  return m;
}

// Junta lo quieto que cuelga de `root` (bajando por los grupos quietos) en una
// malla (una por cara y sombra). `stop`: lo que se mueve o se deja aparte (ni se
// fusiona ni se baja por ahí); lo de adentro se junta en su propio llamado.
// `track` (opcional): las mallas que se quieren ubicar después en la malla
// junta (devuelve [{ o, out, start, count }], en vértices).
export function flatten(root, stop, dirty, track = null) {
  const groups = new Map();
  const recs = [];
  // (lo quieto que no entra, como el cartel que se prende: junto por material)
  const same = new Map();
  const walk = (node, rel) => {
    for (const o of [...node.children]) {
      if (stop.has(o) || !o.visible) continue;
      o.updateMatrix();
      const mat = rel ? rel.clone().multiply(o.matrix) : o.matrix.clone();
      if (!o.isMesh) {
        walk(o, mat);
        continue;
      }
      const m = o.material;
      if (o.isInstancedMesh || o.isSkinnedMesh || o.children.length || Array.isArray(m)) continue;
      if (dirty.has(m) || !flattenable(m)) {
        const k = `${m.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
        if (!same.has(k)) same.set(k, []);
        same.get(k).push({ o, node, mat });
        continue;
      }
      const key = `${m.side}|${m.flatShading ? 1 : 0}|${m.envMapIntensity}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { m, o, list: [] });
      let geo = o.geometry.clone().applyMatrix4(mat);
      if (geo.index) geo = geo.toNonIndexed();
      for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal') geo.deleteAttribute(n);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      const pbr = new Float32Array(n * 2);
      const emi = new Float32Array(n * 3);
      const refl = new Float32Array(n).fill(reflBucket(m) / 15);
      const e = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
      for (let i = 0; i < n; i++) {
        col[i * 3] = m.color.r;
        col[i * 3 + 1] = m.color.g;
        col[i * 3 + 2] = m.color.b;
        pbr[i * 2] = m.roughness;
        pbr[i * 2 + 1] = m.metalness;
        emi[i * 3] = e.r;
        emi[i * 3 + 1] = e.g;
        emi[i * 3 + 2] = e.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('pbr', new THREE.BufferAttribute(pbr, 2));
      geo.setAttribute('emi', new THREE.BufferAttribute(emi, 3));
      geo.setAttribute('refl', new THREE.BufferAttribute(refl, 1));
      groups.get(key).list.push(geo);
      if (track?.has(o)) recs.push({ o, key, i: groups.get(key).list.length - 1, count: n });
      node.remove(o);
    }
  };
  walk(root, null);
  for (const parts of same.values()) {
    if (parts.length < 2) continue;
    const list = parts.map(({ o, node, mat }) => {
      let geo = o.geometry.clone().applyMatrix4(mat);
      if (geo.index) geo = geo.toNonIndexed();
      for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      node.remove(o);
      return geo;
    });
    const { o } = parts[0];
    const out = new THREE.Mesh(mergeGeometries(list), o.material);
    out.castShadow = o.castShadow;
    out.receiveShadow = o.receiveShadow;
    root.add(out);
    list.forEach((x) => x.dispose());
  }
  for (const [key, { m, o, list }] of groups) {
    const starts = [];
    let at = 0;
    for (const x of list) {
      starts.push(at);
      at += x.attributes.position.count;
    }
    const out = new THREE.Mesh(mergeGeometries(list), flatMaterial(m.side, !!m.flatShading, m.envMapIntensity));
    out.castShadow = o.castShadow;
    out.receiveShadow = o.receiveShadow;
    root.add(out);
    list.forEach((x) => x.dispose());
    for (const r of recs) if (r.key === key) Object.assign(r, { out, start: starts[r.i] });
  }
  return recs;
}

// Lo que solo cambia de brillo (el cartel que se prende con la luz, lo que late,
// los foquitos) adentro de la malla junta: el material sigue siendo el mismo
// objeto, y al cambiarle emissiveIntensity se reescribe el brillo de sus
// vértices (attribute emi). Lo que quedó suelto con ese material (lo que se
// mueve) lo sigue leyendo del material.
function liveEmissive(mat, recs) {
  if (!recs.length) return;
  let ei = mat.emissiveIntensity;
  const write = (v) => {
    const e = mat.emissive;
    for (const r of recs) {
      const A = r.out.geometry.attributes.emi;
      for (let i = r.start; i < r.start + r.count; i++) A.setXYZ(i, e.r * v, e.g * v, e.b * v);
      A.addUpdateRange(r.start * 3, r.count * 3);
      A.needsUpdate = true;
    }
  };
  Object.defineProperty(mat, 'emissiveIntensity', {
    configurable: true,
    enumerable: true,
    get: () => ei,
    set: (v) => {
      if (v === ei) return;
      ei = v;
      write(v);
    },
  });
}

// Lo que la anim de la máquina cambia (un ensayo a ver qué se mueve): los
// materiales que cambian y lo que se mueve, se esconde o aparece.
function animDirty(g, anim) {
  const mats = new Set();
  g.traverse((o) => o.isMesh && mats.add(o.material));
  const snap = (m) => [m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.opacity, m.roughness, m.metalness, m.visible].join('|');
  const before = new Map([...mats].map((m) => [m, snap(m)]));
  const snapNoEi = (m) => [m.color?.getHex(), m.emissive?.getHex(), m.opacity, m.roughness, m.metalness, m.visible].join('|');
  const beforeNoEi = new Map([...mats].map((m) => [m, snapNoEi(m)]));
  // (después se deja todo como estaba: de lejos la anim no corre)
  const objs = [];
  g.traverse((o) => objs.push([o, o.visible, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const vals = [...mats].map((m) => [m, m.color?.clone(), m.emissive?.clone(), m.emissiveIntensity, m.opacity]);
  // (unos 15 s de reloj: los parpadeos al azar caen adentro)
  for (let i = 0; i < 150; i++) anim(i * 0.37, 0.1, i % 4 !== 3);
  const dirty = new Set();
  // (y los que solo cambian el brillo: pueden ir en la malla junta, liveEmissive)
  const eiOnly = new Set();
  for (const m of mats) {
    if (snap(m) === before.get(m)) continue;
    dirty.add(m);
    if (snapNoEi(m) === beforeNoEi.get(m)) eiOnly.add(m);
  }
  const moved = new Set();
  for (const [o, v, p, q, sc] of objs) {
    if (o.visible !== v || !o.position.equals(p) || !o.quaternion.equals(q) || !o.scale.equals(sc)) moved.add(o);
    o.visible = v;
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(sc);
  }
  for (const [m, c, e, ei, op] of vals) {
    if (c) m.color.copy(c);
    if (e) m.emissive.copy(e);
    m.emissiveIntensity = ei;
    m.opacity = op;
  }
  return { dirty, moved, eiOnly };
}

// Arma la máquina del perk (id de config/perks) con su etiqueta (perkLabel).
export function buildPerkMachine(id, perk, label) {
  const g = new THREE.Group();
  kept = [];
  const out = (BUILD[id] || BUILD.jugg)(g, perk, label);
  const skip = new Set(kept);
  kept = null;
  const { dirty, moved, eiOnly } = out.anim ? animDirty(g, out.anim) : { dirty: new Set(), moved: new Set(), eiOnly: new Set() };
  for (const o of moved) skip.add(o);
  // (2026-10-05, "juntá las máquinas": lo que solo cambia de brillo, el cartel,
  // lo que late y los foquitos, va adentro de la malla junta con el brillo por
  // vértice, liveEmissive; eran 2 o 3 dibujos más por máquina en cada pasada.
  // globalThis.__mduNoPerkMerge, al cargar: como antes, los foquitos en un
  // InstancedMesh y el cartel aparte)
  const merge = globalThis.__mduNoPerkMerge !== true && globalThis.__mduNoMerge !== true;
  const live = new Set();
  const flatOk = (m) => {
    if (!m || m.type !== 'MeshStandardMaterial') return false;
    const ud = m.userData;
    m.userData = {};
    const ok = flattenable(m);
    m.userData = ud;
    return ok;
  };
  if (merge) {
    const sm = out.sign?.material;
    if (sm && flatOk(sm) && (!dirty.has(sm) || eiOnly.has(sm))) live.add(sm);
    for (const m of eiOnly) if (flatOk(m)) live.add(m);
    for (const b of out.bulbs || []) if (b?.isMesh && flatOk(b.material)) live.add(b.material);
  }
  for (const m of live) dirty.delete(m);
  // (los foquitos venían apartados de mergeByMaterial porque cambian de brillo:
  // ahora entran en la malla junta, salvo los que se mueven)
  for (const b of out.bulbs || []) if (b?.isMesh && live.has(b.material) && !moved.has(b)) skip.delete(b);
  if (!live.has(out.sign?.material)) dirty.add(out.sign?.material);
  dirty.add(out.front);
  if (out.bulbs && !merge) instanceBulbs(out.bulbs);
  const track = merge ? new Set() : null;
  if (track) g.traverse((o) => o.isMesh && live.has(o.material) && track.add(o));
  // lo quieto de la máquina, y lo quieto de adentro de cada cosa que se mueve
  const recs = flatten(g, skip, dirty, track);
  for (const o of skip) if (!o.isMesh && o.parent) recs.push(...flatten(o, skip, dirty, track));
  for (const m of live) liveEmissive(m, recs.filter((r) => r.o.material === m && r.out));
  // (los grupos que quedaron vacíos)
  for (;;) {
    const empty = [];
    g.traverse((o) => o !== g && !o.isMesh && !o.children.length && !skip.has(o) && empty.push(o));
    if (!empty.length) break;
    for (const o of empty) o.parent.remove(o);
  }
  // el cartel: lo que Interactables prende con la luz (sign.material.emissiveIntensity)
  return { group: g, sign: out.sign, bulbs: out.bulbs, front: out.front, anim: out.anim };
}
