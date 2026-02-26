import { useEffect, useState } from 'react'
import BottomNav from '../../components/organisms/Menu/Menu.jsx'
import placeholderImage from '../../assets/placeholder.png'
import ENDPOINTS from '../../utils/endpoints'
import { request } from '../../utils/api'
import { useAppData } from '../../contexts/AppDataContext.jsx'
import './Shop.scss'

const Shop = () => {
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
