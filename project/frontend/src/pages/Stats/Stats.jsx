import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Header from '../../components/organisms/Header/Header.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import PublicHabitModal from '../../components/organisms/PublicHabitModal/PublicHabitModal.jsx'
import placeholderAvatar from '../../assets/placeholder.png'
import { request } from '../../utils/api.js'
import ENDPOINTS from '../../utils/endpoints.js'
import { buildBalanceFromHabits } from '../../utils/balance.js'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import './Stats.scss'

const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const LEADERBOARD_LIMIT = 10

const Stats = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { bootstrap, setBootstrapData } = useAppData()
  const [activeRange, setActiveRange] = useState('month')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isProfileClosing, setIsProfileClosing] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState(null)
  const [profileHabits, setProfileHabits] = useState([])
  const [profileBalanceData, setProfileBalanceData] = useState([])
  const [leaderboard, setLeaderboard] = useState(() => bootstrap?.leaderboard ?? { items: [], me: null })
  const deepLinkHandledRef = useRef('')
  const deepLinkHabitHandledRef = useRef('')
  const leaderboardCacheRef = useRef((() => {
    if (!bootstrap?.leaderboard?.items?.length) return {}
    return {
      month: {
        payload: bootstrap.leaderboard,
        cachedAt: Date.now()
      }
    }
  })())
  const leaderboardInFlightRef = useRef({})
  const normalizeLeaderboardPayload = (payload) => ({
    items: (payload?.items ?? []).slice(0, LEADERBOARD_LIMIT),
    me: payload?.me ?? null
  })

  const categoryColors = {
    Здоровье: '#1BB6A7',
    Работа: '#3C7CFF',
    Обучение: '#6C63FF',
    Отношения: '#F24E9B',
    Финансы: '#F59E0B',
    'Личностный рост': '#FACC15',
    Образование: '#22C55E',
    Личное: '#8892FF'
  }
  const fallbackColors = [
    '#1BB6A7',
    '#3C7CFF',
    '#6C63FF',
    '#F24E9B',
    '#F59E0B',
    '#FACC15',
    '#22C55E',
    '#14B8A6',
    '#EF4444',
    '#A855F7',
    '#0EA5E9',
    '#84CC16'
  ]

  const assignUniqueColors = (items) => {
    const used = new Set()
    return items.map((item, index) => {
      const preferred = categoryColors[item.label]
      let color = preferred && !used.has(preferred) ? preferred : null
      if (!color) {
        color = fallbackColors.find((value) => !used.has(value)) || fallbackColors[index % fallbackColors.length]
      }
      used.add(color)
      return { ...item, color }
    })
  }
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
    if (!user || typeof user.id !== 'number') return
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

  useEffect(() => {
    if (!isProfileOpen || !selectedUser?.id) {
      setProfileHabits([])
      setProfileBalanceData([])
      return
    }
    const isOwnProfile = String(selectedUser.id) === String(bootstrap?.user?.id)
    const loadPublicHabits = async () => {
      try {
        const response = await request.get(ENDPOINTS.habits.publicHabits, { owner_id: selectedUser.id, limit: 20 })
        const items = (response?.items ?? []).filter((item) => item?.author?.id === selectedUser.id)
        setProfileHabits(items)
        if (isOwnProfile) {
          const ownItems = bootstrap?.balance?.items ?? []
          const mappedOwnItems = ownItems.map((item) => ({ label: item.label, value: item.value }))
          setProfileBalanceData(assignUniqueColors(mappedOwnItems))
        } else {
          const publicBalance = buildBalanceFromHabits(items, { publicOnly: true })
          setProfileBalanceData(assignUniqueColors(publicBalance.items))
        }
      } catch (error) {
        setProfileHabits([])
        setProfileBalanceData([])
      }
    }
    loadPublicHabits()
  }, [bootstrap?.balance?.items, bootstrap?.user?.id, isProfileOpen, selectedUser?.id])

  useEffect(() => {
    if (!isProfileOpen || !selectedUser?.id) return
    let cancelled = false
    const loadProfileMeta = async () => {
      try {
        const data = await request.get(ENDPOINTS.users.publicProfile(selectedUser.id))
        if (cancelled) return
        setSelectedUser((prev) => {
          if (!prev || prev.id !== data.id) return prev
          return {
            ...prev,
            name: data.name,
            avatar: data.avatar || prev.avatar || placeholderAvatar,
            level: Number(data.level ?? prev.level ?? 1),
            xp: Number(data.xp ?? prev.xp ?? 0),
            title: data.title || prev.title || '',
            is_premium: Boolean(data.is_premium),
          }
        })
      } catch (error) {
        return
      }
    }
    loadProfileMeta()
    return () => {
      cancelled = true
    }
  }, [isProfileOpen, selectedUser?.id])

  useEffect(() => {
    if (!bootstrap?.leaderboard?.items?.length) return
    const payload = normalizeLeaderboardPayload(bootstrap.leaderboard)
    leaderboardCacheRef.current = {
      ...leaderboardCacheRef.current,
      month: { payload, cachedAt: Date.now() }
    }
    if (activeRange === 'month') {
      setLeaderboard(payload)
    }
  }, [bootstrap?.leaderboard, activeRange])

  useEffect(() => {
    let cancelled = false

    const cachedRange = leaderboardCacheRef.current[activeRange]
    if (cachedRange && Date.now() - cachedRange.cachedAt < LEADERBOARD_CACHE_TTL_MS) {
      setLeaderboard(cachedRange.payload)
      return () => {
        cancelled = true
      }
    }

    const loadLeaderboard = async () => {
      try {
        if (!leaderboardInFlightRef.current[activeRange]) {
          leaderboardInFlightRef.current[activeRange] = request.get(ENDPOINTS.xp.leaderboard, { range: activeRange, limit: LEADERBOARD_LIMIT })
        }
        const response = await leaderboardInFlightRef.current[activeRange]
        const payload = normalizeLeaderboardPayload(response)
        leaderboardCacheRef.current = {
          ...leaderboardCacheRef.current,
          [activeRange]: {
            payload,
            cachedAt: Date.now()
          }
        }
        if (!cancelled) {
          setLeaderboard(payload)
        }
        if (activeRange === 'month') {
          setBootstrapData((prev) => ({ ...prev, leaderboard: payload }))
        }
      } catch (error) {
        if (!cancelled) {
          setLeaderboard({ items: [], me: null })
        }
      } finally {
        delete leaderboardInFlightRef.current[activeRange]
      }
    }

    loadLeaderboard()
    return () => {
      cancelled = true
    }
  }, [activeRange, setBootstrapData])

  const handleOpenHabit = (habit) => {
    setSelectedHabit(habit)
    setIsHabitModalOpen(true)
  }

  const handleCloseHabit = () => {
    setIsHabitModalOpen(false)
  }

  const handleHabitCopied = (habitId) => {
    setProfileHabits((prev) => prev.map((item) => (
      item.id === habitId
        ? { ...item, is_copied: true, can_copy: false, copied_count: (item.copied_count ?? 0) + 1 }
        : item
    )))
    setSelectedHabit((prev) => (
      prev && prev.id === habitId
        ? { ...prev, is_copied: true, can_copy: false, copied_count: (prev.copied_count ?? 0) + 1 }
        : prev
    ))
  }

  const currentUserId = bootstrap?.user?.id
  const participationInRatings = bootstrap?.user?.participation_in_ratings !== false
  const effectiveLeaderboard = useMemo(() => {
    const baseItems = Array.isArray(leaderboard?.items) ? leaderboard.items : []
    const sanitizedItems = currentUserId
      ? baseItems.filter((item) => String(item?.id) !== String(currentUserId))
      : baseItems

    if (!participationInRatings) {
      return {
        items: sanitizedItems,
        me: null
      }
    }

    if (leaderboard?.me) {
      return {
        items: sanitizedItems,
        me: leaderboard.me
      }
    }

    if (!bootstrap?.user?.id) {
      return {
        items: sanitizedItems,
        me: null
      }
    }

    return {
      items: sanitizedItems,
      me: {
        id: bootstrap.user.id,
        name: bootstrap.user.first_name || bootstrap.user.username || `User ${bootstrap.user.id}`,
        avatar: bootstrap.user.photo_url || '',
        level: Number(bootstrap.user.level ?? 1),
        xp: Number(bootstrap.user.xp ?? 0),
        title: bootstrap.user.title || '',
        rank: null,
        is_premium: Boolean(bootstrap.user.is_premium),
      }
    }
  }, [bootstrap?.user, currentUserId, leaderboard, participationInRatings])

  const currentUser = effectiveLeaderboard.me
    ? {
      ...effectiveLeaderboard.me,
      avatar: effectiveLeaderboard.me.avatar || placeholderAvatar,
      is_premium: Boolean(effectiveLeaderboard.me?.is_premium)
    }
    : null
  const displayItems = (() => {
    const normalizeRanks = (items) => items.map((item, index) => ({
      ...item,
      rank: index + 1,
    }))
    const base = effectiveLeaderboard.items.map((item) => ({
      ...item,
      avatar: item.avatar || placeholderAvatar,
      is_premium: Boolean(item?.is_premium)
    }))
    if (!currentUser || typeof currentUser.rank !== 'number' || currentUser.rank < 1 || currentUser.rank > LEADERBOARD_LIMIT) {
      return normalizeRanks(base)
    }
    const exists = base.some((item) => String(item.id) === String(currentUser.id))
    if (exists) return normalizeRanks(base)
    const next = base.slice(0, LEADERBOARD_LIMIT)
    const insertIndex = Math.max(0, Math.min(currentUser.rank - 1, LEADERBOARD_LIMIT - 1))
    next.splice(insertIndex, 0, currentUser)
    return normalizeRanks(next.slice(0, LEADERBOARD_LIMIT))
  })()
  const topUsers = displayItems.slice(0, 3).map((user, index) => ({
    ...user,
    rank: user.rank ?? index + 1,
    avatar: user.avatar || placeholderAvatar,
    is_premium: Boolean(user?.is_premium)
  }))
  const podiumUsers = [0, 1, 2].map((index) => {
    const user = topUsers[index]
    if (user) return user
    return {
      id: `empty-${index}`,
      name: '—',
      rank: index + 1,
      xp: 0,
      avatar: placeholderAvatar,
      is_premium: false
    }
  })
  const firstUser = podiumUsers[0]
  const secondUser = podiumUsers[1]
  const thirdUser = podiumUsers[2]
  const listUsers = displayItems.slice(3).map((user) => ({
    ...user,
    avatar: user.avatar || placeholderAvatar,
    is_premium: Boolean(user?.is_premium)
  }))
  const isCurrentUserInTopList = Boolean(
    currentUser && displayItems.some((item) => String(item.id) === String(currentUser.id))
  )
  const isCurrentUser = (user) => Boolean(currentUser && String(user?.id) === String(currentUser.id))
  const selectedLevel = Math.max(Number(selectedUser?.level ?? 1) || 1, 1)
  const selectedTitleName = selectedUser?.title || 'Новичок'
  const selectedTitleMeta = (Array.isArray(bootstrap?.titles) ? bootstrap.titles : [])
    .find((title) => title.name === selectedTitleName)
  const selectedTargetLevel = Math.max(Number(selectedTitleMeta?.level_max ?? selectedLevel) || selectedLevel, 1)
  const selectedLevelForProgress = Math.min(selectedLevel, selectedTargetLevel)
  const selectedProgressPercent = (selectedLevelForProgress / selectedTargetLevel) * 100

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const rawProfileId = params.get('profile_user_id')
    if (!rawProfileId || rawProfileId === deepLinkHandledRef.current) return
    const profileUserId = Number(rawProfileId)
    if (!Number.isInteger(profileUserId) || profileUserId < 1) return

    let isCancelled = false
    const openFromDeepLink = async () => {
      const fromLeaderboard =
        displayItems.find((item) => String(item.id) === String(profileUserId)) ||
        (currentUser && String(currentUser.id) === String(profileUserId) ? currentUser : null)
      if (fromLeaderboard) {
        if (isCancelled) return
        deepLinkHandledRef.current = rawProfileId
        setSelectedUser(fromLeaderboard)
        setIsProfileOpen(true)
      } else {
        try {
          const data = await request.get(ENDPOINTS.users.publicProfile(profileUserId))
          if (isCancelled) return
          deepLinkHandledRef.current = rawProfileId
          setSelectedUser({
            id: data.id,
            name: data.name,
            avatar: data.avatar || placeholderAvatar,
            level: data.level,
            xp: data.xp,
            title: data.title,
            is_premium: Boolean(data.is_premium),
          })
          setIsProfileOpen(true)
        } catch (error) {
          return
        }
      }

      const nextParams = new URLSearchParams(location.search)
      nextParams.delete('profile_user_id')
      const nextSearch = nextParams.toString()
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    }

    openFromDeepLink()
    return () => {
      isCancelled = true
    }
  }, [currentUser, displayItems, location.pathname, location.search, navigate])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const rawHabitId = params.get('public_habit_id')
    if (!rawHabitId || rawHabitId === deepLinkHabitHandledRef.current) return
    const publicHabitId = Number(rawHabitId)
    if (!Number.isInteger(publicHabitId) || publicHabitId < 1) return

    let isCancelled = false
    const openHabitFromDeepLink = async () => {
      try {
        const response = await request.get(ENDPOINTS.habits.publicHabits, { habit_id: publicHabitId, limit: 1 })
        if (isCancelled) return
        const habit = Array.isArray(response?.items) ? response.items[0] : null
        if (!habit?.id) return
        deepLinkHabitHandledRef.current = rawHabitId
        setSelectedHabit(habit)
        setSelectedUser(habit.author || null)
        setIsHabitModalOpen(true)
      } catch (error) {
        return
      } finally {
        const nextParams = new URLSearchParams(location.search)
        nextParams.delete('public_habit_id')
        const nextSearch = nextParams.toString()
        navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
      }
    }

    openHabitFromDeepLink()
    return () => {
      isCancelled = true
    }
  }, [location.pathname, location.search, navigate])

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
            className={`stats__podium-card stats__podium-card--second ${isCurrentUser(secondUser) ? 'stats__podium-card--me' : ''}`}
            type="button"
            onClick={() => handleOpenProfile(secondUser)}
          >
            <div
              className={`stats__avatar ${secondUser.is_premium ? 'stats__avatar--premium' : ''}`}
              style={{ backgroundImage: `url(${secondUser.avatar})` }}
            ></div>
            <div className="stats__name">{secondUser.name}</div>
            {secondUser.is_premium && <span className="stats__premium-badge">Premium</span>}
            <div className="stats__rank">#{secondUser.rank}</div>
            <div className="stats__xp-pill">{secondUser.xp} XP</div>
          </button>
          <button
            className={`stats__podium-card stats__podium-card--first ${isCurrentUser(firstUser) ? 'stats__podium-card--me' : ''}`}
            type="button"
            onClick={() => handleOpenProfile(firstUser)}
          >
            <div
              className={`stats__avatar stats__avatar--large ${firstUser.is_premium ? 'stats__avatar--premium' : ''}`}
              style={{ backgroundImage: `url(${firstUser.avatar})` }}
            ></div>
            <div className="stats__name stats__name--first">{firstUser.name}</div>
            {firstUser.is_premium && <span className="stats__premium-badge">Premium</span>}
            <div className="stats__rank stats__rank--primary">#{firstUser.rank}</div>
            <div className="stats__xp-pill stats__xp-pill--primary">{firstUser.xp} XP</div>
          </button>
          <button
            className={`stats__podium-card stats__podium-card--third ${isCurrentUser(thirdUser) ? 'stats__podium-card--me' : ''}`}
            type="button"
            onClick={() => handleOpenProfile(thirdUser)}
          >
            <div
              className={`stats__avatar ${thirdUser.is_premium ? 'stats__avatar--premium' : ''}`}
              style={{ backgroundImage: `url(${thirdUser.avatar})` }}
            ></div>
            <div className="stats__name">{thirdUser.name}</div>
            {thirdUser.is_premium && <span className="stats__premium-badge">Premium</span>}
            <div className="stats__rank">#{thirdUser.rank}</div>
            <div className="stats__xp-pill">{thirdUser.xp} XP</div>
          </button>
        </div>

        <div className="stats__list">
          {listUsers.map((user) => (
            <button
              key={user.id}
              className={`stats__list-item ${isCurrentUser(user) ? 'stats__list-item--me' : ''}`}
              type="button"
              onClick={() => handleOpenProfile(user)}
            >
              <div className={`stats__list-rank ${isCurrentUser(user) ? 'stats__list-rank--me' : ''}`}>{user.rank ?? '-'}</div>
              <div className="stats__list-info">
                <div className="stats__list-name-row">
                  <div className="stats__list-name">{user.name}</div>
                  {user.is_premium && <span className="stats__premium-badge">Premium</span>}
                </div>
                <div className="stats__list-xp">{user.xp} XP</div>
              </div>
              <div
                className={`stats__list-avatar ${user.is_premium ? 'stats__list-avatar--premium' : ''}`}
                style={{ backgroundImage: `url(${user.avatar})` }}
              ></div>
            </button>
          ))}
          {currentUser && !isCurrentUserInTopList && (
            <button
              className="stats__list-item stats__list-item--me"
              type="button"
              onClick={() => handleOpenProfile(currentUser)}
            >
              <div className="stats__list-rank stats__list-rank--me">{currentUser.rank ?? '-'}</div>
              <div className="stats__list-info">
                <div className="stats__list-name-row">
                  <div className="stats__list-name">{currentUser.name}</div>
                  {currentUser.is_premium && <span className="stats__premium-badge">Premium</span>}
                </div>
                <div className="stats__list-xp">{currentUser.xp} XP</div>
              </div>
              <div
                className={`stats__list-avatar ${currentUser.is_premium ? 'stats__list-avatar--premium' : ''}`}
                style={{ backgroundImage: `url(${currentUser.avatar})` }}
              ></div>
            </button>
          )}
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
                      className={`stats-profile__avatar ${selectedUser?.is_premium ? 'stats-profile__avatar--premium' : ''}`}
                      style={{ backgroundImage: `url(${selectedUser?.avatar || placeholderAvatar})` }}
                    ></div>
                    <div className="stats-profile__user-meta">
                      <div className="stats-profile__user-name">{selectedUser?.name || 'Пользователь'}</div>
                      {selectedUser?.is_premium && <span className="stats-profile__user-badge">Premium</span>}
                    </div>
                  </div>
                </div>
                <div className="stats-profile__rank-row">
                  <div className="stats-profile__user-row">
                    <div className="stats-profile__user-rank">{selectedTitleName}</div>
                    <div className="stats-profile__user-xp">{selectedUser?.xp ?? 0} XP</div>
                  </div>
                  <div className="stats-profile__user-level">Уровень {selectedLevel}</div>
                </div>
                <div className="stats-profile__progress">
                  <div className="stats-profile__progress-fill" style={{ width: `${selectedProgressPercent}%` }}></div>
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
                  {!profileHabits.length && (
                    <div className="stats__profile-habit-category">Публичных привычек пока нет</div>
                  )}
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
        author={selectedHabit?.author || selectedUser}
        onCopied={handleHabitCopied}
      />
      <BottomNav />
    </div>
  )
}

export default Stats
