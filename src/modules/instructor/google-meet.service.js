import jwt from "jsonwebtoken";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_MEET_API_BASE_URL = "https://meet.googleapis.com/v2";
const GOOGLE_MEET_PROVIDER = "GOOGLE_MEET";
const GOOGLE_MEET_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const VERIFICATION_RECHECK_MINUTES = 10;
const CONFERENCE_LOOKBACK_HOURS = 12;
const CONFERENCE_LOOKAHEAD_HOURS = 36;
const VERIFICATION_GRACE_HOURS = 4;
const MIN_VERIFIED_DURATION_MINUTES = 5;

const tokenCache = new Map();

const readEnv = (key) => String(process.env[key] || "").trim();

const diffMinutes = (start, end) => {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60));
};

const getGoogleMeetIntegrationConfig = () => ({
  serviceAccountEmail: readEnv("GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL"),
  privateKey: readEnv("GOOGLE_WORKSPACE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  delegatedUserEmail: readEnv("GOOGLE_WORKSPACE_MEET_DELEGATED_USER_EMAIL"),
  useInstructorSubject: readEnv("GOOGLE_WORKSPACE_MEET_USE_INSTRUCTOR_SUBJECT") === "true",
});

const isTokenUsable = (cachedToken) =>
  cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_SECONDS * 1000;

const getEffectiveSubjectEmail = (config, instructor) => {
  if (config.useInstructorSubject && instructor?.email) {
    return instructor.email;
  }

  return config.delegatedUserEmail || instructor?.email || null;
};

const createJwtAssertion = ({ issuer, subject, privateKey, scopes }) => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: issuer,
      sub: subject,
      aud: GOOGLE_TOKEN_URL,
      scope: scopes.join(" "),
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
    privateKey,
    {
      algorithm: "RS256",
    }
  );
};

