import { charla as c, V, M, C, O } from './base';

// Mate no Numa (Corrientes, 1877): acá hablan Gil (V), Benito (M), Cirilo (C)
// y Anacleto (O), cuatro desertores de la partida de un coronel. La partida
// se la tragó el estero; los muertos son sus soldados. A Gil lo llama una voz
// que solo él oye (los otros no). De a dos son Gil y Anacleto; de a tres,
// con Cirilo (EsterosEgg reparte en ese orden). Nada de lo que viene
// después del estero: ni la torre, ni el castillo.

// (la voz ya le habló a Gil)
const voz = (g) => (g.ee?.step | 0) >= 1;

export default [
  // solos (el que juega solo es Gil)
  c('v1', [[V, 'Desertor me dicen. Yo digo que me cansé de matar paisanos por un coronel.']]),
  c('v2', [[V, 'La partida entera se hundió en el estero. Y ahora el estero nos la devuelve.']]),
  c('v3', [[V, 'Esa voz me llamó por mi nombre. Mi nombre entero. Así no me decía nadie desde mi madre.']], { when: voz }),
  c('v4', [[V, 'Los muchachos me siguieron sin preguntar. Eso pesa más que el facón.']]),
  c('v5', [[V, 'Males viejos, dice la voz, que vienen por todos. ¿Y yo qué tengo que ver?']], { when: voz, from: 6 }),
  c('v6', [[V, 'Luna llena sobre el Iberá. Linda noche para morirse. Pero hoy no.']], { from: 8 }),
  c('v7', [[V, 'Si la voz me pide algo que no puedo dar... ¿qué hago?']], { when: voz, from: 12 }),
  c('m1', [[M, 'Santa Bárbara bendita... en el agua hay ojos. De yacaré, o de algo peor.']]),
  c('c1', [[C, 'El estero, la luna, el mate... si no fuera por los muertos, sería la noche perfecta.']]),
  c('o1', [[O, 'Ay, la espalda. Tantos años de guerra y lo que me mata es la humedad.']]),

  // de a dos
  c('vo1', [
    [O, 'Antonio, ¿con quién hablás cuando te quedás mirando el algarrobo?'],
    [V, 'Con nadie, viejo.'],
    [O, 'Nadie no contesta. Y a vos algo te contesta.'],
  ], { when: voz }),
  c('vo2', [
    [O, 'Desertamos juntos, Antonio. Si nos agarran, nos fusilan juntos.'],
    [V, 'No nos van a agarrar. Se los tragó el agua.'],
    [O, 'El agua devuelve todo, m\'hijo.'],
  ]),
  c('vo3', [
    [V, '¿Te acordás de la guerra, Anacleto?'],
    [O, 'Me acuerdo de todo. Por eso no hablo de ella.'],
  ]),
  c('vo4', [
    [O, 'De chico me contaban del Luisón. El séptimo hijo varón.'],
    [V, 'Cuentos de abuela.'],
    [O, 'En el estero, todos los cuentos de abuela son ciertos.'],
  ], { from: 6 }),
  c('vo5', [
    [O, 'Si algún día me tenés que dejar atrás, dejame. Yo ya viví bastante.'],
    [V, 'Callate, viejo. Nadie se queda.'],
  ], { from: 10 }),
  c('vm1', [
    [M, 'Antonio, el urutaú llora como una mujer.'],
    [V, 'Es un pájaro, Benito.'],
    [M, 'Dicen que llora los nombres de los muertos.'],
    [V, 'Entonces que no diga el tuyo.'],
  ]),
  c('vc1', [
    [C, '¿Un mate, Antonio?'],
    [V, 'Después.'],
    [C, 'Siempre decís después. Algún día no va a haber después.'],
  ]),

  // de a tres
  c('voc1', [
    [C, 'Linda luna.'],
    [O, 'Linda para los yacarés, que ven mejor.'],
    [V, 'Hablen bajo. El estero escucha.'],
  ]),
  c('voc2', [
    [O, 'El coronel tenía anotados muchos nombres en su casona.'],
    [C, '¿El mío también?'],
    [V, 'El de todos. Por eso desertamos.'],
  ]),
  c('voc3', [
    [C, 'Antonio está raro esta noche.'],
    [O, 'Antonio está raro desde la guerra.'],
    [V, 'Estoy acá. Los oigo.'],
  ], { when: voz }),
  c('voc4', [
    [V, 'Si algo me pasa, ustedes sigan.'],
    [O, '¿Adónde, Antonio? Si el camino sos vos.'],
    [C, 'Y el mate lo ceba Cirilo. Así que nadie se va.'],
  ], { from: 8 }),
  c('vmc1', [
    [M, '¿Vamos a salir vivos de esta, Antonio?'],
    [V, 'Siempre salimos.'],
    [C, 'Siempre es mucho decir. Pero hasta ahora, sí.'],
  ]),
  c('mco1', [
    [M, '¡Me tocó algo en el agua!'],
    [C, 'Un camalote.'],
    [M, '¡Los camalotes no tienen dientes!'],
    [O, 'Entonces no era un camalote.'],
  ]),
];
