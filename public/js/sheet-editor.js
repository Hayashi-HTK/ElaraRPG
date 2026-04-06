import { BADGES } from './badges.js';
import { startSessionTracking, stopSessionTracking } from './gamification.js';
import { auth, db, doc, getDoc, collection, addDoc, updateDoc, serverTimestamp, waitForAuth } from './firebase.js';

const urlParams = new URLSearchParams(window.location.search);
const sheetId = urlParams.get('id');
const isReadonly = urlParams.get('readonly') === '1';

if (!sheetId) {
  window.location.href = 'dashboard.html';
}

let currentUser = null;
let sheetData = {};
let currentBadges = [];
let frameLoaded = false;

// ===== Autosave robusto =====
let latestFrameData = {};
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;
let lastSavedSnapshot = '';
let lastReceivedSnapshot = '';

// Elements
const inputs = document.querySelectorAll('input, textarea');
const shareBtn = document.getElementById('share-btn');
const bgBtn = document.getElementById('bg-btn');
const backgroundUrlInput = document.getElementById('background-url');
const backgroundStyleInput = document.getElementById('background-style');
const frame = document.getElementById('template-frame');

// Dialog Elements
const bgDialog = document.getElementById('bg-dialog');
const bgUrlInput = document.getElementById('bg-url-input');
const bgStyleSelect = document.getElementById('bg-style-select');
const siteThemeSelect = document.getElementById('site-theme-select');
const bgSaveBtn = document.getElementById('bg-save-btn');
const bgRemoveBtn = document.getElementById('bg-remove-btn');
const bgCancelBtn = document.getElementById('bg-cancel-btn');

// Badge Elements
const addBadgeBtn = document.getElementById('add-badge-btn');
const badgesContainer = document.getElementById('badges-container');
const badgesDialog = document.getElementById('badges-dialog');
const badgesListSelection = document.getElementById('badges-list-selection');
const badgesCloseBtn = document.getElementById('badges-close-btn');

if (isReadonly) {
  if (shareBtn) shareBtn.style.display = 'none';
  if (bgBtn) bgBtn.style.display = 'none';
  if (addBadgeBtn) addBadgeBtn.style.display = 'none';
}


window.addEventListener('beforeunload', () => {
  stopSessionTracking();
});

let statusTimeout = null;

function safeSetStatus(text, isError = false) {
  let status = document.getElementById('save-status');

  if (!status) {
    status = document.createElement('div');
    status.id = 'save-status';
    status.style.position = 'fixed';
    status.style.bottom = '20px';
    status.style.left = '20px';
    status.style.zIndex = '1000';
    status.style.padding = '0.55rem 0.8rem';
    status.style.borderRadius = '999px';
    status.style.background = 'rgba(0,0,0,0.65)';
    status.style.color = '#fff';
    status.style.fontSize = '14px';
    status.style.backdropFilter = 'blur(6px)';
    status.style.transition = 'opacity 0.3s ease';
    document.body.appendChild(status);
  }

  status.textContent = text;
  status.style.background = isError ? 'rgba(180, 30, 30, 0.9)' : 'rgba(0,0,0,0.65)';
  status.style.opacity = '1';

  clearTimeout(statusTimeout);

  if (text === 'Salvo' || text === 'Pronto') {
    statusTimeout = setTimeout(() => {
      if (status) status.style.opacity = '0';
    }, 2000);
  }
}

function stableStringify(obj) {
  return JSON.stringify(obj ?? {});
}

function getPayload() {
  const tpl =
    sheetData.template ||
    new URLSearchParams(window.location.search).get('template') ||
    'free';

  return {
    name: latestFrameData.nomePersonagem || sheetData.name || '',
    data: {
      ...latestFrameData,
      background_url: backgroundUrlInput?.value || '',
      background_style: backgroundStyleInput?.value || 'cover',
      badges: currentBadges
    },
    template: tpl,
    updated_at: serverTimestamp ? serverTimestamp() : new Date()
  };
}

