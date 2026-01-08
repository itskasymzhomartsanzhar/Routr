import { useEffect, useState } from 'react'
import Header from '../../components/organisms/Header/Header.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import PublicHabitModal from '../../components/organisms/PublicHabitModal/PublicHabitModal.jsx'
import placeholderAvatar from '../../assets/placeholder.png'
import './Stats.scss'

const Stats = () => {
  const [activeRange, setActiveRange] = useState('month')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isProfileClosing, setIsProfileClosing] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState(null)
  const topUsers = [
    {
      id: 2,
      name: 'Екатерина',
      rank: 2,
      xp: 12453,
      avatar: placeholderAvatar
    },
    {
      id: 1,
      name: 'Павел',
      rank: 1,
      xp: 15430,
      avatar: placeholderAvatar
    },
    {
      id: 3,
      name: 'Александр',
      rank: 3,
      xp: 10524,
      avatar: placeholderAvatar
    }
  ]
  const listUsers = [
    { id: 4, name: 'Пользователь', xp: 9452, avatar: placeholderAvatar },
    { id: 5, name: 'Пользователь', xp: 9234, avatar: placeholderAvatar },
    { id: 6, name: 'Пользователь', xp: 9134, avatar: placeholderAvatar },
    { id: 7, name: 'Пользователь', xp: 8923, avatar: placeholderAvatar },
    { id: 8, name: 'Пользователь', xp: 8603, avatar: placeholderAvatar },
    { id: 9, name: 'Пользователь', xp: 8456, avatar: placeholderAvatar },
    { id: 10, name: 'Пользователь', xp: 7845, avatar: placeholderAvatar }
  ]
  const currentUser = {
    id: 34,
    name: 'Mikhail Plyasov',
    xp: 1000,
    avatar: placeholderAvatar
  }
  const profileBalanceData = [
    { label: 'Здоровье', value: 12, color: '#1BB6A7' },
    { label: 'Работа', value: 22, color: '#3C7CFF' },
    { label: 'Обучение', value: 12, color: '#6C63FF' },
    { label: 'Отношения', value: 12, color: '#F24E9B' },
    { label: 'Финансы', value: 7, color: '#F59E0B' },
    { label: 'Личностный рост', value: 7, color: '#FACC15' }
  ]
  const profileHabits = [
    {
      id: 1,
      title: 'Медитация 10 минут',
      category: 'Здоровье',
      icon: '🧘',
      frequency: '1 раз в день',
      days: 'Понедельник, среда, пятница',
      copiedCount: 105
    },
    {
      id: 2,
      title: 'Прочитать 10 страниц',
      category: 'Образование',
      icon: '📘',
      frequency: '1 раз в день',
      days: 'Понедельник, среда, пятница',
      copiedCount: 68
    }
  ]
  const profileTotal = profileBalanceData.reduce((sum, item) => sum + item.value, 0)
  const profileGapSize = 2
  const profileSegmentCount = profileBalanceData.length
  const profileAvailableAngle = 360 - profileGapSize * profileSegmentCount
  let profileCurrentAngle = 0
  const profileBalanceGradient = profileBalanceData
    .map((item) => {
      const segmentAngle = profileTotal > 0
        ? (item.value / profileTotal) * profileAvailableAngle
        : 0
      const start = profileCurrentAngle
      const end = profileCurrentAngle + segmentAngle
      profileCurrentAngle = end + profileGapSize
      return `${item.color} ${start}deg ${end}deg, #FFFFFF ${end}deg ${end + profileGapSize}deg`
    })
    .join(', ')
  const ranges = [
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'all', label: 'Все время' }
  ]
  const activeIndex = ranges.findIndex((range) => range.id === activeRange)
  const indicatorStyle = {
    transform: `translateX(${activeIndex * 100}%)`
  }

  const handleOpenProfile = (user) => {
    setSelectedUser(user)
    setIsProfileOpen(true)
  }

  const handleCloseProfile = () => {
    setIsHabitModalOpen(false)
    setIsProfileClosing(true)
    setTimeout(() => {
      setIsProfileClosing(false)
      setIsProfileOpen(false)
    }, 300)
  }

  useEffect(() => {
    if (isProfileOpen) {
      document.body.style.overflow = 'hidden'
    } else if (!isProfileClosing) {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isProfileOpen, isProfileClosing])

  const handleOpenHabit = (habit) => {
    setSelectedHabit(habit)
    setIsHabitModalOpen(true)
  }

  const handleCloseHabit = () => {
    setIsHabitModalOpen(false)
  }

  return (
    <div className={`stats ${isProfileOpen || isProfileClosing ? 'stats--modal-open' : ''}`}>
      <div className="stats__leaderboard">
        <h2 className="stats__title">Лидерборд</h2>
        <div className="stats__tabs">
          <span className="stats__tab-indicator" style={indicatorStyle}></span>
          {ranges.map((range) => (
            <button
              key={range.id}
              className={`stats__tab ${activeRange === range.id ? 'stats__tab--active' : ''}`}
              type="button"
              onClick={() => setActiveRange(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="stats__podium">
          <button
            className="stats__podium-card stats__podium-card--second"
            type="button"
            onClick={() => handleOpenProfile(topUsers[0])}
          >
            <div
              className="stats__avatar"
              style={{ backgroundImage: `url(${topUsers[0].avatar})` }}
            ></div>
            <div className="stats__name">{topUsers[0].name}</div>
            <div className="stats__rank">#{topUsers[0].rank}</div>
            <div className="stats__xp-pill">{topUsers[0].xp} XP</div>
          </button>
          <button
            className="stats__podium-card stats__podium-card--first"
            type="button"
            onClick={() => handleOpenProfile(topUsers[1])}
          >
            <div
              className="stats__avatar stats__avatar--large"
              style={{ backgroundImage: `url(${topUsers[1].avatar})` }}
            ></div>
            <div className="stats__name stats__name--first">{topUsers[1].name}</div>
            <div className="stats__rank stats__rank--primary">#{topUsers[1].rank}</div>
            <div className="stats__xp-pill stats__xp-pill--primary">{topUsers[1].xp} XP</div>
          </button>
          <button
            className="stats__podium-card stats__podium-card--third"
            type="button"
            onClick={() => handleOpenProfile(topUsers[2])}
          >
            <div
              className="stats__avatar"
              style={{ backgroundImage: `url(${topUsers[2].avatar})` }}
            ></div>
            <div className="stats__name">{topUsers[2].name}</div>
            <div className="stats__rank">#{topUsers[2].rank}</div>
            <div className="stats__xp-pill">{topUsers[2].xp} XP</div>
          </button>
        </div>

        <div className="stats__list">
          {listUsers.map((user) => (
            <button
              key={user.id}
              className="stats__list-item"
              type="button"
              onClick={() => handleOpenProfile(user)}
            >
              <div className="stats__list-rank">{user.id}</div>
              <div className="stats__list-info">
                <div className="stats__list-name">{user.name}</div>
                <div className="stats__list-xp">{user.xp} XP</div>
              </div>
              <div
                className="stats__list-avatar"
                style={{ backgroundImage: `url(${user.avatar})` }}
              ></div>
            </button>
          ))}
          <button
            className="stats__list-item stats__list-item--me"
            type="button"
            onClick={() => handleOpenProfile(currentUser)}
          >
            <div className="stats__list-rank stats__list-rank--me">{currentUser.id}</div>
            <div className="stats__list-info">
              <div className="stats__list-name">{currentUser.name}</div>
              <div className="stats__list-xp">{currentUser.xp} XP</div>
            </div>
            <div
              className="stats__list-avatar"
              style={{ backgroundImage: `url(${currentUser.avatar})` }}
            ></div>
          </button>
        </div>
      </div>
      {(isProfileOpen || isProfileClosing) && (
        <div
          className={`stats__profile-overlay ${isProfileClosing ? 'stats__profile-overlay--closing' : ''}`}
          onClick={handleCloseProfile}
        >
          <div
            className={`stats__profile-modal ${isProfileClosing ? 'stats__profile-modal--closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="stats__profile-scroll">
              <div className="stats__profile-header">
                <button
                  className="stats__profile-back"
                  type="button"
                  aria-label="Назад"
                  onClick={handleCloseProfile}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18L9 12L15 6" stroke="#0F1F35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <h2 className="stats__profile-title">Просмотр профиля</h2>
              </div>

              <section className="stats-profile__card">
                <div className="stats-profile__card-header">
                  <div className="stats-profile__card-main">
                    <div
                      className="stats-profile__avatar"
                      style={{ backgroundImage: `url(${selectedUser?.avatar || placeholderAvatar})` }}
                    ></div>
                    <div className="stats-profile__user-meta">
                      <div className="stats-profile__user-name">{selectedUser?.name || 'Пользователь'}</div>
                      <span className="stats-profile__user-badge">Premium</span>
                    </div>
                  </div>
                </div>
                <div className="stats-profile__rank-row">
                  <div className="stats-profile__user-row">
                    <div className="stats-profile__user-rank">Исследователь</div>
                    <div className="stats-profile__user-xp">{selectedUser?.xp ?? 0}XP</div>
                  </div>
                  <div className="stats-profile__user-level">Уровень 10</div>
                </div>
                <div className="stats-profile__progress">
                  <div className="stats-profile__progress-fill"></div>
                </div>
              </section>

              <section className="stats__profile-section">
                <div className="stats__profile-section-title">Колесо Баланса</div>
                <div className="stats__profile-balance">
                  <div className="stats__profile-chart">
                    <div
                      className="stats__profile-chart-ring"
                      style={{ background: `conic-gradient(${profileBalanceGradient})` }}
                    ></div>
                    <div className="stats__profile-chart-center">
                      <div className="stats__profile-chart-label">Общий балл</div>
                      <div className="stats__profile-chart-score">{profileTotal}</div>
                    </div>
                  </div>
                  <div className="stats__profile-legend">
                    {profileBalanceData.map((item) => (
                      <div key={item.label} className="stats__profile-legend-item">
                        <span className="stats__profile-legend-dot" style={{ background: item.color }}></span>
                        <span className="stats__profile-legend-label">{item.label}</span>
                        <span className="stats__profile-legend-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="stats__profile-section">
                <div className="stats__profile-section-title">Публичные привычки</div>
                <div className="stats__profile-habits">
                  {profileHabits.map((habit) => (
                    <button
                      key={habit.id}
                      className="stats__profile-habit-card"
                      type="button"
                      onClick={() => handleOpenHabit(habit)}
                    >
                      <div className="stats__profile-habit-icon">{habit.icon}</div>
                      <div className="stats__profile-habit-info">
                        <div className="stats__profile-habit-title">{habit.title}</div>
                        <div className="stats__profile-habit-category">{habit.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      <PublicHabitModal
        isOpen={isHabitModalOpen}
        onClose={handleCloseHabit}
        habit={selectedHabit}
        author={selectedUser}
      />
      <BottomNav />
    </div>
  )
}

export default Stats
