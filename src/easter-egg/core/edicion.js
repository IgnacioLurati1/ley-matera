// Las dos ediciones del juego (el usuario, 2026-10-15): la de escritorio es la de uso
// comercial, sin nombres de Call of Duty (los perks se llaman como su paquete de yerba,
// config/perks.js) ni canciones con dueño; la web (/sotano, uso personal y escondida)
// queda como estaba. La de escritorio se abre en app:// (desktop/main.cjs), también en
// los hilos de las texturas (core/textureWorker.js).
// globalThis.__mduComercial = true / false (pruebas): fuerza una u otra.
export function comercial() {
  const f = globalThis.__mduComercial;
  if (f === true || f === false) return f;
  return typeof location !== 'undefined' && location.protocol === 'app:';
}

// La guía de los easter eggs de cada una (src/easter-egg/docs/guia/topdf.mjs; la de
// escritorio, con --comercial)
export const guiaPdf = () => (comercial() ? '/assets/sotano/guia-easter-eggs-escritorio.pdf' : '/assets/sotano/guia-easter-eggs.pdf');

// Las canciones con dueño y su reemplazo libre en la de escritorio (el usuario,
// 2026-10-15: "buscá reemplazos"; la lista y las licencias, en el LEEME de
// Desktop\Canciones del juego - copyright). La clave es el archivo de siempre
// (musica/<id>.mp3 o <id>.mp3); file: el reemplazo, en public/assets/sotano/musica-libre;
// orig: dónde está el de siempre (se saca del paquete); name: el que se muestra
// (♪ ...); track: lo que cambia en core/music.js TRACKS (boom, loop, gain...); gain:
// el volumen, para las que no están en TRACKS (las canciones secretas, la Gran Guerra).
export const LIBRES = {
  // el Himno de la Banda de la Marina de EE.UU. (dominio público: obra del gobierno
  // de EE.UU.; Wikimedia Commons, Himno_Nacional_Argentino_instrumental.ogg)
  'secreto-granja': { file: 'himno-navy-band.mp3', orig: 'secreto-granja.mp3', name: 'Himno', gain: 1 },
  // (los primeros 45 s, con el fundido, como el de siempre; viene 2,5 dB más baja: gain
  // 0,73 → 0,97)
  'intro-monumento': { file: 'himno-navy-band-intro.mp3', orig: 'musica/intro-monumento.mp3', track: { gain: 0.97 } },
  // Las que eligió el usuario (2026-10-16, de "4 Candidatas": Pixabay, uso comercial sin
  // crédito; las "IA" las eligió sabiendo que son hechas con IA). Cada una al volumen de la
  // original (loudnorm al LUFS medido de la de siempre, pico -1 dBTP; scratchpad
  // musica/libres.py); las que no llegaban por el pico, con un poco más de gain (hasta
  // x1,12). Los tiempos, medidos sobre el mp3 nuevo (musica/ritmo.py).
  // el baile: 113 bpm contra 118 de la de siempre: los pasos van un 4,5 % más lentos y
  // las cuatro partes entran donde caen en la canción nueva (entities/esteros/Thriller.js)
  'baile-esteros': { file: 'baile-esteros.mp3', orig: 'musica/baile-esteros.mp3', track: { gain: 0.9 }, baile: { at: [6.35, 38.03, 58.26, 85.1], end: 123.91, rate: 0.955 } },
  // el Luisón: la entrada grande a los 30,75 s (boom); el suspenso del juego arranca en la
  // parte baja (11 s) y la llegada (ui/LuisonArrival.js AT) va con esta: la pelea de la
  // escena dura un 39 % más (hasta el respiro, 62 s) y el grito es la vuelta de los 65,5 s
  'jefe-esteros': {
    file: 'jefe-esteros.mp3',
    orig: 'musica/jefe-esteros.mp3',
    track: { gain: 1.03, boom: 30.75, loop: [30.75, 315.5] },
    luison: {
      desde: 11,
      at: { hush: 10.5, calm: 11, gather: 16.8, wolves: 22.76, rise: 24.6, crane: 28, boom: 30.75, hits: [34.5, 38.51, 40.39, 40.76, 42.02, 43.39, 44.01, 45.51], riff: 46.01, big: 48.01, big2: 49.01, last: 59.88, quiet: 62.02, nightmare: 65.5, turn: 66.9, howl: 68.6, leap: 71.5, end: 72.55 },
    },
  },
  // el Mandinga aparece en el golpe del principio (2,07 s; la de siempre, 3,82); la vuelta, 68 compases
  'jefe-molino': { file: 'jefe-molino.mp3', orig: 'musica/jefe-molino.mp3', track: { boom: 2.07, loop: [2.07, 154.8] } },
  'jefe-generico': { file: 'jefe-generico.mp3', orig: 'musica/jefe-generico.mp3', track: { loop: [1.84, 100.35] } },
  'guerra-castillo': { file: 'guerra-castillo.mp3', orig: 'guerra-castillo.mp3', name: 'Battle Song · Wonderful Dreams' },
  'secreto-castillo': { file: 'secreto-castillo.mp3', orig: 'secreto-castillo.mp3', name: 'Biker Metal · The Mountain' },
  'secreto-torre': { file: 'secreto-torre.mp3', orig: 'secreto-torre.mp3', name: 'In Heavy Metal · Alec Koff', gain: 1.12 },
  'secreto-penal': { file: 'secreto-penal.mp3', orig: 'secreto-penal.mp3', name: 'Vertigo · Ivan Luzan' },
  'secreto-molino': { file: 'secreto-molino.mp3', orig: 'secreto-molino.mp3', name: 'Spain South America · Echobrainz' },
  'secreto-esteros': { file: 'secreto-esteros.mp3', orig: 'secreto-esteros.mp3', name: 'Tango Accordion · Denis Pavlov' },
  'reto-torre': { file: 'reto-torre.mp3', orig: 'musica/reto-torre.mp3', name: 'Rock Anthem · DIMMYSAD', gain: 1.12 },
  'intro-molino': { file: 'intro-molino.mp3', orig: 'musica/intro-molino.mp3' },
  'intro-torre': { file: 'intro-torre.mp3', orig: 'musica/intro-torre.mp3' },
  'intro-penal': { file: 'intro-penal.mp3', orig: 'musica/intro-penal.mp3' },
  'intro-castillo': { file: 'intro-castillo.mp3', orig: 'musica/intro-castillo.mp3' },
  // (32 s contra 26,9: el final de La Tapera, ui/FarmCinematic.js, la arranca en el 18,7
  // para que el último golpe, a los 28,5, caiga con la placa como antes)
  'intro-granja': { file: 'intro-granja.mp3', orig: 'musica/intro-granja.mp3', track: { gain: 0.76 }, finAt: 18.7 },
  muerte: { file: 'muerte.mp3', orig: 'musica/muerte.mp3', track: { gain: 0.69 } },
  // (la del penal, la misma que la de los otros mapas: el usuario)
  'muerte-penal': { file: 'muerte.mp3', orig: 'musica/muerte-penal.mp3', track: { gain: 0.69 } },
  // (se va igual a los 39,7 s: core/music PENAL_PEACE; ahí la nueva cambia de parte, a los 40)
  'cine-penal-final': { file: 'cine-penal-final.mp3', orig: 'musica/cine-penal-final.mp3' },
  'cine-castillo-medio': { file: 'cine-castillo-medio.mp3', orig: 'musica/cine-castillo-medio.mp3' },
  // la traición del Gauchito Gil: sin música (el usuario: "no encontré, dejalo sin música")
  'cine-esteros-traicion': { sin: true, orig: 'musica/cine-esteros-traicion.mp3' },
};
const LIBRE_DIR = '/assets/sotano/musica-libre/';
const libre = (url) => {
  const m = /\/assets\/sotano\/(?:musica\/)?([a-z0-9-]+)\.mp3$/.exec(url || '');
  return m && comercial() ? LIBRES[m[1]] || null : null;
};
// (core/music y world/SongEgg streamSong: la canción, su nombre y su volumen)
export const songUrl = (url) => {
  const L = libre(url);
  return L?.file ? LIBRE_DIR + L.file : url;
};
// lo que la de escritorio cambia de una canción de core/music (sus tiempos, si suena)
export const libreDe = (id) => (comercial() ? LIBRES[id] || null : null);
export const songName = (url, name) => libre(url)?.name ?? name;
export const songGain = (url) => libre(url)?.gain ?? 1;

// Lo de public/assets/sotano que la de escritorio no lleva (desktop/pack.mjs lo borra
// del paquete): la guía con los nombres de Call of Duty y las canciones reemplazadas
export const SOLO_WEB = ['guia-easter-eggs.pdf', ...Object.values(LIBRES).map((L) => L.orig)];
