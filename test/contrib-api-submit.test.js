// Contributor backend: POST /submissions, the multipart ingestion pipeline, in-process.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import sharp from "sharp";
import exifr from "exifr";
import { makeApp, API } from "../tools/contrib/testkit.mjs";
import { synthJpeg, synthPng, synthWebp, synthScreenshot, synthHeic, junkHeic, notAnImage, synthPngBomb, addPngText } from "../tools/contrib/synth.mjs";
import { PRIVACY_VERSION } from "../server/contrib/config.js";
import { latLonToEnu } from "../server/contrib/geo.js";

const text = (s) => new TextEncoder().encode(s);
const bytesOf = async (k, key) => new Uint8Array(await new Response((await k.app.storage.open(key)).body).arrayBuffer());
const rows = (k, sql, ...p) => k.app.db.query(sql).all(...p);

describe("a complete submission", () => {
  test("201 {id, status: 'new'} and every field lands where the spec says", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Sakura" });
    const photo1 = await synthJpeg({ width: 2000, height: 1500, lat: 38.9065, lon: 141.5752, alt: 4.2, heading: 120, takenAt: "2026:10:04 14:23:05", offset: "+09:00", make: "Acme", model: "Cam", focal35: 26 });
    const photo2 = await synthPng({ width: 900, height: 600 });
    const shot = await synthScreenshot({ width: 1600, height: 900 });
    const r = await k.submit(me, { category: "building", note: "屋根の色が違います", lang: "ja", photos: [photo1, photo2], screenshot: shot });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: "new", kind: "fix", photos: 2, createdAt: "2026-10-05T03:00:00.000Z" });
    expect(r.body.id).toMatch(/^[0-9a-hjkmnp-tv-z]{16}$/);
    const id = r.body.id;

    const sub = k.app.repo.getSubmission(id);
    expect(sub).toMatchObject({ contributor_id: me.id, created_at: "2026-10-05T03:00:00.000Z", status: "new", kind: "fix", category: "building", note: "屋根の色が違います", lang: "ja", points: 0, reviewer_note: null, reviewed_at: null, used_version: null, used_at: null });
    expect(JSON.parse(sub.pose_json)).toMatchObject({ enu: [12, 1.6, -34], latlon: [38.9063, 141.5751], heading: 120, pitch: -3, fov: 60, mode: "walk", appVersion: "0.1.0", layoutVersion: "v6", timePreset: "noon", season: "autumn", viewport: { w: 390, h: 844 } });
    expect(sub.screenshot_key).toBe(`submissions/2026/10/${id}/screenshot.jpg`);
    const client = JSON.parse(sub.client_json);
    expect(client.consent).toEqual({ given: true, version: PRIVACY_VERSION });
    expect(client.screenshot).toMatchObject({ mime: "image/jpeg", bytes: shot.length, width: 1600, height: 900, thumbKey: `submissions/2026/10/${id}/screenshot.thumb.jpg` });

    const photos = k.app.repo.getPhotos(id);
    expect(photos.map((p) => p.n)).toEqual([1, 2]);
    expect(photos[0]).toMatchObject({ key: `submissions/2026/10/${id}/photo-1.jpg`, preview_key: `submissions/2026/10/${id}/photo-1.preview.jpg`, mime: "image/jpeg", bytes: photo1.length, width: 2000, height: 1500, taken_at: "2026-10-04T14:23:05+09:00" });
    expect(photos[0].lat).toBeCloseTo(38.9065, 6);
    expect(photos[0].lon).toBeCloseTo(141.5752, 6);
    expect(photos[0].heading).toBeCloseTo(120, 6);
    expect(photos[0].enu_x).toBeCloseTo((photos[0].lon - 141.575) * 86744, 9);
    expect(photos[0].enu_z).toBeCloseTo(-(photos[0].lat - 38.906) * 111014, 9);
    expect(JSON.parse(photos[0].exif_json)).toMatchObject({ make: "Acme", model: "Cam", focalLength35mm: 26, takenAtZone: "exif-offset", gps: { altM: 4.2 } });
    expect(photos[1]).toMatchObject({ key: `submissions/2026/10/${id}/photo-2.png`, mime: "image/png", bytes: photo2.length, width: 900, height: 600, lat: null, lon: null, enu_x: null, heading: null, taken_at: null });
  });
  test("files are stored privately under submissions/<yyyy>/<mm>/<id>/, originals byte for byte, previews EXIF-free", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const photo = await synthJpeg({ width: 2400, height: 1800, lat: 38.9065, lon: 141.5752, heading: 90, takenAt: "2026:10:04 14:23:05", offset: "+09:00" });
    const shot = await synthScreenshot({});
    const { body } = await k.submit(me, { photos: [photo], screenshot: shot });
    const dir = `submissions/2026/10/${body.id}`;
    expect((await k.app.storage.list()).map((f) => f.key)).toEqual([`${dir}/photo-1.jpg`, `${dir}/photo-1.preview.jpg`, `${dir}/screenshot.jpg`, `${dir}/screenshot.thumb.jpg`]);
    expect(await bytesOf(k, `${dir}/photo-1.jpg`)).toEqual(new Uint8Array(photo)); // the original, EXIF and all
    expect((await exifr.gps(await bytesOf(k, `${dir}/photo-1.jpg`))).latitude).toBeCloseTo(38.9065, 6);
    expect(await bytesOf(k, `${dir}/screenshot.jpg`)).toEqual(new Uint8Array(shot));
    const preview = await bytesOf(k, `${dir}/photo-1.preview.jpg`);
    const meta = await sharp(preview).metadata();
    expect([meta.width, meta.height]).toEqual([1280, 960]);
    expect(meta.exif).toBeUndefined();
    expect(await exifr.gps(preview).catch(() => undefined)).toBeUndefined();
    expect((await sharp(await bytesOf(k, `${dir}/screenshot.thumb.jpg`)).metadata()).width).toBe(360);
  });
  test("a PNG screenshot with the app's klc-pose chunk is accepted and stored as .png", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const png = addPngText(await synthPng({ width: 800, height: 450 }), "klc-pose", JSON.stringify({ enu: [1, 2, 3] }));
    const r = await k.submit(me, { screenshot: png });
    expect(r.status).toBe(201);
    expect(k.app.repo.getSubmission(r.body.id).screenshot_key).toEndWith("/screenshot.png");
    expect(JSON.parse(k.app.repo.getSubmission(r.body.id).client_json).screenshot.mime).toBe("image/png");
  });
  test("the client's declared type and file name are ignored: the bytes decide, and no client name is stored", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const fd = await k.form({});
    fd.append("photos", new File([await synthPng({ width: 300, height: 200 })], "../../etc/passwd.jpg", { type: "image/jpeg" }));
    fd.append("photos", new File([await synthWebp({ width: 300, height: 200 })], "evil<script>.png", { type: "text/html" }));
    const r = await k.call("POST", "/submissions", { token: me.token, form: fd });
    expect(r.status).toBe(201);
    const ph = k.app.repo.getPhotos(r.body.id);
    expect(ph.map((p) => [p.mime, p.key.split(".").pop()])).toEqual([["image/png", "png"], ["image/webp", "webp"]]);
    const dump = JSON.stringify(rows(k, "SELECT * FROM photos")) + JSON.stringify(rows(k, "SELECT * FROM submissions")) + JSON.stringify(await k.app.storage.list());
    for (const name of ["passwd", "evil", "script", "etc"]) expect(dump).not.toContain(name);
  });
  test("every accepted photo format works: JPEG, PNG, WebP and HEIC", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const r = await k.submit(me, { photos: [await synthJpeg(), await synthPng(), await synthWebp(), await synthHeic({ lat: 38.9, lon: 141.575 })] });
    expect(r.status).toBe(201);
    expect(k.app.repo.getPhotos(r.body.id).map((p) => p.mime)).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic"]);
  });
  test("an iPhone-style HEIC the server cannot decode keeps its original, has no preview, and still gives its GPS", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const heic = await synthHeic({ lat: 38.9065, lon: 141.5752, heading: 45, takenAt: "2026:10:03 09:10:11", offset: "+09:00", make: "Apple", model: "iPhone Synth" });
    const r = await k.submit(me, { photos: [heic] });
    expect(r.status).toBe(201);
    const [p] = k.app.repo.getPhotos(r.body.id);
    expect(p).toMatchObject({ mime: "image/heic", preview_key: null, width: null, height: null, bytes: heic.length, taken_at: "2026-10-03T09:10:11+09:00" });
    expect(p.lat).toBeCloseTo(38.9065, 6);
    expect(p.heading).toBe(45);
    expect(JSON.parse(p.exif_json).notes[0]).toContain("no-preview");
    expect(await bytesOf(k, p.key)).toEqual(new Uint8Array(heic));
    expect((await k.app.storage.list()).map((f) => f.key.split("/").pop())).not.toContain("photo-1.preview.jpg");
    expect(JSON.parse(k.app.repo.getSubmission(r.body.id).client_json).warnings).toEqual(["photo-1: no-preview"]);
  });
  test("a photo without GPS is accepted with empty position fields", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const r = await k.submit(me, { photos: [await synthJpeg({ noExif: true })] });
    expect(k.app.repo.getPhotos(r.body.id)[0]).toMatchObject({ lat: null, lon: null, enu_x: null, enu_z: null, heading: null, taken_at: null });
    expect(JSON.parse(k.app.repo.getPhotos(r.body.id)[0].exif_json)).toEqual({});
  });
  test("the photo field also goes by photos[] and photo; empty file parts (an unused file input) are ignored", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const fd = await k.form({});
    fd.append("photos[]", new File([await synthJpeg({ seed: 1 })], "a.jpg", { type: "image/jpeg" }));
    fd.append("photo", new File([await synthJpeg({ seed: 2 })], "b.jpg", { type: "image/jpeg" }));
    fd.append("photos", new File([], "", { type: "application/octet-stream" }));
    const r = await k.call("POST", "/submissions", { token: me.token, form: fd });
    expect(r.status).toBe(201);
    expect(r.body.photos).toBe(2);
  });
  test("it shows up in /me and in the admin queue as new", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Visible" });
    const { body } = await k.submit(me, { note: "see me" });
    expect((await k.call("GET", "/me", { token: me.token })).body.submissions[0]).toMatchObject({ id: body.id, status: "new", points: 0, note: "see me" });
    const list = await k.call("GET", "/admin/submissions?status=new", { admin: true });
    expect(list.body.items.map((i) => i.id)).toEqual([body.id]);
  });
});

