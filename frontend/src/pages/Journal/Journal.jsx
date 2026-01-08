import Header from '../../components/organisms/Header/Header.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import './Journal.scss'

const Journal = () => {
  const roles = [
    {
      id: 'novice',
      title: 'Новичок',
      level: 'Уровень 0',
      description: [
        'До 3 привычек',
        'Только приватные привычки',
        'Статистика до 30 дней'
      ],
      quests: '0/5 квестов',
      xp: '0XP',
      progress: 0.7,
      isCurrent: true
    },
    {
      id: 'researcher',
      title: 'Исследователь',
      level: 'Уровень 10',
      description: [
        'До 5 привычек',
        'Приватные и публичные привычки',
        'Статистика до 90 дней'
      ],
      quests: '0/100 квестов',
      xp: '10.000XP',

      progress: 0.1,
      isCurrent: false,
      isPremium: true
    }
  ]

  const quests = [
    {
      id: 1,
      title: 'Создайте первую публичную привычку',
      icon: '🌐',
      reward: '+1000XP',
      progress: 0.05,
      completed: false
    },
    {
      id: 2,
      title: 'Streak (3/3) дня',
      icon: '🔥',
      reward: '✓',
      progress: 1,
      completed: true
    },
    {
      id: 3,
      title: 'Поделись привычкой с другом',
      icon: '🔗',
      reward: '+1000XP',
      progress: 0.05,
      completed: false
    }
  ]

  return (
    <div className="journal">
      <div className="journal__content">
        <h2 className="journal__title">Квесты и должности</h2>

        <section className="journal__section">
          <div className="journal__section-title">Должности</div>
          <div className="journal__roles">
            {roles.map((role) => (
              <div key={role.id} className="journal__role-card">
                <div className="journal__role-header">
                  <div>
                    <div className="journal__role-title">{role.title}</div>
                    <div className="journal__role-level">{role.level}</div>
                  </div>
                  <div className="journal__role-header-actions">
                    {role.isCurrent && (
                      <div className="journal__role-current">Вы здесь</div>
                    )}
                    {role.isPremium && (
                      <button className="journal__role-premium" type="button">
                        Premium
                      </button>
                    )}
                  </div>
                </div>
                <div className="journal__role-description">
                  {role.description.map((line) => (
                    <div key={line} className="journal__role-line">{line}</div>
                  ))}
                </div>
                <div className="journal__role-tags">
                  <span className="journal__role-tag">{role.quests}</span>
                  {role.xp && <span className="journal__role-tag">{role.xp}</span>}
                </div>
                <div className="journal__role-progress">
                  <div
                    className="journal__role-progress-fill"
                    style={{ width: `${role.progress * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="journal__section">
          <div className="journal__section-title">Выполните квесты для повышения</div>
          <div className="journal__quests">
            {quests.map((quest) => (
              <div key={quest.id} className="journal__quest-card">
                <div className="journal__quest-icon">{quest.icon}</div>
                <div className="journal__quest-content">
                  <div className="journal__quest-title">{quest.title}</div>
                </div>
                <div className={`journal__quest-reward ${quest.completed ? 'journal__quest-reward--done' : ''}`}>
                  {quest.reward}
                </div>
                <div className="journal__quest-progress">
                  <div
                    className="journal__quest-progress-fill"
                    style={{ width: `${quest.progress * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <BottomNav />
    </div>
  )
}

export default Journal
