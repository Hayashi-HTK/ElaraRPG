const DEFAULT_AVATAR = 'assets/default-avatar.png'

const getEl = (id) => document.getElementById(id)

const params = new URLSearchParams(window.location.search)
const isReadonly = params.get('readonly') === '1'

let isInIframe = false
try {
  isInIframe = window.self !== window.top
} catch {
  isInIframe = true
}

if (isInIframe || params.get('view') === 'iframe' || params.get('view') === 'true') {
  document.body.classList.add('view-iframe')
}

const isIframeView = document.body.classList.contains('view-iframe')

function setupStandbyActivityBridge() {
  if (!isIframeView) return
  let last = 0
  const ping = () => {
    const now = Date.now()
    if (now - last < 800) return
    last = now
    try {
      window.parent?.postMessage({ type: 'standby-activity' }, '*')
    } catch {}
  }
  ;['mousemove', 'mousedown', 'touchstart', 'scroll', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, ping, { passive: true })
  })
  ping()
  setInterval(ping, 45000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupStandbyActivityBridge)
} else {
  setupStandbyActivityBridge()
}

function fitToIframeViewport() {
  if (!isIframeView) return
  const shell = document.querySelector('.shell')
  if (!shell) return
  try {
    shell.style.setProperty('--iframe-scale', '1')
    requestAnimationFrame(() => {
      const rawH = Math.max(shell.scrollHeight || 0, 1)
      const avail = Math.max(window.innerHeight - 8, 280)
      const scale = Math.min(1, avail / rawH)
      shell.style.setProperty('--iframe-scale', String(scale))
      try {
        window.parent?.postMessage({ type: 'sheet-iframe-height', height: Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0) }, '*')
      } catch {}
    })
  } catch {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(fitToIframeViewport, 140)
    setTimeout(fitToIframeViewport, 900)
  })
} else {
  setTimeout(fitToIframeViewport, 140)
  setTimeout(fitToIframeViewport, 900)
}

window.addEventListener('resize', () => {
  setTimeout(fitToIframeViewport, 140)
})

const state = {
  image: DEFAULT_AVATAR,
  theme: 'dark',
  abilities: [],
  customAttributes: [],
  editingAbilityId: null
}

const NUMERIC_IDS = new Set([
  'attr-str',
  'attr-dex',
  'attr-con',
  'attr-int',
  'attr-wis',
  'attr-cha',
  'ac',
  'hpMax',
  'hpCurrent'
])

const FIELD_IDS = [
  'nomePersonagem',
  'nickname',
  'classLevel',
  'background',
  'attr-str',
  'attr-dex',
  'attr-con',
  'attr-int',
  'attr-wis',
  'attr-cha',
  'ac',
  'initiative',
  'speed',
  'hpMax',
  'hpCurrent',
  'attacks',
  'traits',
  'proficiencies'
]

