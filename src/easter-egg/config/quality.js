// La calidad Personalizada (Opciones → Gráficos): lo que cada sistema toma
// de una calidad, en los valores que tienen sus menús (Game.tier).
export function tiersOf(t) {
  return {
    surf: t === 'perf' ? 'low' : t === 'epic' ? 'ultra' : t,
    amb: t,
    water: t === 'perf' ? 'low' : t,
    night: ['perf', 'low', 'medium'].includes(t) ? t : 'high',
    fire: t === 'perf' || t === 'low' ? 'low' : 'high',
    grass: t === 'perf' ? 'perf' : 'high',
  };
}
