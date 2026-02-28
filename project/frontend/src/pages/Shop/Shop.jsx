import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import placeholderImage from '../../assets/placeholder.png'
import ENDPOINTS from '../../utils/endpoints'
import { request } from '../../utils/api'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import './Shop.scss'

const Shop = () => {
  const navigate = useNavigate()
  const [activeCurrency, setActiveCurrency] = useState('rub')
  const [products, setProducts] = useState([])
  const [payingProductId, setPayingProductId] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState({ type: null, message: '' })
  const { bootstrap, setBootstrapData } = useAppData()
  const tabs = [
    { id: 'rub', label: '₽ RUB' },
    { id: 'stars', label: '⭐ Stars' }
  ]
  const activeIndex = tabs.findIndex((tab) => tab.id === activeCurrency)
  const indicatorStyle = {
    transform: `translateX(${activeIndex * 100}%)`
  }

  useEffect(() => {
    if (Array.isArray(bootstrap?.products) && bootstrap.products.length) {
      setProducts(bootstrap.products)
      return
    }
    const loadProducts = async () => {
      try {
        const data = await request.get(ENDPOINTS.products.available)
        const items = Array.isArray(data) ? data : []
        setProducts(items)
        setBootstrapData((prev) => ({ ...prev, products: items }))
      } catch (error) {
        console.error('Failed to load products:', error)
      }
    }

    loadProducts()
  }, [bootstrap?.products, setBootstrapData])

  const currencySymbol = activeCurrency === 'rub' ? '₽' : '⭐'
  const activeCurrencyCode = activeCurrency === 'rub' ? 'RUB' : 'STARS'
  const visibleProducts = products.filter((product) => {
    const currency = (product.currency || '').toUpperCase()
    if (product?.is_premium) return false
    return currency === activeCurrencyCode
  })
  const formatText = (value) => {
    if (!value) return ''
    return String(value).replace(/<br\s*\/?>/gi, '\n')
  }
  const formatPrice = (value) => {
    if (value === null || value === undefined || value === '') return ''
    const numberValue = Number(value)
    if (Number.isNaN(numberValue)) return String(value)
    if (Number.isInteger(numberValue)) return String(numberValue)
    const fixed = numberValue.toFixed(2)
    return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed
  }

  const handleBuy = async (product) => {
    if (activeCurrency !== 'rub') {
      setPaymentStatus({ type: 'error', message: 'Для Stars оплата через Robokassa недоступна' })
      return
    }
    if (!product?.id || payingProductId) return
    setPayingProductId(product.id)
    setPaymentStatus({ type: null, message: '' })
    try {
      const result = await request.post(ENDPOINTS.payments.robokassaSendMessage, { product_id: product.id })
      if (result?.status === 'offer_sent') {
        setPaymentStatus({ type: 'success', message: 'Сообщение для оплаты отправлено в Telegram' })
      } else {
        setPaymentStatus({ type: 'success', message: 'Сообщение для оплаты отправлено в Telegram' })
      }
    } catch (error) {
      setPaymentStatus({
        type: 'error',
        message: error?.response?.data?.detail || 'Не удалось отправить сообщение в Telegram',
      })
    } finally {
      setPayingProductId(null)
    }
  }

  return (
    <div className="shop">
      <div className="shop__content">
        <h2 className="shop__title">Магазин</h2>
        <button className="shop__purchases" type="button" onClick={() => navigate('/shop/purchases')}>
          <span className="shop__purchases-left">
            <span className="shop__purchases-icon" aria-hidden="true">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 7.75C12 8.16421 12.3358 8.5 12.75 8.5C13.1642 8.5 13.5 8.16421 13.5 7.75V5.05859C15.767 5.41816 17.5 7.38183 17.5 9.75V14.75C17.5 17.3734 15.3734 19.5 12.75 19.5H4.75C2.12665 19.5 0 17.3734 0 14.75V9.75C0 7.38183 1.73299 5.41816 4 5.05859V7.75C4 8.16421 4.33579 8.5 4.75 8.5C5.16421 8.5 5.5 8.16421 5.5 7.75V5H12V7.75ZM8.75 0C11.3734 0 13.5 2.12665 13.5 4.75V5.05859C13.2557 5.01985 13.0052 5 12.75 5H12V4.75C12 2.95507 10.5449 1.5 8.75 1.5C6.95507 1.5 5.5 2.95507 5.5 4.75V5H4.75C4.49481 5 4.24429 5.01985 4 5.05859V4.75C4 2.12665 6.12665 0 8.75 0Z" fill="#707579"/>
</svg>

            </span>
            <span className="shop__purchases-text">Мои покупки</span>
          </span>
          <span className="shop__purchases-arrow" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6L15 12L9 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        {paymentStatus.message && (
          <div className={`shop__status shop__status--${paymentStatus.type || 'info'}`}>
            {paymentStatus.message}
          </div>
        )}
        <div className="shop__grid">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              className="shop__card"
            >
              <div className="shop__card-icon">
                <img src={product.image || placeholderImage} alt={product.name} />
              </div>
              <div className="shop__card-title" style={{ whiteSpace: 'pre-line' }}>
                {formatText(product.name)}
              </div>
              <div className="shop__card-subtitle" style={{ whiteSpace: 'pre-line' }}>
                {formatText(product.description)}
              </div>
              <button
                className="shop__card-price"
                type="button"
                onClick={() => handleBuy(product)}
                disabled={payingProductId === product.id}
              >
                {payingProductId === product.id ? 'Оформление...' : `${formatPrice(product.price)} ${currencySymbol}`}
              </button>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export default Shop
