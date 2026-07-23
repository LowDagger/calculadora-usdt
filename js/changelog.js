export const CHANGELOG_STORAGE_KEY = 'calcuflow:last-seen-changelog';
export const CURRENT_CHANGELOG_VERSION = '2026.07.23';

export const CURRENT_CHANGELOG_RELEASE = Object.freeze({
  version: CURRENT_CHANGELOG_VERSION,
  dateLabel: '23 de julio de 2026',
  title: 'Perfiles bancarios',
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
  const trigger = documentRef.getElementById('openChangelogBtn');
  const panel = documentRef.getElementById('changelogPanel');
  const closeButton = documentRef.getElementById('closeChangelogBtn');
  const badge = documentRef.getElementById('changelogBadge');
  const releaseMeta = documentRef.getElementById('changelogReleaseMeta');
  const releaseTitle = documentRef.getElementById('changelogReleaseTitle');
  const changesList = documentRef.getElementById('changelogChanges');
  const telegramText = documentRef.getElementById('changelogTelegramText');
  const telegramLink = documentRef.getElementById('changelogTelegramLink');
  const communityLink = documentRef.querySelector('.support-actions a[href*="telegram"]');

  if (!trigger || !panel || !closeButton || !badge || !releaseMeta || !releaseTitle
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

  if (communityLink?.href) {
    telegramLink.href = communityLink.href;
  } else {
    telegramLink.hidden = true;
  }

  badge.hidden = !hasUnreadChangelog(readLastSeenChangelog(storage));
  let isOpen = false;

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    panel.classList.remove('closing');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    badge.hidden = true;
    markChangelogSeen(storage);
    lockScroll();
    window.requestAnimationFrame(() => closeButton.focus());
  };

  const close = () => {
    if (!isOpen || panel.classList.contains('closing')) return;
    panel.classList.add('closing');
    window.setTimeout(() => {
      panel.classList.remove('open', 'closing');
      panel.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      isOpen = false;
      unlockScroll();
      trigger.focus();
    }, getCloseDuration());
  };

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  panel.addEventListener('click', event => {
    if (event.target === panel) close();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) close();
  });

  return { open, close };
}
