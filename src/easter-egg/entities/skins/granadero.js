import { personSkin, addPerson, POSE, MODEL } from '../eclipse/montar';

// Un granadero a caballo de San Lorenzo (Eclipse Matero): el modelo de Meshy
// facetado (public/assets/sotano/modelos/granadero/modelo.glb: morrión con
// penacho colorado, correajes blancos en cruz, bigote) sobre un muñeco de
// Avatars, como San Martín (skins/sanmartin.js). Todos comparten un material.
// cabral: el sargento Juan Bautista Cabral, la misma malla con la piel morena
// (modelos/granadero/cabral.jpg). No es un jefe (no exporta `kind`).
//
//   const a = granadero(people, { id, pos, yaw, cabral });
//   a pie: r.poseFn = (P) => granaderoPose(P, 'firme' | 'guardia', t)
//   a caballo: new Montura(a, caballo) (montar.js); cargar: m.brazos = 'carga';
//   caer (lo bajan y el caballo sigue): m.caer({ lado }).
// sable: 'simple' (liviano, uno por granadero) | 'corvo' | null.

export function granaderoSkin(a, { cabral = false, sable = 'simple' } = {}) {
  personSkin(a, { url: MODEL.granadero, tex: cabral ? MODEL.cabral : null, sable, shared: true });
}

export function granadero(people, { id, pos, yaw = 0, cabral = false, sable = 'simple' } = {}) {
  const r = { id, name: '', noTag: true, pos: pos.clone(), yaw, pitch: 0, speed: 0, moving: false };
  return addPerson(people, r, (a) => granaderoSkin(a, { cabral, sable }));
}

// firme | guardia; moving: caminando (las piernas, las del paso de Avatars)
export function granaderoPose(P, est, t = 0, moving = false) {
  POSE.firme(P, t, !moving);
  if (est === 'guardia') POSE.guardia(P, t);
}
