import { charla as c, V, M, C, O } from './base';

// Revelaciones Materas: después del penal. Saben que la voz se llevó el mate
// supremo ("Gracias por ser tan ignorantes"), que el Gil murió avisando
// "Esa voz es de—" y que el abuelo de la capilla era Martín Fierro, que
// ahora les dice que la voz no es un ángel. Las radios cuentan del yerbatero
// que subió hace cien años. Nada de quién es la voz de verdad ni del final.
// (El Canchero con los anteojos: acá también, un poco más.)

export default [
  // solos
  c('v1', [[V, '"Gracias por ser tan ignorantes", nos dijo. Ahora vengo a que me lo diga en la cara.']]),
  c('v2', [[V, 'El Gil quiso avisarnos antes del rayo. "Esa voz es de..." ¿De quién?']]),
  c('v3', [[V, 'Quince pisos. Los subo de a uno, y arriba que me expliquen todo.']]),
  c('v4', [[V, 'El abuelo de la capilla era Martín Fierro. Y nosotros cebándole como a cualquier viejo.']]),
  c('v5', [[V, 'Este viento no sopla. Gira. Como si alguien lo revolviera con una bombilla.']], { from: 5 }),
  c('v6', [[V, '"¿Otra vez ustedes?", dijo la voz. Otra vez. Como si ya hubiéramos venido.']], { from: 8 }),
  c('v7', [[V, 'Un yerbatero subió acá hace cien años y nunca bajó. Yo voy a bajar.']], { from: 12 }),
  c('m1', [[M, 'No mires para abajo. No mires para abajo... Miré para abajo.']]),
  c('c1', [[C, 'Me pongo los anteojos. No por el sol: por la yerba que vuela.']]),
  c('o1', [[O, 'Quince pisos a mi edad. Si llego arriba, que me reciba un santo.']]),

  // de a dos
  c('vm1', [
    [M, 'Fierro dice que la voz no es un ángel.'],
    [V, 'Yo nunca le vi alas.'],
    [M, '¡Pero nos guió todo este tiempo!'],
    [V, 'Por eso mismo.'],
  ]),
  c('vm2', [
    [M, '¿Y si arriba no hay nada?'],
    [V, 'Bajamos y nos tomamos un mate.'],
    [M, '¿Y si arriba hay algo?'],
    [V, 'Mejor todavía.'],
  ]),
  c('vm3', [
    [V, 'La voz nos usó.'],
    [M, 'Y nosotros le dimos todo, con moño.'],
    [V, 'Ya no.'],
  ], { from: 6 }),
  c('vm4', [
    [M, 'La radio dice que su voz se volvió viento.'],
    [V, 'Entonces cada ráfaga es él respirando.'],
    [M, '¿Por qué me decís esas cosas?'],
  ], { from: 9 }),
  c('vc1', [
    [C, 'Si me lleva una ráfaga, deciles a todos que me fui con estilo.'],
    [V, 'No te vas a ninguna parte.'],
  ]),
  c('mo1', [
    [O, 'Agachate cuando venga la ráfaga, m\'hijo.'],
    [M, 'Estoy agachado desde que llegamos.'],
  ]),
  c('co1', [
    [O, 'Martín Fierro... y yo pensando que era un abuelo cualquiera.'],
    [C, 'Todos los abuelos son alguien, viejo.'],
    [O, 'Yo no sé si soy alguien.'],
    [C, 'Sos el Viejo. Con eso alcanza.'],
  ]),

  // de a tres
  c('vmc1', [
    [C, 'Una escalera de oro que baja del cielo.'],
    [M, '¡La radio dijo que no lleva al cielo!'],
    [V, 'Entonces vamos a ver adónde lleva.'],
  ], { from: 8 }),
  c('vmc2', [
    [V, 'El Gil murió diciendo que no le diéramos el mate.'],
    [C, 'Y se lo dimos igual.'],
    [M, '¡No sabíamos!'],
    [V, 'Ahora sabemos.'],
  ]),
  c('vmc3', [
    [M, '¿Por qué nosotros? ¿Por qué siempre nosotros?'],
    [C, 'Porque somos buenos.'],
    [V, 'Porque alguien nos eligió. Y voy a averiguar quién.'],
  ]),
  c('vmo1', [
    [O, '"¿Otra vez ustedes?" Eso no se le dice a un desconocido.'],
    [M, '¿Nos conoce?'],
    [V, 'Parece que nos conoce mejor que nosotros.'],
  ], { from: 6 }),
  c('mco1', [
    [C, 'Cien años girando este remolino.'],
    [O, 'Todo dura cien años, desde que nos despertamos.'],
    [M, 'Y yo no duro ni una noche sin asustarme.'],
  ]),
];
