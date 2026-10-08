// LINE bot configuration. Everything comes from the environment. Overrides (camelCase) win, which is
// how tests and `start({...})` inject a temp directory and fake secrets. A bad configuration throws
// a ConfigError that lists every problem and never repeats a secret's value.

export const VERSION = "1.0.0";

export class ConfigError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super("invalid LINE bot configuration:\n  - " + problems.join("\n  - "));
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/**
 * Decode LINE_STORE_KEY (base64 or base64url) to the 32 bytes AES-256 and HMAC need.
 * @param {string} raw
 * @returns {Buffer | null}
 */
export function decodeStoreKey(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const enc of ["base64", "base64url"]) {
    const buf = Buffer.from(s, enc);
    if (buf.length === 32) return buf;
  }
  return null;
}

function localBase(url) {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {Record<string, any>} [overrides]
 */
export function loadConfig(env = process.env, overrides = {}) {
  const problems = [];
  const pick = (key, envName) => (overrides[key] !== undefined ? overrides[key] : env[envName]);
  const str = (key, envName, def) => {
    const v = pick(key, envName);
    return v === undefined || v === null || String(v) === "" ? def : String(v).trim();
  };
  const num = (key, envName, def, { min = -Infinity, max = Infinity } = {}) => {
    const v = pick(key, envName);
    if (v === undefined || v === null || v === "") return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${envName} must be an integer between ${min} and ${max}`);
      return def;
    }
    return n;
  };
  const flag = (key, envName) => {
    const v = pick(key, envName);
    if (v === undefined || v === null || v === "") return false;
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
  };

  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
  const port = num("port", "PORT", 8093, { min: 0, max: 65535 });
  const host = str("host", "HOST", onRailway ? "0.0.0.0" : "127.0.0.1");
  const dataDir = str("dataDir", "DATA_DIR", "./data/line");
  const channelSecret = str("channelSecret", "LINE_CHANNEL_SECRET", "");
  const channelAccessToken = str("channelAccessToken", "LINE_CHANNEL_ACCESS_TOKEN", "");
  // [mint] the channel's ID (チャネルID) lets the bot issue its own 15-minute tokens with the secret (api.js), so a fixed token is optional
  const channelId = str("channelId", "LINE_CHANNEL_ID", "");
  const storeKeyRaw = str("storeKey", "LINE_STORE_KEY", "");
  const adminToken = str("adminToken", "ADMIN_TOKEN", "");
  const publicBaseUrl = str("publicBaseUrl", "PUBLIC_BASE_URL", "").replace(/\/+$/, "");
  const discordWebhookUrl = str("discordWebhookUrl", "DISCORD_WEBHOOK_URL", "");
  const teamLineTo = str("teamLineTo", "TEAM_LINE_TO", "");
  const sim = flag("sim", "LINE_SIM");
  const eventsPerMinute = num("eventsPerMinute", "LINE_EVENTS_PER_MIN", 20, { min: 1, max: 10000 });
  const reportsPerDay = num("reportsPerDay", "LINE_REPORTS_PER_DAY", 30, { min: 1, max: 100000 });
  const syncWebhook = overrides.syncWebhook !== undefined ? Boolean(overrides.syncWebhook) : sim;

  if (!channelSecret) problems.push("LINE_CHANNEL_SECRET is required");
  if (!channelAccessToken && !channelId) problems.push("LINE_CHANNEL_ID (or LINE_CHANNEL_ACCESS_TOKEN) is required");
  if (channelId && !/^\d{6,12}$/.test(channelId)) problems.push("LINE_CHANNEL_ID must be the channel's number (チャネルID)");
  if (channelSecret && channelAccessToken && channelSecret === channelAccessToken) {
    problems.push("LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must differ");
  }
  const storeKey = decodeStoreKey(storeKeyRaw);
  if (!storeKeyRaw) problems.push("LINE_STORE_KEY is required");
  else if (!storeKey) problems.push("LINE_STORE_KEY must be 32 bytes, base64-encoded");
  if (!adminToken) problems.push("ADMIN_TOKEN is required");
  else if (adminToken.length < 24) problems.push("ADMIN_TOKEN must be at least 24 characters");
  else if (/\s/.test(adminToken)) problems.push("ADMIN_TOKEN must not contain whitespace");
  if (adminToken && channelAccessToken && adminToken === channelAccessToken) {
    problems.push("ADMIN_TOKEN and LINE_CHANNEL_ACCESS_TOKEN must differ");
  }
  if (publicBaseUrl) {
    try {
      const u = new URL(publicBaseUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    } catch {
      problems.push("PUBLIC_BASE_URL must be an http(s) URL");
    }
  }
  if (discordWebhookUrl) {
    try {
      const u = new URL(discordWebhookUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    } catch {
      problems.push("DISCORD_WEBHOOK_URL must be an http(s) URL");
    }
  }
  if (sim && (onRailway || (publicBaseUrl && !localBase(publicBaseUrl)))) {
    problems.push("LINE_SIM must not be set on a public or Railway deployment");
  }

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    version: VERSION,
    port, host, dataDir, channelSecret, channelAccessToken, channelId,
    storeKey, adminToken, publicBaseUrl, discordWebhookUrl, teamLineTo,
    sim, syncWebhook, eventsPerMinute, reportsPerDay, onRailway,
    apiBase: str("apiBase", "LINE_API_BASE", "https://api.line.me"),
    dataBase: str("dataBase", "LINE_DATA_BASE", "https://api-data.line.me"),
    timeoutMs: num("timeoutMs", "LINE_TIMEOUT_MS", 10_000, { min: 100, max: 60_000 }),
  });
}

/** A copy that is safe to print. Secrets are "set". */
export function describeConfig(c) {
  return {
    version: c.version,
    port: c.port,
    host: c.host,
    dataDir: c.dataDir,
    publicBaseUrl: c.publicBaseUrl || null,
    sim: c.sim,
    channelSecret: "set",
    channelId: c.channelId ? "set" : "unset",
    channelAccessToken: c.channelId ? "minted" : "set",
    storeKey: "set",
    adminToken: "set",
    discord: c.discordWebhookUrl ? "set" : "unset",
    teamLineTo: c.teamLineTo ? "set" : "unset",
    eventsPerMinute: c.eventsPerMinute,
    reportsPerDay: c.reportsPerDay,
  };
}
