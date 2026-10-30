import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_BASE_URL, refreshAccessToken } from '@/lib/queryClient';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role?: 'customer' | 'admin';
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser, refreshToken?: string) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

function isTokenExpired(tokenString: string | null): boolean {
  if (!tokenString) return true;
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    // Expired or expiring within 60 seconds
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + 60000;
  } catch {
    return true;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem('authUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('authToken');
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Sync React state across components when token is refreshed by queryClient
  useEffect(() => {
    const handleSessionRestored = (e: any) => {
      const { token: newToken, user: newUser } = e.detail || {};
      if (newToken && newUser) {
        setToken(newToken);
        setUser(newUser);
      } else {
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener('auth:session_restored', handleSessionRestored as any);
    return () => {
      window.removeEventListener('auth:session_restored', handleSessionRestored as any);
    };
  }, []);

  const persistAuth = (newToken: string, newUser: AuthUser, newRefreshToken?: string) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
    if (newRefreshToken) {
      localStorage.setItem('authRefreshToken', newRefreshToken);
    }
  };

  const login = (newToken: string, newUser: AuthUser, newRefreshToken?: string) => {
    persistAuth(newToken, newUser, newRefreshToken);
  };

  const refreshSession = useCallback(async (): Promise<boolean> => {
    return refreshAccessToken();
  }, []);

  const logout = async () => {
    try {
      const storedRefreshToken = localStorage.getItem('authRefreshToken');
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(storedRefreshToken ? { 'x-refresh-token': storedRefreshToken } : {}),
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken || undefined }),
      });
    } catch {
      // ignore network errors on logout
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('authRefreshToken');
    window.dispatchEvent(
      new CustomEvent('auth:session_restored', { detail: { token: null, user: null } })
    );
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const currentToken = localStorage.getItem('authToken');
      const currentUser = localStorage.getItem('authUser');
      const currentRefreshToken = localStorage.getItem('authRefreshToken');

      // 1. If we have a fresh, unexpired access token and user, proceed immediately
      if (currentToken && currentUser && !isTokenExpired(currentToken)) {
        if (mounted) setIsLoading(false);
        return;
      }

      // 2. If no tokens exist at all, the user is a guest: avoid firing an unnecessary 401 refresh request
      if (!currentToken && !currentRefreshToken) {
        if (mounted) setIsLoading(false);
        return;
      }

      // 3. Otherwise (token missing or expired, but session was stored), attempt silent refresh
      try {
        const refreshed = await refreshAccessToken();
        if (!refreshed && mounted) {
          // Token expired and refresh failed: clear storage
          setToken(null);
          setUser(null);
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          localStorage.removeItem('authRefreshToken');
        }
      } catch {
        // Network error during startup, preserve current state
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
