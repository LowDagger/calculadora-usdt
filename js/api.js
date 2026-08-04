/** DolarAPI Venezuela combined rates endpoint (no authentication required). */
export const DOLARAPI_RATES = 'https://ve.dolarapi.com/v1/dolares';

const REQUEST_TIMEOUT_MS = 9000;

function providerError(message) {
  return new Error(`Proveedor de tasas: ${message}`);
}

function findUsdRate(data, source) {
  return data.find(entry =>
    entry &&
    String(entry.moneda || '').trim().toLowerCase() === 'usd' &&
    String(entry.fuente || '').trim().toLowerCase() === source
  );
}

function positiveRate(entry, label) {
  const rate = Number(entry.promedio);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw providerError(`tasa ${label} no válida.`);
  }
  return rate;
}

function validDate(entry, label) {
  const value = entry.fechaActualizacion;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw providerError(`fecha de actualización ${label} no válida.`);
  }
  return value;
}

/**
 * Fetch and atomically normalize the official and parallel USD rates.
 * Returns { bcv, p2p, bcvEffectiveDate, p2pUpdatedAt } or throws without
 * exposing a partial result.
 */
export async function fetchRates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DOLARAPI_RATES, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw providerError(`respuesta HTTP ${response.status}.`);

    const data = await response.json();
    if (!Array.isArray(data)) throw providerError('la respuesta no es una lista válida.');

    const official = findUsdRate(data, 'oficial');
    if (!official) throw providerError('no se encontró la tasa oficial USD.');
    const parallel = findUsdRate(data, 'paralelo');
    if (!parallel) throw providerError('no se encontró la tasa paralela USD.');

    const bcv = positiveRate(official, 'oficial');
    const p2p = positiveRate(parallel, 'paralela');
    const bcvEffectiveDate = validDate(official, 'oficial');
    const p2pUpdatedAt = validDate(parallel, 'paralela');

    return { bcv, p2p, bcvEffectiveDate, p2pUpdatedAt };
  } finally {
    clearTimeout(timeout);
  }
}
