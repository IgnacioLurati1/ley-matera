// El montaje: cada toma con el pulso en que entra y el pulso en que sale
// (pulsos del trailer: kit.beatT). Las que no son del juego (placas, logo) van
// en la pista de títulos.
export const EDL = [
  // ---- la entrada: negro, el golpe y la neblina ----
  ['black0', 0, 4],
  ['m_graves', 4, 10],
  ['m_lantern', 10, 16],
  // ---- los seis mapas ----
  ['m_reveal', 16, 19],
  ['g_reveal', 19, 22],
  ['p_reveal', 22, 24.5],
  ['e_reveal', 24.5, 27],
  ['t_reveal', 27, 29.5],
  ['c_reveal', 29.5, 31.5],
  // ---- los cuatro ----
  ['g_hero', 31.5, 36],
  // ---- A: la partida ----
  ['m_fp_head', 36, 38],
  ['g_tp_blast', 38, 40],
  ['m_fp_box', 40, 42],
  ['p_fp_gut', 42, 44],
  ['e_yacare', 44, 46],
  ['m_tronador', 46, 48],
  ['t_pap', 48, 50],
  ['t_fp_papfire', 50, 52],
  ['g_horses', 52, 54],
  ['e_facon', 54, 56],
  ['e_wade', 56, 58],
  ['p_ghost', 58, 60],
  ['g_hoz', 60, 62],
  ['c_fire', 62, 64],
  ['c_ice', 64, 66],
  ['t_mk3', 66, 68],
  ['card1', 68, 72],
  // ---- B: los que vienen por vos ----
  ['m_capataz', 72, 76],
  ['g_crow', 76, 80],
  ['p_alcaide', 80, 84],
  ['e_luison', 84, 88],
  ['c_caballero', 88, 92],
  ['t_fall', 92, 96],
  ['p_pier', 96, 100],
  ['g_scarecrow', 100, 104],
  // ---- C: lo más grande ----
  ['c_dragon', 104, 108],
  ['c_herowalk', 108, 112],
  ['t_vortex', 112, 116],
  ['p_storm', 116, 120],
  ['e_charge', 120, 124],
  ['p_cerro', 124, 128],
  ['c_flight', 128, 132],
  ['c_war', 132, 136],
  // ---- el final: de a un pulso ----
  ['q1', 136, 137],
  ['q2', 137, 138],
  ['q3', 138, 139],
  ['q4', 139, 140],
  ['q5', 140, 141],
  ['q6', 141, 142],
  ['q7', 142, 143],
  ['q8', 143, 144],
  ['c_sip', 144, 148],
  ['logo', 148, 159],
];

export const FPS = 60;
export const BPM = 106.68;
const BEAT = 60 / BPM;
export const frameOf = (b) => Math.round((0.01 + b * BEAT) * FPS);
// cuadros de una toma del montaje
export function framesOf(id) {
  const e = EDL.find((x) => x[0] === id);
  return e ? frameOf(e[2]) - frameOf(e[1]) : null;
}
