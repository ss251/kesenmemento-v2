// Contributor backend: configuration.
//
// Everything the service needs comes from environment variables (README: docs/contrib/README.md, table in
// docs/contrib/DEPLOY.md). `loadConfig(env, overrides)` validates them once at start-up and returns a frozen,
// plain object. Overrides use the camelCase keys below and win over the environment (tests and `start({...})` use
// them). A bad configuration throws a ConfigError that lists every problem; it never repeats a secret's value.

/** Service version reported by /health and the start-up line. */
export const VERSION = "1.0.0";

/** The consent/privacy text version a submission was made under (docs/contrib/PRIVACY.md). */
export const PRIVACY_VERSION = "2026-10-05";

export const CATEGORIES = Object.freeze(["building", "road", "shop", "sign", "landmark", "other"]);
export const STATUSES = Object.freeze(["new", "accepted", "used", "rejected"]);
export const KINDS = Object.freeze(["issue", "fix"]);

/** The app origins that may call the API from a browser unless ALLOWED_ORIGINS says otherwise. */
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://kesenmemento.com",
  "https://www.kesenmemento.com",
  "https://kesennuma-living-city-production.up.railway.app",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
]);

/** Where "open in app" links in the admin page point. */
export const DEFAULT_APP_URL = "https://kesenmemento.com";

const MIB = 1024 * 1024;

/** Thrown by loadConfig; `.problems` holds one human sentence per bad setting. */
export class ConfigError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super("invalid contributor-service configuration:\n  - " + problems.join("\n  - "));
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/**
 * Normalise an origin ("https://host[:port]"): lower-case scheme and host, no path, no trailing slash.
 * @param {string} s
 * @returns {string | null} null when it is not a plain http(s) origin
 */
