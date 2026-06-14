const LOCAL_HTTP_RE = /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i
const ABSOLUTE_URL_RE = /^https?:\/\//i
const SPECIAL_URL_RE = /^(data:image\/|blob:)/i

const normalizeRaw = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const lowered = trimmed.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'none') return ''
  return trimmed
}

export const normalizeAvatarUrl = (value) => {
  const raw = normalizeRaw(value)
  if (!raw) return ''
  if (SPECIAL_URL_RE.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`

  try {
    const resolved = ABSOLUTE_URL_RE.test(raw)
      ? new URL(raw)
      : new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://routr.swifttest.ru')

    if (resolved.protocol === 'http:' && !LOCAL_HTTP_RE.test(resolved.toString())) {
      resolved.protocol = 'https:'
    }
    return resolved.toString()
  } catch {
    if (LOCAL_HTTP_RE.test(raw)) return raw
    return raw.replace(/^http:\/\//i, 'https://')
  }
}

export const createAvatarPlaceholder = (name = '') => {
  const initial = (String(name || '?').trim().charAt(0).toUpperCase() || '?')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#3843FF"/>
      <text x="64" y="68" text-anchor="middle" dominant-baseline="middle"
        fill="#FFFFFF" font-family="Arial, sans-serif" font-size="56" font-weight="600">${initial}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const resolveAvatarUrl = (value, fallback = '') => {
  return normalizeAvatarUrl(value) || fallback
}
