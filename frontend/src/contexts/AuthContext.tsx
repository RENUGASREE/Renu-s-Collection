import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/queryClient';

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
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
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

  const persistAuth = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
  };

  const login = (newToken: string, newUser: AuthUser) => {
    console.log('AuthContext login called');
    console.log('New user:', newUser);
    console.log('New user role:', newUser.role);
    persistAuth(newToken, newUser);
  };

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;
      const json = await response.json();
      if (json.success && json.data?.accessToken && json.data?.user) {
        persistAuth(json.data.accessToken, json.data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // ignore network errors on logout
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  useEffect(() => {
    const init = async () => {
      if (token && user) {
        setIsLoading(false);
        return;
      }
      // Only attempt refresh if we have a token but no user (partial session)
      if (token && !user) {
        await refreshSession();
      }
      setIsLoading(false);
    };
    init();
  }, [refreshSession, token, user]);

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
