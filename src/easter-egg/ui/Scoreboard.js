import { MAP_LIST, MAP_MODES } from '../config/map';

// La tabla de puntos (se ve mientras mantenés Tab): cada jugador con sus
// puntos, bajas, tiros a la cabeza, bajas a cuchillo, caídas y levantadas.
// En línea los números los lleva el anfitrión (Session.scoreRows); acá solo se
// arma lo que dibuja el HUD (Hud.setBoard).

function soloName() {
  try {
    return localStorage.getItem('lm-zombies-name') || 'Vos';
  } catch {
    return 'Vos';
  }
}

// 754 s -> "12:34" (con horas si pasa de una)
function clock(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function scoreboard(g) {
  const p = g.player;
  const rows = g.net
    ? g.net.scoreRows()
    : [
        {
          id: 0,
          me: true,
          name: soloName(),
          points: g.points,
          kills: g.stats.kills,
          heads: g.stats.headshots,
          knife: g.stats.knifeKills,
          // en solitario solo caés con Rosamorte (te levanta sola)
          downs: p.reviveUses || 0,
          revives: 0,
          down: p.downed,
          dead: !p.alive,
        },
      ];
  return {
    map: (MAP_LIST.find((m) => m.id === g.mapId)?.name || '') + (g.modeNow && g.modeNow !== 'story' ? ` · ${MAP_MODES[g.mapId]?.find((x) => x.id === g.modeNow)?.name || ''}` : ''),
    round: g.rounds?.round || 0,
    time: clock(g.stats.time),
    solo: !g.net,
    rows,
  };
}
