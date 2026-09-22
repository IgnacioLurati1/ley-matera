import { useRef } from 'react';
import FramedImage from './FramedImage';
import './ImagePositioner.css';

// Editor de encuadre: arrastrá la foto para moverla y usá el zoom para recortar.
// Trabaja sobre { src, x, y, zoom } sin modificar la imagen original.
export default function ImagePositioner({
  frame,
  onChange,
  aspect = 1,
  overlay = null,
  label = 'Arrastrá para encuadrar',
  variants,
}) {
  const box = useRef(null);
  const drag = useRef(null);

  const onPointerDown = (e) => {
    e.preventDefault();
    box.current.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: frame.x ?? 50, y: frame.y ?? 50 };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const rect = box.current.getBoundingClientRect();
    const img = box.current.querySelector('img');
    if (!img?.naturalWidth) return;
    const zoom = frame.zoom ?? 1;
    // Tamaño renderizado de la imagen (cover × zoom). El borde izquierdo queda en
    // x · (W − ancho), así que mover p píxeles equivale a Δx = p / (W − ancho).
    const cover = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight) * zoom;
    const overflowX = img.naturalWidth * cover - rect.width;
    const overflowY = img.naturalHeight * cover - rect.height;
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const nx = overflowX > 1 ? drag.current.x - ((e.clientX - drag.current.sx) / overflowX) * 100 : frame.x ?? 50;
    const ny = overflowY > 1 ? drag.current.y - ((e.clientY - drag.current.sy) / overflowY) * 100 : frame.y ?? 50;
    onChange({ ...frame, x: clamp(nx), y: clamp(ny) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="impos">
      <div
        ref={box}
        className="impos__box"
        style={{ aspectRatio: aspect }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <FramedImage frame={frame} alt="Vista previa" variants={variants} />
        {overlay}
        <span className="impos__hint">{label}</span>
      </div>
      <div className="impos__controls">
        <label>
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={frame.zoom ?? 1}
            onChange={(e) => onChange({ ...frame, zoom: Number(e.target.value) })}
          />
        </label>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange({ ...frame, x: 50, y: 50, zoom: 1 })}>
          Centrar
        </button>
      </div>
    </div>
  );
}
