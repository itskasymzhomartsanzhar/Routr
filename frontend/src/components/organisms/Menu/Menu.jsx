import { useNavigate, useLocation } from 'react-router-dom'
import './Menu.scss'

const Menu = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const getActiveTab = () => {
    const path = location.pathname
    if (path === '/') return 'home'
    return path.slice(1)
  }

  const activeTab = getActiveTab()

  const handleNavigation = (id) => {
    if (id === 'home') {
      navigate('/')
    } else {
      navigate(`/${id}`)
    }
  }

  const menuItems = [
    {
      id: 'home',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M9.14373 20.7821V17.7152C9.14372 16.9381 9.77567 16.3067 10.5584 16.3018H13.4326C14.2189 16.3018 14.8563 16.9346 14.8563 17.7152V20.7732C14.8562 21.4473 15.404 21.9951 16.0829 22H18.0438C18.9596 22.0023 19.8388 21.6428 20.4872 21.0007C21.1356 20.3586 21.5 19.4868 21.5 18.5775V9.86585C21.5 9.13139 21.1721 8.43471 20.6046 7.9635L13.943 2.67427C12.7785 1.74912 11.1154 1.77901 9.98539 2.74538L3.46701 7.9635C2.87274 8.42082 2.51755 9.11956 2.5 9.86585V18.5686C2.5 20.4637 4.04738 22 5.95617 22H7.87229C8.19917 22.0023 8.51349 21.8751 8.74547 21.6464C8.97746 21.4178 9.10793 21.1067 9.10792 20.7821H9.14373Z"/>
</svg>

      ),
    },
    {
      id: 'journal',
      icon: (
<svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path d="M4.13481 16.75C4.57243 18.3356 6.02523 19.5 7.75 19.5H11.75C13.8211 19.5 15.5 17.8211 15.5 15.75V7.75C15.5 6.02523 14.3356 4.57243 12.75 4.13481V11.75C12.75 14.5114 10.5114 16.75 7.75 16.75H4.13481Z"/>
<path d="M3.75 0C1.67893 0 0 1.67893 0 3.75V11.75C0 13.8211 1.67893 15.5 3.75 15.5H7.75C9.82107 15.5 11.5 13.8211 11.5 11.75V3.75C11.5 1.67893 9.82107 0 7.75 0H3.75Z"/>
</svg>

      ),
    },
    {
      id: 'shop',
      icon: (
<svg width="18" height="20" viewBox="0 0 18 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path d="M12 7.75C12 8.16421 12.3358 8.5 12.75 8.5C13.1642 8.5 13.5 8.16421 13.5 7.75V5.05859C15.767 5.41816 17.5 7.38183 17.5 9.75V14.75C17.5 17.3734 15.3734 19.5 12.75 19.5H4.75C2.12665 19.5 0 17.3734 0 14.75V9.75C0 7.38183 1.73299 5.41816 4 5.05859V7.75C4 8.16421 4.33579 8.5 4.75 8.5C5.16421 8.5 5.5 8.16421 5.5 7.75V5H12V7.75ZM8.75 0C11.3734 0 13.5 2.12665 13.5 4.75V5.05859C13.2557 5.01985 13.0052 5 12.75 5H12V4.75C12 2.95507 10.5449 1.5 8.75 1.5C6.95507 1.5 5.5 2.95507 5.5 4.75V5H4.75C4.49481 5 4.24429 5.01985 4 5.05859V4.75C4 2.12665 6.12665 0 8.75 0Z"/>
</svg>

      ),
    },
    {
      id: 'stats',
      icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M7.2608 9.84822C8.50756 8.70072 10.1719 8 12 8C13.828 8 15.4924 8.70072 16.7391 9.84822L19.81 4.21828C20.3552 3.21872 19.6318 2 18.4932 2H15.1768C14.4505 2 13.7812 2.39378 13.4285 3.02871L11.9999 5.60016L10.5714 3.02871C10.2186 2.39378 9.54937 2 8.82304 2H5.50676C4.36817 2 3.6447 3.21872 4.18992 4.21828L7.2608 9.84822Z" fill="#EAECF0"/>
<path d="M19 15C19 18.866 15.866 22 12 22C8.13401 22 5 18.866 5 15C5 11.134 8.13401 8 12 8C15.866 8 19 11.134 19 15Z" fill={activeTab === 'stats' ? '#3843FF' : '#9B9BA1'}/>
<path fillRule="evenodd" clipRule="evenodd" d="M12 17C13.1046 17 14 16.1046 14 15C14 13.8954 13.1046 13 12 13C10.8954 13 10 13.8954 10 15C10 16.1046 10.8954 17 12 17Z" fill="#EAECF0"/>
</svg>

      ),
    },
    {
      id: 'profile',
      icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M11.9968 12.5837C14.9348 12.5837 17.2888 10.2287 17.2888 7.29169C17.2888 4.35469 14.9348 1.99969 11.9968 1.99969C9.05977 1.99969 6.70477 4.35469 6.70477 7.29169C6.70477 10.2287 9.05977 12.5837 11.9968 12.5837Z"/>
<path fillRule="evenodd" clipRule="evenodd" d="M11.9968 15.1746C7.68382 15.1746 3.99982 15.8546 3.99982 18.5746C3.99982 21.2956 7.66082 21.9996 11.9968 21.9996C16.3098 21.9996 19.9938 21.3206 19.9938 18.5996C19.9938 15.8786 16.3338 15.1746 11.9968 15.1746Z"/>
</svg>

      ),
    },
    {
      id: 'preloader',
      icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C15.3137 20 18.1596 18.0023 19.4076 15.1432" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
<path d="M20 12C20 9.79086 18.2091 8 16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
</svg>

      ),
    },
  ]

  return (
    <nav className="menu">
      <div className="menu__container">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`menu__item ${
              activeTab === item.id ? 'menu__item--active' : ''
            }`}
            onClick={() => handleNavigation(item.id)}
            aria-label={item.id}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default Menu
