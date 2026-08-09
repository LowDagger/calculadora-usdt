const modalFocusOrigins = new WeakMap();

export function openManagedModal(panel, trigger, openFn, initialFocus, returnFocus = null, focusDelay = 0) {
  const origin = returnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : trigger);
  modalFocusOrigins.set(panel, origin);
  openFn();
  trigger.setAttribute('aria-expanded', 'true');
  const focusTarget = initialFocus || panel.querySelector('.modal-close');
  const focusPanel = () => {
    if (panel.classList.contains('open')) focusTarget?.focus();
  };
  if (focusDelay > 0) setTimeout(focusPanel, focusDelay);
  else requestAnimationFrame(focusPanel);
}

export function closeManagedModal(panel, trigger, closeFn) {
  if (!panel.classList.contains('open') || panel.classList.contains('closing')) return;
  closeFn();
  trigger.setAttribute('aria-expanded', 'false');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  setTimeout(() => {
    const origin = modalFocusOrigins.get(panel);
    if (origin && document.contains(origin)) origin.focus();
    modalFocusOrigins.delete(panel);
  }, duration);
}

export function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const panel = document.querySelector('.modal-shell.open, .install-prompt.show');
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(element => element.offsetParent !== null);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!panel.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function createCommunityModalController({ panel, closeButton, settingsPanel, triggers, openModal, closeModal }) {
  let activeTrigger = triggers[0] || null;
  let settingsObscured = false;

  const show = trigger => {
    activeTrigger = trigger;
    settingsObscured = trigger.id === 'openCommunitySettingsBtn' && settingsPanel.classList.contains('open');
    if (settingsObscured) {
      settingsPanel.setAttribute('aria-hidden', 'true');
      settingsPanel.setAttribute('inert', '');
    }
    openManagedModal(panel, trigger, openModal, closeButton);
  };

  const dismiss = () => {
    if (!activeTrigger || !panel.classList.contains('open') || panel.classList.contains('closing')) return;
    if (settingsObscured) {
      const restoreDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
      setTimeout(() => {
        settingsPanel.setAttribute('aria-hidden', 'false');
        settingsPanel.removeAttribute('inert');
      }, restoreDelay);
    }
    closeManagedModal(panel, activeTrigger, closeModal);
    settingsObscured = false;
  };

  triggers.forEach(trigger => trigger.addEventListener('click', () => show(trigger)));
  closeButton?.addEventListener('click', dismiss);
  panel?.addEventListener('click', event => {
    if (event.target === panel) dismiss();
  });

  return { show, dismiss };
}
