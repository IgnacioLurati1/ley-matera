import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from '../../world/props';

// Las crónicas de la Gran Guerra: cinco pergaminos por el castillo (el atril
// de la biblioteca, al lado del altar de la capilla, la sala del trono, la
// gruta del glaciar y la cumbre). Martín Fierro las lee en voz alta (cada uno
// las lee por su cuenta); leídas todas, el logro de Cronista del Castillo y
// un chamamé.
const CRONICAS = [
  {
    pos: [34, 38.6],
    atril: true,
    title: 'Crónica I · Antes de los mates',
    lines: [
      'Antes de los mates, la cordillera no era de nadie.',
      'Hasta que bajó de las nubes un ser chiquito, de sombrero y ojos de brasa. El Chiquitijuein.',
      'Donde pisaba se secaba la yerba, y la gente se olvidaba de convidar.',
    ],
  },
  {
    pos: [73.3, 35.6],
    rot: -Math.PI / 2,
    title: 'Crónica II · Los cuatro juramentos',
    lines: [
      'Cuatro gauchos le hicieron frente. El del fuego, el del viento, el del rayo y el del hielo.',
      'Cada uno cebó un mate con el alma de su elemento, y juró no soltarlo nunca.',
      'Así nacieron los cuatro mates de la luz.',
    ],
  },
  {
    pos: [48.5, 26],
    rot: Math.PI / 2,
    title: 'Crónica III · El trono vacío',
    lines: [
      'La Gran Guerra duró cien inviernos.',
      'Al final, los cuatro caballeros lo bajaron de ese trono, en este mismo castillo.',
      'El trono quedó vacío. Pero el Chiquitijuein no se murió. Se achicó, y se puso a esperar.',
    ],
  },
  {
    pos: [95.5, 49.5],
    rot: Math.PI,
    title: 'Crónica IV · El que duerme abajo',
    lines: [
      'Para que nadie usara los mates para el mal, los escondieron por todo el castillo.',
      'Y abajo, en la cueva, encadenaron al único que podía llevarlos al cielo. El Mateendrache.',
      'Dicen que cuando silba la pava, el dragón sueña.',
    ],
  },
  {
    pos: [60.5, 9.2],
    rot: 0.6,
    title: 'Crónica V · Las espadas en la nieve',
    lines: [
      'Los caballeros descansan acá arriba, con las espadas clavadas en la nieve.',
      'Juraron que, si él volvía, se iban a alzar una vez más.',
      'Si leíste hasta acá, ya sabés lo que viene. Cebá, que se enfría.',
    ],
  },
];

let PAGE = null;
function pageMat() {
  if (PAGE) return PAGE;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#e4d4a8';
  x.fillRect(0, 0, 128, 96);
  x.fillStyle = 'rgba(120,80,30,0.25)';
  x.fillRect(0, 0, 128, 6);
  x.fillRect(0, 90, 128, 6);
  x.fillStyle = '#3a2410';
  for (let r = 0; r < 8; r++) {
    let px = 10;
    while (px < 118) {
      const w = 4 + ((px * 7 + r * 13) % 11);
      x.fillRect(px, 14 + r * 9, Math.min(w, 118 - px), 2);
      px += w + 3;
    }
  }
  x.fillStyle = '#8e1d16';
  x.fillRect(8, 12, 7, 9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  PAGE = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0x3a2a12, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  return PAGE;
}

export default class Cronicas {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    const M = g.world.M;
    this.read = 0;
    this.list = CRONICAS.map((def, i) => {
      const [x, z] = def.pos;
      const y = g.world.floorAt(x, z);
      let at = new THREE.Vector3(x, y + 1.2, z);
      if (!def.atril) {
        // el pedestal de piedra con el pergamino abierto y dos velas
        const grp = new THREE.Group();
        grp.position.set(x, y, z);
        grp.rotation.y = def.rot || 0;
        const st = M.castleStone || M.stone;
        grp.add(mesh(cylGeo(0.16, 0.22, 0.95, 8), st, 0, 0.475, 0));
        grp.add(mesh(boxGeo(0.5, 0.06, 0.4), M.castleStoneDark || st, 0, 0.97, 0, -0.35, 0, 0));
        const page = mesh(new THREE.PlaneGeometry(0.44, 0.32), pageMat(), 0, 1.012, 0.004, -0.35 - Math.PI / 2, 0, 0);
        grp.add(page);
        for (const s of [-1, 1]) grp.add(mesh(cylGeo(0.04, 0.04, 0.34, 8), M.paper || pageMat(), s * 0.25, 1.02, -0.03, 0, 0, Math.PI / 2));
        egg.root.add(grp);
        at = new THREE.Vector3(x, y + 1.05, z);
      }
      const c = { def, i, at, done: false, reading: false, glowT: Math.random() };
      g.interact.add({
        kind: 'cronica',
        local: true,
        pos: at,
        radius: 1.8,
        prompt: () => (c.done || c.reading ? null : { text: `leer la ${def.title}`, noCost: true }),
        cost: () => 0,
        use: () => this.readOne(c),
      });
      return c;
    });
  }

  readOne(c) {
    const g = this.g;
    if (c.done || c.reading) return false;
    c.reading = true;
    g.hud.subtitle(c.def.title, 2.5);
    const next = (k) => {
      if (k >= c.def.lines.length) {
        this.finish(c);
        return;
      }
      const d = g.say('fierro', c.def.lines[k], 'fierro', { local: true });
      g.later((d || 3) + 0.5, () => next(k + 1));
    };
    g.later(1.2, () => next(0));
    return true;
  }

  finish(c) {
    const g = this.g;
    c.reading = false;
    c.done = true;
    this.read++;
    if (this.read === this.list.length) {
      g.hud.achievement('Cronista del Castillo', 'Leíste las crónicas de la Gran Guerra');
      g.later(0.8, () => g.audio.chamame?.());
    } else g.hud.subtitle(`Crónicas leídas: ${this.read} de ${this.list.length}.`, 3);
  }

  // un brillito dorado en las que faltan leer, para que se encuentren
  update(dt) {
    const g = this.g;
    for (const c of this.list) {
      if (c.done) continue;
      c.glowT -= dt;
      if (c.glowT > 0) continue;
      c.glowT = 1.4 + Math.random();
      if (c.at.distanceTo(g.player.pos) < 18) g.fx.sparkle?.(c.at, [1, 0.85, 0.45], 2, 0.25);
    }
  }
}
