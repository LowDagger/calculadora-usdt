import { money } from "./utils.js";

export const CANONICAL_SHARE_URL = "https://calcu-flow.vercel.app";
export const CANONICAL_SHARE_DOMAIN = "calcu-flow.vercel.app";
export const SHARE_CARD_FILENAME = "calcuflow-resultado.png";

export const CARD_DIMENSIONS = Object.freeze({
  width: 1080,
  height: 1350,
  aspectRatio: "4/5"
});

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle = null, strokeStyle = null, lineWidth = 1) {
  ctx.beginPath();
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

const imageCache = new Map();
let fontsReadyPromise = null;

export function ensureFontsReady() {
  if (typeof document === "undefined" || !document.fonts || !document.fonts.ready) {
    return Promise.resolve();
  }
  if (!fontsReadyPromise) {
    fontsReadyPromise = document.fonts.ready.catch(() => {});
  }
  return fontsReadyPromise;
}

export function loadCanvasImage(src) {
  if (typeof Image === "undefined" || !src) return Promise.resolve(null);
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));

  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
      setTimeout(() => resolve(null), 500);
    } catch {
      resolve(null);
    }
  });
}

function drawBrandIconFallback(ctx, x, y, size) {
  drawRoundedRect(ctx, x, y, size, size, 20, "#161F2E", "#283548", 2);
  ctx.fillStyle = "#42F4D6";
  ctx.font = "800 42px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("C", x + size / 2, y + size / 2);
}

function drawBankAvatar(ctx, x, y, size, bankImg, initials = "BDV", scale = 0.8) {
  if (bankImg) {
    ctx.save();
    ctx.beginPath();
    const r = 8;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
    ctx.clip();
    drawRoundedRect(ctx, x, y, size, size, r, "#1E2B3E", null);
    const drawW = size * scale;
    const drawH = size * scale;
    const offsetX = x + (size - drawW) / 2;
    const offsetY = y + (size - drawH) / 2;
    ctx.drawImage(bankImg, offsetX, offsetY, drawW, drawH);
    ctx.restore();
    drawRoundedRect(ctx, x, y, size, size, 8, null, "#2E3F57", 1);
  } else {
    drawRoundedRect(ctx, x, y, size, size, 8, "#1E2B3E", "#2E3F57", 1);
    ctx.fillStyle = "#94A3B8";
    ctx.font = "700 14px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((initials || "BAN").substring(0, 4), x + size / 2, y + size / 2);
  }
}

function getHeroBsFontSize(text) {
  if (text.length > 20) return 56;
  if (text.length > 16) return 64;
  if (text.length > 13) return 72;
  return 78;
}

export function prepareShareCardData(result, bankProfileOrDescription) {
  const usdAmount = money(result.usdUsed, 2);
  const bsNeeded = money(result.vesNeeded, 2);
  const bpayAmount = money(result.safeGateway?.bpayInputAmount ?? result.usdUsed, 2);
  const finalUsdt = money(result.usdtFinal, 2);
  const isPositiveProfit = result.profitUsdt >= 0;
  const profitUsd = (isPositiveProfit ? "+" : "") + money(result.profitUsdt, 2);
  const isPositiveRoi = result.roi >= 0;
  const roi = (isPositiveRoi ? "+" : "") + money(result.roi, 2);
  const bcv = money(result.bcv, 2);
  const bankRate = money(result.bank, 2);
  const p2p = money(result.p2p, 2);

  let bankName = "Banco de Venezuela";
  let bankCardType = "";
  let bankFeeStr = "2,5%";
  let bankIcon = null;
  let bankInitials = "BDV";
  let bankIconScale = 0.8;
  let bankDescription = "";

  if (typeof bankProfileOrDescription === "object" && bankProfileOrDescription !== null) {
    bankName = bankProfileOrDescription.name || "Banco de Venezuela";
    bankCardType = bankProfileOrDescription.cardType || "";
    const feeNum = Number(bankProfileOrDescription.fee) || 0;
    bankFeeStr = feeNum.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
    bankIcon = bankProfileOrDescription.icon || null;
    bankInitials = bankProfileOrDescription.initials || bankName.substring(0, 3).toUpperCase();
    bankIconScale = bankProfileOrDescription.iconScale || 0.8;
    bankDescription = [bankName, bankCardType, bankFeeStr].filter(Boolean).join(" · ");
  } else if (typeof bankProfileOrDescription === "string" && bankProfileOrDescription.trim()) {
    bankDescription = bankProfileOrDescription;
    const parts = bankProfileOrDescription.split(" · ");
    bankName = parts[0] || "Banco de Venezuela";
    if (parts.length > 2) {
      bankCardType = parts[1] || "";
      bankFeeStr = parts[2] || "";
    } else if (parts.length === 2) {
      if (parts[1].includes("%")) {
        bankFeeStr = parts[1];
      } else {
        bankCardType = parts[1];
      }
    }
  } else {
    bankDescription = bankName + " · " + bankFeeStr;
  }

  const bankChipLabel = [
    bankName + (bankCardType ? " (" + bankCardType + ")" : ""),
    bankFeeStr
  ].filter(Boolean).join(" · ");

  return {
    usdAmount,
    bsNeeded,
    bpayAmount,
    finalUsdt,
    profitUsd,
    roi,
    isPositiveProfit,
    isPositiveRoi,
    bcv,
    bankRate,
    p2p,
    bankName,
    bankCardType,
    bankFeeStr,
    bankIcon,
    bankInitials,
    bankIconScale,
    bankChipLabel,
    bankDescription,
    gainLabel: "Ganancia estimada (" + roi + "%)",
    canonicalDomain: CANONICAL_SHARE_DOMAIN,
    canonicalUrl: CANONICAL_SHARE_URL
  };
}

