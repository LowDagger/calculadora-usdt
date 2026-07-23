import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANGELOG_STORAGE_KEY,
  CURRENT_CHANGELOG_RELEASE,
  CURRENT_CHANGELOG_VERSION,
  hasUnreadChangelog,
  markChangelogSeen,
  readLastSeenChangelog
} from '../js/changelog.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test('shows the badge until the current changelog version is seen', () => {
  assert.equal(hasUnreadChangelog(null), true);
  assert.equal(hasUnreadChangelog('older-version'), true);
  assert.equal(hasUnreadChangelog(CURRENT_CHANGELOG_VERSION), false);
});

test('stores and reads only the current viewed version', () => {
  const storage = memoryStorage();

  assert.equal(readLastSeenChangelog(storage), null);
  assert.equal(markChangelogSeen(storage), true);
  assert.equal(readLastSeenChangelog(storage), CURRENT_CHANGELOG_VERSION);
  assert.equal(
    storage.getItem(CHANGELOG_STORAGE_KEY),
    CURRENT_CHANGELOG_VERSION
  );
});

test('continues safely when localStorage throws', () => {
  const unavailableStorage = {
    getItem() {
      throw new Error('Storage unavailable');
    },
    setItem() {
      throw new Error('Storage unavailable');
    }
  };

  assert.equal(readLastSeenChangelog(unavailableStorage), null);
  assert.equal(markChangelogSeen(unavailableStorage), false);
  assert.equal(hasUnreadChangelog(readLastSeenChangelog(unavailableStorage)), true);
});

test('keeps the release content in one updateable data object', () => {
  assert.equal(CURRENT_CHANGELOG_RELEASE.version, CURRENT_CHANGELOG_VERSION);
  assert.equal(CURRENT_CHANGELOG_RELEASE.title, 'Perfiles bancarios');
  assert.deepEqual(CURRENT_CHANGELOG_RELEASE.changes, [
    'Selecciona tu banco y tipo de tarjeta.',
    'Edita o restaura las comisiones cuando lo necesites.',
    'Crea perfiles personalizados.',
    'Mejoras de usabilidad y compatibilidad.'
  ]);
});