describe("kind: issue or fix", () => {
  test("inferred when missing: a fix with at least one photo, otherwise an issue", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect((await k.submit(me, {})).body.kind).toBe("issue");
    expect((await k.submit(me, { photos: [await synthJpeg()] })).body.kind).toBe("fix");
  });
  test("explicit kinds win: an issue may carry photos as evidence; a fix needs at least one", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const a = await k.submit(me, { kind: "issue", photos: [await synthJpeg()] });
    expect([a.status, a.body.kind]).toEqual([201, "issue"]);
    const b = await k.submit(me, { kind: "fix", photos: [await synthJpeg()] });
    expect([b.status, b.body.kind]).toEqual([201, "fix"]);
    const c = await k.submit(me, { kind: "fix" });
    expect([c.status, c.body.error]).toEqual([400, "fix_needs_photos"]);
    const d = await k.submit(me, { kind: "bug" });
    expect([d.status, d.body.error]).toEqual([400, "invalid_kind"]);
    expect(rows(k, "SELECT kind FROM submissions ORDER BY created_at, id").map((r) => r.kind).sort()).toEqual(["fix", "issue"]);
  });
  test("accepting without points gives 5 for an issue and 20 for a fix; both are editable", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const issue = (await k.submit(me, { kind: "issue" })).body.id, fix = (await k.submit(me, { photos: [await synthJpeg()] })).body.id;
    expect((await k.review(issue, { status: "accepted" })).body.points).toBe(5);
    expect((await k.review(fix, { status: "accepted" })).body.points).toBe(20);
    expect((await k.review(fix, { status: "accepted", points: 33 })).body.points).toBe(33);
    const custom = makeApp({ config: { pointsIssue: 2, pointsFix: 50 } });
    const c = await custom.newContributor();
    const f = (await custom.submit(c, { photos: [await synthJpeg()] })).body.id;
    expect((await custom.review(f, { status: "accepted" })).body.points).toBe(50);
  });
});

