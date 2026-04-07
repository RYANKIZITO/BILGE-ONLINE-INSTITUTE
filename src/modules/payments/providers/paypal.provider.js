import crypto from 'crypto';
import https from 'https';
import PaymentProvider from './payment.interface.js';
import { getPublicAppUrl } from './provider-config.js';

let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

const sanitizeText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const createReference = () => {
  const raw =
    typeof crypto.randomUUID === 'function'
      ? `PAYPAL-${crypto.randomUUID()}`
      : `PAYPAL-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return raw.slice(0, 80);
};

const getConfig = () => {
  const appUrl = getPublicAppUrl();
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const configuredBaseUrl = String(process.env.PAYPAL_BASE_URL || '').trim();
  const baseUrl = configuredBaseUrl || 'https://api-m.sandbox.paypal.com';
  const brandName = sanitizeText(
    process.env.PAYPAL_BRAND_NAME || 'Bilge Online Institute',
    127
  );

  const missing = [];
  if (!appUrl) missing.push('APP_URL');
  if (!clientId) missing.push('PAYPAL_CLIENT_ID');
  if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(`PayPal configuration missing: ${missing.join(', ')}`);
  }

  return {
    appUrl,
    clientId,
    clientSecret,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    brandName,
  };
};

const requestPaypal = async ({
  method,
  path,
  headers = {},
  body,
  baseUrl,
}) => {
  const url = new URL(String(path || '').replace(/^\/+/, ''), `${baseUrl}/`);
  const payload =
    typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (payload && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (payload) {
    requestHeaders['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: requestHeaders,
      },
      (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = null;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const message =
              parsed?.message ||
              parsed?.error_description ||
              parsed?.details?.[0]?.description ||
              data ||
              `PayPal API error (${response.statusCode})`;
            return reject(new Error(message));
          }

          return resolve(parsed || {});
        });
      }
    );

    request.on('error', (error) => reject(error));

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
};

const getAccessToken = async () => {
  const { clientId, clientSecret, baseUrl } = getConfig();
  const now = Date.now();

  if (cachedAccessToken && cachedAccessTokenExpiry > now + 30_000) {
    return cachedAccessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await requestPaypal({
    method: 'POST',
    path: '/v1/oauth2/token',
    baseUrl,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response?.access_token) {
    throw new Error('PayPal access token missing');
  }

  cachedAccessToken = response.access_token;
  cachedAccessTokenExpiry = now + Number(response.expires_in || 0) * 1000;

  return cachedAccessToken;
};

const getOrderIdFromContext = (context = {}) =>
  context?.orderId ||
  context?.token ||
  context?.paypalOrderId ||
  context?.metadata?.orderId ||
  context?.metadata?.paypalOrderId ||
  null;

const getOrderDetails = async (orderId) => {
  const { baseUrl } = getConfig();
  const accessToken = await getAccessToken();

  return requestPaypal({
    method: 'GET',
    path: `/v2/checkout/orders/${orderId}`,
    baseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
};

const captureOrder = async (orderId) => {
  const { baseUrl } = getConfig();
  const accessToken = await getAccessToken();

  return requestPaypal({
    method: 'POST',
    path: `/v2/checkout/orders/${orderId}/capture`,
    baseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'PayPal-Request-Id': `capture-${orderId}`,
    },
    body: {},
  });
};

export default class PaypalProvider extends PaymentProvider {
  async createPayment({ amount, currency, metadata }) {
    const { appUrl, baseUrl, brandName } = getConfig();
    const reference = createReference();
    const numericAmount = Number(amount);
    const normalizedCurrency = String(currency || '').toUpperCase();
    const courseTitle = sanitizeText(metadata?.courseTitle, 120) || 'Course payment';
    const description = sanitizeText(
      `Course fee: ${courseTitle}`,
      127
    );
    const accessToken = await getAccessToken();

    const response = await requestPaypal({
      method: 'POST',
      path: '/v2/checkout/orders',
      baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': reference,
        Prefer: 'return=representation',
      },
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: reference,
            description,
            custom_id: String(metadata?.courseId || ''),
            amount: {
              currency_code: normalizedCurrency,
              value: numericAmount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: brandName,
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: `${appUrl}/payments/confirm?provider=paypal&reference=${encodeURIComponent(reference)}`,
          cancel_url: `${appUrl}/payments/confirm?provider=paypal&reference=${encodeURIComponent(reference)}&cancel=1`,
        },
      },
    });

    const checkoutUrl =
      response?.links?.find((link) => link.rel === 'approve')?.href || null;

    if (!checkoutUrl || !response?.id) {
      throw new Error('PayPal checkout link missing');
    }

    return {
      checkoutUrl,
      reference,
      provider: 'paypal',
      providerRef: response.id,
      metadata: {
        ...metadata,
        amount: numericAmount,
        currency: normalizedCurrency,
        orderId: response.id,
      },
    };
  }

  async verifyPayment(reference, context = {}) {
    const orderId = getOrderIdFromContext(context);
    if (!orderId) {
      return null;
    }

    const order = await getOrderDetails(orderId);
    const status = String(order?.status || '').toUpperCase();

    if (status === 'COMPLETED') {
      return true;
    }

    if (status === 'APPROVED') {
      const capture = await captureOrder(orderId);
      return String(capture?.status || '').toUpperCase() === 'COMPLETED';
    }

    if (status === 'CREATED' || status === 'PAYER_ACTION_REQUIRED') {
      return null;
    }

    return false;
  }

  async handleWebhook(payload) {
    return true;
  }

  async createRefund({ amount, currency, metadata }) {
    return {
      reference: `PAYPAL-REFUND-${Date.now()}`,
      status: 'submitted',
      raw: {
        amount,
        currency,
        metadata,
      },
    };
  }
}
