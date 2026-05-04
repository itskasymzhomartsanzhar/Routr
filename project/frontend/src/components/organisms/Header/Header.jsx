import { useEffect, useMemo, useState } from 'react'
import './Header.scss'
import placeholderAvatar from '../../../assets/placeholder.png'
import { resolveAvatarUrl } from '../../../utils/avatar.js'

const Header = ({ userName = 'Mikhail', avatarUrl = null }) => {
  const safeAvatarUrl = useMemo(() => resolveAvatarUrl(avatarUrl, placeholderAvatar), [avatarUrl])
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [safeAvatarUrl])

  const canShowImage = safeAvatarUrl && !imageFailed

  return (
    <header className="header">
      <h1 className="header__greeting">
        Привет, {userName} 👋
      </h1>
      <div className="header__avatar">
        {canShowImage ? (
          <img
            src={safeAvatarUrl}
            alt={userName}
            className="header__avatar-img"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
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
