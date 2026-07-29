import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_LOGO_TYPES,
  MAX_LOGO_DIMENSION,
  MAX_SOURCE_LOGO_BYTES,
  RECOMMENDED_LOGO_DIMENSION,
  validateBankLogoFile
} from '../js/bank-logo-processing.js';

test('accepts PNG, JPEG, and WebP sources within the 2 MB boundary', () => {
  assert.deepEqual(ALLOWED_LOGO_TYPES, ['image/png', 'image/jpeg', 'image/webp']);
  for (const type of ALLOWED_LOGO_TYPES) {
    assert.equal(validateBankLogoFile({ type, size: MAX_SOURCE_LOGO_BYTES }), true);
  }
  assert.equal(MAX_LOGO_DIMENSION, 256);
  assert.equal(RECOMMENDED_LOGO_DIMENSION, 512);
});

test('rejects missing, empty, oversized, SVG, and unknown logo sources with clear errors', () => {
  assert.throws(() => validateBankLogoFile(null), /Selecciona una imagen/);
  assert.throws(() => validateBankLogoFile({ type: 'image/png', size: 0 }), /vacía/);
  assert.throws(
    () => validateBankLogoFile({ type: 'image/png', size: MAX_SOURCE_LOGO_BYTES + 1 }),
    /máximo de 2 MB/
  );
  assert.throws(() => validateBankLogoFile({ type: 'image/svg+xml', size: 100 }), /PNG, JPEG o WebP/);
  assert.throws(() => validateBankLogoFile({ type: '', size: 100 }), /PNG, JPEG o WebP/);
});
