import { useEffect, useRef, useState } from 'react';
import ProductCard from './ProductCard';
import { ChevronRight, PauseIcon, PlayIcon } from './Icons';
import './Marquee.css';

const SPEED = 40; // px por segundo
const RESUME_AFTER = 2500; // ms sin tocar hasta que vuelve a avanzar solo

// Cinta infinita de destacados. Avanza sola, pero se puede adelantar o
// retroceder: deslizando en el celu, con trackpad / arrastrando / flechas en la
// compu. Mientras la tocás se frena; "Pausar" la deja quieta hasta reanudar.
export default function Marquee({ products }) {
  const [paused, setPaused] = useState(false);
  const viewport = useRef(null);
  const s = useRef({ x: 0, hold: false, hover: false, resumeAt: 0, drag: null, moved: false });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Dos mitades idénticas: al pasar la mitad se salta al inicio sin que se note.
  const reps = Math.max(2, Math.ceil(10 / Math.max(1, products.length))) * 2;
  const loop = Array.from({ length: reps }, () => products).flat();

  useEffect(() => {
    const el = viewport.current;
    if (!el) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = s.current;
    let raf;
    let last = performance.now();

    const tick = (t) => {
      const dt = Math.min(64, t - last);
      last = t;
      const half = el.scrollWidth / 2;
      const auto = !reduced && !pausedRef.current && !st.hold && !st.hover && t > st.resumeAt;
      if (auto) {
        st.x += (SPEED * dt) / 1000; // acumulador con decimales: scrollLeft redondea
      } else {
        st.x = el.scrollLeft;
      }
      if (st.x >= half) st.x -= half;
      if (st.x < 1) st.x += half;
      if (Math.abs(el.scrollLeft - st.x) >= 0.5) el.scrollLeft = st.x;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [products.length]);

  if (!products.length) return null;

  const nudge = () => {
    s.current.resumeAt = performance.now() + RESUME_AFTER;
  };

  const step = (dir) => {
    const el = viewport.current;
    const card = el.querySelector('.marquee__item');
    nudge();
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 230) + 20) * 2, behavior: 'smooth' });
  };

  // Arrastrar con el mouse (en táctil el desplazamiento es nativo).
  const onPointerDown = (e) => {
    s.current.hold = true;
    s.current.moved = false;
    if (e.pointerType === 'mouse') {
      s.current.drag = { x: e.clientX, left: viewport.current.scrollLeft };
    }
  };
  const onPointerMove = (e) => {
    const d = s.current.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) s.current.moved = true;
    viewport.current.scrollLeft = d.left - dx;
  };
  const release = () => {
    s.current.hold = false;
    s.current.drag = null;
    nudge();
  };

  return (
    <div className={`marquee ${paused ? 'is-paused' : ''}`}>
      <div className="marquee__frame">
        <button type="button" className="marquee__arrow marquee__arrow--prev" onClick={() => step(-1)} aria-label="Ver anteriores">
          <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div
          ref={viewport}
          className={`marquee__viewport ${s.current.drag ? 'is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={() => {
            s.current.hover = false;
            if (s.current.hold) release();
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') s.current.hover = true;
          }}
          onWheel={nudge}
          onTouchMove={nudge}
          // Cualquier desplazamiento que no hizo la animación (dedo, inercia,
          // teclado) frena el avance automático por un rato.
          onScroll={(e) => {
            if (Math.abs(e.currentTarget.scrollLeft - s.current.x) > 2) nudge();
          }}
          // Si fue un arrastre, que no cuente como clic en "Agregar".
          onClickCapture={(e) => {
            if (s.current.moved) {
              e.stopPropagation();
              e.preventDefault();
              s.current.moved = false;
            }
          }}
        >
          <div className="marquee__track">
            {loop.map((p, i) => (
              <div className="marquee__item" key={`${p.id}-${i}`} aria-hidden={i >= products.length}>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="marquee__arrow marquee__arrow--next" onClick={() => step(1)} aria-label="Ver siguientes">
          <ChevronRight size={20} />
        </button>
      </div>
      <button className="marquee__toggle" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
        {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
        {paused ? 'Reanudar' : 'Pausar'}
      </button>
    </div>
  );
}

export function MarqueeSkeleton() {
  return (
    <div className="marquee">
      <div className="marquee__viewport">
        <div className="marquee__track">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="marquee__item" key={i}>
              <div className="skeleton" style={{ aspectRatio: '0.72', borderRadius: 14 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