function toNumber(raw) {
  const n = Number(String(raw ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function fmtMod(n) {
  const v = Number.isFinite(n) ? n : 0
  return v >= 0 ? `+${v}` : String(v)
}

function calcMod(score) {
  const s = Number.isFinite(score) ? score : 0
  return Math.floor((s - 10) / 2)
}

function readField(id) {
  const el = getEl(id)
  if (!el) return undefined
  if (NUMERIC_IDS.has(id)) return toNumber(el.value)
  return String(el.value ?? '')
}

function writeField(id, value) {
  const el = getEl(id)
  if (!el) return
  if (NUMERIC_IDS.has(id)) el.value = String(toNumber(value))
  else el.value = String(value ?? '')
}

function setAvatar(url) {
  state.image = String(url || DEFAULT_AVATAR)
  const img = getEl('avatar-img')
  if (img) img.src = state.image
  const input = getEl('avatar-url')
  if (input) input.value = state.image === DEFAULT_AVATAR ? '' : state.image
}

function applyTheme(theme) {
  const t = theme === 'light' || theme === 'parchment' ? theme : 'dark'
  state.theme = t
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-parchment')
  document.body.classList.add(`theme-${t}`)
  document.querySelectorAll('.theme-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === t)
  })
}

function renderCustomAttributes() {
  const container = getEl('custom-attributes-container')
  if (!container) return
  container.innerHTML = ''
  
  const list = Array.isArray(state.customAttributes) ? state.customAttributes : []
  list.forEach((attr) => {
    const card = document.createElement('div')
    card.className = 'attr-card custom-attr'
    card.dataset.id = attr.id
    
    card.innerHTML = `
      <div class="attr-title">
        <input type="text" value="${attr.name || 'Novo Atributo'}" class="custom-attr-name" ${isReadonly ? 'disabled' : ''}>
      </div>
      <div class="attr-main">
        <button class="attr-btn custom-attr-btn" data-delta="-1" type="button" ${isReadonly ? 'disabled' : ''}>-</button>
        <input class="custom-attr-val" type="number" value="${attr.value || 0}" ${isReadonly ? 'disabled' : ''} />
        <button class="attr-btn custom-attr-btn" data-delta="1" type="button" ${isReadonly ? 'disabled' : ''}>+</button>
      </div>
      <div class="attr-mod custom-attr-mod">${fmtMod(calcMod(attr.value || 0))}</div>
      ${!isReadonly ? `<button class="attr-btn delete-attr-btn" title="Excluir atributo" type="button" style="color: var(--accent); margin-left: -4px;"><i class="fas fa-trash"></i>×</button>` : ''}
    `
    container.appendChild(card)
    
    if (isReadonly) return

    const nameInput = card.querySelector('.custom-attr-name')
    const valInput = card.querySelector('.custom-attr-val')
    const modDisplay = card.querySelector('.custom-attr-mod')
    
    nameInput.addEventListener('input', () => {
      attr.name = nameInput.value
      emitChange()
    })
    
    const updateVal = (newVal) => {
      attr.value = newVal
      valInput.value = newVal
      modDisplay.textContent = fmtMod(calcMod(newVal))
      emitChange()
    }
    
    valInput.addEventListener('input', () => {
      updateVal(toNumber(valInput.value))
    })
    
    card.querySelectorAll('.custom-attr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = toNumber(btn.dataset.delta)
        updateVal(toNumber(attr.value) + delta)
      })
    })
    
    const deleteBtn = card.querySelector('.delete-attr-btn')
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        state.customAttributes = state.customAttributes.filter(a => a.id !== attr.id)
        renderCustomAttributes()
        emitChange()
      })
    }
  })
}

function updateMods() {
  const map = [
    ['str', 'mod-str'],
    ['dex', 'mod-dex'],
    ['con', 'mod-con'],
    ['int', 'mod-int'],
    ['wis', 'mod-wis'],
    ['cha', 'mod-cha']
  ]
  map.forEach(([attr, modId]) => {
    const score = toNumber(getEl(`attr-${attr}`)?.value)
    const mod = calcMod(score)
    const el = getEl(modId)
    if (el) el.textContent = fmtMod(mod)
  })
}

function buildData() {
  const data = {
    image: state.image || DEFAULT_AVATAR,
    theme: state.theme || 'dark',
    abilities: Array.isArray(state.abilities) ? state.abilities : []
  }

  const attrs = {
    str: toNumber(getEl('attr-str')?.value),
    dex: toNumber(getEl('attr-dex')?.value),
    con: toNumber(getEl('attr-con')?.value),
    int: toNumber(getEl('attr-int')?.value),
    wis: toNumber(getEl('attr-wis')?.value),
    cha: toNumber(getEl('attr-cha')?.value)
  }

  data.nomePersonagem = String(getEl('nomePersonagem')?.value || '')
  data.nickname = String(getEl('nickname')?.value || '')
  data.classLevel = String(getEl('classLevel')?.value || '')
  data.background = String(getEl('background')?.value || '')
  data.ac = toNumber(getEl('ac')?.value)
  data.initiative = String(getEl('initiative')?.value || '')
  data.speed = String(getEl('speed')?.value || '')
  data.hpMax = toNumber(getEl('hpMax')?.value)
  data.hpCurrent = toNumber(getEl('hpCurrent')?.value)
  data.attacks = String(getEl('attacks')?.value || '')
  data.traits = String(getEl('traits')?.value || '')
  data.proficiencies = String(getEl('proficiencies')?.value || '')
  data.attributes = attrs
  data.customAttributes = Array.isArray(state.customAttributes) ? state.customAttributes : []
  return data
}

function emitChange() {
  window.parent.postMessage({ type: 'sheet-changed', data: buildData() }, '*')
}

