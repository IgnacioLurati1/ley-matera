import { money } from '../lib/format';
import './PriceRange.css';

// Slider doble (mínimo / máximo) hecho con dos inputs range superpuestos.
export default function PriceRange({ min, max, value, onChange, step = 500 }) {
  const [lo, hi] = value;
  const span = Math.max(1, max - min);
  const pct = (v) => ((v - min) / span) * 100;

  return (
    <div className="prange">
      <div className="prange__values">
        <span>{money(lo)}</span>
        <span>{money(hi)}</span>
      </div>
      <div className="prange__slider">
        <div className="prange__track" />
        <div className="prange__fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label="Precio mínimo"
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label="Precio máximo"
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
        />
      </div>
    </div>
  );
}
