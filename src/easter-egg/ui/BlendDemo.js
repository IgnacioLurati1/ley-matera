import CastleCine from './castleCine';
import CineActors from './cineActors';
import BlendScene, { loadBlendScene } from './blendScene';

// Una escena de prueba hecha entera en Blender (ui/blendScene.js), para ver el
// motor andando: no es parte de la historia. Menú de escenas (Alt+I, en el
// servidor de desarrollo): "Prueba: escena hecha en Blender".
// La escena: C:/Users/ignac/Tools/mdu-blender/demo_monumento.py.
class BlendDemo extends CastleCine {
  constructor(g, D) {
    super(g, { kind: 'castillo' });
    this.D = D;
  }

  build() {
    const g = this.g;
    this.actors = new CineActors(g, { base: 560, shades: false, bandanas: false });
    this.blend = new BlendScene(g, this.D, {
      actors: this.actors,
      on: {
        // (el texto se va cuando termina la línea)
        di: (e) => {
          const d = this.say(e.who, e.text);
          this.later(d + (this.g.audio.sayWait || 0), () => this.quiet());
        },
        negro: (e) => this.fade(e.on),
        cartel: (e) => this.card(e.text),
      },
    });
    this.t0 = null;
    return [
      [
        0.3,
        () => {
          this.t0 = this.t;
          return this.blend.dur;
        },
      ],
      [0.8, () => 0],
    ];
  }

  tick(dt, t) {
    this.actors.tick(dt);
    this.blend.update(this.t0 == null ? 0 : t - this.t0);
    // (Game no le pisa el lente a la escena: Game.update, cineFov)
    this.wantFov = this.blend.fov;
  }

  cleanup() {
    this.blend?.dispose();
    this.actors?.dispose();
  }
}

export async function playBlendDemo(g, id = 'demo-monumento') {
  const E = g.ee;
  if (!E || E.scene) return null;
  const D = await loadBlendScene(id);
  if (E.scene) return null;
  const cine = new BlendDemo(g, D);
  E.scene = { update: (dt) => cine.update(dt), kind: 'blender', cine };
  cine.play(() => {
    E.scene = null;
  });
  return cine;
}
