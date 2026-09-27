// Lo que se le cae a un bicho (llaves, sombreros, potenciadores) tiene que
// quedar donde se pueda llegar caminando: si murió afuera del mapa, del otro
// lado de una baranda o en una zona cerrada, se corre a la celda alcanzable
// más cercana (la del campo de flujo del jugador con distancia finita).
// Devuelve el mismo punto si ya se llega; si no, uno nuevo sobre el piso de
// esa celda (con la misma altura sobre el piso que traía). Sin ninguna celda
// cerca, al lado del jugador.
export function reachableSpot(g, pos, maxR = 14) {
  const nav = g.nav;
  if (!nav?.distAt || Number.isFinite(nav.distAt(pos.x, pos.z))) return pos;
  const cx = Math.floor(pos.x);
  const cz = Math.floor(pos.z);
  for (let r = 1; r <= maxR; r++) {
    let best = null;
    let bd = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const d = dx * dx + dz * dz;
        if (d >= bd || !Number.isFinite(nav.distAt(cx + dx + 0.5, cz + dz + 0.5))) continue;
        bd = d;
        best = [cx + dx + 0.5, cz + dz + 0.5];
      }
    }
    if (best) {
      const y0 = g.world.floorAt ? g.world.floorAt(pos.x, pos.z, (pos.y || 0) + 1) : 0;
      const y1 = g.world.floorAt ? g.world.floorAt(best[0], best[1], (pos.y || 0) + 1) : 0;
      const up = Number.isFinite(y0) ? Math.max(0, (pos.y || 0) - y0) : 0;
      return pos.clone().set(best[0], (Number.isFinite(y1) ? y1 : 0) + up, best[1]);
    }
  }
  // lejísimos de todo camino (en el medio del río del penal): al lado del
  // jugador, que siempre se llega
  const p = g.player?.pos;
  if (!p) return null;
  const y0 = g.world.floorAt ? g.world.floorAt(pos.x, pos.z, (pos.y || 0) + 1) : 0;
  const up = Number.isFinite(y0) ? Math.min(1.2, Math.max(0, (pos.y || 0) - y0)) : 0;
  const yp = g.world.floorAt ? g.world.floorAt(p.x, p.z, p.y + 1) : p.y;
  return pos.clone().set(p.x, (Number.isFinite(yp) ? yp : p.y) + up, p.z);
}
