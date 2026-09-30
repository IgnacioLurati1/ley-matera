// La prueba de armas (Alt+. la siguiente, Alt+, la anterior; solo en
// desarrollo y jugando solo): pasa por todas las armas de a una y siempre en el
// mismo orden (el de config/weapons.js), para escuchar cada tiro. Cada una
// entra en la mano de ahora con el cargador y la reserva llenos. Con
// Pack-a-Pava, solo las especiales (y los porongos: el mejorado cambia de tiro).
import { WEAPONS, weaponStats } from '../config/weapons';

export const TOUR = Object.entries(WEAPONS)
  .filter(([, w]) => w.kind !== 'tactical')
  .flatMap(([id, w]) => {
    const forms = [{ id, up: 0 }];
    if (w.pap && (w.special || (w.pap.sound && w.pap.sound !== w.sound))) forms.push({ id, up: 1 });
    return forms;
  });

export function weaponTour(g, step) {
  const w = g.weapons;
  const n = TOUR.length;
  const i0 = g.weaponTourI;
  const i = i0 == null ? (step > 0 ? 0 : n - 1) : (i0 + step + n) % n;
  g.weaponTourI = i;
  const { id, up } = TOUR[i];
  const st = weaponStats(id, up);
  // los potenciadores (y los que duran un rato) van como el potenciador, sin apuro
  if (WEAPONS[id].temp) w.giveTemp(id, 99999);
  else {
    if (w.temp) {
      w.temp = null;
      g.powerups?.endPersonal?.();
    }
    w.slots[w.cur] = { id, up, mag: st.mag, reserve: st.reserve };
    w.startRaise();
  }
  w.updateHud();
  g.hud.subtitle(`Prueba de armas ${i + 1}/${n}: ${st.name}${up && !WEAPONS[id].altar ? ' (Pack-a-Pava)' : up ? ' (templado)' : ''}`, 3);
}
