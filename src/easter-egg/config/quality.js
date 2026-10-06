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
  };
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
  eclipse: { high: { ao: 12 } },
  // el molino y La Tapera (2026-10-03): mirando de la capilla al cementerio o
  // del corral al maizal las cinco luces con sombra alcanzaban toda la pantalla
  // (el molino NO: con 3 el farol del cementerio y el del galpón iluminaban la
  // capilla y la forja a través de las paredes; gfx-ab 2026-10-04)
  granja: { epic: { lamps: 3 } },
  // las 24 gradas del Patio Cívico (y la escalinata): líneas finas paralelas
  // que corriendo titilaban con el SMAA solo; con MSAA quedan quietas
  monumento: { ultra: { aa: 'msaa' }, epic: { aa: 'msaa' } },
};
