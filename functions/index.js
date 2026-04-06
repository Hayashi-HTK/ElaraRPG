const functions = require('firebase-functions')
const admin = require('firebase-admin')

admin.initializeApp()

const MP_API_BASE = 'https://api.mercadopago.com'

const cors = (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return true
  }
  return false
}

const getMpAccessToken = () => {
  const env = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (env) return env
  const cfg = functions.config?.() || {}
  const fromConfig = cfg?.mercadopago?.access_token
  if (fromConfig) return fromConfig
  return null
}

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body
  const raw = typeof req.rawBody === 'string' ? req.rawBody : (req.rawBody ? req.rawBody.toString('utf8') : '')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const verifyUser = async (req) => {
  const authHeader = String(req.headers.authorization || '').trim()
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null
  try {
    return await admin.auth().verifyIdToken(token)
  } catch {
    return null
  }
}

const readPaymentAmounts = async () => {
  const defaults = { basic_amount: 19.9, premium_amount: 49.9 }
  try {
    const snap = await admin.firestore().doc('app_config/payment').get()
    if (!snap.exists) return defaults
    const d = snap.data() || {}
    return {
      basic_amount: Number.isFinite(d.basic_amount) ? d.basic_amount : defaults.basic_amount,
      premium_amount: Number.isFinite(d.premium_amount) ? d.premium_amount : defaults.premium_amount
    }
  } catch {
    return defaults
  }
}

