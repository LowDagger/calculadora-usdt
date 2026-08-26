import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const makeMockElement = () => ({
  style: {},
  classList: {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false
  },
  setAttribute: () => {},
  removeAttribute: () => {},
  addEventListener: () => {},
  click: () => {},
  offsetWidth: 0,
  textContent: ""
});

globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { appendChild: () => {}, removeChild: () => {} },
  createElement: makeMockElement
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { share: () => {}, clipboard: {} },
    configurable: true,
    writable: true
  });
} catch {
  // Ignore if already set
}

const {
  CANONICAL_SHARE_URL,
  CANONICAL_SHARE_DOMAIN,
  buildShareText,
  createShareController
} = await import("../js/share.js");

const {
  CARD_DIMENSIONS,
  SHARE_CARD_FILENAME,
  prepareShareCardData,
  renderShareCard
} = await import("../js/share-card.js");

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const share = readFileSync(new URL("../js/share.js", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../js/share-card.js", import.meta.url), "utf8");

test("canonical URL and domain are unified and consistent", () => {
  assert.equal(CANONICAL_SHARE_URL, "https://calcu-flow.vercel.app");
  assert.equal(CANONICAL_SHARE_DOMAIN, "calcu-flow.vercel.app");
  assert.match(html, /<link rel="canonical" href="https:\/\/calcu-flow\.vercel\.app\/" \/>/);
});

test("buildShareText formats Telegram/WhatsApp-friendly summary with positive and negative returns", () => {
  const positiveResult = {
    usdUsed: 500,
    vesNeeded: 318933.88,
    safeGateway: { bpayInputAmount: 512.82 },
    usdtFinal: 534.61,
    profitUsdt: 34.61,
    roi: 6.92,
    bcv: 622.31,
    bank: 631.64,
    p2p: 768.44
  };

  const positiveText = buildShareText(positiveResult, "Banco de Venezuela · Virtual · 2,50%");
  assert.match(positiveText, /CalcuFlow — Banco → USDT/);
  assert.match(positiveText, /Compra: 500,00 USD/);
  assert.match(positiveText, /Banco: Banco de Venezuela · Virtual · 2,50%/);
  assert.match(positiveText, /BCV: 622,31/);
  assert.match(positiveText, /Banco: 631,64/);
  assert.match(positiveText, /P2P: 768,44/);
  assert.match(positiveText, /Bs necesarios: 318\.933,88 Bs/);
  assert.match(positiveText, /Monto en BPay: 512,82 USD/);
  assert.match(positiveText, /USDT finales: 534,61 USDT/);
  assert.match(positiveText, /Ganancia estimada: \+34,61 USD/);
  assert.match(positiveText, /Retorno: \+6,92%/);
  assert.match(positiveText, /https:\/\/calcu-flow\.vercel\.app/);

  const negativeResult = {
    usdUsed: 100,
    vesNeeded: 65000,
    safeGateway: { bpayInputAmount: 102.5 },
    usdtFinal: 98.2,
    profitUsdt: -1.8,
    roi: -1.8,
    bcv: 620,
    bank: 630,
    p2p: 625
  };
  const negativeText = buildShareText(negativeResult, { name: "Banesco", cardType: "Física", fee: 1.5 });
  assert.match(negativeText, /Ganancia estimada: -1,80 USD/);
  assert.match(negativeText, /Retorno: -1,80%/);
});

test("markup includes accessible share bottom sheet with canvas preview and actions", () => {
  // Share modal shell
  assert.match(
    html,
    /<section class="modal-shell share-panel" id="sharePanel" role="dialog" aria-modal="true"\s+aria-labelledby="shareTitle" aria-hidden="true">/
  );
  assert.match(html, /<h2 class="modal-title" id="shareTitle">Compartir resultado<\/h2>/);
  assert.match(html, /id="closeShareBtn"[^>]*aria-label="Cerrar compartir resultado"/);

  // Canvas preview
  assert.match(
    html,
    /<canvas class="share-preview-canvas" id="sharePreviewCanvas" width="1080" height="1350" aria-hidden="true"><\/canvas>/
  );

  // Actions
  assert.match(html, /<button class="[^"]*share-action-btn" id="shareImageBtn" type="button">/);
  assert.match(html, /<button class="[^"]*share-action-btn" id="copySummaryBtn" type="button">/);
  assert.match(html, /<button class="[^"]*share-action-btn" id="saveImageBtn" type="button">/);
  assert.match(html, /<span>Compartir imagen<\/span>/);
  assert.match(html, /<span>Copiar resumen<\/span>/);
  assert.match(html, /<span>Guardar imagen<\/span>/);

  // Header trigger has accessibility attributes
  assert.match(html, /id="shareBtn"[^>]*aria-controls="sharePanel"[^>]*aria-haspopup="dialog"/);
});

test("share-card defines Bolívares necesarios as primary hero field and removes top subtitle", () => {
  assert.equal(CARD_DIMENSIONS.width, 1080);
  assert.equal(CARD_DIMENSIONS.height, 1350);
  assert.equal(CARD_DIMENSIONS.aspectRatio, "4/5");
  assert.equal(SHARE_CARD_FILENAME, "calcuflow-resultado.png");

  // Removed "Banco → USDT" top subtitle from share-card rendering
  assert.doesNotMatch(shareCard, /ctx\.fillText\("Banco → USDT"/);

  const result = {
    usdUsed: 500,
    vesNeeded: 318933.88,
    safeGateway: { bpayInputAmount: 512.82 },
    usdtFinal: 534.61,
    profitUsdt: 34.61,
    roi: 6.92,
    bcv: 622.31,
    bank: 631.64,
    p2p: 768.44
  };

  const bankProfile = {
    id: "bdv-virtual",
    name: "Banco de Venezuela",
    cardType: "Virtual",
    fee: 2.5,
    initials: "BDV",
    icon: "/assets/banks/banco-de-venezuela.png"
  };

  const cardData = prepareShareCardData(result, bankProfile);
  assert.equal(cardData.usdAmount, "500,00");
  assert.equal(cardData.bsNeeded, "318.933,88");
  assert.equal(cardData.bpayAmount, "512,82");
  assert.equal(cardData.finalUsdt, "534,61");
  assert.equal(cardData.profitUsd, "+34,61");
  assert.equal(cardData.roi, "+6,92");
  assert.equal(cardData.gainLabel, "Ganancia estimada (+6,92%)");
  assert.equal(cardData.bankChipLabel, "Banco de Venezuela (Virtual) · 2,5%");
});

test("renderShareCard uses required wording: Bolívares necesarios, BPay, USDT finales, and single gain block", async () => {
  const drawnOperations = [];
  const mockCtx = {
    beginPath: () => drawnOperations.push("beginPath"),
    moveTo: (x, y) => drawnOperations.push(`moveTo(${x},${y})`),
    lineTo: (x, y) => drawnOperations.push(`lineTo(${x},${y})`),
    arcTo: () => drawnOperations.push("arcTo"),
    closePath: () => drawnOperations.push("closePath"),
    fill: () => drawnOperations.push("fill"),
    stroke: () => drawnOperations.push("stroke"),
    fillRect: (x, y, w, h) => drawnOperations.push(`fillRect(${w}x${h})`),
    fillText: (text, x, y) => drawnOperations.push(`fillText(${text},${Math.round(x)},${Math.round(y)})`),
    measureText: (text) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    save: () => drawnOperations.push("save"),
    restore: () => drawnOperations.push("restore"),
    clip: () => drawnOperations.push("clip"),
    drawImage: () => drawnOperations.push("drawImage")
  };

  const mockCanvas = {
    getContext: () => mockCtx,
    width: 0,
    height: 0
  };

  const cardData = prepareShareCardData({
    usdUsed: 500,
    vesNeeded: 395728.60,
    safeGateway: { bpayInputAmount: 512.82 },
    usdtFinal: 534.61,
    profitUsdt: 48.68,
    roi: 11.61,
    bcv: 622.31,
    bank: 631.64,
    p2p: 768.44
  }, {
    name: "Otro banco / Manual",
    cardType: "",
    fee: 2.5,
    initials: "MAN",
    icon: null
  });

  await renderShareCard(mockCanvas, cardData);
  assert.equal(mockCanvas.width, 1080);
  assert.equal(mockCanvas.height, 1350);

  // Exact required wording checks
  assert.ok(drawnOperations.some(op => op.includes("fillText(Bolívares necesarios")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(395.728,60 Bs")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(Monto a colocar en BPay")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(USDT finales obtenidos")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(Ganancia estimada (+11,61%)")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(+48,68 USD")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(Otro banco / Manual · 2,5%")));
  assert.ok(drawnOperations.some(op => op.includes("fillText(calcu-flow.vercel.app")));

  // Verify separate right-side Retorno (ROI) block header was removed
  assert.ok(!drawnOperations.some(op => op.includes("fillText(Retorno (ROI)")));
});

test("createShareController pre-renders image upon open and invalidates on update", async () => {
  let opened = false;
  let closed = false;

  const mockBlob = new Blob(["mock-png"], { type: "image/png" });
  const mockCanvas = {
    getContext: () => ({
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: (text) => ({ width: text.length * 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      clip: () => {},
      drawImage: () => {}
    }),
    width: 0,
    height: 0,
    toBlob: (cb) => cb(mockBlob)
  };

  const listeners = {};
  const mockBtn = (name) => ({
    addEventListener: (type, handler) => { listeners[`${name}_${type}`] = handler; }
  });

  const controller = createShareController({
    panel: {},
    closeButton: mockBtn("close"),
    previewCanvas: mockCanvas,
    shareImageBtn: mockBtn("shareImage"),
    copySummaryBtn: mockBtn("copySummary"),
    saveImageBtn: mockBtn("saveImage"),
    calculate: () => ({
      usdUsed: 500,
      vesNeeded: 318933.88,
      safeGateway: { bpayInputAmount: 512.82 },
      usdtFinal: 534.61,
      profitUsdt: 34.61,
      roi: 6.92,
      bcv: 622.31,
      bank: 631.64,
      p2p: 768.44
    }),
    getBankProfile: () => ({
      name: "Banco de Venezuela",
      cardType: "Virtual",
      fee: 2.5
    }),
    openModal: () => { opened = true; },
    closeModal: () => { closed = true; },
    flashButton: () => {}
  });

  assert.equal(opened, false);
  assert.equal(controller.getPreparedFile(), null);

  // Calling open() starts preparation immediately
  controller.open();
  assert.equal(opened, true);

  await new Promise(r => setTimeout(r, 20));
  assert.ok(controller.getPreparedFile() !== null, "File is pre-rendered and ready in memory before share action");

  controller.dismiss();
  assert.equal(closed, true);
});

test("handles Web Share with files, fallback saving, and silent AbortError", async () => {
  let sharedPayload = null;

  const mockBlob = new Blob(["mock-data"], { type: "image/png" });
  const mockCanvas = {
    getContext: () => ({
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: (text) => ({ width: text.length * 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      clip: () => {},
      drawImage: () => {}
    }),
    toBlob: (cb) => cb(mockBlob),
    toDataURL: () => "data:image/png;base64,mock"
  };

  const listeners = {};
  const mockBtn = (name) => ({
    addEventListener: (type, handler) => { listeners[`${name}_${type}`] = handler; }
  });

  globalThis.navigator.canShare = ({ files }) => Boolean(files && files.length > 0);
  globalThis.navigator.share = async (payload) => { sharedPayload = payload; };

  const controller = createShareController({
    panel: {},
    closeButton: mockBtn("close"),
    previewCanvas: mockCanvas,
    shareImageBtn: mockBtn("shareImage"),
    copySummaryBtn: mockBtn("copySummary"),
    saveImageBtn: mockBtn("saveImage"),
    calculate: () => ({
      usdUsed: 500,
      vesNeeded: 318933.88,
      safeGateway: { bpayInputAmount: 512.82 },
      usdtFinal: 534.61,
      profitUsdt: 34.61,
      roi: 6.92,
      bcv: 622.31,
      bank: 631.64,
      p2p: 768.44
    }),
    getBankProfile: () => ({
      name: "Banco de Venezuela",
      cardType: "Virtual",
      fee: 2.5
    }),
    openModal: () => {},
    closeModal: () => {},
    flashButton: () => {}
  });

  await controller.handleShareImage();
  assert.ok(sharedPayload !== null);
  assert.ok(sharedPayload.files && sharedPayload.files.length === 1);
  assert.equal(sharedPayload.title, "CalcuFlow");

  // AbortError is caught silently without throw
  globalThis.navigator.share = async () => {
    const abortErr = new Error("User canceled");
    abortErr.name = "AbortError";
    throw abortErr;
  };
  await assert.doesNotReject(async () => {
    await controller.handleShareImage();
  });
});

test("CSS styles share modal and preview container responsively", () => {
  assert.match(css, /\.share-panel\s*\{[\s\S]*?z-index:\s*110;/);
  assert.match(css, /\.share-preview-wrap\s*\{[\s\S]*?aspect-ratio:\s*4\s*\/\s*5;/);
  assert.match(css, /\.share-preview-canvas\s*\{[\s\S]*?object-fit:\s*contain;/);
  assert.match(css, /\.share-actions-subgrid\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr;/);
});
