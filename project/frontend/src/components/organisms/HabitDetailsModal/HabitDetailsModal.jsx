import { useEffect, useState } from 'react'
import placeholderAvatar from '../../../assets/placeholder.png'
import ENDPOINTS from '../../../utils/endpoints.js'
import { request } from '../../../utils/api.js'
import './HabitDetailsModal.scss'

const HabitDetailsModal = ({ isOpen, onClose, onEdit, habit, habits, statsDays = 30, currentUserId = null }) => {
  const [isClosing, setIsClosing] = useState(false)
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [participants, setParticipants] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedParticipantHabit, setSelectedParticipantHabit] = useState(null)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState({ type: null, message: '' })
  const [isShareCopying, setIsShareCopying] = useState(false)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const sourceHabitId = habit?.sourceHabitId ?? habit?.source_habit_id ?? null
  const mapHabitFromApi = (item) => ({
    id: item?.id,
    title: item?.title || '',
    category: item?.category?.name ?? item?.category ?? '',
    icon: item?.icon,
    step: item?.goal,
    goal: item?.goal,
    repeatDays: item?.repeat_days ?? [],
    completedDates: item?.completed_dates ?? [],
    completions: item?.completions ?? [],
    totalCompletions: item?.total_completions ?? 0,
    currentStreak: item?.current_streak ?? 0,
    bestStreak: item?.best_streak ?? 0,
    visibility: item?.visibility,
    sourceHabitId: item?.source_habit_id ?? null
  })

  const formatDateValue = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, 300)
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else if (!isClosing) {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, isClosing])

  useEffect(() => {
    if (isOpen) {
      setCalendarDate(new Date())
      setIsUserDropdownOpen(false)
      setParticipants([])
      setSelectedUserId(null)
      setSelectedParticipantHabit(null)
      setIsShareOpen(false)
      setShareStatus({ type: null, message: '' })
      setIsShareCopying(false)
      const now = new Date()
      const limitStart = new Date(now)
      limitStart.setDate(now.getDate() - Math.max((statsDays || 30) - 1, 0))
      const initialStart = formatDateValue(limitStart)
      const initialEnd = formatDateValue(now)
      setRangeStart(initialStart)
      setRangeEnd(initialEnd)
    }
  }, [isOpen, statsDays])

  useEffect(() => {
    if (!isOpen) return
    const today = new Date()
    const limitStart = new Date()
    limitStart.setDate(today.getDate() - Math.max((statsDays || 30) - 1, 0))
    const todayValue = formatDateValue(today)
    const limitStartValue = formatDateValue(limitStart)
    if (rangeEnd && rangeEnd > todayValue) {
      setRangeEnd(todayValue)
    }
    if (rangeStart && rangeStart < limitStartValue) {
      setRangeStart(limitStartValue)
    }
  }, [isOpen, statsDays, rangeStart, rangeEnd])

  useEffect(() => {
    if (!isOpen || !habit?.id) {
      setParticipants([])
      setSelectedUserId(null)
      return
    }
    let cancelled = false
    const loadParticipants = async () => {
      try {
        const response = await request.get(ENDPOINTS.habits.participants(habit.id))
        if (cancelled) return
        const items = Array.isArray(response?.items) ? response.items : []
        setParticipants(items)
        const defaultParticipant = items.find((item) => item.id === currentUserId) ?? items[0] ?? null
        setSelectedUserId(defaultParticipant?.id ?? null)
      } catch (error) {
        if (cancelled) return
        setParticipants([])
        setSelectedUserId(null)
      }
    }
    loadParticipants()
    return () => {
      cancelled = true
    }
  }, [isOpen, habit?.id, sourceHabitId, currentUserId])

  useEffect(() => {
    if (!isOpen || !habit?.id || !selectedUserId) {
      setSelectedParticipantHabit(null)
      return
    }
    let cancelled = false
    const loadParticipantStats = async () => {
      try {
        const response = await request.get(ENDPOINTS.habits.participantStats(habit.id), { user_id: selectedUserId })
        if (cancelled) return
        setSelectedParticipantHabit(mapHabitFromApi(response))
      } catch (error) {
        if (cancelled) return
        setSelectedParticipantHabit(null)
      }
    }
    loadParticipantStats()
    return () => {
      cancelled = true
    }
  }, [isOpen, habit?.id, selectedUserId])

  if (!isOpen && !isClosing) return null

  const habitTitle = habit?.title || 'Привычка'
  const habitCategory = habit?.category || 'Категория'
  const habitIcon = habit?.icon || '✅'
  const metricsHabit = selectedParticipantHabit || habit
  const habitGoal = metricsHabit?.step ?? metricsHabit?.goal ?? 1
  const habitRepeatDays = habit?.repeatDays?.length
    ? habit.repeatDays.join(', ')
    : 'Каждый день'
  const handleEdit = () => {
    if (onEdit) {
      onEdit(habit)
    }
    handleClose()
  }

  const weekDays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь'
  ]

  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth()
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay()
  const leadingEmptyDays = (firstDayOfMonth + 6) % 7
  const calendarDays = Array.from(
    { length: leadingEmptyDays + daysInMonth },
    (_, index) => {
      if (index < leadingEmptyDays) return null
      return index - leadingEmptyDays + 1
    }
  )

  const handlePrevMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const users = participants
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null
  const selectedUserName = selectedUser?.name || 'Вы'
  const selectedUserAvatar = selectedUser?.avatar || placeholderAvatar

  const handleUserToggle = () => {
    setIsUserDropdownOpen((prev) => !prev)
  }

  const handleUserSelect = (user) => {
    setSelectedUserId(user.id)
    setIsUserDropdownOpen(false)
  }

  const handleShareOpen = () => {
    setShareStatus({ type: null, message: '' })
    setIsShareOpen(true)
  }

  const handleShareClose = () => {
    setIsShareOpen(false)
  }

  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const encodePayload = (rawPayload) => (
    btoa(unescape(encodeURIComponent(rawPayload)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  )

  const handleShareCopyLink = async () => {
    if (!habit?.id || isShareCopying) return

    setIsShareCopying(true)
    setShareStatus({ type: null, message: '' })
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'testproject3_bot'
    const rawPayload = `habit_${String(habit.id)}`
    const shareLink = `https://t.me/${botUsername}?start=${encodePayload(rawPayload)}`

    try {
      await request.post(ENDPOINTS.habits.share(habit.id))
      await copyToClipboard(shareLink)
      setShareStatus({ type: 'success', message: 'Ссылка на привычку скопирована' })
    } catch {
      setShareStatus({ type: 'error', message: 'Не удалось скопировать ссылку' })
    } finally {
      setIsShareCopying(false)
    }
  }

  const categoryColors = {
    Здоровье: '#1BB6A7',
    Работа: '#3C7CFF',
    Обучение: '#6C63FF',
    Отношения: '#F24E9B',
    Финансы: '#F59E0B',
    'Личностный рост': '#FACC15',
    Образование: '#6C63FF'
  }

  const parseDateValue = (value) => {
    if (!value) return null
    const [year, month, day] = value.split('-').map(Number)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }

  const rangeStartDate = parseDateValue(rangeStart)
  const rangeEndDate = parseDateValue(rangeEnd)
  const hasValidRange =
    Boolean(rangeStartDate && rangeEndDate) && rangeStartDate <= rangeEndDate

  const statsMinDate = formatDateValue(
    new Date(new Date().setDate(new Date().getDate() - Math.max((statsDays || 30) - 1, 0)))
  )
  const statsMaxDate = formatDateValue(new Date())

  const countCompletionsInRange = (dateValues, completionItems) => {
    if (!hasValidRange) return 0
    if (Array.isArray(completionItems) && completionItems.length > 0) {
      return completionItems.reduce((sum, item) => {
        const date = parseDateValue(item.date)
        if (!date || date < rangeStartDate || date > rangeEndDate) return sum
        return sum + (item.count || 0)
      }, 0)
    }
    if (!Array.isArray(dateValues) || dateValues.length === 0) return 0
    return dateValues.filter((dateValue) => {
      const date = parseDateValue(dateValue)
      if (!date) return false
      return date >= rangeStartDate && date <= rangeEndDate
    }).length
  }

  const countCompletedDaysInRange = (goal, completionItems, dateValues) => {
    if (!hasValidRange) return 0
    const targetGoal = Math.max(goal || 1, 1)
    if (Array.isArray(completionItems) && completionItems.length > 0) {
      return completionItems.filter((item) => {
        const date = parseDateValue(item.date)
        if (!date || date < rangeStartDate || date > rangeEndDate) return false
        return (item.count || 0) >= targetGoal
      }).length
    }
    if (Array.isArray(dateValues) && dateValues.length > 0) {
      return dateValues.filter((dateValue) => {
        const date = parseDateValue(dateValue)
        if (!date) return false
        return date >= rangeStartDate && date <= rangeEndDate
      }).length
    }
    return 0
  }

  const completedCalendarDates = (() => {
    if (!metricsHabit) return new Set()
    const targetGoal = Math.max(metricsHabit.goal ?? metricsHabit.step ?? 1, 1)
    const items = metricsHabit.completions ?? []
    if (!items.length) {
      return new Set(metricsHabit.completedDates ?? [])
    }
    return new Set(items.filter((item) => (item.count || 0) >= targetGoal).map((item) => item.date))
  })()
  const todayValue = formatDateValue(new Date())

  const totalCompletionsCount = metricsHabit?.totalCompletions ?? 0
  const currentStreak = metricsHabit?.currentStreak ?? 0
  const bestStreak = metricsHabit?.bestStreak ?? 0

  const periodStats = metricsHabit ? [{
    id: metricsHabit.id ?? metricsHabit.title,
    title: metricsHabit.title || 'Привычка',
    category: metricsHabit.category,
    count: countCompletionsInRange(metricsHabit.completedDates, metricsHabit.completions),
    days: countCompletedDaysInRange(
      metricsHabit.goal ?? metricsHabit.step ?? 1,
      metricsHabit.completions,
      metricsHabit.completedDates
    )
  }] : []
  const periodTotal = periodStats.reduce((sum, item) => sum + item.count, 0)

  return (
    <div
      className={`habit-details-overlay ${isClosing ? 'habit-details-overlay--closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`habit-details-modal ${isClosing ? 'habit-details-modal--closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="habit-details-modal__scroll">
          <div className="habit-details-modal__header">
            <button
              className="habit-details-modal__icon-button"
              type="button"
              aria-label="Назад"
              onClick={handleClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#0F1F35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h2 className="habit-details-modal__title">Данные о привычке</h2>
            <button
              className="habit-details-modal__icon-button"
              type="button"
              aria-label="Поделиться"
              onClick={handleShareOpen}
            >
<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3 9V15C3 15.3978 3.15804 15.7794 3.43934 16.0607C3.72064 16.342 4.10218 16.5 4.5 16.5H13.5C13.8978 16.5 14.2794 16.342 14.5607 16.0607C14.842 15.7794 15 15.3978 15 15V9M12 4.5L9 1.5M9 1.5L6 4.5M9 1.5V11.25" stroke="#1E1E1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
</svg>

            </button>
          </div>

          <section className="habit-details-modal__card">
            <div className="habit-details-modal__card-header">
              <div className="habit-details-modal__card-main">
                <div className="habit-details-modal__habit-icon">{habitIcon}</div>
                <div>
                  <div className="habit-details-modal__habit-title">{habitTitle}</div>
                  <div className="habit-details-modal__habit-category">{habitCategory}</div>
                </div>
              </div>
              <button
                className="habit-details-modal__edit"
                type="button"
                aria-label="Редактировать"
                onClick={handleEdit}
              >
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18.0543 17.4082C18.4824 17.4084 18.8307 17.7653 18.8307 18.2041C18.8307 18.6437 18.4824 18.9998 18.0543 19H13.6647C13.2364 19 12.8883 18.6439 12.8883 18.2041C12.8883 17.7652 13.2364 17.4082 13.6647 17.4082H18.0543ZM12.0592 5.74414C12.7607 4.83291 13.9843 4.74969 14.9713 5.54395L16.1051 6.45508C16.5701 6.82296 16.8799 7.30834 16.986 7.81836C17.1082 8.3792 16.9779 8.92981 16.611 9.40625L15.8092 10.416C15.7285 10.5188 15.5834 10.5359 15.483 10.4541C14.5082 9.65814 12.0115 7.61584 11.319 7.0498C11.2181 6.96628 11.2046 6.81748 11.2858 6.71387L12.0592 5.74414Z" fill="black"/>
<path fillRule="evenodd" clipRule="evenodd" d="M10.6062 8.05221L14.7778 11.4656C14.8785 11.5472 14.8957 11.697 14.8171 11.8013L9.87152 18.3267C9.56063 18.7298 9.10247 18.9579 8.6116 18.9663L5.91176 19C5.76777 19.0017 5.64178 18.9007 5.60906 18.7559L4.99546 16.0545C4.8891 15.558 4.99546 15.0447 5.30635 14.6491L10.2765 8.09261C10.3567 7.98741 10.5048 7.9689 10.6062 8.05221" fill="#040415"/>
</svg>

              </button>
            </div>
            <div className="habit-details-modal__card-row">
              <span className="habit-details-modal__row-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8.83533 1.33325C9.00222 1.33325 9.13691 1.4704 9.13708 1.63892V3.78345C9.13719 5.00536 10.1326 6.00708 11.3431 6.00708C11.8395 6.00708 12.2384 6.01392 12.5394 6.01392C12.7453 6.01391 13.0829 6.01103 13.3646 6.00903C13.5322 6.00837 13.6663 6.14448 13.6664 6.31372V11.6682C13.6662 13.3247 12.3372 14.6662 10.6976 14.6663H5.44666C3.72712 14.6663 2.33344 13.2593 2.33337 11.5227V4.33911C2.33345 2.6839 3.66344 1.33334 5.30896 1.33325H8.83533ZM10.1752 1.93384C10.1754 1.64669 10.5238 1.50392 10.723 1.71118C11.4444 2.46052 12.7033 3.77185 13.4066 4.50317C13.601 4.70584 13.4587 5.04055 13.1781 5.04126C12.6301 5.04259 11.9846 5.04171 11.5199 5.03638C10.7826 5.0363 10.1752 4.42894 10.1752 3.69165V1.93384Z" fill="white"/>
<path d="M9.61157 9.92822C9.88557 9.92822 10.1086 10.1513 10.1086 10.4253C10.1086 10.6993 9.88556 10.9214 9.61157 10.9214H5.98267C5.70868 10.9214 5.48659 10.6993 5.48657 10.4253C5.48657 10.1513 5.70867 9.92822 5.98267 9.92822H9.61157ZM8.2395 6.59912C8.51338 6.59926 8.7356 6.82228 8.7356 7.09619C8.73538 7.36992 8.51325 7.59117 8.2395 7.59131H5.98267C5.7088 7.59131 5.48679 7.37001 5.48657 7.09619C5.48657 6.82219 5.70867 6.59912 5.98267 6.59912H8.2395Z" fill="#3843FF"/>
</svg>
</span>
              <span>{habitGoal} раз в день</span>
            </div>
            <div className="habit-details-modal__card-row">
              <span className="habit-details-modal__row-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="16" height="16" rx="8" fill="white"/>
<path d="M5.99158 8.8457C6.17564 8.8457 6.32538 8.99469 6.32556 9.17871C6.32556 9.36289 6.17576 9.5127 5.99158 9.5127H4.79626L5.64197 10.3584C6.94509 11.6584 9.05466 11.6584 10.3578 10.3584C10.488 10.2282 10.6992 10.2282 10.8295 10.3584C10.9597 10.4886 10.9597 10.6998 10.8295 10.8301C9.26563 12.39 6.73411 12.3901 5.17029 10.8301L4.32458 9.98438V11.1797C4.32458 11.3639 4.17478 11.5137 3.9906 11.5137C3.80664 11.5134 3.65759 11.3637 3.65759 11.1797V9.17969C3.65759 9.16873 3.65846 9.15739 3.65955 9.14648C3.65998 9.14201 3.66089 9.13723 3.6615 9.13281C3.66238 9.12646 3.66318 9.11958 3.66443 9.11328C3.66543 9.10837 3.66615 9.10346 3.66736 9.09863C3.66871 9.0932 3.67061 9.0874 3.67224 9.08203C3.67375 9.07708 3.6754 9.07223 3.67712 9.06738C3.67897 9.06217 3.68089 9.05689 3.68298 9.05176C3.68484 9.04731 3.68681 9.04243 3.68884 9.03809C3.6914 9.0326 3.69379 9.02685 3.69666 9.02148C3.69882 9.01745 3.70215 9.0137 3.70447 9.00977C3.70759 9.00447 3.71079 8.99929 3.71423 8.99414C3.71699 8.99002 3.72008 8.98543 3.72302 8.98145C3.72644 8.97679 3.73006 8.97228 3.73376 8.96777C3.73859 8.9619 3.7432 8.95572 3.74841 8.9502L3.76208 8.93652C3.76771 8.93121 3.77369 8.92581 3.77966 8.9209C3.78395 8.91741 3.78893 8.91439 3.79333 8.91113C3.7975 8.90803 3.8017 8.90426 3.80603 8.90137C3.8108 8.8982 3.81579 8.89548 3.82068 8.89258C3.82499 8.89001 3.82991 8.88714 3.83435 8.88477L3.86365 8.87109C3.86814 8.86924 3.87276 8.86784 3.87732 8.86621C3.88285 8.86421 3.88925 8.86206 3.8949 8.86035C3.89937 8.85902 3.90407 8.8576 3.90857 8.85645C3.9144 8.85495 3.92019 8.85274 3.92615 8.85156C3.93116 8.85058 3.93673 8.85037 3.94177 8.84961C3.94728 8.84877 3.95277 8.8482 3.95837 8.84766C3.96679 8.84683 3.97532 8.84589 3.98376 8.8457H5.99158ZM5.17029 5.16992C6.7341 3.60992 9.26562 3.60997 10.8295 5.16992L11.6752 6.01562V4.82031C11.6752 4.63613 11.825 4.48633 12.0092 4.48633C12.1932 4.48653 12.3422 4.63626 12.3422 4.82031V6.82031C12.3422 6.83128 12.3413 6.84261 12.3402 6.85352C12.3398 6.85799 12.3389 6.86277 12.3383 6.86719C12.3374 6.8734 12.3365 6.87958 12.3353 6.88574C12.3343 6.89085 12.3336 6.89635 12.3324 6.90137C12.331 6.9068 12.3291 6.9126 12.3275 6.91797C12.326 6.92292 12.3244 6.92776 12.3226 6.93262C12.3208 6.93784 12.3189 6.94309 12.3168 6.94824C12.3149 6.95271 12.313 6.95755 12.3109 6.96191C12.3083 6.96741 12.306 6.97313 12.3031 6.97852C12.301 6.98251 12.2986 6.98634 12.2963 6.99023C12.2931 6.99563 12.289 7.00061 12.2855 7.00586C12.2828 7.00998 12.2797 7.01457 12.2767 7.01855C12.2734 7.02306 12.2705 7.02785 12.267 7.03223C12.2621 7.03811 12.2566 7.04427 12.2513 7.0498L12.2377 7.06348C12.2321 7.06876 12.226 7.07421 12.2201 7.0791C12.2158 7.08264 12.2109 7.08556 12.2064 7.08887C12.2023 7.09193 12.198 7.09576 12.1937 7.09863C12.1888 7.1019 12.1832 7.10442 12.1781 7.10742C12.1741 7.10982 12.1705 7.11301 12.1664 7.11523C12.1613 7.11797 12.156 7.1206 12.1508 7.12305L12.1215 7.13477C12.1164 7.13658 12.111 7.13807 12.1058 7.13965C12.1008 7.14118 12.0953 7.14227 12.0902 7.14355C12.0848 7.14492 12.0791 7.14734 12.0736 7.14844C12.0679 7.14955 12.0618 7.14957 12.056 7.15039C12.0512 7.15108 12.0462 7.15187 12.0414 7.15234C12.0307 7.1534 12.0199 7.15428 12.0092 7.1543H10.0082C9.82411 7.1543 9.67438 7.00531 9.67419 6.82129C9.67419 6.63711 9.824 6.4873 10.0082 6.4873H11.2035L10.3578 5.6416C9.05465 4.34162 6.94508 4.34157 5.64197 5.6416C5.51172 5.77185 5.30053 5.77185 5.17029 5.6416C5.04013 5.51135 5.04007 5.30014 5.17029 5.16992Z" fill="#3843FF"/>
</svg>
</span>
              <span>{habitRepeatDays}</span>
            </div>
          </section>

          <section className="habit-details-modal__section">
            <div className="habit-details-modal__section-title">Статистика</div>
            {participants.length > 0 && (
              <div className="habit-details-modal__user-select">
                <button
                  className="habit-details-modal__user-card"
                  type="button"
                  onClick={handleUserToggle}
                  aria-expanded={isUserDropdownOpen}
                >
                  <div className="habit-details-modal__user-info">
                    <div
                      className="habit-details-modal__user-avatar"
                      style={{ backgroundImage: `url(${selectedUserAvatar})` }}
                    ></div>
                    <div className="habit-details-modal__user-name">{selectedUserName}</div>
                  </div>
                  <svg
                    className={`habit-details-modal__user-chevron ${
                      isUserDropdownOpen ? 'habit-details-modal__user-chevron--open' : ''
                    }`}
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path d="M6 9L12 15L18 9" stroke="#8B93A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {isUserDropdownOpen && (
                  <div className="habit-details-modal__user-dropdown" role="listbox">
                    {users.map((user) => {
                      const isActive = user.id === selectedUser?.id
                      return (
                        <button
                          key={user.id}
                          className={`habit-details-modal__user-option ${
                            isActive ? 'habit-details-modal__user-option--active' : ''
                          }`}
                          type="button"
                          onClick={() => handleUserSelect(user)}
                          role="option"
                          aria-selected={isActive}
                        >
                          <span>{user.name}</span>
                          {isActive && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17L4 12" stroke="#2E6BFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="habit-details-modal__stats-grid">
              <div className="habit-details-modal__stat-card">
                <div className="habit-details-modal__stat-icon">🔥</div>
                <div>
                  <div className="habit-details-modal__stat-value">{bestStreak} дней</div>
                  <div className="habit-details-modal__stat-label">Рекорд Streak</div>
                </div>
              </div>
              <div className="habit-details-modal__stat-card">
                <div className="habit-details-modal__stat-icon">📝</div>
                <div>
                  <div className="habit-details-modal__stat-value">{currentStreak} дней</div>
                  <div className="habit-details-modal__stat-label">Текущий Streak</div>
                </div>
              </div>
            </div>

            <div className="habit-details-modal__stat-card habit-details-modal__stat-card--wide">
              <div className="habit-details-modal__stat-icon">🔄</div>
              <div>
                <div className="habit-details-modal__stat-value">{totalCompletionsCount} раз</div>
                <div className="habit-details-modal__stat-label">Вы выполняли эту привычку</div>
              </div>
            </div>
          </section>

          <section className="habit-details-modal__calendar">
            <div className="habit-details-modal__calendar-header">
              <button
                className="habit-details-modal__calendar-nav"
                type="button"
                aria-label="Предыдущий месяц"
                onClick={handlePrevMonth}
              >
                ‹
              </button>
              <div className="habit-details-modal__calendar-title">
                {monthNames[calendarMonth]} {calendarYear}
              </div>
              <button
                className="habit-details-modal__calendar-nav"
                type="button"
                aria-label="Следующий месяц"
                onClick={handleNextMonth}
              >
                ›
              </button>
            </div>
            <div className="habit-details-modal__calendar-week">
              {weekDays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="habit-details-modal__calendar-grid">
              {calendarDays.map((day, index) => {
                if (!day) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="habit-details-modal__calendar-day habit-details-modal__calendar-day--empty"
                    />
                  )
                }

                const fullDate = formatDateValue(new Date(calendarYear, calendarMonth, day))
                const isToday = fullDate === todayValue
                const isFuture = fullDate > todayValue
                const isCompleted = !isFuture && completedCalendarDates.has(fullDate)

                return (
                  <div
                    key={day}
                    className={`habit-details-modal__calendar-day ${
                      isCompleted ? 'habit-details-modal__calendar-day--active' : ''
                    } ${
                      isToday ? 'habit-details-modal__calendar-day--today' : ''
                    }`}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="habit-details-modal__period">
            <div className="habit-details-modal__period-inputs">
              <label className="habit-details-modal__period-field">
                <span className="habit-details-modal__period-label">Дата от</span>
                <input
                  className="habit-details-modal__period-input"
                  type="date"
                  value={rangeStart}
                  max={rangeEnd || statsMaxDate || undefined}
                  min={statsMinDate}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
              </label>
              <label className="habit-details-modal__period-field">
                <span className="habit-details-modal__period-label">Дата до</span>
                <input
                  className="habit-details-modal__period-input"
                  type="date"
                  value={rangeEnd}
                  min={rangeStart || statsMinDate || undefined}
                  max={statsMaxDate}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </label>
            </div>
            <div className="habit-details-modal__period-result">
              <span className="habit-details-modal__period-count">{periodTotal}</span>
              <span className="habit-details-modal__period-text">выполнений всего</span>
            </div>
            <div className="habit-details-modal__period-list">
              {periodStats.map((item) => (
                <div
                  key={item.id}
                  className="habit-details-modal__period-row"
                  style={{ '--habit-accent': categoryColors[item.category] || '#E7EAFF' }}
                >
                  <span className="habit-details-modal__period-habit">{item.title}</span>
                  <span className="habit-details-modal__period-value">
                    {item.days} дней ({item.count} раз)
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {isShareOpen && (
        <div
          className="habit-details-modal__share-overlay"
          onClick={(event) => {
            event.stopPropagation()
            handleShareClose()
          }}
        >
          <div
            className="habit-details-modal__share-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="habit-details-modal__share-title">Поделиться привычкой</h3>
            <p className="habit-details-modal__share-text">
              Вы сможете следить за прогрессом друзей, если пригласите их как соучастников
            </p>
            <button
              className="habit-details-modal__share-primary"
              type="button"
              onClick={handleShareCopyLink}
              disabled={isShareCopying}
            >
              {isShareCopying ? 'Копируем...' : 'Скопировать ссылку'}
            </button>
            <button className="habit-details-modal__share-secondary" type="button" onClick={handleShareClose}>
              Пригласить соучастника
            </button>
            {shareStatus.message && (
              <p
                className="habit-details-modal__share-text"
                style={{ marginTop: 10, color: shareStatus.type === 'error' ? '#E35B6D' : '#3C47F4' }}
              >
                {shareStatus.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HabitDetailsModal
