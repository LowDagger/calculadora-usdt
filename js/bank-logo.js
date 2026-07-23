function clearLogoPresentation(container) {
  container.classList.remove('has-logo');
  container.style.removeProperty('--bank-logo-scale');
  container.style.removeProperty('--bank-logo-dark-filter');
  container.replaceChildren();
}

export function renderBankLogoFallback(container, profile, documentRef = document, allowSymbol = true) {
  clearLogoPresentation(container);
  if (allowSymbol && profile.iconSymbol) {
    const symbol = documentRef.createElement('span');
    symbol.className = 'material-symbols-rounded bank-profile-neutral-icon';
    symbol.textContent = profile.iconSymbol;
    symbol.setAttribute('aria-hidden', 'true');
    container.append(symbol);
    return;
  }
  container.textContent = profile.initials;
}

export function renderBankLogo(container, profile, documentRef = document) {
  clearLogoPresentation(container);
  if (!profile.icon) {
    renderBankLogoFallback(container, profile, documentRef);
    return;
  }

  const image = documentRef.createElement('img');
  image.alt = '';
  image.width = 36;
  image.height = 36;
  image.decoding = 'async';
  image.addEventListener('error', () => {
    if (image.isConnected) renderBankLogoFallback(container, profile, documentRef, false);
  }, { once: true });
  image.src = profile.icon;
  container.classList.add('has-logo');
  container.style.setProperty('--bank-logo-scale', profile.iconScale || 0.80);
  if (profile.iconDarkFilter) {
    container.style.setProperty('--bank-logo-dark-filter', profile.iconDarkFilter);
  }
  container.append(image);
}