export function normalizeOrigin(s) {
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/\/+$/, ""); // a pasted trailing slash is fine
  if (!/^https?:\/\/[^\s/?#@]+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.username || u.password || u.pathname !== "/" || u.search || u.hash) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Parse and validate the service configuration.
 *
 * @param {Record<string, string | undefined>} [env] usually process.env
 * @param {Record<string, any>} [overrides] camelCase keys (port, adminToken, dbPath, ...) that win over env
 * @returns {Readonly<ServiceConfig>}
 *
 * @typedef {object} ServiceConfig
 * @property {number} port
 * @property {string} host
 * @property {string} dbPath
 * @property {"disk" | "s3"} storage
 * @property {string} diskDir
 * @property {{bucket: string, region: string, endpoint: string | null, accessKeyId: string | null, secretAccessKey: string | null} | null} s3
 * @property {string} adminToken
 * @property {string} tokenSecret
 * @property {string[]} allowedOrigins
 * @property {string} appUrl
 * @property {number} maxPhotos
 * @property {number} maxPhotoBytes
 * @property {number} maxShotBytes
 * @property {number} maxBodyBytes
 * @property {number} dailyLimit contributor submissions per rolling 24 h
 * @property {number} ipDailyLimit submissions per client IP per rolling 24 h
 * @property {number} dailyBytes upload volume (request bytes of stored submissions) per contributor per rolling 24 h
 * @property {number} ipDailyBytes upload volume per client IP per rolling 24 h
 * @property {number} minFreeBytes refuse uploads when the data volume has less free space than this (0 = no check)
 * @property {number} uploadBufferBytes memory budget for request bodies being received, queued or processed
 * @property {number} uploadMinBytesPerSec an upload slower than this (after the grace period) is cut off
 * @property {number} uploadGraceMs time an upload may be slow before the minimum rate applies
 * @property {number} uploadDeadlineMs longest an upload may take to arrive
 * @property {number} maxUploadsPerIp uploads one network may have in flight at once
 * @property {number} maxPixels largest image (in pixels) the server will decode
 * @property {{issue: number, fix: number}} points default points on accept, per kind
 * @property {number} trustProxy number of reverse-proxy hops whose X-Forwarded-For entry is trusted (0 = none)
 * @property {number} maxConcurrentUploads
 * @property {RateLimits} limits
 *
 * @typedef {object} RateLimits
 * @property {number} perMinuteIp all API requests per IP per minute
 * @property {number} createPerHourIp new anonymous contributors per IP per hour
 * @property {number} claimPerHourIp transfer-code claim attempts per IP per hour
 * @property {number} submitAttemptsPerHourIp POST /submissions attempts (including rejected ones) per IP per hour
 * @property {number} adminFailPer15MinIp wrong admin tokens per IP per 15 minutes before it is locked out
 * @property {number} transferCodesPerHour transfer codes one contributor may mint per hour
 */
export function loadConfig(env = process.env, overrides = {}) {
  const problems = [];
  const pick = (key, envName) => (overrides[key] !== undefined ? overrides[key] : env[envName]);
  const str = (key, envName, def) => {
    const v = pick(key, envName);
    return v === undefined || v === null || String(v) === "" ? def : String(v);
  };
  const num = (key, envName, def, { min = -Infinity, max = Infinity, int = true } = {}) => {
    const v = pick(key, envName);
    if (v === undefined || v === null || v === "") return def;
    const n = Number(v);
    if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < min || n > max) {
      problems.push(`${envName} must be ${int ? "an integer" : "a number"} between ${min} and ${max}`);
      return def;
    }
    return n;
  };

  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
  const port = num("port", "PORT", 8788, { min: 0, max: 65535 });
  const host = str("host", "HOST", onRailway ? "0.0.0.0" : "127.0.0.1");
  const dbPath = str("dbPath", "DB_PATH", "./.contrib/contrib.db");

  const storage = str("storage", "STORAGE", "disk").toLowerCase();
  if (storage !== "disk" && storage !== "s3") problems.push("STORAGE must be 'disk' or 's3'");
  const diskDir = str("diskDir", "DISK_DIR", "./.contrib/files");

  let s3 = null;
  if (storage === "s3") {
    const bucket = str("s3Bucket", "S3_BUCKET", "");
    const endpoint = str("s3Endpoint", "S3_ENDPOINT", "") || null;
    const region = str("s3Region", "S3_REGION", endpoint ? "auto" : "");
    const accessKeyId = str("awsAccessKeyId", "AWS_ACCESS_KEY_ID", "") || str("s3AccessKeyId", "S3_ACCESS_KEY_ID", "") || null;
    const secretAccessKey = str("awsSecretAccessKey", "AWS_SECRET_ACCESS_KEY", "") || str("s3SecretAccessKey", "S3_SECRET_ACCESS_KEY", "") || null;
    if (!bucket) problems.push("S3_BUCKET is required when STORAGE=s3");
    if (!region) problems.push("S3_REGION is required when STORAGE=s3 (or set S3_ENDPOINT for an S3-compatible service)");
    if (!accessKeyId || !secretAccessKey) problems.push("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when STORAGE=s3");
    if (endpoint && !/^https?:\/\/[^\s]+$/i.test(endpoint)) problems.push("S3_ENDPOINT must be an http(s) URL");
    s3 = { bucket, region, endpoint, accessKeyId, secretAccessKey };
  }

  const adminToken = str("adminToken", "ADMIN_TOKEN", "");
  if (!adminToken) problems.push("ADMIN_TOKEN is required");
  else if (adminToken.length < 24) problems.push("ADMIN_TOKEN must be at least 24 characters");
  else if (/\s/.test(adminToken)) problems.push("ADMIN_TOKEN must not contain whitespace");
  const tokenSecret = str("tokenSecret", "TOKEN_SECRET", "");
  if (!tokenSecret) problems.push("TOKEN_SECRET is required");
  else if (tokenSecret.length < 16) problems.push("TOKEN_SECRET must be at least 16 characters");
  if (adminToken && tokenSecret && adminToken === tokenSecret) problems.push("ADMIN_TOKEN and TOKEN_SECRET must differ");

  const originsRaw = pick("allowedOrigins", "ALLOWED_ORIGINS");
  let allowedOrigins;
  if (originsRaw === undefined || originsRaw === null || String(originsRaw).trim() === "") allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS];
  else {
    const items = Array.isArray(originsRaw) ? originsRaw : String(originsRaw).split(",");
    allowedOrigins = [];
    for (const item of items.map((s) => String(s).trim()).filter(Boolean)) {
      const o = normalizeOrigin(item);
      if (!o) problems.push(`ALLOWED_ORIGINS entry '${item.slice(0, 80)}' is not an origin like https://host[:port] (wildcards are not supported)`);
      else if (!allowedOrigins.includes(o)) allowedOrigins.push(o);
    }
    if (!allowedOrigins.length) problems.push("ALLOWED_ORIGINS has no valid origin");
  }
  const appUrlRaw = str("appUrl", "APP_URL", DEFAULT_APP_URL);
  let appUrl = DEFAULT_APP_URL;
  try {
    const u = new URL(appUrlRaw);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    u.hash = ""; // the "open in app" link appends ?cam=...; an existing query (?look=photo) is kept
    appUrl = u.toString();
  } catch {
    problems.push("APP_URL must be an http(s) URL");
  }

  const maxPhotos = num("maxPhotos", "MAX_PHOTOS", 6, { min: 0, max: 20 });
  const maxPhotoMb = num("maxPhotoMb", "MAX_PHOTO_MB", 15, { min: 0.1, max: 100, int: false });
  const maxShotMb = num("maxShotMb", "MAX_SHOT_MB", 8, { min: 0.1, max: 50, int: false });
  const dailyLimit = num("dailyLimit", "DAILY_LIMIT", 20, { min: 1, max: 1000 });
  const ipDailyLimit = num("ipDailyLimit", "IP_DAILY_LIMIT", dailyLimit * 3, { min: 1, max: 100000 });
  const dailyMb = num("dailyMb", "DAILY_MB", 1024, { min: 0.001, max: 1_000_000, int: false });
  const ipDailyMb = num("ipDailyMb", "IP_DAILY_MB", dailyMb * 3, { min: 0.001, max: 10_000_000, int: false });
  const minFreeMb = num("minFreeMb", "MIN_FREE_MB", 512, { min: 0, max: 10_000_000, int: false });
  const uploadBufferMb = num("uploadBufferMb", "UPLOAD_BUFFER_MB", 256, { min: 0.01, max: 100000, int: false });
  const uploadMinKbps = num("uploadMinKbps", "UPLOAD_MIN_KBPS", 16, { min: 0, max: 100000, int: false });
  const uploadGraceS = num("uploadGraceS", "UPLOAD_GRACE_S", 20, { min: 0.05, max: 3600, int: false });
  const uploadTimeoutS = num("uploadTimeoutS", "UPLOAD_TIMEOUT_S", 600, { min: 0.1, max: 86400, int: false });
  const maxUploadsPerIp = num("maxUploadsPerIp", "MAX_UPLOADS_PER_IP", 3, { min: 1, max: 1000 });
  const maxImageMp = num("maxImageMp", "MAX_IMAGE_MP", 64, { min: 0.01, max: 1000, int: false });
  const pointsIssue = num("pointsIssue", "POINTS_ISSUE", 5, { min: 0, max: 10000 });
  const pointsFix = num("pointsFix", "POINTS_FIX", 20, { min: 0, max: 10000 });
  const trustProxy = num("trustProxy", "TRUST_PROXY", onRailway ? 1 : 0, { min: 0, max: 5 });
  const maxConcurrentUploads = num("maxConcurrentUploads", "MAX_CONCURRENT_UPLOADS", 3, { min: 1, max: 32 });

  const limits = {
    perMinuteIp: num("rateLimitPerMinute", "RATE_LIMIT_PER_MIN", 240, { min: 10, max: 100000 }),
    createPerHourIp: num("createPerHour", "CREATE_LIMIT_PER_HOUR", 30, { min: 1, max: 10000 }),
    claimPerHourIp: num("claimPerHour", "CLAIM_LIMIT_PER_HOUR", 5, { min: 1, max: 1000 }),
    submitAttemptsPerHourIp: num("submitAttemptsPerHour", "SUBMIT_ATTEMPTS_PER_HOUR", 60, { min: 1, max: 10000 }),
    adminFailPer15MinIp: num("adminFailLimit", "ADMIN_FAIL_LIMIT", 10, { min: 1, max: 1000 }),
    transferCodesPerHour: num("transferCodesPerHour", "TRANSFER_CODES_PER_HOUR", 10, { min: 1, max: 1000 }),
  };

  if (problems.length) throw new ConfigError(problems);

  const maxPhotoBytes = Math.floor(maxPhotoMb * MIB);
  const maxShotBytes = Math.floor(maxShotMb * MIB);
  return Object.freeze({
    port, host, dbPath, storage, diskDir, s3, adminToken, tokenSecret, allowedOrigins, appUrl,
    maxPhotos, maxPhotoBytes, maxShotBytes,
    // one request carries at most MAX_PHOTOS photos + the screenshot + a little for the text fields and multipart framing
    maxBodyBytes: maxPhotos * maxPhotoBytes + maxShotBytes + MIB,
    dailyLimit, ipDailyLimit,
    dailyBytes: Math.floor(dailyMb * MIB), ipDailyBytes: Math.floor(ipDailyMb * MIB), minFreeBytes: Math.floor(minFreeMb * MIB),
    // the budget must at least fit the largest single request, or that request could never run
    uploadBufferBytes: Math.max(Math.floor(uploadBufferMb * MIB), maxPhotos * maxPhotoBytes + maxShotBytes + MIB),
    uploadMinBytesPerSec: Math.floor(uploadMinKbps * 1024), uploadGraceMs: Math.floor(uploadGraceS * 1000), uploadDeadlineMs: Math.floor(uploadTimeoutS * 1000),
    maxUploadsPerIp, maxPixels: Math.floor(maxImageMp * 1_000_000),
    points: Object.freeze({ issue: pointsIssue, fix: pointsFix }),
    trustProxy, maxConcurrentUploads,
    limits: Object.freeze(limits),
  });
}

/**
 * A copy of the configuration that is safe to print: secrets are replaced by "set".
 * @param {ServiceConfig} c
 */
export function describeConfig(c) {
  return {
    port: c.port, host: c.host, storage: c.storage,
    dbPath: c.dbPath, diskDir: c.storage === "disk" ? c.diskDir : undefined,
    s3: c.s3 ? { bucket: c.s3.bucket, region: c.s3.region, endpoint: c.s3.endpoint, credentials: c.s3.accessKeyId ? "set" : "missing" } : undefined,
    adminToken: "set", tokenSecret: "set",
    allowedOrigins: c.allowedOrigins, appUrl: c.appUrl,
    maxPhotos: c.maxPhotos, maxPhotoMb: c.maxPhotoBytes / MIB, maxShotMb: c.maxShotBytes / MIB,
    dailyLimit: c.dailyLimit, ipDailyLimit: c.ipDailyLimit, dailyMb: c.dailyBytes / MIB, ipDailyMb: c.ipDailyBytes / MIB, minFreeMb: c.minFreeBytes / MIB,
    uploadBufferMb: c.uploadBufferBytes / MIB, maxImageMp: c.maxPixels / 1e6, points: c.points,
    trustProxy: c.trustProxy,
  };
}
