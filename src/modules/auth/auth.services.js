import crypto from "crypto";
import jwt from "jsonwebtoken";
import { normalizeLanguagePreference } from "../../utils/language.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

const jwksCache = new Map();

const normalizeMode = (value) => (value === "register" ? "register" : "login");

const readEnv = (key) => String(process.env[key] || "").trim();

const normalizeForwardedHeader = (value) =>
  String(value || "")
    .split(",")[0]
    .trim();

const isLocalHostname = (hostname) => {
  const value = String(hostname || "").trim().toLowerCase();
  return (
    !value ||
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.endsWith(".local")
  );
};

const getRequestOrigin = (req) => {
  const forwardedProto = normalizeForwardedHeader(req.get("x-forwarded-proto"));
  const forwardedHost = normalizeForwardedHeader(req.get("x-forwarded-host"));
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host") || "";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`.replace(/\/+$/, "");
};

const getBaseUrl = (req) => {
  const requestOrigin = getRequestOrigin(req);
  const configured = readEnv("APP_URL").replace(/\/+$/, "");

  if (!configured) {
    return requestOrigin;
  }

  try {
    const configuredUrl = new URL(configured);

    if (requestOrigin) {
      const requestUrl = new URL(requestOrigin);

      if (!isLocalHostname(requestUrl.hostname)) {
        return requestOrigin;
      }
    }

    if (!isLocalHostname(configuredUrl.hostname)) {
      return configuredUrl.toString().replace(/\/+$/, "");
    }
  } catch {
    if (requestOrigin) {
      return requestOrigin;
    }
  }

  return requestOrigin || configured;
};

const getGoogleConfig = () => ({
  clientId: readEnv("GOOGLE_CLIENT_ID"),
  clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
});

const getAppleConfig = () => ({
  clientId: readEnv("APPLE_CLIENT_ID"),
  teamId: readEnv("APPLE_TEAM_ID"),
  keyId: readEnv("APPLE_KEY_ID"),
  privateKey: readEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
});

const encodeParams = (params) => {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, value);
    }
  }

  return body;
};

const createState = () => crypto.randomBytes(24).toString("hex");
const createNonce = () => crypto.randomBytes(24).toString("hex");

const getOAuthCallbackUrl = (req, provider) => `${getBaseUrl(req)}/auth/${provider}/callback`;

export const getSocialAuthAvailability = () => {
  const google = getGoogleConfig();
  const apple = getAppleConfig();

  return {
    google: {
      enabled: Boolean(google.clientId && google.clientSecret),
    },
    apple: {
      enabled: Boolean(apple.clientId && apple.teamId && apple.keyId && apple.privateKey),
    },
  };
};

export const buildAuthPageModel = (error = null, options = {}) => ({
  error,
  socialAuth: getSocialAuthAvailability(),
  formData: {
    name: String(options?.formData?.name || "").trim(),
    email: String(options?.formData?.email || "").trim(),
  },
});

const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

export const persistSession = saveSession;

const storeOAuthRequest = async (req, payload) => {
  req.session.oauthRequest = {
    ...payload,
    createdAt: Date.now(),
  };

  await saveSession(req);
};

const consumeOAuthRequest = (req, provider, state) => {
  const oauthRequest = req.session.oauthRequest;
  delete req.session.oauthRequest;

  if (!oauthRequest || oauthRequest.provider !== provider) {
    throw new Error("Your sign-in session expired. Please try again.");
  }

  if (oauthRequest.state !== state) {
    throw new Error("The sign-in state did not match. Please try again.");
  }

  return oauthRequest;
};

const ensureGoogleConfigured = () => {
  const config = getGoogleConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google sign-in is not configured yet.");
  }

  return config;
};

const ensureAppleConfigured = () => {
  const config = getAppleConfig();

  if (!config.clientId || !config.teamId || !config.keyId || !config.privateKey) {
    throw new Error("Apple sign-in is not configured yet.");
  }

  return config;
};

