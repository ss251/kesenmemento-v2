// Admin auth, list, detail, CSV, media, the push-quota guard, and the privacy page.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/line/config.js";
import { createApp } from "../server/line/index.js";
import { prepareImage, sampleJpeg } from "../server/line/media.js";
import { FOLLOW_JA } from "../server/line/strings.js";

const TOKEN = "admin-token-must-be-24ch";
const USER = "U" + "c".repeat(32);
const T = 1_700_000_000_000;
const dirs = [];
const apps = [];

function open(api) {
  const dir = mkdtempSync(join(tmpdir(), "line-admin-"));
  dirs.push(dir);
  const config = loadConfig({
    LINE_CHANNEL_SECRET: "channel-secret-test-value",
    LINE_CHANNEL_ACCESS_TOKEN: "channel-token-test-value",
    LINE_STORE_KEY: Buffer.alloc(32, 7).toString("base64"),
    ADMIN_TOKEN: TOKEN,
    DATA_DIR: dir,
    PUBLIC_BASE_URL: "http://127.0.0.1:8943",
    LINE_SIM: "1",
  }, { syncWebhook: true, dataDir: dir });
  const app = createApp(config, {
    api,
    logger: { info() {}, warn() {}, error() {} },
  });
  apps.push(app);
  return app;
}

afterEach(() => {
  while (apps.length) {
    try { apps.pop().close(); } catch { /* already closed */ }
  }
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function auth(password = TOKEN, user = "team") {
  return { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` };
}

function get(app, path, headers = auth()) {
  return app.fetch(new Request(`http://127.0.0.1${path}`, { headers }));
}

describe("admin", () => {
  test("missing or wrong basic auth is 401 with an empty body and no CORS", async () => {
    const app = open();
    const missing = await get(app, "/admin", {});
    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("");
    expect(missing.headers.get("www-authenticate")).toBe('Basic realm="KesenMemento"');
    expect(missing.headers.get("access-control-allow-origin")).toBe(null);
    const wrong = await get(app, "/admin", auth("not-the-admin-token-value"));
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toBe("");
  });

  test("the list filters, the detail links to OpenStreetMap, and pages are no-store and noindex", async () => {
    const app = open();
    const ref = app.store.userRef(USER);
    app.store.createReport({ kind: "bug", text: "地面にめり込みます", device: "phone", lang: "ja", media: [], lat: 38.9072, lon: 141.569 }, ref, T);
    app.store.createReport({ kind: "idea", text: "夜の港を歩くコース", lang: "ja", media: [] }, ref, T + 1000);
    const list = await get(app, "/admin?kind=idea");
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(list.headers.get("x-robots-tag")).toContain("noindex");
    expect(list.headers.get("access-control-allow-origin")).toBe(null);
    const html = await list.text();
    expect(html).toContain("夜の港を歩くコース");
    expect(html).not.toContain("地面にめり込みます");
    expect(html).not.toContain(USER);
    const detail = await get(app, "/admin/r/KM-0001");
    const page = await detail.text();
    expect(page).toContain("地面にめり込みます");
    expect(page).toContain("https://www.openstreetmap.org/?mlat=38.9072&amp;mlon=141.569#map=17/38.9072/141.569");
    expect(page).toContain(ref);
    expect(page).not.toContain(USER);
  });

  test("a photo is served from the admin path and the CSV prefixes formula cells", async () => {
    const app = open();
    const ref = app.store.userRef(USER);
    const image = app.store.saveImage(prepareImage(sampleJpeg({ exif: false, w: 2, h: 2 })));
    app.store.createReport({ kind: "photo", text: "=1+1", photoConsent: 1, media: [image], lang: "ja" }, ref, T);
    const media = app.store.mediaFor(app.store.getByCode("KM-0001").id)[0];
    const photo = await get(app, `/admin/media/${media.id}`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await photo.arrayBuffer())[0]).toBe(0xff);
    const csv = await get(app, "/admin/export.csv");
    const body = await csv.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain("'=1+1");
    expect(body).not.toContain(USER);
  });

  test("直しましたと送る does nothing when the push quota is gone", async () => {
    const pushes = [];
    const app = open({
      quota: async () => ({ type: "limited", value: 200 }),
      consumption: async () => ({ totalUsage: 200 }),
      push: async (to, messages) => { pushes.push({ to, messages }); },
    });
    const ref = app.store.userRef(USER);
    app.store.upsertContact(ref, USER, T);
    app.store.createReport({ kind: "bug", text: "地面にめり込みます", lang: "ja", media: [] }, ref, T);
    const res = await app.fetch(new Request("http://127.0.0.1/admin/r/KM-0001/notify", { method: "POST", headers: auth() }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/r/KM-0001?notice=quota");
    expect(pushes).toHaveLength(0);
    expect(app.store.getByCode("KM-0001").status).toBe("new");
    const page = await (await get(app, "/admin/r/KM-0001?notice=quota")).text();
    expect(page).toContain("今月のプッシュは上限です");
    expect(page).not.toContain("直りましたと送る");
  });

  test("直しましたと送る pushes when quota remains and marks the report fixed", async () => {
    const pushes = [];
    const app = open({
      quota: async () => ({ type: "limited", value: 200 }),
      consumption: async () => ({ totalUsage: 12 }),
      push: async (to, messages) => { pushes.push({ to, messages }); },
    });
    const ref = app.store.userRef(USER);
    app.store.upsertContact(ref, USER, T);
    app.store.createReport({ kind: "bug", text: "地面にめり込みます", lang: "ja", media: [] }, ref, T);
    const res = await app.fetch(new Request("http://127.0.0.1/admin/r/KM-0001/notify", { method: "POST", headers: auth() }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/r/KM-0001?notice=sent");
    expect(pushes).toHaveLength(1);
    expect(pushes[0].to).toBe(USER);
    expect(pushes[0].messages[0].text).toContain("受付番号 KM-0001 は直りました。ありがとうございました！");
    expect(app.store.getByCode("KM-0001").status).toBe("fixed");
  });

  test("the privacy page repeats the follow text and the data rules in both languages", async () => {
    const app = open();
    const res = await get(app, "/privacy", {});
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(FOLLOW_JA.split("\n")[0]);
    expect(html).toContain("プロフィールのAPIは呼びません");
    expect(html).toContain("180日");
    expect(html).toContain("We never call the profile API.");
    expect(html).not.toContain('name="robots"');
  });
});
