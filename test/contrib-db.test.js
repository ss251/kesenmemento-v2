// Contributor backend: the SQLite schema, its migrations and the repository (all SQL).
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, migrate, MIGRATIONS, SCHEMA_VERSION } from "../server/contrib/db.js";
import { createRepo, toMine, toAdminListItem, toAdminDetail, toFeedItem, fileUrl, FILES_PATH } from "../server/contrib/repo.js";
import { maskCrewNo } from "../server/contrib/validate.js";

const cols = (db, table) => db.query(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const T = (day, hh = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00.000Z`;

/** A fresh in-memory database + repository with helpers to seed rows. */
function setup() {
  const db = openDb(":memory:");
  const repo = createRepo(db);
  let n = 0;
  const contributor = (over = {}) => {
    const id = over.id ?? `contrib${String(++n).padStart(4, "0")}`;
    repo.createContributor({ id, secretHash: "h".repeat(64), nickname: over.nickname ?? `Nick${n}`, crewNo: over.crewNo ?? null, nowIso: over.at ?? T(1) });
    if (over.banned) repo.setBanned(id, true);
    return id;
  };
  let s = 0;
  const submission = (contributorId, over = {}) => {
    const id = over.id ?? `sub${String(++s).padStart(6, "0")}xx`;
    const photos = (over.photos ?? []).map((p, i) => ({ id: `ph${s}${i}xxxx`, n: i + 1, key: `submissions/2026/10/${id}/photo-${i + 1}.jpg`, previewKey: p.noPreview ? null : `submissions/2026/10/${id}/photo-${i + 1}.preview.jpg`, mime: "image/jpeg", bytes: 1000, width: 640, height: 480, exifJson: JSON.stringify(p.exif ?? {}), lat: p.lat ?? null, lon: p.lon ?? null, enuX: p.enuX ?? null, enuZ: p.enuZ ?? null, takenAt: null, heading: null }));
    const client = { screenshot: { mime: "image/jpeg", bytes: 100, width: 1600, height: 900, thumbKey: `submissions/2026/10/${id}/screenshot.thumb.jpg` }, ...(over.idem ? { idem: over.idem } : {}) };
    const r = repo.insertSubmission({
      sub: { id, contributorId, createdAt: over.at ?? T(2), kind: over.kind ?? (photos.length ? "fix" : "issue"), category: over.category ?? "sign", note: over.note ?? "note", lang: "ja", poseJson: over.pose === undefined ? JSON.stringify({ enu: [1, 2, 3], latlon: [38.9, 141.5] }) : over.pose, screenshotKey: over.noShot ? null : `submissions/2026/10/${id}/screenshot.jpg`, clientJson: JSON.stringify(client) },
      photos, quota: over.quota,
    });
    return { id, r };
  };
  const review = (id, over = {}) => repo.review(id, { status: "accepted", points: null, reviewerNote: undefined, version: null, nowIso: T(5), defaultPoints: { issue: 5, fix: 20 }, ...over });
  return { db, repo, contributor, submission, review };
}

describe("schema and migrations", () => {
  test("a fresh database has the spec's tables and columns, plus kind, used_version/used_at, device tokens and transfer codes", () => {
    const { db } = setup();
    expect(db.query("PRAGMA user_version").get().user_version).toBe(SCHEMA_VERSION);
    expect(cols(db, "contributors")).toEqual(["id", "secret_hash", "nickname", "crew_no", "created_at", "last_seen", "banned"]);
    const sub = cols(db, "submissions");
    for (const c of ["id", "contributor_id", "created_at", "status", "category", "note", "lang", "pose_json", "screenshot_key", "client_json", "points", "reviewer_note", "reviewed_at"]) expect(sub).toContain(c);
    for (const c of ["kind", "used_version", "used_at"]) expect(sub).toContain(c);
    expect(cols(db, "photos")).toEqual(["id", "submission_id", "n", "key", "preview_key", "mime", "bytes", "width", "height", "exif_json", "lat", "lon", "enu_x", "enu_z", "taken_at", "heading"]);
    expect(cols(db, "audit")).toEqual(["id", "at", "actor", "action", "target", "detail"]);
    expect(cols(db, "contributor_tokens")).toEqual(["id", "contributor_id", "secret_hash", "created_at"]);
    expect(cols(db, "transfer_codes")).toEqual(["code_hash", "contributor_id", "created_at", "expires_at", "used_at"]);
    expect(cols(db, "pending_deletes")).toEqual(["key", "queued_at", "attempts", "last_error"]);
    expect(SCHEMA_VERSION).toBe(2);
  });
  test("a version-1 database is upgraded in place: the idempotency key becomes unique (a duplicate keeps the earliest), the delete queue appears, data survives", () => {
    const db = new Database(":memory:");
    db.exec(MIGRATIONS[0].sql);
    db.exec("PRAGMA user_version = 1");
    db.exec("PRAGMA foreign_keys = ON");
    const ins = (id, cid, idem) => db.query("INSERT INTO submissions (id, contributor_id, created_at, note, client_json) VALUES (?, ?, 'x', ?, ?)").run(id, cid, `note ${id}`, idem ? JSON.stringify({ idem, ua: "kept" }) : "{}");
    db.query("INSERT INTO contributors (id, secret_hash, nickname, created_at) VALUES ('c1', 'h', 'n1', 'x'), ('c2', 'h', 'n2', 'x')").run();
    ins("a1", "c1", "dup-key-0001"); ins("a2", "c1", "dup-key-0001"); ins("a3", "c1", "dup-key-0001"); // duplicates, possible in a version-1 database (no unique index)
    ins("b1", "c2", "dup-key-0001"); // same key, other contributor: fine
    ins("a4", "c1", null);
    expect(() => db.query("SELECT 1 FROM pending_deletes").get()).toThrow();
    expect(migrate(db)).toBe(1);
    expect(db.query("PRAGMA user_version").get().user_version).toBe(2);
    const idem = (id) => JSON.parse(db.query("SELECT client_json FROM submissions WHERE id = ?").get(id).client_json).idem;
    expect([idem("a1"), idem("a2"), idem("a3"), idem("b1"), idem("a4")]).toEqual(["dup-key-0001", undefined, undefined, "dup-key-0001", undefined]);
    expect(JSON.parse(db.query("SELECT client_json FROM submissions WHERE id = 'a2'").get().client_json).ua).toBe("kept"); // only the key was removed
    expect(db.query("SELECT COUNT(*) AS n FROM submissions").get().n).toBe(5); // no row was lost
    expect(() => ins("a5", "c1", "dup-key-0001")).toThrow(/UNIQUE/);
    ins("a6", "c1", "other-key-0002");
    expect(db.query("SELECT COUNT(*) AS n FROM pending_deletes").get().n).toBe(0);
    expect(migrate(db)).toBe(0);
  });
  test("migrations run once, in order, and are idempotent", () => {
    const db = new Database(":memory:");
    expect(db.query("PRAGMA user_version").get().user_version).toBe(0);
    expect(migrate(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toBe(0);
    expect(MIGRATIONS.map((m) => m.version)).toEqual([...MIGRATIONS.keys()].map((i) => i + 1));
  });
  test("a file database uses WAL with foreign keys on, and reopening keeps the data", () => {
    const dir = mkdtempSync(join(tmpdir(), "contrib-db-"));
    const path = join(dir, "sub", "contrib.db");
    const db = openDb(path);
    expect(db.query("PRAGMA journal_mode").get().journal_mode).toBe("wal");
    expect(db.query("PRAGMA foreign_keys").get().foreign_keys).toBe(1);
    createRepo(db).createContributor({ id: "persist01", secretHash: "h".repeat(64), nickname: "Kept", crewNo: null, nowIso: T(1) });
    db.close();
    const again = openDb(path);
    expect(createRepo(again).getContributor("persist01").nickname).toBe("Kept");
    again.close();
  });
  test("a database written by a newer service is refused rather than used with old code", () => {
    const dir = mkdtempSync(join(tmpdir(), "contrib-db-"));
    const path = join(dir, "c.db");
    const raw = new Database(path, { create: true });
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    raw.close();
    expect(() => openDb(path)).toThrow(/newer than this service/);
  });
  test("constraints: status values, crew number shape, banned flag, points and photo order", () => {
    const { db } = setup();
    const ins = (sql, ...p) => db.query(sql).run(...p);
    ins("INSERT INTO contributors (id, secret_hash, nickname, crew_no, created_at) VALUES ('a', 'h', 'n', '12345678901234', 'x')");
    ins("INSERT INTO contributors (id, secret_hash, nickname, crew_no, created_at) VALUES ('b', 'h', 'n', NULL, 'x')");
    for (const bad of ["1234567890123", "123456789012345", "1234567890123x", "１２３４５６７８９０１２３４"]) {
      expect(() => ins("INSERT INTO contributors (id, secret_hash, nickname, crew_no, created_at) VALUES (?, 'h', 'n', ?, 'x')", `c${bad.length}`, bad)).toThrow();
    }
    expect(() => ins("INSERT INTO contributors (id, secret_hash, nickname, created_at, banned) VALUES ('d', 'h', 'n', 'x', 2)")).toThrow();
    expect(() => ins("INSERT INTO submissions (id, contributor_id, created_at, status) VALUES ('s1', 'a', 'x', 'pending')")).toThrow();
    expect(() => ins("INSERT INTO submissions (id, contributor_id, created_at, points) VALUES ('s2', 'a', 'x', -1)")).toThrow();
    expect(() => ins("INSERT INTO submissions (id, contributor_id, created_at) VALUES ('s3', 'nobody', 'x')")).toThrow(); // foreign key
    ins("INSERT INTO submissions (id, contributor_id, created_at) VALUES ('s4', 'a', 'x')");
    ins("INSERT INTO photos (id, submission_id, n, key, mime, bytes) VALUES ('p1', 's4', 1, 'k', 'image/jpeg', 1)");
    expect(() => ins("INSERT INTO photos (id, submission_id, n, key, mime, bytes) VALUES ('p2', 's4', 1, 'k2', 'image/jpeg', 1)")).toThrow(); // (submission, n) unique
  });
  test("deleting a contributor cascades to everything they own (foreign keys are on)", () => {
    const { db } = setup();
    db.query("INSERT INTO contributors (id, secret_hash, nickname, created_at) VALUES ('a', 'h', 'n', 'x')").run();
    db.query("INSERT INTO contributor_tokens (contributor_id, secret_hash, created_at) VALUES ('a', 'h', 'x')").run();
    db.query("INSERT INTO transfer_codes (code_hash, contributor_id, created_at, expires_at) VALUES ('c', 'a', 'x', 'y')").run();
    db.query("INSERT INTO submissions (id, contributor_id, created_at) VALUES ('s', 'a', 'x')").run();
    db.query("INSERT INTO photos (id, submission_id, n, key, mime, bytes) VALUES ('p', 's', 1, 'k', 'm', 1)").run();
    db.query("DELETE FROM contributors WHERE id = 'a'").run();
    for (const t of ["contributor_tokens", "transfer_codes", "submissions", "photos"]) expect(db.query(`SELECT COUNT(*) AS n FROM ${t}`).get().n).toBe(0);
  });
});

describe("contributors, tokens and transfer codes", () => {
  test("create, read, partial profile updates (undefined leaves a field, null crewNo removes it), ban, last seen", () => {
    const { repo, contributor } = setup();
    const id = contributor({ nickname: "Sakura", crewNo: "12345678901234" });
    expect(repo.getContributor(id)).toMatchObject({ nickname: "Sakura", crew_no: "12345678901234", banned: 0, last_seen: T(1) });
    repo.updateProfile(id, { nickname: "Hanako" });
    expect(repo.getContributor(id)).toMatchObject({ nickname: "Hanako", crew_no: "12345678901234" });
    repo.updateProfile(id, { crewNo: null });
    expect(repo.getContributor(id).crew_no).toBeNull();
    repo.updateProfile(id, {});
    repo.updateProfile(id, { crewNo: "00001111222233" });
    expect(repo.getContributor(id).crew_no).toBe("00001111222233");
    repo.setBanned(id, true);
    expect(repo.getContributor(id).banned).toBe(1);
    repo.setBanned(id, false);
    expect(repo.getContributor(id).banned).toBe(0);
    repo.touchSeen(id, T(9));
    expect(repo.getContributor(id).last_seen).toBe(T(9));
    expect(repo.getContributor("nobody")).toBeNull();
  });
  test("device tokens: the first token lives on the contributor row, later ones in contributor_tokens", () => {
    const { repo, contributor } = setup();
    const id = contributor();
    expect(repo.extraTokenHashes(id)).toEqual([]);
    expect(repo.countDeviceTokens(id)).toBe(1);
    repo.addDeviceToken(id, "second".padEnd(64, "0"), T(3));
    repo.addDeviceToken(id, "third".padEnd(64, "0"), T(4));
    expect(repo.extraTokenHashes(id)).toEqual(["second".padEnd(64, "0"), "third".padEnd(64, "0")]);
    expect(repo.countDeviceTokens(id)).toBe(3);
  });
  test("a transfer code is single-use, expires at its time, and a new code replaces the unused old one", () => {
    const { repo, contributor } = setup();
    const id = contributor();
    repo.createTransferCode({ contributorId: id, codeHash: "code-one", nowIso: T(1, 10), expiresIso: T(1, 11) });
    expect(repo.peekTransferCode("code-one", T(1, 10))).toBe(id);
    expect(repo.peekTransferCode("code-one", T(1, 11))).toBeNull(); // expires_at is exclusive
    expect(repo.peekTransferCode("nope", T(1, 10))).toBeNull();
    expect(repo.consumeTransferCode("code-one", T(1, 10))).toBe(id);
    expect(repo.consumeTransferCode("code-one", T(1, 10))).toBeNull(); // already used
    expect(repo.peekTransferCode("code-one", T(1, 10))).toBeNull();
    repo.createTransferCode({ contributorId: id, codeHash: "code-two", nowIso: T(1, 10), expiresIso: T(1, 11) });
    repo.createTransferCode({ contributorId: id, codeHash: "code-three", nowIso: T(1, 10), expiresIso: T(1, 11) });
    expect(repo.peekTransferCode("code-two", T(1, 10))).toBeNull(); // replaced
    expect(repo.peekTransferCode("code-three", T(1, 10))).toBe(id);
    expect(repo.consumeTransferCode("code-three", T(1, 12))).toBeNull(); // expired
  });
  test("creating a code sweeps expired ones", () => {
    const { repo, db, contributor } = setup();
    const a = contributor(), b = contributor();
    repo.createTransferCode({ contributorId: a, codeHash: "old", nowIso: T(1), expiresIso: T(1, 11) });
    repo.createTransferCode({ contributorId: b, codeHash: "new", nowIso: T(2), expiresIso: T(2, 11) });
    expect(db.query("SELECT code_hash FROM transfer_codes").all().map((r) => r.code_hash)).toEqual(["new"]);
  });
});

describe("submissions", () => {
  test("insert with photos, read back, list a contributor's own newest first with photo counts", () => {
    const { repo, contributor, submission } = setup();
    const c = contributor();
    const a = submission(c, { at: T(2), photos: [{ lat: 38.9, lon: 141.5 }, {}] });
    const b = submission(c, { at: T(3), photos: [] });
    expect(a.r).toEqual({ ok: true });
    const mine = repo.listMine(c);
    expect(mine.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(mine.map((r) => r.photo_count)).toEqual([0, 2]);
    expect(repo.getPhotos(a.id).map((p) => p.n)).toEqual([1, 2]);
    expect(toMine(mine[1])).toEqual({ id: a.id, createdAt: T(2), status: "new", kind: "fix", category: "sign", note: "note", points: 0, photos: 2, reviewedAt: null, usedVersion: null, usedAt: null });
    expect(toMine(mine[1])).not.toHaveProperty("reviewerNote");
  });
  test("the daily quota is re-checked inside the insert transaction: the row is not written past the limit", () => {
    const { repo, contributor, submission } = setup();
    const c = contributor();
    const quota = { sinceIso: T(1, 0), limit: 2 };
    expect(submission(c, { at: T(2), quota }).r.ok).toBe(true);
    expect(submission(c, { at: T(2, 11), quota }).r.ok).toBe(true);
    const third = submission(c, { at: T(2, 12), quota });
    expect(third.r).toEqual({ ok: false, reason: "quota" });
    expect(repo.getSubmission(third.id)).toBeNull();
    expect(repo.countSince(c, T(1, 0))).toBe(2);
    expect(repo.countSince(c, T(2, 10))).toBe(1); // strictly after
    expect(repo.oldestSince(c, T(1, 0))).toBe(T(2));
    expect(repo.oldestSince(c, T(30))).toBeNull();
  });
  test("a failing photo insert rolls the whole submission back", () => {
    const { repo, contributor, submission } = setup();
    const c = contributor();
    const id = "dupphoto01xx";
    expect(() => repo.insertSubmission({
      sub: { id, contributorId: c, createdAt: T(2), kind: "fix", category: "sign", note: "", lang: null, poseJson: null, screenshotKey: null, clientJson: null },
      photos: [1, 2].map(() => ({ id: "same-photo-id", n: 1, key: "k", previewKey: null, mime: "image/jpeg", bytes: 1, width: null, height: null, exifJson: "{}", lat: null, lon: null, enuX: null, enuZ: null, takenAt: null, heading: null })),
    })).toThrow();
    expect(repo.getSubmission(id)).toBeNull();
    expect(submission(c).r.ok).toBe(true);
  });
  test("an idempotency key finds the earlier submission of the same contributor only", () => {
    const { repo, contributor, submission } = setup();
    const a = contributor(), b = contributor();
    const s = submission(a, { idem: "retry-key-0001" });
    expect(repo.findByIdempotencyKey(a, "retry-key-0001").id).toBe(s.id);
    expect(repo.findByIdempotencyKey(b, "retry-key-0001")).toBeNull();
    expect(repo.findByIdempotencyKey(a, "other-key-0002")).toBeNull();
  });
  test("keyKnown knows screenshots, thumbnails, originals and previews, and nothing else", () => {
    const { repo, contributor, submission } = setup();
    const s = submission(contributor(), { photos: [{}] });
    for (const f of ["screenshot.jpg", "screenshot.thumb.jpg", "photo-1.jpg", "photo-1.preview.jpg"]) expect(repo.keyKnown(`submissions/2026/10/${s.id}/${f}`)).toBe(true);
    for (const f of ["photo-2.jpg", "screenshot.png", "../x.jpg"]) expect(repo.keyKnown(`submissions/2026/10/${s.id}/${f}`)).toBe(false);
    expect(repo.keyKnown("submissions/2026/10/otherid1234/photo-1.jpg")).toBe(false);
  });
});

describe("review rules", () => {
  test("accepting without points uses the kind's default (5 issue, 20 fix); explicit points win, including 0", () => {
    const { repo, contributor, submission, review } = setup();
    const c = contributor();
    const issue = submission(c, { kind: "issue" }), fix = submission(c, { photos: [{}] });
    expect(review(issue.id).after).toMatchObject({ status: "accepted", points: 5 });
    expect(review(fix.id).after).toMatchObject({ status: "accepted", points: 20 });
    expect(review(fix.id, { points: 35 }).after.points).toBe(35);
    expect(review(fix.id, { points: 0 }).after.points).toBe(0);
    expect(repo.pointsOf(c)).toEqual({ points: 5, accepted: 2 });
  });
  test("re-reviewing keeps the points already awarded unless new ones are given; rejecting and resetting zero them", () => {
    const { contributor, submission, review } = setup();
    const s = submission(contributor(), { photos: [{}] });
    review(s.id, { points: 40 });
    expect(review(s.id, { status: "accepted" }).after.points).toBe(40);
    expect(review(s.id, { status: "used", version: "v1" }).after.points).toBe(40);
    expect(review(s.id, { status: "rejected", points: 99 }).after.points).toBe(0);
    expect(review(s.id, { status: "accepted" }).after.points).toBe(20); // back to the default after a rejection
    expect(review(s.id, { status: "new" }).after).toMatchObject({ points: 0, reviewed_at: null });
  });
  test("reviewed_at is the first decision in the current class: editing points or marking used does not move it", () => {
    const { contributor, submission, review } = setup();
    const s = submission(contributor());
    expect(review(s.id, { nowIso: T(5) }).after.reviewed_at).toBe(T(5));
    expect(review(s.id, { nowIso: T(6), points: 8 }).after.reviewed_at).toBe(T(5)); // points edited
    expect(review(s.id, { nowIso: T(7), status: "used", version: "v1" }).after.reviewed_at).toBe(T(5)); // marked used
    expect(review(s.id, { nowIso: T(8), status: "accepted" }).after.reviewed_at).toBe(T(5)); // back from used
    expect(review(s.id, { nowIso: T(9), status: "rejected" }).after.reviewed_at).toBe(T(9)); // a different decision
    expect(review(s.id, { nowIso: T(10), status: "rejected", reviewerNote: "dup" }).after.reviewed_at).toBe(T(9));
    expect(review(s.id, { nowIso: T(11), status: "accepted" }).after.reviewed_at).toBe(T(11));
    expect(review(s.id, { nowIso: T(12), status: "new" }).after.reviewed_at).toBeNull();
    expect(review(s.id, { nowIso: T(13), status: "used", version: "v2" }).after.reviewed_at).toBe(T(13)); // new -> used decides now
  });
  test("used carries the release: version and used_at are set on entering used, kept on re-save, replaced by a new version, cleared on leaving", () => {
    const { contributor, submission, review } = setup();
    const s = submission(contributor());
    review(s.id, { nowIso: T(5) });
    expect(review(s.id, { status: "used", version: "v0.5.0", nowIso: T(6) }).after).toMatchObject({ status: "used", used_version: "v0.5.0", used_at: T(6) });
    expect(review(s.id, { status: "used", nowIso: T(7), reviewerNote: "n" }).after).toMatchObject({ used_version: "v0.5.0", used_at: T(6) }); // no version given: kept
    expect(review(s.id, { status: "used", version: "v0.5.0", nowIso: T(8) }).after.used_at).toBe(T(6)); // same version: unchanged
    expect(review(s.id, { status: "used", version: "v0.6.0", nowIso: T(9) }).after).toMatchObject({ used_version: "v0.6.0", used_at: T(9) });
    expect(review(s.id, { status: "accepted", nowIso: T(10) }).after).toMatchObject({ used_version: null, used_at: null });
    expect(review(s.id, { status: "used", nowIso: T(11) }).after).toMatchObject({ used_version: null, used_at: T(11) }); // used without a version
  });
  test("the reviewer note is kept when omitted, replaced when given, and cleared by an empty string", () => {
    const { contributor, submission, review } = setup();
    const s = submission(contributor());
    expect(review(s.id, { reviewerNote: "first" }).after.reviewer_note).toBe("first");
    expect(review(s.id, {}).after.reviewer_note).toBe("first");
    expect(review(s.id, { reviewerNote: "second" }).after.reviewer_note).toBe("second");
    expect(review(s.id, { reviewerNote: "" }).after.reviewer_note).toBeNull();
  });
  test("reviewing a missing submission returns null and the before row is returned for the audit trail", () => {
    const { contributor, submission, review } = setup();
    expect(review("nosuchsub")).toBeNull();
    const s = submission(contributor());
    const r = review(s.id);
    expect(r.before.status).toBe("new");
    expect(r.after.status).toBe("accepted");
  });
});

describe("marking releases (bulk)", () => {
  test("only accepted items become used; the rest are reported with a reason", () => {
    const { repo, contributor, submission, review } = setup();
    const c = contributor();
    const [a, b, newOne, rej, usedSame, usedOther] = Array.from({ length: 6 }, () => submission(c).id);
    review(a); review(b); review(rej, { status: "rejected" });
    review(usedSame, { status: "used", version: "v1" });
    review(usedOther, { status: "used", version: "v0" });
    const r = repo.markUsed([a, b, newOne, rej, usedSame, usedOther, "ghost12345"], "v1", T(8));
    expect(r.updated).toEqual([a, b]);
    expect(r.skipped).toEqual([{ id: newOne, reason: "not_accepted" }, { id: rej, reason: "not_accepted" }, { id: usedSame, reason: "unchanged" }, { id: usedOther, reason: "already_used" }]);
    expect(r.notFound).toEqual(["ghost12345"]);
    expect(repo.getSubmission(a)).toMatchObject({ status: "used", used_version: "v1", used_at: T(8) });
    expect(repo.getSubmission(usedOther).used_version).toBe("v0"); // never overwritten in bulk
    expect(repo.getSubmission(a).reviewed_at).toBe(T(5)); // the decision time is unchanged
  });
});

describe("leaderboard and points", () => {
  test("ranked by points, then accepted count, then who was accepted first; banned contributors and unaccepted work are left out", () => {
    const { repo, contributor, submission, review } = setup();
    const ana = contributor({ nickname: "Ana" }), ben = contributor({ nickname: "Ben" }), cho = contributor({ nickname: "Cho" }), dan = contributor({ nickname: "Dan" }), eve = contributor({ nickname: "Eve", banned: true }), fay = contributor({ nickname: "Fay" });
    const acc = (c, points, at) => { const s = submission(c); review(s.id, { points, nowIso: at }); return s; };
    acc(ana, 10, T(5)); acc(ana, 10, T(6)); // 20 / 2
    acc(ben, 20, T(7)); // 20 / 1
    acc(cho, 20, T(4)); // 20 / 1, earlier than Ben
    acc(dan, 5, T(5));
    acc(eve, 999, T(5)); // banned
    const rejected = submission(fay); review(rejected.id, { status: "rejected", nowIso: T(5) });
    submission(fay); // new
    expect(repo.leaderboard(20)).toEqual([
      { nickname: "Ana", accepted: 2, points: 20 },
      { nickname: "Cho", accepted: 1, points: 20 },
      { nickname: "Ben", accepted: 1, points: 20 },
      { nickname: "Dan", accepted: 1, points: 5 },
    ]);
    expect(repo.leaderboard(2).map((r) => r.nickname)).toEqual(["Ana", "Cho"]);
    expect([ana, cho, ben, dan].map((c) => repo.rankOf(c))).toEqual([1, 2, 3, 4]);
    expect(repo.rankOf(eve)).toBeNull();
    expect(repo.rankOf(fay)).toBeNull();
    expect(Object.keys(repo.leaderboard(1)[0]).sort()).toEqual(["accepted", "nickname", "points"]); // never a crew number
  });
  test("used submissions keep earning: points total = accepted + used", () => {
    const { repo, contributor, submission, review } = setup();
    const c = contributor();
    review(submission(c).id, { points: 10 });
    review(submission(c).id, { status: "used", points: 15, version: "v1" });
    review(submission(c).id, { status: "rejected" });
    expect(repo.pointsOf(c)).toEqual({ points: 25, accepted: 2 });
    expect(repo.pointsOf(contributor())).toEqual({ points: 0, accepted: 0 });
  });
});

describe("the crew-number export", () => {
  test("accepted and used submissions in the reviewed range, per クルーNo.; banned and number-less contributors are excluded", () => {
    const { repo, contributor, submission, review } = setup();
    const a = contributor({ nickname: "A", crewNo: "11111111111111" }), b = contributor({ nickname: "B", crewNo: "22222222222222" }), none = contributor({ nickname: "None" }), banned = contributor({ nickname: "Bad", crewNo: "33333333333333", banned: true });
    const acc = (c, points, at, status = "accepted") => review(submission(c).id, { points, nowIso: at, status });
    acc(a, 10, T(5)); acc(a, 5, T(6), "used"); acc(a, 100, T(20)); // the last one is out of range
    acc(b, 7, T(5));
    acc(none, 50, T(5)); acc(banned, 50, T(5));
    review(submission(b).id, { status: "rejected", nowIso: T(5) });
    submission(b); // still new
    const rows = repo.crewExport({ fromIso: T(5, 0), toIso: T(7, 0) });
    expect(rows).toEqual([{ crewNo: "11111111111111", nickname: "A", points: 15, accepted: 2 }, { crewNo: "22222222222222", nickname: "B", points: 7, accepted: 1 }]);
    expect(repo.crewExport({ fromIso: null, toIso: null }).map((r) => [r.crewNo, r.points])).toEqual([["11111111111111", 115], ["22222222222222", 7]]);
    expect(repo.crewExport({ fromIso: T(6, 0), toIso: T(7, 0) }).map((r) => r.crewNo)).toEqual(["11111111111111"]);
    expect(repo.crewExport({ fromIso: T(5, 10), toIso: T(5, 11) })).toHaveLength(2); // from is inclusive
    expect(repo.crewExport({ fromIso: T(5, 0), toIso: T(5, 10) })).toHaveLength(0); // to is exclusive
  });
  test("two accounts that entered the same number are merged: one row, points added, the stronger account's nickname", () => {
    const { repo, contributor, submission, review } = setup();
    const small = contributor({ nickname: "Phone", crewNo: "44444444444444", at: T(1) }), big = contributor({ nickname: "Laptop", crewNo: "44444444444444", at: T(2) });
    review(submission(small).id, { points: 5, nowIso: T(5) });
    review(submission(big).id, { points: 30, nowIso: T(5) });
    review(submission(big).id, { points: 10, nowIso: T(5) });
    expect(repo.crewExport({ fromIso: null, toIso: null })).toEqual([{ crewNo: "44444444444444", nickname: "Laptop", points: 45, accepted: 3 }]);
  });
  test("rows are ordered by points, then accepted count, then number", () => {
    const { repo, contributor, submission, review } = setup();
    const mk = (no, pts, count) => { const c = contributor({ crewNo: no }); for (let i = 0; i < count; i++) review(submission(c).id, { points: pts / count, nowIso: T(5) }); };
    mk("30000000000000", 10, 1); mk("10000000000000", 10, 1); mk("20000000000000", 10, 2); mk("40000000000000", 50, 1);
    expect(repo.crewExport({ fromIso: null, toIso: null }).map((r) => r.crewNo)).toEqual(["40000000000000", "20000000000000", "10000000000000", "30000000000000"]);
  });
});

describe("admin list, detail and feed", () => {
  function seed() {
    const ctx = setup();
    const { contributor, submission, review } = ctx;
    const sakura = contributor({ nickname: "Sakura_100%", crewNo: "12345678901234" }), taro = contributor({ nickname: "Taro" });
    const s1 = submission(sakura, { at: T(2), kind: "issue", category: "sign", note: "看板の文字が違う" });
    const s2 = submission(sakura, { at: T(3), photos: [{ lat: 38.9065, lon: 141.5752, enuX: 17.3, enuZ: -55.5, exif: { make: "Acme" } }, {}], category: "building", note: "roof 100% wrong" });
    const s3 = submission(taro, { at: T(4), kind: "issue", category: "road", note: "plain note", pose: JSON.stringify({ enu: [5, 1, 5], latlon: [38.9, 141.57] }) });
    const s4 = submission(taro, { at: T(5), kind: "issue", category: "road", note: "no location", pose: null, noShot: true });
    review(s2.id, { points: 30, nowIso: T(6) });
    return { ...ctx, sakura, taro, s1, s2, s3, s4 };
  }
  test("filters by status, kind, category and contributor, newest first by default, oldest first on request, with a total for paging", () => {
    const { repo, s1, s2, s3, s4, taro } = seed();
    const list = (o = {}) => repo.listAdmin({ limit: 50, offset: 0, sort: "newest", ...o });
    expect(list().rows.map((r) => r.id)).toEqual([s4.id, s3.id, s2.id, s1.id]);
    expect(list({ sort: "oldest" }).rows.map((r) => r.id)).toEqual([s1.id, s2.id, s3.id, s4.id]);
    expect(list({ status: "new" }).total).toBe(3);
    expect(list({ status: "accepted" }).rows.map((r) => r.id)).toEqual([s2.id]);
    expect(list({ kind: "fix" }).rows.map((r) => r.id)).toEqual([s2.id]);
    expect(list({ category: "road" }).total).toBe(2);
    expect(list({ contributorId: taro }).total).toBe(2);
    expect(list({ status: "new", kind: "issue", category: "road" }).rows.map((r) => r.id)).toEqual([s4.id, s3.id]);
    const page = list({ limit: 2, offset: 1 });
    expect(page.rows.map((r) => r.id)).toEqual([s3.id, s2.id]);
    expect(page.total).toBe(4);
  });
  test("free-text search matches an id prefix, a nickname or the note; % and _ are literal, not wildcards", () => {
    const { repo, s1, s2, s3, s4 } = seed();
    const q = (text) => repo.listAdmin({ q: text, limit: 50, offset: 0, sort: "newest" }).rows.map((r) => r.id).sort();
    expect(q(s1.id.slice(0, 9))).toEqual([s1.id]); // an id prefix (the seeded ids share their first characters)
    expect(q("taro")).toEqual([s3.id, s4.id].sort());
    expect(q("看板")).toEqual([s1.id]);
    expect(q("100%")).toEqual([s1.id, s2.id].sort()); // "Sakura_100%" nickname and "roof 100% wrong" note
    expect(q("%")).toEqual([s1.id, s2.id].sort()); // a bare % matches only literal percent signs
    expect(q("_")).toEqual([s1.id, s2.id].sort()); // only the underscore of "Sakura_100%"
    expect(q("zzz-nothing")).toEqual([]);
  });
  test("list items carry the contributor, photo count, a thumbnail link and the best location (photo GPS, else the pose)", () => {
    const { repo, s1, s2, s3, s4 } = seed();
    const items = Object.fromEntries(repo.listAdmin({ limit: 50, offset: 0, sort: "newest" }).rows.map(toAdminListItem).map((i) => [i.id, i]));
    expect(items[s2.id]).toMatchObject({ photoCount: 2, status: "accepted", points: 30, kind: "fix", hasScreenshot: true, location: { lat: 38.9065, lon: 141.5752, source: "photo" }, contributor: { nickname: "Sakura_100%", banned: false } });
    expect(items[s2.id].thumbUrl).toBe(`${FILES_PATH}submissions/2026/10/${s2.id}/screenshot.thumb.jpg`);
    expect(items[s3.id].location).toEqual({ lat: 38.9, lon: 141.57, source: "pose" });
    expect(items[s4.id]).toMatchObject({ location: null, hasScreenshot: false, thumbUrl: null });
    expect(items[s1.id].location).toEqual({ lat: 38.9, lon: 141.5, source: "pose" });
  });
  test("the detail has pose, client info, photos with EXIF and ENU, and the contributor with a masked crew number and totals", () => {
    const { repo, s2, sakura } = seed();
    const d = toAdminDetail(repo.getAdminDetail(s2.id), maskCrewNo);
    expect(d).toMatchObject({ id: s2.id, status: "accepted", kind: "fix", points: 30, pose: { enu: [1, 2, 3] } });
    expect(d.photos[0]).toMatchObject({ n: 1, lat: 38.9065, lon: 141.5752, enu: { x: 17.3, z: -55.5 }, exif: { make: "Acme" }, url: fileUrl(`submissions/2026/10/${s2.id}/photo-1.jpg`) });
    expect(d.photos[1].enu).toBeNull();
    expect(d.screenshot).toMatchObject({ mime: "image/jpeg", width: 1600, url: fileUrl(`submissions/2026/10/${s2.id}/screenshot.jpg`) });
    expect(d.contributor).toEqual({ id: sakura, nickname: "Sakura_100%", banned: false, createdAt: T(1), lastSeen: T(1), hasCrewNo: true, crewNoMasked: "••••••••••1234", submissions: 2, accepted: 1, points: 30 });
    expect(JSON.stringify(d)).not.toContain("12345678901234"); // the full number never appears in the admin detail
    expect(repo.getAdminDetail("missing")).toBeNull();
  });
  test("the pipeline feed filters by status and review range, includes photos and never the crew number", () => {
    const { repo, s1, s2 } = seed();
    const all = repo.feed({ status: null, fromIso: null, toIso: null }).map(toFeedItem);
    expect(all).toHaveLength(4);
    const acc = repo.feed({ status: "accepted", fromIso: T(6, 0), toIso: T(7, 0) }).map(toFeedItem);
    expect(acc.map((i) => i.id)).toEqual([s2.id]);
    expect(acc[0].photos).toHaveLength(2);
    expect(acc[0].contributor).toEqual({ id: expect.any(String), nickname: "Sakura_100%" });
    expect(JSON.stringify(acc)).not.toContain("12345678901234");
    expect(repo.feed({ status: "accepted", fromIso: T(7, 0), toIso: null })).toEqual([]);
    expect(repo.feed({ status: "new", fromIso: null, toIso: null }).map((r) => r.submission.id)).not.toContain(s2.id);
    expect(repo.feed({ status: "new", fromIso: null, toIso: null }).map((r) => r.submission.id)).toContain(s1.id);
  });
});

describe("deleting data (privacy)", () => {
  test("deleting a submission removes its rows and returns every storage key to delete", () => {
    const { repo, db, contributor, submission } = setup();
    const c = contributor();
    const s = submission(c, { photos: [{}, { noPreview: true }] });
    const other = submission(c);
    const r = repo.deleteSubmission(s.id);
    expect(r.deleted).toBe(true);
    expect(r.keys.sort()).toEqual([
      `submissions/2026/10/${s.id}/photo-1.jpg`, `submissions/2026/10/${s.id}/photo-1.preview.jpg`, `submissions/2026/10/${s.id}/photo-2.jpg`,
      `submissions/2026/10/${s.id}/screenshot.jpg`, `submissions/2026/10/${s.id}/screenshot.thumb.jpg`,
    ].sort());
    expect(repo.getSubmission(s.id)).toBeNull();
    expect(db.query("SELECT COUNT(*) AS n FROM photos").get().n).toBe(0);
    expect(repo.getSubmission(other.id)).not.toBeNull();
    expect(repo.deleteSubmission(s.id)).toEqual({ deleted: false, keys: [] });
  });
  test("erasing a contributor removes their submissions, photos, tokens and codes, and nobody else's", () => {
    const { repo, db, contributor, submission } = setup();
    const a = contributor(), b = contributor();
    const sa1 = submission(a, { photos: [{}] }), sa2 = submission(a), sb = submission(b, { photos: [{}] });
    repo.addDeviceToken(a, "t".repeat(64), T(2));
    repo.createTransferCode({ contributorId: a, codeHash: "c", nowIso: T(2), expiresIso: T(3) });
    const r = repo.deleteContributor(a);
    expect(r.deleted).toBe(true);
    expect(r.keys.length).toBe(6); // sa1: screenshot, thumb, photo, preview; sa2: screenshot, thumb
    expect(sa1.id).not.toBe(sa2.id);
    expect(repo.getContributor(a)).toBeNull();
    expect(repo.getSubmission(sa1.id)).toBeNull();
    expect(repo.getContributor(b)).not.toBeNull();
    expect(repo.getSubmission(sb.id)).not.toBeNull();
    expect(db.query("SELECT COUNT(*) AS n FROM contributor_tokens").get().n).toBe(0);
    expect(db.query("SELECT COUNT(*) AS n FROM transfer_codes").get().n).toBe(0);
    expect(db.query("SELECT COUNT(*) AS n FROM photos").get().n).toBe(1);
    expect(repo.deleteContributor(a)).toEqual({ deleted: false, keys: [] });
  });
});

describe("upload volume, the delete queue and device tokens", () => {
  test("bytesSince sums the request bytes of a contributor's stored submissions inside the window", () => {
    const { repo, db, contributor, submission } = setup();
    const a = contributor(), b = contributor();
    const s1 = submission(a, { at: T(2) }), s2 = submission(a, { at: T(3) }), s3 = submission(b, { at: T(3) });
    const setBytes = (id, n) => db.query("UPDATE submissions SET client_json = json_set(client_json, '$.bodyBytes', ?) WHERE id = ?").run(n, id);
    setBytes(s1.id, 1000); setBytes(s2.id, 2500); setBytes(s3.id, 70000);
    expect(repo.bytesSince(a, T(1))).toBe(3500);
    expect(repo.bytesSince(a, T(2))).toBe(2500); // strictly after
    expect(repo.bytesSince(b, T(1))).toBe(70000);
    expect(repo.bytesSince(contributor(), T(1))).toBe(0);
    db.query("UPDATE submissions SET client_json = '{}' WHERE id = ?").run(s1.id); // an old row without the field counts as zero
    expect(repo.bytesSince(a, T(1))).toBe(2500);
  });
  test("deleting a submission or a contributor queues their file keys in the same transaction; the queue can be listed, counted, retried and cleared", () => {
    const { repo, db, contributor, submission } = setup();
    const c = contributor();
    const s = submission(c, { photos: [{}] });
    const r = repo.deleteSubmission(s.id, T(7));
    expect(r.keys).toHaveLength(4);
    expect(repo.pendingDeletes().map((x) => [x.key, x.queued_at, x.attempts])).toEqual(r.keys.slice().sort().map((k) => [k, T(7), 0]));
    expect(repo.pendingDeleteCount()).toBe(4);
    repo.queueDeletes(r.keys, T(9)); // idempotent: the original queue time stays
    expect(repo.pendingDeleteCount()).toBe(4);
    expect(repo.pendingDeletes()[0].queued_at).toBe(T(7));
    repo.notePendingFailure(r.keys[0], "EIO: something long".padEnd(300, "x"), T(8));
    repo.notePendingFailure(r.keys[0], "EBUSY", T(8));
    const failed = repo.pendingDeletes().find((x) => x.key === r.keys[0]);
    expect([failed.attempts, failed.last_error]).toEqual([2, "EBUSY"]);
    repo.notePendingFailure("never/queued/before.jpg", "x".repeat(500), T(8)); // a failure for an unqueued key queues it, with a bounded reason
    expect(repo.pendingDeletes(10).find((x) => x.key === "never/queued/before.jpg").last_error).toHaveLength(120);
    repo.clearPending(r.keys);
    expect(repo.pendingDeletes().map((x) => x.key)).toEqual(["never/queued/before.jpg"]);
    // a contributor's whole erasure queues everything they had
    const other = contributor();
    const s2 = submission(other, {}), s3 = submission(other, { photos: [{}, {}] });
    const e = repo.deleteContributor(other, T(10));
    expect(e.keys).toHaveLength(2 + 6);
    for (const k of e.keys) expect(db.query("SELECT 1 AS x FROM pending_deletes WHERE key = ?").get(k)).not.toBeNull();
    expect(s2.id).not.toBe(s3.id);
  });
  test("keepOnlyToken leaves one credential: the kept hash (which becomes the contributor's own), no device tokens, no open transfer code", () => {
    const { repo, contributor } = setup();
    const id = contributor();
    repo.addDeviceToken(id, "second".padEnd(64, "0"), T(2));
    repo.addDeviceToken(id, "third".padEnd(64, "0"), T(3));
    repo.createTransferCode({ contributorId: id, codeHash: "open", nowIso: T(3), expiresIso: T(4) });
    expect(repo.keepOnlyToken(id, "second".padEnd(64, "0"))).toBe(2); // the contributor's own first token and the third
    expect(repo.getContributor(id).secret_hash).toBe("second".padEnd(64, "0"));
    expect(repo.extraTokenHashes(id)).toEqual([]);
    expect(repo.peekTransferCode("open", T(3))).toBeNull();
    expect(repo.keepOnlyToken(id, "second".padEnd(64, "0"))).toBe(0);
    expect(repo.countDeviceTokens(id)).toBe(1);
  });
});

describe("stats and audit", () => {
  test("counts per status, new items per kind, contributors, banned, photos and crew numbers", () => {
    const { repo, contributor, submission, review } = setup();
    const a = contributor({ crewNo: "11111111111111" }), b = contributor({ banned: true });
    submission(a, { kind: "issue" }); submission(a, { photos: [{}, {}] });
    const acc = submission(b); review(acc.id); review(submission(b).id, { status: "rejected" });
    expect(repo.stats()).toEqual({ byStatus: { new: 2, accepted: 1, used: 0, rejected: 1 }, newByKind: { issue: 1, fix: 1 }, contributors: 2, banned: 1, photos: 2, withCrewNo: 1 });
  });
  test("the audit trail lists newest first, with JSON detail, and pages", () => {
    const { repo } = setup();
    repo.audit({ at: T(1), actor: "admin:Aki", action: "submission.review", target: "s1", detail: { from: "new", to: "accepted" } });
    repo.audit({ at: T(2), actor: "admin", action: "export.crew" });
    repo.audit({ at: T(3), actor: "contributor", action: "contributor.self_delete", target: "c1", detail: { files: 3 } });
    const page = repo.listAudit({ limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.action)).toEqual(["contributor.self_delete", "export.crew"]);
    expect(JSON.parse(page.rows[0].detail)).toEqual({ files: 3 });
    expect(page.rows[1].detail).toBeNull();
    expect(repo.listAudit({ limit: 2, offset: 2 }).rows.map((r) => r.action)).toEqual(["submission.review"]);
  });
  test("ping answers", () => {
    expect(setup().repo.ping()).toBe(true);
  });
});
