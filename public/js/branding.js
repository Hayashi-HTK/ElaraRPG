const BRAND_ICON_PNG = 'assets/icons/LogoElara2.png'
const BRAND_ICON_SVG = 'assets/icons/favicon-round.svg'
const BRAND_FAVICON_VER = '2'

function setFavicon() {
  const existing = Array.from(document.querySelectorAll(
    'link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"],link[rel="mask-icon"]'
  ))
  existing.forEach((n) => n.remove())

  const linkSvg = document.createElement('link');
  linkSvg.id = 'brand-favicon-svg';
  linkSvg.rel = 'icon';
  linkSvg.type = 'image/svg+xml';
  linkSvg.href = `${BRAND_ICON_SVG}?v=${encodeURIComponent(BRAND_FAVICON_VER)}`
  document.head.appendChild(linkSvg);

  const linkPng = document.createElement('link');
  linkPng.id = 'brand-favicon-png';
  linkPng.rel = 'icon';
  linkPng.type = 'image/png';
  linkPng.href = `${BRAND_ICON_PNG}?v=${encodeURIComponent(BRAND_FAVICON_VER)}`
  linkPng.sizes = '32x32';
  document.head.appendChild(linkPng);

  const linkShortcut = document.createElement('link')
  linkShortcut.id = 'brand-favicon-shortcut'
  linkShortcut.rel = 'shortcut icon'
  linkShortcut.type = 'image/png'
  linkShortcut.href = `${BRAND_ICON_PNG}?v=${encodeURIComponent(BRAND_FAVICON_VER)}`
  document.head.appendChild(linkShortcut)
}

function runBranding() {
  if (!document?.head) return;
  setFavicon();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runBranding);
} else {
  runBranding();
}
// css do favicon 
// link rel="icon" href="/assets/icons/LogoElara2.png" type="image/png">
