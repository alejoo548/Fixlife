import { API_ENDPOINTS } from '../../../config/api';
import { getToken, logoutAuthSession } from '../../../utils/session';
import i18n from '../../../i18n';

export class AdminApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const request = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const token = getToken('admin');
  if (!token) {
    throw new AdminApiError(i18n.t('adminApi.sessionExpired'), 401);
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
      Authorization: `Bearer ${token || ''}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    logoutAuthSession('admin');
    window.dispatchEvent(new CustomEvent('fixlife:admin-session-expired'));
  }
  if (!response.ok) {
    throw new AdminApiError(payload.error || i18n.t('adminApi.requestFailed'), response.status);
  }
  return payload as T;
};

const GET_CACHE_TTL_MS = 15_000;
const getCache = new Map<string, { ts: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

const cachedGet = <T>(url: string, force = false): Promise<T> => {
  if (!force) {
    const cached = getCache.get(url);
    if (cached && Date.now() - cached.ts < GET_CACHE_TTL_MS) {
      return Promise.resolve(cached.data as T);
    }
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const promise = request<T>(url)
    .then((data) => {
      getCache.set(url, { ts: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
};

const invalidateGetCache = () => {
  getCache.clear();
  inflight.clear();
};

export const adminApi = {
  get: <T>(url: string, force = false) => cachedGet<T>(url, force),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)) }).then((res) => { invalidateGetCache(); return res; }),
  put: <T>(url: string, body: unknown) => request<T>(url, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }).then((res) => { invalidateGetCache(); return res; }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }).then((res) => { invalidateGetCache(); return res; }),
  invalidateCache: invalidateGetCache,
  endpoints: {
    ...API_ENDPOINTS.admin,
  },
};
