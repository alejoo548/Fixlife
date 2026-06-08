export type AuthRole = 'worker' | 'admin';
export type AuthSessionScope = 'client' | 'worker' | 'admin';
export const AUTH_SESSION_CHANGED_EVENT = 'fixlife-auth-changed';
const LAST_PROTECTED_ROUTE_KEY = 'fixlife:last-protected-route';

export type AuthUser = {
  id_user?: number;
  name?: string;
  rol?: string;
  role?: string;
  pending_worker?: number | boolean;
  worker_profile?: {
    is_verified?: unknown;
    dui_document?: string | null;
    cert_document?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const getStorageKeys = (scope: AuthSessionScope) => {
  if (scope === 'worker') {
    return {
      token: 'worker_token',
      user: 'workerUser',
      legacyToken: 'workerToken',
    };
  }

  if (scope === 'admin') {
    return {
      token: 'admin_token',
      user: 'adminUser',
      legacyToken: 'adminToken',
    };
  }

  return {
    token: 'token',
    user: 'user',
    legacyToken: 'authToken',
  };
};

export const getAuthUser = (scope: AuthSessionScope = 'client'): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  const keys = getStorageKeys(scope);
  return safeJsonParse<AuthUser>(localStorage.getItem(keys.user));
};

export const getToken = (scope: AuthSessionScope = 'client'): string | null => {
  if (typeof window === 'undefined') return null;
  const keys = getStorageKeys(scope);
  const token = localStorage.getItem(keys.token) || localStorage.getItem(keys.legacyToken);
  return token && token.trim() ? token : null;
};

export const isAuthenticated = (scope: AuthSessionScope = 'client'): boolean => {
  return Boolean(getToken(scope) && getAuthUser(scope));
};

const normalizeRole = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

export const hasRole = (role: AuthRole, scope: AuthSessionScope = 'client'): boolean => {
  const user = getAuthUser(scope);
  if (!user) return false;
  const currentRole = normalizeRole(user.rol ?? user.role);
  if (role === 'admin') {
    return currentRole === 'admin' || currentRole === 'root';
  }
  if (role === 'worker') {
    const pending = user.pending_worker === true || user.pending_worker === 1;
    return currentRole === role || pending;
  }
  return currentRole === role;
};

const notifyAuthSessionChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
};

export const setAuthSession = (user: AuthUser, token: string, scope: AuthSessionScope = 'client'): void => {
  if (typeof window === 'undefined') return;
  const keys = getStorageKeys(scope);
  localStorage.setItem(keys.user, JSON.stringify(user));
  localStorage.setItem(keys.token, token);
  notifyAuthSessionChanged();
};

export const updateStoredAuthUser = (nextUser: AuthUser, scope: AuthSessionScope = 'client'): void => {
  if (typeof window === 'undefined') return;
  const keys = getStorageKeys(scope);
  localStorage.setItem(keys.user, JSON.stringify(nextUser));
  notifyAuthSessionChanged();
};

export const clearAuthSession = (scope: AuthSessionScope = 'client'): void => {
  if (typeof window === 'undefined') return;

  const keys =
    scope === 'worker'
      ? ['worker_token', 'workerToken', 'workerUser']
      : scope === 'admin'
        ? ['admin_token', 'adminToken', 'adminUser']
        : ['token', 'user', 'auth_token', 'authToken', 'currentUser'];

  keys.forEach((key) => localStorage.removeItem(key));
  keys.forEach((key) => sessionStorage.removeItem(key));
  clearRememberedProtectedRoute(scope);
  notifyAuthSessionChanged();
};

export const logoutAuthSession = (scope: AuthSessionScope = 'client'): void => {
  clearAuthSession(scope);
};

type ProtectedRouteMap = Partial<Record<AuthSessionScope, string>>;

const readProtectedRouteMap = (): ProtectedRouteMap => {
  if (typeof window === 'undefined') return {};
  return safeJsonParse<ProtectedRouteMap>(sessionStorage.getItem(LAST_PROTECTED_ROUTE_KEY)) || {};
};

const writeProtectedRouteMap = (routes: ProtectedRouteMap): void => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LAST_PROTECTED_ROUTE_KEY, JSON.stringify(routes));
};

export const rememberProtectedRoute = (scope: AuthSessionScope, route: string): void => {
  if (typeof window === 'undefined' || !route.trim()) return;
  const routes = readProtectedRouteMap();
  routes[scope] = route;
  writeProtectedRouteMap(routes);
};

export const getRememberedProtectedRoute = (scope: AuthSessionScope): string | null => {
  const routes = readProtectedRouteMap();
  const route = routes[scope];
  return typeof route === 'string' && route.trim() ? route : null;
};

export const clearRememberedProtectedRoute = (scope: AuthSessionScope): void => {
  if (typeof window === 'undefined') return;
  const routes = readProtectedRouteMap();
  delete routes[scope];
  writeProtectedRouteMap(routes);
};
