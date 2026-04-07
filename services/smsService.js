const SMS_LOG_PREFIX = "[notifications:sms]";

const normalizeString = (value) => String(value || "").trim();

const getTwilioConfig = () => {
  const accountSid = normalizeString(process.env.TWILIO_ACCOUNT_SID);
  const authToken = normalizeString(process.env.TWILIO_AUTH_TOKEN);
  const fromPhoneNumber = normalizeString(process.env.TWILIO_PHONE_NUMBER);

  return {
    accountSid,
    authToken,
    fromPhoneNumber,
    isConfigured: Boolean(accountSid && authToken && fromPhoneNumber),
  };
};

export const sendSMS = async (to, message) => {
  const config = getTwilioConfig();
  const destination = normalizeString(to);
  const body = normalizeString(message);

  if (!config.isConfigured) {
    console.warn(`${SMS_LOG_PREFIX} Twilio is not configured. Skipping SMS delivery.`);
    return { delivered: false, skipped: true, reason: "not_configured" };
  }

  if (!destination || !body) {
    console.warn(`${SMS_LOG_PREFIX} Missing destination or message body. Skipping SMS delivery.`);
    return { delivered: false, skipped: true, reason: "invalid_payload" };
  }

  const { default: twilio } = await import("twilio");
  const client = twilio(config.accountSid, config.authToken);
  const result = await client.messages.create({
    from: config.fromPhoneNumber,
    to: destination,
    body,
  });

  return {
    delivered: true,
    skipped: false,
    sid: result.sid,
    status: result.status,
  };
};

