import { charla as c, V, M, C, O } from './base';

// Mate of the Dead: después de La Tapera. Vienen por el Mate de Oro, que el
// Alcaide guarda en su oficina; la voz se quedó con la yerba y dijo que la
// iba a devolver hecha oro. El penal de la Isla del Ceibo, el río, la
// tormenta, el gaucho life, los tres presos que todavía cantan, las banderas
// coloradas del cerro. Nada de quién es el carcelero ni del final.
// (El Canchero con los anteojos: acá sí, el chiste es del penal.)

export default [
  // solos
  c('v1', [[V, 'El alcaide tiene nuestro mate en su oficina. Lo voy a buscar en persona.']]),
  c('v2', [[V, 'Salirme del cuerpo... nunca pensé decir esto, pero me gusta.']]),
  c('v3', [[V, 'La radio dice que en el río hay manos. Cuando cruzo, no miro para abajo.']]),
  c('v4', [[V, 'Tres presos que nadie pudo matar. Y todavía cantan. Eso es tener aguante.']]),
  c('v5', [[V, 'Esas banderitas coloradas del cerro... no sé por qué, no me gustan.']], { from: 6 }),
  c('v6', [[V, 'Un penal sin guardias y nadie se escapa. Algo los tiene agarrados.']], { from: 10 }),
  c('v7', [[V, 'Esta tormenta no se va nunca. Como si el cielo también estuviera preso.']], { from: 14 }),
  c('m1', [[M, 'Si me salgo del cuerpo y después no encuentro la vuelta... ¿quién me levanta?']]),
  c('c1', [[C, 'Un penal en una isla. Bueno, por lo menos tiene vista al río.']]),
  c('o1', [[O, 'Cuando salí del cuerpo vi rayas en una pared. Alguien contaba algo.']], { from: 5 }),

  // de a dos
  c('vm1', [
    [M, '¿Viste lo que hay escrito en las paredes cuando salís del cuerpo?'],
    [V, 'Lo vi. Nombres.'],
    [M, '¿Nombres de quién?'],
    [V, 'De los que no salieron.'],
  ]),
  c('vm2', [
    [M, 'El alcaide dice que en su penal no se toma mate.'],
    [V, 'Entonces le vamos a tomar uno en la cara.'],
  ]),
  c('vm3', [
    [M, '¡Ese bote viene lleno de muertos remando!'],
    [V, 'Que remen. Nosotros tiramos.'],
    [M, '¿Y quién maneja el nuestro?'],
    [V, 'Vos.'],
    [M, '¡¿Yo?!'],
  ], { from: 4 }),
  c('vm4', [
    [V, 'La radio dijo que no le recemos al del espinillo.'],
    [M, 'Yo le rezo a todos, por las dudas.'],
    [V, 'A ese no.'],
  ], { from: 8 }),
  c('vc1', [
    [C, 'Me pongo los anteojos. Con esta tormenta no sirven para nada... pero quedan bien.'],
    [V, 'Vos no cambiás más.'],
  ]),
  c('mo1', [
    [M, '¿Qué cantan los presos de abajo?'],
    [O, 'Una de las viejas. Esa la canté yo también... creo.'],
  ]),
  c('co1', [
    [O, 'Ese preso de la celda... tiene mi cara, te juro.'],
    [C, 'Todos los viejos se parecen, viejo.'],
    [O, 'Respetá, pibe.'],
  ]),

  // de a tres
  c('vmc1', [
    [V, 'Esos tres presos dicen que son gauchos.'],
    [C, 'Gauchos presos. Qué desperdicio.'],
    [M, '¿Y si los soltamos y nos muerden?'],
    [V, 'Los soltamos igual.'],
  ]),
  c('vmc2', [
    [C, 'El alcaide vino de Buenos Aires a encerrar gauchos.'],
    [M, 'Y nosotros vinimos solitos.'],
    [V, 'Pero nosotros nos vamos. Con el mate.'],
  ]),
  c('vmc3', [
    [M, 'La voz prometió devolvernos la yerba.'],
    [C, 'Hecha oro, dijo.'],
    [V, 'Que la devuelva. Después vemos qué le debemos.'],
  ], { from: 6 }),
  c('vmo1', [
    [O, 'En el río hay manos, dijo la radio.'],
    [M, '¡¿Manos?!'],
    [O, 'Tranquilo, m\'hijo. Las manos no tienen boca.'],
    [V, 'Eso no tranquiliza a nadie, viejo.'],
  ]),
  c('mco1', [
    [C, 'Un mate en un penal sabe distinto.'],
    [O, 'Sabe a encierro.'],
    [M, 'A mí me sabe a miedo.'],
    [C, 'A vos todo te sabe a miedo.'],
  ]),
];
