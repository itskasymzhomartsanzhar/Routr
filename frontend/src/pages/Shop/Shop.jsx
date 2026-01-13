import { useState } from 'react'
import Header from '../../components/organisms/Header/Header.jsx'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import boostEnergy from '../../assets/shop/boostenergy.png'
import boostXp from '../../assets/shop/boostxp.png'
import shieldIcon from '../../assets/shop/shit.png'
import addHabitIcon from '../../assets/shop/add1.png'
import './Shop.scss'

const Shop = () => {
  const [activeCurrency, setActiveCurrency] = useState('stars')
  const tabs = [
    { id: 'rub', label: '₽ RUB' },
    { id: 'stars', label: '⭐ Stars' }
  ]
  const products = [
    {
      id: 1,
      title: 'Бустер XP ×1.5\nна 7 дней',
      subtitle: 'Ускоряет повышение\nуровней',
      price: 149,
      icon: boostEnergy
    },
    {
      id: 2,
      title: 'Бустер XP ×1.5\nна 30 дней',
      subtitle: 'Ускоряет повышение\nуровней',
      price: 499,
      icon: boostEnergy
    },
    {
      id: 3,
      title: 'Бустер XP ×3\nна 7 дней',
      subtitle: 'Ускоряет повышение\nуровней',
      price: 299,
      icon: boostXp
    },
    {
      id: 4,
      title: 'Бустер XP ×3\nна 30 дней',
      subtitle: 'Ускоряет повышение\nуровней',
      price: 999,
      icon: boostXp
    },
    {
      id: 5,
      title: 'Щит для Streak,\n1 шт.',
      subtitle: 'Пропусти привычку, без\nпотери рекорда Streak',
      price: 99,
      icon: shieldIcon
    },
    {
      id: 6,
      title: 'Щит для Streak,\n5 шт.',
      subtitle: 'Пропусти привычку, без\nпотери рекорда Streak',
      price: 399,
      icon: shieldIcon
    },
    {
      id: 7,
      title: 'Дополнительная\nпривычка, 1 шт.',
      subtitle: 'Увеличивает лимит на\nсоздание привычек',
      price: 299,
      icon: addHabitIcon,
      full: true
    }
  ]
  const activeIndex = tabs.findIndex((tab) => tab.id === activeCurrency)
  const indicatorStyle = {
    transform: `translateX(${activeIndex * 100}%)`
  }
  const currencySymbol = activeCurrency === 'rub' ? '₽' : '⭐'

  return (
    <div className="shop">
      <div className="shop__content">
        <h2 className="shop__title">Магазин</h2>
        <div className="shop__tabs">
          <span className="shop__tab-indicator" style={indicatorStyle}></span>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`shop__tab ${activeCurrency === tab.id ? 'shop__tab--active' : ''}`}
              type="button"
              onClick={() => setActiveCurrency(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="shop__grid">
          {products.map((product) => (
            <div
              key={product.id}
              className="shop__card"
            >
              <div className="shop__card-icon">
                <img src={product.icon}  alt="" />
              </div>
              <div className="shop__card-title">{product.title}</div>
              <div className="shop__card-subtitle">{product.subtitle}</div>
              <div className="shop__card-price">
                {product.price} {currencySymbol}
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Shop
