import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../../contexts/AppDataContext.jsx'
import ENDPOINTS from '../../../utils/endpoints.js'
import { request } from '../../../utils/api.js'
import { buildBalanceFromHabits } from '../../../utils/balance.js'
import { openTelegramShare } from '../../../utils/telegram.js'
import './PublicHabitModal.scss'

const PublicHabitModal = ({ isOpen, onClose, habit, author, onCopied }) => {
  const navigate = useNavigate()
  const { bootstrap, setBootstrapData } = useAppData()
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [copyStatus, setCopyStatus] = useState({ type: null, message: '' })
  const [isSharing, setIsSharing] = useState(false)
  const [shareStatus, setShareStatus] = useState({ type: null, message: '' })

  useEffect(() => {
    if (isOpen) {
      setIsShareOpen(false)
      setIsCopying(false)
      setCopyStatus({ type: null, message: '' })
    }
  }, [isOpen])

  const habitTitle = habit?.title || 'Привычка'
  const habitCategory = habit?.category || 'Категория'
  const habitIcon = habit?.icon || '✅'
  const habitFrequency = habit?.frequency || '1 раз в день'
  const habitDays = habit?.days || 'Понедельник, среда, пятница'
  const copiedCount = habit?.copied_count ?? habit?.copiedCount ?? 0
  const authorName = habit?.author?.name || author?.name || 'Автор'
  const authorAvatar = habit?.author?.avatar || author?.avatar
  const canCopy = !habit ? false : (typeof habit.can_copy === 'boolean' ? habit.can_copy : true)
  const currentUserId = bootstrap?.user?.id
  const authorId = habit?.author?.id ?? author?.id
  const isAuthor = Boolean(currentUserId && authorId && String(currentUserId) === String(authorId))

  if (!isOpen) return null

  const handleShareOpen = () => {
    setIsShareOpen(true)
  }

  const handleShareClose = () => {
    setIsShareOpen(false)
  }

  const encodePayload = (rawPayload) => (
    btoa(unescape(encodeURIComponent(rawPayload)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  )

  const handleShareToContacts = async () => {
    if (!habit?.id || isSharing) return
    setIsSharing(true)
    setShareStatus({ type: null, message: '' })
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'testproject3_bot'
    const rawPayload = `habit_${String(habit.id)}`
    const shareLink = `https://t.me/${botUsername}?start=${encodePayload(rawPayload)}`
    try {
      await request.post(ENDPOINTS.habits.share(habit.id))
      openTelegramShare({ url: shareLink, text: 'Посмотри эту привычку' })
      setShareStatus({ type: 'success', message: 'Ссылка отправлена через Telegram' })
    } catch {
      setShareStatus({ type: 'error', message: 'Не удалось поделиться' })
    } finally {
      setIsSharing(false)
    }
  }

  const handleShareCopyLink = async () => {
    if (!habit?.id || isSharing) return
    setIsSharing(true)
    setShareStatus({ type: null, message: '' })
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'testproject3_bot'
    const rawPayload = `habit_${String(habit.id)}`
    const shareLink = `https://t.me/${botUsername}?start=${encodePayload(rawPayload)}`
    try {
      await request.post(ENDPOINTS.habits.share(habit.id))
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = shareLink
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setShareStatus({ type: 'success', message: 'Ссылка на привычку скопирована' })
    } catch {
      setShareStatus({ type: 'error', message: 'Не удалось скопировать ссылку' })
    } finally {
      setIsSharing(false)
    }
  }

  const handleCopy = async () => {
    if (!habit?.id || !canCopy || isCopying) return
    setIsCopying(true)
    setCopyStatus({ type: null, message: '' })
    try {
      const copiedHabit = await request.post(ENDPOINTS.habits.copy, { habit_id: habit.id })
      setBootstrapData((prev) => {
        const prevHabits = Array.isArray(prev?.habits) ? prev.habits : []
        const nextHabits = [copiedHabit, ...prevHabits]
        const usePublicOnlyBalance = Boolean(prev?.user?.balance_wheel)
        return {
          ...prev,
          habits: nextHabits,
          balance: buildBalanceFromHabits(nextHabits, { publicOnly: usePublicOnlyBalance }),
        }
      })
      setCopyStatus({ type: 'success', message: 'Привычка успешно скопирована' })
      if (onCopied) {
        onCopied(habit.id)
      }
      onClose?.()
      navigate('/')
    } catch (error) {
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      if (status === 409) {
        setCopyStatus({ type: 'info', message: 'Вы уже скопировали эту привычку' })
      } else if (detail) {
        setCopyStatus({ type: 'error', message: detail })
      } else {
        setCopyStatus({ type: 'error', message: 'Не удалось скопировать привычку' })
      }
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className="public-habit-modal__overlay" onClick={onClose}>
      <div className="public-habit-modal__modal" onClick={(event) => event.stopPropagation()}>
        <div className="public-habit-modal__scroll">
          <div className="public-habit-modal__header">
            <button
              className="public-habit-modal__icon-button"
              type="button"
              aria-label="Назад"
              onClick={onClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#0F1F35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h2 className="public-habit-modal__title">Данные о привычке</h2>
            <button
              className="public-habit-modal__icon-button"
              type="button"
              aria-label="Поделиться"
              onClick={handleShareOpen}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 9V15C3 15.3978 3.15804 15.7794 3.43934 16.0607C3.72064 16.342 4.10218 16.5 4.5 16.5H13.5C13.8978 16.5 14.2794 16.342 14.5607 16.0607C14.842 15.7794 15 15.3978 15 15V9M12 4.5L9 1.5M9 1.5L6 4.5M9 1.5V11.25" stroke="#1E1E1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <section className="public-habit-modal__card">
            <div className="public-habit-modal__card-header">
              <div className="public-habit-modal__card-main">
                <div className="public-habit-modal__habit-icon">{habitIcon}</div>
                <div>
                  <div className="public-habit-modal__habit-title">{habitTitle}</div>
                  <div className="public-habit-modal__habit-category">{habitCategory}</div>
                </div>
              </div>
            </div>
            <div className="public-habit-modal__card-row">
              <span className="public-habit-modal__row-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8.83533 1.33325C9.00222 1.33325 9.13691 1.4704 9.13708 1.63892V3.78345C9.13719 5.00536 10.1326 6.00708 11.3431 6.00708C11.8395 6.00708 12.2384 6.01392 12.5394 6.01392C12.7453 6.01391 13.0829 6.01103 13.3646 6.00903C13.5322 6.00837 13.6663 6.14448 13.6664 6.31372V11.6682C13.6662 13.3247 12.3372 14.6662 10.6976 14.6663H5.44666C3.72712 14.6663 2.33344 13.2593 2.33337 11.5227V4.33911C2.33345 2.6839 3.66344 1.33334 5.30896 1.33325H8.83533ZM10.1752 1.93384C10.1754 1.64669 10.5238 1.50392 10.723 1.71118C11.4444 2.46052 12.7033 3.77185 13.4066 4.50317C13.601 4.70584 13.4587 5.04055 13.1781 5.04126C12.6301 5.04259 11.9846 5.04171 11.5199 5.03638C10.7826 5.0363 10.1752 4.42894 10.1752 3.69165V1.93384Z" fill="white"/>
                  <path d="M9.61157 9.92822C9.88557 9.92822 10.1086 10.1513 10.1086 10.4253C10.1086 10.6993 9.88556 10.9214 9.61157 10.9214H5.98267C5.70868 10.9214 5.48659 10.6993 5.48657 10.4253C5.48657 10.1513 5.70867 9.92822 5.98267 9.92822H9.61157ZM8.2395 6.59912C8.51338 6.59926 8.7356 6.82228 8.7356 7.09619C8.73538 7.36992 8.51325 7.59117 8.2395 7.59131H5.98267C5.7088 7.59131 5.48679 7.37001 5.48657 7.09619C5.48657 6.82219 5.70867 6.59912 5.98267 6.59912H8.2395Z" fill="#3843FF"/>
                </svg>
              </span>
              <span>{habitFrequency}</span>
            </div>
            <div className="public-habit-modal__card-row">
              <span className="public-habit-modal__row-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="16" height="16" rx="8" fill="white"/>
                  <path d="M5.99158 8.8457C6.17564 8.8457 6.32538 8.99469 6.32556 9.17871C6.32556 9.36289 6.17576 9.5127 5.99158 9.5127H4.79626L5.64197 10.3584C6.94509 11.6584 9.05466 11.6584 10.3578 10.3584C10.488 10.2282 10.6992 10.2282 10.8295 10.3584C10.9597 10.4886 10.9597 10.6998 10.8295 10.8301C9.26563 12.39 6.73411 12.3901 5.17029 10.8301L4.32458 9.98438V11.1797C4.32458 11.3639 4.17478 11.5137 3.9906 11.5137C3.80664 11.5134 3.65759 11.3637 3.65759 11.1797V9.17969C3.65759 9.16873 3.65846 9.15739 3.65955 9.14648C3.65998 9.14201 3.66089 9.13723 3.6615 9.13281C3.66238 9.12646 3.66318 9.11958 3.66443 9.11328C3.66543 9.10837 3.66615 9.10346 3.66736 9.09863C3.66871 9.0932 3.67061 9.0874 3.67224 9.08203C3.67375 9.07708 3.6754 9.07223 3.67712 9.06738C3.67897 9.06217 3.68089 9.05689 3.68298 9.05176C3.68484 9.04731 3.68681 9.04243 3.68884 9.03809C3.6914 9.0326 3.69379 9.02685 3.69666 9.02148C3.69882 9.01745 3.70215 9.0137 3.70447 9.00977C3.70759 9.00447 3.71079 8.99929 3.71423 8.99414C3.71699 8.99002 3.72008 8.98543 3.72302 8.98145C3.72644 8.97679 3.73006 8.97228 3.73376 8.96777C3.73859 8.9619 3.7432 8.95572 3.74841 8.9502L3.76208 8.93652C3.76771 8.93121 3.77369 8.92581 3.77966 8.9209C3.78395 8.91741 3.78893 8.91439 3.79333 8.91113C3.7975 8.90803 3.8017 8.90426 3.80603 8.90137C3.8108 8.8982 3.81579 8.89548 3.82068 8.89258C3.82499 8.89001 3.82991 8.88714 3.83435 8.88477L3.86365 8.87109C3.86814 8.86924 3.87276 8.86784 3.87732 8.86621C3.88285 8.86421 3.88925 8.86206 3.8949 8.86035C3.89937 8.85902 3.90407 8.8576 3.90857 8.85645C3.9144 8.85495 3.92019 8.85274 3.92615 8.85156C3.93116 8.85058 3.93673 8.85037 3.94177 8.84961C3.94728 8.84877 3.95277 8.8482 3.95837 8.84766C3.96679 8.84683 3.97532 8.84589 3.98376 8.8457H5.99158ZM5.17029 5.16992C6.7341 3.60992 9.26562 3.60997 10.8295 5.16992L11.6752 6.01562V4.82031C11.6752 4.63613 11.825 4.48633 12.0092 4.48633C12.1932 4.48653 12.3422 4.63626 12.3422 4.82031V6.82031C12.3422 6.83128 12.3413 6.84261 12.3402 6.85352C12.3398 6.85799 12.3389 6.86277 12.3383 6.86719C12.3374 6.8734 12.3365 6.87958 12.3353 6.88574C12.3343 6.89085 12.3336 6.89635 12.3324 6.90137C12.331 6.9068 12.3291 6.9126 12.3275 6.91797C12.326 6.92292 12.3244 6.92776 12.3226 6.93262C12.3208 6.93784 12.3189 6.94309 12.3168 6.94824C12.3149 6.95271 12.313 6.95755 12.3109 6.96191C12.3083 6.96741 12.306 6.97313 12.3031 6.97852C12.301 6.98251 12.2986 6.98634 12.2963 6.99023C12.2931 6.99563 12.289 7.00061 12.2855 7.00586C12.2828 7.00998 12.2797 7.01457 12.2767 7.01855C12.2734 7.02306 12.2705 7.02785 12.267 7.03223C12.2621 7.03811 12.2566 7.04427 12.2513 7.0498L12.2377 7.06348C12.2321 7.06876 12.226 7.07421 12.2201 7.0791C12.2158 7.08264 12.2109 7.08556 12.2064 7.08887C12.2023 7.09193 12.198 7.09576 12.1937 7.09863C12.1888 7.1019 12.1832 7.10442 12.1781 7.10742C12.1741 7.10982 12.1705 7.11301 12.1664 7.11523C12.1613 7.11797 12.156 7.1206 12.1508 7.12305L12.1215 7.13477C12.1164 7.13658 12.111 7.13807 12.1058 7.13965C12.1008 7.14118 12.0953 7.14227 12.0902 7.14355C12.0848 7.14492 12.0791 7.14734 12.0736 7.14844C12.0679 7.14955 12.0618 7.14957 12.056 7.15039C12.0512 7.15108 12.0462 7.15187 12.0414 7.15234C12.0307 7.1534 12.0199 7.15428 12.0092 7.1543H10.0082C9.82411 7.1543 9.67438 7.00531 9.67419 6.82129C9.67419 6.63711 9.824 6.4873 10.0082 6.4873H11.2035L10.3578 5.6416C9.05465 4.34162 6.94508 4.34157 5.64197 5.6416C5.51172 5.77185 5.30053 5.77185 5.17029 5.6416C5.04013 5.51135 5.04007 5.30014 5.17029 5.16992Z" fill="#3843FF"/>
                </svg>
              </span>
              <span>{habitDays}</span>
            </div>
          </section>

          <section className="public-habit-modal__section">
            <div className="public-habit-modal__section-title">Статистика</div>
            <div className="public-habit-modal__stat-card">
              <div className="public-habit-modal__stat-icon">👤</div>
              <div>
                <div className="public-habit-modal__stat-value">{copiedCount} человек</div>
                <div className="public-habit-modal__stat-label">скопировали к себе</div>
              </div>
            </div>
          </section>

          <section className="public-habit-modal__section">
            <div className="public-habit-modal__section-title">Автор</div>
            <div className="public-habit-modal__author-card">
              <div
                className="public-habit-modal__author-avatar"
                style={authorAvatar ? { backgroundImage: `url(${authorAvatar})` } : undefined}
              ></div>
              <div className="public-habit-modal__author-name">{authorName}</div>
            </div>
          </section>
        </div>
        <div className="public-habit-modal__footer">
          <button
            className="public-habit-modal__primary"
            type="button"
            onClick={handleCopy}
            disabled={!canCopy || isCopying}
          >
            {isAuthor
              ? 'Вы автор'
              : !canCopy
                ? 'Уже скопировано'
                : isCopying
                  ? 'Копируем...'
                  : 'Скопировать к себе'}
          </button>
          {copyStatus.message && (
            <div className="public-habit-modal__stat-label" style={{ marginTop: 8 }}>
              {copyStatus.message}
            </div>
          )}
        </div>
      </div>
      {isShareOpen && (
        <div
          className="public-habit-modal__share-overlay"
          onClick={(event) => {
            event.stopPropagation()
            handleShareClose()
          }}
        >
          <div
            className="public-habit-modal__share-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="public-habit-modal__share-title">Поделиться привычкой</h3>
            <p className="public-habit-modal__share-text">
              Вы сможете следить за прогрессом друзей, если пригласите их как соучастников
            </p>
            <button className="public-habit-modal__share-primary" type="button" onClick={handleShareToContacts}>
              {isSharing ? 'Отправляем...' : 'Отправить в Telegram'}
            </button>
            <button className="public-habit-modal__share-secondary" type="button" onClick={handleShareCopyLink}>
              Скопировать ссылку
            </button>
            {shareStatus.message && (
              <div className="public-habit-modal__stat-label" style={{ marginTop: 8 }}>
                {shareStatus.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PublicHabitModal
