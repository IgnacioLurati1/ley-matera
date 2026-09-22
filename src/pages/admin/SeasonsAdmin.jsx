import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { SEASONS, isSeasonActive } from '../../lib/seasons';
import { Escarapela } from '../../components/Seasonal';

const MODES = [
  { value: 'auto', label: 'Automático (fechas sugeridas)' },
  { value: 'custom', label: 'Mis propias fechas' },
  { value: 'on', label: 'Encendida siempre' },
  { value: 'off', label: 'Apagada' },
];

// Los inputs de fecha trabajan con año; guardamos sólo MM-DD para que se repita cada año.
const toInput = (md) => (md ? `${new Date().getFullYear()}-${md}` : '');
const fromInput = (v) => v.slice(5);

export default function SeasonsAdmin() {
  const { settings, updateSettings } = useData();
  const { toast, run } = useUI();
  const seasons = settings?.seasons ?? {};

  const update = (key, patch) => {
    run(() => updateSettings({ seasons: { ...seasons, [key]: { ...seasons[key], ...patch } } }));
  };

  return (
    <div className="panel">
      <h2>Decoraciones de temporada</h2>
      <p className="hint">
        Se muestran en todo el sitio. En modo automático se prenden solas en las fechas sugeridas; también
        podés definir tus propias fechas o prenderlas/apagarlas a mano.
      </p>

      <div className="admin-grid-2" style={{ marginTop: 16 }}>
        {Object.entries(SEASONS).map(([key, s]) => {
          const cfg = seasons[key] ?? { mode: 'auto' };
          const active = isSeasonActive(key, cfg);
          return (
            <div key={key} className="preview-frame" style={{ background: 'var(--paper)' }}>
              <div className="panel__head" style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {key === 'patrio' ? <Escarapela size={26} /> : <span>{s.emoji}</span>} {s.name}
                </h3>
                <span className={`status ${active ? 'status--live' : 'status--off'}`}>
                  {active ? 'Activa hoy' : 'Inactiva hoy'}
                </span>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>{s.description}</p>
              <label className="field">
                <span>Modo</span>
                <select
                  className="select"
                  value={cfg.mode}
                  onChange={(e) => {
                    update(key, { mode: e.target.value });
                    toast(`${s.name}: ${MODES.find((m) => m.value === e.target.value).label}`);
                  }}
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              {cfg.mode === 'auto' && <p className="ok" style={{ margin: 0 }}>Sugerido: {s.defaultText}</p>}
              {cfg.mode === 'custom' && (
                <div className="admin-grid-2" style={{ gap: 10 }}>
                  <label className="field">
                    <span>Desde</span>
                    <input className="input" type="date" value={toInput(cfg.from)} onChange={(e) => update(key, { from: fromInput(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span>Hasta</span>
                    <input className="input" type="date" value={toInput(cfg.to)} onChange={(e) => update(key, { to: fromInput(e.target.value) })} />
                  </label>
                  <small className="hint" style={{ gridColumn: '1 / -1' }}>
                    Se repite todos los años (el año no importa). Si “hasta” es antes que “desde”, cruza el año nuevo.
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
