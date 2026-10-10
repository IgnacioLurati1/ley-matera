import { charla as c, V, M, C, O } from './base';

// Monumento al Mate (bonus): los cuatro se despiertan en Rosario, de noche,
// en un tiempo que no es el suyo. No hay voz ni nadie que les pida nada. Algo
// se mueve en el río, la niebla apagó la Llama, hay una bandera para coser.
// Nada de quién aparece al final.

export default [
  // solos
  c('v1', [[V, 'No sé cómo llegamos acá. Pero la bandera, esa sí la conozco.']]),
  c('v2', [[V, 'Una torre con forma de barco, apuntando al río. Como si quisiera zarpar.']]),
  c('v3', [[V, 'Acá no habla ninguna voz del cielo. Por primera vez, lo que hagamos es cosa nuestra.']]),
  c('v4', [[V, 'El río es enorme. Y algo se mueve abajo. Algo grande.']]),
  c('v5', [[V, 'Se apagó la llama del soldado desconocido. Eso no puede quedar así.']], { from: 5 }),
  c('v6', [[V, 'Barcos con muertos en la cubierta. El Paraná ya vio esto antes. Y aguantó.']], { from: 11 }),
  c('m1', [[M, 'Esta niebla no deja ver ni la punta del poncho.']]),
  c('c1', [[C, 'Rosario de noche. Linda ciudad. Lástima los muertos de la costanera.']]),
  c('o1', [[O, 'Este lugar no lo conozco. Y eso que a mi edad ya conocí de todo.']]),

  // de a dos
  c('vm1', [
    [M, '¿En qué año estamos?'],
    [V, 'Ni idea.'],
    [M, 'Esta torre antes no estaba. De eso estoy seguro.'],
    [V, '¿Antes de qué?'],
    [M, '...No sé.'],
  ]),
  c('vm2', [
    [V, 'Acá se izó una bandera por primera vez. Frente a este río.'],
    [M, '¿Vos cómo sabés eso, si no te acordás de nada?'],
    [V, 'Hay cosas que no se olvidan.'],
  ]),
  c('vm3', [
    [M, '¡Algo grande en el río!'],
    [V, 'Un pescado.'],
    [M, '¡Los pescados no son de ese tamaño!'],
    [V, 'Los del Paraná, sí.'],
  ], { from: 4 }),
  c('vm4', [
    [M, 'Esa costurera es un ánima. Y cose igual.'],
    [V, 'Entonces le llevamos las telas. Que termine lo que empezó.'],
  ], { from: 7 }),
  c('vc1', [
    [C, 'Un monumento con ascensor. Esto es progreso.'],
    [V, 'Vos subí por la escalera, que te hace bien.'],
    [C, 'Ni loco.'],
  ]),
  c('co1', [
    [O, 'Ni un diablo, ni una voz... raro, ¿no?'],
    [C, 'Raro y lindo. Disfrutalo, viejo.'],
  ]),

  // de a tres
  c('vmc1', [
    [C, 'Nadie nos manda acá. Ni voz, ni abuelo, ni nada.'],
    [M, 'Eso me da más miedo.'],
    [V, 'A mí me da ganas.'],
  ]),
  c('vmc2', [
    [M, '¿Y si esto es un sueño?'],
    [C, 'Entonces que sea largo.'],
    [V, 'Sueño o no, la llama se prende.'],
  ]),
  c('vmc3', [
    [V, 'Una bandera es de todos.'],
    [C, 'Como el mate.'],
    [M, 'Como el miedo, también.'],
  ], { from: 6 }),
  c('vmo1', [
    [O, 'Belgrano la izó acá, frente al río, con los barcos enfrente.'],
    [M, '¿Y qué haría Belgrano con estos muertos?'],
    [O, 'Lo mismo que nosotros, m\'hijo. Pero con mejor letra.'],
  ], { from: 5 }),
];
