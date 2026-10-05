import { money } from '../js/utils.js';

export const CANONICAL_APP_URL = 'https://calcuflow.live';

export const BANK_ALIASES = Object.freeze({
  // BDV
  bdv: Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),
  venezuela: Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),
  'bdv-fisica': Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),
  'bdv-virtual': Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),
  'bdv virtual': Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),
  'bdv fisica': Object.freeze({ id: 'bdv', name: 'Banco de Venezuela', fee: 2.5, feeSteps: [1, 1.5], cardType: '' }),

  // BBVA Provincial
  bbva: Object.freeze({ id: 'bbva-provincial', name: 'BBVA Provincial', fee: 1.5, cardType: '' }),
  provincial: Object.freeze({ id: 'bbva-provincial', name: 'BBVA Provincial', fee: 1.5, cardType: '' }),
  'bbva-provincial': Object.freeze({ id: 'bbva-provincial', name: 'BBVA Provincial', fee: 1.5, cardType: '' }),

  // Banco del Tesoro
  tesoro: Object.freeze({ id: 'banco-tesoro', name: 'Banco del Tesoro', fee: 2.5, cardType: '' }),
  bt: Object.freeze({ id: 'banco-tesoro', name: 'Banco del Tesoro', fee: 2.5, cardType: '' }),
  'banco-tesoro': Object.freeze({ id: 'banco-tesoro', name: 'Banco del Tesoro', fee: 2.5, cardType: '' }),
  'banco del tesoro': Object.freeze({ id: 'banco-tesoro', name: 'Banco del Tesoro', fee: 2.5, cardType: '' }),

  // Bancamiga
  bancamiga: Object.freeze({ id: 'bancamiga', name: 'Bancamiga', fee: 5.0, cardType: '' }),
  amiga: Object.freeze({ id: 'bancamiga', name: 'Bancamiga', fee: 5.0, cardType: '' }),
  ba: Object.freeze({ id: 'bancamiga', name: 'Bancamiga', fee: 5.0, cardType: '' }),

  // Banesco
  banesco: Object.freeze({ id: 'banesco-fisica', name: 'Banesco', fee: 1.5, cardType: 'Física' }),
  'banesco-fisica': Object.freeze({ id: 'banesco-fisica', name: 'Banesco', fee: 1.5, cardType: 'Física' }),
  'banesco fisica': Object.freeze({ id: 'banesco-fisica', name: 'Banesco', fee: 1.5, cardType: 'Física' }),
  'banesco-virtual': Object.freeze({ id: 'banesco-virtual', name: 'Banesco', fee: 2.5, cardType: 'Virtual' }),
  'banesco virtual': Object.freeze({ id: 'banesco-virtual', name: 'Banesco', fee: 2.5, cardType: 'Virtual' }),

  // BNC
  bnc: Object.freeze({ id: 'bnc', name: 'BNC', fee: 1.5, cardType: '' }),
  'nacional de credito': Object.freeze({ id: 'bnc', name: 'BNC', fee: 1.5, cardType: '' }),

  // BDT
  bdt: Object.freeze({ id: 'bdt', name: 'Banco Digital de los Trabajadores', fee: 2.5, cardType: '' }),
  bicentenario: Object.freeze({ id: 'bdt', name: 'Banco Digital de los Trabajadores', fee: 2.5, cardType: '' }),
  trabajadores: Object.freeze({ id: 'bdt', name: 'Banco Digital de los Trabajadores', fee: 2.5, cardType: '' })
});

export const DEFAULT_BANK = Object.freeze({
  id: 'bdv',
  name: 'Banco de Venezuela',
  fee: 2.5,
  feeSteps: [1, 1.5],
  cardType: ''
});

export function formatPercent(value) {
  const num = Number(value || 0);
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: Number.isInteger(num) ? 1 : 1,
    maximumFractionDigits: 2
  }) + '%';
}

