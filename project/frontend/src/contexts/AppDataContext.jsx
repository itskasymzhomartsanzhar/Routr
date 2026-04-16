import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { request } from '../utils/api'
import ENDPOINTS from '../utils/endpoints'
import { useAuth } from './AuthContext.jsx'

const AppDataContext = createContext(undefined)
let bootstrapInFlightPromise = null
let bootstrapInFlightToken = null

const forceHttpsDeep = (value) => {
  if (typeof value === 'string') {
    if (/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(value)) return value
    return value.replace(/^http:\/\//i, 'https://')
  }
  if (Array.isArray(value)) return value.map((item) => forceHttpsDeep(item))
  if (!value || typeof value !== 'object') return value
  const output = {}
  Object.entries(value).forEach(([key, item]) => {
    output[key] = forceHttpsDeep(item)
  })
  return output
}

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
      const securedData = forceHttpsDeep(data)
      setBootstrap({
        ...EMPTY_BOOTSTRAP,
        ...securedData,
        balance: securedData?.balance ?? EMPTY_BOOTSTRAP.balance,
        leaderboard: securedData?.leaderboard ?? EMPTY_BOOTSTRAP.leaderboard
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
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      return forceHttpsDeep(next)
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
