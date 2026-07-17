const DEFAULT_ALLOWED_REDIRECT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://0.0.0.0:3000',
];

export type SupportedPaymentMethod = 'paypal' | 'wompi' | 'cash' | 'virtual_wallet';

export const getRequestChargeAmount = (row: any) => {
  if (row?.final_budget != null) return Number(row.final_budget);
  if (row?.budget != null) return Number(row.budget);
  if (row?.initial_budget != null) return Number(row.initial_budget);
  return 0;
};

export const buildCheckoutReference = (idRequest: number) =>
  `FX-${idRequest}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const getPlatformFeeRate = () => {
  const raw = Number(process.env.PLATFORM_FEE_RATE || 0.12);
  if (!Number.isFinite(raw)) return 0.12;
  return Math.min(Math.max(raw, 0), 0.5);
};

export const getPaymentBreakdown = (amount: number) => {
  const normalizedAmount = Math.max(0, Number(amount || 0));
  const platformFee = Number((normalizedAmount * getPlatformFeeRate()).toFixed(2));
  const workerPayout = Number(Math.max(0, normalizedAmount - platformFee).toFixed(2));
  return { amount: normalizedAmount, platformFee, workerPayout };
};

export const parseRequestedPaymentMethod = (value: unknown): SupportedPaymentMethod | null => {
  const method = String(value || '').trim().toLowerCase();
  if (!method) return null;
  if (method === 'paypal') return 'paypal';
  if (method === 'wompi') return 'wompi';
  if (method === 'cash') return 'cash';
  if (method === 'virtual_wallet') return 'virtual_wallet';
  return null;
};

export const sanitizePaymentValue = (value: unknown, max = 120) => String(value ?? '').trim().slice(0, max);

export const buildInvoiceNumber = (idRequest: number) => {
  const stamp = Date.now().toString().slice(-8);
  return `INV-FX-${idRequest}-${stamp}`;
};

const getAllowedRedirectOrigins = () => {
  const origins = new Set<string>(DEFAULT_ALLOWED_REDIRECT_ORIGINS);

  for (const rawGroup of [
    process.env.ALLOWED_ORIGINS,
    process.env.FRONTEND_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_APP_URL,
  ]) {
    for (const rawValue of String(rawGroup || '').split(',')) {
      const candidate = rawValue.trim();
      if (!candidate) continue;
      try {
        origins.add(new URL(candidate).origin);
      } catch {
        // Ignore malformed origins from env to keep defaults working.
      }
    }
  }

  return origins;
};

export const sanitizeRedirectUrl = (value: unknown, fallback: string) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return fallback;
    if (!getAllowedRedirectOrigins().has(parsed.origin)) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
};

export const getDefaultFrontendUrl = () => {
  for (const candidate of [
    process.env.PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
  ]) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed env values and keep local fallback.
    }
  }
  return 'http://localhost:3000';
};

const roundMoney = (value: number) => Number(Number(value || 0).toFixed(2));

const amountsMatch = (left: number | null | undefined, right: number | null | undefined) =>
  Math.abs(roundMoney(Number(left || 0)) - roundMoney(Number(right || 0))) < 0.01;

const getPaypalBaseUrl = () =>
  String(process.env.PAYPAL_MODE || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PAYPAL_REQUEST_TIMEOUT_MS = 15000;

// Network blips and PayPal's own transient 5xx responses shouldn't surface as a hard failure
// to the user on the first try; retry once after a short delay before giving up.
const fetchPaypal = async (url: string, init: RequestInit): Promise<Response> => {
  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAYPAL_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const response = await attempt();
    if (response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return attempt();
    }
    return response;
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return attempt();
  }
};

const parsePaypalResponse = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getPaypalCredentials = () => {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret };
};

const getPaypalAccessToken = async () => {
  const { clientId, clientSecret } = getPaypalCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are missing on the server.');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchPaypal(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const payload = await parsePaypalResponse(response);
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || 'Could not authenticate with PayPal.';
    throw new Error(String(message));
  }

  return String(payload.access_token);
};

export const createPaypalOrder = async (input: {
  amount: number;
  checkoutReference: string;
  payerName?: string;
  payerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
}) => {
  const accessToken = await getPaypalAccessToken();
  const orderPayload: any = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: input.checkoutReference,
        description: 'Fixlife service payment',
        amount: {
          currency_code: 'USD',
          value: input.amount.toFixed(2),
        },
      },
    ],
    application_context: {
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
  };

  if (String(input.payerEmail || '').trim()) {
    const firstName = String(input.payerName || '').trim().split(' ')[0] || 'Fixlife';
    orderPayload.payer = {
      name: {
        given_name: firstName,
      },
      email_address: String(input.payerEmail).trim(),
    };
  }

  const response = await fetchPaypal(`${getPaypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  const payload = await parsePaypalResponse(response);
  if (!response.ok || !payload?.id) {
    const message = payload?.message || payload?.name || 'PayPal order creation failed.';
    throw new Error(String(message));
  }

  const approveUrl = Array.isArray(payload?.links)
    ? payload.links.find((link: any) => String(link?.rel || '').toLowerCase() === 'approve')?.href || null
    : null;

  return {
    orderId: String(payload.id),
    approveUrl: approveUrl ? String(approveUrl) : null,
  };
};

