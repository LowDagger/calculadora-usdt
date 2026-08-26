import { money, triggerHaptic } from "./utils.js";
import { showToast } from "./ui.js";
import {
  CANONICAL_SHARE_URL,
  CANONICAL_SHARE_DOMAIN,
  prepareShareCardData,
  renderShareCard,
  getShareCardBlob,
  createShareCardFile,
  downloadShareCard
} from "./share-card.js";

export { CANONICAL_SHARE_URL, CANONICAL_SHARE_DOMAIN };

export function buildShareText(result, bankProfileOrDescription) {
  let bankDescription = typeof bankProfileOrDescription === "object" && bankProfileOrDescription !== null
    ? [
        bankProfileOrDescription.name,
        bankProfileOrDescription.cardType,
        Number(bankProfileOrDescription.fee || 0).toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%"
      ].filter(Boolean).join(" · ")
    : String(bankProfileOrDescription || "Banco de Venezuela");

  const amount = money(result.usdUsed, 2);
  const bsNeeded = money(result.vesNeeded, 2);
  const bpayAmount = money(result.safeGateway?.bpayInputAmount ?? result.usdUsed, 2);
  const finalUsdt = money(result.usdtFinal, 2);
  const profitUsd = (result.profitUsdt >= 0 ? "+" : "") + money(result.profitUsdt, 2);
  const roi = (result.roi >= 0 ? "+" : "") + money(result.roi, 2);
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

${CANONICAL_SHARE_URL}`;
}

export function initShare(copyButton) {
  if (!navigator.share || !copyButton) return;
  copyButton.title = "Compartir resumen";
  copyButton.setAttribute("aria-label", "Compartir resumen");
  const icon = copyButton.querySelector(".material-symbols-rounded");
  if (icon) icon.textContent = "share";
}

export function shareOrCopy({ button, calculate, getBankDescription, flashCopyButton }) {
  triggerHaptic("light");
  const result = calculate();
  if (!result) {
    const errorMsg = navigator.share ? "Completa los datos antes de compartir." : "Completa los datos antes de copiar.";
    showToast(errorMsg, "warn");
    return;
  }
  const bankInfo = typeof getBankDescription === "function" ? getBankDescription() : "Banco de Venezuela";
  const text = buildShareText(result, bankInfo);

  if (navigator.share) {
    navigator.share({ title: "CalcuFlow", text })
      .then(() => {
        triggerHaptic("success");
        showToast("Cálculo compartido");
      })
      .catch(err => {
        if (err.name !== "AbortError") showToast("No se pudo compartir el cálculo", "err");
      });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => {
        triggerHaptic("success");
        showToast("Resumen copiado al portapapeles");
        if (flashCopyButton) flashCopyButton(button);
      })
      .catch(() => showToast("No se pudo compartir el cálculo", "err"));
  }
}

export function createShareController({
  panel,
  closeButton,
  previewCanvas,
  shareImageBtn,
  copySummaryBtn,
  saveImageBtn,
  calculate,
  getBankDescription,
  getBankProfile,
  openModal,
  closeModal,
  flashButton
}) {
  let isPreparing = false;
  let preparedBlob = null;
  let preparedFile = null;
  let preparationPromise = null;
  let debounceTimer = null;

  function resolveBankInfo() {
    if (typeof getBankProfile === "function") {
      const profile = getBankProfile();
      if (profile) return profile;
    }
    if (typeof getBankDescription === "function") {
      return getBankDescription();
    }
    return "Banco de Venezuela";
  }

  async function generateCard(result, bankInfo) {
    if (!result || !previewCanvas) return null;
    const cardData = prepareShareCardData(result, bankInfo);
    await renderShareCard(previewCanvas, cardData);
    const blob = await getShareCardBlob(previewCanvas);
    const file = createShareCardFile(blob);
    preparedBlob = blob;
    preparedFile = file;
    return { blob, file, cardData };
  }

  function startPreparation(result, bankInfo) {
    if (!result) return null;
    isPreparing = true;
    preparedFile = null;
    preparedBlob = null;
    preparationPromise = generateCard(result, bankInfo)
      .catch(err => {
        return null;
      })
      .finally(() => {
        isPreparing = false;
      });
    return preparationPromise;
  }

  function open(trigger = null) {
    const result = calculate();
    if (!result) {
      showToast("Completa los datos antes de compartir.", "warn");
      return;
    }
    const bankInfo = resolveBankInfo();
    openModal();
    startPreparation(result, bankInfo);
  }

  function dismiss() {
    closeModal();
  }

  function updatePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const result = calculate();
      if (!result) return;
      const bankInfo = resolveBankInfo();
      startPreparation(result, bankInfo);
    }, 100);
  }

  async function handleShareImage() {
    triggerHaptic("light");
    const result = calculate();
    if (!result) {
      showToast("Completa los datos antes de compartir.", "warn");
      return;
    }

    const bankInfo = resolveBankInfo();

    let file = preparedFile;
    if (!file && preparationPromise) {
      const res = await preparationPromise;
      file = res?.file || preparedFile;
    }
    if (!file) {
      const res = await generateCard(result, bankInfo);
      file = res?.file;
    }

    if (!file) {
      showToast("No se pudo preparar la imagen", "err");
      return;
    }

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        const cardData = prepareShareCardData(result, bankInfo);
        await navigator.share({
          files: [file],
          title: "CalcuFlow",
          text: `Cálculo CalcuFlow: ${cardData.usdAmount} USD (${cardData.bankDescription})\n${CANONICAL_SHARE_URL}`
        });
        triggerHaptic("success");
        showToast("Imagen compartida");
      } else {
        const saved = downloadShareCard(previewCanvas);
        if (saved) {
          triggerHaptic("success");
          showToast("Imagen guardada");
        } else {
          showToast("No se pudo compartir la imagen", "err");
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      showToast("No se pudo compartir la imagen", "err");
    }
  }

  async function handleCopySummary() {
    triggerHaptic("light");
    const result = calculate();
    if (!result) {
      showToast("Completa los datos antes de copiar.", "warn");
      return;
    }
    const bankInfo = resolveBankInfo();
    const text = buildShareText(result, bankInfo);
    try {
      await navigator.clipboard.writeText(text);
      triggerHaptic("success");
      showToast("Resumen copiado al portapapeles");
      if (flashButton && copySummaryBtn) flashButton(copySummaryBtn);
    } catch {
      showToast("No se pudo copiar el resumen", "err");
    }
  }

  function handleSaveImage() {
    triggerHaptic("light");
    if (!previewCanvas) return;
    const saved = downloadShareCard(previewCanvas);
    if (saved) {
      triggerHaptic("success");
      showToast("Imagen guardada");
      if (flashButton && saveImageBtn) flashButton(saveImageBtn);
    } else {
      showToast("No se pudo guardar la imagen", "err");
    }
  }

  if (closeButton) {
    closeButton.addEventListener("click", dismiss);
  }
  if (shareImageBtn) {
    shareImageBtn.addEventListener("click", handleShareImage);
  }
  if (copySummaryBtn) {
    copySummaryBtn.addEventListener("click", handleCopySummary);
  }
  if (saveImageBtn) {
    saveImageBtn.addEventListener("click", handleSaveImage);
  }

  return {
    open,
    dismiss,
    updatePreview,
    startPreparation,
    getPreparedFile: () => preparedFile,
    handleShareImage,
    handleCopySummary,
    handleSaveImage
  };
}
