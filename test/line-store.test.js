// Store: create, delete, retention, the hashed user ref, and encrypted contact.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, userRefOf, encryptUserId, decryptUserId } from "../server/line/store.js";
import { prepareImage, sampleJpeg } from "../server/line/media.js";

const KEY = Buffer.alloc(32, 9);
const dirs = [];
const stores = [];

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "line-store-"));
  dirs.push(dir);
  const store = openStore({ dataDir: dir, storeKey: KEY });
  stores.push(store);
  return { dir, store };
}

afterEach(() => {
  while (stores.length) {
    try { stores.pop().close(); } catch { /* already closed */ }
  }
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("store", () => {
  test("user_ref is 22 characters and the LINE id round-trips only through encryption", () => {
    const id = "U" + "ab".repeat(16);
    expect(userRefOf(id, KEY)).toHaveLength(22);
    expect(userRefOf(id, KEY)).toBe(userRefOf(id, KEY));
    expect(userRefOf(id, KEY)).not.toBe(userRefOf(id + "x", KEY));
    const enc = encryptUserId(id, KEY);
    expect(enc).not.toContain(id);
    expect(decryptUserId(enc, KEY)).toBe(id);
    expect(encryptUserId(id, KEY)).not.toBe(enc);
  });

  test("reports get KM-0001 codes, and the raw user id is not in the database file", () => {
    const { dir, store } = setup();
    const id = "U" + "cd".repeat(16);
    const ref = store.userRef(id);
    store.upsertContact(ref, id, 1_700_000_000_000);
    const image = store.saveImage(prepareImage(sampleJpeg({ exif: true, w: 4, h: 3 })));
    expect(image.w).toBe(4);
    expect(readFileSync(join(dir, image.path)).toString("latin1")).not.toContain("FAKEGPS");
    const a = store.createReport({ kind: "bug", text: "一つ目", device: "phone", mode: "walk", lang: "ja", photoConsent: 0, media: [image] }, ref, 1_700_000_000_000);
    const b = store.createReport({ kind: "idea", text: "二つ目", lang: "ja", media: [] }, ref, 1_700_000_001_000);
    expect(a.code).toBe("KM-0001");
    expect(b.code).toBe("KM-0002");
    expect(store.getReportForUser(ref, "KM-0001").text).toBe("一つ目");
    expect(store.getReportForUser("other", "KM-0001")).toBe(null);
    expect(store.mediaFor(a.id)).toHaveLength(1);
    expect(store.lineUserId(ref)).toBe(id);
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    for (const name of ["line.db", "line.db-wal"]) {
      try {
        expect(readFileSync(join(dir, name)).includes(Buffer.from(id))).toBe(false);
      } catch { /* no wal file */ }
    }
  });

  test("削除 removes reports, media and the contact, and does not reset the daily counter", () => {
    const { store } = setup();
    const ref = store.userRef("Udelete");
    store.upsertContact(ref, "Udelete");
    const image = store.saveImage(prepareImage(sampleJpeg()));
    const report = store.createReport({ kind: "photo", text: "", photoConsent: 1, media: [image], lang: "ja" }, ref, Date.now());
    expect(store.reportsToday(ref, Date.now())).toBe(1);
    const file = join(store.root, image.path);
    expect(statSync(file).size).toBeGreaterThan(0);
    const gone = store.deleteUser(ref);
    expect(gone.reports).toBe(1);
    expect(store.getByCode(report.code)).toBe(null);
    expect(store.lineUserId(ref)).toBe(null);
    expect(store.loadSession(ref)).toBe(null);
    expect(() => statSync(file)).toThrow();
    expect(store.reportsToday(ref, Date.now())).toBe(1);
  });

  test("retention: rejected photos after 30 days, closed reports after 180, open reports stay, events last 7 days", () => {
    const { dir, store } = setup();
    const ref = store.userRef("Uretain");
    const t0 = Date.parse("2026-01-01T00:00:00.000Z");
    const photo = store.saveImage(prepareImage(sampleJpeg({ w: 2, h: 2 })));
    const rejected = store.createReport({ kind: "photo", text: "見送り", media: [photo], lang: "ja", photoConsent: 1 }, ref, t0);
    store.setStatus(rejected.code, "rejected", t0);
    const openImage = store.saveImage(prepareImage(sampleJpeg({ w: 5, h: 5 })));
    const open = store.createReport({ kind: "bug", text: "開いたまま", media: [openImage], lang: "ja" }, ref, t0);
    store.markEvent("evt-old", t0);
    const orphan = join(dir, "media", "zz-orphan.bin");
    writeFileSync(orphan, Buffer.from("old"));
    const old = (t0 - 3 * 86400000) / 1000;
    utimesSync(orphan, old, old);
    const fresh = join(dir, "media", "zz-fresh.bin");
    writeFileSync(fresh, Buffer.from("new"));
    const freshAt = (t0 + 31 * 86400000) / 1000;
    utimesSync(fresh, freshAt, freshAt);

    store.runRetention(t0 + 31 * 86400000);
    expect(store.mediaFor(rejected.id)).toEqual([]);
    expect(() => statSync(join(dir, photo.path))).toThrow();
    expect(store.getByCode(rejected.code).text).toBe("見送り");
    expect(store.mediaFor(open.id)).toHaveLength(1);
    expect(statSync(fresh).size).toBe(3);
    expect(() => statSync(orphan)).toThrow();

    store.markEvent("evt-new", t0 + 180 * 86400000);
    store.runRetention(t0 + 181 * 86400000);
    expect(store.getByCode(rejected.code)).toBe(null);
    expect(store.getByCode(open.code).text).toBe("開いたまま");
    expect(store.markEvent("evt-old", t0 + 181 * 86400000)).toBe(true);
    expect(store.markEvent("evt-new", t0 + 181 * 86400000)).toBe(false);
  });

  test("a view tag is stored only as V plus two digits", () => {
    const { store } = setup();
    const ref = store.userRef("Uview");
    const ok = store.createReport({ kind: "photo", text: "岸壁", lang: "ja", photoConsent: 1, viewId: "V07", media: [] }, ref, 1_700_000_000_000);
    const bad = store.createReport({ kind: "photo", text: "だめ", lang: "ja", photoConsent: 1, viewId: "../V07", media: [] }, ref, 1_700_000_000_100);
    expect(store.getByCode(ok.code).view_id).toBe("V07");
    expect(store.getByCode(bad.code).view_id).toBe(null);
  });

  test("sessions round-trip and duplicate webhook ids are ignored", () => {
    const { store } = setup();
    expect(store.markEvent("evt-1", 10)).toBe(true);
    expect(store.markEvent("evt-1", 11)).toBe(false);
    store.saveSession("ref", { lang: "en", flow: "idea", step: "text", draft: null, updatedAt: 10 });
    expect(store.loadSession("ref").lang).toBe("en");
  });
});
