// Utilidades de imagen para el panel admin. Todo en el navegador con canvas.
import { assetUrl } from './assets';

export const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = assetUrl(src);
  });

export const getImageSize = async (src) => {
  const img = await loadImage(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
};

// WebP pesa ~30 % menos que JPEG a igual calidad visual. Safari viejo no sabe
// codificar WebP en canvas: en ese caso caemos a JPEG.
const canvasToBlob = (canvas, quality) =>
  new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp?.type === 'image/webp') return resolve(webp);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      },
      'image/webp',
      quality,
    );
  });

// Dibuja la imagen en un canvas w×h respetando el encuadre ({x,y} en % como
// object-position y zoom ≥ 1), igual que <FramedImage>.
const drawFramed = (img, { x = 50, y = 50, zoom = 1 }, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.fillStyle = '#f4eee0';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, (width - dw) * (x / 100), (height - dh) * (y / 100), dw, dh);
  return canvas;
};

// Foto de producto: recorte cuadrado en dos tamaños (grilla y retina/detalle).
export const productVariants = async (src, frame) => {
  const img = await loadImage(src);
  return Promise.all(
    [800, 400].map(async (size) => ({ size, blob: await canvasToBlob(drawFramed(img, frame, size, size), 0.86) })),
  );
};

// Foto sin recortar (el encuadre se aplica con CSS), achicada a cada ancho
// máximo de `sizes`. Fondos de promo y hero: 1920/960; foto de Conocenos: 960/480.
export const resizedVariants = async (src, sizes) => {
  const img = await loadImage(src);
  return Promise.all(
    sizes.map(async (maxW) => {
      const ratio = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      return { size: maxW, blob: await canvasToBlob(canvas, 0.85) };
    }),
  );
};

export const backgroundVariants = (src) => resizedVariants(src, [1920, 960]);

// Achica un data URL grande para que la vista previa del admin no sea pesada.
export const previewDataUrl = async (src, maxWidth = 1920) => {
  const img = await loadImage(src);
  if (img.naturalWidth <= maxWidth) return src;
  const ratio = maxWidth / img.naturalWidth;
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = Math.round(img.naturalHeight * ratio);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
};
