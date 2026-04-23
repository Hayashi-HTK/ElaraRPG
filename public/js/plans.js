const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_MS = 30 * DAY_MS

const PLAN_META = {
  free: {
    key: 'free',
    name: 'Aventureiro',
    maxSheets: 1,
    canChangeAvatarBanner: false,
    canUseFrames: false,
    canUseBgLayers: false
  },
  basic: {
    key: 'basic',
    name: 'Herói',
    maxSheets: 5,
    canChangeAvatarBanner: true,
    canUseFrames: false,
    canUseBgLayers: false
  },
  premium: {
    key: 'premium',
    name: 'Lenda',
    maxSheets: Number.POSITIVE_INFINITY,
    canChangeAvatarBanner: true,
    canUseFrames: true,
    canUseBgLayers: true
  },
  ADM: {
    key: 'ADM',
    name: 'ADM',
    maxSheets: Number.POSITIVE_INFINITY,
    canChangeAvatarBanner: true,
    canUseFrames: true,
    canUseBgLayers: true
  },
}

const normalizePlanKey = (raw) => {
  const k = String(raw || '').trim().toLowerCase()
  const plain = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (plain === 'basic' || plain === 'premium' || plain === 'free' || plain === 'adm') return plain
  if (plain === 'heroi' || plain === 'hero') return 'basic'
  if (plain === 'lenda' || plain === 'legend') return 'premium'
  if (plain === 'aventureiro' || plain === 'adventurer') return 'free'
  return 'free'
}

const toDate = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate()
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
    } catch {
      return null
    }
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export const isAdminUser = (user, profile) => {
  if (!user) return false
  return !!profile?.is_admin || user.email === 'hayagames@outlook.com'
}

export const upgradeHref = () => 'index.html?view=landing#pricing'

export const getPlanPeriod = (profile) => {
  const startsAt = toDate(profile?.plan_updated_at) || toDate(profile?.plan_started_at) || null
  const explicitEnd = toDate(profile?.plan_expires_at)
  const endsAt = explicitEnd || (startsAt ? new Date(startsAt.getTime() + PERIOD_MS) : null)
  const remainingDays = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / DAY_MS)) : null
  return { startsAt, endsAt, remainingDays }
}

export const getPlanState = ({ user, profile }) => {
  const admin = isAdminUser(user, profile)
  const rawKey = normalizePlanKey(profile?.plan)
  const rawStatus = String(profile?.plan_status || '').trim().toLowerCase()
  const status = rawStatus || (rawKey === 'free' ? 'free' : 'active')
  const { startsAt, endsAt, remainingDays } = getPlanPeriod(profile)

  const isExpired = !!(endsAt && endsAt.getTime() < Date.now())

  let key = rawKey
  if (!admin) {
    if (rawKey === 'free') key = 'free'
    else if (status === 'canceling' && isExpired) key = 'free'
    else if (status === 'active' && isExpired) key = 'free'
    else if (rawKey === 'ADM') key = 'ADM'
  }

  const meta = PLAN_META[key] || PLAN_META.free
  return {
    admin,
    key,
    rawKey,
    status,
    displayName: admin ? 'ADM' : meta.name,
    maxSheets: admin ? Number.POSITIVE_INFINITY : meta.maxSheets,
    canChangeAvatarBanner: admin ? true : meta.canChangeAvatarBanner,
    canUseFrames: admin ? true : meta.canUseFrames,
    canUseBgLayers: admin ? true : meta.canUseBgLayers,
    periodStartsAt: startsAt,
    periodEndsAt: endsAt,
    remainingDays,
    isPaid: admin ? true : key !== 'free'
  }
}
