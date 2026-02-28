import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import placeholderImage from '../../assets/placeholder.png'
import ENDPOINTS from '../../utils/endpoints'
import { request } from '../../utils/api'
import './Purchases.scss'

const Purchases = () => {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadPurchases = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await request.get(ENDPOINTS.payments.my, { status: 'paid' })
        const rawItems = Array.isArray(data) ? data : data?.items || []
        if (!active) return
        setItems(rawItems)
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.detail || 'Не удалось загрузить покупки')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPurchases()
    return () => {
      active = false
    }
  }, [])

  const formatText = (value) => {
    if (!value) return ''
    return String(value).replace(/<br\s*\/?>/gi, '\n')
  }

  const formatDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const normalizedItems = useMemo(
    () =>
      (items || []).map((item) => {
        const product = item?.product || {}
        return {
          id: item?.id ?? `${product?.id || 'product'}-${item?.created_at || Math.random()}`,
          title: formatText(product?.name || 'Покупка'),
          subtitle: formatText(product?.description || ''),
          date: formatDate(item?.purchased_at || item?.paid_at || item?.created_at),
          image: product?.image || placeholderImage,
          status: item?.status || 'paid',
        }
      }),
    [items]
  )

  return (
    <div className="purchases">
      <div className="purchases__content">
        <div className="purchases__header">
          <button className="purchases__back" type="button" onClick={() => navigate(-1)} aria-label="Назад">
            <svg width="6" height="11" viewBox="0 0 6 11" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5.82452 9.95961C6.05778 10.1969 6.0586 10.5824 5.82633 10.8207C5.61519 11.0374 5.28411 11.0577 5.0504 10.8814L4.98343 10.8226L0.17548 5.93189C-0.0372109 5.71554 -0.0565591 5.37609 0.117444 5.13734L0.175446 5.06896L4.98339 0.177452C5.21664 -0.0598453 5.59402 -0.0590471 5.8263 0.179235C6.03746 0.395856 6.05601 0.734172 5.8824 0.972179L5.82455 1.04035L1.44095 5.50065L5.82452 9.95961Z"
                fill="#040415"
              />
            </svg>
          </button>
          <h2 className="purchases__title">Мои покупки</h2>
        </div>

        {loading && <div className="purchases__status">Загружаем покупки...</div>}
        {!loading && error && <div className="purchases__status purchases__status--error">{error}</div>}
        {!loading && !error && normalizedItems.length === 0 && (
          <div className="purchases__status">Покупок пока нет</div>
        )}

        {!loading && !error && normalizedItems.length > 0 && (
          <div className="purchases__grid">
            {normalizedItems.map((item) => (
              <div className="purchases__card" key={item.id}>
                <div className="purchases__card-icon">
                  <img src={item.image} alt="" />
                </div>
                <div className="purchases__card-title">{item.title}</div>
                {item.subtitle && <div className="purchases__card-subtitle">{item.subtitle}</div>}
                {item.date && (
                  <div className="purchases__card-date">
                    <span className="purchases__card-date-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M14.6663 7.99992C14.6663 11.6826 11.6817 14.6666 7.99967 14.6666C4.31767 14.6666 1.33301 11.6826 1.33301 7.99992C1.33301 4.31859 4.31767 1.33325 7.99967 1.33325C11.6817 1.33325 14.6663 4.31859 14.6663 7.99992"
                          fill="white"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M10.3823 10.5429C10.295 10.5429 10.207 10.5203 10.1263 10.4729L7.50896 8.91161C7.35829 8.82094 7.26562 8.65761 7.26562 8.48161V5.11694C7.26562 4.84094 7.48962 4.61694 7.76562 4.61694C8.04162 4.61694 8.26562 4.84094 8.26562 5.11694V8.19761L10.639 9.61294C10.8756 9.75494 10.9536 10.0616 10.8123 10.2989C10.7183 10.4556 10.5523 10.5429 10.3823 10.5429"
                          fill="#3843FF"
                        />
                      </svg>
                    </span>
                    <span className="purchases__card-date-text">{item.date}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Purchases
