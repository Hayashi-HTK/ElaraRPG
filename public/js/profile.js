import { auth, db, doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, waitForAuth, orderBy, limit } from './firebase.js'
import { checkAndUnlockFrames } from './gamification.js'
import { getPlanState, upgradeHref } from './plans.js'

let selectedFrame = 'wood'

function getViewedUid(currentUser) {
  const url = new URL(window.location.href)
  const uid = url.searchParams.get('uid')
  return uid || currentUser.uid
}

function setupTabs() {
  const buttons = Array.from(document.querySelectorAll('.profile-tab-btn'))
  const panels = Array.from(document.querySelectorAll('.profile-panel'))
  if (buttons.length === 0 || panels.length === 0) return

  const key = 'profile_tab_v1'

  const setTab = (tab) => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab))
    localStorage.setItem(key, tab)
  }

  buttons.forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)))

  const stored = localStorage.getItem(key)
  if (stored && buttons.some(b => b.dataset.tab === stored)) setTab(stored)
}

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw)
    return v ?? fallback
  } catch {
    return fallback
  }
}

function normalizeBgLayers(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (!x) return null
        if (typeof x === 'string') return { url: x, opacity: 1 }
        if (typeof x === 'object' && x.url) {
          const out = { url: String(x.url), opacity: Number.isFinite(x.opacity) ? x.opacity : 1 }
          if (x.source_url) out.source_url = String(x.source_url)
          if (x.pinterest_author_url) out.pinterest_author_url = String(x.pinterest_author_url)
          if (x.pinterest_pin_url) out.pinterest_pin_url = String(x.pinterest_pin_url)
          return out
        }
        return null
      })
      .filter(Boolean)
  }
  return []
}

function updateRecentList(currentList, newUrl) {
  if (!newUrl) return currentList || []
  let list = currentList || []
  list = list.filter(u => u !== newUrl)
  list.unshift(newUrl)
  return list.slice(0, 5)
}

function renderRecentThumbs(links, container, list, type, onPick) {
  if (!container || !list) return
  const normalized = Array.isArray(links) ? links.filter(Boolean) : []
  if (normalized.length === 0) {
    container.style.display = 'none'
    return
  }
  container.style.display = 'block'
  list.innerHTML = ''
  normalized.forEach(url => {
    const item = document.createElement('div')
    item.className = 'profile-thumb'
    item.style.backgroundImage = `url('${url}')`
    if (type === 'avatar') item.style.borderRadius = '999px'
    item.onclick = () => onPick(url)
    list.appendChild(item)
  })
}

function renderBgLayers(layers) {
  const container = document.getElementById('profile-bg-layers')
  if (!container) return
  container.innerHTML = ''
  layers.forEach((layer, idx) => {
    const el = document.createElement('div')
    el.className = `profile-bg-layer variant-${idx % 6}`
    el.style.backgroundImage = `url('${layer.url}')`
    container.appendChild(el)
  })
}

function renderBgLayersManager(layers, onChange) {
  const listEl = document.getElementById('bg-layers-list')
  const btnAdd = document.getElementById('btn-add-bg-layer')
  if (!listEl || !btnAdd) return

  const redraw = () => {
    listEl.innerHTML = ''
    layers.forEach((layer, idx) => {
      const item = document.createElement('div')
      item.className = 'profile-thumb'
      item.style.backgroundImage = `url('${layer.url}')`
      const rm = document.createElement('button')
      rm.type = 'button'
      rm.textContent = '×'
      rm.onclick = () => {
        layers.splice(idx, 1)
        onChange(layers)
        redraw()
      }
      item.appendChild(rm)
      listEl.appendChild(item)
    })
  }

  btnAdd.onclick = () => {
    const url = prompt('Cole a URL da imagem de fundo:', '')
    if (!url) return
    const pinterestPinUrl = prompt('Se for do Pinterest, cole o link do PIN (opcional):', '') || ''
    const pinterestAuthorUrl = prompt('Se for do Pinterest, cole o link do perfil do autor (opcional):', '') || ''
    layers.unshift({
      url,
      ...(pinterestPinUrl.trim() ? { pinterest_pin_url: pinterestPinUrl.trim() } : {}),
      ...(pinterestAuthorUrl.trim() ? { pinterest_author_url: pinterestAuthorUrl.trim() } : {})
    })
    onChange(layers)
    redraw()
  }

  redraw()
}

function updateFrameDisplay(element, frame) {
  if (!element) return
  if (element.id === 'avatar-frame-border' || element.classList.contains('frame-glow')) {
    element.className = 'frame-glow'
    if (frame) element.classList.add(`glow-${frame.toLowerCase()}`)
    return
  }
  element.className = 'frame-border'
  if (frame) element.classList.add(`frame-${frame.toLowerCase()}`)
}

function updateAvatarDisplay(url, avatarImg, avatarPlaceholder, frame) {
  const avatarFrameBorder = document.getElementById('avatar-frame-border')
  const avatarBorderPNG = document.getElementById('avatar-border')
  updateFrameDisplay(avatarFrameBorder, frame)
  updateFrameDisplay(avatarBorderPNG, frame)

  if (url) {
    if (avatarImg) {
      avatarImg.src = url
      avatarImg.style.display = 'block'
    }
    if (avatarPlaceholder) avatarPlaceholder.style.display = 'none'
  } else {
    if (avatarImg) avatarImg.style.display = 'none'
    if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex'
  }
}

function updateBannerDisplay(url, bannerImg, bannerPlaceholder, bannerControls, bannerHint, posY) {
  const editEnabled = document.body.classList.contains('profile-edit-enabled')
  if (url) {
    if (bannerImg) {
      bannerImg.src = url
      bannerImg.style.display = 'block'
      bannerImg.style.top = `${posY || 0}px`
    }
    if (bannerPlaceholder) bannerPlaceholder.style.display = 'none'
    if (bannerControls) bannerControls.style.display = editEnabled ? 'flex' : 'none'
    if (bannerHint) bannerHint.style.display = editEnabled ? 'block' : 'none'
  } else {
    if (bannerImg) bannerImg.style.display = 'none'
    if (bannerPlaceholder) bannerPlaceholder.style.display = editEnabled ? 'flex' : 'none'
    if (bannerControls) bannerControls.style.display = 'none'
    if (bannerHint) bannerHint.style.display = 'none'
  }
}

