const { ensureAdmin, verifyFirebaseIdToken } = require('../lib/firebaseAdmin')
const { mpFetchJson } = require('../lib/mercadopago')
const { applyCors } = require('../lib/cors')

const normalizePlan = (raw) => {
  const p = String(raw || '').trim().toLowerCase()
  if (p === 'basic' || p === 'premium') return p
  return null
}

const applyPlanToProfile = async (db, uid, plan, userName, userEmail) => {
  const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
  await db.doc(`profiles/${uid}`).set({
    plan,
    plan_type: plan,
    plan_status: 'active',
    plan_updated_at: db.constructor.FieldValue ? db.constructor.FieldValue.serverTimestamp() : undefined,
    plan_started_at: db.constructor.FieldValue ? db.constructor.FieldValue.serverTimestamp() : undefined,
    plan_user_name: userName || userEmail || 'Viajante',
    plan_expires_at: expiresAt,
    updated_at: db.constructor.FieldValue ? db.constructor.FieldValue.serverTimestamp() : undefined
  }, { merge: true })
  return expiresAt
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const user = await verifyFirebaseIdToken(req)
  if (!user?.uid) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const requestId = String(req.body?.request_id || '').trim()
  const paymentIdRaw = String(req.body?.payment_id || '').trim()
  const paymentId = paymentIdRaw || (requestId.startsWith('mp_') ? requestId.slice(3) : '')

  if (!requestId && !paymentId) {
    res.status(400).json({ error: 'missing_request' })
    return
  }

  try {
    const admin = ensureAdmin()
    const db = admin.firestore()

    const docId = requestId || `mp_${paymentId}`
    const snap = await db.doc(`plan_requests/${docId}`).get()
    const data = snap.exists ? (snap.data() || {}) : {}
    if (data.user_id && data.user_id !== user.uid) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const mpId = String(data.mp_payment_id || paymentId || '').trim()
    if (!mpId) {
      res.status(400).json({ error: 'missing_payment_id' })
      return
    }

    const payment = await mpFetchJson(`/v1/payments/${encodeURIComponent(mpId)}`, { method: 'GET' })
    const mpStatus = String(payment?.status || '').trim().toLowerCase()

    await db.doc(`plan_requests/${docId}`).set({
      provider: 'mercadopago',
      mp_payment_id: String(payment?.id || mpId),
      mp_status: mpStatus,
      last_checked_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    if (mpStatus === 'approved') {
      const plan = normalizePlan(data.plan) || normalizePlan(payment?.metadata?.plan) || (() => {
        const ext = String(payment?.external_reference || '')
        const parts = ext.split('|')
        return normalizePlan(parts[1])
      })()

      if (!plan) {
        res.status(200).json({ status: mpStatus, approved: true, applied: false })
        return
      }

      const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      await db.doc(`profiles/${user.uid}`).set({
        plan,
        plan_type: plan,
        plan_status: 'active',
        plan_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        plan_started_at: admin.firestore.FieldValue.serverTimestamp(),
        plan_user_name: data.user_name || user.name || user.email || 'Viajante',
        plan_expires_at: expiresAt,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })

      await db.doc(`plan_requests/${docId}`).set({
        status: 'approved',
        applied: true,
        applied_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })

      res.status(200).json({ status: mpStatus, approved: true, applied: true })
      return
    }

    res.status(200).json({ status: mpStatus, approved: false, applied: false })
  } catch (err) {
    res.status(500).json({ error: 'mp_check_failed', message: err?.message || 'error' })
  }
}
