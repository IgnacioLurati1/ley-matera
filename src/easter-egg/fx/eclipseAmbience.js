import { assetUrl } from '../../lib/assets';
import { ZONES } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';
import { eclSfx } from './eclipseSfx';

// El ambiente de Eclipse Matero, isla por isla (2026-10-08, ITERACION-8, el
// usuario: "sonido ambiente igual al del mapa en el que estás"). En cada isla
// suena el ambiente de su mapa: el loop grabado que ya suena en el menú de ese
// mapa (ui/menuAmbience.js, public/assets/sotano/sfx/menu/<mapa>.mp3, todos
// CC0): el claro, el del estero; La Tapera, el de la granja; el resto, el
// suyo; El Nudo, el de Eclipse. En La Disformidad (la dimensión oscura), el
// bucle que dejó el usuario (sfx/eclipse/dim-bucle) y, muy de vez en cuando,
// un susurro de los suyos atrás del jugador ("i see you" y los dos susurros
// "rarísimos"; alguna vez la risa demoníaca). Y en cada ronda, con poca
// suerte, uno de sus "sonidos poco probables por ronda".
// Entre islas, un fundido de ~3 s. Va por el volumen de Ambiente
// (core/audio cats.world). Fuera de la partida, en la entrada y en la pelea de
// San Lorenzo (que tiene lo suyo), callado; en las escenas, más bajo.
// (2026-10-08, el usuario, ya jugándolo: el del estero y el del penal, más
// bajos —a la par de La Tapera, el molino y el castillo—; el del Monumento
// era el del río y en esta isla no hay río: ahora la ciudad de noche,
// sfx/eclipse/amb-monumento.mp3, de "city-night-quiet" de ragamuffin
// (Freesound 197211) y "Ambience City Quiet Night Air Tone" de leonelmail
// (427841), los dos CC0; y la dimensión oscura "aturde bastante": más baja.)
// Lo llama entities/EclipseEgg.js update. globalThis.__mduOldEclAmb: sin esto.

const MENU = '/assets/sotano/sfx/menu/';
const LOOP_OF = { centro: 'esteros', molino: 'molino', tapera: 'granja', penal: 'penal', monumento: 'amb-monumento', torre: 'torre', castillo: 'castillo', desgarro: 'eclipse', abismo: 'dim' };
// (los que salen de sfx/eclipse —fx/eclipseSfx— y no del menú)
const ECL_LOOP = { dim: 'dim-bucle', 'amb-monumento': 'amb-monumento' };
// (los loops del menú están a -22,5 LUFS; el de la dimensión, a -21; el de la
// ciudad, a -24. Medidos parecido, pero las ranas y los grillos del estero y
// la lluvia con truenos del penal se oían más fuerte)
const LEVEL = 0.55;
const LEVEL_DIM = 0.42;
const TRIM = { esteros: 0.55, penal: 0.6, 'amb-monumento': 1.15 };
const DUCK = 0.35;
// el fundido (constante de tiempo, s)
const FADE = 1.0;
const WHISPERS = ['dim-i-see-you', 'dim-susurro-1', 'dim-susurro-2'];
const isleOfZone = (k) => (k ? Object.keys(ISLANDS).find((id) => ISLANDS[id].zones.includes(k)) || ZONES[k]?.isla || null : null);

class EclAmbience {
  constructor(g) {
    this.g = g;
    this.a = g.audio;
    this.buf = {};
    this.asked = new Set();
    this.isle = null;
    this.want = null;
    this.cur = null;
    this.level = -1;
    this.whT = 40;
    this.round = null;
  }

