const STANDBY_TIMEOUT_MS = 100000;

function ensureStandbyStyles() {
  if (document.getElementById('standby-styles')) return;

  if (!document.querySelector('link[href*="font-awesome"],link[href*="fontawesome"],link[href*="cdnjs.cloudflare.com/ajax/libs/font-awesome"]')) {
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
    document.head.appendChild(faLink);
  }

  const style = document.createElement('style');
  style.id = 'standby-styles';
  style.textContent = `
    .standby-overlay{position:fixed;inset:0;background:rgba(10, 10, 15, 1);backdrop-filter:blur(8px);z-index:100000;display:flex;justify-content:center;align-items:center;opacity:0;pointer-events:none;transition:opacity 1s ease-in-out}
    .standby-overlay.active{opacity:1;pointer-events:all}
    .standby-glow{position:absolute;width:300px;height:300px;background: radial-gradient(circle, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0) 70%);border-radius:50%;animation:pulseGlow 4s ease-in-out infinite alternate}
    .standby-dragon{font-size:6rem;color: #ffd700;text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);animation:slowRotate 20s linear infinite;position:relative;z-index:2}
    .standby-dragon i{filter:drop-shadow(0 0 5px rgba(107, 70, 70, 0.3))}
    @keyframes pulseGlow{0%{transform:scale(.8);opacity:.5}100%{transform:scale(1.5);opacity:1}}
    @keyframes slowRotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function ensureStandbyOverlay() {
  let overlay = document.getElementById('standby-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'standby-overlay';
  overlay.className = 'standby-overlay';
  overlay.innerHTML = `
    <div class="standby-glow"></div>
    <div class="standby-dragon">
      <i class="fas fa-dragon"></i>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function initStandby() {
  if (!document?.body) return;
  if (window.location.pathname.endsWith('/session.html') || window.location.pathname.endsWith('\\session.html') || window.location.pathname.endsWith('session.html')) return;
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const view = String(params.get('view') || '').trim();
    if (view === 'iframe' || view === 'true') return;
  } catch {}

  ensureStandbyStyles();
  const overlay = ensureStandbyOverlay();
  if (overlay.dataset.standbyInit === '1') return;
  overlay.dataset.standbyInit = '1';

  let standbyTimer = null;

  const hide = () => {
    overlay.classList.remove('active');
  };

  const show = () => {
    overlay.classList.add('active');
  };

  const resetTimer = () => {
    if (standbyTimer) clearTimeout(standbyTimer);
    hide();
    standbyTimer = setTimeout(show, STANDBY_TIMEOUT_MS);
  };

  ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach((event) => {
    window.addEventListener(event, resetTimer, { passive: true });
  });

  window.addEventListener('message', (event) => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'standby-activity') resetTimer();
  });

  overlay.addEventListener('click', resetTimer);
  resetTimer();

  window.showStandby = show;
  window.hideStandby = hide;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStandby);
} else {
  initStandby();
}
