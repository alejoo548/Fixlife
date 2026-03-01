export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  auth: {
    login: `${API_URL}/api/auth/login`,
    registerUser: `${API_URL}/api/auth/register-user`,
    registerWorker: `${API_URL}/api/auth/register/worker`,
  },
};