const fetchMpJson = async (path, opts = {}) => {
  const accessToken = getMpAccessToken()
  if (!accessToken) {
    const err = new Error('MERCADOPAGO_ACCESS_TOKEN not configured')
    err.code = 'MP_NOT_CONFIGURED'
    throw err
  }

  const res = await fetch(`${MP_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error('Mercado Pago request failed')
    err.status = res.status
    err.details = json
    throw err
  }
  return json
}

const getPlanMeta = (planKey) => {
  const k = String(planKey || '').trim().toLowerCase()
  if (k === 'basic') return { plan: 'basic', name: 'Herói' }
  if (k === 'premium') return { plan: 'premium', name: 'Lenda' }
  return null
}

const applyPlanToProfile = async ({ uid, plan, userName, userEmail }) => {
  const now = Date.now()
  const expiresAt = new Date(now + (30 * 24 * 60 * 60 * 1000))
  await admin.firestore().doc(`profiles/${uid}`).set({
    plan,
    plan_type: plan,
    plan_status: 'active',
    plan_updated_at: admin.firestore.FieldValue.serverTimestamp(),
    plan_started_at: admin.firestore.FieldValue.serverTimestamp(),
    plan_user_name: userName || userEmail || 'Viajante',
    plan_expires_at: expiresAt,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  return expiresAt
}

exports.createPixPayment = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const user = await verifyUser(req)
  if (!user?.uid) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const body = await readBody(req)
  const meta = getPlanMeta(body?.plan)
  if (!meta) {
    res.status(400).json({ error: 'invalid_plan' })
    return
  }

  try {
    const amounts = await readPaymentAmounts()
    const amount = meta.plan === 'premium' ? amounts.premium_amount : amounts.basic_amount

    const externalReference = `${user.uid}|${meta.plan}|${Date.now()}`
    const idempotencyKey = `elara_${user.uid}_${meta.plan}_${Date.now()}`

    const payment = await fetchMpJson('/v1/payments', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: `ELARA RPG - Plano ${meta.name}`,
        payment_method_id: 'pix',
        payer: {
          email: user.email || `noemail_${user.uid}@example.com`
        },
        external_reference: externalReference,
        notification_url: `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mercadopagoWebhook`
      })
    })

    const tx = payment?.point_of_interaction?.transaction_data || {}
    const qrCode = tx.qr_code || ''
    const qrBase64 = tx.qr_code_base64 || ''
    const ticketUrl = tx.ticket_url || ''
    const paymentId = payment?.id ? String(payment.id) : ''

    const docId = paymentId ? `mp_${paymentId}` : `mp_${Date.now()}`
    await admin.firestore().doc(`plan_requests/${docId}`).set({
      provider: 'mercadopago',
      mp_payment_id: paymentId || null,
      mp_status: payment?.status || null,
      status: 'pending',
      applied: false,
      user_id: user.uid,
      user_email: user.email || null,
      user_name: user.name || user.email || 'Viajante',
      plan: meta.plan,
      amount,
      currency: 'BRL',
      external_reference: externalReference,
      ticket_url: ticketUrl,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    res.json({
      request_id: docId,
      payment_id: paymentId,
      plan: meta.plan,
      amount,
      qr_code: qrCode,
      qr_code_base64: qrBase64,
      ticket_url: ticketUrl
    })
  } catch (err) {
    const code = err?.code || 'mp_error'
    res.status(code === 'MP_NOT_CONFIGURED' ? 500 : 500).json({
      error: code,
      message: err?.message || 'error'
    })
  }
})

exports.checkPixPayment = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const user = await verifyUser(req)
  if (!user?.uid) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const body = await readBody(req)
  const requestId = String(body?.request_id || '').trim()
  const paymentId = String(body?.payment_id || '').trim()

  if (!requestId && !paymentId) {
    res.status(400).json({ error: 'missing_request' })
    return
  }

  try {
    let reqSnap = null
    if (requestId) {
      reqSnap = await admin.firestore().doc(`plan_requests/${requestId}`).get()
    } else {
      reqSnap = await admin.firestore().doc(`plan_requests/mp_${paymentId}`).get()
    }
    const reqData = reqSnap?.exists ? (reqSnap.data() || {}) : {}
    const ownerUid = reqData.user_id
    if (ownerUid && ownerUid !== user.uid) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const mpId = paymentId || String(reqData.mp_payment_id || '').trim()
    if (!mpId) {
      res.status(400).json({ error: 'missing_payment_id' })
      return
    }

    const payment = await fetchMpJson(`/v1/payments/${encodeURIComponent(mpId)}`, { method: 'GET' })
    const mpStatus = String(payment?.status || '').trim().toLowerCase()

    const docId = requestId || `mp_${mpId}`
    await admin.firestore().doc(`plan_requests/${docId}`).set({
      provider: 'mercadopago',
      mp_payment_id: String(payment?.id || mpId),
      mp_status: mpStatus,
      last_checked_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    if (mpStatus === 'approved') {
      const plan = String(reqData.plan || '').trim().toLowerCase() || (() => {
        const ext = String(payment?.external_reference || '')
        const parts = ext.split('|')
        return String(parts[1] || '').trim().toLowerCase()
      })()

      if (plan !== 'basic' && plan !== 'premium') {
        res.json({ status: mpStatus, approved: true, applied: false })
        return
      }

      await applyPlanToProfile({
        uid: user.uid,
        plan,
        userName: reqData.user_name || user.name,
        userEmail: user.email
      })

      await admin.firestore().doc(`plan_requests/${docId}`).set({
        status: 'approved',
        applied: true,
        applied_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })

      res.json({ status: mpStatus, approved: true, applied: true })
      return
    }

    res.json({ status: mpStatus, approved: false, applied: false })
  } catch (err) {
    res.status(500).json({ error: 'mp_check_failed', message: err?.message || 'error' })
  }
})

exports.mercadopagoWebhook = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return

  const idFromQuery = String(req.query['data.id'] || req.query['id'] || '').trim()
  const body = await readBody(req)
  const idFromBody = String(body?.data?.id || body?.id || '').trim()
  const paymentId = idFromQuery || idFromBody

  if (!paymentId) {
    res.status(200).send('ok')
    return
  }

  try {
    const payment = await fetchMpJson(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' })
    const mpStatus = String(payment?.status || '').trim().toLowerCase()
    const externalReference = String(payment?.external_reference || '')
    const parts = externalReference.split('|')
    const uid = String(parts[0] || '').trim()
    const plan = String(parts[1] || '').trim().toLowerCase()

    const docId = `mp_${String(payment?.id || paymentId)}`
    await admin.firestore().doc(`plan_requests/${docId}`).set({
      provider: 'mercadopago',
      mp_payment_id: String(payment?.id || paymentId),
      mp_status: mpStatus,
      external_reference: externalReference,
      status: mpStatus === 'approved' ? 'approved' : 'pending',
      user_id: uid || null,
      plan: plan || null,
      webhook_last_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    if (mpStatus === 'approved' && uid && (plan === 'basic' || plan === 'premium')) {
      await applyPlanToProfile({
        uid,
        plan,
        userName: payment?.payer?.first_name || null,
        userEmail: payment?.payer?.email || null
      })
      await admin.firestore().doc(`plan_requests/${docId}`).set({
        applied: true,
        applied_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    }
  } catch {}

  res.status(200).send('ok')
})

