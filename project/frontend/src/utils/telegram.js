export const getTelegramWebApp = () => {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp || null
}

export const initTelegramWebApp = () => {
  const webApp = getTelegramWebApp()
  if (!webApp) return null
  try {
    webApp.ready()
    webApp.expand()
  } catch {
    return webApp
  }
  return webApp
}

export const getTelegramInitData = () => {
  const webApp = getTelegramWebApp()
  const initData = webApp?.initData || ''
  if (initData) return initData
  return ''
}

export const openTelegramLink = (url) => {
  const webApp = getTelegramWebApp()
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url)
    return true
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  return false
}

export const openTelegramShare = ({ url, text = '' }) => {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  return openTelegramLink(shareUrl)
}
