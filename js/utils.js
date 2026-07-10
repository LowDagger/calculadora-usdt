export function n(value) {
  return Number.parseFloat(value) || 0;
}

export function money(value, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function $(id) {
  return document.getElementById(id);
}

export function triggerHaptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  const patterns = {
    light: 8,
    medium: 15,
    success: [10, 30, 10],
    warning: [20, 40, 20]
  };

  try {
    navigator.vibrate(patterns[type] || patterns.light);
  } catch (e) {
    // Ignore vibration errors (e.g. security blocks)
  }
}
