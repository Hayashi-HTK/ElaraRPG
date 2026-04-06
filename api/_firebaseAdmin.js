const admin = require('firebase-admin')

const getServiceAccount = () => {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (b64) {
    const json = Buffer.from(String(b64), 'base64').toString('utf8')
    return JSON.parse(json)
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) return JSON.parse(String(raw))
  return null
}

const ensureAdmin = () => {
  if (admin.apps.length) return admin
  const sa = getServiceAccount()
  if (!sa) throw new Error('Firebase service account not configured')
  admin.initializeApp({
    credential: admin.credential.cert(sa)
  })
  return admin
}

const verifyFirebaseIdToken = async (req) => {
  const h = String(req.headers.authorization || '')
  if (!h.startsWith('Bearer ')) return null
  const token = h.slice('Bearer '.length).trim()
  if (!token) return null
  try {
    const a = ensureAdmin()
    return await a.auth().verifyIdToken(token)
  } catch {
    return null
  }
}

module.exports = {
  ensureAdmin,
  verifyFirebaseIdToken
}

