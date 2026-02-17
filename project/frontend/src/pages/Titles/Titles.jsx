import { useEffect, useMemo, useState } from 'react'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import { api } from '../../utils/api.js'
import './Titles.scss'

const privilegeLabels = {
  daily_active_habits: 'Активных привычек в день',
  total_habits: 'Всего привычек',
  public_habits: 'Публичных привычек',
  public_join_only: 'Публичные привычки',
  stats_days: 'Статистика, дней'
}

const Titles = () => {
  const [titles, setTitles] = useState([])

  useEffect(() => {
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

  const sortedTitles = useMemo(() => {
    return [...titles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [titles])

  const renderPrivileges = (privileges = {}) => {
    return Object.entries(privileges).map(([key, value]) => {
      const label = privilegeLabels[key] || key
      let displayValue = value
      if (key === 'public_join_only') {
        displayValue = value ? 'Только присоединение' : 'Можно создавать'
      }
      return (
        <div key={key} className="titles__privilege">
          <span className="titles__privilege-label">{label}</span>
          <span className="titles__privilege-value">{displayValue}</span>
        </div>
      )
    })
  }

  return (
    <div className="titles">
      <div className="titles__content">
        <h2 className="titles__title">Должности и привилегии</h2>
        <div className="titles__grid">
          {sortedTitles.map((title) => (
            <div
              key={title.code}
              className={`titles__card ${
                title.is_current ? 'titles__card--current' : ''
              } ${title.is_locked ? 'titles__card--locked' : ''}`}
            >
              <div className="titles__card-header">
                <div>
                  <div className="titles__card-name">{title.name}</div>
                  <div className="titles__card-levels">
                    Уровни {title.level_min}–{title.level_max}
                  </div>
                </div>
                {title.is_current && <span className="titles__badge">Текущая</span>}
                {title.is_locked && <span className="titles__badge titles__badge--locked">Premium</span>}
              </div>
              <div className="titles__card-body">
                {renderPrivileges(title.privileges)}
              </div>
            </div>
          ))}
          {!sortedTitles.length && (
            <div className="titles__empty">Нет данных по должностям.</div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Titles