const getAccessTokenForSubject = async (config, subjectEmail) => {
  const cacheKey = `${subjectEmail}:${GOOGLE_MEET_SCOPES.join(",")}`;
  const cachedToken = tokenCache.get(cacheKey);

  if (isTokenUsable(cachedToken)) {
    return cachedToken.token;
  }

  const assertion = createJwtAssertion({
    issuer: config.serviceAccountEmail,
    subject: subjectEmail,
    privateKey: config.privateKey,
    scopes: GOOGLE_MEET_SCOPES,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token exchange failed: ${errorText}`);
  }

  const payload = await response.json();
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  });

  return payload.access_token;
};

const callGoogleMeetApi = async ({
  config,
  subjectEmail,
  path,
  method = "GET",
  query,
  body,
}) => {
  const accessToken = await getAccessTokenForSubject(config, subjectEmail);
  const url = new URL(`${GOOGLE_MEET_API_BASE_URL}${path}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Meet API request failed: ${errorText}`);
  }

  return response.json();
};

const listAllConferenceRecords = async ({ config, subjectEmail, filter }) => {
  const records = [];
  let pageToken = null;

  do {
    const response = await callGoogleMeetApi({
      config,
      subjectEmail,
      path: "/conferenceRecords",
      query: {
        filter,
        pageSize: 25,
        pageToken,
      },
    });

    records.push(...(response.conferenceRecords || []));
    pageToken = response.nextPageToken || null;
  } while (pageToken);

  return records;
};

const listConferenceParticipants = async ({ config, subjectEmail, conferenceName }) => {
  const response = await callGoogleMeetApi({
    config,
    subjectEmail,
    path: `/${conferenceName}/participants`,
    query: {
      pageSize: 100,
    },
  });

  return response.participants || [];
};

const pickConferenceRecord = (session, conferenceRecords) => {
  if (!conferenceRecords.length) {
    return null;
  }

  const scheduledAt = new Date(session.scheduledStartTime).getTime();

  return [...conferenceRecords].sort((left, right) => {
    const leftDelta = Math.abs(new Date(left.startTime).getTime() - scheduledAt);
    const rightDelta = Math.abs(new Date(right.startTime).getTime() - scheduledAt);
    return leftDelta - rightDelta;
  })[0];
};

const getConferenceFilter = (session) => {
  const scheduledAt = new Date(session.scheduledStartTime);
  const windowStart = new Date(scheduledAt.getTime() - CONFERENCE_LOOKBACK_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(
    scheduledAt.getTime() + CONFERENCE_LOOKAHEAD_HOURS * 60 * 60 * 1000
  );

  return `space.name = "${session.googleMeetSpaceName}" AND start_time >= "${windowStart.toISOString()}" AND start_time <= "${windowEnd.toISOString()}"`;
};

const buildVerificationEvidence = ({ record, participants, instructor }) => {
  const normalizedInstructorGoogleUser = instructor?.googleId
    ? `users/${instructor.googleId}`
    : null;
  const normalizedInstructorName = String(
    instructor?.fullName || instructor?.name || ""
  )
    .trim()
    .toLowerCase();
  const instructorParticipant = participants.find((participant) => {
    if (normalizedInstructorGoogleUser && participant?.signedinUser?.user === normalizedInstructorGoogleUser) {
      return true;
    }

    const displayName = String(participant?.signedinUser?.displayName || "").trim().toLowerCase();
    return Boolean(normalizedInstructorName && displayName && displayName === normalizedInstructorName);
  });

  return {
    conferenceName: record.name,
    startTime: record.startTime,
    endTime: record.endTime || null,
    participantCount: participants.length,
    instructorPresenceMatched: Boolean(instructorParticipant),
    participants: participants.map((participant) => ({
      name: participant.name,
      displayName:
        participant.signedinUser?.displayName ||
        participant.anonymousUser?.displayName ||
        participant.phoneUser?.displayName ||
        "Participant",
      signedInUser: participant.signedinUser?.user || null,
      earliestStartTime: participant.earliestStartTime || null,
      latestEndTime: participant.latestEndTime || null,
    })),
  };
};

const getVerificationStatusWithoutRecord = (session, asOf) => {
  const scheduledAt = new Date(session.scheduledStartTime);
  const graceCutoff = new Date(
    scheduledAt.getTime() + VERIFICATION_GRACE_HOURS * 60 * 60 * 1000
  );

  return asOf >= graceCutoff ? "UNVERIFIED" : "PENDING";
};

const shouldSyncSessionVerification = (session, asOf = new Date()) => {
  if (
    session.meetingProvider !== GOOGLE_MEET_PROVIDER ||
    !session.googleMeetSpaceName ||
    session.status === "CANCELLED"
  ) {
    return false;
  }

  if (new Date(session.scheduledStartTime) > asOf) {
    return false;
  }

  if (session.verificationStatus === "VERIFIED") {
    return false;
  }

  if (!session.verificationCheckedAt) {
    return true;
  }

  return (
    asOf.getTime() - new Date(session.verificationCheckedAt).getTime() >
    VERIFICATION_RECHECK_MINUTES * 60 * 1000
  );
};

export const isGoogleMeetAutomationAvailable = () => {
  const config = getGoogleMeetIntegrationConfig();
  return Boolean(config.serviceAccountEmail && config.privateKey && config.delegatedUserEmail);
};

export const provisionGoogleMeetSession = async ({ instructor }) => {
  const config = getGoogleMeetIntegrationConfig();

  if (!isGoogleMeetAutomationAvailable()) {
    return {
      automationAvailable: false,
      meetingProvider: GOOGLE_MEET_PROVIDER,
      verificationStatus: "MANUAL_ONLY",
    };
  }

  const subjectEmail = getEffectiveSubjectEmail(config, instructor);

  if (!subjectEmail) {
    throw new Error("Google Meet organizer email could not be resolved.");
  }

  const space = await callGoogleMeetApi({
    config,
    subjectEmail,
    path: "/spaces",
    method: "POST",
    body: {},
  });

  return {
    automationAvailable: true,
    meetingProvider: GOOGLE_MEET_PROVIDER,
    meetingUrl: space.meetingUri || null,
    meetingCode: space.meetingCode || null,
    googleMeetSpaceName: space.name || null,
    googleMeetOrganizerEmail: subjectEmail,
    verificationStatus: "PENDING",
  };
};

export const syncGoogleMeetVerificationForSession = async (session, { asOf = new Date() } = {}) => {
  if (!shouldSyncSessionVerification(session, asOf)) {
    return session;
  }

  const config = getGoogleMeetIntegrationConfig();

  if (!isGoogleMeetAutomationAvailable()) {
    return session;
  }

  const subjectEmail = session.googleMeetOrganizerEmail || config.delegatedUserEmail;

  if (!subjectEmail) {
    return session;
  }

  try {
    const conferenceRecords = await listAllConferenceRecords({
      config,
      subjectEmail,
      filter: getConferenceFilter(session),
    });
    const conferenceRecord = pickConferenceRecord(session, conferenceRecords);

    if (!conferenceRecord) {
      const verificationStatus = getVerificationStatusWithoutRecord(session, asOf);
      return {
        ...session,
        verificationStatus,
        verificationCheckedAt: asOf,
      };
    }

    const participants = await listConferenceParticipants({
      config,
      subjectEmail,
      conferenceName: conferenceRecord.name,
    });

    const actualStartTime = conferenceRecord.startTime ? new Date(conferenceRecord.startTime) : null;
    const endedAt = conferenceRecord.endTime ? new Date(conferenceRecord.endTime) : null;
    const durationMinutes = diffMinutes(actualStartTime, endedAt);
    const verified =
      Boolean(actualStartTime) &&
      Boolean(endedAt) &&
      durationMinutes !== null &&
      durationMinutes >= MIN_VERIFIED_DURATION_MINUTES;
    const providerEvidence = buildVerificationEvidence({
      record: conferenceRecord,
      participants,
      instructor: session.instructor,
    });

    return {
      ...session,
      status: verified ? "HOSTED" : session.status,
      hostConfirmed: verified ? true : session.hostConfirmed,
      actualStartTime: actualStartTime || session.actualStartTime,
      endedAt: endedAt || session.endedAt,
      durationMinutes: durationMinutes ?? session.durationMinutes,
      providerConferenceName: conferenceRecord.name,
      providerParticipantCount: participants.length,
      verificationStatus: verified ? "VERIFIED" : getVerificationStatusWithoutRecord(session, asOf),
      providerVerifiedAt: verified ? asOf : session.providerVerifiedAt,
      verificationCheckedAt: asOf,
      providerEvidence,
    };
  } catch {
    return session;
  }
};

export const syncGoogleMeetVerificationsForSessions = async (
  sessions,
  { asOf = new Date() } = {}
) => {
  const nextSessions = [];

  for (const session of sessions) {
    nextSessions.push(await syncGoogleMeetVerificationForSession(session, { asOf }));
  }

  return nextSessions;
};

export const persistLiveSessionVerification = async (prismaClient, session) => {
  const existing = await prismaClient.liveSession.findUnique({
    where: { id: session.id },
    select: {
      status: true,
      hostConfirmed: true,
      actualStartTime: true,
      endedAt: true,
      durationMinutes: true,
      providerConferenceName: true,
      providerParticipantCount: true,
      verificationStatus: true,
      providerVerifiedAt: true,
      verificationCheckedAt: true,
      providerEvidence: true,
    },
  });

  if (!existing) {
    return session;
  }

  const nextData = {
    status: session.status,
    hostConfirmed: session.hostConfirmed,
    actualStartTime: session.actualStartTime,
    endedAt: session.endedAt,
    durationMinutes: session.durationMinutes,
    providerConferenceName: session.providerConferenceName || null,
    providerParticipantCount: session.providerParticipantCount ?? null,
    verificationStatus: session.verificationStatus,
    providerVerifiedAt: session.providerVerifiedAt || null,
    verificationCheckedAt: session.verificationCheckedAt || null,
    providerEvidence: session.providerEvidence || null,
  };

  const unchanged =
    existing.status === nextData.status &&
    existing.hostConfirmed === nextData.hostConfirmed &&
    String(existing.actualStartTime || "") === String(nextData.actualStartTime || "") &&
    String(existing.endedAt || "") === String(nextData.endedAt || "") &&
    Number(existing.durationMinutes ?? -1) === Number(nextData.durationMinutes ?? -1) &&
    String(existing.providerConferenceName || "") === String(nextData.providerConferenceName || "") &&
    Number(existing.providerParticipantCount ?? -1) === Number(nextData.providerParticipantCount ?? -1) &&
    existing.verificationStatus === nextData.verificationStatus &&
    String(existing.providerVerifiedAt || "") === String(nextData.providerVerifiedAt || "") &&
    String(existing.verificationCheckedAt || "") === String(nextData.verificationCheckedAt || "") &&
    JSON.stringify(existing.providerEvidence || null) === JSON.stringify(nextData.providerEvidence || null);

  if (unchanged) {
    return session;
  }

  await prismaClient.liveSession.update({
    where: { id: session.id },
    data: nextData,
  });

  return session;
};

export const GOOGLE_MEET_VERIFICATION_VALUES = {
  PROVIDER: GOOGLE_MEET_PROVIDER,
  MIN_VERIFIED_DURATION_MINUTES,
};
