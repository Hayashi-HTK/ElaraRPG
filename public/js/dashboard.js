// Firebase initialization from local module
import { auth, db, doc, getDoc, getDocs, collection, query, where, orderBy, addDoc, deleteDoc, serverTimestamp, waitForAuth, signOut } from './firebase.js';
import { checkDailyLogin } from './gamification.js';
import { getPlanState, upgradeHref } from './plans.js';

const sheetsList = document.getElementById('sheets-list')
const navUsername = document.getElementById('nav-username')
const navAvatar = document.getElementById('nav-avatar')
const logoutBtn = document.getElementById('logout-btn')
const newSheetBtn = document.getElementById('new-sheet-btn')
const welcomeMessage = document.getElementById('welcome-message')

// Stats elements
const totalSheetsEl = document.getElementById('total-sheets')
const totalCampaignsEl = document.getElementById('total-campaigns')
const lastActivityEl = document.getElementById('last-activity')
const favoritesSection = document.getElementById('favorites-section')
const favoritesList = document.getElementById('favorites-list')
const newSheetModal = document.getElementById('new-sheet-modal')
const closeNewSheetModalBtn = document.getElementById('close-new-sheet-modal')
const sheetTypeGrid = document.getElementById('sheet-type-grid')
const systemFilterSelect = document.getElementById('sheet-system-filter')

let currentSystemFilter = 'all'
let currentPlanState = null
let currentMySheetsCount = 0

const SHEET_SYSTEMS = [
  {
    key: 'elara',
    label: 'Padrão do Site',
    system: 'Elara',
    template: 'free',
    locked: false,
    desc: 'Ficha padrão do Elara, leve e flexível.'
  },
  {
    key: 'dnd5e',
    label: 'D&D 5e',
    system: 'D&D 5e',
    template: 'dnd',
    locked: false,
    desc: 'Ficha de D&D 5e editável e pronta para sessão.'
  },
  { key: 'pathfinder2e', label: 'Pathfinder 2e', system: 'Pathfinder 2e', template: 'pf2e', locked: true, desc: 'Em breve.' },
  { key: 'callofcthulhu', label: 'Call of Cthulhu', system: 'Call of Cthulhu', template: 'coc', locked: true, desc: 'Em breve.' },
  { key: 'vampire', label: 'Vampire: The Masquerade', system: 'Vampire: The Masquerade', template: 'v5', locked: true, desc: 'Em breve.' },
  { key: 'cyberpunkred', label: 'Cyberpunk RED', system: 'Cyberpunk RED', template: 'cpr', locked: true, desc: 'Em breve.' },
  { key: 'savageworlds', label: 'Savage Worlds', system: 'Savage Worlds', template: 'swade', locked: true, desc: 'Em breve.' }
]

function openNewSheetModal() {
  const max = currentPlanState?.maxSheets
  if (Number.isFinite(max) && currentMySheetsCount >= max) {
    const msg = max === 1
      ? 'Seu plano Aventureiro permite apenas 1 ficha. Quer ver os planos para liberar mais?'
      : `Seu plano atual permite até ${max} fichas. Quer ver os planos para liberar mais?`
    if (confirm(msg)) window.location.href = upgradeHref()
    return
  }
  if (!newSheetModal) return
  if (sheetTypeGrid) {
    sheetTypeGrid.innerHTML = SHEET_SYSTEMS.map(s => {
      const locked = !!s.locked
      return `
        <div class="sheet-type-card ${locked ? 'locked' : ''}" data-template="${s.template}" data-system="${s.system}" data-locked="${locked ? '1' : '0'}">
          <div class="top">
            <div class="name">${s.label}</div>
            <div class="pill">
              <i class="fas ${locked ? 'fa-lock' : 'fa-check'}"></i>
              <span>${locked ? 'Trancado' : 'Disponível'}</span>
            </div>
          </div>
          <div class="desc">${s.desc}</div>
        </div>
      `
    }).join('')

    sheetTypeGrid.querySelectorAll('.sheet-type-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const locked = card.dataset.locked === '1'
        if (locked) return
        const template = String(card.dataset.template || '').trim()
        const system = String(card.dataset.system || '').trim()
        await createSheetFromTemplate({ template, system })
      })
    })
  }
  newSheetModal.style.display = 'flex'
  newSheetModal.classList.add('active')
}

