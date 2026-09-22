import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { money, normalize } from '../lib/format';
import ProductImage from './ProductImage';
import { CheckIcon, PlusIcon } from './Icons';

// Buscador de productos para el admin (destacados, promos).
export default function ProductPicker({ selected = [], onPick }) {
  const { products } = useData();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const nq = normalize(q.trim());
    return products.filter((p) => !nq || normalize(p.title).includes(nq) || p.id.toLowerCase() === nq);
  }, [products, q]);

  return (
    <div className="picker-wrap">
      <input className="input" placeholder="Buscar producto por título o id…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="picker">
        {list.map((p) => {
          const isSel = selected.includes(p.id);
          return (
            <button key={p.id} type="button" className="picker__row" onClick={() => !isSel && onPick(p)} disabled={isSel}>
              <ProductImage src={p.image} alt="" />
              <span>
                {p.title}
                <br />
                <small>{p.id} · {money(p.price)}</small>
              </span>
              {isSel ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
