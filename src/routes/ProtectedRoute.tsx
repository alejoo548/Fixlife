import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  AUTH_SESSION_CHANGED_EVENT,
  hasRole,
  isAuthenticated,
  rememberProtectedRoute,
} from '../utils/session';
import type { AuthRole, AuthSessionScope } from '../utils/session';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallbackPath?: string;
  role?: AuthRole;
  scope?: AuthSessionScope;
  lockHistory?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackPath = '/',
  role,
  scope = 'client',
  lockHistory = false,
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

  useEffect(() => {
    rememberProtectedRoute(scope, `${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search, scope]);

  useEffect(() => {
    if (!lockHistory) {
      return;
    }

    const lockedUrl = `${location.pathname}${location.search}${location.hash}`;
    const state = { fixlifeHistoryLock: true, lockedUrl };

    window.history.replaceState(state, '', lockedUrl);
    window.history.pushState(state, '', lockedUrl);

    const preventBackNavigation = () => {
      window.history.pushState(state, '', lockedUrl);
    };

    window.addEventListener('popstate', preventBackNavigation);

    return () => {
      window.removeEventListener('popstate', preventBackNavigation);
    };
  }, [location.hash, location.pathname, location.search, lockHistory]);

  const allowed = isAuthenticated(scope) && (!role || hasRole(role, scope));

  if (!allowed) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
