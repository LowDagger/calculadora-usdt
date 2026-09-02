export const DEFAULT_TELEGRAM_CAMPAIGN = Object.freeze({
  enabled: true,
  campaignId: 'telegram-community-2026-09',
  endsAt: '2026-10-17T00:00:00.000Z'
});

export function getPromoDismissalKey(campaignId) {
  if (!campaignId || typeof campaignId !== 'string') return '';
  return `calcuflow.telegramCommunityPromo.${campaignId.trim()}`;
}

export function isCampaignDismissed(campaignId, storage = globalThis.localStorage) {
  const key = getPromoDismissalKey(campaignId);
  if (!key || !storage) return false;
  try {
    return Boolean(storage.getItem(key));
  } catch {
    return false;
  }
}

export function dismissCampaign(campaignId, storage = globalThis.localStorage) {
  const key = getPromoDismissalKey(campaignId);
  if (!key || !storage) return false;
  try {
    storage.setItem(key, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function isCampaignEligible({
  promoConfig,
  now = new Date(),
  storage = globalThis.localStorage,
  hasActiveModal = false,
  isInputFocused = false
} = {}) {
  if (!promoConfig || typeof promoConfig !== 'object' || Array.isArray(promoConfig)) return false;
  if (promoConfig.enabled !== true) return false;
  if (typeof promoConfig.campaignId !== 'string') return false;
  const campaignId = promoConfig.campaignId.trim();
  if (!campaignId) return false;

  const endsAtStr = promoConfig.endsAt || promoConfig.campaignEndsAt;
  if (typeof endsAtStr !== 'string' || !endsAtStr.trim()) return false;
  const endsAtMs = Date.parse(endsAtStr);
  if (!Number.isFinite(endsAtMs)) return false;

  const nowMs = now instanceof Date
    ? now.getTime()
    : (typeof now === 'number' ? now : Date.parse(now));
  if (!Number.isFinite(nowMs)) return false;

  // Global campaign window: at or after endsAt -> hidden
  if (nowMs >= endsAtMs) return false;

  // Single browser/user dismissal
  if (isCampaignDismissed(campaignId, storage)) return false;

  // Do not stack dialogs or interrupt active typing
  if (hasActiveModal || isInputFocused) return false;

  return true;
}

export function createCommunityPromoController({
  modal,
  closeButton,
  ctaButton,
  getPromoConfig = () => DEFAULT_TELEGRAM_CAMPAIGN,
  getStorage = () => globalThis.localStorage,
  openModal,
  closeModal,
  isInputFocused = () => false,
  hasActiveModal = () => false
}) {
  let promoFocusOrigin = null;

  const getConfig = () => {
    const config = getPromoConfig();
    return config && typeof config === 'object' ? config : DEFAULT_TELEGRAM_CAMPAIGN;
  };

  const show = () => {
    if (!modal || modal.classList.contains('open') || modal.classList.contains('closing')) return false;

    const config = getConfig();
    const storage = getStorage();
    const eligible = isCampaignEligible({
      promoConfig: config,
      now: new Date(),
      storage,
      hasActiveModal: hasActiveModal(),
      isInputFocused: isInputFocused()
    });

    if (!eligible) return false;

    promoFocusOrigin = (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      ? document.activeElement
      : null;
    openModal();
    const focusTarget = ctaButton || closeButton;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (modal?.classList?.contains('open')) focusTarget?.focus?.();
      });
    } else {
      setTimeout(() => {
        if (modal?.classList?.contains('open')) focusTarget?.focus?.();
      }, 0);
    }
    return true;
  };

  const dismiss = () => {
    if (!modal || !modal?.classList?.contains('open') || modal?.classList?.contains('closing')) return;
    const config = getConfig();
    if (config?.campaignId) {
      dismissCampaign(config.campaignId, getStorage());
    }
    closeModal();
    const restoreDelay = (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 250;
    setTimeout(() => {
      if (typeof document !== 'undefined' && promoFocusOrigin && document.contains(promoFocusOrigin)) {
        promoFocusOrigin.focus?.();
      }
      promoFocusOrigin = null;
    }, restoreDelay);
  };

  if (typeof closeButton?.addEventListener === 'function') {
    closeButton.addEventListener('click', dismiss);
  }
  if (typeof ctaButton?.addEventListener === 'function') {
    ctaButton.addEventListener('click', () => {
      dismiss();
    });
  }
  if (typeof modal?.addEventListener === 'function') {
    modal.addEventListener('click', event => {
      if (event.target === modal) dismiss();
    });
  }

  return { show, dismiss, getConfig };
}
