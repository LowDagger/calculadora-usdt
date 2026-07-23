export const CHANGELOG_STORAGE_KEY = 'calcuflow:last-seen-changelog';
export const CURRENT_CHANGELOG_VERSION = '2026.07.23';

export const CURRENT_CHANGELOG_RELEASE = Object.freeze({
  version: CURRENT_CHANGELOG_VERSION,
  dateLabel: '23 de julio de 2026',
  title: 'Perfiles bancarios',
  summary: 'Perfiles bancarios y mejoras recientes',
  changes: Object.freeze([
    'Selecciona tu banco y tipo de tarjeta.',
    'Edita o restaura las comisiones cuando lo necesites.',
    'Crea perfiles personalizados.',
    'Mejoras de usabilidad y compatibilidad.'
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
  if (topSummary) {
    topSummary.textContent = `Nuevo: ${CURRENT_CHANGELOG_RELEASE.summary.toLocaleLowerCase('es-VE')}`;
  }
  if (communitySummary) communitySummary.textContent = CURRENT_CHANGELOG_RELEASE.summary;
  if (topTrigger) {
    topTrigger.setAttribute(
      'aria-label',
      `Nueva actualización disponible: ${CURRENT_CHANGELOG_RELEASE.summary}. Ver novedades.`
    );
  }

  if (communityLink?.href) {
    telegramLink.href = communityLink.href;
  } else {
    telegramLink.hidden = true;
  }

  let isOpen = false;
  let seenThisSession = false;
  let activeTrigger = communityTrigger;

  const renderUnread = (unread = !seenThisSession
    && hasUnreadChangelog(readLastSeenChangelog(storage))) => {
    badge.hidden = !unread;
    if (topTrigger) topTrigger.hidden = !unread;
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
    topTrigger?.setAttribute('aria-expanded', 'true');
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
      topTrigger?.setAttribute('aria-expanded', 'false');
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
  topTrigger?.addEventListener('click', () => open(topTrigger));
  closeButton.addEventListener('click', close);
  panel.addEventListener('click', event => {
    if (event.target === panel) close();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) close();
  });

  return { open, close, renderUnread };
}