export async function renderShareCard(canvas, cardData) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = CARD_DIMENSIONS.width;
  const height = CARD_DIMENSIONS.height;
  canvas.width = width;
  canvas.height = height;

  await ensureFontsReady();

  const [iconImg, bankImg] = await Promise.all([
    loadCanvasImage("/assets/icon.svg"),
    loadCanvasImage(cardData.bankIcon)
  ]);

  // ── 1. Background & Outer Frame ──
  ctx.fillStyle = "#0B0F19";
  ctx.fillRect(0, 0, width, height);

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#111827");
  bgGrad.addColorStop(0.5, "#0D1320");
  bgGrad.addColorStop(1, "#080C14");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 36, null, "#1F2937", 2);

  // ── 2. Top Branding Header ──
  const iconX = 64;
  const iconY = 56;
  const iconSize = 80;

  if (iconImg) {
    ctx.save();
    ctx.beginPath();
    const r = 20;
    ctx.moveTo(iconX + r, iconY);
    ctx.arcTo(iconX + iconSize, iconY, iconX + iconSize, iconY + iconSize, r);
    ctx.arcTo(iconX + iconSize, iconY + iconSize, iconX, iconY + iconSize, r);
    ctx.arcTo(iconX, iconY + iconSize, iconX, iconY, r);
    ctx.arcTo(iconX, iconY, iconX + iconSize, iconY, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
    drawRoundedRect(ctx, iconX, iconY, iconSize, iconSize, 20, null, "#374151", 1.5);
  } else {
    drawBrandIconFallback(ctx, iconX, iconY, iconSize);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // CalcuFlow Brand (Single, clean branding without subtitle)
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 46px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("CalcuFlow", 164, 110);

  // Top Right Tag
  const badgeW = 180;
  const badgeH = 42;
  const badgeX = width - 64 - badgeW;
  const badgeY = 75;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 12, "#131D2E", "#233348", 1);
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 18px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Cálculo estimado", badgeX + badgeW / 2, badgeY + 27);

  // Top separator
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, 156);
  ctx.lineTo(width - 64, 156);
  ctx.stroke();

  // ── 3. Compact Bank Row / Chip ──
  const chipY = 178;
  const chipH = 48;
  const chipAvatarSize = 32;

  ctx.font = "600 20px Inter, system-ui, -apple-system, sans-serif";
  const bankTextWidth = ctx.measureText(cardData.bankChipLabel).width;
  const chipW = Math.min(width - 128, Math.max(280, bankTextWidth + 64));

  drawRoundedRect(ctx, 64, chipY, chipW, chipH, 14, "#131D2D", "#223348", 1.2);
  drawBankAvatar(ctx, 72, chipY + 8, chipAvatarSize, bankImg, cardData.bankInitials, cardData.bankIconScale);

  ctx.textAlign = "left";
  ctx.fillStyle = "#CBD5E1";
  ctx.font = "600 20px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.bankChipLabel, 116, chipY + 31);

  // ── 4. Monto de Compra ──
  const buyY = 244;
  const buyH = 74;
  drawRoundedRect(ctx, 64, buyY, width - 128, buyH, 18, "#111927", "#1E2B3D", 1.2);

  ctx.textAlign = "left";
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 20px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Monto de compra", 94, buyY + 45);

  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 32px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.usdAmount + " USD", width - 94, buyY + 48);

  // ── 5. HERO SECTION: Bolívares Necesarios (Biggest number on the card) ──
  const heroY = 338;
  const heroH = 196;
  drawRoundedRect(ctx, 64, heroY, width - 128, heroH, 24, "#0C182B", "#1E3E6B", 2);

  ctx.textAlign = "left";
  ctx.fillStyle = "#38BDF8";
  ctx.font = "700 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Bolívares necesarios", 96, heroY + 54);

  const heroBsText = cardData.bsNeeded + " Bs";
  const heroFontSize = getHeroBsFontSize(heroBsText);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 " + heroFontSize + "px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(heroBsText, 96, heroY + 144);

  // ── 6. Compact Reference Rates (BCV & P2P) ──
  const ratesY = 554;
  const rateCardW = (width - 128 - 20) / 2;
  const rateCardH = 104;

  // Rate 1: BCV
  drawRoundedRect(ctx, 64, ratesY, rateCardW, rateCardH, 18, "#111927", "#1E2B3D", 1.2);
  ctx.textAlign = "left";
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 18px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Tasa oficial BCV", 88, ratesY + 38);

  ctx.fillStyle = "#F8FAFC";
  ctx.font = "700 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.bcv + " Bs/USD", 88, ratesY + 78);

  // Rate 2: P2P
  const p2pX = 64 + rateCardW + 20;
  drawRoundedRect(ctx, p2pX, ratesY, rateCardW, rateCardH, 18, "#111927", "#1E2B3D", 1.2);
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 18px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Tasa P2P / Paralelo", p2pX + 24, ratesY + 38);

  ctx.fillStyle = "#F8FAFC";
  ctx.font = "700 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.p2p + " Bs/USDT", p2pX + 24, ratesY + 78);

  // ── 7. Intermediate Steps (BPay & USDT Finales) ──
  const stepsY = 678;
  const stepsH = 196;
  drawRoundedRect(ctx, 64, stepsY, width - 128, stepsH, 22, "#101726", "#1E2C42", 1.5);

  // Row 1: BPay
  ctx.textAlign = "left";
  ctx.fillStyle = "#94A3B8";
  ctx.font = "500 22px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Monto a colocar en BPay", 96, stepsY + 50);

  ctx.textAlign = "right";
  ctx.fillStyle = "#E2E8F0";
  ctx.font = "700 26px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.bpayAmount + " USD", width - 96, stepsY + 50);

  // Separator
  ctx.strokeStyle = "#1A2538";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(92, stepsY + 92);
  ctx.lineTo(width - 92, stepsY + 92);
  ctx.stroke();

  // Row 2: USDT Finales
  ctx.textAlign = "left";
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("USDT finales obtenidos", 96, stepsY + 148);

  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 32px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.finalUsdt + " USDT", width - 96, stepsY + 148);

  // ── 8. Profit & Gain Highlight Box (Single Unified Block) ──
  const gainY = 894;
  const gainH = 244;
  const gainFill = cardData.isPositiveProfit ? "#062222" : "#2A141A";
  const gainStroke = cardData.isPositiveProfit ? "#0F766E" : "#881337";
  const gainAccent = cardData.isPositiveProfit ? "#42F4D6" : "#FB7185";
  const gainMuted = cardData.isPositiveProfit ? "#A7F3D0" : "#FECDD3";

  drawRoundedRect(ctx, 64, gainY, width - 128, gainH, 24, gainFill, gainStroke, 2);

  // Gain Label with ROI in parentheses
  ctx.textAlign = "left";
  ctx.fillStyle = gainMuted;
  ctx.font = "700 26px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.gainLabel, 104, gainY + 54);

  // Large Gain Value
  ctx.fillStyle = gainAccent;
  ctx.font = "900 68px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.profitUsd + " USD", 104, gainY + 144);

  // Subtle Subtitle
  ctx.fillStyle = cardData.isPositiveProfit ? "#6EE7B7" : "#FDA4AF";
  ctx.font = "500 19px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Diferencial neto sobre monto de compra", 104, gainY + 198);

  // ── 9. Footer (Disclaimer & Canonical Link) ──
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font = "400 20px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Resultado estimado según las tasas mostradas.", width / 2, 1188);

  // Canonical Domain Badge
  const linkBadgeW = 380;
  const linkBadgeH = 48;
  const linkBadgeX = (width - linkBadgeW) / 2;
  const linkBadgeY = 1220;
  drawRoundedRect(ctx, linkBadgeX, linkBadgeY, linkBadgeW, linkBadgeH, 24, "#131D2D", "#26384F", 1.5);

  ctx.fillStyle = "#42F4D6";
  ctx.font = "700 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(cardData.canonicalDomain, width / 2, linkBadgeY + 33);
}

export function getShareCardBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== "function") {
      reject(new Error("Canvas toBlob is not supported"));
      return;
    }
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate image blob"));
    }, "image/png");
  });
}

export function createShareCardFile(blob) {
  if (typeof File !== "undefined") {
    try {
      return new File([blob], SHARE_CARD_FILENAME, { type: "image/png" });
    } catch {
      // Fallback if File constructor fails
    }
  }
  blob.name = SHARE_CARD_FILENAME;
  return blob;
}

export function downloadShareCard(canvas, filename = SHARE_CARD_FILENAME) {
  if (!canvas || typeof document === "undefined") return false;
  try {
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 150);
    return true;
  } catch {
    return false;
  }
}
