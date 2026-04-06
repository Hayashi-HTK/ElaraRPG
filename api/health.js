const { applyCors } = require('../lib/cors')

module.exports = async (req, res) => {
  if (applyCors(req, res)) return

  res.status(200).json({
    ok: true,
    vercel_env: process.env.VERCEL_ENV || null,
    vercel_commit: process.env.VERCEL_GIT_COMMIT_SHA || null
  })
}
