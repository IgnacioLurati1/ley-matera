import { useState } from 'react';
import { PRODUCT_SIZES, srcSetFor } from '../lib/media';
import { assetUrl } from '../lib/assets';

// Imagen con skeleton mientras carga y fallback si no existe.
// `sizes` le dice al navegador qué tan grande se muestra: baja la versión de
// 400 px en grillas y miniaturas y la de 800 sólo en pantallas que la necesitan.
export default function ProductImage(props) {
  return <ImageInner key={props.src || 'none'} {...props} />;
}

function ImageInner({ src, alt, className = '', sizes = '(max-width: 520px) 50vw, 240px' }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);
  return (
    <div className={`pimg ${loaded || failed ? '' : 'skeleton'} ${className}`}>
      {failed ? (
        <img src={assetUrl('/assets/products/demo/mate.svg')} alt={alt} className="pimg__img is-loaded" />
      ) : (
        <img
          src={assetUrl(src)}
          srcSet={srcSetFor(src, PRODUCT_SIZES)}
          sizes={sizes}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`pimg__img ${loaded ? 'is-loaded' : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
