import { MAX_PERSISTED_LOGO_BYTES } from './bank-profiles.js';

export const MAX_SOURCE_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION = 256;
export const RECOMMENDED_LOGO_DIMENSION = 512;
export const ALLOWED_LOGO_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

export class BankLogoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BankLogoError';
    this.code = code;
  }
}

export function validateBankLogoFile(file) {
  if (!file || typeof file !== 'object') {
    throw new BankLogoError('missing-file', 'Selecciona una imagen para continuar.');
  }
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    throw new BankLogoError('unsupported-type', 'Usa una imagen PNG, JPEG o WebP.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new BankLogoError('empty-file', 'La imagen está vacía o no se puede leer.');
  }
  if (file.size > MAX_SOURCE_LOGO_BYTES) {
    throw new BankLogoError('file-too-large', 'La imagen supera el máximo de 2 MB.');
  }
  return true;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(
      new BankLogoError('read-failed', 'No se pudo preparar la imagen para guardarla.')
    ), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function decodeWithImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeLogo(file) {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(file);
    return await decodeWithImage(file);
  } catch {
    throw new BankLogoError('decode-failed', 'El archivo no contiene una imagen válida.');
  }
}

function getImageSize(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
}

function getContainedSize(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function encodeLogo(canvas) {
  const attempts = [
    ['image/webp', 0.84],
    ['image/webp', 0.72],
    ['image/webp', 0.60],
    ['image/jpeg', 0.78],
    ['image/jpeg', 0.66]
  ];
  let smallest = null;

  for (const [type, quality] of attempts) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob || !ALLOWED_LOGO_TYPES.includes(blob.type)) continue;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= MAX_PERSISTED_LOGO_BYTES) return blob;
  }
  return smallest;
}

export async function processBankLogo(file, documentRef = document) {
  validateBankLogoFile(file);
  const image = await decodeLogo(file);

  try {
    const sourceSize = getImageSize(image);
    if (!sourceSize.width || !sourceSize.height) {
      throw new BankLogoError('invalid-dimensions', 'La imagen no tiene dimensiones válidas.');
    }

    let maxDimension = MAX_LOGO_DIMENSION;
    let output = null;
    while (maxDimension >= 64) {
      const size = getContainedSize(sourceSize.width, sourceSize.height, maxDimension);
      const canvas = documentRef.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) {
        throw new BankLogoError('canvas-unavailable', 'Este navegador no puede preparar el logo.');
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size.width, size.height);
      output = await encodeLogo(canvas);
      if (output?.size <= MAX_PERSISTED_LOGO_BYTES) return await blobToDataUrl(output);
      maxDimension = Math.floor(maxDimension * 0.75);
    }

    throw new BankLogoError(
      'compression-failed',
      'No se pudo reducir el logo a un tamaño seguro. Prueba con una imagen más simple.'
    );
  } finally {
    if (typeof image.close === 'function') image.close();
  }
}
