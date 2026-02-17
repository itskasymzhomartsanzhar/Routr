import './Header.scss'

const Header = ({ userName = 'Mikhail', avatarUrl = null }) => {
  return (
    <header className="header">
      <h1 className="header__greeting">
        Привет, {userName} 👋
      </h1>
      <div className="header__avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName} className="header__avatar-img" />
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