export const createGoogleAuthorizationUrl = async (req, mode) => {
  const { clientId } = ensureGoogleConfigured();
  const resolvedMode = normalizeMode(mode);
  const state = createState();
  const nonce = createNonce();
  const languagePreference = normalizeLanguagePreference(
    req.query?.languagePreference ?? req.query?.__bilge_lang,
    { fallback: null }
  );

  await storeOAuthRequest(req, {
    provider: "google",
    mode: resolvedMode,
    state,
    nonce,
    languagePreference,
  });

  const params = encodeParams({
    client_id: clientId,
    redirect_uri: getOAuthCallbackUrl(req, "google"),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const createAppleAuthorizationUrl = async (req, mode) => {
  const { clientId } = ensureAppleConfigured();
  const resolvedMode = normalizeMode(mode);
  const state = createState();
  const languagePreference = normalizeLanguagePreference(
    req.query?.languagePreference ?? req.query?.__bilge_lang,
    { fallback: null }
  );

  await storeOAuthRequest(req, {
    provider: "apple",
    mode: resolvedMode,
    state,
    languagePreference,
  });

  const params = encodeParams({
    client_id: clientId,
    redirect_uri: getOAuthCallbackUrl(req, "apple"),
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });

  return `${APPLE_AUTH_URL}?${params.toString()}`;
};

const readTokenResponse = async (response) => {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Unknown response" };
  }

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "The identity provider rejected the request.");
  }

  return data;
};

const getJwks = async (jwksUrl) => {
  const cached = jwksCache.get(jwksUrl);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error("Unable to verify the identity token.");
  }

  const payload = await response.json();
  const keys = Array.isArray(payload.keys) ? payload.keys : [];

  jwksCache.set(jwksUrl, {
    keys,
    expiresAt: now + 60 * 60 * 1000,
  });

  return keys;
};

const verifyIdToken = async ({ idToken, jwksUrl, issuer, audience, nonce }) => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    throw new Error("Unable to decode the identity token.");
  }

  const keys = await getJwks(jwksUrl);
  const jwk = keys.find((item) => item.kid === decoded.header.kid);
  if (!jwk) {
    throw new Error("Unable to verify the identity token.");
  }

  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: "jwk",
  });

  const payload = jwt.verify(idToken, publicKey, {
    algorithms: [decoded.header.alg],
    issuer,
    audience,
  });

  if (nonce && payload.nonce && payload.nonce !== nonce) {
    throw new Error("The sign-in nonce did not match. Please try again.");
  }

  return payload;
};

export const completeGoogleAuthentication = async (req, code, state) => {
  const { clientId, clientSecret } = ensureGoogleConfigured();
  const oauthRequest = consumeOAuthRequest(req, "google", state);

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getOAuthCallbackUrl(req, "google"),
    }),
  });

  const tokens = await readTokenResponse(tokenResponse);
  const claims = await verifyIdToken({
    idToken: tokens.id_token,
    jwksUrl: GOOGLE_JWKS_URL,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    nonce: oauthRequest.nonce,
  });

  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("Google did not return a verified email address for this account.");
  }

  return {
    mode: oauthRequest.mode,
    provider: "google",
    providerUserId: claims.sub,
    email: claims.email,
    name: claims.name || claims.given_name || "",
    languagePreference: oauthRequest.languagePreference || null,
  };
};

const buildAppleClientSecret = () => {
  const { clientId, teamId, keyId, privateKey } = ensureAppleConfigured();

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    expiresIn: "180d",
    issuer: teamId,
    audience: "https://appleid.apple.com",
    subject: clientId,
    header: {
      kid: keyId,
    },
  });
};

export const completeAppleAuthentication = async (req, { code, state, user }) => {
  const { clientId } = ensureAppleConfigured();
  const oauthRequest = consumeOAuthRequest(req, "apple", state);

  const tokenResponse = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeParams({
      client_id: clientId,
      client_secret: buildAppleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: getOAuthCallbackUrl(req, "apple"),
    }),
  });

  const tokens = await readTokenResponse(tokenResponse);
  const claims = await verifyIdToken({
    idToken: tokens.id_token,
    jwksUrl: APPLE_JWKS_URL,
    issuer: "https://appleid.apple.com",
    audience: clientId,
  });

  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("Apple did not return a verified email address for this account.");
  }

  let parsedUser = null;
  if (user) {
    try {
      parsedUser = typeof user === "string" ? JSON.parse(user) : user;
    } catch {
      parsedUser = null;
    }
  }

  const nameParts = [parsedUser?.name?.firstName, parsedUser?.name?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return {
    mode: oauthRequest.mode,
    provider: "apple",
    providerUserId: claims.sub,
    email: claims.email,
    name: nameParts.join(" "),
    languagePreference: oauthRequest.languagePreference || null,
  };
};
