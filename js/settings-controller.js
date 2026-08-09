import { closeSettings, openSettings } from './ui.js';
import { closeManagedModal, openManagedModal } from './modal-controller.js';

export function applyTheme(theme) {
  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'system') {
    document.documentElement.dataset.theme = systemIsDark ? 'dark' : 'light';
  } else if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  }
  updateStatusBarColor();
}

export function updateThemeUI(theme) {
  const container = document.getElementById('themeSelector');
  if (!container) return;
  container.querySelectorAll('.segment-btn').forEach(btn => {
    const isActive = btn.dataset.themeVal === theme;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.classList.toggle('active', isActive);
  });
}

export function updateStatusBarColor() {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) return;
  const isLight = document.documentElement.dataset.theme === 'light';
  metaThemeColor.setAttribute('content', isLight ? '#F5F7FA' : '#0F1115');
}

export function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'system';
  applyTheme(currentTheme);
  updateThemeUI(currentTheme);

  const container = document.getElementById('themeSelector');
  if (container) {
    container.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.themeVal;
        applyTheme(val);
        updateThemeUI(val);
        localStorage.setItem('theme', val);
      });
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('theme') || 'system') === 'system') applyTheme('system');
  });
}

export function createSettingsController({ elements, manageButton, onManageBankProfiles }) {
  const show = () => {
    openManagedModal(elements.settingsPanel, elements.openSettingsBtn, openSettings, elements.closeSettingsBtn);
  };
  const dismiss = () => closeManagedModal(elements.settingsPanel, elements.openSettingsBtn, closeSettings);

  elements.openSettingsBtn.addEventListener('click', show);
  elements.closeSettingsBtn.addEventListener('click', dismiss);
  elements.settingsPanel.addEventListener('click', event => {
    if (event.target === elements.settingsPanel) dismiss();
  });
  manageButton.addEventListener('click', () => {
    dismiss();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 270;
    setTimeout(onManageBankProfiles, duration);
  });

  return { show, dismiss };
}
