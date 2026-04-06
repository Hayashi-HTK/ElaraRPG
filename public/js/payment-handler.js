// Payment Logic for Pix (Mercado Pago)
import { db, doc, getDoc, waitForAuth } from './firebase.js'

const PLAN_META = {
    basic: { name: 'Plano Herói' },
    premium: { name: 'Plano Lenda' }
}

const readMpBackendBaseUrl = async () => {
    try {
        const snap = await getDoc(doc(db, 'app_config', 'payment'))
        if (!snap.exists()) return ''
        const d = snap.data() || {}
        return String(d.mp_backend_base_url || '').trim()
    } catch {
        return ''
    }
}

const guessBackendBaseFromHost = () => {
    const host = String(window.location.hostname || '').toLowerCase()
    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return ''
    return window.location.origin
}

const resolveApiBase = (backendBase) => {
    const b = String(backendBase || '').replace(/\/+$/, '')
    if (!b) return ''
    if (b.endsWith('/api')) return b
    if (b.includes('cloudfunctions.net')) return b
    return `${b}/api`
}

const postJson = async (url, body, idToken) => {
    let res
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify(body || {})
        })
    } catch (err) {
        throw new Error(`Failed to fetch: ${url}`)
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = json?.message || json?.error || `HTTP ${res.status}`
        throw new Error(msg)
    }
    return json
}

