import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Preloader from './pages/Preloader/Preloader.jsx'

const Home = lazy(() => import('./pages/Home/Home.jsx'))
const Journal = lazy(() => import('./pages/Journal/Journal.jsx'))
const Shop = lazy(() => import('./pages/Shop/Shop.jsx'))
const Stats = lazy(() => import('./pages/Stats/Stats.jsx'))
const Profile = lazy(() => import('./pages/Profile/Profile.jsx'))

function App() {
  return (
    <Suspense fallback={<Preloader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Suspense>
  )
}

export default App
