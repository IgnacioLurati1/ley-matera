import { MAP_ID } from '../config/map';

// El ambiente del menú: mientras se está en el título, detrás suena el mapa
// elegido (el usuario, 2026-10-08). Loops de 50-60 s armados con grabaciones
// de verdad (Freesound, todas CC0: dominio público, sin atribución), a -22
// LUFS, en public/assets/sotano/sfx/menu/<mapa>.mp3:
//  · molino: "Wind blowing at a distance, some birds (oriole), crickets and
//    insects in the countryside" de felix.blume (648796);
//  · granja: "Lagoon evening, wind in trees, crows" de vovere (388466);
//  · penal: "distant storm 1" de Soojay (319568) + "distant rain and thunder"
//    de bastipictures (243777);
//  · esteros: "Serrinha do alambari night frogs chorus with close crickets" de
//    MeliaRoger (645706);
//  · torre: "Wind storm, trees, 80km gusts" de TRP (616925) + "Bardenas wind
//    birds leaves strong" de PLukx (256125);
//  · castillo: "Big Cold Winter Wind" de craigsmith (481148) + "Heavy snow
//    storm" de martypinso (22606);
//  · monumento: "City hum, night, river ambience" de softwalls (385104) +
//    "Gentle small waves lapping on shore" de Alex_hears_things (352356) + una
//    sirena de niebla lejana, "Fog horn as heard from shore" de richwise (795709);
//  · eclipse: "Soft Tonal Wind_01" de janbezouska (397091, más grave) + la
//    tormenta lejana del penal.
// Se baja solo el del mapa elegido, cuando se lo elige. Va por el volumen de
// Ambiente (core/audio.js cats.world). En la pulpería y la armería (menús con
// escena propia) queda más bajo. globalThis.__mduNoMenuAmb = true: sin ambiente.

const DIR = '/assets/sotano/sfx/menu/';
const MAPS = ['molino', 'granja', 'penal', 'esteros', 'torre', 'castillo', 'monumento', 'eclipse'];
const LEVEL = 0.6;
const DUCK = 0.35;
// cuánto tarda en entrar y en irse (constante de tiempo, s)
const FADE_IN = 1.2;
const FADE_OUT = 0.5;

export default class MenuAmbience {
  constructor(audio) {
    this.a = audio;
    this.buf = {};
    this.asked = new Set();
    this.want = null;
    this.cur = null;
    this.level = 0;
  }

  // Cada cuadro (Game.loop): qué tiene que sonar.
  tick(g) {
    const on = g.state === 'title' && globalThis.__mduNoMenuAmb !== true && MAPS.includes(MAP_ID);
    const want = on ? MAP_ID : null;
    if (want !== this.want) this.set(want);
    if (!this.cur) return;
    const level = g.menus?.stage ? LEVEL * DUCK : LEVEL;
    if (level !== this.level) {
      this.level = level;
      this.cur.out.gain.setTargetAtTime(level, this.a.now, FADE_IN);
    }
  }

  set(map) {
    this.want = map;
    this.stop();
    if (!map) return;
    if (this.buf[map]) this.start(map);
    else this.load(map);
  }

  load(map) {
    if (this.asked.has(map)) return;
    this.asked.add(map);
    fetch(`${DIR}${map}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => this.a.ctx.decodeAudioData(ab))
      .then((b) => {
        this.buf[map] = b;
        if (this.want === map && !this.cur) this.start(map);
      })
      .catch(() => this.asked.delete(map));
  }

  start(map) {
    const c = this.a.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buf[map];
    src.loop = true;
    const out = c.createGain();
    out.gain.value = 0.0001;
    src.connect(out).connect(this.a.cats.world.dry);
    // (cada vez desde otro lugar del loop)
    src.start(this.a.now, Math.random() * src.buffer.duration);
    this.cur = { map, src, out };
    this.level = 0;
  }

  stop() {
    const C = this.cur;
    if (!C) return;
    this.cur = null;
    this.level = 0;
    const t = this.a.now;
    C.out.gain.cancelScheduledValues(t);
    C.out.gain.setTargetAtTime(0, t, FADE_OUT);
    try {
      C.src.stop(t + FADE_OUT * 6);
    } catch {
      /* ya paró */
    }
  }
}
