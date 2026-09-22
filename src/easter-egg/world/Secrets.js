import * as THREE from 'three';
import { getMats } from '../weapons/viewmodels';
import { mergeByMaterial } from './props';

// Secretos que no pide nadie:
//  · Tres ositos materos escondidos. Con un tiro a cada uno, suena "La zamba
//    del osito" (como la canción escondida del original).
//  · Una cuarta radio, debajo del escritorio del Patrón: el Capataz de joven
//    cuenta cómo empezó todo.
// En línea lo decide el anfitrión: los tiros de los invitados se le avisan.

const BEARS = [
  { pos: [5.0, 0.9, 44.5], yaw: 0.6 }, // arriba de un barril del galpón
  { pos: [28.3, 0.98, 22.3], yaw: Math.PI / 2 }, // en el techo de la cucha del patio
  { pos: [42.6, 2.2, 43.4], yaw: Math.PI / 2 }, // arriba de la biblioteca del Patrón
];

const RADIO4 = {
  pos: [48.5, 0, 36.15],
  lines: [
    'Esto es para el que venga después. Me llamo Anselmo Ruiz, capataz del molino Santa Ana. Invierno de mil novecientos once.',
    'El patrón quería que el molino no parara nunca. Ni de noche, ni los domingos. Los peones ya no daban más.',
    'Una noche bajó a la Salamanca, la cueva del monte, y volvió con un contrato firmado en tinta colorada.',
    'Desde entonces los peones no se cansan, no comen, no duermen. Siguen trabajando aunque se les caiga la carne.',
    'El único que no firmó fue un viejo payador que toma mate en la capilla. Dicen que al Diablo ya le ganó una vez, cantando.',
    'Si lo encuentran, cébenle un mate. Yo ya no puedo: el patrón me dio el silbato... y ya siento el frío en las manos.',
  ],
};

