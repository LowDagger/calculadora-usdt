export const CHANGELOG_STORAGE_KEY = 'calcuflow:last-seen-changelog';
export const CURRENT_CHANGELOG_VERSION = '2026.07.23';
export const FEATURE_ANNOUNCEMENT_STORAGE_KEY = 'calcuflow:last-seen-announcement';
export const QUICK_AMOUNTS_ANNOUNCEMENT_ID = 'bank-quick-amounts-v1';

export const CURRENT_CHANGELOG_RELEASE = Object.freeze({
  version: CURRENT_CHANGELOG_VERSION,
  dateLabel: '23 de julio de 2026',
  title: 'Perfiles bancarios',
  summary: 'Perfiles bancarios y mejoras recientes',
  changes: Object.freeze([
    'Montos rápidos por banco: elige los botones que quieres tener a mano para cada perfil.',
    'Selecciona tu banco y tipo de tarjeta.',
    'Edita o restaura las comisiones cuando lo necesites.',
    'Crea perfiles personalizados.',
    'Cómo funciona: abre Configuración, entra en Perfiles bancarios, toca el lápiz del banco, abre Montos rápidos, selecciona “Personalizar para este banco”, escribe hasta cuatro montos y guarda. Cuando cambies de banco, la calculadora mostrará automáticamente los montos guardados para ese perfil. Los cambios se guardan únicamente en este dispositivo y puedes modificarlos cuando quieras.'
  ]),
  telegramText:
    'CalcuFlow es desarrollado y mantenido por una sola persona. ¿Encontraste un error o tienes una idea que realmente mejoraría la calculadora? Únete al grupo de Telegram y cuéntamela.'
});

export function hasUnreadChangelog(lastSeenVersion, currentVersion = CURRENT_CHANGELOG_VERSION) {
  return lastSeenVersion !== currentVersion;
}

