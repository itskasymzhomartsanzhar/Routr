import { useState, useEffect, useRef } from 'react'
import './HabitModal.scss'

const HabitModal = ({
  isOpen,
  onClose,
  onAdd,
  onSave,
  onDelete,
  mode = 'create',
  initialData = null
}) => {
  const defaultHabitData = {
    name: '',
    icon: '💪',
    category: 'Здоровье',
    repeatType: 'Понедельник, Вторник',
    repeatDays: ['Понедельник', 'Вторник'],
    goal: 1,
    reminder: true,
    reminderTimes: ['09:30'],
    visibility: 'Публичный'
  }
  const [habitData, setHabitData] = useState(defaultHabitData)
  const [isClosing, setIsClosing] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const categoryRef = useRef(null)
  const repeatRef = useRef(null)
  const emojiRef = useRef(null)
  const repeatOptions = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье'
  ]
  const emojiOptions = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '🙃',
    '😉', '😊', '😇', '😍', '🤩', '😘', '😗', '😙', '😚', '😋',
    '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '😎',
    '🥳', '😌', '😴', '🤓', '😺', '😸', '😹', '😻', '😼', '🙈',
    '🙉', '🙊', '💪', '🙏', '🤝', '👍', '👎', '✌️', '🤟', '👌',
    '🧠', '🫀', '🫁', '🦾', '🦿', '🏃', '🚶', '🧘', '🧘‍♂️', '🧘‍♀️',
    '🌞', '🌙', '⭐️', '🌟', '✨', '🔥', '⚡️', '🌈', '🍀', '🌿',
    '🌱', '🪴', '🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸',
    '🐵', '🦄', '🐢', '🐙', '🐳', '🐬', '🍎', '🍌', '🍓', '🍒',
    '🥑', '🥦', '🥕', '🥗', '🍕', '🍣', '🍜', '🍪', '🍫', '🍵',
    '☕️', '🧃', '💧', '🚰', '🎧', '🎵', '🎨', '🎬', '📷', '📚',
    '✍️', '📝', '✅', '📌', '📍', '📅', '⏰', '🧭', '🎯', '🏆',
    '🏅', '⚽️', '🏀', '🏐', '🎾', '🚴', '🏋️', '🧗', '🏊', '✈️'
  ]
  const emojiChunks = []
  for (let i = 0; i < emojiOptions.length; i += 30) {
    emojiChunks.push(emojiOptions.slice(i, i + 30))
  }
  const sortedRepeatDays = repeatOptions.filter((day) => habitData.repeatDays.includes(day))
  const repeatLabel = sortedRepeatDays.length
    ? sortedRepeatDays.join(', ')
    : 'Выберите дни'
  const isSubmitDisabled = habitData.name.trim().length === 0
  const canAddReminder = habitData.reminderTimes.length < 3

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, 300)
  }

  const handleSubmit = () => {
    if (isSubmitDisabled) return

    if (mode === 'edit') {
      if (onSave) {
        onSave(habitData)
      }
    } else if (onAdd) {
      onAdd(habitData)
    }
    handleClose()
  }

  const handleDelete = () => {
    if (onDelete && habitData.id != null) {
      onDelete(habitData.id)
    }
    handleClose()
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    if (mode === 'edit' && initialData) {
      const repeatDays = initialData.repeatDays || defaultHabitData.repeatDays
      const repeatType = repeatDays.join(', ')
      setHabitData({
        ...defaultHabitData,
        ...initialData,
        id: initialData.id,
        name: initialData.title ?? initialData.name ?? defaultHabitData.name,
        category: initialData.category ?? defaultHabitData.category,
        icon: initialData.icon ?? defaultHabitData.icon,
        repeatDays,
        repeatType,
        reminderTimes: initialData.reminderTimes?.length
          ? initialData.reminderTimes
          : defaultHabitData.reminderTimes
      })
      return
    }

    setHabitData(defaultHabitData)
  }, [isOpen, mode, initialData])

  useEffect(() => {
    if (!openDropdown) return

    const handleClickOutside = (event) => {
      const categoryNode = categoryRef.current
      const repeatNode = repeatRef.current
      const emojiNode = emojiRef.current

      if (
        categoryNode &&
        categoryNode.contains(event.target)
      ) {
        return
      }

      if (
        repeatNode &&
        repeatNode.contains(event.target)
      ) {
        return
      }

      if (
        emojiNode &&
        emojiNode.contains(event.target)
      ) {
        return
      }

      setOpenDropdown(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openDropdown])

  if (!isOpen && !isClosing) return null

  return (
    <div className={`modal-overlay ${isClosing ? 'modal-overlay--closing' : ''}`} onClick={handleClose}>
      <div className={`add-habit-modal ${isClosing ? 'add-habit-modal--closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="add-habit-modal__scrollable">
          <div className="add-habit-modal__header">
            <button className="add-habit-modal__back" onClick={handleClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#040415" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h2 className="add-habit-modal__title">
              {mode === 'edit' ? 'Редактировать привычку' : 'Новая привычка'}
            </h2>
          </div>

          <div className="add-habit-modal__content">
          {/* Название и иконка */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Название и иконка</label>
            <div className="add-habit-modal__icon-field" ref={emojiRef}>
              <div className="add-habit-modal__input-group">
                <button
                  type="button"
                  className="add-habit-modal__icon-picker"
                  onClick={() => setOpenDropdown(openDropdown === 'emoji' ? null : 'emoji')}
                  aria-label="Выбрать эмодзи"
                >
                  <span className="add-habit-modal__icon">{habitData.icon}</span>
                </button>
                <input
                  type="text"
                  className="add-habit-modal__input"
                  placeholder="Введите название"
                  value={habitData.name}
                  onChange={(e) => setHabitData({ ...habitData, name: e.target.value })}
                />
              </div>
              {openDropdown === 'emoji' && (
                <div className="add-habit-modal__emoji-dropdown">
                  {emojiChunks.map((chunk, index) => (
                    <div key={`emoji-page-${index}`} className="add-habit-modal__emoji-page">
                      {chunk.map((emoji) => (
                        <button
                          key={`${emoji}-${index}`}
                          type="button"
                          className={`add-habit-modal__emoji-item ${habitData.icon === emoji ? 'add-habit-modal__emoji-item--active' : ''}`}
                          onClick={() => {
                            setHabitData({ ...habitData, icon: emoji })
                            setOpenDropdown(null)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Категория */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Категория</label>
            <div className="add-habit-modal__dropdown" ref={categoryRef}>
              <button
                type="button"
                className="add-habit-modal__dropdown-trigger"
                onClick={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
              >
                <span>{habitData.category}</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="#A2ACB0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {openDropdown === 'category' && (
                <div className="add-habit-modal__dropdown-menu">
                  {['Здоровье', 'Образование', 'Спорт'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`add-habit-modal__dropdown-item ${habitData.category === option ? 'add-habit-modal__dropdown-item--active' : ''}`}
                      onClick={() => {
                        setHabitData({ ...habitData, category: option })
                        setOpenDropdown(null)
                      }}
                    >
                      <span>{option}</span>
                      {habitData.category === option && (
                        <svg className="add-habit-modal__dropdown-check" width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M20 6L9 17L4 12" stroke="#147BFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Повторяемость */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Повторяемость</label>
            <div className="add-habit-modal__dropdown" ref={repeatRef}>
              <button
                type="button"
                className="add-habit-modal__dropdown-trigger"
                onClick={() => setOpenDropdown(openDropdown === 'repeat' ? null : 'repeat')}
              >
                <span>{repeatLabel}</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="#A2ACB0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {openDropdown === 'repeat' && (
                <div className="add-habit-modal__dropdown-menu">
                  {repeatOptions.map((option) => {
                    const isActive = habitData.repeatDays.includes(option)
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`add-habit-modal__dropdown-item ${isActive ? 'add-habit-modal__dropdown-item--active' : ''}`}
                        onClick={() => {
                          const nextDays = isActive
                            ? habitData.repeatDays.filter((day) => day !== option)
                            : [...habitData.repeatDays, option]
                          const nextSortedDays = repeatOptions.filter((day) => nextDays.includes(day))
                          setHabitData({
                            ...habitData,
                            repeatDays: nextSortedDays,
                            repeatType: nextSortedDays.join(', ')
                          })
                        }}
                      >
                        <span>{option}</span>
                        {isActive && (
                          <svg className="add-habit-modal__dropdown-check" width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17L4 12" stroke="#147BFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Цель */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Цель</label>
            <div className="add-habit-modal__goal">
              <div className="add-habit-modal__goal-number">
                <input
                  type="number"
                  className="add-habit-modal__goal-input"
                  value={habitData.goal}
                  min="1"
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10)
                    setHabitData({
                      ...habitData,
                      goal: Number.isNaN(nextValue) ? '' : Math.max(1, nextValue)
                    })
                  }}
                  onBlur={() => {
                    if (habitData.goal === '') {
                      setHabitData({ ...habitData, goal: 1 })
                    }
                  }}
                />
              </div>
              <span className="add-habit-modal__goal-text">раз в день</span>
            </div>
          </div>

          {/* Напоминания */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Напоминания</label>
            <div className="add-habit-modal__reminder">
              <div className="add-habit-modal__reminder-header">
                <p className="add-habit-modal__reminder-text">
                  Мы будем присылать напоминания о привычке в Telegram-бота в это время:
                </p>
                <label className="add-habit-modal__toggle">
                  <input
                    type="checkbox"
                    checked={habitData.reminder}
                    onChange={(e) => setHabitData({ ...habitData, reminder: e.target.checked })}
                  />
                  <span className="add-habit-modal__toggle-slider"></span>
                </label>
              </div>
              {habitData.reminderTimes.map((timeValue, index) => (
                <div key={`reminder-${index}`} className="add-habit-modal__time">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.6665 7.99992C14.6665 11.6826 11.6819 14.6666 7.99986 14.6666C4.31786 14.6666 1.33319 11.6826 1.33319 7.99992C1.33319 4.31859 4.31786 1.33325 7.99986 1.33325C11.6819 1.33325 14.6665 4.31859 14.6665 7.99992Z" fill="white"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M10.3824 10.5429C10.295 10.5429 10.207 10.5203 10.1264 10.4729L7.50902 8.91161C7.35835 8.82094 7.26569 8.65761 7.26569 8.48161V5.11694C7.26569 4.84094 7.48969 4.61694 7.76569 4.61694C8.04169 4.61694 8.26569 4.84094 8.26569 5.11694V8.19761L10.639 9.61294C10.8757 9.75494 10.9537 10.0616 10.8124 10.2989C10.7184 10.4556 10.5524 10.5429 10.3824 10.5429Z" fill="#3843FF"/>
                  </svg>

                  <input
                    type="time"
                    className="add-habit-modal__time-input"
                    value={timeValue}
                    onChange={(e) => {
                      const nextTimes = habitData.reminderTimes.map((current, timeIndex) =>
                        timeIndex === index ? e.target.value : current
                      )
                      setHabitData({ ...habitData, reminderTimes: nextTimes })
                    }}
                  />
                  <button
                    className="add-habit-modal__time-delete"
                    type="button"
                    aria-label="Удалить напоминание"
                    onClick={() => {
                      const nextTimes = habitData.reminderTimes.filter((_, timeIndex) => timeIndex !== index)
                      setHabitData({ ...habitData, reminderTimes: nextTimes })
                    }}
                  >
<svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.875 11.25C1.53125 11.25 1.23698 11.1276 0.992187 10.8828C0.747396 10.638 0.625 10.3438 0.625 10V1.875H0V0.625H3.125V0H6.875V0.625H10V1.875H9.375V10C9.375 10.3438 9.2526 10.638 9.00781 10.8828C8.76302 11.1276 8.46875 11.25 8.125 11.25H1.875ZM3.125 8.75H4.375V3.125H3.125V8.75ZM5.625 8.75H6.875V3.125H5.625V8.75Z" fill="#707579"/>
</svg>

                  </button>
                </div>
              ))}
            </div>
            {canAddReminder && (
              <button
                className="add-habit-modal__add-reminder"
                type="button"
                onClick={() => {
                  const nextTimes = [...habitData.reminderTimes, '09:30']
                  setHabitData({ ...habitData, reminderTimes: nextTimes })
                }}
              >
                Добавить напоминание ({habitData.reminderTimes.length}/3)
              </button>
            )}
          </div>

          {/* Видимость */}
          <div className="add-habit-modal__section">
            <label className="add-habit-modal__label">Видимость</label>
            <div
              className={`add-habit-modal__visibility-toggle ${habitData.visibility === 'Приватный' ? 'add-habit-modal__visibility-toggle--private' : ''}`}
            >
              <span className="add-habit-modal__visibility-indicator" aria-hidden="true"></span>
              <button
                className={`add-habit-modal__visibility-option ${habitData.visibility === 'Публичный' ? 'add-habit-modal__visibility-option--active' : ''}`}
                onClick={() => setHabitData({ ...habitData, visibility: 'Публичный' })}
                type="button"
                aria-pressed={habitData.visibility === 'Публичный'}
              >
                Публичный
              </button>
              <button
                className={`add-habit-modal__visibility-option ${habitData.visibility === 'Приватный' ? 'add-habit-modal__visibility-option--active' : ''}`}
                onClick={() => setHabitData({ ...habitData, visibility: 'Приватный' })}
                type="button"
                aria-pressed={habitData.visibility === 'Приватный'}
              >
                Приватный
              </button>
            </div>
          </div>
          </div>
        </div>

        <div className="add-habit-modal__submit-wrapper">
          {mode === 'edit' ? (
            <div className="add-habit-modal__actions">
              <button
                className="add-habit-modal__delete"
                type="button"
                onClick={handleDelete}
              >
                Удалить
              </button>
              <button
                className="add-habit-modal__submit"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                Сохранить
              </button>
            </div>
          ) : (
            <button
              className="add-habit-modal__submit"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              Добавить привычку
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default HabitModal
