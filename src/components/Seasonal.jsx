import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { activeSeasons } from '../lib/seasons';
import './Seasonal.css';

export const useSeasons = () => {
  const { settings } = useData();
  return useMemo(() => activeSeasons(settings?.seasons), [settings?.seasons]);
};

// Pseudo-aleatorio estable para que las partículas no "salten" en cada render.
const rand = (seed) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export function Escarapela({ className = '', size }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-label="Escarapela argentina" role="img">
      <path d="M38 62 28 98l12-8 6 10 4-36Z" fill="#75aadb" />
      <path d="M62 62 72 98l-12-8-6 10-4-36Z" fill="#75aadb" />
      <circle cx="50" cy="45" r="40" fill="#75aadb" />
      {Array.from({ length: 24 }, (_, i) => (
        <path
          key={i}
          d="M50 45 L50 7"
          stroke="#5f95c8"
          strokeWidth="1.2"
          transform={`rotate(${i * 15} 50 45)`}
        />
      ))}
      <circle cx="50" cy="45" r="26" fill="#fff" />
      <circle cx="50" cy="45" r="15" fill="#75aadb" />
      <circle cx="50" cy="45" r="5" fill="#f6b40e" />
    </svg>
  );
}

export function Garland() {
  const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#e67e22'];
  const bulbs = 26;
  return (
    <div className="garland" aria-hidden>
      <svg viewBox="0 0 1000 40" preserveAspectRatio="none">
        <path d="M0 6 Q 20 22 40 6 T 80 6 T 120 6 T 160 6 T 200 6 T 240 6 T 280 6 T 320 6 T 360 6 T 400 6 T 440 6 T 480 6 T 520 6 T 560 6 T 600 6 T 640 6 T 680 6 T 720 6 T 760 6 T 800 6 T 840 6 T 880 6 T 920 6 T 960 6 T 1000 6" stroke="#1f2a14" strokeWidth="2" fill="none" />
      </svg>
      <div className="garland__bulbs">
        {Array.from({ length: bulbs }, (_, i) => (
          <span key={i} style={{ '--c': colors[i % colors.length], animationDelay: `${(i % 5) * 0.35}s` }} />
        ))}
      </div>
    </div>
  );
}

export function PatrioRibbon() {
  return <div className="patrio-ribbon" aria-hidden />;
}

function Snow() {
  return (
    <div className="season-layer" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="flake"
          style={{
            left: `${rand(i) * 100}%`,
            fontSize: `${10 + rand(i + 50) * 14}px`,
            animationDuration: `${9 + rand(i + 100) * 10}s`,
            animationDelay: `${-rand(i + 150) * 15}s`,
            opacity: 0.55 + rand(i + 200) * 0.4,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}

function Confetti() {
  const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#ff6fb5'];
  return (
    <div className="season-layer" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${rand(i + 7) * 100}%`,
            background: colors[i % colors.length],
            animationDuration: `${7 + rand(i + 300) * 8}s`,
            animationDelay: `${-rand(i + 400) * 12}s`,
            '--r': `${rand(i + 500) * 720 - 360}deg`,
          }}
        />
      ))}
    </div>
  );
}

function Easter() {
  const eggs = ['#f7b2c4', '#a7d8f0', '#fce38a', '#b5e7a0', '#d4b5f7'];
  return (
    <div className="easter" aria-hidden>
      <div className="easter__eggs easter__eggs--left">
        {eggs.slice(0, 3).map((c, i) => (
          <span key={c} className="egg" style={{ '--c': c, animationDelay: `${i * 0.4}s` }} />
        ))}
      </div>
      <div className="easter__bunny">🐰</div>
      <div className="easter__eggs easter__eggs--right">
        {eggs.slice(2).map((c, i) => (
          <span key={c} className="egg" style={{ '--c': c, animationDelay: `${i * 0.5}s` }} />
        ))}
      </div>
    </div>
  );
}

// Capa global con los efectos de la temporada activa.
export default function SeasonalLayer() {
  const seasons = useSeasons();
  return (
    <>
      {seasons.includes('navidad') && <Snow />}
      {seasons.includes('carnaval') && <Confetti />}
      {seasons.includes('pascua') && <Easter />}
    </>
  );
}