function applyData(data) {
  const next = data || {}
  applyTheme(String(next.theme || 'dark'))
  setAvatar(String(next.image || DEFAULT_AVATAR))

  writeField('nomePersonagem', next.nomePersonagem || '')
  writeField('nickname', next.nickname || '')
  writeField('classLevel', next.classLevel || '')
  writeField('background', next.background || '')

  const attrs = next.attributes || {}
  writeField('attr-str', attrs.str || 0)
  writeField('attr-dex', attrs.dex || 0)
  writeField('attr-con', attrs.con || 0)
  writeField('attr-int', attrs.int || 0)
  writeField('attr-wis', attrs.wis || 0)
  writeField('attr-cha', attrs.cha || 0)

  state.customAttributes = Array.isArray(next.customAttributes) ? next.customAttributes : []
  renderCustomAttributes()

  writeField('ac', next.ac || 0)
  writeField('initiative', next.initiative || '')
  writeField('speed', next.speed || '')
  writeField('hpMax', next.hpMax || 0)
  writeField('hpCurrent', next.hpCurrent || 0)
  writeField('attacks', next.attacks || '')
  writeField('traits', next.traits || '')
  writeField('proficiencies', next.proficiencies || '')

  state.abilities = Array.isArray(next.abilities) ? next.abilities : []
  renderAbilities()
  updateMods()
}

function openPage(page) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.page === page)
  })
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.toggle('active', p.id === `page-${page}`)
  })
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderAbilities() {
  const grid = getEl('abilities-grid')
  if (!grid) return
  const list = Array.isArray(state.abilities) ? state.abilities : []

  grid.innerHTML = list
    .map((a) => {
      const id = escHtml(a?.id || '')
      const title = escHtml(a?.title || '')
      const desc = escHtml(a?.desc || '')
      const img = String(a?.image || '').trim()
      const bg = img ? `style="background-image:url('${img.replace(/'/g, '%27')}')"` : ''
      return `
        <div class="ability-card" data-id="${id}">
          <div class="img" ${bg}></div>
          <div class="actions">
            <button class="icon-btn" data-action="edit" type="button">E</button>
            <button class="icon-btn" data-action="del" type="button">X</button>
          </div>
          <div class="body">
            <div class="title">${title}</div>
            <div class="desc">${desc}</div>
          </div>
        </div>
      `
    })
    .join('')

  grid.querySelectorAll('.ability-card .icon-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const card = btn.closest('.ability-card')
      const id = String(card?.dataset.id || '')
      const action = String(btn.dataset.action || '')
      if (!id) return
      if (action === 'edit') openAbilityModal(id)
      if (action === 'del') deleteAbility(id)
    })
  })
}

function openAbilityModal(abilityId) {
  if (isReadonly) return
  const modal = getEl('ability-modal')
  if (!modal) return
  state.editingAbilityId = abilityId || null
  const a =
    (Array.isArray(state.abilities) ? state.abilities : []).find((x) => x && x.id === abilityId) || {}
  writeField('ability-title', a.title || '')
  writeField('ability-image', a.image || '')
  writeField('ability-desc', a.desc || '')
  const color = getEl('ability-color')
  if (color) color.value = String(a.color || 'skill')
  modal.style.display = 'flex'
}

function closeAbilityModal() {
  const modal = getEl('ability-modal')
  if (!modal) return
  modal.style.display = 'none'
  state.editingAbilityId = null
}

function saveAbilityFromModal() {
  if (isReadonly) return
  const title = String(readField('ability-title') || '').trim()
  if (!title) return
  const image = String(readField('ability-image') || '').trim()
  const desc = String(readField('ability-desc') || '').trim()
  const color = String(getEl('ability-color')?.value || 'skill')
  const list = Array.isArray(state.abilities) ? [...state.abilities] : []
  const id =
    state.editingAbilityId ||
    `ab_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`
  const idx = list.findIndex((x) => x && x.id === id)
  const next = { id, title, image, desc, color }
  if (idx >= 0) list[idx] = next
  else list.push(next)
  state.abilities = list
  renderAbilities()
  emitChange()
  closeAbilityModal()
}

function deleteAbility(id) {
  if (isReadonly) return
  const list = Array.isArray(state.abilities) ? state.abilities : []
  state.abilities = list.filter((x) => x && x.id !== id)
  renderAbilities()
  emitChange()
}

window.addEventListener('message', (event) => {
  if (!event.data?.type) return
  if (event.data.type === 'load-sheet') {
    applyData(event.data.data)
    window.parent.postMessage({ type: 'sheet-data', data: buildData() }, '*')
  }
})

FIELD_IDS.forEach((id) => {
  const el = getEl(id)
  if (!el) return
  el.addEventListener('input', () => {
    updateMods()
    emitChange()
  })
})

