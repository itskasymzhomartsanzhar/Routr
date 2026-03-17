import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
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
  const { loading: authLoading } = useAuth()
  const { loading: appDataLoading } = useAppData()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const ONBOARDING_KEY = 'routr_onboarding_seen'
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Routr_bot'
  const onboardingUrl = import.meta.env.VITE_ONBOARDING_URL || `https://t.me/${botUsername}?start=onboarding`

  useEffect(() => {
    if (authLoading || appDataLoading) return
    const seen = localStorage.getItem(ONBOARDING_KEY)
    if (!seen) {
      setIsOnboardingOpen(true)
    }
  }, [authLoading, appDataLoading])

  useEffect(() => {
    const handler = () => setIsOnboardingOpen(true)
    window.addEventListener('routr:open-onboarding', handler)
    return () => window.removeEventListener('routr:open-onboarding', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isOnboardingOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOnboardingOpen])

  const handleSkipOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setIsOnboardingOpen(false)
  }

  const handleStartOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setIsOnboardingOpen(false)
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(onboardingUrl)
    } else {
      window.open(onboardingUrl, '_blank', 'noopener,noreferrer')
    }
  }

  if (authLoading || appDataLoading) {
    return <Preloader />
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
    </Suspense>
  )
}

export default App
