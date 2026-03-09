export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  auth: {
    login: `${API_URL}/api/auth/login`,
    registerUser: `${API_URL}/api/auth/register-user`,
    registerWorker: `${API_URL}/api/auth/register/worker`,
    verifyWorkerEmail: `${API_URL}/api/auth/verify-worker-email`,
    resendOtp: `${API_URL}/api/auth/resend-otp`,
    forgotPassword: `${API_URL}/api/auth/forgot-password`,
    verifyResetToken: `${API_URL}/api/auth/verify-reset-token`,
    resetPassword: `${API_URL}/api/auth/reset-password`,
  },
  services: {
    getActive: `${API_URL}/api/services`,
  },
  admin: {
    services: `${API_URL}/api/admin/services`,
    pendingWorkers: `${API_URL}/api/admin/pending-workers`,
    approveWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/approve`,
    rejectWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/reject`,
    stats: `${API_URL}/api/admin/stats`,
  },
};
