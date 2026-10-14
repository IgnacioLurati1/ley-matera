// La calidad Personalizada (Opciones → Gráficos): lo que cada sistema toma
// de una calidad, en los valores que tienen sus menús (Game.tier).
export function tiersOf(t) {
  return {
    surf: t === 'perf' ? 'low' : t === 'epic' ? 'ultra' : t,
    amb: t,
    water: t === 'perf' ? 'low' : t,
    night: ['perf', 'low', 'medium'].includes(t) ? t : 'high',
    fire: t === 'perf' || t === 'low' ? 'low' : 'high',
    grass: t === 'perf' || t === 'low' ? 'perf' : 'high',
    // las mejoras de Ultra y Épica (GFX_PLUS): prendidas desde Ultra
    motes: t === 'ultra' || t === 'epic',
    stains: t === 'ultra' || t === 'epic',
    sky: t === 'ultra' || t === 'epic',
    // (las del agente graficos2: contacto, sombra del fogonazo, lluvia que moja)
    contact: t === 'ultra' || t === 'epic',
    flashShadow: t === 'epic',
    rainWet: t === 'ultra' || t === 'epic',
  };
}

// Mejoras gráficas de Ultra y Épica (2026-10-12, el usuario: "elegir en qué
// calidad van según el mapa, para priorizar aquellos que tienen sentido en
// dicho mapa para no encarecer al pedo sin lograr mucho; algunos capaz van en
// todos"). Por mejora, desde qué calidad va en cada mapa (el que no está, no la
// lleva). En Personalizada, la casilla de cada una (Opciones › Gráficos ›
// Mundo) la prende en los mapas de la lista. sw: el interruptor que la apaga.
//  - motes: partículas con luz (fx/litMotes.js)
//  - stains: sangre y barro que quedan, con relieve y brillo (fx/Effects.js)
//  - sky: cielo con volumen (world/skyVol.js, eclipseSky.js)
//  - relief: más paralaje en pisos y paredes (fx/Surfaces.js)
const Q_ORDER = ['perf', 'low', 'medium', 'high', 'ultra', 'epic'];
export const GFX_PLUS = {
  motes: { sw: '__mduSinParticulasLuz', maps: { molino: 'ultra', granja: 'ultra', penal: 'ultra', torre: 'ultra', castillo: 'ultra', esteros: 'ultra', monumento: 'ultra', eclipse: 'ultra' } },
  stains: { sw: '__mduSinManchas', maps: { molino: 'ultra', granja: 'ultra', penal: 'ultra', torre: 'ultra', castillo: 'ultra', esteros: 'ultra', monumento: 'ultra', eclipse: 'ultra' } },
  // (cielo: donde el cielo abierto de noche se ve; el penal, brumoso, solo en
  // Épica; no en el castillo —noche despejada: la capa alta tapaba la Vía
  // Láctea—, ni en la torre ni en el Monumento, donde la niebla lo tapa)
  sky: { sw: '__mduSinCieloVol', maps: { molino: 'ultra', granja: 'ultra', esteros: 'ultra', eclipse: 'ultra', penal: 'epic' } },
  // (el relieve 2, en ningún mapa: medido el 2026-10-12, penal Épica +0,09 a
  // +0,13 ms de placa y +0,1 a +0,15 de CPU, y en las fotos rasantes de los
  // 8 mapas no se ve: lo cercano ya tenía paralaje y lo lejano no lo muestra)
  relief: { sw: '__mduSinRelieve2', maps: {} },
  // Sombras de contacto (fx/contacto.js; agente graficos2): muertos, gauchos y
  // pasto pegados al piso. Necesita el G-buffer (oclusión o reflejos). Medido
  // (1920, 2026-10-13): +0,05..+0,10 ms de placa (1,4-3,1 %; el ruido A/A da
  // hasta 1,5 %). Va donde se ve: el pajonal del estero y el pasto de Eclipse
  // desde Ultra (6-9 % de la imagen), la torre en Épica (2 %). En los cuartos
  // alumbrados por faroles (molino, castillo, penal) quedaba en 0-0,5 % y en
  // La Tapera y el Monumento en 0,2-0,5 %: no va (queda para revisar).
  contact: { sw: '__mduSinContacto', maps: { esteros: 'ultra', eclipse: 'ultra', torre: 'epic' } },
  // Fogonazos y explosiones que tiran sombra (fx/Epic flashLamp; agente
  // graficos2): el destello toma una luz con sombra libre mientras dura.
  // Solo Épica (5 luces con sombra: suele haber una libre; en Ultra las 3 están
  // casi siempre en fuegos) y en los mapas de noche (La Tapera es al atardecer).
  flashShadow: { sw: '__mduSinSombraFogonazo', maps: { molino: 'epic', penal: 'epic', torre: 'epic', castillo: 'epic', esteros: 'epic', monumento: 'epic', eclipse: 'epic' } },
  // Lluvia que moja (fx/Epic LightShader; agente graficos2): charcos que
  // reflejan, piso mojado y el relámpago en el reflejo. Solo donde llueve
  // (world/Weather: el estero, el Monumento, el castillo y Eclipse no tienen lluvia).
  rainWet: { sw: '__mduSinLluviaMoja', maps: { molino: 'ultra', granja: 'ultra', penal: 'ultra', torre: 'ultra' } },
};

