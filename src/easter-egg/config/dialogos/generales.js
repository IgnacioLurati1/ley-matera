// Lo que dice cada gaucho al hacer algo (ui/dialogos.js did), en todos los
// mapas: por cosa y por carácter (ui/cineCrew PERSONA). Cada frase, una sola
// vez por partida. Sirven también para Gil y los suyos (el estero, el
// Eclipse): nada de memoria perdida ni de lugares.
//  · perk: tomó un paquete de yerba de una máquina;
//  · caja: se llevó el mate que ofrecía la caja;
//  · pava: sacó su mate mejorado del Pack-a-Pava;
//  · levantar: levantó a un compañero caído.

export const ACCIONES = {
  perk: {
    valiente: ['¡Eso! Ahora sí, que vengan.', 'Amargo y fuerte, como tiene que ser.', 'Con esto aguanto una tropilla entera.', 'Uno más y salgo a buscarlos yo.'],
    miedoso: ['Virgencita, que me haga efecto rápido.', '¿Y si me cae mal? ...Bueno, ya está.', 'Esto es para los nervios, ¿no? ¿No?', 'Dicen que da coraje. A mí me da hipo.'],
    canchero: ['Mmm. Le falta un poco de palo.', 'Despacito. Un mate no se apura.', 'Rico. Igual el mío es mejor.', 'Ahora sí estoy cómodo.'],
    viejo: ['Para los riñones, dicen. Ojalá.', 'Ay... esto me sacó diez años. Bueno, cinco.', 'Si me lo daban antes, no me dolía la espalda.', 'Caro, pero cura.'],
  },
  caja: {
    valiente: ['Con esto alcanza y sobra.', 'Vení para acá, que hay trabajo.', 'No importa qué sea: sirve.', 'Este lo estreno ya mismo.'],
    miedoso: ['¿Y esto de qué lado tira?', 'Que no me explote en la mano, que no me explote...', '¿Quién guarda estas cosas en un cajón?', 'Que sea bueno, que sea bueno...'],
    canchero: ['La caja sabe lo que hace.', 'Mirá vos. Me queda bien.', 'No es lo que pedí, pero lo acepto.', 'Tranquilo. Todo bajo control.'],
    viejo: ['Pesa más que un remordimiento.', 'A mi edad ya no se elige.', '¡Uh! Esto patea más que una mula.', 'Que lo use otro... no, mejor lo uso yo.'],
  },
  pava: {
    valiente: ['Recién salido de la pava. ¡Ahora sí!', 'Así me gusta: caliente.'],
    miedoso: ['Quema... ¡quema! Bueno, ya no quema.', 'Espero que la pava sepa lo que hizo.'],
    canchero: ['Mejorado. Como yo.', 'Ahora tiene estilo.'],
    viejo: ['Hirvió justo. Ni más ni menos.', 'Ahora sí, esto tiene carácter.'],
  },
  levantar: {
    valiente: ['¡Arriba! Todavía no terminamos.', 'Nadie se queda tirado. Vamos.'],
    miedoso: ['¡No me dejes solo, hermano!', '¡Levantate, levantate, que vienen!'],
    canchero: ['Tranqui. Te tengo.', 'Arriba, que se te ensucia el poncho.'],
    viejo: ['Arriba, m\'hijo. Yo no te puedo cargar.', 'Si yo me levanto con esta espalda, vos también.'],
  },
};
