// Decoraciones laterales para las promos. Todas usan currentColor, así el
// admin elige el color que quiera. Se dibujan a la izquierda y espejadas a la derecha.

const Leaf = ({ x, y, r, s = 1 }) => (
  <path
    d="M0 0 C 10 -14 28 -14 36 0 C 28 14 10 14 0 0 Z"
    transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
    fill="currentColor"
  />
);

const DESIGNS = {
  laurel: {
    name: 'Laurel',
    svg: (
      <>
        <path d="M60 390 C 30 300 30 120 70 20" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
        {Array.from({ length: 9 }, (_, i) => {
          const y = 360 - i * 38;
          const x = 44 + Math.sin(i / 3) * 6 - (i > 6 ? (i - 6) * -6 : 0);
          return (
            <g key={i}>
              <Leaf x={x} y={y} r={-150} s={0.95} />
              <Leaf x={x + 2} y={y - 6} r={-30} s={0.95} />
            </g>
          );
        })}
      </>
    ),
  },
  hojas: {
    name: 'Hojas de yerba',
    svg: (
      <>
        <Leaf x={10} y={40} r={20} s={1.6} />
        <Leaf x={40} y={110} r={-25} s={1.2} />
        <Leaf x={5} y={170} r={35} s={1.9} />
        <Leaf x={50} y={250} r={-10} s={1.3} />
        <Leaf x={15} y={320} r={25} s={1.7} />
        <Leaf x={60} y={370} r={-40} s={1} />
      </>
    ),
  },
  estrellas: {
    name: 'Estrellas',
    svg: (
      <>
        {[
          [30, 40, 1.2], [80, 110, 0.7], [40, 180, 1], [90, 240, 0.6], [25, 300, 1.3], [70, 365, 0.8],
        ].map(([x, y, s], i) => (
          <path
            key={i}
            d="M0 -16 L4 -5 L16 -5 L6 2 L10 14 L0 7 L-10 14 L-6 2 L-16 -5 L-4 -5 Z"
            transform={`translate(${x} ${y}) scale(${s})`}
            fill="currentColor"
          />
        ))}
      </>
    ),
  },
  flores: {
    name: 'Flores',
    svg: (
      <>
        {[
          [40, 60, 1.2], [85, 150, 0.8], [35, 230, 1.4], [80, 320, 0.9],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            {Array.from({ length: 6 }, (_, k) => (
              <ellipse key={k} cx="0" cy="-12" rx="7" ry="12" fill="currentColor" opacity="0.9" transform={`rotate(${k * 60})`} />
            ))}
            <circle r="6" fill="currentColor" />
            <circle r="3.5" fill="#fff" opacity="0.6" />
          </g>
        ))}
      </>
    ),
  },
  mates: {
    name: 'Mates y bombillas',
    svg: (
      <>
        {[
          [30, 50, 1, -10], [60, 210, 1.2, 8], [25, 340, 0.9, -6],
        ].map(([x, y, s, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <path d="M30 -30 L18 10" />
            <path d="M0 0 Q -4 40 8 52 L36 52 Q 48 40 44 0 Z" />
            <ellipse cx="22" cy="0" rx="22" ry="6" />
          </g>
        ))}
      </>
    ),
  },
  confeti: {
    name: 'Confeti',
    svg: (
      <>
        {Array.from({ length: 22 }, (_, i) => {
          const x = (i * 37) % 110;
          const y = (i * 71) % 390;
          return <rect key={i} x={x} y={y} width="9" height="16" rx="2" fill="currentColor" transform={`rotate(${i * 33} ${x} ${y})`} opacity={0.5 + (i % 3) * 0.2} />;
        })}
      </>
    ),
  },
};

export const DECORATION_OPTIONS = [
  { value: 'none', name: 'Sin decoración' },
  ...Object.entries(DESIGNS).map(([value, d]) => ({ value, name: d.name })),
];

export default function PromoDecoration({ type, color = '#ffffff', className = '' }) {
  const design = DESIGNS[type];
  if (!design) return null;
  return (
    <div className={`promo-deco ${className}`} style={{ color }} aria-hidden>
      <svg className="promo-deco__side promo-deco__side--left" viewBox="0 0 120 400" preserveAspectRatio="xMidYMid meet">
        {design.svg}
      </svg>
      <svg className="promo-deco__side promo-deco__side--right" viewBox="0 0 120 400" preserveAspectRatio="xMidYMid meet">
        {design.svg}
      </svg>
    </div>
  );
}

// Miniatura para el selector del admin.
export function DecorationSwatch({ type, color }) {
  const design = DESIGNS[type];
  return (
    <svg viewBox="0 0 120 400" width="28" height="80" style={{ color }} aria-hidden>
      {design?.svg}
    </svg>
  );
}
