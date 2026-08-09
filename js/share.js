import { money, triggerHaptic } from './utils.js';
import { showToast } from './ui.js';

export function buildShareText(result, bankDescription) {
  const amount = money(result.usdUsed, 2);
  const bsNeeded = money(result.vesNeeded, 2);
  const bpayAmount = money(result.safeGateway.bpayInputAmount, 2);
  const finalUsdt = money(result.usdtFinal, 2);
  const profitUsd = (result.profitUsdt >= 0 ? '+' : '') + money(result.profitUsdt, 2);
  const roi = (result.roi >= 0 ? '+' : '') + money(result.roi, 2);
  const bcv = money(result.bcv, 2);
  const bankRate = money(result.bank, 2);
  const p2p = money(result.p2p, 2);

  return `CalcuFlow — Banco → USDT

Compra: ${amount} USD
Banco: ${bankDescription}

BCV: ${bcv}
Banco: ${bankRate}
P2P: ${p2p}

Bs necesarios: ${bsNeeded} Bs
Monto en BPay: ${bpayAmount} USD
USDT finales: ${finalUsdt} USDT
Ganancia estimada: ${profitUsd} USD
Retorno: ${roi}%

https://calcu-flow.vercel.app`;
}

export function initShare(copyButton) {
  if (!navigator.share || !copyButton) return;
  copyButton.title = 'Compartir resumen';
  copyButton.setAttribute('aria-label', 'Compartir resumen');
  const icon = copyButton.querySelector('.material-symbols-rounded');
  if (icon) icon.textContent = 'share';
}

export function shareOrCopy({ button, calculate, getBankDescription, flashCopyButton }) {
  triggerHaptic('light');
  const result = calculate();
  if (!result) {
    const errorMsg = navigator.share ? 'Completa los datos antes de compartir.' : 'Completa los datos antes de copiar.';
    showToast(errorMsg, 'warn');
    return;
  }
  const text = buildShareText(result, getBankDescription());

  if (navigator.share) {
    navigator.share({ title: 'CalcuFlow', text })
      .then(() => {
        triggerHaptic('success');
        showToast('Cálculo compartido');
      })
      .catch(err => {
        if (err.name !== 'AbortError') showToast('No se pudo compartir el cálculo', 'err');
      });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => {
        triggerHaptic('success');
        showToast('Resumen copiado al portapapeles');
        flashCopyButton(button);
      })
      .catch(() => showToast('No se pudo compartir el cálculo', 'err'));
  }
}
