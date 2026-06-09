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

const toBalanceMap = (balance) => {
  const output = {}
  ;(balance?.items || []).forEach((item) => {
    if (!item?.label) return
    output[item.label] = (output[item.label] || 0) + Number(item.value || 0)
  })
  return output
}

const fromBalanceMap = (map) => {
  const items = Object.entries(map)
    .filter(([, value]) => Number(value || 0) >= 0)
    .map(([label, value]) => ({ label, value }))
  return {
    total: items.reduce((sum, item) => sum + Number(item.value || 0), 0),
    items
  }
}

export const mergeBalanceWithLiveHabits = (previousBalance, previousHabits, nextHabits, { publicOnly = false } = {}) => {
  const previousMap = toBalanceMap(previousBalance)
  const previousLiveMap = toBalanceMap(buildBalanceFromHabits(previousHabits, { publicOnly }))
  const nextLiveMap = toBalanceMap(buildBalanceFromHabits(nextHabits, { publicOnly }))
  const labels = new Set([
    ...Object.keys(previousMap),
    ...Object.keys(previousLiveMap),
    ...Object.keys(nextLiveMap)
  ])
  const merged = {}
  labels.forEach((label) => {
    const historical = Math.max((previousMap[label] || 0) - (previousLiveMap[label] || 0), 0)
    const value = historical + (nextLiveMap[label] || 0)
    if (value > 0 || label in nextLiveMap) {
      merged[label] = value
    }
  })
  return fromBalanceMap(merged)
}
