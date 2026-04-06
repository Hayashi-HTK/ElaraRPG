const MP_API_BASE = 'https://api.mercadopago.com'

const getMpAccessToken = () => {
  const t = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  return t || null
}

const mpFetchJson = async (path, opts = {}) => {
  const token = getMpAccessToken()
  if (!token) {
    const err = new Error('MERCADOPAGO_ACCESS_TOKEN not configured')
    err.code = 'MP_NOT_CONFIGURED'
    throw err
  }
  const res = await fetch(`${MP_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
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

module.exports = { mpFetchJson }