export default class Secrets {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.shotCount = 0;
    this.songDone = false;
    this.buildBears();
    this.buildRadio();
  }

  // ---------------- ositos ----------------
  buildBears() {
    const fur = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 1, map: this.g.textures.burlap });
    const light = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 0.4 });
    const mm = getMats(this.g.textures);
    const S = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    };
    this.bears = BEARS.map((def, i) => {
      const g = new THREE.Group();
      // sentado: panza, cabeza, orejas, hocico, patitas y un mate entre las manos
      g.add(S(0.075, fur, 0, 0.075, 0, 1, 1.05, 0.9));
      g.add(S(0.045, light, 0, 0.07, 0.052, 1, 1.1, 0.5));
      g.add(S(0.058, fur, 0, 0.19, 0.005));
      for (const s of [-1, 1]) {
        g.add(S(0.022, fur, s * 0.045, 0.24, 0));
        g.add(S(0.011, light, s * 0.045, 0.24, 0.012));
        g.add(S(0.03, fur, s * 0.07, 0.1, 0.035, 0.8, 1.3, 0.8));
        g.add(S(0.03, fur, s * 0.045, 0.025, 0.06, 0.9, 0.7, 1.4));
        g.add(S(0.008, dark, s * 0.022, 0.205, 0.05));
      }
      g.add(S(0.022, light, 0, 0.18, 0.05, 1, 0.8, 0.9));
      g.add(S(0.008, dark, 0, 0.187, 0.07));
      const mate = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), mm.gourd);
      mate.scale.set(1, 1.15, 1);
      mate.position.set(0, 0.11, 0.075);
      g.add(mate);
      const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6), mm.silver);
      straw.position.set(0.01, 0.15, 0.075);
      straw.rotation.z = -0.3;
      g.add(straw);
      mergeByMaterial(g);
      g.position.set(...def.pos);
      g.rotation.y = def.yaw;
      this.root.add(g);
      return { i, group: g, alive: true, center: new THREE.Vector3(def.pos[0], def.pos[1] + 0.12, def.pos[2]) };
    });
  }

  onShot(origin, dir, maxT) {
    for (const b of this.bears) {
      if (!b.alive) continue;
      const v = b.center.clone().sub(origin);
      const t = v.dot(dir);
      if (t < 0 || t > maxT + 0.3) continue;
      if (v.addScaledVector(dir, -t).length() < 0.17) this.hitBear(b);
    }
  }

  onExplosion(pos, radius) {
    for (const b of this.bears) if (b.alive && pos.distanceTo(b.center) < radius * 0.5) this.hitBear(b);
  }

  hitBear(b) {
    const g = this.g;
    if (g.net?.guest) {
      g.net.net.send({ t: 'secret', k: 'bear', i: b.i });
      this.popBear(b.i);
      return;
    }
    this.popBear(b.i);
    g.net?.event('bear', { i: b.i });
    const left = this.bears.filter((x) => x.alive).length;
    if (!left) g.later(1.2, () => this.playSong());
  }

  // El osito revienta en una nube de relleno con un chillido de juguete.
  popBear(i) {
    const g = this.g;
    const b = this.bears[i];
    if (!b?.alive) return;
    b.alive = false;
    b.group.visible = false;
    g.fx.dust(b.center, { x: 0, y: 1, z: 0 }, [0.95, 0.92, 0.85], 14);
    g.fx.sparkle(b.center, [1, 0.9, 0.6], 6, 0.3);
    g.audio.squeakToy(b.center);
    const left = this.bears.filter((x) => x.alive).length;
    if (left) g.hud.subtitle(`${3 - left} de 3...`, 1.8);
  }

  playSong() {
    const g = this.g;
    if (this.songDone) return;
    this.songDone = true;
    g.net?.event('song');
    const dur = g.audio.secretSong();
    g.hud.subtitle('♪ La zamba del osito ♪', 4);
    g.hud.achievement('Ositos materos', 'Encontraste los tres ositos');
    return dur;
  }

  // ---------------- la cuarta radio ----------------
  buildRadio() {
    const g = this.g;
    const M = g.world.M;
    const wood = new THREE.MeshStandardMaterial({ map: g.textures.woodCarved, color: 0x5a3a22, roughness: 0.6 });
    const grp = new THREE.Group();
    grp.position.set(...RADIO4.pos);
    grp.rotation.y = 0.15;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.15), wood);
    body.position.y = 0.1;
    grp.add(body);
    const dialMat = new THREE.MeshStandardMaterial({ color: 0x2a1008, emissive: 0xff5a30, emissiveIntensity: 0.2 });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), dialMat);
    dial.position.set(-0.06, 0.1, 0.076);
    grp.add(dial);
    const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.12), M.black);
    grill.position.set(0.07, 0.1, 0.076);
    grp.add(grill);
    this.root.add(grp);
    this.radio = { dial: dialMat, heard: false, playing: false, pos: new THREE.Vector3(RADIO4.pos[0], 0.3, RADIO4.pos[2]) };
    g.interact.add({
      kind: 'radio4',
      pos: this.radio.pos,
      radius: 1.9,
      wide: true,
      prompt: () => (this.radio.heard || this.radio.playing ? null : { text: 'escuchar la radio de abajo del escritorio', noCost: true }),
      cost: () => 0,
      use: () => {
        if (this.radio.heard || this.radio.playing) return false;
        this.playRadio();
        return true;
      },
    });
  }

  playRadio() {
    const g = this.g;
    const r = this.radio;
    if (r.playing || r.heard) return;
    g.net?.event('radio4');
    r.playing = true;
    r.dial.emissiveIntensity = 2.5;
    g.audio.radioTune(r.pos, 4);
    const next = (k) => {
      if (k >= RADIO4.lines.length) {
        r.playing = false;
        r.heard = true;
        r.dial.emissiveIntensity = 0.3;
        g.hud.achievement('La confesión del Capataz', 'Escuchaste la radio escondida');
        return;
      }
      const d = g.say('capatazJoven', RADIO4.lines[k], 'capatazJoven', { local: true });
      g.audio.radioTune(r.pos, d + 0.4);
      g.later(d + 0.7, () => next(k + 1));
    };
    g.later(0.9, () => next(0));
  }

  dispose() {
    this.root.removeFromParent();
  }
}
