export const API_OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial';
export const API_PARALELO = 'https://ve.dolarapi.com/v1/dolares/paralelo';

export async function fetchRates() {
  const [oficialRes, paraleloRes] = await Promise.all([
    fetch(API_OFICIAL, { cache: 'no-store' }),
    fetch(API_PARALELO, { cache: 'no-store' })
  ]);

  if (!oficialRes.ok || !paraleloRes.ok) {
    throw new Error('Respuesta inválida de DolarApi');
  }

  const oficial = await oficialRes.json();
  const paralelo = await paraleloRes.json();

  const bcv = Number(oficial.promedio || oficial.venta || oficial.compra);
  const p2p = Number(paralelo.promedio || paralelo.venta || paralelo.compra);

  if (!bcv || !p2p) {
    throw new Error('No se encontraron tasas válidas');
  }

  return { bcv, p2p };
}
