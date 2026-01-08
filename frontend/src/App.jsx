import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home/Home.jsx'
import Journal from './pages/Journal/Journal.jsx'
import Shop from './pages/Shop/Shop.jsx'
import Stats from './pages/Stats/Stats.jsx'
import Profile from './pages/Profile/Profile.jsx'
import Preloader from './pages/Preloader/Preloader.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/journal" element={<Journal />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/preloader" element={<Preloader />} />
    </Routes>
  )
}

export default App
