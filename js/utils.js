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
