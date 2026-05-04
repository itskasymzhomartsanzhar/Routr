import placeholderAvatar from '../assets/placeholder.png'

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

export const resolveAvatarUrl = (value, fallback = placeholderAvatar) => {
  return normalizeAvatarUrl(value) || fallback
}

