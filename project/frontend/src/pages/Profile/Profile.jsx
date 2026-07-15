import { useCallback, useEffect, useRef, useState } from 'react'
import Header from '../../components/organisms/Header/Header.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import { useTheme } from '../../contexts/useTheme.js'
import { mergeBalanceWithLiveHabits } from '../../utils/balance.js'
import { resolveAvatarUrl } from '../../utils/avatar.js'
import ENDPOINTS from '../../utils/endpoints.js'
import { request } from '../../utils/api.js'
import './Profile.scss'

const Profile = () => {
  const { user, updateProfile, login } = useAuth()
  const { bootstrap, setBootstrapData } = useAppData()
  const { isDark, toggleTheme } = useTheme()
  const liveUser = bootstrap?.user ?? user
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSettingsClosing, setIsSettingsClosing] = useState(false)
  const [shareToast, setShareToast] = useState({ visible: false, type: 'success', message: '' })
  const [isSupportOpen, setIsSupportOpen] = useState(false)
  const [settings, setSettings] = useState(null)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [balanceData, setBalanceData] = useState([])
  const [statsRange, setStatsRange] = useState('7d')
  const [statsCustom, setStatsCustom] = useState({ start: '', end: '' })
  const [statsData, setStatsData] = useState(null)
  const [statsError, setStatsError] = useState('')
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [premiumStatus, setPremiumStatus] = useState({ type: null, message: '' })
  const [isPremiumPaying, setIsPremiumPaying] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const pendingSettingsRef = useRef({})
  const settingsSnapshotRef = useRef({})
  const settingsDebounceRef = useRef(null)
  const SETTINGS_DEBOUNCE_MS = 350
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
  const totalBalance = balanceData.reduce((sum, item) => sum + item.value, 0)
  const statsRanges = [
    { id: '7d', label: '7 дней' },
    { id: 'month', label: 'Месяц' },
    { id: 'custom', label: 'Период' }
  ]
  const todayIso = new Date().toLocaleDateString('en-CA')
  const statsRows = (Array.isArray(statsData?.habits) ? statsData.habits : [])
    .map((row) => ({
      ...row,
      category: (row.category || 'Без категории').toLocaleLowerCase('ru-RU'),
    }))
    .sort((first, second) => second.count - first.count || first.title.localeCompare(second.title, 'ru'))
  const gapSize = 2
  const segmentCount = balanceData.length
  const availableAngle = 360 - gapSize * segmentCount
  let currentAngle = 0
  const balanceGradient = balanceData.length
    ? balanceData
    .map((item) => {
      const segmentAngle = totalBalance > 0
        ? (item.value / totalBalance) * availableAngle
        : 0
      const start = currentAngle
      const end = currentAngle + segmentAngle
      currentAngle = end + gapSize
      return `${item.color} ${start}deg ${end}deg, #FFFFFF ${end}deg ${end + gapSize}deg`
    })
    .join(', ')
    : '#F2F3F6 0deg 360deg'

  const handleOpenSettings = () => {
    setIsSettingsOpen(true)
  }

  const handleCloseSettings = () => {
    setIsSettingsClosing(true)
    setTimeout(() => {
      setIsSettingsClosing(false)
      setIsSettingsOpen(false)
    }, 300)
  }

  useEffect(() => {
    if (isSettingsOpen) {
      document.body.style.overflow = 'hidden'
    } else if (!isSettingsClosing) {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isSettingsOpen, isSettingsClosing])

  useEffect(() => {
    if (!liveUser) {
      setSettings(null)
      settingsSnapshotRef.current = {}
      return
    }
    const nextSettings = {
      notification_habit: liveUser.notification_habit,
      notification_streak: liveUser.notification_streak,
      notification_quests: liveUser.notification_quests,
      participation_in_ratings: liveUser.participation_in_ratings,
      balance_wheel: liveUser.balance_wheel,
    }
    setSettings(nextSettings)
    settingsSnapshotRef.current = nextSettings
  }, [liveUser])

  useEffect(() => {
    if (!liveUser) return
    const bootstrapItems = bootstrap?.balance?.items ?? []
    if (bootstrapItems.length) {
      const mapped = bootstrapItems.map((item) => ({
        label: item.label,
        value: item.value
      }))
      setBalanceData(assignUniqueColors(mapped))
    }
  }, [liveUser, bootstrap?.balance?.items])

  useEffect(() => {
    let cancelled = false
    let params = null
    if (statsRange === 'custom') {
      if (statsCustom.start && statsCustom.end) {
        if (statsCustom.start > statsCustom.end) {
          setStatsError('Начало периода позже его конца')
          return undefined
        }
        params = { start: statsCustom.start, end: statsCustom.end }
      }
    } else {
      params = { period: statsRange }
    }
    if (!params) {
      setStatsData(null)
      setStatsError('')
      return undefined
    }
    const loadStats = async () => {
      setIsStatsLoading(true)
      setStatsError('')
      try {
        const data = await request.get(ENDPOINTS.habits.stats, params)
        if (!cancelled) setStatsData(data)
      } catch (error) {
        if (!cancelled) {
          setStatsData(null)
          setStatsError(error?.response?.data?.detail || 'Не удалось загрузить статистику')
        }
      } finally {
        if (!cancelled) setIsStatsLoading(false)
      }
    }
    loadStats()
    return () => {
      cancelled = true
    }
  }, [statsRange, statsCustom.start, statsCustom.end])

  useEffect(() => {
    return () => {
      if (settingsDebounceRef.current) {
        clearTimeout(settingsDebounceRef.current)
      }
    }
  }, [])

  const buildLocalLeaderboardForParticipation = useCallback((state, enabled) => {
    const userData = state?.user
    const leaderboard = state?.leaderboard ?? { items: [], me: null }
    if (!userData?.id) return leaderboard
    const baseItems = Array.isArray(leaderboard.items) ? leaderboard.items : []
    const itemsWithoutMe = baseItems.filter((item) => String(item?.id) !== String(userData.id))

    if (!enabled) {
      return {
        ...leaderboard,
        items: itemsWithoutMe,
        me: null,
      }
    }

    const rank = itemsWithoutMe.findIndex((item) => Number(item?.xp ?? 0) < Number(userData.xp ?? 0)) + 1
    const meEntry = {
      id: userData.id,
      name: userData.first_name || userData.username || `User ${userData.id}`,
      avatar: userData.photo_url || '',
      level: Number(userData.level ?? 1),
      xp: Number(userData.xp ?? 0),
      title: userData.title || '',
      rank: rank > 0 ? rank : null,
      is_premium: Boolean(userData.is_premium),
    }
    return {
      ...leaderboard,
      items: itemsWithoutMe,
      me: meEntry,
    }
  }, [])

  const flushPendingSettings = useCallback(async () => {
    const payload = pendingSettingsRef.current
    const keys = Object.keys(payload)
    if (!keys.length) return

    pendingSettingsRef.current = {}
    setIsSettingsSaving(true)
    try {
      await updateProfile(payload)
      const freshBalance = Object.prototype.hasOwnProperty.call(payload, 'balance_wheel')
        ? await request.get(ENDPOINTS.habits.balance)
        : null
      settingsSnapshotRef.current = { ...settingsSnapshotRef.current, ...payload }
      setBootstrapData((prev) => {
        const nextUser = prev?.user ? { ...prev.user, ...payload } : prev?.user
        const usePublicOnlyBalance = Boolean(
          Object.prototype.hasOwnProperty.call(payload, 'balance_wheel')
            ? payload.balance_wheel
            : nextUser?.balance_wheel
        )
        const nextHabits = Array.isArray(prev?.habits) ? prev.habits : []
        let nextLeaderboard = prev?.leaderboard
        if (Object.prototype.hasOwnProperty.call(payload, 'participation_in_ratings')) {
          nextLeaderboard = buildLocalLeaderboardForParticipation(
            { ...prev, user: nextUser, leaderboard: prev?.leaderboard },
            Boolean(payload.participation_in_ratings)
          )
        }
        return {
          ...prev,
          user: nextUser,
          balance: freshBalance ?? mergeBalanceWithLiveHabits(prev?.balance, nextHabits, nextHabits, { publicOnly: usePublicOnlyBalance }),
          ...(nextLeaderboard ? { leaderboard: nextLeaderboard } : {}),
        }
      })
    } catch (error) {
      const snapshot = settingsSnapshotRef.current || {}
      setSettings((prev) => ({
        ...(prev || {}),
        ...keys.reduce((acc, key) => {
          acc[key] = snapshot[key]
          return acc
        }, {})
      }))
      setBootstrapData((prev) => {
        if (!prev) return prev
        const revertedUser = prev.user
          ? {
            ...prev.user,
            ...keys.reduce((acc, key) => {
              acc[key] = snapshot[key]
              return acc
            }, {})
          }
          : prev.user
        const revertedLeaderboard = keys.includes('participation_in_ratings')
          ? buildLocalLeaderboardForParticipation(
            { ...prev, user: revertedUser, leaderboard: prev.leaderboard },
            Boolean(snapshot.participation_in_ratings)
          )
          : prev.leaderboard
        const usePublicOnlyBalance = Boolean(revertedUser?.balance_wheel)
        const revertedHabits = Array.isArray(prev?.habits) ? prev.habits : []
        return {
          ...prev,
          user: revertedUser,
          leaderboard: revertedLeaderboard,
          balance: mergeBalanceWithLiveHabits(prev?.balance, revertedHabits, revertedHabits, { publicOnly: usePublicOnlyBalance }),
        }
      })
    } finally {
      setIsSettingsSaving(false)
      if (Object.keys(pendingSettingsRef.current).length) {
        settingsDebounceRef.current = setTimeout(() => {
          flushPendingSettings()
        }, SETTINGS_DEBOUNCE_MS)
      }
    }
  }, [SETTINGS_DEBOUNCE_MS, buildLocalLeaderboardForParticipation, setBootstrapData, updateProfile])

  const handlePremiumPurchase = async (product) => {
    if (!product?.id || isPremiumPaying) return
    setIsPremiumPaying(true)
    setPremiumStatus({ type: null, message: '' })

    const openExternalLink = (url) => {
      if (!url) return
      const tg = window.Telegram?.WebApp
      if (tg?.openLink) {
        tg.openLink(url)
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    const sendRequest = async () => request.post(ENDPOINTS.payments.robokassaSendMessage, { product_id: product.id })

    try {
      let result
      try {
        result = await sendRequest()
      } catch (error) {
        if (error?.response?.status === 401) {
          const reloginUser = await login()
          if (!reloginUser) throw error
          result = await sendRequest()
        } else {
          throw error
        }
      }

      if (result?.status === 'offer_required' && result?.offer_url) {
        openExternalLink(result.offer_url)
        setPremiumStatus({ type: 'success', message: 'Оферта открыта. После согласия повторите покупку.' })
      } else if (result?.status === 'payment_link' && result?.payment_url) {
        openExternalLink(result.payment_url)
        setPremiumStatus({ type: 'success', message: 'Telegram временно недоступен. Открыта прямая ссылка на оплату.' })
      } else if (result?.status === 'offer_sent') {
        setPremiumStatus({ type: 'success', message: 'Сообщение для оплаты отправлено в Telegram' })
      } else {
        setPremiumStatus({ type: 'success', message: 'Сообщение для оплаты отправлено в Telegram' })
      }
    } catch (error) {
      setPremiumStatus({
        type: 'error',
        message: error?.response?.data?.detail || 'Не удалось отправить сообщение в Telegram',
      })
    } finally {
      setIsPremiumPaying(false)
    }
  }

  const handleSettingChange = (field) => (event) => {
    const value = event.target.checked
    setSettings((prev) => ({ ...(prev || {}), [field]: value }))
    pendingSettingsRef.current = {
      ...pendingSettingsRef.current,
      [field]: value,
    }

    if (field === 'participation_in_ratings') {
      setBootstrapData((prev) => {
        if (!prev) return prev
        const nextUser = prev.user ? { ...prev.user, participation_in_ratings: value } : prev.user
        return {
          ...prev,
          user: nextUser,
          leaderboard: buildLocalLeaderboardForParticipation(
            { ...prev, user: nextUser, leaderboard: prev.leaderboard },
            value
          ),
        }
      })
    }

    if (settingsDebounceRef.current) {
      clearTimeout(settingsDebounceRef.current)
    }
    settingsDebounceRef.current = setTimeout(() => {
      flushPendingSettings()
    }, SETTINGS_DEBOUNCE_MS)
  }

  const avatarUrl = resolveAvatarUrl(liveUser?.photo_url || user?.photo_url)
  const displayName = liveUser?.first_name || liveUser?.username || 'Пользователь'
  const isPremium = Boolean(liveUser?.premium_expiration)
  const xpValue = liveUser?.xp ?? 0
  const levelValue = liveUser?.level ?? 1
  const titleItems = Array.isArray(bootstrap?.titles) ? bootstrap.titles : []
  const currentTitle = titleItems.find((title) => title.is_current) ?? null
  const rankName = currentTitle?.name || 'Новичок'
  const targetLevel = Math.max(Number(currentTitle?.level_max ?? levelValue) || levelValue, 1)
  const currentLevelForProgress = Math.min(Math.max(levelValue, 1), targetLevel)
  const levelProgressPercent = (currentLevelForProgress / targetLevel) * 100
  const premiumDate = liveUser?.premium_expiration
    ? new Date(liveUser.premium_expiration)
    : null
  const premiumDateLabel = premiumDate
    ? premiumDate.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : ''

  useEffect(() => {
    setAvatarFailed(false)
  }, [avatarUrl])
  const premiumProducts = (() => {
    const products = Array.isArray(bootstrap?.products) ? bootstrap.products : []
    return products.filter((item) => {
      if (!item?.is_premium) return false
      if (String(item.currency || '').toUpperCase() !== 'RUB') return false
      if (item?.is_active === false) return false
      return true
    })
  })()
  const yearlyPremiumProduct = premiumProducts.find((item) => {
    const duration = Number(item?.duration_days || 0)
    const name = String(item?.name || '').toLowerCase()
    return duration >= 365 || name.includes('год') || name.includes('year')
  })
  const standardPremiumProduct = premiumProducts.find((item) => item?.id !== yearlyPremiumProduct?.id)
    || yearlyPremiumProduct
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Routr_bot'

  const handleShareProfile = async () => {
    if (!liveUser?.id) return
    const rawPayload = `profile_${String(liveUser.id)}`
    const encodedPayload = btoa(unescape(encodeURIComponent(rawPayload)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    const shareLink = `https://t.me/${botUsername}?start=${encodedPayload}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = shareLink
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setShareToast({ visible: true, type: 'success', message: 'Ссылка на профиль скопирована' })
      setTimeout(() => setShareToast({ visible: false, type: 'success', message: '' }), 2200)
    } catch {
      setShareToast({ visible: true, type: 'error', message: 'Не удалось скопировать ссылку' })
      setTimeout(() => setShareToast({ visible: false, type: 'success', message: '' }), 2200)
    }
  }

  const handleOpenOnboarding = () => {
    handleCloseSettings()
    window.setTimeout(() => {
      window.dispatchEvent(new Event('routr:open-onboarding'))
    }, 320)
  }

  const handleOpenSupport = (event) => {
    event.preventDefault()
    setIsSupportOpen(true)
  }

  const handleCloseSupport = () => {
    setIsSupportOpen(false)
  }

  const handleCopySupportEmail = async () => {
    const email = 'routr_bot@mail.ru'
    try {
      await navigator.clipboard.writeText(email)
      setShareToast({ visible: true, type: 'success', message: 'Адрес скопирован' })
    } catch (error) {
      setShareToast({ visible: true, type: 'error', message: 'Не удалось скопировать адрес' })
    }
    setTimeout(() => setShareToast({ visible: false, type: 'success', message: '' }), 2200)
  }


  return (
    <div className={`profile ${isSettingsOpen || isSettingsClosing ? 'profile--modal-open' : ''}`}>
      <div className="profile__content">
        <div className="profile__top">
          <h2 className="profile__title">Ваш профиль</h2>
          <div className="profile__actions">
            <button
              className="profile__icon-button"
              type="button"
              aria-label="Настройки"
              onClick={handleOpenSettings}
            >
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M21.0409 14.3701C20.8484 14.0701 20.575 13.7701 20.2205 13.5801C19.9369 13.4401 19.7546 13.2101 19.5925 12.9401C19.076 12.0801 19.3798 10.9501 20.2407 10.4401C21.2536 9.87011 21.5777 8.60011 20.9902 7.61011L20.3116 6.43011C19.7343 5.44011 18.4682 5.09011 17.4655 5.67011C16.5742 6.15011 15.4297 5.83011 14.9131 4.98011C14.7511 4.70011 14.6599 4.40011 14.6802 4.10011C14.7106 3.71011 14.589 3.34011 14.4067 3.04011C14.032 2.42011 13.3534 2.00011 12.6038 2.00011H11.1757C10.4363 2.02011 9.75773 2.42011 9.38298 3.04011C9.19053 3.34011 9.07912 3.71011 9.09938 4.10011C9.11964 4.40011 9.02848 4.70011 8.86642 4.98011C8.34987 5.83011 7.20535 6.15011 6.32417 5.67011C5.31132 5.09011 4.05538 5.44011 3.46793 6.43011L2.78932 7.61011C2.21199 8.60011 2.53611 9.87011 3.53883 10.4401C4.39975 10.9501 4.70361 12.0801 4.19718 12.9401C4.025 13.2101 3.84268 13.4401 3.55908 13.5801C3.21472 13.7701 2.91086 14.0701 2.7488 14.3701C2.37405 14.9901 2.39431 15.7701 2.76906 16.4201L3.46793 17.6201C3.84268 18.2601 4.54155 18.6601 5.2708 18.6601C5.61517 18.6601 6.02031 18.5601 6.34442 18.3601C6.59764 18.1901 6.90149 18.1301 7.23573 18.1301C8.23846 18.1301 9.07912 18.9601 9.09938 19.9501C9.09938 21.1001 10.0312 22.0001 11.2061 22.0001H12.5836C13.7484 22.0001 14.6802 21.1001 14.6802 19.9501C14.7106 18.9601 15.5512 18.1301 16.554 18.1301C16.8781 18.1301 17.1819 18.1901 17.4453 18.3601C17.7694 18.5601 18.1644 18.6601 18.5189 18.6601C19.238 18.6601 19.9369 18.2601 20.3116 17.6201L21.0206 16.4201C21.3853 15.7501 21.4156 14.9901 21.0409 14.3701" fill="#CDCDD0"/>
<path fillRule="evenodd" clipRule="evenodd" d="M11.9049 14.8301C10.3148 14.8301 9.02844 13.5801 9.02844 12.0101C9.02844 10.4401 10.3148 9.1801 11.9049 9.1801C13.4951 9.1801 14.751 10.4401 14.751 12.0101C14.751 13.5801 13.4951 14.8301 11.9049 14.8301" fill="#040415"/>
</svg>

            </button>
            <button className="profile__icon-button" type="button" aria-label="Поделиться" onClick={handleShareProfile}>
<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3 9V15C3 15.3978 3.15804 15.7794 3.43934 16.0607C3.72064 16.342 4.10218 16.5 4.5 16.5H13.5C13.8978 16.5 14.2794 16.342 14.5607 16.0607C14.842 15.7794 15 15.3978 15 15V9M12 4.5L9 1.5M9 1.5L6 4.5M9 1.5V11.25" stroke="#1E1E1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
</svg>

            </button>
          </div>
        </div>

        <section className="profile__card">
          <div className="profile__card-header">
            <div className="profile__card-main">
              <div
                className="profile__avatar"
              >
                {avatarUrl && !avatarFailed ? (
                  <img
                    className="profile__avatar-img"
                    src={avatarUrl}
                    alt={displayName}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <span className="profile__avatar-placeholder">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="profile__user-meta">
                <div className="profile__user-name">{displayName}</div>
                {isPremium && <span className="profile__user-badge">Premium</span>}
              </div>
            </div>
          </div>
          <div className="profile__rank-row">
            <div className="profile__user-row">
              <div className="profile__user-rank">{rankName}</div>
              <div className="profile__user-xp">{xpValue}XP</div>
            </div>
            <div className="profile__user-level">Уровень {levelValue}</div>
          </div>
          <div className="profile__progress">
            <div className="profile__progress-fill" style={{ width: `${levelProgressPercent}%` }}></div>
          </div>
        </section>

        <section className="profile__section">
          <div className="profile__section-title">Колесо Баланса</div>
          <div className="profile__balance">
            <div className="profile__chart">
              <div
                className="profile__chart-ring"
                style={{ background: `conic-gradient(${balanceGradient})` }}
              ></div>
              <div className="profile__chart-center">
                <div className="profile__chart-label">Общий балл</div>
                <div className="profile__chart-score">{totalBalance}</div>
              </div>
            </div>
            <div className="profile__legend">
              {balanceData.map((item) => (
                <div key={item.label} className="profile__legend-item">
                  <span className="profile__legend-dot" style={{ background: item.color }}></span>
                  <span className="profile__legend-label">{item.label}</span>
                  <span className="profile__legend-value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="profile__section">
          <div className="profile__section-title">Статистика</div>
          <div className="profile__stats">
            <div className="profile__stats-tabs">
              {statsRanges.map((range) => (
                <button
                  key={range.id}
                  className={`profile__stats-tab ${statsRange === range.id ? 'profile__stats-tab--active' : ''}`}
                  type="button"
                  onClick={() => setStatsRange(range.id)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            {statsRange === 'custom' && (
              <div className="profile__stats-period">
                <input
                  className="profile__stats-date"
                  type="date"
                  value={statsCustom.start}
                  max={statsCustom.end || todayIso}
                  onChange={(event) => setStatsCustom((prev) => ({ ...prev, start: event.target.value }))}
                />
                <span className="profile__stats-period-divider">—</span>
                <input
                  className="profile__stats-date"
                  type="date"
                  value={statsCustom.end}
                  max={todayIso}
                  onChange={(event) => setStatsCustom((prev) => ({ ...prev, end: event.target.value }))}
                />
              </div>
            )}
            {statsError && <div className="profile__stats-error">{statsError}</div>}
            {statsRange === 'custom' && !statsError && (!statsCustom.start || !statsCustom.end) && (
              <div className="profile__stats-hint">Выберите начало и конец периода</div>
            )}
            {statsData && (
              <>
                <div className="profile__stats-total">
                  <span className="profile__stats-total-label">Общий балл за период</span>
                  <span className="profile__stats-total-value">{statsData.total}</span>
                </div>
                <div className="profile__balance-habits">
                  {statsRows.map((row) => (
                    <div className="profile__balance-habit" key={`${row.id}-${row.title}`}>
                      <span className="profile__balance-habit-name">
                        {row.title} <span>({row.category})</span>
                        {!row.is_current_title && <span className="profile__stats-chip">ранее</span>}
                        {row.is_archived && <span className="profile__stats-chip profile__stats-chip--archived">архив</span>}
                      </span>
                      <span className="profile__balance-habit-count">{row.count}</span>
                    </div>
                  ))}
                  {!statsRows.length && !isStatsLoading && (
                    <div className="profile__stats-hint">За выбранный период данных нет</div>
                  )}
                </div>
              </>
            )}
            {isStatsLoading && !statsData && <div className="profile__stats-hint">Загрузка…</div>}
          </div>
        </section>

        <section className="profile__section">
          <div className="profile__section-title">Подписка Premium</div>
          <div className="profile__premium">
            {isPremium ? (
              <div className="profile__premium-title">
                Ура! Подписка активна до {premiumDateLabel} 🎉
              </div>
            ) : (
              <div className="profile__premium-title">
                Больше возможностей с Premium-подпиской 🔥
              </div>
            )}
            <div className="profile__premium-list">
              {[
                { text: 'Напоминания на привычку: ', highlight: '1 → 5' },
                { text: 'История и статистика за 30 дней ', highlight: '→ 365' },
                { text: 'Привычек: ', highlight: '3 → 50' },
                { text: 'Множитель XP: ', highlight: '×1 → ×1.3' },
                { text: 'Доступ к должностям: ', highlight: 'Наставник' }
              ].map((item) => (
                <div key={item.text} className="profile__premium-item">
                  <span className="profile__premium-check">✓</span>
                  <span>
                    {item.text}
                    <strong>{item.highlight}</strong>
                  </span>
                </div>
              ))}
            </div>
            <div className="profile__premium-actions">
              <button
                className="profile__premium-cta"
                type="button"
                onClick={() => handlePremiumPurchase(standardPremiumProduct)}
                disabled={isPremiumPaying || !standardPremiumProduct}
              >
                {isPremiumPaying
                  ? 'Отправляем...'
                  : standardPremiumProduct
                    ? `Покупка на 30 дней`
                    : 'Подписаться'}
              </button>
              {yearlyPremiumProduct && yearlyPremiumProduct.id !== standardPremiumProduct?.id && (
                <button
                  className="profile__premium-cta profile__premium-cta--secondary"
                  type="button"
                  onClick={() => handlePremiumPurchase(yearlyPremiumProduct)}
                  disabled={isPremiumPaying}
                >
                  {isPremiumPaying
                    ? 'Отправляем...'
                    : `Покупка на 365 дней`}
                </button>
              )}
            </div>
            {premiumStatus.message && (
              <div className={`profile__toast profile__toast--${premiumStatus.type || 'info'}`} style={{ marginTop: 12 }}>
                {premiumStatus.message}
              </div>
            )}

          </div>
        </section>

      </div>
      {(isSettingsOpen || isSettingsClosing) && (
        <div
          className={`profile__settings-overlay ${isSettingsClosing ? 'profile__settings-overlay--closing' : ''}`}
          onClick={handleCloseSettings}
        >
          <div
            className={`profile__settings-modal ${isSettingsClosing ? 'profile__settings-modal--closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="profile__settings-scroll">
              <div className="profile__settings-header">
                <button
                  className="profile__settings-back"
                  type="button"
                  aria-label="Назад"
                  onClick={handleCloseSettings}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18L9 12L15 6" stroke="#0F1F35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <h2 className="profile__settings-title">Настройки</h2>

              </div>

              <section className="profile__settings-section">
                <div className="profile__settings-section-title">Уведомления</div>
                <div className="profile__settings-card">
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M13.884 19.2284C13.3885 19.1216 10.3695 19.1216 9.87401 19.2284C9.45046 19.3271 8.99243 19.5567 8.99243 20.0602C9.01706 20.5406 9.29581 20.9647 9.68194 21.2336L9.68095 21.2346C10.1803 21.6273 10.7664 21.8771 11.3801 21.9668C11.7071 22.0121 12.04 22.0101 12.3789 21.9668C12.9916 21.8771 13.5776 21.6273 14.077 21.2346L14.076 21.2336C14.4622 20.9647 14.7409 20.5406 14.7655 20.0602C14.7655 19.5567 14.3075 19.3271 13.884 19.2284Z" fill="#CDCDD0"/>
<path fillRule="evenodd" clipRule="evenodd" d="M19.5933 11.6453C18.8693 10.7923 18.5403 10.0531 18.5403 8.79716V8.37013C18.5403 6.73354 18.167 5.67907 17.3554 4.62459C16.1044 2.98699 13.9985 2 11.9368 2H11.8492C9.8309 2 7.79095 2.94167 6.51833 4.5128C5.66236 5.58842 5.2457 6.68822 5.2457 8.37013V8.79716C5.2457 10.0531 4.93838 10.7923 4.19273 11.6453C3.64408 12.2738 3.46875 13.0815 3.46875 13.9557C3.46875 14.8309 3.75342 15.6598 4.32472 16.3336C5.07037 17.1413 6.12334 17.6569 7.19896 17.7466C8.75626 17.9258 10.3136 17.9933 11.8935 17.9933C13.4725 17.9933 15.0298 17.8805 16.588 17.7466C17.6627 17.6569 18.7156 17.1413 19.4613 16.3336C20.0316 15.6598 20.3173 14.8309 20.3173 13.9557C20.3173 13.0815 20.1419 12.2738 19.5933 11.6453Z" fill="#040415"/>
</svg>

                    </div>
                    <div className="profile__settings-text">Напоминания о привычках</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={settings?.notification_habit ?? false}
                        onChange={handleSettingChange('notification_habit')}
                        disabled={!settings || isSettingsSaving}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                  <div className="profile__settings-divider"></div>
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M13.884 19.2284C13.3885 19.1216 10.3695 19.1216 9.87401 19.2284C9.45046 19.3271 8.99243 19.5567 8.99243 20.0602C9.01706 20.5406 9.29581 20.9647 9.68194 21.2336L9.68095 21.2346C10.1803 21.6273 10.7664 21.8771 11.3801 21.9668C11.7071 22.0121 12.04 22.0101 12.3789 21.9668C12.9916 21.8771 13.5776 21.6273 14.077 21.2346L14.076 21.2336C14.4622 20.9647 14.7409 20.5406 14.7655 20.0602C14.7655 19.5567 14.3075 19.3271 13.884 19.2284Z" fill="#CDCDD0"/>
<path fillRule="evenodd" clipRule="evenodd" d="M19.5933 11.6453C18.8693 10.7923 18.5403 10.0531 18.5403 8.79716V8.37013C18.5403 6.73354 18.167 5.67907 17.3554 4.62459C16.1044 2.98699 13.9985 2 11.9368 2H11.8492C9.8309 2 7.79095 2.94167 6.51833 4.5128C5.66236 5.58842 5.2457 6.68822 5.2457 8.37013V8.79716C5.2457 10.0531 4.93838 10.7923 4.19273 11.6453C3.64408 12.2738 3.46875 13.0815 3.46875 13.9557C3.46875 14.8309 3.75342 15.6598 4.32472 16.3336C5.07037 17.1413 6.12334 17.6569 7.19896 17.7466C8.75626 17.9258 10.3136 17.9933 11.8935 17.9933C13.4725 17.9933 15.0298 17.8805 16.588 17.7466C17.6627 17.6569 18.7156 17.1413 19.4613 16.3336C20.0316 15.6598 20.3173 14.8309 20.3173 13.9557C20.3173 13.0815 20.1419 12.2738 19.5933 11.6453Z" fill="#040415"/>
</svg>

                    </div>
                    <div className="profile__settings-text">Уведомления о Streak</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={settings?.notification_streak ?? false}
                        onChange={handleSettingChange('notification_streak')}
                        disabled={!settings || isSettingsSaving}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                  <div className="profile__settings-divider"></div>
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M13.884 19.2284C13.3885 19.1216 10.3695 19.1216 9.87401 19.2284C9.45046 19.3271 8.99243 19.5567 8.99243 20.0602C9.01706 20.5406 9.29581 20.9647 9.68194 21.2336L9.68095 21.2346C10.1803 21.6273 10.7664 21.8771 11.3801 21.9668C11.7071 22.0121 12.04 22.0101 12.3789 21.9668C12.9916 21.8771 13.5776 21.6273 14.077 21.2346L14.076 21.2336C14.4622 20.9647 14.7409 20.5406 14.7655 20.0602C14.7655 19.5567 14.3075 19.3271 13.884 19.2284Z" fill="#CDCDD0"/>
<path fillRule="evenodd" clipRule="evenodd" d="M19.5933 11.6453C18.8693 10.7923 18.5403 10.0531 18.5403 8.79716V8.37013C18.5403 6.73354 18.167 5.67907 17.3554 4.62459C16.1044 2.98699 13.9985 2 11.9368 2H11.8492C9.8309 2 7.79095 2.94167 6.51833 4.5128C5.66236 5.58842 5.2457 6.68822 5.2457 8.37013V8.79716C5.2457 10.0531 4.93838 10.7923 4.19273 11.6453C3.64408 12.2738 3.46875 13.0815 3.46875 13.9557C3.46875 14.8309 3.75342 15.6598 4.32472 16.3336C5.07037 17.1413 6.12334 17.6569 7.19896 17.7466C8.75626 17.9258 10.3136 17.9933 11.8935 17.9933C13.4725 17.9933 15.0298 17.8805 16.588 17.7466C17.6627 17.6569 18.7156 17.1413 19.4613 16.3336C20.0316 15.6598 20.3173 14.8309 20.3173 13.9557C20.3173 13.0815 20.1419 12.2738 19.5933 11.6453Z" fill="#040415"/>
</svg>

                    </div>
                    <div className="profile__settings-text">Уведомления о квестах и уровнях</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={settings?.notification_quests ?? false}
                        onChange={handleSettingChange('notification_quests')}
                        disabled={!settings || isSettingsSaving}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                </div>
              </section>

              <section className="profile__settings-section">
                <div className="profile__settings-section-title">Внешний вид</div>
                <div className="profile__settings-card">
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z" fill="#040415"/>
                      </svg>
                    </div>
                    <div className="profile__settings-text">Тёмная тема</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={isDark}
                        onChange={toggleTheme}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                </div>
              </section>

              <section className="profile__settings-section">
                <div className="profile__settings-section-title">Приватность профиля</div>
                <div className="profile__settings-card">
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M12.8607 3.11361L15.0673 7.58789C15.2299 7.91205 15.5402 8.13717 15.898 8.18719L20.8545 8.91556C21.144 8.95658 21.4067 9.11066 21.5841 9.34578C21.7596 9.5779 21.8349 9.87205 21.7923 10.1612C21.7576 10.4013 21.6456 10.6234 21.4741 10.7935L17.8826 14.3063C17.6199 14.5514 17.501 14.9146 17.5644 15.2698L18.4486 20.2083C18.5428 20.8046 18.1512 21.3669 17.5644 21.48C17.3225 21.519 17.0747 21.478 16.8566 21.3659L12.4354 19.0417C12.1073 18.8746 11.7197 18.8746 11.3916 19.0417L6.97035 21.3659C6.42712 21.657 5.75403 21.4589 5.45168 20.9187C5.33966 20.7036 5.30001 20.4584 5.33669 20.2193L6.22093 15.2798C6.28437 14.9256 6.16443 14.5604 5.90272 14.3153L2.31124 10.8045C1.88398 10.3883 1.8711 9.70296 2.28249 9.27175C2.29141 9.26274 2.30132 9.25274 2.31124 9.24273C2.48174 9.06764 2.70577 8.95658 2.94765 8.92757L7.90416 8.1982C8.26103 8.14717 8.57131 7.92406 8.73487 7.59789L10.8622 3.11361C11.0515 2.72942 11.4441 2.4903 11.8704 2.5003H12.0032C12.3729 2.54533 12.6951 2.77644 12.8607 3.11361Z" fill="#040415"/>
</svg>

                    </div>
                    <div className="profile__settings-text">Участие в рейтингах</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={settings?.participation_in_ratings ?? false}
                        onChange={handleSettingChange('participation_in_ratings')}
                        disabled={!settings || isSettingsSaving}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                  <div className="profile__settings-divider"></div>
                  <div className="profile__settings-row">
                    <div className="profile__settings-icon">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.4609 6.24121C20.8856 7.88556 21.75 10.0286 21.75 12.375C21.75 17.5527 17.5527 21.75 12.375 21.75C10.0286 21.75 7.88556 20.8856 6.24121 19.4609L19.4609 6.24121ZM12.375 3C14.6659 3 16.7642 3.82269 18.3926 5.1875L5.18848 18.3926C3.82343 16.7641 3 14.6662 3 12.375C3 7.19733 7.19733 3 12.375 3Z" fill="black"/>
</svg>

                    </div>
                    <div className="profile__settings-text">Показывать только публичные привычки в Колесе Баланса</div>
                    <label className="profile__toggle">
                      <input
                        type="checkbox"
                        checked={settings?.balance_wheel ?? false}
                        onChange={handleSettingChange('balance_wheel')}
                        disabled={!settings || isSettingsSaving}
                      />
                      <span className="profile__toggle-slider" aria-hidden="true"></span>
                    </label>
                  </div>
                </div>
              </section>

              <section className="profile__settings-section">
                <div className="profile__settings-section-title">Прочее</div>
                <div className="profile__settings-card">
                  <button className="profile__settings-link" type="button" onClick={handleOpenOnboarding}>
                    <span className="profile__settings-icon profile__settings-icon--muted">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.486 2 2 6.262 2 11.5C2 15.341 4.354 18.63 7.73 20.05L7.7 22L10.392 20.706C10.914 20.829 11.454 20.9 12 20.9C17.514 20.9 22 16.638 22 11.4C22 6.162 17.514 2 12 2Z" fill="#CDCDD0"/>
                        <path d="M12 6.5C10.43 6.5 9.167 7.64 9.167 9.07C9.167 9.53 9.544 9.9 10.01 9.9C10.476 9.9 10.853 9.53 10.853 9.07C10.853 8.56 11.36 8.13 12 8.13C12.64 8.13 13.147 8.56 13.147 9.07C13.147 9.51 12.874 9.81 12.25 10.21C11.53 10.67 11.167 11.12 11.167 11.85V12.05C11.167 12.52 11.544 12.89 12.01 12.89C12.476 12.89 12.853 12.52 12.853 12.05V11.97C12.853 11.58 12.997 11.38 13.446 11.09C14.256 10.57 14.833 10.03 14.833 9.07C14.833 7.64 13.57 6.5 12 6.5Z" fill="#040415"/>
                        <path d="M12 15.2C11.49 15.2 11.07 15.6 11.07 16.1C11.07 16.6 11.49 17 12 17C12.51 17 12.93 16.6 12.93 16.1C12.93 15.6 12.51 15.2 12 15.2Z" fill="#040415"/>
                      </svg>
                    </span>
                    <span className="profile__settings-text">Запустить инструкцию</span>
                    <span className="profile__settings-arrow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6L15 12L9 18" stroke="#8B93A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>
                  <div className="profile__settings-divider"></div>
                  <a
                    className="profile__settings-link"
                    href="https://telegra.ph/PUBLICHNAYA-OFERTA-02-25-8"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="profile__settings-icon profile__settings-icon--muted">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fillRule="evenodd" clipRule="evenodd" d="M16.1944 1.99982H7.60165C4.24186 1.99982 1.98218 4.37982 1.98218 7.91982V16.0898C1.98218 19.6198 4.24186 21.9998 7.60165 21.9998H16.1944C19.5542 21.9998 21.804 19.6198 21.804 16.0898V7.91982C21.804 4.37982 19.5542 1.99982 16.1944 1.99982Z" fill="#CDCDD0"/>
<path d="M11.8877 10.4871C12.3654 10.4871 12.7549 10.8801 12.7549 11.3621V15.782C12.7549 16.264 12.3654 16.657 11.8877 16.657C11.41 16.657 11.0205 16.264 11.0205 15.782V11.3621C11.0205 10.8801 11.41 10.4871 11.8877 10.4871ZM11.8975 7.31427C12.3762 7.31427 12.7646 7.70727 12.7646 8.18927C12.7646 8.67127 12.3763 9.06427 11.8877 9.06427C11.413 9.06424 11.0254 8.67125 11.0254 8.18927C11.0254 7.70734 11.4169 7.31438 11.8975 7.31427Z" fill="#040415"/>
</svg>

                    </span>
                    <span className="profile__settings-text">Политика конфиденциальности</span>
                    <span className="profile__settings-arrow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6L15 12L9 18" stroke="#8B93A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </a>
                  <div className="profile__settings-divider"></div>
                  <button className="profile__settings-link" type="button" onClick={handleOpenSupport}>
                    <span className="profile__settings-icon profile__settings-icon--muted">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.97339 17.2747V9.4C2.97339 7.15979 2.97339 6.03969 3.40548 5.18404C3.78555 4.43139 4.39202 3.81947 5.13796 3.43597C5.98599 3 7.09611 3 9.31636 3H14.47C16.6903 3 17.8004 3 18.6484 3.43597C19.3944 3.81947 20.0008 4.43139 20.3809 5.18404C20.813 6.03969 20.813 7.15979 20.813 9.4V10.6C20.813 12.8402 20.813 13.9603 20.3809 14.816C20.0008 15.5686 19.3944 16.1805 18.6484 16.564C17.8004 17 16.6903 17 14.47 17H10.267C9.77021 17 9.52183 17 9.28876 17.0578C9.08214 17.109 8.88505 17.1935 8.70505 17.3079C8.502 17.4371 8.32954 17.6174 7.98462 17.9781L7.06377 18.9411C5.7852 20.2782 5.14592 20.9468 4.59522 20.9975C4.11758 21.0415 3.64823 20.8503 3.33478 20.484C2.97339 20.0617 2.97339 19.1327 2.97339 17.2747Z" fill="#CDCDD0"/>
<path d="M7.92883 11C8.4762 11 8.91992 10.5523 8.91992 10C8.91992 9.44772 8.4762 9 7.92883 9C7.38147 9 6.93774 9.44772 6.93774 10C6.93774 10.5523 7.38147 11 7.92883 11Z" fill="#040415"/>
<path d="M12.8843 10C12.8843 10.5523 12.4406 11 11.8932 11C11.3458 11 10.9021 10.5523 10.9021 10C10.9021 9.44772 11.3458 9 11.8932 9C12.4406 9 12.8843 9.44772 12.8843 10Z" fill="#040415"/>
<path d="M16.8486 10C16.8486 10.5523 16.4049 11 15.8575 11C15.3102 11 14.8665 10.5523 14.8665 10C14.8665 9.44772 15.3102 9 15.8575 9C16.4049 9 16.8486 9.44772 16.8486 10Z" fill="#040415"/>
</svg>

                    </span>
                    <span className="profile__settings-text">Написать в поддержку</span>
                    <span className="profile__settings-arrow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6L15 12L9 18" stroke="#8B93A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {isSupportOpen && (
        <div className="profile__support-overlay" onClick={handleCloseSupport}>
          <div className="profile__support-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile__support-title">Напишите нам на почту</div>
            <div className="profile__support-email">routr_bot@mail.ru</div>
            <button className="profile__support-copy" type="button" onClick={handleCopySupportEmail}>
              Скопировать адрес
            </button>
            <button className="profile__support-close" type="button" onClick={handleCloseSupport}>
              Закрыть
            </button>
          </div>
        </div>
      )}
      {shareToast.visible && (
        <div className={`profile__toast profile__toast--${shareToast.type}`}>
          {shareToast.message}
        </div>
      )}
      <BottomNav />
    </div>
  )
}

export default Profile
