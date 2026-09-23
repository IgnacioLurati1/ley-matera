import { assetUrl } from '../lib/assets';

// borderRadius 100% y no 50%: dan el mismo círculo, pero con 50% el celu en
// vista de escritorio dibujaba el logo de la navbar colapsada con los bordes
// mal cortados.
export default function Logo({ size = 96, className = '' }) {
  return (
    <img
      src={assetUrl('/assets/brand/logo.webp')}
      alt="Ley Matera"
      width={size}
      height={size}
      className={`logo ${className}`}
      style={{ width: size, height: size, borderRadius: '100%' }}
    />
  );
}
