import { charla as c, V, M, C, O } from './base';

// Der Mateendrache: después de la torre. Saben que la voz era Francisco, que
// al morir les dijo que el Chiquitijuein viene de más allá del remolino por el
// mate, y que Fierro los espera otra vez. El castillo de la cordillera, los
// cuatro mates de la luz, las tumbas de la cumbre, las crónicas de la Gran
// Guerra, el dragón que duerme abajo. Nada de cómo termina (ni que ellos
// fueron caballeros).

export default [
  // solos
  c('v1', [[V, 'Francisco dijo que el Chiquitijuein viene por el mate. Que venga. Acá lo espero.']]),
  c('v2', [[V, 'Cuatro caballeros, cuatro mates. Y nosotros somos cuatro. Casualidad, seguro.']]),
  c('v3', [[V, 'Hace un frío que no se siente en el cuerpo. Se siente más adentro.']]),
  c('v4', [[V, 'Un castillo de gauchos en la cordillera. Con quincho y palenque. Esta gente sabía vivir.']]),
  c('v5', [[V, 'Esas tumbas de la cumbre... es como si me estuvieran esperando.']], { from: 6 }),
  c('v6', [[V, 'Francisco se perdió buscando un mate eterno. A mí con uno caliente me alcanza.']], { from: 10 }),
  c('v7', [[V, 'Abajo duerme un dragón, dicen. Que duerma tranquilo. Por ahora.']], { from: 13 }),
  c('m1', [[M, 'Un dragón. ¿Por qué tenía que haber un dragón? ¿No alcanzaba con los muertos?']]),
  c('c1', [[C, 'Nieve, chimenea y mate. Si no fuera por el fin del mundo, sería perfecto.']]),
  c('o1', [[O, 'Este frío me entra por los riñones y me sale por las rodillas.']]),

  // de a dos
  c('vm1', [
    [M, 'Las crónicas dicen que uno de los caballeros tenía miedo y peleaba igual.'],
    [V, '¿Y?'],
    [M, 'Nada. Me gustó saberlo.'],
  ]),
  c('vm2', [
    [V, 'Fierro dijo "otra vez". Siempre dice "otra vez".'],
    [M, 'Como la voz.'],
    [V, 'Sí. Como la voz.'],
  ]),
  c('vm3', [
    [M, '¿Y si el Chiquitijuein es más grande que el dragón?'],
    [V, 'Francisco dijo que era chiquito.'],
    [M, '¡Lo chiquito es lo peor! ¡Los mosquitos son chiquitos!'],
  ], { from: 5 }),
  c('vm4', [
    [M, 'Siete días o cien inviernos, dicen que duró la Gran Guerra.'],
    [V, 'Lo que dure. Esta la terminamos nosotros.'],
  ], { from: 9 }),
  c('vc1', [
    [C, 'Uno de los caballeros esperaba el momento justo, sin apurarse. Ese me cae bien.'],
    [V, 'Se parece a vos.'],
    [C, 'Ya sé.'],
  ]),
  c('mo1', [
    [O, 'Uno de los caballeros aguantaba, aguantaba, aguantaba... eso dicen.'],
    [M, 'Como vos con los riñones.'],
    [O, 'Así mismo.'],
  ]),
  c('co1', [
    [O, 'La tumba de la cumbre tiene una espada clavada. Y brilla.'],
    [C, 'Como las brasas debajo de la ceniza.'],
    [O, 'Esperando que alguien sople.'],
  ], { from: 6 }),

  // de a tres
  c('vmc1', [
    [C, 'Cuatro mates de la luz. Uno para cada uno.'],
    [M, '¿Y si no nos quieren?'],
    [V, 'Los mates no eligen.'],
    [C, 'Yo no estaría tan seguro.'],
  ]),
  c('vmc2', [
    [M, 'Francisco dijo que viene de más allá del remolino.'],
    [C, 'Debe estar cansado del viaje.'],
    [V, 'Mejor. Que llegue cansado.'],
  ]),
  c('vmc3', [
    [V, 'Dicen que lo bajaron del trono pero no lo pudieron matar.'],
    [M, '¿Y nosotros sí vamos a poder?'],
    [C, 'Nosotros tenemos mate.'],
    [V, 'Ellos también tenían.'],
  ], { from: 8 }),
  c('vmo1', [
    [O, '"Lo que no está vivo no se muere". Eso dicen las crónicas.'],
    [M, '¿Y entonces cómo se le gana?'],
    [O, 'Aguantando, m\'hijo. Aguantando.'],
    [V, 'Y pegando. Las dos cosas.'],
  ], { from: 6 }),
  c('mco1', [
    [M, 'El dragón silba como una pava cuando sueña.'],
    [C, 'Un dragón con buen gusto.'],
    [O, 'Ojalá sueñe largo.'],
  ]),
];