// ¿Va esta mejora en este mapa con la calidad elegida?
export function plusOn(g, key) {
  const P = GFX_PLUS[key];
  if (!P || !g?.settings || globalThis[P.sw] === true) return false;
  const min = P.maps[g.mapId];
  if (!min) return false;
  const c = g.settings.qualityMode === 'custom' ? g.settings.gfx : null;
  if (c) return c[key] != null ? !!c[key] : Q_ORDER.indexOf(c.base) >= Q_ORDER.indexOf(min);
  return Q_ORDER.indexOf(g.settings.quality) >= Q_ORDER.indexOf(min);
}

// El pasto alto liviano (menos matas, al armar el mapa): en Rendimiento y en
// Baja; el maíz de afuera de la chacra (corn), también en Media. En la
// Personalizada, lo que eligió ('perf' liviano).
export function lightGrass(g, corn = false) {
  const t = g?.tier?.('grass') ?? g?.settings?.quality;
  return t === 'perf' || t === 'low' || (corn && t === 'medium');
}

// Cada mapa con lo suyo sobre la calidad elegida (Game.mapGfx; la
// Personalizada no se toca). Medido en el punto más pesado de cada mapa en
// Épica (2026-10-02): lo que ahí no se ve se baja y lo que se luce, se sube.
//  - aa / taa: en el estero el pasto ya no titila con el suavizado temporal:
//    SMAA en vez de MSAA (~1 ms menos) y, en Ultra, SMAA con el temporal (titila
//    menos que el MSAA solo y cuesta 0,6 ms menos de placa).
//  - lamps: fuegos que tiran sombra (fx/Epic). Con 3 en vez de 5 no cambia nada
//    a la vista y en la torre, el estero y el penal cuesta 0,4-1 ms menos. En el
//    castillo no gana nada: quedan 5.
//  - refl: la resolución del espejo del agua (fx/Water): más nítido donde el agua
//    es lo que se ve (cuesta casi nada; lo caro es dibujar la escena otra vez).
export const MAP_GFX = {
  esteros: {
    ultra: { aa: 'smaa', taa: true },
    epic: { aa: 'smaa', lamps: 3, refl: 0.75 },
  },
  penal: { epic: { lamps: 3, refl: 0.75 } },
  torre: { epic: { lamps: 3 } },
  // Eclipse Matero (2026-10-06): el usuario vio todo "plano y sin oclusión": en
  // Alta la oclusión va como en Ultra
  // y (ITERACION-6 M2/M4, 2026-10-07) el pasto con el suavizado temporal, como
  // en el estero, y los bordes finos de las islas de lejos (cordones, barandas,
  // aleros: "en la vista aérea los bordes de las islas titilan") con MSAA
  // (2026-10-09, rendimiento: SMAA con el suavizado temporal, como el estero.
  // Medido desde lo alto girando sobre las islas: bordes titilando fuerte 0,02%
  // con MSAA, 0,04% así y 0,40% sin el temporal; el MSAA costaba 0,4-0,9 ms de
  // placa a 1440p)
  eclipse: { high: { ao: 12 }, ultra: { aa: 'smaa', taa: true }, epic: { aa: 'smaa' } },
  // el molino y La Tapera (2026-10-03): mirando de la capilla al cementerio o
  // del corral al maizal las cinco luces con sombra alcanzaban toda la pantalla
  // (el molino NO: con 3 el farol del cementerio y el del galpón iluminaban la
  // capilla y la forja a través de las paredes; gfx-ab 2026-10-04)
  granja: { epic: { lamps: 3 } },
  // las 24 gradas del Patio Cívico (y la escalinata): líneas finas paralelas
  // que corriendo titilaban con el SMAA solo; con MSAA quedan quietas
  monumento: { ultra: { aa: 'msaa' }, epic: { aa: 'msaa' } },
};
