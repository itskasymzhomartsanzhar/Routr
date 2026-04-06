export const normalizeMediaUrl = (rawUrl) => {
  if (!rawUrl) return null
  const value = String(rawUrl).trim()
  if (!value) return null
  const enforceHttps = (url) => {
    if (!url) return url
    if (/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url)) return url
    return url.replace(/^http:\/\//i, 'https://')
  }

  try {
    const resolved = new URL(value, window.location.origin)
    const host = (resolved.hostname || '').toLowerCase()
    const isLocalHost = host === 'localhost' || host === '127.0.0.1'
    if (!isLocalHost && resolved.protocol === 'http:') {
      resolved.protocol = 'https:'
    }
    return enforceHttps(resolved.toString())
  } catch {
    return enforceHttps(value)
  }
}
