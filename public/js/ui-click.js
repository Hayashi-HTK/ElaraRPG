let clickInit = false
let audioCtx = null

const shouldPlayForTarget = (target) => {
  if (!target) return false
  return Boolean(
    target.closest('button') ||
    target.closest('clickable') ||
      target.closest('a') ||
      target.closest('input[type="button"]') ||
      target.closest('input[type="submit"]') ||
      target.closest('input[type="reset"]') ||
      target.closest('[role="button"]') ||
      target.closest('.btn') ||
      target.closest('.btn-primary') ||
      target.closest('.btn-logout') ||
      target.closest('.btn-icon') ||
      target.closest('.nav-item') ||
      target.closest('.nav-toggle-btn')
  )
}

const ensureCtx = async () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume()
    } catch {}
  }
  return audioCtx
}

const playClick = async () => {
  const ctx = await ensureCtx()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  const base = 800 + Math.random() * 120
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(base, now)
  osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.02)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.0015)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.03)
}

export const initClickSound = () => {
  if (clickInit) return
  clickInit = true

  document.addEventListener(
    'click',
    (e) => {
      if (!shouldPlayForTarget(e.target)) return
      playClick()
    },
    { passive: true }
  )
}

initClickSound()
