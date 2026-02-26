import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../utils/api';
import { getTelegramInitData } from '../utils/telegram.js';

const AuthContext = createContext(undefined);

let authStartupPromise = null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const performTelegramLogin = async () => {
      const initData = getTelegramInitData();
      if (!initData) {
        throw new Error('Telegram initData is empty');
      }
      const response = await auth.telegram(initData);
      return response.user;
    };

    const runStartupAuth = async () => {
      if (authStartupPromise) {
        return authStartupPromise;
      }
      authStartupPromise = (async () => {
        if (auth.isAuthenticated()) {
          try {
            const userData = await auth.me();
            return userData;
          } catch (_err) {
            return performTelegramLogin();
          }
        }
        return performTelegramLogin();
      })().finally(() => {
        authStartupPromise = null;
      });
      return authStartupPromise;
    };

    const initAuth = async () => {
      if (auth.isAuthenticated()) {

        try {
          const userData = await runStartupAuth();
          if (!cancelled) {
            setUser(userData);
          }
        } catch (err) {
          console.error('Failed to load user:', err);
          try {
            await login();
          } catch (loginErr) {
            console.error('Login after me() failed:', loginErr);
          }
        }
      } else {
        try {
          const userData = await runStartupAuth();
          if (!cancelled) {
            setUser(userData);
          }
        } catch (loginErr) {
          console.error('Initial login failed:', loginErr);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    initAuth();

    const handleLogout = () => setUser(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => {
      cancelled = true;
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const login = async () => {
    try {
      setLoading(true);
      setError(null);

      const initData = getTelegramInitData();
      if (!initData) {
        throw new Error('Telegram initData is empty');
      }

      const response = await auth.telegram(initData);
      setUser(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      console.error('Login error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    auth.logout();
    setUser(null);
    setError(null);
  };

  const updateProfile = async (data) => {
    try {
      setError(null);
      const updatedUser = await auth.update(data);
      setUser(updatedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      login,
      logout,
      updateProfile,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
