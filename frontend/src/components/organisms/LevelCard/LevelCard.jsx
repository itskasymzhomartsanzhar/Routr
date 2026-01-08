import './LevelCard.scss'

const LevelCard = ({ title = 'Исследователь', level = 10, currentXP = 1000, maxXP = 5000 }) => {
  const progress = (currentXP / maxXP) * 100

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
