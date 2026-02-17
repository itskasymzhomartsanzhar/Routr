import { useEffect, useMemo, useState } from 'react'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import { api } from '../../utils/api.js'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import './Quests.scss'

const GROUPS = [
  { id: 'novice', label: 'Новичок' },
  { id: 'explorer', label: 'Исследователь' },
  { id: 'leader', label: 'Лидер' },
  { id: 'mentor', label: 'Наставник' }
]
const PRIVILEGE_LABELS = {
  daily_active_habits: 'Активных привычек в день',
  total_habits: 'Всего привычек',
  public_habits: 'Публичных привычек',
  public_join_only: 'Публичные привычки',
  stats_days: 'Статистика, дней'
}

const Quests = () => {
  const { bootstrap } = useAppData()
  const [activeGroup, setActiveGroup] = useState('novice')
  const [quests, setQuests] = useState(() => bootstrap?.quests ?? [])
  const [titles, setTitles] = useState(() => bootstrap?.titles ?? [])

  useEffect(() => {
    if (Array.isArray(bootstrap?.titles)) setTitles(bootstrap.titles)
    if (Array.isArray(bootstrap?.quests)) setQuests(bootstrap.quests)
  }, [bootstrap?.titles, bootstrap?.quests])

  useEffect(() => {
    if (quests.length) return
    const loadQuests = async () => {
      try {
        const response = await api.xp.quests()
        setQuests(response?.items ?? [])
      } catch (error) {
        setQuests([])
      }
    }
    loadQuests()
  }, [])

  useEffect(() => {
    if (titles.length) return
    const loadTitles = async () => {
      try {
        const response = await api.xp.titles()
        setTitles(response?.items ?? [])
      } catch (error) {
        setTitles([])
      }
    }
    loadTitles()
  }, [])

  const grouped = useMemo(() => {
    return quests.reduce((acc, quest) => {
      const group = quest.group || 'novice'
      if (!acc[group]) acc[group] = []
      acc[group].push(quest)
      return acc
    }, {})
  }, [quests])

  const activeItems = grouped[activeGroup] || []
  const sortedTitles = useMemo(() => {
    return [...titles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [titles])

  return (
    <div className="quests">
      <div className="quests__content">
        <h2 className="quests__title">Квесты</h2>
        <div className="quests__tabs">
          {GROUPS.map((group) => (
            <button
              key={group.id}
              className={`quests__tab ${activeGroup === group.id ? 'quests__tab--active' : ''}`}
              type="button"
              onClick={() => setActiveGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="quests__grid">
          {activeItems.map((quest) => (
            <div
              key={quest.code}
              className={`quests__card ${quest.completed ? 'quests__card--completed' : ''}`}
            >
              <div className="quests__card-header">
                <div className="quests__card-title">{quest.title}</div>
                <div className="quests__card-xp">{quest.xp} XP</div>
              </div>
              <div className="quests__card-desc">{quest.description}</div>
              {quest.show_progress && (
                <div className="quests__progress">
                  <div className="quests__progress-meta">
                    <span>Прогресс</span>
                    <span>{quest.progress_current}/{quest.progress_target}</span>
                  </div>
                  <div className="quests__progress-track">
                    <div
                      className="quests__progress-fill"
                      style={{ width: `${Math.max(0, Math.min(100, quest.progress_percent || 0))}%` }}
                    ></div>
                  </div>
                </div>
              )}
              <div className="quests__card-footer">
                <div className="quests__card-target">Цель: {quest.target}</div>
                {quest.completed && <div className="quests__card-status">Выполнено</div>}
              </div>
            </div>
          ))}
          {!activeItems.length && (
            <div className="quests__empty">Пока нет доступных квестов.</div>
          )}
        </div>

        <div className="quests__section">
          <h3 className="quests__section-title">Должности и привилегии</h3>
          <div className="quests__titles-grid">
            {sortedTitles.map((title) => (
              <div
                key={title.code}
                className={`quests__title-card ${
                  title.is_current ? 'quests__title-card--current' : ''
                } ${title.is_locked ? 'quests__title-card--locked' : ''}`}
              >
                <div className="quests__title-header">
                  <div>
                    <div className="quests__title-name">{title.name}</div>
                    <div className="quests__title-levels">Уровни {title.level_min}–{title.level_max}</div>
                  </div>
                  {title.is_current && <span className="quests__badge">Текущая</span>}
                  {title.is_locked && <span className="quests__badge quests__badge--locked">Premium</span>}
                </div>
                <div className="quests__title-body">
                  {Object.entries(title.privileges || {}).map(([key, value]) => (
                    <div key={key} className="quests__title-privilege">
                      <span className="quests__title-privilege-label">{PRIVILEGE_LABELS[key] || key}</span>
                      <span className="quests__title-privilege-value">
                        {key === 'public_join_only' ? (value ? 'Только присоединение' : 'Можно создавать') : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!sortedTitles.length && (
              <div className="quests__empty">Нет данных по должностям.</div>
            )}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Quests
