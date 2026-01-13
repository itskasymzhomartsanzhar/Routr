import { useState } from 'react'
import CalendarStrip from '../../components/organisms/CalendarStrip/CalendarStrip.jsx'
import FloatingAction from '../../components/organisms/FloatingAction/FloatingAction.jsx'
import HabitsSection from '../../components/organisms/HabitsSection/HabitsSection.jsx'
import Header from '../../components/organisms/Header/Header.jsx'
import LevelCard from '../../components/organisms/LevelCard/LevelCard.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import HabitModal from '../../components/organisms/HabitModal/HabitModal.jsx'
import HabitDetailsModal from '../../components/organisms/HabitDetailsModal/HabitDetailsModal.jsx'
import './Home.scss'


const Home = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [activeHabit, setActiveHabit] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [habits, setHabits] = useState([
    {
      id: 1,
      title: 'Медитация 10 минут',
      category: 'Здоровье',
      icon: '🧘‍♂️',
      completed: true,
      progress: 100,
      step: 10,
      currentSteps: 10,
      totalSteps: 10
    },
    {
      id: 2,
      title: 'Прочитать 10 страниц',
      category: 'Образование',
      icon: '📚',
      completed: false,
      progress: 35,
      step: 10,
      currentSteps: 3,
      totalSteps: 10
    },
    {
      id: 3,
      title: 'Прочитать статью',
      category: 'Образование',
      icon: '📚',
      completed: false,
      progress: 0,
      step: 10,
      currentSteps: 0,
      totalSteps: 10
    }
  ])

  const handleAddHabit = (habitData) => {
    const totalSteps = habitData.goal || 1
    setHabits((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: habitData.name,
        category: habitData.category,
        icon: habitData.icon,
        completed: false,
        progress: 0,
        step: totalSteps,
        currentSteps: 0,
        totalSteps
      }
    ])
  }

  const handleSaveHabit = (habitData) => {
    setHabits((prev) =>
      prev.map((habit) =>
        habit.id === habitData.id
          ? {
              ...habit,
              title: habitData.name,
              category: habitData.category,
              icon: habitData.icon
            }
          : habit
      )
    )
  }

  const handleDeleteHabit = (id) => {
    setHabits((prev) => prev.filter((habit) => habit.id !== id))
  }

  const handleToggleHabit = (id) => {
    setHabits((prev) =>
      prev.map((habit) => {
        if (habit.id !== id) return habit
        if (habit.completed) return habit

        const newCurrentSteps = habit.currentSteps + 1
        const newProgress = (newCurrentSteps / habit.totalSteps) * 100

        if (newCurrentSteps >= habit.totalSteps) {
          return {
            ...habit,
            currentSteps: habit.totalSteps,
            progress: 100,
            completed: true
          }
        }

        return {
          ...habit,
          currentSteps: newCurrentSteps,
          progress: newProgress
        }
      })
    )
  }

  const handleSkipHabit = (id) => {
    setHabits((prev) => prev.filter((habit) => habit.id !== id))
  }

  const handleOpenCreate = () => {
    setModalMode('create')
    setActiveHabit(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (habit) => {
    setModalMode('edit')
    setActiveHabit(habit)
    setIsModalOpen(true)
  }

  const handleOpenDetails = (habit) => {
    setActiveHabit(habit)
    setIsDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
  }

  const handleEditFromDetails = (habit) => {
    handleOpenEdit(habit)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setActiveHabit(null)
    setModalMode('create')
  }

  return (
    <div className="home">
      <Header userName="Mikhail" />
      <LevelCard title="Исследователь" level={10} currentXP={1000} maxXP={5000} />
      <CalendarStrip />
      <HabitsSection
        habits={habits}
        onToggleHabit={handleToggleHabit}
        onSkipHabit={handleSkipHabit}
        onEditHabit={handleOpenEdit}
        onOpenDetails={handleOpenDetails}
      >
        <FloatingAction onClick={handleOpenCreate} />
      </HabitsSection>
      <BottomNav />
      <HabitModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onAdd={handleAddHabit}
        onSave={handleSaveHabit}
        onDelete={handleDeleteHabit}
        mode={modalMode}
        initialData={activeHabit}
      />
      <HabitDetailsModal
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        onEdit={handleEditFromDetails}
        habit={activeHabit}
      />
    </div>
  )
}

export default Home
