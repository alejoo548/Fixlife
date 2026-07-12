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
    faqItems: `${API_URL}/api/admin/faq-items/public`,
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
    cashConfirm: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/cash-confirm`,
    confirmCompletion: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/confirm-completion`,
    workflowApproval: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/workflow-approval`,
    reportRequest: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/report`,
    requestChat: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/chat`,
    requestRating: (idRequest: number) => `${API_URL}/api/services/requests/${idRequest}/rating`,
  },
  reviews: {
    public: `${API_URL}/api/reviews/public`,
    submit: `${API_URL}/api/reviews`,
  },
  notifications: {
    list: `${API_URL}/api/notifications`,
    readAll: `${API_URL}/api/notifications/read-all`,
    readOne: (idNotification: number) => `${API_URL}/api/notifications/${idNotification}/read`,
  },
  admin: {
    services: `${API_URL}/api/admin/services`,
    serviceCards: `${API_URL}/api/admin/service-cards`,
    faqItems: `${API_URL}/api/admin/faq-items`,
    faqItem: (idFaq: number) => `${API_URL}/api/admin/faq-items/${idFaq}`,
    uploadImageAsset: `${API_URL}/api/admin/hero-slides/image-upload`,
    heroSlides: `${API_URL}/api/admin/hero-slides`,
    pendingWorkers: `${API_URL}/api/admin/pending-workers`,
    approveWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/approve`,
    rejectWorker: (id: number) => `${API_URL}/api/admin/workers/${id}/reject`,
    updateWorkerTier: (id: number) => `${API_URL}/api/admin/workers/${id}/tier`,
    workerTierBenefits: `${API_URL}/api/admin/worker-tier-benefits`,
    workerTierHistory: `${API_URL}/api/admin/worker-tier-history`,
    users: `${API_URL}/api/admin/users`,
    userDetail: (id: number) => `${API_URL}/api/admin/users/${id}`,
    updateUserRole: (id: number) => `${API_URL}/api/admin/users/${id}/role`,
    updateUserStatus: (id: number) => `${API_URL}/api/admin/users/${id}/status`,
    stats: `${API_URL}/api/admin/stats`,
    exportStatsPdf: `${API_URL}/api/admin/stats/export-pdf`,
    requestsHistory: `${API_URL}/api/admin/requests-history`,
    requestDetail: (idRequest: number) => `${API_URL}/api/admin/requests/${idRequest}`,
    requestActions: (idRequest: number) => `${API_URL}/api/admin/requests/${idRequest}/actions`,
    commissionRules: `${API_URL}/api/admin/commission-rules`,
    workerRewards: `${API_URL}/api/admin/worker-rewards`,
    workerRewardsSettings: `${API_URL}/api/admin/worker-rewards/settings`,
    markWorkerBonusPaid: (idBonusPayout: number) => `${API_URL}/api/admin/worker-rewards/payouts/${idBonusPayout}/pay`,
    workerPayouts: `${API_URL}/api/admin/worker-payouts`,
    markWorkerPayoutPaid: (idWorkerPayout: number) => `${API_URL}/api/admin/worker-payouts/${idWorkerPayout}/pay`,
    resendWorkerStatement: (idUser: number) => `${API_URL}/api/admin/workers/${idUser}/statement/resend`,
    paymentLedger: `${API_URL}/api/admin/payment-ledger`,
    financeReport: `${API_URL}/api/admin/finance-report`,
    exportFinanceReport: `${API_URL}/api/admin/finance-report/export`,
    financeCases: `${API_URL}/api/admin/finance-cases`,
    resolveFinanceCase: (idCase: number) => `${API_URL}/api/admin/finance-cases/${idCase}/resolve`,
    financeClosures: `${API_URL}/api/admin/finance-closures`,
    systemEvents: `${API_URL}/api/admin/system-events`,
    backgroundJobs: `${API_URL}/api/admin/background-jobs`,
    activity: `${API_URL}/api/admin/activity`,
    search: `${API_URL}/api/admin/search`,
  },
  support: {
    threads: `${API_URL}/api/support/threads`,
    allThreads: `${API_URL}/api/support/threads/all`,
    thread: (id: number) => `${API_URL}/api/support/threads/${id}`,
    messages: (id: number) => `${API_URL}/api/support/threads/${id}/messages`,
  },

  worker: {
    me: `${API_URL}/api/worker/me`,
    availability: `${API_URL}/api/worker/availability`,
    rewardsDashboard: `${API_URL}/api/worker/rewards-dashboard`,
    rewardsStatementPdf: `${API_URL}/api/worker/rewards-dashboard/statement.pdf`,
    requests: `${API_URL}/api/worker/requests`,
    workspace: `${API_URL}/api/worker/workspace`,
    appointments: `${API_URL}/api/worker/appointments`,
    acceptRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/accept`,
    rejectRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/reject`,
    counterOffer: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/counter-offer`,
    arriveRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/arrive`,
    startRoute: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/route-start`,
    startRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/start`,
    completeRequest: (idRequest: number) => `${API_URL}/api/worker/requests/${idRequest}/complete`,
    presence: `${API_URL}/api/worker/presence`,
  },
};

// Shared helpers for Socket.IO clients to reduce duplication and tame reconnection spam
export const getSocketBaseUrl = (): string => {
  // Prefer explicit support socket, fallback to the resolved API_URL (which already handles local/prod)
  const explicit = (import.meta.env.VITE_SUPPORT_SOCKET_URL || '').trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  // API_URL is already stripped of trailing /api in most cases; ensure clean base
  return API_URL.replace(/\/api\/?$/i, '').replace(/\/$/, '');
};

export const getDefaultSocketOptions = (token: string) => ({
  path: '/socket.io',
  auth: { token },
  // Start on HTTP long-polling and let engine.io upgrade to websocket once the
  // handshake succeeds. Going straight to 'websocket' fails hard (no fallback)
  // behind proxies/Docker port-forwarding that don't pass the Upgrade header,
  // which is what produced the repeated "WebSocket connection ... failed" spam.
  transports: ['polling', 'websocket'] as string[],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
});
