import { charla as c, V, M, C, O } from './base';

// La Tapera: después del molino. Saben que un alcaide de kepí se llevó el
// Mate de Oro "por orden del Estado", que una voz del cielo los venía mirando
// y que ahora les pide una yerba más poderosa. La chacra de la zona de los
// Cuervos, el yerbal seco, la familia que no bajó al pueblo, el cura que no
// volvió. Nada de lo que cuida el espantapájaros ni de lo que viene después.

export default [
  // solos
  c('v1', [[V, 'Un alcaide de kepí se llevó nuestro mate de oro. "Por orden del Estado". ¿Qué Estado?']]),
  c('v2', [[V, 'La voz quiere una yerba más poderosa. Yo no sé hacer yerba. Sé hacer lío.']]),
  c('v3', [[V, 'Este maíz no se termina nunca. Y algo camina adentro sin hacer ruido.']]),
  c('v4', [[V, 'Una familia vivía acá. Dejaron los mates servidos en la mesa. Fríos.']]),
  c('v5', [[V, 'Esos cuervos me miran como si supieran algo que yo no.']], { from: 6 }),
  c('v6', [[V, '"Gauchitos", nos dijo la voz. No me gusta que me digan gauchito.']], { from: 10 }),
  c('v7', [[V, 'Un espantapájaros cuidando un maíz seco. ¿De qué lo cuida, si acá no queda nadie?']], { from: 14 }),
  c('m1', [[M, 'Ya no sé a quién rezarle. Al cielo no, que ahí está la voz.']]),
  c('c1', [[C, 'Linda tarde para un mate. Si no fuera por los muertos, me quedaba a vivir.']]),
  c('o1', [[O, 'El atardecer en la chacra me hace acordar de algo. No sé de qué. Pero me hace acordar.']]),

  // de a dos
  c('vm1', [
    [M, '¿Le vamos a hacer caso a una voz que viene del cielo?'],
    [V, 'Por ahora es la única que sabe dónde está el mate.'],
    [M, 'Eso es lo que me preocupa.'],
  ]),
  c('vm2', [
    [M, 'La radio dijo que no salgamos después de la oración.'],
    [V, 'Ya es después de la oración.'],
    [M, '¡Por eso lo digo!'],
  ]),
  c('vm3', [
    [V, '¿Escuchás eso?'],
    [M, '¿Qué cosa?'],
    [V, 'Nada. Ni un grillo.'],
    [M, 'Ay, no me digas eso.'],
  ]),
  c('vm4', [
    [M, 'El cura vino a ver qué pasaba y no volvió.'],
    [V, 'Nosotros sí vamos a volver.'],
    [M, '¿Adónde? Si no sabemos de dónde venimos.'],
  ], { from: 8 }),
  c('vo1', [
    [O, 'Cuidado con esos caballos, m\'hijo. No son de nadie.'],
    [V, 'Entonces que vengan, que los domo.'],
    [O, 'Así hablaba yo a tu edad. Creo.'],
  ], { from: 7 }),
  c('mc1', [
    [M, '¿A vos no te da miedo nada?'],
    [C, 'Me da miedo que se me enfríe el agua.'],
    [M, 'Eso no cuenta.'],
    [C, 'Para mí, sí.'],
  ]),
  c('co1', [
    [O, 'Este yerbal está seco desde hace años.'],
    [C, 'Como yo antes del primer mate de la mañana.'],
  ]),

  // de a tres
  c('vmc1', [
    [C, 'La voz del cielo pide yerba. Debe tener ganas de un mate.'],
    [M, '¿Y si no es un mate lo que quiere?'],
    [V, 'Lo vamos a saber cuando se la demos.'],
  ]),
  c('vmc2', [
    [M, '¡Algo se movió en el maizal!'],
    [C, 'El viento.'],
    [M, '¡No hay viento!'],
    [V, 'Entonces disparale.'],
  ]),
  c('vmc3', [
    [V, 'Ese alcaide nos robó el mate de oro.'],
    [C, 'Y seguro que no le convida a nadie.'],
    [M, 'Ojalá no lo volvamos a ver.'],
    [V, 'Lo vamos a ver. Y nos lo va a devolver.'],
  ], { from: 6 }),
  c('vmo1', [
    [O, 'Los cuervos... en mi pueblo decían que se llevan las almas.'],
    [M, '¿Qué pueblo? ¡Si no te acordás de nada!'],
    [O, 'Bueno. En algún pueblo lo decían.'],
    [V, 'Que vengan a buscar la mía. Los espero.'],
  ]),
  c('mco1', [
    [O, 'Este yerbal no se cosecha desde hace cien años.'],
    [M, '¿Cómo sabés que son cien?'],
    [O, 'No sé. Acá todo parece de hace cien años.'],
    [C, 'Entonces hay tiempo. Cebo otro.'],
  ]),
];
