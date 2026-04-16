export const normalizeMediaUrl = (rawUrl) => {
  if (!rawUrl) return null
  const value = String(rawUrl).trim()
  if (!value) return null
  if (value.startsWith('/')) {
    return `${window.location.origin}${value}`.replace(/^http:\/\//i, 'https://')
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(value)) return value
  return value.replace(/^http:\/\//i, 'https://')
}
