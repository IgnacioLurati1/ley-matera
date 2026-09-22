import { useRef, useState } from 'react';
import { readFileAsDataURL } from '../lib/image';
import { UploadIcon } from './Icons';

// Zona para soltar / elegir una imagen. Devuelve un data URL.
export default function ImageDrop({ onImage, hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const handle = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    onImage(await readFileAsDataURL(file), file);
  };

  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''}`}
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
        handle(e.dataTransfer.files[0]);
      }}
    >
      <UploadIcon size={26} />
      <strong>Subí una foto</strong>
      <span>Arrastrala acá o hacé clic para elegirla</span>
      {hint && <small>{hint}</small>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          handle(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
