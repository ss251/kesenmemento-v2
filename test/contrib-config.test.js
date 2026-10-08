// Contributor backend: configuration (docs/contrib/DEPLOY.md lists every variable).
import { describe, test, expect } from "bun:test";
import { loadConfig, describeConfig, ConfigError, normalizeOrigin, DEFAULT_ALLOWED_ORIGINS } from "../server/contrib/config.js";

const ADMIN = "adm-" + "x".repeat(28), SECRET = "tok-" + "y".repeat(28);
const base = { ADMIN_TOKEN: ADMIN, TOKEN_SECRET: SECRET };
const MIB = 1024 * 1024;

const problems = (env, overrides = {}) => {
  try { loadConfig(env, overrides); } catch (e) { if (e instanceof ConfigError) return e.problems; throw e; }
  return [];
};

describe("defaults", () => {
  const c = loadConfig(base, {});
  test("match the spec: disk storage under ./.contrib, 6 photos of 15 MB, 8 MB screenshot, 20 submissions a day (60 per IP)", () => {
    expect(c.dbPath).toBe("./.contrib/contrib.db");
    expect(c.storage).toBe("disk");
    expect(c.diskDir).toBe("./.contrib/files");
    expect(c.maxPhotos).toBe(6);
    expect(c.maxPhotoBytes).toBe(15 * MIB);
    expect(c.maxShotBytes).toBe(8 * MIB);
    expect(c.dailyLimit).toBe(20);
    expect(c.ipDailyLimit).toBe(60);
    expect(c.s3).toBeNull();
  });
  test("the default CORS allow-list holds the production app and the two local origins", () => {
    expect(c.allowedOrigins).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(c.allowedOrigins).toContain("https://kesennuma-living-city-production.up.railway.app");
    expect(c.allowedOrigins).toContain("http://127.0.0.1:8787");
    expect(c.allowedOrigins).toContain("http://localhost:8787");
  });
  test("default points per kind are 5 (issue) and 20 (fix); the body limit covers every photo plus the screenshot", () => {
    expect(c.points).toEqual({ issue: 5, fix: 20 });
    expect(c.maxBodyBytes).toBe(6 * 15 * MIB + 8 * MIB + MIB);
  });
  test("listens on loopback with no proxy trust unless told otherwise", () => {
    expect(c.host).toBe("127.0.0.1");
    expect(c.trustProxy).toBe(0);
    expect(Object.isFrozen(c)).toBe(true);
  });
  test("on Railway the host opens up and one proxy hop is trusted", () => {
    const r = loadConfig({ ...base, RAILWAY_ENVIRONMENT: "production" }, {});
    expect(r.host).toBe("0.0.0.0");
    expect(r.trustProxy).toBe(1);
    expect(loadConfig({ ...base, RAILWAY_ENVIRONMENT: "production", TRUST_PROXY: "2", HOST: "::" }, {}).trustProxy).toBe(2);
  });
});

describe("environment variables", () => {
  test("every variable of the spec is read", () => {
    const c = loadConfig({
      ...base, PORT: "8981", DB_PATH: "/data/contrib.db", STORAGE: "disk", DISK_DIR: "/data/files",
      ALLOWED_ORIGINS: "https://a.example,http://localhost:5173", MAX_PHOTOS: "3", MAX_PHOTO_MB: "7.5", MAX_SHOT_MB: "4", DAILY_LIMIT: "5",
    }, {});
    expect(c.port).toBe(8981);
    expect(c.dbPath).toBe("/data/contrib.db");
    expect(c.diskDir).toBe("/data/files");
    expect(c.allowedOrigins).toEqual(["https://a.example", "http://localhost:5173"]);
    expect(c.maxPhotos).toBe(3);
    expect(c.maxPhotoBytes).toBe(Math.floor(7.5 * MIB));
    expect(c.maxShotBytes).toBe(4 * MIB);
    expect(c.dailyLimit).toBe(5);
    expect(c.ipDailyLimit).toBe(15); // three times the per-contributor limit unless IP_DAILY_LIMIT says otherwise
    expect(loadConfig({ ...base, DAILY_LIMIT: "5", IP_DAILY_LIMIT: "9" }, {}).ipDailyLimit).toBe(9);
  });
  test("overrides win over the environment", () => {
    const c = loadConfig({ ...base, PORT: "9000" }, { port: 8982, dailyLimit: 2, allowedOrigins: ["https://b.example"] });
    expect(c.port).toBe(8982);
    expect(c.dailyLimit).toBe(2);
    expect(c.allowedOrigins).toEqual(["https://b.example"]);
  });
  test("ADMIN_TOKEN and TOKEN_SECRET are required, the admin token at least 24 characters", () => {
    expect(problems({ TOKEN_SECRET: SECRET })).toContain("ADMIN_TOKEN is required");
    expect(problems({ ADMIN_TOKEN: ADMIN })).toContain("TOKEN_SECRET is required");
    expect(problems({ ...base, ADMIN_TOKEN: "a".repeat(23) })).toContain("ADMIN_TOKEN must be at least 24 characters");
    expect(problems({ ...base, ADMIN_TOKEN: "a".repeat(24) })).toEqual([]);
    expect(problems({ ...base, ADMIN_TOKEN: "has a space " + "a".repeat(24) }).join()).toContain("whitespace");
    expect(problems({ ADMIN_TOKEN: ADMIN, TOKEN_SECRET: ADMIN }).join()).toContain("must differ");
  });
  test("a configuration error lists every problem and never repeats a secret", () => {
    const secretLooking = "S3cr3t-value-that-must-not-leak";
    let msg = "";
    try { loadConfig({ ADMIN_TOKEN: "short-" + secretLooking.slice(0, 4), TOKEN_SECRET: "", STORAGE: "tape", MAX_PHOTOS: "many", AWS_SECRET_ACCESS_KEY: secretLooking }, {}); } catch (e) { msg = e.message; }
    expect(msg).toContain("ADMIN_TOKEN");
    expect(msg).toContain("TOKEN_SECRET");
    expect(msg).toContain("STORAGE must be");
    expect(msg).toContain("MAX_PHOTOS");
    expect(msg).not.toContain(secretLooking);
    expect(msg).not.toContain("short-");
  });
  test("numbers are range-checked", () => {
    for (const [name, value] of [["MAX_PHOTOS", "-1"], ["MAX_PHOTOS", "99"], ["DAILY_LIMIT", "0"], ["MAX_PHOTO_MB", "0"], ["PORT", "70000"], ["PORT", "x"], ["TRUST_PROXY", "9"]]) {
      expect(problems({ ...base, [name]: value }).join()).toContain(name);
    }
    expect(loadConfig({ ...base, PORT: "0" }, {}).port).toBe(0);
  });
});

