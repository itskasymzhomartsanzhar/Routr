import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import './Preloader.scss'

const Preloader = () => {
  return (
    <div className="preloader">
      <div className="preloader__content" aria-label="Загрузка">
        <div className="preloader__logo">
          <img src="/logo.png" alt="Routr" />
        </div>
        <div className="preloader__name">Routr</div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Preloader
