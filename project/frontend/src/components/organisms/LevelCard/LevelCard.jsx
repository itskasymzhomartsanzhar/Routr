import './LevelCard.scss'

const LevelCard = ({ title = 'Новичок', level = 1, currentLevel = 1, targetLevel = 10, currentXP = 0 }) => {
  const safeTarget = Math.max(Number(targetLevel) || 1, 1)
  const safeCurrent = Math.max(Number(currentLevel) || 0, 0)
  const clampedCurrent = Math.min(safeCurrent, safeTarget)
  const progress = (clampedCurrent / safeTarget) * 100

  return (
    <div className="level-card">
      <div className="level-card__header">
        <div className="level-card__info">
          <h3 className="level-card__title">{title}</h3>
          <p className="level-card__level">Уровень {level}</p>
        </div>
        <div className="level-card__xp">{currentXP}XP</div>
      </div>
      <div className="level-card__progress-bar">
        <div
          className="level-card__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export default LevelCard
