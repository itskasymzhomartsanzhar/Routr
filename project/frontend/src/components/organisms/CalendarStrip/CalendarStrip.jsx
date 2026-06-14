import { useEffect, useMemo, useRef } from 'react'
import './CalendarStrip.scss'

const CalendarStrip = ({ selectedDate, onSelectDate }) => {
  const stripRef = useRef(null)
  const hasPositionedRef = useRef(false)

  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const shiftMonth = (date, amount) => {
    const shifted = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
    const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate()
    shifted.setDate(Math.min(date.getDate(), lastDay))
    return shifted
  }

  const today = new Date()
  const activeDate = selectedDate || formatLocalDate(today)

  const days = useMemo(() => {
    const weekdays = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
    const start = shiftMonth(current, -1)
    const end = shiftMonth(current, 1)
    const result = []

    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const fullDate = formatLocalDate(date)
      result.push({
        day: date.getDate(),
        weekday: weekdays[date.getDay()],
        fullDate,
        isToday: fullDate === formatLocalDate(current)
      })
    }

    return result
  }, [])

  useEffect(() => {
    const strip = stripRef.current
    const activeItem = strip?.querySelector(`[data-date="${activeDate}"]`)
    if (!strip || !activeItem) return

    const left = activeItem.offsetLeft - (strip.clientWidth - activeItem.offsetWidth) / 2
    strip.scrollTo({
      left: Math.max(left, 0),
      behavior: hasPositionedRef.current ? 'smooth' : 'auto'
    })
    hasPositionedRef.current = true
  }, [activeDate])

  return (
    <div className="calendar-strip" ref={stripRef}>
      {days.map((item) => (
        <button
          key={item.fullDate}
          type="button"
          data-date={item.fullDate}
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