describe("text fields", () => {
  test("consent=1 is required: missing, 0, false and empty are refused", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (const consent of [false, "0", "false", "", "no", "2"]) {
      const r = await k.submit(me, { consent });
      expect([consent, r.status, r.body.error]).toEqual([consent, 400, "consent_required"]);
    }
    for (const consent of ["1", "true", "on"]) expect((await k.submit(me, { consent })).status).toBe(201);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(3);
  });
  test("the category is one of the six; missing means other", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (const category of ["building", "road", "shop", "sign", "landmark", "other"]) expect((await k.submit(me, { category })).status).toBe(201);
    const bad = await k.submit(me, { category: "bridge" });
    expect([bad.status, bad.body.error]).toEqual([400, "invalid_category"]);
    const fd = await k.form({}); fd.delete("category");
    const r = await k.call("POST", "/submissions", { token: me.token, form: fd });
    expect(k.app.repo.getSubmission(r.body.id).category).toBe("other");
  });
  test("the note: at most 2,000 characters, control characters removed, CRLF folded, emoji counted once", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect((await k.submit(me, { note: "a".repeat(2000) })).status).toBe(201);
    expect((await k.submit(me, { note: "😀".repeat(2000) })).status).toBe(201);
    const over = await k.submit(me, { note: "a".repeat(2001) });
    expect([over.status, over.body.error]).toEqual([400, "note_too_long"]);
    const r = await k.submit(me, { note: " line1\r\nline2\u0000\u0007 " });
    expect(k.app.repo.getSubmission(r.body.id).note).toBe("line1\nline2");
  });
  test("lang is a language tag (or absent); an invalid one is refused", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect(k.app.repo.getSubmission((await k.submit(me, { lang: "JA" })).body.id).lang).toBe("ja");
    const bad = await k.submit(me, { lang: "japanese" });
    expect([bad.status, bad.body.error]).toEqual([400, "invalid_lang"]);
    const fd = await k.form({}); fd.delete("lang");
    expect(k.app.repo.getSubmission((await k.call("POST", "/submissions", { token: me.token, form: fd })).body.id).lang).toBeNull();
  });
  test("the pose is validated and normalised; a missing pose is allowed", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const stored = async (pose) => { const r = await k.submit(me, { pose }); return [r.status, r.status === 201 ? JSON.parse(k.app.repo.getSubmission(r.body.id).pose_json) : r.body.error]; };
    const [st1, p1] = await stored({ latlon: [38.9065, 141.5752], heading: 370, pitch: -90.00000000000001 });
    expect(st1).toBe(201);
    expect(p1.heading).toBe(10);
    expect(p1.pitch).toBe(-90);
    expect(p1.enu[0]).toBeCloseTo(latLonToEnu(38.9065, 141.5752).x, 9); // enu computed from latlon
    expect(await stored("{not json")).toEqual([400, "invalid_pose"]);
    expect(await stored({ heading: 1 })).toEqual([400, "invalid_pose"]);
    expect(await stored({ enu: [1, 2, 3], fov: 0 })).toEqual([400, "invalid_pose"]);
    expect(await stored({ enu: [1e9, 0, 0] })).toEqual([400, "invalid_pose"]);
    const none = await k.submit(me, { pose: false });
    expect(none.status).toBe(201);
    expect(k.app.repo.getSubmission(none.body.id).pose_json).toBeNull();
  });
  test("a submission needs something: a note, a screenshot or a photo", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const empty = await k.submit(me, { note: "", screenshot: false });
    expect([empty.status, empty.body.error]).toEqual([400, "empty_submission"]);
    expect((await k.submit(me, { note: "only a note", screenshot: false, pose: false })).status).toBe(201);
    expect((await k.submit(me, { note: "", screenshot: await synthScreenshot({ width: 400, height: 300 }) })).status).toBe(201);
    expect((await k.submit(me, { note: "", screenshot: false, photos: [await synthJpeg()] })).status).toBe(201);
  });
  test("text fields may arrive as JSON blobs too (a form built from files)", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const fd = await k.form({ pose: false });
    fd.set("pose", new Blob([JSON.stringify({ enu: [5, 1, 5] })], { type: "application/json" }));
    const r = await k.call("POST", "/submissions", { token: me.token, form: fd });
    expect(r.status).toBe(201);
    expect(JSON.parse(k.app.repo.getSubmission(r.body.id).pose_json).enu).toEqual([5, 1, 5]);
  });
});

