export const USER_DIRECTIONS = Object.freeze({
  USER_BUYS_USDT: 'userBuysUsdt',
  USER_SELLS_USDT: 'userSellsUsdt'
});

function median(values) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function validPrice(advertisement) {
  const price = advertisement?.price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Calculate sample statistics without depending on a particular upstream provider.
 * Lower offers are better when the user buys the asset; higher offers are better
 * when the user sells it.
 */
export function calculateRateStatistics({
  advertisements,
  asset,
  fiat,
  userDirection,
  now = () => new Date()
}) {
  if (!Array.isArray(advertisements)) {
    throw new TypeError('advertisements must be an array');
  }
  if (!Object.values(USER_DIRECTIONS).includes(userDirection)) {
    throw new TypeError('userDirection must be userBuysUsdt or userSellsUsdt');
  }

  const prices = advertisements
    .filter(validPrice)
    .map(advertisement => advertisement.price)
    .sort((left, right) => userDirection === USER_DIRECTIONS.USER_BUYS_USDT
      ? left - right
      : right - left);
  const top3 = prices.slice(0, 3);
  const top5 = prices.slice(0, 5);
  const chronologicalTimestamp = now();

  if (!(chronologicalTimestamp instanceof Date) || !Number.isFinite(chronologicalTimestamp.getTime())) {
    throw new TypeError('now must return a valid Date');
  }

  return {
    asset,
    fiat,
    userDirection,
    bestValidPrice: prices[0] ?? null,
    top3Median: median([...top3].sort((a, b) => a - b)),
    top5Median: median([...top5].sort((a, b) => a - b)),
    overallMedian: median([...prices].sort((a, b) => a - b)),
    top3Mean: mean(top3),
    top5Mean: mean(top5),
    validOfferCount: prices.length,
    minimumPrice: prices.length ? Math.min(...prices) : null,
    maximumPrice: prices.length ? Math.max(...prices) : null,
    calculatedAt: chronologicalTimestamp.toISOString()
  };
}