const fmtBRL = (value) => {
    const v = Number.isFinite(value) ? value : Number(String(value || '').replace(',', '.'))
    if (!Number.isFinite(v)) return 'R$ 0,00'
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function initPayment() {
    const urlParams = new URLSearchParams(window.location.search);
    const planKey = urlParams.get('plan') || 'basic';
    const planMeta = PLAN_META[planKey];
    if (!planMeta) {
        window.location.href = 'index.html?view=landing#pricing';
        return;
    }

    // Check auth
    const user = await waitForAuth();
    if (!user) {
        window.location.href = 'login.html?redirect=payment.html&plan=' + planKey;
        return;
    }

    const idToken = await user.getIdToken()
    const backendBase = ((await readMpBackendBaseUrl()) || guessBackendBaseFromHost()).replace(/\/+$/, '')
    if (!backendBase) {
        alert('Backend do Mercado Pago não configurado. O ADM precisa definir `mp_backend_base_url` em `app_config/payment`.')
        return
    }
    if (window.location.protocol === 'https:' && backendBase.startsWith('http://')) {
        alert('O backend está em HTTP, mas o site está em HTTPS. Troque `mp_backend_base_url` para https://...')
        return
    }
    const apiBase = resolveApiBase(backendBase)
    if (!apiBase) {
        alert('Backend do Mercado Pago não configurado corretamente.')
        return
    }

    // UI Elements
    const planNameEl = document.getElementById('plan-name');
    const planPriceEl = document.getElementById('plan-price');
    const totalPriceEl = document.getElementById('total-price');
    const pixInput = document.getElementById('pix-code');
    const qrImg = document.querySelector('.qr-code-placeholder img');
    const ticketLink = document.getElementById('mp-ticket-link')
    const copyBtn = document.getElementById('copy-btn');
    const timerEl = document.getElementById('timer-countdown');
    const confirmBtn = document.getElementById('confirm-btn');
    const checkoutView = document.getElementById('checkout-view');
    const successView = document.getElementById('success-view');

    let requestId = ''
    let paymentId = ''
    let qrCode = ''
    let qrBase64 = ''

    const createUrl = `${apiBase}/createPixPayment`
    try {
        const created = await postJson(createUrl, { plan: planKey }, idToken)
        requestId = String(created.request_id || '')
        paymentId = String(created.payment_id || '')
        qrCode = String(created.qr_code || '')
        qrBase64 = String(created.qr_code_base64 || '')
        const ticketUrl = String(created.ticket_url || '')

        if (ticketLink) {
            if (ticketUrl) {
                ticketLink.href = ticketUrl
                ticketLink.style.display = 'inline-block'
            } else {
                ticketLink.style.display = 'none'
            }
        }

        if (!qrCode && !qrBase64) {
            throw new Error('QR do Pix não foi gerado (verifique o backend/credenciais do Mercado Pago).')
        }

        if (planNameEl) planNameEl.textContent = planMeta.name
        if (planPriceEl) planPriceEl.textContent = fmtBRL(created.amount)
        if (totalPriceEl) totalPriceEl.textContent = fmtBRL(created.amount)
        if (pixInput) pixInput.value = qrCode

        if (qrImg) {
            if (qrBase64) qrImg.src = `data:image/png;base64,${qrBase64}`
            else qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrCode)}`
        }
    } catch (err) {
        if (confirmBtn) {
            confirmBtn.disabled = true
            confirmBtn.textContent = 'Pagamento indisponível'
        }
        if (copyBtn) copyBtn.disabled = true
        const msg = String(err?.message || err || 'Erro desconhecido')
        if (msg.toLowerCase().includes('unauthorized')) {
            window.location.href = 'login.html?redirect=payment.html&plan=' + planKey
            return
        }
        if (msg.toLowerCase().includes('failed to fetch')) {
            alert(
                'Falha ao iniciar o pagamento: não foi possível acessar o backend.\n\n' +
                `URL tentada: ${createUrl}\n\n` +
                'Causas mais comuns:\n' +
                '- `mp_backend_base_url` errado/desatualizado (Firestore `app_config/payment`).\n' +
                '- backend em HTTP enquanto o site está em HTTPS.\n' +
                '- domínio da Vercel ainda não fez deploy ou está bloqueando CORS (se você configurou `CORS_ALLOW_ORIGINS`).'
            )
            return
        }
        alert(`Falha ao iniciar o pagamento: ${msg}`)
        return
    }


    // Timer Logic (15 minutes)
    let timeLeft = 15 * 60;
    const timerInterval = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        if (timerEl) timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert('O tempo de pagamento expirou. Por favor, tente novamente.');
            window.location.reload();
        }
        timeLeft--;
    }, 1000);

    // Copy Button
    if (copyBtn && pixInput) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(pixInput.value).then(() => {
                copyBtn.textContent = 'Copiado!';
                setTimeout(() => copyBtn.textContent = 'Copiar', 2000);
            });
        });
    }

    const checkNow = async () => {
        return await postJson(`${apiBase}/checkPixPayment`, { request_id: requestId, payment_id: paymentId }, idToken)
    }

    const showApproved = () => {
        const title = successView?.querySelector?.('.success-title')
        const p = successView?.querySelector?.('p')
        if (title) title.textContent = 'Pagamento confirmado!'
        if (p) p.textContent = 'Seu plano foi ativado automaticamente. Bom jogo!'
        if (checkoutView) checkoutView.style.display = 'none'
        if (successView) successView.style.display = 'block'
    }

    // Confirm Payment (Verification)
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Verificando...'
            try {
                const r = await checkNow()
                if (r?.approved) {
                    showApproved()
                    return
                }
                alert('Ainda não identificamos o pagamento. Aguarde alguns instantes e tente novamente.')
            } catch (error) {
                console.error('Error checking Mercado Pago payment:', error)
                alert('Erro ao verificar pagamento. Por favor, tente novamente.')
            } finally {
                confirmBtn.disabled = false
                confirmBtn.textContent = 'Já realizei o pagamento'
            }
        });
    }

    const pollIntervalMs = 8000
    let pollTries = 0
    const pollMax = 45
    const poll = async () => {
        pollTries += 1
        if (pollTries > pollMax) return
        try {
            const r = await checkNow()
            if (r?.approved) {
                showApproved()
                return
            }
        } catch {}
        setTimeout(poll, pollIntervalMs)
    }
    setTimeout(poll, pollIntervalMs)
}

document.addEventListener('DOMContentLoaded', initPayment);
