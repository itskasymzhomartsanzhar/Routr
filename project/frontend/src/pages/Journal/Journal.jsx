import { useCallback, useEffect, useMemo, useState } from 'react'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import { api } from '../../utils/api.js'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import './Journal.scss'

const LIVE_REFRESH_MS = 7000

const Journal = () => {
  const { bootstrap, setBootstrapData } = useAppData()
  const [titles, setTitles] = useState(() => bootstrap?.titles ?? [])
  const [quests, setQuests] = useState(() => bootstrap?.quests ?? [])

  useEffect(() => {
    if (Array.isArray(bootstrap?.titles)) setTitles(bootstrap.titles)
    if (Array.isArray(bootstrap?.quests)) setQuests(bootstrap.quests)
  }, [bootstrap?.titles, bootstrap?.quests])

  const syncLiveProgress = useCallback(async () => {
    try {
      const [titlesResponse, questsResponse] = await Promise.all([
        api.xp.titles(),
        api.xp.quests(),
      ])
      const nextTitles = Array.isArray(titlesResponse?.items) ? titlesResponse.items : []
      const nextQuests = Array.isArray(questsResponse?.items) ? questsResponse.items : []
      setTitles(nextTitles)
      setQuests(nextQuests)
      setBootstrapData((prev) => {
        const currentTitleName = nextTitles.find((item) => item?.is_current)?.name
        return {
          ...prev,
          titles: nextTitles,
          quests: nextQuests,
          user: prev?.user
            ? {
              ...prev.user,
              title: currentTitleName ?? prev.user.title,
            }
            : prev?.user,
        }
      })
    } catch (_error) {
    }
  }, [setBootstrapData])

  useEffect(() => {
    syncLiveProgress()
  }, [syncLiveProgress])

  useEffect(() => {
    const onProgressUpdated = () => {
      syncLiveProgress()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncLiveProgress()
      }
    }
    const intervalId = window.setInterval(syncLiveProgress, LIVE_REFRESH_MS)
    window.addEventListener('routr:progress-updated', onProgressUpdated)
    window.addEventListener('focus', onProgressUpdated)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('routr:progress-updated', onProgressUpdated)
      window.removeEventListener('focus', onProgressUpdated)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncLiveProgress])

  const questGroups = useMemo(() => {
    return quests.reduce((acc, quest) => {
      const group = quest.group || 'novice'
      if (!acc[group]) acc[group] = { total: 0, completed: 0 }
      acc[group].total += 1
      if (quest.completed) acc[group].completed += 1
      return acc
    }, {})
  }, [quests])

  const privilegeLabels = {
    daily_active_habits: 'Активных привычек в день',
    total_habits: 'Всего привычек',
    public_habits: 'Публичных привычек',
    public_join_only: 'Публичные привычки',
    stats_days: 'Статистика, дней'
  }

  const roleDescriptions = (privileges = {}) => {
    return Object.entries(privileges)
      .filter(([key, value]) => !(key === 'public_habits' && Number(value) === 0))
      .filter(([key]) => key !== 'daily_active_habits')
      .map(([key, value]) => {
        const label = privilegeLabels[key] || key
        let displayValue = value
        if (key === 'public_join_only') {
          displayValue = value ? 'Присоединение' : 'Можно создавать'
        }
        return `${label}: ${displayValue}`
      })
  }

  const roles = titles.map((title) => {
    const groupStats = questGroups[title.code] || { total: 0, completed: 0 }
    const progress = groupStats.total > 0 ? groupStats.completed / groupStats.total : 0
    return {
      id: title.code,
      title: title.name,
      level: `Уровни ${title.level_min}-${title.level_max}`,
      description: roleDescriptions(title.privileges),
      quests: `${groupStats.completed}/${groupStats.total} квестов`,
      progress,
      isCurrent: title.is_current,
      isPremium: title.requires_premium
    }
  })

  const currentTitleCode = useMemo(() => {
    return titles.find((title) => title.is_current)?.code || null
  }, [titles])

  const activeQuests = useMemo(() => {
    if (!currentTitleCode) return []
    return quests.filter((quest) => (quest.group || 'novice') === currentTitleCode)
  }, [quests, currentTitleCode])

  const questItems = activeQuests.map((quest) => ({
    id: quest.code,
    title: quest.title,
    icon: '🎯',
    reward: `${quest.xp}XP`,
    progress: Math.max(
      0,
      Math.min(
        1,
        (Number.isFinite(quest.progress_percent) ? quest.progress_percent / 100 : null)
          ?? ((quest.progress_target || 0) > 0 ? (quest.progress_current || 0) / quest.progress_target : (quest.completed ? 1 : 0))
      )
    ),
    completed: quest.completed
  }))

  return (
    <div className="journal">
      <div className="journal__content">
        <h2 className="journal__title">Квесты и должности</h2>

        <section className="journal__section">
          <div className="journal__section-title">Должности</div>
          <div className="journal__roles">
            {roles.map((role) => (
              <div key={role.id} className="journal__role-card">
                <div className="journal__role-header">
                  <div>
                    <div className="journal__role-title">{role.title}</div>
                    <div className="journal__role-level">{role.level}</div>
                  </div>
                  <div className="journal__role-header-actions">
                    {role.isCurrent && (
                      <div className="journal__role-current">Вы здесь</div>
                    )}
                    {role.isPremium && (
                      <button className="journal__role-premium" type="button">
                        Premium
                      </button>
                    )}
                  </div>
                </div>
                <div className="journal__role-description">
                  {role.description.map((line) => (
                    <div key={line} className="journal__role-line">{line}</div>
                  ))}
                </div>
                <div className="journal__role-tags">
                  <span className="journal__role-tag">{role.quests}</span>
                </div>
                <div className="journal__role-progress">
                  <div
                    className="journal__role-progress-fill"
                    style={{ width: `${role.progress * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="journal__section">
          <div className="journal__section-title">Выполните квесты для повышения</div>
          <div className="journal__quests">
            {questItems.map((quest) => (
              <div key={quest.id} className="journal__quest-card">
                <div className="journal__quest-icon">{quest.icon}</div>
                <div className="journal__quest-content">
                  <div className="journal__quest-title">{quest.title}</div>
                </div>
                <div className={`journal__quest-reward ${quest.completed ? 'journal__quest-reward--done' : ''}`}>
                  {quest.reward}
                </div>
                <div className="journal__quest-progress">
                  <div
                    className="journal__quest-progress-fill"
                    style={{ width: `${quest.progress * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
            {!questItems.length && (
              <div className="journal__role-line">Для текущего уровня нет доступных квестов.</div>
            )}
          </div>
        </section>
      </div>
      <BottomNav />
    </div>
  )
}

export default Journal
