import { useState } from 'react'
import './CalendarStrip.scss'

const CalendarStrip = () => {
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0])

  // Генерируем 7 дней: вчера + сегодня + 5 дней вперед
  const generateDays = () => {
    const weekdays = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    const days = []

    // Начинаем со вчерашнего дня (-1) и генерируем 7 дней вперед
    for (let i = -1; i <= 10; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      days.push({
        day: date.getDate(),
        month: months[date.getMonth()],
        weekday: weekdays[date.getDay()],
        fullDate: date.toISOString().split('T')[0],
        isToday: i === 0
      })
    }

    return days
  }

  const days = generateDays()

  return (
    <div className="calendar-strip">
      {days.map((item, index) => (
        <button
          key={`${item.fullDate}-${index}`}
          className={`calendar-strip__day ${
            selectedDate === item.fullDate ? 'calendar-strip__day--active' : ''
          }`}
          onClick={() => setSelectedDate(item.fullDate)}
        >
          <span className="calendar-strip__date">{item.day}</span>
          <span className="calendar-strip__weekday">{item.weekday}</span>
        </button>
      ))}
    </div>
  )
}

export default CalendarStrip
