import { money } from '../js/utils.js';

export const CANONICAL_APP_URL = 'https://calcu-flow.vercel.app';

export const BANK_ALIASES = Object.freeze({
  // BDV
  bdv: Object.freeze({ id: 'bdv-fisica', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Física' }),
  venezuela: Object.freeze({ id: 'bdv-fisica', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Física' }),
  'bdv-fisica': Object.freeze({ id: 'bdv-fisica', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Física' }),
  'bdv-virtual': Object.freeze({ id: 'bdv-virtual', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Virtual' }),
  'bdv virtual': Object.freeze({ id: 'bdv-virtual', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Virtual' }),
  'bdv fisica': Object.freeze({ id: 'bdv-fisica', name: 'Banco de Venezuela', fee: 2.5, cardType: 'Física' }),

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
  id: 'bdv-fisica',
  name: 'Banco de Venezuela',
  fee: 2.5,
  cardType: ''
});

export function formatPercent(value) {
  const num = Number(value || 0);
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: Number.isInteger(num) ? 1 : 1,
    maximumFractionDigits: 2
  }) + '%';
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
  const bankFee = formatPercent(bank.fee ?? 2.5);

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

export function formatRatesMessage({ bcv, p2p, bcvDate = null }) {
  const bcvFormatted = money(bcv, 2);
  const p2pFormatted = money(p2p, 2);
  const brechaVal = bcv > 0 ? ((p2p - bcv) / bcv) * 100 : 0;
  const brechaSign = brechaVal >= 0 ? '+' : '';
  const brechaFormatted = brechaSign + money(brechaVal, 2) + '%';
  const dateInfo = bcvDate ? ` (${bcvDate})` : '';

  return `📈 *Tasas de referencia — CalcuFlow*

🏦 *BCV:* ${bcvFormatted} Bs/USD${dateInfo}
🔄 *P2P:* ${p2pFormatted} Bs/USDT
📊 *Brecha:* ${brechaFormatted}`;
}

export function formatHelpMessage() {
  return `🤖 *Bot de CalcuFlow — Banco ➔ USDT*

Calcula al instante tu operación Banco ➔ USDT con tasas actualizadas.

📌 *Comandos:*
• \`/calcular\` o \`/calc <monto> [banco]\` — Abre o calcula una operación
• \`/bancos\` — Abre la selección de banco
• \`<monto>\` — Envía solo el monto (ej: \`100\`, \`500\`)
• \`/tasas\` — Consulta las tasas BCV y P2P en tiempo real
• \`/privado\` — Abre CalcuFlow en privado
• \`/ayuda\` — Muestra este mensaje de ayuda
• \`/start\` — Abre el inicio de CalcuFlow

💡 *O pulsa los botones de acceso rápido abajo para calcular al instante:*

🏦 *Bancos soportados:*
BDV (2,5%), BBVA (1,5%), Banesco (1,5%), BNC (1,5%), Bancamiga (5%), Tesoro (2,5%), BDT (2,5%).
También puedes indicar una comisión directa (ej: \`/calc 100 3%\`).`;
}

export function formatErrorMessage(error) {
  return `⚠️ ${error || 'Ocurrió un error al procesar tu solicitud.'}`;
}

export const BANK_BUTTON_ROWS = Object.freeze([
  [
    Object.freeze({ id: 'bdv-fisica', label: 'BDV (2.5%)' }),
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

export function buildBankInlineKeyboard(amount, selectedBankId = 'bdv-fisica') {
  const currentBank = typeof selectedBankId === 'object' && selectedBankId !== null
    ? selectedBankId
    : resolveBank(selectedBankId);
  const currentBankId = currentBank?.id || 'bdv-fisica';

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
      const bankId = parts.slice(2).join(':').trim() || 'bdv-fisica';
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
