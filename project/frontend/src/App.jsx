import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import Preloader from './pages/Preloader/Preloader.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { useAppData } from './contexts/AppDataContext.jsx'
import './App.scss'

const Home = lazy(() => import('./pages/Home/Home.jsx'))
const Journal = lazy(() => import('./pages/Journal/Journal.jsx'))
const Shop = lazy(() => import('./pages/Shop/Shop.jsx'))
const Stats = lazy(() => import('./pages/Stats/Stats.jsx'))
const Profile = lazy(() => import('./pages/Profile/Profile.jsx'))
const Quests = lazy(() => import('./pages/Quests/Quests.jsx'))
const Purchases = lazy(() => import('./pages/Purchases/Purchases.jsx'))

function App() {
  const { loading: authLoading, user: authUser, updateProfile } = useAuth()
  const { loading: appDataLoading, bootstrap, setBootstrapData } = useAppData()
  const location = useLocation()
  const navigate = useNavigate()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isTutorialActive, setIsTutorialActive] = useState(false)
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const [tutorialTargetRect, setTutorialTargetRect] = useState(null)
  const [onboardingMarkedLocal, setOnboardingMarkedLocal] = useState(false)
  const highlightedElementRef = useRef(null)
  const scrolledStepRef = useRef(-1)
  const tutorialSteps = useMemo(
    () => [
      {
        path: '/',
        selector: '.calendar-strip',
        title: 'Календарь',
        text: 'В календаре вы можете смотреть привычки на каждый день.',
      },
      {
        path: '/',
        selector: '.habits-section',
        title: 'Привычки на день',
        text: 'Здесь находятся привычки на выбранный день. Отмечайте выполнение одним нажатием.',
      },
      {
        path: '/',
        selector: '.floating-action',
        title: 'Создание новых привычек',
        text: 'Нажмите на плюс, чтобы создать новую привычку.',
      },
      {
        path: '/profile',
        selector: '.profile__card',
        title: 'Профиль',
        text: 'Здесь отображаются ваш уровень, ранг и общий XP.',
      },
      {
        path: '/profile',
        selector: '.profile__balance',
        title: 'Баланс по категориям',
        text: 'Здесь видно количество выполненных привычек по категориям.',
      },
      {
        path: '/profile',
        selector: '.profile__icon-button[aria-label="Настройки"]',
        title: 'Настройки',
        text: 'Откройте настройки, чтобы управлять уведомлениями и приватностью.',
      },
      {
        path: '/',
        selector: '.habit-card',
        title: 'Просмотр привычки',
        text: 'В деталях привычки:\n• серая — привычки в этот день не было\n• фиолетовая — выполнена\n• черный круг — сегодняшний день\n• светлая точка — день привычки без выполнения\nТам же видно, сколько раз эту привычку выполнили друзья.',
      },
    ],
    []
  )
  const tutorialStep = tutorialSteps[tutorialStepIndex] ?? null
  const onboardingCompleted = Boolean(
    onboardingMarkedLocal || bootstrap?.user?.onboarding_completed || authUser?.onboarding_completed
  )

  useEffect(() => {
    if (authLoading || appDataLoading) return
    if (!onboardingCompleted) {
      setIsOnboardingOpen(true)
    }
  }, [authLoading, appDataLoading, onboardingCompleted])

  useEffect(() => {
    const handler = () => setIsOnboardingOpen(true)
    window.addEventListener('routr:open-onboarding', handler)
    return () => window.removeEventListener('routr:open-onboarding', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isOnboardingOpen || isTutorialActive ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOnboardingOpen, isTutorialActive])

  const persistOnboardingCompleted = async () => {
    if (onboardingCompleted) return
    setOnboardingMarkedLocal(true)
    setBootstrapData((prev) => ({
      ...prev,
      user: prev?.user ? { ...prev.user, onboarding_completed: true } : prev?.user,
    }))
    try {
      await updateProfile({ onboarding_completed: true })
    } catch {
      return
    }
  }

  const handleSkipOnboarding = () => {
    setIsOnboardingOpen(false)
    persistOnboardingCompleted()
  }

  const handleStartOnboarding = () => {
    setIsOnboardingOpen(false)
    persistOnboardingCompleted()
    setTutorialStepIndex(0)
    setIsTutorialActive(true)
  }

  useEffect(() => {
    if (!isTutorialActive || !tutorialStep) return
    if (location.pathname !== tutorialStep.path) {
      navigate(tutorialStep.path)
    }
  }, [isTutorialActive, tutorialStep, location.pathname, navigate])

  useEffect(() => {
    if (!isTutorialActive || !tutorialStep) return undefined

    const clearHighlight = () => {
      if (highlightedElementRef.current) {
        highlightedElementRef.current.classList.remove('tutorial-target-active')
        highlightedElementRef.current = null
      }
    }

    const updateTarget = () => {
      if (!tutorialStep.selector) {
        clearHighlight()
        setTutorialTargetRect(null)
        return
      }
      const element = document.querySelector(tutorialStep.selector)
      if (!element) {
        clearHighlight()
        setTutorialTargetRect(null)
        return
      }
      if (highlightedElementRef.current !== element) {
        clearHighlight()
        element.classList.add('tutorial-target-active')
        highlightedElementRef.current = element
      }
      const rect = element.getBoundingClientRect()
      setTutorialTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      })

      if (scrolledStepRef.current !== tutorialStepIndex) {
        scrolledStepRef.current = tutorialStepIndex
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }

    updateTarget()
    const timerId = window.setInterval(updateTarget, 250)
    const onLayoutChange = () => updateTarget()
    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('scroll', onLayoutChange, true)

    return () => {
      window.clearInterval(timerId)
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('scroll', onLayoutChange, true)
      clearHighlight()
    }
  }, [isTutorialActive, tutorialStep, tutorialStepIndex])

  const handleFinishTutorial = () => {
    setIsTutorialActive(false)
    setTutorialStepIndex(0)
    setTutorialTargetRect(null)
  }

  const handleNextTutorial = () => {
    if (tutorialStepIndex >= tutorialSteps.length - 1) {
      handleFinishTutorial()
      return
    }
    setTutorialStepIndex((prev) => prev + 1)
  }

  if (authLoading || appDataLoading) {
    return <Preloader />
  }

  const getTooltipStyle = () => {
    if (!tutorialTargetRect || typeof window === 'undefined') {
      return {}
    }
    const tooltipWidth = Math.min(360, Math.max(280, window.innerWidth - 24))
    const centerX = tutorialTargetRect.left + tutorialTargetRect.width / 2
    const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, centerX - tooltipWidth / 2))
    const top = tutorialTargetRect.top + tutorialTargetRect.height + 12
    const clampedTop = Math.max(12, Math.min(window.innerHeight - 220, top))
    return {
      width: `${tooltipWidth}px`,
      left: `${left}px`,
      top: `${clampedTop}px`,
    }
  }

  return (
    <Suspense fallback={<Preloader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/purchases" element={<Purchases />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/quests" element={<Quests />} />
      </Routes>
      {isOnboardingOpen && (
        <div className="onboarding">
          <div className="onboarding__overlay" onClick={handleSkipOnboarding}></div>
          <div className="onboarding__card">
            <div className="onboarding__badge">Новичок</div>
            <h3 className="onboarding__title">Пройти обучение</h3>
            <p className="onboarding__text">
              Быстрый старт: как отмечать привычки, получать XP и участвовать в лидерборде.
            </p>
            <div className="onboarding__actions">
              <button className="onboarding__primary" type="button" onClick={handleStartOnboarding}>
                Пройти
              </button>
              <button className="onboarding__secondary" type="button" onClick={handleSkipOnboarding}>
                Нет, спасибо
              </button>
            </div>
          </div>
        </div>
      )}
      {isTutorialActive && tutorialStep && (
        <div className="tutorial" onClick={handleNextTutorial}>
          <div className="tutorial__overlay"></div>
          <div className="tutorial__tooltip" style={getTooltipStyle()}>
            <div className="tutorial__title">{tutorialStep.title}</div>
            <div className="tutorial__text">{tutorialStep.text}</div>
          </div>
        </div>
      )}
    </Suspense>
  )
}

export default App
