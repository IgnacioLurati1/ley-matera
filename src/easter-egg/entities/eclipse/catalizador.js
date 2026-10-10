// El Catalizador Caótico (config/perks.js PERKS.catal, solo en Eclipse Matero).
// Cada compu mira su jugador: lo que cambia es todo de cada uno (la vida que
// chupa la Disformidad, las bajas de la Furia y la espera de la embestida de la
// guadaña son de su compu; la embestida de un jinete la cuenta la compu del que
// la recibe: jinetes.ramCheck). Así anda igual para el anfitrión y el invitado.
//  · La Disformidad (entities/eclipse/Disformidad.js): no chupa, no corta la
//    regeneración, sin velo ni latidos.
//  · La Furia Cósmica del Desgarrador: se prende con un 35% menos de bajas.
//  · Los jinetes del caos (entities/eclipse/jinetes.js): pegan la mitad.
//  · La embestida del Desgarrador: vuelve un 40% antes.
// globalThis.__mduNoCatal === true: el perk se compra igual pero no hace nada.

export const CATAL = 'catal';
export const FURIA_K = 0.65;
export const JINETE_K = 0.5;
export const DASH_K = 0.6;

// ¿el jugador de esta compu lo tiene?
export function hasCatal(g) {
  return globalThis.__mduNoCatal !== true && !!g?.player?.perks?.has?.(CATAL);
}

// las bajas que pide la Furia (el arco de abajo de la mira usa lo mismo)
export function furiaKills(g, n) {
  return hasCatal(g) ? Math.max(1, Math.ceil(n * FURIA_K)) : n;
}

export function jineteDmg(g, d) {
  return hasCatal(g) ? d * JINETE_K : d;
}

export function dashCd(g, cd) {
  return hasCatal(g) ? cd * DASH_K : cd;
}
