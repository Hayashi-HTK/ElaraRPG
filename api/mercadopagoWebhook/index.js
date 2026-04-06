const { ensureAdmin } = require('../../lib/firebaseAdmin')
const { mpFetchJson } = require('../../lib/mercadopago')

const normalizePlan = (raw) => {
  const p = String(raw || '').trim().toLowerCase()
  if (p === 'basic' || p === 'premium') return p
  return null
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).send('method_not_allowed')
    return
  }

  const idFromQuery = String(req.query?.['data.id'] || req.query?.id || '').trim()
  const idFromBody = String(req.body?.data?.id || req.body?.id || '').trim()
  const paymentId = idFromQuery || idFromBody

  if (!paymentId) {
    res.status(200).send('ok')
    return
  }

  try {
    const admin = ensureAdmin()
    const db = admin.firestore()
    const payment = await mpFetchJson(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' })
    const mpStatus = String(payment?.status || '').trim().toLowerCase()
    const mpId = String(payment?.id || paymentId)

    const ext = String(payment?.external_reference || '')
    const parts = ext.split('|')
    const uid = String(parts[0] || payment?.metadata?.uid || '').trim()
    const plan = normalizePlan(parts[1] || payment?.metadata?.plan)

    const docId = `mp_${mpId}`
    await db.doc(`plan_requests/${docId}`).set({
      provider: 'mercadopago',
      mp_payment_id: mpId,
      mp_status: mpStatus,
      external_reference: ext,
      status: mpStatus === 'approved' ? 'approved' : 'pending',
      user_id: uid || null,
      plan: plan || null,
      webhook_last_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    if (mpStatus === 'approved' && uid && plan) {
      const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      await db.doc(`profiles/${uid}`).set({
        plan,
        plan_type: plan,
        plan_status: 'active',
        plan_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        plan_started_at: admin.firestore.FieldValue.serverTimestamp(),
        plan_user_name: payment?.payer?.email || 'Viajante',
        plan_expires_at: expiresAt,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })

      await db.doc(`plan_requests/${docId}`).set({
        applied: true,
        applied_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    }
  } catch {}

  res.status(200).send('ok')
}