export function formatBankFee(bank) {
  return formatPercent(bank?.fee ?? 2.5);
}

export function resolveBank(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { ...DEFAULT_BANK };
  }

  const normalized = query.trim().toLowerCase();

  // Exact alias match
  if (BANK_ALIASES[normalized]) {
    return { ...BANK_ALIASES[normalized] };
  }

  // Check percentage or custom fee like "3%", "1.5%", "2,5%", "0%"
  const feeMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s*%?$/);
  if (feeMatch) {
    const feeVal = Number(feeMatch[1].replace(',', '.'));
    if (Number.isFinite(feeVal) && feeVal >= 0 && feeVal <= 100) {
      return {
        id: 'custom',
        name: 'Personalizado',
        fee: Math.round((feeVal + Number.EPSILON) * 100) / 100,
        cardType: ''
      };
    }
  }

  // Search in known aliases
  for (const [alias, bank] of Object.entries(BANK_ALIASES)) {
    if (normalized.includes(alias)) {
      return { ...bank };
    }
  }

  // Fallback: custom bank name with standard 2.5% fee
  return {
    id: 'custom',
    name: query.trim().slice(0, 40),
    fee: 2.5,
    cardType: ''
  };
}

export function isValidBankSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const normalized = slug.trim().toLowerCase();
  return Boolean(BANK_ALIASES[normalized]) || /^(\d+(?:[.,]\d+)?)\s*%?$/.test(normalized);
}

function parseAmountAndBank(input) {
  const parts = input.trim().split(/\s+/);
  const rawAmount = parts[0];
  const bankQuery = parts.slice(1).join(' ');

  // Normalize amount (handle 100, 100.50, 100,50)
  const normalizedAmountStr = rawAmount.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmountStr)) {
    return {
      type: 'invalid_calc',
      error: 'Ingresa un monto numérico válido (hasta 2 decimales). Ej: `/calc 100` o `/calc 500 bdv`'
    };
  }

  const amount = Number(normalizedAmountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      type: 'invalid_calc',
      error: 'El monto debe ser mayor que 0.'
    };
  }

  if (amount > 1_000_000) {
    return {
      type: 'invalid_calc',
      error: 'El máximo por cálculo es 1.000.000,00 USD.'
    };
  }

  return {
    type: 'calc',
    amount,
    bankQuery,
    rawAmount
  };
}

export function parseTelegramMessage(text) {
  if (typeof text !== 'string') {
    return { type: 'unknown' };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'unknown' };
  }

  // Commands starting with /
  if (trimmed.startsWith('/')) {
    const match = trimmed.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/s);
    if (!match) {
      return { type: 'unknown' };
    }

    const command = match[1].toLowerCase();
    const args = match[2]?.trim() || '';

    if (command === 'start') {
      const startParameter = args.toLowerCase();
      if (startParameter === 'support') return { type: 'support' };
      if (startParameter === 'calc') return { type: 'show_banks' };
      return { type: 'home' };
    }

    if (command === 'ayuda' || command === 'help') return { type: 'help' };
    if (command === 'threadid' || command === 'topicid') return { type: 'thread_id' };
    if (command === 'apoyar') return { type: 'support' };
    if (command === 'terms' || command === 'terminos') return { type: 'terms' };
    if (command === 'paysupport') return { type: 'payment_support' };
    if (command === 'bancos') return { type: 'show_banks' };
    if (command === 'privado') return { type: 'private_access' };

    if (command === 'tasas' || command === 'tasa' || command === 'rates' || command === 'precio') {
      return { type: 'rates' };
    }

    if (command === 'calc' || command === 'calcular' || command === 'c') {
      if (!args) {
        return { type: 'show_banks' };
      }
      return parseAmountAndBank(args);
    }

    return { type: 'unknown' };
  }

  // Non-command message starting with a number (e.g. "100", "500 bdv")
  const plainCalcMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (plainCalcMatch) {
    return parseAmountAndBank(trimmed);
  }

  // Plain word keywords
  const lower = trimmed.toLowerCase();
  if (lower === 'tasas' || lower === 'tasa') {
    return { type: 'rates' };
  }
  if (lower === 'ayuda' || lower === 'help') {
    return { type: 'help' };
  }

  return { type: 'unknown' };
}

