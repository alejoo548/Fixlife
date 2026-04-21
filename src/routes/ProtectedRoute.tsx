import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  AUTH_SESSION_CHANGED_EVENT,
  AuthRole,
  AuthSessionScope,
  hasRole,
  isAuthenticated,
} from '../utils/session';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallbackPath?: string;
  role?: AuthRole;
  scope?: AuthSessionScope;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackPath = '/',
  role,
  scope = 'client',
}) => {
  const location = useLocation();
  const [, setSessionVersion] = useState(0);

  useEffect(() => {
    const refreshSession = () => setSessionVersion((version) => version + 1);

    window.addEventListener('storage', refreshSession);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refreshSession);
    window.addEventListener('pageshow', refreshSession);
    window.addEventListener('focus', refreshSession);

    return () => {
      window.removeEventListener('storage', refreshSession);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refreshSession);
      window.removeEventListener('pageshow', refreshSession);
      window.removeEventListener('focus', refreshSession);
    };
  }, []);

  const allowed = isAuthenticated(scope) && (!role || hasRole(role, scope));

  if (!allowed) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
