// Imagen que llena su contenedor (cover) respetando el encuadre elegido por el
// admin: x/y en % (como object-position) y zoom ≥ 1 escalando desde ese punto.
// Es la misma cuenta que usa drawFramed() en lib/image.js.
import { BACKGROUND_SIZES, srcSetFor } from '../lib/media';
import { assetUrl } from '../lib/assets';

export default function FramedImage({ frame, alt = '', className = '', style, draggable = false }) {
  if (!frame?.src) return null;
  const { src, x = 50, y = 50, zoom = 1 } = frame;
  return (
    <img
      src={assetUrl(src)}
      srcSet={srcSetFor(src, BACKGROUND_SIZES)}
      sizes="100vw"
      decoding="async"
      alt={alt}
      draggable={draggable}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${x}% ${y}%`,
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: `${x}% ${y}%`,
        userSelect: 'none',
        ...style,
      }}
    />
  );
}
