export const buildBalanceFromHabits = (rawHabits, { publicOnly = false } = {}) => {
  const categoryTotals = {}
  ;(rawHabits || []).forEach((habit) => {
    if (publicOnly && habit?.visibility !== 'Публичный') return
    const categoryName = habit?.category?.name
    if (!categoryName) return
    if (!(categoryName in categoryTotals)) categoryTotals[categoryName] = 0
    const goal = Math.max(Number(habit?.goal || 1), 1)
    const completions = Array.isArray(habit?.completions) ? habit.completions : []
    completions.forEach((completion) => {
      if (Number(completion?.count || 0) >= goal) {
        categoryTotals[categoryName] += 1
      }
    })
  })
  const items = Object.entries(categoryTotals).map(([label, value]) => ({ label, value }))
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return { total, items }
}
