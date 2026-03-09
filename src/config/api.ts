export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  auth: {
    login: `${API_URL}/api/auth/login`,
    registerUser: `${API_URL}/api/auth/register-user`,
    registerWorker: `${API_URL}/api/auth/register/worker`,
    forgotPassword: `${API_URL}/api/auth/forgot-password`,
    verifyResetToken: `${API_URL}/api/auth/verify-reset-token`,
    resetPassword: `${API_URL}/api/auth/reset-password`,
    updateProfile: `${API_URL}/api/auth/profile`,
    uploadProfileImage: `${API_URL}/api/auth/profile-image`,
    removeProfileImage: `${API_URL}/api/auth/profile-image`,
  },
};
