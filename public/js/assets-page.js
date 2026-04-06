import {
  getBuiltinCharacterAssets,
  BUILTIN_FLOOR_FILES,
  BUILTIN_FLOOR_BASE_PATHS,
  getObjectBookCategories
} from './asset-catalog.js'

const esc = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const toast = document.getElementById('assets-toast')
let toastTimer = null
const showToast = (text) => {
  if (!toast) return
  toast.textContent = String(text || 'Pronto')
  toast.style.display = 'block'
  toast.classList.add('active')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.classList.remove('active')
    toast.style.display = 'none'
  }, 1600)
}

const copyText = async (text) => {
  const t = String(text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    showToast('Link copiado.')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      showToast('Link copiado.')
    } catch {
      showToast('Não foi possível copiar.')
    } finally {
      ta.remove()
    }
  }
}

const renderAssetItem = (item) => {
  const url = String(item?.image_url || '').trim()
  const name = String(item?.name || '').trim() || 'Asset'
  const el = document.createElement('div')
  el.className = 'assets-item'
  el.innerHTML = `
    <div class="assets-thumb" style="background-image:url('${esc(url)}')"></div>
    <div class="assets-item-meta">
      <div class="assets-item-name">${esc(name)}</div>
      <div class="assets-item-actions">
        <button class="assets-btn" type="button" data-action="open">Abrir</button>
        <button class="assets-btn assets-btn-secondary" type="button" data-action="copy">Copiar link</button>
      </div>
    </div>
  `

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    const act = btn?.dataset?.action
    if (!act) return
    e.preventDefault()
    e.stopPropagation()
    if (act === 'open') {
      window.open(url, '_blank', 'noopener')
      return
    }
    if (act === 'copy') {
      copyText(url)
    }
  })

  return el
}

function renderCharacters() {
  const grid = document.getElementById('assets-characters-grid')
  const empty = document.getElementById('assets-characters-empty')
  if (!grid) return
  grid.innerHTML = ''
  const items = getBuiltinCharacterAssets()
  if (!items.length) {
    if (empty) empty.style.display = 'block'
    return
  }
  if (empty) empty.style.display = 'none'
  items.forEach((it) => grid.appendChild(renderAssetItem(it)))
}

function renderFloors() {
  const grid = document.getElementById('assets-floors-grid')
  const empty = document.getElementById('assets-floors-empty')
  if (!grid) return
  grid.innerHTML = ''

  const base = Array.isArray(BUILTIN_FLOOR_BASE_PATHS) && BUILTIN_FLOOR_BASE_PATHS[0]
    ? String(BUILTIN_FLOOR_BASE_PATHS[0])
    : 'assets/Jogar/Pisos/'

  const files = Array.isArray(BUILTIN_FLOOR_FILES) ? BUILTIN_FLOOR_FILES.filter(Boolean) : []
  const items = files.map((filename, idx) => {
    const baseName = String(filename).replace(/\.(png|jpe?g|webp)$/i, '').trim()
    return {
      id: `builtin_floor_${idx}`,
      name: baseName || `Piso ${idx + 1}`,
      image_url: encodeURI(`${base}${filename}`)
    }
  })

  if (!items.length) {
    if (empty) empty.style.display = 'block'
    return
  }
  if (empty) empty.style.display = 'none'
  items.forEach((it) => grid.appendChild(renderAssetItem(it)))
}

function renderObjectBook() {
  const root = document.getElementById('assets-objects-root')
  if (!root) return
  root.innerHTML = ''

  const categories = getObjectBookCategories()
  categories.forEach((c) => {
    const wrap = document.createElement('div')
    wrap.className = 'assets-obj-category'
    wrap.innerHTML = `
      <div class="assets-obj-head">
        <div class="assets-obj-title">${esc(c.category)}</div>
        <div class="assets-obj-count">${Array.isArray(c.items) ? c.items.length : 0}</div>
      </div>
      <div class="assets-items-grid"></div>
      <div class="assets-empty" style="display:none;">Sem itens nessa categoria.</div>
    `

    const grid = wrap.querySelector('.assets-items-grid')
    const empty = wrap.querySelector('.assets-empty')
    const items = Array.isArray(c.items) ? c.items : []
    if (!items.length) {
      if (empty) empty.style.display = 'block'
    } else {
      if (empty) empty.style.display = 'none'
      items.forEach((it) => grid.appendChild(renderAssetItem(it)))
    }

    root.appendChild(wrap)
  })
}

renderCharacters()
renderFloors()
renderObjectBook()