export function formatCalculationResult(result, bankInfo) {
  const bank = typeof bankInfo === 'object' && bankInfo !== null
    ? bankInfo
    : resolveBank(bankInfo);

  const bankName = bank.name || 'Banco de Venezuela';
  const bankFee = formatBankFee(bank);

  const amount = money(result.usdUsed, 2);
  const bsNeeded = money(result.vesNeeded, 2);
  const bpayAmount = money(result.safeGateway?.bpayInputAmount ?? result.afterCard, 2);
  const finalUsdt = money(result.usdtFinal, 2);

  const profitSign = result.profitUsdt >= 0 ? '+' : '';
  const profitUsd = profitSign + money(result.profitUsdt, 2);
  const roiSign = result.roi >= 0 ? '+' : '';
  const roi = roiSign + money(result.roi, 2);

  const bcv = money(result.bcv, 2);
  const bankRate = money(result.bank, 2);
  const p2p = money(result.p2p, 2);

  return `📊 *CalcuFlow — Banco ➔ USDT*

🏦 *Banco:* ${bankName} (${bankFee})
💵 *Compra:* ${amount} USD
🇻🇪 *Bs necesarios:* ${bsNeeded} Bs

📈 *Tasas:*
• BCV: ${bcv} Bs
• Banco: ${bankRate} Bs
• P2P: ${p2p} Bs

📋 *Detalle:*
• Monto en BPay: ${bpayAmount} USD
• USDT finales: ${finalUsdt} USDT

💰 *Ganancia estimada:* ${profitUsd} USD (${roi}%)`;
}

export function formatRateProvenance(record, kind) {
  const sources = {
    'bcv.today': 'BCV Today',
    'binance-p2p': 'Binance P2P (SELL USDT/VES)',
    'dolarapi-oficial': 'DolarAPI oficial (respaldo)',
    'dolarapi-paralelo': 'DolarAPI paralelo (respaldo)'
  };
  const source = sources[record?.source] || 'Fuente no disponible';
  const cached = record?.status === 'cached' ? ' · tasa guardada' : '';
  const dates = kind === 'bcv'
    ? [record?.effectiveDate ? `vigencia ${record.effectiveDate}` : '', record?.publishedAt ? `publicada ${record.publishedAt}` : '']
    : [record?.publishedAt ? `publicada ${record.publishedAt}` : '', record?.fetchedAt ? `consulta ${record.fetchedAt}` : ''];
  const dateText = dates.filter(Boolean).join(' · ');
  return `${source}${cached} · ${dateText || 'fecha no disponible'}`;
}

export function formatRatesMessage({ bcv, p2p, bcvDate = null, bcvRecord = null, p2pRecord = null }) {
  const brechaVal = bcv > 0 ? ((p2p - bcv) / bcv) * 100 : 0;
  const brechaSign = brechaVal >= 0 ? '+' : '';
  return `*Tasas de referencia — CalcuFlow*\n\nBCV: ${money(bcv, 2)} Bs/USD\n${formatRateProvenance(bcvRecord || { effectiveDate: bcvDate }, 'bcv')}\n\nP2P: ${money(p2p, 2)} Bs/USDT\n${formatRateProvenance(p2pRecord, 'p2p')}\n\nBrecha: ${brechaSign}${money(brechaVal, 2)}%`;
}

