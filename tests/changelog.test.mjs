import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANGELOG_STORAGE_KEY,
  CURRENT_CHANGELOG_RELEASE,
  CURRENT_CHANGELOG_VERSION,
  hasUnreadChangelog,
  initChangelog,
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

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach(value => this.values.add(value));
  }

  remove(...values) {
    values.forEach(value => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(id, documentRef) {
    this.id = id;
    this.documentRef = documentRef;
    this.hidden = false;
    this.href = '';
    this.textContent = '';
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    for (const listener of this.listeners.get('click') || []) {
      listener({ target: this, currentTarget: this });
    }
  }

  focus() {
    this.documentRef.activeElement = this;
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

function changelogDocument() {
  const documentRef = {
    activeElement: null,
    elements: new Map(),
    getElementById(id) {
      return this.elements.get(id) || null;
    },
    createElement() {
      return new FakeElement('', this);
    },
    querySelector(selector) {
      return selector.includes('telegram') ? this.communityLink : null;
    }
  };

  [
    'openChangelogBtn',
    'openTopChangelogBtn',
    'changelogPanel',
    'closeChangelogBtn',
    'changelogBadge',
    'topChangelogSummary',
    'communityChangelogSummary',
    'mainCalculator',
    'changelogReleaseMeta',
    'changelogReleaseTitle',
    'changelogChanges',
    'changelogTelegramText',
    'changelogTelegramLink'
  ].forEach(id => documentRef.elements.set(id, new FakeElement(id, documentRef)));
  documentRef.communityLink = new FakeElement('communityTelegram', documentRef);
  documentRef.communityLink.href = 'https://telegram.me/CalcuFlow';
  return documentRef;
}

test('shows the badge until the current changelog version is seen', () => {
  assert.equal(hasUnreadChangelog(null), true);
  assert.equal(hasUnreadChangelog('older-version'), true);
  assert.equal(hasUnreadChangelog(CURRENT_CHANGELOG_VERSION), false);
  assert.equal(hasUnreadChangelog(CURRENT_CHANGELOG_VERSION, 'next-version'), true);
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
  assert.equal(CURRENT_CHANGELOG_RELEASE.summary, 'Perfiles bancarios y mejoras recientes');
  assert.deepEqual(CURRENT_CHANGELOG_RELEASE.changes, [
    'Selecciona tu banco y tipo de tarjeta.',
    'Edita o restaura las comisiones cuando lo necesites.',
    'Crea perfiles personalizados.',
    'Mejoras de usabilidad y compatibilidad.'
  ]);
});

test('shares unread state and one dialog between both changelog triggers', () => {
  const originalWindow = globalThis.window;
  const windowListeners = new Map();
  globalThis.window = {
    localStorage: null,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: callback => callback(),
    setTimeout: callback => callback(),
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    }
  };

  try {
    const storage = memoryStorage();
    const documentRef = changelogDocument();
    let lockCount = 0;
    let unlockCount = 0;
    initChangelog({
      documentRef,
      storage,
      lockScroll: () => { lockCount += 1; },
      unlockScroll: () => { unlockCount += 1; }
    });

    const topTrigger = documentRef.getElementById('openTopChangelogBtn');
    const communityTrigger = documentRef.getElementById('openChangelogBtn');
    const badge = documentRef.getElementById('changelogBadge');
    const panel = documentRef.getElementById('changelogPanel');
    const closeButton = documentRef.getElementById('closeChangelogBtn');
    const calculator = documentRef.getElementById('mainCalculator');

    assert.equal(topTrigger.hidden, false);
    assert.equal(badge.hidden, false);
    topTrigger.click();
    assert.equal(panel.classList.contains('open'), true);
    assert.equal(topTrigger.hidden, true);
    assert.equal(badge.hidden, true);
    assert.equal(readLastSeenChangelog(storage), CURRENT_CHANGELOG_VERSION);
    assert.equal(documentRef.activeElement, closeButton);
    assert.equal(lockCount, 1);

    closeButton.click();
    assert.equal(panel.classList.contains('open'), false);
    assert.equal(documentRef.activeElement, calculator);
    assert.equal(unlockCount, 1);

    communityTrigger.click();
    assert.equal(panel.classList.contains('open'), true);
    closeButton.click();
    assert.equal(documentRef.activeElement, communityTrigger);
    assert.equal(topTrigger.hidden, true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('hides the top row for the session even when localStorage writes fail', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: null,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: callback => callback(),
    setTimeout: callback => callback(),
    addEventListener() {}
  };

  try {
    const documentRef = changelogDocument();
    const unavailableStorage = {
      getItem() {
        throw new Error('Storage unavailable');
      },
      setItem() {
        throw new Error('Storage unavailable');
      }
    };
    initChangelog({ documentRef, storage: unavailableStorage });
    const topTrigger = documentRef.getElementById('openTopChangelogBtn');

    assert.equal(topTrigger.hidden, false);
    topTrigger.click();
    assert.equal(topTrigger.hidden, true);
    assert.equal(documentRef.getElementById('changelogPanel').classList.contains('open'), true);
  } finally {
    globalThis.window = originalWindow;
  }
});
