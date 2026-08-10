// Wompi El Salvador API client. Docs: https://docs.wompi.sv/
// - Auth: POST {WOMPI_TOKEN_URL} (OAuth2 client_credentials, form-urlencoded)
// - Checkout: POST {WOMPI_API_URL}/EnlacePago
// The redirect and webhook URLs are sent per-request inside `configuracion`,
// so the dashboard's own "Redirect URL"/"Url webhook" fields (which must be
// https, e.g. a placeholder like google.com) are never used by this flow.

// Wompi's token/checkout endpoints normally respond in well under a second;
// 15s let a single slow call plus its retry stack up to ~60s of dead air
// before the client ever saw a redirect. 8s still gives real slowness room
// to recover via the retry below without making the user stare that long.
const WOMPI_REQUEST_TIMEOUT_MS = 8000;

type WompiTokenCache = { token: string; expiresAt: number };
let tokenCache: WompiTokenCache | null = null;

const getWompiConfig = () => ({
  clientId: String(process.env.WOMPI_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.WOMPI_CLIENT_SECRET || '').trim(),
  tokenUrl: String(process.env.WOMPI_TOKEN_URL || 'https://id.wompi.sv/connect/token').trim(),
  apiUrl: String(process.env.WOMPI_API_URL || 'https://api.wompi.sv').trim().replace(/\/+$/, ''),
});

const fetchWompi = async (url: string, init: RequestInit): Promise<Response> => {
  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WOMPI_REQUEST_TIMEOUT_MS);
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

const parseWompiResponse = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getWompiAccessToken = async (): Promise<string> => {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5000) {
    return tokenCache.token;
  }

  const { clientId, clientSecret, tokenUrl } = getWompiConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Wompi credentials are missing on the server.');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    audience: 'wompi_api',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWompi(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = await parseWompiResponse(response);
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || 'Could not authenticate with Wompi.';
    throw new Error(String(message));
  }

  const expiresInSeconds = Number(payload.expires_in) > 30 ? Number(payload.expires_in) : 3600;
  tokenCache = {
    token: String(payload.access_token),
    expiresAt: Date.now() + (expiresInSeconds - 30) * 1000,
  };

  return tokenCache.token;
};

// Wompi's edge WAF hard-blocks (raw 403, no JSON body) any EnlacePago request
// whose body contains a loopback/private host in urlRedirect or urlWebhook —
// confirmed by testing against the real API. Surface a clear error instead of
// letting that opaque 403 reach the client; a public HTTPS tunnel (ngrok,
// cloudflared) is required to test the Wompi flow from local dev.
const assertPubliclyReachable = (label: string, rawUrl: string) => {
  let hostname = '';
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`Wompi ${label} is not a valid URL: ${rawUrl}`);
  }
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  if (isLocal) {
    throw new Error(
      `Wompi rejects checkout requests whose ${label} points at a local address (${hostname}). ` +
        'Expose your backend/frontend over a public HTTPS tunnel (e.g. ngrok, cloudflared) to test Wompi from local dev.'
    );
  }
};

export const createWompiCheckout = async (input: {
  amount: number;
  checkoutReference: string;
  productName: string;
  redirectUrl: string;
  webhookUrl: string;
}): Promise<{ linkId: string; checkoutUrl: string }> => {
  assertPubliclyReachable('redirect URL', input.redirectUrl);
  assertPubliclyReachable('webhook URL', input.webhookUrl);

  const accessToken = await getWompiAccessToken();
  const { apiUrl } = getWompiConfig();

  const body = {
    identificadorEnlaceComercio: input.checkoutReference,
    monto: Number(input.amount.toFixed(2)),
    nombreProducto: input.productName.slice(0, 100),
    formaPago: {
      permitirTarjetaCreditoDebido: true,
      permitirPagoConPuntoAgricola: false,
      permitirPagoEnCuotasAgricola: false,
      permitirPagoEnBitcoin: false,
      permitePagoQuickPay: false,
    },
    configuracion: {
      urlRedirect: input.redirectUrl,
      esMontoEditable: false,
      esCantidadEditable: false,
      urlWebhook: input.webhookUrl,
      notificarTransaccionCliente: false,
    },
  };

  const response = await fetchWompi(`${apiUrl}/EnlacePago`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await parseWompiResponse(response);
  if (!response.ok || !payload?.urlEnlace) {
    const message = payload?.message || payload?.title || payload?.Message || 'Wompi checkout link creation failed.';
    throw new Error(String(message));
  }

  return {
    linkId: String(payload.idEnlace),
    checkoutUrl: String(payload.urlEnlace),
  };
};
