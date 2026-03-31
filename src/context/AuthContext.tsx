import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  AUTH_SESSION_CHANGED_EVENT,
  clearAuthSession,
  getAuthUser,
  getToken,
  setAuthSession,
  updateStoredAuthUser,
} from '../utils/session';

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  login: (user: any, token: string) => void;
  logout: () => void;
  updateUser: (nextUser: any) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const readStoredUser = () => {
  const storedToken = getToken('client');
  const storedUser = getAuthUser('client');
  if (!storedToken || !storedUser) return null;
  return storedUser;
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
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncUserFromStorage);
    window.addEventListener('popstate', syncUserFromStorage);
    window.addEventListener('pageshow', syncUserFromStorage);
    window.addEventListener('focus', syncUserFromStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', syncUserFromStorage);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncUserFromStorage);
      window.removeEventListener('popstate', syncUserFromStorage);
      window.removeEventListener('pageshow', syncUserFromStorage);
      window.removeEventListener('focus', syncUserFromStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const login = (user: any, token: string) => {
    setAuthSession(user, token, 'client');
    setUser(user);
  };

  const logout = () => {
    clearAuthSession('client');
    setUser(null);
  };

  const updateUser = (nextUser: any) => {
    updateStoredAuthUser(nextUser, 'client');
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
