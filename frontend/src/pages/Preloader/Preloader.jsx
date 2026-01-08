import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import './Preloader.scss'

const Preloader = () => {
  return (
    <div className="preloader">
      <div className="preloader__content">
        <div className="preloader__spinner" aria-label="Загрузка" role="status">
          <svg className="preloader__spinner-svg" viewBox="0 0 56 56">
            <circle className="preloader__spinner-track" cx="28" cy="28" r="22" />
            <circle className="preloader__spinner-fill" cx="28" cy="28" r="22" />
          </svg>
        </div>
        <div className="preloader__quote">
          «Никто тебе не друг, никто тебе не враг, но всякий человек тебе учитель», Сократ
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Preloader