  // Cada cuadro.
  tick(dt) {
    const g = this.g;
    const a = this.a;
    if (!a?.ctx) return;
    const playing = g.state === 'playing' || g.state === 'paused';
    const on = playing && !g.intro?.active && !g.ee?.arena?.active && globalThis.__mduOldEclAmb !== true;
    // la isla donde está (si no hay zona, la de antes)
    const P = g.player;
    const dim = (g.weather?.atmos?.dim || 0) > 0.5;
    const z = on ? g.world.zoneAt?.(P.pos.x, P.pos.z, P.pos.y) : null;
    const isle = dim ? 'abismo' : isleOfZone(z) || this.isle;
    this.isle = isle;
    const want = on && isle ? LOOP_OF[isle] || null : null;
    if (want !== this.want) this.set(want);
    if (this.cur) {
      const lv = (this.cur.name === 'dim' ? LEVEL_DIM : LEVEL) * (TRIM[this.cur.name] ?? 1) * (g.ee?.scene || g.cine ? DUCK : 1) * (g.state === 'paused' ? 0.5 : 1) * (g.weather?.atmos?.rift ? 0.5 : 1) * (g.ee?.scene?.cine?.hush ? 0 : 1);
      if (Math.abs(lv - this.level) > 0.01) {
        this.level = lv;
        this.cur.out.gain.setTargetAtTime(lv, a.now, FADE);
      }
    }
    if (!on) return;
    // los susurros de la dimensión oscura: muy de vez en cuando
    if (isle === 'abismo') {
      this.whT -= dt;
      if (this.whT <= 0) {
        this.whT = 50 + Math.random() * 70;
        if (Math.random() < 0.4) this.whisper();
      }
    }
    // el sonido raro de la ronda: con poca suerte, un rato después de que empieza
    const r = g.rounds?.round;
    if (r != null && r !== this.round) {
      const first = this.round == null;
      this.round = r;
      if (!first && Math.random() < 0.15) {
        const id = Math.random() < 0.5 ? 'ronda-raro-1' : 'ronda-raro-2';
        eclSfx(g).load([id]);
        this.rareT = 4 + Math.random() * 20;
        this.rareId = id;
      }
    }
    if (this.rareT != null) {
      this.rareT -= dt;
      if (this.rareT <= 0) {
        this.rareT = null;
        if (g.state === 'playing') eclSfx(g).play(this.rareId, { gain: 0.6, reverb: 0.7 });
      }
    }
  }

  // Uno de los susurros, atrás del jugador (a 3-6 m, un poco al costado).
  whisper() {
    const g = this.g;
    const P = g.player;
    const id = Math.random() < 0.15 ? 'risa-demoniaca' : WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
    const yaw = P.yaw ?? 0;
    const d = 3 + Math.random() * 3;
    const s = (Math.random() - 0.5) * 3;
    // (adelante del jugador: -sin, -cos del yaw de la cámara; atrás, al revés)
    const pos = { x: P.pos.x + Math.sin(yaw) * d + Math.cos(yaw) * s, y: P.pos.y + 1.4, z: P.pos.z + Math.cos(yaw) * d - Math.sin(yaw) * s };
    eclSfx(g).play(id, { pos, gain: id === 'risa-demoniaca' ? 0.8 : 1.1, reverb: 0.6, ref: 3 });
  }

  set(name) {
    this.want = name;
    this.stop();
    if (!name) return;
    if (name === 'dim') {
      // (los de la dimensión, de una vez)
      eclSfx(this.g).load(['dim-bucle', ...WHISPERS, 'risa-demoniaca']);
    }
    const b = this.bufOf(name);
    if (b) this.start(name, b);
    else this.load(name);
  }

  bufOf(name) {
    if (ECL_LOOP[name]) return this.a.ecl?.buf?.[ECL_LOOP[name]] || null;
    return this.buf[name] || this.g.menuAmb?.buf?.[name] || null;
  }

  load(name) {
    if (this.asked.has(name)) return;
    this.asked.add(name);
    const p =
      ECL_LOOP[name]
        ? eclSfx(this.g)
            .load([ECL_LOOP[name]])
            .then(() => this.bufOf(name))
        : fetch(assetUrl(`${MENU}${name}.mp3`))
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
            .then((ab) => this.a.ctx.decodeAudioData(ab))
            .then((b) => (this.buf[name] = b));
    p.then((b) => {
      if (!b) return Promise.reject(new Error('sin ' + name));
      if (this.want === name && !this.cur) this.start(name, b);
    }).catch(() => this.asked.delete(name));
  }

  start(name, buf) {
    const a = this.a;
    const c = a.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const out = c.createGain();
    out.gain.value = 0.0001;
    src.connect(out).connect(a.cats.world.dry);
    // (cada vez desde otro lugar del loop)
    src.start(a.now, Math.random() * buf.duration);
    this.cur = { name, src, out };
    this.level = -1;
  }

  stop() {
    const C = this.cur;
    if (!C) return;
    this.cur = null;
    this.level = -1;
    const t = this.a.now;
    C.out.gain.cancelScheduledValues(t);
    C.out.gain.setValueAtTime(C.out.gain.value, t);
    C.out.gain.setTargetAtTime(0, t, FADE);
    try {
      C.src.stop(t + FADE * 6);
    } catch {
      /* ya paró */
    }
  }
}

// uno por partida (por contexto de audio)
export function eclAmbience(g) {
  if (!g?.audio) return null;
  return (g.audio.eclAmb ||= new EclAmbience(g));
}