export function formatHelpMessage() {
  return `*CalcuFlow — Banco → USDT*\n\n• \`/calc\` o \`/calcular\`: elige banco y monto.\n• \`/calc 500 bdv\`: cálculo completo en un mensaje.\n• \`/tasas\`: tasas de referencia, fuentes y fechas.\n\nEn el grupo puedes usar \`/calc@calcuflowbot 500 bdv\` o \`/calcular@calcuflowbot\`, y \`/tasas@calcuflowbot\`.\n\nPara «Otro monto», responde a la solicitud del bot con \`375,50\` o \`375.50\`. Los números sueltos en el grupo se ignoran. Si ya no ves la solicitud, abre \`/calc@calcuflowbot\` otra vez.\n\nSolo quien inicia un cálculo puede cambiarlo. «Nuevo cálculo» abre un panel propio sin reemplazar resultados anteriores.\n\nEn privado también puedes enviar \`500 bdv\`. Usa /privado para abrir el bot; /apoyar mantiene el apoyo por Stars en privado.`;
}

export function formatErrorMessage(error) {
  return `⚠️ ${error || 'Ocurrió un error al procesar tu solicitud.'}`;
}

export const BANK_BUTTON_ROWS = Object.freeze([
  [
    Object.freeze({ id: 'bdv', label: 'BDV (2.5%)' }),
    Object.freeze({ id: 'bbva-provincial', label: 'BBVA (1.5%)' })
  ],
  [
    Object.freeze({ id: 'banesco-fisica', label: 'Banesco (1.5%)' }),
    Object.freeze({ id: 'bancamiga', label: 'Bancamiga (5.0%)' })
  ],
  [
    Object.freeze({ id: 'bnc', label: 'BNC (1.5%)' }),
    Object.freeze({ id: 'banco-tesoro', label: 'Tesoro (2.5%)' })
  ],
  [
    Object.freeze({ id: 'bdt', label: 'BDT (2.5%)' }),
    Object.freeze({ text: '🌐 Abrir Web App', url: CANONICAL_APP_URL })
  ]
]);

export function buildBankInlineKeyboard(amount, selectedBankId = 'bdv') {
  const currentBank = typeof selectedBankId === 'object' && selectedBankId !== null
    ? selectedBankId
    : resolveBank(selectedBankId);
  const currentBankId = currentBank?.id || 'bdv';

  const inline_keyboard = BANK_BUTTON_ROWS.map(row => {
    return row.map(btn => {
      if (btn.url) {
        return { text: btn.text, url: btn.url };
      }
      const isSelected = btn.id === currentBankId;
      const text = isSelected ? `✓ ${btn.label}` : btn.label;
      return {
        text,
        callback_data: `calc:${amount}:${btn.id}`
      };
    });
  });

  return { inline_keyboard };
}

export function buildQuickAmountsInlineKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🧮 Calcular', callback_data: 'banks', style: 'primary' }],
      [{ text: '📈 Ver Tasas', callback_data: 'rates' }],
      [{ text: '⭐ Apoyar CalcuFlow', callback_data: 'support', style: 'success' }],
      [{ text: '🌐 Abrir CalcuFlow', url: CANONICAL_APP_URL }]
    ]
  };
}

export function parseCallbackData(data) {
  if (typeof data !== 'string') {
    return { type: 'unknown' };
  }

  const trimmed = data.trim();
  if (trimmed === 'rates' || trimmed === 'tasas') {
    return { type: 'rates' };
  }

  if (trimmed.startsWith('calc:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 2) {
      const rawAmount = parts[1];
      const bankId = parts.slice(2).join(':').trim() || 'bdv';
      const amount = Number(rawAmount);

      if (Number.isFinite(amount) && amount > 0 && amount <= 1_000_000) {
        return {
          type: 'calc',
          amount,
          bankId
        };
      }
    }
    return { type: 'invalid' };
  }

  return { type: 'unknown' };
}

export function formatThreadIdMessage(chatId, messageThreadId) {
  const topicDisplay = messageThreadId ? String(messageThreadId) : 'none';
  return `Chat ID:\n${chatId}\n\nTopic ID:\n${topicDisplay}`;
}
