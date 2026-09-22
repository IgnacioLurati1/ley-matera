import { assetUrl } from '../lib/assets';

export default function Logo({ size = 96, className = '' }) {
  return (
    <img
      src={assetUrl('/assets/brand/logo.webp')}
      alt="Ley Matera"
      width={size}
      height={size}
      className={`logo ${className}`}
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  );
}