document.querySelectorAll('.attr-card').forEach((card) => {
  const attr = String(card.dataset.attr || '').trim()
  const input = getEl(`attr-${attr}`)
  if (!input) return
  card.querySelectorAll('.attr-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isReadonly) return
      const delta = toNumber(btn.dataset.delta || 0)
      input.value = String(toNumber(input.value) + delta)
      updateMods()
      emitChange()
    })
  })
})

document.querySelectorAll('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isReadonly) return
    applyTheme(String(btn.dataset.theme || 'dark'))
    emitChange()
  })
})

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => openPage(String(tab.dataset.page || 'main')))
})

const avatarContainer = getEl('avatar-container')
const avatarFile = getEl('avatar-file')
const avatarImg = getEl('avatar-img')
const avatarOverlay = getEl('avatar-overlay')
const avatarBtnUpload = getEl('avatar-btn-upload')
const avatarBtnLink = getEl('avatar-btn-link')
setAvatar(DEFAULT_AVATAR)

if (avatarContainer && avatarOverlay && !isReadonly) {
  avatarContainer.addEventListener('click', (e) => {
    // Evita que o clique nos botões feche/abra incorretamente o overlay
    if (e.target === avatarBtnUpload || e.target === avatarBtnLink) return
    
    if (avatarOverlay.style.display === 'flex') {
      avatarOverlay.style.display = 'none'
    } else {
      avatarOverlay.style.display = 'flex'
    }
  })

  // Fecha o overlay se clicar fora do container do avatar
  document.addEventListener('click', (e) => {
    if (!avatarContainer.contains(e.target) && avatarOverlay.style.display === 'flex') {
      avatarOverlay.style.display = 'none'
    }
  })
}

if (avatarBtnUpload && avatarFile) {
  avatarBtnUpload.addEventListener('click', () => {
    if (isReadonly) return
    avatarFile.click()
    if (avatarOverlay) avatarOverlay.style.display = 'none'
  })
}

if (avatarBtnLink) {
  avatarBtnLink.addEventListener('click', () => {
    if (isReadonly) return
    if (avatarOverlay) avatarOverlay.style.display = 'none'
    const url = prompt('Insira o link da imagem:')
    if (url) {
      setAvatar(url)
      emitChange()
    }
  })
}

if (avatarFile) {
  avatarFile.addEventListener('change', () => {
    if (isReadonly) return
    const file = avatarFile.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAvatar(String(reader.result || DEFAULT_AVATAR))
      emitChange()
    }
    reader.readAsDataURL(file)
  })
}

if (avatarImg) {
  avatarImg.addEventListener('error', () => {
    if (isReadonly) return
    if (state.image && state.image !== DEFAULT_AVATAR) {
      setAvatar(DEFAULT_AVATAR)
      emitChange()
    }
  })
}

const avatarImgEl = getEl('avatar-img')
if (avatarImgEl) {
  avatarImgEl.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (isReadonly) return
    const url = prompt('Insira o link da imagem:')
    if (url) {
      setAvatar(url)
      emitChange()
    }
  })
}

const saveBtn = getEl('save-btn')
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    if (isReadonly) return
    window.parent.postMessage({ type: 'request-save' }, '*')
  })
}

const addAbility = getEl('add-ability')
if (addAbility) addAbility.addEventListener('click', () => openAbilityModal(null))

const abilityCancel = getEl('ability-cancel')
if (abilityCancel) abilityCancel.addEventListener('click', closeAbilityModal)

const abilitySave = getEl('ability-save')
if (abilitySave) abilitySave.addEventListener('click', saveAbilityFromModal)

const modal = getEl('ability-modal')
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAbilityModal()
  })
}

const btnAddAttribute = getEl('btn-add-attribute')
if (btnAddAttribute) {
  if (isReadonly) {
    btnAddAttribute.style.display = 'none'
  } else {
    btnAddAttribute.addEventListener('click', () => {
      const list = Array.isArray(state.customAttributes) ? state.customAttributes : []
      list.push({
        id: `attr_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
        name: 'Novo Atributo',
        value: 0
      })
      state.customAttributes = list
      renderCustomAttributes()
      emitChange()
    })
  }
}

if (isReadonly) {
  const save = getEl('save-btn')
  if (save) save.style.display = 'none'
  const add = getEl('add-ability')
  if (add) add.style.display = 'none'
  const aBtn = getEl('avatar-container')
  if (aBtn) aBtn.style.pointerEvents = 'none'
  FIELD_IDS.forEach((id) => {
    const el = getEl(id)
    if (el) el.disabled = true
  })
  document.querySelectorAll('.attr-btn').forEach((b) => (b.disabled = true))
}