function closeNewSheetModal() {
  if (!newSheetModal) return
  newSheetModal.classList.remove('active')
  newSheetModal.style.display = 'none'
}

const sessionsHistorySection = document.getElementById('sessions-history-section')
const sessionsHistoryList = document.getElementById('sessions-history-list')
const btnClearSessionHistory = document.getElementById('btn-clear-session-history')

// Elementos do Modal de Ficha
const sheetModal = document.getElementById('sheet-modal')
const closeSheetModal = document.getElementById('close-sheet-modal')
const modalSheetName = document.getElementById('modal-sheet-name')
const modalSheetImage = document.getElementById('modal-sheet-image')
const modalSheetClass = document.getElementById('modal-sheet-class')
const modalSheetRace = document.getElementById('modal-sheet-race')
const modalSheetAttributes = document.getElementById('modal-sheet-attributes')
const modalSheetHP = document.getElementById('modal-sheet-hp')
const modalSheetAC = document.getElementById('modal-sheet-ac')
const modalFavBtn = document.getElementById('modal-fav-btn')
const modalOpenBtn = document.getElementById('modal-open-btn')
const modalDeleteBtn = document.getElementById('modal-delete-btn')

let currentSelectedSheetId = null;

function getSessionHistoryKey(userId) {
  return userId ? `session_history_${userId}` : 'session_history'
}

function getSessionHistoryClearedKey(userId) {
  return userId ? `session_history_cleared_${userId}` : 'session_history_cleared'
}

