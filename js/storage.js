export const STORE_KEY = 'bancoUsdtCalcCompactV2';

export function saveState(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}
