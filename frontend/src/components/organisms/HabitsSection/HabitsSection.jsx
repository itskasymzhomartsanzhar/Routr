import { useState } from 'react'
import './HabitsSection.scss'

const HabitsSection = ({ habits, onToggleHabit, onSkipHabit, onEditHabit, onOpenDetails }) => {
  const [swipedId, setSwipedId] = useState(null)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  const handleToggleHabit = (e, id) => {
    e.stopPropagation()
    if (onToggleHabit) {
      onToggleHabit(id)
    }
  }

  const handleTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = (habitId) => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50

    if (isLeftSwipe) {
      setSwipedId(habitId)
    } else {
      setSwipedId(null)
    }
  }

  const skipHabit = (id) => {
    setSwipedId(null)
    if (onSkipHabit) {
      onSkipHabit(id)
    }
  }

  return (
    <section className="habits-section">
      <h2 className="habits-section__title">Привычки</h2>
      <div className="habits-section__list">
        {habits.map((habit) => (
          <div
            key={habit.id}
            className={`habit-card-wrapper ${
              swipedId === habit.id ? 'habit-card-wrapper--swiped' : ''
            }`}
          >
            <div
              className="habit-card"
              onTouchStart={!habit.completed ? handleTouchStart : undefined}
              onTouchMove={!habit.completed ? handleTouchMove : undefined}
              onTouchEnd={!habit.completed ? () => handleTouchEnd(habit.id) : undefined}
              onClick={() => {
                if (onOpenDetails) {
                  onOpenDetails(habit)
                } else if (onEditHabit) {
                  onEditHabit(habit)
                }
              }}
            >
              <div className="habit-card__icon-wrapper">
                <svg className="habit-card__progress" viewBox="0 0 36 36">
                  <circle
                    className="habit-card__progress-bg"
                    cx="18"
                    cy="18"
                    r="15.5"
                  />
                  <circle
                    className="habit-card__progress-fill"
                    cx="18"
                    cy="18"
                    r="15.5"
                    style={{
                      strokeDasharray: `${habit.progress * 0.97} 97.4`,
                    }}
                  />
                </svg>
                <div className="habit-card__icon">{habit.icon}</div>
              </div>
              <div className="habit-card__content">
                <h3 className="habit-card__title">{habit.title}</h3>
                <p className="habit-card__category">{habit.category}</p>
              </div>
              <button
                className={`habit-card__check ${
                  habit.completed ? 'habit-card__check--completed' : ''
                }`}
                onClick={(e) => handleToggleHabit(e, habit.id)}
                aria-label={habit.completed ? 'Отметить как невыполненное' : 'Отметить как выполненное'}
              >
                {habit.completed ? (
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <path
                      d="M1 6L6 11L15 1"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 1V13M1 7H13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            <button
              className="habit-card__skip"
              onClick={() => skipHabit(habit.id)}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 18L15 12L9 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Пропуск</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default HabitsSection