describe("files are checked by their bytes and their size", () => {
  const code = async (k, me, f) => { const r = await k.submit(me, f); return [r.status, r.body.error]; };
  test("magic bytes: anything that is not a JPEG, PNG, WebP or HEIC is a 415 naming the file", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const fakes = {
      html: text("<!doctype html><script>alert(1)</script>".padEnd(64)), svg: text('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
      gif: Uint8Array.from([...text("GIF89a"), ...new Array(60).fill(0)]), pdf: text("%PDF-1.7\n".padEnd(80, "x")), exe: Uint8Array.from([0x4d, 0x5a, ...new Array(80).fill(1)]),
      text: text("just some text, not an image at all, long enough to pass any size check"),
    };
    for (const [name, bytes] of Object.entries(fakes)) {
      const r = await k.submit(me, { photos: [await synthJpeg(), bytes], photoTypes: ["image/jpeg", "image/jpeg"] });
      expect([name, r.status, r.body.error]).toEqual([name, 415, "invalid_image"]);
      expect(r.body).toMatchObject({ field: "photos", index: 1 });
    }
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
    expect(await k.app.storage.list()).toEqual([]); // nothing was stored for a refused submission
  });
  test("an image-looking file that cannot be decoded is a 415 unreadable_image: bad JPEG body, decompression bomb, junk HEIC", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (const [name, bytes] of [["fake jpeg", notAnImage({ fakeJpeg: true })], ["png bomb", synthPngBomb(30000, 30000)], ["junk heic", junkHeic()]]) {
      const r = await k.submit(me, { photos: [bytes] });
      expect([name, r.status, r.body.error]).toEqual([name, 415, "unreadable_image"]);
    }
    expect(await k.app.storage.list()).toEqual([]);
  });
  test("the screenshot must be a PNG or JPEG", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    for (const [name, bytes] of [["webp", await synthWebp()], ["heic", await synthHeic()], ["html", text("<html>".padEnd(64))], ["gif", Uint8Array.from([...text("GIF89a"), ...new Array(60).fill(0)])]]) {
      const r = await k.submit(me, { screenshot: bytes });
      expect([name, r.status, r.body.error, r.body.field]).toEqual([name, 415, "invalid_image", "screenshot"]);
    }
    expect((await code(k, me, { screenshot: notAnImage({ fakeJpeg: true }) }))).toEqual([415, "unreadable_image"]);
    expect((await code(k, me, { screenshot: await synthScreenshot({ png: true }) }))[0]).toBe(201);
  });
  test("at most MAX_PHOTOS photos, at most MAX_PHOTO_MB each, at most MAX_SHOT_MB for the screenshot (413)", async () => {
    const k = makeApp({ config: { maxPhotos: 2, maxPhotoMb: 0.1, maxShotMb: 0.1 } });
    const me = await k.newContributor();
    const limit = Math.floor(0.1 * 1024 * 1024);
    const small = await synthJpeg({ width: 200, height: 150 });
    expect(small.length).toBeLessThan(limit);
    expect((await code(k, me, { photos: [small, small] }))[0]).toBe(201);
    const many = await k.submit(me, { photos: [small, small, small] });
    expect([many.status, many.body.error, many.body.max]).toEqual([400, "too_many_photos", 2]);
    // trailing bytes after the JPEG end marker are ignored by decoders: a valid image that is simply too big
    const bigPhoto = Buffer.concat([small, Buffer.alloc(limit)]);
    const bp = await k.submit(me, { photos: [small, bigPhoto] });
    expect([bp.status, bp.body.error, bp.body.index, bp.body.max]).toEqual([413, "photo_too_large", 1, limit]);
    const bigShot = Buffer.concat([await synthScreenshot({ width: 800, height: 450 }), Buffer.alloc(limit)]);
    const bs = await k.submit(me, { screenshot: bigShot });
    expect([bs.status, bs.body.error, bs.body.max]).toEqual([413, "screenshot_too_large", limit]);
    const exact = Buffer.concat([small, Buffer.alloc(limit - small.length)]);
    expect(exact.length).toBe(limit);
    expect((await k.submit(me, { photos: [exact] })).status).toBe(201); // exactly at the limit is allowed
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(2);
  });
  test("the default limits are the spec's: 6 photos, 15 MB, 8 MB", () => {
    const k = makeApp();
    expect(k.cfg.maxPhotos).toBe(6);
    expect(k.cfg.maxPhotoBytes).toBe(15 * 1024 * 1024);
    expect(k.cfg.maxShotBytes).toBe(8 * 1024 * 1024);
  });
  test("a seventh photo is refused with the default limit", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const tiny = await synthJpeg({ width: 40, height: 30 });
    expect((await k.submit(me, { photos: Array(6).fill(tiny) })).status).toBe(201);
    expect((await code(k, me, { photos: Array(7).fill(tiny) }))).toEqual([400, "too_many_photos"]);
  });
  test("two screenshots are refused", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const fd = await k.form({});
    fd.append("screenshot", new File([await synthScreenshot({ width: 400, height: 300 })], "again.jpg", { type: "image/jpeg" }));
    const r = await k.call("POST", "/submissions", { token: me.token, form: fd });
    expect([r.status, r.body.error]).toEqual([400, "invalid_screenshot"]);
  });
});

