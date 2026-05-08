import { API_ENDPOINTS } from '../config/api';

interface FetchLikeResponse<T = any> {
  data: T;
}

interface FetchLikeError {
  response?: { data?: any };
  message: string;
}

const request = async <T = any>(
  url: string,
  options: RequestInit = {},
): Promise<FetchLikeResponse<T>> => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err: FetchLikeError = {
      response: { data },
      message: data?.error || data?.message || `Request failed (${res.status})`,
    };
    throw err;
  }

  return { data } as FetchLikeResponse<T>;
};

const jsonHeaders = (token?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
});

export const forgotPassword = (email: string) =>
  request(API_ENDPOINTS.auth.forgotPassword, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email }),
  });

export const resetPassword = (email: string, token: string, newPassword: string) =>
  request(API_ENDPOINTS.auth.resetPassword, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, token, newPassword }),
  });

export const verifyResetToken = (email: string, token: string) =>
  request(API_ENDPOINTS.auth.verifyResetToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, token }),
  });

export const uploadProfileImage = (file: File, token: string) => {
  const formData = new FormData();
  formData.append('profile_image', file);
  return request(API_ENDPOINTS.auth.uploadProfileImage, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
};

export const removeProfileImage = (token: string) =>
  request(API_ENDPOINTS.auth.removeProfileImage, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

export const updateProfile = (
  payload: { name: string; lastname: string; phone_number: string; username: string },
  token: string,
) =>
  request(API_ENDPOINTS.auth.updateProfile, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
