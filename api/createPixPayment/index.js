const { ensureAdmin, verifyFirebaseIdToken } = require('../../lib/firebaseAdmin')
const { mpFetchJson, getMpTokenKind } = require('../../lib/mercadopago')
const { applyCors } = require('../../lib/cors')

const parseEmailList = (raw) => {
  const v = String(raw || '').trim()
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

const planMeta = (plan) => {
  const k = String(plan || '').trim().toLowerCase()
  if (k === 'basic') return { plan: 'basic', name: 'Herói' }
  if (k === 'premium') return { plan: 'premium', name: 'Lenda' }
  return null
}

const readAmounts = async (db) => {
  const defaults = { basic_amount: 19.9, premium_amount: 49.9 }
  try {
    const snap = await db.doc('app_config/payment').get()
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

  const meta = planMeta(req.body?.plan)
  if (!meta) {
    res.status(400).json({ error: 'invalid_plan' })
    return
  }

  try {
    const admin = ensureAdmin()
    const db = admin.firestore()
    const amounts = await readAmounts(db)
    const amount = meta.plan === 'premium' ? amounts.premium_amount : amounts.basic_amount

    const externalReference = `${user.uid}|${meta.plan}|${Date.now()}`
    const idempotencyKey = `elara_${user.uid}_${meta.plan}_${Date.now()}`

    const origin = String(req.headers.origin || '').trim()
    const webhookUrl = process.env.MP_WEBHOOK_URL || ''
    const expiresAt = new Date(Date.now() + (15 * 60 * 1000)).toISOString()

    const payment = await mpFetchJson('/v1/payments', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: `ELARA RPG - Plano ${meta.name}`,
        payment_method_id: 'pix',
        date_of_expiration: expiresAt,
        payer: {
          email: user.email || `noemail_${user.uid}@example.com`
        },
        external_reference: externalReference,
        notification_url: webhookUrl || undefined,
        metadata: {
          uid: user.uid,
          plan: meta.plan,
          origin: origin || null
        }
      })
    })

    const tx = payment?.point_of_interaction?.transaction_data || {}
    const qrCode = tx.qr_code || ''
    const qrBase64 = tx.qr_code_base64 || ''
    const ticketUrl = tx.ticket_url || ''
    const paymentId = payment?.id ? String(payment.id) : ''

    const docId = paymentId ? `mp_${paymentId}` : `mp_${Date.now()}`
    await db.doc(`plan_requests/${docId}`).set({
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

    try {
      const to = parseEmailList(process.env.PAYMENT_NOTIFY_EMAIL_TO)
      if (to.length) {
        await db.collection('mail').add({
          to,
          message: {
            subject: `Novo Pix gerado (${meta.plan})`,
            text: [
              `Plano: ${meta.plan}`,
              `Valor: ${amount}`,
              `UID: ${user.uid}`,
              `Email: ${user.email || ''}`,
              `Payment ID: ${paymentId}`,
              `Request ID: ${docId}`,
              `Origem: ${origin || ''}`,
              `Token: ${getMpTokenKind() || ''}`,
              `Expira em: ${expiresAt}`
            ].join('\n')
          },
          created_at: admin.firestore.FieldValue.serverTimestamp()
        })
      }
    } catch {}

    res.status(200).json({
      request_id: docId,
      payment_id: paymentId,
      plan: meta.plan,
      amount,
      qr_code: qrCode,
      qr_code_base64: qrBase64,
      ticket_url: ticketUrl,
      expires_at: expiresAt,
      mp_token_kind: getMpTokenKind()
    })
  } catch (err) {
    res.status(500).json({
      error: err?.code || 'mp_error',
      message: err?.message || 'error'
    })
  }
}
