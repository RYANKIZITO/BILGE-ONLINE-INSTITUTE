// src/modules/payments/providers/pesapal.provider.js
import crypto from 'crypto';
import https from 'https';
import PaymentProvider from './payment.interface.js';
import { resolvePublicUrl } from './provider-config.js';

let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedNotificationId =
  process.env.PESAPAL_NOTIFICATION_ID || process.env.PESAPAL_IPN_ID || null;

const sanitizeText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const createReference = () => {
  const raw =
    typeof crypto.randomUUID === 'function'
      ? `PSP-${crypto.randomUUID()}`
      : `PSP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return raw.slice(0, 50);
};

const splitName = (fullName) => {
  const cleaned = sanitizeText(fullName, 120);
  if (!cleaned) return { firstName: 'Student', lastName: '' };
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const getConfig = () => {
  const config = {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
    baseUrl: process.env.PESAPAL_BASE_URL,
    callbackUrl: resolvePublicUrl(
      process.env.PESAPAL_CALLBACK_URL,
      '/payments/confirm?provider=pesapal'
    )
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Pesapal configuration missing: ${missing.join(', ')}`);
  }

  return {
    ...config,
    baseUrl: String(config.baseUrl).replace(/\/+$/, ''),
    callbackUrl: String(config.callbackUrl)
  };
};

