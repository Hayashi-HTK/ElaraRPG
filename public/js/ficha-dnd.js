import { auth, db, doc, getDoc, updateDoc, serverTimestamp, waitForAuth } from './firebase.js';

const params = new URLSearchParams(window.location.search);
const sheetId = params.get('id');

if (!sheetId) {
  window.location.href = 'dashboard.html';
}

const DEFAULT_AVATAR = 'assets/default-avatar.png';

const isIframeView = (() => {
  const view = String(params.get('view') || '').trim();
  if (view === 'iframe' || view === 'true') return true;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function sendIframeHeight() {
  if (!isIframeView) return;
  try {
    const h = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
    window.parent?.postMessage({ type: 'sheet-iframe-height', height: h }, '*');
  } catch {}
}

function fitToIframeViewport() {
  if (!isIframeView) return;
  const shell = document.querySelector('.dnd-shell');
  if (!shell) return;
  try {
    shell.style.setProperty('--iframe-scale', '1');
    requestAnimationFrame(() => {
      const rawH = Math.max(shell.scrollHeight || 0, 1);
      const avail = Math.max(window.innerHeight - 8, 280);
      const scale = Math.min(1, avail / rawH);
      shell.style.setProperty('--iframe-scale', String(scale));
      setTimeout(sendIframeHeight, 50);
    });
  } catch {}
}

function setupStandbyActivityBridge() {
  if (!isIframeView) return;
  let last = 0;
  const ping = () => {
    const now = Date.now();
    if (now - last < 800) return;
    last = now;
    try {
      window.parent?.postMessage({ type: 'standby-activity' }, '*');
    } catch {}
  };
  ['mousemove', 'mousedown', 'touchstart', 'scroll', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, ping, { passive: true });
  });
  ping();
  setInterval(ping, 45000);
}

const FIELDS = [
  'dnd_character_name',
  'dnd_class_level',
  'dnd_background',
  'dnd_player_name',
  'dnd_race',
  'dnd_alignment',
  'dnd_xp',
  'dnd_inspiration',
  'dnd_proficiency_bonus',
  'dnd_ac',
  'dnd_initiative',
  'dnd_speed',
  'dnd_hp_max',
  'dnd_hp_current',
  'dnd_hp_temp',
  'dnd_hd_total',
  'dnd_hd_used',
  'dnd_death_success',
  'dnd_death_fail',
  'dnd_str',
  'dnd_dex',
  'dnd_con',
  'dnd_int',
  'dnd_wis',
  'dnd_cha',
  'dnd_saves_skills',
  'dnd_passive_perception',
  'dnd_attacks_spellcasting',
  'dnd_personality_traits',
  'dnd_ideals',
  'dnd_bonds',
  'dnd_flaws',
  'dnd_features_traits',
  'dnd_other_proficiencies',
  'dnd_equipment',
  'dnd_character_name_2',
  'dnd_age',
  'dnd_height',
  'dnd_weight',
  'dnd_eyes',
  'dnd_skin',
  'dnd_hair',
  'dnd_appearance',
  'dnd_allies',
  'dnd_history',
  'dnd_features_additional',
  'dnd_treasures',
  'dnd_spellcasting_class',
  'dnd_spellcasting_ability',
  'dnd_spell_save_dc',
  'dnd_spell_attack_bonus',
  'dnd_spells_0',
  'dnd_spells_1',
  'dnd_spells_2',
  'dnd_spells_3',
  'dnd_spells_4',
  'dnd_spells_5',
  'dnd_spells_6',
  'dnd_spells_7',
  'dnd_spells_8',
  'dnd_spells_9'
];

const getEl = (id) => document.getElementById(id);

let currentUser = null;
let currentAvatar = DEFAULT_AVATAR;

function isNumericField(id) {
  return [
    'dnd_inspiration',
    'dnd_proficiency_bonus',
    'dnd_ac',
    'dnd_initiative',
    'dnd_hp_max',
    'dnd_hp_current',
    'dnd_hp_temp',
    'dnd_str',
    'dnd_dex',
    'dnd_con',
    'dnd_int',
    'dnd_wis',
    'dnd_cha',
    'dnd_passive_perception'
  ].includes(id);
}

function readField(id) {
  const el = getEl(id);
  if (!el) return undefined;
  const raw = String(el.value ?? '').trim();
  if (isNumericField(id)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

function writeField(id, value) {
  const el = getEl(id);
  if (!el) return;
  if (isNumericField(id)) {
    const n = Number(value);
    el.value = String(Number.isFinite(n) ? n : 0);
    return;
  }
  el.value = String(value ?? '');
}

function syncNames(val) {
  const v = String(val ?? '');
  writeField('dnd_character_name', v);
  writeField('dnd_character_name_2', v);
}

function setAvatar(url) {
  currentAvatar = String(url || DEFAULT_AVATAR);
  const img = getEl('dnd_avatar_img');
  if (img) img.src = currentAvatar;
}

function buildData() {
  const data = {};
  FIELDS.forEach((id) => {
    const v = readField(id);
    if (v !== undefined) data[id] = v;
  });
  data.image = currentAvatar || DEFAULT_AVATAR;
  return data;
}

async function loadSheet() {
  const sheetRef = doc(db, 'sheets', sheetId);
  const sheetDoc = await getDoc(sheetRef);
  if (!sheetDoc.exists()) {
    alert('Ficha não encontrada');
    window.location.href = 'dashboard.html';
    return;
  }

  const sheet = sheetDoc.data();
  const data = sheet.data || {};

  setAvatar(data.image || DEFAULT_AVATAR);

  FIELDS.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(data, id)) writeField(id, data[id]);
  });

  const name = String(sheet.name || data.dnd_character_name || '').trim();
  if (name) syncNames(name);

  if (!getEl('dnd_character_name_2')?.value) writeField('dnd_character_name_2', getEl('dnd_character_name')?.value || '');
}

