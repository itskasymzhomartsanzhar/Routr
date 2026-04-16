import './Header.scss'

const forceHttps = (value) => {
  const text = String(value || '')
  if (/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(text)) return text
  return text.replace(/^http:\/\//i, 'https://')
}

const Header = ({ userName = 'Mikhail', avatarUrl = null }) => {
  const safeAvatarUrl = avatarUrl ? forceHttps(avatarUrl) : null
  return (
    <header className="header">
      <h1 className="header__greeting">
        Привет, {userName} 👋
      </h1>
      <div className="header__avatar">
        {safeAvatarUrl ? (
          <img src={safeAvatarUrl} alt={userName} className="header__avatar-img" />
        ) : (
          <div className="header__avatar-placeholder">
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
