export const normalizeMediaUrl = (rawUrl) => {
  if (!rawUrl) return null
  const value = String(rawUrl).trim()
  if (!value) return null

  try {
    const resolved = new URL(value, window.location.origin)
    const host = (resolved.hostname || '').toLowerCase()
    const isLocalHost = host === 'localhost' || host === '127.0.0.1'
    if (!isLocalHost && resolved.protocol === 'http:') {
      resolved.protocol = 'https:'
    }
    return resolved.toString()
  } catch {
    return value
  }
}