async function ensureAuth() {
  currentUser = await waitForAuth();

  if (!currentUser) {
    window.location.href = 'login.html';
    throw new Error('no-auth');
  }

  startSessionTracking(currentUser.uid);

  try {
    const profileDoc = await getDoc(doc(db, 'profiles', currentUser.uid));
    let displayName = currentUser.displayName || currentUser.email;
    let avatarUrl = null;

    if (profileDoc.exists()) {
      const profile = profileDoc.data();
      displayName = profile.nickname || profile.full_name || displayName;
      avatarUrl = profile.avatar_url;
    }

    const navUsername = document.getElementById('nav-username');
    const navAvatar = document.getElementById('nav-avatar');

    if (navUsername) navUsername.textContent = displayName;

    if (navAvatar) {
      if (avatarUrl) {
        navAvatar.style.backgroundImage = `url('${avatarUrl}')`;
        navAvatar.style.backgroundSize = 'cover';
        navAvatar.style.backgroundPosition = 'center';
        navAvatar.textContent = '';
      } else {
        navAvatar.textContent = displayName.charAt(0).toUpperCase();
        navAvatar.style.display = 'flex';
        navAvatar.style.alignItems = 'center';
        navAvatar.style.justifyContent = 'center';
        navAvatar.style.color = '#fff';
        navAvatar.style.fontSize = '14px';
        navAvatar.style.backgroundImage = 'none';
      }
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await auth.signOut();
          window.location.replace('login.html');
        } catch (err) {
          console.error('Erro ao desconectar:', err);
        }
      });
    }
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
  }
}

async function loadSheet() {
  try {
    const sheetRef = doc(db, 'sheets', sheetId);
    const sheetDoc = await getDoc(sheetRef);

    if (!sheetDoc.exists()) {
      alert('Ficha não encontrada');
      window.location.href = 'dashboard.html';
      return;
    }

    sheetData = { id: sheetDoc.id, ...sheetDoc.data() };
    latestFrameData = sheetData.data || {};
    lastReceivedSnapshot = stableStringify(latestFrameData);
    lastSavedSnapshot = stableStringify({
      ...latestFrameData,
      background_url: sheetData.data?.background_url || '',
      background_style: sheetData.data?.background_style || 'cover',
      badges: sheetData.data?.badges || []
    });

    populateFields(sheetData);
    safeSetStatus('Pronto');
  } catch (error) {
    console.error('Erro ao carregar ficha:', error);
    alert('Erro ao carregar ficha: ' + error.message);
    window.location.href = 'dashboard.html';
  }
}

function populateFields(sheet) {
  const activeElement = document.activeElement;
  const tpl =
    sheet.template ||
    new URLSearchParams(window.location.search).get('template') ||
    'free';

  if (frame && tpl) {
    frameLoaded = false;
    const readonly = new URLSearchParams(window.location.search).get('readonly') === '1' ? '1' : '';

    const normalizePath = (p) =>
      String(p || '')
        .replace(/^[\\/]+/, '')
        .replace(/^public[\\/]/i, '');

    const buildFrameUrl = () => {
      if (tpl === 'free') {
        const u = new URL(normalizePath('ficha-elara.html'), window.location.href);
        u.searchParams.set('sheetId', sheetId);
        u.searchParams.set('template', tpl);
        u.searchParams.set('view', 'iframe');
        if (readonly) u.searchParams.set('readonly', '1');
        return u.toString();
      }

      if (tpl === 'dnd') {
        const u = new URL(normalizePath('ficha-dnd.html'), window.location.href);
        u.searchParams.set('id', sheetId);
        u.searchParams.set('template', tpl);
        u.searchParams.set('view', 'iframe');
        if (readonly) u.searchParams.set('readonly', '1');
        return u.toString();
      }

      const rawPath = /[\\/]/.test(tpl) ? tpl : `assets/ficha-${tpl}/index.html`;
      const u = new URL(normalizePath(rawPath), window.location.href);
      u.searchParams.set('sheetId', sheetId);
      u.searchParams.set('template', tpl);
      u.searchParams.set('view', 'iframe');
      if (readonly) u.searchParams.set('readonly', '1');
      return u.toString();
    };

    frame.src = buildFrameUrl();

    frame.onload = () => {
      frameLoaded = true;

      try {
        const idoc = frame.contentDocument || frame.contentWindow.document;
        const style = idoc.createElement('style');
        style.textContent =
          `html,body{scrollbar-width: thin; scrollbar-color: rgba(100,100,100,0.4) rgba(0,0,0,0.1);} ` +
          `html::-webkit-scrollbar, body::-webkit-scrollbar{width:6px;height:6px;} ` +
          `html::-webkit-scrollbar-track, body::-webkit-scrollbar-track{background: var(--bg);} ` +
          `html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb{background: rgba(100,100,100,0.4);border-radius:3px;}`;
        idoc.head.appendChild(style);
      } catch (e) {
        console.error('Erro ao aplicar estilo no iframe:', e);
      }

      try {
        frame.contentWindow.postMessage({
          type: 'load-sheet',
          data: sheet.data || {}
        }, '*');
      } catch (e) {
        console.error('Erro ao enviar dados para o iframe:', e);
      }
    };
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el && el !== activeElement) {
      el.value = val;
    }
  }

  setVal('char-name', sheet.name || '');

  currentBadges = sheet.data?.badges || [];
  renderBadges();

  const bgUrl = sheet.data?.background_url || '';
  const bgStyle = sheet.data?.background_style || 'cover';

  if (backgroundUrlInput) backgroundUrlInput.value = bgUrl;
  if (backgroundStyleInput) backgroundStyleInput.value = bgStyle;

  if (bgUrl) {
    document.body.style.backgroundImage = `url('${bgUrl}')`;
    document.body.style.backgroundSize = bgStyle;
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundRepeat = 'no-repeat';
  } else {
    document.body.style.backgroundImage = '';
  }
}

