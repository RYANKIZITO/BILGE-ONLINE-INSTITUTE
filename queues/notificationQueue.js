import { Queue } from "bullmq";
import IORedis from "ioredis";

export const NOTIFICATION_QUEUE_NAME = "notifications";

const normalizeString = (value) => String(value || "").trim();

export const getRedisConnectionOptions = () => {
  const redisUrl = normalizeString(process.env.REDIS_URL);

  if (redisUrl) {
    return {
      connectionString: redisUrl,
      maxRetriesPerRequest: null,
    };
  }

  const port = Number.parseInt(String(process.env.REDIS_PORT || "6379"), 10);

  return {
    host: normalizeString(process.env.REDIS_HOST) || "127.0.0.1",
    port: Number.isFinite(port) ? port : 6379,
    username: normalizeString(process.env.REDIS_USERNAME) || undefined,
    password: normalizeString(process.env.REDIS_PASSWORD) || undefined,
    db: Number.parseInt(String(process.env.REDIS_DB || "0"), 10) || 0,
    maxRetriesPerRequest: null,
  };
};

export const createRedisConnection = () => {
  const options = getRedisConnectionOptions();

  if (typeof options?.connectionString === "string" && options.connectionString) {
    return new IORedis(options.connectionString, {
      maxRetriesPerRequest: options.maxRetriesPerRequest,
    });
  }

  return new IORedis(options);
};

const queueConnection = createRedisConnection();

export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
