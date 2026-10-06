import { personSkin, addPerson, POSE, MODEL } from '../eclipse/montar';

// José de San Martín para San Lorenzo (Eclipse Matero): el modelo de Meshy
// facetado (public/assets/sotano/modelos/san-martin/modelo.glb: bicornio con
// la escarapela celeste y blanca, casaca azul de cuello y puños colorados,
// charreteras, calzón blanco y botas; sin la vaina, el sable va en la mano)
// sobre un muñeco de Avatars, como el Belgrano del Monumento: los huesos
// siguen a las piezas, así que camina con el paso de Avatars y las poses son
// de piezas (entities/eclipse/montar.js). No es un jefe (no exporta `kind`).
//
//   const a = sanMartin(people, { id, pos, yaw });   // el muñeco ya vestido
//   r.poseFn = (P) => sanMartinPose(P, 'firme' | 'guardia' | 'senala', t)
//   a caballo: new Montura(a, caballo) (montar.js), m.brazos = 'riendas' |
//   'sable' | 'senala' | 'carga'; caer del caballo: caballo.caer(lado) y
//   m.caer({ lado, atrapado: true, delay: 0.3 }) (la pierna queda abajo).
//   Caminar: r.moving = true y r.speed (Avatars), con sanMartinPose(P, 'guardia').
// sable: 'corvo' (el de verdad, weapons/sableModels) | 'simple' | null.

export function sanMartinSkin(a, { sable = 'corvo' } = {}) {
  personSkin(a, { url: MODEL.sanMartin, sable });
}

export function sanMartin(people, { id = 470, pos, yaw = 0, sable = 'corvo' } = {}) {
  const r = { id, name: '', noTag: true, pos: pos.clone(), yaw, pitch: 0, speed: 0, moving: false };
  return addPerson(people, r, (a) => sanMartinSkin(a, { sable }));
}

// Las poses a pie: firme (respira), guardia (el sable abajo y adelante),
// senala (el sable al frente, hacia donde manda la carga; k: cuánto, 0..1).
// moving: caminando (las piernas quedan las del paso de Avatars).
export function sanMartinPose(P, est, t = 0, k = 1, moving = false) {
  POSE.firme(P, t, !moving);
  if (est === 'guardia' || est === 'senala') POSE.guardia(P, t);
  if (est === 'senala') POSE.senala(P, t, k);
}
