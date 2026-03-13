import React, { createContext, useContext, useEffect, useState } from 'react';

import { clearAuthSession } from '../utils/session';

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  login: (user: any, token: string) => void;
  logout: () => void;
  updateUser: (nextUser: any) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const readStoredUser = () => {
  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  if (!storedToken || !storedUser) return null;

  try {
    return JSON.parse(storedUser);
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const syncUserFromStorage = () => {
      setUser(readStoredUser());
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncUserFromStorage();
      }
    };

    syncUserFromStorage();

    window.addEventListener('storage', syncUserFromStorage);
    window.addEventListener('popstate', syncUserFromStorage);
    window.addEventListener('pageshow', syncUserFromStorage);
    window.addEventListener('focus', syncUserFromStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', syncUserFromStorage);
      window.removeEventListener('popstate', syncUserFromStorage);
      window.removeEventListener('pageshow', syncUserFromStorage);
      window.removeEventListener('focus', syncUserFromStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const login = (user: any, token: string) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    setUser(user);
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
  };

  const updateUser = (nextUser: any) => {
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        updateUser
      }}
    >
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