describe("the request itself", () => {
  test("it needs a contributor token; the admin token and a banned contributor are refused", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    expect((await k.call("POST", "/submissions", { form: await k.form({}) })).status).toBe(401);
    expect((await k.call("POST", "/submissions", { admin: true, form: await k.form({}) })).status).toBe(401);
    await k.call("POST", `/admin/contributors/${me.id}`, { admin: true, json: { banned: true } });
    const r = await k.submit(me, {});
    expect([r.status, r.body.error]).toEqual([403, "banned"]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
  });
  test("only multipart/form-data is accepted; a broken body is a 400", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const post = (o) => k.call("POST", "/submissions", { token: me.token, ...o });
    expect((await post({ json: { note: "x" } })).status).toBe(415);
    expect((await post({ raw: "note=x", headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(415);
    expect((await post({ raw: "x", headers: { "content-type": "multipart/form-data" } })).status).toBe(415); // no boundary
    const garbage = await post({ raw: "this is not multipart at all", headers: { "content-type": "multipart/form-data; boundary=XYZ" } });
    expect([400, 201]).toContain(garbage.status);
    if (garbage.status === 400) expect(garbage.body.error).toMatch(/invalid_multipart|consent_required/);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
  });
  test("a body larger than the limit is a 413: by Content-Length, or counted as it streams when the header is absent or false", async () => {
    const k = makeApp({ config: { maxPhotos: 1, maxPhotoMb: 0.1, maxShotMb: 0.1 } });
    const me = await k.newContributor();
    const ct = "multipart/form-data; boundary=XYZ";
    const declared = await k.call("POST", "/submissions", { token: me.token, raw: "x", headers: { "content-type": ct, "content-length": String(50 * 1024 * 1024) } });
    expect([declared.status, declared.body.error]).toEqual([413, "payload_too_large"]);
    const limit = k.cfg.maxBodyBytes;
    expect(limit).toBeLessThan(2 * 1024 * 1024);
    const big = new Uint8Array(limit + 4096).fill(65);
    const chunked = await k.call("POST", "/submissions", { token: me.token, raw: new ReadableStream({ start(c) { for (let i = 0; i < big.length; i += 65536) c.enqueue(big.subarray(i, i + 65536)); c.close(); } }), headers: { "content-type": ct } });
    expect([chunked.status, chunked.body.error]).toEqual([413, "payload_too_large"]);
    const lying = await k.call("POST", "/submissions", { token: me.token, raw: big, headers: { "content-type": ct, "content-length": "10" } });
    expect([lying.status === 413 || lying.status === 400]).toEqual([true]);
  });
  test("a form made of a hundred thousand tiny parts is refused before it is parsed", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const body = text("--XYZ\r\nContent-Disposition: form-data; name=a\r\n\r\n1\r\n".repeat(20000) + "--XYZ--\r\n");
    const r = await k.call("POST", "/submissions", { token: me.token, raw: body, headers: { "content-type": "multipart/form-data; boundary=XYZ" } });
    expect([r.status, r.body.error]).toEqual([400, "too_many_parts"]);
  });
  test("concurrent uploads from different people are all processed (queued behind the gate), each with its own id", async () => {
    const k = makeApp({ config: { maxConcurrentUploads: 1 } });
    const people = await Promise.all(Array.from({ length: 6 }, (_, i) => k.newContributor({}, { ip: `198.51.100.${i + 1}` })));
    const photo = await synthJpeg({ width: 1200, height: 900, lat: 38.9, lon: 141.5 });
    const results = await Promise.all(people.map((p, i) => k.submit(p, { note: `parallel ${i}`, photos: [photo] }, { ip: `198.51.100.${i + 1}` })));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(new Set(results.map((r) => r.body.id)).size).toBe(6);
    expect(rows(k, "SELECT COUNT(*) AS n FROM photos")[0].n).toBe(6);
    expect((await k.app.storage.list()).length).toBe(6 * 4);
    expect(k.app.gates.bodyBudget.active).toBe(0); // every reservation was given back
    expect(k.app.gates.processGate.active).toBe(0);
    expect(k.app.gates.uploads.byUser.size).toBe(0);
    expect(k.app.gates.uploads.byIp.size).toBe(0);
  });
});

describe("all or nothing", () => {
  /** A disk storage whose put() fails from the Nth call on. */
  const flaky = (k, failFrom) => {
    const real = k.app.storage.put.bind(k.app.storage);
    let n = 0;
    k.app.storage.put = async (...a) => { if (++n >= failFrom) throw new Error("disk full"); return real(...a); };
    return () => { k.app.storage.put = real; };
  };
  test("a storage failure part-way removes the files already written and creates no rows (500)", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    flaky(k, 3);
    const r = await k.submit(me, { photos: [await synthJpeg({ lat: 38.9, lon: 141.5 }), await synthJpeg({ seed: 3 })] });
    expect([r.status, r.body.error]).toEqual([500, "internal"]);
    expect(await k.app.storage.list()).toEqual([]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(0);
    expect(rows(k, "SELECT COUNT(*) AS n FROM photos")[0].n).toBe(0);
    expect(k.lines.join("")).not.toContain("disk full");
  });
  test("losing the race for the last daily slot removes the files and says 429", async () => {
    const k = makeApp({ config: { dailyLimit: 1 } });
    const me = await k.newContributor();
    // pass the early quota check, then fill the slot before the insert transaction (what a parallel request would do)
    const real = k.app.repo.insertSubmission.bind(k.app.repo);
    k.app.repo.insertSubmission = (a) => { real({ ...a, sub: { ...a.sub, id: "racewinner0000000" }, photos: [], quota: null }); return real(a); };
    const r = await k.submit(me, { photos: [await synthJpeg()] });
    expect([r.status, r.body.error]).toEqual([429, "daily_limit"]);
    expect(await k.app.storage.list()).toEqual([]);
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(1);
  });
  test("a refused submission leaves nothing behind and does not use up the daily allowance", async () => {
    const k = makeApp({ config: { dailyLimit: 2 } });
    const me = await k.newContributor();
    for (let i = 0; i < 5; i++) expect((await k.submit(me, { consent: false })).status).toBe(400);
    expect((await k.submit(me, {})).status).toBe(201);
    expect((await k.submit(me, {})).status).toBe(201);
    expect((await k.submit(me, {})).status).toBe(429);
  });
});

describe("retries and quotas", () => {
  test("an Idempotency-Key makes a retried upload return the original instead of a duplicate", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const key = "retry-0001-abcdef";
    const first = await k.submit(me, { note: "once" }, { headers: { "idempotency-key": key } });
    expect(first.status).toBe(201);
    const again = await k.submit(me, { note: "once" }, { headers: { "idempotency-key": key } });
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(again.body).toMatchObject({ id: first.body.id, status: "new", replayed: true });
    expect(rows(k, "SELECT COUNT(*) AS n FROM submissions")[0].n).toBe(1);
    const other = await k.newContributor();
    expect((await k.submit(other, { note: "same key, other person" }, { headers: { "idempotency-key": key } })).status).toBe(201); // keys are per contributor
    const bad = await k.submit(me, {}, { headers: { "idempotency-key": "short" } });
    expect([bad.status, bad.body.error]).toEqual([400, "invalid_idempotency_key"]);
  });
  test("20 submissions per contributor per day (rolling), then 429 with Retry-After until the oldest ages out", async () => {
    const k = makeApp(); // the default DAILY_LIMIT is 20
    const me = await k.newContributor();
    for (let i = 0; i < 20; i++) { expect((await k.submit(me, { note: `n${i}` })).status).toBe(201); k.clock.advance(1000); }
    const r = await k.submit(me, {});
    expect([r.status, r.body.error]).toEqual([429, "daily_limit"]);
    expect(Number(r.headers.get("retry-after"))).toBe(86400 - 20); // the first of the twenty ages out in 24 h minus the 20 s elapsed
    k.clock.advance(86400_000 - 20_000 + 1);
    expect((await k.submit(me, {})).status).toBe(201);
    expect((await k.submit(me, {})).status).toBe(429);
  });
  test("the daily limit is per contributor: someone else on another network is unaffected", async () => {
    const k = makeApp({ config: { dailyLimit: 2 } });
    const [a, b] = [await k.newContributor(), await k.newContributor()];
    await k.submit(a, {}); await k.submit(a, {});
    expect((await k.submit(a, {})).status).toBe(429);
    expect((await k.submit(b, {}, { ip: "198.51.100.5" })).status).toBe(201);
  });
  test("60 submissions per network per day (three times DAILY_LIMIT by default): accounts cannot be farmed from one IP", async () => {
    const k = makeApp({ config: { dailyLimit: 1 } }); // IP limit 3
    const people = [];
    for (let i = 0; i < 4; i++) people.push(await k.newContributor());
    for (let i = 0; i < 3; i++) expect((await k.submit(people[i], {})).status).toBe(201);
    const r = await k.submit(people[3], {});
    expect([r.status, r.body.error]).toEqual([429, "daily_limit"]);
    expect((await k.submit(people[3], {}, { ip: "198.51.100.77" })).status).toBe(201); // a different network
    expect(makeApp().cfg.ipDailyLimit).toBe(60);
  });
  test("upload attempts are limited per network even when they fail", async () => {
    const k = makeApp({ config: { submitAttemptsPerHour: 5 } });
    const me = await k.newContributor();
    for (let i = 0; i < 5; i++) expect((await k.submit(me, { consent: false })).status).toBe(400);
    const r = await k.submit(me, {});
    expect([r.status, r.body.error]).toEqual([429, "rate_limited"]);
    k.clock.advance(3600_001);
    expect((await k.submit(me, {})).status).toBe(201);
  });
});

describe("privacy of what is stored", () => {
  test("no IP address, token or raw header is stored; the user agent is bounded and stripped", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Private" });
    const r = await k.submit(me, {}, { ip: "203.0.113.200", headers: { "user-agent": "Mozilla/5.0 (iPhone)\t " + "x".repeat(400), referer: "https://secret.example/path?token=1", "x-forwarded-for": "9.9.9.9" } });
    expect(r.status).toBe(201);
    const client = JSON.parse(k.app.repo.getSubmission(r.body.id).client_json);
    expect(client.ua.length).toBeLessThanOrEqual(200);
    expect(client.ua).not.toMatch(/[\u0000-\u001F]/);
    const dump = JSON.stringify(rows(k, "SELECT * FROM submissions")) + JSON.stringify(rows(k, "SELECT * FROM contributors")) + JSON.stringify(rows(k, "SELECT * FROM audit"));
    for (const needle of ["203.0.113.200", "9.9.9.9", "secret.example", me.token.split(".")[1]]) expect(dump).not.toContain(needle);
  });
  test("the consent text version is recorded with every submission", async () => {
    const k = makeApp();
    const me = await k.newContributor();
    const r = await k.submit(me, {});
    expect(JSON.parse(k.app.repo.getSubmission(r.body.id).client_json).consent.version).toBe(PRIVACY_VERSION);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("the request log has the route and status, and none of the content", async () => {
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Logged Name", crewNo: "12345678901234" });
    await k.submit(me, { note: "a very private note" , photos: [await synthJpeg({ lat: 38.9065, lon: 141.5752 })] }, { ip: "203.0.113.55" });
    const logged = k.lines.join("\n");
    expect(logged).toContain("submissions.create");
    expect(logged).toContain("submission.created");
    for (const needle of ["Logged Name", "12345678901234", "very private note", "203.0.113.55", me.token, "38.9065", "141.5752"]) expect(logged).not.toContain(needle);
  });
});

describe("S3 storage mode", () => {
  /** An in-memory S3 stand-in with Bun's S3Client shape. */
  const fakeS3 = () => {
    const objects = new Map();
    const noKey = () => Object.assign(new Error("NoSuchKey"), { code: "NoSuchKey" });
    return {
      objects,
      file: (key) => ({
        async write(data, opts) { objects.set(key, { bytes: Buffer.from(data), type: opts?.type }); },
        async stat() { const o = objects.get(key); if (!o) throw noKey(); return { size: o.bytes.length }; },
        stream() { return new Response(objects.get(key).bytes).body; },
        async exists() { return objects.has(key); },
        async delete() { if (!objects.has(key)) throw noKey(); objects.delete(key); },
      }),
      async list({ prefix = "" } = {}) { return { contents: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: objects.get(key).bytes.length })), isTruncated: false }; },
    };
  };
  test("submit, admin file streaming and erasure work the same with STORAGE=s3", async () => {
    const s3 = fakeS3();
    const k = makeApp({ s3Client: s3, config: { storage: "s3", s3Bucket: "klc", s3Region: "ap-northeast-1", awsAccessKeyId: "AKIAEXAMPLE", awsSecretAccessKey: "secret-example" } });
    expect(k.app.storage.kind).toBe("s3");
    expect((await k.call("GET", "/health")).body.storage).toBe("s3");
    const me = await k.newContributor();
    const photo = await synthJpeg({ lat: 38.9, lon: 141.5 });
    const r = await k.submit(me, { photos: [photo] });
    expect(r.status).toBe(201);
    expect(s3.objects.size).toBe(4);
    expect([...s3.objects.values()].find((o) => o.type === "image/jpeg")).toBeTruthy();
    const key = `submissions/2026/10/${r.body.id}/photo-1.jpg`;
    const file = await k.call("GET", `${API}/admin/files/${key}`, { admin: true });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(file.body)).toEqual(new Uint8Array(photo));
    await k.call("DELETE", "/me?confirm=1", { token: me.token });
    expect(s3.objects.size).toBe(0);
  });
});