async function init() {
  setupTabs()

  const currentUser = await waitForAuth()
  if (!currentUser) {
    window.location.href = 'login.html'
    return
  }

  const viewedUid = getViewedUid(currentUser)
  const isEditable = viewedUid === currentUser.uid

  const messageEl = document.getElementById('message')
  const profileForm = document.getElementById('profile-form')
  const btnToggleProfileEdit = document.getElementById('btn-toggle-profile-edit')

  const fullNameInput = document.getElementById('full_name')
  const nicknameInput = document.getElementById('nickname')
  const birthDateInput = document.getElementById('birth_date')
  const playStyleInput = document.getElementById('play_style')
  const roleInput = document.getElementById('player_role')

  const avatarUrlInput = document.getElementById('avatar_url')
  const bannerUrlInput = document.getElementById('banner_url')
  const bannerPosYInput = document.getElementById('banner_pos_y')
  const bgLayersInput = document.getElementById('bg_layers_json')

  const emailDisplay = document.getElementById('email-display')
  const uidDisplay = document.getElementById('uid-display')
  const emailReadonly = document.getElementById('email-readonly')
  const uidReadonly = document.getElementById('uid-readonly')

  const nicknameDisplay = document.getElementById('nickname-display')
  const roleDisplay = document.getElementById('role-display')

  const avatarContainer = document.getElementById('avatar-container')
  const avatarImg = document.getElementById('avatar-img')
  const avatarPlaceholder = document.getElementById('avatar-placeholder')

  const bannerAdjustContainer = document.getElementById('banner-adjust-container')
  const bannerImg = document.getElementById('banner-img')
  const bannerPlaceholder = document.getElementById('banner-placeholder')
  const bannerControls = document.getElementById('banner-controls')
  const bannerHint = document.getElementById('banner-hint')
  const btnBannerUp = document.getElementById('btn-banner-up')
  const btnBannerDown = document.getElementById('btn-banner-down')

  const sidebarDisplayName = document.getElementById('display-name-sidebar')
  const levelDisplay = document.getElementById('level-display')
  const badgePremium = document.getElementById('badge-premium-status')
  const badgeTitle = document.getElementById('badge-title-status')

  const currentPlanChip = document.getElementById('current-plan-chip')
  const planDisplay = document.getElementById('plan-display')
  const planUpgradeLink = document.getElementById('plan-upgrade-link')
  const planDaysLeft = document.getElementById('plan-days-left')

  const followersCountDisplay = document.getElementById('profile-followers-count')
  const friendsCountDisplay = document.getElementById('profile-friends-count')
  const sheetsCountDisplay = document.getElementById('profile-sheets-count')
  const towerSheetsCountDisplay = document.getElementById('profile-tower-sheets-count')
  const towerRecordDisplay = document.getElementById('tower-record-display')

  const sheetsList = document.getElementById('profile-sheets-list')
  const towerList = document.getElementById('profile-tower-list')

  const recentAvatarsContainer = document.getElementById('recent-avatars-container')
  const recentAvatarsList = document.getElementById('recent-avatars-list')
  const recentBannersContainer = document.getElementById('recent-banners-container')
  const recentBannersList = document.getElementById('recent-banners-list')

  const bioText = document.getElementById('bio-text')
  const bioInput = document.getElementById('bio-input')
  const bioDisplayContainer = document.getElementById('bio-display-container')
  const bioEditContainer = document.getElementById('bio-edit-container')
  const editBioBtn = document.getElementById('edit-bio-btn')
  const cancelBioBtn = document.getElementById('cancel-bio-btn')
  const saveBioBtn = document.getElementById('save-bio-btn')

  const createdAtChip = document.getElementById('created-at-chip')
  const createdAtDisplay = document.getElementById('created-at-display')

  const visitorSection = document.getElementById('profile-visitor')
  const visitorBio = document.getElementById('visitor-bio')
  const visitorPostsList = document.getElementById('visitor-posts-list')
  const visitorPostsEmpty = document.getElementById('visitor-posts-empty')
  const visitorBgGrid = document.getElementById('visitor-bg-grid')
  const visitorBgEmpty = document.getElementById('visitor-bg-empty')
  const visitorFriendsGrid = document.getElementById('visitor-friends-grid')
  const visitorFriendsEmpty = document.getElementById('visitor-friends-empty')
  const visitorSheetsList = document.getElementById('visitor-sheets-list')
  const visitorSheetsEmpty = document.getElementById('visitor-sheets-empty')
  const visitorSessionsCount = document.getElementById('visitor-sessions-count')
  const visitorSessionsTime = document.getElementById('visitor-sessions-time')
  const visitorTowerRecord = document.getElementById('visitor-tower-record')

  const visitorBgModal = document.getElementById('visitor-bg-modal')
  const btnVisitorBgClose = document.getElementById('btn-visitor-bg-close')
  const visitorBgModalMedia = document.getElementById('visitor-bg-modal-media')
  const visitorBgModalLink = document.getElementById('visitor-bg-modal-link')

  const btnToggleFrames = document.getElementById('btn-toggle-frames')
  const frameOptionsContainer = document.getElementById('frame-options-container')
  const previewGlow = document.getElementById('preview-glow')
  const previewBorder = document.getElementById('preview-border')
  const frameStatusEl = document.getElementById('frame-selector-status')

  const bgOpacitySlider = document.getElementById('bg_opacity_slider')
  const bgBlurSlider = document.getElementById('bg_blur_slider')
  const bgOpacityVal = document.getElementById('bg_opacity_val')
  const bgBlurVal = document.getElementById('bg_blur_val')

  const btnAddBgLayer = document.getElementById('btn-add-bg-layer')
  const bgLayersList = document.getElementById('bg-layers-list')

  let planState = null

  let isEditMode = false
  const setEditMode = (enabled) => {
    isEditMode = enabled
    document.body.classList.toggle('profile-edit-enabled', enabled)
    if (btnToggleProfileEdit) {
      btnToggleProfileEdit.textContent = enabled ? 'Concluir' : 'Editar'
      btnToggleProfileEdit.setAttribute('aria-pressed', enabled ? 'true' : 'false')
    }
    updateBannerDisplay(
      bannerUrlInput?.value || '',
      bannerImg,
      bannerPlaceholder,
      bannerControls,
      bannerHint,
      parseInt(bannerPosYInput?.value) || 0
    )
    if (planState && !planState.canChangeAvatarBanner) {
      if (bannerControls) bannerControls.style.display = 'none'
      if (bannerHint) bannerHint.style.display = 'none'
    }
  }

  if (btnToggleProfileEdit) {
    if (!isEditable) {
      btnToggleProfileEdit.style.display = 'none'
    } else {
      btnToggleProfileEdit.onclick = () => setEditMode(!isEditMode)
      setEditMode(false)
    }
  }

  if (emailDisplay) emailDisplay.textContent = isEditable ? (currentUser.email || '-') : '—'
  if (emailReadonly) emailReadonly.value = isEditable ? (currentUser.email || '') : ''
  if (uidReadonly) uidReadonly.value = isEditable ? currentUser.uid : viewedUid
  if (uidDisplay) {
    uidDisplay.style.display = isEditable ? 'inline' : 'none'
    uidDisplay.textContent = isEditable ? currentUser.uid : ''
  }

  if (!isEditable) {
    document.body.classList.add('profile-visitor-mode')
    if (visitorSection) visitorSection.style.display = 'block'
  }

  let currentBannerY = 0
  let isDraggingBanner = false
  let startY = 0
  let startBannerY = 0

  const updateBannerPosition = () => {
    if (bannerImg) bannerImg.style.top = `${currentBannerY}px`
    if (bannerPosYInput) bannerPosYInput.value = `${currentBannerY}`
  }

  if (bannerImg && bannerAdjustContainer) {
    const startDrag = (e) => {
      if (!isEditable) return
      if (!isEditMode) return
      if (!bannerImg.src || bannerImg.style.display === 'none') return
      isDraggingBanner = true
      bannerImg.style.cursor = 'grabbing'
      startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY
      startBannerY = currentBannerY
      e.preventDefault()
    }

    const doDrag = (e) => {
      if (!isEditable) return
      if (!isDraggingBanner) return
      const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY
      const delta = currentY - startY
      currentBannerY = startBannerY + delta
      if (currentBannerY > 0) currentBannerY = 0
      updateBannerPosition()
    }

    const endDrag = () => {
      isDraggingBanner = false
      if (bannerImg) bannerImg.style.cursor = 'grab'
      if (bannerPosYInput) bannerPosYInput.value = `${currentBannerY}`
    }

    bannerAdjustContainer.addEventListener('mousedown', startDrag)
    window.addEventListener('mousemove', doDrag)
    window.addEventListener('mouseup', endDrag)

    bannerAdjustContainer.addEventListener('touchstart', startDrag, { passive: false })
    window.addEventListener('touchmove', doDrag, { passive: false })
    window.addEventListener('touchend', endDrag)

    if (btnBannerUp) {
      btnBannerUp.onclick = (e) => {
        if (!isEditable) return
        if (!isEditMode) return
        e.stopPropagation()
        currentBannerY += 5
        if (currentBannerY > 0) currentBannerY = 0
        updateBannerPosition()
      }
    }
    if (btnBannerDown) {
      btnBannerDown.onclick = (e) => {
        if (!isEditable) return
        if (!isEditMode) return
        e.stopPropagation()
        currentBannerY -= 5
        updateBannerPosition()
      }
    }
  }

  if (nicknameInput) {
    nicknameInput.addEventListener('blur', async () => {
      if (!isEditable) return
      const newNickname = nicknameInput.value.trim().toLowerCase()
      if (!newNickname) return

      try {
        const q = query(collection(db, 'profiles'), where('nickname', '==', newNickname))
        const snapshot = await getDocs(q)
        let taken = false
        snapshot.forEach(d => { if (d.id !== currentUser.uid) taken = true })
        if (taken) {
          nicknameInput.style.borderColor = '#ef4444'
          if (messageEl) {
            messageEl.textContent = 'Este nickname já está em uso.'
            messageEl.style.color = '#ef4444'
          }
        } else {
          nicknameInput.style.borderColor = '#4ade80'
          if (messageEl) messageEl.textContent = ''
        }
      } catch (err) {
        console.error('Erro ao verificar nickname:', err)
      }
    })
  }

  let bgLayers = []
  let recentAvatars = []
  let recentBanners = []

  const formatDateShort = (value) => {
    try {
      if (!value) return null
      const d = value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value))
      if (Number.isNaN(d.getTime())) return null
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    } catch {
      return null
    }
  }

  const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]))

  const openModalLite = (el) => {
    if (!el) return
    el.style.display = 'flex'
    el.classList.add('active')
  }

  const closeModalLite = (el) => {
    if (!el) return
    el.classList.remove('active')
    el.style.display = 'none'
  }

  const formatHours = (minutes) => {
    const m = Math.max(0, parseInt(minutes || 0))
    const h = Math.floor(m / 60)
    const r = m % 60
    if (h <= 0) return `${r}min`
    if (r <= 0) return `${h}h`
    return `${h}h ${r}min`
  }

  const getBestBgOriginUrl = (layer) => {
    const authorUrl = String(layer?.pinterest_author_url || layer?.source_url || '').trim()
    if (authorUrl) return authorUrl
    const pinUrl = String(layer?.pinterest_pin_url || '').trim()
    if (pinUrl) return pinUrl
    const url = String(layer?.url || '').trim()
    if (!url) return '#'
    if (/^https?:\/\/(www\.)?pinterest\./i.test(url)) return url
    if (/^https?:\/\/i\.pinimg\.com\//i.test(url)) {
      try {
        const u = new URL(url)
        const filename = u.pathname.split('/').filter(Boolean).slice(-1)[0] || ''
        const hash = filename.replace(/\.(png|jpe?g|gif|webp)$/i, '')
        const q = hash || url
        return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`
      } catch {
        return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(url)}`
      }
    }
    return url
  }

  const renderVisitorBg = (layers) => {
    if (!visitorBgGrid || !visitorBgEmpty) return
    visitorBgGrid.innerHTML = ''
    const list = Array.isArray(layers) ? layers.slice(0, 9) : []
    visitorBgEmpty.style.display = list.length ? 'none' : 'block'
    list.forEach((layer) => {
      const url = String(layer?.url || '').trim()
      if (!url) return
      const wrap = document.createElement('div')
      wrap.className = 'profile-visitor-thumb'
      wrap.innerHTML = `<img alt="" src="${escHtml(url)}">`
      wrap.addEventListener('click', () => {
        const originUrl = getBestBgOriginUrl(layer)
        if (visitorBgModalMedia) {
          visitorBgModalMedia.innerHTML = `
            <a href="${escHtml(originUrl)}" target="_blank" rel="noopener">
              <img alt="" src="${escHtml(url)}">
            </a>
          `
        }
        if (visitorBgModalLink) visitorBgModalLink.href = originUrl
        openModalLite(visitorBgModal)
      })
      visitorBgGrid.appendChild(wrap)
    })
  }

  const renderVisitorPosts = async (uid) => {
    if (!visitorPostsList || !visitorPostsEmpty) return
    visitorPostsList.innerHTML = ''
    const qPosts = query(collection(db, 'posts'), where('author_id', '==', uid), orderBy('created_at', 'desc'), limit(20))
    const snap = await getDocs(qPosts)
    visitorPostsEmpty.style.display = snap.empty ? 'block' : 'none'
    snap.forEach((d) => {
      const p = d.data() || {}
      const author = p.author || {}
      const name = author.nickname || author.full_name || 'Aventureiro'
      const avatar = author.avatar_url || 'assets/default-avatar.png'
      const type = String(p.type || 'text')
      const createdMs = p.created_at?.toMillis ? p.created_at.toMillis() : 0
      const date = createdMs ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(createdMs)) : ''
      const text = String(p.text || '').trim()
      const img = String(p.image_url || '').trim()

      const card = document.createElement('div')
      card.className = 'profile-post-item'
      card.innerHTML = `
        <div class="profile-post-head">
          <div class="profile-post-author">
            <div class="profile-post-avatar"><img alt="" src="${escHtml(avatar)}"></div>
            <div class="profile-post-meta">
              <div class="profile-post-name">${escHtml(name)}</div>
              <div class="profile-post-sub">${escHtml(date)}${type === 'repost' ? ' • Repost' : ''}${type === 'sheet' ? ' • Ficha' : ''}</div>
            </div>
          </div>
        </div>
        ${text ? `<div class="profile-post-text">${escHtml(text)}</div>` : ''}
        ${img ? `<div class="profile-post-media"><img alt="" src="${escHtml(img)}"></div>` : ''}
      `
      card.addEventListener('click', () => {
        window.location.href = `post.html?id=${encodeURIComponent(d.id)}&from=${encodeURIComponent('profile.html?uid=' + uid)}`
      })
      visitorPostsList.appendChild(card)
    })
  }

  const renderVisitorFriends = async (uid) => {

    const verify = !visitorFriendsGrid || !visitorFriendsEmpty;
    if (verify) {
      return
    }
    visitorFriendsGrid.innerHTML = ''
    const qFriends = query(collection(db, 'friendships'), where('participants', 'array-contains', uid), where('status', '==', 'accepted'), limit(12))
    const snap = await getDocs(qFriends)
    if (snap.empty) {
      visitorFriendsEmpty.style.display = 'block'
      return
    }
    visitorFriendsEmpty.style.display = 'none'
      
    const friendUids = []
    snap.forEach((d) => {
      const f = d.data() || {}
      const parts = Array.isArray(f.participants) ? f.participants : []
      const other = parts.find((p) => p && p !== uid)
      if (other) friendUids.push(other)
    })
    for (const otherUid of friendUids.slice(0, 9)) {
      try {
        const pDoc = await getDoc(doc(db, 'profiles', otherUid))
        const p = pDoc.exists() ? (pDoc.data() || {}) : {}
        const name = p.nickname || p.full_name || 'Aventureiro'
        const avatar = p.avatar_url || 'assets/default-avatar.png'
        const el = document.createElement('div')
        el.className = 'profile-visitor-friend profile-visitor-friend-item'
        el.innerHTML = `
          <div class="profile-visitor-thumb"><img alt="" src="${escHtml(avatar)}"></div>
          <div class="profile-visitor-username">${escHtml(name)}</div>
        `
        el.addEventListener('click', () => {
          window.location.href = `profile.html?uid=${encodeURIComponent(otherUid)}`
        })
      visitorFriendsGrid.appendChild(el)
      } catch {}
    }
  }

  const renderVisitorSheets = async (uid) => {
    if (!visitorSheetsList || !visitorSheetsEmpty) return
    visitorSheetsList.innerHTML = ''
    const qSheets = query(collection(db, 'sheets'), where('user_id', '==', uid), orderBy('updated_at', 'desc'), limit(10))
    const snap = await getDocs(qSheets)
    visitorSheetsEmpty.style.display = snap.empty ? 'block' : 'none'
    snap.forEach((d) => {
      const s = d.data() || {}
      const name = s.name || 'Ficha'
      const row = document.createElement('div')
      row.className = 'profile-visitor-sheet'
      row.innerHTML = `
        <div style="min-width:0; overflow:hidden;">
          <strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(name)}</strong>
          <div style="color: rgba(255,255,255,0.55); font-size:0.85rem;">Somente visualização</div>
        </div>
        <a class="btn-secondary" href="sheet-editor.html?id=${encodeURIComponent(d.id)}&readonly=1">Abrir</a>
      `
      visitorSheetsList.appendChild(row)
    })
  }

  try {
    const profileRef = doc(db, 'profiles', viewedUid)
    let profileDoc = await getDoc(profileRef)
    let profile = profileDoc.exists() ? profileDoc.data() : null

    if (!profile && isEditable) {
      const fallbackNickname = String(currentUser.email || '').split('@')[0]?.toLowerCase() || 'aventureiro'
      const seed = {
        full_name: currentUser.displayName || '',
        nickname: fallbackNickname,
        email: currentUser.email || '',
        provider: currentUser.providerData?.[0]?.providerId || 'unknown',
        plan: 'free',
        plan_status: 'free',
        created_at: new Date(),
        updated_at: new Date()
      }
      await setDoc(profileRef, seed, { merge: true })
      profileDoc = await getDoc(profileRef)
      profile = profileDoc.exists() ? profileDoc.data() : seed
    }
    const safeProfile = profile || {}

    const isUserAdmin = !!safeProfile?.is_admin || (isEditable && currentUser.email === 'hayagames@outlook.com')
    planState = getPlanState({ user: currentUser, profile: safeProfile })
    const level = safeProfile?.level || 1
    const currentXP = Number.isFinite(safeProfile?.xp) ? safeProfile.xp : (parseInt(safeProfile?.xp) || 0)

    if (levelDisplay) levelDisplay.textContent = `${level}`
    if (badgePremium) badgePremium.style.display = planState.isPaid ? 'inline-flex' : 'none'
    if (badgeTitle) {
      badgeTitle.style.display = 'inline-flex'
      badgeTitle.textContent = isUserAdmin ? 'ADM' : (safeProfile?.title || 'Jogador')
    }

    if (planDisplay) planDisplay.textContent = planState.displayName
    if (planUpgradeLink) {
      const showUpgrade = isEditable && !planState.admin && planState.key === 'free'
      planUpgradeLink.style.display = showUpgrade ? 'inline-flex' : 'none'
      planUpgradeLink.href = upgradeHref()
    }

    const updatePlanDays = () => {
      if (!planDaysLeft) return
      if (!isEditable || planState.admin || planState.key === 'free') {
        planDaysLeft.style.display = 'none'
        planDaysLeft.textContent = ''
        return
      }
      if (String(planState.status || '') === 'canceling' && Number.isFinite(planState.remainingDays)) {
        planDaysLeft.style.display = 'inline'
        planDaysLeft.textContent = `Volta ao Free em ${planState.remainingDays} dia(s)`
        return
      }
      planDaysLeft.style.display = 'none'
      planDaysLeft.textContent = ''
    }
    updatePlanDays()

    if (currentPlanChip) {
      currentPlanChip.onclick = async () => {
        if (!isEditable) return
        if (planState.admin) {
          alert('Conta ADM tem acesso ilimitado.')
          return
        }
        if (planState.key === 'free') {
          window.location.href = upgradeHref()
          return
        }
        const days = Number.isFinite(planState.remainingDays) ? planState.remainingDays : null
        if (String(planState.status || '') === 'canceling') {
          alert(days !== null ? `Seu plano já está em cancelamento. Faltam ${days} dia(s) para voltar ao Free.` : 'Seu plano já está em cancelamento.')
          return
        }
        const msg = days !== null
          ? `Cancelar seu plano atual? Você continuará com acesso por ${days} dia(s) e depois voltará ao Free.`
          : 'Cancelar seu plano atual?'
        if (!confirm(msg)) return

        const expiresAt = planState.periodEndsAt || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        const nextDays = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))

        await setDoc(doc(db, 'profiles', currentUser.uid), {
          plan_status: 'canceling',
          plan_cancel_at: serverTimestamp(),
          plan_expires_at: expiresAt,
          updated_at: serverTimestamp()
        }, { merge: true })

        planState = {
          ...planState,
          status: 'canceling',
          periodEndsAt: expiresAt,
          remainingDays: nextDays
        }
        updatePlanDays()
      }
    }

    const displayName = safeProfile?.nickname || safeProfile?.full_name || currentUser.displayName || currentUser.email || 'Viajante'
    if (sidebarDisplayName) sidebarDisplayName.textContent = displayName


    if (nicknameInput) nicknameInput.value = safeProfile.nickname || ''
    if (fullNameInput) fullNameInput.value = safeProfile.full_name || ''
    if (birthDateInput) birthDateInput.value = safeProfile.birth_date || ''
    if (playStyleInput) playStyleInput.value = safeProfile.play_style || ''

    const role = safeProfile?.player_role || 'Jogador'
    if (roleInput) roleInput.value = role
    if (roleDisplay) roleDisplay.textContent = role

    if (nicknameDisplay) nicknameDisplay.textContent = (safeProfile?.nickname || safeProfile?.full_name || '—')

    if (bioText) bioText.textContent = safeProfile?.bio || 'Este aventureiro ainda não contou sua história...'
    if (bioInput) bioInput.value = safeProfile?.bio || ''

    if (friendsCountDisplay) friendsCountDisplay.textContent = `${safeProfile?.friends_count || 0}`
    if (followersCountDisplay) followersCountDisplay.textContent = `${safeProfile?.followers_count || 0}`
    if (towerRecordDisplay) towerRecordDisplay.textContent = `${safeProfile?.tower_record || 0}`

    if (avatarUrlInput) avatarUrlInput.value = safeProfile?.avatar_url || ''
    if (bannerUrlInput) bannerUrlInput.value = safeProfile?.banner_url || ''

    currentBannerY = parseInt(safeProfile?.banner_pos_y) || 0
    if (bannerPosYInput) bannerPosYInput.value = `${currentBannerY}`

    updateAvatarDisplay(safeProfile?.avatar_url, avatarImg, avatarPlaceholder, selectedFrame)
    updateBannerDisplay(safeProfile?.banner_url, bannerImg, bannerPlaceholder, bannerControls, bannerHint, currentBannerY)

    const unlockedFrames = await checkAndUnlockFrames(viewedUid, level, safeProfile?.unlocked_frames || ['wood'])
    selectedFrame = isUserAdmin ? 'ADM' : (safeProfile?.current_frame || 'wood')
    if (planState && !planState.canUseFrames && !isUserAdmin) selectedFrame = 'wood'
    updateAvatarDisplay(safeProfile?.avatar_url, avatarImg, avatarPlaceholder, selectedFrame)

    const FRAME_INFO = {
      wood: { name: 'Ametista Sombria', level: 1 },
      iron: { name: 'Safira Celestial', level: 5 },
      bronze: { name: 'Topázio Solar', level: 10 },
      silver: { name: 'Rubi Infernal', level: 20 },
      gold: { name: 'Esmeralda Ancestral', level: 30 },
      platinum: { name: 'Opala Arcana', level: 40 },
      ADM: { name: 'ADM', level: 999 }
    }

    const FRAME_ORDER = ['wood', 'iron', 'bronze', 'silver', 'gold', 'platinum', 'ADM']

    const xpToReachLevel = (fromLevel, xpInLevel, targetLevel) => {
      if (!targetLevel || targetLevel <= fromLevel) return 0
      const safeXp = Math.max(0, Number.isFinite(xpInLevel) ? xpInLevel : 0)
      let missing = Math.max(0, (fromLevel * 500) - safeXp)
      for (let lvl = fromLevel + 1; lvl < targetLevel; lvl++) missing += (lvl * 500)
      return missing
    }

    const getNextFrameTarget = (fromLevel) => {
      for (const id of FRAME_ORDER) {
        const f = FRAME_INFO[id]
        if (f && f.level > fromLevel) return { id, ...f }
      }
      return null
    }

    const updateFrameStatus = () => {
      if (!frameStatusEl) return
      const currentName = FRAME_INFO[selectedFrame]?.name || '—'
      const base = `Borda: ${currentName}`
      if (selectedFrame === 'ADM') {
        frameStatusEl.textContent = base
        return
      }
      const next = getNextFrameTarget(level)
      if (!next) {
        frameStatusEl.textContent = base
        return
      }
      const missing = xpToReachLevel(level, currentXP, next.level)
      frameStatusEl.textContent = `${base} • Falta ${missing.toLocaleString('pt-BR')} XP para ${next.name}`
    }

    if (frameOptionsContainer && btnToggleFrames) {
      const framesLockedByPlan = !!(planState && !planState.canUseFrames && !isUserAdmin)
      if (framesLockedByPlan) {
        btnToggleFrames.disabled = false
        btnToggleFrames.style.opacity = '0.55'
      }

      const frames = [
        { id: 'wood', name: 'Ametista Sombria' },
        { id: 'iron', name: 'Safira Celestial' },
        { id: 'bronze', name: 'Topázio Solar' },
        { id: 'silver', name: 'Rubi Infernal' },
        { id: 'gold', name: 'Esmeralda Ancestral' },
        { id: 'platinum', name: 'Opala Arcana' },
        { id: 'ADM', name: 'ADM' },
      ]
    // if (isUserAdmin) frames.push({ id: 'ADM', name: 'ADM' })

      function updatePreview(frameId) {
        if (previewGlow) {
          previewGlow.className = 'frame-glow'
          previewGlow.classList.add(`glow-${frameId.toLowerCase()}`)
        }
        if (previewBorder) {
          previewBorder.className = 'frame-border'
          previewBorder.classList.add(`frame-${frameId.toLowerCase()}`)
        }
      }

      updatePreview(selectedFrame)
      updateFrameStatus()
      if (btnToggleFrames.disabled && frameStatusEl) {
        frameStatusEl.textContent = 'Borda: Ametista Sombria • Disponível no plano Lenda'
      }

      btnToggleFrames.onclick = (e) => {
        e.preventDefault()
        if (btnToggleFrames.disabled) return
        const isOpen = frameOptionsContainer.classList.toggle('show')
        btnToggleFrames.classList.toggle('active', isOpen)
        btnToggleFrames.innerHTML = isOpen ? '<i class="fas fa-times"></i>' : '<i class="fas fa-plus"></i>'
      }

      frameOptionsContainer.innerHTML = ''
      frames.forEach(frame => {
        const isUnlocked = unlockedFrames.includes(frame.id) || isUserAdmin
        const isActive = selectedFrame === frame.id
        const el = document.createElement('div')
        el.className = `frame-option ${frame.id} ${isUnlocked ? 'unlocked' : ''} ${isActive ? 'active' : ''}`
        el.title = isUnlocked ? frame.name : `${frame.name} (Bloqueado)`
        el.innerHTML = `
          <div class="option-glow glow-${frame.id.toLowerCase()}"></div>
          <div class="option-border frame-${frame.id.toLowerCase()}"></div>
        `
        if (isEditable && isUnlocked && !btnToggleFrames.disabled) {
          el.onclick = () => {
            selectedFrame = frame.id
            document.querySelectorAll('.frame-option').forEach(opt => opt.classList.remove('active'))
            el.classList.add('active')
            updatePreview(selectedFrame)
            updateFrameStatus()
            updateAvatarDisplay(avatarUrlInput?.value, avatarImg, avatarPlaceholder, selectedFrame)
            frameOptionsContainer.classList.remove('show')
            btnToggleFrames.classList.remove('active')
            btnToggleFrames.innerHTML = '<i class="fas fa-plus"></i>'
          }
        }
        frameOptionsContainer.appendChild(el)
      })
    }

    recentAvatars = Array.isArray(safeProfile?.recent_avatars) ? safeProfile.recent_avatars.filter(Boolean) : []
    recentBanners = Array.isArray(safeProfile?.recent_banners) ? safeProfile.recent_banners.filter(Boolean) : []

    renderRecentThumbs(recentAvatars, recentAvatarsContainer, recentAvatarsList, 'avatar', (url) => {
      if (!isEditable) return
      if (avatarUrlInput) avatarUrlInput.value = url
      updateAvatarDisplay(url, avatarImg, avatarPlaceholder, selectedFrame)
    })

    renderRecentThumbs(recentBanners, recentBannersContainer, recentBannersList, 'banner', (url) => {
      if (!isEditable) return
      if (bannerUrlInput) bannerUrlInput.value = url
      currentBannerY = 0
      updateBannerDisplay(url, bannerImg, bannerPlaceholder, bannerControls, bannerHint, currentBannerY)
      updateBannerPosition()
    })

    bgLayers = normalizeBgLayers(safeProfile?.background_layers || [])
    if (bgLayersInput) bgLayersInput.value = JSON.stringify(bgLayers)
    renderBgLayers(bgLayers)
    if (planState && !planState.canUseBgLayers && !isUserAdmin) {
      if (btnAddBgLayer) btnAddBgLayer.disabled = true
      if (bgOpacitySlider) bgOpacitySlider.disabled = true
      if (bgBlurSlider) bgBlurSlider.disabled = true
      if (bgLayersList) bgLayersList.style.opacity = '0.65'
    }
    renderBgLayersManager(bgLayers, (next) => {
      if (planState && !planState.canUseBgLayers && !isUserAdmin) return
      bgLayers = next
      if (bgLayersInput) bgLayersInput.value = JSON.stringify(bgLayers)
      renderBgLayers(bgLayers)
    })

    const initialOpacity = safeProfile?.bg_opacity !== undefined ? safeProfile.bg_opacity : 20
    const initialBlur = safeProfile?.bg_blur !== undefined ? safeProfile.bg_blur : 0
    
    if (bgOpacitySlider) bgOpacitySlider.value = initialOpacity
    if (bgBlurSlider) bgBlurSlider.value = initialBlur
    if (bgOpacityVal) bgOpacityVal.textContent = `${initialOpacity}%`
    if (bgBlurVal) bgBlurVal.textContent = `${initialBlur}px`
    
    document.documentElement.style.setProperty('--bg-global-opacity', initialOpacity / 100)
    document.documentElement.style.setProperty('--bg-global-blur', `${initialBlur}px`)

    const createdAtText = formatDateShort(safeProfile?.created_at) || formatDateShort(safeProfile?.updated_at) || null
    if (createdAtChip && createdAtDisplay && createdAtText) {
      createdAtDisplay.textContent = createdAtText
      createdAtChip.style.display = 'inline-flex'
    }

    if (isEditable && !safeProfile?.created_at) {
      const creationTime = currentUser?.metadata?.creationTime ? new Date(currentUser.metadata.creationTime) : null
      if (creationTime) {
        setDoc(doc(db, 'profiles', currentUser.uid), { created_at: creationTime }, { merge: true }).catch(() => {})
      }
    }

    if (!isEditable) {
      if (visitorSection) visitorSection.style.display = 'block'
      if (visitorBio) visitorBio.textContent = safeProfile?.bio || 'Este aventureiro ainda não contou sua história...'
      if (visitorTowerRecord) visitorTowerRecord.textContent = `${safeProfile?.tower_record || 0}`
      if (visitorSessionsCount) visitorSessionsCount.textContent = `${safeProfile?.sessions_count || 0}`
      if (visitorSessionsTime) visitorSessionsTime.textContent = formatHours(safeProfile?.sessions_total_minutes || 0)

      renderVisitorBg(bgLayers)
      renderVisitorPosts(viewedUid).catch(() => {})
      renderVisitorFriends(viewedUid).catch(() => {})
      renderVisitorSheets(viewedUid).catch(() => {})
    }

    if (isEditable && bgOpacitySlider) {
      bgOpacitySlider.addEventListener('input', (e) => {
        const val = e.target.value
        if (bgOpacityVal) bgOpacityVal.textContent = `${val}%`
        document.documentElement.style.setProperty('--bg-global-opacity', val / 100)
      })
    }
    
    if (isEditable && bgBlurSlider) {
      bgBlurSlider.addEventListener('input', (e) => {
        const val = e.target.value
        if (bgBlurVal) bgBlurVal.textContent = `${val}px`
        document.documentElement.style.setProperty('--bg-global-blur', `${val}px`)
      })
    }

  } catch (error) {
    console.error('Erro ao carregar perfil:', error)
    if (messageEl) {
      messageEl.textContent = `Erro ao carregar perfil: ${error?.message || error}`
      messageEl.style.color = '#ef4444'
    }
  }

  if (btnVisitorBgClose && visitorBgModal) btnVisitorBgClose.onclick = () => closeModalLite(visitorBgModal)
  if (visitorBgModal) {
    visitorBgModal.addEventListener('click', (e) => {
      if (e.target === visitorBgModal) closeModalLite(visitorBgModal)
    })
  }

  if (editBioBtn) {
    editBioBtn.onclick = () => {
      if (!isEditable) return
      if (bioDisplayContainer) bioDisplayContainer.style.display = 'none'
      if (bioEditContainer) bioEditContainer.style.display = 'block'
    }
  }

  if (cancelBioBtn) {
    cancelBioBtn.onclick = () => {
      if (bioDisplayContainer) bioDisplayContainer.style.display = 'block'
      if (bioEditContainer) bioEditContainer.style.display = 'none'
      if (bioInput && bioText) bioInput.value = bioText.textContent === 'Este aventureiro ainda não contou sua história...' ? '' : bioText.textContent
    }
  }

  if (saveBioBtn) {
    saveBioBtn.onclick = async () => {
      if (!isEditable) return
      const newBio = (bioInput?.value || '').trim()
      saveBioBtn.disabled = true
      const prevText = saveBioBtn.textContent
      saveBioBtn.textContent = 'Salvando...'
      try {
        await setDoc(doc(db, 'profiles', currentUser.uid), { bio: newBio }, { merge: true })
        if (bioText) bioText.textContent = newBio || 'Este aventureiro ainda não contou sua história...'
        if (bioDisplayContainer) bioDisplayContainer.style.display = 'block'
        if (bioEditContainer) bioEditContainer.style.display = 'none'
      } catch (err) {
        console.error('Erro ao salvar bio:', err)
      } finally {
        saveBioBtn.disabled = false
        saveBioBtn.textContent = prevText
      }
    }
  }

  if (avatarContainer) {
    avatarContainer.onclick = () => {
      if (!isEditable) return
      if (!isEditMode) return
      if (planState && !planState.canChangeAvatarBanner) {
        if (confirm('Troca de foto de perfil é um recurso pago. Quer ver os planos?')) window.location.href = upgradeHref()
        return
      }
      const currentUrl = avatarUrlInput?.value || ''
      const url = prompt('Insira a URL da sua foto de perfil:', currentUrl)
      if (url === null) return
      if (avatarUrlInput) avatarUrlInput.value = url
      updateAvatarDisplay(url, avatarImg, avatarPlaceholder, selectedFrame)
      recentAvatars = updateRecentList(recentAvatars, url)
      renderRecentThumbs(recentAvatars, recentAvatarsContainer, recentAvatarsList, 'avatar', (picked) => {
        if (!isEditable) return
        if (avatarUrlInput) avatarUrlInput.value = picked
        updateAvatarDisplay(picked, avatarImg, avatarPlaceholder, selectedFrame)
      })
    }
  }

  if (bannerAdjustContainer) {
    bannerAdjustContainer.onclick = (e) => {
      if (!isEditable) return
      if (!isEditMode) return
      if (planState && !planState.canChangeAvatarBanner) {
        if (confirm('Troca de banner é um recurso pago. Quer ver os planos?')) window.location.href = upgradeHref()
        return
      }
      if (e.target.closest('#banner-controls')) return
      const currentUrl = bannerUrlInput?.value || ''
      const url = prompt('Insira a URL da imagem de banner:', currentUrl)
      if (url === null) return
      if (bannerUrlInput) bannerUrlInput.value = url
      currentBannerY = 0
      updateBannerDisplay(url, bannerImg, bannerPlaceholder, bannerControls, bannerHint, currentBannerY)
      updateBannerPosition()
      recentBanners = updateRecentList(recentBanners, url)
      renderRecentThumbs(recentBanners, recentBannersContainer, recentBannersList, 'banner', (picked) => {
        if (!isEditable) return
        if (bannerUrlInput) bannerUrlInput.value = picked
        currentBannerY = 0
        updateBannerDisplay(picked, bannerImg, bannerPlaceholder, bannerControls, bannerHint, currentBannerY)
        updateBannerPosition()
      })
    }
  }

  const renderSheets = async () => {
    try {
      const q = query(collection(db, 'sheets'), where('user_id', '==', viewedUid), orderBy('updated_at', 'desc'), limit(8))
      const snap = await getDocs(q)
      if (sheetsCountDisplay) sheetsCountDisplay.textContent = `${snap.size}`
      if (!sheetsList) return
      sheetsList.innerHTML = ''
      snap.forEach(d => {
        const data = d.data()
        const name = data?.name || data?.data?.nomePersonagem || `Ficha ${d.id}`
        const el = document.createElement('div')
        el.className = 'profile-list-item'
        el.innerHTML = `<span>${name}</span><a href="ficha-dnd.html?id=${d.id}" class="btn-secondary" style="padding:6px 10px;">Abrir</a>`
        sheetsList.appendChild(el)
      })
      if (snap.size === 0) sheetsList.innerHTML = `<div class="profile-muted">Nenhuma ficha encontrada.</div>`
    } catch (err) {
      console.error('Erro ao carregar fichas:', err)
    }
  }

  const renderTower = async () => {
    try {
      const q = query(collection(db, 'tower_sheets'), where('user_id', '==', viewedUid), orderBy('updated_at', 'desc'), limit(8))
      const snap = await getDocs(q)
      if (towerSheetsCountDisplay) towerSheetsCountDisplay.textContent = `${snap.size}`
      if (!towerList) return
      towerList.innerHTML = ''
      snap.forEach(d => {
        const data = d.data()
        const name = data?.nickname || `Torre ${d.id}`
        const floor = Number.isFinite(data?.floor) ? data.floor : (data?.floor || 0)
        const sheetId = data?.sheet_id
        const el = document.createElement('div')
        el.className = 'profile-list-item'
        const right = sheetId ? `<a href="ficha-dnd.html?id=${sheetId}" class="btn-secondary" style="padding:6px 10px;">Ficha</a>` : `<a href="tower.html" class="btn-secondary" style="padding:6px 10px;">Torre</a>`
        el.innerHTML = `<span>${name} <span class="profile-muted" style="font-weight:700;">(Andar ${floor})</span></span>${right}`
        towerList.appendChild(el)
      })
      if (snap.size === 0) towerList.innerHTML = `<div class="profile-muted">Nenhum progresso na torre.</div>`
    } catch (err) {
      console.error('Erro ao carregar torre:', err)
    }
  }

  await Promise.all([renderSheets(), renderTower()])

  if (profileForm) {
    if (!isEditable) {
      const submitBtn = profileForm.querySelector('button[type="submit"]')
      if (submitBtn) submitBtn.style.display = 'none'
      if (bannerControls) bannerControls.style.display = 'none'
      if (bannerHint) bannerHint.style.display = 'none'
      ;[fullNameInput, nicknameInput, birthDateInput, playStyleInput, roleInput, bgOpacitySlider, bgBlurSlider].forEach(el => { if (el) el.disabled = true })
      const btnAddBg = document.getElementById('btn-add-bg-layer')
      if (btnAddBg) btnAddBg.style.display = 'none'
      if (messageEl) {
        messageEl.textContent = 'Visualizando perfil (somente leitura).'
        messageEl.style.color = 'rgba(255,255,255,0.65)'
      }
    }

    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!isEditable) return

      if (messageEl) {
        messageEl.textContent = 'Salvando...'
        messageEl.style.color = '#888'
      }

      const newNickname = (nicknameInput?.value || '').trim().toLowerCase()
      try {
        if (newNickname) {
          const q = query(collection(db, 'profiles'), where('nickname', '==', newNickname))
          const snapshot = await getDocs(q)
          let taken = false
          snapshot.forEach(d => { if (d.id !== currentUser.uid) taken = true })
          if (taken) {
            if (messageEl) {
              messageEl.textContent = 'Erro: Este nickname já está em uso.'
              messageEl.style.color = '#ef4444'
            }
            if (nicknameInput) nicknameInput.style.borderColor = '#ef4444'
            return
          }
        }

        const canAvatarBanner = !!planState?.canChangeAvatarBanner
        const canFrames = !!planState?.canUseFrames
        const canBg = !!planState?.canUseBgLayers

        const bgLayersValue = normalizeBgLayers(safeJsonParse(bgLayersInput?.value || '[]', []))
        if (canAvatarBanner) {
          recentAvatars = updateRecentList(recentAvatars, avatarUrlInput?.value)
          recentBanners = updateRecentList(recentBanners, bannerUrlInput?.value)
        }

        let updates = {
          full_name: fullNameInput ? fullNameInput.value : '',
          nickname: nicknameInput ? nicknameInput.value : '',
          email: currentUser.email,
          birth_date: birthDateInput ? (birthDateInput.value || null) : null,
          play_style: playStyleInput ? playStyleInput.value : '',
          player_role: roleInput ? roleInput.value : 'Jogador',
          avatar_url: avatarUrlInput ? (avatarUrlInput.value || null) : null,
          banner_url: bannerUrlInput ? (bannerUrlInput.value || null) : null,
          banner_pos_y: bannerPosYInput ? parseInt(bannerPosYInput.value) : 0,
          recent_avatars: recentAvatars,
          recent_banners: recentBanners,
          current_frame: selectedFrame,
          background_layers: bgLayersValue,
          bg_opacity: bgOpacitySlider ? parseInt(bgOpacitySlider.value) : 20,
          bg_blur: bgBlurSlider ? parseInt(bgBlurSlider.value) : 0,
          updated_at: serverTimestamp()
        }

        if (!canAvatarBanner) {
          delete updates.avatar_url
          delete updates.banner_url
          delete updates.banner_pos_y
          delete updates.recent_avatars
          delete updates.recent_banners
        }
        if (!canFrames) {
          updates.current_frame = 'wood'
        }
        if (!canBg) {
          delete updates.background_layers
          delete updates.bg_opacity
          delete updates.bg_blur
        }

        await setDoc(doc(db, 'profiles', currentUser.uid), updates, { merge: true })

        const displayName = updates.nickname || updates.full_name || currentUser.email
        if (sidebarDisplayName) sidebarDisplayName.textContent = displayName
        if (nicknameDisplay) nicknameDisplay.textContent = updates.nickname || updates.full_name || '—'
        if (roleDisplay) roleDisplay.textContent = updates.player_role || 'Jogador'

        renderRecentThumbs(updates.recent_avatars, recentAvatarsContainer, recentAvatarsList, 'avatar', (url) => {
          if (!isEditable) return
          if (avatarUrlInput) avatarUrlInput.value = url
          updateAvatarDisplay(url, avatarImg, avatarPlaceholder, selectedFrame)
        })

        renderRecentThumbs(updates.recent_banners, recentBannersContainer, recentBannersList, 'banner', (url) => {
          if (!isEditable) return
          if (bannerUrlInput) bannerUrlInput.value = url
          currentBannerY = 0
          updateBannerDisplay(url, bannerImg, bannerPlaceholder, bannerControls, bannerHint, currentBannerY)
          updateBannerPosition()
        })

        if (messageEl) {
          messageEl.textContent = 'Perfil atualizado com sucesso!'
          messageEl.style.color = '#4ade80'
        }
      } catch (error) {
        console.error('Save error:', error)
        if (messageEl) {
          messageEl.textContent = `Erro ao salvar: ${error.message}`
          messageEl.style.color = '#ef4444'
        }
      }
    })
  }
}

init()
