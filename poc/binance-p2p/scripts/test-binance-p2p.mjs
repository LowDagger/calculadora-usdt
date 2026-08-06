import { getP2PRates, P2PProviderError } from '../providers/binanceP2PProvider.mjs';
import { calculateRateStatistics, USER_DIRECTIONS } from '../services/rateStatistics.mjs';

const directionNames = Object.freeze({
  'user-buys-usdt': USER_DIRECTIONS.USER_BUYS_USDT,
  'user-sells-usdt': USER_DIRECTIONS.USER_SELLS_USDT
});

function parseArguments(argv) {
  const options = { asset: 'USDT', fiat: 'VES', rows: 10, page: 1, payTypes: [] };
  let direction = 'user-buys-usdt';
  let debug = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === '--asset') options.asset = next();
    else if (argument === '--fiat') options.fiat = next();
    else if (argument === '--direction') direction = next();
    else if (argument === '--rows') options.rows = Number(next());
    else if (argument === '--page') options.page = Number(next());
    else if (argument === '--amount') options.transAmount = next();
    else if (argument === '--payment-method') options.payTypes.push(next());
    else if (argument === '--min-completion-rate') options.minimumCompletionRate = Number(next());
    else if (argument === '--min-completed-orders') options.minimumCompletedOrders = Number(next());
    else if (argument === '--merchant-only') options.merchantOnly = true;
    else if (argument === '--debug') debug = true;
    else if (argument === '--help') return { help: true };
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!directionNames[direction]) throw new Error(`Unsupported direction: ${direction}`);
  options.userDirection = directionNames[direction];
  return { options, debug };
}

function printHelp() {
  console.log(`Usage:
  node poc/binance-p2p/scripts/test-binance-p2p.mjs --fiat VES --asset USDT --direction user-buys-usdt --rows 10

Directions: user-buys-usdt | user-sells-usdt
Optional: --page N --amount N --payment-method NAME --min-completion-rate 0..1
          --min-completed-orders N --merchant-only --debug`);
}

function format(value) {
  return value === null ? 'n/a' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
}

try {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
  } else {
    const result = await getP2PRates(parsed.options);
    const statistics = calculateRateStatistics({
      advertisements: result.advertisements,
      asset: result.asset,
      fiat: result.fiat,
      userDirection: result.tradeDirection.userDirection
    });
    console.log(`Provider: Binance P2P
Pair: ${result.asset}/${result.fiat}
Direction: ${result.tradeDirection.userDirection} (${result.tradeDirection.advertiserDirection})
Advertisements returned: ${result.returnedAdvertisementCount}
Valid advertisements used: ${statistics.validOfferCount}
Best sample price: ${format(statistics.bestValidPrice)}
Top-3 median: ${format(statistics.top3Median)}
Top-5 median: ${format(statistics.top5Median)}
Overall median: ${format(statistics.overallMedian)}
Calculated at: ${statistics.calculatedAt}
From cache: ${result.cached ? 'yes' : 'no'}`);
    if (parsed.debug) {
      console.log('Sanitized offers:', result.advertisements);
    }
  }
} catch (error) {
  const output = error instanceof P2PProviderError ? error.toJSON() : {
    code: 'CLI_ERROR', message: error.message, retryable: false, status: null
  };
  console.error(JSON.stringify(output, null, 2));
  process.exitCode = 1;
}

