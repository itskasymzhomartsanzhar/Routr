import './CalendarStrip.scss'

const CalendarStrip = ({ selectedDate, onSelectDate }) => {
  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const today = new Date()
  const activeDate = selectedDate || formatLocalDate(today)

  const generateDays = () => {
    const weekdays = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    const days = []

    for (let i = -1; i <= 10; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      days.push({
        day: date.getDate(),
        month: months[date.getMonth()],
        weekday: weekdays[date.getDay()],
        fullDate: formatLocalDate(date),
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
            activeDate === item.fullDate ? 'calendar-strip__day--active' : ''
          }`}
          onClick={() => onSelectDate?.(item.fullDate)}
        >
          <span className="calendar-strip__date">{item.day}</span>
          <span className="calendar-strip__weekday">{item.weekday}</span>
        </button>
      ))}
    </div>
  )
}

export default CalendarStrip
