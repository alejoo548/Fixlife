export type AuthRole = 'worker' | 'admin';

export type AuthUser = {
  id_user?: number;
  name?: string;
  rol?: string;
  role?: string;
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

export const getAuthUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  return safeJsonParse<AuthUser>(localStorage.getItem('user'));
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  return token && token.trim() ? token : null;
};

export const isAuthenticated = (): boolean => {
  return Boolean(getToken() && getAuthUser());
};

const normalizeRole = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

export const hasRole = (role: AuthRole): boolean => {
  const user = getAuthUser();
  if (!user) return false;
  const currentRole = normalizeRole(user.rol ?? user.role);
  return currentRole === role;
};

export const clearAuthSession = (): void => {
  if (typeof window === 'undefined') return;

  const localKeysToClear = [
    'token',
    'user',
    'auth_token',
    'authToken',
    'worker_token',
    'workerToken',
    'admin_token',
    'adminToken',
    'currentUser',
    'workerUser',
    'adminUser',
  ];

  const sessionKeysToClear = [
    'token',
    'user',
    'auth_token',
    'authToken',
    'worker_token',
    'workerToken',
    'admin_token',
    'adminToken',
    'currentUser',
    'workerUser',
    'adminUser',
  ];

  localKeysToClear.forEach((key) => localStorage.removeItem(key));
  sessionKeysToClear.forEach((key) => sessionStorage.removeItem(key));
};
