import { useRef, useState } from 'react';
import { readFileAsDataURL } from '../lib/image';
import { UploadIcon } from './Icons';

// Zona para soltar / elegir una imagen. Devuelve un data URL.
// Con `multiple` acepta varias a la vez (llama a onImage una vez por foto).
// `label` cambia el texto principal; `compact` la achica a un recuadro chico.
export default function ImageDrop({ onImage, hint, multiple = false, label = 'Subí una foto', compact = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const handle = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/')).slice(0, multiple ? undefined : 1);
    for (const file of images) onImage(await readFileAsDataURL(file), file);
  };

  return (
    <div
      className={`dropzone ${compact ? 'dropzone--compact' : ''} ${over ? 'is-over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
    >
      <UploadIcon size={compact ? 22 : 26} />
      <strong>{label}</strong>
      {!compact && <span>Arrastrala acá o hacé clic para elegirla</span>}
      {hint && !compact && <small>{hint}</small>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