function scheduleSave(delay = 800) {
  if (isReadonly) {
    safeSetStatus('Somente visualização');
    return;
  }
  clearTimeout(saveTimer);
  safeSetStatus('Editando...');
  saveTimer = setTimeout(() => {
    void saveSheet();
  }, delay);
}

async function saveSheet() {
  if (isReadonly) {
    safeSetStatus('Somente visualização');
    return;
  }
  const payload = getPayload();
  const comparableSnapshot = stableStringify(payload.data);

  if (comparableSnapshot === lastSavedSnapshot) {
    safeSetStatus('Salvo');
    return;
  }

  if (saveInFlight) {
    saveQueued = true;
    return;
  }

  saveInFlight = true;
  safeSetStatus('Salvando...');

  try {
    const sheetRef = doc(db, 'sheets', sheetId);
    await updateDoc(sheetRef, payload);

    sheetData = {
      ...sheetData,
      ...payload
    };

    lastSavedSnapshot = comparableSnapshot;
    safeSetStatus('Salvo');
  } catch (error) {
    console.error('Erro ao salvar:', error);
    safeSetStatus('Erro ao salvar', true);

    // retry leve
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveSheet();
    }, 2000);
  } finally {
    saveInFlight = false;

    if (saveQueued) {
      saveQueued = false;
      void saveSheet();
    }
  }
}

function renderBadges() {
  if (!badgesContainer) return;

  badgesContainer.innerHTML = '';
  if (currentBadges.length === 0) {
    badgesContainer.innerHTML =
      '<p style="color: var(--color-text-muted); font-style: italic;">Nenhuma insígnia conquistada ainda.</p>';
    return;
  }

  currentBadges.forEach((badgeId) => {
    const badge = BADGES.find((b) => b.id === badgeId);
    if (!badge) return;

    const el = document.createElement('div');
    el.className = 'badge-item';
    el.title = `${badge.name}: ${badge.description}`;
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.padding = '0.5rem';
    el.style.border = '1px solid var(--color-border)';
    el.style.borderRadius = '0.5rem';
    el.style.background = 'var(--color-bg-input)';
    el.style.cursor = 'help';
    el.style.width = '80px';
    el.style.textAlign = 'center';
    el.style.position = 'relative';
    el.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 0.25rem;">${badge.icon}</div>
      <div style="font-size: 0.7rem; font-weight: bold; line-height: 1.1;">${badge.name}</div>
    `;

    if (isReadonly) {
      badgesContainer.appendChild(el);
      return;
    }

    const removeBtn = document.createElement('div');
    removeBtn.innerHTML = '×';
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '-5px';
    removeBtn.style.right = '-5px';
    removeBtn.style.background = 'red';
    removeBtn.style.color = 'white';
    removeBtn.style.width = '16px';
    removeBtn.style.height = '16px';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.opacity = '0';
    removeBtn.style.transition = 'opacity 0.2s';

    el.appendChild(removeBtn);
    el.addEventListener('mouseenter', () => (removeBtn.style.opacity = '1'));
    el.addEventListener('mouseleave', () => (removeBtn.style.opacity = '0'));

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remover insígnia "${badge.name}"?`)) {
        currentBadges = currentBadges.filter((id) => id !== badgeId);
        renderBadges();
        scheduleSave(100);
      }
    });

    badgesContainer.appendChild(el);
  });
}

