const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const stripApiSuffix = (value: string) => {
  const withoutTrailingSlash = trimTrailingSlash(value.trim());
  return withoutTrailingSlash.replace(/\/api$/i, '');
};

const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

const isLocalApiUrl = (value: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/api)?\/?$/i.test(value);

const resolveApiUrl = () => {
  const envApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
  const runtime =
    typeof window !== 'undefined'
      ? {
          origin: window.location.origin,
          protocol: window.location.protocol,
          hostname: window.location.hostname,
        }
      : {
          origin: 'http://localhost:3000',
          protocol: 'http:',
          hostname: 'localhost',
        };

  const runtimeIsLocal = isLocalHost(runtime.hostname);

  if (envApiUrl && (!isLocalApiUrl(envApiUrl) || runtimeIsLocal)) {
    return stripApiSuffix(envApiUrl);
  }

  // Local Docker/Vite keeps frontend and backend on separate ports; deployed/proxied
  // environments default to same-origin so CDN/proxy hostnames do not break API calls.
  if (runtimeIsLocal) {
    return `${runtime.protocol}//${runtime.hostname}:8000`;
  }

  return stripApiSuffix(runtime.origin);
};

export const API_URL = resolveApiUrl();

export const API_ENDPOINTS = {
  auth: {
    login: `${API_URL}/api/auth/login`,
    registerUser: `${API_URL}/api/auth/register-user`,
    registerWorker: `${API_URL}/api/auth/register/worker`,
    google: `${API_URL}/api/auth/google`,
    verifyWorkerEmail: `${API_URL}/api/auth/verify-worker-email`,
    resendOtp: `${API_URL}/api/auth/resend-otp`,
    forgotPassword: `${API_URL}/api/auth/forgot-password`,
    verifyResetToken: `${API_URL}/api/auth/verify-reset-token`,
    resetPassword: `${API_URL}/api/auth/reset-password`,
    updateProfile: `${API_URL}/api/auth/profile`,
    uploadProfileImage: `${API_URL}/api/auth/profile-image`,
    removeProfileImage: `${API_URL}/api/auth/profile-image`,
  },
  services: {
    getActive: `${API_URL}/api/services`,
    cards: `${API_URL}/api/services/cards`,
    geocode: `${API_URL}/api/services/geocode`,
    geocodeSuggest: `${API_URL}/api/services/geocode/suggest`,
    geocodeReverse: `${API_URL}/api/services/geocode/reverse`,
    nearbyWorkers: `${API_URL}/api/services/nearby-workers`,
    savedLocations: `${API_URL}/api/services/saved-locations`,
    savedLocation: (idSavedLocation: number) => `${API_URL}/api/services/saved-locations/${idSavedLocation}`,
    createRequest: `${API_URL}/api/services/requests`,
    myRequests: `${API_URL}/api/services/my-requests`,
    requestWorkerProfile: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/worker-profile`,
    cancelRequest: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/cancel`,
    acceptAssignedWorker: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/worker/accept`,
    declineAssignedWorker: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/worker/decline`,
    acceptCounter: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/counter/accept`,
    declineCounter: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/counter/decline`,
    paymentCheckout: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/payment-checkout`,
    confirmPayment: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/payment-confirm`,
    confirmCompletion: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/confirm-completion`,
    requestChat: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/chat`,
    requestRating: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/rating`,
  },
  notifications: {
    list: `${API_URL}/api/notifications`,
    readAll: `${API_URL}/api/notifications/read-all`,
    readOne: (idNotification: number) => `${API_URL}/api/notifications/${idNotification}/read`,
  },
  admin: {
    services: `${API_URL}/api/admin/services`,
    serviceCards: `${API_URL}/api/admin/service-cards`,
    uploadImageAsset: `${API_URL}/api/admin/hero-slides/image-upload`,
    pendingWorkers: `${API_URL}/api/admin/pending-workers`,
    approveWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/approve`,
    rejectWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/reject`,
    users: `${API_URL}/api/admin/users`,
    updateUserRole: (id: number) => `${API_URL}/api/admin/users/${id}/role`,
    updateUserStatus: (id: number) => `${API_URL}/api/admin/users/${id}/status`,
    stats: `${API_URL}/api/admin/stats`,
    requestsHistory: `${API_URL}/api/admin/requests-history`,
    workerRewards: `${API_URL}/api/admin/worker-rewards`,
    workerRewardsSettings: `${API_URL}/api/admin/worker-rewards/settings`,
    markWorkerBonusPaid: (idBonusPayout: number) => `${API_URL}/api/admin/worker-rewards/payouts/${idBonusPayout}/pay`,
    activity: `${API_URL}/api/admin/activity`,
  },
  worker: {
    me: `${API_URL}/api/worker/me`,
    rewardsDashboard: `${API_URL}/api/worker/rewards-dashboard`,
    requests: `${API_URL}/api/worker/requests`,
    acceptRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/accept`,
    rejectRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/reject`,
    counterOffer: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/counter-offer`,
    startRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/start`,
    completeRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/complete`,
    presence: `${API_URL}/api/worker/presence`,
  },
};
