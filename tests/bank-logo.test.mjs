import test from 'node:test';
import assert from 'node:assert/strict';

import { renderBankLogo } from '../js/bank-logo.js';

function createFakeElement(tagName = 'span') {
  const classes = new Set();
  const styles = new Map();
  const listeners = new Map();
  let children = [];
  let text = '';

  return {
    tagName: tagName.toUpperCase(),
    isConnected: false,
    attributes: {},
    classList: {
      add(...names) {
        names.forEach(name => classes.add(name));
      },
      remove(...names) {
        names.forEach(name => classes.delete(name));
      },
      contains(name) {
        return classes.has(name);
      }
    },
    style: {
      setProperty(name, value) {
        styles.set(name, String(value));
      },
      removeProperty(name) {
        styles.delete(name);
      },
      getPropertyValue(name) {
        return styles.get(name) || '';
      }
    },
    replaceChildren(...nextChildren) {
      children.forEach(child => {
        child.isConnected = false;
      });
      children = nextChildren;
      children.forEach(child => {
        child.isConnected = true;
      });
      text = '';
    },
    append(...nextChildren) {
      children.push(...nextChildren);
      nextChildren.forEach(child => {
        child.isConnected = true;
      });
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    get children() {
      return children;
    },
    get textContent() {
      return text;
    },
    set textContent(value) {
      children.forEach(child => {
        child.isConnected = false;
      });
      children = [];
      text = String(value);
    }
  };
}

const fakeDocument = {
  createElement(tagName) {
    return createFakeElement(tagName);
  }
};

test('uses decorative image semantics and falls back to initials on load failure', () => {
  const container = createFakeElement();
  const profile = {
    initials: 'BDV',
    icon: '/assets/banks/banco-de-venezuela.png',
    iconScale: 0.7,
    iconDarkFilter: null
  };

  renderBankLogo(container, profile, fakeDocument);
  const image = container.children[0];

  assert.equal(container.classList.contains('has-logo'), true);
  assert.equal(container.style.getPropertyValue('--bank-logo-scale'), '0.7');
  assert.equal(image.alt, '');
  assert.equal(image.width, 36);
  assert.equal(image.height, 36);

  image.dispatch('error');

  assert.equal(container.classList.contains('has-logo'), false);
  assert.equal(container.children.length, 0);
  assert.equal(container.textContent, 'BDV');
  assert.equal(container.style.getPropertyValue('--bank-logo-scale'), '');
});

test('uses the neutral symbol for the manual profile', () => {
  const container = createFakeElement();

  renderBankLogo(container, {
    initials: 'M',
    icon: null,
    iconSymbol: 'account_balance'
  }, fakeDocument);

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'account_balance');
  assert.equal(container.children[0].attributes['aria-hidden'], 'true');
});
