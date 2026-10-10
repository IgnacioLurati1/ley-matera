import { charla as c, V, M, C, O } from './base';

// El Molino (1911): se despertaron en el galpón sin acordarse de nada, con un
// mate en el pecho. Lo que saben: el molino Santa Ana, los peones muertos que
// siguen trabajando, las radios, el barbacuá que humea. Nada del abuelo de
// la capilla (quién es), de la voz ni de lo que viene después.

const powered = (g) => !!g.world?.power;

export default [
  // solos (el que juega solo es el Valiente)
  c('v1', [[V, 'No me acuerdo ni de mi nombre... pero de pelear me acuerdo bien.']]),
  c('v2', [[V, 'Me desperté con un mate en el pecho. ¿Quién deja un mate y se va?']]),
  c('v3', [[V, 'Estos peones todavía tienen yerba en las uñas. Trabajaban acá... y siguen.']]),
  c('v4', [[V, 'Las máquinas andan solas. Este molino no para ni con los peones muertos.']], { when: powered }),
  c('v5', [[V, 'Tengo la sensación de haber estado acá antes. Mil veces.']], { from: 8 }),
  c('v6', [[V, 'Si el patrón de este molino anda vivo, tiene mucho que explicar.']], { from: 10 }),
  c('v7', [[V, 'Ya perdí la cuenta de las noches. Pero el mate sigue caliente. Con eso alcanza.']], { from: 15 }),
  c('m1', [[M, 'Padre nuestro que estás en... ¿cómo seguía? Me olvidé hasta del padrenuestro.']]),
  c('c1', [[C, 'Un molino lleno de muertos y ni un bizcochito para el mate. Qué servicio.']]),
  c('o1', [[O, 'No sé cómo me llamo. Pero los riñones me los acuerdo de memoria.']]),

  // de a dos
  c('vm1', [
    [V, '¿Cómo te llamás?'],
    [M, 'No sé. ¿Y vos?'],
    [V, 'Tampoco.'],
    [M, 'Bueno... yo soy el que tiene miedo. Así no nos confundimos.'],
  ]),
  c('vm2', [
    [M, '¿Vos te acordás cómo llegamos acá?'],
    [V, 'No. Pero estamos acá, y ellos también. Con eso alcanza.'],
    [M, 'A mí no me alcanza nada, hermano.'],
  ]),
  c('vm3', [
    [M, '¿Escuchaste? En la capilla. Una mecedora.'],
    [V, 'Será el viento.'],
    [M, '¡El viento no se hamaca!'],
  ]),
  c('vm4', [
    [M, '¿Y si estos peones eran como nosotros? ¿Y si terminamos así?'],
    [V, 'Mientras quede uno parado, no.'],
  ], { from: 6 }),
  c('vm5', [
    [M, 'La radio dice que el humo del barbacuá tiene voces.'],
    [V, 'Que hable. Yo no le contesto.'],
    [M, 'Yo tampoco... pero lo escucho igual.'],
  ], { from: 8 }),
  c('vc1', [
    [C, '¿Vas a ir de frente otra vez?'],
    [V, 'Siempre.'],
    [C, 'Bueno. Yo te miro de acá, con el mate.'],
  ]),
  c('mo1', [
    [O, 'No te asustes, m\'hijo. A mi edad ya vi de todo.'],
    [M, '¿Y te acordás de algo de lo que viste?'],
    [O, '...No. Pero seguro que vi de todo.'],
  ]),
  c('co1', [
    [O, 'Pibe, ¿no me cebás uno?'],
    [C, 'Siempre, viejo. Tomá. Despacito, que está justo.'],
    [O, 'Bendito seas.'],
  ]),

  // de a tres
  c('vmc1', [
    [M, '¿Y si esto es el infierno?'],
    [C, 'Con mate no puede ser el infierno.'],
    [V, 'Entonces tomá, y seguí tirando.'],
  ]),
  c('vmc2', [
    [V, 'Alguien nos trajo hasta acá.'],
    [M, '¿Quién?'],
    [C, 'Alguien que sabía que íbamos a necesitar un mate.'],
    [V, 'Ya le voy a preguntar. Cuando lo encuentre.'],
  ], { from: 5 }),
  c('vmc3', [
    [C, 'Prendimos la luz y las máquinas arrancaron solas.'],
    [M, '¡Eso no es normal!'],
    [V, 'En este molino nada es normal. Sigan.'],
  ], { when: powered }),
  c('vmo1', [
    [O, 'Yo conozco este olor. Yerba quemada.'],
    [M, '¿De dónde lo conocés, si no te acordás de nada?'],
    [O, 'La nariz se acuerda sola, m\'hijo.'],
    [V, 'Entonces que tu nariz nos avise si viene algo.'],
  ]),
  c('mco1', [
    [M, 'Dicen que de noche vuelven de la tierra.'],
    [C, 'Como el que se olvidó algo.'],
    [O, 'Como yo cuando me olvido el mate.'],
  ]),
];
