import { useEffect, useState } from 'react'
import CalendarStrip from '../../components/organisms/CalendarStrip/CalendarStrip.jsx'
import FloatingAction from '../../components/organisms/FloatingAction/FloatingAction.jsx'
import HabitsSection from '../../components/organisms/HabitsSection/HabitsSection.jsx'
import Header from '../../components/organisms/Header/Header.jsx'
import LevelCard from '../../components/organisms/LevelCard/LevelCard.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import HabitModal from '../../components/organisms/HabitModal/HabitModal.jsx'
import HabitDetailsModal from '../../components/organisms/HabitDetailsModal/HabitDetailsModal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import ENDPOINTS from '../../utils/endpoints.js'
import { api, request } from '../../utils/api.js'
import { buildBalanceFromHabits } from '../../utils/balance.js'
import './Home.scss'


const Home = () => {
  const { user, isAuthenticated } = useAuth()
  const { bootstrap, setBootstrapData } = useAppData()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [activeHabit, setActiveHabit] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [habits, setHabits] = useState([])
  const [allHabits, setAllHabits] = useState([])
  const [categories, setCategories] = useState([])
  const [pendingCompletes, setPendingCompletes] = useState(() => new Set())
  const [habitLimits, setHabitLimits] = useState({
    maxTotal: null,
    maxPublic: null,
    publicJoinOnly: false,
    statsDays: 30
  })
  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()))
  const weekdayNames = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье'
  ]

  const getWeekdayNameFromIso = (isoDate) => {
    const [year, month, day] = (isoDate || '').split('-').map(Number)
    if (!year || !month || !day) return null
    const date = new Date(year, month - 1, day)
    const dayIndex = date.getDay()
    const normalized = dayIndex === 0 ? 6 : dayIndex - 1
    return weekdayNames[normalized]
  }

  const filterHabitsByDate = (items, isoDate) => {
    const weekdayName = getWeekdayNameFromIso(isoDate)
    if (!weekdayName) return items
    return (items || []).filter((habit) => {
      const repeatDays = habit?.repeatDays || []
      return !repeatDays.length || repeatDays.includes(weekdayName)
    })
  }

  const mapHabitFromApi = (habit) => ({
    id: habit.id,
    title: habit.title,
    category: habit.category?.name ?? '',
    categoryId: habit.category?.id ?? null,
    icon: habit.icon,
    completed: habit.completed,
    progress: habit.progress,
    step: habit.goal,
    currentSteps: habit.current_steps,
    totalSteps: habit.total_steps,
    repeatDays: habit.repeat_days ?? [],
    reminder: habit.reminder,
    reminderTimes: habit.reminder_times ?? [],
    visibility: habit.visibility,
    completedDates: habit.completed_dates ?? [],
    completions: habit.completions ?? [],
    totalCompletions: habit.total_completions ?? 0,
    currentStreak: habit.current_streak ?? 0,
    bestStreak: habit.best_streak ?? 0,
    sourceHabitId: habit.source_habit_id ?? null
  })

  const mapHabitToApi = (habitData) => {
    const payload = {
      title: habitData.name,
      icon: habitData.icon,
      goal: habitData.goal || 1,
      repeat_days: habitData.repeatDays ?? [],
      reminder: habitData.reminder ?? false,
      reminder_times: habitData.reminderTimes ?? [],
      visibility: habitData.visibility ?? 'Приватный'
    }
    if (habitData.categoryId) {
      payload.category_id = habitData.categoryId
    }
    return payload
  }

  const loadHabits = async (date) => {
    const data = await api.habits.list({ date })
    setHabits(data.map(mapHabitFromApi))
  }

  const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parsed
  }

  const updateBootstrapHabits = (updater) => {
    setBootstrapData((prev) => {
      const prevHabits = Array.isArray(prev.habits) ? prev.habits : []
      const nextHabits = updater(prevHabits)
      const usePublicOnlyBalance = Boolean(prev?.user?.balance_wheel)
      return {
        ...prev,
        habits: nextHabits,
        balance: buildBalanceFromHabits(nextHabits, { publicOnly: usePublicOnlyBalance })
      }
    })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    setCategories(Array.isArray(bootstrap?.categories) ? bootstrap.categories : [])
  }, [isAuthenticated, bootstrap?.categories])

  useEffect(() => {
    if (!isAuthenticated) return
    const mapped = Array.isArray(bootstrap?.habits) ? bootstrap.habits.map(mapHabitFromApi) : []
    setAllHabits(mapped)
    const today = formatLocalDate(new Date())
    if (selectedDate === today) {
      setHabits(filterHabitsByDate(mapped, selectedDate))
    }
  }, [isAuthenticated, bootstrap?.habits, selectedDate])

  useEffect(() => {
    if (!Array.isArray(bootstrap?.titles) || !bootstrap.titles.length) return
    const currentTitle = bootstrap.titles.find((title) => title.is_current)
    const privileges = currentTitle?.privileges ?? {}
    setHabitLimits({
      maxTotal: parseLimit(privileges.total_habits),
      maxPublic: parseLimit(privileges.public_habits),
      publicJoinOnly: Boolean(privileges.public_join_only),
      statsDays: parseLimit(privileges.stats_days) ?? 30
    })
  }, [bootstrap?.titles])

  useEffect(() => {
    if (!isAuthenticated) return
    const today = formatLocalDate(new Date())
    if (selectedDate === today) {
      setHabits(filterHabitsByDate(allHabits, selectedDate))
      return
    }
    loadHabits(selectedDate)
  }, [selectedDate, isAuthenticated, allHabits])

  const handleAddHabit = async (habitData) => {
    const payload = mapHabitToApi(habitData)
    const created = await api.habits.create(payload)
    const createdHabit = mapHabitFromApi(created)
    const weekdays = [
      'Понедельник',
      'Вторник',
      'Среда',
      'Четверг',
      'Пятница',
      'Суббота',
      'Воскресенье'
    ]
    const selected = new Date(selectedDate)
    const dayName = weekdays[selected.getDay() === 0 ? 6 : selected.getDay() - 1]
    const shouldShow =
      !createdHabit.repeatDays?.length || createdHabit.repeatDays.includes(dayName)
    setHabits((prev) => (shouldShow ? [createdHabit, ...prev] : prev))
    setAllHabits((prev) => [createdHabit, ...prev])
    updateBootstrapHabits((prev) => [created, ...prev])
  }

  const handleSaveHabit = async (habitData) => {
    const payload = mapHabitToApi(habitData)
    const updated = await api.habits.update(habitData.id, payload)
    const updatedHabit = mapHabitFromApi(updated)
    setHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updatedHabit : habit)))
    setAllHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updatedHabit : habit)))
    updateBootstrapHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updated : habit)))
  }

  const handleDeleteHabit = async (id) => {
    await api.habits.delete(id)
    setHabits((prev) => prev.filter((habit) => habit.id !== id))
    setAllHabits((prev) => prev.filter((habit) => habit.id !== id))
    updateBootstrapHabits((prev) => prev.filter((habit) => habit.id !== id))
  }

  const handleToggleHabit = async (id) => {
    const today = formatLocalDate(new Date())
    if (selectedDate > today) {
      return
    }
    if (pendingCompletes.has(id)) {
      return
    }
    setPendingCompletes((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    try {
      const updated = await request.post(ENDPOINTS.habits.complete(id), {
        count: 1,
        date: selectedDate
      })
      const updatedHabit = mapHabitFromApi(updated)
      setHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updatedHabit : habit)))
      setAllHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updatedHabit : habit)))
      updateBootstrapHabits((prev) => prev.map((habit) => (habit.id === updated.id ? updated : habit)))
      setBootstrapData((prev) => {
        const progress = updated?.user_progress || {}
        const titles = Array.isArray(prev?.titles) ? prev.titles : []
        const nextUser = prev?.user
          ? {
              ...prev.user,
              xp: Number(progress?.xp ?? prev.user.xp ?? 0),
              level: Number(progress?.level ?? prev.user.level ?? 1),
              title: progress?.title ?? prev.user.title ?? '',
            }
          : prev?.user
        const nextTitles = titles.length
          ? titles.map((title) => ({ ...title, is_current: title.name === (progress?.title ?? '') }))
          : titles
        return {
          ...prev,
          user: nextUser,
          titles: nextTitles,
        }
      })
    } catch (error) {
      if (error?.response?.status === 400) {
        await loadHabits(selectedDate)
      }
      console.warn('Failed to complete habit', error?.response?.data?.detail || error.message)
    } finally {
      setPendingCompletes((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleSkipHabit = async (id) => {
    await api.habits.delete(id)
    setHabits((prev) => prev.filter((habit) => habit.id !== id))
    setAllHabits((prev) => prev.filter((habit) => habit.id !== id))
    updateBootstrapHabits((prev) => prev.filter((habit) => habit.id !== id))
  }

  const handleOpenCreate = () => {
    setModalMode('create')
    setActiveHabit(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (habit) => {
    setModalMode('edit')
    setActiveHabit(habit)
    setIsModalOpen(true)
  }

  const handleOpenDetails = (habit) => {
    setActiveHabit(habit)
    setIsDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
  }

  const handleEditFromDetails = (habit) => {
    handleOpenEdit(habit)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setActiveHabit(null)
    setModalMode('create')
  }

  const liveUser = bootstrap?.user ?? user
  const displayName = liveUser?.first_name || liveUser?.username || 'Пользователь'
  const avatarUrl = liveUser?.photo_url || null
  const levelValue = liveUser?.level ?? 1
  const xpValue = liveUser?.xp ?? 0
  const isPremium = liveUser?.is_premium ?? Boolean(liveUser?.premium_expiration && new Date(liveUser.premium_expiration) > new Date())
  const titleItems = Array.isArray(bootstrap?.titles) ? bootstrap.titles : []
  const currentTitle = titleItems.find((title) => title.is_current) ?? null
  const titleName = currentTitle?.name || 'Новичок'
  const targetLevel = Math.max(Number(currentTitle?.level_max ?? levelValue) || levelValue, 1)
  const currentLevelForProgress = Math.min(Math.max(levelValue, 1), targetLevel)
  const defaultCategoryId =
    categories.find((category) => category.name === 'Личное')?.id ?? categories[0]?.id ?? null
  const publicHabitsCount = allHabits.filter((habit) => habit.visibility === 'Публичный').length
  const canAddHabit = habitLimits.maxTotal == null || allHabits.length < habitLimits.maxTotal
  const canCreatePublicHabit =
    !habitLimits.publicJoinOnly &&
    (habitLimits.maxPublic == null || publicHabitsCount < habitLimits.maxPublic)

  return (
    <div className="home">
      <Header userName={displayName} avatarUrl={avatarUrl} />
      <LevelCard
        title={titleName}
        level={levelValue}
        currentLevel={currentLevelForProgress}
        targetLevel={targetLevel}
        currentXP={xpValue}
      />
      <CalendarStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <HabitsSection
        habits={habits}
        onToggleHabit={handleToggleHabit}
        onSkipHabit={handleSkipHabit}
        onEditHabit={handleOpenEdit}
        onOpenDetails={handleOpenDetails}
      >
        {canAddHabit ? <FloatingAction onClick={handleOpenCreate} /> : null}
      </HabitsSection>
      <BottomNav />
      <HabitModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onAdd={handleAddHabit}
        onSave={handleSaveHabit}
        onDelete={handleDeleteHabit}
        mode={modalMode}
        initialData={activeHabit}
        categories={categories}
        defaultCategoryId={defaultCategoryId}
        isPremium={isPremium}
        canCreatePublicHabit={canCreatePublicHabit}
        publicJoinOnly={habitLimits.publicJoinOnly}
        maxPublicHabits={habitLimits.maxPublic}
        publicHabitsCount={publicHabitsCount}
        statsDays={habitLimits.statsDays}
      />
      <HabitDetailsModal
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        onEdit={handleEditFromDetails}
        habit={activeHabit}
        habits={habits}
        statsDays={habitLimits.statsDays}
        currentUserId={liveUser?.id ?? null}
      />
    </div>
  )
}

export default Home
