import { assetUrl } from '../../lib/assets';

// Los sonidos grabados de Eclipse Matero que dejó el usuario (2026-10-08,
// Desktop\Musica eclipse\Sonidos), en /public/assets/sotano/sfx/eclipse:
//  · jinete-ataque-1 / -2: el ataque de los jinetes del caos (el 1, que venía
//    "muy seco y con mucho volumen", 3 dB más bajo y siempre con eco);
//  · jinete-risa: la risa de los jinetes cuando rondan el mapa;
//  · risa-demoniaca: para los jinetes y algún susurro;
//  · sable-desenvaina: el sable que sale de la vaina (+13 dB: venía muy bajo);
//  · dim-bucle: el fondo de la dimensión oscura (55,6 s; la cola fundida con
//    el principio: da la vuelta sin costura);
//  · dim-i-see-you, dim-susurro-1 / -2: susurros rarísimos de la dimensión oscura;
//  · ronda-raro-1 / -2: sonidos poco probables de una ronda.
// Y uno armado acá (2026-10-08, el usuario: "cuando las piedras suben no hacen
// ruido", la entrada): piedras-suben, 11 s, de tres grabaciones de Freesound
// CC0 —"Earthquake in cave" de Bertsz (524307), "Heavy Stone Scraping, Being
// Dragged" de CheatinSloth (738784) y "Bricks/Stones/Rocks/Gravel Falling" de
// iwanPlays (567249)—, más graves, a -20,5 LUFS.
// sombrero-listo (2026-10-10, el usuario): "deep space" de freesound_community
// (26725), la confirmación de los 100 muertos de la dimensión oscura del
// chambergo (entities/eclipse/Sombrero.js); 2 dB más bajo, -21 LUFS.
// La Furia de la guadaña (2026-10-10, el usuario; weapons/Desgarrador.js):
//  · furia-activa: "se activo la furia" (7,7 s; venía a -7,5 LUFS y pasada de
//    tope: 8 dB más baja, -16 LUFS, sin lo de abajo de 30 Hz). Suena mientras
//    se prende, con la entrada fundida ("arranca medio fuerte").
//  · furia-cargada: "furia se cargo" (la barra llena; sin el silencio del
//    principio, de -12,4 a -19 LUFS).
//  · furia-fin: "furia se acaba" (de -13,8 a -19 LUFS).
// Los portales (2026-10-10, el usuario: Desktop\portales, "reemplazalo por los
// anteriores", que eran sintetizados):
//  · portal-teleport: el viaje de un portal, en dos partes (la entrada a 0,1 s
//    y la salida a 0,7 s: calza con el túnel de world/eclipsePortals, 1,27 s).
//  · portal-teleport-raro: el mismo viaje, menos del 5 % de las veces.
//  · portal-caos-abre: la apertura del portal negro (el que lleva a la
//    dimensión oscura): sube 2 s, ruge hasta los 5,5 y se apaga a los 9
//    (recortado de 18 a 11,5 s: el resto era silencio).
//  · portal-cose: una grieta que se cose (world/papGrietas.js): crece 3,9 s y
//    se corta (recortado de 8,6 a 7,5 s).
//  Nivelados a -16,5 / -18 LUFS.
// Se bajan una sola vez (al primer uso o con load()), y suenan con
// audio.playBuffer —por el volumen de Ambiente/efectos— o en bucle (loop()).
const DIR = '/assets/sotano/sfx/eclipse/';
export const ECL_IDS = ['jinete-ataque-1', 'jinete-ataque-2', 'jinete-risa', 'risa-demoniaca', 'sable-desenvaina', 'dim-bucle', 'dim-i-see-you', 'dim-susurro-1', 'dim-susurro-2', 'ronda-raro-1', 'ronda-raro-2', 'piedras-suben', 'sombrero-listo', 'furia-activa', 'furia-cargada', 'furia-fin', 'portal-teleport', 'portal-teleport-raro', 'portal-caos-abre', 'portal-cose'];

class EclSfx {
  constructor(audio) {
    this.a = audio;
    this.buf = {};
    this.asked = new Map();
  }

  // Baja esos (o todos) si todavía no bajaron. Devuelve una promesa.
  load(ids = ECL_IDS) {
    const a = this.a;
    if (!a?.ctx) return Promise.resolve();
    return Promise.all(
      ids.map((id) => {
        if (this.asked.has(id)) return this.asked.get(id);
        const p = fetch(assetUrl(DIR + id + '.mp3'))
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((ab) => a.ctx.decodeAudioData(ab))
          .then((b) => (this.buf[id] = b))
          .catch(() => {
            this.asked.delete(id);
            return null;
          });
        this.asked.set(id, p);
        return p;
      }),
    );
  }

  has(id) {
    return !!this.buf[id];
  }

  // Suena una vez (si todavía no bajó, cuando baje —si tarda menos de 1,5 s—).
  // o: { pos, gain, reverb, rate, ref }
  play(id, o = {}) {
    const a = this.a;
    if (!a?.ctx) return false;
    const go = (b) => b && a.playBuffer(b, { gain: 1, reverb: 0.3, ...o, ref: o.pos ? o.ref ?? 6 : undefined });
    if (this.buf[id]) {
      go(this.buf[id]);
      return true;
    }
    const t0 = a.ctx.currentTime;
    this.load([id]).then(() => a.ctx.currentTime - t0 < 1.5 && go(this.buf[id]));
    return false;
  }

  // En bucle (core/weaponSfx loopBuf). Devuelve el que lo corta ({ stop() }) o
  // null si todavía no bajó (se pide; probar de nuevo más tarde).
  loop(id, o = {}) {
    const a = this.a;
    const b = this.buf[id];
    if (!b) {
      this.load([id]);
      return null;
    }
    if (!a.guns?.loopBuf) return null;
    return a.guns.loopBuf(b, o.pos || null, { gain: 1, reverb: 0.2, ref: 4, fadeIn: 2, from: 0, to: b.duration, offset: Math.random() * b.duration, ...o });
  }
}

// uno por contexto de audio
export function eclSfx(g) {
  const a = g?.audio;
  if (!a) return { play() {}, loop() { return null; }, load() { return Promise.resolve(); }, has() { return false; } };
  return (a.ecl ||= new EclSfx(a));
}
