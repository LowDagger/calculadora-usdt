export const CHANGELOG_STORAGE_KEY = 'calcuflow:last-seen-changelog';
export const CURRENT_CHANGELOG_VERSION = '2026.08.08';
export const FEATURE_ANNOUNCEMENT_STORAGE_KEY = 'calcuflow:last-seen-announcement';
export const V1_POLISH_ANNOUNCEMENT_ID = 'v1-polish-2026-08';

export const CURRENT_CHANGELOG_RELEASE = Object.freeze({
  version: CURRENT_CHANGELOG_VERSION,
  dateLabel: '8 de agosto de 2026',
  title: 'CalcuFlow más rápido y práctico',
  summary: 'Mejoramos las tasas, bancos, montos rápidos y varias formas de calcular.',
  changes: Object.freeze([
    'Las tasas ahora son más compactas y muestran claramente la diferencia entre BCV/Banco y P2P.',
    'Puedes editar rápidamente las tasas BCV y P2P para hacer simulaciones.',
    'Al actualizar las tasas puedes volver fácilmente a los valores actuales.',
    'Mejoramos la selección y administración de perfiles bancarios.',
    'Ahora puedes personalizar los montos rápidos para cada banco.',
    'Puedes calcular directamente desde los bolívares que tienes disponibles.',
    'Reorganizamos la configuración y mejoramos la experiencia general en teléfonos.'
  ]),
  telegramText:
    '¿Tienes una idea o encontraste algo que podemos mejorar? Cuéntanos en Telegram.'
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

export function markAnnouncementSeen(storage, announcementId = V1_POLISH_ANNOUNCEMENT_ID) {
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
  unlockScroll = () => {}
} = {}) {
  const communityTrigger = documentRef.getElementById('openChangelogBtn');
  const topTrigger = documentRef.getElementById('openTopChangelogBtn');
  const viewAnnouncementButton = documentRef.getElementById('viewLatestAnnouncementBtn');
  const dismissAnnouncementButton = documentRef.getElementById('dismissLatestAnnouncementBtn');
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

  if (!communityTrigger || !panel || !closeButton || !badge || !releaseMeta || !releaseTitle
      || !changesList || !telegramText || !telegramLink) {
    return null;
  }

  releaseMeta.textContent = CURRENT_CHANGELOG_RELEASE.dateLabel;
  releaseTitle.textContent = CURRENT_CHANGELOG_RELEASE.title;
  changesList.replaceChildren(
    ...CURRENT_CHANGELOG_RELEASE.changes.map(change => {
      const item = documentRef.createElement('li');
      item.textContent = change;
      return item;
    })
  );
  telegramText.textContent = CURRENT_CHANGELOG_RELEASE.telegramText;
  if (topSummary) topSummary.textContent = CURRENT_CHANGELOG_RELEASE.title;
  if (communitySummary) communitySummary.textContent = CURRENT_CHANGELOG_RELEASE.summary;
  if (topTrigger?.dataset) topTrigger.dataset.announcementId = V1_POLISH_ANNOUNCEMENT_ID;
  telegramLink.href = 'https://t.me/CalcuFlow';

  let isOpen = false;
  let seenThisSession = false;
  let announcementSeenThisSession = false;
  let activeTrigger = communityTrigger;

  const hasUnreadAnnouncement = () => !announcementSeenThisSession
    && readLastSeenAnnouncement(storage) !== V1_POLISH_ANNOUNCEMENT_ID;
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
    viewAnnouncementButton?.setAttribute('aria-expanded', 'true');
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
      viewAnnouncementButton?.setAttribute('aria-expanded', 'false');
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
  viewAnnouncementButton?.addEventListener('click', () => {
    announcementSeenThisSession = true;
    markAnnouncementSeen(storage);
    open(viewAnnouncementButton);
  });
  dismissAnnouncementButton?.addEventListener('click', () => {
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