// recebe mudanças do iframe
window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow) return;
  if (!event.data?.type) return;

  if (event.data.type === 'sheet-changed') {
    latestFrameData = event.data.data || {};
    lastReceivedSnapshot = stableStringify(latestFrameData);
    scheduleSave();
  }

  if (event.data.type === 'sheet-data') {
    latestFrameData = event.data.data || {};
    lastReceivedSnapshot = stableStringify(latestFrameData);
  }

  if (event.data.type === 'request-save') {
    if (!isReadonly) scheduleSave(0);
  }
});

// Share Logic
if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    if (isReadonly) return;
    const email = prompt('Digite o email do Mestre ou Jogador para compartilhar (deve estar cadastrado no sistema):');
    if (!email) return;

    try {
      await addDoc(collection(db, 'collaborators'), {
        sheet_id: sheetId,
        user_email: email,
        created_at: serverTimestamp ? serverTimestamp() : new Date()
      });

      alert('Convite enviado! O usuário agora pode ver e editar esta ficha.');
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
      alert('Erro ao compartilhar: ' + error.message);
    }
  });
}

// Background
if (bgBtn && bgDialog) {
  bgBtn.addEventListener('click', () => {
    if (isReadonly) return;
    bgUrlInput.value = backgroundUrlInput.value || '';
    bgStyleSelect.value = backgroundStyleInput.value || 'cover';
    if (siteThemeSelect) {
      siteThemeSelect.value = localStorage.getItem('rpg_theme') || 'default';
    }
    bgDialog.showModal();
  });

  bgCancelBtn.addEventListener('click', () => {
    bgDialog.close();
  });

  bgRemoveBtn.addEventListener('click', () => {
    if (isReadonly) return;
    backgroundUrlInput.value = '';
    backgroundStyleInput.value = 'cover';
    document.body.style.backgroundImage = '';
    scheduleSave(100);
    bgDialog.close();
  });

  bgSaveBtn.addEventListener('click', () => {
    if (isReadonly) return;
    const newBg = bgUrlInput.value;
    const newStyle = bgStyleSelect.value;

    if (siteThemeSelect && window.setTheme) {
      window.setTheme(siteThemeSelect.value);
    }

    backgroundUrlInput.value = newBg;
    backgroundStyleInput.value = newStyle;

    if (newBg) {
      document.body.style.backgroundImage = `url('${newBg}')`;
      document.body.style.backgroundSize = newStyle;
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';
    } else {
      document.body.style.backgroundImage = '';
    }

    scheduleSave(100);
    bgDialog.close();
  });
}

if (addBadgeBtn && badgesDialog && badgesListSelection && badgesCloseBtn) {
  addBadgeBtn.addEventListener('click', () => {
    if (isReadonly) return;
    badgesListSelection.innerHTML = '';

    BADGES.forEach((badge) => {
      const isOwned = currentBadges.includes(badge.id);
      const btn = document.createElement('button');
      btn.className = 'badge-select-btn';
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.padding = '0.5rem';
      btn.style.background = isOwned ? 'var(--color-primary)' : 'var(--color-bg-input)';
      btn.style.border = '1px solid var(--color-border)';
      btn.style.borderRadius = '0.5rem';
      btn.style.cursor = 'pointer';
      btn.style.color = 'var(--color-text)';
      btn.style.opacity = isOwned ? '0.6' : '1';
      btn.disabled = isOwned;
      btn.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.25rem;">${badge.icon}</div>
        <div style="font-size: 0.7rem; font-weight: bold;">${badge.name}</div>
      `;
      btn.title = badge.description;

      btn.addEventListener('click', () => {
        if (!currentBadges.includes(badge.id)) {
          currentBadges.push(badge.id);
          renderBadges();
          scheduleSave(100);
          badgesDialog.close();
        }
      });

      badgesListSelection.appendChild(btn);
    });

    badgesDialog.showModal();
  });

  badgesCloseBtn.addEventListener('click', () => {
    badgesDialog.close();
  });
}


ensureAuth().then(loadSheet).catch(() => {});