function loadSessionHistory(userId) {
  try {
    const raw = localStorage.getItem(getSessionHistoryKey(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function formatHistoryTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function lobbyPageForType(type) {
  if (type === 'free') return 'free-session.html'
  return 'guild.html'
}

function renderSessionHistory(userId) {
  if (!sessionsHistorySection || !sessionsHistoryList) return

  let history = loadSessionHistory(userId)
    .filter(e => e && e.id)
    .sort((a, b) => (b.last_seen_at || 0) - (a.last_seen_at || 0))

  if (history.length > 0) {
    localStorage.removeItem(getSessionHistoryClearedKey(userId))
  }

  if (history.length === 0) {
    const wasCleared = localStorage.getItem(getSessionHistoryClearedKey(userId)) === '1'
    if (wasCleared) {
      sessionsHistorySection.style.display = 'none'
      return
    }
    const last = localStorage.getItem('last_active_session')
    if (last) {
      history = [{
        id: last,
        name: `Sessão ${last}`,
        type: 'guild',
        last_seen_at: null
      }]
    }
  }

  if (history.length === 0) {
    sessionsHistorySection.style.display = 'none'
    return
  }

  sessionsHistorySection.style.display = 'block'

  sessionsHistoryList.innerHTML = ''
  history.slice(0, 10).forEach((entry, index) => {
    const item = document.createElement('div')
    item.className = `session-history-item ${index === 0 ? 'latest' : ''}`

    const typeLabel = entry.type === 'free' ? 'Sessão Livre' : 'Guilda'
    const timeLabel = entry.last_seen_at ? `Último acesso: ${formatHistoryTime(entry.last_seen_at)}` : 'Último acesso: -'
    const page = lobbyPageForType(entry.type)

    item.innerHTML = `
      <div class="session-history-left">
        <div class="session-history-title">${entry.name}</div>
        <div class="session-history-meta">
          <span class="session-type-badge-mini">${typeLabel}</span>
          <span>#${entry.id}</span>
          <span>${timeLabel}</span>
        </div>
      </div>
      <button class="btn-primary" style="padding: 0.65rem 1rem;">Voltar ao Saguão</button>
    `

    const btn = item.querySelector('button')
    btn.onclick = async () => {
      try {
        btn.disabled = true
        btn.textContent = 'Abrindo...'

        let password = ''
        let autoJoin = true
        try {
          const sessionDoc = await getDoc(doc(db, 'sessions', entry.id))
          if (sessionDoc.exists()) {
            const data = sessionDoc.data()
            password = data.password || ''
            if (data.is_private && !password) autoJoin = false
          } else {
            autoJoin = false
          }
        } catch {
          autoJoin = false
        }

        sessionStorage.setItem('lobby_autofill_v1', JSON.stringify({
          code: entry.id,
          password,
          autoJoin
        }))

        window.location.href = `${page}?join=${entry.id}`
      } finally {
        btn.disabled = false
        btn.textContent = 'Voltar ao Saguão'
      }
    }

    item.onclick = (e) => {
      if (e.target.closest('button')) return
      window.location.href = `${page}?join=${entry.id}`
    }

    sessionsHistoryList.appendChild(item)
  })

  if (btnClearSessionHistory) {
    btnClearSessionHistory.onclick = () => {
      localStorage.removeItem(getSessionHistoryKey(userId))
      localStorage.setItem(getSessionHistoryClearedKey(userId), '1')
      renderSessionHistory(userId)
    }
  }
}

// Check auth
async function init() {
  console.log('Initializing Dashboard...');
  
  // Wait for auth with a slightly more robust check
  const user = await waitForAuth()
  
  if (!user) {
    console.log('No user found on dashboard, redirecting to login...');
    // Only redirect if we didn't just log in (prevents race condition loops)
    if (sessionStorage.getItem('just_logged_in') === 'true') {
        console.warn('Redirect loop detected! Staying on dashboard to retry auth...');
        sessionStorage.removeItem('just_logged_in');
        // Retry once after a short delay
        setTimeout(init, 1000);
        return;
    }
    window.location.replace('login.html');
    return
  }

  // Clear the flag if we successfully authenticated
  sessionStorage.removeItem('just_logged_in');

  // initialize new-sheet dialog handlers
  // initNewSheetDialog(); // Modal removido

  // Load profile for header info
  try {
    // Check Daily Login
    checkDailyLogin(user.uid);

    const profileDoc = await getDoc(doc(db, 'profiles', user.uid))
    let displayName = user.displayName || user.email;
    let avatarUrl = null;

    if (profileDoc.exists()) {
      const profile = profileDoc.data()
      displayName = profile.nickname || profile.full_name || user.displayName || user.email
      avatarUrl = profile.avatar_url
      currentPlanState = getPlanState({ user, profile })
    } else {
      currentPlanState = getPlanState({ user, profile: {} })
    }

    if (navUsername) navUsername.textContent = displayName
    if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo, ${displayName}`
    
    if (navAvatar) {
        if (avatarUrl) {
            navAvatar.style.backgroundImage = `url('${avatarUrl}')`
            navAvatar.style.backgroundSize = 'cover'
            navAvatar.style.backgroundPosition = 'center'
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

  } catch (error) {
    console.error('Error loading profile:', error)
    if (navUsername) navUsername.textContent = user.email
    currentPlanState = getPlanState({ user, profile: {} })
  }

  loadSheets(user.uid)
  renderSessionHistory(user.uid)
}

async function loadSheets(userId) {
  try {
    const sheetsQuery = query(
      collection(db, 'sheets'),
      where('user_id', '==', userId)
      // orderBy('created_at', 'desc') // Comentado temporariamente enquanto o índice é construído
    )
    const sheetsSnapshot = await getDocs(sheetsQuery)
    const mySheets = sheetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    currentMySheetsCount = mySheets.length

    // Update stats
    if (totalSheetsEl) totalSheetsEl.textContent = mySheets.length
    if (lastActivityEl) {
        if (mySheets.length > 0) {
            const lastDateObj = mySheets[0].updated_at || mySheets[0].created_at;
            const lastDate = lastDateObj?.toDate ? lastDateObj.toDate() : (lastDateObj ? new Date(lastDateObj) : new Date());
            lastActivityEl.textContent = lastDate.toLocaleDateString('pt-BR');
        } else {
            lastActivityEl.textContent = 'Sem atividade';
        }
    }

    const user = auth.currentUser

    // Load shared sheets (where user is a collaborator)
    const collaboratorsQuery = query(
      collection(db, 'collaborators'),
      where('user_email', '==', user.email)
    )
    const collaboratorsSnapshot = await getDocs(collaboratorsQuery)
    const sheetIds = collaboratorsSnapshot.docs.map(doc => doc.data().sheet_id)
    
    let sharedSheets = []
    if (sheetIds.length > 0) {
      // Firebase 'in' query limited to 10 items, but let's assume it's fine for now
      const sharedSheetsQuery = query(
        collection(db, 'sheets'),
        where('__name__', 'in', sheetIds.slice(0, 10))
      )
      const sharedSheetsSnapshot = await getDocs(sharedSheetsQuery)
      sharedSheets = sharedSheetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    }

    // Update campaigns stat
    if (totalCampaignsEl) totalCampaignsEl.textContent = sharedSheets.length
    
    const allSheets = [...mySheets, ...sharedSheets];
    const getSystemLabel = (s) => {
      const sys = String(s?.system || '').trim();
      if (sys) return sys;
      const tpl = String(s?.template || '').trim();
      if (tpl === 'dnd') return 'D&D 5e';
      return 'Elara';
    };

    const favoritesAll = allSheets.filter(s => s.is_favorite);
    const regularsAll = mySheets.filter(s => !s.is_favorite);
    const sharedRegularsAll = sharedSheets.filter(s => !s.is_favorite);

    let favorites = favoritesAll;
    let regulars = regularsAll;
    let sharedRegulars = sharedRegularsAll;

    if (currentSystemFilter === 'favorites') {
      regulars = [];
      sharedRegulars = [];
    } else if (currentSystemFilter === 'shared') {
      favorites = [];
      regulars = [];
    } else if (currentSystemFilter !== 'all') {
      favorites = favoritesAll.filter(s => getSystemLabel(s) === currentSystemFilter);
      regulars = regularsAll.filter(s => getSystemLabel(s) === currentSystemFilter);
      sharedRegulars = sharedRegularsAll.filter(s => getSystemLabel(s) === currentSystemFilter);
    }

    // Render Favorites
    if (favorites.length > 0 && currentSystemFilter === 'all') {
      favoritesSection.style.display = 'block';
      favoritesList.innerHTML = favorites.map(sheet => createSheetCard(sheet, sheet.user_id === user.uid)).join('');
    } else {
      favoritesSection.style.display = 'none';
    }

    let html = ''

    // Section: My Sheets
    const renderGrouped = (items, isOwner) => {
      const map = new Map();
      items.forEach(s => {
        const key = getSystemLabel(s);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
      });
      const groups = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
      return groups.map(([sys, list]) => {
        return `
          <h3 style="grid-column: 1/-1; margin-top: 1.4rem; border-top: 1px solid var(--dashboard-border); padding-top: 1rem; font-family: 'Cinzel', serif;">
            ${sys}
          </h3>
          ${list.map(sheet => createSheetCard(sheet, isOwner)).join('')}
        `;
      }).join('');
    };

    if (currentSystemFilter !== 'all' && currentSystemFilter !== 'shared') {
      const merged = [...favorites, ...regulars, ...sharedRegulars];
      html += merged.length ? renderGrouped(merged, true) : '';
    } else if (regulars.length > 0) {
      html += renderGrouped(regulars, true)
    } else if (favorites.length === 0) {
      html += `
        <div class="card-dark" style="grid-column: 1 / -1; text-align: center; padding: 3rem; border-style: dashed;">
          <p style="margin-bottom: 1rem; color: var(--dashboard-text-muted);">Seu grimório está vazio.</p>
          <button id="empty-create-btn" class="btn-primary">Criar Primeira Ficha</button>
        </div>
      `
    }

    // Section: Shared Sheets (Master View)
    if (sharedRegulars.length > 0 && (currentSystemFilter === 'all' || currentSystemFilter === 'shared')) {
      html += `<h3 style="grid-column: 1/-1; margin-top: 2rem; border-top: 1px solid var(--dashboard-border); padding-top: 1rem; font-family: 'Cinzel', serif;">Fichas Compartilhadas</h3>`
      html += renderGrouped(sharedRegulars, false)
    }

    sheetsList.innerHTML = html;
    
    // Add listener to the empty state button if it exists
    const emptyBtn = document.getElementById('empty-create-btn');
    if (emptyBtn) {
        emptyBtn.addEventListener('click', window.createNewSheet);
    }

  } catch (error) {
    console.error('Erro ao carregar fichas:', error)
    if (sheetsList) {
        sheetsList.innerHTML = `<p style="color: #ef4444">Erro ao carregar fichas: ${error.message}</p>`
    }
  }
}

function createSheetCard(sheet, isOwner) {
  const sheetData = sheet.data || {};
  const sheetClasse = sheetData.dnd_class_level || sheetData.classLevel || 'Sem classe';
  const sheetRaca = sheetData.background || 'Sem raça';
  const isFav = sheet.is_favorite || false;
  const systemLabel = String(sheet.system || (sheet.template === 'dnd' ? 'D&D 5e' : 'Elara')).trim() || 'Elara';
  const image = sheetData.image || sheet.image_url || 'assets/default-avatar.png';

  return `
    <div class="sheet-card-v2 ${isFav ? 'favorite-card' : ''}" onclick="openSheetDetails('${sheet.id}')">
      <div class="card-image-wrapper">
        <img src="${image}" alt="${sheet.name}">
        <div class="card-overlay-info">
          <h3>${sheet.name}</h3>
          <p>${systemLabel} • ${sheetClasse}</p>
        </div>
      </div>
      <div class="card-footer">
        <div class="card-stats-mini">
          <span><i class="fas fa-shield-alt"></i> ${sheetData.ac || 10}</span>
          <span><i class="fas fa-heart"></i> ${sheetData.hpMax || 10}</span>
        </div>
        <div class="fav-icon ${isFav ? 'active' : ''}">
          <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
        </div>
      </div>
    </div>
  `
}

window.openSheetDetails = async (id) => {
  currentSelectedSheetId = id;
  try {
    const sheetRef = doc(db, 'sheets', id);
    const sheetDoc = await getDoc(sheetRef);
    if (!sheetDoc.exists()) return;

    const sheet = sheetDoc.data();
    const sheetData = sheet.data || {};
    
    // Preencher modal
    modalSheetName.textContent = sheet.name;
    modalSheetImage.src = sheetData.image || 'assets/default-avatar.png';
    modalSheetClass.textContent = sheetData.classLevel || 'Sem classe';
    modalSheetRace.textContent = sheetData.background || 'Sem raça';
    modalSheetHP.textContent = `${sheetData.hpCurrent || 0}/${sheetData.hpMax || 0}`;
    modalSheetAC.textContent = sheetData.ac || 10;
    
    // Atributos
    const attrs = sheetData.attributes || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    modalSheetAttributes.innerHTML = `
        <div class="attr-mini-item"><span class="label">FOR</span><span class="value">${attrs.str}</span></div>
        <div class="attr-mini-item"><span class="label">DES</span><span class="value">${attrs.dex}</span></div>
        <div class="attr-mini-item"><span class="label">CON</span><span class="value">${attrs.con}</span></div>
        <div class="attr-mini-item"><span class="label">INT</span><span class="value">${attrs.int}</span></div>
        <div class="attr-mini-item"><span class="label">SAB</span><span class="value">${attrs.wis}</span></div>
        <div class="attr-mini-item"><span class="label">CAR</span><span class="value">${attrs.cha}</span></div>
    `;

    // Favorito
    if (sheet.is_favorite) {
        modalFavBtn.classList.add('active');
        modalFavBtn.innerHTML = '<i class="fas fa-star"></i> Favorito';
    } else {
        modalFavBtn.classList.remove('active');
        modalFavBtn.innerHTML = '<i class="far fa-star"></i> Favoritar';
    }

    // Botão excluir apenas para o dono
    modalDeleteBtn.style.display = sheet.user_id === auth.currentUser.uid ? 'block' : 'none';

    // Abrir modal
    sheetModal.style.display = 'flex';
    setTimeout(() => sheetModal.classList.add('active'), 10);
  } catch (err) {
    console.error("Erro ao carregar detalhes da ficha:", err);
  }
}

// Fechar modal
if (closeSheetModal) {
    closeSheetModal.onclick = () => {
        sheetModal.classList.remove('active');
        setTimeout(() => sheetModal.style.display = 'none', 300);
    };
}

window.onclick = (event) => {
    if (event.target === sheetModal) {
        sheetModal.classList.remove('active');
        setTimeout(() => sheetModal.style.display = 'none', 300);
    }
}

// Ações do Modal
if (modalOpenBtn) {
    modalOpenBtn.onclick = () => {
        if (currentSelectedSheetId) openSheet(currentSelectedSheetId);
    };
}

if (modalFavBtn) {
    modalFavBtn.onclick = async () => {
        if (!currentSelectedSheetId) return;
        try {
            const sheetRef = doc(db, 'sheets', currentSelectedSheetId);
            const sheetDoc = await getDoc(sheetRef);
            const isFav = sheetDoc.data().is_favorite || false;
            
            await updateDoc(sheetRef, { is_favorite: !isFav });
            
            // Atualizar UI do modal
            if (!isFav) {
                modalFavBtn.classList.add('active');
                modalFavBtn.innerHTML = '<i class="fas fa-star"></i> Favorito';
            } else {
                modalFavBtn.classList.remove('active');
                modalFavBtn.innerHTML = '<i class="far fa-star"></i> Favoritar';
            }
            
            // Recarregar lista
            loadSheets(auth.currentUser.uid);
        } catch (err) {
            console.error("Erro ao favoritar:", err);
        }
    };
}

if (modalDeleteBtn) {
    modalDeleteBtn.onclick = () => {
        if (currentSelectedSheetId) {
            deleteSheet(currentSelectedSheetId);
            sheetModal.classList.remove('active');
        }
    };
}

window.openSheet = async (id) => {
  try {
    const sheetRef = doc(db, 'sheets', id);
    const sheetDoc = await getDoc(sheetRef);
    if (sheetDoc.exists()) {
      const sheetData = sheetDoc.data();
      const template = sheetData.template;
      
      // Se for template D&D ou uma ficha da Torre (que tem data.nomePersonagem)
      if (template === 'dnd' || (sheetData.data && sheetData.data.nomePersonagem)) {
        window.location.href = `ficha-dnd.html?id=${id}`;
      } else {
        window.location.href = `sheet-editor.html?id=${id}`;
      }
    }
  } catch (err) {
    console.error("Erro ao abrir ficha:", err);
    window.location.href = `sheet-editor.html?id=${id}`;
  }
}

// show dialog to choose template
function openNewSheetDialog() {
  const dialog = document.getElementById('new-sheet-dialog');
  if (dialog) dialog.showModal();
}

window.createNewSheet = () => openNewSheetModal();

// helper to navigate to a template page
async function goToTemplate(type) {
  if (type !== 'dnd' && type !== 'free') return;

  try {
    const user = auth.currentUser;
    let defaultName = type === 'dnd' ? 'Novo Personagem D&D' : 'Nova Ficha';
    let system = type === 'dnd' ? 'D&D 5e' : 'Elara';
    let template = type === 'dnd' ? 'dnd' : 'free';
    let initialData = type === 'dnd'
      ? {
          image: 'assets/default-avatar.png',
          dnd_character_name: '',
          dnd_character_name_2: '',
          dnd_class_level: '',
          dnd_background: '',
          dnd_player_name: '',
          dnd_race: '',
          dnd_alignment: '',
          dnd_xp: '',
          dnd_inspiration: 0,
          dnd_proficiency_bonus: 0,
          dnd_ac: 0,
          dnd_initiative: 0,
          dnd_speed: '',
          dnd_hp_max: 0,
          dnd_hp_current: 0,
          dnd_hp_temp: 0,
          dnd_hd_total: '',
          dnd_hd_used: '',
          dnd_death_success: '',
          dnd_death_fail: '',
          dnd_str: 0,
          dnd_dex: 0,
          dnd_con: 0,
          dnd_int: 0,
          dnd_wis: 0,
          dnd_cha: 0,
          dnd_saves_skills: '',
          dnd_passive_perception: 0,
          dnd_attacks_spellcasting: '',
          dnd_personality_traits: '',
          dnd_ideals: '',
          dnd_bonds: '',
          dnd_flaws: '',
          dnd_features_traits: '',
          dnd_other_proficiencies: '',
          dnd_equipment: '',
          dnd_age: '',
          dnd_height: '',
          dnd_weight: '',
          dnd_eyes: '',
          dnd_skin: '',
          dnd_hair: '',
          dnd_appearance: '',
          dnd_allies: '',
          dnd_history: '',
          dnd_features_additional: '',
          dnd_treasures: '',
          dnd_spellcasting_class: '',
          dnd_spellcasting_ability: '',
          dnd_spell_save_dc: '',
          dnd_spell_attack_bonus: '',
          dnd_spells_0: '',
          dnd_spells_1: '',
          dnd_spells_2: '',
          dnd_spells_3: '',
          dnd_spells_4: '',
          dnd_spells_5: '',
          dnd_spells_6: '',
          dnd_spells_7: '',
          dnd_spells_8: '',
          dnd_spells_9: ''
        }
      : {
          image: 'assets/default-avatar.png',
          theme: 'dark',
          nomePersonagem: '',
          nickname: '',
          classLevel: '',
          background: '',
          ac: 0,
          initiative: '',
          speed: '',
          hpMax: 0,
          hpCurrent: 0,
          attacks: '',
          traits: '',
          proficiencies: '',
          attributes: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
          abilities: []
        };

    const newSheetRef = await addDoc(collection(db, 'sheets'), {
      user_id: user.uid,
      author_nickname: user.displayName || 'Aventureiro', // Nickname do autor
      name: defaultName,
      system: system,
      template,
      data: initialData,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    window.location.href = template === 'dnd' ? `ficha-dnd.html?id=${newSheetRef.id}` : `sheet-editor.html?id=${newSheetRef.id}`;
  } catch (error) {
    alert('Erro ao criar ficha: ' + error.message);
  }
}

async function createSheetFromTemplate({ template, system }) {
  if (template === 'dnd') return goToTemplate('dnd')
  if (template === 'free') return goToTemplate('free')
  alert('Esse tipo de ficha ainda está trancado.')
}

window.deleteSheet = async (id) => {
  if (!confirm('Tem certeza que deseja excluir esta ficha?')) return

  try {
    await deleteDoc(doc(db, 'sheets', id))
    const user = auth.currentUser
    loadSheets(user.uid)
  } catch (error) {
    alert('Erro ao excluir: ' + error.message)
  }
}

if (newSheetBtn) {
  newSheetBtn.addEventListener('click', openNewSheetModal)
}

document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('#new-sheet-btn, #empty-create-btn')
  if (!btn) return
  e.preventDefault()
  e.stopPropagation()
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
  openNewSheetModal()
}, true)

if (closeNewSheetModalBtn) {
  closeNewSheetModalBtn.addEventListener('click', closeNewSheetModal)
}
if (newSheetModal) {
  newSheetModal.addEventListener('click', (e) => {
    if (e.target === newSheetModal) closeNewSheetModal()
  })
}
if (systemFilterSelect) {
  systemFilterSelect.addEventListener('change', (e) => {
    currentSystemFilter = String(e.target.value || 'all')
    const user = auth.currentUser
    if (user) loadSheets(user.uid)
  })
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
        await signOut(auth)
        window.location.replace('login.html');
        } catch (error) {
        console.error('Erro ao desconectar:', error)
        }
    })
}

init()