describe("S3 storage", () => {
  const s3env = { ...base, STORAGE: "s3", S3_BUCKET: "klc", S3_REGION: "ap-northeast-1", AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "secret-example-value" };
  test("takes bucket, region, endpoint and the standard AWS credentials", () => {
    const c = loadConfig({ ...s3env, S3_ENDPOINT: "https://s3.example.com" }, {});
    expect(c.storage).toBe("s3");
    expect(c.s3).toEqual({ bucket: "klc", region: "ap-northeast-1", endpoint: "https://s3.example.com", accessKeyId: "AKIAEXAMPLE", secretAccessKey: "secret-example-value" });
  });
  test("an S3-compatible endpoint makes the region optional (auto)", () => {
    const { S3_REGION, ...noRegion } = s3env;
    expect(problems(noRegion).join()).toContain("S3_REGION");
    expect(loadConfig({ ...noRegion, S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com" }, {}).s3.region).toBe("auto");
  });
  test("bucket and credentials are required", () => {
    expect(problems({ ...s3env, S3_BUCKET: "" }).join()).toContain("S3_BUCKET");
    expect(problems({ ...s3env, AWS_SECRET_ACCESS_KEY: "" }).join()).toContain("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    expect(problems({ ...s3env, S3_ENDPOINT: "ftp://nope" }).join()).toContain("S3_ENDPOINT");
  });
  test("disk settings are not required for s3 and the description hides every secret", () => {
    const c = loadConfig(s3env, {});
    const text = JSON.stringify(describeConfig(c));
    for (const secret of [ADMIN, SECRET, "secret-example-value", "AKIAEXAMPLE"]) expect(text).not.toContain(secret);
    expect(text).toContain("klc");
    expect(describeConfig(c).adminToken).toBe("set");
  });
});

describe("ALLOWED_ORIGINS", () => {
  test("origins are normalised: lower-case, one trailing slash tolerated, duplicates dropped", () => {
    expect(normalizeOrigin("HTTPS://App.Example.com/")).toBe("https://app.example.com");
    expect(normalizeOrigin(" http://localhost:8787 ")).toBe("http://localhost:8787");
    const c = loadConfig({ ...base, ALLOWED_ORIGINS: "https://a.example, https://A.example/ ,https://b.example" }, {});
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
  });
  test("a wildcard, a path, credentials, a bare host or a non-http scheme is refused", () => {
    for (const bad of ["*", "https://a.example/app", "https://user:pw@a.example", "a.example", "ftp://a.example", "https://a.example?x=1", "null"]) {
      expect(normalizeOrigin(bad)).toBeNull();
      expect(problems({ ...base, ALLOWED_ORIGINS: bad }).join()).toContain("ALLOWED_ORIGINS");
    }
  });
  test("APP_URL must be an http(s) URL and defaults to the production app", () => {
    expect(loadConfig(base, {}).appUrl).toBe("https://kesenmemento.com/");
    expect(problems({ ...base, APP_URL: "javascript:alert(1)" }).join()).toContain("APP_URL");
  });
});
