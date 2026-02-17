import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { request } from '../utils/api'
import ENDPOINTS from '../utils/endpoints'
import { useAuth } from './AuthContext.jsx'

const AppDataContext = createContext(undefined)
let bootstrapInFlightPromise = null
let bootstrapInFlightToken = null

const EMPTY_BOOTSTRAP = {
  user: null,
  habits: [],
  categories: [],
  products: [],
  titles: [],
  quests: [],
  balance: { total: 0, items: [] },
  leaderboard: { range: 'month', items: [], me: null }
}

export const AppDataProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [bootstrap, setBootstrap] = useState(EMPTY_BOOTSTRAP)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadBootstrap = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return
    if (!silent) setLoading(true)
    try {
      const token = localStorage.getItem('access_token') || ''
      let data = null
      if (bootstrapInFlightPromise && bootstrapInFlightToken === token) {
        data = await bootstrapInFlightPromise
      } else {
        bootstrapInFlightToken = token
        bootstrapInFlightPromise = request.get(ENDPOINTS.app.bootstrap).finally(() => {
          bootstrapInFlightPromise = null
          bootstrapInFlightToken = null
        })
        data = await bootstrapInFlightPromise
      }
      setBootstrap({
        ...EMPTY_BOOTSTRAP,
        ...data,
        balance: data?.balance ?? EMPTY_BOOTSTRAP.balance,
        leaderboard: data?.leaderboard ?? EMPTY_BOOTSTRAP.leaderboard
      })
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setBootstrap(EMPTY_BOOTSTRAP)
      setLoading(false)
      return
    }
    loadBootstrap()
  }, [authLoading, isAuthenticated])

  const setBootstrapData = useCallback((updater) => {
    setBootstrap((prev) => {
      if (typeof updater === 'function') return updater(prev)
      return { ...prev, ...updater }
    })
  }, [])

  const value = useMemo(() => ({
    bootstrap,
    loading: authLoading || loading,
    error,
    refreshBootstrap: loadBootstrap,
    setBootstrapData
  }), [bootstrap, authLoading, loading, error, loadBootstrap, setBootstrapData])

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  )
}

export const useAppData = () => {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider')
  }
  return context
}
