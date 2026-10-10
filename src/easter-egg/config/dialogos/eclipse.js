import { charla as c, V, M, C, O } from './base';

// Eclipse Matero (el mapa final): Gil (V), Benito (M), Cirilo (C) y Anacleto
// (O), después de que Gil le dijo que no a la voz en el algarrobo. El mundo
// se rompió: los lugares de las otras vueltas flotan alrededor, arriba pelean
// el sol y la luna, y buscan el Primer Mate. Nada de cómo termina.

export default [
  // solos (el que juega solo es Gil)
  c('v1', [[V, 'Le dije que no. Y el mundo se rompió. Capaz que tenía que romperse.']]),
  c('v2', [[V, 'Un molino, una chacra, un penal, flotando. Nunca estuve ahí. Pero los conozco.']]),
  c('v3', [[V, 'Arriba pelean el sol y la luna. Ninguno de los dos me cae bien.']]),
  c('v4', [[V, 'El Primer Mate. El que lo tenga ceba la historia como quiere. Y yo sé lo que quiero.']]),
  c('v5', [[V, 'Los muchachos siguen acá. Vivos. Eso ya vale lo que venga.']], { from: 6 }),
  c('v6', [[V, 'Un penal en el medio del aire. No sé por qué, me da vergüenza mirarlo.']], { from: 10 }),
  c('m1', [[M, '¡El cielo está roto, Antonio! ¡Roto! Como un plato.']]),
  c('c1', [[C, 'Se termina el mundo y yo con el agua justa. Algo es algo.']]),
  c('o1', [[O, 'Tantos años de guerra, y ahora peleo en el aire. La espalda no lo puede creer.']]),

  // de a dos
  c('vo1', [
    [O, 'Antonio, esa noche en el algarrobo... ¿qué te pedía la voz?'],
    [V, 'Que los matara.'],
    [O, '...¿Y por qué no lo hiciste?'],
    [V, 'Porque Cirilo me ofreció un mate, viejo.'],
  ]),
  c('vo2', [
    [O, 'Ese penal flotando... siento que estuve preso ahí.'],
    [V, 'No estuviste nunca.'],
    [O, '¿Y entonces por qué me sé el camino?'],
  ], { from: 5 }),
  c('vo3', [
    [V, 'Si tengo que elegir otra vez, elijo lo mismo.'],
    [O, 'Ya sé, Antonio. Por eso te sigo.'],
  ], { from: 9 }),
  c('vm1', [
    [M, '¿Y si la voz vuelve?'],
    [V, 'Que vuelva. Ya no le tengo miedo.'],
    [M, 'Yo sí. Pero voy igual.'],
  ]),
  c('vc1', [
    [C, '¿Un mate, Antonio?'],
    [V, 'Siempre.'],
    [C, 'Antes decías "después".'],
    [V, 'Antes era otro.'],
  ]),

  // de a tres
  c('voc1', [
    [C, 'El Primer Mate. ¿Quién lo habrá cebado?'],
    [O, 'Alguien con mucha paciencia.'],
    [V, 'O con mucha culpa.'],
  ]),
  c('voc2', [
    [O, '¿Y después, Antonio? Cuando todo esto termine.'],
    [V, 'Después... un fogón, los cuatro, y nada más.'],
    [C, 'Me anoto.'],
  ], { from: 6 }),
  c('voc3', [
    [C, 'El sol y la luna se pelean por nosotros.'],
    [O, 'No por nosotros. Por el mate.'],
    [V, 'Entonces que se lo ganen.'],
  ]),
  c('mco1', [
    [M, 'Estas islas flotan sobre nada.'],
    [O, 'Como la vida, m\'hijo.'],
    [C, 'Como mi mate cuando lo cebo yo: livianito.'],
  ]),
];
