import { MinusIcon, PlusIcon, TrashIcon } from './Icons';
import './QtyStepper.css';

export default function QtyStepper({ value, onChange, small = false }) {
  return (
    <div className={`qty ${small ? 'qty--sm' : ''}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={value === 1 ? 'Quitar' : 'Restar uno'}>
        {value === 1 ? <TrashIcon size={small ? 15 : 17} /> : <MinusIcon size={small ? 15 : 17} />}
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Sumar uno">
        <PlusIcon size={small ? 15 : 17} />
      </button>
    </div>
  );
}