async function saveSheet() {
  const name = String(getEl('dnd_character_name')?.value || '').trim() || 'Ficha D&D';
  const payload = {
    name,
    updated_at: serverTimestamp(),
    data: buildData()
  };
  await updateDoc(doc(db, 'sheets', sheetId), payload);
}

function setupTabs() {
  document.querySelectorAll('.dnd-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = String(btn.dataset.page || '');
      document.querySelectorAll('.dnd-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dnd-page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
      setTimeout(fitToIframeViewport, 60);
    });
  });
}

function setInitialPageFromUrl() {
  const raw = String(params.get('page') || '').trim();
  if (!raw) return;
  const btn = Array.from(document.querySelectorAll('.dnd-tab')).find(b => String(b.dataset.page || '') === raw);
  if (btn) btn.click();
}

function setupAvatar() {
  const file = getEl('dnd-avatar-file');
  const container = getEl('dnd-avatar-container');
  const overlay = getEl('dnd-avatar-overlay');
  const btnUpload = getEl('dnd_btn_upload');
  const btnLink = getEl('dnd_btn_link');

  if (container && overlay && params.get('readonly') !== '1') {
    container.addEventListener('click', (e) => {
      if (e.target === btnUpload || e.target === btnLink) return;
      if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
      }
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && overlay.style.display === 'flex') {
        overlay.style.display = 'none';
      }
    });
  }

  if (btnUpload && file) {
    btnUpload.addEventListener('click', () => {
      if (params.get('readonly') === '1') return;
      file.click();
      if (overlay) overlay.style.display = 'none';
    });
  }
  
  if (btnLink) {
    btnLink.addEventListener('click', () => {
      if (params.get('readonly') === '1') return;
      if (overlay) overlay.style.display = 'none';
      const url = prompt('Insira o link da imagem:');
      if (url) {
        setAvatar(url);
        const saveBtn = getEl('save-sheet-btn');
        if (saveBtn) {
          saveBtn.textContent = 'Salvar*';
        }
      }
    });
  }

  if (file) {
    file.addEventListener('change', () => {
      if (params.get('readonly') === '1') return;
      const f = file.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '').trim();
        if (dataUrl) {
          setAvatar(dataUrl);
          const saveBtn = getEl('save-sheet-btn');
          if (saveBtn) {
            saveBtn.textContent = 'Salvar*';
          }
        }
      };
      reader.readAsDataURL(f);
    });
  }
}

function setupNameSync() {
  const n1 = getEl('dnd_character_name');
  const n2 = getEl('dnd_character_name_2');
  if (n1) n1.addEventListener('input', (e) => syncNames(e.target.value));
  if (n2) n2.addEventListener('input', (e) => syncNames(e.target.value));
}

function setupAutoSaveHint() {
  const saveBtn = getEl('save-sheet-btn');
  if (!saveBtn) return;
  let dirty = false;

  const mark = () => {
    if (dirty) return;
    dirty = true;
    saveBtn.textContent = 'Salvar*';
  };

  FIELDS.forEach((id) => {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('input', mark);
  });
}

function setupSaveButton() {
  const saveBtn = getEl('save-sheet-btn');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const prev = saveBtn.textContent;
    saveBtn.textContent = 'Salvando...';
    try {
      await saveSheet();
      saveBtn.textContent = 'Salvo';
      setTimeout(() => {
        saveBtn.textContent = 'Salvar';
      }, 900);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar ficha.');
      saveBtn.textContent = prev;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const view = String(params.get('view') || '').trim();
  if (view === 'iframe' || view === 'true') {
    document.body.classList.add('view-iframe');
  }

  currentUser = await waitForAuth();
  if (!currentUser) {
    window.location.replace('login.html');
    return;
  }

  setupTabs();
  setInitialPageFromUrl();
  setupStandbyActivityBridge();
  setupAvatar();
  setupNameSync();
  setupAutoSaveHint();
  setupSaveButton();
  await loadSheet();
  setTimeout(fitToIframeViewport, 120);
  setTimeout(fitToIframeViewport, 900);

  if (params.get('readonly') === '1') {
    const saveBtn = getEl('save-sheet-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    const avatarBtn = getEl('dnd-avatar-container');
    if (avatarBtn) avatarBtn.style.pointerEvents = 'none';
    FIELDS.forEach((id) => {
      const el = getEl(id);
      if (el) el.disabled = true;
    });
  }
});

window.addEventListener('resize', () => {
  setTimeout(fitToIframeViewport, 120);
});
