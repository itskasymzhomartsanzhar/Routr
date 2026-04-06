export const normalizeMediaUrl = (rawUrl) => {
  if (!rawUrl) return null
  const value = String(rawUrl).trim()
  if (!value) return null

  try {
    const resolved = new URL(value, window.location.origin)
    if (window.location.protocol === 'https:' && resolved.protocol === 'http:') {
      resolved.protocol = 'https:'
    }
    return resolved.toString()
  } catch {
    return value
  }
}