export const capturePaypalOrder = async (paypalOrderId: string) => {
  const accessToken = await getPaypalAccessToken();
  const response = await fetchPaypal(`${getPaypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await parsePaypalResponse(response);
  if (!response.ok || !payload) {
    const message = payload?.details?.[0]?.description || payload?.message || payload?.name || 'PayPal capture failed.';
    throw new Error(String(message));
  }

  const status = String(payload?.status || '').toUpperCase();
  if (status !== 'COMPLETED') {
    throw new Error(`PayPal capture returned status ${status || 'UNKNOWN'}.`);
  }

  return payload;
};

const readPaypalCaptureSummary = (payload: any) => {
  const purchaseUnit = Array.isArray(payload?.purchase_units) ? payload.purchase_units[0] : null;
  const capture = Array.isArray(purchaseUnit?.payments?.captures) ? purchaseUnit.payments.captures[0] : null;
  const amountBlock = capture?.amount || purchaseUnit?.amount || null;

  return {
    orderId: sanitizePaymentValue(payload?.id, 120),
    orderStatus: String(payload?.status || '').toUpperCase(),
    referenceId: sanitizePaymentValue(purchaseUnit?.reference_id, 64) || null,
    captureId: sanitizePaymentValue(capture?.id, 120) || null,
    captureStatus: String(capture?.status || '').toUpperCase() || null,
    amount: amountBlock?.value != null ? roundMoney(Number(amountBlock.value)) : null,
    currencyCode: amountBlock?.currency_code ? String(amountBlock.currency_code).toUpperCase() : null,
  };
};

export const assertPaypalCaptureMatchesRequest = (payload: any, expected: {
  orderId: string;
  checkoutReference: string;
  amount: number;
  currencyCode: string;
}) => {
  const summary = readPaypalCaptureSummary(payload);

  if (!summary.orderId || summary.orderId !== expected.orderId) {
    throw new Error('PayPal order mismatch detected.');
  }
  if (!summary.referenceId || summary.referenceId !== expected.checkoutReference) {
    throw new Error('PayPal checkout reference mismatch detected.');
  }
  if (!summary.currencyCode || summary.currencyCode !== expected.currencyCode.toUpperCase()) {
    throw new Error('PayPal currency mismatch detected.');
  }
  if (summary.amount == null || !amountsMatch(summary.amount, expected.amount)) {
    throw new Error('PayPal amount mismatch detected.');
  }
  if (summary.captureStatus && summary.captureStatus !== 'COMPLETED') {
    throw new Error(`PayPal capture returned capture status ${summary.captureStatus}.`);
  }

  return summary;
};