export function readLastSeenChangelog(storage) {
  try {
    return storage?.getItem(CHANGELOG_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function markChangelogSeen(storage, version = CURRENT_CHANGELOG_VERSION) {
  try {
    storage?.setItem(CHANGELOG_STORAGE_KEY, version);
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function readLastSeenAnnouncement(storage) {
  try {
    return storage?.getItem(FEATURE_ANNOUNCEMENT_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function markAnnouncementSeen(storage, announcementId = QUICK_AMOUNTS_ANNOUNCEMENT_ID) {
  try {
    storage?.setItem(FEATURE_ANNOUNCEMENT_STORAGE_KEY, announcementId);
    return Boolean(storage);
  } catch {
    return false;
  }
}

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getCloseDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
}

export function initChangelog({
  documentRef = document,
  storage = getBrowserStorage(),
  lockScroll = () => {},
  unlockScroll = () => {},
  onConfigureQuickAmounts = () => {}
} = {}) {
  const communityTrigger = documentRef.getElementById('openChangelogBtn');
  const topTrigger = documentRef.getElementById('openTopChangelogBtn');
  const configureQuickAmountsButton = documentRef.getElementById('configureQuickAmountsAnnouncementBtn');
  const learnQuickAmountsButton = documentRef.getElementById('learnQuickAmountsAnnouncementBtn');
  const dismissQuickAmountsButton = documentRef.getElementById('dismissQuickAmountsAnnouncementBtn');
  const panel = documentRef.getElementById('changelogPanel');
  const closeButton = documentRef.getElementById('closeChangelogBtn');
  const badge = documentRef.getElementById('changelogBadge');
  const topSummary = documentRef.getElementById('topChangelogSummary');
  const communitySummary = documentRef.getElementById('communityChangelogSummary');
  const topFocusFallback = documentRef.getElementById('mainCalculator');
  const releaseMeta = documentRef.getElementById('changelogReleaseMeta');
  const releaseTitle = documentRef.getElementById('changelogReleaseTitle');
  const changesList = documentRef.getElementById('changelogChanges');
  const telegramText = documentRef.getElementById('changelogTelegramText');
  const telegramLink = documentRef.getElementById('changelogTelegramLink');
  const communityLink = documentRef.querySelector('.support-actions a[href*="telegram"]');

  if (!communityTrigger || !panel || !closeButton || !badge || !releaseMeta || !releaseTitle
      || !changesList || !telegramText || !telegramLink) {
    return null;
  }

  releaseMeta.textContent = `${CURRENT_CHANGELOG_RELEASE.dateLabel} · Versión ${CURRENT_CHANGELOG_RELEASE.version}`;
  releaseTitle.textContent = CURRENT_CHANGELOG_RELEASE.title;
  changesList.replaceChildren(
    ...CURRENT_CHANGELOG_RELEASE.changes.map(change => {
      const item = documentRef.createElement('li');
      item.textContent = change;
      return item;
    })
  );
  telegramText.textContent = CURRENT_CHANGELOG_RELEASE.telegramText;
  if (topSummary) topSummary.textContent = 'Montos rápidos para cada banco';
  if (communitySummary) communitySummary.textContent = CURRENT_CHANGELOG_RELEASE.summary;
  if (topTrigger?.dataset) topTrigger.dataset.announcementId = QUICK_AMOUNTS_ANNOUNCEMENT_ID;

  if (communityLink?.href) {
    telegramLink.href = communityLink.href;
  } else {
    telegramLink.hidden = true;
  }

  let isOpen = false;
  let seenThisSession = false;
  let announcementSeenThisSession = false;
  let activeTrigger = communityTrigger;

  const hasUnreadAnnouncement = () => !announcementSeenThisSession
    && readLastSeenAnnouncement(storage) !== QUICK_AMOUNTS_ANNOUNCEMENT_ID;
  const renderUnread = (unread = !seenThisSession
    && (hasUnreadChangelog(readLastSeenChangelog(storage)) || hasUnreadAnnouncement())) => {
    badge.hidden = !unread;
    if (topTrigger) topTrigger.hidden = !hasUnreadAnnouncement();
  };

  renderUnread();

  const open = (sourceTrigger = communityTrigger) => {
    if (isOpen) return;
    isOpen = true;
    activeTrigger = sourceTrigger;
    panel.classList.remove('closing');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    communityTrigger.setAttribute('aria-expanded', 'true');
    learnQuickAmountsButton?.setAttribute('aria-expanded', 'true');
    seenThisSession = true;
    markChangelogSeen(storage);
    renderUnread(false);
    lockScroll();
    window.requestAnimationFrame(() => closeButton.focus());
  };

  const close = () => {
    if (!isOpen || panel.classList.contains('closing')) return;
    panel.classList.add('closing');
    window.setTimeout(() => {
      panel.classList.remove('open', 'closing');
      panel.setAttribute('aria-hidden', 'true');
      communityTrigger.setAttribute('aria-expanded', 'false');
      learnQuickAmountsButton?.setAttribute('aria-expanded', 'false');
      isOpen = false;
      unlockScroll();
      const focusTarget = activeTrigger === topTrigger
        ? topFocusFallback
        : activeTrigger;
      if (focusTarget && !focusTarget.hidden && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      } else {
        communityTrigger.focus();
      }
    }, getCloseDuration());
  };

  communityTrigger.addEventListener('click', () => open(communityTrigger));
  configureQuickAmountsButton?.addEventListener('click', () => {
    seenThisSession = true;
    announcementSeenThisSession = true;
    markAnnouncementSeen(storage);
    renderUnread();
    onConfigureQuickAmounts();
  });
  learnQuickAmountsButton?.addEventListener('click', () => {
    announcementSeenThisSession = true;
    markAnnouncementSeen(storage);
    open(learnQuickAmountsButton);
  });
  dismissQuickAmountsButton?.addEventListener('click', () => {
    seenThisSession = true;
    announcementSeenThisSession = true;
    markAnnouncementSeen(storage);
    renderUnread();
    topFocusFallback?.focus();
  });
  closeButton.addEventListener('click', close);
  panel.addEventListener('click', event => {
    if (event.target === panel) close();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) close();
  });

  return { open, close, renderUnread };
}
