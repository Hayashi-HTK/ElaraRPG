const normalizeOrigin = (origin) => {
  const o = String(origin || '').trim()
  return o ? o : null
}

const parseAllowList = (raw) => {
  const v = String(raw || '').trim()
  if (!v) return null
  if (v === '*') return '*'
  return v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

const pickAllowedOrigin = (origin) => {
  const o = normalizeOrigin(origin)
  if (!o) return null

  const allow = parseAllowList(process.env.CORS_ALLOW_ORIGINS)
  if (!allow) return o
  if (allow === '*') return '*'
  return allow.includes(o) ? o : null
}

const applyCors = (req, res) => {
  const allowedOrigin = pickAllowedOrigin(req.headers.origin)
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
  }

  const method = String(req.method || '').toUpperCase()
  if (method === 'OPTIONS') {
    res.status(204).end()
    return true
  }

  return false
}

module.exports = { applyCors }
