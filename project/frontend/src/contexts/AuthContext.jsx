import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../utils/api';

const AuthContext = createContext(undefined);
const FALLBACK_INIT_DATA = 'query_id=AAHvA60xAgAAAO8DrTEMamYv&user=%7B%22id%22%3A5128389615%2C%22first_name%22%3A%22Sanzhar%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22swydk_dev%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FAPs6KkcX_RZkiglsv5HWS_kXH4fcAk9YWVxHA6rpf4Mg82VDcsNBFE0G9Y4daf6J.svg%22%7D&auth_date=1765282380&signature=9PpJeq4FTLzaslDkcc0yW1jHg1ZiBi5nn8QJ-kiCY4l1bKKLoNgYlPIR5Q4_5zKggs_u2iEkEtzdd-UvFDZQCQ&hash=1e3aca18444f3913fe8bd0b8c846621f2656ffebce193be00d3fd5a71511bb3b';

let authStartupPromise = null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const performTelegramLogin = async () => {
      if (!FALLBACK_INIT_DATA) {
        throw new Error('Telegram initData is empty');
      }
      const response = await auth.telegram(FALLBACK_INIT_DATA);
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

      if (!FALLBACK_INIT_DATA) {
        throw new Error('Telegram initData is empty');
      }

      const response = await auth.telegram(FALLBACK_INIT_DATA);
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