const requestPesapal = async ({ method, path, token, body, query, baseUrl }) => {
  const normalizedBase = `${String(baseUrl).replace(/\/+$/, '')}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const url = new URL(normalizedPath, normalizedBase);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const payload = body ? JSON.stringify(body) : '';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (err) {
            parsed = null;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const message =
              parsed?.message ||
              data ||
              `Pesapal API error (${response.statusCode})`;
            return reject(new Error(message));
          }

          const normalizedStatus =
            parsed?.status === undefined || parsed?.status === null
              ? null
              : String(parsed.status).trim();

          if (normalizedStatus && normalizedStatus !== '200') {
            const apiErrorMessage =
              parsed?.error?.message ||
              parsed?.error?.error_message ||
              parsed?.error?.description ||
              parsed?.message ||
              data ||
              'Pesapal request failed';
            return reject(
              new Error(apiErrorMessage)
            );
          }

          return resolve(parsed || {});
        });
      }
    );

    request.on('error', (err) => reject(err));
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
};

const buildCallbackUrl = (reference) => {
  const { callbackUrl } = getConfig();
  const url = new URL(callbackUrl);
  url.searchParams.set('provider', 'pesapal');
  url.searchParams.set('reference', reference);
  return url.toString();
};

const getAuthToken = async () => {
  const { consumerKey, consumerSecret, baseUrl } = getConfig();
  const now = Date.now();
  if (cachedToken && cachedTokenExpiry && now < cachedTokenExpiry - 30_000) {
    return cachedToken;
  }

  const response = await requestPesapal({
    method: 'POST',
    path: '/api/Auth/RequestToken',
    baseUrl,
    body: {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret
    }
  });

  if (!response?.token) {
    throw new Error('Pesapal auth token missing');
  }

  cachedToken = response.token;
  const expiryMs = response.expiryDate
    ? new Date(response.expiryDate).getTime()
    : now + 4 * 60 * 1000;
  cachedTokenExpiry = Number.isFinite(expiryMs) ? expiryMs : now + 4 * 60 * 1000;

  return cachedToken;
};

const getNotificationId = async () => {
  if (cachedNotificationId) {
    return cachedNotificationId;
  }

  const { baseUrl } = getConfig();
  const ipnUrl = resolvePublicUrl(
    process.env.PESAPAL_IPN_URL,
    '/api/payments/pesapal/ipn'
  );
  if (!ipnUrl) {
    throw new Error('Pesapal IPN URL not configured');
  }

  const ipnMethod = (process.env.PESAPAL_IPN_METHOD || 'POST').toUpperCase();
  if (ipnMethod !== 'POST' && ipnMethod !== 'GET') {
    throw new Error('Pesapal IPN method must be GET or POST');
  }

  const token = await getAuthToken();
  try {
    const response = await requestPesapal({
      method: 'POST',
      path: '/api/URLSetup/RegisterIPN',
      baseUrl,
      token,
      body: {
        url: ipnUrl,
        ipn_notification_type: ipnMethod
      }
    });

    if (!response?.ipn_id) {
      throw new Error('Pesapal IPN registration failed');
    }

    cachedNotificationId = response.ipn_id;
    return cachedNotificationId;
  } catch (err) {
    const message = String(err?.message || '').toLowerCase();
    const alreadyExists =
      message.includes('exists') ||
      message.includes('already') ||
      message.includes('duplicate');

    if (alreadyExists && cachedNotificationId) {
      return cachedNotificationId;
    }

    if (alreadyExists) {
      throw new Error(
        'Pesapal IPN already registered. Set PESAPAL_NOTIFICATION_ID to continue.'
      );
    }

    throw err;
  }
};

const getTransactionStatus = async (orderTrackingId) => {
  const { baseUrl } = getConfig();
  const token = await getAuthToken();
  return requestPesapal({
    method: 'GET',
    path: '/api/Transactions/GetTransactionStatus',
    baseUrl,
    token,
    query: { orderTrackingId }
  });
};

const extractConfirmationCode = (status) =>
  status?.confirmation_code ||
  status?.confirmationCode ||
  status?.payment_method_tracking_id ||
  status?.payment_method_trackingId ||
  null;

export default class PesapalProvider extends PaymentProvider {
  async createPayment({ amount, currency, metadata }) {
    const reference = createReference();
    const numericAmount = Number(amount);
    const normalizedCurrency = String(currency || '').toUpperCase();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Pesapal amount invalid');
    }

    if (!normalizedCurrency) {
      throw new Error('Pesapal currency missing');
    }

    const courseTitle = sanitizeText(metadata?.courseTitle, 60);
    const courseSummary = sanitizeText(metadata?.courseDescription, 100);
    const baseDescription = courseTitle
      ? `Course fee: ${courseTitle}`
      : 'Course payment';
    const combinedDescription =
      courseSummary && courseTitle && !courseSummary.startsWith(courseTitle)
        ? `${baseDescription} - ${courseSummary}`
        : baseDescription;
    const description = sanitizeText(combinedDescription, 100) || 'Course payment';

    const emailAddress = sanitizeText(metadata?.email, 254);
    const phoneNumber = sanitizeText(metadata?.phoneNumber, 30);
    if (!emailAddress && !phoneNumber) {
      throw new Error('Student email or phone is required for Pesapal');
    }

    const { firstName, lastName } = splitName(metadata?.fullName);
    const notificationId = await getNotificationId();
    const callbackUrl = buildCallbackUrl(reference);
    const { baseUrl } = getConfig();
    const token = await getAuthToken();

    const payload = {
      id: reference,
      currency: normalizedCurrency,
      amount: numericAmount,
      description,
      callback_url: callbackUrl,
      notification_id: notificationId,
      billing_address: {
        email_address: emailAddress || undefined,
        phone_number: phoneNumber || undefined,
        country_code: sanitizeText(metadata?.countryCode, 2) || undefined,
        first_name: firstName,
        last_name: lastName || undefined
      }
    };

    const response = await requestPesapal({
      method: 'POST',
      path: '/api/Transactions/SubmitOrderRequest',
      baseUrl,
      token,
      body: payload
    });

    const checkoutUrl = response?.redirect_url;
    if (!checkoutUrl) {
      throw new Error('Pesapal checkout link missing');
    }

    const orderTrackingId = response?.order_tracking_id || null;

    return {
      checkoutUrl,
      reference,
      provider: 'pesapal',
      providerRef: orderTrackingId,
      metadata: {
        ...metadata,
        amount: numericAmount,
        currency: normalizedCurrency,
        orderTrackingId,
        notificationId
      }
    };
  }

  async verifyPayment(reference, context = {}) {
    const orderTrackingId =
      context?.orderTrackingId ||
      context?.OrderTrackingId ||
      context?.order_tracking_id ||
      context?.orderTrackingID ||
      context?.order_trackingId ||
      context?.metadata?.orderTrackingId;

    if (!orderTrackingId) {
      return null;
    }

    const status = await getTransactionStatus(orderTrackingId);
    const paymentStatus = String(
      status?.payment_status_description ||
      status?.payment_status ||
      status?.paymentStatusDescription ||
      status?.status_description ||
      ''
    )
      .replace(/\s+/g, '_')
      .toUpperCase();

    if (paymentStatus === 'COMPLETED') {
      return true;
    }

    if (
      paymentStatus === 'PENDING' ||
      paymentStatus === 'PROCESSING' ||
      paymentStatus === 'WAITING' ||
      paymentStatus === 'INVALID' ||
      paymentStatus === ''
    ) {
      return null;
    }

    return false;
  }

  async handleWebhook(payload) {
    return true;
  }

  async createRefund({
    providerRef,
    amount,
    metadata,
    reason
  }) {
    const orderTrackingId =
      providerRef ||
      metadata?.orderTrackingId ||
      metadata?.providerRef ||
      null;

    if (!orderTrackingId) {
      throw new Error('Pesapal order tracking id missing for refund');
    }

    const status = await getTransactionStatus(orderTrackingId);
    const confirmationCode = extractConfirmationCode(status);

    if (!confirmationCode) {
      throw new Error('Pesapal confirmation code missing for refund');
    }

    const { baseUrl } = getConfig();
    const token = await getAuthToken();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Pesapal refund amount invalid');
    }

    const response = await requestPesapal({
      method: 'POST',
      path: '/api/Transactions/RefundRequest',
      baseUrl,
      token,
      body: {
        confirmation_code: confirmationCode,
        amount: numericAmount,
        remarks: sanitizeText(reason || metadata?.reason || 'Program switch adjustment', 120),
        username: sanitizeText(metadata?.email || 'BILGE LMS', 120)
      }
    });

    return {
      reference: confirmationCode,
      status: response?.message || 'submitted',
      raw: response
    };
  }
}
