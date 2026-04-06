import { waitForAuth } from './firebase.js'

const params = new URLSearchParams(window.location.search)
const allowLanding = params.get('view') === 'landing'

const startScreen = document.getElementById('start-screen')
const startCover = document.getElementById('start-cover')
const enterBtn = document.getElementById('start-enter-btn')

if (!startScreen || !startCover || !enterBtn || allowLanding) {
  if (startScreen) startScreen.remove()
} else {
  startScreen.style.display = 'flex'
  startScreen.setAttribute('aria-hidden', 'false')
  document.body.classList.add('start-locked')

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const enter = async () => {
    if (startScreen.classList.contains('is-entering')) return
    startScreen.classList.add('is-entering')

    const delay = prefersReduced ? 0 : 1200
    await new Promise((r) => setTimeout(r, delay))

    const cachedUser = localStorage.getItem('elara_user_cache')
    if (cachedUser) {
      window.location.replace('posts.html')
      return
    }

    try {
      const user = await waitForAuth()
      if (user) {
        window.location.replace('posts.html')
        return
      }
    } catch {}

    document.body.classList.remove('start-locked')
    startScreen.classList.add('is-hidden')
    setTimeout(() => startScreen.remove(), 300)
  }

  enterBtn.addEventListener('click', enter)
  startCover.addEventListener('click', (e) => {
    if (e.target?.closest?.('a, button, input, textarea, select')) return
    enter()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') enter()
  })
}
